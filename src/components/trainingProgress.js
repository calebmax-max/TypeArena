// trainingProgress.js
//
// Two layers, on purpose:
//   1. localStorage (this file, client-side) - fast, offline-friendly,
//      remembers exactly where THIS user is so closing the browser and
//      coming back tomorrow picks up where they left off.
//   2. POST /api/training-events (server-side, see app_backend.py) - every
//      attempt, pass or fail, also gets sent up so progress is visible in
//      aggregate across every user, not just invisible in 100 browsers.
//
// If the network call fails (offline, flaky connection), the attempt is
// queued and retried the next time anything in Training happens, so a
// dropped connection never silently loses an event.

const STORAGE_KEY = 'typearena_training_progress_v1';
const RETRY_QUEUE_KEY = 'typearena_training_event_queue_v1';

// Adjust this to whatever key your app already stores its bearer token
// under (see _get_user_from_header / Authorization: Bearer <token> in
// app_backend.py). This file only reads it - login/logout elsewhere is
// still the source of truth for the token itself.
const AUTH_TOKEN_STORAGE_KEY = 'authToken';

// Same-origin by default so this works whether the frontend is served by
// the Flask app directly or from a separate static host with a proxy.
// Override by setting window.TYPEARENA_API_BASE_URL before this loads.
function apiBaseUrl() {
  return (typeof window !== 'undefined' && window.TYPEARENA_API_BASE_URL) || '';
}

function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable (private browsing, etc.) - progress just
    // won't persist across reloads for this session. Not fatal.
  }
}

function defaultProgress() {
  return {
    placementDone: false,
    currentLessonId: null,
    // lessonId -> { attempts, passCount, bestWpm, bestAccuracy }
    lessons: {},
    updatedAt: new Date().toISOString(),
  };
}

export function loadProgress() {
  return readJson(STORAGE_KEY, defaultProgress());
}

function saveProgress(progress) {
  writeJson(STORAGE_KEY, { ...progress, updatedAt: new Date().toISOString() });
}

function lessonState(progress, lessonId) {
  return progress.lessons[lessonId] || { attempts: 0, passCount: 0, bestWpm: 0, bestAccuracy: 0 };
}

export function isLessonPassed(progress, lesson) {
  const state = lessonState(progress, lesson.id);
  const required = lesson.requiredPasses || 1;
  return state.passCount >= required;
}

export function isLessonUnlocked(progress, lesson, lessonSequence) {
  const idx = lessonSequence.findIndex((l) => l.id === lesson.id);
  if (idx <= 0) return true; // first lesson is always unlocked
  const previous = lessonSequence[idx - 1];
  return isLessonPassed(progress, previous);
}

// --- Server sync -----------------------------------------------------------

function queueEvent(event) {
  const queue = readJson(RETRY_QUEUE_KEY, []);
  queue.push(event);
  writeJson(RETRY_QUEUE_KEY, queue);
}

async function postEvent(event) {
  const token = getAuthToken();
  if (!token) {
    // Not signed in - can't attribute the event to a user server-side.
    // Local progress still works; the server just never hears about it.
    return false;
  }
  const response = await fetch(`${apiBaseUrl()}/api/training-events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(event),
  });
  return response.ok;
}

// Call this opportunistically (e.g. on app load, or after any successful
// event) to flush anything that failed to send earlier.
export async function flushQueuedTrainingEvents() {
  const queue = readJson(RETRY_QUEUE_KEY, []);
  if (queue.length === 0) return;
  const remaining = [];
  for (const event of queue) {
    try {
      const ok = await postEvent(event);
      if (!ok) remaining.push(event);
    } catch {
      remaining.push(event);
    }
  }
  writeJson(RETRY_QUEUE_KEY, remaining);
}

async function sendTrainingEvent(event) {
  try {
    const ok = await postEvent(event);
    if (!ok) queueEvent(event);
  } catch {
    queueEvent(event);
  }
  // Best-effort: try to clear any older backlog at the same time.
  flushQueuedTrainingEvents();
}

// --- Public API used by the lesson runner / placement test -----------------

/**
 * Record one lesson attempt: updates local progress immediately (so the UI
 * can react without waiting on the network) and sends the event to the
 * backend for aggregate analytics.
 */
export function recordAttempt({ lesson, wpm, accuracy, passed }) {
  const progress = loadProgress();
  const prev = lessonState(progress, lesson.id);
  const next = {
    attempts: prev.attempts + 1,
    passCount: prev.passCount + (passed ? 1 : 0),
    bestWpm: Math.max(prev.bestWpm, wpm),
    bestAccuracy: Math.max(prev.bestAccuracy, accuracy),
  };
  progress.lessons[lesson.id] = next;
  saveProgress(progress);

  sendTrainingEvent({
    lessonId: lesson.id,
    unitId: lesson.unitId,
    wpm: Math.round(wpm * 10) / 10,
    accuracy: Math.round(accuracy * 10) / 10,
    passed: Boolean(passed),
  });

  return next;
}

export function setCurrentLesson(lessonId) {
  const progress = loadProgress();
  progress.currentLessonId = lessonId;
  saveProgress(progress);
}

export function getCurrentLessonId(lessonSequence) {
  const progress = loadProgress();
  const saved = progress.currentLessonId;
  if (saved && lessonSequence.some((lesson) => lesson.id === saved)) return saved;
  if (saved) {
    // The saved lesson no longer exists (the curriculum changed). Carry on from
    // the first lesson not yet passed, or the last lesson if everything is passed.
    const firstOpen = lessonSequence.find((lesson) => !isLessonPassed(progress, lesson));
    return (firstOpen || lessonSequence[lessonSequence.length - 1])?.id || null;
  }
  return lessonSequence[0]?.id || null;
}

/**
 * Applied once, right after the placement test. Marks every lesson up to
 * (but not including) `startLessonId` as already passed - the learner
 * qualified past them, so they shouldn't have to grind through fundamentals
 * they've already demonstrated - and drops them into `startLessonId` as the
 * one they actually need to attempt next.
 */
export function applyPlacement(startLessonId, lessonSequence) {
  const progress = loadProgress();
  const startIdx = lessonSequence.findIndex((l) => l.id === startLessonId);
  lessonSequence.forEach((lesson, idx) => {
    if (idx < startIdx) {
      const required = lesson.requiredPasses || 1;
      progress.lessons[lesson.id] = {
        attempts: required,
        passCount: required,
        bestWpm: progress.lessons[lesson.id]?.bestWpm || 0,
        bestAccuracy: progress.lessons[lesson.id]?.bestAccuracy || 0,
      };
    }
  });
  progress.placementDone = true;
  progress.currentLessonId = startLessonId;
  saveProgress(progress);
}

export function isPlacementDone() {
  return loadProgress().placementDone;
}

export function resetProgress() {
  writeJson(STORAGE_KEY, defaultProgress());
}
// Typing engine utilities for WPM/accuracy calculation, and the
// instrumentation (keystroke log, blur tracker, paste guard) the race
// component needs to feed the backend's server-authoritative scoring.
//
// IMPORTANT: the numbers computed here are for INSTANT LOCAL UI FEEDBACK
// ONLY (Phase 2 "instant client UI" in the anti-cheat plan). The backend
// (/api/races/start + /api/races/submit, and the live-race heartbeat/submit
// endpoints) independently recomputes WPM/accuracy from the replayed
// typedText and never trusts these client-side numbers for payouts or
// leaderboard stats. Keep using these for the live "WPM: 87" readout while
// racing, but always submit typedText/keystrokeLog and let the server's
// response be the number you display as the final result.

// --- Official WPM formula (mirrors backend _compute_official_wpm) ---
//
//   WPM = ((totalCharactersTyped / 5) - uncorrectedErrors) / minutesElapsed
//
// "Every 5 characters (including spaces and symbols) counts as one word",
// and each uncorrected error subtracts a full word-equivalent per the
// error/time penalty in the spec.

export const countUncorrectedErrors = (originalText, typedText) => {
  const original = originalText || '';
  const typed = typedText || '';
  const compareLength = Math.min(original.length, typed.length);
  let errors = 0;
  for (let i = 0; i < compareLength; i++) {
    if (typed[i] !== original[i]) errors++;
  }
  // Characters typed past the end of the passage count against the
  // player as errors too, matching the backend's replay scoring.
  errors += Math.max(0, typed.length - original.length);
  return errors;
};

export const calculateOfficialWPM = (originalText, typedText, timeElapsedSeconds) => {
  const totalCharacters = (typedText || '').length;
  const uncorrectedErrors = countUncorrectedErrors(originalText, typedText);
  const minutesElapsed = Math.max(0.5, timeElapsedSeconds || 0) / 60;
  const grossWords = totalCharacters / 5;
  const wpm = (grossWords - uncorrectedErrors) / minutesElapsed;
  return Math.max(0, Math.round(wpm * 10) / 10);
};

export const calculateAccuracy = (originalText, typedText) => {
  const totalChars = (originalText || '').length;
  if (totalChars === 0) return 100;
  const uncorrectedErrors = countUncorrectedErrors(originalText, typedText);
  const correctChars = Math.max(0, (typedText || '').length - uncorrectedErrors);
  return Math.round((correctChars / totalChars) * 1000) / 10;
};

// --- Deprecated, kept for backward compatibility with any existing
// callers. Prefer calculateOfficialWPM, which matches what the server
// will ultimately score you on. ---

/** @deprecated Use calculateOfficialWPM instead - this naive word-split
 * count doesn't apply the 5-char-per-word rule or the error penalty, so
 * it will disagree with the server's official number. */
export const calculateWPM = (text, timeElapsedSeconds) => {
  if (timeElapsedSeconds === 0) return 0;
  const trimmedText = (text || '').trim();
  if (!trimmedText) return 0;
  const words = trimmedText.split(/\s+/).length;
  const minutes = timeElapsedSeconds / 60;
  return Math.round((words / minutes) * 10) / 10;
};

/** @deprecated Use calculateOfficialWPM instead, which folds the error
 * penalty directly into the same formula the backend uses. */
export const calculateNetWPM = (grossWPM, errorRate) => {
  const netWPM = grossWPM - (errorRate * grossWPM);
  return Math.max(0, Math.round(netWPM * 10) / 10);
};

export const generateRaceId = () => {
  return `race_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// ---------------------------------------------------------------------
// Anti-cheat instrumentation
//
// The race component should create one of each of these when a race
// starts, feed them from its input/window event handlers, and hand the
// collected data to submitRaceResult / submitLiveRaceResult at the end.
// See typingApi.js's startRace/submitRaceResult for the matching backend
// contract.
// ---------------------------------------------------------------------

/**
 * Keystroke timing logger for the backend's bot-detection guard (it looks
 * at the standard deviation between keypresses, and flags any single
 * logged "keystroke" long enough to look like a paste).
 *
 * Usage in your race component:
 *   const loggerRef = useRef(createKeystrokeLogger());
 *   ...
 *   const handleChange = (e) => {
 *     const prevValue = typedText;
 *     const nextValue = e.target.value;
 *     loggerRef.current.record(diffAppendedChars(prevValue, nextValue));
 *     setTypedText(nextValue);
 *   };
 *   ...
 *   submitRaceResult({ ..., keystrokeLog: loggerRef.current.log });
 */
export const createKeystrokeLogger = () => {
  const startedAt = performance.now();
  const log = [];
  return {
    log,
    /** Record one logical keystroke (or pasted chunk - the backend flags
     * chunks of PASTE_LIKE_CHUNK_CHARS+ characters as suspicious). */
    record(ch) {
      log.push({ t: Math.round(performance.now() - startedAt), ch: String(ch ?? '') });
    },
    reset() {
      log.length = 0;
    },
  };
};

/**
 * Diff helper for onChange handlers: returns the characters that were
 * appended between the previous and next input value, so a single normal
 * keypress logs a 1-character entry and a browser autofill/paste logs a
 * multi-character one (which is exactly what the backend's paste-chunk
 * check is looking for).
 */
export const diffAppendedChars = (previousValue, nextValue) => {
  const prev = previousValue || '';
  const next = nextValue || '';
  if (next.length <= prev.length) return next.slice(next.length - 1) || '';
  return next.slice(prev.length);
};

/**
 * Window blur/focus tracker for the context-switch guard. Attach once
 * when a race starts, detach when it ends, and pass `.events` at submit
 * time as `blurEvents`.
 *
 * Usage:
 *   const trackerRef = useRef(null);
 *   useEffect(() => {
 *     if (isRacing) {
 *       trackerRef.current = createBlurTracker();
 *       trackerRef.current.attach();
 *       return () => trackerRef.current?.detach();
 *     }
 *   }, [isRacing]);
 */
export const createBlurTracker = () => {
  const startedAt = performance.now();
  const events = [];
  const onBlur = () => events.push({ t: Math.round(performance.now() - startedAt), type: 'blur' });
  const onFocus = () => events.push({ t: Math.round(performance.now() - startedAt), type: 'focus' });
  return {
    events,
    attach() {
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
    },
    detach() {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    },
  };
};

/**
 * Paste guard for the race input. Wire directly to the input's onPaste:
 *   <textarea onPaste={handlePasteAttempt(() => setPasteAttempted(true))} />
 * It blocks the paste (preventDefault) and reports the attempt so it can
 * be sent to the backend as `pasteAttempted: true`.
 */
export const handlePasteAttempt = (onAttempt) => (event) => {
  event.preventDefault();
  if (typeof onAttempt === 'function') onAttempt(event);
  return false;
};
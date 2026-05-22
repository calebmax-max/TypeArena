import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  calculateAccuracy,
  calculateWPM,
  formatTime,
  generateRaceId,
} from '../utils/typingEngine';
import {
  cancelLiveRaceRoom,
  fetchCurrentUser,
  generateRaceContent,
  fetchLiveRaceRoom,
  fetchLiveRaces,
  queueLiveRace,
  submitLiveRaceResult,
  submitRaceResult,
  updateLiveRaceHeartbeat,
} from '../utils/typingApi';
import '../styles/Play.css';

const LATEST_RACE_RESULT_KEY = 'typearena_latest_race_result';
const USED_CONTENT_IDS_KEY = 'typearena_used_content_ids';
const LIVE_RACE_COUNTDOWN_FALLBACK = 10;
const LIVE_CLOCK_SYNC_INTERVAL_MS = 250;

// ---------------------------------------------------------------------------
// Content rotation helpers
// Tracks seen content IDs in localStorage so live races cycle through all
// available passages before repeating. Designed to be error-proof:
//   - All localStorage access is wrapped in try/catch
//   - IDs are always coerced to strings for consistent comparison
//   - Each mode+language bucket is capped at MAX_TRACKED_IDS entries to
//     prevent the exclude list from growing so large that the server can't
//     find any valid content (safety valve when totalContentCount is unknown)
//   - A time-based reset (CONTENT_RESET_AFTER_MS) ensures the list never
//     stays locked forever if the server never sends totalContentCount
//   - The overall localStorage entry is pruned to MAX_STORE_KEYS buckets
//     so stale mode/language combos don't accumulate indefinitely
// ---------------------------------------------------------------------------
const MAX_TRACKED_IDS = 50;          // hard cap per mode+language bucket
const CONTENT_RESET_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const _readContentStore = () => {
  try {
    const raw = localStorage.getItem(USED_CONTENT_IDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const _writeContentStore = (store) => {
  try {
    // Prune to the 20 most-recently-touched keys to keep storage lean
    const keys = Object.keys(store);
    if (keys.length > 20) {
      const pruned = {};
      keys.slice(-20).forEach((k) => { pruned[k] = store[k]; });
      localStorage.setItem(USED_CONTENT_IDS_KEY, JSON.stringify(pruned));
    } else {
      localStorage.setItem(USED_CONTENT_IDS_KEY, JSON.stringify(store));
    }
  } catch {
    // localStorage full or unavailable — silently continue
  }
};

const getUsedContentIds = (mode, language) => {
  if (!mode || !language) return [];
  const store = _readContentStore();
  const key = `${mode}__${language}`;
  const bucket = store[key];
  if (!bucket || typeof bucket !== 'object') return [];

  // Reset if the bucket has gone stale (time-based safety valve)
  const age = Date.now() - (bucket.updatedAt || 0);
  if (age > CONTENT_RESET_AFTER_MS) return [];

  return Array.isArray(bucket.ids) ? bucket.ids : [];
};

const recordUsedContentId = (id, mode, language, totalAvailable = 0) => {
  if (!id || !mode || !language) return;
  const normalizedId = String(id).trim();
  if (!normalizedId) return;

  const store = _readContentStore();
  const key = `${mode}__${language}`;
  const bucket = store[key] && typeof store[key] === 'object' ? store[key] : { ids: [], updatedAt: 0 };
  const current = Array.isArray(bucket.ids) ? bucket.ids : [];

  // Already recorded — nothing to do
  if (current.includes(normalizedId)) return;

  const updated = [...current, normalizedId];
  const total = Number(totalAvailable) || 0;

  // Reset conditions:
  //   1. Server told us how many exist and we've now seen them all
  //   2. We've hit the hard cap (server never sent totalContentCount)
  const exhausted = (total > 0 && updated.length >= total) || updated.length >= MAX_TRACKED_IDS;

  store[key] = {
    ids: exhausted ? [] : updated,
    updatedAt: Date.now(),
  };

  _writeContentStore(store);
};

// ---------------------------------------------------------------------------
// Personal Best helpers — stored in localStorage per mode+language+duration
// ---------------------------------------------------------------------------
const PB_KEY = 'typearena_personal_bests';

const getPB = (mode, language, duration) => {
  try {
    const store = JSON.parse(localStorage.getItem(PB_KEY) || '{}');
    return store[`${mode}__${language}__${duration}`] || null;
  } catch { return null; }
};

const savePB = (mode, language, duration, wpm, accuracy) => {
  try {
    const store = JSON.parse(localStorage.getItem(PB_KEY) || '{}');
    const key = `${mode}__${language}__${duration}`;
    store[key] = { wpm, accuracy, date: new Date().toISOString() };
    localStorage.setItem(PB_KEY, JSON.stringify(store));
  } catch {}
};

// ---------------------------------------------------------------------------
// Recent races helpers — last 5 solo results stored in localStorage
// ---------------------------------------------------------------------------
const RECENT_KEY = 'typearena_recent_races';
const MAX_RECENT = 5;

const getRecentRaces = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
};

const saveRecentRace = (entry) => {
  try {
    const list = getRecentRaces();
    list.unshift(entry);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {}
};

// ---------------------------------------------------------------------------
// Sound effects — tiny Web Audio API clicks, buzz, chime
// ---------------------------------------------------------------------------
let _audioCtx = null;
const _getAudioCtx = () => {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { _audioCtx = null; }
  }
  return _audioCtx;
};

const playSound = (type) => {
  const ctx = _getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'key') {
      osc.type = 'sine'; osc.frequency.value = 600;
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
      osc.start(); osc.stop(ctx.currentTime + 0.04);
    } else if (type === 'error') {
      osc.type = 'sawtooth'; osc.frequency.value = 160;
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
      osc.start(); osc.stop(ctx.currentTime + 0.08);
    } else if (type === 'finish') {
      [523, 659, 784].forEach((freq, i) => {
        const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
        o2.connect(g2); g2.connect(ctx.destination);
        o2.type = 'sine'; o2.frequency.value = freq;
        const t = ctx.currentTime + i * 0.12;
        g2.gain.setValueAtTime(0.12, t);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o2.start(t); o2.stop(t + 0.25);
      });
    }
  } catch {}
};

// ---------------------------------------------------------------------------
// Commentator engine — football-match-style hype announcer via Web Speech API
// ---------------------------------------------------------------------------
const COMMENTATOR_LINES = {
  entry: [
    "Welcome to TypeArena! The crowd is on their feet! Are you ready to race?",
    "Ladies and gentlemen, a new challenger has entered the arena! Let's go!",
    "The stage is set, the crowd is roaring — TypeArena is LIVE!",
    "Another racer steps up! The keyboard is your weapon — use it!",
  ],
  raceStart: [
    "And they're OFF! Fingers flying across the keys!",
    "The race has BEGUN! Every keystroke counts!",
    "GO GO GO! The clock is ticking and the pressure is ON!",
    "It's all happening NOW! Type like you mean it!",
  ],
  milestone25: [
    "Twenty-five percent in! Looking sharp out there, keep the pace!",
    "Quarter of the way! The momentum is building — don't let up!",
    "Good start! Twenty-five percent done, seventy-five to go!",
  ],
  milestone50: [
    "HALFWAY THERE! Absolutely incredible pace! Can they hold it?",
    "Fifty percent! Right in the thick of it — this is where champions are made!",
    "The halfway mark! Don't slow down now, the crowd is watching!",
  ],
  milestone75: [
    "Seventy-five percent! They're in the home stretch, folks!",
    "Three quarters DONE! The finish line is in sight!",
    "Almost there! This is where legends separate from the rest!",
  ],
  streak10: [
    "TEN in a row! Flawless accuracy! The crowd goes wild!",
    "A ten-key streak! Not a single mistake! Magnificent!",
  ],
  streak25: [
    "TWENTY-FIVE PERFECT KEYSTROKES! This is absolute DOMINANCE!",
    "Twenty-five in a row! Someone call the record books!",
  ],
  error: [
    "Ooh, a slip! Shake it off, shake it off!",
    "Mistake! But champions recover — dig in!",
    "Not to worry! Corrections happen — push through!",
  ],
  finish: [
    "AND IT'S OVER! What a race! Absolutely breathtaking performance!",
    "THE RACE IS COMPLETE! The crowd erupts! What a finish!",
    "DONE! Give it up for our racer! An outstanding display of speed and accuracy!",
  ],
  waiting: [
    "The opponent is being located — the crowd is on the edge of their seats!",
    "Searching for a challenger… Someone brave enough to face you today?",
  ],
};

let _commentatorLastSpokenAt = 0;
const _commentatorCooldownMs = 4000; // prevent overlapping lines

const speakCommentary = (lines, opts = {}) => {
  if (!window.speechSynthesis) return;
  const { force = false } = opts;
  const now = Date.now();
  if (!force && now - _commentatorLastSpokenAt < _commentatorCooldownMs) return;
  _commentatorLastSpokenAt = now;

  // Cancel any current utterance so new one cuts in cleanly
  window.speechSynthesis.cancel();

  const line = lines[Math.floor(Math.random() * lines.length)];
  const utter = new SpeechSynthesisUtterance(line);
  utter.rate = 1.15;   // slightly faster — excited commentator energy
  utter.pitch = 1.1;
  utter.volume = 0.9;

  // Prefer a deep male voice if available (sports commentator feel)
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((v) =>
    /male|guy|david|james|daniel|mark|google uk english male/i.test(v.name)
  );
  if (preferred) utter.voice = preferred;

  window.speechSynthesis.speak(utter);
};

// Pre-load voices (Chrome requires this trigger)
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    window.speechSynthesis.getVoices();
  });
}

const LOCAL_RACE_TICK_INTERVAL_MS = 1000;
const KEYBOARD_LAYOUT = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
  ['CapsLock', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'],
  ['Space'],
];

const THEME_PRESETS = {
  default: {
    label: 'Arena Default',
    style: {
      '--arena-bg': 'linear-gradient(150deg, hsl(240 12% 9% / 0.9), hsl(240 11% 12% / 0.95))',
      '--arena-panel': 'hsl(240 12% 7% / 0.72)',
      '--arena-panel-border': 'hsl(240 10% 19%)',
      '--arena-text': 'hsl(0 0% 95%)',
      '--arena-muted': 'hsl(240 5% 66%)',
      '--arena-accent': 'hsl(145 80% 42%)',
      '--arena-accent-soft': 'hsl(145 80% 42% / 0.2)',
      '--arena-glow': 'hsl(145 80% 42% / 0.25)',
      '--arena-gold': 'hsl(45 100% 68%)',
      '--arena-key-bg': 'linear-gradient(180deg, hsl(220 17% 18%), hsl(220 19% 10%))',
      '--arena-key-border': 'hsl(220 15% 28%)',
      '--arena-key-text': 'hsl(0 0% 95%)',
      '--arena-key-highlight': 'hsl(145 80% 42% / 0.28)',
      '--arena-surface': 'hsl(240 12% 6% / 0.82)',
    },
  },
  theme_nairobi_night: {
    label: 'Nairobi Night Theme',
    style: {
      '--arena-bg': 'linear-gradient(145deg, rgba(8, 12, 24, 0.98), rgba(19, 45, 78, 0.96) 52%, rgba(10, 14, 24, 0.98))',
      '--arena-panel': 'rgba(13, 22, 38, 0.82)',
      '--arena-panel-border': 'rgba(72, 136, 255, 0.24)',
      '--arena-text': '#f5fbff',
      '--arena-muted': 'rgba(190, 213, 255, 0.72)',
      '--arena-accent': '#41d3ff',
      '--arena-accent-soft': 'rgba(65, 211, 255, 0.17)',
      '--arena-glow': 'rgba(65, 211, 255, 0.28)',
      '--arena-gold': '#ffd166',
      '--arena-key-bg': 'linear-gradient(180deg, rgba(14, 26, 46, 0.95), rgba(6, 14, 26, 0.98))',
      '--arena-key-border': 'rgba(82, 164, 255, 0.25)',
      '--arena-key-text': '#f3f9ff',
      '--arena-key-highlight': 'rgba(65, 211, 255, 0.3)',
      '--arena-surface': 'rgba(8, 15, 29, 0.92)',
    },
  },
  theme_savanna_gold: {
    label: 'Savanna Gold Theme',
    style: {
      '--arena-bg': 'linear-gradient(145deg, rgba(43, 28, 10, 0.98), rgba(113, 75, 20, 0.94) 50%, rgba(36, 24, 11, 0.98))',
      '--arena-panel': 'rgba(56, 37, 15, 0.8)',
      '--arena-panel-border': 'rgba(255, 198, 110, 0.22)',
      '--arena-text': '#fff9ec',
      '--arena-muted': 'rgba(244, 220, 174, 0.72)',
      '--arena-accent': '#ffb347',
      '--arena-accent-soft': 'rgba(255, 179, 71, 0.18)',
      '--arena-glow': 'rgba(255, 179, 71, 0.28)',
      '--arena-gold': '#ffe08a',
      '--arena-key-bg': 'linear-gradient(180deg, rgba(80, 54, 20, 0.94), rgba(45, 29, 11, 0.98))',
      '--arena-key-border': 'rgba(255, 203, 114, 0.24)',
      '--arena-key-text': '#fff6df',
      '--arena-key-highlight': 'rgba(255, 179, 71, 0.28)',
      '--arena-surface': 'rgba(41, 27, 11, 0.92)',
    },
  },
  theme_stealth_hq: {
    label: 'Stealth HQ Theme',
    style: {
      '--arena-bg': 'linear-gradient(145deg, rgba(8, 9, 11, 0.99), rgba(28, 31, 36, 0.96) 46%, rgba(7, 7, 8, 0.99))',
      '--arena-panel': 'rgba(19, 21, 24, 0.84)',
      '--arena-panel-border': 'rgba(135, 149, 161, 0.2)',
      '--arena-text': '#f3f5f7',
      '--arena-muted': 'rgba(182, 191, 197, 0.72)',
      '--arena-accent': '#b6ff7b',
      '--arena-accent-soft': 'rgba(182, 255, 123, 0.16)',
      '--arena-glow': 'rgba(182, 255, 123, 0.22)',
      '--arena-gold': '#d3dae1',
      '--arena-key-bg': 'linear-gradient(180deg, rgba(28, 31, 35, 0.95), rgba(10, 11, 13, 0.98))',
      '--arena-key-border': 'rgba(145, 156, 168, 0.2)',
      '--arena-key-text': '#f5f7f8',
      '--arena-key-highlight': 'rgba(182, 255, 123, 0.24)',
      '--arena-surface': 'rgba(12, 13, 15, 0.94)',
    },
  },
};

const SKIN_PRESETS = {
  default: { label: 'Default keyboard skin' },
  skin_velocity_black: {
    label: 'Velocity Black',
    style: {
      '--arena-key-bg': 'linear-gradient(180deg, #20262f, #0f1319)',
      '--arena-key-border': '#3f4d61',
      '--arena-key-text': '#f8fbff',
      '--arena-key-shadow': 'rgba(4, 9, 15, 0.45)',
    },
  },
  skin_molten_copper: {
    label: 'Molten Copper',
    style: {
      '--arena-key-bg': 'linear-gradient(180deg, #5c321a, #231107)',
      '--arena-key-border': '#d48a52',
      '--arena-key-text': '#fff2e6',
      '--arena-key-shadow': 'rgba(104, 48, 17, 0.38)',
    },
  },
  skin_frostline_pro: {
    label: 'Frostline Pro',
    style: {
      '--arena-key-bg': 'linear-gradient(180deg, #d6f0ff, #8ab6d5)',
      '--arena-key-border': '#eef8ff',
      '--arena-key-text': '#10273d',
      '--arena-key-shadow': 'rgba(143, 197, 232, 0.34)',
    },
  },
};

const AVATAR_PRESETS = {
  default: { mark: 'TA', title: 'TypeArena Avatar', aura: 'avatar-aura-default' },
  avatar_apex_panther: { mark: 'AP', title: 'Apex Panther', aura: 'avatar-aura-panther' },
  avatar_signal_ghost: { mark: 'SG', title: 'Signal Ghost', aura: 'avatar-aura-ghost' },
  avatar_crown_hawk: { mark: 'CH', title: 'Crown Hawk', aura: 'avatar-aura-hawk' },
};

const BADGE_PRESETS = {
  default: { label: 'Player' },
  badge_founders_mark: { label: 'Founder Mark' },
  badge_clutch_streak: { label: 'Clutch Streak' },
  badge_elite_verified: { label: 'Elite Verified' },
};

const FRAME_PRESETS = {
  default: 'frame-default',
  frame_titan_brass: 'frame-titan-brass',
  frame_carbonglass: 'frame-carbonglass',
  frame_imperial_crown: 'frame-imperial-crown',
};

const EFFECT_PRESETS = {
  default: 'effect-default',
  effect_reactor_sparks: 'effect-reactor-sparks',
  effect_afterburn_wave: 'effect-afterburn-wave',
  effect_royal_echo: 'effect-royal-echo',
};

const MODE_CONFIG = [
  { id: 'standard', label: '1v1 Battle', description: 'Classic live duel with balanced pacing.' },
  { id: 'survival', label: 'Survival', description: 'Stay accurate under pressure.' },
  { id: 'speed_burst', label: 'Speed Burst', description: 'Short explosive sprints.' },
  { id: 'code', label: 'Code Syntax', description: 'Battle with developer-friendly text.' },
  { id: 'memory', label: 'Memory', description: 'Preview the prompt then reproduce it fast.' },
  { id: 'quote', label: 'Quote', description: 'Premium quote typing rounds.' },
  { id: 'marathon', label: 'Marathon', description: 'Long-form endurance mode.' },
];

const normalizeKeyboardKey = (key) => {
  if (!key) return '';
  if (key === ' ') return 'Space';
  if (key === 'Esc') return 'Escape';
  if (key.length === 1) return key.toUpperCase();
  return key;
};

// ---------------------------------------------------------------------------
// ReplayPlayer — scrubable replay of all collected frames
// ---------------------------------------------------------------------------
function ReplayPlayer({ frames }) {
  const [index, setIndex] = useState(0);
  const frame = frames[index] || frames[0];
  const totalFrames = frames.length;

  return (
    <div className="replay-player">
      <div className="replay-player__header">
        <span className="replay-player__title">Replay</span>
        <span className="replay-player__counter">Frame {index + 1} / {totalFrames}</span>
      </div>
      <div className="replay-player__text" aria-live="polite">
        {frame?.typedText?.slice(-120) || 'Race start'}
      </div>
      <input
        type="range"
        className="replay-player__scrubber"
        min={0}
        max={totalFrames - 1}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
        aria-label="Scrub through replay frames"
      />
      <div className="replay-player__controls">
        <button
          className="btn btn-sm btn-outline-light"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >‹ Prev</button>
        <button
          className="btn btn-sm btn-outline-light"
          onClick={() => setIndex((i) => Math.min(totalFrames - 1, i + 1))}
          disabled={index === totalFrames - 1}
        >Next ›</button>
      </div>
    </div>
  );
}

export default function Play({ practicePage = false }){
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('lobby');
  const [mode, setMode] = useState('standard');
  const [language, setLanguage] = useState('english');
  const [duration, setDuration] = useState(60);
  const [liveFeed, setLiveFeed] = useState([]);
  const [liveRoom, setLiveRoom] = useState(null);
  const [typingText, setTypingText] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [loadingLive, setLoadingLive] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  // notice is now { message: string, type: 'info'|'error'|'success'|'warning' }
  const [notice, setNotice] = useState(null);
  const [raceResult, setRaceResult] = useState(null);
  const [generatedContent, setGeneratedContent] = useState(null);
  const [replayFrames, setReplayFrames] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [countdownRemaining, setCountdownRemaining] = useState(LIVE_RACE_COUNTDOWN_FALLBACK);
  const [showPracticeModes, setShowPracticeModes] = useState(false);
  const [raceOver, setRaceOver] = useState(false);
  const [friendBattle, setFriendBattle] = useState({
    inviteCode: '',
    password: '',
    customInviteCode: '',
  });
  // ── new feature state ──────────────────────────────────────────────────────
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [commentatorEnabled, setCommentatorEnabled] = useState(true);
  const commentatorMilestonesRef = useRef({ m25: false, m50: false, m75: false });
  const [focusLost, setFocusLost] = useState(false);
  const [streak, setStreak] = useState(0);
  const [wpmHistory, setWpmHistory] = useState([]);       // [{t, wpm}] for sparkline
  const [isNewPB, setIsNewPB] = useState(false);
  const [mistakeMap, setMistakeMap] = useState({});       // char → count
  const [recentRaces, setRecentRaces] = useState(() => getRecentRaces());
  // ────────────────────────────────────────────────────────────────────────────

  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const heartbeatPayloadRef = useRef(null);
  const heartbeatInFlightRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const isLeavingRef = useRef(false);
  const queuedAtRef = useRef(null); // tracks when the user entered queued phase
  const [activeKeys, setActiveKeys] = useState([]);
  const [queueElapsed, setQueueElapsed] = useState(0); // seconds waiting in queue

  // Typed notice helper — keeps callsites clean
  const showNotice = useCallback((message, type = 'info') => {
    setNotice(message ? { message, type } : null);
  }, []);

  useEffect(() => {
    fetchCurrentUser().then(setCurrentUser).catch(() => {});
  }, []);

  // Commentator: hype the player when they first land on the page
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (commentatorEnabled) {
        speakCommentary(COMMENTATOR_LINES.entry, { force: true });
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  // Run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    setNotice((current) => {
      if (!current) {
        return current;
      }
      const normalized = String(current.message || '').toLowerCase();
      if (normalized.includes('sign in first')) {
        return null;
      }
      return current;
    });
  }, [currentUser?.id]);

  const redirectToProfile = useCallback(() => {
    const redirectPath = `${location.pathname}${location.search || ''}`;
    showNotice('Sign in first to play, join live races, or compete in private rooms.', 'info');
    navigate(`/profile?redirect=${encodeURIComponent(redirectPath)}`);
  }, [location.pathname, location.search, navigate, showNotice]);

  useEffect(() => {
    if (phase !== 'racing') {
      setActiveKeys([]);
      return undefined;
    }

    const handleWindowKeyDown = (event) => {
      const normalized = normalizeKeyboardKey(event.key);
      if (!normalized) {
        return;
      }
      setActiveKeys((current) => (current.includes(normalized) ? current : [...current, normalized]));
    };

    const handleWindowKeyUp = (event) => {
      const normalized = normalizeKeyboardKey(event.key);
      if (!normalized) {
        return;
      }
      setActiveKeys((current) => current.filter((item) => item !== normalized));
    };

    const handleWindowBlur = () => { setActiveKeys([]); setFocusLost(true); };
    const handleWindowFocus = () => setFocusLost(false);

    window.addEventListener('keydown', handleWindowKeyDown);
    window.addEventListener('keyup', handleWindowKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
      window.removeEventListener('keyup', handleWindowKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [phase]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const inviteCode = (params.get('invite') || '').trim().toUpperCase();
    const password = params.get('password') || '';

    if (!inviteCode) {
      return;
    }

    setFriendBattle((prev) => ({
      ...prev,
      inviteCode,
      password: password || prev.password,
    }));

    // Use currentUser (from API) rather than reading localStorage directly
    showNotice(
      currentUser?.id
        ? `Invite loaded. Enter the room with code ${inviteCode} when you are ready.`
        : `Invite loaded. Sign in first, then join room ${inviteCode}.`,
      'info'
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    // Never replace race text while a race is live or in the queued/waiting phase
    if (phase === 'racing' || phase === 'queued' || phase === 'waiting') {
      return;
    }
    let cancelled = false;
    const loadGeneratedContent = async () => {
      setContentLoading(true);
      try {
        const excludeContentIds = getUsedContentIds(mode, language);
        const content = await generateRaceContent(mode, language, { excludeContentIds });
        if (!cancelled) {
          setGeneratedContent(content);
          // Record this passage immediately so the next lobby refresh won't re-pick it
          recordUsedContentId(
            content?.id ?? content?.contentId,
            mode,
            language,
            content?.totalContentCount || 0
          );
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    };
    loadGeneratedContent();
    return () => { cancelled = true; };
  }, [language, mode, phase]);

  
  const buildRoomStandings = useCallback((room) => {
    if (!room?.players?.length) {
      return [];
    }

    const standings = room.players.map((player) => {
      const result = player?.result || null;
      return {
        userId: player.userId,
        username: player.username || 'Player',
        wpm: Number(result?.wpm ?? player?.currentWpm ?? 0),
        accuracy: Number(result?.accuracy ?? player?.currentAccuracy ?? 0),
        finishedAtTs: Number(result?.finishedAtTs ?? 0),
        submitted: Boolean(result),
        isWinner: String(player.userId) === String(room?.winnerUserId),
        isCurrentUser: String(player.userId) === String(currentUser?.id),
      };
    });

    standings.sort((left, right) => {
      if (left.submitted !== right.submitted) {
        return left.submitted ? -1 : 1;
      }
      if (right.wpm !== left.wpm) {
        return right.wpm - left.wpm;
      }
      if (right.accuracy !== left.accuracy) {
        return right.accuracy - left.accuracy;
      }
      if (left.finishedAtTs && right.finishedAtTs && left.finishedAtTs !== right.finishedAtTs) {
        return left.finishedAtTs - right.finishedAtTs;
      }
      return String(left.username).localeCompare(String(right.username));
    });

    return standings.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  }, [currentUser?.id]);

  const buildRoomResultPayload = useCallback((room) => {
    if (!room) {
      return null;
    }

    const standings = buildRoomStandings(room);
    const myStanding = standings.find((entry) => entry.isCurrentUser) || null;
    const myResult =
      room.players?.find((player) => String(player.userId) === String(currentUser?.id))?.result ||
      myStanding ||
      null;

    const fallbackWpm = calculateWPM(typingText, Math.max(1, duration - timeLeft));
    const fallbackAccuracy = calculateAccuracy(
      room?.text || generatedContent?.passage || MODE_CONFIG.find((item) => item.id === mode)?.description || '',
      typingText
    );

    return {
      id: room.id || generateRaceId(),
      wpm: Number(myResult?.wpm ?? fallbackWpm),
      accuracy: Number(myResult?.accuracy ?? fallbackAccuracy),
      duration: Number(room.duration || duration),
      mode: room.mode || mode,
      language: room.language || language,
      netWPM: Math.max(
        0,
        Math.round(
          (Number(myResult?.wpm ?? fallbackWpm) * (Number(myResult?.accuracy ?? fallbackAccuracy) / 100)) * 10
        ) / 10
      ),
      coachTip:
        Number(myResult?.accuracy ?? fallbackAccuracy) < 92
          ? 'Accuracy dipped. Try smoother keystrokes and avoid forcing speed.'
          : 'Strong run. Keep your rhythm and push for a faster opening burst.',
      replayFrames,
      shareText: `I typed ${Math.round(Number(myResult?.wpm ?? fallbackWpm))} WPM on TypeArena.`,
      winnerPrize: Number(room?.winnerPrize || 0),
      completedAt: room?.completedAt || new Date().toISOString(),
      winnerUserId: room?.winnerUserId || null,
      winnerUsername:
        room?.winnerUsername ||
        standings.find((entry) => entry.isWinner)?.username ||
        '',
      standings,
    };
  }, [buildRoomStandings, currentUser?.id, duration, generatedContent?.passage, language, mode, replayFrames, timeLeft, typingText]);


const flushLiveHeartbeat = useCallback(async () => {
    if (!liveRoom?.id || heartbeatInFlightRef.current || !heartbeatPayloadRef.current) {
      return;
    }

    heartbeatInFlightRef.current = true;
    const payload = heartbeatPayloadRef.current;
    heartbeatPayloadRef.current = null;

    try {
      const room = await updateLiveRaceHeartbeat(liveRoom.id, payload);
      if (isLeavingRef.current) return;
      setLiveRoom(room);

      if (room?.status === 'completed') {
        const finalPayload = buildRoomResultPayload(room);
        if (finalPayload) {
          sessionStorage.setItem(LATEST_RACE_RESULT_KEY, JSON.stringify(finalPayload));
          setRaceResult(finalPayload);
        }
        setPhase('results');
        return;
      }

    } catch (error) {
      console.error('Live heartbeat error:', error);
    } finally {
      heartbeatInFlightRef.current = false;
      if (heartbeatPayloadRef.current) {
        window.clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = window.setTimeout(() => {
          flushLiveHeartbeat();
        }, 120);
      }
    }
  }, [liveRoom?.id, buildRoomResultPayload]);

  const finishRaceRef = useRef(null);
  const finishRace = useCallback(async () => {
    if (isSubmittingRef.current) {
        console.warn("Submission already in progress, ignoring duplicate call.");
        return;
    }
    isSubmittingRef.current = true;

    try {
        const elapsed = Math.max(1, duration - timeLeft);
        const sourceText = liveRoom?.text || generatedContent?.passage || MODE_CONFIG.find((item) => item.id === mode)?.description || '';
        const wpm = calculateWPM(typingText, elapsed);
        const accuracy = calculateAccuracy(sourceText, typingText);
        
        const finalData = {
            id: generateRaceId(),
            wpm,
            accuracy,
            duration,
            mode,
            language,
        };

        if (!liveRoom?.id) {
            await submitRaceResult(finalData);
        }

        if (liveRoom?.id) {
            try {
                await submitLiveRaceResult(liveRoom.id, { wpm, accuracy });

                if (isLeavingRef.current) return;

                // Show results immediately with own stats — don't make the user wait for opponent
                const immediatePayload = buildRoomResultPayload(liveRoom);
                const ownPayload = immediatePayload || {
                    ...finalData,
                    netWPM: Math.max(0, Math.round((wpm * (accuracy / 100)) * 10) / 10),
                    coachTip: accuracy < 92 ? 'Accuracy dipped. Try smoother keystrokes.' : 'Strong run. Keep your rhythm.',
                    replayFrames,
                    shareText: `I typed ${Math.round(wpm)} WPM on TypeArena.`,
                    completedAt: new Date().toISOString(),
                    standings: [],
                };
                sessionStorage.setItem(LATEST_RACE_RESULT_KEY, JSON.stringify(ownPayload));
                setRaceResult(ownPayload);
                setPhase('results');
                // Standings will be updated automatically by the polling effect
                // when the opponent finishes — no separate chain needed
            } catch (error) {
                if (isLeavingRef.current) return;
                if (error.message.includes('1062')) {
                    setPhase('results');
                } else {
                    console.error('Live race submit error:', error);
                }
            }
            return;
        }

        if (isLeavingRef.current) return;

        // Ensure this passage is recorded as used so the next solo race won't repeat it
        recordUsedContentId(
            generatedContent?.id ?? generatedContent?.contentId,
            mode,
            language,
            generatedContent?.totalContentCount || 0
        );

        // Personal best check
        const pb = getPB(mode, language, duration);
        const isNewPBNow = !pb || wpm > pb.wpm;
        if (isNewPBNow) {
            savePB(mode, language, duration, wpm, accuracy);
            setIsNewPB(true);
        }

        // Play finish sound
        playSound('finish');
        if (commentatorEnabled) {
          setTimeout(() => speakCommentary(COMMENTATOR_LINES.finish, { force: true }), 600);
        }

        const resultPayload = {
            ...finalData,
            netWPM: Math.max(0, Math.round((wpm * (accuracy / 100)) * 10) / 10),
            coachTip: accuracy < 92 ? 'Accuracy dipped. Try smoother keystrokes.' : 'Strong run. Keep your rhythm.',
            replayFrames,
            shareText: `I typed ${Math.round(wpm)} WPM on TypeArena.`,
            completedAt: new Date().toISOString(),
        };

        sessionStorage.setItem(LATEST_RACE_RESULT_KEY, JSON.stringify(resultPayload));
        setRaceResult(resultPayload);
        // Save to recent races list
        const recentEntry = { wpm, accuracy, mode, language, duration, date: new Date().toISOString() };
        saveRecentRace(recentEntry);
        setRecentRaces(getRecentRaces());
        setPhase('results');

    } catch (error) {
        console.error('Race submission error:', error);
    } finally {
        isSubmittingRef.current = false;
    }
}, [duration, timeLeft, liveRoom, generatedContent, mode, language, typingText, replayFrames, setPhase, buildRoomResultPayload, setRaceResult]);
  // Keep the ref always pointing at the latest finishRace so the timer
  // interval can call it without being listed as a dep of the timer effect
  finishRaceRef.current = finishRace;
  const syncRoomClock = useCallback((room) => {
    if (!room?.startedAt) {
      setCountdownRemaining(Number(room?.countdown || LIVE_RACE_COUNTDOWN_FALLBACK));
      return;
    }

    const countdownSeconds = Number(room.countdown || LIVE_RACE_COUNTDOWN_FALLBACK);
    const startedAtMs = new Date(room.startedAt).getTime();
    if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
      setCountdownRemaining(countdownSeconds);
      return;
    }

    const elapsedSeconds = Math.max(0, (Date.now() - startedAtMs) / 1000);
    const remainingCountdown = Math.max(0, Math.ceil(countdownSeconds - elapsedSeconds));
    const raceElapsed = Math.max(0, Math.floor(elapsedSeconds - countdownSeconds));

    setCountdownRemaining(remainingCountdown);
    setTimeLeft(Math.max(0, Number(room.duration || duration) - raceElapsed));
  }, [duration]);

  useEffect(() => {
    const loadFeed = async () => {
      if (phase === 'racing') return;
      const rooms = await fetchLiveRaces().catch(() => []);
      setLiveFeed(Array.isArray(rooms) ? rooms : []);
    };
    loadFeed();
    const interval = window.setInterval(loadFeed, 4000);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (!liveRoom?.id || phase === 'lobby' || phase === 'waiting') {
      return undefined;
    }

    const roomId = liveRoom.id;

    // During results phase, only keep polling if standings are still incomplete
    if (phase === 'results') {
      const allDone = liveRoom?.players?.every((p) => Boolean(p?.result));
      if (allDone) return undefined;
    }

    const interval = window.setInterval(async () => {
      try {
        const room = await fetchLiveRaceRoom(roomId);
        if (isLeavingRef.current) return;
        setLiveRoom(room);
        if (room.status === 'completed' || phase === 'results') {
          const finalPayload = buildRoomResultPayload(room);
          if (finalPayload) {
            sessionStorage.setItem(LATEST_RACE_RESULT_KEY, JSON.stringify(finalPayload));
            setRaceResult(finalPayload);
          }
          if (room.status === 'completed') setPhase('results');
          return;
        }
        syncRoomClock(room);
        if (phase === 'queued') {
          if (room.status === 'racing' || (room.status !== 'waiting' && countdownRemaining <= 0)) {
            setPhase('racing');
            setTimeout(() => inputRef.current?.focus(), 150);
          }
        }
      } catch (error) {
        console.error('Live room polling error:', error);
      }
    }, phase === 'queued' ? 1500 : phase === 'results' ? 1000 : 2200);

    return () => window.clearInterval(interval);
  // liveRoom.id is captured as roomId above — the full object is intentionally excluded
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildRoomResultPayload, countdownRemaining, liveRoom?.id, liveRoom?.players, phase, syncRoomClock]);

  useEffect(() => {
    if (phase === 'queued' && liveRoom?.status === 'countdown') {
      showNotice(`Race starts in ${Math.max(0, countdownRemaining)} seconds…`, 'info');
      if (countdownRemaining <= 0) {
        setPhase('racing');
        setTimeout(() => inputRef.current?.focus(), 150);
      }
    }
  }, [countdownRemaining, liveRoom?.status, phase, showNotice]);

  useEffect(() => () => {
    window.clearTimeout(heartbeatTimerRef.current);
  }, []);

  // Track how long the user has been waiting in the queue (for UX timeout hint)
  useEffect(() => {
    if (phase !== 'queued') {
      setQueueElapsed(0);
      queuedAtRef.current = null;
      return undefined;
    }
    if (!queuedAtRef.current) {
      queuedAtRef.current = Date.now();
    }
    const interval = window.setInterval(() => {
      setQueueElapsed(Math.floor((Date.now() - (queuedAtRef.current || Date.now())) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  // Keyboard shortcut: Enter in lobby starts the primary race action
  useEffect(() => {
    if (phase !== 'lobby') return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !e.target.closest('input, textarea, button')) {
        if (practicePage) {
          startPracticeRace();
        } else {
          startLiveRace();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, practicePage]);

  useEffect(() => {
  // Only auto-advance to results from an active game phase, never from lobby
  if (
    liveRoom?.status === 'completed' &&
    phase !== 'results' &&
    phase !== 'lobby' &&
    !isLeavingRef.current
  ) {
    const finalPayload = buildRoomResultPayload(liveRoom);

    if (finalPayload) {
      sessionStorage.setItem(
        LATEST_RACE_RESULT_KEY,
        JSON.stringify(finalPayload)
      );

      setRaceResult(finalPayload);
    }

    setPhase('results');
    return;
  }

  if (phase === 'queued' && liveRoom?.status === 'countdown') {
    syncRoomClock(liveRoom);

    const countdownTimer = window.setInterval(() => {
      syncRoomClock(liveRoom);
    }, LIVE_CLOCK_SYNC_INTERVAL_MS);

    return () => window.clearInterval(countdownTimer);
  }

  if (phase !== 'racing') {
    window.clearInterval(timerRef.current);
    return undefined;
  }

}, [
  buildRoomResultPayload,
  liveRoom,
  phase,
  syncRoomClock
]);

    
  const liveRoomRef = useRef(liveRoom);
  useEffect(() => {
    liveRoomRef.current = liveRoom;
  }, [liveRoom]);

  useEffect(() => {
    // Run the race timer during active racing — for both live rooms and solo/practice races
    if (phase !== 'racing') {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }

    // Run initial sync cycle
    syncRoomClock(liveRoom);

    timerRef.current = window.setInterval(() => {
      // Read the latest room from the ref — not the stale closure value
      const currentRoom = liveRoomRef.current;

      // For live races, bail if the room has disappeared or phase changed.
      // For solo races currentRoom is null — that's fine, fall through to the local tick below.
      if (currentRoom?.id && phase !== 'racing') {
        window.clearInterval(timerRef.current);
        return;
      }

      if (currentRoom?.startedAt) {
        syncRoomClock(currentRoom);

        const startedAtMs = new Date(currentRoom.startedAt).getTime();
        const elapsedSeconds = Math.max(0, (Date.now() - startedAtMs) / 1000);
        const countdownSeconds = Number(currentRoom.countdown || LIVE_RACE_COUNTDOWN_FALLBACK);
        const raceRemaining = Math.max(0, Number(currentRoom.duration || duration) - Math.floor(elapsedSeconds - countdownSeconds));

        setTimeLeft(raceRemaining);

        if (raceRemaining <= 0) {
          window.clearInterval(timerRef.current);
          setRaceOver(true);
          finishRaceRef.current();
        }
        return;
      }

      // Local / Offline race fallback tick logic
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timerRef.current);
          setRaceOver(true);
          finishRaceRef.current();
          return 0;
        }
        return current - 1;
      });
    }, liveRoom?.startedAt ? LIVE_CLOCK_SYNC_INTERVAL_MS : LOCAL_RACE_TICK_INTERVAL_MS);

    return () => window.clearInterval(timerRef.current);
    // liveRoom intentionally excluded — use liveRoomRef.current inside the interval
    // so heartbeat updates don't restart the interval and spawn duplicates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, liveRoom?.id, liveRoom?.startedAt, phase, syncRoomClock]);

  const refreshFeed = useCallback(async () => {
    const rooms = await fetchLiveRaces().catch(() => []);
    setLiveFeed(Array.isArray(rooms) ? rooms : []);
  }, []);

  const startPracticeRaceWithMode = useCallback((nextMode) => {
    const resolvedMode = nextMode || mode;
    if (nextMode && nextMode !== mode) {
      setMode(nextMode);
    }
    setShowPracticeModes(false);

    if (!currentUser?.id) {
      redirectToProfile();
      return;
    }

    isLeavingRef.current = false;
    isSubmittingRef.current = false;
    setLiveRoom(null);
    setTypingText('');
    setReplayFrames([]);
    setRaceResult(null);
    showNotice(null);
    setRaceOver(false);
    setTimeLeft(duration);

    // generateRaceContent will be triggered by the mode/phase change automatically;
    // we pre-fetch with the resolved mode so there is no stale-mode window.
    const excludeContentIds = getUsedContentIds(resolvedMode, language);
    generateRaceContent(resolvedMode, language, { excludeContentIds }).then((content) => {
      setGeneratedContent(content);
      recordUsedContentId(
        content?.id ?? content?.contentId,
        resolvedMode,
        language,
        content?.totalContentCount || 0
      );
    }).catch(() => {});

    commentatorMilestonesRef.current = { m25: false, m50: false, m75: false };
    if (commentatorEnabled) {
      speakCommentary(COMMENTATOR_LINES.raceStart, { force: true });
    }
    setPhase('racing');
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [commentatorEnabled, currentUser?.id, duration, language, mode, redirectToProfile, showNotice]);

  const startPracticeRace = useCallback(() => {
    if (!currentUser?.id) {
      redirectToProfile();
      return;
    }
    isLeavingRef.current = false;
    isSubmittingRef.current = false;

    setLiveRoom(null);
    setTypingText('');
    setReplayFrames([]);
    setRaceResult(null);
    showNotice(null);
    setRaceOver(false);
    setTimeLeft(duration);
    setStreak(0);
    setWpmHistory([]);
    setIsNewPB(false);
    setMistakeMap({});
    setFocusLost(false);
    commentatorMilestonesRef.current = { m25: false, m50: false, m75: false };
    if (commentatorEnabled) {
      speakCommentary(COMMENTATOR_LINES.raceStart, { force: true });
    }
    setPhase('racing');
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [commentatorEnabled, currentUser?.id, duration, redirectToProfile, showNotice]);

const backToLobby = useCallback(() => {
    isLeavingRef.current = true;
    isSubmittingRef.current = false;

    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      window.clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    sessionStorage.removeItem(LATEST_RACE_RESULT_KEY);
    setLiveRoom(null);
    setRaceResult(null);
    setRaceOver(false);
    setTypingText('');
    setReplayFrames([]);
    showNotice(null);
    setShowPracticeModes(false);
    setQueueElapsed(0);
    queuedAtRef.current = null;
    setStreak(0);
    setWpmHistory([]);
    setIsNewPB(false);
    setMistakeMap({});
    setFocusLost(false);
    setPhase('lobby');
  }, [showNotice]);

  const startLiveRace = async () => {
    if (!currentUser?.id) {
      redirectToProfile();
      return;
    }
    isLeavingRef.current = false;
    isSubmittingRef.current = false;

    setLoadingLive(true);
    showNotice(null);
    try {
      const excludeContentIds = getUsedContentIds(mode, language);
      const response = await queueLiveRace({
        mode,
        language,
        duration,
        // winnerPrize is calculated server-side; this is a UI hint only
        winnerPrize: Math.round((duration / 60) * 150),
        excludeContentIds,
      });
      setLiveRoom(response.room);
      // Record the picked content so it won't repeat until all passages are used
      recordUsedContentId(
        response.room?.contentId,
        mode,
        language,
        response.totalContentCount || 0
      );
      setTypingText('');
      setReplayFrames([]);
      setRaceResult(null);
      setRaceOver(false);
      setPhase('queued');
      queuedAtRef.current = Date.now();
      setQueueElapsed(0);
      setCountdownRemaining(Number(response.room?.countdown || LIVE_RACE_COUNTDOWN_FALLBACK));
      setTimeLeft(Number(response.room?.duration || duration));
      showNotice(
        response.matched ? 'Opponent found. Countdown started.' : 'Waiting for another player…',
        response.matched ? 'success' : 'info'
      );
      refreshFeed();
    } catch (error) {
      showNotice(error.message || 'Could not join a live race.', 'error');
    } finally {
      setLoadingLive(false);
    }
  };
const createFriendBattle = async () => {
    if (!currentUser?.id) {
      redirectToProfile();
      return;
    }

    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isLeavingRef.current = false;
    isSubmittingRef.current = false;
    setLiveRoom(null);

    setLoadingLive(true);
    showNotice(null);
    try {
      const excludeContentIds = getUsedContentIds(mode, language);
      const response = await queueLiveRace({
        mode,
        language,
        duration,
        isPrivate: true,
        inviteCode: friendBattle.customInviteCode.trim(),
        password: friendBattle.password,
        excludeContentIds,
      });
      
      if (!response || !response.room) {
        throw new Error("Server response missing room details.");
      }

      setLiveRoom(response.room);
      // Record the picked content so it won't repeat until all passages are used
      recordUsedContentId(
        response.room?.contentId,
        mode,
        language,
        response.totalContentCount || 0
      );
      setTypingText('');
      setReplayFrames([]);
      setRaceResult(null);
      setRaceOver(false);
      setPhase('queued');
      queuedAtRef.current = Date.now();
      setQueueElapsed(0);
      setCountdownRemaining(Number(response.room?.countdown || LIVE_RACE_COUNTDOWN_FALLBACK));
      setTimeLeft(Number(response.room?.duration || duration));
      setFriendBattle((prev) => ({ ...prev, inviteCode: response.room.inviteCode || '' }));
      showNotice(
        response.message || `Private room created. Share invite code ${response.room.inviteCode} with your opponent.`,
        'success'
      );
      refreshFeed();
    } catch (error) {
      console.error("Error creating friend battle:", error);
      setPhase('lobby'); 
      showNotice(error.response?.data?.message || error.message || 'Could not create friend battle.', 'error');
    } finally {
      setLoadingLive(false);
    }
  };

  const joinFriendBattle = async () => {
    if (!currentUser?.id) {
      redirectToProfile();
      return;
    }
    isLeavingRef.current = false;
    isSubmittingRef.current = false;

    setLoadingLive(true);
    showNotice(null);
    try {
      const response = await queueLiveRace({
        inviteCode: friendBattle.inviteCode.trim(),
        password: friendBattle.password,
      });
      setLiveRoom(response.room);
      // Record the content used so the player won't see it again until all are cycled
      recordUsedContentId(
        response.room?.contentId,
        response.room?.mode || mode,
        response.room?.language || language,
        response.totalContentCount || 0
      );
      setTypingText('');
      setRaceResult(null);
      setRaceOver(false);
      setMode(response.room.mode || mode);
      setLanguage(response.room.language || language);
      setDuration(Number(response.room.duration || duration));
      setPhase('queued');
      queuedAtRef.current = Date.now();
      setQueueElapsed(0);
      setCountdownRemaining(Number(response.room?.countdown || LIVE_RACE_COUNTDOWN_FALLBACK));
      setTimeLeft(Number(response.room?.duration || duration));
      showNotice(
        response.message || (
          response.matched
            ? 'Joined successfully. Opponent connected — race is starting.'
            : 'Joined successfully. Waiting for the host to start.'
        ),
        response.matched ? 'success' : 'info'
      );
      refreshFeed();
    } catch (error) {
      const inviteCode = friendBattle.inviteCode.trim().toUpperCase();
      const redirectParams = new URLSearchParams();
      if (inviteCode) redirectParams.set('invite', inviteCode);
      if (friendBattle.password) redirectParams.set('password', friendBattle.password);
      const redirectPath = `/play${redirectParams.toString() ? `?${redirectParams.toString()}` : ''}`;
      const message = error.message || 'Could not join friend battle.';

      if (/unauthorized|sign in/i.test(message)) {
        showNotice('Please sign in first. Taking you to your profile.', 'info');
        navigate(`/profile?redirect=${encodeURIComponent(redirectPath)}`);
      } else if (/insufficient funds|need kes/i.test(message)) {
        showNotice('Top up your wallet to join this room. Taking you to your profile.', 'warning');
        navigate(`/profile?redirect=${encodeURIComponent(redirectPath)}&topup=1`);
      } else {
        showNotice(message, 'error');
      }
    } finally {
      setLoadingLive(false);
    }
  };

  const shareToWhatsApp = () => {
    if (!liveRoom?.inviteCode && !friendBattle.inviteCode) {
      return;
    }
    const inviteCode = liveRoom?.inviteCode || friendBattle.inviteCode;
    const roomPassword = liveRoom?.password || friendBattle.password;
    const inviteLink = `${window.location.origin}/play?invite=${encodeURIComponent(inviteCode)}${roomPassword ? `&password=${encodeURIComponent(roomPassword)}` : ''}`;
    const parts = [
      'Join my TypeArena friend battle.',
      `Invite code: ${inviteCode}`,
      roomPassword ? `Password: ${roomPassword}` : '',
      `Open: ${inviteLink}`,
    ].filter(Boolean);
    const message = parts.join(' ');
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const cancelPrivateRoom = async () => {
    if (!liveRoom?.id) {
      return;
    }
    setLoadingLive(true);
    try {
      const result = await cancelLiveRaceRoom(liveRoom.id);
      showNotice(result.message || 'Private room canceled.', 'info');
    } catch (error) {
      showNotice(error.message || 'Could not cancel private room.', 'error');
    } finally {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (heartbeatTimerRef.current) {
        window.clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      setLiveRoom(null);
      setRaceResult(null);
      setRaceOver(false);
      setTypingText('');
      setReplayFrames([]);
      setQueueElapsed(0);
      queuedAtRef.current = null;
      setPhase('lobby');
      setLoadingLive(false);
      await refreshFeed();
    }
  };

  const handleInputChange = (event) => {
    const value = event.target.value;
    const src = liveRoom?.text || generatedContent?.passage || '';
    const newLen = value.length;
    const prevLen = typingText.length;

    // Sound + streak + mistake tracking (only on forward typing)
    if (newLen > prevLen && src) {
      const typedChar = value[newLen - 1];
      const expectedChar = src[newLen - 1];
      const isCorrect = typedChar === expectedChar;
      if (soundEnabled) playSound(isCorrect ? 'key' : 'error');
      if (isCorrect) {
        setStreak((s) => {
          const newStreak = s + 1;
          // Commentator: streak milestones
          if (commentatorEnabled) {
            if (newStreak === 10) speakCommentary(COMMENTATOR_LINES.streak10);
            else if (newStreak === 25) speakCommentary(COMMENTATOR_LINES.streak25);
          }
          return newStreak;
        });
      } else {
        setStreak(0);
        if (expectedChar) {
          setMistakeMap((m) => ({ ...m, [expectedChar]: (m[expectedChar] || 0) + 1 }));
        }
        // Commentator: occasional error reaction (not every error — 1-in-6 chance)
        if (commentatorEnabled && Math.random() < 0.17) {
          speakCommentary(COMMENTATOR_LINES.error);
        }
      }

      // Commentator: progress milestones
      if (commentatorEnabled && src.length > 0) {
        const pct = newLen / src.length;
        const ms = commentatorMilestonesRef.current;
        if (!ms.m25 && pct >= 0.25) {
          ms.m25 = true;
          speakCommentary(COMMENTATOR_LINES.milestone25);
        } else if (!ms.m50 && pct >= 0.50) {
          ms.m50 = true;
          speakCommentary(COMMENTATOR_LINES.milestone50);
        } else if (!ms.m75 && pct >= 0.75) {
          ms.m75 = true;
          speakCommentary(COMMENTATOR_LINES.milestone75);
        }
      }
    }

    // WPM history for sparkline — record a point every ~2 seconds of elapsed time
    const elapsed = Math.max(1, duration - timeLeft);
    setWpmHistory((prev) => {
      const lastT = prev.length ? prev[prev.length - 1].t : 0;
      if (elapsed - lastT >= 2) {
        return [...prev, { t: elapsed, wpm: calculateWPM(value, elapsed) }];
      }
      return prev;
    });

    setTypingText(value);
    setFocusLost(false);
    setReplayFrames((prev) => [
      ...prev.slice(-11),
      { typedText: value, timestamp: new Date().toISOString() },
    ]);
    if (liveRoom?.id) {
      const sourceTextLength = Math.max(1, (liveRoom.text || '').length);
      const progress = Math.min(100, Math.round((value.length / sourceTextLength) * 100));
      const currentWpm = calculateWPM(value, Math.max(1, duration - timeLeft));
      const liveSourceText = liveRoom?.text || generatedContent?.passage || 'Type fast, type clean, and own the round.';
      const currentAccuracy = calculateAccuracy(liveSourceText, value);
      heartbeatPayloadRef.current = { progress, currentWpm, currentAccuracy };
      if (!heartbeatTimerRef.current) {
        heartbeatTimerRef.current = window.setTimeout(() => {
          heartbeatTimerRef.current = null;
          flushLiveHeartbeat();
        }, 180);
      }
    }
  };

  const myPlayer = currentUser?.id
    ? (liveRoom?.players?.find((player) => String(player.userId) === String(currentUser.id)) ?? null)
    : null;
  const opponent = liveRoom?.players?.find((player) => player.userId !== myPlayer?.userId);
  const hasSignatureInvites = Boolean(currentUser?.storePerks?.customInviteCodes);
  const equippedItems = currentUser?.equippedItems || {};
  const themePreset = THEME_PRESETS[equippedItems.theme] || THEME_PRESETS.default;
  const skinPreset = SKIN_PRESETS[equippedItems.skin] || SKIN_PRESETS.default;
  const avatarPreset = AVATAR_PRESETS[equippedItems.avatar] || AVATAR_PRESETS.default;
  const badgePreset = BADGE_PRESETS[equippedItems.badge] || BADGE_PRESETS.default;
  const frameClassName = FRAME_PRESETS[equippedItems.frame] || FRAME_PRESETS.default;
  const effectClassName = EFFECT_PRESETS[equippedItems.effect] || EFFECT_PRESETS.default;
  const arenaStyle = {
    ...themePreset.style,
    ...skinPreset.style,
  };
  const sourceText = liveRoom?.text || generatedContent?.passage || 'Type fast, type clean, and own the round.';
  const renderedText = useMemo(() => (
    sourceText.split('').map((char, index) => {
      let className = 'char untyped';
      if (index < typingText.length) {
        className = typingText[index] === char ? 'char correct' : 'char incorrect';
      } else if (index === typingText.length) {
        className = 'char current';
      }
      return (
        <span key={index} className={className}>
          {char === ' ' ? '\u00A0' : char}
        </span>
      );
    })
  ), [sourceText, typingText]);

  // Consistency score: 100 minus coefficient of variation of WPM history (lower variance = higher score)
  const consistencyScore = useMemo(() => {
    if (wpmHistory.length < 3) return null;
    const wpms = wpmHistory.map((p) => p.wpm);
    const mean = wpms.reduce((a, b) => a + b, 0) / wpms.length;
    if (mean === 0) return null;
    const variance = wpms.reduce((acc, w) => acc + (w - mean) ** 2, 0) / wpms.length;
    const cv = Math.sqrt(variance) / mean;
    return Math.max(0, Math.round((1 - cv) * 100));
  }, [wpmHistory]);

  const accuracyValue = calculateAccuracy(sourceText, typingText);
  const wpmValue = calculateWPM(typingText, Math.max(1, duration - timeLeft));
  const completionRate = Math.min(100, Math.round((typingText.length / Math.max(sourceText.length, 1)) * 100));
  const winnerName =
    liveRoom?.winnerUsername ||
    liveRoom?.players?.find((player) => String(player.userId) === String(liveRoom?.winnerUserId))?.username ||
    '';
  const equippedSummary = [
    themePreset.label,
    skinPreset.label || 'Default keyboard skin',
    badgePreset.label,
  ];

  const exportScoreCard = () => {
    if (!raceResult) return;
    const accentColor = themePreset.style?.['--arena-accent'] || '#22c55e';
    const goldColor = themePreset.style?.['--arena-gold'] || '#facc15';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&amp;family=DM+Sans:wght@400;600&amp;display=swap');
    </style>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0c1018"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <linearGradient id="accentLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${accentColor}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="0" y="0" width="6" height="1350" fill="${accentColor}" opacity="0.9"/>
  <rect x="80" y="200" width="920" height="3" fill="url(#accentLine)"/>
  <text x="80" y="120" fill="${accentColor}" font-size="28" font-family="'Space Mono', monospace" letter-spacing="6" opacity="0.7">TYPEARENA</text>
  <text x="80" y="280" fill="#f5f5f5" font-size="72" font-family="'DM Sans', sans-serif" font-weight="600">Race Complete</text>
  <text x="80" y="420" fill="${accentColor}" font-size="160" font-family="'Space Mono', monospace" font-weight="700">${Math.round(raceResult.wpm)}</text>
  <text x="80" y="490" fill="#f5f5f5" font-size="40" font-family="'DM Sans', sans-serif" opacity="0.6">WPM</text>
  <text x="80" y="600" fill="#f5f5f5" font-size="54" font-family="'DM Sans', sans-serif">${Number(raceResult.accuracy).toFixed(1)}% accuracy</text>
  <text x="80" y="700" fill="${goldColor}" font-size="38" font-family="'DM Sans', sans-serif">${raceResult.shareText}</text>
  <text x="80" y="1300" fill="#f5f5f5" font-size="28" font-family="'Space Mono', monospace" opacity="0.3">typearena.io</text>
</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `typearena-share-card-${Date.now()}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };
  

  return (
    <div className="play-container">
      {phase === 'lobby' && (
        <div className="mode-select">
          <h1>{practicePage ? 'Practice Arena' : 'Live Premium Typing Arena'}</h1>

          <div className="challenge-toolbar">
            <h2>
              {practicePage
                ? 'Choose your mode and launch a focused solo typing session'
                : 'Practice and compete in live typing battles'}
            </h2>
            <div className="challenge-toolbar__actions">
              <div className="duration-switch">
                {[30, 60, 120].map((item) => (
                  <button
                    key={item}
                    className={`duration-switch__btn ${duration === item ? 'active' : ''}`}
                    onClick={() => setDuration(item)}
                  >
                    {item}s
                  </button>
                ))}
                <input
                  type="number"
                  className="duration-switch__custom"
                  min={15}
                  max={300}
                  placeholder="Custom"
                  style={{ width: '72px', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid var(--arena-panel-border)', background: 'var(--arena-panel)', color: 'var(--arena-text)', fontSize: '0.85rem' }}
                  onChange={(e) => {
                    const v = Math.min(3600, Math.max(15, Number(e.target.value)));
                    if (v) setDuration(v);
                  }}
                />
              </div>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid var(--arena-panel-border)', background: 'var(--arena-panel)', color: 'var(--arena-text)', fontSize: '0.85rem' }}
                aria-label="Language"
              >
                {['english','swahili','french'].map((lang) => (
                  <option key={lang} value={lang}>{lang.charAt(0).toUpperCase() + lang.slice(1)}</option>
                ))}
              </select>
              <button
                className={`btn btn-sm ${soundEnabled ? 'btn-outline-primary' : 'btn-outline-danger'}`}
                onClick={() => setSoundEnabled((s) => !s)}
                title="Toggle typing sounds"
                style={{ fontSize: '0.8rem' }}
              >
                {soundEnabled ? '🔊 Sound On' : '🔇 Sound Off'}
              </button>
              <button
                className={`btn btn-sm ${commentatorEnabled ? 'btn-outline-primary' : 'btn-outline-danger'}`}
                onClick={() => {
                  setCommentatorEnabled((c) => {
                    const next = !c;
                    if (!next) window.speechSynthesis?.cancel();
                    return next;
                  });
                }}
                title="Toggle live commentator"
                style={{ fontSize: '0.8rem' }}
              >
                {commentatorEnabled ? '📣 Commentator On' : '🔕 Commentator Off'}
              </button>
            </div>
          </div>

          <div className="results-actions">
            <div className="practice-launcher">
              <button
                className="btn btn-outline-primary"
                onClick={() => {
                  if (!practicePage) {
                    navigate('/practice');
                    return;
                  }
                  setShowPracticeModes((current) => !current);
                }}
              >
                {practicePage ? 'Choose Practice Mode' : 'Start Practice'}
              </button>
              {showPracticeModes && (
                <div className="practice-menu">
                  {MODE_CONFIG.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`practice-menu__item ${mode === item.id ? 'active' : ''}`}
                      onClick={() => startPracticeRaceWithMode(item.id)}
                    >
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {practicePage ? (
              <button className="btn btn-primary" onClick={startPracticeRace} disabled={contentLoading}>
                {contentLoading ? <span className="arena-spinner" aria-label="Loading content…" /> : 'Start This Practice'}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={startLiveRace} disabled={loadingLive || contentLoading}>
                {loadingLive ? 'Joining Live Room…' : contentLoading ? <span className="arena-spinner" aria-label="Loading content…" /> : 'Join Live 1v1'}
              </button>
            )}
          </div>

          <p className="results-challenge arena-shortcut-hint">
            {contentLoading
              ? '⏳ Generating race content…'
              : `Current mode: ${MODE_CONFIG.find((item) => item.id === mode)?.label || 'Standard'} · ${duration}s · Press Enter to start`}
          </p>

          {practicePage && (
            <p className="results-challenge">
              This page is only for solo practice. Use the Play page for live races, friend battles, and private rooms.
            </p>
          )}

          {!practicePage && (
          <div className="friend-battle-card">
            <div className="live-board__header">
              <h2>Friend Battles + Private Rooms</h2>
            </div>
            <div className="friend-battle-grid">
              {hasSignatureInvites && (
                <input
                  value={friendBattle.customInviteCode}
                  onChange={(event) =>
                    setFriendBattle((prev) => ({ ...prev, customInviteCode: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12) }))
                  }
                  placeholder="Your custom invite code"
                />
              )}
              <input
                value={friendBattle.inviteCode}
                onChange={(event) =>
                  setFriendBattle((prev) => ({ ...prev, inviteCode: event.target.value.toUpperCase() }))
                }
                placeholder="Invite code"
              />
              <input
                value={friendBattle.password}
                onChange={(event) =>
                  setFriendBattle((prev) => ({ ...prev, password: event.target.value }))
                }
                placeholder="Private room password"
              />
            </div>
            <div className="results-actions">
              <button className="btn btn-primary" onClick={createFriendBattle} disabled={loadingLive}>
                Create Private Room
              </button>
              <button className="btn btn-outline-primary" onClick={joinFriendBattle} disabled={loadingLive || !friendBattle.inviteCode.trim()}>
                Join With Invite
              </button>
              <button className="btn btn-success" onClick={shareToWhatsApp} disabled={!liveRoom?.inviteCode && !friendBattle.inviteCode}>
                Share on WhatsApp
              </button>
            </div>
            <p className="results-challenge">
              {hasSignatureInvites
                ? 'Your Signature Invite Pass is active. You can create a private room with your own custom code.'
                : 'Invite code and private password work here for private matches. Buy Signature Invite Pass to create your own custom room code.'}
            </p>
          </div>
          )}

          {notice && (
            <div className={`arena-notice arena-notice--${notice.type || 'info'}`} role="status">
              {notice.type === 'error' && <span className="arena-notice__icon">⚠</span>}
              {notice.type === 'success' && <span className="arena-notice__icon">✓</span>}
              {notice.type === 'warning' && <span className="arena-notice__icon">!</span>}
              <span>{notice.message}</span>
            </div>
          )}

          {recentRaces.length > 0 && (
            <div className="live-board" style={{ marginTop: '1.5rem' }}>
              <div className="live-board__header">
                <h2>Recent Races</h2>
                <button className="btn btn-sm btn-outline-light" onClick={() => { localStorage.removeItem('typearena_recent_races'); setRecentRaces([]); }}>Clear</button>
              </div>
              <div className="live-board__grid">
                {recentRaces.map((r, i) => {
                  const pb = getPB(r.mode, r.language, r.duration);
                  const isPB = pb && Math.abs(pb.wpm - r.wpm) < 0.01;
                  return (
                    <div key={i} className="result-card">
                      <span className="result-label">{r.mode} · {r.language} · {r.duration}s {isPB ? '🏆 PB' : ''}</span>
                      <span className="result-value">{Number(r.wpm).toFixed(1)} WPM</span>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', opacity: 0.7 }}>{Number(r.accuracy).toFixed(1)}% accuracy · {new Date(r.date).toLocaleDateString()}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!practicePage && (
          <div className="live-board">
            <div className="live-board__header">
              <h2>Live Spectator Feed</h2>
              <button className="btn btn-sm btn-outline-light" onClick={refreshFeed}>
                Refresh
              </button>
            </div>
            <div className="live-board__grid">
              {liveFeed.slice(0, 6).map((room) => (
                <div key={room.id} className="result-card live-card">
                  <span className="result-label">{room.mode}</span>
                  <span className="result-value">{room.status}</span>
                  <p>
                    {room.players?.length || 0}/2 players | {room.spectators || 0} spectators
                  </p>
                  {room.status === 'racing' && (
                    <button
                      className="btn btn-sm btn-outline-light"
                      style={{ marginTop:'0.4rem', fontSize:'0.75rem' }}
                      onClick={() => navigate(`/spectate/${room.id}`)}
                    >
                      👁 Watch Live
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}
        </div>
      )}

      {phase === 'queued' && (
        <div className="race-results">
          {liveRoom?.status === 'countdown' || liveRoom?.status === 'racing' ? (
            <>
              <h1>Race Starting!</h1>
              <div className="countdown-display" style={{ fontSize: '5rem', fontWeight: 700, color: 'var(--arena-accent, #22c55e)', margin: '1rem 0' }}>
                {countdownRemaining > 0 ? countdownRemaining : 'GO!'}
              </div>
              <p className="results-challenge">Get ready — race begins in {Math.max(0, countdownRemaining)} seconds</p>
            </>
          ) : (
            <>
              <h1>Queued for Live Race</h1>
              <p className="results-challenge">{notice?.message || 'Waiting for an opponent to join your room.'}</p>
              {queueElapsed > 0 && (
                <p className="arena-queue-elapsed">
                  Waiting {queueElapsed}s
                  {queueElapsed >= 30 && !liveRoom?.isPrivate && (
                    <span className="arena-queue-timeout-hint"> — taking longer than usual. You can go back to the lobby and try again.</span>
                  )}
                </p>
              )}
            </>
          )}
          {(liveRoom?.inviteCode || friendBattle.inviteCode) && (
            <p className="results-challenge">Invite code: {liveRoom?.inviteCode || friendBattle.inviteCode}</p>
          )}
          <div className="results-actions">
            <button className="btn btn-success" onClick={shareToWhatsApp}>
              Share on WhatsApp
            </button>
            {liveRoom?.isPrivate ? (
              <button className="btn btn-outline-danger" onClick={cancelPrivateRoom} disabled={loadingLive}>
                {loadingLive ? 'Canceling Room…' : 'Cancel Room'}
              </button>
            ) : (
              <button className="btn btn-outline-danger" onClick={backToLobby} disabled={loadingLive}>
                Leave Queue
              </button>
            )}
            <button className="btn btn-secondary" onClick={backToLobby}>
              Back to Lobby
            </button>
          </div>
        </div>
      )}

      {phase === 'waiting' && (
        <div className="race-results">
          <h1>Result Submitted!</h1>
          <p className="results-challenge">Waiting for your opponent to finish...</p>
          {liveRoom?.players && (
            <div className="results-grid" style={{ marginTop: '1.5rem' }}>
              {liveRoom.players.map((player) => {
                const hasSubmitted = Boolean(player?.result);
                const isMe = String(player.userId) === String(currentUser?.id);
                return (
                  <div key={player.userId} className="result-card">
                    <span className="result-label">{isMe ? 'You' : (player.username || 'Opponent')}</span>
                    <span className="result-value" style={{ color: hasSubmitted ? 'var(--arena-accent, #22c55e)' : 'var(--arena-muted, #aaa)' }}>
                      {hasSubmitted ? '✓ Done' : '⏳ Racing...'}
                    </span>
                    {hasSubmitted && player.result?.wpm != null && (
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                        {Number(player.result.wpm).toFixed(1)} WPM · {Number(player.result.accuracy).toFixed(1)}%
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="results-challenge" style={{ marginTop: '1rem', fontSize: '0.85rem', opacity: 0.7 }}>
            Results will appear automatically once both players finish.
          </p>
        </div>
      )}

      {phase === 'racing' && (
        <div className={`race-arena ${frameClassName} ${effectClassName}`} style={arenaStyle}>
          <div className="arena-effect-layer" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div className="player-identity-card">
            <div className={`player-avatar-shell ${frameClassName}`}>
              <div className={`player-avatar ${avatarPreset.aura}`}>
                <span>{avatarPreset.mark}</span>
              </div>
            </div>
            <div className="player-identity-copy">
              <div className="player-identity-meta">
                <span className="player-theme-pill">{themePreset.label}</span>
                <span className="player-badge-pill">{badgePreset.label}</span>
              </div>
              <h2>{currentUser?.username || 'Guest Player'}</h2>
              <p>{equippedSummary.join(' | ')}</p>
            </div>
            <div className="player-identity-stats">
              <div>
                <span>Live WPM</span>
                <strong>{Number.isFinite(wpmValue) ? wpmValue.toFixed(1) : '0.0'}</strong>
              </div>
              <div>
                <span>Accuracy</span>
                <strong>{Number.isFinite(accuracyValue) ? accuracyValue.toFixed(1) : '100.0'}%</strong>
              </div>
              <div>
                <span>Progress</span>
                <strong>{completionRate}%</strong>
              </div>
            </div>
          </div>

          {/* Streak + WPM Sparkline + Live PB */}
          <div style={{ display:'flex', gap:'1rem', alignItems:'center', flexWrap:'wrap', margin:'0.5rem 0', padding:'0.5rem 0.75rem', background:'var(--arena-panel)', borderRadius:'10px', border:'1px solid var(--arena-panel-border)' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', minWidth:'60px' }}>
              <span style={{ fontSize:'0.7rem', color:'var(--arena-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Streak</span>
              <strong style={{ fontSize:'1.3rem', color: streak >= 10 ? 'var(--arena-gold)' : 'var(--arena-accent)' }}>{streak}</strong>
            </div>
            {wpmHistory.length >= 2 && (
              <svg width="120" height="36" viewBox={`0 0 120 36`} style={{ flex:'1', minWidth:'80px' }} aria-label="WPM sparkline">
                <polyline
                  fill="none"
                  stroke="var(--arena-accent)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  points={(() => {
                    const maxT = wpmHistory[wpmHistory.length - 1].t || 1;
                    const maxW = Math.max(...wpmHistory.map((p) => p.wpm), 1);
                    return wpmHistory.map((p) => {
                      const x = (p.t / maxT) * 118 + 1;
                      const y = 35 - (p.wpm / maxW) * 33;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    }).join(' ');
                  })()}
                />
              </svg>
            )}
            {(() => {
              const pb = getPB(mode, language, duration);
              if (!pb) return null;
              const ahead = wpmValue - pb.wpm;
              return (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', minWidth:'80px' }}>
                  <span style={{ fontSize:'0.7rem', color:'var(--arena-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>vs PB</span>
                  <strong style={{ fontSize:'1rem', color: ahead >= 0 ? 'var(--arena-accent)' : 'hsl(0 80% 55%)' }}>
                    {ahead >= 0 ? '+' : ''}{ahead.toFixed(1)} WPM
                  </strong>
                </div>
              );
            })()}
          </div>

          <div className="race-header">
            <div className="stats">
              <div className="stat">
                <span className="stat-label">Mode</span>
                <span className="stat-value live-mode">{mode}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Language</span>
                <span className="stat-value live-mode">{language}</span>
              </div>
              <div className="timer">
                <span className={`time ${timeLeft <= 10 ? 'danger' : ''}`}>{formatTime(timeLeft)}</span>
              </div>
            </div>
          </div>

          {liveRoom && (
            <div className="opponent-panel">
              <div className="opponent-panel__item">
                <span>You</span>
                <strong>{myPlayer?.progress || 0}%</strong>
              </div>
              <div className="opponent-panel__item">
                <span>{opponent?.username || 'Opponent'}</span>
                <strong>{opponent?.progress || 0}%</strong>
              </div>
              <div className="opponent-panel__item">
                <span>Spectators</span>
                <strong>{liveRoom.spectators || 0}</strong>
              </div>
            </div>
          )}

          <div className="typing-area">
            <div
              className="typing-stage"
              onClick={() => inputRef.current?.focus()}
              role="presentation"
            >
              {focusLost && !raceOver && (
                <div className="focus-lost-overlay" style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.72)', borderRadius:'inherit', zIndex:10, gap:'0.5rem', cursor:'pointer' }} onClick={() => { setFocusLost(false); inputRef.current?.focus(); }}>
                  <span style={{ fontSize:'2rem' }}>⏸</span>
                  <span style={{ color:'var(--arena-text)', fontWeight:600 }}>Window lost focus — click to resume</span>
                  <span style={{ color:'var(--arena-muted)', fontSize:'0.85rem' }}>Timer is still running</span>
                </div>
              )}
              {!typingText && !focusLost && (
                <div className="typing-stage__hint">
                  Tap here and start typing
                </div>
              )}
              <div className="display-text">
                {renderedText}
              </div>
              <textarea
                ref={inputRef}
                className="typing-input typing-input--overlay"
                value={typingText}
                onChange={handleInputChange}
                aria-label="Typing input"
                spellCheck="false"
                autoCapitalize="off"
                autoCorrect="off"
                disabled={raceOver}
              />
            </div>
            {!liveRoom?.text && generatedContent?.antiCheatHint && (
              <p className="results-challenge">{generatedContent.antiCheatHint}</p>
            )}
          </div>

          <div className="keyboard-preview">
            <div className="keyboard-preview__header">
              <h3>Live Keyboard Deck</h3>
              <p>Your equipped keyboard skin is rendered here while you type.</p>
            </div>
            <div className="keyboard-board" aria-label="On-screen keyboard">
              {KEYBOARD_LAYOUT.map((row, rowIndex) => (
                <div key={`row-${rowIndex}`} className="keyboard-row">
                  {row.map((keyLabel, keyIndex) => {
                    const normalizedKey = normalizeKeyboardKey(keyLabel);
                    const isActive = activeKeys.includes(normalizedKey);
                    const keyClass = [
                      'keyboard-key',
                      keyLabel === 'Backspace' || keyLabel === 'Tab' || keyLabel === 'CapsLock' || keyLabel === 'Enter' || keyLabel === 'Shift'
                        ? 'keyboard-key--wide'
                        : '',
                      keyLabel === 'Space' ? 'keyboard-key--space' : '',
                      isActive ? 'is-active' : '',
                    ].filter(Boolean).join(' ');
                    return (
                      <div key={`${keyLabel}-${keyIndex}`} className={keyClass}>
                        <span>{keyLabel === 'Space' ? 'Space Bar' : keyLabel}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="results-actions">
            <button className="btn btn-danger" onClick={finishRace}>
              Finish Race
            </button>
          </div>
        </div>
      )}

      {phase === 'results' && raceResult && (
        <div className={`race-results race-results--themed ${frameClassName} ${effectClassName}`} style={arenaStyle}>
          <div className="arena-effect-layer arena-effect-layer--results" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h1>Race Complete</h1>
          <p className="results-challenge">
            {raceResult?.winnerUserId
              ? `Winner: ${raceResult.winnerUsername || winnerName || 'Pending'}`
              : liveRoom?.id
              ? 'Waiting for winner confirmation...'
              : 'Results submitted.'}
          </p>

          <div className="results-grid">
            <div className="result-card">
              <span className="result-label">WPM</span>
              <span className="result-value">{Number(raceResult.wpm).toFixed(1)}</span>
            </div>
            <div className="result-card">
              <span className="result-label">Net WPM</span>
              <span className="result-value">{Number(raceResult.netWPM).toFixed(1)}</span>
            </div>
            <div className="result-card">
              <span className="result-label">Accuracy</span>
              <span className="result-value">{Number(raceResult.accuracy).toFixed(1)}%</span>
            </div>
            <div className="result-card">
              <span className="result-label">Winner Prize</span>
              <span className="result-value">
                KES {Number(raceResult.winnerPrize || 0).toLocaleString()}
              </span>
            </div>
          </div>

          {isNewPB && (
            <div style={{ textAlign:'center', padding:'0.6rem 1.2rem', background:'var(--arena-accent-soft)', border:'1px solid var(--arena-accent)', borderRadius:'10px', marginBottom:'0.75rem', fontWeight:700, color:'var(--arena-accent)', fontSize:'1.1rem' }}>
              🏆 New Personal Best!
            </div>
          )}

          {consistencyScore !== null && (
            <div className="results-grid" style={{ marginTop:'0.5rem' }}>
              <div className="result-card">
                <span className="result-label">Consistency</span>
                <span className="result-value">{consistencyScore}%</span>
              </div>
            </div>
          )}

          <p className="results-challenge">{raceResult.coachTip}</p>

          {Object.keys(mistakeMap).length > 0 && (
            <div className="live-board" style={{ marginTop:'1rem' }}>
              <div className="live-board__header">
                <h2>Mistake Breakdown</h2>
                <span className="results-challenge">Characters you missed most</span>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem', padding:'0.5rem 0' }}>
                {Object.entries(mistakeMap)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 12)
                  .map(([char, count]) => (
                    <div key={char} style={{ display:'flex', flexDirection:'column', alignItems:'center', background:'var(--arena-panel)', border:'1px solid var(--arena-panel-border)', borderRadius:'8px', padding:'0.4rem 0.7rem', minWidth:'44px' }}>
                      <span style={{ fontFamily:'monospace', fontSize:'1.1rem', fontWeight:700, color:'var(--arena-accent)' }}>{char === ' ' ? '␣' : char}</span>
                      <span style={{ fontSize:'0.75rem', color:'var(--arena-muted)' }}>{count}×</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {raceResult.standings?.length ? (
            <div className="results-standings">
              <div className="live-board__header">
                <h2>Final Standings</h2>
                <span className="results-challenge">Everyone in this battle can see the winner and final order.</span>
              </div>
              <div className="live-board__grid">
                {raceResult.standings.map((entry) => (
                  <div
                    key={entry.userId}
                    className={`result-card results-standing-card${entry.isWinner ? ' results-standing-card--winner' : ''}`}
                  >
                    <span className="result-label">
                      #{entry.rank} {entry.isWinner ? 'Winner' : 'Participant'}
                    </span>
                    <span className="result-value">{entry.username}</span>
                    <p className="results-standing-meta">
                      {entry.isCurrentUser ? 'You' : 'Opponent'} • {entry.wpm.toFixed(1)} WPM • {entry.accuracy.toFixed(1)}% accuracy
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="results-content-creator">
            <div className="result-card">
              <span className="result-label">Creator Hook</span>
              <p className="creator-copy">{raceResult.shareText}</p>
            </div>
          </div>

          {(raceResult.replayFrames || []).length > 0 && (
            <ReplayPlayer frames={raceResult.replayFrames} />
          )}

          <div className="results-actions">
            <button className="btn btn-success" onClick={exportScoreCard}>
              Export Score Card
            </button>
            <button className="btn btn-outline-primary" onClick={() => navigate(`/results/${raceResult.id}`)}>
              Open Result Page
            </button>
            <button className="btn btn-primary" onClick={backToLobby}>
              Back to Lobby
            </button>
            <button className="btn btn-secondary" onClick={startPracticeRace}>
              Race Again
            </button>
            {liveRoom?.id && (
              <button className="btn btn-outline-primary" onClick={() => {
                // Re-queue both players against each other using the same invite code
                setFriendBattle((prev) => ({ ...prev, inviteCode: liveRoom.inviteCode || '' }));
                backToLobby();
                setTimeout(() => {
                  if (liveRoom?.inviteCode) joinFriendBattle();
                  else startLiveRace();
                }, 300);
              }}>
                Rematch
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
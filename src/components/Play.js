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
const AFK_FORFEIT_MS = 15000; // #2 rage-quit/AFK: forfeit after 15s of no heartbeat
const DAILY_CHALLENGE_KEY = 'typearena_daily_challenge';
const WIN_STREAK_KEY = 'typearena_win_streak';

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

// ── NEW #E: also persists replayFrames alongside the PB ──────────────────
const savePB = (mode, language, duration, wpm, accuracy, frames = []) => {
  try {
    const store = JSON.parse(localStorage.getItem(PB_KEY) || '{}');
    const key = `${mode}__${language}__${duration}`;
    store[key] = { wpm, accuracy, date: new Date().toISOString(), frames };
    localStorage.setItem(PB_KEY, JSON.stringify(store));
  } catch {}
};

// ---------------------------------------------------------------------------
// Win streak helpers — persisted across sessions
// ---------------------------------------------------------------------------
const getWinStreak = () => {
  try { return JSON.parse(localStorage.getItem(WIN_STREAK_KEY) || '{"count":0,"lastDate":null}'); }
  catch { return { count: 0, lastDate: null }; }
};

const updateWinStreak = (won) => {
  try {
    const data = getWinStreak();
    const today = new Date().toDateString();
    if (won) {
      // Only count one win per day for the streak display
      const newCount = data.lastDate === today ? data.count : data.count + 1;
      const updated = { count: newCount, lastDate: today };
      localStorage.setItem(WIN_STREAK_KEY, JSON.stringify(updated));
      return updated;
    } else {
      const reset = { count: 0, lastDate: today };
      localStorage.setItem(WIN_STREAK_KEY, JSON.stringify(reset));
      return reset;
    }
  } catch { return { count: 0, lastDate: null }; }
};

// ---------------------------------------------------------------------------
// Daily challenge helpers — one shared passage per calendar day
// ---------------------------------------------------------------------------
const getDailyChallenge = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(DAILY_CHALLENGE_KEY) || 'null');
    const today = new Date().toDateString();
    if (stored && stored.date === today) return stored;
    return null;
  } catch { return null; }
};

const saveDailyChallenge = (entry) => {
  try {
    localStorage.setItem(DAILY_CHALLENGE_KEY, JSON.stringify({ ...entry, date: new Date().toDateString() }));
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
// Shared AudioContext — single instance used by both sound effects and the
// orchestra. Creating multiple AudioContexts on the same page wastes OS
// resources and causes the two engines to fight over the destination node.
// ---------------------------------------------------------------------------
let _audioCtx = null;
const _getAudioCtx = () => {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { _audioCtx = null; }
  }
  if (_audioCtx && _audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
};

// Module-level flag mirroring the soundEnabled React state.
// Updated by the Play component via setSoundEnabledGlobal so that playSound
// can respect the setting without requiring every call site to pass it.
let _soundEnabled = true;
const setSoundEnabledGlobal = (v) => { _soundEnabled = v; };

const playSound = (type) => {
  if (!_soundEnabled) return;
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
// Arena Orchestra — procedural FIFA-style orchestral background music
// Built entirely with Web Audio API: no files, no external deps.
//
// Architecture:
//   • _arenaOrchestraCtx  — shared AudioContext (same as sound effects)
//   • masterGain          — top-level volume fader
//   • Lobby layer         — slow strings + pad (calm, majestic)
//   • Race layer          — driving brass ostinato + percussion (intense)
//   • Each layer crossfades on phase change
// ---------------------------------------------------------------------------

const _orchestra = (() => {
  let ctx = null;
  let masterGain = null;
  let lobbyNodes = [];
  let raceNodes = [];
  let lobbyGain = null;
  let raceGain = null;
  let running = false;
  let currentPhase = 'lobby'; // 'lobby' | 'race'
  let enabled = true;

  const getCtx = () => {
    // Always reuse the shared AudioContext so the orchestra and sound effects
    // share the same audio graph — avoids dual-context resource waste.
    ctx = _getAudioCtx();
    return ctx;
  };

  // Smoothly ramp a gain node
  const ramp = (gainNode, target, duration = 1.5) => {
    const c = getCtx();
    if (!c || !gainNode) return;
    gainNode.gain.cancelScheduledValues(c.currentTime);
    gainNode.gain.setValueAtTime(gainNode.gain.value, c.currentTime);
    gainNode.gain.linearRampToValueAtTime(target, c.currentTime + duration);
  };

  // Create a looping oscillator with vibrato
  const makeOsc = (frequency, type, gainValue, vibratoHz = 0, vibratoDepth = 0) => {
    const c = getCtx();
    if (!c) return null;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    g.gain.value = gainValue;
    osc.connect(g);

    if (vibratoHz > 0) {
      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      lfo.frequency.value = vibratoHz;
      lfoGain.gain.value = vibratoDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
    }
    return { osc, gain: g };
  };

  // Low-pass filtered noise for crowd/string texture
  const makeFilteredNoise = (gainValue, cutoff = 800) => {
    const c = getCtx();
    if (!c) return null;
    const bufferSize = c.sampleRate * 4;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 0.8;
    const g = c.createGain();
    g.gain.value = gainValue;
    source.connect(filter);
    filter.connect(g);
    return { source, gain: g, filter };
  };

  // Slow rhythmic pulse — simulates a distant bass drum
  const makeRhythmicPulse = (gainNode, bpm = 72) => {
    const c = getCtx();
    if (!c) return null;
    const intervalMs = (60 / bpm) * 1000;
    let beat = 0;
    const tick = () => {
      if (!running || !enabled) return;
      const t = c.currentTime;
      const pulse = c.createOscillator();
      const pg = c.createGain();
      pulse.type = 'sine';
      pulse.frequency.value = beat % 4 === 0 ? 55 : 44; // kick pattern
      pulse.connect(pg);
      pg.connect(gainNode);
      pg.gain.setValueAtTime(0, t);
      pg.gain.linearRampToValueAtTime(0.18, t + 0.02);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      pulse.start(t);
      pulse.stop(t + 0.3);
      beat++;
    };
    tick();
    return window.setInterval(tick, intervalMs);
  };

  // ── LOBBY LAYER — calm, slow strings + deep pad ───────────────────────────
  // Chord: D minor (D2, F2, A2, C3) — majestic, slightly melancholic FIFA feel
  const LOBBY_CHORD = [73.4, 87.3, 110, 130.8]; // D2 F2 A2 C3
  const buildLobbyLayer = () => {
    const c = getCtx();
    if (!c) return;
    // Disconnect any previous lobby nodes before rebuilding
    lobbyNodes.forEach((n) => { try { n.stop(); } catch {} });
    lobbyNodes = [];
    lobbyGain = c.createGain();
    lobbyGain.gain.value = 0;
    lobbyGain.connect(masterGain);

    const nodes = [];

    // Pad strings — triangle waves (warm, string-like)
    LOBBY_CHORD.forEach((freq, i) => {
      const n = makeOsc(freq, 'triangle', 0.06 + (i === 0 ? 0.04 : 0), 5.2 + i * 0.3, 1.2);
      if (!n) return;
      n.gain.connect(lobbyGain);
      n.osc.start();
      nodes.push(n.osc);
    });

    // Octave bass pad
    const bass = makeOsc(36.7, 'sine', 0.10); // D1
    if (bass) { bass.gain.connect(lobbyGain); bass.osc.start(); nodes.push(bass.osc); }

    // Soft filtered noise (crowd ambience murmur)
    const noise = makeFilteredNoise(0.018, 320);
    if (noise) { noise.gain.connect(lobbyGain); noise.source.start(); nodes.push(noise.source); }

    // Slow shimmer on top (high triangle — like a glockenspiel ghost note)
    const shimmer = makeOsc(523.25, 'triangle', 0.012, 0.2, 4); // C5
    if (shimmer) { shimmer.gain.connect(lobbyGain); shimmer.osc.start(); nodes.push(shimmer.osc); }

    lobbyNodes = nodes;
  };

  // ── RACE LAYER — driving brass ostinato + percussion ─────────────────────
  // Chord: D minor — same root, but brighter (sawtooth brass feel)
  const RACE_CHORD = [146.8, 174.6, 220, 261.6]; // D3 F3 A3 C4
  let raceRhythmId = null;
  const buildRaceLayer = () => {
    const c = getCtx();
    if (!c) return;
    // Disconnect any previous race nodes before rebuilding
    raceNodes.forEach((n) => { try { n.stop(); } catch {} });
    raceNodes = [];
    if (raceRhythmId) { window.clearInterval(raceRhythmId); raceRhythmId = null; }
    raceGain = c.createGain();
    raceGain.gain.value = 0;

    // Compressor for punchy loudness
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    comp.connect(masterGain);
    raceGain.connect(comp);

    const nodes = [];

    // Driving brass ostinato — sawtooth, slightly detuned pairs
    RACE_CHORD.forEach((freq, i) => {
      const n1 = makeOsc(freq, 'sawtooth', 0.045, 0, 0);
      const n2 = makeOsc(freq * 1.008, 'sawtooth', 0.038, 0, 0); // detune for thickness
      if (n1) { n1.gain.connect(raceGain); n1.osc.start(); nodes.push(n1.osc); }
      if (n2) { n2.gain.connect(raceGain); n2.osc.start(); nodes.push(n2.osc); }
    });

    // Octave brass bass
    const brassBass = makeOsc(73.4, 'sawtooth', 0.09); // D2
    if (brassBass) { brassBass.gain.connect(raceGain); brassBass.osc.start(); nodes.push(brassBass.osc); }

    // High tension strings (high Dm arpeggio texture via filtered noise)
    const tension = makeFilteredNoise(0.028, 1800);
    if (tension) { tension.gain.connect(raceGain); tension.source.start(); nodes.push(tension.source); }

    // Rhythmic pulse (bass drum feel) at 96bpm — stadium stomp
    raceRhythmId = makeRhythmicPulse(raceGain, 96);

    raceNodes = nodes;
  };

  // ── Public API ────────────────────────────────────────────────────────────
  const start = () => {
    const c = getCtx();
    if (!c || running || !enabled) return;
    running = true;

    masterGain = c.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(c.destination);

    buildLobbyLayer();
    buildRaceLayer();

    // Fade master in over 2s
    ramp(masterGain, 0.38, 2.0);
    // Start on lobby layer
    ramp(lobbyGain, 1.0, 2.5);
    currentPhase = 'lobby';
  };

  const toRace = () => {
    if (!running || currentPhase === 'race') return;
    currentPhase = 'race';
    ramp(lobbyGain, 0.0, 2.2);
    ramp(raceGain, 1.0, 1.8);
    // Boost master slightly for race intensity
    ramp(masterGain, 0.52, 2.0);
  };

  const toLobby = () => {
    if (!running || currentPhase === 'lobby') return;
    currentPhase = 'lobby';
    ramp(raceGain, 0.0, 2.5);
    ramp(lobbyGain, 1.0, 2.0);
    ramp(masterGain, 0.38, 2.5);
  };

  const stop = () => {
    if (!running) return;
    running = false; // mark stopped immediately so start() can be called again
    ramp(masterGain, 0, 1.5);
    setTimeout(() => {
      [...lobbyNodes, ...raceNodes].forEach((n) => { try { n.stop(); } catch {} });
      if (raceRhythmId) window.clearInterval(raceRhythmId);
      lobbyNodes = []; raceNodes = [];
      masterGain = null; // force fresh graph on next start()
    }, 1600);
  };

  const setEnabled = (val) => {
    enabled = val;
    if (!val) {
      stop();
    } else {
      // Re-enable: start fresh if AudioContext is available
      const c = getCtx();
      if (c) start();
    }
  };

  const setVolume = (vol) => {
    // vol: 0.0 – 1.0
    if (masterGain) ramp(masterGain, Math.max(0, Math.min(1, vol)) * (currentPhase === 'race' ? 0.52 : 0.38), 0.5);
  };

  return { start, stop, toRace, toLobby, setEnabled, setVolume };
})();

// ---------------------------------------------------------------------------
// Commentator engine — eFootball-style live match announcer via Web Speech API
// Speaks in short punchy chains like a real match commentator:
//   "Oh!  What a move!  Incredible!  The crowd is on its feet!"
// ---------------------------------------------------------------------------

// Pick a random item from an array
const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------------------
// speakSequence — chains an array of short sentences with natural gaps,
// exactly like the eFootball / FIFA commentator delivery style.
//   sentences : string[]  — each item is one short punchy line
//   opts.rate  : number   — speech rate (default 1.08 — authoritative but urgent)
//   opts.pitch : number   — voice pitch (default 0.92 — deep, commanding)
//   opts.gap   : number   — ms between sentences (default 220)
//   opts.force : boolean  — skip cooldown check
// ---------------------------------------------------------------------------
let _commentatorBusy = false;
let _commentatorCancelFlag = false;
let _commentatorLastSpokenAt = 0;
const _COMMENTATOR_COOLDOWN_MS = 3500;
// Hard-disable flag — set when the user turns off the commentator.
// Unlike _commentatorCancelFlag (which is reset by each new speakSequence call),
// this one is only ever changed by the enable/disable toggle.
let _commentatorDisabled = false;

const _getCommentatorVoice = () => {
  const voices = window.speechSynthesis.getVoices();
  // Priority list — deep authoritative English voices (eFootball / FIFA style)
  const priority = [
    'google uk english male',
    'microsoft george',
    'microsoft ryan',
    'daniel',                // macOS deep male
    'david',                 // Windows deep male
    'james',
    'mark',
    'reed',
    'alex',
  ];
  for (const name of priority) {
    const v = voices.find((vx) => vx.name.toLowerCase().includes(name));
    if (v) return v;
  }
  // Fallback: any male-labelled English voice
  return (
    voices.find((v) => /male/i.test(v.name) && /en/i.test(v.lang)) ||
    voices.find((v) => /en/i.test(v.lang)) ||
    null
  );
};

const speakSequence = (sentences, opts = {}) => {
  if (!window.speechSynthesis) return;
  if (_commentatorDisabled) return;  // hard-disabled by user setting — bail immediately
  const { force = false, rate = 1.08, pitch = 0.92, gap = 220, volume = 1.0 } = opts;

  const now = Date.now();
  if (!force && _commentatorBusy) return;
  if (!force && now - _commentatorLastSpokenAt < _COMMENTATOR_COOLDOWN_MS) return;

  _commentatorCancelFlag = true; // signal any running chain to stop
  window.speechSynthesis.cancel();

  const voice = _getCommentatorVoice();
  _commentatorCancelFlag = false;
  _commentatorBusy = true;
  _commentatorLastSpokenAt = now;

  const speak = (index) => {
    if (_commentatorCancelFlag || index >= sentences.length) {
      _commentatorBusy = false;
      return;
    }
    const utter = new SpeechSynthesisUtterance(sentences[index]);
    utter.rate = rate;
    utter.pitch = pitch;
    utter.volume = volume;
    if (voice) utter.voice = voice;
    utter.onend = () => {
      if (_commentatorCancelFlag) { _commentatorBusy = false; return; }
      setTimeout(() => speak(index + 1), gap);
    };
    utter.onerror = () => { _commentatorBusy = false; };
    window.speechSynthesis.speak(utter);
  };

  speak(0);
};

// Convenience: single random line from a pool (legacy call sites)
// eslint-disable-next-line no-unused-vars
const speakCommentary = (lines, opts = {}) => {
  speakSequence([_pick(lines)], opts);
};

// ---------------------------------------------------------------------------
// Commentator script library — arrays of SHORT punchy sentences per moment
// Each entry in the outer array is one possible "take" (array of sentences).
// ---------------------------------------------------------------------------
const SCRIPT = {
  // Welcome sequence — personalised, then feature tour
  welcome: (name) => [
    `${name}!`,
    `Welcome to TypeArena!`,
    `The crowd is on its feet!`,
    `You've just entered the fastest typing arena on the planet!`,
  ],
  featureTour: () => [
    `Here's what's waiting for you.`,
    `Jump into a live one-versus-one battle — real opponent, real prize money!`,
    `Create a private match and challenge your friends directly.`,
    `Compete in tournaments — multiple rounds, one champion.`,
    `Or sharpen your skills in solo practice mode, any time you want.`,
    `The arena is yours.`,
    `Now let's race!`,
  ],

  raceStart: [
    [`And they're OFF!`, `Fingers to the keys!`, `Every millisecond counts!`],
    [`GO GO GO!`, `The race has BEGUN!`, `No room for error now!`],
    [`The clock starts NOW!`, `Push hard from the first keystroke!`, `The crowd is watching!`],
    [`AWAY they go!`, `Blazing speed right from the start!`, `This is what we came for!`],
  ],

  milestone25: [
    [`Twenty-five percent done!`, `Looking sharp!`, `Keep that rhythm going!`],
    [`Quarter of the way through!`, `The momentum is building!`, `Don't you dare slow down!`],
    [`One quarter in!`, `Excellent pace!`, `The crowd is loving this!`],
  ],

  milestone50: [
    [`HALFWAY!`, `Absolutely incredible pace!`, `Can they hold it to the end?!`],
    [`Fifty percent!`, `Right in the thick of it!`, `This is where champions are made!`],
    [`The halfway mark!`, `The crowd rises!`, `Everything is on the line from here!`],
  ],

  milestone75: [
    [`Seventy-five percent!`, `In the HOME STRETCH now!`, `Don't let up — the finish is RIGHT THERE!`],
    [`Three quarters done!`, `The crowd is DEAFENING!`, `One final push!`],
    [`Almost there!`, `This is where LEGENDS separate from the rest!`, `COME ON!`],
  ],

  streak10: [
    [`Ten in a ROW!`, `Not a single mistake!`, `The crowd erupts!`],
    [`Flawless!`, `Ten consecutive perfect keystrokes!`, `This player is ON FIRE!`],
  ],

  streak25: [
    [`TWENTY-FIVE PERFECT!`, `This is ABSOLUTE DOMINANCE!`, `Somebody call the record books!`],
    [`Twenty-five in a row!`, `Unbelievable accuracy!`, `The arena has NEVER seen anything like it!`],
  ],

  error: [
    [`Ohhh!`, `A slip!`, `Shake it off — champions recover!`],
    [`Mistake!`, `But there's still time!`, `Dig in and push through!`],
    [`Oh no!`, `A rare error!`, `Back on track — NOW!`],
  ],

  finish: [
    [`AND IT'S OVER!`, `What a performance!`, `The crowd is absolutely ELECTRIC!`],
    [`THE RACE IS COMPLETE!`, `An outstanding display of speed and accuracy!`, `Give it up for this racer!`],
    [`DONE!`, `Breathtaking!`, `Ladies and gentlemen — that was TypeArena at its finest!`],
  ],

  waiting: [
    [`Searching for an opponent.`, `Someone out there brave enough to face you today?`, `The crowd holds its breath!`],
    [`The challenger is being located.`, `The arena is buzzing with anticipation!`],
  ],
};

// Pre-load voices (Chrome requires a trigger before voices are populated)
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
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('typearena_sound') !== 'false');
  // Keep the module-level flag in sync so playSound always knows the current setting
  useEffect(() => { setSoundEnabledGlobal(soundEnabled); }, [soundEnabled]);
  const [commentatorEnabled, setCommentatorEnabled] = useState(() => localStorage.getItem('typearena_commentator') !== 'false');
  const [musicEnabled, setMusicEnabled] = useState(() => localStorage.getItem('typearena_music') !== 'false');

  // React to settings changed in TypeProfile (same tab or another tab)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'typearena_sound') {
        const next = e.newValue !== 'false';
        setSoundEnabledGlobal(next); // sync module flag immediately, no render gap
        setSoundEnabled(next);
      }
      if (e.key === 'typearena_music')        setMusicEnabled(e.newValue !== 'false');
      if (e.key === 'typearena_commentator')  setCommentatorEnabled(e.newValue !== 'false');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Stop/start orchestra when music setting changes
  useEffect(() => {
    _orchestra.setEnabled(musicEnabled);
  }, [musicEnabled]);

  // Cancel speech and hard-disable when commentator is toggled off
  useEffect(() => {
    if (!commentatorEnabled) {
      _commentatorDisabled = true;
      _commentatorCancelFlag = true;
      window.speechSynthesis?.cancel();
      _commentatorBusy = false;
    } else {
      _commentatorDisabled = false;
      _commentatorCancelFlag = false;
    }
  }, [commentatorEnabled]);
  const commentatorMilestonesRef = useRef({ m25: false, m50: false, m75: false });
  const [focusLost, setFocusLost] = useState(false);
  const [streak, setStreak] = useState(0);
  const [wpmHistory, setWpmHistory] = useState([]);       // [{t, wpm}] for sparkline
  const [isNewPB, setIsNewPB] = useState(false);
  const [mistakeMap, setMistakeMap] = useState({});       // char → count
  const [recentRaces, setRecentRaces] = useState(() => getRecentRaces());
  const [pendingRematch, setPendingRematch] = useState(false); // triggers rematch after backToLobby settles
  // ── Feature #1: WPM sparkline is already collected in wpmHistory — rendered below ──
  // ── Feature #2: AFK/forfeit detection state ────────────────────────────────
  const [afkWarning, setAfkWarning] = useState(false);
  const lastHeartbeatRef = useRef(Date.now());
  // ── Feature #3: Spectator mode state ──────────────────────────────────────
  const [spectateRoom, setSpectateRoom] = useState(null);
  const [spectateData, setSpectateData] = useState(null);
  const spectateIntervalRef = useRef(null);
  // ── Feature #4: Daily challenge state ─────────────────────────────────────
  const [dailyChallenge, setDailyChallenge] = useState(() => getDailyChallenge());
  const [showDailyChallenge, setShowDailyChallenge] = useState(false);
  // ── Feature #5: Custom text / paste-your-own ──────────────────────────────
  const [customText, setCustomText] = useState('');
  const [useCustomText, setUseCustomText] = useState(false);
  const [showCustomTextPanel, setShowCustomTextPanel] = useState(false);
  // ── Feature #6: WPM skill-based matchmaking ───────────────────────────────
  const [wpmFilter, setWpmFilter] = useState({ min: 0, max: 300 });
  const [showWpmFilter, setShowWpmFilter] = useState(false);
  // ── Feature #7: Share card (PNG via canvas) — exportScoreCard handles this ─
  // ── Feature #8: Keyboard heatmap on results ───────────────────────────────
  const [showHeatmap, setShowHeatmap] = useState(false);
  // ── NEW #A: Penalty Mode — backspace disabled ──────────────────────────────
  const [penaltyMode, setPenaltyMode] = useState(false);
  // ── NEW #B: Keyboard shortcut overlay ─────────────────────────────────────
  const [showShortcuts, setShowShortcuts] = useState(false);
  // ── NEW #D: Post-race AI coaching ─────────────────────────────────────────
  const [aiCoaching, setAiCoaching] = useState(null);   // null | 'loading' | string
  const [aiCoachingError, setAiCoachingError] = useState(false);
  // ── NEW #E: Ghost race — replay personal best ──────────────────────────────
  const [ghostFrames, setGhostFrames] = useState([]);      // pb replay frames for this session
  const [ghostIndex, setGhostIndex] = useState(0);         // which frame the ghost is on
  const ghostIntervalRef = useRef(null);
  // ── Feature #10: Win streak ───────────────────────────────────────────────
  const [winStreak, setWinStreak] = useState(() => getWinStreak());
  // ────────────────────────────────────────────────────────────────────────────

  // activeKeys is stored in a ref and applied directly to DOM to avoid
  // triggering a React re-render on every single keydown/keyup event.
  const activeKeysRef = useRef([]);
  const [activeKeys, setActiveKeys] = useState([]);

  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const heartbeatPayloadRef = useRef(null);
  const heartbeatInFlightRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const isLeavingRef = useRef(false);
  const queuedAtRef = useRef(null); // tracks when the user entered queued phase
  const [queueElapsed, setQueueElapsed] = useState(0); // seconds waiting in queue

  // Typed notice helper — keeps callsites clean
  const showNotice = useCallback((message, type = 'info') => {
    setNotice(message ? { message, type } : null);
  }, []);

  useEffect(() => {
    fetchCurrentUser().then(setCurrentUser).catch(() => {});
  }, []);

  // Start background music on first interaction — autoplay policy safe because
  // the AudioContext is created inside a user-gesture handler
  useEffect(() => {
    if (!musicEnabled) return;
    const tryStart = () => {
      _orchestra.start();
      window.removeEventListener('click', tryStart);
      window.removeEventListener('keydown', tryStart);
    };
    if (_audioCtx && _audioCtx.state === 'running') {
      _orchestra.start();
    } else {
      window.addEventListener('click', tryStart, { once: true });
      window.addEventListener('keydown', tryStart, { once: true });
    }
    return () => {
      window.removeEventListener('click', tryStart);
      window.removeEventListener('keydown', tryStart);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Commentator: fire welcome + feature tour once when the user's name becomes available
  const _welcomeFiredRef = React.useRef(false);
  useEffect(() => {
    if (!commentatorEnabled) return;
    if (_welcomeFiredRef.current) return;
    // Fire as soon as we have a name; fall back to "Champion" for guests
    const name = currentUser?.username || currentUser?.name || null;
    if (currentUser === null) return; // still loading — wait
    _welcomeFiredRef.current = true;
    const displayName = name || 'Champion';
    const timer = window.setTimeout(() => {
      // Part 1 — personalised welcome (force so it cuts through anything)
      speakSequence(SCRIPT.welcome(displayName), { force: true, rate: 1.05, pitch: 0.88, gap: 180 });
      // Part 2 — feature tour starts after the welcome finishes (~4 s)
      window.setTimeout(() => {
        if (!_commentatorCancelFlag) {
          speakSequence(SCRIPT.featureTour(), { force: true, rate: 1.0, pitch: 0.9, gap: 260 });
        }
      }, 4200);
    }, 900);
    return () => window.clearTimeout(timer);
  // Re-run when currentUser resolves (goes from undefined/null to an object)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, commentatorEnabled]);

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

  // Rematch: once backToLobby() has settled (phase === 'lobby') and a rematch
  // was requested, fire joinFriendBattle. Using an effect avoids the fragile
  // setTimeout that previously fired against potentially stale state.
  useEffect(() => {
    if (!pendingRematch || phase !== 'lobby') return;
    setPendingRematch(false);
    joinFriendBattle();
  // joinFriendBattle is stable (useCallback); intentionally excluding it from
  // deps to avoid re-triggering when it recreates due to other state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRematch, phase]);

  const redirectToProfile = useCallback(() => {
    const redirectPath = `${location.pathname}${location.search || ''}`;
    showNotice('Sign in first to play, join live races, or compete in private rooms.', 'info');
    navigate(`/profile?redirect=${encodeURIComponent(redirectPath)}`);
  }, [location.pathname, location.search, navigate, showNotice]);

  useEffect(() => {
    if (phase !== 'racing') {
      activeKeysRef.current = [];
      setActiveKeys([]);
      return undefined;
    }

    let rafId = null;
    const flushKeys = () => {
      setActiveKeys([...activeKeysRef.current]);
      rafId = null;
    };
    const scheduleFlush = () => {
      if (!rafId) rafId = window.requestAnimationFrame(flushKeys);
    };

    const handleWindowKeyDown = (event) => {
      const normalized = normalizeKeyboardKey(event.key);
      if (!normalized) return;
      if (!activeKeysRef.current.includes(normalized)) {
        activeKeysRef.current = [...activeKeysRef.current, normalized];
        scheduleFlush();
      }
    };

    const handleWindowKeyUp = (event) => {
      const normalized = normalizeKeyboardKey(event.key);
      if (!normalized) return;
      activeKeysRef.current = activeKeysRef.current.filter((item) => item !== normalized);
      scheduleFlush();
    };

    const handleWindowBlur = () => {
      activeKeysRef.current = [];
      setActiveKeys([]);
      setFocusLost(true);
    };
    const handleWindowFocus = () => setFocusLost(false);

    window.addEventListener('keydown', handleWindowKeyDown);
    window.addEventListener('keyup', handleWindowKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
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
          // NOTE: we intentionally do NOT call recordUsedContentId here.
          // The ID is recorded when the race actually starts (in startPracticeRace /
          // startLiveRace) so that merely previewing content in the lobby doesn't
          // exhaust the rotation pool.
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    };
    loadGeneratedContent();
    return () => { cancelled = true; };
  }, [language, mode, phase]);

  
  // Refs that mirror fast-changing state so useCallback dependencies stay stable
  const typingTextRef = useRef(typingText);
  const timeLeftRef   = useRef(timeLeft);
  const replayFramesRef = useRef(replayFrames);
  useEffect(() => { typingTextRef.current   = typingText;   }, [typingText]);
  useEffect(() => { timeLeftRef.current     = timeLeft;     }, [timeLeft]);
  useEffect(() => { replayFramesRef.current = replayFrames; }, [replayFrames]);

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

    // Read from refs so this callback stays stable across keystrokes
    const currentTypingText = typingTextRef.current;
    const currentTimeLeft   = timeLeftRef.current;
    const currentReplayFrames = replayFramesRef.current;

    const fallbackWpm = calculateWPM(currentTypingText, Math.max(1, duration - currentTimeLeft));
    const fallbackAccuracy = calculateAccuracy(
      room?.text || generatedContent?.passage || MODE_CONFIG.find((item) => item.id === mode)?.description || '',
      currentTypingText
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
      replayFrames: currentReplayFrames,
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
  }, [buildRoomStandings, currentUser?.id, duration, generatedContent?.passage, language, mode]);


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
            savePB(mode, language, duration, wpm, accuracy, replayFrames);
            setIsNewPB(true);
        }

        // #10 win streak — solo race always counts as a "win"
        const updatedStreak = updateWinStreak(true);
        setWinStreak(updatedStreak);

        // Play finish sound
        playSound('finish');
        if (commentatorEnabled) {
          setTimeout(() => {
          const _finishName = currentUser?.username || currentUser?.name || null;
          const _finishScript = _finishName
            ? [_finishName + '!', ..._pick(SCRIPT.finish)]
            : _pick(SCRIPT.finish);
          speakSequence(_finishScript, { force: true, rate: 1.12, pitch: 0.88, gap: 200 });
        }, 600);
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

  // Stop music when component unmounts (navigate away)
  useEffect(() => () => { _orchestra.stop(); }, []);

  // ── Feature #2: AFK / rage-quit penalty detection ─────────────────────────
  // Every keystroke updates lastHeartbeatRef. If 15s pass with no activity
  // during a live race, auto-forfeit and show a warning banner.
  useEffect(() => {
    if (phase !== 'racing' || !liveRoom?.id) return undefined;
    lastHeartbeatRef.current = Date.now();
    const afkCheck = window.setInterval(() => {
      if (Date.now() - lastHeartbeatRef.current > AFK_FORFEIT_MS) {
        setAfkWarning(true);
        window.clearInterval(afkCheck);
        // Auto-forfeit: submit a 0-WPM result to protect prize integrity
        submitLiveRaceResult(liveRoom.id, { wpm: 0, accuracy: 0, forfeited: true }).catch(() => {});
        backToLobby();
      }
    }, 3000);
    return () => window.clearInterval(afkCheck);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, liveRoom?.id]);

  // ── Feature #3: Spectator polling ─────────────────────────────────────────
  const watchRoom = useCallback((roomId) => {
    setSpectateRoom(roomId);
    const poll = async () => {
      try {
        const room = await fetchLiveRaceRoom(roomId);
        setSpectateData(room);
        if (room?.status === 'completed') {
          window.clearInterval(spectateIntervalRef.current);
        }
      } catch {}
    };
    poll();
    spectateIntervalRef.current = window.setInterval(poll, 2000);
  }, []);

  const stopWatching = useCallback(() => {
    window.clearInterval(spectateIntervalRef.current);
    setSpectateRoom(null);
    setSpectateData(null);
  }, []);

  // Clean up spectator polling on unmount
  useEffect(() => () => window.clearInterval(spectateIntervalRef.current), []);

  // ── Feature #4: Daily challenge loader ────────────────────────────────────
  const loadDailyChallenge = useCallback(async () => {
    const cached = getDailyChallenge();
    if (cached) { setDailyChallenge(cached); setShowDailyChallenge(true); return; }
    try {
      const content = await generateRaceContent('standard', language, {});
      const entry = { passage: content.passage, id: content.id, language };
      saveDailyChallenge(entry);
      setDailyChallenge(entry);
      setShowDailyChallenge(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

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
      if (e.key === '?' && !e.target.closest('input, textarea, button')) {
        setShowShortcuts((v) => !v);
      }
      if (e.key === 'Enter' && !e.target.closest('input, textarea, button')) {
        if (practicePage) {
          startPracticeRace();
        } else {
          startLiveRace();
        }
      }
      if (e.key === 'Escape') {
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, practicePage]);

  // Orchestra phase transitions
  useEffect(() => {
    if (phase === 'racing') {
      _orchestra.toRace();
    } else if (phase === 'lobby' || phase === 'results') {
      _orchestra.toLobby();
    }
  }, [phase]);

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
      const _racerName = currentUser?.username || currentUser?.name || null;
      const _raceScript = _racerName
        ? [_racerName + '!', ..._pick(SCRIPT.raceStart)]
        : _pick(SCRIPT.raceStart);
      speakSequence(_raceScript, { force: true, rate: 1.15, pitch: 0.90, gap: 160 });
    }
    setPhase('racing');
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [commentatorEnabled, currentUser?.id, currentUser?.name, currentUser?.username, duration, language, mode, redirectToProfile, showNotice]);

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
    // ── NEW #E: load ghost frames from stored PB ───────────────────────────
    const pbEntry = getPB(mode, language, duration);
    setGhostFrames(Array.isArray(pbEntry?.frames) ? pbEntry.frames : []);
    setGhostIndex(0);
    window.clearInterval(ghostIntervalRef.current);
    commentatorMilestonesRef.current = { m25: false, m50: false, m75: false };
    if (commentatorEnabled) {
      const _racerName = currentUser?.username || currentUser?.name || null;
      const _raceScript = _racerName
        ? [_racerName + '!', ..._pick(SCRIPT.raceStart)]
        : _pick(SCRIPT.raceStart);
      speakSequence(_raceScript, { force: true, rate: 1.15, pitch: 0.90, gap: 160 });
    }
    setPhase('racing');
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [commentatorEnabled, currentUser?.id, currentUser?.name, currentUser?.username, duration, redirectToProfile, showNotice]);

  // ── NEW #E: inject ghost cursor blink animation once ──────────────────────
  useEffect(() => {
    const id = 'typearena-ghost-style';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = '@keyframes ghostBlink{0%,100%{opacity:1}50%{opacity:0}} .char--ghost{border-bottom:2px solid hsl(200 80% 65%/0.9);animation:ghostBlink 1s step-end infinite;}';
    document.head.appendChild(el);
  }, []);

  // ── NEW #E: Ghost race playback — advance ghost cursor in real time ───────
  // Distribute the ghost frames evenly over the race duration.
  // Each tick advances the ghost by one frame.
  useEffect(() => {
    window.clearInterval(ghostIntervalRef.current);
    if (phase !== 'racing' || ghostFrames.length < 2) return;
    const totalMs = duration * 1000;
    const tickMs = Math.max(50, Math.round(totalMs / ghostFrames.length));
    setGhostIndex(0);
    ghostIntervalRef.current = window.setInterval(() => {
      setGhostIndex((i) => {
        if (i >= ghostFrames.length - 1) {
          window.clearInterval(ghostIntervalRef.current);
          return i;
        }
        return i + 1;
      });
    }, tickMs);
    return () => window.clearInterval(ghostIntervalRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, ghostFrames]);

  // Clean up ghost interval on unmount
  useEffect(() => () => window.clearInterval(ghostIntervalRef.current), []);
  useEffect(() => {
    if (phase !== 'results' || !raceResult) return;
    // Reset from any previous race
    setAiCoaching('loading');
    setAiCoachingError(false);

    const topMistakes = Object.entries(mistakeMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([ch, n]) => `'${ch === ' ' ? 'space' : ch}' (${n}×)`)
      .join(', ') || 'none';

    const wpmTrend = wpmHistory.length >= 3
      ? `${wpmHistory[0].wpm.toFixed(0)} → ${wpmHistory[Math.floor(wpmHistory.length / 2)].wpm.toFixed(0)} → ${wpmHistory[wpmHistory.length - 1].wpm.toFixed(0)} WPM`
      : `${raceResult.wpm.toFixed(0)} WPM`;

    const prompt = `You are a concise typing coach. A player just finished a ${raceResult.duration}s ${raceResult.mode} race.

Stats:
- WPM: ${raceResult.wpm.toFixed(1)}, Net WPM: ${raceResult.netWPM?.toFixed(1) || 'N/A'}, Accuracy: ${raceResult.accuracy.toFixed(1)}%
- WPM trend (start → mid → end): ${wpmTrend}
- Most-missed characters: ${topMistakes}

Give exactly 2-3 concrete, personalised drill suggestions. Each drill must name specific words or patterns to practise. Format as a short numbered list. No preamble, no sign-off. Plain text only, no markdown.`;

    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        const text = (data.content || []).map((b) => b.text || '').join('').trim();
        setAiCoaching(text || null);
      })
      .catch(() => {
        setAiCoachingError(true);
        setAiCoaching(null);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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
    setAfkWarning(false);
    setShowHeatmap(false);
    setUseCustomText(false);
    setPenaltyMode(false);
    setAiCoaching(null);
    setAiCoachingError(false);
    setGhostFrames([]);
    setGhostIndex(0);
    window.clearInterval(ghostIntervalRef.current);
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
        // #6 skill-based matchmaking
        wpmMin: wpmFilter.min > 0 ? wpmFilter.min : undefined,
        wpmMax: wpmFilter.max < 300 ? wpmFilter.max : undefined,
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
    lastHeartbeatRef.current = Date.now(); // #2 AFK reset on every keystroke
    // ── NEW #A: Penalty Mode — block backspace entirely ────────────────────
    if (penaltyMode && event.target.value.length < typingText.length) {
      event.preventDefault();
      return;
    }
    const value = event.target.value;
    const src = liveRoom?.text || (useCustomText && customText ? customText : null) || generatedContent?.passage || '';
    const newLen = value.length;
    const prevLen = typingText.length;

    // Sound + streak + mistake tracking (only on forward typing)
    if (newLen > prevLen && src) {
      const typedChar = value[newLen - 1];
      const expectedChar = src[newLen - 1];
      const isCorrect = typedChar === expectedChar;
      playSound(isCorrect ? 'key' : 'error');
      if (isCorrect) {
        setStreak((s) => {
          const newStreak = s + 1;
          // Commentator: streak milestones
          if (commentatorEnabled) {
            if (newStreak === 10) speakSequence(_pick(SCRIPT.streak10), { rate: 1.18, pitch: 0.88, gap: 140 });
            else if (newStreak === 25) speakSequence(_pick(SCRIPT.streak25), { force: true, rate: 1.2, pitch: 0.86, gap: 130 });
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
          speakSequence(_pick(SCRIPT.error), { rate: 1.1, pitch: 0.91, gap: 150 });
        }
      }

      // Commentator: progress milestones
      if (commentatorEnabled && src.length > 0) {
        const pct = newLen / src.length;
        const ms = commentatorMilestonesRef.current;
        if (!ms.m25 && pct >= 0.25) {
          ms.m25 = true;
          speakSequence(_pick(SCRIPT.milestone25), { rate: 1.1, pitch: 0.90, gap: 170 });
        } else if (!ms.m50 && pct >= 0.50) {
          ms.m50 = true;
          speakSequence(_pick(SCRIPT.milestone50), { force: true, rate: 1.13, pitch: 0.88, gap: 160 });
        } else if (!ms.m75 && pct >= 0.75) {
          ms.m75 = true;
          speakSequence(_pick(SCRIPT.milestone75), { force: true, rate: 1.15, pitch: 0.87, gap: 155 });
        }
      }
    }

    // WPM history for sparkline — record a point every ~2 seconds of elapsed time
    const elapsed = Math.max(1, duration - timeLeft);
    setWpmHistory((prev) => {
      const lastT = prev.length ? prev[prev.length - 1].t : 0;
      if (elapsed - lastT >= 2) {
        // Cap at 60 entries so marathon races don't grow the array indefinitely
        return [...prev.slice(-59), { t: elapsed, wpm: calculateWPM(value, elapsed) }];
      }
      return prev;
    });

    setTypingText(value);
    setFocusLost(false);
    setReplayFrames((prev) => [
      ...prev.slice(-299),
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
  const sourceText = liveRoom?.text
    || (showDailyChallenge && dailyChallenge?.passage ? dailyChallenge.passage : null)
    || (useCustomText && customText ? customText : null)
    || generatedContent?.passage
    || 'Type fast, type clean, and own the round.';
  // ── NEW #E: ghost position — character the ghost has reached ────────────
  const ghostLen = ghostFrames.length > 0
    ? (ghostFrames[ghostIndex]?.typedText || '').length
    : -1;

  const renderedText = useMemo(() => (
    sourceText.split('').map((char, index) => {
      let className = 'char untyped';
      if (index < typingText.length) {
        className = typingText[index] === char ? 'char correct' : 'char incorrect';
      } else if (index === typingText.length) {
        className = 'char current';
      }
      // Ghost cursor: tag the character the ghost is sitting on
      const isGhost = ghostLen >= 0 && index === ghostLen && index !== typingText.length;
      return (
        <span key={index} className={isGhost ? `${className} char--ghost` : className}>
          {char === ' ' ? '\u00A0' : char}
        </span>
      );
    })
  // ghostLen re-renders the ghost position as ghostIndex advances
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [sourceText, typingText, ghostLen]);

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

    // #7 — generate a proper PNG via Canvas (renders on WhatsApp previews)
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx2d = canvas.getContext('2d');

    // Background
    const bg = ctx2d.createLinearGradient(0, 0, 1080, 1080);
    bg.addColorStop(0, '#0c1018');
    bg.addColorStop(1, '#111827');
    ctx2d.fillStyle = bg;
    ctx2d.fillRect(0, 0, 1080, 1080);

    // Accent left bar
    ctx2d.fillStyle = accentColor;
    ctx2d.fillRect(0, 0, 8, 1080);

    // Subtle grid lines
    ctx2d.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx2d.lineWidth = 1;
    for (let x = 0; x < 1080; x += 60) { ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, 1080); ctx2d.stroke(); }
    for (let y = 0; y < 1080; y += 60) { ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(1080, y); ctx2d.stroke(); }

    // Glow circle
    const glow = ctx2d.createRadialGradient(540, 400, 0, 540, 400, 500);
    glow.addColorStop(0, accentColor.replace(')', ', 0.08)').replace('hsl', 'hsla').replace('rgb', 'rgba') || 'rgba(34,197,94,0.08)');
    glow.addColorStop(1, 'transparent');
    ctx2d.fillStyle = glow;
    ctx2d.fillRect(0, 0, 1080, 1080);

    // Brand label
    ctx2d.font = '500 28px monospace';
    ctx2d.fillStyle = accentColor;
    ctx2d.globalAlpha = 0.7;
    ctx2d.fillText('TYPEARENA', 80, 110);
    ctx2d.globalAlpha = 1;

    // Separator line
    ctx2d.fillStyle = accentColor;
    ctx2d.globalAlpha = 0.3;
    ctx2d.fillRect(80, 140, 920, 2);
    ctx2d.globalAlpha = 1;

    // "Race Complete" heading
    ctx2d.font = 'bold 56px sans-serif';
    ctx2d.fillStyle = '#f5f5f5';
    ctx2d.fillText('Race Complete', 80, 230);

    // WPM — big number
    ctx2d.font = 'bold 220px monospace';
    ctx2d.fillStyle = accentColor;
    ctx2d.fillText(Math.round(raceResult.wpm), 80, 490);

    ctx2d.font = '500 40px sans-serif';
    ctx2d.fillStyle = 'rgba(245,245,245,0.55)';
    ctx2d.fillText('WPM', 80, 545);

    // Stats row
    ctx2d.font = 'bold 44px sans-serif';
    ctx2d.fillStyle = '#f5f5f5';
    ctx2d.fillText(`${Number(raceResult.accuracy).toFixed(1)}% accuracy`, 80, 640);
    ctx2d.font = '500 36px sans-serif';
    ctx2d.fillStyle = goldColor;
    ctx2d.fillText(`Net WPM: ${Number(raceResult.netWPM).toFixed(1)}`, 80, 710);

    // Share text
    ctx2d.font = 'italic 32px sans-serif';
    ctx2d.fillStyle = 'rgba(245,245,245,0.6)';
    ctx2d.fillText(raceResult.shareText, 80, 800);

    // PB badge
    if (isNewPB) {
      ctx2d.fillStyle = accentColor;
      ctx2d.globalAlpha = 0.15;
      ctx2d.beginPath();
      ctx2d.roundRect(80, 840, 340, 70, 12);
      ctx2d.fill();
      ctx2d.globalAlpha = 1;
      ctx2d.font = 'bold 30px sans-serif';
      ctx2d.fillStyle = accentColor;
      ctx2d.fillText('🏆 New Personal Best!', 100, 883);
    }

    // Footer
    ctx2d.font = '500 26px monospace';
    ctx2d.fillStyle = 'rgba(245,245,245,0.25)';
    ctx2d.fillText('typearena.io', 80, 1040);

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `typearena-${Math.round(raceResult.wpm)}wpm-${Date.now()}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
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
              : `Current mode: ${MODE_CONFIG.find((item) => item.id === mode)?.label || 'Standard'} · ${duration}s · Press Enter to start · Press ? for shortcuts`}
          </p>

          {/* ── NEW #B: Keyboard shortcut overlay ── */}
          {showShortcuts && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
              onClick={() => setShowShortcuts(false)}>
              <div style={{ background:'var(--arena-panel)', border:'1px solid var(--arena-panel-border)', borderRadius:'var(--arena-radius-lg,12px)', maxWidth:'480px', width:'100%', padding:'1.5rem', position:'relative' }}
                onClick={(e) => e.stopPropagation()}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                  <h2 style={{ margin:0, fontSize:'1.05rem', color:'var(--arena-text)' }}>⌨️ Keyboard Shortcuts</h2>
                  <button className="btn btn-sm btn-outline-light" onClick={() => setShowShortcuts(false)}>✕</button>
                </div>
                <div style={{ display:'grid', gap:'0.5rem' }}>
                  {[
                    ['Enter', 'Start race (when not focused on input)'],
                    ['Esc', 'Close this overlay / cancel action'],
                    ['?', 'Toggle this shortcut cheat sheet'],
                    ['Tab', 'Switch between race modes (in lobby)'],
                    ['30 / 60 / 120', 'Duration buttons — click or Tab to focus'],
                    ['Backspace', 'Correct a mistake (disabled in Penalty Mode)'],
                    ['Click text', 'Re-focus the typing area during a race'],
                  ].map(([key, desc]) => (
                    <div key={key} style={{ display:'flex', alignItems:'baseline', gap:'0.75rem' }}>
                      <kbd style={{ flexShrink:0, fontFamily:'var(--font-mono)', fontSize:'0.78rem', background:'hsl(240 14% 14%)', border:'1px solid var(--arena-panel-border)', borderRadius:'5px', padding:'0.15rem 0.5rem', color:'var(--arena-accent)', minWidth:'60px', textAlign:'center' }}>{key}</kbd>
                      <span style={{ fontSize:'0.82rem', color:'var(--arena-muted)' }}>{desc}</span>
                    </div>
                  ))}
                </div>
                <p style={{ marginTop:'1rem', fontSize:'0.72rem', color:'var(--arena-muted)', opacity:0.6 }}>Press Esc or click outside to close</p>
              </div>
            </div>
          )}

          {/* ── Feature #10: Win streak banner ── */}
          {winStreak.count >= 2 && (
            <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', padding:'0.6rem 1rem', background:'var(--arena-accent-soft)', border:'1px solid var(--arena-accent)', borderRadius:'10px', marginBottom:'0.75rem' }}>
              <span style={{ fontSize:'1.4rem' }}>🔥</span>
              <div>
                <strong style={{ color:'var(--arena-accent)', fontSize:'0.95rem' }}>{winStreak.count}-Race Win Streak!</strong>
                <p style={{ margin:0, fontSize:'0.78rem', color:'var(--arena-muted)' }}>Keep it going — one more race.</p>
              </div>
            </div>
          )}

          {/* ── Feature #4: Daily challenge ── */}
          <div style={{ marginBottom:'0.75rem' }}>
            <button className="btn btn-outline-primary" onClick={loadDailyChallenge} style={{ marginRight:'0.5rem' }}>
              📅 Daily Challenge
            </button>
            {showDailyChallenge && dailyChallenge && (
              <button className="btn btn-sm btn-outline-light" onClick={() => setShowDailyChallenge(false)}>Dismiss</button>
            )}
          </div>
          {showDailyChallenge && dailyChallenge && (
            <div style={{ background:'var(--arena-panel)', border:'1px solid var(--arena-panel-border)', borderRadius:'var(--arena-radius-lg)', padding:'1rem 1.25rem', marginBottom:'1rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--arena-accent)' }}>📅 Today's Challenge</span>
                <span style={{ fontSize:'0.75rem', color:'var(--arena-muted)' }}>{new Date().toLocaleDateString()}</span>
              </div>
              <p style={{ fontFamily:'var(--font-mono)', fontSize:'0.88rem', color:'var(--arena-text)', lineHeight:'1.7', margin:'0 0 0.75rem' }}>"{dailyChallenge.passage?.slice(0, 140)}…"</p>
              <button className="btn btn-primary btn-sm" onClick={() => { setUseCustomText(false); setShowDailyChallenge(true); startPracticeRace(); }}>
                Race This Passage
              </button>
            </div>
          )}

          {/* ── Feature #5: Custom text panel ── */}
          <div style={{ marginBottom:'0.75rem' }}>
            <button className="btn btn-outline-primary" onClick={() => setShowCustomTextPanel((v) => !v)}>
              ✏️ Paste Custom Text
            </button>
          </div>
          {showCustomTextPanel && (
            <div style={{ background:'var(--arena-panel)', border:'1px solid var(--arena-panel-border)', borderRadius:'var(--arena-radius-lg)', padding:'1rem 1.25rem', marginBottom:'1rem' }}>
              <p style={{ fontSize:'0.8rem', color:'var(--arena-muted)', marginBottom:'0.5rem' }}>Paste any text below — then start a practice race to type it.</p>
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value.slice(0, 2000))}
                placeholder="Paste your custom passage here (max 2000 chars)…"
                rows={4}
                style={{ width:'100%', background:'hsl(240 15% 6%)', border:'1px solid var(--arena-panel-border)', borderRadius:'8px', color:'var(--arena-text)', fontFamily:'var(--font-mono)', fontSize:'0.85rem', padding:'0.6rem 0.9rem', resize:'vertical', outline:'none' }}
              />
              <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.5rem', alignItems:'center' }}>
                <button
                  className={`btn btn-sm ${useCustomText ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setUseCustomText((v) => !v)}
                  disabled={!customText.trim()}
                >
                  {useCustomText ? '✓ Using custom text' : 'Use this text'}
                </button>
                {useCustomText && <span style={{ fontSize:'0.75rem', color:'var(--arena-accent)' }}>Custom text active — press Start Practice</span>}
                <span style={{ fontSize:'0.72rem', color:'var(--arena-muted)', marginLeft:'auto' }}>{customText.length}/2000</span>
              </div>
            </div>
          )}

          {/* ── NEW #A: Penalty Mode toggle ── */}
          <div style={{ marginBottom:'0.75rem', display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <button
              className={`btn ${penaltyMode ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setPenaltyMode((v) => !v)}
            >
              {penaltyMode ? '🚫 Penalty Mode ON' : '🚫 Penalty Mode'}
            </button>
            {penaltyMode && (
              <span style={{ fontSize:'0.78rem', color:'var(--arena-accent)' }}>
                Backspace disabled — type through your mistakes!
              </span>
            )}
          </div>

          {/* ── Feature #6: WPM matchmaking filter ── */}
          {!practicePage && (
            <div style={{ marginBottom:'0.75rem' }}>
              <button className="btn btn-outline-primary" onClick={() => setShowWpmFilter((v) => !v)}>
                🎯 Skill Filter {wpmFilter.min > 0 || wpmFilter.max < 300 ? `(${wpmFilter.min}–${wpmFilter.max} WPM)` : ''}
              </button>
            </div>
          )}
          {showWpmFilter && !practicePage && (
            <div style={{ background:'var(--arena-panel)', border:'1px solid var(--arena-panel-border)', borderRadius:'var(--arena-radius-lg)', padding:'1rem 1.25rem', marginBottom:'1rem' }}>
              <p style={{ fontSize:'0.8rem', color:'var(--arena-muted)', marginBottom:'0.75rem' }}>Only match me with opponents in this WPM range:</p>
              <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
                <label style={{ fontSize:'0.82rem', color:'var(--arena-muted)' }}>Min WPM
                  <input type="number" min={0} max={299} value={wpmFilter.min}
                    onChange={(e) => setWpmFilter((f) => ({ ...f, min: Math.max(0, Math.min(299, Number(e.target.value))) }))}
                    style={{ marginLeft:'0.4rem', width:'64px', padding:'0.25rem 0.5rem', borderRadius:'6px', border:'1px solid var(--arena-panel-border)', background:'hsl(240 14% 8%)', color:'var(--arena-text)', fontSize:'0.85rem' }}
                  />
                </label>
                <label style={{ fontSize:'0.82rem', color:'var(--arena-muted)' }}>Max WPM
                  <input type="number" min={1} max={300} value={wpmFilter.max}
                    onChange={(e) => setWpmFilter((f) => ({ ...f, max: Math.max(1, Math.min(300, Number(e.target.value))) }))}
                    style={{ marginLeft:'0.4rem', width:'64px', padding:'0.25rem 0.5rem', borderRadius:'6px', border:'1px solid var(--arena-panel-border)', background:'hsl(240 14% 8%)', color:'var(--arena-text)', fontSize:'0.85rem' }}
                  />
                </label>
                <button className="btn btn-sm btn-outline-light" onClick={() => setWpmFilter({ min: 0, max: 300 })}>Reset</button>
              </div>
              <p style={{ marginTop:'0.5rem', fontSize:'0.72rem', color:'var(--arena-muted)', opacity:0.7 }}>Narrower ranges may increase queue wait time.</p>
            </div>
          )}

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
                      onClick={() => watchRoom(room.id)}
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

      {/* ── Feature #3: Inline Spectator Modal ── */}
      {spectateRoom && spectateData && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.82)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'var(--arena-bg, #0f111a)', border:'1px solid var(--arena-panel-border)', borderRadius:'var(--arena-radius-lg)', maxWidth:'680px', width:'100%', padding:'1.5rem', position:'relative' }}>
            <button className="btn btn-sm btn-outline-light" style={{ position:'absolute', top:'1rem', right:'1rem' }} onClick={stopWatching}>✕ Stop watching</button>
            <div style={{ marginBottom:'0.5rem', fontFamily:'var(--font-mono)', fontSize:'0.7rem', textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--arena-accent)' }}>
              👁 Spectating — {spectateData.mode || 'live'} race
              {spectateData.status === 'completed' && <span style={{ marginLeft:'0.5rem', color:'var(--arena-gold)' }}>· Race Over</span>}
            </div>
            <div style={{ display:'flex', gap:'1rem', marginBottom:'1rem', flexWrap:'wrap' }}>
              {(spectateData.players || []).map((player) => (
                <div key={player.userId} style={{ flex:'1 1 200px', background:'var(--arena-panel)', border:'1px solid var(--arena-panel-border)', borderRadius:'var(--arena-radius)', padding:'0.85rem 1rem' }}>
                  <div style={{ fontWeight:700, marginBottom:'0.4rem', color:'var(--arena-text)' }}>{player.username || 'Player'}</div>
                  <div style={{ height:'6px', background:'hsl(240 14% 14%)', borderRadius:'999px', overflow:'hidden', marginBottom:'0.4rem' }}>
                    <div style={{ height:'100%', width:`${player.progress || 0}%`, background:'var(--arena-accent)', transition:'width 0.4s ease', borderRadius:'999px' }} />
                  </div>
                  <div style={{ display:'flex', gap:'0.75rem', fontSize:'0.78rem', color:'var(--arena-muted)' }}>
                    <span><strong style={{ color:'var(--arena-text)' }}>{player.currentWpm || 0}</strong> WPM</span>
                    <span><strong style={{ color:'var(--arena-text)' }}>{player.progress || 0}</strong>%</span>
                    {player.result && <span style={{ color:'var(--arena-accent)' }}>✓ Finished</span>}
                  </div>
                </div>
              ))}
            </div>
            {spectateData.text && (
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.82rem', color:'var(--arena-muted)', lineHeight:'1.6', background:'hsl(240 14% 6%)', borderRadius:'8px', padding:'0.75rem 1rem', maxHeight:'120px', overflow:'hidden' }}>
                {spectateData.text.slice(0, 200)}…
              </div>
            )}
            <p style={{ marginTop:'0.5rem', fontSize:'0.72rem', color:'var(--arena-muted)', opacity:0.6 }}>Refreshes every 2 seconds. You cannot interact with the race.</p>
          </div>
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
          {/* ── Feature #2: AFK warning ── */}
          {afkWarning && (
            <div style={{ background:'hsl(0 60% 14%)', border:'1px solid hsl(0 55% 28%)', borderRadius:'8px', padding:'0.65rem 1rem', marginBottom:'0.75rem', color:'hsl(0 70% 72%)', fontSize:'0.85rem', fontWeight:600 }}>
              ⚠ You were inactive for too long. Race forfeited to protect prize integrity.
            </div>
          )}
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
            {/* ── Feature #1: Full WPM sparkline with filled area ── */}
            {wpmHistory.length >= 2 && (() => {
              const maxT = wpmHistory[wpmHistory.length - 1].t || 1;
              const maxW = Math.max(...wpmHistory.map((p) => p.wpm), 1);
              const W = 180; const H = 48;
              const pts = wpmHistory.map((p) => [
                (p.t / maxT) * (W - 2) + 1,
                H - 4 - (p.wpm / maxW) * (H - 10),
              ]);
              const polyline = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
              const areaPath = `M${pts[0][0].toFixed(1)},${H} ` + pts.map(([x,y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ` L${pts[pts.length-1][0].toFixed(1)},${H} Z`;
              return (
                <div style={{ flex:'1', minWidth:'120px', position:'relative' }}>
                  <span style={{ position:'absolute', top:0, left:0, fontSize:'0.62rem', color:'var(--arena-muted)', opacity:0.7 }}>{Math.round(maxW)} wpm</span>
                  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display:'block', width:'100%' }} aria-label="WPM over time">
                    <defs>
                      <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--arena-accent)" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="var(--arena-accent)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={areaPath} fill="url(#sparkGrad)" />
                    <polyline fill="none" stroke="var(--arena-accent)" strokeWidth="2" strokeLinejoin="round" points={polyline} />
                    {/* current dot */}
                    <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="3" fill="var(--arena-accent)" />
                  </svg>
                  <span style={{ position:'absolute', bottom:0, right:0, fontSize:'0.62rem', color:'var(--arena-muted)', opacity:0.7 }}>{duration}s</span>
                </div>
              );
            })()}
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
            {/* ── NEW #E: ghost active indicator ── */}
            {ghostFrames.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', minWidth:'60px' }}>
                <span style={{ fontSize:'0.7rem', color:'hsl(200 70% 60%)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Ghost</span>
                <strong style={{ fontSize:'0.85rem', color:'hsl(200 70% 65%)' }}>
                  {Math.round((ghostIndex / Math.max(ghostFrames.length - 1, 1)) * 100)}%
                </strong>
              </div>
            )}
          </div>

          <div className="race-header">
            <div className="stats">
              <div className="stat">
                <span className="stat-label">Mode</span>
                <span className="stat-value live-mode">{mode}{penaltyMode ? ' 🚫' : ''}</span>
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
                {/* ── NEW #C: your live WPM ── */}
                <span style={{ fontSize:'0.72rem', color:'var(--arena-accent)', marginTop:'2px' }}>{wpmValue.toFixed(0)} WPM</span>
              </div>
              <div className="opponent-panel__item" style={{ position:'relative' }}>
                <span>{opponent?.username || 'Opponent'}</span>
                <strong>{opponent?.progress || 0}%</strong>
                {/* ── NEW #C: opponent live WPM bar ── */}
                {opponent?.currentWpm != null && (
                  <>
                    <span style={{ fontSize:'0.72rem', color: opponent.currentWpm > wpmValue ? 'hsl(0 75% 60%)' : 'var(--arena-muted)', marginTop:'2px', fontWeight:700 }}>
                      {Number(opponent.currentWpm).toFixed(0)} WPM
                      {opponent.currentWpm > wpmValue
                        ? ' ▲'
                        : opponent.currentWpm < wpmValue
                          ? ' ▼'
                          : ''}
                    </span>
                    <div style={{ width:'100%', height:'4px', background:'hsl(240 14% 18%)', borderRadius:'999px', overflow:'hidden', marginTop:'4px' }}>
                      <div style={{
                        height:'100%',
                        width:`${Math.min(100, (opponent.currentWpm / Math.max(wpmValue, opponent.currentWpm, 1)) * 100)}%`,
                        background: opponent.currentWpm > wpmValue ? 'hsl(0 75% 55%)' : 'var(--arena-accent)',
                        transition:'width 0.8s ease',
                        borderRadius:'999px',
                      }} />
                    </div>
                  </>
                )}
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
                {/* ghost position is rendered via char--ghost class in renderedText */}
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

          {/* ── NEW #D: Post-race AI coaching (replaces static coachTip) ── */}
          <div className="live-board" style={{ marginTop:'0.75rem' }}>
            <div className="live-board__header">
              <h2>🤖 Coaching</h2>
              {aiCoaching === 'loading' && <span className="arena-spinner" aria-label="Generating coaching…" />}
            </div>
            {aiCoaching === 'loading' && (
              <p className="results-challenge" style={{ opacity:0.7 }}>Analysing your race…</p>
            )}
            {aiCoaching && aiCoaching !== 'loading' && (
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.85rem', color:'var(--arena-text)', lineHeight:'1.75', whiteSpace:'pre-wrap', padding:'0.25rem 0' }}>
                {aiCoaching}
              </div>
            )}
            {!aiCoaching && aiCoaching !== 'loading' && !aiCoachingError && (
              <p className="results-challenge">{raceResult.coachTip}</p>
            )}
            {aiCoachingError && (
              <p className="results-challenge">{raceResult.coachTip}</p>
            )}
          </div>

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

          {/* ── Feature #8: Keyboard heatmap ── */}
          {showHeatmap && Object.keys(mistakeMap).length > 0 && (() => {
            const maxMistakes = Math.max(...Object.values(mistakeMap), 1);
            const getHeatColor = (key) => {
              const count = mistakeMap[key.toUpperCase()] || mistakeMap[key.toLowerCase()] || 0;
              if (!count) return null;
              const intensity = count / maxMistakes;
              const r = Math.round(180 + 75 * intensity);
              const g = Math.round(60 - 60 * intensity);
              return `rgba(${r},${g},40,${0.25 + intensity * 0.55})`;
            };
            return (
              <div className="live-board" style={{ marginTop:'1rem' }}>
                <div className="live-board__header">
                  <h2>🔥 Mistake Heatmap</h2>
                  <span className="results-challenge">Red = most errors</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'4px', alignItems:'center', padding:'0.75rem 0' }}>
                  {KEYBOARD_LAYOUT.map((row, rowIndex) => (
                    <div key={rowIndex} style={{ display:'flex', gap:'4px' }}>
                      {row.map((keyLabel, keyIndex) => {
                        const heatBg = getHeatColor(keyLabel);
                        const isWide = ['Backspace','Tab','CapsLock','Enter','Shift'].includes(keyLabel);
                        const isSpace = keyLabel === 'Space';
                        return (
                          <div key={keyIndex} style={{
                            display:'flex', alignItems:'center', justifyContent:'center',
                            minWidth: isSpace ? '160px' : isWide ? '48px' : '28px',
                            height:'28px',
                            background: heatBg || 'var(--arena-key-bg)',
                            border:`1px solid ${heatBg ? 'rgba(255,80,40,0.5)' : 'var(--arena-key-border)'}`,
                            borderRadius:'4px',
                            boxShadow: heatBg ? `0 0 6px ${heatBg}` : undefined,
                            transition:'background 0.2s',
                          }}>
                            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', fontWeight:600, color: heatBg ? '#fff' : 'var(--arena-key-text)', pointerEvents:'none' }}>
                              {keyLabel === 'Space' ? '' : keyLabel.length > 3 ? keyLabel.slice(0, 3) : keyLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

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
              Export Score Card (PNG)
            </button>
            <button className="btn btn-outline-primary" onClick={() => navigate(`/results/${raceResult.id}`)}>
              Open Result Page
            </button>
            {/* ── Feature #8: keyboard heatmap toggle ── */}
            <button className="btn btn-outline-primary" onClick={() => setShowHeatmap((v) => !v)}>
              {showHeatmap ? 'Hide' : '🔥 Show'} Mistake Heatmap
            </button>
            <button className="btn btn-primary" onClick={backToLobby}>
              Back to Lobby
            </button>
            <button className="btn btn-secondary" onClick={startPracticeRace}>
              Race Again
            </button>
            {liveRoom?.id && (
              <button className="btn btn-outline-primary" onClick={() => {
                // Re-queue against the same opponent: store the invite code then
                // go back to the lobby — the lobby useEffect will see pendingRematch
                // and kick off the join once state has fully reset.
                const rematchCode = liveRoom?.inviteCode || '';
                backToLobby();
                if (rematchCode) {
                  setFriendBattle((prev) => ({ ...prev, inviteCode: rematchCode }));
                  // Use a one-time flag carried in state rather than a raw timeout
                  setPendingRematch(true);
                } else {
                  startLiveRace();
                }
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
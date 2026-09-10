import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  calculateAccuracy,
  calculateWPM,
  formatTime,
  generateRaceId,
} from '../utils/typingEngine';
import {
  fetchCurrentUser,
  fetchDailyContent,
  fetchLiveRaceRoom,
  fetchLiveRaces,
  fetchMediaSettings,
  getStoredUserSnapshot,
  submitRaceResult,
} from '../utils/typingApi';
import { buildApiUrl } from '../utils/api';
import PrivateRoomPanel from './PrivateRoomPanel';
import { useLiveFeed } from '../hooks/useLiveFeed';
import { useLiveRaceSession } from '../hooks/useLiveRaceSession';
import { useSpectateRoom } from '../hooks/useSpectateRoom';
import { getRaceContent } from '../utils/navigationPrefetch';
import { KEYBOARD_LAYOUT } from '../utils/keyboardLayout';
import '../styles/Play.css';

const LazyKeyboardDeck = React.lazy(() => import('./PlayKeyboardDeck'));
const LazyPlayReplay = React.lazy(() => import('./PlayReplay'));

const LATEST_RACE_RESULT_KEY = 'typearena_latest_race_result';
const USED_CONTENT_IDS_KEY = 'typearena_used_content_ids';
const AFK_FORFEIT_MS = 15000; // #2 rage-quit/AFK: forfeit after 15s of no heartbeat
const DAILY_CHALLENGE_KEY = 'typearena_daily_challenge';
const WIN_STREAK_KEY = 'typearena_win_streak';
const LOBBY_FEED_POLL_INTERVAL_MS = 8000;
const SPECTATE_POLL_INTERVAL_MS = 3000;
const MOBILE_TYPING_SETTINGS_KEY = 'typearena_mobile_typing_settings';
const DEFAULT_MOBILE_TYPING_SETTINGS = { autoScroll: true, guide: true, haptics: false };

function readMobileTypingSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(MOBILE_TYPING_SETTINGS_KEY) || 'null');
    return { ...DEFAULT_MOBILE_TYPING_SETTINGS, ...(stored && typeof stored === 'object' ? stored : {}) };
  } catch (_) {
    return DEFAULT_MOBILE_TYPING_SETTINGS;
  }
}

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
    // localStorage full or unavailable â€” silently continue
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

  // Already recorded â€” nothing to do
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
// Personal Best helpers â€” stored in localStorage per mode+language+duration
// ---------------------------------------------------------------------------
const PB_KEY = 'typearena_personal_bests';

const getPB = (mode, language, duration) => {
  try {
    const store = JSON.parse(localStorage.getItem(PB_KEY) || '{}');
    return store[`${mode}__${language}__${duration}`] || null;
  } catch { return null; }
};

// â”€â”€ NEW #E: also persists replayFrames alongside the PB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const savePB = (mode, language, duration, wpm, accuracy, frames = []) => {
  try {
    const store = JSON.parse(localStorage.getItem(PB_KEY) || '{}');
    const key = `${mode}__${language}__${duration}`;
    // Bug E fix: storing full typedText strings in every frame could exceed the
    // localStorage quota (300 frames Ã— ~2000 chars â‰ˆ 600 KB per PB entry).
    // Store only the typed character count per frame â€” enough to drive the ghost
    // cursor and replay scrubber, at a fraction of the size.
    const compactFrames = frames.map((f) => ({
      len: typeof f.typedText === 'string' ? f.typedText.length : (f.len || 0),
      timestamp: f.timestamp,
    }));
    store[key] = { wpm, accuracy, date: new Date().toISOString(), frames: compactFrames };
    localStorage.setItem(PB_KEY, JSON.stringify(store));
  } catch {}
};

// ---------------------------------------------------------------------------
// Win streak helpers â€” persisted across sessions
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
// Daily challenge helpers â€” one shared passage per calendar day
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
// Recent races helpers â€” last 5 solo results stored in localStorage
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
// Shared AudioContext â€” single instance used by both sound effects and the
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
// Arena Orchestra â€” procedural FIFA-style orchestral background music
// Built entirely with Web Audio API: no files, no external deps.
//
// Architecture:
//   â€¢ _arenaOrchestraCtx  â€” shared AudioContext (same as sound effects)
//   â€¢ masterGain          â€” top-level volume fader
//   â€¢ Lobby layer         â€” slow strings + pad (calm, majestic)
//   â€¢ Race layer          â€” driving brass ostinato + percussion (intense)
//   â€¢ Each layer crossfades on phase change
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
  let _stopTimeoutId = null; // Fix #8: track pending stop timeout to cancel on re-start

  const getCtx = () => {
    // Always reuse the shared AudioContext so the orchestra and sound effects
    // share the same audio graph â€” avoids dual-context resource waste.
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
      // Fix #10 (Issue 10): LFO node was previously orphaned â€” started but never
      // tracked, so it survived every stop() call and leaked in the AudioContext.
      // Return it alongside the main osc so callers can push it into the nodes array.
      return { osc, gain: g, lfo };
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

  // Slow rhythmic pulse â€” simulates a distant bass drum
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

  // â”€â”€ LOBBY LAYER â€” calm, slow strings + deep pad â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Chord: D minor (D2, F2, A2, C3) â€” majestic, slightly melancholic FIFA feel
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

    // Pad strings â€” triangle waves (warm, string-like)
    LOBBY_CHORD.forEach((freq, i) => {
      const n = makeOsc(freq, 'triangle', 0.06 + (i === 0 ? 0.04 : 0), 5.2 + i * 0.3, 1.2);
      if (!n) return;
      n.gain.connect(lobbyGain);
      n.osc.start();
      nodes.push(n.osc);
      // Fix #10: track LFO so it is stopped with the rest of the layer
      if (n.lfo) nodes.push(n.lfo);
    });

    // Octave bass pad
    const bass = makeOsc(36.7, 'sine', 0.10); // D1
    if (bass) { bass.gain.connect(lobbyGain); bass.osc.start(); nodes.push(bass.osc); }

    // Soft filtered noise (crowd ambience murmur)
    const noise = makeFilteredNoise(0.018, 320);
    if (noise) { noise.gain.connect(lobbyGain); noise.source.start(); nodes.push(noise.source); }

    // Slow shimmer on top (high triangle â€” like a glockenspiel ghost note)
    const shimmer = makeOsc(523.25, 'triangle', 0.012, 0.2, 4); // C5
    if (shimmer) {
      shimmer.gain.connect(lobbyGain);
      shimmer.osc.start();
      nodes.push(shimmer.osc);
      // Fix #10: track LFO
      if (shimmer.lfo) nodes.push(shimmer.lfo);
    }

    lobbyNodes = nodes;
  };

  // â”€â”€ RACE LAYER â€” driving brass ostinato + percussion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Chord: D minor â€” same root, but brighter (sawtooth brass feel)
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

    // Driving brass ostinato â€” sawtooth, slightly detuned pairs
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

    // Rhythmic pulse (bass drum feel) at 96bpm â€” stadium stomp
    raceRhythmId = makeRhythmicPulse(raceGain, 96);

    raceNodes = nodes;
  };

  // â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const start = () => {
    const c = getCtx();
    if (!c || running || !enabled) return;
    // Fix #8: cancel any pending stop cleanup so a quick remount gets a fresh start
    if (_stopTimeoutId) { clearTimeout(_stopTimeoutId); _stopTimeoutId = null; }
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
    if (_stopTimeoutId) clearTimeout(_stopTimeoutId);
    _stopTimeoutId = setTimeout(() => {
      _stopTimeoutId = null;
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
    // vol: 0.0 â€“ 1.0
    if (masterGain) ramp(masterGain, Math.max(0, Math.min(1, vol)) * (currentPhase === 'race' ? 0.52 : 0.38), 0.5);
  };

  return { start, stop, toRace, toLobby, setEnabled, setVolume };
})();

// ---------------------------------------------------------------------------
// Commentator engine â€” eFootball-style live match announcer via Web Speech API
// Speaks in short punchy chains like a real match commentator:
//   "Oh!  What a move!  Incredible!  The crowd is on its feet!"
// ---------------------------------------------------------------------------

// Pick a random item from an array
const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------------------
// speakSequence â€” chains an array of short sentences with natural gaps,
// exactly like the eFootball / FIFA commentator delivery style.
//   sentences : string[]  â€” each item is one short punchy line
//   opts.rate  : number   â€” speech rate (default 1.08 â€” authoritative but urgent)
//   opts.pitch : number   â€” voice pitch (default 0.92 â€” deep, commanding)
//   opts.gap   : number   â€” ms between sentences (default 220)
//   opts.force : boolean  â€” skip cooldown check
// ---------------------------------------------------------------------------
let _commentatorBusy = false;
let _commentatorCancelFlag = false;
let _commentatorLastSpokenAt = 0;
let _commentatorConfig = { rate: 1.08, pitch: 0.92, gap: 220, volume: 1.0, cooldown: 3500 };
// Hard-disable flag â€” set when the user turns off the commentator.
// Unlike _commentatorCancelFlag (which is reset by each new speakSequence call),
// this one is only ever changed by the enable/disable toggle.
let _commentatorDisabled = false;

const _getCommentatorVoice = () => {
  const voices = window.speechSynthesis.getVoices();
  // Priority list â€” deep authoritative English voices (eFootball / FIFA style)
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

export const setCommentatorConfig = (config = {}) => {
  _commentatorConfig = {
    rate: Number.isFinite(Number(config.rate)) ? Number(config.rate) : _commentatorConfig.rate,
    pitch: Number.isFinite(Number(config.pitch)) ? Number(config.pitch) : _commentatorConfig.pitch,
    gap: Number.isFinite(Number(config.gap)) ? Number(config.gap) : _commentatorConfig.gap,
    volume: Number.isFinite(Number(config.volume)) ? Number(config.volume) : _commentatorConfig.volume,
    cooldown: Number.isFinite(Number(config.cooldown)) ? Number(config.cooldown) : _commentatorConfig.cooldown,
  };
};

const speakSequence = (sentences, opts = {}) => {
  if (!window.speechSynthesis) return;
  if (_commentatorDisabled) return;  // hard-disabled by user setting â€” bail immediately
  const { force = false } = opts;
  const rate = _commentatorConfig.rate;
  const pitch = _commentatorConfig.pitch;
  const gap = _commentatorConfig.gap;
  const volume = _commentatorConfig.volume;

  const now = Date.now();
  if (!force && _commentatorBusy) return;
  if (!force && now - _commentatorLastSpokenAt < _commentatorConfig.cooldown) return;

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

// ---------------------------------------------------------------------------
// Commentator script library â€” arrays of SHORT punchy sentences per moment
// Each entry in the outer array is one possible "take" (array of sentences).
// ---------------------------------------------------------------------------
const SCRIPT = {
  // Welcome sequence â€” personalised, then feature tour
  welcome: (name) => [
    `${name}!`,
    `Welcome to TypeArena!`,
    `The crowd is on its feet!`,
    `You've just entered the fastest typing arena on the planet!`,
  ],
  featureTour: () => [
    `Here's what's waiting for you.`,
    `Jump into a live one-versus-one battle â€” real opponent, real prize money!`,
    `Create a private match and challenge your friends directly.`,
    `Compete in tournaments â€” multiple rounds, one champion.`,
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
    [`Seventy-five percent!`, `In the HOME STRETCH now!`, `Don't let up â€” the finish is RIGHT THERE!`],
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
    [`Ohhh!`, `A slip!`, `Shake it off â€” champions recover!`],
    [`Mistake!`, `But there's still time!`, `Dig in and push through!`],
    [`Oh no!`, `A rare error!`, `Back on track â€” NOW!`],
  ],

  finish: [
    [`AND IT'S OVER!`, `What a performance!`, `The crowd is absolutely ELECTRIC!`],
    [`THE RACE IS COMPLETE!`, `An outstanding display of speed and accuracy!`, `Give it up for this racer!`],
    [`DONE!`, `Breathtaking!`, `Ladies and gentlemen â€” that was TypeArena at its finest!`],
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

const TypingCharacter = React.memo(function TypingCharacter({
  char,
  isCurrent,
  isGhost,
  isTyped,
  isCorrect,
  activeRef,
}) {
  let className = 'char untyped';
  if (isTyped) {
    // Fix #4: distinguish correct vs incorrect typed characters
    className = isCorrect ? 'char correct' : 'char incorrect';
  } else if (isCurrent) {
    className = 'char current';
  }

  return (
    <span className={isGhost ? `${className} char--ghost` : className}>
      {char === ' ' ? '\u00A0' : char}
    </span>
  );
});

export default function Play({ practicePage = false }){
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('lobby');
  const [mode, setMode] = useState('standard');
  const [language, setLanguage] = useState('english');
  const [duration, setDuration] = useState(60);
  const [typingText, setTypingText] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [contentLoading, setContentLoading] = useState(false);
  // notice is now { message: string, type: 'info'|'error'|'success'|'warning' }
  const [notice, setNotice] = useState(null);
  const [raceResult, setRaceResult] = useState(null);
  const [generatedContent, setGeneratedContent] = useState(null);
  const [replayFrames, setReplayFrames] = useState([]);
  const replayFrameAtRef = useRef(0);
  const [currentUser, setCurrentUser] = useState(() => {
    const stored = getStoredUserSnapshot();
    return stored ?? undefined;
  }); // undefined=loading, null=guest, object=user
  const [showPracticeModes, setShowPracticeModes] = useState(false);
  const [raceOver, setRaceOver] = useState(false);
  const [friendBattle, setFriendBattle] = useState({
    inviteCode: '',
    password: '',
    customInviteCode: '',
    maxPlayers: 2,
  });
  const [tournamentId, setTournamentId] = useState('');
  const [initialRoomId, setInitialRoomId] = useState('');
  // â”€â”€ new feature state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('typearena_sound') !== 'false');
  // Keep the module-level flag in sync so playSound always knows the current setting
  useEffect(() => { setSoundEnabledGlobal(soundEnabled); }, [soundEnabled]);
  const [commentatorEnabled, setCommentatorEnabled] = useState(() => localStorage.getItem('typearena_commentator') !== 'false');
  const [commentatorPhrases, setCommentatorPhrases] = useState({});
  const [musicEnabled, setMusicEnabled] = useState(() => localStorage.getItem('typearena_music') !== 'false');
  const [mobileTypingSettings, setMobileTypingSettings] = useState(readMobileTypingSettings);
  const [showMobileTypingSetup, setShowMobileTypingSetup] = useState(() => localStorage.getItem(MOBILE_TYPING_SETTINGS_KEY) === null);

  useEffect(() => {
    let active = true;
    fetchMediaSettings().then((settings) => {
      if (settings?.commentatorConfig) {
        setCommentatorConfig(settings.commentatorConfig);
      }
      if (settings?.commentatorPhrases) {
        setCommentatorPhrases(settings.commentatorPhrases);
      }
      if (active && settings?.commentatorEnabled === false) {
        setCommentatorEnabled(false);
      }
    });
    return () => { active = false; };
  }, []);

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
  const commentatorScriptRef = useRef(SCRIPT);
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
  useEffect(() => {
    commentatorScriptRef.current = {
      ...SCRIPT,
      ...(commentatorPhrases || {}),
    };
  }, [commentatorPhrases]);
  const commentatorMilestonesRef = useRef({ m25: false, m50: false, m75: false });
  const [focusLost, setFocusLost] = useState(false);
  const [streak, setStreak] = useState(0);
  const [wpmHistory, setWpmHistory] = useState([]);       // [{t, wpm}] for sparkline
  const [isNewPB, setIsNewPB] = useState(false);
  const [mistakeMap, setMistakeMap] = useState({});       // char â†’ count
  const [recentRaces, setRecentRaces] = useState(() => getRecentRaces());
  const [waitingElapsed, setWaitingElapsed] = useState(0);
  // â”€â”€ Feature #1: WPM sparkline is already collected in wpmHistory â€” rendered below â”€â”€
  // â”€â”€ Feature #2: AFK/forfeit detection state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [afkWarning, setAfkWarning] = useState(false);
  const lastHeartbeatRef = useRef(Date.now());
  // â”€â”€ Feature #3: Spectator mode state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // â”€â”€ Feature #4: Daily challenge state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [dailyChallenge, setDailyChallenge] = useState(() => getDailyChallenge());
  const [showDailyChallenge, setShowDailyChallenge] = useState(false);
  // â”€â”€ Feature #5: Custom text / paste-your-own â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [customText, setCustomText] = useState('');
  const [useCustomText, setUseCustomText] = useState(false);
  const [showCustomTextPanel, setShowCustomTextPanel] = useState(false);
  // â”€â”€ Feature #6: WPM skill-based matchmaking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [wpmFilter, setWpmFilter] = useState({ min: 0, max: 300 });
  const [showWpmFilter, setShowWpmFilter] = useState(false);
  // â”€â”€ Feature #7: Share card (PNG via canvas) â€” exportScoreCard handles this â”€
  // â”€â”€ Feature #8: Keyboard heatmap on results â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [showHeatmap, setShowHeatmap] = useState(false);
  // â”€â”€ NEW #A: Penalty Mode â€” backspace disabled â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [penaltyMode, setPenaltyMode] = useState(false);
  // â”€â”€ NEW #B: Keyboard shortcut overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [aiCoaching, setAiCoaching] = useState(null);
  const [aiCoachingError, setAiCoachingError] = useState(false);
  // â”€â”€ NEW #D: Post-race AI coaching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // â”€â”€ NEW #E: Ghost race â€” replay personal best â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [ghostFrames, setGhostFrames] = useState([]);      // pb replay frames for this session
  const [ghostIndex, setGhostIndex] = useState(0);         // which frame the ghost is on
  const ghostIntervalRef = useRef(null);
  const backToLobbyRef = useRef(() => {});
  // â”€â”€ Feature #10: Win streak â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [winStreak, setWinStreak] = useState(() => getWinStreak());

  // Fix #13: unique SVG gradient ID per component instance â€” prevents collisions
  // when React strict-mode mounts the component twice or when two instances coexist.
  const sparkGradId = useRef(`sparkGrad-${Math.random().toString(36).slice(2)}`);
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const inputRef = useRef(null);
  const typingStageRef = useRef(null);
  const currentCharacterRef = useRef(null);
  const timerRef = useRef(null);
  // Fix #1: ref-based in-flight guard and loaded-key tracker to prevent re-fetching on page revisit
  const contentLoadingRef = useRef(false);
  const loadedForRef = useRef('');

  // Typed notice helper â€” keeps callsites clean
  const showNotice = useCallback((message, type = 'info') => {
    setNotice(message ? { message, type } : null);
  }, []);

  const { liveFeed, liveFeedError, refreshFeed } = useLiveFeed({
    phase,
    fetchLiveRaces,
    pollIntervalMs: LOBBY_FEED_POLL_INTERVAL_MS,
    enabled: !practicePage && phase !== 'racing',
  });

  const {
    spectateRoom,
    spectateData,
    watchRoom,
    stopWatching,
  } = useSpectateRoom({
    fetchLiveRaceRoom,
    pollIntervalMs: SPECTATE_POLL_INTERVAL_MS,
  });

  useEffect(() => {
    let active = true;
    const syncUser = () => {
      if (active) setCurrentUser(getStoredUserSnapshot());
    };

    // Use the cached identity immediately so practice controls do not wait on
    // a second network request or briefly redirect an already signed-in user.
    syncUser();
    fetchCurrentUser()
      .then((user) => {
        if (!active) return;
        if (user) {
          setCurrentUser(user);
        } else if (!getStoredUserSnapshot()) {
          setCurrentUser(null);
        }
      })
      .catch(() => {});

    window.addEventListener('typearena-user-changed', syncUser);
    window.addEventListener('storage', syncUser);
    return () => {
      active = false;
      window.removeEventListener('typearena-user-changed', syncUser);
      window.removeEventListener('storage', syncUser);
    };
  }, []);
  // Start background music on first interaction â€” autoplay policy safe because
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
    // Fix #7 (Issue 7): `currentUser === null` means guest (resolved, not signed in).
    // `currentUser === undefined` means still loading â€” that's when we should wait.
    // The original guard had these backwards, so guests never triggered the welcome.
    if (currentUser === undefined) return; // still loading â€” wait
    _welcomeFiredRef.current = true;
    const displayName = name || 'Champion';
    const timer = window.setTimeout(() => {
      // Part 1 â€” personalised welcome (force so it cuts through anything)
      speakSequence(commentatorScriptRef.current.welcome(displayName), { force: true, rate: 1.05, pitch: 0.88, gap: 180 });
      // Part 2 â€” feature tour starts after the welcome finishes (~4 s)
      window.setTimeout(() => {
        if (!_commentatorCancelFlag) {
          speakSequence(commentatorScriptRef.current.featureTour(), { force: true, rate: 1.0, pitch: 0.9, gap: 260 });
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



  const redirectToProfile = useCallback(() => {
    if (currentUser === undefined) return;
    const redirectPath = `${location.pathname}${location.search || ''}`;
    showNotice('Sign in first to play, join live races, or compete in private rooms.', 'info');
    navigate(`/profile?redirect=${encodeURIComponent(redirectPath)}`);
  }, [currentUser, location.pathname, location.search, navigate, showNotice]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const inviteCode = (params.get('invite') || '').trim().toUpperCase();
    const password = params.get('password') || '';
    const nextTournamentId = (params.get('tournamentId') || '').trim();

    setTournamentId(nextTournamentId);
    setInitialRoomId((params.get('room') || '').trim());

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
    const key = `${mode}__${language}`;
    // Fix #1: skip if we already have content for this exact mode+language combo
    // and skip if a fetch is already in-flight (ref-based guard avoids stale-closure issue)
    if (generatedContent && loadedForRef.current === key) return;
    if (contentLoadingRef.current) return;

    let cancelled = false;
    const loadGeneratedContent = async () => {
      contentLoadingRef.current = true;
      setContentLoading(true);
      try {
        const excludeContentIds = getUsedContentIds(mode, language);
        const content = await getRaceContent(mode, language, { excludeContentIds });
        if (!cancelled) {
          setGeneratedContent(content);
          loadedForRef.current = key; // mark as loaded for this mode+language
          // NOTE: we intentionally do NOT call recordUsedContentId here.
          // The ID is recorded when the race actually starts (in startPracticeRace /
          // startLiveRace) so that merely previewing content in the lobby doesn't
          // exhaust the rotation pool.
        }
      } catch (err) {
        // Bug B fix: previously no catch â€” a network error left generatedContent null
        // silently and allowed the user to start a race against the 43-char placeholder.
        if (!cancelled) {
          console.error('Failed to load race content:', err);
          showNotice('Could not load race content. Check your connection and try again.', 'error');
        }
      } finally {
        contentLoadingRef.current = false;
        if (!cancelled) setContentLoading(false);
      }
    };
    loadGeneratedContent();
    return () => { cancelled = true; };
  }, [language, mode, phase, showNotice]); // eslint-disable-line react-hooks/exhaustive-deps


  // Refs that mirror fast-changing state so useCallback dependencies stay stable
  const typingTextRef = useRef(typingText);
  const timeLeftRef   = useRef(timeLeft);
  const replayFramesRef = useRef(replayFrames);
  useEffect(() => { typingTextRef.current   = typingText;   }, [typingText]);
  useEffect(() => { timeLeftRef.current     = timeLeft;     }, [timeLeft]);
  useEffect(() => { replayFramesRef.current = replayFrames; }, [replayFrames]);
  useEffect(() => {
    const handleWindowBlur = () => setFocusLost(true);
    const handleWindowFocus = () => setFocusLost(false);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  const getModeDescription = useCallback(
    (modeId) => MODE_CONFIG.find((item) => item.id === modeId)?.description || '',
    []
  );
  const persistLatestRaceResult = useCallback((payload) => {
    sessionStorage.setItem(LATEST_RACE_RESULT_KEY, JSON.stringify(payload));
  }, []);
  const {
    liveRoom,
    liveRoomRef,
    serverClockOffsetRef,
    loadingLive,
    liveAction,
    countdownRemaining,
    queueElapsed,
    isSubmittingRef,
    isLeavingRef,
    syncRoomClock,
    startLiveRace,
    createFriendBattle,
    hostStartFriendBattle,
    joinFriendBattle,
    cancelPrivateRoom,
    leaveLiveRoom,
    submitHeartbeat,
    submitFinalLiveResult,
    resetLiveSession,
    myPlayer,
    opponent,
  } = useLiveRaceSession({
    currentUser,
    phase,
    setPhase,
    mode,
    setMode,
    language,
    setLanguage,
    duration,
    setDuration,
    friendBattle,
    setFriendBattle,
    tournamentId,
    initialRoomId,
    wpmFilter,
    generatedContentPassage: generatedContent?.passage,
    redirectToProfile,
    navigate,
    refreshFeed,
    showNotice,
    inputRef,
    typingTextRef,
    timeLeftRef,
    replayFramesRef,
    getModeDescription,
    getUsedContentIds,
    recordUsedContentId,
    persistLatestRaceResult,
    setRaceResult,
    setTypingText,
    setReplayFrames,
    setRaceOver,
    setTimeLeft,
  });

  const finishRaceRef = useRef(null);
  const finishRace = useCallback(async () => {
    if (isSubmittingRef.current) {
        console.warn("Submission already in progress, ignoring duplicate call.");
        return;
    }
    isSubmittingRef.current = true;

    try {
        // Fix #9: read from refs instead of stale closure values so the final
        // tick always gets the real last-known timeLeft / typingText / replayFrames.
        const currentTypingText   = typingTextRef.current;
        const currentTimeLeft     = timeLeftRef.current;
        const currentReplayFrames = replayFramesRef.current;

        const elapsed = Math.max(1, duration - currentTimeLeft);
        // Bug A fix: finishRace previously always computed accuracy against
        // generatedContent?.passage, which is wrong when the player is using the
        // daily challenge or custom text. Mirror the same sourceText priority chain
        // used by the component so WPM/accuracy are calculated against the correct passage.
        const sourceText = liveRoom?.text
            || (showDailyChallenge && dailyChallenge?.passage ? dailyChallenge.passage : null)
            || (useCustomText && customText ? customText : null)
            || generatedContent?.passage
            || MODE_CONFIG.find((item) => item.id === mode)?.description
            || '';
        const wpm = calculateWPM(currentTypingText, elapsed);
        const accuracy = calculateAccuracy(sourceText, currentTypingText);

        const finalData = {
            id: generateRaceId(),
            wpm,
            accuracy,
            duration,
            mode,
            language,
        };

        if (liveRoom?.id) {
            await submitFinalLiveResult({ wpm, accuracy, finalData });
            return;
        }

        if (isLeavingRef.current) return;

        // Solo / practice path: submit to the server fire-and-forget so a network
        // error never blocks setPhase('results'). Previously this was awaited before
        // the results logic, so any API failure (401, 500, offline) caused the screen
        // to silently hang on 'racing' with no results shown.
        submitRaceResult(finalData).catch((err) => {
            console.warn('submitRaceResult failed (non-fatal):', err);
        });

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
            savePB(mode, language, duration, wpm, accuracy, currentReplayFrames);
            setIsNewPB(true);
        }

        // #10 win streak â€” solo race: only count as a win when the player actually typed
        // something. A 0-WPM submission (e.g. timer expired with no input) is not a win.
        // Fix #5 (Issue 5): previously always passed true, so forfeits inflated the streak.
        const updatedStreak = updateWinStreak(wpm > 0);
        setWinStreak(updatedStreak);

        // Play finish sound
        playSound('finish');
        if (commentatorEnabled) {
          setTimeout(() => {
          const _finishName = currentUser?.username || currentUser?.name || null;
          const _finishScript = _finishName
            ? [_finishName + '!', ..._pick(commentatorScriptRef.current.finish)]
            : _pick(commentatorScriptRef.current.finish);
          speakSequence(_finishScript, { force: true, rate: 1.12, pitch: 0.88, gap: 200 });
        }, 600);
        }

        const resultPayload = {
            ...finalData,
            netWPM: Math.max(0, Math.round((wpm * (accuracy / 100)) * 10) / 10),
            coachTip: accuracy < 92 ? 'Accuracy dipped. Try smoother keystrokes.' : 'Strong run. Keep your rhythm.',
            replayFrames: currentReplayFrames,
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
// Fix #9: removed timeLeft, typingText, replayFrames from deps â€” read via refs above.
}, [commentatorEnabled, currentUser?.name, currentUser?.username, customText, dailyChallenge, duration, generatedContent, isLeavingRef, isSubmittingRef, language, liveRoom, mode, showDailyChallenge, submitFinalLiveResult, useCustomText]);
  const handleFinishRace = useCallback(() => {
    if (phase !== 'racing' || isSubmittingRef.current) {
      return;
    }
    window.clearInterval(timerRef.current);
    setRaceOver(true);
    finishRace();
  }, [finishRace, isSubmittingRef, phase]);
  // Keep the ref always pointing at the latest finishRace so the timer
  // interval can call it without being listed as a dep of the timer effect
  finishRaceRef.current = finishRace;
  // Stop music when component unmounts (navigate away)
  useEffect(() => () => { _orchestra.stop(); }, []);

  // â”€â”€ Feature #2: AFK / rage-quit penalty detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        submitFinalLiveResult({
          wpm: 0,
          accuracy: 0,
          finalData: {
            id: generateRaceId(),
            wpm: 0,
            accuracy: 0,
            duration,
            mode,
            language,
          },
        }).catch(() => {});
        // Keep the player on the result flow so the shared winner can be shown.
        showNotice('You were inactive, so your race was submitted as a forfeit.', 'warning');
      }
    }, 3000);
    return () => window.clearInterval(afkCheck);
  }, [duration, language, liveRoom?.id, mode, phase, showNotice, submitFinalLiveResult]);

  // â”€â”€ Feature #4: Daily challenge loader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadDailyChallenge = useCallback(async () => {
    try {
      // The backend is authoritative: it uses Nairobi time and may have rotated the passage.
      const content = await fetchDailyContent(language);
      const entry = { passage: content.passage, id: content.id, language, publishAt: content.publishAt, expiryAt: content.expiryAt, isScheduled: content.isScheduled };
      saveDailyChallenge(entry);
      setDailyChallenge(entry);
      setShowDailyChallenge(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Show the server-selected Daily Challenge at the top of every practice lobby.
  useEffect(() => { loadDailyChallenge(); }, [loadDailyChallenge]);

  // Queue elapsed now comes from useLiveRaceSession.

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
    if (phase !== 'waiting') {
      setWaitingElapsed(0);
      return undefined;
    }

    const startedAt = Date.now();
    setWaitingElapsed(0);
    const interval = window.setInterval(() => {
      setWaitingElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    // Run the race timer during active racing â€” for both live rooms and solo/practice races
    if (phase !== 'racing') {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }

    // Run initial sync cycle
    syncRoomClock(liveRoom);

    timerRef.current = window.setInterval(() => {
      // Read the latest room from the ref â€” not the stale closure value
      const currentRoom = liveRoomRef.current;

      // For live races, bail if the room has disappeared or phase changed.
      // For solo races currentRoom is null â€” that's fine, fall through to the local tick below.
      if (currentRoom?.id && phase !== 'racing') {
        window.clearInterval(timerRef.current);
        return;
      }

      if (currentRoom?.startedAt) {
        syncRoomClock(currentRoom);

        const startedAtMs = new Date(currentRoom.startedAt).getTime();
        const elapsedSeconds = Math.max(0, (Date.now() + serverClockOffsetRef.current - startedAtMs) / 1000);
        const countdownSeconds = Number(currentRoom.countdown || 10);
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
    }, liveRoom?.startedAt ? 250 : LOCAL_RACE_TICK_INTERVAL_MS);

    return () => window.clearInterval(timerRef.current);
  // Bug 2 fix: liveRoom?.startedAt removed from deps â€” every heartbeat returned a new room
  // object (same startedAt value) which caused the interval to be cleared and recreated,
  // dropping a tick and making the on-screen timer stutter or drift by up to 1s per heartbeat.
  // liveRoom?.id is kept so the timer resets when entering a new room. syncRoomClock at
  // effect-setup time handles the initial startedAt alignment; liveRoomRef is read inside
  // the interval for subsequent ticks without causing the effect to re-run.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, liveRoom?.id, phase, syncRoomClock]);

  const startPracticeRaceWithMode = useCallback((nextMode) => {
    const resolvedMode = nextMode || mode;
    if (nextMode && nextMode !== mode) {
      setMode(nextMode);
    }
    setShowPracticeModes(false);

    if (currentUser === undefined) return;
    if (!currentUser?.id) {
      redirectToProfile();
      return;
    }

    resetLiveSession();
    isLeavingRef.current = false;
    isSubmittingRef.current = false;
    setTypingText('');
    setReplayFrames([]);
    setRaceResult(null);
    showNotice(null);
    setRaceOver(false);
    setTimeLeft(duration);
    // Always reset race-session state for a clean start (same as startPracticeRace)
    setStreak(0);
    setWpmHistory([]);
    setIsNewPB(false);
    setMistakeMap({});
    setFocusLost(false);

    // Load ghost frames from stored PB
    const pbEntry = getPB(resolvedMode, language, duration);
    setGhostFrames(Array.isArray(pbEntry?.frames) ? pbEntry.frames : []);
    setGhostIndex(0);
    window.clearInterval(ghostIntervalRef.current);

    // The lobby useEffect already pre-loads generatedContent; reuse it and
    // just record the ID so the rotation pool advances correctly.
    if (generatedContent?.id || generatedContent?.contentId) {
      recordUsedContentId(
        generatedContent.id ?? generatedContent.contentId,
        resolvedMode,
        language,
        generatedContent.totalContentCount || 0
      );
    }

    commentatorMilestonesRef.current = { m25: false, m50: false, m75: false };
    if (commentatorEnabled) {
      const _racerName = currentUser?.username || currentUser?.name || null;
      const _raceScript = _racerName
        ? [_racerName + '!', ..._pick(commentatorScriptRef.current.raceStart)]
        : _pick(commentatorScriptRef.current.raceStart);
      speakSequence(_raceScript, { force: true, rate: 1.15, pitch: 0.90, gap: 160 });
    }
    setPhase('racing');
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [commentatorEnabled, currentUser, duration, generatedContent?.contentId, generatedContent?.id, generatedContent?.totalContentCount, isLeavingRef, isSubmittingRef, language, mode, redirectToProfile, resetLiveSession, showNotice]);

  // startPracticeRace is a convenience wrapper that starts in the current mode.
  const startPracticeRace = useCallback(() => {
    startPracticeRaceWithMode(mode);
  }, [startPracticeRaceWithMode, mode]);

  // â”€â”€ NEW #E: inject ghost cursor blink animation once â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const id = 'typearena-ghost-style';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = '@keyframes ghostBlink{0%,100%{opacity:1}50%{opacity:0}} .char--ghost{border-bottom:2px solid hsl(200 80% 65%/0.9);animation:ghostBlink 1s step-end infinite;}';
    document.head.appendChild(el);
  }, []);

  // â”€â”€ NEW #E: Ghost race playback â€” advance ghost cursor in real time â”€â”€â”€â”€â”€â”€â”€
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
    setAiCoaching('loading');
    setAiCoachingError(false);
    const controller = new AbortController();

    const topMistakes = Object.entries(mistakeMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([ch, n]) => `'${ch === ' ' ? 'space' : ch}' (${n}Ã—)`)
      .join(', ') || 'none';

    const wpmTrend = wpmHistory.length >= 3
      ? `${wpmHistory[0].wpm.toFixed(0)} â†’ ${wpmHistory[Math.floor(wpmHistory.length / 2)].wpm.toFixed(0)} â†’ ${wpmHistory[wpmHistory.length - 1].wpm.toFixed(0)} WPM`
      : `${raceResult.wpm.toFixed(0)} WPM`;

    const prompt = `You are a concise typing coach. A player just finished a ${raceResult.duration}s ${raceResult.mode} race.

Stats:
- WPM: ${raceResult.wpm.toFixed(1)}, Net WPM: ${raceResult.netWPM?.toFixed(1) || 'N/A'}, Accuracy: ${raceResult.accuracy.toFixed(1)}%
- WPM trend (start â†’ mid â†’ end): ${wpmTrend}
- Most-missed characters: ${topMistakes}

Give exactly 2-3 concrete, personalised drill suggestions. Each drill must name specific words or patterns to practise. Format as a short numbered list. No preamble, no sign-off. Plain text only, no markdown.`;

    // SECURITY: never call the Anthropic API directly from the browser â€” the key
    // would be visible to every user. Route through your own backend proxy instead.
    fetch(buildApiUrl('/api/ai-coaching'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`AI coaching request failed: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const text = (data.content || []).map((b) => b.text || '').join('').trim();
        setAiCoaching(text || null);
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setAiCoachingError(true);
        setAiCoaching(null);
      });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const backToLobby = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    sessionStorage.removeItem(LATEST_RACE_RESULT_KEY);
    resetLiveSession();
    setRaceResult(null);
    setRaceOver(false);
    setTypingText('');
    setReplayFrames([]);
    showNotice(null);
    setShowPracticeModes(false);
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
    // Fix #1: allow fresh content fetch on next lobby visit
    loadedForRef.current = '';
    // Fix #5: reset daily challenge so it doesn't bleed into subsequent practice races
    setShowDailyChallenge(false);
    setPhase('lobby');
  }, [resetLiveSession, showNotice]);
  backToLobbyRef.current = backToLobby;

  const copyInviteCode = useCallback(async () => {
    const inviteCode = liveRoom?.inviteCode || friendBattle.inviteCode;
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      showNotice('Invite code copied.', 'success');
    } catch {
      showNotice('Copy failed on this device.', 'warning');
    }
  }, [friendBattle.inviteCode, liveRoom?.inviteCode, showNotice]);

  const handleInputChange = useCallback((event) => {
    lastHeartbeatRef.current = Date.now(); // #2 AFK reset on every keystroke
    // â”€â”€ NEW #A: Penalty Mode â€” block backspace entirely â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Fix #7: event.preventDefault() has no effect on React controlled inputs;
    // the early return alone is what prevents the value update.
    if (penaltyMode && event.target.value.length < typingText.length) {
      return;
    }
    const value = event.target.value;
    const src = liveRoom?.text || (useCustomText && customText ? customText : null) || generatedContent?.passage || '';
    // Fix #12: cap input at source length â€” typing past the end silently inflated
    // WPM because extra characters contributed to the character count but were
    // never visible or penalised in the accuracy calculation.
    if (src && value.length > src.length) return;

    // Bug 1 fix: finish the race immediately when the player types the last character.
    // Without this, the race only ended when the countdown timer hit 0, so a player
    // who completed the passage early would sit idle until the clock ran out, and
    // their WPM was calculated against the full duration rather than their actual time.
    if (src && value.length === src.length && !isSubmittingRef.current && !raceOver) {
      const finalFrame = { typedText: value, timestamp: new Date().toISOString() };
      // State effects run after this event; update refs first so the final
      // character and replay frame are included in the immediate submission.
      typingTextRef.current = value;
      replayFramesRef.current = [...replayFramesRef.current.slice(-299), finalFrame];
      setTypingText(value);
      replayFrameAtRef.current = Date.now();
      setReplayFrames(replayFramesRef.current);
      if (liveRoom?.id) {
        const currentWpm = calculateWPM(value, Math.max(1, duration - timeLeftRef.current));
        submitHeartbeat({
          progress: 100,
          currentWpm,
          currentAccuracy: calculateAccuracy(src, value),
        });
      }
      window.clearInterval(timerRef.current);
      setRaceOver(true);
      finishRaceRef.current();
      return;
    }
    const newLen = value.length;
    const prevLen = typingText.length;

    // Sound + streak + mistake tracking (only on forward typing)
    if (newLen > prevLen && src) {
      const typedChar = value[newLen - 1];
      const expectedChar = src[newLen - 1];
      const isCorrect = typedChar === expectedChar;
      playSound(isCorrect ? 'key' : 'error');
      if (mobileTypingSettings.haptics && typeof navigator.vibrate === 'function') {
        navigator.vibrate(isCorrect ? 8 : 18);
      }
      if (isCorrect) {
        setStreak((s) => {
          const newStreak = s + 1;
          // Commentator: streak milestones
          if (commentatorEnabled) {
            if (newStreak === 10) speakSequence(_pick(commentatorScriptRef.current.streak10), { rate: 1.18, pitch: 0.88, gap: 140 });
            else if (newStreak === 25) speakSequence(_pick(commentatorScriptRef.current.streak25), { force: true, rate: 1.2, pitch: 0.86, gap: 130 });
          }
          return newStreak;
        });
      } else {
        setStreak(0);
        if (expectedChar) {
          setMistakeMap((m) => ({ ...m, [expectedChar]: (m[expectedChar] || 0) + 1 }));
        }
        // Commentator: occasional error reaction (not every error â€” 1-in-6 chance)
        if (commentatorEnabled && Math.random() < 0.17) {
          speakSequence(_pick(commentatorScriptRef.current.error), { rate: 1.1, pitch: 0.91, gap: 150 });
        }
      }

      // Commentator: progress milestones
      if (commentatorEnabled && src.length > 0) {
        const pct = newLen / src.length;
        const ms = commentatorMilestonesRef.current;
        if (!ms.m25 && pct >= 0.25) {
          ms.m25 = true;
          speakSequence(_pick(commentatorScriptRef.current.milestone25), { rate: 1.1, pitch: 0.90, gap: 170 });
        } else if (!ms.m50 && pct >= 0.50) {
          ms.m50 = true;
          speakSequence(_pick(commentatorScriptRef.current.milestone50), { force: true, rate: 1.13, pitch: 0.88, gap: 160 });
        } else if (!ms.m75 && pct >= 0.75) {
          ms.m75 = true;
          speakSequence(_pick(commentatorScriptRef.current.milestone75), { force: true, rate: 1.15, pitch: 0.87, gap: 155 });
        }
      }
    }

    // WPM history for sparkline â€” record a point every ~2 seconds of elapsed time
    // Fix #6 (Issue 6): `timeLeft` was a stale closure value here; read the ref instead.
    const elapsed = Math.max(1, duration - timeLeftRef.current);
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
    // Keep replay useful without allocating a full text snapshot for every keypress.
    const replayNow = Date.now();
    if (replayNow - replayFrameAtRef.current >= 250) {
      replayFrameAtRef.current = replayNow;
      setReplayFrames((prev) => [
        ...prev.slice(-299),
        { typedText: value, timestamp: new Date().toISOString() },
      ]);
    }
    if (liveRoom?.id) {
      const sourceTextLength = Math.max(1, (liveRoom.text || '').length);
      const progress = Math.min(100, Math.round((value.length / sourceTextLength) * 100));
      const currentWpm = calculateWPM(value, Math.max(1, duration - timeLeft));
      const liveSourceText = liveRoom?.text || generatedContent?.passage || 'Type fast, type clean, and own the round.';
      const currentAccuracy = calculateAccuracy(liveSourceText, value);
      submitHeartbeat({ progress, currentWpm, currentAccuracy });
    }
  // Fix #8 (Issue 8): memoised with useCallback. timeLeftRef.current is read for the
  // sparkline (fix #6). timeLeft is kept for the live-room heartbeat WPM calculation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentatorEnabled, customText, duration, generatedContent?.passage, isSubmittingRef, liveRoom, mobileTypingSettings.haptics, penaltyMode, raceOver, submitHeartbeat, timeLeft, typingText, useCustomText]);

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
  // Covers controlled-input/IME updates that may bypass the direct onChange check.
  useEffect(() => {
    if (phase === 'racing' && !raceOver && sourceText && typingText.length >= sourceText.length) {
      handleFinishRace();
    }
  }, [handleFinishRace, phase, raceOver, sourceText, typingText.length]);
  // â”€â”€ NEW #E: ghost position â€” character the ghost has reached â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const updateMobileTypingSettings = useCallback((patch) => {
    setMobileTypingSettings((current) => {
      const next = { ...current, ...patch };
      localStorage.setItem(MOBILE_TYPING_SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (phase !== 'racing' || raceOver || !mobileTypingSettings.autoScroll) return undefined;
    const stage = typingStageRef.current;
    const currentCharacter = currentCharacterRef.current;
    if (!stage || !currentCharacter || stage.scrollHeight <= stage.clientHeight) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const stageBounds = stage.getBoundingClientRect();
      const characterBounds = currentCharacter.getBoundingClientRect();
      const comfortTop = stageBounds.top + stage.clientHeight * 0.28;
      const comfortBottom = stageBounds.top + stage.clientHeight * 0.70;
      if (characterBounds.top < comfortTop || characterBounds.bottom > comfortBottom) {
        stage.scrollTo({
          top: Math.max(0, stage.scrollTop + characterBounds.top - comfortTop),
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mobileTypingSettings.autoScroll, phase, raceOver, typingText.length]);

  const sourceChars = useMemo(() => sourceText.split(''), [sourceText]);
  // Bug E fix: stored PB frames now use compact {len, timestamp} format.
  // Support both old full-text frames and new compact frames.
  const ghostLen = ghostFrames.length > 0
    ? (ghostFrames[ghostIndex]?.len ?? (ghostFrames[ghostIndex]?.typedText || '').length)
    : -1;

  const renderedText = useMemo(() => (
    sourceChars.map((char, index) => {
      const isTyped = index < typingText.length;
      const isCurrent = index === typingText.length;
      const isGhost = ghostLen >= 0 && index === ghostLen && !isCurrent;
      // Fix #4 (Issue 4): compute per-character correctness so TypingCharacter can
      // render 'char incorrect' for mismatches instead of always 'char correct'.
      const isCorrect = isTyped && typingText[index] === char;
      return (
        <TypingCharacter
          key={index}
          char={char}
          isCurrent={isCurrent}
          isGhost={isGhost}
          isTyped={isTyped}
          isCorrect={isCorrect}
          activeRef={isCurrent ? currentCharacterRef : null}
        />
      );
    })
  // ghostLen re-renders the ghost position as ghostIndex advances
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [sourceChars, typingText, ghostLen]);

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
  const waitingPlayers = (liveRoom?.players || []).filter((player) => !player?.result);
  const waitingOnOpponentNames = waitingPlayers
    .filter((player) => String(player.userId) !== String(currentUser?.id))
    .map((player) => player.username || 'Opponent');
  const submittedPlayersCount = (liveRoom?.players || []).filter((player) => Boolean(player?.result)).length;
  const totalPlayersCount = liveRoom?.players?.length || 0;
  const waitingStatusMessage = waitingOnOpponentNames.length
    ? `Waiting on ${waitingOnOpponentNames.join(', ')} to finish...`
    : 'Finalizing winner and standings...';
  const equippedSummary = [
    themePreset.label,
    skinPreset.label || 'Default keyboard skin',
    badgePreset.label,
  ];

  const exportScoreCard = () => {
    if (!raceResult) return;
    const accentColor = themePreset.style?.['--arena-accent'] || '#22c55e';
    const goldColor = themePreset.style?.['--arena-gold'] || '#facc15';

    // #7 â€” generate a proper PNG via Canvas (renders on WhatsApp previews)
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
    // Fix #6: the previous string-replace approach to convert hsl/rgb â†’ hsla/rgba
    // was fragile and broke for hex colors and CSS variables. Resolve the actual
    // computed accent color at runtime so the canvas gradient is always valid.
    const resolvedAccent = (() => {
      try {
        const tmp = document.createElement('div');
        tmp.style.color = accentColor;
        document.body.appendChild(tmp);
        const computed = window.getComputedStyle(tmp).color; // always returns rgb(...)
        document.body.removeChild(tmp);
        // computed is "rgb(r, g, b)" â€” convert to rgba
        return computed.replace('rgb(', 'rgba(').replace(')', ', 0.08)');
      } catch {
        return 'rgba(34,197,94,0.08)';
      }
    })();
    const glow = ctx2d.createRadialGradient(540, 400, 0, 540, 400, 500);
    glow.addColorStop(0, resolvedAccent);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
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

    // WPM â€” big number
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
      ctx2d.fillText('ðŸ† New Personal Best!', 100, 883);
    }

    // Footer
    ctx2d.font = '500 26px monospace';
    ctx2d.fillStyle = 'rgba(245,245,245,0.25)';
    ctx2d.fillText('typearena.io', 80, 1040);

    canvas.toBlob((blob) => {
      // Fix #9 (Issue 9): blob is null if the canvas is tainted or the encoder fails.
      // createObjectURL(null) throws a TypeError, so guard before proceeding.
      if (!blob) {
        console.error('exportScoreCard: canvas.toBlob returned null â€” cannot create PNG');
        return;
      }
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
              </div></div>
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
              <button className="btn btn-primary" onClick={startPracticeRace} disabled={contentLoading || currentUser === undefined || (!useCustomText && !dailyChallenge && !generatedContent?.passage)}>
                {currentUser === undefined ? <span className="arena-spinner" aria-label="Loadingâ€¦" /> : contentLoading ? <span className="arena-spinner" aria-label="Loading contentâ€¦" /> : 'Start This Practice'}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={startLiveRace} disabled={loadingLive || currentUser === undefined}>
                {(loadingLive || currentUser === undefined) ? <span className="arena-spinner" aria-label="Loadingâ€¦" /> : 'Join Live 1v1'}
              </button>
            )}
          </div>

          <p className="results-challenge arena-shortcut-hint">
            {contentLoading
              ? 'â³ Generating race contentâ€¦'
              : `Current mode: ${MODE_CONFIG.find((item) => item.id === mode)?.label || 'Standard'} Â· ${duration}s Â· Press Enter to start Â· Press ? for shortcuts`}
          </p>

          {/* â”€â”€ NEW #B: Keyboard shortcut overlay â”€â”€ */}
          {showShortcuts && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
              onClick={() => setShowShortcuts(false)}>
              <div style={{ background:'var(--arena-panel)', border:'1px solid var(--arena-panel-border)', borderRadius:'var(--arena-radius-lg,12px)', maxWidth:'480px', width:'100%', padding:'1.5rem', position:'relative' }}
                onClick={(e) => e.stopPropagation()}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                  <h2 style={{ margin:0, fontSize:'1.05rem', color:'var(--arena-text)' }}>âŒ¨ï¸ Keyboard Shortcuts</h2>
                  <button className="btn btn-sm btn-outline-light" onClick={() => setShowShortcuts(false)}>âœ•</button>
                </div>
                <div style={{ display:'grid', gap:'0.5rem' }}>
                  {[
                    ['Enter', 'Start race (when not focused on input)'],
                    ['Esc', 'Close this overlay / cancel action'],
                    ['?', 'Toggle this shortcut cheat sheet'],
                    ['Tab', 'Switch between race modes (in lobby)'],
                    ['30 / 60 / 120', 'Duration buttons â€” click or Tab to focus'],
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

          {/* â”€â”€ Feature #10: Win streak banner â”€â”€ */}
          {winStreak.count >= 2 && (
            <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', padding:'0.6rem 1rem', background:'var(--arena-accent-soft)', border:'1px solid var(--arena-accent)', borderRadius:'10px', marginBottom:'0.75rem' }}>
              <span style={{ fontSize:'1.4rem' }}>ðŸ”¥</span>
              <div>
                <strong style={{ color:'var(--arena-accent)', fontSize:'0.95rem' }}>{winStreak.count}-Race Win Streak!</strong>
                <p style={{ margin:0, fontSize:'0.78rem', color:'var(--arena-muted)' }}>Keep it going â€” one more race.</p>
              </div>
            </div>
          )}

          {/* â”€â”€ Feature #4: Daily challenge â”€â”€ */}
          <div style={{ marginBottom:'0.75rem' }}>
            <button className="btn btn-outline-primary" onClick={loadDailyChallenge} style={{ marginRight:'0.5rem' }}>
              ðŸ“… Daily Challenge
            </button>
            {showDailyChallenge && dailyChallenge && (
              <button className="btn btn-sm btn-outline-light" onClick={() => setShowDailyChallenge(false)}>Dismiss</button>
            )}
          </div>
          {showDailyChallenge && dailyChallenge && (
            <div style={{ background:'var(--arena-panel)', border:'1px solid var(--arena-panel-border)', borderRadius:'var(--arena-radius-lg)', padding:'1rem 1.25rem', marginBottom:'1rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--arena-accent)' }}>ðŸ“… Today's Challenge</span>
                <span style={{ fontSize:'0.75rem', color:'var(--arena-muted)' }}>{dailyChallenge.isScheduled ? 'Nairobi daily passage' : 'Daily fallback'}</span>
              </div>
              <p style={{ fontFamily:'var(--font-mono)', fontSize:'0.88rem', color:'var(--arena-text)', lineHeight:'1.7', margin:'0 0 0.75rem' }}>"{dailyChallenge.passage?.slice(0, 140)}â€¦"</p>
              <button className="btn btn-primary btn-sm" onClick={() => { setUseCustomText(false); setShowDailyChallenge(true); startPracticeRace(); }}>
                Race This Passage
              </button>
            </div>
          )}

          {/* â”€â”€ Feature #5: Custom text panel â”€â”€ */}
          <div style={{ marginBottom:'0.75rem' }}>
            <button className="btn btn-outline-primary" onClick={() => setShowCustomTextPanel((v) => !v)}>
              âœï¸ Paste Custom Text
            </button>
          </div>
          {showCustomTextPanel && (
            <div style={{ background:'var(--arena-panel)', border:'1px solid var(--arena-panel-border)', borderRadius:'var(--arena-radius-lg)', padding:'1rem 1.25rem', marginBottom:'1rem' }}>
              <p style={{ fontSize:'0.8rem', color:'var(--arena-muted)', marginBottom:'0.5rem' }}>Paste any text below â€” then start a practice race to type it.</p>
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value.slice(0, 2000))}
                placeholder="Paste your custom passage here (max 2000 chars)â€¦"
                rows={4}
                style={{ width:'100%', background:'hsl(240 15% 6%)', border:'1px solid var(--arena-panel-border)', borderRadius:'8px', color:'var(--arena-text)', fontFamily:'var(--font-mono)', fontSize:'0.85rem', padding:'0.6rem 0.9rem', resize:'vertical', outline:'none' }}
              />
              <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.5rem', alignItems:'center' }}>
                <button
                  className={`btn btn-sm ${useCustomText ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setUseCustomText((v) => !v)}
                  disabled={!customText.trim()}
                >
                  {useCustomText ? 'âœ“ Using custom text' : 'Use this text'}
                </button>
                {useCustomText && <span style={{ fontSize:'0.75rem', color:'var(--arena-accent)' }}>Custom text active â€” press Start Practice</span>}
                <span style={{ fontSize:'0.72rem', color:'var(--arena-muted)', marginLeft:'auto' }}>{customText.length}/2000</span>
              </div>
            </div>
          )}

          {/* â”€â”€ NEW #A: Penalty Mode toggle â”€â”€ */}
          <div style={{ marginBottom:'0.75rem', display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <button
              className={`btn ${penaltyMode ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setPenaltyMode((v) => !v)}
            >
              {penaltyMode ? 'ðŸš« Penalty Mode ON' : 'ðŸš« Penalty Mode'}
            </button>
            {penaltyMode && (
              <span style={{ fontSize:'0.78rem', color:'var(--arena-accent)' }}>
                Backspace disabled â€” type through your mistakes!
              </span>
            )}
          </div>

          {/* â”€â”€ Feature #6: WPM matchmaking filter â”€â”€ */}
          {!practicePage && (
            <div style={{ marginBottom:'0.75rem' }}>
              <button className="btn btn-outline-primary" onClick={() => setShowWpmFilter((v) => !v)}>
                ðŸŽ¯ Skill Filter {wpmFilter.min > 0 || wpmFilter.max < 300 ? `(${wpmFilter.min}â€“${wpmFilter.max} WPM)` : ''}
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
            <PrivateRoomPanel
              hasSignatureInvites={hasSignatureInvites}
              friendBattle={friendBattle}
              setFriendBattle={setFriendBattle}
              createFriendBattle={createFriendBattle}
              joinFriendBattle={joinFriendBattle}
              copyInviteCode={copyInviteCode}
              loadingLive={loadingLive}
                liveAction={liveAction}
              currentUser={currentUser}
              liveRoom={liveRoom}
            />
          )}

          {notice && (
            <div className={`arena-notice arena-notice--${notice.type || 'info'}`} role="status">
              {notice.type === 'error' && <span className="arena-notice__icon">âš </span>}
              {notice.type === 'success' && <span className="arena-notice__icon">âœ“</span>}
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
                      <span className="result-label">{r.mode} Â· {r.language} Â· {r.duration}s {isPB ? 'ðŸ† PB' : ''}</span>
                      <span className="result-value">{Number(r.wpm).toFixed(1)} WPM</span>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', opacity: 0.7 }}>{Number(r.accuracy).toFixed(1)}% accuracy Â· {new Date(r.date).toLocaleDateString()}</p>
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
            {liveFeedError && (
              <p className="results-challenge" style={{ marginTop: 0, color: 'hsl(0 75% 68%)' }}>
                Live feed is unavailable right now. Showing the last known rooms.
              </p>
            )}
            <div className="live-board__grid">
              {liveFeed.slice(0, 6).map((room) => (
                <div key={room.id} className="result-card live-card">
                  <span className="result-label">{room.mode}</span>
                  <span className="result-value">{room.status}</span>
                  <p>
                    {room.players?.length || 0}/{room.maxPlayers || 2} players | {room.spectators || 0} spectators
                  </p>
                  {room.status === 'racing' && (
                    <button
                      className="btn btn-sm btn-outline-light"
                      style={{ marginTop:'0.4rem', fontSize:'0.75rem' }}
                      onClick={() => watchRoom(room.id)}
                    >
                      ðŸ‘ Watch Live
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}
        </div>
      )}

      {/* â”€â”€ Feature #3: Inline Spectator Modal â”€â”€ */}
      {spectateRoom && spectateData && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.82)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'var(--arena-bg, #0f111a)', border:'1px solid var(--arena-panel-border)', borderRadius:'var(--arena-radius-lg)', maxWidth:'680px', width:'100%', padding:'1.5rem', position:'relative' }}>
            <button className="btn btn-sm btn-outline-light" style={{ position:'absolute', top:'1rem', right:'1rem' }} onClick={stopWatching}>âœ• Stop watching</button>
            <div style={{ marginBottom:'0.5rem', fontFamily:'var(--font-mono)', fontSize:'0.7rem', textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--arena-accent)' }}>
              ðŸ‘ Spectating â€” {spectateData.mode || 'live'} race
              {spectateData.status === 'completed' && <span style={{ marginLeft:'0.5rem', color:'var(--arena-gold)' }}>Â· Race Over</span>}
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
                    {player.result && <span style={{ color:'var(--arena-accent)' }}>âœ“ Finished</span>}
                  </div>
                </div>
              ))}
            </div>
            {spectateData.text && (
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.82rem', color:'var(--arena-muted)', lineHeight:'1.6', background:'hsl(240 14% 6%)', borderRadius:'8px', padding:'0.75rem 1rem', maxHeight:'120px', overflow:'hidden' }}>
                {spectateData.text.slice(0, 200)}â€¦
              </div>
            )}
            <p style={{ marginTop:'0.5rem', fontSize:'0.72rem', color:'var(--arena-muted)', opacity:0.6 }}>Refreshes every 3 seconds. You cannot interact with the race.</p>
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
              <p className="results-challenge">Get ready â€” race begins in {Math.max(0, countdownRemaining)} seconds</p>
            </>
          ) : (
            <>
              <h1>{liveRoom?.isPrivate ? 'Private Room Ready' : 'Queued for Live Race'}</h1>
              <p className="results-challenge">
                {notice?.message || (liveRoom?.isPrivate
                  ? 'Your room is ready. Share the invite and wait for your opponent to connect.'
                  : 'Waiting for an opponent to join your room.')}
              </p>
              {queueElapsed > 0 && (
                <p className="arena-queue-elapsed">
                  Waiting {queueElapsed}s
                  {queueElapsed >= 30 && !liveRoom?.isPrivate && (
                    <span className="arena-queue-timeout-hint"> â€” taking longer than usual. You can go back to the lobby and try again.</span>
                  )}
                </p>
              )}
            </>
          )}
          {(liveRoom?.inviteCode || friendBattle.inviteCode) && (
            <p className="results-challenge">Invite code: {liveRoom?.inviteCode || friendBattle.inviteCode}</p>
          )}
          {liveRoom?.isPrivate && liveRoom?.players?.length > 0 && (
            <div className="room-roster" aria-label="Players in this room">
              <div className="room-roster__header">
                <div>
                  <strong>Joined players</strong>
                  <span className="room-roster__count">{liveRoom.players.length}/{liveRoom.maxPlayers || 2}</span>
                </div>
                {liveRoom.status === 'waiting' && String(liveRoom.hostUserId) === String(currentUser?.id) && (
                  <label className="room-duration-control">
                    Race time
                    <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                      {[30, 60, 90, 120, 180, 300].map((seconds) => (
                        <option key={seconds} value={seconds}>{seconds}s</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="room-roster__players">
                {liveRoom.players.map((player) => (
                  <div className="room-roster__player" key={player.userId}>
                    {player.profileImage ? (
                      <img src={player.profileImage} alt="" className="room-roster__avatar" />
                    ) : (
                      <span className="room-roster__avatar room-roster__avatar--fallback" aria-hidden="true">
                        {(player.username || 'P').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span>{String(player.userId) === String(currentUser?.id) ? 'You' : player.username}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="results-actions">
            {liveRoom?.isPrivate && String(liveRoom?.hostUserId) === String(currentUser?.id) && liveRoom?.status === 'waiting' && (
              <button className="btn btn-primary" onClick={hostStartFriendBattle} disabled={loadingLive || (liveRoom?.players?.length || 0) < 2}>
                {loadingLive ? 'Starting...' : 'Start Race'}
              </button>
            )}
            {liveRoom?.isPrivate ? (
              <button className="btn btn-outline-danger" onClick={cancelPrivateRoom} disabled={loadingLive}>
                {loadingLive ? 'Canceling Roomâ€¦' : 'Cancel Room'}
              </button>
            ) : (
              // Bug fix: this used to call backToLobby directly, which only reset
              // local UI state and never told the server we left. That left an
              // orphaned "waiting" room in the DB that a later player could match
              // into and end up racing a ghost. Now this calls the backend leave
              // endpoint first (falls back to a local reset either way).
              <button
                className="btn btn-outline-danger"
                onClick={liveRoom?.id ? leaveLiveRoom : backToLobby}
                disabled={loadingLive}
              >
                {loadingLive ? 'Leaving Queueâ€¦' : 'Leave Queue'}
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
          <p className="results-challenge">{waitingStatusMessage}</p>
          <div
            className="results-grid"
            style={{ marginTop: '1rem', marginBottom: '0.5rem' }}
          >
            <div className="result-card">
              <span className="result-label">Submitted</span>
              <span className="result-value">{submittedPlayersCount}/{Math.max(totalPlayersCount, 1)}</span>
            </div>
            <div className="result-card">
              <span className="result-label">Waiting</span>
              <span className="result-value">{formatTime(waitingElapsed)}</span>
            </div>
          </div>
          {liveRoom?.players && (
            <div className="results-grid" style={{ marginTop: '1.5rem' }}>
              {liveRoom.players.map((player) => {
                const hasSubmitted = Boolean(player?.result);
                const isMe = String(player.userId) === String(currentUser?.id);
                return (
                  <div key={player.userId} className="result-card">
                    <span className="result-label">{isMe ? 'You' : (player.username || 'Opponent')}</span>
                    <span className="result-value" style={{ color: hasSubmitted ? 'var(--arena-accent, #22c55e)' : 'var(--arena-muted, #aaa)' }}>
                      {hasSubmitted ? 'âœ“ Done' : 'â³ Racing...'}
                    </span>
                    {hasSubmitted && player.result?.wpm != null && (
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                        {Number(player.result.wpm).toFixed(1)} WPM Â· {Number(player.result.accuracy).toFixed(1)}%
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="results-challenge" style={{ marginTop: '1rem', fontSize: '0.85rem', opacity: 0.7 }}>
            {waitingOnOpponentNames.length
              ? 'Final results will appear automatically as soon as every racer submits.'
              : 'Everyone has submitted. We are confirming the winner and final standings now.'}
          </p>
          {/* Fix #14: give the user an escape route so they can never get permanently stuck */}
          <div className="results-actions" style={{ marginTop: '1rem' }}>
            <button className="btn btn-secondary" onClick={backToLobby}>
              Back to Lobby
            </button>
          </div>
        </div>
      )}

      {phase === 'racing' && (
        <div className={`race-arena ${frameClassName} ${effectClassName}`} style={arenaStyle}>
          {/* â”€â”€ Feature #2: AFK warning â”€â”€ */}
          {afkWarning && (
            <div style={{ background:'hsl(0 60% 14%)', border:'1px solid hsl(0 55% 28%)', borderRadius:'8px', padding:'0.65rem 1rem', marginBottom:'0.75rem', color:'hsl(0 70% 72%)', fontSize:'0.85rem', fontWeight:600 }}>
              âš  You were inactive for too long. Race forfeited to protect prize integrity.
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
                {currentUser?.profileImage ? <img src={currentUser.profileImage} alt={`${currentUser?.username || 'Player'} profile`} style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }} /> : <span>{avatarPreset.mark}</span>}
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
            {/* â”€â”€ Feature #1: Full WPM sparkline with filled area â”€â”€ */}
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
                      {/* Fix #13: use instance-unique ID to avoid gradient collision under strict mode */}
                      <linearGradient id={sparkGradId.current} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--arena-accent)" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="var(--arena-accent)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={areaPath} fill={`url(#${sparkGradId.current})`} />
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
            {/* â”€â”€ NEW #E: ghost active indicator â”€â”€ */}
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
                <span className="stat-value live-mode">{mode}{penaltyMode ? ' ðŸš«' : ''}</span>
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
            liveRoom.players?.length > 2 ? (
              <div className="live-board" style={{ marginBottom: '1rem' }}>
                <div className="live-board__header"><h2>Live Leaderboard</h2><span>{liveRoom.players.length}/{liveRoom.maxPlayers || 2} racers</span></div>
                <div className="live-board__grid">
                  {[...liveRoom.players].sort((left, right) => Number(right.progress || 0) - Number(left.progress || 0)).map((player, index) => (
                    <div key={player.userId} className="result-card">
                      <span className="result-label">#{index + 1} {String(player.userId) === String(currentUser?.id) ? 'You' : player.username}</span>
                      <span className="result-value">{Number(player.progress || 0)}%</span>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem' }}>{Number(player.currentWpm || 0).toFixed(0)} WPM â€” {Number(player.currentAccuracy || 0).toFixed(0)}%</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
            <div className="opponent-panel">
              <div className="opponent-panel__item">
                {currentUser?.profileImage && <img src={currentUser.profileImage} alt="Your profile" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', marginBottom: 4 }} />} <span>You</span>
                <strong>{myPlayer?.progress || 0}%</strong>
                {/* â”€â”€ NEW #C: your live WPM â”€â”€ */}
                <span style={{ fontSize:'0.72rem', color:'var(--arena-accent)', marginTop:'2px' }}>{wpmValue.toFixed(0)} WPM</span>
              </div>
              <div className="opponent-panel__item" style={{ position:'relative' }}>
                {opponent?.profileImage && <img src={opponent.profileImage} alt="Opponent profile" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', marginBottom: 4 }} />} <span>{opponent?.username || 'Opponent'}</span>
                <strong>{opponent?.progress || 0}%</strong>
                {/* â”€â”€ NEW #C: opponent live WPM bar â”€â”€ */}
                {opponent?.currentWpm != null && (
                  <>
                    <span style={{ fontSize:'0.72rem', color: opponent.currentWpm > wpmValue ? 'hsl(0 75% 60%)' : 'var(--arena-muted)', marginTop:'2px', fontWeight:700 }}>
                      {Number(opponent.currentWpm).toFixed(0)} WPM
                      {opponent.currentWpm > wpmValue
                        ? ' â–²'
                        : opponent.currentWpm < wpmValue
                          ? ' â–¼'
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
            )
          )}

          <div className="typing-area">
            {showMobileTypingSetup && (
              <section className="mobile-typing-setup" aria-label="Mobile typing preferences">
                <strong>Mobile typing mode</strong>
                <span>Auto-scroll and the TypeArena key guide work here. Your phone keyboard theme remains controlled by your device.</span>
                <div className="mobile-typing-setup__controls">
                  <button type="button" className={mobileTypingSettings.autoScroll ? 'is-on' : ''} onClick={() => updateMobileTypingSettings({ autoScroll: !mobileTypingSettings.autoScroll })}>Auto-scroll {mobileTypingSettings.autoScroll ? 'on' : 'off'}</button>
                  <button type="button" className={mobileTypingSettings.guide ? 'is-on' : ''} onClick={() => updateMobileTypingSettings({ guide: !mobileTypingSettings.guide })}>Key guide {mobileTypingSettings.guide ? 'on' : 'off'}</button>
                  <button type="button" className={mobileTypingSettings.haptics ? 'is-on' : ''} onClick={() => updateMobileTypingSettings({ haptics: !mobileTypingSettings.haptics })}>Haptics {mobileTypingSettings.haptics ? 'on' : 'off'}</button>
                  <button type="button" onClick={() => { localStorage.setItem(MOBILE_TYPING_SETTINGS_KEY, JSON.stringify(mobileTypingSettings)); setShowMobileTypingSetup(false); }}>Done</button>
                </div>
              </section>
            )}
            <div
              ref={typingStageRef}
              className="typing-stage"
              onClick={() => inputRef.current?.focus()}
              role="presentation"
            >
              {focusLost && !raceOver && (
                <div className="focus-lost-overlay" style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.72)', borderRadius:'inherit', zIndex:10, gap:'0.5rem', cursor:'pointer' }} onClick={() => { setFocusLost(false); inputRef.current?.focus(); }}>
                  <span style={{ fontSize:'2rem' }}>â¸</span>
                  <span style={{ color:'var(--arena-text)', fontWeight:600 }}>Window lost focus â€” click to resume</span>
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
                autoComplete="off"
                inputMode="text"
                enterKeyHint="done"
                disabled={raceOver}
              />
            </div>
            {!liveRoom?.text && generatedContent?.antiCheatHint && (
              <p className="results-challenge">{generatedContent.antiCheatHint}</p>
            )}
          </div>

          <React.Suspense fallback={null}>
            {mobileTypingSettings.guide && (
              <LazyKeyboardDeck
                phase={phase}
                normalizeKeyboardKey={normalizeKeyboardKey}
                expectedKey={sourceText[typingText.length]}
              />
            )}
          </React.Suspense>

          <div className="results-actions">
            <button className="btn btn-danger" onClick={handleFinishRace} disabled={isSubmittingRef.current}>
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
              ðŸ† New Personal Best!
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

          {/* â”€â”€ NEW #D: Post-race AI coaching (replaces static coachTip) â”€â”€ */}
          <div className="live-board" style={{ marginTop:'0.75rem' }}>
            <div className="live-board__header">
              <h2>ðŸ¤– Coaching</h2>
              {aiCoaching === 'loading' && <span className="arena-spinner" aria-label="Generating coachingâ€¦" />}
            </div>
            {aiCoaching === 'loading' && (
              <p className="results-challenge" style={{ opacity:0.7 }}>Analysing your raceâ€¦</p>
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
                      <span style={{ fontFamily:'monospace', fontSize:'1.1rem', fontWeight:700, color:'var(--arena-accent)' }}>{char === ' ' ? 'â£' : char}</span>
                      <span style={{ fontSize:'0.75rem', color:'var(--arena-muted)' }}>{count}Ã—</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* â”€â”€ Feature #8: Keyboard heatmap â”€â”€ */}
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
                  <h2>ðŸ”¥ Mistake Heatmap</h2>
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
                      {entry.isCurrentUser ? 'You' : 'Opponent'} â€¢ {entry.wpm.toFixed(1)} WPM â€¢ {entry.accuracy.toFixed(1)}% accuracy
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
            <React.Suspense fallback={null}>
              <LazyPlayReplay key={raceResult.replayFrames.length} frames={raceResult.replayFrames} />
            </React.Suspense>
          )}

          <div className="results-actions">
            <button className="btn btn-success" onClick={exportScoreCard}>
              Export Score Card (PNG)
            </button>
            <button className="btn btn-outline-primary" onClick={() => navigate(`/results/${raceResult.id}`)}>
              Open Result Page
            </button>
            {/* â”€â”€ Feature #8: keyboard heatmap toggle â”€â”€ */}
            <button className="btn btn-outline-primary" onClick={() => setShowHeatmap((v) => !v)}>
              {showHeatmap ? 'Hide' : 'ðŸ”¥ Show'} Mistake Heatmap
            </button>
            <button className="btn btn-primary" onClick={backToLobby}>
              Back to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


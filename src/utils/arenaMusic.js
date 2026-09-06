// =============================================================================
// arenaMusic.js — TypeArena Global Background Music Engine
// =============================================================================
// A singleton audio engine that persists across all pages/components.
// Uses an <audio> element so real MP3/OGG files play (not synthesised tones).
// The admin configures the playlist; settings are saved to localStorage so
// they survive page refreshes and navigation.
//
// Usage from any component:
//   import { arenaMusic } from '../utils/arenaMusic';
//   arenaMusic.play();
//   arenaMusic.setVolume(0.6);
//   arenaMusic.next();
// =============================================================================
import { useState, useEffect } from 'react';
import { buildApiUrl } from './api';

const STORAGE_KEY = 'typearena_music_settings';

// ---------------------------------------------------------------------------
// Default curated playlist — drop your MP3s in /public/music/ and they'll
// load without any CORS issues (same-origin). Admin can replace or extend.
// ---------------------------------------------------------------------------
const DEFAULT_TRACKS = [
  {
    id: 'track_01',
    title: 'Epic Determination',
    artist: 'Orchestral Arena',
    url: '/music/track1.mp3',
  },
  {
    id: 'track_02',
    title: 'Champion Rising',
    artist: 'Arena Orchestra',
    url: '/music/track2.mp3',
  },
  {
    id: 'track_03',
    title: 'Battle Hymn',
    artist: 'TypeArena Ensemble',
    url: '/music/track3.mp3',
  },
  {
    id: 'track_04',
    title: 'Final Push',
    artist: 'Arena Orchestra',
    url: '/music/track4.mp3',
  },
];

// ---------------------------------------------------------------------------
// Singleton engine
// ---------------------------------------------------------------------------
const createMusicEngine = () => {
  let audio = null;
  let tracks = [...DEFAULT_TRACKS];
  let currentIndex = 0;
  let volume = 0.45;        // constant across all pages
  let playing = false;
  let muted = false;
  let listeners = new Set(); // UI components that want state updates

  // ── Persistence ────────────────────────────────────────────────────────────
  const loadSettings = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (Array.isArray(s.tracks) && s.tracks.length > 0) tracks = s.tracks;
      if (typeof s.volume === 'number') volume = Math.max(0, Math.min(1, s.volume));
      if (typeof s.currentIndex === 'number') currentIndex = Math.min(s.currentIndex, tracks.length - 1);
      if (typeof s.muted === 'boolean') muted = s.muted;
    } catch {}
  };

  const saveSettings = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tracks,
        volume,
        currentIndex,
        muted,
      }));
    } catch {}
  };

  // ── Audio element ──────────────────────────────────────────────────────────
  const getAudio = () => {
    if (audio) return audio;
    audio = new Audio();
    audio.loop = false;
    audio.volume = muted ? 0 : volume;
    // Note: crossOrigin is intentionally omitted — same-origin /public/music/
    // files need no CORS header, and external URLs that lack CORS headers will
    // be blocked by the browser if crossOrigin is set.
    let errorCount = 0;
    audio.addEventListener('ended', () => {
      next(true); // auto-advance
    });
    audio.addEventListener('playing', () => {
      errorCount = 0; // reset on successful play
    });
    audio.addEventListener('error', () => {
      // Skip broken track, but don't loop forever if all tracks are broken
      if (++errorCount < tracks.length) {
        setTimeout(() => next(true), 1000);
      }
    });
    return audio;
  };

  // ── Notify UI listeners ────────────────────────────────────────────────────
  const notify = () => {
    const state = getState();
    listeners.forEach((fn) => fn(state));
  };

  // ── Core controls ──────────────────────────────────────────────────────────
  const getState = () => ({
    tracks,
    currentIndex,
    currentTrack: tracks[currentIndex] || null,
    volume,
    muted,
    playing,
  });

  const loadTrack = (index) => {
    const a = getAudio();
    currentIndex = ((index % tracks.length) + tracks.length) % tracks.length;
    const track = tracks[currentIndex];
    if (!track?.url) return;
    a.src = track.url;
    a.load();
    saveSettings();
  };

  const play = () => {
    if (tracks.length === 0) return;
    const a = getAudio();
    if (!a.src || a.src === window.location.href) {
      loadTrack(currentIndex);
    }
    a.volume = muted ? 0 : volume;
    a.play().then(() => {
      playing = true;
      notify();
    }).catch(() => {
      // Autoplay blocked — wait for user gesture
      const resume = () => {
        a.play().then(() => { playing = true; notify(); }).catch(() => {});
        window.removeEventListener('click', resume);
        window.removeEventListener('keydown', resume);
      };
      window.addEventListener('click', resume, { once: true });
      window.addEventListener('keydown', resume, { once: true });
    });
  };

  const pause = () => {
    if (!audio) return;
    audio.pause();
    playing = false;
    notify();
  };

  const toggle = () => {
    playing ? pause() : play();
  };

  const next = (auto = false) => {
    loadTrack(currentIndex + 1);
    if (playing || auto) play();
    notify();
  };

  const prev = () => {
    loadTrack(currentIndex - 1);
    if (playing) play();
    notify();
  };

  const seekToTrack = (index) => {
    loadTrack(index);
    if (playing) play();
    notify();
  };

  const setVolume = (vol) => {
    volume = Math.max(0, Math.min(1, vol));
    if (audio && !muted) audio.volume = volume;
    saveSettings();
    notify();
  };

  const setMuted = (val) => {
    muted = val;
    if (audio) audio.volume = muted ? 0 : volume;
    saveSettings();
    notify();
  };

  const toggleMute = () => setMuted(!muted);

  // ── Playlist management (admin) ────────────────────────────────────────────
  const setTracks = (newTracks) => {
    tracks = newTracks.filter((t) => t?.url?.trim());
    currentIndex = 0;
    loadTrack(0);
    if (playing) play();
    saveSettings();
    notify();
  };

  const addTrack = (track) => {
    tracks = [...tracks, track];
    saveSettings();
    notify();
  };

  const removeTrack = (id) => {
    const idx = tracks.findIndex((t) => t.id === id);
    tracks = tracks.filter((t) => t.id !== id);
    if (currentIndex >= tracks.length) currentIndex = 0;
    if (idx === currentIndex && playing) {
      loadTrack(currentIndex);
      play();
    }
    saveSettings();
    notify();
  };

  const resetToDefaults = () => {
    tracks = [...DEFAULT_TRACKS];
    currentIndex = 0;
    loadTrack(0);
    saveSettings();
    notify();
  };

  const loadRemoteSettings = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/media-settings'));
      if (!response.ok) return null;
      const settings = await response.json();
      if (Array.isArray(settings.musicTracks) && settings.musicTracks.length > 0) {
        tracks = settings.musicTracks.filter((track) => track?.url?.trim());
        currentIndex = Math.min(currentIndex, tracks.length - 1);
        if (audio && playing) loadTrack(currentIndex);
        saveSettings();
        notify();
      }
      return settings;
    } catch {
      return null;
    }
  };

  // ── React hook helper ─────────────────────────────────────────────────────
  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  // ── Init ───────────────────────────────────────────────────────────────────
  loadSettings();

  return {
    play,
    pause,
    toggle,
    next,
    prev,
    seekToTrack,
    setVolume,
    setMuted,
    toggleMute,
    setTracks,
    addTrack,
    removeTrack,
    resetToDefaults,
    loadRemoteSettings,
    getState,
    subscribe,
    DEFAULT_TRACKS,
  };
};

// Singleton — created once, shared across the entire app
export const arenaMusic = createMusicEngine();

// ---------------------------------------------------------------------------
// React hook — any component can call useMusicState() to get live state
// ---------------------------------------------------------------------------

export const useMusicState = () => {
  const [state, setState] = useState(arenaMusic.getState());
  useEffect(() => {
    const unsub = arenaMusic.subscribe(setState);
    return unsub;
  }, []);
  return state;
};
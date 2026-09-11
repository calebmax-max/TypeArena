// =============================================================================
// arenaMusic.js — TypeArena Global Background Music Engine
// =============================================================================
// A singleton audio engine that persists across all pages/components.
// Uses an <audio> element so real MP3/OGG files play (not synthesised tones).
// The admin configures the playlist; settings are saved to localStorage so
// they survive page refreshes and navigation, and are synced from the server
// on load so every visitor hears the current admin-configured playlist.
//
// Usage from any component:
//   import { arenaMusic } from '../utils/arenaMusic';
//   arenaMusic.play();
//   arenaMusic.setVolume(0.6);
//   arenaMusic.next();
//
// Race integration (call from wherever a race actually starts/ends —
// live match, tournament match, or private room):
//   arenaMusic.enterRace();   // ducks music out when the race begins
//   arenaMusic.exitRace();    // brings music back when the race ends/leaves
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
  let loadedTrackId = null;    // id of the track actually loaded into <audio>.src
  let volume = 0.45;           // constant across all pages
  let playing = false;
  let muted = false;
  let listeners = new Set();   // UI components that want state updates

  // ── Race ducking state ─────────────────────────────────────────────────────
  // Reference-counted so overlapping calls (e.g. a component re-mounts mid
  // race) can't cause a premature resume.
  let raceDepth = 0;
  let wasPlayingBeforeRace = false;

  // ── Autoplay-retry bookkeeping ──────────────────────────────────────────────
  // Keeps track of the pending "resume on first gesture" listeners so we never
  // stack up duplicates across repeated play() calls while blocked.
  let pendingResume = null;

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
    loadedTrackId = track.id;
    saveSettings();
  };

  // Find where a previously-current track ended up after the playlist array
  // was mutated (tracks added/removed/replaced), so "now playing" doesn't
  // silently jump to a different song. Falls back to a safe index if the
  // track is gone.
  const reindexAfterMutation = (previousTrackId, fallbackIndex = 0) => {
    if (tracks.length === 0) {
      currentIndex = 0;
      return;
    }
    const found = previousTrackId != null ? tracks.findIndex((t) => t.id === previousTrackId) : -1;
    currentIndex = found >= 0 ? found : Math.min(fallbackIndex, tracks.length - 1);
  };

  const play = () => {
    if (tracks.length === 0) return;
    const a = getAudio();
    const current = tracks[currentIndex];
    // Reload whenever nothing is loaded yet OR the loaded track no longer
    // matches the current track (e.g. tracks/currentIndex changed while
    // paused) — not just when a.src happens to be empty.
    if (!a.src || a.src === window.location.href || loadedTrackId !== current?.id) {
      loadTrack(currentIndex);
    }
    a.volume = muted ? 0 : volume;
    a.play().then(() => {
      playing = true;
      notify();
    }).catch(() => {
      // Autoplay blocked — wait for a user gesture, replacing any previous
      // pending listener so they don't pile up on repeated play() calls.
      if (pendingResume) {
        window.removeEventListener('click', pendingResume);
        window.removeEventListener('keydown', pendingResume);
        pendingResume = null;
      }
      const resume = () => {
        a.play().then(() => { playing = true; notify(); }).catch(() => {});
        window.removeEventListener('click', resume);
        window.removeEventListener('keydown', resume);
        if (pendingResume === resume) pendingResume = null;
      };
      pendingResume = resume;
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

  // ── Race ducking (pause during live/tournament/private matches) ────────────
  const enterRace = () => {
    raceDepth += 1;
    if (raceDepth > 1) return; // already ducked for an outer race context
    wasPlayingBeforeRace = playing;
    if (playing) pause();
  };

  const exitRace = () => {
    if (raceDepth === 0) return;
    raceDepth -= 1;
    if (raceDepth > 0) return; // still inside another race context
    if (wasPlayingBeforeRace) play();
    wasPlayingBeforeRace = false;
  };

  // ── Playlist management (admin) ────────────────────────────────────────────
  const setTracks = (newTracks) => {
    const previousId = tracks[currentIndex]?.id ?? null;
    tracks = newTracks.filter((t) => t?.url?.trim());
    reindexAfterMutation(previousId, 0);
    loadTrack(currentIndex);
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
    const previousId = tracks[currentIndex]?.id ?? null;
    const removingCurrent = id === previousId;
    tracks = tracks.filter((t) => t.id !== id);
    reindexAfterMutation(removingCurrent ? null : previousId, currentIndex);
    if (removingCurrent && playing) {
      loadTrack(currentIndex);
      play();
    } else {
      // currentIndex may have shifted even though the loaded audio element
      // is unaffected (its src doesn't change) — keep loadedTrackId in sync.
      loadedTrackId = tracks[currentIndex]?.id ?? null;
    }
    saveSettings();
    notify();
  };

  const resetToDefaults = () => {
    tracks = [...DEFAULT_TRACKS];
    currentIndex = 0;
    loadTrack(0);
    if (playing) play(); // keep playing through a reset instead of going silent
    saveSettings();
    notify();
  };

  const loadRemoteSettings = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/media-settings'));
      if (!response.ok) return null;
      const settings = await response.json();
      if (Array.isArray(settings.musicTracks) && settings.musicTracks.length > 0) {
        const previousId = tracks[currentIndex]?.id ?? null;
        tracks = settings.musicTracks.filter((track) => track?.url?.trim());
        reindexAfterMutation(previousId, currentIndex);
        // Reload into the <audio> element whenever the loaded track no
        // longer matches — regardless of playing state — so a subsequent
        // play() (or the already-playing track) reflects the new playlist.
        if (loadedTrackId !== tracks[currentIndex]?.id) {
          if (audio) {
            loadTrack(currentIndex);
            if (playing) play();
          } else {
            loadedTrackId = null; // force play() to load fresh next time
          }
        }
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
  if (typeof window !== 'undefined') {
    // Sync with the admin-configured playlist as soon as the engine spins up
    // on any page, then start playback immediately — play() already falls
    // back to "resume on first click/keypress" if the browser blocks
    // autoplay before the user has interacted with the page.
    loadRemoteSettings().finally(() => play());
  }

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
    enterRace,
    exitRace,
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
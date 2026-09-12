// =============================================================================
// arenaMusic.js — TypeArena Global Background Music Engine
// =============================================================================
// A singleton audio engine that persists across all pages/components.
// Uses an <audio> element so real MP3/OGG files play (not synthesised tones).
// The admin configures the playlist; settings are saved to localStorage so
// they survive page refreshes and navigation, and are synced from the server
// on load so every visitor hears the current admin-configured playlist.
//
// AUTOPLAY: the engine itself does NOT start playback on import — it only
// hydrates the playlist. Only the Home page should trigger the first
// play(), on mount:
//   // Home.js
//   useEffect(() => { arenaMusic.play(); }, []);
// This way music starts when someone *enters the site via Home*, not when
// they deep-link straight into Profile, Play, or any other page. Once
// started, it keeps playing across every other page (it's a singleton) —
// navigating to Profile does not stop it — and it only actually stops when
// the visitor leaves the site entirely (tab/browser closed, or navigates
// off-site), which the engine handles internally via `pagehide`.
//
// Usage from any other component (control an already-running player):
//   import { arenaMusic } from '../utils/arenaMusic';
//   arenaMusic.toggle();
//   arenaMusic.setVolume(0.6);
//   arenaMusic.next();
//
// Race integration (Play.js calls these as the typing phase changes):
//   arenaMusic.toRace();      // ducks the shared playlist quieter while typing
//   arenaMusic.toLobby();     // brings it back to normal volume in lobby/results
// Both run through the SAME <audio> element (just a volume ramp), so it is
// architecturally impossible to hear two overlapping tracks.
//
// enterRace()/exitRace() are also available for a harder duck (full pause
// instead of quieter), if a future integration wants silence during a race
// rather than a background hum.
// =============================================================================
import { useState, useEffect } from 'react';
import { buildApiUrl } from './api';

const STORAGE_KEY = 'typearena_music_settings';

// The user-facing on/off preference, set from the Settings toggle in
// TypeProfile.js (and mirrored by Play.js's own state for its UI). This is
// intentionally a separate key from STORAGE_KEY above (which holds the
// engine's internal playlist/volume/mute blob) — USER_MUTE_KEY is the single
// source of truth for "does the user want music", and the engine below syncs
// its own `muted` flag to it directly, rather than depending on some other
// mounted component (e.g. Play) to relay the change via setMuted().
const USER_MUTE_KEY = 'typearena_music';
const isUserMusicDisabled = () => {
  try { return localStorage.getItem(USER_MUTE_KEY) === 'false'; }
  catch { return false; }
};

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

  // ── Admin-sync bookkeeping ──────────────────────────────────────────────────
  // The admin panel writes playlist changes straight to its own tab's engine
  // (see setTracks below), but every OTHER visitor's engine only ever fetched
  // the server playlist once, on first load. Without a periodic re-check,
  // someone who was already on the site never hears a track the admin just
  // added (or stops hearing one that was removed) until they refresh the page.
  // syncListenersAttached makes sure we only set this up once.
  const REMOTE_SYNC_INTERVAL_MS = 30000; // re-check the admin playlist every 30s
  let syncListenersAttached = false;

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
    // The user's explicit Settings toggle always wins over whatever this
    // engine last persisted for itself, in case they drifted apart.
    muted = isUserMusicDisabled();
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

  // ── Race/lobby channel (single-element crossfade) ───────────────────────────
  // Play.js switches the audible "channel" as the typing phase changes
  // (arenaMusic.toRace() / arenaMusic.toLobby()). Everything still runs
  // through the ONE shared <audio> element created below — we only ever
  // ramp its volume — so it is architecturally impossible for two tracks
  // to be heard at once. If you want the playlist to duck to near-silence
  // instead (rather than just quieter), use enterRace()/exitRace() below,
  // which pause playback entirely.
  const RACE_DUCK_RATIO = 0.35;  // how loud the playlist is, relative to normal, while racing
  const FADE_STEP_MS = 50;
  let musicChannel = 'lobby';    // 'lobby' | 'race'
  let fadeTimer = null;

  const targetVolumeForChannel = () => {
    if (muted) return 0;
    return musicChannel === 'race' ? volume * RACE_DUCK_RATIO : volume;
  };

  const clearFade = () => {
    if (fadeTimer) {
      window.clearInterval(fadeTimer);
      fadeTimer = null;
    }
  };

  const fadeAudioTo = (target, durationMs = 500) => {
    clearFade();
    if (!audio) return;
    const start = audio.volume;
    if (Math.abs(start - target) < 0.001) {
      audio.volume = target;
      return;
    }
    const steps = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
    let step = 0;
    fadeTimer = window.setInterval(() => {
      step += 1;
      const t = step / steps;
      audio.volume = start + (target - start) * t;
      if (step >= steps) {
        audio.volume = target;
        clearFade();
      }
    }, FADE_STEP_MS);
  };

  // Called from Play.js when a typing race starts — ducks the shared
  // playlist down to RACE_DUCK_RATIO instead of switching tracks.
  const toRace = () => {
    musicChannel = 'race';
    if (!audio) return; // nothing playing yet; play() will apply the ducked volume
    fadeAudioTo(targetVolumeForChannel());
  };

  // Called from Play.js when back in the lobby/results screen — brings the
  // shared playlist back up to the user's normal volume.
  const toLobby = () => {
    musicChannel = 'lobby';
    if (!audio) return;
    fadeAudioTo(targetVolumeForChannel());
  };

  // ── Audio element ──────────────────────────────────────────────────────────
  const getAudio = () => {
    if (audio) return audio;
    audio = new Audio();
    audio.loop = false;
    audio.volume = targetVolumeForChannel();
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
    clearFade();
    a.volume = targetVolumeForChannel();
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
    if (audio) {
      clearFade();
      audio.volume = targetVolumeForChannel();
    }
    saveSettings();
    notify();
  };

  const setMuted = (val) => {
    muted = val;
    if (audio) {
      clearFade();
      audio.volume = targetVolumeForChannel();
    }
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

  // ── Keep picking up admin panel changes after initial load ─────────────────
  // Two complementary mechanisms:
  //   1. Polling: every REMOTE_SYNC_INTERVAL_MS, re-fetch /api/media-settings
  //      and apply any change (tracks added/removed/reordered, or reset to
  //      defaults) — this is how *other visitors* pick up an admin edit
  //      without reloading the page. Paused while the tab is hidden so
  //      backgrounded tabs don't poll for nothing, and forced immediately
  //      when the tab becomes visible again so it catches up right away.
  //   2. Storage event: if the admin (or the same user) has multiple tabs
  //      open on the same browser, a track-list change written to
  //      localStorage in one tab is picked up instantly in the others,
  //      without waiting for the next poll.
  const applyIncomingTracks = (incomingTracks) => {
    if (!Array.isArray(incomingTracks) || incomingTracks.length === 0) return;
    const previousId = tracks[currentIndex]?.id ?? null;
    tracks = incomingTracks.filter((t) => t?.url?.trim());
    if (tracks.length === 0) return;
    reindexAfterMutation(previousId, currentIndex);
    // Reload into the <audio> element whenever the loaded track no longer
    // matches, regardless of playing state, so playback (or the next
    // play()) reflects the updated playlist rather than a stale track.
    if (loadedTrackId !== tracks[currentIndex]?.id) {
      if (audio) {
        loadTrack(currentIndex);
        if (playing) play();
      } else {
        loadedTrackId = null; // force play() to load fresh next time
      }
    }
    notify();
  };

  const handleStorageEvent = (e) => {
    // The user's mute/unmute toggle (Settings page, or any other tab) — this
    // is the source of truth for whether the user wants music, independent
    // of whether Play.js or any other component happens to be mounted.
    if (e.key === USER_MUTE_KEY) {
      setMuted(e.newValue === 'false');
      return;
    }

    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const s = JSON.parse(e.newValue);
      if (Array.isArray(s.tracks)) applyIncomingTracks(s.tracks);
    } catch {}
  };

  const startAdminSync = () => {
    if (syncListenersAttached || typeof window === 'undefined') return;
    syncListenersAttached = true;

    window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      loadRemoteSettings();
    }, REMOTE_SYNC_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadRemoteSettings();
    });

    window.addEventListener('storage', handleStorageEvent);
  };

  // ── Init ───────────────────────────────────────────────────────────────────
  loadSettings();
  if (typeof window !== 'undefined') {
    // Hydrate the admin-configured playlist as soon as the engine spins up
    // on any page — but do NOT auto-play here. Auto-starting playback is
    // the Home page's job (it calls arenaMusic.play() once on mount), so
    // someone who lands directly on Profile, Play, or any other page via a
    // deep link doesn't hear music start until they actually visit Home.
    loadRemoteSettings();
    startAdminSync();

    // Stop playback when the visitor actually leaves the site — closes the
    // tab, closes the browser, or navigates to another domain — as opposed
    // to merely switching to a different browser tab (which should NOT
    // stop the music; that's what `visibilitychange` above is for, and it
    // only pauses the *admin-sync* polling, not playback). `pagehide` is
    // the reliable cross-browser signal for "this page is going away" and,
    // unlike `beforeunload`, doesn't block the page from being cached for
    // instant back/forward navigation.
    window.addEventListener('pagehide', () => {
      if (playing) pause();
    });
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
    toRace,
    toLobby,
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
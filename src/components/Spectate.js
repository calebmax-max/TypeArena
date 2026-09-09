/**
 * Spectate.jsx
 * Route: /spectate/:roomId
 *
 * Lets anyone watch a live 1v1 TypeArena race in real-time without participating.
 * Polls the room via fetchLiveRaceRoom every 1.5 s and renders both players'
 * progress, WPM, accuracy, a live highlighted text view, and a spectator count.
 *
 * ── Functions ────────────────────────────────────────────────────────────────
 *  useRoomPoller()          – custom hook: polls the room on an interval, returns
 *                             { room, error, loading } and exposes a manual refresh.
 *  computeTimeLeft()        – mirrors Play.js syncRoomClock: derives seconds
 *                             remaining from room.startedAt + room.countdown.
 *  PlayerCard               – renders one racer's avatar, badge, live WPM/accuracy,
 *                             and an animated progress bar.
 *  LiveTextView             – renders the race passage with per-character colour
 *                             coding based on the leading player's typed position.
 *  SpectatorBanner          – top HUD: room meta, timer countdown, spectator count.
 *  CompletedOverlay         – shown when room.status === 'completed'; shows final
 *                             standings with winner highlight.
 *  Spectate (default export) – page root; wires routing, polling, and layout.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchLiveRaceRoom } from '../utils/typingApi';

// ─── Constants ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 1500;
const COUNTDOWN_FALLBACK = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * computeTimeLeft
 * Derives how many seconds are left in the race, matching the clock-sync logic
 * in Play.js (syncRoomClock). Returns null when the race hasn't started.
 *
 * @param {object} room  – live room object from the API
 * @returns {number|null}
 */
function computeTimeLeft(room) {
  if (!room?.startedAt) return null;
  const countdownSec = Number(room.countdown ?? COUNTDOWN_FALLBACK);
  const startedAtMs = new Date(room.startedAt).getTime();
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return null;
  const elapsedSec = Math.max(0, (Date.now() - startedAtMs) / 1000);
  const raceElapsed = Math.max(0, elapsedSec - countdownSec);
  return Math.max(0, Number(room.duration ?? 60) - Math.floor(raceElapsed));
}

/**
 * formatTime
 * Converts a seconds value to "M:SS" display string.
 */
function formatTime(sec) {
  if (sec == null || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Custom hook ─────────────────────────────────────────────────────────────

/**
 * useRoomPoller
 * Polls fetchLiveRaceRoom every POLL_INTERVAL_MS milliseconds.
 * Stops automatically once room.status === 'completed'.
 *
 * @param {string} roomId
 * @returns {{ room, loading, error, refresh }}
 */
function useRoomPoller(roomId) {
  const [room, setRoom]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const intervalRef           = useRef(null);

  const fetchRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      const data = await fetchLiveRaceRoom(roomId);
      setRoom(data);
      setError(null);
      // Stop polling once the race is done
      if (data?.status === 'completed') {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } catch (err) {
      setError(err?.message || 'Could not load race room.');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    fetchRoom();
    intervalRef.current = setInterval(fetchRoom, POLL_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [fetchRoom]);

  return { room, loading, error, refresh: fetchRoom };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * PlayerCard
 * Displays one racer's name, progress bar, WPM, accuracy, and finish state.
 * The `side` prop ('left' | 'right') mirrors the card on each side of the arena.
 */
function PlayerCard({ player, isWinner, isFinished, side }) {
  const progress   = Number(player?.progress   ?? 0);
  const wpm        = Number(player?.currentWpm ?? player?.result?.wpm ?? 0);
  const accuracy   = Number(player?.currentAccuracy ?? player?.result?.accuracy ?? 0);
  const username   = player?.username || 'Player';
  const initials   = username.slice(0, 2).toUpperCase();

  return (
    <div className={`sp-player sp-player--${side} ${isWinner ? 'sp-player--winner' : ''} ${isFinished ? 'sp-player--done' : ''}`}>
      <div className="sp-player__avatar">
        {player?.profileImage ? <img src={player.profileImage} alt={`${username} profile`} className="sp-player__avatar-image" /> : <span>{initials}</span>}
        {isWinner && <span className="sp-player__crown" aria-label="Winner">👑</span>}
      </div>

      <div className="sp-player__info">
        <span className="sp-player__name">{username}</span>
        {isFinished && <span className="sp-player__badge">Finished</span>}
      </div>

      <div className="sp-player__stats">
        <div className="sp-stat">
          <span className="sp-stat__label">WPM</span>
          <span className="sp-stat__value">{Math.round(wpm)}</span>
        </div>
        <div className="sp-stat">
          <span className="sp-stat__label">ACC</span>
          <span className="sp-stat__value">{Number(accuracy).toFixed(1)}%</span>
        </div>
        <div className="sp-stat">
          <span className="sp-stat__label">PROG</span>
          <span className="sp-stat__value">{Math.round(progress)}%</span>
        </div>
      </div>

      <div className="sp-player__bar-track" aria-label={`${username} progress ${Math.round(progress)}%`}>
        <div
          className="sp-player__bar-fill"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
        <div
          className="sp-player__bar-cursor"
          style={{ left: `${Math.min(100, progress)}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

/**
 * LiveTextView
 * Renders the race passage with character-level highlighting.
 * Each character is coloured by the *leading* player's typed position:
 *   - typed (within progress) → dim/muted
 *   - cursor position          → accent pulse
 *   - ahead                    → untyped / bright
 *
 * We approximate typed character count from the leading player's progress %.
 */
function LiveTextView({ text, players }) {
  const leadingProgress = useMemo(() => {
    if (!players?.length) return 0;
    return Math.max(...players.map((p) => Number(p?.progress ?? 0)));
  }, [players]);

  const cursorIndex = useMemo(() => {
    if (!text) return 0;
    return Math.min(text.length - 1, Math.round((leadingProgress / 100) * text.length));
  }, [text, leadingProgress]);

  if (!text) {
    return (
      <div className="sp-text sp-text--empty">
        <span>Waiting for race text…</span>
      </div>
    );
  }

  return (
    <div className="sp-text" aria-label="Live race text" aria-live="polite">
      {text.split('').map((char, i) => {
        let cls = 'sp-char';
        if (i < cursorIndex)      cls += ' sp-char--typed';
        else if (i === cursorIndex) cls += ' sp-char--cursor';
        // else untyped — default style
        return (
          <span key={i} className={cls}>
            {char === ' ' ? '\u00A0' : char}
          </span>
        );
      })}
    </div>
  );
}

/**
 * SpectatorBanner
 * Top HUD strip: mode badge, timer, spectator count, and a pulsing LIVE dot.
 */
function SpectatorBanner({ room, timeLeft }) {
  const spectators = Number(room?.spectators ?? 0);
  const mode       = room?.mode || 'standard';
  const isLive     = room?.status === 'racing';
  const isWaiting  = room?.status === 'waiting' || room?.status === 'countdown';

  return (
    <div className="sp-banner">
      <div className="sp-banner__left">
        {isLive && <span className="sp-live-dot" aria-label="Live" />}
        {isWaiting && <span className="sp-waiting-dot" aria-label="Starting soon" />}
        <span className="sp-banner__mode">{mode.replace('_', ' ').toUpperCase()}</span>
        <span className="sp-banner__label">SPECTATING</span>
      </div>

      <div className="sp-banner__center">
        <span className="sp-timer" aria-label="Time remaining">
          {isLive ? formatTime(timeLeft) : isWaiting ? 'Starting…' : '--:--'}
        </span>
      </div>

      <div className="sp-banner__right">
        <span className="sp-banner__spectators">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          {spectators} watching
        </span>
        <span className="sp-banner__duration">{room?.duration ?? '--'}s</span>
      </div>
    </div>
  );
}

/**
 * CompletedOverlay
 * Full-width results panel shown after room.status === 'completed'.
 * Ranks players by WPM descending and highlights the winner.
 */
function CompletedOverlay({ room, onBack }) {
  const standings = useMemo(() => {
    if (!room?.players?.length) return [];
    return [...room.players]
      .map((p) => ({
        userId:   p.userId,
        username: p.username || 'Player',
        wpm:      Number(p.result?.wpm ?? p.currentWpm ?? 0),
        accuracy: Number(p.result?.accuracy ?? p.currentAccuracy ?? 0),
        isWinner: String(p.userId) === String(room.winnerUserId),
      }))
      .sort((a, b) => b.wpm - a.wpm)
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }, [room]);

  const winner = standings.find((s) => s.isWinner) || standings[0];

  return (
    <div className="sp-overlay" role="region" aria-label="Race results">
      <div className="sp-overlay__inner">
        <div className="sp-overlay__trophy" aria-hidden="true">🏆</div>
        <h2 className="sp-overlay__title">Race Complete</h2>
        {winner && (
          <p className="sp-overlay__winner">
            {winner.username} wins with {Math.round(winner.wpm)} WPM
          </p>
        )}

        <div className="sp-standings">
          {standings.map((entry) => (
            <div
              key={entry.userId}
              className={`sp-standing-row ${entry.isWinner ? 'sp-standing-row--winner' : ''}`}
            >
              <span className="sp-standing-row__rank">#{entry.rank}</span>
              <span className="sp-standing-row__name">{entry.username}</span>
              <span className="sp-standing-row__wpm">{Math.round(entry.wpm)} WPM</span>
              <span className="sp-standing-row__acc">{Number(entry.accuracy).toFixed(1)}%</span>
            </div>
          ))}
        </div>

        {room?.winnerPrize > 0 && (
          <p className="sp-overlay__prize">
            Winner Prize: KES {Number(room.winnerPrize).toLocaleString()}
          </p>
        )}

        <button className="sp-btn sp-btn--primary" onClick={onBack}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

/**
 * Spectate (default export)
 *
 * Page root for /spectate/:roomId.
 *
 * Lifecycle:
 *  1. Reads roomId from URL params.
 *  2. useRoomPoller fetches the room every 1.5 s.
 *  3. A local setInterval re-derives timeLeft every 250 ms from room.startedAt
 *     so the timer is smooth even between polls.
 *  4. Renders SpectatorBanner + two PlayerCards + LiveTextView while racing.
 *  5. Swaps in CompletedOverlay when room.status === 'completed'.
 *  6. Shows error/loading states gracefully.
 */
export default function Spectate() {
  const { roomId }          = useParams();
  const navigate            = useNavigate();
  const { room, loading, error } = useRoomPoller(roomId);

  // Smooth timer: re-computed locally at 250 ms, seeded from room on each poll
  const [timeLeft, setTimeLeft] = useState(null);
  const roomRef = useRef(room);
  useEffect(() => { roomRef.current = room; }, [room]);

  useEffect(() => {
    const tick = () => setTimeLeft(computeTimeLeft(roomRef.current));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);

  // Seed timeLeft immediately when room arrives for the first time
  useEffect(() => {
    if (room) setTimeLeft(computeTimeLeft(room));
  }, [room]);

  const handleBack = useCallback(() => navigate('/play'), [navigate]);

  // ── Render states ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="sp-root sp-root--loading">
        <div className="sp-spinner" aria-label="Loading race…" />
        <p>Loading race room…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sp-root sp-root--error">
        <p className="sp-error-msg">⚠ {error}</p>
        <button className="sp-btn sp-btn--outline" onClick={handleBack}>Back to Lobby</button>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="sp-root sp-root--error">
        <p className="sp-error-msg">Race room not found.</p>
        <button className="sp-btn sp-btn--outline" onClick={handleBack}>Back to Lobby</button>
      </div>
    );
  }

  const players   = room.players ?? [];
  const p1        = players[0] ?? null;
  const p2        = players[1] ?? null;
  const raceText  = room.text ?? '';
  const isDone    = room.status === 'completed';

  return (
    <>
      <style>{STYLES}</style>
      <div className="sp-root">
        <SpectatorBanner room={room} timeLeft={timeLeft} />

        <div className="sp-arena">
          {/* Left player */}
          <div className="sp-col sp-col--left">
            {p1 ? (
              <PlayerCard
                player={p1}
                side="left"
                isWinner={String(p1.userId) === String(room.winnerUserId)}
                isFinished={Boolean(p1.result)}
              />
            ) : (
              <div className="sp-player sp-player--empty">Waiting for player…</div>
            )}
          </div>

          {/* Centre: live text + VS divider */}
          <div className="sp-col sp-col--center">
            <div className="sp-vs" aria-hidden="true">VS</div>
            <LiveTextView text={raceText} players={players} />
          </div>

          {/* Right player */}
          <div className="sp-col sp-col--right">
            {p2 ? (
              <PlayerCard
                player={p2}
                side="right"
                isWinner={String(p2.userId) === String(room.winnerUserId)}
                isFinished={Boolean(p2.result)}
              />
            ) : (
              <div className="sp-player sp-player--empty">Waiting for player…</div>
            )}
          </div>
        </div>

        {/* Race status footer */}
        {!isDone && (
          <div className="sp-footer">
            <span className="sp-footer__status">
              {room.status === 'waiting'   && 'Waiting for both players…'}
              {room.status === 'countdown' && 'Race starting…'}
              {room.status === 'racing'    && 'Race in progress'}
            </span>
            <button className="sp-btn sp-btn--ghost" onClick={handleBack}>
              ← Leave Spectator View
            </button>
          </div>
        )}

        {/* Completed overlay */}
        {isDone && <CompletedOverlay room={room} onBack={handleBack} />}
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const STYLES = `
  /* ── Tokens ── */
  .sp-root {
    --sp-bg:           #080b12;
    --sp-surface:      rgba(14, 20, 32, 0.88);
    --sp-border:       rgba(255,255,255,0.07);
    --sp-text:         #eef2ff;
    --sp-muted:        rgba(180, 195, 230, 0.55);
    --sp-accent:       #38f5b0;
    --sp-accent-soft:  rgba(56, 245, 176, 0.15);
    --sp-accent-glow:  rgba(56, 245, 176, 0.3);
    --sp-gold:         #ffd166;
    --sp-red:          #ff5f7e;
    --sp-font-display: 'Courier New', 'Lucida Console', monospace;
    --sp-font-body:    Georgia, 'Times New Roman', serif;

    min-height: 100vh;
    background: var(--sp-bg);
    color: var(--sp-text);
    font-family: var(--sp-font-body);
    display: flex;
    flex-direction: column;
    position: relative;
    overflow-x: hidden;
  }

  /* Subtle scanline texture */
  .sp-root::before {
    content: '';
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0,0,0,0.06) 2px,
      rgba(0,0,0,0.06) 4px
    );
    pointer-events: none;
    z-index: 0;
  }

  /* ── Banner ── */
  .sp-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.65rem 1.5rem;
    background: rgba(8,11,18,0.95);
    border-bottom: 1px solid var(--sp-border);
    backdrop-filter: blur(10px);
    position: sticky;
    top: 0;
    z-index: 10;
    gap: 1rem;
  }

  .sp-banner__left,
  .sp-banner__right {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex: 1;
  }
  .sp-banner__right { justify-content: flex-end; }
  .sp-banner__center { display: flex; align-items: center; }

  .sp-live-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--sp-red);
    box-shadow: 0 0 6px var(--sp-red);
    animation: spPulse 1.2s ease-in-out infinite;
    flex-shrink: 0;
  }
  .sp-waiting-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--sp-gold);
    animation: spPulse 1.8s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes spPulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.25; }
  }

  .sp-banner__mode {
    font-family: var(--sp-font-display);
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    color: var(--sp-accent);
    background: var(--sp-accent-soft);
    padding: 0.2rem 0.55rem;
    border-radius: 4px;
    border: 1px solid rgba(56,245,176,0.25);
  }
  .sp-banner__label {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    color: var(--sp-muted);
    text-transform: uppercase;
  }

  .sp-timer {
    font-family: var(--sp-font-display);
    font-size: 1.9rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--sp-text);
    min-width: 5ch;
    text-align: center;
  }

  .sp-banner__spectators {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    color: var(--sp-muted);
  }
  .sp-banner__duration {
    font-size: 0.75rem;
    color: var(--sp-muted);
    padding: 0.15rem 0.5rem;
    border: 1px solid var(--sp-border);
    border-radius: 4px;
  }

  /* ── Arena layout ── */
  .sp-arena {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 0;
    flex: 1;
    padding: 1.5rem;
    position: relative;
    z-index: 1;
    align-items: start;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
  }

  .sp-col {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .sp-col--center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.2rem;
    padding: 0 1.5rem;
    min-width: 0;
    flex: 1;
  }

  /* ── VS badge ── */
  .sp-vs {
    font-family: var(--sp-font-display);
    font-size: 0.75rem;
    letter-spacing: 0.2em;
    color: var(--sp-muted);
    background: var(--sp-surface);
    border: 1px solid var(--sp-border);
    border-radius: 50%;
    width: 42px; height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ── Player card ── */
  .sp-player {
    background: var(--sp-surface);
    border: 1px solid var(--sp-border);
    border-radius: 14px;
    padding: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
    position: relative;
    overflow: hidden;
  }
  .sp-player::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(56,245,176,0.03) 0%, transparent 60%);
    pointer-events: none;
  }
  .sp-player--winner {
    border-color: var(--sp-gold);
    box-shadow: 0 0 18px rgba(255,209,102,0.15), inset 0 0 30px rgba(255,209,102,0.04);
  }
  .sp-player--done {
    border-color: rgba(56,245,176,0.3);
  }
  .sp-player--empty {
    align-items: center;
    justify-content: center;
    color: var(--sp-muted);
    font-size: 0.85rem;
    min-height: 160px;
    font-style: italic;
  }

  .sp-player__avatar {
    width: 48px; height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--sp-accent-soft), rgba(56,245,176,0.05));
    border: 1.5px solid rgba(56,245,176,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--sp-font-display);
    font-size: 1rem;
    font-weight: 700;
    color: var(--sp-accent);
    position: relative;
    flex-shrink: 0;
  }
  .sp-player__avatar-image { width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
  .sp-player__crown {
    position: absolute;
    top: -10px; right: -6px;
    font-size: 1rem;
  }

  .sp-player__info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .sp-player__name {
    font-family: var(--sp-font-display);
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--sp-text);
    letter-spacing: 0.02em;
  }
  .sp-player__badge {
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    color: var(--sp-accent);
    background: var(--sp-accent-soft);
    border: 1px solid rgba(56,245,176,0.25);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    text-transform: uppercase;
  }

  .sp-player__stats {
    display: flex;
    gap: 0.75rem;
  }
  .sp-stat {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .sp-stat__label {
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    color: var(--sp-muted);
    text-transform: uppercase;
  }
  .sp-stat__value {
    font-family: var(--sp-font-display);
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--sp-text);
  }

  /* ── Progress bar ── */
  .sp-player__bar-track {
    height: 6px;
    background: rgba(255,255,255,0.06);
    border-radius: 99px;
    position: relative;
    overflow: visible;
  }
  .sp-player__bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--sp-accent), rgba(56,245,176,0.6));
    border-radius: 99px;
    transition: width 0.6s cubic-bezier(0.25, 1, 0.5, 1);
    box-shadow: 0 0 8px var(--sp-accent-glow);
  }
  .sp-player__bar-cursor {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 12px; height: 12px;
    border-radius: 50%;
    background: var(--sp-accent);
    box-shadow: 0 0 10px var(--sp-accent-glow);
    transition: left 0.6s cubic-bezier(0.25, 1, 0.5, 1);
  }

  /* ── Live text ── */
  .sp-text {
    background: rgba(8, 12, 22, 0.7);
    border: 1px solid var(--sp-border);
    border-radius: 10px;
    padding: 1.25rem 1.4rem;
    font-family: var(--sp-font-display);
    font-size: 0.92rem;
    line-height: 1.85;
    letter-spacing: 0.01em;
    color: var(--sp-muted);
    word-break: break-word;
    width: 100%;
    min-height: 120px;
    position: relative;
  }
  .sp-text--empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--sp-muted);
    font-style: italic;
    font-size: 0.85rem;
  }

  .sp-char { display: inline; }
  .sp-char--typed  { color: rgba(180,195,230,0.3); }
  .sp-char--cursor {
    color: var(--sp-bg);
    background: var(--sp-accent);
    border-radius: 2px;
    padding: 0 1px;
    animation: spCursorBlink 0.9s step-end infinite;
    box-shadow: 0 0 8px var(--sp-accent-glow);
  }
  @keyframes spCursorBlink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  /* ── Footer ── */
  .sp-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1.5rem;
    border-top: 1px solid var(--sp-border);
    background: rgba(8,11,18,0.9);
    position: relative;
    z-index: 1;
  }
  .sp-footer__status {
    font-size: 0.8rem;
    color: var(--sp-muted);
    letter-spacing: 0.04em;
  }

  /* ── Buttons ── */
  .sp-btn {
    font-family: var(--sp-font-display);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    padding: 0.55rem 1.2rem;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    transition: all 0.18s ease;
    text-transform: uppercase;
  }
  .sp-btn--primary {
    background: var(--sp-accent);
    color: #050a10;
    font-weight: 700;
    box-shadow: 0 0 14px var(--sp-accent-glow);
  }
  .sp-btn--primary:hover {
    filter: brightness(1.12);
    box-shadow: 0 0 22px var(--sp-accent-glow);
  }
  .sp-btn--outline {
    background: transparent;
    color: var(--sp-accent);
    border: 1px solid rgba(56,245,176,0.4);
  }
  .sp-btn--outline:hover {
    background: var(--sp-accent-soft);
  }
  .sp-btn--ghost {
    background: transparent;
    color: var(--sp-muted);
    border: 1px solid var(--sp-border);
    font-size: 0.75rem;
    padding: 0.4rem 0.9rem;
  }
  .sp-btn--ghost:hover { color: var(--sp-text); border-color: rgba(255,255,255,0.2); }

  /* ── Completed overlay ── */
  .sp-overlay {
    position: fixed;
    inset: 0;
    background: rgba(4, 6, 12, 0.92);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    animation: spFadeIn 0.4s ease;
  }
  @keyframes spFadeIn {
    from { opacity: 0; transform: scale(0.97); }
    to   { opacity: 1; transform: scale(1); }
  }

  .sp-overlay__inner {
    background: var(--sp-surface);
    border: 1px solid rgba(255,209,102,0.2);
    border-radius: 18px;
    padding: 2.5rem 2rem;
    max-width: 480px;
    width: 90%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    box-shadow: 0 0 60px rgba(255,209,102,0.08), 0 24px 48px rgba(0,0,0,0.5);
  }

  .sp-overlay__trophy { font-size: 3rem; line-height: 1; }
  .sp-overlay__title {
    font-family: var(--sp-font-display);
    font-size: 1.4rem;
    letter-spacing: 0.06em;
    color: var(--sp-text);
    text-align: center;
    margin: 0;
  }
  .sp-overlay__winner {
    font-size: 1rem;
    color: var(--sp-gold);
    text-align: center;
    margin: 0;
  }
  .sp-overlay__prize {
    font-size: 0.85rem;
    color: var(--sp-muted);
    margin: 0;
  }

  /* ── Standings ── */
  .sp-standings {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }
  .sp-standing-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--sp-border);
    border-radius: 8px;
    padding: 0.65rem 1rem;
    transition: border-color 0.2s;
  }
  .sp-standing-row--winner {
    border-color: var(--sp-gold);
    background: rgba(255,209,102,0.05);
  }
  .sp-standing-row__rank {
    font-family: var(--sp-font-display);
    font-size: 0.75rem;
    color: var(--sp-muted);
    width: 2ch;
  }
  .sp-standing-row__name {
    flex: 1;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--sp-text);
  }
  .sp-standing-row__wpm {
    font-family: var(--sp-font-display);
    font-size: 0.9rem;
    color: var(--sp-accent);
  }
  .sp-standing-row__acc {
    font-family: var(--sp-font-display);
    font-size: 0.8rem;
    color: var(--sp-muted);
    min-width: 5ch;
    text-align: right;
  }

  /* ── Loading / error ── */
  .sp-root--loading,
  .sp-root--error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: var(--sp-muted);
  }
  .sp-spinner {
    width: 36px; height: 36px;
    border: 3px solid var(--sp-border);
    border-top-color: var(--sp-accent);
    border-radius: 50%;
    animation: spSpin 0.8s linear infinite;
  }
  @keyframes spSpin {
    to { transform: rotate(360deg); }
  }
  .sp-error-msg {
    color: var(--sp-red);
    font-size: 0.95rem;
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .sp-arena {
      grid-template-columns: 1fr;
      padding: 1rem;
    }
    .sp-col--center { padding: 0; order: -1; }
    .sp-col--left, .sp-col--right { order: 1; }
    .sp-vs { display: none; }
    .sp-timer { font-size: 1.4rem; }
  }
`;
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCurrentUser, fetchTournaments, fetchTournamentWinner, getStoredUserSnapshot, joinTournament } from '../utils/typingApi';
import '../styles/Tournaments.css';

const FILTERS = ['all', 'active', 'upcoming', 'full', 'completed'];
const TOURNAMENTS_CACHE_KEY = 'typearena_tournaments_cache';

const readTournamentCache = () => {
  try {
    const raw = localStorage.getItem(TOURNAMENTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeTournamentCache = (items) => {
  try {
    localStorage.setItem(TOURNAMENTS_CACHE_KEY, JSON.stringify(items));
  } catch {}
};

function LobbyBar({ joined, max }) {
  const pct = Math.min(100, Math.round((joined / max) * 100));
  const colorClass =
    pct >= 100 ? 'lobby-fill--full' : pct >= 60 ? 'lobby-fill--warn' : 'lobby-fill--low';
  return (
    <div className="lobby-wrap">
      <div className="lobby-meta">
        <span>Lobby</span>
        <span>{joined}/{max} players</span>
      </div>
      <div className="lobby-bar">
        <div className={`lobby-fill ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CountdownStrip({ startTime, isFull }) {
  const [seconds, setSeconds] = useState(null);

  useEffect(() => {
    if (!isFull && !startTime) return;

    const target = isFull
      ? Date.now() + 30000
      : new Date(startTime).getTime();

    const tick = () => {
      const diff = Math.max(0, Math.round((target - Date.now()) / 1000));
      setSeconds(diff);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isFull, startTime]);

  if (seconds === null) return null;

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="countdown-strip">
      <span className="countdown-icon">▶</span>
      {isFull ? `Starting in ${mm}:${ss}` : `Starts at ${new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
    </div>
  );
}

function TournamentCard({ tournament, currentUser, processingId, onJoin }) {
  const [winner, setWinner] = useState(tournament.winner || null);

  // Lazily fetch winner once for completed tournaments that don't have it bundled
  useEffect(() => {
    if (String(tournament.status || '').toLowerCase() !== 'completed') return;
    if (winner) return;
    fetchTournamentWinner(tournament.id)
      .then((data) => setWinner(data?.winner || data || null))
      .catch(() => {});
  }, [tournament.id, tournament.status, winner]);

  const requiredPlayers = Number(tournament.matchSize || tournament.maxParticipants || 2);
  const joinedPlayers =
    Number(tournament.participants || 0) + Number(tournament.waitingPlayers || 0);
  const isFull = joinedPlayers >= requiredPlayers;
  const cost = Number(tournament.cost ?? tournament.entryFee ?? 0);
  const baseCost = Number(tournament.baseCost ?? tournament.entryFee ?? cost);
  const savings = Number(tournament.savings || 0);
  const winnerShare = Number(tournament.winnerShare ?? 0.6);
  const winnerPrize = Number(
    tournament.winnerPrize ?? baseCost * requiredPlayers * winnerShare
  );
  const status = String(tournament.status || 'upcoming').toLowerCase();
  const isProcessing = processingId === tournament.id;
  const isLoggedIn = Boolean(currentUser?.id);

  const isCompleted = status === 'completed';

  // Joining closes the moment the start time arrives
  const joinClosed = !isCompleted && tournament.startTime
    ? Date.now() >= new Date(tournament.startTime).getTime()
    : false;

  let btnLabel;
  if (isCompleted) btnLabel = 'Match ended';
  else if (joinClosed) btnLabel = 'Joining closed';
  else if (!isLoggedIn) btnLabel = 'Sign in to join';
  else if (isProcessing) btnLabel = 'Joining...';
  else if (isFull) btnLabel = 'Lobby full';
  else if (savings > 0) btnLabel = `Join — KES ${cost.toLocaleString()} (net)`;
  else btnLabel = `Join — KES ${cost.toLocaleString()}`;

  const btnDisabled = isProcessing || isFull || isCompleted || joinClosed;

  return (
    <div className={`tournament-card tournament-card--${status}`}>
      <div className="card-top">
        <div className="card-identity">
          <div className="card-icon">{tournament.image}</div>
          <h3 className="card-name">{tournament.name}</h3>
        </div>
        <span className={`status-pill status-pill--${status}`}>{status}</span>
      </div>

      {isCompleted && winner ? (
        <div className="prize-block prize-block--winner">
          <p className="prize-label">🏆 Winner</p>
          <p className="prize-amount prize-amount--winner">
            {winner.username || winner.name || 'Unknown'}
          </p>
          <p className="prize-share">
            Won KES {Number(winner.prize ?? winner.winnerPrize ?? winnerPrize).toLocaleString()}
          </p>
        </div>
      ) : isCompleted && !winner ? (
        <div className="prize-block prize-block--pending">
          <p className="prize-label">Winner</p>
          <p className="prize-amount prize-amount--pending">Determining...</p>
          <p className="prize-share">Results being processed</p>
        </div>
      ) : (
        <div className="prize-block">
          <p className="prize-label">Winner takes</p>
          <p className="prize-amount">KES {winnerPrize.toLocaleString()}</p>
          
        </div>
      )}

      <div className="entry-row">
        <span className="entry-label">Entry fee</span>
        <span className="entry-value">KES {cost.toLocaleString()}</span>
      </div>

      {savings > 0 && isLoggedIn && (
        <span className="cashback-badge">
          ↩ KES {savings.toLocaleString()} cashback after entry
        </span>
      )}

      {tournament.startTime && status === 'upcoming' && (
        <div className="cutoff-row">
          <span className="cutoff-label">Join before</span>
          <span className="cutoff-value">
            {new Date(tournament.startTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        </div>
      )}

      {joinClosed && !isCompleted && (
        <div className="cutoff-closed">Joining closed — match in progress</div>
      )}

      <LobbyBar joined={joinedPlayers} max={requiredPlayers} />

      {(isFull || tournament.startTime) && (
        <CountdownStrip startTime={tournament.startTime} isFull={isFull && status === 'active'} />
      )}

      <button
        className={`join-btn${(isFull || joinClosed || isCompleted) ? ' join-btn--disabled' : ''}`}
        onClick={() => onJoin(tournament)}
        disabled={btnDisabled}
      >
        {btnLabel}
      </button>
    </div>
  );
}

export default function Tournaments() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState(() => readTournamentCache());
  const [currentUser, setCurrentUser] = useState(() => getStoredUserSnapshot());
  const [loading, setLoading] = useState(() => readTournamentCache().length === 0);
  const [processingId, setProcessingId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [filter, setFilter] = useState('all');
  const [showPast, setShowPast] = useState(false);

  // Derive live status from startTime client-side so cards update without a re-fetch
  // Duration comes from the tournament's matchDurationMins field (default 10 min)
  const withLiveStatus = (list) =>
    list.map((t) => {
      if (!t.startTime) return t;
      const startMs = new Date(t.startTime).getTime();
      const durationMs = Math.max(1, Number(t.matchDurationMins || 10)) * 60 * 1000;
      const now = Date.now();
      let derived;
      if (now >= startMs + durationMs) derived = 'completed';
      else if (now >= startMs) derived = 'active';
      else derived = 'upcoming';
      return t.status === derived ? t : { ...t, status: derived };
    });

  useEffect(() => {
    let cancelled = false;

    const load = async (isInitial = false) => {
      if (isInitial) setLoading(true);
      try {
        const [user, data] = await Promise.all([fetchCurrentUser(), fetchTournaments()]);
        if (cancelled) return;
        const nextTournaments = withLiveStatus(Array.isArray(data) ? data : []);
        setCurrentUser(user);
        setTournaments(nextTournaments);
        writeTournamentCache(nextTournaments);
      } catch (_) {
        // silent refresh failures — don't disrupt the user
      } finally {
        if (isInitial && !cancelled) setLoading(false);
      }
    };

    load(true);

    // Re-fetch every 45 seconds to keep lobby counts and statuses current
    const pollId = setInterval(() => load(false), 45000);

    // Also tick client-side status every 30 seconds for instant upcoming→active flips
    const tickId = setInterval(() => {
      setTournaments((prev) => withLiveStatus(prev));
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, []);

  const showNotice = useCallback((type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  }, []);

  const handleJoin = useCallback(
    async (tournament) => {
      if (!currentUser?.id) {
        showNotice('info', 'Sign in first before joining a tournament.');
        navigate('/profile?redirect=%2Ftournaments');
        return;
      }

      const confirmed = window.confirm(
        `Join "${tournament.name}" for KES ${Number(tournament.cost ?? tournament.entryFee).toLocaleString()}?`
      );
      if (!confirmed) return;

      setProcessingId(tournament.id);
      try {
        const result = await joinTournament(tournament.id);
        setTournaments((prev) =>
          prev.map((t) => (t.id === tournament.id ? result.tournament : t))
        );
        showNotice(result.matched ? 'success' : 'info', result.message);
      } catch (err) {
        showNotice('error', err.message || 'Could not join this tournament.');
      } finally {
        setProcessingId(null);
      }
    },
    [currentUser, navigate, showNotice]
  );

  const filtered =
    filter === 'all'
      ? tournaments.filter((t) => String(t.status || 'upcoming').toLowerCase() !== 'completed')
      : tournaments.filter(
          (t) => String(t.status || 'upcoming').toLowerCase() === filter
        );

  const completedTournaments = tournaments.filter(
    (t) => String(t.status || 'upcoming').toLowerCase() === 'completed'
  );

  return (
    <div className="tournaments-container">
      <div className="tournaments-header">
        <h1>Tournaments</h1>
        <p>Join paid matches. When a lobby fills, the match starts after a 30-second countdown.</p>
      </div>

      {notice && (
        <div className={`notice notice--${notice.type}`}>{notice.text}</div>
      )}

      <div className="filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`filter-btn${filter === f ? ' filter-btn--active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state">Loading tournaments...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">⬡</span>
          <p>No {filter !== 'all' ? filter : ''} tournaments right now.</p>
          <p>Check back soon.</p>
        </div>
      ) : (
        <div className="tournaments-grid">
          {filtered.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              currentUser={currentUser}
              processingId={processingId}
              onJoin={handleJoin}
            />
          ))}
        </div>
      )}

      {completedTournaments.length > 0 && filter !== 'completed' && (
        <div className="past-section">
          <button
            className="past-toggle"
            onClick={() => setShowPast((p) => !p)}
          >
            <span>{showPast ? '▲' : '▼'}</span>
            Past Tournaments ({completedTournaments.length})
          </button>
          {showPast && (
            <div className="tournaments-grid past-grid">
              {completedTournaments.map((tournament) => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  currentUser={currentUser}
                  processingId={processingId}
                  onJoin={handleJoin}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

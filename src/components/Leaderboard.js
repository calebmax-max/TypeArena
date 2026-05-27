import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  memo,
} from 'react';
import { fetchLeaderboard } from '../utils/api';
import '../styles/Leaderboard.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const SORTS = [
  { id: 'seasonPoints', label: '🏆 Top Points' },
  { id: 'wpm',         label: '⚡ Top WPM'    },
  { id: 'wins',        label: '🥇 Most Wins'  },
  { id: 'winRate',     label: '📈 Win Rate'   },
  { id: 'accuracy',    label: '🎯 Accuracy'   },
];

const TIERS = ['All', 'Grandmaster', 'Diamond', 'Gold', 'Silver', 'Bronze'];

const TIER_META = {
  grandmaster: { icon: '🔴', gradient: 'linear-gradient(135deg,#ff4e50,#f9d423)' },
  diamond:     { icon: '💎', gradient: 'linear-gradient(135deg,#a8edea,#fed6e3)' },
  gold:        { icon: '🥇', gradient: 'linear-gradient(135deg,#f7971e,#ffd200)' },
  silver:      { icon: '🥈', gradient: 'linear-gradient(135deg,#bdc3c7,#2c3e50)' },
  bronze:      { icon: '🥉', gradient: 'linear-gradient(135deg,#d4935a,#6b3a2a)' },
};

const POLL_INTERVAL     = 30_000;
const ITEMS_PER_PAGE    = 20;
const SEARCH_DEBOUNCE_MS = 180;

// ─── localStorage cache key — serves data instantly on revisit ────────────────
const LS_CACHE_KEY = 'typearena_lb_cache';

const readCache = () => {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    // Discard stale cache older than the poll interval
    if (Date.now() - ts > POLL_INTERVAL) return null;
    return Array.isArray(data) ? data : null;
  } catch { return null; }
};

const writeCache = (data) => {
  try {
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
};

export const primeLeaderboardCache = async () => {
  try {
    const data = await fetchLeaderboard(100);
    writeCache(Array.isArray(data) ? data : []);
    return data;
  } catch {
    return null;
  }
};

// ─── Tier helpers ─────────────────────────────────────────────────────────────

const normTier = (tier = '') => tier.toLowerCase();

const getTierClass = (tier = '') => {
  const t = normTier(tier);
  if (t === 'grandmaster') return 'grandmaster';
  if (t === 'diamond')     return 'diamond';
  if (t === 'gold')        return 'gold';
  if (t === 'silver')      return 'silver';
  return 'bronze';
};

// FIX (minor): guard against non-tier values like 'All' returning the wrong fallback
const getTierIcon = (tier = '') => {
  const key = normTier(tier);
  return TIER_META[key]?.icon ?? '🥉';
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const SkeletonRow = () => (
  <div className="table-row skeleton-row" aria-hidden="true">
    <span className="col-rank"><span className="skeleton-block" style={{ width: '2rem' }} /></span>
    <div  className="col-player"><span className="skeleton-block" style={{ width: '7rem' }} /></div>
    <span className="col-elo"><span className="skeleton-block" style={{ width: '3rem' }} /></span>
    <span className="col-wpm"><span className="skeleton-block" style={{ width: '3rem' }} /></span>
    <span className="col-tier"><span className="skeleton-block" style={{ width: '4rem' }} /></span>
    <span className="col-wins"><span className="skeleton-block" style={{ width: '2rem' }} /></span>
  </div>
);

// ─── PlayerRow (memoised) ─────────────────────────────────────────────────────

const PlayerRow = memo(function PlayerRow({ player, isMe, onClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`table-row real-time-row ${isMe ? 'highlighted-self-row' : ''}`}
      onClick={() => onClick(player)}
      onKeyDown={(e) => e.key === 'Enter' && onClick(player)}
      aria-label={`Player ${player.username}, rank ${player.displayRank}`}
    >
      {/* Rank */}
      <span className="col-rank">
        <span className={`trend-indicator trend-${player.trend}`} aria-label={player.trend}>
          {player.trend === 'up'   && '▲'}
          {player.trend === 'down' && '▼'}
          {player.trend === 'same' && '•'}
        </span>
        <strong className="rank-indicator">#{player.displayRank}</strong>
      </span>

      {/* Player */}
      <div className="col-player">
        <div className="player-name-wrapper">
          <span className="player-name">
            {player.username}
            {isMe && <span className="self-tag">(You)</span>}
          </span>
          {player.premium && <span className="premium-tag">VIP</span>}
        </div>
      </div>

      {/* Season Points */}
      <span className="col-elo">
        <span className="elo-display-badge">⭐ {player.seasonPoints ?? 0}</span>
      </span>

      {/* Peak WPM */}
      <span className="col-wpm">
        <span className="stat-badge wpm-badge">{Number(player.wpm ?? 0).toFixed(1)}</span>
      </span>

      {/* Tier */}
      <span className="col-tier">
        <span className={`tier-badge tier-${getTierClass(player.tier)}`}>
          {getTierIcon(player.tier)} {player.tier || 'Bronze'}
        </span>
      </span>

      {/* Wins */}
      <span className="col-wins">
        <span className="wins-badge">{player.wins ?? 0}</span>
      </span>
    </div>
  );
});

// ─── PlayerModal ──────────────────────────────────────────────────────────────

const PlayerModal = memo(function PlayerModal({ player, onClose }) {
  const winRate = player.wins && player.gamesPlayed
    ? ((player.wins / player.gamesPlayed) * 100).toFixed(1)
    : null;

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${player.username} profile`}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className={`modal-tier-banner tier-${getTierClass(player.tier)}`}>
          <span className="modal-tier-icon">{getTierIcon(player.tier)}</span>
          <span className="modal-tier-label">{player.tier || 'Bronze'}</span>
        </div>

        <h2 className="modal-username">
          {player.username}
          {player.premium && <span className="premium-tag">VIP</span>}
        </h2>
        <p className="modal-rank">Rank #{player.displayRank}</p>

        <div className="modal-stats-grid">
          <div className="modal-stat">
            <span className="modal-stat-value">⭐ {player.seasonPoints ?? 0}</span>
            <span className="modal-stat-label">Season Points</span>
          </div>
          <div className="modal-stat">
            <span className="modal-stat-value">{Number(player.wpm ?? 0).toFixed(1)}</span>
            <span className="modal-stat-label">Peak WPM</span>
          </div>
          <div className="modal-stat">
            <span className="modal-stat-value">{player.wins ?? 0}</span>
            <span className="modal-stat-label">Wins</span>
          </div>
          <div className="modal-stat">
            <span className="modal-stat-value">{player.gamesPlayed ?? '—'}</span>
            <span className="modal-stat-label">Games Played</span>
          </div>
          {winRate !== null && (
            <div className="modal-stat">
              <span className="modal-stat-value">{winRate}%</span>
              <span className="modal-stat-label">Win Rate</span>
            </div>
          )}
          {player.accuracy != null && (
            <div className="modal-stat">
              <span className="modal-stat-value">{Number(player.accuracy).toFixed(1)}%</span>
              <span className="modal-stat-label">Accuracy</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── EmptyState ───────────────────────────────────────────────────────────────

const EmptyState = ({ query }) => (
  <div className="empty-leaderboard">
    <span className="empty-icon">🔍</span>
    <p>{query ? `No players matching "${query}"` : 'No players yet. Be the first!'}</p>
  </div>
);

// ─── ErrorState ───────────────────────────────────────────────────────────────

const ErrorState = ({ onRetry }) => (
  <div className="error-leaderboard">
    <span className="error-icon">⚠️</span>
    <p>Failed to load leaderboard.</p>
    <button className="retry-btn" onClick={onRetry}>Retry</button>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Leaderboard({ currentUserUsername }) {
  // ── State ──────────────────────────────────────────────────────────────────

  // PERF: seed from localStorage cache so the table renders immediately on
  // revisit without waiting for the network — the fetch then refreshes silently.
  const [players,     setPlayers]     = useState(() => readCache() ?? []);
  const [loading,     setLoading]     = useState(() => readCache() === null);
  const [error,       setError]       = useState(false);
  const [sortBy,      setSortBy]      = useState('seasonPoints');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter,  setTierFilter]  = useState('All');
  const [page,        setPage]        = useState(1);
  const [selected,    setSelected]    = useState(null);
  const [activeTab,   setActiveTab]   = useState('live');   // 'live' | 'past'
  const [pastSeasons, setPastSeasons] = useState([]);
  const [pastLoading, setPastLoading] = useState(false);
  const [pastError,   setPastError]   = useState(false);   // FIX: surface fetch errors
  const [pastSeason,  setPastSeason]  = useState('');
  const [seasonName,  setSeasonName]  = useState(() => {
    const now = new Date();
    return now.toLocaleString('default', { month: 'long' }) + ' ' + now.getFullYear();
  });

  // ── Refs ───────────────────────────────────────────────────────────────────
  // FIX: previousRanksRef is updated in a useEffect, never inside useMemo,
  // so trend arrows are computed from a stable snapshot and never flicker.
  const previousRanksRef   = useRef({});
  const pollingIntervalRef = useRef(null);
  const selfRowRef         = useRef(null);
  const debounceRef        = useRef(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const loadLeaderboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(false);
    try {
      const data = await fetchLeaderboard(200);
      if (Array.isArray(data)) {
        writeCache(data);           // PERF: persist for instant next-visit render
        setPlayers(data);
        if (data[0]?.season) setSeasonName(data[0].season);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
      if (!isSilent) setError(true);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  // FIX: check res.ok before parsing so 4xx/5xx responses surface an error
  const loadPastSeasons = useCallback(async () => {
    setPastLoading(true);
    setPastError(false);
    try {
      const url = `/api/season/snapshots${pastSeason ? `?season=${encodeURIComponent(pastSeason)}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) setPastSeasons(data);
    } catch (err) {
      console.error('Failed to fetch past seasons:', err);
      setPastError(true);
    } finally {
      setPastLoading(false);
    }
  }, [pastSeason]);

  // Load past seasons when the tab is first opened
  useEffect(() => {
    if (activeTab === 'past') loadPastSeasons();
  }, [activeTab, loadPastSeasons]);

  // Initial load + visibility-aware polling
  useEffect(() => {
    // If cache already seeded state, kick off a silent refresh immediately
    // so data is never more than one render stale.
    loadLeaderboardData(players.length > 0);

    const startPolling = () => {
      pollingIntervalRef.current = setInterval(
        () => document.visibilityState === 'visible' && loadLeaderboardData(true),
        POLL_INTERVAL,
      );
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadLeaderboardData(true);
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(pollingIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadLeaderboardData]);

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  // Reset page when sort/filter changes
  useEffect(() => { setPage(1); }, [sortBy, tierFilter]);

  // ── Processed list ─────────────────────────────────────────────────────────

  // PERF + FIX: pure sort+rank — no side effects inside useMemo.
  // Trend arrows are computed separately in the effect below.
  const rankedPlayers = useMemo(() => {
    const copy = [...players];

    copy.sort((a, b) => {
      if (sortBy === 'wpm')      return Number(b.wpm ?? 0)      - Number(a.wpm ?? 0);
      if (sortBy === 'wins')     return Number(b.wins ?? 0)     - Number(a.wins ?? 0);
      if (sortBy === 'winRate') {
        const rA = a.gamesPlayed ? (a.wins ?? 0) / a.gamesPlayed : 0;
        const rB = b.gamesPlayed ? (b.wins ?? 0) / b.gamesPlayed : 0;
        return rB - rA;
      }
      if (sortBy === 'accuracy') return Number(b.accuracy ?? 0) - Number(a.accuracy ?? 0);
      return Number(b.seasonPoints ?? 0) - Number(a.seasonPoints ?? 0);
    });

    return copy.map((player, index) => ({
      ...player,
      displayRank: index + 1,
      // trend is injected by the effect below; default to 'same' until then
      trend: player._trend ?? 'same',
    }));
  }, [players, sortBy]);

  // FIX: snapshot ranks AFTER render, never inside useMemo.
  // This gives correct before/after comparison without double-running side effects.
  const [trendMap, setTrendMap] = useState({});

  useEffect(() => {
    const next = {};
    const nextTrends = {};
    rankedPlayers.forEach(({ username, id, displayRank }) => {
      const key  = username ?? id;
      const prev = previousRanksRef.current[key];
      nextTrends[key] = prev === undefined ? 'same'
        : prev > displayRank ? 'up'
        : prev < displayRank ? 'down'
        : 'same';
      next[key] = displayRank;
    });
    previousRanksRef.current = next;
    setTrendMap(nextTrends);
  }, [rankedPlayers]);

  // Merge trend into each player object for rendering
  const fullyProcessedPlayers = useMemo(() =>
    rankedPlayers.map((p) => ({ ...p, trend: trendMap[p.username ?? p.id] ?? 'same' })),
    [rankedPlayers, trendMap],
  );

  const filteredPlayers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return fullyProcessedPlayers.filter((p) => {
      const matchesSearch = !q || p.username?.toLowerCase().includes(q);
      const matchesTier   = tierFilter === 'All' || normTier(p.tier) === normTier(tierFilter);
      return matchesSearch && matchesTier;
    });
  }, [fullyProcessedPlayers, searchQuery, tierFilter]);

  // FIX: split podium vs table by position within filteredPlayers (index),
  // not by displayRank — so the split is always correct when filters are active.
  const podiumPlayers      = useMemo(() => filteredPlayers.slice(0, 3),  [filteredPlayers]);
  const regularListPlayers = useMemo(() => filteredPlayers.slice(3),     [filteredPlayers]);

  // Pagination
  const isFiltered     = searchQuery !== '' || tierFilter !== 'All';
  const displayList    = isFiltered ? filteredPlayers : regularListPlayers;
  const totalPages     = Math.ceil(displayList.length / ITEMS_PER_PAGE);
  const pagedPlayers   = displayList.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Auto-scroll to self
  useEffect(() => {
    if (selfRowRef.current) {
      selfRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [players]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleRowClick   = useCallback((player) => setSelected(player), []);
  const handleModalClose = useCallback(() => setSelected(null), []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="leaderboard-container">
      {/* Header */}
      <div className="leaderboard-header">
        <div className="title-row">
          <h1>Competitive Rank Matchmaking</h1>
          <span className="live-badge">
            <span className="pulse-dot" />
            LIVE
          </span>
          <span className="season-badge" style={{ marginLeft: '0.75rem', fontSize: '0.78rem', padding: '0.25rem 0.75rem', borderRadius: '999px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', fontWeight: 500, letterSpacing: '0.02em' }}>
            📅 {seasonName} Season
          </span>
        </div>
        <p>Real-time typing ladder. Season resets at end of month.</p>
      </div>

      {/* Controls */}
      <div className="leaderboard-controls">
        <div className="sort-buttons" role="group" aria-label="Sort options">
          {SORTS.map((sort) => (
            <button
              key={sort.id}
              className={`sort-btn ${sortBy === sort.id ? 'active' : ''}`}
              onClick={() => setSortBy(sort.id)}
              aria-pressed={sortBy === sort.id}
            >
              {sort.label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <select
            className="tier-filter-select"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            aria-label="Filter by tier"
          >
            {TIERS.map((t) => (
              // FIX (minor): only call getTierIcon for actual tier values, not 'All'
              <option key={t} value={t}>{t === 'All' ? '🌐 All Tiers' : `${getTierIcon(t)} ${t}`}</option>
            ))}
          </select>

          <div className="search-wrapper">
            <input
              type="text"
              placeholder="Search player…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="leaderboard-search-input"
              aria-label="Search players"
            />
            {searchInput && (
              <button
                className="search-clear-btn"
                onClick={() => setSearchInput('')}
                aria-label="Clear search"
              >✕</button>
            )}
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="lb-tab-row" role="tablist" style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0 0.5rem' }}>
        <button
          className={`sort-btn ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => setActiveTab('live')}
          role="tab"
          aria-selected={activeTab === 'live'}
        >🏆 Live Standings</button>
        <button
          className={`sort-btn ${activeTab === 'past' ? 'active' : ''}`}
          onClick={() => setActiveTab('past')}
          role="tab"
          aria-selected={activeTab === 'past'}
        >📜 Past Seasons</button>
      </div>

      {/* Past Seasons Panel */}
      {activeTab === 'past' && (
        <div className="past-seasons-panel" style={{ marginTop: '0.5rem' }}>
          <div className="past-seasons-filter" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              className="leaderboard-search-input"
              placeholder="Filter by season e.g. April 2026"
              value={pastSeason}
              onChange={(e) => setPastSeason(e.target.value)}
              aria-label="Filter past season"
            />
            <button className="retry-btn" onClick={loadPastSeasons}>Search</button>
          </div>

          {/* FIX: show error state when past seasons fetch fails */}
          {pastError && !pastLoading && (
            <div className="error-leaderboard">
              <span className="error-icon">⚠️</span>
              <p>Failed to load past seasons.</p>
              <button className="retry-btn" onClick={loadPastSeasons}>Retry</button>
            </div>
          )}

          {pastLoading ? (
            <div className="leaderboard-table">{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}</div>
          ) : !pastError && pastSeasons.length === 0 ? (
            <div className="empty-leaderboard">
              <span className="empty-icon">📜</span>
              <p>No past season archives yet. They appear here after each monthly reset.</p>
            </div>
          ) : !pastError && (
            <>
              {/* Group by season name */}
              {(() => {
                const seasons = [...new Set(pastSeasons.map(r => r.seasonName))];
                return seasons.map(sName => {
                  const rows = pastSeasons.filter(r => r.seasonName === sName);
                  return (
                    <div key={sName} className="past-season-block" style={{ marginBottom: '1.5rem' }}>
                      <h3 className="past-season-title" style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem', opacity: 0.85 }}>📅 {sName}</h3>
                      <div className="leaderboard-table" role="table">
                        <div className="table-header" role="row">
                          <span className="col-rank"   role="columnheader">Rank</span>
                          <span className="col-player" role="columnheader">Player</span>
                          <span className="col-elo"    role="columnheader">Season Pts</span>
                          <span className="col-tier"   role="columnheader">Final Tier</span>
                        </div>
                        {rows.map(r => (
                          <div key={r.userId + sName} className="table-row real-time-row">
                            <span className="col-rank"><strong className="rank-indicator">#{r.rank}</strong></span>
                            <div className="col-player">
                              <span className="player-name">{r.username}</span>
                            </div>
                            <span className="col-elo">
                              <span className="elo-display-badge">⭐ {r.seasonPoints}</span>
                            </span>
                            <span className="col-tier">
                              <span className={`tier-badge tier-${getTierClass(r.tier)}`}>
                                {getTierIcon(r.tier)} {r.tier}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </>
          )}
        </div>
      )}

      {/* Body */}
      {activeTab === 'live' && error ? (
        <ErrorState onRetry={() => loadLeaderboardData(false)} />
      ) : activeTab === 'live' && (
        <>
          {/* Podium — only when no filter/search active */}
          {/* FIX: podiumPlayers is now sliced by filtered position so rank is always correct */}
          {!loading && !isFiltered && podiumPlayers.length > 0 && (
            <div className="podium-section" aria-label="Top 3 players">
              {[1, 0, 2].map((sliceIdx) => {
                const p = podiumPlayers[sliceIdx];
                if (!p) return null;
                const displayPos = sliceIdx + 1;
                // Visual order: 2nd | 1st | 3rd
                const visualOrder = sliceIdx === 0 ? 2 : sliceIdx === 1 ? 1 : 3;
                const tierClass = visualOrder === 1 ? 'gold-tier apex-rank' : visualOrder === 2 ? 'silver-tier' : 'bronze-tier';
                return (
                  <button
                    key={displayPos}
                    className={`podium-card ${tierClass}`}
                    style={{ order: visualOrder }}
                    onClick={() => setSelected(p)}
                    aria-label={`${p.username}, rank ${displayPos}`}
                  >
                    {displayPos === 1 && <div className="crown-icon">👑</div>}
                    <span className="podium-badge">#{displayPos}</span>
                    <div className="podium-username">{p.username}</div>
                    <div className="podium-stat">⭐ {p.seasonPoints ?? 0} pts</div>
                    <div className="podium-substat">{Number(p.wpm ?? 0).toFixed(0)} WPM</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Table */}
          <div className="leaderboard-table" role="table" aria-label="Leaderboard">
            <div className="table-header" role="row">
              <span className="col-rank"   role="columnheader">Rank</span>
              <span className="col-player" role="columnheader">Player</span>
              <span className="col-elo"    role="columnheader">Season Pts</span>
              <span className="col-wpm"    role="columnheader">Peak WPM</span>
              <span className="col-tier"   role="columnheader">Tier</span>
              <span className="col-wins"   role="columnheader">Wins</span>
            </div>

            {loading ? (
              Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
            ) : pagedPlayers.length === 0 ? (
              <EmptyState query={searchQuery} />
            ) : (
              pagedPlayers.map((player) => {
                const isMe = player.username === currentUserUsername;
                return (
                  <div key={player.id ?? `row-${player.username}`} ref={isMe ? selfRowRef : null}>
                    <PlayerRow
                      player={player}
                      isMe={isMe}
                      onClick={handleRowClick}
                    />
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="pagination" role="navigation" aria-label="Pagination">
              <button
                className="page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
              >‹</button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
                .reduce((acc, n, idx, arr) => {
                  if (idx > 0 && n - arr[idx - 1] > 1) acc.push('…');
                  acc.push(n);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === '…' ? (
                    <span key={`ellipsis-${idx}`} className="page-ellipsis">…</span>
                  ) : (
                    <button
                      key={item}
                      className={`page-btn ${page === item ? 'active' : ''}`}
                      onClick={() => setPage(item)}
                      aria-label={`Page ${item}`}
                      aria-current={page === item ? 'page' : undefined}
                    >{item}</button>
                  )
                )}

              <button
                className="page-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Next page"
              >›</button>
            </div>
          )}
        </>
      )}

      {/* Player detail modal */}
      {selected && <PlayerModal player={selected} onClose={handleModalClose} />}
    </div>
  );
}

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { fetchLeaderboard } from '../utils/api';
import '../styles/Leaderboard.css';

const SORTS = [
  { id: 'seasonPoints', label: '🏆 Top Points' },
  { id: 'wpm',         label: '⚡ Top WPM' },
  { id: 'wins',        label: '🥇 Most Wins' },
];

// Uses the tier already computed by the backend
const getTierClass = (tier = '') => {
  const t = tier.toLowerCase();
  if (t === 'grandmaster') return 'grandmaster';
  if (t === 'diamond')     return 'diamond';
  if (t === 'gold')        return 'gold';
  if (t === 'silver')      return 'silver';
  return 'bronze';
};

export default function Leaderboard({ currentUserUsername = "You" }) {
  const [players, setPlayers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [sortBy, setSortBy]       = useState('seasonPoints');
  const [searchQuery, setSearchQuery] = useState('');

  const previousRanksRef  = useRef({});
  const pollingIntervalRef = useRef(null);

  const loadLeaderboardData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const data = await fetchLeaderboard(100);
      if (Array.isArray(data)) setPlayers(data);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaderboardData(false);
    pollingIntervalRef.current = setInterval(() => loadLeaderboardData(true), 5000);
    return () => clearInterval(pollingIntervalRef.current);
  }, []);

  const fullyProcessedPlayers = useMemo(() => {
    const copy = [...players];

    copy.sort((a, b) => {
      if (sortBy === 'wpm')  return Number(b.wpm  || 0) - Number(a.wpm  || 0);
      if (sortBy === 'wins') return Number(b.wins || 0) - Number(a.wins || 0);
      return Number(b.seasonPoints || 0) - Number(a.seasonPoints || 0);
    });

    const ranked = copy.map((player, index) => {
      const currentRank = index + 1;
      const uniqueKey   = player.username || player.id;
      const prevRank    = previousRanksRef.current[uniqueKey];

      let trend = 'same';
      if (prevRank) {
        if (prevRank > currentRank) trend = 'up';
        else if (prevRank < currentRank) trend = 'down';
      }

      previousRanksRef.current[uniqueKey] = currentRank;
      return { ...player, displayRank: currentRank, trend };
    });

    return ranked.filter(p =>
      p.username?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [players, sortBy, searchQuery]);

  const podiumPlayers      = useMemo(() => fullyProcessedPlayers.filter(p => p.displayRank <= 3), [fullyProcessedPlayers]);
  const regularListPlayers = useMemo(() => fullyProcessedPlayers.filter(p => p.displayRank > 3),  [fullyProcessedPlayers]);

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header">
        <div className="title-row">
          <h1>Competitive Rank Matchmaking</h1>
          <span className="live-badge fallback">
            <span className="pulse-dot"></span>
        
          </span>
        </div>
        <p>Real-time typing ladder.</p>
      </div>

      <div className="leaderboard-controls">
        <div className="sort-buttons">
          {SORTS.map((sort) => (
            <button
              key={sort.id}
              className={`sort-btn ${sortBy === sort.id ? 'active' : ''}`}
              onClick={() => setSortBy(sort.id)}
            >
              {sort.label}
            </button>
          ))}
        </div>
        <div className="search-wrapper">
          <input
            type="text"
            placeholder="Search player..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="leaderboard-search-input"
          />
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading competitive ranks...</div>
      ) : (
        <>
          {searchQuery === '' && podiumPlayers.length > 0 && (
            <div className="podium-section">
              {[2, 1, 3].map(rank => {
                const p = podiumPlayers.find(p => p.displayRank === rank);
                if (!p) return null;
                const tierClass = rank === 1 ? 'gold-tier apex-rank' : rank === 2 ? 'silver-tier' : 'bronze-tier';
                return (
                  <div key={rank} className={`podium-card ${tierClass}`}>
                    {rank === 1 && <div className="crown-icon">👑</div>}
                    <span className="podium-badge">#{rank}</span>
                    <div className="podium-username">{p.username}</div>
                    <div className="podium-stat">⭐ {p.seasonPoints || 0} pts</div>
                    <div className="podium-substat">{Number(p.wpm || 0).toFixed(0)} WPM</div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="leaderboard-table">
            <div className="table-header">
              <span className="col-rank">Rank</span>
              <span className="col-player">Player</span>
              <span className="col-elo">Season Points</span>
              <span className="col-wpm">Peak WPM</span>
              <span className="col-tier">Tier</span>
              <span className="col-wins">Wins</span>
            </div>

            {fullyProcessedPlayers.length === 0 ? (
              <div className="empty-leaderboard">No players found.</div>
            ) : (
              (searchQuery !== '' ? fullyProcessedPlayers : regularListPlayers).map((player) => {
                const isMe = player.username === currentUserUsername;
                return (
                  <div
                    key={player.id || `row-${player.username}`}
                    className={`table-row real-time-row ${isMe ? 'highlighted-self-row' : ''}`}
                  >
                    <span className="col-rank">
                      <span className={`trend-indicator trend-${player.trend}`}>
                        {player.trend === 'up'   && '▲'}
                        {player.trend === 'down' && '▼'}
                        {player.trend === 'same' && '•'}
                      </span>
                      <strong className="rank-indicator">#{player.displayRank}</strong>
                    </span>

                    <div className="col-player">
                      <div className="player-name-wrapper">
                        <span className="player-name">
                          {player.username} {isMe && <span className="self-tag">(You)</span>}
                        </span>
                        {player.premium && <span className="premium-tag">VIP</span>}
                      </div>
                    </div>

                    <span className="col-elo">
                      <span className="elo-display-badge">⭐ {player.seasonPoints || 0}</span>
                    </span>

                    <span className="col-wpm">
                      <span className="stat-badge wpm-badge">{Number(player.wpm || 0).toFixed(1)}</span>
                    </span>

                    <span className="col-tier">
                      <span className={`tier-badge tier-${getTierClass(player.tier)}`}>
                        {player.tier || 'Bronze'}
                      </span>
                    </span>

                    <span className="col-wins">
                      <span className="wins-badge">{player.wins || 0}</span>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
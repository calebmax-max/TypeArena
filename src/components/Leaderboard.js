import React, { useEffect, useMemo, useState } from 'react';
import { fetchLeaderboard } from '../utils/typingApi';
import '../styles/Leaderboard.css';

const SORTS = [
  { id: 'wpm', label: 'Top WPM' },
  { id: 'wins', label: 'Most Wins' },
  { id: 'seasonPoints', label: 'Season Points' },
];

export default function Leaderboard() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('wpm');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetchLeaderboard(100);
      setPlayers(data);
      setLoading(false);
    };
    load();
  }, []);

  const sortedPlayers = useMemo(() => {
    const copy = [...players];
    copy.sort((a, b) => {
      if (sortBy === 'wins') return Number(b.wins || 0) - Number(a.wins || 0);
      if (sortBy === 'seasonPoints') return Number(b.seasonPoints || 0) - Number(a.seasonPoints || 0);
      return Number(b.wpm || 0) - Number(a.wpm || 0);
    });
    return copy.map((player, index) => ({ ...player, displayRank: index + 1 }));
  }, [players, sortBy]);

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header">
        <h1>Season Leaderboard</h1>
        <p>Track premium ladders, tiers, and top earning typists.</p>
      </div>

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

      {loading ? (
        <div className="loading">Loading leaderboard...</div>
      ) : (
        <div className="leaderboard-table">
          <div className="table-header">
            <span className="col-rank">Rank</span>
            <span className="col-player">Player</span>
            <span className="col-wpm">WPM</span>
            <span className="col-accuracy">Accuracy</span>
            <span className="col-races">Tier</span>
            <span className="col-wins">Wins</span>
            <span className="col-earnings">Season</span>
          </div>

          {sortedPlayers.map((player) => (
            <div
              key={player.id}
              className={`table-row ${player.displayRank <= 3 ? 'top-3' : ''}`}
            >
              <span className="col-rank">
                <strong>#{player.displayRank}</strong>
              </span>
              <div className="col-player">
                <div className="player-name">
                  {player.username} {player.premium ? 'VIP' : ''}
                </div>
                <span className="rank-number">{player.referralCode || player.season}</span>
              </div>
              <span className="col-wpm">
                <span className="stat-badge">{Number(player.wpm || 0).toFixed(1)}</span>
              </span>
              <span className="col-accuracy">
                <span className="stat-badge">{Number(player.accuracy || 0).toFixed(1)}%</span>
              </span>
              <span className="col-races">
                <span className="stat-badge">{player.tier || 'Bronze'}</span>
              </span>
              <span className="col-wins">
                <span className="wins-badge">{player.wins || 0}</span>
              </span>
              <span className="col-earnings earnings">
                {Number(player.seasonPoints || 0).toLocaleString()} pts
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

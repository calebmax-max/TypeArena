import React, { useEffect, useState } from 'react';
import { fetchTournaments, joinTournament } from '../utils/typingApi';
import '../styles/Tournaments.css';

export default function Tournaments() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [joinNotice, setJoinNotice] = useState(null);

  useEffect(() => {
    const loadTournaments = async () => {
      setLoading(true);
      const data = await fetchTournaments();
      setTournaments(data);
      setLoading(false);
    };
    loadTournaments();
  }, []);

  const handleJoinTournament = async (tournament) => {
    const confirmed = window.confirm(
      `Join "${tournament.name}" for KES ${Number(tournament.cost ?? tournament.entryFee).toLocaleString()}?`
    );

    if (!confirmed) {
      return;
    }

    setProcessingId(tournament.id);
    try {
      const result = await joinTournament(tournament.id);
      setTournaments((prev) =>
        prev.map((item) => (item.id === tournament.id ? result.tournament : item))
      );
      setJoinNotice({
        type: result.matched ? 'success' : 'info',
        text: result.message,
      });
    } catch (error) {
      setJoinNotice({
        type: 'error',
        text: error.message || 'Could not join this tournament.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="tournaments-container">
      <div className="tournaments-header">
        <h1>Premium Match Tournaments</h1>
        <p>Fast 1v1 entry rooms with instant winner payouts.</p>
      </div>

      {joinNotice && (
        <div className={`join-notice join-notice--${joinNotice.type}`}>{joinNotice.text}</div>
      )}

      {loading ? (
        <div className="loading">Loading tournaments...</div>
      ) : (
        <div className="tournaments-grid">
          {tournaments.map((tournament) => {
            const isFull =
              Number(tournament.participants || 0) >=
              Number(tournament.matchSize || tournament.maxParticipants || 2);
            const cost = Number(tournament.cost ?? tournament.entryFee ?? 0);
            const winnerPrize = Number(tournament.winnerPrize ?? cost * 2 * 0.75);

            return (
              <div key={tournament.id} className="tournament-card">
                <div className="tournament-badge">{tournament.image}</div>
                <h3>{tournament.name}</h3>
                <p className="tournament-winner-note">
                  Status: {String(tournament.status || 'upcoming').toUpperCase()}
                </p>
                {tournament.startTime && (
                  <p className="tournament-winner-note">
                    Starts: {new Date(tournament.startTime).toLocaleString()}
                  </p>
                )}

                <div className="tournament-price">
                  <span className="label">Price</span>
                  <span className="value">KES {cost.toLocaleString()}</span>
                </div>

                <p className="tournament-winner-note">
                  Winner receives KES {winnerPrize.toLocaleString()}.
                </p>

                <button
                  className="btn btn-primary"
                  onClick={() => handleJoinTournament(tournament)}
                  disabled={processingId === tournament.id || isFull}
                >
                  {processingId === tournament.id
                    ? 'Matching Opponent...'
                    : isFull
                    ? 'Tournament Full'
                    : `Join - KES ${cost.toLocaleString()}`}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

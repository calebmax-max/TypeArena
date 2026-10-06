import React from 'react';
import './PrivateRoomPayments.css';

export default function PrivateRoomPanel({
  friendBattle,
  setFriendBattle,
  createFriendBattle,
  loadingLive,
  liveAction,
  currentUser,
  liveRoom,
}) {
  return (
    <div className="friend-battle-card">
      <div className="live-board__header">
        <h2>Friend Battles + Private Rooms</h2>
      </div>
      <div className="friend-battle-grid">
        <label className="friend-battle-player-limit">
          Max players
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <button
              type="button"
              className="btn btn-sm btn-outline-light"
              aria-label="Decrease maximum players"
              onClick={() => setFriendBattle((prev) => ({ ...prev, maxPlayers: Math.max(2, Number(prev.maxPlayers || 2) - 1) }))}
              disabled={friendBattle.maxPlayers <= 2}
            >
              −
            </button>
            <input type="number" min="2" max="10" value={friendBattle.maxPlayers} readOnly style={{ width: '4rem', textAlign: 'center' }} />
            <button
              type="button"
              className="btn btn-sm btn-outline-light"
              aria-label="Increase maximum players"
              onClick={() => setFriendBattle((prev) => ({ ...prev, maxPlayers: Math.min(10, Number(prev.maxPlayers || 2) + 1) }))}
              disabled={friendBattle.maxPlayers >= 10}
            >
              +
            </button>
          </span>
        </label>
      </div>

      <div className="results-actions">
        <button
          data-tour="play-create-private-room"
          className="btn btn-primary"
          onClick={createFriendBattle}
          disabled={loadingLive || currentUser === undefined || !currentUser?.id}
        >
          Create Private Room
        </button>
      </div>
      {loadingLive && (
        <div className="friend-battle-status" role="status" aria-live="polite">
          <span className="friend-battle-status__dot" aria-hidden="true" />
          {liveAction === 'creating' && 'Creating your private room…'}
          {liveAction === 'joining' && 'Joining the private room…'}
          {liveAction === 'matching' && 'Finding an opponent…'}
        </div>
      )}
      <p className="results-challenge">
        'Create a room, invite players by username, and start when everyone is ready.'
      </p>
    </div>
  );
}

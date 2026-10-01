import React, { useMemo } from 'react';
import './PrivateRoomPayments.css';

// Mirrors the backend split in _settle_private_room_stakes (app_backend.py):
//   - exactly 2 players -> winner takes 85%, house takes 15%
//   - 3+ players        -> tournament-style podium (50/20/10), house takes 20%
const HEADS_UP_WINNER_SHARE = 0.85;
const PODIUM_SHARES = [0.5, 0.2, 0.1];
const PODIUM_HOUSE_SHARE = 0.2;

function payoutPreview(stakeAmount, maxPlayers) {
  const pot = stakeAmount * maxPlayers;
  if (pot <= 0) return null;
  if (maxPlayers <= 2) {
    return {
      pot,
      houseShare: pot * (1 - HEADS_UP_WINNER_SHARE),
      lines: [`Winner takes ${Math.round(HEADS_UP_WINNER_SHARE * 100)}% (${formatMoney(pot * HEADS_UP_WINNER_SHARE)})`],
    };
  }
  return {
    pot,
    houseShare: pot * PODIUM_HOUSE_SHARE,
    lines: PODIUM_SHARES.map(
      (share, index) => `#${index + 1} gets ${Math.round(share * 100)}% (${formatMoney(pot * share)})`
    ),
  };
}

function formatMoney(value) {
  return `KES ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function PrivateRoomPanel({
  friendBattle,
  setFriendBattle,
  createFriendBattle,
  loadingLive,
  liveAction,
  currentUser,
  liveRoom,
  onRequestTopUp,
}) {
  const walletBalance = Number(currentUser?.balance || 0);
  const stakeAmount = Number(friendBattle.stakeAmount || 0);

  const createPreview = useMemo(
    () => payoutPreview(stakeAmount, friendBattle.maxPlayers || 2),
    [stakeAmount, friendBattle.maxPlayers]
  );

  const createShortfall = Math.max(0, stakeAmount - walletBalance);
  const handleStakeChange = (event) => {
    const value = Math.max(0, Number(event.target.value) || 0);
    setFriendBattle((prev) => ({ ...prev, stakeAmount: value }));
  };

  return (
    <div className="friend-battle-card">
      <div className="live-board__header">
        <h2>Friend Battles + Private Rooms</h2>
        <span className="friend-battle-balance" title="Your wallet balance">
          Balance: {formatMoney(walletBalance)}
        </span>
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

      {/* --- Stake / payment section --- */}
      <div className="friend-battle-stake">
        <label className="friend-battle-stake__amount">
          Stake per player (KES)
          <input
            type="number"
            min="0"
            step="10"
            value={friendBattle.stakeAmount}
            onChange={handleStakeChange}
            placeholder="0 = free play"
          />
        </label>
        <p className="friend-battle-stake__hint">
          Stakes are collected on join and paid out automatically when the race ends.
        </p>

        {stakeAmount > 0 && createPreview && (
          <div className="friend-battle-stake__pot" aria-live="polite">
            <strong>Pot preview ({friendBattle.maxPlayers} players): {formatMoney(createPreview.pot)}</strong>
            <ul>
              {createPreview.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li>House fee: {formatMoney(createPreview.houseShare)}</li>
            </ul>
          </div>
        )}

        {stakeAmount > 0 && createShortfall > 0 && (
          <div className="friend-battle-stake__warning" role="alert">
            You need {formatMoney(createShortfall)} more to cover this stake.
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => onRequestTopUp?.(createShortfall)}
            >
              Top Up Wallet
            </button>
          </div>
        )}
      </div>

      <div className="results-actions">
        <button
          className="btn btn-primary"
          onClick={createFriendBattle}
          disabled={loadingLive || currentUser === undefined || !currentUser?.id || createShortfall > 0}
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

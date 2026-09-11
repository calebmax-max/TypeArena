import React, { useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../utils/api';
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
  hasSignatureInvites,
  friendBattle,
  setFriendBattle,
  createFriendBattle,
  joinFriendBattle,
  copyInviteCode,
  loadingLive,
  liveAction,
  currentUser,
  liveRoom,
  onRequestTopUp,
}) {
  const activeInviteCode = liveRoom?.inviteCode || friendBattle.inviteCode;
  const walletBalance = Number(currentUser?.balance || 0);
  const stakeAmount = Number(friendBattle.stakeAmount || 0);

  // Live preview of a room the player is about to join by invite code, so
  // they can see the stake and pot *before* hitting "Join" and getting
  // debited. Uses the public GET /api/live-races/invite/<code> endpoint.
  const [joinPreview, setJoinPreview] = useState(null);
  const [joinPreviewError, setJoinPreviewError] = useState('');
  const [joinPreviewLoading, setJoinPreviewLoading] = useState(false);

  useEffect(() => {
    const code = friendBattle.inviteCode.trim();
    if (!code || liveRoom) {
      setJoinPreview(null);
      setJoinPreviewError('');
      return undefined;
    }
    let active = true;
    setJoinPreviewLoading(true);
    setJoinPreviewError('');
    const timer = window.setTimeout(() => {
      fetch(buildApiUrl(`/api/live-races/invite/${encodeURIComponent(code)}`))
        .then((r) => {
          if (!r.ok) throw new Error(r.status === 404 ? 'No room found for that code yet.' : 'Could not look up that room.');
          return r.json();
        })
        .then((room) => {
          if (active) setJoinPreview(room);
        })
        .catch((err) => {
          if (active) {
            setJoinPreview(null);
            setJoinPreviewError(err.message);
          }
        })
        .finally(() => {
          if (active) setJoinPreviewLoading(false);
        });
    }, 400); // debounce while typing
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [friendBattle.inviteCode, liveRoom]);

  const createPreview = useMemo(
    () => payoutPreview(stakeAmount, friendBattle.maxPlayers || 2),
    [stakeAmount, friendBattle.maxPlayers]
  );

  const createShortfall = Math.max(0, stakeAmount - walletBalance);
  const joinStake = Number(joinPreview?.stakeAmount || 0);
  const joinShortfall = Math.max(0, joinStake - walletBalance);

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
        {hasSignatureInvites && (
          <input
            value={friendBattle.customInviteCode}
            onChange={(event) =>
              setFriendBattle((prev) => ({
                ...prev,
                customInviteCode: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12),
              }))
            }
            placeholder="Your custom invite code"
          />
        )}
        <input
          value={friendBattle.inviteCode}
          onChange={(event) =>
            setFriendBattle((prev) => ({ ...prev, inviteCode: event.target.value.toUpperCase() }))
          }
          placeholder="Invite code"
        />
        <label className="friend-battle-player-limit">
          Max players
          <input type="number" min="2" max="10" value={friendBattle.maxPlayers} onChange={(event) => setFriendBattle((prev) => ({ ...prev, maxPlayers: Math.max(2, Math.min(10, Number(event.target.value) || 2)) }))} />
        </label>
        <input
          value={friendBattle.password}
          onChange={(event) =>
            setFriendBattle((prev) => ({ ...prev, password: event.target.value }))
          }
          placeholder="Private room password"
        />
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

      {/* Invite-code join preview */}
      {!liveRoom && friendBattle.inviteCode.trim() && (
        <div className="friend-battle-join-preview" aria-live="polite">
          {joinPreviewLoading && <span>Checking room…</span>}
          {!joinPreviewLoading && joinPreviewError && <span className="friend-battle-stake__warning">{joinPreviewError}</span>}
          {!joinPreviewLoading && joinPreview && (
            <>
              <span>
                Room stake: <strong>{joinStake > 0 ? formatMoney(joinStake) : 'Free play'}</strong>
                {' · '}
                {joinPreview.players?.length || 0}/{joinPreview.maxPlayers || 2} players
                {joinPreview.hasPassword ? ' · Password required' : ''}
              </span>
              {joinStake > 0 && joinShortfall > 0 && (
                <div className="friend-battle-stake__warning" role="alert">
                  You need {formatMoney(joinShortfall)} more to join this room.
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => onRequestTopUp?.(joinShortfall)}
                  >
                    Top Up Wallet
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="results-actions">
        <button
          className="btn btn-primary"
          onClick={createFriendBattle}
          disabled={loadingLive || currentUser === undefined || !currentUser?.id || createShortfall > 0}
        >
          Create Private Room
        </button>
        <button
          className="btn btn-outline-primary"
          onClick={joinFriendBattle}
          disabled={loadingLive || !friendBattle.inviteCode.trim() || (joinStake > 0 && joinShortfall > 0)}
        >
          Join With Invite
        </button>
        <button className="btn btn-outline-light" onClick={copyInviteCode} disabled={!activeInviteCode}>
          Copy Code
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
        {hasSignatureInvites
          ? 'Your Signature Invite Pass is active. You can create a private room with your own custom code.'
          : 'Invite code and private password work here for private matches. Buy Signature Invite Pass to create your own custom room code.'}
      </p>
    </div>
  );
}
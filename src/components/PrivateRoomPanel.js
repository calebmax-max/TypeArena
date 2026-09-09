import React from 'react';

export default function PrivateRoomPanel({
  hasSignatureInvites,
  friendBattle,
  setFriendBattle,
  createFriendBattle,
  joinFriendBattle,
  shareToWhatsApp,
  copyInviteCode,
  copyInviteLink,
  loadingLive,
  liveAction,
  currentUser,
  liveRoom,
}) {
  const activeInviteCode = liveRoom?.inviteCode || friendBattle.inviteCode;

  return (
    <div className="friend-battle-card">
      <div className="live-board__header">
        <h2>Friend Battles + Private Rooms</h2>
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
      <div className="results-actions">
        <button className="btn btn-primary" onClick={createFriendBattle} disabled={loadingLive || currentUser === undefined || !currentUser?.id}>
          Create Private Room
        </button>
        <button className="btn btn-outline-primary" onClick={joinFriendBattle} disabled={loadingLive || !friendBattle.inviteCode.trim()}>
          Join With Invite
        </button>
        <button className="btn btn-success" onClick={shareToWhatsApp} disabled={!activeInviteCode}>
          Share on WhatsApp
        </button>
        <button className="btn btn-outline-light" onClick={copyInviteCode} disabled={!activeInviteCode}>
          Copy Code
        </button>
        <button className="btn btn-outline-light" onClick={copyInviteLink} disabled={!activeInviteCode}>
          Copy Link
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

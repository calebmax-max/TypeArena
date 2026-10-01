import React, { useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../utils/api';
import { buildHeaders } from '../utils/typingApi';

async function apiFetch(path, opts = {}) {
  const { body, method, ...rest } = opts;
  const res = await fetch(buildApiUrl(path), {
    credentials: 'omit',
    method: method || 'GET',
    headers: buildHeaders(),
    ...(body ? { body } : {}),
    ...rest,
  });
  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (_) {
    data = null;
  }
  if (!res.ok) {
    const error = new Error(data?.message || raw.trim() || `Request failed with status ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Share button: sits next to the existing "Copy" invite-code button.
// Uses the native share sheet when available (phones), otherwise opens
// WhatsApp directly. The link includes the room password only when the host
// has it in hand (friendBattle.password), so a password-protected room's link
// still works for the person who receives it.
// ---------------------------------------------------------------------------
export function ShareInviteButton({ inviteCode, password, stakeAmount, showNotice }) {
  if (!inviteCode) return null;

  const handleShare = async () => {
    const params = new URLSearchParams({ invite: inviteCode });
    if (password) params.set('password', password);
    const link = `${window.location.origin}/play?${params.toString()}`;
    const stakeNote = Number(stakeAmount) > 0
      ? ` (staked room: KES ${Number(stakeAmount).toLocaleString()} each)`
      : '';
    const text = `Race me on TypeArena${stakeNote}! Join my private room: ${link}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'TypeArena private room', text });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return; // user closed the share sheet
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    if (showNotice) showNotice('Opening WhatsApp with your invite link.', 'info');
  };

  return (
    <button
      type="button"
      className="btn btn-sm btn-outline-light invite-share-btn"
      style={{ marginLeft: '0.4rem' }}
      onClick={handleShare}
      aria-label="Share invite link"
      title="Share invite link (WhatsApp)"
    >
      Share
    </button>
  );
}

// ---------------------------------------------------------------------------
// Host-only "Invite player" box for a private waiting room.
// Username autocomplete uses the existing /api/chat/contacts?search= route.
// ---------------------------------------------------------------------------
function InvitePlayerBox({ room, currentUser }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: '', type: 'info' });
  const requestIdRef = useRef(0);

  const isHost = Boolean(room?.isPrivate)
    && String(room?.hostUserId) === String(currentUser?.id)
    && room?.status === 'waiting';
  const full = (room?.players?.length || 0) >= (room?.maxPlayers || 2);

  useEffect(() => {
    const trimmed = query.trim();
    if (!isHost || trimmed.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const data = await apiFetch(`/api/chat/contacts?search=${encodeURIComponent(trimmed)}`);
        if (requestId !== requestIdRef.current) return;
        const list = Array.isArray(data) ? data : (data?.contacts || data?.users || []);
        const inRoom = new Set((room?.players || []).map((p) => String(p.userId)));
        const lowered = trimmed.toLowerCase();
        setSuggestions(
          list
            .filter((c) => c?.username && !c.isMe && !inRoom.has(String(c.id)))
            .filter((c) => String(c.username).toLowerCase().includes(lowered))
            .slice(0, 6)
        );
      } catch (_) {
        if (requestId === requestIdRef.current) setSuggestions([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, isHost, room?.players]);

  if (!isHost) return null;

  const sendInvite = async (username) => {
    const name = String(username || query).trim();
    if (!name || busy) return;
    setBusy(true);
    setMessage({ text: '', type: 'info' });
    try {
      const data = await apiFetch(`/api/live-races/${encodeURIComponent(room.id)}/invites`, {
        method: 'POST',
        body: JSON.stringify({ username: name }),
      });
      setMessage({ text: `Invite sent to ${data?.invitedUsername || name}.`, type: 'success' });
      setQuery('');
      setSuggestions([]);
      setOpen(false);
    } catch (err) {
      setMessage({ text: err?.message || 'Could not send the invite.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="room-invite-box" style={{ marginTop: '0.75rem', position: 'relative' }}>
      <strong style={{ display: 'block', marginBottom: '0.35rem' }}>Invite player</strong>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          className="form-control"
          placeholder={full ? 'Room is full' : 'Type a username'}
          value={query}
          disabled={full || busy}
          maxLength={100}
          autoComplete="off"
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); sendInvite(); } }}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={full || busy || !query.trim()}
          onClick={() => sendInvite()}
        >
          {busy ? 'Sending...' : 'Invite'}
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <ul
          style={{
            listStyle: 'none', margin: '0.25rem 0 0', padding: '0.25rem', position: 'absolute',
            left: 0, right: '5.5rem', zIndex: 20,
            background: 'var(--arena-surface, #151a2b)',
            border: '1px solid var(--arena-border, rgba(255,255,255,0.18))',
            borderRadius: '10px', maxHeight: '220px', overflowY: 'auto',
          }}
        >
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="btn btn-link btn-sm"
                style={{ width: '100%', textAlign: 'left', textDecoration: 'none' }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => sendInvite(s.username)}
              >
                {s.username}{s.isOnline ? ' - online' : ''}
              </button>
            </li>
          ))}
        </ul>
      )}

      {message.text && (
        <p
          className="results-challenge"
          style={{ marginTop: '0.4rem', color: message.type === 'error' ? '#ff8a8a' : undefined }}
          role="status"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

export default InvitePlayerBox;
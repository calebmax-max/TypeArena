import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildApiUrl } from '../utils/api';
import { buildHeaders } from '../utils/typingApi';

// Replaces ChatWidget. Two jobs:
//   1. Keep the user "online": POST /api/presence/ping every 30 s (the server
//      treats a user as online for 45 s after their last ping). The ping
//      response also carries any pending room invites.
//   2. Also do a read-only GET /api/invites/pending every 10 s while the tab
//      is visible so invites appear even when the user is on another page.
//
// Accepting an invite sends the user to the room and starts the existing join
// flow. The stake is only debited by that join request after any confirmation.

const PING_INTERVAL_MS = 30000;

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

const styles = {
  wrap: {
    position: 'fixed',
    right: '1rem',
    bottom: '1rem',
    zIndex: 2000,
    width: 'min(92vw, 340px)',
    background: 'var(--arena-surface, #151a2b)',
    color: 'var(--arena-text, #f3f5ff)',
    border: '1px solid var(--arena-border, rgba(255,255,255,0.18))',
    borderRadius: '14px',
    boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
    padding: '1rem',
  },
  title: { margin: 0, fontSize: '1rem', fontWeight: 700 },
  sub: { margin: '0.35rem 0 0', fontSize: '0.85rem', opacity: 0.8 },
  stake: {
    marginTop: '0.75rem',
    padding: '0.6rem 0.7rem',
    borderRadius: '10px',
    background: 'rgba(255,193,7,0.12)',
    border: '1px solid rgba(255,193,7,0.45)',
    fontSize: '0.85rem',
  },
  actions: { display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' },
  error: { marginTop: '0.6rem', fontSize: '0.82rem', color: '#ff8a8a' },
  more: { marginTop: '0.6rem', fontSize: '0.75rem', opacity: 0.7 },
};

function formatSeconds(total) {
  const safe = Math.max(0, total);
  const m = Math.floor(safe / 60);
  const s = String(safe % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function InviteInbox({ currentUser }) {
  const navigate = useNavigate();
  const isLoggedIn = Boolean(currentUser?.id);

  const [invites, setInvites] = useState([]);
  const [dismissed, setDismissed] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  // True while Play.js reports a race in progress (see 'typearena-race-state').
  const [raceActive, setRaceActive] = useState(false);
  const receivedAtRef = useRef(Date.now());

  const applyInvites = useCallback((list) => {
    receivedAtRef.current = Date.now();
    setInvites(Array.isArray(list) ? list : []);
  }, []);

  // ---- Presence ping (30 s) - also returns pending invites ----------------
  useEffect(() => {
    if (!isLoggedIn) {
      setInvites([]);
      return undefined;
    }
    let stopped = false;
    let lastPing = 0;
    const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

    const ping = () =>
      apiFetch('/api/presence/ping', { method: 'POST' })
        .then((data) => {
          if (!stopped && data && Array.isArray(data.invites)) applyInvites(data.invites);
        })
        .catch((err) => {
          // Dead token: stop hammering the server and clear the stale session
          // (same behaviour the old ChatWidget ping had).
          if (!stopped && (err?.status === 401 || err?.status === 403)) {
            stopped = true;
            clearInterval(intervalId);
            localStorage.removeItem('token');
            localStorage.removeItem('typearena_user');
            window.dispatchEvent(new Event('typearena-user-changed'));
          }
        });

    const maybePing = (minGapMs) => {
      if (stopped || !isVisible()) return;
      if (Date.now() - lastPing < minGapMs) return;
      lastPing = Date.now();
      ping();
    };
    const onWake = () => maybePing(10000);

    maybePing(0);
    const intervalId = setInterval(() => maybePing(0), PING_INTERVAL_MS);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      stopped = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [isLoggedIn, applyInvites]);

  // ---- Hide the popup during a race ---------------------------------------
  useEffect(() => {
    const onRaceState = (event) => setRaceActive(Boolean(event?.detail?.active));
    window.addEventListener('typearena-race-state', onRaceState);
    return () => window.removeEventListener('typearena-race-state', onRaceState);
  }, []);

  // ---- Countdown tick (only while an invite is showing) -------------------
  const visibleInvites = invites.filter((invite) => !dismissed.has(invite.id));
  // Invites keep being fetched during a race; they just aren't shown until it
  // ends (their expiry countdown keeps running, so stale ones simply vanish).
  const current = raceActive ? null : (visibleInvites[0] || null);

  useEffect(() => {
    if (!current) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [current]);

  // Reset per-invite UI state when the invite on screen changes.
  const currentId = current?.id;
  useEffect(() => {
    setError('');
  }, [currentId]);

  if (!isLoggedIn || !current) return null;

  const elapsed = Math.floor((now - receivedAtRef.current) / 1000);
  const secondsLeft = Math.max(0, Number(current.secondsLeft || 0) - elapsed);

  const dismiss = (id) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleDecline = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/invites/${current.id}/decline`, { method: 'POST' });
    } catch (_) {
      // Even if the call fails, hide it locally; it will expire on its own.
    } finally {
      dismiss(current.id);
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch(`/api/invites/${current.id}/accept`, { method: 'POST' });
      const params = new URLSearchParams({ invite: data.inviteCode });
      dismiss(current.id);
      params.set('autoJoin', '1');
      navigate(`/play?${params.toString()}`);
    } catch (err) {
      setError(err?.message || 'Could not accept this invite.');
      if (err?.status === 410 || err?.status === 404) dismiss(current.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.wrap} role="dialog" aria-live="polite" aria-label="Private room invite">
      <p style={styles.title}>{current.fromUsername} invited you to a private room</p>
      <p style={styles.sub}>Expires in {formatSeconds(secondsLeft)}</p>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.actions}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleAccept}
          disabled={busy || secondsLeft <= 0}
        >
          {busy ? 'Please wait...' : 'Accept'}
        </button>
        <button type="button" className="btn btn-outline-light btn-sm" onClick={handleDecline} disabled={busy}>
          Decline
        </button>
        <button type="button" className="btn btn-link btn-sm" onClick={() => dismiss(current.id)} disabled={busy}>
          Later
        </button>
      </div>

      {visibleInvites.length > 1 && (
        <div style={styles.more}>+{visibleInvites.length - 1} more invite{visibleInvites.length > 2 ? 's' : ''}</div>
      )}
    </div>
  );
}

export default React.memo(InviteInbox);

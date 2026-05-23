import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { buildApiUrl } from '../utils/api';
import { buildHeaders } from '../utils/typingApi';

// Uses the shared buildHeaders/buildApiUrl so ChatWidget auth stays in sync
// with the rest of the app (same token key, X-User-Id header, etc.)
function makeApiFetch(_userId) {
  return async function apiFetch(path, opts = {}) {
    const { body, method, ...rest } = opts;
    const res = await fetch(buildApiUrl(path), {
      credentials: 'omit',
      method: method || 'GET',
      headers: buildHeaders(),
      ...(body ? { body } : {}),
      ...rest,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };
}

// ── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, size = 40 }) {
  const initials = name
    ? name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const colors = ['hsl(145 80% 36%)', 'hsl(210 70% 38%)', 'hsl(240 50% 35%)', 'hsl(175 60% 32%)', 'hsl(270 50% 38%)'];
  const color = colors[name?.charCodeAt(0) % colors.length] || colors[0];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: size * 0.38, fontWeight: 600,
      color: 'hsl(0 0% 95%)', flexShrink: 0, userSelect: 'none',
    }}>
      {initials}
    </div>
  );
}

// ── Online / contact list ────────────────────────────────────────────────────
function ContactList({ players, onSelect, unread, search }) {
  const others = players.filter((p) => !p.isMe);

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'hsl(240 12% 8%)' }}>
      {others.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', gap: 12,
          color: 'hsl(240 5% 58%)', fontSize: 14, padding: 24, textAlign: 'center',
        }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="hsl(240 5% 55%)" strokeWidth="1.2">
            <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          {search ? `No players matching "${search}"` : 'No other players online'}
        </div>
      ) : (
        others.map((p, i) => {
          const hasUnread = unread[p.id] > 0;
          return (
            <div
              key={p.id}
              onClick={() => onSelect(p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', cursor: 'pointer',
                borderBottom: '1px solid hsl(240 10% 14%)',
                background: 'hsl(240 12% 8%)', transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'hsl(240 12% 11%)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'hsl(240 12% 8%)'}
            >
              <div style={{ position: 'relative' }}>
                <Avatar name={p.username} size={49} />
                <span style={{
                  position: 'absolute', bottom: 1, right: 1,
                  width: 12, height: 12, borderRadius: '50%',
                  background: 'hsl(145 80% 42%)', border: '2px solid hsl(0 0% 95%)',
                }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 500, fontSize: 16, color: 'hsl(0 0% 93%)', truncate: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {p.username}
                  </span>
                  <span style={{ fontSize: 12, color: hasUnread ? 'hsl(145 80% 50%)' : 'hsl(240 5% 58%)', flexShrink: 0, marginLeft: 8 }}>
                    {Math.round(p.wpm)} wpm
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 13, color: 'hsl(240 5% 58%)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    Online
                  </span>
                  {hasUnread && (
                    <span style={{
                      background: 'hsl(145 80% 42%)', color: 'hsl(0 0% 95%)', borderRadius: 100,
                      fontSize: 12, fontWeight: 600, minWidth: 20, height: 20,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 6px', flexShrink: 0,
                    }}>
                      {unread[p.id]}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── DM thread ────────────────────────────────────────────────────────────────
function Thread({ partner, currentUserId, onBack, apiFetch }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const wsRef = useRef(null);
  const pingRef = useRef(null);

  // Load message history on open
  const loadMessages = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/chat/messages/${partner.id}`);
      setMessages(data);
    } catch (_) {}
  }, [partner.id, apiFetch]);

  // WebSocket for instant incoming messages
  useEffect(() => {
    loadMessages();

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${window.location.host}/api/chat/ws/${partner.id}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg && msg.id) {
          setMessages((prev) => {
            // Avoid duplicates (optimistic msg already added for sender)
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      } catch (_) {}
    };

    ws.onopen = () => {
      // Keep-alive ping every 20s
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, 20000);
    };

    ws.onclose = () => {
      clearInterval(pingRef.current);
      // Fallback: reload messages if socket drops
      loadMessages();
    };

    return () => {
      clearInterval(pingRef.current);
      ws.close();
    };
  }, [partner.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const send = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setInput('');

    // Optimistic: show message immediately with a temp id
    const tempId = `tmp_${Date.now()}`;
    const optimistic = {
      id: tempId,
      senderId: currentUserId,
      recipientId: partner.id,
      body,
      sentAt: new Date().toISOString(),
      mine: true,
      read: false,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const msg = await apiFetch('/api/chat/messages', {
        method: 'POST',
        body: JSON.stringify({ recipientId: partner.id, body }),
      });
      if (msg && msg.id) {
        // Replace temp optimistic message with real confirmed one
        setMessages((prev) => prev.map((m) => m.id === tempId ? msg : m));
      }
    } catch (_) {
      // Roll back on failure and restore input
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(body);
    } finally {
      setSending(false);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'hsl(240 12% 7%)' }}>
      {/* Header */}
      <div style={{
        background: 'hsl(240 12% 8%)', display: 'flex', alignItems: 'center',
        gap: 10, padding: '10px 16px', flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          aria-label="Back"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'hsl(0 0% 95%)', padding: 4, display: 'flex', alignItems: 'center',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <Avatar name={partner.username} size={38} />
        <div style={{ flex: 1 }}>
          <div style={{ color: 'hsl(0 0% 95%)', fontWeight: 600, fontSize: 15 }}>{partner.username}</div>
          <div style={{ color: 'hsl(145 40% 60%)', fontSize: 12 }}>online</div>
        </div>

      </div>

      {/* Chat background pattern */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '8px 16px',
        background: 'hsl(240 12% 6%)',
      }}>
        {messages.length === 0 && (
          <div style={{
            display: 'flex', justifyContent: 'center', marginTop: 16,
          }}>
            <div style={{
              background: 'hsl(240 12% 14%)', color: 'hsl(0 0% 80%)',
              borderRadius: 8, padding: '6px 12px', fontSize: 12, textAlign: 'center',
            }}>
              Say hi to {partner.username}! 👋
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const mine = msg.mine;
          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: mine ? 'flex-end' : 'flex-start',
                marginBottom: 4,
              }}
            >
              <div style={{
                maxWidth: '72%',
                background: mine ? 'hsl(145 80% 14%)' : 'hsl(240 12% 12%)',
                borderRadius: mine
                  ? '12px 12px 0 12px'
                  : '12px 12px 12px 0',
                padding: '6px 10px 8px',
                boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                position: 'relative',
              }}>
                <p style={{ margin: 0, fontSize: 14.5, color: 'hsl(0 0% 95%)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {msg.body}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <span style={{ fontSize: 11, color: 'hsl(240 5% 58%)' }}>
                    {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {mine && (
                    <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
                      <path d="M1 5.5L5 9.5L15 1.5" stroke="hsl(145 80% 55%)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M5 5.5L9 9.5" stroke="hsl(145 80% 55%)" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', background: 'hsl(240 12% 9%)', flexShrink: 0,
      }}>
        {/* Emoji icon */}
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'hsl(240 5% 58%)', display: 'flex', alignItems: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10" /><path d="M8 13s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" strokeLinecap="round" strokeWidth="2.5" />
            <line x1="15" y1="9" x2="15.01" y2="9" strokeLinecap="round" strokeWidth="2.5" />
          </svg>
        </button>

        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Message"
          maxLength={1000}
          disabled={sending}
          style={{
            flex: 1, border: 'none', borderRadius: 22,
            padding: '10px 16px', fontSize: 15, outline: 'none',
            background: 'hsl(240 12% 8%)', color: 'hsl(0 0% 93%)',
            fontFamily: 'inherit',
          }}
        />

        {input.trim() ? (
          <button
            onClick={send}
            disabled={sending}
            aria-label="Send"
            style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'hsl(145 80% 36%)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'hsl(145 80% 42%)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'hsl(145 80% 36%)'}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="hsl(0 0% 93%)" strokeWidth="2.2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── Widget root ──────────────────────────────────────────────────────────────
export default function ChatWidget({ currentUser }) {
  const [open, setOpen] = useState(false);
  const [players, setPlayers] = useState([]);
  const [partner, setPartner] = useState(null);
  const [unread, setUnread] = useState({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [search, setSearch] = useState('');

  const isLoggedIn = Boolean(currentUser?.id);

  const apiFetchRef = useRef(makeApiFetch(currentUser?.id));
  useEffect(() => {
    apiFetchRef.current = makeApiFetch(currentUser?.id);
  }, [currentUser?.id]);

  const apiFetch = useCallback((path, opts) => apiFetchRef.current(path, opts), []);

  // Presence ping
  useEffect(() => {
    if (!isLoggedIn) return;
    let debounceTimer = null;
    const ping = () => apiFetch('/api/presence/ping', { method: 'POST' }).catch(() => {});
    const onActivity = () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(ping, 500); };
    ping();
    const intervalId = setInterval(ping, 30000);
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'focus'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      clearTimeout(debounceTimer); clearInterval(intervalId);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [isLoggedIn, apiFetch]);

  // Poll online players
  useEffect(() => {
    if (!isLoggedIn) return;
    const load = () => apiFetch('/api/presence/online').then(setPlayers).catch(() => {});
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [isLoggedIn, apiFetch]);

  // Poll unread counts
  useEffect(() => {
    if (!isLoggedIn) return;
    const load = () =>
      apiFetch('/api/chat/unread')
        .then((counts) => {
          setUnread(counts);
          setTotalUnread(Object.values(counts).reduce((s, n) => s + n, 0));
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [isLoggedIn, apiFetch]);

  // Clear unread for current thread
  useEffect(() => {
    if (partner && unread[partner.id]) {
      setUnread((prev) => { const next = { ...prev }; delete next[partner.id]; return next; });
      setTotalUnread((n) => Math.max(0, n - (unread[partner.id] || 0)));
    }
  }, [partner]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoggedIn) return null;

  const onlineCount = players.filter((p) => !p.isMe).length;
  const filteredPlayers = players.filter((p) =>
    !p.isMe && p.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {/* Inline styles (scoped) */}
      <style>{`
        .cw-panel-wa {
          position: fixed;
          bottom: 100px;
          right: 20px;
          width: 360px;
          height: 580px;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4);
          z-index: 9999;
          font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
          animation: cw-slideup 0.2s ease;
        }
        @keyframes cw-slideup {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .cw-toggle-wa {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: hsl(145 80% 36%);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px hsl(145 80% 36% / 0.4);
          z-index: 9999;
          transition: transform 0.2s, background 0.2s;
        }
        .cw-toggle-wa:hover { background: hsl(145 80% 42%); transform: scale(1.06); }
        .cw-toggle-wa:active { transform: scale(0.95); }
        .cw-badge-wa {
          position: absolute;
          top: -4px;
          right: -4px;
          background: #FF3B30;
          color: #fff;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 700;
          min-width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 5px;
          border: 2px solid #fff;
        }
      `}</style>

      {/* Floating button */}
      <button
        className="cw-toggle-wa"
        onClick={() => { setOpen((o) => !o); if (!open) setPartner(null); }}
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="hsl(0 0% 93%)" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <>
            {/* Message bubble icon */}
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="hsl(0 0% 93%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            {totalUnread > 0 && (
              <span className="cw-badge-wa">{totalUnread}</span>
            )}
          </>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="cw-panel-wa">
          {partner ? (
            <Thread
              partner={partner}
              currentUserId={currentUser.id}
              onBack={() => setPartner(null)}
              apiFetch={apiFetch}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* WhatsApp-style header */}
              <div style={{
                background: 'hsl(240 12% 8%)',
                padding: '16px 16px 12px',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => window.history.back()}
                      aria-label="Go back"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'hsl(145 40% 60%)', padding: 4, display: 'flex', alignItems: 'center',
                        borderRadius: 6,
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                    <span style={{ color: 'hsl(0 0% 95%)', fontSize: 20, fontWeight: 700 }}>Players</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, color: 'hsl(145 40% 60%)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                </div>
                <div style={{
                  background: 'hsl(240 12% 11%)', borderRadius: 8,
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8DBBB6" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search or start new chat"
                    style={{
                      background: 'none', border: 'none', outline: 'none',
                      color: 'hsl(0 0% 90%)', fontSize: 14, width: '100%',
                      fontFamily: 'inherit',
                    }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(145 40% 55%)', padding: 0, display: 'flex', alignItems: 'center' }}
                      aria-label="Clear search"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Online status bar */}
              <div style={{
                background: 'hsl(145 80% 42%)', padding: '6px 16px',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'hsl(240 12% 8%)', display: 'inline-block' }} />
                <span style={{ color: 'hsl(0 0% 95%)', fontSize: 12, fontWeight: 500 }}>
                  {onlineCount} player{onlineCount !== 1 ? 's' : ''} online
                </span>
              </div>

              <ContactList
                players={filteredPlayers}
                onSelect={setPartner}
                unread={unread}
                search={search}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
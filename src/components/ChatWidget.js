import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import '../styles/ChatWidget.css';

const API = (path) => `/api${path}`;

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(API(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Online player list ───────────────────────────────────────────────────────
function OnlineList({ players, onSelect, unread }) {
  if (!players.length) {
    return (
      <div className="cw-empty">
        <span>No other players online right now.</span>
      </div>
    );
  }

  return (
    <ul className="cw-online-list">
      {players
        .filter((p) => !p.isMe)
        .map((p) => (
          <li key={p.id} className="cw-online-item" onClick={() => onSelect(p)}>
            <span className="cw-dot cw-dot--online" />
            <span className="cw-player-name">{p.username}</span>
            <span className="cw-player-wpm">{Math.round(p.wpm)} wpm</span>
            {unread[p.id] > 0 && (
              <span className="cw-unread-badge">{unread[p.id]}</span>
            )}
          </li>
        ))}
    </ul>
  );
}

// ── DM thread ────────────────────────────────────────────────────────────────
function Thread({ partner, currentUserId, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await apiFetch(`/chat/messages/${partner.id}`);
      setMessages(data);
    } catch (_) {}
  }, [partner.id]);

  useEffect(() => {
    loadMessages();
    const id = setInterval(loadMessages, 3000);
    return () => clearInterval(id);
  }, [loadMessages]);

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
    try {
      const msg = await apiFetch('/chat/messages', {
        method: 'POST',
        body: JSON.stringify({ recipientId: partner.id, body }),
      });
      setMessages((prev) => [...prev, msg]);
    } catch (_) {
      setInput(body); // restore on failure
    } finally {
      setSending(false);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="cw-thread">
      <div className="cw-thread-header">
        <button className="cw-back-btn" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <span className="cw-dot cw-dot--online" />
        <span className="cw-thread-name">{partner.username}</span>
      </div>

      <div className="cw-messages">
        {messages.length === 0 && (
          <div className="cw-empty">
            <span>Say hi to {partner.username}!</span>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`cw-msg ${msg.mine ? 'cw-msg--mine' : 'cw-msg--theirs'}`}
          >
            <span className="cw-msg-body">{msg.body}</span>
            <span className="cw-msg-time">
              {new Date(msg.sentAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="cw-composer">
        <input
          ref={inputRef}
          className="cw-input"
          placeholder={`Message ${partner.username}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          maxLength={1000}
          disabled={sending}
        />
        <button
          className="cw-send-btn"
          onClick={send}
          disabled={!input.trim() || sending}
          aria-label="Send"
        >
          ➤
        </button>
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

  const isLoggedIn = Boolean(currentUser?.id);

  // Presence ping — fires on mount, every 30s, and on any user activity
  useEffect(() => {
    if (!isLoggedIn) return;

    let debounceTimer = null;

    const ping = () => apiFetch('/presence/ping', { method: 'POST' }).catch(() => {});

    const onActivity = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(ping, 500); // debounce rapid events
    };

    // Ping immediately on mount
    ping();

    // Keepalive every 30s in case user is idle but still on the page
    const intervalId = setInterval(ping, 30000);

    // Ping on real user activity
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'focus'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    return () => {
      clearTimeout(debounceTimer);
      clearInterval(intervalId);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [isLoggedIn]);

  // Poll online players
  useEffect(() => {
    if (!isLoggedIn) return;
    const load = () =>
      apiFetch('/presence/online')
        .then(setPlayers)
        .catch(() => {});
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [isLoggedIn]);

  // Poll unread counts
  useEffect(() => {
    if (!isLoggedIn) return;
    const load = () =>
      apiFetch('/chat/unread')
        .then((counts) => {
          setUnread(counts);
          setTotalUnread(Object.values(counts).reduce((s, n) => s + n, 0));
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [isLoggedIn]);

  // Clear unread for current thread when it's open
  useEffect(() => {
    if (partner && unread[partner.id]) {
      setUnread((prev) => {
        const next = { ...prev };
        delete next[partner.id];
        return next;
      });
      setTotalUnread((n) => Math.max(0, n - (unread[partner.id] || 0)));
    }
  }, [partner]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoggedIn) return null;

  const onlineCount = players.filter((p) => !p.isMe).length;

  return (
    <div className={`cw-root ${open ? 'cw-root--open' : ''}`}>
      {/* Floating toggle button */}
      <button
        className="cw-toggle"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) setPartner(null);
        }}
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? (
          <span className="cw-toggle-icon">✕</span>
        ) : (
          <>
            <span className="cw-toggle-icon">💬</span>
            {totalUnread > 0 && (
              <span className="cw-toggle-badge">{totalUnread}</span>
            )}
          </>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="cw-panel">
          {partner ? (
            <Thread
              partner={partner}
              currentUserId={currentUser.id}
              onBack={() => setPartner(null)}
            />
          ) : (
            <>
              <div className="cw-panel-header">
                <span className="cw-panel-title">Players</span>
                <span className="cw-online-count">
                  <span className="cw-dot cw-dot--online" />
                  {onlineCount} online
                </span>
              </div>
              <OnlineList
                players={players}
                onSelect={setPartner}
                unread={unread}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
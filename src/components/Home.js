import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildHeaders } from '../utils/typingApi';
import { buildApiUrl } from '../utils/api';
import '../styles/Home.css';

const DEMO_SENTENCES = [
  "Speed is nothing without accuracy behind it.",
  "Good typing starts with relaxed hands and steady rhythm.",
  "Practice the keys you miss most and measure your progress.",
  "Clear digital skills create more opportunities at school and work.",
  "Accuracy first. Speed follows with deliberate practice.",
  "Your next lesson is one focused practice session away.",
];

function LiveTypingDemo() {
  const [displayed, setDisplayed] = useState('');
  const [charIndex, setCharIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [wpm, setWpm] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteDelayRef = useRef(null);

  const currentSentence = DEMO_SENTENCES[sentenceIndex];

  useEffect(() => {
    const speed = isDeleting ? 30 : 58;
    const timer = setTimeout(() => {
      if (!isDeleting) {
        if (charIndex < currentSentence.length) {
          setDisplayed(currentSentence.slice(0, charIndex + 1));
          setCharIndex(charIndex + 1);
          setWpm(Math.floor(60 + Math.random() * 40));
        } else {
          deleteDelayRef.current = window.setTimeout(() => {
            setIsDeleting(true);
            deleteDelayRef.current = null;
          }, 1600);
        }
      } else {
        if (displayed.length > 0) {
          setDisplayed((prev) => prev.slice(0, -1));
        } else {
          setIsDeleting(false);
          setCharIndex(0);
          setSentenceIndex((prev) => (prev + 1) % DEMO_SENTENCES.length);
        }
      }
    }, speed);
    return () => {
      clearTimeout(timer);
      if (deleteDelayRef.current) {
        clearTimeout(deleteDelayRef.current);
        deleteDelayRef.current = null;
      }
    };
  }, [charIndex, isDeleting, displayed, currentSentence]);

  return (
    <div className="demo-terminal">
      <div className="terminal-bar">
        <span className="dot dot-red" />
        <span className="dot dot-yellow" />
        <span className="dot dot-green" />
        <span className="terminal-label">TypeArena - Skills practice</span>
      </div>
      <div className="terminal-body">
        <div className="terminal-prompt">
          <span className="typed-text">{displayed}</span>
          <span className="cursor-blink">|</span>
        </div>
        <div className="terminal-stats">
          <span className="stat-badge"><span className="stat-val">{wpm}</span> WPM</span>
          <span className="stat-badge"><span className="stat-val">98</span>% ACC</span>
          <span className="stat-badge rank-badge">#1 <span className="stat-val">of 8</span></span>
        </div>
        <div className="progress-bar-wrap">
          <div
            className="progress-bar-fill"
            style={{ width: `${(displayed.length / currentSentence.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

const features = [
  {
    icon: '⚡',
    label: 'Structured learning',
    desc: 'Follow a clear pathway from keyboard foundations to practical computer skills.',
  },
  {
    icon: '🏆',
    label: 'Measurable progress',
    desc: 'Track WPM, accuracy, weak keys, lesson completion, and assessment results.',
  },
  {
    icon: '🌐',
    label: 'Job-ready practice',
    desc: 'Train for typing, data entry, office administration, customer support, and digital work.',
  },
  {
    icon: '🛡️',
    label: 'Verified evidence',
    desc: 'Create shareable assessment results and certificates that explain what was tested.',
  },
  {
    icon: '⏱️',
    label: 'Built for classrooms',
    desc: 'Teachers assign courses, monitor learners, and understand who needs support.',
  },
  {
    icon: '📊',
    label: 'Compete when ready',
    desc: 'Optional live races make practice motivating without replacing the learning pathway.',
  },
];

const isTabVisible = () =>
  typeof document === 'undefined' || document.visibilityState === 'visible';

// Polls a tiny endpoint, only while the tab is visible.
function useVisiblePolling(load, intervalMs, enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const tick = () => { if (isTabVisible()) load(); };
    const interval = window.setInterval(tick, intervalMs);
    const onVisible = () => { if (isTabVisible()) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs]);
}

function useLivePlayerCount(enabled = true) {
  const [count, setCount] = useState(null);

  const load = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/live-races/summary'));
      if (!response.ok) return;
      const data = await response.json();
      if (typeof data.players === 'number') setCount(data.players);
    } catch {
      // keep previous value on error
    }
  };

  useVisiblePolling(load, 60000, enabled);
  return count;
}

function usePublicStats() {
  const [stats, setStats] = useState({ registeredUsers: null, topWpm: null });

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/public-stats'));
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (active) {
          setStats({
            registeredUsers: typeof data.registeredUsers === 'number' ? data.registeredUsers : null,
            topWpm: typeof data.topWpm === 'number' ? data.topWpm : null,
          });
        }
      } catch {
        // Keep the previous snapshot if the network blips.
      }
    };

    load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 120000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return stats;
}

function useOnlinePresence(currentUser) {
  const [presence, setPresence] = useState({ count: 0, users: [] });
  const userId = currentUser?.id;

  const load = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/presence/summary'), {
        headers: buildHeaders(),
      });
      if (!response.ok) return;
      const data = await response.json();
      setPresence({
        count: Number(data.count) || 0,
        users: Array.isArray(data.users) ? data.users : [],
      });
    } catch {
      // keep previous snapshot on error
    }
  };

  useEffect(() => {
    if (!userId) setPresence({ count: 0, users: [] });
  }, [userId]);

  useVisiblePolling(load, 60000, Boolean(userId));
  return presence;
}

export default function Home({ currentUser }) {
  const heroRef = useRef(null);
  const liveCount = useLivePlayerCount(!currentUser?.id);
  const publicStats = usePublicStats();
  const presence = useOnlinePresence(currentUser);
  const visibleOnlineUsers = presence.users;
  const onlineCount = presence.count;
  const heroBadgeLabel = currentUser?.id
    ? `${onlineCount} online`
    : `${liveCount === null ? 'N/A' : liveCount} live now`;
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in-view'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('in-view');
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="home-container">
      {/* ── HERO ── */}
      <section className="hero" ref={heroRef}>
        <div className="hero-grid-lines" />
        <div className="hero-glow" />

        <div className="hero-inner">
          <div className="hero-text">
            <div className="hero-eyebrow reveal">Digital skills and typing school</div>
            <h1 className="hero-title reveal">
              Learn the skill.<br />
              <span className="accent">Prove</span> the progress.<br />
              Open the door.
            </h1>
            <p className="hero-sub reveal">
              Build keyboard fluency and practical computer skills with structured lessons,
              measurable progress, and reliable evidence of what you can do.
            </p>
            <div className="hero-pills reveal">
              <span className="pill">Learn step by step</span>
              <span className="pill">Verified results</span>
              <span className="pill">Built for classrooms</span>
            </div>
            <div className="hero-cta reveal">
              <Link to="/training" data-tour="home-start-typing" className="btn-primary-hero">Start learning -&gt;</Link>
              <Link to="/school" data-tour="home-browse-tournaments" className="btn-ghost-hero">For schools</Link>
            </div>
          </div>

          <div className="hero-demo reveal">
            <LiveTypingDemo />
            <div className="floating-badge badge-1">
              🔥 {heroBadgeLabel}
            </div>
            <div className="floating-badge badge-2">
              {currentUser?.id ? (
                visibleOnlineUsers.slice(0, 4).map((user) => (
                  <span key={user.id} title={user.username} className="hero-online-avatar">
                    {String(user.username || '?').slice(0, 1).toUpperCase()}
                  </span>
                ))
              ) : (
                <span className="hero-online-text">Sign in to see live presence</span>
              )}
              {currentUser?.id && onlineCount > 4 && (
                <span className="hero-online-more">+{onlineCount - 4}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section className="stats-strip reveal">
        <div className="stat-item">
          <span className="stat-number">
            {publicStats.registeredUsers === null ? '—' : publicStats.registeredUsers}
          </span>
          <span className="stat-desc">Registered typists</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-number">
            {publicStats.topWpm === null ? '—' : `${publicStats.topWpm} WPM`}
          </span>
          <span className="stat-desc">Current speed record</span>
        </div>
      </section>

      <section className="pathways-section reveal">
        <div className="section-header">
          <span className="section-tag">Choose your path</span>
          <h2>One platform.<br />Three useful outcomes.</h2>
        </div>
        <div className="pathways-grid">
          <Link className="pathway-card" to="/training">
            <span className="pathway-card__number">01</span>
            <h3>Learn</h3>
            <p>Follow guided lessons from keyboard foundations to practical digital work.</p>
            <span>Explore training -&gt;</span>
          </Link>
          <Link className="pathway-card" to="/school">
            <span className="pathway-card__number">02</span>
            <h3>Train a class</h3>
            <p>Give teachers a clear pathway for assigning courses and supporting learners.</p>
            <span>Explore schools -&gt;</span>
          </Link>
          <Link className="pathway-card" to="/certification">
            <span className="pathway-card__number">03</span>
            <h3>Prove skills</h3>
            <p>Complete verified assessments and share evidence with schools or employers.</p>
            <span>View certification -&gt;</span>
          </Link>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="features-section">
        <div className="section-header reveal">
          <span className="section-tag">How It Works</span>
          <h2>Built for learners,<br />teachers, and employers.</h2>
        </div>
        <div className="features-grid">
          {features.map((f, i) => (
            <div className="feature-card reveal" key={i} style={{ animationDelay: `${i * 80}ms` }}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.label}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta-section reveal">
        <div className="cta-glow" />
        <h2>Ready to build a useful skill?</h2>
        <p>Start with a focused lesson, see your progress, and move toward opportunities that value practical ability.</p>
        <div className="cta-buttons">
          <Link to="/training" className="btn-primary-hero">Start learning</Link>
          <Link to="/school" className="btn-ghost-hero">For schools</Link>
        </div>
      </section>
    </div>
  );
}

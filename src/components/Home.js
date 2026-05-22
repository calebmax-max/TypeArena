import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/Home.css';

const DEMO_TEXT = "The fastest typists don't just practice";

function LiveTypingDemo() {
  const [displayed, setDisplayed] = useState('');
  const [index, setIndex] = useState(0);
  const [wpm, setWpm] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const speed = isDeleting ? 40 : 60;
    const timer = setTimeout(() => {
      if (!isDeleting) {
        if (index < DEMO_TEXT.length) {
          setDisplayed(DEMO_TEXT.slice(0, index + 1));
          setIndex(index + 1);
          setWpm(Math.floor(60 + Math.random() * 40));
        } else {
          setTimeout(() => setIsDeleting(true), 1800);
        }
      } else {
        if (displayed.length > 0) {
          setDisplayed(displayed.slice(0, -1));
        } else {
          setIsDeleting(false);
          setIndex(0);
        }
      }
    }, speed);
    return () => clearTimeout(timer);
  }, [index, isDeleting, displayed]);

  return (
    <div className="demo-terminal">
      <div className="terminal-bar">
        <span className="dot dot-red" />
        <span className="dot dot-yellow" />
        <span className="dot dot-green" />
        <span className="terminal-label">TypeArena — Live Race</span>
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
            style={{ width: `${(displayed.length / DEMO_TEXT.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

const features = [
  {
    icon: '⚡',
    label: 'Real-Time Racing',
    desc: 'Sub-10ms precision engine. Every keystroke registered, every millisecond matters.',
  },
  {
    icon: '🏆',
    label: 'Cash Prizes',
    desc: 'Top performers earn real KES rewards direct to their M-Pesa wallet. No delays.',
  },
  {
    icon: '🌐',
    label: 'Live Tournaments',
    desc: 'Scheduled arenas with 2–128 players. Daily, weekly, and flash events.',
  },
  {
    icon: '🛡️',
    label: 'Fair Play',
    desc: 'Keystroke biometrics and AI anti-cheat keep the arena clean.',
  },
  {
    icon: '⏱️',
    label: 'Timed Modes',
    desc: '30s blitz, 60s sprint, 120s marathon. Find your distance.',
  },
  {
    icon: '📊',
    label: 'Deep Stats',
    desc: 'WPM curves, accuracy heatmaps, and head-to-head replays after every race.',
  },
];

export default function Home() {
  const heroRef = useRef(null);

  useEffect(() => {
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
            <div className="hero-eyebrow reveal">Competitive Typing Platform</div>
            <h1 className="hero-title reveal">
              Type Fast.<br />
              <span className="accent">Win Real</span><br />
              Money.
            </h1>
            <p className="hero-sub reveal">
              Enter paid typing tournaments, race live opponents,
              and withdraw KES winnings straight to M-Pesa.
            </p>
            <div className="hero-pills reveal">
              <span className="pill">1v1 Live Races</span>
              <span className="pill">Private Rooms</span>
              <span className="pill">KES Wallet</span>
              <span className="pill">Daily Tourneys</span>
            </div>
            <div className="hero-cta reveal">
              <Link to="/play" className="btn-primary-hero">Start Typing →</Link>
              <Link to="/tournaments" className="btn-ghost-hero">Browse Tournaments</Link>
            </div>
          </div>

          <div className="hero-demo reveal">
            <LiveTypingDemo />
            <div className="floating-badge badge-1">🔥 142 live now</div>
            <div className="floating-badge badge-2">💰 KES 48,000 in prizes</div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section className="stats-strip reveal">
        <div className="stat-item">
          <span className="stat-number">24k+</span>
          <span className="stat-desc">Registered typists</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-number">KES 2M</span>
          <span className="stat-desc">Total prizes paid out</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-number">98ms</span>
          <span className="stat-desc">Avg. sync latency</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-number">187 WPM</span>
          <span className="stat-desc">Current speed record</span>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="features-section">
        <div className="section-header reveal">
          <span className="section-tag">How It Works</span>
          <h2>Built for competitors,<br />not casual clickers.</h2>
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
        <h2>Ready to prove your speed?</h2>
        <p>Thousands of typists compete for real prizes every day. Your first race starts in seconds.</p>
        <div className="cta-buttons">
          <Link to="/play" className="btn-primary-hero">Enter the Arena</Link>
          <Link to="/tournaments" className="btn-ghost-hero">View Schedule</Link>
        </div>
      </section>
    </div>
  );
}
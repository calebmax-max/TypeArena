import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/Home.css';

export default function Home() {
  return (
    <div className="home-container">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>⚡ The Ultimate Typing Arena</h1>
          <p className="hero-subtitle">Enter paid typing tournaments, compete against the fastest typists, and win real cash prizes.</p>
          <p className="hero-stats">
            <span></span> • 
            <span></span> • 
            <span></span>
          </p>
          <div className="hero-buttons">
            <Link to="/play" className="btn btn-primary btn-lg">Start Typing</Link>
            <Link to="/tournaments" className="btn btn-outline-primary btn-lg">View Tournaments</Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="how-it-works">
        <h2>How It Works</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🏎️</div>
            <h3>Real-Time Typing</h3>
            <p>Race against others with our precision typing engine.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💰</div>
            <h3>Win Prizes</h3>
            <p>Top performers earn real rewards from the prize pool.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🏆</div>
            <h3>Live Tournaments</h3>
            <p>Compete in scheduled tournaments with global players.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🛡️</div>
            <h3>Fair Play</h3>
            <p>Anti-cheat systems ensure every competition is fair.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⏱️</div>
            <h3>Timed Challenges</h3>
            <p>30s, 60s, or 120s — pick your battle duration.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Instant Results</h3>
            <p>Real-time WPM and accuracy tracking as you type.</p>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="cta-section">
        <h2>Ready to prove your speed?</h2>
        <p>Join thousands of typists competing for real prizes every day.</p>
        <Link to="/tournaments" className="btn btn-primary btn-lg">Enter the Arena</Link>
      </section>
    </div>
  );
}

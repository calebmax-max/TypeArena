import React from 'react';
import { useParams, Link } from 'react-router-dom';
import '../styles/Results.css';

export default function Results() {
  const { raceId } = useParams();

  // Mock race result data
  const mockResult = {
    id: raceId,
    wpm: 142,
    netWPM: 138,
    accuracy: 96.2,
    duration: 60,
    place: 2,
    earnings: 750,
    competitors: 47,
    timestamp: new Date(),
  };

  return (
    <div className="results-container">
      <div className="results-header">
        <h1>🏁 Race Results</h1>
      </div>

      <div className="results-content">
        <div className="main-stats">
          <div className="stat-card large">
            <label>Place</label>
            <span className="result-value">{mockResult.place} / {mockResult.competitors}</span>
          </div>
          <div className="stat-card large">
            <label>WPM</label>
            <span className="result-value">{mockResult.wpm}</span>
          </div>
          <div className="stat-card large">
            <label>Accuracy</label>
            <span className="result-value">{mockResult.accuracy.toFixed(1)}%</span>
          </div>
          <div className="stat-card large">
            <label>Earnings</label>
            <span className="result-value earnings">+KES {mockResult.earnings}</span>
          </div>
        </div>

        <div className="stats-details">
          <div className="stat-detail">
            <span className="label">Net WPM:</span>
            <span className="value">{mockResult.netWPM}</span>
          </div>
          <div className="stat-detail">
            <span className="label">Duration:</span>
            <span className="value">{mockResult.duration} seconds</span>
          </div>
          <div className="stat-detail">
            <span className="label">Competitors:</span>
            <span className="value">{mockResult.competitors}</span>
          </div>
          <div className="stat-detail">
            <span className="label">Time:</span>
            <span className="value">{mockResult.timestamp.toLocaleString()}</span>
          </div>
        </div>

        <div className="action-buttons">
          <Link to="/play" className="btn btn-primary">
            Race Again
          </Link>
          <Link to="/leaderboard" className="btn btn-secondary">
            View Leaderboard
          </Link>
          <Link to="/" className="btn btn-outline-secondary">
            Back Home
          </Link>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { useParams, Link } from 'react-router-dom';
import '../styles/Results.css';

const LATEST_RACE_RESULT_KEY = 'typearena_latest_race_result';

export default function Results() {
  const { raceId } = useParams();

  const storedResult = (() => {
    try {
      const raw = sessionStorage.getItem(LATEST_RACE_RESULT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  })();

  const result = storedResult?.id === raceId ? storedResult : null;

  if (!result) {
    return (
      <div className="results-container">
        <div className="results-header">
          <h1>Race Results</h1>
        </div>

        <div className="results-content">
          <p>No saved result was found for this race yet.</p>
          <div className="action-buttons">
            <Link to="/play" className="btn btn-primary">
              Start a Race
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

  return (
    <div className="results-container">
      <div className="results-header">
        <h1>Race Results</h1>
      </div>

      <div className="results-content">
        <div className="main-stats">
          <div className="stat-card large">
            <label>Race ID</label>
            <span className="result-value">{result.id}</span>
          </div>
          <div className="stat-card large">
            <label>WPM</label>
            <span className="result-value">{Number(result.wpm || 0).toFixed(1)}</span>
          </div>
          <div className="stat-card large">
            <label>Accuracy</label>
            <span className="result-value">{Number(result.accuracy || 0).toFixed(1)}%</span>
          </div>
          <div className="stat-card large">
            <label>Winner Prize</label>
            <span className="result-value earnings">KES {Number(result.winnerPrize || 0).toLocaleString()}</span>
          </div>
        </div>

        <div className="stats-details">
          <div className="stat-detail">
            <span className="label">Net WPM:</span>
            <span className="value">{Number(result.netWPM || 0).toFixed(1)}</span>
          </div>
          <div className="stat-detail">
            <span className="label">Duration:</span>
            <span className="value">{result.duration} seconds</span>
          </div>
          <div className="stat-detail">
            <span className="label">Mode:</span>
            <span className="value">{result.mode}</span>
          </div>
          <div className="stat-detail">
            <span className="label">Time:</span>
            <span className="value">{new Date(result.completedAt).toLocaleString()}</span>
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

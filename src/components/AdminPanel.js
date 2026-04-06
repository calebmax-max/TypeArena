import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminCreateTournament,
  adminLogout,
  fetchAdminAnalytics,
  fetchAdminAiSettings,
  fetchTournaments,
  getAdminToken,
  updateAdminAiSettings,
} from '../utils/typingApi';
import '../styles/AdminPanel.css';

export default function AdminPanel() {
  const [token, setToken] = useState(getAdminToken());
  const [formData, setFormData] = useState({
    name: '',
    entryFee: '',
    status: 'upcoming',
    image: '??',
  });
  const [notice, setNotice] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [aiSettings, setAiSettings] = useState({ provider: 'auto', model: 'gpt-5.2', hasApiKey: false });

  const loadAdminData = async () => {
    const [analyticsData, tournamentData, aiSettingsData] = await Promise.all([
      fetchAdminAnalytics(),
      fetchTournaments(),
      fetchAdminAiSettings(),
    ]);
    setAnalytics(analyticsData);
    setTournaments(tournamentData);
    setAiSettings(aiSettingsData);
  };

  useEffect(() => {
    if (token) {
      loadAdminData();
    }
  }, [token]);

  const handleCreateTournament = async (event) => {
    event.preventDefault();
    try {
      const entryFee = Number(formData.entryFee || 0);
      const payload = {
        ...formData,
        description: '',
        entryFee,
        prizePool: entryFee * 2,
        maxParticipants: 2,
        duration: '5d',
      };
      const result = await adminCreateTournament(payload);
      setNotice(result.message || 'Tournament created.');
      setFormData({
        name: '',
        entryFee: '',
        status: 'upcoming',
        image: '??',
      });
      loadAdminData();
    } catch (error) {
      setNotice(error.message || 'Could not create tournament.');
    }
  };

  const handleSignOut = () => {
    adminLogout();
    setToken(null);
    setNotice('Admin signed out.');
  };

  const handleAiSettingsSave = async (event) => {
    event.preventDefault();
    try {
      const result = await updateAdminAiSettings({
        provider: aiSettings.provider,
        model: aiSettings.model,
      });
      setAiSettings(result.settings || aiSettings);
      setNotice(result.message || 'AI settings updated.');
    } catch (error) {
      setNotice(error.message || 'Could not update AI settings.');
    }
  };

  const entryFee = Number(formData.entryFee || 0);
  const winnerAmount = entryFee * 2 * 0.75;

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Premium Admin Control</h1>
        <p>Track revenue, payouts, live player health, and tournament creation.</p>
      </div>

      {notice && <div className="admin-notice">{notice}</div>}

      {!token ? (
        <div className="admin-card admin-form">
          <h2>Restricted Area</h2>
          <p>Admin access is hidden from public navigation. Sign in with the admin email from the main profile page.</p>
          <Link to="/profile" className="btn btn-primary">Go To Sign In</Link>
        </div>
      ) : (
        <>
          <div className="admin-actions">
            <button className="btn btn-outline-primary" onClick={handleSignOut}>Sign Out Admin</button>
          </div>

          {analytics && (
            <>
              <div className="admin-grid admin-grid--analytics">
                <div className="admin-card metric-card"><span>Revenue Today</span><strong>KES {Number(analytics.revenueToday || 0).toLocaleString()}</strong></div>
                <div className="admin-card metric-card"><span>Tournament Entries</span><strong>{analytics.tournamentEntries || 0}</strong></div>
                <div className="admin-card metric-card"><span>Total Payouts</span><strong>KES {Number(analytics.totalPayouts || 0).toLocaleString()}</strong></div>
                <div className="admin-card metric-card"><span>Active Players</span><strong>{analytics.activePlayers || 0}</strong></div>
                <div className="admin-card metric-card"><span>M-Pesa Transactions</span><strong>{analytics.mpesaTransactions || 0}</strong></div>
                <div className="admin-card metric-card"><span>M-Pesa Volume</span><strong>KES {Number(analytics.mpesaVolume || 0).toLocaleString()}</strong></div>
              </div>
              <div className="admin-grid admin-grid--analytics">
                <div className="admin-card metric-card"><span>DAU</span><strong>{analytics.dailyActiveUsers || 0}</strong></div>
                <div className="admin-card metric-card"><span>Retention</span><strong>{Math.round(Number(analytics.retention || 0) * 100)}%</strong></div>
                <div className="admin-card metric-card"><span>Avg Tournament Size</span><strong>{Number(analytics.averageTournamentSize || 0).toFixed(1)}</strong></div>
                <div className="admin-card metric-card"><span>ARPU</span><strong>KES {Number(analytics.arpu || 0).toLocaleString()}</strong></div>
                <div className="admin-card metric-card"><span>Payout Ratio</span><strong>{Math.round(Number(analytics.payoutRatio || 0) * 100)}%</strong></div>
                <div className="admin-card metric-card"><span>Referral Conversion</span><strong>{Math.round(Number(analytics.referralConversion || 0) * 100)}%</strong></div>
                <div className="admin-card metric-card"><span>Churn</span><strong>{Math.round(Number(analytics.churn || 0) * 100)}%</strong></div>
                <div className="admin-card metric-card"><span>CAC</span><strong>KES {Number(analytics.cac || 0).toLocaleString()}</strong></div>
              </div>
            </>
          )}

          <form className="admin-card admin-form" onSubmit={handleCreateTournament}>
            <h2>Create Tournament</h2>
            <p className="admin-form-note">Winner receives KES {winnerAmount.toLocaleString()}.</p>
            <input
              type="text"
              placeholder="Tournament Name"
              value={formData.name}
              onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <div className="admin-grid">
              <input
                type="number"
                min="0"
                placeholder="Price Per Player"
                value={formData.entryFee}
                onChange={(event) => setFormData((prev) => ({ ...prev, entryFee: event.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="Emoji/Icon"
                value={formData.image}
                onChange={(event) => setFormData((prev) => ({ ...prev, image: event.target.value }))}
              />
              <select
                value={formData.status}
                onChange={(event) => setFormData((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="upcoming">Upcoming</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className="admin-summary">
              <span>Two-player stake: KES {(entryFee * 2).toLocaleString()}</span>
              <span>Winner wallet credit: KES {winnerAmount.toLocaleString()}</span>
            </div>
            <button type="submit" className="btn btn-primary">Create Tournament</button>
          </form>

          <form className="admin-card admin-form" onSubmit={handleAiSettingsSave}>
            <h2>AI Content Settings</h2>
            <p className="admin-form-note">
              API key configured: {aiSettings.hasApiKey ? 'Yes' : 'No'}.
            </p>
            <div className="admin-grid">
              <select
                value={aiSettings.provider}
                onChange={(event) => setAiSettings((prev) => ({ ...prev, provider: event.target.value }))}
              >
                <option value="auto">Auto</option>
                <option value="openai">OpenAI</option>
                <option value="local">Local Fallback</option>
              </select>
              <input
                type="text"
                value={aiSettings.model}
                onChange={(event) => setAiSettings((prev) => ({ ...prev, model: event.target.value }))}
                placeholder="Model name"
              />
            </div>
            <button type="submit" className="btn btn-outline-primary">Save AI Settings</button>
          </form>

          <div className="admin-card">
            <h2>Top Players</h2>
            <div className="admin-list">
              {(analytics?.topPlayers || []).map((player) => (
                <div key={player.username} className="admin-list-item">
                  <strong>{player.username}</strong>
                  <span>{player.wpm} WPM • {player.wins} wins</span>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-card">
            <h2>Existing Tournaments</h2>
            <div className="admin-list">
              {tournaments.map((tournament) => (
                <div key={tournament.id} className="admin-list-item">
                  <strong>{tournament.name}</strong>
                  <span>Price KES {Number(tournament.entryFee || 0).toLocaleString()}</span>
                  <span>Winner gets KES {Number(tournament.winnerPrize || 0).toLocaleString()}</span>
                  <span>{tournament.status}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

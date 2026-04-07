import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addFundsToWallet,
  adminLogin,
  fetchCurrentUser,
  fetchRaceHistory,
  fetchWalletConfig,
  fetchWalletHistory,
  loginUser,
  signupUser,
  verifyWalletTopupSession,
  withdrawFundsToWallet,
} from '../utils/typingApi';
import '../styles/TypeProfile.css';

const formatMethodLabel = (method) => method.replace(/_/g, ' ');
const EQUIPPED_LABELS = {
  avatar: 'Avatar',
  theme: 'Theme',
  skin: 'Keyboard Skin',
  badge: 'Badge',
  effect: 'Effect',
  frame: 'Profile Frame',
};

export default function TypeProfile() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: '',
    phoneNumber: '',
  });
  const [raceHistory, setRaceHistory] = useState([]);
  const [walletHistory, setWalletHistory] = useState([]);
  const [walletConfig, setWalletConfig] = useState({ topUpMethods: [], withdrawMethods: [] });
  const [loading, setLoading] = useState(true);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpAccount, setTopUpAccount] = useState('');
  const [topUpMethod, setTopUpMethod] = useState('stripe_checkout');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAccount, setWithdrawAccount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('paypal');
  const [walletNotice, setWalletNotice] = useState('');
  const [authNotice, setAuthNotice] = useState('');

  const loadProfile = async () => {
    const [user, walletConfigData] = await Promise.all([fetchCurrentUser(), fetchWalletConfig()]);
    setWalletConfig(walletConfigData || { topUpMethods: [], withdrawMethods: [] });
    setCurrentUser(user);
    if (user?.id) {
      const [history, wallet] = await Promise.all([
        fetchRaceHistory(user.id),
        fetchWalletHistory(),
      ]);
      setRaceHistory(history);
      setWalletHistory(wallet.items || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    const needsTopUp = params.get('topup') === '1';

    if (redirect && !currentUser) {
      setShowAuthForm(true);
      setAuthMode('login');
      setAuthNotice('Sign in to continue joining your private room.');
    }

    if (needsTopUp) {
      setWalletNotice('Add enough funds to your wallet, then return to your private room invite.');
    }
  }, [currentUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutState = params.get('checkout');
    const sessionId = params.get('session_id');

    if (checkoutState === 'cancel') {
      setWalletNotice('Hosted checkout was canceled before payment completed.');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (checkoutState === 'success' && sessionId && currentUser?.id) {
      verifyWalletTopupSession(sessionId)
        .then(async (result) => {
          setWalletNotice(result.message || 'Wallet top-up verified.');
          await loadProfile();
        })
        .catch((error) => {
          setWalletNotice(error.message || 'Could not verify the hosted checkout yet.');
        })
        .finally(() => {
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.phoneNumber) {
      setTopUpAccount(currentUser.phoneNumber);
      setWithdrawAccount(currentUser.phoneNumber);
    } else if (currentUser?.email) {
      setTopUpAccount(currentUser.email);
      setWithdrawAccount(currentUser.email);
    }
  }, [currentUser]);

  useEffect(() => {
    if (walletConfig.topUpMethods?.length) {
      setTopUpMethod((current) => (walletConfig.topUpMethods.includes(current) ? current : walletConfig.topUpMethods[0]));
    }
    if (walletConfig.withdrawMethods?.length) {
      setWithdrawMethod((current) => (walletConfig.withdrawMethods.includes(current) ? current : walletConfig.withdrawMethods[0]));
    }
  }, [walletConfig]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    try {
      if (authMode === 'login') {
        try {
          const adminResult = await adminLogin(formData.email, formData.password);
          if (adminResult?.token) {
            setAuthNotice('');
            setFormData({ email: '', password: '', username: '', phoneNumber: '' });
            navigate('/admin');
            return;
          }
        } catch (adminError) {
          // Fall through to regular player login when admin auth does not match.
        }
      }

      const user =
        authMode === 'login'
          ? await loginUser(formData.email, formData.password)
          : await signupUser(formData.username, formData.email, formData.password, formData.phoneNumber);
      setCurrentUser(user);
      setShowAuthForm(false);
      setFormData({ email: '', password: '', username: '', phoneNumber: '' });
      setAuthNotice('');
      await loadProfile();
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect');
      if (redirect) {
        navigate(redirect);
        return;
      }
    } catch (error) {
      setAuthNotice(error.message || 'Authentication failed.');
    }
  };

  const handleAddFunds = async (event) => {
    event.preventDefault();
    try {
      const result = await addFundsToWallet(
        topUpAmount,
        topUpAccount,
        topUpMethod,
        topUpMethod === 'mpesa' ? 'KES' : 'USD'
      );
      if (result?.checkoutUrl) {
        setWalletNotice(result.message || 'Redirecting to secure checkout...');
        window.location.href = result.checkoutUrl;
        return;
      }
      setWalletNotice(result.message || 'Top-up completed.');
      setTopUpAmount('');
      await loadProfile();
    } catch (error) {
      setWalletNotice(error.message || 'Top-up failed.');
    }
  };

  const handleWithdraw = async (event) => {
    event.preventDefault();
    try {
      const result = await withdrawFundsToWallet(
        withdrawAmount,
        withdrawAccount,
        withdrawMethod,
        withdrawMethod === 'mpesa' ? 'KES' : 'USD'
      );
      setWalletNotice(result.message || 'Withdrawal completed.');
      setWithdrawAmount('');
      await loadProfile();
    } catch (error) {
      setWalletNotice(error.message || 'Withdrawal failed.');
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('typearena_user');
    setCurrentUser(null);
  };

  if (loading) {
    return <div className="profile-container">Loading profile...</div>;
  }

  if (!currentUser) {
    return (
      <div className="profile-container">
        <div className="auth-section">
          <h1>Premium Player Profile</h1>
          {!showAuthForm ? (
            <div className="auth-buttons">
              <button className="btn btn-primary btn-lg" onClick={() => { setAuthMode('login'); setShowAuthForm(true); }}>
                Sign In
              </button>
              <button className="btn btn-secondary btn-lg" onClick={() => { setAuthMode('signup'); setShowAuthForm(true); }}>
                Create Account
              </button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <h2>{authMode === 'login' ? 'Sign In' : 'Create Account'}</h2>
              {authNotice && <p className="auth-notice">{authNotice}</p>}
              {authMode === 'signup' && (
                <>
                  <input
                    name="username"
                    placeholder="Username"
                    value={formData.username}
                    onChange={(event) => setFormData((prev) => ({ ...prev, username: event.target.value }))}
                    required
                  />
                  <input
                    name="phoneNumber"
                    placeholder="Phone number or payout handle"
                    value={formData.phoneNumber}
                    onChange={(event) => setFormData((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                  />
                </>
              )}
              <input
                name="email"
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
              <input
                name="password"
                type="password"
                placeholder="Password"
                value={formData.password}
                onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
                required
              />
              <button type="submit" className="btn btn-primary">
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
              <button
                type="button"
                className="btn btn-link"
                onClick={() => setAuthMode((prev) => (prev === 'login' ? 'signup' : 'login'))}
              >
                {authMode === 'login' ? 'Need an account?' : 'Already registered?'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>{currentUser.username}</h1>
        <button className="btn btn-danger" onClick={handleSignOut}>Sign Out</button>
      </div>

      <div className="profile-grid">
        <div className="profile-card stats-card">
          <h2>{currentUser.tier} Tier</h2>
          <p className="welcome-message">
            {currentUser.premium ? 'Premium member active.' : 'Upgrade-ready competitor.'}
          </p>
          <p className="email">{currentUser.email}</p>

          <div className="stats-grid">
            <div className="stat-box"><label>WPM</label><span className="stat-value">{currentUser.wpm}</span></div>
            <div className="stat-box"><label>Accuracy</label><span className="stat-value">{Number(currentUser.accuracy || 0).toFixed(1)}%</span></div>
            <div className="stat-box"><label>Season</label><span className="stat-value">{currentUser.seasonPoints}</span></div>
            <div className="stat-box"><label>Wins</label><span className="stat-value">{currentUser.wins}</span></div>
            <div className="stat-box"><label>Balance</label><span className="stat-value earnings">KES {Number(currentUser.balance || 0).toLocaleString()}</span></div>
          </div>

          <div className="coach-card">
            <h3>AI Coach</h3>
            <p>{currentUser.aiCoachTip}</p>
          </div>

          <div className="equipped-card">
            <h3>Equipped Items</h3>
            <div className="equipped-grid">
              {Object.entries(EQUIPPED_LABELS).map(([key, label]) => (
                <div key={key} className="equipped-item">
                  <span>{label}</span>
                  <strong>{currentUser?.equippedItems?.[key] || 'None equipped'}</strong>
                </div>
              ))}
            </div>
          </div>

          <form className="wallet-topup" onSubmit={handleAddFunds}>
            <h3>Wallet Top-Up</h3>
            <div className="wallet-row">
              <select value={topUpMethod} onChange={(e) => setTopUpMethod(e.target.value)} disabled={!walletConfig.topUpMethods?.length}>
                {walletConfig.topUpMethods.map((method) => (
                  <option key={method} value={method}>{formatMethodLabel(method)}</option>
                ))}
              </select>
              <input value={topUpAccount} onChange={(e) => setTopUpAccount(e.target.value)} placeholder="Email, phone, or account ID" required />
              <input value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} placeholder="Amount" type="number" min="1" required />
              <button type="submit" className="btn btn-primary" disabled={!walletConfig.topUpMethods?.length}>Add Funds</button>
            </div>
          </form>

          <form className="wallet-topup" onSubmit={handleWithdraw}>
            <h3>Withdraw Winnings</h3>
            <div className="wallet-row">
              <select value={withdrawMethod} onChange={(e) => setWithdrawMethod(e.target.value)} disabled={!walletConfig.withdrawMethods?.length}>
                {walletConfig.withdrawMethods.map((method) => (
                  <option key={method} value={method}>{formatMethodLabel(method)}</option>
                ))}
              </select>
              <input value={withdrawAccount} onChange={(e) => setWithdrawAccount(e.target.value)} placeholder="PayPal email, phone, or bank ref" required />
              <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="Withdraw amount" type="number" min="1" required />
              <button type="submit" className="btn btn-outline-primary" disabled={!walletConfig.withdrawMethods?.length}>Withdraw</button>
            </div>
            {walletNotice && <p className="wallet-notice">{walletNotice}</p>}
          </form>
        </div>

        <div className="profile-card races-card">
          <h3>Recent Races</h3>
          <div className="race-list">
            {raceHistory.slice(0, 5).map((race) => (
              <div key={race.id} className="race-item">
                <div className="race-info">
                  <span className="race-wpm">{race.wpm} WPM</span>
                  <span className="race-accuracy">{race.accuracy}% Accuracy</span>
                </div>
                <div className="race-result">
                  <span className={`place place-${race.place}`}>#{race.place}</span>
                  <span className="earnings">+KES {Number(race.earnings || 0).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>

          <h3 className="wallet-history-title">Wallet Activity</h3>
          <div className="wallet-history">
            {walletHistory.slice(0, 6).map((item) => (
              <div key={item.code} className="wallet-history__item">
                <span>{item.type}</span>
                <strong>KES {Number(item.amount || 0).toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

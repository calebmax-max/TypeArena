import React, { useEffect, useState, useCallback } from 'react';
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

const USER_CHANGE_EVENT = 'typearena-user-changed';

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

  const [walletConfig, setWalletConfig] = useState({
    topUpMethods: [],
    withdrawMethods: [],
  });

  const [loading, setLoading] = useState(true);

  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpAccount, setTopUpAccount] = useState('');
  const [topUpMethod, setTopUpMethod] = useState('stripe_checkout');

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAccount, setWithdrawAccount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('paypal');

  const [walletNotice, setWalletNotice] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const simulatedPaymentsEnabled = Boolean(
    walletConfig.simulatedPaymentsEnabled
  );

  const loadWalletConfig = useCallback(async () => {
    const walletConfigData = await fetchWalletConfig();

    const normalizedConfig = walletConfigData || {
      topUpMethods: [],
      withdrawMethods: [],
    };

    setWalletConfig(normalizedConfig);

    return normalizedConfig;
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const [user, walletConfigData] = await Promise.all([
        fetchCurrentUser(),
        loadWalletConfig(),
      ]);

      setWalletConfig(
        walletConfigData || {
          topUpMethods: [],
          withdrawMethods: [],
        }
      );

      setCurrentUser(user);

      if (user?.id) {
        const [history, wallet] = await Promise.all([
          fetchRaceHistory(user.id),
          fetchWalletHistory(),
        ]);

        setRaceHistory(history || []);
        setWalletHistory(wallet?.items || []);
      } else {
        setRaceHistory([]);
        setWalletHistory([]);
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  }, [loadWalletConfig]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const redirect = params.get('redirect');
    const needsTopUp = params.get('topup') === '1';

    if (redirect && !currentUser) {
      setShowAuthForm(true);
      setAuthMode('login');
      setAuthNotice(
        'Sign in to continue joining your private room.'
      );
    }

    if (needsTopUp) {
      setWalletNotice(
        'Add enough funds to your wallet, then return to your private room invite.'
      );
    }
  }, [currentUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const checkoutState = params.get('checkout');
    const sessionId = params.get('session_id');

    if (checkoutState === 'cancel') {
      setWalletNotice(
        'Hosted checkout was canceled before payment completed.'
      );

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

      return;
    }

    if (
      checkoutState === 'success' &&
      sessionId &&
      currentUser?.id
    ) {
      verifyWalletTopupSession(sessionId)
        .then(async (result) => {
          setWalletNotice(
            result.message || 'Wallet top-up verified.'
          );

          await loadProfile();
        })
        .catch((error) => {
          setWalletNotice(
            error.message ||
              'Could not verify the hosted checkout yet.'
          );
        })
        .finally(() => {
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
        });
    }
  }, [currentUser?.id, loadProfile]);

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
      setTopUpMethod((current) =>
        walletConfig.topUpMethods.includes(current)
          ? current
          : walletConfig.topUpMethods[0]
      );
    }

    if (walletConfig.withdrawMethods?.length) {
      setWithdrawMethod((current) =>
        walletConfig.withdrawMethods.includes(current)
          ? current
          : walletConfig.withdrawMethods[0]
      );
    }
  }, [walletConfig]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();

    try {
      if (authMode === 'login') {
        try {
          const adminResult = await adminLogin(
            formData.email,
            formData.password
          );

          if (adminResult?.token) {
            setAuthNotice('');

            setFormData({
              email: '',
              password: '',
              username: '',
              phoneNumber: '',
            });

            navigate('/admin');

            return;
          }
        } catch (adminError) {
          console.log('Not admin login');
        }
      }

      const user =
        authMode === 'login'
          ? await loginUser(
              formData.email,
              formData.password
            )
          : await signupUser(
              formData.username,
              formData.email,
              formData.password,
              formData.phoneNumber
            );

      window.dispatchEvent(
        new Event(USER_CHANGE_EVENT)
      );

      setCurrentUser(user);
      setShowAuthForm(false);

      setFormData({
        email: '',
        password: '',
        username: '',
        phoneNumber: '',
      });

      setAuthNotice('');

      await loadProfile();

      const params = new URLSearchParams(
        window.location.search
      );

      const redirect = params.get('redirect');

      if (redirect) {
        navigate(redirect);
      }
    } catch (error) {
      setAuthNotice(
        error.message || 'Authentication failed.'
      );
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
        setWalletNotice(
          result.message ||
            'Redirecting to secure checkout...'
        );

        window.location.href = result.checkoutUrl;

        return;
      }

      setWalletNotice(
        result.message || 'Top-up completed.'
      );

      setTopUpAmount('');

      await loadProfile();
    } catch (error) {
      setWalletNotice(
        error.message || 'Top-up failed.'
      );
    }
  };

  const handleWithdraw = async (event) => {
    event.preventDefault();

    try {
      const latestWalletConfig =
        await loadWalletConfig();

      if (!latestWalletConfig.withdrawMethods?.length) {
        setWalletNotice(
          'Withdrawal is not enabled yet.'
        );

        return;
      }

      const activeWithdrawMethod =
        latestWalletConfig.withdrawMethods.includes(
          withdrawMethod
        )
          ? withdrawMethod
          : latestWalletConfig.withdrawMethods[0];

      setWithdrawMethod(activeWithdrawMethod);

      const result = await withdrawFundsToWallet(
        withdrawAmount,
        withdrawAccount,
        activeWithdrawMethod,
        activeWithdrawMethod === 'mpesa'
          ? 'KES'
          : 'USD'
      );

      setWalletNotice(
        result.message || 'Withdrawal completed.'
      );

      setWithdrawAmount('');

      await loadProfile();
    } catch (error) {
      setWalletNotice(
        error.message || 'Withdrawal failed.'
      );
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('typearena_user');

    window.dispatchEvent(
      new Event(USER_CHANGE_EVENT)
    );

    setCurrentUser(null);
  };

  const openAuthForm = (mode) => {
    setAuthMode(mode);
    setShowAuthForm(true);
    setAuthNotice('');
  };

  if (loading) {
    return (
      <div className="profile-container">
        Loading profile...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="profile-container">
        <section className="auth-section">
          <h1>Profile</h1>

          {!showAuthForm ? (
            <div className="auth-buttons">
              <button
                className="btn btn-primary btn-lg"
                onClick={() => openAuthForm('login')}
              >
                Sign In
              </button>

              <button
                className="btn btn-outline-light btn-lg"
                onClick={() => openAuthForm('signup')}
              >
                Create Account
              </button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <h2>{authMode === 'login' ? 'Sign In' : 'Create Account'}</h2>

              {authMode === 'signup' ? (
                <input
                  type="text"
                  placeholder="Username"
                  value={formData.username}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                  required
                />
              ) : null}

              <input
                type="email"
                placeholder="Email address"
                value={formData.email}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                required
              />

              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={formData.password}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? 'Hide password' : 'Show password'}
              </button>

              {authMode === 'signup' ? (
                <input
                  type="tel"
                  placeholder="Phone number"
                  value={formData.phoneNumber}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      phoneNumber: event.target.value,
                    }))
                  }
                />
              ) : null}

              {authNotice ? (
                <p className="auth-notice">{authNotice}</p>
              ) : null}

              <button type="submit" className="btn btn-primary">
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>

              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowAuthForm(false)}
              >
                Back
              </button>
            </form>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>{currentUser?.username}</h1>

        <button
          className="btn btn-danger"
          onClick={handleSignOut}
        >
          Sign Out
        </button>
      </div>

      <div className="profile-grid">
        <div className="profile-card stats-card">
          <h2>{currentUser?.tier} Tier</h2>

          <p className="welcome-message">
            {currentUser?.premium
              ? 'Premium member active.'
              : 'Upgrade-ready competitor.'}
          </p>

          <p className="email">
            {currentUser?.email}
          </p>

          <div className="stats-grid">
            <div className="stat-box">
              <label>Best WPM</label>
              <span className="stat-value">{Number(currentUser?.wpm || 0).toFixed(1)}</span>
            </div>
            <div className="stat-box">
              <label>Accuracy</label>
              <span className="stat-value">{Number(currentUser?.accuracy || 0).toFixed(1)}%</span>
            </div>
            <div className="stat-box">
              <label>Total Races</label>
              <span className="stat-value">{currentUser?.totalRaces || 0}</span>
            </div>
            <div className="stat-box">
              <label>Wins</label>
              <span className="stat-value">{currentUser?.wins || 0}</span>
            </div>
            <div className="stat-box">
              <label>Wallet</label>
              <span className="stat-value earnings">KES {Number(currentUser?.balance || 0).toFixed(2)}</span>
            </div>
            <div className="stat-box">
              <label>Phone</label>
              <span className="stat-value">{currentUser?.phoneNumber || 'Not set'}</span>
            </div>
          </div>

          <div className="equipped-card">
            <h3>Equipped</h3>
            <div className="equipped-grid">
              {Object.entries(EQUIPPED_LABELS).map(([key, label]) => (
                <div key={key} className="equipped-item">
                  <span>{label}</span>
                  <strong>{currentUser?.equippedItems?.[key] || 'None yet'}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="profile-card stats-card">
          <h3>Wallet</h3>
          <p className="wallet-help">
            {simulatedPaymentsEnabled
              ? 'Test payments are enabled right now. You can top up and withdraw with the current sandbox setup.'
              : 'Top up your account, withdraw winnings, and keep your tournament wallet ready.'}
          </p>

          <form className="wallet-topup" onSubmit={handleAddFunds}>
            <h3>Add funds</h3>
            <div className="wallet-row">
              <label className="wallet-field wallet-field--amount">
                <span>Amount</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={topUpAmount}
                  onChange={(event) => setTopUpAmount(event.target.value)}
                  placeholder="100"
                  required
                />
              </label>

              <label className="wallet-field">
                <span>Method</span>
                <select
                  value={topUpMethod}
                  onChange={(event) => setTopUpMethod(event.target.value)}
                >
                  {(walletConfig.topUpMethods || []).map((method) => (
                    <option key={method} value={method}>
                      {formatMethodLabel(method)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="wallet-field wallet-field--wide">
                <span>{topUpMethod === 'mpesa' ? 'M-Pesa number' : 'Account email or reference'}</span>
                <input
                  type="text"
                  value={topUpAccount}
                  onChange={(event) => setTopUpAccount(event.target.value)}
                  placeholder={topUpMethod === 'mpesa' ? '07...' : 'email@example.com'}
                  required
                />
              </label>

              <button type="submit" className="btn btn-primary">
                Add Funds
              </button>
            </div>
          </form>

          <form className="wallet-topup" onSubmit={handleWithdraw}>
            <h3>Withdraw</h3>
            <div className="wallet-row">
              <label className="wallet-field wallet-field--amount">
                <span>Amount</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                  placeholder="100"
                  required
                />
              </label>

              <label className="wallet-field">
                <span>Method</span>
                <select
                  value={withdrawMethod}
                  onChange={(event) => setWithdrawMethod(event.target.value)}
                >
                  {(walletConfig.withdrawMethods || []).map((method) => (
                    <option key={method} value={method}>
                      {formatMethodLabel(method)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="wallet-field wallet-field--wide">
                <span>{withdrawMethod === 'mpesa' ? 'M-Pesa number' : 'Payout email or reference'}</span>
                <input
                  type="text"
                  value={withdrawAccount}
                  onChange={(event) => setWithdrawAccount(event.target.value)}
                  placeholder={withdrawMethod === 'mpesa' ? '07...' : 'email@example.com'}
                  required
                />
              </label>

              <button type="submit" className="btn btn-outline-light">
                Withdraw
              </button>
            </div>
          </form>

          {walletNotice ? (
            <p className="wallet-notice">{walletNotice}</p>
          ) : null}

          <h3 className="wallet-history-title">Wallet history</h3>
          <div className="wallet-history">
            {walletHistory.length ? (
              walletHistory.slice(0, 6).map((item, index) => (
                <div key={`${item.code || item.createdAt || index}`} className="wallet-history__item">
                  <span>{item.mode || item.type || 'transaction'}</span>
                  <strong>KES {Number(item.amount || 0).toFixed(2)}</strong>
                </div>
              ))
            ) : (
              <div className="wallet-history__item">
                <span>No wallet activity yet.</span>
                <strong>Ready</strong>
              </div>
            )}
          </div>
        </div>

        <div className="profile-card races-card">
          <h3>Recent races</h3>
          <div className="race-list">
            {raceHistory.length ? (
              raceHistory.slice(0, 8).map((race, index) => (
                <div key={`${race.raceCode || race.createdAt || index}`} className="race-item">
                  <div className="race-info">
                    <div className="race-wpm">{Number(race.wpm || 0).toFixed(1)} WPM</div>
                    <div className="race-accuracy">{Number(race.accuracy || 0).toFixed(1)}% accuracy</div>
                  </div>
                  <div className="race-result">
                    <span className={`place place-${race.place || race.placePosition || 0}`}>
                      #{race.place || race.placePosition || '-'}
                    </span>
                    <span className="earnings">KES {Number(race.earnings || 0).toFixed(2)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="race-item">
                <div className="race-info">
                  <div className="race-wpm">No races yet</div>
                  <div className="race-accuracy">Start typing to build your history.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

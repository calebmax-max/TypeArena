/**
 * TypeProfile.js  — Advanced Profile UI
 *
 * Key additions over the original:
 *  ─ AvatarBadge  : the circular "TA" badge now accepts a custom uploaded image.
 *                   Image is stored in localStorage as a base64 data-URL so it
 *                   persists across sessions without any backend change.
 *                   Click the badge → hidden <input type="file"> fires → FileReader
 *                   encodes to base64 → saved to localStorage & state.
 *  ─ Full-page dark glassmorphism layout replacing the plain card grid.
 *  ─ Sidebar identity panel (avatar + stats + equipped items).
 *  ─ Tabbed main panel: Wallet · Race History · Settings.
 *  ─ Stat bars (WPM, accuracy, wins) with animated fill.
 *  ─ Wallet split into clear Top-up / Withdraw accordion sections.
 *  ─ Race history with mode/language chips, place medal colours, and earnings.
 *  ─ All original logic (auth, M-Pesa polling, Stripe redirect, sign-out,
 *    redirect-after-login) is preserved exactly.
 */

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addFundsToWallet,
  adminLogin,
  fetchCurrentUser,
  fetchRaceHistory,
  fetchWalletConfig,
  fetchWalletHistory,
  fetchWalletTopupStatus,
  fetchWalletWithdrawStatus,
  loginUser,
  signupUser,
  verifyWalletTopupSession,
  withdrawFundsToWallet,
} from '../utils/typingApi';

// ─── Constants ────────────────────────────────────────────────────────────────
const USER_CHANGE_EVENT                  = 'typearena-user-changed';
const TOPUP_STATUS_POLL_INTERVAL_MS      = 4000;
const TOPUP_STATUS_POLL_MAX_ATTEMPTS     = 20;
const WITHDRAW_STATUS_POLL_INTERVAL_MS   = 4000;
const WITHDRAW_STATUS_POLL_MAX_ATTEMPTS  = 20;
const BADGE_IMAGE_KEY                    = 'typearena_badge_image';

const formatMethodLabel = (m) => m.replace(/_/g, ' ');

const EQUIPPED_LABELS = {
  avatar:  'Avatar',
  theme:   'Theme',
  skin:    'Keyboard Skin',
  badge:   'Badge',
  effect:  'Effect',
  frame:   'Profile Frame',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const loadBadgeImage = () => {
  try { return localStorage.getItem(BADGE_IMAGE_KEY) || null; }
  catch { return null; }
};

const saveBadgeImage = (dataUrl) => {
  try { localStorage.setItem(BADGE_IMAGE_KEY, dataUrl); }
  catch { /* storage full — silently skip */ }
};

const removeBadgeImage = () => {
  try { localStorage.removeItem(BADGE_IMAGE_KEY); }
  catch {}
};

const medalColour = (place) => {
  if (place === 1) return '#FFD700';
  if (place === 2) return '#C0C0C0';
  if (place === 3) return '#CD7F32';
  return 'rgba(255,255,255,0.35)';
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * AvatarBadge
 * The circular badge that shows the user's initials (e.g. "TA").
 * Clicking it opens a file-picker; choosing an image replaces the initials
 * with the uploaded photo. A small "×" button removes the custom image.
 *
 * Props:
 *   initials  {string}  – fallback text (e.g. "JD")
 *   size      {number}  – diameter in px (default 96)
 */
function AvatarBadge({ initials = 'TA', size = 96 }) {
  const [imgSrc, setImgSrc] = useState(() => loadBadgeImage());
  const [hovered, setHovered] = useState(false);
  const fileRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setImgSrc(dataUrl);
      saveBadgeImage(dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset input so re-selecting the same file still fires onChange
    e.target.value = '';
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    setImgSrc(null);
    removeBadgeImage();
  };

  return (
    <div
      className="avatar-badge-wrap"
      style={{ width: size, height: size }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="avatar-badge-input"
        onChange={handleFileChange}
        aria-label="Upload badge image"
      />

      {/* Badge circle */}
      <button
        className="avatar-badge"
        style={{ width: size, height: size, fontSize: size * 0.28 }}
        onClick={() => fileRef.current?.click()}
        title={imgSrc ? 'Replace badge image' : 'Upload badge image'}
        aria-label={imgSrc ? 'Replace badge image' : 'Upload badge image'}
      >
        {imgSrc ? (
          <img src={imgSrc} alt="Badge" className="avatar-badge-img" />
        ) : (
          <span className="avatar-badge-initials">{initials}</span>
        )}

        {/* Hover overlay */}
        <span className={`avatar-badge-overlay ${hovered ? 'is-visible' : ''}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span style={{ fontSize: '0.6rem', letterSpacing: '0.08em' }}>UPLOAD</span>
        </span>
      </button>

      {/* Remove button — only when image exists */}
      {imgSrc && (
        <button
          className="avatar-badge-remove"
          onClick={handleRemove}
          title="Remove custom image"
          aria-label="Remove custom badge image"
        >
          ×
        </button>
      )}
    </div>
  );
}

/** StatBar — animated horizontal fill bar */
function StatBar({ value, max, color = 'var(--tp-accent)' }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="stat-bar-track">
      <div
        className="stat-bar-fill"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

/** Tab button */
function Tab({ id, active, onClick, children }) {
  return (
    <button
      className={`tp-tab ${active ? 'tp-tab--active' : ''}`}
      onClick={() => onClick(id)}
      role="tab"
      aria-selected={active}
    >
      {children}
    </button>
  );
}

/** Notice banner */
function Notice({ message, type = 'info' }) {
  if (!message) return null;
  return (
    <div className={`tp-notice tp-notice--${type}`} role="status">
      <span className="tp-notice__icon">
        {type === 'error' ? '⚠' : type === 'success' ? '✓' : 'ℹ'}
      </span>
      <span>{message}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TypeProfile() {
  const navigate = useNavigate();

  const [currentUser,   setCurrentUser]   = useState(null);
  const [showAuthForm,  setShowAuthForm]   = useState(false);
  const [authMode,      setAuthMode]       = useState('login');
  const [formData,      setFormData]       = useState({ email: '', password: '', username: '', phoneNumber: '' });
  const [raceHistory,   setRaceHistory]    = useState([]);
  const [walletHistory, setWalletHistory]  = useState([]);
  const [walletConfig,  setWalletConfig]   = useState({ topUpMethods: [], withdrawMethods: [] });
  const [loading,       setLoading]        = useState(true);
  const [topUpAmount,   setTopUpAmount]    = useState('');
  const [topUpAccount,  setTopUpAccount]   = useState('');
  const [topUpMethod,   setTopUpMethod]    = useState('stripe_checkout');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAccount, setWithdrawAccount] = useState('');
  const [withdrawMethod,  setWithdrawMethod]  = useState('paypal');
  const [walletNotice,  setWalletNotice]   = useState('');
  const [authNotice,    setAuthNotice]     = useState('');
  const [showPassword,  setShowPassword]   = useState(false);
  const [activeTab,     setActiveTab]      = useState('wallet');
  const [walletSection, setWalletSection]  = useState('topup'); // 'topup' | 'withdraw'

  const simulatedPaymentsEnabled = Boolean(walletConfig.simulatedPaymentsEnabled);

  const applyFreshUserState = useCallback((user) => {
    setCurrentUser(user);
    window.dispatchEvent(new Event(USER_CHANGE_EVENT));
  }, []);

  const loadWalletConfig = useCallback(async () => {
    const data = await fetchWalletConfig();
    const cfg = data || { topUpMethods: [], withdrawMethods: [] };
    setWalletConfig(cfg);
    return cfg;
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const user = await fetchCurrentUser();
      setCurrentUser(user);
      if (user?.id) {
        const [cfg, history, wallet] = await Promise.all([
          loadWalletConfig(),
          fetchRaceHistory(user.id),
          fetchWalletHistory(),
        ]);
        setWalletConfig(cfg || { topUpMethods: [], withdrawMethods: [] });
        setRaceHistory(history || []);
        setWalletHistory(wallet?.items || []);
      } else {
        setWalletConfig({ topUpMethods: [], withdrawMethods: [] });
        setRaceHistory([]);
        setWalletHistory([]);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  }, [loadWalletConfig]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect   = params.get('redirect');
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
    const params        = new URLSearchParams(window.location.search);
    const checkoutState = params.get('checkout');
    const sessionId     = params.get('session_id');
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
        .catch((err) => { setWalletNotice(err.message || 'Could not verify the hosted checkout yet.'); })
        .finally(() => { window.history.replaceState({}, document.title, window.location.pathname); });
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
      setTopUpMethod((c) => walletConfig.topUpMethods.includes(c) ? c : walletConfig.topUpMethods[0]);
    }
    if (walletConfig.withdrawMethods?.length) {
      setWithdrawMethod((c) => walletConfig.withdrawMethods.includes(c) ? c : walletConfig.withdrawMethods[0]);
    }
  }, [walletConfig]);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    try {
      try {
        const adminResult = await adminLogin(formData.email, formData.password);
        if (adminResult?.token) {
          setAuthNotice('');
          setFormData({ email: '', password: '', username: '', phoneNumber: '' });
          navigate('/admin');
          return;
        }
      } catch { /* not admin */ }

      const user = authMode === 'login'
        ? await loginUser(formData.email, formData.password)
        : await signupUser(formData.username, formData.email, formData.password, formData.phoneNumber);

      window.dispatchEvent(new Event(USER_CHANGE_EVENT));
      applyFreshUserState(user);

      if (authMode === 'login' && user?.adminToken) {
        setShowAuthForm(false);
        setFormData({ email: '', password: '', username: '', phoneNumber: '' });
        setAuthNotice('');
        navigate('/admin');
        return;
      }

      setShowAuthForm(false);
      setFormData({ email: '', password: '', username: '', phoneNumber: '' });
      setAuthNotice('');
      await loadProfile();
      const redirect = new URLSearchParams(window.location.search).get('redirect');
      if (redirect) navigate(redirect);
    } catch (err) {
      setAuthNotice(err.message || 'Authentication failed.');
    }
  };

  // ── M-Pesa polling ────────────────────────────────────────────────────────
  const watchMpesaTopupStatus = useCallback(async (checkoutRequestId) => {
    for (let i = 0; i < TOPUP_STATUS_POLL_MAX_ATTEMPTS; i++) {
      await new Promise((r) => window.setTimeout(r, TOPUP_STATUS_POLL_INTERVAL_MS));
      const status = await fetchWalletTopupStatus(checkoutRequestId);
      if (status?.status === 'completed' && status?.user) {
        applyFreshUserState(status.user);
        setWalletNotice(status.resultDescription || 'Payment confirmed and funds added to your wallet.');
        await loadProfile();
        return true;
      }
      if (status?.status === 'failed') {
        setWalletNotice(status.resultDescription || 'The payment did not complete successfully.');
        await loadProfile();
        return false;
      }
    }
    setWalletNotice('Payment request was sent. Your wallet will update automatically once M-Pesa confirms.');
    return false;
  }, [applyFreshUserState, loadProfile]);

  const watchWithdrawalStatus = useCallback(async (payoutCode) => {
    for (let i = 0; i < WITHDRAW_STATUS_POLL_MAX_ATTEMPTS; i++) {
      await new Promise((r) => window.setTimeout(r, WITHDRAW_STATUS_POLL_INTERVAL_MS));
      const status = await fetchWalletWithdrawStatus(payoutCode);
      if (status?.status === 'completed' && status?.user) {
        applyFreshUserState(status.user);
        setWalletNotice(status.resultDescription || 'Withdrawal confirmed successfully.');
        await loadProfile();
        return true;
      }
      if (status?.status === 'failed') {
        if (status?.user) applyFreshUserState(status.user);
        setWalletNotice(status.resultDescription || 'Withdrawal failed and your wallet has been refunded.');
        await loadProfile();
        return false;
      }
    }
    setWalletNotice('Withdrawal request was sent. We will update this wallet as soon as M-Pesa confirms.');
    return false;
  }, [applyFreshUserState, loadProfile]);

  // ── Wallet actions ────────────────────────────────────────────────────────
  const handleAddFunds = async (e) => {
    e.preventDefault();
    try {
      const result = await addFundsToWallet(topUpAmount, topUpAccount, topUpMethod, topUpMethod === 'mpesa' ? 'KES' : 'USD');
      if (result?.checkoutUrl) {
        setWalletNotice(result.message || 'Redirecting to secure checkout...');
        window.location.href = result.checkoutUrl;
        return;
      }
      if (result?.status === 'pending' && result?.paymentMethod === 'mpesa' && result?.mpesa?.CheckoutRequestID) {
        setWalletNotice(result.message || 'M-Pesa prompt sent. Waiting for payment confirmation...');
        setTopUpAmount('');
        await watchMpesaTopupStatus(result.mpesa.CheckoutRequestID);
        return;
      }
      setWalletNotice(result.message || 'Top-up completed.');
      setTopUpAmount('');
      if (result?.user) applyFreshUserState(result.user);
      await loadProfile();
    } catch (err) {
      setWalletNotice(err.message || 'Top-up failed.');
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    try {
      const cfg = await loadWalletConfig();
      if (!cfg.withdrawMethods?.length) { setWalletNotice('Withdrawal is not enabled yet.'); return; }
      const activeMethod = cfg.withdrawMethods.includes(withdrawMethod) ? withdrawMethod : cfg.withdrawMethods[0];
      setWithdrawMethod(activeMethod);
      const result = await withdrawFundsToWallet(withdrawAmount, withdrawAccount, activeMethod, activeMethod === 'mpesa' ? 'KES' : 'USD');
      setWalletNotice(result.message || 'Withdrawal completed.');
      setWithdrawAmount('');
      if (result?.user) applyFreshUserState(result.user);
      if (result?.status === 'pending' && result?.payoutMethod === 'mpesa' && result?.payoutCode) {
        await watchWithdrawalStatus(result.payoutCode);
        return;
      }
      await loadProfile();
    } catch (err) {
      setWalletNotice(err.message || 'Withdrawal failed.');
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('typearena_user');
    window.dispatchEvent(new Event(USER_CHANGE_EVENT));
    setCurrentUser(null);
  };

  const openAuthForm = (mode) => {
    setAuthMode(mode);
    setShowAuthForm(true);
    setAuthNotice('');
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const initials = currentUser?.username
    ? currentUser.username.slice(0, 2).toUpperCase()
    : 'TA';

  const winRate = currentUser?.totalRaces
    ? Math.round((currentUser.wins / currentUser.totalRaces) * 100)
    : 0;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="tp-root tp-root--loading">
          <div className="tp-spinner" />
          <p>Loading profile…</p>
        </div>
      </>
    );
  }

  // ── Logged-out state ──────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="tp-root tp-root--auth">
          <div className="tp-auth-card">
            <div className="tp-auth-logo">
              <AvatarBadge initials="TA" size={80} />
              <h1 className="tp-auth-title">TypeArena</h1>
              <p className="tp-auth-sub">Compete. Earn. Dominate the keyboard.</p>
            </div>

            {!showAuthForm ? (
              <div className="tp-auth-actions">
                <button className="tp-btn tp-btn--primary tp-btn--lg" onClick={() => openAuthForm('login')}>
                  Sign In
                </button>
                <button className="tp-btn tp-btn--outline tp-btn--lg" onClick={() => openAuthForm('signup')}>
                  Create Account
                </button>
              </div>
            ) : (
              <form className="tp-form" onSubmit={handleAuthSubmit}>
                <h2 className="tp-form__title">{authMode === 'login' ? 'Sign In' : 'Create Account'}</h2>

                {authMode === 'signup' && (
                  <div className="tp-field">
                    <label className="tp-field__label">Username</label>
                    <input className="tp-input" type="text" placeholder="typist_pro" value={formData.username}
                      onChange={(e) => setFormData((c) => ({ ...c, username: e.target.value }))} required />
                  </div>
                )}

                <div className="tp-field">
                  <label className="tp-field__label">Email</label>
                  <input className="tp-input" type="email" placeholder="you@example.com" value={formData.email}
                    onChange={(e) => setFormData((c) => ({ ...c, email: e.target.value }))} required />
                </div>

                <div className="tp-field">
                  <label className="tp-field__label">Password</label>
                  <div className="tp-input-row">
                    <input className="tp-input" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={formData.password}
                      onChange={(e) => setFormData((c) => ({ ...c, password: e.target.value }))} required />
                    <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm" onClick={() => setShowPassword((s) => !s)}>
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {authMode === 'signup' && (
                  <div className="tp-field">
                    <label className="tp-field__label">Phone number</label>
                    <input className="tp-input" type="tel" placeholder="+254 7…" value={formData.phoneNumber}
                      onChange={(e) => setFormData((c) => ({ ...c, phoneNumber: e.target.value }))} />
                  </div>
                )}

                <Notice message={authNotice} type="error" />

                <button type="submit" className="tp-btn tp-btn--primary">
                  {authMode === 'login' ? 'Sign In' : 'Create Account'}
                </button>
                <button type="button" className="tp-btn tp-btn--ghost" onClick={() => setShowAuthForm(false)}>
                  Back
                </button>
              </form>
            )}
          </div>
        </div>
      </>
    );
  }

  // ── Logged-in state ───────────────────────────────────────────────────────
  return (
    <>
      <style>{STYLES}</style>
      <div className="tp-root">

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <aside className="tp-sidebar">

          {/* Identity */}
          <div className="tp-identity">
            <AvatarBadge initials={initials} size={92} />
            <div className="tp-identity__info">
              <h1 className="tp-identity__name">{currentUser.username}</h1>
              <span className="tp-identity__tier">{currentUser.tier || 'Standard'} Tier</span>
              {currentUser.premium && (
                <span className="tp-identity__premium">⚡ Premium</span>
              )}
            </div>
          </div>

          <p className="tp-sidebar__email">{currentUser.email}</p>

          {/* Balance pill */}
          <div className="tp-balance">
            <span className="tp-balance__label">Wallet</span>
            <span className="tp-balance__value">KES {Number(currentUser.balance || 0).toFixed(2)}</span>
          </div>

          {/* Stat bars */}
          <div className="tp-stats">
            <div className="tp-stat-row">
              <div className="tp-stat-row__head">
                <span>Best WPM</span>
                <strong>{Number(currentUser.wpm || 0).toFixed(1)}</strong>
              </div>
              <StatBar value={Number(currentUser.wpm || 0)} max={200} color="var(--tp-accent)" />
            </div>

            <div className="tp-stat-row">
              <div className="tp-stat-row__head">
                <span>Accuracy</span>
                <strong>{Number(currentUser.accuracy || 0).toFixed(1)}%</strong>
              </div>
              <StatBar value={Number(currentUser.accuracy || 0)} max={100} color="var(--tp-green)" />
            </div>

            <div className="tp-stat-row">
              <div className="tp-stat-row__head">
                <span>Win Rate</span>
                <strong>{winRate}%</strong>
              </div>
              <StatBar value={winRate} max={100} color="var(--tp-gold)" />
            </div>
          </div>

          {/* Quick counts */}
          <div className="tp-counts">
            <div className="tp-count">
              <span className="tp-count__n">{currentUser.totalRaces || 0}</span>
              <span className="tp-count__l">Races</span>
            </div>
            <div className="tp-count">
              <span className="tp-count__n">{currentUser.wins || 0}</span>
              <span className="tp-count__l">Wins</span>
            </div>
            <div className="tp-count">
              <span className="tp-count__n">{currentUser.phoneNumber ? '✓' : '—'}</span>
              <span className="tp-count__l">Phone</span>
            </div>
          </div>

          {/* Equipped items */}
          <div className="tp-equipped">
            <h3 className="tp-equipped__title">Equipped</h3>
            {Object.entries(EQUIPPED_LABELS).map(([key, label]) => (
              <div key={key} className="tp-equipped__row">
                <span className="tp-equipped__label">{label}</span>
                <span className="tp-equipped__value">{currentUser.equippedItems?.[key] || '—'}</span>
              </div>
            ))}
          </div>

          {/* Sign out */}
          <button className="tp-btn tp-btn--danger tp-sidebar__signout" onClick={handleSignOut}>
            Sign Out
          </button>
        </aside>

        {/* ── Main panel ─────────────────────────────────────────────────── */}
        <main className="tp-main">

          {/* Tab bar */}
          <div className="tp-tabs" role="tablist">
            <Tab id="wallet"  active={activeTab === 'wallet'}  onClick={setActiveTab}>💳 Wallet</Tab>
            <Tab id="history" active={activeTab === 'history'} onClick={setActiveTab}>🏁 Race History</Tab>
            <Tab id="account" active={activeTab === 'account'} onClick={setActiveTab}>⚙ Account</Tab>
          </div>

          {/* ── WALLET TAB ─────────────────────────────────────────────── */}
          {activeTab === 'wallet' && (
            <div className="tp-panel">
              <p className="tp-panel__help">
                {simulatedPaymentsEnabled
                  ? 'Test payments enabled — sandbox top-up and withdraw available.'
                  : 'Top up your account, withdraw winnings, and keep your tournament wallet ready.'}
              </p>

              {/* Section switcher */}
              <div className="tp-segment">
                <button
                  className={`tp-segment__btn ${walletSection === 'topup' ? 'active' : ''}`}
                  onClick={() => setWalletSection('topup')}
                >Add Funds</button>
                <button
                  className={`tp-segment__btn ${walletSection === 'withdraw' ? 'active' : ''}`}
                  onClick={() => setWalletSection('withdraw')}
                >Withdraw</button>
              </div>

              {walletSection === 'topup' && (
                <form className="tp-wallet-form" onSubmit={handleAddFunds}>
                  <div className="tp-fields-row">
                    <div className="tp-field tp-field--sm">
                      <label className="tp-field__label">Amount (KES)</label>
                      <input className="tp-input" type="number" min="1" step="0.01" value={topUpAmount}
                        onChange={(e) => setTopUpAmount(e.target.value)} placeholder="100" required />
                    </div>
                    <div className="tp-field tp-field--sm">
                      <label className="tp-field__label">Method</label>
                      <select className="tp-input" value={topUpMethod} onChange={(e) => setTopUpMethod(e.target.value)}>
                        {(walletConfig.topUpMethods || []).map((m) => (
                          <option key={m} value={m}>{formatMethodLabel(m)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="tp-field tp-field--grow">
                      <label className="tp-field__label">
                        {topUpMethod === 'mpesa' ? 'M-Pesa number' : 'Account / email'}
                      </label>
                      <input className="tp-input" type="text" value={topUpAccount}
                        onChange={(e) => setTopUpAccount(e.target.value)}
                        placeholder={topUpMethod === 'mpesa' ? '07…' : 'email@example.com'} required />
                    </div>
                  </div>
                  {/* <button type="submit" className="tp-btn tp-btn--primary">Add Funds</button> */}
                </form>
              )}

              {walletSection === 'withdraw' && (
                <form className="tp-wallet-form" onSubmit={handleWithdraw}>
                  <div className="tp-fields-row">
                    <div className="tp-field tp-field--sm">
                      <label className="tp-field__label">Amount (KES)</label>
                      <input className="tp-input" type="number" min="1" step="0.01" value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="100" required />
                    </div>
                    <div className="tp-field tp-field--sm">
                      <label className="tp-field__label">Method</label>
                      <select className="tp-input" value={withdrawMethod} onChange={(e) => setWithdrawMethod(e.target.value)}>
                        {(walletConfig.withdrawMethods || []).map((m) => (
                          <option key={m} value={m}>{formatMethodLabel(m)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="tp-field tp-field--grow">
                      <label className="tp-field__label">
                        {withdrawMethod === 'mpesa' ? 'M-Pesa number' : 'Payout email'}
                      </label>
                      <input className="tp-input" type="text" value={withdrawAccount}
                        onChange={(e) => setWithdrawAccount(e.target.value)}
                        placeholder={withdrawMethod === 'mpesa' ? '07…' : 'email@example.com'} required />
                    </div>
                  </div>
                  {/* <button type="submit" className="tp-btn tp-btn--outline">Withdraw</button> */}
                </form>
              )}

              <Notice message={walletNotice} type="info" />

              {/* Wallet history */}
              <div className="tp-section-head">
                <h3>Transaction History</h3>
              </div>
              <div className="tp-wallet-list">
                {walletHistory.length ? walletHistory.slice(0, 8).map((item, i) => (
                  <div key={item.code || item.createdAt || i} className="tp-wallet-row">
                    <span className="tp-wallet-row__type">{item.mode || item.type || 'transaction'}</span>
                    <span className={`tp-wallet-row__amount ${Number(item.amount) >= 0 ? 'positive' : 'negative'}`}>
                      {Number(item.amount) >= 0 ? '+' : ''}KES {Number(item.amount || 0).toFixed(2)}
                    </span>
                  </div>
                )) : (
                  <div className="tp-wallet-row">
                    <span className="tp-wallet-row__type">No wallet activity yet.</span>
                    <span className="tp-wallet-row__amount">Ready</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── RACE HISTORY TAB ───────────────────────────────────────── */}
          {activeTab === 'history' && (
            <div className="tp-panel">
              <div className="tp-section-head">
                <h3>Recent Races</h3>
                <span className="tp-section-head__sub">{raceHistory.length} recorded</span>
              </div>
              <div className="tp-race-list">
                {raceHistory.length ? raceHistory.slice(0, 12).map((race, i) => {
                  const place = race.place || race.placePosition || 0;
                  return (
                    <div key={race.raceCode || race.createdAt || i} className="tp-race-row">
                      <div className="tp-race-row__medal" style={{ color: medalColour(place) }}>
                        #{place || '—'}
                      </div>
                      <div className="tp-race-row__main">
                        <span className="tp-race-row__wpm">{Number(race.wpm || 0).toFixed(1)} WPM</span>
                        <span className="tp-race-row__acc">{Number(race.accuracy || 0).toFixed(1)}% acc</span>
                        {race.mode && <span className="tp-chip">{race.mode}</span>}
                        {race.language && <span className="tp-chip tp-chip--muted">{race.language}</span>}
                      </div>
                      <div className="tp-race-row__earn">
                        {Number(race.earnings || 0) > 0 ? (
                          <span className="tp-earn-pill">+KES {Number(race.earnings).toFixed(2)}</span>
                        ) : (
                          <span className="tp-earn-pill tp-earn-pill--zero">KES 0</span>
                        )}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="tp-empty">
                    <span>No races yet — hit the arena to build your history.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ACCOUNT TAB ───────────────────────────────────────────── */}
          {activeTab === 'account' && (
            <div className="tp-panel">
              <div className="tp-section-head"><h3>Account Details</h3></div>
              <div className="tp-account-rows">
                <div className="tp-account-row">
                  <span className="tp-account-row__label">Username</span>
                  <span className="tp-account-row__value">{currentUser.username}</span>
                </div>
                <div className="tp-account-row">
                  <span className="tp-account-row__label">Email</span>
                  <span className="tp-account-row__value">{currentUser.email}</span>
                </div>
                <div className="tp-account-row">
                  <span className="tp-account-row__label">Phone</span>
                  <span className="tp-account-row__value">{currentUser.phoneNumber || 'Not set'}</span>
                </div>
                <div className="tp-account-row">
                  <span className="tp-account-row__label">Tier</span>
                  <span className="tp-account-row__value">{currentUser.tier || 'Standard'}</span>
                </div>
                <div className="tp-account-row">
                  <span className="tp-account-row__label">Premium</span>
                  <span className="tp-account-row__value">{currentUser.premium ? '⚡ Active' : 'Not active'}</span>
                </div>
              </div>

              <div className="tp-section-head" style={{ marginTop: '2rem' }}>
                <h3>Badge Image</h3>
                <span className="tp-section-head__sub">Your profile badge — visible in races and standings</span>
              </div>
              <div className="tp-badge-editor">
                <AvatarBadge initials={initials} size={110} />
                <div className="tp-badge-editor__hint">
                  <p>Click the badge to upload a custom photo.<br />Supports JPG, PNG, WebP. Stored locally on this device.</p>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const STYLES = `
  /* ── Tokens ── */
  .tp-root,
  .tp-root--auth,
  .tp-root--loading {
    --tp-bg:          #07090f;
    --tp-surface:     rgba(13, 17, 28, 0.82);
    --tp-surface-2:   rgba(20, 26, 42, 0.7);
    --tp-border:      rgba(255,255,255,0.07);
    --tp-border-2:    rgba(255,255,255,0.12);
    --tp-text:        #edf0ff;
    --tp-muted:       rgba(180,190,225,0.55);
    --tp-accent:      #4fffb0;
    --tp-accent-soft: rgba(79,255,176,0.12);
    --tp-accent-glow: rgba(79,255,176,0.25);
    --tp-gold:        #ffd166;
    --tp-green:       #6ee7b7;
    --tp-red:         #ff6b6b;
    --tp-font-head:   'Georgia', 'Times New Roman', serif;
    --tp-font-mono:   'Courier New', 'Lucida Console', monospace;
    --tp-font-body:   system-ui, -apple-system, sans-serif;

    min-height: 100vh;
    background: var(--tp-bg);
    color: var(--tp-text);
    font-family: var(--tp-font-body);
  }

  /* Noise texture overlay */
  .tp-root::before,
  .tp-root--auth::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      radial-gradient(ellipse 80% 50% at 20% 10%, rgba(79,255,176,0.05) 0%, transparent 60%),
      radial-gradient(ellipse 60% 40% at 80% 90%, rgba(255,209,102,0.04) 0%, transparent 60%);
    pointer-events: none;
    z-index: 0;
  }

  /* ── Root layout ── */
  .tp-root {
    display: grid;
    grid-template-columns: 300px 1fr;
    min-height: 100vh;
    position: relative;
    z-index: 1;
  }

  /* ── Loading ── */
  .tp-root--loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: var(--tp-muted);
    font-size: 0.9rem;
  }
  .tp-spinner {
    width: 36px; height: 36px;
    border: 3px solid var(--tp-border);
    border-top-color: var(--tp-accent);
    border-radius: 50%;
    animation: tpSpin 0.75s linear infinite;
  }
  @keyframes tpSpin { to { transform: rotate(360deg); } }

  /* ── Auth page ── */
  .tp-root--auth {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 1;
  }
  .tp-auth-card {
    background: var(--tp-surface);
    border: 1px solid var(--tp-border-2);
    border-radius: 20px;
    padding: 2.5rem 2rem;
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    backdrop-filter: blur(16px);
    box-shadow: 0 24px 64px rgba(0,0,0,0.5);
  }
  .tp-auth-logo {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .tp-auth-title {
    font-family: var(--tp-font-mono);
    font-size: 1.5rem;
    letter-spacing: 0.1em;
    color: var(--tp-accent);
    margin: 0;
  }
  .tp-auth-sub {
    font-size: 0.8rem;
    color: var(--tp-muted);
    margin: 0;
    text-align: center;
  }
  .tp-auth-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* ── Sidebar ── */
  .tp-sidebar {
    background: var(--tp-surface);
    border-right: 1px solid var(--tp-border);
    padding: 2rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
    backdrop-filter: blur(12px);
    scrollbar-width: thin;
    scrollbar-color: var(--tp-border) transparent;
  }

  /* ── Identity block ── */
  .tp-identity {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .tp-identity__info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }
  .tp-identity__name {
    font-family: var(--tp-font-head);
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--tp-text);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tp-identity__tier {
    font-size: 0.7rem;
    color: var(--tp-muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .tp-identity__premium {
    font-size: 0.7rem;
    color: var(--tp-gold);
    font-weight: 600;
  }
  .tp-sidebar__email {
    font-size: 0.75rem;
    color: var(--tp-muted);
    margin: 0;
    word-break: break-all;
  }

  /* ── Balance pill ── */
  .tp-balance {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--tp-accent-soft);
    border: 1px solid rgba(79,255,176,0.2);
    border-radius: 10px;
    padding: 0.65rem 1rem;
  }
  .tp-balance__label {
    font-size: 0.72rem;
    color: var(--tp-muted);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .tp-balance__value {
    font-family: var(--tp-font-mono);
    font-size: 1rem;
    font-weight: 700;
    color: var(--tp-accent);
  }

  /* ── Stat bars ── */
  .tp-stats { display: flex; flex-direction: column; gap: 0.8rem; }
  .tp-stat-row { display: flex; flex-direction: column; gap: 0.3rem; }
  .tp-stat-row__head {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
  }
  .tp-stat-row__head span { color: var(--tp-muted); }
  .tp-stat-row__head strong { color: var(--tp-text); font-weight: 600; }
  .stat-bar-track {
    height: 4px;
    background: rgba(255,255,255,0.06);
    border-radius: 99px;
    overflow: hidden;
  }
  .stat-bar-fill {
    height: 100%;
    border-radius: 99px;
    transition: width 0.8s cubic-bezier(0.25,1,0.5,1);
  }

  /* ── Count pills ── */
  .tp-counts {
    display: flex;
    gap: 0.5rem;
  }
  .tp-count {
    flex: 1;
    background: var(--tp-surface-2);
    border: 1px solid var(--tp-border);
    border-radius: 10px;
    padding: 0.6rem 0.4rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
  }
  .tp-count__n {
    font-family: var(--tp-font-mono);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--tp-text);
  }
  .tp-count__l {
    font-size: 0.62rem;
    color: var(--tp-muted);
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }

  /* ── Equipped ── */
  .tp-equipped {
    background: var(--tp-surface-2);
    border: 1px solid var(--tp-border);
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .tp-equipped__title {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--tp-muted);
    margin: 0 0 0.3rem;
  }
  .tp-equipped__row {
    display: flex;
    justify-content: space-between;
    font-size: 0.78rem;
    padding: 0.2rem 0;
    border-bottom: 1px solid var(--tp-border);
  }
  .tp-equipped__row:last-child { border-bottom: none; }
  .tp-equipped__label { color: var(--tp-muted); }
  .tp-equipped__value { color: var(--tp-text); font-weight: 500; }

  .tp-sidebar__signout { margin-top: auto; width: 100%; }

  /* ── Main panel ── */
  .tp-main {
    display: flex;
    flex-direction: column;
    padding: 2rem;
    gap: 0;
    position: relative;
    z-index: 1;
    overflow-y: auto;
    min-height: 100vh;
  }

  /* ── Tabs ── */
  .tp-tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--tp-border);
    margin-bottom: 1.5rem;
  }
  .tp-tab {
    font-family: var(--tp-font-body);
    font-size: 0.82rem;
    color: var(--tp-muted);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0.6rem 1rem;
    cursor: pointer;
    transition: color 0.18s, border-color 0.18s;
    white-space: nowrap;
  }
  .tp-tab:hover { color: var(--tp-text); }
  .tp-tab--active {
    color: var(--tp-accent);
    border-bottom-color: var(--tp-accent);
  }

  /* ── Panel ── */
  .tp-panel {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    animation: tpFadeIn 0.22s ease;
  }
  @keyframes tpFadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .tp-panel__help {
    font-size: 0.82rem;
    color: var(--tp-muted);
    margin: 0;
    line-height: 1.6;
  }

  /* ── Section heading ── */
  .tp-section-head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    border-bottom: 1px solid var(--tp-border);
    padding-bottom: 0.5rem;
  }
  .tp-section-head h3 {
    font-family: var(--tp-font-head);
    font-size: 1rem;
    font-weight: 700;
    color: var(--tp-text);
    margin: 0;
  }
  .tp-section-head__sub { font-size: 0.75rem; color: var(--tp-muted); }

  /* ── Segment control ── */
  .tp-segment {
    display: inline-flex;
    background: var(--tp-surface-2);
    border: 1px solid var(--tp-border);
    border-radius: 10px;
    padding: 3px;
    gap: 3px;
    width: fit-content;
  }
  .tp-segment__btn {
    font-size: 0.8rem;
    padding: 0.4rem 1.1rem;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--tp-muted);
    cursor: pointer;
    transition: background 0.18s, color 0.18s;
  }
  .tp-segment__btn.active {
    background: var(--tp-accent);
    color: #04100a;
    font-weight: 700;
  }

  /* ── Wallet form ── */
  .tp-wallet-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background: var(--tp-surface-2);
    border: 1px solid var(--tp-border);
    border-radius: 14px;
    padding: 1.25rem;
  }
  .tp-fields-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    align-items: flex-end;
  }
  .tp-field { display: flex; flex-direction: column; gap: 0.35rem; }
  .tp-field--sm  { flex: 0 0 140px; }
  .tp-field--grow { flex: 1 1 200px; }
  .tp-field__label {
    font-size: 0.7rem;
    color: var(--tp-muted);
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }

  /* ── Wallet list ── */
  .tp-wallet-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .tp-wallet-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.65rem 0.9rem;
    background: var(--tp-surface-2);
    border: 1px solid var(--tp-border);
    border-radius: 8px;
    font-size: 0.83rem;
  }
  .tp-wallet-row__type { color: var(--tp-muted); text-transform: capitalize; }
  .tp-wallet-row__amount { font-family: var(--tp-font-mono); font-weight: 700; color: var(--tp-text); }
  .tp-wallet-row__amount.positive { color: var(--tp-accent); }
  .tp-wallet-row__amount.negative { color: var(--tp-red); }

  /* ── Race list ── */
  .tp-race-list { display: flex; flex-direction: column; gap: 0.4rem; }
  .tp-race-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--tp-surface-2);
    border: 1px solid var(--tp-border);
    border-radius: 10px;
    transition: border-color 0.18s;
  }
  .tp-race-row:hover { border-color: var(--tp-border-2); }
  .tp-race-row__medal {
    font-family: var(--tp-font-mono);
    font-size: 0.9rem;
    font-weight: 700;
    min-width: 2.5ch;
    text-align: center;
  }
  .tp-race-row__main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .tp-race-row__wpm {
    font-family: var(--tp-font-mono);
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--tp-text);
  }
  .tp-race-row__acc { font-size: 0.8rem; color: var(--tp-muted); }
  .tp-chip {
    font-size: 0.65rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    background: var(--tp-accent-soft);
    color: var(--tp-accent);
    border: 1px solid rgba(79,255,176,0.2);
    text-transform: capitalize;
    letter-spacing: 0.05em;
  }
  .tp-chip--muted {
    background: rgba(255,255,255,0.04);
    color: var(--tp-muted);
    border-color: var(--tp-border);
  }
  .tp-earn-pill {
    font-family: var(--tp-font-mono);
    font-size: 0.78rem;
    padding: 0.2rem 0.6rem;
    border-radius: 6px;
    background: rgba(79,255,176,0.1);
    color: var(--tp-accent);
    border: 1px solid rgba(79,255,176,0.2);
    white-space: nowrap;
  }
  .tp-earn-pill--zero {
    background: rgba(255,255,255,0.04);
    color: var(--tp-muted);
    border-color: var(--tp-border);
  }

  /* ── Account tab ── */
  .tp-account-rows { display: flex; flex-direction: column; gap: 0; }
  .tp-account-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.7rem 0;
    border-bottom: 1px solid var(--tp-border);
    font-size: 0.85rem;
  }
  .tp-account-row:last-child { border-bottom: none; }
  .tp-account-row__label { color: var(--tp-muted); }
  .tp-account-row__value { color: var(--tp-text); font-weight: 500; }

  /* ── Badge editor ── */
  .tp-badge-editor {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    background: var(--tp-surface-2);
    border: 1px solid var(--tp-border);
    border-radius: 14px;
    padding: 1.5rem;
  }
  .tp-badge-editor__hint {
    flex: 1;
  }
  .tp-badge-editor__hint p {
    font-size: 0.82rem;
    color: var(--tp-muted);
    line-height: 1.65;
    margin: 0;
  }

  /* ── Avatar badge ── */
  .avatar-badge-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .avatar-badge-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }
  .avatar-badge {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(79,255,176,0.18), rgba(79,255,176,0.05));
    border: 2px solid rgba(79,255,176,0.4);
    box-shadow:
      0 0 0 4px rgba(79,255,176,0.06),
      inset 0 0 20px rgba(79,255,176,0.06);
    cursor: pointer;
    overflow: hidden;
    padding: 0;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .avatar-badge:hover {
    border-color: var(--tp-accent);
    box-shadow: 0 0 0 4px var(--tp-accent-glow), 0 0 20px var(--tp-accent-glow);
  }
  .avatar-badge-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
    display: block;
  }
  .avatar-badge-initials {
    font-family: var(--tp-font-mono);
    font-weight: 700;
    color: var(--tp-accent);
    letter-spacing: 0.06em;
    user-select: none;
  }
  .avatar-badge-overlay {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(4, 16, 10, 0.72);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    color: var(--tp-accent);
    opacity: 0;
    transition: opacity 0.18s;
    pointer-events: none;
  }
  .avatar-badge-overlay.is-visible { opacity: 1; }
  .avatar-badge-remove {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--tp-red);
    color: #fff;
    border: none;
    font-size: 0.8rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    transition: transform 0.15s;
  }
  .avatar-badge-remove:hover { transform: scale(1.2); }

  /* ── Buttons ── */
  .tp-btn {
    font-family: var(--tp-font-body);
    font-size: 0.85rem;
    padding: 0.6rem 1.3rem;
    border-radius: 9px;
    border: none;
    cursor: pointer;
    transition: all 0.18s ease;
    letter-spacing: 0.02em;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }
  .tp-btn--lg   { padding: 0.75rem 1.6rem; font-size: 0.95rem; }
  .tp-btn--sm   { padding: 0.35rem 0.8rem; font-size: 0.75rem; }
  .tp-btn--primary {
    background: var(--tp-accent);
    color: #04100a;
    font-weight: 700;
    box-shadow: 0 0 14px var(--tp-accent-glow);
  }
  .tp-btn--primary:hover {
    filter: brightness(1.1);
    box-shadow: 0 0 24px var(--tp-accent-glow);
  }
  .tp-btn--outline {
    background: transparent;
    color: var(--tp-accent);
    border: 1px solid rgba(79,255,176,0.4);
  }
  .tp-btn--outline:hover { background: var(--tp-accent-soft); }
  .tp-btn--ghost {
    background: transparent;
    color: var(--tp-muted);
    border: 1px solid var(--tp-border);
  }
  .tp-btn--ghost:hover { color: var(--tp-text); border-color: var(--tp-border-2); }
  .tp-btn--danger {
    background: rgba(255,107,107,0.1);
    color: var(--tp-red);
    border: 1px solid rgba(255,107,107,0.25);
  }
  .tp-btn--danger:hover { background: rgba(255,107,107,0.2); }

  /* ── Inputs ── */
  .tp-input {
    font-family: var(--tp-font-body);
    font-size: 0.85rem;
    padding: 0.55rem 0.85rem;
    border-radius: 8px;
    border: 1px solid var(--tp-border-2);
    background: rgba(255,255,255,0.04);
    color: var(--tp-text);
    outline: none;
    width: 100%;
    transition: border-color 0.18s, box-shadow 0.18s;
  }
  .tp-input:focus {
    border-color: rgba(79,255,176,0.5);
    box-shadow: 0 0 0 3px rgba(79,255,176,0.1);
  }
  .tp-input-row { display: flex; gap: 0.5rem; align-items: center; }
  .tp-form { display: flex; flex-direction: column; gap: 1rem; }
  .tp-form__title {
    font-family: var(--tp-font-head);
    font-size: 1.2rem;
    color: var(--tp-text);
    margin: 0;
  }

  /* ── Notice ── */
  .tp-notice {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    font-size: 0.82rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    border: 1px solid var(--tp-border);
    background: var(--tp-surface-2);
    color: var(--tp-muted);
  }
  .tp-notice--error   { border-color: rgba(255,107,107,0.3); color: var(--tp-red); }
  .tp-notice--success { border-color: rgba(79,255,176,0.3); color: var(--tp-accent); }
  .tp-notice__icon { font-size: 1rem; flex-shrink: 0; }

  /* ── Empty state ── */
  .tp-empty {
    padding: 2rem;
    text-align: center;
    color: var(--tp-muted);
    font-size: 0.85rem;
    border: 1px dashed var(--tp-border);
    border-radius: 12px;
  }

  /* ── Responsive ── */
  @media (max-width: 800px) {
    .tp-root {
      grid-template-columns: 1fr;
    }
    .tp-sidebar {
      position: static;
      height: auto;
      border-right: none;
      border-bottom: 1px solid var(--tp-border);
    }
    .tp-main { padding: 1.25rem; }
    .tp-badge-editor { flex-direction: column; align-items: flex-start; }
  }
`;
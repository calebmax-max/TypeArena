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

  if (loading) {
    return (
      <div className="profile-container">
        Loading profile...
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
        </div>
      </div>
    </div>
  );
}
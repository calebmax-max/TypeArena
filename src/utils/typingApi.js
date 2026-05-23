// API utilities for TypeArena
import { mockUsers, mockTournaments, mockLeaderboard, mockRaceResults } from './mockData';
import { buildApiUrl } from './api';

const ADMIN_TOKEN_KEY = 'typearena_admin_token';
const DEFAULT_ADMIN_EMAIL = 'caleb@gmail.com';
const DEFAULT_ADMIN_PASSWORD = 'Caleb123';

// --- Core Core Utilities ---

const safeJsonParse = (rawValue, fallback = null) => {
  if (!rawValue) return fallback;
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.warn('Failed to parse stored JSON value. Clearing stale browser state.', error);
    return fallback;
  }
};

const getStoredUser = () => {
  const raw = localStorage.getItem('typearena_user');
  return safeJsonParse(raw, null);
};

const syncAdminSessionFromUser = (user) => {
  if (user?.adminToken) {
    localStorage.setItem(ADMIN_TOKEN_KEY, user.adminToken);
    return;
  }
  // Fallback check if your backend returns the admin token as just "token"
  if (user?.isAdmin && user?.token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, user.token);
    return;
  }

  if (!user?.isAdmin) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
};

const sanitizeUser = (user) => {
  if (!user) return user;
  const { passwordHash, adminToken, ...safeUser } = user;
  return safeUser;
};

const setStoredUser = (user) => {
  syncAdminSessionFromUser(user);
  // Save the auth token separately so ChatWidget and other fetch calls
  // can send it as Authorization: Bearer <token>
  if (user?.token) {
    localStorage.setItem('token', user.token);
  }
  localStorage.setItem('typearena_user', JSON.stringify(sanitizeUser(user)));
};

const buildHeaders = (extraHeaders = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  const user = getStoredUser();
  if (user?.id) {
    headers['X-User-Id'] = String(user.id);
  }

  // Attach Bearer token so the backend can authenticate via either mechanism
  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

const buildAdminHeaders = () => {
  const token = getAdminToken();
  if (!token) {
    throw new Error('Admin session not found. Please login again.');
  }
  return {
    ...buildHeaders(),
    'X-Admin-Token': token,
    'Authorization': `Bearer ${token}`, // Added to fix 401 Unauthorized API drops
  };
};

const parseResponse = async (response) => {
  const rawText = await response.text();
  let data = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    const compactText = rawText.replace(/\s+/g, ' ').trim();
    const looksLikeProxyError =
      compactText.toLowerCase().includes('error occurred while trying to proxy') ||
      compactText.toLowerCase().includes('proxy error');

    let message = data?.message;
    if (!message && looksLikeProxyError) {
      message = 'Cannot reach the backend server on port 3001. Start the Python API so /api requests can be served.';
    } else if (!message && compactText.startsWith('<')) {
      message = `Request failed with status ${response.status}. The server returned HTML instead of JSON.`;
    } else if (!message && compactText) {
      message = compactText.slice(0, 220);
    } else if (!message) {
      message = `Request failed with status ${response.status}`;
    }

    const error = new Error(message);
    error.status = response.status;
    error.body = data;
    error.rawBody = rawText;
    throw error;
  }

  return data;
};

const shouldUseLocalFallback = (error) => {
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('cannot reach the backend server on port 3001') ||
    msg.includes('proxy error')
  );
};

const apiFetch = (url, options = {}) =>
  fetch(url, {
    credentials: 'omit',
    ...options,
  });

const normalizeTournamentList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.tournaments)) return payload.tournaments;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

export const getAdminToken = () => localStorage.getItem(ADMIN_TOKEN_KEY);

// --- User APIs ---

export const fetchCurrentUser = async () => {
  try {
    const stored = getStoredUser();
    if (!stored?.id) return null;

    const response = await apiFetch(buildApiUrl('/api/user/me'), {
      headers: buildHeaders(),
    });
    const user = await parseResponse(response);
    // /api/user/me returns a fresh token on every call — persist it immediately
    if (user?.token) {
      localStorage.setItem('token', user.token);
    }
    setStoredUser(user);
    return user;
  } catch (error) {
    console.error('Error fetching user:', error);
    return getStoredUser();
  }
};

export const loginUser = async (email, password) => {
  try {
    const response = await apiFetch(buildApiUrl('/api/auth/login'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const user = await parseResponse(response);
    setStoredUser(user);
    return user;
  } catch (error) {
    console.error('Login error:', error);
    if (shouldUseLocalFallback(error)) {
      throw new Error('Cannot sign in because the backend is unreachable. Start the backend server to use your database account.');
    }
    throw error;
  }
};

export const signupUser = async (username, email, password, phoneNumber) => {
  try {
    const response = await apiFetch(buildApiUrl('/api/auth/signup'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ username, email, password, phoneNumber }),
    });
    const user = await parseResponse(response);
    setStoredUser(user);
    return user;
  } catch (error) {
    console.error('Signup error:', error);
    if (shouldUseLocalFallback(error)) {
      throw new Error('Cannot create the account because the backend is unreachable. Start the backend server so the user can be saved in MySQL.');
    }
    throw error;
  }
};

// --- Tournament APIs ---

export const fetchTournaments = async () => {
  try {
    const response = await apiFetch(buildApiUrl('/api/tournaments'), {
      headers: buildHeaders(),
    });
    const data = await parseResponse(response);
    return normalizeTournamentList(data);
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    return normalizeTournamentList(mockTournaments.map((t) => ({ ...t })));
  }
};

export const joinTournament = async (tournamentId) => {
  try {
    const response = await apiFetch(buildApiUrl(`/api/tournaments/${tournamentId}/join`), {
      method: 'POST',
      headers: buildHeaders(),
    });
    const result = await parseResponse(response);
    if (result?.user) {
      setStoredUser(result.user);
    }
    return result;
  } catch (error) {
    console.error('Error joining tournament:', error);
    throw error;
  }
};

// --- Leaderboard APIs ---

export const fetchLeaderboard = async (limit = 100) => {
  try {
    const response = await apiFetch(buildApiUrl(`/api/leaderboard?limit=${limit}`), {
      headers: buildHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return mockLeaderboard;
  }
};

// --- Race/Results APIs ---

export const submitRaceResult = async (raceData) => {
  try {
    const response = await apiFetch(buildApiUrl('/api/races/submit'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(raceData),
    });
    const result = await parseResponse(response);

    const refreshedUser = await fetchCurrentUser();
    if (refreshedUser) {
      setStoredUser(refreshedUser);
    }
    return result;
  } catch (error) {
    console.error('Error submitting race result:', error);
    throw error;
  }
};

export const fetchRaceHistory = async (userId) => {
  try {
    const response = await apiFetch(buildApiUrl(`/api/users/${userId}/races`), {
      headers: buildHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Error fetching race history:', error);
    return mockRaceResults;
  }
};

// --- User Profile & Wallet APIs ---

export const fetchUserStats = async (userId) => {
  try {
    const response = await apiFetch(buildApiUrl('/api/user/me'), {
      headers: buildHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return mockUsers.find((u) => u.id === userId) || mockUsers[0] || null;
  }
};

export const updateUserProfile = async (userId, updates) => {
  try {
    const response = await apiFetch(buildApiUrl(`/api/users/${userId}`), {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(updates),
    });
    const user = await parseResponse(response);
    setStoredUser(user);
    return user;
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
};

export const addFundsToWallet = async (amount, accountIdentifier, paymentMethod = 'stripe_checkout', currency = 'USD') => {
  try {
    const endpoint = paymentMethod === 'mpesa' ? '/api/mpesa_payment' : '/api/wallet/topup';
    const body =
      paymentMethod === 'mpesa'
        ? {
            amount: Number(amount),
            phone: accountIdentifier,
            phoneNumber: accountIdentifier,
            accountReference: 'account',
            transactionDesc: 'account',
          }
        : {
            amount: Number(amount),
            accountIdentifier,
            paymentMethod,
            currency,
          };
    const response = await apiFetch(buildApiUrl(endpoint), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
    const data = await parseResponse(response);
    if (data?.user) {
      setStoredUser(data.user);
    }
    return data;
  } catch (error) {
    console.error('Error adding funds:', error);
    if (shouldUseLocalFallback(error)) {
      throw new Error('Cannot add funds because the wallet backend is unreachable. Start the backend on port 3001 and try again.');
    }
    throw error;
  }
};

export const verifyWalletTopupSession = async (sessionId) => {
  const response = await apiFetch(buildApiUrl(`/api/wallet/topup/verify?sessionId=${encodeURIComponent(sessionId)}`), {
    headers: buildHeaders(),
  });
  const data = await parseResponse(response);
  if (data?.user) {
    setStoredUser(data.user);
  }
  return data;
};

export const fetchWalletTopupStatus = async (checkoutRequestId) => {
  const response = await apiFetch(
    buildApiUrl(`/api/wallet/topup/status?checkoutRequestId=${encodeURIComponent(checkoutRequestId)}`),
    {
      headers: buildHeaders(),
    }
  );
  const data = await parseResponse(response);
  if (data?.user) {
    setStoredUser(data.user);
  }
  return data;
};

export const withdrawFundsToWallet = async (amount, accountIdentifier, payoutMethod = 'paypal', currency = 'USD') => {
  try {
    const response = await apiFetch(buildApiUrl('/api/wallet/withdraw'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        amount: Number(amount),
        accountIdentifier,
        payoutMethod,
        currency,
      }),
    });
    const data = await parseResponse(response);
    if (data?.user) {
      setStoredUser(data.user);
    }
    return data;
  } catch (error) {
    console.error('Error withdrawing funds:', error);
    if (shouldUseLocalFallback(error)) {
      throw new Error('Cannot withdraw because the wallet backend is unreachable. Start the backend on port 3001 and try again.');
    }
    throw error;
  }
};

export const fetchWalletWithdrawStatus = async (payoutCode) => {
  const response = await apiFetch(
    buildApiUrl(`/api/wallet/withdraw/status?payoutCode=${encodeURIComponent(payoutCode)}`),
    {
      headers: buildHeaders(),
    }
  );
  const data = await parseResponse(response);
  if (data?.user) {
    setStoredUser(data.user);
  }
  return data;
};

export const fetchWalletHistory = async () => {
  try {
    const response = await apiFetch(buildApiUrl('/api/wallet/history'), {
      headers: buildHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Error fetching wallet history:', error);
    return { items: [] };
  }
};

export const fetchWalletConfig = async () => {
  try {
    const response = await apiFetch(buildApiUrl('/api/wallet/config'), {
      headers: buildHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Error fetching wallet config:', error);
    return { topUpMethods: [], withdrawMethods: [] };
  }
};

export const sendPrizeToWinner = async ({ userId, amount, tournamentId = null }) => {
  try {
    const response = await apiFetch(buildApiUrl('/api/prizes/payout'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ userId, amount, tournamentId }),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Error sending prize payout:', error);
    throw error;
  }
};

// --- Admin Infrastructure APIs ---

export const adminLogin = async (email, password) => {
  try {
    const response = await apiFetch(buildApiUrl('/api/admin/login'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await parseResponse(response);
    if (data?.token) {
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
    }
    return data;
  } catch (error) {
    console.error('Admin login error:', error);
    if (shouldUseLocalFallback(error)) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedPassword = String(password || '').trim();
      if (
        normalizedEmail === DEFAULT_ADMIN_EMAIL.toLowerCase() &&
        normalizedPassword === DEFAULT_ADMIN_PASSWORD
      ) {
        const offlineToken = `offline_admin_${Date.now()}`;
        localStorage.setItem(ADMIN_TOKEN_KEY, offlineToken);
        return { token: offlineToken, adminEmail: DEFAULT_ADMIN_EMAIL, mode: 'offline' };
      }
      throw new Error('Invalid admin credentials.');
    }
    throw error;
  }
};

export const adminLogout = () => {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
};

export const adminCreateTournament = async (payload) => {
  try {
    const response = await apiFetch(buildApiUrl('/api/admin/tournaments'), {
      method: 'POST',
      headers: buildAdminHeaders(),
      body: JSON.stringify(payload),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Admin create tournament error:', error);
    throw error;
  }
};

export const adminDeleteTournament = async (tournamentId) => {
  try {
    const response = await apiFetch(buildApiUrl(`/api/admin/tournaments/${tournamentId}`), {
      method: 'DELETE',
      headers: buildAdminHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Admin delete tournament error:', error);
    throw error;
  }
};

export const adminDeleteAllTournaments = async () => {
  try {
    const response = await apiFetch(buildApiUrl('/api/admin/tournaments'), {
      method: 'DELETE',
      headers: buildAdminHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Admin clear tournaments error:', error);
    throw error;
  }
};

export const adminUpdateTournament = async (tournamentId, payload) => {
  try {
    const response = await apiFetch(buildApiUrl(`/api/admin/tournaments/${tournamentId}`), {
      method: 'PUT',
      headers: buildAdminHeaders(),
      body: JSON.stringify(payload),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Admin update tournament error:', error);
    throw error;
  }
};

export const fetchTournamentParticipants = async (tournamentId) => {
  try {
    const response = await apiFetch(buildApiUrl(`/api/admin/tournaments/${tournamentId}/participants`), {
      headers: buildAdminHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Error fetching tournament participants:', error);
    return [];
  }
};

export const fetchTournamentWinner = async (tournamentId) => {
  try {
    const response = await apiFetch(buildApiUrl(`/api/tournaments/${tournamentId}/winner`), {
      headers: buildHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Error fetching tournament winner:', error);
    return null;
  }
};

export const fetchAdminAnalytics = async () => {
  try {
    const response = await apiFetch(buildApiUrl('/api/admin/analytics'), {
      headers: buildAdminHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Admin analytics error:', error);
    return {
      revenueToday: 0,
      tournamentEntries: 0,
      totalPayouts: 0,
      activePlayers: 0,
      mpesaTransactions: 0,
      mpesaVolume: 0,
      topPlayers: [],
    };
  }
};

export const fetchAdminAiSettings = async () => {
  try {
    const response = await apiFetch(buildApiUrl('/api/admin/ai-settings'), {
      headers: buildAdminHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Admin AI settings fetch error:', error);
    return { provider: 'auto', model: 'gpt-5.2', hasApiKey: false };
  }
};

export const updateAdminAiSettings = async (payload) => {
  const response = await apiFetch(buildApiUrl('/api/admin/ai-settings'), {
    method: 'PUT',
    headers: buildAdminHeaders(),
    body: JSON.stringify(payload),
  });
  return await parseResponse(response);
};

export const fetchSiteMarquee = async () => {
  try {
    const response = await apiFetch(buildApiUrl('/api/site-marquee'), {
      headers: buildHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Site marquee fetch error:', error);
    return {
      items: [
        'Product Update',
        'Private friend battles are live now.',
        'Wallet top-up, tournaments, and marketplace are active.',
      ],
    };
  }
};

export const fetchAdminSiteMarquee = async () => {
  try {
    const response = await apiFetch(buildApiUrl('/api/admin/site-marquee'), {
      headers: buildAdminHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Admin site marquee fetch error:', error);
    return {
      items: [
        'Product Update',
        'Private friend battles are live now.',
        'Wallet top-up, tournaments, and marketplace are active.',
      ],
    };
  }
};

export const updateAdminSiteMarquee = async (payload) => {
  const response = await apiFetch(buildApiUrl('/api/admin/site-marquee'), {
    method: 'PUT',
    headers: buildAdminHeaders(),
    body: JSON.stringify(payload),
  });
  return await parseResponse(response);
};

export const fetchAdminWallet = async () => {
  try {
    const response = await apiFetch(buildApiUrl('/api/admin/wallet'), {
      headers: buildAdminHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Admin wallet fetch error:', error);
    return {
      adminEmail: '',
      adminUsername: 'Admin',
      balance: 0,
      marketplaceRevenueTotal: 0,
      history: { items: [] },
    };
  }
};

export const addFundsToAdminWallet = async (amount, note = '') => {
  const response = await apiFetch(buildApiUrl('/api/admin/wallet/topup'), {
    method: 'POST',
    headers: buildAdminHeaders(),
    body: JSON.stringify({ amount: Number(amount), note }),
  });
  return await parseResponse(response);
};

export const withdrawFromAdminWallet = async (amount, note = '') => {
  const response = await apiFetch(buildApiUrl('/api/admin/wallet/withdraw'), {
    method: 'POST',
    headers: buildAdminHeaders(),
    body: JSON.stringify({ amount: Number(amount), note }),
  });
  return await parseResponse(response);
};

// --- Live Race Mechanics & System APIs ---

export const queueLiveRace = async (payload) => {
  const response = await apiFetch(buildApiUrl('/api/live-races/queue'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseResponse(response);
  if (data?.user) {
    setStoredUser(data.user);
  }
  return data;
};

export const fetchLiveRaces = async () => {
  const response = await apiFetch(buildApiUrl('/api/live-races'), {
    headers: buildHeaders(),
  });
  return await parseResponse(response);
};

export const fetchLiveRaceRoom = async (roomId) => {
  const response = await apiFetch(buildApiUrl(`/api/live-races/${roomId}`), {
    headers: buildHeaders(),
  });
  return await parseResponse(response);
};

export const fetchLiveRaceByInvite = async (inviteCode) => {
  const response = await apiFetch(buildApiUrl(`/api/live-races/invite/${inviteCode}`), {
    headers: buildHeaders(),
  });
  return await parseResponse(response);
};

export const cancelLiveRaceRoom = async (roomId) => {
  const response = await apiFetch(buildApiUrl(`/api/live-races/${roomId}/cancel`), {
    method: 'POST',
    headers: buildHeaders(),
  });
  const data = await parseResponse(response);
  if (data?.user) {
    setStoredUser(data.user);
  }
  return data;
};

export const updateLiveRaceHeartbeat = async (roomId, payload) => {
  const response = await apiFetch(buildApiUrl(`/api/live-races/${roomId}/heartbeat`), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  return await parseResponse(response);
};

export const submitLiveRaceResult = async (roomId, payload) => {
  const response = await apiFetch(buildApiUrl(`/api/live-races/${roomId}/submit`), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseResponse(response);
  const refreshedUser = await fetchCurrentUser();
  if (refreshedUser) {
    setStoredUser(refreshedUser);
  }
  return data;
};

export const generateRaceContent = async (mode, language) => {
  try {
    const response = await apiFetch(
      buildApiUrl(`/api/race-content/generate?mode=${encodeURIComponent(mode)}&language=${encodeURIComponent(language)}`),
      { headers: buildHeaders() }
    );
    return await parseResponse(response);
  } catch (error) {
    console.error('Error generating race content:', error);
    return {
      title: 'Business Sprint',
      passage: 'Premium typing rooms reward accuracy, focus, and consistency across every high-pressure round.',
      antiCheatHint: 'Fresh passages reduce repetition.',
    };
  }
};

// --- Marketplace & Store Catalog APIs ---

export const fetchStoreCatalog = async () => {
  try {
    const response = await apiFetch(buildApiUrl('/api/store/catalog'), {
      headers: buildHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Error fetching store catalog:', error);
    return { items: [] };
  }
};

export const purchaseStoreItem = async (itemId) => {
  const response = await apiFetch(buildApiUrl('/api/store/purchase'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ itemId }),
  });
  const data = await parseResponse(response);
  if (data?.user) {
    setStoredUser(data.user);
  }
  return data;
};

export const purchaseStoreBundle = async (bundleId) => {
  const response = await apiFetch(buildApiUrl('/api/store/bundle-purchase'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ bundleId }),
  });
  const data = await parseResponse(response);
  if (data?.user) {
    setStoredUser(data.user);
  }
  return data;
};
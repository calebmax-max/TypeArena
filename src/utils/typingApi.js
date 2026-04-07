// API utilities for TypeArena
import { mockUsers, mockTournaments, mockLeaderboard, mockRaceResults } from './mockData';
import { buildApiUrl } from './api';

const ADMIN_TOKEN_KEY = 'typearena_admin_token';
const DEFAULT_ADMIN_EMAIL = 'caleb@gmail.com';
const DEFAULT_ADMIN_PASSWORD = 'Caleb123';

const getStoredUser = () => {
  const raw = localStorage.getItem('typearena_user');
  return raw ? JSON.parse(raw) : null;
};

const sanitizeUser = (user) => {
  if (!user) return user;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
};

const setStoredUser = (user) => {
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

  return headers;
};

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || 'Request failed';
    throw new Error(message);
  }
  return data;
};

const shouldUseLocalFallback = (error) => {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed');
};

const buildAdminHeaders = () => {
  const token = getAdminToken();
  if (!token) {
    throw new Error('Admin session not found. Please login again.');
  }
  return {
    ...buildHeaders(),
    'X-Admin-Token': token,
  };
};

// User APIs
export const fetchCurrentUser = async () => {
  try {
    const stored = getStoredUser();
    if (!stored?.id) return null;

    const response = await fetch(buildApiUrl('/api/user/me'), {
      headers: buildHeaders(),
    });
    const user = await parseResponse(response);
    setStoredUser(user);
    return user;
  } catch (error) {
    console.error('Error fetching user:', error);
    return getStoredUser();
  }
};

export const loginUser = async (email, password) => {
  try {
    const response = await fetch(buildApiUrl('/api/auth/login'), {
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
    const response = await fetch(buildApiUrl('/api/auth/signup'), {
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

// Tournament APIs
export const fetchTournaments = async () => {
  try {
    const response = await fetch(buildApiUrl('/api/tournaments'), {
      headers: buildHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    return mockTournaments.map((t) => ({ ...t }));
  }
};

export const joinTournament = async (tournamentId) => {
  try {
    const response = await fetch(buildApiUrl(`/api/tournaments/${tournamentId}/join`), {
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

// Leaderboard APIs
export const fetchLeaderboard = async (limit = 100) => {
  try {
    const response = await fetch(buildApiUrl(`/api/leaderboard?limit=${limit}`), {
      headers: buildHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return mockLeaderboard;
  }
};

// Race/Results APIs
export const submitRaceResult = async (raceData) => {
  try {
    const response = await fetch(buildApiUrl('/api/races/submit'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(raceData),
    });
    const result = await parseResponse(response);

    // Refresh local user snapshot after race updates
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
    const response = await fetch(buildApiUrl(`/api/users/${userId}/races`), {
      headers: buildHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Error fetching race history:', error);
    return mockRaceResults;
  }
};

// User Profile APIs
export const fetchUserStats = async (userId) => {
  try {
    const response = await fetch(buildApiUrl('/api/user/me'), {
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
    const response = await fetch(buildApiUrl(`/api/users/${userId}`), {
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
    const response = await fetch(buildApiUrl('/api/wallet/topup'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        amount: Number(amount),
        accountIdentifier,
        paymentMethod,
        currency,
      }),
    });
    const data = await parseResponse(response);
    if (data?.user) {
      setStoredUser(data.user);
    }
    return data;
  } catch (error) {
    console.error('Error adding funds:', error);
    throw error;
  }
};

export const verifyWalletTopupSession = async (sessionId) => {
  const response = await fetch(buildApiUrl(`/api/wallet/topup/verify?sessionId=${encodeURIComponent(sessionId)}`), {
    headers: buildHeaders(),
  });
  const data = await parseResponse(response);
  if (data?.user) {
    setStoredUser(data.user);
  }
  return data;
};

export const withdrawFundsToWallet = async (amount, accountIdentifier, payoutMethod = 'paypal', currency = 'USD') => {
  try {
    const response = await fetch(buildApiUrl('/api/wallet/withdraw'), {
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
    throw error;
  }
};

export const fetchWalletHistory = async () => {
  try {
    const response = await fetch(buildApiUrl('/api/wallet/history'), {
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
    const response = await fetch(buildApiUrl('/api/wallet/config'), {
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
    const response = await fetch(buildApiUrl('/api/prizes/payout'), {
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

export const adminLogin = async (email, password) => {
  try {
    const response = await fetch(buildApiUrl('/api/admin/login'), {
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

export const getAdminToken = () => localStorage.getItem(ADMIN_TOKEN_KEY);

export const adminCreateTournament = async (payload) => {
  try {
    const response = await fetch(buildApiUrl('/api/admin/tournaments'), {
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
    const response = await fetch(buildApiUrl(`/api/admin/tournaments/${tournamentId}`), {
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
    const response = await fetch(buildApiUrl('/api/admin/tournaments'), {
      method: 'DELETE',
      headers: buildAdminHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Admin clear tournaments error:', error);
    throw error;
  }
};

export const fetchAdminAnalytics = async () => {
  try {
    const response = await fetch(buildApiUrl('/api/admin/analytics'), {
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
    const response = await fetch(buildApiUrl('/api/admin/ai-settings'), {
      headers: buildAdminHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Admin AI settings fetch error:', error);
    return { provider: 'auto', model: 'gpt-5.2', hasApiKey: false };
  }
};

export const updateAdminAiSettings = async (payload) => {
  const response = await fetch(buildApiUrl('/api/admin/ai-settings'), {
    method: 'PUT',
    headers: buildAdminHeaders(),
    body: JSON.stringify(payload),
  });
  return await parseResponse(response);
};

export const queueLiveRace = async (payload) => {
  const response = await fetch(buildApiUrl('/api/live-races/queue'), {
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
  const response = await fetch(buildApiUrl('/api/live-races'), {
    headers: buildHeaders(),
  });
  return await parseResponse(response);
};

export const fetchLiveRaceRoom = async (roomId) => {
  const response = await fetch(buildApiUrl(`/api/live-races/${roomId}`), {
    headers: buildHeaders(),
  });
  return await parseResponse(response);
};

export const fetchLiveRaceByInvite = async (inviteCode) => {
  const response = await fetch(buildApiUrl(`/api/live-races/invite/${inviteCode}`), {
    headers: buildHeaders(),
  });
  return await parseResponse(response);
};

export const cancelLiveRaceRoom = async (roomId) => {
  const response = await fetch(buildApiUrl(`/api/live-races/${roomId}/cancel`), {
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
  const response = await fetch(buildApiUrl(`/api/live-races/${roomId}/heartbeat`), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  return await parseResponse(response);
};

export const submitLiveRaceResult = async (roomId, payload) => {
  const response = await fetch(buildApiUrl(`/api/live-races/${roomId}/submit`), {
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
    const response = await fetch(
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

export const fetchStoreCatalog = async () => {
  try {
    const response = await fetch(buildApiUrl('/api/store/catalog'), {
      headers: buildHeaders(),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('Error fetching store catalog:', error);
    return { items: [] };
  }
};

export const purchaseStoreItem = async (itemId) => {
  const response = await fetch(buildApiUrl('/api/store/purchase'), {
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

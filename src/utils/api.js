// src/utils/api.js

const envApiBase = (
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  ''
).trim();
const normalizedEnvApiBase = envApiBase.replace(/\/+$/, '');

export const API_BASE =
  normalizedEnvApiBase ||
  '';

export const buildApiUrl = (path) => {
  if (!path) {
    return API_BASE;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!API_BASE) {
    return normalizedPath;
  }

  if (API_BASE.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${API_BASE}${normalizedPath.slice(4)}`;
  }

  return `${API_BASE}${normalizedPath}`;
};

/**
 * Fetches the top competitive players from the backend database
 * Uses buildApiUrl to automatically adapt to local or production URLs.
 * @param {number} limit - Maximum number of profiles to request (default 100)
 */
export async function fetchLeaderboard(limit = 100) {
  try {
    const url = buildApiUrl(`/api/leaderboard?limit=${limit}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Server returned error status code: ${response.status}`);
    }
    
    const data = await response.json();
    return data; // Returns the parsed array of player rankings
  } catch (error) {
    console.error("API Error fetching competitive rankings:", error);
    throw error;
  }
}
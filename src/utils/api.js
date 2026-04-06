// src/utils/api.js

const envApiBase = (
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  ''
).trim();
const normalizedEnvApiBase = envApiBase.replace(/\/+$/, '');
const ALWAYS_DATA_SITE = 'https://faithmutheu1.alwaysdata.net';

export const API_BASE =
  normalizedEnvApiBase ||
  (process.env.NODE_ENV === 'production' ? '' : ALWAYS_DATA_SITE);

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

// src/utils/api.js

const envApiBase = (
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  ''
).trim();
const normalizedEnvApiBase = envApiBase.replace(/\/+$/, '');
const isBrowser = typeof window !== 'undefined';
const browserHostname = isBrowser ? window.location.hostname : '';
const browserProtocol = isBrowser ? window.location.protocol : 'http:';
const isLocalBrowser = browserHostname === 'localhost' || browserHostname === '127.0.0.1';
const localApiBase = isLocalBrowser ? `${browserProtocol}//${browserHostname}:3001` : '';

export const API_BASE =
  normalizedEnvApiBase ||
  (process.env.NODE_ENV === 'production' ? '' : localApiBase);

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

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

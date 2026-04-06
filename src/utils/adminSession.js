const ADMIN_SESSION_KEY = 'elitehotels-admin-session';

export const getAdminSession = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const savedSession = window.sessionStorage.getItem(ADMIN_SESSION_KEY);
    return savedSession ? JSON.parse(savedSession) : null;
  } catch (error) {
    return null;
  }
};

export const setAdminSession = (admin) => {
  if (typeof window === 'undefined') {
    return null;
  }

  const session = {
    email: admin.email,
    name: admin.name || 'Caleb Tonny',
    isAdmin: Boolean(admin.isAdmin),
    role: admin.role || 'admin',
    signedInAt: admin.signedInAt || new Date().toISOString(),
  };

  window.sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  return session;
};

export const clearAdminSession = () => {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
  }
};

export const isAdminAuthenticated = () => {
  const session = getAdminSession();
  return Boolean(session?.isAdmin);
};

export const isKitchenAuthenticated = () => {
  const session = getAdminSession();
  return Boolean(session?.role === 'kitchen' || session?.isAdmin);
};

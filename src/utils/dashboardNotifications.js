export const getBrowserNotificationPermission = () => {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported';
  }

  return window.Notification.permission;
};

export const requestBrowserNotificationPermission = async () => {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported';
  }

  return window.Notification.requestPermission();
};

export const showBrowserNotification = (title, body) => {
  if (
    typeof window === 'undefined' ||
    typeof window.Notification === 'undefined' ||
    window.Notification.permission !== 'granted'
  ) {
    return null;
  }

  return new window.Notification(title, { body });
};

import { useEffect, useState } from 'react';

const IOS_HINT_KEY = 'typearena:ios-hint-dismissed';

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  const ua = window.navigator.userAgent;
  const iPhoneOrPod = /iphone|ipod/i.test(ua);
  // Newer iPads report themselves as a Mac but have a touch screen.
  const iPad =
    /ipad/i.test(ua) ||
    (/Macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);
  return iPhoneOrPod || iPad;
}

function readDismissed() {
  try {
    return window.localStorage.getItem(IOS_HINT_KEY) === '1';
  } catch (e) {
    return false;
  }
}

const buttonStyle = {
  background: '#22c55e',
  color: '#04130a',
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  fontWeight: 600,
  cursor: 'pointer',
};

/**
 * Shows "Install TypeArena" when the browser allows installing (Android
 * Chrome and most desktop browsers), or a short how-to on iPhone/iPad.
 * Shows nothing when the app is already installed or installing isn't possible.
 */
export function InstallButton({ className = '' }) {
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [iosHintDismissed, setIosHintDismissed] = useState(() => readDismissed());

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault(); // keep the event so our own button can use it
      setInstallEvent(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  if (installEvent) {
    const install = async () => {
      installEvent.prompt();
      await installEvent.userChoice;
      setInstallEvent(null); // the event can only be used once
    };
    return (
      <button type="button" className={className} style={buttonStyle} onClick={install}>
        Install TypeArena
      </button>
    );
  }

  if (isIos() && !iosHintDismissed) {
    const dismiss = () => {
      setIosHintDismissed(true);
      try {
        window.localStorage.setItem(IOS_HINT_KEY, '1');
      } catch (e) {
        /* storage unavailable; the hint just shows again next visit */
      }
    };
    return (
      <div
        className={className}
        role="note"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          borderRadius: 8,
          background: '#1c1c1c',
          color: '#f2f2f2',
          fontSize: 14,
        }}
      >
        <span>
          To install TypeArena, tap the Share button, then choose Add to Home Screen.
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install tip"
          style={{ ...buttonStyle, background: '#333', color: '#f2f2f2', padding: '4px 10px' }}
        >
          Got it
        </button>
      </div>
    );
  }

  return null;
}

/**
 * Appears after a deploy when a new version has been downloaded.
 * The player chooses when to refresh, so a live race is never interrupted.
 */
export function UpdateBanner() {
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    const onUpdate = (event) => setRegistration(event.detail);
    window.addEventListener('typearena:sw-update', onUpdate);
    return () => window.removeEventListener('typearena:sw-update', onUpdate);
  }, []);

  if (!registration) return null;

  const refresh = () => {
    if (!registration.waiting) {
      window.location.reload();
      return;
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 10,
        background: '#1c1c1c',
        color: '#f2f2f2',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      }}
    >
      <span>A new version of TypeArena is ready.</span>
      <button type="button" style={buttonStyle} onClick={refresh}>
        Refresh
      </button>
    </div>
  );
}
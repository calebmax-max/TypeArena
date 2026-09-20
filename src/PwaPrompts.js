import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

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
 * A floating "Install app" button on the left side of the screen.
 *  - Android Chrome and most desktop browsers: tapping it opens the browser's
 *    install prompt. The button disappears as soon as the app is installed
 *    (whether from this button or from the browser menu).
 *  - iPhone/iPad Safari: shows a short "Share, then Add to Home Screen" tip.
 *  - Shows nothing when the app is already installed / opened as an app, or
 *    when the browser doesn't offer installing.
 *  - Pass `forceHidden` to keep it out of the way while something else (the
 *    onboarding tour, say) is on screen. It reappears on its own once
 *    `forceHidden` goes back to false.
 */
export function InstallButton({ className = '', forceHidden = false }) {
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [hidden, setHidden] = useState(false); // hidden with the x, until the page is reloaded
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

  if (installed || hidden || forceHidden) return null;

  const floatingStyle = {
    position: 'fixed',
    left: 'calc(12px + env(safe-area-inset-left, 0px))',
    bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    maxWidth: 'calc(100vw - 24px)',
  };

  if (installEvent) {
    const install = async () => {
      installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null); // the event can only be used once
      if (choice && choice.outcome === 'accepted') setInstalled(true);
    };
    return (
      <div className={className} style={floatingStyle}>
        <button
          type="button"
          onClick={install}
          style={{
            ...buttonStyle,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 999,
            padding: '10px 16px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <polyline points="7 11 12 16 17 11" />
            <path d="M5 20h14" />
          </svg>
          Install app
        </button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Hide install button"
          style={{
            width: 28,
            height: 28,
            padding: 0,
            border: 'none',
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.65)',
            color: '#f2f2f2',
            fontSize: 16,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          &times;
        </button>
      </div>
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
          ...floatingStyle,
          gap: 12,
          padding: '10px 14px',
          borderRadius: 12,
          background: '#1c1c1c',
          color: '#f2f2f2',
          fontSize: 14,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
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

/**
 * Shown at the top of the page while the phone has no internet, and briefly
 * confirms when the connection comes back.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => window.navigator.onLine);
  const [justReconnected, setJustReconnected] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let timer = null;
    const goOffline = () => {
      window.clearTimeout(timer);
      setJustReconnected(false);
      setOnline(false);
    };
    const goOnline = () => {
      setOnline(true);
      setJustReconnected(true);
      timer = window.setTimeout(() => setJustReconnected(false), 3000);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (online && !justReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: '8px 14px',
        textAlign: 'center',
        fontSize: 14,
        fontWeight: 600,
        background: online ? '#22c55e' : '#f59e0b',
        color: '#111',
      }}
    >
      {online ? (
        "You're back online."
      ) : (
        <>
          You're offline. Reconnect to race, use your wallet or join tournaments.
          {location.pathname !== '/training' && (
            <>
              {' '}
              <Link to="/training" style={{ color: '#111', textDecoration: 'underline' }}>
                Practice offline in Training
              </Link>
            </>
          )}
        </>
      )}
    </div>
  );
}
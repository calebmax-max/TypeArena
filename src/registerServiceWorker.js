// Registers the service worker in production builds only, so it never gets
// in the way of `npm start`.

function announceUpdate(registration) {
  window.dispatchEvent(
    new CustomEvent('typearena:sw-update', { detail: registration })
  );
}

export function register() {
  if (process.env.NODE_ENV !== 'production') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        // A new worker was already downloaded and is waiting.
        if (registration.waiting && navigator.serviceWorker.controller) {
          announceUpdate(registration);
        }

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              announceUpdate(registration);
            }
          });
        });
      })
      .catch((error) => {
        console.error('Service worker registration failed:', error);
      });
  });
}
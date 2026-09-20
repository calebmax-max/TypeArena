/* TypeArena service worker
 *
 * Rules:
 *  - Only same-origin GET requests are ever handled. Everything else (POST,
 *    other domains, WebSockets) goes straight to the network untouched.
 *  - Only static build files are cached (JS, CSS, icons, fonts). API,
 *    /socket.io, wallet and M-Pesa calls are never cached.
 *  - Page loads are network-first, so players get the latest build whenever
 *    they are online. The cached page is only a fallback when offline, which
 *    lets the app open (and pages like Training load) without internet.
 *  - On install, every file listed in the build's asset-manifest.json is
 *    saved, including the lazy-loaded page chunks, so pages work offline
 *    even if the player never visited them before going offline.
 *
 * BUILD_ID is replaced automatically by `npm run build` (see
 * scripts/stamp-sw.js). Each build therefore gets a fresh worker and cache.
 */
const BUILD_ID = '__BUILD_ID__';
const SHELL_CACHE = `typearena-shell-${BUILD_ID}`;
const STATIC_CACHE = `typearena-static-${BUILD_ID}`;

const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png',
];

async function precacheBuild() {
  const shell = await caches.open(SHELL_CACHE);
  // A missing optional file must not block installation.
  await Promise.all(SHELL_FILES.map((url) => shell.add(url).catch(() => null)));

  try {
    const response = await fetch('/asset-manifest.json', { cache: 'no-store' });
    const manifest = await response.json();
    const urls = Object.values(manifest.files || {}).filter(
      (url) =>
        typeof url === 'string' &&
        url.startsWith('/') &&
        !url.endsWith('.map') &&
        !url.endsWith('index.html')
    );
    const statics = await caches.open(STATIC_CACHE);
    await Promise.all(urls.map((url) => statics.add(url).catch(() => null)));
  } catch (error) {
    // No manifest (or offline during install): runtime caching still works.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheBuild());
  // No skipWaiting() here: the page asks for it when the player taps
  // "Refresh", so a race in progress is never interrupted.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith('typearena-') &&
                key !== SHELL_CACHE &&
                key !== STATIC_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/static/') ||
    /\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$/i.test(url.pathname) ||
    url.pathname === '/manifest.json'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never handle live or money-related routes, even if a rule below matches.
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/ws')
  ) {
    return;
  }

  // Page loads: network first, cached page only when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // Static files: cache first (build files have unique hashed names).
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
  }
  // Anything else falls through to the network.
});
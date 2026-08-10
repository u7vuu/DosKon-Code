// DoseKon — offline app-shell cache.
// Bump this version any time index.html (or any other shipped app-shell file)
// changes, so returning users pick up the update instead of a stale cache.
const VERSION = 'v4'; // تم رفعه بعد تحديث firebaseConfig داخل index.html
const SHELL_CACHE = `dosekon-shell-${VERSION}`;
const FONT_CACHE = 'dosekon-fonts';
const DATA_CACHE = 'dosekon-data';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
];

// Requests under this path are the medication data (assets/appdata.json) —
// handled with a different strategy below so edits to it reach users the
// next time they're online, without waiting for an app-shell version bump.
const DATA_PATH = '/assets/appdata.json';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== FONT_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Google Fonts: cache-first, fetch once and reuse forever offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
        })
      )
    );
    return;
  }

  // Medication data: network-first. Whenever the device is online, the
  // freshest data.json wins immediately — no waiting for the next app-shell
  // update. If the network fails (offline), fall back to the last copy that
  // was successfully cached, so the calculator keeps working offline.
  if (url.pathname.endsWith(DATA_PATH)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            caches.open(DATA_CACHE).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.open(DATA_CACHE).then((cache) => cache.match(request)))
    );
    return;
  }

  // App shell (same-origin): cache-first for instant, offline-safe loads;
  // refresh the cache in the background whenever the network is available.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

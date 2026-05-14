// CodedOK service worker.
// Strategy:
//   - HTML / JS / CSS / codes.js / store.js / app.js: network-first (always
//     get the latest when online, fall back to cache when offline)
//   - Fonts / icons / images: cache-first (rarely change, big files)
// Bump CACHE_VERSION whenever you ship — old caches are deleted on activate.
const CACHE_VERSION = 'codedok-v82';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './codes.js',
  './store.js',
  './parseSurveyReport.js',
  './supabase-client.js',
  './sync.js',
  './app.js',
  './init-sentry.js',
  './manifest.webmanifest',
  './fonts/PlusJakartaSans-latin.woff2',
  './icons/icon-120.png',
  './icons/icon-152.png',
  './icons/icon-167.png',
  './icons/icon-180.png',
  './icons/icon-512.png',
  './icons/codedok-mark.svg',
  './icons/mccollam.webp'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isAppShell(url, req) {
  // HTML navigations (the user typing a URL or clicking a link) always
  // get the app-shell treatment, regardless of path shape. Covers
  // /welcome, /something/else, /, and /index.html.
  if (req && req.mode === 'navigate') return true;
  return /(\.html|\.css|\.js|\.json|\/)$/.test(url.pathname) && !/\.woff2?$/.test(url.pathname);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Skip cross-origin requests entirely. If we intercepted them and the
  // fetch failed, our fallback (./index.html) would return HTML for what
  // was meant to be a JS module — breaking dynamic ES module imports
  // from CDNs like esm.sh ("text/html is not a valid JavaScript MIME
  // type"). Let the browser handle these directly.
  if (url.origin !== self.location.origin) return;

  if (isAppShell(url, req)) {
    // Network-first for code/markup — never serve stale UI when online.
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for static assets (fonts, icons, images, vessel photos).
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ────────────────────────────────────────────────────────────────
// Web push — expiry reminders fired by the send-reminders edge fn.
// Payload shape (JSON): { title, body, url, tag }
// ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    data = { title: 'CodedOK', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'CodedOK';
  const opts = {
    body: data.body || '',
    icon: './icons/icon-180.png',
    badge: './icons/icon-180.png',
    tag: data.tag || 'codedok-reminder',
    renotify: true,
    data: { url: data.url || './' }
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes(self.location.origin)) {
        await c.focus();
        try { c.postMessage({ type: 'open', url: target }); } catch (_) {}
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

// CodedOK service worker.
// Strategy:
//   - HTML / JS / CSS / codes.js / store.js / app.js: network-first (always
//     get the latest when online, fall back to cache when offline)
//   - Fonts / icons / images: cache-first (rarely change, big files)
// Bump CACHE_VERSION whenever you ship — old caches are deleted on activate.
const CACHE_VERSION = 'codedok-v9';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './codes.js',
  './store.js',
  './parseSurveyReport.js',
  './app.js',
  './manifest.webmanifest',
  './fonts/PlusJakartaSans-latin.woff2',
  './icons/icon-120.png',
  './icons/icon-152.png',
  './icons/icon-167.png',
  './icons/icon-180.png',
  './icons/icon-512.png'
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

function isAppShell(url) {
  return /(\.html|\.css|\.js|\.json|\/)$/.test(url.pathname) && !/\.woff2?$/.test(url.pathname);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isAppShell(url)) {
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

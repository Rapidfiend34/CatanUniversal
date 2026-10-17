/* These constants are populated by the production build. */
const VERSION = '__CACHE_VERSION__';
const PRECACHE = __PRECACHE_MANIFEST__;
const PREFIX = 'isla-universal-pwa-';
const CACHE = PREFIX + VERSION;
const assets = new Set(PRECACHE);

self.addEventListener('install', event => {
  // Installation is atomic: an incomplete download never replaces a working version.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  // The interface sends this only after the player confirms an update.
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  // Never intercept authentication, mutations, cross-origin traffic or room data.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || request.headers.has('Authorization')) return;
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    // Serve a consistent, precached shell until the user opts into a new version.
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match('/index.html')) || fetch(request)));
  } else if (assets.has(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(request)));
  }
});

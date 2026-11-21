// Offline cache: app files network-first, sprite sheets cache-first.
const CACHE = 'daycare-v1';
const APP = 'daycare-app-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'raw.githubusercontent.com') {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
  } else if (url.origin === self.location.origin) {
    // no-cache: always ask the Mac whether the file changed (a cheap 304 when it hasn't).
    e.respondWith(fetch(url.href, { cache: 'no-cache' }).then((res) => {
      const copy = res.clone();
      if (res.ok) caches.open(APP).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { cacheName: APP })));
  }
});

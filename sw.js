// Daily Banana service worker: lets Chrome install the game as an app, and keeps it working on a bad connection.
// Always tries the network first, so players never get stuck on an old daily; the cache is only a fallback.
const CACHE = 'dailybanana-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/data/items.json', '/data/dailies.json', '/favicon.svg'])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  // only plain page/file loads from this site; scores, sign-in and everything else go straight to the network
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/.netlify/') || u.pathname.startsWith('/discord') || u.pathname.startsWith('/social-img')) return;
  e.respondWith(fetch(r).then((res) => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(r).then((m) => m || caches.match('/'))));
});

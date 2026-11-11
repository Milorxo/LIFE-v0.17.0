/* LIFE service worker. Works offline.
   - index.html, the manifest and the service worker itself: network first, so a new version on GitHub shows up.
   - art.css, art.js and the icons never change between visits: cache first, so they are not downloaded again. */
const CACHE = 'life-v0.15.0';
const CORE = ['./', './index.html', './art.css', './art.js', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './icon.svg'];
const STATIC = /\/(art\.(css|js)|icon[^/]*\.(png|svg)|apple-touch-icon\.png)$/;
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const put = (r, res) => { if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)).catch(() => {}); } return res; };
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  if (STATIC.test(new URL(r.url).pathname)) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => put(r, res))));
    return;
  }
  e.respondWith(fetch(r).then(res => put(r, res))
    .catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('./index.html') || caches.match('./') : Response.error()))));
});

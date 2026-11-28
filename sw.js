// Service worker: apka sa otvorí okamžite z pamäte telefónu – aj bez signálu.
// Pri novej verzii (zmenené CACHE) sa súbory stiahnu načisto zo servera
// (cache: 'reload' – obíde 10-minútovú pamäť GitHub Pages) a apka sa sama reštartuje.
const CACHE = 'fitko-v19';
const SHELL = ['./', 'index.html', 'app.css', 'calc.js', 'app.js',
  'fonts/barlow-700-latin.woff2', 'fonts/barlow-700-latin-ext.woff2', 'fonts/barlow-800-latin.woff2', 'fonts/barlow-800-latin-ext.woff2', 'fonts/barlow-800i-latin.woff2', 'fonts/barlow-800i-latin-ext.woff2', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Google požiadavky necacheujeme
  if (/\/(trener\.html|coach\.js|coach\.css|version\.json)$/.test(url.pathname)) return; // trénerov panel vždy zo siete
  if (url.searchParams.has('v')) return; // súbory s verziou (?v=16) načítava panel – necacheujeme
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

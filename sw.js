/* sw.js — cachea la app para que funcione sin conexión.
   Sube el número de versión cada vez que cambies archivos. */

const CACHE = 'agua-v1';
const ASSETS = [
  '.',
  'index.html',
  'css/styles.css',
  'js/store.js',
  'js/charts.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Navegación (incluye ?add=…): responde siempre con index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then(cached => cached || fetch(request))
    );
    return;
  }

  // Resto: cache-first, y si viene de la red la guardamos
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached => {
      return cached || fetch(request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
        return resp;
      });
    }).catch(() => caches.match('index.html'))
  );
});

/* sw.js — cachea la app para que funcione sin conexión.
   Estrategia "network-first" en lo propio: con conexión, la app instalada
   siempre coge la versión más nueva (no hace falta ir borrando caché a
   mano); sin conexión, usa lo último que se guardó. Las llamadas a
   Firestore/Open-Meteo no pasan por aquí (son de otro origen). */

const CACHE = 'agua-v5';
const ASSETS = [
  '.',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/store.js',
  'js/charts.js',
  'js/firebase.js',
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
  if (url.origin !== location.origin) return; // Firestore, Open-Meteo: directo a la red

  event.respondWith(
    fetch(request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
      return resp;
    }).catch(() =>
      caches.match(request, { ignoreSearch: true }).then(cached => cached || caches.match('index.html'))
    )
  );
});

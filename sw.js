/* Visvet — service worker: la app abre al instante y funciona como app instalada.
   Solo guarda en caché los archivos propios; los datos van siempre en directo. */
const CACHE = 'visvet-v3';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/ui.js', 'js/config.js', 'js/backend/local.js', 'js/backend/firebase.js', 'assets/favicon.svg', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// red primero (para tener siempre la última versión) y caché si no hay conexión
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});

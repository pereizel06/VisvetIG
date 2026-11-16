/* Barbería — service worker
   · Abre la app al instante y funciona como app instalada.
   · Recibe las notificaciones push (Firebase Cloud Messaging) con la app cerrada. */
const CACHE = 'barberia-v7';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/ui.js', 'js/config.js', 'js/backend.js', 'assets/favicon.svg', 'manifest.webmanifest'];

// Push: la configuración de Firebase llega en la URL de registro (?cfg=…)
try {
  const cfg = JSON.parse(new URL(self.location).searchParams.get('cfg') || 'null');
  if (cfg && cfg.messagingSenderId) {
    importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
    firebase.initializeApp(cfg);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((p) => {
      if (p.notification) return; // ya la muestra Firebase
      const d = p.data || {};
      self.registration.showNotification(d.title || 'Barbería', { body: d.body || '', icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', data: { url: d.url || './' } });
    });
  }
} catch (e) { /* sin push */ }

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// red primero (siempre la última versión) y caché si no hay conexión
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
// al tocar una notificación, abrir (o enfocar) la app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || (e.notification.data && e.notification.data.FCM_MSG && e.notification.data.FCM_MSG.fcmOptions && e.notification.data.FCM_MSG.fcmOptions.link) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(target).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});

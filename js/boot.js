/* Visvet — arranque: elige el modo (Firebase o demo local) y carga la app. */
const cfg = window.VISVET_FIREBASE_CONFIG;

if (cfg && cfg.apiKey && cfg.projectId) {
  try {
    const { createFirebaseStore } = await import('./store-firebase.js');
    window.Store = createFirebaseStore(cfg, window.LocalStore);
  } catch (e) {
    console.error(e);
    document.getElementById('app').innerHTML =
      '<div class="page narrow"><div class="empty big"><h3>No se pudo conectar con Firebase</h3>' +
      '<p class="muted">Revisa tu conexión y la configuración en js/firebase-config.js.</p></div></div>';
    throw e;
  }
}

const s = document.createElement('script');
s.src = 'js/app.js';
document.body.appendChild(s);

/* =========================================================
 * Visvet — configuración
 * ---------------------------------------------------------
 * Mientras `firebase` sea null, la app funciona en MODO DEMO:
 * datos de ejemplo guardados solo en este navegador.
 *
 * Para usarla de verdad (datos compartidos y en tiempo real
 * entre todos los móviles), pega aquí la configuración de tu
 * proyecto de Firebase y el correo de la cuenta de la clínica.
 * Ver README → «Puesta en marcha».
 * ========================================================= */
export const CONFIG = {
  // Configuración de la app web de Firebase (no es secreta)
  firebase: null,
  /* Ejemplo:
  firebase: {
    apiKey: 'AIza...',
    authDomain: 'tu-proyecto.firebaseapp.com',
    projectId: 'tu-proyecto',
    storageBucket: 'tu-proyecto.appspot.com',
    messagingSenderId: '123456789',
    appId: '1:123456789:web:abc123',
  },
  */

  // Correo de la cuenta administradora «Visvet». Debe coincidir con el de firestore.rules.
  adminEmail: '',

  clinicName: 'Visvet',
};

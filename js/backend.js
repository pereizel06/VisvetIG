/* Barbería — datos en Firebase (Authentication + Cloud Firestore), en tiempo real */
import { compressImage } from './ui.js?v=8';

const V = '10.12.2';
const BASE = `https://www.gstatic.com/firebasejs/${V}`;
export const STEP = 15; // minutos por hueco

const ERR = {
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Inicia sesión.',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/user-not-found': 'No existe ninguna cuenta con ese correo.',
  'auth/missing-password': 'Escribe la contraseña.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu internet.',
  'auth/operation-not-allowed': 'Activa «Correo/contraseña» en Firebase → Authentication.',
  'auth/unauthorized-domain': 'Añade este dominio en Firebase → Authentication → Dominios autorizados.',
  'permission-denied': 'No tienes permiso para hacer eso.',
  unavailable: 'Sin conexión con el servidor. Se reintentará solo.',
};
const tr = (e) => (e && ERR[e.code] ? new Error(ERR[e.code]) : e instanceof Error ? e : new Error(String(e)));
export const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
export const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export async function createBackend(cfg) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${BASE}/firebase-app.js`), import(`${BASE}/firebase-auth.js`), import(`${BASE}/firebase-firestore.js`),
  ]);
  const app = initializeApp(cfg);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  if (cfg.emulator) {
    A.connectAuthEmulator(auth, `http://${cfg.emulatorHost || '127.0.0.1'}:9099`, { disableWarnings: true });
    F.connectFirestoreEmulator(db, cfg.emulatorHost || '127.0.0.1', 8080);
  }
  const { doc, collection, query, where, onSnapshot, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } = F;
  const C = (...p) => collection(db, ...p);
  const newId = (col) => doc(C(col)).id;
  const list = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
  const fail = (e) => { console.error(e); window.dispatchEvent(new CustomEvent('backend-error', { detail: tr(e).message, code: e && e.code })); };
  // si la lectura falla, avisamos y entregamos una lista vacía para que la app no se quede cargando
  const watch = (q, cb) => { let got = false; return onSnapshot(q, (s) => { got = true; cb(list(s)); }, (e) => { fail(e); if (!got) { got = true; cb([]); } }); };
  const OWNER = doc(db, 'meta', 'owner');
  let ownerUid = null;
  const photoCache = new Map();

  async function loadOwner() {
    try { const s = await getDoc(OWNER); ownerUid = s.exists() ? s.data().uid : null; } catch (e) { console.error(e); }
    return ownerUid;
  }
  const toUser = (u) => (u ? { uid: u.uid, email: (u.email || '').toLowerCase(), isAdmin: !!ownerUid && u.uid === ownerUid } : null);
  let authCb = () => {};
  let hold = false;

  const B = {
    user: null,
    app, auth, db,

    init(onAuth) {
      authCb = onAuth;
      return new Promise((resolve) => {
        let first = true;
        A.onAuthStateChanged(auth, async (u) => {
          if (hold) return;
          await loadOwner();
          B.user = toUser(u);
          onAuth(B.user);
          if (first) { first = false; resolve(); }
        });
      });
    },
    async ownerExists() { return !!(await loadOwner()); },

    async signUp({ name, email, password, phone }) {
      hold = true;
      try {
        const cred = await A.createUserWithEmailAndPassword(auth, email.trim(), password);
        await A.updateProfile(cred.user, { displayName: name.trim() }).catch(() => {});
        await setDoc(doc(db, 'users', cred.user.uid), { name: name.trim(), phone: (phone || '').trim(), avatar: '', createdAt: Date.now() });
        hold = false;
        B.user = toUser(auth.currentUser);
        authCb(B.user);
      } catch (e) {
        hold = false;
        if (auth.currentUser) { B.user = toUser(auth.currentUser); authCb(B.user); }
        throw tr(e);
      }
    },
    async signIn(email, password) { try { await A.signInWithEmailAndPassword(auth, email.trim(), password); } catch (e) { throw tr(e); } },
    async signOut() { await A.signOut(auth); },
    async resetPassword(email) { try { await A.sendPasswordResetEmail(auth, email.trim()); } catch (e) { throw tr(e); } },

    // «Soy el administrador»: la súper contraseña la comprueban las reglas del servidor
    async claimAdmin(key) {
      const u = auth.currentUser;
      if (await loadOwner()) throw new Error(ownerUid === u.uid ? 'Ya eres el administrador.' : 'Esta barbería ya tiene administrador.');
      const b = writeBatch(db);
      b.set(doc(db, 'ownerKeys', u.uid), { key, at: Date.now() });
      b.set(OWNER, { uid: u.uid, email: (u.email || '').toLowerCase(), at: Date.now() });
      try { await b.commit(); } catch (e) {
        if (e.code === 'permission-denied') throw new Error('Súper contraseña incorrecta.');
        throw tr(e);
      }
      ownerUid = u.uid;
      B.user = toUser(u);
      authCb(B.user);
    },

    /* ---------- Perfil y clientes ---------- */
    watchProfile(uid, cb) { return onSnapshot(doc(db, 'users', uid), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), (e) => { fail(e); cb(null); }); },
    async saveProfile(patch) { try { await setDoc(doc(db, 'users', B.user.uid), patch, { merge: true }); } catch (e) { throw tr(e); } },
    watchUsers(cb) { return watch(C('users'), cb); },
    watchClientNotes(cb) { return watch(C('clientNotes'), cb); },
    async saveClientNote(uid, text) { try { await setDoc(doc(db, 'clientNotes', uid), { text, at: Date.now() }); } catch (e) { throw tr(e); } },

    /* ---------- Barbería, servicios y barberos ---------- */
    watchShop(cb) { return onSnapshot(doc(db, 'shop', 'info'), (s) => cb(s.exists() ? s.data() : null), () => cb(null)); },
    async saveShop(patch) { try { await setDoc(doc(db, 'shop', 'info'), patch, { merge: true }); } catch (e) { throw tr(e); } },
    watchServices(cb) { return watch(C('services'), (l) => cb(l.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.price - b.price))); },
    async saveService(s) { const id = s.id || newId('services'); const d = { ...s }; delete d.id; try { await setDoc(doc(db, 'services', id), d, { merge: true }); } catch (e) { throw tr(e); } return id; },
    async deleteService(id) { try { await deleteDoc(doc(db, 'services', id)); } catch (e) { throw tr(e); } },
    watchBarbers(cb) { return watch(C('barbers'), (l) => cb(l.sort((a, b) => (a.order ?? 99) - (b.order ?? 99)))); },
    async saveBarber(b) { const id = b.id || newId('barbers'); const d = { ...b }; delete d.id; try { await setDoc(doc(db, 'barbers', id), d, { merge: true }); } catch (e) { throw tr(e); } return id; },
    async deleteBarber(id) { try { await deleteDoc(doc(db, 'barbers', id)); } catch (e) { throw tr(e); } },

    /* ---------- Reservas ---------- */
    watchBookings(cb) {
      const q = B.user.isAdmin ? C('bookings') : query(C('bookings'), where('userId', '==', B.user.uid));
      return watch(q, (l) => cb(l.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))));
    },
    watchSlots(date, cb) { return watch(query(C('slots'), where('date', '==', date)), cb); },
    // Reserva atómica: si algún hueco ya está cogido, no se guarda nada
    async book(bk) {
      const id = newId('bookings');
      const b = writeBatch(db);
      const data = { ...bk, status: 'confirmada', createdAt: Date.now(), createdBy: B.user.uid };
      b.set(doc(db, 'bookings', id), data);
      for (let m = toMin(bk.start); m < toMin(bk.end); m += STEP) {
        const t = toHHMM(m);
        b.set(doc(db, 'slots', `${bk.date}_${bk.barberId}_${t.replace(':', '')}`), { date: bk.date, barberId: bk.barberId, t, bookingId: id, userId: bk.userId || null });
      }
      try { await b.commit(); } catch (e) {
        if (e.code === 'permission-denied') throw new Error('Ese hueco se acaba de ocupar. Elige otra hora.');
        throw tr(e);
      }
      return id;
    },
    async cancelBooking(bk, byOwner) {
      const b = writeBatch(db);
      for (let m = toMin(bk.start); m < toMin(bk.end); m += STEP) b.delete(doc(db, 'slots', `${bk.date}_${bk.barberId}_${toHHMM(m).replace(':', '')}`));
      b.update(doc(db, 'bookings', bk.id), byOwner ? { status: 'cancelada', cancelledAt: Date.now(), cancelledBy: 'owner' } : { status: 'cancelada', cancelledAt: Date.now() });
      try { await b.commit(); } catch (e) { throw tr(e); }
    },
    async updateBooking(id, patch) { try { await updateDoc(doc(db, 'bookings', id), patch); } catch (e) { throw tr(e); } },
    async releaseSlots(bk) {
      const b = writeBatch(db);
      for (let m = toMin(bk.start); m < toMin(bk.end); m += STEP) b.delete(doc(db, 'slots', `${bk.date}_${bk.barberId}_${toHHMM(m).replace(':', '')}`));
      await b.commit().catch(() => {});
    },

    /* ---------- Fotos de los cortes ---------- */
    async uploadPhoto(file, { userId, bookingId }) {
      const data = await compressImage(file, 1100, 0.8);
      if (data.length > 950000) throw new Error('La foto es demasiado grande.');
      const id = newId('photos');
      try { await setDoc(doc(db, 'photos', id), { userId, bookingId, data, createdAt: Date.now() }); } catch (e) { throw tr(e); }
      photoCache.set(id, data);
      return id;
    },
    async photo(id) {
      if (photoCache.has(id)) return photoCache.get(id);
      const s = await getDoc(doc(db, 'photos', id));
      const d = s.exists() ? s.data().data : '';
      photoCache.set(id, d);
      return d;
    },
    async deletePhoto(id) { try { await deleteDoc(doc(db, 'photos', id)); } catch (e) { throw tr(e); } },

    /* ---------- Notificaciones ---------- */
    watchNotifications(cb) {
      const parts = [[], []];
      const merge = () => cb([...parts[0], ...parts[1]].sort((a, b) => b.createdAt - a.createdAt));
      const mine = B.user.isAdmin ? 'owner' : B.user.uid;
      const u1 = onSnapshot(query(C('notifications'), where('to', '==', mine)), (s) => { parts[0] = list(s); merge(); }, (e) => { fail(e); merge(); });
      const u2 = onSnapshot(query(C('notifications'), where('to', '==', 'all')), (s) => { parts[1] = list(s); merge(); }, (e) => { fail(e); merge(); });
      return () => { u1(); u2(); };
    },
    async notify(to, title, body, extra = {}) {
      try { await setDoc(doc(C('notifications')), { to, from: B.user.uid, title, body, createdAt: Date.now(), ...extra }); }
      catch (e) { console.error(e); }
    },

    /* ---------- Notificaciones push (FCM) ---------- */
    async enablePush(vapidKey, swReg) {
      const M = await import(`${BASE}/firebase-messaging.js`);
      if (!(await M.isSupported())) throw new Error('Este navegador no admite notificaciones push. En iPhone, instala primero la app en la pantalla de inicio.');
      const messaging = M.getMessaging(app);
      const token = await M.getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
      if (!token) throw new Error('No se pudo activar.');
      await setDoc(doc(db, 'users', B.user.uid, 'tokens', token), { createdAt: Date.now(), ua: navigator.userAgent.slice(0, 120) });
      M.onMessage(messaging, (p) => window.dispatchEvent(new CustomEvent('push-foreground', { detail: p })));
      return token;
    },
  };
  return B;
}

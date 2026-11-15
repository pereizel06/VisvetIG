/* Visvet — modo FIREBASE (datos reales, compartidos y en tiempo real).
 * Authentication: correo y contraseña.  Base de datos: Cloud Firestore.
 * Los documentos (PDF, fotos) se guardan troceados en Firestore, así el
 * proyecto funciona con el plan gratuito sin necesitar Cloud Storage.
 */
import { compressImage, readDataURL, dataURLtoBlob, fileKind } from '../ui.js?v=5';

const V = '10.12.2';
const BASE = `https://www.gstatic.com/firebasejs/${V}`;
const CHUNK = 900000;            // caracteres base64 por trozo (< 1 MiB por documento)
const MAX_FILE = 10 * 1048576;   // 10 MB

const ERR = {
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/user-not-found': 'No existe ninguna cuenta con ese correo.',
  'auth/missing-password': 'Escribe la contraseña.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu internet.',
  'auth/requires-recent-login': 'Por seguridad, vuelve a iniciar sesión e inténtalo de nuevo.',
  'auth/operation-not-allowed': 'Activa «Correo/contraseña» en Firebase → Authentication.',
  'auth/unauthorized-domain': 'Añade este dominio en Firebase → Authentication → Dominios autorizados.',
  'permission-denied': 'No tienes permiso para hacer eso.',
  unavailable: 'Sin conexión con el servidor. Se reintentará solo.',
};
const tr = (e) => (e && ERR[e.code] ? new Error(ERR[e.code]) : e instanceof Error ? e : new Error(String(e)));

export async function createFirebaseBackend(cfg) {
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
  const { doc, collection, query, where, orderBy, limit, onSnapshot, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, increment, runTransaction } = F;
  const ADMIN_DOC = doc(db, 'meta', 'admin');
  let adminUid = null;   // uid de la cuenta de la clínica (null si aún no existe)
  const C = (...p) => collection(db, ...p);
  const newId = (col) => doc(C(col)).id;
  const toList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const watchQ = (q, cb, map = toList) => onSnapshot(q, (s) => cb(map(s)), (e) => { console.error(e); window.dispatchEvent(new CustomEvent('backend-error', { detail: tr(e).message })); });
  const urlCache = new Map();

  const toUser = (u) => (u ? { uid: u.uid, email: (u.email || '').toLowerCase(), isAdmin: !!adminUid && u.uid === adminUid } : null);
  async function loadAdmin() {
    try { const s = await getDoc(ADMIN_DOC); adminUid = s.exists() ? s.data().uid : null; }
    catch (e) { console.error(e); }
    return adminUid;
  }
  let authCb = () => {};
  let holdAuth = false;   // durante el alta de la clínica no avisamos hasta terminar

  const B = {
    mode: 'firebase',
    user: null,

    init(onAuth) {
      authCb = onAuth;
      return new Promise((resolve) => {
        let first = true;
        A.onAuthStateChanged(auth, async (u) => {
          if (holdAuth) return;
          await loadAdmin();
          B.user = toUser(u);
          onAuth(B.user);
          if (first) { first = false; resolve(); }
        });
      });
    },

    // ¿Existe ya la cuenta de la clínica? (se puede consultar sin iniciar sesión)
    async adminExists() { return !!(await loadAdmin()); },

    async signUp({ name, email, password, phone, asClinic = false }) {
      holdAuth = true;
      try {
        if (asClinic && (await loadAdmin())) throw new Error('Esta clínica ya tiene una cuenta de administración. Inicia sesión.');
        const cred = await A.createUserWithEmailAndPassword(auth, email.trim(), password);
        const uid = cred.user.uid;
        await A.updateProfile(cred.user, { displayName: name.trim() }).catch(() => {});
        if (asClinic) {
          try {
            await runTransaction(db, async (tx) => {
              if ((await tx.get(ADMIN_DOC)).exists()) throw new Error('Otra persona acaba de crear la cuenta de la clínica.');
              tx.set(ADMIN_DOC, { uid, email: (cred.user.email || '').toLowerCase(), createdAt: Date.now() });
            });
          } catch (e) { await A.deleteUser(cred.user).catch(() => {}); throw e; }
          adminUid = uid;
          await setDoc(doc(db, 'users', uid), { name: name.trim(), phone: phone || '', avatar: '', createdAt: Date.now() });
          await setDoc(doc(db, 'clinic', 'info'), { name: name.trim(), phone: phone || '', email: (cred.user.email || '').toLowerCase() }, { merge: true });
        } else {
          await setDoc(doc(db, 'users', uid), { name: name.trim(), phone: phone || '', avatar: '', createdAt: Date.now() });
        }
        holdAuth = false;
        B.user = toUser(auth.currentUser);
        authCb(B.user);
      } catch (e) {
        holdAuth = false;
        if (auth.currentUser && !B.user) { B.user = toUser(auth.currentUser); authCb(B.user); }
        throw tr(e);
      }
    },
    async signIn(email, password) {
      try { await A.signInWithEmailAndPassword(auth, email.trim(), password); } catch (e) { throw tr(e); }
    },
    async signOut() { urlCache.forEach((u) => URL.revokeObjectURL(u)); urlCache.clear(); await A.signOut(auth); },
    async resetPassword(email) { try { await A.sendPasswordResetEmail(auth, email.trim()); } catch (e) { throw tr(e); } },
    async refreshUser() {
      if (!auth.currentUser) return null;
      await loadAdmin();
      B.user = toUser(auth.currentUser);
      return B.user;
    },
    async deleteAccount(password) {
      const u = auth.currentUser;
      try { await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, password)); }
      catch (e) { throw new Error('Contraseña incorrecta.'); }
      try {
        const pets = await getDocs(query(C('pets'), where('ownerId', '==', u.uid)));
        const appts = await getDocs(query(C('appointments'), where('ownerId', '==', u.uid)));
        const b = writeBatch(db);
        pets.docs.forEach((d) => b.delete(d.ref));
        appts.docs.forEach((d) => b.delete(d.ref));
        b.delete(doc(db, 'users', u.uid));
        await b.commit();
        await A.deleteUser(u);
      } catch (e) { throw tr(e); }
    },

    /* ---------- Perfiles ---------- */
    watchProfile(uid, cb) { return onSnapshot(doc(db, 'users', uid), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), (e) => console.error(e)); },
    async saveProfile(patch) {
      try { await setDoc(doc(db, 'users', B.user.uid), patch, { merge: true }); } catch (e) { throw tr(e); }
    },
    watchUsers(cb) { return watchQ(C('users'), cb); },

    /* ---------- Clínica ---------- */
    watchClinic(cb) { return onSnapshot(doc(db, 'clinic', 'info'), (s) => cb(s.exists() ? s.data() : {}), () => cb({})); },
    async saveClinic(info) { try { await setDoc(doc(db, 'clinic', 'info'), info, { merge: true }); } catch (e) { throw tr(e); } },

    /* ---------- Animales ---------- */
    watchPets(cb) {
      const q = B.user.isAdmin ? C('pets') : query(C('pets'), where('ownerId', '==', B.user.uid));
      return watchQ(q, cb);
    },
    async savePet(pet) {
      const data = { ...pet };
      const id = data.id || newId('pets');
      delete data.id;
      try {
        if (pet.id) await updateDoc(doc(db, 'pets', id), data);
        else await setDoc(doc(db, 'pets', id), { ownerId: B.user.uid, createdAt: Date.now(), weights: [], unreadAdmin: 0, unreadOwner: 0, pendingAmount: 0, ...data });
      } catch (e) { throw tr(e); }
      return id;
    },
    async deletePet(id) { try { await deleteDoc(doc(db, 'pets', id)); } catch (e) { throw tr(e); } },

    /* ---------- Chat ---------- */
    watchMessages(petId, cb) { return watchQ(query(C('pets', petId, 'messages'), orderBy('createdAt'), limit(500)), cb); },
    async sendMessage(pet, { text = '', files = [] }, onProgress) {
      const u = B.user;
      const attachments = [];
      for (let i = 0; i < files.length; i++) attachments.push(await B.uploadFile(files[i], { ownerId: pet.ownerId, petId: pet.id }, (k) => onProgress && onProgress((i + k) / files.length)));
      const now = Date.now();
      const m = { from: u.uid, fromAdmin: !!u.isAdmin, text: text.trim(), files: attachments, createdAt: now };
      const b = writeBatch(db);
      b.set(doc(C('pets', pet.id, 'messages')), m);
      b.update(doc(db, 'pets', pet.id), {
        lastMessage: m.text || (attachments.length ? '📎 ' + attachments[0].name : ''),
        lastMessageAt: now, lastFromAdmin: !!u.isAdmin,
        [u.isAdmin ? 'unreadOwner' : 'unreadAdmin']: increment(1),
      });
      try { await b.commit(); } catch (e) { throw tr(e); }
    },
    async markThreadRead(pet) {
      const u = B.user;
      const k = u.isAdmin ? 'unreadAdmin' : 'unreadOwner';
      const r = u.isAdmin ? 'readByAdminAt' : 'readByOwnerAt';
      if (!pet[k] && (pet[r] || 0) >= (pet.lastMessageAt || 0)) return;
      try { await updateDoc(doc(db, 'pets', pet.id), { [k]: 0, [r]: Date.now() }); } catch (e) { console.error(e); }
    },

    /* ---------- Cartilla ---------- */
    watchRecords(petId, cb) {
      return watchQ(C('pets', petId, 'records'), (list) => cb(list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0))));
    },
    async saveRecord(pet, rec, newFiles = [], onProgress) {
      const uploaded = [];
      for (let i = 0; i < newFiles.length; i++) uploaded.push(await B.uploadFile(newFiles[i], { ownerId: pet.ownerId, petId: pet.id }, (k) => onProgress && onProgress((i + k) / newFiles.length)));
      const data = { ...rec, files: [...(rec.files || []), ...uploaded], updatedAt: Date.now() };
      const id = data.id || doc(C('pets', pet.id, 'records')).id;
      delete data.id;
      if (!rec.id) { data.createdAt = Date.now(); data.createdBy = B.user.uid; }
      try {
        await setDoc(doc(db, 'pets', pet.id, 'records', id), data, { merge: true });
        await B._syncPending(pet.id);
      } catch (e) { throw tr(e); }
    },
    async deleteRecord(pet, rec) {
      try {
        await deleteDoc(doc(db, 'pets', pet.id, 'records', rec.id));
        for (const f of rec.files || []) await B._deleteFile(f.id).catch(() => {});
        await B._syncPending(pet.id);
      } catch (e) { throw tr(e); }
    },
    async _syncPending(petId) {
      const recs = await getDocs(C('pets', petId, 'records'));
      const pending = recs.docs.map((d) => d.data()).filter((r) => r.type === 'factura' && !r.paid).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      await updateDoc(doc(db, 'pets', petId), { pendingAmount: Math.round(pending * 100) / 100, lastRecordAt: Date.now() });
    },

    /* ---------- Archivos (troceados en Firestore) ---------- */
    async uploadFile(file, { ownerId, petId }, onProgress) {
      if (file.size > MAX_FILE) throw new Error(`«${file.name}» supera los 10 MB.`);
      const isImg = fileKind(file.type) === 'image';
      const url = isImg ? await compressImage(file, 2000, 0.85) : await readDataURL(file);
      const b64 = url.slice(url.indexOf(',') + 1);
      const type = isImg ? 'image/jpeg' : file.type || 'application/octet-stream';
      const n = Math.max(1, Math.ceil(b64.length / CHUNK));
      const id = newId('files');
      try {
        await setDoc(doc(db, 'files', id), { ownerId, petId, name: file.name, type, size: Math.round(b64.length * 0.75), chunks: n, createdBy: B.user.uid, createdAt: Date.now() });
        for (let i = 0; i < n; i++) {
          await setDoc(doc(db, 'files', id, 'chunks', String(i)), { d: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
          onProgress && onProgress((i + 1) / n);
        }
      } catch (e) { throw tr(e); }
      urlCache.set(id, URL.createObjectURL(dataURLtoBlob(url)));
      return { id, name: file.name, type, size: Math.round(b64.length * 0.75) };
    },
    async openFile(meta) {
      if (urlCache.has(meta.id)) return urlCache.get(meta.id);
      try {
        const snap = await getDocs(C('files', meta.id, 'chunks'));
        const parts = snap.docs.sort((a, b) => Number(a.id) - Number(b.id)).map((d) => d.data().d).join('');
        if (!parts) throw new Error('El archivo ya no está disponible.');
        const u = URL.createObjectURL(dataURLtoBlob(`data:${meta.type};base64,${parts}`));
        urlCache.set(meta.id, u);
        return u;
      } catch (e) { throw tr(e); }
    },
    async _deleteFile(id) {
      const snap = await getDocs(C('files', id, 'chunks'));
      const b = writeBatch(db);
      snap.docs.forEach((d) => b.delete(d.ref));
      b.delete(doc(db, 'files', id));
      await b.commit();
    },

    /* ---------- Citas ---------- */
    watchAppointments(cb) {
      const q = B.user.isAdmin ? C('appointments') : query(C('appointments'), where('ownerId', '==', B.user.uid));
      return watchQ(q, cb);
    },
    async saveAppointment(a) {
      const data = { ...a };
      const id = data.id || newId('appointments');
      delete data.id;
      try {
        if (a.id) await updateDoc(doc(db, 'appointments', id), data);
        else await setDoc(doc(db, 'appointments', id), { createdAt: Date.now(), createdBy: B.user.uid, ...data });
      } catch (e) { throw tr(e); }
      return id;
    },
  };
  return B;
}

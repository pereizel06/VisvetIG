/* Visvet — capa de datos con Firebase (Authentication + Cloud Firestore).
 *
 * Mantiene la misma interfaz que el almacén local (js/store.js) para que la
 * interfaz (js/app.js) funcione igual en los dos modos:
 *  - Los datos se reciben en tiempo real con onSnapshot y se guardan en memoria
 *    (Store.data), así la interfaz puede leerlos de forma síncrona.
 *  - Las escrituras se aplican al momento en memoria y se envían a Firestore.
 *  - Las fotos se guardan comprimidas en la colección "media" (no requiere
 *    Cloud Storage, que en Firebase ya no está en el plan gratuito) y se
 *    descargan solo cuando hay que mostrarlas.
 */
const V = '10.12.2';
const BASE = `https://www.gstatic.com/firebasejs/${V}`;

const { initializeApp } = await import(`${BASE}/firebase-app.js`);
const {
  getAuth, connectAuthEmulator, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider, deleteUser: deleteAuthUser,
} = await import(`${BASE}/firebase-auth.js`);
const {
  getFirestore, connectFirestoreEmulator, doc, collection, getDoc, setDoc, updateDoc,
  onSnapshot, query, where, orderBy, limit, writeBatch, arrayUnion, arrayRemove, runTransaction,
} = await import(`${BASE}/firebase-firestore.js`);

const DAY = 24 * 3600 * 1000;
const MAX_IMAGE = 950 * 1024; // límite práctico: un documento de Firestore admite 1 MiB

const empty = () => ({ users: [], posts: [], stories: [], appointments: [], messages: [], notifications: [] });

const ERRORS = {
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
  'auth/invalid-email': 'El correo electrónico no es válido.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/user-not-found': 'No existe ninguna cuenta con ese correo.',
  'auth/missing-password': 'Escribe tu contraseña.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu internet.',
  'auth/requires-recent-login': 'Por seguridad, cierra sesión y vuelve a entrar antes de hacer esto.',
  'auth/operation-not-allowed': 'Activa «Correo electrónico/contraseña» en Firebase → Authentication → Método de acceso.',
  'auth/unauthorized-domain': 'Este dominio no está autorizado. Añádelo en Firebase → Authentication → Configuración → Dominios autorizados.',
  'permission-denied': 'No tienes permiso para hacer eso (revisa las reglas de Firestore).',
  unavailable: 'No hay conexión con el servidor. Se reintentará automáticamente.',
};
function tr(e) {
  if (e && e.code && ERRORS[e.code]) return new Error(ERRORS[e.code]);
  if (e && e.code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.') return new Error('La configuración de Firebase (apiKey) no es válida.');
  return e instanceof Error ? e : new Error(String(e));
}
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const withoutId = ({ id, ...rest }) => rest;

export function createFirebaseStore(config, LocalStore) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (config.emulator) {
    const host = config.emulatorHost || '127.0.0.1';
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
  }
  const newId = () => doc(collection(db, 'posts')).id;
  const ref = (col, id) => doc(db, col, id);
  const fail = (e) => {
    console.error(e);
    window.toast && window.toast(tr(e).message, 'error');
  };

  const mediaCache = new Map(); // id -> dataURL
  const mediaLoading = new Map(); // id -> Promise

  const S = {
    mode: 'firebase',
    data: empty(),
    listeners: [],
    uid: null,
    started: false,
    _unsubs: [],
    _waiting: [],
    _quiet: 0,
    _emitTimer: null,

    /* ---------- Arranque y tiempo real ---------- */
    init() {
      return new Promise((resolve) => {
        let first = true;
        onAuthStateChanged(auth, async (user) => {
          this._stop();
          this.uid = user ? user.uid : null;
          if (user) {
            try { await this._start(user.uid); } catch (e) { fail(e); }
          }
          this.started = true;
          this._waiting = this._waiting.filter((w) => (w.uid === this.uid ? (w.resolve(), false) : true));
          if (first) { first = false; resolve(); } else this._emitSoon();
        });
      });
    },

    _whenReady(uid) {
      if (this.started && this.uid === uid) return Promise.resolve();
      return new Promise((resolve) => this._waiting.push({ uid, resolve }));
    },

    _stop() {
      this._unsubs.forEach((u) => u());
      this._unsubs = [];
      this.started = false;
      this.data = empty();
    },

    async _start(uid) {
      const d = this.data;
      const list = (snap) => snap.docs.map((x) => Object.assign({ id: x.id }, x.data()));
      const subscribe = (q, apply) => new Promise((resolve) => {
        let first = true;
        const un = onSnapshot(q, (snap) => {
          if (this.data !== d) return; // sesión anterior
          apply(snap);
          if (first) { first = false; resolve(); } else this._emitSoon();
        }, (err) => {
          console.error(err);
          if (first) { first = false; resolve(); }
          if (err.code === 'permission-denied') fail(err);
        });
        this._unsubs.push(un);
      });
      const pair = (key) => {
        const parts = [[], []];
        return (i) => (snap) => {
          parts[i] = list(snap);
          const seen = new Set();
          d[key] = parts[0].concat(parts[1]).filter((x) => (seen.has(x.id) ? false : seen.add(x.id)));
        };
      };
      const appts = pair('appointments');
      const msgs = pair('messages');
      const C = (n) => collection(db, n);

      await Promise.all([
        subscribe(C('users'), (s) => { d.users = list(s).map(normUser); }),
        subscribe(query(C('posts'), orderBy('createdAt', 'desc'), limit(300)), (s) => { d.posts = list(s).map(normPost); }),
        subscribe(query(C('stories'), where('createdAt', '>', Date.now() - DAY)), (s) => { d.stories = list(s).map((x) => Object.assign({ seenBy: [] }, x)); }),
        subscribe(query(C('appointments'), where('clientId', '==', uid)), appts(0)),
        subscribe(query(C('appointments'), where('vetId', '==', uid)), appts(1)),
        subscribe(query(C('messages'), where('from', '==', uid)), msgs(0)),
        subscribe(query(C('messages'), where('to', '==', uid)), msgs(1)),
        subscribe(query(C('notifications'), where('userId', '==', uid)), (s) => { d.notifications = list(s); }),
      ]);
    },

    onChange(fn) { this.listeners.push(fn); },
    emit() { this.listeners.forEach((fn) => fn()); },
    _emitSoon() {
      if (this._quiet) return;
      clearTimeout(this._emitTimer);
      this._emitTimer = setTimeout(() => this.emit(), 120);
    },
    save() { return true; }, // compatibilidad: en Firebase cada acción guarda por sí misma

    /* ---------- Fotos ---------- */
    mediaCached(id) { return mediaCache.get(id) || null; },
    loadMedia(id) {
      if (mediaCache.has(id)) return Promise.resolve(mediaCache.get(id));
      if (!mediaLoading.has(id)) {
        mediaLoading.set(id, getDoc(ref('media', id)).then((snap) => {
          const src = snap.exists() ? snap.data().data : null;
          if (src) mediaCache.set(id, src);
          mediaLoading.delete(id);
          return src;
        }).catch((e) => { console.error(e); mediaLoading.delete(id); return null; }));
      }
      return mediaLoading.get(id);
    },
    _checkImage(image) {
      if (image.length > MAX_IMAGE) {
        window.toast && window.toast('La imagen es demasiado grande. Prueba con otra foto.', 'error');
        return false;
      }
      return true;
    },

    /* ---------- Sesión ---------- */
    currentUserId() { return this.uid; },
    currentUser() { return this.uid ? this.user(this.uid) : null; },
    authEmail() { return auth.currentUser ? auth.currentUser.email : ''; },
    setSession(id) { if (!id) this.logout(); },
    async logout() { await signOut(auth); },

    async register(f) {
      const username = String(f.username || '').trim().toLowerCase();
      if (!/^[a-z0-9._]{3,30}$/.test(username)) throw new Error('El usuario debe tener 3-30 caracteres: letras, números, punto o guion bajo.');
      if (!f.password || f.password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
      this._quiet++;
      try {
        if ((await getDoc(ref('usernames', username))).exists()) throw new Error('Ese nombre de usuario ya está en uso.');
        const cred = await createUserWithEmailAndPassword(auth, f.email.trim(), f.password);
        const uid = cred.user.uid;
        const user = {
          id: uid, username, name: f.name.trim(), role: f.role === 'vet' ? 'vet' : 'client',
          avatar: '', bio: '', city: (f.city || '').trim(),
          clinic: f.clinic || '', license: f.license || '', specialty: f.specialty || '', phone: '', schedule: '',
          pets: f.pets || [], following: [], createdAt: Date.now(),
        };
        try {
          await runTransaction(db, async (tx) => {
            const uref = ref('usernames', username);
            if ((await tx.get(uref)).exists()) throw new Error('Ese nombre de usuario ya está en uso.');
            tx.set(uref, { uid });
            tx.set(ref('users', uid), withoutId(user));
          });
        } catch (e) {
          await deleteAuthUser(cred.user).catch(() => {});
          throw e;
        }
        await this._whenReady(uid);
        if (!this.user(uid)) this.data.users.push(user);
        return this.user(uid);
      } catch (e) {
        throw tr(e);
      } finally { this._quiet--; }
    },

    async login(login, password) {
      const email = String(login || '').trim();
      if (!email.includes('@')) throw new Error('Inicia sesión con tu correo electrónico.');
      this._quiet++;
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await this._whenReady(cred.user.uid);
        if (!this.user(cred.user.uid)) {
          await signOut(auth);
          throw new Error('Esta cuenta no tiene perfil en Visvet. Regístrate de nuevo con otro correo.');
        }
        return this.currentUser();
      } catch (e) {
        throw tr(e);
      } finally { this._quiet--; }
    },

    async resetPassword(email) {
      try { await sendPasswordResetEmail(auth, String(email || '').trim()); } catch (e) { throw tr(e); }
    },

    async _reauth(password) {
      const u = auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
    },

    async changePassword(userId, oldPw, newPw) {
      if (!newPw || newPw.length < 6) throw new Error('La nueva contraseña debe tener al menos 6 caracteres.');
      try {
        await this._reauth(oldPw);
        await updatePassword(auth.currentUser, newPw);
      } catch (e) {
        if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') throw new Error('La contraseña actual no es correcta.');
        throw tr(e);
      }
    },

    async deleteUser(id, password) {
      const u = this.user(id);
      try { await this._reauth(password); } catch (e) {
        if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') throw new Error('Contraseña incorrecta.');
        throw tr(e);
      }
      this._quiet++;
      try {
        const ops = [];
        const del = (col, docId) => ops.push((b) => b.delete(ref(col, docId)));
        this.data.posts.filter((p) => p.userId === id).forEach((p) => { del('posts', p.id); if (isMedia(p.image)) del('media', p.image.slice(6)); });
        this.data.stories.filter((s) => s.userId === id).forEach((s) => { del('stories', s.id); if (isMedia(s.image)) del('media', s.image.slice(6)); });
        this.data.appointments.forEach((a) => del('appointments', a.id));
        this.data.messages.filter((m) => m.from === id).forEach((m) => del('messages', m.id));
        this.data.notifications.forEach((n) => del('notifications', n.id));
        if (u) del('usernames', u.username);
        del('users', id);
        for (let i = 0; i < ops.length; i += 450) {
          const b = writeBatch(db);
          ops.slice(i, i + 450).forEach((op) => op(b));
          await b.commit();
        }
        await deleteAuthUser(auth.currentUser);
      } catch (e) {
        throw tr(e);
      } finally { this._quiet--; }
    },

    updateUser(id, patch) {
      const u = this.user(id);
      if (!u || id !== this.uid) return;
      Object.assign(u, patch);
      updateDoc(ref('users', id), clean(patch)).catch(fail);
    },

    toggleFollow(a, b) {
      const u = this.user(a);
      if (!u || a === b || a !== this.uid) return;
      const following = u.following.includes(b);
      u.following = following ? u.following.filter((x) => x !== b) : [...u.following, b];
      updateDoc(ref('users', a), { following: following ? arrayRemove(b) : arrayUnion(b) }).catch(fail);
      if (!following) this.notify(b, 'follow', a);
    },

    /* ---------- Publicaciones ---------- */
    createPost({ userId, image, caption, category }) {
      if (!this._checkImage(image)) return null;
      const id = newId();
      const post = { id, userId, image: 'media:' + id, caption, category, likes: [], comments: [], savedBy: [], createdAt: Date.now() };
      mediaCache.set(id, image);
      this.data.posts.unshift(post);
      const b = writeBatch(db);
      b.set(ref('media', id), { userId, data: image, createdAt: post.createdAt });
      b.set(ref('posts', id), withoutId(post));
      b.commit().catch((e) => {
        this.data.posts = this.data.posts.filter((p) => p.id !== id);
        fail(e);
        this.emit();
      });
      return post;
    },
    deletePost(id) {
      const p = this.post(id);
      if (!p) return;
      this.data.posts = this.data.posts.filter((x) => x.id !== id);
      const b = writeBatch(db);
      b.delete(ref('posts', id));
      if (isMedia(p.image)) b.delete(ref('media', p.image.slice(6)));
      b.commit().catch(fail);
    },
    toggleLike(postId, userId) {
      const p = this.post(postId);
      if (!p) return false;
      const liked = p.likes.includes(userId);
      p.likes = liked ? p.likes.filter((x) => x !== userId) : [...p.likes, userId];
      updateDoc(ref('posts', postId), { likes: liked ? arrayRemove(userId) : arrayUnion(userId) }).catch(fail);
      if (!liked) this.notify(p.userId, 'like', userId, { postId });
      return !liked;
    },
    toggleSave(postId, userId) {
      const p = this.post(postId);
      if (!p) return;
      const saved = p.savedBy.includes(userId);
      p.savedBy = saved ? p.savedBy.filter((x) => x !== userId) : [...p.savedBy, userId];
      updateDoc(ref('posts', postId), { savedBy: saved ? arrayRemove(userId) : arrayUnion(userId) }).catch(fail);
    },
    addComment(postId, userId, text) {
      const p = this.post(postId);
      if (!p || !text.trim()) return;
      const c = { id: newId(), userId, text: text.trim().slice(0, 500), createdAt: Date.now() };
      p.comments = [...p.comments, c];
      updateDoc(ref('posts', postId), { comments: arrayUnion(c) }).catch(fail);
      this.notify(p.userId, 'comment', userId, { postId, text: c.text.slice(0, 80) });
    },
    deleteComment(postId, commentId) {
      const p = this.post(postId);
      const c = p && p.comments.find((x) => x.id === commentId);
      if (!c) return;
      p.comments = p.comments.filter((x) => x.id !== commentId);
      updateDoc(ref('posts', postId), { comments: arrayRemove(c) }).catch(fail);
    },

    /* ---------- Historias ---------- */
    activeStories() {
      const min = Date.now() - DAY;
      return this.data.stories.filter((s) => s.createdAt > min);
    },
    addStory(userId, image) {
      if (!this._checkImage(image)) return false;
      const id = newId();
      const story = { id, userId, image: 'media:' + id, createdAt: Date.now(), seenBy: [] };
      mediaCache.set(id, image);
      this.data.stories.push(story);
      const b = writeBatch(db);
      b.set(ref('media', id), { userId, data: image, createdAt: story.createdAt });
      b.set(ref('stories', id), withoutId(story));
      b.commit().catch(fail);
      return true;
    },
    deleteStory(id) {
      const s = this.data.stories.find((x) => x.id === id);
      if (!s) return;
      this.data.stories = this.data.stories.filter((x) => x.id !== id);
      const b = writeBatch(db);
      b.delete(ref('stories', id));
      if (isMedia(s.image)) b.delete(ref('media', s.image.slice(6)));
      b.commit().catch(fail);
    },
    markStorySeen(storyId, userId) {
      const s = this.data.stories.find((x) => x.id === storyId);
      if (!s || s.seenBy.includes(userId)) return;
      s.seenBy = [...s.seenBy, userId];
      updateDoc(ref('stories', storyId), { seenBy: arrayUnion(userId) }).catch((e) => console.error(e));
    },

    /* ---------- Citas ---------- */
    requestAppointment(data) {
      const a = clean(Object.assign({ id: newId(), status: 'pendiente', createdAt: Date.now(), vetNote: '' }, data));
      this.data.appointments.push(a);
      setDoc(ref('appointments', a.id), withoutId(a)).catch(fail);
      this.notify(a.vetId, 'appointment_request', a.clientId, { appointmentId: a.id, text: `${a.petName} · ${a.date} ${a.time}` });
      return a;
    },
    setAppointmentStatus(id, status, actorId, note) {
      const a = this.data.appointments.find((x) => x.id === id);
      if (!a) return;
      a.status = status;
      const patch = { status };
      if (note !== undefined) { a.vetNote = note; patch.vetNote = note; }
      updateDoc(ref('appointments', id), patch).catch(fail);
      const target = actorId === a.vetId ? a.clientId : a.vetId;
      this.notify(target, 'appointment_' + status, actorId, { appointmentId: id, text: `${a.petName} · ${a.date} ${a.time}` });
    },
    setAppointmentNote(id, note) {
      const a = this.data.appointments.find((x) => x.id === id);
      if (!a) return;
      a.vetNote = note;
      updateDoc(ref('appointments', id), { vetNote: note }).catch(fail);
    },

    /* ---------- Mensajes ---------- */
    sendMessage(from, to, text, extra = {}) {
      if (!text.trim() && !extra.postId) return;
      const m = clean(Object.assign({ id: newId(), from, to, text: text.trim().slice(0, 1000), createdAt: Date.now(), read: false }, extra));
      this.data.messages.push(m);
      setDoc(ref('messages', m.id), withoutId(m)).catch(fail);
    },
    markThreadRead(userId, otherId) {
      const unread = this.data.messages.filter((m) => m.from === otherId && m.to === userId && !m.read);
      if (!unread.length) return;
      const b = writeBatch(db);
      unread.forEach((m) => { m.read = true; b.update(ref('messages', m.id), { read: true }); });
      b.commit().catch((e) => console.error(e));
    },

    /* ---------- Notificaciones ---------- */
    notify(userId, type, fromId, extra = {}) {
      if (!userId || userId === fromId) return;
      const id = newId();
      setDoc(ref('notifications', id), clean(Object.assign({ userId, type, fromId, createdAt: Date.now(), read: false }, extra)))
        .catch((e) => console.error(e));
    },
    markNotificationsRead(userId) {
      const unread = this.data.notifications.filter((n) => n.userId === userId && !n.read);
      if (!unread.length) return;
      const b = writeBatch(db);
      unread.forEach((n) => { n.read = true; b.update(ref('notifications', n.id), { read: true }); });
      b.commit().catch((e) => console.error(e));
    },
  };

  // Consultas de solo lectura: idénticas a las del modo local
  ['user', 'userByUsername', 'followers', 'isFollowing', 'post', 'postsBy', 'appointmentsFor',
    'conversations', 'thread', 'unreadMessages', 'notificationsFor', 'unreadNotifications']
    .forEach((k) => { S[k] = LocalStore[k]; });

  return S;
}

function isMedia(src) { return typeof src === 'string' && src.startsWith('media:'); }
function normUser(u) { return Object.assign({ following: [], pets: [], avatar: '', bio: '', city: '', clinic: '', license: '', specialty: '', phone: '', schedule: '' }, u); }
function normPost(p) { return Object.assign({ likes: [], comments: [], savedBy: [], caption: '' }, p); }

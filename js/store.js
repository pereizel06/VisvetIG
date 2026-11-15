/* Visvet — capa de datos.
 * Todo se guarda en localStorage del navegador para que la web funcione
 * en GitHub Pages sin servidor. Ver README para migrar a un backend real.
 */
(function () {
  const DB_KEY = 'visvet_db_v1';
  const SESSION_KEY = 'visvet_session_v1';

  const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Hash de contraseña (SHA-256 si está disponible; si no, un hash simple)
  async function hashPassword(password, salt) {
    const text = salt + '::' + password;
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'f' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  const empty = () => ({
    version: 1,
    users: [],
    posts: [],
    stories: [],
    appointments: [],
    messages: [],
    notifications: [],
  });

  const Store = {
    data: empty(),
    listeners: [],

    async init() {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { raw = null; }
      if (raw && raw.version === 1) {
        this.data = Object.assign(empty(), raw);
      } else {
        this.data = await window.buildSeed(hashPassword, uid);
        this.save();
      }
      window.addEventListener('storage', (e) => {
        if (e.key === DB_KEY) {
          try { this.data = Object.assign(empty(), JSON.parse(e.newValue)); } catch (_) {}
          this.emit();
        }
      });
    },

    save() {
      try {
        localStorage.setItem(DB_KEY, JSON.stringify(this.data));
        return true;
      } catch (e) {
        window.toast && window.toast('El almacenamiento del navegador está lleno. Borra algunas publicaciones o usa imágenes más pequeñas.', 'error');
        return false;
      }
    },

    async reset() {
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(SESSION_KEY);
      this.data = await window.buildSeed(hashPassword, uid);
      this.save();
    },

    onChange(fn) { this.listeners.push(fn); },
    emit() { this.listeners.forEach((fn) => fn()); },

    /* ---------- Sesión ---------- */
    currentUserId() { try { return localStorage.getItem(SESSION_KEY); } catch (e) { return null; } },
    currentUser() { const id = this.currentUserId(); return id ? this.user(id) : null; },
    setSession(id) { id ? localStorage.setItem(SESSION_KEY, id) : localStorage.removeItem(SESSION_KEY); },

    /* ---------- Usuarios ---------- */
    user(id) { return this.data.users.find((u) => u.id === id) || null; },
    userByUsername(username) {
      const n = String(username || '').toLowerCase();
      return this.data.users.find((u) => u.username.toLowerCase() === n) || null;
    },
    userByLogin(login) {
      const n = String(login || '').trim().toLowerCase();
      return this.data.users.find((u) => u.username.toLowerCase() === n || (u.email || '').toLowerCase() === n) || null;
    },

    async register(fields) {
      const username = fields.username.trim().toLowerCase();
      if (!/^[a-z0-9._]{3,30}$/.test(username)) throw new Error('El usuario debe tener 3-30 caracteres: letras, números, punto o guion bajo.');
      if (this.userByUsername(username)) throw new Error('Ese nombre de usuario ya está en uso.');
      if (fields.email && this.data.users.some((u) => (u.email || '').toLowerCase() === fields.email.trim().toLowerCase())) throw new Error('Ya existe una cuenta con ese correo.');
      if (!fields.password || fields.password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
      const salt = uid('s');
      const user = {
        id: uid('u'),
        username,
        name: fields.name.trim(),
        email: (fields.email || '').trim(),
        salt,
        passwordHash: await hashPassword(fields.password, salt),
        role: fields.role === 'vet' ? 'vet' : 'client',
        avatar: '',
        bio: '',
        city: (fields.city || '').trim(),
        // veterinario
        clinic: fields.clinic || '',
        license: fields.license || '',
        specialty: fields.specialty || '',
        phone: '',
        schedule: '',
        // cliente
        pets: fields.pets || [],
        following: [],
        createdAt: Date.now(),
      };
      this.data.users.push(user);
      this.save();
      return user;
    },

    async login(login, password) {
      const user = this.userByLogin(login);
      if (!user) throw new Error('No encontramos ninguna cuenta con ese usuario o correo.');
      const h = await hashPassword(password, user.salt);
      if (h !== user.passwordHash) throw new Error('Contraseña incorrecta.');
      this.setSession(user.id);
      return user;
    },

    async changePassword(userId, oldPw, newPw) {
      const u = this.user(userId);
      if ((await hashPassword(oldPw, u.salt)) !== u.passwordHash) throw new Error('La contraseña actual no es correcta.');
      if (!newPw || newPw.length < 6) throw new Error('La nueva contraseña debe tener al menos 6 caracteres.');
      u.salt = uid('s');
      u.passwordHash = await hashPassword(newPw, u.salt);
      this.save();
    },

    updateUser(id, patch) {
      const u = this.user(id);
      if (!u) return;
      Object.assign(u, patch);
      this.save();
    },

    deleteUser(id) {
      const d = this.data;
      d.users = d.users.filter((u) => u.id !== id);
      d.users.forEach((u) => { u.following = u.following.filter((f) => f !== id); });
      d.posts = d.posts.filter((p) => p.userId !== id);
      d.posts.forEach((p) => {
        p.likes = p.likes.filter((x) => x !== id);
        p.savedBy = p.savedBy.filter((x) => x !== id);
        p.comments = p.comments.filter((c) => c.userId !== id);
      });
      d.stories = d.stories.filter((s) => s.userId !== id);
      d.appointments = d.appointments.filter((a) => a.clientId !== id && a.vetId !== id);
      d.messages = d.messages.filter((m) => m.from !== id && m.to !== id);
      d.notifications = d.notifications.filter((n) => n.userId !== id && n.fromId !== id);
      this.setSession(null);
      this.save();
    },

    followers(id) { return this.data.users.filter((u) => u.following.includes(id)); },
    isFollowing(a, b) { const u = this.user(a); return !!u && u.following.includes(b); },
    toggleFollow(a, b) {
      const u = this.user(a);
      if (!u || a === b) return;
      if (u.following.includes(b)) {
        u.following = u.following.filter((x) => x !== b);
      } else {
        u.following.push(b);
        this.notify(b, 'follow', a);
      }
      this.save();
    },

    /* ---------- Publicaciones ---------- */
    post(id) { return this.data.posts.find((p) => p.id === id) || null; },
    postsBy(userId) { return this.data.posts.filter((p) => p.userId === userId).sort((a, b) => b.createdAt - a.createdAt); },
    createPost({ userId, image, caption, category }) {
      const post = { id: uid('p'), userId, image, caption, category, likes: [], comments: [], savedBy: [], createdAt: Date.now() };
      this.data.posts.push(post);
      if (!this.save()) { this.data.posts.pop(); return null; }
      return post;
    },
    deletePost(id) {
      this.data.posts = this.data.posts.filter((p) => p.id !== id);
      this.data.notifications = this.data.notifications.filter((n) => n.postId !== id);
      this.save();
    },
    toggleLike(postId, userId) {
      const p = this.post(postId);
      if (!p) return false;
      const liked = p.likes.includes(userId);
      p.likes = liked ? p.likes.filter((x) => x !== userId) : [...p.likes, userId];
      if (!liked) this.notify(p.userId, 'like', userId, { postId });
      this.save();
      return !liked;
    },
    toggleSave(postId, userId) {
      const p = this.post(postId);
      if (!p) return;
      p.savedBy = p.savedBy.includes(userId) ? p.savedBy.filter((x) => x !== userId) : [...p.savedBy, userId];
      this.save();
    },
    addComment(postId, userId, text) {
      const p = this.post(postId);
      if (!p || !text.trim()) return;
      p.comments.push({ id: uid('c'), userId, text: text.trim(), createdAt: Date.now() });
      this.notify(p.userId, 'comment', userId, { postId, text: text.trim().slice(0, 80) });
      this.save();
    },
    deleteComment(postId, commentId) {
      const p = this.post(postId);
      if (!p) return;
      p.comments = p.comments.filter((c) => c.id !== commentId);
      this.save();
    },

    /* ---------- Historias (24 h) ---------- */
    activeStories() {
      const limit = Date.now() - 24 * 3600 * 1000;
      return this.data.stories.filter((s) => s.createdAt > limit || s.pinned);
    },
    addStory(userId, image) {
      this.data.stories.push({ id: uid('s'), userId, image, createdAt: Date.now(), seenBy: [] });
      // limpieza de historias caducadas
      const limit = Date.now() - 24 * 3600 * 1000;
      this.data.stories = this.data.stories.filter((s) => s.createdAt > limit || s.pinned);
      if (!this.save()) { this.data.stories.pop(); return false; }
      return true;
    },
    markStorySeen(storyId, userId) {
      const s = this.data.stories.find((x) => x.id === storyId);
      if (s && !s.seenBy.includes(userId)) { s.seenBy.push(userId); this.save(); }
    },

    /* ---------- Citas ---------- */
    appointmentsFor(userId) {
      return this.data.appointments
        .filter((a) => a.clientId === userId || a.vetId === userId)
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    },
    requestAppointment(data) {
      const a = Object.assign({ id: uid('a'), status: 'pendiente', createdAt: Date.now(), vetNote: '' }, data);
      this.data.appointments.push(a);
      this.notify(a.vetId, 'appointment_request', a.clientId, { appointmentId: a.id, text: `${a.petName} · ${a.date} ${a.time}` });
      this.save();
      return a;
    },
    setAppointmentStatus(id, status, actorId, note) {
      const a = this.data.appointments.find((x) => x.id === id);
      if (!a) return;
      a.status = status;
      if (note !== undefined) a.vetNote = note;
      const target = actorId === a.vetId ? a.clientId : a.vetId;
      this.notify(target, 'appointment_' + status, actorId, { appointmentId: id, text: `${a.petName} · ${a.date} ${a.time}` });
      this.save();
    },

    /* ---------- Mensajes ---------- */
    conversations(userId) {
      const map = new Map();
      this.data.messages.forEach((m) => {
        if (m.from !== userId && m.to !== userId) return;
        const other = m.from === userId ? m.to : m.from;
        const prev = map.get(other);
        if (!prev || prev.createdAt < m.createdAt) map.set(other, m);
      });
      return [...map.entries()]
        .map(([otherId, last]) => ({
          otherId,
          last,
          unread: this.data.messages.filter((m) => m.from === otherId && m.to === userId && !m.read).length,
        }))
        .sort((a, b) => b.last.createdAt - a.last.createdAt);
    },
    thread(a, b) {
      return this.data.messages
        .filter((m) => (m.from === a && m.to === b) || (m.from === b && m.to === a))
        .sort((x, y) => x.createdAt - y.createdAt);
    },
    sendMessage(from, to, text, extra = {}) {
      if (!text.trim() && !extra.postId) return;
      this.data.messages.push(Object.assign({ id: uid('m'), from, to, text: text.trim(), createdAt: Date.now(), read: false }, extra));
      this.save();
    },
    markThreadRead(userId, otherId) {
      let changed = false;
      this.data.messages.forEach((m) => {
        if (m.from === otherId && m.to === userId && !m.read) { m.read = true; changed = true; }
      });
      if (changed) this.save();
    },
    unreadMessages(userId) { return this.data.messages.filter((m) => m.to === userId && !m.read).length; },

    /* ---------- Notificaciones ---------- */
    notify(userId, type, fromId, extra = {}) {
      if (!userId || userId === fromId) return;
      this.data.notifications.push(Object.assign({ id: uid('n'), userId, type, fromId, createdAt: Date.now(), read: false }, extra));
      if (this.data.notifications.length > 500) this.data.notifications = this.data.notifications.slice(-400);
    },
    notificationsFor(userId) {
      return this.data.notifications.filter((n) => n.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
    },
    unreadNotifications(userId) { return this.data.notifications.filter((n) => n.userId === userId && !n.read).length; },
    markNotificationsRead(userId) {
      let changed = false;
      this.data.notifications.forEach((n) => { if (n.userId === userId && !n.read) { n.read = true; changed = true; } });
      if (changed) this.save();
    },
  };

  window.Store = Store;
  window.uid = uid;
})();

/* Visvet — capa de datos para la versión publicada en claude.ai.
 *
 * Usa la base de datos compartida de la página (capacidad «db»). Cada
 * persona escribe SOLO en sus propios documentos (las reglas de la página lo
 * imponen), así nadie puede borrar ni modificar lo de otro:
 *
 *   profiles/<id>   perfil, mascotas y a quién sigue
 *   posts/<id>      sus publicaciones (+ comentarios que ha ocultado en ellas)
 *   acts/<id>       sus «me gusta», guardados, comentarios e historias vistas
 *   stories/<id>    sus historias (24 h)
 *   mail/<id>       los mensajes que ha enviado y hasta dónde ha leído
 *   appts/<id>      sus solicitudes de cita (cliente) o decisiones (veterinario)
 *   media/<id>/img/<foto>   sus fotos comprimidas
 *
 * La interfaz recibe los datos ya combinados con la misma forma que el modo
 * local (Store.data), y las notificaciones se calculan a partir de ellos.
 */
(function () {
  const COLS = ['profiles', 'posts', 'acts', 'stories', 'mail', 'appts'];
  const DAY = 24 * 3600 * 1000;
  const MAX_DOC = 240 * 1024;
  const MAX_IMG = 190 * 1024;

  const DEFAULTS = {
    profiles: () => null,
    posts: () => ({ items: [], hidden: [] }),
    acts: () => ({ likes: {}, saves: {}, comments: [], seen: [], notifReadAt: 0 }),
    stories: () => ({ items: [] }),
    mail: () => ({ sent: [], readAt: {} }),
    appts: () => ({ requests: [], decisions: {} }),
  };
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const empty = () => ({ users: [], posts: [], stories: [], appointments: [], messages: [], notifications: [] });

  // Recomprime una foto hasta que quepa en un documento
  function shrink(dataUrl) {
    if (dataUrl.length <= MAX_IMG) return Promise.resolve(dataUrl);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
      img.onload = () => {
        let side = Math.max(img.width, img.height);
        let q = 0.72;
        const c = document.createElement('canvas');
        const ctx = c.getContext('2d');
        for (let i = 0; i < 10; i++) {
          const k = Math.min(1, side / Math.max(img.width, img.height));
          c.width = Math.round(img.width * k);
          c.height = Math.round(img.height * k);
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const out = c.toDataURL('image/jpeg', q);
          if (out.length <= MAX_IMG) return resolve(out);
          if (q > 0.5) q -= 0.08; else side *= 0.8;
        }
        reject(new Error('La imagen es demasiado grande.'));
      };
      img.src = dataUrl;
    });
  }

  window.createClaudeStore = function (db, uid, LocalStore) {
    const raw = {};
    COLS.forEach((c) => (raw[c] = {}));
    const mine = {};
    const dirty = {};
    const writing = {};
    const pendingMedia = new Set();
    let deleting = false;
    const mediaCache = new Map();
    const mediaLoading = new Map();

    const toast = (m, t) => window.toast && window.toast(m, t);
    const fail = (e) => {
      console.error(e);
      const code = e && e.code;
      if (code === 'quota_exceeded') toast('Se ha llenado el espacio de Visvet. Borra publicaciones antiguas para seguir.', 'error');
      else if (code === 'invalid_argument') toast('No tienes permiso para guardar cambios. Pide al propietario acceso de Editor.', 'error');
      else if (code === 'resource_exhausted') toast('Vas demasiado rápido. Espera un momento.', 'error');
      else toast('No se pudo guardar. Revisa tu conexión.', 'error');
    };

    function my(col) {
      if (!mine[col]) mine[col] = DEFAULTS[col]();
      return mine[col];
    }

    function fit(col, body) {
      let size = JSON.stringify(body).length;
      while (size > MAX_DOC) {
        if (col === 'acts' && body.comments.length) body.comments.shift();
        else if (col === 'acts' && body.seen.length) body.seen.splice(0, 50);
        else if (col === 'mail' && body.sent.length) body.sent.shift();
        else return false;
        size = JSON.stringify(body).length;
      }
      return true;
    }

    // Guarda mi documento: una escritura cada vez, agrupando cambios seguidos
    function save(col) {
      dirty[col] = true;
      if (writing[col]) return writing[col];
      writing[col] = (async () => {
        while (dirty[col]) {
          dirty[col] = false;
          if (col === 'posts' && pendingMedia.size) {
            await Promise.allSettled([...pendingMedia]);
          }
          const body = clone(mine[col]);
          if (!body) break;
          if (!fit(col, body)) { toast('Has llegado al límite de contenido de tu cuenta.', 'error'); break; }
          try { await db.doc(col + '/' + uid).set(body); } catch (e) { fail(e); break; }
        }
        writing[col] = null;
      })();
      return writing[col];
    }

    /* ---------- Combinar documentos en la forma que usa la interfaz ---------- */
    function docs(col) {
      const d = Object.assign({}, raw[col]);
      if (mine[col]) d[uid] = mine[col];
      return d;
    }

    function derive() {
      const now = Date.now();
      const P = docs('profiles'), PO = docs('posts'), A = docs('acts'), ST = docs('stories'), M = docs('mail'), AP = docs('appts');
      const data = empty();

      data.users = Object.entries(P).filter(([, p]) => p && p.username).map(([id, p]) => Object.assign({
        avatar: '', bio: '', city: '', clinic: '', license: '', specialty: '', phone: '', schedule: '',
        pets: [], following: [], followedAt: {}, createdAt: 0,
      }, p, { id }));
      const exists = new Set(data.users.map((u) => u.id));

      // interacciones
      const likes = {}, saves = {}, comments = {}, seen = {};
      Object.entries(A).forEach(([who, a]) => {
        if (!a || !exists.has(who)) return;
        Object.keys(a.likes || {}).forEach((pid) => (likes[pid] = likes[pid] || []).push(who));
        Object.keys(a.saves || {}).forEach((pid) => (saves[pid] = saves[pid] || []).push(who));
        (a.comments || []).forEach((c) => (comments[c.postId] = comments[c.postId] || []).push(Object.assign({}, c, { userId: who })));
        (a.seen || []).forEach((sid) => (seen[sid] = seen[sid] || []).push(who));
      });

      Object.entries(PO).forEach(([owner, d]) => {
        if (!d || !exists.has(owner)) return;
        const hidden = new Set(d.hidden || []);
        (d.items || []).forEach((it) => {
          data.posts.push({
            id: it.id, userId: owner, image: it.image, caption: it.caption || '', category: it.category, createdAt: it.createdAt,
            likes: likes[it.id] || [], savedBy: saves[it.id] || [],
            comments: (comments[it.id] || []).filter((c) => !hidden.has(c.id)).sort((x, y) => x.createdAt - y.createdAt),
          });
        });
      });
      data.posts.sort((a, b) => b.createdAt - a.createdAt);

      Object.entries(ST).forEach(([owner, d]) => {
        if (!d || !exists.has(owner)) return;
        (d.items || []).forEach((it) => {
          if (it.createdAt > now - DAY) data.stories.push({ id: it.id, userId: owner, image: it.image, createdAt: it.createdAt, seenBy: seen[it.id] || [] });
        });
      });

      // citas: solicitud del cliente + decisión del veterinario
      Object.entries(AP).forEach(([client, d]) => {
        if (!d || !exists.has(client)) return;
        (d.requests || []).forEach((r) => {
          if (client !== uid && r.vetId !== uid) return;
          const dec = (AP[r.vetId] && AP[r.vetId].decisions && AP[r.vetId].decisions[r.id]) || null;
          data.appointments.push({
            id: r.id, clientId: client, vetId: r.vetId, petName: r.petName, species: r.species || '', date: r.date, time: r.time,
            reason: r.reason, createdAt: r.createdAt, cancelledAt: r.cancelledAt || 0,
            status: r.cancelled ? 'cancelada' : (dec && dec.status) || 'pendiente',
            vetNote: (dec && dec.vetNote) || '', decidedAt: (dec && dec.updatedAt) || 0,
          });
        });
      });

      // mensajes en los que participo
      Object.entries(M).forEach(([from, d]) => {
        if (!d || !exists.has(from)) return;
        (d.sent || []).forEach((m) => {
          if (from !== uid && m.to !== uid) return;
          const readUpTo = (M[m.to] && M[m.to].readAt && M[m.to].readAt[from]) || 0;
          data.messages.push(Object.assign({}, m, { from, read: readUpTo >= m.createdAt }));
        });
      });

      // notificaciones (calculadas)
      const readAt = (A[uid] && A[uid].notifReadAt) || 0;
      const N = [];
      const add = (n) => { if (n.fromId !== uid && exists.has(n.fromId)) N.push(Object.assign(n, { userId: uid, read: n.createdAt <= readAt })); };
      data.posts.filter((p) => p.userId === uid).forEach((p) => {
        p.likes.forEach((who) => add({ id: 'l' + p.id + who, type: 'like', fromId: who, postId: p.id, createdAt: A[who].likes[p.id] }));
        p.comments.forEach((c) => add({ id: 'c' + c.id, type: 'comment', fromId: c.userId, postId: p.id, text: c.text.slice(0, 80), createdAt: c.createdAt }));
      });
      data.users.forEach((u) => {
        if (u.following.includes(uid)) add({ id: 'f' + u.id, type: 'follow', fromId: u.id, createdAt: (u.followedAt && u.followedAt[uid]) || u.createdAt });
      });
      data.appointments.forEach((a) => {
        const text = `${a.petName} · ${a.date} ${a.time}`;
        if (a.vetId === uid) {
          add({ id: 'ar' + a.id, type: 'appointment_request', fromId: a.clientId, text, createdAt: a.createdAt });
          if (a.status === 'cancelada') add({ id: 'ac' + a.id, type: 'appointment_cancelada', fromId: a.clientId, text, createdAt: a.cancelledAt });
        } else if (a.decidedAt && a.status !== 'cancelada') {
          add({ id: 'ad' + a.id + a.status, type: 'appointment_' + a.status, fromId: a.vetId, text, createdAt: a.decidedAt });
        }
      });
      data.notifications = N.sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);

      S.data = data;
    }

    let emitTimer = null;
    const S = {
      mode: 'claude',
      memoryRouter: true,
      managedAuth: true,
      uid,
      data: empty(),
      listeners: [],

      init() {
        return new Promise((resolve) => {
          let pending = COLS.length;
          let done = false;
          const finish = () => { if (!done) { done = true; derive(); resolve(); } };
          const timer = setTimeout(() => { toast('Visvet tarda en responder; puede que veas datos desactualizados.', 'error'); finish(); }, 10000);
          COLS.forEach((col) => {
            let first = true;
            db.collection(col).limit(1000).onSnapshot((snap) => {
              const next = {};
              snap.docs.forEach((d) => { if (d.exists) next[d.id] = d.data(); });
              raw[col] = next;
              // mi documento: lo adopto del servidor si no tengo cambios por guardar
              if (deleting) mine[col] = null;
              else if (!writing[col] && !dirty[col]) mine[col] = next[uid] ? clone(next[uid]) : null;
              if (first) {
                first = false;
                if (--pending === 0) { clearTimeout(timer); finish(); }
              } else if (done) {
                derive();
                clearTimeout(emitTimer);
                emitTimer = setTimeout(() => S.emit(), 120);
              }
            }, (e) => {
              console.error(e);
              if (first) { first = false; if (--pending === 0) { clearTimeout(timer); finish(); } }
              if (e.code !== 'unavailable') toast('Se perdió la conexión con Visvet. Recarga la página.', 'error');
            });
          });
        });
      },
      onChange(fn) { this.listeners.push(fn); },
      emit() { this.listeners.forEach((fn) => fn()); },
      save() { return true; },

      /* ---------- Sesión (la gestiona Claude) ---------- */
      currentUserId() { return uid; },
      currentUser() { return this.user(uid); },
      authEmail() { return ''; },
      setSession() {},
      logout() {},

      async register(f) {
        const username = String(f.username || '').trim().toLowerCase();
        if (!/^[a-z0-9._]{3,30}$/.test(username)) throw new Error('El usuario debe tener 3-30 caracteres: letras, números, punto o guion bajo.');
        if (this.data.users.some((u) => u.id !== uid && u.username === username)) throw new Error('Ese nombre de usuario ya está en uso.');
        mine.profiles = {
          username, name: f.name.trim(), role: f.role === 'vet' ? 'vet' : 'client',
          avatar: '', bio: '', city: (f.city || '').trim(),
          clinic: f.clinic || '', license: f.license || '', specialty: f.specialty || '', phone: '', schedule: '',
          pets: f.pets || [], following: [], followedAt: {}, createdAt: Date.now(),
        };
        try {
          await db.doc('profiles/' + uid).set(clone(mine.profiles));
        } catch (e) {
          console.error(e);
          mine.profiles = null;
          derive();
          throw new Error(e && e.code === 'invalid_argument'
            ? 'No tienes permiso para participar en Visvet. Pide a quien te la compartió que te invite como Editor.'
            : 'No se pudo crear tu perfil. Revisa tu conexión e inténtalo de nuevo.');
        }
        derive();
        return this.user(uid);
      },

      async deleteUser() {
        const ids = [];
        (my('posts').items || []).forEach((p) => ids.push(p.image));
        (my('stories').items || []).forEach((s) => ids.push(s.image));
        deleting = true;
        COLS.forEach((c) => { mine[c] = null; });
        derive();
        try {
          for (const src of ids) { const path = mediaPath(src); if (path) await db.doc(path).delete(); }
          for (const c of COLS) await db.doc(c + '/' + uid).delete();
        } catch (e) { fail(e); throw new Error('No se pudo borrar todo. Inténtalo de nuevo.'); }
        finally { deleting = false; }
      },

      updateUser(id, patch) {
        if (id !== uid || !mine.profiles) return;
        Object.assign(mine.profiles, clone(patch));
        derive();
        save('profiles');
      },

      toggleFollow(a, b) {
        if (a !== uid || a === b || !mine.profiles) return;
        const p = mine.profiles;
        p.following = p.following || [];
        p.followedAt = p.followedAt || {};
        if (p.following.includes(b)) { p.following = p.following.filter((x) => x !== b); delete p.followedAt[b]; }
        else { p.following.push(b); p.followedAt[b] = Date.now(); }
        derive();
        save('profiles');
      },

      /* ---------- Fotos ---------- */
      mediaCached(key) { return mediaCache.get(key) || null; },
      loadMedia(key) {
        if (mediaCache.has(key)) return Promise.resolve(mediaCache.get(key));
        if (!mediaLoading.has(key)) {
          const path = mediaPath('media:' + key);
          const pr = (path ? db.doc(path).get() : Promise.resolve(null)).then((snap) => {
            const src = snap && snap.exists ? snap.data().data : null;
            if (src) mediaCache.set(key, src);
            mediaLoading.delete(key);
            return src;
          }).catch((e) => { console.error(e); mediaLoading.delete(key); return null; });
          mediaLoading.set(key, pr);
        }
        return mediaLoading.get(key);
      },
      _storeImage(image) {
        const id = rid();
        const key = uid + '/' + id;
        mediaCache.set(key, image);
        const task = shrink(image).then((small) => {
          mediaCache.set(key, small);
          return db.doc(`media/${uid}/img/${id}`).set({ data: small, createdAt: Date.now() });
        });
        pendingMedia.add(task);
        task.catch(() => {}).then(() => pendingMedia.delete(task));
        return { src: 'media:' + key, task };
      },

      /* ---------- Publicaciones ---------- */
      createPost({ image, caption, category }) {
        const doc = my('posts');
        const item = { id: rid(), image: '', caption: (caption || '').slice(0, 2200), category, createdAt: Date.now() };
        const { src, task } = this._storeImage(image);
        item.image = src;
        doc.items.unshift(item);
        if (JSON.stringify(doc).length > MAX_DOC) {
          doc.items.shift();
          toast('Has llegado al límite de publicaciones. Borra alguna antigua para publicar más.', 'error');
          return null;
        }
        task.catch((e) => {
          doc.items = doc.items.filter((x) => x.id !== item.id);
          derive(); this.emit();
          toast(e.message && e.message.includes('imagen') ? e.message : 'No se pudo subir la foto.', 'error');
        });
        derive();
        save('posts');
        return this.post(item.id);
      },
      deletePost(id) {
        const doc = my('posts');
        const it = doc.items.find((x) => x.id === id);
        if (!it) return;
        doc.items = doc.items.filter((x) => x.id !== id);
        derive();
        save('posts');
        const path = mediaPath(it.image);
        if (path) db.doc(path).delete().catch((e) => console.error(e));
      },
      toggleLike(postId) {
        const a = my('acts');
        const liked = !!a.likes[postId];
        if (liked) delete a.likes[postId]; else a.likes[postId] = Date.now();
        derive();
        save('acts');
        return !liked;
      },
      toggleSave(postId) {
        const a = my('acts');
        if (a.saves[postId]) delete a.saves[postId]; else a.saves[postId] = Date.now();
        derive();
        save('acts');
      },
      addComment(postId, userId, text) {
        if (!text.trim()) return;
        my('acts').comments.push({ id: rid(), postId, text: text.trim().slice(0, 300), createdAt: Date.now() });
        derive();
        save('acts');
      },
      deleteComment(postId, commentId) {
        const a = my('acts');
        if (a.comments.some((c) => c.id === commentId)) {
          a.comments = a.comments.filter((c) => c.id !== commentId);
          derive(); save('acts');
          return;
        }
        // comentario de otra persona en una publicación mía: lo oculto
        const p = this.post(postId);
        if (p && p.userId === uid) {
          const d = my('posts');
          d.hidden = (d.hidden || []).concat(commentId).slice(-500);
          derive(); save('posts');
        }
      },

      /* ---------- Historias ---------- */
      activeStories() { return this.data.stories; },
      addStory(userId, image) {
        const d = my('stories');
        const old = d.items.filter((s) => s.createdAt <= Date.now() - DAY);
        d.items = d.items.filter((s) => s.createdAt > Date.now() - DAY);
        old.forEach((s) => { const path = mediaPath(s.image); if (path) db.doc(path).delete().catch(() => {}); });
        const { src, task } = this._storeImage(image);
        const item = { id: rid(), image: src, createdAt: Date.now() };
        d.items.push(item);
        dirty.stories = true; // evita que una actualización del servidor la descarte antes de guardarla
        task.then(() => save('stories'), (e) => {
          dirty.stories = false;
          d.items = d.items.filter((x) => x.id !== item.id);
          derive(); this.emit();
          toast(e.message || 'No se pudo subir la historia.', 'error');
        });
        derive();
        return true;
      },
      deleteStory(id) {
        const d = my('stories');
        const it = d.items.find((x) => x.id === id);
        d.items = d.items.filter((x) => x.id !== id);
        derive();
        save('stories');
        const path = it && mediaPath(it.image);
        if (path) db.doc(path).delete().catch(() => {});
      },
      markStorySeen(storyId) {
        const a = my('acts');
        if (a.seen.includes(storyId)) return;
        a.seen.push(storyId);
        if (a.seen.length > 300) a.seen = a.seen.slice(-300);
        derive();
        save('acts');
      },

      /* ---------- Citas ---------- */
      requestAppointment(data) {
        const r = {
          id: rid(), vetId: data.vetId, petName: data.petName, species: data.species || '', date: data.date, time: data.time,
          reason: (data.reason || '').slice(0, 400), createdAt: Date.now(),
        };
        my('appts').requests.push(r);
        derive();
        save('appts');
        return r;
      },
      setAppointmentStatus(id, status, actorId, note) {
        const a = this.data.appointments.find((x) => x.id === id);
        if (!a) return;
        const d = my('appts');
        if (a.clientId === uid && status === 'cancelada') {
          const r = d.requests.find((x) => x.id === id);
          if (r) { r.cancelled = true; r.cancelledAt = Date.now(); }
        } else if (a.vetId === uid) {
          const prev = d.decisions[id] || {};
          d.decisions[id] = { status, vetNote: note !== undefined ? note : (prev.vetNote || ''), updatedAt: Date.now() };
        } else return;
        derive();
        save('appts');
      },
      setAppointmentNote(id, note) {
        const a = this.data.appointments.find((x) => x.id === id);
        if (!a || a.vetId !== uid) return;
        const d = my('appts');
        const prev = d.decisions[id] || { status: a.status, updatedAt: 0 };
        d.decisions[id] = Object.assign({}, prev, { vetNote: note });
        derive();
        save('appts');
      },

      /* ---------- Mensajes ---------- */
      sendMessage(from, to, text, extra = {}) {
        if (!text.trim() && !extra.postId) return;
        const m = { id: rid(), to, text: text.trim().slice(0, 1000), createdAt: Date.now() };
        if (extra.postId) m.postId = extra.postId;
        const d = my('mail');
        d.sent.push(m);
        if (d.sent.length > 400) d.sent = d.sent.slice(-400);
        derive();
        save('mail');
      },
      markThreadRead(userId, otherId) {
        const last = this.data.messages.filter((m) => m.from === otherId && m.to === uid && !m.read);
        if (!last.length) return;
        my('mail').readAt[otherId] = Date.now();
        derive();
        save('mail');
      },

      /* ---------- Notificaciones ---------- */
      notify() {},
      markNotificationsRead() {
        if (!this.data.notifications.some((n) => !n.read)) return;
        my('acts').notifReadAt = Date.now();
        derive();
        save('acts');
      },
    };

    function mediaPath(src) {
      if (typeof src !== 'string' || !src.startsWith('media:')) return null;
      const key = src.slice(6);
      const i = key.indexOf('/');
      if (i < 1) return null;
      return `media/${key.slice(0, i)}/img/${key.slice(i + 1)}`;
    }

    ['user', 'userByUsername', 'followers', 'isFollowing', 'post', 'postsBy', 'appointmentsFor',
      'conversations', 'thread', 'unreadMessages', 'notificationsFor', 'unreadNotifications']
      .forEach((k) => { S[k] = LocalStore[k]; });

    return S;
  };
})();

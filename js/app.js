/* Visvet — aplicación principal (SPA con rutas por hash, apta para GitHub Pages) */
(function () {
  'use strict';

  /* ======================================================
   * Utilidades
   * ====================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const I = window.Icons;
  const S = window.Store;

  const esc = (str) => String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const CATEGORIES = {
    consejo: { label: 'Consejo veterinario', emoji: '💡', vetOnly: true },
    caso: { label: 'Caso clínico', emoji: '🩺', vetOnly: true },
    mascota: { label: 'Mi mascota', emoji: '🐾' },
    adopcion: { label: 'Adopción', emoji: '🏡' },
    aviso: { label: 'Aviso / Urgencia', emoji: '🚨' },
    antesdespues: { label: 'Antes y después', emoji: '✨' },
  };

  const SPECIALTIES = [
    'Medicina general', 'Medicina felina', 'Cirugía y traumatología', 'Animales exóticos',
    'Dermatología', 'Cardiología', 'Odontología', 'Oftalmología', 'Oncología',
    'Etología (comportamiento)', 'Nutrición', 'Urgencias', 'Équidos', 'Animales de granja',
  ];
  const SPECIES = ['Perro', 'Gato', 'Conejo', 'Ave', 'Hurón', 'Reptil', 'Roedor', 'Caballo', 'Pez', 'Otro'];
  const SPECIES_EMOJI = { Perro: '🐶', Gato: '🐱', Conejo: '🐰', Ave: '🦜', Hurón: '🦦', Reptil: '🦎', Roedor: '🐹', Caballo: '🐴', Pez: '🐟', Otro: '🐾' };

  const STATUS = {
    pendiente: { label: 'Pendiente', cls: 'st-pending' },
    confirmada: { label: 'Confirmada', cls: 'st-ok' },
    completada: { label: 'Completada', cls: 'st-done' },
    rechazada: { label: 'Rechazada', cls: 'st-ko' },
    cancelada: { label: 'Cancelada', cls: 'st-ko' },
  };

  function timeAgo(ts) {
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    if (diff < 7 * 86400) return `hace ${Math.floor(diff / 86400)} d`;
    return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const fmtDate = (d) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // Texto con @menciones y #hashtags enlazados
  function richText(text) {
    return esc(text)
      .replace(/@([a-z0-9._]{3,30})/gi, (m, u) => (S.userByUsername(u) ? `<a href="#/u/${u.toLowerCase()}" class="mention">@${u}</a>` : m))
      .replace(/(^|\s)#([\wáéíóúñü]+)/gi, (m, sp, tag) => `${sp}<a href="#/explore?q=${encodeURIComponent('#' + tag)}" class="hashtag">#${tag}</a>`)
      .replace(/\n/g, '<br>');
  }

  function colorFor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return `hsl(${h} 60% 50%)`;
  }

  function avatar(user, size = 32, opts = {}) {
    if (!user) return '';
    const ring = opts.ring ? ` ring${opts.seen ? ' seen' : ''}` : '';
    const inner = user.avatar
      ? `<img src="${esc(user.avatar)}" alt="" loading="lazy">`
      : `<span class="initials" style="background:${colorFor(user.id)};font-size:${Math.round(size * 0.4)}px">${esc((user.name || user.username).trim().charAt(0).toUpperCase())}</span>`;
    return `<span class="avatar${ring}" style="--s:${size}px">${inner}</span>`;
  }

  const badge = (u) => (u && u.role === 'vet' ? I.verified : '');
  const userLink = (u) => `<a href="#/u/${esc(u.username)}" class="ulink">${esc(u.username)}</a>${badge(u)}`;
  const roleLabel = (u) => (u.role === 'vet' ? `Veterinario/a${u.specialty ? ' · ' + esc(u.specialty) : ''}` : 'Dueño/a de mascotas');

  /* ---------- Avisos ---------- */
  let toastTimer;
  function toast(msg, type = '') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = ''), 3200);
  }
  window.toast = toast;

  /* ---------- Imágenes: redimensionar y comprimir ---------- */
  function readImage(file, max = 1080, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) return reject(new Error('El archivo no es una imagen.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Formato de imagen no soportado.'));
        img.onload = () => {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- Modales ---------- */
  function openModal(html, { cls = '', onClose } = {}) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-backdrop" data-action="close-modal-bg"><div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div></div>`;
    document.body.classList.add('no-scroll');
    root._onClose = onClose;
    const first = root.querySelector('input, textarea, select');
    if (first && window.matchMedia('(min-width: 768px)').matches) first.focus();
    return root.firstElementChild;
  }
  function closeModal() {
    const root = $('#modal-root');
    if (!root.innerHTML) return;
    const cb = root._onClose;
    root.innerHTML = '';
    root._onClose = null;
    document.body.classList.remove('no-scroll');
    if (cb) cb();
  }
  function confirmModal(title, text, okLabel = 'Aceptar', danger = false) {
    return new Promise((resolve) => {
      let answered = false;
      openModal(`
        <div class="modal-body center">
          <h3>${esc(title)}</h3>
          ${text ? `<p class="muted">${esc(text)}</p>` : ''}
        </div>
        <div class="modal-list">
          <button class="${danger ? 'danger' : 'primary-text'}" data-confirm="yes">${esc(okLabel)}</button>
          <button data-confirm="no">Cancelar</button>
        </div>`, { cls: 'small', onClose: () => { if (!answered) resolve(false); } });
      $$('#modal-root [data-confirm]').forEach((b) => b.addEventListener('click', () => {
        answered = true; resolve(b.dataset.confirm === 'yes'); closeModal();
      }));
    });
  }
  function promptModal(title, label, placeholder = '') {
    return new Promise((resolve) => {
      let answered = false;
      openModal(`
        <div class="modal-head"><h3>${esc(title)}</h3></div>
        <form class="modal-body" id="prompt-form">
          <label class="field"><span>${esc(label)}</span>
            <textarea name="v" rows="3" placeholder="${esc(placeholder)}"></textarea></label>
          <div class="row-end"><button type="button" class="btn ghost" id="prompt-cancel">Cancelar</button>
          <button class="btn primary">Guardar</button></div>
        </form>`, { cls: 'small', onClose: () => { if (!answered) resolve(null); } });
      $('#prompt-cancel').onclick = () => closeModal();
      $('#prompt-form').onsubmit = (e) => { e.preventDefault(); answered = true; resolve(e.target.v.value.trim()); closeModal(); };
    });
  }

  /* ======================================================
   * Router
   * ====================================================== */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, query = ''] = raw.split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const params = Object.fromEntries(new URLSearchParams(query));
    return { name: parts[0] || 'feed', parts, params };
  }
  const go = (h) => { if (location.hash === h) render(); else location.hash = h; };

  const ROUTES = {
    feed: () => FeedPage(),
    explore: (r) => ExplorePage(r.params),
    create: () => CreatePage(),
    appointments: () => AppointmentsPage(),
    messages: (r) => MessagesPage(r.parts[1]),
    notifications: () => NotificationsPage(),
    u: (r) => ProfilePage(r.parts[1]),
    p: (r) => PostPage(r.parts[1]),
    edit: () => EditProfilePage(),
  };

  let me = null;
  let lastRoute = '';

  function render() {
    me = S.currentUser();
    const route = parseHash();
    const app = $('#app');

    if (!me) {
      if (route.name !== 'register') route.name = 'login';
      app.innerHTML = route.name === 'register' ? RegisterPage() : LoginPage();
      mountAuth();
      return;
    }
    if (route.name === 'login' || route.name === 'register') { location.hash = '#/'; return; }

    const page = ROUTES[route.name] || (() => NotFound());
    const { html, mount } = normalize(page(route));
    app.innerHTML = Shell(html, route.name);
    if (mount) mount();

    const key = route.parts.join('/');
    if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
  }
  const normalize = (r) => (typeof r === 'string' ? { html: r } : r);

  /* ======================================================
   * Estructura (barra lateral, cabecera móvil, navegación inferior)
   * ====================================================== */
  function Shell(content, active) {
    const notif = S.unreadNotifications(me.id);
    const msgs = S.unreadMessages(me.id);
    const pendingAppts = S.appointmentsFor(me.id).filter((a) => a.status === 'pendiente' && a.vetId === me.id).length;
    const dot = (n) => (n ? `<span class="badge-count">${n > 9 ? '9+' : n}</span>` : '');
    const item = (href, icon, label, key, extra = '') =>
      `<a href="${href}" class="nav-item${active === key ? ' active' : ''}"><span class="nav-ico">${icon}${extra}</span><span class="nav-label">${label}</span></a>`;

    return `
    <div class="layout">
      <aside class="sidebar">
        <a href="#/" class="brand"><span class="logo-text">Visvet</span><span class="brand-ico">${I.paw}</span></a>
        <nav>
          ${item('#/', I.home, 'Inicio', 'feed')}
          ${item('#/explore', I.search, 'Explorar', 'explore')}
          ${item('#/notifications', I.heart, 'Notificaciones', 'notifications', dot(notif))}
          ${item('#/messages', I.message, 'Mensajes', 'messages', dot(msgs))}
          ${item('#/appointments', I.calendar, me.role === 'vet' ? 'Agenda' : 'Mis citas', 'appointments', dot(pendingAppts))}
          ${item('#/create', I.plus, 'Crear', 'create')}
          <a href="#/u/${esc(me.username)}" class="nav-item${active === 'u' && parseHash().parts[1] === me.username ? ' active' : ''}">
            <span class="nav-ico">${avatar(me, 26)}</span><span class="nav-label">Perfil</span></a>
        </nav>
        <div class="sidebar-foot">
          <a href="#/edit" class="nav-item${active === 'edit' ? ' active' : ''}"><span class="nav-ico">${I.settings}</span><span class="nav-label">Configuración</span></a>
          <button class="nav-item" data-action="logout"><span class="nav-ico">${I.logout}</span><span class="nav-label">Cerrar sesión</span></button>
        </div>
      </aside>

      <header class="topbar">
        <a href="#/" class="logo-text">Visvet</a>
        <div class="topbar-actions">
          <a href="#/notifications" class="icon-btn" aria-label="Notificaciones">${I.heart}${dot(notif)}</a>
          <a href="#/messages" class="icon-btn" aria-label="Mensajes">${I.message}${dot(msgs)}</a>
        </div>
      </header>

      <main class="main">${content}</main>

      <nav class="bottomnav">
        <a href="#/" class="${active === 'feed' ? 'active' : ''}" aria-label="Inicio">${I.home}</a>
        <a href="#/explore" class="${active === 'explore' ? 'active' : ''}" aria-label="Explorar">${I.search}</a>
        <a href="#/create" class="${active === 'create' ? 'active' : ''}" aria-label="Crear">${I.plus}</a>
        <a href="#/appointments" class="${active === 'appointments' ? 'active' : ''}" aria-label="Citas">${I.calendar}${dot(pendingAppts)}</a>
        <a href="#/u/${esc(me.username)}" class="${active === 'u' ? 'active' : ''}" aria-label="Perfil">${avatar(me, 26)}</a>
      </nav>
    </div>`;
  }

  /* ======================================================
   * Login / Registro
   * ====================================================== */
  function authAside() {
    const A = window.VisvetArt;
    return `
      <div class="auth-aside">
        <div class="phone">
          <div class="phone-screen">
            <img src="${A.art('🐶', '#0f9d8a', '#7fd34e', 'Comparte')}" alt="">
            <img src="${A.art('🐱', '#8b5cf6', '#ec4899', 'Aprende')}" alt="">
            <img src="${A.art('🩺', '#2563eb', '#22d3ee', 'Pide cita')}" alt="">
          </div>
        </div>
      </div>`;
  }

  function LoginPage() {
    return `
    <div class="auth">
      ${authAside()}
      <div class="auth-col">
        <div class="card auth-card">
          <h1 class="logo-text big">Visvet</h1>
          <p class="muted center">La red social de los veterinarios y de quienes aman a sus mascotas.</p>
          <form id="login-form" class="stack">
            <input name="login" placeholder="Usuario o correo electrónico" autocomplete="username" required>
            <input name="password" type="password" placeholder="Contraseña" autocomplete="current-password" required>
            <button class="btn primary block">Iniciar sesión</button>
            <p class="form-error" id="auth-error"></p>
          </form>
          <div class="divider"><span>o prueba una cuenta demo</span></div>
          <div class="demo-accounts">
            <button class="chip" data-demo="dra.lucia">${I.stethoscope} Veterinaria</button>
            <button class="chip" data-demo="ana.y.toby">${I.paw} Cliente</button>
          </div>
          <p class="tiny muted center">Contraseña de las cuentas demo: <b>demo1234</b></p>
        </div>
        <div class="card auth-card small-pad center">¿No tienes cuenta? <a href="#/register" class="strong-link">Regístrate</a></div>
      </div>
    </div>`;
  }

  let registerRole = 'client';
  function RegisterPage() {
    const vet = registerRole === 'vet';
    return `
    <div class="auth">
      ${authAside()}
      <div class="auth-col">
        <div class="card auth-card">
          <h1 class="logo-text big">Visvet</h1>
          <p class="muted center">Regístrate para compartir y cuidar mejor a tus pacientes o mascotas.</p>
          <div class="role-switch" role="radiogroup">
            <button type="button" class="role-opt${vet ? ' active' : ''}" data-role="vet" role="radio" aria-checked="${vet}">
              <span class="role-ico">${I.stethoscope}</span><b>Soy veterinario/a</b><small>Perfil profesional verificado, agenda de citas</small></button>
            <button type="button" class="role-opt${!vet ? ' active' : ''}" data-role="client" role="radio" aria-checked="${!vet}">
              <span class="role-ico">${I.paw}</span><b>Soy cliente</b><small>Dueño/a de mascotas, pide citas y sigue a tu veterinario</small></button>
          </div>
          <form id="register-form" class="stack">
            <input name="name" placeholder="Nombre completo" required maxlength="60">
            <input name="username" placeholder="Nombre de usuario" required maxlength="30" autocomplete="username" pattern="[A-Za-z0-9._]{3,30}" title="3-30 caracteres: letras, números, punto o guion bajo">
            <input name="email" type="email" placeholder="Correo electrónico" required autocomplete="email">
            <input name="password" type="password" placeholder="Contraseña (mín. 6 caracteres)" minlength="6" required autocomplete="new-password">
            <input name="city" placeholder="Ciudad" maxlength="40">
            ${vet ? `
              <div class="form-section">${I.stethoscope} Datos profesionales</div>
              <input name="clinic" placeholder="Clínica u hospital veterinario" required maxlength="80">
              <input name="license" placeholder="Nº de colegiado" required maxlength="30">
              <select name="specialty" required>
                <option value="">Especialidad…</option>
                ${SPECIALTIES.map((s) => `<option>${s}</option>`).join('')}
              </select>
              <label class="check"><input type="checkbox" required> Declaro que soy veterinario/a colegiado/a</label>
            ` : `
              <div class="form-section">${I.paw} Tu primera mascota <small class="muted">(opcional)</small></div>
              <div class="grid-2">
                <input name="petName" placeholder="Nombre" maxlength="30">
                <select name="petSpecies">${SPECIES.map((s) => `<option>${s}</option>`).join('')}</select>
              </div>
            `}
            <button class="btn primary block">Registrarte</button>
            <p class="form-error" id="auth-error"></p>
          </form>
        </div>
        <div class="card auth-card small-pad center">¿Tienes una cuenta? <a href="#/login" class="strong-link">Inicia sesión</a></div>
      </div>
    </div>`;
  }

  function afterLogin() {
    const n = parseHash().name;
    if (n === 'login' || n === 'register' || !location.hash) location.hash = '#/';
    render();
  }

  function mountAuth() {
    const err = (m) => { const e = $('#auth-error'); if (e) e.textContent = m; };
    const login = $('#login-form');
    if (login) {
      login.onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        try { await S.login(f.login.value, f.password.value); afterLogin(); }
        catch (ex) { err(ex.message); }
      };
      $$('[data-demo]').forEach((b) => (b.onclick = async () => {
        try { await S.login(b.dataset.demo, 'demo1234'); afterLogin(); toast(`¡Hola, ${S.currentUser().name}! 👋`); }
        catch (ex) { err(ex.message); }
      }));
    }
    const reg = $('#register-form');
    if (reg) {
      $$('[data-role]').forEach((b) => (b.onclick = () => {
        // conservar lo escrito al cambiar de rol
        const keep = {};
        ['name', 'username', 'email', 'password', 'city'].forEach((k) => (keep[k] = reg[k].value));
        registerRole = b.dataset.role;
        render();
        const r2 = $('#register-form');
        Object.entries(keep).forEach(([k, v]) => (r2[k].value = v));
      }));
      reg.onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        const data = {
          role: registerRole, name: f.name.value, username: f.username.value, email: f.email.value,
          password: f.password.value, city: f.city.value,
        };
        if (registerRole === 'vet') {
          Object.assign(data, { clinic: f.clinic.value.trim(), license: f.license.value.trim(), specialty: f.specialty.value });
        } else if (f.petName.value.trim()) {
          data.pets = [{ name: f.petName.value.trim(), species: f.petSpecies.value, breed: '', age: '' }];
        }
        try {
          const u = await S.register(data);
          S.setSession(u.id);
          // seguir automáticamente a los veterinarios demo para que el inicio no esté vacío
          S.data.users.filter((x) => x.role === 'vet' && x.id !== u.id).slice(0, 3).forEach((v) => u.following.push(v.id));
          S.save();
          location.hash = '#/';
          render();
          toast(`¡Bienvenido/a a Visvet, ${u.name}! 🐾`);
        } catch (ex) { err(ex.message); }
      };
    }
  }

  /* ======================================================
   * Tarjeta de publicación
   * ====================================================== */
  function postCard(p, variant = 'feed') {
    const author = S.user(p.userId);
    if (!author) return '';
    const liked = p.likes.includes(me.id);
    const saved = p.savedBy.includes(me.id);
    const cat = CATEGORIES[p.category];
    const comments = variant === 'full' ? p.comments : p.comments.slice(-2);
    const hasStory = S.activeStories().some((s) => s.userId === author.id);

    return `
    <article class="post card" data-post="${p.id}" data-variant="${variant}">
      <header class="post-head">
        <a href="#/u/${esc(author.username)}" ${hasStory ? `data-action="open-story" data-user="${author.id}"` : ''}>${avatar(author, 34, { ring: hasStory })}</a>
        <div class="post-meta">
          <div>${userLink(author)} <span class="muted dot-sep">• ${timeAgo(p.createdAt)}</span></div>
          <small class="muted">${author.role === 'vet' ? esc(author.clinic || roleLabel(author)) : esc(author.city || '')}</small>
        </div>
        ${cat ? `<span class="cat-chip cat-${p.category}">${cat.emoji} ${cat.label}</span>` : ''}
        <button class="icon-btn" data-action="post-options" data-id="${p.id}" aria-label="Opciones">${I.more}</button>
      </header>
      <div class="post-media" data-action="dbl-like" data-id="${p.id}">
        <img src="${esc(p.image)}" alt="Publicación de ${esc(author.username)}" loading="lazy">
        <span class="big-heart">${I.heartFill}</span>
      </div>
      <div class="post-body">
        <div class="post-actions">
          <button class="icon-btn${liked ? ' liked' : ''}" data-action="like" data-id="${p.id}" aria-label="Me gusta">${liked ? I.heartFill : I.heart}</button>
          <a class="icon-btn" href="#/p/${p.id}" aria-label="Comentar">${I.comment}</a>
          <button class="icon-btn" data-action="share" data-id="${p.id}" aria-label="Compartir">${I.send}</button>
          <span class="spacer"></span>
          <button class="icon-btn${saved ? ' saved' : ''}" data-action="save" data-id="${p.id}" aria-label="Guardar">${saved ? I.bookmarkFill : I.bookmark}</button>
        </div>
        <button class="likes-line" data-action="show-likes" data-id="${p.id}">${plural(p.likes.length, 'Me gusta', 'Me gusta')}</button>
        ${p.caption ? `<p class="caption">${userLink(author)} ${richText(p.caption)}</p>` : ''}
        ${variant !== 'full' && p.comments.length > 2 ? `<a href="#/p/${p.id}" class="muted view-all">Ver los ${p.comments.length} comentarios</a>` : ''}
        <ul class="comments">
          ${comments.map((c) => commentItem(p, c)).join('')}
        </ul>
        ${variant === 'full' ? `<p class="tiny muted upper">${new Date(p.createdAt).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}</p>` : ''}
        <form class="comment-form" data-form="comment" data-id="${p.id}">
          <input name="text" placeholder="Añade un comentario…" maxlength="500" autocomplete="off">
          <button class="link-btn">Publicar</button>
        </form>
      </div>
    </article>`;
  }

  function commentItem(p, c) {
    const u = S.user(c.userId);
    if (!u) return '';
    const canDelete = c.userId === me.id || p.userId === me.id;
    return `<li class="comment">
      <span>${userLink(u)} ${richText(c.text)}</span>
      ${canDelete ? `<button class="icon-btn tiny-ico" data-action="del-comment" data-post="${p.id}" data-id="${c.id}" aria-label="Eliminar comentario">${I.close}</button>` : ''}
    </li>`;
  }

  function refreshPost(id) {
    const p = S.post(id);
    $$(`[data-post="${id}"].post`).forEach((el) => {
      const draft = el.querySelector('.comment-form input')?.value || '';
      if (!p) { el.remove(); return; }
      const tmp = document.createElement('div');
      tmp.innerHTML = postCard(p, el.dataset.variant);
      const fresh = tmp.firstElementChild;
      el.replaceWith(fresh);
      if (draft) fresh.querySelector('.comment-form input').value = draft;
    });
  }

  /* ======================================================
   * Inicio (feed)
   * ====================================================== */
  function storiesBar() {
    const stories = S.activeStories();
    const visible = new Set([me.id, ...me.following]);
    const byUser = new Map();
    stories.filter((s) => visible.has(s.userId)).sort((a, b) => a.createdAt - b.createdAt).forEach((s) => {
      if (!byUser.has(s.userId)) byUser.set(s.userId, []);
      byUser.get(s.userId).push(s);
    });
    const mine = byUser.get(me.id);
    const others = [...byUser.entries()].filter(([id]) => id !== me.id)
      .map(([id, list]) => ({ user: S.user(id), list, seen: list.every((s) => s.seenBy.includes(me.id)) }))
      .filter((x) => x.user)
      .sort((a, b) => a.seen - b.seen);

    return `
    <div class="stories card">
      <div class="story">
        <button class="story-btn" data-action="${mine ? 'open-story' : 'add-story'}" data-user="${me.id}">
          ${avatar(me, 62, { ring: !!mine, seen: mine && mine.every((s) => s.seenBy.includes(me.id)) })}
          <span class="story-plus" data-action="add-story">+</span>
        </button>
        <span class="story-name">Tu historia</span>
      </div>
      ${others.map(({ user, seen }) => `
        <div class="story">
          <button class="story-btn" data-action="open-story" data-user="${user.id}">${avatar(user, 62, { ring: true, seen })}</button>
          <span class="story-name">${esc(user.username)}</span>
        </div>`).join('')}
    </div>
    <input type="file" accept="image/*" id="story-input" hidden>`;
  }

  function FeedPage() {
    const ids = new Set([me.id, ...me.following]);
    let posts = S.data.posts.filter((p) => ids.has(p.userId)).sort((a, b) => b.createdAt - a.createdAt);
    const discovering = posts.length === 0;
    if (discovering) posts = [...S.data.posts].sort((a, b) => b.createdAt - a.createdAt);

    const suggestions = S.data.users
      .filter((u) => u.id !== me.id && !me.following.includes(u.id))
      .sort((a, b) => (b.role === 'vet') - (a.role === 'vet') || S.followers(b.id).length - S.followers(a.id).length)
      .slice(0, 5);

    const upcoming = S.appointmentsFor(me.id).filter((a) => a.date >= today() && (a.status === 'confirmada' || a.status === 'pendiente')).slice(0, 2);

    return {
      html: `
      <div class="feed-layout">
        <section class="feed-col">
          ${storiesBar()}
          ${discovering ? `<div class="card info-card">${I.paw}<div><b>Tu inicio está vacío</b><p class="muted">Sigue a veterinarios y amigos para ver sus publicaciones aquí. Mientras tanto, te mostramos lo último en Visvet.</p></div></div>` : ''}
          ${posts.map((p) => postCard(p)).join('') || '<p class="empty">Todavía no hay publicaciones.</p>'}
          ${posts.length ? `<div class="end-feed">${I.check}<b>Ya estás al día</b><span class="muted">Has visto todas las publicaciones recientes.</span></div>` : ''}
        </section>
        <aside class="side-col">
          <div class="me-row">
            <a href="#/u/${esc(me.username)}">${avatar(me, 44)}</a>
            <div class="grow"><div>${userLink(me)}</div><small class="muted">${esc(me.name)}</small></div>
            <button class="link-btn" data-action="logout">Salir</button>
          </div>
          ${upcoming.length ? `
            <div class="side-box">
              <div class="side-title"><span>Próximas citas</span><a href="#/appointments">Ver todas</a></div>
              ${upcoming.map((a) => {
                const other = S.user(me.id === a.vetId ? a.clientId : a.vetId);
                return `<a href="#/appointments" class="mini-appt">
                  <span class="mini-date"><b>${a.date.slice(8)}</b><small>${new Date(a.date + 'T12:00').toLocaleDateString('es-ES', { month: 'short' })}</small></span>
                  <span class="grow"><b>${esc(a.petName)}</b> · ${esc(a.time)}<br><small class="muted">${other ? esc(other.name) : ''}</small></span>
                  <span class="status ${STATUS[a.status].cls}">${STATUS[a.status].label}</span></a>`;
              }).join('')}
            </div>` : ''}
          ${suggestions.length ? `
            <div class="side-box">
              <div class="side-title"><span>Sugerencias para ti</span><a href="#/explore?tab=vets">Ver todo</a></div>
              ${suggestions.map((u) => `
                <div class="sugg">
                  <a href="#/u/${esc(u.username)}">${avatar(u, 36)}</a>
                  <div class="grow"><div>${userLink(u)}</div><small class="muted">${u.role === 'vet' ? esc(u.specialty || 'Veterinario/a') : 'Dueño/a de mascotas'}${u.city ? ' · ' + esc(u.city) : ''}</small></div>
                  <button class="link-btn" data-action="follow" data-id="${u.id}">Seguir</button>
                </div>`).join('')}
            </div>` : ''}
          <footer class="side-foot">Visvet · La red social veterinaria<br>© ${new Date().getFullYear()} Visvet</footer>
        </aside>
      </div>`,
      mount: mountStoryInput,
    };
  }

  /* ---------- Historias ---------- */
  function mountStoryInput() {
    const input = $('#story-input');
    if (!input) return;
    input.onchange = async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      try {
        const img = await readImage(file, 900, 0.8);
        if (S.addStory(me.id, img)) { toast('Historia publicada (visible 24 h) ✨'); render(); }
      } catch (e) { toast(e.message, 'error'); }
    };
  }

  const story = { queue: [], ui: 0, si: 0, timer: null, start: 0, dur: 5000 };
  function openStories(userId) {
    const visible = new Set([me.id, ...me.following, userId]);
    const all = S.activeStories().filter((s) => visible.has(s.userId)).sort((a, b) => a.createdAt - b.createdAt);
    const order = [];
    all.forEach((s) => { if (!order.includes(s.userId)) order.push(s.userId); });
    // empezar por el usuario pulsado
    const start = order.indexOf(userId);
    const users = start >= 0 ? order.slice(start).concat(order.slice(0, start)).slice(0, order.length) : [userId];
    story.queue = users.map((id) => ({ user: S.user(id), list: all.filter((s) => s.userId === id) })).filter((q) => q.user && q.list.length);
    if (!story.queue.length) return;
    story.ui = 0;
    story.si = Math.max(0, story.queue[0].list.findIndex((s) => !s.seenBy.includes(me.id)));
    openModal('<div class="story-viewer" id="story-viewer"></div>', { cls: 'story-modal', onClose: () => { clearTimeout(story.timer); render(); } });
    showStory();
  }
  function showStory() {
    clearTimeout(story.timer);
    const group = story.queue[story.ui];
    if (!group) return closeModal();
    const s = group.list[story.si];
    if (!s) return closeModal();
    S.markStorySeen(s.id, me.id);
    const el = $('#story-viewer');
    if (!el) return;
    const own = s.userId === me.id;
    el.innerHTML = `
      <div class="story-bars">${group.list.map((x, i) => `<span class="bar"><i class="${i < story.si ? 'full' : i === story.si ? 'run' : ''}"></i></span>`).join('')}</div>
      <div class="story-top">
        <a href="#/u/${esc(group.user.username)}" data-action="close-modal">${avatar(group.user, 32)}</a>
        <b>${esc(group.user.username)}</b>${badge(group.user)}<span class="muted-light">${timeAgo(s.createdAt)}</span>
        <span class="spacer"></span>
        ${own ? `<span class="muted-light seen-count">👁 ${s.seenBy.filter((x) => x !== me.id).length}</span><button class="icon-btn light" data-action="del-story" data-id="${s.id}" aria-label="Eliminar historia">${I.trash}</button>` : ''}
        <button class="icon-btn light" data-action="close-modal" aria-label="Cerrar">${I.close}</button>
      </div>
      <img src="${esc(s.image)}" alt="Historia de ${esc(group.user.username)}">
      <button class="story-nav prev" data-action="story-prev" aria-label="Anterior"></button>
      <button class="story-nav next" data-action="story-next" aria-label="Siguiente"></button>
      ${!own ? `<form class="story-reply" data-form="story-reply" data-to="${group.user.id}"><input name="text" placeholder="Responder a ${esc(group.user.username)}…" autocomplete="off"><button class="icon-btn light">${I.send}</button></form>` : ''}`;
    const bar = el.querySelector('.bar i.run');
    if (bar) { bar.style.animationDuration = story.dur + 'ms'; }
    story.timer = setTimeout(nextStory, story.dur);
    const input = el.querySelector('.story-reply input');
    if (input) {
      input.addEventListener('focus', () => { clearTimeout(story.timer); if (bar) bar.style.animationPlayState = 'paused'; });
    }
  }
  function nextStory() {
    const g = story.queue[story.ui];
    if (story.si < g.list.length - 1) story.si++;
    else { story.ui++; story.si = 0; }
    showStory();
  }
  function prevStory() {
    if (story.si > 0) story.si--;
    else if (story.ui > 0) { story.ui--; story.si = story.queue[story.ui].list.length - 1; }
    showStory();
  }

  /* ======================================================
   * Detalle de publicación
   * ====================================================== */
  function PostPage(id) {
    const p = S.post(id);
    if (!p) return NotFound('Esta publicación ya no está disponible.');
    const author = S.user(p.userId);
    const more = S.postsBy(p.userId).filter((x) => x.id !== p.id).slice(0, 6);
    return {
      html: `
      <div class="page narrow">
        <button class="back-btn" data-action="back">${I.back} Volver</button>
        ${postCard(p, 'full')}
        ${more.length ? `<h4 class="section-title">Más publicaciones de ${userLink(author)}</h4>
          <div class="grid">${more.map(gridItem).join('')}</div>` : ''}
      </div>`,
      mount: () => { const i = $('.comment-form input'); if (i && window.matchMedia('(min-width: 768px)').matches) i.focus(); },
    };
  }

  function gridItem(p) {
    return `<a href="#/p/${p.id}" class="grid-item">
      <img src="${esc(p.image)}" alt="" loading="lazy">
      <span class="grid-overlay"><span>${I.heartFill} ${p.likes.length}</span><span>${I.comment} ${p.comments.length}</span></span>
      ${p.category === 'adopcion' ? '<span class="grid-tag">🏡</span>' : p.category === 'caso' ? '<span class="grid-tag">🩺</span>' : ''}
    </a>`;
  }

  /* ======================================================
   * Explorar
   * ====================================================== */
  function ExplorePage(params) {
    const q = (params.q || '').trim();
    const tab = params.tab || 'posts';
    const cat = params.cat || 'all';
    const spec = params.spec || '';
    const ql = q.toLowerCase();

    const tabLink = (t, label) => `<a href="#/explore?${new URLSearchParams({ ...params, tab: t })}" class="tab${tab === t ? ' active' : ''}">${label}</a>`;

    let body = '';
    if (tab === 'posts') {
      let posts = [...S.data.posts].sort((a, b) => (b.likes.length + b.comments.length * 2) - (a.likes.length + a.comments.length * 2) || b.createdAt - a.createdAt);
      if (cat !== 'all') posts = posts.filter((p) => p.category === cat);
      if (ql) posts = posts.filter((p) => {
        const a = S.user(p.userId);
        return p.caption.toLowerCase().includes(ql) || (a && a.username.includes(ql));
      });
      body = `
        <div class="chips-row">
          <a href="#/explore?${new URLSearchParams({ ...params, cat: 'all' })}" class="chip${cat === 'all' ? ' active' : ''}">Todo</a>
          ${Object.entries(CATEGORIES).map(([k, c]) => `<a href="#/explore?${new URLSearchParams({ ...params, cat: k })}" class="chip${cat === k ? ' active' : ''}">${c.emoji} ${c.label}</a>`).join('')}
        </div>
        ${posts.length ? `<div class="grid">${posts.map(gridItem).join('')}</div>` : `<p class="empty">No hay publicaciones${q ? ` para «${esc(q)}»` : ''}.</p>`}`;
    } else {
      const vets = tab === 'vets';
      let users = S.data.users.filter((u) => u.id !== me.id && (vets ? u.role === 'vet' : u.role === 'client'));
      if (ql) users = users.filter((u) => [u.username, u.name, u.clinic, u.specialty, u.city, ...(u.pets || []).map((p) => p.name + ' ' + p.species)].join(' ').toLowerCase().includes(ql.replace(/^#/, '')));
      if (vets && spec) users = users.filter((u) => u.specialty === spec);
      body = `
        ${vets ? `<div class="filter-row"><select id="spec-filter"><option value="">Todas las especialidades</option>${SPECIALTIES.map((s) => `<option${s === spec ? ' selected' : ''}>${s}</option>`).join('')}</select></div>` : ''}
        <div class="user-list">
          ${users.map((u) => userRow(u, true)).join('') || `<p class="empty">No se encontraron ${vets ? 'veterinarios' : 'personas'}.</p>`}
        </div>`;
    }

    return {
      html: `
      <div class="page">
        <form class="search-bar" id="search-form">
          ${I.search}<input name="q" value="${esc(q)}" placeholder="${tab === 'vets' ? 'Busca por nombre, clínica, especialidad o ciudad…' : 'Buscar publicaciones, #hashtags o usuarios…'}" autocomplete="off">
          ${q ? `<a href="#/explore?${new URLSearchParams({ tab })}" class="icon-btn" aria-label="Borrar">${I.close}</a>` : ''}
        </form>
        <div class="tabs">${tabLink('posts', `${I.grid} Publicaciones`)}${tabLink('vets', `${I.stethoscope} Veterinarios`)}${tabLink('people', `${I.paw} Dueños de mascotas`)}</div>
        ${body}
      </div>`,
      mount: () => {
        $('#search-form').onsubmit = (e) => {
          e.preventDefault();
          const v = e.target.q.value.trim();
          const np = { ...params };
          if (v) np.q = v; else delete np.q;
          // si busca un nombre de usuario exacto, sugerimos pestañas de personas
          location.hash = '#/explore?' + new URLSearchParams(np);
        };
        const sf = $('#spec-filter');
        if (sf) sf.onchange = () => {
          const np = { ...params, spec: sf.value };
          if (!sf.value) delete np.spec;
          location.hash = '#/explore?' + new URLSearchParams(np);
        };
      },
    };
  }

  function userRow(u, showFollow) {
    const following = me.following.includes(u.id);
    return `
    <div class="user-row">
      <a href="#/u/${esc(u.username)}">${avatar(u, 48)}</a>
      <div class="grow">
        <div>${userLink(u)}</div>
        <small class="muted">${esc(u.name)}${u.role === 'vet' ? ` · ${esc(u.specialty || '')}` : ''}</small>
        ${u.role === 'vet' && (u.clinic || u.city) ? `<small class="muted block">${I.location} ${esc([u.clinic, u.city].filter(Boolean).join(', '))}</small>` : ''}
        ${u.role === 'client' && u.pets && u.pets.length ? `<small class="muted block">${u.pets.map((p) => (SPECIES_EMOJI[p.species] || '🐾') + ' ' + esc(p.name)).join(' · ')}</small>` : ''}
      </div>
      ${showFollow && u.id !== me.id ? `<button class="btn ${following ? 'ghost' : 'primary'} sm" data-action="follow" data-id="${u.id}">${following ? 'Siguiendo' : 'Seguir'}</button>` : ''}
    </div>`;
  }

  /* ======================================================
   * Crear publicación / historia
   * ====================================================== */
  const draft = { image: null, mode: 'post', category: null };
  function CreatePage() {
    const vet = me.role === 'vet';
    if (!draft.category) draft.category = vet ? 'consejo' : 'mascota';
    return {
      html: `
      <div class="page narrow">
        <div class="card create-card">
          <div class="create-head">
            <h2>Crear</h2>
            <div class="seg">
              <button class="${draft.mode === 'post' ? 'active' : ''}" data-action="create-mode" data-mode="post">Publicación</button>
              <button class="${draft.mode === 'story' ? 'active' : ''}" data-action="create-mode" data-mode="story">Historia</button>
            </div>
          </div>
          <form id="create-form">
            <label class="dropzone${draft.image ? ' has-img' : ''}" id="dropzone">
              ${draft.image ? `<img src="${draft.image}" alt="Vista previa">` : `${I.image}<b>Arrastra una foto aquí</b><span class="muted">o haz clic para seleccionarla</span>`}
              <input type="file" accept="image/*" id="create-file" hidden>
            </label>
            ${draft.image ? '<button type="button" class="link-btn" data-action="clear-image">Cambiar imagen</button>' : ''}
            ${draft.mode === 'post' ? `
              <div class="field"><span>Categoría</span>
                <div class="chips-row wrap">
                  ${Object.entries(CATEGORIES).map(([k, c]) => {
                    const disabled = c.vetOnly && !vet;
                    return `<button type="button" class="chip${draft.category === k ? ' active' : ''}" data-action="pick-cat" data-cat="${k}" ${disabled ? 'disabled title="Solo para veterinarios"' : ''}>${c.emoji} ${c.label}</button>`;
                  }).join('')}
                </div>
                ${!vet ? '<small class="muted">«Consejo veterinario» y «Caso clínico» están reservados a profesionales verificados.</small>' : ''}
              </div>
              <label class="field"><span>Descripción</span>
                <textarea name="caption" rows="5" maxlength="2200" placeholder="${vet ? 'Comparte un consejo, un caso clínico o una novedad de tu clínica… Usa #hashtags y @menciones' : 'Cuéntanos algo sobre tu mascota… Usa #hashtags y menciona a tu veterinario con @'}">${esc(draft.caption || '')}</textarea>
                <small class="muted right" id="cap-count">${(draft.caption || '').length}/2200</small>
              </label>` : '<p class="muted">Las historias se muestran durante 24 horas a tus seguidores.</p>'}
            <button class="btn primary block" ${draft.image ? '' : 'disabled'}>${draft.mode === 'post' ? 'Compartir publicación' : 'Publicar historia'}</button>
          </form>
        </div>
      </div>`,
      mount: () => {
        const file = $('#create-file');
        const dz = $('#dropzone');
        const load = async (f) => {
          try { draft.image = await readImage(f, draft.mode === 'story' ? 900 : 1080, 0.82); render(); }
          catch (e) { toast(e.message, 'error'); }
        };
        file.onchange = () => file.files[0] && load(file.files[0]);
        dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); };
        dz.ondragleave = () => dz.classList.remove('drag');
        dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); e.dataTransfer.files[0] && load(e.dataTransfer.files[0]); };
        const cap = $('#create-form [name=caption]');
        if (cap) cap.oninput = () => { draft.caption = cap.value; $('#cap-count').textContent = `${cap.value.length}/2200`; };
        $('#create-form').onsubmit = (e) => {
          e.preventDefault();
          if (!draft.image) return toast('Añade una imagen primero.', 'error');
          if (draft.mode === 'story') {
            if (S.addStory(me.id, draft.image)) { Object.assign(draft, { image: null, caption: '' }); toast('Historia publicada ✨'); go('#/'); }
            return;
          }
          const post = S.createPost({ userId: me.id, image: draft.image, caption: (draft.caption || '').trim(), category: draft.category });
          if (post) {
            Object.assign(draft, { image: null, caption: '', category: null });
            toast('¡Publicación compartida! 🎉');
            go('#/p/' + post.id);
          }
        };
      },
    };
  }

  /* ======================================================
   * Perfil
   * ====================================================== */
  let profileTab = 'posts';
  let lastProfile = '';
  function ProfilePage(username) {
    const u = S.userByUsername(username);
    if (!u) return NotFound('Este perfil no existe.');
    if (lastProfile !== u.id) { profileTab = 'posts'; lastProfile = u.id; }
    const own = u.id === me.id;
    const posts = S.postsBy(u.id);
    const followers = S.followers(u.id);
    const following = me.following.includes(u.id);
    const followsMe = u.following.includes(me.id);
    const hasStory = S.activeStories().some((s) => s.userId === u.id);
    const seen = hasStory && S.activeStories().filter((s) => s.userId === u.id).every((s) => s.seenBy.includes(me.id));

    const tabs = [['posts', I.grid, 'Publicaciones']];
    if (u.role === 'client') tabs.push(['pets', I.paw, 'Mascotas']);
    if (u.role === 'vet') tabs.push(['info', I.stethoscope, 'Clínica']);
    if (own) tabs.push(['saved', I.bookmark, 'Guardado']);
    if (!tabs.some((t) => t[0] === profileTab)) profileTab = 'posts';

    let tabBody = '';
    if (profileTab === 'posts') {
      tabBody = posts.length ? `<div class="grid">${posts.map(gridItem).join('')}</div>`
        : `<div class="empty big">${I.image}<h3>${own ? 'Comparte tu primera foto' : 'Aún no hay publicaciones'}</h3>${own ? '<a href="#/create" class="btn primary">Crear publicación</a>' : ''}</div>`;
    } else if (profileTab === 'saved') {
      const saved = S.data.posts.filter((p) => p.savedBy.includes(me.id)).sort((a, b) => b.createdAt - a.createdAt);
      tabBody = saved.length ? `<p class="tiny muted">Solo tú puedes ver lo que has guardado.</p><div class="grid">${saved.map(gridItem).join('')}</div>`
        : `<div class="empty big">${I.bookmark}<h3>Guarda consejos útiles</h3><p class="muted">Pulsa el marcador en cualquier publicación para tenerla a mano.</p></div>`;
    } else if (profileTab === 'pets') {
      tabBody = (u.pets || []).length ? `<div class="pets-grid">${u.pets.map((p) => `
        <div class="pet-card card">
          <span class="pet-emoji">${SPECIES_EMOJI[p.species] || '🐾'}</span>
          <b>${esc(p.name)}</b>
          <small class="muted">${esc([p.species, p.breed, p.age].filter(Boolean).join(' · '))}</small>
        </div>`).join('')}</div>`
        : `<div class="empty big">${I.paw}<h3>Sin mascotas registradas</h3>${own ? '<a href="#/edit" class="btn primary">Añadir mascota</a>' : ''}</div>`;
    } else if (profileTab === 'info') {
      tabBody = `<div class="card clinic-card">
        <h3>${I.stethoscope} ${esc(u.clinic || 'Clínica veterinaria')}</h3>
        <ul class="info-list">
          ${u.specialty ? `<li>${I.paw}<span><b>Especialidad</b><br>${esc(u.specialty)}</span></li>` : ''}
          ${u.city ? `<li>${I.location}<span><b>Ubicación</b><br>${esc(u.city)}</span></li>` : ''}
          ${u.schedule ? `<li>${I.clock}<span><b>Horario</b><br>${esc(u.schedule)}</span></li>` : ''}
          ${u.phone ? `<li>${I.phone}<span><b>Teléfono</b><br><a href="tel:${esc(u.phone.replace(/\s/g, ''))}">${esc(u.phone)}</a></span></li>` : ''}
          ${u.license ? `<li>${I.check}<span><b>Nº de colegiado</b><br>${esc(u.license)}</span></li>` : ''}
        </ul>
        ${me.role === 'client' ? `<button class="btn primary" data-action="request-appt" data-vet="${u.id}">${I.calendar} Pedir cita</button>` : ''}
      </div>`;
    }

    return `
    <div class="page profile">
      <header class="profile-head">
        <button class="profile-avatar" ${hasStory ? `data-action="open-story" data-user="${u.id}"` : ''} ${own && !hasStory ? 'data-action="go" data-href="#/edit"' : ''}>${avatar(u, 150, { ring: hasStory, seen })}</button>
        <div class="profile-info">
          <div class="profile-row">
            <h2>${esc(u.username)} ${badge(u)}</h2>
            <div class="profile-btns">
              ${own ? `<a href="#/edit" class="btn ghost sm">Editar perfil</a><a href="#/create" class="btn ghost sm">Nueva publicación</a>`
                : `<button class="btn ${following ? 'ghost' : 'primary'} sm" data-action="follow" data-id="${u.id}">${following ? 'Siguiendo' : followsMe ? 'Seguir también' : 'Seguir'}</button>
                   <a href="#/messages/${esc(u.username)}" class="btn ghost sm">Mensaje</a>
                   ${u.role === 'vet' && me.role === 'client' ? `<button class="btn accent sm" data-action="request-appt" data-vet="${u.id}">${I.calendar} Pedir cita</button>` : ''}`}
            </div>
          </div>
          <ul class="profile-stats">
            <li><b>${posts.length}</b> publicaciones</li>
            <li><button data-action="show-followers" data-id="${u.id}"><b>${followers.length}</b> seguidores</button></li>
            <li><button data-action="show-following" data-id="${u.id}"><b>${u.following.length}</b> seguidos</button></li>
          </ul>
          <div class="profile-bio">
            <b>${esc(u.name)}</b>
            <span class="role-tag ${u.role}">${u.role === 'vet' ? I.stethoscope : I.paw} ${roleLabel(u)}</span>
            ${u.role === 'vet' && u.clinic ? `<div class="muted">${esc(u.clinic)}${u.city ? ' · ' + esc(u.city) : ''}</div>` : u.city ? `<div class="muted">${I.location} ${esc(u.city)}</div>` : ''}
            ${u.bio ? `<p>${richText(u.bio)}</p>` : ''}
            ${u.role === 'client' && (u.pets || []).length ? `<div class="pet-chips">${u.pets.map((p) => `<span class="chip static">${SPECIES_EMOJI[p.species] || '🐾'} ${esc(p.name)}</span>`).join('')}</div>` : ''}
            ${followsMe && !own ? '<small class="muted">Te sigue</small>' : ''}
          </div>
        </div>
      </header>
      <div class="tabs center">${tabs.map(([k, ico, label]) => `<button class="tab${profileTab === k ? ' active' : ''}" data-action="profile-tab" data-tab="${k}">${ico} ${label}</button>`).join('')}</div>
      ${tabBody}
    </div>`;
  }

  /* ======================================================
   * Editar perfil / configuración
   * ====================================================== */
  function EditProfilePage() {
    const vet = me.role === 'vet';
    return {
      html: `
      <div class="page narrow">
        <h2 class="page-title">Configuración</h2>
        <div class="card edit-card">
          <div class="edit-avatar">
            ${avatar(me, 64)}
            <div><b>${esc(me.username)}</b><br>
              <label class="link-btn">Cambiar foto de perfil<input type="file" accept="image/*" id="avatar-input" hidden></label>
              ${me.avatar ? ' · <button class="link-btn danger" data-action="remove-avatar">Quitar</button>' : ''}
            </div>
          </div>
          <form id="profile-form" class="stack">
            <label class="field"><span>Nombre</span><input name="name" value="${esc(me.name)}" required maxlength="60"></label>
            <label class="field"><span>Correo electrónico</span><input name="email" type="email" value="${esc(me.email)}" maxlength="80"></label>
            <label class="field"><span>Biografía</span><textarea name="bio" rows="3" maxlength="300">${esc(me.bio)}</textarea></label>
            <label class="field"><span>Ciudad</span><input name="city" value="${esc(me.city)}" maxlength="40"></label>
            ${vet ? `
              <div class="form-section">${I.stethoscope} Datos profesionales</div>
              <label class="field"><span>Clínica u hospital</span><input name="clinic" value="${esc(me.clinic)}" maxlength="80"></label>
              <label class="field"><span>Especialidad</span><select name="specialty">${SPECIALTIES.map((s) => `<option${s === me.specialty ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
              <label class="field"><span>Nº de colegiado</span><input name="license" value="${esc(me.license)}" maxlength="30"></label>
              <label class="field"><span>Teléfono de la clínica</span><input name="phone" value="${esc(me.phone)}" maxlength="30"></label>
              <label class="field"><span>Horario</span><input name="schedule" value="${esc(me.schedule)}" placeholder="L-V 9:00-20:00" maxlength="80"></label>
            ` : ''}
            <button class="btn primary">Guardar cambios</button>
          </form>
        </div>

        ${!vet ? `
        <div class="card edit-card">
          <h3>${I.paw} Mis mascotas</h3>
          <div class="pets-list">
            ${(me.pets || []).map((p, i) => `
              <div class="pet-row"><span class="pet-emoji sm">${SPECIES_EMOJI[p.species] || '🐾'}</span>
                <div class="grow"><b>${esc(p.name)}</b><br><small class="muted">${esc([p.species, p.breed, p.age].filter(Boolean).join(' · '))}</small></div>
                <button class="icon-btn" data-action="del-pet" data-i="${i}" aria-label="Eliminar">${I.trash}</button></div>`).join('') || '<p class="muted">Aún no has añadido mascotas.</p>'}
          </div>
          <form id="pet-form" class="pet-form">
            <input name="name" placeholder="Nombre" required maxlength="30">
            <select name="species">${SPECIES.map((s) => `<option>${s}</option>`).join('')}</select>
            <input name="breed" placeholder="Raza" maxlength="40">
            <input name="age" placeholder="Edad" maxlength="20">
            <button class="btn primary sm">Añadir</button>
          </form>
        </div>` : ''}

        <div class="card edit-card">
          <h3>Cambiar contraseña</h3>
          <form id="pw-form" class="stack">
            <input name="old" type="password" placeholder="Contraseña actual" required autocomplete="current-password">
            <input name="new" type="password" placeholder="Nueva contraseña" minlength="6" required autocomplete="new-password">
            <button class="btn ghost">Actualizar contraseña</button>
          </form>
        </div>

        <div class="card edit-card danger-zone">
          <h3>Zona de peligro</h3>
          <p class="muted tiny">Los datos de Visvet se guardan en este navegador.</p>
          <div class="row-wrap">
            <button class="btn ghost" data-action="reset-demo">Restablecer datos de demostración</button>
            <button class="btn danger" data-action="delete-account">Eliminar mi cuenta</button>
          </div>
        </div>
      </div>`,
      mount: () => {
        $('#avatar-input').onchange = async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          try { S.updateUser(me.id, { avatar: await readImage(f, 320, 0.85) }); toast('Foto de perfil actualizada'); render(); }
          catch (ex) { toast(ex.message, 'error'); }
        };
        $('#profile-form').onsubmit = (e) => {
          e.preventDefault();
          const f = e.target;
          const patch = { name: f.name.value.trim(), email: f.email.value.trim(), bio: f.bio.value.trim(), city: f.city.value.trim() };
          if (vet) ['clinic', 'specialty', 'license', 'phone', 'schedule'].forEach((k) => (patch[k] = f[k].value.trim()));
          S.updateUser(me.id, patch);
          toast('Perfil actualizado ✅');
          render();
        };
        const pf = $('#pet-form');
        if (pf) pf.onsubmit = (e) => {
          e.preventDefault();
          const f = e.target;
          const pets = [...(me.pets || []), { name: f.name.value.trim(), species: f.species.value, breed: f.breed.value.trim(), age: f.age.value.trim() }];
          S.updateUser(me.id, { pets });
          toast(`${f.name.value.trim()} añadido/a 🐾`);
          render();
        };
        $('#pw-form').onsubmit = async (e) => {
          e.preventDefault();
          try { await S.changePassword(me.id, e.target.old.value, e.target.new.value); toast('Contraseña actualizada 🔒'); e.target.reset(); }
          catch (ex) { toast(ex.message, 'error'); }
        };
      },
    };
  }

  /* ======================================================
   * Citas
   * ====================================================== */
  let apptFilter = 'upcoming';
  function AppointmentsPage() {
    const vet = me.role === 'vet';
    const all = S.appointmentsFor(me.id);
    const t = today();
    const filters = {
      upcoming: { label: 'Próximas', fn: (a) => a.date >= t && ['pendiente', 'confirmada'].includes(a.status) },
      pendiente: { label: 'Pendientes', fn: (a) => a.status === 'pendiente' },
      history: { label: 'Historial', fn: (a) => a.date < t || ['completada', 'rechazada', 'cancelada'].includes(a.status) },
      all: { label: 'Todas', fn: () => true },
    };
    const list = all.filter(filters[apptFilter].fn);
    if (apptFilter === 'history') list.reverse();

    const stats = vet ? `
      <div class="stats-row">
        <div class="stat card"><b>${all.filter((a) => a.status === 'pendiente').length}</b><span>Solicitudes pendientes</span></div>
        <div class="stat card"><b>${all.filter((a) => a.status === 'confirmada' && a.date === t).length}</b><span>Citas hoy</span></div>
        <div class="stat card"><b>${all.filter((a) => a.status === 'confirmada' && a.date >= t).length}</b><span>Confirmadas próximas</span></div>
        <div class="stat card"><b>${new Set(all.map((a) => a.clientId)).size}</b><span>Clientes</span></div>
      </div>` : '';

    return `
    <div class="page">
      <div class="page-head">
        <h2 class="page-title">${vet ? 'Agenda de la clínica' : 'Mis citas'}</h2>
        ${!vet ? `<button class="btn primary" data-action="request-appt">${I.calendar} Pedir cita</button>` : ''}
      </div>
      ${stats}
      <div class="tabs">${Object.entries(filters).map(([k, f]) => `<button class="tab${apptFilter === k ? ' active' : ''}" data-action="appt-filter" data-f="${k}">${f.label} <span class="count">${all.filter(f.fn).length}</span></button>`).join('')}</div>
      <div class="appt-list">
        ${list.map(apptCard).join('') || `<div class="empty big">${I.calendar}<h3>No hay citas aquí</h3>${!vet ? '<p class="muted">Pide cita con tu veterinario desde su perfil o con el botón «Pedir cita».</p>' : '<p class="muted">Cuando un cliente solicite una cita aparecerá aquí.</p>'}</div>`}
      </div>
    </div>`;
  }

  function apptCard(a) {
    const vet = me.id === a.vetId;
    const other = S.user(vet ? a.clientId : a.vetId);
    const st = STATUS[a.status] || STATUS.pendiente;
    const past = a.date < today();
    return `
    <div class="appt card">
      <div class="appt-date"><b>${a.date.slice(8)}</b><span>${new Date(a.date + 'T12:00').toLocaleDateString('es-ES', { month: 'short' })}</span><small>${esc(a.time)}</small></div>
      <div class="appt-main">
        <div class="appt-top">
          <span class="status ${st.cls}">${st.label}</span>
          <small class="muted">${fmtDate(a.date)} · ${esc(a.time)}</small>
        </div>
        <h4>${esc(a.petName)} <small class="muted">${a.species ? (SPECIES_EMOJI[a.species] || '') + ' ' + esc(a.species) : ''}</small></h4>
        <p>${esc(a.reason)}</p>
        ${other ? `<div class="appt-who">${avatar(other, 24)} ${userLink(other)} <small class="muted">${vet ? 'Cliente' : esc(other.clinic || 'Veterinario/a')}</small></div>` : ''}
        ${a.vetNote ? `<div class="vet-note">${I.stethoscope} <span><b>Nota del veterinario:</b> ${esc(a.vetNote)}</span></div>` : ''}
        <div class="appt-actions">
          ${vet && a.status === 'pendiente' ? `
            <button class="btn primary sm" data-action="appt-status" data-id="${a.id}" data-s="confirmada">${I.check} Confirmar</button>
            <button class="btn ghost sm" data-action="appt-status" data-id="${a.id}" data-s="rechazada">Rechazar</button>` : ''}
          ${vet && a.status === 'confirmada' ? `<button class="btn primary sm" data-action="appt-status" data-id="${a.id}" data-s="completada">Marcar completada</button>` : ''}
          ${vet && ['pendiente', 'confirmada', 'completada'].includes(a.status) ? `<button class="btn ghost sm" data-action="appt-note" data-id="${a.id}">Añadir nota</button>` : ''}
          ${!vet && ['pendiente', 'confirmada'].includes(a.status) && !past ? `<button class="btn ghost sm" data-action="appt-status" data-id="${a.id}" data-s="cancelada">Cancelar cita</button>` : ''}
          ${other ? `<a href="#/messages/${esc(other.username)}" class="btn ghost sm">${I.message} Mensaje</a>` : ''}
        </div>
      </div>
    </div>`;
  }

  function requestAppointmentModal(vetId) {
    const vets = S.data.users.filter((u) => u.role === 'vet');
    if (!vets.length) return toast('Todavía no hay veterinarios registrados.', 'error');
    const pets = me.pets || [];
    openModal(`
      <div class="modal-head"><h3>${I.calendar} Pedir cita</h3><button class="icon-btn" data-action="close-modal">${I.close}</button></div>
      <form class="modal-body stack" id="appt-form">
        <label class="field"><span>Veterinario/a</span>
          <select name="vetId" required>
            ${vets.map((v) => `<option value="${v.id}"${v.id === vetId ? ' selected' : ''}>${esc(v.name)} — ${esc(v.clinic || v.specialty || '')}${v.city ? ' (' + esc(v.city) + ')' : ''}</option>`).join('')}
          </select></label>
        <label class="field"><span>Mascota</span>
          ${pets.length ? `<select name="pet">${pets.map((p, i) => `<option value="${i}">${SPECIES_EMOJI[p.species] || '🐾'} ${esc(p.name)} (${esc(p.species)})</option>`).join('')}<option value="other">Otra mascota…</option></select>` : ''}
          <input name="petName" placeholder="Nombre de la mascota" ${pets.length ? 'hidden' : 'required'} maxlength="30">
        </label>
        <div class="grid-2">
          <label class="field"><span>Fecha</span><input type="date" name="date" min="${today()}" required></label>
          <label class="field"><span>Hora</span><input type="time" name="time" min="08:00" max="21:00" step="900" required></label>
        </div>
        <label class="field"><span>Motivo de la consulta</span><textarea name="reason" rows="3" required maxlength="400" placeholder="Ej.: vacunación anual, cojea de la pata trasera, revisión…"></textarea></label>
        <p class="tiny muted">El veterinario recibirá tu solicitud y te avisaremos cuando la confirme.</p>
        <button class="btn primary block">Enviar solicitud</button>
      </form>`);
    const f = $('#appt-form');
    if (f.pet) f.pet.onchange = () => { const o = f.pet.value === 'other'; f.petName.hidden = !o; f.petName.required = o; };
    f.onsubmit = (e) => {
      e.preventDefault();
      let petName = f.petName.value.trim(), species = '';
      if (f.pet && f.pet.value !== 'other') { const p = pets[+f.pet.value]; petName = p.name; species = p.species; }
      S.requestAppointment({ clientId: me.id, vetId: f.vetId.value, petName, species, date: f.date.value, time: f.time.value, reason: f.reason.value.trim() });
      closeModal();
      toast('Solicitud de cita enviada 📅');
      apptFilter = 'upcoming';
      go('#/appointments');
    };
  }

  /* ======================================================
   * Mensajes
   * ====================================================== */
  function MessagesPage(username) {
    const other = username ? S.userByUsername(username) : null;
    if (other) S.markThreadRead(me.id, other.id);
    const convs = S.conversations(me.id);
    if (other && !convs.some((c) => c.otherId === other.id)) convs.unshift({ otherId: other.id, last: null, unread: 0 });

    const thread = other ? S.thread(me.id, other.id) : [];
    return {
      html: `
      <div class="dm${other ? ' has-thread' : ''}">
        <aside class="dm-list">
          <div class="dm-list-head"><b>${esc(me.username)}</b><button class="icon-btn" data-action="new-dm" aria-label="Nuevo mensaje">${I.plus}</button></div>
          ${convs.map(({ otherId, last, unread }) => {
            const u = S.user(otherId);
            if (!u) return '';
            const preview = last ? (last.postId ? '📷 Compartió una publicación' : (last.from === me.id ? 'Tú: ' : '') + last.text) : 'Nueva conversación';
            return `<a href="#/messages/${esc(u.username)}" class="dm-item${other && other.id === u.id ? ' active' : ''}${unread ? ' unread' : ''}">
              ${avatar(u, 48)}
              <span class="grow"><span>${esc(u.name)} ${badge(u)}</span><small class="muted ellipsis">${esc(preview)}${last ? ' · ' + timeAgo(last.createdAt) : ''}</small></span>
              ${unread ? '<span class="unread-dot"></span>' : ''}
            </a>`;
          }).join('') || '<p class="empty">Aún no tienes conversaciones.</p>'}
        </aside>
        <section class="dm-thread">
          ${other ? `
            <header class="dm-head">
              <a href="#/messages" class="icon-btn only-mobile" aria-label="Volver">${I.back}</a>
              <a href="#/u/${esc(other.username)}">${avatar(other, 36)}</a>
              <div class="grow"><a href="#/u/${esc(other.username)}"><b>${esc(other.name)}</b> ${badge(other)}</a><br><small class="muted">${roleLabel(other)}</small></div>
              ${other.role === 'vet' && me.role === 'client' ? `<button class="btn accent sm" data-action="request-appt" data-vet="${other.id}">${I.calendar} Cita</button>` : ''}
            </header>
            <div class="dm-msgs" id="dm-msgs">
              <div class="dm-intro">${avatar(other, 80)}<b>${esc(other.name)}</b><small class="muted">${esc(other.username)} · Visvet</small><a href="#/u/${esc(other.username)}" class="btn ghost sm">Ver perfil</a></div>
              ${thread.map((m, i) => {
                const mine = m.from === me.id;
                const showTime = i === 0 || m.createdAt - thread[i - 1].createdAt > 3600 * 1000;
                const sp = m.postId ? S.post(m.postId) : null;
                return `${showTime ? `<div class="dm-time">${new Date(m.createdAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</div>` : ''}
                  <div class="bubble-row${mine ? ' mine' : ''}">
                    ${sp ? `<a href="#/p/${sp.id}" class="shared-post"><img src="${esc(sp.image)}" alt=""><span>${esc(S.user(sp.userId)?.username || '')}</span></a>` : ''}
                    ${m.text ? `<div class="bubble">${richText(m.text)}</div>` : ''}
                  </div>`;
              }).join('')}
            </div>
            <form class="dm-form" id="dm-form">
              <input name="text" placeholder="Escribe un mensaje…" autocomplete="off" maxlength="1000">
              <button class="link-btn">Enviar</button>
            </form>
          ` : `
            <div class="dm-empty">
              <span class="big-ico">${I.message}</span>
              <h3>Tus mensajes</h3>
              <p class="muted">${me.role === 'vet' ? 'Responde a las dudas de tus clientes de forma privada.' : 'Habla en privado con tu veterinario o con otros amantes de los animales.'}</p>
              <button class="btn primary" data-action="new-dm">Enviar mensaje</button>
            </div>`}
        </section>
      </div>`,
      mount: () => {
        const box = $('#dm-msgs');
        if (box) box.scrollTop = box.scrollHeight;
        const f = $('#dm-form');
        if (f) {
          if (window.matchMedia('(min-width: 768px)').matches) f.text.focus();
          f.onsubmit = (e) => {
            e.preventDefault();
            const text = f.text.value;
            if (!text.trim()) return;
            S.sendMessage(me.id, other.id, text);
            render();
            const nf = $('#dm-form');
            if (nf) nf.text.focus();
          };
        }
      },
    };
  }

  function pickUserModal(title, onPick) {
    const listHtml = (q) => {
      const ql = q.toLowerCase();
      const users = S.data.users.filter((u) => u.id !== me.id && (!ql || (u.username + ' ' + u.name).toLowerCase().includes(ql)))
        .sort((a, b) => me.following.includes(b.id) - me.following.includes(a.id));
      return users.map((u) => `<button class="user-row as-btn" data-pick="${u.id}">${avatar(u, 40)}<span class="grow left"><span>${esc(u.username)} ${badge(u)}</span><small class="muted block">${esc(u.name)}</small></span></button>`).join('') || '<p class="empty">Sin resultados</p>';
    };
    openModal(`
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-action="close-modal">${I.close}</button></div>
      <div class="modal-search">${I.search}<input id="pick-q" placeholder="Buscar…" autocomplete="off"></div>
      <div class="modal-scroll" id="pick-list">${listHtml('')}</div>`);
    const wire = () => $$('#pick-list [data-pick]').forEach((b) => (b.onclick = () => onPick(S.user(b.dataset.pick))));
    wire();
    $('#pick-q').oninput = (e) => { $('#pick-list').innerHTML = listHtml(e.target.value); wire(); };
  }

  /* ======================================================
   * Notificaciones
   * ====================================================== */
  function notifText(n) {
    switch (n.type) {
      case 'like': return 'le ha gustado tu publicación.';
      case 'comment': return `ha comentado: «${esc(n.text || '')}»`;
      case 'follow': return 'ha empezado a seguirte.';
      case 'appointment_request': return `ha solicitado una cita: <b>${esc(n.text || '')}</b>`;
      case 'appointment_confirmada': return `ha <b>confirmado</b> tu cita: ${esc(n.text || '')}`;
      case 'appointment_rechazada': return `ha rechazado tu solicitud de cita: ${esc(n.text || '')}`;
      case 'appointment_completada': return `ha marcado como completada la cita de ${esc(n.text || '')}`;
      case 'appointment_cancelada': return `ha cancelado la cita: ${esc(n.text || '')}`;
      default: return '';
    }
  }

  function NotificationsPage() {
    const list = S.notificationsFor(me.id);
    const groups = [
      ['Nuevas', list.filter((n) => !n.read)],
      ['Hoy', list.filter((n) => n.read && Date.now() - n.createdAt < 86400000)],
      ['Anteriores', list.filter((n) => n.read && Date.now() - n.createdAt >= 86400000)],
    ];
    return {
      html: `
      <div class="page narrow">
        <h2 class="page-title">Notificaciones</h2>
        ${list.length ? groups.filter(([, l]) => l.length).map(([title, l]) => `
          <h4 class="section-title">${title}</h4>
          <div class="card notif-list">
            ${l.map((n) => {
              const from = S.user(n.fromId);
              if (!from) return '';
              const p = n.postId ? S.post(n.postId) : null;
              const isAppt = n.type.startsWith('appointment');
              const right = p ? `<a href="#/p/${p.id}" class="notif-thumb"><img src="${esc(p.image)}" alt=""></a>`
                : n.type === 'follow' && !me.following.includes(from.id) ? `<button class="btn primary sm" data-action="follow" data-id="${from.id}">Seguir</button>`
                : isAppt ? `<a href="#/appointments" class="btn ghost sm">Ver</a>` : '';
              return `<div class="notif${n.read ? '' : ' unread'}">
                <a href="#/u/${esc(from.username)}">${avatar(from, 44)}</a>
                <p class="grow">${userLink(from)} ${notifText(n)} <span class="muted">${timeAgo(n.createdAt)}</span></p>
                ${right}
              </div>`;
            }).join('')}
          </div>`).join('') : `<div class="empty big">${I.heart}<h3>Sin actividad todavía</h3><p class="muted">Cuando alguien te siga, comente o pida cita, lo verás aquí.</p></div>`}
      </div>`,
      mount: () => {
        // marcar como leídas al salir de la página para que se vea "Nuevas" mientras tanto
        setTimeout(() => S.markNotificationsRead(me.id), 400);
      },
    };
  }

  function NotFound(msg = 'La página que buscas no existe.') {
    return `<div class="page narrow"><div class="empty big">${I.paw}<h3>¡Ups! Por aquí no hay nada</h3><p class="muted">${esc(msg)}</p><a href="#/" class="btn primary">Volver al inicio</a></div></div>`;
  }

  /* ======================================================
   * Listas en modal (likes / seguidores)
   * ====================================================== */
  function usersModal(title, users) {
    openModal(`
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-action="close-modal">${I.close}</button></div>
      <div class="modal-scroll">${users.map((u) => userRow(u, true)).join('') || '<p class="empty">Nadie por aquí todavía.</p>'}</div>`);
  }

  /* ======================================================
   * Acciones (delegación de eventos)
   * ====================================================== */
  const actions = {
    'close-modal': () => closeModal(),
    'close-modal-bg': (el, e) => { if (e.target === el) closeModal(); },
    go: (el) => go(el.dataset.href),
    back: () => (history.length > 1 ? history.back() : go('#/')),
    logout: async () => {
      if (await confirmModal('¿Cerrar sesión?', '', 'Cerrar sesión')) {
        S.setSession(null); location.hash = '#/login'; render();
      }
    },
    like: (el) => { S.toggleLike(el.dataset.id, me.id); refreshPost(el.dataset.id); },
    save: (el) => {
      S.toggleSave(el.dataset.id, me.id);
      const saved = S.post(el.dataset.id).savedBy.includes(me.id);
      toast(saved ? 'Guardado en tu colección 📌' : 'Eliminado de guardados');
      refreshPost(el.dataset.id);
    },
    'dbl-like': () => {}, // gestionado con dblclick
    follow: (el) => {
      const was = me.following.includes(el.dataset.id);
      S.toggleFollow(me.id, el.dataset.id);
      if (!was) toast(`Ahora sigues a ${S.user(el.dataset.id).username}`);
      const modalOpen = $('#modal-root').innerHTML;
      if (modalOpen) {
        el.textContent = was ? 'Seguir' : 'Siguiendo';
        el.classList.toggle('primary', was); el.classList.toggle('ghost', !was);
        el.classList.toggle('link-btn', false);
        el.classList.add('btn', 'sm');
      } else render();
    },
    'show-likes': (el) => usersModal('Me gusta', S.post(el.dataset.id).likes.map((id) => S.user(id)).filter(Boolean)),
    'show-followers': (el) => usersModal('Seguidores', S.followers(el.dataset.id)),
    'show-following': (el) => usersModal('Seguidos', S.user(el.dataset.id).following.map((id) => S.user(id)).filter(Boolean)),
    'del-comment': async (el) => {
      if (await confirmModal('¿Eliminar comentario?', '', 'Eliminar', true)) { S.deleteComment(el.dataset.post, el.dataset.id); refreshPost(el.dataset.post); }
    },
    'post-options': (el) => {
      const p = S.post(el.dataset.id);
      const own = p.userId === me.id;
      const author = S.user(p.userId);
      openModal(`<div class="modal-list">
        ${own ? '<button class="danger" data-opt="delete">Eliminar publicación</button>' : `<button class="${me.following.includes(author.id) ? 'danger' : 'primary-text'}" data-opt="follow">${me.following.includes(author.id) ? 'Dejar de seguir' : 'Seguir'}</button>`}
        <button data-opt="open">Ir a la publicación</button>
        <button data-opt="profile">Ver perfil de ${esc(author.username)}</button>
        <button data-opt="copy">Copiar enlace</button>
        <button data-opt="cancel">Cancelar</button>
      </div>`, { cls: 'small' });
      $$('#modal-root [data-opt]').forEach((b) => (b.onclick = async () => {
        const o = b.dataset.opt;
        closeModal();
        if (o === 'delete') {
          if (await confirmModal('¿Eliminar publicación?', 'Esta acción no se puede deshacer.', 'Eliminar', true)) {
            S.deletePost(p.id); toast('Publicación eliminada');
            if (parseHash().name === 'p') go('#/u/' + me.username); else render();
          }
        } else if (o === 'follow') { S.toggleFollow(me.id, author.id); render(); }
        else if (o === 'open') go('#/p/' + p.id);
        else if (o === 'profile') go('#/u/' + author.username);
        else if (o === 'copy') copyLink('#/p/' + p.id);
      }));
    },
    share: (el) => {
      const postId = el.dataset.id;
      pickUserModal('Compartir con…', (u) => {
        S.sendMessage(me.id, u.id, '', { postId });
        closeModal();
        toast(`Enviado a ${u.username} ✉️`);
      });
      const list = $('#modal-root .modal');
      list.insertAdjacentHTML('beforeend', `<div class="modal-foot"><button class="btn ghost block" id="copy-link">Copiar enlace</button></div>`);
      $('#copy-link').onclick = () => { copyLink('#/p/' + postId); closeModal(); };
    },
    'open-story': (el, e) => {
      if (e.target.closest('.story-plus')) return actions['add-story']();
      e.preventDefault();
      openStories(el.dataset.user);
    },
    'add-story': () => { const i = $('#story-input'); if (i) i.click(); else go('#/create'); if (!i) draft.mode = 'story'; },
    'story-next': () => nextStory(),
    'story-prev': () => prevStory(),
    'del-story': async (el) => {
      clearTimeout(story.timer);
      const id = el.dataset.id;
      S.data.stories = S.data.stories.filter((s) => s.id !== id);
      S.save();
      closeModal();
      toast('Historia eliminada');
    },
    'create-mode': (el) => { draft.mode = el.dataset.mode; render(); },
    'pick-cat': (el) => { draft.category = el.dataset.cat; $$('[data-action="pick-cat"]').forEach((b) => b.classList.toggle('active', b === el)); },
    'clear-image': () => { draft.image = null; render(); },
    'profile-tab': (el) => { profileTab = el.dataset.tab; render(); },
    'appt-filter': (el) => { apptFilter = el.dataset.f; render(); },
    'request-appt': (el) => requestAppointmentModal(el.dataset.vet),
    'appt-status': async (el) => {
      const s = el.dataset.s;
      const labels = { rechazada: '¿Rechazar esta solicitud?', cancelada: '¿Cancelar la cita?' };
      if (labels[s] && !(await confirmModal(labels[s], 'Avisaremos a la otra persona.', 'Sí', true))) return;
      let note;
      if (s === 'confirmada') note = undefined;
      S.setAppointmentStatus(el.dataset.id, s, me.id, note);
      toast({ confirmada: 'Cita confirmada ✅', rechazada: 'Solicitud rechazada', completada: 'Cita completada', cancelada: 'Cita cancelada' }[s]);
      render();
    },
    'appt-note': async (el) => {
      const a = S.data.appointments.find((x) => x.id === el.dataset.id);
      const note = await promptModal('Nota para el cliente', 'Indicaciones, preparación o resultado de la consulta', a.vetNote || 'Ej.: venid en ayunas');
      if (note !== null) { a.vetNote = note; S.save(); render(); toast('Nota guardada'); }
    },
    'new-dm': () => pickUserModal('Nuevo mensaje', (u) => { closeModal(); go('#/messages/' + u.username); }),
    'del-pet': async (el) => {
      const pets = [...(me.pets || [])];
      const p = pets[+el.dataset.i];
      if (await confirmModal(`¿Eliminar a ${p.name}?`, '', 'Eliminar', true)) {
        pets.splice(+el.dataset.i, 1); S.updateUser(me.id, { pets }); render();
      }
    },
    'remove-avatar': () => { S.updateUser(me.id, { avatar: '' }); render(); },
    'reset-demo': async () => {
      if (await confirmModal('¿Restablecer Visvet?', 'Se borrarán todas las cuentas y publicaciones de este navegador y se cargarán los datos de demostración.', 'Restablecer', true)) {
        await S.reset(); location.hash = '#/login'; render(); toast('Datos de demostración restaurados');
      }
    },
    'delete-account': async () => {
      if (await confirmModal('¿Eliminar tu cuenta?', 'Se borrarán tu perfil, publicaciones, mensajes y citas. No se puede deshacer.', 'Eliminar cuenta', true)) {
        S.deleteUser(me.id); location.hash = '#/login'; render(); toast('Cuenta eliminada');
      }
    },
  };

  function copyLink(hash) {
    const url = location.href.split('#')[0] + hash;
    const done = () => toast('Enlace copiado 🔗');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, () => toast(url));
    else toast(url);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    if (el.tagName === 'A' && el.dataset.action !== 'close-modal') e.preventDefault();
    if (el.dataset.action === 'close-modal' && el.tagName === 'A') { closeModal(); return; }
    fn(el, e);
  });

  // Doble clic / doble toque para dar "me gusta"
  let lastTap = 0;
  function dblLike(target) {
    const media = target.closest('[data-action="dbl-like"]');
    if (!media) return;
    const id = media.dataset.id;
    const p = S.post(id);
    if (!p.likes.includes(me.id)) S.toggleLike(id, me.id);
    const heart = media.querySelector('.big-heart');
    heart.classList.remove('pop'); void heart.offsetWidth; heart.classList.add('pop');
    setTimeout(() => refreshPost(id), 700);
  }
  document.addEventListener('dblclick', (e) => dblLike(e.target));
  document.addEventListener('touchend', (e) => {
    if (!e.target.closest('[data-action="dbl-like"]')) return;
    const now = Date.now();
    if (now - lastTap < 300) { e.preventDefault(); dblLike(e.target); }
    lastTap = now;
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.dataset.form === 'comment') {
      e.preventDefault();
      const text = f.text.value.trim();
      if (!text) return;
      S.addComment(f.dataset.id, me.id, text);
      f.text.value = '';
      refreshPost(f.dataset.id);
    } else if (f.dataset.form === 'story-reply') {
      e.preventDefault();
      const text = f.text.value.trim();
      if (!text) return;
      S.sendMessage(me.id, f.dataset.to, '↪️ Respondió a tu historia: ' + text);
      f.text.value = '';
      toast('Respuesta enviada');
      nextStory();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if ($('#story-viewer') && !e.target.matches('input')) {
      if (e.key === 'ArrowRight') nextStory();
      if (e.key === 'ArrowLeft') prevStory();
    }
  });

  window.addEventListener('hashchange', () => { closeModal(); render(); });

  // Si otra pestaña cambia los datos, refrescamos (sin perder lo que se escribe)
  S.onChange(() => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.value) return;
    if (!$('#modal-root').innerHTML) render();
  });

  /* ======================================================
   * Arranque
   * ====================================================== */
  S.init().then(render).catch((e) => {
    console.error(e);
    $('#app').innerHTML = `<div class="page narrow"><div class="empty big"><h3>No se pudo iniciar Visvet</h3><p class="muted">${esc(e.message)}</p></div></div>`;
  });
})();

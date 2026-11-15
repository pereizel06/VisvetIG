/* Visvet — aplicación (cliente y clínica) */
import { CONFIG } from './config.js?v=5';
import {
  $, $$, esc, I, SPECIES, speciesGrad, RECORD_TYPES, todayISO, parseISO, fmtDate, fmtDay, fmtTime, fmtMoney, fmtSize,
  timeAgo, chatStamp, daysUntil, ageOf, initials, greeting, haptic, toast, openSheet, closeSheet, anySheetOpen,
  actionSheet, confirmSheet, promptSheet, compressImage, fileKind, icsFor, downloadBlob, confetti, countUp,
} from './ui.js?v=5';

/* =========================================================
 * Estado
 * ========================================================= */
let B = null;
const S = { user: null, profile: null, pets: [], appts: [], users: [], clinic: {}, recs: {}, msgs: {}, loaded: false };
const ui = { petTab: 'cartilla', recFilter: 'all', apptTab: 'up', agendaDay: todayISO(), authTab: 'login', q: '', chatFiles: [], sending: false };
let subs = [];
const recSubs = new Map();
let msgSub = null, msgPetId = null;
let lastRoute = '';
const seen = { unread: {}, recs: {}, appts: {} };

const isAdmin = () => !!(S.user && S.user.isAdmin);
const petById = (id) => S.pets.find((p) => p.id === id);
const userById = (id) => (S.profile && S.profile.id === id ? S.profile : S.users.find((u) => u.id === id));
const ownerName = (pet) => (userById(pet.ownerId) || {}).name || 'Cliente';
const clinicName = () => S.clinic.name || CONFIG.clinicName || 'Visvet';

/* =========================================================
 * Arranque
 * ========================================================= */
async function boot() {
  if (!(CONFIG.firebase && CONFIG.firebase.apiKey && CONFIG.firebase.projectId)) {
    $('#view').innerHTML = SetupView();
    return;
  }
  try {
    const { createFirebaseBackend } = await import('./backend/firebase.js?v=5');
    B = await createFirebaseBackend(CONFIG.firebase);
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="center-screen"><div class="glass card pad verify"><div class="empty-ico">${I.info}</div><h2>No se pudo conectar</h2><p class="muted">Revisa tu conexión a internet y vuelve a intentarlo.</p><button class="btn primary block" onclick="location.reload()">Reintentar</button></div></div>`;
    return;
  }
  window.VISVET = B;
  window.addEventListener('backend-error', (e) => toast(e.detail, 'error'));
  await B.init(onAuth);
  window.addEventListener('hashchange', () => navigate());
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Se muestra solo mientras la app no está conectada a su base de datos
function SetupView() {
  return `<div class="center-screen"><div class="glass card pad verify rise">
    <div class="hero-orb" style="--s:84px;width:84px;height:84px"><span></span></div>
    <h2>Visvet está casi lista</h2>
    <p class="muted">Falta conectar la base de datos de la clínica. Cuando esté conectada, aquí aparecerá la pantalla para crear la cuenta de la clínica y las de los clientes.</p>
  </div></div>`;
}

function onAuth(user) {
  subs.forEach((u) => u()); subs = [];
  recSubs.forEach((u) => u()); recSubs.clear();
  if (msgSub) { msgSub(); msgSub = null; msgPetId = null; }
  Object.assign(S, { user, profile: null, pets: [], appts: [], users: [], clinic: {}, recs: {}, msgs: {}, loaded: false });
  seen.unread = {}; seen.recs = {}; seen.appts = {};
  if (user) {
    let pending = 3;
    const ready = () => { if (--pending === 0) { S.loaded = true; schedule(); } };
    const once = (fn) => { let done = false; return (v) => { fn(v); if (!done) { done = true; ready(); } }; };
    subs.push(B.watchProfile(user.uid, (p) => { S.profile = p; schedule(); }));
    subs.push(B.watchClinic((c) => { S.clinic = c || {}; schedule(); }));
    subs.push(B.watchPets(once((pets) => { onPets(pets); })));
    subs.push(B.watchAppointments(once((a) => { onAppts(a); })));
    if (user.isAdmin) subs.push(B.watchUsers(once((u) => { S.users = u; schedule(); })));
    else ready();
  }
  navigate(true);
}

function onPets(pets) {
  // avisos de mensajes nuevos
  pets.forEach((p) => {
    const k = isAdmin() ? 'unreadAdmin' : 'unreadOwner';
    const prev = seen.unread[p.id];
    const viewing = route().name === 'chat' && route().id === p.id && document.visibilityState === 'visible';
    if (prev !== undefined && (p[k] || 0) > prev && !viewing) {
      toast(isAdmin() ? `${ownerName(p)} · ${p.name}: ${p.lastMessage || 'nuevo mensaje'}` : `${clinicName()} sobre ${p.name}: ${p.lastMessage || 'nuevo mensaje'}`, 'chat');
    }
    seen.unread[p.id] = p[k] || 0;
  });
  S.pets = pets.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  // el cliente sigue la cartilla de todos sus animales (para avisos y vacunas)
  if (!isAdmin()) S.pets.forEach((p) => ensureRecords(p.id));
  schedule();
}

function onAppts(list) {
  if (!isAdmin()) {
    list.forEach((a) => {
      const prev = seen.appts[a.id];
      if (prev && prev !== a.status && a.status === 'confirmada') { toast(`Cita confirmada: ${fmtDate(a.date, { day: 'numeric', month: 'short' })} a las ${a.time}`); confetti(); }
      if (prev && prev !== a.status && a.status === 'rechazada') toast('La clínica no puede atenderte en esa hora. Escríbenos por chat.', 'error');
      seen.appts[a.id] = a.status;
    });
  } else {
    list.forEach((a) => {
      if (S.loaded && !seen.appts[a.id] && a.status === 'pendiente') toast(`Nueva solicitud de cita · ${(petById(a.petId) || {}).name || ''}`, 'chat');
      seen.appts[a.id] = a.status;
    });
  }
  S.appts = list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  schedule();
}

function ensureRecords(petId) {
  if (recSubs.has(petId)) return;
  recSubs.set(petId, B.watchRecords(petId, (list) => {
    const prev = seen.recs[petId];
    if (prev !== undefined && list.length > prev && !isAdmin()) {
      const r = list.find((x) => Date.now() - (x.createdAt || 0) < 60000) || list[0];
      const p = petById(petId);
      if (r && p) toast(`Nuevo en la cartilla de ${p.name}: ${RECORD_TYPES[r.type]?.label || 'documento'}`);
    }
    seen.recs[petId] = list.length;
    S.recs[petId] = list;
    schedule();
  }));
}

function watchChat(petId) {
  if (msgPetId === petId) return;
  if (msgSub) msgSub();
  msgPetId = petId;
  msgSub = B.watchMessages(petId, (list) => {
    const before = (S.msgs[petId] || []).length;
    S.msgs[petId] = list;
    schedule({ chatNew: list.length > before });
  });
}

/* =========================================================
 * Navegación y render
 * ========================================================= */
function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  return { name: parts[0] || '', id: parts[1] || '', sub: parts[2] || '', key: parts.join('/') };
}
const go = (h) => { if (location.hash === h) navigate(); else location.hash = h; };

let renderQueued = false, renderOpts = {};
function schedule(opts = {}) {
  Object.assign(renderOpts, opts);
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; const o = renderOpts; renderOpts = {}; draw(false, o); });
}
function navigate(force) {
  const r = route();
  const changed = r.key !== lastRoute || force;
  if (!changed) return schedule();
  const run = () => draw(true);
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const t = document.startViewTransition(run);
    [t.ready, t.finished, t.updateCallbackDone].forEach((pr) => pr && pr.catch(() => {}));
  } else run();
}

function keepState() {
  const st = {};
  $$('[data-keep]').forEach((el) => { st[el.dataset.keep] = { v: el.value, f: el === document.activeElement, s: el.selectionStart, e: el.selectionEnd }; });
  return st;
}
function restoreState(st) {
  Object.entries(st).forEach(([k, o]) => {
    const el = $(`[data-keep="${k}"]`);
    if (!el) return;
    el.value = o.v;
    if (o.f) { el.focus(); try { el.setSelectionRange(o.s, o.e); } catch (e) { /* nada */ } }
    if (el.tagName === 'TEXTAREA') autosize(el);
  });
}

function draw(isNav, opts = {}) {
  const r = route();
  const view = $('#view');
  const st = isNav ? {} : keepState();
  const nearBottom = innerHeight + scrollY >= document.body.scrollHeight - 140;
  const prevScroll = scrollY;

  let v;
  if (!B) return;
  if (!S.user) v = AuthView();
  else if (!S.loaded) v = { html: skeleton(), tabbar: true };
  else v = (isAdmin() ? adminView : ownerView)(r);

  // chat: suscripción solo mientras se ve
  if (r.name !== 'chat' && msgSub) { msgSub(); msgSub = null; msgPetId = null; }

  view.innerHTML = v.html;
  document.body.dataset.view = v.cls || r.name || 'home';
  document.body.classList.toggle('no-tabbar', !v.tabbar);
  renderTabbar(v.tabbar);
  if (!isNav) { restoreState(st); scrollTo(0, prevScroll); }
  else if (r.key !== lastRoute) scrollTo(0, 0);
  if (isNav) lastRoute = r.key;
  v.mount && v.mount({ isNav, nearBottom, opts });
  enhance(view, isNav);
  onScroll();
}

/* ---------- Barra de pestañas flotante ---------- */
const TABS = {
  owner: [['', 'Inicio', 'home'], ['pets', 'Animales', 'paw'], ['chats', 'Chat', 'chat'], ['appts', 'Citas', 'calendar'], ['profile', 'Perfil', 'person']],
  admin: [['', 'Panel', 'grid'], ['inbox', 'Mensajes', 'chat'], ['clients', 'Clientes', 'people'], ['agenda', 'Agenda', 'calendar'], ['settings', 'Ajustes', 'gear']],
};
const TAB_OF = { pet: 'pets', chat: 'chats', client: 'clients' };
function renderTabbar(show) {
  const bar = $('#tabbar');
  if (!show || !S.user) { bar.classList.remove('show'); return; }
  const role = isAdmin() ? 'admin' : 'owner';
  const r = route();
  let active = TAB_OF[r.name] || r.name;
  if (role === 'admin' && r.name === 'chat') active = 'inbox';
  if (role === 'admin' && r.name === 'pet') active = 'clients';
  const badge = (key) => {
    if (key === 'chats') return S.pets.reduce((s, p) => s + (p.unreadOwner || 0), 0);
    if (key === 'inbox') return S.pets.reduce((s, p) => s + (p.unreadAdmin || 0), 0);
    if (key === 'agenda') return S.appts.filter((a) => a.status === 'pendiente').length;
    return 0;
  };
  const sig = role + '|' + active + '|' + TABS[role].map(([k]) => badge(k)).join(',');
  if (bar.dataset.sig !== sig) {
    bar.dataset.sig = sig;
    bar.innerHTML = `<span class="tab-indicator"></span>${TABS[role].map(([k, label, icon]) => {
      const n = badge(k);
      return `<a href="#/${k}" class="tab${active === k ? ' active' : ''}" data-tab="${k}">${I[icon]}<span>${label}</span>${n ? `<b class="badge">${n > 99 ? '99+' : n}</b>` : ''}</a>`;
    }).join('')}`;
  }
  bar.classList.add('show');
  requestAnimationFrame(() => moveIndicator(bar));
}
function moveIndicator(bar) {
  const a = $('.tab.active', bar), ind = $('.tab-indicator', bar);
  if (!a || !ind) { if (ind) ind.style.opacity = '0'; return; }
  ind.style.opacity = '1';
  ind.style.width = a.offsetWidth + 'px';
  ind.style.transform = `translateX(${a.offsetLeft}px)`;
}
addEventListener('resize', () => moveIndicator($('#tabbar')));

/* ---------- Efectos ---------- */
function enhance(root, isNav) {
  if (isNav) countUp(root);
  $$('[data-tilt]', root).forEach(tilt);
  $$('.seg', root).forEach(layoutSeg);
  hydrateFiles(root);
  $$('textarea[data-auto]', root).forEach(autosize);
  $$('.chart path.line', root).forEach((p) => {
    if (!isNav) return;
    const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L;
    requestAnimationFrame(() => { p.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)'; p.style.strokeDashoffset = '0'; });
  });
  if (!isNav) $$('.rise', root).forEach((el) => el.classList.add('static'));
}
function tilt(el) {
  if (el._tilt || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el._tilt = true;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    el.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) scale(1.01)`;
    el.style.setProperty('--gx', `${(x + .5) * 100}%`); el.style.setProperty('--gy', `${(y + .5) * 100}%`);
  });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
}
function layoutSeg(seg) {
  const a = $('.seg-btn.active', seg), th = $('.seg-thumb', seg);
  if (!a || !th) return;
  th.style.width = a.offsetWidth + 'px';
  th.style.transform = `translateX(${a.offsetLeft - 3}px)`;
}
function autosize(t) { t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; }
// brillo que sigue al puntero sobre el cristal
document.addEventListener('pointermove', (e) => {
  const el = e.target.closest && e.target.closest('.glass');
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });
// título grande que se encoge al hacer scroll
function onScroll() {
  const nav = $('.nav');
  if (nav) nav.classList.toggle('scrolled', scrollY > 38);
}
addEventListener('scroll', onScroll, { passive: true });

/* Archivos dentro de la vista: miniaturas que se cargan al vuelo */
function hydrateFiles(root) {
  $$('img[data-file]', root).forEach((img) => {
    if (img._h) return; img._h = true;
    const meta = JSON.parse(img.dataset.file);
    B.openFile(meta).then((u) => { img.src = u; img.classList.add('ready'); }).catch(() => img.classList.add('broken'));
  });
}

/* =========================================================
 * Piezas comunes
 * ========================================================= */
function nav(title, { back = false, right = '', sub = '' } = {}) {
  return `<header class="nav"><div class="nav-bar">
      <div class="nav-l">${back ? `<button class="nav-back" data-act="back">${I.back}<span>Atrás</span></button>` : ''}</div>
      <div class="nav-title">${esc(title)}</div>
      <div class="nav-r">${right}</div>
    </div></header>
    <div class="large-head"><h1 class="large-title">${esc(title)}</h1>${sub ? `<p class="large-sub">${sub}</p>` : ''}</div>`;
}
function petAvatar(p, size = 44, ring = false) {
  const inner = p.photo ? `<img src="${esc(p.photo)}" alt="">` : `<span>${esc((p.name || '?')[0].toUpperCase())}</span>`;
  return `<span class="pet-av${ring ? ' ring' : ''}" style="--s:${size}px;--g:${speciesGrad(p.species)}">${inner}</span>`;
}
function userAvatar(u, size = 40) {
  if (!u) return `<span class="user-av" style="--s:${size}px"><span>?</span></span>`;
  return `<span class="user-av" style="--s:${size}px">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : `<span>${esc(initials(u.name))}</span>`}</span>`;
}
const clinicAvatar = (size = 40) => `<span class="clinic-av" style="--s:${size}px"><span class="orb"></span></span>`;
const empty = (icon, title, text, btn = '') => `<div class="empty rise"><div class="empty-ico">${I[icon]}</div><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>${btn}</div>`;
const skeleton = () => `<div class="page"><div class="sk sk-title"></div><div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-row"></div></div>`;
function seg(name, value, opts) {
  return `<div class="seg" role="tablist"><span class="seg-thumb"></span>${opts.map(([v, l]) => `<button class="seg-btn${v === value ? ' active' : ''}" data-act="seg" data-seg="${name}" data-val="${v}" role="tab">${l}</button>`).join('')}</div>`;
}
const statusLabel = { pendiente: 'Pendiente', confirmada: 'Confirmada', rechazada: 'Rechazada', cancelada: 'Cancelada', completada: 'Completada' };
const statusPill = (s) => `<span class="pill st-${s}">${statusLabel[s] || s}</span>`;
function fileTile(f) {
  const k = fileKind(f.type);
  const data = esc(JSON.stringify({ id: f.id, name: f.name, type: f.type, size: f.size }));
  return `<button class="file-tile" data-act="open-file" data-file="${data}">
    ${k === 'image' ? `<img data-file="${data}" alt="">` : `<span class="file-ico ${k}">${k === 'pdf' ? 'PDF' : I.doc}</span>`}
    <span class="file-meta"><b>${esc(f.name)}</b><small>${fmtSize(f.size || 0)}</small></span></button>`;
}
function vaccineStatus(r) {
  if (!r.nextDate) return null;
  const d = daysUntil(r.nextDate);
  if (d < 0) return { cls: 'due', text: `Vencida hace ${-d} d` };
  if (d <= 30) return { cls: 'soon', text: d === 0 ? 'Hoy' : `En ${d} d` };
  return { cls: 'ok', text: fmtDate(r.nextDate, { day: 'numeric', month: 'short', year: 'numeric' }) };
}
function upcomingVaccines(pets) {
  const out = [];
  pets.forEach((p) => {
    const recs = (S.recs[p.id] || []).filter((r) => r.type === 'vacuna' && r.nextDate);
    const latest = {};
    recs.forEach((r) => { const k = r.title.toLowerCase(); if (!latest[k] || latest[k].date < r.date) latest[k] = r; });
    Object.values(latest).forEach((r) => { if (daysUntil(r.nextDate) <= 45) out.push({ pet: p, r }); });
  });
  return out.sort((a, b) => a.r.nextDate.localeCompare(b.r.nextDate));
}
function apptCard(a, i = 0) {
  const p = petById(a.petId) || { name: 'Animal', species: 'Otro' };
  const d = parseISO(a.date);
  return `<button class="glass appt rise" style="--i:${i}" data-act="appt-menu" data-id="${a.id}">
    <span class="appt-date"><small>${d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</small><b>${d.getDate()}</b><small>${esc(a.time)}</small></span>
    <span class="appt-body"><span class="appt-top">${statusPill(a.status)}<small class="muted">${fmtDay(a.date)}</small></span>
      <b>${esc(a.reason || 'Consulta')}</b>
      <span class="appt-who">${petAvatar(p, 22)} ${esc(p.name)}${isAdmin() ? ` · <span class="muted">${esc(ownerName(p))}</span>` : ''}</span>
      ${a.note ? `<span class="appt-note">${I.info}${esc(a.note)}</span>` : ''}
    </span>${I.chevron}</button>`;
}
function petCard(p, i = 0) {
  const unread = isAdmin() ? p.unreadAdmin : p.unreadOwner;
  return `<a href="#/pet/${p.id}" class="pet-card rise" style="--i:${i};--g:${speciesGrad(p.species)}" data-tilt>
    <span class="pet-card-glow"></span>
    ${p.photo ? `<img class="pet-card-photo" src="${esc(p.photo)}" alt="">` : `<span class="pet-card-letter">${esc(p.name[0].toUpperCase())}</span>`}
    <span class="pet-card-info"><b>${esc(p.name)}</b><small>${esc(p.species)}${p.breed ? ' · ' + esc(p.breed) : ''}</small>
      <small class="pet-card-age">${ageOf(p.birthDate) || ' '}</small></span>
    ${unread ? `<span class="badge float">${unread}</span>` : ''}
  </a>`;
}

/* =========================================================
 * Acceso
 * ========================================================= */
let adminKnown = null;   // ¿existe ya la cuenta de la clínica?
let adminChecked = 0;
setInterval(() => { if (B && !S.user && adminKnown === false) schedule(); }, 5000);
function AuthView() {
  if (adminKnown === null || (adminKnown === false && Date.now() - adminChecked > 4000)) {
    adminChecked = Date.now();
    B.adminExists().then((x) => { const was = adminKnown; adminKnown = x; if (!x && was === null) ui.authTab = 'clinic'; if (was !== x) schedule(); }).catch(() => { adminKnown = true; schedule(); });
  }
  if (adminKnown && ui.authTab === 'clinic') ui.authTab = 'login';
  const tab = ui.authTab;
  const login = tab === 'login', clinic = tab === 'clinic';
  const tabs = adminKnown === false ? [['clinic', 'Clínica'], ['login', 'Entrar'], ['signup', 'Cliente']] : [['login', 'Entrar'], ['signup', 'Crear cuenta']];
  return {
    cls: 'auth', tabbar: false,
    html: `<div class="auth">
      <div class="auth-hero rise">
        <div class="hero-orb"><span></span></div>
        <h1 class="brand-title">${esc(S.clinic.name || CONFIG.clinicName || 'Visvet')}</h1>
        <p class="brand-sub">${clinic ? 'Configura tu clínica<br>en un minuto.' : 'Tu clínica veterinaria,<br>en el bolsillo.'}</p>
      </div>
      <div class="glass auth-card rise" style="--i:1">
        ${adminKnown === null ? '<div class="sk sk-row"></div>' : seg('authTab', tab, tabs)}
        ${clinic ? `<div class="setup-note">${I.shield}<span><b>Cuenta de administración</b>Es la cuenta de la clínica: verá a todos los clientes, sus animales y sus chats. Solo se puede crear una.</span></div>` : ''}
        <form class="form" id="auth-form" novalidate>
          ${login ? '' : `<label class="field"><span>${clinic ? 'Nombre de la clínica' : 'Tu nombre'}</span><input name="name" data-keep="a-name" autocomplete="${clinic ? 'organization' : 'name'}" placeholder="${clinic ? 'Visvet' : 'Ana Martínez'}" required></label>
          <label class="field"><span>Teléfono <i>(opcional)</i></span><input name="phone" data-keep="a-phone" type="tel" autocomplete="tel" placeholder="+34 600 000 000"></label>`}
          <label class="field"><span>Correo electrónico</span><input name="email" data-keep="a-email" type="email" autocomplete="email" placeholder="${clinic ? 'clinica@correo.com' : 'tu@correo.com'}" required></label>
          <label class="field"><span>Contraseña</span><input name="password" data-keep="a-pw" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" placeholder="${login ? '••••••••' : 'Mínimo 6 caracteres'}" required></label>
          <p class="form-error" id="auth-error"></p>
          <button class="btn primary block lg">${login ? 'Entrar' : clinic ? 'Crear la cuenta de la clínica' : 'Crear mi cuenta'}</button>
          ${login ? '<button type="button" class="btn plain block" data-act="forgot">¿Has olvidado la contraseña?</button>' : ''}
        </form>
      </div>
      <p class="auth-foot tiny muted rise" style="--i:2">${clinic ? 'Después, tus clientes crearán su propia cuenta desde este mismo enlace.' : 'Al crear tu cuenta podrás registrar a tus animales, ver su cartilla y hablar con la clínica.'}</p>
    </div>`,
    mount() {
      const f = $('#auth-form');
      f.onsubmit = async (e) => {
        e.preventDefault();
        const err = $('#auth-error');
        err.textContent = '';
        const btn = f.querySelector('.btn.primary');
        btn.classList.add('loading');
        try {
          if (!f.email.value.trim() || !f.password.value) throw new Error('Escribe tu correo y tu contraseña.');
          if (login) await B.signIn(f.email.value, f.password.value);
          else {
            if (!f.name.value.trim()) throw new Error(clinic ? 'Escribe el nombre de la clínica.' : 'Escribe tu nombre.');
            await B.signUp({ name: f.name.value, email: f.email.value, password: f.password.value, phone: f.phone.value, asClinic: clinic });
            adminKnown = true;
            if (clinic) { toast('Clínica creada. Ya puedes recibir a tus clientes'); confetti(); }
            else toast('¡Cuenta creada! Bienvenido/a');
          }
        } catch (ex) {
          if (/ya tiene una cuenta|acaba de crear/.test(ex.message)) { adminKnown = true; ui.authTab = 'login'; }
          err.textContent = ex.message; btn.classList.remove('loading');
          f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); haptic([10, 30, 10]);
        }
      };
    },
  };
}

/* =========================================================
 * CLIENTE
 * ========================================================= */
function ownerView(r) {
  switch (r.name) {
    case 'pets': return OwnerPets();
    case 'pet': return PetView(r.id);
    case 'chats': return OwnerChats();
    case 'chat': return ChatView(r.id);
    case 'appts': return OwnerAppts();
    case 'profile': return ProfileView();
    default: return OwnerHome();
  }
}

function OwnerHome() {
  const first = ((S.profile && S.profile.name) || '').split(' ')[0];
  const next = S.appts.filter((a) => a.date >= todayISO() && ['pendiente', 'confirmada'].includes(a.status));
  const vacc = upcomingVaccines(S.pets);
  const pending = S.pets.reduce((s, p) => s + (p.pendingAmount || 0), 0);
  const news = S.pets.flatMap((p) => (S.recs[p.id] || []).slice(0, 3).map((r) => ({ p, r })))
    .sort((a, b) => (b.r.createdAt || 0) - (a.r.createdAt || 0)).slice(0, 4);
  const unread = S.pets.reduce((s, p) => s + (p.unreadOwner || 0), 0);
  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  let i = 0;
  return {
    tabbar: true, cls: 'home',
    html: `<div class="page">
      ${nav(`${greeting()}${first ? ', ' + first : ''}`, { sub: `<span class="cap">${today}</span>`, right: `<a href="#/profile" class="nav-av">${userAvatar(S.profile, 34)}</a>` })}

      <div class="quick rise" style="--i:${i++}">
        <a class="quick-btn glass" href="#/chats">${I.chat}<span>Escribir a ${esc(clinicName())}</span>${unread ? `<b class="badge">${unread}</b>` : ''}</a>
        <button class="quick-btn glass" data-act="req-appt">${I.calendar}<span>Pedir cita</span></button>
        <button class="quick-btn glass" data-act="add-pet">${I.plus}<span>Añadir animal</span></button>
      </div>

      <section class="sec">
        <div class="sec-head"><h2>Tus animales</h2><a href="#/pets">Ver todos</a></div>
        ${S.pets.length ? `<div class="pet-rail">${S.pets.map((p) => petCard(p, i++)).join('')}</div>`
          : empty('paw', 'Añade a tu primer animal', 'Registra a tu perro, gato o cualquier compañero para tener su cartilla y hablar con la clínica.', '<button class="btn primary" data-act="add-pet">Añadir animal</button>')}
      </section>

      ${next.length || vacc.length || pending ? `<section class="sec"><div class="sec-head"><h2>Próximamente</h2></div>
        <div class="stack">
          ${next.slice(0, 2).map((a) => apptCard(a, i++)).join('')}
          ${vacc.slice(0, 3).map(({ pet, r }) => { const s = vaccineStatus(r); return `<a href="#/pet/${pet.id}" class="glass row-card rise" style="--i:${i++}">
              <span class="row-ico" style="--c:${RECORD_TYPES.vacuna.color}">${I.syringe}</span>
              <span class="grow"><b>${esc(r.title)}</b><small class="muted">${esc(pet.name)} · próxima dosis</small></span>
              <span class="pill vac-${s.cls}">${s.text}</span></a>`; }).join('')}
          ${pending ? `<div class="glass row-card rise warn-card" style="--i:${i++}"><span class="row-ico" style="--c:${RECORD_TYPES.factura.color}">${I.invoice}</span>
              <span class="grow"><b>Pagos pendientes</b><small class="muted">Facturas sin pagar en la cartilla</small></span><b class="money">${fmtMoney(pending)}</b></div>` : ''}
        </div></section>` : ''}

      ${news.length ? `<section class="sec"><div class="sec-head"><h2>Novedades de la clínica</h2></div>
        <div class="glass list rise" style="--i:${i++}">${news.map(({ p, r }) => recordRow(p, r)).join('')}</div></section>` : ''}

      ${clinicCard(i++)}
    </div>`,
  };
}

function clinicCard(i = 0) {
  const c = S.clinic;
  return `<section class="sec"><div class="glass clinic-card rise" style="--i:${i}">
    <div class="clinic-top">${clinicAvatar(48)}<div><b>${esc(clinicName())}</b><small class="muted">Tu clínica veterinaria</small></div><a class="btn primary sm" href="#/chats">${I.chat} Chat</a></div>
    <div class="clinic-info">
      ${c.hours ? `<span>${I.clock}${esc(c.hours)}</span>` : ''}
      ${c.address ? `<span>${I.pin}${esc(c.address)}</span>` : ''}
      ${c.phone ? `<span class="copyable" data-act="copy" data-text="${esc(c.phone)}">${I.phone}${esc(c.phone)}</span>` : ''}
      ${c.emergency ? `<span class="copyable emergency" data-act="copy" data-text="${esc(c.emergency)}">${I.bolt}Urgencias: ${esc(c.emergency)}</span>` : ''}
    </div></div></section>`;
}

function OwnerPets() {
  return {
    tabbar: true, cls: 'pets',
    html: `<div class="page">
      ${nav('Tus animales', { right: `<button class="nav-btn" data-act="add-pet" aria-label="Añadir">${I.plus}</button>` })}
      ${S.pets.length ? `<div class="pet-grid">${S.pets.map((p, i) => petCard(p, i)).join('')}
          <button class="pet-card add rise" style="--i:${S.pets.length}" data-act="add-pet">${I.plus}<span>Añadir animal</span></button></div>`
        : empty('paw', 'Todavía no hay animales', 'Añade a tus compañeros para ver su cartilla, sus vacunas y hablar con la clínica.', '<button class="btn primary" data-act="add-pet">Añadir animal</button>')}
    </div>`,
  };
}

function OwnerChats() {
  const list = S.pets.slice().sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  return {
    tabbar: true, cls: 'chats',
    html: `<div class="page">
      ${nav('Chat', { sub: `Habla en privado con ${esc(clinicName())} sobre cada uno de tus animales.` })}
      ${list.length ? `<div class="glass list rise">${list.map((p) => threadRow(p)).join('')}</div>`
        : empty('chat', 'Sin conversaciones', 'Añade un animal para empezar a hablar con la clínica.', '<button class="btn primary" data-act="add-pet">Añadir animal</button>')}
    </div>`,
  };
}
function threadRow(p) {
  const unread = isAdmin() ? p.unreadAdmin : p.unreadOwner;
  const title = isAdmin() ? `${esc(p.name)} <span class="muted">· ${esc(ownerName(p))}</span>` : esc(p.name);
  const prefix = p.lastMessage ? ((isAdmin() ? p.lastFromAdmin : !p.lastFromAdmin) ? 'Tú: ' : '') : '';
  return `<a href="#/chat/${p.id}" class="row${unread ? ' unread' : ''}">
    ${petAvatar(p, 50)}
    <span class="grow"><span class="row-title"><b>${title}</b><small class="muted">${p.lastMessageAt ? chatStamp(p.lastMessageAt) : ''}</small></span>
      <small class="row-sub">${p.lastMessage ? esc(prefix + p.lastMessage) : '<i>Escribe el primer mensaje</i>'}</small></span>
    ${unread ? `<b class="badge">${unread}</b>` : I.chevron}</a>`;
}

function OwnerAppts() {
  const t = todayISO();
  const up = S.appts.filter((a) => a.date >= t && ['pendiente', 'confirmada'].includes(a.status));
  const past = S.appts.filter((a) => !up.includes(a)).reverse();
  const list = ui.apptTab === 'up' ? up : past;
  return {
    tabbar: true, cls: 'appts',
    html: `<div class="page">
      ${nav('Citas', { right: `<button class="nav-btn" data-act="req-appt" aria-label="Pedir cita">${I.plus}</button>` })}
      ${seg('apptTab', ui.apptTab, [['up', `Próximas${up.length ? ' · ' + up.length : ''}`], ['past', 'Historial']])}
      <div class="stack gap-top">${list.map((a, i) => apptCard(a, i)).join('') || empty('calendar', ui.apptTab === 'up' ? 'No tienes citas próximas' : 'Sin historial', ui.apptTab === 'up' ? 'Pide cita y la clínica te la confirmará en la app.' : 'Aquí verás tus citas anteriores.', ui.apptTab === 'up' ? '<button class="btn primary" data-act="req-appt">Pedir cita</button>' : '')}</div>
    </div>`,
  };
}

function ProfileView() {
  const p = S.profile || {};
  return {
    tabbar: true, cls: 'profile',
    html: `<div class="page">
      ${nav('Perfil')}
      <div class="glass profile-card rise">
        <button class="profile-photo" data-act="profile-photo">${userAvatar(p, 84)}<span class="cam">${I.camera}</span></button>
        <div><h2>${esc(p.name || '')}</h2><p class="muted">${esc(S.user.email)}</p></div>
        <input type="file" accept="image/*" id="avatar-input" hidden>
      </div>
      <form class="glass list form-list rise" style="--i:1" id="profile-form">
        <label class="row field-row"><span>Nombre</span><input name="name" data-keep="p-name" value="${esc(p.name || '')}" required></label>
        <label class="row field-row"><span>Teléfono</span><input name="phone" data-keep="p-phone" type="tel" value="${esc(p.phone || '')}" placeholder="Añadir"></label>
        <div class="row"><button class="btn primary sm ml-auto">Guardar</button></div>
      </form>
      ${clinicCard(2)}
      <div class="glass list rise" style="--i:3">
        <div class="row"><span class="row-ico" style="--c:#0a84ff">${I.bolt}</span><span class="grow"><b>Instalar la app</b><small class="muted">Safari: Compartir → Añadir a pantalla de inicio · Chrome: ⋮ → Instalar</small></span></div>
        <div class="row"><span class="row-ico" style="--c:#30d158">${I.shield}</span><span class="grow"><b>Datos seguros en la nube</b><small class="muted">Se sincronizan al momento en todos tus dispositivos.</small></span></div>
        <button class="row" data-act="logout"><span class="row-ico" style="--c:#8e8e93">${I.logout}</span><span class="grow"><b>Cerrar sesión</b></span></button>
        
        <button class="row danger" data-act="delete-account"><span class="row-ico" style="--c:#ff375f">${I.trash}</span><span class="grow"><b>Eliminar mi cuenta</b></span></button>
      </div>
    </div>`,
    mount() {
      $('#profile-form').onsubmit = async (e) => {
        e.preventDefault();
        try { await B.saveProfile({ name: e.target.name.value.trim(), phone: e.target.phone.value.trim() }); toast('Perfil guardado'); }
        catch (ex) { toast(ex.message, 'error'); }
      };
      $('#avatar-input').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { await B.saveProfile({ avatar: await compressImage(f, 360, 0.82) }); toast('Foto actualizada'); }
        catch (ex) { toast(ex.message, 'error'); }
      };
    },
  };
}

/* =========================================================
 * Ficha del animal (cliente y clínica)
 * ========================================================= */
function PetView(id) {
  const p = petById(id);
  if (!p) return { tabbar: true, html: `<div class="page">${nav('Animal', { back: true })}${empty('paw', 'No encontrado', 'Este animal ya no existe o no tienes acceso.')}</div>` };
  ensureRecords(id);
  const recs = S.recs[id];
  const admin = isAdmin();
  const lastW = (p.weights || []).slice(-1)[0];
  const owner = userById(p.ownerId);
  const tab = ui.petTab;
  let body = '';
  if (tab === 'cartilla') {
    const types = ['all', ...Object.keys(RECORD_TYPES).filter((t) => (recs || []).some((r) => r.type === t))];
    const list = (recs || []).filter((r) => ui.recFilter === 'all' || r.type === ui.recFilter);
    body = `${admin ? `<button class="glass add-doc rise" data-act="add-record" data-pet="${id}">${I.plus}<span><b>Añadir a la cartilla</b><small>Diagnóstico, vacuna, factura, análisis, receta…</small></span></button>` : ''}
      ${types.length > 2 ? `<div class="chips">${types.map((t) => `<button class="chip${ui.recFilter === t ? ' active' : ''}" data-act="rec-filter" data-val="${t}">${t === 'all' ? 'Todo' : RECORD_TYPES[t].label}</button>`).join('')}</div>` : ''}
      ${recs === undefined ? '<div class="sk sk-row"></div><div class="sk sk-row"></div>'
        : list.length ? `<div class="timeline">${list.map((r, i) => timelineItem(p, r, i)).join('')}</div>`
        : empty('folder', 'Cartilla vacía', admin ? 'Añade el primer documento de este paciente.' : 'Cuando la clínica añada diagnósticos, vacunas o facturas, aparecerán aquí.')}`;
  } else if (tab === 'salud') {
    const vacc = (recs || []).filter((r) => r.type === 'vacuna');
    body = `<div class="glass panel rise">
        <div class="panel-head"><h3>${I.scale} Peso</h3><button class="btn glass-btn sm" data-act="add-weight" data-pet="${id}">${I.plus} Registrar</button></div>
        ${weightChart(p.weights || [])}
      </div>
      <div class="glass panel rise" style="--i:1">
        <div class="panel-head"><h3>${I.syringe} Vacunas</h3></div>
        ${vacc.length ? `<div class="vac-list">${vacc.map((r) => { const s = vaccineStatus(r); return `<button class="vac" data-act="open-record" data-pet="${id}" data-rec="${r.id}"><span class="grow"><b>${esc(r.title)}</b><small class="muted">Puesta el ${fmtDate(r.date)}</small></span>${s ? `<span class="pill vac-${s.cls}">${s.text}</span>` : ''}</button>`; }).join('')}</div>` : '<p class="muted pad-s">Sin vacunas registradas.</p>'}
      </div>
      <div class="glass panel rise" style="--i:2">
        <div class="panel-head"><h3>${I.heart} Alergias y notas</h3></div>
        <div class="chips static">${(p.allergies || []).length ? p.allergies.map((a) => `<span class="chip warn">${esc(a)}</span>`).join('') : '<span class="muted">Sin alergias conocidas</span>'}</div>
        ${p.notes ? `<p class="note">${esc(p.notes)}</p>` : ''}
      </div>`;
  } else {
    const rows = [['Especie', p.species], ['Raza', p.breed], ['Sexo', p.sex], ['Nacimiento', p.birthDate ? `${fmtDate(p.birthDate)} · ${ageOf(p.birthDate)}` : ''], ['Color', p.color], ['Microchip', p.chip], ['Esterilizado', p.sterilized ? 'Sí' : 'No']];
    body = `<div class="glass list rise">${rows.map(([k, v]) => `<div class="row kv"><span class="muted">${k}</span><b class="${k === 'Microchip' ? 'mono' : ''}">${esc(v || '—')}</b></div>`).join('')}</div>
      ${admin && owner ? `<div class="sec-head"><h2>Propietario</h2></div><a class="glass row-card rise" style="--i:1" href="#/client/${owner.id}">${userAvatar(owner, 44)}<span class="grow"><b>${esc(owner.name)}</b><small class="muted">${esc(owner.phone || owner.email || '')}</small></span>${I.chevron}</a>` : ''}
      <button class="btn glass-btn block gap-top" data-act="edit-pet" data-id="${id}">${I.edit} Editar ficha</button>`;
  }
  return {
    tabbar: true, cls: 'pet',
    html: `<div class="page">
      ${nav(p.name, { back: true, right: `<button class="nav-btn" data-act="edit-pet" data-id="${id}" aria-label="Editar">${I.edit}</button>` })}
      <div class="pet-hero rise" style="--g:${speciesGrad(p.species)}" data-tilt>
        <span class="pet-hero-glare"></span>
        <div class="pet-hero-top">${petAvatar(p, 96, true)}
          <div class="pet-hero-id"><small>${esc(p.species)}${p.breed ? ' · ' + esc(p.breed) : ''}</small><h2>${esc(p.name)}</h2>${admin ? `<small>de ${esc(ownerName(p))}</small>` : ''}</div></div>
        <div class="pet-stats">
          <span><small>Edad</small><b>${ageOf(p.birthDate) || '—'}</b></span>
          <span><small>Peso</small><b>${lastW ? String(lastW.kg).replace('.', ',') + ' kg' : '—'}</b></span>
          <span><small>Sexo</small><b>${esc(p.sex || '—')}</b></span>
        </div>
        ${p.chip ? `<div class="pet-chip mono">CHIP ${esc(p.chip.replace(/(\d{3})(?=\d)/g, '$1 '))}</div>` : ''}
      </div>
      <div class="pet-actions rise" style="--i:1">
        <a class="glass action" href="#/chat/${id}">${I.chat}<span>Chat</span>${(admin ? p.unreadAdmin : p.unreadOwner) ? `<b class="badge">${admin ? p.unreadAdmin : p.unreadOwner}</b>` : ''}</a>
        <button class="glass action" data-act="req-appt" data-pet="${id}">${I.calendar}<span>Cita</span></button>
        ${admin ? `<button class="glass action" data-act="add-record" data-pet="${id}">${I.doc}<span>Documento</span></button>` : `<button class="glass action" data-act="add-weight" data-pet="${id}">${I.scale}<span>Peso</span></button>`}
        ${p.pendingAmount ? `<span class="glass action warn">${I.invoice}<span>${fmtMoney(p.pendingAmount)}</span></span>` : ''}
      </div>
      ${seg('petTab', tab, [['cartilla', 'Cartilla'], ['salud', 'Salud'], ['ficha', 'Ficha']])}
      <div class="tab-body">${body}</div>
    </div>`,
  };
}
function timelineItem(p, r, i) {
  const t = RECORD_TYPES[r.type] || RECORD_TYPES.otro;
  const s = r.type === 'vacuna' ? vaccineStatus(r) : null;
  return `<button class="tl-item rise" style="--i:${Math.min(i, 8)};--c:${t.color}" data-act="open-record" data-pet="${p.id}" data-rec="${r.id}">
    <span class="tl-dot">${I[t.icon]}</span>
    <span class="glass tl-card">
      <span class="tl-top"><small class="tl-type">${t.label}</small><small class="muted">${fmtDate(r.date)}</small></span>
      <b>${esc(r.title)}</b>
      ${r.notes ? `<small class="tl-notes">${esc(r.notes)}</small>` : ''}
      <span class="tl-foot">
        ${r.type === 'factura' ? `<b class="money">${fmtMoney(r.amount)}</b><span class="pill ${r.paid ? 'st-confirmada' : 'st-pendiente'}">${r.paid ? 'Pagada' : 'Pendiente'}</span>` : ''}
        ${s ? `<span class="pill vac-${s.cls}">Próxima: ${s.text}</span>` : ''}
        ${(r.files || []).length ? `<span class="pill neutral">${I.clip}${r.files.length}</span>` : ''}
      </span>
    </span></button>`;
}
function recordRow(p, r) {
  const t = RECORD_TYPES[r.type] || RECORD_TYPES.otro;
  return `<button class="row" data-act="open-record" data-pet="${p.id}" data-rec="${r.id}">
    <span class="row-ico" style="--c:${t.color}">${I[t.icon]}</span>
    <span class="grow"><b>${esc(r.title)}</b><small class="muted">${esc(p.name)} · ${t.label} · ${fmtDate(r.date, { day: 'numeric', month: 'short' })}</small></span>${I.chevron}</button>`;
}
function weightChart(ws) {
  if (!ws.length) return '<p class="muted pad-s">Registra el peso para ver su evolución.</p>';
  const pts = ws.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
  const W = 320, H = 130, P = 16;
  const ys = pts.map((p) => +p.kg);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (max - min < 0.5) { min -= 0.5; max += 0.5; }
  const x = (i) => P + (pts.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (pts.length - 1));
  const y = (v) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(+p.kg).toFixed(1)}`).join(' ');
  const area = `${d} L${x(pts.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const delta = prev ? (+last.kg - +prev.kg) : 0;
  return `<div class="weight-sum"><b>${String(last.kg).replace('.', ',')} kg</b>${prev ? `<span class="pill ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral'}">${delta > 0 ? '+' : ''}${delta.toFixed(1).replace('.', ',')} kg</span>` : ''}<small class="muted">${fmtDate(last.date)}</small></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Evolución del peso">
      <defs><linearGradient id="wg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#wg)"/>
      <path class="line" d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(+p.kg).toFixed(1)}" r="${i === pts.length - 1 ? 4.5 : 2.5}" fill="${i === pts.length - 1 ? 'var(--accent)' : 'var(--surface-solid)'}" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('')}
    </svg>
    <div class="chart-x">${pts.map((p) => `<small>${parseISO(p.date).toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</small>`).join('')}</div>`;
}

/* =========================================================
 * Chat
 * ========================================================= */
const QUICK = ['¡Hola! ¿En qué podemos ayudarte?', 'Te hemos subido el documento a la cartilla.', 'Pásate por la clínica cuando puedas.', '¿Puedes enviarnos una foto?', 'Tu cita está confirmada.'];
function ChatView(petId) {
  const p = petById(petId);
  if (!p) return { tabbar: false, cls: 'chat', html: `<div class="page">${nav('Chat', { back: true })}${empty('chat', 'Conversación no disponible', 'Este animal ya no existe.')}</div>` };
  watchChat(petId);
  const msgs = S.msgs[petId];
  const admin = isAdmin();
  const otherRead = admin ? p.readByOwnerAt || 0 : p.readByAdminAt || 0;
  const mine = (m) => m.from === S.user.uid || (admin && m.fromAdmin);
  const lastMine = msgs ? [...msgs].reverse().find(mine) : null;
  let html = '', lastDay = '';
  (msgs || []).forEach((m, i) => {
    const day = new Date(m.createdAt).toDateString();
    if (day !== lastDay) {
      const cs = chatStamp(m.createdAt);
      const label = cs === fmtTime(m.createdAt) ? 'Hoy' : cs === 'Ayer' ? 'Ayer' : new Date(m.createdAt).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      html += `<div class="day-sep"><span>${label}</span></div>`;
      lastDay = day;
    }
    const me = mine(m);
    const next = msgs[i + 1];
    const tail = !next || mine(next) !== me || next.createdAt - m.createdAt > 300000;
    const files = (m.files || []).map((f) => {
      const k = fileKind(f.type);
      const data = esc(JSON.stringify(f));
      return k === 'image' ? `<button class="msg-img" data-act="open-file" data-file="${data}"><img data-file="${data}" alt=""></button>`
        : `<button class="msg-file" data-act="open-file" data-file="${data}"><span class="file-ico ${k}">${k === 'pdf' ? 'PDF' : I.doc}</span><span><b>${esc(f.name)}</b><small>${fmtSize(f.size || 0)}</small></span></button>`;
    }).join('');
    html += `<div class="msg ${me ? 'me' : 'them'}${tail ? ' tail' : ''}" data-id="${m.id}">
      ${files}${m.text ? `<div class="bubble">${linkify(esc(m.text))}<time>${fmtTime(m.createdAt)}</time></div>` : ''}
      ${m === lastMine && otherRead >= m.createdAt ? `<small class="seen">${I.checks} Visto</small>` : ''}
    </div>`;
  });
  const title = admin ? `${p.name} · ${ownerName(p)}` : p.name;
  return {
    tabbar: false, cls: 'chat',
    html: `<div class="chat-page">
      <header class="chat-head glass">
        <button class="nav-back" data-act="back">${I.back}</button>
        <a href="#/pet/${p.id}" class="chat-who">${admin ? petAvatar(p, 38) : clinicAvatar(38)}<span><b>${esc(admin ? title : clinicName())}</b><small>${admin ? esc(p.species + (p.breed ? ' · ' + p.breed : '')) : `sobre ${esc(p.name)}`}</small></span></a>
        <a href="#/pet/${p.id}" class="chat-pet">${admin ? userAvatar(userById(p.ownerId), 34) : petAvatar(p, 34)}</a>
      </header>
      <div class="msgs" id="msgs">
        <div class="chat-intro">${admin ? petAvatar(p, 64, true) : clinicAvatar(64)}<b>${esc(admin ? title : clinicName())}</b><small class="muted">${admin ? 'Conversación privada con el propietario' : `Conversación privada sobre ${esc(p.name)}. Te respondemos lo antes posible.`}</small></div>
        ${msgs === undefined ? '<div class="sk sk-row"></div>' : html}
      </div>
      <div class="composer-wrap">
        ${admin ? `<div class="quick-replies no-scrollbar">${QUICK.map((q) => `<button class="chip" data-act="quick" data-text="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
        ${ui.chatFiles.length ? `<div class="pending-files">${ui.chatFiles.map((f, i) => `<span class="pfile">${fileKind(f.type) === 'image' ? I.image : I.doc}<span>${esc(f.name)}</span><button data-act="chat-unattach" data-i="${i}">${I.close}</button></span>`).join('')}</div>` : ''}
        <form class="composer glass" id="composer">
          <button type="button" class="comp-btn" data-act="chat-attach" aria-label="Adjuntar">${I.plus}</button>
          <textarea name="text" rows="1" data-keep="chat-${p.id}" data-auto placeholder="Mensaje"></textarea>
          <button class="comp-send${ui.sending ? ' loading' : ''}" aria-label="Enviar">${I.send}</button>
          <input type="file" id="chat-file" multiple accept="image/*,application/pdf,.doc,.docx" hidden>
        </form>
      </div>
    </div>`,
    mount({ isNav, nearBottom, opts }) {
      B.markThreadRead(p);
      if (isNav || nearBottom || opts.chatNew) {
        requestAnimationFrame(() => scrollTo({ top: document.body.scrollHeight, behavior: isNav ? 'instant' : 'smooth' }));
        if (opts.chatNew && !isNav) { const last = $('.msg:last-of-type'); last && last.classList.add('pop'); }
      }
      const f = $('#composer');
      const ta = f.text;
      ta.oninput = () => autosize(ta);
      ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); f.requestSubmit(); } };
      $('#chat-file').onchange = (e) => { ui.chatFiles.push(...Array.from(e.target.files)); e.target.value = ''; schedule(); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const text = ta.value;
        if ((!text.trim() && !ui.chatFiles.length) || ui.sending) return;
        const files = ui.chatFiles.slice();
        ui.sending = true; ta.value = ''; ui.chatFiles = []; autosize(ta); haptic(6);
        schedule();
        try { await B.sendMessage(p, { text, files }); }
        catch (ex) { toast(ex.message, 'error'); ta.value = text; ui.chatFiles = files; }
        ui.sending = false; schedule({ chatNew: true });
      };
    },
  };
}
const linkify = (s) => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');

/* =========================================================
 * CLÍNICA (admin)
 * ========================================================= */
function adminView(r) {
  switch (r.name) {
    case 'inbox': return AdminInbox();
    case 'chat': return ChatView(r.id);
    case 'clients': return AdminClients();
    case 'client': return AdminClient(r.id);
    case 'pet': return PetView(r.id);
    case 'agenda': return AdminAgenda();
    case 'settings': return AdminSettings();
    default: return AdminHome();
  }
}

function AdminHome() {
  const t = todayISO();
  const clients = S.users.filter((u) => u.id !== S.user.uid);
  const unread = S.pets.reduce((s, p) => s + (p.unreadAdmin || 0), 0);
  const pendingAppts = S.appts.filter((a) => a.status === 'pendiente');
  const todayAppts = S.appts.filter((a) => a.date === t && ['confirmada', 'pendiente'].includes(a.status));
  const money = S.pets.reduce((s, p) => s + (p.pendingAmount || 0), 0);
  const chats = S.pets.filter((p) => p.lastMessageAt).sort((a, b) => (b.unreadAdmin || 0) - (a.unreadAdmin || 0) || b.lastMessageAt - a.lastMessageAt).slice(0, 4);
  const stat = (href, icon, color, n, label, m = false, i = 0) => `<a href="${href}" class="glass stat rise" style="--i:${i};--c:${color}"><span class="stat-ico">${I[icon]}</span><b data-count="${n}" ${m ? 'data-money="1"' : ''}>${m ? fmtMoney(n) : n}</b><small>${label}</small></a>`;
  return {
    tabbar: true, cls: 'dash',
    html: `<div class="page wide">
      ${nav(`${greeting()}`, { sub: `<span class="cap">${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</span> · Panel de ${esc(clinicName())}`, right: `<a class="nav-av" href="#/settings">${clinicAvatar(34)}</a>` })}
      <div class="stats">
        ${stat('#/inbox', 'chat', '#0a84ff', unread, 'Mensajes sin leer', false, 0)}
        ${stat('#/agenda', 'calendar', '#ff9f0a', pendingAppts.length, 'Citas por confirmar', false, 1)}
        ${stat('#/clients', 'people', '#30d158', clients.length, 'Clientes', false, 2)}
        ${stat('#/clients', 'paw', '#bf5af2', S.pets.length, 'Animales', false, 3)}
        ${stat('#/clients', 'euro', '#ff375f', money, 'Pendiente de cobro', true, 4)}
      </div>
      <div class="cols">
        <section class="sec">
          <div class="sec-head"><h2>Hoy</h2><a href="#/agenda">Agenda</a></div>
          <div class="stack">${todayAppts.map((a, i) => apptCard(a, i)).join('') || `<div class="glass row-card rise muted-card">${I.calendar}<span>No hay citas para hoy.</span></div>`}
          ${pendingAppts.filter((a) => a.date !== t).slice(0, 3).map((a, i) => apptCard(a, i + 2)).join('')}</div>
        </section>
        <section class="sec">
          <div class="sec-head"><h2>Conversaciones</h2><a href="#/inbox">Ver todas</a></div>
          ${chats.length ? `<div class="glass list rise">${chats.map(threadRow).join('')}</div>` : `<div class="glass row-card rise muted-card">${I.chat}<span>Aún no hay mensajes.</span></div>`}
        </section>
      </div>
    </div>`,
  };
}

function AdminInbox() {
  const q = ui.q.toLowerCase();
  const list = S.pets.filter((p) => !q || (p.name + ' ' + ownerName(p)).toLowerCase().includes(q))
    .sort((a, b) => (b.unreadAdmin ? 1 : 0) - (a.unreadAdmin ? 1 : 0) || (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  const withMsgs = list.filter((p) => p.lastMessageAt), without = list.filter((p) => !p.lastMessageAt);
  return {
    tabbar: true, cls: 'inbox',
    html: `<div class="page">
      ${nav('Mensajes')}
      ${searchBox('Buscar por animal o cliente')}
      ${withMsgs.length ? `<div class="glass list rise">${withMsgs.map(threadRow).join('')}</div>` : empty('chat', 'Bandeja vacía', 'Cuando un cliente escriba sobre su animal, la conversación aparecerá aquí.')}
      ${without.length ? `<div class="sec-head"><h2>Iniciar conversación</h2></div><div class="glass list rise" style="--i:1">${without.map(threadRow).join('')}</div>` : ''}
    </div>`,
  };
}
const searchBox = (ph) => `<label class="search glass rise">${I.search}<input data-keep="search" data-act-input="search" value="${esc(ui.q)}" placeholder="${esc(ph)}" autocomplete="off"></label>`;

function AdminClients() {
  const q = ui.q.toLowerCase();
  const clients = S.users.filter((u) => u.id !== S.user.uid)
    .map((u) => ({ u, pets: S.pets.filter((p) => p.ownerId === u.id) }))
    .filter(({ u, pets }) => !q || [u.name, u.email, u.phone, ...pets.map((p) => p.name + ' ' + p.species + ' ' + (p.chip || ''))].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (a.u.name || '').localeCompare(b.u.name || ''));
  return {
    tabbar: true, cls: 'clients',
    html: `<div class="page">
      ${nav('Clientes', { sub: `${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'} · ${S.pets.length} animales` })}
      ${searchBox('Nombre, teléfono, animal o microchip')}
      ${clients.length ? `<div class="glass list rise">${clients.map(({ u, pets }) => `<a class="row" href="#/client/${u.id}">
          ${userAvatar(u, 46)}
          <span class="grow"><b>${esc(u.name || 'Sin nombre')}</b><small class="muted">${esc(u.phone || u.email || '')}</small></span>
          <span class="pet-stack">${pets.slice(0, 4).map((p) => petAvatar(p, 28)).join('')}</span>${I.chevron}</a>`).join('')}</div>`
        : empty('people', 'Sin clientes', 'Cuando alguien cree su cuenta en la app, aparecerá aquí.')}
    </div>`,
  };
}

function AdminClient(uid) {
  const u = userById(uid);
  if (!u) return { tabbar: true, html: `<div class="page">${nav('Cliente', { back: true })}${empty('person', 'No encontrado', 'Este cliente ya no existe.')}</div>` };
  const pets = S.pets.filter((p) => p.ownerId === uid);
  const appts = S.appts.filter((a) => a.ownerId === uid && a.date >= todayISO() && ['pendiente', 'confirmada'].includes(a.status));
  const owed = pets.reduce((s, p) => s + (p.pendingAmount || 0), 0);
  return {
    tabbar: true, cls: 'client',
    html: `<div class="page">
      ${nav(u.name || 'Cliente', { back: true })}
      <div class="glass profile-card rise">${userAvatar(u, 72)}<div><h2>${esc(u.name)}</h2>
        <p class="muted">Cliente desde ${new Date(u.createdAt || Date.now()).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</p>
        <div class="contact-btns">${u.phone ? `<button class="chip" data-act="copy" data-text="${esc(u.phone)}">${I.phone}${esc(u.phone)}</button>` : ''}${u.email ? `<button class="chip" data-act="copy" data-text="${esc(u.email)}">${I.mail}${esc(u.email)}</button>` : ''}</div></div></div>
      ${owed ? `<div class="glass row-card warn-card rise" style="--i:1"><span class="row-ico" style="--c:#ff9f0a">${I.invoice}</span><span class="grow"><b>Pendiente de cobro</b><small class="muted">Suma de facturas sin pagar</small></span><b class="money">${fmtMoney(owed)}</b></div>` : ''}
      <div class="sec-head"><h2>Animales</h2><button class="link" data-act="add-pet" data-owner="${uid}">${I.plus} Añadir</button></div>
      <div class="pet-grid">${pets.map((p, i) => petCard(p, i)).join('') || '<p class="muted">Este cliente aún no ha añadido animales.</p>'}</div>
      ${appts.length ? `<div class="sec-head"><h2>Próximas citas</h2></div><div class="stack">${appts.map((a, i) => apptCard(a, i)).join('')}</div>` : ''}
    </div>`,
  };
}

function AdminAgenda() {
  const t = todayISO();
  const days = Array.from({ length: 21 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i - 3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const pending = S.appts.filter((a) => a.status === 'pendiente');
  const dayList = S.appts.filter((a) => a.date === ui.agendaDay && a.status !== 'cancelada' && a.status !== 'rechazada');
  return {
    tabbar: true, cls: 'agenda',
    html: `<div class="page">
      ${nav('Agenda', { right: `<button class="nav-btn" data-act="req-appt" aria-label="Nueva cita">${I.plus}</button>` })}
      <div class="days no-scrollbar rise">${days.map((d) => {
        const dt = parseISO(d); const n = S.appts.filter((a) => a.date === d && ['pendiente', 'confirmada'].includes(a.status)).length;
        return `<button class="day${d === ui.agendaDay ? ' active' : ''}${d === t ? ' today' : ''}" data-act="agenda-day" data-day="${d}"><small>${dt.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}</small><b>${dt.getDate()}</b>${n ? `<i>${n}</i>` : '<i class="none"></i>'}</button>`;
      }).join('')}</div>
      ${pending.length ? `<div class="sec-head"><h2>Por confirmar</h2><span class="badge">${pending.length}</span></div><div class="stack">${pending.map((a, i) => apptCard(a, i)).join('')}</div>` : ''}
      <div class="sec-head"><h2 class="cap">${fmtDay(ui.agendaDay)}</h2></div>
      <div class="stack">${dayList.map((a, i) => apptCard(a, i)).join('') || empty('calendar', 'Día libre', 'No hay citas este día.', '<button class="btn glass-btn" data-act="req-appt">Crear cita</button>')}</div>
    </div>`,
    mount({ isNav }) { const a = $('.day.active'); if (a && isNav) a.scrollIntoView({ inline: 'center', block: 'nearest' }); },
  };
}

function AdminSettings() {
  const c = S.clinic;
  return {
    tabbar: true, cls: 'settings',
    html: `<div class="page">
      ${nav('Ajustes')}
      <div class="glass profile-card rise">${clinicAvatar(72)}<div><h2>${esc(clinicName())}</h2><p class="muted">${esc(S.user.email)} · Administración</p></div></div>
      <div class="sec-head"><h2>Datos de la clínica</h2></div>
      <p class="muted small-gap">Los clientes los ven en su inicio y en su perfil.</p>
      <form class="glass list form-list rise" style="--i:1" id="clinic-form">
        <label class="row field-row"><span>Nombre</span><input name="name" data-keep="c-name" value="${esc(c.name || clinicName())}"></label>
        <label class="row field-row"><span>Teléfono</span><input name="phone" data-keep="c-phone" type="tel" value="${esc(c.phone || '')}" placeholder="+34 …"></label>
        <label class="row field-row"><span>Urgencias</span><input name="emergency" data-keep="c-em" type="tel" value="${esc(c.emergency || '')}" placeholder="Teléfono 24 h"></label>
        <label class="row field-row"><span>Correo</span><input name="email" data-keep="c-mail" type="email" value="${esc(c.email || '')}"></label>
        <label class="row field-row"><span>Dirección</span><input name="address" data-keep="c-addr" value="${esc(c.address || '')}"></label>
        <label class="row field-row"><span>Horario</span><input name="hours" data-keep="c-hours" value="${esc(c.hours || '')}" placeholder="L–V 9:00–20:00"></label>
        <div class="row"><button class="btn primary sm ml-auto">Guardar</button></div>
      </form>
      <div class="glass list rise" style="--i:2">
        <div class="row"><span class="row-ico" style="--c:#30d158">${I.shield}</span><span class="grow"><b>Conectado a la nube</b><small class="muted">Tus clientes ven los cambios al instante. Comparte el enlace de la app para que creen su cuenta.</small></span></div>
        <button class="row" data-act="copy" data-text="${esc(location.href.split('#')[0])}"><span class="row-ico" style="--c:#0a84ff">${I.copy}</span><span class="grow"><b>Copiar el enlace de la app</b><small class="muted">${esc(location.href.split('#')[0])}</small></span></button>
        <button class="row" data-act="logout"><span class="row-ico" style="--c:#8e8e93">${I.logout}</span><span class="grow"><b>Cerrar sesión</b></span></button>
        
      </div>
    </div>`,
    mount() {
      $('#clinic-form').onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        try { await B.saveClinic(Object.fromEntries(['name', 'phone', 'emergency', 'email', 'address', 'hours'].map((k) => [k, f[k].value.trim()]))); toast('Datos de la clínica guardados'); }
        catch (ex) { toast(ex.message, 'error'); }
      };
    },
  };
}

/* =========================================================
 * Hojas: animal, documento, archivo, cita, peso
 * ========================================================= */
function petSheet(pet, ownerId) {
  const p = pet || { species: 'Perro', sex: 'Macho', allergies: [], sterilized: false };
  let photo = p.photo || '';
  const species = Object.keys(SPECIES);
  const h = openSheet(`
    <div class="sheet-head"><button class="sh-btn" data-close>Cancelar</button><h3>${pet ? 'Editar ficha' : 'Nuevo animal'}</h3><button class="sh-btn bold" form="pet-form">Guardar</button></div>
    <form class="form" id="pet-form">
      <label class="photo-pick" style="--g:${speciesGrad(p.species)}"><span class="photo-prev">${photo ? `<img src="${esc(photo)}" alt="">` : I.camera}</span><span>Foto</span><input type="file" accept="image/*" hidden id="pet-photo"></label>
      <label class="field"><span>Nombre</span><input name="name" value="${esc(p.name || '')}" required autofocus placeholder="Toby"></label>
      <div class="field"><span>Especie</span><div class="chips wrap">${species.map((s) => `<button type="button" class="chip${p.species === s ? ' active' : ''}" data-species="${s}">${s}</button>`).join('')}</div></div>
      <div class="grid2">
        <label class="field"><span>Raza</span><input name="breed" value="${esc(p.breed || '')}" placeholder="Mestizo"></label>
        <label class="field"><span>Color</span><input name="color" value="${esc(p.color || '')}" placeholder="Negro"></label>
      </div>
      <div class="grid2">
        <div class="field"><span>Sexo</span>${seg('sex', p.sex || 'Macho', [['Macho', 'Macho'], ['Hembra', 'Hembra']])}</div>
        <label class="field"><span>Nacimiento</span><input name="birthDate" type="date" value="${esc(p.birthDate || '')}" max="${todayISO()}"></label>
      </div>
      <label class="field"><span>Microchip</span><input name="chip" inputmode="numeric" value="${esc(p.chip || '')}" placeholder="15 dígitos" class="mono"></label>
      <label class="switch-row"><span>Esterilizado/a</span><input type="checkbox" name="sterilized" ${p.sterilized ? 'checked' : ''}><i class="switch"></i></label>
      <label class="field"><span>Alergias <i>(separadas por comas)</i></span><input name="allergies" value="${esc((p.allergies || []).join(', '))}" placeholder="Pollo, penicilina"></label>
      <label class="field"><span>Notas</span><textarea name="notes" rows="3" placeholder="Carácter, cuidados especiales…">${esc(p.notes || '')}</textarea></label>
      ${pet ? '<button type="button" class="btn danger-soft block" data-del>Eliminar animal</button>' : ''}
    </form>`);
  const el = h.el, f = $('#pet-form', el);
  let sp = p.species, sex = p.sex || 'Macho';
  $$('[data-species]', el).forEach((b) => b.onclick = () => { sp = b.dataset.species; $$('[data-species]', el).forEach((x) => x.classList.toggle('active', x === b)); $('.photo-pick', el).style.setProperty('--g', speciesGrad(sp)); haptic(5); });
  $$('.seg-btn', el).forEach((b) => b.onclick = () => { sex = b.dataset.val; $$('.seg-btn', el).forEach((x) => x.classList.toggle('active', x === b)); layoutSeg($('.seg', el)); haptic(5); });
  requestAnimationFrame(() => $$('.seg', el).forEach(layoutSeg));
  $('[data-close]', el).onclick = () => h.close();
  $('#pet-photo', el).onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    photo = await compressImage(file, 520, 0.82);
    $('.photo-prev', el).innerHTML = `<img src="${photo}" alt="">`;
  };
  const del = $('[data-del]', el);
  if (del) del.onclick = async () => {
    if (!(await confirmSheet(`¿Eliminar a ${pet.name}? Se perderá su ficha.`, 'Eliminar animal'))) return;
    try { await B.deletePet(pet.id); h.close(); toast(`${pet.name} eliminado`); go(isAdmin() ? '#/clients' : '#/pets'); } catch (ex) { toast(ex.message, 'error'); }
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!f.name.value.trim()) return f.name.focus();
    const data = {
      name: f.name.value.trim(), species: sp, breed: f.breed.value.trim(), color: f.color.value.trim(), sex, birthDate: f.birthDate.value,
      chip: f.chip.value.replace(/\s/g, ''), sterilized: f.sterilized.checked, notes: f.notes.value.trim(), photo,
      allergies: f.allergies.value.split(',').map((x) => x.trim()).filter(Boolean),
    };
    if (pet) data.id = pet.id;
    else if (ownerId) data.ownerId = ownerId;
    try {
      const id = await B.savePet(data);
      h.close();
      if (!pet) { confetti(); toast(`¡Bienvenido/a, ${data.name}!`); go('#/pet/' + id); } else toast('Ficha guardada');
    } catch (ex) { toast(ex.message, 'error'); }
  };
}

function recordSheet(pet, rec) {
  const r = rec ? { ...rec } : { type: 'diagnostico', date: todayISO(), files: [] };
  const newFiles = [];
  let keep = (r.files || []).slice();
  const h = openSheet(`
    <div class="sheet-head"><button class="sh-btn" data-close>Cancelar</button><h3>${rec ? 'Editar documento' : 'Añadir a la cartilla'}</h3><button class="sh-btn bold" form="rec-form">Guardar</button></div>
    <form class="form" id="rec-form">
      <div class="pet-line">${petAvatar(pet, 30)}<b>${esc(pet.name)}</b><small class="muted">${esc(ownerName(pet))}</small></div>
      <div class="type-grid">${Object.entries(RECORD_TYPES).map(([k, t]) => `<button type="button" class="type-btn${r.type === k ? ' active' : ''}" data-type="${k}" style="--c:${t.color}">${I[t.icon]}<span>${t.label}</span></button>`).join('')}</div>
      <label class="field"><span>Título</span><input name="title" value="${esc(r.title || '')}" required placeholder="Ej.: Otitis externa, Vacuna rabia, Factura 2025-014"></label>
      <label class="field"><span>Fecha</span><input name="date" type="date" value="${esc(r.date || todayISO())}" required></label>
      <div class="extra"></div>
      <label class="field"><span>Descripción / indicaciones</span><textarea name="notes" rows="4" placeholder="Detalles, tratamiento, dosis…">${esc(r.notes || '')}</textarea></label>
      <div class="field"><span>Archivos <i>(PDF, fotos, documentos · máx. 10 MB)</i></span>
        <label class="drop no-drag">${I.clip}<b>Adjuntar archivos</b><small>Pulsa o arrastra aquí</small><input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" hidden id="rec-files"></label>
        <div class="file-list" id="rec-file-list"></div>
      </div>
      <div class="progress" hidden><span></span></div>
    </form>`, { wide: true });
  const el = h.el, f = $('#rec-form', el);
  $('[data-close]', el).onclick = () => h.close();
  const extra = () => {
    const box = $('.extra', el);
    if (r.type === 'vacuna') box.innerHTML = `<label class="field"><span>Próxima dosis</span><input name="nextDate" type="date" value="${esc(r.nextDate || '')}"></label>`;
    else if (r.type === 'factura') box.innerHTML = `<div class="grid2"><label class="field"><span>Importe (€)</span><input name="amount" type="number" step="0.01" min="0" value="${esc(r.amount ?? '')}" placeholder="0,00" required></label>
      <label class="switch-row tall"><span>Pagada</span><input type="checkbox" name="paid" ${r.paid ? 'checked' : ''}><i class="switch"></i></label></div>`;
    else box.innerHTML = '';
  };
  extra();
  $$('.type-btn', el).forEach((b) => b.onclick = () => {
    r.type = b.dataset.type; $$('.type-btn', el).forEach((x) => x.classList.toggle('active', x === b)); extra(); haptic(5);
    if (!f.title.value) f.title.placeholder = RECORD_TYPES[r.type].label;
  });
  const list = () => {
    $('#rec-file-list', el).innerHTML = [
      ...keep.map((x, i) => `<span class="pfile">${fileKind(x.type) === 'image' ? I.image : I.doc}<span>${esc(x.name)}</span><small>${fmtSize(x.size || 0)}</small><button type="button" data-rm-keep="${i}">${I.close}</button></span>`),
      ...newFiles.map((x, i) => `<span class="pfile new">${fileKind(x.type) === 'image' ? I.image : I.doc}<span>${esc(x.name)}</span><small>${fmtSize(x.size)}</small><button type="button" data-rm-new="${i}">${I.close}</button></span>`),
    ].join('');
    $$('[data-rm-keep]', el).forEach((b) => b.onclick = () => { keep.splice(+b.dataset.rmKeep, 1); list(); });
    $$('[data-rm-new]', el).forEach((b) => b.onclick = () => { newFiles.splice(+b.dataset.rmNew, 1); list(); });
  };
  list();
  const input = $('#rec-files', el), drop = $('.drop', el);
  input.onchange = () => { newFiles.push(...input.files); input.value = ''; list(); };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); newFiles.push(...e.dataTransfer.files); list(); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const data = { type: r.type, title: f.title.value.trim(), date: f.date.value, notes: f.notes.value.trim(), files: keep };
    if (!data.title) return f.title.focus();
    if (rec) data.id = rec.id;
    if (r.type === 'vacuna') data.nextDate = f.nextDate.value || '';
    if (r.type === 'factura') { data.amount = Math.round((parseFloat(f.amount.value) || 0) * 100) / 100; data.paid = f.paid.checked; }
    const prog = $('.progress', el), bar = $('.progress span', el);
    prog.hidden = !newFiles.length;
    $$('.sh-btn', el).forEach((b) => b.disabled = true);
    try {
      await B.saveRecord(pet, data, newFiles, (k) => { bar.style.width = Math.round(k * 100) + '%'; });
      h.close();
      toast(rec ? 'Documento actualizado' : `Añadido a la cartilla de ${pet.name}`);
      if (!rec) confetti(innerWidth / 2, innerHeight * .6);
    } catch (ex) { toast(ex.message, 'error'); $$('.sh-btn', el).forEach((b) => b.disabled = false); }
  };
}

function recordView(pet, rec) {
  const t = RECORD_TYPES[rec.type] || RECORD_TYPES.otro;
  const s = rec.type === 'vacuna' ? vaccineStatus(rec) : null;
  const admin = isAdmin();
  const h = openSheet(`
    <div class="rec-view">
      <div class="rec-hero" style="--c:${t.color}"><span class="rec-ico">${I[t.icon]}</span><small>${t.label} · ${fmtDate(rec.date)}</small><h2>${esc(rec.title)}</h2>
        <span class="rec-pet">${petAvatar(pet, 24)} ${esc(pet.name)}</span></div>
      ${rec.type === 'factura' ? `<div class="invoice-box"><span><small>Importe</small><b>${fmtMoney(rec.amount)}</b></span>${admin ? `<label class="switch-row"><span>${rec.paid ? 'Pagada' : 'Pendiente'}</span><input type="checkbox" id="paid-toggle" ${rec.paid ? 'checked' : ''}><i class="switch"></i></label>` : `<span class="pill ${rec.paid ? 'st-confirmada' : 'st-pendiente'}">${rec.paid ? 'Pagada' : 'Pendiente de pago'}</span>`}</div>` : ''}
      ${s ? `<div class="invoice-box"><span><small>Próxima dosis</small><b>${fmtDate(rec.nextDate)}</b></span><span class="pill vac-${s.cls}">${s.text}</span></div>` : ''}
      ${rec.notes ? `<p class="rec-notes">${esc(rec.notes).replace(/\n/g, '<br>')}</p>` : ''}
      ${(rec.files || []).length ? `<div class="file-grid">${rec.files.map(fileTile).join('')}</div>` : ''}
      ${rec.type === 'vacuna' && rec.nextDate ? `<button class="btn glass-btn block" data-ics>${I.calendar} Recordatorio en mi calendario</button>` : ''}
      ${admin ? `<div class="grid2"><button class="btn glass-btn" data-edit>${I.edit} Editar</button><button class="btn danger-soft" data-del>${I.trash} Eliminar</button></div>` : ''}
    </div>`, { wide: true });
  const el = h.el;
  hydrateFiles(el);
  const tg = $('#paid-toggle', el);
  if (tg) tg.onchange = async () => { try { await B.saveRecord(pet, { ...rec, paid: tg.checked }); toast(tg.checked ? 'Factura marcada como pagada' : 'Factura pendiente'); tg.previousElementSibling.textContent = tg.checked ? 'Pagada' : 'Pendiente'; } catch (ex) { toast(ex.message, 'error'); } };
  const ics = $('[data-ics]', el);
  if (ics) ics.onclick = () => downloadBlob(new Blob([icsFor({ title: `Vacuna de ${pet.name}: ${rec.title}`, date: rec.nextDate, time: '10:00', location: S.clinic.address || clinicName() })], { type: 'text/calendar' }), `vacuna-${pet.name}.ics`);
  const ed = $('[data-edit]', el);
  if (ed) ed.onclick = () => { h.close(); setTimeout(() => recordSheet(pet, rec), 250); };
  const del = $('[data-del]', el);
  if (del) del.onclick = async () => {
    if (!(await confirmSheet('¿Eliminar este documento de la cartilla?', 'Eliminar'))) return;
    try { await B.deleteRecord(pet, rec); h.close(); toast('Documento eliminado'); } catch (ex) { toast(ex.message, 'error'); }
  };
}

async function fileViewer(meta) {
  const k = fileKind(meta.type);
  const h = openSheet(`<div class="viewer"><div class="viewer-head"><b>${esc(meta.name)}</b><small class="muted">${fmtSize(meta.size || 0)}</small></div>
    <div class="viewer-body"><div class="spinner"></div></div>
    <div class="grid2"><button class="btn glass-btn" data-open>${I.download} Descargar</button><button class="btn primary" data-close>Cerrar</button></div></div>`, { wide: true, cls: 'tall' });
  $('[data-close]', h.el).onclick = () => h.close();
  try {
    const url = await B.openFile(meta);
    const body = $('.viewer-body', h.el);
    if (k === 'image') body.innerHTML = `<img src="${url}" alt="${esc(meta.name)}">`;
    else if (k === 'pdf') body.innerHTML = `<iframe src="${url}#toolbar=0&view=FitH" title="${esc(meta.name)}"></iframe>`;
    else body.innerHTML = `<div class="empty"><div class="empty-ico">${I.doc}</div><p class="muted">Vista previa no disponible. Descárgalo para abrirlo.</p></div>`;
    $('[data-open]', h.el).onclick = () => { const a = document.createElement('a'); a.href = url; a.download = meta.name; document.body.appendChild(a); a.click(); a.remove(); };
  } catch (ex) { $('.viewer-body', h.el).innerHTML = `<p class="muted">${esc(ex.message)}</p>`; }
}

function apptSheet(petId) {
  const admin = isAdmin();
  const pets = S.pets;
  if (!pets.length) { toast(admin ? 'Todavía no hay animales registrados.' : 'Primero añade a tu animal.', 'error'); if (!admin) petSheet(); return; }
  const slots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'];
  let time = '';
  const h = openSheet(`
    <div class="sheet-head"><button class="sh-btn" data-close>Cancelar</button><h3>${admin ? 'Nueva cita' : 'Pedir cita'}</h3><button class="sh-btn bold" form="appt-form">${admin ? 'Crear' : 'Enviar'}</button></div>
    <form class="form" id="appt-form">
      <label class="field"><span>Animal</span><select name="petId">${pets.map((p) => `<option value="${p.id}" ${p.id === petId ? 'selected' : ''}>${esc(p.name)}${admin ? ' · ' + esc(ownerName(p)) : ''}</option>`).join('')}</select></label>
      <label class="field"><span>Día</span><input name="date" type="date" min="${todayISO()}" value="${esc(admin ? ui.agendaDay : '')}" required></label>
      <div class="field"><span>Hora</span><div class="slots">${slots.map((s) => `<button type="button" class="slot" data-slot="${s}">${s}</button>`).join('')}</div></div>
      <label class="field"><span>Motivo</span><input name="reason" required placeholder="Vacunación, revisión, cojea…"></label>
      ${admin ? '<label class="field"><span>Nota para el cliente <i>(opcional)</i></span><input name="note" placeholder="Venir en ayunas"></label>' : '<p class="tiny muted">La clínica revisará tu solicitud y te avisaremos en la app cuando la confirme.</p>'}
    </form>`);
  const el = h.el, f = $('#appt-form', el);
  $('[data-close]', el).onclick = () => h.close();
  const markTaken = () => {
    const taken = S.appts.filter((a) => a.date === f.date.value && ['pendiente', 'confirmada'].includes(a.status)).map((a) => a.time);
    $$('.slot', el).forEach((b) => { b.classList.toggle('taken', admin && taken.includes(b.dataset.slot)); });
  };
  f.date.onchange = markTaken; markTaken();
  $$('.slot', el).forEach((b) => b.onclick = () => { time = b.dataset.slot; $$('.slot', el).forEach((x) => x.classList.toggle('active', x === b)); haptic(5); });
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!f.date.value) return f.date.focus();
    if (!time) { toast('Elige una hora', 'error'); return; }
    const p = petById(f.petId.value);
    const a = { petId: p.id, ownerId: p.ownerId, date: f.date.value, time, reason: f.reason.value.trim() || 'Consulta', status: admin ? 'confirmada' : 'pendiente', note: admin ? f.note.value.trim() : '' };
    try {
      await B.saveAppointment(a);
      h.close();
      toast(admin ? 'Cita creada' : 'Solicitud enviada. Te avisaremos al confirmarla.');
      if (!admin) confetti(innerWidth / 2, innerHeight * .7);
    } catch (ex) { toast(ex.message, 'error'); }
  };
}

async function apptMenu(id) {
  const a = S.appts.find((x) => x.id === id);
  if (!a) return;
  const p = petById(a.petId) || { name: '' };
  const admin = isAdmin();
  const acts = [];
  if (admin && a.status === 'pendiente') acts.push({ label: 'Confirmar cita', icon: 'check', bold: true, value: 'confirmada' }, { label: 'Rechazar', icon: 'close', danger: true, value: 'rechazada' });
  if (admin && a.status === 'confirmada') acts.push({ label: 'Marcar como completada', icon: 'checks', value: 'completada' });
  if (admin && ['pendiente', 'confirmada'].includes(a.status)) acts.push({ label: 'Añadir nota para el cliente', icon: 'edit', value: 'note' });
  if (['pendiente', 'confirmada'].includes(a.status)) acts.push({ label: 'Añadir a mi calendario', icon: 'calendar', value: 'ics' });
  acts.push({ label: 'Abrir chat', icon: 'chat', value: 'chat' });
  if (!admin && ['pendiente', 'confirmada'].includes(a.status)) acts.push({ label: 'Cancelar cita', icon: 'trash', danger: true, value: 'cancelada' });
  const v = await actionSheet(`${a.reason} · ${p.name} · ${fmtDate(a.date, { day: 'numeric', month: 'long' })} ${a.time}`, acts);
  if (!v) return;
  try {
    if (v === 'chat') return go('#/chat/' + a.petId);
    if (v === 'ics') return downloadBlob(new Blob([icsFor({ title: `${clinicName()}: ${a.reason} (${p.name})`, date: a.date, time: a.time, description: a.note || '', location: S.clinic.address || '' })], { type: 'text/calendar' }), `cita-${p.name}.ics`);
    if (v === 'note') {
      const note = await promptSheet('Nota para el cliente', { label: 'Indicaciones', value: a.note || '', placeholder: 'Venir en ayunas, traer la cartilla…', ok: 'Guardar nota' });
      if (note !== null) { await B.saveAppointment({ id, note }); toast('Nota guardada'); }
      return;
    }
    if (v === 'cancelada' && !(await confirmSheet('¿Cancelar esta cita?', 'Cancelar cita'))) return;
    await B.saveAppointment({ id, status: v });
    toast({ confirmada: 'Cita confirmada', rechazada: 'Cita rechazada', completada: 'Cita completada', cancelada: 'Cita cancelada' }[v]);
    if (v === 'confirmada') confetti();
  } catch (ex) { toast(ex.message, 'error'); }
}

async function addWeight(petId) {
  const p = petById(petId);
  const v = await promptSheet(`Peso de ${p.name}`, { label: 'Kilogramos', type: 'number', placeholder: 'Ej.: 12,4', ok: 'Registrar' });
  if (v === null) return;
  const kg = parseFloat(String(v).replace(',', '.'));
  if (!(kg > 0)) return toast('Escribe un peso válido', 'error');
  try {
    const ws = (p.weights || []).filter((w) => w.date !== todayISO()).concat({ date: todayISO(), kg: Math.round(kg * 100) / 100 });
    await B.savePet({ id: petId, weights: ws });
    toast(`Peso registrado: ${String(kg).replace('.', ',')} kg`);
    ui.petTab = 'salud';
  } catch (ex) { toast(ex.message, 'error'); }
}

async function pickPetForChat() {
  const v = await actionSheet('¿Con qué animal?', S.pets.map((p) => ({ label: `${p.name} · ${ownerName(p)}`, value: p.id })));
  if (v) go('#/chat/' + v);
}

/* =========================================================
 * Acciones (delegación)
 * ========================================================= */
const ACT = {
  back: () => (history.length > 1 ? history.back() : go('#/')),
  seg: (el) => { ui[el.dataset.seg] = el.dataset.val; if (el.dataset.seg === 'authTab') $('#auth-error') && ($('#auth-error').textContent = ''); haptic(5); const s = el.closest('.seg'); $$('.seg-btn', s).forEach((b) => b.classList.toggle('active', b === el)); layoutSeg(s); setTimeout(() => draw(false), 180); },
  'rec-filter': (el) => { ui.recFilter = el.dataset.val; draw(false); },
  forgot: async () => {
    const email = await promptSheet('Recuperar contraseña', { label: 'Tu correo', type: 'email', value: ($('#auth-form') || {}).email?.value || '', ok: 'Enviar enlace' });
    if (!email) return;
    try { await B.resetPassword(email); toast('Te hemos enviado un correo para crear una nueva contraseña'); } catch (ex) { toast(ex.message, 'error'); }
  },
  logout: async () => { if (await confirmSheet('¿Cerrar sesión?', 'Cerrar sesión')) { await B.signOut(); adminKnown = null; location.hash = '#/'; } },
  'delete-account': async () => {
    if (!(await confirmSheet('¿Eliminar tu cuenta? Se borrarán tus animales y citas.', 'Eliminar cuenta'))) return;
    const pw = await promptSheet('Confirma tu contraseña', { label: 'Contraseña', type: 'password', ok: 'Eliminar definitivamente' });
    if (!pw) return;
    try { await B.deleteAccount(pw); toast('Cuenta eliminada'); } catch (ex) { toast(ex.message, 'error'); }
  },
  'add-pet': (el) => petSheet(null, el.dataset.owner),
  'edit-pet': (el) => petSheet(petById(el.dataset.id)),
  'add-record': (el) => recordSheet(petById(el.dataset.pet)),
  'open-record': (el) => { const p = petById(el.dataset.pet); const r = (S.recs[p.id] || []).find((x) => x.id === el.dataset.rec); if (r) recordView(p, r); },
  'open-file': (el) => fileViewer(JSON.parse(el.dataset.file)),
  'req-appt': (el) => apptSheet(el.dataset.pet || (route().name === 'pet' ? route().id : '')),
  'appt-menu': (el) => apptMenu(el.dataset.id),
  'add-weight': (el) => addWeight(el.dataset.pet),
  'agenda-day': (el) => { ui.agendaDay = el.dataset.day; haptic(4); draw(false); },
  'chat-attach': () => $('#chat-file').click(),
  'chat-unattach': (el) => { ui.chatFiles.splice(+el.dataset.i, 1); draw(false); },
  quick: (el) => { const ta = $('#composer textarea'); ta.value = (ta.value ? ta.value + ' ' : '') + el.dataset.text; autosize(ta); ta.focus(); },
  'new-chat': () => pickPetForChat(),
  'profile-photo': () => $('#avatar-input').click(),
  copy: async (el) => { try { await navigator.clipboard.writeText(el.dataset.text); toast('Copiado'); } catch (e) { toast(el.dataset.text); } },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !ACT[el.dataset.act]) return;
  if (el.tagName === 'A' || el.type === 'submit') e.preventDefault();
  ACT[el.dataset.act](el, e);
});
document.addEventListener('input', (e) => {
  if (e.target.dataset.actInput === 'search') { ui.q = e.target.value; schedule(); }
});
// pulsación con rebote en botones y tarjetas
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.btn, .glass-btn, .quick-btn, .action, .row, .pet-card, .appt, .tab, .chip, .tl-card, .day, .slot, .type-btn, .stat');
  if (!el) return;
  el.classList.add('pressed');
  const off = () => { el.classList.remove('pressed'); removeEventListener('pointerup', off); removeEventListener('pointercancel', off); };
  addEventListener('pointerup', off); addEventListener('pointercancel', off);
}, { passive: true });
// se cambia la ruta: cerramos hojas abiertas
addEventListener('hashchange', () => { while (anySheetOpen()) closeSheet(); ui.q = ''; ui.chatFiles = []; if (route().name !== 'pet') { ui.petTab = 'cartilla'; ui.recFilter = 'all'; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && route().name === 'chat') schedule(); });

boot();

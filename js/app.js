/* Barbería — aplicación (clientes y administrador) */
import { CONFIG } from './config.js?v=7';
import {
  $, $$, esc, I, todayISO, parseISO, fmtDate, fmtDay, fmtMoney, timeAgo, initials, greeting, haptic, toast,
  openSheet, closeSheet, anySheetOpen, actionSheet, confirmSheet, promptSheet, compressImage, icsFor, downloadBlob, confetti, countUp,
} from './ui.js?v=7';
import { createBackend, toMin, toHHMM, STEP } from './backend.js?v=7';

/* =========================================================
 * Estado
 * ========================================================= */
let B = null;
const S = { user: null, profile: null, shop: null, services: [], barbers: [], bookings: [], users: [], notes: [], notifs: [], loaded: false, ownerExists: null };
const ui = { authTab: 'login', day: todayISO(), q: '', bk: {}, apptTab: 'up', slots: null, slotsDay: null };
let subs = [], slotSub = null, lastRoute = '', swReg = null;
const bootAt = Date.now();
const seenNotif = new Set();

const DEFAULT_HOURS = { 1: [['10:00', '14:00'], ['16:30', '20:30']], 2: [['10:00', '14:00'], ['16:30', '20:30']], 3: [['10:00', '14:00'], ['16:30', '20:30']], 4: [['10:00', '14:00'], ['16:30', '20:30']], 5: [['10:00', '14:00'], ['16:30', '20:30']], 6: [['10:00', '14:00']], 0: [] };
const shop = () => ({ name: CONFIG.appName || 'Mi Barbería', hours: DEFAULT_HOURS, closed: [], loyaltyEvery: 10, cancelHours: 2, lead: 30, ...(S.shop || {}) });
const isAdmin = () => !!(S.user && S.user.isAdmin);
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const barbers = () => { const l = S.barbers.filter((b) => b.active !== false); return l.length ? l : [{ id: 'main', name: shop().name, color: '#d4a24c' }]; };
const barberById = (id) => barbers().find((b) => b.id === id) || S.barbers.find((b) => b.id === id) || { id, name: 'Barbero', color: '#888' };
const serviceById = (id) => S.services.find((s) => s.id === id);
const userById = (id) => (S.profile && S.profile.id === id ? S.profile : S.users.find((u) => u.id === id));
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const monthKey = (iso) => iso.slice(0, 7);
// una cita «cuenta» como corte si se completó o ya pasó sin cancelarse
const isDone = (b) => b.status === 'completada' || (b.status === 'confirmada' && (b.date < todayISO() || (b.date === todayISO() && toMin(b.end) <= nowMin())));
const isUpcoming = (b) => b.status === 'confirmada' && (b.date > todayISO() || (b.date === todayISO() && toMin(b.end) > nowMin()));

/* =========================================================
 * Arranque
 * ========================================================= */
async function boot() {
  if (!(CONFIG.firebase && CONFIG.firebase.apiKey)) { $('#view').innerHTML = `<div class="center-screen"><div class="glass card pad verify"><h2>Falta la configuración</h2><p class="muted">Añade la configuración de Firebase en js/config.js.</p></div></div>`; return; }
  try { B = await createBackend(CONFIG.firebase); }
  catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="center-screen"><div class="glass card pad verify"><div class="empty-ico">${I.info}</div><h2>No se pudo conectar</h2><p class="muted">Revisa tu conexión a internet.</p><button class="btn primary block" onclick="location.reload()">Reintentar</button></div></div>`;
    return;
  }
  window.APP = B;
  addEventListener('backend-error', (e) => toast(e.detail, 'error'));
  addEventListener('push-foreground', (e) => { const n = (e.detail && e.detail.notification) || {}; if (n.title) toast(`${n.title}: ${n.body || ''}`, 'chat'); });
  // datos públicos de la barbería (también antes de iniciar sesión)
  B.watchShop((s) => { S.shop = s; document.title = shop().name; schedule(); });
  B.watchServices((l) => { S.services = l; schedule(); });
  B.watchBarbers((l) => { S.barbers = l; schedule(); });
  await B.init(onAuth);
  addEventListener('hashchange', () => { while (anySheetOpen()) closeSheet(); ui.q = ''; navigate(); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register(`sw.js?cfg=${encodeURIComponent(JSON.stringify(CONFIG.firebase))}`).then((r) => { swReg = r; }).catch(() => {});
  }
  setInterval(() => $$('[data-countdown]').forEach(tickCountdown), 1000);
}

function onAuth(user) {
  subs.forEach((u) => u()); subs = [];
  if (slotSub) { slotSub(); slotSub = null; ui.slotsDay = null; }
  Object.assign(S, { user, profile: null, bookings: [], users: [], notes: [], notifs: [], loaded: false });
  if (user) {
    let pending = user.isAdmin ? 3 : 2;
    const ready = () => { if (--pending === 0) { S.loaded = true; schedule(); } };
    const once = (fn) => { let d = false; return (v) => { fn(v); if (!d) { d = true; ready(); } }; };
    subs.push(B.watchProfile(user.uid, (p) => { S.profile = p; schedule(); }));
    subs.push(B.watchBookings(once((l) => { S.bookings = l; schedule(); })));
    subs.push(B.watchNotifications(once(onNotifs)));
    if (user.isAdmin) {
      subs.push(B.watchUsers(once((l) => { S.users = l; schedule(); })));
      subs.push(B.watchClientNotes((l) => { S.notes = l; schedule(); }));
    } else B.ownerExists().then((x) => { S.ownerExists = x; schedule(); });
  }
  navigate(true);
}

// notificaciones nuevas: aviso en pantalla, o del sistema si la app está en segundo plano
function onNotifs(list) {
  list.forEach((n) => {
    if (seenNotif.has(n.id)) return;
    seenNotif.add(n.id);
    if (n.createdAt > bootAt && n.from !== S.user.uid) {
      if (document.visibilityState === 'hidden' && swReg && 'Notification' in window && Notification.permission === 'granted') {
        swReg.showNotification(n.title, { body: n.body, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', tag: n.id, data: { url: location.href.split('#')[0] + (n.link || '#/') } });
      } else toast(`${n.title}: ${n.body}`, 'chat');
    }
  });
  S.notifs = list;
  schedule();
}
const unreadNotifs = () => (S.user ? S.notifs.filter((n) => n.createdAt > ((S.profile && S.profile.notifSeenAt) || 0) && n.from !== S.user.uid).length : 0);

/* =========================================================
 * Navegación y render
 * ========================================================= */
function route() {
  const [path, qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || '', id: parts[1] || '', key: path, params: Object.fromEntries(new URLSearchParams(qs)) };
}
const go = (h) => { if (location.hash === h) draw(false); else location.hash = h; };
let queued = false, qOpts = {};
function schedule(o = {}) { Object.assign(qOpts, o); if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; const x = qOpts; qOpts = {}; draw(false, x); }); }
function navigate(force) {
  const r = route();
  if (r.key === lastRoute && !force) return schedule();
  const run = () => draw(true);
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const t = document.startViewTransition(run);
    [t.ready, t.finished, t.updateCallbackDone].forEach((p) => p && p.catch(() => {}));
  } else run();
}
function keepState() {
  const st = {};
  $$('[data-keep]').forEach((el) => { st[el.dataset.keep] = { v: el.value, f: el === document.activeElement, s: el.selectionStart }; });
  return st;
}
function restoreState(st) {
  Object.entries(st).forEach(([k, o]) => {
    const el = $(`[data-keep="${k}"]`); if (!el) return;
    el.value = o.v;
    if (o.f) { el.focus(); try { el.setSelectionRange(o.s, o.s); } catch (e) { /* nada */ } }
  });
}
function draw(isNav, opts = {}) {
  if (!B) return;
  const r = route();
  const st = isNav ? {} : keepState();
  const y = scrollY;
  let v;
  if (!S.user) v = AuthView();
  else if (!S.loaded) v = { html: `<div class="page"><div class="sk sk-title"></div><div class="sk sk-card"></div><div class="sk sk-row"></div><div class="sk sk-row"></div></div>`, tabbar: true };
  else v = (isAdmin() ? adminView : clientView)(r);
  $('#view').innerHTML = v.html;
  document.body.dataset.view = v.cls || r.name || 'home';
  document.body.classList.toggle('no-tabbar', !v.tabbar);
  renderTabbar(v.tabbar);
  if (!isNav) { restoreState(st); scrollTo(0, y); } else if (r.key !== lastRoute) scrollTo(0, 0);
  if (isNav) lastRoute = r.key;
  if (v.mount) v.mount({ isNav, opts });
  enhance($('#view'), isNav);
  onScroll();
}

/* ---------- Barra de pestañas ---------- */
const TABS = {
  client: [['', 'Inicio', 'home'], ['book', 'Reservar', 'scissors'], ['appts', 'Citas', 'calendar'], ['stats', 'Mi estilo', 'chart'], ['profile', 'Perfil', 'person']],
  admin: [['', 'Agenda', 'calendar'], ['dash', 'Panel', 'chart'], ['clients', 'Clientes', 'people'], ['notifs', 'Avisos', 'bell'], ['settings', 'Ajustes', 'gear']],
};
function renderTabbar(show) {
  const bar = $('#tabbar');
  if (!show || !S.user) { bar.classList.remove('show'); return; }
  const role = isAdmin() ? 'admin' : 'client';
  const r = route();
  const active = r.name === 'client' ? 'clients' : r.name;
  const badge = (k) => (k === 'notifs' ? unreadNotifs() : k === 'appts' ? S.bookings.filter(isUpcoming).length : 0);
  const sig = role + active + TABS[role].map(([k]) => badge(k)).join();
  if (bar.dataset.sig !== sig) {
    bar.dataset.sig = sig;
    bar.innerHTML = `<span class="tab-indicator"></span>${TABS[role].map(([k, l, i]) => { const n = badge(k); return `<a href="#/${k}" class="tab${active === k ? ' active' : ''}">${I[i]}<span>${l}</span>${n ? `<b class="badge${k === 'appts' ? ' soft' : ''}">${n}</b>` : ''}</a>`; }).join('')}`;
  }
  bar.classList.add('show');
  requestAnimationFrame(() => { const a = $('.tab.active', bar), ind = $('.tab-indicator', bar); if (!ind) return; if (!a) { ind.style.opacity = 0; return; } ind.style.opacity = 1; ind.style.width = a.offsetWidth + 'px'; ind.style.transform = `translateX(${a.offsetLeft}px)`; });
}

/* ---------- Efectos ---------- */
function enhance(root, isNav) {
  if (isNav) countUp(root);
  $$('[data-tilt]', root).forEach(tilt);
  $$('.seg', root).forEach(layoutSeg);
  $$('img[data-photo]', root).forEach((img) => { if (img._h) return; img._h = true; B.photo(img.dataset.photo).then((d) => { if (d) { img.src = d; img.classList.add('ready'); } }).catch(() => {}); });
  if (isNav) {
    $$('.bar-fill', root).forEach((b, i) => { const h = b.style.getPropertyValue('--h'); b.style.setProperty('--h', '0%'); setTimeout(() => b.style.setProperty('--h', h), 80 + i * 35); });
    $$('.stamp.on', root).forEach((s, i) => { s.style.animationDelay = `${250 + i * 80}ms`; s.classList.add('pop'); });
    $$('.days .day.active', root).forEach((d) => d.scrollIntoView({ inline: 'center', block: 'nearest' }));
  }
  $$('[data-countdown]', root).forEach(tickCountdown);
}
function tilt(el) {
  if (el._tilt || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el._tilt = true;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    el.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
    el.style.setProperty('--gx', `${(x + .5) * 100}%`); el.style.setProperty('--gy', `${(y + .5) * 100}%`);
  });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
}
function layoutSeg(seg) { const a = $('.seg-btn.active', seg), th = $('.seg-thumb', seg); if (a && th) { th.style.width = a.offsetWidth + 'px'; th.style.transform = `translateX(${a.offsetLeft - 3}px)`; } }
function tickCountdown(el) {
  const t = Number(el.dataset.countdown) - Date.now();
  if (t <= 0) { el.textContent = '¡Es la hora!'; return; }
  const d = Math.floor(t / 864e5), h = Math.floor(t / 36e5) % 24, m = Math.floor(t / 6e4) % 60, s = Math.floor(t / 1e3) % 60;
  el.innerHTML = d ? `<span><b>${d}</b>días</span><span><b>${h}</b>h</span><span><b>${m}</b>min</span>` : `<span><b>${h}</b>h</span><span><b>${String(m).padStart(2, '0')}</b>min</span><span><b>${String(s).padStart(2, '0')}</b>s</span>`;
}
document.addEventListener('pointermove', (e) => { const el = e.target.closest && e.target.closest('.glass'); if (!el) return; const r = el.getBoundingClientRect(); el.style.setProperty('--mx', `${e.clientX - r.left}px`); el.style.setProperty('--my', `${e.clientY - r.top}px`); }, { passive: true });
function onScroll() { const n = $('.nav'); if (n) n.classList.toggle('scrolled', scrollY > 38); }
addEventListener('scroll', onScroll, { passive: true });

/* =========================================================
 * Piezas comunes
 * ========================================================= */
function nav(title, { back = false, right = '', sub = '' } = {}) {
  const bell = S.user && !isAdmin() && route().name !== 'notifs' ? `<a href="#/notifs" class="nav-btn bell" aria-label="Avisos">${I.bell}${unreadNotifs() ? '<b class="dot"></b>' : ''}</a>` : '';
  return `<header class="nav"><div class="nav-bar"><div class="nav-l">${back ? `<button class="nav-back" data-act="back">${I.back}<span>Atrás</span></button>` : ''}</div><div class="nav-title">${esc(title)}</div><div class="nav-r">${right}${bell}</div></div></header>
  <div class="large-head"><h1 class="large-title">${esc(title)}</h1>${sub ? `<p class="large-sub">${sub}</p>` : ''}</div>`;
}
const avatar = (u, s = 40) => `<span class="user-av" style="--s:${s}px">${u && u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : `<span>${esc(initials((u && u.name) || '?'))}</span>`}</span>`;
const barberAv = (b, s = 40) => `<span class="barber-av" style="--s:${s}px;--c:${esc(b.color || '#d4a24c')}">${b.photo ? `<img src="${esc(b.photo)}" alt="">` : `<span>${esc(initials(b.name))}</span>`}</span>`;
const shopAv = (s = 40) => `<span class="shop-av" style="--s:${s}px">${shop().logo ? `<img src="${esc(shop().logo)}" alt="">` : I.scissors}</span>`;
const empty = (icon, title, text, btn = '') => `<div class="empty rise"><div class="empty-ico">${I[icon]}</div><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>${btn}</div>`;
const seg = (name, val, opts) => `<div class="seg"><span class="seg-thumb"></span>${opts.map(([v, l]) => `<button class="seg-btn${v === val ? ' active' : ''}" data-act="seg" data-seg="${name}" data-val="${v}">${l}</button>`).join('')}</div>`;
const STATUS = { confirmada: 'Confirmada', completada: 'Completada', cancelada: 'Cancelada', noshow: 'No vino' };
const pill = (st) => `<span class="pill st-${st}">${STATUS[st] || st}</span>`;
const stars = (n) => `<span class="stars">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}">${i <= n ? I.starFill : I.star}</i>`).join('')}</span>`;
function openNow() {
  const sh = shop(), d = new Date(), t = nowMin();
  if ((sh.closed || []).includes(todayISO())) return { open: false, text: 'Cerrado hoy' };
  const iv = (sh.hours[d.getDay()] || []).map(([a, b]) => [toMin(a), toMin(b)]);
  const cur = iv.find(([a, b]) => t >= a && t < b);
  if (cur) return { open: true, text: `Abierto · cierra a las ${toHHMM(cur[1])}` };
  const next = iv.find(([a]) => a > t);
  return { open: false, text: next ? `Cerrado · abre a las ${toHHMM(next[0])}` : 'Cerrado por hoy' };
}
function bookingCard(b, i = 0, admin = false) {
  const br = barberById(b.barberId);
  const d = parseISO(b.date);
  const client = admin ? (userById(b.userId) || { name: b.clientName || 'Cliente' }) : null;
  return `<button class="glass bk rise" style="--i:${Math.min(i, 10)}" data-act="bk-menu" data-id="${b.id}">
    <span class="bk-date"><small>${MONTHS[d.getMonth()]}</small><b>${d.getDate()}</b><small>${esc(b.start)}</small></span>
    <span class="bk-body"><span class="bk-top">${pill(b.status)}<small class="muted cap">${fmtDay(b.date)}</small></span>
      <b>${esc(b.serviceName)}</b>
      <span class="bk-who">${admin ? `${avatar(client, 22)} ${esc(client.name)}` : `${barberAv(br, 22)} ${esc(b.barberName || br.name)}`} · <span class="muted">${fmtMoney(b.price)}</span></span>
      ${b.rating ? stars(b.rating) : ''}
    </span>${I.chevron}</button>`;
}

/* ---------- Motor de disponibilidad ---------- */
function openIntervals(iso) {
  const sh = shop();
  if ((sh.closed || []).includes(iso)) return [];
  return (sh.hours[parseISO(iso).getDay()] || []).map(([a, b]) => [toMin(a), toMin(b)]).filter(([a, b]) => b > a);
}
function watchDay(iso) {
  if (ui.slotsDay === iso) return;
  if (slotSub) slotSub();
  ui.slotsDay = iso; ui.slots = null;
  slotSub = B.watchSlots(iso, (l) => { ui.slots = l; schedule(); });
}
function freeTimes(iso, duration, barberId) {
  if (!ui.slots || ui.slotsDay !== iso) return null;
  const busy = new Set(ui.slots.map((s) => `${s.barberId}|${s.t}`));
  const wd = parseISO(iso).getDay();
  const cands = (barberId && barberId !== 'any' ? barbers().filter((b) => b.id === barberId) : barbers()).filter((b) => !b.days || b.days.includes(wd));
  const min = iso === todayISO() ? nowMin() + (Number(shop().lead) || 0) : -1;
  const out = [];
  openIntervals(iso).forEach(([a, b]) => {
    for (let t = a; t + duration <= b; t += STEP) {
      if (t < min) continue;
      const free = cands.filter((br) => { for (let m = t; m < t + duration; m += STEP) if (busy.has(`${br.id}|${toHHMM(m)}`)) return false; return true; });
      if (free.length) out.push({ t: toHHMM(t), barberId: free[0].id, n: free.length });
    }
  });
  return out;
}
function firstOpenDay() { for (let k = 0; k < 28; k++) { const d = addDays(todayISO(), k); if (openIntervals(d).length) return d; } return todayISO(); }

/* ---------- Estadísticas ---------- */
function statsFor(list) {
  const done = list.filter(isDone).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const t = todayISO(), m = monthKey(t);
  const prevM = monthKey(addDays(`${m}-01`, -1));
  const months = [];
  for (let k = 11; k >= 0; k--) { const d = parseISO(`${m}-01`); d.setMonth(d.getMonth() - k); months.push(isoOf(d).slice(0, 7)); }
  const perMonth = months.map((k) => ({ k, n: done.filter((b) => monthKey(b.date) === k).length }));
  const count = (key) => { const c = {}; done.forEach((b) => { c[b[key]] = (c[b[key]] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]); };
  let gap = 0;
  if (done.length > 1) { const ds = done.map((b) => parseISO(b.date).getTime()); gap = Math.max(1, Math.round((ds[ds.length - 1] - ds[0]) / 864e5 / (ds.length - 1))); }
  const last = done[done.length - 1];
  return {
    done, perMonth, gap, last,
    thisMonth: done.filter((b) => monthKey(b.date) === m).length,
    lastMonth: done.filter((b) => monthKey(b.date) === prevM).length,
    yearSpent: done.filter((b) => b.date.slice(0, 4) === t.slice(0, 4)).reduce((s, b) => s + (b.price || 0), 0),
    favService: count('serviceId')[0], favBarber: count('barberId')[0],
    next: last && gap ? addDays(last.date, gap) : null,
  };
}
function barChart(data, { valueKey = 'n', label = (d) => d.k, fmt = (v) => v, highlightLast = true } = {}) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  return `<div class="bars">${data.map((d, i) => `<div class="bar${highlightLast && i === data.length - 1 ? ' hl' : ''}"><span class="bar-val">${d[valueKey] ? fmt(d[valueKey]) : ''}</span><span class="bar-track"><span class="bar-fill" style="--h:${d[valueKey] ? Math.max(6, (d[valueKey] / max) * 100) : 0}%"></span></span><small>${label(d)}</small></div>`).join('')}</div>`;
}
const monthLabel = (d) => MONTHS[Number(d.k.slice(5)) - 1];

/* =========================================================
 * Acceso
 * ========================================================= */
function AuthView() {
  const login = ui.authTab === 'login';
  const sh = shop(), on = openNow();
  const svcs = S.services.filter((s) => s.active !== false).slice(0, 4);
  return {
    cls: 'auth', tabbar: false,
    html: `<div class="auth">
      <div class="auth-hero rise">
        ${sh.logo ? `<span class="shop-av hero-logo" style="--s:96px"><img src="${esc(sh.logo)}" alt=""></span>` : '<div class="pole"><span></span></div>'}
        <h1 class="brand-title">${esc(sh.name)}</h1>
        <p class="brand-sub">Reserva tu corte en segundos.</p>
        <span class="open-chip ${on.open ? 'on' : ''}"><i></i>${esc(on.text)}</span>
      </div>
      <div class="glass auth-card rise" style="--i:1">
        ${seg('authTab', ui.authTab, [['login', 'Entrar'], ['signup', 'Crear cuenta']])}
        <form class="form" id="auth-form" novalidate>
          ${login ? '' : `<label class="field"><span>Nombre</span><input name="name" data-keep="a-name" autocomplete="name" placeholder="Tu nombre" required></label>
          <label class="field"><span>Teléfono</span><input name="phone" data-keep="a-phone" type="tel" autocomplete="tel" placeholder="600 000 000"></label>`}
          <label class="field"><span>Correo electrónico</span><input name="email" data-keep="a-email" type="email" autocomplete="email" placeholder="tu@correo.com" required></label>
          <label class="field"><span>Contraseña</span><input name="password" data-keep="a-pw" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" placeholder="${login ? '••••••••' : 'Mínimo 6 caracteres'}" required></label>
          <p class="form-error" id="auth-error"></p>
          <button class="btn primary block lg">${login ? 'Entrar' : 'Crear mi cuenta'}</button>
          ${login ? '<button type="button" class="btn plain block" data-act="forgot">¿Has olvidado la contraseña?</button>' : ''}
        </form>
      </div>
      ${svcs.length ? `<div class="auth-services rise" style="--i:2">${svcs.map((s) => `<span class="glass mini-service"><b>${esc(s.name)}</b><small>${fmtMoney(s.price)} · ${s.duration} min</small></span>`).join('')}</div>` : ''}
    </div>`,
    mount() {
      const f = $('#auth-form');
      f.onsubmit = async (e) => {
        e.preventDefault();
        const err = $('#auth-error'), btn = f.querySelector('.btn.primary');
        err.textContent = ''; btn.classList.add('loading');
        try {
          if (!f.email.value.trim() || !f.password.value) throw new Error('Escribe tu correo y tu contraseña.');
          if (login) await B.signIn(f.email.value, f.password.value);
          else {
            if (!f.name.value.trim()) throw new Error('Escribe tu nombre.');
            await B.signUp({ name: f.name.value, email: f.email.value, password: f.password.value, phone: f.phone.value });
            toast('¡Bienvenido/a! Ya puedes reservar'); confetti();
          }
        } catch (ex) {
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
function clientView(r) {
  switch (r.name) {
    case 'book': return BookView(r.params);
    case 'appts': return ApptsView();
    case 'stats': return StatsView();
    case 'profile': return ProfileView();
    case 'notifs': return NotifsView();
    default: return HomeView();
  }
}

function HomeView() {
  const first = ((S.profile && S.profile.name) || '').split(' ')[0];
  const next = S.bookings.filter(isUpcoming)[0];
  const st = statsFor(S.bookings);
  const every = Number(shop().loyaltyEvery) || 10;
  const stamps = st.done.length % every;
  const on = openNow();
  const promos = S.notifs.filter((n) => n.to === 'all').slice(0, 2);
  const svcs = S.services.filter((s) => s.active !== false);
  let i = 0;
  let hero;
  if (next) {
    const br = barberById(next.barberId);
    const when = parseISO(next.date); const [hh, mm] = next.start.split(':').map(Number); when.setHours(hh, mm, 0, 0);
    hero = `<div class="hero-card rise" data-tilt style="--i:${i++}"><span class="hero-glare"></span>
      <small class="eyebrow-l">Tu próxima cita</small><h2>${esc(next.serviceName)}</h2>
      <p class="cap">${fmtDay(next.date)} · ${esc(next.start)}</p>
      <div class="hero-row">${barberAv(br, 28)}<span>con ${esc(next.barberName || br.name)}</span></div>
      <div class="countdown" data-countdown="${when.getTime()}"></div>
      <div class="hero-actions"><button class="btn glass-btn sm" data-act="ics" data-id="${next.id}">${I.calendar} Calendario</button><button class="btn glass-btn sm" data-act="bk-menu" data-id="${next.id}">${I.edit} Gestionar</button></div></div>`;
  } else {
    hero = `<a href="#/book" class="hero-card cta rise" data-tilt style="--i:${i++}"><span class="hero-glare"></span>
      <small class="eyebrow-l">${st.next && st.next <= addDays(todayISO(), 3) ? 'Te toca pasarte' : 'Reserva tu hora'}</small>
      <h2>${st.next ? (st.next <= todayISO() ? 'Según tu ritmo, ya te toca' : `Según tu ritmo, te toca el ${fmtDate(st.next, { day: 'numeric', month: 'long' })}`) : '¿Corte nuevo?'}</h2>
      <p>Elige servicio, barbero y hora. Solo verás huecos libres.</p>
      <span class="btn primary">${I.scissors} Reservar ahora</span></a>`;
  }
  return {
    tabbar: true, cls: 'home',
    html: `<div class="page">
      ${nav(`${greeting()}${first ? ', ' + first : ''}`, { sub: `<span class="open-chip ${on.open ? 'on' : ''}"><i></i>${esc(on.text)}</span>` })}
      ${hero}
      ${st.last && !next ? `<button class="glass row-card rise" style="--i:${i++}" data-act="repeat"><span class="row-ico" style="--c:#d4a24c">${I.repeat}</span><span class="grow"><b>Repetir mi último corte</b><small class="muted">${esc(st.last.serviceName)} con ${esc(st.last.barberName || barberById(st.last.barberId).name)}</small></span>${I.chevron}</button>` : ''}
      <div class="mini-stats rise" style="--i:${i++}">
        <a href="#/stats" class="glass mini-stat"><b data-count="${st.thisMonth}">${st.thisMonth}</b><small>cortes este mes</small></a>
        <a href="#/stats" class="glass mini-stat"><b>${stamps}<i>/${every}</i></b><small>sellos de fidelidad</small></a>
        <a href="#/stats" class="glass mini-stat"><b>${st.gap ? st.gap + '<i>d</i>' : '—'}</b><small>tu ritmo</small></a>
      </div>
      ${promos.length ? `<section class="sec"><div class="sec-head"><h2>Novedades</h2></div><div class="stack">${promos.map((n) => `<a href="#/book" class="glass promo rise" style="--i:${i++}"><span class="row-ico" style="--c:#ff375f">${I.megaphone}</span><span class="grow"><b>${esc(n.title)}</b><small>${esc(n.body)}</small></span></a>`).join('')}</div></section>` : ''}
      <section class="sec"><div class="sec-head"><h2>Servicios</h2><a href="#/book">Reservar</a></div>
        ${svcs.length ? `<div class="service-rail no-scrollbar">${svcs.map((s) => `<a href="#/book?s=${s.id}" class="glass service-card rise" style="--i:${i++}"><span class="svc-ico">${I.scissors}</span><b>${esc(s.name)}</b><small class="muted">${s.duration} min</small><span class="price">${fmtMoney(s.price)}</span></a>`).join('')}</div>` : '<p class="muted">La barbería aún no ha publicado sus servicios.</p>'}
      </section>
      ${shopCard(i++)}
    </div>`,
  };
}
function shopCard(i = 0) {
  const sh = shop();
  const hours = [1, 2, 3, 4, 5, 6, 0].map((d) => `<span class="${new Date().getDay() === d ? 'today' : ''}"><b>${DAYS[d].slice(0, 3)}</b>${(sh.hours[d] || []).length ? sh.hours[d].map(([a, b]) => `${a}–${b}`).join(' · ') : 'Cerrado'}</span>`).join('');
  return `<section class="sec"><div class="glass shop-card rise" style="--i:${i}">
    <div class="shop-top">${shopAv(48)}<div class="grow"><b>${esc(sh.name)}</b><small class="muted">${esc(sh.address || 'Tu barbería de confianza')}</small></div>${sh.address ? `<a class="btn glass-btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sh.address)}">${I.pin} Ir</a>` : ''}</div>
    <div class="hours">${hours}</div>
    ${sh.phone || sh.instagram ? `<div class="shop-links">${sh.phone ? `<a class="chip" href="tel:${esc(sh.phone.replace(/\s/g, ''))}">${I.phone}${esc(sh.phone)}</a>` : ''}${sh.instagram ? `<a class="chip" target="_blank" rel="noopener" href="https://instagram.com/${esc(sh.instagram.replace('@', ''))}">@${esc(sh.instagram.replace('@', ''))}</a>` : ''}</div>` : ''}
  </div></section>`;
}

/* ---------- Reserva ---------- */
function BookView(params) {
  const bk = ui.bk;
  if (params.s && bk._p !== params.s) { bk.serviceId = params.s; bk._p = params.s; bk.time = null; }
  const services = S.services.filter((s) => s.active !== false);
  const svc = serviceById(bk.serviceId);
  if (!bk.barberId || (bk.barberId !== 'any' && !barbers().some((b) => b.id === bk.barberId))) bk.barberId = barbers().length > 1 ? 'any' : barbers()[0].id;
  if (!bk.day || bk.day < todayISO()) bk.day = firstOpenDay();
  if (svc) watchDay(bk.day);
  const times = svc ? freeTimes(bk.day, svc.duration, bk.barberId) : [];
  if (bk.time && times && !times.some((t) => t.t === bk.time)) bk.time = null;
  const days = Array.from({ length: 28 }, (_, k) => addDays(todayISO(), k));
  const morning = (times || []).filter((t) => toMin(t.t) < 14 * 60), afternoon = (times || []).filter((t) => toMin(t.t) >= 14 * 60);
  const chosen = times && bk.time ? times.find((t) => t.t === bk.time) : null;
  const multi = barbers().length > 1;
  const slotBtns = (arr) => arr.map((t) => `<button class="slot${bk.time === t.t ? ' active' : ''}" data-act="pick-time" data-t="${t.t}">${t.t}</button>`).join('');
  return {
    tabbar: !chosen, cls: 'book',
    html: `<div class="page book-page${chosen ? ' has-bar' : ''}">
      ${nav('Reservar', { sub: `Servicio, ${multi ? 'barbero, ' : ''}día y hora. Así de fácil.` })}
      ${bk.note ? `<div class="glass row-card rise"><span class="row-ico" style="--c:#d4a24c">${I.repeat}</span><span class="grow"><b>${esc(bk.note)}</b><small class="muted">Se lo diremos al barbero</small></span></div>` : ''}
      ${!services.length ? empty('scissors', 'Aún no hay servicios', 'La barbería todavía no ha publicado sus servicios. Vuelve pronto.') : `
      <section class="step rise"><h3><i>1</i> Servicio</h3>
        <div class="svc-list">${services.map((s) => `<button class="glass svc${bk.serviceId === s.id ? ' active' : ''}" data-act="pick-svc" data-id="${s.id}"><span class="svc-ico">${I.scissors}</span><span class="grow"><b>${esc(s.name)}</b><small class="muted">${s.duration} min${s.desc ? ' · ' + esc(s.desc) : ''}</small></span><span class="price">${fmtMoney(s.price)}</span><span class="radio"></span></button>`).join('')}</div>
      </section>
      ${svc ? `
      ${multi ? `<section class="step rise" style="--i:1"><h3><i>2</i> Barbero</h3>
        <div class="barber-row no-scrollbar">
          <button class="barber-pick${bk.barberId === 'any' ? ' active' : ''}" data-act="pick-barber" data-id="any"><span class="barber-av any" style="--s:58px">${I.sparkle}</span><small>Sin preferencia</small></button>
          ${barbers().map((b) => `<button class="barber-pick${bk.barberId === b.id ? ' active' : ''}" data-act="pick-barber" data-id="${b.id}">${barberAv(b, 58)}<small>${esc(b.name)}</small></button>`).join('')}
        </div></section>` : ''}
      <section class="step rise" style="--i:2"><h3><i>${multi ? 3 : 2}</i> Día</h3>
        <div class="days no-scrollbar">${days.map((d) => { const dt = parseISO(d); const closed = !openIntervals(d).length; return `<button class="day${d === bk.day ? ' active' : ''}${closed ? ' closed' : ''}${d === todayISO() ? ' today' : ''}" data-act="pick-day" data-day="${d}" ${closed ? 'disabled' : ''}><small>${DAYS[dt.getDay()].slice(0, 3)}</small><b>${dt.getDate()}</b><small class="m">${MONTHS[dt.getMonth()]}</small></button>`; }).join('')}</div>
      </section>
      <section class="step rise" style="--i:3"><h3><i>${multi ? 4 : 3}</i> Hora <small class="muted cap">· ${fmtDay(bk.day)}</small></h3>
        ${times === null ? `<div class="slots">${'<span class="slot sk"></span>'.repeat(8)}</div>`
          : times.length ? `${morning.length ? `<p class="slot-group">${I.sun} Mañana</p><div class="slots">${slotBtns(morning)}</div>` : ''}${afternoon.length ? `<p class="slot-group">${I.moon} Tarde</p><div class="slots">${slotBtns(afternoon)}</div>` : ''}`
          : `<div class="glass row-card muted-card">${I.clock}<span>No quedan huecos este día. Prueba otro día${multi && bk.barberId !== 'any' ? ' u otro barbero' : ''}.</span></div>`}
      </section>` : ''}`}
      ${chosen ? `<div class="book-bar glass">
        <div class="grow"><b>${esc(svc.name)} · ${fmtMoney(svc.price)}</b><small class="cap">${fmtDay(bk.day)} · ${bk.time}${multi ? ' · ' + esc(barberById(bk.barberId === 'any' ? chosen.barberId : bk.barberId).name) : ''}</small></div>
        <button class="btn primary lg" data-act="confirm-book">Reservar</button>
      </div>` : ''}
    </div>`,
  };
}
async function confirmBook(el) {
  const bk = ui.bk, svc = serviceById(bk.serviceId);
  const t = (freeTimes(bk.day, svc.duration, bk.barberId) || []).find((x) => x.t === bk.time);
  if (!t) return toast('Ese hueco ya no está libre. Elige otra hora.', 'error');
  const barberId = bk.barberId === 'any' ? t.barberId : bk.barberId;
  const br = barberById(barberId);
  el.classList.add('loading');
  try {
    const id = await B.book({ userId: S.user.uid, clientName: (S.profile && S.profile.name) || '', clientPhone: (S.profile && S.profile.phone) || '', serviceId: svc.id, serviceName: svc.name, price: Number(svc.price) || 0, duration: svc.duration, barberId, barberName: br.name, date: bk.day, start: bk.time, end: toHHMM(toMin(bk.time) + svc.duration), note: bk.note || '' });
    B.notify('owner', 'Nueva reserva', `${(S.profile && S.profile.name) || 'Un cliente'} · ${svc.name} · ${fmtDate(bk.day, { weekday: 'short', day: 'numeric', month: 'short' })} ${bk.time}${barbers().length > 1 ? ' · ' + br.name : ''}${bk.note ? ' · ' + bk.note : ''}`, { link: '#/' });
    ui.bk = {};
    confetti(); haptic([10, 40, 10]);
    go('#/appts');
    setTimeout(() => successSheet(id), 350);
  } catch (ex) { el.classList.remove('loading'); toast(ex.message, 'error'); }
}
function successSheet(id) {
  const h = openSheet(`<div class="success">
    <div class="check-anim"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>
    <h2>¡Reserva confirmada!</h2><p class="muted">Te esperamos. Si no puedes venir, cancélala desde «Citas».</p>
    <div class="grid2"><button class="btn glass-btn" data-x="ics">${I.calendar} Calendario</button><button class="btn primary" data-x="ok">Perfecto</button></div>
    ${!pushEnabled() ? `<button class="btn plain block" data-x="push">${I.bell} Avisarme de mis citas</button>` : ''}
  </div>`);
  h.el.querySelector('[data-x="ok"]').onclick = () => h.close();
  h.el.querySelector('[data-x="ics"]').onclick = () => exportIcs(id);
  const p = h.el.querySelector('[data-x="push"]');
  if (p) p.onclick = () => { h.close(); enableNotifications(); };
}
function exportIcs(id) {
  const b = S.bookings.find((x) => x.id === id);
  if (!b) return;
  downloadBlob(new Blob([icsFor({ title: `${b.serviceName} · ${shop().name}`, date: b.date, time: b.start, description: `Con ${b.barberName}`, location: shop().address || shop().name })], { type: 'text/calendar' }), 'cita.ics');
}

/* ---------- Citas del cliente ---------- */
function ApptsView() {
  const up = S.bookings.filter(isUpcoming);
  const past = S.bookings.filter((b) => !isUpcoming(b)).reverse();
  const tab = ui.apptTab;
  const list = tab === 'up' ? up : past;
  return {
    tabbar: true, cls: 'appts',
    html: `<div class="page">
      ${nav('Mis citas', { right: `<a class="nav-btn" href="#/book" aria-label="Reservar">${I.plus}</a>` })}
      ${seg('apptTab', tab, [['up', `Próximas${up.length ? ' · ' + up.length : ''}`], ['past', 'Historial']])}
      <div class="stack gap-top">${list.map((b, i) => bookingCard(b, i)).join('') || empty('calendar', tab === 'up' ? 'No tienes citas próximas' : 'Aún no hay historial', tab === 'up' ? 'Reserva en segundos y te avisaremos antes de tu cita.' : 'Aquí verás tus cortes anteriores.', tab === 'up' ? '<a class="btn primary" href="#/book">Reservar ahora</a>' : '')}</div>
    </div>`,
  };
}

/* ---------- Mi estilo (estadísticas) ---------- */
function StatsView() {
  const st = statsFor(S.bookings);
  const every = Number(shop().loyaltyEvery) || 10;
  const stamps = st.done.length % every, free = Math.floor(st.done.length / every);
  const delta = st.thisMonth - st.lastMonth;
  const fsName = st.favService ? ((serviceById(st.favService[0]) || {}).name || (st.done.find((b) => b.serviceId === st.favService[0]) || {}).serviceName) : '';
  const fb = st.favBarber && barberById(st.favBarber[0]);
  const photos = S.bookings.filter((b) => b.photoId).reverse();
  return {
    tabbar: true, cls: 'stats',
    html: `<div class="page">
      ${nav('Mi estilo', { sub: 'Tus cortes, tu ritmo y tus recompensas.' })}
      <div class="glass big-stat rise">
        <small class="eyebrow-l">Cortes este mes</small>
        <div class="big-num"><b data-count="${st.thisMonth}">${st.thisMonth}</b>${delta ? `<span class="pill ${delta > 0 ? 'st-completada' : 'st-cancelada'}">${delta > 0 ? '+' : ''}${delta} vs mes pasado</span>` : ''}</div>
        ${barChart(st.perMonth, { label: monthLabel })}
      </div>
      <div class="kpis">
        <div class="glass kpi rise" style="--i:1"><span class="row-ico" style="--c:#30d158">${I.euro}</span><b data-count="${st.yearSpent}" data-money="1">${fmtMoney(st.yearSpent)}</b><small>gastado este año</small></div>
        <div class="glass kpi rise" style="--i:2"><span class="row-ico" style="--c:#0a84ff">${I.clock}</span><b>${st.gap ? `${st.gap} días` : '—'}</b><small>cada cuánto te cortas</small></div>
        <div class="glass kpi rise" style="--i:3"><span class="row-ico" style="--c:#d4a24c">${I.scissors}</span><b>${esc(fsName || '—')}</b><small>tu servicio favorito</small></div>
        <div class="glass kpi rise" style="--i:4"><span class="row-ico" style="--c:#bf5af2">${I.crown}</span><b>${fb && barbers().length > 1 ? esc(fb.name) : st.done.length}</b><small>${fb && barbers().length > 1 ? 'tu barbero favorito' : 'cortes en total'}</small></div>
      </div>
      ${st.next ? `<div class="glass row-card rise" style="--i:5"><span class="row-ico" style="--c:#ff9f0a">${I.sparkle}</span><span class="grow"><b>${st.next <= todayISO() ? 'Ya te toca pasarte' : `Te toca el ${fmtDate(st.next, { weekday: 'long', day: 'numeric', month: 'long' })}`}</b><small class="muted">Calculado con tu ritmo de cada ${st.gap} días</small></span><button class="btn primary sm" data-act="repeat">Reservar</button></div>` : ''}
      <section class="sec"><div class="sec-head"><h2>Tarjeta de fidelidad</h2></div>
        <div class="loyalty rise" data-tilt>
          <span class="hero-glare"></span>
          <div class="loyalty-top"><b>${esc(shop().name)}</b><span>${free ? `${free} corte${free > 1 ? 's' : ''} gratis ganado${free > 1 ? 's' : ''}` : 'Club de clientes'}</span></div>
          <div class="stamps">${Array.from({ length: every }, (_, k) => `<span class="stamp${k < stamps ? ' on' : ''}${k === every - 1 ? ' gift' : ''}">${k === every - 1 ? I.gift : I.scissors}</span>`).join('')}</div>
          <p>${stamps === every - 1 ? '¡Tu próximo corte es gratis!' : `Te ${every - 1 - stamps === 1 ? 'falta 1 sello' : `faltan ${every - 1 - stamps} sellos`} para un corte gratis.`}</p>
        </div>
      </section>
      <section class="sec"><div class="sec-head"><h2>Mis cortes</h2></div>
        ${photos.length ? `<div class="gallery">${photos.map((b, k) => `<button class="shot rise" style="--i:${k}" data-act="view-photo" data-id="${b.id}"><img data-photo="${b.photoId}" alt=""><span>${fmtDate(b.date, { day: 'numeric', month: 'short' })}</span></button>`).join('')}</div>`
          : `<div class="glass row-card muted-card">${I.camera}<span>Cuando la barbería suba la foto de tu corte aparecerá aquí, para que puedas pedir «el mismo de la última vez».</span></div>`}
      </section>
    </div>`,
  };
}

/* ---------- Avisos ---------- */
const pushEnabled = () => 'Notification' in window && Notification.permission === 'granted';
function NotifsView() {
  const seenAt = (S.profile && S.profile.notifSeenAt) || 0;
  const list = S.notifs.filter((n) => n.from !== S.user.uid || n.to === 'all');
  return {
    tabbar: true, cls: 'notifs',
    html: `<div class="page">
      ${nav('Avisos', { back: !isAdmin() })}
      ${isAdmin() ? `<button class="glass add-row rise" data-act="promo"><span class="row-ico" style="--c:#ff375f">${I.megaphone}</span><span class="grow"><b>Enviar una promoción</b><small class="muted">Llega como notificación a todos tus clientes</small></span>${I.chevron}</button>` : ''}
      ${list.length ? `<div class="glass list rise">${list.map((n) => `<a class="row${n.createdAt > seenAt && n.from !== S.user.uid ? ' unread' : ''}" href="${esc(n.link || '#/')}"><span class="row-ico" style="--c:${n.to === 'all' ? '#ff375f' : '#d4a24c'}">${n.to === 'all' ? I.megaphone : I.bell}</span><span class="grow"><span class="row-title"><b>${esc(n.title)}</b><small class="muted">${timeAgo(n.createdAt)}</small></span><small class="row-sub">${esc(n.body)}</small></span></a>`).join('')}</div>`
        : empty('bell', 'Sin avisos', isAdmin() ? 'Aquí verás las reservas, cancelaciones y valoraciones al momento.' : 'Aquí te avisaremos de tus citas y de las promociones.')}
      ${!pushEnabled() ? `<button class="btn glass-btn block gap-top" data-act="enable-push">${I.bell} Activar notificaciones en este móvil</button>` : ''}
    </div>`,
    mount() { if (unreadNotifs()) B.saveProfile({ notifSeenAt: Date.now() }).catch(() => {}); },
  };
}

/* ---------- Perfil ---------- */
function ProfileView() {
  const p = S.profile || {};
  const st = statsFor(S.bookings);
  return {
    tabbar: true, cls: 'profile',
    html: `<div class="page">
      ${nav('Perfil')}
      <div class="glass profile-card rise">
        <button class="profile-photo" data-act="avatar">${avatar(p, 80)}<span class="cam">${I.camera}</span></button>
        <div class="grow"><h2>${esc(p.name || '')}</h2><p class="muted">${esc(S.user.email)}</p><p class="tiny muted">${st.done.length} cortes · cliente desde ${new Date(p.createdAt || Date.now()).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</p></div>
        <input type="file" accept="image/*" id="avatar-input" hidden>
      </div>
      <form class="glass list form-list rise" style="--i:1" id="profile-form">
        <label class="row field-row"><span>Nombre</span><input name="name" data-keep="p-name" value="${esc(p.name || '')}" required></label>
        <label class="row field-row"><span>Teléfono</span><input name="phone" data-keep="p-phone" type="tel" value="${esc(p.phone || '')}" placeholder="Añadir"></label>
        <div class="row"><button class="btn primary sm ml-auto">Guardar</button></div>
      </form>
      <div class="glass list rise" style="--i:2">
        <button class="row" data-act="enable-push"><span class="row-ico" style="--c:#ff375f">${I.bell}</span><span class="grow"><b>Notificaciones</b><small class="muted">${pushEnabled() ? 'Activadas en este dispositivo' : 'Recibe avisos de tus citas y promociones'}</small></span>${pushEnabled() ? '<span class="pill st-completada">Activas</span>' : I.chevron}</button>
        <div class="row"><span class="row-ico" style="--c:#0a84ff">${I.bolt}</span><span class="grow"><b>Instalar la app</b><small class="muted">iPhone: Safari → Compartir → Añadir a pantalla de inicio · Android: ⋮ → Instalar app</small></span></div>
        ${S.ownerExists === false ? `<button class="row" data-act="claim-admin"><span class="row-ico" style="--c:#d4a24c">${I.key}</span><span class="grow"><b>Soy el administrador</b><small class="muted">Requiere la súper contraseña</small></span>${I.chevron}</button>` : ''}
        <button class="row" data-act="logout"><span class="row-ico" style="--c:#8e8e93">${I.logout}</span><span class="grow"><b>Cerrar sesión</b></span></button>
      </div>
      ${shopCard(3)}
    </div>`,
    mount() {
      $('#profile-form').onsubmit = async (e) => { e.preventDefault(); try { await B.saveProfile({ name: e.target.name.value.trim(), phone: e.target.phone.value.trim() }); toast('Perfil guardado'); } catch (ex) { toast(ex.message, 'error'); } };
      $('#avatar-input').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { await B.saveProfile({ avatar: await compressImage(f, 320, 0.82) }); toast('Foto actualizada'); } catch (ex) { toast(ex.message, 'error'); } };
    },
  };
}

/* =========================================================
 * ADMINISTRADOR
 * ========================================================= */
function adminView(r) {
  switch (r.name) {
    case 'dash': return DashView();
    case 'clients': return ClientsView();
    case 'client': return ClientView(r.id);
    case 'notifs': return NotifsView();
    case 'settings': return SettingsView();
    default: return AgendaView();
  }
}

function AgendaView() {
  const day = ui.day;
  const list = S.bookings.filter((b) => b.date === day && b.status !== 'cancelada').sort((a, b) => a.start.localeCompare(b.start));
  const active = list.filter((b) => b.status !== 'noshow');
  const income = active.reduce((s, b) => s + (b.price || 0), 0);
  const wd = parseISO(day).getDay();
  const opens = openIntervals(day).reduce((s, [a, b]) => s + (b - a), 0) * Math.max(1, barbers().filter((b) => !b.days || b.days.includes(wd)).length);
  const used = active.reduce((s, b) => s + (b.duration || 0), 0);
  const occ = opens ? Math.min(100, Math.round((used / opens) * 100)) : 0;
  const days = Array.from({ length: 35 }, (_, k) => addDays(todayISO(), k - 7));
  const nowBlock = day === todayISO() ? list.find((b) => b.status === 'confirmada' && toMin(b.start) <= nowMin() && toMin(b.end) > nowMin()) : null;
  const multi = barbers().length > 1;
  return {
    tabbar: true, cls: 'agenda',
    html: `<div class="page wide">
      ${nav('Agenda', { sub: `<span class="cap">${fmtDay(day)}</span>`, right: `<button class="nav-btn" data-act="admin-book" aria-label="Nueva cita">${I.plus}</button>` })}
      ${!S.services.length ? `<a href="#/settings" class="glass row-card warn-card rise"><span class="row-ico" style="--c:#ff9f0a">${I.info}</span><span class="grow"><b>Empieza creando tus servicios</b><small class="muted">Sin servicios tus clientes no pueden reservar. Ve a Ajustes.</small></span>${I.chevron}</a>` : ''}
      <div class="days no-scrollbar rise">${days.map((d) => { const dt = parseISO(d); const n = S.bookings.filter((b) => b.date === d && b.status === 'confirmada').length; return `<button class="day${d === day ? ' active' : ''}${d === todayISO() ? ' today' : ''}${openIntervals(d).length ? '' : ' closed'}" data-act="agenda-day" data-day="${d}"><small>${DAYS[dt.getDay()].slice(0, 3)}</small><b>${dt.getDate()}</b>${n ? `<i>${n}</i>` : '<i class="none"></i>'}</button>`; }).join('')}</div>
      <div class="kpi-row rise" style="--i:1">
        <div class="glass kpi-s"><b data-count="${list.length}">${list.length}</b><small>citas</small></div>
        <div class="glass kpi-s"><b data-count="${income}" data-money="1">${fmtMoney(income)}</b><small>previsto</small></div>
        <div class="glass kpi-s"><b>${occ}%</b><small>ocupación</small><span class="occ" style="--p:${occ}%"></span></div>
      </div>
      ${nowBlock ? `<div class="now-card glass rise" style="--i:2"><span class="live"></span><span class="grow"><small>Ahora mismo</small><b>${esc((userById(nowBlock.userId) || { name: nowBlock.clientName }).name)} · ${esc(nowBlock.serviceName)}</b></span><small class="muted">hasta las ${nowBlock.end}</small></div>` : ''}
      ${!openIntervals(day).length ? `<div class="glass row-card muted-card rise">${I.moon}<span>Día cerrado.${list.length ? ' Aun así hay citas.' : ''}</span></div>` : ''}
      <div class="timeline-agenda">${list.map((b, i) => { const c = userById(b.userId) || { name: b.clientName || 'Cliente' }; const br = barberById(b.barberId); const past = day < todayISO() || (day === todayISO() && toMin(b.end) <= nowMin()); return `
        <div class="ag-item rise ${b.status}${past ? ' past' : ''}" style="--i:${Math.min(i, 10)};--c:${esc(br.color || '#d4a24c')}">
          <div class="ag-time"><b>${b.start}</b><small>${b.end}</small></div>
          <button class="glass ag-card" data-act="bk-menu" data-id="${b.id}">
            <span class="ag-top">${avatar(c, 34)}<span class="grow"><b>${esc(c.name)}</b><small class="muted">${esc(b.serviceName)} · ${b.duration} min${multi ? ' · ' + esc(b.barberName || br.name) : ''}</small></span><span class="price">${fmtMoney(b.price)}</span></span>
            <span class="ag-foot">${pill(b.status)}${b.photoId ? `<span class="pill">${I.camera}</span>` : ''}${b.rating ? stars(b.rating) : ''}${b.note ? `<small class="muted">«${esc(b.note)}»</small>` : ''}</span>
          </button>
        </div>`; }).join('') || (openIntervals(day).length ? empty('calendar', 'Sin citas', 'Este día aún no tiene reservas.', '<button class="btn glass-btn" data-act="admin-book">Añadir cita</button>') : '')}</div>
    </div>`,
  };
}

function DashView() {
  const all = S.bookings;
  const done = all.filter(isDone);
  const t = todayISO(), m = monthKey(t), prevM = monthKey(addDays(`${m}-01`, -1));
  const sum = (l) => l.reduce((s, b) => s + (b.price || 0), 0);
  const monthDone = done.filter((b) => monthKey(b.date) === m), prevDone = done.filter((b) => monthKey(b.date) === prevM);
  const months = [];
  for (let k = 5; k >= 0; k--) { const d = parseISO(`${m}-01`); d.setMonth(d.getMonth() - k); const key = isoOf(d).slice(0, 7); months.push({ k: key, eur: sum(done.filter((b) => monthKey(b.date) === key)) }); }
  const last14 = Array.from({ length: 14 }, (_, k) => { const d = addDays(t, k - 13); return { k: d, n: all.filter((b) => b.date === d && b.status !== 'cancelada').length }; });
  const wd = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ k: DAYS[d].slice(0, 2), n: done.filter((b) => parseISO(b.date).getDay() === d).length }));
  const hours = Array.from({ length: 12 }, (_, k) => ({ k: `${9 + k}h`, n: done.filter((b) => Math.floor(toMin(b.start) / 60) === 9 + k).length }));
  const svcCount = {}; done.forEach((b) => { svcCount[b.serviceName] = (svcCount[b.serviceName] || 0) + 1; });
  const topSvc = Object.entries(svcCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxSvc = Math.max(1, ...topSvc.map((x) => x[1]));
  const newClients = S.users.filter((u) => u.id !== S.user.uid && u.createdAt && monthKey(isoOf(new Date(u.createdAt))) === m).length;
  const rated = all.filter((b) => b.rating);
  const avg = rated.length ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1).replace('.', ',') : '—';
  const past = all.filter((b) => b.date < t && ['completada', 'noshow', 'confirmada'].includes(b.status));
  const noshow = past.length ? Math.round((past.filter((b) => b.status === 'noshow').length / past.length) * 100) : 0;
  const diff = sum(prevDone) ? Math.round(((sum(monthDone) - sum(prevDone)) / sum(prevDone)) * 100) : null;
  const byBarber = barbers().map((b) => ({ k: b.name, eur: sum(monthDone.filter((x) => x.barberId === b.id)), c: b.color }));
  const maxB = Math.max(1, ...byBarber.map((x) => x.eur));
  const reviews = all.filter((b) => b.review).sort((a, b) => (b.ratedAt || 0) - (a.ratedAt || 0)).slice(0, 3);
  const card = (icon, color, val, label, extra = '', i = 0, money = false) => `<div class="glass stat rise" style="--i:${i};--c:${color}"><span class="stat-ico">${I[icon]}</span><b ${typeof val === 'number' ? `data-count="${val}"` : ''} ${money ? 'data-money="1"' : ''}>${money ? fmtMoney(val) : val}</b><small>${label}</small>${extra}</div>`;
  return {
    tabbar: true, cls: 'dash',
    html: `<div class="page wide">
      ${nav('Panel', { sub: `<span class="cap">${new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>` })}
      <div class="stats">
        ${card('euro', '#30d158', sum(monthDone), 'Ingresos del mes', diff !== null ? `<span class="pill ${diff >= 0 ? 'st-completada' : 'st-cancelada'}">${diff >= 0 ? '+' : ''}${diff}% vs mes pasado</span>` : '', 0, true)}
        ${card('scissors', '#d4a24c', monthDone.length, 'Servicios este mes', '', 1)}
        ${card('people', '#0a84ff', newClients, 'Clientes nuevos', '', 2)}
        ${card('star', '#ffd60a', avg, 'Valoración media', `<small class="muted">${rated.length} opiniones</small>`, 3)}
        ${card('info', '#ff375f', noshow + '%', 'No se presentan', '', 4)}
      </div>
      <div class="cols">
        <div class="glass panel rise"><div class="panel-head"><h3>${I.euro} Ingresos por mes</h3></div>${barChart(months, { valueKey: 'eur', label: monthLabel, fmt: (v) => Math.round(v) + '€' })}</div>
        <div class="glass panel rise" style="--i:1"><div class="panel-head"><h3>${I.calendar} Reservas · últimos 14 días</h3></div>${barChart(last14, { label: (d) => parseISO(d.k).getDate() })}</div>
        <div class="glass panel rise" style="--i:2"><div class="panel-head"><h3>${I.clock} Horas punta</h3></div>${barChart(hours, { highlightLast: false })}</div>
        <div class="glass panel rise" style="--i:3"><div class="panel-head"><h3>${I.chart} Días más fuertes</h3></div>${barChart(wd, { highlightLast: false })}</div>
        <div class="glass panel rise" style="--i:4"><div class="panel-head"><h3>${I.scissors} Servicios más pedidos</h3></div>
          ${topSvc.length ? `<div class="hbars">${topSvc.map(([n, c]) => `<div class="hbar"><span>${esc(n)}</span><span class="hbar-track"><span class="bar-fill" style="--h:${(c / maxSvc) * 100}%"></span></span><b>${c}</b></div>`).join('')}</div>` : '<p class="muted">Aún no hay datos. Aparecerán con las primeras citas.</p>'}</div>
        ${barbers().length > 1 ? `<div class="glass panel rise" style="--i:5"><div class="panel-head"><h3>${I.crown} Ingresos por barbero (mes)</h3></div><div class="hbars">${byBarber.map((b) => `<div class="hbar"><span>${esc(b.k)}</span><span class="hbar-track"><span class="bar-fill" style="--h:${(b.eur / maxB) * 100}%;background:${esc(b.c || '')}"></span></span><b>${Math.round(b.eur)}€</b></div>`).join('')}</div></div>` : ''}
        ${reviews.length ? `<div class="glass panel rise" style="--i:6"><div class="panel-head"><h3>${I.star} Últimas opiniones</h3></div>${reviews.map((b) => `<div class="review">${stars(b.rating)}<p>«${esc(b.review)}»</p><small class="muted">${esc((userById(b.userId) || { name: b.clientName }).name)} · ${esc(b.serviceName)}</small></div>`).join('')}</div>` : ''}
      </div>
    </div>`,
  };
}

function ClientsView() {
  const q = ui.q.toLowerCase();
  const rows = S.users.filter((u) => u.id !== S.user.uid).map((u) => {
    const l = S.bookings.filter((b) => b.userId === u.id);
    const d = l.filter(isDone);
    return { u, visits: d.length, spent: d.reduce((s, b) => s + (b.price || 0), 0), last: d.length ? d[d.length - 1].date : '', next: l.find(isUpcoming) };
  }).filter(({ u }) => !q || [u.name, u.phone].join(' ').toLowerCase().includes(q)).sort((a, b) => (b.last || '').localeCompare(a.last || '') || (a.u.name || '').localeCompare(b.u.name || ''));
  return {
    tabbar: true, cls: 'clients',
    html: `<div class="page">
      ${nav('Clientes', { sub: `${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'}` })}
      <label class="search glass rise">${I.search}<input data-keep="search" data-input="q" value="${esc(ui.q)}" placeholder="Buscar por nombre o teléfono" autocomplete="off"></label>
      ${rows.length ? `<div class="glass list rise">${rows.map(({ u, visits, spent, last, next }) => `<a class="row" href="#/client/${u.id}">${avatar(u, 46)}<span class="grow"><b>${esc(u.name || 'Sin nombre')}</b><small class="muted">${visits} visitas · ${fmtMoney(spent)}${last ? ' · última ' + fmtDate(last, { day: 'numeric', month: 'short' }) : ''}</small></span>${next ? `<span class="pill st-confirmada">${fmtDate(next.date, { day: 'numeric', month: 'short' })}</span>` : I.chevron}</a>`).join('')}</div>`
        : empty('people', ui.q ? 'Sin resultados' : 'Sin clientes todavía', ui.q ? 'Prueba con otro nombre.' : 'Comparte el enlace de la app: cuando tus clientes creen su cuenta aparecerán aquí.', ui.q ? '' : `<button class="btn primary" data-act="copy-link">${I.copy} Copiar enlace</button>`)}
    </div>`,
  };
}

function ClientView(uid) {
  const u = userById(uid);
  if (!u) return { tabbar: true, html: `<div class="page">${nav('Cliente', { back: true })}${empty('person', 'No encontrado', 'Este cliente ya no existe.')}</div>` };
  const l = S.bookings.filter((b) => b.userId === uid);
  const st = statsFor(l);
  const note = (S.notes.find((n) => n.id === uid) || {}).text || '';
  const wa = u.phone ? u.phone.replace(/\D/g, '').replace(/^(\d{9})$/, '34$1') : '';
  return {
    tabbar: true, cls: 'client',
    html: `<div class="page">
      ${nav(u.name || 'Cliente', { back: true, right: `<button class="nav-btn" data-act="admin-book" data-user="${uid}" aria-label="Reservar">${I.plus}</button>` })}
      <div class="glass profile-card rise">${avatar(u, 70)}<div class="grow"><h2>${esc(u.name)}</h2><p class="muted">Cliente desde ${new Date(u.createdAt || Date.now()).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</p>
        ${u.phone ? `<div class="shop-links"><a class="chip" href="tel:${esc(u.phone.replace(/\s/g, ''))}">${I.phone}${esc(u.phone)}</a><a class="chip" target="_blank" rel="noopener" href="https://wa.me/${esc(wa)}">WhatsApp</a></div>` : ''}</div></div>
      <div class="kpis">
        <div class="glass kpi rise" style="--i:1"><b>${st.done.length}</b><small>visitas</small></div>
        <div class="glass kpi rise" style="--i:2"><b>${fmtMoney(st.done.reduce((s, b) => s + (b.price || 0), 0))}</b><small>gastado</small></div>
        <div class="glass kpi rise" style="--i:3"><b>${st.gap ? st.gap + ' d' : '—'}</b><small>ritmo</small></div>
        <div class="glass kpi rise" style="--i:4"><b>${l.filter((b) => b.status === 'noshow').length}</b><small>no vino</small></div>
      </div>
      <div class="glass panel rise" style="--i:5"><div class="panel-head"><h3>${I.edit} Notas privadas</h3><small class="muted">Solo las ves tú</small></div>
        <textarea id="client-note" data-keep="note-${uid}" rows="3" placeholder="Ej.: degradado del 2, nuca recta…">${esc(note)}</textarea>
        <button class="btn primary sm gap-top" data-act="save-note" data-id="${uid}">Guardar nota</button></div>
      <div class="glass panel rise" style="--i:6"><div class="panel-head"><h3>${I.chart} Visitas por mes</h3></div>${barChart(st.perMonth, { label: monthLabel })}</div>
      <div class="sec-head"><h2>Historial</h2></div>
      <div class="stack">${l.slice().reverse().map((b, i) => bookingCard(b, i, true)).join('') || '<p class="muted">Sin citas todavía.</p>'}</div>
    </div>`,
  };
}

function SettingsView() {
  const sh = shop();
  return {
    tabbar: true, cls: 'settings',
    html: `<div class="page">
      ${nav('Ajustes')}
      <div class="glass profile-card rise">${shopAv(64)}<div class="grow"><h2>${esc(sh.name)}</h2><p class="muted">Administrador · ${esc(S.user.email)}</p></div></div>
      <button class="glass add-row rise" data-act="copy-link"><span class="row-ico" style="--c:#0a84ff">${I.copy}</span><span class="grow"><b>Copiar el enlace para tus clientes</b><small class="muted">${esc(location.href.split('#')[0])}</small></span></button>

      <div class="sec-head"><h2>Servicios</h2><button class="link" data-act="edit-svc">${I.plus} Añadir</button></div>
      <div class="glass list rise">${S.services.map((s) => `<button class="row" data-act="edit-svc" data-id="${s.id}"><span class="row-ico" style="--c:${s.active === false ? '#8e8e93' : '#d4a24c'}">${I.scissors}</span><span class="grow"><b>${esc(s.name)}</b><small class="muted">${s.duration} min${s.active === false ? ' · oculto' : ''}</small></span><b class="price">${fmtMoney(s.price)}</b></button>`).join('') || `<div class="row"><span class="grow muted">Aún no hay servicios.</span><button class="btn primary sm" data-act="seed-svc">Cargar los típicos</button></div>`}</div>

      <div class="sec-head"><h2>Barberos</h2><button class="link" data-act="edit-barber">${I.plus} Añadir</button></div>
      <div class="glass list rise">${S.barbers.map((b) => `<button class="row" data-act="edit-barber" data-id="${b.id}">${barberAv(b, 36)}<span class="grow"><b>${esc(b.name)}</b><small class="muted">${b.active === false ? 'Inactivo' : (b.days && b.days.length < 7 ? 'Trabaja: ' + [1, 2, 3, 4, 5, 6, 0].filter((d) => b.days.includes(d)).map((d) => DAYS[d].slice(0, 2)).join(' ') : 'Todos los días de apertura')}</small></span>${I.chevron}</button>`).join('') || '<div class="row"><span class="grow muted">Si trabajas solo, no hace falta añadir barberos.</span></div>'}</div>

      <div class="sec-head"><h2>Horario</h2><button class="link" data-act="edit-hours">${I.edit} Editar</button></div>
      <div class="glass panel rise"><div class="hours">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<span><b>${DAYS[d].slice(0, 3)}</b>${(sh.hours[d] || []).length ? sh.hours[d].map(([a, b]) => `${a}–${b}`).join(' · ') : 'Cerrado'}</span>`).join('')}</div>
        ${(sh.closed || []).filter((d) => d >= todayISO()).length ? `<p class="tiny muted gap-top">Días cerrados: ${(sh.closed || []).filter((d) => d >= todayISO()).map((d) => fmtDate(d, { day: 'numeric', month: 'short' })).join(', ')}</p>` : ''}
        <button class="btn glass-btn sm gap-top" data-act="close-day">${I.moon} Cerrar un día (vacaciones, festivo)</button></div>

      <div class="sec-head"><h2>Barbería</h2></div>
      <form class="glass list form-list rise" id="shop-form">
        <label class="row field-row"><span>Nombre</span><input name="name" data-keep="s-name" value="${esc(sh.name)}"></label>
        <label class="row field-row"><span>Dirección</span><input name="address" data-keep="s-addr" value="${esc(sh.address || '')}" placeholder="Calle, número, ciudad"></label>
        <label class="row field-row"><span>Teléfono</span><input name="phone" data-keep="s-phone" type="tel" value="${esc(sh.phone || '')}"></label>
        <label class="row field-row"><span>Instagram</span><input name="instagram" data-keep="s-ig" value="${esc(sh.instagram || '')}" placeholder="@tubarberia"></label>
        <label class="row field-row"><span>Sellos fidelidad</span><input name="loyaltyEvery" data-keep="s-loy" type="number" min="3" max="20" value="${esc(sh.loyaltyEvery)}"></label>
        <label class="row field-row"><span>Cancelar hasta (h)</span><input name="cancelHours" data-keep="s-can" type="number" min="0" max="72" value="${esc(sh.cancelHours)}"></label>
        <label class="row field-row"><span>Antelación (min)</span><input name="lead" data-keep="s-lead" type="number" min="0" max="600" step="15" value="${esc(sh.lead)}"></label>
        <div class="row"><label class="btn glass-btn sm">${I.image} Logo<input type="file" accept="image/*" id="logo-input" hidden></label><button class="btn primary sm ml-auto">Guardar</button></div>
      </form>

      <div class="glass list rise">
        <button class="row" data-act="enable-push"><span class="row-ico" style="--c:#ff375f">${I.bell}</span><span class="grow"><b>Notificaciones en este móvil</b><small class="muted">${pushEnabled() ? 'Activadas' : 'Recibe cada reserva y cancelación al momento'}</small></span>${pushEnabled() ? '<span class="pill st-completada">Activas</span>' : I.chevron}</button>
        <button class="row" data-act="logout"><span class="row-ico" style="--c:#8e8e93">${I.logout}</span><span class="grow"><b>Cerrar sesión</b></span></button>
      </div>
    </div>`,
    mount() {
      $('#shop-form').onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        try {
          await B.saveShop({ name: f.name.value.trim() || 'Mi Barbería', address: f.address.value.trim(), phone: f.phone.value.trim(), instagram: f.instagram.value.trim(), loyaltyEvery: Math.max(3, Number(f.loyaltyEvery.value) || 10), cancelHours: Math.max(0, Number(f.cancelHours.value) || 0), lead: Math.max(0, Number(f.lead.value) || 0) });
          toast('Datos guardados');
        } catch (ex) { toast(ex.message, 'error'); }
      };
      $('#logo-input').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { await B.saveShop({ logo: await compressImage(f, 300, 0.85) }); toast('Logo actualizado'); } catch (ex) { toast(ex.message, 'error'); } };
    },
  };
}

/* =========================================================
 * Hojas y acciones
 * ========================================================= */
async function bookingMenu(id) {
  const b = S.bookings.find((x) => x.id === id);
  if (!b) return;
  const admin = isAdmin();
  const startsIn = (parseISO(b.date).getTime() + toMin(b.start) * 6e4 - Date.now()) / 36e5;
  const cancelH = Number(shop().cancelHours) || 0;
  const acts = [];
  if (admin) {
    if (b.status === 'confirmada') acts.push({ label: 'Marcar como completada', icon: 'check', bold: true, value: 'done' }, { label: 'No se presentó', icon: 'close', value: 'noshow' });
    if (['confirmada', 'completada'].includes(b.status)) acts.push({ label: b.photoId ? 'Cambiar la foto del corte' : 'Subir foto del corte', icon: 'camera', value: 'photo' });
    if (b.userId) acts.push({ label: 'Ver ficha del cliente', icon: 'person', value: 'client' });
    if (b.status === 'confirmada') acts.push({ label: 'Cancelar cita', icon: 'trash', danger: true, value: 'cancel' });
  } else {
    if (isUpcoming(b)) {
      acts.push({ label: 'Añadir a mi calendario', icon: 'calendar', value: 'ics' });
      if (startsIn >= cancelH) acts.push({ label: 'Cancelar cita', icon: 'trash', danger: true, value: 'cancel' });
    }
    if (b.status === 'completada' && !b.rating) acts.push({ label: 'Valorar el corte', icon: 'star', bold: true, value: 'rate' });
    if (b.photoId) acts.push({ label: 'Ver la foto del corte', icon: 'image', value: 'photo-view' });
    acts.push({ label: 'Reservar lo mismo otra vez', icon: 'repeat', value: 'again' });
  }
  const c = admin ? (userById(b.userId) || { name: b.clientName || 'Cliente' }) : null;
  const title = `${b.serviceName} · ${fmtDate(b.date, { weekday: 'short', day: 'numeric', month: 'short' })} ${b.start} · ${admin ? c.name : b.barberName}${!admin && isUpcoming(b) && startsIn < cancelH ? `\nFaltan menos de ${cancelH} h: ya no se puede cancelar desde la app.` : ''}`;
  const v = await actionSheet(title, acts);
  if (!v) return;
  try {
    if (v === 'done') {
      await B.updateBooking(id, { status: 'completada', completedAt: Date.now() });
      toast('¡Completada!');
      if (b.userId) B.notify(b.userId, '¡Gracias por venir!', `¿Qué tal tu ${b.serviceName.toLowerCase()}? Valóralo en la app.`, { link: '#/appts' });
      if (await confirmSheet('¿Subir la foto del corte a su galería?', 'Subir foto', false)) pickPhoto(b);
    }
    if (v === 'noshow') { await B.updateBooking(id, { status: 'noshow' }); toast('Marcada como no presentada'); }
    if (v === 'photo') pickPhoto(b);
    if (v === 'client') go('#/client/' + b.userId);
    if (v === 'cancel') {
      if (!(await confirmSheet('¿Cancelar esta cita? El hueco quedará libre.', 'Cancelar cita'))) return;
      await B.cancelBooking(b, admin);
      toast('Cita cancelada');
      if (admin && b.userId) B.notify(b.userId, 'Cita cancelada', `Tu cita de ${b.serviceName} del ${fmtDate(b.date, { day: 'numeric', month: 'short' })} a las ${b.start} se ha cancelado. Reserva otra hora cuando quieras.`, { link: '#/book' });
      if (!admin) B.notify('owner', 'Cita cancelada', `${(S.profile && S.profile.name) || 'Un cliente'} canceló ${b.serviceName} · ${fmtDate(b.date, { weekday: 'short', day: 'numeric', month: 'short' })} ${b.start}`, { link: '#/' });
    }
    if (v === 'ics') exportIcs(id);
    if (v === 'rate') rateSheet(b);
    if (v === 'photo-view') viewPhoto(b);
    if (v === 'again') { ui.bk = { serviceId: b.serviceId, barberId: barbers().some((x) => x.id === b.barberId) ? b.barberId : undefined }; go('#/book'); }
  } catch (ex) { toast(ex.message, 'error'); }
}
function pickPhoto(b) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      toast('Subiendo foto…');
      const pid = await B.uploadPhoto(f, { userId: b.userId || null, bookingId: b.id });
      if (b.photoId) B.deletePhoto(b.photoId).catch(() => {});
      await B.updateBooking(b.id, { photoId: pid });
      toast('Foto guardada en su galería');
      if (b.userId) B.notify(b.userId, 'Tu nuevo corte', 'Ya tienes la foto de tu corte en «Mi estilo».', { link: '#/stats' });
    } catch (ex) { toast(ex.message, 'error'); }
  };
  inp.click();
}
async function viewPhoto(b) {
  if (!b) return;
  const h = openSheet(`<div class="viewer"><div class="viewer-head"><b>${esc(b.serviceName)}</b><small class="muted">${fmtDate(b.date)} · ${esc(b.barberName)}</small></div><div class="viewer-body"><div class="spinner"></div></div>
    <div class="grid2"><button class="btn glass-btn" data-x="close">Cerrar</button>${isAdmin() ? '' : `<button class="btn primary" data-x="same">${I.repeat} Quiero este mismo</button>`}</div></div>`, { wide: true });
  h.el.querySelector('[data-x="close"]').onclick = () => h.close();
  const same = h.el.querySelector('[data-x="same"]');
  if (same) same.onclick = () => { h.close(); ui.bk = { serviceId: b.serviceId, barberId: barbers().some((x) => x.id === b.barberId) ? b.barberId : undefined, note: `El mismo corte que el ${fmtDate(b.date, { day: 'numeric', month: 'short' })}` }; go('#/book'); };
  const d = await B.photo(b.photoId).catch(() => '');
  $('.viewer-body', h.el).innerHTML = d ? `<img src="${d}" alt="Foto del corte">` : '<p class="muted">Foto no disponible.</p>';
}
function rateSheet(b) {
  let n = 5;
  const h = openSheet(`<div class="success"><h2>¿Qué tal tu corte?</h2><p class="muted">${esc(b.serviceName)} con ${esc(b.barberName)}</p>
    <div class="rate-stars">${[1, 2, 3, 4, 5].map((i) => `<button class="rs on" data-n="${i}" aria-label="${i} estrellas">${I.starFill}</button>`).join('')}</div>
    <textarea id="review" rows="3" placeholder="Cuéntanos algo (opcional)"></textarea>
    <button class="btn primary block lg gap-top" data-x="send">Enviar valoración</button></div>`);
  const paint = () => $$('.rs', h.el).forEach((s) => s.classList.toggle('on', +s.dataset.n <= n));
  $$('.rs', h.el).forEach((s) => s.onclick = () => { n = +s.dataset.n; paint(); haptic(5); });
  h.el.querySelector('[data-x="send"]').onclick = async () => {
    const review = $('#review', h.el).value.trim();
    try {
      await B.updateBooking(b.id, { rating: n, review, ratedAt: Date.now() });
      h.close(); toast('¡Gracias por tu valoración!'); if (n >= 4) confetti();
      B.notify('owner', `Nueva valoración: ${'★'.repeat(n)}${'☆'.repeat(5 - n)}`, `${(S.profile && S.profile.name) || 'Un cliente'}: ${review || b.serviceName}`, { link: '#/dash' });
    } catch (ex) { toast(ex.message, 'error'); }
  };
}

// Reserva manual del administrador (por teléfono, sin cita…)
function adminBookSheet(userId) {
  if (!S.services.length) { toast('Primero crea tus servicios en Ajustes.', 'error'); go('#/settings'); return; }
  const st = { time: '' };
  const clients = S.users.filter((u) => u.id !== S.user.uid).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const h = openSheet(`<div class="sheet-head"><button class="sh-btn" data-x="close">Cancelar</button><h3>Nueva cita</h3><button class="sh-btn bold" data-x="save">Guardar</button></div>
    <form class="form" id="ab-form" onsubmit="return false">
      <label class="field"><span>Cliente</span><select name="user"><option value="">Cliente sin cuenta (escribir nombre)</option>${clients.map((u) => `<option value="${u.id}" ${u.id === userId ? 'selected' : ''}>${esc(u.name)}${u.phone ? ' · ' + esc(u.phone) : ''}</option>`).join('')}</select></label>
      <div class="grid2 walkin"><label class="field"><span>Nombre</span><input name="cname" placeholder="Nombre"></label><label class="field"><span>Teléfono</span><input name="cphone" type="tel" placeholder="Opcional"></label></div>
      <label class="field"><span>Servicio</span><select name="svc">${S.services.map((s) => `<option value="${s.id}">${esc(s.name)} · ${fmtMoney(s.price)} · ${s.duration} min</option>`).join('')}</select></label>
      ${barbers().length > 1 ? `<label class="field"><span>Barbero</span><select name="barber">${barbers().map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label>` : ''}
      <label class="field"><span>Día</span><input name="day" type="date" value="${ui.day < todayISO() ? todayISO() : ui.day}" min="${todayISO()}"></label>
      <div class="field"><span>Hora</span><div class="slots" id="ab-slots"><div class="spinner"></div></div></div>
    </form>`, { wide: true });
  const f = $('#ab-form', h.el);
  const walk = () => { $('.walkin', h.el).style.display = f.user.value ? 'none' : ''; };
  walk();
  let unsub = null, slots = [];
  const bid = () => (f.barber ? f.barber.value : barbers()[0].id);
  const paint = () => {
    const svc = serviceById(f.svc.value);
    const busy = new Set(slots.map((s) => `${s.barberId}|${s.t}`));
    const out = [];
    const min = f.day.value === todayISO() ? nowMin() : -1;
    openIntervals(f.day.value).forEach(([a, b]) => { for (let t = a; t + svc.duration <= b; t += STEP) { if (t < min) continue; let ok = true; for (let m = t; m < t + svc.duration; m += STEP) if (busy.has(`${bid()}|${toHHMM(m)}`)) ok = false; if (ok) out.push(toHHMM(t)); } });
    if (st.time && !out.includes(st.time)) st.time = '';
    $('#ab-slots', h.el).innerHTML = out.map((t) => `<button type="button" class="slot${st.time === t ? ' active' : ''}" data-t="${t}">${t}</button>`).join('') || '<p class="muted">Sin huecos libres este día.</p>';
    $$('#ab-slots .slot', h.el).forEach((x) => x.onclick = () => { st.time = x.dataset.t; paint(); });
  };
  const listen = () => { if (unsub) unsub(); if (!f.day.value) return; unsub = B.watchSlots(f.day.value, (l) => { slots = l; paint(); }); };
  listen();
  f.user.onchange = walk; f.svc.onchange = paint; if (f.barber) f.barber.onchange = paint; f.day.onchange = listen;
  const close = () => { if (unsub) unsub(); h.close(); };
  h.el.querySelector('[data-x="close"]').onclick = close;
  h.el.querySelector('[data-x="save"]').onclick = async () => {
    const svc = serviceById(f.svc.value);
    if (!st.time) return toast('Elige una hora', 'error');
    if (!f.user.value && !f.cname.value.trim()) return toast('Escribe el nombre del cliente', 'error');
    const u = f.user.value ? userById(f.user.value) : null;
    try {
      await B.book({ userId: u ? u.id : null, clientName: u ? u.name : f.cname.value.trim(), clientPhone: u ? (u.phone || '') : f.cphone.value.trim(), serviceId: svc.id, serviceName: svc.name, price: Number(svc.price) || 0, duration: svc.duration, barberId: bid(), barberName: barberById(bid()).name, date: f.day.value, start: st.time, end: toHHMM(toMin(st.time) + svc.duration), note: '' });
      if (u) B.notify(u.id, 'Cita reservada', `${svc.name} · ${fmtDate(f.day.value, { weekday: 'long', day: 'numeric', month: 'short' })} a las ${st.time}`, { link: '#/appts' });
      ui.day = f.day.value;
      close(); toast('Cita guardada'); schedule();
    } catch (ex) { toast(ex.message, 'error'); }
  };
}

function serviceSheet(id) {
  const s = id ? serviceById(id) : { name: '', price: 15, duration: 30, desc: '', active: true };
  const h = openSheet(`<div class="sheet-head"><button class="sh-btn" data-x="close">Cancelar</button><h3>${id ? 'Editar servicio' : 'Nuevo servicio'}</h3><button class="sh-btn bold" data-x="save">Guardar</button></div>
    <form class="form" id="svc-form" onsubmit="return false">
      <label class="field"><span>Nombre</span><input name="name" value="${esc(s.name)}" placeholder="Corte + barba" autofocus></label>
      <div class="grid2"><label class="field"><span>Precio (€)</span><input name="price" type="number" step="0.5" min="0" value="${esc(s.price)}"></label>
      <label class="field"><span>Duración</span><select name="duration">${[15, 30, 45, 60, 75, 90, 120].map((m) => `<option value="${m}" ${Number(s.duration) === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></label></div>
      <label class="field"><span>Descripción <i>(opcional)</i></span><input name="desc" value="${esc(s.desc || '')}" placeholder="Incluye lavado y peinado"></label>
      <label class="switch-row"><span>Visible para reservar</span><input type="checkbox" name="active" ${s.active !== false ? 'checked' : ''}><i class="switch"></i></label>
      ${id ? '<button type="button" class="btn danger-soft block" data-x="del">Eliminar servicio</button>' : ''}
    </form>`);
  const f = $('#svc-form', h.el);
  h.el.querySelector('[data-x="close"]').onclick = () => h.close();
  const del = h.el.querySelector('[data-x="del"]');
  if (del) del.onclick = async () => { if (await confirmSheet('¿Eliminar este servicio? Las citas ya hechas no se borran.', 'Eliminar')) { await B.deleteService(id); h.close(); toast('Servicio eliminado'); } };
  h.el.querySelector('[data-x="save"]').onclick = async () => {
    if (!f.name.value.trim()) return f.name.focus();
    try { await B.saveService({ id, name: f.name.value.trim(), price: Math.max(0, Number(f.price.value) || 0), duration: Number(f.duration.value), desc: f.desc.value.trim(), active: f.active.checked, order: s.order ?? S.services.length }); h.close(); toast('Servicio guardado'); }
    catch (ex) { toast(ex.message, 'error'); }
  };
}
async function seedServices() {
  const base = [['Corte de pelo', 15, 30], ['Corte + barba', 22, 45], ['Arreglo de barba', 10, 15], ['Rapado / máquina', 10, 15], ['Corte infantil', 12, 30], ['Afeitado clásico con navaja', 15, 30], ['Tinte / mechas', 25, 45]];
  try { for (let k = 0; k < base.length; k++) await B.saveService({ name: base[k][0], price: base[k][1], duration: base[k][2], desc: '', active: true, order: k }); toast('Servicios creados. Ajusta los precios a tu gusto'); }
  catch (ex) { toast(ex.message, 'error'); }
}
const COLORS = ['#d4a24c', '#0a84ff', '#30d158', '#ff375f', '#bf5af2', '#ff9f0a', '#64d2ff'];
function barberSheet(id) {
  const b = id ? S.barbers.find((x) => x.id === id) : { name: '', color: COLORS[S.barbers.length % COLORS.length], days: [1, 2, 3, 4, 5, 6], active: true };
  let photo = b.photo || '';
  let color = b.color || COLORS[0];
  const days = new Set(b.days || [0, 1, 2, 3, 4, 5, 6]);
  const h = openSheet(`<div class="sheet-head"><button class="sh-btn" data-x="close">Cancelar</button><h3>${id ? 'Editar barbero' : 'Nuevo barbero'}</h3><button class="sh-btn bold" data-x="save">Guardar</button></div>
    <form class="form" id="br-form" onsubmit="return false">
      <label class="photo-pick"><span class="photo-prev" style="--g:${esc(color)}">${photo ? `<img src="${esc(photo)}" alt="">` : I.camera}</span><span>Foto</span><input type="file" accept="image/*" hidden id="br-photo"></label>
      <label class="field"><span>Nombre</span><input name="name" value="${esc(b.name)}" placeholder="Javi" autofocus></label>
      <div class="field"><span>Color en la agenda</span><div class="colors">${COLORS.map((c) => `<button type="button" class="color${c === color ? ' active' : ''}" data-c="${c}" style="--c:${c}" aria-label="Color"></button>`).join('')}</div></div>
      <div class="field"><span>Días que trabaja</span><div class="chips wrap">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" class="chip${days.has(d) ? ' active' : ''}" data-d="${d}">${DAYS[d].slice(0, 3)}</button>`).join('')}</div></div>
      <label class="switch-row"><span>Activo</span><input type="checkbox" name="active" ${b.active !== false ? 'checked' : ''}><i class="switch"></i></label>
      ${id ? '<button type="button" class="btn danger-soft block" data-x="del">Eliminar barbero</button>' : ''}
    </form>`);
  const el = h.el, f = $('#br-form', el);
  $$('.color', el).forEach((c) => c.onclick = () => { color = c.dataset.c; $$('.color', el).forEach((x) => x.classList.toggle('active', x === c)); $('.photo-prev', el).style.setProperty('--g', color); });
  $$('[data-d]', el).forEach((c) => c.onclick = () => { const d = +c.dataset.d; if (days.has(d)) days.delete(d); else days.add(d); c.classList.toggle('active'); });
  $('#br-photo', el).onchange = async (e) => { const file = e.target.files[0]; if (!file) return; photo = await compressImage(file, 300, 0.85); $('.photo-prev', el).innerHTML = `<img src="${photo}" alt="">`; };
  el.querySelector('[data-x="close"]').onclick = () => h.close();
  const del = el.querySelector('[data-x="del"]');
  if (del) del.onclick = async () => { if (await confirmSheet('¿Eliminar este barbero? Sus citas seguirán en la agenda.', 'Eliminar')) { await B.deleteBarber(id); h.close(); } };
  el.querySelector('[data-x="save"]').onclick = async () => {
    if (!f.name.value.trim()) return f.name.focus();
    try { await B.saveBarber({ id, name: f.name.value.trim(), color, photo, days: [...days].sort(), active: f.active.checked, order: b.order ?? S.barbers.length }); h.close(); toast('Barbero guardado'); }
    catch (ex) { toast(ex.message, 'error'); }
  };
}
function hoursSheet() {
  const sh = shop();
  const row = (d) => { const iv = sh.hours[d] || []; const [a, b] = iv[0] || ['', '']; const [c, e] = iv[1] || ['', '']; return `<div class="hrow"><div class="hrow-top"><b>${DAYS[d]}</b><label class="switch-row"><input type="checkbox" data-open="${d}" ${iv.length ? 'checked' : ''}><i class="switch"></i></label></div>
    <div class="htimes"><input type="time" data-h="${d}-0" value="${a}"><span>–</span><input type="time" data-h="${d}-1" value="${b}"><small>y</small><input type="time" data-h="${d}-2" value="${c}"><span>–</span><input type="time" data-h="${d}-3" value="${e}"></div></div>`; };
  const h = openSheet(`<div class="sheet-head"><button class="sh-btn" data-x="close">Cancelar</button><h3>Horario</h3><button class="sh-btn bold" data-x="save">Guardar</button></div>
    <p class="tiny muted">Deja vacío el segundo tramo si no cierras a mediodía.</p><div class="hours-edit">${[1, 2, 3, 4, 5, 6, 0].map(row).join('')}</div>`, { wide: true });
  h.el.querySelector('[data-x="close"]').onclick = () => h.close();
  h.el.querySelector('[data-x="save"]').onclick = async () => {
    const hours = {};
    [0, 1, 2, 3, 4, 5, 6].forEach((d) => {
      const v = (k) => h.el.querySelector(`[data-h="${d}-${k}"]`).value;
      const iv = [];
      if (h.el.querySelector(`[data-open="${d}"]`).checked) { if (v(0) && v(1) && v(1) > v(0)) iv.push([v(0), v(1)]); if (v(2) && v(3) && v(3) > v(2)) iv.push([v(2), v(3)]); }
      hours[d] = iv;
    });
    try { await B.saveShop({ hours }); h.close(); toast('Horario guardado'); } catch (ex) { toast(ex.message, 'error'); }
  };
}
async function closeDay() {
  const d = await promptSheet('Cerrar un día', { label: 'Día que la barbería estará cerrada', type: 'date', value: todayISO(), ok: 'Cerrar ese día' });
  if (!d) return;
  const closed = [...new Set([...(shop().closed || []).filter((x) => x >= todayISO()), d])].sort();
  try { await B.saveShop({ closed }); } catch (ex) { return toast(ex.message, 'error'); }
  const affected = S.bookings.filter((b) => b.date === d && b.status === 'confirmada');
  toast(affected.length ? `Día cerrado. Ojo: ya hay ${affected.length} cita(s) ese día` : 'Día cerrado');
}
function promoSheet() {
  const h = openSheet(`<div class="sheet-head"><button class="sh-btn" data-x="close">Cancelar</button><h3>Promoción</h3><button class="sh-btn bold" data-x="send">Enviar</button></div>
    <form class="form" onsubmit="return false"><label class="field"><span>Título</span><input id="pt" placeholder="-20% en barba esta semana" autofocus></label>
    <label class="field"><span>Mensaje</span><textarea id="pb" rows="3" placeholder="Reserva desde la app y menciónalo al llegar."></textarea></label>
    <p class="tiny muted">Llegará a todos tus clientes dentro de la app y como notificación a quienes las tengan activadas.</p></form>`);
  h.el.querySelector('[data-x="close"]').onclick = () => h.close();
  h.el.querySelector('[data-x="send"]').onclick = async () => {
    const t = $('#pt', h.el).value.trim(), b = $('#pb', h.el).value.trim();
    if (!t) return $('#pt', h.el).focus();
    await B.notify('all', t, b, { link: '#/book' });
    h.close(); toast('Promoción enviada'); confetti();
  };
}
async function claimAdmin() {
  const key = await promptSheet('Soy el administrador', { label: 'Súper contraseña', type: 'password', ok: 'Activar administración' });
  if (!key) return;
  try { await B.claimAdmin(key); toast('¡Ahora eres el administrador!'); confetti(); location.hash = '#/settings'; }
  catch (ex) { toast(ex.message, 'error'); haptic([10, 40, 10]); }
}
async function enableNotifications() {
  if (!('Notification' in window)) return toast('Este navegador no admite notificaciones. En iPhone, instala la app en la pantalla de inicio y ábrela desde allí.', 'error');
  const p = await Notification.requestPermission();
  if (p !== 'granted') return toast('Has bloqueado las notificaciones. Actívalas en los ajustes del navegador.', 'error');
  if (CONFIG.vapidKey && swReg) { try { await B.enablePush(CONFIG.vapidKey, swReg); } catch (ex) { console.error(ex); } }
  toast('Notificaciones activadas'); schedule();
  if (swReg) swReg.showNotification(shop().name, { body: 'Así te avisaremos.', icon: 'assets/icons/icon-192.png' }).catch(() => {});
}

const ACT = {
  back: () => (history.length > 1 ? history.back() : go('#/')),
  seg: (el) => { ui[el.dataset.seg] = el.dataset.val; const s = el.closest('.seg'); $$('.seg-btn', s).forEach((b) => b.classList.toggle('active', b === el)); layoutSeg(s); haptic(4); setTimeout(() => draw(false), 170); },
  forgot: async () => { const email = await promptSheet('Recuperar contraseña', { label: 'Tu correo', type: 'email', value: ($('#auth-form') || {}).email?.value || '', ok: 'Enviar enlace' }); if (!email) return; try { await B.resetPassword(email); toast('Te hemos enviado un correo para crear una contraseña nueva'); } catch (ex) { toast(ex.message, 'error'); } },
  logout: async () => { if (await confirmSheet('¿Cerrar sesión?', 'Cerrar sesión')) { await B.signOut(); location.hash = '#/'; } },
  'pick-svc': (el) => { ui.bk.serviceId = el.dataset.id; ui.bk.time = null; haptic(5); draw(false); },
  'pick-barber': (el) => { ui.bk.barberId = el.dataset.id; ui.bk.time = null; haptic(5); draw(false); },
  'pick-day': (el) => { ui.bk.day = el.dataset.day; ui.bk.time = null; haptic(5); draw(false); },
  'pick-time': (el) => { ui.bk.time = el.dataset.t; haptic(8); draw(false); },
  'confirm-book': (el) => confirmBook(el),
  'bk-menu': (el) => bookingMenu(el.dataset.id),
  ics: (el) => exportIcs(el.dataset.id),
  repeat: () => { const st = statsFor(S.bookings); const l = st.last; ui.bk = l ? { serviceId: l.serviceId, barberId: barbers().some((x) => x.id === l.barberId) ? l.barberId : undefined } : {}; go('#/book'); },
  'view-photo': (el) => viewPhoto(S.bookings.find((b) => b.id === el.dataset.id)),
  'enable-push': () => enableNotifications(),
  'claim-admin': () => claimAdmin(),
  avatar: () => $('#avatar-input').click(),
  'agenda-day': (el) => { ui.day = el.dataset.day; haptic(4); draw(false); },
  'admin-book': (el) => adminBookSheet(el.dataset.user),
  'save-note': async (el) => { try { await B.saveClientNote(el.dataset.id, $('#client-note').value.trim()); toast('Nota guardada'); } catch (ex) { toast(ex.message, 'error'); } },
  'edit-svc': (el) => serviceSheet(el.dataset.id),
  'seed-svc': () => seedServices(),
  'edit-barber': (el) => barberSheet(el.dataset.id),
  'edit-hours': () => hoursSheet(),
  'close-day': () => closeDay(),
  promo: () => promoSheet(),
  'copy-link': async () => { const u = location.href.split('#')[0]; try { await navigator.clipboard.writeText(u); toast('Enlace copiado. Compártelo con tus clientes'); } catch (e) { toast(u); } },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !ACT[el.dataset.act] || el.disabled) return;
  if (el.tagName === 'A') e.preventDefault();
  ACT[el.dataset.act](el, e);
});
document.addEventListener('input', (e) => { if (e.target.dataset.input === 'q') { ui.q = e.target.value; schedule(); } });
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.btn, .glass-btn, .row, .bk, .tab, .chip, .day, .slot, .svc, .barber-pick, .service-card, .mini-stat, .ag-card, .stat, .kpi, .shot, .hero-card');
  if (!el) return;
  el.classList.add('pressed');
  const off = () => { el.classList.remove('pressed'); removeEventListener('pointerup', off); removeEventListener('pointercancel', off); };
  addEventListener('pointerup', off); addEventListener('pointercancel', off);
}, { passive: true });

boot();

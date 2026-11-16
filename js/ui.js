/* Barbería — utilidades de interfaz: iconos, formatos, avisos, hojas y archivos */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ---------- Iconos (trazo fino, estilo SF Symbols) ---------- */
const sv = (d, w = 1.8) => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const I = {
  home: sv('<path d="M3.5 10.5 12 3.8l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-6h-5.6v6H5A1.5 1.5 0 0 1 3.5 19z"/>'),
  paw: sv('<ellipse cx="12" cy="16" rx="4.3" ry="3.6"/><ellipse cx="5.8" cy="11" rx="1.9" ry="2.5"/><ellipse cx="18.2" cy="11" rx="1.9" ry="2.5"/><ellipse cx="9" cy="6.6" rx="1.8" ry="2.4"/><ellipse cx="15" cy="6.6" rx="1.8" ry="2.4"/>'),
  chat: sv('<path d="M20.5 11.6c0 4.2-3.8 7.6-8.5 7.6-1.3 0-2.5-.2-3.6-.7L3.5 20l1.4-3.9a7.2 7.2 0 0 1-1.4-4.5C3.5 7.4 7.3 4 12 4s8.5 3.4 8.5 7.6z"/>'),
  calendar: sv('<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M8 2.8v3.4M16 2.8v3.4M3.5 9.5h17"/>'),
  person: sv('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6"/>'),
  people: sv('<circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 19.5c.8-3.3 3.3-5 6.2-5s5.4 1.7 6.2 5"/><path d="M15.5 5.3a3.3 3.3 0 0 1 0 6.4M17.5 14.6c2 .6 3.3 2.2 3.8 4.9"/>'),
  grid: sv('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>', 2),
  send: sv('<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>', 2.2),
  clip: sv('<path d="M20 11.5 12.3 19.2a5 5 0 0 1-7-7l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3"/>'),
  back: sv('<path d="m15 18-6-6 6-6"/>', 2.2),
  chevron: sv('<path d="m9 6 6 6-6 6"/>', 2),
  close: sv('<path d="M6 6l12 12M18 6 6 18"/>', 2),
  check: sv('<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>', 2.2),
  checks: sv('<path d="M2.5 12.5 7 17 16 7M10.5 16 11.5 17 21 7"/>', 2),
  doc: sv('<path d="M14 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M14 3.5V9h5.5M8.5 13h7M8.5 16.5h5"/>'),
  invoice: sv('<path d="M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.5-1.5 1.5-2-1.5L6 20.5z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>'),
  syringe: sv('<path d="m18 2.5 3.5 3.5M16.2 4.3l3.5 3.5M17.9 6.1 8.6 15.4l-3-3 9.3-9.3M5.6 12.4l-2.8 2.8 3 3M8.6 15.4l-3 3M7 10.9l1.6 1.6M10 7.9l1.6 1.6"/>'),
  stetho: sv('<path d="M5.5 3.5v5a5 5 0 0 0 10 0v-5M10.5 13.5v1.5a5 5 0 0 0 10 0V13"/><circle cx="20.5" cy="11" r="2"/>'),
  flask: sv('<path d="M9.5 3.5h5M10.5 3.5v6L5 18.6A1.6 1.6 0 0 0 6.4 21h11.2a1.6 1.6 0 0 0 1.4-2.4L13.5 9.5v-6M7.5 15h9"/>'),
  pill: sv('<rect x="2.8" y="8.5" width="18.4" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m8.6 8.6 6.8 6.8"/>'),
  xray: sv('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 6.5v11M8.5 9.5c2 1 5 1 7 0M8.5 12.5c2 1 5 1 7 0M9 15.5c1.8.8 4.2.8 6 0"/>'),
  folder: sv('<path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.5l2 2.5H18A2.5 2.5 0 0 1 20.5 9.5V17a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17z"/>'),
  scale: sv('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 9.5a6 6 0 0 1 8 0l-2.6 3a2 2 0 0 0-2.8 0z"/>'),
  heart: sv('<path d="M12 20s-7.5-4.5-9-9.2C2 7.3 4.2 4.5 7.4 4.5c1.9 0 3.4 1 4.6 2.6 1.2-1.6 2.7-2.6 4.6-2.6 3.2 0 5.4 2.8 4.4 6.3C19.5 15.5 12 20 12 20z"/>'),
  bell: sv('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>'),
  search: sv('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  trash: sv('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5"/>'),
  edit: sv('<path d="M15.5 4.5l4 4L9 19H5v-4z"/><path d="m13 7 4 4"/>'),
  download: sv('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'),
  clock: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  pin: sv('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  phone: sv('<path d="M20.5 16.5v2.6a1.6 1.6 0 0 1-1.8 1.6A16.5 16.5 0 0 1 3.3 5.3 1.6 1.6 0 0 1 4.9 3.5h2.6l1.4 4-1.8 1.4a12 12 0 0 0 6 6l1.4-1.8z"/>'),
  mail: sv('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3.5 7 8.5 6 8.5-6"/>'),
  logout: sv('<path d="M9.5 20.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5h3.5M16 16.5l4.5-4.5L16 7.5M20.5 12H9.5"/>'),
  sparkle: sv('<path d="M12 3c.6 4.2 2.4 6.1 6.5 6.9-4.1.8-5.9 2.7-6.5 6.9-.6-4.2-2.4-6.1-6.5-6.9C9.6 9.1 11.4 7.2 12 3zM18.5 15c.3 1.8 1 2.6 2.8 3-1.8.4-2.5 1.2-2.8 3-.3-1.8-1-2.6-2.8-3 1.8-.4 2.5-1.2 2.8-3z"/>'),
  euro: sv('<path d="M17.5 6.5a6.5 6.5 0 1 0 0 11M4.5 10.5h9M4.5 13.5h9"/>'),
  camera: sv('<path d="M4 8.5A2 2 0 0 1 6 6.5h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/>'),
  shield: sv('<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.4-4.4"/>'),
  bolt: sv('<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>'),
  info: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>', 2),
  image: sv('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-8.5 8.5"/>'),
  sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  moon: sv('<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>'),
  scissors: sv('<circle cx="6" cy="6.5" r="2.8"/><circle cx="6" cy="17.5" r="2.8"/><path d="M8.3 8.2 20 18.5M8.3 15.8 20 5.5"/>'),
  razor: sv('<path d="M3.5 14.5 14 4a2.1 2.1 0 0 1 3 3L6.5 17.5z"/><path d="m6.5 17.5 2 2.5h3.5M17 7l3.5 3.5"/>'),
  star: sv('<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>'),
  starFill: sv('<path fill="currentColor" d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>'),
  chart: sv('<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6M20 16v-9"/>'),
  repeat: sv('<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11.5V10A4 4 0 0 1 7.5 6h13M7 21.5 3.5 18 7 14.5"/><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13"/>'),
  gift: sv('<rect x="3.5" y="8" width="17" height="4.5" rx="1.2"/><path d="M5 12.5V20h14v-7.5M12 8v12M12 8c-1.5-3.5-6-3.5-5.5-.5.3 1.4 3 .5 5.5.5zm0 0c1.5-3.5 6-3.5 5.5-.5-.3 1.4-3 .5-5.5.5z"/>'),
  megaphone: sv('<path d="M3.5 10v4a1 1 0 0 0 1 1h2l5.5 4V5L6.5 9h-2a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  store: sv('<path d="M4 9.5V20h16V9.5M3 9.5l1.6-5h14.8L21 9.5c0 1.4-1.2 2.5-2.6 2.5S15.8 10.9 15.8 9.5c0 1.4-1.2 2.5-2.6 2.5h-2.4c-1.4 0-2.6-1.1-2.6-2.5 0 1.4-1.2 2.5-2.6 2.5S3 10.9 3 9.5z"/><path d="M9.5 20v-5h5v5"/>'),
  key: sv('<circle cx="7.5" cy="15.5" r="4"/><path d="m10.5 12.5 9-9M16.5 6.5l3 3M14 9l2 2"/>'),
  crown: sv('<path d="M3.5 8 7 11.5 12 5l5 6.5L20.5 8 19 18H5z"/><path d="M5 21h14"/>'),
  copy: sv('<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>'),
};

/* ---------- Formatos ---------- */
const pad = (n) => String(n).padStart(2, '0');
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const parseISO = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const fmtDate = (s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => (s ? parseISO(s).toLocaleDateString('es-ES', opts) : '');
export const fmtDay = (s) => fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
export const fmtMoney = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
export const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
export function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 604800) return `hace ${Math.floor(s / 86400)} d`;
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
export function chatStamp(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtTime(ts);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
export function daysUntil(iso) {
  const a = parseISO(iso); const b = parseISO(todayISO());
  return Math.round((a - b) / 86400000);
}
export function ageOf(iso) {
  if (!iso) return '';
  const b = parseISO(iso), n = new Date();
  let m = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth();
  if (n.getDate() < b.getDate()) m--;
  if (m < 1) return 'Recién nacido';
  if (m < 12) return `${m} ${m === 1 ? 'mes' : 'meses'}`;
  const y = Math.floor(m / 12);
  return `${y} ${y === 1 ? 'año' : 'años'}`;
}
export const initials = (name) => {
  const w = String(name || '?').trim().split(/\s+/).filter((x) => !/^(dr|dra|sr|sra)\.?$/i.test(x));
  return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
};
export function greeting() {
  const h = new Date().getHours();
  return h < 7 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

/* ---------- Háptica ---------- */
export const haptic = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* nada */ } };

/* ---------- Aviso «Dynamic Island» ---------- */
let islandTimer;
export function toast(msg, kind = 'ok') {
  const el = $('#island');
  if (!el) return;
  const icon = kind === 'error' ? I.info : kind === 'chat' ? I.chat : I.check;
  el.className = `island ${kind}`;
  el.innerHTML = `<span class="island-ico">${icon}</span><span class="island-text"></span>`;
  el.querySelector('.island-text').textContent = msg;
  void el.offsetWidth;
  el.classList.add('open');
  clearTimeout(islandTimer);
  islandTimer = setTimeout(() => el.classList.remove('open'), kind === 'error' ? 4200 : 2800);
  haptic(kind === 'error' ? [10, 40, 10] : 8);
}

/* ---------- Hojas (bottom sheets) con arrastre para cerrar ---------- */
const sheets = [];
export function openSheet(html, { onClose, wide = false, cls = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop"></div>
    <div class="sheet ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-modal="true">
      <div class="sheet-grabber"><span></span></div>
      <div class="sheet-content">${html}</div>
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('sheet-open');
  const sheet = wrap.querySelector('.sheet');
  const entry = { wrap, onClose, closed: false };
  sheets.push(entry);
  requestAnimationFrame(() => wrap.classList.add('in'));
  wrap.querySelector('.sheet-backdrop').addEventListener('click', () => closeSheet(entry));

  // arrastrar hacia abajo para cerrar
  const grab = wrap.querySelector('.sheet-grabber');
  let startY = null, dy = 0;
  const down = (e) => {
    if (e.target.closest('input,textarea,select,button,a,.no-drag')) return;
    startY = e.clientY; dy = 0; sheet.style.transition = 'none'; sheet.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
    wrap.querySelector('.sheet-backdrop').style.opacity = String(Math.max(0, 1 - dy / 400));
  };
  const up = () => {
    if (startY == null) return;
    startY = null; sheet.style.transition = ''; wrap.querySelector('.sheet-backdrop').style.opacity = '';
    if (dy > 120) closeSheet(entry); else sheet.style.transform = '';
  };
  grab.addEventListener('pointerdown', down);
  sheet.querySelector('.sheet-head')?.addEventListener('pointerdown', down);
  sheet.addEventListener('pointermove', move);
  sheet.addEventListener('pointerup', up);
  sheet.addEventListener('pointercancel', up);
  const first = sheet.querySelector('[autofocus]');
  if (first && matchMedia('(pointer:fine)').matches) setTimeout(() => first.focus(), 350);
  return { el: sheet, close: () => closeSheet(entry) };
}
export function closeSheet(entry) {
  if (!entry) entry = sheets[sheets.length - 1];
  if (!entry || entry.closed) return;
  entry.closed = true;
  sheets.splice(sheets.indexOf(entry), 1);
  const s = entry.wrap.querySelector('.sheet');
  s.style.transform = '';
  entry.wrap.classList.remove('in');
  entry.wrap.classList.add('out');
  setTimeout(() => { entry.wrap.remove(); if (!sheets.length) document.body.classList.remove('sheet-open'); }, 380);
  entry.onClose && entry.onClose();
}
export const anySheetOpen = () => sheets.length > 0;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheets.length) closeSheet(); });

/* Hoja de acciones estilo iOS */
export function actionSheet(title, actions) {
  return new Promise((resolve) => {
    let done = false;
    const h = openSheet(`
      ${title ? `<p class="as-title">${esc(title)}</p>` : ''}
      <div class="as-group">${actions.map((a, i) => `<button class="as-btn ${a.danger ? 'danger' : ''} ${a.bold ? 'bold' : ''}" data-i="${i}">${a.icon ? I[a.icon] : ''}${esc(a.label)}</button>`).join('')}</div>
      <button class="as-btn cancel" data-i="-1">Cancelar</button>`, { cls: 'action-sheet', onClose: () => { if (!done) resolve(null); } });
    $$('.as-btn', h.el).forEach((b) => b.addEventListener('click', () => {
      done = true; const i = +b.dataset.i; resolve(i < 0 ? null : actions[i].value ?? i); h.close();
    }));
  });
}
export const confirmSheet = (title, label = 'Confirmar', danger = true) =>
  actionSheet(title, [{ label, danger, bold: !danger, value: true }]).then((v) => v === true);

export function promptSheet(title, { label = '', type = 'text', value = '', placeholder = '', ok = 'Aceptar' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const h = openSheet(`
      <div class="sheet-head"><h3>${esc(title)}</h3></div>
      <form class="form" id="prompt-form">
        <label class="field"><span>${esc(label)}</span><input name="v" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" required autofocus></label>
        <button class="btn primary block">${esc(ok)}</button>
      </form>`, { onClose: () => { if (!done) resolve(null); } });
    $('#prompt-form', h.el).addEventListener('submit', (e) => { e.preventDefault(); done = true; resolve(e.target.v.value); h.close(); });
  });
}

/* ---------- Archivos ---------- */
export const readDataURL = (file) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('No se pudo leer el archivo.')); r.readAsDataURL(file);
});
export async function compressImage(file, max = 1800, q = 0.85) {
  const url = await readDataURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Imagen no válida.')); i.src = url; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
export function dataURLtoBlob(url) {
  const [head, b64] = url.split(',');
  const type = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
export const fileKind = (type) => (String(type).startsWith('image/') ? 'image' : type === 'application/pdf' ? 'pdf' : 'file');

/* ---------- Calendario (.ics) ---------- */
export function icsFor({ title, date, time, description = '', location = '' }) {
  const [h, m] = String(time || '10:00').split(':').map(Number);
  const d = parseISO(date); d.setHours(h, m || 0, 0, 0);
  const e = new Date(d.getTime() + 30 * 60000);
  const f = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
  const clean = (s) => String(s).replace(/[,;\\]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Visvet//ES', 'BEGIN:VEVENT', `UID:${Date.now()}@visvet`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(d)}`, `DTEND:${f(e)}`, `SUMMARY:${clean(title)}`, `DESCRIPTION:${clean(description)}`, `LOCATION:${clean(location)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${clean(title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- Confeti ---------- */
export function confetti(x = innerWidth / 2, y = innerHeight / 3) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
  document.body.appendChild(c);
  const ctx = c.getContext('2d'); ctx.scale(devicePixelRatio, devicePixelRatio);
  const colors = ['#30d158', '#0a84ff', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a'];
  const P = Array.from({ length: 140 }, () => ({
    x, y, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 3,
    c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6, va: (Math.random() - .5) * .3, life: 0,
  }));
  let raf;
  const tick = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    P.forEach((p) => {
      p.life++; p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      if (p.y < innerHeight + 40) alive++;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.globalAlpha = Math.max(0, 1 - p.life / 160);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
    });
    if (alive && P[0].life < 200) raf = requestAnimationFrame(tick); else c.remove();
  };
  raf = requestAnimationFrame(tick);
}

/* ---------- Contadores animados ---------- */
export function countUp(root = document) {
  $$('[data-count]', root).forEach((el) => {
    const to = Number(el.dataset.count) || 0;
    const money = el.dataset.money === '1';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = money ? fmtMoney(to) : to; return; }
    const t0 = performance.now(), dur = 900;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = to * e;
      el.textContent = money ? fmtMoney(v) : Math.round(v);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

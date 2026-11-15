/* Visvet — modo DEMO (sin servidor).
 * Implementa la misma interfaz que el modo Firebase guardando todo en el
 * navegador. Sirve para ver y probar la app antes de conectar Firebase.
 * Varias pestañas del mismo navegador se sincronizan en tiempo real.
 */
import { dataURLtoBlob, compressImage, readDataURL, fileKind, todayISO } from '../ui.js';

const KEY = 'visvet2_db';
const SESSION = 'visvet2_session';
const FILE = 'visvet2_file_';
const ADMIN_EMAIL = 'clinica@visvet.app';
const DEMO_PW = 'demo1234';

const clone = (o) => JSON.parse(JSON.stringify(o));
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const D = 86400000;

export function createLocalBackend() {
  let db = load();
  const listeners = new Set();
  const authListeners = new Set();
  const urlCache = new Map();

  function load() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v === 2) return d; } catch (e) { /* vacío */ }
    const d = seed();
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* lleno */ }
    return d;
  }
  function commit() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { throw new Error('El almacenamiento del navegador está lleno. En modo demo los archivos ocupan mucho.'); }
    notify();
  }
  const notify = () => listeners.forEach((fn) => fn());
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) { db = JSON.parse(e.newValue); notify(); }
    if (e.key === SESSION) authListeners.forEach((fn) => fn(B.user));
  });
  function watch(compute, cb) {
    let last = null;
    const run = () => { const v = JSON.stringify(compute()); if (v !== last) { last = v; cb(JSON.parse(v)); } };
    listeners.add(run);
    setTimeout(run, 0);
    return () => listeners.delete(run);
  }
  const me = () => B.user;
  const need = () => { if (!B.user) throw new Error('Inicia sesión.'); return B.user; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const B = {
    mode: 'demo',
    adminEmail: ADMIN_EMAIL,
    user: null,

    async init(onAuth) {
      authListeners.add(onAuth);
      this.user = this._sessionUser();
      onAuth(this.user);
    },
    _sessionUser() {
      const uid = localStorage.getItem(SESSION);
      const u = uid && db.users[uid];
      if (!u) return null;
      return { uid, email: u.email, emailVerified: true, isAdmin: u.email === ADMIN_EMAIL };
    },
    _setSession(uid) {
      if (uid) localStorage.setItem(SESSION, uid); else localStorage.removeItem(SESSION);
      this.user = this._sessionUser();
      authListeners.forEach((fn) => fn(this.user));
    },

    async signUp({ name, email, password, phone }) {
      await sleep(250);
      email = String(email).trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('El correo no es válido.');
      if (db.auth[email]) throw new Error('Ya existe una cuenta con ese correo.');
      if (!password || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
      const uid = 'u' + rid();
      db.auth[email] = { uid, pw: password };
      db.users[uid] = { name: name.trim(), email, phone: phone || '', avatar: '', createdAt: Date.now() };
      commit();
      this._setSession(uid);
    },
    async signIn(email, password) {
      await sleep(250);
      const a = db.auth[String(email).trim().toLowerCase()];
      if (!a || a.pw !== password) throw new Error('Correo o contraseña incorrectos.');
      this._setSession(a.uid);
    },
    async signOut() { this._setSession(null); },
    async resetPassword() { await sleep(300); },
    async resendVerification() {},
    async refreshUser() { return this.user; },
    async deleteAccount(password) {
      const u = need();
      const a = db.auth[u.email];
      if (!a || a.pw !== password) throw new Error('Contraseña incorrecta.');
      Object.entries(db.pets).forEach(([id, p]) => { if (p.ownerId === u.uid) { delete db.pets[id]; delete db.messages[id]; delete db.records[id]; } });
      Object.entries(db.appts).forEach(([id, x]) => { if (x.ownerId === u.uid) delete db.appts[id]; });
      delete db.users[u.uid]; delete db.auth[u.email];
      commit();
      this._setSession(null);
    },
    demoAccounts: [
      { label: 'Clínica (admin)', email: ADMIN_EMAIL, password: DEMO_PW, icon: 'shield' },
      { label: 'Cliente', email: 'ana@demo.app', password: DEMO_PW, icon: 'paw' },
    ],
    async resetDemo() { Object.keys(localStorage).filter((k) => k.startsWith('visvet2')).forEach((k) => localStorage.removeItem(k)); db = load(); this._setSession(null); notify(); },

    /* ---------- Perfiles ---------- */
    watchProfile(uid, cb) { return watch(() => (db.users[uid] ? { id: uid, ...db.users[uid] } : null), cb); },
    async saveProfile(patch) { const u = need(); Object.assign(db.users[u.uid], clone(patch)); commit(); },
    watchUsers(cb) { return watch(() => (me()?.isAdmin ? Object.entries(db.users).map(([id, u]) => ({ id, ...u })) : []), cb); },

    /* ---------- Clínica ---------- */
    watchClinic(cb) { return watch(() => db.clinic, cb); },
    async saveClinic(info) { if (!me()?.isAdmin) throw new Error('Solo la clínica puede editar esto.'); db.clinic = { ...db.clinic, ...clone(info) }; commit(); },

    /* ---------- Animales ---------- */
    watchPets(cb) {
      return watch(() => {
        const u = me(); if (!u) return [];
        return Object.entries(db.pets).filter(([, p]) => u.isAdmin || p.ownerId === u.uid).map(([id, p]) => ({ id, ...p }));
      }, cb);
    },
    async savePet(pet) {
      const u = need();
      const id = pet.id || 'p' + rid();
      const prev = db.pets[id];
      if (prev && !u.isAdmin && prev.ownerId !== u.uid) throw new Error('No tienes permiso.');
      const data = clone(pet); delete data.id;
      db.pets[id] = Object.assign(prev || { ownerId: u.uid, createdAt: Date.now(), weights: [], unreadAdmin: 0, unreadOwner: 0, pendingAmount: 0 }, data);
      commit();
      return id;
    },
    async deletePet(id) { delete db.pets[id]; delete db.messages[id]; delete db.records[id]; Object.entries(db.appts).forEach(([k, a]) => { if (a.petId === id) delete db.appts[k]; }); commit(); },

    /* ---------- Chat ---------- */
    watchMessages(petId, cb) { return watch(() => db.messages[petId] || [], cb); },
    async sendMessage(pet, { text = '', files = [] }, onProgress) {
      const u = need();
      const attachments = [];
      for (let i = 0; i < files.length; i++) attachments.push(await this.uploadFile(files[i], { ownerId: pet.ownerId, petId: pet.id }, (k) => onProgress && onProgress((i + k) / files.length)));
      const m = { id: 'm' + rid(), from: u.uid, fromAdmin: u.isAdmin, text: text.trim(), files: attachments, createdAt: Date.now() };
      (db.messages[pet.id] = db.messages[pet.id] || []).push(m);
      const p = db.pets[pet.id];
      p.lastMessage = m.text || (attachments.length ? '📎 ' + attachments[0].name : '');
      p.lastMessageAt = m.createdAt; p.lastFromAdmin = u.isAdmin;
      if (u.isAdmin) p.unreadOwner = (p.unreadOwner || 0) + 1; else p.unreadAdmin = (p.unreadAdmin || 0) + 1;
      commit();
    },
    async markThreadRead(pet) {
      const u = me(); const p = db.pets[pet.id]; if (!u || !p) return;
      const k = u.isAdmin ? 'unreadAdmin' : 'unreadOwner';
      const r = u.isAdmin ? 'readByAdminAt' : 'readByOwnerAt';
      if (!p[k] && p[r] >= (p.lastMessageAt || 0)) return;
      p[k] = 0; p[r] = Date.now(); commit();
    },

    /* ---------- Cartilla ---------- */
    watchRecords(petId, cb) { return watch(() => (db.records[petId] || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt), cb); },
    async saveRecord(pet, rec, newFiles = [], onProgress) {
      const u = need(); if (!u.isAdmin) throw new Error('Solo la clínica puede editar la cartilla.');
      const uploaded = [];
      for (let i = 0; i < newFiles.length; i++) uploaded.push(await this.uploadFile(newFiles[i], { ownerId: pet.ownerId, petId: pet.id }, (k) => onProgress && onProgress((i + k) / newFiles.length)));
      const list = (db.records[pet.id] = db.records[pet.id] || []);
      const data = clone(rec);
      data.files = [...(data.files || []), ...uploaded];
      if (data.id) { const i = list.findIndex((x) => x.id === data.id); list[i] = { ...list[i], ...data, updatedAt: Date.now() }; }
      else list.push({ ...data, id: 'r' + rid(), createdAt: Date.now(), createdBy: u.uid });
      db.pets[pet.id].pendingAmount = list.filter((r) => r.type === 'factura' && !r.paid).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      db.pets[pet.id].lastRecordAt = Date.now();
      commit();
    },
    async deleteRecord(pet, rec) {
      const list = db.records[pet.id] || [];
      db.records[pet.id] = list.filter((r) => r.id !== rec.id);
      (rec.files || []).forEach((f) => localStorage.removeItem(FILE + f.id));
      db.pets[pet.id].pendingAmount = db.records[pet.id].filter((r) => r.type === 'factura' && !r.paid).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      commit();
    },

    /* ---------- Archivos ---------- */
    async uploadFile(file, { ownerId, petId }, onProgress) {
      if (file.size > 12 * 1048576) throw new Error(`«${file.name}» supera los 12 MB.`);
      const isImg = fileKind(file.type) === 'image';
      const url = isImg ? await compressImage(file, 1600, 0.82) : await readDataURL(file);
      if (url.length > 2.6 * 1048576) throw new Error('En modo demo los archivos deben ocupar menos de 2 MB.');
      for (let k = 1; k <= 4; k++) { await sleep(90); onProgress && onProgress(k / 4); }
      const id = 'f' + rid();
      try { localStorage.setItem(FILE + id, url); } catch (e) { throw new Error('No queda espacio en el navegador para este archivo (modo demo).'); }
      return { id, name: file.name, type: isImg ? 'image/jpeg' : file.type || 'application/octet-stream', size: isImg ? Math.round(url.length * 0.74) : file.size };
    },
    async openFile(meta) {
      if (urlCache.has(meta.id)) return urlCache.get(meta.id);
      const data = localStorage.getItem(FILE + meta.id);
      if (!data) throw new Error('El archivo ya no está disponible.');
      const u = URL.createObjectURL(dataURLtoBlob(data));
      urlCache.set(meta.id, u);
      return u;
    },

    /* ---------- Citas ---------- */
    watchAppointments(cb) {
      return watch(() => {
        const u = me(); if (!u) return [];
        return Object.entries(db.appts).filter(([, a]) => u.isAdmin || a.ownerId === u.uid).map(([id, a]) => ({ id, ...a }));
      }, cb);
    },
    async saveAppointment(a) {
      const u = need();
      const id = a.id || 'a' + rid();
      const data = clone(a); delete data.id;
      db.appts[id] = Object.assign(db.appts[id] || { createdAt: Date.now(), createdBy: u.uid }, data);
      commit();
      return id;
    },
  };
  return B;
}

/* =========================================================
 * Datos de ejemplo
 * ========================================================= */
function makePdf(lines) {
  const escp = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let y = 780;
  const content = ['BT'];
  lines.forEach((l, i) => {
    const size = i === 0 ? 22 : l.startsWith('#') ? 13 : 11;
    content.push(`/F${l.startsWith('#') || i === 0 ? 2 : 1} ${size} Tf`, `1 0 0 1 56 ${y} Tm`, `(${escp(l.replace(/^#/, ''))}) Tj`);
    y -= i === 0 ? 40 : l === '' ? 10 : 19;
  });
  content.push('ET', '0.12 0.85 0.68 rg', '56 800 60 4 re f');
  const stream = content.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return 'data:application/pdf;base64,' + btoa(pdf);
}

function seed() {
  const now = Date.now();
  const day = (n) => { const d = new Date(now + n * D); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const db = { v: 2, auth: {}, users: {}, pets: {}, messages: {}, records: {}, appts: {}, clinic: {} };
  const user = (uid, email, name, phone) => { db.auth[email] = { uid, pw: DEMO_PW }; db.users[uid] = { name, email, phone, avatar: '', createdAt: now - 60 * D }; };
  user('uadmin', ADMIN_EMAIL, 'Visvet', '+34 910 000 000');
  user('uana', 'ana@demo.app', 'Ana Martínez', '+34 600 111 222');
  user('ucarlos', 'carlos@demo.app', 'Carlos Gómez', '+34 600 333 444');
  db.clinic = { name: 'Visvet', phone: '+34 910 000 000', email: 'hola@visvet.app', address: 'Calle de la Salud 12, Madrid', hours: 'L–V 9:00–20:00 · S 10:00–14:00', emergency: '+34 600 000 112' };

  const pet = (id, ownerId, data) => { db.pets[id] = { ownerId, createdAt: now - 50 * D, unreadAdmin: 0, unreadOwner: 0, pendingAmount: 0, weights: [], photo: '', ...data }; };
  pet('ptoby', 'uana', { name: 'Toby', species: 'Perro', breed: 'Golden Retriever', sex: 'Macho', birthDate: day(-3 * 365 - 40), color: 'Dorado', chip: '941000024587312', sterilized: true, allergies: ['Pollo'], notes: 'Le dan miedo los petardos.',
    weights: [{ date: day(-300), kg: 29.4 }, { date: day(-210), kg: 30.8 }, { date: day(-120), kg: 31.5 }, { date: day(-40), kg: 32.6 }, { date: day(-5), kg: 32.1 }] });
  pet('pluna', 'uana', { name: 'Luna', species: 'Gato', breed: 'Europeo común', sex: 'Hembra', birthDate: day(-14 * 30), color: 'Atigrada', chip: '941000031277845', sterilized: false, allergies: [], notes: '',
    weights: [{ date: day(-200), kg: 2.1 }, { date: day(-120), kg: 3.0 }, { date: day(-30), kg: 3.6 }] });
  pet('pkiwi', 'ucarlos', { name: 'Kiwi', species: 'Ave', breed: 'Agapornis', sex: 'Hembra', birthDate: day(-2 * 365), color: 'Verde', chip: '', sterilized: false, allergies: [], notes: '', weights: [{ date: day(-60), kg: 0.05 }] });

  // archivos de ejemplo (PDF reales generados al vuelo)
  const files = {};
  const pdf = (id, name, lines) => { files[id] = makePdf(lines); return { id, name, type: 'application/pdf', size: Math.round(files[id].length * 0.74) }; };
  const f1 = pdf('fdemo1', 'Factura_2024-118.pdf', ['Visvet - Factura', '', '#Nº de factura: 2024-118', `Fecha: ${day(-12)}`, 'Cliente: Ana Martínez', 'Paciente: Toby (Golden Retriever)', '', '#Conceptos', 'Consulta general ........................... 35,00 EUR', 'Vacuna polivalente ...................... 42,00 EUR', 'Desparasitación interna ................ 18,50 EUR', '', '#Total: 95,50 EUR (IVA incluido)', '', 'Gracias por confiar en Visvet.']);
  const f2 = pdf('fdemo2', 'Analitica_Toby.pdf', ['Visvet - Analítica sanguínea', '', '#Paciente: Toby', `Fecha: ${day(-40)}`, '', 'Hematocrito ........ 48 %      (37 - 55)', 'Leucocitos ......... 9,8 x10^9/L (6 - 17)', 'Glucosa ............ 92 mg/dL  (70 - 143)', 'Urea ............... 34 mg/dL  (7 - 27)  ALTO', 'Creatinina ......... 1,1 mg/dL (0,5 - 1,8)', '', '#Comentario', 'Urea ligeramente elevada. Repetir en 3 meses y aumentar la hidratación.']);
  const f3 = pdf('fdemo3', 'Factura_2024-131.pdf', ['Visvet - Factura', '', '#Nº de factura: 2024-131', `Fecha: ${day(-3)}`, 'Cliente: Ana Martínez', 'Paciente: Luna (Gato)', '', '#Conceptos', 'Consulta y revisión ...................... 35,00 EUR', 'Vacuna trivalente felina ............... 38,00 EUR', '', '#Total: 73,00 EUR (IVA incluido)', '', 'Pendiente de pago.']);
  Object.entries(files).forEach(([id, url]) => { try { localStorage.setItem(FILE + id, url); } catch (e) { /* nada */ } });

  const rec = (petId, r) => (db.records[petId] = db.records[petId] || []).push({ id: 'r' + rid(), files: [], createdAt: now - Math.random() * 30 * D, createdBy: 'uadmin', ...r });
  rec('ptoby', { type: 'vacuna', title: 'Polivalente (DHPPi + L4)', date: day(-12), nextDate: day(353), notes: 'Lote A-2291. Sin reacciones.' });
  rec('ptoby', { type: 'vacuna', title: 'Rabia', date: day(-340), nextDate: day(25), notes: 'Obligatoria. Recordar revacunar este mes.' });
  rec('ptoby', { type: 'factura', title: 'Consulta + vacunación anual', date: day(-12), amount: 95.5, paid: true, files: [f1] });
  rec('ptoby', { type: 'analitica', title: 'Analítica sanguínea completa', date: day(-40), notes: 'Urea ligeramente alta. Repetir en 3 meses.', files: [f2] });
  rec('ptoby', { type: 'diagnostico', title: 'Otitis externa leve (oído derecho)', date: day(-40), notes: 'Limpieza diaria 7 días + gotas Otomax 2 veces al día.' });
  rec('ptoby', { type: 'receta', title: 'Otomax gotas óticas', date: day(-40), notes: '5 gotas cada 12 h durante 7 días.' });
  rec('pluna', { type: 'vacuna', title: 'Trivalente felina', date: day(-3), nextDate: day(18), notes: 'Primera dosis. Refuerzo en 3 semanas.' });
  rec('pluna', { type: 'factura', title: 'Revisión + vacuna trivalente', date: day(-3), amount: 73, paid: false, files: [f3] });
  rec('pluna', { type: 'informe', title: 'Revisión de cachorro', date: day(-3), notes: 'Buen estado general. Peso adecuado. Se recomienda esterilizar a partir de los 6 meses.' });
  rec('pkiwi', { type: 'diagnostico', title: 'Revisión anual: sana', date: day(-60), notes: 'Plumaje y pico en buen estado.' });
  db.pets.pluna.pendingAmount = 73;

  const msg = (petId, from, text, ago) => {
    const m = { id: 'm' + rid(), from, fromAdmin: from === 'uadmin', text, files: [], createdAt: now - ago };
    (db.messages[petId] = db.messages[petId] || []).push(m);
    const p = db.pets[petId]; p.lastMessage = text; p.lastMessageAt = m.createdAt; p.lastFromAdmin = m.fromAdmin;
  };
  msg('ptoby', 'uana', 'Hola, Toby se sigue rascando un poco la oreja derecha. ¿Es normal?', 26 * 3600000);
  msg('ptoby', 'uadmin', '¡Hola Ana! Es normal los primeros días. Si sigue igual el viernes, tráelo y lo revisamos sin coste.', 25 * 3600000);
  msg('ptoby', 'uana', 'Perfecto, muchas gracias 🙏', 24.8 * 3600000);
  msg('pluna', 'uadmin', 'Hola Ana, te hemos subido la factura de Luna y el informe de la revisión a su cartilla.', 3 * 3600000);
  msg('pkiwi', 'ucarlos', 'Buenas, ¿cada cuánto tengo que cortarle las uñas a Kiwi?', 40 * 60000);
  db.pets.ptoby.readByAdminAt = now - 24 * 3600000; db.pets.ptoby.readByOwnerAt = now - 24 * 3600000;
  db.pets.pluna.unreadOwner = 1;
  db.pets.pkiwi.unreadAdmin = 1;

  db.appts.a1 = { ownerId: 'uana', petId: 'ptoby', date: day(2), time: '10:30', reason: 'Revisión del oído', status: 'confirmada', note: 'Ven 5 minutos antes.', createdAt: now - 2 * D, createdBy: 'uana' };
  db.appts.a2 = { ownerId: 'uana', petId: 'pluna', date: day(18), time: '17:00', reason: 'Refuerzo de vacuna', status: 'pendiente', note: '', createdAt: now - 3600000, createdBy: 'uana' };
  db.appts.a3 = { ownerId: 'ucarlos', petId: 'pkiwi', date: day(0) === todayISO() ? day(0) : todayISO(), time: '18:30', reason: 'Corte de uñas y pico', status: 'confirmada', note: '', createdAt: now - D, createdBy: 'uadmin' };
  return db;
}

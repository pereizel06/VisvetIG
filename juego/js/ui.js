// Interfaz: menús, pantallas, modales, HUD y conexión con la partida
import { icon } from './icons.js';
import { fmt, fmtTime, fmtDur, msToMidnight, clamp } from './util.js';
import { CHAPTERS, WEAPONS, PASSIVES, PILOTS, UPGRADES, upgradeCost, RARITIES, SLOTS, CHESTS, gearStat, gearUpCost, DAILY_LOGIN, MISSIONS, ACTIVITY, PASS, SEASON, BOSSES, chapterMult } from './data.js';
import * as SV from './save.js';
import { S } from './save.js';
import { sfx, setMusic, applyAudioSettings, initAudio } from './audio.js';
import { playerSprite } from './sprites.js';
import { Game } from './game.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
let bg, tab = 'home', game = null, hudEls = null, clockTimer = 0;

// ---------- utilidades visuales ----------
const shipCache = {};
function shipURL(hue) {
  if (shipCache[hue]) return shipCache[hue];
  const s = playerSprite(hue), c = document.createElement('canvas'); c.width = c.height = 200; const x = c.getContext('2d');
  x.translate(100, 100); x.rotate(-Math.PI / 2); x.drawImage(s.img, -100, -100, 200, 200);
  return (shipCache[hue] = c.toDataURL());
}
function chestSVG(color, size = 92) {
  return `<svg viewBox="0 0 100 86" width="${size}" height="${size * 0.86}" style="filter:drop-shadow(0 0 14px ${color})">
  <defs><linearGradient id="cb${color.slice(1)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#140a2a"/></linearGradient></defs>
  <path d="M10 36h80v40a6 6 0 01-6 6H16a6 6 0 01-6-6z" fill="url(#cb${color.slice(1)})" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>
  <path d="M10 36c0-14 8-26 22-26h36c14 0 22 12 22 26z" fill="${color}" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>
  <path d="M10 36h80" stroke="#fff" stroke-width="3" stroke-opacity=".8"/><path d="M28 10v72M72 10v72" stroke="#000" stroke-opacity=".25" stroke-width="6"/>
  <rect x="42" y="30" width="16" height="20" rx="4" fill="#fff6c8" stroke="#7a4a00" stroke-width="2"/><circle cx="50" cy="40" r="3" fill="#7a4a00"/>
  <path d="M20 22c6-6 12-8 20-8" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`;
}
export function toast(msg, err) { const t = h(`<div class="toast ${err ? 'err' : ''}">${msg}</div>`); $('#toasts').append(t); setTimeout(() => t.remove(), 2500); }
function modal(inner, opts = {}) {
  const m = h(`<div class="modal"><div class="mbox ${opts.cls || ''}">${opts.close === false ? '' : `<button class="mclose">${icon('close')}</button>`}${inner}</div></div>`);
  $('#modals').append(m);
  const close = () => { m.remove(); opts.onClose?.(); };
  m.querySelector('.mclose')?.addEventListener('click', () => { sfx.click(); close(); });
  if (opts.close !== false) m.addEventListener('click', (e) => { if (e.target === m) close(); });
  m.close = close; return m;
}
function rewardTile(r, i = 0) {
  const d = `style="animation-delay:${i * 0.08}s"`;
  if (r.type === 'gold') return `<div class="rwi" ${d}>${icon('coin')}${fmt(r.n)}<small>Oro</small></div>`;
  if (r.type === 'gems') return `<div class="rwi" ${d} style="--rc:#b45cff;animation-delay:${i * 0.08}s">${icon('gem')}${fmt(r.n)}<small>Gemas</small></div>`;
  if (r.type === 'energy') return `<div class="rwi" ${d}>${icon('energy')}${r.n}<small>Energía</small></div>`;
  if (r.type === 'passXp') return `<div class="rwi" ${d}>${icon('passXp')}${r.n}<small>XP del pase</small></div>`;
  if (r.type === 'pilot') { const p = PILOTS.find((x) => x.id === r.id); return `<div class="rwi" style="--rc:#ffb72e;animation-delay:${i * 0.08}s"><img src="${shipURL(p.hue)}" width="44"><small>Piloto ${p.name}</small></div>`; }
  if (r.type === 'item') { const R = RARITIES[r.it.rarity]; return `<div class="rwi" style="--rc:${R.color};animation-delay:${i * 0.08}s"><span style="color:${R.color}">${icon(SLOTS[r.it.slot].icon)}</span><small style="color:${R.color}">${SLOTS[r.it.slot].names[r.it.rarity]}</small></div>`; }
  return '';
}
function flatten(list) { const out = []; for (const r of list) { if (r.type === 'chest') r.items.forEach((it) => out.push({ type: 'item', it })); else out.push(r); } return out; }
function showRewards(list, title = '¡Recompensas!', cb) {
  if (!list || !list.length) return;
  sfx.claim(); const flat = flatten(list);
  const m = modal(`<div class="burst"></div><h3 style="color:#ffe07a">${title}</h3><div class="rewards">${flat.map(rewardTile).join('')}</div><button class="btn green block ok">Genial</button>`, { onClose: () => { refresh(); cb?.(); } });
  m.querySelector('.ok').onclick = () => { sfx.click(); m.close(); };
  refresh();
}
const rwIcon = (r) => r.gold ? [icon('coin'), fmt(r.gold)] : r.gems ? [icon('gem'), fmt(r.gems)] : r.energy ? [icon('energy'), r.energy] : r.chest ? [`<span style="color:${CHESTS[r.chest].color}">${icon('chest')}</span>`, ''] : r.pilot ? [`<img src="${shipURL(PILOTS.find((p) => p.id === r.pilot).hue)}" width="34">`, 'NYX'] : r.passXp ? [icon('passXp'), r.passXp] : ['', ''];

// ---------- Estructura del menú ----------
export function initUI(menuBg) {
  bg = menuBg;
  const menu = $('#menu');
  menu.innerHTML = `
    <div class="topbar">
      <div class="profile"><div class="avatar" id="avatar"></div><div class="pw">PODER<b id="pw"></b></div></div>
      <div class="res" id="r-energy">${icon('energy')}<span></span><small></small></div>
      <div class="res" id="r-gold">${icon('coin')}<span></span></div>
      <div class="res" id="r-gems">${icon('gem')}<span></span><i class="plus">+</i></div>
    </div>
    <div class="screens" id="screens"></div>
    <nav class="tabbar">
      ${[['shop', 'shop', 'Tienda'], ['arsenal', 'sword', 'Arsenal'], ['home', 'battle', 'Batalla'], ['pass', 'pass', 'Pase'], ['pilots', 'user', 'Pilotos']].map(([id, ic, nm]) => `<button class="tab ${id === 'home' ? 'main' : ''}" data-tab="${id}">${icon(ic)}<span>${nm}</span></button>`).join('')}
    </nav>`;
  menu.querySelectorAll('.tab').forEach((b) => b.onclick = () => { sfx.click(); go(b.dataset.tab); });
  $('#r-gems').onclick = () => { sfx.click(); go('shop'); };
  $('#r-energy').onclick = () => { sfx.click(); energyModal(); };
  clearInterval(clockTimer); clockTimer = setInterval(() => { if (!game) { SV.tickEnergy(); updateTop(); if (tab === 'home') updatePatrol(); } }, 1000);
  showMenu();
}
function showMenu() {
  $('#menu').classList.remove('hidden'); $('#hud').classList.add('hidden'); $('#game').classList.add('hidden');
  bg.setChapter(S.chapter); bg.start(); setMusic('menu'); go(tab);
}
function go(t) { tab = t; document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); render(); }
function refresh() { render(true); }
function render(keepScroll) {
  const box = $('#screens'); if (!box) return;
  const prev = box.firstElementChild, st = keepScroll && prev ? prev.scrollTop : 0;
  const el = ({ home: homeScreen, shop: shopScreen, arsenal: arsenalScreen, pass: passScreen, pilots: pilotsScreen })[tab]();
  if (keepScroll) el.style.animation = 'none';
  box.innerHTML = ''; box.append(el); el.scrollTop = st; updateTop(); updateDots();
}
function updateTop() {
  if (!$('#r-gold')) return;
  $('#r-gold span').textContent = fmt(S.gold); $('#r-gems span').textContent = fmt(S.gems);
  $('#r-energy span').textContent = `${S.energy}/${SV.ENERGY_MAX}`; $('#r-energy small').textContent = S.energy < SV.ENERGY_MAX ? fmtTime(SV.energyNextMs() / 1000) : '';
  $('#pw').textContent = fmt(SV.power());
  const p = PILOTS.find((x) => x.id === S.pilot); const av = $('#avatar');
  av.textContent = p.name[0]; av.style.background = `linear-gradient(160deg, hsl(${p.hue},90%,55%), hsl(${p.hue + 40},80%,22%))`; av.style.setProperty('--glow', `hsla(${p.hue},100%,60%,.5)`);
}
function updateDots() {
  const set = (t, on) => { const b = document.querySelector(`.tab[data-tab="${t}"]`); if (!b) return; b.querySelector('.dot')?.remove(); if (on) b.append(h('<i class="dot"></i>')); };
  set('pass', SV.passClaimable()); set('shop', SV.giftReady()); set('home', SV.loginAvailable() || SV.missionsClaimable());
  set('arsenal', UPGRADES.some((u) => S.gold >= upgradeCost(S.upgrades[u.id])) || SV.mergeable().length > 0);
}

// ---------- INICIO ----------
function homeScreen() {
  const i = S.chapter, ch = CHAPTERS[i], locked = i > S.maxChapter, cleared = S.cleared.includes(i);
  const el = h(`<div class="screen home">
    <div class="chap-head"><button class="arrow" id="prev" ${i === 0 ? 'disabled' : ''}>${icon('left')}</button><div class="mid"><div class="n">Capítulo ${i + 1}</div><h2>${ch.name}</h2>
      <div class="best">${cleared ? `<span class="cleared">${icon('check')} SUPERADO</span>` : `<span>Jefe: <b>${BOSSES[ch.boss].name}</b></span>`}</div></div>
      <button class="arrow" id="next" ${i >= CHAPTERS.length - 1 ? 'disabled' : ''}>${icon('right')}</button></div>
    <div class="planet-zone">${locked ? `<div class="lockedtag">${icon('lock')} Supera el capítulo ${i}</div>` : ''}</div>
    <div class="power">${icon('sword')} Poder recomendado <b>${fmt(Math.round(1150 * Math.pow(1.45, i)))}</b></div>
    <button class="play ${locked || S.energy < SV.ENERGY_COST ? 'dis' : ''}" id="play">JUGAR<small>${icon('energy')} ${SV.ENERGY_COST}</small></button>
  </div>`);
  const side = h(`<div><div class="side l">
      <button class="sbtn" id="b-login"><span class="ib" style="color:#ffd36b">${icon('calendar')}</span>Diario${SV.loginAvailable() ? '<i class="dot"></i>' : ''}</button>
      <button class="sbtn" id="b-mis"><span class="ib" style="color:#6ff0ff">${icon('mission')}</span>Misiones${SV.missionsClaimable() ? '<i class="dot"></i>' : ''}</button>
    </div><div class="side r">
      <button class="sbtn" id="b-patrol"><span class="ib" style="color:#5dff9c">${icon('patrol')}</span>Patrulla<span class="mini" id="patrol-g"></span></button>
      <button class="sbtn" id="b-set"><span class="ib" style="color:#c7d2ff">${icon('gear')}</span>Ajustes</button>
    </div></div>`);
  el.prepend(...side.children);
  el.querySelector('#prev').onclick = () => { sfx.click(); S.chapter = Math.max(0, i - 1); bg.setChapter(S.chapter); SV.saveSoon(); render(); };
  el.querySelector('#next').onclick = () => { sfx.click(); S.chapter = Math.min(CHAPTERS.length - 1, i + 1); bg.setChapter(S.chapter); SV.saveSoon(); render(); };
  el.querySelector('#play').onclick = () => {
    if (locked) { toast('Capítulo bloqueado', true); return; }
    if (!SV.startRunCost()) { sfx.click(); energyModal(); return; }
    startGame();
  };
  el.querySelector('#b-login').onclick = () => { sfx.click(); loginModal(); };
  el.querySelector('#b-mis').onclick = () => { sfx.click(); missionsModal(); };
  el.querySelector('#b-patrol').onclick = () => { sfx.click(); patrolModal(); };
  el.querySelector('#b-set').onclick = () => { sfx.click(); settingsModal(); };
  setTimeout(updatePatrol);
  return el;
}
function updatePatrol() { const e = $('#patrol-g'); if (e) e.textContent = fmt(SV.patrolGold()); }

function energyModal() {
  const free = S.energyBuysKey !== new Date().toDateString();
  const m = modal(`<h3>Energía</h3><div class="msub">Cada partida cuesta ${SV.ENERGY_COST} de energía. Se recupera 1 cada 5 minutos.</div>
    <div class="rewards"><div class="rwi">${icon('energy')}${S.energy}<small>Actual</small></div></div>
    <div class="row" style="flex-direction:column;gap:8px">
      <button class="btn green block" id="free" ${free ? '' : 'disabled'}>${icon('gift')} Recarga diaria gratis (+15)</button>
      <button class="btn purple block" id="buy">${icon('energy')} +30 energía · ${icon('gem')} 50</button></div>`);
  m.querySelector('#free').onclick = () => { S.energyBuysKey = new Date().toDateString(); S.energy += 15; SV.save(); m.close(); showRewards([{ type: 'energy', n: 15 }]); };
  m.querySelector('#buy').onclick = () => { if (SV.buyEnergy()) { m.close(); showRewards([{ type: 'energy', n: 30 }]); } else toast('No tienes suficientes gemas', true); };
}

function loginModal() {
  const today = S.login.day % 7, avail = SV.loginAvailable();
  const cells = DAILY_LOGIN.map((r, i) => {
    const isToday = i === today && avail, [ic, n] = rwIcon(r), allDone = !avail && today === 0 && S.login.day > 0;
    const cls = (i < today || allDone) ? 'done' : isToday ? 'today' : '';
    return `<div class="lday ${i === 6 ? 'big' : ''} ${cls}"><span>Día ${i + 1}</span>${ic}<b>${n || (r.chest ? 'Cofre épico' : '')}</b>${r.gems && r.chest ? `<small style="color:#c27bff">+ cofre épico</small>` : ''}</div>`;
  }).join('');
  const m = modal(`<div class="ribbon">INICIO DIARIO</div><h3 style="margin-top:10px">Recompensas diarias</h3><div class="msub">Entra cada día para conseguir premios cada vez mejores.</div>
    <div class="login-grid">${cells}</div><div style="margin-top:16px">${avail ? `<button class="btn gold block" id="claim">${icon('gift')} Reclamar</button>` : `<button class="btn ghost block" disabled>Vuelve en ${fmtDur(msToMidnight())}</button>`}</div>`);
  m.querySelector('#claim')?.addEventListener('click', () => { const r = SV.claimLogin(); m.close(); showRewards(r, `Día ${S.login.day}`); });
}

function missionsModal() {
  SV.ensureDaily(); const pts = SV.activityPts(), maxPts = ACTIVITY[ACTIVITY.length - 1].pts;
  const m = modal(`<h3>Misiones diarias</h3><div class="msub">Se renuevan en ${fmtDur(msToMidnight())}</div>
    <div class="act"><div class="bar gold"><i style="width:${clamp(pts / maxPts, 0, 1) * 100}%"></i></div>
      ${ACTIVITY.map((a, i) => { const done = S.daily.act.includes(i), ready = !done && pts >= a.pts; return `<button class="chestb ${done ? 'done' : ready ? 'ready' : ''}" data-a="${i}">${icon(done ? 'check' : 'chest')}<small>${a.pts}</small></button>`; }).join('')}</div>
    <div style="font-family:var(--head);font-size:12px;color:var(--dim);margin:20px 0 10px;text-align:center;letter-spacing:.1em">ACTIVIDAD: <b style="color:#ffd36b">${pts}</b></div>
    ${MISSIONS.map((ms) => { const pr = Math.min(ms.goal, S.daily.prog[ms.id] || 0), done = S.daily.claimed.includes(ms.id), ready = !done && pr >= ms.goal;
      return `<div class="mis ${done ? 'done' : ''}"><div class="grow"><div class="tx">${ms.text}</div><div class="bar"><i style="width:${pr / ms.goal * 100}%"></i></div></div>
      <div style="text-align:right"><div class="rw">${icon('gem')}${ms.gems} · +${ms.pts}</div>
      ${done ? `<span class="tag" style="color:var(--green)">HECHO</span>` : ready ? `<button class="btn green sm" data-m="${ms.id}">Reclamar</button>` : `<span class="tag">${pr}/${ms.goal}</span>`}</div></div>`; }).join('')}`);
  m.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { const r = SV.claimMission(b.dataset.m); m.close(); showRewards(r, 'Misión completada', missionsModal); });
  m.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => { const i = +b.dataset.a; const r = SV.claimActivity(i); if (r) { m.close(); showRewards(r, 'Cofre de actividad', missionsModal); } else if (!S.daily.act.includes(i)) toast(`Necesitas ${ACTIVITY[i].pts} de actividad`); });
}

function patrolModal() {
  const g = SV.patrolGold(), ms = SV.patrolMs();
  const m = modal(`<h3>Patrulla automática</h3><div class="msub">Tu escuadrón recoge oro mientras no juegas (máx. 12 h).<br>Supera capítulos para aumentar el botín.</div>
    <div class="rewards"><div class="rwi">${icon('coin')}${fmt(g)}<small>Acumulado</small></div><div class="rwi">${icon('clock')}${fmtDur(ms)}<small>Tiempo</small></div><div class="rwi">${icon('patrol')}${fmt(SV.patrolRate())}<small>Oro / hora</small></div></div>
    <div class="bar gold" style="margin-bottom:14px"><i style="width:${ms / SV.PATROL_MAX_MS * 100}%"></i></div>
    <button class="btn gold block" id="claim" ${g < 1 ? 'disabled' : ''}>${icon('coin')} Reclamar</button>`);
  m.querySelector('#claim').onclick = () => { const r = SV.claimPatrol(); m.close(); showRewards(r, 'Patrulla'); };
}

function settingsModal() {
  const row = (k, nm) => `<div class="setting"><span>${nm}</span><button class="tgl ${S.settings[k] ? 'on' : ''}" data-k="${k}"></button></div>`;
  const m = modal(`<h3>Ajustes</h3><div class="msub">ECLIPSE · Grieta Estelar · v1.0</div>
    ${row('music', 'Música')}${row('sfx', 'Efectos de sonido')}${row('shake', 'Vibración de cámara')}${row('dmgNums', 'Números de daño')}
    <div class="sub">Estadísticas</div><div class="rstats"><div><small>PARTIDAS</small><b>${fmt(S.stats.runs)}</b></div><div><small>BAJAS</small><b>${fmt(S.stats.kills)}</b></div><div><small>JEFES</small><b>${fmt(S.stats.bosses)}</b></div></div>
    <div style="font-size:12px;color:var(--dim);margin:14px 0 8px;line-height:1.5">Consejo: en iPhone, pulsa <b>Compartir → Añadir a pantalla de inicio</b> para jugar a pantalla completa como una app.</div>
    <button class="btn red sm" id="reset">Borrar progreso</button>`);
  m.querySelectorAll('.tgl').forEach((t) => t.onclick = () => { const k = t.dataset.k; S.settings[k] = !S.settings[k]; t.classList.toggle('on', S.settings[k]); applyAudioSettings(); SV.save(); sfx.click(); });
  m.querySelector('#reset').onclick = () => { if (confirm('¿Seguro? Se borrará todo tu progreso.')) SV.resetAll(); };
}

// ---------- TIENDA ----------
function shopScreen() {
  const ready = SV.giftReady();
  const el = h(`<div class="screen"><div class="title">${icon('shop')} Tienda</div>
    <div class="panel gift"><div class="ibox" style="--c1:#13b067;--c2:#06301c">${icon('gift')}</div><div class="grow"><b style="font-family:var(--head);font-size:16px">Regalo de la flota</b>
      <div style="font-size:12.5px;color:var(--dim)">30 gemas + 500 de oro cada 4 horas</div></div>
      ${ready ? `<button class="btn green sm" id="gift">Gratis</button>` : `<span class="tag">${fmtDur(SV.FREE_GIFT_MS - (Date.now() - S.giftTs))}</span>`}</div>
    <div class="sub">Cofres de equipo</div>
    <div class="shop-grid">${Object.entries(CHESTS).map(([id, c]) => {
      const cost = (n) => c.cost.gold ? `${icon('coin')} ${fmt(c.cost.gold * n)}` : `${icon('gem')} ${fmt(n === 10 ? c.cost.gems * 9 : c.cost.gems)}`;
      const odds = c.odds.map((o, i) => o ? `<span style="color:${RARITIES[i].color}">${RARITIES[i].name} ${(o * 100).toFixed(o < 0.01 ? 1 : 0)}%</span>` : '').filter(Boolean).join(' · ');
      return `<div class="panel chest-card" style="${id === 'legend' ? 'grid-column:span 2;background:linear-gradient(160deg,rgba(255,180,40,.18),rgba(14,18,40,.8))' : ''}"><div class="chest-art">${chestSVG(c.color)}</div><h4>${c.name}</h4><div class="odds">${odds}</div>
        <div class="btns"><button class="btn ${c.cost.gold ? 'gold' : 'purple'} sm" data-c="${id}" data-n="1">${cost(1)}</button>${c.cost.gems ? `<button class="btn purple sm" data-c="${id}" data-n="10">x10 · ${cost(10)}</button>` : ''}</div></div>`; }).join('')}</div>
    <div style="font-size:11px;color:var(--dim);text-align:center;margin-top:8px">El x10 de gemas cuesta como 9 y garantiza al menos un objeto Épico.</div>
    <div class="sub">Suministros</div>
    <div class="panel row"><div class="ibox" style="--c1:#14c79a;--c2:#063026">${icon('energy')}</div><div class="grow"><b style="font-family:var(--head)">Célula de energía</b><div style="font-size:12px;color:var(--dim)">+30 de energía</div></div><button class="btn purple sm" id="en">${icon('gem')} 50</button></div>
    <div class="panel row" style="margin-top:10px"><div class="ibox" style="--c1:#d09a1a;--c2:#3a2600">${icon('coin')}</div><div class="grow"><b style="font-family:var(--head)">Saca de oro</b><div style="font-size:12px;color:var(--dim)">+${fmt(5000 + S.maxChapter * 2500)} de oro</div></div><button class="btn purple sm" id="gb">${icon('gem')} 100</button></div>
  </div>`);
  el.querySelector('#gift')?.addEventListener('click', () => showRewards(SV.claimGift(), 'Regalo'));
  el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => openChestUI(b.dataset.c, +b.dataset.n));
  el.querySelector('#en').onclick = () => { if (SV.buyEnergy()) showRewards([{ type: 'energy', n: 30 }]); else toast('No tienes suficientes gemas', true); };
  el.querySelector('#gb').onclick = () => { if (S.gems < 100) return toast('No tienes suficientes gemas', true); S.gems -= 100; showRewards(SV.grant({ gold: 5000 + S.maxChapter * 2500 })); };
  return el;
}
function openChestUI(type, n) {
  const items = SV.openChest(type, n);
  if (!items) { toast(CHESTS[type].cost.gold ? 'No tienes suficiente oro' : 'No tienes suficientes gemas', true); return; }
  sfx.chest();
  const best = Math.max(...items.map((i) => i.rarity)), col = RARITIES[best].color;
  const m = modal(`<div class="chest-open"><div class="burst" style="top:95px"></div><div class="chest-big">${chestSVG(CHESTS[type].color, 150)}</div>
    <div class="rewards hidden" id="rw">${items.map((it, i) => rewardTile({ type: 'item', it }, i)).join('')}</div>
    <button class="btn green block hidden" id="ok">Genial</button></div>`, { close: false, onClose: refresh });
  setTimeout(() => {
    m.querySelector('.chest-big').style.cssText = `transform:scale(1.4);opacity:0;transition:.35s;filter:drop-shadow(0 0 40px ${col})`;
    setTimeout(() => { m.querySelector('.chest-big').remove(); m.querySelector('#rw').classList.remove('hidden'); m.querySelector('#ok').classList.remove('hidden'); if (best >= 3) toast(`<span style="color:${col}">¡${RARITIES[best].name}!</span>`); }, 330);
  }, 900);
  m.querySelector('#ok').onclick = () => { sfx.click(); m.close(); };
}

// ---------- ARSENAL ----------
function arsenalScreen() {
  const st = SV.metaStats(), p = PILOTS.find((x) => x.id === S.pilot);
  const merges = SV.mergeable().length;
  const inv = [...S.gear].sort((a, b) => b.rarity - a.rarity || b.lvl - a.lvl);
  const eqIds = Object.values(S.equipped);
  const el = h(`<div class="screen"><div class="title">${icon('sword')} Arsenal</div>
    <div class="panel hero-card"><img class="ship" src="${shipURL(p.hue)}"><div class="stats">
      <div>${icon('sword')}Daño<b>${Math.round(st.dmg * 100)}%</b></div><div>${icon('heart')}Vida<b>${fmt(st.hp)}</b></div>
      <div>${icon('shield')}Defensa<b>${st.def}</b></div><div>${icon('speed')}Velocidad<b>${Math.round(st.speed * 100)}%</b></div>
      <div>${icon('magnet')}Atracción<b>${Math.round(st.magnet * 100)}%</b></div><div>${icon('crit')}Crítico<b>${Math.round(st.crit * 100)}%</b></div></div></div>
    <div class="slots">${Object.entries(SLOTS).map(([k, s]) => { const it = S.gear.find((g) => g.id === S.equipped[k]); return it ? `<button class="slot has item" data-i="${it.id}" style="--rc:${RARITIES[it.rarity].color}">${icon(s.icon)}<span class="lv">${it.lvl}</span><small>${s.name}</small></button>` : `<div class="slot">${icon(s.icon)}<small>${s.name}</small></div>`; }).join('')}</div>
    <div class="sub">Mejoras permanentes</div>
    ${UPGRADES.map((u) => { const lv = S.upgrades[u.id], c = upgradeCost(lv); return `<div class="panel upg"><div class="ibox" style="--c1:#2a6ad8;--c2:#0c1c46">${icon(u.icon)}<span class="lv">${lv}</span></div>
      <div class="grow"><div class="nm">${u.name}</div><div class="ds">${u.desc}: ${lv * u.per}${u.unit} <b>→ ${(lv + 1) * u.per}${u.unit}</b></div></div>
      <button class="btn gold sm ${S.gold < c ? 'dis' : ''}" data-u="${u.id}">${icon('coin')} ${fmt(c)}</button></div>`; }).join('')}
    <div class="sub row" style="justify-content:space-between"><span>Inventario (${S.gear.length})</span>${merges ? `<button class="btn purple sm" id="merge">${icon('merge')} Fusionar (${merges})</button>` : ''}</div>
    ${inv.length ? `<div class="inv">${inv.map((it) => `<button class="item ${eqIds.includes(it.id) ? 'eq' : ''}" data-i="${it.id}" style="--rc:${RARITIES[it.rarity].color}">${icon(SLOTS[it.slot].icon)}<span class="lv">${it.lvl}</span></button>`).join('')}</div>` : `<div class="panel empty">Abre cofres en la tienda para conseguir equipo.<br>3 objetos iguales se fusionan en uno de rareza superior.</div>`}
  </div>`);
  el.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => { if (SV.buyUpgrade(b.dataset.u)) { sfx.claim(); refresh(); } else toast('No tienes suficiente oro', true); });
  el.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { sfx.click(); itemModal(+b.dataset.i); });
  el.querySelector('#merge')?.addEventListener('click', () => { const made = SV.mergeAll(); sfx.evolve(); showRewards(made.map((it) => ({ type: 'item', it })), '¡Fusión completada!'); });
  return el;
}
function itemModal(id) {
  const it = S.gear.find((g) => g.id === id); if (!it) return;
  const R = RARITIES[it.rarity], s = SLOTS[it.slot], eq = S.equipped[it.slot] === id, c = gearUpCost(it), max = it.lvl >= R.cap;
  const nextStat = gearStat({ ...it, lvl: it.lvl + 1 });
  const m = modal(`<div style="text-align:center"><div class="item" style="--rc:${R.color};width:90px;margin:6px auto 10px;font-size:46px">${icon(s.icon)}</div>
    <h3 style="color:${R.color}">${s.names[it.rarity]}</h3><div class="msub">${R.name} · ${s.name} · Nivel ${it.lvl}/${R.cap}</div>
    <div class="panel" style="margin-bottom:14px;font-family:var(--head);font-size:18px">+${gearStat(it).toFixed(1)}${s.unit} ${max ? '' : `<span style="color:var(--green);font-size:14px">→ +${nextStat.toFixed(1)}</span>`}</div>
    <div class="row">${eq ? `<button class="btn ghost grow" disabled>Equipado</button>` : `<button class="btn grow" id="eq">Equipar</button>`}
    <button class="btn gold grow ${max || S.gold < c ? 'dis' : ''}" id="up">${max ? 'Nivel máx.' : `${icon('coin')} ${fmt(c)}`}</button></div></div>`, { onClose: refresh });
  m.querySelector('#eq')?.addEventListener('click', () => { SV.equip(id); sfx.claim(); m.close(); });
  m.querySelector('#up').onclick = () => { if (SV.upgradeItem(id)) { sfx.claim(); m.close(); itemModal(id); } };
}

// ---------- PASE ----------
function passScreen() {
  const lvl = SV.passLevel(), xpIn = S.pass.xp - lvl * SEASON.xpPerTier, maxed = lvl >= SEASON.tiers;
  const rows = [];
  for (let i = 0; i < SEASON.tiers; i++) {
    const cell = (track) => {
      const r = PASS[track][i], [ic, n] = rwIcon(r), claimed = (track === 'free' ? S.pass.free : S.pass.prem).includes(i);
      const ready = i < lvl && !claimed && (track === 'free' || S.pass.premium), lockedP = track === 'prem' && !S.pass.premium;
      return `<button class="preward ${track === 'prem' ? 'prem' : ''} ${claimed ? 'claimed' : ready ? 'ready' : ''} ${i >= lvl ? 'locked' : ''}" data-t="${track}" data-i="${i}">${lockedP ? `<span class="lk">${icon('lock')}</span>` : ''}${ic}<span>${n}</span></button>`;
    };
    rows.push(`<div class="prow">${cell('free')}<div class="pnode ${i < lvl ? 'got' : ''}">${i + 1}</div>${cell('prem')}</div>`);
  }
  const el = h(`<div class="screen"><div class="title">${icon('pass')} Pase Estelar</div>
    <div class="panel pass-head"><div class="row"><div class="lvl">${lvl}<small>NIVEL</small></div><div class="grow"><h3>${SEASON.name}</h3>
      <div style="font-size:12px;color:#d6dcff;margin:2px 0 8px">Termina en ${fmtDur(SEASON.end - Date.now())}</div>
      <div class="bar gold"><i style="width:${maxed ? 100 : xpIn / SEASON.xpPerTier * 100}%"></i></div><div style="font-size:11px;color:var(--dim);margin-top:4px;font-family:var(--head)">${maxed ? 'MÁXIMO' : `${xpIn}/${SEASON.xpPerTier} XP`}</div></div></div>
      ${S.pass.premium ? `<div class="tag" style="margin-top:12px;display:inline-block;color:var(--gold)">★ PASE PREMIUM ACTIVO</div>` : `<button class="btn gold block" id="prem" style="margin-top:12px">Desbloquear Premium · ${icon('gem')} ${SEASON.premiumCost}</button><div style="font-size:11px;color:#d6dcff;margin-top:6px;text-align:center">Incluye el piloto exclusivo <b style="color:var(--gold)">NYX · Eclipse</b>, cofres legendarios y +3.000 gemas</div>`}
    </div>
    ${SV.passClaimable() ? `<button class="btn green block" id="all" style="margin-top:12px">${icon('gift')} Reclamar todo</button>` : ''}
    <div class="ptrack-h"><span>GRATIS</span><span></span><span class="prem">★ PREMIUM</span></div>
    ${rows.join('')}
    <div style="font-size:12px;color:var(--dim);text-align:center;margin-top:8px">Gana XP del pase jugando partidas y completando misiones diarias.</div></div>`);
  el.querySelector('#prem')?.addEventListener('click', () => { if (SV.buyPremium()) { sfx.evolve(); toast('¡Pase Premium desbloqueado!'); refresh(); } else toast('No tienes suficientes gemas', true); });
  el.querySelector('#all')?.addEventListener('click', () => showRewards(SV.claimAllPass(), 'Pase Estelar'));
  el.querySelectorAll('.preward').forEach((b) => b.onclick = () => { const r = SV.claimPass(b.dataset.t, +b.dataset.i); if (r) showRewards(r, 'Pase Estelar'); else if (b.dataset.t === 'prem' && !S.pass.premium) toast('Requiere el Pase Premium'); });
  // desplazar hasta el nivel actual
  setTimeout(() => { const n = el.querySelectorAll('.prow')[Math.max(0, lvl - 2)]; if (n && lvl > 2) el.scrollTop = n.offsetTop - 120; }, 30);
  return el;
}

// ---------- PILOTOS ----------
function pilotsScreen() {
  const el = h(`<div class="screen"><div class="title">${icon('user')} Pilotos</div>
    ${PILOTS.map((p) => { const own = S.pilots.includes(p.id), sel = S.pilot === p.id, W = WEAPONS[p.weapon];
      return `<div class="panel pilot ${sel ? 'sel' : ''}" style="background:linear-gradient(120deg,hsla(${p.hue},90%,40%,.25),rgba(14,18,40,.8) 60%)"><img class="ship" src="${shipURL(p.hue)}">
      <div class="grow"><h4 style="color:hsl(${p.hue},100%,75%)">${p.name}<small>${p.title}</small></h4>
      <div class="perk">Arma: <b>${W.name}</b></div><div class="perk">Bonus: <b>${p.perk}</b></div>
      <div style="margin-top:8px">${sel ? `<span class="tag" style="color:var(--acc)">SELECCIONADO</span>` : own ? `<button class="btn sm" data-sel="${p.id}">Elegir</button>` : p.cost > 0 ? `<button class="btn purple sm" data-buy="${p.id}">${icon('gem')} ${p.cost}</button>` : `<span class="tag" style="color:var(--gold)">★ Pase Premium · Nivel 30</span>`}</div></div></div>`; }).join('')}</div>`);
  el.querySelectorAll('[data-sel]').forEach((b) => b.onclick = () => { S.pilot = b.dataset.sel; SV.save(); sfx.claim(); refresh(); });
  el.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => { const p = PILOTS.find((x) => x.id === b.dataset.buy); if (S.gems < p.cost) return toast('No tienes suficientes gemas', true); S.gems -= p.cost; S.pilots.push(p.id); S.pilot = p.id; SV.save(); showRewards([{ type: 'pilot', id: p.id }], '¡Nuevo piloto!'); });
  return el;
}

// ---------- PARTIDA ----------
function startGame() {
  initAudio();
  bg.stop(); $('#menu').classList.add('hidden');
  const cv = $('#game'); cv.classList.remove('hidden');
  const pilot = PILOTS.find((x) => x.id === S.pilot);
  buildHud();
  game = window.__game = new Game(cv, {
    chapter: S.chapter, meta: SV.metaStats(), weapon: pilot.weapon, pilotHue: pilot.hue, settings: S.settings,
    onHud: updateHud, onLevelUp: levelUpModal, onBanner: banner, onBoss: bossBar, onDeath: deathModal, onEnd: endGame,
    onChest: (c) => { banner(c.kind === 'evo' ? '¡EVOLUCIÓN!' : '¡COFRE!', c.kind === 'evo' ? c.name : `${c.name} · Nv.${c.lvl}`, 'gold'); if (c.kind !== 'evo') sfx.claim(); },
    onFirstMove: () => { const hn = $('.hint'); if (hn) hn.remove(); if (S.tutorial) { S.tutorial = false; SV.save(); } },
  });
}
function buildHud() {
  const hud = $('#hud'); hud.classList.remove('hidden');
  hud.innerHTML = `<div class="hud-top"><div class="xpbar"><i></i><span>NV. 1</span></div>
    <div class="hud-row"><div class="hud-stat" style="color:#ff8aa0">${icon('skull')}<span id="h-k">0</span></div><div class="hud-timer" id="h-t">0:00</div>
    <div class="row" style="gap:8px"><div class="hud-stat" style="color:#ffd36b;min-width:0">${icon('coin')}<span id="h-g">0</span></div><button class="hud-pause">${icon('pause')}</button></div></div></div>
    <div class="hud-skills"></div>${S.tutorial ? `<div class="hint"><span class="hand">👆</span>ARRASTRA PARA MOVERTE<br><small style="font-size:11px;opacity:.8">Las armas disparan solas</small></div>` : ''}`;
  hud.querySelector('.hud-pause').onclick = () => { sfx.click(); pauseModal(); };
  hudEls = { xp: hud.querySelector('.xpbar i'), lv: hud.querySelector('.xpbar span'), k: $('#h-k'), t: $('#h-t'), g: $('#h-g'), sk: hud.querySelector('.hud-skills'), last: {} };
}
function updateHud(g) {
  const E = hudEls, L = E.last, p = g.p;
  const xpw = (p.xp / p.need * 100).toFixed(1); if (L.xp !== xpw) { E.xp.style.width = xpw + '%'; L.xp = xpw; }
  if (L.lv !== p.lvl) { E.lv.textContent = 'NV. ' + p.lvl; L.lv = p.lvl; }
  if (L.k !== g.kills) { E.k.textContent = fmt(g.kills); L.k = g.kills; }
  const ts = fmtTime(g.t); if (L.t !== ts) { E.t.textContent = ts; L.t = ts; }
  if (L.g !== g.gold) { E.g.textContent = fmt(g.gold); L.g = g.gold; }
  const sig = JSON.stringify([g.weapons, g.passives].map((o) => Object.entries(o).map(([k, v]) => k + (v.lvl || v) + (v.evo ? 'e' : ''))));
  if (L.sk !== sig) {
    L.sk = sig;
    E.sk.innerHTML = Object.entries(g.weapons).map(([k, w]) => `<div class="sk ${w.evo ? 'evo' : ''}">${icon(WEAPONS[k].icon)}<b>${w.evo ? '★' : w.lvl}</b></div>`).join('') +
      Object.entries(g.passives).map(([k, v]) => `<div class="sk" style="color:#c9a6ff">${icon(PASSIVES[k].icon)}<b>${v}</b></div>`).join('');
  }
  if (g.boss && E.bb) { const f = Math.max(0, g.boss.hp / g.boss.maxHp * 100).toFixed(1); if (L.bb !== f) { E.bb.style.width = f + '%'; E.bbu.style.width = f + '%'; L.bb = f; } }
}
function banner(title, sub, kind = '') {
  const b = h(`<div class="banner ${kind}"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>`); $('#hud').append(b); setTimeout(() => b.remove(), 2500);
}
function bossBar(b) {
  $('.bossbar')?.remove(); if (!b) { hudEls.bb = null; return; }
  const el = h(`<div class="bossbar"><div class="nm">${b.d.name}</div><div class="bb"><u></u><i></i></div></div>`);
  $('#hud').append(el); hudEls.bb = el.querySelector('i'); hudEls.bbu = el.querySelector('u'); hudEls.last.bb = null;
  banner(b.d.name, '¡Derrótalo para completar el capítulo!', 'boss');
}
function levelUpModal(choices) {
  const draw = (m, list) => {
    m.querySelector('.cards').innerHTML = list.map((c, i) => {
      const cur = c.kind === 'weapon' ? (game.weapons[c.id]?.lvl || 0) : c.kind === 'passive' ? (game.passives[c.id] || 0) : 0;
      return `<button class="card ${c.kind}" data-i="${i}"><div class="ibox">${icon(c.icon)}</div><div class="grow"><h4>${c.name} ${c.isNew ? '<span class="new">NUEVO</span>' : c.kind === 'evo' ? '<span class="new" style="background:var(--gold)">EVOLUCIÓN</span>' : ''}</h4>
        <p>${c.desc}</p>${c.kind === 'weapon' || c.kind === 'passive' ? `<div class="stars">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= cur ? 'on' : n === c.lvl ? 'on" style="opacity:.5' : ''}"></i>`).join('')}</div>` : ''}</div></button>`;
    }).join('');
    m.querySelectorAll('.card').forEach((b) => b.onclick = () => { sfx.claim(); m.close(); game.choose(list[+b.dataset.i]); });
  };
  const m = modal(`<div class="lvlup"><h3>¡NIVEL ${game.p.lvl}!</h3><div class="msub" style="margin:0">Elige una mejora</div><div class="cards"></div>
    <button class="btn ghost sm" id="reroll" ${game.rerolls > 0 ? '' : 'disabled'}>${icon('dice')} Cambiar opciones (${game.rerolls})</button></div>`, { close: false, cls: 'lvlbox' });
  m.querySelector('.mbox').style.cssText = 'background:transparent;border:0;box-shadow:none';
  draw(m, choices);
  m.querySelector('#reroll').onclick = (e) => { if (game.rerolls <= 0) return; game.rerolls--; sfx.click(); draw(m, game.choices(3)); e.currentTarget.innerHTML = `${icon('dice')} Cambiar opciones (${game.rerolls})`; if (!game.rerolls) e.currentTarget.disabled = true; };
}
function pauseModal() {
  if (!game || game.paused) return; game.pause(true);
  const sk = [...Object.entries(game.weapons).map(([k, w]) => [WEAPONS[k], w.evo ? WEAPONS[k].evoName : `Nivel ${w.lvl}`, w.evo]), ...Object.entries(game.passives).map(([k, v]) => [PASSIVES[k], `Nivel ${v}`])];
  const m = modal(`<h3>Pausa</h3><div class="msub">Capítulo ${game.chap + 1} · ${CHAPTERS[game.chap].name}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">${sk.map(([d, l, e]) => `<div class="row panel" style="padding:8px;gap:8px"><div class="ibox" style="width:38px;height:38px;font-size:20px;${e ? '--c1:#ffb02e;--c2:#6b3200' : ''}">${icon(d.icon)}</div><div style="min-width:0"><div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e ? d.evoName : d.name}</div><div style="font-size:11px;color:var(--dim)">${l}</div></div></div>`).join('')}</div>
    <button class="btn green block" id="res">${icon('play')} Continuar</button>
    <button class="btn ghost block" id="quit" style="margin-top:8px">Abandonar</button>`, { close: false });
  m.querySelector('#res').onclick = () => { sfx.click(); m.close(); game.pause(false); };
  m.querySelector('#quit').onclick = () => { sfx.click(); m.close(); game.finish(false); };
}
function deathModal(g) {
  sfx.lose();
  if (g.p.revived) return setTimeout(() => g.finish(false), 600);
  const m = modal(`<h3 style="color:#ff8aa0">¡Nave destruida!</h3><div class="msub">Sobreviviste ${fmtTime(g.t)} · ${fmt(g.kills)} bajas</div>
    <div class="rewards"><div class="rwi" style="--rc:#ff4d6a">${icon('heart')}<small>Revive con toda la vida y una onda de choque</small></div></div>
    <button class="btn purple block" id="rev">${icon('gem')} 40 · Revivir</button>
    <button class="btn ghost block" id="give" style="margin-top:8px">Rendirse</button>`, { close: false });
  m.querySelector('#rev').onclick = () => { if (S.gems < 40) return toast('No tienes suficientes gemas', true); S.gems -= 40; SV.save(); m.close(); sfx.levelup(); g.revive(); };
  m.querySelector('#give').onclick = () => { m.close(); g.finish(false); };
}
function endGame(res) {
  if (!game) return; const g = game; game = null; g.destroy();
  document.querySelectorAll('.modal').forEach((m) => m.remove());
  const rewards = SV.finishRun(res);
  res.win ? sfx.win() : null;
  setMusic('menu');
  const m = modal(`<div class="result ${res.win ? 'win' : 'lose'}">${res.win ? '<div class="burst"></div>' : ''}<h3>${res.win ? '¡VICTORIA!' : 'DERROTA'}</h3>
    <div class="msub">Capítulo ${res.chapter + 1} · ${CHAPTERS[res.chapter].name}</div>
    <div class="rstats"><div><small>TIEMPO</small><b>${fmtTime(res.time)}</b></div><div><small>BAJAS</small><b>${fmt(res.kills)}</b></div><div><small>NIVEL</small><b>${res.level}</b></div></div>
    <div class="rewards">${flatten(rewards).map(rewardTile).join('')}</div>
    ${res.win && res.chapter < CHAPTERS.length - 1 && S.maxChapter > res.chapter ? `<div class="msub" style="color:var(--green)">¡Capítulo ${res.chapter + 2} desbloqueado!</div>` : ''}
    ${!res.win ? `<div class="msub">Mejora tu arsenal y vuelve a intentarlo.</div>` : ''}
    <button class="btn green block" id="ok">Continuar</button></div>`, { close: false });
  m.querySelector('#ok').onclick = () => { sfx.click(); m.close(); tab = 'home'; showMenu(); };
}

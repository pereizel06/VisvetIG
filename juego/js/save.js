// Estado persistente y economía (energía, diarias, misiones, pase, equipo)
import { dayKey } from './util.js';
import { SEASON, PILOTS, UPGRADES, SLOTS, RARITIES, CHESTS, DAILY_LOGIN, MISSIONS, ACTIVITY, PASS, upgradeCost, gearStat, gearUpCost } from './data.js';

const KEY = 'eclipse_save_v1';
export const ENERGY_MAX = 30, ENERGY_COST = 5, ENERGY_REGEN_MS = 5 * 60 * 1000;
export const FREE_GIFT_MS = 4 * 3600 * 1000, PATROL_MAX_MS = 12 * 3600 * 1000;
let uid = 1;

function fresh() {
  const now = Date.now();
  return {
    v: 1, gold: 1200, gems: 200, energy: ENERGY_MAX, energyTs: now,
    chapter: 0, maxChapter: 0, cleared: [],
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    pilot: 'vex', pilots: ['vex'],
    gear: [], equipped: { core: null, armor: null, ring: null, module: null },
    pass: { xp: 0, premium: false, free: [], prem: [] },
    login: { day: 0, last: '' },
    daily: { key: '', prog: {}, claimed: [], act: [] },
    patrolTs: now, giftTs: 0, energyBuysKey: '',
    stats: { runs: 0, kills: 0, bosses: 0, best: 0 },
    settings: { music: true, sfx: true, shake: true, dmgNums: true },
    tutorial: true, uid: 1,
  };
}

export const S = (() => {
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  const base = fresh();
  if (!s) s = base;
  for (const k in base) if (s[k] === undefined) s[k] = base[k];
  uid = s.uid || 1;
  return s;
})();

let saveTimer = 0;
export function save() { S.uid = uid; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
export function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 200); }
export function resetAll() { localStorage.removeItem(KEY); location.reload(); }

// ---------- Energía ----------
export function tickEnergy() {
  const now = Date.now();
  if (S.energy >= ENERGY_MAX) { S.energyTs = now; return; }
  const n = Math.floor((now - S.energyTs) / ENERGY_REGEN_MS);
  if (n > 0) { S.energy = Math.min(ENERGY_MAX, S.energy + n); S.energyTs += n * ENERGY_REGEN_MS; if (S.energy >= ENERGY_MAX) S.energyTs = now; }
}
export const energyNextMs = () => (S.energy >= ENERGY_MAX ? 0 : ENERGY_REGEN_MS - (Date.now() - S.energyTs));

// ---------- Recompensas genéricas ----------
export function grant(r, out = []) {
  if (!r) return out;
  if (r.gold) { S.gold += r.gold; out.push({ type: 'gold', n: r.gold }); }
  if (r.gems) { S.gems += r.gems; out.push({ type: 'gems', n: r.gems }); }
  if (r.energy) { S.energy += r.energy; out.push({ type: 'energy', n: r.energy }); }
  if (r.passXp) { addPassXp(r.passXp); out.push({ type: 'passXp', n: r.passXp }); }
  if (r.chest) { const items = openChest(r.chest, 1, true); out.push({ type: 'chest', chest: r.chest, items }); }
  if (r.pilot && !S.pilots.includes(r.pilot)) { S.pilots.push(r.pilot); out.push({ type: 'pilot', id: r.pilot }); }
  saveSoon();
  return out;
}

// ---------- Stats del jugador (meta) ----------
export function metaStats() {
  const u = S.upgrades, p = PILOTS.find((x) => x.id === S.pilot) || PILOTS[0];
  const st = { dmg: 1 + u.atk * 0.06, hp: 120 + u.hp * 12, def: u.def * 1, speed: 1 + u.spd * 0.02, magnet: 1 + u.mag * 0.05, crit: 0.05 + u.luck * 0.01 };
  for (const slot in S.equipped) {
    const it = S.gear.find((g) => g.id === S.equipped[slot]); if (!it) continue;
    const v = gearStat(it);
    if (slot === 'core') st.dmg += v / 100; else if (slot === 'armor') st.hp += v; else if (slot === 'ring') st.crit += v / 100; else if (slot === 'module') st.speed += v / 100;
  }
  if (p.perkFx.dmg) st.dmg += p.perkFx.dmg; if (p.perkFx.hp) st.hp *= 1 + p.perkFx.hp; if (p.perkFx.crit) st.crit += p.perkFx.crit; if (p.perkFx.speed) st.speed += p.perkFx.speed;
  st.hp = Math.round(st.hp);
  return st;
}
export function power() { const m = metaStats(); return Math.round(m.dmg * 100 * 6 + m.hp * 2 + m.def * 25 + m.crit * 1500 + m.speed * 150); }

export function buyUpgrade(id) {
  const c = upgradeCost(S.upgrades[id]);
  if (S.gold < c) return false;
  S.gold -= c; S.upgrades[id]++; mission('upgrade', 1); saveSoon(); return true;
}

// ---------- Equipo ----------
export function makeItem(slot, rarity) { return { id: uid++, slot, rarity, lvl: 1 }; }
function rollRarity(odds) { let r = Math.random(), i = 0; for (; i < odds.length; i++) { if (r < odds[i]) return i; r -= odds[i]; } return 0; }
export function openChest(type, n = 1, free = false) {
  const c = CHESTS[type];
  if (!free) {
    if (c.cost.gold) { if (S.gold < c.cost.gold * n) return null; S.gold -= c.cost.gold * n; }
    if (c.cost.gems) { const cost = n === 10 ? c.cost.gems * 9 : c.cost.gems * n; if (S.gems < cost) return null; S.gems -= cost; }
  }
  const slots = Object.keys(SLOTS), items = [];
  for (let i = 0; i < n; i++) {
    let rar = rollRarity(c.odds);
    if (n === 10 && i === 9 && type !== 'basic') rar = Math.max(rar, 2);
    const it = makeItem(slots[Math.floor(Math.random() * slots.length)], rar);
    S.gear.push(it); items.push(it);
  }
  autoEquip(); mission('chest', 1); saveSoon();
  return items;
}
export function autoEquip() {
  for (const slot in S.equipped) {
    const cur = S.gear.find((g) => g.id === S.equipped[slot]);
    let best = cur;
    for (const g of S.gear) if (g.slot === slot && (!best || gearStat(g) > gearStat(best))) best = g;
    if (best) S.equipped[slot] = best.id;
  }
}
export function equip(id) { const it = S.gear.find((g) => g.id === id); if (it) { S.equipped[it.slot] = id; saveSoon(); } }
export function upgradeItem(id) {
  const it = S.gear.find((g) => g.id === id); if (!it) return false;
  if (it.lvl >= RARITIES[it.rarity].cap) return false;
  const c = gearUpCost(it); if (S.gold < c) return false;
  S.gold -= c; it.lvl++; mission('upgrade', 1); saveSoon(); return true;
}
// Fusiona 3 objetos iguales (ranura + rareza) en uno de rareza superior
export function mergeable() {
  const groups = {};
  for (const g of S.gear) if (g.rarity < RARITIES.length - 1) (groups[g.slot + ':' + g.rarity] ||= []).push(g);
  return Object.values(groups).filter((a) => a.length >= 3);
}
export function mergeAll() {
  const made = [];
  let guard = 0;
  while (guard++ < 200) {
    const groups = mergeable(); if (!groups.length) break;
    const grp = groups[0].sort((a, b) => b.lvl - a.lvl).slice(0, 3);
    const keepLvl = grp[0].lvl;
    S.gear = S.gear.filter((g) => !grp.includes(g));
    for (const s in S.equipped) if (grp.some((g) => g.id === S.equipped[s])) S.equipped[s] = null;
    const it = makeItem(grp[0].slot, grp[0].rarity + 1); it.lvl = Math.min(keepLvl, RARITIES[it.rarity].cap);
    S.gear.push(it); made.push(it);
  }
  autoEquip(); saveSoon(); return made;
}

// ---------- Inicio de sesión diario ----------
export function loginAvailable() { return S.login.last !== dayKey(); }
export function claimLogin() {
  if (!loginAvailable()) return null;
  const r = DAILY_LOGIN[S.login.day % 7];
  S.login.last = dayKey(); S.login.day++;
  return grant(r);
}

// ---------- Misiones diarias ----------
export function ensureDaily() {
  const k = dayKey();
  if (S.daily.key !== k) S.daily = { key: k, prog: {}, claimed: [], act: [] };
}
export function mission(id, n) { ensureDaily(); S.daily.prog[id] = (S.daily.prog[id] || 0) + n; saveSoon(); }
export function activityPts() { ensureDaily(); return S.daily.claimed.reduce((a, id) => a + (MISSIONS.find((m) => m.id === id)?.pts || 0), 0); }
export function claimMission(id) {
  ensureDaily(); const m = MISSIONS.find((x) => x.id === id);
  if (!m || S.daily.claimed.includes(id) || (S.daily.prog[id] || 0) < m.goal) return null;
  S.daily.claimed.push(id);
  return grant({ gems: m.gems, passXp: 40 });
}
export function claimActivity(i) {
  ensureDaily(); const a = ACTIVITY[i];
  if (S.daily.act.includes(i) || activityPts() < a.pts) return null;
  S.daily.act.push(i); return grant(a.reward);
}
export function missionsClaimable() {
  ensureDaily(); const pts = activityPts();
  return MISSIONS.some((m) => !S.daily.claimed.includes(m.id) && (S.daily.prog[m.id] || 0) >= m.goal) || ACTIVITY.some((a, i) => !S.daily.act.includes(i) && pts >= a.pts);
}

// ---------- Pase de batalla ----------
export function passLevel() { return Math.min(SEASON.tiers, Math.floor(S.pass.xp / SEASON.xpPerTier)); }
export function addPassXp(n) { S.pass.xp = Math.min(S.pass.xp + n, SEASON.tiers * SEASON.xpPerTier); }
export function claimPass(track, i) {
  const lvl = passLevel(); if (i >= lvl) return null;
  const list = track === 'free' ? S.pass.free : S.pass.prem;
  if (list.includes(i)) return null; if (track === 'prem' && !S.pass.premium) return null;
  list.push(i); return grant(PASS[track][i]);
}
export function claimAllPass() {
  const out = [], lvl = passLevel();
  for (let i = 0; i < lvl; i++) { if (!S.pass.free.includes(i)) { S.pass.free.push(i); grant(PASS.free[i], out); } if (S.pass.premium && !S.pass.prem.includes(i)) { S.pass.prem.push(i); grant(PASS.prem[i], out); } }
  return out;
}
export function passClaimable() { const lvl = passLevel(); for (let i = 0; i < lvl; i++) if (!S.pass.free.includes(i) || (S.pass.premium && !S.pass.prem.includes(i))) return true; return false; }
export function buyPremium() { if (S.pass.premium || S.gems < SEASON.premiumCost) return false; S.gems -= SEASON.premiumCost; S.pass.premium = true; saveSoon(); return true; }

// ---------- Patrulla (recompensa pasiva) ----------
export function patrolRate() { return Math.round(90 * (1 + S.maxChapter * 0.9)); } // oro/hora
export function patrolMs() { return Math.min(PATROL_MAX_MS, Date.now() - S.patrolTs); }
export function patrolGold() { return Math.floor(patrolRate() * patrolMs() / 3600000); }
export function claimPatrol() {
  const g = patrolGold(); if (g < 1) return null;
  S.patrolTs = Date.now(); mission('patrol', 1);
  return grant({ gold: g });
}

// ---------- Tienda ----------
export const giftReady = () => Date.now() - S.giftTs >= FREE_GIFT_MS;
export function claimGift() { if (!giftReady()) return null; S.giftTs = Date.now(); return grant({ gems: 30, gold: 500 }); }
export function buyEnergy() { if (S.gems < 50) return false; S.gems -= 50; S.energy += 30; saveSoon(); return true; }

// ---------- Partidas ----------
export function canPlay() { tickEnergy(); return S.energy >= ENERGY_COST; }
export function startRunCost() { tickEnergy(); if (S.energy < ENERGY_COST) return false; if (S.energy >= ENERGY_MAX) S.energyTs = Date.now(); S.energy -= ENERGY_COST; save(); return true; }
export function finishRun(res) {
  // res: { chapter, win, kills, gold, time, bossKilled, evolved }
  const out = [];
  S.stats.runs++; S.stats.kills += res.kills; S.stats.best = Math.max(S.stats.best, res.time);
  mission('runs', 1); mission('kills', res.kills);
  if (res.bosses) { S.stats.bosses += res.bosses; mission('boss', res.bosses); }
  if (res.evolved) mission('evolve', res.evolved);
  grant({ gold: res.gold }, out);
  const xp = Math.round(25 + res.time / 6 + (res.win ? 40 : 0));
  addPassXp(xp); out.push({ type: 'passXp', n: xp });
  if (res.win) {
    if (!S.cleared.includes(res.chapter)) { S.cleared.push(res.chapter); grant({ gems: 120, chest: res.chapter >= 2 ? 'epic' : 'basic' }, out); }
    else grant({ gems: 15 }, out);
    if (res.chapter === S.maxChapter && S.maxChapter < 9) { S.maxChapter++; S.chapter = S.maxChapter; }
  }
  save();
  return out;
}

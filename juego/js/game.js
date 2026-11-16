// Núcleo de la partida: bucle, combate, armas, enemigos, jefes y render
import { TAU, clamp, lerp, rand, pick, dist2, hsl, SpatialHash, shuffle } from './util.js';
import { CHAPTERS, ENEMIES, BOSSES, WEAPONS, PASSIVES, RUN_TIME, chapterMult } from './data.js';
import { SPR, enemySprite, glow, gemSprite, itemSprite, playerSprite, nebulaTile, starTile, vignette } from './sprites.js';
import { sfx, setMusic } from './audio.js';

const MAX_W = 4, MAX_P = 4, VIEW = 400;
const tmp = [];

export class Game {
  constructor(canvas, opts) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.o = opts; this.chap = opts.chapter; this.ch = CHAPTERS[this.chap]; this.cm = chapterMult(this.chap);
    this.hue = this.ch.hue; this.meta = opts.meta; this.settings = opts.settings;
    this.t = 0; this.kills = 0; this.gold = 0; this.bosses = 0; this.evolved = 0; this.over = false; this.paused = false; this.slowmo = 1;
    this.enemies = []; this.bullets = []; this.ebullets = []; this.pickups = []; this.parts = []; this.fx = []; this.texts = []; this.fields = [];
    this.hash = new SpatialHash(56);
    const m = this.meta;
    this.p = { x: 0, y: 0, vx: 0, vy: 0, r: 13, hp: m.hp, maxHp: m.hp, inv: 0, ang: -Math.PI / 2, lvl: 1, xp: 0, need: this.xpNeed(1), revived: false, flash: 0 };
    this.weapons = {}; this.passives = {};
    this.addWeapon(opts.weapon);
    this.spawnAcc = 0; this.opening = true; this.events = this.makeEvents(); this.boss = null; this.arena = null;
    this.cam = { x: 0, y: 0, shake: 0 };
    this.input = { jx: 0, jy: 0, active: false, ox: 0, oy: 0, cx: 0, cy: 0, keys: {} };
    this.pendingLevels = 0; this.rerolls = 1;
    this.neb = nebulaTile(this.ch.hue, this.ch.hue2); this.stars = starTile(this.ch.hue);
    this.pSprite = playerSprite(opts.pilotHue);
    this.bindInput(); this.resize();
    this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.frame(t));
    setMusic('game');
  }

  // ---------------- Configuración ----------------
  xpNeed(l) { return Math.floor(4 + l * 2.5 + Math.pow(l, 1.38)); }
  stats() {
    const P = this.passives, m = this.meta, lv = (k) => P[k] || 0;
    return {
      dmg: m.dmg * (1 + 0.12 * lv('power')), cd: Math.pow(0.92, lv('haste')), magnet: 70 * m.magnet * (1 + 0.3 * lv('magnet')),
      armor: m.def + 3 * lv('armor'), speed: 125 * m.speed * (1 + 0.09 * lv('speed')), area: 1 + 0.12 * lv('area'),
      crit: m.crit + 0.06 * lv('crit'), regen: 0.3 + 0.4 * lv('vitality'),
    };
  }
  refreshStats() { const old = this.p.maxHp; this.st = this.stats(); this.p.maxHp = Math.round(this.meta.hp * (1 + 0.15 * (this.passives.vitality || 0))); this.p.hp += Math.max(0, this.p.maxHp - old); }
  addWeapon(id) { this.weapons[id] = { lvl: 1, t: 0.4, evo: false, ang: 0, t2: 0, drones: [] }; this.refreshStats(); }

  makeEvents() {
    return [
      { t: 45, type: 'ring', n: 26 }, { t: 90, type: 'elite' }, { t: 125, type: 'ring', n: 22, kind: 'runner' },
      { t: 170, type: 'elite' }, { t: 200, type: 'ring', n: 32 }, { t: 230, type: 'elite', n: 2 },
      { t: RUN_TIME - 6, type: 'warn' }, { t: RUN_TIME, type: 'boss' },
    ];
  }

  // ---------------- Entrada ----------------
  bindInput() {
    const cv = this.cv, I = this.input;
    this.onDown = (e) => { if (this.paused) return; e.preventDefault(); I.active = true; I.id = e.pointerId; I.ox = I.cx = e.clientX; I.oy = I.cy = e.clientY; I.jx = I.jy = 0; this.o.onFirstMove?.(); };
    this.onMove = (e) => {
      if (!I.active || e.pointerId !== I.id) return; I.cx = e.clientX; I.cy = e.clientY;
      let dx = I.cx - I.ox, dy = I.cy - I.oy; const d = Math.hypot(dx, dy), R = 46;
      if (d > R) { I.ox = I.cx - dx / d * R; I.oy = I.cy - dy / d * R; dx = dx / d * R; dy = dy / d * R; }
      I.jx = dx / R; I.jy = dy / R; if (Math.hypot(I.jx, I.jy) < 0.12) I.jx = I.jy = 0;
    };
    this.onUp = (e) => { if (e.pointerId !== I.id) return; I.active = false; I.jx = I.jy = 0; };
    this.onKey = (e) => { I.keys[e.key.toLowerCase()] = e.type === 'keydown'; if (e.type === 'keydown') this.o.onFirstMove?.(); };
    this.onResize = () => this.resize();
    cv.addEventListener('pointerdown', this.onDown); window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('pointerup', this.onUp); window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey); window.addEventListener('keyup', this.onKey); window.addEventListener('resize', this.onResize);
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = window.innerWidth, h = window.innerHeight;
    this.dpr = dpr; this.cw = w; this.ch2 = h; this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.zoom = Math.max(Math.min(w, h) / VIEW, Math.max(w, h) / 760) * dpr;
    this.vw = this.cv.width / this.zoom; this.vh = this.cv.height / this.zoom;
    this.vig = vignette(this.cv.width, this.cv.height);
  }
  destroy() {
    cancelAnimationFrame(this.raf); this.over = true;
    this.cv.removeEventListener('pointerdown', this.onDown); window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp); window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey); window.removeEventListener('keyup', this.onKey); window.removeEventListener('resize', this.onResize);
  }

  // ---------------- Bucle ----------------
  frame(now) {
    if (this.over) return;
    let dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (!this.paused) { this.update(dt * this.slowmo); }
    this.render();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }
  pause(v) { this.paused = v; if (!v) this.last = performance.now(); this.input.active = false; this.input.jx = this.input.jy = 0; }

  update(dt) {
    this.t += dt; const p = this.p, st = this.st, I = this.input;
    // movimiento
    let mx = I.jx, my = I.jy; const K = I.keys;
    if (K.a || K.arrowleft) mx -= 1; if (K.d || K.arrowright) mx += 1; if (K.w || K.arrowup) my -= 1; if (K.s || K.arrowdown) my += 1;
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    p.vx = lerp(p.vx, mx * st.speed, Math.min(1, dt * 14)); p.vy = lerp(p.vy, my * st.speed, Math.min(1, dt * 14));
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (ml > 0.1) { const ta = Math.atan2(my, mx); let da = ((ta - p.ang + Math.PI) % TAU + TAU) % TAU - Math.PI; p.ang += da * Math.min(1, dt * 12); }
    if (this.arena) { const A = this.arena, dx = p.x - A.x, dy = p.y - A.y, d = Math.hypot(dx, dy); if (d > A.r - p.r) { p.x = A.x + dx / d * (A.r - p.r); p.y = A.y + dy / d * (A.r - p.r); } }
    if (p.inv > 0) p.inv -= dt; if (p.flash > 0) p.flash -= dt;
    if (st.regen && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + st.regen * dt);
    // estela de motor
    if (Math.hypot(p.vx, p.vy) > 30 && Math.random() < 0.9) {
      const a = p.ang + Math.PI; this.part(p.x + Math.cos(a) * 11, p.y + Math.sin(a) * 11, Math.cos(a + rand(-0.3, 0.3)) * 60, Math.sin(a + rand(-0.3, 0.3)) * 60, 0.35, hsl(this.o.pilotHue, 100, 65, 1), 7, 0.9);
    }
    // cámara
    this.cam.x = lerp(this.cam.x, p.x, Math.min(1, dt * 8)); this.cam.y = lerp(this.cam.y, p.y, Math.min(1, dt * 8));
    this.cam.shake = Math.max(0, this.cam.shake - dt * 30);

    this.director(dt);
    // rejilla espacial
    this.hash.clear(); for (const e of this.enemies) this.hash.insert(e);
    this.updateWeapons(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateFx(dt);
    if (p.hp <= 0 && !this.over && !this.dying) this.die();
    this.o.onHud?.(this);
  }

  // ---------------- Generación de oleadas ----------------
  director(dt) {
    const t = this.t;
    while (this.events.length && this.events[0].t <= t) {
      const ev = this.events.shift();
      if (ev.type === 'ring') this.spawnRing(ev.n, ev.kind || 'swarm');
      else if (ev.type === 'elite') { for (let i = 0; i < (ev.n || 1); i++) this.spawn('elite'); this.o.onBanner?.('¡ÉLITE DETECTADO!', 'Derrótalo para conseguir un cofre', 'elite'); sfx.warn(); }
      else if (ev.type === 'warn') { this.o.onBanner?.('¡ALERTA!', 'Una presencia colosal se acerca…', 'boss'); sfx.warn(); }
      else if (ev.type === 'boss') this.spawnBoss();
    }
    if (this.boss) { if (this.enemies.length < 30) { this.spawnAcc += dt * 0.6; while (this.spawnAcc > 1) { this.spawnAcc--; this.spawn('swarm'); } } return; }
    if (this.victory) return;
    if (this.opening && t > 1.2) { this.opening = false; for (let i = 0; i < 10; i++) this.spawn('swarm'); }
    const rate = Math.min(1.3 + t / 28 + Math.pow(t / 85, 2), 12), maxE = 280;
    this.spawnAcc += rate * dt;
    while (this.spawnAcc > 1) {
      this.spawnAcc--; if (this.enemies.length >= maxE) break;
      const r = Math.random(); let k = 'swarm';
      if (t > 35 && r < 0.25) k = 'runner';
      if (t > 70 && r > 0.88) k = 'brute';
      if (t > 100 && r > 0.8 && r <= 0.88) k = 'spitter';
      if (t > 140 && r > 0.72 && r <= 0.8) k = 'splitter';
      this.spawn(k);
    }
  }
  spawnPos(extra = 40) {
    const a = rand(TAU), R = Math.hypot(this.vw, this.vh) / 2 + extra;
    let x = this.p.x + Math.cos(a) * R, y = this.p.y + Math.sin(a) * R;
    // sesgo hacia la dirección del movimiento
    if (Math.hypot(this.p.vx, this.p.vy) > 40 && Math.random() < 0.4) { const ma = Math.atan2(this.p.vy, this.p.vx) + rand(-0.8, 0.8); x = this.p.x + Math.cos(ma) * R; y = this.p.y + Math.sin(ma) * R; }
    return [x, y];
  }
  spawn(kind, x, y) {
    const d = ENEMIES[kind]; if (x === undefined) [x, y] = this.spawnPos();
    const tm = 1 + this.t / 150, hp = d.hp * this.cm.hp * tm * (d.elite ? 1 + this.t / 200 : 1);
    const hue = (this.hue + d.hueShift + 360) % 360;
    const e = { kind, d, x, y, vx: 0, vy: 0, kx: 0, ky: 0, r: d.r, hp, maxHp: hp, speed: d.speed * rand(0.9, 1.1) * (1 + Math.min(this.t / 600, 0.35)), dmg: d.dmg * this.cm.dmg,
      spr: enemySprite(d.shape, d.r, hue), hue, flash: 0, ang: 0, shootT: rand(1, 2.5), orbHit: 0, shockId: -1, dashT: 3, dashing: 0, spin: rand(-2, 2), elite: !!d.elite };
    this.enemies.push(e); return e;
  }
  spawnRing(n, kind) {
    const R = Math.max(this.vw, this.vh) / 2 + 30;
    for (let i = 0; i < n; i++) { const a = i / n * TAU; this.spawn(kind, this.p.x + Math.cos(a) * R, this.p.y + Math.sin(a) * R); }
    this.o.onBanner?.('¡EMBOSCADA!', 'Te están rodeando', 'warn');
  }
  spawnBoss() {
    const id = this.ch.boss, B = BOSSES[id];
    // limpiar la pantalla con una onda de luz
    for (const e of this.enemies) if (!e.elite) this.killFx(e, false);
    this.enemies = this.enemies.filter((e) => e.elite);
    this.flashScreen = 1; this.cam.shake = 14;
    this.arena = { x: this.p.x, y: this.p.y, r: 330, t: 0 };
    const hp = B.hp * this.cm.hp;
    const b = { kind: 'boss', bossId: id, d: { ...B, xp: 0 }, x: this.p.x, y: this.p.y - 230, vx: 0, vy: 0, kx: 0, ky: 0, r: B.r, hp, maxHp: hp, speed: B.speed, dmg: B.dmg * this.cm.dmg,
      hue: (this.hue + 180) % 360, flash: 0, ang: Math.PI / 2, isBoss: true, at: 2, at2: 3.5, phase: 1, mode: 'move', modeT: 0, trail: [], spin: 0, orbHit: 0, shockId: -1, enter: 1.5 };
    this.boss = b; this.enemies.push(b);
    this.o.onBoss?.(b); sfx.boss(); setMusic('boss');
  }

  // ---------------- Armas ----------------
  dmgRoll(base) { const c = Math.random() < this.st.crit; return [base * this.st.dmg * (c ? 2.2 : 1) * rand(0.92, 1.08), c]; }
  nearest(x, y, maxR = 9999, skip) {
    let best = null, bd = maxR * maxR;
    for (const e of this.enemies) { if (e === skip || e.dead) continue; const d = dist2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  updateWeapons(dt) {
    const p = this.p, st = this.st;
    for (const id in this.weapons) {
      const w = this.weapons[id], L = w.lvl; w.t -= dt;
      if (id === 'blaster') {
        const cd = (w.evo ? 0.3 : 0.5 * (L >= 5 ? 0.85 : 1)) * st.cd;
        if (w.t <= 0) {
          const tgt = this.nearest(p.x, p.y, 460);
          if (tgt) {
            w.t = cd; const n = w.evo ? 3 : (L >= 4 ? 3 : L >= 2 ? 2 : 1), base = w.evo ? 34 : 17 * (L >= 3 ? 1.35 : 1) * (L >= 5 ? 1.5 : 1);
            const a0 = Math.atan2(tgt.y - p.y, tgt.x - p.x);
            for (let i = 0; i < n; i++) this.shoot(p.x, p.y, a0 + (i - (n - 1) / 2) * 0.13, 600, base, w.evo ? 3 : (L >= 4 ? 1 : 0), 'blaster');
            sfx.shoot();
          }
        }
        if (w.evo) { w.t2 -= dt; if (w.t2 <= 0) { w.t2 = 1.1 * st.cd; w.ang += 0.3; for (let i = 0; i < 10; i++) this.shoot(p.x, p.y, w.ang + i / 10 * TAU, 520, 26, 2, 'nova'); } }
      } else if (id === 'orbit') {
        const n = w.evo ? 8 : [2, 3, 3, 4, 5][L - 1], R = (w.evo ? 96 : L >= 4 ? 74 : 62) * st.area, dmg = w.evo ? 34 : 10 * (L >= 3 ? 1.4 : 1) * (L >= 5 ? 1.5 : 1), bladeR = (w.evo ? 14 : 10) * st.area;
        w.ang += dt * (w.evo ? 3.8 : 3.2); w.blades = [];
        for (let i = 0; i < n; i++) {
          const a = w.ang + i / n * TAU, bx = p.x + Math.cos(a) * R, by = p.y + Math.sin(a) * R; w.blades.push([bx, by, a]);
          this.hash.query(bx, by, bladeR + 50, tmp);
          for (const e of tmp) if (!e.dead && e.orbHit <= this.t && dist2(bx, by, e.x, e.y) < (bladeR + e.r) ** 2) { e.orbHit = this.t + 0.35; const [d, c] = this.dmgRoll(dmg); this.hurt(e, d, c, Math.cos(a + Math.PI / 2) * 90, Math.sin(a + Math.PI / 2) * 90); }
        }
        if (w.evo) { w.t2 -= dt; if (w.t2 <= 0) { w.t2 = 2 * st.cd; this.ring(p.x, p.y, 160 * st.area, 26, 'hsla(170,100%,70%,1)', 0, 0.4); } }
      } else if (id === 'arc') {
        const cd = (w.evo ? 0.6 : 1.5 * (L >= 4 ? 0.75 : 1)) * st.cd;
        if (w.t <= 0) {
          const first = this.nearest(p.x, p.y, 320); if (!first) continue; w.t = cd;
          const chains = w.evo ? 8 : [3, 5, 5, 5, 7][L - 1], dmg = w.evo ? 48 : 22 * (L >= 3 ? 1.4 : 1) * (L >= 5 ? 1.5 : 1);
          const casts = w.evo ? 2 : 1;
          for (let c = 0; c < casts; c++) {
            let cur = c === 0 ? first : this.nearest(p.x + rand(-150, 150), p.y + rand(-150, 150), 400) || first, pts = [[p.x, p.y]], hit = new Set();
            for (let i = 0; i < chains && cur; i++) {
              hit.add(cur); pts.push([cur.x, cur.y]); const [d, cr] = this.dmgRoll(dmg); this.hurt(cur, d, cr, 0, 0);
              if (w.evo) this.explode(cur.x, cur.y, 34 * st.area, dmg * 0.5, 'hsla(270,100%,75%,1)', false);
              let nx = null, bd = 150 * 150; for (const e of this.enemies) { if (hit.has(e) || e.dead) continue; const dd = dist2(cur.x, cur.y, e.x, e.y); if (dd < bd) { bd = dd; nx = e; } } cur = nx;
            }
            this.fx.push({ type: 'bolt', pts, life: 0.22, max: 0.22, hue: 265 });
          }
          sfx.zap();
        }
      } else if (id === 'drone') {
        const n = w.evo ? 4 : [1, 2, 2, 2, 3][L - 1], cd = (w.evo ? 0.9 : 1.4 * (L >= 4 ? 0.75 : 1)) * st.cd;
        w.ang += dt * 1.6;
        while (w.drones.length < n) w.drones.push({ x: p.x, y: p.y, t: rand(0.2, cd) });
        w.drones.forEach((d, i) => {
          const a = w.ang + i / n * TAU, tx = p.x + Math.cos(a) * 34, ty = p.y + Math.sin(a) * 34 - 6;
          d.x = lerp(d.x, tx, Math.min(1, dt * 8)); d.y = lerp(d.y, ty, Math.min(1, dt * 8)); d.t -= dt;
          if (d.t <= 0) { const tg = this.nearest(d.x, d.y, 420); if (tg) { d.t = cd; const a2 = Math.atan2(tg.y - d.y, tg.x - d.x) + rand(-0.6, 0.6);
            this.bullets.push({ x: d.x, y: d.y, vx: Math.cos(a2) * 220, vy: Math.sin(a2) * 220, r: 5, dmg: w.evo ? 40 : 25 * (L >= 3 ? 1.4 : 1), pierce: 0, life: 2.2, kind: 'missile', target: tg, rad: (w.evo ? 52 : L >= 5 ? 56 : 42) * st.area, cluster: w.evo, hits: null }); } }
        });
      } else if (id === 'shock') {
        const cd = (w.evo ? 1.7 : 2.6 * (L >= 4 ? 0.75 : 1)) * st.cd;
        if (w.t <= 0) {
          w.t = cd; const R = (w.evo ? 230 : 105 * (L >= 2 ? 1.3 : 1) * (L >= 5 ? 1.3 : 1)) * st.area, dmg = w.evo ? 70 : 20 * (L >= 3 ? 1.5 : 1) * (L >= 5 ? 1.5 : 1);
          this.ring(p.x, p.y, R, dmg, 'hsla(40,100%,65%,1)', 170, 0.4); sfx.wave(); this.cam.shake = Math.max(this.cam.shake, 3);
          if (w.evo) this.fields.push({ x: p.x, y: p.y, r: 130 * st.area, life: 2.6, max: 2.6, dmg: 16, tick: 0, hue: 25 });
        }
      } else if (id === 'meteor') {
        const cd = (w.evo ? 2 : 2.4 * (L >= 5 ? 0.7 : 1)) * st.cd;
        if (w.t <= 0) {
          w.t = cd; const n = w.evo ? 8 : [2, 3, 3, 5, 5][L - 1], dmg = w.evo ? 120 : 40 * (L >= 3 ? 1.4 : 1) * (L >= 5 ? 1.5 : 1), R = (w.evo ? 72 : L >= 3 ? 58 : 46) * st.area;
          const cands = this.enemies.filter((e) => Math.abs(e.x - p.x) < this.vw / 2 && Math.abs(e.y - p.y) < this.vh / 2);
          shuffle(cands);
          for (let i = 0; i < n; i++) { const e = cands[i]; const x = e ? e.x + rand(-10, 10) : p.x + rand(-180, 180), y = e ? e.y + rand(-10, 10) : p.y + rand(-260, 260);
            this.fx.push({ type: 'meteor', x, y, r: R, dmg, life: 0.7 + i * 0.06, max: 0.7 + i * 0.06, hue: w.evo ? 45 : 18 }); }
        }
      }
    }
  }
  shoot(x, y, a, sp, dmg, pierce, kind) { this.bullets.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: kind === 'nova' ? 6 : 5, dmg, pierce, life: 0.95, kind, hits: pierce ? new Set() : null }); }
  ring(x, y, R, dmg, color, kb, dur) { this.fx.push({ type: 'ring', x, y, R, dmg, color, kb, life: dur, max: dur, id: Math.random(), hitSet: new Set() }); }
  explode(x, y, R, dmg, color, shake = true) {
    this.hash.query(x, y, R + 60, tmp);
    for (const e of tmp) if (!e.dead && dist2(x, y, e.x, e.y) < (R + e.r) ** 2) { const [d, c] = this.dmgRoll(dmg); const a = Math.atan2(e.y - y, e.x - x); this.hurt(e, d, c, Math.cos(a) * 140, Math.sin(a) * 140); }
    this.fx.push({ type: 'boom', x, y, R, life: 0.35, max: 0.35, color });
    for (let i = 0; i < 10; i++) { const a = rand(TAU), s = rand(60, 220); this.part(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.6), color, rand(4, 8), 0.9); }
    if (shake) { this.cam.shake = Math.max(this.cam.shake, 4); sfx.boom(); }
  }

  // ---------------- Daño ----------------
  hurt(e, dmg, crit, kx, ky) {
    if (e.dead) return; e.hp -= dmg; e.flash = 0.09;
    const m = e.isBoss ? 0.05 : 1 / (e.d.mass || 1); e.kx += kx * m; e.ky += ky * m;
    if (this.settings.dmgNums && this.texts.length < 70) this.texts.push({ x: e.x + rand(-6, 6), y: e.y - e.r, v: Math.round(dmg), crit, life: 0.7, max: 0.7 });
    sfx.hit();
    if (e.hp <= 0) this.kill(e);
  }
  kill(e) {
    if (e.dead) return; e.dead = true; this.kills++;
    this.killFx(e, true);
    if (e.isBoss) return this.bossDown(e);
    // botín
    const xp = e.d.xp; this.pickups.push({ type: 'gem', x: e.x, y: e.y, v: xp, tier: xp >= 20 ? 2 : xp >= 4 ? 1 : 0, vx: 0, vy: 0, mag: false });
    const r = Math.random();
    if (r < 0.055) this.pickups.push({ type: 'coin', x: e.x + 6, y: e.y, v: Math.round(6 * this.cm.gold), vx: 0, vy: 0 });
    else if (r < 0.062) this.pickups.push({ type: 'heart', x: e.x, y: e.y, vx: 0, vy: 0 });
    else if (r < 0.0632) this.pickups.push({ type: 'magnet', x: e.x, y: e.y, vx: 0, vy: 0 });
    else if (r < 0.0642) this.pickups.push({ type: 'bomb', x: e.x, y: e.y, vx: 0, vy: 0 });
    if (e.elite) { this.pickups.push({ type: 'chest', x: e.x, y: e.y, vx: 0, vy: 0 }); for (let i = 0; i < 6; i++) this.pickups.push({ type: 'coin', x: e.x + rand(-30, 30), y: e.y + rand(-30, 30), v: Math.round(8 * this.cm.gold), vx: 0, vy: 0 }); this.cam.shake = 8; sfx.boom(); }
    if (e.d.split) for (let i = 0; i < 3; i++) { const s = this.spawn('swarm', e.x + rand(-12, 12), e.y + rand(-12, 12)); s.hp *= 0.6; }
    // fusionar gemas si hay demasiadas
    if (this.pickups.length > 420) this.mergeGems();
  }
  killFx(e, sound) {
    const c = hsl(e.hue, 100, 62, 1), n = e.isBoss ? 60 : e.elite ? 26 : 9;
    for (let i = 0; i < n; i++) { const a = rand(TAU), s = rand(50, e.isBoss ? 420 : 200); this.part(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.25, 0.6), c, rand(3, e.isBoss ? 14 : 7), 0.88); }
    this.fx.push({ type: 'pop', x: e.x, y: e.y, R: e.r * 2.2, life: 0.25, max: 0.25, color: c });
    if (sound) sfx.kill();
  }
  mergeGems() {
    const gems = this.pickups.filter((g) => g.type === 'gem' && !g.mag), far = gems.filter((g) => dist2(g.x, g.y, this.p.x, this.p.y) > 300 * 300);
    if (far.length < 40) return; let sum = 0; for (const g of far) sum += g.v;
    const set = new Set(far); this.pickups = this.pickups.filter((g) => !set.has(g));
    const g0 = far[0]; this.pickups.push({ type: 'gem', x: g0.x, y: g0.y, v: sum, tier: 3, vx: 0, vy: 0, mag: false });
  }
  damagePlayer(amount) {
    const p = this.p; if (p.inv > 0 || this.victory) return;
    const d = Math.max(1, amount - this.st.armor); p.hp -= d; p.inv = 0.7; p.flash = 0.2;
    this.cam.shake = Math.max(this.cam.shake, 6); this.hurtFlash = 0.35; sfx.hurt();
    if (this.settings.dmgNums) this.texts.push({ x: p.x, y: p.y - 18, v: Math.round(d), crit: false, life: 0.8, max: 0.8, bad: true });
  }
  die() { this.dying = true; this.pause(true); this.o.onDeath?.(this); }
  revive() {
    const p = this.p; p.hp = p.maxHp; p.inv = 2.5; p.revived = true; this.dying = false;
    for (const e of this.enemies) if (!e.isBoss && dist2(e.x, e.y, p.x, p.y) < 260 * 260) this.kill(e);
    this.ebullets.length = 0; this.ring(p.x, p.y, 280, 0, 'hsla(190,100%,80%,1)', 400, 0.5); this.pause(false);
  }
  bossDown(b) {
    this.boss = null; this.bosses++; this.victory = true; this.slowmo = 0.25; this.cam.shake = 22; this.flashScreen = 1;
    this.o.onBoss?.(null); sfx.boom(); setTimeout(() => sfx.boom(), 200);
    for (let i = 0; i < 6; i++) setTimeout(() => this.explode(b.x + rand(-60, 60), b.y + rand(-60, 60), 70, 0, hsl(b.hue + i * 20, 100, 65, 1)), i * 130);
    for (let i = 0; i < 25; i++) this.pickups.push({ type: 'coin', x: b.x + rand(-60, 60), y: b.y + rand(-60, 60), v: Math.round(10 * this.cm.gold), vx: 0, vy: 0 });
    this.ebullets.length = 0;
    setTimeout(() => { this.slowmo = 1; for (const g of this.pickups) g.mag = true; }, 900);
    setTimeout(() => { if (!this.over) this.finish(true); }, 3200);
  }
  finish(win) { this.o.onEnd?.({ win, kills: this.kills, gold: this.gold + (win ? Math.round(450 * this.cm.gold) : 0), time: this.t, bosses: this.bosses, evolved: this.evolved, chapter: this.chap, level: this.p.lvl }); }

  // ---------------- Enemigos ----------------
  updateEnemies(dt) {
    const p = this.p;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (e.isBoss) { this.updateBoss(e, dt, dx, dy, d); }
      else {
        let sp = e.speed, tx = dx / d, ty = dy / d;
        if (e.d.ranged) { if (d < 210) sp = d < 160 ? -e.speed * 0.6 : 0; e.shootT -= dt; if (e.shootT <= 0 && d < 330) { e.shootT = 2.4; this.ebullet(e.x, e.y, Math.atan2(dy, dx), 170, e.dmg, e.hue); } }
        if (e.elite) {
          e.dashT -= dt;
          if (e.dashT <= 0 && !e.dashing && !e.tele) { e.tele = 0.7; e.dashA = Math.atan2(dy, dx); }
          if (e.tele) { e.tele -= dt; sp = 0; if (e.tele <= 0) { e.tele = 0; e.dashing = 0.45; } }
          if (e.dashing) { e.dashing -= dt; sp = 430; tx = Math.cos(e.dashA); ty = Math.sin(e.dashA); if (e.dashing <= 0) { e.dashing = 0; e.dashT = rand(3, 4.5); } }
        }
        // separación ligera
        let sx = 0, sy = 0;
        if (!e.dashing) { this.hash.query(e.x, e.y, e.r + 16, tmp); let c = 0; for (const o of tmp) { if (o === e || c > 6) continue; const ox = e.x - o.x, oy = e.y - o.y, dd = ox * ox + oy * oy, rr = (e.r + o.r) * 0.9; if (dd < rr * rr && dd > 0.01) { const l = Math.sqrt(dd); sx += ox / l * (rr - l); sy += oy / l * (rr - l); c++; } } }
        e.x += (tx * sp + e.kx) * dt + sx * 0.25; e.y += (ty * sp + e.ky) * dt + sy * 0.25;
        e.ang = e.d.shape === 'tri' || e.d.shape === 'dart' || e.d.shape === 'diamond' ? Math.atan2(ty, tx) : e.ang + e.spin * dt;
        // despawn si queda muy lejos
        if (d > 900 && !e.elite) { const [nx, ny] = this.spawnPos(); e.x = nx; e.y = ny; }
      }
      e.kx *= Math.pow(0.0015, dt); e.ky *= Math.pow(0.0015, dt);
      if (d < e.r + p.r - 2) this.damagePlayer(e.dmg);
    }
    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
  }
  ebullet(x, y, a, sp, dmg, hue, r = 6) { this.ebullets.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, hue, r, life: 6 }); }
  updateBoss(b, dt, dx, dy, d) {
    const id = b.bossId, enr = b.hp < b.maxHp * 0.5 ? 1.45 : 1, A = this.arena;
    if (b.phase === 1 && enr > 1) { b.phase = 2; this.o.onBanner?.('¡FURIA!', 'El jefe entra en fase 2', 'boss'); sfx.warn(); }
    if (b.enter > 0) { b.enter -= dt; b.y += 40 * dt; return; }
    b.trail.unshift([b.x, b.y]); if (b.trail.length > 60) b.trail.pop();
    b.spin += dt * (id === 'prism' ? 1.4 * enr : 0.6);
    b.at -= dt * enr; b.at2 -= dt * enr;
    let mvx = dx / d * b.speed, mvy = dy / d * b.speed;
    if (id === 'leviathan') {
      if (b.mode === 'tele') { mvx = mvy = 0; b.modeT -= dt; if (b.modeT <= 0) { b.mode = 'dash'; b.modeT = 0.7; } }
      else if (b.mode === 'dash') { mvx = Math.cos(b.dashA) * 560; mvy = Math.sin(b.dashA) * 560; b.modeT -= dt; if (Math.random() < 0.5) this.ebullet(b.x, b.y, b.dashA + Math.PI + rand(-0.6, 0.6), 60, b.dmg * 0.6, b.hue, 7); if (b.modeT <= 0) { b.mode = 'move'; } }
      if (b.at <= 0 && b.mode === 'move') { b.at = 3.2; b.mode = 'tele'; b.modeT = 0.8; b.dashA = Math.atan2(dy, dx); this.fx.push({ type: 'tele', x: b.x, y: b.y, a: b.dashA, len: 420, w: b.r * 1.6, life: 0.8, max: 0.8 }); }
      if (b.at2 <= 0) { b.at2 = 4.2; const n = b.phase === 2 ? 22 : 16; for (let i = 0; i < n; i++) this.ebullet(b.x, b.y, i / n * TAU + b.spin, 150, b.dmg * 0.7, b.hue); sfx.wave(); }
      b.ang = Math.atan2(mvy || dy, mvx || dx);
    } else if (id === 'prism') {
      const want = 190; if (d < want) { mvx = -mvx * 0.7; mvy = -mvy * 0.7; } else if (d < want + 40) { mvx = -dy / d * b.speed; mvy = dx / d * b.speed; }
      if (b.at <= 0) { b.at = 0.13; for (let k = 0; k < (b.phase === 2 ? 4 : 3); k++) this.ebullet(b.x, b.y, b.spin * 1.7 + k / (b.phase === 2 ? 4 : 3) * TAU, 140, b.dmg * 0.6, b.hue, 5.5); }
      if (b.at2 <= 0) { b.at2 = 4; for (let i = 0; i < 28; i++) this.ebullet(b.x, b.y, i / 28 * TAU, 115, b.dmg * 0.7, (b.hue + 60) % 360, 7); sfx.wave(); }
    } else if (id === 'hive') {
      if (b.at <= 0) { b.at = 4; const n = b.phase === 2 ? 9 : 6; for (let i = 0; i < n; i++) { const a = i / n * TAU; this.spawn(i % 3 ? 'swarm' : 'runner', b.x + Math.cos(a) * 60, b.y + Math.sin(a) * 60); } this.ring(b.x, b.y, 90, 0, hsl(b.hue, 100, 65, 1), 0, 0.4); }
      if (b.at2 <= 0) { b.at2 = 1.6; const a = Math.atan2(dy, dx); for (let i = -2; i <= 2; i++) this.ebullet(b.x, b.y, a + i * 0.18, 175, b.dmg * 0.6, b.hue, 6.5); }
    }
    b.x += (mvx + b.kx) * dt; b.y += (mvy + b.ky) * dt;
    if (A) { const ax = b.x - A.x, ay = b.y - A.y, ad = Math.hypot(ax, ay); if (ad > A.r - b.r) { b.x = A.x + ax / ad * (A.r - b.r); b.y = A.y + ay / ad * (A.r - b.r); if (b.mode === 'dash') { b.mode = 'move'; this.cam.shake = 10; sfx.boom(); } } }
  }

  // ---------------- Proyectiles ----------------
  updateBullets(dt) {
    const p = this.p;
    for (const b of this.bullets) {
      b.life -= dt;
      if (b.kind === 'missile') {
        if (!b.target || b.target.dead) b.target = this.nearest(b.x, b.y, 400);
        const sp = Math.min(520, Math.hypot(b.vx, b.vy) + 600 * dt);
        if (b.target) { const ta = Math.atan2(b.target.y - b.y, b.target.x - b.x), ca = Math.atan2(b.vy, b.vx); let da = ((ta - ca + Math.PI) % TAU + TAU) % TAU - Math.PI; const na = ca + clamp(da, -7 * dt, 7 * dt); b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp; }
        if (Math.random() < 0.8) this.part(b.x, b.y, rand(-20, 20), rand(-20, 20), 0.3, 'hsla(25,100%,60%,1)', 5, 0.9);
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      this.hash.query(b.x, b.y, b.r + 50, tmp);
      for (const e of tmp) {
        if (e.dead || (b.hits && b.hits.has(e))) continue;
        if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) ** 2) {
          if (b.kind === 'missile') { this.explode(b.x, b.y, b.rad, b.dmg, 'hsla(25,100%,60%,1)', false); sfx.boom(); if (b.cluster) for (let i = 0; i < 3; i++) { const a = rand(TAU); this.fx.push({ type: 'delay', t: 0.15 + i * 0.08, fn: () => this.explode(b.x + Math.cos(a) * 40, b.y + Math.sin(a) * 40, 30, b.dmg * 0.5, 'hsla(40,100%,60%,1)', false) }); } b.life = 0; break; }
          const [d, c] = this.dmgRoll(b.dmg); const l = Math.hypot(b.vx, b.vy) || 1; this.hurt(e, d, c, b.vx / l * 90, b.vy / l * 90);
          for (let i = 0; i < 3; i++) this.part(b.x, b.y, rand(-120, 120), rand(-120, 120), 0.2, hsl(this.o.pilotHue, 100, 70, 1), 3, 0.85);
          if (b.pierce > 0) { b.pierce--; b.hits.add(e); } else { b.life = 0; break; }
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    for (const b of this.ebullets) {
      b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r - 4) ** 2) { this.damagePlayer(b.dmg); b.life = 0; }
      if (this.arena && dist2(b.x, b.y, this.arena.x, this.arena.y) > (this.arena.r + 20) ** 2) b.life = 0;
    }
    this.ebullets = this.ebullets.filter((b) => b.life > 0 && Math.abs(b.x - p.x) < 800 && Math.abs(b.y - p.y) < 800);
  }

  // ---------------- Recogibles ----------------
  updatePickups(dt) {
    const p = this.p, mag = this.st.magnet;
    for (const g of this.pickups) {
      const d2 = dist2(g.x, g.y, p.x, p.y), range = g.type === 'chest' ? 30 : mag;
      if (g.mag || d2 < range * range) {
        g.mag = true; const d = Math.sqrt(d2) || 1, sp = 520;
        g.vx = lerp(g.vx, (p.x - g.x) / d * sp, Math.min(1, dt * 9)); g.vy = lerp(g.vy, (p.y - g.y) / d * sp, Math.min(1, dt * 9));
        g.x += g.vx * dt; g.y += g.vy * dt;
      }
      if (dist2(g.x, g.y, p.x, p.y) < (p.r + 8) ** 2) { g.taken = true; this.collect(g); }
    }
    this.pickups = this.pickups.filter((g) => !g.taken);
  }
  collect(g) {
    const p = this.p;
    if (g.type === 'gem') { p.xp += g.v; sfx.pick(); while (p.xp >= p.need) { p.xp -= p.need; p.lvl++; p.need = this.xpNeed(p.lvl); this.pendingLevels++; } if (this.pendingLevels && !this.paused && !this.dying) this.levelUp(); }
    else if (g.type === 'coin') { this.gold += g.v; sfx.coin(); }
    else if (g.type === 'heart') { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3); this.texts.push({ x: p.x, y: p.y - 20, v: '+VIDA', crit: false, life: 0.9, max: 0.9, heal: true }); sfx.claim(); }
    else if (g.type === 'magnet') { for (const o of this.pickups) if (o.type === 'gem' || o.type === 'coin') o.mag = true; sfx.claim(); }
    else if (g.type === 'bomb') { for (const e of this.enemies) if (!e.isBoss && Math.abs(e.x - p.x) < this.vw / 2 && Math.abs(e.y - p.y) < this.vh / 2) this.kill(e); this.flashScreen = 0.8; this.cam.shake = 14; sfx.boom(); this.ring(p.x, p.y, 420, 0, 'hsla(30,100%,70%,1)', 0, 0.5); }
    else if (g.type === 'chest') { this.openChest(); }
  }
  openChest() {
    const evo = this.evoOptions();
    let res;
    if (evo.length) { res = evo[0]; } else { const ch = this.choices(1); res = ch[0]; }
    if (res) { this.apply(res); this.o.onChest?.(res); }
  }

  // ---------------- Subidas de nivel ----------------
  levelUp() { if (!this.pendingLevels) return; this.pendingLevels--; this.pause(true); sfx.levelup(); this.o.onLevelUp?.(this.choices(3)); }
  evoOptions() {
    const out = [];
    for (const id in this.weapons) { const w = this.weapons[id], W = WEAPONS[id]; if (!w.evo && w.lvl >= 5 && this.passives[W.evo]) out.push({ kind: 'evo', id, name: W.evoName, desc: W.evoDesc, icon: W.icon, lvl: 6 }); }
    return out;
  }
  choices(n) {
    const pool = [], wc = Object.keys(this.weapons).length, pc = Object.keys(this.passives).length;
    for (const id in WEAPONS) { const w = this.weapons[id]; if (w ? w.lvl < 5 : wc < MAX_W) pool.push({ kind: 'weapon', id, name: WEAPONS[id].name, icon: WEAPONS[id].icon, lvl: w ? w.lvl + 1 : 1, desc: WEAPONS[id].desc[w ? w.lvl : 0], isNew: !w, w: w ? 1.4 : 1 }); }
    for (const id in PASSIVES) { const lv = this.passives[id] || 0; if (lv ? lv < 5 : pc < MAX_P) pool.push({ kind: 'passive', id, name: PASSIVES[id].name, icon: PASSIVES[id].icon, lvl: lv + 1, desc: PASSIVES[id].desc, isNew: !lv, w: 1 }); }
    const out = this.evoOptions().slice(0, 1);
    while (out.length < n && pool.length) { let tot = pool.reduce((a, c) => a + c.w, 0), r = Math.random() * tot, i = 0; for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; } out.push(pool.splice(i, 1)[0]); }
    if (!out.length) out.push({ kind: 'heal', id: 'heal', name: 'Reparación', icon: 'heart', desc: 'Recupera toda la vida.', lvl: 0 }, { kind: 'gold', id: 'gold', name: 'Botín', icon: 'coin', desc: '+50 de oro.', lvl: 0 });
    return out;
  }
  apply(c) {
    if (c.kind === 'weapon') { if (this.weapons[c.id]) this.weapons[c.id].lvl++; else this.addWeapon(c.id); }
    else if (c.kind === 'passive') { this.passives[c.id] = (this.passives[c.id] || 0) + 1; }
    else if (c.kind === 'evo') { this.weapons[c.id].evo = true; this.evolved++; this.flashScreen = 0.6; sfx.evolve(); this.ring(this.p.x, this.p.y, 250, 0, 'hsla(48,100%,70%,1)', 300, 0.6); }
    else if (c.kind === 'heal') this.p.hp = this.p.maxHp;
    else if (c.kind === 'gold') this.gold += 50;
    this.refreshStats();
  }
  choose(c) { this.apply(c); if (this.pendingLevels) { this.levelUp(); } else this.pause(false); }

  // ---------------- Efectos ----------------
  part(x, y, vx, vy, life, color, size, drag = 0.9) { if (this.parts.length > 700) return; this.parts.push({ x, y, vx, vy, life, max: life, color, size, drag }); }
  updateFx(dt) {
    for (const q of this.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; const k = Math.pow(q.drag, dt * 60); q.vx *= k; q.vy *= k; }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 32 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const f of this.fx) {
      f.life -= dt;
      if (f.type === 'delay') { f.t -= dt; if (f.t <= 0) { f.fn(); f.life = 0; } else f.life = 1; }
      if (f.type === 'ring' && (f.dmg || f.kb)) {
        const R = f.R * (1 - f.life / f.max); this.hash.query(f.x, f.y, R + 40, tmp);
        for (const e of tmp) { if (e.dead || f.hitSet.has(e)) continue; const d = Math.sqrt(dist2(f.x, f.y, e.x, e.y)); if (d < R + e.r) { f.hitSet.add(e); const a = Math.atan2(e.y - f.y, e.x - f.x); if (f.dmg) { const [dd, c] = this.dmgRoll(f.dmg); this.hurt(e, dd, c, Math.cos(a) * f.kb, Math.sin(a) * f.kb); } else { e.kx += Math.cos(a) * f.kb; e.ky += Math.sin(a) * f.kb; } } }
        if (f.kb > 300) this.ebullets = this.ebullets.filter((b) => dist2(b.x, b.y, f.x, f.y) > R * R);
      }
      if (f.type === 'meteor' && f.life <= 0) { this.explode(f.x, f.y, f.r, f.dmg, hsl(f.hue, 100, 60, 1)); this.fields.push({ x: f.x, y: f.y, r: f.r * 0.7, life: 0.8, max: 0.8, dmg: 0, tick: 99, hue: f.hue }); }
    }
    this.fx = this.fx.filter((f) => f.life > 0);
    for (const f of this.fields) {
      f.life -= dt; f.tick -= dt;
      if (f.dmg && f.tick <= 0) { f.tick = 0.45; this.hash.query(f.x, f.y, f.r + 30, tmp); for (const e of tmp) if (!e.dead && dist2(f.x, f.y, e.x, e.y) < (f.r + e.r) ** 2) { const [d, c] = this.dmgRoll(f.dmg); this.hurt(e, d, c, 0, 0); } }
    }
    this.fields = this.fields.filter((f) => f.life > 0);
    if (this.flashScreen > 0) this.flashScreen -= dt * 1.6;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.arena) this.arena.t += dt;
  }

  // ---------------- Render ----------------
  render() {
    const c = this.ctx, Z = this.zoom, W = this.cv.width, H = this.cv.height, p = this.p, now = this.t;
    const sh = this.settings.shake ? this.cam.shake : 0, cx = this.cam.x + rand(-sh, sh), cy = this.cam.y + rand(-sh, sh);
    const ox = W / 2 - cx * Z, oy = H / 2 - cy * Z;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    // fondo con paralaje
    this.tile(this.neb, cx * 0.18, cy * 0.18, Z * 0.9);
    c.globalCompositeOperation = 'lighter'; this.tile(this.stars, cx * 0.45, cy * 0.45, Z); c.globalCompositeOperation = 'source-over';
    // rejilla del suelo
    c.setTransform(Z, 0, 0, Z, ox, oy);
    const gs = 64, x0 = Math.floor((cx - this.vw / 2) / gs) * gs, x1 = cx + this.vw / 2, y0 = Math.floor((cy - this.vh / 2) / gs) * gs, y1 = cy + this.vh / 2;
    c.lineWidth = 1 / Z * 1.5; c.strokeStyle = hsl(this.hue, 100, 60, 0.07); c.beginPath();
    for (let x = x0; x <= x1; x += gs) { c.moveTo(x, y0); c.lineTo(x, y1); } for (let y = y0; y <= y1; y += gs) { c.moveTo(x0, y); c.lineTo(x1, y); } c.stroke();
    c.fillStyle = hsl(this.hue, 100, 70, 0.22); for (let x = x0; x <= x1; x += gs) for (let y = y0; y <= y1; y += gs) c.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    // luz bajo el jugador
    c.globalCompositeOperation = 'lighter';
    this.drawGlow(p.x, p.y, hsl(this.o.pilotHue, 100, 50, 0.18), 90);
    // campos y arena
    for (const f of this.fields) { const a = f.life / f.max; this.drawGlow(f.x, f.y, hsl(f.hue, 100, 55, 0.5 * a), f.r * 1.3); }
    if (this.arena) {
      const A = this.arena, k = Math.min(1, A.t * 2);
      c.lineWidth = 4; c.strokeStyle = hsl(this.boss ? this.boss.hue : 0, 100, 60, 0.85 * k); c.shadowColor = c.strokeStyle; c.beginPath(); c.arc(A.x, A.y, A.r * (2 - k), 0, TAU); c.stroke();
      c.lineWidth = 14; c.strokeStyle = hsl(this.boss ? this.boss.hue : 0, 100, 55, 0.15 * k); c.stroke();
      c.setLineDash([10, 14]); c.lineDashOffset = -now * 40; c.lineWidth = 2; c.strokeStyle = hsl(this.boss ? this.boss.hue : 0, 100, 80, 0.5 * k); c.beginPath(); c.arc(A.x, A.y, A.r - 12, 0, TAU); c.stroke(); c.setLineDash([]);
    }
    // telegrafías
    c.globalCompositeOperation = 'source-over';
    for (const f of this.fx) {
      if (f.type === 'meteor') { const k = 1 - f.life / f.max; c.fillStyle = hsl(f.hue, 100, 55, 0.12 + k * 0.15); c.beginPath(); c.arc(f.x, f.y, f.r, 0, TAU); c.fill(); c.lineWidth = 2; c.strokeStyle = hsl(f.hue, 100, 65, 0.7); c.beginPath(); c.arc(f.x, f.y, f.r * k, 0, TAU); c.stroke(); }
      if (f.type === 'tele') { c.save(); c.translate(f.x, f.y); c.rotate(f.a); const k = 1 - f.life / f.max; c.fillStyle = `rgba(255,40,70,${0.12 + 0.18 * Math.abs(Math.sin(now * 20))})`; c.fillRect(0, -f.w / 2, f.len, f.w); c.fillStyle = 'rgba(255,60,90,.35)'; c.fillRect(0, -f.w / 2, f.len * k, f.w); c.restore(); }
    }
    for (const e of this.enemies) if (e.tele) { c.save(); c.translate(e.x, e.y); c.rotate(e.dashA); c.fillStyle = 'rgba(255,50,80,.2)'; c.fillRect(0, -e.r, 200, e.r * 2); c.restore(); }
    // recogibles
    for (const g of this.pickups) {
      if (!this.onScreen(g.x, g.y, 20)) continue;
      const s = g.type === 'gem' ? gemSprite(g.tier) : itemSprite(g.type), bob = g.type === 'gem' ? 0 : Math.sin(now * 4 + g.x) * 2;
      const sc = g.type === 'chest' ? 1.4 : 1;
      c.drawImage(s.img, g.x - s.size / 2 * sc, g.y - s.size / 2 * sc + bob, s.size * sc, s.size * sc);
    }
    // enemigos
    for (const e of this.enemies) {
      if (e.isBoss || !this.onScreen(e.x, e.y, e.r * 2)) continue;
      const s = e.flash > 0 ? e.spr.flash : e.spr.img, sz = e.spr.size, cs = Math.cos(e.ang), sn = Math.sin(e.ang);
      c.setTransform(Z * cs, Z * sn, -Z * sn, Z * cs, ox + e.x * Z, oy + e.y * Z); c.drawImage(s, -sz / 2, -sz / 2, sz, sz);
      if (e.elite) { c.setTransform(Z, 0, 0, Z, ox, oy); this.hpBar(e.x, e.y - e.r - 12, 46, e.hp / e.maxHp, '#ff5577'); }
    }
    c.setTransform(Z, 0, 0, Z, ox, oy);
    if (this.boss || this.enemies.some((e) => e.isBoss)) for (const e of this.enemies) if (e.isBoss) this.drawBoss(e);
    // armas: hojas orbitales y drones
    c.globalCompositeOperation = 'lighter';
    const ow = this.weapons.orbit;
    if (ow && ow.blades) for (const [bx, by, a] of ow.blades) {
      const r = (ow.evo ? 14 : 10) * this.st.area; this.drawGlow(bx, by, ow.evo ? 'hsla(48,100%,60%,1)' : 'hsla(170,100%,60%,1)', r * 2.6);
      c.save(); c.translate(bx, by); c.rotate(a + now * 8); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(r, 0); c.lineTo(0, r * 0.35); c.lineTo(-r, 0); c.lineTo(0, -r * 0.35); c.fill(); c.restore();
    }
    const dw = this.weapons.drone;
    if (dw) for (const d of dw.drones) { this.drawGlow(d.x, d.y, 'hsla(25,100%,60%,1)', 18); c.fillStyle = '#ffe2c4'; c.beginPath(); c.arc(d.x, d.y, 3.5, 0, TAU); c.fill(); }
    // proyectiles del jugador
    for (const b of this.bullets) {
      if (b.kind === 'missile') { this.drawGlow(b.x, b.y, 'hsla(25,100%,60%,1)', 20); continue; }
      const col = b.kind === 'nova' ? 'hsla(48,100%,60%,1)' : hsl(this.o.pilotHue, 100, 60, 1), l = Math.hypot(b.vx, b.vy);
      c.strokeStyle = col; c.lineWidth = b.r * 1.3; c.lineCap = 'round'; c.globalAlpha = 0.55; c.beginPath(); c.moveTo(b.x - b.vx / l * 18, b.y - b.vy / l * 18); c.lineTo(b.x, b.y); c.stroke(); c.globalAlpha = 1;
      this.drawGlow(b.x, b.y, col, b.r * 4);
    }
    // jugador
    c.globalCompositeOperation = 'source-over';
    if (!(p.inv > 0 && Math.floor(now * 20) % 2 === 0 && !p.revived) || p.inv <= 0) {
      const cs = Math.cos(p.ang), sn = Math.sin(p.ang), s = this.pSprite;
      c.setTransform(Z * cs, Z * sn, -Z * sn, Z * cs, ox + p.x * Z, oy + p.y * Z); c.drawImage(s.img, -s.size / 2, -s.size / 2, s.size, s.size);
      c.setTransform(Z, 0, 0, Z, ox, oy);
    }
    // anillo de recogida e indicador de vida
    c.lineWidth = 1.2; c.strokeStyle = hsl(this.o.pilotHue, 100, 70, 0.1); c.beginPath(); c.arc(p.x, p.y, this.st.magnet, 0, TAU); c.stroke();
    this.hpBar(p.x, p.y + 22, 34, p.hp / p.maxHp, p.hp / p.maxHp < 0.3 ? '#ff4d6a' : '#5dff9c');
    // balas enemigas
    c.globalCompositeOperation = 'lighter';
    for (const b of this.ebullets) { if (!this.onScreen(b.x, b.y, 10)) continue; this.drawGlow(b.x, b.y, hsl(b.hue, 100, 55, 1), b.r * 3.4); }
    c.globalCompositeOperation = 'source-over';
    for (const b of this.ebullets) { if (!this.onScreen(b.x, b.y, 10)) continue; c.fillStyle = '#fff'; c.beginPath(); c.arc(b.x, b.y, b.r * 0.55, 0, TAU); c.fill(); }
    // efectos aditivos
    c.globalCompositeOperation = 'lighter';
    for (const f of this.fx) {
      const k = 1 - f.life / f.max;
      if (f.type === 'ring') { const R = f.R * k; c.lineWidth = 10 * (1 - k) + 2; c.strokeStyle = f.color.replace(/[^,]+\)$/, `${(1 - k) * 0.9})`); c.beginPath(); c.arc(f.x, f.y, R, 0, TAU); c.stroke(); c.lineWidth = 2; c.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.7})`; c.stroke(); }
      else if (f.type === 'boom') { this.drawGlow(f.x, f.y, f.color.replace(/[^,]+\)$/, `${1 - k})`), f.R * 2.2 * (0.6 + k * 0.6)); c.lineWidth = 3 * (1 - k); c.strokeStyle = `rgba(255,255,255,${1 - k})`; c.beginPath(); c.arc(f.x, f.y, f.R * (0.3 + k * 0.9), 0, TAU); c.stroke(); }
      else if (f.type === 'pop') { this.drawGlow(f.x, f.y, f.color.replace(/[^,]+\)$/, `${(1 - k) * 0.8})`), f.R * (0.5 + k)); }
      else if (f.type === 'bolt') {
        const a = f.life / f.max;
        for (let pass = 0; pass < 2; pass++) {
          c.lineWidth = pass ? 1.6 : 7; c.strokeStyle = pass ? `rgba(255,255,255,${a})` : hsl(f.hue, 100, 65, a * 0.5); c.beginPath();
          for (let i = 0; i < f.pts.length - 1; i++) { const [ax, ay] = f.pts[i], [bx, by] = f.pts[i + 1]; c.moveTo(ax, ay); const segs = 5; for (let s = 1; s <= segs; s++) { const t = s / segs, j = s === segs ? 0 : 10; c.lineTo(lerp(ax, bx, t) + rand(-j, j), lerp(ay, by, t) + rand(-j, j)); } }
          c.stroke();
        }
      } else if (f.type === 'meteor') {
        const h = (f.life / f.max) * 360, mx = f.x - h * 0.5, my = f.y - h;
        c.lineWidth = f.r * 0.25; c.lineCap = 'round'; c.strokeStyle = hsl(f.hue, 100, 60, 0.5); c.beginPath(); c.moveTo(mx - 30, my - 60); c.lineTo(mx, my); c.stroke();
        this.drawGlow(mx, my, hsl(f.hue, 100, 60, 1), f.r * 0.9);
      }
    }
    for (const q of this.parts) { if (!this.onScreen(q.x, q.y, 10)) continue; const a = q.life / q.max; c.globalAlpha = a; this.drawGlow(q.x, q.y, q.color, q.size * (0.5 + a * 0.6)); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    // números de daño
    c.textAlign = 'center'; c.lineJoin = 'round';
    for (const t of this.texts) {
      const a = Math.min(1, t.life / t.max * 2), pop = 1 + Math.max(0, (t.life / t.max - 0.75)) * 2.4, fs = (t.crit ? 15 : 11) * pop;
      c.globalAlpha = a; c.font = `800 ${fs}px "Chakra Petch", system-ui, sans-serif`;
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,10,.85)'; c.strokeText(t.v, t.x, t.y);
      c.fillStyle = t.bad ? '#ff5470' : t.heal ? '#5dff9c' : t.crit ? '#ffd23f' : '#fff'; c.fillText(t.v, t.x, t.y);
    }
    c.globalAlpha = 1;
    // pantalla: viñeta, destellos y joystick
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.vig, 0, 0);
    if (this.hurtFlash > 0 || p.hp / p.maxHp < 0.25) { const a = Math.max(this.hurtFlash || 0, p.hp / p.maxHp < 0.25 ? 0.18 + Math.sin(now * 6) * 0.08 : 0); const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2); g.addColorStop(0, 'rgba(255,0,40,0)'); g.addColorStop(1, `rgba(255,0,40,${a})`); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    if (this.flashScreen > 0) { c.fillStyle = `rgba(255,255,255,${Math.max(0, this.flashScreen) * 0.7})`; c.fillRect(0, 0, W, H); }
    // indicador de jefe/élite fuera de pantalla
    for (const e of this.enemies) if ((e.isBoss || e.elite) && !this.onScreen(e.x, e.y, 0)) { const a = Math.atan2(e.y - cy, e.x - cx), R = Math.min(W, H) / 2 - 30 * this.dpr; c.fillStyle = e.isBoss ? '#ff3b5c' : '#ffb02e'; c.save(); c.translate(W / 2 + Math.cos(a) * R, H / 2 + Math.sin(a) * R); c.rotate(a); c.beginPath(); c.moveTo(12 * this.dpr, 0); c.lineTo(-6 * this.dpr, 8 * this.dpr); c.lineTo(-6 * this.dpr, -8 * this.dpr); c.fill(); c.restore(); }
    const I = this.input;
    if (I.active) {
      const d = this.dpr; c.globalAlpha = 0.9;
      c.lineWidth = 2 * d; c.strokeStyle = 'rgba(255,255,255,.25)'; c.fillStyle = 'rgba(255,255,255,.05)'; c.beginPath(); c.arc(I.ox * d, I.oy * d, 50 * d, 0, TAU); c.fill(); c.stroke();
      const kx = (I.ox + I.jx * 46) * d, ky = (I.oy + I.jy * 46) * d, g = c.createRadialGradient(kx, ky, 0, kx, ky, 24 * d);
      g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, hsl(this.o.pilotHue, 100, 60, 0.35)); c.fillStyle = g; c.beginPath(); c.arc(kx, ky, 22 * d, 0, TAU); c.fill();
      c.globalAlpha = 1;
    }
  }
  onScreen(x, y, m) { return Math.abs(x - this.cam.x) < this.vw / 2 + m && Math.abs(y - this.cam.y) < this.vh / 2 + m; }
  drawGlow(x, y, color, size) { const g = glow(color.replace(/,\s*[^,]+\)$/, ',1)'), 16), a = this.ctx.globalAlpha; const m = color.match(/,\s*([^,]+)\)$/); const ca = m ? parseFloat(m[1]) : 1; if (ca < 1) this.ctx.globalAlpha = a * ca; this.ctx.drawImage(g.img, x - size / 2, y - size / 2, size, size); this.ctx.globalAlpha = a; }
  tile(img, px, py, scale) {
    const c = this.ctx, W = this.cv.width, H = this.cv.height, s = img.width * scale * 0.5;
    let sx = (-(px * scale * 0.5) % s + s) % s - s, sy = (-(py * scale * 0.5) % s + s) % s - s;
    for (let x = sx; x < W; x += s) for (let y = sy; y < H; y += s) c.drawImage(img, x, y, s + 1, s + 1);
  }
  hpBar(x, y, w, f, col) { const c = this.ctx; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - w / 2 - 1, y - 1, w + 2, 5); c.fillStyle = col; c.fillRect(x - w / 2, y, w * clamp(f, 0, 1), 3); }
  drawBoss(b) {
    const c = this.ctx, t = this.t, neon = hsl(b.hue, 100, 62), dark = hsl(b.hue, 70, 8), fl = b.flash > 0;
    c.lineJoin = 'round';
    const body = (x, y, r, sides, rot, alpha = 1) => {
      c.globalAlpha = alpha; c.beginPath(); for (let i = 0; i < sides; i++) { const a = rot + i / sides * TAU; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath();
      c.fillStyle = fl ? '#fff' : dark; c.fill(); c.lineWidth = 3; c.strokeStyle = fl ? '#fff' : neon; c.stroke(); c.globalAlpha = 1;
    };
    c.globalCompositeOperation = 'lighter'; this.drawGlow(b.x, b.y, hsl(b.hue, 100, 55, 0.6), b.r * 5); c.globalCompositeOperation = 'source-over';
    if (b.bossId === 'leviathan') {
      for (let i = 12; i >= 1; i--) { const tp = b.trail[Math.min(b.trail.length - 1, i * 4)]; if (!tp) continue; body(tp[0], tp[1], b.r * (1 - i * 0.06), 6, t * 2 + i, 0.95); }
      body(b.x, b.y, b.r, 3, b.ang, 1); body(b.x, b.y, b.r * 0.55, 3, b.ang + Math.PI, 1);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(b.x + Math.cos(b.ang) * b.r * 0.2, b.y + Math.sin(b.ang) * b.r * 0.2, 7, 0, TAU); c.fill();
    } else if (b.bossId === 'prism') {
      body(b.x, b.y, b.r * 1.15, 3, b.spin, 0.6); body(b.x, b.y, b.r * 1.15, 3, -b.spin + Math.PI, 0.6); body(b.x, b.y, b.r * 0.62, 6, b.spin * 2, 1);
      c.globalCompositeOperation = 'lighter'; this.drawGlow(b.x, b.y, 'hsla(0,0%,100%,0.9)', 40 + Math.sin(t * 8) * 8); c.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 3; i++) { const a = b.spin * -1.5 + i / 3 * TAU, r2 = b.r * 1.6; body(b.x + Math.cos(a) * r2, b.y + Math.sin(a) * r2, 9, 4, t * 3, 1); }
    } else {
      body(b.x, b.y, b.r, 12, t * 0.3, 1);
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + t * 0.5, r = i === 6 ? 0 : b.r * 0.55; body(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, b.r * 0.26 * (1 + Math.sin(t * 3 + i) * 0.1), 6, 0, 1); }
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + Math.sin(t + i) * 0.2, l = b.r * (1.35 + Math.sin(t * 2 + i) * 0.12); c.strokeStyle = neon; c.lineWidth = 2.5; c.beginPath(); c.moveTo(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r); c.lineTo(b.x + Math.cos(a) * l, b.y + Math.sin(a) * l); c.stroke(); }
    }
  }
}

// Fondo animado de los menús: nebulosa, planeta del capítulo con atmósfera y anillos, y polvo estelar
import { TAU, rand, hsl, lerp } from './util.js';
import { nebulaTile, starTile } from './sprites.js';
import { CHAPTERS } from './data.js';

const planetCache = new Map();
function planetTex(i) {
  if (planetCache.has(i)) return planetCache.get(i);
  const ch = CHAPTERS[i], S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, TAU); x.clip();
  const g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, hsl(ch.hue, 70, 45)); g.addColorStop(1, hsl(ch.hue2, 70, 20)); x.fillStyle = g; x.fillRect(0, 0, S, S);
  // bandas atmosféricas
  let seed = i * 9973 + 1; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let b = 0; b < 28; b++) { const y = r() * S, h = 6 + r() * 40; x.fillStyle = hsl(r() < 0.5 ? ch.hue : ch.hue2, 60 + r() * 30, 30 + r() * 40, 0.12 + r() * 0.2); x.beginPath(); x.ellipse(S / 2, y, S * 0.9, h, (r() - 0.5) * 0.15, 0, TAU); x.fill(); }
  for (let s = 0; s < 14; s++) { const px = r() * S, py = r() * S, rr = 8 + r() * 40, gg = x.createRadialGradient(px, py, 0, px, py, rr); gg.addColorStop(0, hsl(ch.hue2, 100, 80, 0.35)); gg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gg; x.fillRect(px - rr, py - rr, rr * 2, rr * 2); }
  // sombreado (terminador)
  const sh = x.createRadialGradient(S * 0.3, S * 0.28, S * 0.05, S * 0.45, S * 0.45, S * 0.75);
  sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.45, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,10,0.92)'); x.fillStyle = sh; x.fillRect(0, 0, S, S);
  planetCache.set(i, c); return c;
}

export class MenuBG {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d'); this.t = 0; this.chap = 0; this.fade = 1; this.running = false;
    this.dust = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), z: rand(0.2, 1), s: rand(0.5, 2) }));
    this.resize(); window.addEventListener('resize', () => this.resize());
  }
  resize() { const d = Math.min(devicePixelRatio || 1, 2); this.d = d; this.cv.width = innerWidth * d; this.cv.height = innerHeight * d; }
  setChapter(i) { if (i !== this.chap) { this.prev = this.chap; this.chap = i; this.fade = 0; } }
  start() { if (this.running) return; this.running = true; this.cv.classList.remove('hidden'); this.last = performance.now(); const loop = (n) => { if (!this.running) return; this.draw(Math.min(0.05, (n - this.last) / 1000)); this.last = n; requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  stop() { this.running = false; this.cv.classList.add('hidden'); }
  draw(dt) {
    this.t += dt; this.fade = Math.min(1, this.fade + dt * 2.2);
    const c = this.ctx, W = this.cv.width, H = this.cv.height, ch = CHAPTERS[this.chap], t = this.t, d = this.d;
    const neb = nebulaTile(ch.hue, ch.hue2), s = Math.max(W, H) * 1.2, ox = -((t * 6) % s), oy = -((t * 3) % s);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    for (let x = ox; x < W; x += s) for (let y = oy; y < H; y += s) c.drawImage(neb, x, y, s + 1, s + 1);
    c.globalCompositeOperation = 'lighter';
    const st = starTile(ch.hue), s2 = 512 * d; for (let x = -((t * 14) % s2); x < W; x += s2) for (let y = -((t * 7) % s2); y < H; y += s2) c.drawImage(st, x, y, s2, s2);
    c.globalCompositeOperation = 'source-over';
    // planeta
    const cx = W / 2, cy = H * 0.43, R = Math.min(W * 0.36, H * 0.2) * (0.9 + 0.1 * this.fade), bob = Math.sin(t * 0.8) * 6 * d;
    c.globalCompositeOperation = 'lighter';
    const halo = c.createRadialGradient(cx, cy + bob, R * 0.8, cx, cy + bob, R * 2.3); halo.addColorStop(0, hsl(ch.hue, 100, 60, 0.45 * this.fade)); halo.addColorStop(0.4, hsl(ch.hue2, 100, 50, 0.12 * this.fade)); halo.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = halo; c.fillRect(cx - R * 2.5, cy - R * 2.5 + bob, R * 5, R * 5);
    c.globalCompositeOperation = 'source-over';
    // anillo trasero
    const ring = (front) => {
      c.save(); c.translate(cx, cy + bob); c.rotate(-0.32); c.scale(1, 0.24);
      c.beginPath(); c.arc(0, 0, R * 1.75, front ? 0 : Math.PI, front ? Math.PI : TAU); c.lineWidth = R * 0.32; c.strokeStyle = hsl(ch.hue2, 80, 70, 0.22 * this.fade); c.stroke();
      c.lineWidth = R * 0.06; c.strokeStyle = hsl(ch.hue, 100, 80, 0.5 * this.fade); c.beginPath(); c.arc(0, 0, R * 1.55, front ? 0 : Math.PI, front ? Math.PI : TAU); c.stroke();
      c.restore();
    };
    ring(false);
    c.save(); c.globalAlpha = this.fade; c.translate(cx, cy + bob); c.rotate(t * 0.04); c.drawImage(planetTex(this.chap), -R, -R, R * 2, R * 2); c.restore();
    // borde atmosférico
    c.globalCompositeOperation = 'lighter'; c.lineWidth = 3 * d; c.strokeStyle = hsl(ch.hue, 100, 75, 0.5 * this.fade); c.beginPath(); c.arc(cx, cy + bob, R, Math.PI * 0.85, Math.PI * 1.65); c.stroke(); c.globalCompositeOperation = 'source-over';
    ring(true);
    // polvo
    c.globalCompositeOperation = 'lighter';
    for (const p of this.dust) { p.y -= dt * 0.012 * p.z; if (p.y < 0) { p.y = 1; p.x = Math.random(); } const a = 0.25 + 0.5 * Math.abs(Math.sin(t * p.z * 2 + p.x * 10)); c.fillStyle = hsl(ch.hue, 100, 80, a * p.z); c.fillRect(p.x * W, p.y * H, p.s * d * p.z * 1.5, p.s * d * p.z * 1.5); }
    c.globalCompositeOperation = 'source-over';
    // viñeta
    const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(2,2,10,0.8)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
  }
}

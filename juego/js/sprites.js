// Sprites pre-renderizados (brillo neón cocinado una vez) y fondos procedurales
import { TAU, hsl, rand } from './util.js';
export const SPR = 2.5; // píxeles de sprite por unidad de mundo
const cache = new Map();

function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }

function poly(ctx, n, r, rot = 0) { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }
function shapePath(ctx, shape, r) {
  switch (shape) {
    case 'tri': ctx.beginPath(); ctx.moveTo(r * 1.15, 0); ctx.lineTo(-r * 0.8, r * 0.85); ctx.lineTo(-r * 0.45, 0); ctx.lineTo(-r * 0.8, -r * 0.85); ctx.closePath(); break;
    case 'dart': ctx.beginPath(); ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r, r * 0.7); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r, -r * 0.7); ctx.closePath(); break;
    case 'hex': poly(ctx, 6, r, 0); break;
    case 'diamond': ctx.beginPath(); ctx.moveTo(r * 1.1, 0); ctx.lineTo(0, r * 0.75); ctx.lineTo(-r * 1.1, 0); ctx.lineTo(0, -r * 0.75); ctx.closePath(); break;
    case 'square': poly(ctx, 4, r * 1.1, Math.PI / 4); break;
    case 'oct': poly(ctx, 8, r, Math.PI / 8); break;
    default: ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  }
}

// Enemigo: relleno oscuro, contorno neón con halo y núcleo brillante. Devuelve {img, flash, size}
export function enemySprite(shape, r, hue) {
  const key = `e:${shape}:${r}:${hue}`; if (cache.has(key)) return cache.get(key);
  const pad = 14, size = (r * 2.8 + pad * 2) * SPR, mk = (white) => {
    const c = canvas(size, size), x = c.getContext('2d');
    x.translate(size / 2, size / 2); x.scale(SPR, SPR); x.lineJoin = 'round';
    const neon = white ? '#fff' : hsl(hue, 100, 62), dark = white ? '#fff' : hsl(hue, 70, 9);
    // halo exterior
    x.shadowColor = white ? '#fff' : hsl(hue, 100, 55); x.shadowBlur = 14 * SPR;
    shapePath(x, shape, r); x.fillStyle = dark; x.fill();
    x.lineWidth = 2.4; x.strokeStyle = neon; x.stroke();
    x.shadowBlur = 0;
    if (!white) {
      // brillo interior en degradado
      const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, hsl(hue, 100, 60, 0.45)); g.addColorStop(1, hsl(hue, 100, 40, 0));
      shapePath(x, shape, r * 0.92); x.fillStyle = g; x.fill();
      // detalle interior
      x.strokeStyle = hsl(hue, 100, 75, 0.55); x.lineWidth = 1.1;
      if (shape === 'hex' || shape === 'oct') { shapePath(x, shape, r * 0.55); x.stroke(); }
      if (shape === 'square') { x.beginPath(); x.moveTo(-r * 0.5, 0); x.lineTo(r * 0.5, 0); x.moveTo(0, -r * 0.5); x.lineTo(0, r * 0.5); x.stroke(); }
      if (shape === 'oct') { x.beginPath(); x.arc(0, 0, r * 1.25, 0, TAU); x.strokeStyle = hsl(hue, 100, 70, 0.35); x.setLineDash([6, 5]); x.lineWidth = 1.6; x.stroke(); x.setLineDash([]); }
      // núcleo / ojo
      const cx = shape === 'tri' || shape === 'dart' ? r * 0.15 : 0;
      x.shadowColor = '#fff'; x.shadowBlur = 8 * SPR; x.fillStyle = hsl(hue, 100, 92);
      x.beginPath(); x.arc(cx, 0, Math.max(2.2, r * 0.2), 0, TAU); x.fill(); x.shadowBlur = 0;
    }
    return c;
  };
  const s = { img: mk(false), flash: mk(true), size: size / SPR };
  cache.set(key, s); return s;
}

// Punto brillante (proyectiles, gemas de luz, partículas)
export function glow(color, r = 16) {
  const key = `g:${color}:${r}`; if (cache.has(key)) return cache.get(key);
  const s = r * 2 * SPR, c = canvas(s, s), x = c.getContext('2d'), g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, color); g.addColorStop(0.45, color.replace(/[^,]+\)$/, '0.35)')); g.addColorStop(1, color.replace(/[^,]+\)$/, '0)'));
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  const o = { img: c, size: r * 2 }; cache.set(key, o); return o;
}

// Gema de experiencia
export function gemSprite(tier) {
  const key = 'gem' + tier; if (cache.has(key)) return cache.get(key);
  const hue = [195, 140, 285, 40][tier], r = [5, 6.5, 8, 9][tier], size = (r * 2 + 16) * SPR, c = canvas(size, size), x = c.getContext('2d');
  x.translate(size / 2, size / 2); x.scale(SPR, SPR);
  x.shadowColor = hsl(hue, 100, 60); x.shadowBlur = 10 * SPR;
  x.beginPath(); x.moveTo(0, -r * 1.25); x.lineTo(r * 0.85, 0); x.lineTo(0, r * 1.25); x.lineTo(-r * 0.85, 0); x.closePath();
  x.fillStyle = hsl(hue, 100, 55); x.fill(); x.shadowBlur = 0;
  x.beginPath(); x.moveTo(0, -r * 1.25); x.lineTo(r * 0.85, 0); x.lineTo(0, 0); x.closePath(); x.fillStyle = hsl(hue, 100, 85); x.fill();
  x.beginPath(); x.moveTo(0, r * 1.25); x.lineTo(-r * 0.85, 0); x.lineTo(0, 0); x.closePath(); x.fillStyle = hsl(hue, 90, 35); x.fill();
  const o = { img: c, size: size / SPR }; cache.set(key, o); return o;
}

// Otros objetos recogibles
export function itemSprite(kind) {
  const key = 'it' + kind; if (cache.has(key)) return cache.get(key);
  const size = 44 * SPR, c = canvas(size, size), x = c.getContext('2d');
  x.translate(size / 2, size / 2); x.scale(SPR, SPR); x.lineJoin = 'round';
  if (kind === 'coin') {
    x.shadowColor = '#ffc93c'; x.shadowBlur = 10 * SPR;
    const g = x.createLinearGradient(-7, -7, 7, 7); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ffc12e'); g.addColorStop(1, '#c46a00');
    x.beginPath(); x.arc(0, 0, 7, 0, TAU); x.fillStyle = g; x.fill(); x.shadowBlur = 0;
    x.lineWidth = 1.4; x.strokeStyle = '#8a4b00'; x.beginPath(); x.arc(0, 0, 4.4, 0, TAU); x.stroke();
  } else if (kind === 'heart') {
    x.shadowColor = '#ff3d6e'; x.shadowBlur = 12 * SPR; x.fillStyle = '#ff4f7b';
    x.beginPath(); x.moveTo(0, 9); x.bezierCurveTo(-14, -1, -7, -12, 0, -4); x.bezierCurveTo(7, -12, 14, -1, 0, 9); x.fill();
    x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.ellipse(-4, -3, 2.4, 1.6, -0.6, 0, TAU); x.fill();
  } else if (kind === 'magnet') {
    x.shadowColor = '#4ad0ff'; x.shadowBlur = 12 * SPR; x.lineWidth = 5; x.lineCap = 'butt';
    x.strokeStyle = '#ff4d6a'; x.beginPath(); x.arc(0, -1, 7, Math.PI, Math.PI * 1.5); x.stroke();
    x.strokeStyle = '#4aa8ff'; x.beginPath(); x.arc(0, -1, 7, Math.PI * 1.5, TAU); x.stroke();
    x.strokeStyle = '#dfe8ff'; x.beginPath(); x.moveTo(-7, -1); x.lineTo(-7, 7); x.moveTo(7, -1); x.lineTo(7, 7); x.stroke();
  } else if (kind === 'bomb') {
    x.shadowColor = '#ff8a3d'; x.shadowBlur = 14 * SPR; x.fillStyle = '#2a1d3a'; x.strokeStyle = '#ff8a3d'; x.lineWidth = 2;
    x.beginPath(); x.arc(0, 2, 8, 0, TAU); x.fill(); x.stroke(); x.shadowBlur = 0;
    x.fillStyle = '#ffd36b'; x.beginPath(); x.arc(5, -8, 2.6, 0, TAU); x.fill();
  } else if (kind === 'chest') {
    x.shadowColor = '#ffcc4d'; x.shadowBlur = 16 * SPR;
    const g = x.createLinearGradient(0, -10, 0, 10); g.addColorStop(0, '#ffd66b'); g.addColorStop(1, '#c0710f');
    x.fillStyle = g; x.beginPath(); x.roundRect(-11, -8, 22, 16, 3); x.fill(); x.shadowBlur = 0;
    x.fillStyle = '#7a3c00'; x.fillRect(-11, -2, 22, 2.4); x.fillStyle = '#fff6c8'; x.fillRect(-2, -4, 4, 6);
  }
  const o = { img: c, size: 44 }; cache.set(key, o); return o;
}

// Nave del jugador
export function playerSprite(hue) {
  const key = 'pl' + hue; if (cache.has(key)) return cache.get(key);
  const size = 70 * SPR, c = canvas(size, size), x = c.getContext('2d');
  x.translate(size / 2, size / 2); x.scale(SPR, SPR); x.lineJoin = 'round';
  const neon = hsl(hue, 100, 65);
  x.shadowColor = neon; x.shadowBlur = 16 * SPR;
  // alas
  x.beginPath(); x.moveTo(17, 0); x.lineTo(-6, 13); x.lineTo(-12, 15); x.lineTo(-8, 5); x.lineTo(-11, 0); x.lineTo(-8, -5); x.lineTo(-12, -15); x.lineTo(-6, -13); x.closePath();
  const g = x.createLinearGradient(-12, 0, 17, 0); g.addColorStop(0, hsl(hue, 60, 12)); g.addColorStop(1, hsl(hue, 70, 28));
  x.fillStyle = g; x.fill(); x.lineWidth = 2; x.strokeStyle = neon; x.stroke(); x.shadowBlur = 0;
  // cabina
  x.beginPath(); x.moveTo(11, 0); x.lineTo(-2, 4.5); x.lineTo(-4, 0); x.lineTo(-2, -4.5); x.closePath();
  x.fillStyle = hsl(hue, 100, 85); x.shadowColor = '#fff'; x.shadowBlur = 8 * SPR; x.fill(); x.shadowBlur = 0;
  // líneas de detalle
  x.strokeStyle = hsl(hue, 100, 80, 0.6); x.lineWidth = 0.8; x.beginPath(); x.moveTo(-6, 9); x.lineTo(4, 3); x.moveTo(-6, -9); x.lineTo(4, -3); x.stroke();
  const o = { img: c, size: 70 }; cache.set(key, o); return o;
}

// Fondo de nebulosa repetible (cada mancha se dibuja en sus 9 posiciones envueltas)
export function nebulaTile(hue, hue2, seed = 1) {
  const key = `neb:${hue}:${hue2}`; if (cache.has(key)) return cache.get(key);
  const S = 1024, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = hsl(hue2, 55, 4); x.fillRect(0, 0, S, S);
  x.globalCompositeOperation = 'lighter';
  const blob = (bx, by, r, col) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const px = bx + i * S, py = by + j * S; if (px + r < 0 || px - r > S || py + r < 0 || py - r > S) continue; const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } };
  for (let i = 0; i < 26; i++) blob(rand(S), rand(S), rand(140, 380), hsl(Math.random() < 0.55 ? hue : hue2, 85, rand(30, 50), rand(0.05, 0.13)));
  for (let i = 0; i < 40; i++) blob(rand(S), rand(S), rand(40, 120), hsl(Math.random() < 0.5 ? hue : hue2, 100, 60, rand(0.03, 0.08)));
  // polvo oscuro
  x.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 18; i++) blob(rand(S), rand(S), rand(80, 220), 'rgba(0,0,0,0.25)');
  // estrellas lejanas
  for (let i = 0; i < 500; i++) { const a = Math.random(); x.fillStyle = `rgba(${200 + a * 55},${210 + a * 45},255,${0.15 + a * 0.5})`; x.fillRect(rand(S), rand(S), a > 0.93 ? 2 : 1, a > 0.93 ? 2 : 1); }
  cache.set(key, c); return c;
}
export function starTile(hue) {
  const key = 'stars' + hue; if (cache.has(key)) return cache.get(key);
  const S = 512, c = canvas(S, S), x = c.getContext('2d');
  for (let i = 0; i < 70; i++) {
    const px = rand(S), py = rand(S), r = rand(0.6, 1.8), g = x.createRadialGradient(px, py, 0, px, py, r * 4);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.3, hsl(hue + rand(-40, 40), 100, 80, 0.4)); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - r * 4, py - r * 4, r * 8, r * 8);
  }
  cache.set(key, c); return c;
}
export function vignette(w, h) {
  const key = `vig:${w}:${h}`; if (cache.has(key)) return cache.get(key);
  for (const k of cache.keys()) if (k.startsWith('vig:')) cache.delete(k);
  const c = canvas(w, h), x = c.getContext('2d'), g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,8,0.72)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  cache.set(key, c); return c;
}

// Audio sintetizado con WebAudio: efectos y música procedural (sin archivos)
import { S } from './save.js';
let ctx = null, master, sfxBus, musicBus, comp, noiseBuf;
const last = {};

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
  sfxBus = ctx.createGain(); sfxBus.gain.value = S.settings.sfx ? 0.55 : 0; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = S.settings.music ? 0.32 : 0; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // reverb sencilla para la música
  startMusic();
}
export function applyAudioSettings() { if (!ctx) return; sfxBus.gain.value = S.settings.sfx ? 0.55 : 0; musicBus.gain.setTargetAtTime(S.settings.music ? 0.32 : 0, ctx.currentTime, 0.2); }

function throttle(name, ms) { const n = performance.now(); if (last[name] && n - last[name] < ms) return true; last[name] = n; return false; }
function tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0, bus = sfxBus) {
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol = 0.3, freq = 1200, q = 1, type = 'lowpass', slide = 0.3, delay = 0) {
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

let pickCombo = 0, pickT = 0;
export const sfx = {
  shoot() { if (!ctx || throttle('shoot', 70)) return; tone(880 + Math.random() * 120, 0.07, 'square', 0.04, 0.45); },
  hit() { if (!ctx || throttle('hit', 45)) return; noise(0.06, 0.12, 2400, 1, 'bandpass', 0.5); },
  kill() { if (!ctx || throttle('kill', 35)) return; noise(0.12, 0.16, 1800, 0.7, 'lowpass', 0.2); tone(220 + Math.random() * 60, 0.08, 'triangle', 0.06, 0.5); },
  pick() {
    if (!ctx || throttle('pick', 28)) return; const n = performance.now();
    pickCombo = n - pickT < 400 ? Math.min(pickCombo + 1, 24) : 0; pickT = n;
    tone(1046 * Math.pow(2, (pickCombo % 12) / 24), 0.09, 'sine', 0.07, 1.5);
  },
  coin() { if (!ctx || throttle('coin', 60)) return; tone(1568, 0.06, 'square', 0.04); tone(2093, 0.12, 'square', 0.04, 1, 0.05); },
  levelup() { if (!ctx) return; [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.35, 'triangle', 0.12, 1, i * 0.06)); noise(0.6, 0.05, 6000, 0.5, 'highpass', 1, 0.1); },
  hurt() { if (!ctx || throttle('hurt', 120)) return; tone(160, 0.25, 'sawtooth', 0.18, 0.4); noise(0.2, 0.2, 900, 1, 'lowpass', 0.3); },
  boom() { if (!ctx || throttle('boom', 60)) return; noise(0.45, 0.35, 900, 0.8, 'lowpass', 0.12); tone(90, 0.4, 'sine', 0.3, 0.4); },
  zap() { if (!ctx || throttle('zap', 60)) return; noise(0.12, 0.12, 5000, 4, 'bandpass', 0.3); tone(1400, 0.1, 'sawtooth', 0.05, 0.3); },
  wave() { if (!ctx || throttle('wave', 100)) return; tone(110, 0.5, 'sine', 0.25, 0.5); noise(0.4, 0.12, 600, 1, 'lowpass', 0.3); },
  boss() { if (!ctx) return; tone(55, 2.2, 'sawtooth', 0.25, 0.7); tone(82, 2.2, 'sawtooth', 0.18, 0.66); noise(2, 0.18, 400, 2, 'lowpass', 0.5); },
  warn() { if (!ctx) return; for (let i = 0; i < 3; i++) { tone(440, 0.22, 'square', 0.08, 1, i * 0.35); tone(330, 0.22, 'square', 0.08, 1, i * 0.35 + 0.15); } },
  evolve() { if (!ctx) return; [392, 523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.5, 'sawtooth', 0.06, 1, i * 0.07)); noise(1.2, 0.08, 8000, 0.5, 'highpass', 1, 0.2); },
  click() { if (!ctx) return; tone(1200, 0.05, 'sine', 0.08, 0.6); },
  claim() { if (!ctx) return; [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, 'sine', 0.1, 1, i * 0.05)); },
  chest() { if (!ctx) return; noise(0.5, 0.2, 300, 1, 'lowpass', 4); [523, 784, 1046, 1568, 2093].forEach((f, i) => tone(f, 0.6, 'triangle', 0.09, 1, 0.35 + i * 0.07)); },
  win() { if (!ctx) return; [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.5, 'triangle', 0.12, 1, i * 0.12)); },
  lose() { if (!ctx) return; [392, 349, 311, 262].forEach((f, i) => tone(f, 0.6, 'triangle', 0.1, 1, i * 0.22)); },
};

// ---------- Música procedural (synthwave ambiental) ----------
let musicMode = 'menu', step = 0, nextT = 0, musicTimer = null;
export function setMusic(mode) { musicMode = mode; }
const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function startMusic() {
  nextT = ctx.currentTime + 0.1;
  musicTimer = setInterval(schedule, 50);
}
function mnote(freq, t, dur, type, vol, cutoff = 2000) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
}
function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  const bpm = musicMode === 'boss' ? 132 : musicMode === 'game' ? 118 : 92, sixteenth = 60 / bpm / 4;
  while (nextT < ctx.currentTime + 0.2) {
    const bar = Math.floor(step / 16) % 4, s = step % 16, chord = PROG[bar], t = nextT;
    if (s === 0) chord.forEach((n) => { mnote(mtof(n), t, sixteenth * 16, 'sawtooth', 0.025, 900); mnote(mtof(n + 12) * 1.003, t, sixteenth * 16, 'triangle', 0.02, 1800); });
    if (musicMode !== 'menu' || s % 4 === 0) { if (s % 2 === 0) mnote(mtof(chord[0] - 24), t, sixteenth * 1.8, 'sawtooth', 0.09, 300 + (musicMode === 'boss' ? 400 : 0)); }
    if (musicMode !== 'menu') {
      const arp = [0, 1, 2, 1, 0, 2, 1, 2][s % 8];
      mnote(mtof(chord[arp] + 12), t, sixteenth * 0.9, 'square', 0.022, 2600);
      if (s % 4 === 0) { // bombo
        const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.25);
      }
      if (s % 8 === 4 || (musicMode === 'boss' && s % 2 === 0)) { // caja / hi-hat
        const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = noiseBuf;
        f.type = 'highpass'; f.frequency.value = s % 8 === 4 ? 1500 : 7000; const v = s % 8 === 4 ? 0.12 : 0.03;
        g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (s % 8 === 4 ? 0.18 : 0.04));
        src.connect(f); f.connect(g); g.connect(musicBus); src.start(t, Math.random() * 0.5); src.stop(t + 0.2);
      }
    } else if (s % 4 === 2) {
      mnote(mtof(chord[(step >> 2) % 3] + 24), t, sixteenth * 6, 'sine', 0.025, 3000);
    }
    nextT += sixteenth; step++;
  }
}
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });

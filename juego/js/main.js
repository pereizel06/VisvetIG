// Arranque: pantalla de carga, audio, service worker y menú
import { DEFS } from './icons.js';
import { MenuBG } from './menubg.js';
import { initUI } from './ui.js';
import { initAudio } from './audio.js';
import { S, tickEnergy, save, loginAvailable } from './save.js';
import { nebulaTile, starTile } from './sprites.js';
import { CHAPTERS } from './data.js';

document.body.insertAdjacentHTML('afterbegin', DEFS);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

const splash = document.getElementById('splash'), bar = splash.querySelector('.splash-bar i');
tickEnergy();
const bg = new MenuBG(document.getElementById('bg'));

// precarga de texturas pesadas en pasos para que la barra avance
const steps = [() => { const c = CHAPTERS[S.chapter]; nebulaTile(c.hue, c.hue2); starTile(c.hue); }, () => document.fonts?.ready, () => new Promise((r) => setTimeout(r, 250))];
(async () => {
  for (let i = 0; i < steps.length; i++) { await steps[i](); bar.style.width = ((i + 1) / steps.length * 100) + '%'; }
  bg.start(); splash.classList.add('ready');
  const go = () => {
    initAudio(); splash.classList.add('out'); setTimeout(() => splash.remove(), 700);
    initUI(bg);
    if (loginAvailable()) setTimeout(() => document.getElementById('b-login')?.click(), 700);
  };
  splash.addEventListener('pointerup', go, { once: true });
})();

window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

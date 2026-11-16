// Tablas de contenido del juego
export const GAME_NAME = 'ECLIPSE';
export const SEASON = { name: 'Temporada 1 · Despertar', end: new Date('2027-01-31T23:59:59').getTime(), tiers: 30, xpPerTier: 100, premiumCost: 480 };

export const CHAPTERS = [
  { name: 'Cinturón de Orión', hue: 190, hue2: 260, boss: 'leviathan' },
  { name: 'Nebulosa Carmesí', hue: 345, hue2: 290, boss: 'prism' },
  { name: 'Abismo Esmeralda', hue: 150, hue2: 200, boss: 'hive' },
  { name: 'Corona Solar', hue: 35, hue2: 5, boss: 'leviathan' },
  { name: 'Vacío Índigo', hue: 255, hue2: 300, boss: 'prism' },
  { name: 'Glaciar Cuántico', hue: 200, hue2: 175, boss: 'hive' },
  { name: 'Forja Estelar', hue: 20, hue2: 45, boss: 'leviathan' },
  { name: 'Jardín de Púlsar', hue: 320, hue2: 200, boss: 'prism' },
  { name: 'Horizonte de Sucesos', hue: 275, hue2: 230, boss: 'hive' },
  { name: 'El Eclipse', hue: 48, hue2: 280, boss: 'prism' },
];
export const chapterMult = (i) => ({ hp: Math.pow(1.52, i), dmg: Math.pow(1.2, i), gold: 1 + i * 0.45 });
export const RUN_TIME = 270; // el jefe aparece a los 4:30

export const ENEMIES = {
  swarm:   { name: 'Zángano', r: 11, hp: 11, speed: 64, dmg: 8, xp: 1, shape: 'tri', hueShift: 0 },
  runner:  { name: 'Cazador', r: 9, hp: 8, speed: 112, dmg: 6, xp: 1, shape: 'dart', hueShift: 40 },
  brute:   { name: 'Coloso', r: 21, hp: 75, speed: 40, dmg: 16, xp: 4, shape: 'hex', hueShift: -30, mass: 4 },
  spitter: { name: 'Escupidor', r: 13, hp: 26, speed: 48, dmg: 7, xp: 2, shape: 'diamond', hueShift: 80, ranged: true },
  splitter:{ name: 'Divisor', r: 15, hp: 40, speed: 54, dmg: 10, xp: 2, shape: 'square', hueShift: 140, split: true },
  elite:   { name: 'Centurión', r: 30, hp: 1100, speed: 42, dmg: 22, xp: 30, shape: 'oct', hueShift: 180, mass: 20, elite: true },
};
export const BOSSES = {
  leviathan: { name: 'LEVIATÁN DEL VACÍO', r: 46, hp: 9000, speed: 58, dmg: 28, shape: 'boss1' },
  prism:     { name: 'TITÁN PRISMA', r: 44, hp: 8500, speed: 44, dmg: 25, shape: 'boss2' },
  hive:      { name: 'MADRE COLMENA', r: 50, hp: 10000, speed: 36, dmg: 25, shape: 'boss3' },
};

// Armas automáticas (nivel máximo 5 + evolución)
export const WEAPONS = {
  blaster: { name: 'Bláster de Pulso', icon: 'blaster', evo: 'haste', evoName: 'Andanada Nova',
    desc: ['Dispara pulsos al enemigo más cercano.', '+1 proyectil.', '+35% daño.', '+1 proyectil y atraviesa 1 enemigo.', '+50% daño y -15% recarga.'],
    evoDesc: 'Ráfaga en estrella de 10 pulsos perforantes + fuego continuo.' },
  orbit: { name: 'Hojas Orbitales', icon: 'orbit', evo: 'area', evoName: 'Halo Eterno',
    desc: ['2 hojas de energía giran a tu alrededor.', '+1 hoja.', '+40% daño.', '+1 hoja y mayor radio.', '+1 hoja y +50% daño.'],
    evoDesc: '8 hojas gigantes que emiten pulsos de luz.' },
  arc: { name: 'Arco Voltaico', icon: 'arc', evo: 'crit', evoName: 'Tormenta Iónica',
    desc: ['Un rayo salta entre 3 enemigos.', '+2 saltos.', '+40% daño.', '-25% recarga.', '+2 saltos y +50% daño.'],
    evoDesc: 'Rayos dobles cada 0,6 s que estallan en cada salto.' },
  drone: { name: 'Dron Centinela', icon: 'drone', evo: 'speed', evoName: 'Enjambre Cazador',
    desc: ['Un dron dispara misiles teledirigidos.', '+1 dron.', '+40% daño de explosión.', '-25% recarga.', '+1 dron y explosiones mayores.'],
    evoDesc: '4 drones con misiles de racimo.' },
  shock: { name: 'Onda Sísmica', icon: 'shock', evo: 'armor', evoName: 'Supernova',
    desc: ['Emite una onda que daña y repele.', '+30% radio.', '+50% daño.', '-25% recarga.', '+30% radio y +50% daño.'],
    evoDesc: 'Ondas enormes que dejan un campo ardiente.' },
  meteor: { name: 'Lluvia Estelar', icon: 'meteor', evo: 'power', evoName: 'Juicio del Eclipse',
    desc: ['Invoca 2 meteoritos sobre los enemigos.', '+1 meteorito.', '+40% daño y radio.', '+2 meteoritos.', '-30% recarga y +50% daño.'],
    evoDesc: '8 meteoritos solares por oleada.' },
};
export const PASSIVES = {
  power:    { name: 'Núcleo de Poder', icon: 'power', desc: '+12% de daño.' },
  haste:    { name: 'Sobrecarga', icon: 'haste', desc: '-8% de recarga de armas.' },
  magnet:   { name: 'Imán Gravitatorio', icon: 'magnet', desc: '+30% de alcance de recogida.' },
  armor:    { name: 'Blindaje', icon: 'armor', desc: '-3 de daño recibido.' },
  speed:    { name: 'Propulsores', icon: 'speed', desc: '+9% de velocidad.' },
  area:     { name: 'Amplificador', icon: 'area', desc: '+12% de área de efecto.' },
  crit:     { name: 'Lente Crítica', icon: 'crit', desc: '+6% de probabilidad de crítico.' },
  vitality: { name: 'Vitalidad', icon: 'vitality', desc: '+15% de vida máxima y regeneración.' },
};

export const PILOTS = [
  { id: 'vex', name: 'VEX', title: 'Centinela', hue: 190, weapon: 'blaster', perk: '+10% de daño', perkFx: { dmg: 0.1 }, cost: 0 },
  { id: 'lyra', name: 'LYRA', title: 'Guardiana', hue: 150, weapon: 'orbit', perk: '+25% de vida', perkFx: { hp: 0.25 }, cost: 600 },
  { id: 'kade', name: 'KADE', title: 'Tempestad', hue: 270, weapon: 'arc', perk: '+10% de crítico', perkFx: { crit: 0.1 }, cost: 900 },
  { id: 'nyx', name: 'NYX', title: 'Eclipse', hue: 42, weapon: 'meteor', perk: '+15% daño, +10% velocidad', perkFx: { dmg: 0.15, speed: 0.1 }, cost: -1 },
];

// Mejoras permanentes con oro
export const UPGRADES = [
  { id: 'atk', name: 'Ataque', icon: 'sword', per: 6, unit: '%', desc: 'daño' },
  { id: 'hp', name: 'Vida', icon: 'heart', per: 12, unit: '', desc: 'vida máx.' },
  { id: 'def', name: 'Defensa', icon: 'shield', per: 1, unit: '', desc: 'reducción' },
  { id: 'spd', name: 'Agilidad', icon: 'speed', per: 2, unit: '%', desc: 'velocidad' },
  { id: 'mag', name: 'Atracción', icon: 'magnet', per: 5, unit: '%', desc: 'recogida' },
  { id: 'luck', name: 'Precisión', icon: 'crit', per: 1, unit: '%', desc: 'crítico' },
];
export const upgradeCost = (lvl) => Math.floor(120 * Math.pow(1.17, lvl) + lvl * 40);

// Equipo
export const RARITIES = [
  { name: 'Común', color: '#a9b4c6', mult: 1, cap: 10 },
  { name: 'Raro', color: '#4aa8ff', mult: 2, cap: 20 },
  { name: 'Épico', color: '#b45cff', mult: 3.6, cap: 30 },
  { name: 'Legendario', color: '#ffb72e', mult: 6.2, cap: 40 },
  { name: 'Mítico', color: '#ff4d6a', mult: 10.5, cap: 50 },
];
export const SLOTS = {
  core:   { name: 'Núcleo', icon: 'blaster', stat: 'atk', base: 4, unit: '% daño', names: ['Núcleo de Plasma', 'Núcleo Iónico', 'Corazón Estelar', 'Núcleo Solar', 'Singularidad'] },
  armor:  { name: 'Coraza', icon: 'armor', stat: 'hp', base: 15, unit: ' vida', names: ['Placa de Titanio', 'Coraza Prismática', 'Égida del Vacío', 'Armadura Nova', 'Manto del Eclipse'] },
  ring:   { name: 'Anillo', icon: 'crit', stat: 'crit', base: 1.2, unit: '% crítico', names: ['Aro de Cuarzo', 'Anillo Rúnico', 'Sello Astral', 'Anillo del Cometa', 'Ojo del Cosmos'] },
  module: { name: 'Módulo', icon: 'speed', stat: 'spd', base: 1.5, unit: '% velocidad', names: ['Módulo de Impulso', 'Turbina Cuántica', 'Motor de Fase', 'Propulsor Nebular', 'Motor Infinito'] },
};
export const gearStat = (it) => SLOTS[it.slot].base * RARITIES[it.rarity].mult * (1 + (it.lvl - 1) * 0.12);
export const gearUpCost = (it) => Math.floor(80 * Math.pow(1.13, it.lvl) * (1 + it.rarity * 0.5));

export const CHESTS = {
  basic: { name: 'Cofre Estelar', cost: { gold: 1500 }, odds: [0.70, 0.25, 0.05, 0, 0], color: '#4aa8ff' },
  epic:  { name: 'Cofre Épico', cost: { gems: 150 }, odds: [0, 0.55, 0.37, 0.075, 0.005], color: '#b45cff' },
  legend:{ name: 'Cofre Legendario', cost: { gems: 450 }, odds: [0, 0, 0.62, 0.34, 0.04], color: '#ffb72e' },
};

export const DAILY_LOGIN = [
  { gold: 800 }, { gems: 50 }, { energy: 20 }, { gold: 2000 }, { gems: 100 }, { chest: 'epic' }, { gems: 250, chest: 'epic' },
];

export const MISSIONS = [
  { id: 'kills', text: 'Elimina 400 enemigos', goal: 400, pts: 30, gems: 20 },
  { id: 'runs', text: 'Juega 2 partidas', goal: 2, pts: 20, gems: 15 },
  { id: 'boss', text: 'Derrota a un jefe', goal: 1, pts: 30, gems: 30 },
  { id: 'upgrade', text: 'Mejora el arsenal 2 veces', goal: 2, pts: 20, gems: 15 },
  { id: 'chest', text: 'Abre 1 cofre', goal: 1, pts: 20, gems: 15 },
  { id: 'patrol', text: 'Reclama la patrulla', goal: 1, pts: 20, gems: 10 },
  { id: 'evolve', text: 'Evoluciona un arma', goal: 1, pts: 30, gems: 25 },
];
export const ACTIVITY = [
  { pts: 40, reward: { gold: 1500 } }, { pts: 80, reward: { gems: 60 } }, { pts: 120, reward: { passXp: 150 } }, { pts: 170, reward: { chest: 'epic' } },
];

// Pase de batalla: recompensas por nivel (gratis / premium)
export const PASS = (() => {
  const free = [], prem = [];
  for (let i = 1; i <= 30; i++) {
    let f, p;
    if (i % 10 === 0) { f = { chest: 'epic' }; p = i === 30 ? { pilot: 'nyx' } : { chest: 'legend' }; }
    else if (i % 5 === 0) { f = { gems: 60 }; p = { gems: 200 }; }
    else if (i % 3 === 0) { f = { energy: 15 }; p = { chest: 'epic' }; }
    else if (i % 2 === 0) { f = { gold: 1000 + i * 100 }; p = { gems: 80 }; }
    else { f = { gold: 600 + i * 80 }; p = { gold: 3000 + i * 200 }; }
    free.push(f); prem.push(p);
  }
  return { free, prem };
})();

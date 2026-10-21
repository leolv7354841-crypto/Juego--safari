// Constantes de equilibrio del juego. Todo lo ajustable vive aquí.

export const WORLD_SIZE = 3800;
export const CHUNK = 512;
export const ROAD_CENTERS = [300, 1100, 1900, 2700, 3500];
export const ROAD_HALF = 110;
export const SIDEWALK = 44;
export const NAV_CELL = 40;
export const MAX_ALIVE = 600;

export const PLAYER_BASE = {
  radius: 14,
  maxHp: 100,
  walkSpeed: 118,
  runMult: 1.75,
  maxStamina: 100,
  staminaDrain: 30,
  staminaRegen: 20,
  regenDelay: 0.7,
  mass: 4,
};

// rate = disparos por segundo, range = distancia máxima en px del mundo.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Pistola', damage: 24, rate: 3.4, mag: 12,
    reserve: Infinity, reserveMax: Infinity, pickup: 0, reload: 1.05,
    spread: 0.035, bloom: 0.05, pellets: 1, speed: 950, range: 560,
    knock: 60, shake: 0.12, pierce: 0, len: 11,
  },
  smg: {
    id: 'smg', name: 'Subfusil', damage: 14, rate: 11, mag: 32,
    reserve: 128, reserveMax: Infinity, pickup: 64, reload: 1.5,
    spread: 0.09, bloom: 0.022, pellets: 1, speed: 1000, range: 520,
    knock: 30, shake: 0.03, pierce: 0, len: 15,
    price: 120, ammoPrice: 6, desc: 'Ráfagas rápidas para contener a la horda.',
  },
  shotgun: {
    id: 'shotgun', name: 'Escopeta', damage: 17, rate: 1.25, mag: 6,
    reserve: 24, reserveMax: Infinity, pickup: 12, reload: 1.9,
    spread: 0.3, bloom: 0.1, pellets: 8, speed: 820, range: 330,
    knock: 130, shake: 0.3, pierce: 0, len: 20,
    price: 160, ammoPrice: 8, desc: '8 perdigones a corta distancia que derriban grupos.',
  },
  rifle: {
    id: 'rifle', name: 'Rifle', damage: 72, rate: 1.9, mag: 10,
    reserve: 40, reserveMax: Infinity, pickup: 16, reload: 1.7,
    spread: 0.008, bloom: 0.06, pellets: 1, speed: 1500, range: 950,
    knock: 110, shake: 0.22, pierce: 2, len: 24,
    price: 220, ammoPrice: 8, desc: 'Disparo potente y lejano que atraviesa 2 enemigos.',
  },
  ar: {
    id: 'ar', name: 'Fusil de asalto', damage: 30, rate: 8, mag: 30,
    reserve: 90, reserveMax: Infinity, pickup: 30, reload: 1.6,
    spread: 0.05, bloom: 0.015, pellets: 1, speed: 1250, range: 700,
    knock: 50, shake: 0.04, pierce: 1, len: 20,
    price: 400, ammoPrice: 10, desc: 'Automático, preciso y perforante. El todoterreno.',
  },
  autoshotgun: {
    id: 'autoshotgun', name: 'Escopeta automática', damage: 18, rate: 3.5, mag: 12,
    reserve: 36, reserveMax: Infinity, pickup: 12, reload: 2.2,
    spread: 0.32, bloom: 0.06, pellets: 9, speed: 850, range: 340,
    knock: 120, shake: 0.28, pierce: 0, len: 22,
    price: 600, ammoPrice: 15, desc: '9 perdigones en ráfaga continua. Barre hordas de cerca.',
  },
  sniper: {
    id: 'sniper', name: 'Francotirador', damage: 240, rate: 1.1, mag: 5,
    reserve: 20, reserveMax: Infinity, pickup: 5, reload: 2.4,
    spread: 0.003, bloom: 0.08, pellets: 1, speed: 2000, range: 1400,
    knock: 220, shake: 0.35, pierce: 6, len: 30,
    price: 750, ammoPrice: 15, desc: 'Daño enorme: cada bala atraviesa hasta 6 zombis en fila.',
  },
  lmg: {
    id: 'lmg', name: 'Ametralladora', damage: 26, rate: 13, mag: 100,
    reserve: 200, reserveMax: Infinity, pickup: 100, reload: 3.2,
    spread: 0.08, bloom: 0.012, pellets: 1, speed: 1200, range: 650,
    knock: 45, shake: 0.015, pierce: 1, len: 26,
    price: 900, ammoPrice: 35, desc: 'Cargador de 100 balas a ritmo infernal. La reina del caos.',
  },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'ar', 'autoshotgun', 'sniper', 'lmg'];
// cajas de armas (las básicas); las mejores se compran
export const CRATE_WEAPONS = ['smg', 'shotgun', 'rifle'];

export const ZOMBIES = {
  normal: {
    hp: 42, speed: [30, 44], radius: 13, damage: 8, attackRate: 0.9,
    xp: 1, mass: 1, reach: 7, frames: 6, turn: 4,
  },
  // Policía SWAT: como un normal, con escudo antidisturbios; aguanta 8 veces más.
  swat: {
    hp: 42 * 8, speed: [28, 38], radius: 14, damage: 10, attackRate: 0.9,
    xp: 10, mass: 2.5, reach: 8, frames: 6, turn: 3.5,
  },
  sprinter: {
    hp: 26, speed: [88, 104], radius: 11, damage: 6, attackRate: 1.3,
    xp: 2, mass: 0.8, reach: 6, frames: 6, turn: 7,
  },
  // Super blindado: un gordo con armadura militar completa. Desde la oleada 11; 50 veces la vida de un normal.
  heavy: {
    hp: 42 * 50, speed: [19, 25], radius: 22, damage: 18, attackRate: 0.7,
    xp: 25, mass: 6, reach: 9, frames: 6, turn: 2.5,
  },
  fat: {
    hp: 130, speed: [21, 27], radius: 21, damage: 14, attackRate: 0.75,
    xp: 4, mass: 4, reach: 8, frames: 6, turn: 3,
  },
  giant: {
    hp: 1500, speed: [13, 16], radius: 42, damage: 32, attackRate: 0.45,
    xp: 30, mass: 40, reach: 14, frames: 8, turn: 1.4, blocksBullets: true,
  },
};

// Con hordas 5 veces mayores la experiencia necesaria sube igual para no saturar de mejoras.
export const xpForLevel = (lvl) => Math.floor((6 + lvl * 4 + Math.pow(lvl, 1.6) * 1.5) * 7);

// Dinero por cada zombi eliminado.
export const BOUNTY = { normal: 1, sprinter: 3, swat: 10, fat: 5, heavy: 25, giant: 10 };

// Tienda entre oleadas. w/h en px del mundo; rotates = se coloca perpendicular a la mira.
export const SHOP = {
  wood: {
    name: 'Bloque de madera', desc: 'Barricada básica. Disparas por encima de ella.',
    price: 10, hp: 160, w: 40, h: 40,
  },
  metal: {
    name: 'Bloque de metal', desc: 'Placa de acero: aguanta 3 veces más que la madera.',
    price: 30, hp: 520, w: 40, h: 40,
  },
  sandbag: {
    name: 'Sacos terreros', desc: 'Muro ancho y barato. Ideal para cerrar calles rápido.',
    price: 25, hp: 450, w: 80, h: 24, rotates: true,
  },
  fence: {
    name: 'Valla de metal reforzado', desc: 'Muro ancho muy resistente. Frena a los gordos un buen rato.',
    price: 70, hp: 1400, w: 80, h: 24, rotates: true,
  },
  concrete: {
    name: 'Muro de concreto', desc: 'La defensa más dura: aguanta más del doble que la valla.',
    price: 150, hp: 3200, w: 80, h: 28, rotates: true,
  },
  turret: {
    name: 'Torreta automática', desc: 'Dispara sola al zombi más cercano. Ponla detrás de tus muros.',
    price: 350, hp: 700, w: 40, h: 40, turret: true,
  },
  wire: {
    name: 'Alambre de púas', desc: 'No bloquea el paso: frena mucho y hiere a los zombis que lo cruzan.',
    price: 20, hp: 70, w: 80, h: 40, rotates: true, ground: true,
  },
  spikes: {
    name: 'Trampa de pinchos', desc: 'Placa de clavos: frena y hiere mucho más que el alambre.',
    price: 60, hp: 300, w: 40, h: 40, ground: true,
  },
  mine: {
    name: 'Mina terrestre', desc: 'Explota cuando un zombi la pisa y arrasa todo alrededor.',
    price: 45, hp: 1, w: 24, h: 24, ground: true,
  },
  grenade: {
    name: 'Granada', desc: 'Explosión en área que arrasa grupos enteros. Cara, úsala bien.',
    price: 90, consumable: true,
  },
};
export const BUILD_ORDER = ['wood', 'sandbag', 'metal', 'fence', 'concrete', 'turret', 'wire', 'spikes', 'mine'];
export const SHOP_ORDER = [...BUILD_ORDER, 'grenade'];
// Vender un arma devuelve esta fracción de su precio.
export const SELL_RATE = 0.5;

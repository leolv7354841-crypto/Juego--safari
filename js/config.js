// Constantes de equilibrio del juego. Todo lo ajustable vive aquí.

export const WORLD_SIZE = 3800;
export const CHUNK = 512;
export const ROAD_CENTERS = [300, 1100, 1900, 2700, 3500];
export const ROAD_HALF = 110;
export const SIDEWALK = 44;
export const NAV_CELL = 40;
export const MAX_ALIVE = 280;

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
    reserve: 128, reserveMax: 320, pickup: 64, reload: 1.5,
    spread: 0.09, bloom: 0.022, pellets: 1, speed: 1000, range: 520,
    knock: 30, shake: 0.07, pierce: 0, len: 15,
  },
  shotgun: {
    id: 'shotgun', name: 'Escopeta', damage: 17, rate: 1.25, mag: 6,
    reserve: 24, reserveMax: 60, pickup: 12, reload: 1.9,
    spread: 0.3, bloom: 0.1, pellets: 8, speed: 820, range: 330,
    knock: 130, shake: 0.3, pierce: 0, len: 20,
  },
  rifle: {
    id: 'rifle', name: 'Rifle', damage: 72, rate: 1.9, mag: 10,
    reserve: 40, reserveMax: 100, pickup: 16, reload: 1.7,
    spread: 0.008, bloom: 0.06, pellets: 1, speed: 1500, range: 950,
    knock: 110, shake: 0.22, pierce: 2, len: 24,
  },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle'];

export const ZOMBIES = {
  normal: {
    hp: 42, speed: [30, 44], radius: 13, damage: 8, attackRate: 0.9,
    xp: 1, mass: 1, reach: 7, frames: 6, turn: 4,
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

export const xpForLevel = (lvl) => Math.floor(6 + lvl * 4 + Math.pow(lvl, 1.6) * 1.5);

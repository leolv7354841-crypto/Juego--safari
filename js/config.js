// Constantes de equilibrio del juego. Todo lo ajustable vive aquí.

export const WORLD_SIZE = 3800;
export const CHUNK = 512;
export const ROAD_CENTERS = [300, 1100, 1900, 2700, 3500];
export const ROAD_HALF = 110;
export const SIDEWALK = 44;
export const NAV_CELL = 40;
export const MAX_ALIVE = 600;
// en cooperativo hay menos zombis vivos a la vez
export const COOP_MAX_ALIVE = 220;

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
  // Lanza cohetes (ver ROCKET): explota al impactar; tarda 5 s en recargar.
  bazooka: {
    id: 'bazooka', name: 'Bazuca antitanque', damage: 0, rate: 1, mag: 1,
    reserve: 4, reserveMax: Infinity, pickup: 1, reload: 5,
    spread: 0.01, bloom: 0, pellets: 1, speed: 640, range: 950,
    knock: 260, shake: 0.5, pierce: 0, len: 30, rocket: true,
    price: 1400, ammoPrice: 40, desc: 'Cohete con el doble de explosión que una granada. Revienta gordos y blindados. Recarga en 5 s.',
  },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'ar', 'autoshotgun', 'sniper', 'lmg', 'bazooka'];

// Cohete de la bazuca. La granada tiene radio 140 y 330 de daño: el cohete abarca el doble de área.
// Contra un gordo se queda clavado en su panza (stick s), brilla en verde (glow s) y estalla más fuerte;
// contra un super blindado se incrusta en la placa de la panza y lo revienta de un solo tiro.
export const ROCKET = { radius: 200, power: 660, fatStick: 1, fatGlow: 0.6, fatRadius: 250, fatPower: 950, heavyStick: 0.35 };
// cajas de armas (las básicas); las mejores se compran
export const CRATE_WEAPONS = ['smg', 'shotgun', 'rifle'];

export const ZOMBIES = {
  // velocidad base x2 respecto a versiones anteriores ([30, 44] → [60, 88]); la animación
  // de pasos avanza con la distancia recorrida, así que se acelera sola y no patinan.
  normal: {
    hp: 42, speed: [60, 88], radius: 13, damage: 8, attackRate: 0.9,
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
  // Da super golpes: 30 de daño, te avienta y destroza estructuras (blockDmg por golpe).
  heavy: {
    hp: 42 * 50, speed: [19, 25], radius: 22, damage: 30, attackRate: 0.7,
    xp: 25, mass: 6, reach: 9, frames: 6, turn: 2.5, blockDmg: 260, punch: 1000,
  },
  // Toro: zombi musculoso que embiste al verte (ver BULL).
  bull: {
    hp: 42 * 7, speed: [52, 62], radius: 17, damage: 14, attackRate: 0.8,
    xp: 8, mass: 5, reach: 8, frames: 6, turn: 3.5,
  },
  fat: {
    hp: 130, speed: [21, 27], radius: 21, damage: 14, attackRate: 0.75,
    xp: 4, mass: 4, reach: 8, frames: 6, turn: 3,
  },
  // Zombi dorado: poco común, huye de ti y desaparece si no lo matas a tiempo.
  golden: {
    hp: 42 * 3, speed: [74, 86], radius: 13, damage: 6, attackRate: 0.9,
    xp: 15, mass: 1, reach: 7, frames: 6, turn: 6,
  },
  giant: {
    hp: 1500, speed: [13, 16], radius: 42, damage: 32, attackRate: 0.45,
    xp: 30, mass: 40, reach: 14, frames: 8, turn: 1.4, blocksBullets: true,
  },
};

// Curva de experiencia: barata al principio (mejoras seguidas en los primeros minutos)
// y cuadrática después, sin saltos bruscos entre niveles.
//   nv1 51 · nv2 89 · nv3 139 · nv5 275 · nv10 825 · nv20 2825
export const xpForLevel = (lvl) => Math.round(25 + 20 * lvl + 6 * lvl * lvl);

// Dinero por cada zombi eliminado.
export const BOUNTY = { normal: 1, sprinter: 3, swat: 10, fat: 5, heavy: 25, bull: 15, giant: 10, golden: 0 };

// Embestida del toro: te ve, escarba y carga en línea recta.
// hit: daño al jugador · long/short: daño de la embestida larga y corta contra estructuras.
export const BULL = { sight: 430, windup: 0.75, speed: 470, maxTime: 1.25, hit: 40, throw: 1500, long: 250, short: 40, cooldown: 2.2 };

// Zombis normales heridos: se desangran (vida por segundo) y avanzan arrastrándose.
export const WOUND = { bleed: 3, pace: 0.5 };

// Molotov: charco de fuego y quemadura sobre los zombis que lo pisan.
export const MOLOTOV = { radius: 82, life: 6.5, burn: 4, dps: 24 };

// Zombi dorado: recompensa al matarlo y cuánto vive antes de desaparecer.
export const GOLDEN = { rewardMin: 100, rewardMax: 250, life: 26, warnAt: 7, firstAfter: 12, every: [35, 65] };

// Dinero que pierdes con cada golpe de zombi (siempre más de $15).
export const MONEY_LOSS = { min: 16, max: 40 };

// Probabilidad de que cada tipo suelte munición o botiquín al morir.
export const DROPS = {
  normal: { ammo: 0.06, med: 0.02 },
  sprinter: { ammo: 0.06, med: 0.02 },
  swat: { ammo: 0.18, med: 0.06 },
  fat: { ammo: 0.3, med: 0.1 },
  heavy: { ammo: 0.6, med: 0.25 },
  bull: { ammo: 0.4, med: 0.15 },
  golden: { ammo: 0.5, med: 0.5 },
};

// Robot de combate (tienda): vida, tamaño (el doble de un gordo), precio y reparación.
export const ROBOT = { hp: 10000, radius: 42, mass: 40, price: 3000, repairPerHp: 0.1, speed: 0.85, gunScale: 1.7 };

// Clasificación mundial (Firebase Realtime Database, sin librerías: API REST).
// Pega aquí la URL de tu base de datos, p. ej. 'https://mi-juego-default-rtdb.firebaseio.com'.
// Vacía = sólo clasificación de este dispositivo (y la de Claude si se abre como Artifact).
export const ONLINE = { url: 'https://dead-zone-73dcc-default-rtdb.firebaseio.com' };

// Multijugador en línea con servidor autoritativo (carpeta server/).
// server: dirección del servidor (wss://…). Vacía: en localhost se usa ws://<equipo>:2567.
// También se puede cambiar al abrir el juego con ?servidor=wss://…
export const NET = {
  server: 'wss://servidor.yeyo.games', // máquina de Vultr en Ciudad de México (deploy/README.md)
  maxPlayers: 4, // cupo de sala (el servidor manda: MAX_PLAYERS)
  tickHz: 60, // pasos de simulación por segundo (servidor y predicción)
  snapHz: 20, // fotos del estado por segundo hacia cada jugador
  interpDelay: 110, // ms de retraso para dibujar a los demás entre dos fotos
  maxExtrapolate: 100, // ms máximos que se adelanta algo sin foto nueva
  pendingMax: 120, // entradas sin confirmar que guarda el cliente (2 s)
  snapDist: 150, // corrección mayor que esto (px): se salta directo, sin suavizar
  smooth: 12, // rapidez con que se borra una corrección pequeña
  reconnectSeconds: 20,
  view: 1000, // mitad del cuadro alrededor de cada jugador que se le manda
  crowd: [0.5, 0.15], // zombis por oleada: 0,5 del solitario + 0,15 por cada jugador extra
};

// Umbrales de la música dinámica (peligro = suma de cercanía de zombis).
export const MUSIC = { threatOn: 4, threatOff: 2, hordeOn: 14, hordeOff: 8, minHold: 4 };

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
  molotov: {
    name: 'Molotov', desc: 'Botella incendiaria: deja un charco de fuego que quema a todo zombi que lo pisa.',
    price: 60, consumable: true,
  },
};
export const BUILD_ORDER = ['wood', 'sandbag', 'metal', 'fence', 'concrete', 'turret', 'wire', 'spikes', 'mine'];
export const THROWABLES = ['grenade', 'molotov'];
export const SHOP_ORDER = [...BUILD_ORDER, ...THROWABLES];
// Vender un arma devuelve esta fracción de su precio.
export const SELL_RATE = 0.5;

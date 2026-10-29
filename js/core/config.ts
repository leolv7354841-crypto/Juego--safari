// Constantes de equilibrio del juego. Todo lo ajustable vive aquí.

export const WORLD_SIZE = 3800;
export const CHUNK = 512;
export const ROAD_CENTERS = [300, 1100, 1900, 2700, 3500];
export const ROAD_HALF = 110;
export const SIDEWALK = 44;
export const NAV_CELL = 40;
// tope de zombis vivos a la vez en cualquier modo (lo que no cabe espera en la cola de la oleada)
export const MAX_ALIVE = 1000;

export const PLAYER_BASE = {
  radius: 14,
  maxHp: 100,
  // velocidad al caminar en múltiplos de lo que camina un zombi normal en la primera oleada
  // (ZOMBIE_SPEED × WAVES.speed): 1,25 → unos 166 px/s. Corriendo, por runMult.
  walk: 1.25,
  runMult: 1.75,
  maxStamina: 100,
  staminaDrain: 30,
  staminaRegen: 20,
  regenDelay: 0.7,
  mass: 4,
};

// Temblor de cámara. shake: px máximos con el temblor al tope (la mitad del original, 16).
// Un temblor con lugar (explosión, cornada…) es completo hasta near px de la cámara y se apaga en far.
// stack: cuánto suma un temblor sobre otro (la fuente más fuerte manda; no se acumulan hasta el tope).
export const CAMERA = { shake: 8, near: 200, far: 1000, stack: 0.25 };

// Arma con la que se empieza: balas infinitas, no se vende ni está en la tienda.
export const START_WEAPON = 'smg';

// rate = disparos por segundo, range = distancia máxima en px del mundo.
// La pistola ya no se usa (el arma inicial es START_WEAPON); se deja por partidas guardadas viejas.
export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'Pistola',
    damage: 24,
    rate: 3.4,
    mag: 12,
    reserve: Infinity,
    reserveMax: Infinity,
    pickup: 0,
    reload: 1.05,
    spread: 0.035,
    bloom: 0.05,
    pellets: 1,
    speed: 950,
    range: 560,
    knock: 60,
    shake: 0.12,
    pierce: 0,
    len: 11,
  },
  smg: {
    id: 'smg',
    name: 'Subfusil',
    damage: 14,
    rate: 11,
    mag: 32,
    reserve: Infinity,
    reserveMax: Infinity,
    pickup: 0,
    reload: 1.5,
    spread: 0.09,
    bloom: 0.022,
    pellets: 1,
    speed: 1000,
    range: 520,
    knock: 30,
    shake: 0.03,
    pierce: 0,
    len: 15,
    desc: 'Ráfagas rápidas para contener a la horda.',
  },
  // Armas de la tienda: el precio sube con su poder (daño por segundo contando recargas, a cuántos
  // atraviesa y el área), en una escalera que acompaña el dinero de las oleadas: la escopeta tras la
  // primera, la bazuca hacia la sexta. La munición sigue costando por cargador lo que cada una pedía
  // por cada 1000 de daño.
  shotgun: {
    id: 'shotgun',
    name: 'Escopeta',
    damage: 30,
    rate: 1.8,
    mag: 6,
    reserve: 24,
    reserveMax: Infinity,
    pickup: 12,
    reload: 1.8,
    spread: 0.3,
    bloom: 0.1,
    pellets: 8,
    speed: 820,
    range: 340,
    knock: 140,
    shake: 0.3,
    pierce: 0,
    len: 20,
    price: 500,
    ammoPrice: 12,
    desc: '8 perdigones de golpe: derriba grupos y los empuja lejos.',
  },
  rifle: {
    id: 'rifle',
    name: 'Rifle',
    damage: 110,
    rate: 2,
    mag: 10,
    reserve: 40,
    reserveMax: Infinity,
    pickup: 16,
    reload: 1.7,
    spread: 0.008,
    bloom: 0.06,
    pellets: 1,
    speed: 1500,
    range: 950,
    knock: 110,
    shake: 0.22,
    pierce: 2,
    len: 24,
    price: 1200,
    ammoPrice: 18,
    desc: 'Disparo potente y lejano que atraviesa 2 enemigos.',
  },
  ar: {
    id: 'ar',
    name: 'Fusil de asalto',
    damage: 30,
    rate: 9,
    mag: 30,
    reserve: 90,
    reserveMax: Infinity,
    pickup: 30,
    reload: 1.6,
    spread: 0.05,
    bloom: 0.015,
    pellets: 1,
    speed: 1250,
    range: 700,
    knock: 50,
    shake: 0.04,
    pierce: 1,
    len: 20,
    price: 800,
    ammoPrice: 12,
    desc: 'Automático, preciso y perforante. El todoterreno.',
  },
  autoshotgun: {
    id: 'autoshotgun',
    name: 'Escopeta automática',
    damage: 22,
    rate: 3.2,
    mag: 12,
    reserve: 36,
    reserveMax: Infinity,
    pickup: 12,
    reload: 2.2,
    spread: 0.32,
    bloom: 0.06,
    pellets: 9,
    speed: 850,
    range: 340,
    knock: 110,
    shake: 0.28,
    pierce: 0,
    len: 22,
    price: 2000,
    ammoPrice: 19,
    desc: '9 perdigones fuertes en ráfaga continua. Barre hordas de cerca.',
  },
  sniper: {
    id: 'sniper',
    name: 'Francotirador',
    damage: 300,
    rate: 0.9,
    mag: 5,
    reserve: 20,
    reserveMax: Infinity,
    pickup: 5,
    reload: 2.4,
    spread: 0.003,
    bloom: 0.08,
    pellets: 1,
    speed: 2000,
    range: 1400,
    knock: 220,
    shake: 0.35,
    pierce: 6,
    len: 30,
    price: 4500,
    ammoPrice: 30,
    desc: 'Lento pero brutal: 300 de daño por bala y atraviesa hasta 6 zombis en fila.',
  },
  lmg: {
    id: 'lmg',
    name: 'Ametralladora',
    damage: 30,
    rate: 12,
    mag: 100,
    reserve: 200,
    reserveMax: Infinity,
    pickup: 100,
    reload: 3.2,
    spread: 0.08,
    bloom: 0.012,
    pellets: 1,
    speed: 1200,
    range: 650,
    knock: 45,
    shake: 0.015,
    pierce: 2,
    len: 26,
    price: 3000,
    ammoPrice: 41,
    desc: 'Cargador de 100 balas que atraviesan 2 zombis: fuego sin pausa, recarga lenta.',
  },
  // Lanza cohetes (ver ROCKET): explota al impactar; tarda 4 s en recargar.
  bazooka: {
    id: 'bazooka',
    name: 'Bazuca antitanque',
    damage: 0,
    rate: 1,
    mag: 1,
    reserve: 4,
    reserveMax: Infinity,
    pickup: 1,
    reload: 4,
    spread: 0.01,
    bloom: 0,
    pellets: 1,
    speed: 640,
    range: 950,
    knock: 260,
    shake: 0.5,
    pierce: 0,
    len: 30,
    rocket: true,
    price: 6000,
    ammoPrice: 30,
    desc: 'Cohete con el doble de explosión que una granada. Revienta gordos y blindados. Recarga en 4 s.',
  },
  // Cañón doble de la torreta pesada (SHOP.heavy): no se compra ni se lleva, se usa montado.
  // Sus balas salen de HEAVY.ammo (se compran en la tienda) y son explosivas (blast): estallan en
  // el primer zombi o pared que tocan con una microexplosión (HEAVY.blastR, HEAVY.blastPower).
  heavy: {
    id: 'heavy',
    name: 'Torreta pesada',
    damage: 60,
    rate: 9,
    mag: 0,
    reserve: 0,
    reserveMax: 0,
    pickup: 0,
    reload: 0,
    spread: 0.035,
    bloom: 0.01,
    pellets: 1,
    speed: 1600,
    range: 1000,
    knock: 90,
    shake: 0.06,
    pierce: 0,
    blast: true,
    len: 30,
  },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'ar', 'autoshotgun', 'sniper', 'lmg', 'bazooka'];

// Cohete de la bazuca. La granada tiene radio 140 y 330 de daño: el cohete abarca el doble de área.
// Contra un gordo se queda clavado en su panza (stick s), brilla en verde (glow s) y estalla más fuerte;
// contra un super blindado se incrusta en la placa de la panza y lo revienta de un solo tiro.
export const ROCKET = {
  radius: 200,
  power: 660,
  fatStick: 1,
  fatGlow: 0.6,
  fatRadius: 250,
  fatPower: 950,
  heavyStick: 0.35,
};
// Habilidad de clase (se elige al empezar cada partida). cooldown en s; cada mejora la baja
// cdStep (x0,85) hasta minCooldown.
// bomber: misil balístico que cae donde apuntas tras fall s (3 veces el radio y 2 veces el
// daño del cohete); berserker: 3 ametralladoras vacían 3 cargadores en time s, con su propio
// daño y perforación (no cambia si se ajusta la ametralladora de la tienda);
// booster: inmune y speed veces más rápido durante time s.
export const ABILITY = {
  cooldown: 60,
  minCooldown: 20,
  cdStep: 0.85,
  bomber: { radius: ROCKET.radius * 3, power: ROCKET.power * 2, fall: 1.4, range: 700 },
  berserker: { time: 3, mags: 3, guns: 3, weapon: 'lmg', damage: 22, pierce: 1 },
  booster: { time: 2, speed: 3 },
};
export const CLASS_ORDER = ['bomber', 'berserker', 'booster'];
// cajas de armas (las básicas); las mejores se compran
export const CRATE_WEAPONS = ['shotgun', 'rifle'];

// Unidad de velocidad: la del zombi normal en px/s (al azar entre los dos; 1,5 veces la de antes,
// [60, 88]). En ZOMBIES, speed es un múltiplo de esta unidad y nunca menos de 1: ningún tipo es
// más lento que un normal. La animación de pasos avanza con la distancia, así que no patinan.
export const ZOMBIE_SPEED = [90, 132];

export const ZOMBIES = {
  normal: {
    hp: 42,
    speed: 1,
    radius: 13,
    damage: 8,
    attackRate: 0.9,
    xp: 2,
    mass: 1,
    reach: 7,
    frames: 6,
    turn: 4,
  },
  // Policía SWAT: como un normal (misma velocidad), con escudo antidisturbios; aguanta 8 veces más.
  swat: {
    hp: 42 * 8,
    speed: 1,
    radius: 14,
    damage: 10,
    attackRate: 0.9,
    xp: 20,
    mass: 2.5,
    reach: 8,
    frames: 6,
    turn: 3.5,
  },
  sprinter: {
    hp: 26,
    speed: 1.3,
    radius: 11,
    damage: 6,
    attackRate: 1.3,
    xp: 4,
    mass: 0.8,
    reach: 6,
    frames: 6,
    turn: 7,
  },
  // Super blindado: un gordo con armadura militar completa. Desde la oleada 11; 50 veces la vida de un normal.
  // Da super golpes: 30 de daño, te avienta y destroza estructuras (blockDmg por golpe).
  heavy: {
    hp: 42 * 50,
    speed: 1,
    radius: 22,
    damage: 30,
    attackRate: 0.7,
    xp: 50,
    mass: 6,
    reach: 9,
    frames: 6,
    turn: 2.5,
    blockDmg: 260,
    punch: 1000,
  },
  // Toro: zombi musculoso que embiste al verte (ver BULL).
  bull: {
    hp: 42 * 7,
    speed: 1,
    radius: 17,
    damage: 14,
    attackRate: 0.8,
    xp: 16,
    mass: 5,
    reach: 8,
    frames: 6,
    turn: 3.5,
  },
  fat: {
    hp: 130,
    speed: 1,
    radius: 21,
    damage: 14,
    attackRate: 0.75,
    xp: 8,
    mass: 4,
    reach: 8,
    frames: 6,
    turn: 3,
  },
  // Zombi dorado: poco común, huye de ti y desaparece si no lo matas a tiempo.
  golden: {
    hp: 42 * 3,
    speed: 1.1,
    radius: 13,
    damage: 6,
    attackRate: 0.9,
    xp: 15,
    mass: 1,
    reach: 7,
    frames: 6,
    turn: 6,
  },
  giant: {
    hp: 1500,
    speed: 1,
    radius: 42,
    damage: 32,
    attackRate: 0.45,
    xp: 30,
    mass: 40,
    reach: 14,
    frames: 8,
    turn: 1.4,
    blocksBullets: true,
  },
};

// Curva de experiencia: barata al principio (mejoras seguidas en los primeros minutos)
// y cuadrática después, sin saltos bruscos entre niveles.
//   nv1 51 · nv2 89 · nv3 139 · nv5 275 · nv10 825 · nv20 2825
export const xpForLevel = (lvl: number) => Math.round(25 + 20 * lvl + 6 * lvl * lvl);

// Dinero por cada zombi eliminado. El doble que el original (y doble xp en ZOMBIES): con las
// oleadas de WAVES.count = 0,75 por ronda se gana 1,5 veces lo de las oleadas originales.
export const BOUNTY = { normal: 2, sprinter: 6, swat: 20, fat: 10, heavy: 50, bull: 30, giant: 10, golden: 0 };

// Tamaño y ritmo de las oleadas: rondas cortas.
// count: fracción de zombis por oleada (se aplica igual en solitario y en línea, ver NET.crowd)
// hp / speed: vida y velocidad base de los zombis de oleada · straggle: s antes de acercar a los rezagados
// spawnTime: toda la oleada aparece en estos s (en ráfagas cada burst s), salvo que se llegue al tope de vivos
// view: media caja (px) que se da por vista de los demás jugadores (cubre celular vertical y pantalla ancha);
// nadie aparece dentro de la vista de ningún jugador vivo
// offscreen: multiplicador de velocidad de un zombi que ningún jugador ve (llegan antes, sin rezagados)
// lost: px desde el jugador más cercano a partir de los que un zombi fuera de vista se da por perdido
export const WAVES = {
  count: 0.75,
  hp: 0.9,
  speed: 1.2,
  straggle: 3,
  spawnTime: 10,
  burst: 0.4,
  view: [680, 520],
  offscreen: 1.8,
  lost: 1100,
};

// Embestida del toro: te ve, escarba y carga en línea recta.
// hit: daño al jugador · long/short: daño de la embestida larga y corta contra estructuras.
export const BULL = {
  sight: 430,
  windup: 0.75,
  speed: 470,
  maxTime: 1.25,
  hit: 40,
  throw: 1500,
  long: 250,
  short: 40,
  cooldown: 2.2,
};

// Zombis normales heridos: se desangran (vida por segundo) y avanzan arrastrándose.
export const WOUND = { bleed: 3, pace: 0.5 };

// Molotov: charco de fuego y quemadura sobre los zombis que lo pisan.
export const MOLOTOV = { radius: 82, life: 6.5, burn: 4, dps: 24 };

// Zombi dorado: recompensa al matarlo y cuánto vive antes de desaparecer.
export const GOLDEN = { rewardMin: 100, rewardMax: 250, life: 26, warnAt: 7, firstAfter: 12, every: [35, 65] };

// Racha: bajas seguidas sin dejar pasar window s entre una y otra ni recibir un golpe de zombi.
// tiers: [bajas, multiplicador] del dinero y la experiencia de cada baja · golden: bajas que suma
// un dorado · show: desde cuántas bajas se ve el contador.
export const COMBO = {
  window: 2.5,
  golden: 10,
  show: 5,
  tiers: [
    [10, 1.5],
    [25, 2],
    [50, 3],
    [100, 4],
  ],
};

// Rondas especiales: desde la oleada `from`, cada oleada tiene `chance` de serlo; nunca dos
// seguidas ni un tipo que salió en las `gap` especiales anteriores. Cada tipo lleva su cartel
// (name, desc), tag: su nombre corto en el contador de oleada, y pay: multiplicador del dinero
// de las bajas de esa ronda.
//   fog: niebla que deja ver hasta clear px (thick: opacidad de la niebla)
//   blackout: farolas apagadas y oscuridad ambient · stampede: solo velocistas y toros, size de
//   la horda normal y bulls de ella toros · golden: un dorado cada every s · siege: swat de los
//   normales con escudo · blood: zombis speed veces más rápidos
export interface EventDef {
  name: string;
  tag: string;
  desc: string;
  pay: number;
  clear?: number;
  thick?: number;
  ambient?: number;
  size?: number;
  bulls?: number;
  every?: [number, number];
  swat?: number;
  speed?: number;
}
export const EVENTS: { from: number; chance: number; gap: number; types: Record<string, EventDef> } = {
  from: 2,
  chance: 0.35,
  gap: 2,
  types: {
    fog: {
      name: 'Niebla',
      tag: 'Niebla',
      desc: 'No ves más allá de unos pasos: escucha a la horda',
      pay: 1.5,
      clear: 230,
      thick: 0.9,
    },
    blackout: {
      name: 'Apagón',
      tag: 'Apagón',
      desc: 'Se apagaron las farolas: solo queda tu linterna',
      pay: 1.5,
      ambient: 0.82,
    },
    stampede: {
      name: 'Estampida',
      tag: 'Estampida',
      desc: 'Velocistas y toros a toda carrera',
      pay: 1.5,
      size: 0.6,
      bulls: 0.1,
    },
    golden: {
      name: 'Lluvia dorada',
      tag: 'Dorados',
      desc: 'Zombis dorados por todas partes: atrápalos',
      pay: 1.5,
      every: [7, 11],
    },
    siege: {
      name: 'Asedio blindado',
      tag: 'Asedio',
      desc: 'La mitad de la horda llega con escudo',
      pay: 1.5,
      swat: 0.5,
    },
    blood: { name: 'Luna de sangre', tag: 'Sangre', desc: 'Más rápidos y pagan el doble', pay: 2, speed: 1.2 },
  },
};
// Orden fijo de los tipos: la foto manda la ronda especial por su lugar aquí (0 = ninguna).
export const EVENT_ORDER = ['fog', 'blackout', 'stampede', 'golden', 'siege', 'blood'];

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
export const ROBOT = { hp: 10000, radius: 42, mass: 40, price: 10000, repairPerHp: 0.1, speed: 0.85, gunScale: 1.7 };

// Torreta pesada montada: munición que se compra (pack balas por price), qué tan rápido gira el
// cañón (rad/s), cuánto daño quita su escudo al que la maneja, a qué distancia se monta y la
// microexplosión de cada bala (radio en px y daño en el centro; la granada es 140 y 330).
export const HEAVY = { pack: 100, price: 200, turn: 4.5, shield: 0.5, reach: 60, blastR: 60, blastPower: 55 };

// Clasificación mundial y estadísticas de uso (Supabase, sin librerías: API REST; ver supabase/esquema.sql).
// url: la del proyecto ('https://xxxx.supabase.co'); key: la clave publicable (sb_publishable_…), que es
// pública por diseño: las tablas sólo se escriben a través de las funciones dz_* y sólo `scores` se lee.
// Vacías = sólo clasificación de este dispositivo (y la de Claude si se abre como Artifact), sin estadísticas.
export const ONLINE = {
  url: 'https://pftrqgbronbiqzydylfd.supabase.co',
  key: 'sb_publishable_pSzagBZQ-Qj7tgvCeojedA_Y0IEOuIV',
};

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
  zombieView: [900, 760], // mitad del cuadro para los zombis (cubre cualquier pantalla); dorado y gigante usan view
  crowd: [0.5, 0.15], // zombis por oleada: 0,5 del solitario + 0,15 por cada jugador extra
};

// Umbrales de la música dinámica (peligro = suma de cercanía de zombis).
export const MUSIC = { threatOn: 4, threatOff: 2, hordeOn: 14, hordeOff: 8, minHold: 4 };

// Tienda entre oleadas. w/h en px del mundo; rotates = se coloca perpendicular a la mira.
export const SHOP = {
  wood: {
    name: 'Bloque de madera',
    desc: 'Barricada básica. Disparas por encima de ella.',
    price: 10,
    hp: 160,
    w: 40,
    h: 40,
  },
  metal: {
    name: 'Bloque de metal',
    desc: 'Placa de acero: aguanta 3 veces más que la madera.',
    price: 30,
    hp: 520,
    w: 40,
    h: 40,
  },
  sandbag: {
    name: 'Sacos terreros',
    desc: 'Muro ancho y barato. Ideal para cerrar calles rápido.',
    price: 25,
    hp: 450,
    w: 80,
    h: 24,
    rotates: true,
  },
  fence: {
    name: 'Valla de metal reforzado',
    desc: 'Muro ancho muy resistente. Frena a los gordos un buen rato.',
    price: 70,
    hp: 1400,
    w: 80,
    h: 24,
    rotates: true,
  },
  concrete: {
    name: 'Muro de concreto',
    desc: 'La defensa más dura: aguanta más del doble que la valla.',
    price: 150,
    hp: 3200,
    w: 80,
    h: 28,
    rotates: true,
  },
  hesco: {
    name: 'Barrera HESCO',
    desc: 'Gaviones militares de malla rellenos de arena. Casi indestructible.',
    price: 800,
    hp: 10000,
    w: 80,
    h: 40,
    rotates: true,
  },
  turret: {
    name: 'Torreta automática',
    desc: 'Dispara sola al zombi más cercano. Ponla detrás de tus muros.',
    price: 500,
    hp: 700,
    w: 40,
    h: 40,
    turret: true,
  },
  // Se monta con E (o el botón): la manejas tú con su cañón doble (WEAPONS.heavy) y balas compradas.
  heavy: {
    name: 'Torreta pesada',
    desc: 'Cañón doble blindado: móntala con E y dispara balas explosivas que estallan entre la horda. Necesita munición.',
    price: 15000,
    hp: 4000,
    w: 40,
    h: 40,
    turret: true,
    manned: true,
  },
  wire: {
    name: 'Alambre de púas',
    desc: 'No bloquea el paso: frena mucho y hiere a los zombis que lo cruzan.',
    price: 20,
    hp: 70,
    w: 80,
    h: 40,
    rotates: true,
    ground: true,
  },
  spikes: {
    name: 'Trampa de pinchos',
    desc: 'Placa de clavos: frena y hiere mucho más que el alambre.',
    price: 60,
    hp: 300,
    w: 40,
    h: 40,
    ground: true,
  },
  mine: {
    name: 'Mina terrestre',
    desc: 'Explota cuando un zombi la pisa y arrasa todo alrededor.',
    price: 45,
    hp: 1,
    w: 24,
    h: 24,
    ground: true,
  },
  grenade: {
    name: 'Granada',
    desc: 'Explosión en área que arrasa grupos enteros. Cara, úsala bien.',
    price: 90,
    consumable: true,
  },
  molotov: {
    name: 'Molotov',
    desc: 'Botella incendiaria: deja un charco de fuego que quema a todo zombi que lo pisa.',
    price: 60,
    consumable: true,
  },
};
export const BUILD_ORDER = [
  'wood',
  'sandbag',
  'metal',
  'fence',
  'concrete',
  'hesco',
  'turret',
  'heavy',
  'wire',
  'spikes',
  'mine',
];
export const THROWABLES = ['grenade', 'molotov'];
export const SHOP_ORDER = [...BUILD_ORDER, ...THROWABLES];
// Vender un arma devuelve esta fracción de su precio.
export const SELL_RATE = 0.5;

// Largo de cada arma dibujada desde su culata (para la boca del cañón en el brazo del robot).
export const GUN_REACH = {
  pistol: 12,
  smg: 22,
  shotgun: 30,
  rifle: 36,
  ar: 30,
  autoshotgun: 30,
  sniper: 46,
  lmg: 37,
  bazooka: 51,
};

// Etapas de recarga sincronizadas con el progreso de la animación (0..1).
export const RELOAD_STEPS = {
  pistol: [
    [0.12, 'magOut'],
    [0.6, 'magIn'],
    [0.88, 'slide'],
  ],
  smg: [
    [0.15, 'magOut'],
    [0.58, 'magIn'],
    [0.86, 'bolt'],
  ],
  ar: [
    [0.14, 'magOut'],
    [0.56, 'magIn'],
    [0.85, 'bolt'],
  ],
  rifle: [
    [0.12, 'boltOpen'],
    [0.3, 'magOut'],
    [0.62, 'magIn'],
    [0.9, 'boltClose'],
  ],
  sniper: [
    [0.1, 'boltOpen'],
    [0.3, 'shell'],
    [0.5, 'shell'],
    [0.7, 'shell'],
    [0.9, 'boltClose'],
  ],
  shotgun: [
    [0.15, 'shell'],
    [0.32, 'shell'],
    [0.49, 'shell'],
    [0.66, 'shell'],
    [0.88, 'pump'],
  ],
  autoshotgun: [
    [0.12, 'magOut'],
    [0.55, 'drumIn'],
    [0.86, 'bolt'],
  ],
  lmg: [
    [0.08, 'coverOpen'],
    [0.3, 'magOut'],
    [0.55, 'belt'],
    [0.75, 'coverClose'],
    [0.9, 'bolt'],
  ],
  bazooka: [
    [0.12, 'coverOpen'],
    [0.45, 'rocketIn'],
    [0.7, 'rocketSeat'],
    [0.92, 'boltClose'],
  ],
};

// Cuántas variantes de dibujo (paletas) tiene cada tipo de zombi. render/sprites.js comprueba que coincida.
export const ZOMBIE_VARIANTS = {
  normal: 8,
  golden: 2,
  swat: 2,
  heavy: 2,
  sprinter: 3,
  fat: 4,
  bull: 3,
  giant: 2,
};

// Colores de carrocería de los coches abandonados (el mundo elige uno al generarse).
export const CAR_COLORS = ['#7d2f2a', '#c75f43', '#3f566b', '#6b6d68', '#b8b1a0', '#2f3a32', '#8a6a3a', '#4b4f63'];

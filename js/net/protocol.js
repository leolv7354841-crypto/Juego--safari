// Contrato de red compartido por el cliente (coop.js, online.js) y el servidor: tablas de índices
// y bits de la entrada. No importa nada, así que carga igual en el navegador y en Node.

// índices que viajan en las fotos en lugar de los nombres
export const TYPES = ['normal', 'swat', 'sprinter', 'fat', 'heavy', 'golden', 'bull', 'giant'];
export const PICKS = ['ammo', 'med', 'crate'];

// bits de la entrada
export const IN_RUN = 1;
export const IN_FIRE = 2;
export const IN_RELOAD = 4;

// efectos que el invitado genera por su cuenta (no hace falta mandarlos)
export const PARTICLE_SKIP = new Set(['constructor', 'add', 'update', 'draw', 'clear', 'rocketTrail', 'burning']);
export const SFX_SYNC = [
  'shot',
  'hit',
  'kill',
  'stomp',
  'explosion',
  'acid',
  'ricochet',
  'blockHit',
  'blockBreak',
  'build',
  'turret',
  'goldenSpawn',
  'punch',
  'bullRoar',
  'bullCharge',
  'bullHit',
  'bullSlam',
  'throwBottle',
  'molotov',
  'crackle',
  'burnScream',
  'rocketStick',
  'rocketArm',
  'gore',
  'wave',
  'missile',
  'boost',
];
export const DECAL_SYNC = ['corpse', 'splat', 'drip', 'acid'];

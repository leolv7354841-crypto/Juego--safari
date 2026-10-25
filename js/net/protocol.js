// Contrato de red compartido por el cliente (coop.js, online.js) y el servidor: tablas de índices
// y bits de la entrada. No importa nada, así que carga igual en el navegador y en Node.
// El formato de la foto del mundo está en snapshot.js (quien la codifica) y como tipo en core/types.d.ts (WorldSnap).
//
// Mensajes del cooperativo ('s' e 'in' van por el canal rápido `fast`, sin reintentos; el resto por el fiable `rel`):
//   anfitrión -> invitado  s (foto: CoopSnap) · fx (efectos) · k (empujón) · hurt · hit · earn · pick · acid · built
//                          · revive · over · start · bye
//   invitado -> anfitrión  in (posición y estado, 20 por segundo) · shot · build · throw · ab · dead · next · hello · bye
// Mensajes del servidor en línea (Colyseus): snap (foto: WorldSnap + lo propio de cada jugador) · load · go · resume
//   · results · notice · error · shutdown · p; el cliente manda in · act · buy · pick · next · ready · cls · start · loaded.

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

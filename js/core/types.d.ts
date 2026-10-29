// Tipos compartidos del juego (solo para la verificación con checkJs; no se carga en el navegador).
// Uso en JSDoc: /** @param {import('../types').GameHost} game */
import type { World } from '../sim/world.ts';
import type { Horde } from '../sim/zombies.ts';
import type { Bullets } from '../sim/bullets.ts';
import type { Director } from '../sim/director.ts';
import type { Pickups } from '../sim/pickups.ts';
import type { Player } from '../sim/player.ts';
import type { Structures } from '../sim/build.ts';
import type { Robot } from '../sim/robot.ts';
import type { Mode } from '../net/mode.ts';
import type { Remote } from '../net/remote.ts';

export type Vec = { x: number; y: number };

export interface ZombieDef {
  radius: number;
  mass: number;
  hp: number;
  speed: [number, number];
  frames: number;
  blocksBullets?: boolean;
  [k: string]: any;
}

export interface Zombie {
  id: number;
  type: string;
  def: ZombieDef;
  x: number;
  y: number;
  r: number;
  mass: number;
  hp: number;
  maxHp: number;
  speed: number;
  angle: number;
  si: number;
  flash: number;
  slow: number;
  kx: number;
  ky: number;
  dead: boolean;
  wounded: boolean;
  hitT: number;
  hitJolt: number;
  burn: number;
  air: number;
  life: number;
  lastDx?: number;
  lastDy?: number;
  [k: string]: any;
}

export interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  life: number;
  dmg: number;
  knock: number;
  pierce: number;
  trail: number;
  owner?: string | null;
  rocket?: boolean;
  blast?: boolean;
  blastR?: number;
  blastP?: number;
  auto?: boolean;
  exploded?: boolean;
  dead?: boolean;
  hits?: Zombie[];
  [k: string]: any;
}

export interface Weapon {
  id: string;
  name: string;
  damage: number;
  mag: number;
  reserve: number;
  reserveMax: number;
  pickup: number;
  reload: number;
  [k: string]: any;
}

// Entrada de un jugador en un paso fijo. La fabrica el cliente (netcode.ts) y la valida el servidor
// (server/src/rooms/DeadZoneRoom.ts, bindInputs: la entrada del canal de Colyseus ya saneada): un solo tipo para los dos lados.
export type Cmd = { s: number; mx: number; my: number; f: number; a: number; w: number };

// Acción de un jugador ligada a su última entrada (s): construir, lanzar, subir al robot o usar la
// habilidad de su clase (ab, hacia tx/ty). La valida server/src/validate.ts (cleanAct).
export type Act = { s: number; k: 'build' | 'throw' | 'robot' | 'ab'; kind: string; tx: number; ty: number };

// Un jugador de la sala tal como lo ve el cliente en el estado de Colyseus. server/src/rooms/state.ts
// comprueba en compilación que el esquema `Member` cumple esta forma.
export interface LobbyMember {
  name: string;
  look: string;
  cls: string;
  idx: number;
  ready: boolean;
  connected: boolean;
  inGame: boolean;
  alive: boolean;
  kills: number;
  joinedAt: number;
}

// Foto que el servidor manda a cada cliente (campos cortos; ver ServerSim.snapshot).
export interface Snapshot {
  q: number;
  t: number;
  ts: number;
  ack: number;
  me: number[];
  st: number[];
  wp: [string, number, number][];
  o: [number, number];
  z: number[];
  zx: number[];
  zh: number[];
  pl: number[];
  pk: number[];
  b: number[];
  w: number;
  [k: string]: any;
}

// Lo que los módulos de simulación llaman en `game`. Lo cumplen `Game` (main.js) en el navegador
// y el objeto que arma server/src/sim/ServerSim.ts en el servidor.
export interface GameHost {
  world: World;
  horde: Horde;
  bullets: Bullets;
  director: Director;
  pickups: Pickups;
  structures: Structures;
  player: Player | null;
  robot?: Robot;
  time: number;
  state: string;
  // En línea (servidor): jugadores en vez de game.player.
  targets?: Player[] | null;
  // Quién manda en esta partida (js/net/mode.js)
  mode: Mode;
  // Jugadores, zombis y balas que llegan por la red (js/net/remote.js)
  remote?: Remote;
  hurtFlash: number;
  muzzle: number;
  camera: {
    viewW: number;
    viewH: number;
    shake(n: number, x?: number, y?: number): void;
    kick(...a: any[]): void;
    [k: string]: any;
  };
  // any: lo cumplen las clases Particles/Sfx/Decals y las grabadoras del servidor
  particles: any;
  decals: any;
  sfx: any;
  input: any;
  mouseWorld(): Vec;
  spawnFocus(): Vec;
  hitZombie(z: Zombie, b: Bullet, hx: number, hy: number): void;
  killZombie(z: Zombie, ...a: any[]): void;
  collectFor?(p: Player, it: any): boolean;
  onPlayerDeath(...a: any[]): void;
  onZombieHit(z: Zombie | null, p: any): void;
  onRobotHit(dmg: number, p: any): void;
  applyAcid(p: any): void;
  rocketHit(z: Zombie, x: number, y: number, b: Bullet): void;
  rocketBlast(x: number, y: number, owner?: string | null): void;
  heavyBlast(x: number, y: number, owner?: string | null, R?: number, power?: number): void;
  /** El jugador que pagó lo que puso `owner` (sus balas usa el piloto automático de la torreta pesada). */
  ownerOf?(owner: string | null): Player | null;
  updateHud(...a: any[]): void;
  onSuperPunch(z: Zombie, x: number, y: number): void;
  onGiantStep(z: Zombie): void;
  onGoldenExpired(z: Zombie): void;
  onWaveCleared(): void;
  banner(title: string, sub?: string): void;
  toast(msg: string): void;
  [k: string]: any;
}

declare global {
  interface Window {
    __deadzone?: unknown;
    /** Página de estadísticas (js/stats/pagina.js): pintar datos a mano al depurar. */
    __dzStats?: { pintar: (d: any) => void; cargar: () => Promise<void> };
    DZ_VERSION?: string;
    /** Safari antiguo: el contexto de audio con prefijo (js/ui/audio.js). */
    webkitAudioContext?: typeof AudioContext;
    /** Sólo existe cuando el juego corre como Artifact de Claude (nube de accounts.js). */
    claude?: { use?: (name: string) => Promise<any> };
  }
}

// Lo inyecta Vite al compilar (vite.config.js); no existe en desarrollo ni en el servidor.
declare global {
  var __DZ_VERSION__: string | undefined;
}

// Foto del mundo (js/net/snapshot.js): la que arma el servidor en línea.
// Son listas planas de números; los tamaños por elemento están como constantes en snapshot.js.
export interface WorldSnap {
  /** Origen (x, y) al que son relativas las posiciones de `z`. */
  o: [number, number];
  /** Por zombi (ZOMBIE_N = 6): id, tipo (índice en TYPES), dx, dy, ángulo (64 pasos), banderas. */
  z: number[];
  /** Por zombi en el aire o hinchado (3): id, altura, hinchazón x100. */
  zx: number[];
  /** Por zombi herido con barra (2): id, vida en %. */
  zh: number[];
  /** Por jugador visto (PEER_N = 19): idx, x, y, mira x100, piernas x100, corre, arma (WEAPON_ORDER), fogonazo, vivo, golpe, retroceso x100, velocidad, vida, ausente, en robot, habilidad (bits), cargador, recarga x100, avance de recarga x100. */
  pl: number[];
  /** Por robot (ROBOT_N = 8): idx del dueño, x, y, ángulo x100, piernas x100, paso x100, vida, pilotado. */
  rb: number[];
  /** Objetos (4): tipo (PICKS), x, y, edad x10. */
  pk: number[];
  /** Balas ajenas (5): x, y, dx x100, dy x100, cohete. */
  b: number[];
  /** Granadas en el aire (6), fuego (5), cohetes clavados (7), misiles (4) y explosiones (3). */
  gr: number[];
  fi: number[];
  so: number[];
  ms: number[];
  bl: number[];
  /** Oleada, estado del director y reloj de la partida. */
  w: number;
  ds: string;
  tm: number;
  /** Ronda especial: su lugar en EVENT_ORDER + 1 (0 = ninguna). */
  ev: number;
  /** Cada cierto tiempo: barricadas, trampas y quemaduras del suelo (encodeStatic). */
  blk?: number[][];
  wir?: number[][];
  sc?: number[][];
}

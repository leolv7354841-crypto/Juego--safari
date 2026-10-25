// Tipos compartidos del juego (solo para la verificación con checkJs; no se carga en el navegador).
// Uso en JSDoc: /** @param {import('../types').GameHost} game */
import type { World } from '../sim/world.js';
import type { Horde } from '../sim/zombies.js';
import type { Bullets } from '../sim/bullets.js';
import type { Director } from '../sim/director.js';
import type { Pickups } from '../sim/pickups.js';
import type { Player } from '../sim/player.js';
import type { Structures } from '../sim/build.js';
import type { Robot } from '../sim/robot.js';

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

// Entrada de un jugador en un paso fijo (ver server/src/validate.ts).
export type Cmd = { s: number; mx: number; my: number; f: number; a: number; w: number };

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
  // En línea (servidor): jugadores en vez de game.player / coop.peer.
  targets?: Player[] | null;
  remoteSim?: boolean;
  hurtFlash: number;
  muzzle: number;
  camera: {
    viewW: number;
    viewH: number;
    shake(n: number, x?: number, y?: number): void;
    kick(...a: any[]): void;
    [k: string]: any;
  };
  coop: { isHost: boolean; isGuest: boolean; active: boolean; peer: any; [k: string]: any };
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
  onZombieHit(z: Zombie, p: any): void;
  onRobotHit(dmg: number, p: any): void;
  applyAcid(p: any): void;
  rocketHit(z: Zombie, x: number, y: number, b: Bullet): void;
  rocketBlast(x: number, y: number, owner?: string | null): void;
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
    DZ_VERSION?: string;
  }
}

// Lo inyecta Vite al compilar (vite.config.js); no existe en desarrollo ni en el servidor.
declare global {
  var __DZ_VERSION__: string | undefined;
}

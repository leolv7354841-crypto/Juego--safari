// Mejoras de la torreta pesada (HEAVY_UP en config): cada torreta guarda sus niveles en `up`, un número
// con 2 bits por mejora en el orden de HEAVY_UP_ORDER (así viaja en la foto y en la partida guardada).
// También el disparo del cañón doble, que comparten quien la maneja (Player.actMounted) y el piloto automático.
import { HEAVY, HEAVY_UP, HEAVY_UP_ORDER, WEAPONS } from '../core/config.ts';
import { angleTo, rand } from '../core/util.ts';
import type { GameHost, Zombie } from '../core/types.d.ts';
import type { Player } from './player.ts';

/** Lo que estas funciones leen y escriben de una torreta pesada (un `Block` de build.ts). */
export interface HeavyGun {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  max: number;
  ang: number;
  cd: number;
  owner: string | null;
  up?: number;
  side?: number;
  flash?: number;
  recoil?: number;
  manned?: unknown;
  aim?: Zombie | null;
}

const GUN = (WEAPONS as Record<string, { damage: number; speed: number; range: number; spread: number; knock: number }>)
  .heavy;

/** Nivel de la mejora id en la torreta (0 = de fábrica). */
export function heavyLevel(b: Pick<HeavyGun, 'up'>, id: string) {
  const i = HEAVY_UP_ORDER.indexOf(id);
  return i < 0 ? 0 : ((b.up || 0) >> (i * 2)) & 3;
}

/** Niveles de todas las mejoras ({ cal: 1, rate: 0, ... }). */
export function heavyLevels(b: Pick<HeavyGun, 'up'>) {
  const out: Record<string, number> = {};
  for (const id of HEAVY_UP_ORDER) out[id] = heavyLevel(b, id);
  return out;
}

/** Cuántos niveles tiene la mejora id. */
export const heavyMax = (id: string) => HEAVY_UP[id]?.price.length ?? 0;

/** Precio del siguiente nivel de id en esa torreta, o 0 si ya está al máximo (o no existe). */
export function heavyPrice(b: Pick<HeavyGun, 'up'>, id: string) {
  const d = HEAVY_UP[id];
  return d ? (d.price[heavyLevel(b, id)] ?? 0) : 0;
}

// Efectos del nivel actual de cada mejora.
export const heavyDmg = (b: Pick<HeavyGun, 'up'>) => HEAVY_UP.cal.dmg![heavyLevel(b, 'cal')];
export const heavyRate = (b: Pick<HeavyGun, 'up'>) => HEAVY_UP.rate.rate![heavyLevel(b, 'rate')];
export const heavyBlastR = (b: Pick<HeavyGun, 'up'>) => HEAVY_UP.blast.r![heavyLevel(b, 'blast')];
export const heavyMaxHp = (b: Pick<HeavyGun, 'up'>) => HEAVY_UP.armor.hp![heavyLevel(b, 'armor')];
export const heavyAuto = (b: Pick<HeavyGun, 'up'>) => heavyLevel(b, 'auto') > 0;

/** Sube un nivel la mejora id (el dinero lo cobra quien llama). El blindaje suma vida al instante. */
export function upgradeHeavy(b: HeavyGun, id: string) {
  const i = HEAVY_UP_ORDER.indexOf(id);
  if (i < 0 || !heavyPrice(b, id)) return false;
  const before = heavyMaxHp(b);
  b.up = (b.up || 0) + (1 << (i * 2));
  if (id === 'armor') {
    b.max = heavyMaxHp(b);
    b.hp = Math.min(b.max, b.hp + b.max - before);
  }
  return true;
}

/** Al acabar la oleada, las torretas blindadas se reparan una parte de su vida. */
export function repairHeavies(blocks: (HeavyGun & { kind: string })[]) {
  for (const b of blocks) {
    if (b.kind !== 'heavy') continue;
    const k = HEAVY_UP.armor.repair![heavyLevel(b, 'armor')];
    if (k > 0) b.hp = Math.min(b.max, b.hp + b.max * k);
  }
}

/**
 * Un disparo del cañón doble (alternando el cañón): la bala explosiva con el daño y el radio de las
 * mejoras de la torreta. Devuelve de dónde salió (para el fogonazo).
 */
export function fireHeavy(game: GameHost, b: HeavyGun, dmgMult = 1, spread = 0, owner?: string | null) {
  b.side = b.side === 1 ? -1 : 1;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const ca = Math.cos(b.ang);
  const sa = Math.sin(b.ang);
  const sx = cx + ca * 40 - sa * b.side * 7;
  const sy = cy + sa * 40 + ca * b.side * 7;
  const a = b.ang + rand(-1, 1) * (GUN.spread + spread);
  const k = heavyDmg(b);
  game.bullets.spawn({
    x: sx,
    y: sy,
    dx: Math.cos(a),
    dy: Math.sin(a),
    speed: GUN.speed * rand(0.97, 1.03),
    life: GUN.range,
    dmg: GUN.damage * dmgMult * k,
    pierce: 0,
    knock: GUN.knock,
    shot: { hit: false },
    hits: null,
    rocket: false,
    blast: true,
    blastR: heavyBlastR(b),
    blastP: HEAVY.blastPower * k,
    ...(owner !== undefined ? { owner, auto: true } : {}),
  });
  b.recoil = 1;
  b.flash = 0.05;
  game.particles.casing(cx - sa * b.side * 12, cy + ca * b.side * 12, b.ang + (Math.PI / 2) * b.side);
  game.particles.muzzleSmoke(sx, sy, b.ang);
  game.sfx.shot('heavy');
  return { x: sx, y: sy };
}

/**
 * Piloto automático: sin nadie a los mandos, el cañón gira hacia el zombi más cercano a su alcance y
 * dispara a media cadencia con las balas del dueño (`owner` la persona que la puso; sin dueño, nada).
 */
export function updateAutoHeavy(b: HeavyGun, dt: number, game: GameHost, owner: Pick<Player, 'heavyAmmo'> | null) {
  b.cd -= dt;
  b.recoil = Math.max(0, (b.recoil || 0) - dt * 10);
  b.flash = Math.max(0, (b.flash || 0) - dt);
  if (!heavyAuto(b) || b.manned) return;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const range = HEAVY_UP.auto.range!;
  const cur = b.aim && !b.aim.dead && Math.hypot(b.aim.x - cx, b.aim.y - cy) < range ? b.aim : null;
  b.aim = cur || game.horde.findTarget(cx, cy, range, null);
  if (!b.aim) return;
  const want = Math.atan2(b.aim.y - cy, b.aim.x - cx);
  b.ang = angleTo(b.ang, want, dt * HEAVY.turn);
  const off = Math.abs(Math.atan2(Math.sin(want - b.ang), Math.cos(want - b.ang)));
  if (b.cd > 0 || off > 0.2 || !owner || owner.heavyAmmo <= 0) return;
  owner.heavyAmmo--;
  b.cd = 1 / (heavyRate(b) * HEAVY_UP.auto.rate![1]);
  fireHeavy(game, b, 1, 0.02, b.owner);
}

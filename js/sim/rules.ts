// Reglas de combate compartidas: las usan por igual la partida en solitario y cooperativa
// (js/main.js) y el servidor en línea (server/src/sim/ServerSim.ts). Aquí vive lo que es igual
// en los dos lados (bajas, botín, zombi dorado, ácido, cohetes, golpes); lo que cambia
// (de quién es el dinero, cómo se avisa, de quién es la experiencia) lo pone quien llama con ganchos.
import { BOUNTY, DROPS, GOLDEN, HEAVY, MONEY_LOSS, ROCKET, WORLD_SIZE, xpForLevel } from '../core/config.ts';
import { rand, randInt } from '../core/util.ts';
import { ACID } from './build.ts';
import { bulletHit } from './combat.ts';

import type { Bullet, GameHost, Zombie } from '../core/types.d.ts';
import type { Player } from './player.ts';
import type { Robot } from './robot.ts';

/** Quien acumula experiencia (jugador, ranura del servidor). */
export type XpHolder = { xp: number; xpNeed: number; level: number };
/** Quien puede quemarse con ácido. */
export type Burnable = { alive: boolean; inRobot?: boolean; boostT?: number };
/** Estado de quemadura de ácido. */
export type AcidState = { acidT: number; acidTick: number };

/** Ganchos de una baja: lo que depende de quién juega. */
export type KillHooks = {
  /** contador de bajas por tipo */
  kills: Record<string, number>;
  /** reparte la experiencia del zombi */
  xp: (z: Zombie) => void;
  /** paga la recompensa del zombi a quien lo mató */
  bounty: (z: Zombie) => void;
  /** paga la recompensa única del dorado */
  golden: (z: Zombie, reward: number) => void;
  /** aviso para todos (gigante abatido) */
  toast: (msg: string) => void;
};

/** Recompensa única del zombi dorado. */
export const goldenReward = () => randInt(GOLDEN.rewardMin, GOLDEN.rewardMax);

/** Recompensa por matar a un zombi de ese tipo. */
export const bountyOf = (type: string) => (BOUNTY as Record<string, number>)[type] || 0;

/**
 * Lo que paga ahora a p una baja de ese tipo: la recompensa por la racha y por la ronda especial.
 * Las recompensas tienen fracciones: se paga en dólares enteros y lo que sobra queda en p.cash.
 */
export function bountyNow(game: GameHost, p: Pick<Player, 'cash'>, type: string, combo: number) {
  const v = (p.cash || 0) + bountyOf(type) * combo * (game.director.eventDef?.pay ?? 1);
  const n = Math.floor(v + 1e-9);
  p.cash = Math.max(0, v - n);
  return n;
}

/** Dinero que cuesta un golpe de zombi: nunca más del que se tiene. */
export const hitLoss = (money: number) => Math.min(money, randInt(MONEY_LOSS.min, MONEY_LOSS.max));

/**
 * Suma experiencia a quien tenga `xp`, `xpNeed` y `level`; devuelve cuántos niveles subió
 * (quien llama los suma a sus mejoras pendientes).
 */
export function gainXp(h: XpHolder, n: number) {
  let up = 0;
  h.xp += n;
  while (h.xp >= h.xpNeed) {
    h.xp -= h.xpNeed;
    h.level++;
    h.xpNeed = xpForLevel(h.level);
    up++;
  }
  return up;
}

/**
 * Una bala acierta a un zombi: aplica el daño y devuelve true si murió (quien llama lo mata).
 * `shotHit` suma el acierto al disparo de quien la lanzó, una sola vez por disparo.
 */
export function hitZombie(game: GameHost, z: Zombie, b: Bullet, hx: number, hy: number, shotHit: (b: Bullet) => void) {
  if (z.dead) return false;
  z.lastOwner = b.owner || null;
  bulletHit(game, z, b, hx, hy);
  if (b.shot && !b.shot.hit) {
    b.shot.hit = true;
    shotHit(b);
  }
  return z.hp <= 0;
}

/**
 * Baja de un zombi: cuenta, cadáver, dorado, ácido del gordo, experiencia, dinero y botín.
 * Devuelve false si ya estaba muerto.
 */
export function killZombie(game: GameHost, z: Zombie, h: KillHooks) {
  if (z.dead) return false;
  z.dead = true;
  h.kills[z.type] = (h.kills[z.type] || 0) + 1;
  if (z.burn > 0) z.burnt = true;
  game.decals.corpse(z, z.lastDx || 0, z.lastDy || 0);
  // en el menú los zombis son de adorno: no pagan ni revientan
  const live = game.state !== 'menu';
  if (z.type === 'golden' && live) {
    h.golden(z, goldenReward());
    game.particles.pickupFx(z.x, z.y, '#f0c040');
  }
  game.particles.death(z.x, z.y, z.r);
  // el gordo revienta en ácido y el super blindado estalla
  if (z.type === 'fat' && live) game.structures.queueDeathBlast(z.type, z.x, z.y);
  h.xp(z);
  if (live) h.bounty(z);
  const hasGuns = game.mode.inGroup() || (game.player && game.player.weapons.length > 1);
  const r = Math.random();
  if (z.type === 'giant') {
    game.camera.shake(0.5, z.x, z.y);
    game.particles.ring(z.x, z.y, z.r, '170,160,140');
    game.pickups.drop('crate', z.x, z.y);
    game.pickups.drop('med', z.x + 24, z.y);
    game.sfx.kill(true);
    h.toast('Gigante abatido');
  } else {
    const drop = (DROPS as Record<string, { ammo: number; med: number }>)[z.type] || DROPS.normal;
    if (r < drop.ammo && hasGuns) game.pickups.drop('ammo', z.x, z.y);
    else if (r < drop.ammo + drop.med) game.pickups.drop('med', z.x, z.y);
    game.sfx.kill(z.type === 'fat' || z.type === 'heavy');
  }
  return true;
}

/**
 * Hace aparecer un zombi dorado en el borde de la pantalla, fuera de la vista y alcanzable.
 */
export function spawnGolden(game: GameHost, toast: (msg: string) => void) {
  const d = game.director;
  for (let i = 0; i < 20; i++) {
    const c = d.edgePoint(game, rand(60, 140));
    if (c.x < 80 || c.y < 80 || c.x > WORLD_SIZE - 80 || c.y > WORLD_SIZE - 80) continue;
    if (game.world.pointBlocked(c.x, c.y, 16) || !d.canReach(game, c.x, c.y) || d.seen(d.views(game), c.x, c.y, 16))
      continue;
    game.horde.spawn('golden', c.x, c.y, 1, d.speedMult);
    game.sfx.goldenSpawn();
    toast('¡Apareció un zombi dorado! Atrápalo antes de que escape');
    return true;
  }
  return false;
}

/**
 * Reloj del zombi dorado durante una ronda: de vez en cuando, nunca dos a la vez.
 * Devuelve los segundos que faltan para el siguiente intento.
 */
export function goldenTick(game: GameHost, t: number, dt: number, toast: (msg: string) => void) {
  // lluvia dorada: uno tras otro, sin esperar el reloj normal
  const every = game.director.eventDef?.every ?? GOLDEN.every;
  t = Math.min(t, every[1]) - dt;
  if (t > 0) return t;
  const alive = game.horde.list.some((z: Zombie) => z.type === 'golden' && !z.dead);
  if (!alive && spawnGolden(game, toast)) return rand(every[0], every[1]);
  return 5;
}

/* ---------- ácido del gordo ---------- */

/** ¿Puede el ácido quemar a este jugador? No en el menú, ni dentro del robot ni con el impulso. */
export const canBurn = (game: GameHost, p: Burnable) =>
  game.state !== 'menu' && p.alive && !p.inRobot && !((p.boostT ?? 0) > 0);

/** Empieza (o renueva) la quemadura de `h`, que guarda `acidT` y `acidTick`. */
export function startAcid(h: AcidState) {
  if (!(h.acidT > 0)) h.acidTick = 0;
  h.acidT = ACID.burn;
}

/**
 * Avanza la quemadura: cada segundo quita vida fija. `onTick` añade lo propio de cada lado
 * (destello, sonido) y `onDeath` avisa de la caída. Devuelve lo que falta de quemadura.
 */
export function acidStep(game: GameHost, p: Player, h: AcidState, dt: number, onTick: () => void, onDeath: () => void) {
  if (!(h.acidT > 0)) return 0;
  h.acidTick += dt;
  while (h.acidTick >= 1 && p.alive) {
    h.acidTick -= 1;
    // daño directo y fijo: 2 de vida por segundo
    p.lastHit = 'acid';
    p.hp -= ACID.dps;
    p.damageTaken += ACID.dps;
    p.hurtT = 0.2;
    game.particles.acidBurst(p.x, p.y, 18);
    onTick();
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      onDeath();
    }
  }
  return p.alive ? Math.max(0, h.acidT - dt) : 0;
}

/* ---------- cohetes, golpes y robot ---------- */

/**
 * Explosión de un cohete (no la calcula quien solo mira: invitado o cliente en línea).
 */
export function rocketBlast(game: GameHost, x: number, y: number, owner: string | null = null) {
  if (!game.mode.authority()) return;
  game.structures.explode(game, { x, y, owner }, ROCKET.radius, ROCKET.power, 1);
}

/**
 * Microexplosión de una bala de la torreta pesada (no la calcula quien solo mira). El radio y el
 * daño los lleva la bala (dependen de las mejoras de la torreta).
 */
export function heavyBlast(
  game: GameHost,
  x: number,
  y: number,
  owner: string | null = null,
  R = HEAVY.blastR,
  power = HEAVY.blastPower,
) {
  if (!game.mode.authority()) return;
  game.structures.explode(game, { x, y, owner }, R, power, 0, true);
}

/** Impacto de cohete: en gordos y super blindados se clava; en el resto estalla al instante. */
export function rocketHit(game: GameHost, z: Zombie, x: number, y: number, b: Bullet) {
  if (!game.mode.authority()) return;
  if ((z.type === 'fat' || z.type === 'heavy') && !z.dead) game.structures.stickRocket(game, z, x, y, b);
  else rocketBlast(game, x, y, b.owner);
}

/** Super golpe del blindado (al jugador o a una estructura). */
export function superPunch(game: GameHost, x: number, y: number) {
  game.particles.dust(x, y, 18);
  game.camera.shake(0.35, x, y);
  game.sfx.punch();
}

/**
 * Golpe a quien va en su robot: lo aguanta el blindaje. Si se acaba, el robot explota y el
 * piloto sale despedido; devuelve true en ese caso.
 */
export function robotHit(game: GameHost, rb: Robot, dmg: number, p: Player) {
  game.sfx.blockHit('metal');
  if (!rb.damage(dmg)) return false;
  game.structures.explode(game, { x: rb.x, y: rb.y }, 170, 450, 1);
  rb.leave(p, game.world);
  rb.hp = 0;
  return true;
}

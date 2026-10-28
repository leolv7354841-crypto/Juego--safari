// Reglas de impacto compartidas por el juego local y el servidor en línea (mismo daño,
// frenado, heridas y empuje en los dos sitios).
import { rand } from '../core/util.ts';

// Aplica una bala a un zombi. No lo mata: quien llama decide (y cuenta la baja).
/**
 * @param {import('../core/types.js').GameHost} game
 * @param {import('../core/types.js').Zombie} z
 * @param {import('../core/types.js').Bullet} b
 * @param {number} hx
 * @param {number} hy
 */
export function bulletHit(
  game: import('../core/types.js').GameHost,
  z: import('../core/types.js').Zombie,
  b: import('../core/types.js').Bullet,
  hx: number,
  hy: number,
) {
  z.hp -= b.dmg;
  z.flash = 0.08;
  // reacción breve: sacudida hacia un lado y leve agrandado (no frena su comportamiento)
  z.hitT = 0.18;
  z.hitJolt = rand(0.2, 0.5) * (Math.random() < 0.5 ? -1 : 1) * (z.type === 'heavy' && !b.blast ? 0.25 : 1);
  z.lastDx = b.dx;
  z.lastDy = b.dy;
  if (Math.random() < 0.12) game.decals.splat(hx + b.dx * 14, hy + b.dy * 14, rand(7, 12));
  // el super blindado no se frena ni retrocede con las balas: sólo las explosiones lo mueven
  const armored = z.type === 'heavy' && !b.blast;
  // normales y velocistas: la bala no los avienta; se frenan, sangran y se arrastran
  const flesh = (z.type === 'normal' || z.type === 'sprinter') && !b.blast;
  if (flesh) {
    z.slow = 0.45;
    z.wounded = true;
    game.decals.splat(hx + b.dx * 6, hy + b.dy * 6, rand(8, 13));
  } else if (z.type !== 'giant' && !armored) z.slow = 0.16;
  if (!armored && !flesh) {
    const kn = (b.knock * 3) / z.mass;
    z.kx += b.dx * kn;
    z.ky += b.dy * kn;
  }
  const big = z.type === 'fat' || z.type === 'swat' || z.type === 'heavy' || z.type === 'bull' || z.type === 'giant';
  game.particles.hit(hx, hy, b.dx, b.dy, big);
  game.sfx.hit(big);
}

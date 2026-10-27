import { segCircleT } from '../core/util.js';

const near = [];
// Parte de las balas rebota en la armadura del super blindado (sin hacer daño).
const RICOCHET = 0.45;

export class Bullets {
  constructor() {
    this.list = [];
  }

  spawn(b) {
    b.trail = 0;
    this.list.push(b);
  }

  clear() {
    this.list.length = 0;
  }

  /**
   * @param {number} dt
   * @param {import('../core/types.js').GameHost} game
   */
  update(dt, game) {
    const list = this.list;
    const world = game.world;
    const grid = game.horde.grid;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (b.rocket) {
        // el cohete cabecea y se tambalea en el aire, sin perder del todo el rumbo
        if (b.base === undefined) {
          b.base = Math.atan2(b.dy, b.dx);
          b.ph = Math.random() * 10;
          b.drift = 0;
          b.age = 0;
        }
        b.age += dt;
        b.drift = Math.max(-0.09, Math.min(0.09, b.drift + (Math.random() - 0.5) * dt * 1.6));
        const a = b.base + b.drift + Math.sin(b.age * 17 + b.ph) * 0.09 + Math.sin(b.age * 7.3 + b.ph * 2) * 0.05;
        b.dx = Math.cos(a);
        b.dy = Math.sin(a);
        game.particles.rocketTrail(b.x, b.y, b.dx, b.dy);
      }
      let step = b.speed * dt;
      if (step > b.life) step = b.life;
      const x = b.x;
      const y = b.y;

      // ¿choca contra un obstáculo alto?
      let stop = 1;
      let wall = false;
      const n = Math.max(1, Math.ceil(step / 8));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        if (world.pointBlocked(x + b.dx * step * t, y + b.dy * step * t, 0, true)) {
          stop = (k - 1) / n;
          wall = true;
          break;
        }
      }
      const segLen = step * stop;
      const ex = x + b.dx * segLen;
      const ey = y + b.dy * segLen;
      const pad = 48;
      grid.query(Math.min(x, ex) - pad, Math.min(y, ey) - pad, Math.max(x, ex) + pad, Math.max(y, ey) + pad, near);

      let dead = wall;
      let endT = 1;
      let bounce = null;
      // procesar impactos en orden a lo largo del segmento
      for (;;) {
        let best = null;
        let bt = 2;
        for (let k = 0; k < near.length; k++) {
          const z = near[k];
          if (z.dead || (b.hits && b.hits.includes(z))) continue;
          const t = segCircleT(x, y, ex - x, ey - y, z.x, z.y, z.r);
          if (t >= 0 && t < bt) {
            bt = t;
            best = z;
          }
        }
        if (!best) break;
        (b.hits || (b.hits = [])).push(best);
        const hx = x + (ex - x) * bt;
        const hy = y + (ey - y) * bt;
        if (b.rocket) {
          // el cohete no rebota ni atraviesa: impacta en el primero que toca
          game.rocketHit(best, hx, hy, b);
          b.exploded = true;
          dead = true;
          wall = false;
          endT = bt;
          break;
        }
        if (b.blast) {
          // bala explosiva (torreta pesada): pega y estalla ahí mismo, también en los blindados
          game.hitZombie(best, b, hx, hy);
          game.heavyBlast(hx, hy, b.owner);
          dead = true;
          wall = false;
          endT = bt;
          break;
        }
        if (best.type === 'heavy' && Math.random() < RICOCHET) {
          // rebote: se refleja sobre la placa con algo de desvío y pierde fuerza
          const nl = Math.hypot(hx - best.x, hy - best.y) || 1;
          const nx = (hx - best.x) / nl;
          const ny = (hy - best.y) / nl;
          const dot = b.dx * nx + b.dy * ny;
          const a = Math.atan2(b.dy - 2 * dot * ny, b.dx - 2 * dot * nx) + (Math.random() - 0.5) * 0.9;
          bounce = { dx: Math.cos(a), dy: Math.sin(a) };
          game.particles.impact(hx, hy, bounce.dx, bounce.dy);
          game.sfx.ricochet();
          best.flash = 0.05;
          wall = false;
          endT = bt;
          break;
        }
        game.hitZombie(best, b, hx, hy);
        // el gigante absorbe la bala: protege a los que vienen detrás
        if (best.def.blocksBullets || b.pierce <= 0) {
          dead = true;
          wall = false;
          endT = bt;
          break;
        }
        b.pierce--;
        b.dmg *= 0.8;
      }

      b.x = x + (ex - x) * endT;
      b.y = y + (ey - y) * endT;
      b.life -= step;
      b.trail = Math.min(b.trail + step * endT, 26);
      if (bounce) {
        b.dx = bounce.dx;
        b.dy = bounce.dy;
        b.x += b.dx * 3;
        b.y += b.dy * 3;
        b.trail = 0;
        b.dmg *= 0.5;
        b.pierce = 0;
        b.life = Math.min(b.life, 240);
      }
      if (b.rocket && !b.exploded && (wall || b.life <= 0)) game.rocketBlast(b.x - b.dx * 4, b.y - b.dy * 4, b.owner);
      else if (b.blast && wall) game.heavyBlast(b.x - b.dx * 4, b.y - b.dy * 4, b.owner);
      else if (wall) game.particles.impact(b.x, b.y, b.dx, b.dy);
      if (dead || b.life <= 0) {
        b.dead = true;
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }
}

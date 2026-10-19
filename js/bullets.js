import { segCircleT } from './util.js';

const near = [];

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

  update(dt, game) {
    const list = this.list;
    const world = game.world;
    const grid = game.horde.grid;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
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
      if (wall) game.particles.impact(b.x, b.y, b.dx, b.dy);
      if (dead || b.life <= 0) {
        b.dead = true;
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  draw(ctx) {
    ctx.lineCap = 'round';
    for (const b of this.list) {
      const len = b.trail;
      ctx.strokeStyle = 'rgba(255,214,150,0.25)';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(b.x - b.dx * len, b.y - b.dy * len);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,205,0.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(b.x - b.dx * len * 0.5, b.y - b.dy * len * 0.5);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
}

import { drawPickup } from './sprites.js';
import { rand, pick } from './util.js';
import { WEAPON_ORDER, WEAPONS } from './config.js';

const LIFE = 22;

export class Pickups {
  constructor() {
    this.list = [];
  }
  clear() {
    this.list.length = 0;
  }
  drop(k, x, y) {
    this.list.push({ k, x: x + rand(-6, 6), y: y + rand(-6, 6), t: 0 });
  }

  update(dt, game) {
    const p = game.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      it.t += dt;
      const dx = p.x - it.x;
      const dy = p.y - it.y;
      const d = Math.hypot(dx, dy);
      if (d < 80 && p.alive) {
        const pull = (1 - d / 80) * 380 * dt;
        it.x += (dx / (d || 1)) * pull;
        it.y += (dy / (d || 1)) * pull;
      }
      if (d < p.r + 14 && p.alive && this.collect(it, game)) {
        this.list.splice(i, 1);
        continue;
      }
      if (it.t > LIFE) this.list.splice(i, 1);
    }
  }

  collect(it, game) {
    const p = game.player;
    if (it.k === 'ammo') {
      if (!p.addAmmo(1)) return false;
      game.toast('+ Munición');
      game.particles.pickupFx(it.x, it.y, '#c9a54a');
    } else if (it.k === 'med') {
      if (p.hp >= p.stats.maxHp) return false;
      p.hp = Math.min(p.stats.maxHp, p.hp + 30);
      game.toast('+30 Vida');
      game.particles.pickupFx(it.x, it.y, '#7fb38f');
    } else {
      const locked = WEAPON_ORDER.filter((id) => !p.has(id));
      if (locked.length) {
        const id = pick(locked);
        p.unlock(id);
        game.toast(`Nueva arma: ${WEAPONS[id].name}`);
      } else {
        p.addAmmo(3);
        game.toast('+ Munición extra');
      }
      game.particles.pickupFx(it.x, it.y, '#d9783a');
    }
    game.sfx.pickup();
    return true;
  }

  draw(ctx, view, time) {
    for (const it of this.list) {
      if (it.x < view.x0 - 20 || it.x > view.x1 + 20 || it.y < view.y0 - 20 || it.y > view.y1 + 20) continue;
      // parpadea cuando está por desaparecer
      if (it.t > LIFE - 4 && Math.sin(it.t * 18) > 0) continue;
      drawPickup(ctx, it.k, it.x, it.y, time + it.x);
    }
  }
}

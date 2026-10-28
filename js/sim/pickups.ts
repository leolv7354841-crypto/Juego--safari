import { rand, pick } from '../core/util.ts';
import { CRATE_WEAPONS, WEAPONS } from '../core/config.ts';

export const LIFE = 22;

export class Pickups {
  declare list: any;
  constructor() {
    this.list = [];
  }
  clear() {
    this.list.length = 0;
  }
  drop(k, x, y) {
    this.list.push({ k, x: x + rand(-6, 6), y: y + rand(-6, 6), t: 0 });
  }

  /**
   * @param {number} dt
   * @param {import('../core/types.js').GameHost} game
   */
  update(dt: number, game: import('../core/types.js').GameHost) {
    // cooperativo: el compañero también recoge (el anfitrión decide y le avisa)
    // en línea (servidor): recoge el jugador vivo más cercano de game.targets
    const targets = game.targets || null;
    const hosted = targets ? null : game.mode.hostedPeer();
    const peer = hosted && hosted.alive ? hosted : null;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      it.t += dt;
      let p = game.player;
      if (targets) {
        p = null;
        let bd = Infinity;
        for (const q of targets) {
          const d2 = (q.x - it.x) ** 2 + (q.y - it.y) ** 2;
          if (q.alive && d2 < bd) {
            bd = d2;
            p = q;
          }
        }
        if (!p) {
          if (it.t > LIFE) this.list.splice(i, 1);
          continue;
        }
      } else if (
        peer &&
        (!p.alive || (peer.x - it.x) ** 2 + (peer.y - it.y) ** 2 < (p.x - it.x) ** 2 + (p.y - it.y) ** 2)
      )
        p = peer;
      const dx = p.x - it.x;
      const dy = p.y - it.y;
      const d = Math.hypot(dx, dy);
      // sólo se atrae lo que se puede recoger: un botiquín con la vida llena se queda en el suelo
      const usable = p.alive && this.canCollect(it, p);
      if (it.taken) continue;
      // imán rápido; al tocarla se recoge en ese mismo fotograma, sin esperas
      if (d < 120 && usable) {
        const pull = Math.min(d, 900 * dt);
        it.x += (dx / (d || 1)) * pull;
        it.y += (dy / (d || 1)) * pull;
      }
      const reach = p.r + (it.k === 'ammo' ? 26 : 16);
      if (
        Math.hypot(p.x - it.x, p.y - it.y) < reach &&
        usable &&
        (targets ? game.collectFor(p, it) : p === peer ? game.coop.peerPickup(it) : this.collect(it, game))
      ) {
        it.taken = true;
        this.list.splice(i, 1);
        continue;
      }
      if (it.t > LIFE) this.list.splice(i, 1);
    }
  }

  canCollect(it, p) {
    if (p.remote) return it.k === 'med' ? p.hp < p.stats.maxHp : it.k === 'ammo' ? !!p.needAmmo : true;
    if (it.k === 'med') return p.hp < p.stats.maxHp;
    if (it.k === 'ammo') return p.weapons.some((w) => w.reserve !== Infinity && w.reserve < p.reserveMax(w.def));
    return true;
  }

  collect(it, game) {
    const p = game.player;
    if (it.k === 'ammo') {
      if (!p.addAmmo(1)) return false;
      game.toast('+ Munición');
      game.updateHud(false);
      game.particles.pickupFx(it.x, it.y, '#c9a54a');
    } else if (it.k === 'med') {
      if (p.hp >= p.stats.maxHp) return false;
      p.hp = Math.min(p.stats.maxHp, p.hp + 30);
      game.toast('+30 Vida');
      game.particles.pickupFx(it.x, it.y, '#7fb38f');
    } else {
      const locked = CRATE_WEAPONS.filter((id) => !p.has(id));
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
}

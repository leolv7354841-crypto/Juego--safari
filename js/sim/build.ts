// Barricadas compradas en la tienda (madera, metal, vallas, alambre) y granadas.
import { SHOP, MOLOTOV, ROCKET, ABILITY, HEAVY } from '../core/config.ts';
import { TAU, rand, clamp } from '../core/util.ts';

const SNAP = 20;
const TRAP_WIRE = { slow: 0.35, dps: 14 };
const TRAP_SPIKES = { slow: 0.5, dps: 45 };
const TURRET_RANGE = 340;
const BLAST_R = 140;
// Al morir, el gordo revienta en ácido verde.
export const ACID = { radius: 105, burn: 5, dps: 2 };
const near = [];

// Bala de la torreta (la misma en el servidor y, de adorno, en los clientes en línea).
export function turretBullet(x, y, a, owner = null) {
  return {
    x,
    y,
    dx: Math.cos(a),
    dy: Math.sin(a),
    speed: 1100,
    life: TURRET_RANGE + 40,
    dmg: 34,
    pierce: 1,
    knock: 40,
    shot: null,
    hits: null,
    owner,
    turret: true,
  };
}

// Distancia al jugador más cercano (en línea, el servidor tiene varios en game.targets).
export class Structures {
  declare blocks: any;
  declare wires: any;
  declare grenades: any;
  declare blasts: any;
  declare scorches: any;
  declare pending: any;
  declare fires: any;
  declare stuck: any;
  declare missiles: any;
  declare fireId: any;
  declare time: any;
  constructor() {
    this.blocks = [];
    this.wires = [];
    this.grenades = [];
    this.blasts = [];
    this.scorches = [];
    this.pending = [];
    this.fires = [];
    this.stuck = [];
    this.missiles = [];
  }

  clear() {
    this.pending.length = 0;
    this.fires.length = 0;
    this.stuck.length = 0;
    this.missiles.length = 0;
    this.blocks.length = 0;
    this.wires.length = 0;
    this.grenades.length = 0;
    this.blasts.length = 0;
    this.scorches.length = 0;
  }

  /* ---------- construcción ---------- */

  // Dónde caería el bloque: delante del jugador, alineado a una rejilla de 20 px.
  /**
   * @param {import('../core/types.js').GameHost} game
   * @param {string} kind
   */
  placement(game: import('../core/types.js').GameHost, kind: string) {
    const def = SHOP[kind];
    const p = game.player;
    const ca = Math.cos(p.angle);
    const sa = Math.sin(p.angle);
    let w = def.w;
    let h = def.h;
    // las piezas alargadas se colocan atravesadas a la dirección de la mira
    if (def.rotates && Math.abs(ca) > Math.abs(sa)) {
      w = def.h;
      h = def.w;
    }
    const dist = p.r + Math.max(w, h) / 2 + 14;
    const cx = p.x + ca * dist;
    const cy = p.y + sa * dist;
    const x = Math.round((cx - w / 2) / SNAP) * SNAP;
    const y = Math.round((cy - h / 2) / SNAP) * SNAP;
    // las estructuras se pueden encimar unas sobre otras (cada capa aguanta lo suyo);
    // sólo la torreta necesita su propio sitio
    let ok = game.world.rectFree(x, y, w, h, true);
    if (ok && !def.ground) {
      // no encima del jugador ni de un zombi
      const px = clamp(p.x, x, x + w);
      const py = clamp(p.y, y, y + h);
      if ((px - p.x) ** 2 + (py - p.y) ** 2 < p.r * p.r) ok = false;
      if (ok) {
        game.horde.grid.query(x - 50, y - 50, x + w + 50, y + h + 50, near);
        for (const z of near) {
          const zx = clamp(z.x, x, x + w);
          const zy = clamp(z.y, y, y + h);
          if ((zx - z.x) ** 2 + (zy - z.y) ** 2 < z.r * z.r) {
            ok = false;
            break;
          }
        }
      }
    }
    if (ok && !def.ground) {
      for (const b of this.blocks) {
        if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y && (def.turret || SHOP[b.kind].turret)) {
          ok = false;
          break;
        }
      }
    }
    return { x, y, w, h, ok };
  }

  // owner: de quién son las bajas de sus minas y torretas (en línea)
  /**
   * @param {import('../core/types.js').GameHost} game
   * @param {string} kind
   * @param {string | null} [owner]
   */
  place(game: import('../core/types.js').GameHost, kind: string, owner: string | null = null) {
    const pl = this.placement(game, kind);
    if (!pl.ok) return false;
    const def = SHOP[kind];
    if (def.ground) {
      this.wires.push({ kind, x: pl.x, y: pl.y, w: pl.w, h: pl.h, hp: def.hp, max: def.hp, hitT: 0, owner });
    } else {
      const o = {
        k: 0,
        x: pl.x,
        y: pl.y,
        w: pl.w,
        h: pl.h,
        low: true,
        block: true,
        kind,
        hp: def.hp,
        max: def.hp,
        hitT: 0,
        cd: 0,
        ang: game.player.angle,
        owner,
      };
      this.blocks.push(o);
      game.world.addDynamic(o);
      this.relayer();
    }
    game.particles.dust(pl.x + pl.w / 2, pl.y + pl.h / 2, 20);
    return true;
  }

  // Altura visual de cada pieza: cuántas piezas anteriores tiene debajo (sólo para dibujarla).
  relayer() {
    const list = this.blocks;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      let n = 0;
      for (let k = 0; k < i; k++) {
        const b = list[k];
        if (o.x < b.x + b.w && o.x + o.w > b.x && o.y < b.y + b.h && o.y + o.h > b.y)
          n = Math.max(n, (b.layer || 0) + 1);
      }
      o.layer = Math.min(n, 6);
    }
  }

  // La pieza de más arriba de la pila que incluye a o (los zombis rompen primero esa).
  topOf(o) {
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      if (b === o) return o;
      if (!SHOP[b.kind].turret && o.x < b.x + b.w && o.x + o.w > b.x && o.y < b.y + b.h && o.y + o.h > b.y) return b;
    }
    return o;
  }

  /**
   * @param {import('../core/types.js').GameHost} game
   * @param {any} o
   * @param {number} dmg
   */
  damageBlock(game: import('../core/types.js').GameHost, o: any, dmg: number) {
    if (o.hp <= 0) return;
    o = this.topOf(o);
    o.hp -= dmg;
    o.hitT = 0.12;
    game.particles.impact(
      o.x + o.w / 2 + rand(-o.w, o.w) * 0.3,
      o.y + o.h / 2 + rand(-o.h, o.h) * 0.3,
      rand(-1, 1),
      rand(-1, 1),
    );
    game.sfx.blockHit(o.kind);
    if (o.hp <= 0) {
      const i = this.blocks.indexOf(o);
      if (i >= 0) this.blocks.splice(i, 1);
      game.world.removeDynamic(o);
      this.relayer();
      game.particles.death(o.x + o.w / 2, o.y + o.h / 2, 18);
      game.sfx.blockBreak();
    }
  }

  // Llamado por cada zombi: devuelve el efecto de la trampa que pisa (o null).
  trapAt(z, dt, game) {
    for (let i = 0; i < this.wires.length; i++) {
      const w = this.wires[i];
      if (z.x + z.r * 0.5 < w.x || z.x - z.r * 0.5 > w.x + w.w || z.y + z.r * 0.5 < w.y || z.y - z.r * 0.5 > w.y + w.h)
        continue;
      if (w.kind === 'mine') {
        this.wires.splice(i, 1);
        this.explode(game, { x: w.x + w.w / 2, y: w.y + w.h / 2, owner: w.owner }, 115, 280);
        return null;
      }
      const spikes = w.kind === 'spikes';
      w.hp -= dt * (spikes ? 1.5 : 2.5) * Math.sqrt(z.mass);
      w.hitT = 0.1;
      if (w.hp <= 0) this.wires.splice(i, 1);
      return spikes ? TRAP_SPIKES : TRAP_WIRE;
    }
    return null;
  }

  /* ---------- granadas ---------- */

  throwGrenade(game, tx, ty, owner = null) {
    const p = game.player;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.min(Math.hypot(dx, dy) || 1, 300);
    const a = Math.atan2(dy, dx);
    const ex = p.x + Math.cos(a) * d;
    const ey = p.y + Math.sin(a) * d;
    const dur = 0.25 + d / 650;
    this.grenades.push({ sx: p.x, sy: p.y, ex, ey, x: p.x, y: p.y, h: 0, t: 0, dur, fuse: dur + 0.55, rot: 0, owner });
  }

  /* ---------- misil balístico (habilidad del Bomber) ---------- */

  // Cae del cielo donde apunta el jugador (como mucho a ABILITY.bomber.range de él).
  launchMissile(game, p, tx, ty, owner = null) {
    const M = ABILITY.bomber;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.min(Math.hypot(dx, dy), M.range);
    const a = Math.atan2(dy, dx);
    this.missiles.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, t: 0, dur: M.fall, owner });
    game.sfx.missile();
  }

  updateMissiles(dt, game) {
    const M = ABILITY.bomber;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.t += dt;
      if (m.t < m.dur) continue;
      this.missiles.splice(i, 1);
      this.explode(game, m, M.radius, M.power, 1.5);
      game.particles.ring(m.x, m.y, M.radius * 0.3, '255,190,120');
      game.camera.shake(0.9, m.x, m.y);
    }
  }

  // Los reventones de ácido se encolan: así una cadena de gordos no se pisa a sí misma.
  queueDeathBlast(kind, x, y) {
    this.pending.push({ kind, x, y, t: 0.06 });
  }

  /* ---------- cohetes clavados ---------- */

  // El cohete se queda clavado en la panza (gordo) o en la placa (super blindado) y estalla después.
  /**
   * @param {import('../core/types.js').GameHost} game
   * @param {import('../core/types.js').Zombie} z
   * @param {number} x
   * @param {number} y
   * @param {import('../core/types.js').Bullet} b
   */
  stickRocket(
    game: import('../core/types.js').GameHost,
    z: import('../core/types.js').Zombie,
    x: number,
    y: number,
    b: import('../core/types.js').Bullet,
  ) {
    const fat = z.type === 'fat';
    // posición relativa al cuerpo, en el sistema del zombi, para que se mueva con él
    const c = Math.cos(-z.angle);
    const s = Math.sin(-z.angle);
    const lx = x - z.x;
    const ly = y - z.y;
    this.stuck.push({
      z,
      kind: z.type,
      x,
      y,
      owner: b.owner || null,
      ox: (lx * c - ly * s) * 0.7,
      oy: (lx * s + ly * c) * 0.7,
      a: Math.atan2(b.dy, b.dx) - z.angle,
      t: 0,
      stick: fat ? ROCKET.fatStick : ROCKET.heavyStick,
      glow: fat ? ROCKET.fatGlow : 0,
    });
    game.sfx.rocketStick(fat);
    game.particles.impact(x, y, -b.dx, -b.dy);
  }

  updateStuck(dt, game) {
    for (let i = this.stuck.length - 1; i >= 0; i--) {
      const r = this.stuck[i];
      const z = r.z;
      r.t += dt;
      if (!z.dead) {
        const c = Math.cos(z.angle);
        const s = Math.sin(z.angle);
        r.x = z.x + r.ox * c - r.oy * s;
        r.y = z.y + r.ox * s + r.oy * c;
        r.ang = r.a + z.angle;
      }
      if (r.glow && r.t > r.stick && !r.beeped) {
        r.beeped = true;
        game.sfx.rocketArm();
      }
      // el gordo se hincha y tiembla a punto de reventar
      if (r.kind === 'fat' && !z.dead) z.swell = r.t > r.stick ? (r.t - r.stick) / r.glow : 0;
      if (r.t < r.stick + r.glow) continue;
      this.stuck.splice(i, 1);
      if (r.kind === 'fat') {
        // revienta brutalmente: carne y sangre por todos lados y todos salen volando
        const cx = z.x;
        const cy = z.y;
        z.lastOwner = r.owner;
        if (!z.dead) game.killZombie(z);
        game.particles.gore(cx, cy, ROCKET.fatRadius);
        for (let k = 0; k < 14; k++) {
          const a = rand(0, TAU);
          const d = rand(20, ROCKET.fatRadius * 0.8);
          game.decals.splat(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rand(8, 18));
        }
        game.sfx.gore();
        this.explode(game, { x: cx, y: cy, owner: r.owner }, ROCKET.fatRadius, ROCKET.fatPower, 1.5);
        game.camera.shake(0.9, cx, cy);
      } else {
        // super blindado: lo revienta de un solo tiro
        if (!z.dead) {
          z.lastOwner = r.owner;
          z.lastDx = Math.cos(r.ang || 0) * 3;
          z.lastDy = Math.sin(r.ang || 0) * 3;
          game.killZombie(z);
        }
        this.explode(game, r, ROCKET.radius, ROCKET.power, 1);
      }
    }
  }

  /* ---------- molotov ---------- */

  throwMolotov(game, tx, ty, owner = null) {
    this.throwGrenade(game, tx, ty, owner);
    const g = this.grenades[this.grenades.length - 1];
    g.kind = 'molotov';
    g.fuse = g.dur;
    game.sfx.throwBottle();
  }

  ignite(game, x, y, owner = null) {
    const R = MOLOTOV.radius;
    const flames = [];
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU);
      const d = Math.sqrt(Math.random()) * R * 0.85;
      flames.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.85, s: rand(0.7, 1.25), ph: rand(0, 10) });
    }
    this.fireId = (this.fireId || 0) + 1;
    this.fires.push({ id: this.fireId, x, y, r: R, t: 0, life: MOLOTOV.life, tick: 0, flames, owner });
    if (this.fires.length > 8) this.fires.shift();
    game.particles.shatter(x, y);
    game.sfx.molotov();
    game.camera.shake(0.12, x, y);
  }

  updateFires(dt, game) {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      if (f.t > f.life) {
        this.fires.splice(i, 1);
        this.scorches.push({ x: f.x, y: f.y, t: 0, life: 25, a: rand(0, TAU) });
        if (this.scorches.length > 20) this.scorches.shift();
        continue;
      }
      f.tick -= dt;
      if (f.tick > 0) continue;
      f.tick = 0.1;
      const R = f.r * Math.min(1, f.t * 4);
      game.horde.grid.query(f.x - R - 30, f.y - R - 30, f.x + R + 30, f.y + R + 30, near);
      for (const z of near) {
        if (z.dead) continue;
        const dx = z.x - f.x;
        const dy = z.y - f.y;
        if (dx * dx + dy * dy < (R + z.r * 0.5) ** 2) {
          z.burn = Math.max(z.burn, MOLOTOV.burn);
          z.lastOwner = f.owner || null;
        }
      }
      if (Math.random() < 0.5) game.sfx.crackle();
    }
  }

  acidBurst(game, x, y) {
    const R = ACID.radius;
    game.particles.acidBurst(x, y, R);
    game.decals.acid(x, y, R * 0.75);
    for (let i = 0; i < 4; i++) game.decals.acid(x + rand(-R, R) * 0.6, y + rand(-R, R) * 0.6, rand(14, 26));
    game.sfx.acid();
    game.camera.shake(0.2, x, y);
    for (const p of game.targets || [game.player]) if (Math.hypot(p.x - x, p.y - y) < R + p.r) game.applyAcid(p);
    game.mode.onAcid(x, y, R);
  }

  // fling > 0: la onda lanza a volar a los que sobreviven (cohetes de bazuca)
  // small: microexplosión (balas de la torreta pesada): mismo daño en área, efectos pequeños
  explode(game, g, R = BLAST_R, power = 330, fling = 0, small = false) {
    const { x, y } = g;
    game.horde.grid.query(x - R - 44, y - R - 44, x + R + 44, y + R + 44, near);
    for (const z of near) {
      if (z.dead) continue;
      const dx = z.x - x;
      const dy = z.y - y;
      const d = Math.hypot(dx, dy);
      if (d > R + z.r) continue;
      const f = clamp(1 - d / R, 0, 1);
      const n = d || 1;
      game.hitZombie(
        z,
        {
          dmg: power * (0.35 + 0.65 * f),
          dx: dx / n,
          dy: dy / n,
          knock: (120 + 260 * f) * (1 + fling),
          shot: null,
          blast: true,
          owner: g.owner,
        },
        z.x,
        z.y,
      );
      if (fling && !z.dead) {
        z.airV = Math.max(z.airV || 0, ((160 + 320 * f) * fling) / Math.sqrt(z.mass));
        z.air = z.air || 0.01;
        z.spinV = rand(-9, 9);
      }
      // los cuerpos salen despedidos lejos
      if (fling && z.dead) {
        z.lastDx = (dx / n) * (2 + 3 * f);
        z.lastDy = (dy / n) * (2 + 3 * f);
      }
    }
    if (small) {
      game.particles.miniBlast(x, y, R);
      game.sfx.miniBoom();
      return;
    }
    game.camera.shake(0.95, x, y);
    // cohete: bola de fuego corta y luego humo; granada: explosión clásica
    if (fling) game.particles.rocketImpact(x, y, R);
    else game.particles.explosion(x, y, R);
    game.sfx.explosion();
    this.blasts.push({ x, y, t: 0.4 });
    this.scorches.push({ x, y, t: 0, life: 25, a: rand(0, TAU) });
    if (this.scorches.length > 20) this.scorches.shift();
  }

  /**
   * @param {number} dt
   * @param {import('../core/types.js').GameHost} game
   */
  update(dt: number, game: import('../core/types.js').GameHost) {
    this.time = (this.time || 0) + dt;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.t += dt;
      const k = Math.min(1, g.t / g.dur);
      g.x = g.sx + (g.ex - g.sx) * k;
      g.y = g.sy + (g.ey - g.sy) * k;
      g.h = Math.sin(Math.PI * k) * (24 + g.dur * 30);
      if (k < 1) g.rot += dt * 14;
      if (g.t >= g.fuse) {
        this.grenades.splice(i, 1);
        if (g.kind === 'molotov') this.ignite(game, g.x, g.y, g.owner);
        else this.explode(game, g);
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const b = this.pending[i];
      b.t -= dt;
      if (b.t > 0) continue;
      this.pending.splice(i, 1);
      this.acidBurst(game, b.x, b.y);
    }
    this.updateFires(dt, game);
    this.updateMissiles(dt, game);
    this.updateStuck(dt, game);
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      this.blasts[i].t -= dt;
      if (this.blasts[i].t <= 0) this.blasts.splice(i, 1);
    }
    for (const s of this.scorches) s.t += dt;
    while (this.scorches.length && this.scorches[0].t > this.scorches[0].life) this.scorches.shift();
    for (const b of this.blocks) {
      b.hitT -= dt;
      if (b.kind === 'turret') this.updateTurret(b, dt, game);
    }
    for (const w of this.wires) w.hitT -= dt;
  }

  // Torreta: apunta al zombi más cercano dentro de su alcance y dispara sola.
  updateTurret(b, dt, game) {
    b.cd -= dt;
    b.flash = Math.max(0, (b.flash || 0) - dt);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    game.horde.grid.query(cx - TURRET_RANGE, cy - TURRET_RANGE, cx + TURRET_RANGE, cy + TURRET_RANGE, near);
    let best = null;
    let bd = TURRET_RANGE * TURRET_RANGE;
    for (const z of near) {
      if (z.dead) continue;
      const d = (z.x - cx) ** 2 + (z.y - cy) ** 2;
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    if (!best) return;
    const target = Math.atan2(best.y - cy, best.x - cx);
    let diff = target - b.ang;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    b.ang += Math.max(-dt * 9, Math.min(dt * 9, diff));
    if (b.cd > 0 || Math.abs(diff) > 0.25) return;
    b.cd = 0.16;
    b.flash = 0.05;
    const a = b.ang + rand(-0.04, 0.04);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    game.bullets.spawn(turretBullet(cx + ca * 20, cy + sa * 20, a, b.owner));
    // en línea: el servidor avisa del disparo y cada cliente lanza su propia bala de adorno
    if (game.onTurretShot) game.onTurretShot(cx + ca * 20, cy + sa * 20, a);
    game.particles.muzzleSmoke(cx + ca * 22, cy + sa * 22, a);
    game.sfx.turret();
  }

  /* ---------- dibujo ---------- */

  // La torreta pesada libre más cercana al alcance de p (o null).
  nearHeavy(p) {
    let best = null;
    let bd = HEAVY.reach + p.r;
    for (const b of this.blocks) {
      if (b.kind !== 'heavy' || b.manned) continue;
      const d = Math.hypot(b.x + b.w / 2 - p.x, b.y + b.h / 2 - p.y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  // Montar o dejar la torreta pesada (en solitario, en el anfitrión y en el servidor).
  mountHeavy(p, b) {
    p.manned = b;
    b.manned = p;
    p.reloadT = 0;
    p.target = null;
  }

  leaveHeavy(p) {
    if (p.manned && p.manned.manned === p) p.manned.manned = null;
    p.manned = null;
  }
}

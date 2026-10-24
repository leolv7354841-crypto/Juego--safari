// Barricadas compradas en la tienda (madera, metal, vallas, alambre) y granadas.
import { SHOP, MOLOTOV, ROCKET } from './config.js';
import { TAU, rand, clamp } from './util.js';
import { OUT, flameSprite } from './sprites.js';
import { drawRocket } from './bullets.js';

const SNAP = 20;
const TRAP_WIRE = { slow: 0.35, dps: 14 };
const TRAP_SPIKES = { slow: 0.5, dps: 45 };
const TURRET_RANGE = 340;
const BLAST_R = 140;
// Al morir, el gordo revienta en ácido verde.
export const ACID = { radius: 105, burn: 5, dps: 2 };
const near = [];

// Distancia al jugador más cercano (en línea, el servidor tiene varios en game.targets).
function nearestPlayer(game, x, y) {
  let best = Infinity;
  for (const p of game.targets || [game.player]) best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  return best;
}

export class Structures {
  constructor() {
    this.blocks = [];
    this.wires = [];
    this.grenades = [];
    this.blasts = [];
    this.scorches = [];
    this.pending = [];
    this.fires = [];
    this.stuck = [];
  }

  clear() {
    this.pending.length = 0;
    this.fires.length = 0;
    this.stuck.length = 0;
    this.blocks.length = 0;
    this.wires.length = 0;
    this.grenades.length = 0;
    this.blasts.length = 0;
    this.scorches.length = 0;
  }

  /* ---------- construcción ---------- */

  // Dónde caería el bloque: delante del jugador, alineado a una rejilla de 20 px.
  placement(game, kind) {
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
        if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y && (def.turret || b.kind === 'turret')) {
          ok = false;
          break;
        }
      }
    }
    return { x, y, w, h, ok };
  }

  // owner: de quién son las bajas de sus minas y torretas (en línea)
  place(game, kind, owner = null) {
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
      if (b.kind !== 'turret' && o.x < b.x + b.w && o.x + o.w > b.x && o.y < b.y + b.h && o.y + o.h > b.y) return b;
    }
    return o;
  }

  damageBlock(game, o, dmg) {
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

  // Los reventones de ácido se encolan: así una cadena de gordos no se pisa a sí misma.
  queueDeathBlast(kind, x, y) {
    this.pending.push({ kind, x, y, t: 0.06 });
  }

  /* ---------- cohetes clavados ---------- */

  // El cohete se queda clavado en la panza (gordo) o en la placa (super blindado) y estalla después.
  stickRocket(game, z, x, y, b) {
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
        game.camera.shake(0.9);
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

  drawStuck(ctx, time) {
    for (const r of this.stuck) {
      const glowing = r.glow && r.t > r.stick;
      if (glowing) {
        // brillo verde que pulsa cada vez más rápido antes de estallar
        const k = (r.t - r.stick) / r.glow;
        const pulse = 0.55 + 0.45 * Math.abs(Math.sin(time * (10 + k * 30)));
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (0.35 + 0.5 * k) * pulse;
        const g = ctx.createRadialGradient(r.x, r.y, 2, r.x, r.y, 30 + k * 30);
        g.addColorStop(0, 'rgba(255,250,170,1)');
        g.addColorStop(0.5, 'rgba(255,200,40,0.65)');
        g.addColorStop(1, 'rgba(230,140,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 30 + k * 30, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      // sólo asoma la cola del cohete: la ojiva está dentro
      drawRocket(ctx, r.x - Math.cos(r.ang || 0) * 6, r.y - Math.sin(r.ang || 0) * 6, r.ang || 0, false);
      if (glowing) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,230,90,0.9)';
        ctx.beginPath();
        ctx.arc(r.x, r.y, 4, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
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
    game.camera.shake(0.12);
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

  drawFires(ctx, v, time) {
    if (!this.fires.length) return;
    const fl = flameSprite();
    for (const f of this.fires) {
      if (f.x + f.r < v.x0 || f.x - f.r > v.x1 || f.y + f.r < v.y0 || f.y - f.r > v.y1) continue;
      const grow = Math.min(1, f.t * 4);
      const fade = Math.min(1, (f.life - f.t) / 1.2);
      // charco encendido en el suelo
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * fade;
      const g = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.r * grow);
      g.addColorStop(0, 'rgba(255,170,60,0.9)');
      g.addColorStop(0.6, 'rgba(220,80,20,0.5)');
      g.addColorStop(1, 'rgba(160,40,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * grow, 0, TAU);
      ctx.fill();
      // lenguas de fuego que bailan
      for (const q of f.flames) {
        const fx = f.x + (q.x - f.x) * grow;
        const fy = f.y + (q.y - f.y) * grow;
        const flick = 0.8 + 0.25 * Math.sin(time * 11 + q.ph) + 0.12 * Math.sin(time * 23 + q.ph * 2);
        const w = 20 * q.s * flick * fade;
        const h = w * (1.5 + 0.3 * Math.sin(time * 7 + q.ph));
        ctx.globalAlpha = 0.85 * fade;
        ctx.drawImage(fl, fx - w / 2, fy - h * 0.85, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  acidBurst(game, x, y) {
    const R = ACID.radius;
    game.particles.acidBurst(x, y, R);
    game.decals.acid(x, y, R * 0.75);
    for (let i = 0; i < 4; i++) game.decals.acid(x + rand(-R, R) * 0.6, y + rand(-R, R) * 0.6, rand(14, 26));
    game.sfx.acid();
    game.camera.shake(0.2 * clamp(1 - nearestPlayer(game, x, y) / 500, 0, 1));
    for (const p of game.targets || [game.player]) if (Math.hypot(p.x - x, p.y - y) < R + p.r) game.applyAcid(p);
    if (game.coop && game.coop.isHost) game.coop.acidAt(x, y, R);
  }

  // fling > 0: la onda lanza a volar a los que sobreviven (cohetes de bazuca)
  explode(game, g, R = BLAST_R, power = 330, fling = 0) {
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
    game.camera.shake(0.45 + 0.5 * clamp(1 - nearestPlayer(game, x, y) / 600, 0, 1));
    // cohete: bola de fuego corta y luego humo; granada: explosión clásica
    if (fling) game.particles.rocketImpact(x, y, R);
    else game.particles.explosion(x, y, R);
    game.sfx.explosion();
    this.blasts.push({ x, y, t: 0.4 });
    this.scorches.push({ x, y, t: 0, life: 25, a: rand(0, TAU) });
    if (this.scorches.length > 20) this.scorches.shift();
  }

  update(dt, game) {
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
    game.bullets.spawn({
      x: cx + ca * 20,
      y: cy + sa * 20,
      dx: ca,
      dy: sa,
      speed: 1100,
      life: TURRET_RANGE + 40,
      dmg: 34,
      pierce: 1,
      knock: 40,
      shot: null,
      hits: null,
      owner: b.owner,
    });
    game.particles.muzzleSmoke(cx + ca * 22, cy + sa * 22, a);
    game.sfx.turret();
  }

  /* ---------- dibujo ---------- */

  drawGround(ctx, v) {
    for (const s of this.scorches) {
      if (s.x < v.x0 - 80 || s.x > v.x1 + 80 || s.y < v.y0 - 80 || s.y > v.y1 + 80) continue;
      ctx.globalAlpha = Math.min(1, (s.life - s.t) / 5) * 0.55;
      ctx.fillStyle = '#0d0c0a';
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = s.a + (i / 12) * TAU;
        const r = 52 + Math.sin(i * 2.7 + s.a) * 12;
        ctx.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const w of this.wires) {
      if (w.x > v.x1 || w.x + w.w < v.x0 || w.y > v.y1 || w.y + w.h < v.y0) continue;
      if (w.kind === 'spikes') drawSpikes(ctx, w);
      else if (w.kind === 'mine') drawMine(ctx, w, this.time || 0);
      else drawWire(ctx, w);
    }
  }

  drawBlocks(ctx, v) {
    for (const b of this.blocks) {
      if (b.x > v.x1 || b.x + b.w < v.x0 || b.y > v.y1 || b.y + b.h < v.y0) continue;
      if (b.layer) {
        // pieza encimada: un poco más arriba, con sombra sobre la de abajo
        const up = b.layer * 4;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(b.x + 2, b.y + 3 - up + 4, b.w, b.h);
        ctx.save();
        ctx.translate(0, -up);
        drawBlock(ctx, b);
        ctx.restore();
      } else drawBlock(ctx, b);
    }
  }

  drawGhost(ctx, game, kind, time) {
    const pl = this.placement(game, kind);
    const pulse = 0.55 + Math.sin(time * 6) * 0.15;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = pl.ok ? 'rgba(134,168,146,0.25)' : 'rgba(181,70,58,0.25)';
    ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
    ctx.strokeStyle = pl.ok ? '#86a892' : '#b5463a';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(pl.x + 1, pl.y + 1, pl.w - 2, pl.h - 2);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  drawGrenades(ctx) {
    for (const g of this.grenades) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(g.x + 2, g.y + 3, 6, 4, 0, 0, TAU);
      ctx.fill();
      const s = 1 + g.h / 60;
      ctx.save();
      ctx.translate(g.x, g.y - g.h);
      ctx.rotate(g.rot);
      ctx.scale(s, s);
      if (g.kind === 'molotov') {
        drawBottle(ctx);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = '#4a5a34';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 5, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = OUT;
      ctx.stroke();
      ctx.fillStyle = '#8a8a84';
      ctx.fillRect(4, -2, 4, 4);
      ctx.restore();
      if (g.t > g.dur && Math.sin(g.t * 30) > 0) {
        ctx.fillStyle = '#ff6a40';
        ctx.beginPath();
        ctx.arc(g.x, g.y, 2.2, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawBars(ctx, v) {
    for (const b of this.blocks) {
      if (b.x > v.x1 || b.x + b.w < v.x0 || b.y > v.y1 || b.y + b.h < v.y0) continue;
      const up = (b.layer || 0) * 4;
      if (b.layer && this.topOf(b) === b) {
        // cuántas piezas hay apiladas
        ctx.font = '700 9px sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(b.x + b.w - 15, b.y - up - 1, 16, 11);
        ctx.fillStyle = '#e6e0d2';
        ctx.fillText(`x${b.layer + 1}`, b.x + b.w - 13, b.y - up + 8);
      }
      if (b.hp >= b.max) continue;
      const w = Math.max(28, b.w * 0.8);
      const x = b.x + b.w / 2 - w / 2;
      const y = b.y - 9 - up;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = '#c7a24a';
      ctx.fillRect(x, y, w * (b.hp / b.max), 3);
    }
  }
}

function drawBlock(ctx, b) {
  const { x, y, w, h } = b;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x + 5, y + 6, w, h);
  if (b.kind === 'wood') {
    ctx.fillStyle = '#7a5634';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(40,25,12,0.6)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + (h * i) / 4);
      ctx.lineTo(x + w, y + (h * i) / 4);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,220,170,0.1)';
    ctx.fillRect(x, y, w, 3);
    ctx.strokeStyle = '#5a3c22';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + w - 4, y + h - 4);
    ctx.stroke();
    ctx.fillStyle = '#b8b2a4';
    for (const [nx, ny] of [
      [5, 5],
      [w - 5, 5],
      [5, h - 5],
      [w - 5, h - 5],
    ])
      ctx.fillRect(x + nx - 1, y + ny - 1, 2.5, 2.5);
  } else if (b.kind === 'metal') {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#8a8f93');
    g.addColorStop(1, '#5c6166');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(30,32,34,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
    ctx.strokeStyle = 'rgba(220,225,230,0.25)';
    ctx.beginPath();
    ctx.moveTo(x + 6, y + h - 6);
    ctx.lineTo(x + w - 6, y + 6);
    ctx.stroke();
    ctx.fillStyle = '#3d4044';
    for (const [nx, ny] of [
      [4, 4],
      [w - 4, 4],
      [4, h - 4],
      [w - 4, h - 4],
    ]) {
      ctx.beginPath();
      ctx.arc(x + nx, y + ny, 2, 0, TAU);
      ctx.fill();
    }
  } else if (b.kind === 'sandbag') {
    const horiz = w > h;
    const n = Math.round((horiz ? w : h) / 20);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < n; i++) {
        const off = row ? 10 : 0;
        const along = Math.min((horiz ? w : h) - 10, 10 + i * 20 + off);
        const across = (horiz ? h : w) * (row ? 0.68 : 0.32);
        const cx = horiz ? x + along : x + across;
        const cy = horiz ? y + across : y + along;
        ctx.fillStyle = (i + row) % 2 ? '#8a7d5c' : '#7f7354';
        ctx.beginPath();
        ctx.ellipse(cx, cy, horiz ? 10.5 : w * 0.3, horiz ? h * 0.3 : 10.5, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  } else if (b.kind === 'concrete') {
    ctx.fillStyle = '#8c8a84';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#a3a19a';
    if (w > h) ctx.fillRect(x, y + 3, w, h * 0.35);
    else ctx.fillRect(x + 3, y, w * 0.35, h);
    ctx.fillStyle = 'rgba(40,38,34,0.35)';
    for (let i = 0; i < 6; i++) ctx.fillRect(x + ((i * 37) % w), y + ((i * 13) % h), 3, 3);
    ctx.fillStyle = 'rgba(199,162,74,0.8)';
    if (w > h) {
      ctx.fillRect(x + 6, y + h - 6, 10, 3);
      ctx.fillRect(x + w - 16, y + h - 6, 10, 3);
    } else {
      ctx.fillRect(x + w - 6, y + 6, 3, 10);
      ctx.fillRect(x + w - 6, y + h - 16, 3, 10);
    }
  } else if (b.kind === 'turret') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.fillStyle = '#3d4246';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#c7a24a';
    ctx.fillRect(x + 2, y + 2, 6, 6);
    ctx.fillRect(x + w - 8, y + h - 8, 6, 6);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(b.ang || 0);
    ctx.fillStyle = '#1e2124';
    ctx.fillRect(4, -2.5, 20, 5);
    ctx.fillStyle = '#5c6268';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.fillStyle = '#b5463a';
    ctx.fillRect(2, -2, 4, 4);
    if (b.flash > 0) {
      ctx.fillStyle = 'rgba(255,214,140,0.95)';
      ctx.beginPath();
      ctx.arc(26, 0, 5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  } else {
    ctx.fillStyle = '#3c4146';
    ctx.fillRect(x, y, w, h);
    const horiz = w > h;
    ctx.strokeStyle = 'rgba(150,158,165,0.65)';
    ctx.lineWidth = 1.2;
    const L = horiz ? w : h;
    const S = horiz ? h : w;
    for (let i = -S; i < L; i += 8) {
      ctx.beginPath();
      if (horiz) {
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i + S, y + h);
        ctx.moveTo(x + i + S, y);
        ctx.lineTo(x + i, y + h);
      } else {
        ctx.moveTo(x, y + i);
        ctx.lineTo(x + w, y + i + S);
        ctx.moveTo(x, y + i + S);
        ctx.lineTo(x + w, y + i);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#25282b';
    if (horiz) {
      ctx.fillRect(x, y, 8, h);
      ctx.fillRect(x + w - 8, y, 8, h);
      ctx.fillRect(x + w / 2 - 3, y, 6, h);
    } else {
      ctx.fillRect(x, y, w, 8);
      ctx.fillRect(x, y + h - 8, w, 8);
      ctx.fillRect(x, y + h / 2 - 3, w, 6);
    }
    ctx.fillStyle = '#c7a24a';
    for (let i = 0; i < 2; i++) {
      if (horiz) ctx.fillRect(x + (i ? w - 8 : 0), y + 2, 8, 4);
      else ctx.fillRect(x + 2, y + (i ? h - 8 : 0), 4, 8);
    }
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUT;
  ctx.strokeRect(x, y, w, h);
  const dmg = 1 - b.hp / b.max;
  if (dmg > 0.35) {
    ctx.strokeStyle = 'rgba(15,12,10,0.75)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + h * 0.1);
    ctx.lineTo(x + w * 0.45, y + h * 0.5);
    ctx.lineTo(x + w * 0.3, y + h * 0.9);
    if (dmg > 0.65) {
      ctx.moveTo(x + w * 0.8, y + h * 0.15);
      ctx.lineTo(x + w * 0.55, y + h * 0.55);
      ctx.lineTo(x + w * 0.85, y + h * 0.85);
    }
    ctx.stroke();
  }
  if (b.hitT > 0) {
    ctx.fillStyle = 'rgba(255,240,220,0.35)';
    ctx.fillRect(x, y, w, h);
  }
}

function drawSpikes(ctx, w) {
  const { x, y } = w;
  ctx.globalAlpha = 0.55 + 0.45 * (w.hp / w.max);
  ctx.fillStyle = '#4a4740';
  ctx.fillRect(x, y, w.w, w.h);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w.w, w.h);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const px = x + 6 + i * ((w.w - 12) / 3);
      const py = y + 6 + j * ((w.h - 12) / 3);
      ctx.fillStyle = w.hitT > 0 ? '#e6e0d2' : '#b8b2a4';
      ctx.beginPath();
      ctx.moveTo(px, py - 4);
      ctx.lineTo(px + 3, py + 3);
      ctx.lineTo(px - 3, py + 3);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawMine(ctx, w, time) {
  const cx = w.x + w.w / 2;
  const cy = w.y + w.h / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, 10, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#4a5236';
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.fillStyle = '#6a7050';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = Math.sin(time * 6 + cx) > 0 ? '#ff5a3a' : '#5a2a20';
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, TAU);
  ctx.fill();
}

function drawWire(ctx, w) {
  const { x, y } = w;
  const horiz = w.w > w.h;
  const L = horiz ? w.w : w.h;
  const S = horiz ? w.h : w.w;
  ctx.globalAlpha = 0.5 + 0.5 * (w.hp / w.max);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y, w.w, w.h);
  ctx.strokeStyle = w.hitT > 0 ? '#e6e0d2' : '#9a9a92';
  ctx.lineWidth = 1.4;
  for (const off of [0.3, 0.7]) {
    ctx.beginPath();
    for (let t = 0; t <= L; t += 6) {
      const wave = Math.sin(t * 0.55 + off * 9) * S * 0.18;
      const px = horiz ? x + t : x + S * off + wave;
      const py = horiz ? y + S * off + wave : y + t;
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = '#c9c4b6';
  ctx.lineWidth = 1;
  for (let t = 4; t < L; t += 10) {
    const px = horiz ? x + t : x + S * 0.5;
    const py = horiz ? y + S * 0.5 : y + t;
    ctx.beginPath();
    ctx.moveTo(px - 3, py - 3);
    ctx.lineTo(px + 3, py + 3);
    ctx.moveTo(px + 3, py - 3);
    ctx.lineTo(px - 3, py + 3);
    ctx.stroke();
  }
  ctx.fillStyle = '#4a3a2a';
  if (horiz) {
    ctx.fillRect(x, y + S / 2 - 3, 5, 6);
    ctx.fillRect(x + w.w - 5, y + S / 2 - 3, 5, 6);
  } else {
    ctx.fillRect(x + S / 2 - 3, y, 6, 5);
    ctx.fillRect(x + S / 2 - 3, y + w.h - 5, 6, 5);
  }
  ctx.globalAlpha = 1;
}

// Botella de molotov con trapo encendido (dibujada en el origen, apuntando a +x).
export function drawBottle(ctx, lit = true) {
  ctx.fillStyle = 'rgba(120,150,90,0.9)';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 6, 4, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(200,120,40,0.8)';
  ctx.beginPath();
  ctx.ellipse(-2, 0.5, 4, 2.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,150,90,0.95)';
  ctx.fillRect(4, -1.6, 4, 3.2);
  ctx.strokeRect(4, -1.6, 4, 3.2);
  ctx.fillStyle = '#d8ccb0';
  ctx.fillRect(8, -1.2, 3, 2.4);
  if (lit) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,170,60,0.9)';
    ctx.beginPath();
    ctx.arc(11.5, 0, 2.6 + Math.random() * 1.4, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}

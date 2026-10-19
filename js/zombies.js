import { ZOMBIES, WORLD_SIZE } from './config.js';
import { clamp, rand, randInt, angleTo, TAU } from './util.js';
import { zombieSprites } from './sprites.js';

const CELL = 64;

// Rejilla espacial: cada zombi se guarda en la celda de su centro.
export class Grid {
  constructor(size, cell) {
    this.cell = cell;
    this.n = Math.ceil(size / cell);
    this.cells = Array.from({ length: this.n * this.n }, () => []);
    this.used = [];
  }
  clear() {
    for (const i of this.used) this.cells[i].length = 0;
    this.used.length = 0;
  }
  insert(o) {
    const n = this.n;
    const i = clamp((o.x / this.cell) | 0, 0, n - 1);
    const j = clamp((o.y / this.cell) | 0, 0, n - 1);
    const idx = j * n + i;
    const c = this.cells[idx];
    if (c.length === 0) this.used.push(idx);
    c.push(o);
  }
  query(x0, y0, x1, y1, out) {
    out.length = 0;
    const n = this.n;
    const i0 = clamp((x0 / this.cell) | 0, 0, n - 1);
    const j0 = clamp((y0 / this.cell) | 0, 0, n - 1);
    const i1 = clamp((x1 / this.cell) | 0, 0, n - 1);
    const j1 = clamp((y1 / this.cell) | 0, 0, n - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = this.cells[j * n + i];
        for (let k = 0; k < c.length; k++) out.push(c[k]);
      }
    }
    return out;
  }
}

let nextId = 1;
const tmpDir = { x: 0, y: 0 };
const near = [];

export class Horde {
  constructor() {
    this.list = [];
    this.grid = new Grid(WORLD_SIZE, CELL);
    this.sprites = zombieSprites();
  }

  spawn(type, x, y, hpMult = 1, speedMult = 1) {
    const def = ZOMBIES[type];
    const sets = this.sprites[type];
    const z = {
      id: nextId++,
      type,
      def,
      x,
      y,
      r: def.radius,
      mass: def.mass,
      hp: def.hp * hpMult,
      maxHp: def.hp * hpMult,
      speed: rand(def.speed[0], def.speed[1]) * speedMult,
      angle: rand(0, TAU),
      anim: rand(0, def.frames),
      spr: sets[randInt(0, sets.length - 1)],
      flash: 0,
      slow: 0,
      atk: 0,
      inRange: false,
      kx: 0,
      ky: 0,
      lunge: 0,
      wob: rand(0, 100),
      dead: false,
      spawnT: 0.6,
      lastStep: 0,
    };
    this.list.push(z);
    return z;
  }

  findTarget(x, y, range, current) {
    let best = null;
    let bd = range * range;
    for (const z of this.list) {
      if (z.dead) continue;
      const d = (z.x - x) ** 2 + (z.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    // mantener el objetivo actual si sigue cerca para que la mira no salte
    if (current && !current.dead && best && current !== best) {
      const dc = (current.x - x) ** 2 + (current.y - y) ** 2;
      if (dc < range * range && dc < bd * 1.6) return current;
    }
    return best;
  }

  update(dt, game) {
    const p = game.player;
    const world = game.world;
    const time = game.time;
    const list = this.list;

    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      const def = z.def;
      z.flash -= dt;
      z.slow -= dt;
      z.lunge = Math.max(0, z.lunge - dt * 4);
      z.spawnT = Math.max(0, z.spawnT - dt);
      const dx = p.x - z.x;
      const dy = p.y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      let mx;
      let my;
      if (d < 170 || !p.alive) {
        mx = dx / d;
        my = dy / d;
      } else {
        const f = world.flowDir(z.x, z.y, tmpDir);
        if (f) {
          mx = f.x;
          my = f.y;
        } else {
          mx = dx / d;
          my = dy / d;
        }
      }
      // andar tambaleante, típico de un caminante
      const wob = Math.sin(time * 1.6 + z.wob) * (z.type === 'giant' ? 0.12 : 0.38);
      const wx = mx - my * wob;
      const wy = my + mx * wob;
      const wl = Math.hypot(wx, wy) || 1;
      mx = wx / wl;
      my = wy / wl;

      const reach = z.r + p.r + def.reach;
      const inRange = d < reach && p.alive;
      z.angle = angleTo(z.angle, Math.atan2(inRange ? dy : my, inRange ? dx : mx), def.turn * dt);
      let sp = z.speed * (z.slow > 0 ? 0.35 : 1);
      if (inRange) sp *= 0.15;
      z.x += mx * sp * dt + z.kx * dt;
      z.y += my * sp * dt + z.ky * dt;
      const kd = Math.exp(-dt * 7);
      z.kx *= kd;
      z.ky *= kd;
      z.anim += (sp * dt) / (z.r * 0.55);

      if (z.type === 'giant') {
        const step = Math.floor((z.anim * 2) / def.frames);
        if (step !== z.lastStep) {
          z.lastStep = step;
          game.onGiantStep(z);
        }
      }

      if (inRange) {
        if (!z.inRange) {
          z.inRange = true;
          z.atk = 0.35;
        }
        z.atk -= dt;
        if (z.atk <= 0) {
          z.atk = 1 / def.attackRate;
          z.lunge = 1;
          p.hurt(def.damage, game);
          p.kx += (dx / d) * 40 * Math.sqrt(z.mass);
          p.ky += (dy / d) * 40 * Math.sqrt(z.mass);
        }
      } else {
        z.inRange = false;
      }
    }

    // separación entre zombis y contra el jugador
    const grid = this.grid;
    grid.clear();
    for (const z of list) grid.insert(z);
    for (const z of list) {
      const q = z.r + 44;
      grid.query(z.x - q, z.y - q, z.x + q, z.y + q, near);
      for (let k = 0; k < near.length; k++) {
        const o = near[k];
        if (o.id <= z.id) continue;
        const dx = o.x - z.x;
        const dy = o.y - z.y;
        const rr = z.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.01;
        const ov = (rr - d) * 0.8;
        const nx = dx / d;
        const ny = dy / d;
        const tm = z.mass + o.mass;
        z.x -= nx * ov * (o.mass / tm);
        z.y -= ny * ov * (o.mass / tm);
        o.x += nx * ov * (z.mass / tm);
        o.y += ny * ov * (z.mass / tm);
      }
      if (p.alive) {
        const dx = p.x - z.x;
        const dy = p.y - z.y;
        const rr = z.r + p.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.01;
          const ov = rr - d;
          const nx = dx / d;
          const ny = dy / d;
          const tm = z.mass + p.mass;
          z.x -= nx * ov * (p.mass / tm);
          z.y -= ny * ov * (p.mass / tm);
          p.x += nx * ov * (z.mass / tm);
          p.y += ny * ov * (z.mass / tm);
        }
      }
      world.collide(z, z.r);
      z.x = clamp(z.x, 30, WORLD_SIZE - 30);
      z.y = clamp(z.y, 30, WORLD_SIZE - 30);
    }
    if (p.alive) world.collide(p, p.r);
    grid.clear();
    for (const z of list) grid.insert(z);
  }

  removeDead() {
    const list = this.list;
    let w = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].dead) list[w++] = list[i];
    list.length = w;
  }

  draw(ctx, view, base, layer) {
    // base = { z, tx, ty }: transformación cámara → pantalla
    const { z: s, tx, ty } = base;
    for (const z of this.list) {
      const isGiant = z.type === 'giant';
      if ((layer === 'giant') !== isGiant) continue;
      const half = z.spr.half;
      if (z.x + half < view.x0 || z.x - half > view.x1 || z.y + half < view.y0 || z.y - half > view.y1) continue;
      const frames = z.flash > 0 ? z.spr.flash : z.spr.frames;
      const f = ((z.anim | 0) % frames.length + frames.length) % frames.length;
      const img = frames[f];
      const c = Math.cos(z.angle);
      const sn = Math.sin(z.angle);
      const pop = z.flash > 0 ? 1.06 : 1;
      const grow = z.spawnT > 0 ? 1 - z.spawnT * 0.5 : 1;
      const k = s * pop * grow;
      const lx = z.x + c * z.lunge * 5;
      const ly = z.y + sn * z.lunge * 5;
      ctx.globalAlpha = z.spawnT > 0 ? 1 - z.spawnT : 1;
      ctx.setTransform(k * c, k * sn, -k * sn, k * c, tx + lx * s, ty + ly * s);
      ctx.drawImage(img, -half, -half, half * 2, half * 2);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(s, 0, 0, s, tx, ty);
  }
}

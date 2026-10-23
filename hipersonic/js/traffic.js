// Tráfico: coches y camiones circulan por sus carriles, respetan los semáforos y frenan
// ante obstáculos. Al recibir un golpe fuerte se vuelven cuerpos libres: derrapan, giran,
// chocan entre sí, se abollan y echan humo.
import { TAU, clamp, rand, pick, segDist } from './util.js';
import { MODELS, CAR_COLORS, TRAFFIC_MIX, bakeVehicle, bakeUnderside, bakeBurnt } from './art/vehicles.js';
import { drawSprite } from './atlas.js';
import { LANE, ROAD, SIZE, NB, roadC, CELL, SUN } from './world.js';

const STOP_BACK = ROAD / 2 + 50;

export class Vehicle {
  constructor(atlas, model, color, x, y, ang) {
    this.model = model;
    this.m = MODELS[model];
    this.color = color;
    this.spr = bakeVehicle(atlas, model, color, (Math.random() * 1e6) | 0);
    this.x = x;
    this.y = y;
    this.ang = ang;
    this.speed = 0;
    this.vx = 0;
    this.vy = 0;
    this.va = 0;
    this.state = 'drive';
    this.lane = null;
    this.vmax = this.m.kind === 'bus' || this.m.kind === 'truck' ? rand(120, 160) : rand(160, 235);
    this.hp = 100 * this.m.weight;
    this.dents = [];
    this.glass = 0;
    this.smoke = 0;
    this.honkT = 0;
    this.blockedT = 0;
    this.brake = 0;
    this.pending = null;
    this.lastHit = -10;
    this.flash = 0;
    this.siren = model === 'police' && Math.random() < 0.6;
    this.atlas = atlas;
    // altura, vuelco (giro sobre el eje largo), explosión
    this.z = 0;
    this.vz = 0;
    this.roll = 0;
    this.vroll = 0;
    this.fuse = 0;
    this.fire = 0;
    this.exploded = false;
  }

  // Explota: queda calcinado y ardiendo un rato.
  burn() {
    this.exploded = true;
    this.spr = bakeBurnt(this.atlas, this.spr);
    this.hp = Math.min(this.hp, -1);
    this.fire = rand(8, 14);
    this.glass = 3;
    this.siren = false;
  }

  // Sale volando y da vueltas.
  launch(vz, vroll) {
    if (this.state !== 'wreck') this.impulse(0, 0, this.x, this.y, 0);
    this.vz = Math.max(this.vz, 0) + vz / Math.sqrt(this.m.weight);
    this.vroll += vroll / Math.sqrt(this.m.weight);
  }

  get L() {
    return this.m.L;
  }
  get W() {
    return this.m.W;
  }
  // Segmento central de la "cápsula" que aproxima la carrocería.
  seg() {
    const h = this.m.L / 2 - this.m.W / 2;
    const c = Math.cos(this.ang);
    const s = Math.sin(this.ang);
    return [this.x - c * h, this.y - s * h, this.x + c * h, this.y + s * h, this.m.W / 2];
  }
  // Distancia de un punto a la carrocería (negativa = dentro).
  distTo(px, py) {
    const [ax, ay, bx, by, r] = this.seg();
    const q = segDist(px, py, ax, ay, bx, by);
    return { d: q.d - r, nx: (px - q.cx) / (q.d || 1), ny: (py - q.cy) / (q.d || 1), cx: q.cx, cy: q.cy };
  }

  // Se convierte en cuerpo libre con un impulso aplicado en (px, py).
  impulse(ix, iy, px, py, dmg) {
    if (this.state !== 'wreck') {
      this.vx = Math.cos(this.ang) * this.speed;
      this.vy = Math.sin(this.ang) * this.speed;
      this.state = 'wreck';
      this.lane = null;
    }
    const w = this.m.weight;
    this.vx += ix / w;
    this.vy += iy / w;
    // giro según dónde pegó el golpe respecto al centro
    const rx = px - this.x;
    const ry = py - this.y;
    this.va += ((rx * iy - ry * ix) / (w * 900)) * 1.4;
    this.va = clamp(this.va, -14, 14);
    this.hp -= dmg;
    this.flash = 0.12;
    // abolladura en coordenadas locales
    const c = Math.cos(-this.ang);
    const s = Math.sin(-this.ang);
    const lx = clamp(rx * c - ry * s, -this.m.L / 2 + 4, this.m.L / 2 - 4);
    const ly = clamp(rx * s + ry * c, -this.m.W / 2 + 3, this.m.W / 2 - 3);
    if (this.dents.length < 8) this.dents.push({ x: lx, y: ly, r: clamp(dmg * 0.18, 4, 13) });
    if (dmg > 30) this.glass = Math.min(3, this.glass + 1);
  }
}

export class Traffic {
  constructor(atlas, world) {
    this.atlas = atlas;
    this.world = world;
    this.list = [];
    this.lanes = [];
    this.spawnT = 0;
    for (let k = 0; k <= NB; k++) {
      const c = roadC(k);
      for (const [off, dir] of [[LANE / 2, 1], [LANE * 1.5, 1], [-LANE / 2, -1], [-LANE * 1.5, -1]]) this.lanes.push({ axis: 'h', dir, pos: c + off, cars: [] });
      for (const [off, dir] of [[-LANE / 2, 1], [-LANE * 1.5, 1], [LANE / 2, -1], [LANE * 1.5, -1]]) this.lanes.push({ axis: 'v', dir, pos: c + off, cars: [] });
    }
    // coches estacionados en los estacionamientos
    for (const sp of world.parkSpots) {
      if (!sp.filled) continue;
      const model = pick(['sedan', 'hatch', 'suv', 'sedan', 'pickup', 'van', 'hatch']);
      const v = new Vehicle(atlas, model, pick(CAR_COLORS), sp.x, sp.y, sp.ang + (Math.random() < 0.5 ? Math.PI : 0) + rand(-0.06, 0.06));
      v.state = 'parked';
      this.list.push(v);
    }
  }

  laneAng(l) {
    return l.axis === 'h' ? (l.dir > 0 ? 0 : Math.PI) : l.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  // anywhere: al empezar se reparte el tráfico también dentro de la vista
  spawn(cx, cy, view, anywhere) {
    const lanes = this.lanes.filter((l) => Math.abs(l.pos - (l.axis === 'h' ? cy : cx)) < 1300);
    if (!lanes.length) return;
    const l = pick(lanes);
    const along = l.axis === 'h' ? cx : cy;
    // aparece fuera de la pantalla, del lado del que viene
    const s = anywhere ? along + rand(-1300, 1300) : along - l.dir * rand(900, 1400);
    if (s < 40 || s > SIZE - 40) return;
    // no en medio de un cruce
    const k = ((s % CELL) + CELL) % CELL;
    if (k < ROAD + 60) return;
    for (const o of l.cars) if (Math.abs(o.s - s) < 160) return;
    const x = l.axis === 'h' ? s : l.pos;
    const y = l.axis === 'h' ? l.pos : s;
    if (!anywhere && x > view.x0 - 150 && x < view.x1 + 150 && y > view.y0 - 150 && y < view.y1 + 150) return;
    const model = pick(TRAFFIC_MIX);
    const color = MODELS[model].color || pick(CAR_COLORS);
    const v = new Vehicle(this.atlas, model, color, x, y, this.laneAng(l));
    v.lane = l;
    v.s = s;
    v.speed = v.vmax * 0.8;
    l.cars.push(v);
    this.list.push(v);
  }

  update(dt, game) {
    if (dt <= 0) return;
    const hero = game.hero;
    const cam = game.camera;
    const world = this.world;
    // población alrededor de la cámara
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.2;
      let near = 0;
      for (const v of this.list) if (v.state === 'drive' && Math.abs(v.x - cam.x) < 1500 && Math.abs(v.y - cam.y) < 1500) near++;
      for (let i = 0; i < 4 && near < 38; i++) {
        const n = this.list.length;
        this.spawn(cam.x, cam.y, game.view, !this.filled);
        if (this.list.length > n) near++;
      }
      this.filled = near >= 30;
    }
    // sólo los vehículos cerca de la cámara chocan entre sí
    this.active = this.list.filter((v) => Math.abs(v.x - cam.x) < 1700 && Math.abs(v.y - cam.y) < 1700);
    for (const l of this.lanes) l.cars.sort((a, b) => (a.s - b.s) * l.dir);
    for (const v of this.active) {
      v.flash = Math.max(0, v.flash - dt);
      if (v.state === 'drive') this.drive(v, dt, game);
      else if (v.state === 'wreck') this.wreck(v, dt, game);
      if (v.fire > 0) {
        v.fire -= dt;
        if (Math.random() < dt * 30) game.fx.fire(v.x + rand(-v.L / 3, v.L / 3), v.y + rand(-v.W / 3, v.W / 3) - v.z * 0.42, rand(10, 18));
        if (Math.random() < dt * 8) game.fx.smoke(v.x + rand(-8, 8), v.y + rand(-8, 8), 16, 1);
        if (Math.random() < dt * 6) game.fx.light(v.x, v.y, 160, 0.25);
      }
      if (v.hp < 60 * v.m.weight && Math.random() < dt * 6) game.fx.smoke(v.x + rand(-6, 6), v.y + rand(-6, 6), 10, v.hp < 0 ? 1 : 0);
      if (v.hp < 0 && Math.random() < dt * 10) game.fx.add({ k: 'flash', x: v.x + rand(-v.L / 3, v.L / 3), y: v.y + rand(-8, 8), vx: 0, vy: 0, life: 0.25, size: 14, color: 'warm' });
    }
    // fuera de alcance: desaparecen
    const far = 2300;
    this.list = this.list.filter((v) => {
      const gone = v.state !== 'parked' && (Math.abs(v.x - cam.x) > far || Math.abs(v.y - cam.y) > far || v.x < -100 || v.y < -100 || v.x > SIZE + 100 || v.y > SIZE + 100);
      if (gone && v.lane) v.lane.cars.splice(v.lane.cars.indexOf(v), 1);
      return !gone;
    });
    this.collideCars(game);
  }

  drive(v, dt, game) {
    const l = v.lane;
    const dir = l.dir;
    const front = v.s + (dir * v.L) / 2;
    let gap = 1e9;
    // coche de delante
    const i = l.cars.indexOf(v);
    const ahead = l.cars[i + 1];
    if (ahead) gap = Math.min(gap, (ahead.s - ahead.L / 2 * dir - front) * dir);
    // semáforo
    const ci = dir > 0 ? Math.ceil((front - ROAD / 2) / CELL + 1e-6) : Math.floor((front - ROAD / 2) / CELL - 1e-6);
    if (ci >= 0 && ci <= NB) {
      const cpos = roadC(ci);
      const stop = cpos - dir * STOP_BACK;
      const toStop = (stop - front) * dir;
      const pos = l.axis === 'h' ? [ci, Math.round((l.pos - ROAD / 2) / CELL)] : [Math.round((l.pos - ROAD / 2) / CELL), ci];
      const st = game.world.light(pos[0], pos[1], l.axis, game.worldTime);
      if (toStop > -4 && (st === 'r' || (st === 'y' && toStop > 40))) gap = Math.min(gap, toStop);
    }
    // obstáculos en el carril: héroe, peatones, coches destrozados
    const cos = Math.cos(v.ang);
    const sin = Math.sin(v.ang);
    const check = (ox, oy, or) => {
      const rx = ox - v.x;
      const ry = oy - v.y;
      const along = rx * cos + ry * sin - v.L / 2;
      const side = Math.abs(-rx * sin + ry * cos);
      if (along > -4 && along < 260 && side < v.W / 2 + or + 6) gap = Math.min(gap, along - or);
    };
    if (game.hero.alive) check(game.hero.x, game.hero.y, game.hero.r);
    for (const n of game.npcs) if (Math.abs(n.x - v.x) < 300 && Math.abs(n.y - v.y) < 300) check(n.px, n.py, n.r);
    for (const o of this.active) {
      if (o === v || o.state === 'drive' || Math.abs(o.x - v.x) > 320 || Math.abs(o.y - v.y) > 320) continue;
      check(o.x, o.y, Math.max(o.L, o.W) / 2);
    }
    const want = Math.min(v.vmax, Math.sqrt(Math.max(0, gap - 10) * 2 * 520));
    v.brake = want < v.speed - 5 ? 1 : 0;
    if (want < v.speed) v.speed = Math.max(want, v.speed - 900 * dt);
    else v.speed = Math.min(want, v.speed + 160 * dt);
    if (v.speed < 3 && gap < 60) {
      v.blockedT += dt;
      if (v.blockedT > 1.6 && game.hero.alive && Math.hypot(game.hero.x - v.x, game.hero.y - v.y) < 200) {
        v.blockedT = -rand(1.5, 3);
        game.sfx.honk(v.x, v.y);
      }
    } else v.blockedT = Math.min(v.blockedT, 0);
    v.s += dir * v.speed * dt;
    if (l.axis === 'h') v.x = v.s;
    else v.y = v.s;
  }

  wreck(v, dt, game) {
    const air = v.z > 0 || v.vz > 0;
    if (air) {
      v.vz -= 1100 * dt;
      v.z += v.vz * dt;
      if (v.z <= 0) {
        v.z = 0;
        if (v.vz < -220) {
          game.onCarCrash(v, v.x, v.y, -v.vz * 1.2, null);
          game.fx.dust(v.x, v.y, 10, 18, '150,145,135', 160);
          v.vz *= -0.28;
          v.vroll *= 0.55;
          v.vx *= 0.75;
          v.vy *= 0.75;
        } else v.vz = 0;
      }
    } else {
      // en el suelo el vuelco termina sobre las ruedas o sobre el techo
      const target = Math.round(v.roll / Math.PI) * Math.PI;
      v.vroll *= Math.exp(-dt * 8);
      v.roll += (target - v.roll) * (1 - Math.exp(-dt * 10));
    }
    v.roll += v.vroll * dt;
    if (v.fuse > 0) {
      v.fuse -= dt;
      if (v.fuse <= 0) game.explodeCar(v);
    }
    const k = Math.exp(-dt * (air ? 0.15 : Math.cos(v.roll) < 0 ? 3.2 : 1.5));
    v.vx *= k;
    v.vy *= k;
    v.va *= Math.exp(-dt * (air ? 0.3 : 2.2));
    const sp = Math.hypot(v.vx, v.vy);
    // derrape: marcas en el suelo
    if (sp > 160 && Math.random() < dt * 30) game.fx.decal({ k: 'scorch', x: v.x, y: v.y, ang: Math.atan2(v.vy, v.vx), len: 12, life: 6 });
    v.x += v.vx * dt;
    v.y += v.vy * dt;
    v.ang += v.va * dt;
    // choque con edificios y postes: tres círculos a lo largo de la carrocería
    const c = Math.cos(v.ang);
    const s = Math.sin(v.ang);
    const h = v.L / 2 - v.W / 2;
    for (const t of [-1, 0, 1]) {
      const p = { x: v.x + c * h * t, y: v.y + s * h * t };
      const ox = p.x;
      const oy = p.y;
      const hit = this.world.collide(p, v.W / 2);
      if (hit) {
        v.x += p.x - ox;
        v.y += p.y - oy;
        const vn = v.vx * hit.nx + v.vy * hit.ny;
        if (vn < 0) {
          v.vx -= 1.4 * vn * hit.nx;
          v.vy -= 1.4 * vn * hit.ny;
          v.va += t * vn * 0.004;
          if (-vn > 140) {
            game.onCarCrash(v, ox, oy, -vn, hit);
          }
        }
      }
    }
    if (sp < 4 && Math.abs(v.va) < 0.05) {
      v.vx = v.vy = v.va = 0;
    }
  }

  // Choques entre vehículos y de vehículos sueltos contra peatones.
  collideCars(game) {
    const L = this.active;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      const aMoving = a.state === 'wreck' && Math.hypot(a.vx, a.vy) > 40;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        const bMoving = b.state === 'wreck' && Math.hypot(b.vx, b.vy) > 40;
        if (!aMoving && !bMoving) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const R = (a.L + b.L) / 2;
        if (dx * dx + dy * dy > R * R) continue;
        const [ax, ay, bx, by, ar] = a.seg();
        const [cx, cy, ex, ey, br] = b.seg();
        // distancia aproximada entre los dos segmentos
        let best = null;
        for (const [px, py, sa] of [[cx, cy, b], [ex, ey, b], [ax, ay, a], [bx, by, a], [b.x, b.y, b], [a.x, a.y, a]]) {
          const other = sa === a ? b : a;
          const q = other.distTo(px, py);
          const pen = q.d - (sa === a ? ar : br);
          if (pen < 0 && (!best || pen < best.pen)) best = { pen, nx: q.nx, ny: q.ny, mover: sa, px: q.cx, py: q.cy };
        }
        if (!best) continue;
        const mover = best.mover;
        const other = mover === a ? b : a;
        // separar
        mover.x -= best.nx * best.pen * 0.5;
        mover.y -= best.ny * best.pen * 0.5;
        other.x += best.nx * best.pen * 0.5;
        other.y += best.ny * best.pen * 0.5;
        // impulso: el que va más rápido empuja al otro
        const rvx = (a.vx || 0) - (b.vx || 0);
        const rvy = (a.vy || 0) - (b.vy || 0);
        const rel = Math.hypot(rvx, rvy);
        if (rel > 60) {
          const fast = Math.hypot(a.vx, a.vy) > Math.hypot(b.vx, b.vy) ? a : b;
          const slow = fast === a ? b : a;
          const ix = fast.vx * fast.m.weight * 0.55;
          const iy = fast.vy * fast.m.weight * 0.55;
          slow.impulse(ix, iy, best.px, best.py, rel * 0.08 * fast.m.weight);
          if (slow.lane) slow.lane.cars.splice(slow.lane.cars.indexOf(slow), 1), (slow.lane = null);
          fast.vx -= ix / fast.m.weight * 0.7;
          fast.vy -= iy / fast.m.weight * 0.7;
          game.onCarCrash(slow, best.px, best.py, rel, null);
        }
      }
      // peatones atropellados por coches sueltos
      if (aMoving && a.z < 30) {
        const sp = Math.hypot(a.vx, a.vy);
        for (const n of game.npcs) {
          if (n.state === 'rag' || Math.abs(n.x - a.x) > a.L || Math.abs(n.y - a.y) > a.L) continue;
          const q = a.distTo(n.x, n.y);
          if (q.d < n.r && sp > 90) game.hitNpc(n, a.vx * 1.1 + q.nx * 120, a.vy * 1.1 + q.ny * 120, sp * 0.9, sp * 0.15, 'car');
        }
      }
    }
  }

  /* ---------- dibujo ---------- */

  drawShadows(g, S, v) {
    const [px, py] = S.shadowRectPad;
    for (const c of this.list) {
      if (c.x < v.x0 - 150 || c.x > v.x1 + 150 || c.y < v.y0 - 150 || c.y > v.y1 + 150) continue;
      const L = c.L / (1 - px * 2);
      const W = c.W / (1 - py * 2);
      const h = (c.m.kind === 'bus' || c.m.kind === 'truck' ? 22 : 11) + c.z * 0.6;
      g.save();
      g.translate(c.x + h * SUN.x, c.y + h * SUN.y);
      g.rotate(c.ang);
      g.globalAlpha = 0.85 * Math.max(0.3, 1 - c.z / 400);
      g.drawImage(S.shadowRect, -L / 2, -W / 2, L, W);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  draw(g, v, time) {
    for (const c of this.list) {
      if (c.x < v.x0 - 130 || c.x > v.x1 + 130 || c.y < v.y0 - 130 || c.y > v.y1 + 130) continue;
      g.save();
      g.translate(c.x, c.y - c.z * 0.42);
      g.rotate(c.ang);
      const zk = 1 + c.z / 260;
      const cr = Math.cos(c.roll);
      g.scale(zk, zk * Math.max(0.14, Math.abs(cr)));
      if (cr < 0) {
        drawSprite(g, c.under || (c.under = bakeUnderside(c.atlas, c.model)), 0, 0);
        g.restore();
        continue;
      }
      drawSprite(g, c.spr, 0, 0);
      // abolladuras y cristales rotos
      for (const d of c.dents) {
        const gr = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        gr.addColorStop(0, 'rgba(10,10,12,0.55)');
        gr.addColorStop(0.7, 'rgba(10,10,12,0.25)');
        gr.addColorStop(1, 'rgba(255,255,255,0.12)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(d.x, d.y, d.r, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(230,230,230,0.35)';
        g.lineWidth = 0.7;
        g.beginPath();
        g.arc(d.x, d.y, d.r * 0.7, 0.4, 2.2);
        g.stroke();
      }
      if (c.glass) {
        g.strokeStyle = 'rgba(235,245,255,0.7)';
        g.lineWidth = 0.6;
        const gx = c.L * 0.17;
        for (let k = 0; k < c.glass * 4; k++) {
          const a = (k / (c.glass * 4)) * TAU + c.L;
          g.beginPath();
          g.moveTo(gx, 0);
          g.lineTo(gx + Math.cos(a) * 8, Math.sin(a) * 14);
          g.stroke();
        }
      }
      if (c.flash > 0) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = c.flash * 4;
        g.fillStyle = '#ffffff';
        g.fillRect(-c.L / 2, -c.W / 2, c.L, c.W);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }
      g.restore();
    }
  }
}

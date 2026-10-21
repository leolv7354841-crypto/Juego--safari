import { ZOMBIES, WORLD_SIZE, GOLDEN } from './config.js';
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
const near2 = [];

// Táctica de cada zombi en la horda: unos van directo, otros buscan tu costado y otros
// tu espalda (siempre por rutas reales). Además, algunos son rezagados: más lentos y torpes.
function pickRole() {
  const r = Math.random();
  const tactic = r < 0.45 ? 'direct' : r < 0.8 ? 'flank' : 'rear';
  const lag = Math.random() < 0.18;
  return { tactic, side: Math.random() < 0.5 ? -1 : 1, role: lag ? 'lag' : 'walker', pace: lag ? rand(0.6, 0.78) : rand(0.9, 1.1) };
}

// Con menos zombis que esto todos van directo; con más, la horda empieza a rodearte.
const ENCIRCLE_MIN = 18;
const OCT = TAU / 8;
// a avanza hacia b (n = dirección de a hacia b). Si a es más rápido y b le tapa el
// camino, a se desliza de lado para adelantarlo en lugar de quedarse atascado detrás.
function overtake(a, b, nx, ny, dt) {
  if (a.dead || a.inRange || a.speed < b.speed * 1.12) return;
  const ahead = (a.mx || 0) * nx + (a.my || 0) * ny;
  if (ahead < 0.25) return;
  let tx = -ny;
  let ty = nx;
  let side = (a.mx || 0) * tx + (a.my || 0) * ty;
  if (Math.abs(side) < 0.05) side = a.id & 1 ? 1 : -1;
  if (side < 0) {
    tx = -tx;
    ty = -ty;
  }
  const k = a.speed * dt * 1.6 * ahead * (b.mass > a.mass * 3 ? 1.8 : 1);
  a.x += tx * k;
  a.y += ty * k;
}
const tmpDir = { x: 0, y: 0 };
const near = [];

export class Horde {
  constructor() {
    this.list = [];
    this.grid = new Grid(WORLD_SIZE, CELL);
    this.sprites = zombieSprites();
    this.frame = 0;
    this.danger = 0;
    this.nearCount = 0;
  }

  // Elige (una sola vez) el punto de flanqueo al que irá este zombi: a tu costado o a tu
  // espalda respecto a por dónde llega, con algo de azar para que no formen un círculo perfecto.
  planRoute(z, p, world) {
    z.planned = true;
    if (z.tactic === 'direct' || this.list.length < ENCIRCLE_MIN) return;
    const b = Math.atan2(z.y - p.y, z.x - p.x);
    const off = z.tactic === 'rear' ? Math.PI + rand(-0.6, 0.6) : z.side * (Math.PI / 2) + rand(-0.5, 0.5);
    const k = (((Math.round((b + off) / OCT) % 8) + 8) % 8);
    if (world.anchors[k].ok) z.anchor = k;
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
      chew: 0.4,
      ...pickRole(),
      touchT: 0,
      unstickT: 0,
      unstickSide: 1,
      // deriva del rumbo, tropiezos y ritmo propio: nadie camina en línea perfecta
      wander: 0,
      wanderV: 0,
      stumbleT: 0,
      nextStumble: rand(1, 6),
      anchor: -1,
      planned: false,
      stuck: 0,
      avx: 0,
      avy: 0,
      hitT: 0,
      hitJolt: 0,
      life: type === 'golden' ? GOLDEN.life : 0,
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
    this.frame++;
    let danger = 0;
    let nearCount = 0;

    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      const def = z.def;
      z.flash -= dt;
      z.slow -= dt;
      z.lunge = Math.max(0, z.lunge - dt * 4);
      z.spawnT = Math.max(0, z.spawnT - dt);
      z.hitT -= dt;
      const dx = p.x - z.x;
      const dy = p.y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 650) {
        danger += 1 - d / 650;
        if (d < 300) nearCount++;
      }
      let mx;
      let my;
      if (z.type === 'golden') {
        // el dorado huye de ti; si estás lejos, merodea a distancia
        z.life -= dt;
        if (z.life <= 0) {
          game.onGoldenExpired(z);
          continue;
        }
        const t = Math.sin(time * 0.6 + z.wob);
        if (d < 460) {
          mx = -dx / d + (-dy / d) * t * 0.6;
          my = -dy / d + (dx / d) * t * 0.6;
        } else {
          mx = (-dy / d) * z.side + (dx / d) * 0.25;
          my = (dx / d) * z.side + (dy / d) * 0.25;
        }
      } else {
        // ruta: hacia su punto de flanqueo mientras esté lejos; después, directo por ti
        if (!z.planned && d > 320 && p.alive) this.planRoute(z, p, world);
        let field = world.main;
        if (z.anchor >= 0) {
          const a = world.anchors[z.anchor];
          if (!a.ok || d < 170 || Math.hypot(a.x - z.x, a.y - z.y) < 90) z.anchor = -2;
          else field = a;
        }
        const f = d >= 90 && p.alive ? world.flowDir(z.x, z.y, tmpDir, field) : null;
        if (f) {
          mx = f.x;
          my = f.y;
        } else {
          mx = dx / d;
          my = dy / d;
        }
      }
      // si se quedó atascado, se escurre de lado un momento para despegarse
      if (z.unstickT > 0) {
        z.unstickT -= dt;
        const s = z.unstickSide;
        const ux = mx * 0.35 - my * s;
        const uy = my * 0.35 + mx * s;
        const ul = Math.hypot(ux, uy) || 1;
        mx = ux / ul;
        my = uy / ul;
      }
      // pegado a un obstáculo: se mueve más recto para seguir bien la ruta
      const calm = z.touchT > 0 ? 0.2 : 1;
      z.touchT -= dt;
      // evitar amontonarse: se apartan de los vecinos y rodean al que tienen delante.
      // Se recalcula en fotogramas alternos (mitad de la horda cada vez) para rendir con cientos.
      if (d > 50) {
        if (((z.id + this.frame) & 1) === 0) {
          this.grid.query(z.x - z.r - 26, z.y - z.r - 26, z.x + z.r + 26, z.y + z.r + 26, near2);
          let ax = 0;
          let ay = 0;
          for (let k = 0; k < near2.length; k++) {
            const o = near2[k];
            if (o === z || o.dead) continue;
            const ox = z.x - o.x;
            const oy = z.y - o.y;
            const R = z.r + o.r + 22;
            const od = Math.hypot(ox, oy);
            if (od >= R || od < 0.01) continue;
            const push = 1 - od / R;
            ax += (ox / od) * push;
            ay += (oy / od) * push;
            if (-(ox * mx + oy * my) / od > 0.75) {
              const side = z.id & 1 ? 1 : -1;
              ax += -my * side * push * 0.8;
              ay += mx * side * push * 0.8;
            }
          }
          z.avx = ax;
          z.avy = ay;
        }
        mx += z.avx * 0.7 * calm;
        my += z.avy * 0.7 * calm;
        const l = Math.hypot(mx, my) || 1;
        mx /= l;
        my /= l;
      }
      // movimiento torpe: el rumbo deriva un poco, a ratos tropiezan y dan un tirón
      z.wanderV = (z.wanderV + rand(-1, 1) * dt * 4) * Math.exp(-dt * 1.2);
      z.wander = (z.wander + z.wanderV * dt) * Math.exp(-dt * 0.5);
      if (z.wander > 0.4) z.wander = 0.4;
      else if (z.wander < -0.4) z.wander = -0.4;
      z.nextStumble -= dt;
      if (z.nextStumble <= 0 && d > 40) {
        z.stumbleT = rand(0.25, 0.6);
        z.wander += rand(-0.45, 0.45);
        z.nextStumble = z.role === 'lag' ? rand(1.5, 4) : rand(3, 9);
      }
      z.stumbleT -= dt;
      const wob = (z.wander + Math.sin(time * 1.6 + z.wob) * 0.18) * calm;
      const cw = Math.cos(wob);
      const sw = Math.sin(wob);
      const wx = mx * cw - my * sw;
      const wy = mx * sw + my * cw;
      mx = wx;
      my = wy;
      z.mx = mx;
      z.my = my;

      const reach = z.r + p.r + def.reach;
      const inRange = d < reach && p.alive && z.type !== 'golden';
      z.angle = angleTo(z.angle, Math.atan2(inRange ? dy : my, inRange ? dx : mx), def.turn * dt);
      // ritmo propio que sube y baja; al tropezar casi se frenan
      let sp = z.speed * z.pace * (0.85 + 0.15 * Math.sin(time * 0.7 + z.wob)) * (z.slow > 0 ? 0.35 : 1);
      if (z.stumbleT > 0) sp *= 0.25;
      if (inRange) sp *= 0.15;
      // alambre de púas: frena y hiere
      const trap = game.structures.wires.length ? game.structures.trapAt(z, dt, game) : null;
      if (trap) {
        sp *= trap.slow;
        z.hp -= trap.dps * dt;
      }
      if (z.hp <= 0 && !z.dead) game.killZombie(z);
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
          game.onZombieHit(z);
          p.kx += (dx / d) * 40 * Math.sqrt(z.mass);
          p.ky += (dy / d) * 40 * Math.sqrt(z.mass);
        }
      } else {
        z.inRange = false;
      }
    }

    this.danger = danger;
    this.nearCount = nearCount;
    // separación entre zombis y contra el jugador
    const grid = this.grid;
    grid.clear();
    for (const z of list) grid.insert(z);
    for (const z of list) {
      const q = z.r + 70;
      grid.query(z.x - q, z.y - q, z.x + q, z.y + q, near);
      for (let k = 0; k < near.length; k++) {
        const o = near[k];
        if (o.id <= z.id) continue;
        const dx = o.x - z.x;
        const dy = o.y - z.y;
        const rr = z.r + o.r;
        const look = rr + 34;
        const d2 = dx * dx + dy * dy;
        if (d2 >= look * look) continue;
        const d0 = Math.sqrt(d2) || 0.01;
        // el más rápido rodea al más lento que tiene delante (todos pueden pasar a un gigante)
        overtake(z, o, dx / d0, dy / d0, dt);
        overtake(o, z, -dx / d0, -dy / d0, dt);
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
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
      world.lastBlock = null;
      if (world.collide(z, z.r)) z.touchT = 0.5;
      // detector de atasco: si en 1,2 s casi no avanzó y no está pegado al jugador
      z.chkT = (z.chkT || 0) + dt;
      if (z.chkT > 1.2) {
        const moved = Math.hypot(z.x - (z.chkX ?? z.x), z.y - (z.chkY ?? z.y));
        if (moved < 10 && !z.inRange && !world.lastBlock && p.alive) {
          // atascado: se escurre de lado y recalcula su ruta (otro punto de flanqueo o directo)
          z.unstickT = rand(0.6, 1.1);
          z.unstickSide = Math.random() < 0.5 ? -1 : 1;
          z.stuck++;
          if (z.anchor >= 0) z.anchor = z.stuck > 1 ? -2 : (z.anchor + (z.side > 0 ? 1 : 7)) % 8;
        } else if (moved > 30) {
          z.stuck = 0;
        }
        z.chkT = 0;
        z.chkX = z.x;
        z.chkY = z.y;
      }
      // golpea la barricada que le cierra el paso
      if (world.lastBlock && !z.inRange && !z.dead) {
        z.chew -= dt;
        if (z.chew <= 0) {
          z.chew = 1 / z.def.attackRate;
          z.lunge = 1;
          game.structures.damageBlock(game, world.lastBlock, z.def.damage * 1.6);
        }
      }
      z.x = clamp(z.x, 30, WORLD_SIZE - 30);
      z.y = clamp(z.y, 30, WORLD_SIZE - 30);
    }
    if (p.alive) world.collide(p, p.r, true);
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
      const ang = z.angle + (z.hitT > 0 ? z.hitJolt * (z.hitT / 0.18) : 0);
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const pop = z.hitT > 0 ? 1 + 0.08 * (z.hitT / 0.18) : 1;
      if (z.type === 'golden') {
        // aura dorada; parpadea cuando está por desaparecer
        const warn = z.life < GOLDEN.warnAt;
        const blink = warn ? 0.35 + 0.65 * Math.abs(Math.sin(z.life * 9)) : 1;
        ctx.setTransform(s, 0, 0, s, tx, ty);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 * blink;
        ctx.fillStyle = '#e8b830';
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * 2.1, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = blink;
      }
      const grow = z.spawnT > 0 ? 1 - z.spawnT * 0.5 : 1;
      const k = s * pop * grow;
      const lx = z.x + c * z.lunge * 5;
      const ly = z.y + sn * z.lunge * 5;
      if (z.type !== 'golden') ctx.globalAlpha = z.spawnT > 0 ? 1 - z.spawnT : 1;
      ctx.setTransform(k * c, k * sn, -k * sn, k * c, tx + lx * s, ty + ly * s);
      ctx.drawImage(img, -half, -half, half * 2, half * 2);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(s, 0, 0, s, tx, ty);
  }
}

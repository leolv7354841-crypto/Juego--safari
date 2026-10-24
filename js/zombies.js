import { ZOMBIES, WORLD_SIZE, GOLDEN, BULL, WOUND, MOLOTOV } from './config.js';
import { clamp, rand, angleTo, TAU } from './util.js';
import { zombieSprites, flameSprite } from './sprites.js';

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
  return {
    tactic,
    side: Math.random() < 0.5 ? -1 : 1,
    role: lag ? 'lag' : 'walker',
    pace: lag ? rand(0.6, 0.78) : rand(0.9, 1.1),
  };
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
const near3 = [];

// ¿Hay vista directa entre dos puntos? (los muros y edificios tapan; coches y barricadas no)
function clearLine(world, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.ceil(Math.hypot(dx, dy) / 24);
  for (let i = 1; i < n; i++) {
    if (world.pointBlocked(x0 + (dx * i) / n, y0 + (dy * i) / n, 0, true)) return false;
  }
  return true;
}

// Objetivo vacío (en línea, cuando no queda nadie vivo).
const IDLE = { x: 0, y: 0, r: 14, alive: false };

function nearestAlive(list, z) {
  let best = IDLE;
  let bd = Infinity;
  for (const pl of list) {
    if (!pl.alive) continue;
    const d = (z.x - pl.x) ** 2 + (z.y - pl.y) ** 2;
    if (d < bd) {
      bd = d;
      best = pl;
    }
  }
  return best;
}

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
    const k = ((Math.round((b + off) / OCT) % 8) + 8) % 8;
    if (world.anchors[k].ok) z.anchor = k;
  }

  spawn(type, x, y, hpMult = 1, speedMult = 1) {
    const def = ZOMBIES[type];
    const sets = this.sprites[type];
    /** @type {import('./types.js').Zombie} */
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
      // variante de dibujo según el id (así el cooperativo no necesita mandarla)
      si: nextId % sets.length,
      flash: 0,
      slow: 0,
      atk: 0,
      inRange: false,
      kx: 0,
      ky: 0,
      air: 0,
      airV: 0,
      spinV: 0,
      tilt: 0,
      wounded: false,
      dripT: 0,
      burn: 0,
      fireFx: 0,
      // toro: walk → windup (escarba) → charge (embiste) → recover; ram = embestidas contra una estructura
      bs: 'walk',
      bt: 0,
      cd: rand(0.5, 1.5),
      lookT: 0,
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
    z.spr = sets[z.si];
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

  /**
   * @param {number} dt
   * @param {import('./types.js').GameHost} game
   */
  update(dt, game) {
    // en línea (servidor): game.targets = jugadores presentes, cada uno con su campo de rutas
    const targets = game.targets || null;
    // cooperativo: cada zombi va por el jugador vivo más cercano (en el anfitrión)
    const p0 = targets ? IDLE : game.player;
    const peer =
      !targets && game.coop && game.coop.isHost && game.coop.peer && game.coop.peer.alive ? game.coop.peer : null;
    // objetivo actual: Player, compañero remoto o el IDLE sin jugadores (por eso any)
    /** @type {any} */
    let p = p0;
    const world = game.world;
    const time = game.time;
    const list = this.list;
    this.frame++;
    let danger = 0;
    let nearCount = 0;

    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      const def = z.def;
      if (targets) {
        p = nearestAlive(targets, z);
        if (p === IDLE) {
          // nadie a quien perseguir: se queda donde está
          IDLE.x = z.x + 1;
          IDLE.y = z.y;
        }
      } else if (peer) {
        const d0 = p0.alive ? (z.x - p0.x) ** 2 + (z.y - p0.y) ** 2 : Infinity;
        p = (z.x - peer.x) ** 2 + (z.y - peer.y) ** 2 < d0 ? peer : p0;
      }
      z.flash -= dt;
      z.slow -= dt;
      z.lunge = Math.max(0, z.lunge - dt * 4);
      z.spawnT = Math.max(0, z.spawnT - dt);
      z.hitT -= dt;
      // lanzado por una explosión: vuela, gira y cae
      if (z.air > 0) {
        z.air += z.airV * dt;
        z.airV -= 900 * dt;
        z.angle += z.spinV * dt;
        if (z.air <= 0) {
          z.air = 0;
          z.airV = 0;
          z.stumbleT = Math.max(z.stumbleT || 0, 0.5);
          game.particles.dust(z.x, z.y, 6);
        }
      }
      const dx = p.x - z.x;
      const dy = p.y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 650) {
        danger += 1 - d / 650;
        if (d < 300) nearCount++;
      }
      // en llamas: se queman, se retuercen y corren desesperados
      if (z.burn > 0) {
        z.burn -= dt;
        z.hp -= MOLOTOV.dps * dt;
        z.fireFx -= dt;
        if (z.fireFx <= 0) {
          z.fireFx = 0.08;
          game.particles.burning(z.x, z.y, z.r);
        }
        if (Math.random() < dt * 0.6) game.sfx.burnScream();
        if (z.hp <= 0) {
          z.burnt = true;
          game.killZombie(z);
          continue;
        }
      }
      // herido de bala: se desangra y deja un rastro de sangre al arrastrarse
      if (z.wounded) {
        z.hp -= WOUND.bleed * dt;
        z.dripT -= dt;
        if (z.dripT <= 0) {
          z.dripT = rand(0.18, 0.34);
          game.decals.drip(
            z.x - Math.cos(z.angle) * z.r * 0.5 + rand(-3, 3),
            z.y - Math.sin(z.angle) * z.r * 0.5 + rand(-3, 3),
          );
        }
        if (z.hp <= 0) {
          game.killZombie(z);
          continue;
        }
      }
      z.tilt =
        (z.wounded ? Math.sin(time * 5 + z.wob) * 0.16 : 0) + (z.burn > 0 ? Math.sin(time * 23 + z.wob) * 0.28 : 0);
      if (z.type === 'bull' && this.bullThink(z, p, dx, dy, d, dt, game, world)) continue;
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
        let field = world.main;
        if (targets) field = p.field || world.main;
        else if (p !== p0) field = world.main2;
        else if (!z.planned && d > 320 && p.alive) this.planRoute(z, p, world);
        if (!targets && p === p0 && z.anchor >= 0) {
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
      const inRange = d < reach && p.alive && z.type !== 'golden' && !(z.air > 0);
      z.angle = angleTo(z.angle, Math.atan2(inRange ? dy : my, inRange ? dx : mx), def.turn * dt);
      // ritmo propio que sube y baja; al tropezar casi se frenan
      let sp = z.speed * z.pace * (0.85 + 0.15 * Math.sin(time * 0.7 + z.wob)) * (z.slow > 0 ? 0.35 : 1);
      if (z.stumbleT > 0) sp *= 0.25;
      if (z.air > 0) sp = 0;
      // arrastrándose: avanza a tirones, como si arrastrara una pierna
      if (z.wounded) sp *= WOUND.pace * (0.4 + 1.25 * Math.max(0, Math.sin(time * 5 + z.wob)));
      if (z.burn > 0) {
        sp *= 1.2;
        const wob = Math.sin(time * 6 + z.wob * 3) * 0.9;
        const c = Math.cos(wob);
        const sn = Math.sin(wob);
        const nx = mx * c - my * sn;
        my = mx * sn + my * c;
        mx = nx;
      }
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
      const kd = Math.exp(-dt * (z.air > 0 ? 1.5 : 7));
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
          game.onZombieHit(z, p);
          const push = def.punch || 40 * Math.sqrt(z.mass);
          p.kx += (dx / d) * push;
          p.ky += (dy / d) * push;
          if (def.punch) game.onSuperPunch(z, p.x, p.y);
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
        // el fuego se contagia a los que se rozan
        if (z.burn > 0.6 && !(o.burn > 0) && Math.random() < dt * 2) o.burn = MOLOTOV.burn * 0.6;
        else if (o.burn > 0.6 && !(z.burn > 0) && Math.random() < dt * 2) z.burn = MOLOTOV.burn * 0.6;
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
      for (const pl of targets || (peer ? [p0, peer] : [p0])) {
        if (!pl.alive) continue;
        const dx = pl.x - z.x;
        const dy = pl.y - z.y;
        const rr = z.r + pl.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.01;
          const ov = rr - d;
          const nx = dx / d;
          const ny = dy / d;
          // al compañero lo mueve su propio celular: aquí sólo se aparta el zombi
          const tm = pl === peer ? z.mass : z.mass + pl.mass;
          const zk = pl === peer ? 1 : pl.mass / tm;
          z.x -= nx * ov * zk;
          z.y -= ny * ov * zk;
          if (pl !== peer) {
            pl.x += nx * ov * (z.mass / tm);
            pl.y += ny * ov * (z.mass / tm);
          }
        }
      }
      world.lastBlock = null;
      const bumped = world.collide(z, z.r);
      if (bumped) z.touchT = 0.5;
      if (z.type === 'bull' && !z.dead) this.bullImpact(z, bumped, world.lastBlock, game);
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
      if (world.lastBlock && !z.inRange && !z.dead && z.type !== 'bull') {
        z.chew -= dt;
        if (z.chew <= 0) {
          z.chew = 1 / z.def.attackRate;
          z.lunge = 1;
          const blk = world.lastBlock;
          game.structures.damageBlock(game, blk, z.def.blockDmg || z.def.damage * 1.6);
          if (z.def.punch) game.onSuperPunch(z, blk.x + blk.w / 2, blk.y + blk.h / 2);
        }
      }
      z.x = clamp(z.x, 30, WORLD_SIZE - 30);
      z.y = clamp(z.y, 30, WORLD_SIZE - 30);
    }
    if (targets) {
      for (const pl of targets) if (pl.alive) world.collide(pl, pl.r, true);
    } else if (p0.alive) world.collide(p0, p0.r, true);
    grid.clear();
    for (const z of list) grid.insert(z);
  }

  /* ---------- toro ---------- */

  // Devuelve true si el toro controla su propio movimiento este fotograma.
  bullThink(z, p, dx, dy, d, dt, game, world) {
    z.bt -= dt;
    if (z.bs === 'walk') {
      z.cd -= dt;
      z.lookT -= dt;
      if (z.cd <= 0 && z.lookT <= 0 && p.alive && d < BULL.sight && d > 70 && !(z.air > 0)) {
        z.lookT = 0.25;
        if (clearLine(world, z.x, z.y, p.x, p.y)) {
          // te vio: se planta, resopla y escarba antes de embestir
          z.bs = 'windup';
          z.bt = BULL.windup;
          game.sfx.bullRoar();
        }
      }
      return false;
    }
    if (z.bs === 'windup') {
      z.angle = angleTo(z.angle, Math.atan2(dy, dx), 9 * dt);
      z.anim += dt * 9;
      if (Math.random() < dt * 14) game.particles.dust(z.x - Math.cos(z.angle) * z.r, z.y - Math.sin(z.angle) * z.r, 4);
      if (z.bt <= 0) {
        const a = Math.atan2(dy, dx);
        z.bs = 'charge';
        z.bt = BULL.maxTime;
        z.cdx = Math.cos(a);
        z.cdy = Math.sin(a);
        z.angle = a;
        z.chargeId = (z.chargeId || 0) + 1;
        game.sfx.bullCharge();
      }
      return true;
    }
    if (z.bs === 'charge' || z.bs === 'ramIn') {
      const sp = z.bs === 'charge' ? BULL.speed : BULL.speed * 0.55;
      z.x += z.cdx * sp * dt;
      z.y += z.cdy * sp * dt;
      z.anim += (sp * dt) / (z.r * 0.55);
      if (Math.random() < dt * 20) game.particles.dust(z.x - z.cdx * z.r, z.y - z.cdy * z.r, 5);
      // arrolla a los zombis que tiene delante
      this.grid.query(z.x - z.r - 20, z.y - z.r - 20, z.x + z.r + 20, z.y + z.r + 20, near3);
      for (const o of near3) {
        if (o === z || o.dead || o.plowed === z.id * 1000 + z.chargeId) continue;
        const ox = o.x - z.x;
        const oy = o.y - z.y;
        if (ox * ox + oy * oy > (z.r + o.r + 4) ** 2) continue;
        o.plowed = z.id * 1000 + z.chargeId;
        const side = ox * -z.cdy + oy * z.cdx >= 0 ? 1 : -1;
        const k = 1 / Math.sqrt(o.mass);
        o.kx += (-z.cdy * side * 320 + z.cdx * 220) * k;
        o.ky += (z.cdx * side * 320 + z.cdy * 220) * k;
        o.airV = Math.max(o.airV || 0, 200 * k);
        o.air = o.air || 0.01;
        o.spinV = rand(-8, 8);
      }
      if (z.bs === 'charge' && p.alive && d < z.r + p.r + 6) {
        // cornada: te lanza por los aires y te quita 40
        p.hurt(BULL.hit, game);
        game.onZombieHit(z, p);
        p.kx += z.cdx * BULL.throw;
        p.ky += z.cdy * BULL.throw;
        game.camera.shake(0.75);
        game.particles.dust(p.x, p.y, 14);
        game.sfx.bullHit();
        z.bs = 'recover';
        z.bt = 1.1;
        return true;
      }
      if (z.bt <= 0) {
        z.bs = z.bs === 'ramIn' && z.ramBlock && z.ramBlock.hp > 0 ? 'ram' : 'recover';
        z.bt = z.bs === 'ram' ? 0.45 : 0.7;
      }
      return true;
    }
    if (z.bs === 'recover') {
      // derrapa, sacude la cabeza y vuelve a caminar
      const k = Math.max(0, z.bt);
      z.x += (z.cdx || 0) * 90 * k * dt;
      z.y += (z.cdy || 0) * 90 * k * dt;
      if (z.bt <= 0) {
        z.bs = 'walk';
        z.cd = BULL.cooldown;
      }
      return true;
    }
    if (z.bs === 'ram') {
      const b = z.ramBlock;
      if (!b || b.hp <= 0) {
        z.bs = 'walk';
        z.cd = 0.6;
        return false;
      }
      // retrocede un poco para tomar impulso y vuelve a embestir
      const bx = clamp(z.x, b.x, b.x + b.w) - z.x;
      const by = clamp(z.y, b.y, b.y + b.h) - z.y;
      const bl = Math.hypot(bx, by) || 1;
      z.angle = angleTo(z.angle, Math.atan2(by, bx), 10 * dt);
      z.x -= (bx / bl) * 85 * dt;
      z.y -= (by / bl) * 85 * dt;
      z.anim -= dt * 6;
      if (z.bt <= 0) {
        z.bs = 'ramIn';
        z.bt = 0.7;
        z.cdx = bx / bl;
        z.cdy = by / bl;
        z.chargeId = (z.chargeId || 0) + 1;
      }
      return true;
    }
    return false;
  }

  // Choque del toro contra estructuras o muros.
  bullImpact(z, bumped, block, game) {
    if (z.bs === 'walk' && block && !z.inRange) {
      // caminando se topó con una barricada: empieza a embestirla
      z.ramBlock = block;
      z.bs = 'ram';
      z.bt = 0.45;
      return;
    }
    if (z.bs !== 'charge' && z.bs !== 'ramIn') return;
    if (block) {
      const long = z.bs === 'charge';
      game.structures.damageBlock(game, block, long ? BULL.long : BULL.short);
      game.particles.dust(z.x + z.cdx * z.r, z.y + z.cdy * z.r, long ? 26 : 12);
      game.camera.shake(long ? 0.35 : 0.12);
      game.sfx.bullSlam(long);
      z.ramBlock = block;
      z.bs = block.hp > 0 ? 'ram' : 'recover';
      z.bt = block.hp > 0 ? 0.45 : 0.6;
    } else if (bumped) {
      // contra un muro de verdad: se aturde un momento
      game.particles.dust(z.x + z.cdx * z.r, z.y + z.cdy * z.r, 16);
      game.sfx.bullSlam(false);
      z.bs = 'recover';
      z.bt = 1.3;
      z.cdx = 0;
      z.cdy = 0;
    }
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
      const f = (((z.anim | 0) % frames.length) + frames.length) % frames.length;
      const img = frames[f];
      const ang = z.angle + z.tilt + (z.hitT > 0 ? z.hitJolt * (z.hitT / 0.18) : 0);
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
      const lift = z.air > 0 ? z.air : 0;
      // hinchado por el cohete clavado: crece y tiembla antes de reventar
      const swell = z.swell > 0 ? z.swell : 0;
      const k =
        s * pop * grow * (1 + lift / 140) * (1 + swell * 0.35 + (swell ? Math.sin(z.id + swell * 60) * 0.03 : 0));
      const shake =
        z.bs === 'windup' ? (Math.random() - 0.5) * 2.4 : swell ? (Math.random() - 0.5) * (2 + swell * 5) : 0;
      const lx = z.x + c * z.lunge * 5 + shake;
      const ly = z.y + sn * z.lunge * 5 - lift * 0.7 + shake;
      if (lift > 0) {
        // sombra en el suelo mientras vuela
        ctx.setTransform(s, 0, 0, s, tx, ty);
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(z.x, z.y, z.r * 0.9, z.r * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (z.type !== 'golden') ctx.globalAlpha = z.spawnT > 0 ? 1 - z.spawnT : 1;
      ctx.setTransform(k * c, k * sn, -k * sn, k * c, tx + lx * s, ty + ly * s);
      ctx.drawImage(img, -half, -half, half * 2, half * 2);
      if (swell) {
        // brilla amarillo, cada vez más fuerte
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = swell * (0.45 + 0.35 * Math.abs(Math.sin(swell * 40)));
        ctx.drawImage(z.spr.flash[f], -half, -half, half * 2, half * 2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      if (z.burn > 0) {
        // llamas sobre el cuerpo (aditivas, parpadean)
        const fl = flameSprite();
        ctx.setTransform(s, 0, 0, s, tx, ty);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, z.burn * 0.8);
        for (let i = 0; i < 3; i++) {
          const a = z.id * 2.1 + i * 2.1;
          const fw = z.r * (0.8 + Math.random() * 0.35);
          const fh = fw * (1.4 + Math.random() * 0.5);
          const fx = lx + Math.cos(a) * z.r * 0.45;
          const fy = ly + Math.sin(a) * z.r * 0.45;
          ctx.drawImage(fl, fx - fw / 2, fy - fh * 0.8, fw, fh);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(s, 0, 0, s, tx, ty);
  }
}

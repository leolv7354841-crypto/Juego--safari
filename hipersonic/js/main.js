// HIPERSONIC — punto de entrada: bucle, cámara, poblaciones, impactos, Sonic Time y el
// orden de dibujo con su posprocesado (desenfoque de movimiento, tinte, ondas de choque).
import { TAU, clamp, lerp, rand, pick, smooth, makeCanvas, angleDiff } from './util.js';
import { Atlas, drawSprite } from './atlas.js';
import { bakeCharacter, civilianStyles, enemyStyles, HERO_STYLE, paintBat, paintPipe } from './art/characters.js';
import { paintPigeon } from './art/city.js';
import { buildFx } from './art/fx.js';
import { World, SIZE, roadC, NB } from './world.js';
import { Traffic } from './traffic.js';
import { Npc } from './npc.js';
import { Hero, HYPER } from './hero.js';
import { Fx } from './fx.js';
import { Gore } from './gore.js';
import { Lighting } from './lighting.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';

const SONIC_DRAIN = 20;
const SONIC_MIN = 12;
// velocidad a la que se rompe la barrera del sonido (Mach 1 en el velocímetro)
const MACH1 = HYPER * 0.84;

class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.zk = 1;
    this.kick = 0;
    this.trauma = 0;
    this.sx = 0;
    this.sy = 0;
  }
  shake(a) {
    this.trauma = Math.min(1, this.trauma + a);
  }
  update(dt, tx, ty, rate, zk) {
    const a = 1 - Math.exp(-dt * rate);
    this.x += (tx - this.x) * a;
    this.y += (ty - this.y) * a;
    this.zk += (zk - this.zk) * (1 - Math.exp(-dt * 3));
    this.kick *= Math.exp(-dt * 7);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * 18;
    this.sx = rand(-s, s);
    this.sy = rand(-s, s);
  }
}

class Game {
  constructor() {
    this.root = document.getElementById('game');
    this.canvas = document.getElementById('view');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.$ = (id) => document.getElementById(id);
    this.input = new Input(this.root, this.canvas);
    this.input.onModeChange = (m) => this.root.classList.toggle('touch', m === 'touch');
    if (matchMedia('(pointer: coarse)').matches) this.input.setMode('touch');
    this.sfx = new Sfx();
    this.S = buildFx();
    this.atlas = new Atlas();
    this.bakeArt();
    this.world = new World(this.atlas);
    this.world.fx = this.S;
    this.traffic = new Traffic(this.atlas, this.world);
    this.fx = new Fx(this.S);
    this.gore = new Gore(this.atlas, this.fx);
    this.fx.stamper = (x, y, r, fn) => this.world.stamp(x, y, r, fn);
    this.lighting = new Lighting(this.S);
    this.camera = new Camera();
    this.view = { x0: 0, y0: 0, x1: 0, y1: 0 };
    this.base = { z: 1, tx: 0, ty: 0 };
    this.post = makeCanvas(2, 2);
    this.blur = makeCanvas(2, 2);
    this.spawn = { x: roadC(Math.floor(NB / 2)), y: roadC(Math.floor(NB / 2)) };
    this.resetRun();
    this.state = 'menu';
    this.time = 0;
    this.worldTime = 0;
    this.bindUi();
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') this.pause();
    });
    this.camera.x = this.spawn.x;
    this.camera.y = this.spawn.y;
    this.atlas.loadOverrides('assets/').then((n) => n && console.info(`HIPERSONIC: ${n} sprites sustituidos por PNG`));
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    window.__hipersonic = this;
  }

  bakeArt() {
    const A = this.atlas;
    this.props = { bat: A.add('bat', 26, 8, paintBat, { ax: 2 }), pipe: A.add('pipe', 26, 8, paintPipe, { ax: 2 }) };
    this.heroKit = bakeCharacter(A, 'hero', HERO_STYLE, 12.5);
    this.civKits = civilianStyles(26).map((s, i) => bakeCharacter(A, 'civ' + i, s, 12));
    this.enemyKits = enemyStyles().map((s, i) => bakeCharacter(A, 'en' + i, s, s.build > 1.15 ? 13.2 : 12.2));
    this.pigeonSpr = [A.add('pigeon0', 14, 8, (g) => paintPigeon(g, false)), A.add('pigeon1', 14, 20, (g) => paintPigeon(g, true))];
  }

  resetRun() {
    this.hero = new Hero(this.heroKit, this.spawn.x, this.spawn.y + 40);
    this.npcs = [];
    this.pigeons = [];
    this.fx && (this.fx.list.length = 0);
    this.gore && (this.gore.list.length = 0);
    this.sonic = { on: false, k: 0, wipe: 0, queue: [], release: [], clock: 0, dir: 0 };
    this.kos = 0;
    this.damage = 0;
    this.runTime = 0;
    this.spawnT = 0;
    this.enemyT = 4;
    this.flowT = 0;
    this.hitstop = 0;
    this.flashA = 0;
    this.redA = 0;
    this.overT = 0;
    this.hintT = 9;
    // civiles desde el principio, alrededor del punto de partida
    for (let i = 0; i < 40; i++) this.spawnCivilian(true);
  }

  /* ---------- interfaz ---------- */

  bindUi() {
    const $ = this.$;
    $('btn-play').addEventListener('click', () => this.start());
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-restart').addEventListener('click', () => this.restart());
    $('btn-again').addEventListener('click', () => this.restart());
    $('btn-pause').addEventListener('click', () => this.pause());
    $('btn-sound').addEventListener('click', () => {
      this.sfx.setMuted(!this.sfx.muted);
      $('btn-sound').textContent = this.sfx.muted ? 'Sonido: no' : 'Sonido: sí';
    });
    const unlock = () => this.sfx.unlock();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
  }

  setState(s) {
    this.state = s;
    this.root.className = this.root.className.replace(/\bstate-\S+/g, '').trim() + ' state-' + s;
    this.root.classList.toggle('touch', this.input.mode === 'touch');
  }
  start() {
    this.sfx.unlock();
    this.input.clear();
    this.setState('play');
  }
  pause() {
    if (this.state === 'play') this.setState('pause');
  }
  resume() {
    this.input.clear();
    this.setState('play');
  }
  restart() {
    this.resetRun();
    this.start();
  }

  toast(msg) {
    const el = this.$('toast');
    el.textContent = msg;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /* ---------- ventana ---------- */

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.cssW = w;
    this.cssH = h;
    this.camera.zoom = clamp(Math.sqrt(w * h) / 640, 1.1, 1.7);
    this.lighting.resize(this.canvas.width, this.canvas.height);
    this.post.width = this.canvas.width;
    this.post.height = this.canvas.height;
    this.blur.width = Math.ceil(this.canvas.width / 2);
    this.blur.height = Math.ceil(this.canvas.height / 2);
    this.vignette = this.makeVignette();
    this.world.setChunkScale(this.camera.zoom * this.dpr);
    this.world.maxChunks = (Math.ceil(w / this.camera.zoom / 512 / 0.82) + 2) * (Math.ceil(h / this.camera.zoom / 512 / 0.82) + 2) + 4;
  }

  makeVignette() {
    const W = Math.max(2, Math.round(this.canvas.width / 4));
    const H = Math.max(2, Math.round(this.canvas.height / 4));
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const r = Math.hypot(W, H) / 2;
    const gr = g.createRadialGradient(W / 2, H / 2, r * 0.4, W / 2, H / 2, r);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    return c;
  }

  mouseWorld() {
    const b = this.base;
    return { x: (this.input.mouse.x * this.dpr - b.tx) / b.z, y: (this.input.mouse.y * this.dpr - b.ty) / b.z };
  }
  aimAngle(h) {
    if (this.input.mode === 'mouse' && this.input.mouse.active) {
      const m = this.mouseWorld();
      const a = Math.atan2(m.y - h.y, m.x - h.x);
      // la cabeza sólo gira hasta cierto punto hacia el ratón
      return h.face + clamp(angleDiff(h.face, a), -1.1, 1.1);
    }
    return h.face;
  }

  /* ---------- bucle ---------- */

  loop(now) {
    // la marca de tiempo del primer fotograma puede ser anterior a la del arranque
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    try {
      if (this.state === 'play' || this.state === 'over') this.update(dt);
      else if (this.state === 'menu') this.updateMenu(dt);
      else if (this.state === 'pause' && this.input.consume('pause')) this.resume();
      if (this.state === 'menu' && this.input.consume('enter')) this.start();
      this.render();
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  updateMenu(dt) {
    this.time += dt;
    this.worldTime += dt;
    const h = this.hero;
    h.look = h.face + Math.sin(this.time * 0.7) * 0.8;
    this.population(dt);
    for (const n of this.npcs) n.update(dt, this);
    this.npcs = this.npcs.filter((n) => !n.dead);
    this.traffic.update(dt, this);
    this.fx.update(dt, dt);
    this.updatePigeons(dt);
    this.ambient(dt);
    const a = this.time * 0.08;
    this.camera.update(dt, this.spawn.x + Math.cos(a) * 260, this.spawn.y + Math.sin(a) * 180, 2, 1);
    this.input.clear();
  }

  update(dt) {
    this.time += dt;
    const h = this.hero;
    const S = this.sonic;
    if (this.state === 'play' && this.input.consume('pause')) {
      this.pause();
      return;
    }

    /* --- Sonic Time --- */
    if (this.state === 'play' && this.input.consume('sonic')) {
      if (!S.on && h.energy >= SONIC_MIN && h.alive) this.sonicStart();
      else if (S.on) this.sonicEnd();
      else this.toast('Energía sónica insuficiente');
    }
    if (S.on) {
      h.energy -= SONIC_DRAIN * dt;
      if (h.energy <= 0) {
        h.energy = 0;
        this.sonicEnd();
      }
    }
    S.k = clamp(S.k + (S.on ? dt / 0.32 : -dt / 0.45), 0, 1);
    S.wipe = clamp(S.wipe + (S.on ? dt / 0.4 : -dt / 0.35), 0, 1);
    this.updateRelease(dt);
    // el mundo se frena hasta detenerse; el héroe sigue a tiempo real
    let scale = Math.pow(1 - smooth(S.k), 2);
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      scale = 0;
    }
    const wdt = dt * scale;
    this.worldTime += wdt;
    if (h.alive) this.runTime += dt;

    h.update(dt, this);
    this.sfx.listener.x = h.x;
    this.sfx.listener.y = h.y;
    this.sfx.wind(h.speed, S.k);

    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.world.updateFlow(h.x, h.y);
      this.flowT = 0.25;
    }
    this.population(wdt);
    for (const n of this.npcs) n.update(wdt, this);
    if (wdt > 0) this.separate();
    this.dominoes();
    for (const n of this.npcs) {
      if (n.gibT > 0 && wdt > 0) {
        n.gibT -= wdt;
        if (n.gibT <= 0) {
          const v = n.rag ? n.rag.velocity() : { x: n.gibVx, y: n.gibVy };
          this.gibNpc(n, v.x, v.y, 1.3);
        }
      }
    }
    this.npcs = this.npcs.filter((n) => !n.dead);
    this.gore.update(wdt, this.world);
    this.traffic.update(wdt, this);
    this.fx.update(wdt, dt);
    this.updatePigeons(wdt);
    this.ambient(wdt);

    /* --- cámara: se adelanta en la dirección de la carrera --- */
    let lx = h.vx * 0.24;
    let ly = h.vy * 0.24;
    const ll = Math.hypot(lx, ly);
    if (ll > 260) (lx *= 260 / ll), (ly *= 260 / ll);
    const look = this.input.mode === 'mouse' && this.input.mouse.active ? 30 : 0;
    const tx = h.x + lx + Math.cos(h.look) * look;
    const ty = h.y + ly + Math.sin(h.look) * look;
    this.camera.update(dt, tx, ty, lerp(6, 10, h.hyper), 1 - h.hyper * 0.16);

    this.flashA = Math.max(0, this.flashA - dt * 3);
    this.redA = Math.max(0, this.redA - dt * 2);
    this.hintT -= dt;
    if (this.state === 'over') {
      this.overT -= dt;
      if (this.overT <= 0 && !this.root.classList.contains('state-over')) this.showOver();
    }
    this.updateHud();
  }

  /* ---------- Sonic Time ---------- */

  sonicStart() {
    const S = this.sonic;
    S.on = true;
    S.queue = [];
    this.sfx.sonicOn();
    const h = this.hero;
    this.fx.ring(h.x, h.y, 10, 520, 0.6, '120,200,255', 10, true);
    this.fx.wave(h.x, h.y, 1500, 0.5, 0.05, true);
    this.camera.kick = 0.06;
    this.root.classList.add('sonic');
  }

  sonicEnd() {
    const S = this.sonic;
    S.on = false;
    this.sfx.sonicOff();
    this.root.classList.remove('sonic');
    const h = this.hero;
    this.fx.ring(h.x, h.y, 600, 10, 0.4, '120,200,255', 8, true);
    // los golpes acumulados se ejecutan en cascada al volver el tiempo
    S.release = S.queue.map((q, i) => ({ ...q, at: 0.18 + i * 0.05 }));
    S.queue = [];
    S.clock = 0;
  }

  updateRelease(dt) {
    const S = this.sonic;
    if (!S.release.length) return;
    S.clock += dt;
    while (S.release.length && S.release[0].at <= S.clock) {
      const q = S.release.shift();
      if (q.npc) {
        // sale disparado con todo y se despedaza en el aire
        const n = q.npc;
        if (n.dead) continue;
        const k = 1.7 + q.n * 0.25;
        n.hp = Math.min(n.hp, 0);
        n.launch(q.vx * k, q.vy * k, q.vz + 380, rand(-14, 14));
        n.gibT = rand(0.08, 0.2);
        n.gibVx = q.vx * k;
        n.gibVy = q.vy * k;
      } else if (q.car) {
        q.car.impulse(q.vx * 1.8, q.vy * 1.8, q.x, q.y, q.dmg);
        q.car.launch(rand(380, 560), rand(-11, 11));
        if (!q.car.exploded) q.car.fuse = rand(0.15, 0.45);
        this.addDamage(q.dmg * 40);
        this.sfx.crash(q.x, q.y, 1);
        this.sfx.glass(q.x, q.y);
        this.fx.debris(q.x, q.y, q.vx, q.vy, 10, 'glass', 380);
      }
      this.fx.flash(q.x, q.y, 70, true);
      this.fx.ring(q.x, q.y, 6, 70, 0.3, '160,240,255', 5, true);
      this.fx.sparks(q.x, q.y, q.vx, q.vy, 10, '170,240,255', 520);
      this.fx.wave(q.x, q.y, 700, 0.3, 0.03, true);
      this.sfx.punch(true);
      this.camera.shake(0.22);
    }
  }

  // Acumula un golpe durante el Sonic Time (marca visual) o lo aplica de inmediato.
  queueOrHit(target, vx, vy, vz, dmg, x, y, isCar) {
    const S = this.sonic;
    if (S.on || S.k > 0.5) {
      const ex = S.queue.find((q) => (isCar ? q.car === target : q.npc === target));
      if (ex) {
        ex.vx += vx * 0.6;
        ex.vy += vy * 0.6;
        ex.vz += vz * 0.4;
        ex.dmg += dmg;
        ex.n++;
      } else S.queue.push({ npc: isCar ? null : target, car: isCar ? target : null, vx, vy, vz, dmg, x, y, n: 1, t: this.time });
      this.fx.add({ k: 'flash', x, y, vx: 0, vy: 0, life: 0.25, size: 46, real: true });
      // escombros que quedan suspendidos en el aire hasta que vuelva el tiempo
      this.fx.debris(x, y, vx, vy, 5, isCar ? 'glass' : 'concrete', 160);
      this.fx.dust(x, y, 2, 8);
      this.sfx.mark();
      return true;
    }
    return false;
  }

  /* ---------- impactos ---------- */

  hitNpc(n, vx, vy, power, dmg, src, gib) {
    if (n.dead || (!n.standing && n.state !== 'rag' && n.state !== 'ko')) return;
    const vz = power > 220 ? power * rand(0.35, 0.55) : 0;
    if (src === 'hero' && this.queueOrHit(n, vx, vy, vz, dmg, n.px, n.py, false)) return;
    // a Mach 1, arrollado por un auto lanzado o junto a una explosión: queda hecho pedazos
    if (gib || (src === 'car' && power > 380)) {
      this.gibNpc(n, vx, vy, Math.min(1.6, power / 700));
      return;
    }
    n.applyHit(this, vx, vy, vz, dmg, rand(-9, 9));
    if (power > 220) {
      this.fx.dust(n.x, n.y, 4, 9);
      this.sfx.thud(n.x, n.y, power / 600);
    }
  }

  // Contactos del héroe al moverse: atropellar peatones y embestir coches.
  heroContacts(h) {
    const sp = Math.hypot(h.vx, h.vy);
    const now = this.time;
    for (const n of this.npcs) {
      if (n.state === 'ko' || n.state === 'getup') continue;
      const dx = n.px - h.x;
      const dy = n.py - h.y;
      const R = n.r + h.r * 0.8;
      if (dx * dx + dy * dy > R * R) continue;
      if (n.state === 'rag' && n.rag.z > 30) continue;
      const d = Math.hypot(dx, dy) || 1;
      if (sp > 300) {
        if (now - n.lastHit < 0.3) continue;
        n.lastHit = now;
        const ux = h.vx / sp;
        const uy = h.vy / sp;
        // sale despedido hacia delante y hacia el lado en que lo tocó
        const side = (-uy * dx + ux * dy) / d;
        const p = sp * 0.95;
        this.hitNpc(n, ux * p - uy * side * p * 0.45, uy * p + ux * side * p * 0.45, p, sp * 0.06, 'hero', sp >= MACH1 * 0.95);
        this.fx.flash(n.px, n.py, 40, true);
        this.sfx.punch(sp > 600);
        this.camera.shake(0.08 + h.hyper * 0.1);
        if (!this.sonic.on) h.vx *= 0.94, (h.vy *= 0.94);
      } else if (n.standing) {
        // empuja con suavidad
        const o = (R - d) * 0.6;
        n.x += (dx / d) * o;
        n.y += (dy / d) * o;
        if (!this.sonic.on) {
          h.x -= (dx / d) * o * 0.4;
          h.y -= (dy / d) * o * 0.4;
        }
      }
    }
    for (const c of this.traffic.list) {
      if (Math.abs(c.x - h.x) > c.L || Math.abs(c.y - h.y) > c.L) continue;
      const q = c.distTo(h.x, h.y);
      const R = h.r * 0.85;
      if (q.d >= R) continue;
      const vn = -(h.vx * q.nx + h.vy * q.ny);
      if (vn > 380 && now - c.lastHit > 0.35) {
        c.lastHit = now;
        const mach = sp >= MACH1 * 0.92;
        const k = mach ? 2.6 : 0.95;
        const ix = h.vx * k;
        const iy = h.vy * k;
        const dmg = vn * 0.09;
        const hx = h.x - q.nx * R;
        const hy = h.y - q.ny * R;
        if (!this.queueOrHit(c, ix, iy, 0, dmg, hx, hy, true)) {
          c.impulse(ix, iy, hx, hy, dmg);
          this.onCarCrash(c, hx, hy, vn, null, true);
          if (mach) {
            // sale disparado dando vueltas y explota
            c.launch(rand(420, 620), rand(-12, 12));
            if (!c.exploded) c.fuse = rand(0.12, 0.4);
            this.fx.wave(hx, hy, 900, 0.4, 0.05, true);
            this.camera.shake(0.4);
            this.hitstop = 0.07;
          }
        }
        const loss = Math.max(0.2, 1 - c.m.weight * 0.13);
        h.vx *= loss;
        h.vy *= loss;
        h.charge *= loss;
      }
      // fuera de la carrocería
      h.x += q.nx * (R - q.d);
      h.y += q.ny * (R - q.d);
      const vn2 = h.vx * q.nx + h.vy * q.ny;
      if (vn2 < 0) {
        h.vx -= vn2 * q.nx;
        h.vy -= vn2 * q.ny;
      }
    }
  }

  punchTarget(h) {
    let best = null;
    let bd = 90;
    for (const n of this.npcs) {
      if (!n.standing || n.kind !== 'enemy') continue;
      const d = Math.hypot(n.x - h.x, n.y - h.y);
      if (d < bd) (bd = d), (best = n);
    }
    return best;
  }

  heroPunch(h) {
    const fx = Math.cos(h.face);
    const fy = Math.sin(h.face);
    const reach = h.r + 30;
    const sp = Math.hypot(h.vx, h.vy);
    let any = false;
    const px = h.x + fx * (h.r + 10);
    const py = h.y + fy * (h.r + 10);
    for (const n of this.npcs) {
      if (n.state === 'ko' || n.state === 'getup') continue;
      const dx = n.px - h.x;
      const dy = n.py - h.y;
      const d = Math.hypot(dx, dy);
      if (d > reach + n.r || Math.abs(angleDiff(h.face, Math.atan2(dy, dx))) > 1.1) continue;
      any = true;
      const power = n.kind === 'enemy' ? 360 + sp * 0.8 : 130 + sp * 0.6;
      this.hitNpc(n, (dx / (d || 1)) * power, (dy / (d || 1)) * power, power, n.kind === 'enemy' ? 18 : 4, 'hero', sp >= MACH1 * 0.85);
    }
    for (const c of this.traffic.list) {
      if (Math.abs(c.x - h.x) > c.L || Math.abs(c.y - h.y) > c.L) continue;
      const q = c.distTo(px, py);
      if (q.d > 12) continue;
      any = true;
      const imp = 620 + sp * 0.6;
      if (!this.queueOrHit(c, fx * imp, fy * imp, 0, 34, q.cx, q.cy, true)) {
        c.impulse(fx * imp, fy * imp, q.cx, q.cy, 34);
        this.onCarCrash(c, q.cx, q.cy, imp, null, true);
        if (sp >= MACH1 * 0.85) {
          c.impulse(fx * imp * 1.5, fy * imp * 1.5, q.cx, q.cy, 0);
          c.launch(rand(420, 620), rand(-12, 12));
          if (!c.exploded) c.fuse = rand(0.12, 0.4);
        }
      }
    }
    if (any) {
      this.sfx.punch(true);
      if (!this.sonic.on) {
        this.fx.flash(px, py, 50);
        this.fx.ring(px, py, 4, 40, 0.22, '255,240,200', 4);
        this.hitstop = 0.05;
      }
      this.camera.shake(0.18);
    }
  }

  onSonicBoom(h) {
    this.sfx.boom();
    const ang = Math.atan2(h.vy, h.vx);
    this.fx.ring(h.x, h.y, 12, 260, 0.55, '200,245,255', 12, true);
    this.fx.ring(h.x, h.y, 6, 150, 0.4, '255,255,255', 5, true);
    this.fx.wave(h.x, h.y, 1100, 0.6, 0.08, true);
    this.fx.flash(h.x, h.y, 120, true);
    // cono de aire: líneas que salen hacia atrás
    for (let i = 0; i < 24; i++) {
      const a = ang + Math.PI + rand(-1.1, 1.1);
      const s = rand(400, 900);
      this.fx.add({ k: 'spark', x: h.x, y: h.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.5), w: rand(1.5, 3), color: '220,250,255', real: true, drag: 3 });
    }
    this.fx.dust(h.x, h.y, 14, 16, '170,165,155', 260);
    this.camera.shake(0.45);
    this.camera.kick = 0.1;
    this.flashA = 0.35;
    // la onda lanza a todos los que están cerca, rompe cristales y vuelca los autos
    const R = 340;
    for (const n of this.npcs) {
      const dx = n.px - h.x;
      const dy = n.py - h.y;
      const d = Math.hypot(dx, dy);
      if (d > R || d < 1) continue;
      const p = 900 * (1 - d / R) + 260;
      this.hitNpc(n, (dx / d) * p, (dy / d) * p, p, 60, 'boom', d < 70);
    }
    for (const c of this.traffic.list) {
      const dx = c.x - h.x;
      const dy = c.y - h.y;
      const d = Math.hypot(dx, dy);
      if (d > R + 60 || d < 1) continue;
      const f = 1 - d / (R + 60);
      c.impulse((dx / d) * 1500 * f, (dy / d) * 1500 * f, c.x - (dx / d) * c.W * 0.5, c.y - (dy / d) * c.W * 0.5, 40 * f);
      c.launch(260 + 380 * f, (Math.random() < 0.5 ? -1 : 1) * (6 + 8 * f));
      if (c.glass < 3) {
        c.glass = 3;
        this.fx.debris(c.x, c.y, dx, dy, 10, 'glass', 320);
      }
    }
    this.sfx.glass(h.x, h.y);
    this.toast('¡BARRERA DEL SONIDO!');
  }

  onHeroWall(x, y, nx, ny, f, solid) {
    const k = Math.min(1, f / 900);
    this.camera.shake(0.2 + k * 0.4);
    this.sfx.wall(k);
    this.fx.debris(x, y, nx, ny, 6 + ((k * 14) | 0), 'concrete', 260 + f * 0.3);
    this.fx.dust(x, y, 6, 12, '150,145,135', 120);
    this.fx.sparks(x, y, nx, ny, 8, '255,220,150', 380);
    if (solid && solid.kind === 'building') this.fx.wallCrack(x, y, nx, ny);
    else if (solid) this.fx.crater(x, y, 6);
    this.addDamage(f * 0.6);
    if (k > 0.7) this.hitstop = 0.06;
  }

  onRagImpact(n, x, y, f, wall) {
    this.fx.dust(x, y, f > 600 ? 6 : 3, 9);
    if (f > 500) this.sfx.thud(x, y, f / 900);
    if (f > 900) {
      this.fx.crater(x, y, 9);
      this.camera.shake(0.08);
    }
    if (wall && f > 500) {
      this.fx.debris(x, y, wall.nx, wall.ny, 5, 'concrete', 200);
      this.fx.wallCrack(x, y, wall.nx, wall.ny);
    }
  }

  onCarCrash(c, x, y, f, hit, byHero) {
    if (c.hp <= 0 && !c.exploded && !c.fuse && f > 300) c.fuse = rand(0.2, 0.6);
    const k = Math.min(1, f / 900);
    this.sfx.crash(x, y, 0.4 + k);
    if (k > 0.4) this.sfx.glass(x, y);
    this.fx.sparks(x, y, x - c.x, y - c.y, 6 + ((k * 14) | 0), '255,210,120', 420);
    this.fx.debris(x, y, x - c.x, y - c.y, 4 + ((k * 8) | 0), pick(['glass', 'metal', 'paint']), 300);
    this.fx.flash(x, y, 30 + k * 40, false, 'warm');
    const d = Math.hypot(c.x - this.hero.x, c.y - this.hero.y);
    this.camera.shake((0.1 + k * 0.35) * Math.max(0, 1 - d / 700));
    this.addDamage(f * (byHero ? 1.2 : 0.6));
    if (hit && f > 300) this.fx.wallCrack(x, y, hit.nx, hit.ny);
    // los peatones cercanos se asustan
    for (const n of this.npcs) if (n.kind === 'civ' && n.standing && n.state !== 'flee' && Math.hypot(n.x - x, n.y - y) < 260) n.flee(this, rand(3, 5));
  }

  // Despedaza a un personaje: restos, órganos y sangre en la dirección del impacto.
  gibNpc(n, vx, vy, power = 1) {
    if (n.dead) return;
    n.dead = true;
    if (n.stars) n.stars.life = 0;
    const x = n.px;
    const y = n.py;
    this.gore.explode(n.kit, x, y, n.rag ? n.rag.face : n.face, vx, vy, power);
    this.sfx.splat(x, y);
    this.camera.shake(0.12);
    if (n.kind === 'enemy' && !n.counted) {
      n.counted = true;
      this.onKo(n);
    }
    // los civiles de alrededor salen corriendo
    for (const o of this.npcs) if (o.kind === 'civ' && o.standing && o.state !== 'flee' && Math.hypot(o.x - x, o.y - y) < 300) o.flee(this, rand(4, 6));
  }

  explodeCar(c) {
    if (c.exploded) return;
    c.burn();
    const x = c.x;
    const y = c.y;
    this.sfx.explosion(x, y);
    this.fx.flash(x, y, 160, false, 'warm');
    this.fx.flash(x, y, 90);
    this.fx.ring(x, y, 10, 220, 0.5, '255,190,110', 10);
    this.fx.wave(x, y, 900, 0.5, 0.07, true);
    this.fx.light(x, y, 420, 0.6);
    for (let i = 0; i < 30; i++) {
      const a = rand(0, TAU);
      const r = rand(0, 40);
      this.fx.add({ k: 'fire', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a) * rand(60, 260), vy: Math.sin(a) * rand(60, 260), life: rand(0.5, 1.1), size: rand(18, 34), drag: 2.5 });
    }
    for (let i = 0; i < 12; i++) this.fx.smoke(x + rand(-30, 30), y + rand(-20, 20), rand(18, 30), 1);
    this.fx.debris(x, y, 0, 0, 26, 'metal', 520);
    this.fx.debris(x, y, 0, 0, 14, 'glass', 420);
    this.fx.sparks(x, y, 1, 0, 30, '255,200,110', 700);
    this.fx.decal({ k: 'burn', x, y, r: c.L * 0.7, life: 120 });
    const d = Math.hypot(x - this.hero.x, y - this.hero.y);
    this.camera.shake(0.7 * Math.max(0, 1 - d / 900));
    if (d < 500) this.flashA = Math.max(this.flashA, 0.25 * (1 - d / 500));
    this.addDamage(2500 * c.m.weight);
    c.launch(rand(200, 340), rand(-6, 6));
    // la explosión lanza o despedaza a quien esté cerca y empuja a otros autos
    for (const n of this.npcs) {
      const dx = n.px - x;
      const dy = n.py - y;
      const dd = Math.hypot(dx, dy) || 1;
      if (dd > 220) continue;
      const p = 1100 * (1 - dd / 220) + 200;
      this.hitNpc(n, (dx / dd) * p, (dy / dd) * p, p, 80, 'blast', dd < 90);
    }
    for (const o of this.traffic.list) {
      if (o === c) continue;
      const dx = o.x - x;
      const dy = o.y - y;
      const dd = Math.hypot(dx, dy) || 1;
      if (dd > 200) continue;
      const f = 1 - dd / 200;
      o.impulse((dx / dd) * 1100 * f, (dy / dd) * 1100 * f, o.x - (dx / dd) * 10, o.y - (dy / dd) * 10, 70 * f);
      o.launch(200 * f + 80, rand(-6, 6) * f);
      // reacción en cadena
      if (o.hp <= 0 && !o.exploded && !o.fuse) o.fuse = rand(0.3, 0.8);
    }
    const h = this.hero;
    if (d < 150 && h.alive) {
      h.kx += ((h.x - x) / (d || 1)) * 500;
      h.ky += ((h.y - y) / (d || 1)) * 500;
    }
  }

  onKo(n) {
    this.kos++;
    this.hero.energy = Math.min(100, this.hero.energy + 6);
    this.sfx.ko();
  }
  onHeroHurt(dmg) {
    this.camera.shake(0.3);
    this.redA = Math.min(1, this.redA + 0.6);
    this.sfx.hurt();
  }
  onHeroDeath() {
    this.state = 'over';
    this.overT = 2.4;
    if (this.sonic.on) this.sonicEnd();
  }
  showOver() {
    const $ = this.$;
    $('o-time').textContent = fmtTime(this.runTime);
    $('o-kos').textContent = this.kos;
    $('o-mach').textContent = (this.hero.topSpeed / (HYPER * 0.84)).toFixed(2);
    $('o-dmg').textContent = '$' + Math.round(this.damage).toLocaleString('es');
    this.setState('over');
  }
  addDamage(v) {
    this.damage += v;
  }

  /* ---------- poblaciones ---------- */

  spawnCivilian(anywhere) {
    const cam = anywhere ? this.spawn : this.camera;
    const rings = this.world.walkRings.filter((r) => Math.abs((r.x0 + r.x1) / 2 - cam.x) < 1300 && Math.abs((r.y0 + r.y1) / 2 - cam.y) < 1300);
    if (!rings.length) return;
    const n = new Npc('civ', pick(this.civKits), 0, 0);
    n.ring = pick(rings);
    n.u = rand(0, 4000);
    const [x, y] = n.ringPoint(n.u);
    const v = this.view;
    if (!anywhere && x > v.x0 - 60 && x < v.x1 + 60 && y > v.y0 - 60 && y < v.y1 + 60) return;
    if (this.world.blocked(x, y, 8)) return;
    n.x = x;
    n.y = y;
    this.npcs.push(n);
  }

  spawnEnemies(count) {
    const h = this.hero;
    for (let tries = 0; tries < 12; tries++) {
      const a = rand(0, TAU);
      const d = rand(800, 1050);
      const x = clamp(h.x + Math.cos(a) * d, 60, SIZE - 60);
      const y = clamp(h.y + Math.sin(a) * d, 60, SIZE - 60);
      if (this.world.blocked(x, y, 30)) continue;
      for (let i = 0; i < count; i++) {
        const n = new Npc('enemy', pick(this.enemyKits), x + rand(-30, 30), y + rand(-30, 30));
        if (!this.world.blocked(n.x, n.y, 10)) this.npcs.push(n);
      }
      return;
    }
  }

  population(dt) {
    if (dt <= 0) return;
    this.spawnT -= dt;
    const cam = this.camera;
    if (this.spawnT <= 0) {
      this.spawnT = 0.4;
      let civ = 0;
      for (const n of this.npcs) if (n.kind === 'civ' && Math.abs(n.x - cam.x) < 1300 && Math.abs(n.y - cam.y) < 1300) civ++;
      if (civ < 40) this.spawnCivilian(false);
      // los que quedan muy lejos desaparecen
      for (const n of this.npcs) if (n.kind === 'civ' && (Math.abs(n.x - cam.x) > 1800 || Math.abs(n.y - cam.y) > 1800)) n.dead = true;
      if (this.pigeons.length < 24 && Math.random() < 0.5) this.spawnPigeons();
    }
    if (this.state !== 'play') return;
    this.enemyT -= dt;
    if (this.enemyT <= 0) {
      this.enemyT = rand(3, 6);
      const want = Math.min(18, 3 + Math.floor(this.runTime / 20));
      let alive = 0;
      for (const n of this.npcs) if (n.kind === 'enemy' && n.state !== 'ko') alive++;
      if (alive < want) this.spawnEnemies(Math.min(want - alive, 2 + ((Math.random() * 3) | 0)));
    }
  }

  // Los peatones de pie no se amontonan.
  separate() {
    const L = this.npcs;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.standing) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.standing) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const R = (a.r + b.r) * 0.8;
        if (Math.abs(dx) > R || Math.abs(dy) > R) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R * R || d2 < 1e-4) continue;
        const d = Math.sqrt(d2);
        const o = (R - d) * 0.5;
        a.x -= (dx / d) * o;
        a.y -= (dy / d) * o;
        b.x += (dx / d) * o;
        b.y += (dy / d) * o;
      }
    }
  }

  // Un cuerpo volando derriba a los que encuentra en su camino.
  dominoes() {
    for (const a of this.npcs) {
      if (a.state !== 'rag' || a.rag.z > 40) continue;
      const v = a.rag.velocity();
      const sp = Math.hypot(v.x, v.y);
      if (sp < 280) continue;
      for (const b of this.npcs) {
        if (b === a || !b.standing) continue;
        const dx = b.x - a.rag.x;
        const dy = b.y - a.rag.y;
        if (dx * dx + dy * dy > (a.r + b.r) * (a.r + b.r)) continue;
        this.hitNpc(b, v.x * 0.65, v.y * 0.65, sp * 0.65, sp * 0.03, 'domino');
        a.rag.push(-v.x * 0.25, -v.y * 0.25, 0);
      }
    }
  }

  /* ---------- palomas y ambiente ---------- */

  spawnPigeons() {
    const cam = this.camera;
    const v = this.view;
    for (let t = 0; t < 6; t++) {
      const ring = pick(this.world.walkRings);
      if (Math.abs(ring.x0 - cam.x) > 1100 || Math.abs(ring.y0 - cam.y) > 1100) continue;
      const side = (Math.random() * 4) | 0;
      const x = side === 0 || side === 2 ? rand(ring.x0, ring.x1) : side === 1 ? ring.x1 + 10 : ring.x0 - 10;
      const y = side === 1 || side === 3 ? rand(ring.y0, ring.y1) : side === 0 ? ring.y0 - 10 : ring.y1 + 10;
      if (x > v.x0 - 40 && x < v.x1 + 40 && y > v.y0 - 40 && y < v.y1 + 40) continue;
      const n = 3 + ((Math.random() * 5) | 0);
      for (let i = 0; i < n; i++) this.pigeons.push({ x: x + rand(-22, 22), y: y + rand(-22, 22), ang: rand(0, TAU), fly: false, z: 0, vx: 0, vy: 0, t: rand(0, 2) });
      return;
    }
  }

  updatePigeons(dt) {
    if (dt <= 0) return;
    const h = this.hero;
    for (const p of this.pigeons) {
      p.t -= dt;
      if (!p.fly) {
        const d = Math.hypot(p.x - h.x, p.y - h.y);
        let scare = d < 90 || (d < 240 && h.speed > 300);
        for (const n of this.npcs) if (!scare && n.standing && Math.abs(n.x - p.x) < 30 && Math.abs(n.y - p.y) < 30) scare = true;
        if (scare) {
          p.fly = true;
          const a = Math.atan2(p.y - h.y, p.x - h.x) + rand(-0.6, 0.6);
          const s = rand(160, 260);
          p.vx = Math.cos(a) * s;
          p.vy = Math.sin(a) * s;
          p.ang = a;
        } else if (p.t <= 0) {
          // picotea y da pasitos
          p.t = rand(0.4, 1.6);
          p.ang += rand(-1.2, 1.2);
          p.hop = 0.2;
        }
        if (p.hop > 0) {
          p.hop -= dt;
          p.x += Math.cos(p.ang) * 30 * dt;
          p.y += Math.sin(p.ang) * 30 * dt;
        }
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z = Math.min(140, p.z + 120 * dt);
      }
    }
    const v = this.view;
    this.pigeons = this.pigeons.filter((p) => !(p.fly && (p.x < v.x0 - 200 || p.x > v.x1 + 200 || p.y < v.y0 - 200 || p.y > v.y1 + 200)) && Math.abs(p.x - this.camera.x) < 1700 && Math.abs(p.y - this.camera.y) < 1700);
  }

  ambient(dt) {
    if (dt <= 0) return;
    const v = this.view;
    for (const s of this.world.steam) {
      if (s.x < v.x0 - 60 || s.x > v.x1 + 60 || s.y < v.y0 - 60 || s.y > v.y1 + 60) continue;
      s.t -= dt;
      if (s.t <= 0) {
        s.t = rand(0.12, 0.3);
        this.fx.smoke(s.x + rand(-6, 6), s.y + rand(-6, 6), rand(8, 13), 0);
      }
    }
  }

  /* ---------- dibujo ---------- */

  render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cam = this.camera;
    const h = this.hero;
    const S = this.S;
    const z = cam.zoom * cam.zk * (1 + cam.kick) * this.dpr;
    const tx = Math.round(W / 2 - (cam.x + cam.sx) * z);
    const ty = Math.round(H / 2 - (cam.y + cam.sy) * z);
    const b = this.base;
    b.z = z;
    b.tx = tx;
    b.ty = ty;
    const v = this.view;
    v.x0 = -tx / z;
    v.y0 = -ty / z;
    v.x1 = (W - tx) / z;
    v.y1 = (H - ty) / z;
    const sk = this.sonic.k;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#1d1f22';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(z, 0, 0, z, tx, ty);
    this.world.collectVisible(v);
    this.world.drawGround(ctx, v);
    this.fx.drawDecals(ctx, v);

    // sombras (debajo de todo lo que se mueve)
    const lamps = this.world.vis.lamps.filter((l) => l.hx > v.x0 - 220 && l.hx < v.x1 + 220 && l.hy > v.y0 - 220 && l.hy < v.y1 + 220);
    this.traffic.drawShadows(ctx, S, v);
    const onScreen = (n) => n.px > v.x0 - 60 && n.px < v.x1 + 60 && n.py > v.y0 - 60 && n.py < v.y1 + 60;
    const vis = this.npcs.filter(onScreen);
    for (const n of vis) n.drawShadow(ctx, S, lamps);
    h.drawShadow(ctx, S);
    this.gore.drawShadows(ctx, S, v);
    for (const p of this.pigeons) {
      if (p.z > 0) {
        ctx.globalAlpha = 0.3 * Math.max(0, 1 - p.z / 160);
        ctx.drawImage(S.shadow, p.x + p.z * 0.4 - 5, p.y + p.z * 0.3 - 5, 10, 10);
      }
    }
    ctx.globalAlpha = 1;

    this.traffic.draw(ctx, v, this.worldTime);
    for (const p of this.pigeons) {
      if (p.x < v.x0 - 20 || p.x > v.x1 + 20 || p.y < v.y0 - 20 || p.y > v.y1 + 20) continue;
      const flap = p.fly && Math.sin(this.worldTime * 30 + p.x) > 0;
      const k = 1 + p.z / 200;
      drawSprite(ctx, this.pigeonSpr[flap ? 1 : 0], p.x, p.y - p.z * 0.3, p.ang, k, k);
    }
    const low = [];
    const high = [];
    for (const n of vis) (n.rag && n.rag.z > 34 ? high : low).push(n);
    // los noqueados, debajo; los de pie, encima
    low.sort((a, b) => (a.standing ? 1 : 0) - (b.standing ? 1 : 0));
    for (const n of low) n.draw(ctx, this.props);
    this.gore.draw(ctx, v, false);
    this.fx.drawNormal(ctx, v);
    this.world.drawOverhead(ctx, v, this.worldTime, h.alive ? h : null);
    for (const n of high) n.draw(ctx, this.props);
    this.gore.draw(ctx, v, true);

    // iluminación
    this.lighting.render(this, b, v);
    this.lighting.composite(ctx, W, H);
    ctx.setTransform(z, 0, 0, z, tx, ty);
    this.lighting.glow(ctx, this, v);
    this.fx.drawGlow(ctx, v, this.worldTime);
    h.drawTrail(ctx, S, sk);

    // posprocesado
    if (h.hyper > 0.2 && this.state !== 'menu') this.motionBlur(ctx, W, H, h);
    if (this.sonic.wipe > 0) this.sonicTint(ctx, W, H);
    if (this.fx.waves.length) this.distortion(ctx, W, H);

    // marcas del Sonic Time, el héroe y sus fantasmas
    ctx.setTransform(z, 0, 0, z, tx, ty);
    this.drawMarks(ctx);
    h.drawGhosts(ctx, sk);
    h.draw(ctx, S);

    // capa de pantalla
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (h.hyper > 0.3 && this.state !== 'menu') this.speedLines(ctx, W, H, h);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.vignette, 0, 0, W, H);
    ctx.globalAlpha = 1;
    if (this.redA > 0.01 || (h.alive && h.hp < 30)) {
      const a = Math.max(this.redA * 0.6, h.alive && h.hp < 30 ? (Math.sin(this.time * 6) * 0.5 + 0.5) * 0.3 : 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ff3a2a';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (this.flashA > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = '#cfefff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // Desenfoque direccional barato: la imagen a media resolución, desplazada contra el
  // movimiento y mezclada con poca opacidad.
  motionBlur(ctx, W, H, h) {
    const bg = this.blur.getContext('2d');
    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.drawImage(this.canvas, 0, 0, this.blur.width, this.blur.height);
    const sp = Math.hypot(h.vx, h.vy) || 1;
    const k = h.hyper * 12 * this.dpr;
    const dx = (-h.vx / sp) * k;
    const dy = (-h.vy / sp) * k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 1; i <= 2; i++) {
      ctx.globalAlpha = 0.26 * h.hyper;
      ctx.drawImage(this.blur, dx * i * 0.7, dy * i * 0.7, W, H);
    }
    ctx.globalAlpha = 1;
  }

  // Sonic Time: el color se drena desde el héroe hacia fuera y todo se vuelve azul.
  sonicTint(ctx, W, H) {
    const S = this.sonic;
    const b = this.base;
    const h = this.hero;
    const hx = h.x * b.z + b.tx;
    const hy = h.y * b.z + b.ty;
    const far = Math.hypot(Math.max(hx, W - hx), Math.max(hy, H - hy));
    const R = smooth(S.wipe) * far * 1.05;
    const k = Math.max(S.k, S.wipe * 0.8);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    if (R < far) {
      ctx.beginPath();
      ctx.arc(hx, hy, R, 0, TAU);
      ctx.clip();
    }
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = 0.8 * k;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = k;
    ctx.fillStyle = '#6f95e8';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.5 * k;
    ctx.fillStyle = '#0d2c5c';
    ctx.fillRect(0, 0, W, H);
    // líneas de barrido muy sutiles
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.05 * k;
    ctx.fillStyle = '#9fe8ff';
    const off = (this.time * 40 * this.dpr) % (6 * this.dpr);
    for (let y = off; y < H; y += 6 * this.dpr) ctx.fillRect(0, y, W, this.dpr);
    ctx.restore();
    // borde luminoso del barrido mientras avanza
    if (R > 0 && R < far) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9 * (1 - R / far);
      ctx.strokeStyle = '#8fe9ff';
      ctx.lineWidth = 10 * this.dpr;
      ctx.beginPath();
      ctx.arc(hx, hy, R, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 3 * this.dpr;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // Ondas de choque: un anillo de la imagen se dibuja ampliado (refracción estilizada).
  distortion(ctx, W, H) {
    const pg = this.post.getContext('2d');
    pg.setTransform(1, 0, 0, 1, 0, 0);
    pg.drawImage(this.canvas, 0, 0);
    const b = this.base;
    for (const w of this.fx.waves) {
      const u = w.t / w.life;
      const R = w.speed * w.t * b.z;
      const th = (26 + 30 * u) * this.dpr;
      const cx = w.x * b.z + b.tx;
      const cy = w.y * b.z + b.ty;
      const s = 1 + w.strength * (1 - u);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.arc(cx, cy, R + th, 0, TAU);
      ctx.arc(cx, cy, Math.max(0, R - th), 0, TAU, true);
      ctx.clip();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
      ctx.drawImage(this.post, 0, 0);
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 * (1 - u);
      ctx.strokeStyle = '#bff4ff';
      ctx.lineWidth = 2 * this.dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  drawMarks(ctx) {
    const S = this.sonic;
    const list = S.queue.length ? S.queue : S.release;
    if (!list.length) return;
    const t = this.time;
    for (const q of list) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 10 + q.x);
      if (q.npc) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45 * pulse;
        q.npc.draw(ctx, this.props, 'ghost');
      } else if (q.car) {
        const c = q.car;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.ang);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.7 * pulse;
        ctx.strokeStyle = '#5fe6ff';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-c.L / 2 - 2, -c.W / 2 - 2, c.L + 4, c.W + 4);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = pulse;
      const s = 26 + q.n * 8;
      ctx.drawImage(this.S.star, q.x - s, q.y - s, s * 2, s * 2);
      // retícula giratoria
      ctx.strokeStyle = 'rgba(140,240,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = t * 3 + (i / 4) * TAU;
        ctx.arc(q.x, q.y, 18 + q.n * 3, a, a + 0.9);
        ctx.moveTo(q.x + Math.cos(a + TAU / 4) * (18 + q.n * 3), q.y + Math.sin(a + TAU / 4) * (18 + q.n * 3));
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  speedLines(ctx, W, H, h) {
    const sp = Math.hypot(h.vx, h.vy) || 1;
    const ux = h.vx / sp;
    const uy = h.vy / sp;
    const a = (h.hyper - 0.3) / 0.7;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) * 0.42;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(200,240,255,${0.22 * a})`;
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const ang = rand(0, TAU);
      const d = R + rand(0, Math.max(W, H) * 0.5);
      const x = cx + Math.cos(ang) * d;
      const y = cy + Math.sin(ang) * d;
      const len = rand(60, 220) * this.dpr * a;
      ctx.lineWidth = rand(1, 2.5) * this.dpr;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - ux * len, y - uy * len);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- HUD ---------- */

  updateHud() {
    const h = this.hero;
    const $ = this.$;
    const set = (id, prop, val) => {
      const el = (this.hudCache || (this.hudCache = {}))[id] || (this.hudCache[id] = $(id));
      if (el['_' + prop] !== val) {
        el['_' + prop] = val;
        if (prop === 'text') el.textContent = val;
        else el.style[prop] = val;
      }
    };
    set('hp-fill', 'width', (h.hp / h.maxHp) * 100 + '%');
    set('hp-val', 'text', String(Math.ceil(h.hp)));
    set('en-fill', 'width', h.energy + '%');
    const mach = h.speed / (HYPER * 0.84);
    set('mach', 'text', mach.toFixed(2));
    set('spd-fill', 'width', clamp(mach / 1.2, 0, 1) * 100 + '%');
    set('time', 'text', fmtTime(this.runTime));
    set('kos', 'text', String(this.kos));
    set('dmg', 'text', '$' + Math.round(this.damage).toLocaleString('es'));
    this.root.classList.toggle('supersonic', mach >= 1);
    this.root.classList.toggle('low-energy', h.energy < SONIC_MIN);
    this.root.classList.toggle('hint-off', this.hintT <= 0);
  }
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

function boot() {
  try {
    new Game();
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:auto 16px 16px;color:#e6e0d2;font:16px sans-serif">No se pudo iniciar el juego: ${String(err.message || err)}</p>`);
  }
}
boot();

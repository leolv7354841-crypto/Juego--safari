// Modo cooperativo para 2 jugadores (sin competitivo), 2 veces más difícil.
//
// El anfitrión simula todo el mundo (zombis, oleadas, estructuras, explosiones) y le manda
// al invitado ~12 veces por segundo una "foto" de lo que hay cerca de él, más los efectos
// visuales y sonidos que ocurrieron (se graban al llamarse y el invitado los repite).
// El invitado mueve a su personaje en su propio celular (sin retraso), dispara balas de
// adorno al instante y le avisa al anfitrión, que crea las balas que de verdad hacen daño.
// Cada jugador tiene su propio dinero, armas, vida y mejoras; la experiencia es del equipo.
import { Net } from './net.js';
import { Player } from './player.js';
import { ZOMBIES, WEAPONS, SHOP, BUILD_ORDER, GOLDEN } from './config.js';
import { zombieSprites, drawSurvivor } from './sprites.js';
import { Bullets } from './bullets.js';
import { rand, angleTo, TAU } from './util.js';

const TYPES = ['normal', 'swat', 'sprinter', 'fat', 'heavy', 'golden', 'bull', 'giant'];
const PICKS = ['ammo', 'med', 'crate'];
const SNAP_HZ = 12;
const IN_HZ = 20;
const VIEW = 1000;
// fotos del mundo sin confirmar que se permiten "en camino" hacia el invitado
const WINDOW = 6;
const FX_MAX = 500;
// efectos que el invitado genera por su cuenta (no hace falta mandarlos)
const PARTICLE_SKIP = new Set(['constructor', 'add', 'update', 'draw', 'clear', 'rocketTrail', 'burning']);
const SFX_SYNC = ['shot', 'hit', 'kill', 'stomp', 'explosion', 'acid', 'ricochet', 'blockHit', 'blockBreak', 'build', 'turret', 'goldenSpawn', 'punch', 'bullRoar', 'bullCharge', 'bullHit', 'bullSlam', 'throwBottle', 'molotov', 'crackle', 'burnScream', 'rocketStick', 'rocketArm', 'gore', 'wave'];
const DECAL_SYNC = ['corpse', 'splat', 'drip', 'acid'];

const r100 = (v) => Math.round(v * 100);

// Reloj de llegada: convierte la hora del otro celular en la nuestra y calcula cuánto
// atrasar el dibujo para tener siempre dos posiciones entre las que trazar el camino,
// aunque los datos lleguen disparejos o en grupitos (sobre todo por Firebase).
class Clock {
  constructor() {
    this.off = null;
    this.prevTs = null;
    this.gap = 100;
    this.late = 20;
  }
  stamp(ts) {
    const now = performance.now();
    if (!Number.isFinite(ts)) return now;
    const raw = now - ts;
    if (this.off === null || raw < this.off) this.off = raw;
    else this.off += (raw - this.off) * 0.002;
    this.late += (raw - this.off - this.late) * 0.1;
    if (this.prevTs !== null && ts > this.prevTs) this.gap += (Math.min(600, ts - this.prevTs) - this.gap) * 0.1;
    this.prevTs = ts;
    return ts + this.off;
  }
  get delay() {
    return Math.max(70, Math.min(450, this.gap * 1.3 + this.late * 1.5 + 25));
  }
}

// Guarda las últimas posiciones recibidas de algo que se mueve.
function track(o, t, x, y) {
  const s = o.trk || (o.trk = []);
  if (s.length && t - s[s.length - 1][0] > 1000) s.length = 0;
  if (s.length && t <= s[s.length - 1][0]) return;
  s.push([t, x, y]);
  if (s.length > 5) s.shift();
}

// Coloca o en su posición a la hora t (entre dos posiciones; un poquito hacia delante si faltan datos).
function place(o, t) {
  const s = o.trk;
  if (!s || !s.length) return;
  if (s.length === 1 || t <= s[0][0]) {
    o.x = s[0][1];
    o.y = s[0][2];
    return;
  }
  for (let i = s.length - 1; i > 0; i--) {
    const a = s[i - 1];
    const b = s[i];
    if (t >= a[0] && (t <= b[0] || i === s.length - 1)) {
      const span = b[0] - a[0] || 1;
      const k = Math.min((t - a[0]) / span, 1 + 150 / span);
      o.x = a[1] + (b[1] - a[1]) * k;
      o.y = a[2] + (b[2] - a[2]) * k;
      return;
    }
  }
}

export class Coop {
  constructor(game) {
    this.game = game;
    this.net = new Net();
    this.mode = null; // 'host' | 'guest'
    this.peer = null; // host: el compañero simulado · guest: el anfitrión (sólo para dibujarlo)
    this.peerName = '';
    this.fx = [];
    this.rec = false;
    this.depth = 0;
    this.orig = [];
    this.sendT = 0;
    this.inT = 0;
    this.snapN = 0;
    this.zmap = new Map();
    this.fireMap = new Map();
    this.remoteBullets = [];
    this.pendingBuild = null;
    this.lastDs = null;
    this.levelSeen = 1;
    this.clock = new Clock();
  }

  get active() {
    return !!this.mode;
  }
  get isHost() {
    return this.mode === 'host';
  }
  get isGuest() {
    return this.mode === 'guest';
  }

  send(m, fast = false) {
    if (this.net.open) this.net.send(m, fast);
  }

  myName() {
    const acc = this.game.accounts.current;
    return acc ? acc.name : 'Jugador';
  }

  /* ---------- sala ---------- */

  async create(onCode) {
    this.net.onMessage = (m) => this.onMessage(m);
    this.net.onClose = () => this.lost();
    await this.net.host(onCode);
    this.startHost();
  }

  async join(code) {
    this.net.onMessage = (m) => this.onMessage(m);
    this.net.onClose = () => this.lost();
    await this.net.join(code);
    this.send({ t: 'hello', name: this.myName() });
  }

  cancel() {
    this.net.close();
  }

  /* ---------- inicio de partida ---------- */

  startHost() {
    const g = this.game;
    g.sfx.unlock();
    g.newWorld();
    g.resetRun();
    this.mode = 'host';
    this.clock = new Clock();
    this.snapSeq = 0;
    this.peerAck = 0;
    g.coopRun = true;
    g.director.coop = true;
    const s = g.world.spawn;
    this.peer = new Player(s.x + 46, s.y + 10);
    this.peer.remote = true;
    this.peer.tx = this.peer.x;
    this.peer.ty = this.peer.y;
    this.installRecording();
    this.send({ t: 'start', seed: g.world.seedBase, x: Math.round(this.peer.x), y: Math.round(this.peer.y), name: this.myName() });
    g.input.reset();
    g.input.setRun(false);
    g.setState('play');
    g.updateHud(true);
    g.toast('¡Cooperativo! Hordas 2 veces más difíciles');
  }

  // El anfitrión vuelve a empezar con el mismo compañero (después de perder).
  restart() {
    if (!this.isHost) return;
    this.uninstall();
    this.startHost();
  }

  startGuest(m) {
    const g = this.game;
    g.sfx.unlock();
    g.newWorld(m.seed);
    g.resetRun();
    this.mode = 'guest';
    this.clock = new Clock();
    this.lastSeq = 0;
    g.coopRun = true;
    this.peerName = m.name || 'Anfitrión';
    g.director.coop = true;
    g.director.state = 'waiting';
    g.player.x = m.x;
    g.player.y = m.y;
    this.peer = new Player(g.world.spawn.x, g.world.spawn.y);
    this.peer.puppet = true;
    this.zmap.clear();
    this.fireMap.clear();
    this.remoteBullets = [];
    this.lastDs = null;
    this.levelSeen = 1;
    g.camera.x = m.x;
    g.camera.y = m.y;
    g.input.reset();
    g.input.setRun(false);
    g.setState('play');
    g.updateHud(true);
    g.toast('¡Conectado! Hordas 2 veces más difíciles');
  }

  /* ---------- efectos grabados (anfitrión) ---------- */

  installRecording() {
    const g = this.game;
    const self = this;
    const wrap = (obj, tag, names) => {
      for (const n of names) {
        const f = obj[n];
        if (typeof f !== 'function') continue;
        this.orig.push([obj, n]);
        obj[n] = function (...args) {
          if (self.rec && self.depth === 0 && self.fx.length < FX_MAX && self.nearPeer(tag, n, args)) {
            self.fx.push([tag, n, tag === 'd' && n === 'corpse' ? self.packCorpse(args) : args]);
          }
          self.depth++;
          try {
            return f.apply(this, args);
          } finally {
            self.depth--;
          }
        };
      }
    };
    const pn = Object.getOwnPropertyNames(Object.getPrototypeOf(g.particles)).filter((n) => !PARTICLE_SKIP.has(n));
    wrap(g.particles, 'p', pn);
    wrap(g.decals, 'd', DECAL_SYNC);
    wrap(g.sfx, 's', SFX_SYNC);
    wrap(g.camera, 'c', ['shake']);
    wrap(g, 'g', ['banner']);
    this.rec = true;
  }

  uninstall() {
    for (const [obj, n] of this.orig) delete obj[n];
    this.orig = [];
    this.rec = false;
    this.fx = [];
  }

  // Los efectos visuales lejos del compañero no se mandan (no los vería y gastan conexión).
  nearPeer(tag, n, args) {
    const q = this.peer;
    if (!q || (tag !== 'p' && tag !== 'd')) return true;
    const o = n === 'corpse' ? args[0] : null;
    const x = o ? o.x : args[0];
    const y = o ? o.y : args[1];
    if (typeof x !== 'number' || typeof y !== 'number') return true;
    return Math.abs(x - q.x) < VIEW && Math.abs(y - q.y) < VIEW;
  }

  packCorpse([z, dx, dy]) {
    return [{ type: z.type, si: z.si | 0, x: Math.round(z.x), y: Math.round(z.y), r: z.r, a: r100(z.angle) / 100, burnt: !!z.burnt }, dx, dy];
  }

  // Ejecuta algo sin grabarlo (lo que provoca el invitado ya lo vio en su celular).
  quiet(fn) {
    const was = this.rec;
    this.rec = false;
    try {
      return fn();
    } finally {
      this.rec = was;
    }
  }

  withPlayer(pl, fn) {
    const g = this.game;
    const saved = g.player;
    g.player = pl;
    try {
      return fn();
    } finally {
      g.player = saved;
    }
  }

  /* ---------- cada fotograma ---------- */

  tick(dt) {
    if (!this.mode) return;
    this.net.check();
    if (this.isHost) this.hostTick(dt);
    else this.guestTick(dt);
  }

  hostTick(dt) {
    const g = this.game;
    const peer = this.peer;
    if (!peer) return;
    place(peer, performance.now() - this.clock.delay);
    this.turn(peer, dt);
    peer.flashT -= dt;
    peer.hurtT -= dt;
    peer.recoil = Math.max(0, peer.recoil - dt * 8);
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 1 / SNAP_HZ;
    // empujones que recibió el compañero (golpes, cornadas): los aplica su celular
    if (Math.abs(peer.kx) + Math.abs(peer.ky) > 1) {
      this.send({ t: 'k', x: Math.round(peer.kx), y: Math.round(peer.ky) });
      peer.kx = 0;
      peer.ky = 0;
    }
    // control de flujo: si el celular del compañero va atrasado, se espera a que confirme
    // (si no, las fotos se amontonan y su juego se queda cada vez más atrás)
    if (this.snapSeq - (this.peerAck || 0) > WINDOW && performance.now() - (this.lastSnapAt || 0) < 1500) return;
    if (this.fx.length) {
      this.send({ t: 'fx', e: this.fx });
      this.fx = [];
    }
    if (g.state !== 'menu') {
      this.send(this.snapshot(), true);
      this.lastSnapAt = performance.now();
    }
  }

  snapshot() {
    const g = this.game;
    const peer = this.peer;
    const near = (x, y, m = VIEW) => Math.abs(x - peer.x) < m && Math.abs(y - peer.y) < m;
    const ox = Math.round(peer.x);
    const oy = Math.round(peer.y);
    const z = [];
    const zx = [];
    for (const o of g.horde.list) {
      if (o.dead || !near(o.x, o.y)) continue;
      const flags = (o.flash > 0 ? 1 : 0) | (o.burn > 0 ? 2 : 0) | (o.wounded ? 4 : 0) | (o.bs === 'windup' ? 8 : 0)
        | (o.hitT > 0 ? 16 : 0) | (o.type === 'golden' && o.life < GOLDEN.warnAt ? 32 : 0) | (o.lunge > 0.3 ? 64 : 0);
      // compacto: posición relativa al compañero y ángulo en 64 pasos
      z.push(o.id, TYPES.indexOf(o.type), Math.round(o.x - ox), Math.round(o.y - oy), Math.round((o.angle / TAU) * 64) & 63, flags);
      if (o.air > 0 || o.swell > 0) zx.push(o.id, Math.round(o.air || 0), r100(o.swell || 0));
    }
    const st = g.structures;
    const s = {
      t: 's', q: ++this.snapSeq, ts: Math.round(performance.now()), o: [ox, oy], zx, w: g.director.wave, ds: g.director.state, tm: Math.round(g.time), lv: g.level, xp: Math.round(g.xp), xn: g.xpNeed,
      z, hp: this.packPlayer(g.player),
      pk: g.pickups.list.flatMap((it) => (near(it.x, it.y) ? [PICKS.indexOf(it.k), Math.round(it.x), Math.round(it.y), Math.round(it.t * 10)] : [])),
      b: g.bullets.list.flatMap((b) => (b.owner !== 'peer' && near(b.x, b.y) ? [Math.round(b.x), Math.round(b.y), r100(b.dx), r100(b.dy), b.rocket ? 1 : 0] : [])),
      gr: st.grenades.flatMap((q) => [Math.round(q.x), Math.round(q.y), Math.round(q.h), r100(q.rot), q.kind === 'molotov' ? 1 : 0, q.t > q.dur ? 1 : 0]),
      fi: st.fires.flatMap((f) => [f.id, Math.round(f.x), Math.round(f.y), r100(f.t), r100(f.life)]),
      so: st.stuck.flatMap((q) => [Math.round(q.x), Math.round(q.y), r100(q.ang || 0), r100(q.t), r100(q.stick), r100(q.glow), q.kind === 'fat' ? 1 : 0]),
      bl: st.blasts.flatMap((q) => [Math.round(q.x), Math.round(q.y), r100(q.t)]),
    };
    const rb = g.robot;
    s.rb = rb.owned ? [Math.round(rb.x), Math.round(rb.y), r100(rb.angle), r100(rb.legAngle), r100(rb.walk), Math.round(rb.hp), rb.piloted ? 1 : 0] : 0;
    // lo que cambia poco va cada medio segundo
    if (this.snapN++ % 6 === 0) {
      s.blk = st.blocks.map((b) => [b.kind, b.x, b.y, b.w, b.h, Math.round(b.hp), r100(b.ang || 0)]);
      s.wir = st.wires.map((w) => [w.kind, w.x, w.y, w.w, w.h, Math.round(w.hp)]);
      s.sc = st.scorches.map((c) => [Math.round(c.x), Math.round(c.y), r100(c.a), Math.round(c.t), c.life]);
      s.kl = g.kills;
    }
    return s;
  }

  packPlayer(p) {
    return [Math.round(p.x), Math.round(p.y), r100(p.angle), r100(p.legAngle), Math.round(p.walkPhase * 10), p.running ? 1 : 0, p.weapon.id, p.weapon.mag,
      r100(Math.max(0, p.reloadT)), r100(p.reloadProg || 0), p.flashT > 0 ? 1 : 0, p.alive ? 1 : 0, p.inRobot ? 1 : 0, p.hurtT > 0 ? 1 : 0, r100(p.recoil), Math.round(p.speedNow)];
  }

  // La mira y las piernas del compañero giran suave hacia lo último recibido.
  turn(q, dt) {
    if (q.ta !== undefined) q.angle = angleTo(q.angle, q.ta, dt * 14);
    if (q.tla !== undefined) q.legAngle = angleTo(q.legAngle, q.tla, dt * 10);
    // el paso de las piernas sale del movimiento que se ve, así no salta
    if (q.lx !== undefined) q.walkPhase += Math.hypot(q.x - q.lx, q.y - q.ly) * 0.11;
    q.lx = q.x;
    q.ly = q.y;
  }

  /* ---------- mensajes ---------- */

  onMessage(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'start') return this.startGuest(m);
    if (m.t === 'bye') return this.lost();
    if (this.isHost) this.onGuestMessage(m);
    else if (this.isGuest) this.onHostMessage(m);
    else if (m.t === 'hello') this.peerName = String(m.name || '').slice(0, 16);
  }

  onGuestMessage(m) {
    const g = this.game;
    const peer = this.peer;
    switch (m.t) {
      case 'hello':
        this.peerName = String(m.name || '').slice(0, 16);
        break;
      case 'in': {
        if (Number(m.ak) > (this.peerAck || 0)) this.peerAck = Number(m.ak);
        peer.tx = Number(m.x) || peer.tx;
        peer.ty = Number(m.y) || peer.ty;
        track(peer, this.clock.stamp(Number(m.ts)), peer.tx, peer.ty);
        peer.ta = Number(m.a) || 0;
        peer.tla = Number(m.la) || 0;
        peer.speedNow = Number(m.sp) || 0;
        peer.running = !!m.run;
        peer.alive = !!m.al;
        peer.hp = Number(m.hp) || 0;
        peer.stats.maxHp = Number(m.mh) || 100;
        peer.needAmmo = !!m.na;
        if (WEAPONS[m.w] && (!peer.weapons[0] || peer.weapons[0].id !== m.w)) {
          peer.weapons = [peer.makeWeapon(m.w)];
          peer.wi = 0;
        }
        peer.weapon.mag = m.mag | 0;
        peer.reloadT = Number(m.rl) || 0;
        peer.reloadProg = Number(m.rp) || 0;
        break;
      }
      case 'shot':
        this.quiet(() => this.peerShot(m));
        break;
      case 'build': {
        const kind = m.kind;
        this.syncPeer(m);
        const ok = !!SHOP[kind] && !SHOP[kind].consumable && this.quiet(() => this.withPlayer(peer, () => g.structures.place(g, kind)));
        this.send({ t: 'built', kind, ok });
        break;
      }
      case 'throw': {
        const kind = m.kind === 'molotov' ? 'molotov' : 'grenade';
        this.syncPeer(m);
        this.quiet(() => this.withPlayer(peer, () => (kind === 'molotov' ? g.structures.throwMolotov(g, m.tx, m.ty) : g.structures.throwGrenade(g, m.tx, m.ty))));
        const q = g.structures.grenades[g.structures.grenades.length - 1];
        if (q) q.owner = 'peer';
        break;
      }
      case 'dead':
        peer.alive = false;
        if (!g.player.alive) g.deathT = 1.2;
        g.toast(`${this.peerName || 'Tu compañero'} cayó: revive al terminar la oleada`);
        break;
      case 'next':
        if (g.state === 'play') g.startNextRound();
        break;
    }
  }

  // Las acciones traen la posición y la mira exactas del invitado en ese instante.
  syncPeer(m) {
    const q = this.peer;
    if (Number.isFinite(m.x) && Number.isFinite(m.y)) {
      q.x = q.tx = m.x;
      q.y = q.ty = m.y;
      q.trk = null;
      track(q, performance.now() - this.clock.delay, m.x, m.y);
    }
    if (Number.isFinite(m.a)) q.angle = q.ta = m.a;
  }

  peerShot(m) {
    const g = this.game;
    const d = WEAPONS[m.w];
    if (!d || !Array.isArray(m.a)) return;
    const peer = this.peer;
    for (const a of m.a.slice(0, 12)) {
      g.bullets.spawn({
        x: Number(m.x), y: Number(m.y), dx: Math.cos(a), dy: Math.sin(a),
        speed: d.speed * rand(0.95, 1.05), life: d.range * (d.pellets > 1 ? rand(0.8, 1) : 1),
        dmg: Math.min(Number(m.dmg) || d.damage, d.damage * 4), pierce: Math.min(m.pi | 0, 10), knock: d.knock,
        shot: null, hits: null, rocket: !!d.rocket, owner: 'peer',
      });
    }
    // el anfitrión también ve y oye el disparo de su compañero
    peer.flashT = 0.05;
    peer.recoil = 1;
    g.sfx.shot(d.id);
    g.particles.muzzleSmoke(Number(m.x), Number(m.y), m.a[0]);
  }

  onHostMessage(m) {
    const g = this.game;
    const p = g.player;
    switch (m.t) {
      case 's':
        this.applySnapshot(m);
        break;
      case 'fx':
        if (Array.isArray(m.e)) for (const e of m.e) this.replay(e);
        break;
      case 'k': {
        // empujones sumados de varios golpes: se limitan para que no den tirones bruscos
        if (!p.alive) break;
        let kx = Number(m.x) || 0;
        let ky = Number(m.y) || 0;
        const kl = Math.hypot(kx, ky);
        const cap = kl > 900 ? 1500 : 260;
        if (kl > cap) {
          kx *= cap / kl;
          ky *= cap / kl;
        }
        p.kx += kx;
        p.ky += ky;
        break;
      }
      case 'hurt':
        p.hurt(Number(m.d) || 0, g);
        break;
      case 'hit':
        g.onZombieHit(null, null);
        break;
      case 'earn': {
        const n = Math.max(0, Number(m.n) || 0);
        g.money += n;
        g.moneyEarned += n;
        if (m.gold) {
          g.moneyPop(`+$${n}`, 'gold');
          g.sfx.gold();
          g.toast(`¡Zombi dorado! +$${n}`);
        }
        break;
      }
      case 'pick':
        if (PICKS.includes(m.k)) g.pickups.collect({ k: m.k, x: p.x, y: p.y }, g);
        break;
      case 'acid':
        g.applyAcid();
        break;
      case 'built': {
        const kind = this.pendingBuild;
        this.pendingBuild = null;
        if (m.ok && kind && g.inv[kind] > 0) {
          g.inv[kind]--;
          g.sfx.build();
        } else if (!m.ok) g.toast('No cabe ahí');
        break;
      }
      case 'revive':
        this.revive(p, Number(m.x), Number(m.y));
        break;
      case 'over':
        if (g.state !== 'over') g.gameOver();
        break;
    }
  }

  // Repite en el invitado un efecto que ocurrió en el anfitrión.
  replay(e) {
    const g = this.game;
    if (!Array.isArray(e)) return;
    const [tag, n, args] = e;
    if (!Array.isArray(args)) return;
    try {
      if (tag === 'p' && typeof g.particles[n] === 'function' && !PARTICLE_SKIP.has(n)) g.particles[n](...args);
      else if (tag === 's' && SFX_SYNC.includes(n)) g.sfx[n](...args);
      else if (tag === 'c' && n === 'shake') g.camera.shake(Math.min(1, Number(args[0]) || 0));
      else if (tag === 'g' && n === 'banner') g.banner(String(args[0] || ''), String(args[1] || ''));
      else if (tag === 'd' && DECAL_SYNC.includes(n)) {
        if (n === 'corpse') {
          const c = args[0] || {};
          const sets = zombieSprites()[c.type];
          if (!sets) return;
          g.decals.corpse({ type: c.type, spr: sets[c.si] || sets[0], x: c.x, y: c.y, r: c.r, angle: c.a, burnt: c.burnt }, args[1], args[2]);
        } else g.decals[n](...args);
      }
    } catch {
      /* efecto con datos raros: se ignora */
    }
  }

  /* ---------- invitado ---------- */

  guestTick(dt) {
    const g = this.game;
    const p = g.player;
    // el anfitrión (dibujo) se mueve suave entre fotos
    const h = this.peer;
    if (h && h.tx !== undefined) {
      place(h, performance.now() - this.clock.delay);
      this.turn(h, dt);
      h.flashT -= dt;
      h.hurtT -= dt;
    }
    this.inT -= dt;
    if (this.inT > 0) return;
    this.inT = 1 / IN_HZ;
    const w = p.weapon;
    this.send({
      t: 'in', ak: this.lastSeq || 0, ts: Math.round(performance.now()), x: Math.round(p.x), y: Math.round(p.y), a: r100(p.angle) / 100, la: r100(p.legAngle) / 100, wp: Math.round(p.walkPhase * 10) / 10,
      sp: Math.round(p.speedNow), run: p.running ? 1 : 0, al: p.alive ? 1 : 0, hp: Math.ceil(p.hp), mh: p.stats.maxHp,
      na: p.weapons.some((x) => x.reserve !== Infinity && x.reserve < p.reserveMax(x.def)) ? 1 : 0,
      w: w.id, mag: w.mag, rl: r100(Math.max(0, p.reloadT)) / 100, rp: r100(p.reloadProg || 0) / 100,
    }, true);
  }

  sendShot(x, y, angles, d, stats) {
    this.send({ t: 'shot', x: Math.round(x), y: Math.round(y), a: angles.map((a) => Math.round(a * 1000) / 1000), w: d.id, dmg: d.damage * stats.dmgMult, pi: d.pierce + stats.pierce });
  }

  guestBuild() {
    const g = this.game;
    if (this.pendingBuild) return;
    if (g.inv[g.buildSel] <= 0) {
      const next = BUILD_ORDER.find((k) => g.inv[k] > 0);
      if (!next) return g.toast('Compra barricadas en la tienda');
      g.buildSel = next;
    }
    if (!g.structures.placement(g, g.buildSel).ok) return g.toast('No cabe ahí');
    this.pendingBuild = g.buildSel;
    const p = g.player;
    this.send({ t: 'build', kind: g.buildSel, x: Math.round(p.x), y: Math.round(p.y), a: Math.round(p.angle * 1000) / 1000 });
  }

  guestThrow(kind) {
    const g = this.game;
    const p = g.player;
    if (g.inv[kind] <= 0) return g.toast(kind === 'molotov' ? 'Sin molotovs: cómpralos en la tienda' : 'Sin granadas: cómpralas en la tienda');
    let tx = p.x + Math.cos(p.angle) * 220;
    let ty = p.y + Math.sin(p.angle) * 220;
    if (g.input.mode === 'mouse') {
      const m = g.mouseWorld();
      tx = m.x;
      ty = m.y;
    } else if (p.target && !p.target.dead) {
      tx = p.target.x;
      ty = p.target.y;
    }
    g.inv[kind]--;
    this.send({ t: 'throw', kind, tx: Math.round(tx), ty: Math.round(ty), x: Math.round(p.x), y: Math.round(p.y), a: Math.round(p.angle * 1000) / 1000 });
  }

  applySnapshot(s) {
    const g = this.game;
    const d = g.director;
    // fin de oleada: tienda y mejoras para el invitado también
    if (this.lastDs === 'active' && s.ds === 'waiting') {
      g.shopPending = true;
      g.sfx.level();
    }
    this.lastDs = s.ds;
    d.wave = s.w;
    d.state = s.ds;
    g.time = s.tm;
    g.level = s.lv;
    g.xp = s.xp;
    g.xpNeed = s.xn;
    if (s.lv > this.levelSeen) {
      g.pendingLevels += s.lv - this.levelSeen;
      this.levelSeen = s.lv;
    }
    if (s.kl) g.kills = s.kl;
    // una foto vieja que llegó tarde no deshace una más nueva
    if (Number(s.q) <= (this.lastSeq || 0)) return;
    this.rx = (this.rx || 0) + 1;
    this.lastSeq = Number(s.q);
    const st0 = this.clock.stamp(Number(s.ts));
    this.applyZombies(s.z || [], st0, s.o || [0, 0], s.zx || []);
    this.applyPuppet(s.hp, st0);
    // objetos, balas, granadas, fuego, cohetes clavados, explosiones
    const pk = s.pk || [];
    g.pickups.list = [];
    for (let i = 0; i + 3 < pk.length; i += 4) g.pickups.list.push({ k: PICKS[pk[i]] || 'ammo', x: pk[i + 1], y: pk[i + 2], t: pk[i + 3] / 10, taken: true });
    const b = s.b || [];
    this.remoteBullets = [];
    for (let i = 0; i + 4 < b.length; i += 5) this.remoteBullets.push({ x: b[i], y: b[i + 1], dx: b[i + 2] / 100, dy: b[i + 3] / 100, rocket: !!b[i + 4], trail: 22, age: 0 });
    const st = g.structures;
    const gr = s.gr || [];
    st.grenades = [];
    for (let i = 0; i + 5 < gr.length; i += 6) st.grenades.push({ x: gr[i], y: gr[i + 1], h: gr[i + 2], rot: gr[i + 3] / 100, kind: gr[i + 4] ? 'molotov' : 'grenade', t: gr[i + 5] ? 2 : 0, dur: 1 });
    const fi = s.fi || [];
    const fires = [];
    for (let i = 0; i + 4 < fi.length; i += 5) {
      let f = this.fireMap.get(fi[i]);
      if (!f) {
        f = { id: fi[i], x: fi[i + 1], y: fi[i + 2], r: 82, tick: 0, flames: [] };
        for (let k = 0; k < 16; k++) {
          const a = rand(0, TAU);
          const dd = Math.sqrt(Math.random()) * f.r * 0.85;
          f.flames.push({ x: f.x + Math.cos(a) * dd, y: f.y + Math.sin(a) * dd * 0.85, s: rand(0.7, 1.25), ph: rand(0, 10) });
        }
        this.fireMap.set(f.id, f);
      }
      f.t = fi[i + 3] / 100;
      f.life = fi[i + 4] / 100;
      fires.push(f);
    }
    for (const id of this.fireMap.keys()) if (!fires.some((f) => f.id === id)) this.fireMap.delete(id);
    st.fires = fires;
    const so = s.so || [];
    st.stuck = [];
    for (let i = 0; i + 6 < so.length; i += 7) st.stuck.push({ x: so[i], y: so[i + 1], ang: so[i + 2] / 100, t: so[i + 3] / 100, stick: so[i + 4] / 100, glow: so[i + 5] / 100, kind: so[i + 6] ? 'fat' : 'heavy' });
    const bl = s.bl || [];
    st.blasts = [];
    for (let i = 0; i + 2 < bl.length; i += 3) st.blasts.push({ x: bl[i], y: bl[i + 1], t: bl[i + 2] / 100 });
    if (s.blk) {
      st.blocks = s.blk.filter((q) => SHOP[q[0]]).map((q) => ({ k: 0, kind: q[0], x: q[1], y: q[2], w: q[3], h: q[4], hp: q[5], max: SHOP[q[0]].hp, ang: q[6] / 100, low: true, block: true, hitT: 0, cd: 0 }));
      st.relayer();
    }
    if (s.wir) st.wires = s.wir.filter((q) => SHOP[q[0]]).map((q) => ({ kind: q[0], x: q[1], y: q[2], w: q[3], h: q[4], hp: q[5], max: SHOP[q[0]].hp, hitT: 0 }));
    if (s.sc) st.scorches = s.sc.map((q) => ({ x: q[0], y: q[1], a: q[2] / 100, t: q[3], life: q[4] }));
    // robot del anfitrión
    const rb = g.robot;
    if (s.rb) {
      rb.owned = true;
      rb.x = s.rb[0];
      rb.y = s.rb[1];
      rb.angle = s.rb[2] / 100;
      rb.legAngle = s.rb[3] / 100;
      rb.walk = s.rb[4] / 100;
      rb.hp = s.rb[5];
      rb.piloted = !!s.rb[6];
    } else rb.owned = false;
  }

  applyPuppet(a, t) {
    const h = this.peer;
    if (!h || !Array.isArray(a)) return;
    if (h.tx === undefined) {
      h.x = a[0];
      h.y = a[1];
    }
    h.tx = a[0];
    h.ty = a[1];
    track(h, t, a[0], a[1]);
    h.ta = a[2] / 100;
    h.tla = a[3] / 100;
    h.running = !!a[5];
    if (WEAPONS[a[6]] && (!h.weapons[0] || h.weapons[0].id !== a[6])) {
      h.weapons = [h.makeWeapon(a[6])];
      h.wi = 0;
    }
    h.weapon.mag = a[7];
    h.reloadT = a[8] / 100;
    h.reloadProg = a[9] / 100;
    if (a[10]) h.flashT = 0.05;
    h.alive = !!a[11];
    h.inRobot = !!a[12];
    if (a[13]) h.hurtT = 0.2;
    h.recoil = a[14] / 100;
    h.speedNow = a[15];
  }

  applyZombies(z, t, org, zx) {
    const g = this.game;
    const seen = new Set();
    const extra = new Map();
    for (let i = 0; i + 2 < zx.length; i += 3) extra.set(zx[i], [zx[i + 1], zx[i + 2] / 100]);
    for (let i = 0; i + 5 < z.length; i += 6) {
      const id = z[i];
      const x = org[0] + z[i + 2];
      const y = org[1] + z[i + 3];
      const ang = (z[i + 4] / 64) * TAU;
      seen.add(id);
      let o = this.zmap.get(id);
      if (!o) {
        const type = TYPES[z[i + 1]] || 'normal';
        const def = ZOMBIES[type];
        const sets = zombieSprites()[type];
        o = {
          id, type, def, r: def.radius, mass: def.mass, si: id % sets.length, spr: sets[id % sets.length] || sets[0], x, y,
          angle: ang, anim: 0, flash: 0, hitT: 0, hitJolt: 0, lunge: 0, spawnT: 0, tilt: 0, air: 0, swell: 0, burn: 0,
          bs: 'walk', life: 99, dead: false, wob: rand(0, 100), fireFx: 0,
        };
        this.zmap.set(id, o);
      }
      o.tx = x;
      o.ty = y;
      track(o, t, x, y);
      o.ta = ang;
      const f = z[i + 5];
      o.flash = f & 1 ? 0.06 : 0;
      o.burn = f & 2 ? 1 : 0;
      o.wounded = !!(f & 4);
      o.bs = f & 8 ? 'windup' : 'walk';
      if (f & 16 && o.hitT <= 0) {
        o.hitT = 0.18;
        o.hitJolt = rand(0.2, 0.5) * (Math.random() < 0.5 ? -1 : 1);
      }
      o.life = f & 32 ? 1 : 99;
      o.lunge = f & 64 ? 1 : o.lunge;
      const ex = extra.get(id);
      o.air = ex ? ex[0] : 0;
      o.swell = ex ? ex[1] : 0;
    }
    for (const [id, o] of this.zmap) {
      if (seen.has(id)) continue;
      o.dead = true;
      this.zmap.delete(id);
    }
    g.horde.list = Array.from(this.zmap.values());
  }

  // Reemplaza a game.update() en el celular del invitado.
  guestUpdate(dt) {
    const g = this.game;
    const p = g.player;
    if (g.input.consume('pause')) return g.pause();
    if (p.alive) {
      p.update(dt, g);
      if (g.input.consume('build')) g.tryBuild();
      if (g.input.consume('cycleBuild')) g.cycleBuild();
      if (g.input.consume('grenade')) g.tryGrenade();
      if (g.input.consume('molotov')) g.tryGrenade('molotov');
      if (g.input.consume('robot')) g.toggleRobot();
      if (g.input.consume('nextRound')) g.startNextRound();
    }
    // zombis: recorren el camino entre las posiciones recibidas (un poco en diferido) y caminan con su animación
    const rt = performance.now() - this.clock.delay;
    const grid = g.horde.grid;
    grid.clear();
    let danger = 0;
    let nc = 0;
    for (const z of g.horde.list) {
      const ox = z.x;
      const oy = z.y;
      place(z, rt);
      z.angle = angleTo(z.angle, z.ta, dt * 10);
      z.anim += Math.hypot(z.x - ox, z.y - oy) / (z.r * 0.55);
      z.hitT -= dt;
      z.lunge = Math.max(0, z.lunge - dt * 4);
      z.tilt = (z.wounded ? Math.sin(g.time * 5 + z.wob) * 0.16 : 0) + (z.burn > 0 ? Math.sin(g.time * 23 + z.wob) * 0.28 : 0);
      if (z.burn > 0) {
        z.fireFx -= dt;
        if (z.fireFx <= 0) {
          z.fireFx = 0.1;
          g.particles.burning(z.x, z.y, z.r);
        }
      }
      grid.insert(z);
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d < 650) {
        danger += 1 - d / 650;
        if (d < 300) nc++;
      }
    }
    // choque local con los zombis que ves: no los atraviesas (en el anfitrión sólo se aparta el zombi)
    if (p.alive) {
      const q = [];
      grid.query(p.x - p.r - 30, p.y - p.r - 30, p.x + p.r + 30, p.y + p.r + 30, q);
      for (const z of q) {
        const dx = p.x - z.x;
        const dy = p.y - z.y;
        const rr = z.r + p.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.01;
        const k = (rr - d) * (z.mass / (z.mass + p.mass)) * 0.6;
        p.x += (dx / d) * k;
        p.y += (dy / d) * k;
      }
      g.world.collide(p, p.r, true);
    }
    for (const b of this.remoteBullets) {
      b.x += b.dx * (b.rocket ? 640 : 1000) * dt;
      b.y += b.dy * (b.rocket ? 640 : 1000) * dt;
      b.age += dt;
      if (b.rocket) g.particles.rocketTrail(b.x, b.y, b.dx, b.dy);
    }
    g.bullets.update(dt, g);
    for (const f of g.structures.fires) f.t += dt;
    for (const q of g.structures.blasts) q.t -= dt;
    g.particles.update(dt);
    g.decals.update(dt);
    g.emitFires(dt);
    if (g.horde.list.length && Math.random() < dt * (0.35 + Math.min(1.5, nc * 0.05))) g.sfx.groan(Math.min(3, 0.5 + nc / 10));
    g.stepT -= dt;
    if (nc > 0 && g.stepT <= 0) {
      g.sfx.footstep(Math.min(1, nc / 20));
      g.stepT = Math.max(0.12, 0.7 - nc * 0.03) * rand(0.7, 1.3);
    }
    g.music.setDanger(p.alive ? danger : 0, dt);
    // muerto: la cámara sigue suave a tu compañero (sin adelantarse hacia donde apunta)
    if (!p.alive && this.peer && this.peer.alive) g.camera.update(dt, this.peer.x, this.peer.y, false);
    else {
      const look = g.input.mode === 'mouse' ? 50 : 24;
      g.camera.update(dt, p.x + Math.cos(p.angle) * look, p.y + Math.sin(p.angle) * look, false);
    }
    g.muzzle = Math.max(0, g.muzzle - dt * 14);
    g.hurtFlash = Math.max(0, g.hurtFlash - dt * 1.4);
    g.updateAcid(dt);
    g.updateHud(false);
    if (!p.alive || g.director.state !== 'waiting') return;
    if (g.pendingLevels > 0) g.openLevelUp();
    else if (g.shopPending) g.openShop();
  }

  /* ---------- muerte, revivir y fin ---------- */

  onLocalDeath() {
    const g = this.game;
    g.input.reset();
    g.camera.shake(0.6);
    g.deathT = 1.6;
    if (this.isGuest) {
      this.send({ t: 'dead' });
      g.toast('Caíste: revives al terminar la oleada');
    } else if (this.peer && this.peer.alive) g.toast('Caíste: revives al terminar la oleada');
  }

  revive(p, x, y) {
    const g = this.game;
    p.alive = true;
    p.hp = Math.round(p.stats.maxHp * 0.5);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      p.x = x;
      p.y = y;
    }
    g.toast('¡Reviviste!');
    g.particles.pickupFx(p.x, p.y, '#7fb38f');
  }

  // Anfitrión: al terminar la oleada revive a quien haya caído, junto a su compañero.
  onWaveCleared() {
    if (!this.isHost || !this.peer) return;
    const g = this.game;
    const p = g.player;
    const peer = this.peer;
    if (!p.alive && peer.alive) this.revive(p, peer.x + 40, peer.y);
    if (!peer.alive) {
      peer.alive = true;
      this.send({ t: 'revive', x: Math.round(p.x + 40), y: Math.round(p.y) });
    }
  }

  /* ---------- ayudas para el resto del juego (anfitrión) ---------- */

  earn(n) {
    this.send({ t: 'earn', n });
  }

  peerPickup(it) {
    this.send({ t: 'pick', k: it.k });
    return true;
  }

  acidAt(x, y, R) {
    const q = this.peer;
    if (q && q.alive && Math.hypot(q.x - x, q.y - y) < R + q.r) this.send({ t: 'acid' });
  }

  /* ---------- indicador de conexión ---------- */

  // Texto corto para la pantalla: tipo de conexión, retraso, fotos por segundo y FPS.
  stats(dt) {
    this.statT = (this.statT || 0) + dt;
    this.frames = (this.frames || 0) + 1;
    if (this.statT < 1) return null;
    const fps = Math.round(this.frames / this.statT);
    const per = this.isGuest ? Math.round((this.rx || 0) / this.statT) : null;
    this.statT = 0;
    this.frames = 0;
    this.rx = 0;
    const via = this.net.direct ? 'Directa' : 'Firebase';
    const lag = Math.round(this.clock.delay);
    return this.isGuest ? `${via} · ${lag} ms · ${per} act/s · ${fps} FPS` : `${via} · ${lag} ms · ${fps} FPS`;
  }

  /* ---------- dibujo ---------- */

  drawPeer(ctx) {
    const q = this.peer;
    const g = this.game;
    if (!this.mode || !q || !q.alive) return;
    if (q.inRobot) g.robot.draw(ctx, q, g.time);
    else drawSurvivor(ctx, q, g.time);
    // nombre encima
    const name = this.isHost ? this.peerName || 'Compañero' : this.peerName || 'Anfitrión';
    ctx.font = '700 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(name, q.x + 1, q.y - q.r - 13);
    ctx.fillStyle = '#9fd0ff';
    ctx.fillText(name, q.x, q.y - q.r - 14);
    ctx.textAlign = 'start';
  }

  drawRemoteBullets(ctx) {
    if (!this.isGuest || !this.remoteBullets.length) return;
    Bullets.prototype.draw.call({ list: this.remoteBullets }, ctx);
  }

  /* ---------- desconexión ---------- */

  leave() {
    if (!this.mode && !this.net.role) return;
    this.send({ t: 'bye' });
    this.end();
  }

  end() {
    const g = this.game;
    this.uninstall();
    this.net.onClose = null;
    this.net.close();
    this.mode = null;
    this.peer = null;
    this.zmap.clear();
    this.remoteBullets = [];
    if (g.director) g.director.coop = false;
  }

  lost() {
    const g = this.game;
    const wasGuest = this.isGuest;
    const name = this.peerName || 'Tu compañero';
    if (!this.mode) return this.end();
    this.end();
    if (wasGuest) {
      g.newWorld();
      g.setupMenu();
      g.toast('Se perdió la conexión con el anfitrión');
    } else g.toast(`${name} se desconectó: sigues solo`);
  }
}

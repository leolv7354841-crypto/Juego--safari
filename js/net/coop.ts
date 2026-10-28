// Modo cooperativo para 2 jugadores (sin competitivo), con la mitad de zombis.
//
// El anfitrión simula todo el mundo (zombis, oleadas, estructuras, explosiones) y le manda
// al invitado ~12 veces por segundo una "foto" de lo que hay cerca de él, más los efectos
// visuales y sonidos que ocurrieron (se graban al llamarse y el invitado los repite).
// El invitado mueve a su personaje en su propio celular (sin retraso), dispara balas de
// adorno al instante y le avisa al anfitrión, que crea las balas que de verdad hacen daño.
// Cada jugador tiene su propio dinero, armas, vida y mejoras; la experiencia es del equipo.
import { Net } from './net.ts';
import { Player } from '../sim/player.ts';
import { WEAPONS, SHOP, ABILITY } from '../core/config.ts';
import { cleanLook } from '../render/sprites.js';
import { Abilities } from '../sim/abilities.ts';
import { applyCombo, packCombo } from '../sim/combo.ts';
import { rand, angleTo } from '../core/util.ts';
import { PARTICLE_SKIP, PICKS, SFX_SYNC, DECAL_SYNC } from './protocol.ts';
import { encodeStatic, encodeWorld } from './snapshot.ts';
import { GUEST_IDX, HOST_IDX } from './remote.ts';
import { CoopHost, CoopGuest, Solo } from './mode.ts';

const SNAP_HZ = 12;
const IN_HZ = 20;
const VIEW = 1000;
// fotos del mundo sin confirmar que se permiten "en camino" hacia el invitado
const WINDOW = 6;
const FX_MAX = 500;
// el invitado adelanta lo que ve algo más que el cliente en línea (el P2P llega a tirones)
const EXTRAPOLATE = 250;
const r100 = (v) => Math.round(v * 100);

// Reloj de llegada: convierte la hora del otro celular en la nuestra y calcula cuánto
// atrasar el dibujo para tener siempre dos posiciones entre las que trazar el camino,
// aunque los datos lleguen disparejos o en grupitos (sobre todo por Firebase).
class Clock {
  declare off: any;
  declare prevTs: any;
  declare gap: any;
  declare late: any;
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

// Predicción de movimiento ("dead reckoning"): con cada posición recibida se estima la
// velocidad, y entre una y otra se sigue moviendo solo a esa velocidad. Lo que llega por la
// red sólo corrige el rumbo poco a poco. Así se ve fluido aunque los datos lleguen tarde,
// a tirones o en grupitos.
const MAX_V = 0.65; // px por ms (más que el toro embistiendo)
const HORIZON = 900; // ms máximos que se predice sin datos nuevos

function track(o, t, x, y) {
  if (o.st !== undefined && t > o.st && t - o.st < 1000) {
    let vx = (x - o.sx) / (t - o.st);
    let vy = (y - o.sy) / (t - o.st);
    const v = Math.hypot(vx, vy);
    if (v > MAX_V) {
      vx *= MAX_V / v;
      vy *= MAX_V / v;
    }
    o.vx = (o.vx || 0) * 0.35 + vx * 0.65;
    o.vy = (o.vy || 0) * 0.35 + vy * 0.65;
  } else if (o.st === undefined || t - o.st >= 1000) {
    o.vx = 0;
    o.vy = 0;
  }
  if (o.st !== undefined && t <= o.st) return;
  o.st = t;
  o.sx = x;
  o.sy = y;
}

// Coloca o donde debería estar ahora: avanza con su velocidad y corrige suave hacia la predicción.
function place(o, now, dt) {
  if (o.st === undefined) return;
  const ahead = Math.min(Math.max(0, now - o.st), HORIZON);
  const px = o.sx + (o.vx || 0) * ahead;
  const py = o.sy + (o.vy || 0) * ahead;
  if (o.rendered === undefined || Math.hypot(px - o.x, py - o.y) > 140) {
    // primera vez o salto grande (empujón, explosión): directo a su sitio
    o.x = px;
    o.y = py;
    o.rendered = true;
    return;
  }
  const stillPredicting = now - o.st < HORIZON;
  if (stillPredicting) {
    o.x += (o.vx || 0) * dt * 1000;
    o.y += (o.vy || 0) * dt * 1000;
  }
  const k = Math.min(1, dt * 7);
  o.x += (px - o.x) * k;
  o.y += (py - o.y) * k;
}

export class Coop {
  declare game: any;
  declare net: any;
  declare role: any;
  declare peer: any;
  declare peerName: any;
  declare peerLook: any;
  declare fx: any;
  declare rec: any;
  declare depth: any;
  declare orig: any;
  declare sendT: any;
  declare inT: any;
  declare snapN: any;
  declare pendingBuild: any;
  declare lastDs: any;
  declare levelSeen: any;
  declare clock: any;
  declare snapSeq: any;
  declare peerAck: any;
  declare lastSeq: any;
  declare lastT: any;
  declare lastSnapAt: any;
  declare peerAbAt: any;
  constructor(game) {
    this.game = game;
    this.net = new Net();
    this.role = null; // 'host' | 'guest' (game.mode es el modo de la partida: js/net/mode.js)
    this.peer = null; // host: el compañero simulado · guest: el anfitrión (sólo para dibujarlo)
    this.peerName = '';
    this.peerLook = null;
    this.fx = [];
    this.rec = false;
    this.depth = 0;
    this.orig = [];
    this.sendT = 0;
    this.inT = 0;
    this.snapN = 0;
    this.pendingBuild = null;
    this.lastDs = null;
    this.levelSeen = 1;
    this.clock = new Clock();
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
    this.send({ t: 'hello', name: this.myName(), look: this.game.look });
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
    g.player.cls = g.classPick;
    this.role = 'host';
    this.clock = new Clock();
    this.snapSeq = 0;
    this.peerAck = 0;
    g.mode = new CoopHost(g);
    g.director.coop = true;
    const s = g.world.spawn;
    this.peer = new Player(s.x + 46, s.y + 10);
    this.peer.look = this.peerLook;
    this.peer.remote = true;
    this.peer.tx = this.peer.x;
    this.peer.ty = this.peer.y;
    this.peer.idx = GUEST_IDX;
    this.peer.name = this.peerName || 'Compañero';
    // el compañero lo simulo yo: se dibuja con los demás jugadores pero no se interpola (lo mueve hostTick)
    g.remote.start();
    g.remote.peers.set(GUEST_IDX, this.peer);
    this.installRecording();
    this.send({
      t: 'start',
      seed: g.world.seedBase,
      x: Math.round(this.peer.x),
      y: Math.round(this.peer.y),
      name: this.myName(),
      look: g.look,
    });
    g.input.reset();
    g.input.setRun(false);
    g.setState('play');
    g.updateHud(true);
    g.toast('¡Cooperativo! Mitad de zombis, más duros');
  }

  // El anfitrión vuelve a empezar con el mismo compañero (después de perder).
  restart() {
    if (this.role !== 'host') return;
    this.uninstall();
    this.startHost();
  }

  startGuest(m) {
    const g = this.game;
    g.sfx.unlock();
    g.newWorld(m.seed);
    g.resetRun();
    g.player.cls = g.classPick;
    this.role = 'guest';
    this.clock = new Clock();
    this.lastSeq = 0;
    this.lastT = 0;
    g.mode = new CoopGuest(g);
    this.peerName = m.name || 'Anfitrión';
    this.peerLook = cleanLook(m.look);
    g.director.coop = true;
    g.director.state = 'waiting';
    g.player.x = m.x;
    g.player.y = m.y;
    this.peer = new Player(g.world.spawn.x, g.world.spawn.y);
    this.peer.look = this.peerLook;
    this.peer.puppet = true;
    this.peer.idx = HOST_IDX;
    // el anfitrión se dibuja y se mueve igual que los jugadores del modo en línea (js/net/remote.js)
    g.remote.start(EXTRAPOLATE);
    g.remote.peers.set(HOST_IDX, this.peer);
    this.lastDs = null;
    this.levelSeen = 1;
    g.camera.x = m.x;
    g.camera.y = m.y;
    g.input.reset();
    g.input.setRun(false);
    g.setState('play');
    g.updateHud(true);
    g.toast('¡Conectado! Mitad de zombis, más duros');
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
            self.fx.push([tag, n, tag === 'd' && n === 'corpse' ? self.packCorpse(args as [any, any, any]) : args]);
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
    // temblor: sólo los que tienen lugar (los del anfitrión, como sus golpes, son sólo suyos)
    if (tag === 'c')
      return (
        typeof args[1] === 'number' &&
        typeof args[2] === 'number' &&
        (!q || (Math.abs(args[1] - q.x) < VIEW && Math.abs(args[2] - q.y) < VIEW))
      );
    if (!q || (tag !== 'p' && tag !== 'd')) return true;
    const o = n === 'corpse' ? args[0] : null;
    const x = o ? o.x : args[0];
    const y = o ? o.y : args[1];
    if (typeof x !== 'number' || typeof y !== 'number') return true;
    return Math.abs(x - q.x) < VIEW && Math.abs(y - q.y) < VIEW;
  }

  packCorpse([z, dx, dy]) {
    return [
      {
        type: z.type,
        si: z.si | 0,
        x: Math.round(z.x),
        y: Math.round(z.y),
        r: z.r,
        a: r100(z.angle) / 100,
        burnt: !!z.burnt,
      },
      dx,
      dy,
    ];
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
    if (!this.role) return;
    this.net.check();
    if (this.role === 'host') this.hostTick(dt);
    else this.guestTick(dt);
  }

  hostTick(dt) {
    const g = this.game;
    const peer = this.peer;
    if (!peer) return;
    place(peer, performance.now(), dt);
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
    // la parte del mundo es la misma que arma el servidor en línea (js/net/snapshot.js)
    const s: Record<string, any> = {
      t: 's',
      q: ++this.snapSeq,
      ts: Math.round(performance.now()),
      ...encodeWorld(
        g,
        { x: peer.x, y: peer.y, vw: peer.vw, vh: peer.vh },
        {
          players: [{ idx: HOST_IDX, p: g.player }],
          robots: [{ idx: HOST_IDX, r: g.robot }],
          // las balas del compañero ya las vio en su celular
          skipBullet: (b) => b.owner === 'peer',
        },
      ),
      // experiencia del equipo
      lv: g.level,
      xp: Math.round(g.xp),
      xn: g.xpNeed,
      // racha del invitado (la lleva el anfitrión, que es quien ve sus bajas y sus golpes)
      cb: packCombo(peer.combo),
    };
    // lo que cambia poco va cada medio segundo
    if (this.snapN++ % 6 === 0) {
      Object.assign(s, encodeStatic(g.structures));
      s.kl = g.kills;
    }
    return s;
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
    if (this.role === 'host') this.onGuestMessage(m);
    else if (this.role === 'guest') this.onHostMessage(m);
    else if (m.t === 'hello') this.onHello(m);
  }

  onHello(m) {
    this.peerName = String(m.name || '').slice(0, 16);
    this.peerLook = cleanLook(m.look);
    if (this.peer) {
      this.peer.look = this.peerLook;
      this.peer.name = this.peerName || 'Compañero';
    }
  }

  onGuestMessage(m) {
    const g = this.game;
    const peer = this.peer;
    switch (m.t) {
      case 'hello':
        this.onHello(m);
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
        if (Number.isFinite(m.vw) && Number.isFinite(m.vh)) {
          peer.vw = Math.min(1600, Math.max(100, m.vw));
          peer.vh = Math.min(1600, Math.max(100, m.vh));
        }
        peer.needAmmo = !!m.na;
        if (WEAPONS[m.w] && (!peer.weapons[0] || peer.weapons[0].id !== m.w)) {
          peer.weapons = [peer.makeWeapon(m.w)];
          peer.wi = 0;
        }
        peer.weapon.mag = m.mag | 0;
        peer.reloadT = Number(m.rl) || 0;
        peer.reloadProg = Number(m.rp) || 0;
        peer.rageT = m.ab & 1 ? 1 : 0;
        peer.boostT = m.ab & 2 ? 1 : 0;
        break;
      }
      case 'shot':
        this.quiet(() => this.peerShot(m));
        break;
      case 'build': {
        const kind = m.kind;
        this.syncPeer(m);
        const ok =
          !!SHOP[kind] &&
          !SHOP[kind].consumable &&
          this.quiet(() => this.withPlayer(peer, () => g.structures.place(g, kind)));
        this.send({ t: 'built', kind, ok });
        break;
      }
      case 'throw': {
        const kind = m.kind === 'molotov' ? 'molotov' : 'grenade';
        this.syncPeer(m);
        this.quiet(() =>
          this.withPlayer(peer, () =>
            kind === 'molotov' ? g.structures.throwMolotov(g, m.tx, m.ty) : g.structures.throwGrenade(g, m.tx, m.ty),
          ),
        );
        const q = g.structures.grenades[g.structures.grenades.length - 1];
        if (q) q.owner = 'peer';
        break;
      }
      case 'ab': {
        // misil del Bomber invitado: la espera la lleva su celular; aquí sólo se frena el abuso
        const now = performance.now();
        if (now - (this.peerAbAt || -1e9) < (ABILITY.minCooldown - 2) * 1000) break;
        this.peerAbAt = now;
        this.syncPeer(m);
        if (Number.isFinite(m.tx) && Number.isFinite(m.ty)) g.structures.launchMissile(g, peer, m.tx, m.ty, 'peer');
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
      q.st = undefined;
      q.vx = 0;
      q.vy = 0;
      track(q, performance.now(), m.x, m.y);
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
        x: Number(m.x),
        y: Number(m.y),
        dx: Math.cos(a),
        dy: Math.sin(a),
        speed: d.speed * rand(0.95, 1.05),
        life: d.range * (d.pellets > 1 ? rand(0.8, 1) : 1),
        dmg: Math.min(Number(m.dmg) || d.damage, d.damage * 4),
        pierce: Math.min(m.pi | 0, 10),
        knock: d.knock,
        shot: null,
        hits: null,
        rocket: !!d.rocket,
        owner: 'peer',
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
        if (Array.isArray(m.e)) for (const e of m.e) g.remote.replay(e);
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

  /* ---------- invitado ---------- */

  guestTick(dt) {
    const g = this.game;
    const p = g.player;
    this.inT -= dt;
    if (this.inT > 0) return;
    this.inT = 1 / IN_HZ;
    const w = p.weapon;
    this.send(
      {
        t: 'in',
        ak: this.lastSeq || 0,
        ts: Math.round(performance.now()),
        x: Math.round(p.x),
        y: Math.round(p.y),
        a: r100(p.angle) / 100,
        la: r100(p.legAngle) / 100,
        wp: Math.round(p.walkPhase * 10) / 10,
        sp: Math.round(p.speedNow),
        run: p.running ? 1 : 0,
        al: p.alive ? 1 : 0,
        hp: Math.ceil(p.hp),
        mh: p.stats.maxHp,
        na: p.weapons.some((x) => x.reserve !== Infinity && x.reserve < p.reserveMax(x.def)) ? 1 : 0,
        w: w.id,
        mag: w.mag,
        rl: r100(Math.max(0, p.reloadT)) / 100,
        rp: r100(p.reloadProg || 0) / 100,
        ab: (p.rageT > 0 ? 1 : 0) | (p.boostT > 0 ? 2 : 0),
        // media pantalla en px del mundo: el anfitrión no hace aparecer zombis dentro de ella
        vw: Math.round(g.camera.viewW / 2),
        vh: Math.round(g.camera.viewH / 2),
      },
      true,
    );
  }

  sendShot(x, y, angles, d, stats) {
    this.send({
      t: 'shot',
      x: Math.round(x),
      y: Math.round(y),
      a: angles.map((a) => Math.round(a * 1000) / 1000),
      w: d.id,
      dmg: d.damage * stats.dmgMult,
      pi: d.pierce + stats.pierce,
    });
  }

  // game.mode.sendBuild: la pieza se descuenta cuando el anfitrión confirma ('built')
  guestBuild(kind) {
    const g = this.game;
    if (this.pendingBuild) return;
    this.pendingBuild = kind;
    const p = g.player;
    this.send({
      t: 'build',
      kind,
      x: Math.round(p.x),
      y: Math.round(p.y),
      a: Math.round(p.angle * 1000) / 1000,
    });
  }

  // game.mode.sendThrow: tryGrenade ya eligió el blanco y descontó la granada
  guestThrow(kind, tx, ty) {
    const p = this.game.player;
    this.send({
      t: 'throw',
      kind,
      tx: Math.round(tx),
      ty: Math.round(ty),
      x: Math.round(p.x),
      y: Math.round(p.y),
      a: Math.round(p.angle * 1000) / 1000,
    });
  }

  guestMissile(tx, ty) {
    const p = this.game.player;
    this.send({
      t: 'ab',
      tx: Math.round(tx),
      ty: Math.round(ty),
      x: Math.round(p.x),
      y: Math.round(p.y),
      a: Math.round(p.angle * 1000) / 1000,
    });
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
    g.remote.net.count();
    this.lastSeq = Number(s.q);
    applyCombo(g.player.combo, s.cb);
    // jugadores, robots, zombis, objetos, balas y estructuras: lo mismo que ve el cliente en línea
    // el reloj de llegada puede retroceder un poco: el instante de la foto nunca baja (Interp lo exige)
    const t = Math.max(this.clock.stamp(Number(s.ts)), (this.lastT || 0) + 1);
    this.lastT = t;
    g.remote.applyWorld(s, t, {
      myIdx: GUEST_IDX,
      identify: () => ({ name: this.peerName || 'Anfitrión', look: this.peerLook }),
      // las barricadas del anfitrión no estorban a su compañero (como antes de unificar)
      collide: false,
    });
  }

  // Reemplaza a game.update() en el celular del invitado.
  guestUpdate(dt) {
    const g = this.game;
    const p = g.player;
    if (g.input.consume('pause')) return g.pause();
    if (p.alive) {
      p.update(dt, g);
      if (g.input.consume('ability')) g.useAbility();
      if (g.input.consume('build')) g.tryBuild();
      if (g.input.consume('cycleBuild')) g.cycleBuild();
      if (g.input.consume('grenade')) g.tryGrenade();
      if (g.input.consume('molotov')) g.tryGrenade('molotov');
      if (g.input.consume('robot')) g.toggleRobot();
      if (g.input.consume('nextRound')) g.startNextRound();
    }
    // zombis y compañero: recorren el camino entre las posiciones recibidas (un poco en diferido)
    const R = g.remote;
    const rt = performance.now() - this.clock.delay;
    R.placePeers(rt, dt);
    R.placeZombies(rt, dt, p);
    const grid = g.horde.grid;
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
    // espera de la habilidad y megarráfaga (sus balas reales las crea el anfitrión)
    Abilities.update(dt, g, p);
    R.advance(dt);
    R.ambience(dt, p);
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
    if (this.role === 'guest') {
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
    if (this.role !== 'host' || !this.peer) return;
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
    const r = this.game.remote.net.tick(dt);
    if (!r) return null;
    const via = 'Directa';
    const lag = Math.round(this.clock.delay);
    return this.role === 'guest'
      ? `${via} · ${lag} ms · ${r.per} act/s · ${r.fps} FPS`
      : `${via} · ${lag} ms · ${r.fps} FPS`;
  }

  /* ---------- desconexión ---------- */

  leave() {
    if (!this.role && !this.net.role) return;
    this.send({ t: 'bye' });
    this.end();
  }

  end() {
    const g = this.game;
    this.uninstall();
    this.net.onClose = null;
    this.net.close();
    // el cooperativo termina pero la partida sigue sin guardarse (viene de un grupo)
    if (this.role) {
      g.mode = new Solo(g, true);
      g.remote.stop();
    }
    this.role = null;
    this.peer = null;
    if (g.director) g.director.coop = false;
  }

  lost() {
    const g = this.game;
    const wasGuest = this.role === 'guest';
    const name = this.peerName || 'Tu compañero';
    if (!this.role) return this.end();
    this.end();
    if (wasGuest) {
      g.newWorld();
      g.setupMenu();
      g.toast('Se perdió la conexión con el anfitrión');
    } else g.toast(`${name} se desconectó: sigues solo`);
  }
}

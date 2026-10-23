// Simulación autoritativa de una partida en línea (sin pantalla, sin sonido).
//
// Usa los mismos módulos del juego que el navegador (mundo, horda, balas, oleadas, objetos y
// el movimiento del jugador). Este archivo hace de "juego" para ellos: les da los
// jugadores como objetivos, aplica las entradas de cada uno y graba los efectos visuales y
// sonidos que ocurren para mandárselos sólo a quien los puede ver.
import './shim.ts';
import { World } from '../../../js/world.js';
import { Horde } from '../../../js/zombies.js';
import { Bullets } from '../../../js/bullets.js';
import { Director } from '../../../js/director.js';
import { Pickups } from '../../../js/pickups.js';
import { Player } from '../../../js/player.js';
import { bulletHit } from '../../../js/combat.js';
import { applyMove, packBody, IN_RELOAD, IN_FIRE, IN_RUN, TICK } from '../../../js/netcode.js';
import { TYPES, PICKS, PARTICLE_SKIP, SFX_SYNC, DECAL_SYNC } from '../../../js/coop.js';
import { GOLDEN, DROPS, WORLD_SIZE, WEAPON_ORDER, NET } from '../../../js/config.js';
import { rand, randInt, TAU } from '../../../js/util.js';
import type { Cmd } from '../validate.ts';

const FX_MAX = 300;
// entradas que se guardan como mucho por jugador (las más viejas se tiran)
const QUEUE_MAX = 30;
// con más atraso que esto, se procesan dos entradas en un paso para alcanzar
const BACKLOG = 4;
// en espera entre oleadas: la siguiente empieza sola pasado este tiempo
const AUTO_NEXT = 45;
// pasos sin entrada en los que se repite la última (luego, quieto)
const STARVE = 6;
const r100 = (v: number) => Math.round(v * 100);

type Fx = { e: unknown[]; x?: number; y?: number; by: string | null };

export type Slot = {
  id: string;
  idx: number;
  name: string;
  p: any;
  queue: Cmd[];
  last: Cmd;
  ack: number;
  kills: number;
  deaths: number;
  away: boolean;
  dropped: number;
  starve: number;
  toasts: string[];
};

export class ServerSim {
  seed: number;
  world: any;
  horde: any;
  bullets: any;
  director: any;
  pickups: any;
  slots = new Map<string, Slot>();
  tick = 0;
  time = 0;
  fx: Fx[] = [];
  actor: string | null = null;
  toastTo: string | null = null;
  lastPos = { x: 0, y: 0, ok: false };
  game: any;
  flowT = 0;
  goldenT = GOLDEN.firstAfter;
  waitT = 0;
  deadT = 0;
  over = false;
  kills: Record<string, number> = {};
  snapN = 0;

  constructor(seed: number, players: { id: string; idx: number; name: string }[]) {
    this.seed = seed;
    this.world = new World(seed);
    this.horde = new Horde();
    this.bullets = new Bullets();
    this.director = new Director();
    this.director.coop = true;
    this.director.crowd = NET.crowd[0] + NET.crowd[1] * Math.max(0, players.length - 1);
    this.pickups = new Pickups();
    this.game = this.makeGame();
    const s = this.world.spawn;
    players.forEach((pl, i) => {
      const a = (i / Math.max(1, players.length)) * TAU;
      const p: any = new Player(s.x + Math.cos(a) * 44 * Math.min(1, i), s.y + Math.sin(a) * 44 * Math.min(1, i));
      this.world.collide(p, p.r, true);
      p.field = this.newField();
      const idle: Cmd = { s: 0, mx: 0, my: 0, f: 0, a: p.angle, w: -1 };
      this.slots.set(pl.id, { id: pl.id, idx: pl.idx, name: pl.name, p, queue: [], last: idle, ack: 0, kills: 0, deaths: 0, away: false, dropped: 0, starve: 0, toasts: [] });
    });
  }

  newField() {
    const n = this.world.navN;
    return { dist: new Uint16Array(n * n).fill(65535), cell: -1, ok: false };
  }

  /* ---------- el "juego" que ven los módulos ---------- */

  makeGame() {
    const sim = this;
    const rec = (tag: string, n: string) => (...args: any[]) => sim.record(tag, n, args);
    const recorder = (tag: string, allow: (n: string) => boolean) =>
      new Proxy({}, { get: (_t, n: string) => (allow(n) ? rec(tag, n) : () => {}) });
    const input = {
      mode: 'mouse',
      // lo que pide la entrada que se está aplicando ahora
      get run() {
        return !!(input.cmd && input.cmd.f & IN_RUN);
      },
      get firing() {
        return !!(input.cmd && input.cmd.f & IN_FIRE);
      },
      cmd: null as Cmd | null,
      move: () => ({ x: input.cmd ? input.cmd.mx : 0, y: input.cmd ? input.cmd.my : 0 }),
      consume(k: string) {
        const c = input.cmd;
        if (!c) return 0;
        if (k === 'reload') return c.f & IN_RELOAD ? 1 : 0;
        if (k === 'slot') return c.w >= 0 && c.w !== g.player.wi ? c.w + 1 : 0;
        return 0;
      },
    };
    const noop = () => {};
    const g: any = {
      world: this.world,
      horde: this.horde,
      bullets: this.bullets,
      director: this.director,
      pickups: this.pickups,
      time: 0,
      state: 'play',
      targets: [],
      player: null,
      input,
      hurtFlash: 0,
      muzzle: 0,
      particles: recorder('p', (n) => !PARTICLE_SKIP.has(n)),
      decals: recorder('d', (n) => DECAL_SYNC.includes(n)),
      sfx: recorder('s', (n) => SFX_SYNC.includes(n)),
      camera: { viewW: 1280, viewH: 760, shake: rec('c', 'shake'), kick: noop },
      coop: { isHost: false, isGuest: false, active: true, peer: null },
      structures: { wires: [], grenades: [], fires: [], trapAt: () => null, damageBlock: noop, queueDeathBlast: noop, stickRocket: noop, explode: noop },
      // el punto al que apunta el jugador que se está moviendo (sale del ángulo que mandó)
      mouseWorld: () => {
        const p = g.player;
        const a = input.cmd ? input.cmd.a : p.angle;
        return { x: p.x + Math.cos(a) * 200, y: p.y + Math.sin(a) * 200 };
      },
      hitZombie: (z: any, b: any, hx: number, hy: number) => this.hitZombie(z, b, hx, hy),
      killZombie: (z: any) => this.killZombie(z),
      collectFor: (p: any, it: any) => this.collectFor(p, it),
      onPlayerDeath: () => this.onPlayerDeath(),
      onZombieHit: noop,
      onRobotHit: noop,
      rocketHit: noop,
      rocketBlast: noop,
      updateHud: noop,
      onSuperPunch: (_z: any, x: number, y: number) => {
        g.particles.dust(x, y, 18);
        g.camera.shake(0.35);
        g.sfx.punch();
      },
      onGiantStep: (z: any) => {
        g.particles.dust(z.x - Math.cos(z.angle) * 10, z.y - Math.sin(z.angle) * 10, z.r);
        g.sfx.stomp(0.7);
      },
      onGoldenExpired: (z: any) => {
        z.dead = true;
        g.particles.dust(z.x, z.y, 20);
        this.toastAll('El zombi dorado escapó');
      },
      onWaveCleared: () => this.onWaveCleared(),
      spawnFocus: () => {
        const alive = [...this.slots.values()].filter((s) => !s.away && s.p.alive);
        const s = alive.length ? alive[(Math.random() * alive.length) | 0] : null;
        return s ? s.p : this.world.spawn;
      },
      banner: rec('g', 'banner'),
      toast: (m: string) => (this.toastTo ? this.slots.get(this.toastTo)?.toasts.push(m) : this.toastAll(m)),
    };
    return g;
  }

  // Graba un efecto con su posición (si la tiene) para mandarlo a quien esté cerca.
  record(tag: string, n: string, args: any[]) {
    if (this.fx.length >= FX_MAX * 4) return;
    let x: number | undefined;
    let y: number | undefined;
    let packed: unknown[] = args;
    if (tag === 'd' && n === 'corpse') {
      const z = args[0];
      x = z.x;
      y = z.y;
      packed = [{ type: z.type, si: z.si | 0, x: Math.round(z.x), y: Math.round(z.y), r: z.r, a: r100(z.angle) / 100, burnt: !!z.burnt }, args[1], args[2]];
    } else if ((tag === 'p' || tag === 'd') && typeof args[0] === 'number' && typeof args[1] === 'number') {
      x = args[0];
      y = args[1];
    } else if ((tag === 's' || tag === 'c') && this.lastPos.ok && n !== 'wave') {
      // los sonidos y sacudidas no traen posición: se toma la del último efecto visual (el impacto, el
      // disparo o la muerte que los provocó van justo antes)
      x = this.lastPos.x;
      y = this.lastPos.y;
    }
    if (x !== undefined && y !== undefined) {
      this.lastPos.x = x;
      this.lastPos.y = y;
      this.lastPos.ok = true;
      packed = packed.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v));
    }
    this.fx.push({ e: [tag, n, packed], x, y, by: this.actor });
  }

  toastAll(m: string) {
    for (const s of this.slots.values()) s.toasts.push(m);
  }

  /* ---------- combate ---------- */

  hitZombie(z: any, b: any, hx: number, hy: number) {
    if (z.dead) return;
    z.lastOwner = b.owner || null;
    bulletHit(this.game, z, b, hx, hy);
    if (b.shot && !b.shot.hit) {
      b.shot.hit = true;
      const s = this.slots.get(b.owner);
      if (s) s.p.shotsHit++;
    }
    if (z.hp <= 0) this.killZombie(z);
  }

  killZombie(z: any) {
    if (z.dead) return;
    const g = this.game;
    z.dead = true;
    this.kills[z.type] = (this.kills[z.type] || 0) + 1;
    if (z.burn > 0) z.burnt = true;
    g.decals.corpse(z, z.lastDx || 0, z.lastDy || 0);
    const by = this.slots.get(z.lastOwner);
    if (by && z.type !== 'golden') by.kills++;
    if (z.type === 'golden') {
      // el dorado cuenta como 5 bajas para quien lo atrapó (en línea no hay dinero)
      if (by) {
        by.kills += 5;
        by.toasts.push('¡Zombi dorado! +5 bajas');
      }
      g.particles.pickupFx(z.x, z.y, '#f0c040');
    }
    g.particles.death(z.x, z.y, z.r);
    const r = Math.random();
    if (z.type === 'giant') {
      g.camera.shake(0.5);
      g.particles.ring(z.x, z.y, z.r, '170,160,140');
      this.pickups.drop('crate', z.x, z.y);
      this.pickups.drop('med', z.x + 24, z.y);
      g.sfx.kill(true);
      this.toastAll('Gigante abatido');
    } else {
      const drop = (DROPS as any)[z.type] || DROPS.normal;
      if (r < drop.ammo) this.pickups.drop('ammo', z.x, z.y);
      else if (r < drop.ammo + drop.med) this.pickups.drop('med', z.x, z.y);
      g.sfx.kill(z.type === 'fat' || z.type === 'heavy');
    }
  }

  // Un jugador recoge un objeto (mismas reglas que en solitario; el aviso es sólo para él).
  collectFor(p: any, it: any) {
    const s = [...this.slots.values()].find((q) => q.p === p);
    const g = this.game;
    // el efecto de recoger sí lo ve él (no es algo que su pantalla haya predicho)
    const saved = [g.player, this.actor, this.toastTo];
    g.player = p;
    this.actor = null;
    this.toastTo = s ? s.id : null;
    try {
      return this.pickups.collect(it, g);
    } finally {
      [g.player, this.actor, this.toastTo] = saved;
    }
  }

  onPlayerDeath() {
    for (const s of this.slots.values()) {
      if (s.p.alive || s.p.counted) continue;
      s.p.counted = true;
      s.deaths++;
      s.queue.length = 0;
      this.toastAll(`${s.name} cayó: revive al terminar la oleada`);
    }
  }

  onWaveCleared() {
    // al terminar la oleada revive quien haya caído, junto a un compañero vivo
    const alive = [...this.slots.values()].filter((s) => s.p.alive && !s.away);
    for (const s of this.slots.values()) {
      if (s.p.alive || !alive.length) continue;
      const q = alive[(Math.random() * alive.length) | 0].p;
      const p = s.p;
      p.alive = true;
      p.counted = false;
      p.hp = Math.round(p.stats.maxHp * 0.5);
      p.x = q.x + 40;
      p.y = q.y;
      p.vx = p.vy = p.kx = p.ky = 0;
      this.world.collide(p, p.r, true);
      s.toasts.push('¡Reviviste!');
    }
    this.waitT = 0;
  }

  /* ---------- entradas ---------- */

  push(id: string, cmds: Cmd[]) {
    const s = this.slots.get(id);
    if (!s || !s.p.alive) return;
    for (const c of cmds) {
      const lastSeen = s.queue.length ? s.queue[s.queue.length - 1].s : s.ack;
      // repetidas o viejas: fuera
      if (c.s <= lastSeen) continue;
      s.queue.push(c);
    }
    if (s.queue.length > QUEUE_MAX) {
      s.dropped += s.queue.length - QUEUE_MAX;
      s.queue.splice(0, s.queue.length - QUEUE_MAX);
    }
  }

  // Un jugador se cayó de la conexión: se queda quieto y los zombis lo ignoran hasta que vuelva.
  setAway(id: string, away: boolean) {
    const s = this.slots.get(id);
    if (!s) return;
    s.away = away;
    s.queue.length = 0;
    s.last = { ...s.last, mx: 0, my: 0, f: 0 };
  }

  remove(id: string) {
    this.slots.delete(id);
  }

  nextRound() {
    return this.director.nextRound(this.game);
  }

  /* ---------- un paso de simulación ---------- */

  step() {
    const g = this.game;
    this.tick++;
    this.time += TICK;
    g.time = this.time;
    const live = [...this.slots.values()].filter((s) => !s.away);
    g.targets = live.map((s) => s.p);
    for (const s of live) {
      const p = s.p;
      if (!p.alive) continue;
      const n = s.queue.length > BACKLOG ? 2 : 1;
      for (let k = 0; k < n; k++) {
        let cmd = s.queue.shift();
        if (cmd) {
          s.ack = cmd.s;
          s.starve = 0;
        } else if (++s.starve <= STARVE) {
          // hueco corto sin entrada (red irregular): se repite la última, sin volver a recargar
          cmd = { ...s.last, f: s.last.f & ~IN_RELOAD };
        } else {
          // el cliente dejó de mandar (pestaña oculta, celular bloqueado): se queda quieto
          cmd = { ...s.last, mx: 0, my: 0, f: 0 };
        }
        s.last = cmd;
        this.applyCmd(s, cmd);
      }
    }
    this.flowT -= TICK;
    if (this.flowT <= 0) {
      for (const s of live) if (s.p.alive) this.world.computeField(s.p.field, s.p.x, s.p.y);
      this.flowT = 0.2;
    }
    const d = this.director;
    d.update(TICK, g);
    if (d.state === 'active' && live.some((s) => s.p.alive)) {
      this.goldenT -= TICK;
      if (this.goldenT <= 0) {
        const alive = this.horde.list.some((z: any) => z.type === 'golden' && !z.dead);
        if (!alive && this.spawnGolden()) this.goldenT = rand(GOLDEN.every[0], GOLDEN.every[1]);
        else this.goldenT = 5;
      }
    }
    if (d.state === 'waiting') {
      this.waitT += TICK;
      if (this.waitT > AUTO_NEXT) this.nextRound();
    }
    this.horde.update(TICK, g);
    this.bullets.update(TICK, g);
    this.horde.removeDead();
    this.pickups.update(TICK, g);
    // fin: todos los presentes cayeron (con un respiro por si es el último zombi)
    if (live.length && live.every((s) => !s.p.alive)) {
      this.deadT += TICK;
      if (this.deadT > 2) this.over = true;
    } else this.deadT = 0;
  }

  applyCmd(s: Slot, cmd: Cmd) {
    const g = this.game;
    const p = s.p;
    g.player = p;
    g.input.cmd = cmd;
    this.actor = s.id;
    this.toastTo = s.id;
    const before = this.bullets.list.length;
    applyMove(p, cmd, g);
    p.act(TICK, g, { x: cmd.mx, y: cmd.my });
    // las balas que acaba de disparar son suyas (bajas y aciertos)
    for (let i = before; i < this.bullets.list.length; i++) this.bullets.list[i].owner = s.id;
    g.input.cmd = null;
    g.player = null;
    this.actor = null;
    this.toastTo = null;
  }

  spawnGolden() {
    const d = this.director;
    for (let i = 0; i < 20; i++) {
      const c = d.edgePoint(this.game, rand(60, 140));
      if (c.x < 80 || c.y < 80 || c.x > WORLD_SIZE - 80 || c.y > WORLD_SIZE - 80) continue;
      if (this.world.pointBlocked(c.x, c.y, 16) || !this.world.reachable(c.x, c.y)) continue;
      this.horde.spawn('golden', c.x, c.y, 1, 1);
      this.game.sfx.goldenSpawn();
      this.toastAll('¡Apareció un zombi dorado! Atrápalo antes de que escape');
      return true;
    }
    return false;
  }

  /* ---------- fotos para cada jugador ---------- */

  totalKills() {
    return Object.values(this.kills).reduce((a, b) => a + b, 0);
  }

  // Lo que ve un jugador: su estado confirmado, los demás, los zombis y objetos cercanos.
  snapshot(id: string, now: number) {
    const s = this.slots.get(id);
    if (!s) return null;
    const me = s.p;
    const V = NET.view;
    const near = (x: number, y: number) => Math.abs(x - me.x) < V && Math.abs(y - me.y) < V;
    const ox = Math.round(me.x);
    const oy = Math.round(me.y);
    const z: number[] = [];
    const zx: number[] = [];
    for (const o of this.horde.list) {
      if (o.dead || !near(o.x, o.y)) continue;
      const flags = (o.flash > 0 ? 1 : 0) | (o.burn > 0 ? 2 : 0) | (o.wounded ? 4 : 0) | (o.bs === 'windup' ? 8 : 0)
        | (o.hitT > 0 ? 16 : 0) | (o.type === 'golden' && o.life < GOLDEN.warnAt ? 32 : 0) | (o.lunge > 0.3 ? 64 : 0);
      z.push(o.id, TYPES.indexOf(o.type), Math.round(o.x - ox), Math.round(o.y - oy), Math.round((o.angle / TAU) * 64) & 63, flags);
      if (o.air > 0 || o.swell > 0) zx.push(o.id, Math.round(o.air || 0), r100(o.swell || 0));
    }
    const pl: number[] = [];
    for (const q of this.slots.values()) {
      if (q === s) continue;
      const p = q.p;
      pl.push(q.idx, Math.round(p.x), Math.round(p.y), r100(p.angle), r100(p.legAngle), p.running ? 1 : 0, WEAPON_ORDER.indexOf(p.weapon.id),
        p.flashT > 0 ? 1 : 0, p.alive ? 1 : 0, p.hurtT > 0 ? 1 : 0, r100(p.recoil), Math.round(p.speedNow), Math.ceil(p.hp), q.away ? 1 : 0);
    }
    const fx: unknown[] = [];
    for (const f of this.fx) {
      if (fx.length >= FX_MAX) break;
      // lo que provocó él mismo (su disparo, su humo) ya lo vio en su pantalla al instante
      if (f.by === id && f.e[0] !== 'd' && f.e[1] !== 'hit' && f.e[1] !== 'kill') continue;
      if (f.x !== undefined && f.y !== undefined && !near(f.x, f.y)) continue;
      fx.push(f.e);
    }
    const d = this.director;
    const snap: any = {
      q: ++this.snapN, t: this.tick, ts: Math.round(now), ack: s.ack,
      me: packBody(me),
      st: [Math.ceil(me.hp), me.stats.maxHp, me.alive ? 1 : 0, me.wi, r100(Math.max(0, me.reloadT)), r100(me.reloadProg || 0), s.kills],
      wp: me.weapons.map((w: any) => [w.id, w.mag, w.reserve === Infinity ? -1 : w.reserve]),
      o: [ox, oy], z, zx, pl,
      pk: this.pickups.list.flatMap((it: any) => (near(it.x, it.y) ? [PICKS.indexOf(it.k), Math.round(it.x), Math.round(it.y), Math.round(it.t * 10)] : [])),
      b: this.bullets.list.flatMap((b: any) => (b.owner !== id && near(b.x, b.y) ? [Math.round(b.x), Math.round(b.y), r100(b.dx), r100(b.dy), b.rocket ? 1 : 0] : [])),
      w: d.wave, ds: d.state, tm: Math.round(this.time), kl: this.totalKills(), lft: d.queue.length + this.horde.list.length,
    };
    if (fx.length) snap.fx = fx;
    if (s.toasts.length) {
      snap.tt = s.toasts.slice(0, 4);
      s.toasts.length = 0;
    }
    return snap;
  }

  // Después de mandar las fotos de esta ronda, los efectos ya enviados se olvidan.
  flushFx() {
    this.fx.length = 0;
    this.lastPos.ok = false;
  }

  results() {
    return {
      wave: this.director.wave,
      time: Math.round(this.time),
      kills: this.totalKills(),
      players: [...this.slots.values()].map((s) => ({ name: s.name, kills: s.kills, deaths: s.deaths })).sort((a, b) => b.kills - a.kills),
    };
  }
}

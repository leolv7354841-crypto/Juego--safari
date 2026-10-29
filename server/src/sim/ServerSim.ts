// Simulación autoritativa de una partida en línea (sin pantalla, sin sonido).
//
// Usa los mismos módulos del juego que el navegador (mundo, horda, balas, oleadas, objetos y
// el movimiento del jugador). Este archivo hace de "juego" para ellos: les da los
// jugadores como objetivos, aplica las entradas de cada uno y graba los efectos visuales y
// sonidos que ocurren para mandárselos sólo a quien los puede ver.
import { World } from '../../../js/sim/world.ts';
import { Horde } from '../../../js/sim/zombies.ts';
import { Bullets } from '../../../js/sim/bullets.ts';
import { Director } from '../../../js/sim/director.ts';
import { Pickups } from '../../../js/sim/pickups.ts';
import { Player } from '../../../js/sim/player.ts';
import { Structures } from '../../../js/sim/build.ts';
import { Robot } from '../../../js/sim/robot.ts';
import { applyMove, TICK } from '../../../js/net/netcode.ts';
import { ServerMode } from '../../../js/net/mode.ts';
import { encodeWorld } from '../../../js/net/snapshot.ts';
import { IN_RELOAD, IN_FIRE, IN_RUN, PARTICLE_SKIP, SFX_SYNC, DECAL_SYNC } from '../../../js/net/protocol.ts';
import {
  GOLDEN,
  NET,
  WEAPONS,
  SELL_RATE,
  SHOP,
  SHOP_ORDER,
  BUILD_ORDER,
  THROWABLES,
  ROBOT,
  CLASS_ORDER,
  HEAVY,
  xpForLevel,
} from '../../../js/core/config.ts';
import { rollUpgrades, UPGRADES } from '../../../js/sim/upgrades.ts';
import { Abilities, isClass } from '../../../js/sim/abilities.ts';
import * as Rules from '../../../js/sim/rules.ts';
import { comboBreak, comboKill, comboTick, packCombo } from '../../../js/sim/combo.ts';
import { TAU } from '../../../js/core/util.ts';
import type { Cmd, Act } from '../validate.ts';
import type { Snapshot } from '../../../js/core/types.d.ts';

const FX_MAX = 300;
// entradas que se guardan como mucho por jugador (las más viejas se tiran)
const QUEUE_MAX = 30;
// con más atraso que esto, se procesan dos entradas en un paso para alcanzar
const BACKLOG = 4;
// en espera entre oleadas: la siguiente empieza sola pasado este tiempo
const AUTO_NEXT = 45;
// pasos sin entrada en los que se repite la última (luego, quieto)
const STARVE = 6;
// acciones (construir, lanzar, robot) que esperan a que el servidor llegue a su entrada
const ACTS_MAX = 8;
// fotos entre envíos de barricadas y trampas mientras sólo cambia su vida
const STRUCT_EVERY = 6;
const r100 = (v: number) => Math.round(v * 100);
const UPGRADE_BY_ID = new Map<string, any>(UPGRADES.map((u: any) => [u.id, u]));
// estadísticas del jugador que cambian con las mejoras (el cliente las necesita para predecir)
export const STAT_KEYS = [
  'maxHp',
  'armor',
  'dmgMult',
  'rateMult',
  'maxStamina',
  'staminaRegenMult',
  'speedMult',
  'ammoMult',
  'pierce',
  'reloadMult',
  'cdMult',
];

type Fx = { e: unknown[]; x?: number; y?: number; by: string | null };

// Origen de las entradas de un jugador: el buffer de Colyseus (defineInput). ack = entradas ya consumidas.
export type CmdPort = { size: number; next(): Cmd | undefined; ack(): number };

export type Slot = {
  id: string;
  idx: number;
  name: string;
  p: any;
  queue: Cmd[];
  // entradas del canal de Colyseus (las pone la sala); si hay, la cola propia no se usa
  port?: CmdPort;
  last: Cmd;
  ack: number;
  kills: number;
  money: number;
  deaths: number;
  away: boolean;
  dropped: number;
  starve: number;
  toasts: string[];
  // nivel propio: cada uno elige sus mejoras (y compra en la tienda con su dinero)
  level: number;
  xp: number;
  xpNeed: number;
  pending: number;
  taken: Record<string, number>;
  // mejoras ofrecidas ahora (ids) y su número de tanda, para no aplicar una elección vieja
  choices: string[];
  choiceN: number;
  // barricadas, trampas y lanzables comprados (sin usar), su robot y el ácido que lo quema
  inv: Record<string, number>;
  robot: any;
  acts: Act[];
  acidT: number;
  acidTick: number;
  // dinero perdido por golpes desde la última foto (para el aviso en su pantalla)
  lost: number;
  // última versión de barricadas y trampas que se le mandó
  stGeo: string;
  stSent: string;
  stN: number;
};

export class ServerSim {
  seed: number;
  world: any;
  horde: any;
  bullets: any;
  director: any;
  pickups: any;
  structures: any;
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

  constructor(seed: number, players: { id: string; idx: number; name: string; cls?: string }[]) {
    this.seed = seed;
    this.world = new World(seed);
    this.horde = new Horde();
    this.bullets = new Bullets();
    this.director = new Director();
    this.director.coop = true;
    this.director.crowd = NET.crowd[0] + NET.crowd[1] * Math.max(0, players.length - 1);
    this.pickups = new Pickups();
    this.structures = new Structures();
    this.game = this.makeGame();
    const s = this.world.spawn;
    players.forEach((pl, i) => {
      const a = (i / Math.max(1, players.length)) * TAU;
      const p: any = new Player(s.x + Math.cos(a) * 44 * Math.min(1, i), s.y + Math.sin(a) * 44 * Math.min(1, i));
      this.world.collide(p, p.r, true);
      p.field = this.newField();
      // clase elegida en el lobby (si no eligió, bomber)
      p.cls = isClass(pl.cls ?? '') ? pl.cls : CLASS_ORDER[0];
      const idle: Cmd = { s: 0, mx: 0, my: 0, f: 0, a: p.angle, w: -1 };
      this.slots.set(pl.id, {
        id: pl.id,
        idx: pl.idx,
        name: pl.name,
        p,
        queue: [],
        last: idle,
        ack: 0,
        kills: 0,
        money: 0,
        deaths: 0,
        away: false,
        dropped: 0,
        starve: 0,
        toasts: [],
        level: 1,
        xp: 0,
        xpNeed: xpForLevel(1),
        pending: 0,
        taken: {},
        choices: [],
        choiceN: 0,
        inv: Object.fromEntries(SHOP_ORDER.map((k: string) => [k, 0])),
        robot: new Robot(),
        acts: [],
        acidT: 0,
        acidTick: 0,
        lost: 0,
        stGeo: '',
        stSent: '',
        stN: 0,
      });
    });
  }

  newField() {
    const n = this.world.navN;
    return { dist: new Uint16Array(n * n).fill(65535), cell: -1, ok: false };
  }

  /* ---------- el "juego" que ven los módulos ---------- */

  makeGame() {
    const sim = this;
    const rec =
      (tag: string, n: string) =>
      (...args: any[]) =>
        sim.record(tag, n, args);
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
      mode: new ServerMode(),
      structures: this.structures,
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
      onZombieHit: (_z: any, p: any) => this.onZombieHit(p),
      onRobotHit: (dmg: number, p: any) => this.onRobotHit(dmg, p),
      applyAcid: (p: any) => this.applyAcid(p),
      rocketHit: (z: any, x: number, y: number, b: any) => Rules.rocketHit(g, z, x, y, b),
      rocketBlast: (x: number, y: number, owner: string | null = null) => Rules.rocketBlast(g, x, y, owner),
      heavyBlast: (x: number, y: number, owner: string | null = null) => Rules.heavyBlast(g, x, y, owner),
      updateHud: noop,
      onSuperPunch: (_z: any, x: number, y: number) => Rules.superPunch(g, x, y),
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
      // la bala de la torreta no va en la foto: cada cliente lanza la suya al recibir el disparo
      onTurretShot: (x: number, y: number, a: number) => this.record('t', 'shot', [x, y, a]),
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
    // temblor: sólo los que tienen lugar (cada cliente lo apaga con la distancia a su cámara);
    // los de un jugador (su golpe, su muerte) los pone su propio cliente
    if (tag === 'c' && (typeof args[1] !== 'number' || typeof args[2] !== 'number')) return;
    if (tag === 'c') {
      x = args[1];
      y = args[2];
    } else if (tag === 'd' && n === 'corpse') {
      const z = args[0];
      x = z.x;
      y = z.y;
      packed = [
        {
          type: z.type,
          si: z.si | 0,
          x: Math.round(z.x),
          y: Math.round(z.y),
          r: z.r,
          a: r100(z.angle) / 100,
          burnt: !!z.burnt,
        },
        args[1],
        args[2],
      ];
    } else if (
      (tag === 'p' || tag === 'd' || tag === 't') &&
      typeof args[0] === 'number' &&
      typeof args[1] === 'number'
    ) {
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
    const shotHit = (bb: any) => {
      const s = this.slots.get(bb.owner);
      if (s) s.p.shotsHit++;
    };
    if (Rules.hitZombie(this.game, z, b, hx, hy, shotHit)) this.killZombie(z);
  }

  killZombie(z: any) {
    const by = this.slots.get(z.lastOwner);
    // la baja alarga la racha de quien la hizo: su multiplicador sube el dinero y la experiencia
    const mult = by && !z.dead ? comboKill(by.p.combo, z.type) : 1;
    Rules.killZombie(this.game, z, {
      kills: this.kills,
      // la experiencia es del equipo (todos suben de nivel juntos)
      xp: (zb: any) => {
        for (const s of this.slots.values()) this.addXp(s, Math.round(zb.def.xp * mult));
      },
      bounty: (zb: any) => {
        if (!by) return;
        by.kills++;
        by.money += Rules.bountyNow(this.game, by.p, zb.type, mult);
      },
      // recompensa única del zombi dorado para quien lo mató (como en solitario)
      golden: (_zb: any, reward: number) => {
        if (!by) return;
        by.money += reward;
        by.toasts.push(`¡Zombi dorado! +$${reward}`);
      },
      toast: (m: string) => this.toastAll(m),
    });
  }

  addXp(s: Slot, n: number) {
    s.pending += Rules.gainXp(s, n);
  }

  /* ---------- mejoras (en cualquier momento) y tienda (entre oleadas) ---------- */

  // Ofrece la siguiente tanda de mejoras a quien tenga niveles sin elegir (también a mitad de
  // oleada: el jugador la abre cuando quiere, porque la partida no se detiene por él).
  offerUpgrades() {
    for (const s of this.slots.values()) {
      if (s.choices.length || s.pending <= 0 || !s.p.alive) continue;
      const ups = rollUpgrades(s.p, s.level - s.pending + 1, s.taken);
      if (!ups.length) {
        s.pending = 0;
        continue;
      }
      s.choices = ups.map((u: any) => u.id);
      s.choiceN++;
    }
  }

  pick(id: string, i: number, n: number) {
    const s = this.slots.get(id);
    if (!s || n !== s.choiceN || !s.choices[i]) return false;
    const u = UPGRADE_BY_ID.get(s.choices[i]);
    if (!u) return false;
    u.apply(s.p);
    s.taken[u.id] = (s.taken[u.id] || 0) + 1;
    s.pending--;
    s.choices = [];
    if (u.weapon) s.toasts.push(`${u.name} equipada`);
    return true;
  }

  // Compra o venta en la tienda: sólo entre oleadas y con el dinero que lleva el servidor.
  shop(id: string, k: string, wid: string, n: number) {
    const s = this.slots.get(id);
    if (!s || !s.p.alive || this.director.state !== 'waiting') return false;
    if (k === 'item') return this.buyItem(s, wid);
    if (k === 'robot') return this.buyRobot(s, wid);
    if (k === 'heavy') return this.buyHeavyAmmo(s, n);
    const d = Object.hasOwn(WEAPONS, wid) ? (WEAPONS as any)[wid] : null;
    if (!d) return false;
    const p = s.p;
    if (k === 'gun') {
      if (!d.price || p.has(wid) || s.money < d.price) return false;
      s.money -= d.price;
      p.unlock(wid);
      s.toasts.push(`${d.name} comprada`);
    } else if (k === 'sell') {
      if (!d.price || !p.removeWeapon(wid)) return false;
      const gain = Math.round(d.price * SELL_RATE);
      s.money += gain;
      s.toasts.push(`${d.name} vendida: +$${gain}`);
    } else if (k === 'ammo') {
      const w = p.weapons.find((x: any) => x.id === wid);
      if (!w || w.reserve === Infinity || (n !== 1 && n !== 10)) return false;
      const cost = d.ammoPrice * n;
      if (s.money < cost) return false;
      s.money -= cost;
      w.reserve += p.magSize(d) * n;
    } else return false;
    return true;
  }

  // Barricadas, trampas, granadas y molotovs: van a su inventario y los usa cuando quiere.
  buyItem(s: Slot, k: string) {
    const it = Object.hasOwn(SHOP, k) ? (SHOP as any)[k] : null;
    if (!it || s.money < it.price) return false;
    s.money -= it.price;
    s.inv[k]++;
    return true;
  }

  // Balas de la torreta pesada: las usa cualquiera que monte (de 1 o 5 cintas).
  buyHeavyAmmo(s: Slot, n: number) {
    const cost = HEAVY.price * n;
    if ((n !== 1 && n !== 5) || s.money < cost) return false;
    s.money -= cost;
    s.p.heavyAmmo += HEAVY.pack * n;
    return true;
  }

  buyRobot(s: Slot, what: string) {
    const rb = s.robot;
    if (what === 'buy') {
      if (rb.owned || s.money < ROBOT.price) return false;
      s.money -= ROBOT.price;
      rb.deploy(s.p, this.world);
      s.toasts.push('Robot listo: acércate y súbete');
      return true;
    }
    if (what !== 'repair') return false;
    const cost = rb.repairCost;
    if (!rb.owned || cost <= 0 || s.money < cost) return false;
    s.money -= cost;
    rb.hp = ROBOT.hp;
    s.toasts.push('Robot reparado');
    return true;
  }

  /* ---------- construir, lanzar y el robot (en cualquier momento) ---------- */

  // La acción se hace cuando el servidor llega a la entrada que el jugador acababa de mandar,
  // así se coloca o se lanza desde donde él se veía y hacia donde apuntaba.
  act(id: string, a: Act) {
    const s = this.slots.get(id);
    if (!s || !s.p.alive || s.acts.length >= ACTS_MAX) return;
    s.acts.push(a);
  }

  runActs(s: Slot) {
    while (s.acts.length && s.acts[0].s <= s.ack) this.doAct(s, s.acts.shift()!);
  }

  doAct(s: Slot, a: Act) {
    const g = this.game;
    const p = s.p;
    if (!p.alive) return;
    // todos (también él) ven y oyen lo que hizo: su pantalla no lo predijo
    g.player = p;
    this.actor = null;
    this.toastTo = s.id;
    try {
      if (a.k === 'build') {
        if (!BUILD_ORDER.includes(a.kind) || s.inv[a.kind] <= 0) return;
        if (this.structures.place(g, a.kind, s.id)) {
          s.inv[a.kind]--;
          g.sfx.build();
        } else s.toasts.push('No cabe ahí');
      } else if (a.k === 'throw') {
        if (!THROWABLES.includes(a.kind) || s.inv[a.kind] <= 0) return;
        s.inv[a.kind]--;
        if (a.kind === 'molotov') this.structures.throwMolotov(g, a.tx, a.ty, s.id);
        else this.structures.throwGrenade(g, a.tx, a.ty, s.id);
      } else if (a.k === 'robot') this.toggleRobot(s);
      else if (a.k === 'ab') {
        // la megarráfaga y el impulso ya los vio en su pantalla; el misil, no
        if (p.cls !== 'bomber') this.actor = s.id;
        Abilities.use(g, p, a.tx, a.ty, s.id);
      }
    } finally {
      g.player = null;
      this.actor = null;
      this.toastTo = null;
    }
  }

  // Subirse o bajarse de su robot (las mismas reglas que en solitario); junto a una torreta
  // pesada libre, la monta.
  toggleRobot(s: Slot) {
    const rb = s.robot;
    const p = s.p;
    const st = this.structures;
    if (p.manned) {
      st.leaveHeavy(p);
      this.game.sfx.build();
      return;
    }
    const h = p.inRobot ? null : st.nearHeavy(p);
    if (h) {
      st.mountHeavy(p, h);
      this.game.sfx.build();
      if (p.heavyAmmo <= 0) s.toasts.push('Torreta sin balas: cómpralas en la tienda');
      return;
    }
    if (!rb.owned) return s.toasts.push('Compra el robot de combate en la tienda');
    if (rb.piloted) {
      rb.leave(p, this.world);
      this.game.sfx.build();
      return;
    }
    if (rb.broken) return s.toasts.push('Robot destruido: repáralo en la tienda');
    if (!rb.near(p)) return s.toasts.push('Acércate al robot para subirte');
    rb.board(p);
    this.game.sfx.punch();
    this.game.camera.shake(0.2);
  }

  slotOf(p: any) {
    for (const s of this.slots.values()) if (s.p === p) return s;
    return null;
  }

  // Golpes a quien va en su robot: los aguanta el blindaje hasta que revienta.
  onRobotHit(dmg: number, p: any) {
    const s = this.slotOf(p);
    if (!s) return;
    if (Rules.robotHit(this.game, s.robot, dmg, p)) s.toasts.push('¡Robot destruido! Repáralo en la tienda');
  }

  // Cada golpe de zombi cuesta dinero (como en solitario; dentro del robot, no).
  onZombieHit(p: any) {
    const s = this.slotOf(p);
    if (!s || p.inRobot || p.boostT > 0) return;
    comboBreak(p.combo);
    const loss = Rules.hitLoss(s.money);
    if (loss <= 0) return;
    s.money -= loss;
    s.lost += loss;
  }

  // Ácido del gordo: quema unos segundos (vida fija por segundo).
  applyAcid(p: any) {
    const s = this.slotOf(p);
    if (!s || !Rules.canBurn(this.game, p)) return;
    Rules.startAcid(s);
  }

  updateAcid(s: Slot) {
    if (!(s.acidT > 0)) return;
    s.acidT = Rules.acidStep(
      this.game,
      s.p,
      s,
      TICK,
      () => {},
      () => this.onPlayerDeath(),
    );
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
      this.structures.leaveHeavy(s.p);
      s.deaths++;
      s.queue.length = 0;
      s.acts.length = 0;
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
    if (away) this.structures.leaveHeavy(s.p);
    s.queue.length = 0;
    s.acts.length = 0;
    s.last = { ...s.last, mx: 0, my: 0, f: 0 };
  }

  remove(id: string) {
    const s = this.slots.get(id);
    if (s) this.structures.leaveHeavy(s.p);
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
      const port = s.port;
      const n = (port ? port.size : s.queue.length) > BACKLOG ? 2 : 1;
      for (let k = 0; k < n; k++) {
        let cmd = port ? port.next() : s.queue.shift();
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
        this.runActs(s);
      }
    }
    for (const s of live) {
      // el robot pilotado va donde va su piloto (pisadas, chispas si está dañado)
      s.robot.update(TICK, s.p, g);
      this.updateAcid(s);
      comboTick(s.p, TICK);
    }
    this.structures.update(TICK, g);
    this.flowT -= TICK;
    if (this.flowT <= 0) {
      for (const s of live) if (s.p.alive) this.world.computeField(s.p.field, s.p.x, s.p.y);
      this.flowT = 0.2;
    }
    const d = this.director;
    d.update(TICK, g);
    if (d.state === 'active' && live.some((s) => s.p.alive)) {
      this.goldenT = Rules.goldenTick(g, this.goldenT, TICK, (m) => this.toastAll(m));
    }
    this.offerUpgrades();
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
    Abilities.update(TICK, g, p);
    // las balas que acaba de disparar son suyas (bajas y aciertos)
    for (let i = before; i < this.bullets.list.length; i++) this.bullets.list[i].owner = s.id;
    g.input.cmd = null;
    g.player = null;
    this.actor = null;
    this.toastTo = null;
  }

  // Media pantalla que mandó el jugador: el director no hace aparecer zombis dentro de ella.
  setView(id: string, w: number, h: number) {
    const s = this.slots.get(id);
    if (!s) return;
    s.p.vw = w;
    s.p.vh = h;
  }

  /* ---------- fotos para cada jugador ---------- */

  totalKills() {
    return Object.values(this.kills).reduce((a, b) => a + b, 0);
  }

  // Lo que ve un jugador: su estado confirmado, los demás, los zombis y objetos cercanos.
  snapshot(id: string, now: number): Snapshot | null {
    const s = this.slots.get(id);
    if (!s) return null;
    const me = s.p;
    const V = NET.view;
    const near = (x: number, y: number) => Math.abs(x - me.x) < V && Math.abs(y - me.y) < V;
    // la parte del mundo es la misma que arma el anfitrión del cooperativo (js/net/snapshot.js)
    const world = encodeWorld(
      this,
      { x: me.x, y: me.y, vw: me.vw, vh: me.vh },
      {
        players: [...this.slots.values()].filter((q) => q !== s).map((q) => ({ idx: q.idx, p: q.p, away: q.away })),
        robots: [...this.slots.values()].map((q) => ({ idx: q.idx, r: q.robot })),
        // lo que disparó él ya lo vio en su pantalla; las torretas se repiten como efecto
        skipBullet: (b: any) => b.owner === id || !!b.turret,
      },
    );
    const st = this.structures;
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
      q: ++this.snapN,
      t: this.tick,
      ts: Math.round(now),
      ack: s.ack,
      st: [
        Math.ceil(me.hp),
        me.stats.maxHp,
        me.alive ? 1 : 0,
        me.wi,
        r100(Math.max(0, me.reloadT)),
        r100(me.reloadProg || 0),
        s.kills,
        s.money,
        Math.round(s.acidT * 10),
        me.inRobot ? 1 : 0,
        me.heavyAmmo,
        me.manned ? me.manned.x : -1,
        me.manned ? me.manned.y : -1,
      ],
      wp: me.weapons.map((w: any) => [w.id, w.mag, w.reserve === Infinity ? -1 : w.reserve]),
      ...world,
      kl: this.totalKills(),
      lft: d.queue.length + this.horde.list.length,
      ec: [s.level, Math.round(s.xp), s.xpNeed, s.pending],
      ps: STAT_KEYS.map((k) => Math.round(me.stats[k] * 1000) / 1000),
      iv: SHOP_ORDER.map((k: string) => s.inv[k]),
      // torretas pesadas que manejan los demás: dónde, ángulo del cañón, quién y cañón que disparó
      hv: st.blocks.flatMap((b: any) => {
        const q = b.kind === 'heavy' && b.manned && b.manned !== me && near(b.x, b.y) ? this.slotOf(b.manned) : null;
        return q ? [b.x, b.y, r100(b.ang), q.idx, b.flash > 0 ? b.side : 0] : [];
      }),
      // habilidad propia: clase, espera (décimas) y megarráfaga en curso
      ab: [CLASS_ORDER.indexOf(me.cls), Math.ceil((me.abCd || 0) * 10), r100(me.rageT || 0)],
      // racha propia: bajas seguidas y décimas que le quedan
      cb: packCombo(me.combo),
    };
    this.structSnap(s, snap);
    if (s.lost) {
      snap.ml = s.lost;
      s.lost = 0;
    }
    if (s.choices.length) snap.up = [s.choiceN, ...s.choices];
    if (fx.length) snap.fx = fx;
    if (s.toasts.length) {
      snap.tt = s.toasts.slice(0, 4);
      s.toasts.length = 0;
    }
    return snap;
  }

  // Barricadas, trampas y quemaduras del suelo: al momento si se pone o se rompe alguna; si
  // sólo cambia su vida, cada STRUCT_EVERY fotos (son de todo el mapa).
  structSnap(s: Slot, snap: any) {
    const st = this.structures;
    const sc = st.scorches[st.scorches.length - 1];
    const geo =
      st.blocks.map((b: any) => `${b.kind}${b.x},${b.y},${b.w},${b.h}`).join() +
      '|' +
      st.wires.map((w: any) => `${w.kind}${w.x},${w.y},${w.w},${w.h}`).join() +
      '|' +
      st.scorches.length +
      (sc ? `,${Math.round(sc.x)},${Math.round(sc.y)}` : '');
    const full =
      geo +
      '|' +
      st.blocks.map((b: any) => Math.round(b.hp)).join() +
      '|' +
      st.wires.map((w: any) => Math.round(w.hp)).join();
    s.stN++;
    if (full === s.stSent || (geo === s.stGeo && s.stN < STRUCT_EVERY)) return;
    s.stGeo = geo;
    s.stSent = full;
    s.stN = 0;
    snap.blk = st.blocks.map((b: any) => [b.kind, b.x, b.y, b.w, b.h, Math.round(b.hp), r100(b.ang || 0)]);
    snap.wir = st.wires.map((w: any) => [w.kind, w.x, w.y, w.w, w.h, Math.round(w.hp)]);
    snap.sc = st.scorches.map((c: any) => [Math.round(c.x), Math.round(c.y), r100(c.a), Math.round(c.t), c.life]);
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
      players: [...this.slots.values()]
        .map((s) => ({ name: s.name, kills: s.kills, deaths: s.deaths }))
        .sort((a, b) => b.kills - a.kills),
    };
  }
}

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
import { Structures, ACID } from '../../../js/build.js';
import { Robot } from '../../../js/robot.js';
import { bulletHit } from '../../../js/combat.js';
import { applyMove, packBody, IN_RELOAD, IN_FIRE, IN_RUN, TICK } from '../../../js/netcode.js';
import { TYPES, PICKS, PARTICLE_SKIP, SFX_SYNC, DECAL_SYNC } from '../../../js/coop.js';
import { GOLDEN, DROPS, WORLD_SIZE, WEAPON_ORDER, NET, WEAPONS, BOUNTY, SELL_RATE, SHOP, SHOP_ORDER, BUILD_ORDER, THROWABLES, ROBOT, ROCKET, MONEY_LOSS, ABILITY, CLASS_ORDER, xpForLevel } from '../../../js/config.js';
import { rollUpgrades, UPGRADES } from '../../../js/upgrades.js';
import { Abilities, isClass } from '../../../js/abilities.js';
import { rand, randInt, TAU } from '../../../js/util.js';
import type { Cmd, Act } from '../validate.ts';

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
export const STAT_KEYS = ['maxHp', 'armor', 'dmgMult', 'rateMult', 'maxStamina', 'staminaRegenMult', 'speedMult', 'ammoMult', 'pierce', 'reloadMult', 'cdMult'];

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
      p.cls = isClass(pl.cls) ? pl.cls : CLASS_ORDER[0];
      const idle: Cmd = { s: 0, mx: 0, my: 0, f: 0, a: p.angle, w: -1 };
      this.slots.set(pl.id, { id: pl.id, idx: pl.idx, name: pl.name, p, queue: [], last: idle, ack: 0, kills: 0, money: 0, deaths: 0, away: false, dropped: 0, starve: 0, toasts: [],
        level: 1, xp: 0, xpNeed: xpForLevel(1), pending: 0, taken: {}, choices: [], choiceN: 0,
        inv: Object.fromEntries(SHOP_ORDER.map((k: string) => [k, 0])), robot: new Robot(), acts: [], acidT: 0, acidTick: 0, lost: 0, stGeo: '', stSent: '', stN: 0 });
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
      rocketHit: (z: any, x: number, y: number, b: any) => {
        // en gordos y super blindados el cohete se clava; en el resto estalla al instante
        if ((z.type === 'fat' || z.type === 'heavy') && !z.dead) this.structures.stickRocket(g, z, x, y, b);
        else g.rocketBlast(x, y, b.owner);
      },
      rocketBlast: (x: number, y: number, owner: string | null = null) => this.structures.explode(g, { x, y, owner }, ROCKET.radius, ROCKET.power, 1),
      updateHud: noop,
      onSuperPunch: (_z: any, x: number, y: number) => {
        g.particles.dust(x, y, 18);
        g.camera.shake(0.35, x, y);
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
      packed = [{ type: z.type, si: z.si | 0, x: Math.round(z.x), y: Math.round(z.y), r: z.r, a: r100(z.angle) / 100, burnt: !!z.burnt }, args[1], args[2]];
    } else if ((tag === 'p' || tag === 'd' || tag === 't') && typeof args[0] === 'number' && typeof args[1] === 'number') {
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
    if (by) {
      by.kills++;
      by.money += BOUNTY[z.type as keyof typeof BOUNTY] || 0;
    }
    // la experiencia es del equipo (todos suben de nivel juntos)
    for (const s of this.slots.values()) this.addXp(s, z.def.xp);
    if (z.type === 'golden') {
      // recompensa única del zombi dorado para quien lo mató (como en solitario)
      if (by) {
        const reward = randInt(GOLDEN.rewardMin, GOLDEN.rewardMax);
        by.money += reward;
        by.toasts.push(`¡Zombi dorado! +$${reward}`);
      }
      g.particles.pickupFx(z.x, z.y, '#f0c040');
    }
    g.particles.death(z.x, z.y, z.r);
    // el gordo revienta en ácido
    if (z.type === 'fat') this.structures.queueDeathBlast(z.type, z.x, z.y);
    const r = Math.random();
    if (z.type === 'giant') {
      g.camera.shake(0.5, z.x, z.y);
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

  addXp(s: Slot, n: number) {
    s.xp += n;
    while (s.xp >= s.xpNeed) {
      s.xp -= s.xpNeed;
      s.level++;
      s.xpNeed = xpForLevel(s.level);
      s.pending++;
    }
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

  // Subirse o bajarse de su robot (las mismas reglas que en solitario).
  toggleRobot(s: Slot) {
    const rb = s.robot;
    const p = s.p;
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
    const rb = s.robot;
    this.game.sfx.blockHit('metal');
    if (!rb.damage(dmg)) return;
    this.structures.explode(this.game, { x: rb.x, y: rb.y }, 170, 450, 1);
    rb.leave(p, this.world);
    rb.hp = 0;
    s.toasts.push('¡Robot destruido! Repáralo en la tienda');
  }

  // Cada golpe de zombi cuesta dinero (como en solitario; dentro del robot, no).
  onZombieHit(p: any) {
    const s = this.slotOf(p);
    if (!s || p.inRobot || p.boostT > 0) return;
    const loss = Math.min(s.money, randInt(MONEY_LOSS.min, MONEY_LOSS.max));
    if (loss <= 0) return;
    s.money -= loss;
    s.lost += loss;
  }

  // Ácido del gordo: quema unos segundos (vida fija por segundo).
  applyAcid(p: any) {
    const s = this.slotOf(p);
    if (!s || !p.alive || p.inRobot || p.boostT > 0) return;
    if (!(s.acidT > 0)) s.acidTick = 0;
    s.acidT = ACID.burn;
  }

  updateAcid(s: Slot) {
    if (!(s.acidT > 0)) return;
    const p = s.p;
    s.acidTick += TICK;
    while (s.acidTick >= 1 && p.alive) {
      s.acidTick -= 1;
      p.hp -= ACID.dps;
      p.damageTaken += ACID.dps;
      p.hurtT = 0.2;
      this.game.particles.acidBurst(p.x, p.y, 18);
      if (p.hp <= 0) {
        p.hp = 0;
        p.alive = false;
        this.onPlayerDeath();
      }
    }
    s.acidT = p.alive ? Math.max(0, s.acidT - TICK) : 0;
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
    s.queue.length = 0;
    s.acts.length = 0;
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
        this.runActs(s);
      }
    }
    for (const s of live) {
      // el robot pilotado va donde va su piloto (pisadas, chispas si está dañado)
      s.robot.update(TICK, s.p, g);
      this.updateAcid(s);
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
      this.goldenT -= TICK;
      if (this.goldenT <= 0) {
        const alive = this.horde.list.some((z: any) => z.type === 'golden' && !z.dead);
        if (!alive && this.spawnGolden()) this.goldenT = rand(GOLDEN.every[0], GOLDEN.every[1]);
        else this.goldenT = 5;
      }
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

  spawnGolden() {
    const d = this.director;
    for (let i = 0; i < 20; i++) {
      const c = d.edgePoint(this.game, rand(60, 140));
      if (c.x < 80 || c.y < 80 || c.x > WORLD_SIZE - 80 || c.y > WORLD_SIZE - 80) continue;
      if (this.world.pointBlocked(c.x, c.y, 16) || !d.canReach(this.game, c.x, c.y) || d.seen(d.views(this.game), c.x, c.y, 16)) continue;
      this.horde.spawn('golden', c.x, c.y, 1, d.speedMult);
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
    // los zombis sólo dentro de lo que cabe en su pantalla, con margen (son lo que más pesa en la foto)
    const ZW = Math.max(NET.zombieView[0], (me.vw || 0) + 150);
    const ZH = Math.max(NET.zombieView[1], (me.vh || 0) + 150);
    const nearZ = (o: any) => (o.type === 'golden' || o.type === 'giant' ? near(o.x, o.y) : Math.abs(o.x - me.x) < ZW && Math.abs(o.y - me.y) < ZH);
    const ox = Math.round(me.x);
    const oy = Math.round(me.y);
    const z: number[] = [];
    const zx: number[] = [];
    // vida de los zombis heridos, en %, para su barra (sólo los que la muestran)
    const zh: number[] = [];
    for (const o of this.horde.list) {
      if (o.dead || !nearZ(o)) continue;
      const flags = (o.flash > 0 ? 1 : 0) | (o.burn > 0 ? 2 : 0) | (o.wounded ? 4 : 0) | (o.bs === 'windup' ? 8 : 0)
        | (o.hitT > 0 ? 16 : 0) | (o.type === 'golden' && o.life < GOLDEN.warnAt ? 32 : 0) | (o.lunge > 0.3 ? 64 : 0);
      z.push(o.id, TYPES.indexOf(o.type), Math.round(o.x - ox), Math.round(o.y - oy), Math.round((o.angle / TAU) * 64) & 63, flags);
      if (o.hp < o.maxHp && o.type !== 'normal' && o.type !== 'sprinter') zh.push(o.id, Math.max(0, Math.ceil((o.hp / o.maxHp) * 100)));
      if (o.air > 0 || o.swell > 0) zx.push(o.id, Math.round(o.air || 0), r100(o.swell || 0));
    }
    const pl: number[] = [];
    for (const q of this.slots.values()) {
      if (q === s) continue;
      const p = q.p;
      pl.push(q.idx, Math.round(p.x), Math.round(p.y), r100(p.angle), r100(p.legAngle), p.running ? 1 : 0, WEAPON_ORDER.indexOf(p.weapon.id),
        p.flashT > 0 ? 1 : 0, p.alive ? 1 : 0, p.hurtT > 0 ? 1 : 0, r100(p.recoil), Math.round(p.speedNow), Math.ceil(p.hp), q.away ? 1 : 0, p.inRobot ? 1 : 0,
        (p.rageT > 0 ? 1 : 0) | (p.boostT > 0 ? 2 : 0));
    }
    // robots de todos (el propio también): estacionados o con su piloto dentro
    const rb: number[] = [];
    for (const q of this.slots.values()) {
      const r = q.robot;
      if (r.owned && near(r.x, r.y)) rb.push(q.idx, Math.round(r.x), Math.round(r.y), r100(r.angle), r100(r.legAngle), r100(r.walk % TAU), Math.max(0, Math.round(r.hp)), r.piloted ? 1 : 0);
    }
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
      q: ++this.snapN, t: this.tick, ts: Math.round(now), ack: s.ack,
      me: packBody(me),
      st: [Math.ceil(me.hp), me.stats.maxHp, me.alive ? 1 : 0, me.wi, r100(Math.max(0, me.reloadT)), r100(me.reloadProg || 0), s.kills, s.money,
        Math.round(s.acidT * 10), me.inRobot ? 1 : 0],
      wp: me.weapons.map((w: any) => [w.id, w.mag, w.reserve === Infinity ? -1 : w.reserve]),
      o: [ox, oy], z, zx, zh, pl,
      pk: this.pickups.list.flatMap((it: any) => (near(it.x, it.y) ? [PICKS.indexOf(it.k), Math.round(it.x), Math.round(it.y), Math.round(it.t * 10)] : [])),
      b: this.bullets.list.flatMap((b: any) => (b.owner !== id && !b.turret && near(b.x, b.y) ? [Math.round(b.x), Math.round(b.y), r100(b.dx), r100(b.dy), b.rocket ? 1 : 0] : [])),
      w: d.wave, ds: d.state, tm: Math.round(this.time), kl: this.totalKills(), lft: d.queue.length + this.horde.list.length,
      ec: [s.level, Math.round(s.xp), s.xpNeed, s.pending],
      ps: STAT_KEYS.map((k) => Math.round(me.stats[k] * 1000) / 1000),
      iv: SHOP_ORDER.map((k: string) => s.inv[k]),
      rb,
      // granadas en el aire, fuego, cohetes clavados y explosiones (sólo lo cercano)
      gr: st.grenades.flatMap((q: any) => (near(q.x, q.y) ? [Math.round(q.x), Math.round(q.y), Math.round(q.h), r100(q.rot), q.kind === 'molotov' ? 1 : 0, q.t > q.dur ? 1 : 0] : [])),
      fi: st.fires.flatMap((f: any) => (near(f.x, f.y) ? [f.id, Math.round(f.x), Math.round(f.y), r100(f.t), r100(f.life)] : [])),
      so: st.stuck.flatMap((q: any) => (near(q.x, q.y) ? [Math.round(q.x), Math.round(q.y), r100(q.ang || 0), r100(q.t), r100(q.stick), r100(q.glow), q.kind === 'fat' ? 1 : 0] : [])),
      // misiles del Bomber (la mira en el suelo es grande: se mandan con margen)
      ms: st.missiles.flatMap((q: any) => (Math.abs(q.x - me.x) < V + ABILITY.bomber.radius && Math.abs(q.y - me.y) < V + ABILITY.bomber.radius ? [Math.round(q.x), Math.round(q.y), r100(q.t), r100(q.dur)] : [])),
      // habilidad propia: clase, espera (décimas) y megarráfaga en curso
      ab: [CLASS_ORDER.indexOf(me.cls), Math.ceil((me.abCd || 0) * 10), r100(me.rageT || 0)],
      bl: st.blasts.flatMap((q: any) => (near(q.x, q.y) ? [Math.round(q.x), Math.round(q.y), r100(q.t)] : [])),
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
    const geo = st.blocks.map((b: any) => `${b.kind}${b.x},${b.y},${b.w},${b.h}`).join() + '|' + st.wires.map((w: any) => `${w.kind}${w.x},${w.y},${w.w},${w.h}`).join()
      + '|' + st.scorches.length + (sc ? `,${Math.round(sc.x)},${Math.round(sc.y)}` : '');
    const full = geo + '|' + st.blocks.map((b: any) => Math.round(b.hp)).join() + '|' + st.wires.map((w: any) => Math.round(w.hp)).join();
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
      players: [...this.slots.values()].map((s) => ({ name: s.name, kills: s.kills, deaths: s.deaths })).sort((a, b) => b.kills - a.kills),
    };
  }
}

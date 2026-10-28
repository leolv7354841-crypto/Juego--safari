// Lo que ve un jugador que no simula el mundo: el invitado del cooperativo y el cliente en línea.
//
// Los dos reciben fotos con el mismo formato (js/net/snapshot.js) y las usan igual: los zombis, los demás
// jugadores y los robots se dibujan un poco en diferido, interpolando entre dos fotos (`Interp`), y los
// efectos que ocurrieron donde manda el mundo (partículas, sonidos, manchas) se repiten aquí. Las balas
// que se ven son de adorno: el daño lo calcula quien manda.
// `game.remote` es la única instancia; se dibuja desde js/render/remote.js.
import { NET, PLAYER_BASE, ROBOT, SHOP, WEAPON_ORDER, WEAPONS, ZOMBIES } from '../core/config.ts';
import { angleTo, rand, TAU } from '../core/util.ts';
import { turretBullet } from '../sim/build.ts';
import { Player } from '../sim/player.ts';
import { Robot } from '../sim/robot.ts';
import { lookFromCode, zombieSprites } from '../render/sprites.js';
import { Interp } from './netcode.ts';
import { DECAL_SYNC, PARTICLE_SKIP, PICKS, SFX_SYNC, TYPES } from './protocol.ts';
import type { WorldSnap, Zombie, ZombieDef } from '../core/types.d.ts';
import { PEER_N, ROBOT_N, ZOMBIE_N } from './snapshot.ts';

/** Nombre y aspecto de un jugador: `look` ya listo (cooperativo) o `code` (en línea, se convierte al cambiar). */
export type Identity = { name?: string; look?: unknown; code?: string };
export type Identify = (idx: number) => Identity | null;
/** Jugador remoto: un Player con lo que le añade este módulo. */
export type Peer = Player & { it?: Interp; away?: boolean; lookCode?: string; manned?: unknown };
/** Zombi remoto: lo que se dibuja a partir de la foto. */
export type RemoteZombie = Pick<
  Zombie,
  'id' | 'type' | 'def' | 'x' | 'y' | 'r' | 'mass' | 'angle' | 'si' | 'flash' | 'dead' | 'hitT' | 'hitJolt'
> & {
  it: Interp;
  spr: unknown;
  wounded?: boolean;
  hp?: number;
  maxHp?: number;
  burn: number;
  air: number;
  life: number;
  anim: number;
  lunge: number;
  tilt: number;
  swell: number;
  bs: string;
  wob: number;
  fireFx: number;
  spawnT: number;
};
type Row = [string, number, number, number, number, number, number];
/** Parte de una foto que usa applyStructures: las listas de barricadas y trampas llevan el tipo delante. */
type StructSnap = Partial<Omit<WorldSnap, 'blk' | 'wir' | 'sc'>> & { blk?: Row[]; wir?: Row[]; sc?: number[][] };
type ShopDef = { hp: number; ground?: boolean; consumable?: boolean };
const shopDef = (k: string): ShopDef | undefined => (SHOP as unknown as Record<string, ShopDef>)[k];

/** Índice de jugador en el cooperativo (en línea lo da el servidor): el anfitrión es 0 y el invitado 1. */
export const HOST_IDX = 0;
export const GUEST_IDX = 1;

/** Contador del indicador de conexión: fotos y fotogramas por segundo (una lectura cada segundo). */
export class NetStats {
  declare secs: number;
  declare frames: number;
  declare snaps: number;
  constructor() {
    this.secs = 0;
    this.frames = 0;
    this.snaps = 0;
  }

  /** Llegó una foto. */
  count() {
    this.snaps++;
  }

  /** Cada fotograma. Pasado un segundo devuelve {secs, fps, per} (fotos por segundo) y empieza de nuevo; si no, null. */
  tick(dt: number) {
    this.secs += dt;
    this.frames++;
    if (this.secs < 1) return null;
    const r = { secs: this.secs, fps: Math.round(this.frames / this.secs), per: Math.round(this.snaps / this.secs) };
    this.secs = 0;
    this.frames = 0;
    this.snaps = 0;
    return r;
  }
}

export class Remote {
  declare game: any;
  declare sprites: () => any;
  declare active: boolean;
  declare extrapolate: number;
  declare zs: Map<number, RemoteZombie>;
  declare peers: Map<number, Peer>;
  declare robots: Map<number, Robot>;
  declare fireMap: Map<number, any>;
  declare bullets: any[];
  declare blkGeo: string;
  declare danger: number;
  declare nearCount: number;
  declare net: NetStats;
  /**
   * @param {{ zombieSprites?: () => any }} [deps]  para probar sin lienzo
   */
  constructor(game: any, deps: { zombieSprites?: () => any } = {}) {
    this.game = game;
    this.sprites = deps.zombieSprites || zombieSprites;
    /** ¿Se está jugando como espectador del mundo de otro? (lo ponen coop.js y online.js) */
    this.active = false;
    this.extrapolate = NET.maxExtrapolate;
    this.zs = new Map();
    this.peers = new Map();
    this.robots = new Map();
    this.fireMap = new Map();
    this.bullets = [];
    this.blkGeo = '';
    this.danger = 0;
    this.nearCount = 0;
    this.net = new NetStats();
  }

  /** Empieza (o termina) una partida remota. extrapolate: ms que se adelanta algo sin foto nueva. */
  start(extrapolate = NET.maxExtrapolate) {
    this.reset();
    this.extrapolate = extrapolate;
    this.active = true;
  }

  stop() {
    this.reset();
    this.active = false;
  }

  reset() {
    this.zs.clear();
    this.peers.clear();
    this.robots.clear();
    this.fireMap.clear();
    this.bullets = [];
    this.blkGeo = '';
    this.danger = 0;
    this.nearCount = 0;
    this.net = new NetStats();
  }

  /**
   * Aplica la parte del mundo de una foto. t: instante de la foto en el reloj que luego se pasa a place*.
   * @param {any} s  foto (ver snapshot.js)
   *   myIdx: el robot de este jugador va en game.robot; identify: nombre y aspecto; collide: las barricadas también
   *   chocan en el mapa local (para predecir igual que el servidor).
   */
  applyWorld(
    s: any,
    t: number,
    opts: {
      myIdx?: number;
      identify?: Identify;
      collide?: boolean;
    } = {},
  ) {
    this.applyPeers(s.pl || [], t, opts.identify);
    this.applyRobots(s.rb || [], opts.myIdx ?? -1);
    this.applyZombies(s.z || [], s.o || [0, 0], s.zx || [], s.zh || [], t);
    this.applyPickups(s.pk || []);
    this.applyBullets(s.b || []);
    this.applyStructures(s, opts.collide !== false);
  }

  /* ---------- zombis ---------- */

  applyZombies(z: number[], org: number[], zx: number[], zh: number[], t: number) {
    const g = this.game;
    const seen = new Set<number>();
    const extra = new Map<number, [number, number]>();
    for (let i = 0; i + 2 < zx.length; i += 3) extra.set(zx[i], [zx[i + 1], zx[i + 2] / 100]);
    // vida en % de los heridos (la barra usa hp / maxHp)
    const life = new Map<number, number>();
    for (let i = 0; i + 1 < zh.length; i += 2) life.set(zh[i], zh[i + 1]);
    for (let i = 0; i + ZOMBIE_N - 1 < z.length; i += ZOMBIE_N) {
      const id = z[i];
      const x = org[0] + z[i + 2];
      const y = org[1] + z[i + 3];
      const ang = (z[i + 4] / 64) * TAU;
      seen.add(id);
      let o = this.zs.get(id);
      if (!o) {
        const type = (TYPES[z[i + 1]] || 'normal') as keyof typeof ZOMBIES;
        const def = ZOMBIES[type] as unknown as ZombieDef;
        const sets = this.sprites()[type];
        o = {
          id,
          type,
          def,
          r: def.radius,
          mass: def.mass,
          si: id % sets.length,
          spr: sets[id % sets.length] || sets[0],
          x,
          y,
          angle: ang,
          anim: 0,
          flash: 0,
          hitT: 0,
          hitJolt: 0,
          lunge: 0,
          spawnT: 0,
          tilt: 0,
          air: 0,
          swell: 0,
          burn: 0,
          bs: 'walk',
          life: 99,
          dead: false,
          wob: rand(0, 100),
          fireFx: 0,
          it: new Interp([2], 24, this.extrapolate),
        };
        this.zs.set(id, o);
      }
      o.it.push(t, [x, y, ang]);
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
      o.maxHp = 100;
      o.hp = life.get(id) ?? 100;
      const ex = extra.get(id);
      o.air = ex ? ex[0] : 0;
      o.swell = ex ? ex[1] : 0;
    }
    for (const [id, o] of this.zs) {
      if (seen.has(id)) continue;
      o.dead = true;
      this.zs.delete(id);
    }
    g.horde.list = Array.from(this.zs.values());
  }

  // Coloca a cada zombi donde estaba hace `delay` ms, con su animación, y arma la rejilla de choques.
  placeZombies(rt: number, dt: number, p: { x: number; y: number }) {
    const g = this.game;
    const grid = g.horde.grid;
    grid.clear();
    const out: number[] = [];
    let danger = 0;
    let nc = 0;
    for (const z of this.zs.values()) {
      if (!z.it.sample(rt, out)) continue;
      const ox = z.x;
      const oy = z.y;
      z.x = out[0];
      z.y = out[1];
      z.angle = angleTo(z.angle, out[2], dt * 12);
      z.anim += Math.hypot(z.x - ox, z.y - oy) / (z.r * 0.55);
      z.hitT -= dt;
      z.lunge = Math.max(0, z.lunge - dt * 4);
      z.tilt =
        (z.wounded ? Math.sin(g.time * 5 + z.wob) * 0.16 : 0) + (z.burn > 0 ? Math.sin(g.time * 23 + z.wob) * 0.28 : 0);
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
    this.danger = danger;
    this.nearCount = nc;
  }

  /* ---------- jugadores y robots ---------- */

  /**
   * Los demás jugadores. identify(idx) da su nombre y su aspecto: `look` ya listo (cooperativo) o `code`
   * (en línea, se convierte al cambiar).
   */
  applyPeers(pl: number[], t: number, identify?: Identify) {
    const seen = new Set<number>();
    for (let i = 0; i + PEER_N - 1 < pl.length; i += PEER_N) {
      const idx = pl[i];
      seen.add(idx);
      let q = this.peers.get(idx);
      if (!q) {
        q = new Player(pl[i + 1], pl[i + 2]) as Peer;
        q.puppet = true;
        this.peers.set(idx, q);
      }
      if (!q.it) q.it = new Interp([2, 3], 24, this.extrapolate);
      const who = identify ? identify(idx) : null;
      q.name = (who && who.name) || q.name || 'Jugador';
      if (who && who.look) q.look = who.look;
      else if (who && who.code !== undefined && q.lookCode !== who.code) {
        q.lookCode = who.code;
        q.look = lookFromCode(who.code);
      }
      q.it.push(t, [pl[i + 1], pl[i + 2], pl[i + 3] / 100, pl[i + 4] / 100]);
      q.running = !!pl[i + 5];
      const wid = WEAPON_ORDER[pl[i + 6]];
      if (wid && wid in WEAPONS && (!q.weapons[0] || q.weapons[0].id !== wid)) {
        q.weapons = [q.makeWeapon(wid)];
        q.wi = 0;
      }
      if (q.weapons[0]) {
        q.weapon.mag = pl[i + 16] | 0;
        q.reloadT = (Number(pl[i + 17]) || 0) / 100;
        q.reloadProg = (Number(pl[i + 18]) || 0) / 100;
      }
      if (pl[i + 7]) q.flashT = 0.05;
      q.alive = !!pl[i + 8];
      if (pl[i + 9]) q.hurtT = 0.2;
      q.recoil = Math.max(q.recoil, pl[i + 10] / 100);
      q.speedNow = pl[i + 11];
      q.hp = pl[i + 12];
      q.away = !!pl[i + 13];
      q.idx = idx;
      q.inRobot = !!pl[i + 14];
      q.r = q.inRobot ? ROBOT.radius : PLAYER_BASE.radius;
      // habilidad en curso (sólo para dibujarla): 1 megarráfaga, 2 impulso
      q.rageT = pl[i + 15] & 1 ? 1 : 0;
      q.boostT = pl[i + 15] & 2 ? 1 : 0;
    }
    for (const idx of this.peers.keys()) if (!seen.has(idx)) this.peers.delete(idx);
  }

  // Los jugadores simulados aquí (el compañero del anfitrión) no tienen `it`: su movimiento lo lleva coop.js.
  placePeers(rt: number, dt: number) {
    const out: number[] = [];
    for (const q of this.peers.values()) {
      if (!q.it || !q.it.sample(rt, out)) continue;
      const ox = q.x;
      const oy = q.y;
      q.x = out[0];
      q.y = out[1];
      q.angle = out[2];
      q.legAngle = out[3];
      q.walkPhase += Math.hypot(q.x - ox, q.y - oy) * 0.11;
      q.flashT -= dt;
      q.hurtT -= dt;
      q.recoil = Math.max(0, q.recoil - dt * 8);
      if (q.inRobot && q.idx !== undefined) this.followRobot(this.robots.get(q.idx), q, dt);
    }
  }

  // El robot pilotado va donde va su piloto (el propio, con la posición predicha).
  followRobot(rb: Robot | undefined, p: Player, dt: number) {
    if (!rb) return;
    rb.hitT -= dt;
    if (!rb.owned || !rb.piloted || !p.inRobot) return;
    const moved = Math.hypot(p.x - rb.x, p.y - rb.y);
    rb.x = p.x;
    rb.y = p.y;
    rb.angle = p.angle;
    if (moved > 0.2) rb.legAngle = angleTo(rb.legAngle, p.legAngle, dt * 6);
    rb.walk += Math.min(moved, 20) * 0.045;
  }

  // Robots: el propio (idx = myIdx) en game.robot (tienda, barra de vida, dibujo) y los de los demás aparte.
  applyRobots(rb: number[], myIdx: number) {
    const g = this.game;
    const seen = new Set<number>();
    for (let i = 0; i + ROBOT_N - 1 < rb.length; i += ROBOT_N) {
      const idx = rb[i];
      let r = g.robot;
      if (idx !== myIdx) {
        seen.add(idx);
        r = this.robots.get(idx);
        if (!r) {
          r = new Robot();
          this.robots.set(idx, r);
        }
      }
      const piloted = !!rb[i + 7];
      // pilotado, sigue a su piloto en cada fotograma (ver followRobot)
      if (!piloted || !r.piloted || !r.owned) {
        r.x = rb[i + 1];
        r.y = rb[i + 2];
        r.angle = rb[i + 3] / 100;
        r.legAngle = rb[i + 4] / 100;
        r.walk = rb[i + 5] / 100;
      }
      if (r.owned && rb[i + 6] < r.hp) r.hitT = 0.2;
      r.owned = true;
      r.hp = rb[i + 6];
      r.piloted = piloted;
    }
    // el propio sólo llega si está cerca: lejos se conserva lo último que se vio
    for (const idx of this.robots.keys()) if (!seen.has(idx)) this.robots.delete(idx);
  }

  /* ---------- objetos, balas y estructuras ---------- */

  applyPickups(pk: number[]) {
    const g = this.game;
    g.pickups.list = [];
    for (let i = 0; i + 3 < pk.length; i += 4)
      g.pickups.list.push({ k: PICKS[pk[i]] || 'ammo', x: pk[i + 1], y: pk[i + 2], t: pk[i + 3] / 10, taken: true });
  }

  applyBullets(b: number[]) {
    this.bullets = [];
    for (let i = 0; i + 4 < b.length; i += 5)
      this.bullets.push({
        x: b[i],
        y: b[i + 1],
        dx: b[i + 2] / 100,
        dy: b[i + 3] / 100,
        rocket: !!b[i + 4],
        trail: 22,
        age: 0,
      });
  }

  // Granadas en el aire, fuego, cohetes clavados, explosiones; barricadas y trampas cuando cambian.
  applyStructures(s: StructSnap, collide = true) {
    const g = this.game;
    const st = g.structures;
    const gr = Array.isArray(s.gr) ? s.gr : [];
    st.grenades = [];
    for (let i = 0; i + 5 < gr.length; i += 6)
      st.grenades.push({
        x: gr[i],
        y: gr[i + 1],
        h: gr[i + 2],
        rot: gr[i + 3] / 100,
        kind: gr[i + 4] ? 'molotov' : 'grenade',
        t: gr[i + 5] ? 2 : 0,
        dur: 1,
      });
    const fi = Array.isArray(s.fi) ? s.fi : [];
    const fires = [];
    for (let i = 0; i + 4 < fi.length; i += 5) {
      let f = this.fireMap.get(fi[i]);
      if (!f) {
        f = { id: fi[i], x: fi[i + 1], y: fi[i + 2], r: 82, tick: 0, flames: [] };
        for (let k = 0; k < 16; k++) {
          const a = rand(0, TAU);
          const dd = Math.sqrt(Math.random()) * f.r * 0.85;
          f.flames.push({
            x: f.x + Math.cos(a) * dd,
            y: f.y + Math.sin(a) * dd * 0.85,
            s: rand(0.7, 1.25),
            ph: rand(0, 10),
          });
        }
        this.fireMap.set(f.id, f);
      }
      f.t = fi[i + 3] / 100;
      f.life = fi[i + 4] / 100;
      fires.push(f);
    }
    for (const id of this.fireMap.keys()) if (!fires.some((f) => f.id === id)) this.fireMap.delete(id);
    st.fires = fires;
    const so = Array.isArray(s.so) ? s.so : [];
    st.stuck = [];
    for (let i = 0; i + 6 < so.length; i += 7)
      st.stuck.push({
        x: so[i],
        y: so[i + 1],
        ang: so[i + 2] / 100,
        t: so[i + 3] / 100,
        stick: so[i + 4] / 100,
        glow: so[i + 5] / 100,
        kind: so[i + 6] ? 'fat' : 'heavy',
      });
    const ms = Array.isArray(s.ms) ? s.ms : [];
    st.missiles = [];
    for (let i = 0; i + 3 < ms.length; i += 4)
      st.missiles.push({ x: ms[i], y: ms[i + 1], t: ms[i + 2] / 100, dur: ms[i + 3] / 100 });
    const bl = Array.isArray(s.bl) ? s.bl : [];
    st.blasts = [];
    for (let i = 0; i + 2 < bl.length; i += 3) st.blasts.push({ x: bl[i], y: bl[i + 1], t: bl[i + 2] / 100 });
    if (Array.isArray(s.blk)) {
      const list = s.blk.filter((q) => {
        const d = Array.isArray(q) && shopDef(q[0]);
        return d && !d.ground && !d.consumable;
      });
      const geo = list.map((q) => q.slice(0, 5).join()).join('|');
      if (geo !== this.blkGeo) {
        // se puso o se rompió alguna: con collide, el mapa local también choca con ellas (para predecir igual)
        this.blkGeo = geo;
        if (collide) for (const b of st.blocks) g.world.removeDynamic(b);
        st.blocks = list.map((q) => ({
          k: 0,
          kind: q[0],
          x: q[1],
          y: q[2],
          w: q[3],
          h: q[4],
          hp: q[5],
          max: shopDef(q[0])?.hp ?? 0,
          ang: q[6] / 100,
          low: true,
          block: true,
          hitT: 0,
          cd: 0,
        }));
        if (collide) for (const b of st.blocks) g.world.addDynamic(b);
        st.relayer();
      } else {
        list.forEach((q, i) => {
          const b = st.blocks[i];
          if (q[5] < b.hp) b.hitT = 0.12;
          b.hp = q[5];
          // el cañón de la torreta pesada propia gira con la predicción, no con la foto
          if (b.manned !== g.player) b.ang = q[6] / 100;
        });
      }
    }
    if (Array.isArray(s.wir))
      st.wires = s.wir
        .filter((q) => Array.isArray(q) && shopDef(q[0])?.ground)
        .map((q) => ({
          kind: q[0],
          x: q[1],
          y: q[2],
          w: q[3],
          h: q[4],
          hp: q[5],
          max: shopDef(q[0])?.hp ?? 0,
          hitT: 0,
        }));
    if (Array.isArray(s.sc))
      st.scorches = s.sc.filter(Array.isArray).map((q) => ({ x: q[0], y: q[1], a: q[2] / 100, t: q[3], life: q[4] }));
  }

  /* ---------- cada fotograma ---------- */

  // Las balas de adorno vuelan, y avanzan los relojes de lo que se dibuja (fuego, misiles, explosiones, golpes).
  advance(dt: number) {
    const g = this.game;
    for (const b of this.bullets) {
      b.x += b.dx * (b.rocket ? 640 : 1000) * dt;
      b.y += b.dy * (b.rocket ? 640 : 1000) * dt;
      b.age += dt;
      if (b.rocket) g.particles.rocketTrail(b.x, b.y, b.dx, b.dy);
    }
    g.bullets.update(dt, g);
    const st = g.structures;
    st.time = g.time;
    for (const f of st.fires) f.t += dt;
    for (const m of st.missiles) m.t = Math.min(m.dur, m.t + dt);
    for (const q of st.blasts) q.t -= dt;
    for (const q of st.scorches) q.t += dt;
    for (const b of st.blocks) {
      b.hitT -= dt;
      if (b.flash) b.flash = Math.max(0, b.flash - dt);
      // torreta pesada de otro: el cañón se acerca al ángulo de la última foto
      if (b.manned && b.manned !== g.player && b.ta !== undefined) {
        b.ang = angleTo(b.ang, b.ta, dt * 12);
        b.recoil = Math.max(0, (b.recoil || 0) - dt * 10);
      }
    }
    for (const w of st.wires) w.hitT -= dt;
    g.particles.update(dt);
    g.decals.update(dt);
    g.emitFires(dt);
  }

  // Gemidos y pasos según los zombis cercanos, y la música según el peligro.
  ambience(dt: number, p: { alive: boolean }) {
    const g = this.game;
    const nc = this.nearCount;
    if (g.horde.list.length && Math.random() < dt * (0.35 + Math.min(1.5, nc * 0.05)))
      g.sfx.groan(Math.min(3, 0.5 + nc / 10));
    g.stepT -= dt;
    if (nc > 0 && g.stepT <= 0) {
      g.sfx.footstep(Math.min(1, nc / 20));
      g.stepT = Math.max(0.12, 0.7 - nc * 0.03) * rand(0.7, 1.3);
    }
    g.music.setDanger(p.alive ? this.danger : 0, dt);
  }

  /* ---------- efectos ---------- */

  // Repite un efecto que ocurrió donde manda el mundo (partículas, sonidos, manchas, sacudidas).
  replay(e: unknown) {
    const g = this.game;
    if (!Array.isArray(e)) return;
    const [tag, n, args] = e;
    if (!Array.isArray(args)) return;
    try {
      if (tag === 'p' && typeof g.particles[n] === 'function' && !PARTICLE_SKIP.has(n)) g.particles[n](...args);
      else if (tag === 't' && n === 'shot') this.turretShot(Number(args[0]), Number(args[1]), Number(args[2]));
      else if (tag === 's' && SFX_SYNC.includes(n)) g.sfx[n](...args);
      else if (tag === 'c' && n === 'shake')
        g.camera.shake(Math.min(1, Number(args[0]) || 0), Number(args[1]), Number(args[2]));
      else if (tag === 'g' && n === 'banner') g.banner(String(args[0] || ''), String(args[1] || ''));
      else if (tag === 'd' && DECAL_SYNC.includes(n)) {
        if (n === 'corpse') {
          const c = args[0] || {};
          const sets = this.sprites()[c.type];
          if (!sets) return;
          g.decals.corpse(
            { type: c.type, spr: sets[c.si] || sets[0], x: c.x, y: c.y, r: c.r, angle: c.a, burnt: c.burnt },
            args[1],
            args[2],
          );
        } else g.decals[n](...args);
      }
    } catch {
      /* efecto con datos raros: se ignora */
    }
  }

  // Disparo de una torreta: bala de adorno local (choca con los zombis y paredes que se ven) y
  // el cañón gira hacia donde disparó, con su fogonazo.
  turretShot(x: number, y: number, a: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(a)) return;
    const g = this.game;
    g.bullets.spawn(turretBullet(x, y, a));
    const cx = x - Math.cos(a) * 20;
    const cy = y - Math.sin(a) * 20;
    for (const b of g.structures.blocks) {
      if (b.kind !== 'turret' || Math.abs(b.x + b.w / 2 - cx) > 4 || Math.abs(b.y + b.h / 2 - cy) > 4) continue;
      b.ang = a;
      b.flash = 0.05;
    }
  }
}

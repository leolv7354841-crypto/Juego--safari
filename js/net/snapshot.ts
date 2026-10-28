// Foto del mundo: el único formato con el que el anfitrión del cooperativo (coop.js) y el servidor en línea
// (server/src/sim/ServerSim.ts) le cuentan a un jugador lo que ve. Lo decodifica js/net/remote.js.
//
// Una foto = parte del mundo (esta, igual en los dos modos) + parte propia del modo:
//   cooperativo  q, ts, o, z, zx, zh, pl, rb, pk, b, gr, fi, so, ms, bl, w, ds, tm  + lv, xp, xn (equipo), kl, blk, wir, sc
//   en línea     lo mismo + ack, me, st, wp, ec, ps, iv, ab, hv, up, fx, tt, dg, kl, ml, lft, blk, wir, sc (cada jugador)
// Todo son listas planas de números (poco peso); las posiciones de los zombis van relativas a `o`.
// El contrato de tipos está en js/core/types.d.ts (WorldSnap). No importa nada del navegador.
import { ABILITY, GOLDEN, NET, WEAPON_ORDER } from '../core/config.ts';
import { TAU } from '../core/util.ts';
import { PICKS, TYPES } from './protocol.ts';

/** Números por zombi en `z`: id, tipo, dx, dy, ángulo (64 pasos), banderas. */
export const ZOMBIE_N = 6;
/** Números por jugador en `pl`: ver encodePlayers. */
export const PEER_N = 19;
/** Números por robot en `rb`: idx, x, y, ángulo, piernas, paso, vida, pilotado. */
export const ROBOT_N = 8;

/** Claves de la parte del mundo (encodeWorld): están en toda foto, del cooperativo o del servidor. */
export const WORLD_KEYS = ['o', 'z', 'zx', 'zh', 'pl', 'rb', 'pk', 'b', 'gr', 'fi', 'so', 'ms', 'bl', 'w', 'ds', 'tm'];

const r100 = (v) => Math.round(v * 100);

/** A quién se le manda la foto. */
export type Viewer = { x: number; y: number; vw?: number; vh?: number };
/** Un jugador que ve el espectador. */
export type PeerEntry = { idx: number; p: any; away?: boolean };
export type RobotEntry = { idx: number; r: any };

/** Zombis cercanos a la pantalla del espectador: z, zx (en el aire / hinchados), zh (vida de los heridos, en %). */
export function encodeZombies(list, viewer) {
  const near = (x, y) => Math.abs(x - viewer.x) < NET.view && Math.abs(y - viewer.y) < NET.view;
  // los zombis sólo dentro de lo que cabe en su pantalla, con margen (son lo que más pesa en la foto)
  const ZW = Math.max(NET.zombieView[0], (viewer.vw || 0) + 150);
  const ZH = Math.max(NET.zombieView[1], (viewer.vh || 0) + 150);
  const nearZ = (o) =>
    o.type === 'golden' || o.type === 'giant'
      ? near(o.x, o.y)
      : Math.abs(o.x - viewer.x) < ZW && Math.abs(o.y - viewer.y) < ZH;
  const ox = Math.round(viewer.x);
  const oy = Math.round(viewer.y);
  const z = [];
  const zx = [];
  const zh = [];
  for (const o of list) {
    if (o.dead || !nearZ(o)) continue;
    const flags =
      (o.flash > 0 ? 1 : 0) |
      (o.burn > 0 ? 2 : 0) |
      (o.wounded ? 4 : 0) |
      (o.bs === 'windup' ? 8 : 0) |
      (o.hitT > 0 ? 16 : 0) |
      (o.type === 'golden' && o.life < GOLDEN.warnAt ? 32 : 0) |
      (o.lunge > 0.3 ? 64 : 0);
    z.push(
      o.id,
      TYPES.indexOf(o.type),
      Math.round(o.x - ox),
      Math.round(o.y - oy),
      Math.round((o.angle / TAU) * 64) & 63,
      flags,
    );
    // vida de los heridos para su barra (sólo los tipos que la muestran)
    if (o.hp < o.maxHp && o.type !== 'normal' && o.type !== 'sprinter')
      zh.push(o.id, Math.max(0, Math.ceil((o.hp / o.maxHp) * 100)));
    if (o.air > 0 || o.swell > 0) zx.push(o.id, Math.round(o.air || 0), r100(o.swell || 0));
  }
  return { o: [ox, oy], z, zx, zh };
}

/** Los demás jugadores: idx, x, y, mira, piernas, corre, arma, fogonazo, vivo, golpe, retroceso, velocidad, vida, ausente, en robot, habilidad, cargador, recarga. */
export function encodePlayers(entries) {
  const pl = [];
  for (const { idx, p, away } of entries) {
    pl.push(
      idx,
      Math.round(p.x),
      Math.round(p.y),
      r100(p.angle),
      r100(p.legAngle),
      p.running ? 1 : 0,
      WEAPON_ORDER.indexOf(p.weapon.id),
      p.flashT > 0 ? 1 : 0,
      p.alive ? 1 : 0,
      p.hurtT > 0 ? 1 : 0,
      r100(p.recoil),
      Math.round(p.speedNow),
      Math.ceil(p.hp),
      away ? 1 : 0,
      p.inRobot ? 1 : 0,
      (p.rageT > 0 ? 1 : 0) | (p.boostT > 0 ? 2 : 0),
      p.weapon.mag | 0,
      r100(Math.max(0, p.reloadT)),
      r100(p.reloadProg || 0),
    );
  }
  return pl;
}

/** Robots de todos (el del espectador también): estacionados o con su piloto dentro. */
export function encodeRobots(entries, viewer) {
  const near = (x, y) => Math.abs(x - viewer.x) < NET.view && Math.abs(y - viewer.y) < NET.view;
  const rb = [];
  for (const { idx, r } of entries) {
    if (!r.owned || !near(r.x, r.y)) continue;
    rb.push(
      idx,
      Math.round(r.x),
      Math.round(r.y),
      r100(r.angle),
      r100(r.legAngle),
      r100(r.walk % TAU),
      Math.max(0, Math.round(r.hp)),
      r.piloted ? 1 : 0,
    );
  }
  return rb;
}

/** Objetos, balas ajenas, granadas, fuego, cohetes clavados, misiles y explosiones cercanos. */
export function encodeScene(src, viewer, skipBullet) {
  const V = NET.view;
  const near = (x, y) => Math.abs(x - viewer.x) < V && Math.abs(y - viewer.y) < V;
  const st = src.structures;
  const M = V + ABILITY.bomber.radius;
  return {
    pk: src.pickups.list.flatMap((it) =>
      near(it.x, it.y) ? [PICKS.indexOf(it.k), Math.round(it.x), Math.round(it.y), Math.round(it.t * 10)] : [],
    ),
    b: src.bullets.list.flatMap((b) =>
      !skipBullet(b) && near(b.x, b.y)
        ? [Math.round(b.x), Math.round(b.y), r100(b.dx), r100(b.dy), b.rocket ? 1 : 0]
        : [],
    ),
    gr: st.grenades.flatMap((q) =>
      near(q.x, q.y)
        ? [
            Math.round(q.x),
            Math.round(q.y),
            Math.round(q.h),
            r100(q.rot),
            q.kind === 'molotov' ? 1 : 0,
            q.t > q.dur ? 1 : 0,
          ]
        : [],
    ),
    fi: st.fires.flatMap((f) =>
      near(f.x, f.y) ? [f.id, Math.round(f.x), Math.round(f.y), r100(f.t), r100(f.life)] : [],
    ),
    so: st.stuck.flatMap((q) =>
      near(q.x, q.y)
        ? [
            Math.round(q.x),
            Math.round(q.y),
            r100(q.ang || 0),
            r100(q.t),
            r100(q.stick),
            r100(q.glow),
            q.kind === 'fat' ? 1 : 0,
          ]
        : [],
    ),
    // misiles del Bomber (la mira en el suelo es grande: se mandan con margen)
    ms: st.missiles.flatMap((q) =>
      Math.abs(q.x - viewer.x) < M && Math.abs(q.y - viewer.y) < M
        ? [Math.round(q.x), Math.round(q.y), r100(q.t), r100(q.dur)]
        : [],
    ),
    bl: st.blasts.flatMap((q) => (near(q.x, q.y) ? [Math.round(q.x), Math.round(q.y), r100(q.t)] : [])),
  };
}

/**
 * La parte del mundo de una foto (todo menos lo propio de cada modo).
 * @param {{ horde: any, pickups: any, bullets: any, structures: any, director: any, time: number }} src
 * @param {Viewer} viewer
 * @param {{ players?: PeerEntry[], robots?: RobotEntry[], skipBullet?: (b: any) => boolean }} [opts]
 */
export function encodeWorld(
  src: { horde: any; pickups: any; bullets: any; structures: any; director: any; time: number },
  viewer: Viewer,
  opts: { players?: PeerEntry[]; robots?: RobotEntry[]; skipBullet?: (b: any) => boolean } = {},
) {
  const d = src.director;
  return {
    ...encodeZombies(src.horde.list, viewer),
    pl: encodePlayers(opts.players || []),
    rb: encodeRobots(opts.robots || [], viewer),
    ...encodeScene(src, viewer, opts.skipBullet || (() => false)),
    w: d.wave,
    ds: d.state,
    tm: Math.round(src.time),
  };
}

/** Barricadas, trampas y quemaduras del suelo (son de todo el mapa: se mandan cuando cambian o cada cierto tiempo). */
export function encodeStatic(st) {
  return {
    blk: st.blocks.map((b) => [b.kind, b.x, b.y, b.w, b.h, Math.round(b.hp), r100(b.ang || 0)]),
    wir: st.wires.map((w) => [w.kind, w.x, w.y, w.w, w.h, Math.round(w.hp)]),
    sc: st.scorches.map((c) => [Math.round(c.x), Math.round(c.y), r100(c.a), Math.round(c.t), c.life]),
  };
}

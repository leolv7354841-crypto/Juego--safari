// Spike: mismos zombis, mismos instantes, dos formas de mandarlos a 4 jugadores (20 fotos/s):
//   A) arreglos z/zx/zh de la foto (msgpack, como hoy)   B) Schema (MapSchema + StateView por jugador, deltas).
// Mide bytes por jugador y por segundo y el tiempo de CPU de codificar (sin red).   node tools/bench-zombies.ts [segundos]
import { pack } from 'msgpackr';
import { Encoder, StateView, schema, t } from '@colyseus/schema';
import { ServerSim } from '../src/sim/ServerSim.ts';
import { encodeZombies, zombieFlags, zombieNear } from '../../js/net/snapshot.ts';
import { TYPES } from '../../js/net/protocol.ts';
import { IN_FIRE, IN_RUN } from '../../js/net/protocol.ts';
import { TAU } from '../../js/core/util.ts';

const SECS = Number(process.argv[2] || 60);
// XY=int32 (por defecto) o XY=int16 (cabe mientras el mapa no pase de ±32767 px)
const xy = process.env.XY === 'int16' ? () => t.int16() : () => t.int32();
const Z = schema(
  { t: t.uint8(), x: xy(), y: xy(), a: t.uint8(), fl: t.uint8(), hp: t.uint8(), air: t.uint16(), sw: t.uint16() },
  'Z',
);
const Root = schema({ zombies: t.map(Z).view() }, 'Root');
const ids = ['a', 'b', 'c', 'd'];
const sim = new ServerSim(
  7,
  ids.map((id, i) => ({ id, idx: i + 1, name: id })),
);
const state = new Root();
const encoder = new Encoder(state);
const views = ids.map(() => new StateView());
const seen = ids.map(() => new Set<string>());
let bytesA = 0;
let bytesB = 0;
let msA = 0;
let msB = 0;
let snaps = 0;
let inView = 0;
let seq = 0;
let maxXY = 0;
sim.nextRound();
for (let tick = 1; tick <= SECS * 60; tick++) {
  seq++;
  ids.forEach((id, i) => {
    const p = sim.slots.get(id)!.p;
    const z = sim.horde.findTarget(p.x, p.y, 600, null);
    const a = z ? Math.atan2(z.y - p.y, z.x - p.x) : 0;
    const w = tick / 90 + i;
    sim.push(id, [{ s: seq, mx: Math.cos(w), my: Math.sin(w), f: IN_FIRE | (tick % 240 < 60 ? IN_RUN : 0), a, w: -1 }]);
  });
  sim.step();
  if (tick % 3) continue;
  snaps++;
  // A) lo de hoy
  let t0 = performance.now();
  for (const id of ids) {
    const p = sim.slots.get(id)!.p;
    const e = encodeZombies(sim.horde.list, { x: p.x, y: p.y, vw: p.vw, vh: p.vh });
    bytesA += pack({ o: e.o, z: e.z, zx: e.zx, zh: e.zh }).length;
    inView += e.z.length / 6;
  }
  msA += performance.now() - t0;
  // B) Schema con vistas
  t0 = performance.now();
  const map = state.zombies;
  const live = new Set<string>();
  for (const z of sim.horde.list) {
    if (z.dead) continue;
    const key = String(z.id);
    live.add(key);
    let e = map.get(key);
    if (!e) map.set(key, (e = new Z()));
    e.t = TYPES.indexOf(z.type);
    e.x = Math.round(z.x);
    maxXY = Math.max(maxXY, Math.abs(z.x), Math.abs(z.y));
    e.y = Math.round(z.y);
    e.a = Math.round((z.angle / TAU) * 64) & 63;
    e.fl = zombieFlags(z);
    e.hp =
      z.hp < z.maxHp && z.type !== 'normal' && z.type !== 'sprinter'
        ? Math.max(1, Math.ceil((z.hp / z.maxHp) * 100))
        : 0;
    e.air = Math.round(z.air || 0);
    e.sw = Math.round((z.swell || 0) * 100);
  }
  const gone: string[] = [];
  map.forEach((_e, k) => {
    if (!live.has(k)) gone.push(k);
  });
  for (const k of gone) map.delete(k);
  ids.forEach((id, i) => {
    const p = sim.slots.get(id)!.p;
    const near = zombieNear({ x: p.x, y: p.y, vw: p.vw, vh: p.vh });
    const want = new Set<string>();
    for (const z of sim.horde.list) {
      if (z.dead || !near(z)) continue;
      const k = String(z.id);
      want.add(k);
      if (!seen[i].has(k)) {
        views[i].add(map.get(k)!);
        seen[i].add(k);
      }
    }
    for (const k of [...seen[i]])
      if (!want.has(k)) {
        const e = map.get(k);
        if (e) views[i].remove(e);
        seen[i].delete(k);
      }
  });
  const it = { offset: 1 };
  encoder.sharedBuffer[0] = 0;
  encoder.encode(it);
  const shared = it.offset;
  for (const v of views) bytesB += encoder.encodeView(v, shared, it).length;
  encoder.discardChanges();
  msB += performance.now() - t0;
}
const per = (b: number) => (b / SECS / ids.length / 1024).toFixed(2);
console.log(
  `${SECS} s, ${snaps} fotos, zombis en vista por jugador (media): ${(inView / snaps / ids.length).toFixed(1)}, vivos al final: ${sim.horde.list.length}`,
);
console.log(`|coordenada| máxima vista: ${Math.round(maxXY)}`);
console.log(
  `A) arreglos z/zx/zh + msgpack : ${per(bytesA)} KB/s por jugador · ${((msA / snaps) * 1000).toFixed(0)} µs por foto (4 jugadores)`,
);
console.log(
  `B) Schema + StateView por jugador: ${per(bytesB)} KB/s por jugador · ${((msB / snaps) * 1000).toFixed(0)} µs por foto (4 jugadores)`,
);

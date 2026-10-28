// Pruebas de la predicción con reconciliación y de la interpolación (js/net/netcode.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/sim/world.ts';
import { Player } from '../../js/sim/player.ts';
import { Interp, applyMove, BODY } from '../../js/net/netcode.ts';
import { IN_RUN } from '../../js/net/protocol.ts';
import { NET } from '../../js/core/config.ts';

const world = new World(777);
const quiet = { world, sfx: new Proxy({}, { get: () => () => {} }) };

function cmds(n: number) {
  const out: any[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.sin(i / 17) * 3;
    out.push({ mx: Math.cos(a), my: Math.sin(a), f: i % 90 < 40 ? IN_RUN : 0, a, w: -1 });
  }
  return out;
}

// La predicción del SDK (predict.reconciler) repite las entradas con Player.move: tiene que dar exactamente
// el mismo cuerpo que el servidor con las mismas entradas (float32, paso fijo) o cada ack provocaría una corrección.
test('Player.move con las mismas entradas da el mismo cuerpo en cliente y servidor', () => {
  const s = world.spawn;
  const client = new Player(s.x, s.y);
  const server = new Player(s.x, s.y);
  for (const c of cmds(600)) {
    const cmd = { s: 0, mx: Math.fround(c.mx), my: Math.fround(c.my), f: c.f, a: Math.fround(c.a), w: c.w };
    applyMove(client, cmd, quiet);
    applyMove(server, { ...cmd }, quiet);
  }
  for (const k of BODY) assert.equal(client[k], server[k], k);
  assert.equal(client.exhausted, server.exhausted);
});

test('interpolación: entre fotos, sin retroceder y con extrapolación limitada', () => {
  const it = new Interp([2]);
  assert.ok(it.push(1000, [0, 0, 0]));
  assert.ok(it.push(1050, [10, 20, Math.PI - 0.1]));
  assert.equal(it.push(1020, [99, 99, 0]), false, 'foto vieja descartada');
  const out: number[] = [];
  it.sample(1025, out);
  assert.equal(out[0], 5);
  assert.equal(out[1], 10);
  it.push(1100, [20, 40, -Math.PI + 0.1]);
  it.sample(1075, out);
  // el ángulo pasa por el camino corto (cerca de ±π, no por 0)
  assert.ok(Math.abs(Math.abs(out[2]) - Math.PI) < 0.11, `ángulo ${out[2]}`);
  it.sample(5000, out);
  const maxX = 20 + (10 * NET.maxExtrapolate) / 50;
  assert.ok(out[0] <= maxX + 1e-9, `extrapolación limitada (${out[0]} <= ${maxX})`);
});

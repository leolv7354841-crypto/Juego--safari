import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NET } from '../js/config.js';
import { applyMove, Predictor, packBody, TICK, unpackBody } from '../js/netcode.js';
import { IN_RUN } from '../js/net/protocol.js';
import { Player } from '../js/player.js';
import { World } from '../js/world.js';
import { silent } from './helpers.js';

const world = new World(777);
const quiet = { world, sfx: silent };
const BODY = ['x', 'y', 'vx', 'vy', 'kx', 'ky', 'stamina', 'sinceRun', 'legAngle'];

test('packBody/unpackBody van y vuelven sin perder nada', () => {
  const p = new Player(world.spawn.x, world.spawn.y);
  for (let i = 0; i < 90; i++) applyMove(p, { mx: 1, my: 0.3, f: IN_RUN }, quiet);
  const packed = packBody(p);
  assert.ok(Array.isArray(packed));
  const q = new Player(0, 0);
  assert.equal(unpackBody(q, packed), true);
  // el paquete redondea a 2 decimales
  for (const k of BODY) assert.ok(Math.abs(q[k] - p[k]) <= 0.005, k);
  assert.equal(q.exhausted, !!p.exhausted);
  assert.equal(unpackBody(q, [1, 2]), false);
  assert.equal(unpackBody(q, [...packed.slice(0, 2), Number.NaN, ...packed.slice(3)]), false);
});

test('el paquete sobrevive a JSON (como en el cable)', () => {
  const p = new Player(world.spawn.x, world.spawn.y);
  for (let i = 0; i < 30; i++) applyMove(p, { mx: 0, my: 1, f: 0 }, quiet);
  assert.deepEqual(JSON.parse(JSON.stringify(packBody(p))), packBody(p));
});

test('Predictor: sin lag ni diferencias, el error queda bajo el redondeo del paquete', () => {
  const s = world.spawn;
  const client = new Player(s.x, s.y);
  const server = new Player(s.x, s.y);
  const pred = new Predictor(client, world);
  const errors = [];
  for (let t = 0; t < 120; t++) {
    const cmd = pred.step({ mx: 1, my: 0, f: t % 50 < 20 ? IN_RUN : 0, a: 0, w: -1 });
    applyMove(server, cmd, quiet);
    errors.push(pred.reconcile(packBody(server), cmd.s));
  }
  assert.ok(Math.max(...errors) < 0.05, `error máximo ${Math.max(...errors)}`);
});

test('Predictor: un empujón del servidor se corrige hacia la verdad', () => {
  const s = world.spawn;
  const client = new Player(s.x, s.y);
  const server = new Player(s.x, s.y);
  const pred = new Predictor(client, world);
  for (let t = 0; t < 60; t++) {
    const cmd = pred.step({ mx: 1, my: 0, f: 0, a: 0, w: -1 });
    applyMove(server, cmd, quiet);
    if (t === 30) server.kx += 400; // empujón que el cliente no conoce
    pred.reconcile(packBody(server), cmd.s);
  }
  const gap = Math.hypot(client.x - server.x, client.y - server.y);
  assert.ok(gap < 5, `desfase ${gap}`);
});

test('TICK sale de NET.tickHz', () => {
  assert.equal(TICK, 1 / NET.tickHz);
});

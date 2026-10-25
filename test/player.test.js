import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK } from '../js/net/netcode.js';
import { Player } from '../js/sim/player.js';
import { World } from '../js/sim/world.js';
import { silent } from './helpers.js';

const world = new World(777);
const game = { world, sfx: silent };
const BODY = ['x', 'y', 'vx', 'vy', 'kx', 'ky', 'stamina', 'sinceRun', 'legAngle'];

function run(inputs) {
  const p = new Player(world.spawn.x, world.spawn.y);
  for (const [mx, my, sprint] of inputs) p.move(TICK, mx, my, sprint, game);
  return p;
}

function script(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.sin(i / 13) * 3;
    out.push([Math.cos(a), Math.sin(a), i % 80 < 30]);
  }
  return out;
}

test('Player.move es determinista: mismas entradas, mismo cuerpo', () => {
  const a = run(script(600));
  const b = run(script(600));
  for (const k of BODY) assert.equal(a[k], b[k], k);
});

test('Player.move no usa Math.random ni el reloj', () => {
  const rnd = Math.random;
  const now = Date.now;
  const pnow = performance.now;
  const boom = (what) => () => {
    throw new Error(`${what} dentro de move`);
  };
  let a;
  try {
    Math.random = boom('Math.random');
    Date.now = boom('Date.now');
    performance.now = boom('performance.now');
    a = run(script(200));
  } finally {
    Math.random = rnd;
    Date.now = now;
    performance.now = pnow;
  }
  const b = run(script(200));
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
});

test('moverse cambia la posición; sin entrada se queda quieto', () => {
  const still = run(Array.from({ length: 60 }, () => [0, 0, false]));
  assert.equal(still.x, world.spawn.x);
  assert.equal(still.y, world.spawn.y);
  const moved = run(Array.from({ length: 60 }, () => [1, 0, false]));
  assert.ok(moved.x !== world.spawn.x || moved.y !== world.spawn.y);
});

test('correr gasta energía', () => {
  const p = run(Array.from({ length: 60 }, () => [1, 0, true]));
  assert.ok(p.stamina < new Player(0, 0).stamina);
});

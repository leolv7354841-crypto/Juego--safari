// Barricadas (js/sim/build.ts): el daño que reciben y cuándo se rompen.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHOP } from '../js/core/config.ts';
import { Structures } from '../js/sim/build.ts';
import { fakeGame, silent } from './helpers.js';

const pieza = (kind) => ({ kind, x: 0, y: 0, w: 80, h: 40, hp: SHOP[kind].hp, max: SHOP[kind].hp });

test('la barrera de concreto reforzado recibe un 10 % menos de daño; las demás, todo', () => {
  const removed = [];
  const game = fakeGame({ particles: silent, world: { removeDynamic: (o) => removed.push(o) } });
  const st = new Structures();
  const muro = pieza('reinforced');
  const hesco = { ...pieza('hesco'), x: 500 };
  st.blocks.push(muro, hesco);
  st.damageBlock(game, muro, 100);
  st.damageBlock(game, hesco, 100);
  assert.equal(muro.hp, SHOP.reinforced.hp - 90);
  assert.equal(hesco.hp, SHOP.hesco.hp - 100);
  assert.equal(SHOP.hesco.hp, 10000);
  assert.equal(SHOP.hesco.price, 800);
  // al quedarse sin vida desaparece y deja de bloquear el paso
  st.damageBlock(game, muro, SHOP.reinforced.hp);
  assert.ok(muro.hp > 0, 'con 18000 de daño todavía queda en pie');
  st.damageBlock(game, muro, 2000);
  assert.ok(muro.hp <= 0);
  assert.ok(!st.blocks.includes(muro));
  assert.deepEqual(removed, [muro]);
});

test('las explosiones seguidas no suben a un zombi más allá del tope (antes parecían gigantes)', async () => {
  const { AIR, ROCKET } = await import('../js/core/config.ts');
  const { Horde } = await import('../js/sim/zombies.ts');
  const { World } = await import('../js/sim/world.ts');
  const world = new World(777);
  const horde = new Horde();
  const st = new Structures();
  const player = { x: world.spawn.x, y: world.spawn.y, r: 14, alive: true, mass: 4, kx: 0, ky: 0, hurt() {} };
  const game = fakeGame({
    world,
    horde,
    structures: st,
    player,
    particles: silent,
    camera: silent,
    decals: silent,
    time: 0,
    state: 'play',
    hitZombie: () => {},
    killZombie: () => {},
    onZombieHit: () => {},
    onGiantStep: () => {},
    onSuperPunch: () => {},
  });
  const z = horde.spawn('sprinter', world.spawn.x + 300, world.spawn.y, 1, 1);
  z.spawnT = 0;
  let top = 0;
  for (let i = 0; i < 120; i++) {
    // un cohete cada 6 fotogramas, justo al lado
    if (i % 6 === 0) st.explode(game, { x: z.x - 10, y: z.y, owner: null }, ROCKET.radius, 1, 1.5);
    horde.update(1 / 60, game);
    top = Math.max(top, z.air);
  }
  assert.ok(top > AIR.max * 0.9, `vuela (${top})`);
  assert.ok(top <= AIR.max, `sin pasar el tope (${top})`);
});

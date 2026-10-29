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

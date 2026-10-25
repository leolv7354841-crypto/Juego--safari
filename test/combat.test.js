import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bulletHit } from '../js/sim/combat.js';
import { bullet, fakeGame, zombie } from './helpers.js';

test('bulletHit resta el daño de la bala', () => {
  const z = zombie('normal', 100);
  bulletHit(fakeGame(), z, bullet({ dmg: 35 }), 0, 0);
  assert.equal(z.hp, 65);
  assert.equal(z.flash, 0.08);
  assert.equal(z.hitT, 0.18);
});

test('normales y velocistas se frenan y quedan heridos; no retroceden', () => {
  for (const type of ['normal', 'sprinter']) {
    const z = zombie(type);
    bulletHit(fakeGame(), z, bullet(), 0, 0);
    assert.equal(z.slow, 0.45);
    assert.equal(z.wounded, true);
    assert.equal(z.kx, 0);
  }
});

test('el super blindado no se frena ni retrocede con balas', () => {
  const z = zombie('heavy', 500);
  bulletHit(fakeGame(), z, bullet(), 0, 0);
  assert.equal(z.slow, 0);
  assert.equal(z.kx, 0);
});

test('una explosión sí empuja al super blindado', () => {
  const z = zombie('heavy', 500);
  bulletHit(fakeGame(), z, bullet({ blast: true, knock: 2 }), 0, 0);
  assert.ok(z.kx > 0);
});

test('el gordo se frena poco y es empujado según su masa', () => {
  const z = zombie('fat', 200);
  z.mass = 3;
  bulletHit(fakeGame(), z, bullet({ knock: 3 }), 0, 0);
  assert.equal(z.slow, 0.16);
  assert.equal(z.kx, (3 * 3) / 3);
});

test('avisa a partículas y sonido con "big" solo para zombis grandes', () => {
  let big = null;
  const g = fakeGame({ sfx: { hit: (b) => (big = b) } });
  bulletHit(g, zombie('normal'), bullet(), 0, 0);
  assert.equal(big, false);
  bulletHit(g, zombie('bull'), bullet(), 0, 0);
  assert.equal(big, true);
});

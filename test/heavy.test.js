// Mejoras de la torreta pesada (js/sim/heavy.ts): niveles, precios, efectos y piloto automático.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEAVY, HEAVY_UP, HEAVY_UP_ORDER, SHOP, WEAPONS } from '../js/core/config.ts';
import {
  fireHeavy,
  heavyBlastR,
  heavyDmg,
  heavyLevel,
  heavyLevels,
  heavyMaxHp,
  heavyPrice,
  heavyRate,
  repairHeavies,
  updateAutoHeavy,
  upgradeHeavy,
} from '../js/sim/heavy.ts';
import { fakeGame, silent } from './helpers.js';

const torreta = (over = {}) => ({
  kind: 'heavy',
  x: 0,
  y: 0,
  w: 40,
  h: 40,
  hp: SHOP.heavy.hp,
  max: SHOP.heavy.hp,
  ang: 0,
  cd: 0,
  owner: null,
  ...over,
});

test('de fábrica: los efectos son los de la torreta sin mejorar', () => {
  const b = torreta();
  for (const id of HEAVY_UP_ORDER) assert.equal(heavyLevel(b, id), 0);
  assert.equal(heavyDmg(b), 1);
  assert.equal(heavyRate(b), WEAPONS.heavy.rate);
  assert.equal(heavyBlastR(b), HEAVY.blastR);
  assert.equal(heavyMaxHp(b), SHOP.heavy.hp);
});

test('cada mejora sube de a un nivel hasta su máximo, sin tocar las demás', () => {
  const b = torreta();
  for (const id of HEAVY_UP_ORDER) {
    const d = HEAVY_UP[id];
    for (let lv = 0; lv < d.price.length; lv++) {
      assert.equal(heavyPrice(b, id), d.price[lv]);
      assert.ok(upgradeHeavy(b, id));
      assert.equal(heavyLevel(b, id), lv + 1);
    }
    assert.equal(heavyPrice(b, id), 0, 'al máximo ya no se vende');
    assert.equal(upgradeHeavy(b, id), false);
  }
  assert.deepEqual(heavyLevels(b), Object.fromEntries(HEAVY_UP_ORDER.map((id) => [id, HEAVY_UP[id].price.length])));
  assert.equal(heavyRate(b), HEAVY_UP.rate.rate.at(-1));
  assert.equal(heavyBlastR(b), HEAVY_UP.blast.r.at(-1));
  assert.equal(heavyPrice(b, 'no-existe'), 0);
  assert.equal(upgradeHeavy(b, 'no-existe'), false);
});

test('el blindaje sube la vida máxima y la suma a la que tiene; al acabar la oleada repara', () => {
  const b = torreta({ hp: 1000 });
  upgradeHeavy(b, 'armor');
  assert.equal(b.max, HEAVY_UP.armor.hp[1]);
  assert.equal(b.hp, 1000 + HEAVY_UP.armor.hp[1] - HEAVY_UP.armor.hp[0]);
  const sin = torreta({ hp: 1000 });
  repairHeavies([b, sin, { ...torreta({ hp: 5 }), kind: 'wood' }]);
  assert.equal(b.hp, 3000 + b.max * HEAVY_UP.armor.repair[1]);
  assert.equal(sin.hp, 1000, 'sin blindaje no se repara');
});

test('la bala lleva el daño del calibre y el radio de la carga explosiva', () => {
  const list = [];
  const game = fakeGame({ bullets: { spawn: (q) => list.push(q) }, particles: silent });
  const b = torreta();
  upgradeHeavy(b, 'cal');
  upgradeHeavy(b, 'blast');
  fireHeavy(game, b, 1.5);
  const q = list[0];
  assert.ok(q.blast);
  assert.equal(q.dmg, WEAPONS.heavy.damage * 1.5 * HEAVY_UP.cal.dmg[1]);
  assert.equal(q.blastR, HEAVY_UP.blast.r[1]);
  assert.equal(q.blastP, HEAVY.blastPower * HEAVY_UP.cal.dmg[1]);
  assert.equal(q.auto, undefined, 'la de quien la maneja no es del piloto');
  fireHeavy(game, b, 1, 0, 'ana');
  assert.equal(list[1].owner, 'ana');
  assert.ok(list[1].auto);
  assert.notEqual(list[0].y, list[1].y, 'los cañones se turnan');
});

test('piloto automático: gira hacia el zombi, dispara con las balas del dueño y se calla sin balas', () => {
  const list = [];
  const z = { x: 300, y: 20, dead: false };
  const game = fakeGame({
    bullets: { spawn: (q) => list.push(q) },
    particles: silent,
    horde: { findTarget: (_x, _y, range) => (Math.hypot(z.x - 20, z.y - 20) < range ? z : null) },
  });
  const sola = torreta({ owner: 'ana' });
  const dueño = { heavyAmmo: 3 };
  for (let i = 0; i < 60; i++) updateAutoHeavy(sola, 1 / 60, game, dueño);
  assert.equal(list.length, 0, 'sin la mejora no dispara sola');
  upgradeHeavy(sola, 'auto');
  for (let i = 0; i < 600; i++) updateAutoHeavy(sola, 1 / 60, game, dueño);
  assert.equal(list.length, 3, 'gasta las balas del dueño y se detiene');
  assert.equal(dueño.heavyAmmo, 0);
  assert.ok(list.every((q) => q.owner === 'ana' && q.auto));
  // la manejan: el piloto se aparta
  const otra = torreta({ owner: 'ana', manned: {} });
  upgradeHeavy(otra, 'auto');
  for (let i = 0; i < 120; i++) updateAutoHeavy(otra, 1 / 60, game, { heavyAmmo: 50 });
  assert.equal(list.length, 3);
  // fuera de alcance no gasta
  z.x = 5000;
  const lejos = { heavyAmmo: 5 };
  for (let i = 0; i < 120; i++) updateAutoHeavy(sola, 1 / 60, game, lejos);
  assert.equal(lejos.heavyAmmo, 5);
});

// Racha de bajas (js/sim/combo.js): multiplicador por niveles, reloj, golpes y la foto.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMBO } from '../js/core/config.js';
import {
  applyCombo,
  comboBreak,
  comboKill,
  comboMult,
  comboTick,
  comboTier,
  multText,
  newCombo,
  packCombo,
} from '../js/sim/combo.js';

test('el multiplicador sube por niveles según las bajas seguidas', () => {
  assert.equal(comboMult(0), 1);
  assert.equal(comboTier(COMBO.tiers[0][0] - 1), 0);
  for (const [n, m] of COMBO.tiers) {
    assert.equal(comboMult(n), m);
    assert.equal(comboMult(n - 1) < m, true, `antes de ${n} bajas aún no es ×${m}`);
  }
  assert.equal(comboTier(1e6), COMBO.tiers.length);
  assert.equal(multText(1.5), '×1,5');
});

test('cada baja alarga la racha y reinicia el reloj; el dorado vale más', () => {
  const c = newCombo();
  for (let i = 0; i < 9; i++) assert.equal(comboKill(c, 'normal'), 1);
  assert.equal(comboKill(c, 'normal'), COMBO.tiers[0][1], 'la baja que llega al nivel ya cobra el multiplicador');
  assert.equal(c.t, COMBO.window);
  comboKill(c, 'golden');
  assert.equal(c.n, 10 + COMBO.golden);
  assert.equal(c.best, c.n);
});

test('se acaba si pasa la ventana sin bajas o con un golpe, y la mejor se guarda', () => {
  const c = newCombo();
  for (let i = 0; i < 12; i++) comboKill(c, 'normal');
  const p = { alive: true, combo: c };
  comboTick(p, COMBO.window - 0.1);
  assert.equal(c.n, 12, 'aún hay tiempo');
  comboKill(c, 'normal');
  comboTick(p, COMBO.window);
  assert.equal(c.n, 0, 'se acabó el reloj');
  comboKill(c, 'normal');
  comboBreak(c);
  assert.deepEqual([c.n, c.t, c.best], [0, 0, 13]);
  comboKill(c, 'normal');
  p.alive = false;
  comboTick(p, 0.01);
  assert.equal(c.n, 0, 'quien cae pierde la racha');
});

test('la foto lleva la racha y el reloj, y quien la recibe guarda su mejor marca', () => {
  const c = newCombo();
  for (let i = 0; i < 30; i++) comboKill(c, 'normal');
  comboTick({ alive: true, combo: c }, 1);
  const a = packCombo(c);
  assert.deepEqual(a, [30, 15]);
  const r = newCombo();
  applyCombo(r, a);
  assert.deepEqual([r.n, r.t, r.best], [30, 1.5, 30]);
  applyCombo(r, [0, 0]);
  assert.deepEqual([r.n, r.best], [0, 30]);
  applyCombo(r, undefined);
  assert.equal(r.best, 30, 'una foto sin racha no cambia nada');
});

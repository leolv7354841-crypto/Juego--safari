import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WAVES } from '../js/config.js';
import { Director } from '../js/director.js';
import { fakeGame } from './helpers.js';

const count = (q) =>
  q.reduce((m, t) => {
    m[t] = (m[t] || 0) + 1;
    return m;
  }, {});

test('la oleada 1 solo trae normales, SWAT y velocistas', () => {
  const d = new Director();
  d.startWave(fakeGame());
  assert.equal(d.wave, 1);
  assert.equal(d.state, 'active');
  assert.equal(d.waveSize, d.queue.length);
  const c = count(d.queue);
  assert.deepEqual(Object.keys(c).sort(), ['normal', 'sprinter', 'swat']);
  // la fórmula de la oleada 1, escalada por WAVES.count (el balance vive en config.js)
  const normalTotal = Math.round(WAVES.count * 5 * (32 + 18 + 1));
  assert.equal(c.normal + c.swat, normalTotal);
  assert.equal(c.swat, Math.round(normalTotal * 0.2));
  assert.equal(c.sprinter, Math.round(WAVES.count * 5 * 3));
});

test('el tamaño de la cola es determinista y crece con la oleada', () => {
  const sizes = [];
  for (let i = 0; i < 2; i++) {
    const d = new Director();
    const row = [];
    for (let w = 0; w < 6; w++) {
      d.startWave(fakeGame());
      row.push(d.queue.length);
    }
    sizes.push(row);
  }
  assert.deepEqual(sizes[0], sizes[1]);
  assert.deepEqual(
    sizes[0],
    [...sizes[0]].sort((a, b) => a - b),
  );
});

test('toros desde la oleada 3, gordos desde la 2, blindados tras la 10', () => {
  const d = new Director();
  const seen = [];
  for (let w = 1; w <= 11; w++) {
    d.startWave(fakeGame());
    seen.push(count(d.queue));
  }
  assert.ok(!seen[0].fat && !seen[0].bull);
  assert.ok(seen[1].fat > 0 && !seen[1].bull);
  assert.ok(seen[2].bull > 0);
  assert.ok(!seen[9].heavy);
  assert.ok(seen[10].heavy > 0);
});

test('cooperativo reduce la cola a la mitad y online usa crowd', () => {
  const solo = new Director();
  solo.startWave(fakeGame());
  const co = new Director();
  co.coop = true;
  co.startWave(fakeGame());
  assert.ok(co.queue.length < solo.queue.length * 0.6);
  const on = new Director();
  on.coop = true;
  on.crowd = 1;
  on.startWave(fakeGame());
  assert.equal(on.queue.length, solo.queue.length);
});

test('nextRound solo arranca desde "waiting"', () => {
  const d = new Director();
  assert.equal(d.nextRound(fakeGame()), false);
  assert.equal(d.wave, 0);
  d.state = 'waiting';
  assert.equal(d.nextRound(fakeGame()), true);
  assert.equal(d.wave, 1);
  assert.equal(d.state, 'active');
});

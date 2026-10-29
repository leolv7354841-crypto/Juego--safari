import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENT_ORDER, EVENTS, START, WAVES } from '../js/core/config.ts';
import { Director } from '../js/sim/director.ts';
import { fakeGame } from './helpers.js';

// Las pruebas de la composición de cada oleada van sin rondas especiales (salen al azar).
const sinRondas = () => Object.assign(new Director(), { events: false });

// Math.random fijo mientras corre f (para forzar el sorteo de las rondas especiales).
function azar(v, f) {
  const r = Math.random;
  Math.random = () => v;
  try {
    return f();
  } finally {
    Math.random = r;
  }
}

const count = (q) =>
  q.reduce((m, t) => {
    m[t] = (m[t] || 0) + 1;
    return m;
  }, {});

test('la oleada 1 es chica y solo trae normales y velocistas; la 2 suma los SWAT', () => {
  const d = sinRondas();
  d.startWave(fakeGame());
  assert.equal(d.wave, 1);
  assert.equal(d.state, 'active');
  assert.equal(d.waveSize, d.queue.length);
  const c = count(d.queue);
  assert.deepEqual(Object.keys(c).sort(), ['normal', 'sprinter']);
  // la fórmula de la oleada 1, escalada por WAVES.count y el arranque suave (el balance vive en config.ts)
  const k = WAVES.count * START.size[0];
  assert.equal(c.normal, Math.round(k * 5 * (32 + 18 + 1)));
  assert.equal(c.sprinter, Math.round(k * 5 * 3));
  d.startWave(fakeGame());
  const c2 = count(d.queue);
  const normalTotal = Math.round(WAVES.count * START.size[1] * 5 * (32 + 36 + 3));
  assert.equal(c2.normal + c2.swat, normalTotal);
  assert.equal(c2.swat, Math.round(normalTotal * 0.2));
});

test('el tamaño de la cola es determinista y crece con la oleada', () => {
  const sizes = [];
  for (let i = 0; i < 2; i++) {
    const d = sinRondas();
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
  const d = sinRondas();
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

test('composition describe exactamente la cola que arma startWave', () => {
  for (const w of [1, 2, 5, 12]) {
    const d = sinRondas();
    for (let i = 0; i < w; i++) d.startWave(fakeGame());
    const c = count(d.queue);
    const k = d.composition(w);
    assert.equal(k.total, d.queue.length, `total de la oleada ${w}`);
    for (const t of ['normal', 'swat', 'sprinter', 'fat', 'heavy', 'bull'])
      assert.equal(k[t], c[t] || 0, `${t} en la oleada ${w}`);
  }
  // sin arrancar nada: sirve para prever cualquier ronda
  const d = sinRondas();
  assert.ok(d.composition(20).total > d.composition(3).total);
  assert.equal(d.wave, 0);
});

test('en grupo la cola se reduce a la mitad y online usa crowd', () => {
  const solo = sinRondas();
  solo.startWave(fakeGame());
  const grupo = sinRondas();
  grupo.coop = true;
  grupo.startWave(fakeGame());
  assert.ok(grupo.queue.length < solo.queue.length * 0.6);
  const on = sinRondas();
  on.coop = true;
  on.crowd = 1;
  on.startWave(fakeGame());
  assert.equal(on.queue.length, solo.queue.length);
});

test('nextRound solo arranca desde "waiting"', () => {
  const d = sinRondas();
  assert.equal(d.nextRound(fakeGame()), false);
  assert.equal(d.wave, 0);
  d.state = 'waiting';
  assert.equal(d.nextRound(fakeGame()), true);
  assert.equal(d.wave, 1);
  assert.equal(d.state, 'active');
});

test('rondas especiales: nunca en la oleada 1 ni dos seguidas, ni el mismo tipo de las últimas', () => {
  const d = new Director();
  azar(0, () => d.startWave(fakeGame()));
  assert.equal(d.event, '', 'la oleada 1 es normal');
  const seen = [];
  for (let w = 2; w <= 30; w++) {
    azar(0, () => d.startWave(fakeGame()));
    seen.push(d.event);
  }
  for (let i = 1; i < seen.length; i++) assert.ok(!(seen[i] && seen[i - 1]), 'nunca dos seguidas');
  const evs = seen.filter(Boolean);
  assert.ok(evs.length >= 10, 'con el azar a favor sale una de cada dos');
  for (let i = 1; i < evs.length; i++)
    for (let k = 1; k <= EVENTS.gap && i - k >= 0; k++) assert.notEqual(evs[i], evs[i - k], 'no repite tipo');
  // con azar de verdad salen todos los tipos y más o menos en la proporción esperada
  const r = new Director();
  const all = [];
  for (let w = 2; w <= 2001; w++) all.push(r.rollEvent(w));
  assert.deepEqual(new Set(all.filter(Boolean)), new Set(EVENT_ORDER), 'salen todos los tipos');
  const share = all.filter(Boolean).length / all.length;
  assert.ok(share > 0.33 && share < 0.45, `dos de cada 5 oleadas, más o menos (${share})`);
  // sin suerte no hay ronda especial
  const e = new Director();
  for (let w = 1; w <= 10; w++) azar(0.99, () => e.startWave(fakeGame()));
  assert.equal(e.event, '');
});

// Fuerza que la próxima oleada de d sea la ronda especial id.
function forzar(d, id) {
  const otros = EVENT_ORDER.filter((x) => x !== id);
  d.recent = otros.slice(0, EVENTS.gap);
  d.lastEvent = '';
  const k = EVENT_ORDER.filter((x) => !d.recent.includes(x)).indexOf(id);
  const pool = EVENT_ORDER.filter((x) => !d.recent.includes(x)).length;
  // el sorteo es Math.random() < chance y luego randInt sobre los que quedan
  let n = 0;
  const vals = [0, (k + 0.5) / pool];
  const r = Math.random;
  Math.random = () => vals[n++] ?? 0.5;
  try {
    d.startWave(fakeGame());
  } finally {
    Math.random = r;
  }
  assert.equal(d.event, id);
}

test('estampida: solo velocistas y toros, y menos zombis', () => {
  const normal = sinRondas();
  for (let w = 1; w <= 5; w++) normal.startWave(fakeGame());
  const d = sinRondas();
  for (let w = 1; w <= 4; w++) d.startWave(fakeGame());
  d.events = true;
  forzar(d, 'stampede');
  const c = count(d.queue);
  assert.deepEqual(Object.keys(c).sort(), ['bull', 'sprinter']);
  assert.ok(c.bull >= 2);
  assert.ok(Math.abs(d.queue.length - normal.queue.length * EVENTS.types.stampede.size) < normal.queue.length * 0.05);
});

test('asedio blindado: la mitad de los normales llega como SWAT; luna de sangre: más rápidos', () => {
  const d = sinRondas();
  d.startWave(fakeGame());
  const base = d.speedMult;
  d.events = true;
  forzar(d, 'siege');
  const c = count(d.queue);
  assert.ok(Math.abs(c.swat / (c.swat + c.normal) - EVENTS.types.siege.swat) < 0.01);
  const b = sinRondas();
  b.startWave(fakeGame());
  b.events = true;
  forzar(b, 'blood');
  assert.ok(Math.abs(b.speedMult / base - EVENTS.types.blood.speed) < 0.05);
});

test('la ronda especial se anuncia y termina con la oleada', () => {
  const d = sinRondas();
  d.startWave(fakeGame());
  d.events = true;
  const game = fakeGame();
  const r = Math.random;
  let n = 0;
  Math.random = () => [0, 0][n++] ?? 0.5;
  try {
    d.startWave(game);
  } finally {
    Math.random = r;
  }
  const def = EVENTS.types[d.event];
  assert.ok(def);
  assert.deepEqual(game.calls.banner.at(-1), [`Oleada 2 · ${def.name}`, def.desc]);
  // se acaba la oleada: sin cola ni zombis vivos
  d.queue.length = 0;
  d.update(0.1, { ...game, horde: { list: [] }, onGoldenExpired() {}, onWaveCleared() {} });
  assert.equal(d.state, 'waiting');
  assert.equal(d.event, '');
});

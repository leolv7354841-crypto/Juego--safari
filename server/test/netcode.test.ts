// Pruebas de la predicción con reconciliación y de la interpolación (js/netcode.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/sim/shim.ts';
import { World } from '../../js/world.js';
import { Player } from '../../js/player.js';
import { Predictor, Interp, applyMove, packBody, unpackBody, IN_RUN, TICK } from '../../js/netcode.js';
import { NET } from '../../js/config.js';

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

// El servidor procesa las mismas entradas con `lag` pasos de atraso y manda una foto cada 3.
function run(lag: number, push?: (server: any, tick: number) => void) {
  const s = world.spawn;
  const client = new Player(s.x, s.y);
  const server = new Player(s.x, s.y);
  const pred = new Predictor(client, world);
  const list = cmds(240);
  const sent: any[] = [];
  const errors: number[] = [];
  let lastBody: any = null;
  for (let t = 0; t < list.length; t++) {
    sent.push(pred.step({ ...list[t] }));
    const k = t - lag;
    if (k >= 0) {
      applyMove(server, sent[k], quiet);
      if (push) push(server, k);
      if (k % 3 === 0) {
        lastBody = packBody(server);
        errors.push(pred.reconcile(lastBody, sent[k].s));
      }
    }
    pred.decay(TICK);
  }
  return { client, server, pred, errors, sent, lastBody };
}

test('sin diferencias, la reconciliación no corrige nada', () => {
  const { pred, errors } = run(6);
  assert.ok(errors.length > 50);
  assert.ok(Math.max(...errors) < 0.05, `error máximo ${Math.max(...errors)}`);
  assert.equal(pred.takeStats().n, 0);
  // sólo quedan pendientes las entradas que el servidor aún no procesó
  assert.ok(pred.pending.length <= 6 + 3);
});

test('un empujón del servidor se corrige y el desfase visual se borra', () => {
  const { client, pred, errors, lastBody } = run(6, (sv, k) => {
    if (k === 60) sv.kx += 420; // golpe de un zombi que el cliente no predijo
  });
  assert.ok(Math.max(...errors) > 1, 'hubo corrección');
  const st = pred.takeStats();
  assert.ok(st.n > 0);
  // la física del cliente = última foto del servidor + las entradas aún sin confirmar
  const check = new Player(0, 0);
  unpackBody(check, lastBody);
  for (const c of pred.pending) applyMove(check, c, quiet);
  assert.ok(Math.hypot(check.x - client.x, check.y - client.y) < 0.05, 'misma posición física');
  // el desfase visual se apaga en menos de medio segundo
  for (let i = 0; i < 30; i++) pred.decay(TICK);
  assert.ok(Math.hypot(pred.ox, pred.oy) < 0.5, `desfase ${Math.hypot(pred.ox, pred.oy)}`);
});

test('un error grande se corrige de golpe (sin deslizar por el mapa)', () => {
  const { pred } = run(4, (sv, k) => {
    if (k === 30) sv.x += 400; // reaparición o teletransporte del servidor
  });
  const st = pred.takeStats();
  assert.ok(st.snaps >= 1);
  assert.ok(st.max > NET.snapDist);
});

test('la cola de pendientes está acotada', () => {
  const p = new Player(world.spawn.x, world.spawn.y);
  const pred = new Predictor(p, world);
  for (let i = 0; i < NET.pendingMax * 3; i++) pred.step({ mx: 1, my: 0, f: 0, a: 0, w: -1 });
  assert.equal(pred.pending.length, NET.pendingMax);
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

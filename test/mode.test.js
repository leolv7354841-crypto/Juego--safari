// game.mode: quién manda en cada modo y a quién se le piden las acciones (js/net/mode.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mode, OnlineClient, ServerMode, Solo } from '../js/net/mode.ts';

// Un juego falso: cada llamada a online queda anotada.
function juego() {
  const calls = [];
  const rec =
    (name) =>
    (...a) => {
      calls.push([name, ...a]);
    };
  return {
    calls,
    online: { act: rec('act'), send: rec('osend'), stats: () => 'online' },
  };
}

const TABLA = [
  // modo, kind, authority, inGroup, savesProgress, viaServer, canBuild
  [(g) => new Solo(g), 'solo', true, false, true, false, true],
  [(g) => new Solo(g, true), 'solo', true, false, false, false, true],
  [(g) => new OnlineClient(g), 'online', false, true, false, true, false],
  [(g) => new ServerMode(g), 'server', true, true, false, false, true],
];

test('cada modo responde lo que debe (quién simula, si hay grupo, si guarda...)', () => {
  for (const [crear, kind, authority, inGroup, saves, viaServer, canBuild] of TABLA) {
    const m = crear(juego());
    const id = `${kind}${m.detached ? ' (separado)' : ''}`;
    assert.equal(m.kind, kind, id);
    assert.equal(m.authority(), authority, `${id}: authority`);
    assert.equal(m.inGroup(), inGroup, `${id}: inGroup`);
    assert.equal(m.savesProgress(), saves, `${id}: savesProgress`);
    assert.equal(m.viaServer(), viaServer, `${id}: viaServer`);
    assert.equal(m.canBuild(), canBuild, `${id}: canBuild`);
  }
});

test('sólo hay cuatro modos y ya no existen los del cooperativo directo', async () => {
  const modos = await import('../js/net/mode.ts');
  assert.deepEqual(Object.keys(modos).sort(), ['Mode', 'OnlineClient', 'ServerMode', 'Solo']);
  const m = new Solo(juego());
  for (const n of [
    'hostedPeer',
    'companion',
    'reportShot',
    'onAcid',
    'onLocalDeath',
    'restart',
    'hasRobot',
    'hasHeavy',
  ])
    assert.ok(!(n in m), n);
});

test('quien no tiene autoridad (el cliente en línea) no calcula daño', () => {
  const sinAutoridad = TABLA.filter((t) => !t[2]).map((t) => t[1]);
  assert.deepEqual(sinAutoridad, ['online']);
});

test('sólo Solo guarda el progreso, y no si viene separado de una sala', () => {
  const guardan = TABLA.filter((t) => t[4]).map((t) => t[1]);
  assert.deepEqual(guardan, ['solo']);
  assert.equal(new Solo(juego(), true).savesProgress(), false);
});

test('en solitario y en el servidor las peticiones no hacen nada (se resuelve en local)', () => {
  const g = juego();
  for (const m of [new Solo(g), new ServerMode(g)]) {
    m.sendAbility({ cls: 'bomber' }, { x: 1, y: 2 });
    assert.equal(m.sendNextRound(), false);
    assert.equal(m.sendThrow('grenade', 1, 2), false);
    assert.equal(m.restartBlocked(), null);
    assert.equal(m.step(0.016), false);
    assert.equal(m.netStats(1), null);
  }
  assert.deepEqual(g.calls, []);
});

test('el cliente en línea manda intenciones al servidor y no avanza el mundo él mismo', () => {
  const g = juego();
  const m = new OnlineClient(g);
  m.sendAbility({ cls: 'bomber' }, { x: 1.4, y: 2.6 });
  m.sendBuild('metal');
  assert.equal(m.sendThrow('grenade', 3.2, 4.8), true);
  assert.equal(m.sendNextRound(), true);
  assert.equal(m.step(0.016), true);
  assert.equal(m.netStats(1), 'online');
  assert.deepEqual(g.calls, [
    ['act', 'ab', { tx: 1, ty: 3 }],
    ['act', 'build', { kind: 'metal' }],
    ['act', 'throw', { kind: 'grenade', tx: 3, ty: 5 }],
    ['osend', 'next'],
  ]);
  assert.match(m.restartBlocked(), /En línea/);
});

test('todo modo ofrece el mismo conjunto de métodos que la base', () => {
  const base = Object.getOwnPropertyNames(Mode.prototype).filter((n) => n !== 'constructor');
  assert.ok(base.length >= 10);
  for (const C of [Solo, OnlineClient, ServerMode]) {
    const m = new C(null);
    for (const n of base) assert.ok(n in m, `${C.name}.${n}`);
  }
});

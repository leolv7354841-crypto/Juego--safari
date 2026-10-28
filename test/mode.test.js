// game.mode: quién manda en cada modo y a quién se le piden las acciones (js/net/mode.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoopGuest, CoopHost, Mode, OnlineClient, ServerMode, Solo } from '../js/net/mode.ts';

// Un juego falso: cada llamada a coop u online queda anotada.
function juego() {
  const calls = [];
  const rec =
    (name) =>
    (...a) => {
      calls.push([name, ...a]);
    };
  const peer = { alive: true, x: 1, y: 2 };
  return {
    calls,
    coop: {
      peer,
      acidAt: rec('acidAt'),
      onLocalDeath: rec('onLocalDeath'),
      send: rec('send'),
      restart: rec('restart'),
      stats: () => 'coop',
      guestMissile: rec('guestMissile'),
      guestBuild: rec('guestBuild'),
      guestThrow: rec('guestThrow'),
      sendShot: rec('sendShot'),
      guestUpdate: rec('guestUpdate'),
    },
    online: { act: rec('act'), send: rec('osend'), stats: () => 'online' },
  };
}

const TABLA = [
  // modo, kind, authority, inGroup, savesProgress, viaServer, canBuild, hasRobot, hasHeavy
  [(g) => new Solo(g), 'solo', true, false, true, false, true, true, true],
  [(g) => new Solo(g, true), 'solo', true, false, false, false, true, true, true],
  [(g) => new CoopHost(g), 'coopHost', true, true, false, false, true, true, true],
  [(g) => new CoopGuest(g), 'coopGuest', false, true, false, false, false, false, false],
  [(g) => new OnlineClient(g), 'online', false, true, false, true, false, true, true],
  [(g) => new ServerMode(g), 'server', true, true, false, false, true, true, true],
];

test('cada modo responde lo que debe (quién simula, si hay grupo, si guarda...)', () => {
  for (const [crear, kind, authority, inGroup, saves, viaServer, canBuild, hasRobot, hasHeavy] of TABLA) {
    const m = crear(juego());
    const id = `${kind}${m.detached ? ' (separado)' : ''}`;
    assert.equal(m.kind, kind, id);
    assert.equal(m.authority(), authority, `${id}: authority`);
    assert.equal(m.inGroup(), inGroup, `${id}: inGroup`);
    assert.equal(m.savesProgress(), saves, `${id}: savesProgress`);
    assert.equal(m.viaServer(), viaServer, `${id}: viaServer`);
    assert.equal(m.canBuild(), canBuild, `${id}: canBuild`);
    assert.equal(m.hasRobot(), hasRobot, `${id}: hasRobot`);
    assert.equal(m.hasHeavy(), hasHeavy, `${id}: hasHeavy`);
  }
});

test('quien no tiene autoridad (invitado y cliente en línea) no calcula daño', () => {
  const sinAutoridad = TABLA.filter((t) => !t[2]).map((t) => t[1]);
  assert.deepEqual(sinAutoridad, ['coopGuest', 'online']);
});

test('el anfitrión simula a su compañero; los demás modos no', () => {
  const g = juego();
  assert.equal(new CoopHost(g).hostedPeer(), g.coop.peer);
  assert.equal(new CoopHost(g).companion(), g.coop.peer);
  assert.equal(new CoopGuest(g).hostedPeer(), null);
  assert.equal(new CoopGuest(g).companion(), g.coop.peer);
  for (const m of [new Solo(g), new OnlineClient(g), new ServerMode(g)]) {
    assert.equal(m.hostedPeer(), null, m.kind);
    assert.equal(m.companion(), null, m.kind);
  }
});

test('en solitario y en el servidor las peticiones no hacen nada (se resuelve en local)', () => {
  const g = juego();
  for (const m of [new Solo(g), new ServerMode(g)]) {
    m.sendAbility({ cls: 'bomber' }, { x: 1, y: 2 });
    m.reportShot(0, 0, [], {}, {});
    m.onAcid(1, 2, 3);
    assert.equal(m.sendNextRound(), false);
    assert.equal(m.sendThrow('grenade', 1, 2), false);
    assert.equal(m.onLocalDeath(), false);
    assert.equal(m.restart(), false);
    assert.equal(m.restartBlocked(), null);
    assert.equal(m.step(0.016), false);
    assert.equal(m.netStats(1), null);
  }
  assert.deepEqual(g.calls, []);
});

test('el anfitrión avisa del ácido, de la muerte, del fin y reinicia con su compañero', () => {
  const g = juego();
  const m = new CoopHost(g);
  m.onAcid(1, 2, 3);
  assert.equal(m.onLocalDeath(), true);
  m.onGameOver();
  assert.equal(m.restart(), true);
  assert.equal(m.netStats(1), 'coop');
  assert.deepEqual(
    g.calls.map((c) => c[0]),
    ['acidAt', 'onLocalDeath', 'send', 'restart'],
  );
  assert.deepEqual(g.calls[2], ['send', { t: 'over' }]);
});

test('el invitado pide al anfitrión: construir, lanzar, misil, siguiente oleada y disparos', () => {
  const g = juego();
  const m = new CoopGuest(g);
  m.sendBuild('wood');
  assert.equal(m.sendThrow('molotov', 10, 20), true);
  m.sendAbility({ cls: 'berserker' }, { x: 1, y: 1 });
  m.sendAbility({ cls: 'bomber' }, { x: 5, y: 6 });
  assert.equal(m.sendNextRound(), true);
  m.reportShot(1, 2, [0.1], { id: 'pistol' }, {});
  assert.equal(m.onLocalDeath(), true);
  assert.equal(m.step(0.016), true);
  assert.deepEqual(g.calls, [
    ['guestBuild', 'wood'],
    ['guestThrow', 'molotov', 10, 20],
    ['guestMissile', 5, 6],
    ['send', { t: 'next' }],
    ['sendShot', 1, 2, [0.1], { id: 'pistol' }, {}],
    ['onLocalDeath'],
    ['guestUpdate', 0.016],
  ]);
  assert.match(m.restartBlocked(), /anfitrión/);
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
  assert.ok(base.length >= 20);
  for (const C of [Solo, CoopHost, CoopGuest, OnlineClient, ServerMode]) {
    const m = new C(null);
    for (const n of base) assert.ok(n in m, `${C.name}.${n}`);
  }
});

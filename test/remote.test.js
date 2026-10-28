// Formato común de las fotos (net/snapshot.js) y lo que hace con ellas quien solo mira (net/remote.js):
// el cliente en línea.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NET } from '../js/core/config.ts';
import { Interp } from '../js/net/netcode.ts';
import { NetStats, Remote } from '../js/net/remote.ts';
import { PEER_N, ROBOT_N, ZOMBIE_N, WORLD_KEYS, encodeStatic, encodeWorld } from '../js/net/snapshot.ts';
import { Bullets } from '../js/sim/bullets.ts';
import { Director } from '../js/sim/director.ts';
import { Pickups } from '../js/sim/pickups.ts';
import { Player } from '../js/sim/player.ts';
import { Robot } from '../js/sim/robot.ts';
import { Structures } from '../js/sim/build.ts';
import { Horde } from '../js/sim/zombies.ts';
import { World } from '../js/sim/world.ts';
import { silent } from './helpers.js';

// Índices de jugador que da el servidor: el otro jugador y el propio.
const OTRO_IDX = 0;
const MI_IDX = 1;

// Un mundo "de verdad" (sin pantalla): lo que arma el servidor.
function simulacion() {
  const horde = new Horde();
  const sim = {
    horde,
    pickups: new Pickups(),
    bullets: new Bullets(),
    structures: new Structures(),
    director: new Director(),
    time: 12.4,
    world: new World(1),
  };
  sim.director.wave = 3;
  sim.director.state = 'active';
  return sim;
}

// El juego del que mira: lo mínimo que tocan Remote y los módulos que usa.
function juegoRemoto() {
  const sim = simulacion();
  const calls = { burn: 0, shake: [], sfx: [], banner: [] };
  const game = {
    ...sim,
    player: new Player(0, 0),
    robot: new Robot(),
    stepT: 0,
    particles: new Proxy(
      { burning: () => calls.burn++, update() {}, rocketTrail() {} },
      { get: (t, k) => t[k] || (() => {}) },
    ),
    decals: { update() {}, splat: () => calls.sfx.push('splat') },
    sfx: silent,
    music: { setDanger() {} },
    camera: { shake: (...a) => calls.shake.push(a) },
    banner: (a, b) => calls.banner.push([a, b]),
    emitFires() {},
  };
  game.bullets = {
    list: [],
    update() {},
    spawn(b) {
      this.list.push(b);
    },
  };
  const sprites = new Proxy({}, { get: () => [{}] });
  const remote = new Remote(game, { zombieSprites: () => sprites });
  game.remote = remote;
  return { game, remote, calls };
}

const vistaDe = (p) => ({ x: p.x, y: p.y, vw: 400, vh: 300 });

test('la foto trae todas las claves comunes y cada jugador / robot / zombi ocupa su tamaño', () => {
  const sim = simulacion();
  const otro = new Player(100, 120);
  otro.angle = 1.5;
  const z = sim.horde.spawn('fat', 50, 60);
  const robot = new Robot();
  robot.owned = true;
  robot.x = 70;
  robot.y = 80;
  const snap = encodeWorld(
    sim,
    { x: 40, y: 50, vw: 400, vh: 300 },
    { players: [{ idx: 2, p: otro }], robots: [{ idx: 2, r: robot }] },
  );
  assert.deepEqual(Object.keys(snap).sort(), [...WORLD_KEYS].sort());
  assert.equal(snap.z.length, ZOMBIE_N);
  assert.equal(snap.z[0], z.id);
  assert.equal(snap.pl.length, PEER_N);
  assert.equal(snap.pl[0], 2);
  assert.equal(snap.rb.length, ROBOT_N);
  assert.deepEqual(snap.o, [40, 50]);
  assert.equal(snap.w, 3);
  assert.equal(snap.ds, 'active');
  assert.equal(snap.tm, 12);
});

test('los zombis lejos de la pantalla no viajan, el gigante y el dorado sí (con su vista más ancha)', () => {
  const sim = simulacion();
  sim.horde.spawn('normal', 100, 100);
  sim.horde.spawn('normal', 100 + NET.zombieView[0] + 100, 100);
  const lejos = 100 + NET.view - 50; // dentro de view pero fuera de la pantalla
  sim.horde.spawn('giant', lejos, 100);
  sim.horde.spawn('normal', lejos, 100);
  const snap = encodeWorld(sim, { x: 100, y: 100, vw: 300, vh: 300 });
  assert.equal(snap.z.length / ZOMBIE_N, 2);
});

test('solo los heridos de tipos con barra mandan su vida; los normales no', () => {
  const sim = simulacion();
  const g = sim.horde.spawn('fat', 10, 10);
  const n = sim.horde.spawn('normal', 20, 20);
  g.hp = g.maxHp / 2;
  n.hp = 1;
  const snap = encodeWorld(sim, { x: 0, y: 0 });
  assert.deepEqual(snap.zh, [g.id, 50]);
});

test('ida y vuelta: lo que el anfitrión codifica, el que mira lo reconstruye', () => {
  const sim = simulacion();
  const z = sim.horde.spawn('sprinter', 300, 340);
  z.angle = Math.PI;
  z.burn = 1;
  const host = new Player(310, 330);
  host.angle = 0.5;
  host.legAngle = 0.25;
  host.running = true;
  host.weapons = [host.makeWeapon('shotgun')];
  host.weapon.mag = 3;
  host.reloadT = 0.4;
  host.reloadProg = 0.6;
  host.hp = 77;
  sim.pickups.list.push({ k: 'med', x: 305, y: 320, t: 1.5 });
  sim.bullets.list.push({ x: 320, y: 330, dx: 1, dy: 0, rocket: true, owner: 'host' });
  sim.bullets.list.push({ x: 321, y: 331, dx: 1, dy: 0, owner: 'peer' });
  sim.structures.blocks.push({ kind: 'wood', x: 340, y: 340, w: 40, h: 40, hp: 120, ang: 0 });
  const rb = new Robot();
  rb.owned = true;
  rb.x = 330;
  rb.y = 340;
  rb.hp = 4000;
  const snap = {
    ...encodeWorld(sim, vistaDe({ x: 300, y: 330 }), {
      players: [{ idx: OTRO_IDX, p: host }],
      robots: [{ idx: OTRO_IDX, r: rb }],
      skipBullet: (b) => b.owner === 'peer',
    }),
    ...encodeStatic(sim.structures),
  };
  // viaja como JSON (el canal de datos y el WebSocket lo hacen igual)
  const rx = JSON.parse(JSON.stringify(snap));

  const { game, remote } = juegoRemoto();
  remote.start();
  remote.applyWorld(rx, 1000, {
    myIdx: MI_IDX,
    identify: () => ({ name: 'Ana', code: '' }),
    collide: false,
  });
  // zombi
  assert.equal(game.horde.list.length, 1);
  assert.equal(game.horde.list[0].type, 'sprinter');
  assert.equal(game.horde.list[0].burn, 1);
  // el otro como jugador remoto
  const q = remote.peers.get(OTRO_IDX);
  assert.equal(q.name, 'Ana');
  assert.equal(q.weapon.id, 'shotgun');
  assert.equal(q.weapon.mag, 3);
  assert.equal(q.reloadT, 0.4);
  assert.equal(q.hp, 77);
  assert.equal(q.running, true);
  // el robot del otro es de otro: va aparte y no toca game.robot
  assert.equal(remote.robots.get(OTRO_IDX).hp, 4000);
  assert.equal(game.robot.owned, false);
  // objetos, balas (la del compañero no viaja) y barricadas
  assert.equal(game.pickups.list.length, 1);
  assert.equal(game.pickups.list[0].k, 'med');
  assert.equal(remote.bullets.length, 1);
  assert.equal(remote.bullets[0].rocket, true);
  assert.equal(game.structures.blocks.length, 1);
  assert.equal(game.structures.blocks[0].kind, 'wood');
});

test('los zombis se mueven interpolando entre dos fotos, con retraso, sin saltos', () => {
  const { game, remote } = juegoRemoto();
  remote.start();
  const foto = (x) => ({ o: [0, 0], z: [7, 0, x, 0, 0, 0] });
  remote.applyWorld(foto(0), 1000);
  remote.applyWorld(foto(100), 1100);
  const jugador = new Player(0, 0);
  remote.placeZombies(1050, 0.016, jugador);
  assert.equal(Math.round(game.horde.list[0].x), 50);
  remote.placeZombies(1100, 0.016, jugador);
  assert.equal(Math.round(game.horde.list[0].x), 100);
  // sin fotos nuevas se adelanta solo hasta el límite y se queda ahí
  remote.placeZombies(5000, 0.016, jugador);
  assert.ok(game.horde.list[0].x <= 100 + 100 * (NET.maxExtrapolate / 100) + 1);
  assert.ok(game.horde.list[0].x > 100);
});

test('un zombi que ya no viene en la foto desaparece; los que siguen conservan su sprite y su animación', () => {
  const { game, remote } = juegoRemoto();
  remote.start();
  remote.applyWorld({ o: [0, 0], z: [1, 0, 0, 0, 0, 0, 2, 0, 5, 5, 0, 0] }, 1);
  const uno = game.horde.list.find((z) => z.id === 1);
  remote.applyWorld({ o: [0, 0], z: [1, 0, 1, 0, 0, 0] }, 2);
  assert.deepEqual(
    game.horde.list.map((z) => z.id),
    [1],
  );
  assert.equal(game.horde.list[0], uno);
});

test('jugadores nuevos se crean con Interp y los que se van se borran', () => {
  const { remote } = juegoRemoto();
  remote.start();
  const pl = (idx) => [idx, 10, 20, 100, 0, 0, 0, 0, 1, 0, 0, 0, 100, 0, 0, 0, 5, 0, 0];
  remote.applyWorld({ pl: [...pl(2), ...pl(3)] }, 1, { identify: (i) => ({ name: `J${i}`, code: '' }) });
  assert.deepEqual([...remote.peers.keys()].sort(), [2, 3]);
  assert.ok(remote.peers.get(2).it instanceof Interp);
  assert.equal(remote.peers.get(3).name, 'J3');
  remote.applyWorld({ pl: pl(3) }, 2);
  assert.deepEqual([...remote.peers.keys()], [3]);
});

test('las barricadas chocan en el mapa local solo con collide (predicción en línea)', () => {
  const blk = [['wood', 100, 100, 40, 40, 160, 0]];
  const en = (collide) => {
    const { game, remote } = juegoRemoto();
    let altas = 0;
    game.world = { addDynamic: () => altas++, removeDynamic() {} };
    remote.start();
    remote.applyStructures({ blk }, collide);
    return altas;
  };
  assert.equal(en(true), 1);
  assert.equal(en(false), 0);
});

test('repetir efectos: partículas y sonidos válidos sí, nombres raros o argumentos malos no rompen nada', () => {
  const { game, remote, calls } = juegoRemoto();
  remote.start();
  let hit = 0;
  game.particles.hit = () => hit++;
  game.sfx = { shot: () => calls.sfx.push('shot'), hit() {} };
  remote.replay(['p', 'hit', [1, 2]]);
  remote.replay(['p', 'constructor', []]);
  remote.replay(['p', 'noExiste', []]);
  remote.replay(['s', 'shot', ['pistol']]);
  remote.replay(['s', 'boom', []]);
  remote.replay(['c', 'shake', [5, 10, 20]]);
  remote.replay(['g', 'banner', ['OLEADA', 'dos']]);
  remote.replay(['d', 'corpse', [{ type: 'normal', si: 0, x: 1, y: 2, r: 10, a: 0 }, 1, 2]]);
  remote.replay(['t', 'shot', [NaN, 0, 0]]);
  remote.replay('basura');
  remote.replay(['p', 'hit', 'no-es-lista']);
  assert.equal(hit, 1);
  assert.deepEqual(calls.sfx, ['shot']);
  assert.deepEqual(calls.shake, [[1, 10, 20]]);
  assert.deepEqual(calls.banner, [['OLEADA', 'dos']]);
});

test('NetStats da una lectura por segundo con fotos y fotogramas', () => {
  const s = new NetStats();
  for (let i = 0; i < 59; i++) assert.equal(s.tick(1 / 60), null);
  s.count();
  s.count();
  const r = s.tick(1 / 60 + 0.001);
  assert.equal(r.fps, 60);
  assert.equal(r.per, 2);
  assert.equal(s.tick(0.1), null);
});

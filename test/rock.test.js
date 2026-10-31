// Rocoso (ZOMBIES.rock y ROCK): cuándo sale, qué hace con cada barricada, árboles y coches, y el agarre.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENTS, ROCK, SHOP, WAVES } from '../js/core/config.ts';
import { Structures } from '../js/sim/build.ts';
import { waveCounts } from '../js/sim/director.ts';
import { Player } from '../js/sim/player.ts';
import { World } from '../js/sim/world.ts';
import { Horde } from '../js/sim/zombies.ts';
import { fakeGame, silent } from './helpers.js';

// Una partida mínima con el mundo, la horda y las barricadas de verdad.
function partida() {
  const world = new World(777);
  const horde = new Horde();
  const structures = new Structures();
  const player = new Player(world.spawn.x, world.spawn.y);
  const killed = [];
  const game = fakeGame({
    world,
    horde,
    structures,
    player,
    particles: silent,
    camera: silent,
    decals: silent,
    time: 0,
    state: 'play',
    hurtFlash: 0,
    hitZombie: () => {},
    killZombie: (z) => {
      z.dead = true;
      killed.push(z);
    },
    onZombieHit: () => {},
    onGiantStep: () => {},
    onSuperPunch: () => {},
    onPlayerDeath: () => {},
  });
  return { world, horde, structures, player, game, killed };
}

// Pone una barricada de verdad (registrada en el mundo) en (x, y).
function pieza(game, kind, x, y, w = SHOP[kind].w, h = SHOP[kind].h) {
  const hp = SHOP[kind].hp;
  const o = { k: 0, x, y, w, h, low: true, block: true, kind, hp, max: hp, hitT: 0, cd: 0, ang: 0, owner: null };
  game.structures.blocks.push(o);
  game.world.addDynamic(o);
  return o;
}

function rocoso(t, x, y) {
  const z = t.horde.spawn('rock', x, y, 1, 1);
  z.spawnT = 0;
  return z;
}

test('salen desde la oleada 5, pocos, y crecen; en la estampida no', () => {
  const m = WAVES.count;
  for (let w = 1; w < ROCK.from; w++) assert.equal(waveCounts(w, m, null).rock, 0, `oleada ${w}`);
  assert.equal(waveCounts(ROCK.from, m, null).rock, 1);
  assert.ok(waveCounts(20, m, null).rock > waveCounts(10, m, null).rock);
  assert.equal(waveCounts(20, m, EVENTS.types.stampede).rock, 0);
});

test('un árbol destrozado deja de estorbar, se pinta como escombros y se aplica igual en otro mundo', () => {
  const t = partida();
  const o = t.world.obstacles.find((q) => q.smash === 'tree');
  assert.ok(t.world.pointBlocked(o.x, o.y, 2));
  assert.ok(t.world.smash(o));
  assert.ok(!t.world.pointBlocked(o.x, o.y, 2));
  assert.ok(o.op.gone && o.op.kind === 'addTree' && t.world.trees[o.tree].gone);
  assert.equal(t.world.smash(o), false, 'ya no estaba');
  // el cliente en línea genera el mismo mapa y aplica la lista que manda el servidor
  const otro = new World(777);
  otro.applySmashed(t.world.smashed);
  otro.applySmashed(t.world.smashed);
  assert.deepEqual(otro.smashed, t.world.smashed);
  assert.ok(!otro.pointBlocked(o.x, o.y, 2));
});

test('madera aplastada, metal abollado y lanzado, valla empujada hasta romperse', () => {
  const t = partida();
  const { x, y } = t.world.spawn;
  const z = rocoso(t, x + 200, y);
  // madera: desaparece al primer toque
  const wood = pieza(t.game, 'wood', x + 240, y - 20);
  t.horde.rockImpact(z, true, wood, null, t.game);
  assert.ok(!t.structures.blocks.includes(wood));
  // metal: pierde la mitad de su vida y sale volando (si hay sitio)
  z.bs = 'walk';
  const metal = pieza(t.game, 'metal', x + 240, y - 20);
  const mx = metal.x;
  t.horde.rockImpact(z, true, metal, null, t.game);
  assert.equal(metal.hp, SHOP.metal.hp * (1 - ROCK.dent));
  assert.equal(metal.x - mx, ROCK.throw);
  // valla: la empuja y la va quebrando
  t.structures.crush(t.game, metal);
  z.bs = 'walk';
  const fence = pieza(t.game, 'fence', x + 240, y - 40, 24, 80);
  const fx = fence.x;
  t.horde.rockImpact(z, true, fence, null, t.game);
  assert.equal(z.bs, 'push');
  for (let i = 0; i < 60; i++) t.horde.rockThink(z, t.player, 999, 1 / 60, t.game);
  assert.ok(fence.x > fx, 'la movió');
  assert.ok(fence.hp < SHOP.fence.hp - ROCK.pushDps * 0.5, `la quebranta (${fence.hp})`);
});

test('concreto: embestida corta de 200; HESCO y concreto reforzado: se aleja y pega 400', () => {
  const t = partida();
  const { x, y } = t.world.spawn;
  const z = rocoso(t, x + 200, y);
  for (const [kind, hit, long] of [
    ['concrete', ROCK.shortHit, false],
    ['hesco', ROCK.longHit, true],
  ]) {
    z.bs = 'walk';
    const b = pieza(t.game, kind, x + 240, y - 20);
    t.horde.rockImpact(z, true, b, null, t.game);
    assert.equal(z.bs, 'ram');
    assert.equal(!!z.ramLong, long);
    z.bs = 'ramIn';
    t.horde.rockImpact(z, true, b, null, t.game);
    assert.equal(b.hp, SHOP[kind].hp - hit, kind);
    t.structures.crush(t.game, b);
  }
  // el reforzado aguanta su 10 %
  z.bs = 'walk';
  const r = pieza(t.game, 'reinforced', x + 240, y - 20);
  t.horde.rockImpact(z, true, r, null, t.game);
  assert.ok(z.ramLong);
  z.bs = 'ramIn';
  t.horde.rockImpact(z, true, r, null, t.game);
  assert.equal(r.hp, SHOP.reinforced.hp - ROCK.longHit * (1 - SHOP.reinforced.armor));
});

test('te agarra, te quita 50 y te lanza hacia la horda: los zombis que tocas mueren', () => {
  const t = partida();
  const p = t.player;
  const z = rocoso(t, p.x + z0r(), p.y);
  // mirándote (si no, te sostiene de lado y vuelas por encima de la fila)
  z.angle = Math.PI;
  // una fila de normales a la izquierda (lejos del rocoso): ahí es donde te lanza
  const fila = [];
  for (let i = 0; i < 6; i++) {
    const n = t.horde.spawn('normal', p.x - 50 - i * 26, p.y, 1, 0.001);
    n.spawnT = 0;
    fila.push(n);
  }
  const hp = p.hp;
  for (let i = 0; i < 90 && !(p.flungT > 0); i++) {
    t.horde.update(1 / 60, t.game);
    t.game.time += 1 / 60;
  }
  assert.equal(p.hp, hp - ROCK.grab.hit);
  assert.ok(p.kx < -1000, `sale disparado hacia la horda (${Math.round(p.kx)})`);
  // vuela (Player.move mueve con el empujón) y arrolla a los de la fila
  for (let i = 0; i < 40; i++) {
    p.move(1 / 60, 0, 0, false, t.game);
    t.horde.update(1 / 60, t.game);
  }
  assert.ok(t.killed.filter((q) => fila.includes(q)).length >= 3, `mató a ${t.killed.length}`);
  assert.ok(z.grabCd > 0, 'tarda en volver a agarrar');
});

function z0r() {
  return 26 + 14 + 6;
}

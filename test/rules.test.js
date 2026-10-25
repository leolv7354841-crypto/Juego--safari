// Reglas de combate compartidas (js/sim/rules.js): las usan el juego local y el servidor.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOUNTY, GOLDEN, MONEY_LOSS, xpForLevel } from '../js/core/config.js';
import { ACID } from '../js/sim/build.js';
import { CoopGuest, CoopHost, Solo } from '../js/net/mode.js';
import * as Rules from '../js/sim/rules.js';
import { bullet, fakeGame, silent, zombie } from './helpers.js';

// Un juego mínimo con lo que toca la baja de un zombi, y ganchos que anotan lo que pasa.
function mundo(extra = {}) {
  const calls = { drops: [], toasts: [], gold: [], bounty: [], xp: [], shake: 0, blast: 0, rockets: 0 };
  const game = fakeGame({
    state: 'play',
    mode: new Solo(null),
    player: { weapons: [{}, {}] },
    camera: { shake: () => calls.shake++ },
    pickups: { drop: (k) => calls.drops.push(k) },
    structures: {
      queueDeathBlast: () => calls.blast++,
      stickRocket: () => calls.rockets++,
      explode: () => calls.blast++,
    },
    ...extra,
  });
  game.decals.corpse = () => {};
  game.particles = silent;
  const hooks = {
    kills: {},
    xp: (z) => calls.xp.push(z.type),
    bounty: (z) => calls.bounty.push(z.type),
    golden: (_z, n) => calls.gold.push(n),
    toast: (m) => calls.toasts.push(m),
  };
  return { game, calls, hooks };
}

function muerto(type, extra = {}) {
  return { ...zombie(type, 0), def: { xp: 5 }, x: 10, y: 10, r: 12, dead: false, burn: 0, ...extra };
}

test('gainXp sube de nivel y deja el sobrante', () => {
  const h = { xp: 0, xpNeed: xpForLevel(1), level: 1 };
  assert.equal(Rules.gainXp(h, 1), 0);
  assert.equal(h.xp, 1);
  const subidos = Rules.gainXp(h, 100000);
  assert.ok(subidos >= 2);
  assert.equal(h.level, 1 + subidos);
  assert.ok(h.xp < h.xpNeed);
});

test('hitLoss nunca cobra más dinero del que hay', () => {
  assert.equal(Rules.hitLoss(0), 0);
  for (let i = 0; i < 50; i++) {
    const n = Rules.hitLoss(3);
    assert.ok(n >= 0 && n <= 3);
  }
  for (let i = 0; i < 50; i++) {
    const n = Rules.hitLoss(10000);
    assert.ok(n >= MONEY_LOSS.min && n <= MONEY_LOSS.max);
  }
});

test('goldenReward cae dentro del rango y bountyOf conoce todos los tipos', () => {
  for (let i = 0; i < 50; i++) {
    const n = Rules.goldenReward();
    assert.ok(n >= GOLDEN.rewardMin && n <= GOLDEN.rewardMax);
  }
  assert.equal(Rules.bountyOf('normal'), BOUNTY.normal);
  assert.equal(Rules.bountyOf('no-existe'), 0);
});

test('killZombie cuenta la baja, paga y reparte experiencia una sola vez', () => {
  const { game, calls, hooks } = mundo();
  const z = muerto('normal', { burn: 1 });
  assert.equal(Rules.killZombie(game, z, hooks), true);
  assert.equal(z.dead, true);
  assert.equal(z.burnt, true);
  assert.equal(hooks.kills.normal, 1);
  assert.deepEqual(calls.bounty, ['normal']);
  assert.deepEqual(calls.xp, ['normal']);
  // matar dos veces al mismo zombi no cuenta otra baja
  assert.equal(Rules.killZombie(game, z, hooks), false);
  assert.equal(hooks.kills.normal, 1);
  assert.equal(calls.bounty.length, 1);
});

test('en el menú los zombis no pagan ni revientan', () => {
  const { game, calls, hooks } = mundo({ state: 'menu' });
  Rules.killZombie(game, muerto('fat'), hooks);
  Rules.killZombie(game, muerto('golden'), hooks);
  assert.deepEqual(calls.bounty, []);
  assert.deepEqual(calls.gold, []);
  assert.equal(calls.blast, 0);
  // la experiencia sí se cuenta
  assert.equal(calls.xp.length, 2);
});

test('el gordo revienta en ácido y el dorado paga su recompensa', () => {
  const { game, calls, hooks } = mundo();
  Rules.killZombie(game, muerto('fat'), hooks);
  assert.equal(calls.blast, 1);
  Rules.killZombie(game, muerto('golden'), hooks);
  assert.equal(calls.gold.length, 1);
  assert.ok(calls.gold[0] >= GOLDEN.rewardMin && calls.gold[0] <= GOLDEN.rewardMax);
});

test('el gigante deja caja y botiquín, sacude la cámara y avisa', () => {
  const { game, calls, hooks } = mundo();
  Rules.killZombie(game, muerto('giant'), hooks);
  assert.deepEqual(calls.drops, ['crate', 'med']);
  assert.equal(calls.shake, 1);
  assert.deepEqual(calls.toasts, ['Gigante abatido']);
});

test('sin armas de repuesto ni cooperativo no cae munición', () => {
  const { game, calls, hooks } = mundo({ player: { weapons: [{}] } });
  const antes = Math.random;
  Math.random = () => 0; // la tirada más baja: caería munición si hubiera con qué usarla
  try {
    Rules.killZombie(game, muerto('normal'), hooks);
  } finally {
    Math.random = antes;
  }
  assert.ok(!calls.drops.includes('ammo'));
  // con cooperativo sí
  const w = mundo({ player: { weapons: [{}] }, mode: new CoopHost(null) });
  Math.random = () => 0;
  try {
    Rules.killZombie(w.game, muerto('normal'), w.hooks);
  } finally {
    Math.random = antes;
  }
  assert.ok(w.calls.drops.includes('ammo'));
});

test('hitZombie aplica el daño, cuenta el acierto una vez y avisa si murió', () => {
  const { game } = mundo();
  const z = zombie('normal', 20);
  z.dead = false;
  const b = bullet({ dmg: 15, owner: 'a', shot: { hit: false } });
  let aciertos = 0;
  assert.equal(
    Rules.hitZombie(game, z, b, 0, 0, () => aciertos++),
    false,
  );
  assert.equal(z.lastOwner, 'a');
  assert.equal(aciertos, 1);
  // otra bala del mismo disparo (perdigón) no suma otro acierto
  assert.equal(
    Rules.hitZombie(game, z, b, 0, 0, () => aciertos++),
    true,
  );
  assert.equal(aciertos, 1);
  z.dead = true;
  assert.equal(
    Rules.hitZombie(game, z, b, 0, 0, () => aciertos++),
    false,
  );
});

test('canBurn: no en el menú, ni muerto, ni en el robot, ni con impulso', () => {
  const g = { state: 'play' };
  const p = { alive: true, inRobot: false, boostT: 0 };
  assert.equal(Rules.canBurn(g, p), true);
  assert.equal(Rules.canBurn({ state: 'menu' }, p), false);
  assert.equal(Rules.canBurn(g, { ...p, alive: false }), false);
  assert.equal(Rules.canBurn(g, { ...p, inRobot: true }), false);
  assert.equal(Rules.canBurn(g, { ...p, boostT: 1 }), false);
});

test('el ácido quita vida fija cada segundo y se apaga solo', () => {
  const { game } = mundo();
  const p = { x: 0, y: 0, hp: 100, alive: true, damageTaken: 0, hurtT: 0 };
  const h = { acidT: 0, acidTick: 5 };
  Rules.startAcid(h);
  assert.equal(h.acidT, ACID.burn);
  assert.equal(h.acidTick, 0);
  let ticks = 0;
  let muertes = 0;
  // medio segundo: aún no hay daño
  h.acidT = Rules.acidStep(
    game,
    p,
    h,
    0.5,
    () => ticks++,
    () => muertes++,
  );
  assert.equal(p.hp, 100);
  assert.equal(h.acidT, ACID.burn - 0.5);
  // otro medio segundo: primer golpe
  h.acidT = Rules.acidStep(
    game,
    p,
    h,
    0.5,
    () => ticks++,
    () => muertes++,
  );
  assert.equal(p.hp, 100 - ACID.dps);
  assert.equal(p.damageTaken, ACID.dps);
  assert.equal(ticks, 1);
  assert.equal(muertes, 0);
});

test('el ácido puede matar y entonces avisa una vez y se apaga', () => {
  const { game } = mundo();
  const p = { x: 0, y: 0, hp: 1, alive: true, damageTaken: 0, hurtT: 0 };
  const h = { acidT: ACID.burn, acidTick: 0 };
  let muertes = 0;
  const resto = Rules.acidStep(
    game,
    p,
    h,
    1,
    () => {},
    () => muertes++,
  );
  assert.equal(p.alive, false);
  assert.equal(p.hp, 0);
  assert.equal(muertes, 1);
  assert.equal(resto, 0);
});

test('los cohetes no explotan en quien solo mira (invitado o cliente en línea)', () => {
  const { game, calls } = mundo({ mode: new CoopGuest(null) });
  Rules.rocketBlast(game, 0, 0);
  Rules.rocketHit(game, muerto('fat'), 0, 0, bullet());
  assert.equal(calls.blast, 0);
  assert.equal(calls.rockets, 0);
});

test('el cohete se clava en gordos y super blindados y estalla en el resto', () => {
  const { game, calls } = mundo();
  Rules.rocketHit(game, muerto('fat'), 0, 0, bullet());
  Rules.rocketHit(game, muerto('heavy'), 0, 0, bullet());
  assert.equal(calls.rockets, 2);
  assert.equal(calls.blast, 0);
  Rules.rocketHit(game, muerto('normal'), 0, 0, bullet());
  assert.equal(calls.blast, 1);
  // un gordo ya muerto no se lleva el cohete clavado
  Rules.rocketHit(game, muerto('fat', { dead: true }), 0, 0, bullet());
  assert.equal(calls.rockets, 2);
  assert.equal(calls.blast, 2);
});

test('robotHit aguanta golpes y, al romperse, explota y expulsa al piloto', () => {
  const { game, calls } = mundo();
  const sale = [];
  const rb = {
    x: 1,
    y: 2,
    hp: 10,
    damage(n) {
      this.hp -= n;
      return this.hp <= 0;
    },
    leave: (p) => sale.push(p),
  };
  const p = { piloto: true };
  game.world = {};
  assert.equal(Rules.robotHit(game, rb, 4, p), false);
  assert.equal(calls.blast, 0);
  assert.equal(Rules.robotHit(game, rb, 20, p), true);
  assert.equal(calls.blast, 1);
  assert.deepEqual(sale, [p]);
  assert.equal(rb.hp, 0);
});

test('goldenTick espera, y no hace aparecer un segundo dorado', () => {
  const game = fakeGame({ horde: { list: [{ type: 'golden', dead: false }] } });
  assert.equal(
    Rules.goldenTick(game, 10, 1, () => {}),
    9,
  );
  // vencido el reloj con uno vivo: reintenta en 5 s
  assert.equal(
    Rules.goldenTick(game, 0.5, 1, () => assert.fail('no debe avisar')),
    5,
  );
});

// Pruebas de la simulación autoritativa sin red (ServerSim).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServerSim } from '../src/sim/ServerSim.ts';
import { IN_FIRE } from '../../js/net/protocol.ts';
import { PEER_N, WORLD_KEYS, ZOMBIE_N } from '../../js/net/snapshot.ts';
import { ABILITY, BOUNTY, COMBO, HEAVY, PLAYER_BASE, WEAPONS } from '../../js/core/config.ts';
import { UPGRADES } from '../../js/sim/upgrades.ts';
import { cooldownOf } from '../../js/sim/abilities.ts';
import { comboBreak, comboMult } from '../../js/sim/combo.ts';
import { WALK } from '../../js/sim/player.ts';
import { cleanAct, cleanClass } from '../src/validate.ts';

const aimAt = (sim: ServerSim, id: string) => {
  const p = sim.slots.get(id)!.p;
  const z = sim.horde.findTarget(p.x, p.y, 600, null);
  return z ? Math.atan2(z.y - p.y, z.x - p.x) : 0;
};

test('disparar según la entrada mata zombis y la baja es de quien disparó', () => {
  const sim = new ServerSim(42, [
    { id: 'a', idx: 1, name: 'Ana' },
    { id: 'b', idx: 2, name: 'Beto' },
  ]);
  let seq = 0;
  for (let i = 0; i < 60 * 12; i++) {
    sim.push('a', [{ s: ++seq, mx: 0, my: 0, f: IN_FIRE, a: aimAt(sim, 'a'), w: -1 }]);
    sim.step();
  }
  const a = sim.slots.get('a')!;
  const b = sim.slots.get('b')!;
  assert.ok(a.p.shotsFired > 10, 'disparó');
  assert.ok(a.kills > 0, 'mató zombis');
  assert.equal(b.kills, 0, 'Beto no disparó: sin bajas');
  assert.equal(sim.totalKills(), a.kills);
});

test('la cadencia la decide el servidor aunque lleguen muchas entradas', () => {
  const sim = new ServerSim(7, [{ id: 'a', idx: 1, name: 'Ana' }]);
  // 60 entradas por segundo con disparo durante 2 s: la pistola no puede pasar de su cadencia
  let seq = 0;
  for (let i = 0; i < 120; i++) {
    sim.push('a', [{ s: ++seq, mx: 0, my: 0, f: IN_FIRE, a: 0, w: -1 }]);
    sim.step();
  }
  const p = sim.slots.get('a')!.p;
  const rate = p.weapon.def.rate;
  assert.ok(p.shotsFired <= Math.ceil(rate * 2) + 1, `disparos ${p.shotsFired} con cadencia ${rate}/s`);
});

test('sin entradas el jugador no sigue caminando solo', () => {
  const sim = new ServerSim(9, [{ id: 'a', idx: 1, name: 'Ana' }]);
  sim.push('a', [{ s: 1, mx: 1, my: 0, f: 0, a: 0, w: -1 }]);
  for (let i = 0; i < 60; i++) sim.step();
  const p = sim.slots.get('a')!.p;
  const x = p.x;
  for (let i = 0; i < 60; i++) sim.step();
  assert.ok(Math.abs(p.x - x) < 2, `se quedó quieto (${(p.x - x).toFixed(2)} px)`);
});

test('una entrada no puede mover más rápido que el juego', () => {
  const sim = new ServerSim(11, [{ id: 'a', idx: 1, name: 'Ana' }]);
  const p = sim.slots.get('a')!.p;
  const x0 = p.x;
  const y0 = p.y;
  let seq = 0;
  // dirección enorme (ya recortada por la validación a longitud 1) y corriendo
  for (let i = 0; i < 60; i++) {
    sim.push('a', [{ s: ++seq, mx: 1, my: 0, f: 1, a: 0, w: -1 }]);
    sim.step();
  }
  const moved = Math.hypot(p.x - x0, p.y - y0);
  assert.ok(moved < WALK * PLAYER_BASE.runMult * 1.05, `avanzó ${moved.toFixed(1)} px en 1 s`);
});

test('las bajas dan dinero a quien disparó y los zombis heridos mandan su vida', () => {
  const sim = new ServerSim(42, [{ id: 'a', idx: 1, name: 'Ana' }]);
  let seq = 0;
  for (let i = 0; i < 60 * 12; i++) {
    sim.push('a', [{ s: ++seq, mx: 0, my: 0, f: IN_FIRE, a: aimAt(sim, 'a'), w: -1 }]);
    sim.step();
  }
  const a = sim.slots.get('a')!;
  assert.ok(a.kills > 0, 'mató zombis');
  // (los golpes que recibió le quitan dinero: se comprueba la recompensa de una baja suelta, sin racha)
  comboBreak(a.p.combo);
  const m0 = a.money;
  const z = sim.horde.list.find((o: any) => o.type === 'normal' && !o.dead);
  z.lastOwner = 'a';
  sim.killZombie(z);
  assert.equal(a.money, m0 + BOUNTY.normal, 'la baja le da dinero a quien disparó');
  assert.equal(sim.snapshot('a', 0)!.st[7], a.money, 'el dinero va en la foto');
  // un gordo herido cerca: su vida en % va en zh para dibujar la barra
  const p = a.p;
  sim.horde.spawn('fat', p.x + 120, p.y, 1, 1);
  const fat = sim.horde.list[sim.horde.list.length - 1];
  fat.hp = fat.maxHp * 0.4;
  const zh = sim.snapshot('a', 0)!.zh;
  const i = zh.indexOf(fat.id);
  assert.ok(i >= 0 && i % 2 === 0, 'el gordo herido está en zh');
  assert.equal(zh[i + 1], 40);
});

test('cada jugador elige sus mejoras (también a mitad de oleada) y compra con su propio dinero', () => {
  const sim = new ServerSim(5, [
    { id: 'a', idx: 1, name: 'Ana' },
    { id: 'b', idx: 2, name: 'Beto' },
  ]);
  const a = sim.slots.get('a')!;
  const b = sim.slots.get('b')!;
  // una baja de Ana: experiencia para los dos, dinero sólo para ella
  const z = sim.horde.spawn('normal', a.p.x + 300, a.p.y, 1, 1) || sim.horde.list[sim.horde.list.length - 1];
  z.lastOwner = 'a';
  sim.killZombie(z);
  assert.ok(a.money > 0, 'Ana cobra la baja');
  assert.equal(b.money, 0, 'Beto no cobra');
  assert.equal(a.xp, b.xp, 'la experiencia es del equipo');
  // sube de nivel en plena oleada: las mejoras se ofrecen ya (la partida no espera a nadie)
  sim.addXp(a, a.xpNeed);
  assert.equal(a.pending, 1);
  sim.director.state = 'active';
  sim.offerUpgrades();
  assert.ok(a.choices.length > 0, 'hay mejoras para elegir');
  assert.ok(sim.snapshot('a', 0).up, 'llegan en la foto');
  assert.equal(sim.pick('a', 0, a.choiceN + 1), false, 'una tanda vieja o falsa no vale');
  const before = JSON.stringify(a.p.stats) + a.p.weapons.length + a.p.hp;
  assert.ok(sim.pick('a', 0, a.choiceN));
  assert.equal(a.pending, 0);
  assert.notEqual(JSON.stringify(a.p.stats) + a.p.weapons.length + a.p.hp, before, 'la mejora se aplicó');
  assert.ok(!sim.snapshot('a', 0).up, 'sin más mejoras pendientes');
  // tienda: sin dinero no compra; con dinero sí, y sólo entre oleadas
  assert.equal(sim.shop('b', 'gun', 'smg', 0), false);
  b.money = 10000;
  sim.director.state = 'active';
  assert.equal(sim.shop('b', 'gun', 'shotgun', 0), false, 'en plena oleada no se compra');
  sim.director.state = 'waiting';
  assert.ok(sim.shop('b', 'gun', 'shotgun', 0));
  assert.ok(b.p.has('shotgun'));
  const w = b.p.weapons.find((x: any) => x.id === 'shotgun');
  const res = w.reserve;
  assert.ok(sim.shop('b', 'ammo', 'shotgun', 10));
  assert.ok(w.reserve > res, 'compró munición');
  assert.equal(sim.shop('b', 'ammo', 'shotgun', 7), false, 'cantidad no permitida');
  assert.ok(sim.shop('b', 'sell', 'shotgun', 0));
  assert.ok(!b.p.has('shotgun'));
  assert.equal(sim.shop('b', 'sell', 'smg', 0), false, 'el arma inicial no se vende');
  assert.equal(sim.shop('b', 'gun', '__proto__', 0), false);
  assert.equal(sim.snapshot('b', 0).st[7], b.money, 'el dinero va en la foto');
});

// Avanza la simulación con el jugador quieto mirando a "a" (la entrada lleva el ángulo).
function idle(sim: ServerSim, id: string, seq: { n: number }, steps: number, a = 0) {
  for (let i = 0; i < steps; i++) {
    sim.push(id, [{ s: ++seq.n, mx: 0, my: 0, f: 0, a, w: -1 }]);
    sim.step();
  }
}

test('construcción, granadas y molotovs: se compran entre oleadas y se usan cuando sea', () => {
  const sim = new ServerSim(5, [{ id: 'a', idx: 1, name: 'Ana' }]);
  const a = sim.slots.get('a')!;
  const seq = { n: 0 };
  idle(sim, 'a', seq, 2);
  a.money = 1000;
  sim.director.state = 'active';
  assert.equal(sim.shop('a', 'item', 'wood', 0), false, 'en plena oleada no se compra');
  sim.director.state = 'waiting';
  assert.ok(sim.shop('a', 'item', 'wood', 0));
  assert.ok(sim.shop('a', 'item', 'grenade', 0));
  assert.ok(sim.shop('a', 'item', 'mine', 0));
  assert.equal(sim.shop('a', 'item', '__proto__', 0), false);
  assert.equal(a.money, 1000 - 10 - 90 - 45);
  assert.deepEqual(sim.snapshot('a', 0)!.iv.slice(0, 1), [1], 'el inventario va en la foto');
  // construir: se hace en el paso de la entrada indicada, delante de donde mira
  sim.director.state = 'active';
  sim.act('a', { s: seq.n + 1, k: 'build', kind: 'wood', tx: 0, ty: 0 });
  assert.equal(sim.structures.blocks.length, 0, 'todavía no llega su entrada');
  idle(sim, 'a', seq, 1);
  assert.equal(sim.structures.blocks.length, 1, 'bloque colocado');
  assert.equal(a.inv.wood, 0);
  assert.equal(sim.structures.blocks[0].owner, 'a');
  assert.ok(sim.snapshot('a', 0)!.blk.length === 1, 'las barricadas van en la foto');
  // sin más bloques no construye
  sim.act('a', { s: seq.n + 1, k: 'build', kind: 'wood', tx: 0, ty: 0 });
  idle(sim, 'a', seq, 1);
  assert.equal(sim.structures.blocks.length, 1);
  // granada: sale volando hacia el objetivo y explota
  const p = a.p;
  sim.act('a', { s: seq.n + 1, k: 'throw', kind: 'grenade', tx: p.x, ty: p.y + 200 });
  idle(sim, 'a', seq, 1);
  assert.equal(sim.structures.grenades.length, 1, 'granada en el aire');
  assert.equal(a.inv.grenade, 0);
  assert.ok(sim.snapshot('a', 0)!.gr.length === 6, 'la granada va en la foto');
  idle(sim, 'a', seq, 90);
  assert.equal(sim.structures.grenades.length, 0, 'explotó');
  assert.ok(sim.structures.scorches.length > 0, 'dejó la marca');
});

test('torreta: el disparo va como efecto y su bala no viaja en la foto', () => {
  const sim = new ServerSim(5, [{ id: 'a', idx: 1, name: 'Ana' }]);
  const a = sim.slots.get('a')!;
  const seq = { n: 0 };
  idle(sim, 'a', seq, 2);
  a.money = 1000;
  sim.director.state = 'waiting';
  assert.ok(sim.shop('a', 'item', 'turret', 0));
  sim.director.state = 'active';
  // delante de donde mira: se prueba hacia varios lados hasta que quepa
  for (let k = 0; k < 8 && !sim.structures.blocks.length; k++) {
    idle(sim, 'a', seq, 1, (k * Math.PI) / 4);
    sim.act('a', { s: seq.n + 1, k: 'build', kind: 'turret', tx: 0, ty: 0 });
    idle(sim, 'a', seq, 1, (k * Math.PI) / 4);
  }
  const t = sim.structures.blocks[0];
  assert.equal(t?.kind, 'turret');
  // un zombi a tiro, en un sitio libre del mapa
  for (let k = 0; k < 16; k++) {
    const x = t.x + 20 + Math.cos(k) * 160;
    const y = t.y + 20 + Math.sin(k) * 160;
    if (!sim.world.pointBlocked(x, y, 12)) {
      sim.horde.spawn('normal', x, y).spawnT = 0;
      break;
    }
  }
  let shot: unknown;
  for (let i = 0; i < 60 * 30 && !shot; i++) {
    sim.flushFx();
    idle(sim, 'a', seq, 1);
    shot = sim.fx.find((f) => f.e[0] === 't');
  }
  assert.ok(shot, 'la torreta disparó');
  assert.ok(
    sim.bullets.list.some((b: any) => b.turret),
    'la bala existe en el servidor',
  );
  const snap = sim.snapshot('a', 0)!;
  assert.ok(
    snap.fx.some((e: any) => e[0] === 't' && e[1] === 'shot'),
    'el dueño también recibe el disparo',
  );
  assert.equal(snap.b.length, 0, 'la bala de la torreta no va en la foto');
});

test('robot: se compra, se sube y aguanta los golpes por el piloto', () => {
  const sim = new ServerSim(5, [{ id: 'a', idx: 1, name: 'Ana' }]);
  const a = sim.slots.get('a')!;
  const seq = { n: 0 };
  idle(sim, 'a', seq, 2);
  a.money = 13000;
  sim.director.state = 'waiting';
  assert.ok(sim.shop('a', 'robot', 'buy', 0));
  assert.equal(sim.shop('a', 'robot', 'buy', 0), false, 'sólo uno');
  assert.ok(a.robot.owned);
  sim.act('a', { s: seq.n + 1, k: 'robot', kind: '', tx: 0, ty: 0 });
  idle(sim, 'a', seq, 1);
  assert.ok(a.p.inRobot, 'subió');
  const snap = sim.snapshot('a', 0)!;
  assert.equal(snap.st[9], 1, 'la foto dice que va en el robot');
  assert.equal(snap.rb.length, 8);
  const hp = a.p.hp;
  a.p.hurt(50, sim.game);
  assert.equal(a.p.hp, hp, 'el piloto no pierde vida');
  assert.equal(a.robot.hp, 10000 - 50);
  sim.onZombieHit(a.p);
  assert.equal(a.money, 3000, 'dentro del robot los golpes no cuestan dinero');
  assert.ok(sim.shop('a', 'robot', 'repair', 0));
  assert.equal(a.robot.hp, 10000);
  sim.act('a', { s: seq.n + 1, k: 'robot', kind: '', tx: 0, ty: 0 });
  idle(sim, 'a', seq, 1);
  assert.ok(!a.p.inRobot, 'bajó');
  sim.onZombieHit(a.p);
  assert.ok(a.money < 3000 - 10 && sim.snapshot('a', 0)!.ml > 0, 'fuera del robot el golpe cuesta dinero y se avisa');
});

test('el gordo revienta en ácido que quema, y los cohetes estallan', () => {
  const sim = new ServerSim(5, [{ id: 'a', idx: 1, name: 'Ana' }]);
  const a = sim.slots.get('a')!;
  const seq = { n: 0 };
  idle(sim, 'a', seq, 2);
  const p = a.p;
  sim.horde.spawn('fat', p.x + 40, p.y, 1, 1);
  const fat = sim.horde.list[sim.horde.list.length - 1];
  sim.killZombie(fat);
  // sin el botiquín que pudo soltar (curaría lo que quema el ácido)
  sim.pickups.list.length = 0;
  idle(sim, 'a', seq, 10);
  assert.ok(a.acidT > 0, 'le cayó ácido');
  assert.ok(sim.snapshot('a', 0)!.st[8] > 0, 'la foto lo dice');
  const hp = p.hp;
  idle(sim, 'a', seq, 70);
  assert.ok(p.hp < hp, 'el ácido quema');
  // un cohete contra un normal estalla y mata a los de alrededor
  sim.horde.list.length = 0;
  for (let i = 0; i < 3; i++) sim.horde.spawn('normal', p.x + 300 + i * 20, p.y, 1, 1);
  // un paso para que entren en la rejilla que usan las explosiones
  idle(sim, 'a', seq, 1);
  const z = sim.horde.list[0];
  z.lastOwner = 'a';
  sim.game.rocketHit(z, z.x, z.y, { owner: 'a', dx: 1, dy: 0 });
  assert.ok(
    sim.horde.list.every((o: any) => o.dead || o.hp < o.maxHp),
    'la explosión los alcanzó',
  );
  assert.ok(a.kills > 0, 'las bajas son de quien disparó');
});

test('clases: la del lobby, la espera de 60 s y la mejora que la baja hasta 20 s', () => {
  const sim = new ServerSim(5, [
    { id: 'a', idx: 1, name: 'Ana', cls: 'booster' },
    { id: 'b', idx: 2, name: 'Beto', cls: 'trampa' },
  ]);
  const a = sim.slots.get('a')!;
  assert.equal(a.p.cls, 'booster');
  assert.equal(sim.slots.get('b')!.p.cls, 'bomber', 'clase no válida: la de por defecto');
  assert.equal(cleanClass('berserker'), 'berserker');
  assert.equal(cleanClass('x'), '');
  assert.ok(cleanAct({ s: 3, k: 'ab', tx: 10, ty: 20 }));
  assert.equal(cleanAct({ s: 3, k: 'ab', tx: 'a', ty: 20 }), null);
  const seq = { n: 0 };
  idle(sim, 'a', seq, 2);
  sim.act('a', { s: seq.n + 1, k: 'ab', kind: '', tx: 0, ty: 0 });
  idle(sim, 'a', seq, 1);
  assert.ok(a.p.boostT > 0, 'impulso activo');
  assert.ok(Math.abs(a.p.abCd - ABILITY.cooldown) < 0.1, 'espera de 60 s');
  assert.equal(sim.snapshot('a', 0)!.ab[0], 2, 'la foto lleva la clase');
  // mientras espera no se puede volver a usar
  a.p.boostT = 0;
  sim.act('a', { s: seq.n + 1, k: 'ab', kind: '', tx: 0, ty: 0 });
  idle(sim, 'a', seq, 1);
  assert.equal(a.p.boostT, 0, 'en espera: no hace nada');
  const up = UPGRADES.find((u: any) => u.id === 'abcd')!;
  let n = 0;
  while (up.when!(a.p) && n < 20) {
    up.apply(a.p);
    n++;
  }
  assert.equal(n, 7, '7 mejoras de -15%');
  assert.equal(cooldownOf(a.p), ABILITY.minCooldown, 'nunca menos de 20 s');
});

test('booster: inmune, sin perder dinero y 3 veces más rápido', () => {
  const sim = new ServerSim(5, [{ id: 'a', idx: 1, name: 'Ana', cls: 'booster' }]);
  const a = sim.slots.get('a')!;
  const p = a.p;
  const seq = { n: 0 };
  idle(sim, 'a', seq, 2);
  const run = (steps: number) => {
    for (let i = 0; i < steps; i++) {
      sim.push('a', [{ s: ++seq.n, mx: 0, my: 1, f: 0, a: 0, w: -1 }]);
      sim.step();
    }
  };
  const y0 = p.y;
  run(20);
  const slow = Math.abs(p.y - y0);
  sim.act('a', { s: seq.n + 1, k: 'ab', kind: '', tx: 0, ty: 0 });
  idle(sim, 'a', seq, 1);
  a.money = 100;
  const hp = p.hp;
  p.hurt(50, sim.game);
  sim.onZombieHit(p);
  sim.applyAcid(p);
  assert.equal(p.hp, hp, 'no le hacen daño');
  assert.equal(a.money, 100, 'no pierde dinero');
  assert.equal(a.acidT, 0, 'ni le cae ácido');
  const y1 = p.y;
  run(20);
  const fast = Math.abs(p.y - y1);
  // contra paredes puede frenarse: basta con que sea claramente más rápido
  assert.ok(fast > slow * 1.8 || fast > 200, `más rápido (${slow.toFixed(0)} → ${fast.toFixed(0)})`);
  idle(sim, 'a', seq, 60 * ABILITY.booster.time);
  assert.equal(p.boostT, 0, 'se acaba a los 2 s');
  p.hurt(10, sim.game);
  assert.ok(p.hp < hp, 'después vuelve a recibir daño');
});

test('bomber: el misil cae donde apunta y arrasa en su radio; berserker: tres cargadores en 3 s', () => {
  const sim = new ServerSim(5, [
    { id: 'a', idx: 1, name: 'Ana', cls: 'bomber' },
    { id: 'b', idx: 2, name: 'Beto', cls: 'berserker' },
  ]);
  const a = sim.slots.get('a')!;
  const p = a.p;
  const seq = { n: 0 };
  const seqB = { n: 0 };
  idle(sim, 'a', seq, 2);
  sim.horde.list.length = 0;
  const tx = p.x + 400;
  const ty = p.y;
  for (let i = 0; i < 5; i++) sim.horde.spawn('swat', tx - 250 + i * 100, ty, 1, 1);
  sim.act('a', { s: seq.n + 1, k: 'ab', kind: '', tx, ty });
  idle(sim, 'a', seq, 1);
  assert.equal(sim.structures.missiles.length, 1, 'misil en el aire');
  assert.ok(Array.isArray(sim.snapshot('a', 0)!.ms) && sim.snapshot('a', 0)!.ms.length === 4, 'la foto lo lleva');
  idle(sim, 'a', seq, Math.ceil(60 * ABILITY.bomber.fall) + 2);
  assert.equal(sim.structures.missiles.length, 0, 'cayó');
  assert.ok(a.kills >= 4, `mató a los SWAT del radio (${a.kills})`);
  // berserker: unas 300 balas en 3 s sin gastar su munición
  const b = sim.slots.get('b')!;
  idle(sim, 'b', seqB, 1);
  const mag = b.p.weapon.mag;
  sim.act('b', { s: seqB.n + 1, k: 'ab', kind: '', tx: 0, ty: 0 });
  idle(sim, 'b', seqB, 60 * ABILITY.berserker.time + 5);
  assert.equal(b.p.rageT, 0);
  assert.equal(b.p.weapon.mag, mag, 'no gasta su cargador');
  assert.ok(b.p.rageShots >= 299 && b.p.rageShots <= 300, `balas: ${b.p.rageShots}`);
});

test('torreta pesada: se compra con sus balas, se monta y dispara en línea', () => {
  const sim = new ServerSim(5, [
    { id: 'a', idx: 1, name: 'Ana' },
    { id: 'b', idx: 2, name: 'Beto' },
  ]);
  const a = sim.slots.get('a')!;
  const seq = { n: 0 };
  idle(sim, 'a', seq, 2);
  a.money = 20000;
  sim.director.state = 'waiting';
  assert.ok(sim.shop('a', 'item', 'heavy', 0));
  assert.ok(sim.shop('a', 'heavy', 'ammo', 1));
  assert.equal(sim.shop('a', 'heavy', 'ammo', 7), false, 'cantidad no permitida');
  assert.equal(a.p.heavyAmmo, 100);
  assert.equal(a.money, 20000 - 15000 - 200);
  sim.director.state = 'active';
  for (let k = 0; k < 8 && !sim.structures.blocks.length; k++) {
    idle(sim, 'a', seq, 1, (k * Math.PI) / 4);
    sim.act('a', { s: seq.n + 1, k: 'build', kind: 'heavy', tx: 0, ty: 0 });
    idle(sim, 'a', seq, 1, (k * Math.PI) / 4);
  }
  const t = sim.structures.blocks[0];
  assert.equal(t?.kind, 'heavy');
  // montar (E): el jugador queda detrás del cañón
  sim.act('a', { s: seq.n + 1, k: 'robot', kind: '', tx: 0, ty: 0 });
  idle(sim, 'a', seq, 1, t.ang);
  assert.equal(a.p.manned, t, 'montada');
  const snap = sim.snapshot('a', 0)!;
  assert.deepEqual(snap.st.slice(10, 13), [100, t.x, t.y], 'balas y torreta propia en la foto');
  assert.deepEqual(
    sim.snapshot('b', 0)!.hv.slice(0, 4),
    [t.x, t.y, Math.round(t.ang * 100), 1],
    'los demás ven quién la maneja',
  );
  // disparar: gasta sus balas y las balas son de quien la maneja
  const before = sim.bullets.list.length;
  sim.push('a', [{ s: ++seq.n, mx: 0, my: 0, f: IN_FIRE, a: t.ang, w: -1 }]);
  sim.step();
  assert.equal(a.p.heavyAmmo, 99);
  const shot = sim.bullets.list[before];
  assert.equal(shot.owner, 'a');
  assert.equal(shot.blast, true, 'balas explosivas');
  // no camina mientras la maneja
  const x = a.p.x;
  for (let i = 0; i < 20; i++) {
    sim.push('a', [{ s: ++seq.n, mx: 1, my: 0, f: 0, a: t.ang, w: -1 }]);
    sim.step();
  }
  assert.ok(Math.abs(a.p.x - x) < 1, 'quieto en la torreta');
  // bajarse y volver a subir; al caer, la suelta
  sim.act('a', { s: seq.n + 1, k: 'robot', kind: '', tx: 0, ty: 0 });
  idle(sim, 'a', seq, 1, t.ang);
  assert.equal(a.p.manned, null, 'se bajó');
  assert.equal(t.manned, null);
  sim.act('a', { s: seq.n + 1, k: 'robot', kind: '', tx: 0, ty: 0 });
  idle(sim, 'a', seq, 1, t.ang);
  assert.equal(a.p.manned, t);
  a.p.alive = false;
  sim.onPlayerDeath();
  assert.equal(t.manned, null, 'libre al caer');
});

test('la foto del servidor lleva la parte del mundo común con el cooperativo, y el jugador de otro entra con el mismo tamaño', () => {
  const sim = new ServerSim(5, [
    { id: 'a', idx: 1, name: 'Ana' },
    { id: 'b', idx: 2, name: 'Beto' },
  ]);
  for (let i = 0; i < 30; i++) sim.step();
  const snap = sim.snapshot('a', 0)!;
  for (const k of WORLD_KEYS) assert.ok(k in snap, `falta ${k}`);
  assert.equal(snap.pl.length, PEER_N, 'un solo compañero');
  assert.equal(snap.pl[0], 2, 'el compañero es Beto (idx 2)');
  assert.ok(snap.z.length % ZOMBIE_N === 0);
  // lo propio de cada jugador sigue ahí (el cooperativo no lo manda)
  for (const k of ['me', 'st', 'wp', 'ec', 'ps', 'iv', 'ab']) assert.ok(k in snap, `falta ${k}`);
});

test('la racha es de quien mata: multiplica su dinero, la corta un golpe y va en su foto', () => {
  const sim = new ServerSim(5, [
    { id: 'a', idx: 1, name: 'Ana' },
    { id: 'b', idx: 2, name: 'Beto' },
  ]);
  const a = sim.slots.get('a')!;
  const b = sim.slots.get('b')!;
  const kill = () => {
    const z = sim.horde.spawn('normal', a.p.x + 300, a.p.y, 1, 1) || sim.horde.list[sim.horde.list.length - 1];
    z.lastOwner = 'a';
    sim.killZombie(z);
  };
  const [n1, m1] = COMBO.tiers[0];
  for (let i = 0; i < n1 - 1; i++) kill();
  assert.equal(a.money, BOUNTY.normal * (n1 - 1), 'sin multiplicador antes del primer nivel');
  const m0 = a.money;
  kill();
  assert.equal(a.money, m0 + Math.round(BOUNTY.normal * m1), 'la baja que llega al nivel cobra ×' + m1);
  assert.equal(b.p.combo.n, 0, 'la racha no es del equipo');
  assert.deepEqual(sim.snapshot('a', 0)!.cb, [n1, COMBO.window * 10]);
  sim.onZombieHit(a.p);
  assert.equal(a.p.combo.n, 0, 'un golpe la corta');
  assert.equal(a.p.combo.best, n1);
  // el reloj corre con la simulación
  kill();
  for (let i = 0; i < Math.ceil((COMBO.window * 60) / 1) + 2; i++) sim.step();
  assert.equal(a.p.combo.n, 0, 'sin bajas se acaba');
  assert.equal(comboMult(a.p.combo.best), m1);
});

test('la horda apretando contra un cerco de barricadas no lo atraviesa', () => {
  const sim = new ServerSim(5, [{ id: 'a', idx: 1, name: 'Ana' }]);
  const p = sim.slots.get('a')!.p;
  p.hurt = () => {};
  sim.director.state = 'waiting';
  sim.director.queue.length = 0;
  sim.horde.list.length = 0;
  // cerco cerrado de sacos terreros (que no se rompen) con el jugador en medio
  const S = 140;
  const T = 24;
  const cx = Math.round(p.x);
  const cy = Math.round(p.y);
  const wall = (x: number, y: number, w: number, h: number) => {
    const o = { k: 0, x, y, w, h, low: true, block: true, kind: 'sandbag', hp: 1e9, max: 1e9, hitT: 0, cd: 0, ang: 0 };
    sim.structures.blocks.push(o);
    sim.world.addDynamic(o);
  };
  for (let x = cx - S - T; x < cx + S + T; x += 80) {
    wall(x, cy - S - T, Math.min(80, cx + S + T - x), T);
    wall(x, cy + S, Math.min(80, cx + S + T - x), T);
  }
  for (let y = cy - S; y < cy + S; y += 80) {
    wall(cx - S - T, y, T, Math.min(80, cy + S - y));
    wall(cx + S, y, T, Math.min(80, cy + S - y));
  }
  // 300 zombis alrededor (con gordos y toros, que embisten y lanzan a los demás)
  const types = ['normal', 'normal', 'normal', 'fat', 'normal', 'sprinter', 'normal', 'normal', 'bull', 'normal'];
  for (let i = 0, n = 0; n < 300 && i < 5000; i++) {
    const a = (i * 2.399) % (Math.PI * 2);
    const d = 200 + ((i * 37) % 260);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    if (Math.abs(x - cx) < S + T + 20 && Math.abs(y - cy) < S + T + 20) continue;
    if (sim.world.pointBlocked(x, y, 16)) continue;
    sim.horde.spawn(types[n % types.length], x, y, 1, 1.3);
    n++;
  }
  const inside = () => sim.horde.list.filter((z: any) => Math.abs(z.x - cx) < S && Math.abs(z.y - cy) < S).length;
  let most = 0;
  for (let i = 0; i < 60 * 15; i++) {
    sim.step();
    most = Math.max(most, inside());
  }
  assert.ok(sim.horde.list.length > 250, 'la horda sigue ahí');
  assert.equal(most, 0, 'ningún zombi entró al cerco');
});

test('torreta pesada: cada bala estalla en el primer zombi y daña a los de alrededor', () => {
  const sim = new ServerSim(5, [
    { id: 'a', idx: 1, name: 'Ana' },
    { id: 'b', idx: 2, name: 'Beto' },
  ]);
  const a = sim.slots.get('a')!;
  sim.director.state = 'waiting';
  sim.director.queue.length = 0;
  sim.horde.list.length = 0;
  // un grupito apretado a 200 px a la derecha del jugador (en un sitio libre)
  const p = a.p;
  let cx = p.x + 200;
  let cy = p.y;
  for (let k = 0; k < 40 && sim.world.pointBlocked(cx, cy, 40); k++) {
    cx = p.x + 200 * Math.cos(k * 0.6);
    cy = p.y + 200 * Math.sin(k * 0.6);
  }
  const group = [
    [0, 0],
    [24, 0],
    [0, 24],
    [-24, 0],
    [0, -24],
  ].map(([dx, dy]) => sim.horde.spawn('swat', cx + dx, cy + dy, 1, 1) || sim.horde.list[sim.horde.list.length - 1]);
  const hp = group.map((z: any) => z.hp);
  // (la cuadrícula de búsqueda la arma la horda en cada paso)
  sim.horde.grid.clear();
  for (const z of sim.horde.list) sim.horde.grid.insert(z);
  const ang = Math.atan2(cy - p.y, cx - p.x);
  const d = WEAPONS.heavy;
  sim.bullets.spawn({
    x: p.x,
    y: p.y,
    dx: Math.cos(ang),
    dy: Math.sin(ang),
    speed: d.speed,
    life: d.range,
    dmg: d.damage,
    pierce: d.pierce,
    knock: d.knock,
    shot: null,
    hits: null,
    rocket: false,
    blast: true,
    owner: 'a',
  });
  sim.flushFx();
  for (let i = 0; i < 30 && sim.bullets.list.length; i++) sim.bullets.update(1 / 60, sim.game);
  assert.equal(sim.bullets.list.length, 0, 'la bala estalló y no siguió');
  const hurt = group.filter((z: any, i: number) => z.hp < hp[i]).length;
  assert.ok(hurt >= 4, `la explosión daña a los de alrededor (${hurt} de 5)`);
  const most = Math.max(...group.map((z: any, i: number) => hp[i] - z.hp));
  assert.ok(most >= d.damage, 'el del impacto recibe la bala y la explosión');
  assert.ok(most <= d.damage + HEAVY.blastPower + 1, 'una microexplosión, no una granada');
  // los demás jugadores ven y oyen la microexplosión
  const fx = sim.snapshot('b', 0)!.fx || [];
  assert.ok(
    fx.some((e: any) => e[1] === 'miniBlast'),
    'chispazo',
  );
  assert.ok(
    fx.some((e: any) => e[1] === 'miniBoom'),
    'sonido',
  );
  // las bajas de la explosión son de quien disparó
  const m0 = a.money;
  for (const z of group as any[]) z.hp = 1;
  sim.game.heavyBlast(cx, cy, 'a');
  assert.ok(a.money > m0, 'la explosión paga a quien disparó');
});

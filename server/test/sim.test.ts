// Pruebas de la simulación autoritativa sin red (ServerSim).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServerSim } from '../src/sim/ServerSim.ts';
import { IN_FIRE } from '../../js/netcode.js';

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
  assert.ok(moved < 118 * 1.75 * 1.05, `avanzó ${moved.toFixed(1)} px en 1 s`);
});

test('las bajas dan dinero a quien disparó y los zombis heridos mandan su vida', () => {
  const sim = new ServerSim(42, [{ id: 'a', idx: 1, name: 'Ana' }]);
  let seq = 0;
  for (let i = 0; i < 60 * 12; i++) {
    sim.push('a', [{ s: ++seq, mx: 0, my: 0, f: IN_FIRE, a: aimAt(sim, 'a'), w: -1 }]);
    sim.step();
  }
  const a = sim.slots.get('a')!;
  assert.ok(a.kills > 0 && a.money > 0, 'ganó dinero');
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
  assert.equal(sim.shop('b', 'sell', 'pistol', 0), false, 'la pistola no se vende');
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

test('robot: se compra, se sube y aguanta los golpes por el piloto', () => {
  const sim = new ServerSim(5, [{ id: 'a', idx: 1, name: 'Ana' }]);
  const a = sim.slots.get('a')!;
  const seq = { n: 0 };
  idle(sim, 'a', seq, 2);
  a.money = 5000;
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
  assert.equal(a.money, 2000, 'dentro del robot los golpes no cuestan dinero');
  assert.ok(sim.shop('a', 'robot', 'repair', 0));
  assert.equal(a.robot.hp, 10000);
  sim.act('a', { s: seq.n + 1, k: 'robot', kind: '', tx: 0, ty: 0 });
  idle(sim, 'a', seq, 1);
  assert.ok(!a.p.inRobot, 'bajó');
  sim.onZombieHit(a.p);
  assert.ok(a.money < 2000 - 10 && sim.snapshot('a', 0)!.ml > 0, 'fuera del robot el golpe cuesta dinero y se avisa');
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

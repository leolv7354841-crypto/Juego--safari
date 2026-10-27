import assert from 'node:assert/strict';
import { test } from 'node:test';
import { World } from '../js/sim/world.js';
import './helpers.js';

// Huella del terreno: recorre una rejilla y anota qué puntos y rectángulos están bloqueados.
function fingerprint(w) {
  let bits = '';
  for (let y = -400; y <= 400; y += 40) {
    for (let x = -400; x <= 400; x += 40) {
      const px = w.spawn.x + x;
      const py = w.spawn.y + y;
      bits += w.pointBlocked(px, py, 12) ? '1' : '0';
      bits += w.pointBlocked(px, py, 0, true) ? '1' : '0';
      bits += w.rectFree(px, py, 20, 20) ? '1' : '0';
    }
  }
  return bits;
}

test('misma semilla, mismo mundo', () => {
  assert.equal(fingerprint(new World(777)), fingerprint(new World(777)));
});

test('semillas distintas dan mundos distintos', () => {
  assert.notEqual(fingerprint(new World(777)), fingerprint(new World(778)));
});

test('el punto de aparición está libre', () => {
  const w = new World(777);
  assert.ok(!w.pointBlocked(w.spawn.x, w.spawn.y, 12));
});

test('pointBlocked y rectFree son puros: repetir no cambia la respuesta', () => {
  const w = new World(4242);
  const a = fingerprint(w);
  assert.equal(fingerprint(w), a);
});

test('hay obstáculos y hay espacio libre', () => {
  const f = fingerprint(new World(777));
  assert.ok(f.includes('1'));
  assert.ok(f.includes('0'));
});

// Un saco terrero (80×24) junto al punto de aparición, que está libre.
function sandbag() {
  const w = new World(777);
  const o = { k: 0, x: w.spawn.x - 40, y: w.spawn.y - 12, w: 80, h: 24, low: true, block: true };
  w.addDynamic(o);
  return { w, o };
}

test('un empujón que mete al zombi en el muro lo devuelve al lado por el que entró', () => {
  const { w, o } = sandbag();
  const r = 13;
  // apoyado arriba del saco y empujado 30 px hacia abajo: el centro pasa la mitad del muro (12 px)
  const z = { x: o.x + 30, y: o.y - r + 30 };
  assert.ok(w.collide(z, r, false, o.x + 30, o.y - r));
  assert.equal(z.y, o.y - r, 'sigue arriba');
  assert.equal(w.lastBlock, o);
  // sin saber de dónde venía sale por el lado más cercano: el de abajo (el error de antes)
  const ciego = { x: o.x + 30, y: o.y - r + 30 };
  w.collide(ciego, r);
  assert.ok(ciego.y > o.y + o.h, 'sin la posición anterior lo atraviesa');
});

test('un salto que cruza el muro entero (embestida, explosión) tampoco lo atraviesa', () => {
  const { w, o } = sandbag();
  const r = 13;
  const z = { x: o.x + 50, y: o.y + o.h + 60 };
  w.collide(z, r, false, o.x + 10, o.y - 80);
  assert.equal(z.y, o.y - r, 'queda del lado de donde venía');
  assert.ok(z.x > o.x + 10 && z.x < o.x + 50, 'donde tocó el muro');
  // quien camina pegado al muro sin meterse no se mueve
  const p = { x: o.x + 30, y: o.y - r };
  assert.equal(w.collide(p, r, false, o.x + 20, o.y - r), false);
  assert.equal(p.y, o.y - r);
});

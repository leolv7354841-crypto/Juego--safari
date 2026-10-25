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

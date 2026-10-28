// El servidor ejecuta js/core, js/sim y parte de js/net sin navegador: nada de eso puede
// necesitar `document` ni importar dibujo (js/render) o sonido/interfaz (js/ui).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const JS = fileURLToPath(new URL('../js/', import.meta.url));
const DEL_SERVIDOR = [
  ...['core', 'sim'].flatMap((d) => readdirSync(join(JS, d)).map((f) => `${d}/${f}`)),
  'net/protocol.ts',
  'net/netcode.ts',
].filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));

test('hay módulos que revisar', () => {
  assert.ok(DEL_SERVIDOR.length > 15);
});

test('el entorno de la prueba no tiene document ni window', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof window, 'undefined');
});

for (const f of DEL_SERVIDOR) {
  test(`${f} carga en Node sin document`, async () => {
    const mod = await import(pathToFileURL(join(JS, f)).href);
    assert.ok(Object.keys(mod).length > 0 || f.endsWith('version.ts'));
  });

  test(`${f} no importa render ni ui`, () => {
    const texto = readFileSync(join(JS, f), 'utf8');
    const malos = [...texto.matchAll(/from\s+['"]([^'"]+)['"]/g)]
      .map((m) => m[1])
      .filter((r) => /(^|\/)(render|ui)\//.test(r) || /\/(sprites|audio|music|particles|lighting)\.js$/.test(r));
    assert.deepEqual(malos, []);
  });
}

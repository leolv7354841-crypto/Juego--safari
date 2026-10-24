// Build de Vercel (vercel.json → buildCommand): sella la versión y copia a dist/ sólo lo que
// necesita el navegador. Así lo publicado nunca queda sin sellar aunque se olvide el stamp
// antes del commit, y el servidor, la documentación y los scripts no quedan públicos.
//   node tools/build.mjs      (luego, para probar: npx http-server dist)
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

await import('./stamp.mjs');

const root = fileURLToPath(new URL('..', import.meta.url));
const out = root + 'dist/';
const GAME = ['index.html', 'manifest.webmanifest', 'css', 'js', 'assets'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of GAME) cpSync(root + f, out + f, { recursive: true });
console.log('dist/ listo:', GAME.join(', '));

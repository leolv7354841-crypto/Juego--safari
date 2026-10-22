// Sella index.html con la versión actual del código para que los navegadores y los CDN
// (por ejemplo raw.githack.com) no sirvan archivos viejos: cada módulo se pide con ?v=<hash>
// mediante un import map, y el menú muestra la versión. Ejecutar antes de cada commit:
//   node tools/stamp.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const mods = readdirSync(root + 'js').filter((f) => f.endsWith('.js')).sort();
const h = createHash('sha1');
for (const f of mods) h.update(readFileSync(root + 'js/' + f));
h.update(readFileSync(root + 'css/style.css'));
const v = h.digest('hex').slice(0, 8);

let html = readFileSync(root + 'index.html', 'utf8');
const map = { imports: Object.fromEntries(mods.map((f) => [`./js/${f}`, `./js/${f}?v=${v}`])) };
const block = `<!-- version:start -->\n  <script type="importmap">${JSON.stringify(map)}</script>\n  <!-- version:end -->`;
html = html.replace(/<!-- version:start -->[\s\S]*?<!-- version:end -->/, block);
html = html.replace(/href="css\/style\.css(\?v=[^"]*)?"/, `href="css/style.css?v=${v}"`);
html = html.replace(/src="js\/main\.js(\?v=[^"]*)?"/, `src="js/main.js?v=${v}"`);
html = html.replace(/<span id="ver">[^<]*<\/span>/, `<span id="ver">Versión ${v}</span>`);
writeFileSync(root + 'index.html', html);
console.log('versión', v);

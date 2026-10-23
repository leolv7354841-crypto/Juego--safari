// Sella index.html con la versión del código: cada módulo se pide con ?v=<hash> mediante un
// import map, así raw.githack.com y los navegadores no sirven archivos viejos tras cada push.
// Ejecutar antes de cada commit:  node hipersonic/tools/stamp.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const walk = (dir) => readdirSync(root + dir).flatMap((f) => (statSync(root + dir + f).isDirectory() ? walk(dir + f + '/') : f.endsWith('.js') ? [dir + f] : []));
const mods = walk('js/').sort();
const h = createHash('sha1');
for (const f of mods) h.update(readFileSync(root + f));
h.update(readFileSync(root + 'css/style.css'));
const v = h.digest('hex').slice(0, 8);

let html = readFileSync(root + 'index.html', 'utf8');
const map = { imports: Object.fromEntries(mods.map((f) => [`./${f}`, `./${f}?v=${v}`])) };
const block = `<!-- version:start -->\n  <script type="importmap">${JSON.stringify(map)}</script>\n  <!-- version:end -->`;
if (html.includes('<!-- version:start -->')) html = html.replace(/<!-- version:start -->[\s\S]*?<!-- version:end -->/, block);
else html = html.replace('<link rel="stylesheet" href="css/style.css', block + '\n  <link rel="stylesheet" href="css/style.css');
html = html.replace(/href="css\/style\.css(\?v=[^"]*)?"/, `href="css/style.css?v=${v}"`);
html = html.replace(/src="js\/main\.js(\?v=[^"]*)?"/, `src="js/main.js?v=${v}"`);
html = html.replace(/<span id="ver">[^<]*<\/span>/, `<span id="ver">Versión ${v}</span>`);
writeFileSync(root + 'index.html', html);
console.log('versión', v);

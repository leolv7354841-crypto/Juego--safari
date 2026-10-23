// Sella index.html con la versión actual del código para que los navegadores y los CDN
// (por ejemplo raw.githack.com) no sirvan archivos viejos:
//  - cada módulo se pide con ?v=<hash> mediante un import map que arma un pequeño cargador;
//  - js/version.js guarda el mismo hash: si al abrir no coincide con el de la página (un CDN
//    entregó un archivo viejo), el juego se recarga solo pidiendo todo de nuevo (&b=...).
// Ejecutar antes de cada commit:  node tools/stamp.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const mods = readdirSync(root + 'js').filter((f) => f.endsWith('.js')).sort();
const h = createHash('sha1');
for (const f of mods) if (f !== 'version.js') h.update(readFileSync(root + 'js/' + f));
h.update(readFileSync(root + 'css/style.css'));
const v = h.digest('hex').slice(0, 8);

writeFileSync(root + 'js/version.js', `// Generado por tools/stamp.mjs: versión del código (sirve para detectar archivos viejos en caché).\nexport const VERSION = '${v}';\n`);

let html = readFileSync(root + 'index.html', 'utf8');
const loader = `<!-- version:start -->
  <script id="dz-loader">
    (function () {
      var v = '${v}';
      var b = '';
      try {
        b = new URLSearchParams(location.search).get('b') || '';
      } catch (e) {}
      var q = '?v=' + v + (b ? '&b=' + encodeURIComponent(b) : '');
      var mods = ${JSON.stringify(mods)};
      var map = { imports: {} };
      mods.forEach(function (f) {
        map.imports['./js/' + f] = './js/' + f + q;
      });
      var im = document.createElement('script');
      im.type = 'importmap';
      im.textContent = JSON.stringify(map);
      document.currentScript.after(im);
      window.DZ_VERSION = v;
      window.DZ_QUERY = q;
    })();
  </script>
  <!-- version:end -->`;
html = html.replace(/<!-- version:start -->[\s\S]*?<!-- version:end -->/, loader);
html = html.replace(/href="css\/style\.css(\?v=[^"]*)?"/, `href="css/style.css?v=${v}"`);
html = html.replace(/<script type="module" src="js\/main\.js[^"]*"><\/script>|<script id="dz-main">[\s\S]*?<\/script>/, `<script id="dz-main">
    (function () {
      var s = document.createElement('script');
      s.type = 'module';
      s.src = 'js/main.js' + (window.DZ_QUERY || '');
      document.body.appendChild(s);
    })();
  </script>`);
html = html.replace(/<span id="ver">[^<]*<\/span>/, `<span id="ver">Versión ${v}</span>`);
writeFileSync(root + 'index.html', html);
console.log('versión', v);

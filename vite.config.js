import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

// Hash del código del juego: sirve para avisar de una versión nueva (version.json) sin sellar a mano.
const hashCodigo = () => {
  const h = createHash('sha1');
  const texto = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  for (const f of readdirSync('js', { recursive: true })
    .map((n) => n.split('\\').join('/'))
    .filter((n) => n.endsWith('.js'))
    .sort())
    h.update(texto(`js/${f}`));
  h.update(texto('css/style.css'));
  return h.digest('hex').slice(0, 8);
};
const VERSION = hashCodigo();

export default defineConfig({
  // relativo: el juego se sirve en yeyo.games/deadzone/ y en la raíz del dominio de Vercel
  base: './',
  define: { __DZ_VERSION__: JSON.stringify(VERSION) },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 8080, strictPort: true },
  preview: { port: 4173, host: '127.0.0.1', strictPort: true },
  plugins: [
    {
      name: 'dz-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION }) });
      },
    },
  ],
});

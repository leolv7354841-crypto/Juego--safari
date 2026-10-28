// Revisa que ningún módulo llame a algo que ya no existe (en la Etapa 5 se perdieron setAcid y updateAcid así):
// cada `game.algo(` y cada `game.<objeto>.algo(` debe estar declarado en la clase que lo define.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const leer = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8').replace(/\r\n/g, '\n');

function archivos(dir, fuera = []) {
  const out = [];
  for (const n of readdirSync(join(RAIZ, dir))) {
    const ruta = `${dir}/${n}`;
    if (fuera.includes(n)) continue;
    if (statSync(join(RAIZ, ruta)).isDirectory()) out.push(...archivos(ruta, fuera));
    else if (/\.(js|ts)$/.test(n)) out.push(ruta);
  }
  return out;
}

// Nombres declarados en una clase: métodos, accesos, campos y `this.x =` (puede guardar una función).
function miembros(ruta, clase) {
  const src = leer(ruta);
  const ini = src.indexOf(`class ${clase}`);
  assert.ok(ini >= 0, `${ruta}: no hay class ${clase}`);
  const sig = src.indexOf('\nclass ', ini + 1);
  const cuerpo = src.slice(ini, sig < 0 ? undefined : sig);
  const set = new Set();
  for (const m of cuerpo.matchAll(/^ {2}(?:static )?(?:async )?(?:get |set )?([\w$]+)\s*(?:\(|=)/gm)) set.add(m[1]);
  for (const m of cuerpo.matchAll(/this\.([\w$]+)\s*=/g)) set.add(m[1]);
  // herencia simple (class A extends B en el mismo archivo)
  const pad = cuerpo.match(/^class \w+ extends (\w+)/);
  if (pad && src.includes(`class ${pad[1]}`)) for (const n of miembros(ruta, pad[1])) set.add(n);
  return set;
}

// Objeto del juego -> archivo y clase que lo define
const OBJETOS = {
  online: ['js/net/online.ts', 'Online'],
  mode: ['js/net/mode.ts', 'Mode'],
  structures: ['js/sim/build.ts', 'Structures'],
  horde: ['js/sim/zombies.ts', 'Horde'],
  bullets: ['js/sim/bullets.ts', 'Bullets'],
  director: ['js/sim/director.ts', 'Director'],
  pickups: ['js/sim/pickups.ts', 'Pickups'],
  robot: ['js/sim/robot.ts', 'Robot'],
  world: ['js/sim/world.ts', 'World'],
  particles: ['js/render/particles.js', 'Particles'],
  decals: ['js/render/particles.js', 'Decals'],
  camera: ['js/render/camera.js', 'Camera'],
  lighting: ['js/render/lighting.js', 'Lighting'],
  accounts: ['js/ui/accounts.js', 'Accounts'],
  music: ['js/ui/music.js', 'Music'],
  input: ['js/ui/input.js', 'Input'],
};

const JS = archivos('js', ['vendor']);

// En online.js el juego se llama también `g`.
const recibe = (ruta) => (/net\/online\.(js|ts)$/.test(ruta) ? '(?:this\\.game|game|g)' : '(?:this\\.game|game)');

test('todo game.algo( existe en la clase Game', () => {
  const game = miembros('js/main.js', 'Game');
  // ganchos que sólo existen en el servidor (los módulos de simulación los llaman si están: ver ServerSim.ts)
  for (const m of leer('server/src/sim/ServerSim.ts').matchAll(/^ {6}(\w+): /gm)) game.add(m[1]);
  const faltan = [];
  for (const ruta of JS) {
    const re = new RegExp(`(?<![\\w$.])${recibe(ruta)}\\.([\\w$]+)\\(`, 'g');
    for (const m of leer(ruta).matchAll(re)) if (!game.has(m[1])) faltan.push(`${ruta}: game.${m[1]}(`);
  }
  assert.deepEqual([...new Set(faltan)], []);
});

test('todo game.<objeto>.algo( existe en la clase del objeto', () => {
  const tablas = Object.fromEntries(Object.entries(OBJETOS).map(([k, [ruta, c]]) => [k, miembros(ruta, c)]));
  const faltan = [];
  for (const ruta of JS) {
    const re = new RegExp(`(?<![\\w$.])${recibe(ruta)}\\.(${Object.keys(OBJETOS).join('|')})\\.([\\w$]+)\\(`, 'g');
    for (const m of leer(ruta).matchAll(re)) if (!tablas[m[1]].has(m[2])) faltan.push(`${ruta}: game.${m[1]}.${m[2]}(`);
  }
  assert.deepEqual([...new Set(faltan)], []);
});

test('los módulos no usan los campos viejos del modo ni nada del cooperativo P2P', () => {
  const viejos = /coop\.(isHost|isGuest)\b|\bcoopRun\b|\bremoteSim\b|\bgame\.coop\b|\bhostedPeer\b|\bcompanion\(/;
  const mal = [...JS, ...archivos('server/src')].filter((r) => viejos.test(leer(r)));
  assert.deepEqual(mal, []);
});

test('todo import relativo apunta a un archivo que existe', () => {
  const faltan = [];
  for (const ruta of [...JS, ...archivos('server/src')]) {
    for (const m of leer(ruta).matchAll(/(?:from|import)\s*\(?\s*'(\.{1,2}\/[^']+)'/g)) {
      // los tipos de JSDoc (import('../core/types.js')) no son archivos que se carguen
      if (/\/types(\.d)?\.(js|ts)$|\/types$/.test(m[1])) continue;
      try {
        statSync(join(RAIZ, ruta, '..', m[1]));
      } catch {
        faltan.push(`${ruta} -> ${m[1]}`);
      }
    }
  }
  assert.deepEqual(faltan, []);
});

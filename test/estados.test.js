// La máquina de estados (js/states.js) como tabla, y que Game (js/main.js) ofrezca lo que los
// módulos de simulación y de red esperan de `game` sin llamarse a sí mismo por error.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pause, resume, setState, STATES, stepState } from '../js/states.js';

const ESTADOS = [
  'menu',
  'play',
  'pause',
  'levelup',
  'shop',
  'turret',
  'over',
  'account',
  'board',
  'look',
  'online',
  'class',
];

// Un juego mínimo: pantallas falsas, música y entrada que anotan lo que les piden.
function juego(over = {}) {
  const pantallas = {};
  return {
    state: 'menu',
    root: { className: 'game state-menu touch' },
    music: {
      pausada: null,
      setPaused(v) {
        this.pausada = v;
      },
    },
    input: {
      resets: 0,
      reset() {
        this.resets++;
      },
      consume: () => 0,
    },
    sfx: { unlock() {} },
    mode: { step: () => false },
    last: 0,
    pantallas,
    $: (id) => {
      pantallas[id] ||= { hidden: false };
      return pantallas[id];
    },
    ...over,
  };
}

test('la tabla trae todos los estados del juego', () => {
  assert.deepEqual(Object.keys(STATES).sort(), [...ESTADOS].sort());
});

test('cada pantalla pertenece a un solo estado', () => {
  const ids = Object.values(STATES)
    .map((s) => s.screen)
    .filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 10);
});

test('setState enseña solo la pantalla del estado y pone su clase', () => {
  const g = juego();
  setState(g, 'shop');
  assert.equal(g.state, 'shop');
  assert.ok(g.root.className.split(' ').includes('state-shop'));
  assert.ok(!g.root.className.includes('state-menu'));
  assert.ok(g.root.className.split(' ').includes('touch'));
  for (const [id, el] of Object.entries(g.pantallas)) assert.equal(el.hidden, id !== 'screen-shop', id);
  // volver al menú las oculta todas
  setState(g, 'menu');
  for (const el of Object.values(g.pantallas)) assert.equal(el.hidden, true);
});

test('la música se pausa salvo en menú, partida, personaje y clase', () => {
  const g = juego();
  for (const e of ESTADOS) {
    setState(g, e);
    assert.equal(g.music.pausada, !['menu', 'play', 'look', 'class'].includes(e), e);
  }
});

test('un estado desconocido da error y no cambia nada', () => {
  const g = juego();
  assert.throws(() => setState(g, 'no-existe'), /desconocido/);
  assert.equal(g.state, 'menu');
});

test('pausa, mejoras y tienda detienen la entrada al entrar', () => {
  for (const e of ['pause', 'levelup', 'shop']) {
    const g = juego();
    setState(g, e);
    assert.equal(g.input.resets, 1, e);
  }
  const g = juego();
  setState(g, 'over');
  assert.equal(g.input.resets, 0);
});

test('exit se llama antes del cambio y enter después, con de dónde y a dónde', () => {
  const orden = [];
  const g = juego();
  const visto = { exit: STATES.menu.exit, enter: STATES.shop.enter };
  STATES.menu.exit = (game, to) => orden.push(['exit', game.state, to]);
  STATES.shop.enter = (game, from) => orden.push(['enter', game.state, from]);
  try {
    setState(g, 'shop');
  } finally {
    STATES.menu.exit = visto.exit;
    STATES.shop.enter = visto.enter;
  }
  assert.deepEqual(orden, [
    ['exit', 'menu', 'shop'],
    ['enter', 'shop', 'menu'],
  ]);
});

test('al salir del personaje se descarta el muñeco de la vista previa', () => {
  const g = juego({ state: 'look', lookDummy: {} });
  setState(g, 'menu');
  assert.equal(g.lookDummy, null);
});

test('pause solo desde la partida y resume solo desde la pausa', () => {
  const g = juego({ state: 'menu' });
  pause(g);
  assert.equal(g.state, 'menu');
  g.state = 'play';
  pause(g);
  assert.equal(g.state, 'pause');
  resume(g);
  assert.equal(g.state, 'play');
  assert.ok(g.last > 0);
  resume(g);
  assert.equal(g.state, 'play');
});

test('stepState ejecuta el update del estado actual', () => {
  const g = juego({ state: 'pause' });
  g.resume = () => resume(g);
  let consumidos = 0;
  g.input.consume = (k) => {
    consumidos++;
    return k === 'pause' ? 1 : 0;
  };
  // en pausa, la tecla de pausa reanuda
  stepState(g, 0.016);
  assert.equal(consumidos, 1);
  assert.equal(g.state, 'play');
  // los estados sin update no hacen nada
  g.state = 'over';
  stepState(g, 0.016);
  assert.equal(g.state, 'over');
});

test('si el modo avanza el fotograma (en línea) no corre la simulación local', () => {
  let guest = 0;
  const g = juego({ state: 'play', mode: { step: () => ++guest > 0 } });
  stepState(g, 0.016);
  assert.equal(guest, 1);
});

/* ---------- Game (main.js) ---------- */

const MAIN = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const TIPOS = readFileSync(new URL('../js/core/types.d.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('ningún acceso de Game se llama a sí mismo', () => {
  const campos = [...MAIN.matchAll(/^ {2}(\w+) = \(.*\) => .*$/gm)];
  assert.ok(campos.length > 20);
  for (const [linea, nombre] of campos) assert.ok(!linea.includes(`this.${nombre}(`), linea);
});

test('Game ofrece todo lo que GameHost promete', () => {
  const host = TIPOS.slice(TIPOS.indexOf('export interface GameHost'), TIPOS.indexOf('declare global'));
  const metodos = [...host.matchAll(/^ {2}(\w+)\(.*\): /gm)].map((m) => m[1]);
  assert.ok(metodos.length >= 12);
  const propios = new Set([
    ...[...MAIN.matchAll(/^ {2}(?:async |get )?(\w+)\(.*\) \{$/gm)].map((m) => m[1]),
    ...[...MAIN.matchAll(/^ {2}(\w+) = /gm)].map((m) => m[1]),
  ]);
  // collectFor es sólo del servidor (en solitario recoger es cosa de Pickups)
  for (const m of metodos.filter((n) => n !== 'collectFor')) assert.ok(propios.has(m), `Game no tiene ${m}`);
});

// Modo desarrollador: un panel con las cifras de la partida (zombis vivos, en pantalla y en cola, lo que
// trae cada ronda, FPS) y trampas (dinero, saltar rondas, invencible, zombis a pedir). Se activa con
// ?dev=1 en la dirección (queda guardado en este navegador; ?dev=0 lo quita) o tocando cinco veces el
// número de versión del menú; la tecla º / ` (la que está a la izquierda del 1) enseña u oculta el
// panel. Una partida en la que se usó una trampa queda marcada (game.devUsed) y no cuenta para récords.
import { GOLDEN, ROBOT, WEAPON_ORDER, WEAPONS, WORLD_SIZE, ZOMBIES } from '../core/config.ts';
import { clamp, rand, storage } from '../core/util.ts';
import * as Rules from '../sim/rules.ts';
import { closest } from './dom.js';

const KEY = 'dz-dev';
const SPEEDS = [0.25, 0.5, 1, 2, 3];
// estados en los que hay una partida sobre la que actuar
const RUN = new Set(['play', 'pause', 'shop', 'levelup']);
const NAMES = {
  normal: 'Normal',
  swat: 'SWAT',
  sprinter: 'Velocista',
  fat: 'Gordo',
  heavy: 'Super blindado',
  bull: 'Toro',
  giant: 'Gigante',
  golden: 'Dorado',
};
const STATE = { active: 'en curso', waiting: 'superada · esperando', break: 'por empezar' };

export const devEnabled = () => !!storage.get(KEY, false);

/** Cuenta de zombis por tipo (vivos de una lista o la cola del director) como texto corto. */
function byType(list) {
  const c = {};
  for (const t of list) c[t] = (c[t] || 0) + 1;
  return Object.keys(NAMES)
    .filter((t) => c[t])
    .map((t) => `${NAMES[t].toLowerCase()} ${c[t]}`)
    .join(' · ');
}

const countsText = (k) =>
  [
    ['normal', k.normal],
    ['swat', k.swat],
    ['sprinter', k.sprinter],
    ['fat', k.fat],
    ['heavy', k.heavy],
    ['bull', k.bull],
  ]
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${NAMES[t].toLowerCase()} ${n}`)
    .join(' · ');

export function setDevOn(game, on) {
  const d = game.dev;
  if (on) storage.set(KEY, true);
  else storage.remove(KEY);
  d.on = on;
  d.open = on;
  if (!on) {
    d.god = false;
    d.ammo = false;
    d.speed = 1;
  }
  game.$('dev').hidden = !on;
  game.toast(on ? 'Modo desarrollador activado' : 'Modo desarrollador desactivado');
}

// La tecla º / `: enseña u oculta el panel (sólo con el modo activado).
export function toggleDev(game) {
  const d = game.dev;
  if (!d.on) return;
  d.open = !d.open;
  game.$('dev').hidden = !d.open;
}

/* ---------- trampas ---------- */

function inRun(game) {
  if (!RUN.has(game.state) || !game.player) return (game.toast('Empieza una partida primero'), false);
  if (!game.mode.authority()) return (game.toast('En línea manda el servidor: el panel es sólo de lectura'), false);
  game.devUsed = true;
  return true;
}

function addMoney(game, n) {
  game.money += n;
  game.moneyEarned += n;
  game.moneyPop(`+$${n}`, 'gold');
  if (game.state === 'shop') game.renderShop();
  game.updateHud(false);
}

// Mata a todos los zombis de la ronda sin botín (el director la da por terminada en el siguiente
// fotograma y abre la tienda como siempre). Los dorados se van sin aviso.
function clearHorde(game, goldenToo) {
  for (const z of game.horde.list) {
    if (z.dead || (z.type === 'golden' && !goldenToo)) continue;
    z.dead = true;
    z.hp = 0;
  }
  game.horde.removeDead();
}

function endRound(game) {
  const d = game.director;
  if (d.state === 'break') {
    d.timer = 0;
    return;
  }
  if (d.state !== 'active') return game.toast('No hay ronda en curso');
  d.queue.length = 0;
  clearHorde(game, false);
  game.toast('Ronda terminada');
}

// Salta a la ronda n: la que esté en curso se descarta (sin tienda) y la n arranca ya.
function gotoWave(game, n) {
  const d = game.director;
  n = clamp(Math.round(n) || 1, 1, 999);
  d.queue.length = 0;
  clearHorde(game, true);
  d.event = '';
  d.lastEvent = '';
  d.state = 'waiting';
  d.wave = n - 1;
  game.shopPending = false;
  d.nextRound(game);
  game.updateHud(false);
}

function killAll(game) {
  let n = 0;
  for (const z of game.horde.list) {
    if (z.dead) continue;
    game.killZombie(z);
    n++;
  }
  game.horde.removeDead();
  game.updateHud(false);
  game.toast(`${n} zombis eliminados`);
}

// n zombis del tipo pedido justo fuera de la vista, con la vida y velocidad de la ronda actual.
function spawnZombies(game, type, n) {
  if (!ZOMBIES[type]) return;
  const d = game.director;
  const views = d.views(game);
  const r = ZOMBIES[type].radius;
  let made = 0;
  for (let t = 0; t < n * 10 && made < n; t++) {
    const c = d.edgePoint(game, rand(40, 140), views, false);
    if (c.x < 80 || c.y < 80 || c.x > WORLD_SIZE - 80 || c.y > WORLD_SIZE - 80) continue;
    if (game.world.pointBlocked(c.x, c.y, r + 2)) continue;
    game.horde.spawn(type, c.x, c.y, d.hpMult, d.speedMult);
    made++;
  }
  game.toast(`${made} × ${NAMES[type]}`);
}

function act(game, btn) {
  const d = game.dev;
  const a = btn.dataset.act;
  if (a === 'hide') return toggleDev(game);
  if (a === 'off') return setDevOn(game, false);
  if (!inRun(game)) return;
  const p = game.player;
  switch (a) {
    case 'money':
      return addMoney(game, Number(btn.dataset.n));
    case 'level':
      game.addXp(game.xpNeed - game.xp);
      return game.updateHud(false);
    case 'end':
      return endRound(game);
    case 'next':
      return gotoWave(game, game.director.wave + 1);
    case 'goto':
      return gotoWave(game, Number(game.$('dev-wave').value));
    case 'killall':
      return killAll(game);
    case 'spawn':
      return spawnZombies(game, game.$('dev-type').value, clamp(Number(game.$('dev-n').value) || 1, 1, 500));
    case 'golden':
      if (!Rules.spawnGolden(game, game.toast)) game.toast('No cupo el dorado: muévete a un sitio abierto');
      return;
    case 'god':
      d.god = !d.god;
      btn.classList.toggle('on', d.god);
      return;
    case 'ammo':
      d.ammo = !d.ammo;
      btn.classList.toggle('on', d.ammo);
      return;
    case 'speed': {
      d.speed = SPEEDS[(SPEEDS.indexOf(d.speed) + 1) % SPEEDS.length];
      btn.textContent = `Velocidad ×${d.speed}`;
      btn.classList.toggle('on', d.speed !== 1);
      return;
    }
    case 'guns':
      for (const id of WEAPON_ORDER) if (WEAPONS[id].price) p.unlock(id);
      game.updateHud(true);
      return game.toast('Todas las armas desbloqueadas');
    case 'robot':
      if (game.robot.owned) return game.toast('Ya tienes el robot');
      game.robot.deploy(p, game.world);
      return game.toast('Robot desplegado a tu lado');
    default:
  }
}

/* ---------- cada fotograma ---------- */

// Trampas continuas (invencible, munición) y, cuatro veces por segundo, el texto del panel.
// `raw` es el tiempo real del fotograma (sin tope ni velocidad del juego), para medir los FPS.
export function updateDev(game, raw) {
  const d = game.dev;
  if (!d.on) return;
  const p = game.player;
  if (p && RUN.has(game.state) && game.mode.authority()) {
    if (d.god) {
      p.hp = p.stats.maxHp;
      p.stamina = p.stats.maxStamina;
      if (game.acidT > 0) game.setAcid(0);
      if (game.robot.owned) game.robot.hp = ROBOT.hp;
    }
    if (d.ammo) {
      for (const w of p.weapons) w.mag = p.magSize(w.def);
      p.reloadT = 0;
      p.heavyAmmo = Math.max(p.heavyAmmo, 500);
    }
  }
  d.frames++;
  d.acc += raw;
  if (!d.open || d.acc < 0.25) return;
  d.fps = Math.round(d.frames / d.acc);
  d.ms = (d.acc / d.frames) * 1000;
  d.frames = 0;
  d.acc = 0;
  render(game);
}

function render(game) {
  const d = game.dev;
  const dir = game.director;
  const v = game.view;
  const ro = !game.mode.authority();
  game.$('dev').classList.toggle('ro', ro);
  const alive = [];
  let seen = 0;
  for (const z of game.horde.list) {
    if (z.dead) continue;
    alive.push(z.type);
    if (z.x >= v.x0 && z.x <= v.x1 && z.y >= v.y0 && z.y <= v.y1) seen++;
  }
  const lines = [];
  const ev = dir.eventDef;
  lines.push(`Oleada ${dir.wave} · ${STATE[dir.state] || dir.state}${ev ? ` · ${ev.name}` : ''}`);
  lines.push(`Zombis vivos ${alive.length} · en pantalla ${seen} · cerca ${game.horde.nearCount}`);
  if (alive.length) lines.push(`  ${byType(alive)}`);
  if (!ro && dir.state === 'active') {
    const left = dir.queue.length;
    const dead = Math.max(0, dir.waveSize - left - alive.filter((t) => t !== 'golden').length);
    lines.push(`Ronda: ${dir.waveSize} zombis · en cola ${left} · salieron ${dir.waveSize - left} · bajas ${dead}`);
    if (left) lines.push(`  cola: ${byType(dir.queue)}`);
  }
  // lo que traen las dos rondas siguientes (sin contar una posible ronda especial)
  const next = dir.state === 'active' ? dir.wave + 1 : Math.max(1, dir.wave + 1);
  for (const w of [next, next + 1]) {
    const k = dir.composition(w);
    lines.push(`Oleada ${w}: ${k.total} → ${countsText(k)}`);
  }
  if (!ro && dir.state === 'active' && game.player?.alive) {
    lines.push(`Dorado en ${Math.max(0, game.goldenT).toFixed(0)} s (cada ${GOLDEN.every[0]}–${GOLDEN.every[1]} s)`);
  }
  const p = game.player;
  if (p && RUN.has(game.state)) {
    lines.push(
      `Jugador (${Math.round(p.x)}, ${Math.round(p.y)}) · vida ${Math.ceil(p.hp)}/${p.stats.maxHp} · nivel ${game.level} · XP ${game.xp}/${game.xpNeed}`,
    );
    lines.push(`Dinero $${game.money} · racha ${p.combo.n} · bajas ${game.totalKills()}`);
  }
  lines.push(
    `Balas ${game.bullets.list.length} · partículas ${game.particles.p.filter((q) => q.life > 0).length} · estructuras ${game.structures.blocks.length + game.structures.wires.length} · vista ${Math.round(v.x1 - v.x0)}×${Math.round(v.y1 - v.y0)}`,
  );
  lines.push(
    `FPS ${d.fps} · ${d.ms.toFixed(1)} ms · velocidad ×${d.speed}${game.devUsed ? ' · con trampas (sin récord)' : ''}`,
  );
  game.$('dev-stats').textContent = lines.join('\n');
  game.$('dev-mode').textContent = ro ? 'en línea · sólo lectura' : game.mode.detached ? 'solo (sin guardar)' : 'solo';
  const w = game.$('dev-wave');
  if (document.activeElement !== w) w.value = String(dir.wave + 1);
}

/* ---------- conexión ---------- */

export function bindDev(game) {
  const q = new URLSearchParams(location.search).get('dev');
  if (q === '1') storage.set(KEY, true);
  else if (q === '0') storage.remove(KEY);
  const on = devEnabled();
  game.dev = { on, open: on, god: false, ammo: false, speed: 1, fps: 0, ms: 0, frames: 0, acc: 0 };
  const el = game.$('dev');
  el.hidden = !on;
  const sel = game.$('dev-type');
  sel.innerHTML = Object.keys(ZOMBIES)
    .filter((t) => t !== 'golden')
    .map((t) => `<option value="${t}">${NAMES[t] || t}</option>`)
    .join('');
  el.addEventListener('click', (e) => {
    const b = closest(e.target, '[data-act]');
    if (b) act(game, b);
  });
  // Enter en los números: la acción de al lado
  game.$('dev-wave').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') act(game, el.querySelector('[data-act="goto"]'));
  });
  game.$('dev-n').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') act(game, el.querySelector('[data-act="spawn"]'));
  });
  // sin teclado (celular): cinco toques seguidos en la versión del menú
  let taps = 0;
  let tapT = 0;
  game.$('ver').addEventListener('click', () => {
    const now = performance.now();
    taps = now - tapT < 1500 ? taps + 1 : 1;
    tapT = now;
    if (taps < 5) return;
    taps = 0;
    setDevOn(game, !game.dev.on);
  });
}

// Máquina de estados del juego como tabla. Cada estado dice qué pantalla muestra (`screen`), si la
// música suena (`music`), qué hace al entrar y al salir (`enter`, `exit`) y qué hace en cada
// fotograma (`update`). El resto del juego sólo llama a `setState`; el bucle, a `stepState`.
import { CLASS_ORDER } from './core/config.js';
import { rand } from './core/util.js';
import { Abilities } from './sim/abilities.js';
import * as Rules from './sim/rules.js';
import * as Act from './actions.js';
import { saveProgress } from './save.js';
import { updateAcid } from './events.js';
import { gameOver } from './ui/over.js';
import { openShop } from './ui/shop.js';
import { chooseClass } from './ui/class.js';
import { openLevelUp, chooseUpgrade } from './ui/levelup.js';
import { drawLookPreview } from './ui/look.js';

/** @typedef {import('./core/types').GameHost} GameHost */

/**
 * @typedef {object} StateDef
 * @property {string} [screen] id de la pantalla que muestra (las demás se ocultan)
 * @property {boolean} [music] true si la música sigue sonando en este estado
 * @property {(game: GameHost, from: string) => void} [enter] al entrar (el estado ya cambió)
 * @property {(game: GameHost, to: string) => void} [exit] al salir (el estado aún no cambió)
 * @property {(game: GameHost, dt: number) => void} [update] cada fotograma
 */

/* ---------- lo que hace cada estado en cada fotograma ---------- */

// Humo y brasas de los incendios del mundo que se ven en pantalla.
export function emitFires(game, dt) {
  const v = game.view;
  for (const f of game.world.fires) {
    if (f.x < v.x0 - 80 || f.x > v.x1 + 80 || f.y < v.y0 - 80 || f.y > v.y1 + 80) continue;
    if (Math.random() < dt * 16 * f.s) game.particles.ember(f.x, f.y, f.s);
  }
}

// Escena de fondo del menú: zombis que merodean y la cámara dando vueltas despacio.
export function updateMenu(game, dt) {
  game.time += dt;
  game.menuT += dt;
  const { x, y } = game.world.spawn;
  game.horde.update(dt, game);
  game.particles.update(dt);
  emitFires(game, dt);
  game.camera.update(dt, x + Math.cos(game.menuT * 0.12) * 140, y + Math.sin(game.menuT * 0.12) * 90, false);
  game.input.consume('pause');
}

// Un paso de la partida en solitario (también la del anfitrión del cooperativo).
export function updatePlay(game, dt) {
  game.time += dt;
  const p = game.player;
  if (game.input.consume('pause')) {
    game.pause();
    return;
  }
  if (p.alive) {
    p.update(dt, game);
    if (game.input.consume('ability')) Act.useAbility(game);
    Abilities.update(dt, game, p);
    if (game.input.consume('build')) Act.tryBuild(game);
    if (game.input.consume('cycleBuild')) Act.cycleBuild(game);
    if (game.input.consume('grenade')) Act.tryGrenade(game);
    if (game.input.consume('molotov')) Act.tryGrenade(game, 'molotov');
    if (game.input.consume('robot')) Act.toggleRobot(game);
    game.robot.update(dt, p, game);
    if (game.input.consume('nextRound')) Act.startNextRound(game);
  }
  game.structures.update(dt, game);
  game.flowT -= dt;
  if (game.flowT <= 0) {
    game.world.updateFlow(p.x, p.y);
    const peer = game.coop.isHost ? game.coop.peer : null;
    if (peer && peer.alive) game.world.computeField(game.world.main2, peer.x, peer.y);
    game.flowT = 0.2;
  }
  // un campo de flanqueo por fotograma (repartido): los zombis rodean por rutas reales
  if (p.alive) game.world.updateAnchors(p.x, p.y);
  game.director.update(dt, game);
  // zombi dorado: de vez en cuando durante una ronda, nunca dos a la vez
  if (game.director.state === 'active' && p.alive) {
    game.goldenT = Rules.goldenTick(game, game.goldenT, dt, game.toast);
  }
  game.horde.update(dt, game);
  game.bullets.update(dt, game);
  game.horde.removeDead();
  game.pickups.update(dt, game);
  game.particles.update(dt);
  game.decals.update(dt);
  emitFires(game, dt);
  // gemidos y pasos según cuántos zombis hay cerca (con tope para no saturar)
  const nc = game.horde.nearCount;
  if (game.horde.list.length && Math.random() < dt * (0.35 + Math.min(1.5, nc * 0.05)))
    game.sfx.groan(Math.min(3, 0.5 + nc / 10));
  game.stepT -= dt;
  if (nc > 0 && game.stepT <= 0) {
    game.sfx.footstep(Math.min(1, nc / 20));
    game.stepT = Math.max(0.12, 0.7 - nc * 0.03) * rand(0.7, 1.3);
  }
  game.music.setDanger(p.alive ? game.horde.danger : 0, dt);
  // muerto en cooperativo: la cámara sigue suave a tu compañero hasta que revivas
  if (!p.alive && game.coop.peer && game.coop.peer.alive)
    game.camera.update(dt, game.coop.peer.x, game.coop.peer.y, false);
  else {
    const look = game.input.mode === 'mouse' ? 50 : 24;
    game.camera.update(dt, p.x + Math.cos(p.angle) * look, p.y + Math.sin(p.angle) * look, false);
  }
  game.muzzle = Math.max(0, game.muzzle - dt * 14);
  game.hurtFlash = Math.max(0, game.hurtFlash - dt * 1.4);
  updateAcid(game, dt);
  game.updateHud(false);
  if (!p.alive) {
    if (game.coop.active && game.coop.peer && game.coop.peer.alive) return;
    game.deathT -= dt;
    if (game.deathT <= 0) gameOver(game);
    return;
  }
  // en cooperativo las mejoras se eligen entre oleadas (el juego no se pausa para el otro)
  if (game.pendingLevels > 0 && (!game.coop.active || game.director.state === 'waiting')) openLevelUp(game);
  else if (game.shopPending) openShop(game);
  else {
    game.saveT = (game.saveT || 0) + dt;
    if (game.saveT > (game.director.state === 'active' ? 4 : 2)) saveProgress(game);
  }
}

/* ---------- la tabla ---------- */

const quieto = (game) => game.input.reset();

/** @type {Record<string, StateDef>} */
export const STATES = {
  menu: { music: true, update: updateMenu },
  // en línea el mundo lo mueve el servidor (y se actualiza aparte); el invitado sólo predice
  play: {
    music: true,
    update: (game, dt) => {
      if (game.online.active) return;
      if (game.coop.isGuest) game.coop.guestUpdate(dt);
      else updatePlay(game, dt);
    },
  },
  pause: {
    screen: 'screen-pause',
    enter: quieto,
    update: (game) => {
      if (game.input.consume('pause')) game.resume();
    },
  },
  levelup: {
    screen: 'screen-level',
    enter: quieto,
    update: (game) => {
      const s = game.input.consume('slot');
      if (s) chooseUpgrade(game, s - 1);
    },
  },
  shop: { screen: 'screen-shop', enter: quieto },
  over: { screen: 'screen-over' },
  account: { screen: 'screen-account' },
  board: { screen: 'screen-board' },
  look: {
    screen: 'screen-look',
    music: true,
    exit: (game) => {
      game.lookDummy = null;
    },
    update: (game, dt) => {
      updateMenu(game, dt);
      drawLookPreview(game, dt);
    },
  },
  coop: { screen: 'screen-coop' },
  online: { screen: 'screen-online' },
  class: {
    screen: 'screen-class',
    music: true,
    update: (game, dt) => {
      const s = game.input.consume('slot');
      if (s) chooseClass(game, CLASS_ORDER[s - 1]);
      updateMenu(game, dt);
    },
  },
};

/* ---------- cambiar de estado y avanzar un fotograma ---------- */

/** Pasa a otro estado: sale del actual, enseña su pantalla, ajusta la música y entra al nuevo. */
export function setState(game, name) {
  const def = STATES[name];
  if (!def) throw new Error(`Estado desconocido: ${name}`);
  const from = game.state;
  const prev = STATES[from];
  if (prev?.exit) prev.exit(game, name);
  game.state = name;
  game.music.setPaused(!def.music);
  game.root.className = `${game.root.className.replace(/\bstate-\w+/g, '').trim()} state-${name}`;
  for (const s of Object.values(STATES)) if (s.screen) game.$(s.screen).hidden = s !== def;
  if (def.enter) def.enter(game, from);
}

/** Lo que hace el estado actual en este fotograma. */
export function stepState(game, dt) {
  const def = STATES[game.state];
  if (def?.update) def.update(game, dt);
}

export function pause(game) {
  if (game.state !== 'play') return;
  setState(game, 'pause');
}

export function resume(game) {
  if (game.state !== 'pause') return;
  game.sfx.unlock();
  game.input.reset();
  game.last = performance.now();
  setState(game, 'play');
}

// Menú principal: preparar la escena de fondo, empezar o continuar una partida y el sonido.
import { rand, fmtTime, storage, TAU } from '../core/util.ts';
import { loadProgress } from '../save.js';
import { on } from './dom.js';
import { showClass } from './class.js';
import { refreshHall } from './board.js';

export function setupMenu(game) {
  game.resetRun();
  game.player.alive = false;
  const { x, y } = game.world.spawn;
  for (let i = 0; i < 22; i++) {
    for (let t = 0; t < 8; t++) {
      const a = rand(0, TAU);
      const d = rand(160, 560);
      const zx = x + Math.cos(a) * d;
      const zy = y + Math.sin(a) * d;
      if (game.world.pointBlocked(zx, zy, 24)) continue;
      game.horde.spawn(i % 9 === 0 ? 'fat' : 'normal', zx, zy).spawnT = 0;
      break;
    }
  }
  game.setState('menu');
  const cur = game.accounts.current;
  game.$('acct-name').textContent = cur ? cur.name : 'Sin cuenta';
  game.$('acct-best').textContent =
    cur && cur.best ? `Tu récord: oleada ${cur.best.wave} · ${cur.best.kills} bajas` : '';
  const save = storage.get(game.accounts.saveKey(), null) || storage.get(game.accounts.checkKey(), null);
  game.$('btn-continue').hidden = !save;
  if (save) {
    game.$('btn-continue').textContent =
      save.dstate === 'active' ? `Continuar · ronda ${save.wave}` : `Continuar · ronda ${save.wave + 1}`;
  }
  game.$('btn-start').textContent = save ? 'Nueva partida' : 'Jugar';
  game.$('btn-start').classList.toggle('primary', !save);
  refreshHall(game);
  const best = storage.get('dz-best', null);
  game.$('best').textContent = best ? `Récord: ${fmtTime(best.time)} · ${best.kills} bajas · oleada ${best.wave}` : '';
}

export function start(game, freshWorld) {
  game.sfx.unlock();
  // una partida nueva sustituye al progreso guardado
  storage.remove(game.accounts.saveKey());
  storage.remove(game.accounts.checkKey());
  if (freshWorld) game.newWorld();
  game.resetRun();
  game.player.cls = game.classPick;
  game.input.reset();
  game.input.setRun(false);
  game.setState('play');
  game.updateHud(true);
}

export function syncSoundLabel(game) {
  game.$('btn-sound').textContent = `Sonido: ${game.sfx.muted ? 'desactivado' : 'activado'}`;
}

export function tryFullscreen(game) {
  if (game.input.mode !== 'touch') return;
  const el = document.documentElement;
  try {
    const r = el.requestFullscreen && el.requestFullscreen({ navigationUI: 'hide' });
    if (r && r.catch) r.catch(() => {});
  } catch {
    /* Safari en iPhone no admite pantalla completa para páginas */
  }
}

// Botones del menú: jugar, continuar y sonido.
export function bindMenu(game) {
  on(game, 'btn-start', () => {
    tryFullscreen(game);
    showClass(game, false);
  });
  on(game, 'btn-continue', () => {
    tryFullscreen(game);
    if (!loadProgress(game)) start(game, false);
  });
  on(game, 'btn-sound', () => {
    game.sfx.setMuted(!game.sfx.muted);
    syncSoundLabel(game);
  });
  syncSoundLabel(game);
}

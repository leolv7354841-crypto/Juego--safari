// Pantalla de fin de partida (resultados y récord personal) y sus botones.
import { fmtTime, storage } from '../core/util.js';
import { on } from './dom.js';
import { showClass } from './class.js';

export function gameOver(game) {
  if (game.coop.isHost) game.coop.send({ t: 'over' });
  game.setState('over');
  const p = game.player;
  const total = game.totalKills();
  const acc = p.shotsFired ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0;
  const rows = [
    ['Tiempo sobrevivido', fmtTime(game.time)],
    ['Oleada alcanzada', game.director.wave],
    ['Nivel', game.level],
    ['sep'],
    ['Zombis eliminados', total],
    ['Normales', game.kills.normal],
    ['Policías SWAT', game.kills.swat],
    ['Velocistas', game.kills.sprinter],
    ['Gordos', game.kills.fat],
    ['Dorados', game.kills.golden || 0],
    ['Super blindados', game.kills.heavy],
    ['Toros', game.kills.bull || 0],
    ['sep'],
    ['Precisión', `${acc}%`],
    ['Daño recibido', Math.round(p.damageTaken)],
    ['Dinero ganado', `$${game.moneyEarned}`],
  ];
  const dl = game.$('results');
  dl.innerHTML = '';
  for (const [k, v] of rows) {
    if (k === 'sep') {
      const s = document.createElement('div');
      s.className = 'sep';
      dl.appendChild(s);
      continue;
    }
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  }
  const best = storage.get('dz-best', null);
  const record = !best || game.time > best.time;
  if (record) storage.set('dz-best', { time: game.time, kills: total, wave: game.director.wave });
  game.$('over-best').textContent = record
    ? 'Nuevo récord personal'
    : `Récord: ${fmtTime(best.time)} · ${best.kills} bajas`;
}

// Botones de reiniciar y volver al menú (de la pausa y del fin de partida).
export function bindOver(game) {
  // en cooperativo reinicia el anfitrión (el invitado espera)
  const again = () => {
    if (game.online.active) return game.toast('En línea la partida sigue mientras quede alguien vivo');
    if (game.coop.isHost) return game.coop.restart();
    if (game.coop.isGuest) return game.toast('Espera a que el anfitrión reinicie la partida');
    // venías del cooperativo: al menú, donde sigue tu partida normal
    if (game.coopRun) {
      game.newWorld();
      return game.setupMenu();
    }
    showClass(game, true);
  };
  on(game, 'btn-restart', again);
  on(game, 'btn-again', again);
  const toMenu = () => {
    game.coop.leave();
    game.online.leave();
    game.newWorld();
    game.setupMenu();
  };
  on(game, 'btn-menu', toMenu);
  on(game, 'btn-over-menu', toMenu);
}

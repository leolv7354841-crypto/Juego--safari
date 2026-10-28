// Clasificación: pantalla de récords y salón de la fama del menú (podio y lista, mundial o de este dispositivo).
import { fmtTime } from '../core/util.ts';
import { CROWN_SVG } from './icons.js';
import { on } from './dom.js';

export async function showBoard(game) {
  game.setState('board');
  const acc = game.accounts;
  const tab = game.boardTab || (acc.hasGlobal ? 'global' : 'local');
  syncBoardTabs(game, 'board', tab);
  game.$('board-note').textContent = acc.hasGlobal
    ? 'Mundial: récords de todos los que juegan. Dispositivo: cuentas guardadas en este navegador.'
    : 'Récords de las cuentas creadas en este navegador. Para competir entre dispositivos hace falta un servidor (ver README).';
  const target = { podium: game.$('board-podium'), list: game.$('board-list'), me: null, max: 50 };
  if (tab === 'global') renderBoard(game, null, target, 'Cargando…');
  const rows = await boardRows(game, tab);
  if (game.state === 'board')
    renderBoard(
      game,
      rows,
      target,
      tab === 'global' ? 'Todavía no hay récords globales.' : 'Todavía no hay récords. ¡Termina una oleada!',
    );
}

export function syncBoardTabs(game, prefix, tab) {
  const g = game.$(prefix + '-tab-global');
  g.hidden = !game.accounts.hasGlobal;
  g.classList.toggle('on', tab === 'global');
  game.$(prefix + '-tab-local').classList.toggle('on', tab === 'local');
}

export async function boardRows(game, tab) {
  return tab === 'global' ? await game.accounts.globalBoard() : game.accounts.localBoard();
}

// Salón de la fama del menú principal + tu puesto junto al nombre.
export async function refreshHall(game) {
  const acc = game.accounts;
  const tab = game.boardTab || (acc.hasGlobal ? 'global' : 'local');
  syncBoardTabs(game, 'hall', tab);
  const target = { podium: game.$('hall-podium'), list: game.$('hall-list'), me: game.$('hall-me'), max: 8 };
  const local = acc.localBoard();
  renderBoard(game, tab === 'local' ? local : null, target, tab === 'global' ? 'Cargando…' : '');
  const online = tab === 'global' ? await acc.globalBoard() : local;
  if (game.state !== 'menu') return;
  // si la mundial falla, muestra la de este dispositivo y avisa por qué
  const rows = online || local;
  if (tab === 'global') renderBoard(game, rows, target, 'Todavía no hay récords. ¡Termina una oleada!');
  const err = tab === 'global' && !online ? acc.onlineError || 'No se pudo cargar la clasificación mundial.' : null;
  if (err) {
    const li = document.createElement('li');
    li.className = 'board-empty online-err';
    li.textContent = err;
    game.$('hall-list').appendChild(li);
  }
  const badge = game.$('acct-rank');
  const cur = acc.current;
  const i = cur && rows ? rows.findIndex((r) => acc.isMine(r)) : -1;
  badge.hidden = !cur;
  badge.className = 'rank-badge' + (i === 0 ? ' r1' : i === 1 ? ' r2' : i === 2 ? ' r3' : i < 0 ? ' none' : '');
  badge.textContent = i >= 0 ? `Top #${i + 1}${tab === 'global' && online ? ' mundial' : ''}` : 'Sin rango';
}

export function renderBoard(game, rows, t, empty) {
  const cur = game.accounts.current;
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const list = rows || [];
  const top = list.length ? Math.max(1, list[0].wave) : 1;
  // podio: 2.º, 1.º, 3.º
  t.podium.innerHTML = '';
  for (const i of [1, 0, 2]) {
    const r = list[i];
    const pod = el('div', `pod p${i + 1}${r ? '' : ' empty'}${r && game.accounts.isMine(r) ? ' me' : ''}`);
    if (i === 0) pod.appendChild(el('div', 'pod-crown')).innerHTML = CROWN_SVG;
    pod.appendChild(el('div', 'pod-medal', String(i + 1)));
    pod.appendChild(el('b', 'pod-name', r ? r.name : rows ? (i === 0 ? '¡Sé el primero!' : 'Libre') : '…'));
    const wv = pod.appendChild(el('span', 'pod-wave'));
    wv.appendChild(el('b', null, r ? String(r.wave) : '—'));
    wv.appendChild(document.createTextNode(' oleada'));
    pod.appendChild(el('span', 'pod-kills', r ? `${r.kills} bajas · ${fmtTime(r.time || 0)}` : ' '));
    pod.appendChild(el('div', 'pod-base'));
    t.podium.appendChild(pod);
  }
  t.list.innerHTML = '';
  if (!list.length && empty) {
    t.list.appendChild(el('li', 'board-empty', empty));
  }
  list.slice(3, t.max).forEach((r, k) => {
    const li = el('li', game.accounts.isMine(r) ? 'me' : '');
    li.appendChild(el('b', 'rk', String(k + 4)));
    li.appendChild(el('span', 'nm', r.name));
    li.appendChild(el('span', 'st', `Oleada ${r.wave} · ${r.kills} bajas · ${fmtTime(r.time || 0)}`));
    const bar = li.appendChild(el('i', 'bar-w'));
    bar.style.setProperty('--w', `${Math.round((r.wave / top) * 100)}%`);
    t.list.appendChild(li);
  });
  if (t.me) {
    t.me.innerHTML = '';
    const i = cur ? list.findIndex((r) => game.accounts.isMine(r)) : -1;
    if (cur && i >= 0) {
      t.me.appendChild(el('span', 'me-tag', 'Tu puesto'));
      t.me.appendChild(el('b', 'me-rank', `#${i + 1}`));
      t.me.appendChild(el('span', 'me-st', `Oleada ${list[i].wave} · ${list[i].kills} bajas`));
    } else if (cur && rows) {
      t.me.appendChild(el('span', 'me-tag', 'Tu puesto'));
      t.me.appendChild(el('span', 'me-st', 'Supera una oleada para entrar al salón'));
    }
  }
}

// Botones de la clasificación y pestañas del salón de la fama.
export function bindBoard(game) {
  on(game, 'btn-leaderboard', () => showBoard(game));
  on(game, 'btn-board-back', () => game.setupMenu());
  on(game, 'board-tab-local', () => {
    game.boardTab = 'local';
    showBoard(game);
  });
  on(game, 'board-tab-global', () => {
    game.boardTab = 'global';
    showBoard(game);
  });
  on(game, 'hall-tab-local', () => {
    game.boardTab = 'local';
    refreshHall(game);
  });
  on(game, 'hall-tab-global', () => {
    game.boardTab = 'global';
    refreshHall(game);
  });
}

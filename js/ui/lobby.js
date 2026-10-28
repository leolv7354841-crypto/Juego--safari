// Salas: lobby de la partida en línea (hasta 4) y sala del cooperativo de 2 por código.
import { fmtTime } from '../core/util.ts';
import { CLASSES } from '../sim/abilities.ts';
import { validName, explainOnline } from '../net/online.ts';
import { on } from './dom.js';

export function showOnline(game, keepStatus) {
  game.sfx.unlock();
  game.setState('online');
  const name = game.$('ol-name');
  if (!name.value) name.value = game.accounts.current ? game.accounts.current.name : '';
  if (game.inviteCode) game.$('ol-code-in').value = game.inviteCode;
  const url = game.online.serverUrl();
  if (!keepStatus)
    onlineStatus(game, url ? '' : 'No hay servidor configurado: ver NET.server en js/core/config.js.', !url);
  game.renderClassRows();
  renderLobby(game);
}

export function onlineStatus(game, text, bad = false) {
  const el = game.$('ol-status');
  el.textContent = text;
  el.classList.toggle('bad', bad);
}

// Lista de integrantes, botones y resultados según la fase de la sala.
export function renderLobby(game) {
  const ol = game.online;
  const room = ol.room;
  game.$('ol-choose').hidden = !!room;
  game.$('ol-lobby').hidden = !room;
  if (!room || !room.state || !room.state.members) return;
  const st = room.state;
  const me = ol.me;
  game.$('ol-code').textContent = st.code || room.roomId;
  const list = game.$('ol-members');
  list.innerHTML = '';
  const rows = [];
  st.members.forEach((m, id) => rows.push([id, m]));
  rows.sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  for (const [id, m] of rows) {
    const li = document.createElement('li');
    li.className = 'ol-member' + (id === room.sessionId ? ' me' : '') + (m.connected ? '' : ' off');
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent =
      (id === st.ownerId ? '★ ' : '') +
      m.name +
      (id === room.sessionId ? ' (tú)' : '') +
      (CLASSES[m.cls] ? ` · ${CLASSES[m.cls].name}` : '');
    const tag = document.createElement('span');
    tag.className = 'tg';
    tag.textContent = !m.connected
      ? 'reconectando…'
      : st.phase === 'playing'
        ? m.inGame
          ? m.alive
            ? 'jugando'
            : 'caído'
          : 'esperando'
        : id === st.ownerId
          ? 'propietario'
          : m.ready
            ? 'listo'
            : 'no listo';
    li.append(nm, tag);
    list.appendChild(li);
  }
  game.$('ol-count').textContent = `${rows.length}/${st.maxPlayers}`;
  const phase = st.phase;
  const owner = ol.isOwner;
  const lobbyLike = phase === 'waiting' || phase === 'finished';
  game.$('btn-ol-ready').hidden = owner || !lobbyLike;
  game.$('btn-ol-ready').textContent = me && me.ready ? 'Ya no estoy listo' : 'Estoy listo';
  game.$('btn-ol-start').hidden = !owner || !lobbyLike;
  const waitingFor = rows.filter(([id, m]) => id !== st.ownerId && m.connected && !m.ready).length;
  game.$('btn-ol-start').disabled = waitingFor > 0;
  game.$('btn-ol-start').textContent = waitingFor
    ? `Esperando ${waitingFor} listo${waitingFor > 1 ? 's' : ''}`
    : 'Iniciar partida';
  game.$('btn-ol-lobby').hidden = !owner || phase !== 'finished';
  const ph =
    {
      waiting: 'Esperando jugadores',
      loading: 'Cargando…',
      playing: 'Partida en curso',
      finished: 'Partida terminada',
    }[phase] || '';
  game.$('ol-phase').textContent = ph;
  const res = game.$('ol-results');
  const r = ol.results;
  res.hidden = !r || phase !== 'finished';
  if (r && phase === 'finished') {
    res.innerHTML = '';
    const h = document.createElement('p');
    h.className = 'ol-res-head';
    h.textContent = `Oleada ${r.wave} · ${fmtTime(r.time)} · ${r.kills} bajas en total`;
    res.appendChild(h);
    for (const pl of r.players || []) {
      const row = document.createElement('div');
      row.className = 'ol-res-row';
      row.textContent = `${pl.name}: ${pl.kills} bajas · ${pl.deaths} caídas`;
      res.appendChild(row);
    }
  }
}

export function onlineName(game) {
  const n = game.$('ol-name').value.replace(/\s+/g, ' ').trim();
  if (!validName(n)) {
    onlineStatus(game, 'Nombre no válido: de 1 a 16 letras, números, espacios, _ . -', true);
    return null;
  }
  return n;
}

export async function onlineCreate(game) {
  const name = onlineName(game);
  if (!name || game.onlineBusy) return;
  game.onlineBusy = true;
  onlineStatus(game, 'Conectando con el servidor…');
  try {
    await game.online.create(name);
    onlineStatus(game, 'Sala creada: comparte el código o la invitación.');
    renderLobby(game);
  } catch (err) {
    onlineStatus(game, explainOnline(err), true);
  }
  game.onlineBusy = false;
}

export async function onlineJoin(game) {
  const name = onlineName(game);
  const code = game.$('ol-code-in').value.trim().toUpperCase();
  if (!name || game.onlineBusy) return;
  if (!/^[A-Z0-9]{6}$/.test(code)) return onlineStatus(game, 'El código tiene 6 letras o números.', true);
  game.onlineBusy = true;
  onlineStatus(game, 'Entrando a la sala…');
  try {
    await game.online.join(code, name);
    game.inviteCode = '';
    onlineStatus(game, '');
    renderLobby(game);
  } catch (err) {
    onlineStatus(game, explainOnline(err), true);
  }
  game.onlineBusy = false;
}

export function copyInvite(game) {
  const room = game.online.room;
  if (!room) return;
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  const keep = new URLSearchParams(location.search).get('servidor');
  if (keep) u.searchParams.set('servidor', keep);
  u.searchParams.set('sala', room.roomId);
  const text = u.toString();
  const done = () => onlineStatus(game, 'Invitación copiada: ' + text);
  if (navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(text).then(done, () => onlineStatus(game, text));
  else onlineStatus(game, text);
}

// Abre la sala de una invitación, o vuelve a la partida tras recargar la página.
export async function openInvite(game) {
  if (await game.online.resume()) return showOnline(game, true);
  if (game.inviteCode) showOnline(game);
}

export function toggleDiag(game) {
  if (!game.mode.viaServer()) return;
  const el = game.$('net-diag');
  el.hidden = !el.hidden;
}

export function showCoop(game) {
  game.sfx.unlock();
  game.setState('coop');
  game.renderClassRows();
  game.$('coop-choose').hidden = false;
  game.$('coop-wait').hidden = true;
  game.$('coop-code-in').value = '';
  coopStatus(
    game,
    game.coop.net.available ? '' : 'El cooperativo necesita internet y un navegador con conexión directa (WebRTC).',
  );
}

export function coopStatus(game, text, bad = false) {
  const el = game.$('coop-status');
  el.textContent = text;
  el.classList.toggle('bad', bad);
}

export function coopError(game, err) {
  const m = String((err && err.message) || err);
  if (m === 'cancelado') return;
  const msg =
    {
      'no-existe': 'No existe una sala con ese código (o ya caducó).',
      llena: 'Esa sala ya está llena: sólo se puede jugar de 2.',
      permiso: 'Firebase no da permiso para crear salas: revisa la pestaña Reglas (ver README).',
      tiempo: 'El anfitrión no respondió. Pídele que cree una sala nueva y vuelve a intentar.',
      directa:
        'No se pudo conectar directo entre los celulares. Prueben los dos en la misma red Wi‑Fi o con otra red (algunas redes móviles lo bloquean).',
    }[m] || 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.';
  coopStatus(game, msg, true);
  game.$('coop-choose').hidden = false;
  game.$('coop-wait').hidden = true;
  game.coop.cancel();
}

export async function coopCreate(game) {
  if (!game.coop.net.available) return;
  game.$('coop-choose').hidden = true;
  game.$('coop-wait').hidden = false;
  game.$('coop-code').textContent = '····';
  coopStatus(game, 'Creando sala…');
  try {
    await game.coop.create((code) => {
      game.$('coop-code').textContent = code;
      coopStatus(game, 'Esperando a tu compañero…');
    });
  } catch (err) {
    coopError(game, err);
  }
}

export async function coopJoin(game) {
  const code = game.$('coop-code-in').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) return coopStatus(game, 'El código tiene 4 letras.', true);
  if (!game.coop.net.available) return;
  coopStatus(game, 'Conectando…');
  try {
    await game.coop.join(code);
    coopStatus(game, '¡Conectado! Esperando al anfitrión…');
    // si el anfitrión no arranca en un rato, algo falló
    const t0 = performance.now();
    while (!game.mode.inGroup() && game.state === 'coop') {
      if (performance.now() - t0 > 20000) throw new Error('tiempo');
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch (err) {
    coopError(game, err);
  }
}

// Botones de las salas (en línea y cooperativo) y el panel de diagnóstico de red.
export function bindLobby(game) {
  on(game, 'btn-coop', () => showCoop(game));
  on(game, 'btn-online', () => showOnline(game));
  on(game, 'btn-ol-create', () => onlineCreate(game));
  on(game, 'btn-ol-back', () => {
    game.online.leave();
    game.setupMenu();
  });
  on(game, 'btn-ol-ready', () => {
    const me = game.online.me;
    if (me) game.online.send('ready', { v: !me.ready });
  });
  on(game, 'btn-ol-start', () => game.online.send('start'));
  on(game, 'btn-ol-lobby', () => game.online.send('lobby'));
  on(game, 'btn-ol-copy', () => copyInvite(game));
  game.$('ol-join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    onlineJoin(game);
  });
  // tocar el indicador de conexión abre el panel de diagnóstico (también con F3)
  game.$('net-stat').addEventListener('click', () => toggleDiag(game));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3' && game.mode.viaServer()) {
      e.preventDefault();
      toggleDiag(game);
    }
  });
  on(game, 'btn-coop-create', () => coopCreate(game));
  on(game, 'btn-coop-back', () => {
    game.coop.cancel();
    game.setupMenu();
  });
  game.$('coop-join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    coopJoin(game);
  });
}

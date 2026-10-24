// Pruebas de las salas: cupos, permisos, entradas inválidas, reconexión, propiedad y limpieza.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, client, sleep, waitFor, serverRoom, cut, inbox } from './helpers.ts';
import { CONFIG } from '../src/config.ts';
import { WEAPONS } from '../../js/config.js';
import { STATS } from '../src/stats.ts';
import { IDLE } from '../src/rooms/DeadZoneRoom.ts';

let srv: any;
let url = '';

before(async () => {
  srv = await boot();
  url = srv.url;
});
after(async () => {
  await srv.server.gracefullyShutdown(false);
});

async function fill(n: number) {
  const owner = await client(url).create('dz', { name: 'Dueño' });
  const rest: any[] = [];
  for (let i = 1; i < n; i++) rest.push(await client(url).joinById(owner.roomId, { name: `Jugador ${i}` }));
  // sin esto el SDK avisa de cada mensaje que la prueba no escucha
  for (const r of [owner, ...rest]) r.onMessage('*', () => {});
  return [owner, ...rest];
}

// salir sin quedarse colgado si la conexión ya estaba cortada
const leaveAll = (rooms: any[]) => Promise.all(rooms.map((r) => Promise.race([r.leave().catch(() => {}), sleep(600)])));

const MAX = CONFIG.maxPlayers;

test(`crear, entrar y llenar una sala de ${MAX}; el siguiente no entra`, async () => {
  const rooms = await fill(MAX);
  const owner = rooms[0];
  assert.match(owner.roomId, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(owner.state.maxPlayers, MAX);
  await waitFor(() => owner.state.members.size === MAX, 4000, `${MAX} integrantes`);
  await assert.rejects(client(url).joinById(owner.roomId, { name: 'Sobra' }), (e: any) => {
    assert.ok(/locked|full|lleno/i.test(e.message), e.message);
    return true;
  });
  await assert.rejects(client(url).joinById('NOEXST', { name: 'X' }), /not found/);
  await leaveAll(rooms);
});

test('nombre inválido se rechaza', async () => {
  await assert.rejects(client(url).create('dz', { name: '' }), (e: any) => e.message === 'nombre');
  await assert.rejects(client(url).create('dz', { name: 'x'.repeat(40) }), (e: any) => e.message === 'nombre');
  await assert.rejects(client(url).create('dz', { name: '<script>' }), (e: any) => e.message === 'nombre');
});

test('colores del personaje: se guardan si son válidos, si no quedan vacíos', async () => {
  const owner = await client(url).create('dz', { name: 'Color', look: '304120' });
  const bad = await client(url).joinById(owner.roomId, { name: 'Raro', look: '<b>' });
  for (const r of [owner, bad]) r.onMessage('*', () => {});
  await waitFor(() => owner.state.members.size === 2, 4000, '2 integrantes');
  const looks = new Map<string, string>();
  owner.state.members.forEach((m: any) => looks.set(m.name, m.look));
  assert.equal(looks.get('Color'), '304120');
  assert.equal(looks.get('Raro'), '');
  await leaveAll([owner, bad]);
});

test('entradas simultáneas al último cupo: sólo una entra', async () => {
  const rooms = await fill(MAX - 1);
  const tries = await Promise.allSettled([1, 2, 3, 4].map((i) => client(url).joinById(rooms[0].roomId, { name: `Carrera ${i}` })));
  const ok = tries.filter((t) => t.status === 'fulfilled');
  assert.equal(ok.length, 1, 'exactamente una entrada');
  await waitFor(() => serverRoom(rooms[0].roomId).clients.length === MAX, 4000, 'sala llena en el servidor');
  assert.equal(serverRoom(rooms[0].roomId).state.members.size, MAX);
  await leaveAll([...rooms, ...ok.map((t: any) => t.value)]);
});

test('permisos del propietario y paso por las fases', async () => {
  const [owner, guest] = await fill(2);
  const gIn = inbox(guest);
  const oIn = inbox(owner);
  guest.send('start');
  await waitFor(() => gIn.error?.length, 2000, 'error al invitado');
  assert.match(gIn.error[0].m, /propietario/);
  owner.send('start');
  await waitFor(() => oIn.error?.length, 2000, 'faltan listos');
  assert.match(oIn.error[0].m, /listos/);
  assert.equal(owner.state.phase, 'waiting');
  guest.send('ready', { v: true });
  await sleep(150);
  owner.send('start');
  await waitFor(() => owner.state.phase === 'loading', 2000, 'cargando');
  assert.ok(Number.isInteger(oIn.load[0].seed));
  owner.send('loaded');
  guest.send('loaded');
  await waitFor(() => owner.state.phase === 'playing', 3000, 'jugando');
  await waitFor(() => (oIn.snap?.length || 0) > 3, 3000, 'fotos');
  const s = oIn.snap[oIn.snap.length - 1];
  assert.ok(Array.isArray(s.me) && s.me.length === 11);
  assert.equal(s.pl.length, 16, 'el otro jugador aparece en la foto');
  // el invitado no puede devolver la sala al lobby
  guest.send('lobby');
  await waitFor(() => gIn.error?.length > 1, 2000, 'error lobby');
  await leaveAll([owner, guest]);
});

test('entradas inválidas se rechazan sin tirar la sala', async () => {
  const [owner, guest] = await fill(2);
  guest.send('ready', { v: true });
  await sleep(100);
  owner.send('start');
  await waitFor(() => owner.state.phase === 'loading');
  owner.send('loaded');
  guest.send('loaded');
  await waitFor(() => owner.state.phase === 'playing');
  const room = serverRoom(owner.roomId);
  const slot = room.sim.slots.get(guest.sessionId);
  const bad: any[] = [
    null, 5, 'x', { i: 'no' }, { i: [] }, { i: new Array(50).fill([1, 0, 0, 0, 0, -1]) },
    { i: [[1, NaN, 0, 0, 0, -1]] }, { i: [[1, 0, 0, 99, 0, -1]] }, { i: [['1', 0, 0, 0, 0, -1]] },
    { i: [[-3, 0, 0, 0, 0, -1]] }, { i: [[1, 0, 0, 0, 1e9, -1]] }, { i: [[1, 0, 0, 0, 0, 77]] },
    { i: [[999999, 0, 0, 0, 0, -1]] }, // secuencia muy adelantada
  ];
  for (const m of bad) guest.send('in', m);
  guest.send('nada', { x: 1 });
  guest.send('ready', 'raro');
  await sleep(300);
  assert.equal(slot.queue.length, 0, 'nada inválido llegó a la cola');
  assert.ok(room.limits.get(guest.sessionId).bad >= bad.length - 1);
  // una entrada buena con dirección exagerada se recorta a longitud 1
  guest.send('in', { i: [[1, 5, 5, 0, 0, -1]] });
  await waitFor(() => slot.ack === 1 || slot.queue.length === 1, 2000, 'entrada buena');
  assert.ok(Math.hypot(slot.last.mx, slot.last.my) <= 1.0001);
  // un mensaje enorme corta la conexión pero no la sala
  const before = owner.state.members.size;
  guest.send('in', { i: [[2, 0, 0, 0, 0, -1]], basura: 'x'.repeat(40000) });
  await sleep(500);
  assert.equal(serverRoom(owner.roomId) !== undefined, true);
  assert.equal(owner.state.members.size, before, 'sigue en la sala (puede reconectar)');
  await leaveAll([owner, guest]);
});

test('el ritmo normal del navegador (60 mensajes por segundo) no suma faltas', async () => {
  const [owner] = await fill(1);
  owner.send('start');
  await waitFor(() => owner.state.phase === 'loading');
  owner.send('loaded');
  await waitFor(() => owner.state.phase === 'playing');
  const l = serverRoom(owner.roomId).limits.get(owner.sessionId);
  // un mensaje por fotograma durante 3 s, como js/online.js (antes, a partir de 2 s, eran faltas)
  const t0 = performance.now();
  for (let seq = 1, next = t0; performance.now() - t0 < 3000; seq++) {
    owner.send('in', { i: [[seq, 0.5, 0, 0, 0, -1]] });
    next += 1000 / 60;
    await sleep(Math.max(0, next - performance.now()));
  }
  await sleep(100);
  assert.equal(l.bad, 0, 'sin faltas');
  await leaveAll([owner]);
});

test('desconexión y reconexión sin duplicados', async () => {
  const [owner, guest] = await fill(2);
  guest.reconnection.minUptime = 0;
  guest.send('ready', { v: true });
  await sleep(100);
  owner.send('start');
  await waitFor(() => owner.state.phase === 'loading');
  owner.send('loaded');
  guest.send('loaded');
  await waitFor(() => owner.state.phase === 'playing');
  const room = serverRoom(owner.roomId);
  const sid = guest.sessionId;
  let dropped = false;
  let back = false;
  guest.onDrop(() => (dropped = true));
  guest.onReconnect(() => (back = true));
  cut(owner.roomId, sid);
  await waitFor(() => dropped, 3000, 'el cliente nota la caída');
  await waitFor(() => owner.state.members.get(sid)?.connected === false, 3000, 'marcado desconectado');
  assert.equal(room.sim.slots.get(sid).away, true);
  await waitFor(() => back, 6000, 'reconectado');
  assert.equal(guest.sessionId, sid, 'misma identidad');
  await waitFor(() => owner.state.members.get(sid)?.connected === true, 3000, 'conectado otra vez');
  assert.equal(owner.state.members.size, 2, 'sin integrantes duplicados');
  assert.equal(room.sim.slots.size, 2, 'sin personajes duplicados');
  assert.equal(room.clients.length, 2);
  assert.equal(room.sim.slots.get(sid).away, false);
  await leaveAll([owner, guest]);
});

test('el que no vuelve a tiempo sale de la sala', async () => {
  const [owner, guest] = await fill(2);
  guest.reconnection.enabled = false;
  const sid = guest.sessionId;
  await waitFor(() => owner.state.members.get(sid)?.connected === true, 3000, 'entrada completa');
  cut(owner.roomId, sid);
  await waitFor(() => owner.state.members.get(sid)?.connected === false, 3000);
  await waitFor(() => !owner.state.members.has(sid), 8000, 'expira la ventana de reconexión');
  await leaveAll([owner]);
});

test('transferencia de propiedad al salir el propietario', async () => {
  const [a, b, c] = await fill(3);
  assert.equal(a.state.ownerId, a.sessionId);
  await a.leave();
  await waitFor(() => b.state.ownerId === b.sessionId, 3000, 'el más antiguo es el nuevo propietario');
  assert.equal(c.state.ownerId, b.sessionId);
  await leaveAll([b, c]);
});

test('fin de partida, vuelta al lobby y limpieza de la sala vacía', async () => {
  const [owner, guest] = await fill(2);
  const oIn = inbox(owner);
  guest.send('ready', { v: true });
  await sleep(100);
  owner.send('start');
  await waitFor(() => owner.state.phase === 'loading');
  owner.send('loaded');
  guest.send('loaded');
  await waitFor(() => owner.state.phase === 'playing');
  const room = serverRoom(owner.roomId);
  for (const s of room.sim.slots.values()) {
    s.p.hp = 0;
    s.p.alive = false;
  }
  await waitFor(() => owner.state.phase === 'finished', 4000, 'finalizada');
  await waitFor(() => oIn.results?.length, 2000, 'resultados');
  assert.equal(oIn.results[0].players.length, 2);
  owner.send('lobby');
  await waitFor(() => owner.state.phase === 'waiting', 2000, 'de vuelta esperando');
  const id = owner.roomId;
  await leaveAll([owner, guest]);
  await waitFor(() => serverRoom(id) === undefined, 4000, 'sala vacía eliminada');
});

test(`tope de ${CONFIG.maxRooms} salas: la siguiente da servidor-lleno`, async () => {
  await waitFor(() => STATS.rooms === 0, 4000, 'sin salas de otras pruebas');
  const owners: any[] = [];
  for (let i = 0; i < CONFIG.maxRooms; i++) owners.push((await fill(1))[0]);
  assert.equal(STATS.rooms, CONFIG.maxRooms);
  await assert.rejects(client(url).create('dz', { name: 'Sobra' }), (e: any) => e.message === 'servidor-lleno');
  // simultáneas con el último cupo libre: sólo una se crea
  await leaveAll(owners.splice(0, 1));
  await waitFor(() => STATS.rooms === CONFIG.maxRooms - 1, 4000, 'se libera un cupo');
  const tries = await Promise.allSettled([1, 2, 3].map((i) => client(url).create('dz', { name: `Carrera ${i}` })));
  const ok = tries.filter((t) => t.status === 'fulfilled');
  assert.equal(ok.length, 1, 'exactamente una sala nueva: ' + tries.map((t: any) => t.status + ' ' + (t.reason?.message || '')).join(' / '));
  assert.equal(STATS.rooms, CONFIG.maxRooms);
  // a una sala existente sí se puede entrar con el servidor lleno
  const guest = await client(url).joinById(owners[0].roomId, { name: 'Invitado' });
  guest.onMessage('*', () => {});
  await leaveAll([...owners, guest, ...ok.map((t: any) => t.value)]);
  await waitFor(() => STATS.rooms === 0, 4000, 'todas las salas borradas');
});

test('una reserva que nunca se usa no deja la sala ocupada', async () => {
  await waitFor(() => STATS.rooms === 0, 4000, 'sin salas');
  const { matchMaker } = await import('@colyseus/core');
  await matchMaker.create('dz', { name: 'Fantasma' }, { headers: new Headers(), token: '', ip: '' } as any);
  assert.equal(STATS.rooms, 1);
  await waitFor(() => STATS.rooms === 0, 4000, 'sala sin nadie borrada');
});

test('una sala sin partida se cierra por inactividad', async () => {
  const old = CONFIG.idleRoomMinutes;
  CONFIG.idleRoomMinutes = 0.02; // 1,2 s
  try {
    const [owner, guest] = await fill(2);
    let code = 0;
    owner.onLeave((c: number) => (code = c));
    await waitFor(() => code !== 0, 4000, 'sala cerrada');
    assert.equal(code, IDLE);
    await leaveAll([guest]);
  } finally {
    CONFIG.idleRoomMinutes = old;
  }
});

test('origen no permitido: ni siquiera se crea la sala', async () => {
  await waitFor(() => STATS.rooms === 0, 4000, 'sin salas');
  CONFIG.origins.push('https://permitido.example');
  try {
    await assert.rejects(client(url).create('dz', { name: 'Ana' }), (e: any) => e.message === 'origen');
    assert.equal(STATS.rooms, 0, 'no ocupa cupo');
  } finally {
    CONFIG.origins.length = 0;
  }
});

test('/health responde con métricas', async () => {
  const r = await fetch(`${srv.http}/health`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.ok('rooms' in j && 'players' in j);
  assert.equal(j.maxRooms, CONFIG.maxRooms);
  assert.equal(j.maxPlayers, CONFIG.maxPlayers);
});

test('entre oleadas llegan las mejoras y la tienda funciona por la red', async () => {
  const [owner] = await fill(1);
  const got = inbox(owner);
  owner.send('start');
  await waitFor(() => owner.state.phase === 'loading');
  owner.send('loaded');
  await waitFor(() => owner.state.phase === 'playing');
  const room = serverRoom(owner.roomId);
  const sim = room.sim;
  const slot = sim.slots.get(owner.sessionId);
  // fin de oleada simulado: un nivel por elegir y dinero para gastar
  sim.director.state = 'waiting';
  sim.addXp(slot, slot.xpNeed);
  slot.money = 500;
  const last = () => got.snap[got.snap.length - 1];
  await waitFor(() => last()?.up, 3000, 'mejoras en la foto');
  const up = last().up;
  assert.deepEqual([last().st[7], last().ec[0]], [500, 2]);
  owner.send('pick', { i: 0, n: up[0] });
  await waitFor(() => slot.pending === 0 && !last().up, 3000, 'mejora aplicada');
  assert.equal(slot.taken[up[1]], 1);
  // un arma que las mejoras nunca dan (la mejora elegida al azar puede ser el subfusil)
  owner.send('buy', { k: 'gun', id: 'ar', n: 0 });
  await waitFor(() => last().wp.some((w: any) => w[0] === 'ar'), 3000, 'fusil comprado');
  assert.equal(last().st[7], 500 - WEAPONS.ar.price);
  // basura: se ignora sin tirar nada
  owner.send('buy', { k: 'gun', id: { x: 1 } });
  owner.send('pick', { i: 'a' });
  owner.send('buy', { k: 'gun', id: 'constructor', n: 0 });
  await sleep(200);
  assert.equal(slot.money, 500 - WEAPONS.ar.price);
  await leaveAll([owner]);
});

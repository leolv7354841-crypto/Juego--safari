// Pruebas de las salas: cupos, permisos, entradas inválidas, reconexión, propiedad y limpieza.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, client, sleep, waitFor, serverRoom, cut, inbox } from './helpers.ts';
import { CONFIG } from '../src/config.ts';

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

test('crear, entrar y llenar una sala de 10; el 11.º no entra', async () => {
  const rooms = await fill(10);
  const owner = rooms[0];
  assert.match(owner.roomId, /^[A-HJ-NP-Z2-9]{6}$/);
  await waitFor(() => owner.state.members.size === 10, 4000, '10 integrantes');
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

test('entradas simultáneas al último cupo: sólo una entra', async () => {
  const rooms = await fill(9);
  const tries = await Promise.allSettled([1, 2, 3, 4].map((i) => client(url).joinById(rooms[0].roomId, { name: `Carrera ${i}` })));
  const ok = tries.filter((t) => t.status === 'fulfilled');
  assert.equal(ok.length, 1, 'exactamente una entrada');
  await waitFor(() => serverRoom(rooms[0].roomId).clients.length === 10, 4000, '10 en el servidor');
  assert.equal(serverRoom(rooms[0].roomId).state.members.size, 10);
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
  assert.ok(Array.isArray(s.me) && s.me.length === 10);
  assert.equal(s.pl.length, 14, 'el otro jugador aparece en la foto');
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
  assert.ok(room.limits.get(guest.sessionId).strikes >= bad.length - 1);
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

test('origen no permitido', async () => {
  CONFIG.origins.push('https://permitido.example');
  try {
    await assert.rejects(client(url).create('dz', { name: 'Ana' }), (e: any) => e.message === 'origen');
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
});

// Ayudas para las pruebas: servidor en un puerto libre y clientes reales del SDK.
process.env.EMPTY_ROOM_SECONDS ||= '1';
process.env.LOAD_SECONDS ||= '2';
process.env.RECONNECT_SECONDS ||= '5';

import { Client } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';

const { startServer } = await import('../src/app.ts');

export async function boot() {
  const port = 30000 + Math.floor(Math.random() * 20000);
  const { server } = await startServer(port, '127.0.0.1');
  return { server, url: `ws://127.0.0.1:${port}`, http: `http://127.0.0.1:${port}` };
}

export function client(url: string) {
  return new Client(url);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn: () => unknown, ms = 4000, what = 'condición') {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - t0 > ms) throw new Error(`no se cumplió a tiempo: ${what}`);
    await sleep(20);
  }
}

export function serverRoom(id: string): any {
  return matchMaker.getLocalRoomById(id);
}

// Corta la conexión de un cliente desde el servidor, como si se cayera la red.
export function cut(roomId: string, sessionId: string) {
  const room = serverRoom(roomId);
  const c = room.clients.find((x: any) => x.sessionId === sessionId);
  c.ref.terminate();
}

// Mensajes recibidos por tipo (para esperar uno en concreto).
export function inbox(room: any) {
  const got: Record<string, any[]> = {};
  room.onMessage('*', (type: string, m: any) => (got[type] ||= []).push(m));
  return got;
}

// Arma el servidor (transporte, salas y rutas HTTP). Lo usan index.ts y las pruebas.
import {
  defineServer,
  defineRoom,
  createRouter,
  createEndpoint,
  applySimulatedLatency,
  parseLatencyEnv,
} from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DeadZoneRoom } from './rooms/DeadZoneRoom.ts';
import { CONFIG } from './config.ts';
import { STATS } from './stats.ts';

export const health = () => ({
  ok: true,
  rooms: STATS.rooms,
  maxRooms: CONFIG.maxRooms,
  maxPlayers: CONFIG.maxPlayers,
  minPlayers: CONFIG.minPlayers,
  full: STATS.rooms >= CONFIG.maxRooms,
  players: STATS.players,
  simRooms: STATS.simRooms,
  tickHz: STATS.hz,
  tickMs: STATS.tickMs,
  tickMaxMs: STATS.tickMax,
  skippedTicks: STATS.skipped,
  cpuPercent: STATS.cpu,
  rssMb: STATS.rssMb,
  txBytes: STATS.tx,
  uptime: Math.round((Date.now() - STATS.startedAt) / 1000),
});

export async function startServer(port = CONFIG.port, host = CONFIG.host) {
  const routes = createRouter({
    health: createEndpoint('/health', { method: 'GET' }, async (ctx: any) => ctx.json(health())),
  });
  const transport = new WebSocketTransport({
    // mensajes de más de 16 KB no son del juego: se corta la conexión
    maxPayload: 16 * 1024,
    pingInterval: 5000,
    pingMaxRetries: 3,
  });
  const server = defineServer({
    transport,
    greet: false,
    gracefullyShutdown: true,
    rooms: { dz: defineRoom(DeadZoneRoom) },
    routes,
  } as any);
  // COLYSEUS_LATENCY=150 simula 150 ms de ida y vuelta (sólo para pruebas)
  const lag = parseLatencyEnv();
  if (lag) applySimulatedLatency(transport, lag);
  await server.listen(port, host);
  return { server, lag };
}

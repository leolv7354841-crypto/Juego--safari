// Ajustes del servidor. Todo se puede cambiar con variables de entorno (ver .env.example).
import { NET } from '../../js/core/config.ts';

const num = (name: string, def: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
};

export const CONFIG = {
  port: num('PORT', 2567),
  host: process.env.HOST || '0.0.0.0',
  // orígenes web que pueden conectarse (separados por comas). Vacío = cualquiera (desarrollo).
  origins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  maxPlayers: Math.min(10, num('MAX_PLAYERS', NET.maxPlayers)),
  // jugadores conectados que hacen falta para iniciar una partida (nunca más que el cupo de la sala)
  minPlayers: Math.min(Math.min(10, num('MAX_PLAYERS', NET.maxPlayers)), num('MIN_PLAYERS', 2)),
  // salas a la vez en este proceso: con todas ocupadas, crear una más da 'servidor-lleno'
  maxRooms: num('MAX_ROOMS', 8),
  // igual que la predicción del cliente: se cambia sólo en NET.tickHz (js/core/config.js)
  tickHz: NET.tickHz,
  snapHz: num('SNAP_HZ', NET.snapHz),
  // pasos atrasados que se recuperan como mucho de una vez (evita la espiral tras una pausa)
  maxCatchup: num('MAX_CATCHUP', 8),
  reconnectSeconds: num('RECONNECT_SECONDS', NET.reconnectSeconds),
  // una sala sin nadie conectado se borra pasado este tiempo
  emptyRoomSeconds: num('EMPTY_ROOM_SECONDS', 30),
  // una sala sin partida (esperando o en resultados) se cierra pasado este tiempo, para que
  // una pestaña olvidada no ocupe uno de los cupos de MAX_ROOMS
  idleRoomMinutes: num('IDLE_ROOM_MINUTES', 20),
  // tiempo máximo para que todos carguen el mapa antes de empezar igual
  loadSeconds: num('LOAD_SECONDS', 12),
  view: NET.view,
  // spike: los zombis van en el Schema de la sala con StateView por jugador (SCHEMA_ZOMBIES=0 los deja en la foto)
  schemaZombies: process.env.SCHEMA_ZOMBIES !== '0',
};

// ¿Puede entrar una página con este origen?
export function originAllowed(origin: string | null | undefined): boolean {
  if (!CONFIG.origins.length) return true;
  if (!origin) return false;
  const o = origin.replace(/\/$/, '');
  // '*' vale por cualquier trozo sin puntos ni barras (p. ej. https://deadzone-*.vercel.app)
  return CONFIG.origins.some((p) => p === o || (p.includes('*') && glob(p).test(o)));
}

const glob = (p: string) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^./]*') + '$');

// Ajustes del servidor. Todo se puede cambiar con variables de entorno (ver .env.example).
import { NET } from '../../js/config.js';

const num = (name: string, def: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
};

export const CONFIG = {
  port: num('PORT', 2567),
  host: process.env.HOST || '0.0.0.0',
  // orígenes web que pueden conectarse (separados por comas). Vacío = cualquiera (desarrollo).
  origins: (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  maxPlayers: Math.min(10, num('MAX_PLAYERS', NET.maxPlayers)),
  // igual que la predicción del cliente: se cambia sólo en NET.tickHz (js/config.js)
  tickHz: NET.tickHz,
  snapHz: num('SNAP_HZ', NET.snapHz),
  // pasos atrasados que se recuperan como mucho de una vez (evita la espiral tras una pausa)
  maxCatchup: num('MAX_CATCHUP', 8),
  reconnectSeconds: num('RECONNECT_SECONDS', NET.reconnectSeconds),
  // una sala sin nadie conectado se borra pasado este tiempo
  emptyRoomSeconds: num('EMPTY_ROOM_SECONDS', 30),
  // tiempo máximo para que todos carguen el mapa antes de empezar igual
  loadSeconds: num('LOAD_SECONDS', 12),
  view: NET.view,
};

// ¿Puede entrar una página con este origen?
export function originAllowed(origin: string | null | undefined): boolean {
  if (!CONFIG.origins.length) return true;
  if (!origin) return false;
  return CONFIG.origins.includes(origin.replace(/\/$/, ''));
}

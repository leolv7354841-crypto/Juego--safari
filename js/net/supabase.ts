// Cliente mínimo de Supabase por su API REST (PostgREST), sin librería: la clasificación mundial y las
// estadísticas de uso pasan por aquí. El juego sólo llama funciones `dz_*` (ver supabase/esquema.sql) y lee
// `scores`; la clave publicable viaja en las cabeceras y es pública por diseño.
import { ONLINE } from '../core/config.ts';

/** ¿Hay proyecto de Supabase configurado? */
export const activo = () => !!(ONLINE.url && ONLINE.key);

const base = () => ONLINE.url.replace(/\/$/, '') + '/rest/v1';

const cabeceras = () => ({
  apikey: ONLINE.key,
  Authorization: `Bearer ${ONLINE.key}`,
  'Content-Type': 'application/json',
});

/** Lo que se manda para llamar a una función (expuesto para las pruebas). */
export function peticionRpc(fn: string, args: Record<string, unknown>, keepalive = false) {
  return {
    url: `${base()}/rpc/${fn}`,
    init: {
      method: 'POST',
      headers: cabeceras(),
      body: JSON.stringify(args),
      keepalive,
    } as RequestInit,
  };
}

/** Lo que se manda para leer una tabla (`query` va tal cual tras el `?`). */
export function peticionSelect(tabla: string, query: string) {
  return {
    url: `${base()}/${tabla}?${query}`,
    init: { method: 'GET', headers: cabeceras() } as RequestInit,
  };
}

/**
 * Llama a una función de Postgres. `keepalive` deja salir la petición aunque la pestaña se cierre
 * (sendBeacon no admite cabeceras). Devuelve la respuesta o lanza si no hay conexión.
 */
export function rpc(fn: string, args: Record<string, unknown>, keepalive = false) {
  const { url, init } = peticionRpc(fn, args, keepalive);
  return fetch(url, init);
}

/** Lee filas de una tabla con lectura pública. Lanza si no hay conexión. */
export function select(tabla: string, query: string) {
  const { url, init } = peticionSelect(tabla, query);
  return fetch(url, init);
}

/** Explica un error de la API en palabras simples (se muestra en el Salón de la fama). */
export async function explicar(r: Response) {
  let msg = '';
  try {
    const j = await r.json();
    msg = (j && (j.message || j.error || j.hint)) || '';
  } catch {
    /* sin cuerpo */
  }
  if (r.status === 401 || r.status === 403 || /permission|policy|jwt/i.test(msg))
    return 'Supabase no da permiso: revisa la clave publicable y las políticas (supabase/esquema.sql).';
  if (r.status === 404) return 'No se encontró la tabla o la función en Supabase: aplica supabase/esquema.sql.';
  return `Error del servidor de la clasificación (${r.status}${msg ? ': ' + msg : ''}).`;
}

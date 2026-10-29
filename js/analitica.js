// Estadísticas de uso: cuántos entran, cuánto se quedan, si vuelven, qué eligen y de qué mueren.
// Todo anónimo: un identificador aleatorio por navegador (sin nombre de cuenta ni PIN), una sesión por
// apertura del juego y una partida por run; mejoras y compras se anotan en el momento. Se escribe en
// Supabase a través de las funciones dz_* (supabase/esquema.sql) y se lee en /stats (stats.html).
// No se manda nada en desarrollo (localhost o VERSION 'dev'), desde Playwright ni si se abrió el juego con ?sinstats.
import { VERSION } from './core/version.ts';
import { storage } from './core/util.ts';
import { activo, rpc } from './net/supabase.ts';

const DEV_KEY = 'dz-dispositivo';
const OFF_KEY = 'dz-sinstats';
const LATIDO_MS = 60000;

function uuid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  // navegadores viejos: uuid v4 a mano
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

// ¿Este navegador no cuenta? (desarrollo, pruebas automáticas o ?sinstats, que se recuerda)
function apagado() {
  try {
    if (new URLSearchParams(location.search).has('sinstats')) storage.set(OFF_KEY, 1);
  } catch {
    /* sin location */
  }
  // (Vite inyecta la versión también en `npm run dev`, así que el desarrollo se reconoce por el host)
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith('.local');
  return VERSION === 'dev' || local || !!navigator.webdriver || !!storage.get(OFF_KEY, 0) || !activo();
}

// Nombre de la causa de muerte como se guarda: tipo de zombi, 'bull_charge' (cornada) o 'acid'.
export const causaDe = (p) => (p && p.lastHit) || 'desconocida';

export class Analitica {
  constructor(game) {
    this.game = game;
    this.off = apagado();
    let dev = storage.get(DEV_KEY, null);
    if (typeof dev !== 'string' || dev.length !== 36) {
      dev = uuid();
      storage.set(DEV_KEY, dev);
    }
    this.dispositivo = dev;
    this.sesion = { id: uuid(), partidas: 0 };
    this.partida = null;
    if (this.off) return;
    this.enviar('dz_sesion', {
      s: {
        id: this.sesion.id,
        dispositivo: dev,
        version: VERSION,
        tactil: game.input.mode === 'touch',
        origen: location.host + location.pathname.replace(/index\.html$/, ''),
        partidas: 0,
      },
    });
    setInterval(() => this.latido(false), LATIDO_MS);
    window.addEventListener('pagehide', () => this.latido(true));
    document.addEventListener('visibilitychange', () => document.hidden && this.latido(true));
  }

  enviar(fn, args, final = false) {
    if (this.off) return;
    rpc(fn, args, final).catch(() => {
      /* sin conexión: la estadística se pierde, el juego sigue */
    });
  }

  // Cada minuto y al cerrar: la sesión sigue viva y la partida en curso guarda hasta dónde va.
  latido(final) {
    if (this.off) return;
    this.enviar(
      'dz_sesion',
      { s: { id: this.sesion.id, dispositivo: this.dispositivo, partidas: this.sesion.partidas } },
      final,
    );
    if (this.partida && this.partida.fin === 'en_curso') this.guardar(final);
  }

  /**
   * Empieza (o reanuda, si viene `id` del guardado) una partida. `modo`: 'solo' u 'online'.
   */
  iniciar(modo, id = null) {
    if (this.off) return;
    const g = this.game;
    if (!id) this.sesion.partidas++;
    this.partida = {
      id: id || uuid(),
      modo,
      clase: (g.player && g.player.cls) || null,
      fin: 'en_curso',
      causa: null,
      oleada_muerte: null,
      arma_muerte: null,
    };
    this.guardar(false);
  }

  // La partida en curso tal como está ahora (oleada, tiempo, nivel, bajas y cómo acabó).
  guardar(final) {
    const pa = this.partida;
    const g = this.game;
    if (!pa) return;
    const bajas = {};
    let total = 0;
    for (const [k, n] of Object.entries(g.kills || {})) {
      if (n > 0) bajas[k] = n;
      total += n || 0;
    }
    this.enviar(
      'dz_partida',
      {
        p: {
          id: pa.id,
          sesion: this.sesion.id,
          dispositivo: this.dispositivo,
          modo: pa.modo,
          clase: pa.clase,
          duracion: Math.round(g.time || 0),
          oleada: g.director ? g.director.wave : 0,
          nivel: g.level || 1,
          bajas,
          bajas_total: total,
          fin: pa.fin,
          causa: pa.causa,
          oleada_muerte: pa.oleada_muerte,
          arma_muerte: pa.arma_muerte,
          version: VERSION,
        },
      },
      final,
    );
  }

  // Al subir de nivel: qué se ofreció y qué se eligió.
  eleccion(nivel, ofrecidas, elegida) {
    if (!this.partida) return;
    this.enviar('dz_eleccion', {
      e: { partida: this.partida.id, dispositivo: this.dispositivo, nivel, ofrecidas, elegida },
    });
  }

  // En la tienda: `tipo` arma | municion | objeto | robot | reparacion | municion_pesada.
  compra(tipo, item, precio, cantidad = 1) {
    if (!this.partida) return;
    const g = this.game;
    this.enviar('dz_compra', {
      c: {
        partida: this.partida.id,
        dispositivo: this.dispositivo,
        tipo,
        item,
        cantidad,
        precio,
        oleada: g.director ? g.director.wave : 0,
      },
    });
  }

  // Murió el jugador. En solitario acaba la partida; en línea puede revivir, así que sólo se anota la
  // primera causa y la partida sigue hasta que la sala termina.
  muerte(causa) {
    const pa = this.partida;
    const g = this.game;
    if (!pa || pa.fin !== 'en_curso') return;
    if (!pa.causa) {
      pa.causa = causa || 'desconocida';
      pa.oleada_muerte = g.director ? g.director.wave : 0;
      const w = g.player && g.player.weapons && g.player.weapons[g.player.wi];
      pa.arma_muerte = (w && w.id) || null;
    }
    if (pa.modo === 'solo') pa.fin = 'muerte';
    this.guardar(false);
  }

  // Fin de una partida en línea: 'fin' (la sala terminó) o 'abandono' (se salió o se cayó).
  terminar(fin) {
    const pa = this.partida;
    if (!pa || pa.fin !== 'en_curso') return;
    pa.fin = pa.causa && fin === 'fin' ? 'muerte' : fin;
    this.guardar(true);
  }
}

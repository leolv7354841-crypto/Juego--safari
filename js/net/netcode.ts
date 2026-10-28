// Piezas del multijugador en línea que no dependen del navegador (las usan el cliente y las
// pruebas del servidor): predicción con reconciliación del jugador propio e interpolación
// de los demás a partir de las fotos del servidor.
import { NET } from '../core/config.ts';
import { IN_RUN } from './protocol.ts';

export const TICK = 1 / NET.tickHz;

const silent = new Proxy({}, { get: () => () => {} });

// Estado del jugador que manda el servidor y que la predicción restaura.
// boostT: impulso del Booster (lo baja Player.move, así que se predice igual que el movimiento)
export const BODY = ['x', 'y', 'vx', 'vy', 'kx', 'ky', 'stamina', 'sinceRun', 'legAngle', 'boostT'];

export function packBody(p) {
  return [...BODY.map((k) => Math.round(p[k] * 100) / 100), p.exhausted ? 1 : 0];
}

export function unpackBody(p, a) {
  if (!Array.isArray(a) || a.length < BODY.length + 1) return false;
  for (let i = 0; i < BODY.length; i++) if (!Number.isFinite(a[i])) return false;
  BODY.forEach((k, i) => (p[k] = a[i]));
  p.exhausted = !!a[BODY.length];
  return true;
}

// Aplica una entrada al cuerpo del jugador (igual en el servidor y en el cliente).
/**
 * @param {import('../sim/player.ts').Player} p
 * @param {import('../core/types.js').Cmd} cmd
 * @param {Pick<import('../core/types.js').GameHost, 'world' | 'sfx'>} game
 */
export function applyMove(
  p: import('../sim/player.ts').Player,
  cmd: import('../core/types.js').Cmd,
  game: Pick<import('../core/types.js').GameHost, 'world' | 'sfx'>,
) {
  p.move(TICK, cmd.mx, cmd.my, !!(cmd.f & IN_RUN), game);
}

// Predicción local: cada entrada se aplica al instante y se guarda hasta que el servidor
// confirma que la procesó. Al llegar el estado confirmado se restaura y se vuelven a
// aplicar las pendientes. La diferencia con lo que se veía se borra poco a poco (offset).
export class Predictor {
  declare p: any;
  declare quiet: any;
  declare pending: any;
  declare seq: any;
  declare ox: any;
  declare oy: any;
  declare corrections: any;
  declare corrSum: any;
  declare corrMax: any;
  declare snaps: any;
  constructor(player, world) {
    this.p = player;
    this.quiet = { world, sfx: silent };
    this.pending = [];
    this.seq = 0;
    this.ox = 0;
    this.oy = 0;
    this.corrections = 0;
    this.corrSum = 0;
    this.corrMax = 0;
    this.snaps = 0;
  }

  // game: el juego real (para los sonidos); en las repeticiones se usa uno mudo.
  step(cmd, game?) {
    cmd.s = ++this.seq;
    applyMove(this.p, cmd, game || this.quiet);
    this.pending.push(cmd);
    // si el servidor deja de confirmar, no se acumula sin fin
    if (this.pending.length > NET.pendingMax) this.pending.shift();
    return cmd;
  }

  reconcile(body, ack) {
    const p = this.p;
    const bx = p.x;
    const by = p.y;
    let n = 0;
    while (n < this.pending.length && this.pending[n].s <= ack) n++;
    if (n) this.pending.splice(0, n);
    if (!unpackBody(p, body)) return 0;
    for (const cmd of this.pending) applyMove(p, cmd, this.quiet);
    const ex = bx - p.x;
    const ey = by - p.y;
    const err = Math.hypot(ex, ey);
    if (err > 0.5) {
      this.corrections++;
      this.corrSum += err;
      this.corrMax = Math.max(this.corrMax, err);
    }
    if (err > NET.snapDist) {
      // error grande (empujón fuerte, reaparición): directo a la posición buena
      this.ox = 0;
      this.oy = 0;
      this.snaps++;
    } else {
      // error pequeño: se dibuja donde se veía y se acerca suave a la posición buena
      this.ox += ex;
      this.oy += ey;
    }
    return err;
  }

  decay(dt) {
    const k = Math.exp(-dt * NET.smooth);
    this.ox *= k;
    this.oy *= k;
    if (Math.abs(this.ox) < 0.05) this.ox = 0;
    if (Math.abs(this.oy) < 0.05) this.oy = 0;
  }

  // correcciones del último periodo (para el diagnóstico) y reinicio del contador
  takeStats() {
    const s = {
      n: this.corrections,
      avg: this.corrections ? this.corrSum / this.corrections : 0,
      max: this.corrMax,
      snaps: this.snaps,
    };
    this.corrections = 0;
    this.corrSum = 0;
    this.corrMax = 0;
    this.snaps = 0;
    return s;
  }
}

// Reloj del servidor visto desde aquí: off = hora local - hora del servidor (con el retraso de
// ida más corto visto). Se ajusta despacio para que el dibujo no dé saltos.
export class ServerClock {
  declare off: any;
  constructor() {
    this.off = null;
  }
  sync(serverMs, localMs) {
    const raw = localMs - serverMs;
    if (this.off === null || raw < this.off) this.off = raw;
    else this.off += (raw - this.off) * 0.01;
  }
  now(localMs) {
    return this.off === null ? 0 : localMs - this.off;
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Fotos de una entidad (tiempo del servidor + valores) para dibujarla un poco en diferido.
// ang = índices de los valores que son ángulos.
export class Interp {
  declare ang: any;
  declare max: any;
  declare extrapolate: any;
  declare t: any;
  declare v: any;
  constructor(ang: number[] = [], max = 24, extrapolate = NET.maxExtrapolate) {
    this.ang = ang;
    this.max = max;
    this.extrapolate = extrapolate;
    this.t = [];
    this.v = [];
  }
  // las fotos viejas que llegan tarde no hacen retroceder a nadie
  push(t, vals) {
    const n = this.t.length;
    if (n && t <= this.t[n - 1]) return false;
    this.t.push(t);
    this.v.push(vals);
    if (n + 1 > this.max) {
      this.t.shift();
      this.v.shift();
    }
    return true;
  }
  get last() {
    return this.v[this.v.length - 1];
  }
  // escribe en out los valores en el instante t (extrapola como mucho `extrapolate` ms, NET.maxExtrapolate por omisión)
  sample(t, out) {
    const T = this.t;
    const V = this.v;
    const n = T.length;
    if (!n) return false;
    let a = 0;
    let b = 0;
    let k = 0;
    if (t <= T[0]) {
      a = b = 0;
    } else if (t >= T[n - 1]) {
      if (n === 1) a = b = 0;
      else {
        a = n - 2;
        b = n - 1;
        const span = T[b] - T[a] || 1;
        k = 1 + Math.min(t - T[b], this.extrapolate) / span;
      }
    } else {
      // la foto anterior y la siguiente al instante pedido
      let i = n - 1;
      while (i > 0 && T[i - 1] > t) i--;
      a = i - 1;
      b = i;
      k = (t - T[a]) / (T[b] - T[a] || 1);
    }
    const va = V[a];
    const vb = V[b];
    for (let i = 0; i < vb.length; i++) {
      if (this.ang.includes(i)) out[i] = lerpAngle(va[i], vb[i], k);
      else if (typeof vb[i] === 'number' && typeof va[i] === 'number') out[i] = va[i] + (vb[i] - va[i]) * k;
      else out[i] = vb[i];
    }
    // lo viejo que ya no hace falta se descarta
    while (T.length > 2 && T[1] < t - 1000) {
      T.shift();
      V.shift();
    }
    return true;
  }
}

// Piezas del multijugador en línea que no dependen del navegador (las usan el cliente y las
// pruebas del servidor): predicción con reconciliación del jugador propio e interpolación
// de los demás a partir de las fotos del servidor.
import { NET } from '../core/config.ts';
import { IN_RUN } from './protocol.ts';
import type { Player } from '../sim/player.ts';
import type { Cmd, GameHost } from '../core/types.d.ts';

export const TICK = 1 / NET.tickHz;

// Estado del jugador que manda el servidor y que la predicción restaura.
// boostT: impulso del Booster (lo baja Player.move, así que se predice igual que el movimiento)
type BodyKey = 'x' | 'y' | 'vx' | 'vy' | 'kx' | 'ky' | 'stamina' | 'sinceRun' | 'legAngle' | 'boostT';
export const BODY: BodyKey[] = ['x', 'y', 'vx', 'vy', 'kx', 'ky', 'stamina', 'sinceRun', 'legAngle', 'boostT'];

// Aplica una entrada al cuerpo del jugador (igual en el servidor y en el cliente).
export function applyMove(p: Player, cmd: Cmd, game: Pick<GameHost, 'world' | 'sfx'>) {
  p.move(TICK, cmd.mx, cmd.my, !!(cmd.f & IN_RUN), game);
}

// Reloj del servidor visto desde aquí: off = hora local - hora del servidor (con el retraso de
// ida más corto visto). Se ajusta despacio para que el dibujo no dé saltos.
export class ServerClock {
  declare off: number | null;
  constructor() {
    this.off = null;
  }
  sync(serverMs: number, localMs: number) {
    const raw = localMs - serverMs;
    if (this.off === null || raw < this.off) this.off = raw;
    else this.off += (raw - this.off) * 0.01;
  }
  now(localMs: number) {
    return this.off === null ? 0 : localMs - this.off;
  }
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Fotos de una entidad (tiempo del servidor + valores) para dibujarla un poco en diferido.
// ang = índices de los valores que son ángulos.
export class Interp {
  declare ang: number[];
  declare max: number;
  declare extrapolate: number;
  declare t: number[];
  declare v: number[][];
  constructor(ang: number[] = [], max = 24, extrapolate = NET.maxExtrapolate) {
    this.ang = ang;
    this.max = max;
    this.extrapolate = extrapolate;
    this.t = [];
    this.v = [];
  }
  // las fotos viejas que llegan tarde no hacen retroceder a nadie
  push(t: number, vals: number[]) {
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
  sample(t: number, out: number[]) {
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

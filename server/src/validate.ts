// Validación de todo lo que llega de los clientes: nunca se confía en su contenido.

const NAME_RE = /^[\p{L}\p{N} _.-]{1,16}$/u;

// Nombre limpio o null si no es válido (1 a 16 letras, números, espacio, _ . -).
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  return NAME_RE.test(s) ? s : null;
}

// Colores del personaje: un dígito por parte (índice en LOOK_PARTS de js/sprites.js).
// Si no es válido se usa el aspecto original; no es motivo para rechazar la entrada.
const LOOK_RE = /^[0-9]{1,8}$/;
export function cleanLookCode(raw: unknown): string {
  return typeof raw === 'string' && LOOK_RE.test(raw) ? raw : '';
}

export type Cmd = { s: number; mx: number; my: number; f: number; a: number; w: number };

// Una entrada: [secuencia, mx, my, bits, ángulo, arma]. null si está mal formada.
export function cleanCmd(raw: unknown): Cmd | null {
  if (!Array.isArray(raw) || raw.length !== 6) return null;
  const [s, mx0, my0, f, a0, w] = raw;
  if (!Number.isSafeInteger(s) || s <= 0) return null;
  if (typeof mx0 !== 'number' || typeof my0 !== 'number' || typeof a0 !== 'number') return null;
  if (!Number.isFinite(mx0) || !Number.isFinite(my0) || !Number.isFinite(a0)) return null;
  if (!Number.isInteger(f) || f < 0 || f > 7) return null;
  if (!Number.isInteger(w) || w < -1 || w > 8) return null;
  let mx = Math.max(-1, Math.min(1, mx0));
  let my = Math.max(-1, Math.min(1, my0));
  const m = Math.hypot(mx, my);
  if (m > 1) {
    mx /= m;
    my /= m;
  }
  if (Math.abs(a0) > 1000) return null;
  const a = Math.atan2(Math.sin(a0), Math.cos(a0));
  return { s, mx, my, f, a, w };
}

// Acción de un jugador ligada a su última entrada (s): construir, lanzar o subir al robot.
export type Act = { s: number; k: 'build' | 'throw' | 'robot'; kind: string; tx: number; ty: number };

const KIND_RE = /^[a-z]{1,12}$/;

export function cleanAct(raw: any): Act | null {
  if (!raw || typeof raw !== 'object') return null;
  const { s, k } = raw;
  if (!Number.isSafeInteger(s) || s < 0) return null;
  if (k !== 'build' && k !== 'throw' && k !== 'robot') return null;
  const kind = k === 'robot' ? '' : raw.kind;
  if (typeof kind !== 'string' || (k !== 'robot' && !KIND_RE.test(kind))) return null;
  let tx = 0;
  let ty = 0;
  if (k === 'throw') {
    tx = raw.tx;
    ty = raw.ty;
    if (
      typeof tx !== 'number' ||
      typeof ty !== 'number' ||
      !Number.isFinite(tx) ||
      !Number.isFinite(ty) ||
      Math.abs(tx) > 1e5 ||
      Math.abs(ty) > 1e5
    )
      return null;
  }
  return { s, k, kind, tx, ty };
}

// Cubeta de fichas: permite ráfagas cortas y limita el promedio por segundo.
export class Bucket {
  rate: number;
  cap: number;
  tokens: number;
  at: number;
  constructor(rate: number, cap: number) {
    this.rate = rate;
    this.cap = cap;
    this.tokens = cap;
    this.at = performance.now();
  }
  take(n = 1): boolean {
    const now = performance.now();
    this.tokens = Math.min(this.cap, this.tokens + ((now - this.at) / 1000) * this.rate);
    this.at = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

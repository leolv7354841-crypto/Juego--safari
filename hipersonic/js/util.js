// HIPERSONIC — utilidades compartidas.
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const smooth = (t) => t * t * (3 - 2 * t);

// Generador determinista (para que la ciudad y las texturas salgan siempre iguales).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rrange = (rng, a, b) => a + rng() * (b - a);
export const rpick = (rng, arr) => arr[(rng() * arr.length) | 0];

// Hash entero de dos coordenadas → [0, 1).
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
// Gira `a` hacia `b` como máximo `step` radianes.
export function angleTo(a, b, step) {
  const d = angleDiff(a, b);
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
}

export function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Aclara (k > 1) u oscurece (k < 1) un color hexadecimal.
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => clamp(Math.round(c * k + (k > 1 ? (k - 1) * 40 : 0)), 0, 255);
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
export function mix(a, b, t) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(lerp((x >> s) & 255, (y >> s) & 255, t));
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
}
export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Distancia de un punto al segmento AB (y el parámetro t del punto más cercano).
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return { d: Math.hypot(px - cx, py - cy), cx, cy, t };
}

export function storage() {
  try {
    const k = '__hs';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

// Arte de la ciudad: texturas que se repiten (asfalto, pasto, adoquín, techos), techos de
// edificios con sus detalles y el mobiliario urbano. Todo se pinta una vez y se reutiliza.
import { TAU, makeCanvas, mulberry32, rrange, rpick, shade, roundRect, rgba } from '../util.js';
import { OUT } from './characters.js';

/* ---------- Texturas que se repiten ---------- */

const TEX_RES = 2; // las texturas se pintan al doble de resolución

function texture(size, seed, paint) {
  const c = makeCanvas(size * TEX_RES, size * TEX_RES);
  const g = c.getContext('2d');
  g.scale(TEX_RES, TEX_RES);
  paint(g, size, mulberry32(seed));
  c.worldSize = size;
  return c;
}
function noise(g, s, rng, n, colors, a, b) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rpick(rng, colors);
    const r = rrange(rng, a, b);
    g.fillRect(rng() * s, rng() * s, r, r);
  }
}
function blotches(g, s, rng, n, color, rmin, rmax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rng() * s;
    const y = rng() * s;
    const r = rrange(rng, rmin, rmax);
    for (const [ox, oy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, rgba(color, alpha * rng()));
      gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}

export function buildTextures() {
  const T = {};
  T.asphalt = texture(256, 11, (g, s, rng) => {
    g.fillStyle = '#3a3c3f';
    g.fillRect(0, 0, s, s);
    blotches(g, s, rng, 14, '#24262a', 20, 60, 0.5);
    blotches(g, s, rng, 10, '#55575a', 18, 50, 0.25);
    noise(g, s, rng, 4200, ['#2c2e31', '#46484b', '#323438', '#525458', '#28292c'], 0.5, 1.3);
    noise(g, s, rng, 260, ['#6a6c6e', '#1c1d20'], 1, 1.8);
  });
  T.asphaltDark = texture(256, 12, (g, s, rng) => {
    g.fillStyle = '#2f3134';
    g.fillRect(0, 0, s, s);
    blotches(g, s, rng, 12, '#1e2023', 20, 60, 0.5);
    noise(g, s, rng, 3800, ['#26282b', '#3a3c40', '#2c2e31', '#45474b'], 0.5, 1.3);
  });
  T.concrete = texture(128, 13, (g, s, rng) => {
    g.fillStyle = '#8e8b84';
    g.fillRect(0, 0, s, s);
    blotches(g, s, rng, 8, '#6d6a63', 10, 30, 0.35);
    noise(g, s, rng, 1400, ['#817e77', '#9b9891', '#77746d', '#a6a39c'], 0.5, 1.1);
  });
  T.grass = texture(256, 14, (g, s, rng) => {
    g.fillStyle = '#3d5a2a';
    g.fillRect(0, 0, s, s);
    blotches(g, s, rng, 16, '#2c4420', 20, 60, 0.7);
    blotches(g, s, rng, 12, '#5a7a36', 15, 45, 0.45);
    g.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const x = rng() * s;
      const y = rng() * s;
      const a = -Math.PI / 2 + rrange(rng, -0.7, 0.7);
      const l = rrange(rng, 1.5, 4);
      g.strokeStyle = rpick(rng, ['#2e4a20', '#4a6c30', '#577a38', '#365426', '#6a8a44']);
      g.lineWidth = rrange(rng, 0.5, 1);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = rpick(rng, ['#d8d0a0', '#e8e4d8', '#c9a0b0']);
      g.beginPath();
      g.arc(rng() * s, rng() * s, 0.8, 0, TAU);
      g.fill();
    }
  });
  T.dirt = texture(128, 15, (g, s, rng) => {
    g.fillStyle = '#6e5a40';
    g.fillRect(0, 0, s, s);
    blotches(g, s, rng, 10, '#4f3f2c', 10, 30, 0.5);
    noise(g, s, rng, 1600, ['#7d6849', '#5e4c35', '#8a7655', '#4a3b29'], 0.6, 1.6);
  });
  T.pavers = texture(96, 16, (g, s, rng) => {
    g.fillStyle = '#5b5550';
    g.fillRect(0, 0, s, s);
    const w = 16;
    const h = 8;
    for (let y = 0; y < s; y += h) {
      for (let x = -w; x < s; x += w) {
        const ox = (y / h) % 2 ? w / 2 : 0;
        g.fillStyle = shade(rpick(rng, ['#9a8a78', '#8c7b69', '#a39482', '#857463']), rrange(rng, 0.9, 1.08));
        roundRect(g, x + ox + 0.6, y + 0.6, w - 1.2, h - 1.2, 1.2);
        g.fill();
      }
    }
    noise(g, s, rng, 700, ['rgba(0,0,0,0.15)', 'rgba(255,255,255,0.08)'], 0.5, 1);
  });
  T.bricks = texture(96, 17, (g, s, rng) => {
    g.fillStyle = '#5a2e26';
    g.fillRect(0, 0, s, s);
    const w = 12;
    const h = 6;
    for (let y = 0; y < s; y += h) {
      for (let x = -w; x < s; x += w) {
        const ox = (y / h) % 2 ? w / 2 : 0;
        g.fillStyle = shade(rpick(rng, ['#9b4a3a', '#a85544', '#8c4033', '#b2604b', '#94473a']), rrange(rng, 0.9, 1.1));
        g.fillRect(x + ox + 0.5, y + 0.5, w - 1, h - 1);
      }
    }
    noise(g, s, rng, 900, ['rgba(0,0,0,0.18)', 'rgba(255,220,200,0.08)'], 0.5, 1.2);
  });
  T.tar = texture(128, 18, (g, s, rng) => {
    g.fillStyle = '#4a4b4d';
    g.fillRect(0, 0, s, s);
    blotches(g, s, rng, 8, '#38393b', 12, 35, 0.6);
    noise(g, s, rng, 3000, ['#5a5b5d', '#3e3f41', '#646567', '#333436', '#6e6a62'], 0.5, 1.4);
  });
  T.roofConcrete = texture(128, 19, (g, s, rng) => {
    g.fillStyle = '#7b7a76';
    g.fillRect(0, 0, s, s);
    blotches(g, s, rng, 9, '#5f5e5a', 12, 36, 0.45);
    noise(g, s, rng, 1800, ['#86857f', '#6e6d69', '#918f89'], 0.5, 1.2);
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 0.8;
    for (let v = 0; v <= s; v += 32) {
      g.beginPath();
      g.moveTo(v, 0);
      g.lineTo(v, s);
      g.moveTo(0, v);
      g.lineTo(s, v);
      g.stroke();
    }
  });
  T.metal = texture(64, 20, (g, s, rng) => {
    g.fillStyle = '#6e7880';
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 4) {
      const lg = g.createLinearGradient(x, 0, x + 4, 0);
      lg.addColorStop(0, '#8a949b');
      lg.addColorStop(0.5, '#5d666d');
      lg.addColorStop(1, '#7b858c');
      g.fillStyle = lg;
      g.fillRect(x, 0, 4, s);
    }
    noise(g, s, rng, 300, ['rgba(120,70,40,0.25)', 'rgba(0,0,0,0.15)'], 0.6, 2);
  });
  T.greenRoof = texture(128, 21, (g, s, rng) => {
    g.fillStyle = '#4a5e38';
    g.fillRect(0, 0, s, s);
    blotches(g, s, rng, 10, '#33452a', 10, 30, 0.6);
    noise(g, s, rng, 2200, ['#5b7344', '#3f522f', '#6b8450'], 0.6, 1.6);
  });
  return T;
}

// Patrón alineado al mundo (el lienzo de la textura está al doble de resolución).
const patCache = new WeakMap();
export function pattern(g, tex) {
  let m = patCache.get(g);
  if (!m) patCache.set(g, (m = new Map()));
  let p = m.get(tex);
  if (!p) {
    p = g.createPattern(tex, 'repeat');
    if (p.setTransform) p.setTransform(new DOMMatrix([1 / TEX_RES, 0, 0, 1 / TEX_RES, 0, 0]));
    m.set(tex, p);
  }
  return p;
}

/* ---------- Árboles ---------- */

export function paintTree(g, R, seed, kind) {
  const rng = mulberry32(seed);
  const base = kind === 'autumn' ? '#a8642c' : kind === 'dark' ? '#2d4a2a' : rpick(rng, ['#3f6a2e', '#456f31', '#3a6232']);
  const blobs = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rrange(rng, -0.2, 0.2);
    const d = R * rrange(rng, 0.42, 0.6);
    blobs.push([Math.cos(a) * d, Math.sin(a) * d, R * rrange(rng, 0.38, 0.5)]);
  }
  blobs.push([0, 0, R * 0.62]);
  // contorno: la unión de todas las copas, engordada
  g.fillStyle = OUT;
  for (const [x, y, r] of blobs) {
    g.beginPath();
    g.arc(x, y, r + 1.8, 0, TAU);
    g.fill();
  }
  g.fillStyle = shade(base, 0.72);
  for (const [x, y, r] of blobs) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  // cada copa con su volumen (luz arriba a la izquierda)
  for (const [x, y, r] of blobs) {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, shade(base, 1.35));
    gr.addColorStop(0.6, base);
    gr.addColorStop(1, shade(base, 0.75));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x - r * 0.06, y - r * 0.08, r * 0.9, 0, TAU);
    g.fill();
  }
  // hojas
  for (let i = 0; i < 160; i++) {
    const a = rng() * TAU;
    const d = Math.sqrt(rng()) * R * 0.95;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    const lit = -(x + y) / (R * 1.4);
    g.fillStyle = lit > 0.1 ? rgba(shade(base, 1.5), 0.6) : rgba(shade(base, 0.6), 0.55);
    g.beginPath();
    g.ellipse(x, y, rrange(rng, 1.2, 2.6), rrange(rng, 0.8, 1.6), rng() * TAU, 0, TAU);
    g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1;
  for (const [x, y, r] of blobs.slice(0, 5)) {
    g.beginPath();
    g.arc(x, y, r * 0.8, 0.3, 1.6);
    g.stroke();
  }
}

/* ---------- Mobiliario ---------- */

function box(g, x, y, w, h, r, fill, lw = 1.4) {
  roundRect(g, x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = OUT;
  g.stroke();
}
function sheen(g, x, y, w, h) {
  const lg = g.createLinearGradient(x, y, x + w, y + h);
  lg.addColorStop(0, 'rgba(255,255,255,0.22)');
  lg.addColorStop(0.5, 'rgba(255,255,255,0)');
  lg.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = lg;
  g.fill();
}

export const PROPS = {
  bench: [44, 18, (g) => {
    box(g, -21, -8, 42, 16, 2, '#3a3d40');
    for (let i = 0; i < 4; i++) {
      roundRect(g, -19, -6.5 + i * 3.4, 38, 2.6, 1);
      g.fillStyle = i % 2 ? '#8a5f38' : '#9a6c40';
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.lineWidth = 0.5;
      g.stroke();
    }
    box(g, -22, -9, 4, 18, 1, '#2a2c2f', 1.1);
    box(g, 18, -9, 4, 18, 1, '#2a2c2f', 1.1);
  }],
  bin: [16, 16, (g) => {
    g.beginPath();
    g.arc(0, 0, 7, 0, TAU);
    g.fillStyle = '#3f5a48';
    g.fill();
    sheen(g, -7, -7, 14, 14);
    g.lineWidth = 1.4;
    g.strokeStyle = OUT;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 4.6, 0, TAU);
    g.fillStyle = '#1d211f';
    g.fill();
    g.fillStyle = '#d8d2c4';
    g.fillRect(-2, -1, 3, 2);
    g.fillStyle = '#c94a3a';
    g.fillRect(1, 0.5, 2, 1.5);
  }],
  hydrant: [14, 14, (g) => {
    box(g, -6, -2, 12, 4, 1.5, '#a8322a', 1.1);
    g.beginPath();
    g.arc(0, 0, 4.6, 0, TAU);
    g.fillStyle = '#c63d31';
    g.fill();
    sheen(g, -5, -5, 10, 10);
    g.lineWidth = 1.3;
    g.strokeStyle = OUT;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 2.2, 0, TAU);
    g.fillStyle = '#e6c04a';
    g.fill();
    g.stroke();
  }],
  newsbox: [16, 14, (g) => {
    box(g, -7, -6, 14, 12, 1.5, '#2f5f9a');
    sheen(g, -7, -6, 14, 12);
    g.fillStyle = '#d9e2ec';
    g.fillRect(-5, -2, 10, 4);
  }],
  dumpster: [52, 30, (g) => {
    box(g, -25, -14, 50, 28, 2, '#2f5a3c', 1.8);
    sheen(g, -25, -14, 50, 28);
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -14);
    g.lineTo(0, 14);
    for (let x = -20; x < 25; x += 5) {
      g.moveTo(x, -12);
      g.lineTo(x, 12);
    }
    g.stroke();
    g.fillStyle = '#e0c040';
    g.fillRect(-25, -14, 4, 28);
  }],
  planter: [26, 26, (g) => {
    box(g, -11, -11, 22, 22, 2, '#7b746a');
    g.fillStyle = '#4a3a28';
    g.fillRect(-8, -8, 16, 16);
    const rng = mulberry32(5);
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.arc(rrange(rng, -5, 5), rrange(rng, -5, 5), rrange(rng, 2.5, 4.5), 0, TAU);
      g.fillStyle = rpick(rng, ['#4f7a34', '#5e8a3e', '#3e6a2c']);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.lineWidth = 0.6;
      g.stroke();
    }
    g.fillStyle = '#d96a8a';
    g.beginPath();
    g.arc(-2, 2, 1.4, 0, TAU);
    g.arc(3, -3, 1.2, 0, TAU);
    g.fill();
  }],
  manhole: [22, 22, (g) => {
    g.beginPath();
    g.arc(0, 0, 9.5, 0, TAU);
    g.fillStyle = '#2b2c2e';
    g.fill();
    g.lineWidth = 1.6;
    g.strokeStyle = '#18191b';
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 8, 0, TAU);
    g.fillStyle = '#4a4b4e';
    g.fill();
    g.strokeStyle = '#2a2b2d';
    g.lineWidth = 0.9;
    for (let i = -6; i <= 6; i += 2.4) {
      const w = Math.sqrt(64 - i * i);
      g.beginPath();
      g.moveTo(-w, i);
      g.lineTo(w, i);
      g.stroke();
    }
    g.beginPath();
    g.arc(0, 0, 8, 0, TAU);
    sheen(g, -8, -8, 16, 16);
  }],
  drain: [26, 10, (g) => {
    box(g, -12, -4, 24, 8, 1, '#2a2b2d', 1.2);
    g.fillStyle = '#121314';
    for (let x = -10; x < 11; x += 3) g.fillRect(x, -2.6, 1.6, 5.2);
  }],
  pit: [30, 30, (g) => {
    box(g, -13, -13, 26, 26, 1, '#6d6a62', 1.3);
    g.fillStyle = '#3a2e22';
    g.fillRect(-11, -11, 22, 22);
    g.strokeStyle = '#2a2b2d';
    g.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
      g.lineTo(Math.cos(a) * 10.5, Math.sin(a) * 10.5);
      g.stroke();
    }
    g.beginPath();
    g.arc(0, 0, 4, 0, TAU);
    g.fillStyle = '#4a3624';
    g.fill();
    g.stroke();
  }],
  pole: [12, 12, (g) => {
    g.beginPath();
    g.arc(0, 0, 4.2, 0, TAU);
    g.fillStyle = '#3d4248';
    g.fill();
    sheen(g, -4, -4, 8, 8);
    g.lineWidth = 1.3;
    g.strokeStyle = OUT;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 1.6, 0, TAU);
    g.fillStyle = '#5c636b';
    g.fill();
  }],
  bollard: [8, 8, (g) => {
    g.beginPath();
    g.arc(0, 0, 3, 0, TAU);
    g.fillStyle = '#d9b84a';
    g.fill();
    g.lineWidth = 1.1;
    g.strokeStyle = OUT;
    g.stroke();
  }],
  cone: [12, 12, (g) => {
    box(g, -5.5, -5.5, 11, 11, 1.5, '#e06a28', 1.1);
    g.beginPath();
    g.arc(0, 0, 3.4, 0, TAU);
    g.fillStyle = '#f0f0ea';
    g.fill();
    g.beginPath();
    g.arc(0, 0, 1.8, 0, TAU);
    g.fillStyle = '#e06a28';
    g.fill();
  }],
  // farola: brazo + cabeza (se dibuja por encima de los personajes)
  lampHead: [40, 12, (g) => {
    g.strokeStyle = OUT;
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(28, 0);
    g.stroke();
    g.strokeStyle = '#4a5058';
    g.lineWidth = 2;
    g.stroke();
    box(g, 24, -4.5, 14, 9, 3.5, '#3a3f45', 1.3);
    roundRect(g, 26, -2.6, 10, 5.2, 2.4);
    g.fillStyle = '#ffe6a8';
    g.fill();
  }, { ax: 2 }],
  awning: [60, 20, (g) => {
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? '#e8e2d4' : '#b8423a';
      g.fillRect(-30 + i * 10, -10, 10, 20);
    }
    g.strokeStyle = OUT;
    g.lineWidth = 1.5;
    g.strokeRect(-30, -10, 60, 20);
    const lg = g.createLinearGradient(0, -10, 0, 10);
    lg.addColorStop(0, 'rgba(255,255,255,0.15)');
    lg.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = lg;
    g.fillRect(-30, -10, 60, 20);
  }],
};

// Semáforo: caja con tres luces; `lit` = 'r' | 'y' | 'g'
export function paintSignal(g, lit) {
  box(g, -12, -5, 24, 10, 2, '#24272b', 1.3);
  const cols = { r: ['#ff4a3a', '#5a1d18'], y: ['#ffc23a', '#5a4418'], g: ['#4dff8a', '#174a2a'] };
  ['r', 'y', 'g'].forEach((k, i) => {
    g.beginPath();
    g.arc(-7 + i * 7, 0, 2.7, 0, TAU);
    g.fillStyle = lit === k ? cols[k][0] : cols[k][1];
    g.fill();
    g.lineWidth = 0.7;
    g.strokeStyle = '#0d0e10';
    g.stroke();
  });
}

/* ---------- Palomas (vida en la ciudad) ---------- */

export function paintPigeon(g, flap) {
  if (flap) {
    g.fillStyle = '#7d8590';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(-2, s * 7, -5, s * 8);
      g.lineTo(-3, s * 2);
      g.closePath();
      g.fill();
      g.lineWidth = 0.8;
      g.strokeStyle = OUT;
      g.stroke();
    }
  }
  g.beginPath();
  g.ellipse(0, 0, 4.2, 2.4, 0, 0, TAU);
  g.fillStyle = '#9aa1aa';
  g.fill();
  g.lineWidth = 0.9;
  g.strokeStyle = OUT;
  g.stroke();
  g.beginPath();
  g.arc(3.4, 0, 1.6, 0, TAU);
  g.fillStyle = '#6b7380';
  g.fill();
  g.stroke();
  g.fillStyle = '#e0a040';
  g.fillRect(4.8, -0.4, 1.2, 0.8);
}

/* ---------- Techos ---------- */

export const ROOF_STYLES = ['bricks', 'tar', 'concrete', 'metal', 'tar', 'concrete', 'green'];

function roofShadow(g, x, y, w, h, d = 4) {
  g.fillStyle = 'rgba(0,0,0,0.32)';
  roundRect(g, x + d, y + d, w, h, 2);
  g.fill();
}

// Unidad de aire acondicionado vista desde arriba.
function acUnit(g, x, y, w, h, rng) {
  roofShadow(g, x, y, w, h, 5);
  box(g, x, y, w, h, 2, '#a7aba9', 1.5);
  sheen(g, x, y, w, h);
  const r = Math.min(w, h) * 0.32;
  const cx = x + w * 0.5;
  const cy = y + h * 0.5;
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.fillStyle = '#2b2e30';
  g.fill();
  g.strokeStyle = '#7c8280';
  g.lineWidth = 0.7;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rng();
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.stroke();
  }
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.lineWidth = 1;
  g.strokeStyle = OUT;
  g.stroke();
}
function vent(g, x, y, r) {
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.arc(x + 3, y + 3, r, 0, TAU);
  g.fill();
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = '#8d9396';
  g.fill();
  sheen(g, x - r, y - r, r * 2, r * 2);
  g.lineWidth = 1.2;
  g.strokeStyle = OUT;
  g.stroke();
  g.beginPath();
  g.arc(x, y, r * 0.55, 0, TAU);
  g.fillStyle = '#2b2e30';
  g.fill();
}
function skylight(g, x, y, w, h) {
  roofShadow(g, x, y, w, h, 3);
  box(g, x, y, w, h, 1.5, '#5d646a', 1.5);
  const lg = g.createLinearGradient(x, y, x + w, y + h);
  lg.addColorStop(0, '#9fc3d6');
  lg.addColorStop(0.45, '#4f7186');
  lg.addColorStop(1, '#22333f');
  g.fillStyle = lg;
  g.fillRect(x + 2.5, y + 2.5, w - 5, h - 5);
  g.strokeStyle = '#3d4449';
  g.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    g.beginPath();
    g.moveTo(x + (w * i) / 3, y + 2);
    g.lineTo(x + (w * i) / 3, y + h - 2);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x + 5, y + h - 6);
  g.lineTo(x + w * 0.45, y + 5);
  g.stroke();
}
function waterTank(g, x, y, r) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.arc(x + 9, y + 8, r, 0, TAU);
  g.fill();
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = '#7a5a3a';
  g.fill();
  g.strokeStyle = '#5a3f28';
  g.lineWidth = 0.8;
  for (let i = -r; i < r; i += 3) {
    g.beginPath();
    g.moveTo(x + i, y - Math.sqrt(r * r - i * i));
    g.lineTo(x + i, y + Math.sqrt(r * r - i * i));
    g.stroke();
  }
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  sheen(g, x - r, y - r, r * 2, r * 2);
  g.lineWidth = 1.6;
  g.strokeStyle = OUT;
  g.stroke();
  g.beginPath();
  g.arc(x, y, r * 0.75, 0, TAU);
  g.strokeStyle = '#3a3d40';
  g.lineWidth = 1.4;
  g.stroke();
  g.beginPath();
  g.arc(x, y, r * 0.18, 0, TAU);
  g.fillStyle = '#3a3d40';
  g.fill();
}
function solar(g, x, y, cols, rows) {
  const w = 14;
  const h = 9;
  roofShadow(g, x, y, cols * w, rows * h, 3);
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const px = x + i * w;
      const py = y + j * h;
      g.fillStyle = '#23324a';
      g.fillRect(px, py, w - 1, h - 1);
      g.strokeStyle = '#4a6a8a';
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(px + w / 2, py);
      g.lineTo(px + w / 2, py + h - 1);
      g.moveTo(px, py + h / 2);
      g.lineTo(px + w - 1, py + h / 2);
      g.stroke();
    }
  g.strokeStyle = OUT;
  g.lineWidth = 1.2;
  g.strokeRect(x, y, cols * w - 1, rows * h - 1);
  g.fillStyle = 'rgba(160,200,255,0.18)';
  g.fillRect(x, y, cols * w * 0.4, rows * h - 1);
}
function stairHouse(g, x, y, w, h) {
  g.fillStyle = 'rgba(0,0,0,0.38)';
  g.fillRect(x + 10, y + 8, w, h);
  box(g, x, y, w, h, 1.5, '#8a857c', 1.8);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 0.8;
  g.strokeRect(x + 3, y + 3, w - 6, h - 6);
  g.fillStyle = '#5a3a2a';
  g.fillRect(x + w * 0.3, y + h - 3, w * 0.4, 3);
}

// Pinta el techo de un edificio en coordenadas del mundo.
export function paintRoof(g, T, b) {
  const rng = mulberry32(b.seed);
  const { x, y, w, h } = b;
  const tex = { bricks: T.bricks, tar: T.tar, concrete: T.roofConcrete, metal: T.metal, green: T.greenRoof }[b.style];
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.save();
  g.translate(x, y);
  g.fillStyle = pattern(g, tex);
  g.fillRect(0, 0, w, h);
  g.restore();
  g.clip();
  // matiz propio de cada edificio
  g.fillStyle = rgba(b.tint, 0.14);
  g.fillRect(x, y, w, h);
  // oclusión junto al pretil
  const P = b.parapet;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [x, y, x, y + 14, x, y, w, 14],
    [x, y + h, x, y + h - 14, x, y + h - 14, w, 14],
    [x, y, x + 14, y, x, y, 14, h],
    [x + w, y, x + w - 14, y, x + w - 14, y, 14, h],
  ]) {
    const lg = g.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, 'rgba(0,0,0,0.35)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lg;
    g.fillRect(rx, ry, rw, rh);
  }
  // charcos
  for (let i = 0; i < 2; i++) {
    if (rng() < 0.5) continue;
    const px = x + rrange(rng, 0.2, 0.8) * w;
    const py = y + rrange(rng, 0.2, 0.8) * h;
    g.fillStyle = 'rgba(20,26,34,0.45)';
    g.beginPath();
    g.ellipse(px, py, rrange(rng, 10, 24), rrange(rng, 6, 12), rng() * 3, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(160,190,220,0.12)';
    g.beginPath();
    g.ellipse(px - 3, py - 2, 6, 2.5, 0.4, 0, TAU);
    g.fill();
  }
  // detalles repartidos sin pisarse
  const taken = [];
  const free = (ax, ay, aw, ah) => {
    if (ax < x + P + 4 || ay < y + P + 4 || ax + aw > x + w - P - 4 || ay + ah > y + h - P - 4) return false;
    for (const t of taken) if (ax < t[0] + t[2] + 6 && ax + aw + 6 > t[0] && ay < t[1] + t[3] + 6 && ay + ah + 6 > t[1]) return false;
    taken.push([ax, ay, aw, ah]);
    return true;
  };
  const tryPlace = (aw, ah, fn, tries = 12) => {
    for (let i = 0; i < tries; i++) {
      const ax = x + rrange(rng, 0, w - aw);
      const ay = y + rrange(rng, 0, h - ah);
      if (free(ax, ay, aw, ah)) return fn(ax, ay);
    }
  };
  const area = w * h;
  if (b.style !== 'green' && rng() < 0.55) tryPlace(44, 34, (ax, ay) => stairHouse(g, ax, ay, 44, 34));
  if (rng() < 0.4) tryPlace(48, 48, (ax, ay) => waterTank(g, ax + 24, ay + 24, 20));
  if (b.style !== 'green' && rng() < 0.4) {
    const c = 3 + ((rng() * 3) | 0);
    const r = 2 + ((rng() * 3) | 0);
    tryPlace(c * 14, r * 9, (ax, ay) => solar(g, ax, ay, c, r));
  }
  const nAc = Math.min(7, Math.round(area / 9000));
  for (let i = 0; i < nAc; i++) tryPlace(30, 24, (ax, ay) => acUnit(g, ax, ay, rng() < 0.5 ? 30 : 24, rng() < 0.5 ? 24 : 30, rng));
  const nSky = rng() < 0.5 ? Math.min(4, Math.round(area / 20000)) : 0;
  for (let i = 0; i < nSky; i++) tryPlace(40, 26, (ax, ay) => skylight(g, ax, ay, 40, 26));
  for (let i = 0; i < 8; i++) tryPlace(14, 14, (ax, ay) => vent(g, ax + 7, ay + 7, rrange(rng, 4, 6.5)));
  if (b.style === 'green') {
    for (let i = 0; i < 6; i++) tryPlace(24, 24, (ax, ay) => {
      g.save();
      g.translate(ax + 12, ay + 12);
      paintTree(g, 11, b.seed + i, 'park');
      g.restore();
    });
  }
  // tubería sobre el techo
  if (rng() < 0.5) {
    g.lineCap = 'round';
    const py = y + rrange(rng, 0.25, 0.75) * h;
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x + P + 4, py + 3);
    g.lineTo(x + w * 0.6, py + 3);
    g.stroke();
    g.strokeStyle = OUT;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x + P + 2, py);
    g.lineTo(x + w * 0.6, py);
    g.stroke();
    g.strokeStyle = '#8f9599';
    g.lineWidth = 2.2;
    g.stroke();
  }
  g.restore();
  // pretil
  g.lineJoin = 'miter';
  g.strokeStyle = shade(b.parapetColor, 0.8);
  g.lineWidth = P;
  g.strokeRect(x + P / 2, y + P / 2, w - P, h - P);
  g.strokeStyle = b.parapetColor;
  g.lineWidth = P * 0.55;
  g.strokeRect(x + P * 0.4, y + P * 0.4, w - P * 0.8, h - P * 0.8);
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x + 1.5, y + h - 1.5);
  g.lineTo(x + 1.5, y + 1.5);
  g.lineTo(x + w - 1.5, y + 1.5);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 1;
  g.strokeRect(x + P, y + P, w - P * 2, h - P * 2);
  g.strokeStyle = OUT;
  g.lineWidth = 2.6;
  g.strokeRect(x, y, w, h);
}

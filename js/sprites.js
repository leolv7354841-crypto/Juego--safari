// Todo el arte se genera por código: texturas del suelo, zombis, árboles,
// vehículos y el superviviente. Nada de recursos externos.
import { TAU, makeCanvas, mulberry32, rrange, rpick, roundRect, shade } from './util.js';

export const OUT = '#141612';

/* ---------- Primitivas ---------- */

function ell(g, x, y, rx, ry, rot, fill, stroke = OUT, lw = 1.4) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
}
function circ(g, x, y, r, fill, stroke = OUT, lw = 1.4) {
  ell(g, x, y, r, r, 0, fill, stroke, lw);
}
function limb(g, x1, y1, x2, y2, w, fill) {
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.strokeStyle = OUT;
  g.lineWidth = w + 2.6;
  g.stroke();
  g.strokeStyle = fill;
  g.lineWidth = w;
  g.stroke();
}
function softShadow(g, r, a = 0.38) {
  const gr = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
  gr.addColorStop(0, `rgba(0,0,0,${a})`);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
}

/* ---------- Texturas del suelo ---------- */

function tile(size, seed, paint) {
  const c = makeCanvas(size, size);
  paint(c.getContext('2d'), size, mulberry32(seed));
  return c;
}
function speckle(g, s, rng, n, colors, rmin, rmax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rpick(rng, colors);
    const r = rrange(rng, rmin, rmax);
    g.fillRect(rng() * s, rng() * s, r, r);
  }
}

let TILES = null;
function buildTiles() {
  TILES = {
    asphalt: tile(160, 11, (g, s, r) => {
      g.fillStyle = '#3a3c3d';
      g.fillRect(0, 0, s, s);
      speckle(g, s, r, 900, ['#323435', '#434546', '#2d2f30', '#4a4b4b'], 1, 2.4);
      speckle(g, s, r, 40, ['#55575a', '#26282a'], 2, 3.5);
    }),
    lot: tile(160, 12, (g, s, r) => {
      g.fillStyle = '#444645';
      g.fillRect(0, 0, s, s);
      speckle(g, s, r, 900, ['#3c3e3e', '#4d4f4e', '#383a3a'], 1, 2.4);
    }),
    sidewalk: tile(80, 13, (g, s, r) => {
      g.fillStyle = '#7a7770';
      g.fillRect(0, 0, s, s);
      speckle(g, s, r, 380, ['#716e67', '#838078', '#6a675f'], 1, 2);
      g.strokeStyle = 'rgba(40,38,34,0.45)';
      g.lineWidth = 1.5;
      for (let i = 0; i <= s; i += 40) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke();
        g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke();
      }
      g.fillStyle = 'rgba(30,28,24,0.18)';
      g.fillRect(41, 3, 36, 30);
    }),
    concrete: tile(128, 14, (g, s, r) => {
      g.fillStyle = '#5c5a55';
      g.fillRect(0, 0, s, s);
      speckle(g, s, r, 600, ['#55534e', '#64625c', '#4e4c48'], 1, 2.2);
    }),
    rubble: tile(128, 15, (g, s, r) => {
      g.fillStyle = '#4a463f';
      g.fillRect(0, 0, s, s);
      speckle(g, s, r, 700, ['#423e37', '#56514a', '#3a362f', '#5f5a50'], 1, 3);
      speckle(g, s, r, 60, ['#6a655b', '#2f2c27'], 3, 6);
    }),
    grass: tile(128, 16, (g, s, r) => {
      g.fillStyle = '#3c4830';
      g.fillRect(0, 0, s, s);
      const cols = ['#33402a', '#46532f', '#4f5634', '#2e3826', '#575a38'];
      for (let i = 0; i < 700; i++) {
        g.strokeStyle = rpick(r, cols);
        g.lineWidth = 1;
        const x = r() * s, y = r() * s;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + rrange(r, -2, 2), y - rrange(r, 2, 5));
        g.stroke();
      }
    }),
    dirt: tile(128, 17, (g, s, r) => {
      g.fillStyle = '#5d5040';
      g.fillRect(0, 0, s, s);
      speckle(g, s, r, 600, ['#544838', '#66594a', '#4c4134', '#70624f'], 1, 2.6);
    }),
    brick: tile(64, 18, (g, s, r) => {
      g.fillStyle = '#4e3f3a';
      g.fillRect(0, 0, s, s);
      const cols = ['#7a4c42', '#83544a', '#6f453d', '#8a5c50', '#764a41'];
      for (let y = 0; y < s; y += 16) {
        const off = (y / 16) % 2 ? 16 : 0;
        for (let x = -32; x < s; x += 32) {
          g.fillStyle = rpick(r, cols);
          g.fillRect(x + off + 1, y + 1, 30, 14);
          g.fillStyle = 'rgba(255,255,255,0.05)';
          g.fillRect(x + off + 1, y + 1, 30, 3);
        }
      }
    }),
    gravel: tile(64, 19, (g, s, r) => {
      g.fillStyle = '#56544f';
      g.fillRect(0, 0, s, s);
      speckle(g, s, r, 500, ['#4c4a46', '#605e58', '#6b6862', '#45433f'], 1, 2);
    }),
  };
}

const patCache = new WeakMap();
export function pat(g, name) {
  if (!TILES) buildTiles();
  let m = patCache.get(g);
  if (!m) {
    m = {};
    patCache.set(g, m);
  }
  if (!m[name]) m[name] = g.createPattern(TILES[name], 'repeat');
  return m[name];
}

/* ---------- Zombis ---------- */

const NORMAL_PALETTES = [
  { skin: '#9aab84', shirt: '#5d6b4f', pants: '#2f3440', hair: '#2b241d' },
  { skin: '#8d9c73', shirt: '#7a3b33', pants: '#3d3528', hair: '#1d1a17' },
  { skin: '#a7ae8c', shirt: '#3f5068', pants: '#4a4a4a', hair: '#5a4630' },
  { skin: '#93a07c', shirt: '#6e5c45', pants: '#2f3440', hair: '#2b241d' },
  { skin: '#9ca88a', shirt: '#8a877a', pants: '#3a3226', hair: '#7a6a55' },
  { skin: '#8c9a76', shirt: '#4b3f52', pants: '#30302e', hair: '#1d1a17' },
  { skin: '#a2ad88', shirt: '#9a8a5c', pants: '#343b46', hair: '#3a2c20' },
  { skin: '#95a37f', shirt: '#55605c', pants: '#46392b', hair: '#262019' },
];
const SPRINTER_PALETTES = [
  { skin: '#a9b29c', shirt: '#8a3a2e', pants: '#2a2c30', hair: '#1a1714' },
  { skin: '#9fa894', shirt: '#9a5a2a', pants: '#33302a', hair: '#3a2a1c' },
  { skin: '#b1b8a4', shirt: '#6e2f3a', pants: '#25282d', hair: '#151311' },
];
const FAT_PALETTES = [
  { skin: '#a8ad7e', shirt: '#cfc8b4', pants: '#38404c', hair: '#2b241d' },
  { skin: '#9fa676', shirt: '#6c4b3c', pants: '#2c2c2a', hair: '#1d1a17' },
  { skin: '#b0b287', shirt: '#4f5d6e', pants: '#4a3d2e', hair: '#6a5a45' },
  { skin: '#a3a97c', shirt: '#7b6e3c', pants: '#2f3440', hair: '#2b241d' },
];
const GIANT_PALETTES = [
  { skin: '#748262', shirt: '#3a3631', pants: '#28282a', hair: '#151311', metal: '#6d6f70' },
  { skin: '#6c7a5e', shirt: '#4a3a2c', pants: '#2b2622', hair: '#151311', metal: '#77736b' },
];

function rips(g, rng, x, y, rx, ry, color, n) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const d = rng() * 0.7;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, rrange(rng, 1.2, 3), rrange(rng, 1, 2.2), rng() * TAU, 0, TAU);
    g.fill();
  }
}

function drawNormal(g, r, p, ph) {
  softShadow(g, r * 1.25);
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const stride = r * 0.5;
  ell(g, s * stride, -r * 0.32, r * 0.36, r * 0.22, 0, p.pants);
  ell(g, -s * stride, r * 0.32, r * 0.36, r * 0.22, 0, p.pants);
  g.save();
  g.rotate(s * 0.08);
  ell(g, -r * 0.08, 0, r * 0.5, r * 0.86, 0, p.shirt);
  rips(g, mulberry32(p.seed), -r * 0.08, 0, r * 0.5, r * 0.86, shade(p.shirt, 0.65), 5);
  rips(g, mulberry32(p.seed + 7), -r * 0.08, 0, r * 0.5, r * 0.86, shade(p.skin, 0.9), 2);
  g.restore();
  const ax = c * r * 0.1;
  const ay = s * r * 0.1;
  limb(g, r * 0.05, -r * 0.62, r * 1.15 + ax, -r * 0.42 + ay, r * 0.3, p.skin);
  limb(g, r * 0.05, r * 0.62, r * 1.1 - ax, r * 0.46 - ay, r * 0.3, p.skin);
  circ(g, r * 1.2 + ax, -r * 0.42 + ay, r * 0.17, shade(p.skin, 0.82), OUT, 1);
  circ(g, r * 1.15 - ax, r * 0.46 - ay, r * 0.17, shade(p.skin, 0.82), OUT, 1);
  circ(g, r * 0.22, s * r * 0.04, r * 0.42, p.skin);
  g.fillStyle = p.hair;
  g.beginPath();
  g.arc(r * 0.18, s * r * 0.04, r * 0.36, Math.PI * 0.55, Math.PI * 1.45);
  g.fill();
  g.fillStyle = '#2a1c14';
  g.fillRect(r * 0.48, -r * 0.18, r * 0.1, r * 0.08);
  g.fillRect(r * 0.48, r * 0.1, r * 0.1, r * 0.08);
}

// Velocista: flaco, inclinado hacia delante, zancada larga y brazos hacia atrás.
function drawSprinter(g, r, p, ph) {
  softShadow(g, r * 1.3);
  const s = Math.sin(ph);
  const stride = r * 0.85;
  ell(g, s * stride, -r * 0.28, r * 0.42, r * 0.18, 0, p.pants);
  ell(g, -s * stride, r * 0.28, r * 0.42, r * 0.18, 0, p.pants);
  limb(g, -r * 0.05, -r * 0.55, -r * 0.75 + s * r * 0.35, -r * 0.6, r * 0.24, p.skin);
  limb(g, -r * 0.05, r * 0.55, -r * 0.75 - s * r * 0.35, r * 0.6, r * 0.24, p.skin);
  g.save();
  g.rotate(s * 0.12);
  ell(g, r * 0.05, 0, r * 0.42, r * 0.7, 0, p.shirt);
  rips(g, mulberry32(p.seed), r * 0.05, 0, r * 0.42, r * 0.7, shade(p.shirt, 0.6), 4);
  g.restore();
  circ(g, r * 0.62, s * r * 0.05, r * 0.36, p.skin);
  g.fillStyle = p.hair;
  g.beginPath();
  g.arc(r * 0.55, s * r * 0.05, r * 0.32, Math.PI * 0.6, Math.PI * 1.4);
  g.fill();
  g.fillStyle = '#c84a32';
  g.fillRect(r * 0.86, -r * 0.16, r * 0.1, r * 0.08);
  g.fillRect(r * 0.86, r * 0.08, r * 0.1, r * 0.08);
}

function drawFat(g, r, p, ph) {
  softShadow(g, r * 1.2);
  const s = Math.sin(ph);
  const stride = r * 0.32;
  ell(g, s * stride, -r * 0.42, r * 0.36, r * 0.27, 0, p.pants);
  ell(g, -s * stride, r * 0.42, r * 0.36, r * 0.27, 0, p.pants);
  g.save();
  g.rotate(s * 0.06);
  ell(g, -r * 0.1, 0, r * 0.72, r * 0.96, 0, p.shirt);
  rips(g, mulberry32(p.seed), -r * 0.1, 0, r * 0.7, r * 0.9, shade(p.shirt, 0.72), 7);
  ell(g, r * 0.3, 0, r * 0.5, r * 0.6, 0, p.skin);
  g.fillStyle = shade(p.skin, 0.8);
  g.beginPath();
  g.ellipse(r * 0.42, 0, r * 0.32, r * 0.42, 0, -1.2, 1.2);
  g.fill();
  g.restore();
  const sw = s * r * 0.08;
  limb(g, -r * 0.05, -r * 0.82, r * 0.72 + sw, -r * 0.78, r * 0.36, p.skin);
  limb(g, -r * 0.05, r * 0.82, r * 0.7 - sw, r * 0.8, r * 0.36, p.skin);
  circ(g, -r * 0.05, s * r * 0.03, r * 0.36, p.skin);
  g.fillStyle = p.hair;
  g.beginPath();
  g.arc(-r * 0.1, s * r * 0.03, r * 0.3, Math.PI * 0.6, Math.PI * 1.4);
  g.fill();
}

function drawGiant(g, r, p, ph) {
  softShadow(g, r * 1.3, 0.5);
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const stride = r * 0.28;
  ell(g, s * stride, -r * 0.38, r * 0.38, r * 0.27, 0, p.pants, OUT, 2);
  ell(g, -s * stride, r * 0.38, r * 0.38, r * 0.27, 0, p.pants, OUT, 2);
  g.save();
  g.rotate(s * 0.05);
  ell(g, -r * 0.12, 0, r * 0.64, r * 0.9, 0, p.shirt, OUT, 2.2);
  rips(g, mulberry32(p.seed), -r * 0.12, 0, r * 0.6, r * 0.85, shade(p.shirt, 0.6), 10);
  ell(g, -r * 0.34, 0, r * 0.36, r * 0.58, 0, shade(p.skin, 0.75), OUT, 1.6);
  // varillas oxidadas clavadas en la espalda
  g.lineCap = 'round';
  g.strokeStyle = '#5e4a36';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-r * 0.4, -r * 0.2);
  g.lineTo(-r * 0.95, -r * 0.42);
  g.moveTo(-r * 0.3, r * 0.28);
  g.lineTo(-r * 0.86, r * 0.5);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-r * 0.5, -r * 0.8);
  g.lineTo(r * 0.3, r * 0.7);
  g.stroke();
  g.restore();
  const sw = c * r * 0.07;
  circ(g, r * 0.02, -r * 0.72, r * 0.34, shade(p.skin, 0.92), OUT, 2);
  circ(g, r * 0.02, r * 0.72, r * 0.34, shade(p.skin, 0.92), OUT, 2);
  // placa metálica en el hombro
  g.save();
  g.translate(r * 0.02, -r * 0.74);
  g.rotate(0.3);
  roundRect(g, -r * 0.3, -r * 0.22, r * 0.6, r * 0.44, 3);
  g.fillStyle = p.metal;
  g.fill();
  g.lineWidth = 1.8;
  g.strokeStyle = OUT;
  g.stroke();
  g.fillStyle = '#3b3b3a';
  for (const [bx, by] of [[-0.2, -0.12], [0.2, -0.12], [-0.2, 0.12], [0.2, 0.12]]) {
    g.beginPath();
    g.arc(bx * r, by * r, 1.6, 0, TAU);
    g.fill();
  }
  g.restore();
  limb(g, r * 0.12, -r * 0.8, r * 0.98 + sw, -r * 0.64 - s * r * 0.05, r * 0.36, p.skin);
  limb(g, r * 0.12, r * 0.8, r * 0.98 - sw, r * 0.64 + s * r * 0.05, r * 0.36, p.skin);
  circ(g, r * 1.04 + sw, -r * 0.64 - s * r * 0.05, r * 0.24, shade(p.skin, 0.8), OUT, 2);
  circ(g, r * 1.04 - sw, r * 0.64 + s * r * 0.05, r * 0.24, shade(p.skin, 0.8), OUT, 2);
  circ(g, r * 0.42, s * r * 0.02, r * 0.27, p.skin, OUT, 2);
  g.strokeStyle = 'rgba(30,20,15,0.6)';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(r * 0.32, -r * 0.18);
  g.lineTo(r * 0.5, -r * 0.05);
  g.stroke();
  g.fillStyle = '#e0d2a0';
  g.fillRect(r * 0.62, -r * 0.1, r * 0.06, r * 0.05);
  g.fillRect(r * 0.62, r * 0.05, r * 0.06, r * 0.05);
}

const DRAWERS = { normal: drawNormal, sprinter: drawSprinter, fat: drawFat, giant: drawGiant };
const PALETTES = { normal: NORMAL_PALETTES, sprinter: SPRINTER_PALETTES, fat: FAT_PALETTES, giant: GIANT_PALETTES };

function buildSet(type, r, frames, pal, scale, pad) {
  const half = r * pad;
  const size = half * 2;
  const px = size * scale;
  const out = { frames: [], flash: [], dead: null, size, half };
  for (let f = 0; f < frames; f++) {
    const c = makeCanvas(px, px);
    const g = c.getContext('2d');
    g.setTransform(scale, 0, 0, scale, half * scale, half * scale);
    DRAWERS[type](g, r, pal, (f / frames) * TAU);
    out.frames.push(c);
    const fl = makeCanvas(px, px);
    const fg = fl.getContext('2d');
    fg.drawImage(c, 0, 0);
    fg.globalCompositeOperation = 'source-atop';
    fg.fillStyle = 'rgba(255,236,220,0.78)';
    fg.fillRect(0, 0, px, px);
    out.flash.push(fl);
  }
  const d = makeCanvas(px, px);
  const dg = d.getContext('2d');
  dg.drawImage(out.frames[0], 0, 0);
  dg.globalCompositeOperation = 'source-atop';
  dg.fillStyle = 'rgba(18,17,13,0.5)';
  dg.fillRect(0, 0, px, px);
  out.dead = d;
  return out;
}

let ZSPRITES = null;
export function zombieSprites() {
  if (ZSPRITES) return ZSPRITES;
  ZSPRITES = { normal: [], sprinter: [], fat: [], giant: [] };
  const conf = {
    normal: { r: 13, frames: 6, scale: 2.5, pad: 1.65 },
    fat: { r: 21, frames: 6, scale: 2.4, pad: 1.45 },
    giant: { r: 42, frames: 8, scale: 2, pad: 1.45 },
    sprinter: { r: 11, frames: 6, scale: 2.6, pad: 1.8 },
  };
  for (const type of Object.keys(conf)) {
    const k = conf[type];
    PALETTES[type].forEach((pal, i) => {
      pal.seed = 100 + i * 31 + type.length * 7;
      ZSPRITES[type].push(buildSet(type, k.r, k.frames, pal, k.scale, k.pad));
    });
  }
  return ZSPRITES;
}

/* ---------- Árboles ---------- */

export function makeTree(seed, r, dead) {
  const rng = mulberry32(seed);
  const pad = r * 1.3;
  const scale = 1.6;
  const c = makeCanvas(pad * 2 * scale, pad * 2 * scale);
  const g = c.getContext('2d');
  g.setTransform(scale, 0, 0, scale, pad * scale, pad * scale);
  if (dead) {
    g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = rng() * TAU;
      const len = r * rrange(rng, 0.6, 1);
      g.strokeStyle = OUT;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.stroke();
      g.strokeStyle = '#5a4a3a';
      g.lineWidth = 3.5;
      g.stroke();
      const b = a + rrange(rng, -0.7, 0.7);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5);
      g.lineTo(Math.cos(a) * len * 0.5 + Math.cos(b) * len * 0.45, Math.sin(a) * len * 0.5 + Math.sin(b) * len * 0.45);
      g.stroke();
    }
    circ(g, 0, 0, 7, '#4a3c2e');
    return c;
  }
  const greens = ['#2f3d26', '#3a4a2c', '#445432', '#36452a'];
  const blobs = 8 + ((rng() * 4) | 0);
  const pts = [];
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * TAU + rrange(rng, -0.3, 0.3);
    const d = r * rrange(rng, 0.35, 0.62);
    pts.push([Math.cos(a) * d, Math.sin(a) * d, r * rrange(rng, 0.38, 0.52)]);
  }
  for (const [x, y, br] of pts) circ(g, x, y, br + 1.5, OUT, null);
  circ(g, 0, 0, r * 0.62, OUT, null);
  for (const [x, y, br] of pts) circ(g, x, y, br, rpick(rng, greens), null);
  circ(g, 0, 0, r * 0.6, '#3b4b2d', null);
  for (const [x, y, br] of pts) {
    g.fillStyle = 'rgba(160,170,110,0.16)';
    g.beginPath();
    g.arc(x - br * 0.25, y - br * 0.25, br * 0.55, 0, TAU);
    g.fill();
  }
  for (let i = 0; i < 26; i++) {
    const a = rng() * TAU;
    const d = rng() * r * 0.8;
    g.fillStyle = rng() < 0.5 ? 'rgba(20,28,16,0.35)' : 'rgba(120,120,70,0.25)';
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, rrange(rng, 2, 5), 0, TAU);
    g.fill();
  }
  return c;
}

/* ---------- Vehículos ---------- */

export const CAR_COLORS = ['#7d2f2a', '#c75f43', '#3f566b', '#6b6d68', '#b8b1a0', '#2f3a32', '#8a6a3a', '#4b4f63'];

export function drawCar(g, x, y, ang, len, wid, opt) {
  const rng = mulberry32(opt.seed);
  const kind = opt.kind;
  const burnt = opt.burnt;
  let body = burnt ? '#2e2a26' : opt.color;
  if (kind === 'taxi' && !burnt) body = '#c9a23a';
  if (kind === 'police' && !burnt) body = '#26292e';
  if (kind === 'truck' && !burnt) body = '#4a5236';
  if (kind === 'bus' && !burnt) body = '#b9a77a';
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const L = len / 2;
  const W = wid / 2;
  g.fillStyle = 'rgba(0,0,0,0.42)';
  roundRect(g, -L + 6, -W + 8, len, wid, 9);
  g.fill();
  g.fillStyle = '#121212';
  for (const wx of kind === 'bus' ? [-0.34, 0.32] : [-0.3, 0.3]) {
    g.fillRect(wx * len - 8, -W - 2.5, 16, 5);
    g.fillRect(wx * len - 8, W - 2.5, 16, 5);
  }
  roundRect(g, -L, -W, len, wid, kind === 'bus' ? 6 : wid * 0.28);
  g.fillStyle = body;
  g.fill();
  const gr = g.createLinearGradient(0, -W, 0, W);
  gr.addColorStop(0, 'rgba(0,0,0,0.3)');
  gr.addColorStop(0.42, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(0,0,0,0.34)');
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = OUT;
  g.stroke();

  const glass = burnt ? '#141312' : '#1e2830';
  if (kind === 'bus') {
    g.fillStyle = shade(body, 1.08);
    g.fillRect(-L + 6, -W + 5, len - 12, wid - 10);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(-L + 14 + i * ((len - 30) / 8), -W + 9, 6, wid - 18);
    }
    g.fillStyle = glass;
    g.fillRect(L - 12, -W + 4, 8, wid - 8);
  } else if (kind === 'truck') {
    g.fillStyle = glass;
    g.fillRect(L * 0.45, -W + 5, L * 0.18, wid - 10);
    g.fillStyle = shade(body, 1.12);
    g.fillRect(L * 0.63, -W + 4, L * 0.3, wid - 8);
    g.fillStyle = burnt ? '#2a2622' : '#5f6446';
    roundRect(g, -L + 3, -W + 2, len * 0.66, wid - 4, 4);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const xx = -L + 3 + (len * 0.66 * i) / 6;
      g.beginPath();
      g.moveTo(xx, -W + 3);
      g.lineTo(xx, W - 3);
      g.stroke();
    }
  } else {
    const isPick = kind === 'pickup';
    const isVan = kind === 'van';
    const front = L * 0.12;
    const roofStart = isVan ? -L * 0.85 : isPick ? -L * 0.05 : -L * 0.42;
    g.fillStyle = glass;
    g.beginPath();
    g.moveTo(front, -W + 4);
    g.lineTo(front + L * 0.3, -W + 7);
    g.lineTo(front + L * 0.3, W - 7);
    g.lineTo(front, W - 4);
    g.closePath();
    g.fill();
    g.fillStyle = shade(body, 1.1);
    roundRect(g, roofStart, -W + 4, front - roofStart, wid - 8, 5);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 1;
    g.stroke();
    if (!isVan && !isPick) {
      g.fillStyle = glass;
      g.fillRect(roofStart - L * 0.16, -W + 6, L * 0.14, wid - 12);
    }
    if (isPick) {
      g.fillStyle = shade(body, 0.6);
      g.fillRect(-L + 4, -W + 4, L * 0.9, wid - 8);
      g.fillStyle = '#4b3a2a';
      g.fillRect(-L + 10, -W + 8, 14, 12);
    }
    if (!burnt) {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.moveTo(front + 3, -W + 6);
      g.lineTo(front + 9, -W + 6);
      g.lineTo(front + 3, W - 12);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(front + L * 0.36, -W + 8);
    g.lineTo(L - 6, -W + 10);
    g.moveTo(front + L * 0.36, W - 8);
    g.lineTo(L - 6, W - 10);
    g.stroke();
    if (kind === 'taxi' && !burnt) {
      g.fillStyle = '#e8dcb0';
      g.fillRect(-L * 0.2, -5, 10, 10);
      g.strokeStyle = OUT;
      g.strokeRect(-L * 0.2, -5, 10, 10);
    }
    if (kind === 'police' && !burnt) {
      g.fillStyle = '#d8d4c8';
      g.fillRect(-L * 0.35, -W, L * 0.7, 5);
      g.fillRect(-L * 0.35, W - 5, L * 0.7, 5);
      g.fillStyle = '#8a3530';
      g.fillRect(-L * 0.18, -W + 6, 6, W - 6);
      g.fillStyle = '#35507a';
      g.fillRect(-L * 0.18, 0, 6, W - 6);
    }
  }
  g.fillStyle = burnt ? '#222' : '#d9cf9c';
  g.fillRect(L - 4, -W + 4, 3, 7);
  g.fillRect(L - 4, W - 11, 3, 7);
  g.fillStyle = burnt ? '#222' : '#6a2622';
  g.fillRect(-L + 1, -W + 4, 3, 7);
  g.fillRect(-L + 1, W - 11, 3, 7);
  // daños: óxido, golpes, cristales rotos
  const n = burnt ? 14 : 4;
  for (let i = 0; i < n; i++) {
    g.fillStyle = burnt
      ? rpick(rng, ['rgba(120,70,40,0.45)', 'rgba(10,10,10,0.5)', 'rgba(70,60,50,0.4)'])
      : 'rgba(110,70,40,0.35)';
    g.beginPath();
    g.ellipse(rrange(rng, -L, L), rrange(rng, -W, W), rrange(rng, 2, 7), rrange(rng, 1.5, 4), rng() * TAU, 0, TAU);
    g.fill();
  }
  if (!burnt && rng() < 0.6) {
    g.strokeStyle = 'rgba(220,230,235,0.45)';
    g.lineWidth = 0.8;
    const cx = L * 0.25;
    const cy = rrange(rng, -W * 0.4, W * 0.4);
    for (let i = 0; i < 6; i++) {
      const a = rng() * TAU;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9);
      g.stroke();
    }
  }
  g.restore();
}

/* ---------- Luz ---------- */

export function lightSprite(color = '255,255,255', size = 256) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${color},1)`);
  gr.addColorStop(0.35, `rgba(${color},0.6)`);
  gr.addColorStop(0.7, `rgba(${color},0.18)`);
  gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

export function coneSprite() {
  const w = 512;
  const h = 300;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, h / 2 - 8);
  g.lineTo(w, 0);
  g.lineTo(w, h);
  g.lineTo(0, h / 2 + 8);
  g.closePath();
  g.fill();
  // bordes suaves del haz
  g.globalCompositeOperation = 'destination-out';
  const edge = g.createLinearGradient(0, 0, 0, h);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(0.3, 'rgba(0,0,0,0)');
  edge.addColorStop(0.7, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
  return c;
}

/* ---------- Superviviente ---------- */

const GUNS = {
  pistol: (g, r) => {
    g.fillStyle = '#26282b';
    g.fillRect(r * 0.75, -2.2, 12, 4.4);
    g.fillStyle = '#3c3f43';
    g.fillRect(r * 0.75, -2.2, 12, 1.4);
  },
  smg: (g, r) => {
    g.fillStyle = '#25272a';
    g.fillRect(r * 0.55, -3, 18, 6);
    g.fillStyle = '#1b1c1e';
    g.fillRect(r * 0.55 + 6, 2, 5, 7);
    g.fillStyle = '#3c3f43';
    g.fillRect(r * 0.55 + 16, -1.5, 6, 3);
  },
  shotgun: (g, r) => {
    g.fillStyle = '#5a3b26';
    g.fillRect(r * 0.2, -3, 10, 6);
    g.fillStyle = '#2a2b2d';
    g.fillRect(r * 0.2 + 10, -2.6, 20, 5.2);
    g.fillStyle = '#6b4a30';
    g.fillRect(r * 0.2 + 14, -3.2, 8, 6.4);
  },
  rifle: (g, r) => {
    g.fillStyle = '#4b3a2a';
    g.fillRect(r * 0.15, -3, 10, 6);
    g.fillStyle = '#25272a';
    g.fillRect(r * 0.15 + 10, -2.4, 26, 4.8);
    g.fillStyle = '#121314';
    g.fillRect(r * 0.15 + 12, -4.5, 11, 3);
  },
};

export function drawSurvivor(g, p, time) {
  const r = p.r;
  g.save();
  g.translate(p.x, p.y);
  softShadow(g, r * 1.5, 0.45);
  // piernas orientadas al movimiento
  g.save();
  g.rotate(p.legAngle);
  const moving = p.speedNow > 8;
  const amp = moving ? (p.running ? 0.75 : 0.5) : 0;
  const s = Math.sin(p.walkPhase) * amp;
  ell(g, s * r, -r * 0.3, r * 0.38, r * 0.22, 0, '#2c3038');
  ell(g, -s * r, r * 0.3, r * 0.38, r * 0.22, 0, '#2c3038');
  g.fillStyle = '#1a1a1a';
  g.fillRect(s * r + r * 0.18, -r * 0.42, r * 0.2, r * 0.24);
  g.fillRect(-s * r + r * 0.18, r * 0.18, r * 0.2, r * 0.24);
  g.restore();

  g.rotate(p.angle);
  const kick = -p.recoil * 3;
  const longGun = p.weapon.id !== 'pistol';
  // mochila
  roundRect(g, -r * 1.05, -r * 0.6, r * 0.7, r * 1.2, 4);
  g.fillStyle = '#4c5236';
  g.fill();
  g.lineWidth = 1.4;
  g.strokeStyle = OUT;
  g.stroke();
  g.fillStyle = '#3c412a';
  g.fillRect(-r * 0.95, -r * 0.4, r * 0.5, r * 0.25);
  // torso
  ell(g, -r * 0.05, 0, r * 0.52, r * 0.88, 0, '#6b4f3a');
  g.fillStyle = '#5a4130';
  g.fillRect(-r * 0.12, -r * 0.7, r * 0.12, r * 1.4);
  // arma + brazos
  g.save();
  g.translate(kick, 0);
  GUNS[p.weapon.id](g, r);
  if (longGun) {
    limb(g, 0, r * 0.62, r * 0.7, r * 0.12, r * 0.28, '#6b4f3a');
    limb(g, 0, -r * 0.62, r * 1.25, -r * 0.05, r * 0.28, '#6b4f3a');
    circ(g, r * 0.72, r * 0.12, r * 0.17, '#c7a184', OUT, 1);
    circ(g, r * 1.28, -r * 0.05, r * 0.17, '#c7a184', OUT, 1);
  } else {
    limb(g, 0, r * 0.62, r * 0.78, r * 0.08, r * 0.28, '#6b4f3a');
    limb(g, 0, -r * 0.62, r * 0.78, -r * 0.08, r * 0.28, '#6b4f3a');
    circ(g, r * 0.8, 0, r * 0.2, '#c7a184', OUT, 1);
  }
  if (p.flashT > 0) {
    const tip = p.gunTip;
    g.fillStyle = 'rgba(255,214,140,0.95)';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const d = i % 2 ? 3 : 9 + Math.random() * 5;
      g.lineTo(tip + Math.cos(a) * d * 1.3, Math.sin(a) * d * 0.7);
    }
    g.closePath();
    g.fill();
    circ(g, tip, 0, 3.5, '#fff6dc', null);
  }
  g.restore();
  // cabeza con pañuelo
  circ(g, r * 0.02, 0, r * 0.44, '#c7a184');
  g.fillStyle = '#2d2219';
  g.beginPath();
  g.arc(-r * 0.04, 0, r * 0.41, Math.PI * 0.45, Math.PI * 1.55);
  g.fill();
  g.strokeStyle = '#8c3b2e';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(r * 0.02, 0, r * 0.38, -1.2, 1.2);
  g.stroke();
  g.fillStyle = '#8c3b2e';
  g.beginPath();
  g.moveTo(-r * 0.38, -2);
  g.lineTo(-r * 0.75, -5 + Math.sin(time * 9) * 2);
  g.lineTo(-r * 0.7, 2 + Math.sin(time * 9 + 1) * 2);
  g.closePath();
  g.fill();
  if (p.hurtT > 0) {
    g.globalAlpha = Math.min(1, p.hurtT * 4) * 0.6;
    circ(g, 0, 0, r * 1.05, '#c8443a', null);
    g.globalAlpha = 1;
  }
  g.restore();
}

/* ---------- Objetos recogibles ---------- */

export function drawPickup(g, k, x, y, t) {
  const bob = Math.sin(t * 4) * 1.5;
  g.save();
  g.translate(x, y + bob);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(2, 6 - bob, 13, 6, 0, 0, TAU);
  g.fill();
  if (k === 'ammo') {
    roundRect(g, -11, -8, 22, 16, 2);
    g.fillStyle = '#4c5532';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = OUT;
    g.stroke();
    g.fillStyle = '#c9a54a';
    g.fillRect(-11, -2, 22, 4);
    g.fillStyle = '#d8c8a0';
    for (let i = 0; i < 3; i++) g.fillRect(-7 + i * 5, -6, 3, 3);
  } else if (k === 'med') {
    roundRect(g, -10, -9, 20, 18, 3);
    g.fillStyle = '#d9d3c4';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = OUT;
    g.stroke();
    g.fillStyle = '#3f7a52';
    g.fillRect(-2.5, -6, 5, 12);
    g.fillRect(-6, -2.5, 12, 5);
  } else {
    roundRect(g, -14, -10, 28, 20, 2);
    g.fillStyle = '#7a5a36';
    g.fill();
    g.lineWidth = 1.6;
    g.strokeStyle = OUT;
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.moveTo(-14, -10);
    g.lineTo(14, 10);
    g.moveTo(14, -10);
    g.lineTo(-14, 10);
    g.stroke();
    g.fillStyle = '#d9783a';
    g.fillRect(-4, -4, 8, 8);
  }
  g.restore();
}

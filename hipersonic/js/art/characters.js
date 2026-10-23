// Personajes vistos desde arriba, pintados por partes (torso, cabeza, manos, zapatos y el
// cuerpo tumbado para el ragdoll) y guardados en el atlas. Brazos y piernas se trazan en
// tiempo real con contorno, para poder animarlos con cualquier pose.
import { TAU, mulberry32, rrange, rpick, shade, roundRect, rgba } from '../util.js';

export const OUT = '#12131a';
export const LW = 1.5;

/* ---------- Paletas ---------- */

const SKINS = ['#f1c9a5', '#e2b08a', '#c98e64', '#a86c45', '#7d4a2e', '#5b3420', '#f5d6bd', '#d9a074'];
const HAIRS = ['#1d1612', '#3a2618', '#5e3a1f', '#8a5a2b', '#c9a15a', '#e4d2a0', '#9b9b98', '#d8d6d0', '#6b2a1c', '#2b2b33'];
const SHIRTS = ['#c2463a', '#3e6d8f', '#5d8a4e', '#d9b44a', '#e7e1d4', '#7a4f8c', '#2f3b4c', '#c96f3b', '#4c7f7a', '#a63c5a', '#8b8f96', '#f0a6a0', '#334a2c', '#b8873f'];
const PANTS = ['#2f4a6b', '#3c5a85', '#262a33', '#55524a', '#8a7a5a', '#3f3a35', '#6b6f78', '#1f2a40', '#7a3b2c'];
const SHOES = ['#1c1c20', '#e9e6df', '#6b4a2e', '#3b3f52', '#b23a32', '#d8d0bc'];

export function civilianStyles(n, seed = 7) {
  const rng = mulberry32(seed);
  const tops = ['tee', 'tee', 'jacket', 'hoodie', 'coat', 'blouse', 'tee', 'sweater', 'shirt'];
  const hairs = ['short', 'short', 'long', 'ponytail', 'bun', 'bald', 'afro', 'cap', 'beanie', 'buzz', 'curly', 'long'];
  const out = [];
  for (let i = 0; i < n; i++) {
    const top = rpick(rng, tops);
    const hair = rpick(rng, hairs);
    const elder = rng() < 0.15;
    const shirt = rpick(rng, SHIRTS);
    out.push({
      kind: 'civ',
      seed: 1000 + i * 37,
      skin: rpick(rng, SKINS),
      hair: elder ? rpick(rng, ['#c9c7c0', '#e2e0da', '#9b9b98']) : rpick(rng, HAIRS),
      hairStyle: hair,
      hat: rpick(rng, SHIRTS),
      top,
      shirt,
      accent: shade(rpick(rng, SHIRTS), 0.9),
      pattern: rng() < 0.3 ? rpick(rng, ['stripes', 'dots', 'plaid']) : 'plain',
      sleeves: top === 'tee' || top === 'blouse' ? 'short' : 'long',
      pants: rpick(rng, PANTS),
      shoes: rpick(rng, SHOES),
      bag: rng() < 0.3 ? rpick(rng, ['backpack', 'shoulder']) : null,
      bagColor: rpick(rng, ['#3b3f52', '#6b4a2e', '#7d2f2a', '#2f4a3a', '#9a8a6a']),
      build: rrange(rng, 0.9, 1.1),
    });
  }
  return out;
}

export function enemyStyles(seed = 99) {
  const rng = mulberry32(seed);
  const base = [
    { top: 'leather', shirt: '#24211f', hairStyle: 'mohawk', hair: '#c23a2a', prop: 'bat' },
    { top: 'tank', shirt: '#d8d2c4', hairStyle: 'bandana', hat: '#b02a24', hair: '#1d1612', prop: null },
    { top: 'hoodie', shirt: '#7d2a26', hairStyle: 'hood', hair: '#1d1612', prop: 'pipe' },
    { top: 'leather', shirt: '#4a3122', hairStyle: 'beanie', hat: '#1e1e22', hair: '#1d1612', prop: null },
    { top: 'vest', shirt: '#3a4030', hairStyle: 'buzz', hair: '#2b2b33', prop: 'pipe', build: 1.22 },
    { top: 'tank', shirt: '#1f1f24', hairStyle: 'bald', hair: '#1d1612', prop: 'bat', build: 1.15 },
    { top: 'hoodie', shirt: '#2b2b33', hairStyle: 'hood', hair: '#1d1612', prop: null },
    { top: 'leather', shirt: '#1d1a17', hairStyle: 'spikyDark', hair: '#d9c35a', prop: null },
  ];
  return base.map((b, i) => ({
    kind: 'enemy',
    seed: 5000 + i * 53,
    skin: rpick(rng, SKINS),
    hat: b.hat || '#b02a24',
    accent: '#c23a2a',
    pattern: 'plain',
    sleeves: b.top === 'tank' ? 'none' : 'long',
    pants: rpick(rng, ['#262a33', '#2f4a6b', '#3f3a35', '#1c1c20']),
    shoes: rpick(rng, ['#1c1c20', '#3b2a1e', '#e9e6df']),
    bag: null,
    tattoo: b.top === 'tank',
    build: b.build || rrange(rng, 1.0, 1.1),
    ...b,
  }));
}

export const HERO_STYLE = {
  kind: 'hero',
  seed: 4242,
  skin: '#e2b08a',
  hair: '#eef3f7',
  hairStyle: 'hero',
  top: 'hero',
  shirt: '#24355f',
  accent: '#38e1ff',
  accent2: '#ff6a2b',
  pattern: 'plain',
  sleeves: 'long',
  glove: '#eef2f6',
  pants: '#1a223b',
  shoes: '#f2f4f7',
  sole: '#ff6a2b',
  bag: null,
  build: 1.04,
};

/* ---------- Primitivas ---------- */

function outline(g, w = LW) {
  g.lineWidth = w;
  g.strokeStyle = OUT;
  g.lineJoin = 'round';
  g.stroke();
}
function ell(g, x, y, rx, ry, fill, lw = LW, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
  g.fillStyle = fill;
  g.fill();
  if (lw) outline(g, lw);
}
// Volumen: zona clara al centro y bordes oscuros (funciona en cualquier rotación).
function volume(g, x, y, r, a = 0.22, d = 0.32) {
  const gr = g.createRadialGradient(x - r * 0.15, y - r * 0.1, r * 0.1, x, y, r * 1.05);
  gr.addColorStop(0, `rgba(255,255,255,${a})`);
  gr.addColorStop(0.55, 'rgba(255,255,255,0)');
  gr.addColorStop(1, `rgba(0,0,0,${d})`);
  g.fillStyle = gr;
  g.fill();
}
function grain(g, rng, x, y, w, h, n, color, s = 0.5) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(x + rng() * w, y + rng() * h, s, s);
}

function torsoPath(g, r, b) {
  roundRect(g, -0.5 * r, -0.92 * r * b, 0.98 * r, 1.84 * r * b, 0.46 * r);
}

function fabricPattern(g, st, r, b, rng) {
  if (st.pattern === 'stripes') {
    g.strokeStyle = rgba(shade(st.shirt, 0.6), 0.55);
    g.lineWidth = 1.1;
    for (let y = -r * b; y < r * b; y += 3.2) {
      g.beginPath();
      g.moveTo(-r, y);
      g.lineTo(r, y);
      g.stroke();
    }
  } else if (st.pattern === 'dots') {
    g.fillStyle = rgba(shade(st.shirt, 1.5), 0.7);
    for (let x = -r; x < r; x += 3.4) for (let y = -r * b; y < r * b; y += 3.4) {
      g.beginPath();
      g.arc(x + ((y / 3.4) & 1) * 1.7, y, 0.65, 0, TAU);
      g.fill();
    }
  } else if (st.pattern === 'plaid') {
    g.strokeStyle = rgba(shade(st.shirt, 0.55), 0.5);
    g.lineWidth = 1.4;
    for (let v = -r * 1.2; v < r * 1.2; v += 4.5) {
      g.beginPath();
      g.moveTo(v, -r * 1.2);
      g.lineTo(v, r * 1.2);
      g.moveTo(-r * 1.2, v);
      g.lineTo(r * 1.2, v);
      g.stroke();
    }
    g.strokeStyle = rgba(st.accent, 0.35);
    g.lineWidth = 0.6;
    for (let v = -r * 1.2 + 2; v < r * 1.2; v += 9) {
      g.beginPath();
      g.moveTo(v, -r * 1.2);
      g.lineTo(v, r * 1.2);
      g.moveTo(-r * 1.2, v);
      g.lineTo(r * 1.2, v);
      g.stroke();
    }
  }
  grain(g, rng, -r, -r * b, r * 2, r * 2 * b, 70, 'rgba(0,0,0,0.12)', 0.6);
  grain(g, rng, -r, -r * b, r * 2, r * 2 * b, 40, 'rgba(255,255,255,0.07)', 0.6);
}

// Pliegues de la tela: curvas oscuras desde los hombros hacia la espalda.
function folds(g, r, b, rng, color) {
  g.strokeStyle = color;
  g.lineWidth = 0.8;
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const s = i < 2 ? -1 : 1;
    const y0 = s * r * b * rrange(rng, 0.45, 0.8);
    g.beginPath();
    g.moveTo(rrange(rng, -0.1, 0.25) * r, y0);
    g.quadraticCurveTo(-0.15 * r, y0 * 0.6, rrange(rng, -0.4, -0.25) * r, y0 * rrange(rng, 0.2, 0.5));
    g.stroke();
  }
}

/* ---------- Torso (de pie) ---------- */

function paintTorso(g, st, r) {
  const b = st.build;
  const rng = mulberry32(st.seed);
  // mochila debajo del torso (asoma por la espalda)
  if (st.bag === 'backpack') {
    roundRect(g, -0.95 * r, -0.55 * r, 0.62 * r, 1.1 * r, 0.22 * r);
    g.fillStyle = st.bagColor;
    g.fill();
    volume(g, -0.64 * r, 0, 0.6 * r, 0.18, 0.3);
    outline(g);
    roundRect(g, -0.9 * r, -0.35 * r, 0.3 * r, 0.7 * r, 0.1 * r);
    g.fillStyle = shade(st.bagColor, 0.8);
    g.fill();
    outline(g, 1);
  }
  if (st.top === 'coat' || st.top === 'leather') {
    // faldón del abrigo
    roundRect(g, -0.62 * r, -0.86 * r * b, 0.5 * r, 1.72 * r * b, 0.3 * r);
    g.fillStyle = shade(st.shirt, 0.8);
    g.fill();
    outline(g);
  }
  torsoPath(g, r, b);
  g.fillStyle = st.shirt;
  g.fill();
  g.save();
  torsoPath(g, r, b);
  g.clip();
  fabricPattern(g, st, r, b, rng);
  if (st.top === 'hero') {
    // traje: placas en los hombros y rayos cian que bajan por la espalda
    g.fillStyle = shade(st.shirt, 1.35);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(0.05 * r, s * 0.66 * r * b, 0.36 * r, 0.3 * r, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 0.8;
      g.stroke();
    }
    g.strokeStyle = st.accent;
    g.lineWidth = 1.6;
    g.lineJoin = 'miter';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(0.35 * r, s * 0.92 * r);
      g.lineTo(0.0 * r, s * 0.5 * r);
      g.lineTo(-0.12 * r, s * 0.62 * r);
      g.lineTo(-0.5 * r, s * 0.2 * r);
      g.stroke();
    }
    // emblema: rayo en la espalda
    g.fillStyle = st.accent2;
    g.beginPath();
    g.moveTo(-0.08 * r, -0.28 * r);
    g.lineTo(-0.36 * r, 0.02 * r);
    g.lineTo(-0.22 * r, 0.02 * r);
    g.lineTo(-0.4 * r, 0.3 * r);
    g.lineTo(-0.1 * r, -0.02 * r);
    g.lineTo(-0.24 * r, -0.02 * r);
    g.closePath();
    g.fill();
    g.strokeStyle = OUT;
    g.lineWidth = 0.7;
    g.stroke();
  } else if (st.top === 'vest') {
    g.fillStyle = shade(st.shirt, 0.75);
    roundRect(g, -0.42 * r, -0.62 * r * b, 0.7 * r, 1.24 * r * b, 0.15 * r);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 0.8;
    g.stroke();
    for (const s of [-1, 1]) {
      roundRect(g, -0.3 * r, s * 0.32 * r - 0.14 * r, 0.32 * r, 0.28 * r, 0.05 * r);
      g.fillStyle = shade(st.shirt, 0.62);
      g.fill();
      g.stroke();
    }
  } else if (st.top === 'leather') {
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 0.7;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(0.3 * r, s * 0.25 * r);
      g.lineTo(-0.45 * r, s * 0.32 * r);
      g.stroke();
    }
    // tachuelas en los hombros
    g.fillStyle = '#c9c4b8';
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(-0.1 * r + i * 0.18 * r, s * 0.78 * r * b, 0.55, 0, TAU);
      g.fill();
    }
  } else if (st.top === 'jacket' || st.top === 'coat') {
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 0.8;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(0.45 * r, s * 0.55 * r);
      g.quadraticCurveTo(0.05 * r, s * 0.6 * r, -0.45 * r, s * 0.58 * r);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(-0.5 * r, 0);
    g.lineTo(-0.2 * r, 0);
    g.stroke();
  } else if (st.top === 'sweater') {
    g.strokeStyle = rgba(shade(st.shirt, 0.7), 0.6);
    g.lineWidth = 0.6;
    for (let y = -r; y < r; y += 1.6) {
      g.beginPath();
      g.moveTo(-0.5 * r, y);
      g.lineTo(-0.38 * r, y);
      g.stroke();
    }
  } else if (st.top === 'shirt') {
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(0.48 * r, 0);
    g.lineTo(0.2 * r, 0);
    g.stroke();
  } else if (st.top === 'tank' && st.tattoo) {
    // camiseta de tirantes: hombros desnudos con tatuajes
    for (const s of [-1, 1]) {
      g.fillStyle = st.skin;
      g.beginPath();
      g.ellipse(0.02 * r, s * 0.72 * r * b, 0.4 * r, 0.26 * r, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(30,40,60,0.75)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(0.02 * r, s * 0.72 * r * b, 0.14 * r, 0, TAU * 0.8);
      g.moveTo(-0.2 * r, s * 0.66 * r);
      g.lineTo(0.18 * r, s * 0.82 * r);
      g.stroke();
    }
  }
  folds(g, r, b, rng, 'rgba(0,0,0,0.22)');
  g.restore();
  torsoPath(g, r, b);
  volume(g, 0, 0, r * 1.05, 0.2, 0.38);
  outline(g);
  // capucha o cuello alto detrás de la nuca
  if (st.top === 'hoodie') {
    ell(g, -0.42 * r, 0, 0.26 * r, 0.42 * r, shade(st.shirt, 0.82), LW);
    ell(g, -0.38 * r, 0, 0.14 * r, 0.28 * r, shade(st.shirt, 0.55), 0);
    g.strokeStyle = '#e6e0d2';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(0.42 * r, -0.12 * r);
    g.lineTo(0.62 * r, -0.16 * r);
    g.moveTo(0.42 * r, 0.12 * r);
    g.lineTo(0.62 * r, 0.16 * r);
    g.stroke();
  } else if (st.top === 'coat' || st.top === 'leather' || st.top === 'hero') {
    g.beginPath();
    g.arc(0.02 * r, 0, 0.48 * r, Math.PI * 0.55, Math.PI * 1.45);
    g.lineWidth = 0.18 * r;
    g.strokeStyle = st.top === 'hero' ? shade(st.shirt, 1.5) : shade(st.shirt, 1.25);
    g.stroke();
    g.lineWidth = 0.8;
    g.strokeStyle = OUT;
    g.beginPath();
    g.arc(0.02 * r, 0, 0.57 * r, Math.PI * 0.6, Math.PI * 1.4);
    g.stroke();
  } else {
    // cuello de la camiseta
    g.beginPath();
    g.arc(0.06 * r, 0, 0.4 * r, -1.1, 1.1);
    g.lineWidth = 1.2;
    g.strokeStyle = shade(st.shirt, 0.7);
    g.stroke();
  }
  if (st.bag === 'shoulder') {
    g.strokeStyle = shade(st.bagColor, 0.8);
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(0.3 * r, -0.8 * r);
    g.lineTo(-0.3 * r, 0.75 * r);
    g.stroke();
    roundRect(g, -0.45 * r, 0.82 * r * st.build, 0.6 * r, 0.32 * r, 0.08 * r);
    g.fillStyle = st.bagColor;
    g.fill();
    outline(g, 1.1);
  } else if (st.bag === 'backpack') {
    g.strokeStyle = shade(st.bagColor, 0.75);
    g.lineWidth = 1.4;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(-0.4 * r, s * 0.42 * r);
      g.quadraticCurveTo(0.1 * r, s * 0.5 * r, 0.3 * r, s * 0.38 * r);
      g.stroke();
    }
  }
}

/* ---------- Torso tumbado (ragdoll) ---------- */

// Eje X: de la cadera (−) al cuello (+). Visto de frente o de espaldas, más largo.
function paintLying(g, st, r) {
  const b = st.build;
  const rng = mulberry32(st.seed + 1);
  // cadera / cinturón
  roundRect(g, -0.75 * r, -0.62 * r * b, 0.5 * r, 1.24 * r * b, 0.25 * r);
  g.fillStyle = st.pants;
  g.fill();
  outline(g);
  const path = () => {
    g.beginPath();
    g.moveTo(-0.55 * r, -0.66 * r * b);
    g.quadraticCurveTo(0.3 * r, -0.98 * r * b, 0.62 * r, -0.86 * r * b);
    g.quadraticCurveTo(0.8 * r, 0, 0.62 * r, 0.86 * r * b);
    g.quadraticCurveTo(0.3 * r, 0.98 * r * b, -0.55 * r, 0.66 * r * b);
    g.quadraticCurveTo(-0.66 * r, 0, -0.55 * r, -0.66 * r * b);
    g.closePath();
  };
  path();
  g.fillStyle = st.shirt;
  g.fill();
  g.save();
  path();
  g.clip();
  fabricPattern(g, st, r, b, rng);
  if (st.top === 'hero') {
    g.strokeStyle = st.accent;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0.6 * r, -0.7 * r);
    g.lineTo(0.05 * r, -0.1 * r);
    g.lineTo(0.15 * r, 0.1 * r);
    g.lineTo(-0.45 * r, 0.6 * r);
    g.stroke();
  } else if (st.top === 'jacket' || st.top === 'coat' || st.top === 'leather') {
    g.fillStyle = shade(st.shirt, 1.25);
    g.beginPath();
    g.moveTo(0.65 * r, -0.35 * r);
    g.lineTo(0.1 * r, 0);
    g.lineTo(0.65 * r, 0.35 * r);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(0.1 * r, 0);
    g.lineTo(-0.55 * r, 0);
    g.stroke();
  } else if (st.top === 'vest') {
    g.fillStyle = shade(st.shirt, 0.7);
    roundRect(g, -0.4 * r, -0.55 * r, 0.85 * r, 1.1 * r, 0.1 * r);
    g.fill();
  }
  folds(g, r, b, rng, 'rgba(0,0,0,0.2)');
  g.restore();
  path();
  volume(g, 0, 0, r, 0.18, 0.36);
  outline(g);
  // cuello
  g.beginPath();
  g.arc(0.78 * r, 0, 0.3 * r, Math.PI * 0.6, Math.PI * 1.4);
  g.lineWidth = 1.2;
  g.strokeStyle = shade(st.shirt, 0.65);
  g.stroke();
}

/* ---------- Cabeza ---------- */

function hairCap(g, st, hr, cover, color) {
  // cubre la parte trasera de la cabeza (−x) hasta la línea del pelo
  g.beginPath();
  g.arc(0, 0, hr * 1.04, Math.PI * (1 - cover), Math.PI * (1 + cover));
  const y = Math.sin(Math.PI * (1 - cover)) * hr * 1.04;
  const x = Math.cos(Math.PI * (1 - cover)) * hr * 1.04;
  g.quadraticCurveTo(x + hr * 0.4, 0, x, y);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}
function strands(g, hr, color, n, len = 1) {
  g.strokeStyle = color;
  g.lineWidth = 0.55;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 0.55 + (i / (n - 1)) * Math.PI * 0.9;
    g.beginPath();
    g.moveTo(Math.cos(a) * hr * 0.2 + hr * 0.15, Math.sin(a) * hr * 0.2);
    g.lineTo(Math.cos(a) * hr * 0.92 * len, Math.sin(a) * hr * 0.92 * len);
    g.stroke();
  }
}

function paintHead(g, st, r) {
  const hr = 0.42 * r * (st.build > 1.15 ? 1.06 : 1);
  const hairC = st.hair;
  const style = st.hairStyle;
  const dk = shade(hairC, 0.65);
  const lt = shade(hairC, 1.35);
  // pelo largo o coleta: cae por la espalda (por debajo de la cabeza)
  if (style === 'long') {
    g.beginPath();
    g.moveTo(-0.1 * hr, -hr * 1.05);
    g.quadraticCurveTo(-hr * 2.2, -hr * 1.1, -hr * 2.1, 0);
    g.quadraticCurveTo(-hr * 2.2, hr * 1.1, -0.1 * hr, hr * 1.05);
    g.closePath();
    g.fillStyle = hairC;
    g.fill();
    outline(g);
    strands(g, hr * 2, dk, 7, 0.95);
  } else if (style === 'ponytail') {
    ell(g, -hr * 1.55, 0, hr * 0.7, hr * 0.36, hairC);
    ell(g, -hr * 1.0, 0, hr * 0.16, hr * 0.22, st.hat);
  }
  if (style === 'afro' || style === 'curly') {
    const R = style === 'afro' ? hr * 1.42 : hr * 1.14;
    g.beginPath();
    const n = style === 'afro' ? 16 : 13;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const rr = R * (i % 2 ? 0.93 : 1.02);
      const px = Math.cos(a) * rr - (style === 'afro' ? hr * 0.18 : hr * 0.08);
      const py = Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py);
      else g.quadraticCurveTo(Math.cos(a - TAU / n / 2) * R * 1.12 - hr * 0.12, Math.sin(a - TAU / n / 2) * R * 1.12, px, py);
    }
    g.closePath();
    g.fillStyle = hairC;
    g.fill();
    outline(g);
    g.fillStyle = lt;
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39;
      const d = (i / 14) * R * 0.8;
      g.beginPath();
      g.arc(Math.cos(a) * d - hr * 0.15, Math.sin(a) * d, hr * 0.12, 0, TAU);
      g.fill();
    }
    // cara asomando por delante
    g.save();
    g.beginPath();
    g.arc(hr * 0.15, 0, hr * 0.8, -1.0, 1.0);
    g.closePath();
    g.fillStyle = st.skin;
    g.fill();
    g.restore();
    nose(g, st, hr);
    return;
  }
  // orejas
  for (const s of [-1, 1]) ell(g, hr * 0.05, s * hr * 0.98, hr * 0.17, hr * 0.24, shade(st.skin, 0.92), 1.1);
  // cráneo
  g.beginPath();
  g.arc(0, 0, hr, 0, TAU);
  g.fillStyle = st.skin;
  g.fill();
  g.save();
  g.beginPath();
  g.arc(0, 0, hr, 0, TAU);
  g.clip();
  if (style === 'short' || style === 'ponytail' || style === 'long' || style === 'bun' || style === 'bandana') {
    hairCap(g, st, hr, 0.62, hairC);
    strands(g, hr, dk, 8);
    g.fillStyle = lt;
    g.globalAlpha = 0.5;
    g.beginPath();
    g.ellipse(-hr * 0.35, -hr * 0.25, hr * 0.32, hr * 0.12, -0.6, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
  } else if (style === 'buzz') {
    g.fillStyle = rgba(hairC, 0.55);
    g.beginPath();
    g.arc(-hr * 0.1, 0, hr, Math.PI * 0.4, Math.PI * 1.6);
    g.fill();
    grain(g, mulberry32(st.seed + 4), -hr, -hr, hr * 1.6, hr * 2, 60, rgba(dk, 0.6), 0.5);
  } else if (style === 'mohawk') {
    g.fillStyle = 'rgba(40,30,25,0.18)';
    g.fillRect(-hr, -hr, hr * 2, hr * 2);
  } else if (style === 'cap' || style === 'beanie' || style === 'hood') {
    // se dibujan encima
  } else if (style === 'bald') {
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(-hr * 0.2, -hr * 0.3, hr * 0.38, hr * 0.2, -0.5, 0, TAU);
    g.fill();
  } else if (style === 'spikyDark') {
    hairCap(g, st, hr, 0.66, hairC);
  }
  g.restore();
  g.beginPath();
  g.arc(0, 0, hr, 0, TAU);
  volume(g, 0, 0, hr, 0.25, 0.3);
  outline(g);

  if (style === 'spikyDark') {
    // pelo en picos peinado hacia atrás
    const spikes = [[-0.95, 0], [-0.75, -0.62], [-0.75, 0.62], [-0.3, -0.92], [-0.3, 0.92], [-0.55, -0.32], [-0.55, 0.32]];
    for (const [sx, sy] of spikes) {
      const bx = sx * hr;
      const by = sy * hr;
      const len = hr * 0.7;
      const a = Math.atan2(by * 0.5, -hr);
      g.beginPath();
      g.moveTo(bx + Math.cos(a + 1.6) * hr * 0.28 + hr * 0.25, by + Math.sin(a + 1.6) * hr * 0.28);
      g.lineTo(bx + Math.cos(a) * len, by + Math.sin(a) * len);
      g.lineTo(bx + Math.cos(a - 1.6) * hr * 0.28 + hr * 0.25, by + Math.sin(a - 1.6) * hr * 0.28);
      g.closePath();
      g.fillStyle = hairC;
      g.fill();
      outline(g, 1.1);
    }
    g.beginPath();
    g.arc(-hr * 0.05, 0, hr * 0.8, Math.PI * 0.45, Math.PI * 1.55);
    g.quadraticCurveTo(hr * 0.35, 0, -hr * 0.05 + Math.cos(Math.PI * 0.45) * hr * 0.8, Math.sin(Math.PI * 0.45) * hr * 0.8);
    g.fillStyle = hairC;
    g.fill();
  } else if (style === 'hero') {
    paintHelmet(g, st, hr);
  } else if (style === 'mohawk') {
    for (let i = 0; i < 6; i++) {
      const x = hr * 0.6 - i * hr * 0.32;
      g.beginPath();
      g.moveTo(x + hr * 0.18, -hr * 0.16);
      g.lineTo(x - hr * 0.42, 0);
      g.lineTo(x + hr * 0.18, hr * 0.16);
      g.closePath();
      g.fillStyle = i % 2 ? hairC : shade(hairC, 1.2);
      g.fill();
      outline(g, 0.9);
    }
  } else if (style === 'bun') {
    ell(g, -hr * 0.55, 0, hr * 0.42, hr * 0.42, hairC);
    strands(g, hr * 0.4, dk, 5);
  } else if (style === 'bandana') {
    g.beginPath();
    g.arc(0, 0, hr * 1.02, Math.PI * 0.42, Math.PI * 1.58);
    g.closePath();
    g.fillStyle = st.hat;
    g.fill();
    outline(g, 1.1);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(-hr * 0.5 + (i % 3) * hr * 0.3, (i < 3 ? -1 : 1) * hr * 0.35, 0.5, 0, TAU);
      g.fill();
    }
    ell(g, -hr * 1.08, hr * 0.2, hr * 0.3, hr * 0.14, st.hat, 1, 0.6);
    ell(g, -hr * 1.1, -hr * 0.05, hr * 0.28, hr * 0.12, shade(st.hat, 0.85), 1, -0.4);
  } else if (style === 'cap') {
    g.beginPath();
    g.ellipse(hr * 0.9, 0, hr * 0.62, hr * 0.78, 0, -Math.PI / 2, Math.PI / 2);
    g.fillStyle = shade(st.hat, 0.8);
    g.fill();
    outline(g, 1.2);
    ell(g, -hr * 0.05, 0, hr * 1.02, hr * 1.02, st.hat, 1.4);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 0.7;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      g.beginPath();
      g.moveTo(-hr * 0.05, 0);
      g.lineTo(-hr * 0.05 + Math.cos(a) * hr, Math.sin(a) * hr);
      g.stroke();
    }
    g.beginPath();
    g.arc(-hr * 0.05, 0, hr * 1.0, 0, TAU);
    volume(g, -hr * 0.05, 0, hr, 0.22, 0.25);
    ell(g, -hr * 0.05, 0, hr * 0.14, hr * 0.14, shade(st.hat, 0.7), 0.8);
  } else if (style === 'beanie') {
    ell(g, -hr * 0.05, 0, hr * 1.06, hr * 1.06, st.hat, 1.4);
    g.strokeStyle = rgba(shade(st.hat, 0.6), 0.7);
    g.lineWidth = 0.7;
    for (let i = -4; i <= 4; i++) {
      g.beginPath();
      g.moveTo(hr * 0.75, i * hr * 0.2);
      g.lineTo(-hr * 0.9, i * hr * 0.2);
      g.stroke();
    }
    g.beginPath();
    g.arc(hr * 0.1, 0, hr * 0.98, -1.1, 1.1);
    g.lineWidth = hr * 0.3;
    g.strokeStyle = shade(st.hat, 0.85);
    g.stroke();
    g.beginPath();
    g.arc(-hr * 0.05, 0, hr * 1.06, 0, TAU);
    volume(g, -hr * 0.05, 0, hr * 1.06, 0.2, 0.3);
  } else if (style === 'hood') {
    g.beginPath();
    g.ellipse(-hr * 0.15, 0, hr * 1.25, hr * 1.18, 0, 0, TAU);
    g.fillStyle = st.shirt;
    g.fill();
    volume(g, -hr * 0.15, 0, hr * 1.2, 0.2, 0.35);
    outline(g, 1.4);
    g.beginPath();
    g.ellipse(hr * 0.6, 0, hr * 0.45, hr * 0.78, 0, 0, TAU);
    g.fillStyle = shade(st.shirt, 0.4);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(hr * 0.2, 0);
    g.lineTo(-hr * 1.25, 0);
    g.stroke();
  }
  if (style !== 'hood' && style !== 'hero') nose(g, st, hr);
}

// Casco aerodinámico del protagonista: carcasa blanca, franja cian, visor y aletas.
function paintHelmet(g, st, hr) {
  // aletas traseras en forma de rayo
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(-hr * 0.55, s * hr * 0.55);
    g.lineTo(-hr * 1.55, s * hr * 1.0);
    g.lineTo(-hr * 1.15, s * hr * 0.6);
    g.lineTo(-hr * 1.45, s * hr * 0.55);
    g.lineTo(-hr * 0.7, s * hr * 0.2);
    g.closePath();
    g.fillStyle = st.accent2;
    g.fill();
    outline(g, 1.2);
  }
  // carcasa alargada hacia atrás
  g.beginPath();
  g.ellipse(-hr * 0.12, 0, hr * 1.18, hr * 1.04, 0, 0, TAU);
  const gr = g.createRadialGradient(-hr * 0.35, -hr * 0.35, hr * 0.1, -hr * 0.1, 0, hr * 1.2);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.55, '#dfe6ee');
  gr.addColorStop(1, '#9aa7b8');
  g.fillStyle = gr;
  g.fill();
  outline(g, 1.5);
  // franja central y filetes
  g.save();
  g.beginPath();
  g.ellipse(-hr * 0.12, 0, hr * 1.18, hr * 1.04, 0, 0, TAU);
  g.clip();
  g.fillStyle = st.accent;
  g.fillRect(-hr * 1.4, -hr * 0.16, hr * 2.2, hr * 0.32);
  g.fillStyle = st.shirt;
  g.fillRect(-hr * 1.4, -hr * 0.3, hr * 2.2, hr * 0.08);
  g.fillRect(-hr * 1.4, hr * 0.22, hr * 2.2, hr * 0.08);
  g.restore();
  // visor envolvente al frente
  g.beginPath();
  g.ellipse(hr * 0.05, 0, hr * 1.0, hr * 0.92, 0, -1.05, 1.05);
  g.ellipse(hr * 0.05, 0, hr * 0.62, hr * 0.7, 0, 1.0, -1.0, true);
  g.closePath();
  const vg = g.createLinearGradient(hr * 0.4, -hr, hr * 1.0, hr);
  vg.addColorStop(0, '#d8fbff');
  vg.addColorStop(0.35, st.accent);
  vg.addColorStop(1, '#0a5a7a');
  g.fillStyle = vg;
  g.fill();
  outline(g, 1.2);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = hr * 0.1;
  g.lineCap = 'round';
  g.beginPath();
  g.ellipse(hr * 0.05, 0, hr * 0.86, hr * 0.8, 0, -0.85, -0.35);
  g.stroke();
  // brillo
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath();
  g.ellipse(-hr * 0.55, -hr * 0.5, hr * 0.28, hr * 0.12, -0.5, 0, TAU);
  g.fill();
}

function nose(g, st, hr) {
  ell(g, hr * 0.98, 0, hr * 0.16, hr * 0.12, shade(st.skin, 0.95), 1);
}

/* ---------- Manos, zapatos y objetos ---------- */

function paintHand(g, st, r) {
  const c = st.glove || st.skin;
  ell(g, 0, 0, 0.19 * r, 0.17 * r, c, 1.2);
  ell(g, 0.1 * r, -0.03 * r, 0.07 * r, 0.1 * r, shade(c, 0.88), 0.8);
  g.beginPath();
  g.arc(0, 0, 0.19 * r, 0, TAU);
  volume(g, 0, 0, 0.19 * r, 0.3, 0.25);
  if (st.kind === 'hero') {
    g.fillStyle = st.accent;
    g.fillRect(-0.18 * r, -0.05 * r, 0.06 * r, 0.1 * r);
  }
}

function paintShoe(g, st, r) {
  const c = st.shoes;
  g.beginPath();
  g.ellipse(0.04 * r, 0, 0.3 * r, 0.16 * r, 0, 0, TAU);
  g.fillStyle = st.sole || shade(c, 0.7);
  g.fill();
  outline(g, 1.2);
  g.beginPath();
  g.ellipse(0.0, 0, 0.24 * r, 0.12 * r, 0, 0, TAU);
  g.fillStyle = c;
  g.fill();
  volume(g, 0, 0, 0.24 * r, 0.3, 0.2);
  g.strokeStyle = st.kind === 'hero' ? st.accent : 'rgba(0,0,0,0.35)';
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(-0.08 * r, -0.05 * r);
  g.lineTo(0.14 * r, -0.05 * r);
  g.moveTo(-0.08 * r, 0.05 * r);
  g.lineTo(0.14 * r, 0.05 * r);
  g.stroke();
}

export function paintBat(g) {
  g.beginPath();
  g.moveTo(0, -1.2);
  g.lineTo(20, -2.6);
  g.quadraticCurveTo(24, 0, 20, 2.6);
  g.lineTo(0, 1.2);
  g.closePath();
  const lg = g.createLinearGradient(0, -3, 0, 3);
  lg.addColorStop(0, '#d9b47a');
  lg.addColorStop(0.5, '#b88a4e');
  lg.addColorStop(1, '#7a5530');
  g.fillStyle = lg;
  g.fill();
  outline(g, 1.2);
  g.fillStyle = '#2a2420';
  g.fillRect(0, -1.4, 5, 2.8);
}
export function paintPipe(g) {
  roundRect(g, 0, -1.6, 22, 3.2, 1.2);
  const lg = g.createLinearGradient(0, -2, 0, 2);
  lg.addColorStop(0, '#c9ced2');
  lg.addColorStop(0.5, '#8a9196');
  lg.addColorStop(1, '#4f555a');
  g.fillStyle = lg;
  g.fill();
  outline(g, 1.2);
  g.fillStyle = '#6b4a2e';
  g.fillRect(17, -2.2, 3, 4.4);
}

/* ---------- Bake ---------- */

// Crea en el atlas todas las piezas de un estilo y devuelve el "kit" para dibujarlo.
export function bakeCharacter(atlas, id, st, r) {
  const b = st.build;
  const wide = 2.6 * r * Math.max(1, b);
  const kit = {
    r,
    st,
    torso: atlas.add(id + '.torso', wide, wide, (g) => paintTorso(g, st, r)),
    lying: atlas.add(id + '.lying', wide, wide, (g) => paintLying(g, st, r)),
    head: atlas.add(id + '.head', r * 2.4, r * 2.4, (g) => paintHead(g, st, r), { ax: r * 1.35, ay: r * 1.2 }),
    hand: atlas.add(id + '.hand', r * 0.6, r * 0.6, (g) => paintHand(g, st, r)),
    shoe: atlas.add(id + '.shoe', r * 0.8, r * 0.5, (g) => paintShoe(g, st, r)),
    sleeve: st.sleeves === 'none' ? st.skin : st.top === 'hero' ? st.shirt : st.top === 'vest' ? '#3d4a5a' : st.shirt,
    forearm: st.sleeves === 'long' ? (st.top === 'hero' ? st.shirt : shade(st.shirt, 0.93)) : st.skin,
    pants: st.pants,
  };
  if (st.top === 'vest') kit.sleeve = kit.forearm = '#4a5560';
  const flash = '#ffffff';
  kit.torsoF = atlas.tinted(id + '.torsoF', kit.torso, flash, 0.75);
  kit.headF = atlas.tinted(id + '.headF', kit.head, flash, 0.75);
  kit.lyingF = atlas.tinted(id + '.lyingF', kit.lying, flash, 0.75);
  // silueta cian para marcas del Sonic Time y fantasmas
  kit.torsoS = atlas.tinted(id + '.torsoS', kit.torso, '#2fb6ff', 0.85);
  kit.headS = atlas.tinted(id + '.headS', kit.head, '#2fb6ff', 0.85);
  kit.lyingS = atlas.tinted(id + '.lyingS', kit.lying, '#2fb6ff', 0.85);
  return kit;
}

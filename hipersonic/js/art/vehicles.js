// Vehículos vistos desde arriba (el frente mira a +x). Cada modelo y color se pinta una vez
// en el atlas; las abolladuras y cristales rotos se añaden encima en tiempo real.
import { TAU, mulberry32, rrange, shade, roundRect, rgba } from '../util.js';
import { OUT } from './characters.js';

export const CAR_COLORS = ['#8a2f2a', '#c76a43', '#3f5a75', '#6b6d68', '#bdb6a4', '#2f3d33', '#8a6a3a', '#4b4f63', '#d9d4c8', '#26282c', '#4f7a8a', '#7a3a5a'];

export const MODELS = {
  sedan: { L: 88, W: 40, kind: 'car', glass: [0.1, 0.24, -0.3, -0.18], weight: 1 },
  hatch: { L: 74, W: 38, kind: 'car', glass: [0.08, 0.24, -0.38, -0.3], weight: 0.8 },
  taxi: { L: 88, W: 40, kind: 'car', glass: [0.1, 0.24, -0.3, -0.18], color: '#e8b830', weight: 1 },
  suv: { L: 94, W: 44, kind: 'car', glass: [0.12, 0.26, -0.42, -0.34], weight: 1.4 },
  police: { L: 90, W: 41, kind: 'car', glass: [0.1, 0.24, -0.3, -0.18], color: '#e9e6df', weight: 1.1 },
  van: { L: 106, W: 46, kind: 'van', glass: [0.24, 0.34, -0.48, -0.46], weight: 1.8 },
  pickup: { L: 102, W: 44, kind: 'pickup', glass: [0.16, 0.28, -0.04, 0.04], weight: 1.6 },
  truck: { L: 158, W: 54, kind: 'truck', weight: 4 },
  bus: { L: 232, W: 58, kind: 'bus', weight: 6 },
};
export const TRAFFIC_MIX = ['sedan', 'sedan', 'hatch', 'hatch', 'taxi', 'suv', 'suv', 'van', 'pickup', 'police', 'truck', 'truck', 'bus'];

function bodyPath(g, L, W, rf = 10, rb = 8, pinch = 2) {
  const x0 = -L / 2;
  const x1 = L / 2;
  const y0 = -W / 2;
  const y1 = W / 2;
  g.beginPath();
  g.moveTo(x0 + rb, y0 + pinch);
  g.quadraticCurveTo(0, y0 - 1, x1 - rf, y0 + pinch * 0.5);
  g.quadraticCurveTo(x1, y0 + 1, x1, y0 + rf);
  g.lineTo(x1, y1 - rf);
  g.quadraticCurveTo(x1, y1 - 1, x1 - rf, y1 - pinch * 0.5);
  g.quadraticCurveTo(0, y1 + 1, x0 + rb, y1 - pinch);
  g.quadraticCurveTo(x0, y1 - 1, x0, y1 - rb);
  g.lineTo(x0, y0 + rb);
  g.quadraticCurveTo(x0, y0 + 1, x0 + rb, y0 + pinch);
  g.closePath();
}

function cylShade(g, x, y, w, h, base) {
  const lg = g.createLinearGradient(0, y, 0, y + h);
  lg.addColorStop(0, shade(base, 0.62));
  lg.addColorStop(0.18, shade(base, 0.95));
  lg.addColorStop(0.45, shade(base, 1.22));
  lg.addColorStop(0.7, base);
  lg.addColorStop(1, shade(base, 0.55));
  g.fillStyle = lg;
}
function glass(g, path, x0, x1) {
  path();
  const lg = g.createLinearGradient(x0, 0, x1, 0);
  lg.addColorStop(0, '#1a2430');
  lg.addColorStop(0.5, '#34495a');
  lg.addColorStop(1, '#18212b');
  g.fillStyle = lg;
  g.fill();
  g.lineWidth = 1.3;
  g.strokeStyle = OUT;
  g.stroke();
}
function reflection(g, x, y0, y1, w) {
  g.strokeStyle = 'rgba(200,225,255,0.32)';
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - 2, y0);
  g.lineTo(x + 3, y1);
  g.stroke();
}
function wheels(g, L, W, xs) {
  g.fillStyle = '#121316';
  for (const x of xs) for (const s of [-1, 1]) {
    roundRect(g, x - 7.5, s * W / 2 - 3.6, 15, 7.2, 2.4);
    g.fill();
  }
}
function lights(g, L, W, front = true, rear = true) {
  if (front) for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(L / 2 - 3.2, s * (W / 2 - 6.5), 2.4, 4.6, 0, 0, TAU);
    g.fillStyle = '#f4ecc8';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = OUT;
    g.stroke();
  }
  if (rear) for (const s of [-1, 1]) {
    roundRect(g, -L / 2 + 0.6, s * (W / 2 - 6.5) - 4, 3, 8, 1.2);
    g.fillStyle = '#c42a24';
    g.fill();
    g.lineWidth = 0.9;
    g.strokeStyle = OUT;
    g.stroke();
  }
}

function paintCarBody(g, m, color, seed) {
  const { L, W } = m;
  const rng = mulberry32(seed);
  wheels(g, L, W, [L * 0.3, -L * 0.3]);
  bodyPath(g, L, W);
  cylShade(g, -L / 2, -W / 2, L, W, color);
  g.fill();
  // capó y maletero: pliegues
  g.strokeStyle = rgba(shade(color, 0.6), 0.7);
  g.lineWidth = 0.9;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(L * 0.22, s * W * 0.2);
    g.quadraticCurveTo(L * 0.36, s * W * 0.22, L * 0.47, s * W * 0.18);
    g.stroke();
  }
  // parachoques
  g.fillStyle = shade(color, 0.45);
  roundRect(g, L / 2 - 2.6, -W / 2 + 5, 2.6, W - 10, 1);
  g.fill();
  roundRect(g, -L / 2, -W / 2 + 5, 2.4, W - 10, 1);
  g.fill();
  const [f0, f1, b0, b1] = m.glass;
  const cabTop = W / 2 - 4.5;
  const roofFront = L * f0;
  const roofBack = L * b1;
  // parabrisas
  glass(g, () => {
    g.beginPath();
    g.moveTo(L * f1, -cabTop + 3.5);
    g.quadraticCurveTo(L * f1 + 3, 0, L * f1, cabTop - 3.5);
    g.lineTo(roofFront, cabTop - 1);
    g.lineTo(roofFront, -cabTop + 1);
    g.closePath();
  }, L * f0, L * f1);
  reflection(g, L * (f0 + f1) * 0.5, -cabTop * 0.55, cabTop * 0.1, 2.2);
  // luneta trasera
  glass(g, () => {
    g.beginPath();
    g.moveTo(L * b0, -cabTop + 3.5);
    g.quadraticCurveTo(L * b0 - 2, 0, L * b0, cabTop - 3.5);
    g.lineTo(roofBack, cabTop - 1.5);
    g.lineTo(roofBack, -cabTop + 1.5);
    g.closePath();
  }, L * b0, L * b1);
  // ventanillas laterales
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(roofFront, s * (cabTop - 0.5));
    g.lineTo(roofBack, s * (cabTop - 1));
    g.lineTo(roofBack + 1, s * (cabTop - 4.5));
    g.lineTo(roofFront - 1, s * (cabTop - 4.5));
    g.closePath();
    g.fillStyle = '#202b36';
    g.fill();
  }
  // techo
  roundRect(g, roofBack, -cabTop + 4.5, roofFront - roofBack, (cabTop - 4.5) * 2, 4);
  cylShade(g, roofBack, -cabTop + 4.5, roofFront - roofBack, (cabTop - 4.5) * 2, shade(color, 1.06));
  g.fill();
  g.lineWidth = 1.1;
  g.strokeStyle = rgba(shade(color, 0.45), 0.9);
  g.stroke();
  // retrovisores
  for (const s of [-1, 1]) {
    roundRect(g, L * f1 - 4, s * (W / 2 + 1.2) - 2, 5, 4, 1.4);
    g.fillStyle = shade(color, 0.8);
    g.fill();
    g.lineWidth = 0.9;
    g.strokeStyle = OUT;
    g.stroke();
  }
  lights(g, L, W);
  // suciedad
  for (let i = 0; i < 18; i++) {
    g.fillStyle = 'rgba(40,30,20,0.12)';
    g.beginPath();
    g.arc(rrange(rng, -L / 2, L / 2), rrange(rng, -W / 2, W / 2), rrange(rng, 0.6, 2), 0, TAU);
    g.fill();
  }
  bodyPath(g, L, W);
  g.lineWidth = 2;
  g.strokeStyle = OUT;
  g.stroke();
  return { roofFront, roofBack, cabTop };
}

function paintTaxi(g, m, color, seed) {
  const r = paintCarBody(g, m, color, seed);
  const cx = (r.roofFront + r.roofBack) / 2;
  roundRect(g, cx - 5, -9, 10, 18, 2);
  g.fillStyle = '#f2efe4';
  g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = OUT;
  g.stroke();
  g.fillStyle = '#26282c';
  g.fillRect(cx - 1.5, -6, 3, 12);
  // franja de cuadros
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 ? '#26282c' : '#f2efe4';
    g.fillRect(-m.L * 0.12 + i * 3, m.W / 2 - 3.6, 3, 2);
    g.fillRect(-m.L * 0.12 + i * 3, -m.W / 2 + 1.6, 3, 2);
  }
}
function paintPolice(g, m, color, seed) {
  paintCarBody(g, m, '#e9e6df', seed);
  // capó y maletero negros
  g.save();
  bodyPath(g, m.L, m.W);
  g.clip();
  g.fillStyle = 'rgba(25,27,32,0.92)';
  g.fillRect(m.L * 0.25, -m.W / 2, m.L * 0.26, m.W);
  g.fillRect(-m.L / 2, -m.W / 2, m.L * 0.16, m.W);
  g.restore();
  lights(g, m.L, m.W);
  bodyPath(g, m.L, m.W);
  g.lineWidth = 2;
  g.strokeStyle = OUT;
  g.stroke();
  // barra de luces (se encienden en tiempo real)
  roundRect(g, -4, -12, 8, 24, 2);
  g.fillStyle = '#2a2c30';
  g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = OUT;
  g.stroke();
  g.fillStyle = '#7a1e1a';
  g.fillRect(-3, -11, 6, 10);
  g.fillStyle = '#1a2e7a';
  g.fillRect(-3, 1, 6, 10);
}

function paintVan(g, m, color, seed) {
  const { L, W } = m;
  wheels(g, L, W, [L * 0.33, -L * 0.3]);
  bodyPath(g, L, W, 12, 4, 1);
  cylShade(g, -L / 2, -W / 2, L, W, color);
  g.fill();
  glass(g, () => {
    g.beginPath();
    g.moveTo(L * 0.42, -W / 2 + 5);
    g.quadraticCurveTo(L * 0.46, 0, L * 0.42, W / 2 - 5);
    g.lineTo(L * 0.3, W / 2 - 4);
    g.lineTo(L * 0.3, -W / 2 + 4);
    g.closePath();
  }, L * 0.3, L * 0.44);
  reflection(g, L * 0.36, -W * 0.3, 0, 2.4);
  roundRect(g, -L / 2 + 4, -W / 2 + 4, L * 0.78, W - 8, 3);
  cylShade(g, 0, -W / 2 + 4, 0, W - 8, shade(color, 1.08));
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(shade(color, 0.5), 0.9);
  g.stroke();
  // barras del techo
  g.strokeStyle = '#2a2c30';
  g.lineWidth = 1.6;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(-L * 0.4, s * (W / 2 - 7));
    g.lineTo(L * 0.2, s * (W / 2 - 7));
    g.stroke();
  }
  for (let x = -L * 0.35; x < L * 0.2; x += 18) {
    g.strokeStyle = rgba(shade(color, 0.55), 0.6);
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x, -W / 2 + 6);
    g.lineTo(x, W / 2 - 6);
    g.stroke();
  }
  lights(g, L, W);
  bodyPath(g, L, W, 12, 4, 1);
  g.lineWidth = 2;
  g.strokeStyle = OUT;
  g.stroke();
}

function paintPickup(g, m, color, seed) {
  const { L, W } = m;
  wheels(g, L, W, [L * 0.3, -L * 0.3]);
  bodyPath(g, L, W, 10, 4, 1.5);
  cylShade(g, -L / 2, -W / 2, L, W, color);
  g.fill();
  // caja abierta
  roundRect(g, -L / 2 + 3, -W / 2 + 4, L * 0.44, W - 8, 2);
  g.fillStyle = '#26282b';
  g.fill();
  g.lineWidth = 1.3;
  g.strokeStyle = OUT;
  g.stroke();
  g.strokeStyle = '#3a3d40';
  g.lineWidth = 1.2;
  for (let y = -W / 2 + 9; y < W / 2 - 6; y += 5) {
    g.beginPath();
    g.moveTo(-L / 2 + 6, y);
    g.lineTo(-L / 2 + L * 0.44, y);
    g.stroke();
  }
  // carga
  roundRect(g, -L / 2 + 10, -8, 16, 14, 1.5);
  g.fillStyle = '#8a6a42';
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = OUT;
  g.stroke();
  // cabina
  glass(g, () => {
    g.beginPath();
    g.moveTo(L * 0.28, -W / 2 + 5);
    g.quadraticCurveTo(L * 0.31, 0, L * 0.28, W / 2 - 5);
    g.lineTo(L * 0.17, W / 2 - 4.5);
    g.lineTo(L * 0.17, -W / 2 + 4.5);
    g.closePath();
  }, L * 0.17, L * 0.3);
  reflection(g, L * 0.22, -W * 0.3, 0, 2.2);
  roundRect(g, -L * 0.04, -W / 2 + 5, L * 0.21, W - 10, 3);
  cylShade(g, 0, -W / 2 + 5, 0, W - 10, shade(color, 1.06));
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(shade(color, 0.5), 0.9);
  g.stroke();
  lights(g, L, W);
  bodyPath(g, L, W, 10, 4, 1.5);
  g.lineWidth = 2;
  g.strokeStyle = OUT;
  g.stroke();
}

function paintTruck(g, m, color, seed) {
  const { L, W } = m;
  const rng = mulberry32(seed);
  const cab = 42;
  wheels(g, L, W, [L / 2 - 20, -L / 2 + 22, -L / 2 + 40]);
  // caja
  const bx = -L / 2;
  const bw = L - cab - 4;
  roundRect(g, bx, -W / 2, bw, W, 3);
  const boxC = rng() < 0.5 ? '#e4e0d6' : shade(color, 1.2);
  cylShade(g, bx, -W / 2, bw, W, boxC);
  g.fill();
  g.strokeStyle = rgba(shade(boxC, 0.6), 0.8);
  g.lineWidth = 1;
  for (let x = bx + 10; x < bx + bw - 4; x += 12) {
    g.beginPath();
    g.moveTo(x, -W / 2 + 2);
    g.lineTo(x, W / 2 - 2);
    g.stroke();
  }
  // franja de la empresa
  g.fillStyle = color;
  g.fillRect(bx + 2, -W / 2 + 1, bw - 4, 4);
  g.fillRect(bx + 2, W / 2 - 5, bw - 4, 4);
  roundRect(g, bx, -W / 2, bw, W, 3);
  g.lineWidth = 2.2;
  g.strokeStyle = OUT;
  g.stroke();
  // cabina
  const cx = L / 2 - cab;
  roundRect(g, cx, -W / 2 + 2, cab, W - 4, 8);
  cylShade(g, cx, -W / 2 + 2, cab, W - 4, color);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = OUT;
  g.stroke();
  glass(g, () => {
    g.beginPath();
    g.moveTo(L / 2 - 4, -W / 2 + 7);
    g.quadraticCurveTo(L / 2 - 1, 0, L / 2 - 4, W / 2 - 7);
    g.lineTo(L / 2 - 13, W / 2 - 6);
    g.lineTo(L / 2 - 13, -W / 2 + 6);
    g.closePath();
  }, L / 2 - 13, L / 2 - 2);
  reflection(g, L / 2 - 8, -W * 0.3, 0, 2.4);
  roundRect(g, cx + 4, -W / 2 + 7, cab - 18, W - 14, 3);
  g.fillStyle = shade(color, 1.12);
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(shade(color, 0.5), 0.9);
  g.stroke();
  for (const s of [-1, 1]) {
    roundRect(g, L / 2 - 16, s * (W / 2 + 2) - 2.5, 4, 5, 1);
    g.fillStyle = '#2a2c30';
    g.fill();
  }
  lights(g, L, W - 4, true, false);
  for (const s of [-1, 1]) {
    g.fillStyle = '#c42a24';
    g.fillRect(-L / 2, s * (W / 2 - 6) - 3, 2.5, 6);
  }
}

function paintBus(g, m, color, seed) {
  const { L, W } = m;
  wheels(g, L, W, [L / 2 - 34, -L / 2 + 44]);
  roundRect(g, -L / 2, -W / 2, L, W, 8);
  cylShade(g, -L / 2, -W / 2, L, W, color);
  g.fill();
  // franja de ventanas a los lados
  for (const s of [-1, 1]) {
    g.fillStyle = '#1e2a35';
    g.fillRect(-L / 2 + 10, s > 0 ? W / 2 - 5 : -W / 2 + 1, L - 30, 4);
    g.fillStyle = 'rgba(150,190,220,0.3)';
    for (let x = -L / 2 + 12; x < L / 2 - 22; x += 22) g.fillRect(x, s > 0 ? W / 2 - 4.5 : -W / 2 + 1.5, 8, 1.2);
  }
  // techo blanco con aire acondicionado y trampillas
  roundRect(g, -L / 2 + 6, -W / 2 + 6, L - 22, W - 12, 5);
  g.fillStyle = '#dcdad2';
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.stroke();
  roundRect(g, -L * 0.15, -W * 0.28, L * 0.26, W * 0.56, 3);
  g.fillStyle = '#b9bab5';
  g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = OUT;
  g.stroke();
  for (let x = -L * 0.13; x < L * 0.1; x += 8) {
    g.strokeStyle = '#8a8b86';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x, -W * 0.25);
    g.lineTo(x, W * 0.25);
    g.stroke();
  }
  for (const x of [-L * 0.36, L * 0.25]) {
    roundRect(g, x, -8, 18, 16, 2);
    g.fillStyle = '#9fa3a6';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = OUT;
    g.stroke();
  }
  // parabrisas
  glass(g, () => {
    g.beginPath();
    g.moveTo(L / 2 - 2, -W / 2 + 6);
    g.quadraticCurveTo(L / 2 + 1, 0, L / 2 - 2, W / 2 - 6);
    g.lineTo(L / 2 - 14, W / 2 - 5);
    g.lineTo(L / 2 - 14, -W / 2 + 5);
    g.closePath();
  }, L / 2 - 14, L / 2);
  reflection(g, L / 2 - 8, -W * 0.3, 0, 2.6);
  lights(g, L, W);
  roundRect(g, -L / 2, -W / 2, L, W, 8);
  g.lineWidth = 2.4;
  g.strokeStyle = OUT;
  g.stroke();
}

const PAINTERS = { car: paintCarBody, van: paintVan, pickup: paintPickup, truck: paintTruck, bus: paintBus };

// Pinta en el atlas un modelo con su color. Devuelve el sprite.
export function bakeVehicle(atlas, model, color, seed) {
  const m = MODELS[model];
  const name = `veh.${model}.${color}`;
  const have = atlas.get(name);
  if (have) return have;
  return atlas.add(name, m.L + 10, m.W + 14, (g) => {
    if (model === 'taxi') paintTaxi(g, m, color, seed);
    else if (model === 'police') paintPolice(g, m, color, seed);
    else PAINTERS[m.kind](g, m, color, seed);
  }, { scale: 2.5 });
}

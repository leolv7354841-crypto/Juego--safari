// Ciudad en ruinas generada por semilla. Incluye:
// - obstáculos (rectángulos y círculos) con rejilla espacial
// - campo de flujo (BFS) para que los zombis rodeen edificios y coches
// - lista de ops de dibujo (datos: render/world.js las pinta en trozos con caché LRU)
import { WORLD_SIZE, ROAD_CENTERS, ROAD_HALF, SIDEWALK, NAV_CELL, CAR_COLORS } from '../core/config.ts';
import type { Block } from './build.ts';
import { mulberry32, rrange, rpick, clamp, TAU } from '../core/util.ts';

const OBS_CELL = 128;
const ROAD_W = ROAD_HALF * 2;
const SPAWN_CLEAR = 215;

// Obstáculo: k 0 rectángulo (x, y, w, h), k 1 círculo (x, y, r). Lo demás lo añaden quienes lo registran.
export interface Obstacle {
  k: number;
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  low?: boolean;
  prop?: boolean;
  block?: boolean;
  id?: number;
  stamp?: number;
  cells?: number[];
}

export interface WorldOp {
  layer: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: string;
  p: Record<string, unknown>;
  i: number;
}

export interface WorldLight {
  x: number;
  y: number;
  r: number;
  i: number;
  flicker: number;
  warm: boolean;
  ph: number;
}

export interface WorldTree {
  x: number;
  y: number;
  r: number;
  dead: boolean;
  seed: number;
  ang: number;
  size: number;
}

export interface WorldFire {
  x: number;
  y: number;
  s: number;
}

export interface Overhead {
  k: string;
  x: number;
  y: number;
  hx: number;
  hy: number;
  lit?: boolean;
}

// Campo de flujo (BFS): dist por celda de navegación; los anclajes de flanqueo añaden k, x, y.
export interface FlowField {
  dist: Uint16Array;
  cell: number;
  ok: boolean;
  k?: number;
  x?: number;
  y?: number;
}

type Pt = { x: number; y: number };

// Campo de flanqueo: siempre con su índice k y su punto de anclaje
export type Anchor = FlowField & { k: number; x: number; y: number };

// k 0 es rectángulo (w, h presentes) y el resto círculo (r presente)
type RectObs = Obstacle & { w: number; h: number };
type CircObs = Obstacle & { r: number };
const isRect = (o: Obstacle): o is RectObs => o.k === 0;
const isCirc = (o: Obstacle): o is CircObs => o.k !== 0;

// Por qué cara entra en el rectángulo `o` el segmento (x0, y0) → (x1, y1): 0 izquierda, 1 derecha,
// 2 arriba, 3 abajo; -1 si no entra o si ya empezaba dentro. En entryT queda la fracción del
// segmento donde toca la cara.
let entryT = 0;
function entryFace(x0: number, y0: number, x1: number, y1: number, o: RectObs): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  let face = -1;
  if (dx === 0) {
    if (x0 <= o.x || x0 >= o.x + o.w) return -1;
  } else {
    const a = (o.x - x0) / dx;
    const b = (o.x + o.w - x0) / dx;
    if (Math.min(a, b) > t0) {
      t0 = Math.min(a, b);
      face = dx > 0 ? 0 : 1;
    }
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (dy === 0) {
    if (y0 <= o.y || y0 >= o.y + o.h) return -1;
  } else {
    const a = (o.y - y0) / dy;
    const b = (o.y + o.h - y0) / dy;
    if (Math.min(a, b) > t0) {
      t0 = Math.min(a, b);
      face = dy > 0 ? 2 : 3;
    }
    t1 = Math.min(t1, Math.max(a, b));
  }
  entryT = t0;
  return t0 < t1 ? face : -1;
}

export class World {
  declare size: number;
  declare rng: () => number;
  declare seedBase: number;
  declare obstacles: Obstacle[];
  declare ops: WorldOp[];
  declare trees: WorldTree[];
  declare overhead: Overhead[];
  declare lights: WorldLight[];
  declare fires: WorldFire[];
  declare spawn: Pt;
  declare bands: number[][];
  declare obsN: number;
  declare obsGrid: Obstacle[][];
  declare stamp: number;
  declare lastBlock: Block | null;
  declare navN: number;
  declare blocked: Uint8Array;
  declare queue: Int32Array;
  declare main: FlowField;
  declare dist: Uint16Array;
  declare anchors: Anchor[];
  declare anchorTurn: number;
  constructor(seed = (Math.random() * 1e9) | 0) {
    this.size = WORLD_SIZE;
    this.rng = mulberry32(seed);
    this.seedBase = seed;
    this.obstacles = [];
    this.ops = [];
    this.trees = [];
    this.overhead = [];
    this.lights = [];
    this.fires = [];
    this.spawn = { x: 1900, y: 1900 };
    this.generate();
    this.buildObstacleGrid();
    this.buildNav();
  }

  nextSeed() {
    return (this.rng() * 1e9) | 0;
  }

  /* ---------- utilidades de generación ---------- */

  // Una op es un dato: el tipo de pintor (render/world.js) y lo que necesita para pintarse.
  op(layer: number, x: number, y: number, w: number, h: number, kind: string, p: Record<string, unknown> = {}) {
    this.ops.push({ layer, x, y, w, h, kind, p, i: this.ops.length });
  }

  addRect(x: number, y: number, w: number, h: number, low = false): Obstacle {
    const o: Obstacle = { k: 0, x, y, w, h, low };
    this.obstacles.push(o);
    return o;
  }

  // prop: objeto pequeño (farola, barril, bote…) que ocupa su sitio al generar el mapa pero no choca
  addCircle(x: number, y: number, r: number, low = false, prop = false): Obstacle {
    const o: Obstacle = { k: 1, x, y, r, low, prop };
    this.obstacles.push(o);
    return o;
  }

  free(x: number, y: number, w: number, h: number, pad = 8): boolean {
    if (x < 30 || y < 30 || x + w > this.size - 30 || y + h > this.size - 30) return false;
    const sx = this.spawn.x;
    const sy = this.spawn.y;
    const cx = clamp(sx, x, x + w);
    const cy = clamp(sy, y, y + h);
    if ((sx - cx) ** 2 + (sy - cy) ** 2 < SPAWN_CLEAR * SPAWN_CLEAR) return false;
    for (const o of this.obstacles) {
      let ox, oy, ow, oh;
      if (isRect(o)) {
        ox = o.x;
        oy = o.y;
        ow = o.w;
        oh = o.h;
      } else if (isCirc(o)) {
        ox = o.x - o.r;
        oy = o.y - o.r;
        ow = oh = o.r * 2;
      } else continue;
      if (x < ox + ow + pad && x + w + pad > ox && y < oy + oh + pad && y + h + pad > oy) return false;
    }
    return true;
  }

  addLight(x: number, y: number, r: number, intensity: number, flicker = 0, warm = true) {
    this.lights.push({ x, y, r, i: intensity, flicker, warm, ph: this.rng() * 100 });
  }

  addTree(x: number, y: number, r: number, dead = false): boolean {
    if (!this.free(x - 12, y - 12, 24, 24, 6)) return false;
    this.addCircle(x, y, 11);
    const seed = this.nextSeed();
    this.trees.push({ x, y, r, dead, seed, ang: this.rng() * TAU, size: r * 2.6 });
    this.op(2, x - r, y - r, r * 2 + 14, r * 2 + 14, 'addTree', { x, y, r });
    return true;
  }

  addBarrel(x: number, y: number, burning: boolean): boolean {
    if (!this.free(x - 13, y - 13, 26, 26, 4)) return false;
    this.addCircle(x, y, 12, false, true);
    this.op(3, x - 16, y - 16, 34, 34, 'addBarrel', { x, y, burning });
    if (burning) {
      this.addLight(x, y, 230, 0.95, 0.25);
      this.fires.push({ x, y, s: 1 });
    }
    return true;
  }

  addCar(
    x: number,
    y: number,
    horizontal: boolean,
    opts: { kind?: string; pad?: number; burnt?: boolean; burning?: boolean } = {},
  ) {
    const rng = this.rng;
    const kind = opts.kind || rpick(rng, ['sedan', 'sedan', 'sedan', 'hatch', 'taxi', 'pickup', 'van', 'police']);
    let len =
      kind === 'bus'
        ? 172
        : kind === 'van'
          ? 98
          : kind === 'pickup'
            ? 100
            : kind === 'truck'
              ? 126
              : rrange(rng, 82, 94);
    const wid = kind === 'bus' ? 52 : kind === 'truck' ? 50 : rrange(rng, 40, 44);
    if (kind === 'hatch') len = 76;
    const w = horizontal ? len : wid;
    const h = horizontal ? wid : len;
    const rx = x - w / 2;
    const ry = y - h / 2;
    if (!this.free(rx, ry, w, h, opts.pad ?? 10)) return false;
    // low: frena a jugador y zombis, pero las balas pasan por encima
    this.addRect(rx + 2, ry + 2, w - 4, h - 4, true);
    const ang = (horizontal ? 0 : Math.PI / 2) + (rng() < 0.5 ? Math.PI : 0);
    const burnt = opts.burnt ?? rng() < 0.14;
    const color = rpick(rng, CAR_COLORS);
    const seed = this.nextSeed();
    this.op(3, rx - 4, ry - 4, w + 16, h + 16, 'addCar', { x, y, ang, len, wid, kind, burnt, color, seed });
    if (burnt && (opts.burning ?? rng() < 0.3)) {
      this.addLight(x, y, 260, 0.9, 0.3);
      this.fires.push({ x, y, s: 1.6 });
    }
    return true;
  }

  /* ---------- generación ---------- */

  generate() {
    const S = this.size;
    this.op(0, 0, 0, S, S, 'generate1', { S });
    for (const c of ROAD_CENTERS) {
      this.op(0, c - ROAD_HALF, 0, ROAD_W, S, 'generate2', { c, S });
      this.op(0, 0, c - ROAD_HALF, S, ROAD_W, 'generate3', { c, S });
    }
    const bands = [];
    let prev = 0;
    for (const c of ROAD_CENTERS) {
      bands.push([prev, c - ROAD_HALF]);
      prev = c + ROAD_HALF;
    }
    bands.push([prev, S]);
    this.bands = bands;

    // Paredes del perímetro primero, así nada se coloca encima.
    this.border();
    // Utilería alrededor del punto de inicio.
    this.spawnProps();

    const last = bands.length - 1;
    for (let i = 0; i <= last; i++) {
      for (let j = 0; j <= last; j++) {
        const [x0, x1] = bands[i];
        const [y0, y1] = bands[j];
        const edge = i === 0 || j === 0 || i === last || j === last;
        const nearSpawn = (i === 2 || i === 3) && (j === 2 || j === 3);
        this.block(x0, y0, x1 - x0, y1 - y0, edge, nearSpawn);
      }
    }
    for (const c of ROAD_CENTERS) {
      for (const [a, b] of bands) {
        this.roadSegment(c, a, b, true);
        this.roadSegment(c, a, b, false);
      }
    }
    for (const cx of ROAD_CENTERS) for (const cy of ROAD_CENTERS) this.intersection(cx, cy);
    // capas: 0 suelo, 1 marcas, 2 sombras, 3 objetos
    this.ops.sort((a, b) => a.layer - b.layer || a.i - b.i);
  }

  border() {
    const S = this.size;
    const T = 24;
    this.addRect(0, 0, S, T);
    this.addRect(0, S - T, S, T);
    this.addRect(0, 0, T, S);
    this.addRect(S - T, 0, T, S);
    const wall = (x: number, y: number, w: number, h: number) =>
      this.op(3, x, y, w + 12, h + 12, 'border', { x, y, w, h });
    wall(0, 0, S, T);
    wall(0, S - T, S, T);
    wall(0, 0, T, S);
    wall(S - T, 0, T, S);
  }

  spawnProps() {
    const { x, y } = this.spawn;
    // barriles encendidos en las esquinas de la intersección inicial
    this.spawn.x = -9999;
    this.addBarrel(x + 150, y + 150, true);
    this.addBarrel(x - 150, y - 152, true);
    this.spawn.x = x;
    // camión militar abandonado al sur del cruce
    this.addCar(x + 55, y + 330, false, { kind: 'truck', burnt: false });
    // sacos terreros (obstáculos bajos: las balas pasan por encima)
    const bags = (bx: number, by: number, w: number, h: number) => {
      if (!this.free(bx, by, w, h, 4)) return;
      this.addRect(bx, by, w, h, true);
      this.op(3, bx - 2, by - 2, w + 12, h + 12, 'spawnProps', { bx, by, w, h });
    };
    bags(x - 330, y - 100, 22, 88);
    bags(x + 308, y + 20, 22, 88);
    bags(x - 60, y - 330, 88, 22);
  }

  block(x: number, y: number, w: number, h: number, edge: boolean, nearSpawn: boolean) {
    this.op(0, x, y, w, h, 'block', { x, y, w, h });
    const ix = x + SIDEWALK;
    const iy = y + SIDEWALK;
    const iw = w - SIDEWALK * 2;
    const ih = h - SIDEWALK * 2;
    if (iw < 40 || ih < 40) return;
    if (edge) return this.wasteland(ix, iy, iw, ih);
    const r = this.rng();
    let type: 'building' | 'park' | 'parking' | 'plaza';
    if (nearSpawn) type = r < 0.5 ? 'plaza' : 'park';
    else type = r < 0.42 ? 'building' : r < 0.6 ? 'park' : r < 0.8 ? 'parking' : 'plaza';
    this[type](ix, iy, iw, ih);
  }

  wasteland(x: number, y: number, w: number, h: number) {
    const rng = this.rng;
    this.op(0, x, y, w, h, 'wasteland', { x, y, w, h });
    const n = Math.floor((w * h) / 9000);
    for (let i = 0; i < n; i++) {
      const px = rrange(rng, x + 20, x + w - 20);
      const py = rrange(rng, y + 20, y + h - 20);
      const roll = rng();
      if (roll < 0.25) this.addTree(px, py, rrange(rng, 28, 40), rng() < 0.6);
      else if (roll < 0.33) this.addBarrel(px, py, rng() < 0.35);
      else if (roll < 0.5) this.debris(px, py, rrange(rng, 14, 26));
    }
  }

  debris(x: number, y: number, s: number) {
    if (!this.free(x - s, y - s, s * 2, s * 2, 4)) return;
    this.addCircle(x, y, s * 0.8, false, true);
    const seed = this.nextSeed();
    this.op(3, x - s - 4, y - s - 4, s * 2 + 14, s * 2 + 14, 'debris', { seed, x, y, s });
  }

  building(x: number, y: number, w: number, h: number) {
    const rng = this.rng;
    const m = 10;
    this.op(0, x, y, w, h, 'building', { x, y, w, h });
    const rects: number[][] = [];
    if (rng() < 0.5) {
      const alley = 60;
      const horizSplit = w >= h;
      const total = horizSplit ? w : h;
      const a = Math.round((total - alley) * rrange(rng, 0.4, 0.6));
      if (horizSplit) {
        rects.push([x + m, y + m, a - m, h - 2 * m]);
        rects.push([x + a + alley, y + m, w - a - alley - m, h - 2 * m]);
        this.alley(x + a, y, alley, h, false);
      } else {
        rects.push([x + m, y + m, w - 2 * m, a - m]);
        rects.push([x + m, y + a + alley, w - 2 * m, h - a - alley - m]);
        this.alley(x, y + a, w, alley, true);
      }
    } else {
      rects.push([x + m, y + m, w - 2 * m, h - 2 * m]);
    }
    for (const [bx, by, bw, bh] of rects) this.roof(bx, by, bw, bh);
  }

  alley(x: number, y: number, w: number, h: number, horiz: boolean) {
    const rng = this.rng;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const n = 2;
    for (let i = 0; i < n; i++) {
      const t = rrange(rng, 0.25, 0.75);
      const dx = horiz ? x + w * t : cx + (rng() < 0.5 ? -16 : 16);
      const dy = horiz ? cy + (rng() < 0.5 ? -16 : 16) : y + h * t;
      const dw = horiz ? 46 : 24;
      const dh = horiz ? 24 : 46;
      if (!this.free(dx - dw / 2, dy - dh / 2, dw, dh, 30)) continue;
      this.addRect(dx - dw / 2, dy - dh / 2, dw, dh);
      const color = rpick(rng, ['#3e5a45', '#5a4a3a', '#3f4a5c']);
      this.op(3, dx - dw / 2, dy - dh / 2, dw + 10, dh + 10, 'alley', { dx, dw, dy, dh, color, horiz });
    }
  }

  roof(x: number, y: number, w: number, h: number) {
    this.addRect(x, y, w, h);
    const seed = this.nextSeed();
    const base = rpick(this.rng, ['#4d4a45', '#56514a', '#4a4f4c', '#5a4b44', '#46443f']);
    const sos = this.rng() < 0.15;
    const hole = this.rng() < 0.25;
    this.op(2, x, y, w + 14, h + 16, 'roof1', { x, y, w, h });
    this.op(3, x, y, w, h, 'roof2', { seed, base, x, y, w, h, hole, sos });
  }

  park(x: number, y: number, w: number, h: number) {
    const rng = this.rng;
    const seed = this.nextSeed();
    const diag = rng() < 0.5;
    this.op(0, x, y, w, h, 'park', { seed, x, y, w, h, diag });
    const n = 6 + ((rng() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const tx = rrange(rng, x + 40, x + w - 40);
      const ty = rrange(rng, y + 40, y + h - 40);
      const onPath = diag
        ? Math.abs(tx - x - (ty - y)) < 50 || Math.abs(tx - x - (h - (ty - y))) < 50
        : Math.abs(tx - (x + w / 2)) < 45 || Math.abs(ty - (y + h / 2)) < 45;
      if (onPath) continue;
      this.addTree(tx, ty, rrange(rng, 34, 50), rng() < 0.18);
    }
    if (rng() < 0.45) this.camp(x + w * rrange(rng, 0.3, 0.7), y + h * rrange(rng, 0.3, 0.7));
    for (let i = 0; i < 3; i++) {
      const bx = rrange(rng, x + 30, x + w - 70);
      const by = rrange(rng, y + 30, y + h - 30);
      this.bench(bx, by, rng() < 0.5);
    }
  }

  bench(x: number, y: number, vertical: boolean) {
    const w = vertical ? 14 : 42;
    const h = vertical ? 42 : 14;
    if (!this.free(x, y, w, h, 10)) return;
    this.addRect(x, y, w, h, true);
    this.op(3, x, y, w + 8, h + 8, 'bench', { x, y, w, h, vertical });
  }

  camp(x: number, y: number) {
    const rng = this.rng;
    if (!this.free(x - 70, y - 60, 140, 120, 6)) return;
    const tent = (tx: number, ty: number, color: string, ang: number) => {
      this.addRect(tx - 26, ty - 22, 52, 44);
      this.op(3, tx - 40, ty - 40, 84, 84, 'camp1', { tx, ty, ang, color });
    };
    tent(x - 40, y - 25, rpick(rng, ['#5c6a48', '#6a5a3e', '#4a5a6a']), rrange(rng, -0.1, 0.1));
    tent(x + 40, y - 20, rpick(rng, ['#7a4a3a', '#5c6a48']), rrange(rng, -0.1, 0.1));
    this.op(3, x - 20, y + 10, 40, 40, 'camp2', { x, y });
    this.addCircle(x, y + 30, 12, true, true);
    this.addLight(x, y + 30, 240, 1, 0.3);
    this.fires.push({ x, y: y + 30, s: 0.9 });
  }

  plaza(x: number, y: number, w: number, h: number) {
    const rng = this.rng;
    const seed = this.nextSeed();
    this.op(0, x, y, w, h, 'plaza1', { seed, x, y, w, h });
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (rng() < 0.6) {
      if (this.free(cx - 52, cy - 52, 104, 104, 4)) {
        this.addCircle(cx, cy, 48);
        this.op(3, cx - 60, cy - 60, 130, 130, 'plaza2', { cx, cy });
      }
    }
    const corners = [
      [x + 70, y + 70],
      [x + w - 70, y + 70],
      [x + 70, y + h - 70],
      [x + w - 70, y + h - 70],
    ];
    for (const [px, py] of corners) {
      if (rng() < 0.25 || !this.free(px - 34, py - 34, 68, 68, 6)) continue;
      this.addRect(px - 32, py - 32, 64, 64);
      this.op(2, px - 34, py - 34, 80, 80, 'plaza3', { px, py });
      const r = rrange(rng, 40, 52);
      const seed = this.nextSeed();
      const dead = rng() < 0.15;
      this.trees.push({ x: px, y: py, r, dead, seed, ang: rng() * TAU, size: r * 2.6 });
    }
    for (let i = 0; i < 4; i++)
      this.bench(rrange(rng, x + 30, x + w - 70), rrange(rng, y + 30, y + h - 40), rng() < 0.5);
    if (rng() < 0.5) this.addBarrel(rrange(rng, x + 40, x + w - 40), rrange(rng, y + 40, y + h - 40), rng() < 0.6);
  }

  parking(x: number, y: number, w: number, h: number) {
    const rng = this.rng;
    const horiz = w > h ? rng() < 0.7 : rng() < 0.3;
    this.op(0, x, y, w, h, 'parking', { x, y, w, h, horiz });
    const stall = 54;
    if (horiz) {
      for (let sx = x + 10; sx + stall <= x + w - 10; sx += stall) {
        if (rng() < 0.55) this.addCar(sx + stall / 2, y + 56, false, { pad: 4 });
        if (rng() < 0.55) this.addCar(sx + stall / 2, y + h - 56, false, { pad: 4 });
      }
    } else {
      for (let sy = y + 10; sy + stall <= y + h - 10; sy += stall) {
        if (rng() < 0.55) this.addCar(x + 56, sy + stall / 2, true, { pad: 4 });
        if (rng() < 0.55) this.addCar(x + w - 56, sy + stall / 2, true, { pad: 4 });
      }
    }
    if (rng() < 0.5) this.addBarrel(x + w / 2 + rrange(rng, -60, 60), y + h / 2 + rrange(rng, -60, 60), true);
    if (rng() < 0.4) this.addCar(x + w / 2, y + h / 2, rng() < 0.5, { burnt: true, burning: true });
  }

  roadSegment(c: number, a: number, b: number, vertical: boolean) {
    const rng = this.rng;
    const L = b - a;
    const R = (u0: number, v0: number, lu: number, lv: number): number[] =>
      vertical ? [c + v0, u0, lv, lu] : [u0, c + v0, lu, lv];
    const P = (u: number, v: number): number[] => (vertical ? [c + v, u] : [u, c + v]);
    const [bx, by, bw, bh] = R(a, -ROAD_HALF, L, ROAD_W);
    const seed = this.nextSeed();
    // marcas viales gastadas, grietas, baches
    this.op(1, bx, by, bw, bh, 'roadSegment1', { seed, bx, by, bw, bh, a, b, c, vertical });
    if (L < 120) return;
    // vehículos abandonados
    const cars = Math.floor(rrange(rng, 0, 2.6 + L / 400));
    for (let i = 0; i < cars; i++) {
      const lane = rpick(rng, [-55, 55]) + rrange(rng, -8, 8);
      const u = rrange(rng, a + 70, b - 70);
      const cross = rng() < 0.12;
      const kind = rng() < 0.06 && L > 400 ? 'bus' : undefined;
      const [px, py] = P(u, cross ? lane * 0.4 : lane);
      this.addCar(px, py, vertical ? cross : !cross, { kind });
    }
    // barrera de hormigón parcial (bloquea zombis, no balas)
    if (rng() < 0.22 && L > 300) {
      const u = rrange(rng, a + 80, b - 80);
      const fromLeft = rng() < 0.5;
      const pieces = 2 + ((rng() * 2) | 0);
      for (let k = 0; k < pieces; k++) {
        const v = fromLeft ? -ROAD_HALF + 4 + k * 48 : ROAD_HALF - 4 - (k + 1) * 48;
        const [rx, ry, rw, rh] = R(u, v, 16, 46);
        if (!this.free(rx, ry, rw, rh, 2)) continue;
        this.addRect(rx, ry, rw, rh, true);
        this.op(3, rx, ry, rw + 8, rh + 8, 'roadSegment2', { rx, ry, rw, rh });
      }
    }
    // farolas y mobiliario en las aceras
    for (const side of [-1, 1]) {
      const v = side * (ROAD_HALF + 16);
      for (let u = a + 70; u < b - 50; u += rrange(rng, 220, 300)) {
        const [lx, ly] = P(u, v);
        if (!this.free(lx - 6, ly - 6, 12, 12, 4)) continue;
        this.addCircle(lx, ly, 6, false, true);
        const lit = rng() < 0.35;
        const [hx, hy] = P(u, side * (ROAD_HALF - 18));
        this.overhead.push({ k: 'lamp', x: lx, y: ly, hx, hy, lit });
        if (lit) this.addLight(hx, hy, 190, 0.7, rng() < 0.3 ? 0.6 : 0.04);
      }
      if (rng() < 0.5) {
        const [tx, ty] = P(rrange(rng, a + 40, b - 40), side * (ROAD_HALF + 22));
        if (this.free(tx - 9, ty - 9, 18, 18, 4)) {
          this.addCircle(tx, ty, 9, false, true);
          const red = rng() < 0.4;
          this.op(3, tx - 12, ty - 12, 26, 26, 'roadSegment3', { tx, ty, red });
        }
      }
    }
  }

  intersection(cx: number, cy: number) {
    const seed = this.nextSeed();
    const S = this.size;
    this.op(1, cx - ROAD_HALF - 60, cy - ROAD_HALF - 60, ROAD_W + 120, ROAD_W + 120, 'intersection', {
      seed,
      cx,
      cy,
      S,
    });
    const corner = [cx - ROAD_HALF - 14, cy - ROAD_HALF - 14];
    if (this.free(corner[0] - 6, corner[1] - 6, 12, 12, 2)) {
      this.addCircle(corner[0], corner[1], 6, false, true);
      this.overhead.push({ k: 'signal', x: corner[0], y: corner[1], hx: corner[0] + 40, hy: corner[1] + 24 });
    }
  }

  /* ---------- índices ---------- */

  buildObstacleGrid() {
    const n = Math.ceil(this.size / OBS_CELL);
    this.obsN = n;
    this.obsGrid = Array.from({ length: n * n }, (): Obstacle[] => []);
    this.obstacles.forEach((o, idx) => {
      o.id = idx;
      o.stamp = 0;
      if (o.prop) return;
      const [x, y, w, h] = isRect(o)
        ? [o.x, o.y, o.w, o.h]
        : isCirc(o)
          ? [o.x - o.r, o.y - o.r, o.r * 2, o.r * 2]
          : [o.x, o.y, 0, 0];
      const x0 = clamp(Math.floor(x / OBS_CELL), 0, n - 1);
      const y0 = clamp(Math.floor(y / OBS_CELL), 0, n - 1);
      const x1 = clamp(Math.floor((x + w) / OBS_CELL), 0, n - 1);
      const y1 = clamp(Math.floor((y + h) / OBS_CELL), 0, n - 1);
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) this.obsGrid[j * n + i].push(o);
    });
    this.stamp = 0;
  }

  // Empuja un círculo fuera de los obstáculos. Modifica e.x / e.y.
  // passBlocks: el jugador atraviesa sus propias barricadas; los zombis no.
  // (ox, oy): dónde estaba al terminar el fotograma anterior. Si un empujón grande (la horda
  // apretando) le metió el centro en un muro o se lo hizo cruzar, vuelve al lado por el que
  // entró en vez de salir por el más cercano, que en un muro delgado puede ser el de enfrente.
  collide(e: Pt, r: number, passBlocks = false, ox = NaN, oy = NaN) {
    const n = this.obsN;
    const swept = ox === ox && oy === oy;
    const x0 = clamp(Math.floor(((swept ? Math.min(e.x, ox) : e.x) - r) / OBS_CELL), 0, n - 1);
    const y0 = clamp(Math.floor(((swept ? Math.min(e.y, oy) : e.y) - r) / OBS_CELL), 0, n - 1);
    const x1 = clamp(Math.floor(((swept ? Math.max(e.x, ox) : e.x) + r) / OBS_CELL), 0, n - 1);
    const y1 = clamp(Math.floor(((swept ? Math.max(e.y, oy) : e.y) + r) / OBS_CELL), 0, n - 1);
    const stamp = ++this.stamp;
    let hit = false;
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const cell = this.obsGrid[j * n + i];
        for (let k = 0; k < cell.length; k++) {
          const o = cell[k];
          if (o.stamp === stamp) continue;
          o.stamp = stamp;
          if (passBlocks && o.block) continue;
          if (isRect(o)) {
            const face = swept ? entryFace(ox, oy, e.x, e.y, o) : -1;
            if (face >= 0) {
              // vuelve a donde tocó la cara, apoyado por fuera
              const tx = ox + (e.x - ox) * entryT;
              const ty = oy + (e.y - oy) * entryT;
              e.x = face === 0 ? o.x - r : face === 1 ? o.x + o.w + r : tx;
              e.y = face === 2 ? o.y - r : face === 3 ? o.y + o.h + r : ty;
              hit = true;
              if (o.block) this.lastBlock = o as Block;
              continue;
            }
            const px = e.x < o.x ? o.x : e.x > o.x + o.w ? o.x + o.w : e.x;
            const py = e.y < o.y ? o.y : e.y > o.y + o.h ? o.y + o.h : e.y;
            const dx = e.x - px;
            const dy = e.y - py;
            const d2 = dx * dx + dy * dy;
            if (d2 >= r * r) continue;
            hit = true;
            if (o.block) this.lastBlock = o as Block;
            if (d2 > 1e-6) {
              const d = Math.sqrt(d2);
              e.x += (dx / d) * (r - d);
              e.y += (dy / d) * (r - d);
            } else {
              const l = e.x - o.x;
              const rr = o.x + o.w - e.x;
              const t = e.y - o.y;
              const b = o.y + o.h - e.y;
              const m = Math.min(l, rr, t, b);
              if (m === l) e.x = o.x - r;
              else if (m === rr) e.x = o.x + o.w + r;
              else if (m === t) e.y = o.y - r;
              else e.y = o.y + o.h + r;
            }
          } else if (isCirc(o)) {
            const dx = e.x - o.x;
            const dy = e.y - o.y;
            const rr = r + o.r;
            const d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr) continue;
            hit = true;
            const d = Math.sqrt(d2) || 0.001;
            e.x = o.x + (dx / d) * rr;
            e.y = o.y + (dy / d) * rr;
          }
        }
      }
    }
    return hit;
  }

  /* ---------- barricadas del jugador ---------- */

  addDynamic(o: RectObs) {
    const n = this.obsN;
    o.stamp = 0;
    o.cells = [];
    const x0 = clamp(Math.floor(o.x / OBS_CELL), 0, n - 1);
    const y0 = clamp(Math.floor(o.y / OBS_CELL), 0, n - 1);
    const x1 = clamp(Math.floor((o.x + o.w) / OBS_CELL), 0, n - 1);
    const y1 = clamp(Math.floor((o.y + o.h) / OBS_CELL), 0, n - 1);
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        this.obsGrid[j * n + i].push(o);
        o.cells.push(j * n + i);
      }
    }
    this.refreshNav(o.x, o.y, o.w, o.h);
  }

  removeDynamic(o: RectObs) {
    for (const idx of o.cells ?? []) {
      const arr = this.obsGrid[idx];
      const i = arr.indexOf(o);
      if (i >= 0) arr.splice(i, 1);
    }
    o.cells = [];
    this.refreshNav(o.x, o.y, o.w, o.h);
  }

  refreshNav(x: number, y: number, w: number, h: number) {
    const n = this.navN;
    const pad = 24;
    const i0 = clamp(Math.floor((x - pad) / NAV_CELL), 0, n - 1);
    const j0 = clamp(Math.floor((y - pad) / NAV_CELL), 0, n - 1);
    const i1 = clamp(Math.floor((x + w + pad) / NAV_CELL), 0, n - 1);
    const j1 = clamp(Math.floor((y + h + pad) / NAV_CELL), 0, n - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const blocked = this.pointBlocked(i * NAV_CELL + NAV_CELL / 2, j * NAV_CELL + NAV_CELL / 2, 12);
        this.blocked[j * n + i] = blocked ? 1 : 0;
      }
    }
    this.flowCell = -1;
  }

  // ¿Cabe un rectángulo sin tocar ningún obstáculo? (ignoreBlocks: las barricadas del jugador no cuentan)
  rectFree(x: number, y: number, w: number, h: number, ignoreBlocks = false) {
    if (x < 30 || y < 30 || x + w > this.size - 30 || y + h > this.size - 30) return false;
    const n = this.obsN;
    const x0 = clamp(Math.floor(x / OBS_CELL), 0, n - 1);
    const y0 = clamp(Math.floor(y / OBS_CELL), 0, n - 1);
    const x1 = clamp(Math.floor((x + w) / OBS_CELL), 0, n - 1);
    const y1 = clamp(Math.floor((y + h) / OBS_CELL), 0, n - 1);
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        for (const o of this.obsGrid[j * n + i]) {
          if (ignoreBlocks && o.block) continue;
          if (isRect(o)) {
            if (x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y) return false;
          } else if (isCirc(o)) {
            const px = clamp(o.x, x, x + w);
            const py = clamp(o.y, y, y + h);
            if ((px - o.x) ** 2 + (py - o.y) ** 2 < o.r * o.r) return false;
          }
        }
      }
    }
    return true;
  }

  pointBlocked(x: number, y: number, pad = 0, bulletsOnly = false): Obstacle | boolean | null {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return true;
    const n = this.obsN;
    const cx = Math.floor(x / OBS_CELL);
    const cy = Math.floor(y / OBS_CELL);
    const r = Math.ceil(pad / OBS_CELL);
    for (let j = cy - r; j <= cy + r; j++) {
      if (j < 0 || j >= n) continue;
      for (let i = cx - r; i <= cx + r; i++) {
        if (i < 0 || i >= n) continue;
        for (const o of this.obsGrid[j * n + i]) {
          if (bulletsOnly && o.low) continue;
          if (isRect(o)) {
            if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) return o;
          } else if (isCirc(o)) {
            const dx = x - o.x;
            const dy = y - o.y;
            const rr = o.r + pad;
            if (dx * dx + dy * dy < rr * rr) return o;
          }
        }
      }
    }
    return null;
  }

  /* ---------- navegación ---------- */

  buildNav() {
    const n = Math.ceil(this.size / NAV_CELL);
    this.navN = n;
    this.blocked = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = i * NAV_CELL + NAV_CELL / 2;
        const y = j * NAV_CELL + NAV_CELL / 2;
        if (this.pointBlocked(x, y, 12)) this.blocked[j * n + i] = 1;
      }
    }
    this.queue = new Int32Array(n * n);
    // campo principal (rutas hacia el jugador) y 8 campos de flanqueo hacia puntos
    // alrededor del jugador, para que algunos zombis lo rodeen por los lados o por detrás
    this.main = { dist: new Uint16Array(n * n).fill(65535), cell: -1, ok: false };
    this.dist = this.main.dist;
    this.anchors = Array.from({ length: 8 }, (_, k) => ({
      dist: new Uint16Array(n * n).fill(65535),
      cell: -1,
      ok: false,
      k,
      x: 0,
      y: 0,
    }));
    this.anchorTurn = 0;
  }

  set flowCell(v: number) {
    // al cambiar barricadas se fuerza el recálculo de todos los campos
    if (v === -1 && this.main) {
      this.main.cell = -1;
      for (const a of this.anchors) a.cell = -1;
    }
  }

  // Celda libre más cercana a (px, py), o -1.
  freeCell(px: number, py: number): number {
    const n = this.navN;
    const ci = clamp(Math.floor(px / NAV_CELL), 0, n - 1);
    const cj = clamp(Math.floor(py / NAV_CELL), 0, n - 1);
    if (!this.blocked[cj * n + ci]) return cj * n + ci;
    for (let r = 1; r < 4; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          if (!this.blocked[j * n + i]) return j * n + i;
        }
      }
    }
    return -1;
  }

  // BFS desde la celda objetivo: dist[c] = pasos hasta el objetivo rodeando obstáculos.
  computeField(field: FlowField, px: number, py: number) {
    const start = this.freeCell(px, py);
    if (start < 0) {
      field.ok = false;
      return;
    }
    if (start === field.cell) return;
    field.cell = start;
    field.ok = true;
    const n = this.navN;
    const dist = field.dist;
    const blocked = this.blocked;
    const q = this.queue;
    dist.fill(65535);
    let head = 0;
    let tail = 0;
    dist[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const c = q[head++];
      const ci2 = c % n;
      const cj2 = (c / n) | 0;
      const d = dist[c] + 1;
      for (let k = 0; k < 4; k++) {
        const i = ci2 + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const j = cj2 + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const nc = j * n + i;
        if (blocked[nc] || dist[nc] <= d) continue;
        dist[nc] = d;
        q[tail++] = nc;
      }
    }
  }

  updateFlow(px: number, py: number) {
    this.computeField(this.main, px, py);
  }

  // Recalcula UN campo de flanqueo por llamada (repartido entre fotogramas).
  updateAnchors(px: number, py: number, radius = 230) {
    const a = this.anchors[this.anchorTurn];
    this.anchorTurn = (this.anchorTurn + 1) % this.anchors.length;
    const ang = (a.k / this.anchors.length) * TAU;
    a.x = px + Math.cos(ang) * radius;
    a.y = py + Math.sin(ang) * radius;
    if (a.x < 60 || a.y < 60 || a.x > this.size - 60 || a.y > this.size - 60) {
      a.ok = false;
      a.cell = -1;
      return;
    }
    this.computeField(a, a.x, a.y);
    // un punto de flanqueo sin conexión con el jugador no sirve
    if (a.ok && this.main.ok && this.main.dist[a.cell] === 65535) a.ok = false;
  }

  // Dirección por el campo indicado (por defecto, hacia el jugador) o null si no hay ruta.
  flowDir(x: number, y: number, out: Pt, field: FlowField = this.main): Pt | null {
    const n = this.navN;
    const ci = clamp(Math.floor(x / NAV_CELL), 0, n - 1);
    const cj = clamp(Math.floor(y / NAV_CELL), 0, n - 1);
    const dist = field.dist;
    const here = dist[cj * n + ci];
    let best = here;
    let bi = -1;
    let bj = -1;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const v = dist[j * n + i];
        // las diagonales sólo valen si no cortan una esquina bloqueada
        if (di && dj && (this.blocked[cj * n + i] || this.blocked[j * n + ci])) continue;
        if (v < best) {
          best = v;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0 && here === 65535) {
      // en una celda sin ruta (pegado a un muro o en un rincón): ir a la celda con ruta más cercana
      for (let r = 2; r <= 3 && bi < 0; r++) {
        for (let dj = -r; dj <= r; dj++) {
          for (let di = -r; di <= r; di++) {
            if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
            const i = ci + di;
            const j = cj + dj;
            if (i < 0 || j < 0 || i >= n || j >= n) continue;
            const v = dist[j * n + i];
            if (v < best) {
              best = v;
              bi = i;
              bj = j;
            }
          }
        }
      }
    }
    if (bi < 0) return null;
    const tx = bi * NAV_CELL + NAV_CELL / 2 - x;
    const ty = bj * NAV_CELL + NAV_CELL / 2 - y;
    const d = Math.hypot(tx, ty) || 1;
    out.x = tx / d;
    out.y = ty / d;
    return out;
  }

  reachable(x: number, y: number, field: FlowField = this.main): boolean {
    const n = this.navN;
    const ci = clamp(Math.floor(x / NAV_CELL), 0, n - 1);
    const cj = clamp(Math.floor(y / NAV_CELL), 0, n - 1);
    return field.ok && field.dist[cj * n + ci] < 65535;
  }
}

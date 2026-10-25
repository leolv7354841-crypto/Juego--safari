// Ciudad en ruinas generada por semilla. Incluye:
// - obstáculos (rectángulos y círculos) con rejilla espacial
// - campo de flujo (BFS) para que los zombis rodeen edificios y coches
// - suelo pre-renderizado en trozos con caché LRU
import { WORLD_SIZE, CHUNK, ROAD_CENTERS, ROAD_HALF, SIDEWALK, NAV_CELL } from '../core/config.js';
import { mulberry32, rrange, rpick, makeCanvas, roundRect, clamp, TAU, shade } from '../core/util.js';
import { pat, drawCar, makeTree, CAR_COLORS, OUT } from '../render/sprites.js';

const OBS_CELL = 128;
const ROAD_W = ROAD_HALF * 2;
const SPAWN_CLEAR = 215;

export class World {
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
    this.indexOps();
    this.buildObstacleGrid();
    this.buildNav();
    this.chunkCache = new Map();
    this.chunkPool = [];
    this.chunkScale = 1.25;
    this.maxChunks = 30;
  }

  nextSeed() {
    return (this.rng() * 1e9) | 0;
  }

  /* ---------- utilidades de generación ---------- */

  op(layer, x, y, w, h, draw) {
    this.ops.push({ layer, x, y, w, h, draw, i: this.ops.length });
  }

  addRect(x, y, w, h, low = false) {
    const o = { k: 0, x, y, w, h, low };
    this.obstacles.push(o);
    return o;
  }

  // prop: objeto pequeño (farola, barril, bote…) que ocupa su sitio al generar el mapa pero no choca
  addCircle(x, y, r, low = false, prop = false) {
    const o = { k: 1, x, y, r, low, prop };
    this.obstacles.push(o);
    return o;
  }

  free(x, y, w, h, pad = 8) {
    if (x < 30 || y < 30 || x + w > this.size - 30 || y + h > this.size - 30) return false;
    const sx = this.spawn.x;
    const sy = this.spawn.y;
    const cx = clamp(sx, x, x + w);
    const cy = clamp(sy, y, y + h);
    if ((sx - cx) ** 2 + (sy - cy) ** 2 < SPAWN_CLEAR * SPAWN_CLEAR) return false;
    for (const o of this.obstacles) {
      let ox, oy, ow, oh;
      if (o.k === 0) {
        ox = o.x;
        oy = o.y;
        ow = o.w;
        oh = o.h;
      } else {
        ox = o.x - o.r;
        oy = o.y - o.r;
        ow = oh = o.r * 2;
      }
      if (x < ox + ow + pad && x + w + pad > ox && y < oy + oh + pad && y + h + pad > oy) return false;
    }
    return true;
  }

  addLight(x, y, r, intensity, flicker = 0, warm = true) {
    this.lights.push({ x, y, r, i: intensity, flicker, warm, ph: this.rng() * 100 });
  }

  addTree(x, y, r, dead = false) {
    if (!this.free(x - 12, y - 12, 24, 24, 6)) return false;
    this.addCircle(x, y, 11);
    const img = makeTree(this.nextSeed(), r, dead);
    this.trees.push({ x, y, r, img, ang: this.rng() * TAU, size: r * 2.6 });
    this.op(2, x - r, y - r, r * 2 + 14, r * 2 + 14, (g) => {
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath();
      g.ellipse(x + 10, y + 12, r * 0.95, r * 0.85, 0, 0, TAU);
      g.fill();
    });
    return true;
  }

  addBarrel(x, y, burning) {
    if (!this.free(x - 13, y - 13, 26, 26, 4)) return false;
    this.addCircle(x, y, 12, false, true);
    this.op(3, x - 16, y - 16, 34, 34, (g) => {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.arc(x + 4, y + 5, 13, 0, TAU);
      g.fill();
      g.fillStyle = '#5a3a2a';
      g.beginPath();
      g.arc(x, y, 12, 0, TAU);
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = OUT;
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.arc(x, y, 8, 0, TAU);
      g.stroke();
      g.fillStyle = burning ? '#1d1410' : '#3b2a20';
      g.beginPath();
      g.arc(x, y, 7, 0, TAU);
      g.fill();
    });
    if (burning) {
      this.addLight(x, y, 230, 0.95, 0.25);
      this.fires.push({ x, y, s: 1 });
    }
    return true;
  }

  addCar(x, y, horizontal, opts = {}) {
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
    this.op(3, rx - 4, ry - 4, w + 16, h + 16, (g) => drawCar(g, x, y, ang, len, wid, { kind, burnt, color, seed }));
    if (burnt && (opts.burning ?? rng() < 0.3)) {
      this.addLight(x, y, 260, 0.9, 0.3);
      this.fires.push({ x, y, s: 1.6 });
    }
    return true;
  }

  /* ---------- generación ---------- */

  generate() {
    const S = this.size;
    this.op(0, 0, 0, S, S, (g) => {
      g.fillStyle = pat(g, 'rubble');
      g.fillRect(0, 0, S, S);
    });
    for (const c of ROAD_CENTERS) {
      this.op(0, c - ROAD_HALF, 0, ROAD_W, S, (g) => {
        g.fillStyle = pat(g, 'asphalt');
        g.fillRect(c - ROAD_HALF, 0, ROAD_W, S);
      });
      this.op(0, 0, c - ROAD_HALF, S, ROAD_W, (g) => {
        g.fillStyle = pat(g, 'asphalt');
        g.fillRect(0, c - ROAD_HALF, S, ROAD_W);
      });
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
    const wall = (x, y, w, h) =>
      this.op(3, x, y, w + 12, h + 12, (g) => {
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(x + 6, y + 8, w, h);
        g.fillStyle = '#5b5852';
        g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x, y, w, 4);
        g.strokeStyle = OUT;
        g.lineWidth = 2;
        g.strokeRect(x + 1, y + 1, w - 2, h - 2);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        const horiz = w > h;
        const n = Math.floor((horiz ? w : h) / 80);
        for (let i = 1; i < n; i++) {
          if (horiz) g.fillRect(x + i * 80, y, 3, h);
          else g.fillRect(x, y + i * 80, w, 3);
        }
      });
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
    const bags = (bx, by, w, h) => {
      if (!this.free(bx, by, w, h, 4)) return;
      this.addRect(bx, by, w, h, true);
      this.op(3, bx - 2, by - 2, w + 12, h + 12, (g) => {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(bx + 4, by + 5, w, h);
        const horiz = w > h;
        const n = Math.round((horiz ? w : h) / 22);
        for (let i = 0; i < n; i++) {
          const cx = horiz ? bx + 11 + i * 22 : bx + w / 2;
          const cy = horiz ? by + h / 2 : by + 11 + i * 22;
          g.fillStyle = i % 2 ? '#8a7d5c' : '#7f7354';
          g.beginPath();
          g.ellipse(cx, cy, horiz ? 11.5 : w / 2, horiz ? h / 2 : 11.5, 0, 0, TAU);
          g.fill();
          g.strokeStyle = OUT;
          g.lineWidth = 1.4;
          g.stroke();
        }
      });
    };
    bags(x - 330, y - 100, 22, 88);
    bags(x + 308, y + 20, 22, 88);
    bags(x - 60, y - 330, 88, 22);
  }

  block(x, y, w, h, edge, nearSpawn) {
    this.op(0, x, y, w, h, (g) => {
      g.fillStyle = pat(g, 'sidewalk');
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(18,18,16,0.6)';
      g.lineWidth = 4;
      g.strokeRect(x + 2, y + 2, w - 4, h - 4);
      g.strokeStyle = 'rgba(200,195,180,0.18)';
      g.lineWidth = 2;
      g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    });
    const ix = x + SIDEWALK;
    const iy = y + SIDEWALK;
    const iw = w - SIDEWALK * 2;
    const ih = h - SIDEWALK * 2;
    if (iw < 40 || ih < 40) return;
    if (edge) return this.wasteland(ix, iy, iw, ih);
    const r = this.rng();
    let type;
    if (nearSpawn) type = r < 0.5 ? 'plaza' : 'park';
    else type = r < 0.42 ? 'building' : r < 0.6 ? 'park' : r < 0.8 ? 'parking' : 'plaza';
    this[type](ix, iy, iw, ih);
  }

  wasteland(x, y, w, h) {
    const rng = this.rng;
    this.op(0, x, y, w, h, (g) => {
      g.fillStyle = pat(g, 'rubble');
      g.fillRect(x, y, w, h);
    });
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

  debris(x, y, s) {
    if (!this.free(x - s, y - s, s * 2, s * 2, 4)) return;
    this.addCircle(x, y, s * 0.8, false, true);
    const seed = this.nextSeed();
    this.op(3, x - s - 4, y - s - 4, s * 2 + 14, s * 2 + 14, (g) => {
      const rng = mulberry32(seed);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.arc(x + 5, y + 6, s, 0, TAU);
      g.fill();
      for (let i = 0; i < 7; i++) {
        const a = rng() * TAU;
        const d = rng() * s * 0.6;
        g.save();
        g.translate(x + Math.cos(a) * d, y + Math.sin(a) * d);
        g.rotate(rng() * TAU);
        g.fillStyle = rpick(rng, ['#6f6a60', '#5e5950', '#7b7468', '#544e45']);
        const ww = rrange(rng, s * 0.4, s * 0.9);
        const hh = rrange(rng, s * 0.25, s * 0.55);
        g.fillRect(-ww / 2, -hh / 2, ww, hh);
        g.strokeStyle = OUT;
        g.lineWidth = 1.2;
        g.strokeRect(-ww / 2, -hh / 2, ww, hh);
        g.restore();
      }
      g.strokeStyle = '#6b4d35';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - s * 0.7, y - s * 0.2);
      g.lineTo(x + s * 0.6, y + s * 0.4);
      g.stroke();
    });
  }

  building(x, y, w, h) {
    const rng = this.rng;
    const m = 10;
    this.op(0, x, y, w, h, (g) => {
      g.fillStyle = pat(g, 'concrete');
      g.fillRect(x, y, w, h);
    });
    const rects = [];
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

  alley(x, y, w, h, horiz) {
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
      this.op(3, dx - dw / 2, dy - dh / 2, dw + 10, dh + 10, (g) => {
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(dx - dw / 2 + 5, dy - dh / 2 + 6, dw, dh);
        g.fillStyle = color;
        g.fillRect(dx - dw / 2, dy - dh / 2, dw, dh);
        g.strokeStyle = OUT;
        g.lineWidth = 2;
        g.strokeRect(dx - dw / 2, dy - dh / 2, dw, dh);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        if (horiz) g.fillRect(dx - 1, dy - dh / 2, 2, dh);
        else g.fillRect(dx - dw / 2, dy - 1, dw, 2);
      });
    }
  }

  roof(x, y, w, h) {
    this.addRect(x, y, w, h);
    const seed = this.nextSeed();
    const base = rpick(this.rng, ['#4d4a45', '#56514a', '#4a4f4c', '#5a4b44', '#46443f']);
    const sos = this.rng() < 0.15;
    const hole = this.rng() < 0.25;
    this.op(2, x, y, w + 14, h + 16, (g) => {
      g.fillStyle = 'rgba(0,0,0,0.42)';
      g.fillRect(x + 12, y + 14, w, h);
    });
    this.op(3, x, y, w, h, (g) => {
      const rng = mulberry32(seed);
      g.fillStyle = base;
      g.fillRect(x, y, w, h);
      g.globalAlpha = 0.55;
      g.fillStyle = pat(g, 'gravel');
      g.fillRect(x, y, w, h);
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(0,0,0,0.22)';
      g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        if (rng() < 0.5) {
          const yy = y + rrange(rng, 20, h - 20);
          g.moveTo(x + 12, yy);
          g.lineTo(x + w - 12, yy + rrange(rng, -4, 4));
        } else {
          const xx = x + rrange(rng, 20, w - 20);
          g.moveTo(xx, y + 12);
          g.lineTo(xx + rrange(rng, -4, 4), y + h - 12);
        }
        g.stroke();
      }
      for (let i = 0; i < 3; i++) {
        g.fillStyle = 'rgba(30,40,50,0.35)';
        g.beginPath();
        g.ellipse(
          x + rrange(rng, 30, w - 30),
          y + rrange(rng, 30, h - 30),
          rrange(rng, 10, 28),
          rrange(rng, 6, 16),
          rng() * TAU,
          0,
          TAU,
        );
        g.fill();
      }
      const placed = [];
      const place = (pw, ph) => {
        for (let t = 0; t < 12; t++) {
          const px = x + rrange(rng, 22, w - 22 - pw);
          const py = y + rrange(rng, 22, h - 22 - ph);
          if (
            placed.every(
              ([ax, ay, aw, ah]) => px > ax + aw + 8 || px + pw + 8 < ax || py > ay + ah + 8 || py + ph + 8 < ay,
            )
          ) {
            placed.push([px, py, pw, ph]);
            return [px, py];
          }
        }
        return null;
      };
      if (hole) {
        const hp = place(70, 60);
        if (hp) {
          const [hx, hy] = hp;
          g.fillStyle = '#121110';
          g.beginPath();
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * TAU;
            const d = rrange(rng, 22, 32);
            g.lineTo(hx + 35 + Math.cos(a) * d, hy + 30 + Math.sin(a) * d * 0.85);
          }
          g.closePath();
          g.fill();
          g.strokeStyle = '#6b5a45';
          g.lineWidth = 3;
          for (let i = 0; i < 3; i++) {
            g.beginPath();
            g.moveTo(hx + rrange(rng, 5, 65), hy + 5);
            g.lineTo(hx + rrange(rng, 5, 65), hy + 55);
            g.stroke();
          }
        }
      }
      const acs = 2 + ((rng() * 3) | 0);
      for (let i = 0; i < acs; i++) {
        const p = place(34, 26);
        if (!p) continue;
        const [ax, ay] = p;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(ax + 4, ay + 5, 34, 26);
        g.fillStyle = '#8a8a84';
        g.fillRect(ax, ay, 34, 26);
        g.strokeStyle = OUT;
        g.lineWidth = 1.5;
        g.strokeRect(ax, ay, 34, 26);
        g.fillStyle = '#4b4c4a';
        g.beginPath();
        g.arc(ax + 22, ay + 13, 9, 0, TAU);
        g.fill();
        g.strokeStyle = '#6c6d69';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(ax + 13, ay + 13);
        g.lineTo(ax + 31, ay + 13);
        g.moveTo(ax + 22, ay + 4);
        g.lineTo(ax + 22, ay + 22);
        g.stroke();
      }
      if (rng() < 0.6) {
        const p = place(40, 40);
        if (p) {
          const [sx, sy] = p;
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(sx + 4, sy + 5, 40, 40);
          g.fillStyle = '#3a4650';
          g.fillRect(sx, sy, 40, 40);
          g.strokeStyle = '#7d7f7b';
          g.lineWidth = 3;
          g.strokeRect(sx, sy, 40, 40);
          g.beginPath();
          g.moveTo(sx + 20, sy);
          g.lineTo(sx + 20, sy + 40);
          g.stroke();
          g.fillStyle = 'rgba(200,220,230,0.15)';
          g.fillRect(sx + 3, sy + 3, 14, 34);
        }
      }
      if (rng() < 0.5) {
        const p = place(44, 44);
        if (p) {
          const [tx, ty] = p;
          g.fillStyle = 'rgba(0,0,0,0.4)';
          g.beginPath();
          g.arc(tx + 28, ty + 28, 22, 0, TAU);
          g.fill();
          g.fillStyle = '#6a5440';
          g.beginPath();
          g.arc(tx + 22, ty + 22, 21, 0, TAU);
          g.fill();
          g.strokeStyle = OUT;
          g.lineWidth = 2;
          g.stroke();
          g.strokeStyle = 'rgba(0,0,0,0.3)';
          g.beginPath();
          g.arc(tx + 22, ty + 22, 14, 0, TAU);
          g.stroke();
        }
      }
      for (let i = 0; i < 4; i++) {
        const p = place(10, 10);
        if (!p) continue;
        g.fillStyle = '#6e6e6a';
        g.beginPath();
        g.arc(p[0] + 5, p[1] + 5, 5, 0, TAU);
        g.fill();
        g.strokeStyle = OUT;
        g.lineWidth = 1;
        g.stroke();
      }
      if (sos && w > 160 && h > 110) {
        g.save();
        g.translate(x + w / 2, y + h / 2);
        if (h > w) g.rotate(Math.PI / 2);
        g.fillStyle = 'rgba(220,214,196,0.55)';
        g.font = `700 ${Math.min(70, Math.max(w, h) / 4)}px "Teko", "Arial Narrow", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('SOS', 0, 0);
        g.restore();
      }
      g.strokeStyle = shade(base, 1.4);
      g.lineWidth = 8;
      g.strokeRect(x + 4, y + 4, w - 8, h - 8);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 3;
      g.strokeRect(x + 9.5, y + 9.5, w - 19, h - 19);
      g.strokeStyle = OUT;
      g.lineWidth = 2;
      g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    });
  }

  park(x, y, w, h) {
    const rng = this.rng;
    const seed = this.nextSeed();
    const diag = rng() < 0.5;
    this.op(0, x, y, w, h, (g) => {
      const r = mulberry32(seed);
      g.fillStyle = pat(g, 'grass');
      g.fillRect(x, y, w, h);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = 'rgba(93,80,64,0.45)';
        g.beginPath();
        g.ellipse(x + r() * w, y + r() * h, rrange(r, 14, 40), rrange(r, 10, 26), r() * TAU, 0, TAU);
        g.fill();
      }
      g.save();
      g.beginPath();
      g.rect(x, y, w, h);
      g.clip();
      g.strokeStyle = pat(g, 'dirt');
      g.lineWidth = 30;
      g.lineCap = 'butt';
      g.beginPath();
      if (diag) {
        g.moveTo(x, y);
        g.lineTo(x + w, y + h);
        g.moveTo(x + w, y);
        g.lineTo(x, y + h);
      } else {
        g.moveTo(x + w / 2, y);
        g.lineTo(x + w / 2, y + h);
        g.moveTo(x, y + h / 2);
        g.lineTo(x + w, y + h / 2);
      }
      g.stroke();
      g.restore();
      for (let i = 0; i < 60; i++) {
        g.fillStyle = rpick(r, ['#7a5a32', '#8a6a3a', '#5e4a2a', '#6b6a3a']);
        g.fillRect(x + r() * w, y + r() * h, 3, 2);
      }
    });
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

  bench(x, y, vertical) {
    const w = vertical ? 14 : 42;
    const h = vertical ? 42 : 14;
    if (!this.free(x, y, w, h, 10)) return;
    this.addRect(x, y, w, h, true);
    this.op(3, x, y, w + 8, h + 8, (g) => {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + 4, y + 5, w, h);
      g.fillStyle = '#6b4f36';
      g.fillRect(x, y, w, h);
      g.strokeStyle = OUT;
      g.lineWidth = 1.5;
      g.strokeRect(x, y, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        g.beginPath();
        if (vertical) {
          g.moveTo(x + (w * i) / 3, y);
          g.lineTo(x + (w * i) / 3, y + h);
        } else {
          g.moveTo(x, y + (h * i) / 3);
          g.lineTo(x + w, y + (h * i) / 3);
        }
        g.stroke();
      }
    });
  }

  camp(x, y) {
    const rng = this.rng;
    if (!this.free(x - 70, y - 60, 140, 120, 6)) return;
    const tent = (tx, ty, color, ang) => {
      this.addRect(tx - 26, ty - 22, 52, 44);
      this.op(3, tx - 40, ty - 40, 84, 84, (g) => {
        g.save();
        g.translate(tx, ty);
        g.rotate(ang);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(-22, -18, 50, 42);
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(-26, -20);
        g.lineTo(26, -20);
        g.lineTo(26, 20);
        g.lineTo(-26, 20);
        g.closePath();
        g.fill();
        g.strokeStyle = OUT;
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = shade(color, 0.75);
        g.fillRect(-26, 0, 52, 20);
        g.strokeStyle = 'rgba(0,0,0,0.4)';
        g.beginPath();
        g.moveTo(-26, 0);
        g.lineTo(26, 0);
        g.stroke();
        g.restore();
      });
    };
    tent(x - 40, y - 25, rpick(rng, ['#5c6a48', '#6a5a3e', '#4a5a6a']), rrange(rng, -0.1, 0.1));
    tent(x + 40, y - 20, rpick(rng, ['#7a4a3a', '#5c6a48']), rrange(rng, -0.1, 0.1));
    this.op(3, x - 20, y + 10, 40, 40, (g) => {
      g.fillStyle = '#2a2420';
      g.beginPath();
      g.arc(x, y + 30, 13, 0, TAU);
      g.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        g.fillStyle = '#6a655b';
        g.beginPath();
        g.arc(x + Math.cos(a) * 14, y + 30 + Math.sin(a) * 14, 4, 0, TAU);
        g.fill();
      }
    });
    this.addCircle(x, y + 30, 12, true, true);
    this.addLight(x, y + 30, 240, 1, 0.3);
    this.fires.push({ x, y: y + 30, s: 0.9 });
  }

  plaza(x, y, w, h) {
    const rng = this.rng;
    const seed = this.nextSeed();
    this.op(0, x, y, w, h, (g) => {
      const r = mulberry32(seed);
      g.fillStyle = pat(g, 'brick');
      g.fillRect(x, y, w, h);
      g.strokeStyle = '#8f8a7e';
      g.lineWidth = 10;
      g.strokeRect(x + 5, y + 5, w - 10, h - 10);
      for (let i = 0; i < 10; i++) {
        g.fillStyle = 'rgba(25,20,18,0.25)';
        g.beginPath();
        g.ellipse(x + r() * w, y + r() * h, rrange(r, 8, 30), rrange(r, 6, 18), r() * TAU, 0, TAU);
        g.fill();
      }
      for (let i = 0; i < 18; i++) {
        g.save();
        g.translate(x + r() * w, y + r() * h);
        g.rotate(r() * TAU);
        g.fillStyle = 'rgba(210,205,190,0.55)';
        g.fillRect(-5, -3.5, 10, 7);
        g.restore();
      }
    });
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (rng() < 0.6) {
      if (this.free(cx - 52, cy - 52, 104, 104, 4)) {
        this.addCircle(cx, cy, 48);
        this.op(3, cx - 60, cy - 60, 130, 130, (g) => {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.beginPath();
          g.arc(cx + 8, cy + 10, 50, 0, TAU);
          g.fill();
          g.fillStyle = '#8e897d';
          g.beginPath();
          g.arc(cx, cy, 50, 0, TAU);
          g.fill();
          g.strokeStyle = OUT;
          g.lineWidth = 2;
          g.stroke();
          g.fillStyle = '#3e423a';
          g.beginPath();
          g.arc(cx, cy, 40, 0, TAU);
          g.fill();
          g.fillStyle = 'rgba(60,70,50,0.7)';
          g.beginPath();
          g.arc(cx - 8, cy + 6, 22, 0, TAU);
          g.fill();
          g.fillStyle = '#8e897d';
          g.beginPath();
          g.arc(cx, cy, 10, 0, TAU);
          g.fill();
          g.strokeStyle = OUT;
          g.stroke();
          g.strokeStyle = 'rgba(0,0,0,0.5)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(cx + 30, cy - 34);
          g.lineTo(cx + 42, cy - 18);
          g.lineTo(cx + 48, cy - 20);
          g.stroke();
        });
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
      this.op(2, px - 34, py - 34, 80, 80, (g) => {
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(px - 26, py - 24, 64, 64);
        g.fillStyle = '#8a857a';
        g.fillRect(px - 32, py - 32, 64, 64);
        g.strokeStyle = OUT;
        g.lineWidth = 2;
        g.strokeRect(px - 32, py - 32, 64, 64);
        g.fillStyle = '#3e3326';
        g.fillRect(px - 25, py - 25, 50, 50);
      });
      const r = rrange(rng, 40, 52);
      const img = makeTree(this.nextSeed(), r, rng() < 0.15);
      this.trees.push({ x: px, y: py, r, img, ang: rng() * TAU, size: r * 2.6 });
    }
    for (let i = 0; i < 4; i++)
      this.bench(rrange(rng, x + 30, x + w - 70), rrange(rng, y + 30, y + h - 40), rng() < 0.5);
    if (rng() < 0.5) this.addBarrel(rrange(rng, x + 40, x + w - 40), rrange(rng, y + 40, y + h - 40), rng() < 0.6);
  }

  parking(x, y, w, h) {
    const rng = this.rng;
    const horiz = w > h ? rng() < 0.7 : rng() < 0.3;
    this.op(0, x, y, w, h, (g) => {
      g.fillStyle = pat(g, 'lot');
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(210,205,190,0.4)';
      g.lineWidth = 2;
      const stall = 54;
      if (horiz) {
        for (let sx = x + 10; sx <= x + w - 10; sx += stall) {
          g.beginPath();
          g.moveTo(sx, y + 6);
          g.lineTo(sx, y + 100);
          g.moveTo(sx, y + h - 100);
          g.lineTo(sx, y + h - 6);
          g.stroke();
        }
      } else {
        for (let sy = y + 10; sy <= y + h - 10; sy += stall) {
          g.beginPath();
          g.moveTo(x + 6, sy);
          g.lineTo(x + 100, sy);
          g.moveTo(x + w - 100, sy);
          g.lineTo(x + w - 6, sy);
          g.stroke();
        }
      }
      g.fillStyle = 'rgba(20,20,20,0.35)';
      g.beginPath();
      g.ellipse(x + w * 0.5, y + h * 0.5, 40, 22, 0.4, 0, TAU);
      g.fill();
    });
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

  roadSegment(c, a, b, vertical) {
    const rng = this.rng;
    const L = b - a;
    const R = (u0, v0, lu, lv) => (vertical ? [c + v0, u0, lv, lu] : [u0, c + v0, lu, lv]);
    const P = (u, v) => (vertical ? [c + v, u] : [u, c + v]);
    const [bx, by, bw, bh] = R(a, -ROAD_HALF, L, ROAD_W);
    const seed = this.nextSeed();
    // marcas viales gastadas, grietas, baches
    this.op(1, bx, by, bw, bh, (g) => {
      const r = mulberry32(seed);
      g.save();
      g.beginPath();
      g.rect(bx, by, bw, bh);
      g.clip();
      g.fillStyle = 'rgba(184,154,62,0.55)';
      for (const v of [-4, 3]) {
        let u = a;
        while (u < b) {
          const seg = rrange(r, 60, 200);
          if (r() > 0.18) {
            const [rx, ry, rw, rh] = R(u, v, Math.min(seg, b - u), 2.5);
            g.fillRect(rx, ry, rw, rh);
          }
          u += seg + rrange(r, 0, 20);
        }
      }
      g.fillStyle = 'rgba(205,200,188,0.45)';
      for (const v of [-56, 54]) {
        for (let u = a + 10; u < b - 10; u += 64) {
          if (r() < 0.15) continue;
          const [rx, ry, rw, rh] = R(u, v, 30, 3);
          g.fillRect(rx, ry, rw, rh);
        }
      }
      g.strokeStyle = 'rgba(20,20,20,0.55)';
      g.lineWidth = 1.4;
      const cracks = 2 + Math.floor(L / 160);
      for (let i = 0; i < cracks; i++) {
        let u = rrange(r, a, b);
        let v = rrange(r, -ROAD_HALF, ROAD_HALF);
        g.beginPath();
        g.moveTo(...P(u, v));
        const steps = 5 + ((r() * 8) | 0);
        for (let s = 0; s < steps; s++) {
          u += rrange(r, -18, 18);
          v += rrange(r, -18, 18);
          g.lineTo(...P(u, v));
        }
        g.stroke();
      }
      for (let i = 0; i < 2; i++) {
        const [px, py] = P(rrange(r, a, b), rrange(r, -90, 90));
        const pr = rrange(r, 7, 16);
        g.fillStyle = '#262728';
        g.beginPath();
        g.ellipse(px, py, pr, pr * 0.7, r() * TAU, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(80,80,78,0.6)';
        g.lineWidth = 1.5;
        g.stroke();
      }
      for (let i = 0; i < 2; i++) {
        const [px, py] = P(rrange(r, a, b), rrange(r, -90, 90));
        g.fillStyle = 'rgba(15,15,20,0.4)';
        g.beginPath();
        g.ellipse(px, py, rrange(r, 12, 30), rrange(r, 8, 18), r() * TAU, 0, TAU);
        g.fill();
      }
      if (r() < 0.6) {
        const [px, py] = P(rrange(r, a + 30, b - 30), rrange(r, -60, 60));
        g.fillStyle = '#2f3031';
        g.beginPath();
        g.arc(px, py, 13, 0, TAU);
        g.fill();
        g.strokeStyle = '#555';
        g.lineWidth = 2;
        g.stroke();
        g.strokeStyle = 'rgba(90,90,90,0.6)';
        g.lineWidth = 1;
        for (let k = -8; k <= 8; k += 4) {
          g.beginPath();
          g.moveTo(px - 9, py + k);
          g.lineTo(px + 9, py + k);
          g.stroke();
        }
      }
      for (let i = 0; i < 6; i++) {
        const [px, py] = P(rrange(r, a, b), rrange(r, -100, 100));
        g.save();
        g.translate(px, py);
        g.rotate(r() * TAU);
        g.fillStyle = rpick(r, ['rgba(210,205,190,0.6)', 'rgba(60,60,55,0.8)', 'rgba(110,80,50,0.7)']);
        g.fillRect(-4, -3, 8, 6);
        g.restore();
      }
      g.restore();
    });
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
        this.op(3, rx, ry, rw + 8, rh + 8, (g) => {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(rx + 4, ry + 5, rw, rh);
          g.fillStyle = '#9a968c';
          g.fillRect(rx, ry, rw, rh);
          g.fillStyle = '#b3afa4';
          if (rw < rh) g.fillRect(rx + rw / 2 - 2, ry, 4, rh);
          else g.fillRect(rx, ry + rh / 2 - 2, rw, 4);
          g.strokeStyle = OUT;
          g.lineWidth = 1.5;
          g.strokeRect(rx, ry, rw, rh);
          g.fillStyle = 'rgba(190,150,60,0.6)';
          if (rw < rh) g.fillRect(rx, ry + 6, rw, 6);
          else g.fillRect(rx + 6, ry, 6, rh);
        });
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
          this.op(3, tx - 12, ty - 12, 26, 26, (g) => {
            g.fillStyle = 'rgba(0,0,0,0.35)';
            g.beginPath();
            g.arc(tx + 3, ty + 4, 9, 0, TAU);
            g.fill();
            g.fillStyle = red ? '#8a3a30' : '#4a5a4a';
            g.beginPath();
            g.arc(tx, ty, red ? 6 : 9, 0, TAU);
            g.fill();
            g.strokeStyle = OUT;
            g.lineWidth = 1.5;
            g.stroke();
            if (!red) {
              g.fillStyle = '#2d352d';
              g.beginPath();
              g.arc(tx, ty, 5, 0, TAU);
              g.fill();
            }
          });
        }
      }
    }
  }

  intersection(cx, cy) {
    const seed = this.nextSeed();
    const S = this.size;
    this.op(1, cx - ROAD_HALF - 60, cy - ROAD_HALF - 60, ROAD_W + 120, ROAD_W + 120, (g) => {
      const r = mulberry32(seed);
      g.fillStyle = 'rgba(205,200,188,0.5)';
      const stripes = (vertical, dir) => {
        for (let v = -ROAD_HALF + 10; v < ROAD_HALF - 10; v += 24) {
          if (r() < 0.12) continue;
          const u0 = dir < 0 ? -ROAD_HALF - 46 : ROAD_HALF + 8;
          if (vertical) g.fillRect(cx + v, cy + u0, 13, 38);
          else g.fillRect(cx + u0, cy + v, 38, 13);
        }
      };
      if (cy - ROAD_HALF - 46 > 0) stripes(true, -1);
      if (cy + ROAD_HALF + 46 < S) stripes(true, 1);
      if (cx - ROAD_HALF - 46 > 0) stripes(false, -1);
      if (cx + ROAD_HALF + 46 < S) stripes(false, 1);
    });
    const corner = [cx - ROAD_HALF - 14, cy - ROAD_HALF - 14];
    if (this.free(corner[0] - 6, corner[1] - 6, 12, 12, 2)) {
      this.addCircle(corner[0], corner[1], 6, false, true);
      this.overhead.push({ k: 'signal', x: corner[0], y: corner[1], hx: corner[0] + 40, hy: corner[1] + 24 });
    }
  }

  /* ---------- índices ---------- */

  indexOps() {
    const n = Math.ceil(this.size / CHUNK);
    this.chunkN = n;
    this.chunkOps = Array.from({ length: n * n }, () => []);
    for (const op of this.ops) {
      const x0 = clamp(Math.floor(op.x / CHUNK), 0, n - 1);
      const y0 = clamp(Math.floor(op.y / CHUNK), 0, n - 1);
      const x1 = clamp(Math.floor((op.x + op.w) / CHUNK), 0, n - 1);
      const y1 = clamp(Math.floor((op.y + op.h) / CHUNK), 0, n - 1);
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) this.chunkOps[j * n + i].push(op);
    }
  }

  buildObstacleGrid() {
    const n = Math.ceil(this.size / OBS_CELL);
    this.obsN = n;
    this.obsGrid = Array.from({ length: n * n }, () => []);
    this.obstacles.forEach((o, idx) => {
      o.id = idx;
      o.stamp = 0;
      if (o.prop) return;
      const [x, y, w, h] = o.k === 0 ? [o.x, o.y, o.w, o.h] : [o.x - o.r, o.y - o.r, o.r * 2, o.r * 2];
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
  collide(e, r, passBlocks = false) {
    const n = this.obsN;
    const x0 = clamp(Math.floor((e.x - r) / OBS_CELL), 0, n - 1);
    const y0 = clamp(Math.floor((e.y - r) / OBS_CELL), 0, n - 1);
    const x1 = clamp(Math.floor((e.x + r) / OBS_CELL), 0, n - 1);
    const y1 = clamp(Math.floor((e.y + r) / OBS_CELL), 0, n - 1);
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
          if (o.k === 0) {
            const px = e.x < o.x ? o.x : e.x > o.x + o.w ? o.x + o.w : e.x;
            const py = e.y < o.y ? o.y : e.y > o.y + o.h ? o.y + o.h : e.y;
            const dx = e.x - px;
            const dy = e.y - py;
            const d2 = dx * dx + dy * dy;
            if (d2 >= r * r) continue;
            hit = true;
            if (o.block) this.lastBlock = o;
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
          } else {
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

  addDynamic(o) {
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

  removeDynamic(o) {
    for (const idx of o.cells) {
      const arr = this.obsGrid[idx];
      const i = arr.indexOf(o);
      if (i >= 0) arr.splice(i, 1);
    }
    o.cells = [];
    this.refreshNav(o.x, o.y, o.w, o.h);
  }

  refreshNav(x, y, w, h) {
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
  rectFree(x, y, w, h, ignoreBlocks = false) {
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
          if (o.k === 0) {
            if (x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y) return false;
          } else {
            const px = clamp(o.x, x, x + w);
            const py = clamp(o.y, y, y + h);
            if ((px - o.x) ** 2 + (py - o.y) ** 2 < o.r * o.r) return false;
          }
        }
      }
    }
    return true;
  }

  pointBlocked(x, y, pad = 0, bulletsOnly = false) {
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
          if (o.k === 0) {
            if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) return o;
          } else {
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
    // segundo campo: hacia el compañero en el modo cooperativo
    this.main2 = { dist: new Uint16Array(n * n).fill(65535), cell: -1, ok: false };
    this.anchorTurn = 0;
  }

  set flowCell(v) {
    // al cambiar barricadas se fuerza el recálculo de todos los campos
    if (v === -1 && this.main) {
      this.main.cell = -1;
      for (const a of this.anchors) a.cell = -1;
      if (this.main2) this.main2.cell = -1;
    }
  }

  // Celda libre más cercana a (px, py), o -1.
  freeCell(px, py) {
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
  computeField(field, px, py) {
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

  updateFlow(px, py) {
    this.computeField(this.main, px, py);
  }

  // Recalcula UN campo de flanqueo por llamada (repartido entre fotogramas).
  updateAnchors(px, py, radius = 230) {
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
  flowDir(x, y, out, field = this.main) {
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

  reachable(x, y, field = this.main) {
    const n = this.navN;
    const ci = clamp(Math.floor(x / NAV_CELL), 0, n - 1);
    const cj = clamp(Math.floor(y / NAV_CELL), 0, n - 1);
    return field.ok && field.dist[cj * n + ci] < 65535;
  }

  /* ---------- render ---------- */

  setChunkScale(s) {
    s = clamp(Math.round(s * 4) / 4, 0.75, 2);
    if (s === this.chunkScale) return;
    this.chunkScale = s;
    this.chunkCache.clear();
    this.chunkPool.length = 0;
  }

  getChunk(i, j) {
    const key = j * this.chunkN + i;
    let c = this.chunkCache.get(key);
    if (c) {
      this.chunkCache.delete(key);
      this.chunkCache.set(key, c);
      return c;
    }
    const px = Math.ceil(CHUNK * this.chunkScale);
    c = this.chunkPool.pop() || makeCanvas(px, px);
    if (c.width !== px) {
      c.width = px;
      c.height = px;
    }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    const s = this.chunkScale;
    g.setTransform(s, 0, 0, s, -i * CHUNK * s, -j * CHUNK * s);
    for (const op of this.chunkOps[key]) {
      g.save();
      op.draw(g);
      g.restore();
    }
    this.chunkCache.set(key, c);
    while (this.chunkCache.size > this.maxChunks) {
      const oldest = this.chunkCache.keys().next().value;
      this.chunkPool.push(this.chunkCache.get(oldest));
      this.chunkCache.delete(oldest);
    }
    return c;
  }

  drawGround(ctx, x0, y0, x1, y1) {
    const n = this.chunkN;
    const i0 = clamp(Math.floor(x0 / CHUNK), 0, n - 1);
    const j0 = clamp(Math.floor(y0 / CHUNK), 0, n - 1);
    const i1 = clamp(Math.floor(x1 / CHUNK), 0, n - 1);
    const j1 = clamp(Math.floor(y1 / CHUNK), 0, n - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        ctx.drawImage(this.getChunk(i, j), i * CHUNK, j * CHUNK, CHUNK + 0.75, CHUNK + 0.75);
      }
    }
  }

  drawFlame(ctx, f, time) {
    const s = f.s;
    const seed = f.x * 0.37 + f.y * 0.11;
    /** @type {[string, number, number][]} */
    const layers = [
      ['rgba(150,50,20,0.75)', 13, 1],
      ['rgba(225,110,40,0.85)', 9.5, 0.75],
      ['rgba(255,200,110,0.95)', 5.5, 0.5],
    ];
    for (const [col, r, k] of layers) {
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + seed;
        const fl = Math.sin(time * (9 + i * 2.3) + seed + i) * 0.35 + 1;
        const rr = r * s * fl;
        const ox = f.x + Math.cos(a) * r * s * 0.45 * k;
        const oy = f.y + Math.sin(a) * r * s * 0.45 * k - 3 * s * k;
        ctx.moveTo(ox + rr * 0.6, oy);
        ctx.arc(ox, oy, rr * 0.6, 0, TAU);
      }
      ctx.fill();
    }
  }

  // Elementos que tapan a los personajes: copas de árboles, farolas, semáforos.
  drawOverhead(ctx, x0, y0, x1, y1, player, time) {
    for (const f of this.fires) {
      if (f.x < x0 - 40 || f.x > x1 + 40 || f.y < y0 - 40 || f.y > y1 + 40) continue;
      this.drawFlame(ctx, f, time);
    }
    for (const t of this.trees) {
      if (t.x + t.size < x0 || t.x - t.size > x1 || t.y + t.size < y0 || t.y - t.size > y1) continue;
      const near = Math.hypot(player.x - t.x, player.y - t.y) < t.r + 10;
      ctx.globalAlpha = near ? 0.45 : 0.95;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.ang + Math.sin(time * 0.8 + t.ang) * 0.02);
      ctx.drawImage(t.img, -t.size / 2, -t.size / 2, t.size, t.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (const o of this.overhead) {
      if (
        Math.max(o.x, o.hx) < x0 - 20 ||
        Math.min(o.x, o.hx) > x1 + 20 ||
        Math.max(o.y, o.hy) < y0 - 20 ||
        Math.min(o.y, o.hy) > y1 + 20
      )
        continue;
      ctx.lineCap = 'round';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(o.hx, o.hy);
      ctx.stroke();
      ctx.strokeStyle = '#55595a';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.fillStyle = '#3f4243';
      ctx.beginPath();
      ctx.arc(o.x, o.y, 6, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (o.k === 'lamp') {
        ctx.save();
        ctx.translate(o.hx, o.hy);
        ctx.rotate(Math.atan2(o.hy - o.y, o.hx - o.x));
        roundRect(ctx, -8, -6, 18, 12, 4);
        ctx.fillStyle = '#4a4d4e';
        ctx.fill();
        ctx.strokeStyle = OUT;
        ctx.stroke();
        ctx.fillStyle = o.lit ? '#f2d9a0' : '#2a2c2d';
        ctx.fillRect(-4, -3, 10, 6);
        ctx.restore();
      } else {
        ctx.fillStyle = '#26282a';
        ctx.fillRect(o.hx - 6, o.hy - 14, 12, 28);
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(o.hx - 6, o.hy - 14, 12, 28);
        const blink = Math.sin(time * 3) > 0;
        ctx.fillStyle = blink ? '#c9a54a' : '#4a4026';
        ctx.beginPath();
        ctx.arc(o.hx, o.hy, 3.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#3a1e1a';
        ctx.beginPath();
        ctx.arc(o.hx, o.hy - 8, 3.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#1e2a1e';
        ctx.beginPath();
        ctx.arc(o.hx, o.hy + 8, 3.5, 0, TAU);
        ctx.fill();
      }
    }
  }
}

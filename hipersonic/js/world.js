// La ciudad: cuadrícula de calles con carriles, aceras de baldosas, pasos peatonales,
// manzanas (edificios, parques, plazas, estacionamientos), mobiliario, semáforos y farolas.
// El suelo y los techos son estáticos: se pintan por trozos de 512 px y se guardan.
import { TAU, clamp, mulberry32, rrange, rpick, hash2, makeCanvas, shade, rgba, roundRect } from './util.js';
import { buildTextures, pattern, paintRoof, paintTree, PROPS, paintSignal, ROOF_STYLES } from './art/city.js';
import { drawSprite } from './atlas.js';
import { OUT } from './art/characters.js';

export const LANE = 46;
export const ROAD = LANE * 4;
export const SW = 60; // ancho de la acera
export const BLOCK = 720;
export const CELL = ROAD + BLOCK;
export const NB = 12;
export const SIZE = NB * CELL + ROAD;
export const roadC = (i) => ROAD / 2 + i * CELL;
// Dirección de la luz (las sombras caen hacia abajo a la derecha).
export const SUN = { x: 0.5, y: 0.38 };

const CHUNK = 512;
const XW = 26; // ancho del paso peatonal
const XGAP = 8;

export class World {
  constructor(atlas, seed = 20261023) {
    this.atlas = atlas;
    this.seed = seed;
    this.T = buildTextures();
    this.chunks = new Map();
    this.chunkScale = 1;
    this.maxChunks = 24;
    this.blocks = [];
    this.buildings = [];
    this.solids = [];
    this.grid = new Map();
    this.ground = []; // objetos pintados en el suelo: {spr, x, y, rot, sh}
    this.trees = [];
    this.lamps = [];
    this.signals = [];
    this.marks = [];
    this.details = [];
    this.awnings = [];
    this.fountains = [];
    this.parkSpots = [];
    this.walkRings = [];
    this.steam = [];
    this.bakeProps();
    this.generate();
    this.buildNav();
    this.buildOverGrid();
    this.vis = { trees: [], lamps: [], signals: [], awnings: [] };
  }

  // Rejilla de objetos altos (copas, farolas, semáforos, toldos) para recorrer sólo lo visible.
  buildOverGrid() {
    this.over = new Map();
    const add = (type, o, x, y) => {
      const k = Math.floor(y / 512) * 1000 + Math.floor(x / 512);
      let c = this.over.get(k);
      if (!c) this.over.set(k, (c = { trees: [], lamps: [], signals: [], awnings: [] }));
      c[type].push(o);
    };
    for (const t of this.trees) add('trees', t, t.x, t.y);
    for (const l of this.lamps) add('lamps', l, l.hx, l.hy);
    for (const s of this.signals) add('signals', s, s.x, s.y);
    for (const a of this.awnings) add('awnings', a, a.x, a.y);
  }

  // Reúne los objetos altos cercanos a la vista (una vez por fotograma).
  collectVisible(v, m = 320) {
    const vis = this.vis;
    vis.trees.length = vis.lamps.length = vis.signals.length = vis.awnings.length = 0;
    const c0 = Math.floor((v.x0 - m) / 512);
    const c1 = Math.floor((v.x1 + m) / 512);
    const r0 = Math.floor((v.y0 - m) / 512);
    const r1 = Math.floor((v.y1 + m) / 512);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const cell = this.over.get(r * 1000 + c);
        if (!cell) continue;
        for (const k of ['trees', 'lamps', 'signals', 'awnings']) for (const o of cell[k]) vis[k].push(o);
      }
    return vis;
  }

  bakeProps() {
    const A = this.atlas;
    this.spr = {};
    for (const [name, [w, h, paint, opt]] of Object.entries(PROPS)) {
      this.spr[name] = A.add('prop.' + name, w, h, paint, { scale: 2.5, ...(opt || {}) });
      this.spr[name + 'Sh'] = A.tinted('prop.' + name + '.sh', this.spr[name], '#000', 1);
    }
    this.spr.trees = [];
    const kinds = ['park', 'park', 'park', 'dark', 'autumn', 'park'];
    for (let i = 0; i < 6; i++) {
      const R = 34 + i * 3;
      this.spr.trees.push(A.add('tree' + i, R * 2 + 8, R * 2 + 8, (g) => paintTree(g, R, 300 + i * 17, kinds[i]), { scale: 2 }));
    }
    this.spr.signal = { r: A.add('sig.r', 26, 12, (g) => paintSignal(g, 'r')), y: A.add('sig.y', 26, 12, (g) => paintSignal(g, 'y')), g: A.add('sig.g', 26, 12, (g) => paintSignal(g, 'g')) };
  }

  /* ---------- generación ---------- */

  generate() {
    const rng = mulberry32(this.seed);
    const mid = Math.floor(NB / 2);
    for (let bj = 0; bj < NB; bj++) {
      for (let bi = 0; bi < NB; bi++) {
        const x = ROAD + bi * CELL;
        const y = ROAD + bj * CELL;
        let type = rng() < 0.56 ? 'build' : rpick(rng, ['park', 'plaza', 'parking', 'build', 'park', 'parking']);
        if ((bi === mid - 1 && bj === mid - 1) || (bi === mid && bj === mid)) type = 'build';
        if (bi === mid && bj === mid - 1) type = 'plaza';
        if (bi === mid - 1 && bj === mid) type = 'park';
        const b = { x, y, w: BLOCK, h: BLOCK, type, seed: (rng() * 1e9) | 0, alleys: [] };
        this.blocks.push(b);
        this.walkRings.push({ x0: x + 32, y0: y + 32, x1: x + BLOCK - 32, y1: y + BLOCK - 32 });
        this.fillBlock(b, mulberry32(b.seed));
        this.sidewalkProps(b, mulberry32(b.seed + 5));
      }
    }
    this.genRoads(rng);
  }

  addSolid(s) {
    s.x0 = s.c ? s.x - s.r : s.x;
    s.y0 = s.c ? s.y - s.r : s.y;
    s.x1 = s.c ? s.x + s.r : s.x + s.w;
    s.y1 = s.c ? s.y + s.r : s.y + s.h;
    this.solids.push(s);
    const c0 = Math.floor(s.x0 / 128);
    const c1 = Math.floor(s.x1 / 128);
    const r0 = Math.floor(s.y0 / 128);
    const r1 = Math.floor(s.y1 / 128);
    for (let cy = r0; cy <= r1; cy++)
      for (let cx = c0; cx <= c1; cx++) {
        const k = cy * 4096 + cx;
        let a = this.grid.get(k);
        if (!a) this.grid.set(k, (a = []));
        a.push(s);
      }
  }
  rectSolid(x, y, w, h, kind) {
    this.addSolid({ x, y, w, h, kind });
  }
  circSolid(x, y, r, kind) {
    this.addSolid({ c: true, x, y, r, kind });
  }
  prop(name, x, y, rot = 0, solid = 0) {
    const s = this.spr[name];
    this.ground.push({ spr: s, sh: this.spr[name + 'Sh'], x, y, rot, r: Math.max(s.w, s.h) / 2 });
    if (solid) this.circSolid(x, y, solid, name);
  }
  tree(x, y, rng, pit = true) {
    const spr = rpick(rng, this.spr.trees);
    const R = spr.w / 2 - 4;
    this.trees.push({ x, y, spr, R, rot: rng() * TAU, ph: rng() * TAU });
    if (pit) this.prop('pit', x, y, 0);
    this.circSolid(x, y, 7, 'tree');
  }

  addBuilding(x, y, w, h, rng) {
    const style = rpick(rng, ROOF_STYLES);
    const b = {
      x, y, w, h, style,
      seed: (rng() * 1e9) | 0,
      height: rrange(rng, 50, 230),
      parapet: style === 'metal' ? 4 : rrange(rng, 6, 10),
      parapetColor: rpick(rng, ['#b9b3a6', '#a8a196', '#c9c2b2', '#8d8981', '#b59a82']),
      tint: rpick(rng, ['#a06040', '#4060a0', '#60a060', '#a0a060', '#808080', '#a07080']),
    };
    this.buildings.push(b);
    this.rectSolid(x, y, w, h, 'building');
    return b;
  }

  // Divide un rectángulo en edificios con callejones.
  splitBuild(x, y, w, h, rng, depth, block) {
    const can = depth < 3 && (w > 300 || h > 300);
    if (can && rng() < 0.85) {
      const vert = w > h ? true : w < h ? false : rng() < 0.5;
      const alley = rng() < 0.55 ? 34 : 0;
      if (vert) {
        const s = Math.round(rrange(rng, 0.35, 0.65) * w);
        if (alley) block.alleys.push({ x: x + s - alley / 2, y, w: alley, h });
        this.splitBuild(x, y, s - alley / 2, h, rng, depth + 1, block);
        this.splitBuild(x + s + alley / 2, y, w - s - alley / 2, h, rng, depth + 1, block);
      } else {
        const s = Math.round(rrange(rng, 0.35, 0.65) * h);
        if (alley) block.alleys.push({ x, y: y + s - alley / 2, w, h: alley });
        this.splitBuild(x, y, w, s - alley / 2, rng, depth + 1, block);
        this.splitBuild(x, y + s + alley / 2, w, h - s - alley / 2, rng, depth + 1, block);
      }
      return;
    }
    if (depth > 0 && rng() < 0.12 && w > 120 && h > 120) {
      block.yards = block.yards || [];
      block.yards.push({ x, y, w, h });
      this.tree(x + w / 2, y + h / 2, rng, false);
      return;
    }
    this.addBuilding(x, y, w, h, rng);
  }

  fillBlock(b, rng) {
    const ix = b.x + SW;
    const iy = b.y + SW;
    const iw = b.w - SW * 2;
    const ih = b.h - SW * 2;
    b.inner = { x: ix, y: iy, w: iw, h: ih };
    if (b.type === 'build') {
      this.splitBuild(ix, iy, iw, ih, rng, 0, b);
      for (const a of b.alleys) {
        const n = Math.floor(Math.max(a.w, a.h) / 140);
        for (let i = 0; i < n; i++) {
          if (rng() < 0.5) continue;
          const t = (i + 0.5) / n;
          const vert = a.h > a.w;
          const x = vert ? a.x + a.w / 2 : a.x + a.w * t;
          const y = vert ? a.y + a.h * t : a.y + a.h / 2;
          if (rng() < 0.5) {
            this.prop('dumpster', x, y, vert ? Math.PI / 2 : 0);
            if (vert) this.rectSolid(x - 14, y - 25, 28, 50, 'dumpster');
            else this.rectSolid(x - 25, y - 14, 50, 28, 'dumpster');
          } else this.steam.push({ x, y, t: rng() * 3 });
        }
      }
      // toldos sobre la acera en algunas fachadas
      for (const bd of this.buildings) {
        if (bd.x < ix || bd.x > ix + iw || bd.y < iy || bd.y > iy + ih) continue;
        if (rng() < 0.35 && Math.abs(bd.y - iy) < 1 && bd.w > 120) this.awnings.push({ x: bd.x + bd.w / 2, y: iy - 10, rot: 0, w: Math.min(120, bd.w - 40) });
        if (rng() < 0.35 && Math.abs(bd.y + bd.h - (iy + ih)) < 1 && bd.w > 120) this.awnings.push({ x: bd.x + bd.w / 2, y: iy + ih + 10, rot: Math.PI, w: Math.min(120, bd.w - 40) });
      }
    } else if (b.type === 'park') {
      const cx = ix + iw / 2;
      const cy = iy + ih / 2;
      b.paths = [
        [ix, iy, ix + iw, iy + ih],
        [ix + iw, iy, ix, iy + ih],
        [cx, iy, cx, iy + ih],
      ];
      this.fountains.push({ x: cx, y: cy, r: 54 });
      this.circSolid(cx, cy, 54, 'fountain');
      for (let i = 0; i < 26; i++) {
        const x = rrange(rng, ix + 40, ix + iw - 40);
        const y = rrange(rng, iy + 40, iy + ih - 40);
        if (Math.hypot(x - cx, y - cy) < 130) continue;
        if (b.paths.some(([x0, y0, x1, y1]) => segD(x, y, x0, y0, x1, y1) < 46)) continue;
        if (this.trees.some((t) => Math.hypot(t.x - x, t.y - y) < 70)) continue;
        this.tree(x, y, rng, false);
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        const x = cx + Math.cos(a) * 96;
        const y = cy + Math.sin(a) * 96;
        this.prop('bench', x, y, a + Math.PI / 2);
        this.circSolid(x, y, 10, 'bench');
      }
      for (const s of [-1, 1]) this.prop('bin', cx + s * 70, cy + 150, 0, 7);
    } else if (b.type === 'plaza') {
      const cx = ix + iw / 2;
      const cy = iy + ih / 2;
      b.statue = { x: cx, y: cy };
      this.circSolid(cx, cy, 40, 'statue');
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          if (i === 1 && j === 1) continue;
          const x = ix + 100 + i * ((iw - 200) / 2);
          const y = iy + 100 + j * ((ih - 200) / 2);
          if ((i + j) % 2) {
            this.prop('planter', x, y, 0);
            this.rectSolid(x - 11, y - 11, 22, 22, 'planter');
          } else this.tree(x, y, rng);
        }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        this.prop('bench', cx + Math.cos(a) * 130, cy + Math.sin(a) * 130, a + Math.PI / 2);
        this.circSolid(cx + Math.cos(a) * 130, cy + Math.sin(a) * 130, 10, 'bench');
      }
      for (let i = 0; i < 10; i++) this.prop('bollard', ix + 30 + i * ((iw - 60) / 9), iy + 14, 0, 3);
    } else if (b.type === 'parking') {
      b.lot = { x: ix + 10, y: iy + 10, w: iw - 20, h: ih - 20 };
      const rows = [iy + 60, iy + 200, iy + 360, iy + 500];
      rows.forEach((ry, ri) => {
        for (let x = ix + 40; x < ix + iw - 40; x += 56) {
          const dir = ri % 2 ? -1 : 1;
          this.parkSpots.push({ x: x + 28, y: ry + (ri % 2 ? -42 : 42) * 0 + 0, ang: dir * Math.PI / 2, filled: rng() < 0.62 });
        }
      });
      b.rows = rows;
      this.prop('cone', ix + 30, iy + ih - 30, 0, 4);
      this.lamps.push({ x: ix + iw / 2, y: iy + ih / 2 - 70, hx: ix + iw / 2, hy: iy + ih / 2 - 70, rot: 0, R: 300, ph: rng() * TAU, pole: false });
      this.circSolid(ix + iw / 2, iy + ih / 2 - 70, 5, 'pole');
    }
  }

  // Árboles, farolas, bocas de incendio, papeleras… a lo largo de la acera.
  sidewalkProps(b, rng) {
    const edges = [
      { x0: b.x, y0: b.y, dx: 1, dy: 0, nx: 0, ny: -1, len: b.w },
      { x0: b.x, y0: b.y + b.h, dx: 1, dy: 0, nx: 0, ny: 1, len: b.w },
      { x0: b.x, y0: b.y, dx: 0, dy: 1, nx: -1, ny: 0, len: b.h },
      { x0: b.x + b.w, y0: b.y, dx: 0, dy: 1, nx: 1, ny: 0, len: b.h },
    ];
    for (const e of edges) {
      let k = 0;
      for (let t = 110; t < e.len - 100; t += rrange(rng, 105, 135)) {
        const cx = e.x0 + e.dx * t - e.nx * 15;
        const cy = e.y0 + e.dy * t - e.ny * 15;
        const r = rng();
        if (k % 3 === 1) {
          // farola: la cabeza se asoma sobre la calle
          const rot = Math.atan2(e.ny, e.nx);
          this.lamps.push({ x: cx, y: cy, hx: cx + e.nx * 32, hy: cy + e.ny * 32, rot, R: 260, ph: rng() * TAU, pole: true, flicker: rng() < 0.06 });
          this.prop('pole', cx, cy, 0);
          this.circSolid(cx, cy, 5, 'pole');
        } else if (r < 0.62 && b.type !== 'parking') {
          this.tree(cx - e.nx * 2, cy - e.ny * 2, rng);
        } else if (r < 0.75) {
          this.prop('hydrant', cx + e.dx * 10, cy + e.dy * 10, 0, 5);
        } else if (r < 0.88) {
          this.prop('bin', cx, cy, 0, 7);
        } else {
          this.prop('newsbox', cx, cy, Math.atan2(e.ny, e.nx) + Math.PI / 2, 7);
        }
        k++;
        // alcantarilla junto al bordillo
        if (rng() < 0.35) this.marks.push({ kind: 'drain', x: e.x0 + e.dx * (t + 50) + e.nx * 7, y: e.y0 + e.dy * (t + 50) + e.ny * 7, rot: Math.atan2(e.dy, e.dx) });
      }
    }
  }

  genRoads(rng) {
    // semáforos: cuatro postes por cruce
    for (let j = 0; j <= NB; j++)
      for (let i = 0; i <= NB; i++) {
        const cx = roadC(i);
        const cy = roadC(j);
        const o = ROAD / 2 + 16;
        const poles = [
          { sx: 1, sy: 1, ax: 0, ay: -1, axis: 'h' },
          { sx: -1, sy: -1, ax: 0, ay: 1, axis: 'h' },
          { sx: 1, sy: -1, ax: -1, ay: 0, axis: 'v' },
          { sx: -1, sy: 1, ax: 1, ay: 0, axis: 'v' },
        ];
        const off = hash2(i, j, 3) * 18;
        for (const p of poles) {
          const x = cx + p.sx * o;
          const y = cy + p.sy * o;
          if (x < 0 || y < 0 || x > SIZE || y > SIZE) continue;
          this.signals.push({ x, y, hx: x + p.ax * 62, hy: y + p.ay * 62, rot: Math.atan2(p.ay, p.ax), axis: p.axis, ix: i, iy: j, off });
          this.prop('pole', x, y, 0);
          this.circSolid(x, y, 5, 'pole');
        }
      }
    // marcas viales, grietas, parches y manchas
    const M = this.marks;
    for (let k = 0; k <= NB; k++) {
      const c = roadC(k);
      for (let s = 0; s < NB; s++) {
        const a = roadC(s) + ROAD / 2;
        const b = roadC(s + 1) - ROAD / 2;
        for (const axis of ['h', 'v']) {
          const seg = (p0, p1, off, w, color, dash) => {
            if (axis === 'h') M.push({ kind: 'line', x0: p0, y0: c + off, x1: p1, y1: c + off, w, color, dash });
            else M.push({ kind: 'line', x0: c + off, y0: p0, x1: c + off, y1: p1, w, color, dash });
          };
          const m0 = a + XW + XGAP * 2 + 8;
          const m1 = b - XW - XGAP * 2 - 8;
          seg(m0, m1, -3, 2.4, '#d6aa3c', 0);
          seg(m0, m1, 3, 2.4, '#d6aa3c', 0);
          seg(m0 + 20, m1, -LANE, 2.2, '#cfcbc0', 1);
          seg(m0 + 20, m1, LANE, 2.2, '#cfcbc0', 1);
          // líneas de alto (sólo en los carriles que llegan al cruce)
          if (axis === 'h') {
            M.push({ kind: 'rect', x: m0 - 6, y: c - ROAD / 2 + 4, w: 5, h: ROAD / 2 - 6, color: '#d8d4c8' });
            M.push({ kind: 'rect', x: m1 + 1, y: c + 2, w: 5, h: ROAD / 2 - 6, color: '#d8d4c8' });
          } else {
            M.push({ kind: 'rect', x: c + 2, y: m0 - 6, w: ROAD / 2 - 6, h: 5, color: '#d8d4c8' });
            M.push({ kind: 'rect', x: c - ROAD / 2 + 4, y: m1 + 1, w: ROAD / 2 - 6, h: 5, color: '#d8d4c8' });
          }
          // pasos peatonales (franjas paralelas al tráfico)
          for (const z of [a + XGAP, b - XGAP - XW]) {
            for (let q = -ROAD / 2 + 8; q < ROAD / 2 - 8; q += 18) {
              if (axis === 'h') M.push({ kind: 'zebra', x: z, y: c + q, w: XW, h: 10 });
              else M.push({ kind: 'zebra', x: c + q, y: z, w: 10, h: XW });
            }
          }
          // detalles a lo largo del tramo
          const L = b - a;
          for (let i = 0; i < 5; i++) {
            const t = a + rng() * L;
            const q = rrange(rng, -ROAD / 2 + 10, ROAD / 2 - 10);
            const [x, y] = axis === 'h' ? [t, c + q] : [c + q, t];
            const r = rng();
            if (r < 0.35) this.details.push(crack(x, y, rng));
            else if (r < 0.6) this.details.push({ kind: 'stain', x, y, rx: rrange(rng, 8, 26), ry: rrange(rng, 5, 14), rot: rng() * 3, a: rrange(rng, 0.25, 0.5) });
            else if (r < 0.8) this.details.push({ kind: 'patch', x, y, w: rrange(rng, 30, 90), h: rrange(rng, 20, 50), rot: axis === 'h' ? 0 : Math.PI / 2 });
            else this.details.push({ kind: 'skid', x, y, len: rrange(rng, 40, 110), rot: (axis === 'h' ? 0 : Math.PI / 2) + rrange(rng, -0.15, 0.15) });
          }
          if (rng() < 0.7) {
            const t = a + rrange(rng, 0.2, 0.8) * L;
            const q = rpick(rng, [-LANE * 1.5, -LANE / 2, LANE / 2, LANE * 1.5]);
            const [x, y] = axis === 'h' ? [t, c + q] : [c + q, t];
            this.ground.push({ spr: this.spr.manhole, x, y, rot: 0, r: 11, flat: true });
            if (rng() < 0.4) this.steam.push({ x, y, t: rng() * 3 });
          }
        }
      }
    }
    // grietas también en los cruces
    for (let j = 0; j <= NB; j++)
      for (let i = 0; i <= NB; i++) if (rng() < 0.6) this.details.push(crack(roadC(i) + rrange(rng, -60, 60), roadC(j) + rrange(rng, -60, 60), rng));
    for (const d of this.details) {
      const r = d.kind === 'crack' ? d.r : Math.max(d.rx || 0, d.w || 0, d.h || 0, d.len || 0) + 4;
      d.x0 = d.x - r;
      d.y0 = d.y - r;
      d.x1 = d.x + r;
      d.y1 = d.y + r;
    }
    for (const m of M) {
      if (m.kind === 'line') {
        m.bx0 = Math.min(m.x0, m.x1) - 4;
        m.by0 = Math.min(m.y0, m.y1) - 4;
        m.bx1 = Math.max(m.x0, m.x1) + 4;
        m.by1 = Math.max(m.y0, m.y1) + 4;
      } else if (m.kind === 'drain') {
        m.bx0 = m.x - 14;
        m.by0 = m.y - 14;
        m.bx1 = m.x + 14;
        m.by1 = m.y + 14;
      } else {
        m.bx0 = m.x;
        m.by0 = m.y;
        m.bx1 = m.x + m.w;
        m.by1 = m.y + m.h;
      }
    }
  }

  /* ---------- semáforos ---------- */

  // Estado de la luz para el eje 'h' (este-oeste) o 'v' (norte-sur) en un cruce.
  light(ix, iy, axis, t) {
    const p = (t + hash2(ix, iy, 3) * 18) % 18;
    if (axis === 'h') return p < 7 ? 'g' : p < 9 ? 'y' : 'r';
    return p < 9.6 ? 'r' : p < 16 ? 'g' : 'y';
  }

  /* ---------- colisiones ---------- */

  near(x0, y0, x1, y1, fn) {
    const c0 = Math.floor(x0 / 128);
    const c1 = Math.floor(x1 / 128);
    const r0 = Math.floor(y0 / 128);
    const r1 = Math.floor(y1 / 128);
    const stamp = (this.stamp = (this.stamp || 0) + 1);
    for (let cy = r0; cy <= r1; cy++)
      for (let cx = c0; cx <= c1; cx++) {
        const a = this.grid.get(cy * 4096 + cx);
        if (!a) continue;
        for (const s of a) {
          if (s.seen === stamp) continue;
          s.seen = stamp;
          fn(s);
        }
      }
  }

  // Empuja un círculo fuera de los sólidos. Devuelve la normal del último choque o null.
  collide(o, r) {
    let hit = null;
    if (o.x < r) (o.x = r), (hit = { nx: 1, ny: 0 });
    if (o.y < r) (o.y = r), (hit = { nx: 0, ny: 1 });
    if (o.x > SIZE - r) (o.x = SIZE - r), (hit = { nx: -1, ny: 0 });
    if (o.y > SIZE - r) (o.y = SIZE - r), (hit = { nx: 0, ny: -1 });
    this.near(o.x - r, o.y - r, o.x + r, o.y + r, (s) => {
      if (s.c) {
        const dx = o.x - s.x;
        const dy = o.y - s.y;
        const d = Math.hypot(dx, dy);
        const m = r + s.r;
        if (d < m && d > 1e-4) {
          o.x = s.x + (dx / d) * m;
          o.y = s.y + (dy / d) * m;
          hit = { nx: dx / d, ny: dy / d, s };
        }
      } else {
        const cx = clamp(o.x, s.x0, s.x1);
        const cy = clamp(o.y, s.y0, s.y1);
        const dx = o.x - cx;
        const dy = o.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            o.x = cx + (dx / d) * r;
            o.y = cy + (dy / d) * r;
            hit = { nx: dx / d, ny: dy / d, s };
          } else {
            // centro dentro del rectángulo: sale por el lado más cercano
            const l = o.x - s.x0;
            const rr = s.x1 - o.x;
            const t = o.y - s.y0;
            const b = s.y1 - o.y;
            const m = Math.min(l, rr, t, b);
            if (m === l) (o.x = s.x0 - r), (hit = { nx: -1, ny: 0, s });
            else if (m === rr) (o.x = s.x1 + r), (hit = { nx: 1, ny: 0, s });
            else if (m === t) (o.y = s.y0 - r), (hit = { nx: 0, ny: -1, s });
            else (o.y = s.y1 + r), (hit = { nx: 0, ny: 1, s });
          }
        }
      }
    });
    return hit;
  }

  blocked(x, y, r) {
    let b = false;
    this.near(x - r, y - r, x + r, y + r, (s) => {
      if (b) return;
      if (s.c) b = Math.hypot(x - s.x, y - s.y) < r + s.r;
      else b = x + r > s.x0 && x - r < s.x1 && y + r > s.y0 && y - r < s.y1;
    });
    return b;
  }

  // ¿Este punto está sobre la calzada? (para coches y para saber si un peatón cruza)
  onRoad(x, y) {
    const m = (v) => {
      const k = ((v % CELL) + CELL) % CELL;
      return k < ROAD;
    };
    return m(x) || m(y);
  }

  /* ---------- navegación (campo de flujo) ---------- */

  buildNav() {
    const N = (this.navN = Math.ceil(SIZE / 32));
    this.walk = new Uint8Array(N * N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = i * 32 + 16;
        const y = j * 32 + 16;
        let ok = 1;
        this.near(x - 14, y - 14, x + 14, y + 14, (s) => {
          if (!ok || s.kind !== 'building') return;
          if (x + 12 > s.x0 && x - 12 < s.x1 && y + 12 > s.y0 && y - 12 < s.y1) ok = 0;
        });
        this.walk[j * N + i] = ok;
      }
    this.dist = new Uint16Array(N * N).fill(65535);
    this.queue = new Int32Array(N * N);
  }

  updateFlow(tx, ty) {
    const N = this.navN;
    const D = this.dist;
    D.fill(65535);
    const q = this.queue;
    const si = clamp(Math.floor(tx / 32), 0, N - 1);
    const sj = clamp(Math.floor(ty / 32), 0, N - 1);
    let h = 0;
    let t = 0;
    D[sj * N + si] = 0;
    q[t++] = sj * N + si;
    while (h < t) {
      const c = q[h++];
      const d = D[c] + 1;
      if (d > 90) continue;
      const i = c % N;
      const j = (c / N) | 0;
      if (i > 0 && D[c - 1] > d && this.walk[c - 1]) (D[c - 1] = d), (q[t++] = c - 1);
      if (i < N - 1 && D[c + 1] > d && this.walk[c + 1]) (D[c + 1] = d), (q[t++] = c + 1);
      if (j > 0 && D[c - N] > d && this.walk[c - N]) (D[c - N] = d), (q[t++] = c - N);
      if (j < N - 1 && D[c + N] > d && this.walk[c + N]) (D[c + N] = d), (q[t++] = c + N);
    }
  }

  // Dirección para acercarse al objetivo del campo de flujo (o null si está fuera del alcance).
  flow(x, y) {
    const N = this.navN;
    const i = clamp(Math.floor(x / 32), 0, N - 1);
    const j = clamp(Math.floor(y / 32), 0, N - 1);
    const D = this.dist;
    let best = D[j * N + i];
    if (best === 65535) return null;
    let bx = 0;
    let by = 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        if (di && dj && (!this.walk[j * N + ni] || !this.walk[nj * N + i])) continue;
        const v = D[nj * N + ni];
        if (v < best) {
          best = v;
          bx = di;
          by = dj;
        }
      }
    if (!bx && !by) return { x: 0, y: 0 };
    const l = Math.hypot(bx, by);
    return { x: bx / l, y: by / l };
  }

  /* ---------- suelo por trozos ---------- */

  setChunkScale(s) {
    s = Math.min(2, Math.max(0.75, s));
    if (Math.abs(s - this.chunkScale) > 0.01) {
      this.chunkScale = s;
      this.chunks.clear();
    }
  }

  drawGround(g, v) {
    const c0 = Math.floor(v.x0 / CHUNK);
    const c1 = Math.floor(v.x1 / CHUNK);
    const r0 = Math.floor(v.y0 / CHUNK);
    const r1 = Math.floor(v.y1 / CHUNK);
    let built = 0;
    for (let cy = r0; cy <= r1; cy++)
      for (let cx = c0; cx <= c1; cx++) {
        const k = cy * 1000 + cx;
        let ch = this.chunks.get(k);
        if (!ch) {
          if (built >= 4 && this.chunks.size > 0) {
            g.fillStyle = '#2a2c30';
            g.fillRect(cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
            continue;
          }
          ch = this.paintChunk(cx, cy);
          this.chunks.set(k, ch);
          built++;
        }
        ch.used = this.frame;
        g.drawImage(ch.canvas, cx * CHUNK, cy * CHUNK, CHUNK + 0.5, CHUNK + 0.5);
      }
    this.frame = (this.frame || 0) + 1;
    if (this.chunks.size > this.maxChunks) {
      const old = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
      for (let i = 0; i < old.length - this.maxChunks; i++) this.chunks.delete(old[i][0]);
    }
  }

  paintChunk(cx, cy) {
    const s = this.chunkScale;
    const px = Math.ceil(CHUNK * s);
    const canvas = makeCanvas(px, px);
    const g = canvas.getContext('2d');
    const X0 = cx * CHUNK;
    const Y0 = cy * CHUNK;
    const X1 = X0 + CHUNK;
    const Y1 = Y0 + CHUNK;
    g.setTransform(s, 0, 0, s, -X0 * s, -Y0 * s);
    const hit = (o) => o.x1 > X0 && o.x0 < X1 && o.y1 > Y0 && o.y0 < Y1;
    const hitB = (x, y, w, h, m = 0) => x + w + m > X0 && x - m < X1 && y + h + m > Y0 && y - m < Y1;
    // 1. calzada
    g.fillStyle = pattern(g, this.T.asphalt);
    g.fillRect(X0, Y0, CHUNK, CHUNK);
    if (X0 < 0 || Y0 < 0 || X1 > SIZE || Y1 > SIZE) {
      g.fillStyle = '#1d1f22';
      if (X0 < 0) g.fillRect(X0, Y0, -X0, CHUNK);
      if (Y0 < 0) g.fillRect(X0, Y0, CHUNK, -Y0);
      if (X1 > SIZE) g.fillRect(SIZE, Y0, X1 - SIZE, CHUNK);
      if (Y1 > SIZE) g.fillRect(X0, SIZE, CHUNK, Y1 - SIZE);
    }
    // 2. detalles del asfalto
    for (const d of this.details) if (hit(d)) paintDetail(g, d, this.T);
    // 3. marcas viales
    for (const m of this.marks) {
      if (m.bx1 < X0 || m.bx0 > X1 || m.by1 < Y0 || m.by0 > Y1) continue;
      paintMark(g, m, this.spr);
    }
    // 4. manzanas
    for (const b of this.blocks) if (hitB(b.x, b.y, b.w, b.h, 8)) this.paintBlock(g, b, X0, Y0, X1, Y1);
    // 5. objetos del suelo con su sombra
    for (const o of this.ground) {
      if (o.x + o.r + 8 < X0 || o.x - o.r - 8 > X1 || o.y + o.r + 8 < Y0 || o.y - o.r - 8 > Y1) continue;
      if (!o.flat && o.sh) {
        g.globalAlpha = 0.38;
        drawSprite(g, o.sh, o.x + 3, o.y + 3, o.rot);
        g.globalAlpha = 1;
      }
      drawSprite(g, o.spr, o.x, o.y, o.rot);
    }
    // 6. sombras estáticas: edificios, copas de árboles, postes y estatuas
    g.fillStyle = 'rgba(8,10,20,0.42)';
    for (const b of this.buildings) {
      const dx = b.height * SUN.x;
      const dy = b.height * SUN.y;
      if (!hitB(b.x, b.y, b.w + dx, b.h + dy)) continue;
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x + b.w, b.y);
      g.lineTo(b.x + b.w + dx, b.y + dy);
      g.lineTo(b.x + b.w + dx, b.y + b.h + dy);
      g.lineTo(b.x + dx, b.y + b.h + dy);
      g.lineTo(b.x, b.y + b.h);
      g.closePath();
      g.fill();
    }
    for (const t of this.trees) {
      const ox = t.R * 0.9;
      if (!hitB(t.x - t.R, t.y - t.R, t.R * 2 + ox, t.R * 2 + ox)) continue;
      g.globalAlpha = 0.5;
      g.drawImage(this.fx.shadow, t.x + ox * 0.75 - t.R * 1.05, t.y + ox * 0.6 - t.R * 1.05, t.R * 2.1, t.R * 2.1);
      g.globalAlpha = 1;
    }
    g.strokeStyle = 'rgba(8,10,20,0.35)';
    g.lineCap = 'round';
    for (const l of [...this.lamps.filter((l) => l.pole), ...this.signals]) {
      if (!hitB(l.x - 10, l.y - 10, 90, 80)) continue;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(l.x, l.y);
      g.lineTo(l.x + 60 * SUN.x, l.y + 60 * SUN.y);
      g.lineTo(l.hx + 60 * SUN.x, l.hy + 60 * SUN.y);
      g.stroke();
    }
    // 7. techos
    for (const b of this.buildings) if (hitB(b.x, b.y, b.w, b.h, 4)) paintRoof(g, this.T, b);
    return { canvas, used: this.frame };
  }

  paintBlock(g, b, X0, Y0, X1, Y1) {
    const T = this.T;
    const { x, y, w, h } = b;
    const inn = b.inner;
    // acera: concreto + baldosas individuales
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.rect(inn.x + inn.w, inn.y, -inn.w, inn.h);
    g.clip('evenodd');
    g.fillStyle = pattern(g, T.concrete);
    g.fillRect(x, y, w, h);
    const S = 30;
    const i0 = Math.floor(Math.max(x, X0) / S);
    const i1 = Math.ceil(Math.min(x + w, X1) / S);
    const j0 = Math.floor(Math.max(y, Y0) / S);
    const j1 = Math.ceil(Math.min(y + h, Y1) / S);
    for (let j = j0; j < j1; j++)
      for (let i = i0; i < i1; i++) {
        const sx = i * S;
        const sy = j * S;
        if (sx >= inn.x && sx + S <= inn.x + inn.w && sy >= inn.y && sy + S <= inn.y + inn.h) continue;
        const hv = hash2(i, j, 1);
        g.fillStyle = hv < 0.5 ? `rgba(0,0,0,${0.03 + hv * 0.14})` : `rgba(255,255,250,${(hv - 0.5) * 0.14})`;
        g.fillRect(sx, sy, S, S);
        g.fillStyle = 'rgba(30,28,24,0.42)';
        g.fillRect(sx, sy, S, 1.1);
        g.fillRect(sx, sy, 1.1, S);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(sx + 1.1, sy + 1.1, S - 1.1, 0.8);
        const hc = hash2(i, j, 2);
        if (hc < 0.06) {
          g.strokeStyle = 'rgba(30,28,24,0.55)';
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(sx + hc * 300, sy);
          g.lineTo(sx + S * 0.5, sy + S * 0.45);
          g.lineTo(sx + S, sy + S * (0.3 + hc * 5));
          g.moveTo(sx + S * 0.5, sy + S * 0.45);
          g.lineTo(sx + S * 0.4, sy + S);
          g.stroke();
        } else if (hc < 0.1) {
          g.fillStyle = 'rgba(40,36,30,0.35)';
          g.beginPath();
          g.arc(sx + S * 0.5, sy + S * 0.5, 2 + hc * 40, 0, TAU);
          g.fill();
        }
      }
    g.restore();
    // bordillo y cuneta
    g.strokeStyle = '#b3afa5';
    g.lineWidth = 5;
    g.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1;
    g.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    g.strokeStyle = OUT;
    g.lineWidth = 1.6;
    g.strokeRect(x, y, w, h);
    const gw = 7;
    for (const [gx, gy, gw2, gh, x0, y0, x1, y1] of [
      [x, y - gw, w, gw, 0, y, 0, y - gw],
      [x, y + h, w, gw, 0, y + h, 0, y + h + gw],
      [x - gw, y, gw, h, x, 0, x - gw, 0],
      [x + w, y, gw, h, x + w, 0, x + w + gw, 0],
    ]) {
      const lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, 'rgba(0,0,0,0.35)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lg;
      g.fillRect(gx, gy, gw2, gh);
    }
    // interior
    if (b.type === 'build') {
      g.fillStyle = pattern(g, T.concrete);
      g.fillRect(inn.x, inn.y, inn.w, inn.h);
      g.fillStyle = 'rgba(30,26,22,0.35)';
      g.fillRect(inn.x, inn.y, inn.w, inn.h);
      for (const a of b.alleys) {
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(a.x, a.y, a.w, a.h);
        g.strokeStyle = 'rgba(20,20,20,0.35)';
        g.lineWidth = 1;
        g.beginPath();
        if (a.h > a.w) {
          g.moveTo(a.x + a.w / 2, a.y);
          g.lineTo(a.x + a.w / 2, a.y + a.h);
        } else {
          g.moveTo(a.x, a.y + a.h / 2);
          g.lineTo(a.x + a.w, a.y + a.h / 2);
        }
        g.stroke();
      }
      for (const yd of b.yards || []) {
        g.fillStyle = pattern(g, T.grass);
        g.fillRect(yd.x + 6, yd.y + 6, yd.w - 12, yd.h - 12);
        g.strokeStyle = '#6d6a62';
        g.lineWidth = 4;
        g.strokeRect(yd.x + 4, yd.y + 4, yd.w - 8, yd.h - 8);
      }
    } else if (b.type === 'park') {
      g.fillStyle = pattern(g, T.grass);
      g.fillRect(inn.x, inn.y, inn.w, inn.h);
      g.save();
      g.beginPath();
      g.rect(inn.x, inn.y, inn.w, inn.h);
      g.clip();
      g.lineCap = 'butt';
      for (const [x0, y0, x1, y1] of b.paths) {
        g.strokeStyle = 'rgba(40,30,20,0.5)';
        g.lineWidth = 40;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.strokeStyle = pattern(g, T.dirt);
        g.lineWidth = 34;
        g.stroke();
      }
      g.restore();
      const f = this.fountains.find((q) => q.x > inn.x && q.x < inn.x + inn.w && q.y > inn.y && q.y < inn.y + inn.h);
      if (f) paintFountain(g, f, T);
      g.strokeStyle = '#7b766c';
      g.lineWidth = 5;
      g.strokeRect(inn.x + 2.5, inn.y + 2.5, inn.w - 5, inn.h - 5);
      g.strokeStyle = OUT;
      g.lineWidth = 1.2;
      g.strokeRect(inn.x, inn.y, inn.w, inn.h);
    } else if (b.type === 'plaza') {
      g.fillStyle = pattern(g, T.pavers);
      g.fillRect(inn.x, inn.y, inn.w, inn.h);
      const cx = inn.x + inn.w / 2;
      const cy = inn.y + inn.h / 2;
      g.strokeStyle = 'rgba(220,210,190,0.35)';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(cx, cy, 170, 0, TAU);
      g.stroke();
      paintStatue(g, cx, cy);
    } else if (b.type === 'parking') {
      g.fillStyle = pattern(g, T.asphaltDark);
      g.fillRect(inn.x, inn.y, inn.w, inn.h);
      g.fillStyle = '#d8d4c8';
      for (const ry of b.rows)
        for (let px = inn.x + 40; px <= inn.x + inn.w - 40; px += 56) {
          g.fillRect(px - 1, ry - 46, 2.2, 92);
        }
      for (const ry of b.rows) g.fillRect(inn.x + 39, ry - 1, inn.w - 78, 2.2);
      g.strokeStyle = '#6d6a62';
      g.lineWidth = 4;
      g.strokeRect(inn.x + 2, inn.y + 2, inn.w - 4, inn.h - 4);
    }
  }

  /* ---------- capa superior: copas, farolas, semáforos ---------- */

  drawOverhead(g, v, t, hero) {
    const vis = this.vis;
    for (const a of vis.awnings) {
      if (a.x < v.x0 - 80 || a.x > v.x1 + 80 || a.y < v.y0 - 40 || a.y > v.y1 + 40) continue;
      drawSprite(g, this.spr.awning, a.x, a.y, a.rot, a.w / 60, 1);
    }
    for (const tr of vis.trees) {
      if (tr.x + tr.R < v.x0 || tr.x - tr.R > v.x1 || tr.y + tr.R < v.y0 || tr.y - tr.R > v.y1) continue;
      const under = hero && Math.hypot(hero.x - tr.x, hero.y - tr.y) < tr.R * 0.95;
      g.globalAlpha = under ? 0.42 : 1;
      drawSprite(g, tr.spr, tr.x, tr.y, tr.rot + Math.sin(t * 0.8 + tr.ph) * 0.02);
    }
    g.globalAlpha = 1;
    for (const l of vis.lamps) {
      if (!l.pole || l.x < v.x0 - 60 || l.x > v.x1 + 60 || l.y < v.y0 - 60 || l.y > v.y1 + 60) continue;
      drawSprite(g, this.spr.lampHead, l.x, l.y, l.rot);
    }
    for (const s of vis.signals) {
      if (s.x < v.x0 - 80 || s.x > v.x1 + 80 || s.y < v.y0 - 80 || s.y > v.y1 + 80) continue;
      g.strokeStyle = OUT;
      g.lineWidth = 4.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(s.hx, s.hy);
      g.stroke();
      g.strokeStyle = '#4a5058';
      g.lineWidth = 2.2;
      g.stroke();
      const st = this.light(s.ix, s.iy, s.axis, t);
      drawSprite(g, this.spr.signal[st], s.hx, s.hy, s.rot + Math.PI / 2);
    }
  }
}

/* ---------- pintura de detalles ---------- */

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

function crack(x, y, rng) {
  const pts = [[x, y]];
  let a = rng() * TAU;
  let px = x;
  let py = y;
  const n = 5 + ((rng() * 6) | 0);
  const branches = [];
  for (let i = 0; i < n; i++) {
    a += rrange(rng, -0.8, 0.8);
    const l = rrange(rng, 6, 16);
    px += Math.cos(a) * l;
    py += Math.sin(a) * l;
    pts.push([px, py]);
    if (rng() < 0.3) branches.push([px, py, a + rrange(rng, -1.4, 1.4), rrange(rng, 8, 20)]);
  }
  return { kind: 'crack', x, y, r: n * 16 + 20, pts, branches };
}

function paintDetail(g, d, T) {
  if (d.kind === 'crack') {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [col, w] of [['rgba(255,255,255,0.06)', 2.6], ['rgba(12,12,14,0.75)', 1.2]]) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(d.pts[0][0], d.pts[0][1]);
      for (const p of d.pts) g.lineTo(p[0], p[1]);
      for (const [bx, by, a, l] of d.branches) {
        g.moveTo(bx, by);
        g.lineTo(bx + Math.cos(a) * l, by + Math.sin(a) * l);
      }
      g.stroke();
    }
  } else if (d.kind === 'stain') {
    g.fillStyle = `rgba(14,14,18,${d.a})`;
    g.beginPath();
    g.ellipse(d.x, d.y, d.rx, d.ry, d.rot, 0, TAU);
    g.fill();
    g.fillStyle = `rgba(14,14,18,${d.a * 0.6})`;
    g.beginPath();
    g.ellipse(d.x + d.rx * 0.5, d.y + d.ry * 0.3, d.rx * 0.5, d.ry * 0.6, d.rot, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(120,90,160,0.06)';
    g.beginPath();
    g.ellipse(d.x - d.rx * 0.2, d.y, d.rx * 0.5, d.ry * 0.4, d.rot, 0, TAU);
    g.fill();
  } else if (d.kind === 'patch') {
    g.save();
    g.translate(d.x, d.y);
    g.rotate(d.rot);
    g.fillStyle = pattern(g, T.asphaltDark);
    g.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
    g.strokeStyle = 'rgba(10,10,12,0.6)';
    g.lineWidth = 1.2;
    g.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h);
    g.restore();
  } else if (d.kind === 'skid') {
    g.save();
    g.translate(d.x, d.y);
    g.rotate(d.rot);
    g.fillStyle = 'rgba(10,10,12,0.22)';
    g.fillRect(-d.len / 2, -10, d.len, 4);
    g.fillRect(-d.len / 2 + 6, 6, d.len - 6, 4);
    g.restore();
  }
}

function paintMark(g, m, spr) {
  if (m.kind === 'line') {
    g.strokeStyle = m.color;
    g.lineWidth = m.w;
    g.lineCap = 'butt';
    if (m.dash) g.setLineDash([24, 26]);
    g.globalAlpha = 0.85;
    g.beginPath();
    g.moveTo(m.x0, m.y0);
    g.lineTo(m.x1, m.y1);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  } else if (m.kind === 'zebra') {
    g.fillStyle = 'rgba(222,218,206,0.86)';
    g.fillRect(m.x, m.y, m.w, m.h);
    g.fillStyle = 'rgba(60,58,54,0.25)';
    g.fillRect(m.x + m.w * 0.3, m.y + m.h * 0.2, m.w * 0.15, m.h * 0.2);
  } else if (m.kind === 'rect') {
    g.fillStyle = m.color;
    g.globalAlpha = 0.85;
    g.fillRect(m.x, m.y, m.w, m.h);
    g.globalAlpha = 1;
  } else if (m.kind === 'drain') {
    drawSprite(g, spr.drain, m.x, m.y, m.rot);
  }
}

function paintFountain(g, f, T) {
  const { x, y, r } = f;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.arc(x + 6, y + 5, r + 4, 0, TAU);
  g.fill();
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = '#a8a296';
  g.fill();
  g.lineWidth = 2.4;
  g.strokeStyle = OUT;
  g.stroke();
  g.beginPath();
  g.arc(x, y, r - 9, 0, TAU);
  const gr = g.createRadialGradient(x - 10, y - 10, 4, x, y, r);
  gr.addColorStop(0, '#5fa0b8');
  gr.addColorStop(1, '#244e62');
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 1.4;
  g.stroke();
  g.strokeStyle = 'rgba(220,245,255,0.35)';
  g.lineWidth = 1.2;
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.arc(x, y, (r - 12) * (i / 4), 0.2 * i, 0.2 * i + 2);
    g.stroke();
  }
  g.beginPath();
  g.arc(x, y, 12, 0, TAU);
  g.fillStyle = '#bfb9ad';
  g.fill();
  g.lineWidth = 1.6;
  g.strokeStyle = OUT;
  g.stroke();
  g.beginPath();
  g.arc(x, y, 5, 0, TAU);
  g.fillStyle = '#cfefff';
  g.fill();
}

function paintStatue(g, x, y) {
  g.fillStyle = 'rgba(0,0,0,0.38)';
  g.fillRect(x - 30 + 14, y - 30 + 12, 60, 60);
  roundRect(g, x - 36, y - 36, 72, 72, 4);
  g.fillStyle = '#8c877d';
  g.fill();
  g.lineWidth = 2.2;
  g.strokeStyle = OUT;
  g.stroke();
  roundRect(g, x - 26, y - 26, 52, 52, 3);
  g.fillStyle = '#a39e93';
  g.fill();
  g.lineWidth = 1.2;
  g.stroke();
  // figura de bronce: un corredor
  g.fillStyle = '#5a6f5a';
  g.strokeStyle = OUT;
  g.lineWidth = 1.4;
  g.beginPath();
  g.ellipse(x - 2, y, 9, 15, 0, 0, TAU);
  g.fill();
  g.stroke();
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(x + s * 10, y + s * 8, 9, 3.4, s * 0.5, 0, TAU);
    g.fill();
    g.stroke();
  }
  g.beginPath();
  g.arc(x + 2, y, 6, 0, TAU);
  g.fillStyle = '#6d846d';
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(200,230,200,0.3)';
  g.beginPath();
  g.ellipse(x - 4, y - 6, 4, 6, 0.5, 0, TAU);
  g.fill();
}

// Atlas de texturas: todos los sprites se pintan una sola vez al arrancar y se empaquetan
// en pocas hojas grandes (2048 px). Dibujar desde una misma hoja es mucho más rápido que
// redibujar figuras cada fotograma. Cualquier sprite puede sustituirse por un PNG pintado a
// mano declarándolo en assets/manifest.json (ver assets/README.md).
import { makeCanvas } from './util.js';

const PAGE = 2048;
const GAP = 3;

export class Atlas {
  constructor() {
    this.pages = [];
    this.sprites = new Map();
    this.newPage();
  }

  newPage() {
    const c = makeCanvas(PAGE, PAGE);
    this.page = { canvas: c, g: c.getContext('2d'), x: GAP, y: GAP, rowH: 0 };
    this.pages.push(this.page);
  }

  // Reserva un hueco de w×h píxeles con un empaquetado por estantes.
  alloc(w, h) {
    let p = this.page;
    if (p.x + w + GAP > PAGE) {
      p.x = GAP;
      p.y += p.rowH + GAP;
      p.rowH = 0;
    }
    if (p.y + h + GAP > PAGE) {
      this.newPage();
      p = this.page;
    }
    const r = { canvas: p.canvas, g: p.g, x: p.x, y: p.y };
    p.x += w + GAP;
    p.rowH = Math.max(p.rowH, h);
    return r;
  }

  // Pinta un sprite de w×h unidades del mundo. `paint(g)` recibe el contexto con el origen
  // en el ancla (por defecto el centro) y escalado, así que dibuja en unidades del mundo.
  add(name, w, h, paint, opt = {}) {
    const scale = opt.scale || 3;
    const ax = opt.ax ?? w / 2;
    const ay = opt.ay ?? h / 2;
    const pw = Math.ceil(w * scale);
    const ph = Math.ceil(h * scale);
    const r = this.alloc(pw, ph);
    const g = r.g;
    g.save();
    g.beginPath();
    g.rect(r.x, r.y, pw, ph);
    g.clip();
    g.setTransform(scale, 0, 0, scale, r.x + ax * scale, r.y + ay * scale);
    paint(g);
    g.restore();
    const spr = { name, img: r.canvas, sx: r.x, sy: r.y, sw: pw, sh: ph, w, h, ax, ay };
    this.sprites.set(name, spr);
    return spr;
  }

  get(name) {
    return this.sprites.get(name);
  }

  // Copia de un sprite ya pintado con un tinte encima (destellos de golpe, siluetas…).
  tinted(name, src, color, alpha = 1) {
    return this.add(name, src.w, src.h, (g) => {
      g.drawImage(src.img, src.sx, src.sy, src.sw, src.sh, -src.ax, -src.ay, src.w, src.h);
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.fillRect(-src.ax, -src.ay, src.w, src.h);
    });
  }

  // Sustituye sprites por PNG externos según assets/manifest.json (opcional).
  async loadOverrides(base) {
    let list;
    try {
      const res = await fetch(base + 'manifest.json', { cache: 'no-cache' });
      if (!res.ok) return 0;
      list = (await res.json()).sprites || {};
    } catch {
      return 0;
    }
    let n = 0;
    await Promise.all(
      Object.entries(list).map(
        ([name, file]) =>
          new Promise((done) => {
            const s = this.sprites.get(name);
            if (!s) return done();
            const img = new Image();
            img.onload = () => {
              const g = s.img.getContext('2d');
              g.clearRect(s.sx, s.sy, s.sw, s.sh);
              g.drawImage(img, s.sx, s.sy, s.sw, s.sh);
              n++;
              done();
            };
            img.onerror = () => done();
            img.src = base + file;
          }),
      ),
    );
    return n;
  }
}

export function drawSprite(g, s, x, y, rot = 0, kx = 1, ky = 1) {
  if (rot === 0 && kx === 1 && ky === 1) {
    g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, x - s.ax, y - s.ay, s.w, s.h);
    return;
  }
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  if (kx !== 1 || ky !== 1) g.scale(kx, ky);
  g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax, -s.ay, s.w, s.h);
  g.restore();
}

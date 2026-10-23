// Iluminación nocturna: una capa de oscuridad (a media resolución) en la que las luces
// recortan huecos, y después brillos aditivos de color (farolas cálidas, faros, sirenas,
// el aura del protagonista). El héroe siempre tiene luz propia para verse bien.
import { makeCanvas, clamp } from './util.js';

export class Lighting {
  constructor(S) {
    this.S = S;
    this.canvas = makeCanvas(2, 2);
    this.g = this.canvas.getContext('2d');
    this.k = 0.5;
  }

  resize(W, H) {
    this.canvas.width = Math.max(2, Math.ceil(W * this.k));
    this.canvas.height = Math.max(2, Math.ceil(H * this.k));
  }

  render(game, base, v) {
    const g = this.g;
    const S = this.S;
    const k = this.k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    const sk = game.sonic.k;
    // ambiente: noche azulada (más profunda en el Sonic Time)
    g.fillStyle = `rgba(${6 - sk * 4 | 0},${10 + sk * 4 | 0},${26 + sk * 20 | 0},${0.6 + sk * 0.08})`;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(base.z * k, 0, 0, base.z * k, base.tx * k, base.ty * k);
    g.globalCompositeOperation = 'destination-out';
    const t = game.worldTime;
    const vis = (x, y, r) => x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1;
    for (const l of game.world.vis.lamps) {
      if (!vis(l.hx, l.hy, l.R)) continue;
      let a = 0.88;
      if (l.flicker) a *= Math.sin(t * 37 + l.ph) > -0.6 ? 1 : 0.15;
      g.globalAlpha = a;
      g.drawImage(S.light, l.hx - l.R, l.hy - l.R, l.R * 2, l.R * 2);
    }
    g.globalAlpha = 0.35;
    for (const s of game.world.vis.signals) {
      if (!vis(s.hx, s.hy, 40)) continue;
      g.drawImage(S.light, s.hx - 40, s.hy - 40, 80, 80);
    }
    for (const c of game.traffic.list) {
      if (c.state === 'parked' || !vis(c.x, c.y, 300)) continue;
      const co = Math.cos(c.ang);
      const si = Math.sin(c.ang);
      if (c.hp > 0) {
        g.globalAlpha = 0.75;
        g.save();
        g.translate(c.x + co * c.L * 0.45, c.y + si * c.L * 0.45);
        g.rotate(c.ang);
        g.drawImage(S.cone, 0, -c.W * 1.6, 260, c.W * 3.2);
        g.restore();
      }
      g.globalAlpha = 0.45;
      g.drawImage(S.light, c.x - co * c.L * 0.5 - 22, c.y - si * c.L * 0.5 - 22, 44, 44);
    }
    for (const f of game.fx.lights) {
      if (!vis(f.x, f.y, f.r)) continue;
      g.globalAlpha = clamp(1 - f.t / f.life, 0, 1);
      g.drawImage(S.light, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }
    for (const fn of game.world.fountains) {
      g.globalAlpha = 0.5;
      g.drawImage(S.light, fn.x - 110, fn.y - 110, 220, 220);
    }
    // luz propia del héroe
    const h = game.hero;
    const hr = 190 + h.hyper * 120;
    g.globalAlpha = 0.92;
    g.drawImage(S.light, h.x - hr, h.y - hr, hr * 2, hr * 2);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  composite(ctx, W, H) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.canvas, 0, 0, W, H);
  }

  // Brillos de color sobre la escena (en coordenadas del mundo).
  glow(g, game, v) {
    const S = this.S;
    const t = game.worldTime;
    const vis = (x, y, r) => x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1;
    g.globalCompositeOperation = 'lighter';
    for (const l of game.world.vis.lamps) {
      const R = l.R * 0.75;
      if (!vis(l.hx, l.hy, R)) continue;
      let a = 0.32;
      if (l.flicker) a *= Math.sin(t * 37 + l.ph) > -0.6 ? 1 : 0.1;
      g.globalAlpha = a;
      g.drawImage(S.warm, l.hx - R, l.hy - R, R * 2, R * 2);
      g.globalAlpha = Math.min(1, a * 2.6);
      g.drawImage(S.white, l.hx - 10, l.hy - 10, 20, 20);
    }
    for (const s of game.world.vis.signals) {
      if (!vis(s.hx, s.hy, 40)) continue;
      const st = game.world.light(s.ix, s.iy, s.axis, t);
      const spr = st === 'g' ? S.cyan : st === 'r' ? S.red : S.orange;
      g.globalAlpha = 0.35;
      g.drawImage(spr, s.hx - 22, s.hy - 22, 44, 44);
    }
    for (const c of game.traffic.list) {
      if (!vis(c.x, c.y, 260)) continue;
      const co = Math.cos(c.ang);
      const si = Math.sin(c.ang);
      if (c.state !== 'parked' && c.hp > 0) {
        // faros
        g.globalAlpha = 0.18;
        g.save();
        g.translate(c.x + co * c.L * 0.45, c.y + si * c.L * 0.45);
        g.rotate(c.ang);
        g.drawImage(S.cone, 0, -c.W * 1.4, 220, c.W * 2.8);
        g.restore();
        g.globalAlpha = 0.9;
        for (const sd of [-1, 1]) {
          const fx = c.x + co * (c.L / 2 - 3) - si * sd * (c.W / 2 - 6.5);
          const fy = c.y + si * (c.L / 2 - 3) + co * sd * (c.W / 2 - 6.5);
          g.drawImage(S.white, fx - 7, fy - 7, 14, 14);
        }
      }
      // luces traseras (más fuertes al frenar)
      const ra = c.state === 'parked' ? 0 : c.brake ? 0.95 : 0.4;
      if (ra > 0) {
        g.globalAlpha = ra;
        for (const sd of [-1, 1]) {
          const bx = c.x - co * (c.L / 2) - si * sd * (c.W / 2 - 6.5);
          const by = c.y - si * (c.L / 2) + co * sd * (c.W / 2 - 6.5);
          g.drawImage(S.red, bx - 9, by - 9, 18, 18);
        }
      }
      // intermitentes de emergencia en los coches destrozados, sirena en patrullas
      if ((c.state === 'wreck' && Math.sin(t * 9) > 0) || c.siren) {
        const blue = c.siren && Math.sin(t * 16) > 0;
        g.globalAlpha = c.siren ? 0.9 : 0.6;
        const spr = c.siren ? (blue ? S.blue : S.red) : S.orange;
        const s = c.siren ? 60 : 18;
        g.drawImage(spr, c.x - s / 2, c.y - s / 2, s, s);
      }
    }
    for (const fn of game.world.fountains) {
      g.globalAlpha = 0.25;
      g.drawImage(S.cyan, fn.x - 70, fn.y - 70, 140, 140);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}

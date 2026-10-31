// Dibujo de la ciudad: convierte los datos que genera sim/world.js (ops, árboles, fuegos, postes) en imágenes.
// El suelo se pinta en trozos con caché LRU; cada op de la lista se pinta con el pintor de su tipo.
import { CHUNK, ROAD_HALF } from '../core/config.ts';
import { mulberry32, rrange, rpick, makeCanvas, roundRect, clamp, TAU, shade } from '../core/util.ts';
import { pat, drawCar, makeTree, OUT } from './sprites.js';

const ROAD_W = ROAD_HALF * 2;

// Un pintor por tipo de op: recibe el lienzo y los datos con que la generó el mundo.
const PAINTERS = {
  addTree(g, { x, y, r }) {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(x + 10, y + 12, r * 0.95, r * 0.85, 0, 0, TAU);
    g.fill();
  },
  addBarrel(g, { x, y, burning }) {
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
  },
  addCar(g, { x, y, ang, len, wid, kind, burnt, color, seed }) {
    return drawCar(g, x, y, ang, len, wid, { kind, burnt, color, seed });
  },
  generate1(g, { S }) {
    g.fillStyle = pat(g, 'rubble');
    g.fillRect(0, 0, S, S);
  },
  generate2(g, { c, S }) {
    g.fillStyle = pat(g, 'asphalt');
    g.fillRect(c - ROAD_HALF, 0, ROAD_W, S);
  },
  generate3(g, { c, S }) {
    g.fillStyle = pat(g, 'asphalt');
    g.fillRect(0, c - ROAD_HALF, S, ROAD_W);
  },
  border(g, { x, y, w, h }) {
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
  },
  spawnProps(g, { bx, by, w, h }) {
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
  },
  block(g, { x, y, w, h }) {
    g.fillStyle = pat(g, 'sidewalk');
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(18,18,16,0.6)';
    g.lineWidth = 4;
    g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    g.strokeStyle = 'rgba(200,195,180,0.18)';
    g.lineWidth = 2;
    g.strokeRect(x + 6, y + 6, w - 12, h - 12);
  },
  wasteland(g, { x, y, w, h }) {
    g.fillStyle = pat(g, 'rubble');
    g.fillRect(x, y, w, h);
  },
  debris(g, { seed, x, y, s }) {
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
  },
  building(g, { x, y, w, h }) {
    g.fillStyle = pat(g, 'concrete');
    g.fillRect(x, y, w, h);
  },
  alley(g, { dx, dw, dy, dh, color, horiz }) {
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
  },
  roof1(g, { x, y, w, h }) {
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.fillRect(x + 12, y + 14, w, h);
  },
  roof2(g, { seed, base, x, y, w, h, hole, sos }) {
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
  },
  park(g, { seed, x, y, w, h, diag }) {
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
  },
  bench(g, { x, y, w, h, vertical }) {
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
  },
  camp1(g, { tx, ty, ang, color }) {
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
  },
  camp2(g, { x, y }) {
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
  },
  plaza1(g, { seed, x, y, w, h }) {
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
  },
  plaza2(g, { cx, cy }) {
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
  },
  plaza3(g, { px, py }) {
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(px - 26, py - 24, 64, 64);
    g.fillStyle = '#8a857a';
    g.fillRect(px - 32, py - 32, 64, 64);
    g.strokeStyle = OUT;
    g.lineWidth = 2;
    g.strokeRect(px - 32, py - 32, 64, 64);
    g.fillStyle = '#3e3326';
    g.fillRect(px - 25, py - 25, 50, 50);
  },
  parking(g, { x, y, w, h, horiz }) {
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
  },
  roadSegment1(g, { seed, bx, by, bw, bh, a, b, c, vertical }) {
    const R = (u0, v0, lu, lv) => (vertical ? [c + v0, u0, lv, lu] : [u0, c + v0, lu, lv]);
    const P = (u, v) => (vertical ? [c + v, u] : [u, c + v]);
    const L = b - a;
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
  },
  roadSegment2(g, { rx, ry, rw, rh }) {
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
  },
  roadSegment3(g, { tx, ty, red }) {
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
  },
  intersection(g, { seed, cx, cy, S }) {
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
  },
};

// Lo que queda de un árbol o coche que destrozó un rocoso (se pinta en lugar de la op).
const WRECKS = {
  addTree(g, { x, y, r }) {
    const rng = mulberry32(Math.round(x * 7 + y * 13));
    // hojas y ramas regadas alrededor del tocón
    for (let i = 0; i < 14; i++) {
      const a = rng() * TAU;
      const d = rrange(rng, 4, r * 0.9);
      g.fillStyle = rpick(rng, ['#34432a', '#3e4f2e', '#2c3824', '#4a3c2e']);
      g.beginPath();
      g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, rrange(rng, 2, 4.5), rrange(rng, 1.2, 2.4), a, 0, TAU);
      g.fill();
    }
    g.strokeStyle = '#4a3a2a';
    g.lineCap = 'round';
    g.lineWidth = 2.2;
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = rng() * TAU;
      const d = rrange(rng, 8, r * 0.8);
      g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      g.lineTo(x + Math.cos(a) * (d + 9), y + Math.sin(a) * (d + 9) + rrange(rng, -3, 3));
    }
    g.stroke();
    // tocón astillado
    g.fillStyle = '#5a4430';
    g.beginPath();
    g.arc(x, y, 8, 0, TAU);
    g.fill();
    g.lineWidth = 1.6;
    g.strokeStyle = OUT;
    g.stroke();
    g.fillStyle = '#8a6e4a';
    g.beginPath();
    g.arc(x, y, 5, 0, TAU);
    g.fill();
  },
  addCar(g, { x, y, ang, len, wid, color, seed }) {
    const rng = mulberry32(seed);
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    // mancha de aceite y la carrocería aplastada en pedazos
    g.fillStyle = 'rgba(12,12,12,0.45)';
    g.beginPath();
    g.ellipse(0, 0, len * 0.45, wid * 0.55, 0, 0, TAU);
    g.fill();
    for (let i = 0; i < 9; i++) {
      const px = rrange(rng, -len * 0.45, len * 0.45);
      const py = rrange(rng, -wid * 0.45, wid * 0.45);
      g.save();
      g.translate(px, py);
      g.rotate(rng() * TAU);
      const w = rrange(rng, 6, 16);
      const h = rrange(rng, 4, 9);
      g.fillStyle = rng() < 0.6 ? shade(color, rrange(rng, 0.55, 0.9)) : '#3a3c3f';
      g.fillRect(-w / 2, -h / 2, w, h);
      g.lineWidth = 1.2;
      g.strokeStyle = OUT;
      g.strokeRect(-w / 2, -h / 2, w, h);
      g.restore();
    }
    // llantas sueltas y vidrios
    for (const [px, py] of [
      [-len * 0.32, -wid * 0.55],
      [len * 0.3, wid * 0.5],
    ]) {
      g.fillStyle = '#1c1c1c';
      g.beginPath();
      g.arc(px, py, 6, 0, TAU);
      g.fill();
      g.fillStyle = '#5a5a5a';
      g.beginPath();
      g.arc(px, py, 2.5, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(190,220,215,0.7)';
    for (let i = 0; i < 16; i++)
      g.fillRect(rrange(rng, -len * 0.5, len * 0.5), rrange(rng, -wid * 0.6, wid * 0.6), 1.6, 1.6);
    g.restore();
  },
};

// Estado de dibujo de un mundo: índice de ops por trozo y caché de trozos ya pintados.
class WorldView {
  constructor(world) {
    this.world = world;
    this.scale = 1.25;
    this.maxChunks = 30;
    this.cache = new Map();
    this.pool = [];
    const n = Math.ceil(world.size / CHUNK);
    this.n = n;
    this.chunkOps = Array.from({ length: n * n }, () => []);
    // cuántos destrozos del mundo ya se repintaron
    this.smashSeen = 0;
    for (const op of world.ops) {
      const x0 = clamp(Math.floor(op.x / CHUNK), 0, n - 1);
      const y0 = clamp(Math.floor(op.y / CHUNK), 0, n - 1);
      const x1 = clamp(Math.floor((op.x + op.w) / CHUNK), 0, n - 1);
      const y1 = clamp(Math.floor((op.y + op.h) / CHUNK), 0, n - 1);
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) this.chunkOps[j * n + i].push(op);
    }
  }

  getChunk(i, j) {
    const key = j * this.n + i;
    let c = this.cache.get(key);
    if (c) {
      this.cache.delete(key);
      this.cache.set(key, c);
      return c;
    }
    const px = Math.ceil(CHUNK * this.scale);
    c = this.pool.pop() || makeCanvas(px, px);
    if (c.width !== px) {
      c.width = px;
      c.height = px;
    }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    const s = this.scale;
    g.setTransform(s, 0, 0, s, -i * CHUNK * s, -j * CHUNK * s);
    for (const op of this.chunkOps[key]) {
      g.save();
      if (!op.gone) PAINTERS[op.kind](g, op.p);
      else WRECKS[op.kind]?.(g, op.p);
      g.restore();
    }
    this.cache.set(key, c);
    while (this.cache.size > this.maxChunks) {
      const oldest = this.cache.keys().next().value;
      this.pool.push(this.cache.get(oldest));
      this.cache.delete(oldest);
    }
    return c;
  }
}

const views = new WeakMap();
function viewOf(world) {
  let v = views.get(world);
  if (!v) {
    v = new WorldView(world);
    views.set(world, v);
  }
  return v;
}

// Resolución de los trozos de suelo (según el zoom y la pantalla) y cuántos se guardan.
export function setChunkView(world, scale, maxChunks) {
  const v = viewOf(world);
  v.maxChunks = maxChunks;
  const s = clamp(Math.round(scale * 4) / 4, 0.75, 2);
  if (s === v.scale) return;
  v.scale = s;
  v.cache.clear();
  v.pool.length = 0;
}

// Repinta los trozos donde un rocoso destrozó algo desde la última vez.
function refreshSmashed(v, world) {
  const list = world.smashed;
  for (; v.smashSeen < list.length; v.smashSeen++) {
    const o = world.obstacles[list[v.smashSeen]];
    const op = o?.op;
    if (!op) continue;
    const n = v.n;
    const x0 = clamp(Math.floor(op.x / CHUNK), 0, n - 1);
    const y0 = clamp(Math.floor(op.y / CHUNK), 0, n - 1);
    const x1 = clamp(Math.floor((op.x + op.w) / CHUNK), 0, n - 1);
    const y1 = clamp(Math.floor((op.y + op.h) / CHUNK), 0, n - 1);
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const c = v.cache.get(j * n + i);
        if (!c) continue;
        v.cache.delete(j * n + i);
        v.pool.push(c);
      }
    }
  }
}

export function drawGround(ctx, world, x0, y0, x1, y1) {
  const v = viewOf(world);
  if (v.smashSeen < world.smashed.length) refreshSmashed(v, world);
  const n = v.n;
  const i0 = clamp(Math.floor(x0 / CHUNK), 0, n - 1);
  const j0 = clamp(Math.floor(y0 / CHUNK), 0, n - 1);
  const i1 = clamp(Math.floor(x1 / CHUNK), 0, n - 1);
  const j1 = clamp(Math.floor(y1 / CHUNK), 0, n - 1);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      ctx.drawImage(v.getChunk(i, j), i * CHUNK, j * CHUNK, CHUNK + 0.75, CHUNK + 0.75);
    }
  }
}

// Imagen del árbol (se pinta la primera vez que se necesita).
function treeImage(t) {
  if (!t.img) t.img = makeTree(t.seed, t.r, t.dead);
  return t.img;
}

function drawFlame(ctx, f, time) {
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
export function drawOverhead(ctx, world, x0, y0, x1, y1, player, time) {
  for (const f of world.fires) {
    if (f.x < x0 - 40 || f.x > x1 + 40 || f.y < y0 - 40 || f.y > y1 + 40) continue;
    drawFlame(ctx, f, time);
  }
  for (const t of world.trees) {
    if (t.gone) continue;
    if (t.x + t.size < x0 || t.x - t.size > x1 || t.y + t.size < y0 || t.y - t.size > y1) continue;
    const near = Math.hypot(player.x - t.x, player.y - t.y) < t.r + 10;
    ctx.globalAlpha = near ? 0.45 : 0.95;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.ang + Math.sin(time * 0.8 + t.ang) * 0.02);
    ctx.drawImage(treeImage(t), -t.size / 2, -t.size / 2, t.size, t.size);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  for (const o of world.overhead) {
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

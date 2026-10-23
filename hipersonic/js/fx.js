// Partículas, marcas en el suelo y ondas de choque.
// Cada partícula avanza con el tiempo del mundo (se congela en el Sonic Time) salvo las
// marcadas `real`, que pertenecen al protagonista y siguen moviéndose.
import { TAU, rand, pick } from './util.js';
import { OUT } from './art/characters.js';

const MAX = 1400;

export class Fx {
  constructor(sprites) {
    this.S = sprites;
    this.list = [];
    this.decals = [];
    this.waves = [];
    this.lights = [];
  }

  add(p) {
    if (this.list.length >= MAX) this.list.shift();
    p.t = 0;
    p.vz = p.vz || 0;
    p.z = p.z || 0;
    this.list.push(p);
    return p;
  }

  /* ---------- emisores ---------- */

  sparks(x, y, dx, dy, n, color = '255,210,120', speed = 420, real = false) {
    const a0 = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = a0 + rand(-0.9, 0.9);
      const s = speed * rand(0.35, 1.1);
      this.add({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.18, 0.45), w: rand(1, 2.2), color, real, drag: 3 });
    }
  }
  energy(x, y, vx, vy, n = 1, real = true) {
    for (let i = 0; i < n; i++) {
      this.add({ k: 'energy', x: x + rand(-6, 6), y: y + rand(-6, 6), vx: vx + rand(-60, 60), vy: vy + rand(-60, 60), life: rand(0.25, 0.6), size: rand(2, 5), real, drag: 4 });
    }
  }
  arc(x, y, r, real = true) {
    const pts = [];
    const a = rand(0, TAU);
    const a2 = a + rand(1, 2.6);
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const aa = a + (a2 - a) * t;
      const rr = r * rand(0.7, 1.25);
      pts.push(Math.cos(aa) * rr, Math.sin(aa) * rr);
    }
    this.add({ k: 'arc', x, y, vx: 0, vy: 0, pts, life: rand(0.05, 0.12), real });
  }
  dust(x, y, n, size = 10, color = '150,140,125', speed = 60) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.2, 1) * speed;
      this.add({ k: 'dust', x: x + rand(-4, 4), y: y + rand(-4, 4), vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1.1), size: size * rand(0.6, 1.3), color, drag: 2.5 });
    }
  }
  smoke(x, y, size = 14, dark = 0.5) {
    this.add({ k: 'dust', x, y, vx: rand(-10, 10) + 14, vy: rand(-18, -4) + 10, life: rand(1.2, 2.2), size, color: dark > 0.5 ? '40,40,44' : '170,170,175', drag: 0.6, grow: 1.6, alpha: 0.4 });
  }
  debris(x, y, dx, dy, n, kind = 'concrete', speed = 300) {
    const cols = { concrete: ['#8e8b84', '#6d6a63', '#a6a39c'], glass: ['#bfe4f2', '#8fc4dc', '#e0f6ff'], metal: ['#7a8288', '#5a6066', '#a0a8ae'], paint: ['#c75f43', '#3f566b', '#8a2f2a'], paper: ['#e8e2d4', '#d8d0bc'] }[kind] || ['#8e8b84'];
    const a0 = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = a0 + rand(-1.1, 1.1);
      const s = speed * rand(0.3, 1);
      this.add({ k: 'debris', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(120, 360), life: rand(0.8, 1.6), size: rand(1.6, 3.6) * (kind === 'glass' ? 0.8 : 1), color: pick(cols), rot: rand(0, TAU), vr: rand(-14, 14), drag: 0.8 });
    }
  }
  flash(x, y, size = 60, real = false, color = 'white') {
    this.add({ k: 'flash', x, y, vx: 0, vy: 0, life: 0.18, size, real, color });
    this.light(x, y, size * 3, 0.16, real);
  }
  ring(x, y, r0, r1, life = 0.4, color = '170,240,255', w = 6, real = false) {
    this.add({ k: 'ring', x, y, vx: 0, vy: 0, r0, r1, life, color, w, real });
  }
  stars(x, y) {
    return this.add({ k: 'stars', x, y, vx: 0, vy: 0, life: 1e9 });
  }
  light(x, y, r, life, real = false) {
    this.lights.push({ x, y, r, life, t: 0, real });
  }

  // Onda de choque con distorsión de la imagen (se dibuja en el posprocesado).
  wave(x, y, speed = 900, life = 0.55, strength = 0.06, real = true) {
    this.waves.push({ x, y, speed, life, strength, t: 0, real });
  }

  decal(d) {
    if (this.decals.length > 220) this.decals.shift();
    d.t = 0;
    this.decals.push(d);
  }
  scorch(x, y, ang, len, real = true) {
    this.decal({ k: 'scorch', x, y, ang, len, life: 3.5, real });
  }
  crater(x, y, r) {
    const pts = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.3, 0.3);
      pts.push([a, r * rand(0.9, 2.2)]);
    }
    this.decal({ k: 'crater', x, y, r, pts, life: 40 });
  }
  wallCrack(x, y, nx, ny) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.atan2(ny, nx) + Math.PI + rand(-1.2, 1.2);
      const l = rand(10, 26);
      pts.push([Math.cos(a) * l, Math.sin(a) * l, Math.cos(a + rand(-0.6, 0.6)) * l * 1.6, Math.sin(a + rand(-0.6, 0.6)) * l * 1.6]);
    }
    this.decal({ k: 'crack', x, y, pts, life: 60 });
  }

  /* ---------- actualización ---------- */

  update(dtWorld, dtReal) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      const dt = p.real ? dtReal : dtWorld;
      p.t += dt;
      if (p.t < p.life) {
        if (dt > 0) {
          const d = Math.exp(-(p.drag || 0) * dt);
          p.vx *= d;
          p.vy *= d;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.k === 'debris') {
            p.vz -= 900 * dt;
            p.z += p.vz * dt;
            p.rot += p.vr * dt;
            if (p.z < 0) {
              p.z = 0;
              p.vz *= -0.35;
              p.vx *= 0.6;
              p.vy *= 0.6;
              p.vr *= 0.5;
            }
          }
        }
        L[w++] = p;
      }
    }
    L.length = w;
    for (const arr of [this.waves, this.lights, this.decals]) {
      let k = 0;
      for (const o of arr) {
        o.t += o.real ? dtReal : dtWorld;
        if (o.t < o.life) arr[k++] = o;
      }
      arr.length = k;
    }
  }

  /* ---------- dibujo ---------- */

  drawDecals(g, v) {
    for (const d of this.decals) {
      if (d.x < v.x0 - 120 || d.x > v.x1 + 120 || d.y < v.y0 - 120 || d.y > v.y1 + 120) continue;
      const a = Math.min(1, (d.life - d.t) / 1.2);
      if (d.k === 'scorch') {
        g.save();
        g.translate(d.x, d.y);
        g.rotate(d.ang);
        g.globalAlpha = a * 0.28;
        g.fillStyle = '#0c0e14';
        g.fillRect(-d.len, -1.3, d.len, 2.6);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a * Math.max(0, 1 - d.t * 1.6) * 0.7;
        g.fillStyle = '#3ad8ff';
        g.fillRect(-d.len, -0.7, d.len, 1.4);
        g.restore();
      } else if (d.k === 'crater') {
        g.globalAlpha = a;
        g.fillStyle = 'rgba(10,10,12,0.55)';
        g.beginPath();
        g.arc(d.x, d.y, d.r, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(10,10,12,0.8)';
        g.lineWidth = 1.4;
        g.beginPath();
        for (const [ang, l] of d.pts) {
          g.moveTo(d.x + Math.cos(ang) * d.r * 0.6, d.y + Math.sin(ang) * d.r * 0.6);
          g.lineTo(d.x + Math.cos(ang) * l, d.y + Math.sin(ang) * l);
        }
        g.stroke();
        g.globalAlpha = 1;
      } else if (d.k === 'crack') {
        g.globalAlpha = a;
        g.strokeStyle = 'rgba(12,12,14,0.85)';
        g.lineWidth = 1.5;
        g.beginPath();
        for (const [x1, y1, x2, y2] of d.pts) {
          g.moveTo(d.x, d.y);
          g.lineTo(d.x + x1, d.y + y1);
          g.lineTo(d.x + x2, d.y + y2);
        }
        g.stroke();
        g.globalAlpha = 1;
      }
    }
    g.globalAlpha = 1;
  }

  // Capa normal (polvo, escombros): antes de la iluminación.
  drawNormal(g, v) {
    for (const p of this.list) {
      if (p.x < v.x0 - 40 || p.x > v.x1 + 40 || p.y < v.y0 - 40 || p.y > v.y1 + 40) continue;
      const u = p.t / p.life;
      if (p.k === 'dust') {
        const s = p.size * (1 + u * (p.grow || 1.2));
        g.globalAlpha = (p.alpha || 0.5) * (1 - u);
        g.fillStyle = `rgb(${p.color})`;
        g.beginPath();
        g.arc(p.x, p.y, s, 0, TAU);
        g.fill();
      } else if (p.k === 'debris') {
        g.globalAlpha = Math.min(1, (1 - u) * 3);
        g.save();
        g.translate(p.x, p.y - p.z * 0.4);
        g.rotate(p.rot);
        g.fillStyle = p.color;
        g.strokeStyle = OUT;
        g.lineWidth = 0.7;
        g.beginPath();
        g.moveTo(-p.size, -p.size * 0.6);
        g.lineTo(p.size, -p.size * 0.3);
        g.lineTo(p.size * 0.4, p.size * 0.7);
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
      }
    }
    g.globalAlpha = 1;
  }

  // Capa aditiva (chispas, energía, destellos, anillos): después de la iluminación.
  drawGlow(g, v, time) {
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (const p of this.list) {
      if (p.x < v.x0 - 80 || p.x > v.x1 + 80 || p.y < v.y0 - 80 || p.y > v.y1 + 80) continue;
      const u = p.t / p.life;
      if (p.k === 'spark') {
        g.strokeStyle = `rgba(${p.color},${1 - u})`;
        g.lineWidth = p.w;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        g.stroke();
      } else if (p.k === 'energy') {
        g.globalAlpha = 1 - u;
        const s = p.size * (1 - u * 0.5);
        g.drawImage(this.S.cyan, p.x - s * 2, p.y - s * 2, s * 4, s * 4);
        g.globalAlpha = 1;
      } else if (p.k === 'arc') {
        for (const [col, w] of [['rgba(60,200,255,0.5)', 4], ['rgba(230,255,255,0.95)', 1.4]]) {
          g.strokeStyle = col;
          g.lineWidth = w;
          g.beginPath();
          for (let i = 0; i < p.pts.length; i += 2) g.lineTo(p.x + p.pts[i], p.y + p.pts[i + 1]);
          g.stroke();
        }
      } else if (p.k === 'flash') {
        const s = p.size * (0.6 + u * 0.8);
        g.globalAlpha = 1 - u;
        g.drawImage(p.color === 'warm' ? this.S.orange : this.S.star, p.x - s, p.y - s, s * 2, s * 2);
        g.globalAlpha = 1;
      } else if (p.k === 'ring') {
        const r = p.r0 + (p.r1 - p.r0) * (1 - (1 - u) * (1 - u));
        g.strokeStyle = `rgba(${p.color},${(1 - u) * 0.85})`;
        g.lineWidth = p.w * (1 - u * 0.6);
        g.beginPath();
        g.arc(p.x, p.y, r, 0, TAU);
        g.stroke();
      } else if (p.k === 'stars') {
        // estrellitas girando sobre los noqueados
        for (let i = 0; i < 3; i++) {
          const a = time * 3 + (i / 3) * TAU;
          const x = p.x + Math.cos(a) * 11;
          const y = p.y + Math.sin(a) * 5 - 6;
          g.globalAlpha = 0.9;
          g.drawImage(this.S.white, x - 5, y - 5, 10, 10);
          g.fillStyle = '#ffe680';
          g.beginPath();
          for (let k = 0; k < 10; k++) {
            const aa = (k / 10) * TAU + time * 2;
            const d = k % 2 ? 1.2 : 3;
            g.lineTo(x + Math.cos(aa) * d, y + Math.sin(aa) * d);
          }
          g.fill();
        }
        g.globalAlpha = 1;
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
}

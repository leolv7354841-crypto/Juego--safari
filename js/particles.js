import { rand, TAU, pick } from './util.js';

// Tipos de partícula
const DOT = 0;
const SMOKE = 1;
const SPARK = 2;
const CASING = 3;
const EMBER = 4;
const RING = 5;

export class Particles {
  constructor(max = 1000) {
    this.max = max;
    this.p = Array.from({ length: max }, () => ({ life: 0 }));
    this.idx = 0;
  }

  clear() {
    for (const q of this.p) q.life = 0;
  }

  add(type, x, y, vx, vy, life, size, color, drag = 4, grow = 0) {
    const q = this.p[this.idx];
    this.idx = (this.idx + 1) % this.max;
    q.type = type;
    q.x = x;
    q.y = y;
    q.vx = vx;
    q.vy = vy;
    q.life = life;
    q.max = life;
    q.size = size;
    q.color = color;
    q.drag = drag;
    q.grow = grow;
    q.rot = rand(0, TAU);
    q.vr = rand(-12, 12);
  }

  casing(x, y, a) {
    const s = rand(70, 120);
    const aa = a + rand(-0.3, 0.3);
    this.add(CASING, x, y, Math.cos(aa) * s, Math.sin(aa) * s, 2.5, 1, '#c9a54a', 5);
  }

  muzzleSmoke(x, y, a) {
    for (let i = 0; i < 2; i++) {
      const s = rand(20, 50);
      const aa = a + rand(-0.4, 0.4);
      this.add(SMOKE, x, y, Math.cos(aa) * s, Math.sin(aa) * s, rand(0.4, 0.7), rand(3, 5), '150,145,135', 3, 14);
    }
    for (let i = 0; i < 3; i++) {
      const s = rand(150, 320);
      const aa = a + rand(-0.35, 0.35);
      this.add(SPARK, x, y, Math.cos(aa) * s, Math.sin(aa) * s, rand(0.06, 0.12), 1, '#ffd890', 8);
    }
  }

  impact(x, y, dx, dy) {
    for (let i = 0; i < 4; i++) {
      const a = Math.atan2(-dy, -dx) + rand(-1, 1);
      const s = rand(60, 200);
      this.add(SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.08, 0.18), 1, '#f3d79a', 8);
    }
    this.add(SMOKE, x, y, -dx * 20, -dy * 20, 0.5, 3, '120,115,105', 3, 16);
  }

  // Impacto sobre un zombi: salpicadura oscura y polvo, sin gore explícito.
  hit(x, y, dx, dy, big) {
    const n = big ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dy, dx) + rand(-0.7, 0.7);
      const s = rand(40, 150);
      this.add(DOT, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.25, 0.5), rand(1.2, 2.6), pick(['#3a4a2c', '#2b3322', '#4b4a32']), 6);
    }
    this.add(SMOKE, x, y, dx * 30, dy * 30, 0.35, 3, '110,115,90', 4, 12);
  }

  death(x, y, r) {
    for (let i = 0; i < 10 + r * 0.5; i++) {
      const a = rand(0, TAU);
      const s = rand(30, 110);
      this.add(DOT, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.7), rand(1.5, 3), pick(['#3a4a2c', '#2b3322', '#55503e']), 5);
    }
    for (let i = 0; i < 3 + r * 0.1; i++) {
      this.add(SMOKE, x + rand(-r, r) * 0.5, y + rand(-r, r) * 0.5, rand(-20, 20), rand(-20, 20), rand(0.6, 1), r * 0.3, '95,90,78', 2, r * 0.8);
    }
  }

  dust(x, y, r) {
    for (let i = 0; i < 6; i++) {
      const a = rand(0, TAU);
      this.add(SMOKE, x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, Math.cos(a) * 40, Math.sin(a) * 40, rand(0.5, 0.9), r * 0.2, '110,100,85', 3, r * 0.6);
    }
  }

  ring(x, y, r, color = '200,190,170') {
    this.add(RING, x, y, 0, 0, 0.45, r * 0.4, color, 0, r * 3);
  }

  ember(x, y, s = 1) {
    this.add(EMBER, x + rand(-8, 8) * s, y + rand(-8, 8) * s, rand(-12, 12), rand(-40, -15), rand(0.6, 1.4), rand(1, 2.2), pick(['#f0a050', '#e07a30', '#ffcf80']), 0.5);
    if (Math.random() < 0.35) {
      this.add(SMOKE, x + rand(-6, 6), y + rand(-6, 6), rand(-8, 8), rand(-30, -10), rand(1.2, 2.2), 6 * s, '60,58,55', 0.5, 22 * s);
    }
  }

  explosion(x, y, R) {
    this.ring(x, y, R * 0.55, '255,190,120');
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU);
      const s = rand(150, 520);
      this.add(SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.12, 0.3), 1, pick(['#ffd890', '#ffb060', '#fff2d0']), 5);
    }
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      const s = rand(30, 140);
      this.add(SMOKE, x + Math.cos(a) * 10, y + Math.sin(a) * 10, Math.cos(a) * s, Math.sin(a) * s, rand(0.8, 1.6), rand(10, 20), i < 5 ? '230,140,60' : '70,66,60', 2.5, 40);
    }
    for (let i = 0; i < 18; i++) {
      const a = rand(0, TAU);
      const s = rand(80, 260);
      this.add(DOT, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.4, 0.9), rand(2, 4), pick(['#3a352d', '#55503e', '#2a2722']), 4);
    }
  }

  pickupFx(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      this.add(SPARK, x, y, Math.cos(a) * 120, Math.sin(a) * 120, 0.2, 1, color, 6);
    }
  }

  update(dt) {
    for (const q of this.p) {
      if (q.life <= 0) continue;
      q.life -= dt;
      const d = Math.exp(-q.drag * dt);
      q.vx *= d;
      q.vy *= d;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.size += q.grow * dt;
      q.rot += q.vr * dt * (Math.abs(q.vx) + Math.abs(q.vy) > 5 ? 1 : 0);
    }
  }

  draw(ctx, view) {
    for (const q of this.p) {
      if (q.life <= 0) continue;
      if (q.x < view.x0 - 40 || q.x > view.x1 + 40 || q.y < view.y0 - 40 || q.y > view.y1 + 40) continue;
      const t = q.life / q.max;
      switch (q.type) {
        case DOT:
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.fillStyle = q.color;
          ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
          break;
        case SMOKE:
          ctx.globalAlpha = 1;
          ctx.fillStyle = `rgba(${q.color},${0.3 * t})`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.size, 0, TAU);
          ctx.fill();
          break;
        case SPARK: {
          ctx.globalAlpha = Math.min(1, t * 3);
          ctx.strokeStyle = q.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(q.x, q.y);
          ctx.lineTo(q.x - q.vx * 0.025, q.y - q.vy * 0.025);
          ctx.stroke();
          break;
        }
        case CASING:
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.fillStyle = q.color;
          ctx.fillRect(-2, -1, 4, 2);
          ctx.restore();
          break;
        case EMBER:
          ctx.globalAlpha = t * (0.6 + Math.random() * 0.4);
          ctx.fillStyle = q.color;
          ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
          break;
        case RING:
          ctx.globalAlpha = t * 0.6;
          ctx.strokeStyle = `rgb(${q.color})`;
          ctx.lineWidth = 3 * t + 1;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.size, 0, TAU);
          ctx.stroke();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
}

// Restos en el suelo: cuerpos abatidos y manchas que se desvanecen.
export class Decals {
  constructor(max = 140) {
    this.max = max;
    this.list = [];
  }
  clear() {
    this.list.length = 0;
  }
  corpse(z) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ img: z.spr.dead, x: z.x, y: z.y, a: z.angle + rand(-0.4, 0.4), half: z.spr.half, t: 0, life: z.type === 'giant' ? 40 : 18 });
  }
  update(dt) {
    for (const d of this.list) d.t += dt;
    while (this.list.length && this.list[0].t > this.list[0].life) this.list.shift();
  }
  draw(ctx, view) {
    for (const d of this.list) {
      if (d.x + d.half < view.x0 || d.x - d.half > view.x1 || d.y + d.half < view.y0 || d.y - d.half > view.y1) continue;
      const fadeIn = Math.min(1, d.t * 3);
      const fadeOut = Math.min(1, (d.life - d.t) / 3);
      ctx.globalAlpha = 0.85 * fadeIn * fadeOut;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a);
      ctx.scale(1, 0.92);
      ctx.drawImage(d.img, -d.half, -d.half, d.half * 2, d.half * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

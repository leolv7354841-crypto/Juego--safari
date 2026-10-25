// @ts-nocheck — pendiente de tipar (Etapa 3: checkJs ya cubre el resto de js/)
import { rand, TAU, pick } from '../core/util.js';
import { zombieSprite } from './zombies.js';

const BLOOD = ['#8a1f1a', '#6e1714', '#a3281f', '#5a1210'];

// Tipos de partícula
const DOT = 0;
const SMOKE = 1;
const SPARK = 2;
const CASING = 3;
const EMBER = 4;
const RING = 5;
const FIREBALL = 6;
const CHUNK = 7;

// Bola de fuego (se dibuja aditiva y crece mientras se apaga).
let FIRE = null;
function fireSprite() {
  if (FIRE) return FIRE;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,230,1)');
  gr.addColorStop(0.25, 'rgba(255,220,120,0.95)');
  gr.addColorStop(0.55, 'rgba(255,130,40,0.75)');
  gr.addColorStop(0.8, 'rgba(200,60,20,0.35)');
  gr.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  FIRE = c;
  return c;
}

export class Particles {
  constructor(max = 1000) {
    this.max = max;
    this.p = Array.from({ length: max }, () => ({ life: 0 }));
    this.idx = 0;
  }

  clear() {
    for (const q of this.p) q.life = 0;
  }

  add(type, x, y, vx, vy, life, size, color, drag = 4, grow = 0, delay = 0) {
    const q = this.p[this.idx];
    q.delay = delay;
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

  // Impacto sobre un zombi: salpicadura de sangre estilizada en la dirección de la bala.
  hit(x, y, dx, dy, big) {
    const n = big ? 7 : 5;
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = base + rand(-0.6, 0.6);
      const s = rand(60, 190);
      this.add(DOT, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.25, 0.5), rand(1.6, 3.2), pick(BLOOD), 6);
    }
    this.add(SMOKE, x, y, dx * 30, dy * 30, 0.3, 2.5, '120,30,28', 4, 10);
  }

  death(x, y, r) {
    for (let i = 0; i < 10 + r * 0.5; i++) {
      const a = rand(0, TAU);
      const s = rand(30, 110);
      this.add(
        DOT,
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        rand(0.3, 0.7),
        rand(1.5, 3),
        pick(i % 3 ? BLOOD : ['#3a4a2c', '#55503e']),
        5,
      );
    }
    for (let i = 0; i < 3 + r * 0.1; i++) {
      this.add(
        SMOKE,
        x + rand(-r, r) * 0.5,
        y + rand(-r, r) * 0.5,
        rand(-20, 20),
        rand(-20, 20),
        rand(0.6, 1),
        r * 0.3,
        '95,90,78',
        2,
        r * 0.8,
      );
    }
  }

  dust(x, y, r) {
    for (let i = 0; i < 6; i++) {
      const a = rand(0, TAU);
      this.add(
        SMOKE,
        x + Math.cos(a) * r * 0.4,
        y + Math.sin(a) * r * 0.4,
        Math.cos(a) * 40,
        Math.sin(a) * 40,
        rand(0.5, 0.9),
        r * 0.2,
        '110,100,85',
        3,
        r * 0.6,
      );
    }
  }

  ring(x, y, r, color = '200,190,170') {
    this.add(RING, x, y, 0, 0, 0.45, r * 0.4, color, 0, r * 3);
  }

  ember(x, y, s = 1) {
    this.add(
      EMBER,
      x + rand(-8, 8) * s,
      y + rand(-8, 8) * s,
      rand(-12, 12),
      rand(-40, -15),
      rand(0.6, 1.4),
      rand(1, 2.2),
      pick(['#f0a050', '#e07a30', '#ffcf80']),
      0.5,
    );
    if (Math.random() < 0.35) {
      this.add(
        SMOKE,
        x + rand(-6, 6),
        y + rand(-6, 6),
        rand(-8, 8),
        rand(-30, -10),
        rand(1.2, 2.2),
        6 * s,
        '60,58,55',
        0.5,
        22 * s,
      );
    }
  }

  explosion(x, y, R) {
    this.ring(x, y, R * 0.55, '255,190,120');
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU);
      const s = rand(150, 520);
      this.add(
        SPARK,
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        rand(0.12, 0.3),
        1,
        pick(['#ffd890', '#ffb060', '#fff2d0']),
        5,
      );
    }
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      const s = rand(30, 140);
      this.add(
        SMOKE,
        x + Math.cos(a) * 10,
        y + Math.sin(a) * 10,
        Math.cos(a) * s,
        Math.sin(a) * s,
        rand(0.8, 1.6),
        rand(10, 20),
        i < 5 ? '230,140,60' : '70,66,60',
        2.5,
        40,
      );
    }
    for (let i = 0; i < 18; i++) {
      const a = rand(0, TAU);
      const s = rand(80, 260);
      this.add(
        DOT,
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        rand(0.4, 0.9),
        rand(2, 4),
        pick(['#3a352d', '#55503e', '#2a2722']),
        4,
      );
    }
  }

  // reventón verde del gordo: chorros de ácido y vapor
  acidBurst(x, y, R) {
    this.ring(x, y, R * 0.6, '150,230,70');
    for (let i = 0; i < 40; i++) {
      const a = rand(0, TAU);
      const s = rand(90, 420);
      this.add(
        DOT,
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        rand(0.3, 0.7),
        rand(2, 5),
        pick(['#8fd13a', '#6fae22', '#c4f060', '#4f8a1c']),
        4,
      );
    }
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU);
      const s = rand(20, 90);
      this.add(
        SMOKE,
        x + Math.cos(a) * 8,
        y + Math.sin(a) * 8,
        Math.cos(a) * s,
        Math.sin(a) * s,
        rand(0.9, 1.8),
        rand(10, 18),
        i < 6 ? '130,200,60' : '80,110,50',
        2.5,
        34,
      );
    }
  }

  // zombi en llamas: brasas que suben y humo negro
  burning(x, y, r) {
    this.add(
      EMBER,
      x + rand(-r, r) * 0.6,
      y + rand(-r, r) * 0.6,
      rand(-15, 15),
      rand(-70, -30),
      rand(0.4, 0.8),
      rand(1.2, 2.4),
      pick(['#ffb050', '#ff7a20', '#ffe08a']),
      0.5,
    );
    if (Math.random() < 0.45)
      this.add(
        SMOKE,
        x + rand(-4, 4),
        y + rand(-4, 4),
        rand(-10, 10),
        rand(-40, -18),
        rand(0.8, 1.4),
        r * 0.35,
        '35,30,26',
        0.6,
        r * 1.4,
      );
  }

  // impacto del cohete: una bola de fuego corta y después el humo que sube
  rocketImpact(x, y, R) {
    this.add(FIREBALL, x, y, 0, 0, 0.32, R * 0.42, '', 0);
    for (let i = 0; i < 4; i++) {
      const a = rand(0, TAU);
      this.add(
        FIREBALL,
        x + Math.cos(a) * R * 0.15,
        y + Math.sin(a) * R * 0.15,
        Math.cos(a) * 60,
        Math.sin(a) * 60,
        rand(0.18, 0.3),
        R * rand(0.16, 0.26),
        '',
        3,
      );
    }
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU);
      const s = rand(20, 70);
      this.add(
        SMOKE,
        x + Math.cos(a) * R * 0.2,
        y + Math.sin(a) * R * 0.2,
        Math.cos(a) * s,
        Math.sin(a) * s - 25,
        rand(1.6, 2.8),
        rand(10, 18),
        i < 4 ? '90,80,70' : '58,55,52',
        1.2,
        22,
        rand(0.18, 0.35),
      );
    }
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      const s = rand(200, 480);
      this.add(
        SPARK,
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        rand(0.12, 0.28),
        1,
        pick(['#ffd890', '#ffb060', '#fff2d0']),
        5,
      );
    }
  }

  // el gordo revienta: trozos de carne, chorros de sangre por todos lados
  gore(x, y, R) {
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU);
      const s = rand(150, 520);
      this.add(
        CHUNK,
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        rand(0.6, 1.2),
        rand(4, 9),
        pick(['#a8ad7e', '#9fa676', '#8a2a20', '#b0b287']),
        3.5,
      );
    }
    for (let i = 0; i < 60; i++) {
      const a = rand(0, TAU);
      const s = rand(80, 600);
      this.add(DOT, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.9), rand(2, 6), pick(BLOOD), 3);
    }
    this.ring(x, y, R * 0.7, '200,60,40');
  }

  // estela de humo y chispas del cohete
  rocketTrail(x, y, dx, dy) {
    this.add(
      SMOKE,
      x - dx * 10 + rand(-2, 2),
      y - dy * 10 + rand(-2, 2),
      -dx * 30 + rand(-10, 10),
      -dy * 30 + rand(-10, 10),
      rand(0.6, 1.1),
      4,
      '180,175,165',
      1.5,
      16,
    );
    this.add(
      EMBER,
      x - dx * 12,
      y - dy * 12,
      -dx * 90 + rand(-30, 30),
      -dy * 90 + rand(-30, 30),
      rand(0.1, 0.25),
      rand(1.2, 2.2),
      pick(['#ffd890', '#ffb060']),
      3,
    );
  }

  // rebufo de la bazuca hacia atrás
  backblast(x, y, a) {
    for (let i = 0; i < 10; i++) {
      const aa = a + rand(-0.45, 0.45);
      const s = rand(60, 220);
      this.add(SMOKE, x, y, Math.cos(aa) * s, Math.sin(aa) * s, rand(0.6, 1.2), rand(5, 9), '170,165,155', 3, 26);
    }
  }

  // botella rota: vidrio y llamarada
  shatter(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      const s = rand(80, 260);
      this.add(
        SPARK,
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        rand(0.15, 0.35),
        1,
        pick(['#cfe8e0', '#9fc4b8', '#ffd890']),
        6,
      );
    }
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU);
      const s = rand(40, 160);
      this.add(
        EMBER,
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s - 30,
        rand(0.4, 0.9),
        rand(1.5, 3),
        pick(['#ffb050', '#ff7a20', '#ffe08a']),
        2,
      );
    }
    this.add(SMOKE, x, y, 0, -20, 1.4, 14, '230,120,40', 1.5, 40);
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
      if (q.delay > 0) {
        q.delay -= dt;
        continue;
      }
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
      if (q.delay > 0 || q.x < view.x0 - 40 || q.x > view.x1 + 40 || q.y < view.y0 - 40 || q.y > view.y1 + 40) continue;
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
        case FIREBALL: {
          const s = q.size * (0.6 + (1 - t) * 0.9);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.min(1, t * 1.6);
          ctx.drawImage(fireSprite(), q.x - s, q.y - s, s * 2, s * 2);
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case CHUNK:
          // trozo de carne que vuela girando
          ctx.globalAlpha = Math.min(1, t * 3);
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.fillStyle = q.color;
          ctx.fillRect(-q.size / 2, -q.size / 3, q.size, q.size * 0.66);
          ctx.fillStyle = '#5e1411';
          ctx.fillRect(-q.size / 2, -q.size / 3, q.size * 0.4, q.size * 0.66);
          ctx.restore();
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

// Restos en el suelo: cuerpos que caen con una animación (varias variantes),
// charcos de sangre estilizada y salpicaduras. Todo tiene tope y se desvanece solo.
const POOLS = [];
const ACID_POOLS = [];
function poolSprite(seed, dark = '#5e1411', light = 'rgba(160,40,32,0.45)') {
  const size = 96;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = dark;
  g.beginPath();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const d = 26 + r() * 14;
    g.lineTo(48 + Math.cos(a) * d, 48 + Math.sin(a) * d * 0.8);
  }
  g.closePath();
  g.fill();
  for (let i = 0; i < 7; i++) {
    const a = r() * TAU;
    const d = 34 + r() * 10;
    g.beginPath();
    g.arc(48 + Math.cos(a) * d, 48 + Math.sin(a) * d * 0.8, 3 + r() * 5, 0, TAU);
    g.fill();
  }
  g.fillStyle = light;
  g.beginPath();
  g.ellipse(42, 42, 14, 9, -0.5, 0, TAU);
  g.fill();
  return c;
}

export class Decals {
  constructor(max = 150, maxPools = 200) {
    this.max = max;
    this.maxPools = maxPools;
    this.list = [];
    this.pools = [];
    if (!POOLS.length) for (let i = 1; i <= 4; i++) POOLS.push(poolSprite(i * 7919));
    if (!ACID_POOLS.length)
      for (let i = 1; i <= 3; i++) ACID_POOLS.push(poolSprite(i * 4801, '#4f8a1c', 'rgba(190,255,90,0.5)'));
  }
  clear() {
    this.list.length = 0;
    this.pools.length = 0;
  }
  // dx, dy: dirección del último impacto, para caer hacia ese lado
  corpse(z, dx = 0, dy = 0) {
    const spr = zombieSprite(z);
    if (this.list.length >= this.max) this.list.shift();
    const l = Math.hypot(dx, dy) || 1;
    const fx = dx / l;
    const fy = dy / l;
    const variant = (Math.random() * 3) | 0;
    // una explosión fuerte (dirección de más de 1) lanza el cuerpo mucho más lejos
    const power = Math.min(5, Math.max(1, l));
    const slide = (variant === 0 ? rand(10, 18) : variant === 1 ? rand(4, 8) : rand(2, 5)) * power;
    const spin =
      (variant === 1 ? rand(0.9, 1.6) * (Math.random() < 0.5 ? -1 : 1) : rand(-0.5, 0.5)) * (power > 1.5 ? 3 : 1);
    // lanzado por una explosión: vuela en arco antes de caer
    const lift = power > 1.5 ? power * rand(8, 12) : 0;
    this.list.push({
      img: z.burnt ? spr.burnt : spr.dead,
      x: z.x,
      y: z.y,
      x0: z.x,
      y0: z.y,
      x1: z.x + fx * slide * (z.r / 13),
      y1: z.y + fy * slide * (z.r / 13),
      a0: z.angle,
      a1: z.angle + spin,
      half: spr.half,
      t: 0,
      fall: (variant === 2 ? 0.55 : 0.4) + (lift ? 0.35 : 0),
      lift,
      shrink: variant === 2 ? 0.82 : 0.92,
      life: z.type === 'heavy' || z.type === 'fat' ? 26 : 16,
    });
    if (this.pools.length >= this.maxPools) this.pools.shift();
    this.pools.push({
      img: POOLS[(Math.random() * POOLS.length) | 0],
      x: z.x + fx * slide * 1.2,
      y: z.y + fy * slide * 1.2,
      a: rand(0, TAU),
      size: z.r * rand(2.6, 3.4),
      t: 0,
      life: 22,
      delay: 0.3,
    });
  }
  splat(x, y, size) {
    if (this.pools.length >= this.maxPools) this.pools.shift();
    this.pools.push({
      img: POOLS[(Math.random() * POOLS.length) | 0],
      x,
      y,
      a: rand(0, TAU),
      size,
      t: 0,
      life: 9,
      delay: 0,
    });
  }
  // gota del rastro de sangre de un zombi herido
  drip(x, y) {
    if (this.pools.length >= this.maxPools) this.pools.shift();
    this.pools.push({
      img: POOLS[(Math.random() * POOLS.length) | 0],
      x,
      y,
      a: rand(0, TAU),
      size: rand(2.5, 4.5),
      t: 0,
      life: 8,
      delay: 0,
    });
  }
  // charco de ácido del gordo al reventar
  acid(x, y, size) {
    if (this.pools.length >= this.maxPools) this.pools.shift();
    this.pools.push({
      img: ACID_POOLS[(Math.random() * ACID_POOLS.length) | 0],
      x,
      y,
      a: rand(0, TAU),
      size,
      t: 0,
      life: 14,
      delay: 0,
    });
  }
  update(dt) {
    for (const d of this.list) {
      d.t += dt;
      const k = Math.min(1, d.t / d.fall);
      const e = 1 - (1 - k) * (1 - k);
      d.x = d.x0 + (d.x1 - d.x0) * e;
      d.y = d.y0 + (d.y1 - d.y0) * e;
    }
    for (const p of this.pools) p.t += dt;
    while (this.list.length && this.list[0].t > this.list[0].life) this.list.shift();
    while (this.pools.length && this.pools[0].t > this.pools[0].life) this.pools.shift();
  }
  drawPools(ctx, view) {
    for (const p of this.pools) {
      if (p.x + p.size < view.x0 || p.x - p.size > view.x1 || p.y + p.size < view.y0 || p.y - p.size > view.y1)
        continue;
      const tt = p.t - p.delay;
      if (tt <= 0) continue;
      const grow = Math.min(1, tt / 1.1);
      const s = p.size * (0.35 + 0.65 * (1 - (1 - grow) * (1 - grow)));
      ctx.globalAlpha = 0.7 * Math.min(1, (p.life - p.t) / 4);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.drawImage(p.img, -s, -s, s * 2, s * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  draw(ctx, view) {
    for (const d of this.list) {
      if (d.x + d.half < view.x0 || d.x - d.half > view.x1 || d.y + d.half < view.y0 || d.y - d.half > view.y1)
        continue;
      const k = Math.min(1, d.t / d.fall);
      const e = 1 - (1 - k) * (1 - k);
      const fadeOut = Math.min(1, (d.life - d.t) / 3);
      ctx.globalAlpha = (0.95 - 0.1 * e) * fadeOut;
      ctx.save();
      const up = d.lift && k < 1 ? Math.sin(k * Math.PI) * d.lift : 0;
      ctx.translate(d.x, d.y - up);
      ctx.rotate(d.a0 + (d.a1 - d.a0) * e);
      const sc = (1 - (1 - d.shrink) * e) * (1 + up / 70);
      ctx.scale(sc, sc * (1 - 0.08 * e));
      ctx.drawImage(d.img, -d.half, -d.half, d.half * 2, d.half * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

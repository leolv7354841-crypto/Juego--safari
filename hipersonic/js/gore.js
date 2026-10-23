// Restos: cuando alguien recibe un impacto a Mach 1 (o lo alcanza un auto lanzado, o se
// liberan los golpes del Sonic Time) se despedaza en cabeza, torso, brazos, piernas y
// órganos caricaturescos que salen volando, rebotan y dejan salpicaduras de sangre.
import { TAU, rand } from './util.js';
import { drawSprite } from './atlas.js';
import { OUT, LW } from './art/characters.js';

const GRAV = 1100;
const MAX = 260;

/* ---------- arte de los órganos (en el atlas) ---------- */

function outline(g, w = 1.2) {
  g.lineWidth = w;
  g.strokeStyle = OUT;
  g.lineJoin = 'round';
  g.stroke();
}
function sheen(g, x, y, r) {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, 'rgba(255,255,255,0.35)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = gr;
  g.fill();
}

const ORGANS = {
  brain: [16, 13, (g) => {
    g.beginPath();
    g.ellipse(0, 0, 6.5, 5.2, 0, 0, TAU);
    g.fillStyle = '#e59aa6';
    g.fill();
    sheen(g, 0, 0, 6.5);
    outline(g);
    g.strokeStyle = '#b8606e';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-6, 0);
    g.lineTo(6, 0);
    for (let i = -4; i <= 4; i += 2.6) {
      g.moveTo(i, -4.5);
      g.quadraticCurveTo(i + 1.4, -2, i - 0.4, -0.6);
      g.moveTo(i, 4.5);
      g.quadraticCurveTo(i + 1.4, 2, i - 0.4, 0.6);
    }
    g.stroke();
  }],
  heart: [12, 12, (g) => {
    g.beginPath();
    g.moveTo(0, 4.5);
    g.bezierCurveTo(-6, 0, -4.5, -5, 0, -2.4);
    g.bezierCurveTo(4.5, -5, 6, 0, 0, 4.5);
    g.fillStyle = '#a3222c';
    g.fill();
    sheen(g, 0, 0, 5);
    outline(g);
    g.strokeStyle = '#d9c4b8';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-1, -2.6);
    g.lineTo(-1.6, -5);
    g.stroke();
  }],
  guts: [22, 16, (g) => {
    g.lineCap = 'round';
    const path = () => {
      g.beginPath();
      g.moveTo(-9, 2);
      g.bezierCurveTo(-9, -6, -3, -6, -2, 0);
      g.bezierCurveTo(-1, 6, 5, 6, 5, 0);
      g.bezierCurveTo(5, -5, 10, -5, 9, 2);
    };
    path();
    g.strokeStyle = OUT;
    g.lineWidth = 5.6;
    g.stroke();
    path();
    g.strokeStyle = '#d98290';
    g.lineWidth = 3.4;
    g.stroke();
    path();
    g.strokeStyle = 'rgba(255,220,225,0.55)';
    g.lineWidth = 1;
    g.stroke();
  }],
  liver: [14, 10, (g) => {
    g.beginPath();
    g.moveTo(-6, 1);
    g.quadraticCurveTo(-5, -4.5, 2, -3.6);
    g.quadraticCurveTo(7, -2.5, 6, 1.5);
    g.quadraticCurveTo(0, 4.5, -6, 1);
    g.fillStyle = '#7a1f22';
    g.fill();
    sheen(g, 0, 0, 6);
    outline(g);
  }],
  bone: [14, 7, (g) => {
    g.beginPath();
    g.roundRect ? g.roundRect(-4.5, -1.4, 9, 2.8, 1.2) : g.rect(-4.5, -1.4, 9, 2.8);
    for (const s of [-1, 1]) for (const t of [-1, 1]) g.arc(s * 5, t * 1.6, 1.8, 0, TAU);
    g.fillStyle = '#ece4d0';
    g.fill();
    outline(g, 1);
  }],
  meat: [10, 9, (g) => {
    g.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const r = i % 2 ? 3.2 : 4.2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#b8323a';
    g.fill();
    sheen(g, 0, 0, 4);
    outline(g, 1);
  }],
  eye: [7, 7, (g) => {
    g.beginPath();
    g.arc(0, 0, 2.6, 0, TAU);
    g.fillStyle = '#f2efe8';
    g.fill();
    outline(g, 0.9);
    g.beginPath();
    g.arc(0.8, 0, 1.1, 0, TAU);
    g.fillStyle = '#2b4a6a';
    g.fill();
  }],
};

export class Gore {
  constructor(atlas, fx) {
    this.fx = fx;
    this.list = [];
    this.spr = {};
    for (const [k, [w, h, paint]] of Object.entries(ORGANS)) this.spr[k] = atlas.add('gore.' + k, w, h, paint);
  }

  add(p) {
    if (this.list.length >= MAX) this.list.shift();
    p.t = 0;
    p.rest = 0;
    p.trail = 0;
    this.list.push(p);
  }

  // Despedaza a un personaje. vx, vy: velocidad del impacto (los restos siguen esa dirección).
  explode(kit, x, y, face, vx, vy, power = 1) {
    const raw = Math.hypot(vx, vy) || 1;
    const ux = vx / raw;
    const uy = vy / raw;
    // los restos salen rápido pero se quedan a la vista
    const sp = Math.min(raw, 620);
    const spread = (s, up) => {
      const a = Math.atan2(uy, ux) + rand(-1, 1) * s;
      const v = sp * rand(0.3, 0.85) + rand(80, 240) * Math.min(power, 1.2);
      return { vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(up[0], up[1]) * power };
    };
    const base = { x, y, z: 12, kit, rot: face };
    const part = (kind, extra, s = 0.6, up = [180, 520]) => this.add({ ...base, kind, ...spread(s, up), vr: rand(-22, 22), ...extra });
    part('head', {}, 0.5, [300, 700]);
    part('torso', {}, 0.35, [150, 380]);
    for (const side of [-1, 1]) {
      part('arm', { side }, 0.9);
      part('leg', { side }, 0.8);
    }
    const organs = ['brain', 'heart', 'guts', 'guts', 'liver', 'eye', 'eye', 'bone', 'bone', 'meat', 'meat', 'meat', 'meat'];
    for (const o of organs) part('organ', { spr: this.spr[o], small: true }, 1.4, [200, 650]);
    // chorro de sangre
    this.fx.blood(x, y, ux, uy, 46, sp * 0.7 + 160, true);
    this.fx.splat(x, y, 26 + power * 10, ux, uy);
    this.fx.add({ k: 'flash', x, y, vx: 0, vy: 0, life: 0.12, size: 26, color: 'red' });
  }

  update(dt, world) {
    if (dt <= 0) return;
    const fx = this.fx;
    const L = this.list;
    let w = 0;
    for (const p of L) {
      p.t += dt;
      if (p.t > 40) continue;
      if (p.z > 0 || p.vz > 0) {
        p.vz -= GRAV * dt;
        p.z += p.vz * dt;
        p.rot += p.vr * dt;
        // gotea sangre mientras vuela
        p.trail -= dt;
        if (p.trail <= 0 && !p.dry) {
          p.trail = p.small ? 0.06 : 0.035;
          fx.blood(p.x, p.y, 0, 0, 1, 40, false, p.z);
        }
        if (p.z <= 0) {
          p.z = 0;
          if (p.vz < -260) {
            fx.splat(p.x, p.y, p.small ? 6 : 12, p.vx, p.vy);
            p.vz *= -0.32;
            p.vx *= 0.6;
            p.vy *= 0.6;
            p.vr *= 0.6;
          } else p.vz = 0;
        }
      } else {
        const k = Math.exp(-dt * 5);
        const sp = Math.hypot(p.vx, p.vy);
        // se arrastra dejando un rastro
        if (sp > 60 && !p.dry) {
          p.trail -= dt;
          if (p.trail <= 0) {
            p.trail = 0.03;
            fx.decal({ k: 'smear', x: p.x, y: p.y, ang: Math.atan2(p.vy, p.vx), len: sp * 0.035 + 3, w: p.small ? 2.5 : 5, life: 50 });
          }
        }
        p.vx *= k;
        p.vy *= k;
        p.vr *= k;
        p.rot += p.vr * dt;
        if (sp < 10) p.dry = p.t > 3;
      }
      const ox = p.x;
      const oy = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const hit = world.collide(p, p.small ? 3 : 6);
      if (hit) {
        const vn = p.vx * hit.nx + p.vy * hit.ny;
        if (vn < 0) {
          p.vx -= 1.5 * vn * hit.nx;
          p.vy -= 1.5 * vn * hit.ny;
          if (-vn > 200 && !p.dry) fx.splat((ox + p.x) / 2, (oy + p.y) / 2, p.small ? 7 : 12, -hit.nx, -hit.ny);
        }
      }
      L[w++] = p;
    }
    L.length = w;
  }

  drawShadows(g, S, v) {
    for (const p of this.list) {
      if (p.x < v.x0 - 40 || p.x > v.x1 + 40 || p.y < v.y0 - 40 || p.y > v.y1 + 40) continue;
      const s = (p.small ? 5 : 10) * (1 + p.z / 200);
      g.globalAlpha = 0.35 * Math.max(0.2, 1 - p.z / 250);
      g.drawImage(S.shadow, p.x + 2 - s, p.y + 2 - s, s * 2, s * 2);
    }
    g.globalAlpha = 1;
  }

  draw(g, v, high) {
    for (const p of this.list) {
      if ((p.z > 30) !== high) continue;
      if (p.x < v.x0 - 40 || p.x > v.x1 + 40 || p.y < v.y0 - 40 || p.y > v.y1 + 40) continue;
      const a = p.t > 37 ? (40 - p.t) / 3 : 1;
      g.globalAlpha = a;
      const k = 1 + p.z / 220;
      const x = p.x;
      const y = p.y - p.z * 0.42;
      const kit = p.kit;
      if (p.kind === 'organ') drawSprite(g, p.spr, x, y, p.rot, k, k);
      else if (p.kind === 'head') {
        drawSprite(g, kit.head, x, y, p.rot, k, k);
        stump(g, x - Math.cos(p.rot) * kit.r * 0.42 * k, y - Math.sin(p.rot) * kit.r * 0.42 * k, 3.2 * k);
      } else if (p.kind === 'torso') {
        drawSprite(g, kit.lying, x, y, p.rot, 0.85 * k, k);
        const c = Math.cos(p.rot);
        const s = Math.sin(p.rot);
        const r = kit.r;
        // cuello y hombros arrancados
        stump(g, x + c * r * 0.62 * k, y + s * r * 0.62 * k, 4 * k);
        stump(g, x + (c * r * 0.35 - s * r * 0.75) * k, y + (s * r * 0.35 + c * r * 0.75) * k, 3 * k);
        stump(g, x + (c * r * 0.35 + s * r * 0.75) * k, y + (s * r * 0.35 - c * r * 0.75) * k, 3 * k);
        stump(g, x - c * r * 0.62 * k, y - s * r * 0.62 * k, 3.4 * k);
      } else {
        const r = kit.r;
        const len = (p.kind === 'arm' ? 0.95 : 1.0) * r * k;
        const c = Math.cos(p.rot);
        const s = Math.sin(p.rot);
        const x0 = x - c * len * 0.5;
        const y0 = y - s * len * 0.5;
        const x1 = x + c * len * 0.5;
        const y1 = y + s * len * 0.5;
        const w = (p.kind === 'arm' ? 0.32 : 0.38) * r * k;
        const col = p.kind === 'arm' ? kit.sleeve : kit.pants;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.strokeStyle = OUT;
        g.lineWidth = w + LW * 1.8;
        g.stroke();
        g.strokeStyle = col;
        g.lineWidth = w;
        g.stroke();
        stump(g, x0, y0, w * 0.55);
        drawSprite(g, p.kind === 'arm' ? kit.hand : kit.shoe, x1, y1, p.rot, k, k);
      }
    }
    g.globalAlpha = 1;
  }
}

// Herida abierta: carne roja con un hueso al centro.
function stump(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = '#9c1b22';
  g.fill();
  g.lineWidth = 0.9;
  g.strokeStyle = OUT;
  g.stroke();
  g.beginPath();
  g.arc(x, y, r * 0.38, 0, TAU);
  g.fillStyle = '#efe6d2';
  g.fill();
}


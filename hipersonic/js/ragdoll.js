// Ragdoll caricaturesco: siete puntos (cadera, pecho, cabeza, manos y pies) con altura z,
// integrados con Verlet y unidos por distancias. Vuelan, rebotan y se desparraman.
import { clamp } from './util.js';

const GRAV = 1100;
const STEP = 1 / 120;

export class Ragdoll {
  // face: hacia dónde miraba el cuerpo; v: velocidad del golpe (x, y, z); spin: giro (rad/s)
  constructor(kit, x, y, face, vx, vy, vz, spin = 0) {
    const r = kit.r;
    const b = kit.st.build;
    this.r = r;
    const ax = Math.cos(face);
    const ay = Math.sin(face);
    const px = -ay;
    const py = ax;
    const z0 = 14;
    const L = [
      [0, 0, z0],
      [0.95 * r, 0, z0 + 4],
      [1.6 * r, 0, z0 + 6],
      [0.8 * r, -0.95 * r * b, z0 + 2],
      [0.8 * r, 0.95 * r * b, z0 + 2],
      [-0.95 * r, -0.35 * r, z0 - 6],
      [-0.95 * r, 0.35 * r, z0 - 6],
    ];
    this.p = L.map(([u, w, z]) => {
      const qx = x + ax * u + px * w;
      const qy = y + ay * u + py * w;
      // cada punto gira alrededor de la cadera: así el cuerpo da vueltas en el aire
      const ox = qx - x;
      const oy = qy - y;
      const svx = vx - oy * spin;
      const svy = vy + ox * spin;
      const k = 0.85 + Math.random() * 0.3;
      return { x: qx, y: qy, z, px: qx - svx * k * STEP, py: qy - svy * k * STEP, pz: z - vz * k * STEP };
    });
    this.c = [
      [0, 1, 0.95 * r],
      [1, 2, 0.65 * r],
      [1, 3, 0.95 * r * b],
      [1, 4, 0.95 * r * b],
      [0, 5, 1.0 * r],
      [0, 6, 1.0 * r],
      [0, 2, 1.55 * r],
      [5, 6, 0.7 * r],
      [3, 4, 1.4 * r * b],
    ];
    this.acc = 0;
    this.still = 0;
    this.settled = false;
    this.bounces = 0;
    this.maxZ = z0;
  }

  get x() {
    return this.p[0].x;
  }
  get y() {
    return this.p[0].y;
  }
  get z() {
    return this.p[0].z;
  }
  // Rumbo del cuerpo (de la cadera al pecho) para levantarse mirando hacia ahí.
  get face() {
    return Math.atan2(this.p[1].y - this.p[0].y, this.p[1].x - this.p[0].x);
  }
  speed() {
    const q = this.p[0];
    return Math.hypot(q.x - q.px, q.y - q.py, q.z - q.pz) / STEP;
  }
  velocity() {
    const q = this.p[0];
    return { x: (q.x - q.px) / STEP, y: (q.y - q.py) / STEP, z: (q.z - q.pz) / STEP };
  }

  push(vx, vy, vz) {
    for (const q of this.p) {
      q.px -= vx * STEP;
      q.py -= vy * STEP;
      q.pz -= vz * STEP;
    }
    this.settled = false;
    this.still = 0;
  }

  // onImpact(x, y, fuerza) se llama al chocar con el suelo o una pared.
  update(dt, world, onImpact) {
    if (this.settled) return;
    this.acc += Math.min(dt, 0.05);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(world, onImpact);
    }
    const s = this.speed();
    let high = 0;
    for (const q of this.p) high = Math.max(high, q.z);
    this.maxZ = Math.max(this.maxZ, high);
    if (s < 22 && high < 2) this.still += dt;
    else this.still = 0;
    if (this.still > 0.45) this.settled = true;
  }

  step(world, onImpact) {
    for (const q of this.p) {
      const vx = (q.x - q.px) * 0.996;
      const vy = (q.y - q.py) * 0.996;
      const vz = q.z - q.pz;
      q.px = q.x;
      q.py = q.y;
      q.pz = q.z;
      q.x += vx;
      q.y += vy;
      q.z += vz - GRAV * STEP * STEP;
      if (q.z < 0) {
        const fall = -vz / STEP;
        q.z = 0;
        q.pz = vz < 0 ? q.z + vz * 0.32 : q.z;
        // rozamiento con el suelo
        q.px = q.x - vx * 0.82;
        q.py = q.y - vy * 0.82;
        if (q === this.p[0] && fall > 240 && onImpact) {
          this.bounces++;
          onImpact(q.x, q.y, fall);
        }
      }
    }
    for (let it = 0; it < 3; it++) {
      for (const [a, b, d] of this.c) {
        const A = this.p[a];
        const B = this.p[b];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const dz = B.z - A.z;
        const l = Math.hypot(dx, dy, dz) || 1e-4;
        const k = ((l - d) / l) * 0.5;
        A.x += dx * k;
        A.y += dy * k;
        A.z += dz * k;
        B.x -= dx * k;
        B.y -= dy * k;
        B.z -= dz * k;
      }
    }
    // paredes: rebote
    for (let i = 0; i < 3; i++) {
      const q = this.p[i];
      const ox = q.x;
      const oy = q.y;
      const hit = world.collide(q, i === 2 ? 5 : 7);
      if (hit) {
        const vx = ox - q.px;
        const vy = oy - q.py;
        const vn = vx * hit.nx + vy * hit.ny;
        if (vn < 0) {
          const rx = vx - 1.55 * vn * hit.nx;
          const ry = vy - 1.55 * vn * hit.ny;
          q.px = q.x - rx * 0.7;
          q.py = q.y - ry * 0.7;
          const f = (-vn / STEP) | 0;
          if (f > 260 && onImpact) onImpact(q.x, q.y, f, hit);
        }
      }
      q.z = clamp(q.z, 0, 600);
    }
  }
}

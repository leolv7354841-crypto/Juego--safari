// Cámara: sigue al jugador con suavizado, temblor por trauma y empujón por retroceso.
import { clamp, rand } from '../core/util.js';
import { CAMERA } from '../core/config.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.trauma = 0;
    this.kx = 0;
    this.ky = 0;
    this.sx = 0;
    this.sy = 0;
    this.viewW = 800;
    this.viewH = 600;
  }
  // Temblor de fuerza a (0..1). Con lugar (x, y) se apaga con la distancia a la cámara; sin lugar
  // es algo que le pasa a este jugador (su golpe, su muerte). La fuente más fuerte manda y las demás
  // suman poco, así que muchos golpes seguidos no dejan la cámara temblando al tope.
  shake(a, x, y) {
    if (typeof x === 'number' && typeof y === 'number') {
      const d = Math.hypot(x - this.x, y - this.y);
      a *= clamp(1 - (d - CAMERA.near) / (CAMERA.far - CAMERA.near), 0, 1);
    }
    if (!(a > 0)) return;
    this.trauma = Math.min(1, Math.max(this.trauma, a) + a * CAMERA.stack * (1 - this.trauma));
  }
  kick(x, y) {
    this.kx += x;
    this.ky += y;
  }
  update(dt, tx, ty, snap) {
    const a = snap ? 1 : 1 - Math.exp(-dt * 7);
    this.x += (tx - this.x) * a;
    this.y += (ty - this.y) * a;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const k = Math.exp(-dt * 16);
    this.kx *= k;
    this.ky *= k;
    const s = this.trauma * this.trauma * CAMERA.shake;
    this.sx = rand(-s, s) + this.kx;
    this.sy = rand(-s, s) + this.ky;
  }
}

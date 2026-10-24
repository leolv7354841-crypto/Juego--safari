// Robot de combate: se compra en la tienda, te subes con E (o el botón ROBOT) y caminas
// entre la horda apartando zombis. Lleva tu arma en el brazo derecho y puedes cambiarla.
// Tiene 10 000 de vida que no se recupera sola: se repara en la tienda entre oleadas.
import { ROBOT, WORLD_SIZE } from './config.js';
import { clamp, angleTo, TAU, roundRect } from './util.js';
import { OUT, drawGunScaled, GUN_REACH } from './sprites.js';

export class Robot {
  constructor() {
    this.reset();
  }

  reset() {
    this.owned = false;
    this.piloted = false;
    this.hp = ROBOT.hp;
    this.x = 0;
    this.y = 0;
    this.angle = -Math.PI / 2;
    this.legAngle = -Math.PI / 2;
    this.walk = 0;
    this.hitT = 0;
    this.stepSide = 0;
  }

  get broken() {
    return this.owned && this.hp <= 0;
  }

  get repairCost() {
    return Math.ceil((ROBOT.hp - Math.max(0, this.hp)) * ROBOT.repairPerHp);
  }

  // Lo deja estacionado junto al jugador.
  deploy(p, world) {
    this.owned = true;
    this.hp = ROBOT.hp;
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
      const x = p.x + Math.cos(p.angle + a) * (ROBOT.radius + p.r + 20);
      const y = p.y + Math.sin(p.angle + a) * (ROBOT.radius + p.r + 20);
      if (!world.pointBlocked(x, y, ROBOT.radius * 0.6)) {
        this.x = x;
        this.y = y;
        return;
      }
    }
    this.x = p.x;
    this.y = p.y;
  }

  near(p) {
    return Math.hypot(p.x - this.x, p.y - this.y) < ROBOT.radius + p.r + 50;
  }

  board(p) {
    this.piloted = true;
    p.inRobot = true;
    p.baseR = p.r;
    p.baseMass = p.mass;
    p.x = this.x;
    p.y = this.y;
    p.r = ROBOT.radius;
    p.mass = ROBOT.mass;
  }

  leave(p, world) {
    this.piloted = false;
    p.inRobot = false;
    p.r = p.baseR || p.r;
    p.mass = p.baseMass || p.mass;
    // bajas por la parte de atrás del robot
    for (const a of [Math.PI, Math.PI / 2, -Math.PI / 2, 0]) {
      const x = this.x + Math.cos(this.angle + a) * (ROBOT.radius + p.r + 6);
      const y = this.y + Math.sin(this.angle + a) * (ROBOT.radius + p.r + 6);
      if (!world.pointBlocked(x, y, p.r)) {
        p.x = clamp(x, 30, WORLD_SIZE - 30);
        p.y = clamp(y, 30, WORLD_SIZE - 30);
        return;
      }
    }
  }

  // Daño recibido mientras lo pilotas. Devuelve true si quedó destruido.
  damage(dmg) {
    this.hp -= dmg;
    this.hitT = 0.2;
    return this.hp <= 0;
  }

  update(dt, p, game) {
    this.hitT -= dt;
    if (!this.piloted) return;
    const moved = Math.hypot(p.x - this.x, p.y - this.y);
    this.x = p.x;
    this.y = p.y;
    this.angle = p.angle;
    if (moved > 0.2) this.legAngle = angleTo(this.legAngle, p.legAngle, dt * 6);
    this.walk += moved * 0.045;
    // pisadas pesadas, una por cada pie
    const side = Math.floor(this.walk / Math.PI);
    if (side !== this.stepSide) {
      this.stepSide = side;
      game.sfx.stomp(0.35);
      game.camera.shake(0.08, this.x, this.y);
      const fx = this.x + Math.cos(this.legAngle + (side & 1 ? 1.2 : -1.2)) * ROBOT.radius * 0.45;
      const fy = this.y + Math.sin(this.legAngle + (side & 1 ? 1.2 : -1.2)) * ROBOT.radius * 0.45;
      game.particles.dust(fx, fy, 10);
    }
    // dañado: echa chispas y humo
    if (this.hp < ROBOT.hp * 0.35 && Math.random() < dt * 6) game.particles.burning(this.x, this.y, ROBOT.radius * 0.5);
  }

  draw(g, p, time) {
    const R = ROBOT.radius;
    g.save();
    g.translate(this.x, this.y);
    // sombra
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(4, 6, R * 1.05, R * 0.9, 0, 0, TAU);
    g.fill();
    // piernas: dos pies que avanzan alternados
    g.save();
    g.rotate(this.legAngle);
    const s = Math.sin(this.walk);
    for (const k of [-1, 1]) {
      const fx = k * s * R * 0.35;
      g.fillStyle = '#3a3f44';
      g.strokeStyle = OUT;
      g.lineWidth = 2;
      roundRect(g, fx - R * 0.42, k * R * 0.5 - R * 0.2, R * 0.84, R * 0.4, 4);
      g.fill();
      g.stroke();
      g.fillStyle = '#c9a54a';
      g.fillRect(fx + R * 0.2, k * R * 0.5 - R * 0.16, R * 0.12, R * 0.32);
    }
    g.restore();
    // torso
    g.rotate(this.angle);
    const hit = this.hitT > 0;
    g.fillStyle = hit ? '#9aa0a6' : '#5d646b';
    g.strokeStyle = OUT;
    g.lineWidth = 2.2;
    roundRect(g, -R * 0.75, -R * 0.78, R * 1.3, R * 1.56, 8);
    g.fill();
    g.stroke();
    // franjas de peligro
    g.save();
    g.beginPath();
    g.rect(-R * 0.75, -R * 0.78, R * 0.28, R * 1.56);
    g.clip();
    for (let i = -6; i < 8; i++) {
      g.fillStyle = i & 1 ? '#c9a54a' : '#1d1f22';
      g.beginPath();
      g.moveTo(-R * 0.75, i * 10);
      g.lineTo(-R * 0.47, i * 10 - 8);
      g.lineTo(-R * 0.47, i * 10 + 2);
      g.lineTo(-R * 0.75, i * 10 + 10);
      g.fill();
    }
    g.restore();
    // brazo izquierdo: puño blindado
    g.fillStyle = '#4b5157';
    roundRect(g, -R * 0.1, -R * 1.12, R * 0.9, R * 0.36, 6);
    g.fill();
    g.stroke();
    g.fillStyle = '#3a3f44';
    g.beginPath();
    g.arc(R * 0.86, -R * 0.94, R * 0.24, 0, TAU);
    g.fill();
    g.stroke();
    // brazo derecho con tu arma (más grande, como montada en el brazo)
    g.fillStyle = '#4b5157';
    roundRect(g, -R * 0.1, R * 0.76, R * 0.7, R * 0.36, 6);
    g.fill();
    g.stroke();
    g.save();
    g.translate(R * 0.35, R * 0.94);
    if (this.piloted) this.drawArmGun(g, p);
    else {
      // sin piloto el brazo queda vacío
      g.fillStyle = '#3a3f44';
      g.beginPath();
      g.arc(R * 0.3, 0, R * 0.2, 0, TAU);
      g.fill();
      g.stroke();
    }
    g.restore();
    // cabina con el piloto
    g.fillStyle = 'rgba(120,170,190,0.55)';
    g.beginPath();
    g.arc(R * 0.08, 0, R * 0.42, 0, TAU);
    g.fill();
    g.stroke();
    if (this.piloted) {
      g.fillStyle = '#c7a184';
      g.beginPath();
      g.arc(R * 0.06, 0, R * 0.22, 0, TAU);
      g.fill();
      g.fillStyle = '#2d2219';
      g.beginPath();
      g.arc(R * 0.03, 0, R * 0.2, Math.PI * 0.45, Math.PI * 1.55);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(R * 0.18, -R * 0.16, R * 0.14, R * 0.07, -0.5, 0, TAU);
    g.fill();
    // luz de estado
    const ok = this.hp > ROBOT.hp * 0.35;
    g.fillStyle = ok ? '#7fe07a' : Math.sin(time * 10) > 0 ? '#ff5040' : '#5a1a14';
    g.beginPath();
    g.arc(-R * 0.55, -R * 0.55, 3, 0, TAU);
    g.fill();
    g.restore();
    if (this.broken) {
      // chatarra humeante
      g.fillStyle = 'rgba(15,12,10,0.55)';
      g.beginPath();
      g.arc(this.x, this.y, R, 0, TAU);
      g.fill();
    }
  }

  // Tu arma, más grande, montada en el brazo derecho (con retroceso, recarga y fogonazo).
  drawArmGun(g, p) {
    g.translate(-(p.recoil || 0) * 6, 0);
    if (p.reloadT > 0) g.rotate(Math.sin((p.reloadProg || 0) * Math.PI) * 0.4);
    drawGunScaled(g, p, ROBOT.gunScale);
    if (p.flashT <= 0) return;
    const tip = (GUN_REACH[p.weapon.id] || 30) * ROBOT.gunScale;
    g.fillStyle = 'rgba(255,214,140,0.95)';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const d = i % 2 ? 5 : 14 + Math.random() * 8;
      g.lineTo(tip + Math.cos(a) * d * 1.3, Math.sin(a) * d * 0.7);
    }
    g.closePath();
    g.fill();
  }

  serialize() {
    return { owned: this.owned, hp: Math.round(this.hp), x: Math.round(this.x), y: Math.round(this.y), angle: this.angle };
  }

  restore(d) {
    this.reset();
    if (!d || !d.owned) return;
    this.owned = true;
    this.hp = d.hp;
    this.x = d.x;
    this.y = d.y;
    this.angle = d.angle || 0;
    this.legAngle = this.angle;
  }
}

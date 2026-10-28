// Robot de combate: se compra en la tienda, te subes con E (o el botón ROBOT) y caminas
// entre la horda apartando zombis. Lleva tu arma en el brazo derecho y puedes cambiarla.
// Tiene 10 000 de vida que no se recupera sola: se repara en la tienda entre oleadas.
import { ROBOT, WORLD_SIZE } from '../core/config.ts';
import { clamp, angleTo } from '../core/util.ts';
import type { GameHost } from '../core/types.d.ts';
import type { Player } from './player.ts';
import type { World } from './world.ts';

/** Estado guardado del robot (serialize/restore). */
export interface RobotSave {
  owned: boolean;
  hp: number;
  x: number;
  y: number;
  angle: number;
}

export class Robot {
  declare owned: boolean;
  declare piloted: boolean;
  declare hp: number;
  declare x: number;
  declare y: number;
  declare angle: number;
  declare legAngle: number;
  declare walk: number;
  declare hitT: number;
  declare stepSide: number;
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
  deploy(p: Player, world: World) {
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

  near(p: Player) {
    return Math.hypot(p.x - this.x, p.y - this.y) < ROBOT.radius + p.r + 50;
  }

  board(p: Player) {
    this.piloted = true;
    p.inRobot = true;
    p.baseR = p.r;
    p.baseMass = p.mass;
    p.x = this.x;
    p.y = this.y;
    p.r = ROBOT.radius;
    p.mass = ROBOT.mass;
  }

  leave(p: Player, world: World) {
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
  damage(dmg: number) {
    this.hp -= dmg;
    this.hitT = 0.2;
    return this.hp <= 0;
  }

  update(dt: number, p: Player, game: GameHost) {
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

  serialize(): RobotSave {
    return {
      owned: this.owned,
      hp: Math.round(this.hp),
      x: Math.round(this.x),
      y: Math.round(this.y),
      angle: this.angle,
    };
  }

  restore(d?: RobotSave | null) {
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

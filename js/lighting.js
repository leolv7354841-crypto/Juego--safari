// Capa de oscuridad a media resolución: se "recortan" las zonas iluminadas
// (linterna, farolas, fuegos, fogonazos) y luego se compone sobre la escena.
import { makeCanvas } from './util.js';
import { lightSprite, coneSprite } from './sprites.js';

const SCALE = 0.5;

export class Lighting {
  constructor() {
    this.canvas = makeCanvas(2, 2);
    this.ctx = this.canvas.getContext('2d');
    this.soft = lightSprite('255,255,255', 256);
    this.warm = lightSprite('255,150,70', 128);
    this.cool = lightSprite('255,220,170', 128);
    this.cone = coneSprite();
    this.ambient = 0.58;
  }

  resize(w, h) {
    this.canvas.width = Math.max(2, Math.ceil(w * SCALE));
    this.canvas.height = Math.max(2, Math.ceil(h * SCALE));
  }

  render(game, base, view) {
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const t = game.time;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = `rgba(6,8,12,${this.ambient})`;
    g.clearRect(0, 0, W, H);
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out';
    const s = base.z * SCALE;
    g.setTransform(s, 0, 0, s, base.tx * SCALE, base.ty * SCALE);

    const p = game.player;
    if (p && p.alive && game.state !== 'menu') {
      g.globalAlpha = 0.85;
      g.drawImage(this.soft, p.x - 230, p.y - 230, 460, 460);
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.angle);
      g.globalAlpha = 0.9;
      g.drawImage(this.cone, 8, -170, 520, 340);
      g.restore();
    } else if (game.state === 'menu') {
      g.globalAlpha = 0.6;
      g.drawImage(this.soft, game.camera.x - 320, game.camera.y - 320, 640, 640);
    }
    for (const l of game.world.lights) {
      if (l.x + l.r < view.x0 || l.x - l.r > view.x1 || l.y + l.r < view.y0 || l.y - l.r > view.y1) continue;
      l.cur = this.flicker(l, t);
      g.globalAlpha = l.cur;
      g.drawImage(this.soft, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    if (game.muzzle > 0) {
      g.globalAlpha = game.muzzle;
      g.drawImage(this.soft, game.muzzleX - 200, game.muzzleY - 200, 400, 400);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // la viñeta va en la misma capa: una pasada de pantalla completa menos
    if (this.vignette) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.vignette, 0, 0, W, H);
    }
  }

  flicker(l, t) {
    if (!l.flicker) return l.i;
    const n = Math.sin(t * 13 + l.ph) * 0.5 + Math.sin(t * 7.3 + l.ph * 2) * 0.3 + Math.sin(t * 23 + l.ph) * 0.2;
    if (l.flicker > 0.5 && Math.sin(t * 2.1 + l.ph) > 0.85) return l.i * 0.15;
    return l.i * (1 - l.flicker * 0.5 + n * l.flicker * 0.5);
  }

  composite(ctx, game, base, view, w, h) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.canvas, 0, 0, w, h);
    // brillo cálido aditivo de fuegos y farolas
    ctx.setTransform(base.z, 0, 0, base.z, base.tx, base.ty);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of game.world.lights) {
      if (l.x + l.r < view.x0 || l.x - l.r > view.x1 || l.y + l.r < view.y0 || l.y - l.r > view.y1) continue;
      const r = l.r * 0.75;
      ctx.globalAlpha = (l.cur ?? l.i) * (l.flicker > 0.1 ? 0.32 : 0.16);
      ctx.drawImage(l.flicker > 0.1 ? this.warm : this.cool, l.x - r, l.y - r, r * 2, r * 2);
    }
    if (game.muzzle > 0) {
      ctx.globalAlpha = game.muzzle * 0.35;
      ctx.drawImage(this.warm, game.muzzleX - 90, game.muzzleY - 90, 180, 180);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

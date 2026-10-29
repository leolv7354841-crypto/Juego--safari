// Capa de oscuridad a media resolución: se "recortan" las zonas iluminadas
// (linterna, farolas, fuegos, fogonazos) y luego se compone sobre la escena.
// Las rondas especiales la cambian: niebla (otra capa con un claro alrededor del jugador),
// apagón (sin farolas y más oscuro) y luna de sangre (noche rojiza).
import { makeCanvas } from '../core/util.ts';
import { lightSprite, coneSprite } from './sprites.js';

const SCALE = 0.5;

export class Lighting {
  constructor() {
    /** @type {HTMLCanvasElement | undefined} viñeta que dibuja Game (se asigna al cambiar el tamaño) */
    this.vignette;
    this.canvas = makeCanvas(2, 2);
    this.ctx = this.canvas.getContext('2d');
    this.soft = lightSprite('255,255,255', 256);
    this.warm = lightSprite('255,150,70', 128);
    this.cool = lightSprite('255,220,170', 128);
    this.cone = coneSprite();
    this.ambient = 0.58;
    this.fogCanvas = makeCanvas(2, 2);
    this.fogCtx = this.fogCanvas.getContext('2d');
  }

  resize(w, h) {
    this.canvas.width = this.fogCanvas.width = Math.max(2, Math.ceil(w * SCALE));
    this.canvas.height = this.fogCanvas.height = Math.max(2, Math.ceil(h * SCALE));
  }

  render(game, base, view) {
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const t = game.time;
    const ev = game.director.event;
    const def = game.director.eventDef;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = ev === 'blood' ? `rgba(40,5,8,${this.ambient})` : `rgba(6,8,12,${def?.ambient ?? this.ambient})`;
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
    // apagón: las farolas no alumbran
    for (const l of ev === 'blackout' ? [] : game.world.lights) {
      if (l.x + l.r < view.x0 || l.x - l.r > view.x1 || l.y + l.r < view.y0 || l.y - l.r > view.y1) continue;
      l.cur = this.flicker(l, t);
      g.globalAlpha = l.cur;
      g.drawImage(this.soft, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    for (const b of game.structures.blasts) {
      g.globalAlpha = Math.min(1, b.t * 3);
      g.drawImage(this.soft, b.x - 320, b.y - 320, 640, 640);
    }
    // destellos cortos (balas de la torreta pesada)
    for (const l of game.particles.lights) {
      g.globalAlpha = l.t / l.max;
      g.drawImage(this.soft, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    // fuego de molotov: ilumina a su alrededor y parpadea
    for (const f of game.structures.fires) {
      g.globalAlpha = Math.min(1, (f.life - f.t) / 1.2, f.t * 4) * (0.8 + 0.2 * Math.sin(game.time * 13 + f.x));
      g.drawImage(this.soft, f.x - 260, f.y - 260, 520, 520);
    }
    if (game.muzzle > 0) {
      g.globalAlpha = game.muzzle;
      g.drawImage(this.soft, game.muzzleX - 200, game.muzzleY - 200, 400, 400);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (ev === 'fog') this.fog(game, base, def);
    // luna de sangre: todo, también lo iluminado, se tiñe de rojo
    if (ev === 'blood') {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = 'rgba(150,10,14,0.14)';
      g.fillRect(0, 0, W, H);
    }
    // la viñeta va en la misma capa: una pasada de pantalla completa menos
    if (this.vignette) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.vignette, 0, 0, W, H);
    }
  }

  // Niebla: una capa gris que lo tapa todo salvo un claro alrededor del jugador (o de la cámara),
  // que respira despacio. Se pinta sobre la oscuridad.
  fog(game, base, def) {
    const f = this.fogCtx;
    const W = this.fogCanvas.width;
    const H = this.fogCanvas.height;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, W, H);
    f.fillStyle = `rgba(84,90,96,${def.thick})`;
    f.fillRect(0, 0, W, H);
    const p = game.player;
    const c = p && p.alive ? p : game.camera;
    const s = base.z * SCALE;
    f.setTransform(s, 0, 0, s, base.tx * SCALE, base.ty * SCALE);
    const r = def.clear * (1 + Math.sin(game.time * 0.7) * 0.06);
    const gr = f.createRadialGradient(c.x, c.y, r * 0.55, c.x, c.y, r * 1.5);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    f.globalCompositeOperation = 'destination-out';
    f.fillStyle = gr;
    f.fillRect(c.x - r * 1.5, c.y - r * 1.5, r * 3, r * 3);
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.fogCanvas, 0, 0);
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
    for (const l of game.director.event === 'blackout' ? [] : game.world.lights) {
      if (l.x + l.r < view.x0 || l.x - l.r > view.x1 || l.y + l.r < view.y0 || l.y - l.r > view.y1) continue;
      const r = l.r * 0.75;
      ctx.globalAlpha = (l.cur ?? l.i) * (l.flicker > 0.1 ? 0.32 : 0.16);
      ctx.drawImage(l.flicker > 0.1 ? this.warm : this.cool, l.x - r, l.y - r, r * 2, r * 2);
    }
    for (const b of game.structures.blasts) {
      ctx.globalAlpha = Math.min(1, b.t * 2.5) * 0.7;
      ctx.drawImage(this.warm, b.x - 200, b.y - 200, 400, 400);
    }
    for (const l of game.particles.lights) {
      const r = l.r * 0.7;
      ctx.globalAlpha = (l.t / l.max) * 0.6;
      ctx.drawImage(this.warm, l.x - r, l.y - r, r * 2, r * 2);
    }
    for (const f of game.structures.fires) {
      ctx.globalAlpha = Math.min(1, (f.life - f.t) / 1.2, f.t * 4) * 0.45;
      ctx.drawImage(this.warm, f.x - 170, f.y - 170, 340, 340);
    }
    if (game.muzzle > 0) {
      ctx.globalAlpha = game.muzzle * 0.35;
      ctx.drawImage(this.warm, game.muzzleX - 90, game.muzzleY - 90, 180, 180);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

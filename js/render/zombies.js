// Dibujo de la horda. La lógica vive en sim/zombies.js.
import { AIR, GOLDEN } from '../core/config.ts';
import { TAU } from '../core/util.ts';
import { zombieSprites, flameSprite } from './sprites.js';

// Juego de imágenes de un zombi (lo guarda en z.spr la primera vez). En el servidor no se usa.
export function zombieSprite(z) {
  if (!z.spr) z.spr = zombieSprites()[z.type][z.si];
  return z.spr;
}

export function drawHorde(ctx, list, view, base, layer) {
  // base = { z, tx, ty }: transformación cámara → pantalla
  const { z: s, tx, ty } = base;
  for (const z of list) {
    const isGiant = z.type === 'giant';
    if ((layer === 'giant') !== isGiant) continue;
    const spr = zombieSprite(z);
    const half = spr.half;
    if (z.x + half < view.x0 || z.x - half > view.x1 || z.y + half < view.y0 || z.y - half > view.y1) continue;
    const frames = z.flash > 0 ? spr.flash : spr.frames;
    const f = (((z.anim | 0) % frames.length) + frames.length) % frames.length;
    const img = frames[f];
    const ang = z.angle + z.tilt + (z.hitT > 0 ? z.hitJolt * (z.hitT / 0.18) : 0);
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const pop = z.hitT > 0 ? 1 + 0.08 * (z.hitT / 0.18) : 1;
    if (z.type === 'golden') {
      // aura dorada; parpadea cuando está por desaparecer
      const warn = z.life < GOLDEN.warnAt;
      const blink = warn ? 0.35 + 0.65 * Math.abs(Math.sin(z.life * 9)) : 1;
      ctx.setTransform(s, 0, 0, s, tx, ty);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * blink;
      ctx.fillStyle = '#e8b830';
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r * 2.1, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = blink;
    }
    const grow = z.spawnT > 0 ? 1 - z.spawnT * 0.5 : 1;
    const lift = z.air > 0 ? Math.min(z.air, AIR.max) : 0;
    // hinchado por el cohete clavado: crece y tiembla antes de reventar
    const swell = z.swell > 0 ? z.swell : 0;
    const k = s * pop * grow * (1 + lift / 140) * (1 + swell * 0.35 + (swell ? Math.sin(z.id + swell * 60) * 0.03 : 0));
    const shake = z.bs === 'windup' ? (Math.random() - 0.5) * 2.4 : swell ? (Math.random() - 0.5) * (2 + swell * 5) : 0;
    const lx = z.x + c * z.lunge * 5 + shake;
    const ly = z.y + sn * z.lunge * 5 - lift * 0.7 + shake;
    if (lift > 0) {
      // sombra en el suelo mientras vuela
      ctx.setTransform(s, 0, 0, s, tx, ty);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, z.r * 0.9, z.r * 0.6, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (z.type !== 'golden') {
      const al = z.spawnT > 0 ? 1 - z.spawnT : 1;
      if (ctx.globalAlpha !== al) ctx.globalAlpha = al;
    }
    ctx.setTransform(k * c, k * sn, -k * sn, k * c, tx + lx * s, ty + ly * s);
    ctx.drawImage(img, -half, -half, half * 2, half * 2);
    if (swell) {
      // brilla amarillo, cada vez más fuerte
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = swell * (0.45 + 0.35 * Math.abs(Math.sin(swell * 40)));
      ctx.drawImage(spr.flash[f], -half, -half, half * 2, half * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (z.burn > 0) {
      // llamas sobre el cuerpo (aditivas, parpadean)
      const fl = flameSprite();
      ctx.setTransform(s, 0, 0, s, tx, ty);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, z.burn * 0.8);
      for (let i = 0; i < 3; i++) {
        const a = z.id * 2.1 + i * 2.1;
        const fw = z.r * (0.8 + Math.random() * 0.35);
        const fh = fw * (1.4 + Math.random() * 0.5);
        const fx = lx + Math.cos(a) * z.r * 0.45;
        const fy = ly + Math.sin(a) * z.r * 0.45;
        ctx.drawImage(fl, fx - fw / 2, fy - fh * 0.8, fw, fh);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(s, 0, 0, s, tx, ty);
}

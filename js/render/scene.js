// Escena: dibujo de cada fotograma (mundo, zombis, luces, marcadores) y ajuste del lienzo y la calidad.
import { clamp, makeCanvas, TAU } from '../core/util.ts';
import { drawRobot } from './robot.js';
import { drawSurvivor } from './sprites.js';
import {
  drawMissiles,
  drawStuck,
  drawFires,
  drawGround,
  drawBlocks,
  drawMannedHeavy,
  drawGhost,
  drawGrenades,
  drawBars,
} from './build.js';
import { drawPickups } from './pickups.js';
import { drawBullets } from './bullets.js';
import { drawPeers, drawRemoteBullets } from './remote.js';
import { drawHorde } from './zombies.js';
import { setChunkView, drawGround as drawWorldGround, drawOverhead } from './world.js';

export function render(game) {
  const ctx = game.ctx;
  const W = game.canvas.width;
  const H = game.canvas.height;
  const cam = game.camera;
  const z = cam.zoom * game.dpr;
  const cx = cam.x + cam.sx;
  const cy = cam.y + cam.sy;
  const tx = Math.round(W / 2 - cx * z);
  const ty = Math.round(H / 2 - cy * z);
  const base = game.base;
  base.z = z;
  base.tx = tx;
  base.ty = ty;
  const v = game.view;
  v.x0 = -tx / z;
  v.y0 = -ty / z;
  v.x1 = (W - tx) / z;
  v.y1 = (H - ty) / z;
  const p = game.player;
  const playing = game.state !== 'menu' && game.state !== 'class';

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0c0e0b';
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(z, 0, 0, z, tx, ty);
  drawWorldGround(ctx, game.world, v.x0, v.y0, v.x1, v.y1);
  drawGround(ctx, game.structures, v);
  game.decals.drawPools(ctx, v);
  game.decals.draw(ctx, v);
  drawBlocks(ctx, game.structures, v);
  drawPickups(ctx, game.pickups.list, v, game.time);
  if (game.state === 'play' && p.alive && game.inv[game.buildSel] > 0)
    drawGhost(ctx, game.structures, game, game.buildSel, game.time);
  drawHorde(ctx, game.horde.list, v, base, 'small');
  drawFires(ctx, game.structures, v, game.time);
  drawStuck(ctx, game.structures, game.time);
  drawMissiles(ctx, game.structures, game.time);
  if (playing && game.robot.owned && !game.robot.piloted) drawRobot(ctx, game.robot, p, game.time);
  if (playing) {
    if (!p.alive) ctx.globalAlpha = 0.55;
    if (p.inRobot) drawRobot(ctx, game.robot, p, game.time);
    else drawSurvivor(ctx, p, game.time);
    ctx.globalAlpha = 1;
    drawPeers(ctx, game);
    drawMannedHeavy(ctx, game.structures);
  }
  drawHorde(ctx, game.horde.list, v, base, 'giant');
  drawBullets(ctx, game.bullets.list);
  drawRemoteBullets(ctx, game);
  drawGrenades(ctx, game.structures);
  drawOverhead(ctx, game.world, v.x0, v.y0, v.x1, v.y1, playing ? p : { x: -1e4, y: -1e4 }, game.time);
  game.particles.draw(ctx, v);

  game.lighting.render(game, base, v);
  game.lighting.composite(ctx, game, base, v, W, H);

  ctx.setTransform(z, 0, 0, z, tx, ty);
  if (playing) drawWorldUi(game, ctx);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawAsh(game, ctx, W, H);
  if (playing) {
    const lowHp = p.alive && p.hp < p.stats.maxHp * 0.3 ? (Math.sin(game.time * 6) * 0.5 + 0.5) * 0.35 : 0;
    const a = Math.max(game.hurtFlash * 0.8, lowHp, p.alive ? 0 : 0.6);
    if (a > 0.01) {
      ctx.globalAlpha = a;
      ctx.drawImage(game.redVignette, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    drawAcid(game, ctx, W, H);
    if (game.state === 'play') {
      drawGiantMarkers(game, ctx, W, H);
      if (game.input.mode === 'mouse' && p.alive) drawCrosshair(game, ctx);
    }
  }
}

export function drawWorldUi(game, ctx) {
  const v = game.view;
  drawBars(ctx, game.structures, v);
  for (const zb of game.horde.list) {
    if (zb.type === 'normal' || zb.type === 'sprinter' || zb.hp >= zb.maxHp) continue;
    if (zb.x < v.x0 || zb.x > v.x1 || zb.y < v.y0 || zb.y > v.y1) continue;
    const w = zb.r * 1.6;
    const y = zb.y - zb.r - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(zb.x - w / 2 - 1, y - 1, w + 2, 5);
    ctx.fillStyle = zb.type === 'giant' ? '#d9783a' : '#b5463a';
    ctx.fillRect(zb.x - w / 2, y, w * Math.max(0, zb.hp / zb.maxHp), 3);
  }
  const p = game.player;
  if (!p.alive) return;
  if (p.reloadT > 0) {
    const t = 1 - p.reloadT / p.reloadDur;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 12, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#e6e0d2';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 12, -Math.PI / 2, -Math.PI / 2 + t * TAU);
    ctx.stroke();
  }
  const tg = p.target;
  if (tg && !tg.dead && game.input.mode === 'touch') {
    const s = tg.r + 6;
    ctx.strokeStyle = 'rgba(217,120,58,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      ctx.moveTo(tg.x + sx * s, tg.y + sy * s * 0.45);
      ctx.lineTo(tg.x + sx * s, tg.y + sy * s);
      ctx.lineTo(tg.x + sx * s * 0.45, tg.y + sy * s);
    }
    ctx.stroke();
  }
}

export function drawAsh(game, ctx, W, H) {
  const cam = game.camera;
  const ox = (cam.x * 0.25) / game.cssW;
  const oy = (cam.y * 0.25) / game.cssH;
  ctx.fillStyle = 'rgba(200,195,180,0.32)';
  for (const a of game.ash) {
    a.y += a.v * 0.016;
    a.x += Math.sin(game.time * 0.6 + a.p) * 0.0004;
    if (a.y > 1) a.y -= 1;
    const x = ((((a.x - ox) % 1) + 1) % 1) * W;
    const y = ((((a.y - oy) % 1) + 1) % 1) * H;
    const s = a.s * game.dpr;
    ctx.fillRect(x, y, s, s);
  }
}

export function drawGiantMarkers(game, ctx, W, H) {
  const b = game.base;
  const m = 34 * game.dpr;
  const few = !game.director.queue.length && game.horde.list.length <= 5;
  for (const zb of game.horde.list) {
    if (zb.type !== 'giant' && zb.type !== 'golden' && !few) continue;
    const sx = zb.x * b.z + b.tx;
    const sy = zb.y * b.z + b.ty;
    if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
    const cx = W / 2;
    const cy = H / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const k = Math.min(Math.abs((W / 2 - m) / Math.cos(a)), Math.abs((H / 2 - m) / Math.sin(a)));
    const x = cx + Math.cos(a) * k;
    const y = cy + Math.sin(a) * k;
    const s = 12 * game.dpr;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle =
      zb.type === 'golden'
        ? 'rgba(240,192,64,0.95)'
        : zb.type === 'giant'
          ? 'rgba(217,120,58,0.9)'
          : 'rgba(230,224,210,0.75)';
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.6, -s * 0.8);
    ctx.lineTo(-s * 0.6, s * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function drawCrosshair(game, ctx) {
  const m = game.input.mouse;
  const x = m.x * game.dpr;
  const y = m.y * game.dpr;
  const p = game.player;
  const gap = (6 + (p.bloom + p.weapon.def.spread) * 60) * game.dpr;
  const len = 7 * game.dpr;
  ctx.lineWidth = 2 * game.dpr;
  /** @type {[string, number][]} */
  const rings = [
    ['rgba(0,0,0,0.6)', 4],
    ['#e6e0d2', 2],
  ];
  for (const [col, lw] of rings) {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw * game.dpr;
    ctx.beginPath();
    ctx.moveTo(x - gap - len, y);
    ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y);
    ctx.lineTo(x + gap + len, y);
    ctx.moveTo(x, y - gap - len);
    ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap);
    ctx.lineTo(x, y + gap + len);
    ctx.stroke();
  }
  if (p.reloadT > 0) {
    ctx.strokeStyle = '#d9783a';
    ctx.lineWidth = 2 * game.dpr;
    ctx.beginPath();
    ctx.arc(x, y, gap + len + 4 * game.dpr, -Math.PI / 2, -Math.PI / 2 + (1 - p.reloadT / p.reloadDur) * TAU);
    ctx.stroke();
  }
}

export function drawAcid(game, ctx, W, H) {
  if (!(game.acidT > 0)) return;
  const k = Math.min(1, game.acidT / 0.8);
  const pulse = 0.85 + 0.15 * Math.sin(game.time * 5);
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.7);
  g.addColorStop(0, `rgba(110,190,40,${0.22 * k * pulse})`);
  g.addColorStop(1, `rgba(60,130,20,${0.6 * k * pulse})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function makeVignette(game, rgb, a) {
  const W = Math.max(2, Math.round(game.canvas.width / 4));
  const H = Math.max(2, Math.round(game.canvas.height / 4));
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const r = Math.hypot(W, H) / 2;
  const gr = g.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
  gr.addColorStop(0, `rgba(${rgb},0)`);
  gr.addColorStop(1, `rgba(${rgb},${a})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  return c;
}

export function resize(game) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // calidad automática: en celulares lentos se dibuja con menos píxeles (ver adaptQuality)
  game.dpr = Math.max(0.6, Math.min(window.devicePixelRatio || 1, 2) * (game.quality || 1));
  game.canvas.width = Math.round(w * game.dpr);
  game.canvas.height = Math.round(h * game.dpr);
  game.cssW = w;
  game.cssH = h;
  const cam = game.camera;
  cam.zoom = clamp(Math.sqrt(w * h) / 680, 0.86, 1.5);
  cam.viewW = w / cam.zoom;
  cam.viewH = h / cam.zoom;
  game.lighting.resize(game.canvas.width, game.canvas.height);
  game.lighting.vignette = makeVignette(game, '0,0,0', 0.62);
  game.chunkScale = cam.zoom * game.dpr;
  game.maxChunks = (Math.ceil(cam.viewW / 512) + 2) * (Math.ceil(cam.viewH / 512) + 2) + 2;
  if (game.world) {
    setChunkView(game.world, game.chunkScale, game.maxChunks);
  }
  game.redVignette = makeVignette(game, '150,20,15', 0.85);
}

// Si el juego va lento (pocos FPS) baja la resolución de dibujo un paso; si va sobrado, la sube.
export function adaptQuality(game, dt) {
  if (game.state !== 'play') return;
  const q = (game.qStat = game.qStat || { t: 0, n: 0, good: 0 });
  q.t += dt;
  q.n++;
  if (q.t < 2) return;
  const fps = q.n / q.t;
  q.t = 0;
  q.n = 0;
  const steps = [1, 0.85, 0.7, 0.55];
  const i = Math.max(0, steps.indexOf(game.quality || 1));
  if (fps < 40 && i < steps.length - 1) {
    // muy lento: baja dos pasos de golpe
    game.quality = steps[Math.min(steps.length - 1, i + (fps < 25 ? 2 : 1))];
    q.good = 0;
    resize(game);
  } else if (fps > 57 && i > 0) {
    // sólo vuelve a subir tras un buen rato fluido, para no estar cambiando
    if (++q.good >= 5) {
      game.quality = steps[i - 1];
      q.good = 0;
      resize(game);
    }
  } else q.good = 0;
}

// Barricadas compradas en la tienda (madera, metal, vallas, alambre) y granadas.
import { SHOP } from './config.js';
import { TAU, rand, clamp } from './util.js';
import { OUT } from './sprites.js';

const SNAP = 20;
const BLAST_R = 140;
const near = [];

export class Structures {
  constructor() {
    this.blocks = [];
    this.wires = [];
    this.grenades = [];
    this.blasts = [];
    this.scorches = [];
  }

  clear() {
    this.blocks.length = 0;
    this.wires.length = 0;
    this.grenades.length = 0;
    this.blasts.length = 0;
    this.scorches.length = 0;
  }

  /* ---------- construcción ---------- */

  // Dónde caería el bloque: delante del jugador, alineado a una rejilla de 20 px.
  placement(game, kind) {
    const def = SHOP[kind];
    const p = game.player;
    const ca = Math.cos(p.angle);
    const sa = Math.sin(p.angle);
    let w = def.w;
    let h = def.h;
    // las piezas alargadas se colocan atravesadas a la dirección de la mira
    if (def.rotates && Math.abs(ca) > Math.abs(sa)) {
      w = def.h;
      h = def.w;
    }
    const dist = p.r + Math.max(w, h) / 2 + 14;
    const cx = p.x + ca * dist;
    const cy = p.y + sa * dist;
    const x = Math.round((cx - w / 2) / SNAP) * SNAP;
    const y = Math.round((cy - h / 2) / SNAP) * SNAP;
    let ok = game.world.rectFree(x, y, w, h);
    if (ok && !def.ground) {
      // no encima del jugador ni de un zombi
      const px = clamp(p.x, x, x + w);
      const py = clamp(p.y, y, y + h);
      if ((px - p.x) ** 2 + (py - p.y) ** 2 < p.r * p.r) ok = false;
      if (ok) {
        game.horde.grid.query(x - 50, y - 50, x + w + 50, y + h + 50, near);
        for (const z of near) {
          const zx = clamp(z.x, x, x + w);
          const zy = clamp(z.y, y, y + h);
          if ((zx - z.x) ** 2 + (zy - z.y) ** 2 < z.r * z.r) {
            ok = false;
            break;
          }
        }
      }
    }
    if (ok && !def.ground) {
      for (const b of this.blocks) {
        if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) {
          ok = false;
          break;
        }
      }
    }
    if (ok && def.ground) {
      for (const b of this.wires) {
        if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) {
          ok = false;
          break;
        }
      }
    }
    return { x, y, w, h, ok };
  }

  place(game, kind) {
    const pl = this.placement(game, kind);
    if (!pl.ok) return false;
    const def = SHOP[kind];
    if (def.ground) {
      this.wires.push({ kind, x: pl.x, y: pl.y, w: pl.w, h: pl.h, hp: def.hp, max: def.hp, hitT: 0 });
    } else {
      const o = { k: 0, x: pl.x, y: pl.y, w: pl.w, h: pl.h, low: true, block: true, kind, hp: def.hp, max: def.hp, hitT: 0 };
      this.blocks.push(o);
      game.world.addDynamic(o);
    }
    game.particles.dust(pl.x + pl.w / 2, pl.y + pl.h / 2, 20);
    return true;
  }

  damageBlock(game, o, dmg) {
    if (o.hp <= 0) return;
    o.hp -= dmg;
    o.hitT = 0.12;
    game.particles.impact(o.x + o.w / 2 + rand(-o.w, o.w) * 0.3, o.y + o.h / 2 + rand(-o.h, o.h) * 0.3, rand(-1, 1), rand(-1, 1));
    game.sfx.blockHit(o.kind);
    if (o.hp <= 0) {
      const i = this.blocks.indexOf(o);
      if (i >= 0) this.blocks.splice(i, 1);
      game.world.removeDynamic(o);
      game.particles.death(o.x + o.w / 2, o.y + o.h / 2, 18);
      game.sfx.blockBreak();
    }
  }

  // Llamado por cada zombi: ralentiza y hiere si está sobre alambre.
  wireAt(z, dt) {
    for (let i = 0; i < this.wires.length; i++) {
      const w = this.wires[i];
      if (z.x + z.r * 0.5 < w.x || z.x - z.r * 0.5 > w.x + w.w || z.y + z.r * 0.5 < w.y || z.y - z.r * 0.5 > w.y + w.h) continue;
      w.hp -= dt * 2.5 * Math.sqrt(z.mass);
      w.hitT = 0.1;
      if (w.hp <= 0) this.wires.splice(i, 1);
      return true;
    }
    return false;
  }

  /* ---------- granadas ---------- */

  throwGrenade(game, tx, ty) {
    const p = game.player;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.min(Math.hypot(dx, dy) || 1, 300);
    const a = Math.atan2(dy, dx);
    const ex = p.x + Math.cos(a) * d;
    const ey = p.y + Math.sin(a) * d;
    const dur = 0.25 + d / 650;
    this.grenades.push({ sx: p.x, sy: p.y, ex, ey, x: p.x, y: p.y, h: 0, t: 0, dur, fuse: dur + 0.55, rot: 0 });
  }

  explode(game, g) {
    const { x, y } = g;
    game.horde.grid.query(x - BLAST_R - 44, y - BLAST_R - 44, x + BLAST_R + 44, y + BLAST_R + 44, near);
    for (const z of near) {
      if (z.dead) continue;
      const dx = z.x - x;
      const dy = z.y - y;
      const d = Math.hypot(dx, dy);
      if (d > BLAST_R + z.r) continue;
      const f = clamp(1 - d / BLAST_R, 0, 1);
      const n = d || 1;
      game.hitZombie(z, { dmg: 330 * (0.35 + 0.65 * f), dx: dx / n, dy: dy / n, knock: 120 + 260 * f, shot: null }, z.x, z.y);
    }
    const p = game.player;
    const pd = Math.hypot(p.x - x, p.y - y);
    game.camera.shake(0.45 + 0.5 * clamp(1 - pd / 600, 0, 1));
    game.particles.explosion(x, y, BLAST_R);
    game.sfx.explosion();
    this.blasts.push({ x, y, t: 0.4 });
    this.scorches.push({ x, y, t: 0, life: 25, a: rand(0, TAU) });
    if (this.scorches.length > 20) this.scorches.shift();
  }

  update(dt, game) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.t += dt;
      const k = Math.min(1, g.t / g.dur);
      g.x = g.sx + (g.ex - g.sx) * k;
      g.y = g.sy + (g.ey - g.sy) * k;
      g.h = Math.sin(Math.PI * k) * (24 + g.dur * 30);
      if (k < 1) g.rot += dt * 14;
      if (g.t >= g.fuse) {
        this.grenades.splice(i, 1);
        this.explode(game, g);
      }
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      this.blasts[i].t -= dt;
      if (this.blasts[i].t <= 0) this.blasts.splice(i, 1);
    }
    for (const s of this.scorches) s.t += dt;
    while (this.scorches.length && this.scorches[0].t > this.scorches[0].life) this.scorches.shift();
    for (const b of this.blocks) b.hitT -= dt;
    for (const w of this.wires) w.hitT -= dt;
  }

  /* ---------- dibujo ---------- */

  drawGround(ctx, v) {
    for (const s of this.scorches) {
      if (s.x < v.x0 - 80 || s.x > v.x1 + 80 || s.y < v.y0 - 80 || s.y > v.y1 + 80) continue;
      ctx.globalAlpha = Math.min(1, (s.life - s.t) / 5) * 0.55;
      ctx.fillStyle = '#0d0c0a';
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = s.a + (i / 12) * TAU;
        const r = 52 + Math.sin(i * 2.7 + s.a) * 12;
        ctx.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const w of this.wires) {
      if (w.x > v.x1 || w.x + w.w < v.x0 || w.y > v.y1 || w.y + w.h < v.y0) continue;
      drawWire(ctx, w);
    }
  }

  drawBlocks(ctx, v) {
    for (const b of this.blocks) {
      if (b.x > v.x1 || b.x + b.w < v.x0 || b.y > v.y1 || b.y + b.h < v.y0) continue;
      drawBlock(ctx, b);
    }
  }

  drawGhost(ctx, game, kind, time) {
    const pl = this.placement(game, kind);
    const pulse = 0.55 + Math.sin(time * 6) * 0.15;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = pl.ok ? 'rgba(134,168,146,0.25)' : 'rgba(181,70,58,0.25)';
    ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
    ctx.strokeStyle = pl.ok ? '#86a892' : '#b5463a';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(pl.x + 1, pl.y + 1, pl.w - 2, pl.h - 2);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  drawGrenades(ctx) {
    for (const g of this.grenades) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(g.x + 2, g.y + 3, 6, 4, 0, 0, TAU);
      ctx.fill();
      const s = 1 + g.h / 60;
      ctx.save();
      ctx.translate(g.x, g.y - g.h);
      ctx.rotate(g.rot);
      ctx.scale(s, s);
      ctx.fillStyle = '#4a5a34';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 5, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = OUT;
      ctx.stroke();
      ctx.fillStyle = '#8a8a84';
      ctx.fillRect(4, -2, 4, 4);
      ctx.restore();
      if (g.t > g.dur && Math.sin(g.t * 30) > 0) {
        ctx.fillStyle = '#ff6a40';
        ctx.beginPath();
        ctx.arc(g.x, g.y, 2.2, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawBars(ctx, v) {
    for (const b of this.blocks) {
      if (b.hp >= b.max || b.x > v.x1 || b.x + b.w < v.x0 || b.y > v.y1 || b.y + b.h < v.y0) continue;
      const w = Math.max(28, b.w * 0.8);
      const x = b.x + b.w / 2 - w / 2;
      const y = b.y - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = '#c7a24a';
      ctx.fillRect(x, y, w * (b.hp / b.max), 3);
    }
  }
}

function drawBlock(ctx, b) {
  const { x, y, w, h } = b;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x + 5, y + 6, w, h);
  if (b.kind === 'wood') {
    ctx.fillStyle = '#7a5634';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(40,25,12,0.6)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + (h * i) / 4);
      ctx.lineTo(x + w, y + (h * i) / 4);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,220,170,0.1)';
    ctx.fillRect(x, y, w, 3);
    ctx.strokeStyle = '#5a3c22';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + w - 4, y + h - 4);
    ctx.stroke();
    ctx.fillStyle = '#b8b2a4';
    for (const [nx, ny] of [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]]) ctx.fillRect(x + nx - 1, y + ny - 1, 2.5, 2.5);
  } else if (b.kind === 'metal') {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#8a8f93');
    g.addColorStop(1, '#5c6166');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(30,32,34,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
    ctx.strokeStyle = 'rgba(220,225,230,0.25)';
    ctx.beginPath();
    ctx.moveTo(x + 6, y + h - 6);
    ctx.lineTo(x + w - 6, y + 6);
    ctx.stroke();
    ctx.fillStyle = '#3d4044';
    for (const [nx, ny] of [[4, 4], [w - 4, 4], [4, h - 4], [w - 4, h - 4]]) {
      ctx.beginPath();
      ctx.arc(x + nx, y + ny, 2, 0, TAU);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#3c4146';
    ctx.fillRect(x, y, w, h);
    const horiz = w > h;
    ctx.strokeStyle = 'rgba(150,158,165,0.65)';
    ctx.lineWidth = 1.2;
    const L = horiz ? w : h;
    const S = horiz ? h : w;
    for (let i = -S; i < L; i += 8) {
      ctx.beginPath();
      if (horiz) {
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i + S, y + h);
        ctx.moveTo(x + i + S, y);
        ctx.lineTo(x + i, y + h);
      } else {
        ctx.moveTo(x, y + i);
        ctx.lineTo(x + w, y + i + S);
        ctx.moveTo(x, y + i + S);
        ctx.lineTo(x + w, y + i);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#25282b';
    if (horiz) {
      ctx.fillRect(x, y, 8, h);
      ctx.fillRect(x + w - 8, y, 8, h);
      ctx.fillRect(x + w / 2 - 3, y, 6, h);
    } else {
      ctx.fillRect(x, y, w, 8);
      ctx.fillRect(x, y + h - 8, w, 8);
      ctx.fillRect(x, y + h / 2 - 3, w, 6);
    }
    ctx.fillStyle = '#c7a24a';
    for (let i = 0; i < 2; i++) {
      if (horiz) ctx.fillRect(x + (i ? w - 8 : 0), y + 2, 8, 4);
      else ctx.fillRect(x + 2, y + (i ? h - 8 : 0), 4, 8);
    }
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUT;
  ctx.strokeRect(x, y, w, h);
  const dmg = 1 - b.hp / b.max;
  if (dmg > 0.35) {
    ctx.strokeStyle = 'rgba(15,12,10,0.75)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + h * 0.1);
    ctx.lineTo(x + w * 0.45, y + h * 0.5);
    ctx.lineTo(x + w * 0.3, y + h * 0.9);
    if (dmg > 0.65) {
      ctx.moveTo(x + w * 0.8, y + h * 0.15);
      ctx.lineTo(x + w * 0.55, y + h * 0.55);
      ctx.lineTo(x + w * 0.85, y + h * 0.85);
    }
    ctx.stroke();
  }
  if (b.hitT > 0) {
    ctx.fillStyle = 'rgba(255,240,220,0.35)';
    ctx.fillRect(x, y, w, h);
  }
}

function drawWire(ctx, w) {
  const { x, y } = w;
  const horiz = w.w > w.h;
  const L = horiz ? w.w : w.h;
  const S = horiz ? w.h : w.w;
  ctx.globalAlpha = 0.5 + 0.5 * (w.hp / w.max);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y, w.w, w.h);
  ctx.strokeStyle = w.hitT > 0 ? '#e6e0d2' : '#9a9a92';
  ctx.lineWidth = 1.4;
  for (const off of [0.3, 0.7]) {
    ctx.beginPath();
    for (let t = 0; t <= L; t += 6) {
      const wave = Math.sin(t * 0.55 + off * 9) * S * 0.18;
      const px = horiz ? x + t : x + S * off + wave;
      const py = horiz ? y + S * off + wave : y + t;
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = '#c9c4b6';
  ctx.lineWidth = 1;
  for (let t = 4; t < L; t += 10) {
    const px = horiz ? x + t : x + S * 0.5;
    const py = horiz ? y + S * 0.5 : y + t;
    ctx.beginPath();
    ctx.moveTo(px - 3, py - 3);
    ctx.lineTo(px + 3, py + 3);
    ctx.moveTo(px + 3, py - 3);
    ctx.lineTo(px - 3, py + 3);
    ctx.stroke();
  }
  ctx.fillStyle = '#4a3a2a';
  if (horiz) {
    ctx.fillRect(x, y + S / 2 - 3, 5, 6);
    ctx.fillRect(x + w.w - 5, y + S / 2 - 3, 5, 6);
  } else {
    ctx.fillRect(x + S / 2 - 3, y, 6, 5);
    ctx.fillRect(x + S / 2 - 3, y + w.h - 5, 6, 5);
  }
  ctx.globalAlpha = 1;
}

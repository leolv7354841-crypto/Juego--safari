// Dibujo de barricadas, trampas, torreta pesada, granadas, fuegos y cohetes. La lógica vive en sim/build.js.
import { ABILITY } from '../core/config.ts';
import { TAU, roundRect } from '../core/util.ts';
import { OUT, flameSprite } from './sprites.js';
import { drawRocket } from './bullets.js';
import { heavyLevel, heavyLevels } from '../sim/heavy.ts';

// Mira roja en el suelo que se cierra y el misil cayendo en picada sobre ella.
export function drawMissiles(ctx, st, time) {
  const R = ABILITY.bomber.radius;
  for (const m of st.missiles) {
    const k = Math.min(1, m.t / m.dur);
    const blink = 0.55 + 0.45 * Math.abs(Math.sin(time * (6 + k * 18)));
    ctx.save();
    ctx.globalAlpha = 0.12 + 0.12 * k;
    ctx.fillStyle = '#b5302a';
    ctx.beginPath();
    ctx.arc(m.x, m.y, R, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.5 * blink;
    ctx.strokeStyle = '#ff5a40';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 12]);
    ctx.beginPath();
    ctx.arc(m.x, m.y, R, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    // mira que se cierra hacia el punto de impacto
    const rr = 30 + (1 - k) * 120;
    ctx.globalAlpha = 0.9 * blink;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(m.x, m.y, rr, 0, TAU);
    ctx.moveTo(m.x - rr - 14, m.y);
    ctx.lineTo(m.x - rr + 10, m.y);
    ctx.moveTo(m.x + rr - 10, m.y);
    ctx.lineTo(m.x + rr + 14, m.y);
    ctx.moveTo(m.x, m.y - rr - 14);
    ctx.lineTo(m.x, m.y - rr + 10);
    ctx.moveTo(m.x, m.y + rr - 10);
    ctx.lineTo(m.x, m.y + rr + 14);
    ctx.stroke();
    // sombra que crece mientras baja
    ctx.globalAlpha = 0.15 + 0.35 * k;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, 6 + 16 * k, 4 + 9 * k, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    const h = (1 - k) * (1 - k) * 900;
    ctx.save();
    ctx.translate(m.x, m.y - h);
    ctx.scale(2.2, 2.2);
    drawRocket(ctx, 0, 0, Math.PI / 2, true);
    ctx.restore();
  }
}

export function drawStuck(ctx, st, time) {
  for (const r of st.stuck) {
    const glowing = r.glow && r.t > r.stick;
    if (glowing) {
      // brillo verde que pulsa cada vez más rápido antes de estallar
      const k = (r.t - r.stick) / r.glow;
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(time * (10 + k * 30)));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (0.35 + 0.5 * k) * pulse;
      const g = ctx.createRadialGradient(r.x, r.y, 2, r.x, r.y, 30 + k * 30);
      g.addColorStop(0, 'rgba(255,250,170,1)');
      g.addColorStop(0.5, 'rgba(255,200,40,0.65)');
      g.addColorStop(1, 'rgba(230,140,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 30 + k * 30, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // sólo asoma la cola del cohete: la ojiva está dentro
    drawRocket(ctx, r.x - Math.cos(r.ang || 0) * 6, r.y - Math.sin(r.ang || 0) * 6, r.ang || 0, false);
    if (glowing) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,230,90,0.9)';
      ctx.beginPath();
      ctx.arc(r.x, r.y, 4, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

export function drawFires(ctx, st, v, time) {
  if (!st.fires.length) return;
  const fl = flameSprite();
  for (const f of st.fires) {
    if (f.x + f.r < v.x0 || f.x - f.r > v.x1 || f.y + f.r < v.y0 || f.y - f.r > v.y1) continue;
    const grow = Math.min(1, f.t * 4);
    const fade = Math.min(1, (f.life - f.t) / 1.2);
    // charco encendido en el suelo
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 * fade;
    const g = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.r * grow);
    g.addColorStop(0, 'rgba(255,170,60,0.9)');
    g.addColorStop(0.6, 'rgba(220,80,20,0.5)');
    g.addColorStop(1, 'rgba(160,40,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * grow, 0, TAU);
    ctx.fill();
    // lenguas de fuego que bailan
    for (const q of f.flames) {
      const fx = f.x + (q.x - f.x) * grow;
      const fy = f.y + (q.y - f.y) * grow;
      const flick = 0.8 + 0.25 * Math.sin(time * 11 + q.ph) + 0.12 * Math.sin(time * 23 + q.ph * 2);
      const w = 20 * q.s * flick * fade;
      const h = w * (1.5 + 0.3 * Math.sin(time * 7 + q.ph));
      ctx.globalAlpha = 0.85 * fade;
      ctx.drawImage(fl, fx - w / 2, fy - h * 0.85, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

export function drawGround(ctx, st, v) {
  for (const s of st.scorches) {
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
  for (const w of st.wires) {
    if (w.x > v.x1 || w.x + w.w < v.x0 || w.y > v.y1 || w.y + w.h < v.y0) continue;
    if (w.kind === 'spikes') drawSpikes(ctx, w);
    else if (w.kind === 'mine') drawMine(ctx, w, st.time || 0);
    else drawWire(ctx, w);
  }
}

export function drawBlocks(ctx, st, v) {
  for (const b of st.blocks) {
    if (b.x > v.x1 || b.x + b.w < v.x0 || b.y > v.y1 || b.y + b.h < v.y0) continue;
    if (b.layer) {
      // pieza encimada: un poco más arriba, con sombra sobre la de abajo
      const up = b.layer * 4;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(b.x + 2, b.y + 3 - up + 4, b.w, b.h);
      ctx.save();
      ctx.translate(0, -up);
      drawBlock(ctx, b);
      ctx.restore();
    } else drawBlock(ctx, b);
  }
}

// El cañón de las torretas pesadas montadas va encima de quien las maneja.
export function drawMannedHeavy(ctx, st) {
  for (const b of st.blocks) if (b.kind === 'heavy' && b.manned) drawHeavyGun(ctx, b);
}

export function drawGhost(ctx, st, game, kind, time) {
  const pl = st.placement(game, kind);
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

export function drawGrenades(ctx, st) {
  for (const g of st.grenades) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(g.x + 2, g.y + 3, 6, 4, 0, 0, TAU);
    ctx.fill();
    const s = 1 + g.h / 60;
    ctx.save();
    ctx.translate(g.x, g.y - g.h);
    ctx.rotate(g.rot);
    ctx.scale(s, s);
    if (g.kind === 'molotov') {
      drawBottle(ctx);
      ctx.restore();
      continue;
    }
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

export function drawBars(ctx, st, v) {
  for (const b of st.blocks) {
    if (b.x > v.x1 || b.x + b.w < v.x0 || b.y > v.y1 || b.y + b.h < v.y0) continue;
    const up = (b.layer || 0) * 4;
    if (b.layer && st.topOf(b) === b) {
      // cuántas piezas hay apiladas
      ctx.font = '700 9px sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(b.x + b.w - 15, b.y - up - 1, 16, 11);
      ctx.fillStyle = '#e6e0d2';
      ctx.fillText(`x${b.layer + 1}`, b.x + b.w - 13, b.y - up + 8);
    }
    if (b.hp >= b.max) continue;
    const w = Math.max(28, b.w * 0.8);
    const x = b.x + b.w / 2 - w / 2;
    const y = b.y - 9 - up;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = '#c7a24a';
    ctx.fillRect(x, y, w * (b.hp / b.max), 3);
  }
}

// Torreta pesada (inspirada en la torreta de Gears of War 4): trípode y cañón doble blindado.
// Las mejoras se ven: sacos de arena y placas (blindaje), cañones más gruesos (calibre), aletas
// de cobre (cadencia), cajas de munición rojas (carga explosiva) y un sensor con láser (piloto).
function drawHeavy(ctx, b) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const armor = heavyLevel(b, 'armor');
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx + 4, cy + 6, 24 + armor * 3, 20 + armor * 3, 0, 0, TAU);
  ctx.fill();
  if (armor) drawSandbags(ctx, cx, cy, armor);
  // patas del trípode
  ctx.lineCap = 'round';
  for (const [lw, col] of [
    [7, OUT],
    [4, armor >= 2 ? '#5d646b' : '#4a5056'],
  ]) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = col;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = (k * TAU) / 3 - Math.PI / 2;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 21, cy + Math.sin(a) * 21);
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#2a2e32';
  const foot = 7 + (armor >= 3 ? 3 : 0);
  for (let k = 0; k < 3; k++) {
    const a = (k * TAU) / 3 - Math.PI / 2;
    ctx.fillRect(cx + Math.cos(a) * 21 - foot / 2, cy + Math.sin(a) * 21 - foot / 2, foot, foot);
  }
  // anillo de giro
  ctx.fillStyle = b.hitT > 0 ? '#8a9096' : '#3a3f44';
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  if (!b.manned) drawHeavyGun(ctx, b);
}

// Parapeto de sacos de arena alrededor del trípode: más sacos con cada nivel de blindaje.
function drawSandbags(ctx, cx, cy, lv) {
  const n = [0, 5, 8, 11][lv];
  const R = 29;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < n; i++) {
    // empiezan detrás y rodean hacia delante (la boca del cañón queda libre en el nivel 3)
    const a = Math.PI + ((i - (n - 1) / 2) * TAU) / 13;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = i % 2 ? '#8b7a52' : '#7a6a46';
    roundRect(ctx, -7.5, -4.5, 15, 9, 4);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,30,15,0.55)';
    ctx.beginPath();
    ctx.moveTo(-3, -3.5);
    ctx.lineTo(-3, 3.5);
    ctx.moveTo(3, -3.5);
    ctx.lineTo(3, 3.5);
    ctx.stroke();
    ctx.restore();
  }
}

const FIN = ['#4c5258', '#6e5a44', '#8d6236', '#b0702a'];
const STRIPE = ['#c9a54a', '#d98a3a', '#d9603a', '#e8402c'];

function drawHeavyGun(ctx, b) {
  const lv = heavyLevels(b);
  const now = performance.now() / 1000;
  ctx.save();
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  ctx.rotate(b.ang || 0);
  ctx.strokeStyle = OUT;
  // láser del piloto automático: sólo cuando nadie la maneja
  if (lv.auto && !b.manned) {
    const gr = ctx.createLinearGradient(44, 0, 190, 0);
    gr.addColorStop(0, 'rgba(255,70,50,0.55)');
    gr.addColorStop(1, 'rgba(255,70,50,0)');
    ctx.strokeStyle = gr;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(44, 0);
    ctx.lineTo(190, 0);
    ctx.stroke();
    ctx.strokeStyle = OUT;
  }
  // dos cañones con camisa de aletas y freno de boca; retrocede el que acaba de disparar.
  // El calibre los hace más largos y gruesos; la cadencia, más aletas y de cobre.
  const len = 32 + lv.cal * 3;
  const th = 5.2 + lv.cal * 0.9;
  const fins = 4 + lv.rate;
  const brake = 7 + lv.cal * 1.2;
  for (const s of [-1, 1]) {
    const k = b.side === s ? (b.recoil || 0) * 4 : 0;
    const y = s * 7;
    ctx.lineWidth = 1.2;
    ctx.fillStyle = '#25282b';
    ctx.fillRect(6 - k, y - th / 2, len, th);
    ctx.strokeRect(6 - k, y - th / 2, len, th);
    ctx.fillStyle = FIN[lv.rate];
    const gap = Math.min(4.5, 18 / fins);
    for (let i = 0; i < fins; i++) ctx.fillRect(14 + i * gap - k, y - th / 2 - 1, 2.2, th + 2);
    ctx.fillStyle = '#3b4045';
    const bx = 4 + len - k;
    ctx.fillRect(bx, y - brake / 2, 7, brake);
    ctx.strokeRect(bx, y - brake / 2, 7, brake);
    ctx.fillStyle = '#0e0f10';
    ctx.fillRect(bx + 5.5, y - 1.2, 1.5, 2.4);
    if (b.flash > 0 && b.side === s) {
      ctx.fillStyle = 'rgba(255,214,140,0.95)';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const d = i % 2 ? 3 : 9 + Math.random() * 6;
        ctx.lineTo(bx + 10 + Math.cos(a) * d * 1.4, y + Math.sin(a) * d * 0.7);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  // cajas blindadas de cada cañón, con franja (más roja con la carga explosiva) y remaches
  ctx.lineWidth = 1.6;
  for (const s of [-1, 1]) {
    const y = s < 0 ? -14 : 2;
    roundRect(ctx, -13, y, 24, 12, 3);
    ctx.fillStyle = b.hitT > 0 ? '#b8bec4' : '#7b838a';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = STRIPE[lv.blast];
    ctx.fillRect(-10, s < 0 ? y + 1.5 : y + 8.5, 17, 2);
    if (lv.blast) {
      // munición explosiva: rombo de peligro que brilla en el nivel máximo
      const gx = -1;
      const gy = y + 6;
      if (lv.blast >= 3) {
        ctx.fillStyle = `rgba(255,90,50,${0.25 + 0.2 * Math.sin(now * 6)})`;
        ctx.beginPath();
        ctx.arc(gx, gy, 5, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = STRIPE[lv.blast];
      ctx.beginPath();
      ctx.moveTo(gx, gy - 3);
      ctx.lineTo(gx + 3, gy);
      ctx.lineTo(gx, gy + 3);
      ctx.lineTo(gx - 3, gy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#3a3f44';
    ctx.fillRect(-10, y + 5, 2, 2);
    ctx.fillRect(5, y + 5, 2, 2);
  }
  // escudo frontal en ángulo: más ancho y con alas con el blindaje
  const w = 19 + lv.armor * 2.5;
  ctx.beginPath();
  ctx.moveTo(8, -w);
  ctx.lineTo(13 + lv.armor, -w + 3);
  ctx.lineTo(13 + lv.armor, -10);
  ctx.lineTo(10, -10);
  ctx.lineTo(10, 10);
  ctx.lineTo(13 + lv.armor, 10);
  ctx.lineTo(13 + lv.armor, w - 3);
  ctx.lineTo(8, w);
  ctx.closePath();
  ctx.fillStyle = ['#9aa2a8', '#a7afb5', '#b4bcc2', '#c3cad0'][lv.armor];
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#c9a54a';
  ctx.fillRect(11, -w + 4, 1.6, 4);
  ctx.fillRect(11, w - 8, 1.6, 4);
  if (lv.armor >= 2) {
    // remaches de las placas añadidas
    ctx.fillStyle = '#5a6066';
    for (const yy of [-w + 10, -14, 13, w - 11]) ctx.fillRect(10.5, yy, 2, 2);
  }
  // núcleo y asas de atrás (donde se agarra quien la maneja)
  ctx.fillStyle = '#2e3236';
  ctx.beginPath();
  ctx.arc(-2, 0, 5.5, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // luz: verde si la manejan, ámbar parpadeando con el piloto automático, roja si está sola
  const blink = Math.sin(now * 7) > 0;
  ctx.fillStyle = b.manned ? '#7fe07a' : lv.auto ? (blink ? '#ffb040' : '#6a4a1a') : '#b5463a';
  ctx.fillRect(-3, -1, 2, 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#2a2e32';
  ctx.beginPath();
  ctx.moveTo(-13, -9);
  ctx.lineTo(-19, -11);
  ctx.moveTo(-13, 9);
  ctx.lineTo(-19, 11);
  ctx.stroke();
  if (lv.auto) {
    // sensor del piloto automático: caja con lente y antena con la punta que parpadea
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = OUT;
    roundRect(ctx, -11, -4, 8, 8, 2);
    ctx.fillStyle = '#3d4348';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = b.manned ? '#2a5a2a' : '#ff4a36';
    ctx.beginPath();
    ctx.arc(-7, 0, 2.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2a2e32';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(-15, -16);
    ctx.stroke();
    ctx.fillStyle = blink ? '#ff6a50' : '#5a1a14';
    ctx.fillRect(-16.5, -17.5, 3, 3);
  }
  ctx.restore();
}

// Vista previa del taller: la torreta (con sus mejoras) girando despacio y disparando de vez en cuando;
// pulse > 0 justo después de comprar una mejora (un destello que se abre).
export function drawHeavyPreview(ctx, b, W, H, t, pulse) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // el cañón apunta hacia arriba: el centro va un poco abajo para que quepa entero
  const s = Math.min(W, H) / 95;
  ctx.setTransform(s, 0, 0, s, W / 2, H * 0.6);
  const ph = (t * 2.2) % 1;
  const shot = Math.floor(t * 2.2);
  const v = {
    ...b,
    x: -20,
    y: -20,
    ang: -Math.PI / 2 + Math.sin(t * 0.6) * 0.9,
    manned: null,
    hitT: 0,
    side: shot % 2 ? 1 : -1,
    recoil: Math.max(0, 1 - ph * 5),
    flash: ph < 0.08 ? 1 : 0,
  };
  drawHeavy(ctx, v);
  if (pulse > 0) {
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#c7a24a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 30 + (1 - pulse) * 30, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// Aviso sobre la torreta pesada que tienes al lado (con teclado): montar y mejorar.
export function drawHeavyPrompt(ctx, game) {
  const p = game.player;
  // montado y disparando no estorba la vista
  if (game.input.mode !== 'mouse' || !p.alive || p.inRobot || (p.manned && game.input.firing)) return;
  const b = game.structures.heavyFor(p);
  if (!b) return;
  const parts = p.manned
    ? [
        ['M', 'mejorar'],
        ['E', 'bajar'],
      ]
    : [
        ['E', 'montar'],
        ['M', 'mejorar'],
      ];
  ctx.font = '600 12px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  // ancho total: [tecla] palabra  [tecla] palabra
  const widths = parts.map(([, t]) => 14 + 4 + ctx.measureText(t).width);
  const w = widths.reduce((a, q) => a + q, 0) + 12 * (parts.length - 1) + 14;
  const x0 = b.x + b.w / 2 - w / 2;
  const y = b.y - 24;
  ctx.fillStyle = 'rgba(15,17,13,0.8)';
  ctx.fillRect(x0, y - 11, w, 22);
  ctx.strokeStyle = 'rgba(199,162,74,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y - 10.5, w - 1, 21);
  let x = x0 + 7;
  parts.forEach(([k, t], i) => {
    ctx.fillStyle = '#c7a24a';
    ctx.fillRect(x, y - 7, 14, 14);
    ctx.fillStyle = '#1d1607';
    ctx.textAlign = 'center';
    ctx.fillText(k, x + 7, y + 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e6e0d2';
    ctx.fillText(t, x + 18, y + 1);
    x += widths[i] + 12;
  });
}

function drawBlock(ctx, b) {
  if (b.kind === 'heavy') return drawHeavy(ctx, b);
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
    for (const [nx, ny] of [
      [5, 5],
      [w - 5, 5],
      [5, h - 5],
      [w - 5, h - 5],
    ])
      ctx.fillRect(x + nx - 1, y + ny - 1, 2.5, 2.5);
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
    for (const [nx, ny] of [
      [4, 4],
      [w - 4, 4],
      [4, h - 4],
      [w - 4, h - 4],
    ]) {
      ctx.beginPath();
      ctx.arc(x + nx, y + ny, 2, 0, TAU);
      ctx.fill();
    }
  } else if (b.kind === 'sandbag') {
    const horiz = w > h;
    const n = Math.round((horiz ? w : h) / 20);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < n; i++) {
        const off = row ? 10 : 0;
        const along = Math.min((horiz ? w : h) - 10, 10 + i * 20 + off);
        const across = (horiz ? h : w) * (row ? 0.68 : 0.32);
        const cx = horiz ? x + along : x + across;
        const cy = horiz ? y + across : y + along;
        ctx.fillStyle = (i + row) % 2 ? '#8a7d5c' : '#7f7354';
        ctx.beginPath();
        ctx.ellipse(cx, cy, horiz ? 10.5 : w * 0.3, horiz ? h * 0.3 : 10.5, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  } else if (b.kind === 'concrete') {
    ctx.fillStyle = '#8c8a84';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#a3a19a';
    if (w > h) ctx.fillRect(x, y + 3, w, h * 0.35);
    else ctx.fillRect(x + 3, y, w * 0.35, h);
    ctx.fillStyle = 'rgba(40,38,34,0.35)';
    for (let i = 0; i < 6; i++) ctx.fillRect(x + ((i * 37) % w), y + ((i * 13) % h), 3, 3);
    ctx.fillStyle = 'rgba(199,162,74,0.8)';
    if (w > h) {
      ctx.fillRect(x + 6, y + h - 6, 10, 3);
      ctx.fillRect(x + w - 16, y + h - 6, 10, 3);
    } else {
      ctx.fillRect(x + w - 6, y + 6, 3, 10);
      ctx.fillRect(x + w - 6, y + h - 16, 3, 10);
    }
  } else if (b.kind === 'hesco') {
    // Celdas cuadradas de malla con geotextil beige, vistas desde arriba con la arena dentro.
    const horiz = w >= h;
    const S = horiz ? h : w;
    const n = Math.max(1, Math.round((horiz ? w : h) / S));
    const L = (horiz ? w : h) / n;
    for (let i = 0; i < n; i++) {
      const cx = horiz ? x + i * L : x;
      const cy = horiz ? y : y + i * L;
      const cw = horiz ? L : w;
      const ch = horiz ? h : L;
      ctx.fillStyle = '#c9b98c';
      ctx.fillRect(cx, cy, cw, ch);
      ctx.fillStyle = '#a8966a';
      ctx.fillRect(cx + 4, cy + 4, cw - 8, ch - 8);
      ctx.fillStyle = 'rgba(70,58,36,0.3)';
      ctx.fillRect(cx + 4, cy + 4, cw - 8, 3);
      ctx.fillRect(cx + 4, cy + 4, 3, ch - 8);
      ctx.fillStyle = 'rgba(60,50,30,0.35)';
      for (let k = 0; k < 5; k++)
        ctx.fillRect(cx + 8 + ((k * 13 + i * 7) % (cw - 16)), cy + 8 + ((k * 11 + i * 5) % (ch - 16)), 2, 2);
    }
    ctx.strokeStyle = 'rgba(95,98,98,0.85)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let gx = x + 4; gx < x + w; gx += 6) {
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + 4);
      ctx.moveTo(gx, y + h - 4);
      ctx.lineTo(gx, y + h);
    }
    for (let gy = y + 4; gy < y + h; gy += 6) {
      ctx.moveTo(x, gy);
      ctx.lineTo(x + 4, gy);
      ctx.moveTo(x + w - 4, gy);
      ctx.lineTo(x + w, gy);
    }
    ctx.stroke();
    ctx.strokeStyle = '#6e7070';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      if (horiz) {
        ctx.moveTo(x + i * L, y);
        ctx.lineTo(x + i * L, y + h);
      } else {
        ctx.moveTo(x, y + i * L);
        ctx.lineTo(x + w, y + i * L);
      }
    }
    ctx.stroke();
    ctx.fillStyle = '#4d5050';
    for (let i = 0; i <= n; i++) {
      const px = horiz ? x + i * L : x;
      const py = horiz ? y : y + i * L;
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      ctx.fillRect(px - 1.5 + (horiz ? 0 : w), py - 1.5 + (horiz ? h : 0), 3, 3);
    }
  } else if (b.kind === 'turret') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.fillStyle = '#3d4246';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#c7a24a';
    ctx.fillRect(x + 2, y + 2, 6, 6);
    ctx.fillRect(x + w - 8, y + h - 8, 6, 6);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(b.ang || 0);
    ctx.fillStyle = '#1e2124';
    ctx.fillRect(4, -2.5, 20, 5);
    ctx.fillStyle = '#5c6268';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.fillStyle = '#b5463a';
    ctx.fillRect(2, -2, 4, 4);
    if (b.flash > 0) {
      ctx.fillStyle = 'rgba(255,214,140,0.95)';
      ctx.beginPath();
      ctx.arc(26, 0, 5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
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

function drawSpikes(ctx, w) {
  const { x, y } = w;
  ctx.globalAlpha = 0.55 + 0.45 * (w.hp / w.max);
  ctx.fillStyle = '#4a4740';
  ctx.fillRect(x, y, w.w, w.h);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w.w, w.h);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const px = x + 6 + i * ((w.w - 12) / 3);
      const py = y + 6 + j * ((w.h - 12) / 3);
      ctx.fillStyle = w.hitT > 0 ? '#e6e0d2' : '#b8b2a4';
      ctx.beginPath();
      ctx.moveTo(px, py - 4);
      ctx.lineTo(px + 3, py + 3);
      ctx.lineTo(px - 3, py + 3);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawMine(ctx, w, time) {
  const cx = w.x + w.w / 2;
  const cy = w.y + w.h / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, 10, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#4a5236';
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.fillStyle = '#6a7050';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = Math.sin(time * 6 + cx) > 0 ? '#ff5a3a' : '#5a2a20';
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, TAU);
  ctx.fill();
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

// Botella de molotov con trapo encendido (dibujada en el origen, apuntando a +x).
export function drawBottle(ctx, lit = true) {
  ctx.fillStyle = 'rgba(120,150,90,0.9)';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 6, 4, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(200,120,40,0.8)';
  ctx.beginPath();
  ctx.ellipse(-2, 0.5, 4, 2.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,150,90,0.95)';
  ctx.fillRect(4, -1.6, 4, 3.2);
  ctx.strokeRect(4, -1.6, 4, 3.2);
  ctx.fillStyle = '#d8ccb0';
  ctx.fillRect(8, -1.2, 3, 2.4);
  if (lit) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,170,60,0.9)';
    ctx.beginPath();
    ctx.arc(11.5, 0, 2.6 + Math.random() * 1.4, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}

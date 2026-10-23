// Dibuja personajes con sus piezas del atlas: de pie (caminar, correr, girar, golpear,
// reaccionar a impactos) o tirados como ragdoll. Brazos y piernas se trazan cada fotograma
// para que la animación sea continua a cualquier velocidad.
import { drawSprite } from './atlas.js';
import { OUT, LW } from './art/characters.js';
import { clamp, angleDiff, lerp } from './util.js';

function limb(g, pts, w, color, mode) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  if (mode === 'ghost') {
    g.strokeStyle = '#1f8fd8';
    g.lineWidth = w + LW * 1.6;
    g.stroke();
    g.strokeStyle = '#6fe0ff';
    g.lineWidth = w * 0.6;
    g.stroke();
    return;
  }
  g.strokeStyle = OUT;
  g.lineWidth = w + LW * 1.8;
  g.stroke();
  g.strokeStyle = mode === 'flash' ? '#fff4ea' : color;
  g.lineWidth = w;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = w * 0.32;
  g.stroke();
}

const sprOf = (kit, name, mode) => (mode === 'flash' ? kit[name + 'F'] : mode === 'ghost' ? kit[name + 'S'] : kit[name]);

// c: { x, y, face, legAng, look, phase, amp, run, hyper, punch, punchSide, swing, prop, scale }
export function drawStanding(g, kit, c, mode, props) {
  const r = kit.r;
  const b = kit.st.build;
  const amp = c.amp || 0;
  const hyper = c.hyper || 0;
  g.save();
  g.translate(c.x, c.y);
  if (c.scale && c.scale !== 1) g.scale(c.scale, c.scale);

  /* piernas: orientadas al movimiento */
  const lc = Math.cos(c.legAng);
  const ls = Math.sin(c.legAng);
  const stride = r * (0.55 + (c.run || 0) * 0.25) * amp;
  const P = (lx, ly) => [lx * lc - ly * ls, lx * ls + ly * lc];
  if (hyper > 0.35) {
    // supervelocidad: las piernas se vuelven un remolino borroso (estilo dibujo animado)
    g.globalAlpha = mode === 'ghost' ? 0.5 : 0.55;
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1]) {
        const ph = c.phase * 1.3 + i * 0.8 + (side > 0 ? Math.PI : 0);
        const f = Math.sin(ph) * r * 1.05;
        const [hx, hy] = P(-0.05 * r, side * 0.28 * r * b);
        const [fx, fy] = P(f, side * 0.34 * r * b);
        limb(g, [hx, hy, fx, fy], r * 0.34, kit.pants, mode);
        if (mode !== 'ghost') drawSprite(g, kit.shoe, fx, fy, c.legAng);
      }
    }
    g.globalAlpha = 1;
  } else {
    for (const side of [-1, 1]) {
      const ph = c.phase + (side > 0 ? Math.PI : 0);
      const fwd = Math.sin(ph) * stride + 0.04 * r;
      const lift = Math.max(0, Math.cos(ph)) * amp;
      const [hx, hy] = P(-0.04 * r, side * 0.3 * r * b);
      const [fx, fy] = P(fwd, side * 0.34 * r * b);
      if (Math.abs(fwd) > 0.12 * r) limb(g, [hx, hy, fx, fy], r * 0.38, kit.pants, mode);
      if (mode !== 'ghost') drawSprite(g, kit.shoe, fx, fy, c.legAng, 1 + lift * 0.16, 1 + lift * 0.16);
    }
  }

  /* torso y brazos: los brazos quedan bajo los hombros, salvo el que golpea o empuña */
  const twist = Math.sin(c.phase) * 0.12 * amp * (1 - hyper);
  g.rotate(c.face + twist);
  const bob = 1 + Math.abs(Math.sin(c.phase)) * 0.025 * amp;
  // inclinación hacia delante al correr: el torso se adelanta un poco
  const lean = (c.run || 0) * 0.08 * r + hyper * 0.12 * r;
  const run = c.run || 0;
  const arms = [];
  for (const side of [-1, 1]) {
    const sx = 0.02 * r + lean;
    const sy = side * 0.7 * r * b;
    const ph = c.phase + (side > 0 ? 0 : Math.PI);
    const sw = Math.sin(ph) * amp;
    let hx = 0.22 * r - sw * 0.6 * r;
    let hy = side * 1.0 * r * b;
    let top = false;
    if (run > 0) {
      hx = lerp(hx, 0.45 * r - sw * 0.75 * r, run);
      hy = lerp(hy, side * 0.92 * r * b, run);
    }
    if (hyper > 0) {
      hx = lerp(hx, -0.95 * r + Math.sin(c.phase * 2 + side) * 0.06 * r, hyper);
      hy = lerp(hy, side * 0.78 * r * b, hyper);
    }
    if (c.punch > 0 && c.punchSide === side) {
      const e = Math.sin(c.punch * Math.PI);
      hx = lerp(hx, 1.75 * r, e);
      hy = lerp(hy, side * 0.12 * r, e);
      top = e > 0.15;
    }
    if (c.prop && side === 1) {
      const sa = c.swing || 0;
      hx = lerp(0.6 * r, 1.0 * r, Math.sin(sa * Math.PI));
      hy = lerp(0.85 * r, -0.2 * r, sa);
      top = true;
    }
    const ex = (sx + hx) / 2 - 0.12 * r * (1 - Math.min(1, Math.abs(hx - sx) / (1.6 * r)));
    const ey = (sy + hy) / 2 + side * 0.18 * r;
    arms.push({ side, sx, sy, ex, ey, hx, hy, top });
  }
  const drawArm = (a) => {
    limb(g, [a.sx, a.sy, a.ex, a.ey], r * 0.34, kit.sleeve, mode);
    limb(g, [a.ex, a.ey, a.hx, a.hy], r * 0.3, kit.forearm, mode);
    if (c.prop && a.side === 1 && props) drawSprite(g, props[c.prop], a.hx, a.hy, lerp(-2.3, 0.4, c.swing || 0));
    if (mode !== 'ghost') drawSprite(g, kit.hand, a.hx, a.hy, 0);
  };
  for (const a of arms) if (!a.top) drawArm(a);
  drawSprite(g, sprOf(kit, 'torso', mode), lean, 0, 0, bob, bob);
  for (const a of arms) if (a.top) drawArm(a);

  // gancho para pintar algo entre el cuerpo y la cabeza (la bufanda del héroe)
  if (c.beforeHead) {
    const m = g.getTransform();
    g.restore();
    c.beforeHead(g);
    g.save();
    g.setTransform(m);
  }

  /* cabeza: gira antes que el cuerpo */
  const rel = clamp(angleDiff(c.face + twist, c.look ?? c.face), -1.1, 1.1);
  g.rotate(rel);
  drawSprite(g, sprOf(kit, 'head', mode), 0.06 * r + lean * 1.1, 0);
  g.restore();
}

// Ragdoll: p = [pelvis, pecho, cabeza, manoI, manoD, pieI, pieD], cada uno {x, y, z}.
export function drawRagdoll(g, kit, p, mode) {
  const r = kit.r;
  const b = kit.st.build;
  const H = 0.42;
  const X = (q) => q.x;
  const Y = (q) => q.y - q.z * H;
  const pel = p[0];
  const ch = p[1];
  const hd = p[2];
  const ax = X(ch) - X(pel);
  const ay = Y(ch) - Y(pel);
  const len = Math.hypot(ax, ay) || 1;
  const ang = Math.atan2(ay, ax);
  const nx = -ay / len;
  const ny = ax / len;
  const k = 1 + Math.max(0, (pel.z + ch.z) / 2) / 240;
  g.save();
  // piernas
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    const f = p[5 + i];
    const hx = X(pel) + nx * s * 0.3 * r * b;
    const hy = Y(pel) + ny * s * 0.3 * r * b;
    limb(g, [hx, hy, X(f), Y(f)], r * 0.38 * k, kit.pants, mode);
    drawSprite(g, kit.shoe, X(f), Y(f), Math.atan2(Y(f) - hy, X(f) - hx), k, k);
  }
  // torso tumbado
  const mx = (X(pel) + X(ch)) / 2;
  const my = (Y(pel) + Y(ch)) / 2;
  const sl = clamp(len / (0.95 * r), 0.75, 1.25);
  drawSprite(g, sprOf(kit, 'lying', mode), mx, my, ang, sl * k, k);
  // brazos
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    const h = p[3 + i];
    const sx = X(ch) + nx * s * 0.72 * r * b;
    const sy = Y(ch) + ny * s * 0.72 * r * b;
    const ex = (sx + X(h)) / 2 + nx * s * 0.15 * r;
    const ey = (sy + Y(h)) / 2 + ny * s * 0.15 * r;
    limb(g, [sx, sy, ex, ey], r * 0.34 * k, kit.sleeve, mode);
    limb(g, [ex, ey, X(h), Y(h)], r * 0.3 * k, kit.forearm, mode);
    drawSprite(g, kit.hand, X(h), Y(h), 0, k, k);
  }
  // cabeza
  const ha = Math.atan2(Y(hd) - Y(ch), X(hd) - X(ch));
  drawSprite(g, sprOf(kit, 'head', mode), X(hd), Y(hd), ha, k, k);
  g.restore();
}

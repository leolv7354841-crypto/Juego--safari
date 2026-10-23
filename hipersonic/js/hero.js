// El protagonista. Camina, carga la hipervelocidad (Shift) hasta romper la barrera del
// sonido, golpea, deja estelas, imágenes residuales, chispas y marcas en el asfalto.
// Siempre se mueve con el tiempo real: el Sonic Time no lo congela.
import { clamp, lerp, rand, angleTo } from './util.js';
import { drawStanding, drawRagdoll } from './pose.js';
import { Ragdoll } from './ragdoll.js';
import { OUT } from './art/characters.js';

export const WALK = 175;
export const HYPER = 1050;
const PUNCH_T = 0.24;

export class Hero {
  constructor(kit, x, y) {
    this.kit = kit;
    this.r = kit.r;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.kx = 0;
    this.ky = 0;
    this.face = -Math.PI / 2;
    this.legAng = this.face;
    this.look = this.face;
    this.phase = 0;
    this.amp = 0;
    this.run = 0;
    this.hyper = 0;
    this.charge = 0;
    this.speed = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.energy = 100;
    this.alive = true;
    this.punchT = 0;
    this.punchSide = 1;
    this.flash = 0;
    this.inv = 0;
    this.sinceHurt = 10;
    this.boomCd = 0;
    this.boomLatch = false;
    this.trail = [];
    this.ghosts = [];
    this.ghostT = 0;
    this.scorchT = 0;
    this.scarf = Array.from({ length: 6 }, (_, i) => ({ x, y: y + 5 + i * 3.6 }));
    this.rag = null;
    this.topSpeed = 0;
    this.time = 0;
  }

  hurt(game, dmg, dx, dy) {
    if (!this.alive || this.inv > 0) return;
    this.hp -= dmg;
    this.inv = 0.4;
    this.flash = 0.18;
    this.sinceHurt = 0;
    this.kx += dx * 320;
    this.ky += dy * 320;
    this.charge *= 0.4;
    game.onHeroHurt(dmg);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.rag = new Ragdoll(this.kit, this.x, this.y, this.face, dx * 380, dy * 380, 260, rand(-6, 6));
      game.onHeroDeath();
    }
  }

  update(dt, game) {
    this.time += dt;
    if (!this.alive) {
      if (this.rag) {
        this.rag.update(dt, game.world, () => {});
        this.x = this.rag.x;
        this.y = this.rag.y;
      }
      return;
    }
    const input = game.input;
    const mv = input.move();
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const moving = mag > 0.15;
    this.flash = Math.max(0, this.flash - dt);
    this.inv = Math.max(0, this.inv - dt);
    this.sinceHurt += dt;
    this.boomCd -= dt;

    /* --- carga de hipervelocidad --- */
    if (input.boost && moving) this.charge = Math.min(1, this.charge + dt / 1.15);
    else this.charge = Math.max(0, this.charge - dt * (moving ? 1.4 : 2.6));
    const maxSpeed = lerp(WALK, HYPER, Math.pow(this.charge, 1.25));
    const tvx = moving ? (mv.x / (Math.hypot(mv.x, mv.y) || 1)) * maxSpeed * mag : 0;
    const tvy = moving ? (mv.y / (Math.hypot(mv.x, mv.y) || 1)) * maxSpeed * mag : 0;
    // a más velocidad, más inercia en las curvas
    const k = lerp(15, 4.2, this.charge);
    const a = 1 - Math.exp(-dt * k);
    this.vx += (tvx - this.vx) * a;
    this.vy += (tvy - this.vy) * a;
    const kd = Math.exp(-dt * 8);
    this.kx *= kd;
    this.ky *= kd;

    /* --- movimiento por subpasos (no atraviesa paredes a toda velocidad) --- */
    const ox = this.x;
    const oy = this.y;
    const tx = (this.vx + this.kx) * dt;
    const ty = (this.vy + this.ky) * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(tx, ty) / 6));
    for (let i = 0; i < steps; i++) {
      this.x += tx / steps;
      this.y += ty / steps;
      const hit = game.world.collide(this, this.r * 0.85);
      if (hit) {
        const vn = this.vx * hit.nx + this.vy * hit.ny;
        if (vn < 0) {
          const sp = Math.hypot(this.vx, this.vy);
          if (-vn > 420) game.onHeroWall(this.x - hit.nx * this.r, this.y - hit.ny * this.r, hit.nx, hit.ny, -vn, hit.s);
          this.vx -= vn * hit.nx * (sp > 500 ? 1.25 : 1);
          this.vy -= vn * hit.ny * (sp > 500 ? 1.25 : 1);
          if (-vn > 420) this.charge *= 0.55;
        }
      }
      game.heroContacts(this);
    }
    const moved = Math.hypot(this.x - ox, this.y - oy);
    this.speed = dt > 0 ? moved / dt : 0;
    this.topSpeed = Math.max(this.topSpeed, this.speed);
    this.phase += Math.min(moved, 40) * (this.hyper > 0.35 ? 0.06 : 0.1);
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > 20) {
      const ang = Math.atan2(this.vy, this.vx);
      this.legAng = angleTo(this.legAng, ang, dt * 14);
      if (this.punchT <= 0) this.face = angleTo(this.face, ang, dt * (this.hyper > 0.5 ? 9 : 12));
    }
    this.look = this.punchT > 0 ? this.face : angleTo(this.look, game.aimAngle(this), dt * 10);
    this.amp = lerp(this.amp, clamp(this.speed / 150, 0, 1), 1 - Math.exp(-dt * 12));
    this.run = lerp(this.run, clamp((this.speed - 160) / 160, 0, 1), 1 - Math.exp(-dt * 8));
    this.hyper = lerp(this.hyper, clamp((this.speed - 330) / 480, 0, 1), 1 - Math.exp(-dt * 6));

    /* --- golpe --- */
    if (input.consume('punch') && this.punchT <= 0) {
      this.punchT = PUNCH_T;
      this.punchSide *= -1;
      this.struck = false;
      const tgt = game.punchTarget(this);
      if (tgt) this.face = Math.atan2(tgt.y - this.y, tgt.x - this.x);
      game.sfx.swing();
    }
    if (this.punchT > 0) {
      this.punchT -= dt;
      if (!this.struck && this.punchT < PUNCH_T * 0.55) {
        this.struck = true;
        game.heroPunch(this);
      }
    }

    /* --- barrera del sonido --- */
    if (this.speed > HYPER * 0.84 && !this.boomLatch && this.boomCd <= 0) {
      this.boomLatch = true;
      this.boomCd = 2.2;
      game.onSonicBoom(this);
    }
    if (this.speed < HYPER * 0.55) this.boomLatch = false;

    /* --- energía y salud --- */
    if (!game.sonic.on) this.energy = Math.min(100, this.energy + dt * 7);
    if (this.sinceHurt > 4) this.hp = Math.min(this.maxHp, this.hp + dt * 3);

    this.updateFx(dt, game, ox, oy);
  }

  updateFx(dt, game, ox, oy) {
    const fx = game.fx;
    const real = game.sonic.k > 0.05;
    const t = this.time;
    // estela: historial de posiciones
    if (this.speed > 240) this.trail.push({ x: this.x, y: this.y, t, w: this.hyper });
    const life = real ? 1.4 : 0.38;
    while (this.trail.length && t - this.trail[0].t > life) this.trail.shift();
    if (this.trail.length > 160) this.trail.shift();
    // imágenes residuales
    this.ghostT -= dt;
    if (this.hyper > 0.22 && this.ghostT <= 0) {
      this.ghostT = real ? 0.05 : 0.032;
      const c = this.pose();
      this.ghosts.push({ ...c, t });
      if (this.ghosts.length > 12) this.ghosts.shift();
    }
    const glife = real ? 0.7 : 0.24;
    while (this.ghosts.length && t - this.ghosts[0].t > glife) this.ghosts.shift();
    // chispas de energía y rayos
    if (this.hyper > 0.15) {
      const n = Math.random() < this.hyper * 0.9 ? 1 + ((this.hyper * 2) | 0) : 0;
      fx.energy(this.x - Math.cos(this.legAng) * 10, this.y - Math.sin(this.legAng) * 10, -this.vx * 0.15, -this.vy * 0.15, n, true);
      if (Math.random() < dt * 26 * this.hyper) fx.arc(this.x, this.y, this.r * rand(1.1, 1.7), true);
      if (this.hyper > 0.55 && Math.random() < dt * 30) fx.sparks(this.x, this.y, -this.vx, -this.vy, 1, '120,230,255', 220, true);
    }
    // marcas de quemado en el asfalto
    this.scorchT -= dt;
    if (this.hyper > 0.55 && this.scorchT <= 0) {
      this.scorchT = 0.012;
      const len = Math.hypot(this.x - ox, this.y - oy);
      if (len > 1) {
        const ang = Math.atan2(this.y - oy, this.x - ox);
        const px = -Math.sin(ang) * 4;
        const py = Math.cos(ang) * 4;
        fx.scorch(this.x + px, this.y + py, ang, len + 1);
        fx.scorch(this.x - px, this.y - py, ang, len + 1);
      }
    }
    // bufanda: cadena que se arrastra con el viento
    const S = this.scarf;
    const fc = Math.cos(this.face);
    const fs = Math.sin(this.face);
    S[0].x = this.x - fc * this.r * 0.42;
    S[0].y = this.y - fs * this.r * 0.42;
    const seg = 3.8;
    const spd = Math.hypot(this.vx, this.vy);
    const sk = Math.min(1, spd / 500);
    for (let i = 1; i < S.length; i++) {
      const p = S[i];
      const q = S[i - 1];
      p.x += -this.vx * dt * 0.5 - fc * 90 * dt;
      p.y += -this.vy * dt * 0.5 - fs * 90 * dt;
      // ondulación que viaja por la tela; más rápida y amplia con la velocidad
      const w = Math.sin(t * (6 + sk * 22) - i * 1.1) * (0.9 + sk * 1.6) * (i / S.length);
      p.x += -fs * w;
      p.y += fc * w;
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const l = Math.hypot(dx, dy) || 1;
      p.x = q.x + (dx / l) * seg;
      p.y = q.y + (dy / l) * seg;
    }
  }

  pose() {
    const c = this._c || (this._c = {});
    c.x = this.x;
    c.y = this.y;
    c.face = this.face;
    c.legAng = this.legAng;
    c.look = this.look;
    c.phase = this.phase;
    c.amp = this.amp;
    c.run = this.run;
    c.hyper = this.hyper;
    c.punch = this.punchT > 0 ? 1 - this.punchT / PUNCH_T : 0;
    c.punchSide = this.punchSide;
    c.scale = 1;
    return c;
  }

  /* ---------- dibujo ---------- */

  drawShadow(g, S) {
    const s = this.r * 1.4;
    if (this.rag) {
      for (const i of [0, 1, 2]) {
        const q = this.rag.p[i];
        g.globalAlpha = 0.45;
        g.drawImage(S.shadow, q.x + 2 - s * 0.8, q.y + 3 - s * 0.8, s * 1.6, s * 1.6);
      }
    } else {
      g.globalAlpha = 0.55;
      g.drawImage(S.shadow, this.x + 3 - s, this.y + 4 - s, s * 2, s * 2);
    }
    g.globalAlpha = 1;
  }

  drawTrail(g, S, sonicK) {
    const T = this.trail;
    if (T.length < 2) return;
    const now = this.time;
    const life = sonicK > 0.05 ? 1.4 : 0.38;
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [off, wk, col] of [[0, 1, '60,200,255'], [this.r * 0.75, 0.3, '120,240,255'], [-this.r * 0.75, 0.3, '120,240,255']]) {
      for (let i = 1; i < T.length; i++) {
        const a = T[i - 1];
        const b = T[i];
        const u = 1 - (now - b.t) / life;
        if (u <= 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l = Math.hypot(dx, dy) || 1;
        const nx = (-dy / l) * off;
        const ny = (dx / l) * off;
        const w = (3 + 12 * b.w) * wk * u;
        g.strokeStyle = `rgba(${col},${0.55 * u})`;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(a.x + nx, a.y + ny);
        g.lineTo(b.x + nx, b.y + ny);
        g.stroke();
        if (off === 0) {
          g.strokeStyle = `rgba(235,255,255,${0.7 * u})`;
          g.lineWidth = w * 0.3;
          g.stroke();
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  drawGhosts(g, sonicK) {
    const now = this.time;
    const life = sonicK > 0.05 ? 0.7 : 0.24;
    for (const c of this.ghosts) {
      const u = 1 - (now - c.t) / life;
      if (u <= 0) continue;
      g.globalAlpha = 0.42 * u * u;
      drawStanding(g, this.kit, c, 'ghost');
    }
    g.globalAlpha = 1;
  }

  // Bufanda: una cinta que se estrecha hacia la punta, con contorno y brillo.
  drawScarf(g) {
    const S = this.scarf;
    const n = S.length;
    const L = [];
    const R = [];
    for (let i = 0; i < n; i++) {
      const a = S[Math.max(0, i - 1)];
      const b = S[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      const w = 2.9 * (1 - (i / n) * 0.45);
      L.push([S[i].x - (dy / l) * w, S[i].y + (dx / l) * w]);
      R.push([S[i].x + (dy / l) * w, S[i].y - (dx / l) * w]);
    }
    const tip = S[n - 1];
    const pre = S[n - 2];
    const ang = Math.atan2(tip.y - pre.y, tip.x - pre.x);
    g.beginPath();
    g.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) g.lineTo(L[i][0], L[i][1]);
    // punta en cola de golondrina
    g.lineTo(tip.x + Math.cos(ang + 0.45) * 6, tip.y + Math.sin(ang + 0.45) * 6);
    g.lineTo(tip.x + Math.cos(ang) * 1.5, tip.y + Math.sin(ang) * 1.5);
    g.lineTo(tip.x + Math.cos(ang - 0.45) * 6, tip.y + Math.sin(ang - 0.45) * 6);
    for (let i = n - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
    g.closePath();
    g.lineJoin = 'round';
    g.lineWidth = 2.6;
    g.strokeStyle = OUT;
    g.stroke();
    const lg = g.createLinearGradient(S[0].x, S[0].y, tip.x, tip.y);
    lg.addColorStop(0, '#ff7a33');
    lg.addColorStop(1, '#d9431a');
    g.fillStyle = lg;
    g.fill();
    // pliegues: brillo a lo largo de un borde
    g.strokeStyle = 'rgba(255,210,160,0.7)';
    g.lineWidth = 0.9;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (S[i].x * 2 + L[i][0]) / 3;
      const y = (S[i].y * 2 + L[i][1]) / 3;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
    // nudo en la nuca
    g.beginPath();
    g.arc(S[0].x, S[0].y, 3.2, 0, Math.PI * 2);
    g.fillStyle = '#e8521f';
    g.fill();
    g.lineWidth = 1.2;
    g.strokeStyle = OUT;
    g.stroke();
  }

  draw(g, S) {
    if (this.rag) {
      drawRagdoll(g, this.kit, this.rag.p, undefined);
      return;
    }
    // aura de energía alrededor del cuerpo
    {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.16 + this.hyper * 0.45;
      const s = this.r * (3.2 + Math.sin(this.time * 30) * 0.2);
      g.drawImage(S.cyan, this.x - s, this.y - s, s * 2, s * 2);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    const blink = this.inv > 0 && Math.sin(this.time * 50) > 0;
    const c = this.pose();
    c.beforeHead = this.scarfFn || (this.scarfFn = (gg) => this.drawScarf(gg));
    drawStanding(g, this.kit, c, this.flash > 0 || blink ? 'flash' : undefined);
    c.beforeHead = null;
  }
}

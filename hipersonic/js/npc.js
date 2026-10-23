// Civiles y enemigos. Los civiles pasean por las aceras y huyen del peligro; los enemigos
// persiguen al protagonista, preparan el golpe (se ve venir) y atacan. Todos reaccionan a
// los impactos y, si el golpe es fuerte, salen volando como ragdoll.
import { TAU, clamp, rand, angleTo, angleDiff, lerp } from './util.js';
import { Ragdoll } from './ragdoll.js';
import { drawStanding, drawRagdoll } from './pose.js';

let NEXT_ID = 1;

export class Npc {
  constructor(kind, kit, x, y) {
    this.id = NEXT_ID++;
    this.kind = kind;
    this.kit = kit;
    this.r = kit.r * (kit.st.build > 1.15 ? 1.08 : 1);
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.kx = 0;
    this.ky = 0;
    this.face = rand(0, TAU);
    this.legAng = this.face;
    this.look = this.face;
    this.phase = rand(0, TAU);
    this.amp = 0;
    this.run = 0;
    this.speedNow = 0;
    this.state = kind === 'civ' ? 'walk' : 'idle';
    this.t = rand(0, 3);
    this.hp = kind === 'enemy' ? (kit.st.build > 1.15 ? 70 : 42) : 30;
    this.maxHp = this.hp;
    this.flash = 0;
    this.hitT = 0;
    this.hitJolt = 0;
    this.punch = 0;
    this.punchSide = 1;
    this.swing = 0;
    this.prop = kit.st.prop || null;
    this.cool = rand(0.2, 1);
    this.walkSpeed = kind === 'civ' ? rand(48, 72) : rand(118, 150);
    this.ring = null;
    this.u = 0;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.lane = rand(-9, 9);
    this.rag = null;
    this.alpha = 1;
    this.pending = null;
    this.lastHit = -10;
    this.dead = false;
  }

  get standing() {
    return this.state !== 'rag' && this.state !== 'ko';
  }
  get px() {
    return this.rag ? this.rag.x : this.x;
  }
  get py() {
    return this.rag ? this.rag.y : this.y;
  }

  /* ---------- recorrido por la acera ---------- */

  attachRing(world) {
    let best = null;
    let bd = 1e9;
    for (const r of world.walkRings) {
      const cx = clamp(this.x, r.x0, r.x1);
      const cy = clamp(this.y, r.y0, r.y1);
      // distancia al borde del anillo
      const inside = this.x > r.x0 && this.x < r.x1 && this.y > r.y0 && this.y < r.y1;
      const d = inside ? Math.min(this.x - r.x0, r.x1 - this.x, this.y - r.y0, r.y1 - this.y) : Math.hypot(this.x - cx, this.y - cy);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    this.ring = best;
    const r = best;
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    const dl = [Math.abs(this.y - r.y0), Math.abs(this.x - r.x1), Math.abs(this.y - r.y1), Math.abs(this.x - r.x0)];
    const side = dl.indexOf(Math.min(...dl));
    const px = clamp(this.x, r.x0, r.x1);
    const py = clamp(this.y, r.y0, r.y1);
    this.u = [px - r.x0, w + (py - r.y0), w + h + (r.x1 - px), 2 * w + h + (r.y1 - py)][side];
  }
  ringPoint(u) {
    const r = this.ring;
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    const P = 2 * (w + h);
    u = ((u % P) + P) % P;
    const o = this.lane;
    if (u < w) return [r.x0 + u, r.y0 + o];
    if (u < w + h) return [r.x1 - o, r.y0 + (u - w)];
    if (u < 2 * w + h) return [r.x1 - (u - w - h), r.y1 - o];
    return [r.x0 + o, r.y1 - (u - 2 * w - h)];
  }

  /* ---------- movimiento ---------- */

  steer(dx, dy, speed, dt, world) {
    const l = Math.hypot(dx, dy);
    const tx = l > 1e-3 ? (dx / l) * speed : 0;
    const ty = l > 1e-3 ? (dy / l) * speed : 0;
    const a = 1 - Math.exp(-dt * 8);
    this.vx += (tx - this.vx) * a;
    this.vy += (ty - this.vy) * a;
    const ox = this.x;
    const oy = this.y;
    const kd = Math.exp(-dt * 7);
    this.kx *= kd;
    this.ky *= kd;
    this.x += (this.vx + this.kx) * dt;
    this.y += (this.vy + this.ky) * dt;
    const hit = world.collide(this, this.r * 0.8);
    if (hit && l > 1e-3) {
      // se escurre a lo largo del obstáculo
      const tnx = -hit.ny;
      const tny = hit.nx;
      const s = Math.sign(tnx * dx + tny * dy) || 1;
      this.x += tnx * s * speed * dt * 0.5;
      this.y += tny * s * speed * dt * 0.5;
      world.collide(this, this.r * 0.8);
    }
    const moved = Math.hypot(this.x - ox, this.y - oy);
    this.speedNow = dt > 0 ? moved / dt : this.speedNow;
    this.phase += moved * 0.115;
    const mv = Math.hypot(this.vx, this.vy);
    if (mv > 12) {
      const ang = Math.atan2(this.vy, this.vx);
      this.legAng = angleTo(this.legAng, ang, dt * 10);
      this.face = angleTo(this.face, ang, dt * 7);
    }
    this.amp = lerp(this.amp, clamp(this.speedNow / 60, 0, 1), 1 - Math.exp(-dt * 10));
    this.run = lerp(this.run, clamp((this.speedNow - 90) / 70, 0, 1), 1 - Math.exp(-dt * 6));
  }

  update(dt, game) {
    if (dt <= 0) return;
    const world = game.world;
    const hero = game.hero;
    this.flash = Math.max(0, this.flash - dt);
    this.hitT = Math.max(0, this.hitT - dt);
    this.cool -= dt;
    this.t -= dt;
    if (this.punch > 0) this.punch = Math.max(0, this.punch - dt * 4);

    if (this.state === 'rag') {
      this.rag.update(dt, world, (x, y, f, wall) => game.onRagImpact(this, x, y, f, wall));
      this.x = this.rag.x;
      this.y = this.rag.y;
      if (this.rag.settled) {
        if (this.kind === 'enemy' && this.hp <= 0) {
          this.state = 'ko';
          this.t = 14;
          this.stars = game.fx.stars(this.rag.p[2].x, this.rag.p[2].y);
          if (!this.counted) game.onKo(this);
          this.counted = true;
        } else {
          this.state = 'getup';
          this.t = 0.55;
          this.face = this.legAng = this.look = this.rag.face;
          this.vx = this.vy = 0;
        }
      }
      return;
    }
    if (this.state === 'ko') {
      if (this.t < 2) this.alpha = Math.max(0, this.t / 2);
      if (this.stars) this.stars.life = this.t > 4 ? 1e9 : 0;
      if (this.t <= 0) this.dead = true;
      return;
    }
    if (this.state === 'getup') {
      this.amp = 0;
      if (this.t <= 0) {
        this.rag = null;
        if (this.kind === 'civ') this.flee(game, 4);
        else this.state = 'chase';
      }
      return;
    }

    const hx = hero.x;
    const hy = hero.y;
    const dx = hx - this.x;
    const dy = hy - this.y;
    const dist = Math.hypot(dx, dy);

    if (this.kind === 'civ') {
      // el peligro asusta: el héroe pasando a toda velocidad, golpes, explosiones
      if (this.state !== 'flee' && hero.alive && dist < 170 && hero.speed > 380) this.flee(game, rand(3, 5));
      if (this.state === 'walk') {
        if (!this.ring) this.attachRing(world);
        this.u += this.dir * this.walkSpeed * dt;
        const [tx, ty] = this.ringPoint(this.u + this.dir * 24);
        this.steer(tx - this.x, ty - this.y, this.walkSpeed, dt, world);
        this.look = this.face;
        if (this.t <= 0) {
          this.t = rand(4, 12);
          if (Math.random() < 0.3) {
            this.state = 'idle';
            this.t = rand(1.2, 3.5);
          } else if (Math.random() < 0.15) this.dir *= -1;
        }
      } else if (this.state === 'idle') {
        this.steer(0, 0, 0, dt, world);
        this.look = this.face + Math.sin(game.worldTime * 1.3 + this.id) * 0.9;
        if (this.t <= 0) {
          this.state = 'walk';
          this.t = rand(4, 10);
        }
      } else if (this.state === 'flee') {
        const away = dist > 1 ? [-dx / dist, -dy / dist] : [1, 0];
        // corre lejos, con un poco de zigzag
        const wob = Math.sin(game.worldTime * 4 + this.id) * 0.4;
        const ax = away[0] * Math.cos(wob) - away[1] * Math.sin(wob);
        const ay = away[0] * Math.sin(wob) + away[1] * Math.cos(wob);
        this.steer(ax, ay, this.walkSpeed * 2.6, dt, world);
        this.look = Math.atan2(dy, dx);
        if (this.t <= 0 && dist > 220) {
          this.state = 'walk';
          this.attachRing(world);
          this.t = rand(4, 8);
        }
      }
      return;
    }

    /* enemigos */
    const reach = this.r + hero.r + (this.prop ? 18 : 10);
    if (this.state === 'idle') {
      this.steer(0, 0, 0, dt, world);
      this.look = this.face + Math.sin(game.worldTime + this.id) * 0.6;
      if (hero.alive && dist < 620) this.state = 'chase';
    } else if (this.state === 'chase') {
      if (!hero.alive) {
        this.state = 'idle';
        return;
      }
      let d = null;
      if (dist > 90) d = world.flow(this.x, this.y);
      // rodea un poco al héroe en vez de llegar todos por el mismo lado
      const side = ((this.id % 3) - 1) * 0.5;
      let mx = d ? d.x : dx / (dist || 1);
      let my = d ? d.y : dy / (dist || 1);
      if (dist < 160) {
        const c = Math.cos(side);
        const s = Math.sin(side);
        [mx, my] = [mx * c - my * s, mx * s + my * c];
      }
      const sp = dist < reach + 6 ? 0 : this.walkSpeed;
      this.steer(mx, my, sp, dt, world);
      this.look = Math.atan2(dy, dx);
      if (dist < reach + 4 && this.cool <= 0) {
        this.state = 'windup';
        this.t = this.prop ? 0.5 : 0.38;
        this.punchSide = Math.random() < 0.5 ? 1 : -1;
      }
    } else if (this.state === 'windup') {
      this.steer(0, 0, 0, dt, world);
      this.face = angleTo(this.face, Math.atan2(dy, dx), dt * 10);
      this.look = this.face;
      this.swing = 0;
      // retrocede un poco el brazo (se ve venir el golpe)
      this.punch = 0;
      this.windK = 1 - this.t / (this.prop ? 0.5 : 0.38);
      if (this.t <= 0) {
        this.state = 'strike';
        this.t = 0.18;
        this.struck = false;
      }
    } else if (this.state === 'strike') {
      const k = 1 - this.t / 0.18;
      this.steer(Math.cos(this.face), Math.sin(this.face), 60, dt, world);
      if (this.prop) this.swing = k;
      else this.punch = Math.max(this.punch, 0.5 * k + 0.01);
      if (!this.struck && k > 0.45) {
        this.struck = true;
        if (dist < reach + 10 && hero.alive && Math.abs(angleDiff(this.face, Math.atan2(dy, dx))) < 1.2) {
          hero.hurt(game, this.prop ? 14 : 8, dx / (dist || 1), dy / (dist || 1), this);
        } else game.sfx.whiff();
      }
      if (this.t <= 0) {
        this.state = 'chase';
        this.cool = rand(0.6, 1.2);
        this.swing = 0;
      }
    }
  }

  flee(game, t) {
    this.state = 'flee';
    this.t = t;
    if (Math.random() < 0.5) game.sfx.scream(this.x, this.y);
  }

  /* ---------- golpes ---------- */

  // Recibe un golpe. vx, vy, vz: velocidad con la que sale despedido; dmg: daño.
  applyHit(game, vx, vy, vz, dmg, spin = 0) {
    this.hp -= dmg;
    this.flash = 0.14;
    const sp = Math.hypot(vx, vy);
    if (this.state === 'rag') {
      this.rag.push(vx * 0.8, vy * 0.8, vz * 0.8);
      return;
    }
    if (this.state === 'ko') {
      if (this.stars) this.stars.life = 0;
      this.stars = null;
      this.alpha = 1;
      this.state = 'rag';
      this.rag.settled = false;
      this.rag.push(vx, vy, vz);
      return;
    }
    if (sp < 170 && this.hp > 0) {
      // reacción: sacudida y retroceso, interrumpe su ataque
      this.hitT = 0.3;
      this.hitJolt = rand(0.4, 0.8) * (Math.random() < 0.5 ? -1 : 1);
      this.kx += vx * 1.4;
      this.ky += vy * 1.4;
      if (this.state === 'windup' || this.state === 'strike') {
        this.state = 'chase';
        this.cool = 0.5;
      }
      if (this.kind === 'civ' && this.state !== 'flee') this.flee(game, 4);
      return;
    }
    this.launch(vx, vy, vz, spin);
  }

  launch(vx, vy, vz, spin) {
    this.rag = new Ragdoll(this.kit, this.x, this.y, this.face, vx, vy, vz, spin || rand(-8, 8));
    this.state = 'rag';
    this.swing = 0;
    this.punch = 0;
  }

  /* ---------- dibujo ---------- */

  drawShadow(g, S, lamps) {
    if (this.alpha <= 0) return;
    g.globalAlpha = 0.5 * this.alpha;
    if (this.rag) {
      for (const i of [0, 1, 2]) {
        const q = this.rag.p[i];
        const s = this.r * (i === 2 ? 0.9 : 1.2) * (1 + q.z / 160);
        g.globalAlpha = 0.45 * this.alpha * Math.max(0.15, 1 - q.z / 220);
        g.drawImage(S.shadow, q.x + 2 - s, q.y + 3 - s, s * 2, s * 2);
      }
      g.globalAlpha = 1;
      return;
    }
    const s = this.r * 1.35;
    g.drawImage(S.shadow, this.x + 3 - s, this.y + 4 - s, s * 2, s * 2);
    // sombra alargada por la farola más cercana
    if (lamps) {
      for (const l of lamps) {
        const dx = this.x - l.hx;
        const dy = this.y - l.hy;
        const d = Math.hypot(dx, dy);
        if (d > 210 || d < 8) continue;
        const k = 1 - d / 210;
        g.save();
        g.translate(this.x, this.y);
        g.rotate(Math.atan2(dy, dx));
        g.globalAlpha = 0.42 * k * this.alpha;
        const len = this.r * (1.4 + d / 60);
        g.drawImage(S.shadow, 0, -this.r * 0.85, len * 2, this.r * 1.7);
        g.restore();
      }
    }
    g.globalAlpha = 1;
  }

  pose() {
    const c = this._c || (this._c = {});
    c.x = this.x;
    c.y = this.y;
    c.face = this.face + (this.hitT > 0 ? this.hitJolt * (this.hitT / 0.3) : 0);
    c.legAng = this.legAng;
    c.look = this.look;
    c.phase = this.phase;
    c.amp = this.amp;
    c.run = this.run;
    c.hyper = 0;
    c.punch = this.punch;
    c.punchSide = this.punchSide;
    c.prop = this.prop;
    c.swing = this.state === 'windup' ? -0.25 * (this.windK || 0) : this.swing;
    c.scale = this.state === 'getup' ? lerp(1, 0.86, this.t / 0.55) : 1;
    if (this.state === 'windup' && !this.prop) {
      // brazo atrás antes del puñetazo
      c.punch = 0;
    }
    return c;
  }

  draw(g, props, mode) {
    if (this.alpha <= 0) return;
    const m = mode || (this.flash > 0 ? 'flash' : undefined);
    if (this.alpha < 1) g.globalAlpha = this.alpha;
    if (this.rag) drawRagdoll(g, this.kit, this.rag.p, m);
    else drawStanding(g, this.kit, this.pose(), m, props);
    g.globalAlpha = 1;
  }
}

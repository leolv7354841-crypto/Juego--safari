import {
  PLAYER_BASE,
  WEAPONS,
  WORLD_SIZE,
  WEAPON_ORDER,
  ROBOT,
  ABILITY,
  START_WEAPON,
  ZOMBIE_SPEED,
  WAVES,
  HEAVY,
  GUN_REACH,
  RELOAD_STEPS,
} from '../core/config.js';
import { clamp, rand, angleTo } from '../core/util.js';

// Distancia (local) desde el centro del personaje hasta la boca del cañón.
// px/s al caminar: PLAYER_BASE.walk veces lo que camina un zombi normal en la primera oleada
export const WALK = PLAYER_BASE.walk * ((ZOMBIE_SPEED[0] + ZOMBIE_SPEED[1]) / 2) * WAVES.speed;
// El que maneja la torreta pesada se para detrás del cañón, a esta distancia del centro.
export const HEAVY_BACK = 30;
const GUN_TIP = {
  pistol: 22.5,
  smg: 29.7,
  shotgun: 32.8,
  rifle: 38.1,
  ar: 35,
  autoshotgun: 35,
  sniper: 46,
  lmg: 41,
  bazooka: 46,
};

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.kx = 0;
    this.ky = 0;
    this.r = PLAYER_BASE.radius;
    this.mass = PLAYER_BASE.mass;
    this.angle = -Math.PI / 2;
    this.legAngle = -Math.PI / 2;
    this.walkPhase = 0;
    this.speedNow = 0;
    this.stats = {
      maxHp: PLAYER_BASE.maxHp,
      armor: 0,
      dmgMult: 1,
      rateMult: 1,
      maxStamina: PLAYER_BASE.maxStamina,
      staminaRegenMult: 1,
      speedMult: 1,
      ammoMult: 1,
      pierce: 0,
      reloadMult: 1,
      cdMult: 1,
    };
    this.hp = this.stats.maxHp;
    this.stamina = this.stats.maxStamina;
    this.exhausted = false;
    this.running = false;
    this.sinceRun = 10;
    this.weapons = [this.makeWeapon(START_WEAPON)];
    this.wi = 0;
    this.fireCd = 0;
    this.reloadT = 0;
    this.reloadDur = 1;
    this.bloom = 0;
    this.recoil = 0;
    this.flashT = 0;
    this.hurtT = 0;
    this.alive = true;
    this.target = null;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.damageTaken = 0;
    // clase elegida al empezar y su habilidad (ver abilities.js)
    this.cls = null;
    this.abCd = 0;
    this.boostT = 0;
    this.rageT = 0;
    this.rageAcc = 0;
    // torreta pesada que maneja (estructura de build.js) y sus balas compradas
    this.manned = null;
    this.heavyAmmo = 0;
    /** @type {any} aspecto del personaje (lo pone Game; ver cleanLook) */
    this.look;
    /** @type {boolean | undefined} compañero de cooperativo (lo pone coop.js) */
    this.remote;
    /** @type {boolean | undefined} dentro del robot (lo pone main.js / el servidor) */
    this.inRobot;
  }

  get weapon() {
    return this.weapons[this.wi];
  }
  get gunTip() {
    return GUN_TIP[this.weapon.id] || 30;
  }

  makeWeapon(id) {
    const def = WEAPONS[id];
    return { id, def, mag: this.magSize(def), reserve: def.reserve };
  }
  magSize(def) {
    return Math.round(def.mag * this.stats.ammoMult);
  }
  reserveMax(def) {
    return def.reserveMax === Infinity ? Infinity : Math.round(def.reserveMax * this.stats.ammoMult);
  }
  has(id) {
    return this.weapons.some((w) => w.id === id);
  }

  unlock(id) {
    if (this.has(id)) return false;
    this.weapons.push(this.makeWeapon(id));
    this.weapons.sort((a, b) => WEAPON_ORDER.indexOf(a.id) - WEAPON_ORDER.indexOf(b.id));
    this.select(this.weapons.findIndex((w) => w.id === id));
    return true;
  }

  // Quita un arma (vender). El arma inicial no se puede quitar.
  removeWeapon(id) {
    const i = this.weapons.findIndex((w) => w.id === id);
    if (i < 0 || id === START_WEAPON) return false;
    this.weapons.splice(i, 1);
    if (this.wi === i) this.wi = 0;
    else if (this.wi > i) this.wi--;
    this.reloadT = 0;
    return true;
  }

  select(i) {
    if (i < 0 || i >= this.weapons.length || i === this.wi) return;
    this.wi = i;
    this.reloadT = 0;
    this.reloadProg = 0;
    this.fireCd = Math.max(this.fireCd, 0.18);
  }

  addAmmo(mult = 1) {
    let any = false;
    for (const w of this.weapons) {
      if (w.def.reserve === Infinity) continue;
      w.reserve = Math.min(this.reserveMax(w.def), w.reserve + Math.round(w.def.pickup * this.stats.ammoMult * mult));
      any = true;
    }
    return any;
  }

  /** @param {unknown} [_game] lo pasan algunos llamadores; no se usa */
  startReload(_game) {
    const w = this.weapon;
    if (this.reloadT > 0 || w.mag >= this.magSize(w.def) || w.reserve <= 0) return;
    this.reloadDur = w.def.reload / this.stats.reloadMult;
    this.reloadT = this.reloadDur;
    // cada paso de la recarga suena una sola vez, en su momento de la animación
    this.reloadStep = 0;
    this.reloadProg = 0;
  }

  hurt(dmg, game) {
    // Booster: inmune mientras dura el impulso
    if (!this.alive || this.boostT > 0) return;
    // compañero en cooperativo: su vida la lleva su propio celular
    if (this.remote) {
      this.hurtT = 0.3;
      game.coop.send({ t: 'hurt', d: dmg });
      return;
    }
    // dentro del robot, el daño lo recibe el robot
    if (this.inRobot) {
      game.onRobotHit(dmg, this);
      return;
    }
    // el escudo de la torreta pesada aguanta parte del golpe
    if (this.manned) dmg *= 1 - HEAVY.shield;
    const real = dmg * (1 - this.stats.armor);
    this.hp -= real;
    this.damageTaken += real;
    this.hurtT = 0.3;
    // el temblor es de quien recibe el golpe (en cooperativo el anfitrión también simula al invitado)
    if (this === game.player) game.camera.shake(0.28);
    game.hurtFlash = Math.min(1, game.hurtFlash + 0.5);
    game.sfx.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      game.onPlayerDeath();
    }
  }

  update(dt, game) {
    const input = game.input;
    const mv = input.move();
    this.move(dt, mv.x, mv.y, input.run, game);
    this.act(dt, game, mv);
  }

  // Estamina y movimiento con choques. Sólo depende de la entrada y del mundo, así que el
  // servidor y la predicción del cliente en línea dan exactamente el mismo resultado.
  /**
   * @param {number} dt
   * @param {number} mx
   * @param {number} my
   * @param {boolean} run
   * @param {import('../core/types.js').GameHost | Pick<import('../core/types.js').GameHost, 'world' | 'sfx'>} game
   */
  move(dt, mx, my, run, game) {
    const st = this.stats;
    const mv = { x: mx, y: my };
    const mag = Math.hypot(mv.x, mv.y);
    const moving = mag > 0.12;

    // --- estamina ---
    this.sinceRun += dt;
    const wantRun = run && moving;
    if (wantRun && !this.exhausted && this.stamina > 0) {
      this.running = true;
      this.sinceRun = 0;
      this.stamina -= PLAYER_BASE.staminaDrain * dt;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
        game.sfx.exhausted();
      }
    } else {
      this.running = false;
    }
    if (!this.running && this.sinceRun > PLAYER_BASE.regenDelay) {
      this.stamina = Math.min(st.maxStamina, this.stamina + PLAYER_BASE.staminaRegen * st.staminaRegenMult * dt);
    }
    if (this.exhausted && this.stamina > st.maxStamina * 0.3) this.exhausted = false;

    // --- movimiento ---
    // en la torreta pesada no caminas: te quedas detrás del cañón, que gira contigo
    if (this.manned) {
      const b = this.manned;
      this.x = b.x + b.w / 2 - Math.cos(b.ang) * HEAVY_BACK;
      this.y = b.y + b.h / 2 - Math.sin(b.ang) * HEAVY_BACK;
      this.vx = this.vy = this.kx = this.ky = 0;
      this.speedNow = 0;
      this.legAngle = b.ang;
      return;
    }
    let speed = WALK * st.speedMult;
    if (this.running) speed *= PLAYER_BASE.runMult;
    if (this.exhausted) speed *= 0.85;
    if (this.boostT > 0) {
      this.boostT = Math.max(0, this.boostT - dt);
      speed *= ABILITY.booster.speed;
    }
    if (this.inRobot) {
      speed *= ROBOT.speed;
      // con el peso del robot casi nada lo empuja
      this.kx *= 0.2;
      this.ky *= 0.2;
    }
    const k = Math.min(mag, 1);
    const tvx = moving ? (mv.x / mag) * speed * k : 0;
    const tvy = moving ? (mv.y / mag) * speed * k : 0;
    const a = 1 - Math.exp(-dt * 14);
    this.vx += (tvx - this.vx) * a;
    this.vy += (tvy - this.vy) * a;
    const kd = Math.exp(-dt * 9);
    this.kx *= kd;
    this.ky *= kd;
    const ox = this.x;
    const oy = this.y;
    this.x += (this.vx + this.kx) * dt;
    this.y += (this.vy + this.ky) * dt;
    game.world.collide(this, this.r, true);
    this.x = clamp(this.x, 30, WORLD_SIZE - 30);
    this.y = clamp(this.y, 30, WORLD_SIZE - 30);
    const moved = Math.hypot(this.x - ox, this.y - oy);
    this.speedNow = moved / Math.max(dt, 1e-4);
    this.walkPhase += moved * 0.11;
    if (moving) this.legAngle = angleTo(this.legAngle, Math.atan2(mv.y, mv.x), dt * 12);
  }

  // Apuntado, recarga y disparo (mv = dirección de movimiento de este fotograma).
  act(dt, game, mv) {
    if (this.manned) return this.actMounted(dt, game, mv);
    const input = game.input;
    const mag = Math.hypot(mv.x, mv.y);
    const moving = mag > 0.12;

    // --- apuntado ---
    const range = this.weapon.def.range;
    if (input.mode === 'mouse') {
      const m = game.mouseWorld();
      this.angle = Math.atan2(m.y - this.y, m.x - this.x);
      this.target = null;
    } else {
      this.target = game.horde.findTarget(this.x, this.y, range * 0.92, this.target);
      if (this.target) {
        const ta = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        this.angle = angleTo(this.angle, ta, dt * 16);
      } else if (moving) {
        this.angle = angleTo(this.angle, Math.atan2(mv.y, mv.x), dt * 8);
      }
    }

    // --- armas ---
    this.fireCd -= dt;
    this.flashT -= dt;
    this.hurtT -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.bloom = Math.max(0, this.bloom - dt * 0.5);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      this.reloadProg = Math.min(1, 1 - this.reloadT / this.reloadDur);
      const steps = RELOAD_STEPS[this.weapon.id] || RELOAD_STEPS.pistol;
      while (this.reloadStep < steps.length && steps[this.reloadStep][0] <= this.reloadProg) {
        game.sfx.reloadStep(steps[this.reloadStep][1]);
        this.reloadStep++;
      }
      if (this.reloadT <= 0) {
        this.reloadProg = 0;
        this.reloadT = 0;
        const w = this.weapon;
        const need = this.magSize(w.def) - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        if (w.reserve !== Infinity) w.reserve -= take;
        game.sfx.reloadDone();
      }
    }
    if (input.consume('reload')) this.startReload(game);
    if (input.consume('swap')) this.select((this.wi + 1) % this.weapons.length);
    const slot = input.consume('slot');
    if (slot) this.select(slot - 1);
    if (input.firing) this.tryFire(game);
  }

  // Montado en la torreta pesada: el cañón gira despacio hacia la mira y dispara sus balas.
  actMounted(dt, game, mv) {
    const b = this.manned;
    // la torreta reventó: quedas de pie donde estabas
    if (b.hp <= 0) {
      b.manned = null;
      this.manned = null;
      return;
    }
    const d = WEAPONS.heavy;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    let want = b.ang;
    if (game.input.mode === 'mouse') {
      const m = game.mouseWorld();
      want = Math.atan2(m.y - cy, m.x - cx);
      this.target = null;
    } else {
      this.target = game.horde.findTarget(cx, cy, d.range * 0.92, this.target);
      if (this.target) want = Math.atan2(this.target.y - cy, this.target.x - cx);
      else if (Math.hypot(mv.x, mv.y) > 0.12) want = Math.atan2(mv.y, mv.x);
    }
    b.ang = angleTo(b.ang, want, dt * HEAVY.turn);
    this.angle = b.ang;
    this.fireCd -= dt;
    this.flashT -= dt;
    this.hurtT -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.bloom = Math.max(0, this.bloom - dt * 0.5);
    b.recoil = Math.max(0, (b.recoil || 0) - dt * 10);
    b.flash = Math.max(0, (b.flash || 0) - dt);
    // las teclas de arma no hacen nada aquí
    game.input.consume('reload');
    game.input.consume('swap');
    game.input.consume('slot');
    if (!game.input.firing || this.fireCd > 0) return;
    if (this.heavyAmmo <= 0) {
      game.sfx.empty();
      this.fireCd = 0.5;
      if (!game.remoteSim) game.toast('Torreta sin balas: cómpralas en la tienda');
      return;
    }
    this.heavyAmmo--;
    this.fireCd = 1 / (d.rate * this.stats.rateMult);
    // los dos cañones disparan alternados
    b.side = b.side === 1 ? -1 : 1;
    const ca = Math.cos(b.ang);
    const sa = Math.sin(b.ang);
    const sx = cx + ca * 40 - sa * b.side * 7;
    const sy = cy + sa * 40 + ca * b.side * 7;
    const a = b.ang + rand(-1, 1) * (d.spread + this.bloom);
    game.bullets.spawn({
      x: sx,
      y: sy,
      dx: Math.cos(a),
      dy: Math.sin(a),
      speed: d.speed * rand(0.97, 1.03),
      life: d.range,
      dmg: d.damage * this.stats.dmgMult,
      pierce: d.pierce,
      knock: d.knock,
      shot: { hit: false },
      hits: null,
      rocket: false,
    });
    this.shotsFired++;
    this.bloom = Math.min(0.12, this.bloom + d.bloom);
    b.recoil = 1;
    b.flash = 0.05;
    if (this === game.player) {
      game.camera.shake(d.shake);
      game.camera.kick(-ca * d.shake * 22, -sa * d.shake * 22);
    }
    game.muzzle = 1;
    game.muzzleX = sx;
    game.muzzleY = sy;
    game.particles.casing(cx - sa * b.side * 12, cy + ca * b.side * 12, b.ang + (Math.PI / 2) * b.side);
    game.particles.muzzleSmoke(sx, sy, b.ang);
    game.sfx.shot('heavy');
  }

  tryFire(game) {
    if (this.reloadT > 0 || this.fireCd > 0) return;
    const w = this.weapon;
    const d = w.def;
    if (w.mag <= 0) {
      if (w.reserve > 0) this.startReload(game);
      else {
        game.sfx.empty();
        this.fireCd = 0.35;
        game.toast('Sin munición: cambia de arma');
        if (this.wi !== 0) this.select(0);
      }
      return;
    }
    w.mag--;
    this.fireCd = 1 / (d.rate * this.stats.rateMult);
    const spread = d.spread + this.bloom + (this.running ? 0.05 : 0);
    let ca = Math.cos(this.angle);
    let sa = Math.sin(this.angle);
    const tip = this.gunTip;
    let sx = this.x + ca * tip;
    let sy = this.y + sa * tip;
    let aim = this.angle;
    if (this.inRobot) {
      // el arma va en el brazo derecho del robot: dispara desde ahí hacia donde apuntas
      const R = ROBOT.radius;
      const lx = R * 0.35 + (GUN_REACH[d.id] || 30) * ROBOT.gunScale;
      const ly = R * 0.94;
      sx = this.x + ca * lx - sa * ly;
      sy = this.y + sa * lx + ca * ly;
      const t = game.input.mode === 'mouse' ? game.mouseWorld() : this.target && !this.target.dead ? this.target : null;
      if (t && Math.hypot(t.x - sx, t.y - sy) > 40) aim = Math.atan2(t.y - sy, t.x - sx);
      ca = Math.cos(aim);
      sa = Math.sin(aim);
    }
    // si el cañón atraviesa una pared, el disparo sale desde el cuerpo
    const blocked = game.world.pointBlocked(sx, sy, 0, true);
    const ox = blocked ? this.x : sx;
    const oy = blocked ? this.y : sy;
    const shot = { hit: false };
    const fired = [];
    for (let i = 0; i < d.pellets; i++) {
      const off = d.pellets > 1 ? (i / (d.pellets - 1) - 0.5) * 2 * spread + rand(-0.04, 0.04) : rand(-spread, spread);
      const a = aim + off;
      fired.push(a);
      game.bullets.spawn({
        x: ox,
        y: oy,
        dx: Math.cos(a),
        dy: Math.sin(a),
        speed: d.speed * rand(0.95, 1.05),
        life: d.range * (d.pellets > 1 ? rand(0.8, 1) : 1),
        dmg: d.damage * this.stats.dmgMult,
        pierce: d.pierce + this.stats.pierce,
        knock: d.knock,
        shot,
        hits: null,
        rocket: !!d.rocket,
      });
    }
    this.shotsFired++;
    this.bloom = Math.min(0.22, this.bloom + d.bloom);
    this.recoil = 1;
    this.flashT = 0.05;
    this.kx -= ca * d.knock * 0.5;
    this.ky -= sa * d.knock * 0.5;
    // la cámara sólo se mueve con los disparos propios
    if (this === game.player) {
      game.camera.shake(d.shake);
      game.camera.kick(-ca * d.shake * 22, -sa * d.shake * 22);
    }
    game.muzzle = 1;
    game.muzzleX = sx;
    game.muzzleY = sy;
    if (d.rocket) game.particles.backblast(this.x - ca * 14, this.y - sa * 14, this.angle + Math.PI);
    else game.particles.casing(this.x + ca * 8, this.y + sa * 8, this.angle + Math.PI / 2);
    game.particles.muzzleSmoke(sx, sy, this.angle);
    game.sfx.shot(d.id);
    // invitado en cooperativo: el anfitrión crea las balas que de verdad hacen daño
    if (game.coop && game.coop.isGuest) game.coop.sendShot(ox, oy, fired, d, this.stats);
    if (w.mag === 0 && w.reserve > 0) this.startReload(game);
  }
}

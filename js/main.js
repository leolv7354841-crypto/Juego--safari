// DEAD ZONE — punto de entrada. Une todos los módulos y gestiona el bucle.
import {
  xpForLevel,
  BOUNTY,
  SHOP,
  SHOP_ORDER,
  BUILD_ORDER,
  THROWABLES,
  WEAPONS,
  WEAPON_ORDER,
  SELL_RATE,
  GOLDEN,
  MONEY_LOSS,
  DROPS,
  WORLD_SIZE,
  ROCKET,
  ROBOT,
  CLASS_ORDER,
  WAVES,
  START_WEAPON,
  CAMERA,
  HEAVY,
} from './core/config.js';
import { Abilities, CLASSES, isClass, abilityTarget, cooldownOf } from './sim/abilities.js';
import { Music } from './ui/music.js';
import { Robot } from './sim/robot.js';
import { Coop } from './net/coop.js';
import { Online, validName, explainOnline } from './net/online.js';
import { VERSION, hayVersionNueva } from './core/version.js';
import { Accounts } from './ui/accounts.js';
import { Structures, ACID, drawBottle } from './sim/build.js';
import { bulletHit } from './sim/combat.js';
import { clamp, rand, randInt, fmtTime, makeCanvas, storage, TAU } from './core/util.js';
import { World } from './sim/world.js';
import { Player } from './sim/player.js';
import { Horde } from './sim/zombies.js';
import { Bullets } from './sim/bullets.js';
import { Particles, Decals } from './render/particles.js';
import { Pickups } from './sim/pickups.js';
import { Director } from './sim/director.js';
import { Lighting } from './render/lighting.js';
import { Input } from './ui/input.js';
import { Sfx } from './ui/audio.js';
import { drawSurvivor, drawGunIcon, LOOK_PARTS, HATS, DEFAULT_LOOK, cleanLook } from './render/sprites.js';
import { rollUpgrades, ICONS } from './sim/upgrades.js';

const CROWN_SVG =
  '<svg viewBox="0 0 48 32" aria-hidden="true"><path d="M4 28 L2 8 L14 17 L24 2 L34 17 L46 8 L44 28 Z" fill="currentColor"/><circle cx="2" cy="8" r="2.5" fill="currentColor"/><circle cx="24" cy="2" r="2.5" fill="currentColor"/><circle cx="46" cy="8" r="2.5" fill="currentColor"/><rect x="4" y="25" width="40" height="5" fill="currentColor" opacity="0.7"/></svg>';

// Cada cuenta tiene dos guardados: el automático (también a mitad de ronda) y el punto
// de control al terminar cada ronda, para continuar tras morir (ver accounts.js).
const SHORT = {
  pistol: 'Pis',
  smg: 'Smg',
  shotgun: 'Esc',
  rifle: 'Rif',
  ar: 'Fus',
  autoshotgun: 'EscA',
  sniper: 'Fra',
  lmg: 'Amet',
  bazooka: 'Baz',
};
const ITEM_ICONS = {
  molotov:
    '<svg viewBox="0 0 12 12"><ellipse cx="5" cy="7.5" rx="3.2" ry="3.4" fill="#7a9660" stroke="#141612" stroke-width=".8"/><rect x="4" y="2" width="2" height="3" fill="#7a9660" stroke="#141612" stroke-width=".6"/><circle cx="5" cy="1.6" r="1.5" fill="#ff9a30"/></svg>',
  grenade:
    '<svg viewBox="0 0 12 12"><ellipse cx="5.5" cy="7" rx="4" ry="4" fill="#5a6b3c" stroke="#141612"/><rect x="7" y="1.5" width="3" height="3" fill="#d9783a"/></svg>',
  wood: '<svg viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="#7a5634" stroke="#141612"/><path d="M2 2l8 8" stroke="#4a3220" stroke-width="1.5"/></svg>',
  metal:
    '<svg viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="#8a8f93" stroke="#141612"/><path d="M2 10l8-8" stroke="#c9cdd0"/></svg>',
  fence:
    '<svg viewBox="0 0 12 12"><rect x="0.5" y="3.5" width="11" height="5" fill="#3c4146" stroke="#141612"/><path d="M2 4l3 4M5 4l3 4M8 4l3 4" stroke="#9aa1a8" stroke-width=".8"/><rect x="0.5" y="3.5" width="2" height="5" fill="#c7a24a"/></svg>',
  sandbag:
    '<svg viewBox="0 0 12 12"><ellipse cx="3.5" cy="6" rx="3" ry="2.5" fill="#8a7d5c" stroke="#141612" stroke-width=".8"/><ellipse cx="8.5" cy="6" rx="3" ry="2.5" fill="#7f7354" stroke="#141612" stroke-width=".8"/></svg>',
  concrete:
    '<svg viewBox="0 0 12 12"><rect x="0.5" y="3" width="11" height="6" fill="#8c8a84" stroke="#141612"/><rect x="0.5" y="3" width="11" height="2" fill="#a3a19a"/></svg>',
  hesco:
    '<svg viewBox="0 0 12 12"><rect x="0.5" y="2.5" width="11" height="7" fill="#c9b98c" stroke="#141612"/><rect x="1.8" y="3.8" width="3.6" height="4.4" fill="#a8966a"/><rect x="6.6" y="3.8" width="3.6" height="4.4" fill="#a8966a"/><path d="M6 2.5v7" stroke="#6e7070" stroke-width=".8"/></svg>',
  turret:
    '<svg viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="#3d4246" stroke="#141612"/><circle cx="6" cy="6" r="3" fill="#5c6268"/><rect x="6" y="5" width="5.5" height="2" fill="#1e2124"/></svg>',
  heavy:
    '<svg viewBox="0 0 12 12"><path d="M6 6L2 1.5M6 6l-4 4.5M6 6l-.5 5" stroke="#141612" stroke-width="1.6"/><rect x="2.5" y="2.5" width="5" height="7" rx="1" fill="#7b838a" stroke="#141612" stroke-width=".8"/><rect x="7.5" y="3.5" width="4.5" height="1.6" fill="#25282b"/><rect x="7.5" y="6.9" width="4.5" height="1.6" fill="#25282b"/><rect x="3" y="5.6" width="4" height=".8" fill="#c9a54a"/></svg>',
  spikes:
    '<svg viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="#4a4740" stroke="#141612"/><path d="M3 5l1-2 1 2M7 5l1-2 1 2M3 10l1-2 1 2M7 10l1-2 1 2" fill="#b8b2a4"/></svg>',
  mine: '<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" fill="#4a5236" stroke="#141612"/><circle cx="6" cy="6" r="1.4" fill="#ff5a3a"/></svg>',
  wire: '<svg viewBox="0 0 12 12"><path d="M0 6l2-3 2 6 2-6 2 6 2-6 2 3" fill="none" stroke="#c9c4b6" stroke-width="1.2"/></svg>',
};

class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.trauma = 0;
    this.kx = 0;
    this.ky = 0;
    this.sx = 0;
    this.sy = 0;
    this.viewW = 800;
    this.viewH = 600;
  }
  // Temblor de fuerza a (0..1). Con lugar (x, y) se apaga con la distancia a la cámara; sin lugar
  // es algo que le pasa a este jugador (su golpe, su muerte). La fuente más fuerte manda y las demás
  // suman poco, así que muchos golpes seguidos no dejan la cámara temblando al tope.
  shake(a, x, y) {
    if (typeof x === 'number' && typeof y === 'number') {
      const d = Math.hypot(x - this.x, y - this.y);
      a *= clamp(1 - (d - CAMERA.near) / (CAMERA.far - CAMERA.near), 0, 1);
    }
    if (!(a > 0)) return;
    this.trauma = Math.min(1, Math.max(this.trauma, a) + a * CAMERA.stack * (1 - this.trauma));
  }
  kick(x, y) {
    this.kx += x;
    this.ky += y;
  }
  update(dt, tx, ty, snap) {
    const a = snap ? 1 : 1 - Math.exp(-dt * 7);
    this.x += (tx - this.x) * a;
    this.y += (ty - this.y) * a;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const k = Math.exp(-dt * 16);
    this.kx *= k;
    this.ky *= k;
    const s = this.trauma * this.trauma * CAMERA.shake;
    this.sx = rand(-s, s) + this.kx;
    this.sy = rand(-s, s) + this.ky;
  }
}

/** @param {EventTarget | null} t @param {string} sel @returns {HTMLElement | null} */
const closest = (t, sel) => /** @type {HTMLElement} */ (t).closest(sel);

class Game {
  constructor() {
    this.root = document.getElementById('game');
    this.canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('view'));
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.input = new Input(this.root, this.canvas);
    this.input.onModeChange = (m) => this.root.classList.toggle('touch', m === 'touch');
    this.root.classList.toggle('touch', this.input.mode === 'touch');
    this.accounts = new Accounts();
    this.sfx = new Sfx();
    this.music = new Music(this.sfx);
    this.sfx.onReady = () => this.music.start();
    this.lighting = new Lighting();
    this.camera = new Camera();
    this.particles = new Particles();
    this.decals = new Decals();
    this.pickups = new Pickups();
    this.bullets = new Bullets();
    this.structures = new Structures();
    this.robot = new Robot();
    this.coop = new Coop(this);
    this.online = new Online(this);
    this.base = { z: 1, tx: 0, ty: 0 };
    this.view = { x0: 0, y0: 0, x1: 0, y1: 0 };
    this.ash = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: rand(0.6, 1.8),
      v: rand(0.004, 0.012),
      p: rand(0, TAU),
    }));
    this.state = 'menu';
    this.time = 0;
    this.menuT = 0;
    this.muzzle = 0;
    this.hurtFlash = 0;
    this.cache = {};
    /** @type {(id: string) => any} */
    this.$ = (id) => document.getElementById(id);
    this.look = cleanLook(storage.get('dz-look', null));
    // última clase elegida (se vuelve a preguntar en cada partida)
    const cls = storage.get('dz-class', null);
    this.classPick = isClass(cls) ? cls : CLASS_ORDER[0];
    this.bindUi();
    this.resize();
    this.newWorld();
    this.setupMenu();
    // al entrar: crear cuenta o elegir una
    if (!this.accounts.current) this.showAccount();
    // como Artifact de Claude: progreso en la nube y clasificación global
    // clasificación mundial: sube tu mejor marca al abrir el juego (por si antes no hubo conexión)
    if (this.accounts.current) this.accounts.pushOnline(this.accounts.current);
    this.accounts.initCloud().then(async (ok) => {
      if (!ok) return;
      if (this.state === 'account') this.$('acct-cloud').hidden = false;
      const cur = this.accounts.current;
      if (cur && cur.best) await this.accounts.pushScore(cur);
      if (cur && (await this.accounts.cloudPull()) && this.state === 'menu') this.setupMenu();
      else if (this.state === 'menu') this.refreshHall();
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    window.addEventListener('pagehide', () => this.player && this.saveProgress());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.player) this.saveProgress();
      if (document.hidden && this.state === 'play') this.pause();
    });
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    window.__deadzone = this;
    // invitación (?sala=CÓDIGO) o vuelta tras recargar en plena partida en línea
    this.inviteCode = (new URLSearchParams(location.search).get('sala') || '').toUpperCase().slice(0, 6);
    if (this.accounts.current) this.openInvite();
  }

  // ¿Simula otro (el anfitrión del cooperativo o el servidor en línea)? Entonces aquí no se
  // calcula daño: las balas propias son de adorno.
  get remoteSim() {
    return this.coop.isGuest || this.online.active;
  }

  /* ---------- partidas ---------- */

  newWorld(seed) {
    this.world = new World(seed);
    this.world.setChunkScale(this.chunkScale);
    this.world.maxChunks = this.maxChunks;
  }

  resetRun() {
    const w = this.world;
    this.player = new Player(w.spawn.x, w.spawn.y);
    this.player.look = this.look;
    this.horde = new Horde();
    this.director = new Director();
    this.particles.clear();
    this.decals.clear();
    this.pickups.clear();
    this.bullets.clear();
    this.time = 0;
    // partida del cooperativo: nunca toca el guardado de tu partida normal
    this.coopRun = false;
    this.robot.reset();
    this.setAcid(0);
    this.kills = { normal: 0, swat: 0, sprinter: 0, fat: 0, heavy: 0, bull: 0, giant: 0 };
    this.level = 1;
    this.xp = 0;
    this.xpNeed = xpForLevel(1);
    this.pendingLevels = 0;
    this.taken = {};
    this.money = 0;
    this.moneyEarned = 0;
    this.inv = Object.fromEntries([...BUILD_ORDER, ...THROWABLES].map((k) => [k, 0]));
    this.buildSel = 'wood';
    this.shopPending = false;
    this.structures.clear();
    this.deathT = 0;
    this.goldenT = GOLDEN.firstAfter;
    this.stepT = 0;
    this.music.reset();
    this.muzzle = 0;
    this.hurtFlash = 0;
    this.flowT = 0;
    this.camera.x = w.spawn.x;
    this.camera.y = w.spawn.y;
    this.camera.trauma = 0;
    w.updateFlow(w.spawn.x, w.spawn.y);
    this.cache = {};
  }

  setupMenu() {
    this.resetRun();
    this.player.alive = false;
    const { x, y } = this.world.spawn;
    for (let i = 0; i < 22; i++) {
      for (let t = 0; t < 8; t++) {
        const a = rand(0, TAU);
        const d = rand(160, 560);
        const zx = x + Math.cos(a) * d;
        const zy = y + Math.sin(a) * d;
        if (this.world.pointBlocked(zx, zy, 24)) continue;
        this.horde.spawn(i % 9 === 0 ? 'fat' : 'normal', zx, zy).spawnT = 0;
        break;
      }
    }
    this.setState('menu');
    const cur = this.accounts.current;
    this.$('acct-name').textContent = cur ? cur.name : 'Sin cuenta';
    this.$('acct-best').textContent =
      cur && cur.best ? `Tu récord: oleada ${cur.best.wave} · ${cur.best.kills} bajas` : '';
    const save = storage.get(this.accounts.saveKey(), null) || storage.get(this.accounts.checkKey(), null);
    this.$('btn-continue').hidden = !save;
    if (save) {
      this.$('btn-continue').textContent =
        save.dstate === 'active' ? `Continuar · ronda ${save.wave}` : `Continuar · ronda ${save.wave + 1}`;
    }
    this.$('btn-start').textContent = save ? 'Nueva partida' : 'Jugar';
    this.$('btn-start').classList.toggle('primary', !save);
    this.refreshHall();
    const best = storage.get('dz-best', null);
    this.$('best').textContent = best
      ? `Récord: ${fmtTime(best.time)} · ${best.kills} bajas · oleada ${best.wave}`
      : '';
  }

  start(freshWorld) {
    this.sfx.unlock();
    // una partida nueva sustituye al progreso guardado
    storage.remove(this.accounts.saveKey());
    storage.remove(this.accounts.checkKey());
    if (freshWorld) this.newWorld();
    this.resetRun();
    this.player.cls = this.classPick;
    this.input.reset();
    this.input.setRun(false);
    this.setState('play');
    this.updateHud(true);
  }

  setState(s) {
    this.state = s;
    this.music.setPaused(s !== 'play' && s !== 'menu' && s !== 'look' && s !== 'class');
    this.root.className = this.root.className.replace(/\bstate-\w+/g, '').trim() + ' state-' + s;
    this.$('screen-pause').hidden = s !== 'pause';
    this.$('screen-level').hidden = s !== 'levelup';
    this.$('screen-over').hidden = s !== 'over';
    this.$('screen-shop').hidden = s !== 'shop';
    this.$('screen-account').hidden = s !== 'account';
    this.$('screen-board').hidden = s !== 'board';
    this.$('screen-look').hidden = s !== 'look';
    this.$('screen-coop').hidden = s !== 'coop';
    this.$('screen-online').hidden = s !== 'online';
    this.$('screen-class').hidden = s !== 'class';
  }

  pause() {
    if (this.state !== 'play') return;
    this.input.reset();
    this.setState('pause');
  }

  resume() {
    if (this.state !== 'pause') return;
    this.sfx.unlock();
    this.input.reset();
    this.last = performance.now();
    this.setState('play');
  }

  /* ---------- progreso guardado ---------- */

  // Se guarda cada pocos segundos, también a mitad de ronda (con los zombis vivos),
  // y al cerrar o minimizar la página. Al terminar una ronda se crea además un punto de control.
  saveProgress() {
    if (this.coop.active || this.coopRun) return;
    const p = this.player;
    const ds = this.director.state;
    if (!p || !p.alive || (ds !== 'waiting' && ds !== 'active')) return;
    const s = this.structures;
    const queue = {};
    for (const t of this.director.queue) queue[t] = (queue[t] || 0) + 1;
    const data = {
      v: 1,
      savedAt: Date.now(),
      dstate: ds,
      queue,
      waveSize: this.director.waveSize,
      zombies:
        ds === 'active'
          ? this.horde.list
              .filter((z) => !z.dead && z.type !== 'golden')
              .map((z) => [z.type, Math.round(z.x), Math.round(z.y), Math.ceil(z.hp)])
          : [],
      seed: this.world.seedBase,
      wave: this.director.wave,
      time: this.time,
      kills: this.kills,
      level: this.level,
      xp: this.xp,
      taken: this.taken,
      money: this.money,
      moneyEarned: this.moneyEarned,
      inv: this.inv,
      buildSel: this.buildSel,
      player: {
        x: p.x,
        y: p.y,
        hp: p.hp,
        stamina: p.stamina,
        stats: p.stats,
        weapons: p.weapons.map((w) => ({ id: w.id, mag: w.mag, reserve: w.reserve === Infinity ? -1 : w.reserve })),
        wi: p.wi,
        shotsFired: p.shotsFired,
        shotsHit: p.shotsHit,
        damageTaken: p.damageTaken,
        cls: p.cls,
        abCd: p.abCd,
        heavyAmmo: p.heavyAmmo,
      },
      blocks: s.blocks.map((b) => ({ kind: b.kind, x: b.x, y: b.y, w: b.w, h: b.h, hp: b.hp })),
      wires: s.wires.map((b) => ({ kind: b.kind, x: b.x, y: b.y, w: b.w, h: b.h, hp: b.hp })),
      robot: { ...this.robot.serialize(), piloted: this.robot.piloted },
    };
    storage.set(this.accounts.saveKey(), data);
    if (ds === 'waiting') storage.set(this.accounts.checkKey(), data);
    // copia en la nube (si el juego corre como Artifact con base de datos), sin saturar
    const now = Date.now();
    if (ds === 'waiting' || now - (this.cloudSavedAt || 0) > 20000) {
      this.cloudSavedAt = now;
      this.accounts.cloudSave('save', data);
      if (ds === 'waiting') this.accounts.cloudSave('check', data);
    }
    this.saveT = 0;
  }

  loadProgress(kind = 'save') {
    const key = kind === 'check' ? this.accounts.checkKey() : this.accounts.saveKey();
    let d = storage.get(key, null);
    if (!d && kind === 'save') d = storage.get(this.accounts.checkKey(), null);
    if (!d || d.v !== 1) return false;
    this.sfx.unlock();
    if (this.world.seedBase !== d.seed) this.newWorld(d.seed);
    this.resetRun();
    Object.assign(this.kills, d.kills);
    this.time = d.time;
    this.level = d.level;
    this.xp = d.xp;
    this.xpNeed = xpForLevel(d.level);
    this.taken = d.taken || {};
    this.money = d.money;
    this.moneyEarned = d.moneyEarned;
    Object.assign(this.inv, d.inv);
    this.buildSel = d.buildSel || 'wood';
    const p = this.player;
    const sp = d.player;
    Object.assign(p.stats, sp.stats);
    p.x = sp.x;
    p.y = sp.y;
    p.hp = Math.min(sp.hp, p.stats.maxHp);
    p.stamina = sp.stamina;
    // (partidas viejas: la pistola se cambia por el arma inicial, que siempre tiene balas infinitas)
    p.weapons = sp.weapons
      .filter((w) => WEAPONS[w.id] && w.id !== 'pistol' && w.id !== START_WEAPON)
      .map((w) => ({ id: w.id, def: WEAPONS[w.id], mag: w.mag, reserve: w.reserve < 0 ? Infinity : w.reserve }));
    p.weapons.unshift(p.makeWeapon(START_WEAPON));
    p.weapons.sort((a, b) => WEAPON_ORDER.indexOf(a.id) - WEAPON_ORDER.indexOf(b.id));
    p.wi = Math.min(sp.wi, p.weapons.length - 1);
    p.shotsFired = sp.shotsFired;
    p.shotsHit = sp.shotsHit;
    p.damageTaken = sp.damageTaken;
    // partidas guardadas antes de las clases: la última elegida
    p.cls = isClass(sp.cls) ? sp.cls : this.classPick;
    p.abCd = Math.max(0, Number(sp.abCd) || 0);
    p.heavyAmmo = Math.max(0, Number(sp.heavyAmmo) || 0);
    for (const b of d.blocks) {
      if (!SHOP[b.kind]) continue;
      const o = {
        k: 0,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        low: true,
        block: true,
        kind: b.kind,
        hp: b.hp,
        max: SHOP[b.kind].hp,
        hitT: 0,
        cd: 0,
        ang: 0,
      };
      this.structures.blocks.push(o);
      this.world.addDynamic(o);
    }
    this.structures.relayer();
    this.robot.restore(d.robot);
    if (d.robot && d.robot.piloted && !this.robot.broken) this.robot.board(p);
    for (const b of d.wires) if (SHOP[b.kind]) this.structures.wires.push({ ...b, max: SHOP[b.kind].hp, hitT: 0 });
    const dir = this.director;
    dir.wave = d.wave;
    dir.state = 'waiting';
    if (d.dstate === 'active') {
      // reanudar la ronda a medias: los zombis vuelven donde estaban y el resto sigue en cola
      dir.state = 'active';
      const q = [];
      for (const [t, n] of Object.entries(d.queue || {})) for (let i = 0; i < n; i++) q.push(t);
      for (let i = q.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q[i], q[j]] = [q[j], q[i]];
      }
      dir.queue = q;
      dir.waveSize = d.waveSize || q.length;
      dir.waveT = WAVES.spawnTime * (1 - q.length / dir.waveSize);
      dir.spawnT = 1;
      for (const [t, x, y, hp] of d.zombies || []) {
        if (!this.horde.sprites[t]) continue;
        const z = this.horde.spawn(t, x, y, dir.hpMult, dir.speedMult);
        z.hp = Math.min(hp, z.maxHp);
      }
    }
    this.camera.x = p.x;
    this.camera.y = p.y;
    this.world.updateFlow(p.x, p.y);
    this.input.reset();
    this.input.setRun(false);
    this.setState('play');
    this.updateHud(true);
    this.toast(
      d.dstate === 'active'
        ? `Progreso cargado · ronda ${d.wave} en curso`
        : `Progreso cargado · ronda ${d.wave} superada`,
    );
    this.saveT = 0;
    return true;
  }

  /* ---------- eventos de combate ---------- */

  hitZombie(z, b, hx, hy) {
    // invitado: sus balas son de adorno, el daño real lo calcula el anfitrión
    if (z.dead || this.remoteSim) return;
    // quién lo hirió (cooperativo: las bajas del compañero le dan el dinero a él)
    z.lastOwner = b.owner || null;
    bulletHit(this, z, b, hx, hy);
    if (b.shot && !b.shot.hit) {
      b.shot.hit = true;
      this.player.shotsHit++;
    }
    if (z.hp <= 0) this.killZombie(z);
  }

  killZombie(z) {
    if (z.dead) return;
    z.dead = true;
    this.kills[z.type] = (this.kills[z.type] || 0) + 1;
    if (z.burn > 0) z.burnt = true;
    this.decals.corpse(z, z.lastDx || 0, z.lastDy || 0);
    const byPeer = z.lastOwner === 'peer' && this.coop.isHost;
    if (z.type === 'golden' && this.state !== 'menu') {
      // recompensa única del zombi dorado (para quien lo mató)
      const reward = randInt(GOLDEN.rewardMin, GOLDEN.rewardMax);
      if (byPeer) this.coop.send({ t: 'earn', n: reward, gold: 1 });
      else {
        this.money += reward;
        this.moneyEarned += reward;
        this.moneyPop(`+$${reward}`, 'gold');
        this.sfx.gold();
        this.toast(`¡Zombi dorado! +$${reward}`);
      }
      this.particles.pickupFx(z.x, z.y, '#f0c040');
    }
    this.particles.death(z.x, z.y, z.r);
    // el gordo revienta en ácido y el super blindado estalla
    if (z.type === 'fat' && this.state !== 'menu') this.structures.queueDeathBlast(z.type, z.x, z.y);
    this.addXp(z.def.xp);
    if (this.state !== 'menu') {
      if (byPeer) this.coop.earn(BOUNTY[z.type]);
      else {
        this.money += BOUNTY[z.type];
        this.moneyEarned += BOUNTY[z.type];
      }
    }
    const p = this.player;
    const hasGuns = p.weapons.length > 1 || this.coop.active;
    const r = Math.random();
    if (z.type === 'giant') {
      this.camera.shake(0.5, z.x, z.y);
      this.particles.ring(z.x, z.y, z.r, '170,160,140');
      this.pickups.drop('crate', z.x, z.y);
      this.pickups.drop('med', z.x + 24, z.y);
      this.sfx.kill(true);
      this.toast('Gigante abatido');
    } else {
      const drop = DROPS[z.type] || DROPS.normal;
      if (r < drop.ammo && hasGuns) this.pickups.drop('ammo', z.x, z.y);
      else if (r < drop.ammo + drop.med) this.pickups.drop('med', z.x, z.y);
      this.sfx.kill(z.type === 'fat' || z.type === 'heavy');
    }
  }

  /* ---------- habilidad de clase ---------- */

  // Pantalla de elegir clase antes de una partida en solitario.
  showClass(freshWorld) {
    this.classFresh = freshWorld;
    this.setState('class');
    const wrap = this.$('class-cards');
    wrap.classList.remove('ready');
    wrap.innerHTML = '';
    CLASS_ORDER.forEach((id, i) => {
      const c = CLASSES[id];
      const b = document.createElement('button');
      b.className = 'card cls' + (id === this.classPick ? ' sel' : '');
      b.innerHTML = `<span class="ic">${c.icon}</span><span class="nm"></span><span class="ds"></span><span class="tg">Cada ${Math.round(cooldownOf(this.player))} s <span class="key">· tecla ${i + 1}</span></span>`;
      b.querySelector('.nm').textContent = c.name;
      b.querySelector('.ds').textContent = c.desc;
      b.addEventListener('click', () => this.chooseClass(id));
      wrap.appendChild(b);
    });
    this.classReadyAt = performance.now() + 250;
    setTimeout(() => wrap.classList.add('ready'), 250);
  }

  chooseClass(id) {
    if (this.state !== 'class' || performance.now() < this.classReadyAt || !isClass(id)) return;
    this.setClassPick(id);
    this.start(this.classFresh);
    this.toast(
      `${CLASSES[id].name}: ${this.input.mode === 'touch' ? 'toca el botón de habilidad' : 'pulsa X'} para usarla`,
    );
  }

  setClassPick(id) {
    if (!isClass(id)) return;
    this.classPick = id;
    storage.set('dz-class', id);
    this.renderClassRows();
    // en la sala en línea el servidor la guarda para la próxima partida
    if (this.online.room && !this.online.playing) this.online.send('cls', { v: id });
  }

  // Selector compacto de clase en las salas del cooperativo y en línea.
  renderClassRows() {
    for (const row of this.root.querySelectorAll('.class-row')) {
      row.innerHTML = '';
      for (const id of CLASS_ORDER) {
        const c = CLASSES[id];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cls-btn' + (id === this.classPick ? ' sel' : '');
        b.title = c.desc;
        b.innerHTML = `${c.icon}<span></span>`;
        b.querySelector('span').textContent = c.name;
        b.addEventListener('click', () => this.setClassPick(id));
        row.appendChild(b);
      }
    }
  }

  // X o el botón: misil donde apuntas, megarráfaga o impulso.
  useAbility() {
    const p = this.player;
    if (!p.cls || !p.alive) return;
    if (p.abCd > 0) return this.toast(`Habilidad lista en ${Math.ceil(p.abCd)} s`);
    const t = abilityTarget(this, p);
    // en línea la usa el servidor; aquí se ve al instante (el misil llega con la siguiente foto)
    if (this.online.active) this.online.act('ab', { tx: Math.round(t.x), ty: Math.round(t.y) });
    else if (this.coop.isGuest && p.cls === 'bomber') this.coop.guestMissile(t.x, t.y);
    Abilities.use(this, p, t.x, t.y, null);
    this.updateHud(false);
  }

  /* ---------- robot ---------- */

  // Subirse o bajarse del robot (E o el botón ROBOT). Junto a una torreta pesada, la monta.
  toggleRobot() {
    const p = this.player;
    // en línea la monta y la deja el servidor (que repite estas comprobaciones)
    if (this.online.active && (p.manned || (!p.inRobot && this.structures.nearHeavy(p))))
      return this.online.act('robot');
    if (p.manned) return this.leaveHeavy();
    if (!p.inRobot && !this.coop.isGuest) {
      const h = this.structures.nearHeavy(p);
      if (h) return this.mountHeavy(h);
    }
    if (this.coop.isGuest) return this.toast('En cooperativo el robot es del anfitrión');
    const rb = this.robot;
    if (!rb.owned) {
      if (this.structures.blocks.some((b) => b.kind === 'heavy'))
        return this.toast('Acércate a la torreta pesada para montarla');
      return this.toast('Compra el robot de combate en la tienda');
    }
    // en línea se sube o se baja en el servidor (que repite estas mismas comprobaciones)
    if (this.online.active) {
      if (!rb.piloted && rb.broken) return this.toast('Robot destruido: repáralo en la tienda');
      if (!rb.piloted && !rb.near(p)) return this.toast('Acércate al robot para subirte');
      return this.online.act('robot');
    }
    if (rb.piloted) {
      rb.leave(p, this.world);
      this.sfx.build();
      return;
    }
    if (rb.broken) return this.toast('Robot destruido: repáralo en la tienda');
    if (!rb.near(p)) return this.toast('Acércate al robot para subirte');
    rb.board(p);
    this.sfx.punch();
    this.camera.shake(0.2);
  }

  /* ---------- torreta pesada ---------- */

  mountHeavy(b) {
    const p = this.player;
    this.structures.mountHeavy(p, b);
    this.sfx.build();
    this.camera.shake(0.12);
    if (p.heavyAmmo <= 0) this.toast('Torreta sin balas: cómpralas en la tienda');
  }

  leaveHeavy() {
    this.structures.leaveHeavy(this.player);
    this.sfx.build();
  }

  buyHeavyAmmo(n) {
    const cost = HEAVY.price * n;
    if (this.money < cost) return;
    if (this.online.active) return this.online.buy('heavy', 'ammo', n);
    this.money -= cost;
    this.player.heavyAmmo += HEAVY.pack * n;
    this.sfx.buy();
    this.renderShop();
  }

  onRobotHit(dmg) {
    const rb = this.robot;
    this.sfx.blockHit('metal');
    if (!rb.damage(dmg)) return;
    // se acabó el blindaje: explota y sales despedido
    const p = this.player;
    this.structures.explode(this, { x: rb.x, y: rb.y }, 170, 450, 1);
    rb.leave(p, this.world);
    rb.hp = 0;
    this.toast('¡Robot destruido! Repáralo en la tienda');
  }

  buyRobot() {
    const rb = this.robot;
    if (rb.owned || this.money < ROBOT.price) return;
    if (this.online.active) return this.online.buy('robot', 'buy');
    this.money -= ROBOT.price;
    rb.deploy(this.player, this.world);
    this.sfx.buy();
    this.toast(this.input.mode === 'touch' ? 'Robot listo: acércate y toca ROBOT' : 'Robot listo: acércate y pulsa E');
    this.renderShop();
  }

  repairRobot() {
    const rb = this.robot;
    const cost = rb.repairCost;
    if (!rb.owned || cost <= 0 || this.money < cost) return;
    if (this.online.active) return this.online.buy('robot', 'repair');
    this.money -= cost;
    rb.hp = ROBOT.hp;
    this.sfx.build();
    this.toast('Robot reparado');
    this.renderShop();
  }

  // Impacto de cohete: en gordos y super blindados se clava; en el resto estalla al instante.
  rocketHit(z, x, y, b) {
    if (this.remoteSim) return;
    if ((z.type === 'fat' || z.type === 'heavy') && !z.dead) this.structures.stickRocket(this, z, x, y, b);
    else this.rocketBlast(x, y, b.owner);
  }

  rocketBlast(x, y, owner = null) {
    if (this.remoteSim) return;
    this.structures.explode(this, { x, y, owner }, ROCKET.radius, ROCKET.power, 1);
  }

  // Super golpe del blindado (al jugador o a una estructura).
  onSuperPunch(z, x, y) {
    this.particles.dust(x, y, 18);
    this.camera.shake(0.35, x, y);
    this.sfx.punch();
  }

  // Ácido del gordo: quema unos segundos (vida por segundo) y nubla la vista.
  applyAcid() {
    if (this.state === 'menu' || !this.player.alive || this.player.inRobot || this.player.boostT > 0) return;
    if (!(this.acidT > 0)) this.acidTick = 0;
    this.acidT = ACID.burn;
    this.hurtFlash = Math.min(1, this.hurtFlash + 0.3);
    this.sfx.sizzle();
    this.toast('¡Ácido! Te estás quemando');
  }

  setAcid(t) {
    this.acidT = t;
    const k = t > 0 ? Math.min(1, t / 0.8) : 0;
    const q = Math.round(k * 10);
    if (q === this.acidQ) return;
    this.acidQ = q;
    // desenfoque real del lienzo (Chrome y Safari); el HUD queda nítido
    this.canvas.style.filter = q ? `blur(${(q * 0.32).toFixed(2)}px) saturate(${(1 - q * 0.04).toFixed(2)})` : '';
  }

  updateAcid(dt) {
    if (!(this.acidT > 0)) return;
    const p = this.player;
    this.acidTick += dt;
    while (this.acidTick >= 1 && p.alive) {
      this.acidTick -= 1;
      // daño directo y fijo: 2 de vida por segundo
      p.hp -= ACID.dps;
      p.damageTaken += ACID.dps;
      p.hurtT = 0.2;
      this.hurtFlash = Math.min(1, this.hurtFlash + 0.15);
      this.particles.acidBurst(p.x, p.y, 18);
      this.sfx.sizzle();
      if (p.hp <= 0) {
        p.hp = 0;
        p.alive = false;
        this.onPlayerDeath();
      }
    }
    this.setAcid(p.alive ? Math.max(0, this.acidT - dt) : 0);
  }

  drawAcid(ctx, W, H) {
    if (!(this.acidT > 0)) return;
    const k = Math.min(1, this.acidT / 0.8);
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 5);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, `rgba(110,190,40,${0.22 * k * pulse})`);
    g.addColorStop(1, `rgba(60,130,20,${0.6 * k * pulse})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // El dorado se fue sin que lo mataras: no da nada ni cuenta como baja.
  onGoldenExpired(z) {
    z.dead = true;
    this.particles.dust(z.x, z.y, 20);
    this.particles.pickupFx(z.x, z.y, '#8a7a40');
    this.toast('El zombi dorado escapó');
  }

  // Cada golpe de zombi cuesta dinero (una sola vez por golpe).
  onZombieHit(z, target) {
    // el golpe al compañero se lo cobra su propio celular
    if (target && target.remote) return this.coop.send({ t: 'hit' });
    // dentro del robot los golpes no te cuestan dinero: los aguanta el blindaje
    if (this.state === 'menu' || this.player.inRobot || this.player.boostT > 0) return;
    const loss = Math.min(this.money, randInt(MONEY_LOSS.min, MONEY_LOSS.max));
    if (loss <= 0) return;
    this.money -= loss;
    this.moneyPop(`-$${loss}`, 'loss');
    this.sfx.moneyLost();
    this.updateHud(false);
  }

  // Indicador flotante de dinero junto al contador (rojo al perder, dorado al ganar).
  moneyPop(text, kind) {
    const host = this.$('money-pops');
    if (!host) return;
    if (host.childElementCount > 5) host.firstElementChild.remove();
    const el = document.createElement('span');
    el.className = 'money-pop ' + kind;
    el.textContent = text;
    host.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  // Alrededor de quién aparecen los zombis (cooperativo: de cualquiera de los dos).
  spawnFocus() {
    const peer = this.coop.isHost && this.coop.peer && this.coop.peer.alive ? this.coop.peer : null;
    if (!peer) return this.player;
    if (!this.player.alive) return peer;
    return Math.random() < 0.5 ? this.player : peer;
  }

  spawnGolden() {
    const d = this.director;
    for (let i = 0; i < 20; i++) {
      const c = d.edgePoint(this, rand(60, 140));
      if (c.x < 80 || c.y < 80 || c.x > WORLD_SIZE - 80 || c.y > WORLD_SIZE - 80) continue;
      if (this.world.pointBlocked(c.x, c.y, 16) || !d.canReach(this, c.x, c.y) || d.seen(d.views(this), c.x, c.y, 16))
        continue;
      this.horde.spawn('golden', c.x, c.y, 1, d.speedMult);
      this.sfx.goldenSpawn();
      this.toast('¡Apareció un zombi dorado! Atrápalo antes de que escape');
      return true;
    }
    return false;
  }

  onGiantStep(z) {
    const p = this.player;
    const d = Math.hypot(p.x - z.x, p.y - z.y);
    const vol = clamp(1 - d / 750, 0, 1);
    this.particles.dust(z.x - Math.cos(z.angle) * 10, z.y - Math.sin(z.angle) * 10, z.r);
    if (vol > 0 && this.state === 'play') {
      this.camera.shake(0.16 * vol);
      this.sfx.stomp(vol);
    }
  }

  addXp(n) {
    this.xp += n;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = xpForLevel(this.level);
      this.pendingLevels++;
    }
  }

  onPlayerDeath() {
    if (this.coop.active) return this.coop.onLocalDeath();
    // la partida venía del cooperativo (tu compañero se fue): se pierde sólo esa
    if (this.coopRun) {
      this.recordScore();
      this.deathT = 1.6;
      this.input.reset();
      this.camera.shake(0.6);
      return;
    }
    // al morir se pierde la partida: la siguiente empieza desde cero (el récord sí se guarda)
    storage.remove(this.accounts.saveKey());
    storage.remove(this.accounts.checkKey());
    this.accounts.cloudClear();
    this.recordScore();
    this.deathT = 1.6;
    this.input.reset();
    this.camera.shake(0.6);
  }

  mouseWorld() {
    const m = this.input.mouse;
    return { x: (m.x * this.dpr - this.base.tx) / this.base.z, y: (m.y * this.dpr - this.base.ty) / this.base.z };
  }

  /* ---------- mejoras ---------- */

  openLevelUp() {
    this.setState('levelup');
    this.input.reset();
    this.sfx.level();
    const lvl = this.level - this.pendingLevels + 1;
    this.$('level-kicker').textContent = `Nivel ${lvl} alcanzado`;
    // en línea las ofrece el servidor (es quien aplica la mejora)
    this.choices = this.online.active ? this.online.upChoices() : rollUpgrades(this.player, lvl, this.taken);
    const wrap = this.$('cards');
    wrap.classList.remove('ready');
    wrap.innerHTML = '';
    this.choices.forEach((u, i) => {
      const b = document.createElement('button');
      b.className = 'card' + (u.weapon ? ' weapon' : '');
      const n = this.taken[u.id] || 0;
      const tag = u.weapon ? 'Arma nueva' : n ? `Nivel ${n + 1}` : 'Mejora';
      b.innerHTML = `<span class="ic">${ICONS[u.icon]}</span><span class="nm"></span><span class="ds"></span><span class="tg">${tag} <span class="key">· tecla ${i + 1}</span></span>`;
      b.querySelector('.nm').textContent = u.name;
      b.querySelector('.ds').textContent = u.desc;
      b.addEventListener('click', () => this.chooseUpgrade(i));
      wrap.appendChild(b);
    });
    // breve espera para no elegir sin querer al estar disparando
    this.levelReadyAt = performance.now() + 450;
    setTimeout(() => wrap.classList.add('ready'), 450);
  }

  chooseUpgrade(i) {
    if (this.state !== 'levelup' || performance.now() < this.levelReadyAt) return;
    const u = this.choices[i];
    if (!u) return;
    if (this.online.active) {
      // la siguiente tanda (si quedan niveles) llega con la próxima foto del servidor
      this.online.pickUpgrade(i);
      this.taken[u.id] = (this.taken[u.id] || 0) + 1;
      this.input.reset();
      this.last = performance.now();
      return this.setState('play');
    }
    u.apply(this.player);
    this.taken[u.id] = (this.taken[u.id] || 0) + 1;
    this.pendingLevels--;
    if (u.weapon) this.toast(`${u.name} equipada`);
    if (this.pendingLevels > 0) this.openLevelUp();
    else {
      this.input.reset();
      this.last = performance.now();
      this.setState('play');
    }
  }

  /* ---------- tienda y construcción ---------- */

  totalKills() {
    const k = this.kills;
    return k.normal + (k.swat || 0) + k.sprinter + k.fat + (k.heavy || 0) + (k.golden || 0) + k.giant;
  }

  onWaveCleared() {
    this.coop.onWaveCleared();
    this.shopPending = true;
    this.sfx.level();
    this.saveProgress();
    this.recordScore();
  }

  // Mejor marca de la cuenta: oleada alcanzada y bajas.
  recordScore() {
    if (this.state === 'menu') return;
    if (
      this.accounts.recordScore({
        wave: this.director.wave,
        kills: this.totalKills(),
        time: Math.round(this.time),
        level: this.level,
      })
    ) {
      this.toast('Nuevo récord de tu cuenta');
    }
  }

  /* ---------- cooperativo: sala ---------- */

  /* ---------- en línea (servidor, hasta 4 por sala) ---------- */

  showOnline(keepStatus) {
    this.sfx.unlock();
    this.setState('online');
    const name = this.$('ol-name');
    if (!name.value) name.value = this.accounts.current ? this.accounts.current.name : '';
    if (this.inviteCode) this.$('ol-code-in').value = this.inviteCode;
    const url = this.online.serverUrl();
    if (!keepStatus)
      this.onlineStatus(url ? '' : 'No hay servidor configurado: ver NET.server en js/core/config.js.', !url);
    this.renderClassRows();
    this.renderLobby();
  }

  onlineStatus(text, bad = false) {
    const el = this.$('ol-status');
    el.textContent = text;
    el.classList.toggle('bad', bad);
  }

  // Lista de integrantes, botones y resultados según la fase de la sala.
  renderLobby() {
    const ol = this.online;
    const room = ol.room;
    this.$('ol-choose').hidden = !!room;
    this.$('ol-lobby').hidden = !room;
    if (!room || !room.state || !room.state.members) return;
    const st = room.state;
    const me = ol.me;
    this.$('ol-code').textContent = st.code || room.roomId;
    const list = this.$('ol-members');
    list.innerHTML = '';
    const rows = [];
    st.members.forEach((m, id) => rows.push([id, m]));
    rows.sort((a, b) => a[1].joinedAt - b[1].joinedAt);
    for (const [id, m] of rows) {
      const li = document.createElement('li');
      li.className = 'ol-member' + (id === room.sessionId ? ' me' : '') + (m.connected ? '' : ' off');
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent =
        (id === st.ownerId ? '★ ' : '') +
        m.name +
        (id === room.sessionId ? ' (tú)' : '') +
        (CLASSES[m.cls] ? ` · ${CLASSES[m.cls].name}` : '');
      const tag = document.createElement('span');
      tag.className = 'tg';
      tag.textContent = !m.connected
        ? 'reconectando…'
        : st.phase === 'playing'
          ? m.inGame
            ? m.alive
              ? 'jugando'
              : 'caído'
            : 'esperando'
          : id === st.ownerId
            ? 'propietario'
            : m.ready
              ? 'listo'
              : 'no listo';
      li.append(nm, tag);
      list.appendChild(li);
    }
    this.$('ol-count').textContent = `${rows.length}/${st.maxPlayers}`;
    const phase = st.phase;
    const owner = ol.isOwner;
    const lobbyLike = phase === 'waiting' || phase === 'finished';
    this.$('btn-ol-ready').hidden = owner || !lobbyLike;
    this.$('btn-ol-ready').textContent = me && me.ready ? 'Ya no estoy listo' : 'Estoy listo';
    this.$('btn-ol-start').hidden = !owner || !lobbyLike;
    const waitingFor = rows.filter(([id, m]) => id !== st.ownerId && m.connected && !m.ready).length;
    this.$('btn-ol-start').disabled = waitingFor > 0;
    this.$('btn-ol-start').textContent = waitingFor
      ? `Esperando ${waitingFor} listo${waitingFor > 1 ? 's' : ''}`
      : 'Iniciar partida';
    this.$('btn-ol-lobby').hidden = !owner || phase !== 'finished';
    const ph =
      {
        waiting: 'Esperando jugadores',
        loading: 'Cargando…',
        playing: 'Partida en curso',
        finished: 'Partida terminada',
      }[phase] || '';
    this.$('ol-phase').textContent = ph;
    const res = this.$('ol-results');
    const r = ol.results;
    res.hidden = !r || phase !== 'finished';
    if (r && phase === 'finished') {
      res.innerHTML = '';
      const h = document.createElement('p');
      h.className = 'ol-res-head';
      h.textContent = `Oleada ${r.wave} · ${fmtTime(r.time)} · ${r.kills} bajas en total`;
      res.appendChild(h);
      for (const pl of r.players || []) {
        const row = document.createElement('div');
        row.className = 'ol-res-row';
        row.textContent = `${pl.name}: ${pl.kills} bajas · ${pl.deaths} caídas`;
        res.appendChild(row);
      }
    }
  }

  onlineName() {
    const n = this.$('ol-name').value.replace(/\s+/g, ' ').trim();
    if (!validName(n)) {
      this.onlineStatus('Nombre no válido: de 1 a 16 letras, números, espacios, _ . -', true);
      return null;
    }
    return n;
  }

  async onlineCreate() {
    const name = this.onlineName();
    if (!name || this.onlineBusy) return;
    this.onlineBusy = true;
    this.onlineStatus('Conectando con el servidor…');
    try {
      await this.online.create(name);
      this.onlineStatus('Sala creada: comparte el código o la invitación.');
      this.renderLobby();
    } catch (err) {
      this.onlineStatus(explainOnline(err), true);
    }
    this.onlineBusy = false;
  }

  async onlineJoin() {
    const name = this.onlineName();
    const code = this.$('ol-code-in').value.trim().toUpperCase();
    if (!name || this.onlineBusy) return;
    if (!/^[A-Z0-9]{6}$/.test(code)) return this.onlineStatus('El código tiene 6 letras o números.', true);
    this.onlineBusy = true;
    this.onlineStatus('Entrando a la sala…');
    try {
      await this.online.join(code, name);
      this.inviteCode = '';
      this.onlineStatus('');
      this.renderLobby();
    } catch (err) {
      this.onlineStatus(explainOnline(err), true);
    }
    this.onlineBusy = false;
  }

  copyInvite() {
    const room = this.online.room;
    if (!room) return;
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    const keep = new URLSearchParams(location.search).get('servidor');
    if (keep) u.searchParams.set('servidor', keep);
    u.searchParams.set('sala', room.roomId);
    const text = u.toString();
    const done = () => this.onlineStatus('Invitación copiada: ' + text);
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(text).then(done, () => this.onlineStatus(text));
    else this.onlineStatus(text);
  }

  // Abre la sala de una invitación, o vuelve a la partida tras recargar la página.
  async openInvite() {
    if (await this.online.resume()) return this.showOnline(true);
    if (this.inviteCode) this.showOnline();
  }

  toggleDiag() {
    if (!this.online.active) return;
    const el = this.$('net-diag');
    el.hidden = !el.hidden;
  }

  showCoop() {
    this.sfx.unlock();
    this.setState('coop');
    this.renderClassRows();
    this.$('coop-choose').hidden = false;
    this.$('coop-wait').hidden = true;
    this.$('coop-code-in').value = '';
    this.coopStatus(
      this.coop.net.available ? '' : 'El cooperativo necesita internet y un navegador con conexión directa (WebRTC).',
    );
  }

  coopStatus(text, bad = false) {
    const el = this.$('coop-status');
    el.textContent = text;
    el.classList.toggle('bad', bad);
  }

  coopError(err) {
    const m = String((err && err.message) || err);
    if (m === 'cancelado') return;
    const msg =
      {
        'no-existe': 'No existe una sala con ese código (o ya caducó).',
        llena: 'Esa sala ya está llena: sólo se puede jugar de 2.',
        permiso: 'Firebase no da permiso para crear salas: revisa la pestaña Reglas (ver README).',
        tiempo: 'El anfitrión no respondió. Pídele que cree una sala nueva y vuelve a intentar.',
        directa:
          'No se pudo conectar directo entre los celulares. Prueben los dos en la misma red Wi‑Fi o con otra red (algunas redes móviles lo bloquean).',
      }[m] || 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.';
    this.coopStatus(msg, true);
    this.$('coop-choose').hidden = false;
    this.$('coop-wait').hidden = true;
    this.coop.cancel();
  }

  async coopCreate() {
    if (!this.coop.net.available) return;
    this.$('coop-choose').hidden = true;
    this.$('coop-wait').hidden = false;
    this.$('coop-code').textContent = '····';
    this.coopStatus('Creando sala…');
    try {
      await this.coop.create((code) => {
        this.$('coop-code').textContent = code;
        this.coopStatus('Esperando a tu compañero…');
      });
    } catch (err) {
      this.coopError(err);
    }
  }

  async coopJoin() {
    const code = this.$('coop-code-in').value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) return this.coopStatus('El código tiene 4 letras.', true);
    if (!this.coop.net.available) return;
    this.coopStatus('Conectando…');
    try {
      await this.coop.join(code);
      this.coopStatus('¡Conectado! Esperando al anfitrión…');
      // si el anfitrión no arranca en un rato, algo falló
      const t0 = performance.now();
      while (!this.coop.active && this.state === 'coop') {
        if (performance.now() - t0 > 20000) throw new Error('tiempo');
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (err) {
      this.coopError(err);
    }
  }

  /* ---------- personaje ---------- */

  showLook() {
    this.setState('look');
    // muñeco sólo para la vista previa: camina en su sitio y gira despacio
    this.lookDummy = new Player(80, 80);
    this.lookDummy.r *= 3.4;
    this.lookDummy.speedNow = 60;
    this.renderLook();
  }

  renderLook() {
    const box = this.$('look-parts');
    box.innerHTML = '';
    for (const part of LOOK_PARTS) {
      const row = document.createElement('div');
      row.className = 'look-row';
      const lbl = document.createElement('span');
      lbl.textContent = part.name;
      const sw = document.createElement('div');
      sw.className = 'look-sw';
      for (const c of part.colors) {
        const b = document.createElement('button');
        b.type = 'button';
        b.style.background = c;
        b.setAttribute('aria-label', `${part.name} ${c}`);
        b.classList.toggle('on', this.look[part.id] === c);
        b.addEventListener('click', () => this.setLook({ ...this.look, [part.id]: c }));
        sw.appendChild(b);
      }
      row.append(lbl, sw);
      box.appendChild(row);
    }
    const row = document.createElement('div');
    row.className = 'look-row';
    const lbl = document.createElement('span');
    lbl.textContent = 'Sombrero';
    const sw = document.createElement('div');
    sw.className = 'look-sw look-hats';
    for (const h of HATS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = h.name;
      b.classList.toggle('on', this.look.hat === h.id);
      b.addEventListener('click', () => this.setLook({ ...this.look, hat: h.id }));
      sw.appendChild(b);
    }
    row.append(lbl, sw);
    box.appendChild(row);
  }

  setLook(look) {
    this.look = cleanLook(look);
    this.player.look = this.look;
    storage.set('dz-look', this.look);
    this.renderLook();
  }

  drawLookPreview(dt) {
    const p = this.lookDummy;
    const c = this.$('look-preview');
    const g = c.getContext('2d');
    p.look = this.look;
    p.walkPhase += dt * 9;
    p.angle += dt * 0.6;
    p.legAngle = p.angle;
    g.clearRect(0, 0, c.width, c.height);
    drawSurvivor(g, p, this.time);
  }

  /* ---------- cuentas y clasificación ---------- */

  showAccount() {
    this.setState('account');
    const acc = this.accounts;
    this.$('acct-error').textContent = '';
    this.$('acct-name-in').value = acc.current ? acc.current.name : '';
    this.$('acct-pin-in').value = '';
    const names = Object.values(acc.list).map((a) => a.name);
    const box = this.$('acct-known');
    box.innerHTML = '';
    box.hidden = !names.length;
    for (const n of names) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.textContent = n;
      b.addEventListener('click', () => {
        this.$('acct-name-in').value = n;
        this.$('acct-pin-in').focus();
      });
      box.appendChild(b);
    }
    this.$('acct-cloud').hidden = !acc.cloud;
  }

  async submitAccount(e) {
    e.preventDefault();
    const err = this.accounts.login(this.$('acct-name-in').value, this.$('acct-pin-in').value);
    if (err) {
      this.$('acct-error').textContent = err;
      return;
    }
    this.sfx.unlock();
    await this.accounts.cloudPull();
    this.newWorld();
    this.setupMenu();
  }

  async showBoard() {
    this.setState('board');
    const acc = this.accounts;
    const tab = this.boardTab || (acc.hasGlobal ? 'global' : 'local');
    this.syncBoardTabs('board', tab);
    this.$('board-note').textContent = acc.hasGlobal
      ? 'Mundial: récords de todos los que juegan. Dispositivo: cuentas guardadas en este navegador.'
      : 'Récords de las cuentas creadas en este navegador. Para competir entre dispositivos hace falta un servidor (ver README).';
    const target = { podium: this.$('board-podium'), list: this.$('board-list'), me: null, max: 50 };
    if (tab === 'global') this.renderBoard(null, target, 'Cargando…');
    const rows = await this.boardRows(tab);
    if (this.state === 'board')
      this.renderBoard(
        rows,
        target,
        tab === 'global' ? 'Todavía no hay récords globales.' : 'Todavía no hay récords. ¡Termina una oleada!',
      );
  }

  syncBoardTabs(prefix, tab) {
    const g = this.$(prefix + '-tab-global');
    g.hidden = !this.accounts.hasGlobal;
    g.classList.toggle('on', tab === 'global');
    this.$(prefix + '-tab-local').classList.toggle('on', tab === 'local');
  }

  async boardRows(tab) {
    return tab === 'global' ? await this.accounts.globalBoard() : this.accounts.localBoard();
  }

  // Salón de la fama del menú principal + tu puesto junto al nombre.
  async refreshHall() {
    const acc = this.accounts;
    const tab = this.boardTab || (acc.hasGlobal ? 'global' : 'local');
    this.syncBoardTabs('hall', tab);
    const target = { podium: this.$('hall-podium'), list: this.$('hall-list'), me: this.$('hall-me'), max: 8 };
    const local = acc.localBoard();
    this.renderBoard(tab === 'local' ? local : null, target, tab === 'global' ? 'Cargando…' : '');
    const online = tab === 'global' ? await acc.globalBoard() : local;
    if (this.state !== 'menu') return;
    // si la mundial falla, muestra la de este dispositivo y avisa por qué
    const rows = online || local;
    if (tab === 'global') this.renderBoard(rows, target, 'Todavía no hay récords. ¡Termina una oleada!');
    const err = tab === 'global' && !online ? acc.onlineError || 'No se pudo cargar la clasificación mundial.' : null;
    if (err) {
      const li = document.createElement('li');
      li.className = 'board-empty online-err';
      li.textContent = err;
      this.$('hall-list').appendChild(li);
    }
    const badge = this.$('acct-rank');
    const cur = acc.current;
    const i = cur && rows ? rows.findIndex((r) => acc.isMine(r)) : -1;
    badge.hidden = !cur;
    badge.className = 'rank-badge' + (i === 0 ? ' r1' : i === 1 ? ' r2' : i === 2 ? ' r3' : i < 0 ? ' none' : '');
    badge.textContent = i >= 0 ? `Top #${i + 1}${tab === 'global' && online ? ' mundial' : ''}` : 'Sin rango';
  }

  renderBoard(rows, t, empty) {
    const cur = this.accounts.current;
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const list = rows || [];
    const top = list.length ? Math.max(1, list[0].wave) : 1;
    // podio: 2.º, 1.º, 3.º
    t.podium.innerHTML = '';
    for (const i of [1, 0, 2]) {
      const r = list[i];
      const pod = el('div', `pod p${i + 1}${r ? '' : ' empty'}${r && this.accounts.isMine(r) ? ' me' : ''}`);
      if (i === 0) pod.appendChild(el('div', 'pod-crown')).innerHTML = CROWN_SVG;
      pod.appendChild(el('div', 'pod-medal', String(i + 1)));
      pod.appendChild(el('b', 'pod-name', r ? r.name : rows ? (i === 0 ? '¡Sé el primero!' : 'Libre') : '…'));
      const wv = pod.appendChild(el('span', 'pod-wave'));
      wv.appendChild(el('b', null, r ? String(r.wave) : '—'));
      wv.appendChild(document.createTextNode(' oleada'));
      pod.appendChild(el('span', 'pod-kills', r ? `${r.kills} bajas · ${fmtTime(r.time || 0)}` : ' '));
      pod.appendChild(el('div', 'pod-base'));
      t.podium.appendChild(pod);
    }
    t.list.innerHTML = '';
    if (!list.length && empty) {
      t.list.appendChild(el('li', 'board-empty', empty));
    }
    list.slice(3, t.max).forEach((r, k) => {
      const li = el('li', this.accounts.isMine(r) ? 'me' : '');
      li.appendChild(el('b', 'rk', String(k + 4)));
      li.appendChild(el('span', 'nm', r.name));
      li.appendChild(el('span', 'st', `Oleada ${r.wave} · ${r.kills} bajas · ${fmtTime(r.time || 0)}`));
      const bar = li.appendChild(el('i', 'bar-w'));
      bar.style.setProperty('--w', `${Math.round((r.wave / top) * 100)}%`);
      t.list.appendChild(li);
    });
    if (t.me) {
      t.me.innerHTML = '';
      const i = cur ? list.findIndex((r) => this.accounts.isMine(r)) : -1;
      if (cur && i >= 0) {
        t.me.appendChild(el('span', 'me-tag', 'Tu puesto'));
        t.me.appendChild(el('b', 'me-rank', `#${i + 1}`));
        t.me.appendChild(el('span', 'me-st', `Oleada ${list[i].wave} · ${list[i].kills} bajas`));
      } else if (cur && rows) {
        t.me.appendChild(el('span', 'me-tag', 'Tu puesto'));
        t.me.appendChild(el('span', 'me-st', 'Supera una oleada para entrar al salón'));
      }
    }
  }

  startNextRound() {
    if (this.online.active) return this.online.send('next');
    if (this.coop.isGuest) return this.coop.send({ t: 'next' });
    if (this.state !== 'play' || (!this.player.alive && !this.coop.active)) return;
    this.sfx.unlock();
    if (this.director.nextRound(this)) this.updateHud(false);
  }

  openShop() {
    this.shopPending = false;
    this.input.reset();
    this.setState('shop');
    this.$('shop-kicker').textContent = `Oleada ${this.director.wave} superada`;
    this.renderShop();
  }

  closeShop() {
    if (this.state !== 'shop') return;
    this.saveProgress();
    this.input.reset();
    this.last = performance.now();
    this.setState('play');
    if (BUILD_ORDER.some((k) => this.inv[k] > 0)) {
      this.toast(this.input.mode === 'touch' ? 'Toca Construir para colocar' : 'Pulsa F para colocar · V para cambiar');
    }
  }

  renderShop() {
    this.$('shop-money').textContent = `$${this.money}`;
    const p = this.player;
    const buyBtn = (attrs, price, label, extra = '') => {
      const poor = this.money < price;
      return `<button class="btn buy${extra}${poor ? ' poor' : ''}" ${attrs} ${poor ? 'disabled' : ''}>${label}</button>`;
    };
    // armas: de la más barata a la más potente
    const guns = WEAPON_ORDER.filter((id) => WEAPONS[id].price).map((id) => {
      const d = WEAPONS[id];
      const owned = p.has(id);
      return `<div class="shop-item${owned ? ' owned' : ''}">
        <canvas class="shop-ic" data-gun="${id}" width="96" height="96"></canvas>
        <div class="shop-txt"><b>${d.name}</b><span>${d.desc}</span><small>Daño ${d.damage}${d.pellets > 1 ? `×${d.pellets}` : ''} · ${d.rate} disp/s · cargador ${d.mag}</small></div>
        ${owned ? `<button class="btn buy sell" data-sell="${id}">Vender $${Math.round(d.price * SELL_RATE)}</button>` : buyBtn(`data-gun-buy="${id}"`, d.price, `$${d.price}`)}
      </div>`;
    });
    // munición sin límite para cada arma que tengas
    const ammo = p.weapons
      .filter((w) => w.reserve !== Infinity)
      .map((w) => {
        const d = w.def;
        const mag = p.magSize(d);
        return `<div class="shop-item">
        <canvas class="shop-ic" data-gun="${w.id}" width="96" height="96"></canvas>
        <div class="shop-txt"><b>${d.rocket ? 'Cohetes' : 'Balas'} · ${d.name}</b><span>${d.rocket ? `1 cohete por $${d.ammoPrice}` : `Cargador de ${mag} balas por $${d.ammoPrice}`}. Sin límite de reserva.</span><small>Reserva: ${w.reserve} ${d.rocket ? 'cohetes' : 'balas'}</small></div>
        <div class="buy-col">
          ${buyBtn(`data-ammo="${w.id}" data-n="1"`, d.ammoPrice, `+1 · $${d.ammoPrice}`, ' sm')}
          ${buyBtn(`data-ammo="${w.id}" data-n="10"`, d.ammoPrice * 10, `+10 · $${d.ammoPrice * 10}`, ' sm')}
        </div>
      </div>`;
      });
    // en cooperativo la torreta pesada es del anfitrión
    const noHeavy = this.coop.isGuest;
    const gear = SHOP_ORDER.filter((k) => !(noHeavy && SHOP[k].manned)).map((k) => {
      const it = SHOP[k];
      const poor = this.money < it.price;
      return `<div class="shop-item${THROWABLES.includes(k) ? ' hot' : ''}">
        <canvas class="shop-ic" data-ic="${k}" width="96" height="96"></canvas>
        <div class="shop-txt"><b>${it.name}</b><span>${it.desc}</span><small>Tienes ${this.inv[k]}${it.hp > 1 ? ` · Resistencia ${it.hp}` : ''}</small></div>
        <button class="btn buy${poor ? ' poor' : ''}" data-buy="${k}" ${poor ? 'disabled' : ''}>$${it.price}</button>
      </div>`;
    });
    this.$('shop-items').innerHTML = `
      <h3 class="shop-sec">Armas</h3>${guns.join('')}
      <h3 class="shop-sec">Munición</h3>${ammo.length ? ammo.join('') : '<p class="shop-empty">Compra un arma para poder comprarle balas. El subfusil tiene balas infinitas.</p>'}${noHeavy ? '' : this.heavyAmmoItem()}
      <h3 class="shop-sec">Defensas, granadas y molotovs</h3>${gear.join('')}
      <h3 class="shop-sec">Robot de combate</h3>${this.robotShopItem()}`;
    this.$('shop-items')
      .querySelectorAll('canvas[data-ic]')
      .forEach((c) => this.drawShopIcon(c, c.dataset.ic));
    const rc = this.$('shop-items').querySelector('canvas[data-robot]');
    if (rc) {
      const g = rc.getContext('2d');
      const demo = new Robot();
      demo.x = 48 / 0.95;
      demo.y = 48 / 0.95;
      demo.angle = 0;
      demo.legAngle = 0;
      g.setTransform(0.95, 0, 0, 0.95, 0, 0);
      demo.draw(g, this.player, 0);
    }
    this.$('shop-items')
      .querySelectorAll('canvas[data-gun]')
      .forEach((c) => {
        const g = c.getContext('2d');
        g.setTransform(2.1, 0, 0, 2.1, 4, 48);
        g.shadowColor = 'rgba(230,224,210,0.85)';
        g.shadowBlur = 3;
        drawGunIcon(g, c.dataset.gun);
      });
  }

  heavyAmmoItem() {
    const buy = (n) => {
      const price = HEAVY.price * n;
      const poor = this.money < price;
      return `<button class="btn buy sm${poor ? ' poor' : ''}" data-heavy-ammo="${n}" ${poor ? 'disabled' : ''}>+${HEAVY.pack * n} · $${price}</button>`;
    };
    return `<div class="shop-item">
      <canvas class="shop-ic" data-ic="heavy" width="96" height="96"></canvas>
      <div class="shop-txt"><b>Balas · Torreta pesada</b><span>Cinta de ${HEAVY.pack} balas perforantes por $${HEAVY.price}. Las usa cualquier torreta pesada que montes.</span><small>Tienes: ${this.player.heavyAmmo} balas</small></div>
      <div class="buy-col">${buy(1)}${buy(5)}</div>
    </div>`;
  }

  robotShopItem() {
    if (this.coop.isGuest) return '<p class="shop-empty">En cooperativo el robot es del anfitrión.</p>';
    const rb = this.robot;
    let btn;
    let info;
    if (!rb.owned) {
      const poor = this.money < ROBOT.price;
      btn = `<button class="btn buy${poor ? ' poor' : ''}" data-robot-act="buy" ${poor ? 'disabled' : ''}>$${ROBOT.price}</button>`;
      info = `Vida ${ROBOT.hp} · se repara aquí`;
    } else {
      const cost = rb.repairCost;
      const poor = this.money < cost;
      btn =
        cost > 0
          ? `<button class="btn buy${poor ? ' poor' : ''}" data-robot-act="repair" ${poor ? 'disabled' : ''}>Reparar $${cost}</button>`
          : '<button class="btn buy" disabled>Listo</button>';
      info = rb.broken ? 'DESTRUIDO: repáralo para volver a usarlo' : `Vida ${Math.ceil(rb.hp)} / ${ROBOT.hp}`;
    }
    return `<div class="shop-item hot">
      <canvas class="shop-ic" data-robot width="96" height="96"></canvas>
      <div class="shop-txt"><b>Robot de combate</b><span>Del doble de tamaño de un gordo. Súbete (E) y camina entre la horda con tu arma en su brazo. No se cura solo: repáralo después de cada oleada.</span><small>${info}</small></div>
      ${btn}
    </div>`;
  }

  buyWeapon(id) {
    const d = WEAPONS[id];
    const p = this.player;
    if (!d || !d.price || p.has(id) || this.money < d.price) return;
    if (this.online.active) return this.online.buy('gun', id);
    this.money -= d.price;
    p.unlock(id);
    this.sfx.buy();
    this.toast(`${d.name} comprada`);
    this.renderShop();
  }

  sellWeapon(id) {
    const p = this.player;
    const d = WEAPONS[id];
    if (!d || !d.price) return;
    if (this.online.active) return p.has(id) && this.online.buy('sell', id);
    if (!p.removeWeapon(id)) return;
    const gain = Math.round(d.price * SELL_RATE);
    this.money += gain;
    this.sfx.buy();
    this.toast(`${d.name} vendida: +$${gain}`);
    this.renderShop();
  }

  buyAmmo(id, n) {
    const p = this.player;
    const w = p.weapons.find((x) => x.id === id);
    if (!w || w.reserve === Infinity) return;
    const cost = w.def.ammoPrice * n;
    if (this.money < cost) return;
    if (this.online.active) return this.online.buy('ammo', id, n);
    this.money -= cost;
    w.reserve += p.magSize(w.def) * n;
    this.sfx.buy();
    this.renderShop();
  }

  drawShopIcon(c, k) {
    const g = c.getContext('2d');
    g.setTransform(1.6, 0, 0, 1.6, 0, 0);
    if (k === 'molotov') {
      g.setTransform(0, -4.2, 4.2, 0, 48, 52);
      drawBottle(g, true);
      return;
    }
    if (k === 'grenade') {
      g.setTransform(4.5, 0, 0, 4.5, 0, 0);
      this.structures.drawGrenades.call({ grenades: [{ x: 10, y: 11, h: 0, rot: -0.6, t: 0, dur: 1 }] }, g);
      return;
    }
    if (k === 'heavy') {
      // el cañón sobresale del trípode: se centra todo el conjunto
      g.setTransform(1.15, 0, 0, 1.15, 33 - 1.15 * 20, 48 - 1.15 * 20);
      this.structures.drawBlocks.call(
        { blocks: [{ kind: k, x: 0, y: 0, w: 40, h: 40, hp: 1, max: 1, hitT: 0, ang: 0 }] },
        g,
        { x0: -1e4, y0: -1e4, x1: 1e4, y1: 1e4 },
      );
      return;
    }
    const def = SHOP[k];
    const w = def.w;
    const h = def.h;
    const s = Math.min(44 / w, 44 / h, 1);
    g.setTransform(1.6 * s, 0, 0, 1.6 * s, 1.6 * (30 - (w * s) / 2), 1.6 * (30 - (h * s) / 2));
    if (def.ground)
      this.structures.drawGround.call(
        { scorches: [], wires: [{ kind: k, x: 0, y: 0, w, h, hp: 1, max: 1, hitT: 0 }] },
        g,
        { x0: -1e4, y0: -1e4, x1: 1e4, y1: 1e4 },
      );
    else
      this.structures.drawBlocks.call({ blocks: [{ kind: k, x: 0, y: 0, w, h, hp: 1, max: 1, hitT: 0 }] }, g, {
        x0: -1e4,
        y0: -1e4,
        x1: 1e4,
        y1: 1e4,
      });
  }

  buy(k) {
    const it = SHOP[k];
    if (!it || this.money < it.price) return;
    if (this.online.active) return this.online.buy('item', k);
    this.money -= it.price;
    this.inv[k]++;
    if (!THROWABLES.includes(k) && this.inv[this.buildSel] <= 0) this.buildSel = k;
    this.sfx.buy();
    this.renderShop();
  }

  tryBuild() {
    if (this.coop.isGuest) return this.coop.guestBuild();
    if (this.inv[this.buildSel] <= 0) {
      const next = BUILD_ORDER.find((k) => this.inv[k] > 0);
      if (!next) {
        this.toast('Compra barricadas en la tienda');
        return;
      }
      this.buildSel = next;
    }
    // en línea lo coloca el servidor (y descuenta la pieza); aquí sólo se avisa si no cabe
    if (this.online.active) {
      if (this.structures.placement(this, this.buildSel).ok) this.online.act('build', { kind: this.buildSel });
      else this.toast('No cabe ahí');
      return;
    }
    if (this.structures.place(this, this.buildSel)) {
      this.inv[this.buildSel]--;
      this.sfx.build();
      if (this.inv[this.buildSel] <= 0) {
        const next = BUILD_ORDER.find((k) => this.inv[k] > 0);
        if (next) this.buildSel = next;
      }
    } else {
      this.toast('No cabe ahí');
    }
  }

  cycleBuild() {
    const owned = BUILD_ORDER.filter((k) => this.inv[k] > 0);
    if (!owned.length) return;
    const i = owned.indexOf(this.buildSel);
    this.buildSel = owned[(i + 1) % owned.length];
    this.toast(SHOP[this.buildSel].name);
  }

  tryGrenade(kind = 'grenade') {
    if (this.coop.isGuest) return this.coop.guestThrow(kind);
    if (this.inv[kind] <= 0) {
      this.toast(kind === 'molotov' ? 'Sin molotovs: cómpralos en la tienda' : 'Sin granadas: cómpralas en la tienda');
      return;
    }
    const p = this.player;
    let tx;
    let ty;
    if (this.input.mode === 'mouse') {
      const m = this.mouseWorld();
      tx = m.x;
      ty = m.y;
    } else if (p.target && !p.target.dead) {
      tx = p.target.x;
      ty = p.target.y;
    } else {
      tx = p.x + Math.cos(p.angle) * 220;
      ty = p.y + Math.sin(p.angle) * 220;
    }
    this.inv[kind]--;
    // en línea la lanza el servidor; la cuenta se corrige con su siguiente foto
    if (this.online.active) return this.online.act('throw', { kind, tx: Math.round(tx), ty: Math.round(ty) });
    if (kind === 'molotov') this.structures.throwMolotov(this, tx, ty);
    else this.structures.throwGrenade(this, tx, ty);
  }

  /* ---------- fin de partida ---------- */

  gameOver() {
    if (this.coop.isHost) this.coop.send({ t: 'over' });
    this.setState('over');
    const p = this.player;
    const total = this.totalKills();
    const acc = p.shotsFired ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0;
    const rows = [
      ['Tiempo sobrevivido', fmtTime(this.time)],
      ['Oleada alcanzada', this.director.wave],
      ['Nivel', this.level],
      ['sep'],
      ['Zombis eliminados', total],
      ['Normales', this.kills.normal],
      ['Policías SWAT', this.kills.swat],
      ['Velocistas', this.kills.sprinter],
      ['Gordos', this.kills.fat],
      ['Dorados', this.kills.golden || 0],
      ['Super blindados', this.kills.heavy],
      ['Toros', this.kills.bull || 0],
      ['sep'],
      ['Precisión', `${acc}%`],
      ['Daño recibido', Math.round(p.damageTaken)],
      ['Dinero ganado', `$${this.moneyEarned}`],
    ];
    const dl = this.$('results');
    dl.innerHTML = '';
    for (const [k, v] of rows) {
      if (k === 'sep') {
        const s = document.createElement('div');
        s.className = 'sep';
        dl.appendChild(s);
        continue;
      }
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
    const best = storage.get('dz-best', null);
    const record = !best || this.time > best.time;
    if (record) storage.set('dz-best', { time: this.time, kills: total, wave: this.director.wave });
    this.$('over-best').textContent = record
      ? 'Nuevo récord personal'
      : `Récord: ${fmtTime(best.time)} · ${best.kills} bajas`;
  }

  /* ---------- interfaz ---------- */

  bindUi() {
    const on = (id, fn) => this.$(id).addEventListener('click', fn);
    on('btn-start', () => {
      this.tryFullscreen();
      this.showClass(false);
    });
    on('btn-ability', () => {
      if (this.state === 'play') this.useAbility();
    });
    on('btn-class-back', () => this.setupMenu());
    on('btn-pause', () => this.pause());
    on('btn-resume', () => this.resume());
    // en cooperativo reinicia el anfitrión (el invitado espera)
    const again = () => {
      if (this.online.active) return this.toast('En línea la partida sigue mientras quede alguien vivo');
      if (this.coop.isHost) return this.coop.restart();
      if (this.coop.isGuest) return this.toast('Espera a que el anfitrión reinicie la partida');
      // venías del cooperativo: al menú, donde sigue tu partida normal
      if (this.coopRun) {
        this.newWorld();
        return this.setupMenu();
      }
      this.showClass(true);
    };
    on('btn-restart', again);
    on('btn-again', again);
    on('btn-continue', () => {
      this.tryFullscreen();
      if (!this.loadProgress()) this.start(false);
    });
    on('btn-menu', () => {
      this.coop.leave();
      this.online.leave();
      this.newWorld();
      this.setupMenu();
    });
    on('btn-over-menu', () => {
      this.coop.leave();
      this.online.leave();
      this.newWorld();
      this.setupMenu();
    });
    on('btn-sound', () => {
      this.sfx.setMuted(!this.sfx.muted);
      this.syncSoundLabel();
    });
    this.syncSoundLabel();
    on('btn-shop-done', () => this.closeShop());
    on('btn-account', () => this.showAccount());
    on('btn-look', () => this.showLook());
    on('btn-look-done', () => this.setState('menu'));
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    on('btn-look-random', () =>
      this.setLook({ ...Object.fromEntries(LOOK_PARTS.map((q) => [q.id, pick(q.colors)])), hat: pick(HATS).id }),
    );
    on('btn-look-reset', () => this.setLook(DEFAULT_LOOK));
    on('btn-leaderboard', () => this.showBoard());
    on('btn-coop', () => this.showCoop());
    on('btn-online', () => this.showOnline());
    on('btn-ol-create', () => this.onlineCreate());
    on('btn-ol-back', () => {
      this.online.leave();
      this.setupMenu();
    });
    on('btn-ol-ready', () => {
      const me = this.online.me;
      if (me) this.online.send('ready', { v: !me.ready });
    });
    on('btn-ol-start', () => this.online.send('start'));
    on('btn-ol-lobby', () => this.online.send('lobby'));
    on('btn-ol-copy', () => this.copyInvite());
    this.$('ol-join-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.onlineJoin();
    });
    // tocar el indicador de conexión abre el panel de diagnóstico (también con F3)
    this.$('net-stat').addEventListener('click', () => this.toggleDiag());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3' && this.online.active) {
        e.preventDefault();
        this.toggleDiag();
      }
    });
    on('btn-coop-create', () => this.coopCreate());
    on('btn-coop-back', () => {
      this.coop.cancel();
      this.setupMenu();
    });
    this.$('coop-join-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.coopJoin();
    });
    on('btn-board-back', () => this.setupMenu());
    on('board-tab-local', () => {
      this.boardTab = 'local';
      this.showBoard();
    });
    on('board-tab-global', () => {
      this.boardTab = 'global';
      this.showBoard();
    });
    on('hall-tab-local', () => {
      this.boardTab = 'local';
      this.refreshHall();
    });
    on('hall-tab-global', () => {
      this.boardTab = 'global';
      this.refreshHall();
    });
    on('btn-acct-back', () => {
      if (this.accounts.current) this.setupMenu();
    });
    this.$('acct-form').addEventListener('submit', (e) => this.submitAccount(e));
    on('btn-next-round', () => this.startNextRound());
    on('btn-upgrade', () => {
      if (this.state === 'play' && this.online.upReady) this.openLevelUp();
    });
    on('btn-round-shop', () => {
      if (this.state === 'play' && this.director.state === 'waiting') this.openShop();
    });
    this.$('shop-items').addEventListener('click', (e) => {
      const sell = closest(e.target, '[data-sell]');
      if (sell) return this.sellWeapon(sell.dataset.sell);
      const g = closest(e.target, '[data-gun-buy]');
      if (g) return this.buyWeapon(g.dataset.gunBuy);
      const a = closest(e.target, '[data-ammo]');
      if (a) return this.buyAmmo(a.dataset.ammo, Number(a.dataset.n));
      const hva = closest(e.target, '[data-heavy-ammo]');
      if (hva) return this.buyHeavyAmmo(Number(hva.dataset.heavyAmmo));
      const rbt = closest(e.target, '[data-robot-act]');
      if (rbt) return rbt.dataset.robotAct === 'buy' ? this.buyRobot() : this.repairRobot();
      const b = closest(e.target, '[data-buy]');
      if (b) this.buy(b.dataset.buy);
    });
    this.$('inv').addEventListener('pointerdown', (e) => {
      const b = closest(e.target, '[data-k]');
      if (!b) return;
      e.preventDefault();
      this.buildSel = b.dataset.k;
    });
    this.$('slots').addEventListener('pointerdown', (e) => {
      const b = closest(e.target, '.slot[data-i]');
      if (!b) return;
      e.preventDefault();
      this.player.select(Number(b.dataset.i));
    });
  }

  syncSoundLabel() {
    this.$('btn-sound').textContent = `Sonido: ${this.sfx.muted ? 'desactivado' : 'activado'}`;
  }

  tryFullscreen() {
    if (this.input.mode !== 'touch') return;
    const el = document.documentElement;
    try {
      const r = el.requestFullscreen && el.requestFullscreen({ navigationUI: 'hide' });
      if (r && r.catch) r.catch(() => {});
    } catch {
      /* Safari en iPhone no admite pantalla completa para páginas */
    }
  }

  toast(msg) {
    const el = this.$('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => el.classList.remove('show'), 1500);
  }

  banner(title, sub) {
    this.$('banner-title').textContent = title;
    this.$('banner-sub').textContent = sub || '';
    const el = this.$('banner');
    el.classList.add('show');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => el.classList.remove('show'), 2600);
  }

  set(key, el, prop, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    if (prop === 'text') el.textContent = value;
    else el.style[prop] = value;
  }

  updateHud(force) {
    if (force) this.cache = {};
    const p = this.player;
    const $ = this.$;
    this.set('hpw', $('hp-fill'), 'transform', `scaleX(${(p.hp / p.stats.maxHp).toFixed(3)})`);
    this.set('hpv', $('hp-val'), 'text', String(Math.ceil(p.hp)));
    const low = p.hp < p.stats.maxHp * 0.3;
    if (this.cache.low !== low) {
      this.cache.low = low;
      $('hp-bar').classList.toggle('low', low);
    }
    const rb = this.robot;
    if (this.cache.rbOwned !== rb.owned) {
      this.cache.rbOwned = rb.owned;
      $('rb-bar').hidden = !rb.owned;
    }
    // el botón táctil también monta y desmonta la torreta pesada
    const heavy = p.manned ? null : this.structures.nearHeavy(p);
    const rbBtn = rb.owned || !!p.manned || !!heavy;
    if (this.cache.rbBtn !== rbBtn) {
      this.cache.rbBtn = rbBtn;
      $('btn-robot').classList.toggle('gone', !rbBtn);
    }
    if (rb.owned) {
      this.set('rbw', $('rb-fill'), 'transform', `scaleX(${Math.max(0, rb.hp / ROBOT.hp).toFixed(3)})`);
      this.set('rbv', $('rb-val'), 'text', rb.broken ? 'ROTO' : String(Math.ceil(rb.hp)));
    }
    this.set('rbon', $('btn-robot'), 'text', rb.piloted || p.manned ? 'Bajar' : heavy ? 'Torreta' : 'Robot');
    // habilidad de clase: icono, segundos que faltan y arco de espera en el botón táctil
    const cls = p.cls;
    if (this.cache.cls !== cls) {
      this.cache.cls = cls;
      $('btn-ability').hidden = !cls;
      $('btn-ab-touch').classList.toggle('gone', !cls);
      if (cls) {
        $('ab-ic').innerHTML = CLASSES[cls].icon;
        $('btn-ab-touch').innerHTML = CLASSES[cls].icon;
        $('ab-nm').textContent = CLASSES[cls].name;
      }
    }
    if (cls) {
      const ready = !(p.abCd > 0) && p.alive;
      this.set('abcd', $('ab-cd'), 'text', p.abCd > 0 ? `${Math.ceil(p.abCd)} s` : 'Lista');
      if (this.cache.abReady !== ready) {
        this.cache.abReady = ready;
        $('btn-ability').classList.toggle('ready', ready);
        $('btn-ab-touch').classList.toggle('ready', ready);
      }
      const k = ready ? '1' : (1 - (p.abCd || 0) / cooldownOf(p)).toFixed(2);
      if (this.cache.abk !== k) {
        this.cache.abk = k;
        $('btn-ab-touch').style.setProperty('--k', k);
        $('btn-ability').style.setProperty('--k', k);
      }
    }
    this.set('stw', $('st-fill'), 'transform', `scaleX(${(p.stamina / p.stats.maxStamina).toFixed(3)})`);
    if (this.cache.ex !== p.exhausted) {
      this.cache.ex = p.exhausted;
      $('st-bar').classList.toggle('exhausted', p.exhausted);
      if (p.exhausted) this.input.setRun(false);
    }
    this.set('xpw', $('xp-fill'), 'width', `${((this.xp / this.xpNeed) * 100).toFixed(1)}%`);
    this.set('lvl', $('lvl'), 'text', String(this.level));
    this.set('time', $('time'), 'text', fmtTime(this.time));
    this.set('kills', $('kills'), 'text', String(this.totalKills()));
    this.set('wave', $('wave'), 'text', String(Math.max(1, this.director.wave)));
    // montado en la torreta pesada se ven sus balas
    const w = p.manned ? { def: WEAPONS.heavy, mag: p.heavyAmmo, reserve: 0 } : p.weapon;
    this.set('wname', $('wname'), 'text', w.def.name);
    this.set('mag', $('mag'), 'text', String(w.mag));
    this.set('res', $('reserve'), 'text', w.reserve === Infinity ? '∞' : String(w.reserve));
    const empty = w.mag === 0;
    if (this.cache.empty !== empty) {
      this.cache.empty = empty;
      $('mag').parentElement.classList.toggle('empty', empty);
    }
    const rl = p.reloadT > 0 ? 1 - p.reloadT / p.reloadDur : 0;
    this.set('rl', $('reload-fill'), 'width', `${(rl * 100).toFixed(0)}%`);
    const inv = this.inv;
    const isig =
      BUILD_ORDER.map((k) => inv[k]).join() +
      '|' +
      inv.grenade +
      '|' +
      inv.molotov +
      '|' +
      this.buildSel +
      '|' +
      this.money;
    if (this.cache.inv !== isig) {
      this.cache.inv = isig;
      // granadas siempre visibles; de las estructuras sólo las que tienes (son muchas)
      const items = [
        `<span class="it gren${inv.grenade ? '' : ' zero'}" title="Granadas">${ITEM_ICONS.grenade}<b>${inv.grenade}</b></span>`,
        `<span class="it gren${inv.molotov ? '' : ' zero'}" title="Molotovs">${ITEM_ICONS.molotov}<b>${inv.molotov}</b></span>`,
      ];
      for (const k of BUILD_ORDER) {
        if (!inv[k]) continue;
        const cls = `it${k === this.buildSel ? ' on' : ''}`;
        items.push(
          `<button class="${cls}" data-k="${k}" title="${SHOP[k].name}">${ITEM_ICONS[k]}<b>${inv[k]}</b></button>`,
        );
      }
      items.push(`<span class="it money" title="Dinero">$<b id="money">${this.money}</b></span>`);
      $('inv').innerHTML = items.join('');
      $('build-count').textContent = inv[this.buildSel] > 0 ? inv[this.buildSel] : '0';
      $('btn-build').classList.toggle('off', !BUILD_ORDER.some((k) => inv[k] > 0));
      $('gren-count').textContent = inv.grenade;
      $('btn-grenade').classList.toggle('off', inv.grenade <= 0);
      $('molo-count').textContent = inv.molotov;
      $('btn-molotov').classList.toggle('off', inv.molotov <= 0);
    }
    const sig = p.manned ? 'heavy' : p.weapons.map((x) => x.id).join() + '|' + p.wi;
    if (this.cache.slots !== sig) {
      this.cache.slots = sig;
      $('slots').innerHTML = p.manned
        ? `<button class="slot on">${WEAPONS.heavy.name}</button>`
        : p.weapons
            .map(
              (x, i) =>
                `<button class="slot${i === p.wi ? ' on' : ''}" data-i="${i}">${i + 1} ${i === p.wi ? x.def.name : SHORT[x.id]}</button>`,
            )
            .join('');
    }
    const prep = this.director.state === 'waiting' && p.alive;
    if (this.cache.prep !== prep) {
      this.cache.prep = prep;
      $('round-panel').classList.toggle('show', prep);
      if (prep) $('round-kicker').textContent = `Ronda ${this.director.wave} superada`;
    }
  }

  /* ---------- bucle ---------- */

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // calidad automática: en celulares lentos se dibuja con menos píxeles (ver adaptQuality)
    this.dpr = Math.max(0.6, Math.min(window.devicePixelRatio || 1, 2) * (this.quality || 1));
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.cssW = w;
    this.cssH = h;
    const cam = this.camera;
    cam.zoom = clamp(Math.sqrt(w * h) / 680, 0.86, 1.5);
    cam.viewW = w / cam.zoom;
    cam.viewH = h / cam.zoom;
    this.lighting.resize(this.canvas.width, this.canvas.height);
    this.lighting.vignette = this.makeVignette('0,0,0', 0.62);
    this.chunkScale = cam.zoom * this.dpr;
    this.maxChunks = (Math.ceil(cam.viewW / 512) + 2) * (Math.ceil(cam.viewH / 512) + 2) + 2;
    if (this.world) {
      this.world.setChunkScale(this.chunkScale);
      this.world.maxChunks = this.maxChunks;
    }
    this.redVignette = this.makeVignette('150,20,15', 0.85);
  }

  // Si el juego va lento (pocos FPS) baja la resolución de dibujo un paso; si va sobrado, la sube.
  adaptQuality(dt) {
    if (this.state !== 'play') return;
    const q = (this.qStat = this.qStat || { t: 0, n: 0, good: 0 });
    q.t += dt;
    q.n++;
    if (q.t < 2) return;
    const fps = q.n / q.t;
    q.t = 0;
    q.n = 0;
    const steps = [1, 0.85, 0.7, 0.55];
    const i = Math.max(0, steps.indexOf(this.quality || 1));
    if (fps < 40 && i < steps.length - 1) {
      // muy lento: baja dos pasos de golpe
      this.quality = steps[Math.min(steps.length - 1, i + (fps < 25 ? 2 : 1))];
      q.good = 0;
      this.resize();
    } else if (fps > 57 && i > 0) {
      // sólo vuelve a subir tras un buen rato fluido, para no estar cambiando
      if (++q.good >= 5) {
        this.quality = steps[i - 1];
        q.good = 0;
        this.resize();
      }
    } else q.good = 0;
  }

  makeVignette(rgb, a) {
    const W = Math.max(2, Math.round(this.canvas.width / 4));
    const H = Math.max(2, Math.round(this.canvas.height / 4));
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

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    try {
      this.adaptQuality(dt);
      this.coop.tick(dt);
      this.online.tick(dt);
      // indicador de conexión del cooperativo (se actualiza una vez por segundo)
      const ns = this.$('net-stat');
      if ((this.coop.active || this.online.active) && this.state !== 'menu') {
        const txt = this.online.active ? this.online.stats(dt) : this.coop.stats(dt);
        if (txt) ns.textContent = txt;
        ns.hidden = false;
      } else ns.hidden = true;
      // en línea el mundo sigue aunque haya otra pantalla encima (mejoras, tienda, pausa)
      if (this.online.active) this.online.update(dt);
      else if (this.state === 'play') {
        if (this.coop.isGuest) this.coop.guestUpdate(dt);
        else this.update(dt);
      }
      if (this.state === 'menu') this.updateMenu(dt);
      else if (this.state === 'look') {
        this.updateMenu(dt);
        this.drawLookPreview(dt);
      } else if (this.state === 'class') {
        const s = this.input.consume('slot');
        if (s) this.chooseClass(CLASS_ORDER[s - 1]);
        this.updateMenu(dt);
      } else if (this.state === 'levelup') {
        const s = this.input.consume('slot');
        if (s) this.chooseUpgrade(s - 1);
      } else if (this.state === 'pause') {
        if (this.input.consume('pause')) this.resume();
      }
      this.render();
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  updateMenu(dt) {
    this.time += dt;
    this.menuT += dt;
    const { x, y } = this.world.spawn;
    this.horde.update(dt, this);
    this.particles.update(dt);
    this.emitFires(dt);
    this.camera.update(dt, x + Math.cos(this.menuT * 0.12) * 140, y + Math.sin(this.menuT * 0.12) * 90, false);
    this.input.consume('pause');
  }

  emitFires(dt) {
    const v = this.view;
    for (const f of this.world.fires) {
      if (f.x < v.x0 - 80 || f.x > v.x1 + 80 || f.y < v.y0 - 80 || f.y > v.y1 + 80) continue;
      if (Math.random() < dt * 16 * f.s) this.particles.ember(f.x, f.y, f.s);
    }
  }

  update(dt) {
    this.time += dt;
    const p = this.player;
    if (this.input.consume('pause')) {
      this.pause();
      return;
    }
    if (p.alive) {
      p.update(dt, this);
      if (this.input.consume('ability')) this.useAbility();
      Abilities.update(dt, this, p);
      if (this.input.consume('build')) this.tryBuild();
      if (this.input.consume('cycleBuild')) this.cycleBuild();
      if (this.input.consume('grenade')) this.tryGrenade();
      if (this.input.consume('molotov')) this.tryGrenade('molotov');
      if (this.input.consume('robot')) this.toggleRobot();
      this.robot.update(dt, p, this);
      if (this.input.consume('nextRound')) this.startNextRound();
    }
    this.structures.update(dt, this);
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.world.updateFlow(p.x, p.y);
      const peer = this.coop.isHost ? this.coop.peer : null;
      if (peer && peer.alive) this.world.computeField(this.world.main2, peer.x, peer.y);
      this.flowT = 0.2;
    }
    // un campo de flanqueo por fotograma (repartido): los zombis rodean por rutas reales
    if (p.alive) this.world.updateAnchors(p.x, p.y);
    this.director.update(dt, this);
    // zombi dorado: de vez en cuando durante una ronda, nunca dos a la vez
    if (this.director.state === 'active' && p.alive) {
      this.goldenT -= dt;
      if (this.goldenT <= 0) {
        const alive = this.horde.list.some((z) => z.type === 'golden' && !z.dead);
        if (!alive && this.spawnGolden()) this.goldenT = rand(GOLDEN.every[0], GOLDEN.every[1]);
        else this.goldenT = 5;
      }
    }
    this.horde.update(dt, this);
    this.bullets.update(dt, this);
    this.horde.removeDead();
    this.pickups.update(dt, this);
    this.particles.update(dt);
    this.decals.update(dt);
    this.emitFires(dt);
    // gemidos y pasos según cuántos zombis hay cerca (con tope para no saturar)
    const nc = this.horde.nearCount;
    if (this.horde.list.length && Math.random() < dt * (0.35 + Math.min(1.5, nc * 0.05)))
      this.sfx.groan(Math.min(3, 0.5 + nc / 10));
    this.stepT -= dt;
    if (nc > 0 && this.stepT <= 0) {
      this.sfx.footstep(Math.min(1, nc / 20));
      this.stepT = Math.max(0.12, 0.7 - nc * 0.03) * rand(0.7, 1.3);
    }
    this.music.setDanger(p.alive ? this.horde.danger : 0, dt);
    // muerto en cooperativo: la cámara sigue suave a tu compañero hasta que revivas
    if (!p.alive && this.coop.peer && this.coop.peer.alive)
      this.camera.update(dt, this.coop.peer.x, this.coop.peer.y, false);
    else {
      const look = this.input.mode === 'mouse' ? 50 : 24;
      this.camera.update(dt, p.x + Math.cos(p.angle) * look, p.y + Math.sin(p.angle) * look, false);
    }
    this.muzzle = Math.max(0, this.muzzle - dt * 14);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.4);
    this.updateAcid(dt);
    this.updateHud(false);
    if (!p.alive) {
      if (this.coop.active && this.coop.peer && this.coop.peer.alive) return;
      this.deathT -= dt;
      if (this.deathT <= 0) this.gameOver();
      return;
    }
    // en cooperativo las mejoras se eligen entre oleadas (el juego no se pausa para el otro)
    if (this.pendingLevels > 0 && (!this.coop.active || this.director.state === 'waiting')) this.openLevelUp();
    else if (this.shopPending) this.openShop();
    else {
      this.saveT = (this.saveT || 0) + dt;
      if (this.saveT > (this.director.state === 'active' ? 4 : 2)) this.saveProgress();
    }
  }

  render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cam = this.camera;
    const z = cam.zoom * this.dpr;
    const cx = cam.x + cam.sx;
    const cy = cam.y + cam.sy;
    const tx = Math.round(W / 2 - cx * z);
    const ty = Math.round(H / 2 - cy * z);
    const base = this.base;
    base.z = z;
    base.tx = tx;
    base.ty = ty;
    const v = this.view;
    v.x0 = -tx / z;
    v.y0 = -ty / z;
    v.x1 = (W - tx) / z;
    v.y1 = (H - ty) / z;
    const p = this.player;
    const playing = this.state !== 'menu' && this.state !== 'class';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0c0e0b';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(z, 0, 0, z, tx, ty);
    this.world.drawGround(ctx, v.x0, v.y0, v.x1, v.y1);
    this.structures.drawGround(ctx, v);
    this.decals.drawPools(ctx, v);
    this.decals.draw(ctx, v);
    this.structures.drawBlocks(ctx, v);
    this.pickups.draw(ctx, v, this.time);
    if (this.state === 'play' && p.alive && this.inv[this.buildSel] > 0)
      this.structures.drawGhost(ctx, this, this.buildSel, this.time);
    this.horde.draw(ctx, v, base, 'small');
    this.structures.drawFires(ctx, v, this.time);
    this.structures.drawStuck(ctx, this.time);
    this.structures.drawMissiles(ctx, this.time);
    if (playing && this.robot.owned && !this.robot.piloted) this.robot.draw(ctx, p, this.time);
    if (playing) {
      if (!p.alive) ctx.globalAlpha = 0.55;
      if (p.inRobot) this.robot.draw(ctx, p, this.time);
      else drawSurvivor(ctx, p, this.time);
      ctx.globalAlpha = 1;
      this.coop.drawPeer(ctx);
      this.online.drawPeers(ctx);
      this.structures.drawMannedHeavy(ctx);
    }
    this.horde.draw(ctx, v, base, 'giant');
    this.bullets.draw(ctx);
    this.coop.drawRemoteBullets(ctx);
    this.online.drawRemoteBullets(ctx);
    this.structures.drawGrenades(ctx);
    this.world.drawOverhead(ctx, v.x0, v.y0, v.x1, v.y1, playing ? p : { x: -1e4, y: -1e4 }, this.time);
    this.particles.draw(ctx, v);

    this.lighting.render(this, base, v);
    this.lighting.composite(ctx, this, base, v, W, H);

    ctx.setTransform(z, 0, 0, z, tx, ty);
    if (playing) this.drawWorldUi(ctx);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawAsh(ctx, W, H);
    if (playing) {
      const lowHp = p.alive && p.hp < p.stats.maxHp * 0.3 ? (Math.sin(this.time * 6) * 0.5 + 0.5) * 0.35 : 0;
      const a = Math.max(this.hurtFlash * 0.8, lowHp, p.alive ? 0 : 0.6);
      if (a > 0.01) {
        ctx.globalAlpha = a;
        ctx.drawImage(this.redVignette, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }
      this.drawAcid(ctx, W, H);
      if (this.state === 'play') {
        this.drawGiantMarkers(ctx, W, H);
        if (this.input.mode === 'mouse' && p.alive) this.drawCrosshair(ctx);
      }
    }
  }

  drawWorldUi(ctx) {
    const v = this.view;
    this.structures.drawBars(ctx, v);
    for (const zb of this.horde.list) {
      if (zb.type === 'normal' || zb.type === 'sprinter' || zb.hp >= zb.maxHp) continue;
      if (zb.x < v.x0 || zb.x > v.x1 || zb.y < v.y0 || zb.y > v.y1) continue;
      const w = zb.r * 1.6;
      const y = zb.y - zb.r - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(zb.x - w / 2 - 1, y - 1, w + 2, 5);
      ctx.fillStyle = zb.type === 'giant' ? '#d9783a' : '#b5463a';
      ctx.fillRect(zb.x - w / 2, y, w * Math.max(0, zb.hp / zb.maxHp), 3);
    }
    const p = this.player;
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
    if (tg && !tg.dead && this.input.mode === 'touch') {
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

  drawAsh(ctx, W, H) {
    const cam = this.camera;
    const ox = (cam.x * 0.25) / this.cssW;
    const oy = (cam.y * 0.25) / this.cssH;
    ctx.fillStyle = 'rgba(200,195,180,0.32)';
    for (const a of this.ash) {
      a.y += a.v * 0.016;
      a.x += Math.sin(this.time * 0.6 + a.p) * 0.0004;
      if (a.y > 1) a.y -= 1;
      const x = ((((a.x - ox) % 1) + 1) % 1) * W;
      const y = ((((a.y - oy) % 1) + 1) % 1) * H;
      const s = a.s * this.dpr;
      ctx.fillRect(x, y, s, s);
    }
  }

  drawGiantMarkers(ctx, W, H) {
    const b = this.base;
    const m = 34 * this.dpr;
    const few = !this.director.queue.length && this.horde.list.length <= 5;
    for (const zb of this.horde.list) {
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
      const s = 12 * this.dpr;
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

  drawCrosshair(ctx) {
    const m = this.input.mouse;
    const x = m.x * this.dpr;
    const y = m.y * this.dpr;
    const p = this.player;
    const gap = (6 + (p.bloom + p.weapon.def.spread) * 60) * this.dpr;
    const len = 7 * this.dpr;
    ctx.lineWidth = 2 * this.dpr;
    /** @type {[string, number][]} */
    const rings = [
      ['rgba(0,0,0,0.6)', 4],
      ['#e6e0d2', 2],
    ];
    for (const [col, lw] of rings) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw * this.dpr;
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
      ctx.lineWidth = 2 * this.dpr;
      ctx.beginPath();
      ctx.arc(x, y, gap + len + 4 * this.dpr, -Math.PI / 2, -Math.PI / 2 + (1 - p.reloadT / p.reloadDur) * TAU);
      ctx.stroke();
    }
  }
}

function boot() {
  try {
    const game = new Game();
    const ver = document.getElementById('ver');
    if (ver) ver.textContent = 'Versión ' + VERSION;
    // si se publicó una versión nueva mientras la pestaña seguía abierta, se avisa
    hayVersionNueva().then((nueva) => {
      if (nueva) game.toast('Hay una versión nueva: recarga la página');
    });
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML(
      'beforeend',
      `<p style="position:fixed;inset:auto 16px 16px;color:#e6e0d2;font:16px sans-serif">No se pudo iniciar el juego: ${String(err.message || err)}</p>`,
    );
  }
}

if (document.fonts && document.fonts.ready) {
  // esperar a la fuente evita textos con tipografía de respaldo en los techos
  Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(boot);
} else boot();

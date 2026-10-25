// DEAD ZONE — punto de entrada. Une todos los módulos y gestiona el bucle.
import { drawRobot } from './render/robot.js';
import { xpForLevel, BUILD_ORDER, THROWABLES, GOLDEN, CLASS_ORDER } from './core/config.js';
import { Abilities, isClass } from './sim/abilities.js';
import { Music } from './ui/music.js';
import { Robot } from './sim/robot.js';
import { Coop } from './net/coop.js';
import { Online } from './net/online.js';
import { VERSION, hayVersionNueva } from './core/version.js';
import { Accounts } from './ui/accounts.js';
import { Structures } from './sim/build.js';
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
} from './render/build.js';
import { clamp, rand, makeCanvas, storage, TAU } from './core/util.js';
import { World } from './sim/world.js';
import { Player } from './sim/player.js';
import { Horde } from './sim/zombies.js';
import { Bullets } from './sim/bullets.js';
import { Particles, Decals } from './render/particles.js';
import { Pickups } from './sim/pickups.js';
import { drawPickups } from './render/pickups.js';
import { drawBullets } from './render/bullets.js';
import { drawHorde } from './render/zombies.js';
import { setChunkView, drawGround as drawWorldGround, drawOverhead } from './render/world.js';
import { Director } from './sim/director.js';
import { Lighting } from './render/lighting.js';
import { Camera } from './render/camera.js';
import { saveProgress, loadProgress } from './save.js';
import * as Rules from './sim/rules.js';
import * as Ev from './events.js';
import * as Act from './actions.js';
import { setupMenu, start, bindMenu } from './ui/menu.js';
import { bindOver, gameOver } from './ui/over.js';
import { openLevelUp, chooseUpgrade } from './ui/levelup.js';
import { drawLookPreview, bindLook } from './ui/look.js';
import { chooseClass, renderClassRows, bindClass } from './ui/class.js';
import { showOnline, onlineStatus, renderLobby, openInvite, bindLobby } from './ui/lobby.js';
import { showAccount, bindAccount } from './ui/account.js';
import { refreshHall, bindBoard } from './ui/board.js';
import { openShop, closeShop, renderShop, bindShop } from './ui/shop.js';
import { toast, banner, updateHud, moneyPop, bindHud } from './ui/hud.js';
import { Input } from './ui/input.js';
import { Sfx } from './ui/audio.js';
import { drawSurvivor, cleanLook } from './render/sprites.js';

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
    // quemadura de ácido (ver events.js)
    this.acidT = 0;
    this.acidTick = 0;
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
    if (!this.accounts.current) showAccount(this);
    // como Artifact de Claude: progreso en la nube y clasificación global
    // clasificación mundial: sube tu mejor marca al abrir el juego (por si antes no hubo conexión)
    if (this.accounts.current) this.accounts.pushOnline(this.accounts.current);
    this.accounts.initCloud().then(async (ok) => {
      if (!ok) return;
      if (this.state === 'account') this.$('acct-cloud').hidden = false;
      const cur = this.accounts.current;
      if (cur && cur.best) await this.accounts.pushScore(cur);
      if (cur && (await this.accounts.cloudPull()) && this.state === 'menu') this.setupMenu();
      else if (this.state === 'menu') refreshHall(this);
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
    if (this.accounts.current) openInvite(this);
  }

  // Eventos de combate que llaman los módulos de simulación y de red (ver events.js).
  hitZombie = (z, b, hx, hy) => Ev.hitZombie(this, z, b, hx, hy);
  killZombie = (z) => Ev.killZombie(this, z);
  rocketHit = (z, x, y, b) => Ev.rocketHit(this, z, x, y, b);
  rocketBlast = (x, y, owner) => Ev.rocketBlast(this, x, y, owner);
  onSuperPunch = (z, x, y) => Ev.onSuperPunch(this, z, x, y);
  applyAcid = () => Ev.applyAcid(this);
  onGoldenExpired = (z) => Ev.onGoldenExpired(this, z);
  onZombieHit = (z, target) => Ev.onZombieHit(this, z, target);
  onGiantStep = (z) => Ev.onGiantStep(this, z);
  onPlayerDeath = () => Ev.onPlayerDeath(this);
  onWaveCleared = () => Ev.onWaveCleared(this);
  onRobotHit = (dmg) => Ev.onRobotHit(this, dmg);
  spawnFocus = () => Ev.spawnFocus(this);
  totalKills = () => Ev.totalKills(this);
  recordScore = () => Ev.recordScore(this);
  addXp = (n) => Ev.addXp(this, n);
  setAcid = (t) => Ev.setAcid(this, t);
  updateAcid = (dt) => this.updateAcid(dt);

  // Accesos que usan los demás módulos y las pruebas e2e: cada uno delega en su módulo.
  saveProgress = () => saveProgress(this);
  loadProgress = (kind) => loadProgress(this, kind);
  showOnline = (keepStatus) => showOnline(this, keepStatus);
  onlineStatus = (text, bad) => onlineStatus(this, text, bad);
  renderLobby = () => renderLobby(this);
  renderClassRows = () => renderClassRows(this);
  openLevelUp = () => openLevelUp(this);
  setupMenu = () => setupMenu(this);
  start = (freshWorld) => start(this, freshWorld);
  gameOver = () => gameOver(this);
  mouseWorld = () => Act.mouseWorld(this);
  useAbility = () => Act.useAbility(this);
  tryBuild = () => Act.tryBuild(this);
  cycleBuild = () => Act.cycleBuild(this);
  toggleRobot = () => Act.toggleRobot(this);
  tryGrenade = (kind) => Act.tryGrenade(this, kind);
  startNextRound = () => Act.startNextRound(this);
  openShop = () => openShop(this);
  closeShop = () => closeShop(this);
  renderShop = () => renderShop(this);
  toast = (msg) => toast(this, msg);
  banner = (title, sub) => banner(this, title, sub);
  updateHud = (force) => updateHud(this, force);
  moneyPop = (text, kind) => moneyPop(this, text, kind);

  // ¿Simula otro (el anfitrión del cooperativo o el servidor en línea)? Entonces aquí no se
  // calcula daño: las balas propias son de adorno.
  get remoteSim() {
    return this.coop.isGuest || this.online.active;
  }

  /* ---------- partidas ---------- */

  newWorld(seed) {
    this.world = new World(seed);
    setChunkView(this.world, this.chunkScale, this.maxChunks);
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

  /* ---------- eventos de combate ---------- */

  /* ---------- habilidad de clase ---------- */

  /* ---------- robot ---------- */

  /* ---------- torreta pesada ---------- */

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

  /* ---------- mejoras ---------- */

  /* ---------- tienda y construcción ---------- */

  /* ---------- cooperativo: sala ---------- */

  /* ---------- en línea (servidor, hasta 4 por sala) ---------- */

  /* ---------- personaje ---------- */

  /* ---------- cuentas y clasificación ---------- */

  /* ---------- fin de partida ---------- */

  /* ---------- interfaz ---------- */

  bindUi() {
    bindHud(this);
    bindMenu(this);
    bindOver(this);
    bindShop(this);
    bindClass(this);
    bindLook(this);
    bindAccount(this);
    bindBoard(this);
    bindLobby(this);
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
      setChunkView(this.world, this.chunkScale, this.maxChunks);
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
        drawLookPreview(this, dt);
      } else if (this.state === 'class') {
        const s = this.input.consume('slot');
        if (s) chooseClass(this, CLASS_ORDER[s - 1]);
        this.updateMenu(dt);
      } else if (this.state === 'levelup') {
        const s = this.input.consume('slot');
        if (s) chooseUpgrade(this, s - 1);
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
      if (this.input.consume('ability')) Act.useAbility(this);
      Abilities.update(dt, this, p);
      if (this.input.consume('build')) Act.tryBuild(this);
      if (this.input.consume('cycleBuild')) Act.cycleBuild(this);
      if (this.input.consume('grenade')) Act.tryGrenade(this);
      if (this.input.consume('molotov')) Act.tryGrenade(this, 'molotov');
      if (this.input.consume('robot')) Act.toggleRobot(this);
      this.robot.update(dt, p, this);
      if (this.input.consume('nextRound')) Act.startNextRound(this);
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
      this.goldenT = Rules.goldenTick(this, this.goldenT, dt, this.toast);
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
    Ev.updateAcid(this, dt);
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
    drawWorldGround(ctx, this.world, v.x0, v.y0, v.x1, v.y1);
    drawGround(ctx, this.structures, v);
    this.decals.drawPools(ctx, v);
    this.decals.draw(ctx, v);
    drawBlocks(ctx, this.structures, v);
    drawPickups(ctx, this.pickups.list, v, this.time);
    if (this.state === 'play' && p.alive && this.inv[this.buildSel] > 0)
      drawGhost(ctx, this.structures, this, this.buildSel, this.time);
    drawHorde(ctx, this.horde.list, v, base, 'small');
    drawFires(ctx, this.structures, v, this.time);
    drawStuck(ctx, this.structures, this.time);
    drawMissiles(ctx, this.structures, this.time);
    if (playing && this.robot.owned && !this.robot.piloted) drawRobot(ctx, this.robot, p, this.time);
    if (playing) {
      if (!p.alive) ctx.globalAlpha = 0.55;
      if (p.inRobot) drawRobot(ctx, this.robot, p, this.time);
      else drawSurvivor(ctx, p, this.time);
      ctx.globalAlpha = 1;
      this.coop.drawPeer(ctx);
      this.online.drawPeers(ctx);
      drawMannedHeavy(ctx, this.structures);
    }
    drawHorde(ctx, this.horde.list, v, base, 'giant');
    drawBullets(ctx, this.bullets.list);
    this.coop.drawRemoteBullets(ctx);
    this.online.drawRemoteBullets(ctx);
    drawGrenades(ctx, this.structures);
    drawOverhead(ctx, this.world, v.x0, v.y0, v.x1, v.y1, playing ? p : { x: -1e4, y: -1e4 }, this.time);
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
    drawBars(ctx, this.structures, v);
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

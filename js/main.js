// DEAD ZONE — punto de entrada. Crea `Game`, que sólo coordina: guarda el estado de la partida, conecta
// los módulos (js/ui, js/render, js/sim, js/net) y corre el bucle. Cada pantalla conecta sus propios
// botones, y los estados del juego están en la tabla de js/states.js.
import { xpForLevel, BUILD_ORDER, THROWABLES, GOLDEN, CLASS_ORDER } from './core/config.ts';
import { isClass } from './sim/abilities.ts';
import { Music } from './ui/music.js';
import { Robot } from './sim/robot.ts';
import { Coop } from './net/coop.ts';
import { Online } from './net/online.ts';
import { Solo } from './net/mode.ts';
import { Remote } from './net/remote.ts';
import { VERSION, hayVersionNueva } from './core/version.ts';
import { Accounts } from './ui/accounts.js';
import { Structures } from './sim/build.ts';
import { rand, storage, TAU } from './core/util.ts';
import { World } from './sim/world.ts';
import { Player } from './sim/player.ts';
import { Horde } from './sim/zombies.ts';
import { Bullets } from './sim/bullets.ts';
import { Particles, Decals } from './render/particles.js';
import { Pickups } from './sim/pickups.ts';
import { setChunkView } from './render/world.js';
import { Director } from './sim/director.ts';
import { Lighting } from './render/lighting.js';
import { Camera } from './render/camera.js';
import { render, resize, adaptQuality } from './render/scene.js';
import { saveProgress, loadProgress } from './save.js';
import * as Ev from './events.js';
import * as Act from './actions.js';
import { setState, pause, resume, stepState, updatePlay, updateMenu, emitFires } from './states.js';
import { setupMenu, start, bindMenu } from './ui/menu.js';
import { bindOver, gameOver } from './ui/over.js';
import { openLevelUp } from './ui/levelup.js';
import { bindLook } from './ui/look.js';
import { renderClassRows, bindClass } from './ui/class.js';
import { showOnline, onlineStatus, renderLobby, openInvite, bindLobby } from './ui/lobby.js';
import { showAccount, bindAccount } from './ui/account.js';
import { refreshHall, bindBoard } from './ui/board.js';
import { openShop, closeShop, renderShop, bindShop } from './ui/shop.js';
import { toast, banner, updateHud, updateNetStat, moneyPop, bindHud } from './ui/hud.js';
import { Input } from './ui/input.js';
import { Sfx } from './ui/audio.js';
import { cleanLook } from './render/sprites.js';

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
    this.mode = new Solo(this);
    // lo que llega por la red (jugadores, zombis, balas de adorno) en el cooperativo y en línea
    this.remote = new Remote(this);
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
    // tamaño del lienzo y de los trozos del mundo (los calcula resize en render/scene.js)
    this.dpr = 1;
    this.chunkScale = 1;
    this.maxChunks = 0;
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
    resize(this);
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
    window.addEventListener('resize', () => resize(this));
    window.addEventListener('orientationchange', () => setTimeout(() => resize(this), 200));
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
  heavyBlast = (x, y, owner) => Ev.heavyBlast(this, x, y, owner);
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
  updateAcid = (dt) => Ev.updateAcid(this, dt);

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
  setState = (name) => setState(this, name);
  pause = () => pause(this);
  resume = () => resume(this);
  update = (dt) => updatePlay(this, dt);
  updateMenu = (dt) => updateMenu(this, dt);
  emitFires = (dt) => emitFires(this, dt);
  openShop = () => openShop(this);
  closeShop = () => closeShop(this);
  renderShop = () => renderShop(this);
  toast = (msg) => toast(this, msg);
  banner = (title, sub) => banner(this, title, sub);
  updateHud = (force) => updateHud(this, force);
  moneyPop = (text, kind) => moneyPop(this, text, kind);

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
    // una partida nueva siempre empieza en solitario (los modos de grupo lo cambian al arrancar)
    this.mode = new Solo(this);
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

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    try {
      adaptQuality(this, dt);
      this.coop.tick(dt);
      this.online.tick(dt);
      updateNetStat(this, dt);
      // en línea el mundo sigue aunque haya otra pantalla encima (mejoras, tienda, pausa)
      if (this.mode.viaServer()) this.online.update(dt);
      stepState(this, dt);
      render(this);
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame((t) => this.loop(t));
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

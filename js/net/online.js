// @ts-nocheck — pendiente de tipar (Etapa 3: checkJs ya cubre el resto de js/)
// Multijugador en línea (hasta NET.maxPlayers jugadores por sala) contra el servidor autoritativo (carpeta server/).
//
// El servidor simula todo; aquí sólo se manda lo que quiere hacer el jugador (dirección,
// correr, disparar, apuntar, recargar, arma) 60 veces por segundo. Para que los controles
// respondan al instante, el movimiento propio se predice con las mismas reglas que usa el
// servidor y se corrige al llegar el estado confirmado (js/net/netcode.js). Los demás jugadores y
// los zombis se dibujan un poco en diferido, interpolando entre las fotos del servidor.
import { drawRobot } from '../render/robot.js';
import {
  NET,
  WEAPONS,
  WEAPON_ORDER,
  ZOMBIES,
  GOLDEN,
  SHOP,
  SHOP_ORDER,
  BUILD_ORDER,
  ROBOT,
  PLAYER_BASE,
  CLASS_ORDER,
} from '../core/config.js';
import { Player } from '../sim/player.js';
import { Robot } from '../sim/robot.js';
import { Predictor, ServerClock, Interp, unpackBody, TICK } from './netcode.js';
import { IN_RUN, IN_FIRE, IN_RELOAD, TYPES, PICKS, PARTICLE_SKIP, SFX_SYNC, DECAL_SYNC } from './protocol.js';
import { zombieSprites, drawSurvivor, lookCode, lookFromCode } from '../render/sprites.js';
import { Bullets } from '../sim/bullets.js';
import { turretBullet } from '../sim/build.js';
import { UPGRADES } from '../sim/upgrades.js';
import { Abilities } from '../sim/abilities.js';
import { rand, TAU, angleTo } from '../core/util.js';

const SAVE = 'dz-online';
const NAME_RE = /^[\p{L}\p{N} _.-]{1,16}$/u;
const PEER_N = 16;
// mismo orden que STAT_KEYS en server/src/sim/ServerSim.ts
const STAT_KEYS = [
  'maxHp',
  'armor',
  'dmgMult',
  'rateMult',
  'maxStamina',
  'staminaRegenMult',
  'speedMult',
  'ammoMult',
  'pierce',
  'reloadMult',
  'cdMult',
];
const r3 = (v) => Math.round(v * 1000) / 1000;
// códigos de cierre del servidor (server/src/rooms/DeadZoneRoom.ts)
const KICKED = 4100;
const IDLE = 4101;

// Mensaje claro para cada error del servidor o de la red.
export function explainOnline(err) {
  const m = String((err && err.message) || err || '');
  if (m === 'nombre') return 'Nombre no válido: de 1 a 16 letras, números, espacios, _ . -';
  if (m === 'origen') return 'Esta página no tiene permiso para usar el servidor (ALLOWED_ORIGINS).';
  if (/not found/i.test(m)) return 'No existe una sala con ese código (o ya se cerró).';
  if (/locked|full/i.test(m)) return `La sala está llena (máximo ${NET.maxPlayers} jugadores).`;
  if (m === 'servidor-lleno')
    return 'El servidor está lleno: todas las salas están ocupadas. Únete a la sala de un amigo o prueba en unos minutos.';
  if (m === 'sin-servidor') return 'No hay servidor configurado (NET.server en js/core/config.js o ?servidor=wss://…).';
  return 'No se pudo contactar con el servidor. Revisa tu conexión y vuelve a intentarlo en un momento.';
}

export class Online {
  constructor(game) {
    this.game = game;
    this.room = null;
    this.playing = false;
    this.leaving = false;
    this.reconnecting = false;
    this.seed = 0;
    this.peers = new Map();
    this.zs = new Map();
    // robots de los demás (el propio es game.robot) y fuegos ya vistos (para no rehacer sus llamas)
    this.robots = new Map();
    this.fireMap = new Map();
    this.remoteBullets = [];
    this.clock = new ServerClock();
    this.batch = [];
    this.rtt = 0;
    this.jitter = 0;
    this.diag = null;
    this.bytesIn = 0;
    this.bytesOut = 0;
    this.results = null;
    // al recargar o cerrar la página se anota la hora: desde ahí corren los 20 s para volver
    window.addEventListener('pagehide', () => {
      if (this.room && !this.leaving) this.remember();
    });
  }

  get active() {
    return this.playing;
  }

  get me() {
    return this.room && this.room.state && this.room.state.members
      ? this.room.state.members.get(this.room.sessionId)
      : null;
  }

  get isOwner() {
    return !!(this.room && this.room.state && this.room.state.ownerId === this.room.sessionId);
  }

  /* ---------- conexión ---------- */

  serverUrl() {
    const q = new URLSearchParams(location.search).get('servidor');
    if (q) return q;
    if (NET.server) return NET.server;
    const h = location.hostname;
    // en desarrollo (localhost o la red de casa) el servidor corre en este mismo equipo
    if (location.protocol === 'http:' || h === 'localhost' || h === '127.0.0.1') return `ws://${h || 'localhost'}:2567`;
    return '';
  }

  // El SDK de Colyseus sólo se descarga cuando alguien entra al modo en línea.
  sdk() {
    if (!this.sdkP) {
      this.sdkP = import('@colyseus/sdk').catch(() => {
        this.sdkP = null;
        throw new Error('sdk');
      });
    }
    return this.sdkP;
  }

  async client() {
    const url = this.serverUrl();
    if (!url) throw new Error('sin-servidor');
    const C = await this.sdk();
    return new C.Client(url);
  }

  async create(name) {
    const c = await this.client();
    this.attach(await c.create('dz', { name, look: lookCode(this.game.look), cls: this.game.classPick }));
  }

  async join(code, name) {
    const c = await this.client();
    this.attach(await c.joinById(code, { name, look: lookCode(this.game.look), cls: this.game.classPick }));
  }

  // Tras recargar la página: vuelve a la misma sala con el token (dentro de la ventana de 20 s).
  async resume() {
    let s = null;
    try {
      s = JSON.parse(sessionStorage.getItem(SAVE) || 'null');
    } catch {
      s = null;
    }
    if (!s || !s.token || Date.now() - s.at > NET.reconnectSeconds * 1000) return false;
    try {
      const c = await this.client();
      this.attach(await c.reconnect(s.token));
      return true;
    } catch {
      this.forget();
      return false;
    }
  }

  remember() {
    try {
      if (this.room)
        sessionStorage.setItem(SAVE, JSON.stringify({ token: this.room.reconnectionToken, at: Date.now() }));
    } catch {
      /* sin almacenamiento: sólo se pierde la vuelta tras recargar */
    }
  }

  forget() {
    try {
      sessionStorage.removeItem(SAVE);
    } catch {
      /* nada */
    }
  }

  attach(room) {
    const g = this.game;
    this.room = room;
    this.leaving = false;
    this.shutdown = false;
    this.results = null;
    // reconexión automática con espera progresiva y pocos intentos (el servidor guarda el sitio 20 s)
    Object.assign(room.reconnection, { minUptime: 0, maxRetries: 8, minDelay: 300, maxDelay: 4000 });
    this.countBytes();
    this.remember();
    room.onStateChange(() => this.onState());
    room.onMessage('load', (m) => this.onLoad(m));
    room.onMessage('go', (m) => this.onGo(m));
    room.onMessage('snap', (s) => this.applySnap(s));
    room.onMessage('resume', (m) => this.onResume(m));
    room.onMessage('results', (r) => this.onResults(r));
    room.onMessage('notice', (m) => g.onlineStatus(String((m && m.m) || '')));
    room.onMessage('error', (m) => g.onlineStatus(String((m && m.m) || 'Error'), true));
    room.onMessage('shutdown', () => {
      this.shutdown = true;
      g.onlineStatus('El servidor se está reiniciando: las partidas en memoria se pierden.', true);
    });
    room.onMessage('p', (m) => this.onPong(m));
    room.onDrop(() => {
      this.reconnecting = true;
      g.onlineStatus('Conexión perdida: reconectando…', true);
    });
    room.onReconnect(() => {
      this.reconnecting = false;
      this.countBytes();
      this.remember();
      g.onlineStatus('Reconectado');
    });
    room.onLeave((code) => this.onLeave(code));
    room.onError((code, msg) => console.warn('sala', code, msg));
    this.pingT = 0;
  }

  // Bytes que entran y salen por el WebSocket (sin contar cabeceras TCP/TLS).
  countBytes() {
    const conn = this.room && this.room.connection;
    const ws = conn && conn.transport && conn.transport.ws;
    if (!ws || ws.dzCounted) return;
    ws.dzCounted = true;
    ws.addEventListener('message', (e) => (this.bytesIn += e.data.byteLength || e.data.size || e.data.length || 0));
    if (!conn.dzSend) {
      conn.dzSend = conn.send.bind(conn);
      conn.send = (d) => {
        this.bytesOut += (d && (d.byteLength || d.length)) || 0;
        conn.dzSend(d);
      };
    }
  }

  send(type, m) {
    if (this.room && !this.reconnecting) this.room.send(type, m);
  }

  leave() {
    if (!this.room) return;
    this.leaving = true;
    this.forget();
    const r = this.room;
    this.room = null;
    if (this.playing) this.stopPlay();
    r.leave(true).catch(() => {});
  }

  onLeave(code) {
    const g = this.game;
    const mine = this.leaving;
    this.room = null;
    this.forget();
    if (this.playing) this.stopPlay();
    if (mine) return;
    g.newWorld();
    g.setupMenu();
    g.showOnline();
    const why =
      code === KICKED
        ? 'El servidor te sacó por mandar datos no válidos.'
        : code === IDLE
          ? 'La sala se cerró por llevar mucho rato sin partida.'
          : this.shutdown
            ? 'El servidor se reinició: vuelve a crear la sala en un momento.'
            : 'Se perdió la conexión con la sala y no se pudo reconectar.';
    g.onlineStatus(why, true);
  }

  /* ---------- sala ---------- */

  onState() {
    const g = this.game;
    if (g.state === 'online') g.renderLobby();
  }

  onLoad(m) {
    const g = this.game;
    this.seed = m.seed | 0;
    this.results = null;
    if (!this.inList(m)) return;
    g.onlineStatus('Cargando mapa…');
    // el mismo mapa que el servidor (se genera igual con la misma semilla)
    setTimeout(() => {
      g.newWorld(this.seed);
      this.send('loaded');
    }, 30);
  }

  onGo(m) {
    if (!this.inList(m) || this.playing) return;
    this.game.onlineStatus('');
    this.startPlay();
  }

  // ¿Este jugador está en la lista de los que juegan esta partida?
  inList(m) {
    return !!(m && Array.isArray(m.ids) && this.room && m.ids.includes(this.room.sessionId));
  }

  onResume(m) {
    if (!m) return;
    this.seed = m.seed | 0;
    // volvió tras recargar la página en plena partida: mismo mapa y a jugar
    if (m.phase === 'playing' && m.inGame && !this.playing) {
      this.game.newWorld(this.seed);
      this.startPlay();
    } else if (!this.playing) this.game.showOnline(true);
  }

  onResults(r) {
    const g = this.game;
    this.results = r;
    if (this.playing) this.stopPlay();
    g.newWorld();
    g.setupMenu();
    g.showOnline(true);
    g.onlineStatus(r ? `Partida terminada en la oleada ${r.wave}.` : 'Partida terminada.');
  }

  /* ---------- partida ---------- */

  startPlay() {
    const g = this.game;
    g.sfx.unlock();
    g.resetRun();
    g.coopRun = true;
    g.director.coop = true;
    g.director.state = 'break';
    const p = g.player;
    // la clase la confirma el servidor en cada foto (ab)
    p.cls = g.classPick;
    this.pred = new Predictor(p, g.world);
    this.phys = { x: p.x, y: p.y };
    this.fresh = true;
    this.acc = 0;
    this.batch = [];
    this.lastQ = 0;
    this.peers.clear();
    this.zs.clear();
    this.robots.clear();
    this.fireMap.clear();
    this.blkGeo = '';
    this.remoteBullets = [];
    this.clock = new ServerClock();
    this.wantReload = false;
    this.up = null;
    this.upDone = 0;
    this.lastDs = '';
    this.playing = true;
    g.input.reset();
    g.input.setRun(false);
    g.setState('play');
    g.updateHud(true);
    g.toast('¡En línea! Sobrevivan juntos');
  }

  stopPlay() {
    const g = this.game;
    this.playing = false;
    this.peers.clear();
    this.zs.clear();
    this.robots.clear();
    this.fireMap.clear();
    this.remoteBullets = [];
    this.up = null;
    g.setAcid(0);
    g.$('net-diag').hidden = true;
    g.$('btn-upgrade').hidden = true;
  }

  // Cada fotograma (también en pausa): reloj, ping y entradas a paso fijo.
  tick(dt) {
    if (!this.room) return;
    this.pingT -= dt;
    if (this.pingT <= 0) {
      this.pingT = 1;
      // con el ping va la media pantalla (px del mundo): el servidor no hace aparecer zombis a la vista
      const cam = this.game.camera;
      this.send('p', { c: Math.round(performance.now()), v: [Math.round(cam.viewW / 2), Math.round(cam.viewH / 2)] });
      // la ventana para volver tras recargar cuenta desde la última vez que hubo conexión
      if (!this.reconnecting) this.remember();
    }
    if (!this.playing) return;
    const p = this.game.player;
    this.acc += dt;
    let n = 0;
    while (this.acc >= TICK && n < 5) {
      this.acc -= TICK;
      n++;
      if (p.alive) this.stepInput();
    }
    // tras una pausa larga (pestaña oculta) no se intenta recuperar todo de golpe
    if (this.acc > TICK * 5) this.acc = 0;
    while (this.batch.length) this.send('in', { i: this.batch.splice(0, 10) });
  }

  stepInput() {
    const g = this.game;
    const inp = g.input;
    const p = g.player;
    // en pausa o en otra pantalla se manda "quieto" para que el servidor no repita lo último
    const live = g.state === 'play';
    const mv = live ? inp.move() : { x: 0, y: 0 };
    let f = 0;
    if (live && inp.run) f |= IN_RUN;
    if (live && inp.firing) f |= IN_FIRE;
    if (this.wantReload) {
      f |= IN_RELOAD;
      this.wantReload = false;
    }
    const cmd = { mx: r3(mv.x), my: r3(mv.y), f, a: r3(p.angle), w: p.wi };
    p.x = this.phys.x;
    p.y = this.phys.y;
    this.pred.step(cmd, g);
    this.phys.x = p.x;
    this.phys.y = p.y;
    this.batch.push([cmd.s, cmd.mx, cmd.my, cmd.f, cmd.a, cmd.w]);
  }

  // ¿Hay una tanda de mejoras del servidor sin elegir?
  get upReady() {
    return !!(this.up && this.up.n !== this.upDone);
  }

  // Reemplaza a game.update() mientras se juega en línea. Con otra pantalla encima (mejoras,
  // tienda, pausa) el mundo sigue moviéndose detrás: la partida no se detiene por nadie.
  update(dt) {
    const g = this.game;
    const inp = g.input;
    const p = g.player;
    const live = g.state === 'play';
    if (live) {
      if (inp.consume('pause')) return g.pause();
      if (inp.consume('reload')) this.wantReload = true;
      if (p.alive) {
        if (inp.consume('build')) g.tryBuild();
        if (inp.consume('cycleBuild')) g.cycleBuild();
        if (inp.consume('grenade')) g.tryGrenade();
        if (inp.consume('molotov')) g.tryGrenade('molotov');
        if (inp.consume('robot')) g.toggleRobot();
        if (inp.consume('ability')) g.useAbility();
        // a mitad de oleada la mejora se abre cuando él quiere (U o el botón)
        if (inp.consume('upgrade') && this.upReady) return g.openLevelUp();
      }
      if (inp.consume('nextRound')) g.startNextRound();
    }
    g.time += dt;
    // la mira y el disparo se ven al instante (las balas propias son de adorno: el daño es del servidor)
    if (live && p.alive) p.act(dt, g, inp.move());
    // espera de la habilidad y megarráfaga propia (de adorno: las balas reales son del servidor)
    Abilities.update(dt, g, p);
    this.pred.decay(dt);
    p.x = this.phys.x + this.pred.ox;
    p.y = this.phys.y + this.pred.oy;
    this.followRobot(g.robot, p, dt);
    const now = performance.now();
    const rt = this.clock.now(now) - NET.interpDelay;
    this.placePeers(rt, dt);
    this.placeZombies(rt, dt, p);
    for (const b of this.remoteBullets) {
      b.x += b.dx * (b.rocket ? 640 : 1000) * dt;
      b.y += b.dy * (b.rocket ? 640 : 1000) * dt;
      b.age += dt;
    }
    g.bullets.update(dt, g);
    const st = g.structures;
    st.time = g.time;
    for (const f of st.fires) f.t += dt;
    for (const m of st.missiles) m.t = Math.min(m.dur, m.t + dt);
    for (const q of st.blasts) q.t -= dt;
    for (const q of st.scorches) q.t += dt;
    for (const b of st.blocks) {
      b.hitT -= dt;
      if (b.flash) b.flash = Math.max(0, b.flash - dt);
      // torreta pesada de otro: el cañón se acerca al ángulo de la última foto
      if (b.manned && b.manned !== p && b.ta !== undefined) {
        b.ang = angleTo(b.ang, b.ta, dt * 12);
        b.recoil = Math.max(0, (b.recoil || 0) - dt * 10);
      }
    }
    for (const w of st.wires) w.hitT -= dt;
    g.particles.update(dt);
    g.decals.update(dt);
    g.emitFires(dt);
    const nc = this.nearCount;
    if (g.horde.list.length && Math.random() < dt * (0.35 + Math.min(1.5, nc * 0.05)))
      g.sfx.groan(Math.min(3, 0.5 + nc / 10));
    g.stepT -= dt;
    if (nc > 0 && g.stepT <= 0) {
      g.sfx.footstep(Math.min(1, nc / 20));
      g.stepT = Math.max(0.12, 0.7 - nc * 0.03) * rand(0.7, 1.3);
    }
    g.music.setDanger(p.alive ? this.danger : 0, dt);
    // a mitad de oleada sólo se avisa de la mejora (botón); entre oleadas se abre sola y luego la tienda
    const upBtn = g.$('btn-upgrade');
    const showUp = live && p.alive && this.upReady && g.director.state !== 'waiting';
    if (upBtn.hidden === showUp) upBtn.hidden = !showUp;
    if (live && p.alive && g.director.state === 'waiting') {
      if (this.upReady) return g.openLevelUp();
      if (g.shopPending) return g.openShop();
    }
    const alivePeer = !p.alive && [...this.peers.values()].find((q) => q.alive && !q.away);
    if (alivePeer) g.camera.update(dt, alivePeer.x, alivePeer.y, false);
    else {
      const look = inp.mode === 'mouse' ? 50 : 24;
      g.camera.update(dt, p.x + Math.cos(p.angle) * look, p.y + Math.sin(p.angle) * look, false);
    }
    g.muzzle = Math.max(0, g.muzzle - dt * 14);
    g.hurtFlash = Math.max(0, g.hurtFlash - dt * 1.4);
    g.updateHud(false);
  }

  placePeers(rt, dt) {
    const out = [];
    for (const q of this.peers.values()) {
      if (!q.it.sample(rt, out)) continue;
      const ox = q.x;
      const oy = q.y;
      q.x = out[0];
      q.y = out[1];
      q.angle = out[2];
      q.legAngle = out[3];
      q.walkPhase += Math.hypot(q.x - ox, q.y - oy) * 0.11;
      q.flashT -= dt;
      q.hurtT -= dt;
      q.recoil = Math.max(0, q.recoil - dt * 8);
      if (q.inRobot) this.followRobot(this.robots.get(q.idx), q, dt);
    }
  }

  // El robot pilotado va donde va su piloto (el propio, con la posición predicha).
  followRobot(rb, p, dt) {
    if (!rb) return;
    rb.hitT -= dt;
    if (!rb.owned || !rb.piloted || !p.inRobot) return;
    const moved = Math.hypot(p.x - rb.x, p.y - rb.y);
    rb.x = p.x;
    rb.y = p.y;
    rb.angle = p.angle;
    if (moved > 0.2) rb.legAngle = angleTo(rb.legAngle, p.legAngle, dt * 6);
    rb.walk += Math.min(moved, 20) * 0.045;
  }

  placeZombies(rt, dt, p) {
    const g = this.game;
    const grid = g.horde.grid;
    grid.clear();
    const out = [];
    let danger = 0;
    let nc = 0;
    for (const z of this.zs.values()) {
      if (!z.it.sample(rt, out)) continue;
      const ox = z.x;
      const oy = z.y;
      z.x = out[0];
      z.y = out[1];
      z.angle = angleTo(z.angle, out[2], dt * 12);
      z.anim += Math.hypot(z.x - ox, z.y - oy) / (z.r * 0.55);
      z.hitT -= dt;
      z.lunge = Math.max(0, z.lunge - dt * 4);
      z.tilt =
        (z.wounded ? Math.sin(g.time * 5 + z.wob) * 0.16 : 0) + (z.burn > 0 ? Math.sin(g.time * 23 + z.wob) * 0.28 : 0);
      if (z.burn > 0) {
        z.fireFx -= dt;
        if (z.fireFx <= 0) {
          z.fireFx = 0.1;
          g.particles.burning(z.x, z.y, z.r);
        }
      }
      grid.insert(z);
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d < 650) {
        danger += 1 - d / 650;
        if (d < 300) nc++;
      }
    }
    this.danger = danger;
    this.nearCount = nc;
  }

  /* ---------- fotos del servidor ---------- */

  applySnap(s) {
    const g = this.game;
    if (!this.playing || !s || typeof s !== 'object') return;
    const now = performance.now();
    this.rx = (this.rx || 0) + 1;
    if (Number(s.q) <= this.lastQ) return;
    this.lastQ = Number(s.q);
    this.clock.sync(Number(s.ts), now);
    const ts = Number(s.ts);
    const p = g.player;
    // estado confirmado propio: se reconcilia en la posición física (sin el desfase visual)
    p.x = this.phys.x;
    p.y = this.phys.y;
    if (this.fresh) {
      unpackBody(p, s.me);
      this.pred.pending.length = 0;
      this.pred.ox = this.pred.oy = 0;
      this.fresh = false;
      g.camera.x = p.x;
      g.camera.y = p.y;
    } else this.pred.reconcile(s.me, Number(s.ack) || 0);
    this.phys.x = p.x;
    this.phys.y = p.y;
    p.x += this.pred.ox;
    p.y += this.pred.oy;
    this.applyStats(p, s);
    const d = g.director;
    d.wave = s.w | 0;
    d.state = s.ds;
    this.applyInventory(s);
    this.applyEconomy(s);
    this.applyStructures(s);
    // el reloj local avanza solo (animaciones); sólo se corrige si se aleja del servidor
    const tm = Number(s.tm);
    if (Number.isFinite(tm) && Math.abs(tm - g.time) > 2) g.time = tm;
    g.kills.normal = s.kl | 0;
    this.left = s.lft | 0;
    this.applyPeers(s.pl || [], ts);
    this.applyRobots(s.rb || []);
    this.applyHeavy(s);
    this.applyZombies(s.z || [], s.o || [0, 0], s.zx || [], s.zh || [], ts);
    const pk = s.pk || [];
    g.pickups.list = [];
    for (let i = 0; i + 3 < pk.length; i += 4)
      g.pickups.list.push({ k: PICKS[pk[i]] || 'ammo', x: pk[i + 1], y: pk[i + 2], t: pk[i + 3] / 10, taken: true });
    const b = s.b || [];
    this.remoteBullets = [];
    for (let i = 0; i + 4 < b.length; i += 5)
      this.remoteBullets.push({
        x: b[i],
        y: b[i + 1],
        dx: b[i + 2] / 100,
        dy: b[i + 3] / 100,
        rocket: !!b[i + 4],
        trail: 22,
        age: 0,
      });
    if (Array.isArray(s.fx)) for (const e of s.fx) this.replay(e);
    if (Array.isArray(s.tt) && s.tt.length) g.toast(String(s.tt[s.tt.length - 1]));
    if (s.dg) this.diag = s.dg;
  }

  applyStats(p, s) {
    const g = this.game;
    const st = Array.isArray(s.st) ? s.st : [];
    const hp = Number(st[0]) || 0;
    const alive = !!st[2];
    const acid = (Number(st[8]) || 0) / 10;
    if (alive && p.alive && hp < p.hp - 0.5) {
      // golpe confirmado por el servidor (o la quemadura del ácido)
      p.hurtT = 0.3;
      if (acid > 0 && p.hp - hp <= 2.5) {
        g.hurtFlash = Math.min(1, g.hurtFlash + 0.15);
        g.sfx.sizzle();
      } else {
        g.hurtFlash = Math.min(1, g.hurtFlash + 0.5);
        g.camera.shake(0.28);
        g.sfx.hurt();
      }
    }
    // ácido del gordo: la vista se nubla mientras quema
    if (acid > 0 && !(g.acidT > 0)) {
      g.hurtFlash = Math.min(1, g.hurtFlash + 0.3);
      g.sfx.sizzle();
      g.toast('¡Ácido! Te estás quemando');
    }
    g.setAcid(alive ? acid : 0);
    // dentro del robot el cuerpo es el del robot (la predicción tiene que chocar igual que el servidor)
    const inRobot = !!st[9];
    if (inRobot !== !!p.inRobot) {
      p.inRobot = inRobot;
      p.r = inRobot ? ROBOT.radius : PLAYER_BASE.radius;
      p.mass = inRobot ? ROBOT.mass : PLAYER_BASE.mass;
    }
    // cada golpe de zombi cuesta dinero (lo cobra el servidor)
    if (Number(s.ml) > 0) {
      g.moneyPop(`-$${s.ml | 0}`, 'loss');
      g.sfx.moneyLost();
    }
    if (p.alive && !alive) {
      g.camera.shake(0.6);
      g.input.reset();
    }
    // al revivir aparece junto a un compañero: salto directo
    if (!p.alive && alive) this.fresh = true;
    p.hp = hp;
    p.stats.maxHp = Number(st[1]) || 100;
    p.alive = alive;
    this.myKills = st[6] | 0;
    const money = Math.max(0, st[7] | 0);
    // en la tienda el dinero cambia por compras y ventas: no son ganancias
    if (g.state === 'shop') {
      if (money < g.money) g.sfx.buy();
    } else if (money > g.money) {
      g.moneyEarned += money - g.money;
      // como en solitario: sólo la recompensa del dorado salta en pantalla
      if (money - g.money >= GOLDEN.rewardMin) {
        g.moneyPop(`+$${money - g.money}`, 'gold');
        g.sfx.gold();
      }
    }
    g.money = money;
    const wp = Array.isArray(s.wp) ? s.wp.filter((w) => Array.isArray(w) && WEAPONS[w[0]]) : [];
    if (wp.length) {
      const ids = wp.map((w) => w[0]).join();
      if (ids !== p.weapons.map((w) => w.id).join()) {
        p.weapons = wp.map(([id]) => p.makeWeapon(id));
        p.wi = Math.min(Math.max(0, st[3] | 0), p.weapons.length - 1);
      }
      wp.forEach(([, mag, res], i) => {
        p.weapons[i].mag = mag | 0;
        p.weapons[i].reserve = res < 0 ? Infinity : res | 0;
      });
      if (p.wi >= p.weapons.length) p.wi = 0;
    }
    p.reloadT = (Number(st[4]) || 0) / 100;
    p.reloadProg = (Number(st[5]) || 0) / 100;
    p.reloadDur = p.weapon.def.reload / p.stats.reloadMult;
  }

  // Barricadas, trampas y lanzables que tiene sin usar (los cuenta el servidor).
  applyInventory(s) {
    const g = this.game;
    if (!Array.isArray(s.iv)) return;
    SHOP_ORDER.forEach((k, i) => (g.inv[k] = Math.max(0, s.iv[i] | 0)));
    if (g.inv[g.buildSel] <= 0) g.buildSel = BUILD_ORDER.find((k) => g.inv[k] > 0) || g.buildSel;
  }

  // Nivel, mejoras ofrecidas y estadísticas (todo lo decide el servidor).
  applyEconomy(s) {
    const g = this.game;
    const p = g.player;
    const ec = Array.isArray(s.ec) ? s.ec : [];
    // el dinero ya llegó en st (applyStats): aquí sólo se usa para saber si redibujar la tienda
    const rb = g.robot;
    const shopSig =
      g.money +
      '|' +
      p.weapons.map((w) => w.id + ':' + w.reserve).join() +
      '|' +
      SHOP_ORDER.map((k) => g.inv[k]).join() +
      '|' +
      rb.owned +
      Math.ceil(rb.hp);
    g.level = Math.max(1, ec[0] | 0);
    g.xp = Math.max(0, ec[1] | 0);
    g.xpNeed = Math.max(1, ec[2] | 0);
    g.pendingLevels = Math.max(0, ec[3] | 0);
    if (Array.isArray(s.ps)) STAT_KEYS.forEach((k, i) => Number.isFinite(s.ps[i]) && (p.stats[k] = s.ps[i]));
    // habilidad: la clase y la espera las lleva el servidor (justo después de usarla manda lo predicho)
    if (Array.isArray(s.ab)) {
      const cls = CLASS_ORDER[s.ab[0]];
      if (cls) p.cls = cls;
      if (performance.now() - (this.abAt || 0) > 500) {
        p.abCd = Math.max(0, (Number(s.ab[1]) || 0) / 10);
        p.rageT = Math.max(0, (Number(s.ab[2]) || 0) / 100);
      }
    }
    const up =
      Array.isArray(s.up) && s.up.length > 1
        ? { n: s.up[0] | 0, ids: s.up.slice(1).filter((id) => UPGRADES.some((u) => u.id === id)) }
        : null;
    this.up = up && up.ids.length ? up : null;
    // fin de oleada: tienda y mejoras; si empieza la siguiente con la tienda abierta, se cierra
    if (this.lastDs === 'active' && s.ds === 'waiting') {
      g.shopPending = true;
      g.sfx.level();
    } else if (this.lastDs === 'waiting' && s.ds === 'active') {
      g.shopPending = false;
      if (g.state === 'shop' || g.state === 'levelup') {
        g.input.reset();
        g.setState('play');
        g.toast('¡Empezó la oleada!');
      }
    }
    this.lastDs = s.ds;
    // la compra se confirmó (o cambió el dinero): la tienda abierta se vuelve a dibujar
    if (g.state === 'shop' && shopSig !== this.shopSig) g.renderShop();
    this.shopSig = shopSig;
  }

  // Las mejoras que ofrece ahora el servidor (para la pantalla de subir de nivel).
  upChoices() {
    return this.up ? this.up.ids.map((id) => UPGRADES.find((u) => u.id === id)) : [];
  }

  pickUpgrade(i) {
    if (!this.up) return;
    this.upDone = this.up.n;
    this.send('pick', { i, n: this.up.n });
  }

  buy(k, id, n = 0) {
    this.send('buy', { k, id, n });
  }

  // Construir, lanzar o subir al robot: el servidor lo hace al llegar a la última entrada que
  // mandamos (s), así ocurre donde se veía el jugador y hacia donde apuntaba.
  act(k, extra = {}) {
    if (!this.pred) return;
    this.send('act', { s: this.pred.seq, k, ...extra });
    if (k === 'ab') this.abAt = performance.now();
  }

  // Granadas en el aire, fuego, cohetes clavados, explosiones; barricadas y trampas cuando cambian.
  applyStructures(s) {
    const g = this.game;
    const st = g.structures;
    const gr = Array.isArray(s.gr) ? s.gr : [];
    st.grenades = [];
    for (let i = 0; i + 5 < gr.length; i += 6)
      st.grenades.push({
        x: gr[i],
        y: gr[i + 1],
        h: gr[i + 2],
        rot: gr[i + 3] / 100,
        kind: gr[i + 4] ? 'molotov' : 'grenade',
        t: gr[i + 5] ? 2 : 0,
        dur: 1,
      });
    const fi = Array.isArray(s.fi) ? s.fi : [];
    const fires = [];
    for (let i = 0; i + 4 < fi.length; i += 5) {
      let f = this.fireMap.get(fi[i]);
      if (!f) {
        f = { id: fi[i], x: fi[i + 1], y: fi[i + 2], r: 82, tick: 0, flames: [] };
        for (let k = 0; k < 16; k++) {
          const a = rand(0, TAU);
          const dd = Math.sqrt(Math.random()) * f.r * 0.85;
          f.flames.push({
            x: f.x + Math.cos(a) * dd,
            y: f.y + Math.sin(a) * dd * 0.85,
            s: rand(0.7, 1.25),
            ph: rand(0, 10),
          });
        }
        this.fireMap.set(f.id, f);
      }
      f.t = fi[i + 3] / 100;
      f.life = fi[i + 4] / 100;
      fires.push(f);
    }
    for (const id of this.fireMap.keys()) if (!fires.some((f) => f.id === id)) this.fireMap.delete(id);
    st.fires = fires;
    const so = Array.isArray(s.so) ? s.so : [];
    st.stuck = [];
    for (let i = 0; i + 6 < so.length; i += 7)
      st.stuck.push({
        x: so[i],
        y: so[i + 1],
        ang: so[i + 2] / 100,
        t: so[i + 3] / 100,
        stick: so[i + 4] / 100,
        glow: so[i + 5] / 100,
        kind: so[i + 6] ? 'fat' : 'heavy',
      });
    const ms = Array.isArray(s.ms) ? s.ms : [];
    st.missiles = [];
    for (let i = 0; i + 3 < ms.length; i += 4)
      st.missiles.push({ x: ms[i], y: ms[i + 1], t: ms[i + 2] / 100, dur: ms[i + 3] / 100 });
    const bl = Array.isArray(s.bl) ? s.bl : [];
    st.blasts = [];
    for (let i = 0; i + 2 < bl.length; i += 3) st.blasts.push({ x: bl[i], y: bl[i + 1], t: bl[i + 2] / 100 });
    if (Array.isArray(s.blk)) {
      const list = s.blk.filter((q) => Array.isArray(q) && SHOP[q[0]] && !SHOP[q[0]].ground && !SHOP[q[0]].consumable);
      const geo = list.map((q) => q.slice(0, 5).join()).join('|');
      if (geo !== this.blkGeo) {
        // se puso o se rompió alguna: el mapa local también choca con ellas (para predecir igual)
        this.blkGeo = geo;
        for (const b of st.blocks) g.world.removeDynamic(b);
        st.blocks = list.map((q) => ({
          k: 0,
          kind: q[0],
          x: q[1],
          y: q[2],
          w: q[3],
          h: q[4],
          hp: q[5],
          max: SHOP[q[0]].hp,
          ang: q[6] / 100,
          low: true,
          block: true,
          hitT: 0,
          cd: 0,
        }));
        for (const b of st.blocks) g.world.addDynamic(b);
        st.relayer();
      } else {
        list.forEach((q, i) => {
          const b = st.blocks[i];
          if (q[5] < b.hp) b.hitT = 0.12;
          b.hp = q[5];
          // el cañón de la torreta pesada propia gira con la predicción, no con la foto
          if (b.manned !== g.player) b.ang = q[6] / 100;
        });
      }
    }
    if (Array.isArray(s.wir))
      st.wires = s.wir
        .filter((q) => Array.isArray(q) && SHOP[q[0]] && SHOP[q[0]].ground)
        .map((q) => ({ kind: q[0], x: q[1], y: q[2], w: q[3], h: q[4], hp: q[5], max: SHOP[q[0]].hp, hitT: 0 }));
    if (Array.isArray(s.sc))
      st.scorches = s.sc.filter(Array.isArray).map((q) => ({ x: q[0], y: q[1], a: q[2] / 100, t: q[3], life: q[4] }));
  }

  // Torretas pesadas: la que maneja él (su cuerpo queda detrás del cañón, también al predecir)
  // y las de los demás (el cañón gira hacia el ángulo de la foto, ver update).
  applyHeavy(s) {
    const g = this.game;
    const p = g.player;
    const st = Array.isArray(s.st) ? s.st : [];
    p.heavyAmmo = Math.max(0, st[10] | 0);
    const heavy = g.structures.blocks.filter((b) => b.kind === 'heavy');
    const at = (x, y) => heavy.find((b) => b.x === x && b.y === y) || null;
    const old = p.manned;
    for (const b of heavy) b.manned = null;
    for (const q of this.peers.values()) q.manned = null;
    const hv = Array.isArray(s.hv) ? s.hv : [];
    for (let i = 0; i + 4 < hv.length; i += 5) {
      const b = at(hv[i], hv[i + 1]);
      const q = this.peers.get(hv[i + 3]);
      if (!b || !q) continue;
      b.manned = q;
      q.manned = b;
      b.ta = hv[i + 2] / 100;
      if (hv[i + 4]) {
        b.side = hv[i + 4];
        b.flash = 0.05;
        b.recoil = 1;
      }
    }
    const mine = p.alive && Number(st[11]) >= 0 ? at(st[11], st[12]) : null;
    if (mine && old && old !== mine && old.x === mine.x && old.y === mine.y) mine.ang = old.ang;
    p.manned = mine;
    if (mine) mine.manned = p;
  }

  // Robots: el propio en game.robot (tienda, barra de vida, dibujo) y los de los demás aparte.
  applyRobots(rb) {
    const g = this.game;
    const myIdx = this.me ? this.me.idx : -1;
    const seen = new Set();
    for (let i = 0; i + 7 < rb.length; i += 8) {
      const idx = rb[i];
      let r = g.robot;
      if (idx !== myIdx) {
        seen.add(idx);
        r = this.robots.get(idx);
        if (!r) {
          r = new Robot();
          this.robots.set(idx, r);
        }
      }
      const piloted = !!rb[i + 7];
      // pilotado, sigue a su piloto en cada fotograma (ver followRobot)
      if (!piloted || !r.piloted || !r.owned) {
        r.x = rb[i + 1];
        r.y = rb[i + 2];
        r.angle = rb[i + 3] / 100;
        r.legAngle = rb[i + 4] / 100;
        r.walk = rb[i + 5] / 100;
      }
      if (r.owned && rb[i + 6] < r.hp) r.hitT = 0.2;
      r.owned = true;
      r.hp = rb[i + 6];
      r.piloted = piloted;
    }
    // el propio sólo llega si está cerca: lejos se conserva lo último que se vio
    for (const idx of this.robots.keys()) if (!seen.has(idx)) this.robots.delete(idx);
  }

  applyPeers(pl, ts) {
    const seen = new Set();
    const names = new Map();
    const looks = new Map();
    if (this.room && this.room.state)
      this.room.state.members.forEach((m) => {
        names.set(m.idx, m.name);
        looks.set(m.idx, m.look || '');
      });
    for (let i = 0; i + PEER_N - 1 < pl.length; i += PEER_N) {
      const idx = pl[i];
      seen.add(idx);
      let q = this.peers.get(idx);
      if (!q) {
        q = new Player(pl[i + 1], pl[i + 2]);
        q.puppet = true;
        q.it = new Interp([2, 3]);
        this.peers.set(idx, q);
      }
      q.name = names.get(idx) || 'Jugador';
      const code = looks.get(idx) || '';
      if (q.lookCode !== code) {
        q.lookCode = code;
        q.look = lookFromCode(code);
      }
      q.it.push(ts, [pl[i + 1], pl[i + 2], pl[i + 3] / 100, pl[i + 4] / 100]);
      q.running = !!pl[i + 5];
      const wid = WEAPON_ORDER[pl[i + 6]];
      if (wid && WEAPONS[wid] && (!q.weapons[0] || q.weapons[0].id !== wid)) {
        q.weapons = [q.makeWeapon(wid)];
        q.wi = 0;
      }
      if (pl[i + 7]) q.flashT = 0.05;
      q.alive = !!pl[i + 8];
      if (pl[i + 9]) q.hurtT = 0.2;
      q.recoil = Math.max(q.recoil, pl[i + 10] / 100);
      q.speedNow = pl[i + 11];
      q.hp = pl[i + 12];
      q.away = !!pl[i + 13];
      q.idx = idx;
      q.inRobot = !!pl[i + 14];
      q.r = q.inRobot ? ROBOT.radius : PLAYER_BASE.radius;
      // habilidad en curso (sólo para dibujarla): 1 megarráfaga, 2 impulso
      q.rageT = pl[i + 15] & 1 ? 1 : 0;
      q.boostT = pl[i + 15] & 2 ? 1 : 0;
    }
    for (const idx of this.peers.keys()) if (!seen.has(idx)) this.peers.delete(idx);
  }

  applyZombies(z, org, zx, zh, ts) {
    const g = this.game;
    const seen = new Set();
    const extra = new Map();
    for (let i = 0; i + 2 < zx.length; i += 3) extra.set(zx[i], [zx[i + 1], zx[i + 2] / 100]);
    // vida en % de los heridos (la barra usa hp / maxHp)
    const life = new Map();
    for (let i = 0; i + 1 < zh.length; i += 2) life.set(zh[i], zh[i + 1]);
    for (let i = 0; i + 5 < z.length; i += 6) {
      const id = z[i];
      const x = org[0] + z[i + 2];
      const y = org[1] + z[i + 3];
      const ang = (z[i + 4] / 64) * TAU;
      seen.add(id);
      let o = this.zs.get(id);
      if (!o) {
        const type = TYPES[z[i + 1]] || 'normal';
        const def = ZOMBIES[type];
        const sets = zombieSprites()[type];
        o = {
          id,
          type,
          def,
          r: def.radius,
          mass: def.mass,
          si: id % sets.length,
          spr: sets[id % sets.length] || sets[0],
          x,
          y,
          angle: ang,
          anim: 0,
          flash: 0,
          hitT: 0,
          hitJolt: 0,
          lunge: 0,
          spawnT: 0,
          tilt: 0,
          air: 0,
          swell: 0,
          burn: 0,
          bs: 'walk',
          life: 99,
          dead: false,
          wob: rand(0, 100),
          fireFx: 0,
          it: new Interp([2]),
        };
        this.zs.set(id, o);
      }
      o.it.push(ts, [x, y, ang]);
      const f = z[i + 5];
      o.flash = f & 1 ? 0.06 : 0;
      o.burn = f & 2 ? 1 : 0;
      o.wounded = !!(f & 4);
      o.bs = f & 8 ? 'windup' : 'walk';
      if (f & 16 && o.hitT <= 0) {
        o.hitT = 0.18;
        o.hitJolt = rand(0.2, 0.5) * (Math.random() < 0.5 ? -1 : 1);
      }
      o.life = f & 32 ? 1 : 99;
      o.lunge = f & 64 ? 1 : o.lunge;
      o.maxHp = 100;
      o.hp = life.get(id) ?? 100;
      const ex = extra.get(id);
      o.air = ex ? ex[0] : 0;
      o.swell = ex ? ex[1] : 0;
    }
    for (const [id, o] of this.zs) {
      if (seen.has(id)) continue;
      o.dead = true;
      this.zs.delete(id);
    }
    g.horde.list = Array.from(this.zs.values());
  }

  // Repite un efecto que ocurrió en el servidor (partículas, sonidos, manchas, sacudidas).
  replay(e) {
    const g = this.game;
    if (!Array.isArray(e)) return;
    const [tag, n, args] = e;
    if (!Array.isArray(args)) return;
    try {
      if (tag === 'p' && typeof g.particles[n] === 'function' && !PARTICLE_SKIP.has(n)) g.particles[n](...args);
      else if (tag === 't' && n === 'shot') this.turretShot(Number(args[0]), Number(args[1]), Number(args[2]));
      else if (tag === 's' && SFX_SYNC.includes(n)) g.sfx[n](...args);
      else if (tag === 'c' && n === 'shake')
        g.camera.shake(Math.min(1, Number(args[0]) || 0), Number(args[1]), Number(args[2]));
      else if (tag === 'g' && n === 'banner') g.banner(String(args[0] || ''), String(args[1] || ''));
      else if (tag === 'd' && DECAL_SYNC.includes(n)) {
        if (n === 'corpse') {
          const c = args[0] || {};
          const sets = zombieSprites()[c.type];
          if (!sets) return;
          g.decals.corpse(
            { type: c.type, spr: sets[c.si] || sets[0], x: c.x, y: c.y, r: c.r, angle: c.a, burnt: c.burnt },
            args[1],
            args[2],
          );
        } else g.decals[n](...args);
      }
    } catch {
      /* efecto con datos raros: se ignora */
    }
  }

  // Disparo de una torreta: bala de adorno local (choca con los zombis y paredes que se ven) y
  // el cañón gira hacia donde disparó, con su fogonazo.
  turretShot(x, y, a) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(a)) return;
    const g = this.game;
    g.bullets.spawn(turretBullet(x, y, a));
    const cx = x - Math.cos(a) * 20;
    const cy = y - Math.sin(a) * 20;
    for (const b of g.structures.blocks) {
      if (b.kind !== 'turret' || Math.abs(b.x + b.w / 2 - cx) > 4 || Math.abs(b.y + b.h / 2 - cy) > 4) continue;
      b.ang = a;
      b.flash = 0.05;
    }
  }

  /* ---------- ping y diagnóstico ---------- */

  onPong(m) {
    const c = Number(m && m.c);
    if (!Number.isFinite(c)) return;
    const rtt = performance.now() - c;
    if (rtt < 0 || rtt > 30000) return;
    // variación del RTT (jitter): media móvil de la diferencia entre medidas seguidas
    if (this.rtt) this.jitter += (Math.abs(rtt - this.rtt) - this.jitter) / 8;
    this.rtt = rtt;
  }

  // Texto corto del indicador (una vez por segundo) y, si está abierto, el panel de diagnóstico.
  stats(dt) {
    this.statT = (this.statT || 0) + dt;
    this.frames = (this.frames || 0) + 1;
    if (this.statT < 1) return null;
    const secs = this.statT;
    const fps = Math.round(this.frames / secs);
    const per = Math.round((this.rx || 0) / secs);
    const kin = this.bytesIn / 1024 / secs;
    const kout = this.bytesOut / 1024 / secs;
    this.statT = 0;
    this.frames = 0;
    this.rx = 0;
    this.bytesIn = 0;
    this.bytesOut = 0;
    const c = this.pred ? this.pred.takeStats() : { n: 0, avg: 0, max: 0, snaps: 0 };
    const el = this.game.$('net-diag');
    if (!el.hidden) {
      const d = this.diag;
      el.textContent = [
        `RTT (aplicación): ${Math.round(this.rtt)} ms · variación del RTT: ${Math.round(this.jitter)} ms`,
        d
          ? `Servidor: ${d.hz} pasos/s (objetivo ${NET.tickHz}) · paso ${d.ms} ms, máx ${d.mx} ms · descartados ${d.skip}`
          : 'Servidor: esperando datos…',
        d
          ? `Salas activas: ${d.rooms} · jugadores conectados: ${d.players} · CPU del servidor: ${d.cpu}% de un núcleo`
          : '',
        `Fotos recibidas: ${per}/s (envío ${NET.snapHz}/s) · retraso de dibujo ${NET.interpDelay} ms`,
        `Datos: ↓ ${kin.toFixed(1)} KB/s · ↑ ${kout.toFixed(1)} KB/s (WebSocket, sin cabeceras TCP/TLS)`,
        `Correcciones: ${c.n}/s · media ${c.avg.toFixed(1)} px · máx ${c.max.toFixed(1)} px · saltos ${c.snaps}`,
        `Entradas sin confirmar: ${this.pred ? this.pred.pending.length : 0} · FPS ${fps}`,
        'Pérdida de paquetes: no se mide (WebSocket va sobre TCP y la oculta con reenvíos).',
      ]
        .filter(Boolean)
        .join('\n');
    }
    if (this.reconnecting) return 'Reconectando…';
    return `En línea · RTT ${Math.round(this.rtt)} ms (±${Math.round(this.jitter)}) · ${per} act/s · ${fps} FPS`;
  }

  /* ---------- dibujo ---------- */

  drawPeers(ctx) {
    if (!this.playing) return;
    const g = this.game;
    ctx.font = '700 11px sans-serif';
    ctx.textAlign = 'center';
    // robots estacionados de los demás (los pilotados se dibujan con su piloto)
    for (const r of this.robots.values()) if (!r.piloted) drawRobot(ctx, r, null, g.time);
    for (const q of this.peers.values()) {
      if (!q.alive) continue;
      if (q.away) ctx.globalAlpha = 0.45;
      const r = q.inRobot && this.robots.get(q.idx);
      if (r) drawRobot(ctx, r, q, g.time);
      else drawSurvivor(ctx, q, g.time);
      const name = q.away ? `${q.name} (reconectando)` : q.name;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(name, q.x + 1, q.y - q.r - 13);
      ctx.fillStyle = '#9fd0ff';
      ctx.fillText(name, q.x, q.y - q.r - 14);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'start';
  }

  drawRemoteBullets(ctx) {
    if (!this.playing || !this.remoteBullets.length) return;
    Bullets.prototype.draw.call({ list: this.remoteBullets }, ctx);
  }
}

export function validName(s) {
  return NAME_RE.test(String(s || '').trim());
}

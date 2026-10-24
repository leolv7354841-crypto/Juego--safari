// Multijugador en línea (hasta NET.maxPlayers jugadores por sala) contra el servidor autoritativo (carpeta server/).
//
// El servidor simula todo; aquí sólo se manda lo que quiere hacer el jugador (dirección,
// correr, disparar, apuntar, recargar, arma) 60 veces por segundo. Para que los controles
// respondan al instante, el movimiento propio se predice con las mismas reglas que usa el
// servidor y se corrige al llegar el estado confirmado (js/netcode.js). Los demás jugadores y
// los zombis se dibujan un poco en diferido, interpolando entre las fotos del servidor.
import { NET, WEAPONS, WEAPON_ORDER, ZOMBIES } from './config.js';
import { Player } from './player.js';
import { Predictor, ServerClock, Interp, unpackBody, IN_RUN, IN_FIRE, IN_RELOAD, TICK } from './netcode.js';
import { TYPES, PICKS, PARTICLE_SKIP, SFX_SYNC, DECAL_SYNC } from './coop.js';
import { zombieSprites, drawSurvivor } from './sprites.js';
import { Bullets } from './bullets.js';
import { rand, TAU, angleTo } from './util.js';

const SAVE = 'dz-online';
const NAME_RE = /^[\p{L}\p{N} _.-]{1,16}$/u;
const PEER_N = 14;
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
  if (m === 'servidor-lleno') return 'El servidor está lleno: todas las salas están ocupadas. Únete a la sala de un amigo o prueba en unos minutos.';
  if (m === 'sin-servidor') return 'No hay servidor configurado (NET.server en js/config.js o ?servidor=wss://…).';
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
    return this.room && this.room.state && this.room.state.members ? this.room.state.members.get(this.room.sessionId) : null;
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

  // El SDK de Colyseus sólo se carga cuando alguien entra al modo en línea.
  sdk() {
    if (window.Colyseus) return Promise.resolve(window.Colyseus);
    if (!this.sdkP) {
      this.sdkP = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = './js/vendor/colyseus.js' + (window.DZ_QUERY || '');
        s.onload = () => (window.Colyseus ? resolve(window.Colyseus) : reject(new Error('sdk')));
        s.onerror = () => {
          this.sdkP = null;
          reject(new Error('sdk'));
        };
        document.head.appendChild(s);
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
    this.attach(await c.create('dz', { name }));
  }

  async join(code, name) {
    const c = await this.client();
    this.attach(await c.joinById(code, { name }));
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
      if (this.room) sessionStorage.setItem(SAVE, JSON.stringify({ token: this.room.reconnectionToken, at: Date.now() }));
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
      code === KICKED ? 'El servidor te sacó por mandar datos no válidos.'
      : code === IDLE ? 'La sala se cerró por llevar mucho rato sin partida.'
      : this.shutdown ? 'El servidor se reinició: vuelve a crear la sala en un momento.'
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
    this.pred = new Predictor(p, g.world);
    this.phys = { x: p.x, y: p.y };
    this.fresh = true;
    this.acc = 0;
    this.batch = [];
    this.lastQ = 0;
    this.peers.clear();
    this.zs.clear();
    this.remoteBullets = [];
    this.clock = new ServerClock();
    this.wantReload = false;
    this.playing = true;
    g.$('btn-round-shop').hidden = true;
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
    this.remoteBullets = [];
    g.$('btn-round-shop').hidden = false;
    g.$('net-diag').hidden = true;
  }

  // Cada fotograma (también en pausa): reloj, ping y entradas a paso fijo.
  tick(dt) {
    if (!this.room) return;
    this.pingT -= dt;
    if (this.pingT <= 0) {
      this.pingT = 1;
      this.send('p', { c: Math.round(performance.now()) });
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

  // Reemplaza a game.update() mientras se juega en línea.
  update(dt) {
    const g = this.game;
    const inp = g.input;
    const p = g.player;
    if (inp.consume('pause')) return g.pause();
    if (inp.consume('reload')) this.wantReload = true;
    for (const k of ['build', 'cycleBuild', 'grenade', 'molotov', 'robot']) if (inp.consume(k)) g.toast('No disponible en línea todavía');
    if (inp.consume('nextRound')) g.startNextRound();
    g.time += dt;
    // la mira y el disparo se ven al instante (las balas propias son de adorno: el daño es del servidor)
    if (p.alive) p.act(dt, g, inp.move());
    this.pred.decay(dt);
    p.x = this.phys.x + this.pred.ox;
    p.y = this.phys.y + this.pred.oy;
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
    g.particles.update(dt);
    g.decals.update(dt);
    g.emitFires(dt);
    const nc = this.nearCount;
    if (g.horde.list.length && Math.random() < dt * (0.35 + Math.min(1.5, nc * 0.05))) g.sfx.groan(Math.min(3, 0.5 + nc / 10));
    g.stepT -= dt;
    if (nc > 0 && g.stepT <= 0) {
      g.sfx.footstep(Math.min(1, nc / 20));
      g.stepT = Math.max(0.12, 0.7 - nc * 0.03) * rand(0.7, 1.3);
    }
    g.music.setDanger(p.alive ? this.danger : 0, dt);
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
    }
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
      z.tilt = (z.wounded ? Math.sin(g.time * 5 + z.wob) * 0.16 : 0) + (z.burn > 0 ? Math.sin(g.time * 23 + z.wob) * 0.28 : 0);
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
    // el reloj local avanza solo (animaciones); sólo se corrige si se aleja del servidor
    const tm = Number(s.tm);
    if (Number.isFinite(tm) && Math.abs(tm - g.time) > 2) g.time = tm;
    g.kills.normal = s.kl | 0;
    this.left = s.lft | 0;
    this.applyPeers(s.pl || [], ts);
    this.applyZombies(s.z || [], s.o || [0, 0], s.zx || [], ts);
    const pk = s.pk || [];
    g.pickups.list = [];
    for (let i = 0; i + 3 < pk.length; i += 4) g.pickups.list.push({ k: PICKS[pk[i]] || 'ammo', x: pk[i + 1], y: pk[i + 2], t: pk[i + 3] / 10, taken: true });
    const b = s.b || [];
    this.remoteBullets = [];
    for (let i = 0; i + 4 < b.length; i += 5) this.remoteBullets.push({ x: b[i], y: b[i + 1], dx: b[i + 2] / 100, dy: b[i + 3] / 100, rocket: !!b[i + 4], trail: 22, age: 0 });
    if (Array.isArray(s.fx)) for (const e of s.fx) this.replay(e);
    if (Array.isArray(s.tt) && s.tt.length) g.toast(String(s.tt[s.tt.length - 1]));
    if (s.dg) this.diag = s.dg;
  }

  applyStats(p, s) {
    const g = this.game;
    const st = Array.isArray(s.st) ? s.st : [];
    const hp = Number(st[0]) || 0;
    const alive = !!st[2];
    if (alive && p.alive && hp < p.hp - 0.5) {
      // golpe confirmado por el servidor
      p.hurtT = 0.3;
      g.hurtFlash = Math.min(1, g.hurtFlash + 0.5);
      g.camera.shake(0.28);
      g.sfx.hurt();
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

  applyPeers(pl, ts) {
    const seen = new Set();
    const names = new Map();
    if (this.room && this.room.state) this.room.state.members.forEach((m) => names.set(m.idx, m.name));
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
    }
    for (const idx of this.peers.keys()) if (!seen.has(idx)) this.peers.delete(idx);
  }

  applyZombies(z, org, zx, ts) {
    const g = this.game;
    const seen = new Set();
    const extra = new Map();
    for (let i = 0; i + 2 < zx.length; i += 3) extra.set(zx[i], [zx[i + 1], zx[i + 2] / 100]);
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
          id, type, def, r: def.radius, mass: def.mass, si: id % sets.length, spr: sets[id % sets.length] || sets[0], x, y,
          angle: ang, anim: 0, flash: 0, hitT: 0, hitJolt: 0, lunge: 0, spawnT: 0, tilt: 0, air: 0, swell: 0, burn: 0,
          bs: 'walk', life: 99, dead: false, wob: rand(0, 100), fireFx: 0, it: new Interp([2]),
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
      else if (tag === 's' && SFX_SYNC.includes(n)) g.sfx[n](...args);
      else if (tag === 'c' && n === 'shake') g.camera.shake(Math.min(1, Number(args[0]) || 0));
      else if (tag === 'g' && n === 'banner') g.banner(String(args[0] || ''), String(args[1] || ''));
      else if (tag === 'd' && DECAL_SYNC.includes(n)) {
        if (n === 'corpse') {
          const c = args[0] || {};
          const sets = zombieSprites()[c.type];
          if (!sets) return;
          g.decals.corpse({ type: c.type, spr: sets[c.si] || sets[0], x: c.x, y: c.y, r: c.r, angle: c.a, burnt: c.burnt }, args[1], args[2]);
        } else g.decals[n](...args);
      }
    } catch {
      /* efecto con datos raros: se ignora */
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
        d ? `Servidor: ${d.hz} pasos/s (objetivo ${NET.tickHz}) · paso ${d.ms} ms, máx ${d.mx} ms · descartados ${d.skip}` : 'Servidor: esperando datos…',
        d ? `Salas activas: ${d.rooms} · jugadores conectados: ${d.players} · CPU del servidor: ${d.cpu}% de un núcleo` : '',
        `Fotos recibidas: ${per}/s (envío ${NET.snapHz}/s) · retraso de dibujo ${NET.interpDelay} ms`,
        `Datos: ↓ ${kin.toFixed(1)} KB/s · ↑ ${kout.toFixed(1)} KB/s (WebSocket, sin cabeceras TCP/TLS)`,
        `Correcciones: ${c.n}/s · media ${c.avg.toFixed(1)} px · máx ${c.max.toFixed(1)} px · saltos ${c.snaps}`,
        `Entradas sin confirmar: ${this.pred ? this.pred.pending.length : 0} · FPS ${fps}`,
        'Pérdida de paquetes: no se mide (WebSocket va sobre TCP y la oculta con reenvíos).',
      ].filter(Boolean).join('\n');
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
    for (const q of this.peers.values()) {
      if (!q.alive) continue;
      if (q.away) ctx.globalAlpha = 0.45;
      drawSurvivor(ctx, q, g.time);
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

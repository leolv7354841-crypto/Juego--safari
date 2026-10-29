// Multijugador en línea (hasta NET.maxPlayers jugadores por sala) contra el servidor autoritativo (carpeta server/).
//
// El servidor simula todo; aquí sólo se manda lo que quiere hacer el jugador (dirección,
// correr, disparar, apuntar, recargar, arma) 60 veces por segundo. Para que los controles
// respondan al instante, el movimiento propio se predice con las mismas reglas que usa el
// servidor y se corrige al llegar el estado confirmado (js/net/netcode.js). Los demás jugadores y
// los zombis se dibujan un poco en diferido, interpolando entre las fotos del servidor.
import {
  NET,
  WEAPONS,
  GOLDEN,
  SHOP_ORDER,
  BUILD_ORDER,
  ROBOT,
  PLAYER_BASE,
  CLASS_ORDER,
  EVENT_ORDER,
} from '../core/config.ts';
import { ServerClock, applyMove, BODY } from './netcode.ts';
import { IN_RUN, IN_FIRE, IN_RELOAD } from './protocol.ts';
import { lookCode } from '../render/sprites.js';
import { UPGRADES } from '../sim/upgrades.ts';
import { Abilities } from '../sim/abilities.ts';
import { applyCombo } from '../sim/combo.ts';
import { OnlineClient, Solo } from './mode.ts';
import type { Cmd, LobbyMember, Snapshot } from '../core/types.d.ts';
import type { Player } from '../sim/player.ts';

// Lo mínimo que se usa de la sala de Colyseus (el SDK se carga con import() dinámico y no se importa aquí).
interface WsLike {
  dzCounted?: boolean;
  addEventListener(
    type: 'message',
    cb: (e: { data: { byteLength?: number; size?: number; length?: number } }) => void,
  ): void;
}
interface ConnLike {
  transport?: { ws?: WsLike };
  send(d: { byteLength?: number; length?: number }): void;
  dzSend?: (d: { byteLength?: number; length?: number }) => void;
}
export interface RoomLike {
  sessionId: string;
  reconnectionToken: string;
  state: {
    members: { get(id: string): LobbyMember | undefined; forEach(cb: (m: LobbyMember) => void): void };
    ownerId: string;
    bodies: { get(id: string): object | undefined };
  };
  reconnection: object;
  connection: ConnLike;
  onStateChange(cb: () => void): void;
  onMessage<T = unknown>(type: string, cb: (m: T) => void): void;
  onDrop(cb: () => void): void;
  onReconnect(cb: () => void): void;
  onLeave(cb: (code: number) => void): void;
  onError(cb: (code: number, msg?: string) => void): void;
  send(type: string, m?: unknown): void;
  input(opts?: { mode?: 'reliable' | 'unreliable' }): InputLike;
  leave(consented?: boolean): Promise<void>;
}
// Canal de entradas del SDK (room.input()): se rellena `data` y send() manda una entrada y devuelve su secuencia.
export interface InputLike {
  data: { mx: number; my: number; f: number; a: number; w: number };
  send(): number;
  sentCount: number;
}
interface ClientLike {
  create(name: string, opts: object): Promise<RoomLike>;
  joinById(id: string, opts: object): Promise<RoomLike>;
  reconnect(token: string): Promise<RoomLike>;
}
// Módulo predict del SDK (Reconciler): rebobina al cuerpo confirmado por el servidor y repite las entradas sin confirmar.
interface StepCtx {
  isReplay: boolean;
  dt: number;
}
interface RecLike {
  state: Record<string, number | boolean>;
  value(field: string): number;
  lastCorrection: Record<string, number>;
  lastCorrectionMag: number;
  pendingCount: number;
}
interface PredictLike {
  reconciler(instance: object, opts: object): RecLike;
  tick(now?: number): number;
  dispose(): void;
}
interface SdkLike {
  Client: new (url: string) => ClientLike;
  Predict: { get(room: RoomLike, opts?: object): PredictLike };
}
type IdsMsg = { ids?: string[] } | null;
type LoadMsg = { seed: number; ids?: string[] };
type ResumeMsg = { seed: number; phase: string; inGame: boolean };
export type ResultsMsg = { wave: number } | null;
type Diag = { hz: number; ms: number; mx: number; skip: number; rooms: number; players: number; cpu: number };
type HeavyBlock = {
  kind: string;
  x: number;
  y: number;
  manned: unknown;
  ang: number;
  ta: number;
  side: number;
  flash: number;
  recoil: number;
};

const SAVE = 'dz-online';
const NAME_RE = /^[\p{L}\p{N} _.-]{1,16}$/u;

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
// códigos de cierre del servidor (server/src/rooms/DeadZoneRoom.ts)
const KICKED = 4100;
const IDLE = 4101;

// Mensaje claro para cada error del servidor o de la red.
export function explainOnline(err: unknown) {
  const m = String((err && (err as { message?: unknown }).message) || err || '');
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
  declare game: any;
  declare room: RoomLike | null;
  declare playing: boolean;
  declare leaving: boolean;
  declare reconnecting: boolean;
  declare seed: number;
  declare clock: ServerClock;
  declare inp: InputLike | null;
  declare rtt: number;
  declare jitter: number;
  declare diag: Diag | null;
  declare bytesIn: number;
  declare bytesOut: number;
  declare results: ResultsMsg;
  declare sdkP: Promise<SdkLike> | null;
  declare shutdown: boolean;
  declare pingT: number;
  declare Sdk: SdkLike | null;
  declare predict: PredictLike | null;
  declare rec: RecLike | null;
  // correcciones de posición del último periodo (para el diagnóstico)
  declare corr: { n: number; sum: number; max: number; snaps: number };
  declare acc: number;
  declare lastQ: number;
  declare wantReload: boolean;
  declare up: { n: number; ids: string[] } | null;
  declare upDone: number;
  declare lastDs: string;
  declare left: number;
  declare myKills: number;
  declare abAt: number;
  declare shopSig: string;
  constructor(game: any) {
    this.game = game;
    this.room = null;
    this.playing = false;
    this.leaving = false;
    this.reconnecting = false;
    this.seed = 0;
    this.clock = new ServerClock();
    this.inp = null;
    this.Sdk = null;
    this.predict = null;
    this.rec = null;
    this.corr = { n: 0, sum: 0, max: 0, snaps: 0 };
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
      this.sdkP = (import('@colyseus/sdk') as unknown as Promise<SdkLike>).catch(() => {
        this.sdkP = null;
        throw new Error('sdk');
      });
    }
    return this.sdkP;
  }

  async client() {
    const url = this.serverUrl();
    if (!url) throw new Error('sin-servidor');
    const C = (this.Sdk = await this.sdk());
    return new C.Client(url);
  }

  async create(name: string) {
    const c = await this.client();
    this.attach(await c.create('dz', { name, look: lookCode(this.game.look), cls: this.game.classPick }));
  }

  async join(code: string, name: string) {
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

  attach(room: RoomLike) {
    const g = this.game;
    this.room = room;
    this.inp = null;
    this.leaving = false;
    this.shutdown = false;
    this.results = null;
    // reconexión automática con espera progresiva y pocos intentos (el servidor guarda el sitio 20 s)
    Object.assign(room.reconnection, { minUptime: 0, maxRetries: 8, minDelay: 300, maxDelay: 4000 });
    this.countBytes();
    this.remember();
    room.onStateChange(() => this.onState());
    room.onMessage<LoadMsg>('load', (m) => this.onLoad(m));
    room.onMessage<IdsMsg>('go', (m) => this.onGo(m));
    room.onMessage<Snapshot>('snap', (s) => this.applySnap(s));
    room.onMessage<ResumeMsg>('resume', (m) => this.onResume(m));
    room.onMessage<ResultsMsg>('results', (r) => this.onResults(r));
    room.onMessage<{ m?: string } | null>('notice', (m) => g.onlineStatus(String((m && m.m) || '')));
    room.onMessage<{ m?: string } | null>('error', (m) => g.onlineStatus(String((m && m.m) || 'Error'), true));
    room.onMessage('shutdown', () => {
      this.shutdown = true;
      g.onlineStatus('El servidor se está reiniciando: las partidas en memoria se pierden.', true);
    });
    room.onMessage<{ c: number }>('p', (m) => this.onPong(m));
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
      const raw = conn.send.bind(conn);
      conn.dzSend = raw;
      conn.send = (d: { byteLength?: number; length?: number }) => {
        this.bytesOut += (d && (d.byteLength || d.length)) || 0;
        raw(d);
      };
    }
  }

  send(type: string, m?: unknown) {
    if (this.room && !this.reconnecting) this.room.send(type, m);
  }

  leave() {
    if (!this.room) return;
    this.leaving = true;
    this.forget();
    const r = this.room;
    this.room = null;
    if (this.playing) this.stopPlay('abandono');
    r.leave(true).catch(() => {});
  }

  onLeave(code: number) {
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

  onLoad(m: LoadMsg) {
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

  onGo(m: IdsMsg) {
    if (!this.inList(m) || this.playing) return;
    this.game.onlineStatus('');
    this.startPlay();
  }

  // ¿Este jugador está en la lista de los que juegan esta partida?
  inList(m: IdsMsg) {
    return !!(m && Array.isArray(m.ids) && this.room && m.ids.includes(this.room.sessionId));
  }

  onResume(m: ResumeMsg) {
    if (!m) return;
    this.seed = m.seed | 0;
    // volvió tras recargar la página en plena partida: mismo mapa y a jugar
    if (m.phase === 'playing' && m.inGame && !this.playing) {
      this.game.newWorld(this.seed);
      this.startPlay();
    } else if (!this.playing) this.game.showOnline(true);
  }

  onResults(r: ResultsMsg) {
    const g = this.game;
    this.results = r;
    if (this.playing) this.stopPlay('fin');
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
    g.mode = new OnlineClient(g);
    g.director.coop = true;
    g.director.state = 'break';
    const p = g.player;
    // la clase la confirma el servidor en cada foto (ab)
    p.cls = g.classPick;
    g.analitica.iniciar('online');
    this.rec = null;
    this.predict?.dispose();
    this.predict = null;
    this.corr = { n: 0, sum: 0, max: 0, snaps: 0 };
    this.acc = 0;
    this.inp = null;
    this.lastQ = 0;
    // los demás jugadores, zombis y robots se dibujan interpolando (js/net/remote.js)
    g.remote.start();
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

  // `fin`: 'fin' si la sala terminó, 'abandono' si se salió o se cayó (para las estadísticas).
  stopPlay(fin: 'fin' | 'abandono' = 'abandono') {
    const g = this.game;
    this.playing = false;
    g.analitica.terminar(fin);
    g.mode = new Solo(g, true);
    g.remote.stop();
    this.up = null;
    g.setAcid(0);
    g.$('net-diag').hidden = true;
    g.$('btn-upgrade').hidden = true;
  }

  // Cada fotograma (también en pausa): reloj, ping y entradas a paso fijo.
  tick(dt: number) {
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
    if (!this.rec && !this.tryPredict()) return;
    // el SDK reparte el tiempo en pasos fijos (NET.tickHz) y suaviza las correcciones
    const n = this.predict ? this.predict.tick(performance.now()) : 0;
    for (let i = 0; i < n; i++) if (p.alive) this.stepInput();
  }

  // Crea el reconciliador del SDK cuando ya llegó el cuerpo propio en el estado de la sala.
  tryPredict() {
    const g = this.game;
    const room = this.room;
    if (!room || !this.Sdk) return false;
    const body = room.state.bodies?.get(room.sessionId);
    if (!body) return false;
    const input = (this.inp ||= room.input({ mode: 'reliable' }));
    const p = g.player;
    const quiet = { world: g.world, sfx: new Proxy({}, { get: () => () => {} }) } as unknown as Parameters<
      typeof applyMove
    >[2];
    this.predict = this.Sdk.Predict.get(room);
    this.rec = this.predict.reconciler(body, {
      input,
      snap: NET.snapDist,
      // activa la telemetría de correcciones (lastCorrectionMag) para el diagnóstico; nunca avisa por consola
      warnOnDivergence: 1e9,
      // Player.move sobre el cuerpo del jugador: el mismo código y el mismo paso (1/tickHz) que el servidor
      step: (ctx: StepCtx, st: Record<string, number | boolean>, cmd: Cmd) => {
        for (const k of BODY) p[k] = st[k] as number;
        p.exhausted = !!st.exhausted;
        applyMove(p, cmd, ctx.isReplay ? quiet : g);
        for (const k of BODY) st[k] = p[k];
        st.exhausted = !!p.exhausted;
      },
      onReconcile: () => this.noteCorrection(),
    });
    for (const k of BODY) p[k] = (this.rec.state[k] as number) ?? p[k];
    g.camera.x = p.x;
    g.camera.y = p.y;
    return true;
  }

  noteCorrection() {
    // sólo la posición (lastCorrectionMag mezcla también aguante, velocidad, etc.)
    const lc = this.rec ? this.rec.lastCorrection : null;
    const e = lc ? Math.hypot(lc.x || 0, lc.y || 0) : 0;
    if (e > 0.5) {
      this.corr.n++;
      this.corr.sum += e;
      this.corr.max = Math.max(this.corr.max, e);
      if (e > NET.snapDist) this.corr.snaps++;
    }
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
    // lo que viaja es float32: se predice con el mismo valor que decodifica el servidor
    const cmd: Cmd = {
      s: 0, // la secuencia la da el SDK al enviar
      mx: Math.fround(mv.x),
      my: Math.fround(mv.y),
      f,
      a: Math.fround(p.angle),
      w: p.wi,
    };
    if (this.room) {
      const d = (this.inp ||= this.room.input({ mode: 'reliable' })).data;
      d.mx = cmd.mx;
      d.my = cmd.my;
      d.f = cmd.f;
      d.a = cmd.a;
      d.w = cmd.w;
      cmd.s = this.inp.send();
    }
  }

  // ¿Hay una tanda de mejoras del servidor sin elegir?
  get upReady() {
    return !!(this.up && this.up.n !== this.upDone);
  }

  // Reemplaza a game.update() mientras se juega en línea. Con otra pantalla encima (mejoras,
  // tienda, pausa) el mundo sigue moviéndose detrás: la partida no se detiene por nadie.
  update(dt: number) {
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
    if (this.rec) {
      p.x = this.rec.value('x');
      p.y = this.rec.value('y');
      p.legAngle = this.rec.value('legAngle');
    }
    const R = g.remote;
    R.followRobot(g.robot, p, dt);
    const rt = this.clock.now(performance.now()) - NET.interpDelay;
    R.placePeers(rt, dt);
    R.placeZombies(rt, dt, p);
    R.advance(dt);
    R.ambience(dt, p);
    // a mitad de oleada sólo se avisa de la mejora (botón); entre oleadas se abre sola y luego la tienda
    const upBtn = g.$('btn-upgrade');
    const showUp = live && p.alive && this.upReady && g.director.state !== 'waiting';
    if (upBtn.hidden === showUp) upBtn.hidden = !showUp;
    if (live && p.alive && g.director.state === 'waiting') {
      if (this.upReady) return g.openLevelUp();
      if (g.shopPending) return g.openShop();
    }
    const alivePeer = !p.alive && [...g.remote.peers.values()].find((q) => q.alive && !q.away);
    if (alivePeer) g.camera.update(dt, alivePeer.x, alivePeer.y, false);
    else {
      const look = inp.mode === 'mouse' ? 50 : 24;
      g.camera.update(dt, p.x + Math.cos(p.angle) * look, p.y + Math.sin(p.angle) * look, false);
    }
    g.muzzle = Math.max(0, g.muzzle - dt * 14);
    g.hurtFlash = Math.max(0, g.hurtFlash - dt * 1.4);
    g.updateHud(false);
  }

  /* ---------- fotos del servidor ---------- */

  applySnap(s: Snapshot) {
    const g = this.game;
    if (!this.playing || !s || typeof s !== 'object') return;
    const now = performance.now();
    g.remote.net.count();
    if (Number(s.q) <= this.lastQ) return;
    this.lastQ = Number(s.q);
    this.clock.sync(Number(s.ts), now);
    const ts = Number(s.ts);
    const p = g.player;
    this.applyStats(p, s);
    const d = g.director;
    d.wave = s.w | 0;
    d.state = s.ds;
    d.event = EVENT_ORDER[(s.ev | 0) - 1] || '';
    this.applyInventory(s);
    this.applyEconomy(s);
    // el reloj local avanza solo (animaciones); sólo se corrige si se aleja del servidor
    const tm = Number(s.tm);
    if (Number.isFinite(tm) && Math.abs(tm - g.time) > 2) g.time = tm;
    g.kills.normal = s.kl | 0;
    this.left = s.lft | 0;
    // jugadores, robots, zombis, objetos, balas y estructuras: lo que arma el servidor para este jugador
    g.remote.applyWorld(s, ts, { myIdx: this.me ? this.me.idx : -1, identify: (idx: number) => this.identify(idx) });
    this.applyHeavy(s);
    if (Array.isArray(s.fx)) for (const e of s.fx) g.remote.replay(e);
    if (Array.isArray(s.tt) && s.tt.length) g.toast(String(s.tt[s.tt.length - 1]));
    if (s.dg) this.diag = s.dg;
  }

  // Nombre y aspecto de un jugador de la sala (viven en el estado compartido del servidor).
  identify(idx: number) {
    const ms = this.room && this.room.state && this.room.state.members;
    const hit: { m?: LobbyMember } = {};
    if (ms)
      ms.forEach((m) => {
        if (m.idx === idx) hit.m = m;
      });
    const found = hit.m;
    return { name: (found && found.name) || 'Jugador', code: (found && found.look) || '' };
  }

  applyStats(p: Player, s: Snapshot) {
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
      // el servidor no manda la causa: sólo se distingue la quemadura de ácido
      g.analitica.muerte(acid > 0 ? 'acid' : 'desconocida');
    }
    // al revivir aparece junto a un compañero: el salto lo absorbe el reconciliador (opción snap)
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
    applyCombo(p.combo, s.cb);
    const wp = Array.isArray(s.wp) ? s.wp.filter((w) => Array.isArray(w) && w[0] in WEAPONS) : [];
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
  applyInventory(s: Snapshot) {
    const g = this.game;
    if (!Array.isArray(s.iv)) return;
    SHOP_ORDER.forEach((k, i) => (g.inv[k] = Math.max(0, s.iv[i] | 0)));
    if (g.inv[g.buildSel] <= 0) g.buildSel = BUILD_ORDER.find((k) => g.inv[k] > 0) || g.buildSel;
  }

  // Nivel, mejoras ofrecidas y estadísticas (todo lo decide el servidor).
  applyEconomy(s: Snapshot) {
    const g = this.game;
    const p = g.player;
    const ec = Array.isArray(s.ec) ? s.ec : [];
    // el dinero ya llegó en st (applyStats): aquí sólo se usa para saber si redibujar la tienda
    const rb = g.robot;
    const shopSig =
      g.money +
      '|' +
      p.weapons.map((w: { id: string; reserve: number }) => w.id + ':' + w.reserve).join() +
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
        ? { n: s.up[0] | 0, ids: s.up.slice(1).filter((id: string) => UPGRADES.some((u) => u.id === id)) }
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

  pickUpgrade(i: number) {
    if (!this.up) return;
    this.upDone = this.up.n;
    this.send('pick', { i, n: this.up.n });
  }

  buy(k: string, id: string, n = 0) {
    this.send('buy', { k, id, n });
  }

  // Construir, lanzar o subir al robot: el servidor lo hace al llegar a la última entrada que
  // mandamos (s), así ocurre donde se veía el jugador y hacia donde apuntaba.
  act(k: string, extra: Record<string, unknown> = {}) {
    if (!this.inp) return;
    this.send('act', { s: this.inp.sentCount, k, ...extra });
    if (k === 'ab') this.abAt = performance.now();
  }

  // Torretas pesadas: la que maneja él (su cuerpo queda detrás del cañón, también al predecir)
  // y las de los demás (el cañón gira hacia el ángulo de la foto, ver update).
  applyHeavy(s: Snapshot) {
    const g = this.game;
    const p = g.player;
    const st = Array.isArray(s.st) ? s.st : [];
    p.heavyAmmo = Math.max(0, st[10] | 0);
    const heavy: HeavyBlock[] = g.structures.blocks.filter((b: HeavyBlock) => b.kind === 'heavy');
    const at = (x: number, y: number) => heavy.find((b) => b.x === x && b.y === y) || null;
    const old = p.manned;
    for (const b of heavy) b.manned = null;
    for (const q of g.remote.peers.values()) q.manned = null;
    const hv = Array.isArray(s.hv) ? s.hv : [];
    for (let i = 0; i + 4 < hv.length; i += 5) {
      const b = at(hv[i], hv[i + 1]);
      const q = g.remote.peers.get(hv[i + 3]);
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

  /* ---------- ping y diagnóstico ---------- */

  onPong(m: { c: number }) {
    const c = Number(m && m.c);
    if (!Number.isFinite(c)) return;
    const rtt = performance.now() - c;
    if (rtt < 0 || rtt > 30000) return;
    // variación del RTT (jitter): media móvil de la diferencia entre medidas seguidas
    if (this.rtt) this.jitter += (Math.abs(rtt - this.rtt) - this.jitter) / 8;
    this.rtt = rtt;
  }

  // Texto corto del indicador (una vez por segundo) y, si está abierto, el panel de diagnóstico.
  stats(dt: number) {
    const r = this.game.remote.net.tick(dt);
    if (!r) return null;
    const { secs, fps, per } = r;
    const kin = this.bytesIn / 1024 / secs;
    const kout = this.bytesOut / 1024 / secs;
    this.bytesIn = 0;
    this.bytesOut = 0;
    const c = {
      n: this.corr.n,
      avg: this.corr.n ? this.corr.sum / this.corr.n : 0,
      max: this.corr.max,
      snaps: this.corr.snaps,
    };
    this.corr = { n: 0, sum: 0, max: 0, snaps: 0 };
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
        `Entradas sin confirmar: ${this.rec ? this.rec.pendingCount : 0} · FPS ${fps}`,
        'Pérdida de paquetes: no se mide (WebSocket va sobre TCP y la oculta con reenvíos).',
      ]
        .filter(Boolean)
        .join('\n');
    }
    if (this.reconnecting) return 'Reconectando…';
    return `En línea · RTT ${Math.round(this.rtt)} ms (±${Math.round(this.jitter)}) · ${per} act/s · ${fps} FPS`;
  }
}

export function validName(s: unknown) {
  return NAME_RE.test(String(s || '').trim());
}

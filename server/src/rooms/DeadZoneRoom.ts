// Sala privada de hasta MAX_PLAYERS jugadores (4 por defecto, como mucho 10): lobby (listos, propietario), carga del mapa, partida
// autoritativa y resultados. La identidad de cada jugador es su sessionId de Colyseus: al
// reconectar con su token recupera el mismo sitio y el mismo personaje.
import { randomInt } from 'node:crypto';
import { Room, ServerError, type Client, type AuthContext } from '@colyseus/core';
import { LobbyState, Member, type MemberT, type LobbyStateT } from './state.ts';
import { ServerSim } from '../sim/ServerSim.ts';
import { CONFIG, originAllowed } from '../config.ts';
import { cleanName, cleanLookCode, cleanClass, cleanCmd, cleanAct, cleanView, Bucket, type Cmd } from '../validate.ts';
import { STATS, countTick } from '../stats.ts';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
const live = new Set<string>();

// Códigos de cierre propios (los de 4000 a 4010 los usa Colyseus: 4003 es «no se pudo reconectar»).
export const KICKED = 4100; // mandaba datos no válidos
export const IDLE = 4101; // sala cerrada por inactividad

// Código de sala impredecible (crypto) y único en este servidor.
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < CODE_LEN; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
    if (!live.has(c)) return c;
  }
}

// strikes: faltas recientes (se olvidan a STRIKE_FORGET por segundo); bad: faltas en total
type Limits = { inp: Bucket; cmds: Bucket; adm: Bucket; shop: Bucket; act: Bucket; ping: Bucket; strikes: number; strikeAt: number; bad: number };
const STRIKE_FORGET = 10;
const STRIKE_KICK = 200;

export class DeadZoneRoom extends Room<{ state: LobbyStateT }> {
  maxClients = CONFIG.maxPlayers;
  sim: ServerSim | null = null;
  seed = 0;
  // mundo de la próxima partida, armado durante la carga
  next: ServerSim | null = null;
  nextIdx = 1;
  limits = new Map<string, Limits>();
  loaded = new Set<string>();
  loadUntil = 0;
  acc = 0;
  emptySince = 0;
  // ¿llegó a entrar alguien? Si no, la sala se borra al caducar la reserva (ver update)
  joined = false;
  // última vez que hubo partida (o se creó la sala): para cerrar las salas olvidadas
  activeAt = Date.now();
  syncT = 0;
  snapRound = 0;
  snapEvery = Math.max(1, Math.round(CONFIG.tickHz / CONFIG.snapHz));

  onCreate() {
    // tope de salas a la vez: lo comprueba antes de reservar nada (no hay await, así que dos
    // creaciones simultáneas no pueden pasar las dos con el último cupo)
    if (live.size >= CONFIG.maxRooms) throw new ServerError(503, 'servidor-lleno');
    this.roomId = newCode();
    live.add(this.roomId);
    STATS.rooms++;
    this.setPrivate(true);
    // la sala vacía no se borra al instante: espera CONFIG.emptyRoomSeconds (ver update)
    this.autoDispose = false;
    this.emptySince = Date.now();
    this.state = new LobbyState({ phase: 'waiting', ownerId: '', code: this.roomId, maxPlayers: this.maxClients, wave: 0 });
    this.setPatchRate(100);

    this.onMessage('ready', (c, m) => this.admin(c, () => {
      const mb = this.member(c);
      if (mb && (this.phase === 'waiting' || this.phase === 'finished')) mb.ready = !!(m && m.v);
    }));
    // clase para la próxima partida (se elige en el lobby)
    this.onMessage('cls', (c, m) => this.admin(c, () => {
      const mb = this.member(c);
      const cls = cleanClass(m && m.v);
      if (mb && cls && (this.phase === 'waiting' || this.phase === 'finished')) mb.cls = cls;
    }));
    this.onMessage('start', (c) => this.admin(c, () => this.start(c)));
    this.onMessage('lobby', (c) => this.admin(c, () => this.backToLobby(c)));
    this.onMessage('loaded', (c) => this.admin(c, () => {
      if (this.phase !== 'loading') return;
      this.loaded.add(c.sessionId);
      this.maybeGo();
    }));
    this.onMessage('next', (c) => this.admin(c, () => {
      if (this.phase === 'playing' && this.sim && this.member(c)?.inGame) this.sim.nextRound();
    }));
    // elegir mejora y comprar: el servidor comprueba nivel, dinero y momento (entre oleadas)
    this.onMessage('pick', (c, m) => this.shopMsg(c, () => {
      if (!m || !Number.isInteger(m.i) || !Number.isInteger(m.n)) return this.strike(c, 'mejora mal formada');
      this.sim!.pick(c.sessionId, m.i, m.n);
    }));
    this.onMessage('buy', (c, m) => this.shopMsg(c, () => {
      if (!m || typeof m.k !== 'string' || typeof m.id !== 'string') return this.strike(c, 'compra mal formada');
      this.sim!.shop(c.sessionId, m.k, m.id, Number(m.n) | 0);
    }));
    // construir, lanzar y subir al robot: se hacen en el paso de la entrada que indica (s)
    this.onMessage('act', (c, m) => {
      const l = this.limits.get(c.sessionId);
      if (!l || !this.sim || this.phase !== 'playing' || !this.member(c)?.inGame) return;
      if (!l.act.take()) return this.strike(c, 'demasiadas acciones');
      const a = cleanAct(m);
      if (!a) return this.strike(c, 'acción mal formada');
      this.sim.act(c.sessionId, a);
    });
    this.onMessage('in', (c, m) => this.input(c, m));
    this.onMessage('p', (c, m) => {
      const l = this.limits.get(c.sessionId);
      if (!l || !l.ping.take()) return;
      const t = m && Number.isFinite(m.c) ? m.c : 0;
      c.send('p', { c: t, s: Math.round(performance.now()) });
      const v = cleanView(m && m.v);
      if (v && this.sim) this.sim.setView(c.sessionId, v[0], v[1]);
    });
    this.onMessage('*', (c, type) => this.strike(c, `mensaje desconocido: ${String(type).slice(0, 20)}`));

    this.setSimulationInterval((dt) => this.update(dt), 1000 / CONFIG.tickHz);
  }

  // Cambia la simulación de la sala y lleva la cuenta de las que están simulando.
  setSim(sim: ServerSim | null) {
    if (!this.sim && sim) STATS.simRooms++;
    else if (this.sim && !sim) STATS.simRooms = Math.max(0, STATS.simRooms - 1);
    this.sim = sim;
  }

  get phase() {
    return this.state.phase as 'waiting' | 'loading' | 'playing' | 'finished';
  }

  member(c: Client): MemberT | undefined {
    return this.state.members.get(c.sessionId);
  }

  /* ---------- entrada a la sala ---------- */

  // Se ejecuta en la petición HTTP de búsqueda de sala, antes de crearla o reservar el sitio:
  // así una página no permitida no puede ni ocupar uno de los cupos de MAX_ROOMS. Sin esa
  // reserva no se puede abrir el WebSocket de la sala.
  static async onAuth(_token: string, options: any, context: AuthContext) {
    if (!originAllowed(context.headers.get('origin'))) throw new ServerError(403, 'origen');
    const name = cleanName(options && options.name);
    if (!name) throw new ServerError(400, 'nombre');
    return { name, look: cleanLookCode(options && options.look), cls: cleanClass(options && options.cls) };
  }

  onJoin(client: Client, _options: any, auth: { name: string; look?: string; cls?: string }) {
    const m = new Member({ name: auth.name, look: auth.look || '', cls: auth.cls || '', idx: this.nextIdx++, ready: false, connected: true, inGame: false, alive: false, kills: 0, joinedAt: Date.now() });
    this.state.members.set(client.sessionId, m);
    if (!this.state.ownerId) this.state.ownerId = client.sessionId;
    this.limits.set(client.sessionId, {
      // mensajes de entrada por segundo: el navegador manda uno por fotograma con entradas (~60)
      inp: new Bucket(90, 60),
      cmds: new Bucket(80, 40), // entradas sueltas por segundo (60 Hz + margen)
      adm: new Bucket(3, 6), // listo, iniciar, siguiente…
      shop: new Bucket(8, 16), // compras y mejoras (clics seguidos en la tienda)
      act: new Bucket(6, 10), // construir, lanzar, robot
      ping: new Bucket(4, 4),
      strikes: 0,
      strikeAt: performance.now(),
      bad: 0,
    });
    STATS.players++;
    this.joined = true;
    // a mitad de partida se espera en la sala: entrar sin más rompería la oleada en curso
    if (this.phase === 'loading' || this.phase === 'playing') client.send('notice', { m: 'Partida en curso: entrarás en la siguiente' });
  }

  onDrop(client: Client) {
    const m = this.member(client);
    if (m) m.connected = false;
    this.sim?.setAway(client.sessionId, true);
    // si la sala se está cerrando (inactividad, reinicio) no hay a dónde volver
    this.allowReconnection(client, CONFIG.reconnectSeconds).catch(() => {});
  }

  onReconnect(client: Client) {
    const m = this.member(client);
    if (m) m.connected = true;
    this.sim?.setAway(client.sessionId, false);
    // resincronización completa: fase, mapa y (si juega) la foto siguiente le llega sola
    client.send('resume', { phase: this.phase, seed: this.seed, inGame: !!(m && m.inGame) });
  }

  onLeave(client: Client) {
    const id = client.sessionId;
    this.state.members.delete(id);
    this.limits.delete(id);
    this.loaded.delete(id);
    this.sim?.remove(id);
    STATS.players = Math.max(0, STATS.players - 1);
    if (this.state.ownerId === id) {
      // propiedad para el más antiguo, prefiriendo a quien siga conectado
      const rest = [...this.state.members.entries()].sort((a, b) => Number(b[1].connected) - Number(a[1].connected) || a[1].joinedAt - b[1].joinedAt);
      this.state.ownerId = rest.length ? rest[0][0] : '';
    }
    if (this.phase === 'loading') this.maybeGo();
  }

  onDispose() {
    // una sala rechazada en onCreate (servidor lleno) también pasa por aquí: no cuenta
    if (!live.delete(this.roomId)) return;
    this.setSim(null);
    STATS.rooms = Math.max(0, STATS.rooms - 1);
  }

  onBeforeShutdown() {
    this.broadcast('shutdown', { m: 'El servidor se está reiniciando' });
    this.disconnect();
  }

  onUncaughtException(err: Error, method: string) {
    // un mensaje raro no debe tirar el proceso; no se registran tokens ni contenido
    console.error(`[sala ${this.roomId}] error en ${method}: ${err && err.message}`);
  }

  /* ---------- mensajes ---------- */

  strike(c: Client, why: string) {
    const l = this.limits.get(c.sessionId);
    if (!l) return;
    // sólo expulsa a quien manda basura de forma sostenida, no por tirones sueltos de la red
    const now = performance.now();
    l.strikes = Math.max(0, l.strikes - ((now - l.strikeAt) / 1000) * STRIKE_FORGET) + 1;
    l.strikeAt = now;
    l.bad++;
    if (l.bad === 1 || l.bad % 50 === 0) console.warn(`[sala ${this.roomId}] ${c.sessionId}: ${why} (${l.bad})`);
    if (l.strikes > STRIKE_KICK) c.leave(KICKED);
  }

  admin(c: Client, fn: () => void) {
    const l = this.limits.get(c.sessionId);
    if (!l) return;
    if (!l.adm.take()) return this.strike(c, 'demasiados mensajes');
    fn();
  }

  shopMsg(c: Client, fn: () => void) {
    const l = this.limits.get(c.sessionId);
    if (!l || !this.sim || this.phase !== 'playing' || !this.member(c)?.inGame) return;
    if (!l.shop.take()) return this.strike(c, 'demasiadas compras');
    fn();
  }

  input(c: Client, m: any) {
    const l = this.limits.get(c.sessionId);
    if (!l || !this.sim || this.phase !== 'playing') return;
    if (!l.inp.take()) return this.strike(c, 'demasiadas entradas');
    if (!m || !Array.isArray(m.i) || m.i.length === 0 || m.i.length > 10) return this.strike(c, 'entrada mal formada');
    const slot = this.sim.slots.get(c.sessionId);
    if (!slot) return;
    const cmds: Cmd[] = [];
    for (const raw of m.i) {
      const cmd = cleanCmd(raw);
      if (!cmd) {
        this.strike(c, 'entrada inválida');
        continue;
      }
      // demasiado adelantada respecto a lo ya recibido: se rechaza
      const top = slot.queue.length ? slot.queue[slot.queue.length - 1].s : slot.ack;
      if (cmd.s > top + 240) {
        this.strike(c, 'secuencia adelantada');
        continue;
      }
      if (!l.cmds.take()) {
        this.strike(c, 'demasiadas entradas');
        break;
      }
      cmds.push(cmd);
    }
    if (cmds.length) this.sim.push(c.sessionId, cmds);
  }

  /* ---------- fases ---------- */

  start(c: Client) {
    if (c.sessionId !== this.state.ownerId) return c.send('error', { m: 'Sólo el propietario puede iniciar la partida' });
    if (this.phase !== 'waiting' && this.phase !== 'finished') return;
    const others = [...this.state.members.entries()].filter(([id, m]) => id !== this.state.ownerId && m.connected);
    if (others.some(([, m]) => !m.ready)) return c.send('error', { m: 'Faltan jugadores por estar listos' });
    this.seed = randomInt(1, 2 ** 31 - 1);
    this.loaded.clear();
    for (const m of this.state.members.values()) m.inGame = m.connected;
    this.state.phase = 'loading';
    this.state.wave = 0;
    this.loadUntil = Date.now() + CONFIG.loadSeconds * 1000;
    const ids = [...this.state.members.entries()].filter(([, m]) => m.inGame).map(([id]) => id);
    // después del próximo parche: así el cliente ya ve la fase y quién juega
    this.broadcast('load', { seed: this.seed, ids }, { afterNextPatch: true });
    // el mundo del servidor se arma mientras los celulares cargan (así no frena al empezar)
    this.setSim(null);
    this.next = new ServerSim(this.seed, ids.map((id) => {
      const m = this.state.members.get(id)!;
      return { id, idx: m.idx, name: m.name, cls: m.cls };
    }));
  }

  maybeGo() {
    if (this.phase !== 'loading') return;
    const ids = [...this.state.members.entries()].filter(([, m]) => m.inGame).map(([id]) => id);
    if (ids.length && ids.some((id) => !this.loaded.has(id)) && Date.now() < this.loadUntil) return;
    this.go();
  }

  go() {
    const players = [...this.state.members.entries()]
      .filter(([id, m]) => m.inGame && (this.loaded.has(id) || m.connected))
      .map(([id, m]) => ({ id, idx: m.idx, name: m.name, cls: m.cls }));
    if (!players.length) return this.backToLobby(null);
    for (const [id, m] of this.state.members.entries()) {
      m.inGame = players.some((p) => p.id === id);
      m.alive = m.inGame;
      m.kills = 0;
    }
    const sim = this.next && this.next.seed === this.seed ? this.next : new ServerSim(this.seed, players);
    this.next = null;
    // quien se fue durante la carga no aparece en la partida
    for (const id of [...sim.slots.keys()]) if (!players.some((p) => p.id === id)) sim.remove(id);
    this.setSim(sim);
    for (const [id, m] of this.state.members.entries()) if (!m.connected) sim.setAway(id, true);
    this.acc = 0;
    this.state.phase = 'playing';
    this.broadcast('go', { ids: players.map((p) => p.id) }, { afterNextPatch: true });
  }

  finish() {
    const res = this.sim ? this.sim.results() : null;
    this.setSim(null);
    this.state.phase = 'finished';
    for (const m of this.state.members.values()) {
      m.inGame = false;
      m.ready = false;
    }
    this.broadcast('results', res, { afterNextPatch: true });
  }

  backToLobby(c: Client | null) {
    if (c && c.sessionId !== this.state.ownerId) return c.send('error', { m: 'Sólo el propietario puede volver a la sala' });
    if (c && this.phase !== 'finished') return;
    this.setSim(null);
    this.next = null;
    this.state.phase = 'waiting';
    for (const m of this.state.members.values()) {
      m.inGame = false;
      m.ready = false;
    }
  }

  /* ---------- bucle ---------- */

  update(dtMs: number) {
    const now = Date.now();
    // sala sin nadie conectado: se borra pasado un rato
    const anyone = [...this.state.members.values()].some((m) => m.connected);
    if (anyone) this.emptySince = 0;
    else if (!this.emptySince) this.emptySince = now;
    else if (now - this.emptySince > (this.joined ? CONFIG.emptyRoomSeconds : Math.min(CONFIG.emptyRoomSeconds, this.seatReservationTimeout + 2)) * 1000) {
      this.disconnect();
      return;
    }
    // sin partida durante mucho rato: la sala se cierra y deja libre su cupo
    if (this.phase === 'loading' || this.phase === 'playing') this.activeAt = now;
    else if (now - this.activeAt > CONFIG.idleRoomMinutes * 60000) {
      this.disconnect(IDLE);
      return;
    }
    if (this.phase === 'loading' && now >= this.loadUntil) this.go();
    if (this.phase !== 'playing' || !this.sim) return;
    const sim = this.sim;
    const step = 1 / CONFIG.tickHz;
    this.acc += Math.min(dtMs, 1000) / 1000;
    let n = 0;
    while (this.acc >= step && n < CONFIG.maxCatchup) {
      const t0 = performance.now();
      sim.step();
      countTick(performance.now() - t0);
      this.acc -= step;
      n++;
      if (sim.tick % this.snapEvery === 0) this.sendSnaps();
      if (sim.over) return this.finish();
    }
    // tras una pausa larga no se intenta recuperar todo: se descarta el atraso
    if (this.acc >= step) {
      STATS.skipped += Math.floor(this.acc / step);
      this.acc = 0;
    }
    this.syncT += dtMs;
    if (this.syncT >= 500) {
      this.syncT = 0;
      this.state.wave = sim.director.wave;
      for (const [id, m] of this.state.members.entries()) {
        const s = sim.slots.get(id);
        if (!s) continue;
        m.alive = s.p.alive;
        m.kills = s.kills;
      }
    }
  }

  sendSnaps() {
    const sim = this.sim!;
    const now = performance.now();
    const dg = ++this.snapRound % (CONFIG.snapHz * 2) === 0 ? { hz: STATS.hz, ms: STATS.tickMs, mx: STATS.tickMax, rooms: STATS.rooms, players: STATS.players, skip: STATS.skipped, cpu: STATS.cpu } : null;
    for (const c of this.clients) {
      const snap = sim.snapshot(c.sessionId, now);
      if (!snap) continue;
      if (dg) snap.dg = dg;
      c.send('snap', snap);
    }
    sim.flushFx();
  }
}

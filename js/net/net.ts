// Conexión entre 2 jugadores (cooperativo): la sala se crea con un código de 4 letras.
//
// Todo el juego va directo entre los celulares (WebRTC, P2P). Firebase sólo sirve para
// presentarlos: el anfitrión deja su "dirección" (oferta) en la sala, el invitado deja la suya
// (respuesta) y, en cuanto se abre la conexión directa, la sala se borra.
// Si la red no deja conectar directo (pasa en algunas redes móviles), no se puede jugar.
import { ONLINE } from '../core/config.ts';

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_TTL = 15 * 60 * 1000;
// tiempo máximo para que se abra la conexión directa
const OPEN_LIMIT = 15000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const base = () => ONLINE.url.replace(/\/$/, '');
const url = (path: string) => `${base()}/rooms/${path}.json`;

/** Lo que se guarda en la sala de Firebase mientras se presentan los dos celulares. */
type Room = { t?: number; offer?: string; answer?: string | null; joined?: number; connected?: boolean };

async function db(path: string, method = 'GET', body?: unknown): Promise<Room | null> {
  const r = await window.fetch(url(path), { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'permiso' : 'red');
  return r.json();
}

// Espera (poco) a que el navegador junte sus rutas de conexión directa.
function gathered(pc: RTCPeerConnection, limit = 2500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve) => {
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') resolve();
    });
    setTimeout(resolve, limit);
  });
}

export class Net {
  declare role: 'host' | 'guest' | null;
  declare code: string | null;
  declare pc: RTCPeerConnection | null;
  declare rel: RTCDataChannel | null;
  declare fast: RTCDataChannel | null;
  declare open: boolean;
  declare onMessage: ((m: unknown) => void) | null;
  declare onClose: (() => void) | null;
  declare cancelled: boolean;
  declare lastRecv: number;
  constructor() {
    this.role = null; // 'host' | 'guest'
    this.code = null;
    this.pc = null;
    this.rel = null;
    this.fast = null;
    this.open = false;
    this.onMessage = null;
    this.onClose = null;
    this.cancelled = false;
    this.lastRecv = 0;
  }

  get available() {
    return !!ONLINE.url && typeof window.RTCPeerConnection === 'function';
  }

  // ¿Están abiertos los dos canales directos?
  get direct() {
    return !!(this.rel && this.fast && this.rel.readyState === 'open' && this.fast.readyState === 'open');
  }

  makePc() {
    try {
      this.pc = new window.RTCPeerConnection({ iceServers: ICE });
    } catch {
      this.pc = null;
      throw new Error('directa');
    }
    const pc = this.pc;
    pc.addEventListener('connectionstatechange', () => {
      if (pc === this.pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) this.lost();
    });
    return pc;
  }

  wire(ch: RTCDataChannel) {
    ch.addEventListener('message', (e: MessageEvent) => this.receive(e.data));
    if (ch.label === 'rel') ch.addEventListener('close', () => this.lost());
  }

  receive(text: string) {
    let m: unknown;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    this.lastRecv = performance.now();
    if (this.onMessage) this.onMessage(m);
  }

  // Espera a que se abra la conexión directa; si no se logra a tiempo, falla.
  async opened() {
    const t0 = performance.now();
    for (;;) {
      if (this.cancelled) throw new Error('cancelado');
      if (this.direct) break;
      const pc = this.pc;
      const st = pc && (pc.connectionState || pc.iceConnectionState);
      if (!pc || st === 'failed' || st === 'closed' || performance.now() - t0 > OPEN_LIMIT) throw new Error('directa');
      await sleep(100);
    }
    this.open = true;
    this.lastRecv = performance.now();
  }

  /* ---------- sala ---------- */

  // Anfitrión: crea la sala y espera a que alguien se una (onCode recibe el código).
  async host(onCode: (code: string) => void) {
    this.role = 'host';
    this.cancelled = false;
    const pc = this.makePc();
    this.rel = pc.createDataChannel('rel');
    this.fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
    this.wire(this.rel);
    this.wire(this.fast);
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    const offer = pc.localDescription.sdp;
    let code = '';
    for (let tries = 0; tries < 8; tries++) {
      code = Array.from({ length: 4 }, () => LETTERS[(Math.random() * LETTERS.length) | 0]).join('');
      const old = await db(code);
      if (!old || Date.now() - (old.t || 0) > ROOM_TTL) break;
    }
    this.code = code;
    await db(code, 'PUT', { t: Date.now(), offer });
    onCode(code);
    // esperar a que entre el invitado
    let room: Room | null = null;
    for (;;) {
      if (this.cancelled) throw new Error('cancelado');
      await sleep(900);
      room = await db(code).catch((): Room | null => null);
      if (room && room.joined) break;
    }
    await db(`${code}/connected`, 'PUT', true);
    if (!room.answer) throw new Error('directa');
    await pc.setRemoteDescription({ type: 'answer', sdp: room.answer }).catch(() => {
      throw new Error('directa');
    });
    await this.opened();
    // ya conectados: la sala no hace falta
    db(code, 'DELETE').catch(() => {});
  }

  // Invitado: se une a la sala con el código.
  async join(code: string) {
    this.role = 'guest';
    this.cancelled = false;
    code = String(code || '')
      .trim()
      .toUpperCase();
    const room = await db(code);
    if (!room || Date.now() - (room.t || 0) > ROOM_TTL) throw new Error('no-existe');
    if (room.connected) throw new Error('llena');
    if (!room.offer) throw new Error('directa');
    this.code = code;
    const pc = this.makePc();
    pc.addEventListener('datachannel', (e: RTCDataChannelEvent) => {
      if (e.channel.label === 'rel') this.rel = e.channel;
      else this.fast = e.channel;
      this.wire(e.channel);
    });
    let answer: string | null = null;
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: room.offer });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      answer = pc.localDescription.sdp;
    } catch {
      answer = null;
    }
    await db(code, 'PATCH', { answer, joined: Date.now() });
    if (!answer) throw new Error('directa');
    await this.opened();
  }

  // fiable y en orden (eventos) o rápido sin reintentos (estado que se repite)
  send(m: object, fast = false) {
    if (!this.open || !this.direct) return;
    const ch = fast ? this.fast : this.rel;
    // si el canal rápido está saturado, se salta este estado (llegará el siguiente)
    if (fast && ch.bufferedAmount > 256 * 1024) return;
    try {
      ch.send(JSON.stringify(m));
    } catch {
      if (!fast) this.lost();
    }
  }

  // Si lleva un rato sin llegar nada del otro, se da por perdida la conexión.
  check() {
    if (this.open && performance.now() - this.lastRecv > 15000) this.lost();
  }

  lost() {
    if (!this.open) return;
    this.open = false;
    if (this.onClose) this.onClose();
  }

  close() {
    this.cancelled = true;
    this.open = false;
    if (this.role === 'host' && this.code) db(this.code, 'DELETE').catch(() => {});
    const pc = this.pc;
    this.pc = null;
    try {
      if (pc) pc.close();
    } catch {
      /* ya cerrado */
    }
    this.rel = null;
    this.fast = null;
    this.role = null;
    this.code = null;
  }
}

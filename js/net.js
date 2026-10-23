// Conexión entre 2 jugadores (cooperativo): la sala se crea con un código de 4 letras.
//
// Dos caminos a la vez:
//  1. Directo entre los celulares (WebRTC): el más rápido, pero en muchas redes móviles no
//     se logra porque los operadores no dejan entrar conexiones.
//  2. Por Firebase (la misma base de la clasificación): siempre funciona. Cada lado escribe
//     sus mensajes en la sala y el otro los recibe al instante (EventSource / streaming REST).
// Mientras el directo no esté abierto, todo va por Firebase; si se abre, se usa el directo.
import { ONLINE } from './config.js';

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_TTL = 15 * 60 * 1000;
// por Firebase, el estado rápido (fotos del mundo / controles) se manda como mucho así de seguido
const RELAY_GAP = { host: 120, guest: 90 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = () => ONLINE.url.replace(/\/$/, '');
const url = (path) => `${base()}/rooms/${path}.json`;

async function db(path, method = 'GET', body) {
  const r = await window.fetch(url(path), { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'permiso' : 'red');
  return r.json();
}

// Espera (poco) a que el navegador junte sus rutas de conexión directa.
function gathered(pc, limit = 2500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') resolve();
    });
    setTimeout(resolve, limit);
  });
}

export class Net {
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
    this.streams = [];
    this.lastRecv = 0;
  }

  get available() {
    return !!ONLINE.url && typeof window.EventSource === 'function';
  }

  // ¿Ya funciona la conexión directa?
  get direct() {
    return !!(this.rel && this.fast && this.rel.readyState === 'open' && this.fast.readyState === 'open');
  }

  /* ---------- conexión directa (opcional) ---------- */

  makePc() {
    if (typeof window.RTCPeerConnection !== 'function' || ONLINE.p2p === false) return null;
    try {
      this.pc = new window.RTCPeerConnection({ iceServers: ICE });
    } catch {
      this.pc = null;
    }
    return this.pc;
  }

  wire(ch) {
    ch.addEventListener('message', (e) => this.receive(e.data));
  }

  receive(text) {
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    this.lastRecv = performance.now();
    if (m && m.t === 'batch' && Array.isArray(m.m)) {
      for (const x of m.m) if (typeof x === 'string') this.receive(x);
      return;
    }
    if (this.onMessage) this.onMessage(m);
  }

  /* ---------- por Firebase ---------- */

  // Escucha en tiempo real lo que escribe el otro jugador.
  listen() {
    const other = this.role === 'host' ? 'g' : 'h';
    // estado rápido: un solo valor que se sobrescribe
    this.stream(`${this.code}/relay/${other}f`, (path, data) => {
      if (path === '/' && typeof data === 'string') this.receive(data);
    });
    // eventos fiables: una lista; se procesan en orden y se borran ya leídos
    const seen = new Set();
    this.stream(`${this.code}/relay/${other}r`, (path, data) => {
      const items = path === '/' ? (data && typeof data === 'object' ? data : {}) : { [path.slice(1)]: data };
      for (const k of Object.keys(items).sort()) {
        if (seen.has(k) || typeof items[k] !== 'string') continue;
        seen.add(k);
        this.receive(items[k]);
        this.trash = this.trash || {};
        this.trash[k] = null;
      }
    });
    // limpieza de los eventos ya leídos
    this.trashT = window.setInterval(() => {
      if (!this.trash || !Object.keys(this.trash).length) return;
      const t = this.trash;
      this.trash = {};
      window.fetch(url(`${this.code}/relay/${other}r`), { method: 'PATCH', body: JSON.stringify(t) }).catch(() => {});
    }, 3000);
    this.lastRecv = performance.now();
  }

  stream(path, fn) {
    const es = new window.EventSource(url(path));
    const handle = (e) => {
      let d;
      try {
        d = JSON.parse(e.data);
      } catch {
        return;
      }
      if (d && typeof d.path === 'string') fn(d.path, d.data);
    };
    es.addEventListener('put', handle);
    es.addEventListener('patch', handle);
    es.addEventListener('cancel', () => {
      this.error = 'permiso';
    });
    this.streams.push(es);
  }

  relaySend(m, fast) {
    const me = this.role === 'host' ? 'h' : 'g';
    const text = JSON.stringify(m);
    if (fast) {
      // sólo la última foto importa: si hay un envío en curso, se guarda para después
      this.pendingFast = text;
      this.flushFast(me);
      return;
    }
    // los eventos van en fila, uno detrás de otro, para que lleguen en orden
    this.queue = this.queue || [];
    this.queue.push(text);
    this.flushQueue(me);
  }

  async flushFast(me) {
    if (this.fastBusy || !this.pendingFast) return;
    const wait = (this.fastAt || 0) + RELAY_GAP[this.role] - performance.now();
    this.fastBusy = true;
    if (wait > 0) await sleep(wait);
    const text = this.pendingFast;
    this.pendingFast = null;
    this.fastAt = performance.now();
    try {
      if (text && this.open) await window.fetch(url(`${this.code}/relay/${me}f`), { method: 'PUT', body: JSON.stringify(text) });
    } catch {
      /* se reintenta con la siguiente foto */
    }
    this.fastBusy = false;
    if (this.pendingFast) this.flushFast(me);
  }

  async flushQueue(me) {
    if (this.queueBusy) return;
    this.queueBusy = true;
    while (this.queue.length && this.open) {
      // se juntan varios eventos en un solo envío
      const batch = this.queue.splice(0, 20);
      const text = batch.length === 1 ? batch[0] : JSON.stringify({ t: 'batch', m: batch });
      try {
        await window.fetch(url(`${this.code}/relay/${me}r`), { method: 'POST', body: JSON.stringify(text) });
      } catch {
        this.queue.unshift(...batch);
        await sleep(800);
      }
    }
    this.queueBusy = false;
  }

  /* ---------- sala ---------- */

  // Anfitrión: crea la sala y espera a que alguien se una (onCode recibe el código).
  async host(onCode) {
    this.role = 'host';
    this.cancelled = false;
    const pc = this.makePc();
    let offer = null;
    if (pc) {
      this.rel = pc.createDataChannel('rel');
      this.fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
      this.wire(this.rel);
      this.wire(this.fast);
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      offer = pc.localDescription.sdp;
    }
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
    let room = null;
    for (;;) {
      if (this.cancelled) throw new Error('cancelado');
      await sleep(900);
      room = await db(code).catch(() => null);
      if (room && room.joined) break;
    }
    await db(`${code}/connected`, 'PUT', true);
    this.open = true;
    this.listen();
    // la conexión directa se intenta en segundo plano
    if (pc && room.answer) pc.setRemoteDescription({ type: 'answer', sdp: room.answer }).catch(() => {});
  }

  // Invitado: se une a la sala con el código.
  async join(code) {
    this.role = 'guest';
    this.cancelled = false;
    code = String(code || '').trim().toUpperCase();
    const room = await db(code);
    if (!room || Date.now() - (room.t || 0) > ROOM_TTL) throw new Error('no-existe');
    if (room.connected) throw new Error('llena');
    this.code = code;
    let answer = null;
    const pc = room.offer ? this.makePc() : null;
    if (pc) {
      pc.addEventListener('datachannel', (e) => {
        if (e.channel.label === 'rel') this.rel = e.channel;
        else this.fast = e.channel;
        this.wire(e.channel);
      });
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: room.offer });
        await pc.setLocalDescription(await pc.createAnswer());
        await gathered(pc);
        answer = pc.localDescription.sdp;
      } catch {
        answer = null;
      }
    }
    this.open = true;
    this.listen();
    await db(code, 'PATCH', { answer, joined: Date.now() });
  }

  // fiable y en orden (eventos) o rápido sin reintentos (estado que se repite)
  send(m, fast = false) {
    if (!this.open) return;
    if (this.direct) {
      const ch = fast ? this.fast : this.rel;
      // si el canal rápido está saturado, se salta este estado (llegará el siguiente)
      if (fast && ch.bufferedAmount > 256 * 1024) return;
      try {
        ch.send(JSON.stringify(m));
        return;
      } catch {
        /* cae al envío por Firebase */
      }
    }
    this.relaySend(m, fast);
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
    for (const es of this.streams) es.close();
    this.streams = [];
    window.clearInterval(this.trashT);
    if (this.role === 'host' && this.code) db(this.code, 'DELETE').catch(() => {});
    try {
      if (this.pc) this.pc.close();
    } catch {
      /* ya cerrado */
    }
    this.pc = null;
    this.rel = null;
    this.fast = null;
    this.role = null;
    this.queue = [];
    this.pendingFast = null;
  }
}

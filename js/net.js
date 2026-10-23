// Conexión entre 2 jugadores (cooperativo): la sala se crea con un código de 4 letras.
// Firebase (la misma base de la clasificación, API REST) sólo sirve para intercambiar la
// "dirección" de cada celular (oferta/respuesta WebRTC). Después los dos hablan directo
// (peer-to-peer) por dos canales: uno fiable para eventos y otro rápido para el estado.
import { ONLINE } from './config.js';

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_TTL = 15 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = () => ONLINE.url.replace(/\/$/, '');

async function db(path, method = 'GET', body) {
  const r = await window.fetch(`${base()}/rooms/${path}.json`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'permiso' : 'red');
  return r.json();
}

// Espera a que el navegador junte todas sus rutas de conexión (sin enviar candidatos sueltos).
function gathered(pc, limit = 4000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === 'complete') resolve();
    };
    pc.addEventListener('icegatheringstatechange', done);
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
  }

  get available() {
    return !!ONLINE.url && typeof window.RTCPeerConnection === 'function';
  }

  makePc() {
    const pc = new window.RTCPeerConnection({ iceServers: ICE });
    pc.addEventListener('connectionstatechange', () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState) && this.open) this.lost();
    });
    this.pc = pc;
    return pc;
  }

  wire(ch) {
    ch.addEventListener('message', (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (this.onMessage) this.onMessage(m);
    });
    ch.addEventListener('close', () => this.open && this.lost());
  }

  ready() {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.rel && this.fast && this.rel.readyState === 'open' && this.fast.readyState === 'open') {
          this.open = true;
          resolve();
        }
      };
      const t = window.setInterval(() => {
        if (this.cancelled) {
          window.clearInterval(t);
          reject(new Error('cancelado'));
        }
        check();
        if (this.open) window.clearInterval(t);
      }, 100);
      setTimeout(() => {
        window.clearInterval(t);
        if (!this.open) reject(new Error('tiempo'));
      }, 25000);
    });
  }

  // Anfitrión: crea la sala y espera a que alguien se una (onCode recibe el código).
  async host(onCode) {
    this.role = 'host';
    this.cancelled = false;
    const pc = this.makePc();
    this.rel = pc.createDataChannel('rel');
    this.fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
    this.wire(this.rel);
    this.wire(this.fast);
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    let code = '';
    for (let tries = 0; tries < 6; tries++) {
      code = Array.from({ length: 4 }, () => LETTERS[(Math.random() * LETTERS.length) | 0]).join('');
      const old = await db(code);
      if (!old || Date.now() - (old.t || 0) > ROOM_TTL) break;
    }
    this.code = code;
    await db(code, 'PUT', { t: Date.now(), offer: pc.localDescription.sdp });
    onCode(code);
    // esperar la respuesta del invitado
    for (;;) {
      if (this.cancelled) throw new Error('cancelado');
      await sleep(1200);
      const room = await db(code).catch(() => null);
      if (room && room.answer) {
        await pc.setRemoteDescription({ type: 'answer', sdp: room.answer });
        break;
      }
    }
    await this.ready();
    db(code, 'DELETE').catch(() => {});
  }

  // Invitado: se une a la sala con el código.
  async join(code) {
    this.role = 'guest';
    this.cancelled = false;
    code = String(code || '').trim().toUpperCase();
    const room = await db(code);
    if (!room || !room.offer || Date.now() - (room.t || 0) > ROOM_TTL) throw new Error('no-existe');
    if (room.answer) throw new Error('llena');
    this.code = code;
    const pc = this.makePc();
    pc.addEventListener('datachannel', (e) => {
      if (e.channel.label === 'rel') this.rel = e.channel;
      else this.fast = e.channel;
      this.wire(e.channel);
    });
    await pc.setRemoteDescription({ type: 'offer', sdp: room.offer });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    await db(`${code}/answer`, 'PUT', pc.localDescription.sdp);
    await this.ready();
  }

  // fiable y en orden (eventos) o rápido sin reintentos (estado que se repite)
  send(m, fast = false) {
    const ch = fast ? this.fast : this.rel;
    if (!this.open || !ch || ch.readyState !== 'open') return;
    // si el canal rápido está saturado, se salta este estado (llegará el siguiente)
    if (fast && ch.bufferedAmount > 256 * 1024) return;
    try {
      ch.send(JSON.stringify(m));
    } catch {
      /* canal cerrándose */
    }
  }

  lost() {
    if (!this.open) return;
    this.open = false;
    if (this.onClose) this.onClose();
  }

  close() {
    this.cancelled = true;
    const wasOpen = this.open;
    this.open = false;
    if (this.role === 'host' && this.code && !wasOpen) db(this.code, 'DELETE').catch(() => {});
    try {
      if (this.pc) this.pc.close();
    } catch {
      /* ya cerrado */
    }
    this.pc = null;
    this.rel = null;
    this.fast = null;
    this.role = null;
  }
}

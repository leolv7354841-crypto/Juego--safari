// Cuentas de jugador y clasificación.
// - Siempre: cuentas con nombre + PIN guardadas en este navegador, cada una con su
//   propio progreso y su mejor marca; clasificación de las cuentas de este dispositivo.
// - Abierto como Artifact de Claude con base de datos: el progreso se copia también a
//   la nube de tu cuenta de Claude y los récords van a una clasificación global.
import { storage } from './util.js';

const ACC_KEY = 'dz-accounts';
const ACTIVE_KEY = 'dz-active';
const LEGACY_SAVE = 'dz-save-v1';
const LEGACY_CHECK = 'dz-check-v1';

// Hash simple (FNV-1a) para no guardar el PIN en claro. Es una protección local,
// no una contraseña segura: cualquiera con acceso al navegador puede borrar los datos.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const keyOf = (name) => name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 24);

// Mejor marca: primero la oleada, después las bajas.
const better = (a, b) => !b || a.wave > b.wave || (a.wave === b.wave && a.kills > b.kills);

export class Accounts {
  constructor() {
    this.list = storage.get(ACC_KEY, {});
    this.active = storage.get(ACTIVE_KEY, null);
    if (this.active && !this.list[this.active]) this.active = null;
    this.cloud = null;
    this.cloudBoard = null;
  }

  get current() {
    return this.active ? this.list[this.active] : null;
  }

  saveKey() {
    return this.active ? `${LEGACY_SAVE}:${this.active}` : LEGACY_SAVE;
  }

  checkKey() {
    return this.active ? `${LEGACY_CHECK}:${this.active}` : LEGACY_CHECK;
  }

  persist() {
    storage.set(ACC_KEY, this.list);
    storage.set(ACTIVE_KEY, this.active);
  }

  // Entra a una cuenta existente o la crea. Devuelve un mensaje de error o null.
  login(name, pin) {
    const clean = (name || '').trim().replace(/\s+/g, ' ');
    if (clean.length < 3 || clean.length > 16) return 'El nombre debe tener entre 3 y 16 caracteres.';
    if (!/^[\p{L}\p{N} _-]+$/u.test(clean)) return 'Usa sólo letras, números, espacios, guion o guion bajo.';
    if (!/^\d{4}$/.test(pin || '')) return 'El PIN debe tener exactamente 4 números.';
    const key = keyOf(clean);
    const existing = this.list[key];
    if (existing) {
      if (existing.pin !== hash(key + ':' + pin)) return 'PIN incorrecto para esa cuenta.';
    } else {
      const first = !Object.keys(this.list).length;
      this.list[key] = { name: clean, pin: hash(key + ':' + pin), created: Date.now(), best: null };
      // la partida guardada antes de existir las cuentas pasa a la primera cuenta creada
      if (first) {
        const s = storage.get(LEGACY_SAVE, null);
        const c = storage.get(LEGACY_CHECK, null);
        if (s) storage.set(`${LEGACY_SAVE}:${key}`, s);
        if (c) storage.set(`${LEGACY_CHECK}:${key}`, c);
        storage.remove(LEGACY_SAVE);
        storage.remove(LEGACY_CHECK);
      }
    }
    this.active = key;
    this.persist();
    return null;
  }

  logout() {
    this.active = null;
    this.persist();
  }

  // Guarda la mejor marca de la cuenta activa (y en la nube si está disponible).
  recordScore(score) {
    const acc = this.current;
    if (!acc) return false;
    if (!better(score, acc.best)) return false;
    acc.best = { ...score, at: Date.now() };
    this.persist();
    this.pushScore(acc);
    return true;
  }

  localBoard() {
    return Object.values(this.list)
      .filter((a) => a.best)
      .map((a) => ({ name: a.name, ...a.best }))
      .sort((a, b) => b.wave - a.wave || b.kills - a.kills)
      .slice(0, 50);
  }

  /* ---------- nube (sólo como Artifact de Claude) ---------- */

  async initCloud() {
    try {
      const use = window.claude && window.claude.use;
      if (!use) return false;
      const [db, user] = await Promise.all([use('db'), use('user')]);
      if (!db || !user) return false;
      const id = await user.id();
      if (!id) return false;
      this.cloud = { db, id };
      return true;
    } catch {
      return false;
    }
  }

  async cloudSave(kind, data) {
    if (!this.cloud || !this.active) return;
    try {
      await this.cloud.db.doc(`data/users/${this.cloud.id}/${kind}-${this.active}`).set(data);
    } catch {
      /* sin permiso de escritura o sin conexión: se mantiene el guardado local */
    }
  }

  // Al morir: borra también la partida guardada en la nube.
  async cloudClear() {
    if (!this.cloud || !this.active) return;
    for (const kind of ['save', 'check']) {
      try {
        await this.cloud.db.doc(`data/users/${this.cloud.id}/${kind}-${this.active}`).delete();
      } catch {
        /* sin conexión: el guardado local ya se borró */
      }
    }
  }

  // Si la nube tiene una partida más reciente que la local, la trae a este navegador.
  async cloudPull() {
    if (!this.cloud || !this.active) return false;
    let changed = false;
    for (const [kind, key] of [['save', this.saveKey()], ['check', this.checkKey()]]) {
      try {
        const snap = await this.cloud.db.doc(`data/users/${this.cloud.id}/${kind}-${this.active}`).get();
        if (!snap.exists) continue;
        const remote = snap.data();
        const local = storage.get(key, null);
        if (!local || (remote.savedAt || 0) > (local.savedAt || 0)) {
          storage.set(key, remote);
          changed = true;
        }
      } catch {
        /* sin conexión */
      }
    }
    return changed;
  }

  async pushScore(acc) {
    if (!this.cloud || !acc.best) return;
    try {
      const ref = this.cloud.db.doc(`leaderboard/${this.cloud.id}`);
      const snap = await ref.get();
      const prev = snap.exists ? snap.data() : null;
      if (prev && !better(acc.best, prev)) return;
      await ref.set({ name: acc.name.slice(0, 16), wave: acc.best.wave, kills: acc.best.kills, time: acc.best.time, level: acc.best.level, at: Date.now() });
    } catch {
      /* los visitantes de sólo lectura no pueden escribir en la clasificación global */
    }
  }

  async globalBoard() {
    if (!this.cloud) return null;
    try {
      const snap = await this.cloud.db.collection('leaderboard').orderBy('wave', 'desc').limit(100).get();
      return snap.docs
        .map((d) => d.data())
        .filter((d) => d && typeof d.wave === 'number')
        .sort((a, b) => b.wave - a.wave || b.kills - a.kills)
        .slice(0, 50);
    } catch {
      return null;
    }
  }
}

// Efectos de sonido sintetizados con Web Audio (sin archivos externos).
// Cada efecto se arma por capas (chasquido, cuerpo, golpe grave, cola) con pequeñas
// variaciones aleatorias, y un límite de voces evita que la horda sature la mezcla.
import { storage, rand } from './util.js';

const MAX_VOICES = 28;

// Perfil de disparo por arma. crack: chasquido agudo; body: cuerpo; thump: golpe grave; tail: cola.
const SHOTS = {
  pistol: { crack: 4200, body: 1400, thump: 150, tail: 0.18, gain: 0.75, dur: 0.14 },
  smg: { crack: 5200, body: 1900, thump: 170, tail: 0.1, gain: 0.5, dur: 0.08 },
  shotgun: { crack: 2600, body: 700, thump: 95, tail: 0.42, gain: 1, dur: 0.24 },
  rifle: { crack: 5600, body: 1100, thump: 120, tail: 0.38, gain: 0.95, dur: 0.18 },
  ar: { crack: 4800, body: 1500, thump: 135, tail: 0.16, gain: 0.62, dur: 0.1 },
  autoshotgun: { crack: 2900, body: 820, thump: 105, tail: 0.3, gain: 0.85, dur: 0.18 },
  sniper: { crack: 6200, body: 900, thump: 80, tail: 0.65, gain: 1, dur: 0.26 },
  lmg: { crack: 4400, body: 1250, thump: 125, tail: 0.14, gain: 0.55, dur: 0.09 },
};

// Etapas de recarga sincronizadas con el progreso de la animación (0..1).
export const RELOAD_STEPS = {
  pistol: [[0.12, 'magOut'], [0.6, 'magIn'], [0.88, 'slide']],
  smg: [[0.15, 'magOut'], [0.58, 'magIn'], [0.86, 'bolt']],
  ar: [[0.14, 'magOut'], [0.56, 'magIn'], [0.85, 'bolt']],
  rifle: [[0.12, 'boltOpen'], [0.3, 'magOut'], [0.62, 'magIn'], [0.9, 'boltClose']],
  sniper: [[0.1, 'boltOpen'], [0.3, 'shell'], [0.5, 'shell'], [0.7, 'shell'], [0.9, 'boltClose']],
  shotgun: [[0.15, 'shell'], [0.32, 'shell'], [0.49, 'shell'], [0.66, 'shell'], [0.88, 'pump']],
  autoshotgun: [[0.12, 'magOut'], [0.55, 'drumIn'], [0.86, 'bolt']],
  lmg: [[0.08, 'coverOpen'], [0.3, 'magOut'], [0.55, 'belt'], [0.75, 'coverClose'], [0.9, 'bolt']],
};

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = storage.get('dz-muted', false);
    this.last = {};
    this.voices = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      // bus de efectos y bus de música separados para mezclar sin que la música tape los disparos
      this.fx = this.ctx.createGain();
      this.fx.gain.value = 1;
      this.fx.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.32;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.onReady) this.onReady(this);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    storage.set('dz-muted', m);
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  ok(name, gap, important = false) {
    if (!this.ctx || this.muted) return false;
    if (!important && this.voices >= MAX_VOICES) return false;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < gap) return false;
    this.last[name] = now;
    return true;
  }

  track(node, end) {
    this.voices++;
    node.onended = () => {
      this.voices--;
    };
    node.stop(end);
  }

  burst({ dur, freq, q = 1, gain, type = 'lowpass', attack = 0.002, sweep, delay = 0, out }) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out || this.fx);
    src.start(t, Math.random() * 0.5);
    this.track(src, t + dur + 0.02);
  }

  tone({ freq, to, dur, gain, type = 'sine', delay = 0, attack = 0.005, out }) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out || this.fx);
    o.start(t);
    this.track(o, t + dur + 0.02);
  }

  // Disparo por capas, distinto por arma y con variación en cada tiro.
  shot(kind) {
    const P = SHOTS[kind] || SHOTS.pistol;
    if (!this.ok('shot', 0.025, true)) return;
    const v = rand(0.92, 1.08);
    const gv = P.gain * rand(0.9, 1.05);
    this.burst({ dur: 0.035, freq: P.crack * v, gain: gv * 0.9, type: 'highpass', q: 0.7 });
    this.burst({ dur: P.dur, freq: P.body * v, sweep: P.body * 0.35, gain: gv * 0.8, type: 'bandpass', q: 0.9 });
    this.tone({ freq: P.thump * v, to: P.thump * 0.35, dur: P.dur * 1.2, gain: gv * 0.9 });
    this.burst({ dur: P.tail, freq: 900 * v, sweep: 120, gain: gv * 0.35, attack: 0.01 });
    if (kind === 'shotgun' || kind === 'autoshotgun') {
      this.tone({ freq: 60 * v, to: 30, dur: 0.3, gain: gv * 0.6 });
    }
    if (kind === 'sniper') this.burst({ dur: 0.9, freq: 400, sweep: 60, gain: 0.28, attack: 0.05, delay: 0.05 });
  }

  // Un paso de la recarga: cada tipo suena distinto (metal contra metal, plástico, muelle).
  reloadStep(step) {
    if (!this.ok('rl-' + step, 0.06, true)) return;
    const click = (f, g, d = 0.04, delay = 0) => this.burst({ dur: d, freq: f, gain: g, type: 'bandpass', q: 8, delay });
    switch (step) {
      case 'magOut':
        click(1800, 0.45);
        this.burst({ dur: 0.12, freq: 700, sweep: 300, gain: 0.25, type: 'bandpass', q: 3, delay: 0.03 });
        break;
      case 'magIn':
      case 'drumIn':
        this.burst({ dur: 0.06, freq: 600, gain: 0.35, type: 'bandpass', q: 2 });
        click(2600, 0.6, 0.03, 0.05);
        this.tone({ freq: 180, to: 120, dur: 0.05, gain: 0.25, delay: 0.05 });
        break;
      case 'slide':
        this.burst({ dur: 0.09, freq: 3200, sweep: 1800, gain: 0.35, type: 'bandpass', q: 4 });
        click(3400, 0.6, 0.03, 0.09);
        break;
      case 'bolt':
        this.burst({ dur: 0.07, freq: 2400, sweep: 1500, gain: 0.35, type: 'bandpass', q: 5 });
        click(3000, 0.65, 0.035, 0.11);
        this.tone({ freq: 220, to: 160, dur: 0.05, gain: 0.25, delay: 0.11 });
        break;
      case 'boltOpen':
        click(2200, 0.5);
        this.burst({ dur: 0.1, freq: 1700, sweep: 2600, gain: 0.3, type: 'bandpass', q: 4, delay: 0.03 });
        break;
      case 'boltClose':
        this.burst({ dur: 0.08, freq: 2600, sweep: 1600, gain: 0.3, type: 'bandpass', q: 4 });
        click(3200, 0.7, 0.035, 0.08);
        break;
      case 'shell':
        click(4200, 0.35, 0.025);
        this.burst({ dur: 0.07, freq: 1200, gain: 0.3, type: 'bandpass', q: 3, delay: 0.03 });
        break;
      case 'pump':
        this.burst({ dur: 0.1, freq: 900, sweep: 1900, gain: 0.5, type: 'bandpass', q: 3 });
        this.burst({ dur: 0.1, freq: 1900, sweep: 800, gain: 0.55, type: 'bandpass', q: 3, delay: 0.13 });
        click(2800, 0.6, 0.03, 0.22);
        break;
      case 'coverOpen':
        click(1600, 0.45, 0.05);
        break;
      case 'belt':
        for (let i = 0; i < 4; i++) click(3600 + i * 120, 0.18, 0.02, i * 0.04);
        break;
      case 'coverClose':
        this.burst({ dur: 0.06, freq: 500, gain: 0.5, type: 'bandpass', q: 2 });
        click(2000, 0.55, 0.04, 0.02);
        break;
    }
  }

  // Compatibilidad: inicio y final genéricos de recarga.
  reload() {}

  reloadDone() {
    if (!this.ok('reloadDone', 0.15)) return;
    this.tone({ freq: 1400, dur: 0.04, gain: 0.08, type: 'triangle' });
  }

  hit(big) {
    if (!this.ok('hit', 0.04)) return;
    const v = rand(0.85, 1.15);
    this.burst({ dur: 0.07, freq: 420 * v, gain: big ? 0.45 : 0.32, type: 'bandpass', q: 1.5 });
    this.tone({ freq: 140 * v, to: 70, dur: 0.07, gain: 0.25 });
  }

  // Caída del cuerpo al suelo.
  kill(big) {
    if (!this.ok('kill', 0.05)) return;
    const v = rand(0.85, 1.1);
    this.tone({ freq: (big ? 70 : 110) * v, to: 40, dur: big ? 0.35 : 0.2, gain: big ? 0.6 : 0.4, delay: 0.12 });
    this.burst({ dur: big ? 0.3 : 0.18, freq: 500 * v, sweep: 120, gain: big ? 0.45 : 0.28, delay: 0.12 });
  }

  groan(intensity = 1) {
    if (!this.ok('groan', 1.1 / Math.max(0.5, intensity))) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = Math.random() < 0.5 ? 'sawtooth' : 'square';
    const base = rand(60, 125);
    const dur = rand(0.7, 1.4);
    o.frequency.setValueAtTime(base * rand(1.05, 1.3), t);
    o.frequency.linearRampToValueAtTime(base * rand(0.65, 0.85), t + dur);
    const lfo = c.createOscillator();
    lfo.frequency.value = rand(4, 11);
    const lg = c.createGain();
    lg.gain.value = rand(5, 12);
    lfo.connect(lg);
    lg.connect(o.frequency);
    // formante tipo "garganta" para que suene a gemido y no a sintetizador
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(rand(380, 700), t);
    f.frequency.linearRampToValueAtTime(rand(250, 450), t + dur);
    f.Q.value = rand(3, 7);
    const g = c.createGain();
    const vol = Math.min(0.16, 0.07 + intensity * 0.02);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.fx);
    o.start(t);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    this.track(o, t + dur + 0.05);
  }

  // Pasos arrastrados de los zombis cercanos (volumen según cuántos hay).
  footstep(vol) {
    if (!this.ok('step', 0.09)) return;
    const v = rand(0.8, 1.25);
    this.burst({ dur: rand(0.06, 0.12), freq: 260 * v, gain: 0.07 + vol * 0.1, type: 'lowpass' });
    if (Math.random() < 0.4) this.burst({ dur: 0.15, freq: 1400 * v, sweep: 600, gain: 0.03 + vol * 0.03, type: 'bandpass', q: 1, delay: 0.04 });
  }

  stomp(vol) {
    if (!this.ok('stomp', 0.2)) return;
    this.tone({ freq: 70, to: 28, dur: 0.35, gain: 0.8 * vol });
    this.burst({ dur: 0.25, freq: 250, gain: 0.3 * vol });
  }

  hurt() {
    if (!this.ok('hurt', 0.15, true)) return;
    this.tone({ freq: 200, to: 90, dur: 0.18, gain: 0.35, type: 'square' });
    this.burst({ dur: 0.12, freq: 700, gain: 0.3 });
  }

  // Monedas que se caen del bolsillo al recibir un golpe.
  moneyLost() {
    if (!this.ok('moneyLost', 0.12, true)) return;
    for (let i = 0; i < 3; i++) this.tone({ freq: rand(1800, 2600), to: rand(900, 1300), dur: 0.08, gain: 0.08, type: 'triangle', delay: i * 0.05 });
  }

  // Recompensa del zombi dorado.
  gold() {
    if (!this.ok('gold', 0.3, true)) return;
    [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone({ freq: f, dur: 0.35, gain: 0.16, type: 'triangle', delay: i * 0.06 }));
    for (let i = 0; i < 6; i++) this.tone({ freq: rand(2500, 4200), dur: 0.12, gain: 0.05, type: 'sine', delay: 0.1 + i * 0.05 });
  }

  goldenSpawn() {
    if (!this.ok('goldenSpawn', 1, true)) return;
    [1318, 1568, 2093].forEach((f, i) => this.tone({ freq: f, dur: 0.25, gain: 0.1, type: 'sine', delay: i * 0.09 }));
  }

  reloadAmmo() {
    this.pickup();
  }

  empty() {
    if (!this.ok('empty', 0.2, true)) return;
    this.burst({ dur: 0.03, freq: 3500, gain: 0.3, type: 'bandpass', q: 10 });
  }

  // Recoger munición: cajita metálica + cartuchos.
  pickup() {
    if (!this.ok('pickup', 0.06, true)) return;
    this.burst({ dur: 0.05, freq: 2200, gain: 0.35, type: 'bandpass', q: 6 });
    this.tone({ freq: 660, dur: 0.08, gain: 0.16, type: 'triangle', delay: 0.02 });
    this.tone({ freq: 990, dur: 0.12, gain: 0.16, type: 'triangle', delay: 0.07 });
    for (let i = 0; i < 3; i++) this.burst({ dur: 0.02, freq: 4200 + i * 300, gain: 0.12, type: 'bandpass', q: 9, delay: 0.04 + i * 0.03 });
  }

  level() {
    if (!this.ok('level', 0.3, true)) return;
    [392, 494, 587, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.25, gain: 0.18, type: 'triangle', delay: i * 0.08 }));
  }

  wave() {
    if (!this.ok('wave', 1, true)) return;
    this.tone({ freq: 110, to: 90, dur: 1.4, gain: 0.25, type: 'sawtooth' });
    this.tone({ freq: 55, dur: 1.4, gain: 0.3 });
  }

  exhausted() {
    if (!this.ok('exhausted', 1)) return;
    this.burst({ dur: 0.5, freq: 1200, gain: 0.15, type: 'bandpass', q: 1, attack: 0.15 });
  }

  turret() {
    if (!this.ok('turret', 0.12)) return;
    this.burst({ dur: 0.07, freq: 2600, sweep: 800, gain: 0.22 });
    this.tone({ freq: 160, to: 70, dur: 0.06, gain: 0.18 });
  }

  explosion() {
    if (!this.ok('explosion', 0.08, true)) return;
    this.burst({ dur: 1.1, freq: 1800, sweep: 60, gain: 1 });
    this.tone({ freq: 90, to: 25, dur: 0.9, gain: 1 });
  }

  blockHit(kind) {
    if (!this.ok('blockHit', 0.12)) return;
    if (kind === 'wood') this.burst({ dur: 0.08, freq: 700, gain: 0.3, type: 'bandpass', q: 3 });
    else this.burst({ dur: 0.1, freq: 2600, gain: 0.25, type: 'bandpass', q: 9 });
  }

  blockBreak() {
    if (!this.ok('blockBreak', 0.1)) return;
    this.burst({ dur: 0.45, freq: 900, sweep: 150, gain: 0.6 });
  }

  build() {
    if (!this.ok('build', 0.05)) return;
    this.burst({ dur: 0.07, freq: 600, gain: 0.4, type: 'bandpass', q: 2 });
    this.burst({ dur: 0.06, freq: 1400, gain: 0.25, type: 'bandpass', q: 4 });
  }

  buy() {
    if (!this.ok('buy', 0.05, true)) return;
    this.tone({ freq: 880, dur: 0.08, gain: 0.18, type: 'triangle' });
    this.tone({ freq: 1320, dur: 0.12, gain: 0.15, type: 'triangle', delay: 0.06 });
  }
}

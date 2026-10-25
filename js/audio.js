// @ts-nocheck — pendiente de tipar (Etapa 3: checkJs ya cubre el resto de js/)
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
  bazooka: { crack: 1500, body: 420, thump: 60, tail: 0.9, gain: 1, dur: 0.45 },
  heavy: { crack: 3400, body: 760, thump: 70, tail: 0.32, gain: 0.8, dur: 0.15 },
};

export class Sfx {
  constructor() {
    /** @type {(() => void) | undefined} lo asigna Game para arrancar la música */
    this.onReady;
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
    // bazuca: silbido del cohete al salir
    if (kind === 'bazooka')
      this.burst({ dur: 1.1, freq: 900, sweep: 3200, gain: 0.35, type: 'bandpass', q: 1.5, attack: 0.03, delay: 0.04 });
  }

  // Un paso de la recarga: cada tipo suena distinto (metal contra metal, plástico, muelle).
  reloadStep(step) {
    if (!this.ok('rl-' + step, 0.06, true)) return;
    const click = (f, g, d = 0.04, delay = 0) =>
      this.burst({ dur: d, freq: f, gain: g, type: 'bandpass', q: 8, delay });
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
      case 'rocketIn':
        this.burst({ dur: 0.35, freq: 500, sweep: 900, gain: 0.35, type: 'bandpass', q: 2 });
        break;
      case 'rocketSeat':
        this.tone({ freq: 140, to: 80, dur: 0.12, gain: 0.5 });
        click(1400, 0.55, 0.05);
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

  groan(intensity = 1, opt = null) {
    if (!opt && !this.ok('groan', 1.1 / Math.max(0.5, intensity))) return;
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = Math.random() < 0.5 ? 'sawtooth' : 'square';
    const base = opt ? rand(opt.base[0], opt.base[1]) : rand(60, 125);
    const dur = opt ? rand(opt.dur[0], opt.dur[1]) : rand(0.7, 1.4);
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
    f.frequency.setValueAtTime(opt ? opt.formant : rand(380, 700), t);
    f.frequency.linearRampToValueAtTime(rand(250, 450), t + dur);
    f.Q.value = rand(3, 7);
    const g = c.createGain();
    const vol = opt ? opt.vol : Math.min(0.16, 0.07 + intensity * 0.02);
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
    if (Math.random() < 0.4)
      this.burst({
        dur: 0.15,
        freq: 1400 * v,
        sweep: 600,
        gain: 0.03 + vol * 0.03,
        type: 'bandpass',
        q: 1,
        delay: 0.04,
      });
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
    for (let i = 0; i < 3; i++)
      this.tone({
        freq: rand(1800, 2600),
        to: rand(900, 1300),
        dur: 0.08,
        gain: 0.08,
        type: 'triangle',
        delay: i * 0.05,
      });
  }

  // Recompensa del zombi dorado.
  gold() {
    if (!this.ok('gold', 0.3, true)) return;
    [784, 988, 1175, 1568, 1976].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.35, gain: 0.16, type: 'triangle', delay: i * 0.06 }),
    );
    for (let i = 0; i < 6; i++)
      this.tone({ freq: rand(2500, 4200), dur: 0.12, gain: 0.05, type: 'sine', delay: 0.1 + i * 0.05 });
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
    for (let i = 0; i < 3; i++)
      this.burst({ dur: 0.02, freq: 4200 + i * 300, gain: 0.12, type: 'bandpass', q: 9, delay: 0.04 + i * 0.03 });
  }

  level() {
    if (!this.ok('level', 0.3, true)) return;
    [392, 494, 587, 784].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.25, gain: 0.18, type: 'triangle', delay: i * 0.08 }),
    );
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

  // Silbido del misil balístico que cae del cielo.
  missile() {
    if (!this.ok('missile', 0.2, true)) return;
    this.tone({ freq: 2400, to: 500, dur: 1.35, gain: 0.22, type: 'triangle' });
    this.burst({ dur: 1.3, freq: 3000, sweep: 900, gain: 0.12, type: 'bandpass', q: 3, attack: 0.4 });
  }

  // Impulso del Booster: zumbido que sube.
  boost() {
    if (!this.ok('boost', 0.2, true)) return;
    this.tone({ freq: 220, to: 880, dur: 0.35, gain: 0.3, type: 'sawtooth' });
    this.burst({ dur: 0.4, freq: 1500, sweep: 5000, gain: 0.2, type: 'bandpass', q: 2 });
  }

  // Cohete que se clava en carne o en metal.
  rocketStick(fat) {
    if (!this.ok('rocketStick', 0.05, true)) return;
    if (fat) this.burst({ dur: 0.2, freq: 400, sweep: 150, gain: 0.7, q: 1.5 });
    else this.burst({ dur: 0.08, freq: 3000, gain: 0.5, type: 'bandpass', q: 6 });
    this.tone({ freq: fat ? 90 : 300, to: fat ? 50 : 140, dur: 0.18, gain: 0.6 });
  }

  // Reventón brutal del gordo: chapoteo grave y salpicaduras.
  gore() {
    if (!this.ok('gore', 0.1, true)) return;
    this.tone({ freq: 70, to: 25, dur: 0.6, gain: 1 });
    this.burst({ dur: 0.5, freq: 600, sweep: 120, gain: 0.9, q: 1.5 });
    for (let i = 0; i < 6; i++)
      this.burst({ dur: 0.08, freq: rand(300, 900), gain: 0.35, q: 2, delay: 0.1 + i * rand(0.04, 0.09) });
  }

  // Pitido del cohete a punto de estallar dentro del gordo.
  rocketArm() {
    if (!this.ok('rocketArm', 0.05, true)) return;
    for (let i = 0; i < 6; i++)
      this.tone({ freq: 1800 + i * 150, dur: 0.05, gain: 0.12, type: 'square', delay: i * (0.11 - i * 0.012) });
  }

  // Super golpe del blindado: impacto sordo y metálico.
  punch() {
    if (!this.ok('punch', 0.15, true)) return;
    this.tone({ freq: 110, to: 35, dur: 0.3, gain: 0.9 });
    this.burst({ dur: 0.18, freq: 700, sweep: 200, gain: 0.7, q: 1.5 });
    this.burst({ dur: 0.06, freq: 3200, gain: 0.15, type: 'bandpass', q: 6, delay: 0.02 });
  }

  /* ---------- toro ---------- */

  // Resoplido y bramido grave al verte.
  bullRoar() {
    if (!this.ok('bullRoar', 0.5, true)) return;
    this.burst({ dur: 0.35, freq: 900, gain: 0.25, type: 'bandpass', q: 1.2, attack: 0.05 });
    this.groan(2, { base: [48, 62], dur: [0.8, 1.1], formant: 420, vol: 0.22 });
  }

  bullCharge() {
    if (!this.ok('bullCharge', 0.3, true)) return;
    for (let i = 0; i < 6; i++) this.burst({ dur: 0.09, freq: rand(180, 260), gain: 0.4, delay: i * 0.13 });
  }

  // Cornada al jugador.
  bullHit() {
    if (!this.ok('bullHit', 0.2, true)) return;
    this.tone({ freq: 95, to: 30, dur: 0.4, gain: 1 });
    this.burst({ dur: 0.3, freq: 1200, sweep: 200, gain: 0.8 });
  }

  // Embestida contra una estructura (larga: estruendo; corta: golpe seco).
  bullSlam(long) {
    if (!this.ok('bullSlam', 0.12, true)) return;
    this.tone({ freq: long ? 80 : 120, to: 30, dur: long ? 0.5 : 0.22, gain: long ? 1 : 0.6 });
    this.burst({ dur: long ? 0.6 : 0.2, freq: long ? 1400 : 900, sweep: 150, gain: long ? 0.9 : 0.5 });
  }

  /* ---------- fuego ---------- */

  throwBottle() {
    if (!this.ok('throwBottle', 0.1, true)) return;
    this.burst({ dur: 0.25, freq: 1200, sweep: 400, gain: 0.2, type: 'bandpass', q: 1 });
  }

  // Vidrio roto y llamarada.
  molotov() {
    if (!this.ok('molotov', 0.08, true)) return;
    for (let i = 0; i < 5; i++)
      this.burst({ dur: 0.05, freq: rand(3500, 6500), gain: 0.25, type: 'bandpass', q: 8, delay: i * 0.025 });
    this.burst({ dur: 0.9, freq: 700, sweep: 2200, gain: 0.7, type: 'lowpass', attack: 0.05, delay: 0.04 });
    this.tone({ freq: 70, to: 40, dur: 0.5, gain: 0.5, delay: 0.04 });
  }

  // Chisporroteo del fuego.
  crackle() {
    if (!this.ok('crackle', 0.12)) return;
    for (let i = 0; i < 3; i++)
      this.burst({ dur: 0.02, freq: rand(1800, 4000), gain: 0.12, type: 'bandpass', q: 5, delay: rand(0, 0.15) });
  }

  // Alarido de un zombi en llamas.
  burnScream() {
    if (!this.ok('burnScream', 0.6)) return;
    this.groan(2, { base: [150, 230], dur: [0.6, 1], formant: 900, vol: 0.12 });
  }

  // Reventón del gordo: chapoteo viscoso y siseo de ácido.
  acid() {
    if (!this.ok('acid', 0.1, true)) return;
    this.burst({ dur: 0.35, freq: 500, sweep: 140, gain: 0.7, q: 2 });
    this.tone({ freq: 140, to: 50, dur: 0.3, gain: 0.5 });
    this.burst({ dur: 1.2, freq: 5200, gain: 0.12, type: 'highpass', attack: 0.15, delay: 0.1 });
  }

  // Quemadura de ácido sobre el jugador (cada segundo).
  sizzle() {
    if (!this.ok('sizzle', 0.4, true)) return;
    this.burst({ dur: 0.45, freq: 6000, gain: 0.14, type: 'highpass', attack: 0.04 });
  }

  // Bala que rebota en la armadura.
  ricochet() {
    if (!this.ok('ricochet', 0.05)) return;
    const f = rand(2200, 3400);
    this.tone({ freq: f, to: f * rand(0.4, 0.6), dur: rand(0.16, 0.28), gain: 0.09, type: 'triangle' });
    this.burst({ dur: 0.03, freq: 4200, gain: 0.2, type: 'bandpass', q: 7 });
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

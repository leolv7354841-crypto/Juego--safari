// Música dinámica generada en tiempo real con Web Audio.
// Tres capas que suenan a la vez y se mezclan según el peligro (crossfade suave):
//   calma   → drones oscuros, viento y notas sueltas inquietantes
//   amenaza → latido de tambores, bajo pulsante y trémolo de cuerdas
//   horda   → batería de supervivencia, bajo ostinato y golpes de metales
// El estado cambia con umbrales con histéresis y un tiempo mínimo, para no oscilar.
import { MUSIC } from '../core/config.js';
import { rand } from '../core/util.js';

const LOOKAHEAD = 0.12;
const A = [55, 65.41, 73.42, 82.41, 98]; // A1 C2 D2 E2 G2 (escala menor pentatónica)

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.state = 'calm';
    this.target = 'calm';
    this.since = 0;
    this.started = false;
    this.paused = false;
    this.step = 0;
    this.nextTime = 0;
    this.level = 0;
  }

  // Se llama tras el primer gesto del jugador (los navegadores bloquean el audio antes).
  start() {
    const s = this.sfx;
    if (this.started || !s.ctx) return;
    this.started = true;
    const c = s.ctx;
    this.c = c;
    this.out = c.createGain();
    this.out.gain.value = 1;
    this.out.connect(s.musicBus);
    const mk = (v) => {
      const g = c.createGain();
      g.gain.value = v;
      g.connect(this.out);
      return g;
    };
    this.calm = mk(0.9);
    this.threat = mk(0.0001);
    this.horde = mk(0.0001);
    this.startDrones();
    this.nextTime = c.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  startDrones() {
    const c = this.c;
    // dron grave con filtro que respira lentamente
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 320;
    filt.Q.value = 3;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = 160;
    lfo.connect(lg);
    lg.connect(filt.frequency);
    lfo.start();
    for (const [f, type, v] of [
      [55, 'sawtooth', 0.09],
      [55.4, 'sawtooth', 0.08],
      [82.4, 'triangle', 0.08],
      [110.2, 'sine', 0.05],
    ]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = v;
      o.connect(g);
      g.connect(filt);
      o.start();
    }
    filt.connect(this.calm);
    // viento: ruido filtrado que sube y baja
    const src = c.createBufferSource();
    src.buffer = this.sfx.noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.7;
    const wl = c.createOscillator();
    wl.frequency.value = 0.11;
    const wg = c.createGain();
    wg.gain.value = 300;
    wl.connect(wg);
    wg.connect(bp.frequency);
    wl.start();
    const g = c.createGain();
    g.gain.value = 0.05;
    src.connect(bp);
    bp.connect(g);
    g.connect(this.calm);
    src.start();
    // trémolo de cuerdas para la capa de amenaza
    const sf = c.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.value = 900;
    sf.Q.value = 1.2;
    const trem = c.createGain();
    trem.gain.value = 0;
    const tl = c.createOscillator();
    tl.frequency.value = 9;
    const tg = c.createGain();
    tg.gain.value = 0.05;
    tl.connect(tg);
    tg.connect(trem.gain);
    tl.start();
    for (const f of [220, 261.6, 329.6]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * rand(0.998, 1.002);
      o.connect(sf);
      o.start();
    }
    sf.connect(trem);
    trem.connect(this.threat);
  }

  // Nivel de peligro calculado por el juego: suma de cercanía de zombis.
  setDanger(danger, dt) {
    if (!this.started) return;
    this.level += (danger - this.level) * Math.min(1, dt * 1.5);
    this.since += dt;
    const L = this.level;
    let want = this.state;
    if (this.state === 'calm' && L > MUSIC.threatOn) want = 'threat';
    if (this.state === 'threat') {
      if (L > MUSIC.hordeOn) want = 'horde';
      else if (L < MUSIC.threatOff) want = 'calm';
    }
    if (this.state === 'horde' && L < MUSIC.hordeOff) want = 'threat';
    if (want !== this.state && this.since > MUSIC.minHold) {
      this.state = want;
      this.since = 0;
      this.fade();
    }
  }

  fade() {
    const t = this.c.currentTime;
    const lv = { calm: [0.9, 0.0001, 0.0001], threat: [0.45, 0.85, 0.0001], horde: [0.15, 0.35, 0.95] }[this.state];
    // subir rápido ante el peligro, bajar despacio al volver la calma
    const tc = this.state === 'calm' ? 2.5 : 1.2;
    this.calm.gain.setTargetAtTime(lv[0], t, tc);
    this.threat.gain.setTargetAtTime(lv[1], t, tc);
    this.horde.gain.setTargetAtTime(lv[2], t, tc);
  }

  setPaused(p) {
    if (!this.started || p === this.paused) return;
    this.paused = p;
    this.out.gain.setTargetAtTime(p ? 0.25 : 1, this.c.currentTime, 0.3);
  }

  reset() {
    if (!this.started) return;
    this.level = 0;
    this.state = 'calm';
    this.since = 0;
    this.fade();
  }

  /* ---------- secuenciador ---------- */

  schedule() {
    const c = this.c;
    if (!c || c.state !== 'running') return;
    const bpm = this.state === 'horde' ? 140 : this.state === 'threat' ? 96 : 70;
    const sixteenth = 60 / bpm / 4;
    while (this.nextTime < c.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % 64;
      this.nextTime += sixteenth;
    }
  }

  playStep(s, t) {
    const beat = s % 16;
    // calma: notas sueltas, como un piano lejano
    if (beat === 0 && Math.random() < 0.55) this.pluck(A[(Math.random() * A.length) | 0] * 4, t, 0.05, this.calm);
    if (beat === 10 && Math.random() < 0.3) this.pluck(A[(Math.random() * A.length) | 0] * 8, t, 0.025, this.calm);
    // amenaza: latido (dos golpes) y bajo pulsante en corcheas
    if (beat === 0 || beat === 3) this.kick(t, beat === 0 ? 0.55 : 0.35, this.threat);
    if (s % 2 === 0) this.bass(55, t, 0.12, 0.12, this.threat);
    // horda: batería completa, ostinato y metales
    if (beat === 0 || beat === 6 || beat === 8 || beat === 11) this.kick(t, 0.8, this.horde);
    if (beat === 4 || beat === 12) this.snare(t, this.horde);
    this.hat(t, beat % 2 === 0 ? 0.06 : 0.03, this.horde);
    const ost = [55, 55, 65.4, 55, 73.4, 55, 65.4, 49];
    if (s % 2 === 0) this.bass(ost[((s / 2) % 8) | 0], t, 0.1, 0.2, this.horde);
    if (s % 32 === 0) this.brass(s % 64 === 0 ? 110 : 98, t, this.horde);
  }

  pluck(f, t, v, out) {
    const c = this.c;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 2.5);
  }

  kick(t, v, out) {
    const c = this.c;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.32);
  }

  snare(t, out) {
    const c = this.c;
    const src = c.createBufferSource();
    src.buffer = this.sfx.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.2);
    const o = c.createOscillator();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    const og = c.createGain();
    og.gain.setValueAtTime(0.2, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(og);
    og.connect(out);
    o.start(t);
    o.stop(t + 0.12);
  }

  hat(t, v, out) {
    const c = this.c;
    const src = c.createBufferSource();
    src.buffer = this.sfx.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.06);
  }

  bass(f, t, v, dur, out) {
    const c = this.c;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(150, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp);
    lp.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  brass(f, t, out) {
    const c = this.c;
    for (const m of [1, 1.5, 2]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * m * rand(0.997, 1.003);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(300, t);
      lp.frequency.linearRampToValueAtTime(1600, t + 0.15);
      lp.frequency.exponentialRampToValueAtTime(400, t + 1.2);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(lp);
      lp.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 1.35);
    }
  }
}

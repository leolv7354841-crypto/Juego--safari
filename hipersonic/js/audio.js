// Sonido sintetizado con Web Audio (sin archivos externos).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.last = {};
    this.listener = { x: 0, y: 0 };
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(c.destination);
    // ruido blanco reutilizable
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // viento continuo: sube con la velocidad
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.windF = c.createBiquadFilter();
    this.windF.type = 'bandpass';
    this.windF.Q.value = 0.8;
    this.windG = c.createGain();
    this.windG.gain.value = 0;
    src.connect(this.windF).connect(this.windG).connect(this.master);
    src.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  ok(name, gap = 0.04) {
    if (!this.ctx || this.muted) return false;
    const t = this.ctx.currentTime;
    if (this.last[name] && t - this.last[name] < gap) return false;
    this.last[name] = t;
    return true;
  }
  vol(x, y) {
    if (x === undefined) return 1;
    const d = Math.hypot(x - this.listener.x, y - this.listener.y);
    return Math.max(0, 1 - d / 900);
  }

  tone(type, f0, f1, dur, gain, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  burst(type, f0, f1, dur, gain, q = 1, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  wind(speed, sonicK) {
    if (!this.ctx) return;
    const k = Math.min(1, speed / 1000);
    const t = this.ctx.currentTime;
    this.windG.gain.setTargetAtTime(this.muted ? 0 : k * k * 0.5 * (1 - sonicK * 0.7), t, 0.08);
    this.windF.frequency.setTargetAtTime(300 + k * 1600 - sonicK * 200, t, 0.08);
  }

  swing() {
    if (this.ok('swing', 0.05)) this.burst('bandpass', 1800, 500, 0.12, 0.25, 1.5);
  }
  punch(big) {
    if (!this.ok('punch', 0.03)) return;
    this.tone('sine', big ? 140 : 190, 50, big ? 0.22 : 0.12, big ? 0.9 : 0.6);
    this.burst('lowpass', 2400, 300, 0.1, 0.5);
  }
  whiff() {
    if (this.ok('whiff', 0.1)) this.burst('bandpass', 1200, 400, 0.1, 0.12, 2);
  }
  thud(x, y, f = 1) {
    const v = this.vol(x, y) * Math.min(1, f);
    if (v < 0.05 || !this.ok('thud', 0.05)) return;
    this.tone('sine', 110, 40, 0.15, 0.5 * v);
    this.burst('lowpass', 600, 100, 0.12, 0.3 * v);
  }
  crash(x, y, f = 1) {
    const v = this.vol(x, y) * Math.min(1, f);
    if (v < 0.05 || !this.ok('crash', 0.06)) return;
    this.burst('bandpass', 2600, 700, 0.35, 0.7 * v, 3);
    this.burst('highpass', 5000, 3000, 0.25, 0.3 * v, 1);
    this.tone('triangle', 90, 35, 0.3, 0.6 * v);
  }
  glass(x, y) {
    const v = this.vol(x, y);
    if (v < 0.05 || !this.ok('glass', 0.08)) return;
    for (let i = 0; i < 5; i++) this.tone('sine', 2400 + Math.random() * 2600, 1800, 0.12, 0.08 * v, i * 0.025);
    this.burst('highpass', 7000, 4000, 0.2, 0.25 * v);
  }
  wall(f = 1) {
    if (!this.ok('wall', 0.08)) return;
    this.tone('sine', 80, 30, 0.35, Math.min(1, f));
    this.burst('lowpass', 1200, 80, 0.4, 0.6 * Math.min(1, f));
  }
  boom() {
    if (!this.ok('boom', 0.3)) return;
    this.tone('sine', 70, 22, 0.9, 1);
    this.burst('lowpass', 3000, 60, 0.9, 0.9);
    this.burst('bandpass', 5000, 300, 0.4, 0.3, 0.7);
  }
  sonicOn() {
    if (!this.ok('sonicOn', 0.2)) return;
    this.tone('sawtooth', 900, 60, 0.7, 0.18);
    this.tone('sine', 420, 40, 0.9, 0.5);
    this.burst('bandpass', 4000, 200, 0.6, 0.35, 2);
  }
  sonicOff() {
    if (!this.ok('sonicOff', 0.2)) return;
    this.tone('sine', 60, 600, 0.35, 0.45);
    this.burst('bandpass', 300, 5000, 0.35, 0.3, 2);
  }
  mark() {
    if (this.ok('mark', 0.04)) this.tone('triangle', 1500 + Math.random() * 400, 2600, 0.12, 0.18);
  }
  hurt() {
    if (this.ok('hurt', 0.1)) this.tone('square', 220, 90, 0.18, 0.25);
  }
  honk(x, y) {
    const v = this.vol(x, y);
    if (v < 0.05 || !this.ok('honk', 0.5)) return;
    this.tone('square', 392, 392, 0.32, 0.12 * v);
    this.tone('square', 494, 494, 0.32, 0.1 * v);
  }
  scream(x, y) {
    const v = this.vol(x, y);
    if (v < 0.05 || !this.ok('scream', 0.4)) return;
    const f = 700 + Math.random() * 500;
    this.tone('sawtooth', f, f * 1.25, 0.35, 0.05 * v);
  }
  ko() {
    if (this.ok('ko', 0.15)) {
      this.tone('triangle', 880, 1760, 0.12, 0.15);
      this.tone('triangle', 1320, 2640, 0.15, 0.1, 0.08);
    }
  }
}

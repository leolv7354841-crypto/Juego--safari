// Efectos de sonido sintetizados con Web Audio (sin archivos externos).
import { storage } from './util.js';

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = storage.get('dz-muted', false);
    this.last = {};
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    storage.set('dz-muted', m);
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  ok(name, gap) {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < gap) return false;
    this.last[name] = now;
    return true;
  }

  burst({ dur, freq, q = 1, gain, type = 'lowpass', attack = 0.002, sweep }) {
    const c = this.ctx;
    const t = c.currentTime;
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
    g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  tone({ freq, to, dur, gain, type = 'sine', delay = 0 }) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot(kind) {
    if (!this.ok('shot', 0.03)) return;
    // las armas nuevas reutilizan el sonido de su familia
    kind = { ar: 'smg', lmg: 'smg', autoshotgun: 'shotgun', sniper: 'rifle' }[kind] || kind;
    if (kind === 'shotgun') {
      this.burst({ dur: 0.35, freq: 2400, sweep: 300, gain: 0.9 });
      this.tone({ freq: 120, to: 40, dur: 0.25, gain: 0.7 });
    } else if (kind === 'rifle') {
      this.burst({ dur: 0.28, freq: 4000, sweep: 500, gain: 0.8 });
      this.tone({ freq: 160, to: 45, dur: 0.18, gain: 0.6 });
    } else if (kind === 'smg') {
      this.burst({ dur: 0.09, freq: 3200, sweep: 900, gain: 0.45 });
      this.tone({ freq: 140, to: 60, dur: 0.06, gain: 0.3 });
    } else {
      this.burst({ dur: 0.16, freq: 3000, sweep: 600, gain: 0.6 });
      this.tone({ freq: 150, to: 50, dur: 0.1, gain: 0.45 });
    }
  }

  hit() {
    if (!this.ok('hit', 0.05)) return;
    this.burst({ dur: 0.07, freq: 900, gain: 0.25, type: 'bandpass', q: 2 });
  }

  kill(big) {
    if (!this.ok('kill', 0.06)) return;
    this.burst({ dur: big ? 0.5 : 0.18, freq: big ? 300 : 600, sweep: 100, gain: big ? 0.6 : 0.25 });
  }

  groan() {
    if (!this.ok('groan', 1.4)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const base = 70 + Math.random() * 50;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 0.75, t + 0.9);
    const lfo = c.createOscillator();
    lfo.frequency.value = 6 + Math.random() * 4;
    const lg = c.createGain();
    lg.gain.value = 8;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    f.Q.value = 4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    o.connect(f);
    f.connect(g);
    g.connect(this.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.05);
    lfo.stop(t + 1.05);
  }

  stomp(vol) {
    if (!this.ok('stomp', 0.2)) return;
    this.tone({ freq: 70, to: 28, dur: 0.35, gain: 0.8 * vol });
    this.burst({ dur: 0.25, freq: 250, gain: 0.3 * vol });
  }

  hurt() {
    if (!this.ok('hurt', 0.15)) return;
    this.tone({ freq: 200, to: 90, dur: 0.18, gain: 0.35, type: 'square' });
    this.burst({ dur: 0.12, freq: 700, gain: 0.3 });
  }

  reload() {
    if (!this.ok('reload', 0.1)) return;
    this.burst({ dur: 0.05, freq: 2500, gain: 0.25, type: 'bandpass', q: 6 });
  }

  reloadDone() {
    if (!this.ok('reloadDone', 0.1)) return;
    this.burst({ dur: 0.06, freq: 1800, gain: 0.3, type: 'bandpass', q: 6 });
    this.burst({ dur: 0.05, freq: 3200, gain: 0.25, type: 'bandpass', q: 8 });
  }

  empty() {
    if (!this.ok('empty', 0.2)) return;
    this.burst({ dur: 0.03, freq: 3500, gain: 0.3, type: 'bandpass', q: 10 });
  }

  pickup() {
    if (!this.ok('pickup', 0.08)) return;
    this.tone({ freq: 520, dur: 0.1, gain: 0.2, type: 'triangle' });
    this.tone({ freq: 780, dur: 0.14, gain: 0.2, type: 'triangle', delay: 0.07 });
  }

  level() {
    if (!this.ok('level', 0.3)) return;
    [392, 494, 587, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.25, gain: 0.18, type: 'triangle', delay: i * 0.08 }));
  }

  wave() {
    if (!this.ok('wave', 1)) return;
    this.tone({ freq: 110, to: 90, dur: 1.4, gain: 0.25, type: 'sawtooth' });
    this.tone({ freq: 55, dur: 1.4, gain: 0.3 });
  }

  turret() {
    if (!this.ok('turret', 0.12)) return;
    this.burst({ dur: 0.07, freq: 2600, sweep: 800, gain: 0.22 });
  }

  explosion() {
    if (!this.ok('explosion', 0.08)) return;
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
    if (!this.ok('buy', 0.05)) return;
    this.tone({ freq: 880, dur: 0.08, gain: 0.18, type: 'triangle' });
    this.tone({ freq: 1320, dur: 0.12, gain: 0.15, type: 'triangle', delay: 0.06 });
  }

  exhausted() {
    if (!this.ok('exhausted', 1)) return;
    this.burst({ dur: 0.5, freq: 1200, gain: 0.15, type: 'bandpass', q: 1, attack: 0.15 });
  }
}

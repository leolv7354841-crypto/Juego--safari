// Director de oleadas: decide cuántos zombis salen, de qué tipo y por dónde.
import { MAX_ALIVE, WORLD_SIZE } from './config.js';
import { rand, randInt, TAU } from './util.js';

export class Director {
  constructor() {
    this.wave = 0;
    this.state = 'break';
    this.timer = 3;
    this.queue = [];
    this.spawnT = 0;
    this.waveSize = 0;
  }

  get hpMult() {
    return 1 + Math.max(0, this.wave - 4) * 0.07;
  }
  get speedMult() {
    return 1 + Math.min(0.25, Math.max(0, this.wave - 3) * 0.02);
  }

  startWave(game) {
    this.wave++;
    const w = this.wave;
    const normals = 8 + w * 6 + Math.floor(Math.pow(w, 1.5));
    const fats = w >= 2 ? Math.floor((w - 1) * 1.6) : 0;
    const giants = w >= 4 ? 1 + Math.floor((w - 4) / 3) : 0;
    const q = [];
    for (let i = 0; i < normals; i++) q.push('normal');
    for (let i = 0; i < fats; i++) q.splice(randInt(Math.floor(q.length * 0.2), q.length), 0, 'fat');
    // los gigantes llegan en la segunda mitad de la oleada
    for (let i = 0; i < giants; i++) q.splice(randInt(Math.floor(q.length * 0.45), q.length), 0, 'giant');
    this.queue = q;
    this.waveSize = q.length;
    this.interval = Math.max(0.55, 2.4 - w * 0.12);
    this.spawnT = 0.5;
    this.state = 'active';
    game.banner(`Oleada ${w}`, giants ? 'Se acerca un gigante' : fats ? 'Cuidado con los gordos' : 'Sobrevive');
    game.sfx.wave();
  }

  update(dt, game) {
    if (this.state === 'break') {
      this.timer -= dt;
      if (this.timer <= 0) this.startWave(game);
      return;
    }
    const alive = game.horde.list.length;
    this.spawnT -= dt;
    if (this.queue.length && this.spawnT <= 0 && alive < MAX_ALIVE) {
      this.spawnGroup(game);
      this.spawnT = this.interval * rand(0.7, 1.3);
    }
    if (!this.queue.length && alive <= Math.max(2, Math.floor(this.waveSize * 0.06))) {
      this.state = 'break';
      this.timer = 6;
      game.banner(`Oleada ${this.wave} superada`, 'Recupera el aliento');
    }
  }

  spawnGroup(game) {
    const size = Math.min(this.queue.length, randInt(3, 4 + Math.floor(this.wave * 0.8)));
    const cam = game.camera;
    const radius = Math.hypot(cam.viewW, cam.viewH) / 2 + 70;
    const p = game.player;
    const world = game.world;
    for (let attempt = 0; attempt < 14; attempt++) {
      const a = rand(0, TAU);
      const d = radius + rand(30, 200);
      const cx = p.x + Math.cos(a) * d;
      const cy = p.y + Math.sin(a) * d;
      if (cx < 80 || cy < 80 || cx > WORLD_SIZE - 80 || cy > WORLD_SIZE - 80) continue;
      if (!world.reachable(cx, cy)) continue;
      let placed = 0;
      for (let i = 0; i < size; i++) {
        const type = this.queue[0];
        const r = type === 'giant' ? 44 : type === 'fat' ? 22 : 14;
        for (let t = 0; t < 6; t++) {
          const x = cx + rand(-90, 90);
          const y = cy + rand(-90, 90);
          if (world.pointBlocked(x, y, r + 2) || !world.reachable(x, y)) continue;
          game.horde.spawn(type, x, y, this.hpMult, this.speedMult);
          this.queue.shift();
          placed++;
          break;
        }
        if (!this.queue.length) break;
      }
      if (placed) return;
    }
  }
}

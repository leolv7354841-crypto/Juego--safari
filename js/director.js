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
    // hordas masivas: 5 veces más normales y velocistas que antes
    const normals = 5 * (32 + w * 18 + Math.floor(Math.pow(w, 1.8)));
    const sprinters = 5 * (3 + Math.floor((w - 1) * 3.5));
    const fats = w >= 2 ? Math.floor((w - 1) * 2) : 0;
    const giants = w >= 4 ? 1 + Math.floor((w - 4) / 3) : 0;
    const q = [];
    for (let i = 0; i < normals; i++) q.push('normal');
    for (let i = 0; i < sprinters; i++) q.splice(randInt(Math.floor(q.length * 0.1), q.length), 0, 'sprinter');
    for (let i = 0; i < fats; i++) q.splice(randInt(Math.floor(q.length * 0.2), q.length), 0, 'fat');
    // los gigantes llegan en la segunda mitad de la oleada
    for (let i = 0; i < giants; i++) q.splice(randInt(Math.floor(q.length * 0.45), q.length), 0, 'giant');
    this.queue = q;
    this.waveSize = q.length;
    this.interval = Math.max(0.3, 1.5 - w * 0.08);
    this.spawnT = 0.5;
    this.state = 'active';
    this.straggleT = 0;
    game.banner(`Oleada ${w}`, giants ? 'Se acerca un gigante' : w === 1 ? 'Llegan los velocistas' : fats ? 'Cuidado con los gordos' : 'Sobrevive');
    game.sfx.wave();
  }

  // Lo llama el botón INICIAR SIGUIENTE RONDA.
  nextRound(game) {
    if (this.state !== 'waiting') return false;
    this.startWave(game);
    return true;
  }

  update(dt, game) {
    if (this.state === 'waiting') return;
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
    // la ronda termina al eliminar al último zombi; la siguiente espera al jugador
    if (!this.queue.length && alive === 0) {
      this.state = 'waiting';
      game.onWaveCleared();
      return;
    }
    if (!this.queue.length && alive <= 5) this.herdStragglers(dt, game);
  }

  // Si quedan pocos zombis atascados lejos, los acerca para que la ronda no se trabe.
  herdStragglers(dt, game) {
    this.straggleT = (this.straggleT || 0) + dt;
    if (this.straggleT < 6) return;
    this.straggleT = 0;
    const p = game.player;
    const cam = game.camera;
    const radius = Math.hypot(cam.viewW, cam.viewH) / 2 + 60;
    for (const z of game.horde.list) {
      if (Math.hypot(z.x - p.x, z.y - p.y) < 1100) continue;
      for (let t = 0; t < 12; t++) {
        const a = rand(0, TAU);
        const x = p.x + Math.cos(a) * radius;
        const y = p.y + Math.sin(a) * radius;
        if (x < 80 || y < 80 || x > WORLD_SIZE - 80 || y > WORLD_SIZE - 80) continue;
        if (game.world.pointBlocked(x, y, z.r + 2)) continue;
        z.x = x;
        z.y = y;
        break;
      }
    }
  }

  spawnGroup(game) {
    const size = Math.min(this.queue.length, randInt(14, 22 + this.wave * 3));
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
        const r = type === 'giant' ? 44 : type === 'fat' ? 22 : type === 'sprinter' ? 12 : 14;
        for (let t = 0; t < 6; t++) {
          const x = cx + rand(-150, 150);
          const y = cy + rand(-150, 150);
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
    // si el jugador está encerrado por barricadas no hay ruta: aparecer igualmente
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = rand(0, TAU);
      const d = radius + rand(30, 200);
      const x = p.x + Math.cos(a) * d;
      const y = p.y + Math.sin(a) * d;
      if (x < 80 || y < 80 || x > WORLD_SIZE - 80 || y > WORLD_SIZE - 80) continue;
      const type = this.queue[0];
      if (world.pointBlocked(x, y, type === 'giant' ? 46 : 24)) continue;
      game.horde.spawn(type, x, y, this.hpMult, this.speedMult);
      this.queue.shift();
      return;
    }
  }
}

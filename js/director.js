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
    // el 20% de los normales llega como policía SWAT
    const normalTotal = 5 * (32 + w * 18 + Math.floor(Math.pow(w, 1.8)));
    const swats = Math.round(normalTotal * 0.2);
    const normals = normalTotal - swats;
    const sprinters = 5 * (3 + Math.floor((w - 1) * 3.5));
    const fats = w >= 2 ? Math.floor((w - 1) * 2) : 0;
    // después de la oleada 10 llegan los super blindados: el 7% de toda la horda
    const heavies = w > 10 ? Math.round((normalTotal + sprinters + fats) * 0.07) : 0;
    const q = [];
    for (let i = 0; i < normals - heavies; i++) q.push('normal');
    for (let i = 0; i < heavies; i++) q.splice(randInt(0, q.length), 0, 'heavy');
    for (let i = 0; i < sprinters; i++) q.splice(randInt(Math.floor(q.length * 0.1), q.length), 0, 'sprinter');
    for (let i = 0; i < swats; i++) q.splice(randInt(0, q.length), 0, 'swat');
    for (let i = 0; i < fats; i++) q.splice(randInt(Math.floor(q.length * 0.2), q.length), 0, 'fat');
    this.queue = q;
    this.waveSize = q.length;
    this.interval = Math.max(0.3, 1.5 - w * 0.08);
    this.spawnT = 0.5;
    this.state = 'active';
    this.straggleT = 0;
    game.banner(`Oleada ${w}`, w === 11 ? 'Llegan los super blindados' : heavies ? 'Super blindados en la horda' : w === 1 ? 'Velocistas y policías SWAT' : fats ? 'Cuidado con los gordos' : 'Sobrevive');
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

  // Punto al azar sobre el borde de la pantalla (un poco por fuera), por cualquier lado.
  edgePoint(game, margin) {
    const cam = game.camera;
    const p = game.player;
    const hw = cam.viewW / 2 + margin;
    const hh = cam.viewH / 2 + margin;
    const per = 4 * (hw + hh);
    let t = rand(0, per);
    if (t < 2 * hw) return { x: p.x - hw + t, y: p.y - hh };
    t -= 2 * hw;
    if (t < 2 * hh) return { x: p.x + hw, y: p.y - hh + t };
    t -= 2 * hh;
    if (t < 2 * hw) return { x: p.x + hw - t, y: p.y + hh };
    t -= 2 * hw;
    return { x: p.x - hw, y: p.y + hh - t };
  }

  // Cada tanda se reparte en grupitos por todas las orillas de la pantalla.
  spawnGroup(game) {
    const world = game.world;
    let left = Math.min(this.queue.length, randInt(14, 22 + this.wave * 3));
    let tries = 0;
    while (left > 0 && this.queue.length && tries < 40) {
      tries++;
      const c = this.edgePoint(game, rand(40, 160));
      if (c.x < 80 || c.y < 80 || c.x > WORLD_SIZE - 80 || c.y > WORLD_SIZE - 80) continue;
      if (world.pointBlocked(c.x, c.y, 18) || !world.reachable(c.x, c.y)) continue;
      const cluster = Math.min(left, randInt(2, 5));
      for (let i = 0; i < cluster && this.queue.length; i++) {
        const type = this.queue[0];
        const r = type === 'fat' || type === 'heavy' ? 24 : type === 'sprinter' ? 12 : 15;
        for (let t = 0; t < 6; t++) {
          const x = c.x + rand(-45, 45);
          const y = c.y + rand(-45, 45);
          if (world.pointBlocked(x, y, r + 2) || !world.reachable(x, y)) continue;
          game.horde.spawn(type, x, y, this.hpMult, this.speedMult);
          this.queue.shift();
          left--;
          break;
        }
      }
    }
    if (left <= 0 || !this.queue.length) return;
    // si el jugador está encerrado por barricadas no hay ruta: aparecer igualmente en las orillas
    for (let attempt = 0; attempt < 12 && left > 0 && this.queue.length; attempt++) {
      const c = this.edgePoint(game, rand(40, 160));
      if (c.x < 80 || c.y < 80 || c.x > WORLD_SIZE - 80 || c.y > WORLD_SIZE - 80) continue;
      if (world.pointBlocked(c.x, c.y, 26)) continue;
      game.horde.spawn(this.queue.shift(), c.x, c.y, this.hpMult, this.speedMult);
      left--;
    }
  }
}

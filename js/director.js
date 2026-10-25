// Director de oleadas: decide cuántos zombis salen, de qué tipo y por dónde.
import { MAX_ALIVE, WORLD_SIZE, WAVES } from './config.js';
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
    // cooperativo: 1,4 veces la vida, pero la mitad de zombis (ver startWave)
    return WAVES.hp * (1 + Math.max(0, this.wave - 4) * 0.07) * (this.coop ? 1.4 : 1);
  }
  get speedMult() {
    return WAVES.speed * (1 + Math.min(0.25, Math.max(0, this.wave - 3) * 0.02));
  }

  startWave(game) {
    this.wave++;
    const w = this.wave;
    // hordas masivas: 5 veces más normales y velocistas que antes
    // el 20% de los normales llega como policía SWAT
    // cooperativo: la mitad de zombis que en solitario (eran demasiados)
    // en línea: crowd crece con el número de jugadores (ver NET.crowd)
    // WAVES.count: rondas más cortas; los tipos especiales que tocan salen al menos de a uno
    const m = (this.coop ? this.crowd || 0.5 : 1) * WAVES.count;
    const few = (n) => (n > 0 ? Math.max(1, Math.round(m * n)) : 0);
    const normalTotal = Math.round(m * 5 * (32 + w * 18 + Math.floor(Math.pow(w, 1.8))));
    const swats = Math.round(normalTotal * 0.2);
    const normals = normalTotal - swats;
    const sprinters = Math.round(m * 5 * (3 + Math.floor((w - 1) * 3.5)));
    const fats = few(w >= 2 ? Math.floor((w - 1) * 2) : 0);
    // después de la oleada 10 llegan los super blindados: el 7% de toda la horda
    const heavies = w > 10 ? Math.round((normalTotal + sprinters + fats) * 0.07) : 0;
    // toros desde la oleada 3: pocos, pero embisten
    const bulls = few(w >= 3 ? 2 + Math.floor((w - 3) * 2) : 0);
    const q = [];
    for (let i = 0; i < normals - heavies; i++) q.push('normal');
    for (let i = 0; i < heavies; i++) q.splice(randInt(0, q.length), 0, 'heavy');
    for (let i = 0; i < sprinters; i++) q.splice(randInt(Math.floor(q.length * 0.1), q.length), 0, 'sprinter');
    for (let i = 0; i < swats; i++) q.splice(randInt(0, q.length), 0, 'swat');
    for (let i = 0; i < fats; i++) q.splice(randInt(Math.floor(q.length * 0.2), q.length), 0, 'fat');
    for (let i = 0; i < bulls; i++) q.splice(randInt(Math.floor(q.length * 0.15), q.length), 0, 'bull');
    this.queue = q;
    this.waveSize = q.length;
    this.waveT = 0;
    this.spawnT = 0.3;
    this.state = 'active';
    this.straggleT = 0;
    game.banner(
      `Oleada ${w}`,
      w === 3
        ? 'Llegan los toros: esquiva sus embestidas'
        : w === 11
          ? 'Llegan los super blindados'
          : heavies
            ? 'Super blindados en la horda'
            : w === 1
              ? 'Velocistas y policías SWAT'
              : fats
                ? 'Cuidado con los gordos'
                : 'Sobrevive',
    );
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
    // toda la cola sale en los primeros WAVES.spawnTime s: cada ráfaga pone al día lo que toca
    this.waveT = (this.waveT || 0) + dt;
    this.spawnT -= dt;
    if (this.queue.length && this.spawnT <= 0) {
      this.spawnT = WAVES.burst;
      const due =
        Math.ceil(this.waveSize * Math.min(1, this.waveT / WAVES.spawnTime)) - (this.waveSize - this.queue.length);
      const room = MAX_ALIVE - alive;
      if (due > 0 && room > 0) this.spawnGroup(game, Math.min(due, room));
    }
    // la ronda termina al eliminar al último zombi (el dorado no cuenta); la siguiente espera al jugador
    if (!this.queue.length && !game.horde.list.some((z) => z.type !== 'golden' && !z.dead)) {
      // el dorado que quede escapa con la oleada
      for (const z of game.horde.list) if (z.type === 'golden' && !z.dead) game.onGoldenExpired(z);
      this.state = 'waiting';
      game.onWaveCleared();
      return;
    }
    this.herdStragglers(dt, game);
  }

  // Lo que ve cada jugador vivo: caja { x, y, hw, hh }. El de este equipo usa su cámara real;
  // los demás (cooperativo, servidor) mandan su media pantalla (vw, vh) y nunca se toma menos
  // que WAVES.view, por si aún no llegó o la mandan mal.
  views(game) {
    const [vw, vh] = WAVES.view;
    const out = [];
    if (game.targets) {
      for (const p of game.targets)
        if (p.alive) out.push({ x: p.x, y: p.y, hw: Math.max(vw, p.vw || 0), hh: Math.max(vh, p.vh || 0) });
      return out;
    }
    const cam = game.camera;
    const p = game.player;
    if (p && p.alive) out.push({ x: cam.x, y: cam.y, hw: cam.viewW / 2, hh: cam.viewH / 2 });
    const peer = game.coop && game.coop.isHost && game.coop.peer;
    if (peer && peer.alive)
      out.push({ x: peer.x, y: peer.y, hw: Math.max(vw, peer.vw || 0), hh: Math.max(vh, peer.vh || 0) });
    if (!out.length && p) out.push({ x: cam.x, y: cam.y, hw: cam.viewW / 2, hh: cam.viewH / 2 });
    return out;
  }

  // ¿Algún jugador vería un círculo de radio r en (x, y)? (con margen por la cámara que sigue a la mira)
  seen(views, x, y, r) {
    const m = r + 40;
    for (const v of views) if (Math.abs(x - v.x) < v.hw + m && Math.abs(y - v.y) < v.hh + m) return true;
    return false;
  }

  // ¿Hay ruta desde (x, y) hasta algún jugador? En el servidor cada jugador tiene su propio campo.
  canReach(game, x, y) {
    const world = game.world;
    if (game.targets) {
      for (const p of game.targets) if (p.alive && p.field && world.reachable(x, y, p.field)) return true;
      return false;
    }
    return (
      world.reachable(x, y) ||
      (!!(game.coop && game.coop.isHost && game.coop.peer) && world.reachable(x, y, world.main2))
    );
  }

  // Durante toda la ronda: el zombi que nadie ve y quedó lejos de todos (WAVES.lost) o atascado
  // vuelve a salir por fuera del equipo (ver edgePoint), por un punto con ruta. Nunca a la vista.
  herdStragglers(dt, game) {
    this.straggleT = (this.straggleT || 0) + dt;
    if (this.straggleT < WAVES.straggle) return;
    this.straggleT = 0;
    const views = this.views(game);
    if (!views.length) return;
    const lost = WAVES.lost * WAVES.lost;
    let moved = 0;
    for (const z of game.horde.list) {
      if (moved >= 60) break;
      if (z.dead || z.type === 'golden' || z.bs !== 'walk' || this.seen(views, z.x, z.y, z.r)) continue;
      let far = true;
      for (const v of views) if ((z.x - v.x) ** 2 + (z.y - v.y) ** 2 < lost) far = false;
      if (!far && z.stuck < 2) continue;
      for (let t = 0; t < 16; t++) {
        const c = this.edgePoint(game, rand(60, 160), views, t < 10);
        if (c.x < 80 || c.y < 80 || c.x > WORLD_SIZE - 80 || c.y > WORLD_SIZE - 80) continue;
        if (
          game.world.pointBlocked(c.x, c.y, z.r + 2) ||
          this.seen(views, c.x, c.y, z.r) ||
          !this.canReach(game, c.x, c.y)
        )
          continue;
        z.x = c.x;
        z.y = c.y;
        z.stuck = 0;
        z.anchor = -2;
        z.chkX = c.x;
        z.chkY = c.y;
        moved++;
        break;
      }
    }
  }

  // Punto al azar justo fuera de la caja que encierra las vistas de todo el equipo, por cualquier
  // lado: así nadie aparece entre dos jugadores separados. Con team = false (respaldo, cuando
  // esa orilla cae fuera del mapa) usa la vista de un solo jugador al azar.
  edgePoint(game, margin, views = this.views(game), team = true) {
    let v = views[randInt(0, views.length - 1)];
    if (!v) {
      const f = game.spawnFocus();
      v = { x: f.x, y: f.y, hw: WAVES.view[0], hh: WAVES.view[1] };
    } else if (team && views.length > 1) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const u of views) {
        x0 = Math.min(x0, u.x - u.hw);
        y0 = Math.min(y0, u.y - u.hh);
        x1 = Math.max(x1, u.x + u.hw);
        y1 = Math.max(y1, u.y + u.hh);
      }
      v = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, hw: (x1 - x0) / 2, hh: (y1 - y0) / 2 };
    }
    const hw = v.hw + margin;
    const hh = v.hh + margin;
    const per = 4 * (hw + hh);
    let t = rand(0, per);
    if (t < 2 * hw) return { x: v.x - hw + t, y: v.y - hh };
    t -= 2 * hw;
    if (t < 2 * hh) return { x: v.x + hw, y: v.y - hh + t };
    t -= 2 * hh;
    if (t < 2 * hw) return { x: v.x + hw - t, y: v.y + hh };
    t -= 2 * hw;
    return { x: v.x - hw, y: v.y + hh - t };
  }

  // Cada ráfaga (n zombis) se reparte en grupitos por las orillas, siempre fuera de la vista de todos.
  // Lo que no quepa sale en la siguiente ráfaga.
  spawnGroup(game, n) {
    const world = game.world;
    const views = this.views(game);
    let left = Math.min(this.queue.length, n);
    let tries = 0;
    while (left > 0 && this.queue.length && tries < 40) {
      tries++;
      const c = this.edgePoint(game, rand(70, 180), views, tries <= 28);
      if (c.x < 80 || c.y < 80 || c.x > WORLD_SIZE - 80 || c.y > WORLD_SIZE - 80) continue;
      if (world.pointBlocked(c.x, c.y, 18) || !this.canReach(game, c.x, c.y)) continue;
      const cluster = Math.min(left, randInt(2, 5));
      for (let i = 0; i < cluster && this.queue.length; i++) {
        const type = this.queue[0];
        const r = type === 'fat' || type === 'heavy' || type === 'bull' ? 24 : type === 'sprinter' ? 12 : 15;
        for (let t = 0; t < 6; t++) {
          const x = c.x + rand(-45, 45);
          const y = c.y + rand(-45, 45);
          if (world.pointBlocked(x, y, r + 2) || !this.canReach(game, x, y) || this.seen(views, x, y, r)) continue;
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
      const c = this.edgePoint(game, rand(70, 180), views, attempt < 6);
      if (c.x < 80 || c.y < 80 || c.x > WORLD_SIZE - 80 || c.y > WORLD_SIZE - 80) continue;
      if (world.pointBlocked(c.x, c.y, 26) || this.seen(views, c.x, c.y, 26)) continue;
      game.horde.spawn(this.queue.shift(), c.x, c.y, this.hpMult, this.speedMult);
      left--;
    }
  }
}

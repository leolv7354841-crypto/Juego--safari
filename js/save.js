// Progreso guardado de la partida en solitario: guardar, cargar y reanudar una ronda a medias.
import {
  xpForLevel,
  SHOP,
  WEAPONS,
  WEAPON_ORDER,
  START_WEAPON,
  WAVES,
  ZOMBIE_VARIANTS,
  EVENTS,
} from './core/config.ts';
import { storage } from './core/util.ts';
import { isClass } from './sim/abilities.ts';
import { heavyMaxHp } from './sim/heavy.ts';

// Cada cuenta tiene dos guardados: el automático (también a mitad de ronda) y el punto
// de control al terminar cada ronda, para continuar tras morir (ver accounts.js).

// Se guarda cada pocos segundos, también a mitad de ronda (con los zombis vivos),
// y al cerrar o minimizar la página. Al terminar una ronda se crea además un punto de control.
export function saveProgress(game) {
  if (!game.mode.savesProgress()) return;
  const p = game.player;
  const ds = game.director.state;
  if (!p || !p.alive || (ds !== 'waiting' && ds !== 'active')) return;
  const s = game.structures;
  const queue = {};
  for (const t of game.director.queue) queue[t] = (queue[t] || 0) + 1;
  const data = {
    v: 1,
    savedAt: Date.now(),
    dstate: ds,
    queue,
    waveSize: game.director.waveSize,
    zombies:
      ds === 'active'
        ? game.horde.list
            .filter((z) => !z.dead && z.type !== 'golden')
            .map((z) => [z.type, Math.round(z.x), Math.round(z.y), Math.ceil(z.hp)])
        : [],
    seed: game.world.seedBase,
    wave: game.director.wave,
    ev: ds === 'active' ? game.director.event : '',
    time: game.time,
    kills: game.kills,
    level: game.level,
    xp: game.xp,
    taken: game.taken,
    money: game.money,
    moneyEarned: game.moneyEarned,
    inv: game.inv,
    buildSel: game.buildSel,
    player: {
      x: p.x,
      y: p.y,
      hp: p.hp,
      stamina: p.stamina,
      stats: p.stats,
      weapons: p.weapons.map((w) => ({ id: w.id, mag: w.mag, reserve: w.reserve === Infinity ? -1 : w.reserve })),
      wi: p.wi,
      shotsFired: p.shotsFired,
      shotsHit: p.shotsHit,
      damageTaken: p.damageTaken,
      cls: p.cls,
      abCd: p.abCd,
      heavyAmmo: p.heavyAmmo,
    },
    blocks: s.blocks.map((b) => ({ kind: b.kind, x: b.x, y: b.y, w: b.w, h: b.h, hp: b.hp, up: b.up || 0 })),
    wires: s.wires.map((b) => ({ kind: b.kind, x: b.x, y: b.y, w: b.w, h: b.h, hp: b.hp })),
    robot: { ...game.robot.serialize(), piloted: game.robot.piloted },
    // la misma partida sigue en las estadísticas al continuarla
    partida: game.analitica.partida ? game.analitica.partida.id : null,
  };
  storage.set(game.accounts.saveKey(), data);
  if (ds === 'waiting') storage.set(game.accounts.checkKey(), data);
  // copia en la nube (si el juego corre como Artifact con base de datos), sin saturar
  const now = Date.now();
  if (ds === 'waiting' || now - (game.cloudSavedAt || 0) > 20000) {
    game.cloudSavedAt = now;
    game.accounts.cloudSave('save', data);
    if (ds === 'waiting') game.accounts.cloudSave('check', data);
  }
  game.saveT = 0;
}

export function loadProgress(game, kind = 'save') {
  const key = kind === 'check' ? game.accounts.checkKey() : game.accounts.saveKey();
  let d = storage.get(key, null);
  if (!d && kind === 'save') d = storage.get(game.accounts.checkKey(), null);
  if (!d || d.v !== 1) return false;
  game.sfx.unlock();
  if (game.world.seedBase !== d.seed) game.newWorld(d.seed);
  game.resetRun();
  Object.assign(game.kills, d.kills);
  game.time = d.time;
  game.level = d.level;
  game.xp = d.xp;
  game.xpNeed = xpForLevel(d.level);
  game.taken = d.taken || {};
  game.money = d.money;
  game.moneyEarned = d.moneyEarned;
  Object.assign(game.inv, d.inv);
  game.buildSel = d.buildSel || 'wood';
  const p = game.player;
  const sp = d.player;
  Object.assign(p.stats, sp.stats);
  p.x = sp.x;
  p.y = sp.y;
  p.hp = Math.min(sp.hp, p.stats.maxHp);
  p.stamina = sp.stamina;
  // (partidas viejas: la pistola se cambia por el arma inicial, que siempre tiene balas infinitas)
  p.weapons = sp.weapons
    .filter((w) => WEAPONS[w.id] && w.id !== 'pistol' && w.id !== START_WEAPON)
    .map((w) => ({ id: w.id, def: WEAPONS[w.id], mag: w.mag, reserve: w.reserve < 0 ? Infinity : w.reserve }));
  p.weapons.unshift(p.makeWeapon(START_WEAPON));
  p.weapons.sort((a, b) => WEAPON_ORDER.indexOf(a.id) - WEAPON_ORDER.indexOf(b.id));
  p.wi = Math.min(sp.wi, p.weapons.length - 1);
  p.shotsFired = sp.shotsFired;
  p.shotsHit = sp.shotsHit;
  p.damageTaken = sp.damageTaken;
  // partidas guardadas antes de las clases: la última elegida
  p.cls = isClass(sp.cls) ? sp.cls : game.classPick;
  p.abCd = Math.max(0, Number(sp.abCd) || 0);
  p.heavyAmmo = Math.max(0, Number(sp.heavyAmmo) || 0);
  game.analitica.iniciar('solo', typeof d.partida === 'string' ? d.partida : null);
  for (const b of d.blocks) {
    if (!SHOP[b.kind]) continue;
    const o = {
      k: 0,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      low: true,
      block: true,
      kind: b.kind,
      hp: b.hp,
      max: SHOP[b.kind].hp,
      hitT: 0,
      cd: 0,
      ang: 0,
      // mejoras de la torreta pesada (partidas de antes: ninguna)
      up: Math.max(0, Number(b.up) | 0),
      owner: null,
    };
    if (o.kind === 'heavy') o.max = heavyMaxHp(o);
    game.structures.blocks.push(o);
    game.world.addDynamic(o);
  }
  game.structures.relayer();
  game.robot.restore(d.robot);
  if (d.robot && d.robot.piloted && !game.robot.broken) game.robot.board(p);
  for (const b of d.wires) if (SHOP[b.kind]) game.structures.wires.push({ ...b, max: SHOP[b.kind].hp, hitT: 0 });
  const dir = game.director;
  dir.wave = d.wave;
  dir.state = 'waiting';
  if (d.dstate === 'active') {
    // reanudar la ronda a medias: los zombis vuelven donde estaban y el resto sigue en cola
    dir.state = 'active';
    dir.event = EVENTS.types[d.ev] ? d.ev : '';
    dir.lastEvent = dir.event;
    const q = [];
    for (const [t, n] of Object.entries(d.queue || {})) for (let i = 0; i < n; i++) q.push(t);
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    dir.queue = q;
    dir.waveSize = d.waveSize || q.length;
    dir.waveT = WAVES.spawnTime * (1 - q.length / dir.waveSize);
    dir.spawnT = 1;
    for (const [t, x, y, hp] of d.zombies || []) {
      if (!ZOMBIE_VARIANTS[t]) continue;
      const z = game.horde.spawn(t, x, y, dir.hpMult, dir.speedMult);
      z.hp = Math.min(hp, z.maxHp);
    }
  }
  game.camera.x = p.x;
  game.camera.y = p.y;
  game.world.updateFlow(p.x, p.y);
  game.input.reset();
  game.input.setRun(false);
  game.setState('play');
  game.updateHud(true);
  game.toast(
    d.dstate === 'active'
      ? `Progreso cargado · ronda ${d.wave} en curso`
      : `Progreso cargado · ronda ${d.wave} superada`,
  );
  game.saveT = 0;
  return true;
}

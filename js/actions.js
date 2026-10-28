// Acciones del jugador local (teclas y botones): habilidad, robot, torreta pesada, construir y lanzar.
// En línea varias se piden al servidor (game.online.act) en vez de aplicarse aquí.
import { BUILD_ORDER, SHOP } from './core/config.ts';
import { Abilities, abilityTarget } from './sim/abilities.ts';

// X o el botón: misil donde apuntas, megarráfaga o impulso.
export function useAbility(game) {
  const p = game.player;
  if (!p.cls || !p.alive) return;
  if (p.abCd > 0) return game.toast(`Habilidad lista en ${Math.ceil(p.abCd)} s`);
  const t = abilityTarget(game, p);
  // en línea la usa el servidor; aquí se ve al instante (el misil llega con la siguiente foto)
  game.mode.sendAbility(p, t);
  Abilities.use(game, p, t.x, t.y, null);
  game.updateHud(false);
}

// Subirse o bajarse del robot (E o el botón ROBOT). Junto a una torreta pesada, la monta.
export function toggleRobot(game) {
  const p = game.player;
  // en línea la monta y la deja el servidor (que repite estas comprobaciones)
  if (game.mode.viaServer() && (p.manned || (!p.inRobot && game.structures.nearHeavy(p))))
    return game.online.act('robot');
  if (p.manned) return leaveHeavy(game);
  if (!p.inRobot) {
    const h = game.structures.nearHeavy(p);
    if (h) return mountHeavy(game, h);
  }
  const rb = game.robot;
  if (!rb.owned) {
    if (game.structures.blocks.some((b) => b.kind === 'heavy'))
      return game.toast('Acércate a la torreta pesada para montarla');
    return game.toast('Compra el robot de combate en la tienda');
  }
  // en línea se sube o se baja en el servidor (que repite estas mismas comprobaciones)
  if (game.mode.viaServer()) {
    if (!rb.piloted && rb.broken) return game.toast('Robot destruido: repáralo en la tienda');
    if (!rb.piloted && !rb.near(p)) return game.toast('Acércate al robot para subirte');
    return game.online.act('robot');
  }
  if (rb.piloted) {
    rb.leave(p, game.world);
    game.sfx.build();
    return;
  }
  if (rb.broken) return game.toast('Robot destruido: repáralo en la tienda');
  if (!rb.near(p)) return game.toast('Acércate al robot para subirte');
  rb.board(p);
  game.sfx.punch();
  game.camera.shake(0.2);
}

export function mountHeavy(game, b) {
  const p = game.player;
  game.structures.mountHeavy(p, b);
  game.sfx.build();
  game.camera.shake(0.12);
  if (p.heavyAmmo <= 0) game.toast('Torreta sin balas: cómpralas en la tienda');
}

export function leaveHeavy(game) {
  game.structures.leaveHeavy(game.player);
  game.sfx.build();
}

export function startNextRound(game) {
  if (game.mode.sendNextRound()) return;
  if (game.state !== 'play' || (!game.player.alive && !game.mode.inGroup())) return;
  game.sfx.unlock();
  if (game.director.nextRound(game)) game.updateHud(false);
}

export function tryBuild(game) {
  if (game.inv[game.buildSel] <= 0) {
    const next = BUILD_ORDER.find((k) => game.inv[k] > 0);
    if (!next) {
      game.toast('Compra barricadas en la tienda');
      return;
    }
    game.buildSel = next;
  }
  // en línea lo coloca el servidor (y descuenta la pieza); aquí sólo se avisa si no cabe
  if (!game.mode.canBuild()) {
    if (game.structures.placement(game, game.buildSel).ok) game.mode.sendBuild(game.buildSel);
    else game.toast('No cabe ahí');
    return;
  }
  if (game.structures.place(game, game.buildSel)) {
    game.inv[game.buildSel]--;
    game.sfx.build();
    if (game.inv[game.buildSel] <= 0) {
      const next = BUILD_ORDER.find((k) => game.inv[k] > 0);
      if (next) game.buildSel = next;
    }
  } else {
    game.toast('No cabe ahí');
  }
}

export function cycleBuild(game) {
  const owned = BUILD_ORDER.filter((k) => game.inv[k] > 0);
  if (!owned.length) return;
  const i = owned.indexOf(game.buildSel);
  game.buildSel = owned[(i + 1) % owned.length];
  game.toast(SHOP[game.buildSel].name);
}

export function tryGrenade(game, kind = 'grenade') {
  if (game.inv[kind] <= 0) {
    game.toast(kind === 'molotov' ? 'Sin molotovs: cómpralos en la tienda' : 'Sin granadas: cómpralas en la tienda');
    return;
  }
  const p = game.player;
  let tx;
  let ty;
  if (game.input.mode === 'mouse') {
    const m = mouseWorld(game);
    tx = m.x;
    ty = m.y;
  } else if (p.target && !p.target.dead) {
    tx = p.target.x;
    ty = p.target.y;
  } else {
    tx = p.x + Math.cos(p.angle) * 220;
    ty = p.y + Math.sin(p.angle) * 220;
  }
  game.inv[kind]--;
  // en línea la lanza el servidor; la cuenta se corrige con su siguiente foto
  if (game.mode.sendThrow(kind, tx, ty)) return;
  if (kind === 'molotov') game.structures.throwMolotov(game, tx, ty);
  else game.structures.throwGrenade(game, tx, ty);
}

export function mouseWorld(game) {
  const m = game.input.mouse;
  return { x: (m.x * game.dpr - game.base.tx) / game.base.z, y: (m.y * game.dpr - game.base.ty) / game.base.z };
}

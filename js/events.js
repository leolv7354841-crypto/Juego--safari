// Eventos de combate del jugador local: bajas, botín, ácido, cohetes, golpes y muerte. Las reglas en sí
// (iguales en el servidor) viven en sim/rules.js; aquí se decide qué pasa con el dinero y los avisos.
import { clamp, storage } from './core/util.ts';
import * as Rules from './sim/rules.ts';
import { comboBreak, comboKill, comboTick } from './sim/combo.ts';

export function hitZombie(game, z, b, hx, hy) {
  // cliente en línea: sus balas son de adorno, el daño real lo calcula el servidor
  if (z.dead || !game.mode.authority()) return;
  if (Rules.hitZombie(game, z, b, hx, hy, () => game.player.shotsHit++)) killZombie(game, z);
}

export function killZombie(game, z) {
  // la baja alarga la racha de quien la hizo y su multiplicador sube el dinero y la experiencia
  const mult = z.dead || game.state === 'menu' ? 1 : comboKill(game.player.combo, z.type);
  Rules.killZombie(game, z, {
    kills: game.kills,
    xp: (zb) => addXp(game, Math.round(zb.def.xp * mult)),
    bounty: (zb) => {
      const n = Rules.bountyNow(game, zb.type, mult);
      game.money += n;
      game.moneyEarned += n;
    },
    // recompensa única del zombi dorado (para quien lo mató)
    golden: (_zb, reward) => {
      game.money += reward;
      game.moneyEarned += reward;
      game.moneyPop(`+$${reward}`, 'gold');
      game.sfx.gold();
      game.toast(`¡Zombi dorado! +$${reward}`);
    },
    toast: game.toast,
  });
}

export const rocketHit = Rules.rocketHit;

export const rocketBlast = Rules.rocketBlast;

export const heavyBlast = Rules.heavyBlast;

export const onSuperPunch = (game, _z, x, y) => Rules.superPunch(game, x, y);

// Ácido del gordo: quema unos segundos (vida por segundo) y nubla la vista.
export function applyAcid(game) {
  if (!Rules.canBurn(game, game.player)) return;
  Rules.startAcid(game);
  game.hurtFlash = Math.min(1, game.hurtFlash + 0.3);
  game.sfx.sizzle();
  game.toast('¡Ácido! Te estás quemando');
}

export function setAcid(game, t) {
  game.acidT = t;
  const k = t > 0 ? Math.min(1, t / 0.8) : 0;
  const q = Math.round(k * 10);
  if (q === game.acidQ) return;
  game.acidQ = q;
  // desenfoque real del lienzo (Chrome y Safari); el HUD queda nítido
  game.canvas.style.filter = q ? `blur(${(q * 0.32).toFixed(2)}px) saturate(${(1 - q * 0.04).toFixed(2)})` : '';
}

export function updateAcid(game, dt) {
  if (!(game.acidT > 0)) return;
  const p = game.player;
  const left = Rules.acidStep(
    game,
    p,
    game,
    dt,
    () => {
      game.hurtFlash = Math.min(1, game.hurtFlash + 0.15);
      game.sfx.sizzle();
    },
    () => onPlayerDeath(game),
  );
  setAcid(game, left);
}

// El dorado se fue sin que lo mataras: no da nada ni cuenta como baja.
export function onGoldenExpired(game, z) {
  z.dead = true;
  game.particles.dust(z.x, z.y, 20);
  game.particles.pickupFx(z.x, z.y, '#8a7a40');
  game.toast('El zombi dorado escapó');
}

// Cada golpe de zombi cuesta dinero (una sola vez por golpe).
export function onZombieHit(game) {
  // dentro del robot los golpes no te cuestan dinero: los aguanta el blindaje
  if (game.state === 'menu' || game.player.inRobot || game.player.boostT > 0) return;
  // el golpe corta la racha
  if (game.mode.authority()) comboBreak(game.player.combo);
  const loss = Rules.hitLoss(game.money);
  if (loss <= 0) return;
  game.money -= loss;
  game.moneyPop(`-$${loss}`, 'loss');
  game.sfx.moneyLost();
  game.updateHud(false);
}

export const spawnGolden = (game) => Rules.spawnGolden(game, game.toast);

export function onGiantStep(game, z) {
  const p = game.player;
  const d = Math.hypot(p.x - z.x, p.y - z.y);
  const vol = clamp(1 - d / 750, 0, 1);
  game.particles.dust(z.x - Math.cos(z.angle) * 10, z.y - Math.sin(z.angle) * 10, z.r);
  if (vol > 0 && game.state === 'play') {
    game.camera.shake(0.16 * vol);
    game.sfx.stomp(vol);
  }
}

// Reloj de la racha propia.
export function updateCombo(game, dt) {
  comboTick(game.player, dt);
}

export function addXp(game, n) {
  game.pendingLevels += Rules.gainXp(game, n);
}

export function onPlayerDeath(game) {
  // la partida venía de una sala en línea (te fuiste): se pierde sólo esa
  if (!game.mode.savesProgress()) {
    recordScore(game);
    game.deathT = 1.6;
    game.input.reset();
    game.camera.shake(0.6);
    return;
  }
  // al morir se pierde la partida: la siguiente empieza desde cero (el récord sí se guarda)
  storage.remove(game.accounts.saveKey());
  storage.remove(game.accounts.checkKey());
  game.accounts.cloudClear();
  recordScore(game);
  game.deathT = 1.6;
  game.input.reset();
  game.camera.shake(0.6);
}

export function onWaveCleared(game) {
  game.shopPending = true;
  game.sfx.level();
  game.saveProgress();
  recordScore(game);
}

// Mejor marca de la cuenta: oleada alcanzada y bajas.
export function recordScore(game) {
  if (game.state === 'menu') return;
  if (
    game.accounts.recordScore({
      wave: game.director.wave,
      kills: totalKills(game),
      time: Math.round(game.time),
      level: game.level,
    })
  ) {
    game.toast('Nuevo récord de tu cuenta');
  }
}

export function totalKills(game) {
  const k = game.kills;
  return k.normal + (k.swat || 0) + k.sprinter + k.fat + (k.heavy || 0) + (k.golden || 0) + k.giant;
}

export function onRobotHit(game, dmg) {
  // se acabó el blindaje: explota y sales despedido
  if (Rules.robotHit(game, game.robot, dmg, game.player)) game.toast('¡Robot destruido! Repáralo en la tienda');
}

// Alrededor de quién aparecen los zombis.
export function spawnFocus(game) {
  return game.player;
}

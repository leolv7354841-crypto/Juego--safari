// Habilidades de clase: cada partida el jugador elige una (Bomber, Berserker o Booster) y la usa
// cada cierto tiempo. Lo usan el juego del navegador y el servidor en línea.
import { ABILITY, CLASS_ORDER, WEAPONS } from '../core/config.ts';
import { rand } from '../core/util.ts';
import type { GameHost, Vec } from '../core/types.d.ts';
import type { Player, WeaponDef } from './player.ts';

const P = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
export const CLASSES = {
  bomber: {
    name: 'Bomber',
    desc: 'Misil balístico: cae donde apuntas con el triple de radio y el doble de daño que la bazuca.',
    icon: `<svg viewBox="0 0 24 24" ${P}><path d="M12 2c2 2 3 5 3 8v6H9v-6c0-3 1-6 3-8z"/><path d="M9 13l-3 3v3l3-2M15 13l3 3v3l-3-2M10 19l2 3 2-3"/></svg>`,
  },
  berserker: {
    name: 'Berserker',
    desc: 'Saca tres ametralladoras y lanza una megarráfaga: tres cargadores en 3 segundos.',
    icon: `<svg viewBox="0 0 24 24" ${P}><path d="M3 6h13l2 1M3 12h15l2 1M3 18h13l2 1"/><path d="M6 6v2M6 12v2M6 18v2"/></svg>`,
  },
  booster: {
    name: 'Booster',
    desc: 'Inmune a todo ataque durante 2 segundos y 3 veces más rápido.',
    icon: `<svg viewBox="0 0 24 24" ${P}><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="M13 7l-3 6h4l-3 5"/></svg>`,
  },
};

export const isClass = (c: string) => CLASS_ORDER.includes(c);

// Ametralladoras de la megarráfaga: las de la tienda con el daño y la perforación de la habilidad.
const RAGE_GUN: WeaponDef = {
  ...(WEAPONS as Record<string, WeaponDef>)[ABILITY.berserker.weapon],
  damage: ABILITY.berserker.damage,
  pierce: ABILITY.berserker.pierce,
};

// Espera de la habilidad con las mejoras tomadas (nunca menos de ABILITY.minCooldown).
export function cooldownOf(p: Pick<Player, 'stats'>) {
  return Math.max(ABILITY.minCooldown, ABILITY.cooldown * (p.stats.cdMult || 1));
}

// A dónde apunta la habilidad: el ratón, el zombi fijado o un poco delante de la mira.
export function abilityTarget(game: GameHost, p: Player): Vec {
  if (game.input.mode === 'mouse') return game.mouseWorld();
  if (p.target && !p.target.dead) return { x: p.target.x, y: p.target.y };
  return { x: p.x + Math.cos(p.angle) * 350, y: p.y + Math.sin(p.angle) * 350 };
}

export const Abilities = {
  ready(p: Player) {
    return !!p.cls && p.alive && !(p.abCd > 0);
  },

  // Lanza la habilidad. owner: dueño de las bajas (en línea, el id del jugador).
  // Sin autoridad (invitado o cliente en línea) el misil lo crea quien simula.
  /** @param {string | null} [owner] */
  use(game: GameHost, p: Player, tx: number, ty: number, owner: string | null = null) {
    if (!this.ready(p)) return false;
    p.abCd = cooldownOf(p);
    if (p.cls === 'bomber') {
      if (game.mode.authority()) game.structures.launchMissile(game, p, tx, ty, owner);
    } else if (p.cls === 'berserker') {
      p.rageT = ABILITY.berserker.time;
      p.rageAcc = 0;
      p.rageShots = 0;
    } else if (p.cls === 'booster') {
      p.boostT = ABILITY.booster.time;
      game.sfx.boost();
      game.particles.ring(p.x, p.y, 30, '120,200,255');
    }
    return true;
  },

  // Espera y megarráfaga (boostT lo baja Player.move, que también usa la predicción en línea).
  update(dt: number, game: GameHost, p: Player) {
    if (p.abCd > 0) p.abCd = Math.max(0, p.abCd - dt);
    if (!(p.rageT > 0)) return;
    if (!p.alive) {
      p.rageT = 0;
      return;
    }
    const step = Math.min(dt, p.rageT);
    p.rageT -= step;
    const B = ABILITY.berserker;
    const d = RAGE_GUN;
    // 3 cargadores de la ametralladora repartidos en la duración, sin depender de los fps
    const rate = (d.mag * B.mags) / B.time;
    p.rageAcc += rate * step;
    // redondeo del último paso: que salga la última bala
    if (p.rageT <= 0) p.rageAcc += 1e-6;
    const ca = Math.cos(p.angle);
    const sa = Math.sin(p.angle);
    const fired: number[] = [];
    let ox = p.x;
    let oy = p.y;
    while (p.rageAcc >= 1) {
      p.rageAcc -= 1;
      p.rageGun = ((p.rageGun || 0) + 1) % B.guns;
      // los 3 cañones van uno al lado del otro, atravesados a la mira
      const side = (p.rageGun - (B.guns - 1) / 2) * 9;
      const tip = p.r + 26;
      let sx = p.x + ca * tip - sa * side;
      let sy = p.y + sa * tip + ca * side;
      if (game.world.pointBlocked(sx, sy, 0, true)) {
        sx = p.x;
        sy = p.y;
      }
      ox = sx;
      oy = sy;
      const a = p.angle + rand(-d.spread, d.spread) * 1.3;
      fired.push(a);
      game.bullets.spawn({
        x: sx,
        y: sy,
        dx: Math.cos(a),
        dy: Math.sin(a),
        speed: d.speed * rand(0.95, 1.05),
        life: d.range,
        dmg: d.damage * p.stats.dmgMult,
        pierce: d.pierce + p.stats.pierce,
        knock: d.knock,
        shot: null,
        hits: null,
        rocket: false,
      });
      p.rageShots = (p.rageShots || 0) + 1;
      if (p.rageShots % 3 === 0) {
        game.sfx.shot(d.id);
        game.particles.casing(p.x + ca * 8, p.y + sa * 8, p.angle + Math.PI / 2);
      }
    }
    if (!fired.length) return;
    p.flashT = 0.05;
    p.recoil = 1;
    if (p === game.player) game.camera.shake(0.05);
    game.particles.muzzleSmoke(ox, oy, p.angle);
  },
};

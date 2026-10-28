import { ABILITY, WEAPONS } from '../core/config.js';
import { cooldownOf } from './abilities.js';

// Cada mejora modifica las estadísticas reales del jugador.
export const UPGRADES = [
  {
    id: 'dmg',
    name: 'Munición pesada',
    desc: '+15% daño de armas',
    icon: 'dmg',
    apply: (p) => (p.stats.dmgMult += 0.15),
  },
  {
    id: 'rate',
    name: 'Gatillo ligero',
    desc: '+10% velocidad de disparo',
    icon: 'rate',
    apply: (p) => (p.stats.rateMult += 0.1),
  },
  {
    id: 'hp',
    name: 'Aguante',
    desc: '+20% vida máxima',
    icon: 'hp',
    apply: (p) => {
      p.stats.maxHp += 20;
      p.hp += 20;
    },
  },
  {
    id: 'armor',
    name: 'Chaleco reforzado',
    desc: '+15% resistencia al daño',
    icon: 'armor',
    max: 5,
    apply: (p) => (p.stats.armor = 1 - (1 - p.stats.armor) * 0.85),
  },
  {
    id: 'stam',
    name: 'Pulmones de acero',
    desc: '+20% estamina máxima',
    icon: 'stam',
    apply: (p) => {
      p.stats.maxStamina += 20;
      p.stamina += 20;
    },
  },
  {
    id: 'regen',
    name: 'Segundo aliento',
    desc: '+15% recuperación de estamina',
    icon: 'regen',
    apply: (p) => (p.stats.staminaRegenMult += 0.15),
  },
  {
    id: 'speed',
    name: 'Botas ligeras',
    desc: '+10% velocidad de movimiento',
    icon: 'speed',
    max: 5,
    apply: (p) => (p.stats.speedMult += 0.1),
  },
  {
    id: 'ammo',
    name: 'Cargadores extendidos',
    desc: '+25% capacidad de munición',
    icon: 'ammo',
    max: 4,
    apply: (p) => {
      p.stats.ammoMult += 0.25;
      for (const w of p.weapons) {
        w.mag = p.magSize(w.def);
        if (w.reserve !== Infinity) w.reserve = Math.min(p.reserveMax(w.def), w.reserve + w.def.pickup);
      }
    },
  },
  {
    id: 'pierce',
    name: 'Balas perforantes',
    desc: 'Las balas atraviesan +1 enemigo',
    icon: 'pierce',
    max: 3,
    apply: (p) => (p.stats.pierce += 1),
  },
  {
    id: 'reload',
    name: 'Manos rápidas',
    desc: '+15% velocidad de recarga',
    icon: 'reload',
    max: 5,
    apply: (p) => (p.stats.reloadMult += 0.15),
  },
  {
    id: 'heal',
    name: 'Botiquín de campaña',
    desc: 'Recupera 40% de la vida',
    icon: 'heal',
    repeat: true,
    when: (p) => p.hp < p.stats.maxHp * 0.7,
    apply: (p) => (p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.4)),
  },
  {
    id: 'abcd',
    name: 'Instinto táctico',
    desc: '-15% espera de la habilidad (mín. 20 s)',
    icon: 'cd',
    weight: 1.2,
    when: (p) => !!p.cls && cooldownOf(p) > ABILITY.minCooldown + 0.01,
    apply: (p) => (p.stats.cdMult *= ABILITY.cdStep),
  },
];

export function rollUpgrades(player, level, taken, count = 3) {
  const pool = UPGRADES.filter((u) => {
    if (u.minLevel && level < u.minLevel) return false;
    if (u.when && !u.when(player)) return false;
    if (u.max && (taken[u.id] || 0) >= u.max) return false;
    return true;
  });
  const out = [];
  while (out.length < count && pool.length) {
    const total = pool.reduce((s, u) => s + (u.weight || 1), 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].weight || 1;
      if (r <= 0) break;
    }
    out.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
  }
  return out;
}

const P = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
export const ICONS = {
  dmg: `<svg viewBox="0 0 24 24" ${P}><path d="M9 21V8l3-5 3 5v13z"/><path d="M9 16h6"/></svg>`,
  rate: `<svg viewBox="0 0 24 24" ${P}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`,
  hp: `<svg viewBox="0 0 24 24" ${P}><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>`,
  armor: `<svg viewBox="0 0 24 24" ${P}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/></svg>`,
  stam: `<svg viewBox="0 0 24 24" ${P}><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/></svg>`,
  regen: `<svg viewBox="0 0 24 24" ${P}><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>`,
  speed: `<svg viewBox="0 0 24 24" ${P}><path d="m5 6 6 6-6 6"/><path d="m13 6 6 6-6 6"/></svg>`,
  ammo: `<svg viewBox="0 0 24 24" ${P}><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10 7h4M10 11h4M10 15h4"/></svg>`,
  pierce: `<svg viewBox="0 0 24 24" ${P}><circle cx="9" cy="12" r="3"/><circle cx="16" cy="12" r="3"/><path d="M2 12h20M19 9l3 3-3 3"/></svg>`,
  reload: `<svg viewBox="0 0 24 24" ${P}><path d="M4 12a8 8 0 0 1 14-5l2 2"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M4 20v-5h5"/></svg>`,
  heal: `<svg viewBox="0 0 24 24" ${P}><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M12 10v6M9 13h6M9 6V4h6v2"/></svg>`,
  cd: `<svg viewBox="0 0 24 24" ${P}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>`,
  gun: `<svg viewBox="0 0 24 24" ${P}><path d="M3 9h15l2 2v2h-8l-1 2H7l-1 5H3z"/><path d="M18 9V7"/></svg>`,
};

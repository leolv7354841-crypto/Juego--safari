// Taller de la torreta pesada: junto a una (o montado en ella) se abre con M o el botón Mejorar y se
// compran sus mejoras (HEAVY_UP), que son de esa torreta. En solitario pausa; en línea el mundo sigue
// y la compra la hace el servidor (llega de vuelta con la foto).
import { HEAVY, HEAVY_UP, HEAVY_UP_ORDER, WEAPONS } from '../core/config.ts';
import {
  heavyAuto,
  heavyBlastR,
  heavyDmg,
  heavyLevel,
  heavyLevels,
  heavyMax,
  heavyMaxHp,
  heavyPrice,
  heavyRate,
  upgradeHeavy,
} from '../sim/heavy.ts';
import { drawHeavyPreview } from '../render/build.js';
import { closest, on } from './dom.js';

const P = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  cal: `<svg viewBox="0 0 24 24" ${P}><path d="M4 9h11l3 3-3 3H4z"/><path d="M8 9v6M18 12h3"/></svg>`,
  rate: `<svg viewBox="0 0 24 24" ${P}><path d="M3 8h9l2 2-2 2H3zM6 14h9l2 2-2 2H6z"/><path d="M19 6l2-2M20 11h2"/></svg>`,
  blast: `<svg viewBox="0 0 24 24" ${P}><path d="M12 2l2 6 6-2-3 5 5 3-6 1 1 6-5-4-4 5 0-6-6-1 5-4-3-5 6 2z"/></svg>`,
  armor: `<svg viewBox="0 0 24 24" ${P}><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="M9 12h6M12 9v6"/></svg>`,
  auto: `<svg viewBox="0 0 24 24" ${P}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
};

const GUN_DMG = WEAPONS.heavy.damage;

// La torreta abierta: se busca por su lugar (en línea las piezas se rehacen con cada foto).
function current(game) {
  const k = game.tupAt;
  return k ? game.structures.blocks.find((b) => b.kind === 'heavy' && b.x === k.x && b.y === k.y) || null : null;
}

export function openTurret(game) {
  const p = game.player;
  if (game.state !== 'play' || !p.alive || p.inRobot) return;
  const b = game.structures.heavyFor(p);
  if (!b) return game.toast('Acércate a una torreta pesada para mejorarla');
  game.tupAt = { x: b.x, y: b.y };
  game.tupSig = '';
  game.tupUp = b.up || 0;
  game.tupPulse = 0;
  game.tupT = 0;
  game.setState('turret');
  game.sfx.build();
  renderTurret(game);
}

export function closeTurret(game) {
  if (game.state !== 'turret') return;
  game.tupAt = null;
  if (game.mode.savesProgress()) game.saveProgress();
  game.input.reset();
  game.last = performance.now();
  game.setState('play');
}

// Compra el siguiente nivel de la mejora id (en línea lo pide al servidor).
export function buyTurretUp(game, id) {
  const b = current(game);
  if (!b || !HEAVY_UP[id]) return;
  const price = heavyPrice(b, id);
  if (!price) return game.toast(`${HEAVY_UP[id].name}: ya está al máximo`);
  if (game.money < price) return game.toast(`Te faltan $${price - game.money}`);
  if (game.mode.viaServer()) return game.online.buy('tup', id);
  game.money -= price;
  upgradeHeavy(b, id);
  renderTurret(game);
}

// Lo que dice la fila de cada mejora: el efecto de ahora y el del siguiente nivel.
function stepText(b, id) {
  const lv = heavyLevel(b, id);
  const d = HEAVY_UP[id];
  const next = lv < heavyMax(id) ? lv + 1 : -1;
  const arrow = (a, z, u = '') => (next < 0 ? `${a}${u}` : `${a}${u} → <em>${z}${u}</em>`);
  if (id === 'cal') return `Daño ${arrow(Math.round(GUN_DMG * d.dmg[lv]), Math.round(GUN_DMG * d.dmg[next]))}`;
  if (id === 'rate') return arrow(d.rate[lv], d.rate[next], ' disp/s');
  if (id === 'blast') return `Radio ${arrow(d.r[lv], d.r[next], ' px')}`;
  if (id === 'armor')
    return `Vida ${arrow(d.hp[lv], d.hp[next])} · repara ${Math.round(d.repair[next < 0 ? lv : next] * 100)}%`;
  return lv ? 'Activo: dispara sola cuando la dejas' : `Media cadencia · alcance ${d.range} px`;
}

export function renderTurret(game) {
  const b = current(game);
  if (!b) return;
  const p = game.player;
  game.$('tup-money').textContent = `$${game.money}`;
  const lv = heavyLevels(b);
  const total = HEAVY_UP_ORDER.reduce((n, id) => n + lv[id], 0);
  const all = HEAVY_UP_ORDER.reduce((n, id) => n + heavyMax(id), 0);
  game.$('tup-kicker').textContent = total ? `Taller · ${total} de ${all} mejoras` : 'Taller · de fábrica';
  const hp = Math.max(0, Math.round(b.hp));
  const stat = (k, v, cls = '') => `<div class="tup-stat${cls}"><dt>${k}</dt><dd>${v}</dd></div>`;
  game.$('tup-stats').innerHTML =
    stat('Daño', Math.round(GUN_DMG * heavyDmg(b))) +
    stat('Cadencia', `${heavyRate(b)}<small>/s</small>`) +
    stat('Explosión', `${heavyBlastR(b)}<small>px</small>`) +
    stat('Vida', `${hp}<small>/${heavyMaxHp(b)}</small>`, hp < heavyMaxHp(b) * 0.35 ? ' low' : '') +
    stat('Piloto', heavyAuto(b) ? 'Sí' : 'No', heavyAuto(b) ? ' on' : '') +
    stat('Balas', p.heavyAmmo, p.heavyAmmo ? '' : ' low');
  game.$('tup-list').innerHTML = HEAVY_UP_ORDER.map((id, i) => {
    const d = HEAVY_UP[id];
    const max = heavyMax(id);
    const price = heavyPrice(b, id);
    const poor = price && game.money < price;
    const pips = Array.from({ length: max }, (_, k) => `<i class="${k < lv[id] ? 'on' : ''}"></i>`).join('');
    const btn = price
      ? `<button class="btn buy${poor ? ' poor' : ''}" data-tup="${id}" ${poor ? 'disabled' : ''}>$${price}</button>`
      : '<span class="tup-max">Máximo</span>';
    return `<div class="tup-item${price ? '' : ' done'}">
      <span class="tup-ic">${ICONS[id]}</span>
      <div class="shop-txt"><b>${d.name} <span class="pips">${pips}</span></b><span>${d.desc}</span><small>${stepText(b, id)}<span class="key"> · tecla ${i + 1}</span></small></div>
      ${btn}
    </div>`;
  }).join('');
  game.tupSig = sig(game, b);
}

const sig = (game, b) => `${game.money}|${b.up || 0}|${Math.round(b.hp)}|${game.player.heavyAmmo}`;

// Cada fotograma con el taller abierto: teclas, la torreta girando en la vista previa y, en línea,
// lo que cambie con la foto (dinero, mejoras compradas, golpes).
export function updateTurret(game, dt) {
  const inp = game.input;
  if (inp.consume('pause') || inp.consume('turret')) return closeTurret(game);
  const s = inp.consume('slot');
  if (s && HEAVY_UP_ORDER[s - 1]) buyTurretUp(game, HEAVY_UP_ORDER[s - 1]);
  const b = current(game);
  if (!b || b.hp <= 0 || !game.player.alive) {
    if (b?.hp <= 0 || !b) game.toast('La torreta pesada fue destruida');
    return closeTurret(game);
  }
  if ((b.up || 0) !== game.tupUp) {
    // se compró una mejora: destello en la vista previa
    game.tupUp = b.up || 0;
    game.tupPulse = 1;
    game.sfx.buy();
    game.sfx.build();
  }
  if (sig(game, b) !== game.tupSig) renderTurret(game);
  game.tupT += dt;
  game.tupPulse = Math.max(0, game.tupPulse - dt * 1.6);
  const c = game.$('tup-view');
  drawHeavyPreview(c.getContext('2d'), b, c.width, c.height, game.tupT, game.tupPulse);
}

// Botones del taller y el botón táctil que lo abre.
export function bindTurret(game) {
  on(game, 'btn-tup-done', () => closeTurret(game));
  game.$('tup-list').addEventListener('click', (e) => {
    const t = closest(e.target, '[data-tup]');
    if (t) buyTurretUp(game, t.dataset.tup);
  });
  // la munición se sigue comprando en la tienda; aquí sólo se recuerda el precio
  game.$('tup-note').textContent =
    `Las mejoras son de esta torreta. Sus balas (${HEAVY.pack} por $${HEAVY.price}) se compran en la tienda y las comparte cualquier torreta que montes.`;
}

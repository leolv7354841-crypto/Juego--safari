// Tienda de entre rondas: armas, munición, defensas, lanzables y robot. Compra, venta y dibujo de los íconos.
import {
  BOUNTY,
  BUILD_ORDER,
  SHOP,
  SHOP_ORDER,
  THROWABLES,
  WEAPONS,
  WEAPON_ORDER,
  SELL_RATE,
  HEAVY,
  ROBOT,
} from '../core/config.ts';
import { Robot } from '../sim/robot.ts';
import { drawRobot } from '../render/robot.js';
import { drawGunIcon } from '../render/sprites.js';
import { drawBottle, drawGrenades, drawBlocks, drawGround } from '../render/build.js';
import { closest, on } from './dom.js';

export function openShop(game) {
  game.shopPending = false;
  game.setState('shop');
  game.$('shop-kicker').textContent = `Oleada ${game.director.wave} superada`;
  renderShop(game);
}

export function closeShop(game) {
  if (game.state !== 'shop') return;
  game.saveProgress();
  game.input.reset();
  game.last = performance.now();
  game.setState('play');
  if (BUILD_ORDER.some((k) => game.inv[k] > 0)) {
    game.toast(game.input.mode === 'touch' ? 'Toca Construir para colocar' : 'Pulsa F para colocar · V para cambiar');
  }
}

export function renderShop(game) {
  game.$('shop-money').textContent = `$${game.money}`;
  const p = game.player;
  const buyBtn = (attrs, price, label, extra = '') => {
    const poor = game.money < price;
    return `<button class="btn buy${extra}${poor ? ' poor' : ''}" ${attrs} ${poor ? 'disabled' : ''}>${label}</button>`;
  };
  // armas: de la más barata a la más potente
  // (WEAPON_ORDER no se toca: la red manda el arma por su lugar en esa lista)
  const guns = WEAPON_ORDER.filter((id) => WEAPONS[id].price)
    .sort((a, b) => WEAPONS[a].price - WEAPONS[b].price)
    .map((id) => {
      const d = WEAPONS[id];
      const owned = p.has(id);
      return `<div class="shop-item${owned ? ' owned' : ''}">
      <canvas class="shop-ic" data-gun="${id}" width="96" height="96"></canvas>
      <div class="shop-txt"><b>${d.name}</b><span>${d.desc}</span><small>${d.rocket ? 'Daño en área' : `Daño ${d.damage}${d.pellets > 1 ? `×${d.pellets}` : ''}`} · ${d.rate} disp/s · cargador ${d.mag}</small></div>
      ${owned ? `<button class="btn buy sell" data-sell="${id}">Vender $${Math.round(d.price * SELL_RATE)}</button>` : buyBtn(`data-gun-buy="${id}"`, d.price, `$${d.price}`)}
    </div>`;
    });
  // munición sin límite para cada arma que tengas
  const ammo = p.weapons
    .filter((w) => w.reserve !== Infinity)
    .map((w) => {
      const d = w.def;
      const mag = p.magSize(d);
      return `<div class="shop-item">
      <canvas class="shop-ic" data-gun="${w.id}" width="96" height="96"></canvas>
      <div class="shop-txt"><b>${d.rocket ? 'Cohetes' : 'Balas'} · ${d.name}</b><span>${d.rocket ? `1 cohete por $${d.ammoPrice}` : `Cargador de ${mag} balas por $${d.ammoPrice}`}. Sin límite de reserva.</span><small>Reserva: ${w.reserve} ${d.rocket ? 'cohetes' : 'balas'}</small></div>
      <div class="buy-col">
        ${buyBtn(`data-ammo="${w.id}" data-n="1"`, d.ammoPrice, `+1 · $${d.ammoPrice}`, ' sm')}
        ${buyBtn(`data-ammo="${w.id}" data-n="10"`, d.ammoPrice * 10, `+10 · $${d.ammoPrice * 10}`, ' sm')}
      </div>
    </div>`;
    });
  const gear = SHOP_ORDER.map((k) => {
    const it = SHOP[k];
    const poor = game.money < it.price;
    return `<div class="shop-item${THROWABLES.includes(k) ? ' hot' : ''}">
      <canvas class="shop-ic" data-ic="${k}" width="96" height="96"></canvas>
      <div class="shop-txt"><b>${it.name}</b><span>${it.desc}</span><small>Tienes ${game.inv[k]}${it.hp > 1 ? ` · Resistencia ${it.hp}` : ''}${it.armor ? ` · Reduce ${it.armor * 100}% el daño` : ''}</small></div>
      <button class="btn buy${poor ? ' poor' : ''}" data-buy="${k}" ${poor ? 'disabled' : ''}>$${it.price}</button>
    </div>`;
  });
  game.$('shop-items').innerHTML = `
    <h3 class="shop-sec">Armas</h3>${guns.join('')}
    <h3 class="shop-sec">Munición</h3>${ammo.length ? ammo.join('') : '<p class="shop-empty">Compra un arma para poder comprarle balas. El subfusil tiene balas infinitas.</p>'}${heavyAmmoItem(game)}
    <h3 class="shop-sec">Defensas, granadas y molotovs</h3>${gear.join('')}
    <h3 class="shop-sec">Robot de combate</h3>${robotShopItem(game)}`;
  game
    .$('shop-items')
    .querySelectorAll('canvas[data-ic]')
    .forEach((c) => drawShopIcon(game, c, c.dataset.ic));
  const rc = game.$('shop-items').querySelector('canvas[data-robot]');
  if (rc) {
    const g = rc.getContext('2d');
    const demo = new Robot();
    demo.x = 48 / 0.95;
    demo.y = 48 / 0.95;
    demo.angle = 0;
    demo.legAngle = 0;
    g.setTransform(0.95, 0, 0, 0.95, 0, 0);
    drawRobot(g, demo, game.player, 0);
  }
  game
    .$('shop-items')
    .querySelectorAll('canvas[data-gun]')
    .forEach((c) => {
      const g = c.getContext('2d');
      g.setTransform(2.1, 0, 0, 2.1, 4, 48);
      g.shadowColor = 'rgba(230,224,210,0.85)';
      g.shadowBlur = 3;
      drawGunIcon(g, c.dataset.gun);
    });
}

export function heavyAmmoItem(game) {
  const buy = (n) => {
    const price = HEAVY.price * n;
    const poor = game.money < price;
    return `<button class="btn buy sm${poor ? ' poor' : ''}" data-heavy-ammo="${n}" ${poor ? 'disabled' : ''}>+${HEAVY.pack * n} · $${price}</button>`;
  };
  return `<div class="shop-item">
    <canvas class="shop-ic" data-ic="heavy" width="96" height="96"></canvas>
    <div class="shop-txt"><b>Balas · Torreta pesada</b><span>Cinta de ${HEAVY.pack} balas explosivas por $${HEAVY.price}. Las usa cualquier torreta pesada que montes.</span><small>Tienes: ${game.player.heavyAmmo} balas</small></div>
    <div class="buy-col">${buy(1)}${buy(5)}</div>
  </div>`;
}

export function robotShopItem(game) {
  const rb = game.robot;
  let btn;
  let info;
  if (!rb.owned) {
    const poor = game.money < ROBOT.price;
    btn = `<button class="btn buy${poor ? ' poor' : ''}" data-robot-act="buy" ${poor ? 'disabled' : ''}>$${ROBOT.price}</button>`;
    info = `Vida ${ROBOT.hp} · se repara aquí`;
  } else {
    const cost = rb.repairCost;
    const poor = game.money < cost;
    btn =
      cost > 0
        ? `<button class="btn buy${poor ? ' poor' : ''}" data-robot-act="repair" ${poor ? 'disabled' : ''}>Reparar $${cost}</button>`
        : '<button class="btn buy" disabled>Listo</button>';
    info = rb.broken ? 'DESTRUIDO: repáralo para volver a usarlo' : `Vida ${Math.ceil(rb.hp)} / ${ROBOT.hp}`;
  }
  return `<div class="shop-item hot">
    <canvas class="shop-ic" data-robot width="96" height="96"></canvas>
    <div class="shop-txt"><b>Robot de combate</b><span>Del doble de tamaño de un gordo. Súbete (E) y camina entre la horda con tu arma en su brazo. No se cura solo: repáralo después de cada oleada.</span><small>${info}</small></div>
    ${btn}
  </div>`;
}

export function buyWeapon(game, id) {
  const d = WEAPONS[id];
  const p = game.player;
  if (!d || !d.price || p.has(id) || game.money < d.price) return;
  game.analitica.compra('arma', id, d.price);
  if (game.mode.viaServer()) return game.online.buy('gun', id);
  game.money -= d.price;
  p.unlock(id);
  game.sfx.buy();
  game.toast(`${d.name} comprada`);
  renderShop(game);
}

export function sellWeapon(game, id) {
  const p = game.player;
  const d = WEAPONS[id];
  if (!d || !d.price) return;
  if (game.mode.viaServer()) return p.has(id) && game.online.buy('sell', id);
  if (!p.removeWeapon(id)) return;
  const gain = Math.round(d.price * SELL_RATE);
  game.money += gain;
  game.sfx.buy();
  game.toast(`${d.name} vendida: +$${gain}`);
  renderShop(game);
}

export function buyAmmo(game, id, n) {
  const p = game.player;
  const w = p.weapons.find((x) => x.id === id);
  if (!w || w.reserve === Infinity) return;
  const cost = w.def.ammoPrice * n;
  if (game.money < cost) return;
  game.analitica.compra('municion', id, cost, n);
  if (game.mode.viaServer()) return game.online.buy('ammo', id, n);
  game.money -= cost;
  w.reserve += p.magSize(w.def) * n;
  game.sfx.buy();
  renderShop(game);
}

export function drawShopIcon(game, c, k) {
  const g = c.getContext('2d');
  g.setTransform(1.6, 0, 0, 1.6, 0, 0);
  if (k === 'molotov') {
    g.setTransform(0, -4.2, 4.2, 0, 48, 52);
    drawBottle(g, true);
    return;
  }
  if (k === 'grenade') {
    g.setTransform(4.5, 0, 0, 4.5, 0, 0);
    drawGrenades(g, { grenades: [{ x: 10, y: 11, h: 0, rot: -0.6, t: 0, dur: 1 }] });
    return;
  }
  if (k === 'heavy') {
    // el cañón sobresale del trípode: se centra todo el conjunto
    g.setTransform(1.15, 0, 0, 1.15, 33 - 1.15 * 20, 48 - 1.15 * 20);
    drawBlocks(
      g,
      { blocks: [{ kind: k, x: 0, y: 0, w: 40, h: 40, hp: 1, max: 1, hitT: 0, ang: 0 }] },
      {
        x0: -1e4,
        y0: -1e4,
        x1: 1e4,
        y1: 1e4,
      },
    );
    return;
  }
  const def = SHOP[k];
  const w = def.w;
  const h = def.h;
  const s = Math.min(44 / w, 44 / h, 1);
  g.setTransform(1.6 * s, 0, 0, 1.6 * s, 1.6 * (30 - (w * s) / 2), 1.6 * (30 - (h * s) / 2));
  if (def.ground)
    drawGround(
      g,
      { scorches: [], wires: [{ kind: k, x: 0, y: 0, w, h, hp: 1, max: 1, hitT: 0 }] },
      {
        x0: -1e4,
        y0: -1e4,
        x1: 1e4,
        y1: 1e4,
      },
    );
  else
    drawBlocks(
      g,
      { blocks: [{ kind: k, x: 0, y: 0, w, h, hp: 1, max: 1, hitT: 0 }] },
      {
        x0: -1e4,
        y0: -1e4,
        x1: 1e4,
        y1: 1e4,
      },
    );
}

export function buy(game, k) {
  const it = SHOP[k];
  if (!it || game.money < it.price) return;
  game.analitica.compra('objeto', k, it.price);
  if (game.mode.viaServer()) return game.online.buy('item', k);
  game.money -= it.price;
  game.inv[k]++;
  if (!THROWABLES.includes(k) && game.inv[game.buildSel] <= 0) game.buildSel = k;
  game.sfx.buy();
  renderShop(game);
}

export function buyHeavyAmmo(game, n) {
  const cost = HEAVY.price * n;
  if (game.money < cost) return;
  game.analitica.compra('municion_pesada', 'heavy', cost, n);
  if (game.mode.viaServer()) return game.online.buy('heavy', 'ammo', n);
  game.money -= cost;
  game.player.heavyAmmo += HEAVY.pack * n;
  game.sfx.buy();
  renderShop(game);
}

export function buyRobot(game) {
  const rb = game.robot;
  if (rb.owned || game.money < ROBOT.price) return;
  game.analitica.compra('robot', 'robot', ROBOT.price);
  if (game.mode.viaServer()) return game.online.buy('robot', 'buy');
  game.money -= ROBOT.price;
  rb.deploy(game.player, game.world);
  game.sfx.buy();
  game.toast(game.input.mode === 'touch' ? 'Robot listo: acércate y toca ROBOT' : 'Robot listo: acércate y pulsa E');
  renderShop(game);
}

export function repairRobot(game) {
  const rb = game.robot;
  const cost = rb.repairCost;
  if (!rb.owned || cost <= 0 || game.money < cost) return;
  game.analitica.compra('reparacion', 'robot', cost);
  if (game.mode.viaServer()) return game.online.buy('robot', 'repair');
  game.money -= cost;
  rb.hp = ROBOT.hp;
  game.sfx.build();
  game.toast('Robot reparado');
  renderShop(game);
}

// Botones de la tienda y del panel de ronda que la abre.
export function bindShop(game) {
  // lo que paga cada zombi, tal como está en BOUNTY (con coma decimal: $0,5)
  const b = (t) => `$${String(BOUNTY[t]).replace('.', ',')}`;
  game.$('shop-bounty').textContent =
    `Zombi normal ${b('normal')} · velocista ${b('sprinter')} · gordo ${b('fat')} · ` +
    `SWAT ${b('swat')} · toro ${b('bull')} · super blindado ${b('heavy')}.`;
  on(game, 'btn-shop-done', () => closeShop(game));
  on(game, 'btn-round-shop', () => {
    if (game.state === 'play' && game.director.state === 'waiting') openShop(game);
  });
  game.$('shop-items').addEventListener('click', (e) => {
    const sell = closest(e.target, '[data-sell]');
    if (sell) return sellWeapon(game, sell.dataset.sell);
    const g = closest(e.target, '[data-gun-buy]');
    if (g) return buyWeapon(game, g.dataset.gunBuy);
    const a = closest(e.target, '[data-ammo]');
    if (a) return buyAmmo(game, a.dataset.ammo, Number(a.dataset.n));
    const hva = closest(e.target, '[data-heavy-ammo]');
    if (hva) return buyHeavyAmmo(game, Number(hva.dataset.heavyAmmo));
    const rbt = closest(e.target, '[data-robot-act]');
    if (rbt) return rbt.dataset.robotAct === 'buy' ? buyRobot(game) : repairRobot(game);
    const b = closest(e.target, '[data-buy]');
    if (b) buy(game, b.dataset.buy);
  });
}

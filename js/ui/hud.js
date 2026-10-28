// Interfaz de juego: marcador (vida, aguante, arma, inventario), avisos, carteles y dinero flotante.
import { BUILD_ORDER, COMBO, SHOP, ROBOT, WEAPONS } from '../core/config.ts';
import { fmtTime } from '../core/util.ts';
import { CLASSES, cooldownOf } from '../sim/abilities.ts';
import { comboMult, comboTier, multText } from '../sim/combo.ts';
import { ITEM_ICONS, SHORT } from './icons.js';
import { closest, on } from './dom.js';

// Indicador flotante de dinero junto al contador (rojo al perder, dorado al ganar).
export function moneyPop(game, text, kind) {
  const host = game.$('money-pops');
  if (!host) return;
  if (host.childElementCount > 5) host.firstElementChild.remove();
  const el = document.createElement('span');
  el.className = 'money-pop ' + kind;
  el.textContent = text;
  host.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

export function toast(game, msg) {
  const el = game.$('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(game.toastT);
  game.toastT = setTimeout(() => el.classList.remove('show'), 1500);
}

export function banner(game, title, sub) {
  game.$('banner-title').textContent = title;
  game.$('banner-sub').textContent = sub || '';
  const el = game.$('banner');
  el.classList.add('show');
  clearTimeout(game.bannerT);
  game.bannerT = setTimeout(() => el.classList.remove('show'), 2600);
}

// Racha: bajas seguidas, multiplicador y barra del tiempo que queda. Al subir de nivel salta y suena;
// al terminar queda un momento lo que se logró (en rojo si la cortó un golpe).
function updateCombo(game, c) {
  const $ = game.$;
  const el = $('combo');
  const fresh = !('cbn' in game.cache);
  const last = game.cache.cbn || 0;
  const lastT = game.cache.cbt || 0;
  game.cache.cbn = c.n;
  game.cache.cbt = c.t;
  const look = (cls) => {
    if (game.cache.cbC === cls) return false;
    game.cache.cbC = cls;
    el.className = cls;
    return true;
  };
  // partida nueva (o HUD redibujado): nada de la racha anterior
  if (fresh) {
    clearTimeout(game.comboEndT);
    look('combo');
  }
  if (c.n >= COMBO.show) {
    clearTimeout(game.comboEndT);
    const tier = comboTier(c.n);
    // al subir de nivel salta (bump se queda puesto hasta el siguiente: la clase guardada no lo lleva)
    if (look(`combo show t${tier}`) && tier > comboTier(last)) {
      void el.offsetWidth;
      el.classList.add('bump');
      game.sfx.combo(tier);
    }
    set(game, 'cbN', $('combo-n'), 'text', String(c.n));
    set(game, 'cbX', $('combo-x'), 'text', multText(comboMult(c.n)));
    set(game, 'cbL', $('combo-lbl'), 'text', 'Racha');
    set(game, 'cbW', $('combo-fill'), 'transform', `scaleX(${Math.min(1, c.t / COMBO.window).toFixed(2)})`);
    return;
  }
  if (c.n > 0 || last < COMBO.show) return;
  // se acabó: si quedaba tiempo en el reloj, la cortó un golpe
  const cut = lastT > 0.3;
  look(`combo show end${cut ? ' cut' : ''}`);
  set(game, 'cbN', $('combo-n'), 'text', String(last));
  set(game, 'cbL', $('combo-lbl'), 'text', cut ? 'Racha perdida' : 'Fin de la racha');
  if (cut && comboTier(last)) game.sfx.comboLost();
  game.comboEndT = setTimeout(() => look('combo'), 1400);
}

function set(game, key, el, prop, value) {
  if (game.cache[key] === value) return;
  game.cache[key] = value;
  if (prop === 'text') el.textContent = value;
  else el.style[prop] = value;
}

export function updateHud(game, force) {
  if (force) game.cache = {};
  const p = game.player;
  const $ = game.$;
  set(game, 'hpw', $('hp-fill'), 'transform', `scaleX(${(p.hp / p.stats.maxHp).toFixed(3)})`);
  set(game, 'hpv', $('hp-val'), 'text', String(Math.ceil(p.hp)));
  const low = p.hp < p.stats.maxHp * 0.3;
  if (game.cache.low !== low) {
    game.cache.low = low;
    $('hp-bar').classList.toggle('low', low);
  }
  const rb = game.robot;
  if (game.cache.rbOwned !== rb.owned) {
    game.cache.rbOwned = rb.owned;
    $('rb-bar').hidden = !rb.owned;
  }
  // el botón táctil también monta y desmonta la torreta pesada
  const heavy = p.manned ? null : game.structures.nearHeavy(p);
  const rbBtn = rb.owned || !!p.manned || !!heavy;
  if (game.cache.rbBtn !== rbBtn) {
    game.cache.rbBtn = rbBtn;
    $('btn-robot').classList.toggle('gone', !rbBtn);
  }
  if (rb.owned) {
    set(game, 'rbw', $('rb-fill'), 'transform', `scaleX(${Math.max(0, rb.hp / ROBOT.hp).toFixed(3)})`);
    set(game, 'rbv', $('rb-val'), 'text', rb.broken ? 'ROTO' : String(Math.ceil(rb.hp)));
  }
  set(game, 'rbon', $('btn-robot'), 'text', rb.piloted || p.manned ? 'Bajar' : heavy ? 'Torreta' : 'Robot');
  // habilidad de clase: icono, segundos que faltan y arco de espera en el botón táctil
  const cls = p.cls;
  if (game.cache.cls !== cls) {
    game.cache.cls = cls;
    $('btn-ability').hidden = !cls;
    $('btn-ab-touch').classList.toggle('gone', !cls);
    if (cls) {
      $('ab-ic').innerHTML = CLASSES[cls].icon;
      $('btn-ab-touch').innerHTML = CLASSES[cls].icon;
      $('ab-nm').textContent = CLASSES[cls].name;
    }
  }
  if (cls) {
    const ready = !(p.abCd > 0) && p.alive;
    set(game, 'abcd', $('ab-cd'), 'text', p.abCd > 0 ? `${Math.ceil(p.abCd)} s` : 'Lista');
    if (game.cache.abReady !== ready) {
      game.cache.abReady = ready;
      $('btn-ability').classList.toggle('ready', ready);
      $('btn-ab-touch').classList.toggle('ready', ready);
    }
    const k = ready ? '1' : (1 - (p.abCd || 0) / cooldownOf(p)).toFixed(2);
    if (game.cache.abk !== k) {
      game.cache.abk = k;
      $('btn-ab-touch').style.setProperty('--k', k);
      $('btn-ability').style.setProperty('--k', k);
    }
  }
  set(game, 'stw', $('st-fill'), 'transform', `scaleX(${(p.stamina / p.stats.maxStamina).toFixed(3)})`);
  if (game.cache.ex !== p.exhausted) {
    game.cache.ex = p.exhausted;
    $('st-bar').classList.toggle('exhausted', p.exhausted);
    if (p.exhausted) game.input.setRun(false);
  }
  set(game, 'xpw', $('xp-fill'), 'width', `${((game.xp / game.xpNeed) * 100).toFixed(1)}%`);
  set(game, 'lvl', $('lvl'), 'text', String(game.level));
  set(game, 'time', $('time'), 'text', fmtTime(game.time));
  set(game, 'kills', $('kills'), 'text', String(game.totalKills()));
  updateCombo(game, p.combo);
  set(game, 'wave', $('wave'), 'text', String(Math.max(1, game.director.wave)));
  // ronda especial: su nombre en lugar de «Oleada», del color de la ronda
  const ev = game.director.event;
  if (game.cache.wev !== ev) {
    game.cache.wev = ev;
    $('wave-lbl').textContent = ev ? game.director.eventDef.tag : 'Oleada';
    $('wave-stat').className = ev ? `stat ev ev-${ev}` : 'stat';
  }
  // montado en la torreta pesada se ven sus balas
  const w = p.manned ? { def: WEAPONS.heavy, mag: p.heavyAmmo, reserve: 0 } : p.weapon;
  set(game, 'wname', $('wname'), 'text', w.def.name);
  set(game, 'mag', $('mag'), 'text', String(w.mag));
  set(game, 'res', $('reserve'), 'text', w.reserve === Infinity ? '∞' : String(w.reserve));
  const empty = w.mag === 0;
  if (game.cache.empty !== empty) {
    game.cache.empty = empty;
    $('mag').parentElement.classList.toggle('empty', empty);
  }
  const rl = p.reloadT > 0 ? 1 - p.reloadT / p.reloadDur : 0;
  set(game, 'rl', $('reload-fill'), 'width', `${(rl * 100).toFixed(0)}%`);
  const inv = game.inv;
  const isig =
    BUILD_ORDER.map((k) => inv[k]).join() +
    '|' +
    inv.grenade +
    '|' +
    inv.molotov +
    '|' +
    game.buildSel +
    '|' +
    game.money;
  if (game.cache.inv !== isig) {
    game.cache.inv = isig;
    // granadas siempre visibles; de las estructuras sólo las que tienes (son muchas)
    const items = [
      `<span class="it gren${inv.grenade ? '' : ' zero'}" title="Granadas">${ITEM_ICONS.grenade}<b>${inv.grenade}</b></span>`,
      `<span class="it gren${inv.molotov ? '' : ' zero'}" title="Molotovs">${ITEM_ICONS.molotov}<b>${inv.molotov}</b></span>`,
    ];
    for (const k of BUILD_ORDER) {
      if (!inv[k]) continue;
      const cls = `it${k === game.buildSel ? ' on' : ''}`;
      items.push(
        `<button class="${cls}" data-k="${k}" title="${SHOP[k].name}">${ITEM_ICONS[k]}<b>${inv[k]}</b></button>`,
      );
    }
    items.push(`<span class="it money" title="Dinero">$<b id="money">${game.money}</b></span>`);
    $('inv').innerHTML = items.join('');
    $('build-count').textContent = inv[game.buildSel] > 0 ? inv[game.buildSel] : '0';
    $('btn-build').classList.toggle('off', !BUILD_ORDER.some((k) => inv[k] > 0));
    $('gren-count').textContent = inv.grenade;
    $('btn-grenade').classList.toggle('off', inv.grenade <= 0);
    $('molo-count').textContent = inv.molotov;
    $('btn-molotov').classList.toggle('off', inv.molotov <= 0);
  }
  const sig = p.manned ? 'heavy' : p.weapons.map((x) => x.id).join() + '|' + p.wi;
  if (game.cache.slots !== sig) {
    game.cache.slots = sig;
    $('slots').innerHTML = p.manned
      ? `<button class="slot on">${WEAPONS.heavy.name}</button>`
      : p.weapons
          .map(
            (x, i) =>
              `<button class="slot${i === p.wi ? ' on' : ''}" data-i="${i}">${i + 1} ${i === p.wi ? x.def.name : SHORT[x.id]}</button>`,
          )
          .join('');
  }
  const prep = game.director.state === 'waiting' && p.alive;
  if (game.cache.prep !== prep) {
    game.cache.prep = prep;
    $('round-panel').classList.toggle('show', prep);
    if (prep) $('round-kicker').textContent = `Ronda ${game.director.wave} superada`;
  }
}

// Botones del marcador: habilidad, pausa, ronda siguiente, mejoras, inventario y barra de armas.
export function bindHud(game) {
  on(game, 'btn-ability', () => {
    if (game.state === 'play') game.useAbility();
  });
  on(game, 'btn-pause', () => game.pause());
  on(game, 'btn-resume', () => game.resume());
  on(game, 'btn-next-round', () => game.startNextRound());
  on(game, 'btn-upgrade', () => {
    if (game.state === 'play' && game.online.upReady) game.openLevelUp();
  });
  game.$('inv').addEventListener('pointerdown', (e) => {
    const b = closest(e.target, '[data-k]');
    if (!b) return;
    e.preventDefault();
    game.buildSel = b.dataset.k;
  });
  game.$('slots').addEventListener('pointerdown', (e) => {
    const b = closest(e.target, '.slot[data-i]');
    if (!b) return;
    e.preventDefault();
    game.player.select(Number(b.dataset.i));
  });
}

// Indicador de conexión de la partida en línea (se actualiza una vez por segundo).
export function updateNetStat(game, dt) {
  const ns = game.$('net-stat');
  if (game.mode.inGroup() && game.state !== 'menu') {
    const txt = game.mode.netStats(dt);
    if (txt) ns.textContent = txt;
    ns.hidden = false;
  } else ns.hidden = true;
}

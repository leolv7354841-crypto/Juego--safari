// Mejoras al subir de nivel: las tarjetas y la elección (en línea las ofrece y aplica el servidor).
import { rollUpgrades, ICONS } from '../sim/upgrades.js';

export function openLevelUp(game) {
  game.setState('levelup');
  game.input.reset();
  game.sfx.level();
  const lvl = game.level - game.pendingLevels + 1;
  game.$('level-kicker').textContent = `Nivel ${lvl} alcanzado`;
  // en línea las ofrece el servidor (es quien aplica la mejora)
  game.choices = game.online.active ? game.online.upChoices() : rollUpgrades(game.player, lvl, game.taken);
  const wrap = game.$('cards');
  wrap.classList.remove('ready');
  wrap.innerHTML = '';
  game.choices.forEach((u, i) => {
    const b = document.createElement('button');
    b.className = 'card' + (u.weapon ? ' weapon' : '');
    const n = game.taken[u.id] || 0;
    const tag = u.weapon ? 'Arma nueva' : n ? `Nivel ${n + 1}` : 'Mejora';
    b.innerHTML = `<span class="ic">${ICONS[u.icon]}</span><span class="nm"></span><span class="ds"></span><span class="tg">${tag} <span class="key">· tecla ${i + 1}</span></span>`;
    b.querySelector('.nm').textContent = u.name;
    b.querySelector('.ds').textContent = u.desc;
    b.addEventListener('click', () => chooseUpgrade(game, i));
    wrap.appendChild(b);
  });
  // breve espera para no elegir sin querer al estar disparando
  game.levelReadyAt = performance.now() + 450;
  setTimeout(() => wrap.classList.add('ready'), 450);
}

export function chooseUpgrade(game, i) {
  if (game.state !== 'levelup' || performance.now() < game.levelReadyAt) return;
  const u = game.choices[i];
  if (!u) return;
  if (game.online.active) {
    // la siguiente tanda (si quedan niveles) llega con la próxima foto del servidor
    game.online.pickUpgrade(i);
    game.taken[u.id] = (game.taken[u.id] || 0) + 1;
    game.input.reset();
    game.last = performance.now();
    return game.setState('play');
  }
  u.apply(game.player);
  game.taken[u.id] = (game.taken[u.id] || 0) + 1;
  game.pendingLevels--;
  if (u.weapon) game.toast(`${u.name} equipada`);
  if (game.pendingLevels > 0) openLevelUp(game);
  else {
    game.input.reset();
    game.last = performance.now();
    game.setState('play');
  }
}

// Elegir clase antes de una partida en solitario, y el selector compacto de las salas.
import { CLASS_ORDER } from '../core/config.js';
import { storage } from '../core/util.js';
import { CLASSES, isClass, cooldownOf } from '../sim/abilities.js';
import { on } from './dom.js';

// Pantalla de elegir clase antes de una partida en solitario.
export function showClass(game, freshWorld) {
  game.classFresh = freshWorld;
  game.setState('class');
  const wrap = game.$('class-cards');
  wrap.classList.remove('ready');
  wrap.innerHTML = '';
  CLASS_ORDER.forEach((id, i) => {
    const c = CLASSES[id];
    const b = document.createElement('button');
    b.className = 'card cls' + (id === game.classPick ? ' sel' : '');
    b.innerHTML = `<span class="ic">${c.icon}</span><span class="nm"></span><span class="ds"></span><span class="tg">Cada ${Math.round(cooldownOf(game.player))} s <span class="key">· tecla ${i + 1}</span></span>`;
    b.querySelector('.nm').textContent = c.name;
    b.querySelector('.ds').textContent = c.desc;
    b.addEventListener('click', () => chooseClass(game, id));
    wrap.appendChild(b);
  });
  game.classReadyAt = performance.now() + 250;
  setTimeout(() => wrap.classList.add('ready'), 250);
}

export function chooseClass(game, id) {
  if (game.state !== 'class' || performance.now() < game.classReadyAt || !isClass(id)) return;
  setClassPick(game, id);
  game.start(game.classFresh);
  game.toast(
    `${CLASSES[id].name}: ${game.input.mode === 'touch' ? 'toca el botón de habilidad' : 'pulsa X'} para usarla`,
  );
}

export function setClassPick(game, id) {
  if (!isClass(id)) return;
  game.classPick = id;
  storage.set('dz-class', id);
  renderClassRows(game);
  // en la sala en línea el servidor la guarda para la próxima partida
  if (game.online.room && !game.online.playing) game.online.send('cls', { v: id });
}

// Selector compacto de clase en las salas del cooperativo y en línea.
export function renderClassRows(game) {
  for (const row of game.root.querySelectorAll('.class-row')) {
    row.innerHTML = '';
    for (const id of CLASS_ORDER) {
      const c = CLASSES[id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cls-btn' + (id === game.classPick ? ' sel' : '');
      b.title = c.desc;
      b.innerHTML = `${c.icon}<span></span>`;
      b.querySelector('span').textContent = c.name;
      b.addEventListener('click', () => setClassPick(game, id));
      row.appendChild(b);
    }
  }
}

// Botón para volver al menú desde la pantalla de clase.
export function bindClass(game) {
  on(game, 'btn-class-back', () => game.setupMenu());
}

// Personaje: elegir colores y sombrero, con una vista previa que camina en su sitio.
import { storage } from '../core/util.ts';
import { Player } from '../sim/player.ts';
import { drawSurvivor, LOOK_PARTS, HATS, DEFAULT_LOOK, cleanLook } from '../render/sprites.js';
import { on } from './dom.js';

export function showLook(game) {
  game.setState('look');
  // muñeco sólo para la vista previa: camina en su sitio y gira despacio
  game.lookDummy = new Player(80, 80);
  game.lookDummy.r *= 3.4;
  game.lookDummy.speedNow = 60;
  renderLook(game);
}

export function renderLook(game) {
  const box = game.$('look-parts');
  box.innerHTML = '';
  for (const part of LOOK_PARTS) {
    const row = document.createElement('div');
    row.className = 'look-row';
    const lbl = document.createElement('span');
    lbl.textContent = part.name;
    const sw = document.createElement('div');
    sw.className = 'look-sw';
    for (const c of part.colors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = c;
      b.setAttribute('aria-label', `${part.name} ${c}`);
      b.classList.toggle('on', game.look[part.id] === c);
      b.addEventListener('click', () => setLook(game, { ...game.look, [part.id]: c }));
      sw.appendChild(b);
    }
    row.append(lbl, sw);
    box.appendChild(row);
  }
  const row = document.createElement('div');
  row.className = 'look-row';
  const lbl = document.createElement('span');
  lbl.textContent = 'Sombrero';
  const sw = document.createElement('div');
  sw.className = 'look-sw look-hats';
  for (const h of HATS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = h.name;
    b.classList.toggle('on', game.look.hat === h.id);
    b.addEventListener('click', () => setLook(game, { ...game.look, hat: h.id }));
    sw.appendChild(b);
  }
  row.append(lbl, sw);
  box.appendChild(row);
}

export function setLook(game, look) {
  game.look = cleanLook(look);
  game.player.look = game.look;
  storage.set('dz-look', game.look);
  renderLook(game);
}

export function drawLookPreview(game, dt) {
  const p = game.lookDummy;
  const c = game.$('look-preview');
  const g = c.getContext('2d');
  p.look = game.look;
  p.walkPhase += dt * 9;
  p.angle += dt * 0.6;
  p.legAngle = p.angle;
  g.clearRect(0, 0, c.width, c.height);
  drawSurvivor(g, p, game.time);
}

// Botones de la pantalla de personaje y del menú que la abre.
export function bindLook(game) {
  on(game, 'btn-look', () => showLook(game));
  on(game, 'btn-look-done', () => game.setState('menu'));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  on(game, 'btn-look-random', () =>
    setLook(game, { ...Object.fromEntries(LOOK_PARTS.map((q) => [q.id, pick(q.colors)])), hat: pick(HATS).id }),
  );
  on(game, 'btn-look-reset', () => setLook(game, DEFAULT_LOOK));
}

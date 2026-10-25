// Cuentas: pantalla para crear o elegir una (nombre y PIN de 4 dígitos).
import { on } from './dom.js';

export function showAccount(game) {
  game.setState('account');
  const acc = game.accounts;
  game.$('acct-error').textContent = '';
  game.$('acct-name-in').value = acc.current ? acc.current.name : '';
  game.$('acct-pin-in').value = '';
  const names = Object.values(acc.list).map((a) => a.name);
  const box = game.$('acct-known');
  box.innerHTML = '';
  box.hidden = !names.length;
  for (const n of names) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = n;
    b.addEventListener('click', () => {
      game.$('acct-name-in').value = n;
      game.$('acct-pin-in').focus();
    });
    box.appendChild(b);
  }
  game.$('acct-cloud').hidden = !acc.cloud;
}

export async function submitAccount(game, e) {
  e.preventDefault();
  const err = game.accounts.login(game.$('acct-name-in').value, game.$('acct-pin-in').value);
  if (err) {
    game.$('acct-error').textContent = err;
    return;
  }
  game.sfx.unlock();
  await game.accounts.cloudPull();
  game.newWorld();
  game.setupMenu();
}

// Botones de la pantalla de cuenta y del menú que la abre.
export function bindAccount(game) {
  on(game, 'btn-account', () => showAccount(game));
  on(game, 'btn-acct-back', () => {
    if (game.accounts.current) game.setupMenu();
  });
  game.$('acct-form').addEventListener('submit', (e) => submitAccount(game, e));
}

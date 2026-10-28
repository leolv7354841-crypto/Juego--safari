// Ayudas comunes de las pruebas de navegador.
import { expect } from '@playwright/test';

// Abre el juego y falla si hay errores de consola o de página. `listo`: lo que debe verse al terminar
// (el menú; con un enlace de invitación, la pantalla en línea).
export async function abrir(page, ruta = '/index.html', listo = '#btn-start') {
  const errores = [];
  page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(`console: ${m.text()}`);
  });
  await page.goto(ruta);
  // la primera vez el juego pide una cuenta local (nombre + PIN de prueba, solo en este navegador)
  const form = page.locator('#acct-form');
  await expect.poll(() => page.evaluate(() => window.__deadzone?.state)).toMatch(/^(account|menu)$/);
  if ((await estado(page)) === 'account') {
    await page.locator('#acct-name-in').fill('Prueba');
    await page.locator('#acct-pin-in').fill('1234');
    await form.locator('button[type=submit]').click();
  }
  await expect(page.locator(listo)).toBeVisible();
  return errores;
}

export const estado = (page) => page.evaluate(() => window.__deadzone.state);

export async function esperarEstado(page, esperado) {
  await expect.poll(() => estado(page)).toBe(esperado);
}

// Empieza una partida solo y espera a estar jugando.
export async function jugarSolo(page) {
  await page.locator('#btn-start').click();
  // una partida nueva pide elegir clase antes de salir (se toma la primera)
  await expect.poll(() => estado(page)).toMatch(/^(class|play)$/);
  if ((await estado(page)) === 'class') {
    await expect(page.locator('#class-cards.ready')).toBeVisible();
    await page.locator('#class-cards .card').first().click();
  }
  await esperarEstado(page, 'play');
}

// Acaba la oleada en curso sin esperar a matar a todos.
export async function terminarOleada(page) {
  // sin esperar los 3 s de descanso (en WebKit headless el reloj del juego va lento)
  await page.evaluate(() => {
    window.__deadzone.director.timer = 0;
  });
  await expect.poll(() => page.evaluate(() => window.__deadzone.director.state)).toBe('active');
  await page.evaluate(() => {
    const g = window.__deadzone;
    g.director.queue.length = 0;
    g.horde.list.length = 0;
  });
  await expect.poll(() => page.evaluate(() => window.__deadzone.director.state)).toBe('waiting');
}

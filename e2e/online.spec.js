import { expect, test } from '@playwright/test';
import { abrir } from './helpers.js';

// WebKit avisa "Wrong protocol for WebSocket" con el SDK de Colyseus empaquetado en js/vendor; la conexión
// funciona igual. Se tolera aquí hasta la Etapa 2 (SDK desde npm); si desaparece, quitar el filtro.
const CONOCIDO = /favicon|Wrong protocol for WebSocket/;
const SERVER_URL = 'ws://127.0.0.1:2599'; // el mismo puerto que playwright.config.js

// Con dos páginas abiertas, la que queda en segundo plano no anima (WebKit): se la trae al frente
// y se envía el clic como evento del DOM, sin pasar por el ratón (que en WebKit se cuelga).
async function clic(page, selector) {
  await page.bringToFront();
  await page.locator(selector).dispatchEvent('click');
}

// Dos páginas entran a la misma sala del servidor local y empiezan la partida.
test('dos jugadores en la misma sala en línea', async ({ browser }) => {
  test.setTimeout(120_000); // WebKit sin ventana va lento con dos páginas
  const url = `/index.html?servidor=${encodeURIComponent(SERVER_URL)}`;
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const erroresA = await abrir(a, url);
  const erroresB = await abrir(b, url);

  await clic(a, '#btn-online');
  await a.locator('#ol-name').fill('Ana');
  await clic(a, '#btn-ol-create');
  await expect(a.locator('#ol-lobby')).toBeVisible();
  await expect(a.locator('#ol-code')).not.toHaveText(/·/);
  const codigo = (await a.locator('#ol-code').innerText()).trim();

  await clic(b, '#btn-online');
  await b.locator('#ol-name').fill('Beto');
  await b.locator('#ol-code-in').fill(codigo);
  await b.locator('#ol-code-in').press('Enter');
  await expect(b.locator('#ol-lobby')).toBeVisible();

  await expect(a.locator('#ol-members li')).toHaveCount(2);
  await expect(b.locator('#ol-members li')).toHaveCount(2);

  await clic(b, '#btn-ol-ready');
  await expect(a.locator('#btn-ol-start')).toBeEnabled();
  await clic(a, '#btn-ol-start');

  for (const p of [a, b]) {
    await expect.poll(() => p.evaluate(() => window.__deadzone.state), { timeout: 30_000 }).toBe('play');
    expect(await p.evaluate(() => window.__deadzone.online.active)).toBe(true);
  }
  expect(erroresA.filter((e) => !CONOCIDO.test(e))).toEqual([]);
  expect(erroresB.filter((e) => !CONOCIDO.test(e))).toEqual([]);
});

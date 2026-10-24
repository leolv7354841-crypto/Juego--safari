import { expect, test } from '@playwright/test';
const SERVER_URL = 'ws://127.0.0.1:2599'; // el mismo puerto que playwright.config.js
import { abrir } from './helpers.js';

// Dos páginas entran a la misma sala del servidor local y empiezan la partida.
test('dos jugadores en la misma sala en línea', async ({ browser }) => {
  const url = `/index.html?servidor=${encodeURIComponent(SERVER_URL)}`;
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const erroresA = await abrir(a, url);
  const erroresB = await abrir(b, url);

  await a.locator('#btn-online').click();
  await a.locator('#ol-name').fill('Ana');
  await a.locator('#btn-ol-create').click();
  await expect(a.locator('#ol-lobby')).toBeVisible();
  await expect(a.locator('#ol-code')).not.toHaveText(/·/);
  const codigo = (await a.locator('#ol-code').innerText()).trim();

  await b.locator('#btn-online').click();
  await b.locator('#ol-name').fill('Beto');
  await b.locator('#ol-code-in').fill(codigo);
  await b.locator('#ol-join-form button[type=submit]').click();
  await expect(b.locator('#ol-lobby')).toBeVisible();

  await expect(a.locator('#ol-members li')).toHaveCount(2);
  await expect(b.locator('#ol-members li')).toHaveCount(2);

  await b.locator('#btn-ol-ready').click();
  await expect(a.locator('#btn-ol-start')).toBeEnabled();
  await a.locator('#btn-ol-start').click();

  for (const p of [a, b]) {
    await expect.poll(() => p.evaluate(() => window.__deadzone.state), { timeout: 30_000 }).toBe('play');
    expect(await p.evaluate(() => window.__deadzone.online.active)).toBe(true);
  }
  expect(erroresA.filter((e) => !/favicon/.test(e))).toEqual([]);
  expect(erroresB.filter((e) => !/favicon/.test(e))).toEqual([]);
});

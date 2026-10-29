import { expect, test } from '@playwright/test';
import { abrir, esperarEstado, jugarSolo, terminarOleada } from './helpers.js';

test('el juego carga sin errores de consola', async ({ page }) => {
  const errores = await abrir(page);
  await expect(page.locator('h1.logo')).toContainText('Dead');
  await page.waitForTimeout(500);
  expect(errores).toEqual([]);
});

test('partida en solitario: moverse y disparar', async ({ page }) => {
  const errores = await abrir(page);
  await jugarSolo(page);

  const antes = await page.evaluate(() => ({ x: window.__deadzone.player.x, y: window.__deadzone.player.y }));
  await page.keyboard.down('KeyD');
  await expect
    .poll(() =>
      page.evaluate((a) => Math.hypot(window.__deadzone.player.x - a.x, window.__deadzone.player.y - a.y), antes),
    )
    .toBeGreaterThan(20);
  await page.keyboard.up('KeyD');

  const mag = () => page.evaluate(() => window.__deadzone.player.weapon.mag);
  const m0 = await mag();
  const box = await page.locator('canvas').first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.4);
  await page.mouse.down();
  await expect.poll(mag).toBeLessThan(m0);
  await page.mouse.up();

  expect(errores).toEqual([]);
});

test('la tienda se abre entre rondas y se cierra', async ({ page }) => {
  const errores = await abrir(page);
  await jugarSolo(page);
  await terminarOleada(page);
  // al limpiar la oleada el juego abre la tienda solo
  await esperarEstado(page, 'shop');
  await expect(page.locator('#screen-shop')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__deadzone.closeShop());
  await esperarEstado(page, 'play');
  expect(errores).toEqual([]);
});

test('modo desarrollador: ?dev=1 abre el panel, da dinero y salta de ronda', async ({ page }) => {
  const errores = await abrir(page, '/index.html?dev=1');
  await expect(page.locator('#dev')).toBeVisible();
  await jugarSolo(page);
  const dinero = () => page.evaluate(() => window.__deadzone.money);
  const m0 = await dinero();
  await page.locator('#dev [data-act="money"][data-n="1000"]').click();
  expect(await dinero()).toBe(m0 + 1000);
  // ir a la ronda 5: arranca sin pasar por las anteriores y el panel lo cuenta
  await page.locator('#dev-wave').fill('5');
  await page.locator('#dev [data-act="goto"]').click();
  await expect.poll(() => page.evaluate(() => window.__deadzone.director.wave)).toBe(5);
  await expect(page.locator('#dev-stats')).toContainText('Oleada 5 · en curso');
  // la partida queda marcada (sin récord) y la tecla º / ` oculta el panel
  expect(await page.evaluate(() => window.__deadzone.devUsed)).toBe(true);
  await page.keyboard.press('Backquote');
  await expect(page.locator('#dev')).toBeHidden();
  // ?dev=0 lo apaga para las próximas cargas
  await page.goto('/index.html?dev=0');
  await expect.poll(() => page.evaluate(() => window.__deadzone?.state)).toBe('menu');
  await expect(page.locator('#dev')).toBeHidden();
  expect(errores).toEqual([]);
});

test('guardar, recargar y continuar', async ({ page }) => {
  const errores = await abrir(page);
  await jugarSolo(page);
  await terminarOleada(page);
  const oleada = await page.evaluate(() => window.__deadzone.director.wave);
  await page.evaluate(() => window.__deadzone.saveProgress());

  await page.reload();
  await expect(page.locator('#btn-continue')).toBeVisible();
  await page.locator('#btn-continue').click();
  await esperarEstado(page, 'play');
  expect(await page.evaluate(() => window.__deadzone.director.wave)).toBe(oleada);
  expect(errores).toEqual([]);
});

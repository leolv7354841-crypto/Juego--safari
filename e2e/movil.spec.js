import { devices, expect, test } from '@playwright/test';
import { abrir, esperarEstado, jugarSolo } from './helpers.js';

// Vista de celular con pantalla táctil (iPhone en WebKit, Pixel en Chromium).
test.describe('móvil táctil', () => {
  test('muestra los controles táctiles y se puede jugar', async ({ browser, browserName }) => {
    const perfil = browserName === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7'];
    const context = await browser.newContext({ ...perfil, baseURL: 'http://127.0.0.1:4173' });
    const page = await context.newPage();
    const errores = await abrir(page);

    await jugarSolo(page);
    expect(await page.evaluate(() => window.__deadzone.input.mode)).toBe('touch');
    await expect(page.locator('#btn-fire')).toBeVisible();
    await expect(page.locator('#btn-run')).toBeVisible();
    await expect(page.locator('#btn-reload')).toBeVisible();

    const mag = () => page.evaluate(() => window.__deadzone.player.weapon.mag);
    const m0 = await mag();
    const fire = await page.locator('#btn-fire').boundingBox();
    await page.touchscreen.tap(fire.x + fire.width / 2, fire.y + fire.height / 2);
    await page.locator('#btn-pause').click();
    await esperarEstado(page, 'pause');
    expect(await mag()).toBeLessThanOrEqual(m0);
    expect(errores).toEqual([]);
    await context.close();
  });
});

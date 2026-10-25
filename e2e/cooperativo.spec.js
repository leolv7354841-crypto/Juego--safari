import { expect, test } from '@playwright/test';
import { abrir } from './helpers.js';

// Cooperativo P2P entre dos páginas. El juego usa Firebase solo para que los dos se encuentren (la oferta y la
// respuesta WebRTC); aquí esa base de datos es un doble en memoria que atiende las peticiones REST de /rooms, así la
// prueba no toca la base real ni necesita internet. Los datos del juego viajan por una conexión WebRTC de verdad
// entre las dos páginas (candidatos locales; sin STUN). Solo Chromium: WebRTC en WebKit sin ventana no es fiable.
test.skip(({ browserName }) => browserName !== 'chromium', 'WebRTC entre páginas solo se prueba en Chromium');
// sin esta opción Chromium oculta las IP locales detrás de nombres .local y las dos páginas no se encuentran
test.use({ launchOptions: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] } });

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': '*',
};

// Doble de Firebase Realtime Database (REST): /rooms/<código>.json y /rooms/<código>/<campo>.json
function firebaseFalso() {
  const salas = new Map();
  const handler = async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const m = new URL(req.url()).pathname.match(/^\/rooms\/([A-Z]{4})(?:\/(\w+))?\.json$/);
    // lo demás de la base (la clasificación global) también se atiende aquí: la prueba no toca la base real
    if (!m)
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: 'null' });
    const [, codigo, campo] = m;
    const json = (v) =>
      route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(v) });
    const cuerpo = req.postData() ? JSON.parse(req.postData()) : null;
    switch (req.method()) {
      case 'GET':
        return json(campo ? ((salas.get(codigo) || {})[campo] ?? null) : (salas.get(codigo) ?? null));
      case 'PUT':
        if (campo) salas.set(codigo, { ...(salas.get(codigo) || {}), [campo]: cuerpo });
        else salas.set(codigo, cuerpo);
        return json(cuerpo);
      case 'PATCH':
        salas.set(codigo, { ...(salas.get(codigo) || {}), ...cuerpo });
        return json(cuerpo);
      case 'DELETE':
        if (campo) delete (salas.get(codigo) || {})[campo];
        else salas.delete(codigo);
        return json(null);
      default:
        return route.fulfill({ status: 405, headers: CORS, body: 'null' });
    }
  };
  return { handler, salas };
}

// Con dos páginas abiertas, la que queda atrás no anima: se la trae al frente antes de actuar sobre ella.
async function clic(page, selector) {
  await page.bringToFront();
  await page.locator(selector).dispatchEvent('click');
}

const juego = (page, fn, arg) => page.evaluate(fn, arg);

test('anfitrión e invitado: sala con código, mundo compartido y desconexión', async ({ browser }) => {
  test.setTimeout(120_000);
  const db = firebaseFalso();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  for (const ctx of [ctxA, ctxB]) await ctx.route('**/*.firebaseio.com/**', db.handler);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const erroresA = await abrir(a, '/index.html');
  const erroresB = await abrir(b, '/index.html');

  // anfitrión: crea la sala y aparece el código
  await clic(a, '#btn-coop');
  await clic(a, '#btn-coop-create');
  await expect(a.locator('#coop-code')).toHaveText(/^[A-Z]{4}$/);
  const codigo = (await a.locator('#coop-code').innerText()).trim();
  expect(db.salas.has(codigo)).toBe(true);

  // invitado: entra con el código
  await clic(b, '#btn-coop');
  await b.locator('#coop-code-in').fill(codigo);
  await b.locator('#coop-code-in').press('Enter');

  for (const p of [a, b]) {
    await expect.poll(() => juego(p, () => window.__deadzone.state), { timeout: 45_000 }).toBe('play');
  }
  expect(await juego(a, () => window.__deadzone.mode.kind)).toBe('coopHost');
  expect(await juego(b, () => window.__deadzone.mode.kind)).toBe('coopGuest');
  // la sala de Firebase solo sirve para presentarse: al abrirse la conexión directa se borra
  await expect.poll(() => db.salas.has(codigo), { timeout: 15_000 }).toBe(false);

  // el invitado no calcula el mundo; el anfitrión sí
  expect(await juego(a, () => window.__deadzone.mode.authority())).toBe(true);
  expect(await juego(b, () => window.__deadzone.mode.authority())).toBe(false);

  // empieza la primera oleada en el anfitrión: los zombis llegan al invitado por las fotos
  await a.bringToFront();
  await juego(a, () => window.__deadzone.startNextRound());
  await expect.poll(() => juego(a, () => window.__deadzone.horde.list.length), { timeout: 20_000 }).toBeGreaterThan(0);
  await b.bringToFront();
  await expect.poll(() => juego(b, () => window.__deadzone.horde.list.length), { timeout: 20_000 }).toBeGreaterThan(0);

  // las balas del invitado son de adorno: un impacto aquí no hiere a nadie (el daño lo calcula el anfitrión)
  const golpe = await juego(b, () => {
    const g = window.__deadzone;
    const z = g.horde.list[0];
    const antes = z.hp;
    g.hitZombie(z, { dmg: 9999, dx: 1, dy: 0, knock: 1, pierce: 0, hits: null }, z.x, z.y);
    return { antes, despues: z.hp, muerto: !!z.dead };
  });
  expect(golpe.despues).toBe(golpe.antes);
  expect(golpe.muerto).toBe(false);

  // cada uno ve al otro en su sitio (la posición viaja por el canal rápido)
  await expect
    .poll(
      async () => {
        await b.bringToFront();
        const host = await juego(a, () => ({ x: window.__deadzone.player.x, y: window.__deadzone.player.y }));
        const visto = await juego(b, () => {
          const q = window.__deadzone.remote.peers.get(0);
          return q ? { x: q.x, y: q.y } : null;
        });
        return visto ? Math.hypot(host.x - visto.x, host.y - visto.y) : 1e9;
      },
      { timeout: 20_000 },
    )
    .toBeLessThan(40);
  await expect
    .poll(
      async () => {
        await a.bringToFront();
        const inv = await juego(b, () => ({ x: window.__deadzone.player.x, y: window.__deadzone.player.y }));
        const visto = await juego(a, () => {
          const q = window.__deadzone.coop.peer;
          return q ? { x: q.x, y: q.y } : null;
        });
        return visto ? Math.hypot(inv.x - visto.x, inv.y - visto.y) : 1e9;
      },
      { timeout: 20_000 },
    )
    .toBeLessThan(40);

  // el anfitrión se va: el invitado vuelve al menú, en solitario y sin restos de la partida de dos
  await juego(a, () => window.__deadzone.coop.leave());
  await expect.poll(() => juego(b, () => window.__deadzone.state), { timeout: 20_000 }).toBe('menu');
  expect(await juego(b, () => window.__deadzone.mode.kind)).toBe('solo');
  expect(await juego(b, () => window.__deadzone.remote.active)).toBe(false);
  expect(await juego(b, () => window.__deadzone.coop.role)).toBe(null);
  // el anfitrión sigue jugando solo: tampoco se guarda esa partida de dos
  expect(await juego(a, () => window.__deadzone.mode.kind)).toBe('solo');
  expect(await juego(a, () => window.__deadzone.mode.savesProgress())).toBe(false);

  // sin errores de consola (salvo avisos conocidos)
  const CONOCIDO = /favicon|Wrong protocol for WebSocket|ERR_NAME_NOT_RESOLVED/; // lo último: recursos externos (tipografías) sin internet
  expect(erroresA.filter((e) => !CONOCIDO.test(e))).toEqual([]);
  expect(erroresB.filter((e) => !CONOCIDO.test(e))).toEqual([]);
});

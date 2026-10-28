// Partida real de 2 navegadores (Chromium) contra el servidor local: camina 40 s y mide bytes,
// correcciones de posición y el diagnóstico F3. Uso: node docs/refactor/spike-colyseus/real.mjs ETIQUETA PUERTO_SERVIDOR PUERTO_WEB
import { chromium } from '@playwright/test';
const [label, SERVER, WEB] = process.argv.slice(2);
const SECS = Number(process.env.SECS || 40);
const base = `http://127.0.0.1:${WEB}/index.html?servidor=${encodeURIComponent(`ws://127.0.0.1:${SERVER}`)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
async function abrir(url) {
  const page = await (await browser.newContext()).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.__deadzone?.state === 'account' || window.__deadzone?.state === 'menu');
  if ((await page.evaluate(() => window.__deadzone.state)) === 'account') {
    await page.locator('#acct-name-in').fill('Prueba');
    await page.locator('#acct-pin-in').fill('1234');
    await page.locator('#acct-form button[type=submit]').click();
  }
  await page.locator('#btn-start').waitFor({ state: 'visible' });
  return { page, errs };
}
const clic = async (page, sel) => {
  await page.bringToFront();
  await page.locator(sel).dispatchEvent('click');
};
const A = await abrir(base);
const B = await abrir(base);
await clic(A.page, '#btn-online');
await A.page.locator('#ol-name').fill('Ana');
await clic(A.page, '#btn-ol-create');
await A.page.waitForFunction(() => !/·/.test(document.querySelector('#ol-code').textContent));
const code = (await A.page.locator('#ol-code').innerText()).trim();
await clic(B.page, '#btn-online');
await B.page.locator('#ol-name').fill('Beto');
await B.page.locator('#ol-code-in').fill(code);
await B.page.locator('#ol-code-in').press('Enter');
await B.page.locator('#ol-lobby').waitFor({ state: 'visible' });
for (let i = 0; i < 40; i++) {
  // con latencia el estado de la sala llega tarde: se reintenta hasta que el dueño lo ve listo
  if ((await B.page.locator('#btn-ol-ready').innerText()).toLowerCase().includes('estoy listo') && (await B.page.evaluate(() => !!window.__deadzone.online.me)))
    await clic(B.page, '#btn-ol-ready');
  await sleep(500);
  if (await A.page.evaluate(() => !document.querySelector('#btn-ol-start').disabled)) break;
}
await A.page.waitForFunction(() => !document.querySelector('#btn-ol-start').disabled, null, { timeout: 90000 }).catch(async (e) => {
  console.error('A:', await A.page.locator('#btn-ol-start').innerText(), '| B:', await B.page.locator('#ol-members').innerText());
  throw e;
});
await clic(A.page, '#btn-ol-start');
for (const { page } of [A, B]) await page.waitForFunction(() => window.__deadzone.state === 'play', null, { timeout: 40000 });
// sonda de correcciones: cuenta cada reconciliación con error > 0,5 px (sirve para cualquier predictor)
const probe = () => {
  const g = window.__deadzone;
  window.__c = { n: 0, sum: 0, max: 0, snaps0: g.remote.net.snaps ?? 0 };
  const o = g.online;
  const count = (e) => {
    if (e > 0.5) {
      window.__c.n++;
      window.__c.sum += e;
      window.__c.max = Math.max(window.__c.max, e);
    }
  };
  if (o.pred) {
    const rec = o.pred.reconcile.bind(o.pred);
    o.pred.reconcile = (...a) => {
      const e = rec(...a);
      count(e);
      return e;
    };
  } else {
    const note = o.noteCorrection.bind(o);
    o.noteCorrection = () => {
      window.__c.calls = (window.__c.calls || 0) + 1;
      count(o.rec ? Math.hypot(o.rec.lastCorrection.x || 0, o.rec.lastCorrection.y || 0) : 0);
      note();
    };
  }
  window.__t0 = { at: performance.now() };
  window.__b = { in: 0, out: 0, path: 0, px: g.player.x, py: g.player.y };
  const conn = o.room.connection;
  conn.transport.ws.addEventListener('message', (e) => (window.__b.in += e.data.byteLength || e.data.size || e.data.length || 0));
  const send = conn.send.bind(conn);
  conn.send = (d) => {
    window.__b.out += (d && (d.byteLength || d.length)) || 0;
    send(d);
  };
  setInterval(() => {
    window.__b.path += Math.hypot(g.player.x - window.__b.px, g.player.y - window.__b.py);
    window.__b.px = g.player.x;
    window.__b.py = g.player.y;
  }, 50);
};
for (const { page } of [A, B]) await page.evaluate(probe);
const keys = ['d', 's', 'a', 'w'];
let k = 0;
const t0 = Date.now();
while (Date.now() - t0 < SECS * 1000) {
  for (const { page } of [A, B]) {
    await page.bringToFront();
    await page.keyboard.down(keys[k % 4]);
  }
  await sleep(2500);
  for (const { page } of [A, B]) await page.keyboard.up(keys[k % 4]);
  k++;
}
const res = [];
for (const { page } of [A, B]) {
  res.push(
    await page.evaluate(() => {
      const g = window.__deadzone;
      const o = g.online;
      const s = (performance.now() - window.__t0.at) / 1000;
      return {
        secs: +s.toFixed(1),
        downKBs: +(window.__b.in / 1024 / s).toFixed(2),
        upKBs: +(window.__b.out / 1024 / s).toFixed(2),
        correcciones: window.__c.n,
        porMinuto: +((window.__c.n / s) * 60).toFixed(1),
        errMedio: window.__c.n ? +(window.__c.sum / window.__c.n).toFixed(2) : 0,
        errMax: +window.__c.max.toFixed(2),
        recorrido: Math.round(window.__b.path),
        diag: document.querySelector('#net-stat')?.textContent,
      };
    }),
  );
}
// comprobación de la sonda: se desvía a propósito la predicción 30 px y debe verse una corrección
const sanity = [];
for (const { page } of [A, B]) {
  await page.bringToFront();
  await page.keyboard.down('a');
  await sleep(400);
  sanity.push(
    await page.evaluate(async () => {
      const o = window.__deadzone.online;
      if (!o.rec) return null;
      const n0 = window.__c.n;
      const calls0 = window.__c.calls;
      o.rec.state.x += 30;
      await new Promise((r) => setTimeout(r, 1500));
      return { reconciliaciones: window.__c.calls, antes: calls0, correccionesNuevas: window.__c.n - n0, maxNuevo: window.__c.max };
    }),
  );
  await page.keyboard.up('a');
}
const health = await (await fetch(`http://127.0.0.1:${SERVER}/health`)).json();
console.log(JSON.stringify({ label, res, sanity, errores: [...A.errs, ...B.errs].slice(0, 5), health }, null, 1));
await browser.close();
process.exit(0);

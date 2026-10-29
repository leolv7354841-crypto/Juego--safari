// El cliente REST de Supabase (js/net/supabase.ts) arma bien las peticiones: funciones por rpc y
// lectura de tablas con la clave publicable en las cabeceras.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ONLINE } from '../js/core/config.ts';
import { activo, peticionRpc, peticionSelect } from '../js/net/supabase.ts';

test('sin proyecto configurado no hay clasificación mundial ni estadísticas', () => {
  const guardado = { ...ONLINE };
  ONLINE.url = '';
  ONLINE.key = '';
  assert.equal(activo(), false);
  ONLINE.url = 'https://abc.supabase.co';
  assert.equal(activo(), false, 'hace falta también la clave');
  ONLINE.key = 'sb_publishable_x';
  assert.equal(activo(), true);
  Object.assign(ONLINE, guardado);
});

test('rpc: POST a /rest/v1/rpc/<fn> con la clave y el cuerpo en JSON', () => {
  const guardado = { ...ONLINE };
  ONLINE.url = 'https://abc.supabase.co/';
  ONLINE.key = 'sb_publishable_x';
  const { url, init } = peticionRpc('dz_record', { r: { uid: 'a', wave: 3 } }, true);
  assert.equal(url, 'https://abc.supabase.co/rest/v1/rpc/dz_record');
  assert.equal(init.method, 'POST');
  assert.equal(init.keepalive, true);
  assert.equal(init.headers.apikey, 'sb_publishable_x');
  assert.equal(init.headers.Authorization, 'Bearer sb_publishable_x');
  assert.deepEqual(JSON.parse(String(init.body)), { r: { uid: 'a', wave: 3 } });
  Object.assign(ONLINE, guardado);
});

test('select: GET a /rest/v1/<tabla>?<query>', () => {
  const guardado = { ...ONLINE };
  ONLINE.url = 'https://abc.supabase.co';
  ONLINE.key = 'k';
  const { url, init } = peticionSelect('scores', 'select=uid,name&limit=50');
  assert.equal(url, 'https://abc.supabase.co/rest/v1/scores?select=uid,name&limit=50');
  assert.equal(init.method, 'GET');
  assert.equal(init.headers.apikey, 'k');
  Object.assign(ONLINE, guardado);
});

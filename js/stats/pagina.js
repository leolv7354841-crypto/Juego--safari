// Página de estadísticas (/stats, stats.html): pide los agregados a Supabase con la clave de acceso y los pinta.
// La clave se valida en Postgres (`estadisticas(clave, desde)`); se recuerda en este navegador.
import { SHOP, WEAPONS } from '../core/config.ts';
import { storage } from '../core/util.ts';
import { CLASSES } from '../sim/abilities.ts';
import { UPGRADES } from '../sim/upgrades.ts';
import { activo, rpc } from '../net/supabase.ts';

const CLAVE_KEY = 'dz-stats-clave';
const DIAS_KEY = 'dz-stats-dias';

const ZOMBI = {
  normal: 'Zombi normal',
  swat: 'Policía SWAT',
  sprinter: 'Velocista',
  heavy: 'Super blindado',
  bull: 'Toro (mordida)',
  bull_charge: 'Toro (cornada)',
  fat: 'Gordo',
  golden: 'Dorado',
  giant: 'Gigante',
  acid: 'Ácido del gordo',
  desconocida: 'Desconocida',
};
const TIPO = {
  arma: 'Arma',
  municion: 'Munición',
  objeto: 'Defensa o lanzable',
  robot: 'Robot',
  reparacion: 'Reparar robot',
  municion_pesada: 'Balas de torreta',
};
const FINAL = { muerte: 'Muerte', fin: 'Fin de sala', abandono: 'Abandonada', en_curso: 'En curso' };
const MODO = { solo: 'Un jugador', online: 'En línea' };

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const nombreArma = (id) => (WEAPONS[id] && WEAPONS[id].name) || id;
const nombreItem = (tipo, id) => {
  if (tipo === 'arma' || tipo === 'municion') return nombreArma(id);
  if (tipo === 'robot' || tipo === 'reparacion') return 'Robot de combate';
  if (tipo === 'municion_pesada') return 'Torreta pesada';
  return (SHOP[id] && SHOP[id].name) || id;
};
const nombreMejora = (id) => {
  const u = UPGRADES.find((x) => x.id === id);
  return u ? u.name : id;
};
const nombreClase = (id) => (CLASSES[id] && CLASSES[id].name) || id;
const fmt = (n, dec = 0) =>
  Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: dec, minimumFractionDigits: dec });
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : 0);

let dias = Number(storage.get(DIAS_KEY, 30)) || 0;
let datos = null;

function desde() {
  if (!dias) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (dias - 1));
  return d.toISOString();
}

function mostrarClave(err) {
  $('panel').hidden = true;
  $('estado').hidden = true;
  $('clave-form').hidden = false;
  $('clave-err').hidden = !err;
  $('clave-err').textContent = err || '';
  $('clave-in').focus();
}

async function cargar() {
  const clave = storage.get(CLAVE_KEY, '');
  if (!clave) return mostrarClave('');
  $('clave-form').hidden = true;
  $('estado').hidden = false;
  $('estado').textContent = 'Cargando…';
  if (!datos) $('panel').hidden = true;
  try {
    const r = await rpc('estadisticas', { clave, desde: desde() });
    if (r.status === 400 || r.status === 401 || r.status === 403) {
      let msg = '';
      try {
        msg = (await r.json()).message || '';
      } catch {
        /* sin cuerpo */
      }
      if (/clave/i.test(msg) || r.status !== 400) {
        storage.remove(CLAVE_KEY);
        return mostrarClave('Clave incorrecta.');
      }
      throw new Error(msg || `Error ${r.status}`);
    }
    if (!r.ok) throw new Error(`Error ${r.status}`);
    datos = await r.json();
    pintar(datos);
    $('estado').hidden = true;
    $('panel').hidden = false;
  } catch (e) {
    $('estado').textContent = `No se pudieron cargar las estadísticas: ${e.message || e}`;
  }
}

/* ---------- dibujo ---------- */

function tile(valor, etiqueta, sufijo = '') {
  return `<div class="tile"><b>${valor}${sufijo ? `<small>${sufijo}</small>` : ''}</b><span>${etiqueta}</span></div>`;
}

// Barras verticales: `filas` [{ etiqueta, valor, valor2? }]; la segunda serie se pinta detrás.
function barras(el, filas, vacio) {
  if (!filas.length) {
    el.innerHTML = `<p class="vacio">${vacio}</p>`;
    return;
  }
  const max = Math.max(1, ...filas.map((f) => Math.max(f.valor, f.valor2 || 0)));
  el.innerHTML = filas
    .map(
      (f) =>
        `<div class="col${f.valor2 != null ? ' doble' : ''}" title="${f.titulo || `${f.etiqueta}: ${f.valor}`}"><b>${f.valor}</b>` +
        (f.valor2 != null ? `<div class="bar dim" style="height:${(100 * f.valor2) / max}%"></div>` : '') +
        `<div class="bar" style="height:${(100 * f.valor) / max}%"></div><i>${f.etiqueta}</i></div>`,
    )
    .join('');
}

// Tabla con columnas [{ k, t, n?, w?, color? }]: `n` alinea a la derecha, `w` añade una barra de porcentaje.
function tabla(el, cols, filas, vacio) {
  const head = `<tr>${cols.map((c) => `<th${c.n ? ' class="n"' : ''}>${c.t}</th>`).join('')}</tr>`;
  if (!filas.length) {
    el.innerHTML = `${head}<tr><td class="vacio" colspan="${cols.length}">${vacio}</td></tr>`;
    return;
  }
  el.innerHTML =
    head +
    filas
      .map(
        (f) =>
          `<tr>${cols
            .map((c) => {
              const v = typeof c.k === 'function' ? c.k(f) : f[c.k];
              const barra = c.w
                ? `<span class="w"><i class="${c.color || ''}" style="--w:${Math.min(100, c.w(f))}%"></i></span>`
                : '';
              return `<td${c.n ? ' class="n"' : ''}>${v}${barra}</td>`;
            })
            .join('')}</tr>`,
      )
      .join('');
}

function pintar(d) {
  const r = d.resumen || {};
  const ret = d.retencion || {};
  $('tiles').innerHTML = [
    tile(fmt(r.visitas), 'Visitas'),
    tile(fmt(r.dispositivos), 'Dispositivos'),
    tile(fmt(r.nuevos), 'Nuevos'),
    tile(fmt(r.minutos_sesion, 1), 'Minutos por visita'),
    tile(fmt(r.partidas_terminadas), 'Partidas terminadas'),
    tile(fmt(r.oleada_media, 2), 'Oleada media', ` · máx ${fmt(r.oleada_max)}`),
    tile(fmt(r.minutos_partida, 1), 'Minutos por partida'),
    tile(fmt(ret.nuevos_volvieron), 'Nuevos que volvieron', ` / ${fmt(ret.nuevos)}`),
  ].join('');

  barras(
    $('g-visitas'),
    (d.visitas_dia || []).map((v) => ({
      etiqueta: String(v.dia).slice(5),
      valor: v.visitas,
      valor2: v.dispositivos,
      titulo: `${v.dia}: ${v.visitas} visitas, ${v.dispositivos} dispositivos`,
    })),
    'Sin visitas en este periodo.',
  );
  const vis = r.visitas || 0;
  tabla(
    $('t-origenes'),
    [
      { k: 'origen', t: 'Origen' },
      { k: (f) => fmt(f.visitas), t: 'Visitas', n: true, w: (f) => pct(f.visitas, vis) },
    ],
    d.origenes || [],
    'Sin datos.',
  );
  tabla(
    $('t-tactil'),
    [
      { k: (f) => (f.tactil ? 'Táctil (celular)' : 'Ratón y teclado'), t: 'Entrada' },
      { k: (f) => fmt(f.visitas), t: 'Visitas', n: true, w: (f) => pct(f.visitas, vis) },
    ],
    d.tactil || [],
    'Sin datos.',
  );

  $('t-retencion').innerHTML = [
    tile(fmt(ret.pct, 1), 'Volvieron otro día', '%'),
    tile(fmt(ret.volvieron), 'Dispositivos que volvieron', ` / ${fmt(ret.dispositivos)}`),
    tile(fmt(pct(ret.nuevos_volvieron, ret.nuevos)), 'De los nuevos del periodo', '%'),
  ].join('');
  barras(
    $('g-dias'),
    (d.dias_por_dispositivo || []).map((v) => ({ etiqueta: `${v.dias} d`, valor: v.dispositivos })),
    'Sin datos.',
  );

  barras(
    $('g-rondas'),
    (d.rondas || []).map((v) => ({
      etiqueta: String(v.oleada),
      valor: v.partidas,
      titulo: `Oleada ${v.oleada}: ${v.partidas} partidas`,
    })),
    'Todavía no hay partidas terminadas.',
  );
  const term = r.partidas_terminadas || 0;
  tabla(
    $('t-clases'),
    [
      { k: (f) => nombreClase(f.clase), t: 'Clase' },
      { k: (f) => fmt(f.partidas), t: 'Partidas', n: true, w: (f) => pct(f.partidas, term) },
      { k: (f) => fmt(f.oleada_media, 2), t: 'Oleada media', n: true },
      { k: (f) => fmt(f.oleada_max), t: 'Máx', n: true },
    ],
    d.clases || [],
    'Sin partidas.',
  );
  tabla(
    $('t-modos'),
    [
      { k: (f) => MODO[f.modo] || f.modo, t: 'Modo' },
      { k: (f) => fmt(f.partidas), t: 'Partidas', n: true, w: (f) => pct(f.partidas, term) },
      { k: (f) => fmt(f.oleada_media, 2), t: 'Oleada media', n: true },
    ],
    d.modos || [],
    'Sin partidas.',
  );

  tabla(
    $('t-mejoras'),
    [
      { k: (f) => `${nombreMejora(f.id)} <small>${f.id}</small>`, t: 'Mejora' },
      { k: (f) => fmt(f.ofrecida), t: 'Ofrecida', n: true },
      { k: (f) => fmt(f.elegida), t: 'Elegida', n: true },
      { k: (f) => `${fmt(f.tasa, 1)} %`, t: 'Tasa', n: true, w: (f) => f.tasa, color: 'xp' },
    ],
    d.mejoras || [],
    'Nadie ha subido de nivel todavía.',
  );

  const compras = d.compras || [];
  const totalCompras = compras.reduce((a, c) => a + c.compras, 0);
  tabla(
    $('t-compras'),
    [
      { k: (f) => `${nombreItem(f.tipo, f.item)} <small>${TIPO[f.tipo] || f.tipo}</small>`, t: 'Qué' },
      { k: (f) => fmt(f.compras), t: 'Compras', n: true, w: (f) => pct(f.compras, totalCompras), color: 'st' },
      { k: (f) => fmt(f.unidades), t: 'Unidades', n: true },
      { k: (f) => `$${fmt(f.gastado)}`, t: 'Gastado', n: true },
      { k: (f) => fmt(f.oleada_media, 1), t: 'Oleada media', n: true },
    ],
    compras,
    'Sin compras.',
  );

  const muertes = r.muertes || 0;
  tabla(
    $('t-muertes'),
    [
      { k: (f) => ZOMBI[f.causa] || f.causa, t: 'Causa' },
      { k: (f) => fmt(f.muertes), t: 'Muertes', n: true, w: (f) => pct(f.muertes, muertes), color: 'hp' },
      { k: (f) => fmt(f.oleada_media, 1), t: 'Oleada media', n: true },
    ],
    d.muertes || [],
    'Nadie ha muerto todavía.',
  );
  tabla(
    $('t-armas'),
    [
      { k: (f) => nombreArma(f.arma), t: 'Arma' },
      { k: (f) => fmt(f.muertes), t: 'Muertes', n: true, w: (f) => pct(f.muertes, muertes), color: 'hp' },
    ],
    d.armas_muerte || [],
    'Sin datos.',
  );
  const partidas = r.partidas || 0;
  tabla(
    $('t-finales'),
    [
      { k: (f) => FINAL[f.estado] || f.estado, t: 'Final' },
      { k: (f) => fmt(f.partidas), t: 'Partidas', n: true, w: (f) => pct(f.partidas, partidas) },
    ],
    d.finales || [],
    'Sin partidas.',
  );

  const gen = d.generado ? new Date(d.generado).toLocaleString('es-MX') : '';
  $('pie').textContent =
    `${dias ? `Últimos ${dias} días` : 'Desde el principio'} · generado ${gen}. Datos anónimos: sin nombres de cuenta ni direcciones.`;
}

/* ---------- botones ---------- */

function sincronizarPeriodo() {
  for (const b of $('periodo').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.dias) === dias);
}

function arrancar() {
  if (!activo()) {
    $('estado').hidden = false;
    $('estado').textContent = 'Falta configurar Supabase (ONLINE.url y ONLINE.key en js/core/config.ts).';
    return;
  }
  sincronizarPeriodo();
  $('periodo').addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b) return;
    dias = Number(b.dataset.dias) || 0;
    storage.set(DIAS_KEY, dias);
    sincronizarPeriodo();
    cargar();
  });
  $('btn-refrescar').addEventListener('click', cargar);
  $('btn-salir').addEventListener('click', () => {
    storage.remove(CLAVE_KEY);
    datos = null;
    mostrarClave('');
  });
  $('clave-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = /** @type {HTMLInputElement} */ ($('clave-in')).value.trim();
    if (!v) return;
    storage.set(CLAVE_KEY, v);
    cargar();
  });
  cargar();
}

arrancar();
// para depurar y para las pruebas: pintar datos sin pedirlos
window.__dzStats = { pintar, cargar };

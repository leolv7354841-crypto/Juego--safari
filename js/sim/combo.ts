// Racha de bajas: cada baja hecha antes de COMBO.window s de la anterior la alarga, y mientras más
// larga, más dinero y experiencia da cada zombi. Un golpe de zombi la corta. Vive en el jugador
// (p.combo); la llevan quien simula (solitario, anfitrión, servidor) y la foto se la manda a los demás.
import { COMBO } from '../core/config.ts';

export type Combo = { n: number; t: number; best: number };

/** @returns {Combo} */
export const newCombo = () => ({ n: 0, t: 0, best: 0 });

/** Nivel de la racha: 0 sin multiplicador; 1, 2… según COMBO.tiers. */
export function comboTier(n) {
  let k = 0;
  while (k < COMBO.tiers.length && n >= COMBO.tiers[k][0]) k++;
  return k;
}

/** Multiplicador del dinero y la experiencia con n bajas seguidas. */
export function comboMult(n) {
  const k = comboTier(n);
  return k ? COMBO.tiers[k - 1][1] : 1;
}

/**
 * Una baja de este tipo alarga la racha (el dorado vale COMBO.golden) y reinicia el reloj.
 * Devuelve el multiplicador que toca a esa baja.
 * @param {Combo} c
 */
export function comboKill(c: Combo, type) {
  c.n += type === 'golden' ? COMBO.golden : 1;
  c.t = COMBO.window;
  if (c.n > c.best) c.best = c.n;
  return comboMult(c.n);
}

/** Corre el reloj: la racha se acaba si pasan COMBO.window s sin bajas, o si su dueño cae. */
export function comboTick(p, dt) {
  const c = p.combo;
  if (!(c.n > 0)) return;
  if (!p.alive) return comboBreak(c);
  c.t -= dt;
  if (c.t <= 0) comboBreak(c);
}

/** Golpe de zombi: la racha se corta. @param {Combo} c */
export function comboBreak(c: Combo) {
  c.n = 0;
  c.t = 0;
}

/** Multiplicador como se escribe en pantalla (×1,5). */
export const multText = (m) => `×${String(m).replace('.', ',')}`;

/** Racha y reloj (en décimas) para la foto. @param {Combo} c */
export const packCombo = (c: Combo) => [c.n, Math.ceil(c.t * 10)];

/** Racha que llega en la foto (invitado del cooperativo o cliente en línea); la mejor se lleva aquí. */
export function applyCombo(c, a) {
  if (!Array.isArray(a)) return;
  c.n = Math.max(0, a[0] | 0);
  c.t = Math.max(0, Number(a[1]) || 0) / 10;
  if (c.n > c.best) c.best = c.n;
}

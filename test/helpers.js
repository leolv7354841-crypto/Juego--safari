// Ayudas comunes de las pruebas del núcleo.

import { Solo } from '../js/net/mode.ts';

export const silent = new Proxy({}, { get: () => () => {} });

// Un `game` mínimo con lo que tocan combat/director/player.move.
export function fakeGame(extra = {}) {
  const calls = { splat: 0, hit: 0, banner: [] };
  return {
    calls,
    mode: new Solo(null),
    decals: { splat: () => calls.splat++ },
    particles: { hit: () => calls.hit++ },
    sfx: silent,
    banner: (t, s) => calls.banner.push([t, s]),
    ...extra,
  };
}

export function zombie(type = 'normal', hp = 100) {
  return { type, hp, mass: 1, kx: 0, ky: 0, slow: 0, flash: 0, hitT: 0, hitJolt: 0, lastDx: 0, lastDy: 0 };
}

export function bullet(over = {}) {
  return { dmg: 10, dx: 1, dy: 0, knock: 1, ...over };
}

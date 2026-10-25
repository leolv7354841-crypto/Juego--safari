// Dibujo de los objetos del suelo (munición, botiquines, cajas). La lógica vive en sim/pickups.js.
import { drawPickup } from './sprites.js';
import { LIFE } from '../sim/pickups.js';

export function drawPickups(ctx, list, view, time) {
  for (const it of list) {
    if (it.x < view.x0 - 20 || it.x > view.x1 + 20 || it.y < view.y0 - 20 || it.y > view.y1 + 20) continue;
    // parpadea cuando está por desaparecer
    if (it.t > LIFE - 4 && Math.sin(it.t * 18) > 0) continue;
    drawPickup(ctx, it.k, it.x, it.y, time + it.x);
  }
}

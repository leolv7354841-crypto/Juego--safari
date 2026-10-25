// Dibujo de lo que llega por la red: los demás jugadores (con su robot y su nombre) y las balas de adorno.
// El estado vive en game.remote (js/net/remote.js).
import { drawBullets } from './bullets.js';
import { drawRobot } from './robot.js';
import { drawSurvivor } from './sprites.js';

/** Robots estacionados, jugadores vivos con su nombre. Va justo después del jugador local. */
export function drawPeers(ctx, game) {
  const R = game.remote;
  if (!R.active) return;
  ctx.font = '700 11px sans-serif';
  ctx.textAlign = 'center';
  // robots estacionados de los demás (los pilotados se dibujan con su piloto)
  for (const r of R.robots.values()) if (!r.piloted) drawRobot(ctx, r, null, game.time);
  for (const q of R.peers.values()) {
    if (!q.alive) continue;
    if (q.away) ctx.globalAlpha = 0.45;
    const r = q.inRobot && R.robots.get(q.idx);
    if (r) drawRobot(ctx, r, q, game.time);
    else drawSurvivor(ctx, q, game.time);
    const name = q.away ? `${q.name} (reconectando)` : q.name;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(name, q.x + 1, q.y - q.r - 13);
    ctx.fillStyle = '#9fd0ff';
    ctx.fillText(name, q.x, q.y - q.r - 14);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'start';
}

/** Balas de los demás jugadores (de adorno: el daño lo calcula quien manda). */
export function drawRemoteBullets(ctx, game) {
  const R = game.remote;
  if (R.active && R.bullets.length) drawBullets(ctx, R.bullets);
}

// Dibujo de balas y cohetes. La lógica vive en sim/bullets.js.

export function drawBullets(ctx, list) {
  ctx.lineCap = 'round';
  for (const b of list) {
    if (b.rocket) {
      drawRocket(ctx, b.x, b.y, Math.atan2(b.dy, b.dx) + Math.sin((b.age || 0) * 31) * 0.12, true);
      continue;
    }
    const len = b.trail;
    ctx.strokeStyle = 'rgba(255,214,150,0.25)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(b.x - b.dx * len, b.y - b.dy * len);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,205,0.9)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(b.x - b.dx * len * 0.5, b.y - b.dy * len * 0.5);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

// Cohete de la bazuca (también se dibuja clavado en un zombi). flame = tobera encendida.
export function drawRocket(ctx, x, y, a, flame) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  if (flame) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,170,60,0.9)';
    ctx.beginPath();
    ctx.ellipse(-13, 0, 6 + Math.random() * 4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.fillStyle = '#4a5636';
  ctx.strokeStyle = '#141612';
  ctx.lineWidth = 1;
  ctx.fillRect(-9, -2.6, 13, 5.2);
  ctx.strokeRect(-9, -2.6, 13, 5.2);
  ctx.fillStyle = '#6d6f68';
  ctx.beginPath();
  ctx.moveTo(4, -3.4);
  ctx.lineTo(11, 0);
  ctx.lineTo(4, 3.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2a3220';
  ctx.beginPath();
  ctx.moveTo(-9, -2.6);
  ctx.lineTo(-12, -5);
  ctx.lineTo(-7, -2.6);
  ctx.moveTo(-9, 2.6);
  ctx.lineTo(-12, 5);
  ctx.lineTo(-7, 2.6);
  ctx.fill();
  ctx.restore();
}

// Dibujo del robot pilotable. La lógica vive en sim/robot.js.
import { ROBOT, GUN_REACH } from '../core/config.ts';
import { TAU, roundRect } from '../core/util.ts';
import { OUT, drawGunScaled } from './sprites.js';

export function drawRobot(g, rb, p, time) {
  const R = ROBOT.radius;
  g.save();
  g.translate(rb.x, rb.y);
  // sombra
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(4, 6, R * 1.05, R * 0.9, 0, 0, TAU);
  g.fill();
  // piernas: dos pies que avanzan alternados
  g.save();
  g.rotate(rb.legAngle);
  const s = Math.sin(rb.walk);
  for (const k of [-1, 1]) {
    const fx = k * s * R * 0.35;
    g.fillStyle = '#3a3f44';
    g.strokeStyle = OUT;
    g.lineWidth = 2;
    roundRect(g, fx - R * 0.42, k * R * 0.5 - R * 0.2, R * 0.84, R * 0.4, 4);
    g.fill();
    g.stroke();
    g.fillStyle = '#c9a54a';
    g.fillRect(fx + R * 0.2, k * R * 0.5 - R * 0.16, R * 0.12, R * 0.32);
  }
  g.restore();
  // torso
  g.rotate(rb.angle);
  const hit = rb.hitT > 0;
  g.fillStyle = hit ? '#9aa0a6' : '#5d646b';
  g.strokeStyle = OUT;
  g.lineWidth = 2.2;
  roundRect(g, -R * 0.75, -R * 0.78, R * 1.3, R * 1.56, 8);
  g.fill();
  g.stroke();
  // franjas de peligro
  g.save();
  g.beginPath();
  g.rect(-R * 0.75, -R * 0.78, R * 0.28, R * 1.56);
  g.clip();
  for (let i = -6; i < 8; i++) {
    g.fillStyle = i & 1 ? '#c9a54a' : '#1d1f22';
    g.beginPath();
    g.moveTo(-R * 0.75, i * 10);
    g.lineTo(-R * 0.47, i * 10 - 8);
    g.lineTo(-R * 0.47, i * 10 + 2);
    g.lineTo(-R * 0.75, i * 10 + 10);
    g.fill();
  }
  g.restore();
  // brazo izquierdo: puño blindado
  g.fillStyle = '#4b5157';
  roundRect(g, -R * 0.1, -R * 1.12, R * 0.9, R * 0.36, 6);
  g.fill();
  g.stroke();
  g.fillStyle = '#3a3f44';
  g.beginPath();
  g.arc(R * 0.86, -R * 0.94, R * 0.24, 0, TAU);
  g.fill();
  g.stroke();
  // brazo derecho con tu arma (más grande, como montada en el brazo)
  g.fillStyle = '#4b5157';
  roundRect(g, -R * 0.1, R * 0.76, R * 0.7, R * 0.36, 6);
  g.fill();
  g.stroke();
  g.save();
  g.translate(R * 0.35, R * 0.94);
  if (rb.piloted) drawArmGun(g, p);
  else {
    // sin piloto el brazo queda vacío
    g.fillStyle = '#3a3f44';
    g.beginPath();
    g.arc(R * 0.3, 0, R * 0.2, 0, TAU);
    g.fill();
    g.stroke();
  }
  g.restore();
  // cabina con el piloto
  g.fillStyle = 'rgba(120,170,190,0.55)';
  g.beginPath();
  g.arc(R * 0.08, 0, R * 0.42, 0, TAU);
  g.fill();
  g.stroke();
  if (rb.piloted) {
    g.fillStyle = '#c7a184';
    g.beginPath();
    g.arc(R * 0.06, 0, R * 0.22, 0, TAU);
    g.fill();
    g.fillStyle = '#2d2219';
    g.beginPath();
    g.arc(R * 0.03, 0, R * 0.2, Math.PI * 0.45, Math.PI * 1.55);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(R * 0.18, -R * 0.16, R * 0.14, R * 0.07, -0.5, 0, TAU);
  g.fill();
  // luz de estado
  const ok = rb.hp > ROBOT.hp * 0.35;
  g.fillStyle = ok ? '#7fe07a' : Math.sin(time * 10) > 0 ? '#ff5040' : '#5a1a14';
  g.beginPath();
  g.arc(-R * 0.55, -R * 0.55, 3, 0, TAU);
  g.fill();
  g.restore();
  if (rb.broken) {
    // chatarra humeante
    g.fillStyle = 'rgba(15,12,10,0.55)';
    g.beginPath();
    g.arc(rb.x, rb.y, R, 0, TAU);
    g.fill();
  }
}

// Tu arma, más grande, montada en el brazo derecho (con retroceso, recarga y fogonazo).
function drawArmGun(g, p) {
  g.translate(-(p.recoil || 0) * 6, 0);
  if (p.reloadT > 0) g.rotate(Math.sin((p.reloadProg || 0) * Math.PI) * 0.4);
  drawGunScaled(g, p, ROBOT.gunScale);
  if (p.flashT <= 0) return;
  const tip = (GUN_REACH[p.weapon.id] || 30) * ROBOT.gunScale;
  g.fillStyle = 'rgba(255,214,140,0.95)';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const d = i % 2 ? 5 : 14 + Math.random() * 8;
    g.lineTo(tip + Math.cos(a) * d * 1.3, Math.sin(a) * d * 0.7);
  }
  g.closePath();
  g.fill();
}

// Sprites de luz, sombra y efectos (lienzos sueltos para componerlos con modos de mezcla).
import { TAU, makeCanvas } from '../util.js';

function radial(size, stops) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const h = size / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  for (const [t, col] of stops) gr.addColorStop(t, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

export function buildFx() {
  const F = {};
  // sombra suave redonda (personajes, árboles)
  F.shadow = radial(64, [[0, 'rgba(0,0,0,0.75)'], [0.45, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]);
  // sombra suave rectangular (vehículos): rectángulos redondeados que se inflan
  {
    const W = 128;
    const H = 64;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const k = i * 1.6;
      g.fillStyle = 'rgba(0,0,0,0.11)';
      g.beginPath();
      g.roundRect ? g.roundRect(14 + k, 12 + k, W - 28 - k * 2, H - 24 - k * 2, 10) : g.rect(14 + k, 12 + k, W - 28 - k * 2, H - 24 - k * 2);
      g.fill();
    }
    F.shadowRect = c;
    F.shadowRectPad = [14 / W, 12 / H];
  }
  // luz blanca para recortar la oscuridad
  F.light = radial(256, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.75)'], [0.7, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
  // brillos de color (modo aditivo)
  F.warm = radial(256, [[0, 'rgba(255,190,110,0.85)'], [0.4, 'rgba(255,150,70,0.35)'], [1, 'rgba(255,120,40,0)']]);
  F.cyan = radial(128, [[0, 'rgba(160,250,255,1)'], [0.3, 'rgba(60,220,255,0.55)'], [1, 'rgba(20,150,255,0)']]);
  F.white = radial(64, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,250,235,0.5)'], [1, 'rgba(255,240,210,0)']]);
  F.red = radial(64, [[0, 'rgba(255,80,60,0.9)'], [1, 'rgba(255,30,20,0)']]);
  F.blue = radial(64, [[0, 'rgba(80,120,255,0.9)'], [1, 'rgba(30,60,255,0)']]);
  F.orange = radial(64, [[0, 'rgba(255,200,90,1)'], [0.35, 'rgba(255,120,30,0.6)'], [1, 'rgba(255,60,0,0)']]);
  // cono de los faros (apunta a +x, origen en el borde izquierdo al centro)
  {
    const W = 256;
    const H = 160;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(0, H / 2, 4, 0, H / 2, W);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.4)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, H / 2 - 6);
    g.lineTo(W, 0);
    g.lineTo(W, H);
    g.lineTo(0, H / 2 + 6);
    g.closePath();
    g.fill();
    F.cone = c;
    // versión cálida para el brillo aditivo
    const w = makeCanvas(W, H);
    const wg = w.getContext('2d');
    wg.drawImage(c, 0, 0);
    wg.globalCompositeOperation = 'source-atop';
    wg.fillStyle = 'rgb(255,226,170)';
    wg.fillRect(0, 0, W, H);
    F.coneWarm = w;
  }
  // destello de impacto (estrella de cuatro puntas)
  {
    const c = makeCanvas(96, 96);
    const g = c.getContext('2d');
    g.translate(48, 48);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 46);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(180,250,255,0.9)');
    gr.addColorStop(1, 'rgba(60,200,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const d = i % 2 ? 9 : 46;
      g.lineTo(Math.cos(a) * d, Math.sin(a) * d);
    }
    g.closePath();
    g.fill();
    F.star = c;
  }
  return F;
}

// Métricas del proceso para el diagnóstico y /health: frecuencia real de pasos y su duración.
export const STATS = {
  rooms: 0,
  simRooms: 0, // salas con partida en curso (las que simulan)
  players: 0,
  ticks: 0,
  tickMs: 0, // promedio del último segundo
  tickMax: 0,
  hz: 0,
  skipped: 0, // pasos descartados por atraso (pausas largas del proceso)
  cpu: 0, // % de un núcleo usado por el proceso en el último segundo
  rssMb: 0,
  tx: 0, // bytes enviados a los clientes por WebSocket (medición)
  startedAt: Date.now(),
};

let acc = { n: 0, ms: 0, max: 0, at: performance.now() };

export function countTick(ms: number) {
  STATS.ticks++;
  acc.n++;
  acc.ms += ms;
  acc.max = Math.max(acc.max, ms);
  const now = performance.now();
  if (now - acc.at >= 1000) {
    const secs = (now - acc.at) / 1000;
    STATS.hz = Math.round((acc.n / secs / Math.max(1, STATS.simRooms)) * 10) / 10;
    STATS.tickMs = Math.round((acc.ms / acc.n) * 100) / 100;
    STATS.tickMax = Math.round(acc.max * 100) / 100;
    acc = { n: 0, ms: 0, max: 0, at: now };
  }
}

// Uso de CPU y memoria del proceso, una vez por segundo.
let cpuPrev = process.cpuUsage();
let cpuAt = performance.now();
setInterval(() => {
  const now = performance.now();
  const d = process.cpuUsage(cpuPrev);
  STATS.cpu = Math.round(((d.user + d.system) / 1000 / (now - cpuAt)) * 1000) / 10;
  STATS.rssMb = Math.round(process.memoryUsage().rss / 1048576);
  cpuPrev = process.cpuUsage();
  cpuAt = now;
}, 1000).unref();

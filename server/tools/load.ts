// Prueba de carga: N clientes reales (SDK de Colyseus) que mandan entradas a 60 Hz como un
// jugador (moverse, apuntar al zombi más cercano, disparar) y consumen las fotos.
//
//   node tools/load.ts                      → 1 sala de 10 y luego 5 salas de 2, 60 s cada una
//   node tools/load.ts --url ws://host:2567 --secs 30 --rooms 1x10,5x2
//
// Mide en los clientes: fotos/s, KB/s recibidos (WebSocket, sin cabeceras TCP/TLS), RTT de
// aplicación y su variación; en el servidor (/health): pasos/s, duración media y máxima.
import { Client } from '@colyseus/sdk';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL_ = arg('url', 'ws://localhost:2567');
const HTTP = URL_.replace(/^ws/, 'http');
const SECS = Number(arg('secs', '60'));
const PLAN = arg('rooms', '1x10,5x2').split(',').map((s) => s.split('x').map(Number) as [number, number]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TAU = Math.PI * 2;

type Bot = { room: any; name: string; snaps: number; bytes: number; rtts: number[]; jit: number; last: number; seq: number; me: number[] | null; target: number | null; alive: boolean; kills: number; t0: number };

async function bot(room: any, name: string): Promise<Bot> {
  const b: Bot = { room, name, snaps: 0, bytes: 0, rtts: [], jit: 0, last: 0, seq: 0, me: null, target: null, alive: true, kills: 0, t0: Date.now() };
  const ws = room.connection.transport.ws;
  ws.addEventListener('message', (e: any) => (b.bytes += e.data.byteLength || e.data.length || 0));
  room.onMessage('*', () => {});
  room.onMessage('snap', (s: any) => {
    b.snaps++;
    b.me = s.me;
    b.alive = !!s.st[2];
    b.kills = s.st[6];
    // zombi más cercano (las posiciones vienen relativas a uno mismo)
    let best = Infinity;
    b.target = null;
    for (let i = 0; i + 5 < s.z.length; i += 6) {
      const d = s.z[i + 2] ** 2 + s.z[i + 3] ** 2;
      if (d < best) {
        best = d;
        b.target = Math.atan2(s.z[i + 3], s.z[i + 2]);
      }
    }
  });
  room.onMessage('p', (m: any) => {
    const rtt = performance.now() - m.c;
    if (b.last) b.jit += (Math.abs(rtt - b.last) - b.jit) / 8;
    b.last = rtt;
    b.rtts.push(rtt);
  });
  return b;
}

// Entradas a 60 Hz agrupadas como el navegador (un mensaje por fotograma de ~16 ms).
function drive(bots: Bot[]) {
  let t = 0;
  const iv = setInterval(() => {
    t++;
    for (const b of bots) {
      if (!b.alive) continue;
      // se aleja dando vueltas y dispara al más cercano
      const a = (t / 90 + b.name.length) % TAU;
      const aim = b.target ?? a;
      const run = t % 240 < 60 ? 1 : 0;
      b.room.send('in', { i: [[++b.seq, Math.round(Math.cos(a) * 1000) / 1000, Math.round(Math.sin(a) * 1000) / 1000, run | 2, Math.round(aim * 1000) / 1000, -1]] });
    }
  }, 1000 / 60);
  const ping = setInterval(() => {
    for (const b of bots) b.room.send('p', { c: Math.round(performance.now()) });
  }, 1000);
  return () => {
    clearInterval(iv);
    clearInterval(ping);
  };
}

async function scenario(rooms: number, per: number) {
  console.log(`\n== ${rooms} sala(s) de ${per} jugador(es) · ${SECS} s ==`);
  const bots: Bot[] = [];
  const owners: any[] = [];
  for (let r = 0; r < rooms; r++) {
    const owner = await new Client(URL_).create('dz', { name: `Bot ${r}-0` });
    owners.push(owner);
    bots.push(await bot(owner, `Bot ${r}-0`));
    for (let k = 1; k < per; k++) {
      const g = await new Client(URL_).joinById(owner.roomId, { name: `Bot ${r}-${k}` });
      bots.push(await bot(g, `Bot ${r}-${k}`));
      g.send('ready', { v: true });
    }
  }
  await sleep(500);
  for (const o of owners) o.send('start');
  await sleep(300);
  for (const b of bots) b.room.send('loaded');
  await sleep(800);
  for (const b of bots) {
    b.snaps = 0;
    b.bytes = 0;
    b.rtts = [];
    b.t0 = Date.now();
  }
  const stop = drive(bots);
  const ticks: any[] = [];
  for (let s = 0; s < SECS; s++) {
    await sleep(1000);
    ticks.push(await fetch(`${HTTP}/health`).then((r) => r.json()).catch(() => null));
  }
  stop();
  const secs = (Date.now() - bots[0].t0) / 1000;
  const snapsPer = bots.map((b) => b.snaps / secs);
  const kbPer = bots.map((b) => b.bytes / 1024 / secs);
  const rtts = bots.flatMap((b) => b.rtts).sort((a, b) => a - b);
  const pct = (p: number) => (rtts.length ? rtts[Math.min(rtts.length - 1, Math.floor(rtts.length * p))] : NaN);
  const ok = ticks.filter(Boolean);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  console.log(`fotos/s por cliente: media ${avg(snapsPer).toFixed(1)} · mín ${Math.min(...snapsPer).toFixed(1)}`);
  console.log(`recibido por cliente: media ${avg(kbPer).toFixed(1)} KB/s · máx ${Math.max(...kbPer).toFixed(1)} KB/s · total ${(avg(kbPer) * bots.length).toFixed(0)} KB/s`);
  console.log(`RTT de aplicación: p50 ${pct(0.5).toFixed(1)} ms · p95 ${pct(0.95).toFixed(1)} ms · máx ${pct(1).toFixed(1)} ms · variación media ${avg(bots.map((b) => b.jit)).toFixed(1)} ms`);
  console.log(`servidor: ${avg(ok.map((t) => t.tickHz)).toFixed(1)} pasos/s por sala (objetivo 60) · paso medio ${avg(ok.map((t) => t.tickMs)).toFixed(2)} ms · peor ${Math.max(...ok.map((t) => t.tickMaxMs)).toFixed(2)} ms · descartados ${ok.length ? ok[ok.length - 1].skippedTicks : '?'}`);
  console.log(`CPU del proceso servidor: media ${avg(ok.map((t) => t.cpuPercent)).toFixed(1)} % de un núcleo · máx ${Math.max(...ok.map((t) => t.cpuPercent)).toFixed(1)} % · memoria ${ok.length ? ok[ok.length - 1].rssMb : '?'} MB`);
  console.log(`bajas de los bots: ${bots.reduce((a, b) => a + b.kills, 0)} · vivos al final: ${bots.filter((b) => b.alive).length}/${bots.length}`);
  await Promise.all(bots.map((b) => Promise.race([b.room.leave().catch(() => {}), sleep(1000)])));
  await sleep(1500);
}

for (const [rooms, per] of PLAN) await scenario(rooms, per);
process.exit(0);

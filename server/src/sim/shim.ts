// Lienzo "mudo" para Node: los módulos del juego crean lienzos (sprites, trozos de suelo) al
// cargarse o al generar el mundo. En el servidor no se dibuja nada, así que basta con un
// objeto que acepte cualquier llamada sin hacer nada.
const noop = () => {};
const gradient = { addColorStop: noop };
const ctxTarget: Record<string, unknown> = {
  canvas: null,
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient,
  createPattern: () => ({}),
  measureText: () => ({ width: 0 }),
  getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
};
const ctx: any = new Proxy(ctxTarget, {
  get: (t, k) => (k in t ? t[k as string] : noop),
  set: () => true,
});

function makeCanvas() {
  return { width: 1, height: 1, style: {}, getContext: () => ctx };
}

const g = globalThis as any;
if (!g.document) g.document = { createElement: () => makeCanvas() };
if (!g.window) g.window = g;

// Versión del código (la inyecta Vite al compilar; en desarrollo y en el servidor es 'dev').
// Si una pestaña vieja sigue abierta cuando se publica otra versión, avisa que hay una nueva.
export const VERSION = typeof __DZ_VERSION__ === 'undefined' ? 'dev' : __DZ_VERSION__; // eslint-disable-line no-undef

export async function hayVersionNueva() {
  if (VERSION === 'dev') return false;
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const { version } = await r.json();
    return !!version && version !== VERSION;
  } catch {
    return false;
  }
}

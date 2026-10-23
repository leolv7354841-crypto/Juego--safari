// Servidor multijugador de Dead Zone: salas privadas por WebSocket (Colyseus) con la
// simulación autoritativa en memoria. Una sola instancia, sin base de datos.
import { startServer } from './app.ts';
import { CONFIG } from './config.ts';

const { lag } = await startServer();
console.log(`Dead Zone en línea: ws://${CONFIG.host}:${CONFIG.port} (salud: /health${lag ? `, latencia simulada ${lag} ms` : ''})`);
if (!CONFIG.origins.length) console.log('Aviso: ALLOWED_ORIGINS vacío, se aceptan conexiones de cualquier página (sólo para desarrollo).');

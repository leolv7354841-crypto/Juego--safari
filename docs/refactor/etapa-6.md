# Etapa 6 — Red (grande, decidir antes)
Rama: `refactor/etapa-6-red`

Opción B (elegida): mantener ambos modos y unificar.
- [x] `net/remote.js` común (`game.remote`): `Interp` para zombis y jugadores (reemplaza los dos `applyZombies`), repetir efectos, `NetStats`; el dibujo (`drawPeers`, `drawRemoteBullets`) en `render/remote.js`.
- [x] Mismo formato de snapshot para host coop y `ServerSim`: `net/snapshot.js` (`encodeWorld`, `encodeStatic`), tipo `WorldSnap`/`CoopSnap` en `core/types.d.ts` y mensajes en el encabezado de `net/protocol.js`.
- [x] `game.mode` (`Solo`, `CoopHost`, `CoopGuest`, `OnlineClient`, y `ServerMode` para el servidor) en `net/mode.js`; reemplaza las ramas de `coop.isHost`/`coop.isGuest`/`coopRun`/`remoteSim` (37 líneas antes, 0 después) y casi todas las de `coop.active`/`online.active`.
- [x] Pruebas: `test/mode.test.js`, `test/remote.test.js`, `test/llamadas.test.js` (ninguna llamada a algo que ya no existe, ni a los campos viejos), una del servidor, y `e2e/cooperativo.spec.js` (dos páginas, WebRTC real).
- [x] `/security-review` de `server/` (abajo).
Opción A (futuro): quitar P2P; exige antes la fase 2 online (tienda, construcción, granadas, robot, niveles).

## Decisiones
- La foto del mundo se codifica en un solo sitio. `pl` pasó de 16 a 19 números por jugador (cargador y recarga, que el cooperativo ya mostraba); `rb` tiene el mismo formato en los dos modos (el anfitrión es el jugador 0 y el invitado el 1). El cooperativo ahora también manda `zh` (barras de vida) y filtra por cercanía las granadas, el fuego y las explosiones, como el servidor.
- El invitado ya no usa predicción de velocidad (`track`/`place`): interpola con `Interp` y adelanta hasta 250 ms (`EXTRAPOLATE`; en línea, `NET.maxExtrapolate` = 100). El anfitrión sí conserva `track`/`place` para el compañero que simula (es entrada de gameplay, no dibujo).
- El invitado sigue sin chocar con las barricadas del anfitrión (`collide: false`), como antes.
- Efectos visuales que cambian por unificar (sin tocar jugabilidad): los cohetes ajenos dejan estela también en línea; los golpes a barricadas y el fuego animan también al invitado; los compañeros muestran la recarga también en línea.
- Bug que se corrige de paso: el dibujo de balas ajenas llamaba a `Bullets.prototype.draw`, que desapareció en la Etapa 4; con balas ajenas en pantalla la escena fallaba.
- `coopRun` desaparece: tras salir de un grupo la partida queda en `Solo` con `detached` (no se guarda); `resetRun()` vuelve a `Solo` normal.

## Cooperativo P2P en pruebas automáticas
Sí es viable en local: Firebase solo hace de señalización, así que `e2e/cooperativo.spec.js` lo sustituye por un doble en memoria (`context.route` sobre `*.firebaseio.com`, que además evita tocar la base real) y las dos páginas abren una conexión WebRTC de verdad. Requiere Chromium con `--disable-features=WebRtcHideLocalIpsWithMdns` y no se ejecuta en WebKit (WebRTC entre páginas sin ventana no es fiable). No cubre redes reales (NAT, STUN, móviles).

## Revisión de seguridad de `server/`
Lo que cambió en el servidor (codificador de la foto, `ServerMode`) solo afecta a datos de salida; la validación de entrada no cambió y se revisó entera.
- Bien: `onAuth` valida origen y nombre antes de crear sala; `cleanCmd`/`cleanAct`/`cleanView`/`cleanClass`/`cleanLookCode` validan tipo, rango y longitud; cubetas de tasa por tipo de mensaje y expulsión por faltas sostenidas; compras con `Object.hasOwn`, precios y cantidades fijas, solo entre oleadas y con el dinero del servidor; granadas, misiles y habilidades acotan el blanco por distancia; posiciones y daño nunca vienen del cliente; el código de sala sale de `crypto`.
- Bajo: `vw`/`vh` (`cleanView`) llegan hasta 1600 y agrandan la zona donde no aparecen zombis junto al jugador; un cliente tramposo gana algo de distancia. Sugerencia: acotar a lo que cabe en una pantalla real o ignorar `vw/vh` para la exclusión.
- Bajo/medio: no hay tope por IP para crear salas; un cliente puede ocupar los 5 cupos (`servidor-lleno`) hasta que caduquen. Sugerencia: contar por `context.ip` en `onAuth` o limitar en Caddy.
- Bajo: el origen solo protege contra páginas de navegador ajenas (un cliente que no es navegador lo falsea); con `ALLOWED_ORIGINS` vacío cualquiera entra (solo desarrollo; revisar `.env` de producción). Sin límite de intentos de `joinById` (6 caracteres de 32 símbolos, ~1e9).
- Informativo: cada foto con diagnóstico (`dg`) revela a los clientes el número de salas y jugadores del servidor.

## Sin verificar
Cooperativo en dispositivos reales (Safari iPhone, redes móviles, retraso real de WebRTC): la interpolación del invitado y su límite de 250 ms se ajustaron a ojo. En línea sobre red real y la carga del servidor con la foto de 19 números tampoco se midieron (+9 números por foto y cliente con 4 jugadores).

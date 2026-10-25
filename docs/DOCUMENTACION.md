# Dead Zone: documentación técnica y operativa

Documento de referencia para desarrollar, desplegar y operar Dead Zone. Complementa al
[README](../README.md), que explica el juego y las instrucciones paso a paso, y a
[CLAUDE.md](../CLAUDE.md), que resume la arquitectura para asistentes de código.

Fecha de referencia: octubre de 2026.

---

## 1. Resumen

Dead Zone es un juego de supervivencia zombi en vista cenital que corre en el navegador
(Chrome y Safari, computadora y celular). Tiene cuatro modos de juego:

| Modo | Dónde se simula | Conexión | Jugadores |
|---|---|---|---|
| Un jugador | En el navegador | Ninguna (sólo Firebase para la clasificación mundial) | 1 |
| Cooperativo directo | En el navegador del anfitrión | WebRTC P2P, con Firebase para la señalización y respaldo | 2 |
| En línea | En el servidor (autoritativo) | WebSocket a Colyseus (máquina virtual recomendada; Render como opción gratis) | 4 por sala, 5 salas a la vez |
| Clasificación | Firebase Realtime Database (REST) | HTTPS | — |

Piezas del sistema:

1. **Juego web estático**: HTML, CSS y módulos ES en `js/`. Sin bundler, sin framework y sin
   dependencias npm en el cliente. Todo el arte y el sonido se generan por código.
2. **Servidor en línea**: Node 24 + TypeScript (sin compilar) + Colyseus 0.18 en `server/`.
   Reutiliza los módulos de `js/` para simular la partida.
3. **Firebase Realtime Database**: clasificación mundial y señalización del cooperativo directo.
   No se usa Firebase Auth ni Firestore.

---

## 2. Dónde está hosteado cada cosa

| Componente | Proveedor | Configuración en el repo | Notas |
|---|---|---|---|
| Juego (HTML, CSS, JS) | **Vercel** (proyecto estático, sin build) | [`vercel.json`](../vercel.json) | Reescribe `/deadzone/` a `index.html` y `/deadzone/:path+` a la raíz. Los `.js` y `.css` se sirven con `Cache-Control: no-cache`. |
| Juego (alternativa) | raw.githack.com | Mencionado en `index.html` y en `ALLOWED_ORIGINS` | CDN que sirve el repo de GitHub. Puede entregar archivos viejos; por eso existe el sellado de versión (sección 7). |
| Servidor en línea | **Render**, plan gratis, servicio web `dead-zone-server` | [`render.yaml`](../render.yaml) | URL pública: `wss://dead-zone-server.onrender.com`, fijada en `NET.server` de [`js/core/config.js`](../js/core/config.js). |
| Servidor en línea (recomendado) | **Vultr**, High Performance AMD 2 vCPU / 2 GB, Ciudad de México (18 USD/mes) | [`deploy/`](../deploy/README.md) | Docker + Caddy (HTTPS). Al migrar, `NET.server` pasa a `wss://servidor.yeyo.games`. |
| Clasificación y señalización | **Firebase Realtime Database** (proyecto `dead-zone-73dcc`) | `ONLINE.url` en [`js/core/config.js`](../js/core/config.js) | Reglas en la sección "Clasificación mundial" del README. |
| Código fuente | **GitHub** (`leolv7354841-crypto/Juego--safari`) | `origin` del repo local | Vercel y Render se despliegan desde este repositorio. |

Dominios que aceptan conexiones al servidor, según `ALLOWED_ORIGINS` en `render.yaml`:

- `https://yeyo.games` y `https://*.yeyo.games`
- `https://deadzone*.vercel.app`
- `https://raw.githack.com`

Si cambias el dominio del juego, actualiza `ALLOWED_ORIGINS` en Render; si no, el servidor
rechaza las conexiones desde esa página con el error `origen`.

### Limitaciones del plan gratis de Render

Según el README (revisado en octubre de 2026):

- 512 MB de RAM y **0,1 CPU**.
- Se duerme tras **15 minutos** sin tráfico. Despertar tarda **cerca de un minuto**.
- Render puede reiniciar el servicio en cualquier momento.
- **Al reiniciarse o dormirse se pierden todas las partidas en curso**: el estado vive en memoria.
- Una sola instancia. No hay base de datos ni estado compartido entre instancias.

Con 0,1 CPU, una sala de 10 jugadores a 60 pasos por segundo puede no dar abasto. `render.yaml`
baja las fotos a 10 por segundo (`SNAP_HZ=10`). Para diez jugadores fluidos hace falta un plan
de pago o una máquina virtual (ver sección 9).

---

## 3. Mapa del repositorio

```
index.html            Interfaz, HUD, controles táctiles y pantallas. Contiene el cargador sellado.
css/style.css         Estilos y diseño adaptable.
js/                   Código del cliente (módulos ES, sin compilar).

server/               Servidor en línea (Node + TypeScript + Colyseus 0.18).
server/src/           Código del servidor.
server/test/          Pruebas con node:test (salas, simulación, netcode).
server/tools/load.ts  Prueba de carga (5 salas de 4 bots por defecto).
deploy/               Servidor en máquina virtual: Dockerfile, docker-compose (con Caddy), scripts y guía.
vite.config.js       Configuración de Vite (build a dist/, puerto 8080).
public/               Archivos estáticos tal cual: manifiesto e íconos de la PWA (icons/).

vercel.json           Reescrituras y cabeceras del hosting del juego.
render.yaml           Blueprint de Render para el servidor.
.claude/launch.json   Configuraciones de arranque (dev en 8080, server en 2567).
```

### Módulos del cliente

| Módulo | Responsabilidad |
|---|---|
| `main.js` | Clase `Game`: máquina de estados (`menu`, `play`, `pause`, `levelup`, `shop`, `over`, `account`, `board`, `coop`), bucle, cámara, HUD y guardado. |
| `config.js` | Todo el equilibrio (armas, zombis, tienda, robot), `ONLINE` (Firebase) y `NET` (servidor, tasas, reconexión). |
| `world.js` | Ciudad procedural por trozos, colisiones, campo de flujo y obstáculos dinámicos. |
| `zombies.js` | Horda: tácticas, rejilla espacial y ataques. |
| `director.js` | Oleadas y aparición de zombis. |
| `player.js` | Movimiento (`move`, compartido con el servidor), armas y recarga (`act`, sólo cliente). |
| `bullets.js`, `combat.js` | Balas y reglas de impacto (`combat.js` también lo usa el servidor). |
| `build.js` | Estructuras, granadas, molotov y torretas. |
| `robot.js`, `upgrades.js`, `pickups.js`, `lighting.js`, `particles.js` | Robot, mejoras, objetos, luces y partículas. |
| `input.js`, `audio.js`, `music.js`, `sprites.js` | Entrada (teclado, ratón, táctil), sonido, música y arte generado. |
| `accounts.js` | Cuentas (nombre + PIN de 4 dígitos), guardado por cuenta, récords y clasificación mundial. |
| `net.js`, `coop.js` | Cooperativo directo: conexión WebRTC y simulación en el anfitrión. |
| `online.js` | Cliente del modo en línea: sala, entrada, interpolación y diagnóstico (F3). |
| `netcode.js` | `Predictor` (predicción y reconciliación) e `Interp` (interpolación). Compartido con el servidor. |
| `version.js` | Versión del build (la inyecta Vite) y aviso de versión nueva. |

### Módulos del servidor

| Archivo | Responsabilidad |
|---|---|
| `src/index.ts` | Punto de entrada: arranca el servidor y escribe el aviso de arranque. |
| `src/app.ts` | Crea el transporte WebSocket (`maxPayload` 16 KB, ping cada 5 s), registra la sala `dz` y la ruta `/health`. |
| `src/config.ts` | Lee las variables de entorno (ver sección 8) y valida orígenes (`originAllowed`). |
| `src/rooms/DeadZoneRoom.ts` | Sala: lobby, fases, mensajes, reconexión y bucle fijo de simulación. |
| `src/rooms/state.ts` | Esquema de estado de Colyseus (miembros, listos, dueño, fase, oleada). |
| `src/validate.ts` | Validación de tipo, rango y tamaño, y límites de frecuencia por jugador. |
| `src/sim/ServerSim.ts` | Simulación headless con los módulos reales del juego para N jugadores. |
| `src/stats.ts` | Métricas que se exponen en `/health` y en el diagnóstico (F3). |
| `tools/load.ts` | Carga: 5 salas de 4 clientes simulados (`--rooms`, `--url`, `--origin`). |

---

## 4. Flujos

### 4.1 Arranque del juego

1. El navegador pide `index.html` (Vercel o raw.githack).
2. El cargador sellado construye un *import map* que pide cada módulo como `./js/x.js?v=<hash>`.
3. `version.js` guarda el mismo hash. Si no coincide con el de la página, el juego se recarga
   pidiendo todo de nuevo con `&b=<tiempo>`. Así se evita un archivo viejo de un CDN.
4. Se muestra el menú, con la versión en pantalla.

### 4.2 Un jugador y guardado

1. Al entrar, el jugador escribe nombre y PIN. Si la cuenta no existe se crea; si existe, entra
   con su progreso.
2. Cada cuenta tiene su clave en `localStorage`:
   - `saveKey()`: partida en curso, guardada cada pocos segundos, al final de cada oleada y al
     cerrar o minimizar la página.
   - `checkKey()`: punto de control al final de cada oleada.
3. Al morir se borra la partida guardada, pero el récord (oleada y bajas) se conserva.
4. Dentro de un Artifact de Claude con base de datos, `accounts.js` también copia partidas y
   puntajes a la nube (`cloudSave`, `cloudPull`, `cloudClear`). Fuera de ahí esa ruta está inactiva.
5. La clasificación mundial escribe en `scores/<uid>` de Firebase por REST, sin librerías ni clave.

### 4.3 Cooperativo directo (2 jugadores, WebRTC)

1. El anfitrión toca **Crear sala**. Se genera un código de 4 letras y se escribe
   `rooms/<código>` en Firebase con su oferta SDP.
2. El invitado escribe el código, lee la oferta y responde con su SDP en el mismo nodo.
3. Ambos abren dos canales de datos WebRTC: `rel` (confiable y ordenado) y `fast` (sin
   retransmisión). Los servidores STUN vienen de `ICE`. **No hay TURN**.
4. Cuando los canales abren, se borra `rooms/<código>`. Si no abren antes de `OPEN_LIMIT`, la
   unión falla con el error `directa`.
5. Cuando el canal está listo, el anfitrión simula el mundo y manda fotos al invitado de 8 a 12
   veces por segundo. El invitado dibuja con predicción y devuelve sus entradas.
6. Las balas del invitado son cosméticas. El daño se calcula en el anfitrión (guarda en
   `hitZombie`). Este reparto debe preservarse al agregar mecánicas de combate.

### 4.4 En línea (4 por sala, 5 salas, servidor autoritativo)

Ciclo de vida de una sala:

```
waiting ──(dueño: start, todos listos)──> loading ──(todos: loaded, o LOAD_SECONDS)──> playing
   ^                                                                                    |
   └────────────────────────(dueño: lobby)──── finished <──(caen todos)─────────────────┘
```

Secuencia típica:

1. **Conexión.** `online.js` elige el servidor: `?servidor=` en la URL, luego `NET.server`, y en
   localhost `ws://<host>:2567`. Si no hay ninguno, error `sin-servidor`.
2. **Crear o unirse.** Crear sala genera una sala nueva; unirse usa `joinById(código)`. Si la sala está llena responde
   `locked`/`full`; si no existe, `not found`.
3. **Lobby.** Cada jugador manda `ready`. Sólo el dueño manda `start` (y `lobby` para volver).
4. **Carga.** Cada cliente manda `loaded` al terminar de cargar el mapa. Si no todos llegan en
   `LOAD_SECONDS`, empieza igual.
5. **Partida.** Por cada tick (60 Hz, `NET.tickHz`) el servidor avanza `ServerSim`:
   movimiento, disparos, zombis, daño, oleadas.
   - El cliente manda `in` con `[seq, mx, my, bits, angle, weapon]`. El servidor rechaza
     secuencias repetidas o muy adelantadas y aplica él mismo velocidad y cadencia.
   - El servidor manda fotos a `SNAP_HZ` por jugador. Cada foto incluye sólo lo cercano
     (`NET.view`, 1000 px de mitad de cuadro).
   - Los efectos (partículas, sonidos, decals) se envían a los clientes cercanos como eventos.
6. **Predicción.** El cliente predice su propio personaje con `Player.move` y, al llegar una foto
   confirmada, restaura y vuelve a aplicar sus entradas pendientes. Correcciones menores de
   150 px se suavizan; mayores se aplican de golpe.
7. **Interpolación.** Otros jugadores y zombis se dibujan 110 ms atrasados, interpolando entre
   fotos según el reloj del servidor.
8. **Ronda siguiente.** Cualquiera puede iniciar la siguiente oleada o empieza sola a los 45 s.
9. **Fin.** Cuando caen todos. El estado `finished` muestra resultados.

Mensajes del cliente al servidor: `ready`, `start`, `lobby`, `loaded`, `next`, `in`, `p` (ping).
Cualquier otro tipo se rechaza con `mensaje desconocido`.

### 4.5 Reconexión

- Al caer la conexión, el servidor marca al jugador como desconectado (`onDrop`). Su personaje
  queda quieto, los zombis lo ignoran y no recibe daño durante `RECONNECT_SECONDS` (20 s).
- El cliente reintenta hasta 8 veces, con espera de 300 ms a 4 s.
- Si vuelve, recupera el mismo `sessionId` y personaje (`onReconnect`).
- Tras recargar la página, `sessionStorage` guarda el token de reconexión durante 20 s.
- Si no vuelve a tiempo, sale de la sala (`onLeave`).
- Una sala sin nadie conectado se borra a los `EMPTY_ROOM_SECONDS` (30 s); si nunca entró nadie,
  al caducar la reserva (unos 15 s).
- Una sala sin partida (esperando o en resultados) se cierra a los `IDLE_ROOM_MINUTES` (20 min)
  con el código 4101, para liberar su cupo.
- Con `MAX_ROOMS` (5) salas abiertas, crear otra da el error `servidor-lleno`; entrar a una
  existente sigue funcionando hasta `MAX_PLAYERS` (4).
- Expulsión por datos no válidos: código 4100 (el 4003 es de Colyseus: «no se pudo reconectar»).
- Al cerrarse el proceso (`SIGTERM`), el servidor avisa con el mensaje `shutdown` antes de salir.

### 4.6 Seguridad del servidor

- La identidad sale de la sesión de Colyseus, nunca de un identificador que mande el cliente.
- Cada mensaje se valida en tipo, rango y tamaño. Más de 16 KB corta la conexión.
- Hay límites de frecuencia por jugador (`limits` con `ping.take()` y similares).
- La posición, la velocidad, la cadencia y la munición las calcula el servidor.
- `ALLOWED_ORIGINS` restringe las páginas que pueden conectarse. Con la variable vacía,
  cualquier página puede (sólo para desarrollo, y el servidor lo advierte al arrancar).
- Los tokens de reconexión no se registran en logs.

---

## 5. Configuración del cliente

Todo el ajuste está en [`js/core/config.js`](../js/core/config.js):

| Objeto | Campo | Valor actual | Qué controla |
|---|---|---|---|
| `ONLINE` | `url` | `https://dead-zone-73dcc-default-rtdb.firebaseio.com` | Base de Firebase para clasificación y salas del cooperativo. |
| `NET` | `server` | `wss://dead-zone-server.onrender.com` | Servidor en línea. Vacío = `ws://<host>:2567`. |
| `NET` | `tickHz` | `60` | Pasos de simulación por segundo. **Debe ser igual en servidor y cliente.** |
| `NET` | `snapHz` | `20` | Fotos por segundo (el servidor lo puede sobreescribir con `SNAP_HZ`). |
| `NET` | `maxPlayers` | `4` | Cupo de sala que muestra el cliente (el servidor manda con `MAX_PLAYERS`). |
| `NET` | `reconnectSeconds` | `20` | Ventana de reconexión. |
| `NET` | `view` | `1000` | Radio de lo que se manda a cada jugador. |
| `ICE` | — | STUN | Servidores para WebRTC del cooperativo directo. |

Para cambiar el servidor: edita `NET.server` y publica el juego.
Para probar sin publicar: abre el juego con `?servidor=wss://…`.

---

## 6. Variables de entorno del servidor

Están documentadas en [`server/.env.example`](../server/.env.example). Se configuran en Render
(o en el entorno de la VM).

| Variable | Valor en `render.yaml` | Por defecto | Función |
|---|---|---|---|
| `NODE_VERSION` | `24` | — | Versión de Node en Render. Mínimo 22.18. |
| `ALLOWED_ORIGINS` | `https://yeyo.games,https://*.yeyo.games,https://deadzone*.vercel.app,https://raw.githack.com` | vacío (acepta todo) | Orígenes permitidos, separados por comas, sin barra final. `*` vale por un trozo sin puntos ni barras. |
| `SNAP_HZ` | `10` | `20` | Fotos por segundo por jugador. |
| `PORT` | (lo pone Render) | `2567` | Puerto. |
| `HOST` | — | `0.0.0.0` | Dirección de escucha. Debe ser `0.0.0.0` para aceptar conexiones externas. |
| `MAX_PLAYERS` | `4` | `4` | Jugadores por sala. Máximo 10. |
| `MAX_ROOMS` | `5` | `5` | Salas a la vez. Con todas ocupadas, crear otra da `servidor-lleno`. |
| `IDLE_ROOM_MINUTES` | — | `20` | Una sala sin partida se cierra pasado este tiempo. |
| `MAX_CATCHUP` | — | `8` | Pasos atrasados que se recuperan de una vez tras una pausa. |
| `RECONNECT_SECONDS` | — | `20` | Ventana de reconexión. |
| `EMPTY_ROOM_SECONDS` | — | `30` | Tiempo antes de borrar una sala vacía. |
| `LOAD_SECONDS` | — | `12` | Tiempo máximo de carga antes de empezar igual. |
| `COLYSEUS_LATENCY` | — | sin simular | Sólo pruebas: simula ida y vuelta en ms. |

No hay secretos. El servidor no usa claves ni base de datos.

---

## 7. Versiones y caché

- `npm run build` (Vite) genera `dist/` con archivos con hash en `assets/`; ya no hay sellado manual.
- `vercel.json` manda `no-cache` para `index.html` y `version.json`, e `immutable` para `/assets/*`.
- `js/core/version.js` compara su versión con `version.json` y avisa si hay una nueva.

---

## 8. Desarrollo local

Requisitos: Node 22.18 o más nuevo (Node 24 es el de producción), npm.

```bash
npm run dev                 # juego en http://localhost:8080 (sin caché)
npm run server:install      # una vez: dependencias del servidor
npm run server              # servidor en ws://localhost:2567
```

Para probar en el celular, usa `http://IP-DE-TU-PC:8080`. El juego detecta el servidor en el
puerto 2567 de ese mismo equipo.

Comandos de verificación:

```bash
npm run server:test         # pruebas de salas, simulación y netcode
npm run build --prefix server   # sólo comprobación de tipos (tsc --noEmit)
npm run server:load         # carga con 5 salas de 4 clientes (requiere el servidor en marcha)
```

El cliente no tiene pruebas automáticas ni lint. Verifica los cambios en el navegador.

### Reglas de código del servidor

- Node ejecuta `.ts` directamente. Sólo se permite TypeScript borrable: sin `enum`, sin
  decoradores y sin propiedades de parámetro.
- El servidor importa módulos de `js/`, así que el despliegue se hace desde la raíz del
  repositorio (ver `render.yaml`).
- `Player.update` se divide en `move` (lo comparten servidor y cliente: sólo entradas,
  determinista) y `act` (apuntado y armas). No mezclar.

---

## 9. Despliegue

### 9.1 Juego en Vercel

1. En [vercel.com](https://vercel.com): **Add New → Project** e importa el repositorio.
2. Framework Preset: **Other**. Build Command y Output Directory vacíos.
3. Cada `git push` a la rama de producción vuelve a publicar.

### 9.2 Servidor en Render

Opción recomendada, con el blueprint:

1. Sube el repositorio a GitHub.
2. En Render: **New → Blueprint** y elige el repositorio. Usa `render.yaml`.
3. Comandos del blueprint:
   - Build: `npm ci --prefix server && npm run build --prefix server`
   - Start: `npm start --prefix server`
   - Health check: `/health`
   - `autoDeploy: true`: cada push despliega.
4. Verifica `https://dead-zone-server.onrender.com/health`. Debe responder `{ "ok": true, ... }`.
5. Si la URL es distinta, actualiza `NET.server` en `js/core/config.js`.

### 9.3 Máquina virtual Linux (recomendada)

La guía paso a paso (qué comprar, DNS, instalación con `deploy/instalar.sh`, actualización y
prueba de carga) está en [`deploy/README.md`](../deploy/README.md). A mano, sin Docker
(requiere Node 22.18 o más nuevo):

```bash
git clone https://github.com/TU-USUARIO/Juego--safari.git && cd Juego--safari
npm ci --prefix server
ALLOWED_ORIGINS=https://tu-juego.vercel.app npm start --prefix server
```

Para operarlo en producción:

- Ejecútalo con systemd para que se reinicie solo.
- Pon un proxy con HTTPS delante para `wss://`. Caddy sirve: `tu-dominio.com { reverse_proxy localhost:2567 }`.
- Detén el servicio con `SIGTERM` (`systemctl stop`) para que el servidor avise a los jugadores.

### 9.4 Firebase

1. Crea un proyecto en la consola de Firebase (sin Analytics).
2. Crea una Realtime Database.
3. Publica las reglas de la sección "Clasificación mundial" del README.
4. Copia la URL en `ONLINE.url` de `js/core/config.js`.

Si cambias la forma de `scores` o `rooms`, actualiza las reglas en el README
(ver también [CLAUDE.md](../CLAUDE.md)).

---

## 10. Observabilidad

- **`/health`** en el servidor: salas, jugadores, pasos por segundo, duración de pasos (medio y
  peor), pasos descartados, CPU, memoria, tiempo encendido.
- **Diagnóstico en el juego (F3 o el indicador de conexión)**: RTT de aplicación, pasos por
  segundo del servidor, CPU, salas, KB/s del WebSocket y correcciones de posición.
- **Logs del servidor**: el arranque muestra la URL y avisa si `ALLOWED_ORIGINS` está vacío.
  Los errores del cliente llegan como mensajes en pantalla (`online.js`, función de mensajes de error).

---

## 11. Resultados de carga (localhost, no es red real)

| Prueba | Fotos/s por cliente | Pasos/s del servidor | Paso medio · peor | CPU |
|---|---|---|---|---|
| 1 sala de 10, 20 fotos/s | 20,0 | 60,0 | 1,5 ms · 16 ms | 26 % de un núcleo |
| 1 sala de 10, 10 fotos/s | 10,0 | 60,0 | 0,8 ms · 10 ms | 15 % de un núcleo |
| 5 salas de 2 | 15,5 | 60 por sala | 0,9 ms · 22 ms | 34 % de un núcleo |
| 5 salas de 4, 20 fotos/s (capacidad actual) | 17,0 | 60,6 por sala, 0 descartados | 0,44 ms · 4,8 ms | 18 % de un núcleo (pico 51 %), 150 MB |

Lo que no está medido: un servidor remoto real, redes móviles y celulares. Sin esas medidas, no
se garantiza un RTT menor a 50 ms.

---

## 12. Limitaciones conocidas

**Juego**
- La clasificación y el cooperativo dependen de Firebase con reglas abiertas. Cualquiera puede
  escribir. Es para jugar entre amigos, no a prueba de trampas.
- El cooperativo directo no conecta en algunas redes móviles, porque no hay TURN.

**En línea (fase 1)**
- No hay compensación de latencia para disparos.
- Los empujones de los zombis no se predicen en el cliente.

**Servidor**
- Una sola instancia y todo en memoria. Reiniciar termina las partidas.
- Plan gratis: se duerme y tarda cerca de un minuto en despertar. El primer jugador espera.
- Las fotos van en JSON/msgpack. Podrían comprimirse con un formato binario o con diferencias.

---

## 13. Mantenimiento: lista para cambios comunes

| Si cambias... | Haz también... |
|---|---|
| Cualquier archivo de `js/` o `css/` | Nada especial: Vite lo recompila. |
| Equilibrio (armas, zombis, precios) | Cambia sólo `js/core/config.js`. |
| `NET.tickHz` | Cámbialo en `config.js`; el servidor lo toma de ahí. Ambos lados deben coincidir. |
| Lógica compartida (`player.js` `move`, `combat.js`, `netcode.js`) | Corre `npm run server:test`. |
| El dominio del juego | Agrega el nuevo origen a `ALLOWED_ORIGINS` (en `deploy/.env` de la máquina, o en Render). |
| La URL del servidor | Actualiza `NET.server`. |
| Forma de `scores` o `rooms` | Actualiza las reglas de Firebase en el README. |
| Variables del servidor | Actualiza `server/.env.example` y la sección 6 de este documento. |
| Versión de Node | Actualiza `NODE_VERSION` en `render.yaml` y `engines` en `server/package.json`. |

---

## 14. Glosario

- **Autoritativo**: el servidor decide el resultado. El cliente sólo propone intenciones.
- **Predicción**: el cliente mueve su personaje antes de recibir confirmación del servidor.
- **Reconciliación**: al llegar la foto confirmada, el cliente vuelve a aplicar sus entradas pendientes.
- **Interpolación**: dibujar otros objetos entre dos fotos recientes, con retraso.
- **Foto (snapshot)**: estado del mundo que envía el servidor.
- **Tick / paso**: una iteración de la simulación (60 por segundo).
- **P2P / WebRTC**: conexión directa entre navegadores, sin pasar por un servidor.
- **STUN / TURN**: STUN ayuda a descubrir la dirección pública; TURN retransmite el tráfico. Este proyecto usa sólo STUN.
- **Señalización**: intercambio inicial de direcciones para abrir WebRTC. Aquí va por Firebase.
- **Hash de versión**: Vite nombra los archivos con un hash, así que el caché nunca sirve código viejo.

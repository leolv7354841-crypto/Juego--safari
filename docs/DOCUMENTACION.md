# Dead Zone: documentación técnica y operativa

Documento de referencia para desarrollar, desplegar y operar Dead Zone. Complementa al
[README](../README.md), que explica el juego y las instrucciones paso a paso, y a
[CLAUDE.md](../CLAUDE.md), que resume la arquitectura para asistentes de código.

Fecha de referencia: octubre de 2026 (tras la refactorización por etapas de
[`docs/refactor/`](refactor/README.md)).

---

## 1. Resumen

Dead Zone es un juego de supervivencia zombi en vista cenital que corre en el navegador
(Chrome y Safari, computadora y celular). Tiene tres piezas de juego:

| Modo | Dónde se simula | Conexión | Jugadores |
|---|---|---|---|
| Un jugador | En el navegador | Ninguna (sólo Firebase para la clasificación mundial) | 1 |
| En línea | En el servidor (autoritativo) | WebSocket a Colyseus en `wss://servidor.yeyo.games` (máquina virtual de Vultr) | de 2 a 4 por sala, 8 salas a la vez |
| Clasificación | Firebase Realtime Database (REST) | HTTPS | — |

Piezas del sistema:

1. **Juego web**: HTML, CSS y módulos ES en `js/`, empaquetados con Vite (`npm run build` →
   `dist/`). Sin framework. La única dependencia que viaja al navegador es `@colyseus/sdk`,
   que se carga aparte sólo al entrar al modo en línea. Todo el arte y el sonido se generan por
   código.
2. **Servidor en línea**: Node 24 + TypeScript (sin compilar, sintaxis borrable) + Colyseus 0.18
   en `server/`. Reutiliza los módulos de `js/core`, `js/sim` y parte de `js/net` para simular la
   partida.
3. **Firebase Realtime Database**: clasificación mundial (ya no hace falta para jugar con amigos).
   No se usa Firebase Auth ni Firestore.

---

## 2. Dónde está hosteado cada cosa

| Componente | Proveedor | Configuración en el repo | Notas |
|---|---|---|---|
| Juego (HTML, CSS, JS) | **Vercel**, proyecto `deadzone` (`deadzone-five-red.vercel.app`) | [`vercel.json`](../vercel.json) | Un push a `main` ejecuta `npm run build` y publica `dist/`. `index.html` y `version.json` van con `no-cache`; `/assets/*` (archivos con hash) con `immutable`. Reescribe `/deadzone/` a `index.html` y `/deadzone/:path+` a la raíz. |
| Hub `yeyo.games/deadzone/` | **Vercel**, proyecto `yeyo-games` (Astro, publicado con la CLI; no está en este repo) | — | Su `vercel.json` pasa `/deadzone/` al proyecto `deadzone`, así que siempre muestra la última versión publicada. |
| Servidor en línea | **Vultr**, High Performance AMD 2 vCPU / 2 GB, Ciudad de México (18 USD/mes), DNS en Hostinger | [`deploy/`](../deploy/README.md) | Docker + Caddy (HTTPS). `NET.server` apunta a `wss://servidor.yeyo.games`. Se actualiza solo con [`servidor.yml`](../.github/workflows/servidor.yml) al hacer push a `main`. |
| Clasificación y señalización | **Firebase Realtime Database** (proyecto `dead-zone-73dcc`) | `ONLINE.url` en [`js/core/config.ts`](../js/core/config.ts) | Reglas en la sección "Clasificación mundial" del README. |
| Código fuente | **GitHub** (`origin`: `leolv7354841-crypto/Juego--safari`; `fork`: `GrowPals/Juego--safari`) | — | Vercel y GitHub Actions trabajan sobre `origin`. |

Orígenes que aceptan conexiones al servidor (`ALLOWED_ORIGINS` en `deploy/.env` de la máquina):
`https://yeyo.games`, `https://*.yeyo.games` y `https://deadzone*.vercel.app`. Si cambias el
dominio del juego, agrega el nuevo origen ahí; si no, el servidor rechaza la conexión con el error
`origen`.

**Histórico.** Antes el servidor corría en el plan gratis de Render (`render.yaml` sigue en el repo
como opción de respaldo) y el juego también se servía desde raw.githack.com con un cargador que
sellaba la versión a mano. Ambas cosas quedaron atrás: Render no da abasto para 5 salas de 4 (0,1
CPU y se duerme) y Vite resolvió el caché con nombres de archivo con hash.

---

## 3. Mapa del repositorio

```
index.html            Interfaz: HUD, controles táctiles y pantallas (<script type="module" src="js/main.js">).
css/style.css         Estilos y diseño adaptable.
js/                   Código del cliente (ver tabla siguiente). Los módulos de core/, sim/ y
                      net/{protocol,netcode,mode,snapshot} también los ejecuta el servidor.
public/               Archivos estáticos tal cual: manifiesto e íconos de la PWA (icons/).
test/                 Pruebas del núcleo con node:test (combate, mundo, director, netcode, modos, reglas de carga).
e2e/                  Pruebas de navegador con Playwright (Chromium y WebKit): solo, tienda, guardado, táctil y en línea (2 jugadores, también por enlace de invitación).

server/               Servidor en línea (Node + TypeScript + Colyseus 0.18); su propio package.json.
server/src/           Código del servidor.
server/test/          Pruebas con node:test (salas, simulación, netcode).
server/tools/load.ts  Prueba de carga (5 salas de 4 bots por defecto).
deploy/               Servidor en máquina virtual: Dockerfile, docker-compose (con Caddy), scripts y guía.
docs/refactor/        Plan de refactorización por etapas, pruebas manuales y mediciones base.

vite.config.js        Vite: base relativa, build a dist/, dev en 8080, preview en 4173, version.json.
vercel.json           Build, reescrituras y cabeceras del hosting del juego.
biome.json            Formato y reglas (Biome). tsconfig.json: checkJs sobre js/ (`.ts` incluidos); tsconfig.strict.json: `noImplicitAny` y `strictNullChecks` sobre core/, sim/ y net/.
playwright.config.js  Pruebas e2e contra `vite preview` (4173) y el servidor local (2599).
.github/workflows/    ci.yml (comprobación) y servidor.yml (publicación del servidor).
.claude/launch.json   Configuraciones de arranque (dev en 8080, server en 2567, dist en 4173).
render.yaml           Blueprint de Render (histórico, respaldo).
```

### Módulos del cliente (`js/`)

| Carpeta / módulo | Responsabilidad |
|---|---|
| `main.js` | Clase `Game`: construye los módulos, guarda el estado de la partida (dinero, bajas, inventario…), corre el bucle y expone los métodos `game.xxx(...)` que usan sim, net y las pruebas. Sólo coordina. |
| `states.js` | Máquina de estados como tabla (`menu`, `play`, `pause`, `levelup`, `shop`, `over`, `account`, `board`, `look`, `online`, `class`): pantalla, música, `enter`, `exit`, `update`. |
| `events.js`, `actions.js`, `save.js` | Eventos de combate del jugador local; acciones de tecla/botón (habilidad, robot, construir, lanzar); guardado y carga del progreso. |
| `core/config.js` | Todo el equilibrio (armas, zombis, tienda, robot, cohetes, dorado, racha), `ONLINE` (Firebase) y `NET` (servidor, tasas, reconexión). |
| `core/util.js`, `core/version.js`, `core/types.d.ts` | Utilidades (azar, geometría, almacenamiento), versión del build y tipos compartidos (`GameHost`, `Cmd`…). |
| `sim/world.js` | Ciudad procedural por trozos (sólo datos), colisiones, campo de flujo y obstáculos dinámicos. |
| `sim/zombies.js`, `sim/director.js` | Horda (tácticas, rejilla espacial, ataques) y oleadas. |
| `sim/player.js` | Movimiento (`move`, compartido con el servidor y determinista) y armas (`act`, sólo cliente). |
| `sim/bullets.js`, `sim/combat.js`, `sim/rules.js`, `sim/combo.js` | Balas, reglas de impacto, reglas de combate compartidas con el servidor (bajas, botín, dorado, ácido, cohetes) y racha de bajas. |
| `sim/build.js`, `sim/robot.js`, `sim/pickups.js`, `sim/upgrades.js`, `sim/abilities.js` | Estructuras, granadas, molotov, torretas; robot pilotable; objetos; mejoras de nivel; clases y habilidades. |
| `render/scene.js`, `render/camera.js` | El fotograma completo (y el tamaño del lienzo y la calidad adaptable); cámara con sacudida. |
| `render/sprites.js`, `render/world.js`, `render/particles.js`, `render/lighting.js` | Arte generado por código; suelo por trozos; partículas y restos; oscuridad, linterna y farolas. |
| `render/<x>.js` (zombies, bullets, pickups, build, robot, remote) | Dibujo de lo que simula `sim/<x>.js` (y de los jugadores remotos). |
| `net/mode.js` | `game.mode`: `Solo` (con `detached`), `OnlineClient`, `ServerMode`. Se pregunta por intención (`authority()`, `canBuild()`, `savesProgress()`…), no por identidad. |
| `net/protocol.js`, `net/netcode.js`, `net/snapshot.js`, `net/remote.js` | Tablas y bits del protocolo; `applyMove`, `BODY` e `Interp`; el codificador único de la parte del mundo de una foto; su decodificador para el cliente en línea. |
| `net/online.js` | Cliente del modo en línea: sala, entrada a 60 Hz, predicción, interpolación y diagnóstico (F3). Carga `@colyseus/sdk` con `import()`. |
| `ui/input.js`, `ui/audio.js`, `ui/music.js`, `ui/accounts.js` | Entrada (teclado, ratón, táctil), efectos sintetizados, música dinámica, cuentas (nombre + PIN) y clasificación. |
| `ui/<pantalla>.js` (hud, shop, class, look, levelup, over, menu, account, board, lobby, icons, dom) | Una pieza por pantalla; cada una conecta sus botones con `bindXxx(game)`. |

### Módulos del servidor

| Archivo | Responsabilidad |
|---|---|
| `src/index.ts` | Punto de entrada: arranca el servidor y escribe el aviso de arranque. |
| `src/app.ts` | Crea el transporte WebSocket (`maxPayload` 16 KB, ping cada 5 s), registra la sala `dz` y la ruta `/health`. |
| `src/config.ts` | Lee las variables de entorno (sección 6) y valida orígenes (`originAllowed`). |
| `src/rooms/DeadZoneRoom.ts` | Sala: lobby, fases, mensajes, reconexión y bucle fijo de simulación con recuperación acotada. |
| `src/rooms/state.ts` | Esquema de estado de Colyseus (miembros, listos, dueño, fase, oleada). |
| `src/validate.ts` | Validación de tipo, rango y tamaño, y límites de frecuencia por jugador. |
| `src/sim/ServerSim.ts` | Simulación sin pantalla con los módulos reales del juego para N jugadores: un `Slot` por jugador (dinero, nivel, mejoras, inventario, robot). |
| `src/stats.ts` | Métricas que se exponen en `/health` y en el diagnóstico (F3). |
| `tools/load.ts` | Carga: 5 salas de 4 clientes simulados (`--rooms`, `--url`, `--origin`). |

---

## 4. Flujos

### 4.1 Arranque del juego

1. El navegador pide `index.html` (sin caché) y éste carga `assets/index-<hash>.js` y
   `assets/index-<hash>.css` (en caché para siempre: si cambian, cambia el hash).
2. `main.js` crea `Game`, que conecta los módulos, redimensiona el lienzo y genera el mundo del menú.
3. `core/version.js` compara la versión inyectada por Vite con `version.json`; si hay una más
   nueva, muestra un aviso para recargar. La versión aparece en el menú.
4. Al entrar al modo en línea, `online.js` carga el SDK de Colyseus (`assets/build-<hash>.js`).

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

### 4.3 Jugar con amigos: sala en línea de 2 a 4

El cooperativo directo (WebRTC con Firebase de señalización) se eliminó. Jugar con un amigo es
usar el modo En línea:

1. El anfitrión toca **En línea · 2 a 4** → **Crear sala**. La sala muestra el código de 6
   caracteres y el enlace de invitación (`?sala=CÓDIGO`, que conserva `?servidor=` si lo hay).
2. El amigo abre el enlace (la pantalla En línea aparece con el código escrito) o escribe el
   código, pone su nombre y toca **Unirse**.
3. Cada quien toca **Estoy listo**. **Iniciar partida** (sólo el propietario) exige entre
   `MIN_PLAYERS` (2) y `MAX_PLAYERS` (4) jugadores conectados y listos; con una sola persona el
   botón queda desactivado y dice «Hace falta otra persona».
4. Al salir de la sala el jugador vuelve a `Solo` con `detached`: esa partida no se guarda y no
   toca su progreso (`savesProgress()`), que es sólo del modo Un jugador.
5. Las balas del cliente son cosméticas: `game.mode.authority()` es falso y el daño lo calcula el
   servidor. Este reparto debe preservarse al agregar mecánicas de combate.

### 4.4 En línea (de 2 a 4 por sala, 8 salas, servidor autoritativo)

Ciclo de vida de una sala:

```
waiting ──(dueño: start, todos listos)──> loading ──(todos: loaded, o LOAD_SECONDS)──> playing
   ^                                                                                    |
   └────────────────────────(dueño: lobby)──── finished <──(caen todos)─────────────────┘
```

Secuencia típica:

1. **Conexión.** `online.js` elige el servidor: `?servidor=` en la URL, luego `NET.server`, y en
   localhost `ws://<host>:2567`. Si no hay ninguno, error `sin-servidor`.
2. **Crear o unirse.** Crear sala genera una sala nueva (con `MAX_ROOMS` salas abiertas responde
   `servidor-lleno`); unirse usa `joinById(código)`. Si la sala está llena responde
   `locked`/`full`; si no existe, `not found`. El origen y el nombre se comprueban en `onAuth`,
   antes de crear la sala.
3. **Lobby.** Cada jugador manda `ready` y su clase (`cls`). Sólo el dueño manda `start` (y `lobby`
   para volver); `start` falla si hay menos de `MIN_PLAYERS` conectados o falta alguno por estar listo.
4. **Carga.** Cada cliente manda `loaded` al terminar de cargar el mapa. Si no todos llegan en
   `LOAD_SECONDS`, empieza igual.
5. **Partida.** Por cada tick (60 Hz, `NET.tickHz`) el servidor avanza `ServerSim`:
   movimiento, disparos, zombis, daño, oleadas, estructuras, lanzables y robots.
   - El cliente manda sus entradas por el canal de Colyseus (`room.input()`; esquema `MoveInput`:
     `mx my f a w`). El servidor acota los valores (`sanitize`), las consume de una en una y aplica
     él mismo velocidad y cadencia; el ack es el contador de entradas consumidas.
   - Las compras (`buy`), las mejoras de nivel (`pick`) y las acciones (`act`: construir, lanzar,
     robot, marcadas con el `seq` de la última entrada) también las ejecuta el servidor; la tienda
     sólo entre oleadas.
   - El servidor manda fotos a `SNAP_HZ` por jugador con sólo lo cercano (`NET.view`, 1000 px de
     mitad de cuadro): la parte común del mundo (`net/snapshot.js`) más los campos propios del modo
     en línea (dinero, estadísticas, inventario, mejoras pendientes, efectos…).
   - Los efectos (partículas, sonidos, restos) se envían a los clientes cercanos como eventos.
6. **Predicción.** El cliente predice su propio personaje con `Player.move` (`predict.reconciler` del
   SDK sobre `state.bodies`) y, al llegar el parche con el ack, restaura y vuelve a aplicar sus
   entradas pendientes. Correcciones menores de 150 px se suavizan; mayores se aplican de golpe.
   Medidas y alternativas descartadas: `docs/refactor/spike-colyseus.md`.
7. **Interpolación.** Otros jugadores y zombis se dibujan 110 ms atrasados, interpolando entre
   fotos según el reloj del servidor.
8. **Ronda siguiente.** Cualquiera manda `next` o empieza sola a los 45 s.
9. **Fin.** Cuando caen todos. El estado `finished` muestra resultados.

Mensajes del cliente al servidor: `ready`, `cls`, `start`, `lobby`, `loaded`, `next`, `pick`,
`buy`, `act`, `p` (ping), más las entradas por el canal `room.input()`. Cualquier otro tipo se rechaza con `mensaje desconocido`.

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
- Con `MAX_ROOMS` (8) salas abiertas, crear otra da el error `servidor-lleno`; entrar a una
  existente sigue funcionando hasta `MAX_PLAYERS` (4).
- Expulsión por datos no válidos: código 4100 (el 4003 es de Colyseus: «no se pudo reconectar»).
- Al cerrarse el proceso (`SIGTERM`), el servidor avisa con el mensaje `shutdown` antes de salir.
  `deploy/actualizar.sh --esperar` espera a que no haya salas abiertas antes de reiniciarlo.

### 4.6 Seguridad del servidor

- La identidad sale de la sesión de Colyseus, nunca de un identificador que mande el cliente.
- Cada mensaje se valida en tipo, rango y tamaño. Más de 16 KB corta la conexión.
- Hay límites de frecuencia por jugador (`Bucket` en `validate.ts`).
- La posición, la velocidad, la cadencia, la munición, el dinero y los impactos los calcula el
  servidor. Nunca se confía en posiciones ni impactos del cliente.
- `ALLOWED_ORIGINS` restringe las páginas que pueden conectarse. Con la variable vacía,
  cualquier página puede (sólo para desarrollo, y el servidor lo advierte al arrancar).
- Los tokens de reconexión no se registran en logs.

---

## 5. Configuración del cliente

Todo el ajuste está en [`js/core/config.ts`](../js/core/config.ts):

| Objeto | Campo | Valor actual | Qué controla |
|---|---|---|---|
| `ONLINE` | `url` | `https://dead-zone-73dcc-default-rtdb.firebaseio.com` | Base de Firebase para la clasificación mundial. |
| `NET` | `server` | `wss://servidor.yeyo.games` | Servidor en línea. Vacío = `ws://<host>:2567` en localhost. |
| `NET` | `tickHz` | `60` | Pasos de simulación por segundo. **Debe ser igual en servidor y cliente.** |
| `NET` | `snapHz` | `20` | Fotos por segundo (el servidor lo puede sobreescribir con `SNAP_HZ`). |
| `NET` | `maxPlayers` | `4` | Cupo de sala que muestra el cliente (el servidor manda con `MAX_PLAYERS`). |
| `NET` | `interpDelay`, `maxExtrapolate` | `110`, `100` ms | Retraso de dibujo de los demás y máximo adelanto sin foto. |
| `NET` | `pendingMax`, `snapDist`, `smooth` | `120`, `150`, `12` | Entradas sin confirmar guardadas; umbral de corrección brusca; suavizado. |
| `NET` | `reconnectSeconds` | `20` | Ventana de reconexión. |
| `NET` | `view`, `zombieView` | `1000`, `[900, 760]` | Mitad del cuadro que se manda a cada jugador (general y para zombis). |
| `NET` | `crowd` | `[0.5, 0.15]` | Zombis por oleada: 0,5 del solitario + 0,15 por jugador extra. |

Para cambiar el servidor: edita `NET.server` y publica el juego.
Para probar sin publicar: abre el juego con `?servidor=wss://…`.

---

## 6. Variables de entorno del servidor

Están documentadas en [`server/.env.example`](../server/.env.example) y, para la máquina virtual, en
[`deploy/.env.example`](../deploy/.env.example) (se copia a `deploy/.env`, que no va al repo).

| Variable | Valor en producción | Por defecto | Función |
|---|---|---|---|
| `ALLOWED_ORIGINS` | `https://yeyo.games,https://*.yeyo.games,https://deadzone*.vercel.app` | vacío (acepta todo) | Orígenes permitidos, separados por comas, sin barra final. `*` vale por un trozo sin puntos ni barras. |
| `SNAP_HZ` | `20` | `20` (`NET.snapHz`) | Fotos por segundo por jugador. |
| `PORT` | `2567` (detrás de Caddy) | `2567` | Puerto. |
| `HOST` | `0.0.0.0` | `0.0.0.0` | Dirección de escucha. |
| `MIN_PLAYERS` | `2` | `2` | Jugadores conectados que hacen falta para iniciar (nunca más que `MAX_PLAYERS`). |
| `MAX_PLAYERS` | `4` | `4` | Jugadores por sala. Máximo 10. |
| `MAX_ROOMS` | `8` | `8` | Salas a la vez. Con todas ocupadas, crear otra da `servidor-lleno`. |
| `IDLE_ROOM_MINUTES` | — | `20` | Una sala sin partida se cierra pasado este tiempo. |
| `MAX_CATCHUP` | — | `8` | Pasos atrasados que se recuperan de una vez tras una pausa. |
| `RECONNECT_SECONDS` | — | `20` | Ventana de reconexión. |
| `EMPTY_ROOM_SECONDS` | — | `30` | Tiempo antes de borrar una sala vacía. |
| `LOAD_SECONDS` | — | `12` | Tiempo máximo de carga antes de empezar igual. |
| `COLYSEUS_LATENCY` | — | sin simular | Sólo pruebas: simula ida y vuelta en ms. |

No hay secretos en el servidor: no usa claves ni base de datos. Los únicos secretos del proyecto
son `SERVER_HOST` y `SERVER_SSH_KEY` en GitHub Actions, para la publicación automática.

---

## 7. Versiones y caché

- `npm run build` (Vite) genera `dist/` con archivos con hash en `assets/`; ya no hay sellado manual.
- `vite.config.js` calcula la versión como hash de `js/**/*.js` y `css/style.css`, la inyecta como
  `__DZ_VERSION__` y escribe `dist/version.json`.
- `vercel.json` manda `no-cache` para `index.html` y `version.json`, e `immutable` para `/assets/*`.
- `js/core/version.ts` compara su versión con `version.json` y avisa si hay una nueva.

---

## 8. Desarrollo local

Requisitos: Node 22.18 o más nuevo (Node 24 es el de producción y CI), npm.

```bash
npm ci                      # dependencias del cliente y las herramientas
npm run dev                 # juego en http://localhost:8080
npm run server:install      # una vez: dependencias del servidor
npm run server              # servidor en ws://localhost:2567 (salud: /health)
```

Para probar en el celular, usa `http://IP-DE-TU-PC:8080`. El juego detecta el servidor en el
puerto 2567 de ese mismo equipo. Abrir `index.html` con doble clic no funciona: los módulos
necesitan un servidor.

Comandos de verificación (los mismos que corre CI):

```bash
npm run lint                # Biome: formato y reglas (npm run format arregla el formato)
npm run typecheck           # tsc (checkJs sobre js/) y tsc estricto sobre core/, sim/ y net/
npm test                    # pruebas del núcleo (node:test)
npm run server:test         # pruebas de salas, simulación y netcode
npm run build --prefix server   # sólo comprobación de tipos del servidor (tsc --noEmit)
npm run e2e                 # build + Playwright (Chromium y WebKit); antes: npx playwright install
npm run server:load         # carga con 5 salas de 4 clientes (requiere el servidor en marcha)
```

Finales de línea: `.gitattributes` fuerza LF en todo el texto (Biome y el hash de versión lo
esperan así). Si en Windows `npm run lint` marca todos los archivos, vuelve a sacar el árbol de
trabajo con LF.

### Reglas de código

- Módulos ES sin transpilar; sólo APIs del navegador. Comentarios y textos en español.
- `js/core/` y `js/sim/` cargan en Node sin `document` y no importan `js/render/` ni `js/ui/`
  (`test/carga.test.js` lo comprueba). El dibujo va en `js/render/<x>.js`, junto a `js/sim/<x>.js`.
- El servidor ejecuta `.ts` directamente. Sólo se permite TypeScript borrable: sin `enum`, sin
  decoradores y sin propiedades de parámetro. Los módulos de `js/` no pueden depender de nada
  exclusivo de Vite (`version.ts` protege `__DZ_VERSION__` con `typeof`).
- `Player.update` se divide en `move` (lo comparten servidor y cliente: sólo entradas,
  determinista) y `act` (apuntado y armas). No mezclar.
- Las reglas de combate compartidas van en `js/sim/rules.ts` y `js/sim/combat.ts`, nunca
  duplicadas en `main.js` y `ServerSim.ts`.
- Preguntar el modo por `game.mode` (`authority()`, `canBuild()`…), nunca por `coop.isHost` ni `game.coop`
  (`test/llamadas.test.js` falla si aparece).

---

## 9. Despliegue

### 9.1 Juego en Vercel

Un push a `main` publica en producción; las demás ramas generan una vista previa. Vercel ejecuta
`npm ci` y `npm run build` (lo dicta `vercel.json`) y publica `dist/`. Para crear el proyecto desde
cero: **Add New → Project**, importa el repositorio; el *Framework Preset* da igual.

### 9.2 Servidor en la máquina virtual (producción)

La guía paso a paso (qué comprar, DNS, instalación con `deploy/instalar.sh`, actualización con
`deploy/actualizar.sh` y prueba de carga) está en [`deploy/README.md`](../deploy/README.md).
Publicación automática: `servidor.yml` entra por SSH cuando cambian `server/`, `js/` o `deploy/`
en `main` y ejecuta `deploy/actualizar.sh --esperar`, que espera a que no haya salas abiertas
(30 min como mucho) antes de reiniciar.

### 9.3 Render (histórico)

`render.yaml` permite levantar el servidor en el plan gratis de Render como respaldo. No sirve para
la capacidad actual: 0,1 CPU, se duerme a los 15 min y tarda cerca de un minuto en despertar, y al
dormirse se pierden las partidas. Si se usa, apunta `NET.server` a su URL.

### 9.4 Firebase

1. Crea un proyecto en la consola de Firebase (sin Analytics).
2. Crea una Realtime Database.
3. Publica las reglas de la sección "Clasificación mundial" del README.
4. Copia la URL en `ONLINE.url` de `js/core/config.ts`.

Si cambias la forma de `scores` o `rooms`, actualiza las reglas en el README
(ver también [CLAUDE.md](../CLAUDE.md)).

---

## 10. Integración continua

[`ci.yml`](../.github/workflows/ci.yml) corre en cada push y pull request tres trabajos en
paralelo: `check` (tipos y pruebas del servidor), `nucleo` (Biome, `typecheck` y pruebas del
núcleo) y `e2e` (Playwright en Chromium y WebKit, con una sala en línea contra el servidor local;
límite de 20 minutos, sube el informe si falla). El trabajo `e2e` corre en la imagen oficial de
Playwright (`mcr.microsoft.com/playwright:v<versión>-noble`), que trae los navegadores y sus
bibliotecas: instalarlas con apt en el runner tardaba de 30 s a más de 20 min según el espejo. [`servidor.yml`](../.github/workflows/servidor.yml)
publica el servidor (sección 9.2) y no hace nada si faltan los secretos.

---

## 11. Observabilidad

- **`/health`** en el servidor: salas, jugadores, pasos por segundo, duración de pasos (medio y
  peor), pasos descartados, CPU, memoria, tiempo encendido.
- **Diagnóstico en el juego (F3 o el indicador de conexión)**: RTT de aplicación, pasos por
  segundo del servidor, CPU, salas, KB/s del WebSocket y correcciones de posición.
- **Logs del servidor**: `docker compose logs` en la máquina (ver `deploy/README.md`). El arranque
  muestra la URL y avisa si `ALLOWED_ORIGINS` está vacío.

---

## 12. Resultados de carga (localhost, no es red real)

| Prueba | Fotos/s por cliente | Pasos/s del servidor | Paso medio · peor | CPU |
|---|---|---|---|---|
| 1 sala de 10, 20 fotos/s | 20,0 | 60,0 | 1,5 ms · 16 ms | 26 % de un núcleo |
| 1 sala de 10, 10 fotos/s | 10,0 | 60,0 | 0,8 ms · 10 ms | 15 % de un núcleo |
| 5 salas de 2 | 15,5 | 60 por sala | 0,9 ms · 22 ms | 34 % de un núcleo |
| 5 salas de 4, 20 fotos/s (capacidad actual) | 17,0 | 60,6 por sala, 0 descartados | 0,44 ms · 4,8 ms | 18 % de un núcleo (pico 51 %), 150 MB |

Lo que no está medido: redes móviles, celulares y FPS en un celular de gama media
(`docs/refactor/mediciones.md`).

---

## 13. Limitaciones conocidas

**Juego**
- La clasificación depende de Firebase con reglas abiertas. Cualquiera puede
  escribir. Es para jugar entre amigos, no a prueba de trampas.

**En línea**
- No hay compensación de latencia para disparos.
- Los empujones de los zombis no se predicen en el cliente.
- Las fotos van como arreglos JSON (unos 22 KB/s por jugador a 20 fotos/s). Podrían comprimirse con
  un formato binario o con diferencias entre fotos.

**Servidor**
- Una sola instancia y todo en memoria. Reiniciar termina las partidas (por eso la publicación
  espera a que no haya salas).

**Código**
- Etapa 7 hecha: `core/`, `sim/` y `net/` son `.ts` (Node los ejecuta con type stripping, Vite los
  compila) y ningún archivo lleva `// @ts-nocheck`. `tsconfig.strict.json` activa `noImplicitAny` y
  `strictNullChecks` en esos tres directorios (y en `render/sprites.js`, que arrastra `online.ts`);
  `server/tsconfig.json` es `strict` completo. `Cmd`, `Act`, `Snapshot` y `LobbyMember` viven en
  `js/core/types.d.ts` y los comparten cliente y servidor. Quedó fuera: `strict` en `render/`, `ui/`
  y `main.js` (siguen con `checkJs` laxo) y algunos `any` heredados en `types.d.ts` (`GameHost`).

---

## 14. Mantenimiento: lista para cambios comunes

| Si cambias... | Haz también... |
|---|---|
| Cualquier archivo de `js/` o `css/` | Nada especial: Vite lo recompila y cambia la versión. Un push a `main` también actualiza el servidor. |
| Equilibrio (armas, zombis, precios) | Cambia sólo `js/core/config.ts`. |
| `NET.tickHz` | Cámbialo en `config.js`; el servidor lo toma de ahí. Ambos lados deben coincidir. |
| Lógica compartida (`player.js` `move`, `combat.js`, `rules.js`, `netcode.js`, `snapshot.js`) | Corre `npm test` y `npm run server:test`. |
| Un método nuevo de `Game` que use sim o net | Agrega el campo flecha en `main.js` y el tipo en `core/types.d.ts` (`test/estados.test.js` los compara). |
| El dominio del juego | Agrega el nuevo origen a `ALLOWED_ORIGINS` en `deploy/.env` de la máquina. |
| La URL del servidor | Actualiza `NET.server`. |
| Forma de `scores` o `rooms` | Actualiza las reglas de Firebase en el README. |
| Variables del servidor | Actualiza `server/.env.example`, `deploy/.env.example` y la sección 6 de este documento. |
| Versión de `@playwright/test` | Cambia también la etiqueta de la imagen del trabajo `e2e` en `ci.yml` (misma versión). |
| Versión de Node | Actualiza `engines` en `server/package.json`, `node-version` en los workflows y `deploy/Dockerfile`. |

---

## 15. Glosario

- **Autoritativo**: el servidor decide el resultado. El cliente sólo propone intenciones.
- **Predicción**: el cliente mueve su personaje antes de recibir confirmación del servidor.
- **Reconciliación**: al llegar la foto confirmada, el cliente vuelve a aplicar sus entradas pendientes.
- **Interpolación**: dibujar otros objetos entre dos fotos recientes, con retraso.
- **Foto (snapshot)**: estado del mundo que envía el servidor.
- **Tick / paso**: una iteración de la simulación (60 por segundo).
- **Hash de versión**: Vite nombra los archivos con un hash, así que el caché nunca sirve código viejo.

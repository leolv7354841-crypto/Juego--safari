# Spike: ¿netcode de Colyseus 0.18 en vez del propio?

Prototipo en la rama `spike/colyseus-netcode` (PR 9, en borrador, no se fusiona). **Aplicado a `main` en un PR limpio sólo con los pasos 1 y 2** (`feat/netcode-colyseus`); los pasos 3 y 4, la sonda de rebobinado y el banco `server/tools/bench-zombies.ts` viven únicamente en la rama del spike. Pregunta: ¿conviene que el
modo en línea use `room.input()`/`defineInput`, el módulo `predict` y los Schema con `StateView` del SDK
0.18 (`@colyseus/sdk` 0.18.8 en el cliente, `@colyseus/core` 0.18.23 en el servidor) en lugar de `in` + `Predictor`
+ fotos de arreglos?

**Base:** la rama sale de `feat/coop-en-servidor` (PR 8 sin fusionar), no de `main`: a `main` todavía le falta
la eliminación del cooperativo P2P. Cuando se fusione ese PR, el spike se rebasa sin conflictos de fondo (no toca
nada del cooperativo).

## Recomendación: seguir parcialmente

| Paso | Veredicto | Por qué (números abajo) |
|---|---|---|
| 1. Entradas con `room.input()` | **Seguir** | Subida −75 a −80 % (0,55 → 0,12 KB/s por jugador), validación de formato y rangos la hacen el SDK y `sanitize`, el ack lo lleva el framework. Funciona con todas las pruebas. |
| 2. Predicción con `predict.reconciler` | **Seguir, junto con el 1** | Mismas correcciones de posición que el `Predictor` propio (dentro del ruido), `Predictor` (89 líneas), `packBody`/`unpackBody`, `ack` y `me` pasan a sobrar. Obliga a tener el cuerpo del jugador en el Schema de la sala (el ack viaja en los parches de estado). |
| 3. Mundo como Schema con deltas | **Descartar (por ahora)** | En un banco con los mismos zombis: +19 a +31 % de bytes con coordenadas `int32`, −16 % si caben en `int16`, y **+40 a +60 % de CPU de codificación**. Además deja sin sentido a `Interp`/`remote.ts` (no hay reloj del servidor en cada parche). |
| 4. Compensación de latencia | **No implementado; medido el beneficio** | Con RTT 100 ms los zombis a la vista se movieron **27 px de media (máx. 129 px)** entre lo que veía quien dispara y su posición actual. Depende del paso 3 y obliga a reescribir los impactos (hoy usan `horde.grid`). |

Lo que se conserva (y se aplicó): pasos 1 y 2 (`server/src/input.ts`, `bodies` en el estado, `bindInputs`, el reconciliador en
`online.ts`). Los pasos 3 y 4 quedan como código de experimento en la rama del spike, detrás de `SCHEMA_ZOMBIES` y `REWIND=1`.

## Qué se hizo en cada paso

1. **Entradas.** `server/src/input.ts` define `MoveInput` (`mx my` float32, `f` uint8, `a` float32, `w` int8). La sala hace
   `inputs = this.defineInput(MoveInput, { sanitize, bufferMaxSize: 64, tickRate: 60 })` y el cliente
   `room.input({ mode: 'reliable' })` (WebSocket: el modo `unreliable` sólo es distinto con WebTransport; el esquema llega por la
   reflexión del *join*, el cliente no define el tipo). `validate.ts` conserva `cleanAct`, etc.; `cleanCmd` ya no se usa. Los
   límites de `Bucket` por mensaje (`inp`, `cmds`) se sustituyen por el tope del buffer (64) y una falta (`strike`) si llega a 48.
2. **Predicción.** El SDK sólo reconcilia **estado de un Schema** y lee el ack de `input.lastProcessed`, que llega con el prefijo
   TIMED de los parches de estado. Por eso el cuerpo del jugador (`x y vx vy kx ky stamina sinceRun legAngle boostT exhausted`) pasa
   a `state.bodies` (un `Body` por jugador, copiado tras cada paso en `syncBodies`) y `setPatchRate` pasa de 100 ms a 50 ms
   (`snapHz`). La simulación toma las entradas del buffer del framework de una en una (`acc.next()`, 2 si hay más de 4 pendientes,
   como antes), de modo que el ack (`consumedCount`) cuenta exactamente las entradas que ya movieron al personaje. En el cliente,
   `predict.reconciler(body, { input, step, snap: NET.snapDist })` con `step` = `applyMove` (o sea `Player.move`) sobre el
   `Player` local: es la misma función determinista, de sólo entradas y con `dt = 1/tickHz`, que usa el servidor; `ctx.isReplay`
   elige el juego mudo en las repeticiones. Encaja sin forzar: `input.stepSeconds` es exactamente `TICK`, los valores float32 de la
   entrada se aplican igual en el cliente (`Math.fround`) y el servidor, y `snap` hace de `snapDist`. Se quitó `me` de la foto.
   Hay que activar `warnOnDivergence` (con un umbral enorme) para que el reconciliador exponga `lastCorrection`, que es lo que
   mide el diagnóstico.
3. **Fotos.** Sólo los zombis (lo que más pesa): `ZombieS` (`t x y a fl hp air sw`) en `state.zombies` etiquetado `.view()`, y una
   `StateView` por jugador a la que se añaden/quitan los zombis cercanos (`zombieNear`, las mismas reglas que `encodeZombies`).
   El cliente reconstruye `z/zx/zh` desde `room.state.zombies` para reutilizar `remote.ts` tal cual. No se pasó el resto del
   mundo (jugadores, robots, objetos, balas, estructuras) ni se usó la interpolación del SDK (`Predict.attachAll`): requeriría que
   todo estuviera en Schema, y `Interp` también cubre extrapolación, robots y proyectiles. Esa decisión se tomó con el banco de
   abajo, que ya mostraba que Schema no mejora la parte más pesada.
4. **Rebobinado.** Sólo una sonda: con `REWIND=1`, `allowRewindState` + `attachAll(state.zombies, { fields: ['x','y'] })` y, en
   cada entrada con `IN_FIRE`, se compara `lastSeenBy(sessionId)` con la posición actual de hasta 12 zombis de su vista. El
   cliente pasa `renderDelay: NET.interpDelay`. No se cambió ninguna regla de impacto.

## Mediciones

Condiciones: PC de desarrollo (no la VM de Vultr), servidor y bots en la misma máquina, `npm run server:load` con 5 salas de 4
durante 60 s (`docs/refactor/spike-colyseus/measure.sh`), y una partida real de 2 Chromium (`real.sh`/`real.mjs`) caminando 40 s
con las teclas WASD. **Cada número es una sola ejecución**: los bots mueren a ritmos distintos y el generador de carga satura su
propio proceso (fotos/s del cliente entre 12 y 19 sobre 20), así que las diferencias de ±10 % en la carga no son concluyentes.
Los bytes «enviados por el servidor» se miden en el servidor (contador en `ws.send`, añadido a todas las variantes) y coinciden
con lo que recibe el cliente.

### Carga, 5 salas de 4 durante 60 s

| Variante | Bajada KB/s por jugador (servidor) | Subida KB/s por cliente | CPU media / pico (% de un núcleo) | Paso medio / peor (ms) | RAM |
|---|---|---|---|---|---|
| Base (`in` + `Predictor` + arreglos) | 27,8 | 0,55–0,90 | 24,3 / 58,9 (otras ejecuciones: 17,5–21,6) | 0,44 / 3,41 (0,36–0,45) | 164 MB |
| Pasos 1+2 | 30,7 | 0,46 | 30,7 / 71,5 | 0,57 / 4,32 | 165 MB |
| Paso 3 apagado (`SCHEMA_ZOMBIES=0`) | 25,2 | 0,33 | 29,0 / 76,2 | 0,61 / 4,08 | 165 MB |
| Paso 3 encendido | 25,4 | 0,35 | 28,0 / 73,2 | 0,55 / 3,72 | 166 MB |

Lectura: la subida baja claramente. La bajada y la CPU se mueven dentro del ruido salvo dos efectos reales: los pasos 1+2 añaden
los parches de `bodies` (todos los cuerpos a 20 Hz a todos, ~+10 % de bajada; se arreglaría con una `StateView` que sólo incluya
los cuerpos cercanos) y los parches con filtros codifican una vista por cliente. El paso 3 no cambia la bajada en la carga
(los zombis ya eran la mitad de la foto, pero el Schema los manda más caros, ver el banco).

### Banco: los mismos zombis, dos formas de mandarlos (`server/tools/bench-zombies.ts`, 4 jugadores, 60 s, 20 fotos/s)

| Coordenadas del Schema | A) arreglos + msgpack (hoy) | B) Schema + StateView | Bytes B/A | CPU de codificar B/A |
|---|---|---|---|---|
| `int32` | 13,1 KB/s por jugador · 66 µs/foto | 15,5 KB/s · 99 µs/foto | +19 % | ×1,5 |
| `int32` (otra ejecución) | 18,0 · 81 µs | 23,7 · 113 µs | +31 % | ×1,4 |
| `int16` (cabe: coordenada máxima vista 3 765 px) | 11,5 · 58 µs | 9,7 · 91 µs | −16 % | ×1,6 |

~90 zombis en la vista de cada jugador. Con `int16` el Schema gana en bytes pero depende de que el mapa nunca pase de ±32 767 px, y
aun así cuesta más CPU. Faltaría medir la decodificación en el navegador, que no se midió.

### Partida real de 2 navegadores (Chromium, 40 s caminando, sin combate sostenido)

Correcciones de posición (error > 0,5 px entre lo predicho y lo confirmado), por jugador:

| Variante | Sin latencia: correcciones/min · error medio · máx. | `COLYSEUS_LATENCY=100`: correcciones/min · error medio · máx. | Bajada / subida KB/s (sin latencia) |
|---|---|---|---|
| Base | 122 y 120 · 2,0 px · 6,4 | 157 y 120 · 1,9 px · 6,2 | 6,5 / 0,55 |
| Paso 1 | 98 y 73 · 1,7 px · 4,5 | 117 y 99 · 2,3 px · 6,1 | 6,6 / 0,12 |
| Pasos 1+2 | 94 y 142 · 2,7 y 1,8 px · 6,1 | 76 y 65 · 2,8 y 4,4 px · 9,6 | 9,3 / 0,15 |
| Pasos 1+2+3 | 124 y 119 · 2,5 y 1,9 px · 12,7 | 108 y 105 · 3,1 y 3,5 px · 19,5 | 7,3 / 0,12 |

Con un solo intento por celda la conclusión honesta es: **sin cambio medible** en cuántas correcciones hay, con un error medio algo
mayor y picos más altos en los pasos 2 y 3 bajo latencia (pueden ser el ruido de colisiones y zombis cercanos; no se repitió).
La bajada de 6,5–9 KB/s depende de cuántos zombis hay en ese momento (la partida real avanza de oleada), no de la variante.
El diagnóstico F3 (`#net-stat`) siguió mostrando RTT, actualizaciones/s y FPS; el panel de correcciones sigue funcionando con el
nuevo origen de datos.

### Paso 4: cuánto corregiría el rebobinado

5 salas de 4, `COLYSEUS_LATENCY=100`, `REWIND=1`, 294 012 muestras: los zombis que el tirador tenía en pantalla se movieron
**27,3 px de media (máx. 129 px)** entre lo que él veía y su posición actual. Coste de tener el rebobinado encendido en esa
carga: CPU 31,8 % frente a 20,2 % sin él (paso medio 0,64 frente a 0,42 ms), RAM 238 frente a 226 MB (incluye mi sonda por
disparo).

### Líneas y tamaño (de `e5c1a02` a la rama; `git diff --numstat`)

| Archivo | Añadidas | Borradas |
|---|---|---|
| `js/net/netcode.ts` | 3 | 1 |
| `js/net/snapshot.ts` | 22 | 11 |
| `js/net/remote.ts` | 0 | 0 |
| `js/net/online.ts` | 155 | 55 |
| `server/src/sim/ServerSim.ts` | 17 | 4 |
| `server/src/rooms/DeadZoneRoom.ts` | 168 | 34 |
| `server/src/rooms/state.ts` | 37 | 0 |
| `server/src/input.ts` (nuevo) | 26 | 0 |

Sale **más** código, no menos: el spike añade y casi no borra. Lo que quedaría sin uso y se podría borrar en una migración
real: `Predictor` (89 líneas en `netcode.ts`) con sus pruebas, `packBody`/`unpackBody`, `cleanCmd` (19 líneas) y el bucket `inp`. El
resto de `online.ts` crece porque ahora crea el reconciliador a mano (`tryPredict`).
Tamaño del cliente (`vite build`): el chunk del SDK (`build-*.js`) es **218,71 kB (68,89 kB gzip) antes y después**, porque el
paquete ya trae `input` y `predict`; el chunk de la aplicación pasa de 262,73 kB a 262,52 kB (gzip 92,04 → 91,95).

## Qué cambió o dejó de funcionar (costes de migrar)

- **Reconexión.** Al caer la conexión el SDK reinicia el handle de entradas (`sentCount`/`lastProcessed` vuelven a 0) y el servidor
  da al cliente que vuelve un buffer **nuevo** con el contador de consumidas en 0. La primera versión de `bindInputs` guardaba el
  buffer del primer acceso y, tras reconectar, dejaba de consumir entradas (la prueba nueva lo reproduce: falla con el acceso
  guardado y pasa pidiendo `this.inputs.get(id)` en cada paso). Consecuencias: el `ack` de la simulación retrocede a 0 al volver
  (nada lo usa ya salvo las acciones, que también cuentan desde el handle reiniciado) y el reconciliador sigue el `epoch` del handle
  por su cuenta; no se probó una reconexión con el reconciliador del navegador real.
- **Validación.** Un cliente ya no manda mensajes con formato propio: el SDK decodifica el esquema, `sanitize` acota (NaN → mínimo,
  nunca rechaza) y se pierde el recuento de «entrada inválida» por entrada. Un cliente que manda basura en el canal de entradas
  no suma faltas salvo por ráfaga; los límites de `Bucket` quedaron sólo en los mensajes sueltos (compras, acciones, ping).
- **Ack y huecos.** `starve` (repetir la última entrada cuando el cliente no manda) sigue sin avanzar el ack, igual que antes, y
  tampoco el reconciliador lo repite: ese desvío existía y sigue ahí.
- **Reloj.** Los parches de estado no llevan el `ts` de la foto. El Schema de zombis se lee al llegar la foto, así que puede ir
  hasta 50 ms por detrás respecto a la marca de tiempo con la que `Interp` los dibuja. Habría que usar el reloj del SDK.
- **Estado con filtros.** En cuanto el estado tiene un campo `.view()`, `SchemaSerializer` codifica una vista por cliente en cada
  parche (aunque sea para el lobby). Lo notarías en CPU en salas de 4 jugadores.
- **Mapa invisible hasta que haya zombis.** `room.state.zombies` no existe en el cliente hasta que el primer zombi entra en su
  vista (rompía la foto con `undefined.forEach`; corregido con `?.`).
- **Qué no se probó a mano:** sensación de juego con el robot, la torreta pesada y los empujones de la horda. El reconciliador
  mantiene `kx ky` y `boostT` en el cuerpo, y `inRobot`/`manned` se leen del `Player` local en cada repetición (como antes con
  `Predictor`), pero ninguna prueba automática ejercita esos casos y no se jugó ninguna partida. Es lo primero que habría que
  revisar si se sigue.
- **Fuera del alcance de lo medido:** interpolación de los demás con el SDK (no se adoptó), decodificación de Schema en el
  navegador, máquina real de 2 vCPU, partidas largas.

## Reproducir

```bash
# carga (arranca un servidor, 60 s, lo apaga); variables: SCHEMA_ZOMBIES=0, REWIND=1, ROOT=otra copia del repo
docs/refactor/spike-colyseus/measure.sh etiqueta 2700 5x4 [latenciaMs]
# partida real de 2 navegadores (hace falta `vite build`); los resultados quedan en docs/refactor/spike-colyseus/out/
docs/refactor/spike-colyseus/real.sh etiqueta 2701 2702 [latenciaMs]
# banco de zombis y variables SCHEMA_ZOMBIES / REWIND: sólo en la rama spike/colyseus-netcode
#   cd server && node tools/bench-zombies.ts 60   (XY=int16 para coordenadas de 16 bits)
```

Pruebas: `npm run lint`, `npm run typecheck`, `npm test` (119), `npm run server:test` (42, con la prueba nueva de reconexión) y
`npm run e2e` (14) en verde con los cuatro pasos aplicados.

# Dead Zone — Supervivencia Zombi 2D

Juego de supervivencia zombi en vista cenital (top-down) que se juega directamente en el navegador:
**Chrome y Safari, en computadora y en celular**. Sin instalaciones, sin compilación.

## Cómo se juega

Sobrevive a rondas de caminantes cada vez más grandes. Una ronda termina al eliminar al último zombi; la
siguiente no empieza hasta que pulses **Iniciar siguiente ronda**, así que puedes prepararte sin prisa. Cada zombi eliminado da experiencia; al subir de
nivel el juego se pausa y eliges una de tres mejoras aleatorias. Correr gasta estamina: úsala para salir
de un cerco, no para pasear.

| Zombi   | Vida | Velocidad     | Notas                                                         |
|---------|------|---------------|---------------------------------------------------------------|
| Normal  | 42   | media (el doble que antes) | Llega en hordas enormes (cientos por oleada). Si le das y no muere, se frena, se desangra y avanza arrastrándose dejando un rastro de sangre |
| Policía SWAT | 336 | lenta     | El 20% de los normales. Escudo al brazo; aguanta 8× más       |
| Super blindado | 2100 | muy lenta | Desde la oleada 11, el 7% de la horda. Gordo con armadura militar; aguanta 50× más. Las balas no lo frenan y casi la mitad rebotan en la armadura. Da **super golpes**: te quita 30, te avienta y destroza barricadas |
| Velocista | 26 | rápida        | Desde la primera oleada. Te alcanza si no corres              |
| Gordo   | 130  | más lenta     | Más grande, aguanta unas 3× más disparos. **Al morir revienta en ácido verde**: si te salpica te quema 5 s (2 de vida por segundo) y la vista se pone verde y borrosa |
| Toro    | 294  | rápida al embestir | Desde la oleada 3. Musculoso, bronceado y con cuernos de hueso. Al verte escarba y **embiste**: si te da te lanza y te quita 40. Si choca con una barricada la embiste una y otra vez (250 la embestida larga, 40 las cortas) hasta romperla |
| Dorado  | 126  | rápida        | Raro (uno cada 35–65 s de ronda). No ataca: huye y desaparece a los 26 s. Si lo matas, da **$100–$250** |

Cuando un zombi te golpea **pierdes dinero** ($16–$40 al azar, nunca te deja en negativo) y lo ves en un
indicador rojo junto a tu dinero. El zombi dorado parpadea cuando está por escaparse; si se va, no da nada.
La experiencia para subir de nivel crece más suave en los primeros 10 niveles.

### Cuentas y clasificación

Al entrar escribes un **nombre y un PIN de 4 números**: si la cuenta no existe se crea, y si existe entras
con su progreso. Cada cuenta tiene su propia partida guardada y su mejor marca (oleada más alta y bajas).
El **Salón de la fama** del menú principal (podio con los 3 mejores) y la insignia **Top #N** junto a tu nombre muestran los récords de las cuentas de ese dispositivo. Abierto como Artifact
de Claude, el progreso se copia también a la nube de tu cuenta de Claude y hay una clasificación global.
Para la **clasificación mundial** (todos los celulares en la misma lista) crea una Realtime Database
gratuita en Firebase y pega su URL en `ONLINE.url` de `js/config.js` (ver «Clasificación mundial» abajo).

### Progreso guardado

El juego se guarda solo en el navegador cada pocos segundos, **también a mitad de ronda** (con los
zombis que siguen vivos), y al cerrar o minimizar la página. Al volver a abrir el sitio aparece
**Continuar** y sigues donde estabas. **Si mueres, pierdes la partida** y la siguiente empieza desde la
oleada 1 (tu récord en la clasificación se conserva). *Nueva partida* también borra el progreso.
El guardado vive en el navegador de cada dispositivo (y en cada sitio web por separado).

### Dinero y tienda

Cada zombi eliminado da dinero: **normal $1 · velocista $3 · gordo $5 · SWAT $10 · super blindado $25**. Al terminar cada oleada (después
de elegir tu mejora de nivel) se abre la tienda:

| Estructura | Precio | Efecto |
|--------|--------|--------|
| Bloque de madera | $10 | Barricada básica (160) |
| Sacos terreros | $25 | Muro ancho y barato (450) |
| Bloque de metal | $30 | 3× más que la madera (520) |
| Valla de metal reforzado | $70 | Muro ancho muy resistente (1400) |
| Muro de concreto | $150 | La defensa más dura (3200) |
| Torreta automática | $350 | Dispara sola al zombi más cercano |
| Alambre de púas | $20 | No bloquea: frena y hiere |
| Trampa de pinchos | $60 | Frena y hiere mucho más |
| Mina terrestre | $45 | Explota al pisarla |
| Granada | $90 | Explosión en área que lanzas tú |
| Molotov | $60 | Charco de fuego: los zombis que lo pisan arden, se retuercen y el fuego se contagia |

Las barricadas se colocan delante de ti y las balas pasan por encima (también por encima de los coches).
Tú puedes atravesar tus propias estructuras; los zombis no. Puedes **encimar estructuras** en el mismo lugar
(madera sobre madera, muro sobre valla…): cada pieza aguanta lo suyo y los zombis rompen primero la de
arriba. La torreta necesita su propio sitio. Los zombis las golpean hasta
romperlas o buscan otro camino para rodearlas.

Los zombis aparecen en grupitos por todas las orillas de la pantalla. Unos van directo por ti, otros te
flanquean por los lados y otros dan la vuelta para llegarte por la espalda, así que cuando son muchos te
van cerrando poco a poco. Todos siguen rutas que rodean edificios, coches y barricadas; si alguno se
atasca, se escurre de lado y recalcula su camino.
Caminan de forma algo irregular (se desvían y tropiezan), algunos se quedan rezagados, se esquivan
entre ellos para no amontonarse y los más rápidos adelantan a los más lentos.

### Cooperativo (2 jugadores)

En el menú, **Cooperativo · 2 jugadores**: uno toca *Crear sala* y le pasa el código de 4 letras al
otro, que toca *Unirse*. Juegan en el mismo mapa contra hordas con **la mitad de zombis** que en solitario
(pero con 1,4 veces más vida); los zombis van por el jugador más cercano. No hay competitivo: cada uno
tiene su dinero, armas, vida y mejoras, la experiencia es del equipo, y si uno cae revive con media
vida al terminar la oleada (si caen los dos, se acaba la partida). Las mejoras y la tienda se abren
entre oleadas. El robot es del anfitrión.

Por dentro: el anfitrión simula el mundo y le manda al invitado lo que pasa ~8–12 veces por segundo.
Primero intenta una conexión directa entre los celulares (WebRTC); como en muchas redes móviles no se
logra, mientras tanto todo viaja por la sala de Firebase (en tiempo real), que siempre funciona.

### Robot de combate

En la tienda puedes comprar un **robot de combate** ($3000) del doble de tamaño de un gordo, con
10 000 de vida. Acércate y pulsa `E` (botón **ROBOT** en el celular) para subirte o bajarte: caminas
entre la horda apartando zombis, recibe él los golpes en vez de ti y usa tus armas montadas en su brazo
derecho (puedes cambiarlas igual que siempre). No se cura solo: repáralo en la tienda después de cada
oleada. Si su vida llega a 0 explota, sales despedido y hay que repararlo para volver a usarlo.

### Armas y munición

La pistola tiene balas infinitas. Todas las demás se compran en la tienda (las básicas también salen en
mejoras de nivel). Puedes **vender** cualquier arma que tengas por la mitad de su precio:

| Arma | Precio | Cargador |
|------|--------|----------|
| Subfusil | $120 | 32 |
| Escopeta | $160 | 6 (8 perdigones) |
| Rifle | $220 | 10 (atraviesa 2) |
| Fusil de asalto | $400 | 30 |
| Escopeta automática | $600 | 12 (9 perdigones) |
| Francotirador | $750 | 5 (atraviesa 6) |
| Ametralladora | $900 | 100 |
| Bazuca antitanque | $1400 | 1 cohete (recarga 5 s) |

En la sección **Munición** de la tienda compras cargadores de cualquier arma que tengas, de 1 en 1 o de
10 en 10. La reserva de balas no tiene límite.

La **bazuca** dispara cohetes que estallan con el doble de área que una granada y lanzan los cuerpos por
los aires. Si le das a un gordo, el cohete se le queda clavado en la panza, el gordo se hincha y brilla en
amarillo y revienta brutalmente; si le das a un super blindado, se incrusta en su placa y lo revienta de un solo tiro. Los zombis sueltan munición y botiquines más a menudo
(sobre todo los grandes), y la munición se recoge al instante al pasar cerca.

### Sonido y música

Cada arma tiene su propio disparo y su recarga (cargador, cerrojo, cartuchos) sincronizada con la
animación. Hay gruñidos, pasos de la horda, impactos y caídas. La música cambia sola entre **calma**,
**amenaza** y **horda** según cuántos zombis tengas cerca, con transiciones suaves.

### Controles

| Computadora | Celular |
|-------------|---------|
| `WASD` / flechas: moverse | Joystick virtual (lado izquierdo) |
| `Shift`: correr · `Espacio`: disparar | Botón **Correr** (activa/desactiva) |
| Ratón: apuntar · clic: disparar | Botón de disparo con **apuntado automático** |
| `R`: recargar | Botón de recarga |
| `1`–`9`, `Q` o `Tab`: cambiar arma | Botón de cambio de arma |
| `F`: construir · `V`: cambiar bloque | Botón **Construir** |
| `G`: lanzar granada · `T`: molotov · `E`: robot | Botones **Granada** y **Molotov** (apuntan solos) |
| `Enter`: iniciar siguiente ronda | Botón del panel **Ronda completada** |
| `Esc` / `P`: pausa | Botón de pausa |

## Ejecutar en local

Los módulos de JavaScript necesitan un servidor (no funciona abriendo el archivo con doble clic):

```bash
npm run dev          # http://localhost:8080
# o bien
python3 -m http.server 8080
```

Para probar en tu celular, conéctalo a la misma red Wi-Fi y abre `http://IP-DE-TU-PC:8080`.

## Publicar en Vercel

Flujo actual:

1. **Push a `main`** (la rama principal) → el proyecto `deadzone` de Vercel publica en producción
   (`deadzone-five-red.vercel.app`). Las demás ramas del repositorio generan una vista previa.
2. Vercel no publica la carpeta tal cual: ejecuta `node tools/build.mjs` (lo pide `vercel.json`),
   que sella la versión y copia a `dist/` sólo el juego (`index.html`, `manifest.webmanifest`,
   `css/`, `js/`, `assets/`). El servidor, la documentación y los scripts no quedan públicos.
3. GitHub Actions (`.github/workflows/ci.yml`) comprueba en cada push y pull request que el
   sellado está al día, que el build funciona y que pasan las pruebas del servidor.
4. Si cambió código que usa el servidor (`server/`, `js/`, `deploy/`),
   `.github/workflows/servidor.yml` actualiza la máquina de Vultr en cuanto no hay salas
   abiertas (ver «Publicación automática» en [`deploy/README.md`](deploy/README.md)).

Para crear el proyecto desde cero: [vercel.com](https://vercel.com) → **Add New… → Project** →
importa este repositorio. `vercel.json` ya define el build (*Framework Preset* da igual).

**yeyo.games/deadzone.** El hub `yeyo.games` es otro proyecto de Vercel (`yeyo-games`, Astro,
publicado con la CLI de Vercel). No guarda una copia del juego: su `vercel.json` pasa `/deadzone/`
al proyecto `deadzone`, así que muestra siempre la última versión publicada:

```json
"redirects": [{ "source": "/deadzone", "destination": "/deadzone/", "permanent": false }],
"rewrites": [
  { "source": "/deadzone/", "destination": "https://deadzone-five-red.vercel.app/index.html" },
  { "source": "/deadzone/:path+", "destination": "https://deadzone-five-red.vercel.app/deadzone/:path+" }
]
```

En el iPhone, abre la URL en Safari → Compartir → **Añadir a pantalla de inicio** para jugar a pantalla completa.

## Clasificación mundial (Firebase)

1. En https://console.firebase.google.com crea un proyecto (gratis, sin Analytics).
2. *Compilación → Realtime Database → Crear base de datos* (cualquier región).
3. En la pestaña *Reglas* pega esto y publica:

```json
{
  "rules": {
    "scores": {
      ".read": true,
      "$uid": {
        ".write": true,
        ".validate": "newData.child('name').isString() && newData.child('name').val().length <= 16 && newData.child('wave').isNumber() && newData.child('wave').val() <= 999 && newData.child('kills').isNumber()"
      }
    },
    "rooms": {
      "$code": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

`rooms` es para las salas del modo cooperativo (sólo guardan unos segundos la "dirección" de cada
celular para conectarlos). La partida en sí va directo entre los dos celulares (WebRTC, P2P); algunas
redes móviles bloquean la conexión directa y en ellas el cooperativo no conecta.

4. Copia la URL de la base (`https://…firebaseio.com` o `…firebasedatabase.app`) en `ONLINE.url` de
   `js/config.js`. El juego usa la API REST: no hace falta ninguna librería ni clave.

Cualquiera que tenga el juego puede escribir en la lista; es una clasificación para jugar entre amigos,
no a prueba de trampas.

## Multijugador en línea (servidor, 4 por sala y 5 salas)

Además del cooperativo directo de 2, el botón **En línea · hasta 4** usa un servidor propio
(carpeta `server/`). Capacidad: **4 jugadores por sala y 5 salas a la vez** (`MAX_PLAYERS`,
`MAX_ROOMS`); con todas las salas ocupadas el juego avisa de que el servidor está lleno. **Cómo
publicarlo en una máquina virtual y qué comprar: [`deploy/README.md`](deploy/README.md).** Todos se conectan a él por WebSocket, así que funciona en cualquier red
(también donde la conexión directa entre celulares falla).

**Cómo funciona.** El servidor (Node + TypeScript + [Colyseus](https://colyseus.io) 0.18) simula la
partida completa a 60 pasos por segundo con los mismos módulos del juego (`js/world.js`,
`js/zombies.js`, `js/player.js`, `js/bullets.js`, `js/director.js`): decide movimiento, choques,
disparos, impactos, vida, muertes, oleadas y bajas. El navegador sólo manda lo que quiere hacer
(dirección, correr, disparar, ángulo de la mira, recargar, arma) con un número de secuencia, y
recibe 20 fotos por segundo de lo que tiene cerca.

- **Tu personaje** responde al instante: el movimiento se predice en el navegador con las mismas
  reglas (`Player.move`) y, al llegar el estado confirmado, se restaura y se vuelven a aplicar las
  entradas pendientes (`js/netcode.js`). Las correcciones pequeñas se borran suavemente; las grandes
  (más de 150 px) se aplican de golpe.
- **Los demás y los zombis** se dibujan 110 ms en diferido, interpolando entre fotos con el reloj
  del servidor; como mucho se adelantan 100 ms si falta una foto, y una foto vieja nunca los hace
  retroceder.
- **Disparos:** tu fogonazo y tus balas se ven al instante pero son de adorno; el daño lo calcula
  el servidor con sus propias balas.

**Salas.** Crear sala da un código de 6 caracteres (generado con `crypto`) y un enlace de
invitación (`?sala=CÓDIGO`). Hay lista de jugadores con su estado (listo, jugando, caído,
reconectando), botón *Estoy listo* y *Iniciar partida* sólo para el propietario (cuando los demás
están listos). Fases: esperando → cargando → jugando → finalizada (con resultados). Si el
propietario se va, la sala pasa al más antiguo. Una sala vacía se borra a los 30 s, y una sala
sin partida (esperando o en resultados) se cierra a los 20 minutos para liberar su cupo.

**Reglas del modo en línea (fase 1).** Como en el cooperativo, cada uno tiene su dinero, armas y
mejoras, y la experiencia es del equipo: el dinero se gana como en solitario (recompensas por zombi y
el dorado, para quien lo mata; cada golpe de zombi cuesta dinero, salvo dentro del robot). Al subir de
nivel a mitad de oleada aparece el botón **¡Mejora!** (tecla <kbd>U</kbd>): la partida no se detiene,
así que cada uno la abre cuando le conviene; entre oleadas se abre sola y luego la tienda. La tienda
tiene lo mismo que en solitario: armas, munición, defensas y trampas, granadas, molotovs y el robot de
combate (uno por jugador). Lo que compras lo usas cuando quieras, también en plena oleada: construir
(<kbd>F</kbd>), lanzar (<kbd>G</kbd>/<kbd>T</kbd>) y subir al robot (<kbd>E</kbd>) los hace el
servidor, que también simula las torretas, minas, fuego, cohetes y el ácido del gordo. Se conservan
armas de cajas, munición y botiquines.
Zombis por oleada: 0,5 del solitario + 0,15 por cada jugador extra (y 1,4 veces su vida, como en el
cooperativo). Si caes, revives al terminar la oleada junto a un compañero; la partida termina cuando
caen todos. La siguiente oleada la inicia cualquiera (o empieza sola a los 45 s). El zombi dorado
da dinero a quien lo mata. Quien entra a una sala con la partida empezada espera en la sala y juega la
siguiente. Si alguien pierde la conexión, su personaje se queda quieto, los zombis lo ignoran y no
recibe daño durante 20 s; si vuelve (con el token de reconexión, también tras recargar la página)
recupera el mismo personaje; si no, sale de la sala.

### Ejecutar en local

```bash
npm run server:install   # una vez: dependencias del servidor
npm run server           # servidor en ws://localhost:2567 (salud: http://localhost:2567/health)
npm run dev              # en otra terminal: el juego en http://localhost:8080
```

En `localhost` (o abriendo el juego por `http://IP-DE-TU-PC:8080`) el juego busca solo el servidor
en el puerto 2567 de ese mismo equipo.

### Probar con dos navegadores

1. Abre `http://localhost:8080` en Chrome y en otro navegador (o una ventana de incógnito).
2. En el primero: **En línea · hasta 4 → Crear sala → Copiar invitación**.
3. Pega la invitación en el segundo (o escribe el código) → **Unirse → Estoy listo**.
4. En el primero: **Iniciar partida**.
5. Toca el indicador de conexión (arriba a la izquierda) o pulsa **F3** para ver el diagnóstico:
   RTT de aplicación y su variación, pasos por segundo del servidor y su duración, CPU del servidor,
   salas y jugadores, KB/s del WebSocket y correcciones de posición.

Para probar cortes: recarga la página en plena partida (vuelves a tu personaje), o en las
herramientas de desarrollo de Chrome pon la red en *Offline* unos segundos (se reconecta solo).
Para probar latencia: arranca el servidor con `COLYSEUS_LATENCY=150 npm run server` (simula 150 ms
de ida y vuelta en el servidor) o usa la limitación de red de Chrome (simula una red lenta en el
navegador).

### Pruebas y carga

```bash
npm run server:test      # salas, cupos, permisos, entradas inválidas, reconexión, limpieza, predicción
npm run server           # en otra terminal, para la prueba de carga
npm run server:load      # 20 clientes: 5 salas de 4 (60 s)
node server/tools/load.ts --url wss://servidor.tu-dominio.com --origin https://tu-juego.com --secs 60
```

Resultados medidos **en localhost** (servidor y clientes en el mismo PC con Windows; no son
medidas de red real). Las filas de salas de 10 son de cuando el cupo era 10 (`MAX_PLAYERS=10`):

| Prueba | Fotos/s por cliente | KB/s por cliente | Pasos/s del servidor | Paso medio · peor | CPU del servidor |
| --- | --- | --- | --- | --- | --- |
| 1 sala de 10, 20 fotos/s | 20,0 | ~28 | 60,0 (0 descartados) | 1,5 ms · 16 ms | 26 % de un núcleo |
| 1 sala de 10, 10 fotos/s (`SNAP_HZ=10`) | 10,0 | ~15 | 60,0 (0 descartados) | 0,8 ms · 10 ms | 15 % de un núcleo |
| 5 salas de 2 | 15,5 (las salas terminan al morir los bots) | ~17 | 60 por sala (3 descartados) | 0,9 ms · 22 ms | 34 % de un núcleo |
| 1 sala de 10 con `COLYSEUS_LATENCY=100` | 20,0 | ~25 | 60,0 | 0,8 ms · 6 ms | 16 % de un núcleo |
| **5 salas de 4, 20 fotos/s (capacidad actual)** | 17,0 (las salas terminan al morir los bots) | ~22 | 60,6 por sala (0 descartados) | 0,44 ms · 4,8 ms | 18 % de un núcleo (pico 51 %), 150 MB |

Con 100 ms de latencia simulada el RTT medido fue de 124 ms de mediana, y en el navegador el
personaje propio empezó a moverse en el primer fotograma (unas 10 entradas sin confirmar, 0
correcciones al caminar). El objetivo de un RTT por debajo de 50 ms depende de lo cerca que esté el
servidor de los jugadores: **no está medido en un servidor remoto** y no se garantiza. El RTT que se
muestra es de aplicación (ida y vuelta de un mensaje), no el ping de red ni el tiempo total de
respuesta (que suma el retraso de dibujo y los fotogramas). Las pérdidas de paquetes no se miden:
WebSocket va sobre TCP, que las oculta reenviando.

### Publicar el servidor gratis en Render

> Para la capacidad actual (5 salas de 4) se recomienda la máquina virtual de
> [`deploy/README.md`](deploy/README.md): el plan gratis no da abasto ni está siempre encendido.

Condiciones actuales del plan gratis de Render (revisadas en octubre de 2026,
[documentación](https://render.com/docs/free)): 512 MB de RAM y **0,1 CPU**; se duerme tras 15
minutos sin tráfico (cuentan las peticiones HTTP y los mensajes WebSocket) y tarda **cerca de un
minuto** en despertar con la siguiente conexión; 750 horas gratis al mes; Render puede reiniciarlo
en cualquier momento. **Al reiniciarse o dormirse se pierden las partidas en curso** (todo vive en
memoria).

1. Sube el repositorio a GitHub.
2. En [render.com](https://render.com): **New → Blueprint**, elige el repositorio (usa
   `render.yaml`). O bien **New → Web Service** con:
   - Build Command: `npm ci --prefix server && npm run build --prefix server`
   - Start Command: `npm start --prefix server`
   - Health Check Path: `/health`
   - Variables: `NODE_VERSION=24`, `ALLOWED_ORIGINS=https://tu-juego.vercel.app` (las páginas desde
     las que se juega, separadas por comas) y `SNAP_HZ=10`.
3. Cuando esté en marcha, copia su dirección y ponla en `NET.server` de `js/config.js` con `wss://`
   (por ejemplo `wss://dead-zone-server.onrender.com`), ejecuta `npm run stamp` y publica el juego.
   También se puede probar sin publicar abriendo el juego con `?servidor=wss://…`.

Con 0,1 CPU, una sala de 10 (o 5 de 4) a 60 pasos y 20 fotos por segundo **probablemente no da abasto** (en
este PC usó un 26 % de un núcleo). Por eso `render.yaml` baja las fotos a 10 por segundo; aun así,
en el plan gratis conviene probar primero con pocos jugadores y mirar el diagnóstico (pasos/s y
CPU). Para 5 salas de 4 fluidas hace falta más CPU: la máquina virtual de
[`deploy/README.md`](deploy/README.md).

### Alternativa: una máquina virtual Linux (también ARM)

La forma preparada (Docker + Caddy, con script de instalación) está en
[`deploy/README.md`](deploy/README.md). A mano, sin Docker:

Las dependencias son JavaScript puro (Node 22.18 o más nuevo), así que funciona igual en x86 y en
ARM (por ejemplo una VM Ampere). Ejemplo con Ubuntu:

```bash
sudo apt install -y nodejs npm git        # o Node 24 desde nodesource / nvm
git clone https://github.com/TU-USUARIO/Juego--safari.git && cd Juego--safari
npm ci --prefix server
ALLOWED_ORIGINS=https://tu-juego.vercel.app npm start --prefix server
```

Para dejarlo siempre encendido usa un servicio de systemd, y para `wss://` pon delante un proxy
con HTTPS (por ejemplo Caddy: `tu-dominio.com { reverse_proxy localhost:2567 }`, que consigue el
certificado solo). Detén el servicio con `SIGTERM` (`systemctl stop`): el servidor avisa a los
jugadores antes de cerrar.

### Variables de entorno

Están todas, con su explicación, en [`server/.env.example`](server/.env.example) (no hay secretos:
el servidor no usa claves). La frecuencia de simulación no es una variable: es `NET.tickHz` en
`js/config.js`, porque el navegador la necesita igual para predecir.

### Seguridad básica

El servidor valida tipo, rango y tamaño de cada mensaje (más de 16 KB corta la conexión), limita
cuántas entradas y acciones manda cada jugador por segundo, rechaza secuencias repetidas o muy
adelantadas, recorta la dirección a longitud 1 y aplica él mismo la velocidad, la cadencia y la
munición. La identidad sale de la sesión de Colyseus (nunca de un id que mande el cliente): conocer
el código de la sala sólo permite pedir entrar. `ALLOWED_ORIGINS` limita qué páginas pueden
conectarse. Los tokens no se registran.

### Limitaciones y trabajo pendiente

- Sin compensación de latencia para los disparos: las balas son proyectiles que simula el servidor
  en su presente. Con mucho RTT, al apuntar a un zombi que se mueve de lado puedes fallar por poco.
- Tu personaje no predice el empujón de los zombis (lo corrige el servidor; se nota como un leve
  deslizamiento al chocar con la horda).
- Una sola instancia y todo en memoria: reiniciar el proceso termina las partidas.
- Las fotos van en JSON/msgpack con posiciones cercanas (unos 25–30 KB/s por jugador a 20 fotos/s);
  se podrían comprimir más con un formato binario o con diferencias entre fotos.
- Medido sólo en localhost; falta medir en un servidor real y con celulares.

## Versiones y caché

`node tools/stamp.mjs` (o `npm run stamp`) sella `index.html` con un hash del código: un pequeño
cargador arma un *import map* para pedir cada módulo con `?v=<hash>`, y `js/version.js` guarda el
mismo hash. Si un CDN (como raw.githack.com) entrega un archivo viejo, el juego lo detecta al abrir y se
recarga solo pidiendo todo de nuevo. Ejecútalo antes de cada commit (GitHub Actions avisa si se
olvida, y Vercel vuelve a sellar al publicar). El hash no depende de los saltos de línea (CRLF o LF), así
que sale igual en Windows y en Linux. La versión aparece en el menú.

## Estructura

```
index.html          Interfaz: HUD, controles táctiles y pantallas
css/style.css       Estilos y diseño adaptable
js/main.js          Bucle principal, cámara, render, HUD y menús
js/config.js        Equilibrio: armas, zombis, experiencia
js/world.js         Ciudad procedural, colisiones, campo de flujo y suelo por trozos
js/player.js        Movimiento, estamina, armas, recarga y retroceso
js/zombies.js       Horda, tácticas (directo, flanco, espalda), rejilla espacial y ataques
js/bullets.js       Balas con colisión segmento-círculo y perforación
js/director.js      Oleadas y aparición de zombis
js/upgrades.js      Mejoras al subir de nivel
js/build.js         Barricadas, alambre de púas y granadas
js/lighting.js      Oscuridad, linterna, farolas y fuegos
js/particles.js     Partículas y restos en el suelo
js/pickups.js       Munición, botiquines y cajas de armas
js/input.js         Teclado, ratón y controles táctiles
js/audio.js         Sonido sintetizado con Web Audio
js/music.js         Música dinámica (calma, amenaza, horda)
js/accounts.js      Cuentas, guardado por cuenta y clasificación
js/robot.js         Robot de combate pilotable
js/net.js           Conexión entre 2 celulares (código de sala + WebRTC)
js/online.js        Modo en línea: sala, predicción, interpolación y diagnóstico
js/netcode.js       Predicción/reconciliación e interpolación (compartido con el servidor)
js/combat.js        Reglas de impacto de bala (compartidas con el servidor)
js/vendor/          SDK de Colyseus para el navegador (se carga sólo en línea)
js/coop.js          Modo cooperativo: anfitrión, invitado y sincronización
js/version.js       Versión del código (la genera tools/stamp.mjs)
server/             Servidor autoritativo en línea (Node, TypeScript, Colyseus); pruebas y carga
deploy/             Servidor en una máquina virtual: Docker, Caddy (HTTPS), instalación y guía
render.yaml         Despliegue del servidor en Render
js/sprites.js       Todo el arte, generado por código
```

Todo el arte y el sonido se generan por código: el proyecto no usa recursos de terceros.

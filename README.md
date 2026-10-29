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
indicador rojo junto a tu dinero; en las oleadas 1 a 3 los golpes todavía no cuestan dinero. El zombi dorado parpadea cuando está por escaparse; si se va, no da nada.

**Racha:** cada baja hecha antes de 2,5 s de la anterior alarga tu racha (un dorado suma 10). Con 10 bajas
seguidas cada zombi da **×1,5** de dinero y experiencia, con 25 **×2**, con 50 **×3** y con 100 **×4**. Un
golpe de zombi (fuera del robot) o caer la corta. La mejor racha de la partida sale en el resumen final.
La experiencia para subir de nivel crece más suave en los primeros 10 niveles.

**Arranque suave:** la oleada 1 trae menos de la mitad de zombis y ningún policía SWAT (llegan en la 2),
la 2 trae dos tercios y la 3 un 85 %; desde la 4, la horda entera. Los niveles 1 y 2 piden menos
experiencia (unas 12 y 30 bajas). Cada baja hace saltar en el sitio lo que te dio (**+$** y **+XP**; si caen
varias juntas, se suman en un solo número) y, en solitario, una baja grande o cuatro casi a la vez detienen
el mundo una fracción de segundo para que el golpe se sienta.

**Rondas especiales:** desde la oleada 2, cada oleada tiene un 65 % de probabilidad de ser especial (nunca
dos seguidas). Se anuncian en el cartel y su nombre sale en el contador de oleada, y todas sus bajas pagan
×1,5 (la luna de sangre, ×2):

| Ronda | Qué pasa |
|-------|----------|
| Niebla | Solo ves un claro alrededor tuyo; la horda llega de entre la niebla |
| Apagón | Las farolas se apagan: solo alumbran tu linterna, los disparos y el fuego |
| Estampida | Una horda más chica (60 %) solo de velocistas y toros |
| Lluvia dorada | Un zombi dorado tras otro, cada 7 a 11 s |
| Asedio blindado | La mitad de los normales llegan como policías SWAT |
| Luna de sangre | Noche roja: los zombis van un 20 % más rápido y pagan el doble |

### Cuentas y clasificación

Al entrar escribes un **nombre y un PIN de 4 números**: si la cuenta no existe se crea, y si existe entras
con su progreso. Cada cuenta tiene su propia partida guardada y su mejor marca (oleada más alta y bajas).
El **Salón de la fama** del menú principal (podio con los 3 mejores) y la insignia **Top #N** junto a tu nombre muestran los récords de las cuentas de ese dispositivo. Abierto como Artifact
de Claude, el progreso se copia también a la nube de tu cuenta de Claude y hay una clasificación global.
Para la **clasificación mundial** (todos los celulares en la misma lista) crea un proyecto gratuito en
Supabase y pega su URL y su clave publicable en `ONLINE` de `js/core/config.ts` (ver «Clasificación
mundial y estadísticas» abajo).

### Progreso guardado

El juego se guarda solo en el navegador cada pocos segundos, **también a mitad de ronda** (con los
zombis que siguen vivos), y al cerrar o minimizar la página. Al volver a abrir el sitio aparece
**Continuar** y sigues donde estabas. **Si mueres, pierdes la partida** y la siguiente empieza desde la
oleada 1 (tu récord en la clasificación se conserva). *Nueva partida* también borra el progreso.
El guardado vive en el navegador de cada dispositivo (y en cada sitio web por separado).

### Dinero y tienda

Cada zombi eliminado da dinero: **normal $0,5 · velocista $1,5 · gordo $2,5 · SWAT $5 · toro $7,5 · super blindado $12,5**
(los centavos se juntan hasta completar un dólar). Superar una oleada paga un premio de **$15 + $10 por
oleada** ($25 la primera, $65 la quinta). Al terminar cada oleada (después
de elegir tu mejora de nivel) se abre la tienda:

| Estructura | Precio | Efecto |
|--------|--------|--------|
| Bloque de madera | $10 | Barricada básica (160) |
| Sacos terreros | $25 | Muro ancho y barato (450) |
| Bloque de metal | $30 | 3× más que la madera (520) |
| Valla de metal reforzado | $70 | Muro ancho muy resistente (1400) |
| Muro de concreto | $150 | La defensa más dura (3200) |
| Barrera HESCO | $800 | Gaviones de malla con arena, casi indestructibles (10000) |
| Barrera de concreto reforzado | $1300 | Concreto con placas de acero y vigas; recibe 10 % menos daño (18000) |
| Torreta automática | $500 | Dispara sola al zombi más cercano |
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

### Jugar con amigos (en línea, de 2 a 4)

El juego tiene dos modos: **Un jugador** y **En línea · 2 a 4**. Para jugar con un amigo, uno toca
*En línea* → *Crear sala* y le pasa el **código** de 6 caracteres o el **enlace de invitación**
(`?sala=CÓDIGO`) que muestra la sala; el otro abre el enlace (o escribe el código) y entra. La partida
empieza cuando hay **de 2 a 4 jugadores conectados y listos**; con una sola persona el botón
*Iniciar partida* avisa de que hace falta otra. Ver «Multijugador en línea» más abajo.

### Robot de combate

En la tienda puedes comprar un **robot de combate** ($3000) del doble de tamaño de un gordo, con
10 000 de vida. Acércate y pulsa `E` (botón **ROBOT** en el celular) para subirte o bajarte: caminas
entre la horda apartando zombis, recibe él los golpes en vez de ti y usa tus armas montadas en su brazo
derecho (puedes cambiarlas igual que siempre). No se cura solo: repáralo en la tienda después de cada
oleada. Si su vida llega a 0 explota, sales despedido y hay que repararlo para volver a usarlo.

### Torreta pesada y su taller

La **torreta pesada** ($15 000) es un cañón doble que manejas tú (`E` junto a ella) con balas explosivas
que se compran en la tienda. Junto a ella (o montado) pulsa `M` (botón de la **llave** en el celular)
para abrir su **taller**: cada torreta tiene sus propias mejoras, se compran en cualquier momento y se
ven en la torreta.

| Mejora | Niveles | Efecto |
|--------|---------|--------|
| Calibre | $1000 · $2500 · $5000 | Daño ×1,2 · ×1,4 · ×1,6 (al pegar y al estallar) |
| Cadencia | $1000 · $2500 · $5000 | 11 · 13 · 15 disparos por segundo (de 9) |
| Carga explosiva | $1200 · $3000 · $6000 | Radio de la explosión 75 · 90 · 105 px (de 60) |
| Blindaje | $800 · $2000 · $4000 | Vida 6000 · 8000 · 10 000 (de 4000) y repara 15 · 25 · 35 % al acabar cada oleada |
| Piloto automático | $6000 | Sin nadie a los mandos dispara sola a media cadencia (hasta 520 px) con las balas de quien la puso |

### Armas y munición

El subfusil, con el que empiezas, tiene balas infinitas. Las demás se compran en la tienda (la escopeta y
el rifle también salen en las cajas de armas) y cuestan más mientras más poder tienen: daño por segundo
contando recargas, a cuántos zombis atraviesan y el área. Puedes **vender** cualquier arma que tengas por
la mitad de su precio:

| Arma | Precio | Daño | Cargador | Daño por segundo |
|------|--------|------|----------|------------------|
| Subfusil | inicial | 14 | 32 | 100 |
| Escopeta | $500 | 8 × 30 | 6 | 280 de cerca |
| Fusil de asalto | $800 | 30 | 30 (atraviesa 1) | 180 (365 en fila) |
| Rifle | $1200 | 110 | 10 (atraviesa 2) | 165 (490 en fila) |
| Escopeta automática | $2000 | 9 × 22 | 12 | 400 de cerca |
| Ametralladora | $3000 | 30 | 100 (atraviesa 2) | 260 (780 en fila) |
| Francotirador | $4500 | 300 | 5 (atraviesa 6) | 190 (1320 en fila) |
| Bazuca antitanque | $6000 | cohete en área | 1 (recarga 4 s) | revienta grupos y blindados |

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
| `G`: lanzar granada · `T`: molotov · `E`: robot o torreta pesada | Botones **Granada** y **Molotov** (apuntan solos) |
| `M`: taller de la torreta pesada (junto a ella) | Botón de la **llave** |
| `Enter`: iniciar siguiente ronda | Botón del panel **Ronda completada** |
| `Esc` / `P`: pausa | Botón de pausa |

### Modo desarrollador

Para probar el juego sin jugar cada ronda hay un panel de desarrollo (`js/ui/dev.js`). Se activa abriendo el
juego con `?dev=1` en la dirección (por ejemplo `http://localhost:8080/?dev=1`); queda guardado en ese
navegador hasta que lo abras con `?dev=0`. En el celular, sin teclado, se activa y desactiva tocando
**cinco veces seguidas el número de versión** del menú principal. Con el modo activado, la tecla **º**
(la que está a la izquierda del `1`; `` ` `` en teclado inglés) enseña u oculta el panel.

El panel muestra, cuatro veces por segundo: la oleada y su estado, los zombis **vivos**, **en pantalla** y
**cerca** (y cuántos de cada tipo), el tamaño de la ronda con lo que queda **en cola**, lo que traen las
**dos rondas siguientes** (sin contar rondas especiales), el reloj del zombi dorado, la posición, vida,
nivel y dinero del jugador, y balas, partículas, estructuras y FPS. Y tiene botones para: dar **dinero**
(+$1 000 y +$10 000), **subir de nivel**, **matar a todos** (con botín), **terminar la ronda** (abre la
tienda como siempre), **saltar a cualquier ronda** (la que esté en curso se descarta), **generar N zombis**
de un tipo junto a la pantalla, sacar un **zombi dorado**, cambiar la **velocidad del juego** (×0,25 a
×3), ser **invencible**, tener **munición infinita**, desbloquear **todas las armas** y desplegar el
**robot**.

Una partida en la que se usó cualquiera de esas trampas queda marcada (también en el guardado) y **no
cuenta para los récords** de la cuenta ni para la clasificación. En línea el servidor manda, así que el
panel sólo muestra cifras.

## Ejecutar en local

Los módulos de JavaScript necesitan un servidor (no funciona abriendo el archivo con doble clic):

```bash
npm ci               # una vez: dependencias
npm run dev          # http://localhost:8080
```

Para probar en tu celular, conéctalo a la misma red Wi-Fi y abre `http://IP-DE-TU-PC:8080`.

## Publicar en Vercel

Flujo actual:

1. **Push a `main`** (la rama principal) → el proyecto `deadzone` de Vercel publica en producción
   (`deadzone-five-red.vercel.app`). Las demás ramas del repositorio generan una vista previa.
2. Vercel no publica la carpeta tal cual: ejecuta `npm run build` (Vite, lo pide `vercel.json`) y publica `dist/`. El servidor, la documentación y los scripts no quedan públicos.
3. GitHub Actions (`.github/workflows/ci.yml`) comprueba en cada push y pull request Biome, los tipos (`checkJs` y TypeScript estricto en el núcleo), las pruebas del núcleo, los tipos y pruebas del servidor, y Playwright (Chromium y WebKit).
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

## Clasificación mundial y estadísticas (Supabase)

Un solo proyecto de Supabase guarda la clasificación mundial (`scores`) y las estadísticas de uso. No hace
falta para jugar con amigos: las partidas de 2 a 4 pasan por el servidor en línea, que no toca la base.

1. En https://supabase.com crea un proyecto (el plan gratuito basta; región `us-east-1`).
2. En *SQL Editor* pega entero [`supabase/esquema.sql`](supabase/esquema.sql) y ejecútalo (se puede repetir:
   crea tablas, políticas, vistas y funciones sólo si faltan).
3. Elige la clave de la página de estadísticas y fíjala en el mismo editor (nunca va en el código):

```sql
select fijar_clave('tu clave');
```

4. En *Project Settings → API* copia la **URL del proyecto** y la **clave publicable** (`sb_publishable_…`)
   en `ONLINE` de `js/core/config.ts`. El juego usa la API REST, sin librería; la clave es pública por
   diseño: las tablas sólo se escriben a través de las funciones `dz_*` y sólo `scores` se lee.

Cualquiera que tenga el juego puede subir su récord; es una clasificación para jugar entre amigos, no a
prueba de trampas. Las pruebas de navegador (Playwright) no escriben en ella.

### Qué se mide y dónde se ve

Todo es **anónimo**: un identificador aleatorio por navegador (sin nombre de cuenta, sin PIN, sin IP
guardada por el juego), por eso no hay aviso de cookies. Se guarda una **sesión** por cada apertura del
juego (inicio, último latido cada minuto, versión, táctil o no, por dónde entró) y una **partida** por cada
run (modo, clase, oleada, duración, nivel, bajas por tipo, cómo acabó, causa de la muerte con la oleada y
el arma en mano), más cada **mejora** elegida con las que se ofrecieron y cada **compra** con su oleada.
No se manda nada desde `npm run dev`, desde Playwright ni si abres el juego una vez con `?sinstats`
(queda recordado en ese navegador: sirve para excluir tus propios dispositivos).

La página **`/stats`** (en producción, `yeyo.games/deadzone/stats`, sin barra final porque el hub no la pasa; no está enlazada desde el juego) pide
la clave y muestra visitas por día, dispositivos que regresan, ronda promedio y distribución por clase,
duración de sesiones y partidas, tasa de elección de cada mejora, compras y causas de muerte, por 7 días,
30 días o todo. Las vistas `v_*` del esquema dan lo mismo en el panel de Supabase.

## Multijugador en línea (servidor, de 2 a 4 por sala y 8 salas)

El botón **En línea · 2 a 4** usa un servidor propio (carpeta `server/`). Capacidad: **de 2 a 4
jugadores por sala** (`MIN_PLAYERS`, `MAX_PLAYERS`) **y 8 salas a la vez** (`MAX_ROOMS`); con todas las
salas ocupadas el juego avisa de que el servidor está lleno. **Cómo
publicarlo en una máquina virtual y qué comprar: [`deploy/README.md`](deploy/README.md).** Todos se conectan a él por WebSocket, así que funciona en cualquier red
(sin conexión directa entre celulares ni base de datos de por medio).

**Cómo funciona.** El servidor (Node + TypeScript + [Colyseus](https://colyseus.io) 0.18) simula la
partida completa a 60 pasos por segundo con los mismos módulos del juego (`js/sim/world.ts`,
`js/sim/zombies.ts`, `js/sim/player.ts`, `js/sim/bullets.ts`, `js/sim/director.ts`): decide movimiento, choques,
disparos, impactos, vida, muertes, oleadas y bajas. El navegador sólo manda lo que quiere hacer
(dirección, correr, disparar, ángulo de la mira, recargar, arma) con un número de secuencia, y
recibe 20 fotos por segundo de lo que tiene cerca.

- **Tu personaje** responde al instante: el movimiento se predice en el navegador con las mismas
  reglas (`Player.move`) y, al llegar el estado confirmado, se restaura y se vuelven a aplicar las
  entradas pendientes (`js/net/netcode.ts`). Las correcciones pequeñas se borran suavemente; las grandes
  (más de 150 px) se aplican de golpe.
- **Los demás y los zombis** se dibujan 110 ms en diferido, interpolando entre fotos con el reloj
  del servidor; como mucho se adelantan 100 ms si falta una foto, y una foto vieja nunca los hace
  retroceder.
- **Disparos:** tu fogonazo y tus balas se ven al instante pero son de adorno; el daño lo calcula
  el servidor con sus propias balas.

**Salas.** Crear sala da un código de 6 caracteres (generado con `crypto`) y un enlace de
invitación (`?sala=CÓDIGO`). Hay lista de jugadores con su estado (listo, jugando, caído,
reconectando), botón *Estoy listo* y *Iniciar partida* sólo para el propietario (cuando hay al menos
`MIN_PLAYERS` = 2 conectados y los demás están listos). Fases: esperando → cargando → jugando → finalizada (con resultados). Si el
propietario se va, la sala pasa al más antiguo. Una sala vacía se borra a los 30 s, y una sala
sin partida (esperando o en resultados) se cierra a los 20 minutos para liberar su cupo.

**Reglas del modo en línea (fase 1).** Cada uno tiene su dinero, armas y
mejoras, y la experiencia es del equipo: el dinero se gana como en solitario (recompensas por zombi y
el dorado, para quien lo mata; cada golpe de zombi cuesta dinero, salvo dentro del robot). Al subir de
nivel a mitad de oleada aparece el botón **¡Mejora!** (tecla <kbd>U</kbd>): la partida no se detiene,
así que cada uno la abre cuando le conviene; entre oleadas se abre sola y luego la tienda. La tienda
tiene lo mismo que en solitario: armas, munición, defensas y trampas, granadas, molotovs y el robot de
combate (uno por jugador). Lo que compras lo usas cuando quieras, también en plena oleada: construir
(<kbd>F</kbd>), lanzar (<kbd>G</kbd>/<kbd>T</kbd>) y subir al robot (<kbd>E</kbd>) los hace el
servidor, que también simula las torretas, minas, fuego, cohetes y el ácido del gordo. Se conservan
armas de cajas, munición y botiquines.
Zombis por oleada: 0,5 del solitario + 0,15 por cada jugador extra (y 1,4 veces su vida). Si caes, revives al terminar la oleada junto a un compañero; la partida termina cuando
caen todos. La siguiente oleada la inicia cualquiera (o empieza sola a los 45 s). El zombi dorado
da dinero a quien lo mata. Quien entra a una sala con la partida empezada espera en la sala y juega la
siguiente. Si alguien pierde la conexión, su personaje se queda quieto, los zombis lo ignoran y no
recibe daño durante 20 s; si vuelve (con el token de reconexión, también tras recargar la página)
recupera el mismo personaje; si no, sale de la sala.

#### Modo desarrollador

Para probar el juego sin jugar cada ronda hay un panel de desarrollo (`js/ui/dev.js`). Se activa abriendo el
juego con `?dev=1` en la dirección (por ejemplo `http://localhost:8080/?dev=1`); queda guardado en ese
navegador hasta que lo abras con `?dev=0`. En el celular, sin teclado, se activa y desactiva tocando
**cinco veces seguidas el número de versión** del menú principal. Con el modo activado, la tecla **º**
(la que está a la izquierda del `1`; `` ` `` en teclado inglés) enseña u oculta el panel.

El panel muestra, cuatro veces por segundo: la oleada y su estado, los zombis **vivos**, **en pantalla** y
**cerca** (y cuántos de cada tipo), el tamaño de la ronda con lo que queda **en cola**, lo que traen las
**dos rondas siguientes** (sin contar rondas especiales), el reloj del zombi dorado, la posición, vida,
nivel y dinero del jugador, y balas, partículas, estructuras y FPS. Y tiene botones para: dar **dinero**
(+$1 000 y +$10 000), **subir de nivel**, **matar a todos** (con botín), **terminar la ronda** (abre la
tienda como siempre), **saltar a cualquier ronda** (la que esté en curso se descarta), **generar N zombis**
de un tipo junto a la pantalla, sacar un **zombi dorado**, cambiar la **velocidad del juego** (×0,25 a
×3), ser **invencible**, tener **munición infinita**, desbloquear **todas las armas** y desplegar el
**robot**.

Una partida en la que se usó cualquiera de esas trampas queda marcada (también en el guardado) y **no
cuenta para los récords** de la cuenta ni para la clasificación. En línea el servidor manda, así que el
panel sólo muestra cifras.

## Ejecutar en local

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
npm run server:load      # 20 clientes: 5 salas de 4 (60 s); para la capacidad actual: -- --rooms 8x4
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
| 5 salas de 4, 20 fotos/s (capacidad anterior) | 17,0 (las salas terminan al morir los bots) | ~22 | 60,6 por sala (0 descartados) | 0,44 ms · 4,8 ms | 18 % de un núcleo (pico 51 %), 150 MB |
| **8 salas de 4, 20 fotos/s (capacidad actual, 45 s)** | 16,4 (mín. 8,1; los bots comparten el PC) | ~28 | 60,2 por sala (0 descartados) | 0,26 ms · 3,2 ms | 21,5 % de un núcleo (pico 60 %), 170 MB |

Con 100 ms de latencia simulada el RTT medido fue de 124 ms de mediana, y en el navegador el
personaje propio empezó a moverse en el primer fotograma (unas 10 entradas sin confirmar, 0
correcciones al caminar). El objetivo de un RTT por debajo de 50 ms depende de lo cerca que esté el
servidor de los jugadores: **no está medido en un servidor remoto** y no se garantiza. El RTT que se
muestra es de aplicación (ida y vuelta de un mensaje), no el ping de red ni el tiempo total de
respuesta (que suma el retraso de dibujo y los fotogramas). Las pérdidas de paquetes no se miden:
WebSocket va sobre TCP, que las oculta reenviando.

### Render (histórico)

El servidor empezó en el plan gratis de Render; `render.yaml` sigue en el repo como respaldo
(**New → Blueprint** en [render.com](https://render.com) y apuntar `NET.server` a su URL). No sirve
para la capacidad actual: 0,1 CPU, se duerme a los 15 minutos sin tráfico, tarda cerca de un minuto
en despertar y al dormirse se pierden las partidas. Producción es la máquina virtual de
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
`js/core/config.ts`, porque el navegador la necesita igual para predecir.

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

Vite genera archivos con hash en `dist/assets/` (se guardan en caché para siempre) y `index.html` va con `no-cache` (ver `vercel.json`), así que ya no hay que sellar nada. `js/core/version.ts` lleva la versión del build; si una pestaña vieja sigue abierta cuando se publica otra, el juego avisa con un mensaje (compara con `version.json`). La versión aparece en el menú.

## Estructura

```
index.html            Interfaz: HUD, controles táctiles y pantallas
css/style.css         Estilos y diseño adaptable
js/main.js            Game: construye los módulos, guarda la partida y corre el bucle (sólo coordina)
js/states.js          Máquina de estados como tabla (menú, partida, pausa, tienda, nivel, fin…)
js/events.js          Eventos de combate del jugador local
js/actions.js         Acciones de tecla y botón (habilidad, robot, construir, lanzar)
js/save.js            Guardado y carga del progreso
js/core/config.ts     Equilibrio: armas, zombis, tienda, experiencia, red
js/core/util.ts       Utilidades (azar, geometría, almacenamiento)
js/core/version.ts    Versión del código (la inyecta Vite al compilar)
js/core/types.d.ts    Tipos compartidos (GameHost, Cmd…)
js/sim/               Lógica del juego; también la ejecuta el servidor (sin document)
  world.js            Ciudad procedural (sólo datos), colisiones y campo de flujo
  player.js           Movimiento, estamina, armas, recarga y retroceso
  zombies.js          Horda, tácticas (directo, flanco, espalda), rejilla espacial y ataques
  bullets.js          Balas con colisión segmento-círculo y perforación
  director.js         Oleadas y aparición de zombis
  rules.js            Reglas de combate compartidas con el servidor (bajas, botín, dorado, ácido)
  combat.js           Reglas de impacto de bala (compartidas con el servidor)
  combo.js            Racha de bajas
  upgrades.js         Mejoras al subir de nivel
  abilities.js        Clases y habilidades
  build.js            Barricadas, alambre de púas, torretas, granadas y molotov
  heavy.js            Mejoras y disparo de la torreta pesada (también el piloto automático)
  pickups.js          Munición, botiquines y cajas de armas
  robot.js            Robot de combate pilotable
js/render/            Todo el dibujo (una pieza por módulo de sim/ que se ve)
  scene.js            El fotograma completo, el tamaño del lienzo y la calidad adaptable
  camera.js           Cámara con sacudida y retroceso
  sprites.js          Todo el arte, generado por código
  world.js            Suelo por trozos, árboles, fuegos y postes
  zombies.js · bullets.js · pickups.js · build.js · robot.js · remote.js
  lighting.js         Oscuridad, linterna, farolas y fuegos
  particles.js        Partículas y restos en el suelo
  floaters.js         Números +$ y +XP que saltan sobre las bajas
js/net/
  mode.js             game.mode: Solo (con `detached`), OnlineClient, ServerMode
  protocol.js         Tablas y bits del protocolo (cliente y servidor)
  netcode.js          Predicción/reconciliación e interpolación (compartido con el servidor)
  snapshot.js         Codificador de la foto del mundo (servidor)
  remote.js           Lo que llega por la red: jugadores, zombis y balas de adorno
  online.js           Modo en línea: sala, predicción, interpolación y diagnóstico
js/ui/                Entrada (input.js), sonido (audio.js), música (music.js), cuentas (accounts.js)
                      y una pieza por pantalla: hud, shop, class, look, levelup, over, menu, account, board, lobby
public/               Manifiesto e íconos de la PWA
test/                 Pruebas del núcleo (node:test) · e2e/: pruebas de navegador (Playwright)
server/               Servidor autoritativo en línea (Node, TypeScript, Colyseus); pruebas y carga
deploy/               Servidor en una máquina virtual: Docker, Caddy (HTTPS), instalación y guía
docs/                 Documentación técnica y plan de refactorización
render.yaml           Despliegue del servidor en Render (histórico, respaldo)
```

Todo el arte y el sonido se generan por código: el proyecto no usa recursos de terceros.

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

Es un sitio estático: no hay paso de compilación.

1. Entra a [vercel.com](https://vercel.com) → **Add New… → Project** → importa este repositorio de GitHub.
2. Framework Preset: **Other**. Deja vacíos *Build Command* y *Output Directory*.
3. **Deploy**. Cada `git push` vuelve a publicar automáticamente.

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
    }
  }
}
```

4. Copia la URL de la base (`https://…firebaseio.com` o `…firebasedatabase.app`) en `ONLINE.url` de
   `js/config.js`. El juego usa la API REST: no hace falta ninguna librería ni clave.

Cualquiera que tenga el juego puede escribir en la lista; es una clasificación para jugar entre amigos,
no a prueba de trampas.

## Versiones y caché

`node tools/stamp.mjs` (o `npm run stamp`) sella `index.html` con un hash del código: cada módulo se
pide con `?v=<hash>` mediante un *import map*, así raw.githack.com y los navegadores no sirven archivos
viejos. Ejecútalo antes de cada commit. La versión aparece en el menú principal.

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
js/sprites.js       Todo el arte, generado por código
```

Todo el arte y el sonido se generan por código: el proyecto no usa recursos de terceros.

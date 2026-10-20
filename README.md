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
| Normal  | 42   | lenta         | Llega en hordas enormes (cientos por oleada)                  |
| Policía SWAT | 840 | lenta     | El 20% de los normales. Escudo al brazo; aguanta 20× más      |
| Velocista | 26 | rápida        | Desde la primera oleada. Te alcanza si no corres              |
| Gordo   | 130  | más lenta     | Más grande, aguanta unas 3× más disparos                      |

### Progreso guardado

El juego se guarda solo en el navegador cada pocos segundos, **también a mitad de ronda** (con los
zombis que siguen vivos), y al cerrar o minimizar la página. Al volver a abrir el sitio aparece
**Continuar** y sigues donde estabas. Al terminar cada ronda se crea además un punto de control: si
caes, puedes **continuar desde la última ronda superada**. *Nueva partida* borra el progreso.
El guardado vive en el navegador de cada dispositivo (y en cada sitio web por separado).

### Dinero y tienda

Cada zombi eliminado da dinero: **normal $1 · velocista $3 · gordo $5 · SWAT $10**. Al terminar cada oleada (después
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

Las barricadas se colocan delante de ti y las balas pasan por encima (también por encima de los coches).
Tú puedes atravesar tus propias estructuras; los zombis no. Los zombis las golpean hasta
romperlas o buscan otro camino para rodearlas.

Los zombis más rápidos rodean a los más lentos para adelantarlos.

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

En la sección **Munición** de la tienda compras cargadores de cualquier arma que tengas, de 1 en 1 o de
10 en 10. La reserva de balas no tiene límite.

### Controles

| Computadora | Celular |
|-------------|---------|
| `WASD` / flechas: moverse | Joystick virtual (lado izquierdo) |
| `Shift`: correr | Botón **Correr** (activa/desactiva) |
| Ratón: apuntar · clic: disparar | Botón de disparo con **apuntado automático** |
| `R`: recargar | Botón de recarga |
| `1`–`8` o `Q`: cambiar arma | Botón de cambio de arma |
| `F`: construir · `V`: cambiar bloque | Botón **Construir** |
| `G`: lanzar granada | Botón **Granada** (apunta solo) |
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

## Estructura

```
index.html          Interfaz: HUD, controles táctiles y pantallas
css/style.css       Estilos y diseño adaptable
js/main.js          Bucle principal, cámara, render, HUD y menús
js/config.js        Equilibrio: armas, zombis, experiencia
js/world.js         Ciudad procedural, colisiones, campo de flujo y suelo por trozos
js/player.js        Movimiento, estamina, armas, recarga y retroceso
js/zombies.js       Horda, rejilla espacial, separación y ataques
js/bullets.js       Balas con colisión segmento-círculo y perforación
js/director.js      Oleadas y aparición de zombis
js/upgrades.js      Mejoras al subir de nivel
js/build.js         Barricadas, alambre de púas y granadas
js/lighting.js      Oscuridad, linterna, farolas y fuegos
js/particles.js     Partículas y restos en el suelo
js/pickups.js       Munición, botiquines y cajas de armas
js/input.js         Teclado, ratón y controles táctiles
js/audio.js         Sonido sintetizado con Web Audio
js/sprites.js       Todo el arte, generado por código
```

Todo el arte y el sonido se generan por código: el proyecto no usa recursos de terceros.

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
| Normal  | 42   | lenta         | Llega en grandes cantidades                                   |
| Velocista | 26 | rápida        | Desde la oleada 2. Te alcanza si no corres                    |
| Gordo   | 130  | más lenta     | Más grande, aguanta unas 3× más disparos                      |
| Gigante | 1500 | muy lenta     | Su cuerpo **bloquea las balas** y protege a los que van detrás |

### Dinero y tienda

Cada zombi eliminado da dinero: **normal $1 · velocista $3 · gordo $5 · gigante $10**. Al terminar cada oleada (después
de elegir tu mejora de nivel) se abre la tienda:

| Objeto | Precio | Efecto |
|--------|--------|--------|
| Bloque de madera | $10 | Barricada básica (160 de resistencia) |
| Bloque de metal | $30 | Aguanta 3× más que la madera (520) |
| Valla de metal reforzado | $70 | Muro ancho casi indestructible (1400) |
| Alambre de púas | $20 | No bloquea, pero frena y hiere a los zombis |
| Granada | $90 | Explosión en área que arrasa grupos |

Las barricadas se colocan delante de ti y las balas pasan por encima (también por encima de los coches). Los zombis las golpean hasta
romperlas o buscan otro camino para rodearlas.

Los zombis más rápidos rodean a los más lentos para adelantarlos: nadie se queda atascado detrás de un gigante.

Armas: pistola (munición infinita), subfusil, escopeta y rifle. Se desbloquean con mejoras de nivel o en
las cajas que suelta cada gigante.

### Controles

| Computadora | Celular |
|-------------|---------|
| `WASD` / flechas: moverse | Joystick virtual (lado izquierdo) |
| `Shift`: correr | Botón **Correr** (activa/desactiva) |
| Ratón: apuntar · clic: disparar | Botón de disparo con **apuntado automático** |
| `R`: recargar | Botón de recarga |
| `1`–`4` o `Q`: cambiar arma | Botón de cambio de arma |
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

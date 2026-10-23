# HIPERSONIC — supervelocidad y destrucción

Juego 2D en vista cenital para el navegador (computadora y celular). No necesita
compilación: es un sitio estático con módulos de JavaScript.

```bash
npx http-server -c-1 -p 8080 .   # desde la raíz del repositorio
# abre http://localhost:8080/hipersonic/
```

## Controles

| Computadora | Celular |
|-------------|---------|
| `WASD` / flechas: moverse | Joystick (mitad izquierda) |
| `Shift` (mantener): cargar la hipervelocidad | Botón **HIPER** (mantener) |
| Clic / `J`: golpe | Botón **GOLPE** |
| `Espacio` / clic derecho: Sonic Time | Botón **SONIC** |
| `Esc` / `P`: pausa | Botón de pausa |

## Dirección artística (qué hay implementado)

- **Personajes por piezas** (`js/art/characters.js`, `js/pose.js`): torso, cabeza, manos y
  zapatos pintados con contorno, volumen y textura de tela, guardados en el atlas; brazos y
  piernas se trazan cada fotograma. Animaciones de caminar, correr, girar (la cabeza gira
  antes que el cuerpo), golpear, reaccionar a impactos y levantarse. 26 civiles y 8 enemigos
  con ropa, peinados, gorras, mochilas y armas distintas.
- **Protagonista**: casco aerodinámico blanco con visor cian y aletas, traje azul con rayos,
  guantes blancos y bufanda naranja con física.
- **Ragdoll caricaturesco** (`js/ragdoll.js`): siete puntos con altura, rebotes en suelo y
  paredes, cuerpos que derriban a otros, estrellitas sobre los noqueados.
- **Ciudad** (`js/world.js`, `js/art/city.js`): asfalto con grietas, parches, manchas y
  frenadas; aceras de baldosas individuales; líneas de carril, líneas de alto y pasos
  peatonales; semáforos que funcionan; farolas, árboles, bancas, bocas de incendio,
  alcantarillas con vapor, toldos, palomas; techos con pretil, aire acondicionado,
  tragaluces, tinacos, paneles solares; parques con fuente, plazas con estatua y
  estacionamientos.
- **Vehículos** (`js/art/vehicles.js`, `js/traffic.js`): sedán, compacto, taxi, SUV,
  patrulla con sirena, furgoneta, pickup, camión y autobús. Circulan, respetan semáforos,
  frenan, pitan; al golpearlos derrapan, giran, se abollan, rompen cristales y echan humo.
- **Iluminación** (`js/lighting.js`): noche azulada, luz cálida de farolas, faros, luces de
  freno, sombras proyectadas por edificios, árboles y postes, y sombras de los peatones
  que se alargan con la farola más cercana. El protagonista siempre tiene luz propia.
- **Supervelocidad**: estelas luminosas, imágenes residuales, rayos y chispas de energía,
  marcas de quemado en el asfalto, desenfoque direccional, líneas de velocidad, cámara que
  se adelanta y se aleja, y **barrera del sonido** con onda de choque que distorsiona la
  imagen.
- **Sonic Time**: el color se drena desde el protagonista hacia fuera y todo queda azul y
  congelado (peatones, coches, partículas suspendidas, semáforos). El protagonista se
  mueve con normalidad; cada golpe queda marcado con un destello y una retícula, y al
  soltar el poder los golpes acumulados se ejecutan en cascada.

## Recursos gráficos

Todo el arte se pinta por código al arrancar y se empaqueta en un atlas de texturas
(`js/atlas.js`). Para ver el atlas abre `dev/atlas.html`; para ver los personajes de cerca,
`dev/chars.html`. Cualquier sprite se puede sustituir por un PNG pintado a mano: ver
`assets/README.md`.

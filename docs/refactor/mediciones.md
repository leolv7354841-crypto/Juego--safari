# Mediciones base (commit ffef8f0, etiqueta `antes-refactor`)

Medido sin servidor, sumando archivos:

| Concepto | Valor |
|---|---|
| `js/*.js` (26 archivos) | 471 KB (140 KB comprimido con gzip) |
| `js/vendor/` (Colyseus) | 222 KB |
| `css/style.css` | 41.5 KB |
| `index.html` | 21.7 KB |
| `assets/` | 37 KB |
| Líneas: main.js 2201, world.js 1544, sprites.js 1286, coop.js 1050 | |

Pendiente (requiere dispositivo real): tiempo de carga en red móvil y FPS en celular de gama media.
Cómo medir: Chrome DevTools > Performance con throttling "Mid-tier mobile", o Safari Web Inspector en iPhone; anotar FPS con 100+ zombis.

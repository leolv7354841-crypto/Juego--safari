# Recursos gráficos de HIPERSONIC

Todo el arte del juego se pinta por código al arrancar (`js/art/`) y se empaqueta en un
**atlas de texturas** (`js/atlas.js`): hojas de 2048 px con todos los sprites. No hace falta
ningún archivo de imagen para jugar.

## Sustituir un sprite por un PNG pintado a mano

1. Abre `dev/atlas.html` en el navegador: muestra cada hoja del atlas y el nombre de cada
   sprite con su tamaño en unidades del mundo.
2. Pinta tu PNG con la misma proporción (se recomienda 3× el tamaño en unidades, el frente
   del personaje o vehículo mirando a la derecha y el ancla en el centro).
3. Guárdalo en `assets/sprites/` y decláralo en `assets/manifest.json`:

```json
{
  "sprites": {
    "hero.torso": "sprites/hero_torso.png",
    "veh.sedan.#8a2f2a": "sprites/sedan_rojo.png"
  }
}
```

Al cargar, el juego dibuja el PNG encima del hueco de ese sprite en el atlas, así que las
animaciones, sombras y efectos siguen funcionando igual.

## Nombres útiles

| Prefijo | Qué es |
|---------|--------|
| `hero.torso`, `hero.head`, `hero.hand`, `hero.shoe`, `hero.lying` | Partes del protagonista (de pie y tumbado) |
| `civN.*`, `enN.*` | Partes de civiles y enemigos (mismo esquema) |
| `veh.<modelo>.<color>` | Vehículos (sedan, hatch, taxi, suv, police, van, pickup, truck, bus) |
| `tree0`…`tree5` | Copas de árboles |
| `prop.*` | Mobiliario urbano (bench, bin, hydrant, manhole, lampHead…) |
| `sig.r`, `sig.y`, `sig.g` | Semáforo en rojo, ámbar y verde |

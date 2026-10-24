# Etapa 4 — Separar simulación y dibujo (grande, central)
Rama: `refactor/etapa-4-sim-render`

- [ ] Mover `GUN_REACH` (sprites.js) y `RELOAD_STEPS` (audio.js) a `config.js`.
- [ ] `js/net/protocol.js`: `TYPES`, `PICKS`, `PARTICLE_SKIP`, `SFX_SYNC`, `DECAL_SYNC`, bits `IN_*` (hoy salen de coop.js).
- [ ] Carpetas: `js/core/` (config, util), `js/sim/`, `js/render/`, `js/net/`, `js/ui/`.
- [ ] Un PR por módulo: 1 pickups, 2 bullets (`draw`, `drawRocket`), 3 zombies (`Horde.draw`), 4 build (7 `draw*`), 5 world (generar solo datos; dibujar después).
- [ ] Actualizar regla de CLAUDE.md: el dibujo va en `js/render/<x>.js` (cambia la convención: requiere aprobación).
Listo cuando: el servidor no importa `sprites` ni `audio`, se borra `shim.ts` y una prueba confirma que `sim/` carga en Node sin `document`.
Paralelo: pickups y bullets en sesiones separadas.

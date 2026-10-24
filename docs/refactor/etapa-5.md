# Etapa 5 — Dividir main.js (grande)
Rama: `refactor/etapa-5-main`

Extraer en orden: 1 Camera → `render/camera.js`; 2 íconos → `ui/icons.js`; 3 saveProgress/loadProgress → `save.js`; 4 HUD → `ui/hud.js`; 5 tienda → `ui/shop.js`; 6 cuentas y ranking → `ui/account.js`, `ui/board.js`; 7 salas → `ui/lobby.js`. Cada UI conecta sus botones (hoy `bindUi`).
- [ ] Reglas de combate compartidas en `sim/rules.js` (killZombie, recompensas, botín, dorado, ácido, cohetes); `ServerSim` las reutiliza.
- [ ] Máquina de estados como tabla `{ estado: { enter, exit, update } }`.
Listo cuando: `main.js` < ~500 líneas, solo coordina.
Paralelo: módulos de UI en sesiones separadas tras la tabla de estados.

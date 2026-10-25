# Etapa 5 — Dividir main.js (grande)
Rama: `refactor/etapa-5-main`

Extraer en orden: 1 Camera → `render/camera.js`; 2 íconos → `ui/icons.js`; 3 saveProgress/loadProgress → `save.js`; 4 HUD → `ui/hud.js`; 5 tienda → `ui/shop.js`; 6 cuentas y ranking → `ui/account.js`, `ui/board.js`; 7 salas → `ui/lobby.js`. Cada UI conecta sus botones (hoy `bindUi`).
- [x] Camera → `render/camera.js`.
- [x] Íconos (`ITEM_ICONS`, `SHORT`, `CROWN_SVG`) → `ui/icons.js`.
- [x] `saveProgress`/`loadProgress` → `save.js`.
- [x] HUD (`updateHud`, `set`, avisos, dinero flotante) → `ui/hud.js`, que conecta sus botones (`bindHud`).
- [x] Tienda → `ui/shop.js` (`bindShop`).
- [x] Cuentas y ranking → `ui/account.js` y `ui/board.js` (`bindAccount`, `bindBoard`).
- [x] Salas del cooperativo y en línea → `ui/lobby.js` (`bindLobby`).
- [x] Además, para llegar a un `main.js` pequeño: `ui/class.js`, `ui/look.js`, `ui/levelup.js`, `ui/menu.js`, `ui/over.js`, `actions.js` (acciones del jugador), `events.js` (eventos de combate del jugador local) y `render/scene.js` (dibujo del fotograma, lienzo y calidad).
- [x] Reglas de combate compartidas en `sim/rules.js` (killZombie, recompensas, botín, dorado, ácido, cohetes, golpes, robot); `main.js` (vía `events.js`) y `ServerSim` las reutilizan. Pruebas en `test/rules.test.js`.
- [x] Máquina de estados como tabla `{ estado: { screen, music, enter, exit, update } }` en `states.js`. Pruebas en `test/estados.test.js`.
Listo cuando: `main.js` < ~500 líneas, solo coordina. Quedó en ~310 líneas.
Paralelo: módulos de UI en sesiones separadas tras la tabla de estados.

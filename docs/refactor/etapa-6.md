# Etapa 6 — Red (grande, decidir antes)
Rama: `refactor/etapa-6-red`

Opción B (recomendada): mantener ambos modos y unificar.
- [ ] `net/remote.js` común: `Interp` para zombis y jugadores (reemplaza los dos `applyZombies`), repetir efectos, `drawPeers`, `drawRemoteBullets`, `stats`.
- [ ] Mismo formato de snapshot para host coop y `ServerSim`.
- [ ] `game.mode` (`Solo`, `CoopHost`, `CoopGuest`, `OnlineClient`) con `canBuild()`, `authority()`; reemplaza ~36 ramas de `coop.isHost`/`coopRun`/`remoteSim`.
Opción A (futuro): quitar P2P; exige antes la fase 2 online (tienda, construcción, granadas, robot, niveles).
Skills: `/security-review` para `server/`.

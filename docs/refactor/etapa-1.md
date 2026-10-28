# Etapa 1 — Red de seguridad (mediana)
Rama: `refactor/etapa-1-red-de-seguridad`

- [x] Biome: `biome.json` con reglas suaves; commit que SOLO cambia formato; su hash en `.git-blame-ignore-revs`. Nada corre en paralelo con este paso.
- [x] Pruebas del núcleo con `node:test` en `test/`: `bulletHit`; empaquetado de mensajes y `Predictor`; `World` con semilla fija (`pointBlocked`, `rectFree`); cola del `Director`; `Player.move` determinista. Reutilizan el shim del servidor.
- [x] Playwright (Chromium y WebKit): carga sin errores de consola; partida solo (moverse y disparar); tienda entre rondas; guardar, recargar y continuar; vista móvil táctil; dos páginas en la misma sala online contra el servidor local.
- [x] CI: Biome, pruebas de la raíz y Playwright.
Listo cuando: romper a propósito `bulletHit` o `Player.move` hace fallar una prueba.
Skills: `/run`, `/code-review medium`.

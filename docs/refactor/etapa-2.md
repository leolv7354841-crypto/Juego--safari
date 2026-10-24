# Etapa 2 — Vite (mediana, riesgo de despliegue)
Rama: `refactor/etapa-2-vite`

- [x] `vite.config.js`: `base: './'` (se sirve en `yeyo.games/deadzone/`), `outDir: 'dist'`, puerto 8080.
- [x] `index.html`: quitar el loader; `<script type="module" src="js/main.js">`.
- [x] Colyseus: `@colyseus/sdk` de npm con `import()` dinámico en `online.js`; borrar `js/vendor/colyseus.js`.
- [x] `vercel.json`: `no-cache` para `index.html`, `immutable` para `/assets/*`; `version.js` queda como aviso liviano; revisar que el proxy de yeyo.games respete los encabezados. (el proxy de yeyo.games: comprobar con la preview)
- [x] Eliminar `tools/stamp.mjs`, `tools/build.mjs` y el paso de sellado en CI.
- [x] Actualizar `npm run dev`, `.claude/launch.json`, `buildCommand` de Vercel.
- [x] El servidor sigue importando `js/` sin cambios.
- [ ] Verificar el juego como Artifact de Claude (nube en `accounts.js`). (pendiente: probar en Artifact, Safari iPhone y yeyo.games/deadzone/ con la preview de Vercel)
Listo cuando: preview de Vercel funciona en Chrome, Safari iPhone y vía `yeyo.games/deadzone/`; Playwright pasa contra `vite preview`.
Si sale mal: rollback instantáneo en Vercel.

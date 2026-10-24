# Etapa 3 — Tipos con checkJs (mediana)
Rama: `refactor/etapa-3-checkjs`

- [x] `tsconfig.json` raíz: `allowJs`, `checkJs`, `noEmit`, strict apagado. `npm run typecheck` en CI.
- [x] `js/types.d.ts` / JSDoc: `Zombie`, `Bullet`, `Weapon`, `Snapshot`, `Cmd` y sobre todo `GameHost` (`targets`, `hitZombie`, `killZombie`…): contrato que cumplen navegador y `ServerSim.ts`.
- [x] Todo `js/` se verifica con `checkJs: true` (sin `// @ts-check` por archivo: el `tsc` estricto del servidor revisaría esos archivos). Pendientes con `// @ts-nocheck`: accounts, audio, coop, online, particles, upgrades (~200 errores; se tipan en etapas siguientes).
  Los campos que otros módulos asignan desde fuera (`Player.look/remote/inRobot`, `Director.coop/crowd`…) se declaran con JSDoc en el constructor (`this.x;` sin efecto).
Skills: typescript-native-lsp, `/simplify`.

# Etapa 3 — Tipos con checkJs (mediana)
Rama: `refactor/etapa-3-checkjs`

- [ ] `tsconfig.json` raíz: `allowJs`, `checkJs`, `noEmit`, strict apagado. `npm run typecheck` en CI.
- [ ] `js/types.d.ts` / JSDoc: `Zombie`, `Bullet`, `Weapon`, `Snapshot`, `Cmd` y sobre todo `GameHost` (`targets`, `hitZombie`, `killZombie`…): contrato que cumplen navegador y `ServerSim.ts`.
- [ ] `// @ts-check` archivo por archivo: config, util, combat, netcode, bullets, director, player, pickups, zombies, build, world, main (al final).
Skills: typescript-native-lsp, `/simplify`.

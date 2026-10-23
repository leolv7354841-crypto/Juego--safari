# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Dead Zone" is a top-down 2D zombie survival game that runs in the browser (Chrome/Safari, desktop and phone). It is a static site: plain ES modules, no bundler, no framework, no npm dependencies. All art and sound are generated in code (`js/sprites.js`, `js/audio.js`). UI text, README and game copy are in Spanish; keep new player-facing text in Spanish.

## Commands

- Run locally: `npm run dev` (serves the repo on http-server at http://localhost:8080 with caching disabled). Opening `index.html` by double-click does not work because the modules need a server.
- Stamp the build: `npm run stamp` (or `node tools/stamp.mjs`). Run it before every commit. It rewrites `js/version.js` and the loader block in `index.html` with a hash of `js/*.js` and `css/style.css`.
- There is no build, lint, or test setup. Verify changes by running the game in the browser.

## Architecture

**Entry and loop.** `js/main.js` defines the `Game` class, which owns the state machine (`menu`, `play`, `pause`, `levelup`, `shop`, `over`, `account`, `board`, `coop`), the main loop, camera, HUD, shop rendering, and save/load. Most other modules are plain objects or classes that `Game` holds and calls into; they reach back to the game through a `game` argument (for example `Structures.explode(game, …)`, `Director.nextRound(game)`).

**Stamp and cache busting.** `index.html` has a generated loader that builds an import map so each module is requested as `./js/x.js?v=<hash>`. `js/version.js` holds the same hash; on startup, a mismatch means a CDN served stale files and the game reloads itself with fresh URLs. Changes to any module or `style.css` only reach players after `npm run stamp`.

**Data and balance.** `js/config.js` holds all tuning: weapons, zombie stats, bounties, shop prices, drops, robot, rocket, golden zombie, Firebase `ONLINE` settings. Change numbers there rather than in the logic files.

**World.** `js/world.js` builds a procedural city in chunks (`setChunkScale`, `maxChunks`), provides collisions (`pointBlocked`, `rectFree`), reachability checks, a flow field toward the player (`updateFlow`), and dynamic obstacles (`addDynamic`) that player-built structures register into.

**Horde and waves.** `js/zombies.js` (`Horde`) runs all zombies: tactics (direct, flank, back-approach), a spatial grid (`horde.grid.query`) used by bullets, explosions, turrets and fire, and attacks. `js/director.js` drives rounds: a queue of zombie types spawned at the screen edges, a `waiting`/`active` state, and the "next round" button. Golden zombie and spawn logic live in `main.js` (`spawnGolden`).

**Combat and structures.** `js/player.js` (movement, stamina, weapons, reload, recoil), `js/bullets.js` (segment-circle hit tests, piercing), `js/build.js` (`Structures`: placement on a 20 px grid, stacking via `layer`, damage that targets the top piece, traps, grenades, molotov fires, rockets stuck to fat zombies, acid, turrets, explosions). `js/robot.js` is a pilotable robot that absorbs hits while the player is on board; `main.js` routes its damage.

**Rendering.** `main.js` draws in world space with a camera that applies shake and kick; `js/lighting.js` handles darkness, flashlight and lamps; `js/particles.js` handles particles and ground decals; `js/pickups.js` for ammo, medkits, and crates. `js/input.js` unifies keyboard, mouse and touch (`input.mode === 'touch'` toggles the touch UI class on the root).

**Persistence and accounts.** `js/accounts.js` manages accounts (name + 4-digit PIN), per-account localStorage keys (`saveKey()` for the rolling save, `checkKey()` for the checkpoint written at the end of each wave), and personal bests. Saves happen on a timer, at wave end, and on `pagehide`/`visibilitychange`. Dying deletes the run save but keeps the record. When the game runs as a Claude Artifact with a database, `accounts.js` also mirrors saves and scores to the cloud (`cloudSave`, `cloudPull`, `cloudClear`); outside Artifacts that path is inactive. The global leaderboard uses Firebase Realtime Database through its REST API; `ONLINE.url` in `js/config.js` must be set for it to work.

**Co-op (2 players).** `js/net.js` connects two phones with a 4-letter room code. It is pure P2P: all game traffic goes over two WebRTC data channels (`rel` reliable/ordered, `fast` unordered without retransmits; `stun` servers from `ICE`). Firebase `rooms/<code>` is only used for signaling (offer/answer SDP) and is deleted once the channels open; if they do not open within `OPEN_LIMIT`, joining fails with the `directa` error (there is no relay or TURN fallback). `js/coop.js` makes the host the simulation authority: the host runs the world and sends snapshots about 8–12 times per second; the guest renders them with prediction and sends inputs back. Code often branches on `coop.isHost`, `coop.isGuest`, `coop.active`, and `coopRun`. A guest's bullets are cosmetic; damage is computed on the host (see the guard in `hitZombie`). Preserve that split when adding combat features.

## Firebase rules for the online modes

The README contains the Realtime Database rules needed for the global leaderboard and co-op rooms. If you change the shape of `scores` or `rooms` writes in `accounts.js` or `net.js`, update the rules in the README to match.

## Conventions

- Plain ES modules with `import`/`export`; no transpilation. Browser APIs only.
- Comments and UI strings are in Spanish; the code is otherwise terse and written in the same style as the surrounding file.
- Keep rendering code in the module that owns the object (e.g. structure drawing in `build.js`), not in `main.js`.

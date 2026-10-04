# Games

Browser games that ship as part of the site. Everything runs client-side; no backend.

## Adding a game

1. Put the code in `src/games/<slug>/` with an entry module (e.g. `main.ts`).
2. Add a page at `src/pages/games/<slug>.astro`. Use a standalone HTML shell (not `BaseLayout`) for full-screen games, add `data-pagefind-ignore="all"` to `<body>`, and load the entry with `<script>import '../../games/<slug>/main';</script>`.
3. Register it in `src/data/games.ts` so it appears on `/games`. Card links use `data-astro-reload` so the site's view transitions don't try to swap into a full-screen game.

## Year Zero

A turn-based civilization game where the history is generated from what actually happens.

| Folder | Contents |
| --- | --- |
| `core/` | Hex grid math, language/name generator |
| `art/` | Kenney hex tiles (`kenney/`, packed into `sprites.png` + `sprites.json`) and generated game-icons paths (`icons.ts`) |
| `data/` | Static tables: terrain, techs, units, buildings, governments, traits, eras |
| `sim/` | The simulation. DOM-free and deterministic; all state lives in `GameState` (plain data + typed arrays) |
| `render/` | Canvas map renderer (cached static layer, on-demand frames), minimap, pointer input |
| `ui/` | HUD, panels, screens and modals (vanilla TS, small `h()` helper) |

Key ideas:

- **Turns only.** `sim/turn.ts` runs AI, cities, economy, diplomacy, events and identity once per turn, yielding to the browser between civilizations. Nothing simulates per frame.
- **Determinism.** A world code (`seed/size/type/rivals`) reproduces the same world and peoples; all randomness goes through `Game.rng`.
- **History.** `sim/history.ts#logHistory` records events with the names of the moment; `sim/chronicle.ts` turns the record into prose.
- **Saves.** `sim/save.ts` serializes the whole state (typed arrays as base64), gzip-compressed in `localStorage`; export/import use plain JSON.

Testing aids: open `/games/year-zero/?debug` to expose `window.yz`; `await yz.debugAutoplay(200)` lets the AI govern the player for 200 years.

## Automatic mode

Every game has an **AUTO** toggle that hands control to an AI you can watch, and take back at any time:

| Game | Who plays | Where |
| --- | --- | --- |
| Year Zero | The civilization AI governs your people and ends a year every couple of seconds | `ui/app.ts#setAuto` (uses `endTurn(..., { autoPlayer: true })`) |
| Micro City | A bot mayor lays out streets, zones by demand and builds utilities and services | `sim/bot.ts` |
| First Contact | An auto-linguist reads evidence, advises the Council, talks to the aliens and writes the report, with its own mistakes | `sim/auto.ts` |
| Primordial | A director plays god (seeding, meteors, climate, mutation storms) and keeps the camera on interesting creatures | `sim/director.ts` |
| Slingshot | An autopilot simulates hundreds of launches and flies the best | `sim/autopilot.ts` |

## Shared code

`src/games/shared/` holds what every game uses: the seeded `Rng` and `Noise2D`, a tiny DOM toolkit (`h()`, downloads, file picking), `SaveStore` (gzip-compressed save slots in `localStorage`, typed arrays as base64), `chart.ts` (small canvas line charts) and `gameicons.ts` (Path2D/SVG helpers and credits for game-icons.net silhouettes).

## Art and credits

- **game-icons.net** (CC BY 3.0, credit every author): list the icons a game uses in `art/icons.manifest.json` (`key: "author/icon-name"`), then generate the module:
  ```sh
  git clone --depth 1 https://github.com/game-icons/icons /tmp/game-icons
  node scripts/game-icons.mjs /tmp/game-icons src/games/<slug>/art/icons.manifest.json src/games/<slug>/art/icons.ts
  ```
  Each game's Credits screen lists authors and icons from the manifest automatically. Add any new author to `ICON_AUTHORS` in `shared/gameicons.ts`.
- **Kenney** (CC0): Year Zero's hex tiles are packed into one atlas (one image decode instead of dozens):
  `node scripts/sprite-atlas.mjs src/games/year-zero/art/kenney src/games/year-zero/art/sprites.png src/games/year-zero/art/sprites.json`
- Every game shows its credits on the title screen and in a Credits dialog, and `src/data/games.ts` lists them on the `/games` card.

## Micro City

A city builder: roads, zones, utilities, services, traffic and a city that explains why it is unhappy.

| Folder | Contents |
| --- | --- |
| `sim/` | DOM-free simulation. `CityState` (typed arrays per tile) plus derived layers on `City`. Monthly tick in `step.ts` |
| `render/` | Isometric canvas renderer: cached ground and object layers (cars drive between them), procedural buildings, flat map for far zoom |
| `ui/` | HUD, tool trays, panels (inspect, city health, budget, stats, districts, history, news, challenge), menus |

Key ideas:

- **Monthly tick, spread over frames.** `stepPhases()` is a generator: utilities, then traffic, then environment, then growth, events and budget, so a big city never stalls a frame.
- **Everything travels by road.** Power, water and sewage flow along road-connected networks; police, fire, health, schools and buses reach lots by driving (`coverage.ts`). Lots connect to a road within three tiles.
- **Traffic** (`traffic.ts`): 12×12-tile districts, Dijkstra over road tiles, a gravity model for commutes and shopping, BPR congestion fed back into next month's travel times, transit share from bus/metro coverage at both ends.
- **Happiness is explained.** `environment.ts` keeps happiness as named factors; the City health panel ranks them and suggests fixes.
- **Disasters come from design** (`events.ts`): floods flow from the water through low ground (flood walls block, drains lower the water), fires spread without fire coverage, epidemics follow missing clinics. Indian mode has monsoons and ₹; generic mode has spring storms and $.

Testing aids: `/games/micro-city/?debug` exposes `window.mc`; `mc.debugAutoplay(240)` lets a simple bot mayor (`sim/bot.ts`) build for 20 years.

## First Contact

A language game: decode a generated alien language from context and find out why they came.

| Folder | Contents |
| --- | --- |
| `lang/` | The 38 concepts in semantic families with context tags; the glyph generator (family base shape + marks) and numerals |
| `sim/` | `world.ts` generates species, characters, grammar (word order, number base), the hidden truth and 30 days of evidence; `game.ts` holds hypotheses, confidence, messages, Council decisions and the final assessment; `reply.ts` is how the aliens read human messages |
| `ui/` | Observatory, translator, glyph sheet, dictionary, aliens, archive, message composer, journal and the finale |

Key ideas:

- **Hypotheses, not answers.** The player assigns meanings to glyphs; confidence comes from how well the contexts where a glyph appeared fit the guess, plus family resemblance between glyphs. It can be high and still wrong.
- **They read what you wrote.** Replies are built from the true meanings of the glyphs you send, so a misread word can say something you never meant.
- **One seed, one contact.** The same seed reproduces the same glyphs, grammar, number base, history and truth; the save stores only the player's state.

Testing aids: `/games/first-contact/?debug` exposes `window.fc` (the app; `fc.game` is the game).

## Primordial

An evolution sandbox: creatures with genomes forage, hunt, flock and breed in a sea, and natural selection does the rest.

| Folder | Contents |
| --- | --- |
| `sim/genes.ts` | The 12-gene genome, mutation, species distance and Latin-ish names |
| `sim/world.ts` | The sea: creatures in typed arrays (structure of arrays) with a spatial hash, plants and carrion on a grid, temperature from north (cold) to south (hot), speciation, powers, milestones |
| `sim/director.ts` | The automatic god: interventions and camera subjects |
| `render/`, `ui/` | Canvas renderer (plant field image, organisms drawn from their genes) and the app (tools, species, tree of life, chronicle, stats) |

Key ideas: a fixed 1/30 s step, as many per frame as fit in 12 ms. Carrion makes scavenging pay, which gives grazers a gradual path to becoming hunters. Species split when a lineage, not one odd mutant, drifts far from its centroid. Testing aid: `/games/primordial/?debug` exposes `window.pr`; `pr.debugRun(300)` runs 300 sim seconds.

## Slingshot

A gravity puzzle: launch probes through generated star systems.

| Folder | Contents |
| --- | --- |
| `sim/physics.ts` | Bodies on analytic circular orbits, the probe integrated at 1/240 s, capture and collision rules, `predict()` for the aiming preview |
| `sim/autopilot.ts` | Coarse sweep over wait time, angle and power, then local refinement |
| `sim/levels.ts` | Procedural systems (twin suns, moons, belts, black holes). Each is solved before it is played; beacons are placed along that solution so three stars are always possible, and the solution is kept for the autopilot |
| `render/`, `ui/` | Canvas renderer and the app (aiming, flight, results, level select, progress) |

Testing aid: `/games/slingshot/?debug` exposes `window.sl`.


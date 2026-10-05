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
- **The unexplored sea is a chart, not a fill.** Uncharted water gets cloudy mottling, faint sounding circles, a camera-anchored hex lattice and paper grain, so most of an early map reads as an unfinished survey rather than one flat colour.

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
| Wildborn | An AI trainer explores, observes, befriends or battles, trains, feeds toward an evolution branch and breeds | `sim/auto.ts` |
| Tiny Universe | A director sets the pace (slow for young civilizations, fast for empty eons), flies the camera to life and civilizations, and plays god now and then (mostly kindly) | `sim/director.ts` |

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

The sea has depth: the plant field carries fine grain so open water is never one flat tone, a vertical gradient darkens the deep, three slow light shafts drift across the frame, and a soft vignette closes the edges.

## Slingshot

A gravity puzzle: launch probes through generated star systems.

| Folder | Contents |
| --- | --- |
| `sim/physics.ts` | Bodies on analytic circular orbits, the probe integrated at 1/240 s, capture and collision rules, `predict()` for the aiming preview |
| `sim/autopilot.ts` | Coarse sweep over wait time, angle and power, then local refinement |
| `sim/levels.ts` | Procedural systems (twin suns, moons, belts, black holes). Each is solved before it is played; beacons are placed along that solution so three stars are always possible, and the solution is kept for the autopilot |
| `render/`, `ui/` | Canvas renderer and the app (aiming, flight, results, level select, progress) |

Testing aid: `/games/slingshot/?debug` exposes `window.sl`.

The sky is drawn, not left black: a seeded procedural nebula (soft coloured gas clouds and bright knots, tiled with slight parallax) sits behind 720 stars in three depth layers — blue-white, warm giants and red dwarfs — that twinkle and drift against the camera as you pan and zoom.

## Wildborn

A creature game where a creature's life shapes its evolution: where it lives, what it eats, who it fights and what it loves decide which branch it takes.

| Folder | Contents |
| --- | --- |
| `data/species.ts` | Affinities and the `STRONG` table, 22 abilities, 20 species (5 families × base + 3 evolutions) with stats, likes, art parameters and evolution branch drivers, 6 biomes with wild tables and exposures, items and foods, and the rarity tiers (Common → Unique) |
| `sim/game.ts` | DOM-free state and simulation: world clock and weather, exploration, wild encounters, Companion Link capture, raising (train/play/rest/feed), life-driven evolution, breeding with mixed genomes and rare variants, quests, achievements and saves |
| `sim/battle.ts` | Turn-based 1v1 battles with switching: three abilities per creature, affinity strength, biome boost and weather modifiers, status effects, events with structured HP changes for the UI, and a wild AI that heals, uses status, or flees when scared |
| `sim/auto.ts` | The automatic trainer: one visible action per tick — explore, observe, befriend, battle (only fair fights, with its best match-up), train, feed toward a chosen branch, breed |
| `render/creature.ts` | Procedural SVG creature art built from layers per family (body, head, ears, tail, pattern, eyes, feature), coloured by species hue plus per-individual variation and crystal/golden/void variants |
| `render/map.ts` | The illustrated node map (village + 6 regions) with a day/night sky and weather |
| `ui/` | `app.ts` (screens, encounters, battles, overlays, automatic mode) and `screens.ts` (bars, rows, cards) |

Key ideas:

- **Evolution is earned, not bought.** Every creature accumulates exposure counters (thermal, aquatic, mineral, organic, night, storm, wins, losses, explore, play, ruins) from the places it goes and the things it does. From level 8, `sim/game.ts#evaluateEvolution` scores the three branches of its family from those counters plus personality; the best branch past a threshold evolves it. Branches stay "???" in the Field Guide until discovered.
- **Capture is a bond.** Companion Link has no capture items: its chance comes from trust, HP, fear, stress and personality, so you befriend by observing, feeding and playing.
- **Rarity is not power.** Species carry the design doc's tiers (Common, Uncommon, Rare, Ancient, Mythic) from how often they show up in the wild; a rare mutation (crystal, golden, void) makes any creature Unique. Tiers show on rows, the field guide and the creature screen.
- **Lineages.** Two creatures of one family with a high bond lay an egg whose genome mixes the parents' (plus a chance of a rare variant). The lineage view shows ancestors and descendants, and notes the generation the creature carries a trait from.
- **Battles give feedback.** Hits shake the fighter's card, heals glow, damage and healing float up as numbers, and the log carries the words; the events carry structured HP changes so the UI never parses text.
- **Deterministic world.** A seed reproduces the same regions and species tables; saves are JSON (gzip in `localStorage` via `SaveStore`) and exportable.

Testing aids: `/games/wildborn/?debug` exposes `window.wb`; `wb.debugAutoplay(300)` lets the automatic trainer play 300 steps.

## Tiny Universe

A universe you can play with: a galaxy forms from hot gas, stars live and die, life climbs toward minds, and civilizations rise, meet and fall. The player creates (matter, life, knowledge, protection), destroys (asteroids, supernovae) or just watches.

| Folder | Contents |
| --- | --- |
| `sim/params.ts` | The four creation dials, challenge universes (Empty, Chaos, Life everywhere, Intelligence, Great Filter, Ancient, Contact), daily goals and the daily seed |
| `sim/stars.ts` | Initial mass function, luminosity, lifetime (∝ M^-2.5), phases (protostar → main sequence → giant → white dwarf / neutron star / black hole), colours |
| `sim/planets.ts` | Systems generated from a star's mass and metals (no rocky worlds without heavy elements), temperature with greenhouse, habitability, planet kinds |
| `sim/life.ts` | A biosphere as a tree of lineages: branching, extinction, oxygen from photosynthesis, stage climbs (microbes → complex → land → tool users → intelligence), mass extinctions |
| `sim/civ.ts` | Civilizations: personality, their own order of late technologies, era durations, collapse risk at each era (the Great Filter), dark ages, quiet civilizations, chronicle texts |
| `sim/universe.ts` | The `Universe`: a 96×96 gas and metals grid, star formation and recycling, supernovae that enrich the gas and sterilize neighbours, gamma-ray bursts, life and civilization steps, colonies, first contact, the Silence, interventions, discoveries, achievements, history, save state |
| `sim/discoveries.ts` | The Observatory catalog (48 discoveries with rarity and hints), achievements and the cosmic eras |
| `sim/director.ts` | The automatic mode |
| `render/renderer.ts` | Galaxy view (gas glow, stars by temperature, life rings, civilization networks, effects) and star-system view (orbits, habitable zone, planets, stations, Dyson swarms) |
| `render/planet.ts` | Pixel-drawn planet portraits (continents, oceans, ice, forests, clouds, gas bands, city lights), cached |
| `ui/` | `app.ts` (loop, input, title and creation screens, discovery cards, auto, saves), `panels.ts` (inspect, observatory, life & civilizations, history, profile) and `audio.ts` (the soundscape) |

Key ideas:

- **Statistical, not N-body.** Up to 2,400 star slots (long-dead remnants with no story are recycled), about 5,000–8,000 planets generated from the seed per star, life checked only on candidate worlds. Time is in millions of years; `advance()` runs 2 Myr steps, and civilizations advance in 20,000-year chunks so colonies, contact and the Silence keep up even at a billion years per second.
- **Heavy elements matter.** The first stars have no metals, so no rocky planets. Supernovae return gas enriched with metals to the grid, which diffuses, so later stars get rocky worlds: the death of a star makes life possible.
- **The Great Filter.** Each era ends with a collapse roll shaped by personality (military, cooperation, ecology); late collapses are often fatal. Civilizations that wrap their star in a Dyson swarm face the Silence: they vanish without ruins. Studying ruins (clues) after seeing a silence reveals the Great Filter — and then the game asks what to do about it (doc §37): **intervene** (shield civilizations; three turned-back Silences break the Filter and the sky opens), **stay out** (watch, and the Silence's work is described in full), or **become the threat** (the Erase power; the Silence stands down because you do its work). Some interstellar civilizations choose to stay quiet: they never build a swarm and last hundreds of millions of years, which is what makes contact possible.
- **Interrupts.** First-time discoveries big enough for a card can pause the universe, and a new civilization drops time to a thousand years per second (both are settings). `Universe.stopOn` makes `advance()` stop at those events so nothing races past.
- **Sound** (doc §58): a synthesized, meditative soundscape — a deep hum from the first seconds, soft pulses as stars live, a rhythm when civilizations exist, a wide quiet that grows with the galaxy, and a short bell for the discoveries worth hearing. No audio files; `ui/audio.ts` builds it from Web Audio oscillators and noise, with a menu toggle.
- **Rendering stays cheap.** Background and gas compose into one cached screen-space layer whenever the camera is still (one composite a frame; the old second, offset gas pass is baked in), the star loop projects inline and batches colours, and only the brightest stars get glow sprites. The full 2,200-star galaxy renders at vsync in software rendering; the frame rate at a billion years per second is set by the simulation's deliberate 12 ms-per-frame budget, not by drawing.
- **Saves** store the gas grid, the star columns as typed arrays and per-planet state (life, civilizations, ruins, logs); planets themselves are regenerated from the seed.

Testing aids: `/games/tiny-universe/?debug` exposes `window.tu`; `tu.debugRun(500)` runs 500 million years. Headless balance runs, endgame tests, an FPS probe and Playwright smoke/play tests live outside the repo in `/home/debroy/tiny-universe-tests/` (`tu-balance.ts`, `tu-endgame.ts`, `tu-fps.mjs`, `tu-smoke.mjs`, `tu-play.mjs`, `tsconfig.json`).

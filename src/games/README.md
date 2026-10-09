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
| `render/` | The `MapView` contract (`view.ts`), pointer input, minimap, and the classic canvas map used when WebGL 2 is unavailable |
| `render3d/` | The three.js world: `stage.ts` (renderer, quality, post), `map3d.ts` (the 3D `MapView`: camera, picking, overlays), `terrain.ts`/`water.ts`/`rivers.ts`/`props.ts`/`cities.ts`/`units.ts` (map layers), `battle.ts` (battle films), `audience.ts` (diplomacy hall), `title.ts` (title vista), `models/` (procedural meshes) |
| `ui/` | HUD, panels, screens and modals (vanilla TS, small `h()` helper); `battle.ts` (preview + film HUD), `screens/audience.ts` (diplomacy), `screens/city.ts`, `screens/lists.ts` (cities, units, world map) |

Key ideas:

- **Turns only.** `sim/turn.ts` runs AI, cities, economy, diplomacy, events and identity once per turn, yielding to the browser between civilizations. Nothing simulates per frame.
- **Determinism.** A world code (`seed/size/type/rivals`) reproduces the same world and peoples; all randomness goes through `Game.rng`.
- **History.** `sim/history.ts#logHistory` records events with the names of the moment; `sim/chronicle.ts` turns the record into prose.
- **Saves.** `sim/save.ts` serializes the whole state (typed arrays as base64), gzip-compressed in `localStorage`; export/import use plain JSON.
- **One 3D map, many layers.** `render3d/map3d.ts` implements the same `MapView` API as the canvas map (camera in map pixels, `tileAt`, `centerOn`…), so the app, input and minimap work with either. Per-tile state (fog, territory, reach, attack, hover, selection) lives in a small data texture (`terrain.ts#TileState`) read by every shader, so overlays never rebuild geometry. Unexplored land has no geometry; a cloud sea (`water.ts`) covers it. Props and terrain are rebuilt per region only when exploration or improvements change.
- **Battles stage the real result.** `ui/app.ts#startBattle` resolves `attack()` first, then `render3d/battle.ts` choreographs that outcome (damage, casualties, capture) on a field built from the defender's tile. Skipping jumps to the same result.
- **Diplomacy is an audience.** `ui/screens/audience.ts` drives the same proposals and treaties as before (`screens/diplomacy.ts#diplomacyActions`) while the leader in `render3d/audience.ts` reacts.
- **Saves are unchanged.** The 3D layer only reads the game state; the save format and `SAVE_VERSION` are as before, and new settings (graphics quality, battle scenes) are merged with defaults.

Testing aids: open `/games/year-zero/?debug` to expose `window.yz` (the app; `yz.r` is the map view, `yz.stage` the WebGL stage) and `window.yzSim` (`createUnit`, `meet`); `await yz.debugAutoplay(200)` lets the AI govern the player for 200 years.

## Automatic mode

Every game has an **AUTO** toggle that hands control to an AI you can watch, and take back at any time:

| Game | Who plays | Where |
| --- | --- | --- |
| Year Zero | The civilization AI governs your people and ends a year every couple of seconds | `ui/app.ts#setAuto` (uses `endTurn(..., { autoPlayer: true })`) |
| Micro City | A bot mayor lays out streets, zones by demand and builds utilities and services | `sim/bot.ts` |
| First Contact | An auto-linguist reads evidence, advises the Council, talks to the aliens and writes the report, with its own mistakes | `sim/auto.ts` |
| Primordial | A director plays god (seeding, meteors, climate, mutation storms) and keeps the camera on interesting creatures | `sim/director.ts` |
| Slingshot | An autopilot simulates hundreds of launches and flies the best | `sim/autopilot.ts` |
| LumiQuest | An auto-ranger follows the main quest: walks to each objective, talks, examines, observes, uses its companion's ability and solves the beacon puzzle | `systems/auto.ts` |
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

## LumiQuest

A cute 3D creature adventure at `/lumiquest/` (page: `src/pages/lumiquest/index.astro`). Create a ranger, choose a first companion, explore Brightwater Vale in third or first person, bond with original creatures through Resonance, and restore the Lost Beacon.

| Folder | Contents |
| --- | --- |
| `data/` | Creature species (six originals, variants, temperaments, abilities), items, character presets and customization options, the world layout (locations, river, paths, every interactable and wild spawn), and villager dialogue |
| `engine/` | Renderer and quality presets with adaptive resolution, input (rebindable keys, pointer lock, touch), the camera rig (third person with collision, first person), collision (cylinders and yawed boxes with walkable tops and height ranges in a spatial hash), skeletal animation (procedural clips through `AnimationMixer`, rigid parts baked into `SkinnedMesh` batches), procedural textures and geometry helpers, synthesized audio |
| `world/` | Terrain heightfield (chunked meshes; collision samples the same triangles), sky/sun/fog/weather, water (depth-coloured surface fitted to the river, pool and cove; the falls), nature (instanced trees and props refilled around the camera; streamed grass and flower chunks with a wind shader), architecture (`props.ts`, then merged by material per 60 m cell in `batch.ts`), ambient life, effects, interactables |
| `entities/` | The modular chibi character (player and villagers), creature models, creature AI and the population streamer, the player controller, villagers |
| `systems/` | Game state and versioned saves with validation, quests (stages read live state), Resonance Bonding rules, the auto-ranger |
| `ui/` | Title, creation screens with live 3D previews (`studio.ts` renders scissored viewports), HUD, map and minimap, collection, inventory, journal, dialogue, the Resonance minigame, settings, touch controls |

Key ideas:

- **Everything is generated.** Characters, creatures, buildings, plants, textures, sounds and music are built in code at load time from original designs, so the game has no third-party art to license or host. The only runtime dependency is three.js; the fonts (Lilita One, Nunito) are OFL and bundled through `@fontsource`.
- **Real skeletons.** Every character and creature is a `Bone` hierarchy. Clips are sampled from pose functions into quaternion tracks and cross-faded by `AnimationMixer`; each model's rigid parts are baked into one `SkinnedMesh` per material bound to that skeleton, so a creature is a handful of draw calls.
- **Modular characters.** Hair styles, outfits, accessories and the painted face are separate parts rebuilt on change, so the customization preview updates instantly and every option is a real model change.
- **Both cameras, one player.** `V` switches the rig between third person (orbit, shoulder offset, boom that pulls in before walls and terrain) and first person (eye height, pointer lock, a hand wearing the Resonance Device). Position, movement, companion and quests are untouched by the switch.
- **Resonance Bonding.** Creatures notice you by sound (sprinting is loud, sneaking is quiet), fear rises when you rush them, trust rises with patience, liked food and preferred conditions (water for Aquoray, darkness for Lumelle, a quiet approach for Zephyra). At 70 trust the Resonance minigame (three timed pulses) completes the bond.
- **Abilities change the world.** Ember Puff burns thorns and lights braziers; Moss Quake shatters cracked boulders; Tide Call fills basins and lets you dive under the rock curtain into the Hidden Cove; Breeze Wings glides to the Sky Pillar; Lumen Glow lights the cave and reveals hidden glyphs; Green Sense finds hidden herbs. Every starter's ability opens a different crystal for the main quest.
- **Quest state is world state.** Objectives are functions of `GameState` (`done`, `flags`, inventory, prisms), so they cannot disagree with what has happened, and a save restores them exactly.
- **Renderer choice.** three r186 includes `WebGPURenderer`, but it runs only node (TSL) materials; the wind, water and sky shaders here patch WebGL shader chunks, and its WebGL 2 fallback is slower than `WebGLRenderer` on the low-end devices the low preset is for. The game uses `WebGLRenderer` (WebGL 2) and fails gracefully with an explanation when WebGL 2 is missing.
- **Performance.** Quality presets (low/medium/high, or auto with a frame-time governor that scales resolution), draw-distance and shadow ranges per preset, instanced vegetation refilled around the camera, streamed grass, models built only for nearby creatures, distant creatures think less often, static architecture batched, and the loop pauses (and saves) when the tab is hidden.

Testing aids: `/lumiquest/?debug` exposes `window.lq` (`lq.beginAdventure('flamkit', '')`, `lq.player.place(x, y, z, yaw)`, `lq.state`, `lq.startAuto(true)`).

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

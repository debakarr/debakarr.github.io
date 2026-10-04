# Games: handoff notes

For the next agent picking up the browser games on this site. Read this, then `src/games/README.md` (architecture of each game), then the design doc for whatever you are building.

## Where things stand

Live at https://debakarr.github.io/games (deployed from `main` by `.github/workflows/deploy.yml` on every push):

| Game | Path | Design doc | Notes |
| --- | --- | --- | --- |
| Year Zero | `src/games/year-zero` | `civ-game.md` | Hex 4X with generated history. Kenney hex tiles + game-icons. |
| Micro City | `src/games/micro-city` | `city-skyline-game.md` | Isometric city builder, Indian/generic modes, challenges. |
| First Contact | `src/games/first-contact` | `first-contact-game.md` | Alien-language deduction game (MVP of the doc). |
| Primordial | `src/games/primordial` | none (agent's own idea) | Evolution sandbox with a "director". |
| Slingshot | `src/games/slingshot` | none (agent's own idea) | Gravity-assist puzzle with an autopilot. |

Every game has an **AUTO** button (automatic mode: an AI plays and the player can take over any time). This is a standing requirement: **every new game must ship with automatic mode too.**

The design docs live at the repo root and are **not committed** (the owner keeps them local): `civ-game.md`, `city-skyline-game.md`, `first-contact-game.md`, `wildlife-game.md`, `tiny-universe-game.md`. If you are working somewhere without them, use the summaries below.

## What to build next

The owner asked for two more games from their docs. Neither is started beyond the data file noted below.

### 1. Wildborn (`wildlife-game.md`), in progress

Creature collecting where **a creature's life shapes its evolution** ("Do not build a Pokémon clone"). Target the doc's v0.1 MVP plus breeding and lineage from v0.2, because the doc's "killer moment" is the family tree:

- **World**: seeded; 6 regions on an illustrated node map (village hub + Greenwood, Windmeadow, Mistfen wetlands, Crystal Hollow caves, Ember Flats, Old Ruins). Day/night (each action advances a few hours) and daily weather (sun, rain, storm, fog) that change encounters and battles.
- **Creatures**: 5 families × (1 base + 3 evolutions) = 20 species, with affinities instead of types, roles, personalities (curiosity, aggression, loyalty, playfulness, fear, intelligence), bond/trust/stress, and a per-creature life history.
- **Loop**: explore a region (encounter, resource, ruin fragment, event) → wild creature screen with Observe / Offer food / Play / Battle / Leave → "Companion Link" capture whose chance depends on trust, HP, fear and personality (no item spam) → raise at the village (train, play, rest, feed foods that add exposures) → evolve → breed.
- **Signature system**: counters for exposures (thermal, aquatic, mineral, organic, night, storm, wins, losses, explore, play, ruins) grow from where the creature lives and what it does. At level 8 or so, `evaluateEvolution` scores the three branches of its family from those counters and its personality; the best branch past a threshold evolves it. Branches stay "???" in the Field Guide until discovered.
- **Battles**: turn-based, 1v1 with switching, 3 abilities per creature, affinity advantages (`STRONG` table), biome boost and weather modifiers, wild AI that flees when hurt or scared.
- **Breeding**: two creatures of one family with high bond → egg hatches after a few actions → child genome mixes the parents' genes plus a chance of a rare mutation (crystal, golden, void variants), generation + 1, lineage tree view ("carries a trait from an ancestor N generations ago").
- **Field Guide**: 20 entries moving from unknown → seen → observed → captured, revealing info gradually. Light research quests from a village researcher ("observe three aquatic creatures"). Achievements (First Friend, Naturalist, Evolutionary Divergence, Ancestor, Explorer).
- **Auto mode**: an AI trainer that explores, befriends or battles, captures new species, trains, feeds toward a chosen branch and breeds, one action every second or so with a visible log.
- **Art**: original procedural SVG creatures built from layers per family (body, head, ears/horns, tail, pattern, eyes, feature such as flame tail, crystals, wings), colored by species hue plus individual variation. No copyrighted sprites. game-icons.net for UI icons (credit them).
- **Done so far**: `src/games/wildborn/data/species.ts`, with affinities and the strength table, 22 abilities, 20 species with stats, abilities, likes, look and the three branches with their drivers, 6 biomes with wild tables, resources and exposures, and items/foods. Nothing imports it yet.
- **Suggested layout**: `data/species.ts` (done), `sim/game.ts` (state, seed world, explore, encounters, capture, raising, evolution, breeding, quests, achievements, save), `sim/battle.ts`, `sim/auto.ts`, `render/creature.ts` (SVG creature art), `render/map.ts`, `ui/app.ts` + `ui/screens.ts`, `styles.css`, `main.ts`, `art/icons.manifest.json`.

### 2. Tiny Universe (`tiny-universe-game.md`), not started

"A universe you can play with", not an idle clicker. Target the doc's v0.1 MVP plus v0.2 (life) and a light v0.3 (intelligence/civilization):

- **Creation**: choose matter density, gravity, expansion and chaos (effects only partly explained), then a Big Bang.
- **Galaxy level**: a 2D disc with a gas density grid. Stars form where gas is dense, with masses from an initial mass function. Lifetimes scale roughly with M^-2.5: main sequence → giant → white dwarf, or for massive stars supernova → neutron star / black hole. Supernovas enrich nearby gas with heavy elements, so later stars get rocky planets.
- **Systems and planets**: generated per star (count and type from metallicity); temperature from luminosity and distance, plus water, atmosphere and a habitability score ("Goldilocks").
- **Life**: abiogenesis probability from habitability × time; stages microbial → complex → land → tool-users → intelligence; extinctions from nearby supernovas, gamma-ray bursts and impacts; a per-planet life tree.
- **Civilizations (light)**: tech eras (stone → agriculture → industry → computing → nuclear → spaceflight → interstellar) with personality (science, military, cooperation). Collapse risks at each era (the Great Filter); spaceflight colonizes nearby habitable worlds; contact between civilizations.
- **Player**: zoom galaxy → system → planet; inspect; time speeds from about 1M to 1B years per second, auto-slowing at first-time events ("Intelligent life detected"). Interventions: seed life, meteor, warm a world, give knowledge, trigger a supernova, tracked as a creator/observer/destroyer profile. A discovery checklist (the "cosmic Pokédex") and a cosmic history timeline ("You created N civilizations; only M reached the stars").
- **Auto mode**: a director that manages time speed, flies the camera to new life and civilizations, and occasionally intervenes.
- **Performance**: stay statistical. About 2,000 stars and 16k planets at most, life checked only on habitable worlds, and every simulation step independent of rendering.

For each new game also: add a page in `src/pages/games/<slug>.astro`, an entry in `src/data/games.ts` with a new banner type drawn in `src/pages/games/index.astro`, credits on the title screen and in a Credits dialog, and a section in `src/games/README.md`.

## How the existing games are built

- **Stack**: Astro 5 static site. Each game is vanilla TypeScript in `src/games/<slug>/`, loaded by a standalone page (not `BaseLayout`) with `data-pagefind-ignore="all"` on `<body>`. Links into games use `data-astro-reload`.
- **Shared code** (`src/games/shared/`): `rng.ts` (seeded `Rng`, `hashString`), `noise.ts`, `dom.ts` (`h()`, `store`/`persist`, `download`, `pickFile`, `compact`), `savefile.ts` (`SaveStore`, typed arrays as base64, gzip), `chart.ts`, `gameicons.ts` (`iconSet()`; add new authors to `ICON_AUTHORS`).
- **Icons**: clone https://github.com/game-icons/icons, write `art/icons.manifest.json`, then run `node scripts/game-icons.mjs <repo> <manifest> <out.ts>`. Avoid the `badges/` folder.
- **Pattern used everywhere**: a DOM-free simulation (testable in Node) + a canvas renderer + a vanilla UI. Each game has a title screen; the page has a `?debug` flag that exposes the app on `window` (`yz`, `mc`, `fc`, `pr`, `sl`).
- **Layouts**: every game supports desktop, phone portrait (≤ 820px: bottom bars, bottom sheets) and phone landscape (`(max-height: 520px) and (orientation: landscape)`: left rail, right drawer). Use `touch-action: manipulation` on the root, `:where(.x) button { font: inherit }` (so component font sizes win), `[hidden] { display: none !important }`, and test at 320px.

## Testing workflow that worked

- **Type-check**: a scratch `tsconfig.json` with `strict`, `noUnusedLocals`, `isolatedModules` and `include: [".../src/games/**/*.ts"]`, run with `node_modules/.bin/tsc -p <that file>`.
- **Headless simulation tests**: bundle a small script with `node_modules/.bin/esbuild x.ts --bundle --platform=node --format=esm` and run it with Node (balance runs, autopilot solvability, etc.).
- **Browser tests**: `npx astro build`, then `npx astro preview --port 4321 --host 127.0.0.1`, then Playwright. Playwright-core is available at `/home/debroy/beyond-compare-clone/node_modules/playwright-core/index.mjs`. Touch drags need CDP `Input.dispatchTouchEvent`.
- **Known environment trap**: `/tmp` is a 3.9 GB tmpfs that other projects fill up. When it is nearly full, headless Chromium pages crash ("Page crashed") at random. Check `df -h /tmp` before blaming code, and clear your own scratch files.
- **Learned the hard way**:
  - A tap right after a fast touch drag can lose its `click`, so confirm buttons act on `pointerup`.
  - Many full-screen animated overlays or SVG `drop-shadow` filters on lots of elements crashed headless Chromium.
  - Reuse canvases instead of creating one per render.

## Owner preferences

- Commit and push only when asked. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Don't commit the design docs unless asked.
- Credit third-party art visibly (Kenney CC0, game-icons.net CC BY 3.0); no copyrighted sprites.
- Every game must work on phones in both orientations and have automatic mode.
- Refer to the owner as they/them.

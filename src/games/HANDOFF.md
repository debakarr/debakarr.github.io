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
| Wildborn | `src/games/wildborn` | `wildlife-game.md` | Creature game where life shapes evolution (v0.1 + breeding/lineage). |
| Tiny Universe | `src/games/tiny-universe` | `tiny-universe-game.md` | Galaxy → stars → planets → life → civilizations sandbox, with the Great Filter mystery. |

Wildborn and Tiny Universe were built after the last deploy and were committed and pushed this session (three commits: one per game, one for the /games listing). The remaining work below is polish, not missing games.

A graphics pass then went over the other four games: Slingshot's empty sky is now a seeded nebula with 720 parallax stars in three tinted layers; Primordial's sea gained field grain, a depth gradient, drifting light shafts and a vignette; Year Zero's uncharted map became an unfinished chart (cloudy mottling, sounding circles, hex lattice, paper grain) instead of a flat fill. Measured on the canvas (share of the single most common colour): Slingshot 56% → 35%, Primordial 61% → 25%, Year Zero 52% → 21%. Micro City was already rich (7%) and was left alone. Probe scripts live in `/home/debroy/gfx-audit/` (`gfx-regress.mjs` is the smoke: desktop + 320px for each game, checking colour variety, overflow and console errors).

Every game has an **AUTO** button (automatic mode: an AI plays and the player can take over any time). This is a standing requirement: **every new game must ship with automatic mode too.**

The design docs live at the repo root and are **not committed** (the owner keeps them local): `civ-game.md`, `city-skyline-game.md`, `first-contact-game.md`, `wildlife-game.md`, `tiny-universe-game.md`. If you are working somewhere without them, use the summaries below.

## The two games from the docs

### Wildborn (`wildlife-game.md`), built

Creature collecting where **a creature's life shapes its evolution** ("Do not build a Pokémon clone"). Built the doc's v0.1 MVP plus breeding and lineage from v0.2, because the doc's "killer moment" is the family tree. Everything below is implemented:

- **World**: seeded; 6 regions on an illustrated node map (village hub + Greenwood, Windmeadow, Mistfen wetlands, Crystal Hollow caves, Ember Flats, Old Ruins). Day/night (each action advances a few hours) and daily weather (sun, rain, storm, fog) that change encounters and battles.
- **Creatures**: 5 families × (1 base + 3 evolutions) = 20 species, with affinities instead of types, roles, personalities (curiosity, aggression, loyalty, playfulness, fear, intelligence), bond/trust/stress, and a per-creature life history.
- **Loop**: explore a region (encounter, resource, ruin fragment, event) → wild creature screen with Observe / Offer food / Play / Battle / Leave → "Companion Link" capture whose chance depends on trust, HP, fear and personality (no item spam) → raise at the village (train, play, rest, feed foods that add exposures) → evolve → breed.
- **Signature system**: counters for exposures (thermal, aquatic, mineral, organic, night, storm, wins, losses, explore, play, ruins) grow from where the creature lives and what it does. At level 8 or so, `evaluateEvolution` scores the three branches of its family from those counters and its personality; the best branch past a threshold evolves it. Branches stay "???" in the Field Guide until discovered.
- **Battles**: turn-based, 1v1 with switching, 3 abilities per creature, affinity advantages (`STRONG` table), biome boost and weather modifiers, wild AI that flees when hurt or scared.
- **Breeding**: two creatures of one family with high bond → egg hatches after a few actions → child genome mixes the parents' genes plus a chance of a rare mutation (crystal, golden, void variants), generation + 1, lineage tree view ("carries a trait from an ancestor N generations ago").
- **Field Guide**: 20 entries moving from unknown → seen → observed → captured, revealing info gradually. Light research quests from a village researcher ("observe three aquatic creatures"). Achievements (First Friend, Naturalist, Evolutionary Divergence, Ancestor, Explorer).
- **Auto mode**: an AI trainer that explores, befriends or battles, captures new species, trains, feeds toward a chosen branch and breeds, one action every second or so with a visible log.
- **Art**: original procedural SVG creatures built from layers per family (body, head, ears/horns, tail, pattern, eyes, feature such as flame tail, crystals, wings), colored by species hue plus individual variation. No copyrighted sprites. game-icons.net for UI icons (credit them).
- **What exists now**: `data/species.ts` (was already done), `sim/game.ts` (state, clock/weather, explore, encounters, Companion Link capture, raising, `evaluateEvolution`, breeding, quests, achievements, saves), `sim/battle.ts`, `sim/auto.ts`, `render/creature.ts` (layered procedural SVG), `render/map.ts`, `ui/app.ts` + `ui/screens.ts`, `styles.css`, `main.ts`, `art/icons.manifest.json` + generated `art/icons.ts`, the page `src/pages/games/wildborn.astro`, the `wildborn` entry in `src/data/games.ts` with the `wilds` banner in `src/pages/games/index.astro`, and a README section.
- **Verified this session**: strict `tsc` over `src/games/**/*.ts` is clean; headless Node tests all pass (capture, life-driven evolution, breeding/lineage, battle resolution, determinism, save round-trip, a 1200-step autopilot run that captures ~28 creatures, battles, breeds and evolves); `astro build` succeeds; a Playwright smoke run passes at desktop, 320px phone portrait and phone landscape (title → new world → explore → encounter → observe/play/Link → creature tabs → field guide → menu/credits → AUTO). Test scripts are kept outside the repo at `/home/debroy/wildborn-tests/` (`wb-test.ts` headless sim tests, `wb-smoke.mjs` browser smoke, `wb-tsconfig.json` type-check config).
- **Deliberately out of scope** (doc v0.3+): ecosystem/populations/migration/extinction, alpha and boss creatures, towns/NPCs/story, tournaments, audio.
- **Polished since**: battle feedback (hits shake the fighter's card, heals glow, damage and healing float as numbers — battle events now carry structured HP changes so the UI never parses text); the auto trainer now picks winnable fights (role, level and power aware), sends its best match-up, heals early and retreats from hopeless ones — 10 wins / 2 losses in the 1200-step run versus 6/21 before; the doc's rarity tiers (Common → Mythic from wild frequency, Unique for mutated creatures) show on rows, the field guide and the creature screen.
- **Worth polishing later**: the Field Guide could show where and when a species appears (biome, weather, night); the Team list could sort by rarity or level; the battle log could highlight the newest turn.

### Tiny Universe (`tiny-universe-game.md`), built

"A universe you can play with", not an idle clicker. Built the doc's v0.1 MVP, v0.2 (life) and a light v0.3 (civilizations), plus pieces of v0.5/v0.6 that give the game a goal (contact, megastructures, ruins, the Great Filter mystery). See the Tiny Universe section of `src/games/README.md` for the architecture.

- **Creation**: four dials (matter, gravity, expansion, distribution) whose effects are only hinted at, eight challenge universes, a seed, then a Big Bang that cools into a gas disc.
- **Galaxy**: 96×96 gas and metals grid, star formation (Kennicutt-like), initial mass function, lifetimes ∝ M^-2.5, giants, white dwarfs, supernovae (metals + sterilization), neutron stars, black holes, gamma-ray bursts. Up to 2,400 star slots with recycling.
- **Planets**: generated per star from its mass and metals (the first stars get no rocky worlds), temperature, water, air, magnetic field, habitability.
- **Life**: lineage trees, oxygenation, stages up to intelligence, extinctions; extremophiles, second genesis, survivors.
- **Civilizations**: personalities, their own late-tech order, collapse at era ends, dark ages and renaissances, colonies, quiet civilizations, first contact (peace, war, union), Dyson swarms, galactic civilizations, The Watcher (they notice your interventions), the Silence and the Great Filter reveal.
- **Player**: galaxy → system → planet; time from 1,000 to 1 billion years per second; discovery cards that pause, time slowing for new civilizations; interventions (matter, seed life, warm/cool, share knowledge, protect, asteroid, supernova, study ruins) tracked in a creator/observer/destroyer profile; Observatory (47 discoveries), cosmic history, achievements, daily universe with a goal.
- **Auto mode**: `sim/director.ts`.
- **Verified**: strict `tsc`; headless balance runs across all presets (intelligence typically arrives at 4–7 billion years in a Standard universe, about 15–30 civilizations per universe, a few reach interstellar, contact in some universes and most Contact ones); Playwright runs at desktop, 390px and 320px portrait and phone landscape with no console errors; a 60-second real-time play test (13 cards, first life at 18 s, intelligence at 49 s); save → reload → continue; the Ancient fast-forward (≈2.6 s).
- **Done since**: the doc §37 endgame choice — after the Great Filter reveal the game asks what to do about it: **intervene** (shield civilizations; three turned-back Silences break the Filter and open the sky, with a new "Open Sky" discovery), **stay out** (the Silence's work is described in full and watching counts), or **become the threat** (an Erase power for advanced civilizations; the Silence stands down because you do its work; civilizations notice). Each path has an achievement; the auto director answers the reveal itself. Audio (doc §58) is in: a synthesized meditative soundscape in `ui/audio.ts` (hum, star pulses, civilization rhythm, galaxy-wide quiet, a bell for discoveries) with a menu toggle. The render hot spots are done: background + gas compose into one cached screen-space layer while the camera is still, the old offset gas pass is baked in, the star loop projects inline and only the brightest stars get glows — the full 2,200-star galaxy renders at vsync in software rendering.
- **Worth doing later**: multiple galaxies (doc §38) stay out of scope; civilizations could react to *which* answer you chose in their own words; the daily goal could play off the endgame state; at 1B yr/s the frame rate is set by the sim's deliberate 12 ms-per-frame budget (~40 fps headless, more on real hardware) — raising it means faster `Universe.advance`, not drawing.

For each new game also: add a page in `src/pages/games/<slug>.astro`, an entry in `src/data/games.ts` with a new banner type drawn in `src/pages/games/index.astro`, credits on the title screen and in a Credits dialog, and a section in `src/games/README.md`.

## How the existing games are built

- **Stack**: Astro 5 static site. Each game is vanilla TypeScript in `src/games/<slug>/`, loaded by a standalone page (not `BaseLayout`) with `data-pagefind-ignore="all"` on `<body>`. Links into games use `data-astro-reload`.
- **Shared code** (`src/games/shared/`): `rng.ts` (seeded `Rng`, `hashString`), `noise.ts`, `dom.ts` (`h()`, `store`/`persist`, `download`, `pickFile`, `compact`), `savefile.ts` (`SaveStore`, typed arrays as base64, gzip), `chart.ts`, `gameicons.ts` (`iconSet()`; add new authors to `ICON_AUTHORS`).
- **Icons**: clone https://github.com/game-icons/icons, write `art/icons.manifest.json`, then run `node scripts/game-icons.mjs <repo> <manifest> <out.ts>`. Avoid the `badges/` folder.
- **Pattern used everywhere**: a DOM-free simulation (testable in Node) + a canvas renderer + a vanilla UI. Each game has a title screen; the page has a `?debug` flag that exposes the app on `window` (`yz`, `mc`, `fc`, `pr`, `sl`, `wb`, `tu`).
- **Layouts**: every game supports desktop, phone portrait (≤ 820px: bottom bars, bottom sheets) and phone landscape (`(max-height: 520px) and (orientation: landscape)`: left rail, right drawer). Use `touch-action: manipulation` on the root, `:where(.x) button { font: inherit }` (so component font sizes win), `[hidden] { display: none !important }`, and test at 320px.

## Testing workflow that worked

- **Type-check**: a scratch `tsconfig.json` with `strict`, `noUnusedLocals`, `isolatedModules` and `include: [".../src/games/**/*.ts"]`, run with `node_modules/.bin/tsc -p <that file>`.
- **Headless simulation tests**: bundle a small script with `node_modules/.bin/esbuild x.ts --bundle --platform=node --format=esm` and run it with Node (balance runs, autopilot solvability, etc.).
- **Browser tests**: `npx astro build`, then `npx astro preview --port <port> --host 127.0.0.1`, then Playwright. Playwright-core is available at `/home/debroy/beyond-compare-clone/node_modules/playwright-core/index.mjs`. Touch drags need CDP `Input.dispatchTouchEvent`.
- **Known environment trap**: `/tmp` is a 3.9 GB tmpfs that other projects fill up. When it is nearly full, headless Chromium pages crash ("Page crashed") at random. Check `df -h /tmp` before blaming code, and clear your own scratch files. When it is tight, run Chromium with `TMPDIR` pointing at a directory on disk (this session used `/home/debroy/.cache/wb-tmp`).
- **Ready-made scripts**: `/home/debroy/tiny-universe-tests/` holds Tiny Universe's (`tsconfig.json`, `tu-balance.ts` headless runs per preset, `tu-endgame.ts` the Great Filter paths, `tu-fps.mjs` a frame probe, `tu-smoke.mjs` layouts, `tu-play.mjs` real-time pacing and saves; the browser ones take the preview port as the first argument). `/home/debroy/wildborn-tests/` holds Wildborn's tests — `wb-tsconfig.json` (type-check), `wb-test.ts` (headless sim; bundle with esbuild and run with Node), `wb-smoke.mjs` (Playwright smoke; edit the `BASE` port to match your preview server). They live outside the repo on purpose. The game-icons repo is cloned at `/home/debroy/game-icons` (not `/tmp`, which fills up).
- **Learned the hard way**:
  - A tap right after a fast touch drag can lose its `click`, so confirm buttons act on `pointerup`.
  - Many full-screen animated overlays or SVG `drop-shadow` filters on lots of elements crashed headless Chromium.
  - Reuse canvases instead of creating one per render.
  - A single non-wrapping flex row in a header can make the page's min-content width exceed 320px; mobile browsers then zoom out the layout viewport, and Playwright's clicks silently fail the "receives events" check forever. Test `window.innerWidth === viewport.width`, not just `scrollWidth`.

## Owner preferences

- Commit and push only when asked. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Don't commit the design docs unless asked.
- Credit third-party art visibly (Kenney CC0, game-icons.net CC BY 3.0); no copyrighted sprites.
- Every game must work on phones in both orientations and have automatic mode.
- Refer to the owner as they/them.

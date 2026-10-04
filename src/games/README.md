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
| `core/` | Seeded RNG, simplex noise, hex grid math, language/name generator |
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

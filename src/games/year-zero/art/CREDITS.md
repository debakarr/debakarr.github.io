# Year Zero — art credits

## 3D art (original)

The 3D world (`render3d/`) — terrain, water, rivers, vegetation, mountains,
cities and buildings, soldiers and war machines, leaders, battlefields, the
throne room and the title vista — is procedural: every model is built from
primitives and painted in code for this game. No third-party 3D assets are
used. Rendering uses [three.js](https://threejs.org) (MIT).

## Typefaces (SIL OFL 1.1)

Cinzel and Nunito (headings and interface), Inter and JetBrains Mono, all via
[Fontsource](https://fontsource.org).

## Kenney — Hexagon Pack (CC0) — classic 2D map

Used only by the canvas map (`render/renderer.ts`) shown when a browser cannot run WebGL 2.

`kenney/*.png` are from [Hexagon Pack](https://kenney.nl/assets/hexagon-pack) by
[Kenney](https://kenney.nl), released under
[Creative Commons Zero](https://creativecommons.org/publicdomain/zero/1.0/).
See `kenney/LICENSE-kenney.txt`.

## game-icons.net (CC BY 3.0)

`icons.ts` is generated from [game-icons.net](https://game-icons.net) SVGs listed in
`icons.manifest.json`, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
Icons made by Lorc, Delapouite, Skoll, Sbed, Carl Olsen, HeavenlyDog, Quoting,
Pierre Leducq, Cathelineau, Faithtoken, Caro Asercion and DarkZaitzev. The in-game
Credits screen lists every icon with a link to its source.

To regenerate after editing the manifest:

```sh
git clone --depth 1 https://github.com/game-icons/icons /tmp/game-icons
node scripts/game-icons.mjs /tmp/game-icons src/games/year-zero/art/icons.manifest.json src/games/year-zero/art/icons.ts
```

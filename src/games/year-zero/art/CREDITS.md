# Year Zero — art credits

## Kenney — Hexagon Pack (CC0)

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

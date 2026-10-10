# Shared chibi characters

One character kit for Year Zero and LumiQuest. A character is a `ChibiSpec`
(`spec.ts`): face, hair, body and a list of costume pieces. `ChibiModel`
(`model.ts`) builds it as cel-shaded skinned meshes with ink outlines and a
painted anime face, driven by the shared clips in `rig.ts`.

- `catalog.ts`: the cast (`CAST`): scout, leaders, soldiers, civilians.
- `crowd.ts`: flattened, team-coloured versions for instanced map squads.
- `/games/character-lab`: unlisted page that lays the cast out like the
  reference sheets (`?ids=scout,queen&views=front,threeq&clip=walk&face=1`).

## Sculpted characters (GLB)

The Scout, Swordsman and crowned Queens wear sculpted models
(`public/models/chibi/*.glb`), made from raw sculpts with the Blender pipeline in
`tools/chibi-sculpt/` (see its README). They are rigged with the chibi bone
names; `SculptRig` (`sculpt.ts`) re-expresses the chibi skeleton's pose in each
sculpt bone's rest frame every frame, so every clip works and the sculpted pose
is the idle pose. Their blue cloth is hue-shifted to the side's colour
(`spec.tint`, set by the catalog factories and `dressChibi`).

Manifest entries for sculpts are objects: `{ "url": "...", "height": 1.3 }`
(height in chibi units; the code-built chibis are 1.26 tall).

## Swapping in VRM models (VRoid Studio)

Any character can wear a `.vrm` instead of its code-built body. The chibi
skeleton keeps animating and its pose and expressions are copied onto the
VRM's humanoid bones and expression presets, so games need no changes.

1. Make a character in VRoid Studio (free) and export it as VRM 1.0.
2. Put the file in `public/models/chibi/`, e.g. `public/models/chibi/queen.vrm`.
3. Map it in `public/models/chibi/manifest.json`:

   ```json
   { "queen": "/models/chibi/queen.vrm", "lq-aero": "/models/chibi/aero.vrm" }
   ```

Keys are the `CAST` names (`scout`, `queen`, `swordsman-red`…) and
`lq-<preset>` for LumiQuest characters. A spec can also set `vrm` directly.
The VRM is scaled to chibi height (1.26 × body scale). three-vrm (MIT) is
only downloaded when a character actually has a VRM.

Limits: strategy-map squads (`crowd.ts`) always use the code-built bodies (sculpts
appear in battles, diplomacy and the character lab);
only ship models you own or that are licensed for redistribution.

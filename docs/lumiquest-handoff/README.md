# LumiQuest art revamp: handoff

Status as of 2026-10-25, branch `claude/vigilant-sagan-1ktsgm`. Written so another agent can pick up without the original conversation.

## TL;DR

- **Game:** LumiQuest, a three.js creature-catching roam game inside this Astro site (`src/games/lumiquest/`, page `/lumiquest/`).
- **Live on `main` (deployed):** `afd3c01`, the older voxel-hero version plus a Year Zero lag fix. Nothing on this branch is deployed.
- **On this branch:**
  - `b3402c9`: anime/VRM revamp.
  - `14f93e4`: **WIP, unverified** catching gameplay that removes all quests.
  - This handoff commit: art-lab tools plus this document.
- **Waiting on the user:** they are choosing between toon **A (with outline)** and **B (no outline)**. The look-test frames are in this folder (see "Current direction" below). Do not build the world or swap the cast until they answer.

## The user's direction, newest first

1. **Current target (2026-10-24):** toon shading, in the style of Whiteout Survival ([Play listing](https://play.google.com/store/apps/details?id=com.gof.global)) and [tinyvibe.netlify.app](https://tinyvibe.netlify.app).
   - They said: "toon version was much better."
   - The "toon version" they meant is the **Toon + outline** mode of their own Chibi Tamer roster viewer: `MeshToonMaterial`, a 3-step nearest ramp `[118,190,255]`, and an inverted-hull outline 0.0055 m wide in `#241c22`.
2. **Use their own Chibi Tamer models** (see Assets below) as the cast, in place of the VRM anime characters.
3. **Rejected:**
   - A soft Disney/Pixar pass: a fused SDF body with sheen and wrap light. The tools are kept in the art lab but shelved.
   - Before that: a photo look, a painterly look, voxel heroes, and VRM anime.
   - The user said of the photo look: "What a lame graphics. Redo everything from scratch."
   - Each pivot came after seeing renders, so **show one approved frame before doing family-wide work**.
4. **Gameplay:** "no quest at all, just roam around and try catching creature." The WIP commit implements this.

### Reading the two references

- **Whiteout Survival in-game 3D:**
  - High three-quarter camera, pitched about 40–55°.
  - Bright, saturated, low-contrast colour.
  - Light, cool-tinted shadows and soft drop shadows.
  - **No dark outlines** in the game renderer. The anime-looking heroes in its store art are painted 2D promo images.
  - Do not unpack its APK or reuse its assets. They are Century Games' property, and the user's rule is that third-party art must be licensed and credited.
- **tinyvibe:**
  - three.js with thousands of `InstancedMesh` toon trees (`MeshToonMaterial` + `gradientMap`).
  - Strong coloured aerial haze for depth.

## Current direction: the look test (awaiting A/B answer)

| | With outline (A) | No outline (B) |
|---|---|---|
| Close-up | `lk-close-ol.webp` | `lk-close.webp` |
| Gameplay camera | `lk-wide-ol.webp` | `lk-wide.webp` |

These frames are rendered by `tools/lumiquest-art-lab/lookdev.js`:

- **Characters and materials:**
  - Original roster GLBs.
  - Every `MeshStandardMaterial` becomes a `MeshToonMaterial`.
  - The ramp is a 256-px texture: two soft bands (edges at 0.5 and 0.68 of `dot(N,L)*0.5+0.5`), with a smoothstep width of 0.05.
  - A faint fresnel rim (`rim 0.22`) on characters.
- **Lights:**
  - Bright hemisphere fill, sky `#b4d2ff`, ground `#b0c98f`, intensity 1.5. This keeps shadows light and cool.
  - Warm sun `#fff1d6` at 2.4 from the side (`-12, 11, 7`).
  - PCF soft shadow map.
  - `NeutralToneMapping`.
  - Fog `#cfe3ee` from 22 to 75.
- **Outline:** a back-face hull with the vertex pushed along `normal` by 0.0055 m, colour `#241c22`. Flame materials get no outline. Skinned meshes get a `SkinnedMesh` hull bound to the same skeleton.
- **World:**
  - Instanced crowns of 8 merged noise-displaced icosahedron lumps.
  - Pines made of 3 cones.
  - Bushes, rocks, 5,200 grass tufts and 400 flowers.
  - A crisp ribbon path.
  - A pond.
- **Known issues:**
  - About 2.4M triangles. Far too heavy for the game; it needs LOD and distant impostors.
  - Shadows on the sandy path read grey. Tint the shaded side cooler, for example a shade-tint uniform in the toon chunk.
  - The forest is green spring, not Whiteout's snow. LumiQuest's vale is a meadow, so keep that unless the user asks.

**When the user answers**, the next steps are:

1. Port the lookdev shading to the game:
   - Replace `anime/toon.ts`. It patches PBR `lights_physical_pars_fragment` with a hard cel band, which is a different model from the lookdev's `MeshToonMaterial` ramp.
   - Replace the world materials in `world/nature.ts`, `world/props.ts` and the terrain.
   - Add the outline only if they chose A.
2. Replace the VRM cast:
   - `anime/avatar.ts`, `anime/cast.ts` and `ui/screens.ts` (cast picker with portraits in `assets/cast/*.webp`).
   - Use the roster's `trainer_boy` (Ren) and `trainer_girl` (Mika) as player choices.
3. Replace the procedural/SDF creatures:
   - `anime/creature/*` (Puddlit, Mossbun) and `entities/creatureModel.ts`.
   - Use the roster creatures Flicket (fire), Mossbara (grass) and Narwee (water).
   - Map species in `data/species.ts`.
   - Shiny variants recolour by material name (the roster manifest has a `shiny` palette per creature).
4. Camera: move toward the high three-quarter framing (`engine/camera.ts`).
5. Credits: remove the pixiv VRM and Quaternius UAL credits if those assets are dropped. Add credit for the roster models if the user wants it; they are the user's own.
6. Verify before claiming done (see Tests below), and say plainly that real-GPU performance is unmeasured. Only headless swiftshader has been used.

## Assets

### Chibi Tamer models (NOT in git)

- **Where they are:** `chibi-tamer-modes/` at the repo root, about 14 MB, untracked on purpose. The user asked not to commit the raw folder.
- **If you don't have them:** ask the user for the folder. They are also downloadable from the user's private roster artifact (the "Chibi Tamer Roster" page, "Save all models").
- **What's in the folder:**
  - `models/*.glb`: flicket, mossbara, narwee, trainer_boy (Ren), trainer_girl (Mika), npc_king, npc_matriarch, npc_prince, npc_archer, npc_spearguard, npc_merchant, mount_warhorse.
  - `models/props/*.glb`: 29 props.
  - `README.txt`: clip lists and hold/grip notes per prop.
- **Format:**
  - Meters, Y up, facing +Z, feet at y=0.
  - Exported by THREE.GLTFExporter r170.
  - **Rigid meshes per node, no skins or morphs.**
- **Expressions:**
  - Switched by node-scale tracks: `eye_L`, `eye_L_blink`, `eye_L_happy`, `eye_L_hurt`, `mouth`, `mouth_open`, `mouth_o`, `mouth_frown`, `mouth_smirk`, `brow_*_angry|sad|up`.
  - The roster viewer finds them with `/^(eye|brow|mouth)(?:_([LR]))?(?:_([A-Za-z]+))?$/`.
- **Material names matter:** they drive recolouring and shiny variants, for example `fur`, `furDark`, `cream`, `belly`, `earIn`, `limb`, `dark`, `iris`, `white`, `blush`, `mouth`, `tongue` and `flame*`. Humans add `skin`, `hair`, `top`, `cape` and so on.
- **Clips:**
  - Creatures: Idle, Walk, Attack, Special, Hurt, Faint, Happy.
  - Trainers: Idle, Walk, Run, Talk, Point, Agree, Disagree, Wave, Cheer, Think, Throw.
- **Shelved:** `chibi-tamer-modes/refined/flicket.glb` is the Pixar-pass fused, skinned Flicket. It is also untracked.

### Other untracked files to leave alone

- Do not commit `civ-game.md`, `city-skyline-game.md`, `first-contact-game.md`, `wildlife-game.md` or `tiny-universe-game.md`. They are the user's design docs.
- Do not commit `year_zero_art_reference_pack/`, the root `*.glb` files (ignored), or the exported conversation `.txt`.

## LumiQuest code map (`src/games/lumiquest/`)

- `game.ts`: main loop and wiring. It was rewritten in the WIP commit for catching.
- **Catching (WIP):**
  - `systems/catching.ts`: `CATCH_RATE`, `catchChance` and the `Catcher` (orb flight, hold, 3 shakes with `perShake = cbrt(p)`).
  - `world/blossoms.ts`: 40 Lumi blossoms that give orbs and regrow after 10 game hours.
  - `entities/creatures.ts`: wild spawns with a 24 h respawn (`refresh()`, `caught()`).
  - `entities/creature.ts`: `held`, `startle()`, `moveSpeed`.
- **Saves:** `systems/state.ts` (`SAVE_VERSION 2`: orbs, `STARTING_ORBS 12`, `WildMemory`) and `systems/save.ts` (v1 to v2 migration).
- **Input:** `engine/input.ts`. Throw is F, or left click while pointer-locked; dodge is Q.
- **UI:**
  - `ui/*`: HUD with a catch-chance ring, creature panel, orb toast, caught dialog, cast picker.
  - Quests, dialogue, NPCs, bonding and auto systems were deleted in the WIP commit.
- **Look:**
  - `anime/toon.ts`: cel lighting patch for PBR.
  - `anime/avatar.ts` / `cast.ts`: VRM cast via `@pixiv/three-vrm`, with CC0 VRoid samples in `assets/vrm/`.
  - `anime/creature/*`: SDF-sculpted creatures.
  - `world/nature.ts`, `world/props.ts`, `world/grass.ts`: the world.
- **Cast lab:** `/lumiquest/cast/` (`anime/castlab.ts`). It isn't linked from the site.

**Type check:** `tsc --strict` on `main.ts` and `castlab.ts` reports only Vite-specific errors (`?url` imports and `import.meta.glob`). `npm run build` was not run for this handoff.

## Art lab tools (`tools/lumiquest-art-lab/`)

These are static pages driven by Playwright in headless Chromium (swiftshader).

### Setup

Run once from `tools/lumiquest-art-lab`:

```sh
npm install                                    # three-mesh-bvh, meshoptimizer (for refine.js only)
ln -s ../../node_modules/three three            # served at /three
ln -s ../../chibi-tamer-modes/models models     # served at /models
ln -s ../../chibi-tamer-modes/refined refined
export PLAYWRIGHT_CORE=playwright-core          # or an absolute path to playwright-core/index.mjs
python3 -m http.server 4401 --bind 127.0.0.1 &  # serve this folder
```

### Scripts

- **`lookdev.html` / `lookdev.js` (current direction).** Renders the toon meadow scene and writes `shots/<out>.png`:

  ```sh
  node lookshots.mjs '[{"out":"wide","outline":true,"pitch":42,"dist":10}]'
  ```

  - Camera options: `pitch`, `yaw`, `dist`, `fov`, `tx`/`ty`/`tz`.
  - Lighting options: `hemi`, `sun`, `rim`, `fogNear`, `fogFar`.
  - Outline options: `olWidth`, `olColor`.
  - `cast`: a list of `[url, {x, z, rotY, clip, t, scale}]` entries.

- **`viewer.html` / `viewer.js` (shelved Pixar rig).** Single-model studio shots via `node shots.mjs '[{"url":"/models/flicket.glb","out":"f"}]'`. Add `?toon=1` for LumiQuest's cel ramp.
- **`refine.js` + `index.html` + `run-refine.mjs` (shelved).** SDF fuse-and-skin remesher:
  - Turns a rigid-part creature into one smooth `SkinnedMesh`.
  - Keeps node clips, expressions and material names.
  - Run with `node run-refine.mjs flicket '{"cell":0.0065,"smooth":4,"ratio":0.3,"blendFor":[{"match":"tail","k":0.05}]}'`.
  - Works for creatures only; humans need per-clothing-shell handling.
  - It could still help for outlines, since outlines on rigid parts draw seams at every internal join.
- **`towebp.mjs`:** `node towebp.mjs <outDir> a.png b.png` converts frames to webp. `cwebp` and PIL are not installed on this machine.
- **`tests/lqcatch.mjs` and `tests/lqsave.mjs`.** Catching-flow and v1-save-migration tests against `npm run dev -- --port 4330`, at `http://127.0.0.1:4330/lumiquest/?debug`. **They have never completed.**
  - The last attempt died when the dev server was killed for low memory.
  - Swiftshader runs at about 1 fps, so the tests wait on game time (`window.lq.time`) rather than wall time.

### Machine notes (original dev box)

- About 7 GB RAM with about 2 GB free. Run one heavy job at a time.
- Use `TMPDIR=$HOME/.cache/yz-tmp`, and don't delete other projects' `/tmp` files.
- Heavy WebGL pages can hang `page.screenshot`. Throttle `requestAnimationFrame` and read the canvas with `toDataURL` after forcing `preserveDrawingBuffer`, or render once on demand as `lookdev.js` does.

## Open items and known bugs

- Catching gameplay and save migration are unverified (see Tests).
- Butterflies render as flat blue squares.
- The `lqsim` bridge/edge regression check was never re-run on this branch.
- Real-GPU performance is unmeasured.
- The cast lab and `public/_lab/` (git-excluded locally) are dev-only leftovers.

## Working rules the user set

- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commit or push only when asked. Never push WIP to `main`; `main` auto-deploys to GitHub Pages.
- Refer to the user as they/them. Never send the user's email anywhere.
- Third-party art must be licensed and credited. Performance matters.
- Ask one clear question per check-in, with frames to judge, before family-wide changes.

# Shared voxel characters

One character kit for Year Zero and LumiQuest. A character is a `ChibiSpec`
(`spec.ts`): face, hair, body and a list of outfit pieces. Every spec is drawn
as voxel art, so soldiers, leaders, civilians and LumiQuest's player and
villagers all come from the same builder.

- `voxel.ts`: sparse voxel grids with drawing helpers, and the mesher (only
  faces that touch air; per-corner ambient occlusion and a little colour
  variation baked into vertex colours).
- `vbody.ts`: the body template (head 10³ voxels, 8-wide torso, 3-wide limbs;
  30 voxels tall), every outfit piece, hair style, hat, prop and emblem, and the
  pixel-art faces for each expression.
- `model.ts`: `ChibiModel`, one skinned mesh per figure on the shared skeleton,
  with the face as a decal on the head bone that swaps for expressions and
  blinks.
- `rig.ts`: the skeleton (voxel layout) and the clip library.
- `crowd.ts`: team-coloured versions for instanced map squads (marker colours
  meshed unshaded; skin in its own mesh).
- `catalog.ts`, `leaders.ts`: the cast and the leader generator.
- `/games/character-lab`: unlisted page that lays out the cast
  (`?ids=scout,queen&views=front,threeq&clip=walk&face=1`), or real game
  scenes (`?scene=battle` / `?scene=audience`).

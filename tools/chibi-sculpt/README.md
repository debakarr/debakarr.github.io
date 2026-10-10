# Sculpt → game character (Blender, headless)

Turns a raw, untextured sculpt (e.g. an image-to-3D GLB of half a million
triangles) into a game-ready chibi: ~16k triangles, painted 2K texture with
baked AO and normal map, rigged with the shared chibi skeleton, exported as GLB.

Needs Blender 4.2 (the official build: Debian's lacks numpy for the glTF
importer). Raw sculpts go in `src/`, outputs land in `work/` (both untracked).

```sh
B=blender   # path to Blender 4.2
# 1. normalise (feet at 0, facing -Y, 1 m tall) and render grid views for authoring
$B -b --python prep.py -- src/knight.glb work/knight 1.0
# 2. iterate on colours by looking: paint rules preview on the sculpt (any view, zoom, 2 cm grid)
$B -b work/knight.blend --python render.py -- work/kp paint_knight.py threeq front:0.06:0.62:0.3:0.02
# 3. build: decimate, unwrap, bake, paint, rig, export work/knight.glb
$B -b work/knight.blend --python build.py -- knight.json mesh,paint,preview,rig
#    later passes reuse the baked mesh: work/knight_low.blend ... -- knight.json paint,rig
```

- **Paint rules** (`paint_*.py`) are numpy masks over model-space position and
  normal, so the same code paints sculpt vertices (previews) and baked texels.
  `paintlib.py` has the eye, blush and face helpers. Faces under hair locks are
  found from the front-view depth map (`face_mask`). Blue cloth is the faction
  colour: the game hue-shifts it per side.
- **Configs** (`*.json`): triangle budget, head UV boost, bake cage, joint
  positions for each chibi bone (read off the grid renders), rigid regions
  (head, props in hands), cuts of broken sculpted props and modelled
  replacements (`props`: sword, spear).
- **Weights**: Blender's heat weighting fails on fused sculpts, so it runs on a
  watertight voxel proxy at 10× scale (retrying voxel sizes) and is transferred
  to the game mesh.

Copy `work/<name>.glb` to `public/models/chibi/` and add it to the manifest
there (see `src/games/shared/chibi/README.md`).

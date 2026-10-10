# Normalise a raw sculpt (feet at origin, facing -Y in Blender = +Z in glTF,
# given height), save it as <out>.blend, and render front/side ortho views with
# a 5 cm grid (labels every 10 cm) for authoring regions and joints.
# usage: blender -b --python prep.py -- src.glb out height [rotZdeg]
import bpy, sys, math
import numpy as np
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
src, out, height = args[0], args[1], float(args[2])
rot = float(args[3]) if len(args) > 3 else 0.0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
if len(objs) > 1:
    bpy.ops.object.join()
hi = bpy.context.view_layer.objects.active
hi.name = 'high'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = hi.data
co = np.empty(len(me.vertices) * 3)
me.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
if rot:
    r = math.radians(rot)
    R = np.array([[math.cos(r), -math.sin(r), 0], [math.sin(r), math.cos(r), 0], [0, 0, 1]])
    co = co @ R.T
lo, hi_ = co.min(0), co.max(0)
s = height / (hi_[2] - lo[2])
co = (co - [(lo[0] + hi_[0]) / 2, (lo[1] + hi_[1]) / 2, lo[2]]) * s
me.vertices.foreach_set('co', co.ravel())
me.update()
# clean: merge doubles, consistent normals
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.shade_smooth()
print('verts', len(me.vertices), 'polys', len(me.polygons), 'bbox', co.min(0).round(3), co.max(0).round(3))
bpy.ops.wm.save_as_mainfile(filepath=out + '.blend')

# ---- grid renders
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 12
sc.cycles.device = 'CPU'
PX = 900
sc.render.resolution_x = PX
sc.render.resolution_y = PX
w = bpy.data.worlds.new('w')
sc.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.95, 0.92, 0.86, 1)
mat = bpy.data.materials.new('clay')
mat.use_nodes = True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.75, 0.72, 0.68, 1)
hi.data.materials.append(mat)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sc.collection.objects.link(sun)
sun.rotation_euler = (0.9, 0.3, -0.5)
sun.data.energy = 3
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = 'ORTHO'
span = height * 1.1
cam.data.ortho_scale = span
cz = height / 2
for name, yaw in [('front', 0), ('side', 90)]:
    r = math.radians(yaw)
    d = Vector((math.sin(r), -math.cos(r), 0))
    cam.location = Vector((0, 0, cz)) + d * 5
    cam.rotation_euler = (math.pi / 2, 0, r)
    path = f'{out}-{name}.png'
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    W, H = img.size
    px = np.array(img.pixels[:]).reshape(H, W, 4)
    m2p = PX / span  # pixels per metre; image row 0 is the bottom
    def col(u):
        return int(round(W / 2 + u * m2p))
    def row(v):
        return int(round(H / 2 + (v - cz) * m2p))
    for k in range(-12, 13):
        u = k * 0.05
        c = col(u)
        if 0 <= c < W:
            px[:, c, :3] = px[:, c, :3] * 0.6 + (np.array([0.9, 0.2, 0.2]) if k % 2 == 0 else np.array([0.3, 0.5, 0.9])) * 0.4
    for k in range(0, 25):
        v = k * 0.05
        rr = row(v)
        if 0 <= rr < H:
            px[rr, :, :3] = px[rr, :, :3] * 0.6 + (np.array([0.9, 0.2, 0.2]) if k % 2 == 0 else np.array([0.3, 0.5, 0.9])) * 0.4
    img.pixels[:] = px.ravel()
    img.save()
print('done')

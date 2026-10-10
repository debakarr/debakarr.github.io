# Render a prepped sculpt, optionally painted by a rules module.
# usage: blender -b work/x.blend --python render.py -- out paint|none view[:cx:cz:span[:grid]] ...
#   view: front | side | back | threeq | threeqb   (cx = horizontal centre in the view, cz = height)
import bpy, sys, math, importlib.util, os
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
out, paint = args[0], args[1]
views = args[2:]
hi = bpy.data.objects['high']
me = hi.data
sc = bpy.context.scene

if paint != 'none':
    spec = importlib.util.spec_from_file_location('paint', paint)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, os.path.dirname(os.path.abspath(paint)))
    spec.loader.exec_module(mod)
    n = len(me.vertices)
    P = np.empty(n * 3); me.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    N = np.empty(n * 3); me.vertices.foreach_get('normal', N); N = N.reshape(-1, 3)
    C = mod.paint(P, N)  # n x 3 sRGB 0..1 (or (colours, metal))
    C = C[0] if isinstance(C, tuple) else C
    if 'paint' in me.color_attributes:
        me.color_attributes.remove(me.color_attributes['paint'])
    ca = me.color_attributes.new('paint', 'FLOAT_COLOR', 'POINT')
    rgba = np.ones((n, 4)); rgba[:, :3] = np.clip(C, 0, 1) ** 2.2
    ca.data.foreach_set('color', rgba.ravel())
    mat = bpy.data.materials.new('painted'); mat.use_nodes = True
    nt = mat.node_tree; b = nt.nodes['Principled BSDF']
    a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'paint'
    nt.links.new(a.outputs[0], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.6
    me.materials.clear(); me.materials.append(mat)

sc.render.engine = 'CYCLES'
sc.cycles.samples = 16
sc.cycles.device = 'CPU'
sc.render.resolution_x = 700
sc.render.resolution_y = 700
w = bpy.data.worlds.get('w') or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.95, 0.92, 0.86, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
sun = bpy.data.objects.get('sun')
if sun is None:
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.rotation_euler = (0.9, 0.2, -0.6); sun.data.energy = 3.2
cam = bpy.data.objects.get('cam')
if cam is None:
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
sc.camera = cam; cam.data.type = 'ORTHO'
YAW = {'top': 0, 'front': 0, 'side': 90, 'back': 180, 'threeq': -35, 'threeqb': 145, 'left': -90}
zmax = max((hi.matrix_world @ Vector(c)).z for c in hi.bound_box)
for v in views:
    parts = v.split(':')
    name = parts[0]
    cx = float(parts[1]) if len(parts) > 1 else 0.0
    cz = float(parts[2]) if len(parts) > 2 else zmax / 2
    span = float(parts[3]) if len(parts) > 3 else zmax * 1.1
    grid = float(parts[4]) if len(parts) > 4 else 0
    r = math.radians(YAW[name])
    d = Vector((math.sin(r), -math.cos(r), 0))
    right = Vector((math.cos(r), math.sin(r), 0))
    cam.data.ortho_scale = span
    cam.location = Vector((0, 0, cz)) + right * cx + d * 5
    cam.rotation_euler = (math.pi / 2, 0, r)
    if name == 'top':  # looking down; image up = -Y (the front), right = +X
        cam.location = Vector((cx, -cz, 5))
        cam.rotation_euler = (0, 0, math.pi)
        cam.location = Vector((cx, cz, 5))
    path = f'{out}-{name}{"-z" if len(parts) > 1 else ""}.png'
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if grid:
        img = bpy.data.images.load(path); W, H = img.size
        px = np.array(img.pixels[:]).reshape(H, W, 4)
        m2p = W / span
        for k in range(-200, 201):
            u = k * grid
            c = int(round(W / 2 + (u - cx) * m2p)); rr = int(round(H / 2 + (u - cz) * m2p))
            colr = np.array([0.9, 0.2, 0.2]) if k % 5 == 0 else np.array([0.3, 0.5, 0.9])
            if 0 <= c < W: px[:, c, :3] = px[:, c, :3] * 0.6 + colr * 0.4
            if 0 <= rr < H: px[rr, :, :3] = px[rr, :, :3] * 0.6 + colr * 0.4
        img.pixels[:] = px.ravel(); img.save()
    print('wrote', path)

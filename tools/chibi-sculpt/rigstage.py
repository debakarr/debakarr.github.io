# Material, preview, armature + weights, GLB export.
import bpy, os, math
import numpy as np
from mathutils import Vector


def material(lo, work, name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes['Principled BSDF']
    def tex(path, colorspace):
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = bpy.data.images.load(path, check_existing=True)
        t.image.colorspace_settings.name = colorspace
        return t
    c = tex(os.path.join(work, f'{name}_color.png'), 'sRGB')
    nt.links.new(c.outputs[0], b.inputs['Base Color'])
    mr = tex(os.path.join(work, f'{name}_mr.png'), 'Non-Color')
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(mr.outputs[0], sep.inputs[0])
    nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    n = tex(os.path.join(work, f'{name}_normal.png'), 'Non-Color')
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(n.outputs[0], nm.inputs['Color'])
    nt.links.new(nm.outputs[0], b.inputs['Normal'])
    lo.data.materials.clear()
    lo.data.materials.append(mat)
    return mat


def preview(lo, out, views=('front', 'threeq', 'back')):
    sc = bpy.context.scene
    for o in bpy.data.objects:
        if o.type == 'MESH' and o is not lo:
            o.hide_render = True
    sc.cycles.samples = 24
    sc.render.resolution_x = sc.render.resolution_y = 700
    w = bpy.data.worlds.get('w') or bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.95, 0.92, 0.86, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sun = bpy.data.objects.get('sun') or bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    if sun.name not in sc.collection.objects:
        sc.collection.objects.link(sun)
    sun.rotation_euler = (0.9, 0.2, -0.6)
    sun.data.energy = 3.2
    cam = bpy.data.objects.get('cam') or bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = 'ORTHO'
    zmax = max((lo.matrix_world @ Vector(c)).z for c in lo.bound_box)
    cam.data.ortho_scale = zmax * 1.1
    for v in views:
        r = math.radians({'front': 0, 'threeq': -35, 'back': 180, 'side': 90}[v])
        cam.location = Vector((0, 0, zmax / 2)) + Vector((math.sin(r), -math.cos(r), 0)) * 5
        cam.rotation_euler = (math.pi / 2, 0, r)
        sc.render.filepath = f'{out}-{v}.png'
        bpy.ops.render.render(write_still=True)


def run(cfg, work, name, log, stages):
    lo = bpy.data.objects['low']
    material(lo, work, name)
    if 'preview' in stages:
        preview(lo, os.path.join(work, f'{name}-low'))
        log('preview rendered')
    if 'rig' in stages:
        ao = rig(lo, cfg, log)
        props = [make_prop(p, ao) for p in cfg.get('props', [])]
        export([lo, *props], ao, os.path.join(work, f'{name}.glb'), log)


PARENT = {'hips': None, 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck', 'cape': 'chest',
          'armL': 'chest', 'foreL': 'armL', 'handL': 'foreL', 'armR': 'chest', 'foreR': 'armR', 'handR': 'foreR',
          'thighL': 'hips', 'shinL': 'thighL', 'footL': 'shinL', 'thighR': 'hips', 'shinR': 'thighR', 'footR': 'shinR'}


def seg_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def rig(lo, cfg, log):
    if lo.data.validate(clean_customdata=False):
        log('repaired invalid geometry in the low mesh')
    for o in list(bpy.data.objects):
        if o.type == 'ARMATURE':
            bpy.data.objects.remove(o)
    lo.modifiers.clear()
    lo.vertex_groups.clear()
    arm = bpy.data.armatures.new('rig')
    ao = bpy.data.objects.new('rig', arm)
    bpy.context.scene.collection.objects.link(ao)
    bpy.ops.object.select_all(action='DESELECT')
    ao.select_set(True)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode='EDIT')
    J = cfg['joints']
    eb = {}
    for name in PARENT:
        b = arm.edit_bones.new(name)
        b.head = Vector(J[name][0])
        b.tail = Vector(J[name][1])
        b.roll = 0
        eb[name] = b
    for name, p in PARENT.items():
        if p:
            eb[name].parent = eb[p]
            eb[name].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    # heat weights on a watertight voxel proxy, transferred to the game mesh
    def attempt(vs):
        px = lo.copy()
        px.data = lo.data.copy()
        px.name = 'proxy'
        bpy.context.scene.collection.objects.link(px)
        px.modifiers.clear()
        rm = px.modifiers.new('remesh', 'REMESH')
        rm.mode = 'VOXEL'
        rm.voxel_size = vs
        bpy.ops.object.select_all(action='DESELECT')
        px.select_set(True)
        bpy.context.view_layer.objects.active = px
        bpy.ops.object.modifier_apply(modifier='remesh')
        log('proxy verts', len(px.data.vertices))
        # heat weighting fails on small meshes: weight a x10 copy with a x10 skeleton
        S = 10.0
        co = np.empty(len(px.data.vertices) * 3)
        px.data.vertices.foreach_get('co', co)
        px.data.vertices.foreach_set('co', co * S)
        px.data.update()
        tarm = bpy.data.armatures.new('tmp')
        to = bpy.data.objects.new('tmp', tarm)
        bpy.context.scene.collection.objects.link(to)
        bpy.ops.object.select_all(action='DESELECT')
        to.select_set(True)
        bpy.context.view_layer.objects.active = to
        bpy.ops.object.mode_set(mode='EDIT')
        tb = {}
        for name in PARENT:
            b = tarm.edit_bones.new(name)
            b.head = Vector(J[name][0]) * S
            b.tail = Vector(J[name][1]) * S
            tb[name] = b
        for name, p in PARENT.items():
            if p:
                tb[name].parent = tb[p]
        bpy.ops.object.mode_set(mode='OBJECT')
        bpy.ops.object.select_all(action='DESELECT')
        px.select_set(True)
        to.select_set(True)
        bpy.context.view_layer.objects.active = to
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        px.modifiers.clear()
        px.parent = None
        px.data.vertices.foreach_set('co', co)
        px.data.update()
        bpy.data.objects.remove(to)

        done = sum(1 for v in px.data.vertices if len(v.groups))
        log('voxel', vs, 'weighted', done, 'of', len(px.data.vertices))
        return px, done / max(1, len(px.data.vertices))

    for vs in (cfg.get('voxel', 0.008), 0.006, 0.011, 0.0145, 0.005):
        px, frac = attempt(vs)
        if frac > 0.9:
            break
        bpy.data.objects.remove(px)
        px = None
    for name in PARENT:
        lo.vertex_groups.new(name=name)
    if px is None:
        log('heat weighting failed at every voxel size; distance weights only')
    else:
        dt = lo.modifiers.new('dt', 'DATA_TRANSFER')
        dt.object = px
        dt.use_vert_data = True
        dt.data_types_verts = {'VGROUP_WEIGHTS'}
        dt.vert_mapping = 'POLYINTERP_NEAREST'
        dt.layers_vgroup_select_src = 'ALL'
        dt.layers_vgroup_select_dst = 'NAME'
        bpy.ops.object.select_all(action='DESELECT')
        lo.select_set(True)
        bpy.context.view_layer.objects.active = lo
        bpy.ops.object.modifier_apply(modifier='dt')
        bpy.data.objects.remove(px)
    n = len(lo.data.vertices)
    P = np.empty(n * 3)
    lo.data.vertices.foreach_get('co', P)
    P = P.reshape(-1, 3)
    names = list(PARENT)
    W = np.zeros((n, len(names)))
    gi = {g.index: names.index(g.name) for g in lo.vertex_groups if g.name in names}
    for v in lo.data.vertices:
        for g in v.groups:
            if g.group in gi:
                W[v.index, gi[g.group]] = g.weight
    empty = W.sum(1) < 1e-4
    log('heat weights missing on', int(empty.sum()), 'of', n, 'vertices')
    if empty.any():
        D = np.stack([seg_dist(P[empty], np.array(J[b][0]), np.array(J[b][1])) for b in names], 1)
        k = 1.0 / np.maximum(D, 0.004) ** 4
        W[empty] = k / k.sum(1, keepdims=True)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    for r in cfg.get('rigid', []):
        m = eval(r['expr'], {'np': np}, {'x': x, 'y': y, 'z': z})
        W[m] = 0
        W[m, names.index(r['bone'])] = 1
    # top 4 influences, normalised
    idx = np.argsort(-W, 1)[:, 4:]
    np.put_along_axis(W, idx, 0, 1)
    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
    for g in list(lo.vertex_groups):
        lo.vertex_groups.remove(g)
    groups = [lo.vertex_groups.new(name=b) for b in names]
    lo.parent = ao
    mod = lo.modifiers.new('rig', 'ARMATURE')
    mod.object = ao
    for j, g in enumerate(groups):
        col = W[:, j]
        nz = np.nonzero(col > 1e-4)[0]
        for wv in np.unique(np.round(col[nz], 3)):
            ids = nz[np.round(col[nz], 3) == wv].tolist()
            g.add(ids, float(wv), 'REPLACE')
    return ao


def export(objs, ao, path, log):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    ao.select_set(True)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_image_format='JPEG',
                              export_animations=False, export_skins=True, export_yup=True, export_apply=False,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT')
    log('exported', path, round(os.path.getsize(path) / 1e6, 2), 'MB')


def prop_material(name, color, metal, rough):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    h = color.lstrip('#')
    b.inputs['Base Color'].default_value = tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4)) + (1,)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    return m


def box(bm, cx, cy, cz, sx, sy, sz, mat_index, taper_top=1.0):
    import bmesh
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r['verts']:
        k = taper_top if v.co.z > 0 else 1.0
        v.co.x = cx + v.co.x * sx * k
        v.co.y = cy + v.co.y * sy
        v.co.z = cz + v.co.z * sz
    for f in {f for v in r['verts'] for f in v.link_faces}:
        f.material_index = mat_index


def make_prop(spec, ao):
    """A modelled prop (built along +Z from the grip), rigidly skinned to one bone."""
    import bmesh
    me = bpy.data.meshes.new(spec['type'])
    bm = bmesh.new()
    L = spec.get('length', 0.3)
    if spec['type'] == 'sword':
        box(bm, 0, 0, L * 0.5 + 0.045, 0.034, 0.008, L, 0, taper_top=0.25)  # blade with a point
        box(bm, 0, 0, L * 0.5 + 0.045, 0.006, 0.010, L * 0.96, 0)  # fuller ridge
        box(bm, 0, 0, 0.04, 0.11, 0.022, 0.018, 1)  # cross guard
        box(bm, 0, 0, -0.005, 0.02, 0.02, 0.075, 2)  # grip
        box(bm, 0, 0, -0.05, 0.034, 0.034, 0.03, 1)  # pommel
        mats = [prop_material('p_steel', '#d4dbe6', 0.85, 0.28), prop_material('p_gold', '#e0b040', 0.85, 0.32),
                prop_material('p_leather', '#5a3420', 0.0, 0.7)]
    elif spec['type'] == 'spear':
        box(bm, 0, 0, L * 0.5, 0.022, 0.022, L, 0)  # shaft
        box(bm, 0, 0, L + 0.06, 0.05, 0.01, 0.12, 1, taper_top=0.1)  # head
        box(bm, 0, 0, L + 0.002, 0.03, 0.03, 0.02, 2)  # collar
        mats = [prop_material('p_wood', '#8a5a32', 0.0, 0.7), prop_material('p_steel', '#d4dbe6', 0.85, 0.28),
                prop_material('p_gold', '#e0b040', 0.85, 0.32)]
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.002, segments=1, affect='EDGES')
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(spec['type'], me)
    bpy.context.scene.collection.objects.link(ob)
    d = Vector(spec['dir']).normalized()
    rot = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
    if 'roll' in spec:
        from mathutils import Matrix
        rot = rot @ Matrix.Rotation(math.radians(spec['roll']), 4, 'Z')
    ob.matrix_world = Matrix_translation(Vector(spec['grip'])) @ rot
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    g = ob.vertex_groups.new(name=spec['bone'])
    g.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    ob.parent = ao
    mod = ob.modifiers.new('rig', 'ARMATURE')
    mod.object = ao
    return ob


def Matrix_translation(v):
    from mathutils import Matrix
    return Matrix.Translation(v)

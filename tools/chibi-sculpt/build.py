# Sculpt -> game character. Stage "mesh": decimate, unwrap, bake position /
# normal / AO / tangent normals from the sculpt, paint at texel resolution.
# Stage "rig": armature with the shared chibi bone names, skin weights, GLB.
# usage: blender -b work/x.blend --python build.py -- <char.json> [stages]
import bpy, bmesh, sys, os, json, math, importlib.util, time
import numpy as np
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:]
CFG = json.load(open(ARGS[0]))
STAGES = ARGS[1].split(',') if len(ARGS) > 1 else ['mesh', 'rig']
HERE = os.path.dirname(os.path.abspath(ARGS[0]))
WORK = os.path.join(HERE, 'work')
NAME = CFG['name']
RES = CFG.get('res', 2048)
T0 = time.time()


def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)


sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'


def select_only(objs, active):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def load_paint():
    sys.path.insert(0, HERE)
    spec = importlib.util.spec_from_file_location('paintmod', os.path.join(HERE, CFG['paint']))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def img_np(img):
    a = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def save_png(arr, path, srgb=True):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = arr
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


def stage_mesh():
    hi = bpy.data.objects['high']
    # --- cut away broken sculpted props (replaced by modelled ones in the rig stage)
    if CFG.get('cut'):
        import bmesh as _bm
        bm = _bm.new()
        bm.from_mesh(hi.data)
        cut = [v for v in bm.verts if eval(CFG['cut'], {'np': np}, {'x': v.co.x, 'y': v.co.y, 'z': v.co.z})]
        _bm.ops.delete(bm, geom=cut, context='VERTS')
        bm.to_mesh(hi.data)
        bm.free()
        log('cut', len(cut), 'sculpt vertices')
    # --- AO on the sculpt, into a vertex colour
    for c in list(hi.data.color_attributes):
        hi.data.color_attributes.remove(c)
    hi.data.color_attributes.new('ao', 'BYTE_COLOR', 'CORNER')
    hi.data.color_attributes.active_color = hi.data.color_attributes['ao']
    hmat = bpy.data.materials.new('hi_bake')
    hmat.use_nodes = True
    hi.data.materials.clear()
    hi.data.materials.append(hmat)
    select_only([hi], hi)
    sc.cycles.samples = CFG.get('ao_samples', 24)
    log('baking AO on the sculpt')
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    # --- low poly
    log('decimating')
    lo = hi.copy()
    lo.data = hi.data.copy()
    lo.name = 'low'
    sc.collection.objects.link(lo)
    for c in list(lo.data.color_attributes):
        lo.data.color_attributes.remove(c)
    m = lo.modifiers.new('dec', 'DECIMATE')
    m.ratio = CFG.get('tris', 16000) / len(hi.data.polygons)
    select_only([lo], lo)
    bpy.ops.object.modifier_apply(modifier='dec')
    log('low tris', len(lo.data.polygons))
    # --- UVs: head and body unwrapped separately, head texels x2
    head_z = CFG['head_uv_z']
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(lo.data)
    for f in bm.faces:
        f.select = f.calc_center_median().z > head_z
    bmesh.update_edit_mesh(lo.data)
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002)
    bm = bmesh.from_edit_mesh(lo.data)
    for f in bm.faces:
        f.select = not f.select
    bmesh.update_edit_mesh(lo.data)
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002)
    bm = bmesh.from_edit_mesh(lo.data)
    uv = bm.loops.layers.uv.active
    k = CFG.get('head_uv_scale', 2.0)
    for f in bm.faces:
        if f.calc_center_median().z > head_z:
            for l in f.loops:
                l[uv].uv *= k
    for f in bm.faces:
        f.select = True
    bmesh.update_edit_mesh(lo.data)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    log('unwrapped')
    # --- bake targets
    lmat = bpy.data.materials.new('low_bake')
    lmat.use_nodes = True
    lo.data.materials.clear()
    lo.data.materials.append(lmat)
    tex = lmat.node_tree.nodes.new('ShaderNodeTexImage')
    lmat.node_tree.nodes.active = tex
    nt = hmat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    emit = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(emit.outputs[0], out.inputs[0])
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    mad = nt.nodes.new('ShaderNodeVectorMath')
    mad.operation = 'MULTIPLY_ADD'
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'ao'
    select_only([hi, lo], lo)
    sc.cycles.samples = 1
    bake = dict(type='EMIT', use_selected_to_active=True, cage_extrusion=CFG.get('cage', 0.012),
                max_ray_distance=CFG.get('ray', 0.04), margin=6)

    def bake_emit(src_socket, scale, offset, name):
        nt.links.new(src_socket, mad.inputs[0])
        mad.inputs[1].default_value = scale
        mad.inputs[2].default_value = offset
        nt.links.new(mad.outputs[0], emit.inputs[0])
        img = bpy.data.images.new(name, RES, RES, alpha=True, float_buffer=True)
        img.generated_color = (0, 0, 0, 0)
        tex.image = img
        bpy.ops.object.bake(**bake)
        return img_np(img)

    log('baking position / normal / ao')
    pos = bake_emit(geo.outputs['Position'], (1, 1, 1), (0.5, 0.5, 0.0), 'pos')
    nrm = bake_emit(geo.outputs['Normal'], (0.5, 0.5, 0.5), (0.5, 0.5, 0.5), 'nrm')
    ao = bake_emit(vc.outputs['Color'], (1, 1, 1), (0, 0, 0), 'ao')
    # tangent-space normals (the sculpt's detail on the low mesh)
    nt.links.new(geo.outputs['Normal'], emit.inputs[0])
    nimg = bpy.data.images.new('normal', RES // 2, RES // 2, alpha=False, float_buffer=False)
    nimg.colorspace_settings.name = 'Non-Color'
    tex.image = nimg
    log('baking tangent normals')
    bpy.ops.object.bake(type='NORMAL', use_selected_to_active=True, cage_extrusion=bake['cage_extrusion'],
                        max_ray_distance=bake['max_ray_distance'], margin=6, normal_space='TANGENT')
    nimg.filepath_raw = os.path.join(WORK, f'{NAME}_normal.png')
    nimg.file_format = 'PNG'
    nimg.save()
    np.save(os.path.join(WORK, f'{NAME}_pos.npy'), pos)
    np.save(os.path.join(WORK, f'{NAME}_nrm.npy'), nrm)
    np.save(os.path.join(WORK, f'{NAME}_ao.npy'), ao)
    hi.data.materials.clear()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, f'{NAME}_low.blend'))
    log('mesh stage saved')


def stage_paint():
    pos = np.load(os.path.join(WORK, f'{NAME}_pos.npy'))
    nrm = np.load(os.path.join(WORK, f'{NAME}_nrm.npy'))
    ao = np.load(os.path.join(WORK, f'{NAME}_ao.npy'))
    H, W = pos.shape[:2]
    valid = pos[..., 3] > 0.5
    # fill pinholes where a bake ray missed the sculpt: copy a valid neighbour
    filled = 0
    for _ in range(6):
        hole = ~valid
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nb = np.roll(valid, (dy, dx), (0, 1))
            take = hole & nb
            if take.any():
                for a in (pos, nrm, ao):
                    a[take] = np.roll(a, (dy, dx), (0, 1))[take]
                valid = valid | take
                hole = hole & ~take
                filled += int(take.sum())
    log('filled', filled, 'missed texels')
    P = pos[..., :3][valid] - np.array([0.5, 0.5, 0.0])
    N = nrm[..., :3][valid] * 2 - 1
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-6)
    mod = load_paint()
    import inspect
    kw = {}
    hi = bpy.data.objects.get('high')
    if hi is not None and 'high' in inspect.signature(mod.paint).parameters:
        n = len(hi.data.vertices)
        Ph = np.empty(n * 3)
        hi.data.vertices.foreach_get('co', Ph)
        Nh = np.empty(n * 3)
        hi.data.vertices.foreach_get('normal', Nh)
        kw['high'] = (Ph.reshape(-1, 3), Nh.reshape(-1, 3))
    res = mod.paint(P, N, **kw)
    C, M = (res if isinstance(res, tuple) else (res, None))
    a = ao[..., 0][valid][:, None]
    s = CFG.get('ao_strength', 0.55)
    C = C * (1 - s + s * a)
    col = np.zeros((H, W, 3), dtype=np.float32)
    col[valid] = np.clip(C, 0, 1)
    save_png(col, os.path.join(WORK, f'{NAME}_color.png'))
    # glTF metallicRoughness: G = roughness, B = metalness
    mr = np.zeros((H, W, 3), dtype=np.float32)
    mr[..., 1] = 0.75
    if M is not None:
        mm = np.zeros((H, W), dtype=np.float32)
        mm[valid] = M
        mr[..., 2] = mm * CFG.get('metal', 0.7)
        mr[..., 1] = 0.75 - mm * 0.4
    save_png(mr[::4, ::4].copy(), os.path.join(WORK, f'{NAME}_mr.png'), srgb=False)  # mostly flat: 512 px is plenty
    log('painted', int(valid.sum()), 'texels')


if 'mesh' in STAGES:
    stage_mesh()
if 'paint' in STAGES:
    stage_paint()
if 'rig' in STAGES or 'preview' in STAGES:
    sys.path.insert(0, HERE)
    import rigstage
    rigstage.run(CFG, WORK, NAME, log, STAGES)

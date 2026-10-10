# Region painting on point sets (sculpt vertices or baked texels).
# Colours are sRGB 0..1. Decals (eyes, blush) are front-projected onto (x, z).
import numpy as np


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


class Painter:
    def __init__(self, P, N, base):
        self.P = P
        self.N = N
        self.C = np.tile(hexc(base), (len(P), 1))
        self.metals = set()
        self.base = base
        self.M = np.zeros(len(P))

    def set(self, mask, color, alpha=1.0):
        c = hexc(color) if isinstance(color, str) else np.asarray(color)
        if np.ndim(alpha) == 0 and alpha >= 0.5:
            self.M[mask] = 1.0 if color in self.metals else 0.0
        if np.ndim(alpha) == 0:
            self.C[mask] = self.C[mask] * (1 - alpha) + c * alpha
        else:
            a = alpha[mask][:, None]
            self.C[mask] = self.C[mask] * (1 - a) + c * a

    def blob(self, mask, centre, rx, rz, color, alpha=1.0, soft=0.35):
        x, z = self.P[:, 0], self.P[:, 2]
        d = np.hypot((x - centre[0]) / rx, (z - centre[1]) / rz)
        a = np.clip((1 - d) / soft, 0, 1) * alpha
        self.set(mask & (a > 0), color, a)

    def eye(self, mask, centre, rx, rz, iris='#4a2a18'):
        """An anime/Pixar eye: white, big iris, pupil, two highlights, dark upper lid."""
        x, z = self.P[:, 0], self.P[:, 2]
        cx, cz = centre
        e = np.hypot((x - cx) / rx, (z - cz) / rz)
        m = mask & (e < 1)
        self.set(m, '#fbfbf8')
        ir = np.hypot((x - cx) / (rx * 0.72), (z - cz + rz * 0.06) / (rz * 0.82))
        self.set(m & (ir < 1), iris)
        lo = (z - cz) < -rz * 0.25
        self.set(m & (ir < 1) & lo, '#8a5a30', 0.6)
        self.set(m & (ir < 0.45), '#1a0e08')
        h1 = np.hypot((x - cx + rx * 0.22) / (rx * 0.22), (z - cz - rz * 0.3) / (rz * 0.2))
        self.set(m & (h1 < 1), '#ffffff')
        h2 = np.hypot((x - cx - rx * 0.25) / (rx * 0.1), (z - cz + rz * 0.35) / (rz * 0.09))
        self.set(m & (h2 < 1), '#ffffff')
        lid = mask & (np.abs(e - 1) < 0.18) & ((z - cz) > -rz * 0.1)
        self.set(lid, '#2a1810')
        lid2 = mask & (e < 1.15) & ((z - cz) > rz * 0.72)
        self.set(lid2, '#2a1810')

    def result(self):
        return self.C, self.M


def nearest_labels(src_points, src_labels, query):
    """Label each query point with the label of its nearest source point (mathutils KD-tree)."""
    from mathutils.kdtree import KDTree
    t = KDTree(len(src_points))
    for i, c in enumerate(src_points):
        t.insert(c, i)
    t.balance()
    out = np.zeros(len(query), dtype=src_labels.dtype)
    for j, c in enumerate(query):
        out[j] = src_labels[t.find(c)[1]]
    return out


def face_by_depth(P, zone, seed, cell=0.0015, jump=0.0038):
    """Front-view depth map of the zone; flood-fill from the seed across smooth depth.
    Hair locks lying on the face stand off it with a depth jump at their edges."""
    from collections import deque
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    zx, zz = x[zone], z[zone]
    x0, z0 = zx.min(), zz.min()
    gi = np.floor((x - x0) / cell).astype(int)
    gk = np.floor((z - z0) / cell).astype(int)
    W, H = gi[zone].max() + 1, gk[zone].max() + 1
    depth = np.full((W, H), np.inf)
    np.minimum.at(depth, (gi[zone], gk[zone]), y[zone])
    # fill empty cells from neighbours so the map has no pinholes
    for _ in range(3):
        d = depth.copy()
        for sh in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            d = np.minimum(d, np.roll(depth, sh, (0, 1)))
        depth = np.where(np.isinf(depth), d, depth)
    ok = ~np.isinf(depth)
    si, sk = int((seed[0] - x0) / cell), int((seed[1] - z0) / cell)
    reach = np.zeros((W, H), bool)
    q = deque([(si, sk)])
    reach[si, sk] = True
    while q:
        i, k = q.popleft()
        for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = i + di, k + dk
            if 0 <= a < W and 0 <= b < H and ok[a, b] and not reach[a, b] and abs(depth[a, b] - depth[i, k]) < jump:
                reach[a, b] = True
                q.append((a, b))
    # locks hang from the hairline: unreached cells connected to the top edge
    lockc = np.zeros((W, H), bool)
    top = H - 1 - int(0.008 / cell)
    q = deque()
    for i in range(W):
        for k in range(top, H):
            if ok[i, k] and not reach[i, k]:
                lockc[i, k] = True
                q.append((i, k))
    while q:
        i, k = q.popleft()
        for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = i + di, k + dk
            if 0 <= a < W and 0 <= b < H and ok[a, b] and not reach[a, b] and not lockc[a, b]:
                lockc[a, b] = True
                q.append((a, b))
    facecells = ~lockc
    inb = zone & (gi >= 0) & (gi < W) & (gk >= 0) & (gk < H)
    res = np.zeros(len(P), bool)
    gi_, gk_ = gi[inb], gk[inb]
    res[inb] = facecells[gi_, gk_] & (y[inb] < depth[gi_, gk_] + 0.012)
    return res


def face_mask(P, zone_fn, seed, high=None):
    """Face texels inside zone_fn: depth-map flood fill on the sculpt's vertices, nearest-vertex labels."""
    zone = zone_fn(P)
    if high is None:
        return face_by_depth(P, zone, seed=seed), zone
    Ph = high[0]
    zh = zone_fn(Ph)
    fh = face_by_depth(Ph, zh, seed=seed)
    face = np.zeros(len(P), bool)
    face[zone] = nearest_labels(Ph[zh], fh[zh], P[zone])
    return face, zone

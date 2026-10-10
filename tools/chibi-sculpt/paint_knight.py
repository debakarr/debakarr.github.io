# Swordsman colours for the knight sculpt. Coordinates: metres, feet at z=0,
# facing -Y, the character's right hand at -X.
import numpy as np
from paintlib import Painter, hexc

STEEL = '#9ea8b8'
STEEL_D = '#6f7886'
GOLD = '#d9a93a'
BLUE = '#2f62c8'
BLUE_D = '#1f3f8e'
LEATHER = '#7a4a2a'
LEATHER_D = '#4e2e1a'
PANTS = '#4a3b33'
SKIN = '#f3c6a2'
HAIR = '#6b3d20'

FACE_X = 0.062


def visor_z(x):
    # the helmet's lower edge over the face: dips at the centre
    return 0.69 - 0.015 * np.exp(-((x - FACE_X) / 0.03) ** 2)


def bang_z(x):
    # lower edge of the fringe under the visor: a point in the middle
    return 0.656 - 0.026 * np.exp(-((x - FACE_X) / 0.05) ** 2)


def eroded(u, z, mask, cell, steps):
    gu = np.floor((u - u[mask].min()) / cell).astype(int) + steps + 1
    gz = np.floor((z - z[mask].min()) / cell).astype(int) + steps + 1
    W, H = gu[mask].max() + steps + 2, gz[mask].max() + steps + 2
    occ = np.zeros((W, H), bool)
    occ[gu[mask], gz[mask]] = True
    # close small holes first (texels are sparse), then erode
    for _ in range(2):
        occ = occ | np.roll(occ, 1, 0) | np.roll(occ, -1, 0) | np.roll(occ, 1, 1) | np.roll(occ, -1, 1)
    for _ in range(steps + 2):
        occ = occ & np.roll(occ, 1, 0) & np.roll(occ, -1, 0) & np.roll(occ, 1, 1) & np.roll(occ, -1, 1)
    ok = (gu >= 0) & (gu < W) & (gz >= 0) & (gz < H)
    out = np.zeros(len(u), bool)
    out[ok] = occ[gu[ok], gz[ok]]
    return out


def shield_paint(p, x, y, z, N):
    sh = (x > 0.1) & (y < -0.11) & (z > 0.09) & (z < 0.5)
    ns = np.array([0.56, -0.83, 0.0])
    ua = np.array([-0.83, -0.56, 0.0])
    u = x * ua[0] + y * ua[1]
    front = sh & (N @ ns > 0.45)
    back = sh & (N @ ns < -0.45)
    p.set(sh, '#c9a050')
    p.set(back, LEATHER)
    p.set(front, BLUE)
    # gold border: the plate's silhouette in (u, z), eroded; outside the core is rim
    rim = front & ~eroded(u, z, front, cell=0.004, steps=5)
    p.set(rim, GOLD)
    d = np.hypot(x - 0.29, z - 0.34)
    p.set(front & (d < 0.05), GOLD)
    p.set(front & (d < 0.02), '#f0d070')


def paint(P, N):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    p = Painter(P, N, STEEL)
    p.metals = {STEEL, GOLD, '#c4ccd8', '#c9a050', '#f0d070'}
    p.M[:] = 1.0
    head = (z > 0.525) & (np.hypot(x - FACE_X, y - 0.01) < 0.26)
    # body
    p.set((z < 0.30) & (z > 0.12), PANTS)
    p.set(z < 0.17, STEEL)  # greaves
    p.set(z < 0.085, LEATHER)  # boots
    p.set((z < 0.02), LEATHER_D)  # soles
    # tabard skirt in front of the hips
    p.set((z > 0.16) & (z < 0.33) & (np.abs(x - 0.055) < 0.1) & (y < 0.02), BLUE)
    p.set((z > 0.16) & (z < 0.185) & (np.abs(x - 0.055) < 0.1) & (y < 0.02), GOLD)
    # belt + buckle
    p.set((z > 0.318) & (z < 0.348) & (np.hypot(x - 0.05, y) < 0.16), LEATHER)
    p.set((z > 0.316) & (z < 0.35) & (np.abs(x - 0.06) < 0.02) & (y < -0.05), GOLD)
    # pouch on the right hip
    p.set((x < -0.02) & (x > -0.13) & (z > 0.24) & (z < 0.35) & (y < 0.02), LEATHER)
    # scarf around the neck
    ell0 = ((P[:, 0] - FACE_X) / 0.16) ** 2 + ((y + 0.01) / 0.17) ** 2 + ((z - 0.615) / 0.095) ** 2 < 1.1
    p.set((z > 0.44) & (z < 0.54) & (np.hypot(x - 0.05, y - 0.01) < 0.15) & ~head & ~ell0, BLUE)
    # cape: everything behind the body, and the flap flowing off the right side
    p.set((y > 0.07) & (z > 0.1) & (z < 0.53), BLUE)
    p.set((y > 0.07) & (z > 0.1) & (z < 0.53) & (N[:, 1] < -0.3), BLUE_D)  # lining
    p.set((x < -0.13) & (z > 0.1) & (z < 0.3), BLUE)
    p.set((x < -0.13) & (z > 0.1) & (z < 0.42) & (y > -0.05), BLUE)
    # sword: blade beyond the fist, gold guard at the fist; leather gloves
    p.set((x < -0.26) & (z > 0.25) & (y < -0.08), '#c4ccd8')
    p.set((x < -0.235) & (x > -0.285) & (z > 0.28) & (z < 0.38) & (y < -0.08), GOLD)
    p.set(np.hypot(np.hypot(x + 0.235, y + 0.14), z - 0.33) < 0.045, LEATHER)
    shield_paint(p, x, y, z, N)
    # head: helmet shell, gold visor edge, face, hair under the helmet, plume
    p.set(head, STEEL)
    ell = ((x - FACE_X) / 0.16) ** 2 + ((y + 0.01) / 0.17) ** 2 + ((z - 0.615) / 0.095) ** 2 < 1.05
    face = (z > 0.512) & ell & (y < -0.02) & (np.abs(x - FACE_X) < 0.15) & (z < bang_z(x))
    p.set(head & (y < -0.02) & (np.abs(x - FACE_X) < 0.15) & (z >= visor_z(x)) & (z < visor_z(x) + 0.018), GOLD)
    p.set(head & ell & (y < -0.02) & (np.abs(x - FACE_X) < 0.15) & (z >= bang_z(x)) & (z < visor_z(x)), HAIR)
    p.set(face, SKIN)
    # plume: everything outside the helmet dome
    dome = np.sqrt((x - FACE_X) ** 2 + (y - 0.0) ** 2 + (z - 0.66) ** 2)
    p.set((z > 0.6) & (dome > 0.215) & (y > -0.1), BLUE)
    p.set((z > 0.84) | ((y > 0.13) & (z > 0.56)) | ((x < -0.12) & (z > 0.68)), BLUE)
    # eyes, brows, cheeks, mouth on the face
    for s in (-1, 1):
        p.eye(face, (FACE_X + s * 0.05, 0.598), 0.019, 0.024, iris='#5a3418')
        p.blob(face, (FACE_X + s * 0.082, 0.572), 0.02, 0.01, '#f29a8c', 0.45)
        # brows peek out under the fringe
    p.blob(face, (FACE_X, 0.553), 0.011, 0.0035, '#9a4636', 1.0)
    return p.result()

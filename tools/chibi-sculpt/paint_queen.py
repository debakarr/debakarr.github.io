# Sunland Queen colours for the queen sculpt (metres, feet at z=0, facing -Y,
# the character's right at -X).
import numpy as np
from paintlib import Painter, face_mask

BLUE = '#2f55b8'
BLUE_D = '#22408c'
CREAM = '#efe2c4'
GOLD = '#e0b040'
GOLD_D = '#b0802a'
SKIN = '#b9784e'
HAIR = '#2a1a14'
HAIR_L = '#4a3024'
GEM = '#4fa8e8'
CRYSTAL = '#cfe8ff'


def zone_fn(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    return (((x - 0.015) / 0.13) ** 2 + ((z - 0.64) / 0.075) ** 2 < 1) & (y < -0.05) & (z > 0.575)


def paint(P, N, high=None):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    p = Painter(P, N, BLUE)
    p.metals = {GOLD, GOLD_D, CRYSTAL}
    # gown: cream underskirt panel in front, widening to the hem, gold hem band
    panel = (z < 0.385) & (np.abs(x - 0.005) < 0.075 + (0.385 - z) * 0.32) & (y < 0.0)
    p.set(panel, CREAM)
    p.set(panel & (np.abs(np.abs(x - 0.005) - (0.075 + (0.385 - z) * 0.32)) < 0.012), GOLD)
    p.set((z < 0.06) & (y < 0.05), GOLD)
    # bodice and belt
    p.set((z > 0.37) & (z < 0.55) & (np.abs(x) < 0.075) & (y < 0.0), BLUE)
    p.set((z > 0.37) & (z < 0.395) & (np.abs(x) < 0.09), GOLD)
    p.set((z > 0.42) & (z < 0.55) & (np.abs(x - 0.005) < 0.012) & (y < -0.04), GOLD)  # lacing
    # cape lining shows inside the opening
    p.set((np.abs(x) > 0.12) & (z < 0.45) & (N[:, 1] > 0.3), BLUE_D)
    # puff sleeves with gold cuffs; hands and neck
    p.set((z > 0.47) & (z < 0.58) & (np.abs(x) > 0.09) & (np.abs(x) < 0.24), BLUE)
    p.set((z > 0.465) & (z < 0.485) & (np.abs(x) > 0.1) & (np.abs(x) < 0.25), GOLD)
    p.set((x > 0.215) & (z > 0.41) & (z < 0.48), SKIN)  # open left hand
    p.set((x < -0.195) & (x > -0.26) & (z > 0.42) & (z < 0.49) & (y < -0.0), SKIN)  # hand on the staff
    p.set((z > 0.545) & (z < 0.6) & (np.abs(x - 0.01) < 0.06) & (y < 0.04), SKIN)  # neck
    p.set((z > 0.545) & (z < 0.565) & (np.abs(x - 0.01) < 0.06) & (y < -0.02), GOLD)  # necklace
    # head: hair, crown, face
    hc = np.array([0.01, 0.0, 0.68])
    r = np.linalg.norm(P - hc, axis=1)
    hair = (z > 0.585) | ((z > 0.42) & (r < 0.3) & (np.abs(x) > 0.08) & (np.abs(x) < 0.2) & (y > -0.06))
    p.set(hair, HAIR)
    p.set(hair & (N[:, 2] > 0.55), HAIR_L)
    crown = (z > 0.8) & (np.abs(x) < 0.22)
    p.set(crown, GOLD)
    p.set(crown & (z > 0.84) & (z < 0.88) & (np.abs(x - 0.01) < 0.03) & (y < -0.05), GEM)
    # staff: gold shaft, crystal finial (after the hair, which it passes beside)
    staff = ((x < -0.18) & (y < -0.06) & (z > 0.04)) | ((x < -0.185) & (z > 0.6))
    p.set(staff & ~((z > 0.42) & (z < 0.49)), GOLD)
    p.set(staff & (z > 0.72), CRYSTAL)
    p.set((x < -0.27) & (z > 0.6), GOLD)  # the ornament hanging from the finial
    p.set(staff & (z > 0.66) & (z < 0.72), GOLD_D)
    face, zone = face_mask(P, zone_fn, seed=(0.015, 0.62), high=high)
    p.set(zone & ~face, HAIR)
    p.set(face, SKIN)
    # eyes (the left one shows; the right sits under the fringe), blush, lips, earrings
    for ex in (0.088, -0.058):
        p.eye(face, (ex, 0.655), 0.021, 0.027, iris='#3a2216')
    p.blob(face, (0.105, 0.618), 0.02, 0.01, '#e0766a', 0.4)
    p.blob(face, (-0.07, 0.618), 0.02, 0.01, '#e0766a', 0.4)
    p.blob(face, (0.018, 0.598), 0.012, 0.005, '#8a3a32', 0.9)
    for ex in (-0.115, 0.135):
        d = np.sqrt((x - ex) ** 2 + (y + 0.02) ** 2 + (z - 0.6) ** 2)
        p.set(d < 0.018, GOLD)
    return p.result()

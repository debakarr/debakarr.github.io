# Scout colours for the spiky-haired kid sculpt (metres, feet at z=0, facing -Y,
# the character's right at -X).
import numpy as np
from paintlib import Painter, nearest_labels, face_by_depth

BLUE = '#2f62c8'
BLUE_D = '#1f3f8e'
CREAM = '#efe4cc'
SHORTS = '#4a3b33'
LEATHER = '#7a4a2a'
LEATHER_D = '#4e2e1a'
GOLD = '#d9a93a'
SKIN = '#f3c6a2'
HAIR = '#6b3d20'
HAIR_L = '#8a5530'
STEEL = '#b8c0cc'


def face_zone(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    return ((x / 0.1) ** 2 + ((z - 0.585) / 0.072) ** 2 < 1) & (y < -0.04) & (z > 0.515) & (z < 0.668)


def paint(P, N, high=None):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    p = Painter(P, N, BLUE)
    p.metals = {GOLD, STEEL}
    # legs and shoes
    p.set(z < 0.17, SKIN)
    p.set(z < 0.135, CREAM)  # socks
    p.set(z < 0.12, LEATHER)  # shoes
    p.set(z < 0.022, LEATHER_D)
    # shorts
    p.set((z > 0.15) & (z < 0.37) & (np.abs(x) < 0.15), SHORTS)
    p.set((z > 0.15) & (z < 0.19) & (np.abs(x) < 0.15), '#3a2e28')  # cuffs
    # jacket (blue, the default) with dark-blue cuffs, and the shirt between the open fronts
    p.set((z > 0.36) & (z < 0.52) & (x > -0.075) & (x < 0.055) & (y < -0.02), CREAM)
    p.set((z > 0.3) & (z < 0.37) & (np.abs(x) > 0.1) & (y < 0.05), BLUE_D)
    # hands
    for c in ((-0.115, -0.05, 0.33), (0.11, -0.04, 0.29)):
        d = np.sqrt((x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2)
        p.set(d < 0.035, SKIN)
    # gear: hip pouch, bedroll and scabbards on the back and in the left hand
    p.set((x < -0.13) & (z > 0.25) & (z < 0.35), LEATHER)
    p.set((x > 0.09) & (z > 0.35) & (z < 0.49) & (y > 0.0), LEATHER)
    p.set((x > 0.085) & (z > 0.14) & (z < 0.29) & (y > -0.1), LEATHER_D)
    p.set((y > 0.05) & (z > 0.14) & (z < 0.5) & (np.abs(x) < 0.25), LEATHER)
    p.set((y > -0.02) & (z > 0.3) & (z < 0.5) & (x < -0.12), LEATHER)
    p.set((x < -0.14) & (z > 0.58) & (z < 0.68), LEATHER_D)  # sword grip over the shoulder
    p.set((x < -0.14) & (z > 0.58) & (z < 0.68) & (x > -0.165), GOLD)
    # head: everything up top is hair except the face
    head_c = np.array([0.0, 0.0, 0.62])
    r = np.linalg.norm(P - head_c, axis=1)
    hair = (z > 0.53) & ((r > 0.13) | (z > 0.6))
    p.set(hair, HAIR)
    p.set(hair & (N[:, 2] > 0.6), HAIR_L)  # light catching the tops of the spikes
    # hair locks lying over the face are told apart by the front-view depth map;
    # on texels, classify on the sculpt's vertices and take the nearest vertex's label
    zone = face_zone(P)
    if high is None:
        face = face_by_depth(P, zone, seed=(0.0, 0.575))
    else:
        Ph = high[0]
        zh = face_zone(Ph)
        fh = face_by_depth(Ph, zh, seed=(0.0, 0.575))
        face = np.zeros(len(P), bool)
        face[zone] = nearest_labels(Ph[zh], fh[zh], P[zone])
    lock = zone & ~face
    p.set(face, SKIN)
    p.set(lock, HAIR)
    p.set((z > 0.49) & (z < 0.535) & (np.abs(x) < 0.055) & (y < 0.03) & ~face & ~lock, SKIN)  # neck
    for s in (-1, 1):
        p.eye(face & ~lock, (s * 0.04, 0.624), 0.02, 0.026, iris='#5a3418')
        p.blob(face, (s * 0.07, 0.585), 0.02, 0.01, '#f29a8c', 0.45)
    p.blob(face, (-0.01, 0.552), 0.03, 0.004, '#9a4636', 0.9)
    return p.result()

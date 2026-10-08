// Creatures as live 3D models, so the world is not empty of the thing this
// game is about. Each family (kit / shell / wing / scale / moth) is modelled
// from primitives with the same palette the 2D art uses, so a creature you
// meet matches its portrait. One buildCreature call per wild encounter.

import {
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
} from 'three';
import { SPECIES_BY_ID } from '../../data/species';
import { palette, type CreatureArt } from '../creature';

const mat = (color: string, emissive?: string): MeshLambertMaterial =>
  new MeshLambertMaterial({ color, flatShading: true, emissive: emissive ?? '#000000' });

function eye(group: Group, x: number, y: number, z: number): void {
  const e = new Mesh(new SphereGeometry(0.028, 6, 5), mat('#1a1a22'));
  e.position.set(x, y, z);
  group.add(e);
}

/** Foxlike kit: sleek body, pointed ears, a brush of a tail. */
function kit(art: CreatureArt, p: ReturnType<typeof palette>): Group {
  const g = new Group();
  const body = p.body;
  const back = new Mesh(new SphereGeometry(0.32, 10, 8), mat(body));
  back.scale.set(0.75, 0.72, 1.1);
  back.position.y = 0.42;
  g.add(back);
  const head = new Mesh(new SphereGeometry(0.2, 10, 8), mat(body));
  head.position.set(0, 0.62, 0.28);
  g.add(head);
  const chest = new Mesh(new SphereGeometry(0.14, 8, 6), mat(p.light));
  chest.position.set(0, 0.56, 0.18);
  g.add(chest);
  const snout = new Mesh(new ConeGeometry(0.09, 0.22, 6), mat(p.light));
  snout.rotation.x = Math.PI / 2 + 0.25;
  snout.position.set(0, 0.56, 0.44);
  g.add(snout);
  for (const sx of [-0.09, 0.09]) {
    const ear = new Mesh(new ConeGeometry(0.09, 0.22, 5), mat(p.accentSoft));
    ear.position.set(sx, 0.78, 0.24);
    ear.rotation.z = sx > 0 ? -0.25 : 0.25;
    g.add(ear);
  }
  const tail = new Mesh(new ConeGeometry(0.11, 0.55, 6), mat(p.dark));
  tail.position.set(0, 0.48, -0.42);
  tail.rotation.x = -1.1;
  g.add(tail);
  for (const [lx, lz] of [[-0.12, 0.16], [0.12, 0.16], [-0.12, -0.18], [0.12, -0.18]]) {
    const leg = new Mesh(new CylinderGeometry(0.05, 0.045, 0.34, 6), mat(p.dark));
    leg.position.set(lx, 0.17, lz);
    g.add(leg);
  }
  eye(g, -0.08, 0.66, 0.44);
  eye(g, 0.08, 0.66, 0.44);
  return g;
}

/** Shell: an armoured turtle with a garden on its back. */
function shell(art: CreatureArt, p: ReturnType<typeof palette>): Group {
  const g = new Group();
  const dome = new Mesh(new SphereGeometry(0.42, 12, 9), mat(p.dark));
  dome.scale.set(1, 0.72, 1.15);
  dome.position.y = 0.34;
  g.add(dome);
  const belly = new Mesh(new SphereGeometry(0.38, 10, 8), mat(p.body));
  belly.scale.set(0.95, 0.5, 1.05);
  belly.position.set(0, 0.22, 0.02);
  g.add(belly);
  for (let i = -1; i <= 1; i++) {
    const plate = new Mesh(new ConeGeometry(0.09, 0.12, 4), mat(p.light));
    plate.position.set(i * 0.2, 0.62, -0.05 + Math.abs(i) * 0.1);
    plate.rotation.x = Math.PI / 2.2;
    g.add(plate);
  }
  const neck = new Mesh(new CylinderGeometry(0.07, 0.09, 0.24, 6), mat(p.body));
  neck.position.set(0, 0.36, 0.4);
  neck.rotation.x = 0.5;
  g.add(neck);
  const head = new Mesh(new SphereGeometry(0.15, 9, 7), mat(p.body));
  head.position.set(0, 0.5, 0.52);
  g.add(head);
  for (const [lx, lz] of [[-0.22, 0.2], [0.22, 0.2], [-0.22, -0.24], [0.22, -0.24]]) {
    const leg = new Mesh(new CylinderGeometry(0.08, 0.09, 0.22, 6), mat(p.dark));
    leg.position.set(lx, 0.11, lz);
    g.add(leg);
  }
  eye(g, -0.07, 0.54, 0.62);
  eye(g, 0.07, 0.54, 0.62);
  return g;
}

/** Wing: a small bird with a head crest and beak. */
function wing(art: CreatureArt, p: ReturnType<typeof palette>): Group {
  const g = new Group();
  const body = new Mesh(new SphereGeometry(0.3, 10, 8), mat(p.body));
  body.scale.set(0.9, 1, 1.1);
  body.position.y = 0.5;
  g.add(body);
  const head = new Mesh(new SphereGeometry(0.18, 10, 8), mat(p.body));
  head.position.set(0, 0.86, 0.14);
  g.add(head);
  const beak = new Mesh(new ConeGeometry(0.06, 0.16, 5), mat(p.accent));
  beak.rotation.x = Math.PI / 2.2;
  beak.position.set(0, 0.83, 0.31);
  g.add(beak);
  for (const sx of [-0.07, 0.07]) {
    const feather = new Mesh(new ConeGeometry(0.05, 0.2, 5), mat(p.accent));
    feather.position.set(sx, 1.03, 0.1);
    feather.rotation.z = sx > 0 ? -0.3 : 0.3;
    feather.rotation.x = -0.4;
    g.add(feather);
  }
  for (const sx of [-1, 1]) {
    const w = new Mesh(new SphereGeometry(0.2, 8, 6), mat(p.dark));
    w.scale.set(0.28, 0.9, 0.55);
    w.position.set(sx * 0.28, 0.55, -0.02);
    w.rotation.z = sx * 0.35;
    g.add(w);
  }
  for (const sx of [-0.08, 0.08]) {
    const leg = new Mesh(new CylinderGeometry(0.035, 0.035, 0.3, 5), mat(p.accent));
    leg.position.set(sx, 0.15, 0.06);
    g.add(leg);
  }
  eye(g, -0.08, 0.9, 0.27);
  eye(g, 0.08, 0.9, 0.27);
  return g;
}

/** Scale: a dragon-serpent with a long body and a row of dorsal spikes. */
function scale(art: CreatureArt, p: ReturnType<typeof palette>): Group {
  const g = new Group();
  const body = new Mesh(new CapsuleGeometry(0.19, 0.5, 4, 8), mat(p.body));
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.42, 0);
  g.add(body);
  const belly = new Mesh(new SphereGeometry(0.16, 8, 6), mat(p.light));
  belly.scale.set(0.8, 0.5, 1.6);
  belly.position.set(0, 0.32, 0.1);
  g.add(belly);
  const head = new Mesh(new SphereGeometry(0.18, 9, 7), mat(p.body));
  head.position.set(0, 0.56, 0.52);
  head.scale.set(1, 0.9, 1.2);
  g.add(head);
  for (const sx of [-0.11, 0.11]) {
    const horn = new Mesh(new ConeGeometry(0.05, 0.18, 5), mat(p.accent));
    horn.position.set(sx, 0.68, 0.44);
    horn.rotation.x = -0.5;
    horn.rotation.z = sx > 0 ? -0.3 : 0.3;
    g.add(horn);
  }
  const snout = new Mesh(new ConeGeometry(0.08, 0.2, 6), mat(p.body));
  snout.rotation.x = Math.PI / 2 + 0.35;
  snout.position.set(0, 0.5, 0.66);
  g.add(snout);
  const tail = new Mesh(new ConeGeometry(0.12, 0.6, 6), mat(p.dark));
  tail.rotation.x = -Math.PI / 2 + 0.4;
  tail.position.set(0, 0.42, -0.62);
  g.add(tail);
  for (let i = 0; i < 4; i++) {
    const spike = new Mesh(new ConeGeometry(0.06, 0.16, 4), mat(p.accentSoft));
    spike.position.set(0, 0.62, 0.25 - i * 0.22);
    g.add(spike);
  }
  for (const [lx, lz] of [[-0.17, 0.24], [0.17, 0.24], [-0.17, -0.28], [0.17, -0.28]]) {
    const leg = new Mesh(new CylinderGeometry(0.055, 0.05, 0.3, 6), mat(p.dark));
    leg.position.set(lx, 0.15, lz);
    g.add(leg);
  }
  eye(g, -0.09, 0.6, 0.63);
  eye(g, 0.09, 0.6, 0.63);
  return g;
}

/** Moth: a round body, a halo of broad wings, long antennae. */
function moth(art: CreatureArt, p: ReturnType<typeof palette>): Group {
  const g = new Group();
  const body = new Mesh(new CapsuleGeometry(0.15, 0.3, 4, 8), mat(p.body));
  body.position.set(0, 0.62, 0);
  g.add(body);
  const head = new Mesh(new SphereGeometry(0.14, 9, 7), mat(p.dark));
  head.position.set(0, 0.98, 0.06);
  g.add(head);
  for (const sx of [-1, 1]) {
    const wing = new Mesh(new SphereGeometry(0.34, 10, 8), mat(p.accentSoft));
    wing.scale.set(0.85, 1, 0.14);
    wing.position.set(sx * 0.32, 0.66, -0.04 - Math.abs(sx) * -0.0);
    wing.rotation.z = sx * 0.5;
    g.add(wing);
  }
  for (const sx of [-0.05, 0.05]) {
    const ant = new Mesh(new CylinderGeometry(0.012, 0.02, 0.3, 4), mat(p.dark));
    ant.position.set(sx, 1.12, 0.12);
    ant.rotation.x = 0.5;
    ant.rotation.z = sx > 0 ? -0.35 : 0.35;
    g.add(ant);
    const tip = new Mesh(new SphereGeometry(0.035, 5, 4), mat(p.accent));
    tip.position.set(sx + (sx > 0 ? 0.08 : -0.08), 1.26, 0.19);
    g.add(tip);
  }
  eye(g, -0.06, 1.01, 0.17);
  eye(g, 0.06, 1.01, 0.17);
  return g;
}

const BUILDERS: Record<string, (art: CreatureArt, p: ReturnType<typeof palette>) => Group> = {
  kit,
  shell,
  wing,
  scale,
  moth,
};

/** A creature as a living scene object, with a variant tint like the art has. */
export function buildCreature(art: CreatureArt): Group {
  const sp = SPECIES_BY_ID[art.speciesId];
  const p = palette(art);
  const builder = BUILDERS[sp.look.body] ?? kit;
  const g = builder(art, p);
  const size = 0.85 + (art.genome?.size ?? 0.5) * 0.35;
  g.scale.setScalar(size);
  g.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = false;
    }
  });
  g.userData.phase = Math.random() * Math.PI * 2;
  return g;
}
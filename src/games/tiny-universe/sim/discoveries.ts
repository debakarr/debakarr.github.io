// The Observatory's catalog: everything that can be discovered in a
// universe, with a rarity (1–5 stars) and a hint for the ones not yet seen.

import type { IconKey } from '../art';

export type Category = 'Stars' | 'Planets' | 'Life' | 'Civilizations' | 'Mysteries';

export interface Discovery {
  id: string;
  name: string;
  cat: Category;
  rarity: number;
  icon: IconKey;
  /** Shown on the discovery card. */
  text: string;
  /** Shown while undiscovered. */
  hint: string;
}

export const DISCOVERIES: Discovery[] = [
  { id: 'first-star', name: 'First light', cat: 'Stars', rarity: 1, icon: 'u-star', text: 'Gas collapsed under its own gravity until its core ignited. The first star is shining.', hint: 'Wait for gas to clump.' },
  { id: 'red-dwarf', name: 'Red dwarf', cat: 'Stars', rarity: 1, icon: 'u-star', text: 'Small, cool and patient: red dwarfs will outlive everything else.', hint: 'The commonest star.' },
  { id: 'sun-like', name: 'Yellow dwarf', cat: 'Stars', rarity: 1, icon: 'u-star', text: 'A steady, sun-like star with ten billion years of light ahead of it.', hint: 'A middling star.' },
  { id: 'blue-giant', name: 'Blue giant', cat: 'Stars', rarity: 2, icon: 'u-star', text: 'A massive star burning so fast it will live only a few million years.', hint: 'Dense, clumpy gas helps.' },
  { id: 'red-giant', name: 'Red giant', cat: 'Stars', rarity: 2, icon: 'u-star', text: 'Out of hydrogen, a star has swollen to hundreds of times its size, swallowing its inner planets.', hint: 'Stars age.' },
  { id: 'white-dwarf', name: 'White dwarf', cat: 'Stars', rarity: 2, icon: 'u-star', text: 'What remains of a sun-like star: an earth-sized ember that slowly cools forever.', hint: 'The end of an ordinary star.' },
  { id: 'supernova', name: 'Supernova', cat: 'Stars', rarity: 2, icon: 't-nova', text: 'A massive star exploded. It forged carbon, oxygen, silicon, iron and gold, and scattered them into the gas around it. Later stars will be born with them.', hint: 'Massive stars die young.' },
  { id: 'neutron-star', name: 'Neutron star', cat: 'Stars', rarity: 3, icon: 'u-star', text: 'A city-sized ball of neutrons, the crushed core of an exploded star.', hint: 'What a supernova leaves behind.' },
  { id: 'black-hole', name: 'Black hole', cat: 'Stars', rarity: 3, icon: 'u-blackhole', text: 'The heaviest stars collapse into something not even light escapes.', hint: 'The heaviest stars end strangely.' },
  { id: 'grb', name: 'Gamma-ray burst', cat: 'Stars', rarity: 4, icon: 'u-blackhole', text: 'A collapsing giant fired a beam of gamma rays across the galaxy. Anything alive in its path is gone.', hint: 'Rare, and very dangerous.' },

  { id: 'first-planets', name: 'First planets', cat: 'Planets', rarity: 1, icon: 'u-planet', text: 'Leftover gas around a young star has gathered into planets.', hint: 'Stars bring company.' },
  { id: 'gas-giant', name: 'Gas giant', cat: 'Planets', rarity: 1, icon: 'u-planet', text: 'A giant ball of hydrogen and helium. The first stars could only make worlds like this.', hint: 'Easy to make.' },
  { id: 'rocky-world', name: 'Rocky world', cat: 'Planets', rarity: 2, icon: 'u-planet', text: 'A world of rock and metal. Its elements were forged in stars that died before its sun was born.', hint: 'Needs heavy elements. Where do those come from?' },
  { id: 'ocean-world', name: 'Ocean world', cat: 'Planets', rarity: 2, icon: 'u-planet', text: 'Water from pole to pole, with no land at all.', hint: 'Lots of water, not too cold.' },
  { id: 'lava-world', name: 'Lava world', cat: 'Planets', rarity: 1, icon: 'u-planet', text: 'So close to its star that its surface is molten.', hint: 'Too close for comfort.' },
  { id: 'ice-world', name: 'Ice world', cat: 'Planets', rarity: 1, icon: 'u-planet', text: 'A frozen world far from its star.', hint: 'Far from the fire.' },
  { id: 'super-earth', name: 'Super-Earth', cat: 'Planets', rarity: 2, icon: 'u-planet', text: 'A rocky world several times heavier than Earth.', hint: 'Big, but not a giant.' },
  { id: 'goldilocks', name: 'Goldilocks world', cat: 'Planets', rarity: 3, icon: 'u-life', text: 'Not too hot, not too cold, with water, air and a magnetic field. Potential for life detected.', hint: 'Temperature, water, air and metals, together.' },
  { id: 'twin-earths', name: 'Twin worlds', cat: 'Planets', rarity: 4, icon: 'u-planet', text: 'Two habitable worlds orbit the same star.', hint: 'Two good worlds, one sun.' },

  { id: 'first-life', name: 'First life', cat: 'Life', rarity: 2, icon: 'u-life', text: 'Chemistry became biology: self-copying molecules in a warm sea.', hint: 'A habitable world, and time.' },
  { id: 'oxygen', name: 'The Great Oxygenation', cat: 'Life', rarity: 2, icon: 'u-life', text: 'Light-eating microbes have filled a world\'s air with oxygen. Complex life can follow.', hint: 'Some microbes eat light.' },
  { id: 'complex-life', name: 'Complex life', cat: 'Life', rarity: 3, icon: 'p-life', text: 'Cells learned to cooperate as bodies: swimmers, filter feeders, hunters.', hint: 'Needs oxygen.' },
  { id: 'land-life', name: 'Life on land', cat: 'Life', rarity: 3, icon: 'p-life', text: 'Life crawled out of the sea.', hint: 'Needs some dry land.' },
  { id: 'mass-extinction', name: 'Mass extinction', cat: 'Life', rarity: 2, icon: 't-asteroid', text: 'Most species on a world died at once. The survivors inherit it.', hint: 'Impacts, supernovae, you.' },
  { id: 'tool-users', name: 'Tool users', cat: 'Life', rarity: 3, icon: 'p-life', text: 'Something picked up a stone and used it.', hint: 'Complex life on land, and time.' },
  { id: 'intelligence', name: 'Intelligence', cat: 'Life', rarity: 4, icon: 'u-brain', text: 'Intelligent life detected. A species is asking what the stars are.', hint: 'Tool users, and more time.' },
  { id: 'extremophiles', name: 'Extremophiles', cat: 'Life', rarity: 4, icon: 'u-life', text: 'Hardy microbes survived their world turning hostile.', hint: 'Life that refuses to die.' },
  { id: 'survivor', name: 'Survivor', cat: 'Life', rarity: 3, icon: 'u-life', text: 'A biosphere survived a nearby supernova.', hint: 'Life near a dying giant.' },
  { id: 'second-genesis', name: 'Second genesis', cat: 'Life', rarity: 4, icon: 'u-life', text: 'Life began again on a world where it had once died out.', hint: 'Death, then a new beginning.' },

  { id: 'civilization', name: 'Civilization', cat: 'Civilizations', rarity: 3, icon: 'u-civ', text: 'Farms, cities, writing. A civilization has begun.', hint: 'Intelligence, settled.' },
  { id: 'industry', name: 'Industry', cat: 'Civilizations', rarity: 3, icon: 'u-civ', text: 'Factories and engines: a civilization has harnessed fossil sunlight.', hint: 'A civilization that lasts.' },
  { id: 'spaceflight', name: 'Spaceflight', cat: 'Civilizations', rarity: 4, icon: 'u-rocket', text: 'A civilization has left its world.', hint: 'Survive the atom.' },
  { id: 'interstellar', name: 'Interstellar', cat: 'Civilizations', rarity: 4, icon: 'u-rocket', text: 'A starship has reached another star. A civilization is spreading.', hint: 'Spaceflight, and more.' },
  { id: 'dyson', name: 'Dyson swarm', cat: 'Civilizations', rarity: 4, icon: 'u-dyson', text: 'A civilization is wrapping its star in a swarm of collectors to catch all of its light.', hint: 'A civilization among the stars.' },
  { id: 'galactic', name: 'Galactic civilization', cat: 'Civilizations', rarity: 5, icon: 'u-sparkles', text: 'A civilization has spread across the galaxy and survived. It made it through the filter.', hint: 'No one has ever made it this far.' },
  { id: 'collapse', name: 'Collapse', cat: 'Civilizations', rarity: 2, icon: 'u-ruins', text: 'A civilization destroyed itself.', hint: 'Progress is not guaranteed.' },
  { id: 'renaissance', name: 'Renaissance', cat: 'Civilizations', rarity: 3, icon: 'u-civ', text: 'A civilization climbed out of its dark age and surpassed its ancestors.', hint: 'Fall, then rise.' },
  { id: 'ruins', name: 'Ancient ruins', cat: 'Civilizations', rarity: 3, icon: 'u-ruins', text: 'You studied the ruins of a civilization that is gone.', hint: 'Investigate what a fallen civilization left behind.' },
  { id: 'two-civs', name: 'Not alone', cat: 'Civilizations', rarity: 4, icon: 'u-ufo', text: 'Two civilizations exist at the same time.', hint: 'One is not enough.' },
  { id: 'first-contact', name: 'First contact', cat: 'Civilizations', rarity: 4, icon: 'u-ufo', text: 'Two civilizations have detected each other.', hint: 'Two civilizations, close enough to hear.' },
  { id: 'contact-war', name: 'The First Contact War', cat: 'Civilizations', rarity: 4, icon: 't-nova', text: 'Contact went badly.', hint: 'Not everyone is friendly.' },
  { id: 'union', name: 'Union', cat: 'Civilizations', rarity: 5, icon: 'u-ufo', text: 'Two species from different stars merged into one civilization.', hint: 'Two peaceful civilizations meet.' },
  { id: 'ancient-civ', name: 'A million years', cat: 'Civilizations', rarity: 4, icon: 'u-civ', text: 'A civilization has lasted a million years.', hint: 'Endure.' },

  { id: 'watcher', name: 'The Watcher', cat: 'Mysteries', rarity: 3, icon: 'u-eye', text: 'A civilization has noticed you. They worship The Watcher, a god who moves the stars.', hint: 'Intervene where someone can see.' },
  { id: 'observer', name: 'The Observer Hypothesis', cat: 'Mysteries', rarity: 4, icon: 'u-eye', text: 'Scientists have concluded that someone is manipulating their universe. They are right.', hint: 'Keep intervening near a scientific civilization.' },
  { id: 'silence', name: 'The Silence', cat: 'Mysteries', rarity: 4, icon: 'u-eye', text: 'An advanced civilization vanished without a trace. No war, no ruins. Just silence.', hint: 'Watch an advanced civilization closely.' },
  { id: 'great-filter', name: 'The Great Filter', cat: 'Mysteries', rarity: 5, icon: 'u-eye', text: 'The ruins agree. Every civilization that wraps its star in light is erased by something older, patient and quiet. The universe is not naturally empty: it is kept that way. Your Protect power now works against it.', hint: 'Study ruins. Watch what happens to the advanced ones.' },
];

export const DISCOVERY = Object.fromEntries(DISCOVERIES.map((d) => [d.id, d])) as Record<string, Discovery>;

export interface Achievement {
  id: string;
  name: string;
  text: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-star', name: 'First Star', text: 'See the first star ignite.' },
  { id: 'genesis', name: 'Genesis', text: 'Life begins.' },
  { id: 'thinking', name: 'Thinking', text: 'Intelligence emerges.' },
  { id: 'civilization', name: 'Civilization', text: 'A civilization reaches industry.' },
  { id: 'contact', name: 'Contact', text: 'Two civilizations meet.' },
  { id: 'empire', name: 'Empire', text: 'Civilizations inhabit 60 worlds at once.' },
  { id: 'great-filter', name: 'Great Filter', text: 'Discover the Great Filter.' },
  { id: 'god-complex', name: 'God Complex', text: 'Intervene 50 times.' },
  { id: 'observer', name: 'Observer', text: 'Reach 13.8 billion years with life and no interventions.' },
  { id: 'creator', name: 'Creator', text: 'A civilization survives a million years.' },
];

/** Cosmic eras (from the design doc), unlocked by discoveries. */
export const COSMIC_ERAS: { name: string; by: string | null }[] = [
  { name: 'Creation', by: null },
  { name: 'Matter', by: null },
  { name: 'Stellar', by: 'first-star' },
  { name: 'Planetary', by: 'rocky-world' },
  { name: 'Biological', by: 'first-life' },
  { name: 'Intelligent', by: 'intelligence' },
  { name: 'Civilization', by: 'industry' },
  { name: 'Interstellar', by: 'interstellar' },
  { name: 'Galactic', by: 'galactic' },
  { name: 'Unknown', by: 'great-filter' },
];

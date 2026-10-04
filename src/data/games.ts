// Registry for the /games section. Add an entry here (plus its page) to list a new game.

export interface GameEntry {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  href: string;
  status: 'playable' | 'in progress';
  tags: string[];
  /** Accent color used on the card. */
  accent: string;
  /** Which generated banner the card shows. */
  banner: 'hexmap' | 'skyline' | 'glyphs' | 'sea' | 'orbits' | 'wilds' | 'cosmos';
  /** Third-party art credits shown on the card. */
  credits?: { label: string; href: string; license: string }[];
}

export const games: GameEntry[] = [
  {
    slug: 'year-zero',
    title: 'Year Zero',
    tagline: 'A civilization that remembers.',
    description:
      'Found a people in Year Zero and guide them toward the stars. Every world is generated from a shareable seed, and the game writes a history from what you actually do: wars and betrayals, famines and plagues, rulers who earn their names, and the ruins of peoples who came before.',
    href: '/games/year-zero',
    status: 'playable',
    tags: ['Strategy', '4X', 'Procedural', 'Single player'],
    accent: '#d9a441',
    banner: 'hexmap',
    credits: [
      { label: 'Kenney', href: 'https://kenney.nl/assets/hexagon-pack', license: 'CC0' },
      { label: 'game-icons.net', href: 'https://game-icons.net', license: 'CC BY 3.0' },
    ],
  },
  {
    slug: 'micro-city',
    title: 'Micro City',
    tagline: 'Every city tells you why it is unhappy.',
    description:
      'Lay roads, zone land and watch a city grow from a settlement into a megacity. Commuters jam the one road everyone shares, monsoon floods find the homes you built on the floodplain, and a city health report explains what your citizens want. Play a sandbox or take on challenges like Floodplain, No Cars and Island.',
    href: '/games/micro-city',
    status: 'playable',
    tags: ['City builder', 'Simulation', 'Procedural', 'Single player'],
    accent: '#2f7de1',
    banner: 'skyline',
    credits: [{ label: 'game-icons.net', href: 'https://game-icons.net', license: 'CC BY 3.0' }],
  },
  {
    slug: 'first-contact',
    title: 'First Contact',
    tagline: 'You are not trying to defeat them. You are trying to understand them.',
    description:
      'Three alien ships arrive and nobody understands a word they say. Decode a generated alien language from context, build a dictionary of hypotheses that might be wrong, talk back with glyph tiles, and find out why they came. Every seed brings a different species, script and secret.',
    href: '/games/first-contact',
    status: 'playable',
    tags: ['Puzzle', 'Language', 'Mystery', 'Single player'],
    accent: '#6fd3ff',
    banner: 'glyphs',
    credits: [{ label: 'game-icons.net', href: 'https://game-icons.net', license: 'CC BY 3.0' }],
  },
  {
    slug: 'primordial',
    title: 'Primordial',
    tagline: 'Seed a sea. Evolution does the rest.',
    description:
      'Creatures with real genomes graze, hunt, flock and breed, and natural selection takes it from there: species split and die out, scavengers become hunters, giants appear. Play god with meteors, ice ages and mutation storms, follow a single creature, read the tree of life, or let the director run it.',
    href: '/games/primordial',
    status: 'playable',
    tags: ['Simulation', 'Evolution', 'Sandbox', 'Watchable'],
    accent: '#5fe0c8',
    banner: 'sea',
    credits: [{ label: 'game-icons.net', href: 'https://game-icons.net', license: 'CC BY 3.0' }],
  },
  {
    slug: 'slingshot',
    title: 'Slingshot',
    tagline: 'Bend your path around the planets.',
    description:
      'Fling probes through living star systems with twin suns, moons, asteroid belts and black holes. Pull back, watch the predicted path, let go, and use gravity assists to reach the target. Every level is generated, and solved by the autopilot before you see it.',
    href: '/games/slingshot',
    status: 'playable',
    tags: ['Puzzle', 'Physics', 'Space', 'Procedural'],
    accent: '#ffc46b',
    banner: 'orbits',
    credits: [{ label: 'game-icons.net', href: 'https://game-icons.net', license: 'CC BY 3.0' }],
  },
  {
    slug: 'wildborn',
    title: 'Wildborn',
    tagline: 'Every creature has a history.',
    description:
      'Explore an unknown world and befriend its creatures. Their evolution is shaped by the life they live — where you take them, what they eat, who they fight and what they love — so no two collections are alike. Battle, breed generations and open the lineage tree.',
    href: '/games/wildborn',
    status: 'playable',
    tags: ['Creatures', 'Evolution', 'RPG', 'Breeding'],
    accent: '#7fe0a8',
    banner: 'wilds',
    credits: [{ label: 'game-icons.net', href: 'https://game-icons.net', license: 'CC BY 3.0' }],
  },
  {
    slug: 'tiny-universe',
    title: 'Tiny Universe',
    tagline: 'A universe you can play with.',
    description:
      'Start with nothing and watch a galaxy form. Massive stars explode and seed the gas with the elements rocky worlds are made of; life begins, climbs toward minds, and civilizations rise, meet and fall. Seed life, strike worlds, protect a people, or just watch, and find out why the sky is so quiet.',
    href: '/games/tiny-universe',
    status: 'playable',
    tags: ['Sandbox', 'Simulation', 'Space', 'Procedural'],
    accent: '#a9b8ff',
    banner: 'cosmos',
    credits: [{ label: 'game-icons.net', href: 'https://game-icons.net', license: 'CC BY 3.0' }],
  },
];

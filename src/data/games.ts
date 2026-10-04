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
  },
];

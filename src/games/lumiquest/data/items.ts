// Items the player can carry. Foods are what creatures eat (each species has
// one favourite); resources feed quests; key items and notes are permanent.

export type ItemCategory = 'food' | 'resource' | 'key' | 'note';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  /** Icon key in ui/icons.ts. */
  icon: string;
  /** Price at Pip's stall, if sold. */
  price?: number;
}

export const ITEMS: ItemDef[] = [
  { id: 'sunberry', name: 'Sunberry', category: 'food', description: 'A warm, sweet berry. Fire creatures adore it.', icon: 'berry', price: 4 },
  { id: 'kelp', name: 'River Kelp', category: 'food', description: 'Crisp ribbons of kelp from the riverbed.', icon: 'kelp', price: 4 },
  { id: 'crunchroot', name: 'Crunchroot', category: 'food', description: 'A crunchy orange root pulled from soft soil.', icon: 'root', price: 4 },
  { id: 'cloudpuff', name: 'Cloudpuff', category: 'food', description: 'A dandelion-light seed puff that tastes of sky.', icon: 'puff', price: 5 },
  { id: 'glowcap', name: 'Glowcap', category: 'food', description: 'A softly glowing mushroom from shady places.', icon: 'mushroom', price: 5 },
  { id: 'honeyblossom', name: 'Honeyblossom', category: 'food', description: 'A sticky-sweet forest flower.', icon: 'blossom', price: 5 },
  { id: 'crystal', name: 'Luminous Crystal', category: 'resource', description: 'A shard of the beacon’s heartstone. It hums faintly.', icon: 'crystal' },
  { id: 'amber', name: 'Amber Drop', category: 'resource', description: 'Old tree resin. Pip pays well for it.', icon: 'amber' },
  { id: 'pearl', name: 'River Pearl', category: 'resource', description: 'A smooth pearl from the deep pool.', icon: 'pearl' },
  { id: 'starshard', name: 'Star Fragment', category: 'resource', description: 'A fallen piece of a shooting star. Old Bram collects them.', icon: 'star' },
  { id: 'feather', name: 'Breeze Feather', category: 'resource', description: 'A feather that never quite settles.', icon: 'feather' },
  { id: 'device', name: 'Resonance Device', category: 'key', description: 'A ranger’s wristband that tunes your heartbeat to a creature’s. Use it when trust is high.', icon: 'device' },
  { id: 'badge', name: 'Lumen Ranger Badge', category: 'key', description: 'Awarded for restoring the Lost Beacon.', icon: 'badge' },
  { id: 'note-ranger', name: 'Ranger’s Log', category: 'note', description: 'Day 212. The beacon flickered and went out at dusk. Something bright fled west across the meadow, leaving glowing prints. Elen thinks the heartstone cracked. — R.', icon: 'note' },
  { id: 'note-ruins', name: 'Ruin Inscription', category: 'note', description: '“Where fire wakes the twin bowls, the old door yields. Where light is passed hand to hand, the beacon remembers.”', icon: 'note' },
  { id: 'note-cave', name: 'Glyphs of the Deep', category: 'note', description: 'Revealed by Lumen Glow: “The first keepers sang the creatures to the beacon. Bond is not taken — it is agreed.”', icon: 'note' },
  { id: 'note-grotto', name: 'Diver’s Note', category: 'note', description: 'Behind the falls there is a quiet cove. Only those who swim with an Aquoray reach it. I left my pearl there for the next one. — M.', icon: 'note' },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<string, ItemDef>;

export const CURRENCY = 'Lumens';

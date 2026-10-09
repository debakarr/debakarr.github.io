// What the villagers say. Each NPC builds a small tree from the current game
// state; choices can branch, run an effect (start a quest, open the shop,
// trade) and close the conversation.

import type { GameState } from '../systems/state';
import { SPECIES_BY_ID } from './species';
import { ITEM_BY_ID } from './items';

export interface DialogueHost {
  state: GameState;
  playerName: string;
  companionName(): string;
  questStatus(id: string): 'locked' | 'active' | 'done';
  questStage(id: string): number;
  startQuest(id: string): void;
  setFlag(name: string, value?: number): void;
  openShop(): void;
  sell(item: string, price: number): number;
  checkQuests(): void;
}

export interface Choice {
  label: string;
  next?: string;
  run?: () => void;
  close?: boolean;
}

export interface Node {
  text: string;
  choices: Choice[];
}

export type Tree = Record<string, Node>;

const bye = (label = 'I’ll be back later.'): Choice => ({ label, close: true });

function elen(h: DialogueHost): Tree {
  const st = h.questStage('beacon');
  const status = h.questStatus('beacon');
  const comp = h.companionName();
  const about: Node = {
    text: 'Brightwater Outpost watches over the whole vale: the Sunlit Meadow, the Whispering Wood, the river and the old Lumen Ruins. Rangers like us keep the peace between people and creatures.',
    choices: [{ label: 'What happened to the beacon?', next: 'beacon' }, { label: 'Any tips for a new ranger?', next: 'tips' }, bye()],
  };
  const tips: Node = {
    text: `Creatures trust patience. Crouch to move quietly, Observe them (F) to learn what they like, and offer food (E). When trust is high, your Resonance Device lets you bond. And ${comp} can help you: try its ability on the training yard south of the market.`,
    choices: [{ label: 'What happened to the beacon?', next: 'beacon' }, bye('Thanks, Elen.')],
  };
  if (status === 'active' && st === 0) {
    return {
      start: {
        text: `Oh! You must be ${h.playerName}, our new ranger — and that must be ${comp}. Welcome! I’m Elen. I’m afraid you’ve arrived at a dark time: the ancient beacon on the hill has been silent for three nights.`,
        choices: [{ label: 'Tell me about this place.', next: 'about' }, { label: 'What’s the beacon?', next: 'beacon' }, { label: 'Any tips for a new ranger?', next: 'tips' }, bye()],
      },
      about,
      tips,
      beacon: {
        text: 'The beacon has lit this vale for centuries. When it went dark, something bright fled west across the meadow and left glowing prints in the grass. Follow them, find out what happened, and — if you can — bring the light back.',
        choices: [
          { label: 'I’ll find out what happened.', run: () => { h.setFlag('elenBriefed'); h.checkQuests(); }, close: true },
          { label: 'Tell me about this place first.', next: 'about' },
        ],
      },
    };
  }
  if (status === 'active' && st < 7) {
    const hints = [
      '',
      'The prints start at the west edge of the meadow, past the campfire. Press E to examine them.',
      'The prints lead into Mossy Clearing at the edge of the wood. Whatever made them may still be there — Observe it with F.',
      'Luminous crystals are scattered around the vale: one in the clearing, one in Glimmer Cave to the north, and others behind thorns, under a cracked boulder by the river, and in a cove behind the falls. Any three will do.',
      'Bring the crystals up Beacon Hill and set them in the sockets at the tower’s base.',
      `The old resonance altar sits at the south-west corner of the hilltop. ${comp} can wake it.`,
      'The light must travel prism to prism. Turn each one (E) until the beam reaches the tower.',
    ];
    return {
      start: { text: `How goes the search, ${h.playerName}?`, choices: [{ label: 'Any advice?', next: 'hint' }, { label: 'Any tips for a new ranger?', next: 'tips' }, bye('Still working on it!')] },
      hint: { text: hints[st] ?? 'You’re close. Keep going!', choices: [bye('Got it.')] },
      tips,
    };
  }
  if (status === 'active' && st === 7) {
    return {
      start: {
        text: `${h.playerName}! I saw it from here — the beacon is shining again! The whole vale feels brighter. You and ${comp} did something wonderful.`,
        choices: [{ label: 'We did it together.', run: () => { h.setFlag('beaconReported'); h.checkQuests(); }, next: 'reward' }],
      },
      reward: {
        text: 'Please take this Lumen Ranger Badge. You’ve earned it. The creatures of the vale will trust you more now that the light is back.',
        choices: [bye('Thank you, Elen!')],
      },
    };
  }
  return {
    start: {
      text: `The beacon’s glow reaches all the way to the falls. Have you met the creatures of the vale yet? Nia and Old Bram are always looking for help.`,
      choices: [{ label: 'Any tips for a new ranger?', next: 'tips' }, bye('I’ll go explore.')],
    },
    tips,
  };
}

function pip(h: DialogueHost): Tree {
  const sellables = ['amber', 'pearl', 'feather'].filter((i) => (h.state.inventory[i] ?? 0) > 0);
  const prices: Record<string, number> = { amber: 12, pearl: 20, feather: 8 };
  return {
    start: {
      text: 'Fresh snacks for every kind of friend! Berries for fire foxes, kelp for river folk, glowcaps for the sleepy moths. Want to trade?',
      choices: [
        { label: 'Show me your wares.', run: () => h.openShop(), close: true },
        ...(sellables.length ? [{ label: 'I have things to sell.', next: 'sell' }] : []),
        { label: 'Which food does each creature like?', next: 'likes' },
        bye('Maybe later.'),
      ],
    },
    likes: {
      text: Object.values(SPECIES_BY_ID).filter((s) => h.state.species[s.id]?.observed > 0).map((s) => `${s.name}: ${ITEM_BY_ID[s.likes].name}.`).join(' ') || 'Observe a creature first and you’ll learn what it likes. Then come back!',
      choices: [{ label: 'Show me your wares.', run: () => h.openShop(), close: true }, bye('Thanks!')],
    },
    sell: {
      text: 'Ooh, let me see… I pay fairly!',
      choices: [
        ...sellables.map((i) => ({ label: `Sell ${ITEM_BY_ID[i].name} (${prices[i]} Lumens each)`, run: () => void h.sell(i, prices[i]), next: 'sold' })),
        bye('Never mind.'),
      ],
    },
    sold: { text: 'Pleasure doing business!', choices: [bye('Bye, Pip.')] },
  };
}

function bram(h: DialogueHost): Tree {
  const offers = ['cave', 'sky', 'rare'].filter((q) => h.questStatus(q) === 'locked');
  return {
    start: {
      text: 'Ah, the new ranger. Sit, sit. The fire is warm and my stories are long. These stones remember the Lumen keepers, you know.',
      choices: [
        { label: 'Tell me about the old ruins.', next: 'ruins' },
        { label: offers.length ? 'Any mysteries around here?' : 'Any more mysteries?', next: offers.length ? 'mysteries' : 'none' },
        { label: 'What are star fragments?', next: 'stars' },
        bye('Good night, Bram.'),
      ],
    },
    ruins: {
      text: 'The keepers built the beacon and the altar. They did not tame the creatures — they agreed with them. Fire to wake the old bowls, water to fill the old basins, earth to move the old stones. Their doors still answer to such gifts.',
      choices: [{ label: 'Any mysteries around here?', next: offers.length ? 'mysteries' : 'none' }, bye('Thank you.')],
    },
    mysteries: {
      text: 'Three things I never solved. Glyphs deep in Glimmer Cave that only show in a creature’s light. A chest on a pillar past the ruins that only a glider could reach. And a silver visitor at Moonwell Glade on clear nights.',
      choices: [{ label: 'I’ll look into all of them.', run: () => offers.forEach((q) => h.startQuest(q)), next: 'thanks' }, bye('Maybe another time.')],
    },
    none: { text: 'You’ve heard all my riddles. Solve them and come tell me!', choices: [bye()] },
    stars: {
      text: 'Bits of fallen stars. They glint in odd corners — under bridges, high on stones, in the deep places. Eight fell the night I was born, or so my mother said.',
      choices: [{ label: 'I’ll keep an eye out.', run: () => h.startQuest('stars'), close: true }, bye()],
    },
    thanks: { text: 'Hah! Young legs. Check your journal (J) — I’ve marked them for you.', choices: [bye('Thanks, Bram!')] },
  };
}

function nia(h: DialogueHost): Tree {
  const offers = ['friend', 'river'].filter((q) => h.questStatus(q) === 'locked');
  const comp = h.companionName();
  return {
    start: {
      text: `Hi hi! Is that ${comp}? So cute! I’m Nia — ranger in training. I’m studying every creature in the vale!`,
      choices: [
        ...(offers.length ? [{ label: 'Can I help with your studies?', next: 'help' }] : []),
        { label: 'How do I befriend a creature?', next: 'how' },
        { label: 'What’s the training yard for?', next: 'yard' },
        bye('See you, Nia.'),
      ],
    },
    how: {
      text: 'Don’t run at them! Crouch (Ctrl or C), creep close, Observe with F to learn their favourite food, then offer it with E. River creatures like it near water, moth-folk like the dark. When the trust meter glows, use your Resonance Device!',
      choices: [{ label: 'Can I help with your studies?', next: offers.length ? 'help' : 'done' }, bye('Thanks!')],
    },
    yard: {
      text: 'Brambles, a cracked rock and a dry fountain — one for each kind of starter. Fire burns, earth breaks, water fills. There are little rewards hidden inside!',
      choices: [bye('I’ll try it.')],
    },
    help: {
      text: 'Really?! Okay: I need to see a Resonance Bond with my own eyes — befriend any wild creature. And I’m studying the Aquoray: could you observe two of them in the river?',
      choices: [{ label: 'Leave it to me!', run: () => offers.forEach((q) => h.startQuest(q)), close: true }, bye('Maybe later.')],
    },
    done: { text: 'You’re already helping so much! Check your journal for what’s left.', choices: [bye()] },
  };
}

export function dialogueFor(npc: string, h: DialogueHost): Tree {
  switch (npc) {
    case 'elen':
      return elen(h);
    case 'pip':
      return pip(h);
    case 'bram':
      return bram(h);
    default:
      return nia(h);
  }
}

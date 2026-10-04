// Static definitions for Micro City: terrain, zones, roads, buildings,
// milestones and policies. All numbers are per month.

export const enum Ter {
  Water = 0,
  Sand = 1,
  Grass = 2,
  Forest = 3,
  Rock = 4,
}

export const enum Zone {
  None = 0,
  Res = 1,
  Com = 2,
  Ind = 3,
  Off = 4,
}

export const ZONE_NAME = ['', 'Residential', 'Commercial', 'Industrial', 'Office'];
export const ZONE_SHORT = ['', 'R', 'C', 'I', 'O'];
export const ZONE_COLOR = ['', '#58b368', '#4a8fe7', '#e8b33a', '#9b6be0'];

/** Capacity per tile by zone and building level (residents or jobs). */
export const CAPACITY: number[][] = [
  [0, 0, 0, 0, 0, 0],
  [0, 8, 30, 90, 260, 700],
  [0, 5, 16, 45, 120, 300],
  [0, 10, 30, 70, 140, 140],
  [0, 8, 30, 90, 250, 600],
];

export const MAX_LEVEL = [0, 5, 5, 4, 5];
/** Low-density zoning caps buildings at this level. */
export const LOW_CAP = 2;

export const enum Road {
  None = 0,
  Street = 1,
  Avenue = 2,
  Highway = 3,
}

export interface RoadDef {
  id: Road;
  name: string;
  cost: number;
  upkeep: number;
  /** vehicles per peak hour */
  capacity: number;
  /** minutes per tile at free flow */
  time: number;
  noise: number;
}

export const ROADS: RoadDef[] = [
  { id: Road.None, name: '', cost: 0, upkeep: 0, capacity: 0, time: 0, noise: 0 },
  { id: Road.Street, name: 'Street', cost: 10, upkeep: 0.4, capacity: 700, time: 0.24, noise: 1 },
  { id: Road.Avenue, name: 'Avenue', cost: 30, upkeep: 1, capacity: 1800, time: 0.16, noise: 2 },
  { id: Road.Highway, name: 'Highway', cost: 90, upkeep: 2.5, capacity: 4500, time: 0.09, noise: 4 },
];

export type BuildingCat =
  | 'civic' | 'power' | 'water' | 'sewage' | 'garbage' | 'police' | 'fire' | 'health' | 'education'
  | 'park' | 'transit' | 'flood' | 'landmark';

export type CoverageKind = 'police' | 'fire' | 'health' | 'education' | 'transit' | 'metro' | 'park' | 'flood' | 'drain';

export interface BuildingDef {
  id: string;
  name: string;
  cat: BuildingCat;
  w: number;
  h: number;
  cost: number;
  upkeep: number;
  unlock: number;
  desc: string;
  icon: string;
  color: string;
  /** Building height in tile units for drawing. */
  height: number;
  power?: number;
  water?: number;
  sewage?: number;
  garbage?: number;
  coverage?: { kind: CoverageKind; radius: number; strength: number }[];
  /** Education level provided (1 school, 2 high school, 3 university). */
  edu?: number;
  air?: number;
  noise?: number;
  /** Must touch water (pumps). */
  nearWater?: boolean;
  /** Land value bonus radius and amount. */
  value?: [number, number];
  jobs?: number;
  /** Draw as open ground (parks, farms) rather than a block. */
  flat?: boolean;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'cityhall', name: 'City Hall', cat: 'civic', w: 2, h: 2, cost: 0, upkeep: 20, unlock: 0, icon: 'b-cityhall', color: '#e9e2d0', height: 1.6,
    desc: 'The heart of your city.', value: [6, 10], jobs: 20 },
  { id: 'coal', name: 'Coal Power Plant', cat: 'power', w: 3, h: 3, cost: 6000, upkeep: 180, unlock: 0, icon: 'b-power', color: '#8a8f99', height: 1.4,
    desc: 'Cheap, dirty power: 400 MW.', power: 400, air: 22, noise: 6, jobs: 60 },
  { id: 'gas', name: 'Gas Power Plant', cat: 'power', w: 2, h: 2, cost: 12000, upkeep: 260, unlock: 2, icon: 'b-power', color: '#b0b8c4', height: 1.2,
    desc: 'Cleaner power: 300 MW.', power: 300, air: 9, noise: 4, jobs: 40 },
  { id: 'wind', name: 'Wind Turbine', cat: 'power', w: 1, h: 1, cost: 2500, upkeep: 30, unlock: 3, icon: 'b-wind', color: '#eef2f6', height: 2.2,
    desc: 'Clean power: 35 MW. A little noisy.', power: 35, noise: 3 },
  { id: 'solar', name: 'Solar Farm', cat: 'power', w: 3, h: 3, cost: 22000, upkeep: 120, unlock: 4, icon: 'b-solar', color: '#3b5c8f', height: 0.2, flat: true,
    desc: 'Clean, silent power: 220 MW.', power: 220, jobs: 10 },
  { id: 'nuclear', name: 'Nuclear Plant', cat: 'power', w: 4, h: 4, cost: 90000, upkeep: 1200, unlock: 5, icon: 'b-nuclear', color: '#d7dde4', height: 1.8,
    desc: 'Vast clean power: 2,400 MW.', power: 2400, noise: 2, jobs: 300 },
  { id: 'fusion', name: 'Fusion Reactor', cat: 'power', w: 4, h: 4, cost: 200000, upkeep: 2000, unlock: 6, icon: 'b-fusion', color: '#c9f0ff', height: 2,
    desc: 'The future of energy: 8,000 MW.', power: 8000, jobs: 400 },

  { id: 'tower', name: 'Water Tower', cat: 'water', w: 1, h: 1, cost: 1500, upkeep: 25, unlock: 0, icon: 'b-watertower', color: '#9fc6e8', height: 1.8,
    desc: 'Water for 2,500 people.', water: 2500 },
  { id: 'pump', name: 'Water Pump', cat: 'water', w: 2, h: 2, cost: 6000, upkeep: 90, unlock: 1, icon: 'b-pump', color: '#6fa8d8', height: 0.8, nearWater: true,
    desc: 'Water for 30,000 people. Must touch a river, lake or sea.', water: 30000, jobs: 20 },
  { id: 'treatment', name: 'Sewage Treatment', cat: 'sewage', w: 2, h: 2, cost: 9000, upkeep: 140, unlock: 2, icon: 'b-sewage', color: '#7a9e8e', height: 0.7,
    desc: 'Treats sewage for 40,000 people.', sewage: 40000, air: 3, jobs: 30 },
  { id: 'landfill', name: 'Landfill', cat: 'garbage', w: 3, h: 3, cost: 4000, upkeep: 70, unlock: 0, icon: 'b-landfill', color: '#8d7b5f', height: 0.4, flat: true,
    desc: 'Garbage for 25,000 people. Smelly.', garbage: 25000, air: 8, jobs: 25 },
  { id: 'incinerator', name: 'Incinerator', cat: 'garbage', w: 2, h: 2, cost: 15000, upkeep: 260, unlock: 3, icon: 'b-incinerator', color: '#a3897a', height: 1.3,
    desc: 'Garbage for 80,000 people, and some power.', garbage: 80000, power: 40, air: 12, jobs: 40 },
  { id: 'recycling', name: 'Recycling Center', cat: 'garbage', w: 2, h: 2, cost: 20000, upkeep: 220, unlock: 4, icon: 'b-recycling', color: '#6fbf73', height: 1,
    desc: 'Garbage for 60,000 people, cleanly.', garbage: 60000, jobs: 60 },

  { id: 'police', name: 'Police Station', cat: 'police', w: 2, h: 2, cost: 4000, upkeep: 110, unlock: 1, icon: 'b-police', color: '#3d5fa8', height: 1,
    desc: 'Patrols reduce crime nearby.', coverage: [{ kind: 'police', radius: 24, strength: 1 }], jobs: 30 },
  { id: 'policehq', name: 'Police HQ', cat: 'police', w: 3, h: 3, cost: 16000, upkeep: 380, unlock: 3, icon: 'b-police', color: '#2c4a8a', height: 1.6,
    desc: 'Covers a whole district.', coverage: [{ kind: 'police', radius: 40, strength: 1.3 }], jobs: 120 },
  { id: 'fire', name: 'Fire Station', cat: 'fire', w: 2, h: 2, cost: 4000, upkeep: 110, unlock: 2, icon: 'b-fire', color: '#c94a3d', height: 1,
    desc: 'Fast response stops fires spreading.', coverage: [{ kind: 'fire', radius: 24, strength: 1 }], jobs: 30 },
  { id: 'firehq', name: 'Fire HQ', cat: 'fire', w: 3, h: 3, cost: 16000, upkeep: 380, unlock: 4, icon: 'b-fire', color: '#a63a2f', height: 1.5,
    desc: 'Covers a whole district.', coverage: [{ kind: 'fire', radius: 40, strength: 1.3 }], jobs: 120 },
  { id: 'clinic', name: 'Clinic', cat: 'health', w: 2, h: 2, cost: 5000, upkeep: 140, unlock: 1, icon: 'b-clinic', color: '#f1f4f7', height: 0.9,
    desc: 'Keeps the neighborhood healthy.', coverage: [{ kind: 'health', radius: 20, strength: 1 }], jobs: 40 },
  { id: 'hospital', name: 'Hospital', cat: 'health', w: 3, h: 3, cost: 25000, upkeep: 600, unlock: 3, icon: 'b-hospital', color: '#f6f8fb', height: 2,
    desc: 'Health care for a whole district.', coverage: [{ kind: 'health', radius: 38, strength: 1.4 }], jobs: 300 },
  { id: 'school', name: 'Elementary School', cat: 'education', w: 2, h: 2, cost: 5000, upkeep: 160, unlock: 1, icon: 'b-school', color: '#e8a86b', height: 0.9,
    desc: 'Basic education.', coverage: [{ kind: 'education', radius: 20, strength: 1 }], edu: 1, jobs: 40 },
  { id: 'highschool', name: 'High School', cat: 'education', w: 3, h: 3, cost: 14000, upkeep: 360, unlock: 2, icon: 'b-highschool', color: '#d99556', height: 1.2,
    desc: 'Skilled workers for offices.', coverage: [{ kind: 'education', radius: 30, strength: 1.2 }], edu: 2, jobs: 90 },
  { id: 'university', name: 'University', cat: 'education', w: 4, h: 4, cost: 45000, upkeep: 900, unlock: 3, icon: 'b-university', color: '#b9834f', height: 1.8,
    desc: 'Graduates fuel the office economy.', coverage: [{ kind: 'education', radius: 50, strength: 1.5 }], edu: 3, value: [10, 10], jobs: 400 },

  { id: 'park', name: 'Small Park', cat: 'park', w: 1, h: 1, cost: 400, upkeep: 8, unlock: 0, icon: 'b-park', color: '#5fbf5a', height: 0, flat: true,
    desc: 'A patch of green: +land value, cooler streets.', coverage: [{ kind: 'park', radius: 5, strength: 0.7 }], value: [4, 8] },
  { id: 'plaza', name: 'Plaza', cat: 'park', w: 2, h: 2, cost: 2500, upkeep: 30, unlock: 2, icon: 'b-plaza', color: '#d9cdb4', height: 0, flat: true,
    desc: 'Civic space: draws shoppers.', coverage: [{ kind: 'park', radius: 8, strength: 0.9 }], value: [7, 12] },
  { id: 'bigpark', name: 'City Park', cat: 'park', w: 3, h: 3, cost: 9000, upkeep: 80, unlock: 3, icon: 'b-bigpark', color: '#4aa84e', height: 0, flat: true,
    desc: 'A great green lung.', coverage: [{ kind: 'park', radius: 14, strength: 1.3 }], value: [12, 18] },
  { id: 'stadium', name: 'Stadium', cat: 'landmark', w: 4, h: 4, cost: 60000, upkeep: 700, unlock: 4, icon: 'b-stadium', color: '#d8dde3', height: 1.2,
    desc: 'Pride and noise. +happiness city-wide.', value: [14, 10], noise: 8, jobs: 150 },

  { id: 'bus', name: 'Bus Stop', cat: 'transit', w: 1, h: 1, cost: 600, upkeep: 30, unlock: 2, icon: 'b-bus', color: '#f2c94c', height: 0.4,
    desc: 'Buses serve the neighborhood: fewer cars.', coverage: [{ kind: 'transit', radius: 10, strength: 1 }] },
  { id: 'metro', name: 'Metro Station', cat: 'transit', w: 2, h: 2, cost: 30000, upkeep: 500, unlock: 3, icon: 'b-metro', color: '#e04f5f', height: 0.6,
    desc: 'Fast trains across the city: far fewer cars.', coverage: [{ kind: 'metro', radius: 14, strength: 1 }], value: [8, 10], jobs: 30 },
  { id: 'airport', name: 'Airport', cat: 'landmark', w: 6, h: 6, cost: 150000, upkeep: 1500, unlock: 4, icon: 'b-airport', color: '#c8ccd2', height: 0.8,
    desc: 'Connects the city to the world: +commercial and office demand. Very loud.', noise: 18, air: 6, jobs: 1200 },

  { id: 'levee', name: 'Flood Wall', cat: 'flood', w: 1, h: 1, cost: 800, upkeep: 6, unlock: 2, icon: 'b-levee', color: '#9a9488', height: 0.35,
    desc: 'Protects nearby low ground from floods.', coverage: [{ kind: 'flood', radius: 5, strength: 1 }] },
  { id: 'drain', name: 'Stormwater Drain', cat: 'flood', w: 2, h: 2, cost: 7000, upkeep: 90, unlock: 3, icon: 'b-drain', color: '#7d8a96', height: 0.3,
    desc: 'Carries monsoon water away from a whole district.', coverage: [{ kind: 'drain', radius: 18, strength: 1 }], jobs: 10 },
  { id: 'tvtower', name: 'TV Tower', cat: 'landmark', w: 1, h: 1, cost: 40000, upkeep: 300, unlock: 5, icon: 'b-tvtower', color: '#e6e9ee', height: 6,
    desc: 'A skyline icon. +land value and pride.', value: [16, 15], jobs: 40 },
];

export const BUILDING: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

export interface Milestone {
  name: string;
  pop: number;
  blurb: string;
}

export const MILESTONES: Milestone[] = [
  { name: 'Settlement', pop: 0, blurb: 'A few families and a road.' },
  { name: 'Village', pop: 500, blurb: 'Industry, schools, clinics and police arrive.' },
  { name: 'Town', pop: 5000, blurb: 'Avenues, buses, fire stations, offices and high schools.' },
  { name: 'City', pop: 25000, blurb: 'Metro, hospitals, universities, wind power and flood defenses.' },
  { name: 'Metropolis', pop: 100000, blurb: 'Highways, an airport, skyscrapers and solar farms.' },
  { name: 'Megacity', pop: 500000, blurb: 'Nuclear power and city-defining landmarks.' },
  { name: 'Future', pop: 1500000, blurb: 'Fusion power and the smart city.' },
];

/** Which milestone unlocks each zone/density and road. */
export const UNLOCK = {
  street: 0,
  avenue: 2,
  highway: 4,
  'res-low': 0,
  'com-low': 0,
  'ind-low': 0,
  'res-high': 2,
  'com-high': 2,
  'off-low': 2,
  'ind-high': 3,
  'off-high': 3,
} as const;

export interface PolicyDef {
  id: string;
  name: string;
  unlock: number;
  desc: string;
  /** Monthly cost per 1,000 residents. */
  cost: number;
}

export const POLICIES: PolicyDef[] = [
  { id: 'industry', name: 'Industrial Incentives', unlock: 1, cost: 4, desc: 'Jobs ↑ and industrial demand ↑. Pollution ↑.' },
  { id: 'affordable', name: 'Affordable Housing', unlock: 2, cost: 8, desc: 'Migration ↑, housing pressure ↓. Residential tax revenue ↓.' },
  { id: 'cardfree', name: 'Car-Free Downtown', unlock: 2, cost: 2, desc: 'Traffic ↓ and shoppers ↑ in dense areas. Road capacity ↓.' },
  { id: 'freetransit', name: 'Free Public Transit', unlock: 3, cost: 10, desc: 'Transit use ↑, traffic ↓. Costs money.' },
  { id: 'green', name: 'Green City', unlock: 3, cost: 6, desc: 'Pollution ↓, happiness ↑. Construction costs ↑ 15%.' },
  { id: 'recycle', name: 'Recycling Program', unlock: 3, cost: 3, desc: 'Garbage ↓ by 25%.' },
  { id: 'smarttraffic', name: 'Smart Traffic Lights', unlock: 4, cost: 5, desc: 'Road capacity ↑ 15%.' },
  { id: 'highrisecap', name: 'Heritage Skyline', unlock: 4, cost: 0, desc: 'No new buildings above level 3. Land value ↑ a little.' },
  { id: 'autonomous', name: 'Autonomous Transport', unlock: 6, cost: 12, desc: 'Road capacity ↑ 40%, commute stress ↓.' },
];

export const POLICY: Record<string, PolicyDef> = Object.fromEntries(POLICIES.map((p) => [p.id, p]));

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const SURNAMES = {
  india: ['Sharma', 'Patel', 'Iyer', 'Khan', 'Das', 'Reddy', 'Gupta', 'Nair', 'Singh', 'Banerjee', 'Menon', 'Joshi', 'Kulkarni', 'Fernandes', 'Rao', 'Chatterjee', 'Pillai', 'Mehta', 'Bose', 'Kapoor'],
  generic: ['Okafor', 'Novak', 'Silva', 'Kim', 'Haddad', 'Larsen', 'Moreau', 'Rossi', 'Tanaka', 'Mendez', 'Kowalski', 'Nguyen', 'Adeyemi', 'Fischer', 'Ahmed', 'Costa', 'Murphy', 'Ivanova', 'Santos', 'Chen'],
};

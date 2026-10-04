import { SURNAMES, Ter, Zone } from './defs';
import type { City } from './city';
import { clearLot } from './build';
import { FLAG_ABANDONED, FLAG_FIRE, FLAG_FLOODED } from './state';

// Disasters, news and citizen stories. Disasters come out of how the city was
// built: floods find the homes on the floodplain, fires spread where there is
// no fire station, epidemics where clinics are missing.

const INDIA = (c: City) => c.s.settings.region === 'india';

function active(c: City, kind: string): boolean {
  return c.s.disasters.some((d) => d.kind === kind);
}

function begin(c: City, kind: string, months: number, label: string): void {
  c.s.disasters.push({ kind, tick: c.s.tick, until: c.s.tick + months, label });
}

/** At most one warning of a kind per `every` months. */
function throttle(c: City, key: string, every: number): boolean {
  const last = c.s.streaks[`w:${key}`];
  if (last !== undefined && c.s.tick - last < every) return false;
  c.s.streaks[`w:${key}`] = c.s.tick;
  return true;
}

export function districtName(c: City, d: number): string {
  return c.s.districtNames[d] ?? `District ${d + 1}`;
}

// --- Floods -------------------------------------------------------------------------

/** Tiles reached by water rising to `level`, stopped by flood walls and drains. */
export function floodReach(c: City, level: number): number[] {
  const t = c.s.tiles;
  const seen = new Uint8Array(c.n);
  const queue: number[] = [];
  for (let i = 0; i < c.n; i++) {
    if (t.ter[i] === Ter.Water) {
      seen[i] = 1;
      queue.push(i);
    }
  }
  const out: number[] = [];
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q];
    for (let k = 0; k < 4; k++) {
      const nb = c.nb[cur * 4 + k];
      if (nb < 0 || seen[nb]) continue;
      seen[nb] = 1;
      if (t.bld[nb] >= 0 && c.s.buildings[t.bld[nb]]?.type === 'levee') continue;
      if (c.cov.flood[nb] >= 0.35) continue;
      if (t.elev[nb] >= level - c.cov.drain[nb] * 30) continue;
      out.push(nb);
      queue.push(nb);
    }
  }
  return out;
}

function flood(c: City, level: number, kind: 'monsoon' | 'storm' | 'cyclone'): void {
  const t = c.s.tiles;
  const tiles = floodReach(c, level);
  let homes = 0;
  let destroyed = 0;
  const byDistrict = new Map<number, number>();
  for (const i of tiles) {
    t.flags[i] |= FLAG_FLOODED;
    if (!t.level[i]) continue;
    homes += t.zone[i] === Zone.Res ? t.occ[i] : 0;
    byDistrict.set(c.district(i), (byDistrict.get(c.district(i)) ?? 0) + 1);
    if (c.rng.next() < (kind === 'cyclone' ? 0.3 : 0.18)) {
      destroyed++;
      if (t.level[i] > 1) t.level[i]--;
      else clearLot(c, i, true);
    }
  }
  begin(c, 'flood', 2, kind === 'monsoon' ? 'Monsoon floods' : kind === 'cyclone' ? 'Cyclone' : 'Floods');
  c.s.streaks.floodDamage = (c.s.streaks.floodDamage ?? 0) + destroyed;
  const worst = [...byDistrict.entries()].sort((a, b) => b[1] - a[1])[0];
  const where = worst ? districtName(c, worst[0]) : 'low-lying areas';
  const tile = worst ? tiles.find((i) => c.district(i) === worst[0]) ?? -1 : -1;
  const title = kind === 'monsoon' ? (level > 125 ? 'EXTREME MONSOON' : 'Heavy monsoon rains') : kind === 'cyclone' ? 'CYCLONE MAKES LANDFALL' : 'Storm floods the riverbanks';
  if (homes > 0 || destroyed > 0) {
    const dmg = destroyed === 1 ? '1 building damaged' : `${destroyed} buildings damaged`;
    c.news('disaster', `${title}: flooding reported in ${where}. ${homes.toLocaleString('en-US')} residents affected, ${dmg}.`, tile);
    if (destroyed >= 5 || level > 125) c.history('disaster', destroyed > 20 ? 3 : 2, `${title}: ${where} floods (${dmg}).`, tile);
    c.emit({ type: 'disaster', kind: 'flood', tile });
  } else if (tiles.length > 30) {
    c.news('news', `${title}: the rivers rise, but the city stays dry.`);
  }
}

// --- Fires -------------------------------------------------------------------------

function runFires(c: City): void {
  const t = c.s.tiles;
  const heat = active(c, 'heat') ? 2 : 1;
  let started = -1;
  let lost = 0;
  const burning: number[] = [];
  for (let i = 0; i < c.n; i++) if (t.flags[i] & FLAG_FIRE) burning.push(i);
  for (const i of burning) {
    const cov = Math.min(1, c.cov.fire[i]);
    for (let k = 0; k < 4; k++) {
      const nb = c.nb[i * 4 + k];
      if (nb >= 0 && t.level[nb] && !(t.flags[nb] & FLAG_FIRE) && c.rng.next() < 0.3 * (1 - cov) * heat) t.flags[nb] |= FLAG_FIRE;
    }
    if (c.rng.next() < 0.3 + cov * 0.7) {
      t.flags[i] &= ~FLAG_FIRE;
      if (c.rng.next() < 0.6 - cov * 0.45) {
        clearLot(c, i, true);
        lost++;
      }
    }
  }
  for (let i = 0; i < c.n; i++) {
    if (!t.level[i] || t.flags[i] & FLAG_FIRE) continue;
    const risk = 0.00005 * (1.15 - Math.min(1, c.cov.fire[i])) * (t.zone[i] === Zone.Ind ? 2 : 1) * heat * (t.flags[i] & FLAG_ABANDONED ? 3 : 1);
    if (c.rng.next() < risk) {
      t.flags[i] |= FLAG_FIRE;
      if (started < 0) started = i;
    }
  }
  if (started >= 0 && throttle(c, 'fire', 2)) {
    const cov = c.cov.fire[started];
    const where = districtName(c, c.district(started));
    c.news(cov > 0.3 ? 'news' : 'warning', cov > 0.3 ? `Firefighters respond to a blaze in ${where}.` : `Fire breaks out in ${where}, and no fire station is near.`, started);
  }
  if (lost >= 6) {
    c.history('disaster', lost > 20 ? 3 : 2, `A great fire destroys ${lost} buildings.`);
    c.news('disaster', `A fire spreads unchecked: ${lost} buildings lost this month.`);
  }
}

// --- Other disasters ------------------------------------------------------------

function quake(c: City): void {
  const t = c.s.tiles;
  const ex = c.rng.int(c.w);
  const ey = c.rng.int(c.h);
  let damaged = 0;
  for (let y = ey - 12; y <= ey + 12; y++) {
    for (let x = ex - 12; x <= ex + 12; x++) {
      const i = c.idx(x, y);
      if (i < 0 || !t.level[i]) continue;
      const d = Math.hypot(x - ex, y - ey);
      if (d > 12) continue;
      if (c.rng.next() < 0.35 * (1 - d / 13)) {
        damaged++;
        if (t.level[i] > 1) t.level[i]--;
        else clearLot(c, i, true);
        if (c.rng.next() < 0.08) t.flags[i] |= FLAG_FIRE;
      }
    }
  }
  const tile = c.idx(ex, ey);
  begin(c, 'quake', 1, 'Earthquake');
  c.news('disaster', `EARTHQUAKE near ${districtName(c, c.district(tile))}: ${damaged} buildings damaged.`, tile);
  c.history('disaster', 3, `An earthquake strikes; ${damaged} buildings are damaged.`, tile);
  c.emit({ type: 'disaster', kind: 'quake', tile });
}

function seasonal(c: City): void {
  const m = c.month;
  const india = INDIA(c);
  const map = c.s.settings.map;
  const rng = c.rng;
  const pop = c.s.last.pop;
  if (pop < 200) return;
  // Floods.
  if (india && m === 6 && !active(c, 'flood')) {
    const extreme = rng.next() < 0.18;
    flood(c, extreme ? rng.float(128, 150) : rng.float(92, 116), 'monsoon');
  } else if (!india && (m === 3 || m === 9) && rng.next() < 0.18 && !active(c, 'flood')) {
    flood(c, rng.float(88, 128), 'storm');
  }
  if ((map === 'coast' || map === 'island') && m === (india ? 10 : 8) && rng.next() < 0.12 && c.year > 3) {
    flood(c, rng.float(110, 140), 'cyclone');
  }
  // Heat and drought.
  if (m === (india ? 4 : 6) && rng.next() < 0.25 && !active(c, 'heat')) {
    begin(c, 'heat', 2, 'Heat wave');
    const shade = pop > 0 ? 'Trees and parks keep some streets cool.' : '';
    c.news('disaster', `HEAT WAVE: temperatures soar. Fire risk doubles. ${shade}`);
  }
  if (m === (india ? 3 : 7) && rng.next() < 0.1 && !active(c, 'drought') && c.year > 2) {
    begin(c, 'drought', 3, 'Drought');
    c.news('disaster', 'DROUGHT: rivers and lakes run low. Water pumps deliver half as much.');
    c.history('disaster', 2, 'A drought dries the rivers.');
  }
  // Epidemics follow density and missing clinics.
  if (pop > 3000 && !active(c, 'epidemic')) {
    const t = c.s.tiles;
    let cov = 0;
    let res = 0;
    for (let i = 0; i < c.n; i++) {
      if (t.zone[i] === Zone.Res && t.occ[i]) {
        cov += Math.min(1, c.cov.health[i]) * t.occ[i];
        res += t.occ[i];
      }
    }
    const care = res ? cov / res : 0;
    if (rng.next() < 0.004 * (1 - care) * Math.min(3, pop / 20000 + 0.5)) {
      begin(c, 'epidemic', 4, 'Epidemic');
      c.news('disaster', `EPIDEMIC: a fever spreads through the city. Only ${Math.round(care * 100)}% of residents live near a clinic or hospital.`);
      c.history('disaster', 2, 'An epidemic sweeps the city.');
    }
  }
  if (c.year >= 8 && rng.next() < 0.0012) quake(c);
}

// --- News ---------------------------------------------------------------------------

function warnings(c: City): void {
  const L = c.s.last;
  if (L.pop < 60) return;
  const sym = (n: number) => c.currency(n);
  if (L.power[1] > L.power[0] && throttle(c, 'power', 8)) c.news('warning', `Brownouts: the city uses ${L.power[1]} MW but makes ${L.power[0]} MW. Build power plants.`);
  if (L.water[1] > L.water[0] && throttle(c, 'water', 8)) c.news('warning', `Taps run dry: water demand is ${L.water[1].toLocaleString('en-US')} but supply is ${L.water[0].toLocaleString('en-US')}.`);
  if (L.pop > 2000 && L.sewage[1] > L.sewage[0] * 1.05 && throttle(c, 'sewage', 12)) c.news('warning', 'Sewage backs up into the streets. Build sewage treatment.');
  if (c.garbageShortage > 0.2 && throttle(c, 'garbage', 10)) c.news('warning', 'Garbage piles up on the curbs. Build a landfill or incinerator.');
  if (L.traffic > 0.9 && L.pop > 3000 && throttle(c, 'traffic', 10)) c.news('warning', `Gridlock: the average commute is now ${Math.round(L.commute)} minutes.`);
  const unemp = L.workers ? 1 - L.employed / L.workers : 0;
  if (unemp > 0.15 && L.pop > 1000 && throttle(c, 'jobs', 10)) c.news('warning', `Unemployment climbs to ${Math.round(unemp * 100)}%. Zone more commercial, industry or offices.`);
  if (c.s.money < 0 && throttle(c, 'debt', 6)) c.news('warning', `The city is in debt (${sym(c.s.money)}). Raise taxes or cut costs.`);
  if (L.air > 35 && throttle(c, 'air', 14)) c.news('warning', 'Smog over the city: residents complain about the air.');
  // Housing crisis: sustained demand and nowhere to live.
  const housing = L.demand[0] > 0.75 && L.pop > 2000;
  c.s.streaks.housing = housing ? (c.s.streaks.housing ?? 0) + 1 : 0;
  if (c.s.streaks.housing === 8) {
    c.news('news', 'HOUSING CRISIS: rents soar as families queue for homes. Zone more residential.');
    c.history('economy', 2, 'A housing crisis grips the city.');
  }
}

function stories(c: City): void {
  const rng = c.rng;
  if (c.s.last.pop < 300 || rng.next() > 0.09) return;
  const t = c.s.tiles;
  const india = INDIA(c);
  const name = rng.pick(india ? SURNAMES.india : SURNAMES.generic);
  // Pick a home and tell its story.
  for (let tries = 0; tries < 40; tries++) {
    const i = rng.int(c.n);
    if (t.zone[i] !== Zone.Res || !t.occ[i]) continue;
    const where = districtName(c, c.district(i));
    const reasons: [string, number][] = [
      ['the new metro line', c.cov.metro[i] > 0.4 ? 3 : 0],
      ['the good schools', c.edu[i] > 1.6 ? 2 : 0],
      ['the quiet, leafy streets', c.cov.park[i] > 0.5 && c.noise[i] < 15 ? 2 : 0],
      ['the hospital nearby', c.cov.health[i] > 0.9 ? 1.5 : 0],
      ['a job across town', c.s.last.demand[0] > 0.3 ? 1 : 0],
      ['the river views', c.land[i] > 60 ? 1 : 0],
      ['the cheap rent', c.land[i] < 35 ? 1 : 0],
    ];
    const reason = rng.weighted(reasons);
    const worst = c.factors[0];
    if (c.happy[i] < 40 && worst && worst.value < -3) {
      c.news('story', `The ${name} family is leaving ${where}, tired of the ${worst.label.toLowerCase()}.`, i);
      return;
    }
    if (reason) {
      c.news('story', `The ${name} family moved into ${where} because of ${reason}.`, i);
      return;
    }
  }
}

// --- Districts ----------------------------------------------------------------------

const PARTS = {
  generic: {
    a: ['Oak', 'Cedar', 'Ash', 'Elm', 'Maple', 'Willow', 'Stone', 'Mill', 'Brook', 'Fair', 'Green', 'Bright', 'Kings', 'Queens', 'Sun', 'Red', 'Silver', 'Hazel', 'Rose', 'Fox'],
    b: ['wood', 'field', 'gate', 'ton', 'ford', 'dale', 'crest', 'haven', 'park', 'view', 'bury', 'heath'],
    water: ['Riverside', 'Harbor', 'Lakeview', 'Waterfront', 'Bridgeport', 'Tidewater', 'Wharf End', 'Bayside'],
    first: 'Old Town',
  },
  india: {
    a: ['Ashok', 'Shanti', 'Gandhi', 'Nehru', 'Ganga', 'Kamla', 'Rajendra', 'Lajpat', 'Vikas', 'Prem', 'Lakshmi', 'Sarojini', 'Tilak', 'Subhash', 'Jawahar', 'Model', 'Civil', 'Rani', 'Sadar', 'Vivek'],
    b: [' Nagar', ' Vihar', ' Colony', ' Bagh', 'puram', 'ganj', ' Enclave', ' Chowk', ' Park', ' Market'],
    water: ['Ghat Road', 'Lake Town', 'Nadi Kinara', 'Sagar Vihar', 'Bandar', 'Talab Colony', 'Pul Bazaar', 'Jal Nagar'],
    first: 'Purana Shahar',
  },
};

function nameDistricts(c: City): void {
  const t = c.s.tiles;
  const D = c.dw * c.dh;
  const pop = new Float64Array(D);
  const water = new Uint8Array(D);
  for (let i = 0; i < c.n; i++) {
    const d = c.district(i);
    if (t.ter[i] === Ter.Water) water[d] = 1;
    if (t.occ[i]) pop[d] += t.occ[i];
  }
  const parts = INDIA(c) ? PARTS.india : PARTS.generic;
  const used = new Set(Object.values(c.s.districtNames));
  const hall = Object.values(c.s.buildings).find((b) => b.type === 'cityhall');
  for (let d = 0; d < D; d++) {
    if (c.s.districtNames[d] || pop[d] < 40) continue;
    let name = '';
    if (hall && c.district(c.idx(hall.x, hall.y)) === d && !used.has(parts.first)) name = parts.first;
    for (let k = 0; !name && k < 30; k++) {
      const cand = water[d] && k < 10 ? c.rng.pick(parts.water) : c.rng.pick(parts.a) + c.rng.pick(parts.b);
      if (!used.has(cand)) name = cand;
    }
    if (!name) name = `District ${d + 1}`;
    c.s.districtNames[d] = name;
    used.add(name);
  }
}

/** Expire finished disasters and clear their marks. */
function expire(c: City): void {
  const done = c.s.disasters.filter((d) => d.until <= c.s.tick);
  if (!done.length) return;
  c.s.disasters = c.s.disasters.filter((d) => d.until > c.s.tick);
  if (done.some((d) => d.kind === 'flood') && !active(c, 'flood')) {
    for (let i = 0; i < c.n; i++) c.s.tiles.flags[i] &= ~FLAG_FLOODED;
    c.emit({ type: 'changed' });
  }
}

export function runEvents(c: City): void {
  expire(c);
  runFires(c);
  seasonal(c);
  warnings(c);
  stories(c);
  nameDistricts(c);
}

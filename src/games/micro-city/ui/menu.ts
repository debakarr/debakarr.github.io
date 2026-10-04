import { compact, h } from '../../shared/dom';
import { randomSeedString } from '../../shared/rng';
import { icons, type IconKey } from '../art';
import { CHALLENGE, CHALLENGES } from '../sim/challenges';
import { Ter } from '../sim/defs';
import { generateTerrain } from '../sim/mapgen';
import type { MapKind, Region, Settings } from '../sim/state';
import { loadCity, newCity } from '../sim/step';
import { store, type App } from './app';
import { PANELS, type PanelId } from './panels';
import { gi } from './util';

// Title screen, dialogs and toasts.

const MAPS: { id: MapKind; label: string; blurb: string }[] = [
  { id: 'river', label: 'River', blurb: 'A river with a wide floodplain.' },
  { id: 'coast', label: 'Coast', blurb: 'Sea on one side, a creek inland.' },
  { id: 'lakes', label: 'Lakes', blurb: 'Several lakes to build around.' },
  { id: 'island', label: 'Island', blurb: 'Surrounded by the sea.' },
  { id: 'valley', label: 'Valley', blurb: 'A river between steep ridges.' },
];

const SIZES = [
  { size: 96, label: 'Small' },
  { size: 128, label: 'Medium' },
  { size: 160, label: 'Large' },
];

function cityName(region: Region): string {
  const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  if (region === 'india') return pick(['Nava', 'Surya', 'Chandra', 'Ratna', 'Dev', 'Sagar', 'Kamal', 'Indra', 'Megha', 'Tara']) + pick(['pur', 'nagar', 'garh', 'abad', 'puram', 'khand']);
  return pick(['Nova', 'River', 'Maple', 'Port', 'Bright', 'Cedar', 'Lake', 'Stone', 'Fair', 'West', 'Silver', 'Harbor']) + pick(['ton', 'wood', ' Falls', 'haven', 'mere', 'field', ' City', 'bridge', 'side']);
}

// --- Modal + toast --------------------------------------------------------------------

export function modal(app: App, title: string, body: Node, opts: { icon?: IconKey; wide?: boolean; onClose?: () => void } = {}): () => void {
  app.pause(true);
  const close = () => {
    el.remove();
    app.pause(false);
    opts.onClose?.();
  };
  const el = h('div', { class: 'mc-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onclick: (e: Event) => e.target === el && close() },
    h('div', { class: `mc-card ${opts.wide ? 'wide' : ''}` },
      h('div', { class: 'mc-cardhead' }, opts.icon ? gi(opts.icon) : null, h('h2', null, title), h('button', { class: 'mc-iconbtn', 'aria-label': 'Close', onclick: close }, gi('u-close'))),
      h('div', { class: 'mc-cardbody' }, body),
    ),
  );
  app.root.append(el);
  (el.querySelector('button, input') as HTMLElement | null)?.focus();
  return close;
}

export function toast(app: App, kind: 'info' | 'disaster' | 'milestone', title: string, text: string, tile = -1): void {
  const host = app.root.querySelector('.mc-toasts') ?? app.root;
  const el = h('div', { class: `mc-toast ${kind}`, role: 'status' },
    gi(kind === 'disaster' ? 'd-rain' : kind === 'milestone' ? 'p-challenge' : 'u-info'),
    h('span', null, h('b', null, title), text),
  );
  if (tile >= 0) {
    el.classList.add('link');
    el.addEventListener('click', () => {
      app.jump(tile);
      el.remove();
    });
  }
  // Skip repeats of a toast that is still showing.
  for (const t of host.querySelectorAll('.mc-toast')) if (t.textContent === el.textContent) return;
  host.append(el);
  const max = matchMedia('(max-width: 820px), (max-height: 520px)').matches ? 2 : 3;
  while (host.querySelectorAll('.mc-toast').length > max) host.querySelector('.mc-toast')?.remove();
  const life = kind === 'info' ? 3500 : 6000;
  setTimeout(() => el.classList.add('out'), life);
  setTimeout(() => el.remove(), life + 450);
}

// --- Title -----------------------------------------------------------------------------

function skyline(cv: HTMLCanvasElement): void {
  const draw = () => {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(1, r.width * dpr);
    cv.height = Math.max(1, r.height * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const W = r.width;
    const H = r.height;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#9fd3f7');
    sky.addColorStop(0.7, '#e6f4fb');
    sky.addColorStop(1, '#fdf3dc');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let k = 0; k < 6; k++) {
      const x = ((k * 233) % 100) / 100 * W;
      const y = H * (0.1 + ((k * 37) % 30) / 100);
      ctx.beginPath();
      ctx.ellipse(x, y, 60, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 30, y - 8, 40, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Three rows of buildings, far to near.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rows = [
      { base: H * 0.78, color: '#b7cbe0', maxH: H * 0.5, w: [14, 30] },
      { base: H * 0.86, color: '#7f9bbb', maxH: H * 0.42, w: [18, 40] },
      { base: H * 0.95, color: '#4d6a8c', maxH: H * 0.3, w: [22, 50] },
    ];
    for (const row of rows) {
      let x = -20;
      while (x < W + 20) {
        const bw = row.w[0] + rnd() * (row.w[1] - row.w[0]);
        const center = 1 - Math.abs(x / W - 0.5) * 1.4;
        const bh = (0.15 + rnd() * 0.85 * Math.max(0.2, center)) * row.maxH;
        ctx.fillStyle = row.color;
        ctx.fillRect(x, row.base - bh, bw, bh + H);
        if (rnd() < 0.15) ctx.fillRect(x + bw / 2 - 1, row.base - bh - 16, 2, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let wy = row.base - bh + 6; wy < row.base - 4; wy += 7) {
          for (let wx = x + 4; wx < x + bw - 4; wx += 6) if (rnd() < 0.5) ctx.fillRect(wx, wy, 2, 3);
        }
        x += bw + rnd() * 6;
      }
    }
    ctx.fillStyle = '#6fbf5a';
    ctx.fillRect(0, H * 0.95, W, H * 0.05);
  };
  requestAnimationFrame(draw);
  window.addEventListener('resize', () => cv.isConnected && draw());
}

export function showTitle(app: App): void {
  const root = app.root;
  root.textContent = '';
  root.classList.add('mc');
  const auto = store.list().find((m) => m.key === 'auto');
  const cv = h('canvas', { class: 'mc-skyline', 'aria-hidden': 'true' });
  const btn = (label: string, icon: IconKey, onclick: () => void, primary = false) =>
    h('button', { class: `mc-btn ${primary ? 'primary' : ''}`, onclick }, gi(icon), label);
  root.append(h('div', { class: 'mc-title' },
    cv,
    h('div', { class: 'mc-titlecard' },
      h('h1', null, 'MICRO CITY'),
      h('p', { class: 'mc-tag' }, 'Lay roads. Zone land. Watch the city grow, and find out why it is unhappy.'),
      h('div', { class: 'mc-titlebtns' },
        auto ? btn(`Continue: ${auto.title}`, 'u-play', () => void continueAuto(app), true) : null,
        btn('New city', 'b-cityhall', () => newCityDialog(app), !auto),
        btn('Challenges', 'p-challenge', () => challengeDialog(app)),
        store.list().length ? btn('Load', 'u-save', () => loadDialog(app)) : null,
        btn('Import file', 'p-history', () => void app.importCity()),
        btn('How to play', 'u-info', () => helpDialog(app)),
      ),
      auto ? h('p', { class: 'mc-sub' }, auto.subtitle) : null,
    ),
    h('footer', { class: 'mc-titlefoot' },
      h('a', { href: '/games', 'data-astro-reload': true }, '← All games'),
      h('span', null, 'Icons from ', h('a', { href: 'https://game-icons.net', target: '_blank', rel: 'noopener' }, 'game-icons.net'), ' (CC BY 3.0)'),
      h('button', { class: 'mc-linkbtn', onclick: () => creditsDialog(app) }, 'Credits'),
    ),
  ));
  skyline(cv);
}

async function continueAuto(app: App): Promise<void> {
  try {
    app.start(loadCity(await store.load('auto')));
  } catch (err) {
    toast(app, 'info', 'Could not load', err instanceof Error ? err.message : 'The autosave is damaged.');
  }
}

// --- New city ---------------------------------------------------------------------------

function previewMap(cv: HTMLCanvasElement, s: Settings): void {
  const { tiles } = generateTerrain(s);
  const n = s.size;
  const img = document.createElement('canvas');
  img.width = n;
  img.height = n;
  const ictx = img.getContext('2d')!;
  const data = ictx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const t = tiles.ter[i];
    const e = tiles.elev[i];
    let rgb: number[];
    if (t === Ter.Water) rgb = [74, 163, 223];
    else if (t === Ter.Sand) rgb = [230, 211, 156];
    else if (t === Ter.Rock) rgb = [165, 161, 152];
    else {
      const f = (e - 120) / 300;
      rgb = t === Ter.Forest ? [98, 160, 78] : [140, 197, 107];
      rgb = rgb.map((v) => Math.max(0, Math.min(255, v + f * 120)));
    }
    data.data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  }
  ictx.putImageData(data, 0, 0);
  const ctx = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  const sc = Math.min(W / (2 * n), H / n);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(sc, sc / 2, -sc, sc / 2, W / 2, (H - n * sc) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
}

export function newCityDialog(app: App, challenge: string | null = null): void {
  const ch = challenge ? CHALLENGE[challenge] : null;
  const s: Settings = { seed: randomSeedString(), size: 128, map: ch?.map ?? 'river', region: 'india', name: '', challenge };
  s.name = cityName(s.region);
  const cv = h('canvas', { class: 'mc-preview', width: 480, height: 250 });
  let timer = 0;
  const refresh = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => previewMap(cv, s), 60);
  };
  const name = h('input', { type: 'text', value: s.name, maxlength: '32', 'aria-label': 'City name', oninput: (e: Event) => (s.name = (e.target as HTMLInputElement).value) });
  const seed = h('input', { type: 'text', value: s.seed, maxlength: '60', 'aria-label': 'Map seed', oninput: (e: Event) => { s.seed = (e.target as HTMLInputElement).value || 'micro'; refresh(); } });
  const choice = <T extends string | number>(label: string, opts: { v: T; label: string; title?: string }[], get: () => T, set: (v: T) => void, locked = false) => {
    const wrap = h('div', { class: 'mc-choice', role: 'radiogroup', 'aria-label': label });
    const draw = () => {
      wrap.replaceChildren(...opts.map((o) => h('button', {
        class: get() === o.v ? 'on' : '', role: 'radio', 'aria-checked': String(get() === o.v), title: o.title ?? o.label, disabled: locked && get() !== o.v,
        onclick: () => { set(o.v); draw(); refresh(); },
      }, o.label)));
    };
    draw();
    return h('label', { class: 'mc-field' }, h('span', null, label), wrap);
  };
  const body = h('div', { class: 'mc-newcity' },
    ch ? h('p', { class: 'mc-challengebrief' }, gi('p-challenge'), h('span', null, h('b', null, ch.name), ` — ${ch.goal}`)) : null,
    h('div', { class: 'mc-newgrid' },
      h('div', null,
        h('label', { class: 'mc-field' }, h('span', null, 'City name'), name),
        h('label', { class: 'mc-field' }, h('span', null, 'Map seed'), h('div', { class: 'mc-inline' }, seed, h('button', { class: 'mc-btn', 'aria-label': 'Random seed', onclick: () => { s.seed = randomSeedString(); seed.value = s.seed; refresh(); } }, 'Random'))),
        choice('Terrain', MAPS.map((m) => ({ v: m.id, label: m.label, title: m.blurb })), () => s.map, (v) => (s.map = v), !!ch?.map),
        choice('Size', SIZES.map((z) => ({ v: z.size, label: z.label, title: `${z.size} × ${z.size} tiles` })), () => s.size, (v) => (s.size = v)),
        choice('Setting', [{ v: 'india' as Region, label: 'Indian city', title: 'Rupees, monsoon floods, colorful houses with water tanks' }, { v: 'generic' as Region, label: 'Generic', title: 'Dollars, spring storms' }], () => s.region, (v) => {
          s.region = v;
          s.name = cityName(v);
          name.value = s.name;
        }),
      ),
      h('div', { class: 'mc-previewbox' }, cv, h('small', null, 'Lighter green is higher ground. Low land near water floods.')),
    ),
    h('div', { class: 'mc-actions' },
      h('button', { class: 'mc-btn primary', onclick: () => {
        s.name = s.name.trim() || cityName(s.region);
        close();
        app.start(newCity(s));
      } }, gi('u-play'), 'Found the city'),
    ),
  );
  const close = modal(app, ch ? `Challenge: ${ch.name}` : 'New city', body, { icon: 'b-cityhall', wide: true });
  refresh();
}

function challengeDialog(app: App): void {
  const body = h('div', { class: 'mc-challenges' },
    ...CHALLENGES.map((ch) => h('button', { class: 'mc-challenge', onclick: () => { close(); newCityDialog(app, ch.id); } },
      h('b', null, ch.name), h('span', null, ch.brief), h('small', null, ch.goal))),
  );
  const close = modal(app, 'Challenges', body, { icon: 'p-challenge' });
}

function loadDialog(app: App): void {
  const list = h('div', { class: 'mc-slots' });
  const draw = () => {
    const slots = store.list();
    if (!slots.length) {
      list.replaceChildren(h('p', { class: 'mc-empty' }, 'No saved cities yet.'));
      return;
    }
    list.replaceChildren(...slots.map((m) => h('div', { class: 'mc-slot' },
      h('div', null, h('b', null, `${m.label === 'Autosave' ? 'Autosave · ' : ''}${m.title}`), h('small', null, `${m.subtitle} · saved ${new Date(m.savedAt).toLocaleString()}`)),
      h('button', { class: 'mc-btn primary', onclick: async () => {
        try {
          const city = loadCity(await store.load(m.key));
          close();
          app.start(city);
        } catch (err) {
          toast(app, 'info', 'Could not load', err instanceof Error ? err.message : 'The save is damaged.');
        }
      } }, 'Load'),
      h('button', { class: 'mc-btn danger', 'aria-label': `Delete ${m.title}`, onclick: () => { store.remove(m.key); draw(); } }, 'Delete'),
    )));
  };
  draw();
  const close = modal(app, 'Load a city', list, { icon: 'u-save' });
}

// --- In-game menu ------------------------------------------------------------------------

export function showMenu(app: App, page?: 'help'): void {
  if (page === 'help') return helpDialog(app);
  const c = app.city;
  const item = (label: string, icon: IconKey, fn: () => void) => h('button', { class: 'mc-menuitem', onclick: () => { close(); fn(); } }, gi(icon), label);
  const panels: PanelId[] = ['report', 'budget', 'stats', 'districts', 'history', 'news'];
  if (c.s.settings.challenge) panels.push('challenge');
  const body = h('div', { class: 'mc-menu' },
    h('p', { class: 'mc-sub' }, `${c.s.settings.name} · ${compact(c.s.last.pop)} people · ${c.dateLabel()} · seed “${c.s.settings.seed}”`),
    h('div', { class: 'mc-menugrid' },
      item('Resume', 'u-play', () => undefined),
      item('Save', 'u-save', async () => {
        await app.save(`city-${c.s.settings.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
        toast(app, 'info', 'Saved', `${c.s.settings.name} · ${c.dateLabel()}`);
      }),
      item('Load', 'p-history', () => loadDialog(app)),
      item('Export file', 'u-save', () => app.exportCity()),
      item('Import file', 'p-history', () => void app.importCity()),
      item('New city', 'b-cityhall', () => newCityDialog(app)),
    ),
    h('h4', null, 'Panels'),
    h('div', { class: 'mc-menugrid' }, ...panels.map((id) => item(PANELS[id].title, PANELS[id].icon, () => app.openPanel(id)))),
    h('div', { class: 'mc-menugrid' },
      item('How to play', 'u-info', () => helpDialog(app)),
      item('Credits', 'p-news', () => creditsDialog(app)),
      item('Quit to title', 'u-close', () => app.quitToTitle()),
    ),
  );
  const close = modal(app, 'Menu', body, { icon: 'u-menu' });
}

function helpDialog(app: App): void {
  const step = (icon: IconKey, title: string, text: string) => h('div', { class: 'mc-step-help' }, gi(icon), h('div', null, h('b', null, title), h('p', null, text)));
  const body = h('div', { class: 'mc-help' },
    step('t-road', '1. Lay roads', 'Pick Roads and drag. Everything grows along roads, and power, water and sewage travel along them too.'),
    step('t-zone', '2. Zone land', 'Drag zones next to roads: green homes, blue shops, yellow industry, purple offices. Buildings grow by themselves when there is demand (the R C I O bars at the top).'),
    step('t-power', '3. Power and water', 'Build a power plant and a water tower on the road network. Unpowered buildings blink with a lightning bolt.'),
    step('t-services', '4. Services', 'Police, fire, clinics and schools reach homes by driving the roads. Parks raise land value. Taller buildings need water, sewers and good land value.'),
    step('s-traffic', '5. Traffic', 'Workers commute along the fastest roads, so one road usually carries everyone. Upgrade it, add parallel streets, or build bus stops and metro stations.'),
    step('d-rain', '6. Disasters follow design', 'Floods find homes on low ground by the water, fires spread where no fire station reaches, epidemics where clinics are missing. Check the flood-risk overlay.'),
    step('p-report', '7. Ask why', 'The City health panel explains what makes people unhappy, and the overlays show where.'),
    h('h4', null, 'Controls'),
    h('ul', null,
      h('li', null, 'Mouse: drag to pan with the Inspect tool, right-drag to pan with any tool, wheel to zoom. Click to build.'),
      h('li', null, 'Touch: one finger builds (then tap Build to confirm), two fingers pan and pinch to zoom. With Inspect, one finger pans.'),
      h('li', null, 'Keys: Space pause, 1–3 speed, WASD/arrows pan, +/− zoom, R road, B bulldoze, Q inspect, Esc cancel.'),
    ),
  );
  modal(app, 'How to play', body, { icon: 'u-info', wide: true });
}

export function creditsDialog(app: App): void {
  const body = h('div', { class: 'mc-credits' },
    h('section', null, h('h4', null, 'Game'), h('p', null, 'Micro City, a small city builder for this site. Map and buildings are drawn procedurally in the browser.')),
    h('section', null, h('h4', null, 'Icons'),
      h('p', null, 'From ', h('a', { href: 'https://game-icons.net', target: '_blank', rel: 'noopener' }, 'game-icons.net'), ', licensed ', h('a', { href: 'https://creativecommons.org/licenses/by/3.0/', target: '_blank', rel: 'noopener' }, 'CC BY 3.0'), '. By:'),
      ...icons.credits().map((cr) => h('details', { class: 'mc-credit' },
        h('summary', null, cr.url ? h('a', { href: cr.url, target: '_blank', rel: 'noopener' }, cr.author) : cr.author, ` — ${cr.icons.length} icon${cr.icons.length > 1 ? 's' : ''}`),
        h('p', null, ...cr.icons.flatMap((ic, k) => [k ? ', ' : '', h('a', { href: ic.href, target: '_blank', rel: 'noopener' }, ic.name)])),
      )),
    ),
    h('section', null, h('h4', null, 'Typefaces'), h('p', null, 'Inter and JetBrains Mono, SIL Open Font License.')),
  );
  modal(app, 'Credits', body, { icon: 'p-news' });
}

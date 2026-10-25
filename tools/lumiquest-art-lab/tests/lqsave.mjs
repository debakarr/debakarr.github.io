// Save migration: a version-1 save (quests, Lumens, bonded wild creature, old preset) loads into the catching game.
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const v1 = {
  version: 1, createdAt: 1760000000000, savedAt: 1760000500000, playSeconds: 1234,
  appearance: { name: 'Aero', preset: 'aero', skin: '#f6cfae', face: 'bold', eye: '#6a3d1e', hair: 'spiky', hairColor: '#5a3a24', outfit: 'ranger', outfitMain: '#2f6fb8', outfitAccent: '#d8423a', accessories: ['scarf'] },
  starter: 'flamkit',
  player: { x: 10, y: 4, z: 50, yaw: 0, camera: 'third', pitch: -0.18 },
  clock: 40.5, weather: { kind: 'clear', until: 44 },
  lumens: 130, inventory: { device: 1, sunberry: 3, kelp: 2 },
  bonded: [
    { uid: 'starter', species: 'flamkit', variant: null, name: 'Sparky', origin: 'starter', bondedDay: 1, friendship: 60 },
    { uid: 'b123', species: 'terrabun', variant: 'elder', name: 'Mossy', origin: 'w-terra-1', bondedDay: 2, friendship: 55 },
  ],
  active: 'b123', companionOut: true,
  wild: { 'w-terra-1': { trust: 80, observed: true, bonded: true, variant: 'elder', fedAt: 30 }, 'w-aqua-1': { trust: 10, observed: true, bonded: false, variant: null, fedAt: -999 } },
  species: { flamkit: { seen: true, observed: 1, bonded: 1 }, terrabun: { seen: true, observed: 2, bonded: 1 }, aquoray: { seen: true, observed: 1, bonded: 0 } },
  quests: { beacon: { status: 'active', stage: 2 }, stars: { status: 'active', stage: 0 } }, tracked: 'beacon',
  done: { 'chest-mill': 20 }, prisms: [0, 6, 1], discovered: ['outpost', 'meadow'], flags: { beaconLit: 0 },
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
await ctx.addInitScript((save) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('lumiquest.save.v1', save); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(v1));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 240)); });
await page.goto('http://127.0.0.1:4330/lumiquest/?debug');
await page.waitForTimeout(9000);
const click = (l) => page.evaluate((l) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(l)); if (b) { b.click(); return true; } return false; }, l);
console.log('continue button', await click('Continue'));
await page.waitForFunction(() => window.lq?.phase === 'play', null, { timeout: 120000 }).catch(() => console.log('NOT IN PLAY'));
await page.waitForFunction(() => window.lq.player.model.model, null, { timeout: 300000, polling: 1000 }).catch(() => console.log('VRM NOT LOADED'));
const r = await page.evaluate(() => {
  const g = window.lq;
  const s = g.state;
  return {
    version: s.version, orbs: s.orbs, preset: s.appearance.preset, name: s.appearance.name,
    bonded: s.bonded.map((b) => `${b.uid}:${b.species}:${b.variant}:${b.name}`), active: s.active,
    companion: g.creatures.companion ? `${g.creatures.companion.species}:${g.creatures.companion.variant}` : null,
    wildTerra: s.wild['w-terra-1'], terraBack: g.creatures.wild.some((c) => c.id === 'w-terra-1'),
    keys: Object.keys(s).sort().join(','),
    vrm: !!g.player.model.model,
  };
});
console.log(JSON.stringify(r, null, 1));
await page.evaluate(() => window.lq.saveNow(true));
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lumiquest.save.v1')));
console.log('saved version', saved.version, 'has quests?', 'quests' in saved, 'orbs', saved.orbs);
console.log(errs.slice(0, 10).join('\n') || 'no errors');
await browser.close();

// Catching test: one forced success, one forced escape, then respawn after a day.
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 450 } })).newPage();
const waitGame = async (sec) => { const t0 = await page.evaluate(() => window.lq.time); await page.waitForFunction((t) => window.lq.time > t, t0 + sec, { timeout: 600000, polling: 250 }); };
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 240)); });
(await import('node:fs')).mkdirSync(new URL('../shots/', import.meta.url), { recursive: true });
const shot = (n) => page.screenshot({ path: new URL(`../shots/catch-${n}.png`, import.meta.url).pathname, timeout: 240000 });
await page.goto('http://127.0.0.1:4330/lumiquest/?debug');
await page.waitForTimeout(9000);
const click = (l) => page.evaluate((l) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(l)); if (b) { b.click(); return true; } return false; }, l);
await click('New Game'); await page.waitForTimeout(4000);
await page.evaluate(() => [...document.querySelectorAll('.lq-cs-card')].find((c) => c.dataset.id === 'vita')?.click());
await page.waitForTimeout(2000);
await click('Continue'); await page.waitForTimeout(4000);
await click('Confirm'); await page.waitForTimeout(4000);
await page.keyboard.press('Escape'); await page.waitForTimeout(2000);
await page.waitForFunction(() => window.lq?.phase === 'play' && window.lq.player.model.model, null, { timeout: 300000, polling: 1000 });
// a meadow spot, clear day
await page.evaluate(() => {
  const g = window.lq;
  g.applySettings({ ...g.settings, quality: 'low', dayMinutes: 0 });
  g.state.clock = 10; g.state.weather = { kind: 'clear', until: 9999 };
  g.player.place(-30, g.world.terrain.height(-30, 40) + 0.5, 40, 0);
  g.rig.yaw = Math.PI; g.rig.pitch = -0.32; g.rig.distance = 3.4;
  g.ui.hudEl.querySelectorAll('.lq-controls-hint').forEach((e) => e.remove());
});
await page.waitForTimeout(3000);
// put a wild creature where the crosshair points, 8 m out, asleep
const place = async (species) => page.evaluate((species) => {
  const g = window.lq;
  const c = g.creatures.wild.find((x) => x.species === species && !x.held);
  if (!c) return null;
  const cam = g.rig.camera;
  const dir = cam.getWorldDirection(cam.position.clone());
  // walk along the aim ray to where it passes just above the ground, 5-16 m out
  let best = null;
  for (let t = 5; t < 16; t += 0.1) {
    const q = cam.position.clone().addScaledVector(dir, t);
    const gap = Math.abs(q.y - (g.world.terrain.height(q.x, q.z) + 0.3));
    if (!best || gap < best.gap) best = { q, gap };
  }
  const p = best.q;
  c.pos.set(p.x, g.world.terrain.height(p.x, p.z), p.z);
  c.home[0] = p.x; c.home[1] = p.z;
  c.yaw = Math.atan2(dir.x, dir.z); // facing away from the player
  c.fear = 0; c.alert = 0;
  c.state = 'sleep';
  return { id: c.id, species: c.species, variant: c.variant };
}, species);
const before = await page.evaluate(() => ({ orbs: window.lq.state.orbs, caught: window.lq.state.bonded.length }));
const a = await place('terrabun');
console.log('placed', JSON.stringify(a));
await waitGame(0.6);
const dbg = await page.evaluate((id) => {
  const g = window.lq;
  const c = g.creatures.wild.find((x) => x.id === id);
  const cam = g.rig.camera;
  const look = cam.getWorldDirection(cam.position.clone());
  const to = c.pos.clone().sub(cam.position);
  if (c.model) to.y += c.model.height * 0.45 * c.model.root.scale.x;
  const ang = Math.acos(Math.min(1, to.dot(look) / to.length()));
  return { paused: g.paused, modal: g.modal, phase: g.phase, top: g.ui.topName, visible: c.visible, model: !!c.model, held: c.held, state: c.state, dist: to.length().toFixed(2), ang: ang.toFixed(3), allow: Math.max(0.06, Math.atan2(0.85, to.length())).toFixed(3), cpos: c.pos.toArray().map((v) => v.toFixed(1)), ppos: g.player.pos.toArray().map((v) => v.toFixed(1)) };
}, a.id);
console.log('dbg', JSON.stringify(dbg));
const t1 = await page.evaluate(() => { const t = window.lq.target; return t?.kind === 'creature' ? { id: t.creature.id, chance: Math.round(t.chance.chance * 100), note: t.chance.note } : t?.kind ?? null; });
console.log('target', JSON.stringify(t1));
await shot('1-aim');
// force success: every wobble passes
await page.evaluate(() => { window.__rnd = Math.random; Math.random = () => 0.001; window.lq.doThrow(); });
await waitGame(1.9);
await shot('2-wobble');
await waitGame(3.6);
await page.evaluate(() => { Math.random = window.__rnd; });
await shot('3-caught');
const after = await page.evaluate((id) => ({ orbs: window.lq.state.orbs, caught: window.lq.state.bonded.length, inWild: window.lq.creatures.wild.some((c) => c.id === id), mem: window.lq.state.wild[id], modal: window.lq.modal ?? window.lq.ui.topName }), a.id);
console.log('success:', JSON.stringify(before), '->', JSON.stringify(after));
// close the first-catch card
await page.evaluate(() => window.lq.ui.closeAll());
await page.waitForTimeout(500);
// second: force an escape
const b = await place('terrabun');
console.log('placed', JSON.stringify(b));
await waitGame(0.6);
await page.evaluate(() => { window.__rnd = Math.random; Math.random = () => 0.9999; window.lq.doThrow(); });
await waitGame(5);
await page.evaluate(() => { Math.random = window.__rnd; });
const esc = await page.evaluate((id) => { const c = window.lq.creatures.wild.find((x) => x.id === id); return c ? { held: c.held, state: c.state, fear: Math.round(c.fear), visible: c.model?.root.visible } : null; }, b.id);
console.log('escape:', JSON.stringify(esc));
await shot('4-escaped');
// a day later the first one is back
const back = await page.evaluate((id) => { const g = window.lq; g.state.clock += 25; const n = g.creatures.refresh(); return { n, back: g.creatures.wild.some((c) => c.id === id), mem: g.state.wild[id] }; }, a.id);
console.log('respawn:', JSON.stringify(back));
console.log(errs.slice(0, 12).join('\n'));
await browser.close();

// node shots.mjs <name> '[{"url":"/models/x.glb","out":"a", ...opts}, ...]'
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const [, , specJson, query = ''] = process.argv;
fs.mkdirSync(new URL('./shots/', import.meta.url), { recursive: true });
const specs = JSON.parse(specJson);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 300)));
await page.goto('http://127.0.0.1:4401/viewer.html' + query);
await page.waitForFunction(() => window.__viewReady, null, { timeout: 120000 });
for (const s of specs) {
  const r = await page.evaluate(async (s) => { try { return await window.__shot(s.url, s); } catch (e) { return { err: String(e.stack) }; } }, s);
  if (r.err) { console.log(s.out, 'ERR', r.err.slice(0, 600)); continue; }
  fs.writeFileSync(new URL(`./shots/${s.out}.png`, import.meta.url), Buffer.from(r.png.split(',')[1], 'base64'));
  console.log(s.out, JSON.stringify(r.info));
}
await browser.close();

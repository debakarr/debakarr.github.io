// node run-refine.mjs <model> [jsonOpts]  -> chibi-tamer-modes/refined/<model>.glb
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const [, , model, optsJson = '{}'] = process.argv;
const OUT = new URL('../../chibi-tamer-modes/refined/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 300)));
await page.goto('http://127.0.0.1:4401/index.html');
await page.waitForFunction(() => window.__ready);
const b64 = await page.evaluate(async ([m, o]) => { try { return await window.__refine(`/models/${m}.glb`, o); } catch (e) { return 'ERR:' + e.stack; } }, [model, JSON.parse(optsJson)]);
console.log((await page.evaluate(() => window.__log ?? [])).join('\n'));
if (b64.startsWith('ERR:')) console.log(b64.slice(0, 1500));
else {
  fs.writeFileSync(`${OUT}/${model}.glb`, Buffer.from(b64, 'base64'));
  console.log('wrote', `${OUT}/${model}.glb`, fs.statSync(`${OUT}/${model}.glb`).size);
}
await browser.close();

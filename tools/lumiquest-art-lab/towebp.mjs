import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const [, , outDir, ...files] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const f of files) {
  const b64 = fs.readFileSync(f).toString('base64');
  const url = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/webp', 0.84);
  }, b64);
  const out = `${outDir}/${f.split('/').pop().replace('.png', '.webp')}`;
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  console.log(out, fs.statSync(out).size);
}
await browser.close();

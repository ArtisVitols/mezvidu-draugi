// Kopīgais: headless Chromium ar spēli (vajag lokālo serveri: python3 -m http.server 8765 projekta saknē)
import { chromium } from 'playwright-core';
export async function launch() {
  return chromium.launch({ executablePath: process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
}
export async function soloGame(browser, gfx = 'low') {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(1800000);
  page.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await page.goto(process.env.URL || 'http://localhost:8765/');
  await page.evaluate((g) => { localStorage.clear(); localStorage.setItem('mezvidi_gfx', g); }, gfx);
  await page.reload();
  await page.fill('#in-name', 'Eksports'); await page.click('#btn-name-ok'); await page.click('#btn-char-ok');
  await page.click('#btn-host');
  await page.waitForFunction(() => window.__game && __game.zone === 'c' && !__game.zoneBusy);
  return page;
}
export async function goZone(page, z) {
  await page.evaluate((z) => { const g = __game; if (g.zone !== z) g.teleport(z, { x: 0, z: 0 }, 0); }, z);
  await page.waitForFunction((z) => __game.zone === z && !__game.zoneBusy, z);
}

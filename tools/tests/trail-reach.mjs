// Mežvidu Draugi — takas tests (headless Chromium, playwright-core). Palaist: python3 -m http.server 8765 projekta saknē, tad node tools/tests/trail-reach.mjs (vajag playwright-core: npm i playwright-core blakus vai NODE_PATH; Chromium ceļš — env CHROME)
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage(); page.setDefaultTimeout(1800000);
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto(process.env.URL || 'http://localhost:8765/');
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mezvidi_gfx', 'lowest'); });
await page.fill('#in-name', 'Tests'); await page.click('#btn-name-ok'); await page.click('#btn-char-ok');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game && __game.me, null, { timeout: 900000 });
await page.evaluate(() => __game.teleport('s', { x: 2, z: -300 }, Math.PI));
await page.waitForFunction(() => __game.zone === 's' && !__game.zoneBusy);
const res = await page.evaluate(() => {
  const g = __game, Z = g.terr, L = Z.lay;
  Z.bridgeDone = true; Z.obClear = L.obst.map(() => true);
  // staigā ar sadursmēm: uz mērķi, ja iesprūst — mēģina apiet (±30..±120°)
  const walk = (a, b, reach = 1.6) => {
    let p = { x: a.x, z: a.z }; Z.lp = null;
    for (let n = 0; n < 6000; n++) {
      const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz);
      if (d < reach) return true;
      const base = Math.atan2(dx, dz);
      let moved = false;
      for (const off of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]) {
        const an = base + off, np = { x: p.x + Math.sin(an) * 0.2, z: p.z + Math.cos(an) * 0.2 };
        const save = Z.lp; Z.collide(np, 0.5);
        if (Math.hypot(np.x - p.x, np.z - p.z) > 0.08 && Math.hypot(b.x - np.x, b.z - np.z) < d + 0.15) { p = np; moved = true; break; }
        Z.lp = save;
      }
      if (!moved) return false;
    }
    return false;
  };
  const out = [];
  L.stops.forEach((s, k) => {
    const st = { x: s.x + Math.sin(s.face) * 1.6, z: s.z + Math.cos(s.face) * 1.6 };
    const bad = [];
    for (const it of s.items) {
      if (!walk(st, it, 1.5)) bad.push('i' + it.i);
      if (s.drop && !walk(it, s.drop, s.drop.r + 1)) bad.push('i' + it.i + '→drop');
    }
    if (s.pond) {
      let ok = 0;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, sh = { x: s.pond.x + Math.sin(a) * (s.pond.r + 1.2), z: s.pond.z + Math.cos(a) * (s.pond.r + 1.2) };
        if (walk(st, sh, 1.2) && walk(sh, s.drop, s.drop.r + 1)) ok++; else bad.push('krasts' + i);
      }
    }
    if (s.drop && !walk(st, s.drop, s.drop.r + 1)) bad.push('npc→drop');
    // 1.46.0: roņa laiva jūrā — aizpeldēt no roņa; ronis sasniedzams no lapsas
    if (s.boat && !walk(st, s.boat, 2.5)) bad.push('npc→laiva');
    if (s.boat) { const f = L.stops[k - 1]; if (!walk({ x: f.x + Math.sin(f.face) * 1.6, z: f.z + Math.cos(f.face) * 1.6 }, st, 1.5)) bad.push('lapsa→ronis'); }
    out.push(`${k}: priekšmeti ${s.items.length}, nesasniedzami: ${bad.length ? bad.join(',') : 'nav'}`);
  });
  return out;
});
console.log(res.join('\n'));
await browser.close();

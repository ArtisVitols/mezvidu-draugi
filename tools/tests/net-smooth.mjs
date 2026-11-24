// Mežvidu Draugi — tests (headless Chromium, playwright-core). Palaist: python3 -m http.server 8765 projekta saknē, tad node tools/tests/net-smooth.mjs
// 1.49.0: drauga kustība ir vienmērīga arī tad, ja ziņas pienāk nevienmērīgi (tīkla svārstības, lēns telefons ar zemu fps):
// spēles cikls apturēts, laiks un ziņas simulētas, pārbauda, vai draugs nekad neiet atpakaļ un ātrums nelēkā
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const errs = [];
async function mk(name) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(600000);
  page.on('pageerror', e => { errs.push(name + ' PAGEERR: ' + e.message); console.log(name + ' PAGEERR: ' + e.message); });
  page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource|Lost connection to server/.test(m.text())) { errs.push(name + ' con: ' + m.text()); console.log(name + ' con: ' + m.text().slice(0, 200)); } });
  await page.goto(process.env.URL || 'http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mezvidi_gfx', 'lowest'); });
  await page.reload();
  await page.fill('#in-name', name); await page.click('#btn-name-ok'); await page.click('#btn-char-ok');
  return page;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const host = await mk('Mamma');
await host.click('#btn-host');
await host.waitForFunction(() => window.__game && __game.zone === 'c' && !__game.zoneBusy);
const code = await host.evaluate(() => __game.roomCode);
const cl = await mk('Anna');
await cl.fill('#in-code', code); await cl.click('#btn-join');
await cl.waitForFunction(() => window.__game && __game.zone === 'c' && !__game.zoneBusy && __game.myId > 0);
await cl.waitForFunction(() => [...__game.remotes.values()].some((r) => r.seen), null, { timeout: 120000 });
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? '✅ ' : '❌ ') + msg); };
for (const p of [host, cl]) await p.evaluate(() => { __game.ended = true; });
await sleep(1500);
// simulācija klienta lapā: draugs (saimnieks) iet/brauc pa x ar ātrumu v; ziņas ik `iv` ms ar nejaušu aizturi
const sim = (o) => cl.evaluate((o) => {
  const g = __game, r = [...g.remotes.values()].find((x) => x.seen);
  let cap = null; const th = g.net.toHost; g.net.toHost = (m) => { cap = m; }; g.timers.send = 0; g.sendPos(1); g.net.toHost = th;
  const zi = cap.p[7];
  let seed = o.seed; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const realNow = g.now.bind(g); let fake = realNow(); g.now = () => fake;
  const st0 = fake - 5000, x0 = r.pos.x, z0 = r.pos.z, y0 = r.pos.y;
  r.buf = []; r.off = null; r.gap = null; r.jit = null; r.rt = null; r.seen = true;
  const msgs = []; let at = fake;
  for (let k = 0; k * o.iv < o.ms + 2000; k++) {
    const st = st0 + 5000 + k * o.iv;
    let lat = 30 + rnd() * o.jit;
    if (rnd() < o.burst) lat += 250 + rnd() * 150; // laiku pa laikam ziņa aizkavējas (WiFi, pārsūtīšana)
    at = Math.max(at, st + lat); // secīgs kanāls: aizkavēta ziņa aiztur arī nākamās (tās pienāk kopā)
    msgs.push({ at, st, x: x0 + (k * o.iv / 1000) * o.v });
  }
  const xs = []; let mi = 0, t = 0;
  while (t < o.ms) {
    const dt = o.dt * (0.7 + rnd() * 0.6); // nevienmērīgi kadri
    t += dt * 1000; fake += dt * 1000;
    while (mi < msgs.length && msgs[mi].at <= fake) { const m = msgs[mi++]; g.onMessage({ t: 's', l: [[r.id, m.x, y0, z0, Math.PI / 2, 0, 0, 0, zi, -1, 0, '', Math.round(m.st)]] }); }
    g.updateRemotes(dt);
    xs.push([dt, r.pos.x]);
  }
  g.now = realNow;
  // vērtē pēc iesildīšanās (2 s)
  let back = 0, n = 0, bad = 0; const vs = [];
  for (let i = 1; i < xs.length; i++) {
    const [dt, x] = xs[i], v = (x - xs[i - 1][1]) / dt;
    if (i * o.dt < 2) continue;
    n++; vs.push(v);
    if (x < xs[i - 1][1] - 1e-4) back++;
    if (Math.abs(v - o.v) > o.v * 0.35) bad++;
  }
  return { n, back, bad, vmin: Math.min(...vs).toFixed(2), vmax: Math.max(...vs).toFixed(2) };
}, o);
for (const [name, o] of Object.entries({
  'ejot 10 Hz, ātrs telefons': { v: 5, iv: 100, jit: 60, burst: 0.03, dt: 1 / 60, ms: 12000, seed: 7 },
  'ejot 10 Hz, lēns telefons (15 fps)': { v: 5, iv: 100, jit: 90, burst: 0.05, dt: 1 / 15, ms: 12000, seed: 11 },
  'braucot 20 Hz, lēns telefons (20 fps)': { v: 14, iv: 50, jit: 80, burst: 0.04, dt: 1 / 20, ms: 12000, seed: 5 },
  'braucot, lēns sūtītājs (12 Hz) un lēns telefons': { v: 14, iv: 83, jit: 120, burst: 0.06, dt: 1 / 18, ms: 12000, seed: 3 },
})) {
  const r = await sim(o);
  check(r.back === 0 && r.bad <= r.n * 0.05, `${name}: atpakaļ ${r.back}, ātrums ārpus ±35 % ${r.bad}/${r.n} kadros (ātrums ${r.vmin}…${r.vmax}, vajag ${o.v})`);
}
console.log('KĻŪDAS:', errs.length ? errs.join('\n') : 'nav');
console.log(fails ? `NEIZDEVĀS: ${fails}` : 'VISS IZDEVĀS');
await browser.close();

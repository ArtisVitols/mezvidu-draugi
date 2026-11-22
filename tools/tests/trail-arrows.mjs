// Mežvidu Draugi — 1.47.0 bultu tests (headless Chromium, playwright-core). Palaist: python3 -m http.server 8765 projekta saknē, tad node tools/tests/trail-arrows.mjs
// Pārbauda: katrai izpildītai pieturai viena zaļa bulta virs takas, ~blakus pieturai, rāda takas virzienu uz nākamo uzdevumu;
// redzamība abiem spēlētājiem katram solim 0..7; pēc zemes pārlādes; ekrānuzņēmumi (SHOTS=1)
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const errs = [];
async function mk(name, gfx) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(1800000);
  page.on('pageerror', e => { errs.push(name + ' PAGEERR: ' + e.message); console.log(name + ' PAGEERR: ' + e.message); });
  page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource|Lost connection to server/.test(m.text())) { errs.push(name + ' con: ' + m.text()); console.log(name + ' con: ' + m.text().slice(0, 200)); } });
  await page.goto(process.env.URL || 'http://localhost:8765/');
  await page.evaluate((gfx) => { localStorage.clear(); localStorage.setItem('mezvidi_gfx', gfx); }, gfx);
  await page.reload();
  await page.fill('#in-name', name); await page.click('#btn-name-ok'); await page.click('#btn-char-ok');
  return page;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; log('❌ ' + msg); } else log('✅ ' + msg); };
const host = await mk('Mamma', process.env.SHOTS ? 'mid' : 'lowest');
await host.click('#btn-host');
await host.waitForFunction(() => window.__game && __game.zone === 'c' && !__game.zoneBusy);
const code = await host.evaluate(() => __game.roomCode);
const cl = await mk('Anna', 'lowest');
await cl.fill('#in-code', code); await cl.click('#btn-join');
await cl.waitForFunction(() => window.__game && __game.zone === 'c' && !__game.zoneBusy);
const P = [host, cl];
for (const p of P) await p.evaluate(() => __game.teleport('s', { x: 2, z: -300 }, Math.PI));
for (const p of P) await p.waitForFunction(() => __game.zone === 's' && !__game.zoneBusy);

// --- novietojums (tīrā funkcija + īstie objekti) ---
const G = await host.evaluate(async () => {
  const T = await import('./js/trail.js?v=' + (await import('./js/version.js')).VERSION);
  const g = __game, Z = g.terr, lay = T.trailLayout(), line = lay.line, sp = T.arrowSpots();
  return sp.map((a) => {
    const m = Z.arrows[a.k], s = lay.stops[a.k], nx = lay.stops[a.k + 1];
    const near = lay.idx.near(a.x, a.z);
    // takas pieskare bultas vietā (uz augošiem indeksiem = uz nākamo pieturu)
    let tang = null;
    if (a.i >= 0) { const p = line[a.i], q = line[a.i + 3]; const l = Math.hypot(q.x - p.x, q.z - p.z); tang = (a.dx * (q.x - p.x) + a.dz * (q.z - p.z)) / l; }
    const tn = Math.hypot(nx.x - a.x, nx.z - a.z), toNext = (a.dx * (nx.x - a.x) + a.dz * (nx.z - a.z)) / tn;
    const rx = m.rotation.x, rot = Math.atan2(a.dx, a.dz), dRot = Math.atan2(Math.sin(m.rotation.y - rot), Math.cos(m.rotation.y - rot));
    const gy = Math.max(Z.groundAt(a.x, a.z), -0.75);
    // bultas zemākais punkts (aste/smaile pēc slīpuma un šūpošanās lejā) virs zemes
    let clr = 99;
    for (let d = -1.95; d <= 1.95; d += 0.39) { const yy = m.userData.y - 0.12 + d * Math.tan(0.35); clr = Math.min(clr, yy - Math.max(Z.groundAt(a.x + a.dx * d, a.z + a.dz * d), -0.75)); }
    return {
      k: a.k, i: a.i, i0: lay.stopI[a.k], i1: lay.stopI[a.k + 1], dTrail: near.d, tang, toNext,
      dStop: Math.hypot(a.x - s.x, a.z - s.z), hy: m.userData.y - gy, clr, rx, dRot, inTun: !!Z.inTunnel(a.x, a.z),
      mat: { op: m.material.opacity, tr: m.material.transparent, col: m.material.color.getHexString() }, parent: !!m.parent, n: Z.arrows.length, tasks: T.TASKS.length,
    };
  });
});
log('bultas:', JSON.stringify(G.map((a) => ({ k: a.k, i: a.i, i0: a.i0, i1: a.i1, dT: +a.dTrail.toFixed(2), tang: a.tang && +a.tang.toFixed(2), toNext: +a.toNext.toFixed(2), dStop: +a.dStop.toFixed(1), hy: +a.hy.toFixed(2) }))));
check(G.length === G[0].tasks - 1 && G[0].n === G.length, `pa vienai bultai katrai pieturai, izņemot pēdējo (${G.length})`);
for (const a of G) {
  const tag = `[${a.k}]`;
  if (a.i >= 0) {
    check(a.dTrail < 0.5, `${tag} bulta virs takas (${a.dTrail.toFixed(2)} m no viduslīnijas)`);
    check(a.i > a.i0 && a.i < a.i1, `${tag} bulta takā starp šo un nākamo pieturu (${a.i0} < ${a.i} < ${a.i1})`);
    check(a.tang > 0.9, `${tag} bulta rāda takas virzienu uz priekšu (${a.tang.toFixed(2)})`);
  } else check(a.toNext > 0.99, `${tag} pludmalē bulta rāda taisni uz nākamo (${a.toNext.toFixed(2)})`);
  check(a.dStop < (a.k === 4 ? 36 : 28), `${tag} bulta pie pieturas (${a.dStop.toFixed(1)} m${a.k === 4 ? ', aiz tilta' : ''})`);
  check(a.hy > 0.8 && a.hy < 1.6, `${tag} augstums virs zemes ${a.hy.toFixed(2)} m`);
  check(a.clr > 0.15, `${tag} visa bulta virs zemes (zemākais punkts +${a.clr.toFixed(2)} m)`);
  check(Math.abs(a.dRot) < 0.01 && Math.abs(a.rx + 0.35) < 0.01 && a.parent && !a.inTun, `${tag} pagriezta pareizi, ainā, ne tunelī`);
  check(a.mat.tr && a.mat.op > 0.3 && a.mat.op < 0.75 && a.mat.col.startsWith('3'), `${tag} puscaurspīdīga zaļa (#${a.mat.col}, ${a.mat.op.toFixed(2)})`);
}

// --- redzamība katram solim abiem ---
const vis = () => Promise.all(P.map((p) => p.evaluate(() => __game.terr.arrows.map((m) => m.visible))));
for (let step = 0; step <= G[0].tasks; step++) {
  await host.evaluate((step) => { const tr = __game.hs.trail; tr.step = step; tr.acc = false; tr.c = 0; tr.taken = {}; __game.hostTrailSend(null); }, step);
  await cl.waitForFunction((step) => __game.trail.step === step, step, { timeout: 120000 }).catch(() => {});
  const v = await vis(), want = v[0].map((_, k) => k < step);
  check(v.every((a) => JSON.stringify(a) === JSON.stringify(want)), `solis ${step}: ${v[0].map((x) => (x ? '➡️' : '·')).join('')} (abiem)`);
}
// pieņemts uzdevums neko nemaina
await host.evaluate(() => { const tr = __game.hs.trail; tr.step = 3; tr.acc = true; __game.hostTrailSend(null); });
await cl.waitForFunction(() => __game.trail.step === 3 && __game.trail.acc, null, { timeout: 120000 }).catch(() => {});
let v = await vis();
check(v.every((a) => a.filter(Boolean).length === 3 && a[0] && a[2] && !a[3]), 'pieņemtā uzdevumā tikai iepriekšējās bultas');
// pēc zemes pārlādes (iziet un atgriežas) bultas atkal pareizas
await cl.evaluate(() => __game.teleport('c', { x: 0, z: 30 }, 0));
await cl.waitForFunction(() => __game.zone === 'c' && !__game.zoneBusy);
await cl.evaluate(() => __game.teleport('s', { x: 2, z: -300 }, Math.PI));
await cl.waitForFunction(() => __game.zone === 's' && !__game.zoneBusy);
await sleep(1000);
v = await vis();
check(JSON.stringify(v[1]) === JSON.stringify(v[0]) && v[1].filter(Boolean).length === 3, `pēc pārlādes klientam tās pašas bultas (${v[1].map((x) => (x ? '➡️' : '·')).join('')})`);
// šūpošanās — y mainās, bet paliek ap bāzes augstumu
const bob = await host.evaluate(() => { const g = __game, m = g.terr.arrows[0]; const a = m.position.y; g.terr.update(0.016, g); const t0 = performance.now(); while (performance.now() - t0 < 300); g.terr.update(0.016, g); return { a, b: m.position.y, y: m.userData.y }; });
check(Math.abs(bob.b - bob.y) <= 0.121 && bob.a !== bob.b, `bulta šūpojas (${(bob.b - bob.y).toFixed(3)})`);

// --- ekrānuzņēmumi ---
if (process.env.SHOTS) {
  await host.setViewportSize({ width: 960, height: 540 });
  await host.evaluate(() => { const tr = __game.hs.trail; tr.step = 7; tr.acc = false; tr.bridge = true; __game.hostTrailSend(null); });
  for (const a of G) {
    await host.evaluate((k) => {
      const g = __game, m = g.terr.arrows[k], s = g.terr.lay.stops[k], ry = m.rotation.y;
      const x = m.position.x - Math.sin(ry) * 9, z = m.position.z - Math.cos(ry) * 9;
      g.me.pos.set(x, g.terr.groundAt(x, z), z); g.me.heading = ry; g.cam.yaw = ry + Math.PI; g.cam.pitch = 0.3; g.cam.dist = 8;
      document.querySelectorAll('.toast').forEach((t) => t.remove());
    }, a.k);
    await sleep(8000);
    await host.screenshot({ path: (process.env.OUT || '.') + `/arrow${a.k}.png` });
  }
}
log('KĻŪDAS:', errs.length ? errs.join('\n') : 'nav');
log(fails ? `NEIZDEVĀS: ${fails}` : 'VISS IZDEVĀS');
await browser.close();

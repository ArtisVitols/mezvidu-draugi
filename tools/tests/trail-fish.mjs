// Mežvidu Draugi — takas tests (headless Chromium, playwright-core). Palaist: python3 -m http.server 8765 projekta saknē, tad node tools/tests/trail-fish.mjs (vajag playwright-core: npm i playwright-core blakus vai NODE_PATH; Chromium ceļš — env CHROME)
// Kaķa uzdevuma robežgadījumi + vecu saglabājumu pārvēršana
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const errs = [];
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage(); page.setDefaultTimeout(1800000);
page.on('pageerror', e => { errs.push(e.message); console.log('PAGEERR', e.message, (e.stack || '').split('\n').slice(1, 3).join(' | ')); });
page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) { errs.push(m.text()); console.log('con', m.text().slice(0, 200)); } });
await page.goto(process.env.URL || 'http://localhost:8765/');
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mezvidi_gfx', 'lowest'); });
await page.fill('#in-name', 'Tests'); await page.click('#btn-name-ok'); await page.click('#btn-char-ok');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game && __game.me, null, { timeout: 900000 });
await page.evaluate(() => __game.teleport('s', { x: 2, z: -300 }, Math.PI));
await page.waitForFunction(() => __game.zone === 's' && !__game.zoneBusy);
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? '✅ ' : '❌ ') + msg); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// vecie saglabājumi
const mig = await page.evaluate(() => {
  const g = __game, r = {};
  for (const [n, s] of [['old0', { step: 0 }], ['old2acc', { step: 2, c: 3, acc: true }], ['old3', { step: 3, c: 2, acc: true, bridge: false }], ['old4', { step: 4 }], ['old5done', { step: 5, bridge: true }], ['new3', { step: 3, v: 2, ob: [] }], ['new6', { step: 6, v: 2, ob: [] }]]) {
    g.save.trail = s; g.hostInitTrail(); r[n] = g.hs.trail.step + (g.hs.trail.acc ? 'a' : '') + ':' + g.hs.trail.c;
  }
  return r;
});
console.log(JSON.stringify(mig));
check(mig.old0 === '0:0' && mig.old2acc === '2a:3' && mig.old3 === '4a:2' && mig.old4 === '5:0' && mig.old5done === '6:0' && mig.new3 === '3:0' && mig.new6 === '6:0', 'vecu saglabājumu pārvēršana (kaķis ievietots)');
// saglabātais pēc nosūtīšanas satur v: 3 (1.46.0 — ronis)
const sv = await page.evaluate(() => { const g = __game; g.save.trail = { step: 3, v: 2, ob: [] }; g.hostInitTrail(); g.hostTrailSend(null); return g.save.trail.v; });
check(sv === 3, 'saglabājumā v: 3');
await sleep(800);
const H = () => page.evaluate(() => { const g = __game; return { step: g.trail.step, acc: g.trail.acc, c: g.trail.c, carry: g.me.carry && g.me.carry.k, fish: g.fishing && g.fishing.phase }; });
await page.evaluate(() => {
  window.TT = {
    go(x, z, face) { const g = __game, Z = g.terr; g.me.pos.set(x, Z.groundAt(x, z), z); g.me.vy = 0; g.me.onGround = true; if (face != null) g.me.heading = face; Z.lp = null; },
    act(want) { const g = __game; g.timers.action = 0; g.currentAction = null; const a = g.findAction(); if (!a) return 'NONE'; if (want && !a.label.includes(want)) return 'WRONG:' + a.label; a.fn(); return a.label; },
    shore(da = 0, extra = 1.2) { const g = __game, s = g.terr.lay.stops[3], pd = s.pond; const a = Math.atan2(s.x - pd.x, s.z - pd.z) + da; TT.go(pd.x + Math.sin(a) * (pd.r + extra), pd.z + Math.cos(a) * (pd.r + extra), a + Math.PI); },
  };
});
// pirms pieņemšanas — dīķī makšķerēt nevar (nav makšķeres)
const pre = await page.evaluate(() => { TT.shore(); return TT.act(); });
check(!pre.includes('Makšķerēt'), `pirms uzdevuma makšķerēt nevar (${pre})`);
await page.evaluate(() => __game.trailSend({ t: 'tAcc', step: 3 }));
await sleep(1200);
check((await H()).acc, 'kaķa uzdevums pieņemts');
// dažādās krasta vietās var makšķerēt
const spots = await page.evaluate(() => { const out = []; for (let i = 0; i < 12; i++) { TT.shore(i / 12 * Math.PI * 2, 1.0); const l = TT.act(); out.push(l.includes('Makšķerēt') ? 'Y' : 'n'); if (__game.fishing) __game.stopFishing(); } return out.join(''); });
console.log('krasta vietas (12 ap dīķi):', spots);
check((spots.match(/Y/g) || []).length >= 8, 'makšķerēt var lielākajā daļā krasta');
// tālu no ūdens — nevar
const far = await page.evaluate(() => { TT.shore(0, 9); return TT.act(); });
check(!far.includes('Makšķerēt'), `tālu no ūdens makšķerēt nevar (${far})`);
await page.evaluate(() => { const b = document.getElementById('panel-close'); if (!document.getElementById('panel').classList.contains('hidden')) b.click(); }); // „act” varēja atvērt sarunu
// kustoties makšķerēšana beidzas
await page.evaluate(() => { TT.shore(); TT.act('Makšķerēt'); });
check((await H()).fish === 'wait', 'makšķerē (gaida)');
await page.mouse.click(320, 100); // fokuss lapai
await page.keyboard.down('KeyW'); await sleep(6000); await page.keyboard.up('KeyW'); // headless < 1 kadrs/s — jātur ilgāk
check(!(await H()).fish, 'paejot makšķerēšana beidzas');
// kodiens palaists garām — zivs norauj ēsmu, var turpināt
await page.evaluate(() => { TT.shore(); TT.act('Makšķerēt'); __game.fishing.bite = 0.05; });
await page.waitForFunction(() => __game.fishing && __game.fishing.phase === 'bite', null, { timeout: 60000 });
await page.waitForFunction(() => __game.fishing && __game.fishing.phase === 'wait', null, { timeout: 120000 });
check((await H()).fish === 'wait' && !(await H()).carry, 'nokavēts kodiens — zivs nav, gaida nākamo');
// noķer
await page.evaluate(() => { __game.fishing.bite = 0.05; });
await page.waitForFunction(() => __game.fishing && __game.fishing.phase === 'bite', null, { timeout: 60000 });
const pull = await page.evaluate(() => TT.act('VILKT'));
let h = await H();
check(h.carry === 't:zivs' && !h.fish, `VILKT → zivs rokās (${pull})`);
// ar zivi rokās nevar makšķerēt; tālu no groza — palaist atpakaļ
const lab = await page.evaluate(() => { TT.shore(); __game.timers.action = 0; __game.currentAction = null; return __game.findAction().label; });
check(lab.includes('Palaist'), `nesot zivi — tikai „palaist” (${lab})`);
// aiziet uz grozu un ielikt
await page.evaluate(() => { const d = __game.terr.lay.stops[3].drop; TT.go(d.x + 1, d.z, null); TT.act('Ielikt grozā'); });
await sleep(1200);
h = await H();
check(h.c === 1 && !h.carry, `zivs grozā: ${h.c}/10`);
check(await page.evaluate(() => __game.terr.fishes.count === 1), 'grozā redzama 1 zivs');
// otru zivi noķer un nes prom no zonas → uzdevums neizdodas, zivs izkrīt
await page.evaluate(() => { TT.shore(); TT.act('Makšķerēt'); __game.fishing.bite = 0.05; });
await page.waitForFunction(() => __game.fishing && __game.fishing.phase === 'bite', null, { timeout: 60000 });
await page.evaluate(() => TT.act('VILKT'));
check((await H()).carry === 't:zivs', 'otra zivs rokās');
await page.evaluate(() => { const s = __game.terr.lay.stops[2]; TT.go(s.x, s.z, null); });
await sleep(8000);
h = await H();
check(!h.acc && h.c === 0 && !h.carry, `visi aizgāja → neizdevās, zivs izkrita (acc ${h.acc}, c ${h.c}, carry ${h.carry})`);
check(await page.evaluate(() => __game.terr.fishes.count === 0), 'grozs atkal tukšs');
// sāk vēlreiz un makšķerējot citā zemē — makšķerēšana beidzas, nekas neuzkaras
await page.evaluate(() => { TT.shore(); __game.trailSend({ t: 'tAcc', step: 3 }); });
await sleep(1200);
await page.evaluate(() => { TT.shore(); TT.act('Makšķerēt'); });
await page.evaluate(() => __game.teleport('c', { x: 5, z: 5 }, 0));
await page.waitForFunction(() => __game.zone === 'c' && !__game.zoneBusy);
check(!(await H()).fish && !(await page.evaluate(() => __game.bobber && __game.bobber.parent)), 'citā zemē makšķerēšana beidzas, pludiņš noņemts');
// meža makšķerēšana joprojām strādā (ar savu makšķeri)
await page.evaluate(() => { __game.save.rod = true; __game.teleport('e', { x: 5, z: 5 }, 0); });
await page.waitForFunction(() => __game.zone === 'e' && !__game.zoneBusy);
const forest = await page.evaluate(() => {
  const g = __game, W = g.world;
  // atrod vietu pie ezera
  for (let x = -300; x < 300; x += 4) for (let z = -300; z < 300; z += 4) {
    if (W.getHeight(x, z) > 0.3 && W.getHeight(x, z) < 1.2 && W.getHeight(x + 3, z) < -0.6) {
      g.me.pos.set(x, W.groundAt(x, z, 5), z); g.me.heading = Math.PI / 2; g.me.onGround = true; g.me.state = 'idle';
      g.timers.action = 0; g.currentAction = null; const a = g.findAction();
      if (a && a.label.includes('Makšķerēt')) { a.fn(); return { ok: !!g.fishing && g.bobber.parent === g.scene, at: [x, z] }; }
    }
  }
  return { ok: false };
});
check(forest.ok, `meža ezerā makšķerēšana strādā kā agrāk (${JSON.stringify(forest.at)})`);
console.log('KĻŪDAS:', errs.length ? errs.join('\n') : 'nav');
console.log(fails ? `NEIZDEVĀS: ${fails}` : 'VISS IZDEVĀS');
await browser.close();

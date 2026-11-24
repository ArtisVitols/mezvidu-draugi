// Mežvidu Draugi — takas tests (headless Chromium, playwright-core). Palaist: python3 -m http.server 8765 projekta saknē, tad node tools/tests/net-robust.mjs (vajag playwright-core: npm i playwright-core blakus vai NODE_PATH; Chromium ceļš — env CHROME)
// 1.47.1: tīkla izturība — ja kāda spēles daļa met kļūdu vai drauga pulkstenis pārlec atpakaļ, spēlētāji joprojām redz viens otru kustamies
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const errs = [];
async function mk(name) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(1800000);
  page.on('pageerror', e => { errs.push(name + ' PAGEERR: ' + e.message); console.log(name + ' PAGEERR: ' + e.message, (e.stack || '').split('\n').slice(1, 3).join(' | ')); });
  page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) { errs.push(name + ' con: ' + m.text()); console.log(name + ' con: ' + m.text().slice(0, 200)); } });
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
await cl.waitForFunction(() => window.__game && __game.zone === 'c' && !__game.zoneBusy);
for (const p of [host, cl]) await p.evaluate(() => __game.teleport('s', { x: 2, z: -300 }, Math.PI));
for (const p of [host, cl]) await p.waitForFunction(() => __game.zone === 's' && !__game.zoneBusy);
// palīgfunkcijas lapā
const helpers = () => {
  window.TT = {
    go(x, z, face) { const g = __game, Z = g.terr; g.me.pos.set(x, Z.groundAt(x, z), z); g.me.vy = 0; g.me.onGround = true; if (face != null) g.me.heading = face; Z.lp = null; },
    see() { const g = __game, rs = [...g.remotes.values()], r = rs.find((x) => x.seen && x.buf && x.buf.length) || rs[0]; return r ? { x: r.pos.x, z: r.pos.z, vis: r.avatar.root.visible, vo: r.vehObj ? r.vehObj.root.visible && r.vehObj.root.parent === g.stage : null, code: r.vehCode } : null; },
    dump() { const g = __game; return [...g.remotes.values()].map((r) => ({ id: r.id, z: r.zone, vis: r.avatar.root.visible, par: r.avatar.root.parent ? (r.avatar.root.parent === g.stage ? 'stage' : r.avatar.root.parent.type) : null, code: r.vehCode, vid: r.vehId, vo: !!r.vehObj, mg: g.mgHidden ? g.mgHidden(r.id) : null, anim: r.anim, x: Math.round(r.pos.x), zz: Math.round(r.pos.z) })).concat([{ me: g.myId, zone: g.zone, veh: g.me.veh ? g.me.veh.id : null }]); },
    me() { const g = __game; return { x: g.me.pos.x, z: g.me.pos.z, veh: g.me.veh ? g.me.veh.id : null }; },
    walk(n, yaw) { const g = __game; g.cam.yaw = yaw; for (let i = 0; i < n; i++) g.updateWalk(1 / 30, { x: 0, y: 1, run: false }, false); return TT.me(); },
    ride(n) { const g = __game; for (let i = 0; i < n && g.me.veh; i++) g.updateVehicle(1 / 30, { x: 0.15, y: 1 }); return TT.me(); },
  };
};
for (const p of [host, cl]) await p.evaluate(helpers);
const log = (...a) => console.log(...a);
globalThis.__dumpPages = [['saimnieks', host], ['klients', cl]];
let fails = 0;
const check0 = (ok, msg) => { if (!ok) { fails++; log('❌ ' + msg); } else log('✅ ' + msg); return ok; };
const check = (ok, msg) => { if (!check0(ok, msg)) pend.push(dumpAll()); };
const pend = [];
const dumpAll = async () => { if (!globalThis.__dumpPages) return; for (const [nm, pg] of globalThis.__dumpPages) log('   ' + nm + ': ' + JSON.stringify(await pg.evaluate(() => TT.dump()))); };
// pagaida, kamēr otrs redz mani pie (x, z)
const sees = async (viewer, pos, lim = 3, ms = 60000) => {
  const t0 = Date.now(); let s = null;
  while (Date.now() - t0 < ms) { s = await viewer.evaluate(() => TT.see()); if (s && Math.hypot(s.x - pos.x, s.z - pos.z) < lim) return s; await sleep(700); }
  return s;
};
const d = (s, p) => (s ? Math.hypot(s.x - p.x, s.z - p.z).toFixed(1) : '—');

await cl.waitForFunction(() => __game.myId > 0, null, { timeout: 120000 });
const idStart = await cl.evaluate(() => __game.myId);
// 0) parasti
let p = await cl.evaluate(() => TT.walk(150, Math.PI)); let s = await sees(host, p);
check(s && Math.hypot(s.x - p.x, s.z - p.z) < 3 && s.vis, `saimnieks redz klientu ejam (${d(s, p)} m)`);

// 1) klientam salūzt vairākas spēles daļas (skaņa, mājdzīvnieki, zemes atjaunošana, laivas)
const broke = await cl.evaluate(() => {
  const g = __game, boom = () => { throw new Error('tests: salauzts'); };
  g.updateSound = boom; g.updatePets = boom; g.updateBoats = boom; g.terr.update = boom; g.updateExits = boom;
  return true;
});
await sleep(2500);
p = await cl.evaluate(() => TT.walk(150, Math.PI / 2)); s = await sees(host, p);
check(broke && s && Math.hypot(s.x - p.x, s.z - p.z) < 3, `klientam kļūdas ciklā — saimnieks vienalga redz viņu ejam (${d(s, p)} m)`);
const hp = await host.evaluate(() => TT.walk(150, Math.PI)); s = await sees(cl, hp); // uz dienvidiem (prom no robežas)
check(s && Math.hypot(s.x - hp.x, s.z - hp.z) < 3 && s.vis, `klients ar kļūdām vienalga redz saimnieku kustamies (${d(s, hp)} m)`);
const ce = await cl.evaluate(() => [...(__game.loopErrs || [])]);
check(ce.length >= 3 && ce.length <= 10, `kļūdas pierakstītas vienreiz katra (${ce.join(', ')})`);

// 2) klienta pulkstenis pārlec 20 s atpakaļ (telefona laika labošana)
await cl.evaluate(() => { __game.timeOffset -= 20000; });
p = await cl.evaluate(() => TT.walk(150, -Math.PI / 2)); s = await sees(host, p);
check(s && Math.hypot(s.x - p.x, s.z - p.z) < 3, `pēc pulksteņa lēciena atpakaļ saimnieks redz klientu kustamies (${d(s, p)} m)`);

// 3) velosipēds ar salauztām daļām: saimnieks redz klientu uz velosipēda
await host.evaluate(() => { const g = __game, v = g.hs.vehs.bike1, m = g.me.pos; v.zone = 's'; v.x = m.x + 3; v.z = m.z + 3; v.h = 0; v.d = -1; g.net.broadcast({ t: 'veh', v: { ...v } }); g.applyVeh && g.applyVeh({ ...v }); });
await sleep(2500);
await cl.evaluate(() => { const g = __game, v = g.vehs.bike1; TT.go(v.x + 1, v.z, null); g.requestVehicle('bike1'); });
await cl.waitForFunction(() => __game.me.veh && __game.me.veh.id === 'bike1', null, { timeout: 60000 }).catch(() => {});
p = await cl.evaluate(() => TT.ride(120)); s = await sees(host, p, 4);
check(p.veh === 'bike1' && s && Math.hypot(s.x - p.x, s.z - p.z) < 4 && s.vo === true && s.code === 5, `saimnieks redz klientu uz velosipēda (${d(s, p)} m, velosipēds redzams: ${s && s.vo}, kods ${s && s.code}, klients: ${p.veh})`);
// 4) saimniekam salūzt skaņa — klients vienalga redz viņu
await host.evaluate(() => { __game.updateSound = () => { throw new Error('tests: skaņa'); }; });
const hp2 = await host.evaluate(() => TT.walk(120, Math.PI)); s = await sees(cl, hp2);
check(s && Math.hypot(s.x - hp2.x, s.z - hp2.z) < 3, `saimniekam kļūda — klients vienalga redz viņu ejam (${d(s, hp2)} m)`);
const idEnd = await cl.evaluate(() => __game.myId);
check(idEnd === idStart, `nav lieku atkārtotu savienošanos (klienta id ${idStart} → ${idEnd})`);
const real = errs.filter((e) => !/tests: |Lost connection to server/.test(e));
await Promise.all(pend);
log('KĻŪDAS:', real.length ? real.join('\n') : 'nav');
log(fails || real.length ? `NEIZDEVĀS: ${fails}` : 'VISS IZDEVĀS');
await browser.close();

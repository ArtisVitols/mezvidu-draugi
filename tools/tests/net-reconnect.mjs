// Mežvidu Draugi — takas tests (headless Chromium, playwright-core). Palaist: python3 -m http.server 8765 projekta saknē, tad node tools/tests/net-reconnect.mjs (vajag playwright-core: npm i playwright-core blakus vai NODE_PATH; Chromium ceļš — env CHROME)
// 1.47.2: atkārtota savienošanās — saimnieks „samazināts” (iesalis), aizvērts / kluss savienojums, tukšs velosipēds pēc zemes maiņas
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
    see() { const g = __game, rs = [...g.remotes.values()], r = rs.find((x) => x.seen && x.buf && x.buf.length) || rs[0]; return r ? { id: r.id, x: r.pos.x, z: r.pos.z, zone: r.zone, vis: r.avatar.root.visible, onSeat: !!(r.vehObj && r.avatar.root.parent === r.vehObj.seat), vo: r.vehObj ? r.vehObj.root.visible && r.vehObj.root.parent === g.stage : null, code: r.vehCode, n: g.remotes.size } : { n: 0 }; },
    dump() { const g = __game; return [...g.remotes.values()].map((r) => ({ id: r.id, z: r.zone, vis: r.avatar.root.visible, par: r.avatar.root.parent ? (r.avatar.root.parent === g.stage ? 'stage' : r.avatar.root.parent.type) : null, code: r.vehCode, vid: r.vehId, vo: !!r.vehObj, mg: g.mgHidden ? g.mgHidden(r.id) : null, anim: r.anim, x: Math.round(r.pos.x), zz: Math.round(r.pos.z) })).concat([{ me: g.myId, zone: g.zone, veh: g.me.veh ? g.me.veh.id : null }]); },
    me() { const g = __game; return { id: g.myId, x: g.me.pos.x, z: g.me.pos.z, veh: g.me.veh ? g.me.veh.id : null, slot: g.mySlot, zone: g.zone }; },
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
const sees = async (viewer, pos, lim = 3, ms = 90000) => {
  const t0 = Date.now(); let s = null;
  while (Date.now() - t0 < ms) { s = await viewer.evaluate(() => TT.see()); if (s && s.x != null && Math.hypot(s.x - pos.x, s.z - pos.z) < lim) return s; await sleep(800); }
  return s;
};
const d = (s, p) => (s && s.x != null ? Math.hypot(s.x - p.x, s.z - p.z).toFixed(1) : '—');
// abi redz viens otru kustamies
const both = async (tag) => {
  const p = await cl.evaluate(() => TT.walk(90, Math.random() * 6)); const s = await sees(host, p);
  const h = await host.evaluate(() => TT.walk(90, Math.random() * 6)); const s2 = await sees(cl, h);
  const ok = s && s.x != null && Math.hypot(s.x - p.x, s.z - p.z) < 3 && s.vis && s2 && s2.x != null && Math.hypot(s2.x - h.x, s2.z - h.z) < 3 && s2.vis;
  check(ok, `${tag}: abi redz viens otru kustamies (saimnieks→klients ${d(s, p)} m, klients→saimnieks ${d(s2, h)} m)`);
};
const hostPlayers = () => host.evaluate(() => [...__game.hs.profiles.entries()].map(([id, p]) => id + ':' + p.name + ':' + p.slot).join(', '));
await cl.waitForFunction(() => __game.myId > 0, null, { timeout: 120000 });
const c0 = await cl.evaluate(() => TT.me());
const idStart = c0.id;
await both('sākumā');

check((await cl.evaluate(() => __game.myId)) === idStart, `sākumā nav lieku atkārtotu savienošanos (id ${idStart})`);
// 1) saimnieks „samazina” spēli — JS iesalst 12 s (kā fonā), tad atgriežas
await host.evaluate(() => { const t = Date.now(); while (Date.now() - t < 12000) { /* iesalis */ } });
await sleep(4000);
await cl.waitForFunction(() => !__game.net.reconnecting, null, { timeout: 120000 }).catch(() => {});
await both('pēc saimnieka 12 s pauzes');
check((await cl.evaluate(() => __game.myId)) === idStart, 'īsa saimnieka pauze (12 s) — savienojums saglabājas, bez pārslēgšanās');
let hp = await hostPlayers();
check(hp.split(', ').length === 2, `saimniekam 2 spēlētāji, bez dubultiem (${hp})`);
check(await cl.evaluate(() => !__game.disconnected), 'klientam nav „savienojums pārtrūka” loga');

// 2) saimnieks aizver klienta savienojumu → klients pats pieslēdzas no jauna
const id1 = await cl.evaluate(() => __game.myId);
await host.evaluate(() => { for (const c of __game.net.conns.values()) c.close(); });
await cl.waitForFunction((id1) => __game.myId !== id1 && !__game.net.reconnecting, id1, { timeout: 120000 }).catch(() => {});
const c2 = await cl.evaluate(() => TT.me());
check(c2.id !== id1 && c2.slot === c0.slot, `aizvērts savienojums → klients atkal iekšā (id ${id1}→${c2.id}, sēta ${c0.slot}→${c2.slot})`);
await both('pēc aizvērta savienojuma');
hp = await hostPlayers();
check(hp.split(', ').length === 2, `saimniekam 2 spēlētāji (${hp})`);

// 3) kluss „miris” savienojums: saimnieka ziņas klientam vairs nepienāk
const id2 = c2.id;
await host.evaluate(() => { for (const c of __game.net.conns.values()) c.send = () => {}; });
await cl.waitForFunction((id2) => __game.myId !== id2 && !__game.net.reconnecting, id2, { timeout: 120000 }).catch(() => {});
const c3 = await cl.evaluate(() => TT.me());
check(c3.id !== id2, `kluss savienojums pamanīts → klients atkal iekšā (id ${id2}→${c3.id})`);
await both('pēc klusā savienojuma');
hp = await hostPlayers();
check(hp.split(', ').length === 2, `saimniekam 2 spēlētāji, vecais izmests (${hp})`);
const sees2 = await cl.evaluate(() => __game.remotes.size);
check(sees2 === 1, `klients redz tieši vienu draugu (${sees2})`);

// 4) velosipēds: draugs uz velosipēda, es aizeju uz citu zemi un atpakaļ → draugs redzams uz velosipēda (nevis tukšs)
await host.evaluate(() => { const g = __game, v = g.hs.vehs.bike1, m = g.me.pos; v.zone = g.zone; v.x = m.x + 3; v.z = m.z + 3; v.h = 0; v.d = -1; g.net.broadcast({ t: 'veh', v: { ...v } }); });
await sleep(2500);
await cl.evaluate(() => { const g = __game, v = g.vehs.bike1; TT.go(v.x + 1, v.z, null); g.requestVehicle('bike1'); });
await cl.waitForFunction(() => __game.me.veh && __game.me.veh.id === 'bike1', null, { timeout: 60000 }).catch(() => {});
let p = await cl.evaluate(() => TT.ride(60)); let s = await sees(host, p, 4);
check(p.veh === 'bike1' && s && s.vis && s.onSeat && s.vo, `saimnieks redz draugu uz velosipēda (redzams ${s && s.vis}, sēž ${s && s.onSeat})`);
const z0 = await host.evaluate(() => __game.zone);
const other = z0 === 's' ? 'c' : 's';
await host.evaluate((z) => __game.teleport(z, { x: 0, z: z === 's' ? -280 : 30 }, 0), other);
await host.waitForFunction((z) => __game.zone === z && !__game.zoneBusy, other);
await sleep(2500);
const away = await host.evaluate(() => TT.see());
await host.evaluate((z) => __game.teleport(z, { x: 0, z: 0 }, 0), z0);
await host.waitForFunction((z) => __game.zone === z && !__game.zoneBusy, z0);
p = await cl.evaluate(() => TT.ride(30)); s = await sees(host, p, 4);
check(!away.vis && s && s.vis && s.onSeat && s.vo, `pēc zemes maiņas draugs atkal redzams uz velosipēda, ne tukšs velosipēds (prom: ${away.vis}, atpakaļ: redzams ${s && s.vis}, sēž ${s && s.onSeat})`);
// klients ar velosipēdu aizbrauc uz citu zemi un atpakaļ; saimnieks paliek
await cl.evaluate((z) => __game.teleport(z, { x: 0, z: z === 's' ? -280 : 30 }, 0), other);
await cl.waitForFunction((z) => __game.zone === z && !__game.zoneBusy, other);
await sleep(2000);
await cl.evaluate((z) => __game.teleport(z, { x: 1, z: 1 }, 0), z0);
await cl.waitForFunction((z) => __game.zone === z && !__game.zoneBusy, z0);
await sleep(1500);
const back = await cl.evaluate(() => TT.see()), hm = await host.evaluate(() => TT.me());
check(back && back.vis && Math.hypot(back.x - hm.x, back.z - hm.z) < 3, `klients pēc zemes maiņas redz saimnieku (${back && back.vis})`);
const real = errs.filter((e) => !/Lost connection to server|Could not connect to peer|peer-unavailable|Spēles cikla kļūda/.test(e));
await Promise.all(pend);
log('KĻŪDAS:', real.length ? real.join('\n') : 'nav');
log(fails || real.length ? `NEIZDEVĀS: ${fails}` : 'VISS IZDEVĀS');
await browser.close();

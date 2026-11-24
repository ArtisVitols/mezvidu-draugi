// Mežvidu Draugi — roņa laivas uzdevuma tests (1.46.0). Palaist: python3 -m http.server 8765 projekta saknē, tad node tools/tests/trail-boat.mjs
// Saimnieks + klients. Peld un brauc ar īsto fiziku (updateWalk / updateBoat) — autopilots soļos pa 1/30 s, darbības ar īsto dzelteno pogu.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
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
const log = (...a) => console.log(...a);
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; log('❌ ' + msg); } else log('✅ ' + msg); };

const host = await mk('Mamma');
await host.click('#btn-host');
await host.waitForFunction(() => window.__game && __game.zone === 'c' && !__game.zoneBusy);
const code = await host.evaluate(() => __game.roomCode);
const cl = await mk('Anna');
await cl.fill('#in-code', code); await cl.click('#btn-join');
await cl.waitForFunction(() => window.__game && __game.zone === 'c' && !__game.zoneBusy);
for (const p of [host, cl]) await p.evaluate(() => __game.teleport('s', { x: 2, z: -300 }, Math.PI));
for (const p of [host, cl]) await p.waitForFunction(() => __game.zone === 's' && !__game.zoneBusy);

const helpers = async () => {
  const V = (await import('./js/version.js')).VERSION, T = await import('./js/trail.js?v=' + V);
  window.TT = {
    T,
    go(x, z, face) { const g = __game, Z = g.terr; g.me.pos.set(x, Math.max(Z.groundAt(x, z), -0.75), z); g.me.vy = 0; g.me.onGround = true; if (face != null) g.me.heading = face; Z.lp = null; },
    act(want) {
      const g = __game; g.timers.action = 0; g.currentAction = null;
      const a = g.findAction();
      if (!a) return 'NONE';
      if (want && !a.label.includes(want)) return 'WRONG:' + a.label;
      a.fn(); return a.label;
    },
    // autopilots kājām/peldus: īstā updateWalk ar kustību uz mērķi
    walkTo(x, z, near = 2.2, maxS = 6000) {
      const g = __game, me = g.me; let swam = false, n = 0;
      for (; n < maxS; n++) {
        const dx = x - me.pos.x, dz = z - me.pos.z;
        if (Math.hypot(dx, dz) < near) break;
        g.cam.yaw = Math.atan2(-dx, -dz);
        g.updateWalk(1 / 30, { x: 0, y: 1, run: false }, false);
        if (me.state === 'swim') swam = true;
      }
      return { n, swam, d: Math.hypot(x - me.pos.x, z - me.pos.z), x: me.pos.x, z: me.pos.z, st: me.state };
    },
    // autopilots laivā: stūrē uz mērķi ar īsto updateVehicle (updateBoat)
    rowTo(x, z, near = 2.5, maxS = 9000, keepGoing = false) {
      const g = __game, me = g.me; let minDepth = 99, n = 0;
      for (; n < maxS && me.veh; n++) {
        const dx = x - me.pos.x, dz = z - me.pos.z, d = Math.hypot(dx, dz);
        if (d < near && !keepGoing) break;
        let e = Math.atan2(dx, dz) - me.veh.heading; e = Math.atan2(Math.sin(e), Math.cos(e));
        const steer = Math.max(-1, Math.min(1, -e * 2));
        const thr = Math.abs(e) > 1.2 ? 0.15 : d < 6 ? 0.45 : 1;
        g.updateVehicle(1 / 30, { x: steer, y: thr, run: false });
        minDepth = Math.min(minDepth, -g.terr.getHeight(me.pos.x, me.pos.z));
      }
      return { n, minDepth, d: Math.hypot(x - me.pos.x, z - me.pos.z), x: me.pos.x, z: me.pos.z, sp: me.veh ? me.veh.speed : null };
    },
    st() { const g = __game, b = g.vehs.boat1; return { step: g.trail.step, acc: g.trail.acc, boat: g.trail.boat, coins: g.save.coins, veh: g.me.veh ? g.me.veh.id : null, ride: !!g.me.ride, bx: Math.round(b.x), bz: Math.round(b.z), bd: b.d }; },
  };
};
for (const p of [host, cl]) await p.evaluate(helpers);
const st = async () => ({ h: await host.evaluate(() => TT.st()), c: await cl.evaluate(() => TT.st()) });

// --- vecie saglabājumi ---
const mig = await host.evaluate(() => {
  const g = __game, save = g.save.trail, out = {};
  for (const [name, s] of Object.entries({ v2s6: { v: 2, step: 6, bridge: true }, v0s5: { step: 5, bridge: true }, v2s5: { v: 2, step: 5 } })) { g.save.trail = s; g.hostInitTrail(); out[name] = g.hs.trail.step; }
  g.save.trail = save; g.hostInitTrail();
  return out;
});
check(mig.v2s6 === 6 && mig.v0s5 === 6 && mig.v2s5 === 5, `vecie saglabājumi: pabeigta taka (v2 solis 6) → ronis; ${JSON.stringify(mig)}`);

// --- uzreiz pie roņa (visi iepriekšējie izpildīti) ---
await host.evaluate(() => { const g = __game, tr = g.hs.trail; tr.step = 6; tr.bridge = true; tr.ob = g.terr.lay.obst.map(o => TT.T.OB_TYPES[o.type].hits); g.hostTrailSend(null); });
await cl.waitForFunction(() => __game.trail.step === 6, null, { timeout: 120000 }).catch(() => {});
const L = await host.evaluate(() => { const s = __game.terr.lay.stops[6]; return { seal: { x: s.x, z: s.z, face: s.face }, dock: TT.T.DOCK, home: TT.T.BOAT_HOME, range: s.range, clear: s.clear }; });
log('izkārtojums:', JSON.stringify(L));
let s = await st();
check(s.h.step === 6 && s.c.step === 6 && !s.h.acc, 'abi pie roņa (solis 6)');
check(Math.abs(s.h.bx - L.home.x) < 1 && Math.abs(s.h.bz - L.home.z) < 1 && Math.abs(s.c.bx - L.home.x) < 1, `laiva sākumā jūrā (${s.h.bx}, ${s.h.bz})`);

// pirms uzdevuma — laivā kāpt nevar
const pre = await cl.evaluate(({ home }) => { TT.go(home.x + 2.4, home.z, null); const a = TT.act(); __game.requestVehicle('boat1'); return a; }, L);
await sleep(2500);
s = await st();
check(pre.includes('Roņa laiva') && !pre.includes('Sēsties') && s.c.veh == null && s.h.bd === -1, `pirms uzdevuma laivā nevar (${pre}; saimnieks atteica)`);

// --- saruna ar roni, pieņem klients ---
for (const p of [host, cl]) await p.evaluate(({ seal }) => TT.go(seal.x + Math.sin(seal.face) * 1.6, seal.z + Math.cos(seal.face) * 1.6, seal.face + Math.PI), L);
await sleep(700);
const lab = await cl.evaluate(() => TT.act());
await cl.waitForFunction(() => document.querySelector('#panel').innerText.includes('Palīdzēsim'), null, { timeout: 60000 }).catch(() => {});
const panel = await cl.evaluate(() => document.querySelector('#panel').innerText);
check(lab.includes('Ronis') && panel.includes('Palīdzēsim') && panel.includes('laiv'), `saruna ar roni atveras (${lab})`);
await cl.click('text=🤝 Palīdzēsim!');
await sleep(1500);
s = await st();
check(s.h.acc && s.c.acc, 'uzdevums pieņemts abiem');
const bar = await cl.evaluate(() => document.getElementById('team-bar') ? document.getElementById('team-bar').innerText : '');
check(/laiv/i.test(bar), `josla: ${bar}`);

// --- neizdošanās: visi aiziet prom → laivā vairs nevar ---
for (const p of [host, cl]) await p.evaluate(() => TT.go(0, 700, null));
await sleep(7000);
s = await st();
check(!s.h.acc && !s.c.acc, 'visi aizgāja → uzdevums neizdevās');
const pre2 = await cl.evaluate(({ home }) => { TT.go(home.x + 2.4, home.z, null); return TT.act(); }, L);
check(pre2.includes('Roņa laiva') && !pre2.includes('Sēsties'), `pēc neizdošanās laivā atkal nevar (${pre2})`);
// pieņem vēlreiz (saimnieks)
for (const p of [host, cl]) await p.evaluate(({ seal }) => TT.go(seal.x + Math.sin(seal.face) * 1.6, seal.z + Math.cos(seal.face) * 1.6, seal.face + Math.PI), L);
await sleep(600);
await host.evaluate(() => TT.act());
await sleep(500);
await host.click('text=🤝 Palīdzēsim!');
await sleep(1500);
s = await st();
check(s.h.acc && s.c.acc, 'pieņemts vēlreiz');

// --- klients peld no krasta līdz laivai ---
const sw = await cl.evaluate(({ home }) => TT.walkTo(home.x, home.z, 2.6), L);
check(sw.d < 2.7 && sw.swam, `peld līdz laivai (${sw.n} soļi, peldēja: ${sw.swam}, atlikušais ${sw.d.toFixed(1)} m)`);
const board = await cl.evaluate(() => TT.act('Sēsties laivā'));
await sleep(2500);
s = await st();
check(s.c.veh === 'boat1' && s.h.bd === (await cl.evaluate(() => __game.myId)), `iekāpj laivā (${board})`);
check(await cl.evaluate(() => __game.findAction() === null && !document.getElementById('btn-exit-kart').classList.contains('hidden')), 'laivā: izkāpšanas poga redzama, dzeltenā poga nav');

// draugs redz laivu kustamies
const r1 = await cl.evaluate(({ dock }) => TT.rowTo(dock.x + 25, dock.z + 22, 3, 2500), L);
await sleep(2500);
const seen = await host.evaluate(() => { const g = __game, b = g.vehs.boat1, r = [...g.remotes.values()][0]; return { d: b.d, par: !!(b.obj && b.obj.root.parent), dx: b.obj ? Math.hypot(b.obj.root.position.x - r.pos.x, b.obj.root.position.z - r.pos.z) : 99, y: b.obj ? b.obj.root.position.y : 0, seat: r.avatar.root.parent === b.obj.seat }; });
check(seen.par && seen.dx < 0.5 && seen.seat && Math.abs(seen.y) < 0.3, `saimnieks redz drauga laivu un draugu tajā (${JSON.stringify(seen)})`);

// --- brauc uz piestātni ---
const r2 = await cl.evaluate(({ dock }) => TT.rowTo(dock.x, dock.z, 2, 6000), L);
log('  brauciens:', JSON.stringify(r2));
check(r2.d < 2.2 && r2.minDepth > 0.39, `iebrauc piestātnē (atlikušais ${r2.d.toFixed(1)} m, min. dziļums ${r2.minDepth.toFixed(2)} m)`);
const c0 = s.h.coins, cc0 = s.c.coins;
await sleep(3000);
s = await st();
check(s.h.step === 7 && s.c.step === 7 && s.h.boat && s.c.boat, `roņa uzdevums izpildīts (solis ${s.h.step}), laiva brīva`);
check(s.h.coins - c0 >= 45 && s.c.coins - cc0 >= 45, `balva abiem (+${s.h.coins - c0}, +${s.c.coins - cc0})`);
check(await host.evaluate(() => __game.save.ownedHats.includes('jurnieks')) && await cl.evaluate(() => __game.save.ownedHats.includes('jurnieks')), 'jūrnieka cepure abiem');

// --- uz krastu nevar uzbraukt ---
const r3 = await cl.evaluate(({ dock }) => { const g = __game; const out = TT.rowTo(dock.x - 6, dock.z - 30, 1, 900, true); return { ...out, ground: g.terr.getHeight(g.me.pos.x, g.me.pos.z) }; }, L);
check(r3.ground < -0.39 && r3.minDepth > 0.39, `pret krastu laiva apstājas seklumā (zeme ${r3.ground.toFixed(2)}, min. dziļums ${r3.minDepth.toFixed(2)})`);
// tālu jūrā — robeža
const r4 = await cl.evaluate(({ dock }) => TT.rowTo(dock.x, 990, 1, 1500, true), L);
check(r4.z <= 902.01, `tālāk par jūras robežu neaizbrauc (z ${r4.z.toFixed(1)})`);

// --- pasažieris: saimnieks brauc līdzi ---
await cl.evaluate(({ dock }) => TT.rowTo(dock.x + 10, dock.z + 18, 2, 3000), L);
for (let i = 0; i < 20; i++) { await cl.evaluate(() => __game.updateVehicle(1 / 30, { x: 0, y: -1 })); }
await sleep(1500);
const bp = await cl.evaluate(() => ({ x: __game.me.pos.x, z: __game.me.pos.z }));
const ride = await host.evaluate((bp) => { TT.go(bp.x + 2.2, bp.z, null); return TT.act('Braukt līdzi'); }, bp);
await sleep(800);
s = await st();
check(s.h.ride, `saimnieks sēžas drauga laivā kā pasažieris (${ride})`);
await cl.evaluate(({ dock }) => TT.rowTo(dock.x + 30, dock.z + 20, 2, 1500), L);
await sleep(2500);
const follow = await host.evaluate(() => { const g = __game, r = [...g.remotes.values()][0]; return { d: Math.hypot(g.me.pos.x - r.pos.x, g.me.pos.z - r.pos.z), seat: g.avatar.root.parent === (r.vehObj && r.vehObj.seats[g.me.ride.seat]) }; });
check(follow.d < 1.5 && follow.seat, `pasažieris brauc līdzi (${JSON.stringify(follow)})`);
await host.evaluate(() => __game.leaveRide());
await sleep(300);
for (let i = 0; i < 30; i++) await host.evaluate(() => __game.updateWalk(1 / 30, { x: 0, y: 0 }, false));
check(await host.evaluate(() => !__game.me.ride && __game.me.state === 'swim'), 'pasažieris izkāpj jūrā un peld');

// --- izkāpj klients; saimnieks pats var braukt (laiva brīva) ---
await cl.evaluate(() => __game.exitVehicle());
await sleep(2000);
for (let i = 0; i < 30; i++) await cl.evaluate(() => __game.updateWalk(1 / 30, { x: 0, y: 0 }, false));
s = await st();
check(!s.c.veh && s.h.bd === -1 && await cl.evaluate(() => __game.me.state === 'swim'), 'klients izkāpj jūrā un peld, laiva paliek tur');
const hb = await host.evaluate(() => { const b = __game.vehs.boat1; const r = TT.walkTo(b.x, b.z, 2.6, 4000); return TT.act('Sēsties laivā') + ' ' + r.d.toFixed(1); });
await sleep(2500);
s = await st();
check(s.h.veh === 'boat1', `pēc uzdevuma laivā var kāpt arī saimnieks (${hb})`);
const r5 = await host.evaluate(({ dock }) => TT.rowTo(dock.x - 20, dock.z + 5, 2, 4000), L);
await host.evaluate(() => __game.exitVehicle());
await sleep(2000);
const saved = await host.evaluate(() => { const g = __game; g.hostVehSave(); const sv = g.save.vehs.boat1; g.hostInitVehs(); const v = g.hs.vehs.boat1; return { sv, v: { zone: v.zone, x: v.x, z: v.z } }; });
check(saved.sv && saved.sv.zone === 's' && Math.abs(saved.v.x - saved.sv.x) < 0.01 && Math.abs(saved.v.z - saved.sv.z) < 0.01 && saved.v.z > 800, `laivas vieta saglabājas (${JSON.stringify(saved)})`);

// --- sākt no jauna: laiva paliek brīva; nākamreiz pie roņa laiva atgriežas jūrā ---
await host.evaluate(({ seal }) => { TT.go(seal.x + Math.sin(seal.face) * 1.6, seal.z + Math.cos(seal.face) * 1.6, null); TT.act(); }, L);
await sleep(500);
await host.click('text=🔁 Sākt piedzīvojumu no jauna');
await sleep(1500);
s = await st();
check(s.h.step === 0 && s.c.step === 0 && !s.h.boat && !s.c.boat, 'pēc restartēšanas solis 0, laiva vairs nav brīva (1.49.0)');
check(Math.abs(s.h.bx - L.home.x) < 1 && Math.abs(s.c.bz - L.home.z) < 1, `pēc restartēšanas laiva uzreiz atpakaļ jūrā, ne piestātnē (${s.c.bx}, ${s.c.bz})`);
const brR = await Promise.all([host, cl].map((p) => p.evaluate(() => ({ b: __game.trail.bridge, z: __game.terr.bridgeDone, south: __game.terr.southOfStream(__game.me.pos.x, __game.me.pos.z) }))));
check(brR.every((b) => !b.b && !b.z && !b.south), `pēc restartēšanas tilta nav un neviens nav iesprūdis aiz strauta (${JSON.stringify(brR)})`);
const ini = await host.evaluate(() => { const g = __game, out = {}; const keep = g.save.trail;
  for (const [n, s] of Object.entries({ s0b: { v: 3, step: 0, bridge: true, boat: true }, s5b: { v: 3, step: 5, bridge: true }, s7: { v: 3, step: 7, bridge: true, boat: true } })) { g.save.trail = s; g.hostInitTrail(); out[n] = [g.hs.trail.bridge, g.hs.trail.boat]; }
  g.save.trail = keep; g.hostInitTrail(); return out; });
check(JSON.stringify(ini) === JSON.stringify({ s0b: [false, false], s5b: [true, false], s7: [true, true] }), `saglabājumā tilts/laiva atbilst solim (${JSON.stringify(ini)})`);
await host.evaluate(() => { const g = __game, tr = g.hs.trail; tr.step = 6; tr.acc = false; tr.bridge = true; g.hostTrailSend(null); });
await sleep(800);
for (const p of [host, cl]) await p.evaluate(({ seal }) => TT.go(seal.x + Math.sin(seal.face) * 1.6, seal.z + Math.cos(seal.face) * 1.6, seal.face + Math.PI), L);
await sleep(500);
await cl.evaluate(() => TT.act()); await sleep(400); await cl.click('text=🤝 Palīdzēsim!');
await sleep(1500);
s = await st();
check(s.h.acc && Math.abs(s.h.bx - L.home.x) < 1 && Math.abs(s.c.bz - L.home.z) < 1, `atkārtoti pieņemot, laiva atpakaļ jūrā (${s.c.bx}, ${s.c.bz})`);

log('KĻŪDAS:', errs.length ? errs.join('\n') : 'nav');
log(fails ? `NEIZDEVĀS: ${fails}` : 'VISS IZDEVĀS');
await browser.close();

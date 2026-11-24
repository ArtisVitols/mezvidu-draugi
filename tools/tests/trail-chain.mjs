// Mežvidu Draugi — takas tests (headless Chromium, playwright-core). Palaist: python3 -m http.server 8765 projekta saknē, tad node tools/tests/trail-chain.mjs (vajag playwright-core: npm i playwright-core blakus vai NODE_PATH; Chromium ceļš — env CHROME)
// Pilna takas uzdevumu ķēde ar 2 spēlētājiem (saimnieks + klients), ar īstām darbību pogām
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
    act(want) {
      const g = __game; g.timers.action = 0; g.currentAction = null;
      const a = g.findAction();
      if (!a) return 'NONE';
      if (want && !a.label.includes(want)) return 'WRONG:' + a.label;
      a.fn(); return a.label;
    },
    st() { const g = __game; return { step: g.trail.step, acc: g.trail.acc, c: g.trail.c, carry: g.me.carry ? g.me.carry.k : null, fish: g.fishing ? g.fishing.phase : null, coins: g.save.coins, veh: g.me.veh ? g.me.veh.id : null }; },
    // 1.46.0: peld (īstā updateWalk) un airē (īstā updateVehicle) uz mērķi
    walkTo(x, z, near = 2.4, maxS = 6000) {
      const g = __game, me = g.me; let n = 0;
      for (; n < maxS && Math.hypot(x - me.pos.x, z - me.pos.z) >= near; n++) { g.cam.yaw = Math.atan2(-(x - me.pos.x), -(z - me.pos.z)); g.updateWalk(1 / 30, { x: 0, y: 1, run: false }, false); }
      return Math.hypot(x - me.pos.x, z - me.pos.z);
    },
    rowTo(x, z, near = 2, maxS = 8000) {
      const g = __game, me = g.me;
      for (let n = 0; n < maxS && me.veh; n++) {
        const dx = x - me.pos.x, dz = z - me.pos.z, d = Math.hypot(dx, dz);
        if (d < near) break;
        let e = Math.atan2(dx, dz) - me.veh.heading; e = Math.atan2(Math.sin(e), Math.cos(e));
        g.updateVehicle(1 / 30, { x: Math.max(-1, Math.min(1, -e * 2)), y: Math.abs(e) > 1.2 ? 0.15 : d < 6 ? 0.45 : 1 });
      }
      return Math.hypot(x - me.pos.x, z - me.pos.z);
    },
  };
};
for (const p of [host, cl]) await p.evaluate(helpers);
const st = async () => ({ h: await host.evaluate(() => TT.st()), c: await cl.evaluate(() => TT.st()) });
const log = (...a) => console.log(...a);
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; log('❌ ' + msg); } else log('✅ ' + msg); };
const TASKS = await host.evaluate(async () => (await import('./js/trail.js')).TASKS.map(t => ({ name: t.name, kind: t.kind, need: t.need, coins: t.coins })));
log('uzdevumi:', TASKS.map(t => t.name + '/' + t.kind + '/' + t.need).join(', '));
const P = [host, cl];
for (let k = 0; k < TASKS.length; k++) {
  const T = TASKS[k];
  const coins0 = [await host.evaluate(() => __game.save.coins), await cl.evaluate(() => __game.save.coins)];
  // abi pie NPC; klients runā un pieņem (pārmaiņus)
  const who = P[k % 2];
  for (const p of P) await p.evaluate((k) => { const s = __game.terr.lay.stops[k]; TT.go(s.x + Math.sin(s.face) * 1.6, s.z + Math.cos(s.face) * 1.6, s.face + Math.PI); }, k);
  await sleep(600);
  const lab = await who.evaluate(() => TT.act());
  await sleep(400);
  const panelTxt = await who.evaluate(() => document.querySelector('#panel') ? document.querySelector('#panel').innerText : '?');
  check(lab.includes(T.name) && panelTxt.includes('Palīdzēsim'), `[${k}] ${T.name}: saruna atveras (${lab}) `);
  await who.click('text=🤝 Palīdzēsim!');
  await sleep(1500);
  let s = await st();
  check(s.h.acc && s.c.acc && s.h.step === k, `[${k}] uzdevums pieņemts abiem`);
  let guard = 0;
  while (guard++ < 80) {
    s = await st();
    if (s.h.step !== k) break;
    if (T.kind === 'pick') {
      // katrs pa priekšmetam
      for (const p of P) {
        const r = await p.evaluate((k) => {
          const g = __game, Z = g.terr, o = Z.itemObjs.find(o => o.obj.visible);
          if (!o) return 'none';
          TT.go(o.it.x + 0.4, o.it.z, null);
          return TT.act('Lasīt');
        }, k);
        if (r.startsWith('WRONG') || r === 'NONE') log('  pick?', r);
      }
      await sleep(1200);
    } else if (T.kind === 'carry') {
      for (const p of P) {
        const r = await p.evaluate(() => {
          const g = __game, Z = g.terr;
          if (g.me.carry) return 'carrying';
          const o = Z.itemObjs.find(o => o.obj.visible);
          if (!o) return 'none';
          TT.go(o.it.x + 0.4, o.it.z, null);
          return TT.act('Pacelt');
        });
        if (r.startsWith('WRONG') || r === 'NONE') log('  take?', r);
      }
      await sleep(1500);
      for (const p of P) {
        const r = await p.evaluate((k) => {
          const g = __game, Z = g.terr, d = Z.lay.stops[k].drop;
          if (!g.me.carry) return 'nocarry';
          TT.go(d.x + 1, d.z + 0.5, null);
          return TT.act('Nolikt');
        }, k);
        if (r.startsWith('WRONG') || r === 'NONE') log('  drop?', r);
      }
      await sleep(1500);
    } else if (T.kind === 'fish') {
      // katrs: krastā → makšķerēt → (pagaida kodienu) → VILKT → uz grozu → ielikt
      for (const [pi, p] of P.entries()) {
        const r = await p.evaluate(async ([k, pi]) => {
          const g = __game, Z = g.terr, s = Z.lay.stops[k], pd = s.pond;
          const out = [];
          if (!g.me.carry) {
            const a = Math.atan2(s.x - pd.x, s.z - pd.z) + (pi ? 0.6 : -0.6) + (Math.random() - 0.5) * 0.3; // krasts kaķa pusē
            const x = pd.x + Math.sin(a) * (pd.r + 1.2), z = pd.z + Math.cos(a) * (pd.r + 1.2);
            TT.go(x, z, a + Math.PI);
            out.push(TT.act('Makšķerēt'));
            if (!g.fishing) return out.join(' / ') + ' / nefishing';
            g.fishing.bite = 0.05; // paātrina kodienu
            const t0 = performance.now();
            while (g.fishing && g.fishing.phase !== 'bite' && performance.now() - t0 < 20000) await new Promise(r => setTimeout(r, 100));
            if (!g.fishing) return out.join(' / ') + ' / fishing stopped';
            out.push(TT.act('VILKT'));
            if (!g.me.carry || !g.me.carry.fish) return out.join(' / ') + ' / no fish';
          }
          const d = s.drop;
          TT.go(d.x + 1.1, d.z, null);
          out.push(TT.act('Ielikt grozā'));
          return out.join(' / ');
        }, [k, pi]);
        if (/WRONG|NONE|no |stopped|nefishing/.test(r)) log('  fish?', r);
      }
      await sleep(1700);
    } else if (T.kind === 'boat') {
      // 1.46.0: viens aizpeld līdz laivai, iekāpj un airē uz piestātni
      const r = await who.evaluate(() => {
        const g = __game, b = g.vehs.boat1;
        if (!g.me.veh) { const d = TT.walkTo(b.x, b.z); return 'swim ' + d.toFixed(1) + ' / ' + TT.act('Sēsties laivā'); }
        const D = g.terr.lay.stops[6].drop; return 'row ' + TT.rowTo(D.x, D.z).toFixed(1);
      });
      if (/WRONG|NONE/.test(r)) log('  boat?', r);
      await sleep(2500);
    }
  }
  for (const p of P) await p.evaluate(() => { if (__game.me.veh) __game.exitVehicle(); });
  await sleep(1500);
  s = await st();
  const coins1 = [s.h.coins, s.c.coins];
  check(s.h.step === k + 1 && s.c.step === k + 1, `[${k}] ${T.name} pabeigts (solis ${s.h.step}, ${guard} cikli)`);
  check(coins1[0] - coins0[0] >= T.coins && coins1[1] - coins0[1] >= T.coins, `[${k}] balva abiem (+${coins1[0] - coins0[0]}, +${coins1[1] - coins0[1]})`);
  check(!s.h.carry && !s.c.carry && !s.h.fish && !s.c.fish, `[${k}] pēc uzdevuma nekas nav rokās / nemakšķerē`);
  // 1.47.0: bultas — redzamas tieši izpildītajām pieturām (pēdējai nav)
  const arr = await Promise.all(P.map((p) => p.evaluate(() => __game.terr.arrows.map((m) => m.visible))));
  const wantA = arr[0].map((_, j) => j <= k);
  check(arr.every((a) => JSON.stringify(a) === JSON.stringify(wantA)), `[${k}] bultas abiem: ${arr[0].map((v) => (v ? '➡️' : '·')).join('')}`);
  if (k === 3) {
    const fishCount = await cl.evaluate(() => __game.terr.fishes.count);
    check(fishCount === 10, `[3] grozā 10 zivis (${fishCount})`);
  }
}
const fin = await st();
check(fin.h.step === TASKS.length, 'visa taka pabeigta');
check(await host.evaluate(() => __game.save.ownedHats.includes('jurnieks')) && await cl.evaluate(() => __game.save.ownedHats.includes('jurnieks')), 'jūrnieka cepure abiem');
// sākt no jauna
await host.evaluate(() => { const s = __game.terr.lay.stops[0]; TT.go(s.x + 1.5, s.z, null); TT.act(); });
await sleep(400);
await host.click('text=🔁 Sākt piedzīvojumu no jauna');
await sleep(1500);
const rs = await st();
check(rs.h.step === 0 && rs.c.step === 0 && !rs.h.acc, 'sākt no jauna — solis 0 abiem');
check(await host.evaluate(() => __game.terr.fishes.count === 0 && __game.terr.logs.count === 0), 'grozi/šķūnis tukši pēc restartēšanas');
check(await host.evaluate(() => !__game.trail.bridge) && await cl.evaluate(() => !__game.trail.bridge && !__game.terr.bridgeDone && __game.terr.planks.count === 0), 'tilts noņemts pēc restartēšanas (bebrs būvē no jauna)');
check(await host.evaluate(() => { const v = __game.hs.vehs.boat1; return !__game.hs.trail.boat && Math.abs(v.x - 112) < 1 && Math.abs(v.h + 2.3) < 0.01; }), 'laiva jūrā pēc restartēšanas');
check(await host.evaluate(() => __game.terr.arrows.every((m) => !m.visible)) && await cl.evaluate(() => __game.terr.arrows.every((m) => !m.visible)), 'bultas paslēptas pēc restartēšanas');
log('KĻŪDAS:', errs.length ? errs.join('\n') : 'nav');
log(fails ? `NEIZDEVĀS: ${fails}` : 'VISS IZDEVĀS');
await browser.close();

// Mežvidu Draugi → Godot eksports. Palaist: lokālais serveris (python3 -m http.server 8765 projekta saknē), tad
//   node tools/export/export.mjs [lands|assets|data] [nosaukumi…]
// Raksta godot/web/<vārds>.json + .bin (dump.js formāts) un godot/web/data/*.json
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { launch, soloGame } from './common.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../godot/web');
mkdirSync(OUT + '/data', { recursive: true });
mkdirSync(OUT + '/asset', { recursive: true });
const what = process.argv[2] || 'lands';
const only = process.argv.slice(3);

const browser = await launch();
const page = await soloGame(browser, 'low');
await page.evaluate(async (v) => {
  window.X = {
    dump: await import('/tools/export/dump.js'),
    world: await import('/js/world.js?v=' + v),
    zones: await import('/js/zones.js?v=' + v),
    data: await import('/js/data.js?v=' + v),
    A: await import('/js/assets.js?v=' + v),
    THREE: await import('three'),
    winter: await import('/js/winter.js?v=' + v),
    trail: await import('/js/trail.js?v=' + v),
    v,
  };
}, await page.evaluate(() => (document.querySelector('script[src*="main.js"]') || {}).src.split('v=')[1]));

async function save(name, fnBody, arg) {
  const t0 = Date.now();
  const r = await page.evaluate(fnBody, arg);
  if (!r) { console.log('  (tukšs)', name); return; }
  const buf = Buffer.from(r.b64, 'base64');
  writeFileSync(`${OUT}/${name}.json`, r.json);
  writeFileSync(`${OUT}/${name}.bin`, buf);
  console.log(`  ${name}: ${(r.json.length / 1024).toFixed(0)} KB json, ${(buf.length / 1048576).toFixed(1)} MB bin, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

if (what === 'lands') {
  const lands = only.length ? only : ['forest', 'farm', 'race', 'winter', 'trail'];
  for (const land of lands) {
    console.log('zeme', land);
    await save('land_' + land, async (land) => {
      const { World } = X.world, { WORLD_SEED } = X.data, Z = X.zones;
      const g = __game;
      const root = new X.THREE.Group();
      if (land === 'winter') {
        const W = new X.winter.WinterZone('n', true); await W.build(root); window.LAST = W;
        // kustīgās daļas Godot veido pats
        for (const d of W.deer || []) d.model.root.name = 'skipDyn';
        for (const s of W.skiers || []) s.av.root.name = 'skipDyn';
        if (W.chairs) W.chairs.name = 'skipDyn';
        if (W.snowfall) W.snowfall.name = 'skipDyn';
        (W.targets || []).forEach((t, i) => { t.obj.name = 'target:' + i; });
      }
      else if (land === 'trail') {
        const W = new X.trail.TrailZone('s', g); await W.build(root); window.LAST = W;
        for (const n of W.npcs || []) n.av.root.name = 'skipDyn';
        if (W.life && W.life.group) W.life.group.name = 'skipDyn';
        for (const k of ['logs', 'apples', 'fishes', 'planks', 'rails']) if (W[k]) { W[k].name = k; if (W[k].isInstancedMesh) W[k].count = W[k].instanceMatrix.count; }
        W.rails.visible = true;
        (W.arrows || []).forEach((m) => { m.name = 'arrow:' + m.userData.a.k; });
        (W.obs || []).forEach((ob, i) => { ob.root.name = 'obRoot:' + i; ob.rest.name = 'obRest:' + i; });
      }
      else {
        const zone = land === 'forest' ? Z.FOREST : land === 'race' ? Z.RACE : Z.FARM;
        const seed = land === 'forest' ? WORLD_SEED : land === 'race' ? WORLD_SEED + 2000 : WORLD_SEED + 1000;
        const W = new World(seed, zone);
        W.build(root, g.renderer);
        // meža dārguma lāde un ugunskura liesmas (Godot tās animē)
        if (W.chest) { if (W.chest.lid) W.chest.lid.name = 'chestLid'; if (W.chest.coins) W.chest.coins.name = 'chestCoins'; }
        (W.flames || []).forEach((f, i) => { f.name = 'flame:' + i; }); if (W.fireGlow) W.fireGlow.name = 'fireGlow';
        // sētas mājiņas: jumts un sienas (Godot tos paslēpj / padara caurspīdīgus, kad esi iekšā)
        for (const b of W.yardBuildings || []) {
          b.roof.name = 'yardRoof:' + b.slot;
          root.traverse((o) => { if (o.isMesh && o.material === b.wallMat) o.name = 'yardWalls:' + b.slot; });
        }
      }
      const d = X.dump.dumpObject(root, { meta: { land } });
      return X.dump.packDump(d);
    }, land);
  }
}
if (what === 'wildlife') {
  await patchedModule(page, 'wildlife', 'frogGeo, duckGeo, wingGeo, wingTex');
  await save('asset/wildlife', async () => {
    const W = PM.wildlife, T = X.THREE, A = X.A;
    const g = new T.Group();
    const add = (n, geo, mat) => { const m = new T.Mesh(geo, mat); m.name = n; g.add(m); };
    add('varde', W.frogGeo(), A.toyMaterial()); add('pile', W.duckGeo(), A.toyMaterial());
    add('wing', W.wingGeo(), new T.MeshStandardMaterial({ map: W.wingTex(), side: T.DoubleSide, roughness: 0.8, alphaTest: 0.5 }));
    return X.dump.packDump(X.dump.dumpObject(g));
  });
}
if (what === 'assets') {
  await page.evaluate(async () => { window.AL = (await import('/tools/export/assets.js?' + Date.now())).assetList(X); });
  const names = await page.evaluate(() => AL.map((a) => a[0]));
  for (const n of names) {
    if (only.length && !only.some((o) => n === o || (o.endsWith('*') && n.startsWith(o.slice(0, -1))))) continue;
    await save('asset/' + n, async (n) => {
      const r = AL.find((a) => a[0] === n)[1]();
      const res = await r;
      const d = X.dump.dumpObject(res.root, { meta: res.meta || null, extra: res.extra || null });
      return X.dump.packDump(d);
    }, n);
  }
}
if (what === 'consts') {
  const r = await page.evaluate(async () => {
    const v = (document.querySelector('script[src*="main.js"]') || {}).src.split('v=')[1];
    const mods = ['data', 'world', 'zones', 'vehicles', 'bus', 'trail', 'winter', 'garden', 'farm', 'activities', 'racetrack', 'props', 'places', 'quality', 'audio', 'assets', 'icons', 'market', 'farmyard', 'wildlife', 'bugspot', 'save', 'version', 'util', 'characters', 'net', 'controls', 'sound', 'ui', 'game', 'main', 'gfx', 'instancing', 'noise'];
    const out = {}, errs = [];
    for (const m of mods) {
      try {
        const M = await import(`/js/${m}.js?v=${v}`);
        const d = X.dump.dumpData(M, { depth: 8 });
        if (d.bin.length) errs.push(m + ': bināri dati izlaisti');
        out[m] = d.json.data;
      } catch (e) { errs.push(m + ': ' + e.message); }
    }
    return { json: JSON.stringify(out), errs };
  });
  writeFileSync(resolve(HERE, '../../godot/data/consts.json'), r.json);
  console.log('konstantes', (r.json.length / 1024).toFixed(0), 'KB', r.errs);
}
if (what === 'icons') {
  const r = await page.evaluate(async () => {
    const v = X.v, I = await import('/js/icons.js?v=' + v), D = X.data;
    const keys = new Set(['rod', 'coin', 'cepta', 'nothing']);
    for (const k of Object.keys(D.CROPS)) { keys.add(k); keys.add(k + '_seed'); }
    for (const k of Object.keys(D.TREES)) keys.add(k + '_sap');
    for (const k of Object.keys(D.FRUITS)) keys.add(k);
    for (const k of Object.keys(D.MUSHROOMS)) keys.add(k);
    for (const k of Object.keys(D.BERRIES)) keys.add(k);
    for (const k of Object.keys(D.FISH)) { keys.add('fish:' + k); keys.add(k); }
    for (const k of Object.keys(D.HATS)) keys.add('hat:' + k);
    for (const k of Object.keys(D.CLOTHES)) keys.add('cl:' + k);
    for (const k of Object.keys(D.DECOR)) { keys.add('decor:' + k); keys.add('d_' + k); }
    for (const k of Object.keys(D.PETS)) keys.add('pet:' + k);
    const out = {};
    for (const k of keys) { try { out[k] = I.icon(k); } catch (e) { /* */ } }
    out['@parking'] = I.parkingSvg(); if (I.busStopSvg) out['@busstop'] = I.busStopSvg();
    for (const k of Object.keys(D.FISH)) { try { out['@fishSvg:' + k] = I.fishSvg(k); } catch (e) { /* */ } }
    return JSON.stringify(out);
  });
  writeFileSync(resolve(HERE, '../../godot/data/icons.json'), r);
  console.log('ikonas', (r.length / 1024).toFixed(0), 'KB');
}
if (what === 'maps') {
  mkdirSync(resolve(HERE, '../../godot/data/maps'), { recursive: true });
  const r = await page.evaluate(async () => {
    const g = __game, v = X.v;
    const W = await import('/js/winter.js?v=' + v), T = await import('/js/trail.js?v=' + v);
    const out = {};
    const png = (c) => c.toDataURL('image/png').split(',')[1];
    out.e = png(g.mapBase(g.world)); out.c = png(g.mapBase(g.farmW)); out.w = png(g.mapBase(g.raceW));
    out.e_hi = png(g.mapBase(g.world, 560)); out.c_hi = png(g.mapBase(g.farmW, 560)); out.w_hi = png(g.mapBase(g.raceW, 560));
    out.n = png(W.winterMap()); out.s = png(T.trailMap());
    return out;
  });
  for (const [k, b64] of Object.entries(r)) writeFileSync(resolve(HERE, `../../godot/data/maps/${k}.png`), Buffer.from(b64, 'base64'));
  console.log('kartes', Object.keys(r));
}
// moduļa iekšējie dati: ielādē moduļa kopiju ar papildu export (relatīvie importi → tie paši absolūtie URL)
async function patchedModule(page, mod, extra) {
  return page.evaluate(async ({ mod, extra }) => {
    const src = await (await fetch(`/js/${mod}.js?v=${X.v}`)).text();
    const fixed = src.replace(/from '\.\/([a-z_]+)\.js\?v=[^']*'/g, (m, n) => `from '${location.origin}/js/${n}.js?v=${X.v}'`) + `\nexport { ${extra} };`;
    const url = URL.createObjectURL(new Blob([fixed], { type: 'text/javascript' }));
    window.PM = window.PM || {};
    window.PM[mod] = await import(url);
    return Object.keys(window.PM[mod]).length;
  }, { mod, extra });
}
if (what === 'busdata') {
  await patchedModule(page, 'bus', 'route, EVENTS, BUS_STOPS as STOPS2');
  const r = await page.evaluate(() => {
    const B = PM.bus, R = B.route, E = B.EVENTS;
    const ev = E.ev.map((e) => e.kind === 'dwell' ? { kind: 'dwell', t0: e.t0, t1: e.t1, stop: e.stop } : { kind: 'move', t0: e.t0, t1: e.t1, from: e.from, to: e.to, ia: e.m.ia, N: e.m.N, T: e.m.T, t: Array.from(e.m.t) });
    return JSON.stringify({ X: Array.from(R.X), Z: Array.from(R.Z), H: Array.from(R.H), n: R.n, step: R.step, len: R.len, P: E.P, ev, stops: B.STOPS2 });
  });
  writeFileSync(resolve(HERE, '../../godot/data/bus.json'), r);
  console.log('autobuss', (r.length / 1024).toFixed(0), 'KB');
}
if (what === 'winterdata') {
  const r = await page.evaluate(async () => {
    const W = new X.winter.WinterZone('n', true); await W.build(new X.THREE.Group());
    const colliders = []; for (const [, l] of W.grid) for (const c of l) colliders.push(c);
    const L = W.lift, cable = []; for (let s = 0; s <= L.len + 0.001; s += 0.5) cable.push(+L.cable(s).toFixed(4));
    const roads = X.winter.winterRoads().map((l) => l.map((p) => [p.x, p.z]));
    const out = {
      heights: Array.from(W.heights), colliders, obstacles: W.obstacles, targets: W.targets.map((t) => ({ x: t.x, y: t.y, z: t.z })),
      lift: { len: L.len, cB: L.cB, cT: L.cT, total: L.total, hB: L.hB, hT: L.hT, cable },
      deer: W.deer.map((d) => d.home), skiers: W.skiers.map((s) => ({ px: s.px, pz: s.pz, pt: s.pt, tDown: s.tDown, tLift: s.tLift, cycle: s.cycle, off: s.off })),
      roads,
    };
    return JSON.stringify(out);
  });
  writeFileSync(resolve(HERE, '../../godot/web/data/winter.json'), r);
  console.log('ziema', (r.length / 1024).toFixed(0), 'KB');
}
if (what === 'traildata') {
  await patchedModule(page, 'trail', 'X0, Z0, CELL, NX, NZ, BRIDGE, BZ, BOG, TRAIL_HW, TUN_W, TUN_H, BW_HW, BW_Y, OB_HALF, SEA_LIMIT, ITEM_SCALE, sectZ, CARRY_MS, FAIL_MS');
  const r = await page.evaluate(async () => {
    const M = PM.trail, T = X.trail;
    const Z = new M.TrailZone('s', __game); await Z.build(new X.THREE.Group());
    const colliders = []; for (const [, l] of Z.grid) for (const c of l) colliders.push(c);
    const lay = M.trailLayout();
    const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'idx' || k === 'hidx' || k === 'nearSet' ? undefined : v)));
    // trokšņa funkcijas → režģi (4 m)
    const G = { x0: -320, z0: -320, step: 4, nx: 161, nz: 319 }, sz = [], fo = [], mo = [];
    for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) { const x = G.x0 + i * G.step, z = G.z0 + j * G.step; sz.push(+(M.sectZ(x, z) - z).toFixed(3)); fo.push(+M.forestAt(x, z).toFixed(3)); mo.push(+M.mountAt(x, z).toFixed(3)); }
    return JSON.stringify({
      heights: Array.from(Z.heights), X0: M.X0, Z0: M.Z0, CELL: M.CELL, NX: M.NX, NZ: M.NZ, colliders,
      lay: clean({ line: lay.line, stops: lay.stops, obst: lay.obst, tunnel: lay.tunnel, bwBox: lay.bwBox, stopI: lay.stopI, sectStart: lay.sectStart }),
      arrows: M.arrowSpots(), bridgeA: Z.bridgeA, bridgeB: Z.bridgeB,
      C: { BRIDGE: M.BRIDGE, BZ: M.BZ, BOG: M.BOG, TRAIL_HW: M.TRAIL_HW, TUN_W: M.TUN_W, TUN_H: M.TUN_H, BW_HW: M.BW_HW, BW_Y: M.BW_Y, OB_HALF: M.OB_HALF, SEA_LIMIT: M.SEA_LIMIT, ITEM_SCALE: M.ITEM_SCALE, CARRY_MS: M.CARRY_MS, FAIL_MS: M.FAIL_MS },
      grid: G, sectDz: sz, forest: fo, mount: mo,
    });
  });
  writeFileSync(resolve(HERE, '../../godot/web/data/trail.json'), r);
  console.log('taka', (r.length / 1024).toFixed(0), 'KB');
}
if (what === 'data') {
  const lands = only.length ? only : ['forest', 'farm', 'race'];
  for (const land of lands) {
    console.log('dati', land);
    await save('data/' + land, async (land) => {
      const { World } = X.world, { WORLD_SEED } = X.data, Z = X.zones;
      const zone = land === 'forest' ? Z.FOREST : land === 'race' ? Z.RACE : Z.FARM;
      const seed = land === 'forest' ? WORLD_SEED : land === 'race' ? WORLD_SEED + 2000 : WORLD_SEED + 1000;
      const W = new World(seed, zone);
      const root = new X.THREE.Group();
      W.build(root, __game.renderer);
      // sadursmju režģis → saraksts
      const colliders = []; for (const [, l] of W.grid) for (const c of l) colliders.push(c);
      // zāles lauka augstumu tekstūra (pusfloat → float32)
      const hd = W.heightTex.image.data, gH = new Float32Array(hd.length);
      for (let i = 0; i < hd.length; i++) gH[i] = X.THREE.DataUtils.fromHalfFloat(hd[i]);
      const extra = { colliders, roadPts: W.roadLines, grassH: gH };
      const d = X.dump.dumpData(Object.assign(W, { _extra: extra }), { skipKeys: ['group', 'grid', 'renderer', 'noise', 'noise2', 'rnd', 'roadIdx', 'roadIdxWide', 'trackIdx', 'terrLod', 'lodChunks', '_pal'] });
      return X.dump.packDump(d);
    }, land);
  }
  // zāles stiebru faktūra
  const png = await page.evaluate(async () => { const u = await import('/js/util.js'); return u.grassTexture().image.toDataURL('image/png'); });
  writeFileSync(resolve(HERE, '../../godot/assets/tex/grass_blades.png'), Buffer.from(png.split(',')[1], 'base64'));
}
await browser.close();

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
      if (land === 'winter') { const W = new X.winter.WinterZone('n', true); await W.build(root); window.LAST = W; }
      else if (land === 'trail') { const W = new X.trail.TrailZone('s', g); await W.build(root); window.LAST = W; }
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
      const extra = { colliders, roadPts: W.roadLines };
      const d = X.dump.dumpData(Object.assign(W, { _extra: extra }), { skipKeys: ['group', 'grid', 'renderer', 'noise', 'noise2', 'rnd', 'roadIdx', 'roadIdxWide', 'trackIdx', 'terrLod', 'lodChunks', '_pal'] });
      return X.dump.packDump(d);
    }, land);
  }
}
await browser.close();

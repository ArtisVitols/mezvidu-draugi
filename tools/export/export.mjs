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
  const lands = only.length ? only : ['forest', 'race'];
  for (const land of lands) {
    console.log('zeme', land);
    await save('land_' + land, async (land) => {
      const { World } = X.world, { WORLD_SEED } = X.data, Z = X.zones;
      const g = __game;
      const zone = land === 'forest' ? Z.FOREST : land === 'race' ? Z.RACE : Z.FARM;
      const seed = land === 'forest' ? WORLD_SEED : land === 'race' ? WORLD_SEED + 2000 : WORLD_SEED + 1000;
      const W = new World(seed, zone);
      const root = new X.THREE.Group();
      W.build(root, g.renderer);
      const d = X.dump.dumpObject(root, { meta: { land } });
      return X.dump.packDump(d);
    }, land);
  }
}
await browser.close();

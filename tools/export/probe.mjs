import { launch, soloGame, goZone } from './common.mjs';
const b = await launch(); const page = await soloGame(b);
for (const z of ['c', 'e', 'w', 'n', 's']) {
  await goZone(page, z);
  const info = await page.evaluate(() => {
    const g = __game, out = [];
    const desc = (o, d, max) => {
      let tris = 0, n = 0; o.traverse((x) => { n++; if (x.geometry && x.geometry.index) tris += x.geometry.index.count / 3 * (x.isInstancedMesh ? x.count : 1); });
      out.push(' '.repeat(d * 2) + `${o.type} "${o.name}" ch=${o.children.length} nodes=${n} tris=${Math.round(tris)}${o.isInstancedMesh ? ' inst=' + o.count : ''}${o.visible ? '' : ' HIDDEN'}`);
      if (d < max) for (const c of o.children.slice(0, 40)) desc(c, d + 1, max);
    };
    desc(g.stage, 0, 2);
    return out.join('\n');
  });
  console.log('==== ZONE', z, '\n' + info);
}
await b.close();

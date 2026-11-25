// Aktīvu saraksts eksportam (darbojas lapā): ASSET_LIST() → [[vārds, () => {root, extra?, meta?}]]
// Krāsu varianti: viens pilns modelis + varianta virsotņu krāsas (extra 'c:<variants>:<sieta nr.>').
export function assetList(X) {
  const { A } = X, THREE = X.THREE;
  const L = [];
  const add = (n, f) => L.push([n, f]);
  const meshes = (root) => { const out = []; root.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes.color && o.name !== 'shadow') out.push(o); }); return out; };
  // variants: {vārds: saknes objekts}; virsotņu skaitam jāsakrīt
  const colorExtra = (base, variants) => {
    const bm = meshes(base), extra = {}, bad = [];
    for (const [vn, vr] of Object.entries(variants)) {
      const vm = meshes(vr);
      vm.forEach((m, i) => {
        const c = m.geometry.attributes.color.array;
        if (!bm[i] || bm[i].geometry.attributes.color.array.length !== c.length) { bad.push(vn + '#' + i); return; }
        extra[`c:${vn}:${i}`] = new Float32Array(c);
      });
    }
    return { extra, bad };
  };
  // vecā modeļa kauliem nav vārdu — iedodam (Godot Avatar meklē pēc vārda)
  const nameRig = (av) => {
    const nm = (o, n) => { if (o && !o.name) o.name = n; else if (o) o.name = n; };
    nm(av.body, 'body'); nm(av.spine, 'spine'); nm(av.head, 'head'); nm(av.tail, 'tail'); nm(av.hatHolder, 'hatHolder');
    (av.legs || []).forEach((l, i) => { nm(l.hip, i ? 'hipL' : 'hipR'); nm(l.knee, i ? 'kneeL' : 'kneeR'); });
    (av.arms || []).forEach((a, i) => { nm(a.sh, i ? 'shL' : 'shR'); nm(a.el, i ? 'elL' : 'elR'); });
    if (av.shadow) av.shadow.name = 'shadow';
  };
  const named = (av) => { av.hatHolder && (av.hatHolder.name = 'hatHolder'); return av.root; };
  // ---- spēlētāju un takas dzīvnieki (jaunais modelis) ----
  for (const sp of Object.keys(A.SPECIES)) {
    add('an_' + sp, () => {
      const mk = (fur, shirt, top) => A.buildAnimal({ animal: sp, fur, shirt, wear: top ? { top } : null });
      const base = mk('#000000', '#000000', null);
      const vars = { f: named(mk('#ffffff', '#000000', null)), s: named(mk('#000000', '#ffffff', null)) };
      const { extra, bad } = colorExtra(base.root, vars);
      const P = A.SPECIES[sp];
      return { root: named(base), extra, meta: { species: sp, bulk: base.bulk, eyeAt: base.eyeAt ? [base.eyeAt.x, base.eyeAt.y, base.eyeAt.z] : null, bird: !!P.bird, feet: P.feet || 1, fur: P.fur, bad, spec: JSON.parse(JSON.stringify(P, (k, v) => (typeof v === 'function' ? undefined : v))) } };
    });
    // krekli ar rakstu: cits modelis (apkakle u.c.) — katram savs fails ar kažoka variantu
    if (!A.SPECIES[sp].bird) for (const t of Object.keys(A.TOPS)) add('an_' + sp + '_' + t, () => {
      const base = A.buildAnimal({ animal: sp, fur: '#000000', shirt: '#000000', wear: { top: t } });
      const { extra, bad } = colorExtra(base.root, { f: named(A.buildAnimal({ animal: sp, fur: '#ffffff', shirt: '#000000', wear: { top: t } })) });
      return { root: named(base), extra, meta: { species: sp, top: t, bad } };
    });
    // valkājamās lietas šai sugai: bērni ar vārdu '<slot>:<id>:<kauls>'
    add('wear_' + sp, () => {
      const pack = new THREE.Group();
      const W = A.WEAR || {};
      const ids = { glasses: [], neck: [], back: [], feet: [] };
      for (const [id, d] of Object.entries(X.data.CLOTHES)) if (ids[d.slot]) ids[d.slot].push(id);
      for (const [slot, list] of Object.entries(ids)) for (const id of list) {
        const av = A.buildAnimal({ animal: sp, fur: '#888888', shirt: '#888888', wear: { [slot]: id } });
        av.wearParts.forEach((g, i) => {
          const parent = g.parent ? g.parent.name : '';
          g.removeFromParent();
          g.name = `${slot}:${id}:${parent}:${i}`;
          pack.add(g);
        });
      }
      void W;
      return { root: pack };
    });
  }
  // ---- cepures (cepures telpa: vainaga rādiuss ≈ 0,25) ----
  add('hats', () => {
    const pack = new THREE.Group();
    for (const id of [...Object.keys(A.HATS), 'ziemas']) { try { const h = A.buildHat(id); if (h) { h.name = 'hat:' + id; pack.add(h); } } catch (e) { /* */ } }
    return { root: pack };
  });
  // ---- meža dzīvnieki (pieauguši un mazuļi) ----
  for (const t of Object.keys(A.NPCS)) {
    add('npc_' + t, () => ({ root: A.buildNPC(t).root, meta: { type: t } }));
    add('npcb_' + t, () => ({ root: A.buildNPC(t, { baby: true }).root, meta: { type: t, baby: true } }));
  }
  // ---- tirgus (būdas + karodziņi, kā game.buildVendors bez dzīvniekiem) ----
  add('market', async () => {
    const W = X.world, market = new THREE.Group();
    const M = await import('/js/market.js?v=' + X.v);
    for (const v of W.VENDORS) { const face = Math.atan2(-v.x, -v.z); const st = M.buildStall(v); st.position.set(v.x, W.VILLAGE_Y, v.z); st.rotation.y = face; market.add(st); }
    const top = (v, side) => { const f = Math.atan2(-v.x, -v.z), rx = Math.cos(f), rz = -Math.sin(f); return { x: v.x + rx * side * 1.75 + Math.sin(f) * 0.6, y: W.VILLAGE_Y + 2.9, z: v.z + rz * side * 1.75 + Math.cos(f) * 0.6 }; };
    const byAng = [...W.VENDORS].sort((p, q) => p.ang - q.ang);
    for (let i = 0; i + 1 < byAng.length; i++) { const p = byAng[i], q = byAng[i + 1]; if (q.ang - p.ang > 70) continue; market.add(M.buildBunting(top(p, 1), top(q, -1), 0.6)); }
    return { root: market };
  });
  // ---- pārdevēji (vecais modelis ūdram/āpsim/pūcei/bebram) ----
  add('vendors', async () => {
    const CH = await import('/js/characters.js?v=' + X.v);
    const pack = new THREE.Group();
    for (const v of X.world.VENDORS) {
      const av = CH.buildAnimal({ animal: v.animal, fur: v.fur, shirt: v.shirt, hat: v.id === 'hats' ? 'cilindrs' : v.id === 'seeds' ? 'salmu' : v.id === 'decor' ? 'vainags' : null });
      for (let k = 0; k < 30; k++) av.animate(0.05, 'idle', 0);
      nameRig(av); av.root.name = 'vendor:' + v.id; pack.add(av.root);
    }
    const ice = CH.buildAnimal({ animal: 'bebrs', fur: '#7a5230', shirt: '#ffffff', hat: null }); nameRig(ice); ice.root.name = 'vendor:ice'; pack.add(ice.root);
    return { root: pack };
  });
  add('icecart', async () => { const CH = await import('/js/characters.js?v=' + X.v); return { root: CH.buildCart('#ff8fb0', true) }; });
  // ---- mazie priekšmeti ----
  add('props', () => {
    const pack = new THREE.Group();
    const put = (n, o) => { if (!o) return; const r = o.root || o; r.name = n; pack.add(r); };
    for (const k of Object.keys(X.data.MUSHROOMS)) put('mush:' + k, A.buildMushroom(k));
    put('star', A.buildStar()); put('heart', A.buildHeart()); put('scroll', A.buildScroll());
    { const rod = A.buildRod(); const r = rod.root || rod; if (r.userData.tip) r.userData.tip.name = 'tip'; put('rod', rod); } put('bobber', A.buildBobber());
    for (const k of Object.keys(X.data.DECOR)) put('decor:' + k, A.buildDecor(k));
    for (const k of Object.keys(X.data.BERRIES)) put('berry:' + k, A.buildBerryBush(k));
    return { root: pack };
  });
  for (const kc of X.data.KART_COLORS) add('kart_' + kc.id, () => ({ root: A.buildKart(kc.color).root }));
  add('crops', () => {
    const pack = new THREE.Group();
    for (const c of Object.keys(X.data.CROPS)) for (const st of [0, 1, 2]) { const g = A.buildCrop(c, st); g.name = `crop:${c}:${st}`; pack.add(g); }
    return { root: pack };
  });
  add('fruittrees', () => {
    const pack = new THREE.Group();
    for (const t of Object.keys(X.data.TREES)) for (const st of [0, 1, 2]) for (const fr of (st === 2 ? [false, true] : [false])) {
      const g = A.buildFruitTree(t, st, fr); const r = g.root || g; r.name = `tree:${t}:${st}:${fr ? 1 : 0}`; pack.add(r);
    }
    return { root: pack };
  });
  // ---- kopīgie transporti (katram savs modelis/krāsa) + autobuss ----
  const vehMeta = (o) => {
    (o.seats || []).forEach((x, i) => { x.name = 'seat:' + i; });
    (o.petSpots || []).forEach((x, i) => { x.name = 'pet:' + i; });
    if (o.seat && !o.seats) o.seat.name = 'seat:0';
    if (o.shadow) o.shadow.name = 'shadow';
    return { kind: o.kind, wheelR: o.wheelR || 1, pedal: o.pedal || null, seats: (o.seats || [o.seat]).length };
  };
  add('vehicles', async () => {
    const V = await import('/js/vehicles.js?v=' + X.v);
    const pack = new THREE.Group(), meta = {};
    for (const d of V.VEHICLES) {
      const o = d.kind === 'car' ? V.buildCar(d.color) : d.kind === 'bike' ? V.buildBike(d.color) : d.kind === 'boat' ? V.buildBoat(d.color) : V.buildSled(d.color);
      meta[d.id] = vehMeta(o);
      o.root.name = 'veh:' + d.id; pack.add(o.root);
    }
    return { root: pack, meta };
  });
  add('bus', async () => {
    const B = await import('/js/bus.js?v=' + X.v);
    const o = B.buildBus();
    const meta = vehMeta(o);
    for (const k of Object.keys(o)) if (o[k] && o[k].isObject3D && !o[k].name) o[k].name = k;
    meta.keys = Object.keys(o).filter((k) => o[k] && o[k].isObject3D).map((k) => [k, o[k].name]);
    return { root: o.root, meta };
  });
  add('busstops', async () => {
    const B = await import('/js/bus.js?v=' + X.v);
    const pack = new THREE.Group();
    B.BUS_STOPS.forEach((s, i) => { const g = B.buildStop(s); g.name = 'stop:' + i; pack.add(g); });
    return { root: pack };
  });
  add('chair', async () => { const Wm = X.winter; const m = new THREE.Mesh(Wm.chairGeometry(), Wm.chairMaterial()); const g = new THREE.Group(); g.add(m); return { root: g }; });
  add('trailitems', async () => {
    const pack = new THREE.Group();
    for (const k of ['malka', 'rieksti', 'zivs', 'abols', 'delis', 'gliemezis']) { const o = X.trail.trailItem(k).clone(); o.name = 'item:' + k; pack.add(o); }
    return { root: pack };
  });
  // ---- sētas nocērtamie koki, akmeņi, krūmi (kā Farm.buildFarm tpl) ----
  add('plottpl', () => {
    const W = new X.world.World(X.data.WORLD_SEED + 1000, X.zones.FARM);
    W.build(new THREE.Group());
    const pack = new THREE.Group();
    const tpl = (kind) => {
      const g = new THREE.Group();
      const addm = (geo, m, cast = true) => { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = true; g.add(o); };
      const t = W.treeTypes.find((x) => x[0] === kind);
      if (t) { addm(t[1], t[2]); addm(t[3], t[4]); g.children.forEach((o) => { o.position.y = -0.15; }); }
      else if (kind === 'bush') addm(W.bushParts[0], W.bushParts[1], false);
      else { addm(W.rockParts[0], W.rockParts[1]); g.children[0].scale.set(1, 1, 0.9); }
      return g;
    };
    const kinds = new Set(W.plotObjs.map((o) => o.kind));
    for (const k of kinds) { const g = tpl(k); g.name = 'plot:' + k; pack.add(g); }
    return { root: pack };
  });
  return L;
}

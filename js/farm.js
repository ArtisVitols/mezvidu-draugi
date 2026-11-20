// 🏡 Sēta (centra zeme): katram spēlētājam savs lauks (ceturtdaļa sētas starp ceļiem un meža joslu).
// Savā laukā var nocirst kokus / novākt akmeņus, uzart 2,5 m lauciņus, iesēt, aplaistīt un novākt ražu.
// Blakus lauciņi ar to pašu kultūru izskatās kā viens vienmērīgs lauks (augi vienā režģī),
// dažādām kultūrām starp lauciņiem paliek neliela sprauga. Augšana iet pēc pulksteņa (arī tad, kad spēle aizvērta).
// Farm — Game papildinājums (mixin).
import * as THREE from 'three';
import { World, TILE, plotOf, tileToSlot, tileToCanon, gardenTile, gateSpots, rotPlot, rotPlotY, yardPart, YARD } from './world.js?v=1.37.0';
import { buildCrop, flattenStatic } from './characters.js?v=1.37.0';
import { buildFruitTree, buildDecor } from './props.js?v=1.37.0';
import { WORLD_SEED, CROPS, TREES, FRUITS, DECOR } from './data.js?v=1.37.0';
import { InstanceField } from './instancing.js?v=1.37.0';
import { canvasTexture, makeSignBoard } from './util.js?v=1.37.0';
import { $, toast, sfx, fmtTime } from './ui.js?v=1.37.0';
import { inLand, cropXp, fruitXp, XP } from './garden.js?v=1.37.0';
import { ZONES, FARM, freeGpu } from './zones.js?v=1.37.0';

const CROP_IDS = Object.keys(CROPS);
const TREE_IDS = Object.keys(TREES); // skatā koks ir kods 100 + nr.
const MAX_TILES = 400;
const GRAINS = new Set(['auzas', 'kviesi']);
const HITS = { tree: 3, rock: 2, bush: 1 };
const OBJ_NAME = { ozols: 'ozolu', berzs: 'bērzu', egle: 'egli', priede: 'priedi', rock: 'akmeni', bush: 'krūmu' };
const tkey = (ix, iz) => ix + ',' + iz;
// deterministisks "nejaušais" skaitlis augu nobīdei (visiem vienāds)
const hash = (a, b) => { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); };
// punkts sētā slot → 0. sētas (kanoniskās) koordinātes (pretēji rotPlot)
export function canonPt(x, z, slot) { for (let k = [0, 1, 3, 2][slot]; k > 0; k--) [x, z] = [z, -x]; return [x, z]; }

export const Farm = {
  // ---------- uzbūve / ielāde ----------
  *buildFarm() {
    const W = this.farmW = new World(WORLD_SEED + 1000, FARM);
    yield;
    this.farmScene = new THREE.Group();
    yield* W.buildSteps(this.farmScene, this.renderer);
    yield;
    if (this.Q) this.applyWorldQuality(W);
    // nocērtamie koki, akmeņi un krūmi laukos
    const tpl = (kind) => {
      const g = new THREE.Group();
      const add = (geo, m, cast = true) => { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = true; g.add(o); };
      const t = W.treeTypes.find((x) => x[0] === kind);
      if (t) { add(t[1], t[2]); add(t[3], t[4]); g.children.forEach((o) => { o.position.y = -0.15; }); }
      else if (kind === 'bush') add(W.bushParts[0], W.bushParts[1], false);
      else { add(W.rockParts[0], W.rockParts[1]); g.children[0].scale.set(1, 1, 0.9); }
      return g;
    };
    this.plotField = new InstanceField(W.plotObjs.map((o) => ({ id: o.id, kind: o.kind, x: o.x, y: o.type === 'rock' ? o.y - o.s * 0.12 : o.y, z: o.z, ry: o.ry, s: o.s })), tpl, { chunk: 64, view: 230 });
    this.plotField.build(this.farmScene);
    this.objById = new Map(W.plotObjs.map((o) => [o.id, o]));
    this.objHits = {};
    // uzartā zeme: brūna, ar vagām (pasaules koordinātēs — blakus lauciņi saplūst)
    const soilTex = canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#6e5440'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { const l = 60 + Math.random() * 110; g.fillStyle = `rgba(${l},${l * 0.8 | 0},${l * 0.6 | 0},0.6)`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2); }
      for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(30,18,8,0.4)'; g.fillRect(0, y, w, 4); g.fillStyle = 'rgba(255,225,190,0.08)'; g.fillRect(0, y + 7, w, 5); }
    });
    soilTex.wrapS = soilTex.wrapT = THREE.RepeatWrapping;
    this.soilMat = new THREE.MeshStandardMaterial({ map: soilTex, vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    // izvēlētā lauciņa rāmis
    const hl = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3)), new THREE.LineBasicMaterial({ color: '#ffe14a' }));
    hl.visible = false; hl.frustumCulled = false;
    this.farmScene.add(hl);
    this.tileHL = hl;
    this.farmViews = [null, null, null, null];
    this.farmRen = [0, 1, 2, 3].map(() => ({ key: null, soil: null, plants: new Map(), growing: false, t: 0 }));
    this.cropTpl = {};
    this.gardenSigns = [];
    this.gardenSignNames = [];
    this.farmOn = false;
    this.fixFarm();
  },

  // Saglabājums glabā lauku „0. lauka” koordinātēs (v: 2) — tas parādās tajā laukā, kuru istabā iedala.
  // Vecie saglabājumi (pasaules koordinātes) tiek pārrēķināti; lauciņi, kas vairs nav lauka iekšpusē
  // (piem., uz jaunā līkumotā ceļa), tiek noņemti un raža / sēklas atdotas somā.
  fixFarm() {
    const f = this.save.farm;
    const parse = (k) => k.split(',').map(Number);
    if (!(f.v >= 2)) {
      const cnt = [0, 0, 0, 0];
      for (const k in f.t) { const [ix, iz] = parse(k), s = plotOf((ix + 0.5) * TILE, (iz + 0.5) * TILE); if (s >= 0) cnt[s]++; }
      const from = cnt.indexOf(Math.max(...cnt));
      const t = {};
      for (const k in f.t) { const [ix, iz] = parse(k), [a, b] = tileToCanon(ix, iz, from); t[tkey(a, b)] = f.t[k]; }
      f.t = t;
      f.cl = [...new Set(f.cl.map((id) => id % 100))];
      f.v = 2;
    }
    // 1.20.0: sētas pārbūvētas (mazāks dārzs 20×20, citi novācamie objekti) — nocirstie objekti sākas no jauna
    let rebuilt = false;
    if (f.v === 2) { f.cl = []; f.v = 3; rebuilt = true; }
    let lost = 0, items = 0;
    for (const k in f.t) {
      const [ix, iz] = parse(k);
      if (this.tileOk(ix, iz, 0)) continue;
      const v = f.t[k];
      if (v.tr && TREES[v.tr]) { this.addItem(v.tr + '_sap'); items++; }
      else if (v.c && CROPS[v.c]) {
        if (this.cropProgress(v) >= 1) { this.addItem(v.c, CROPS[v.c].yield); items += CROPS[v.c].yield; } else { this.addItem(v.c + '_seed'); items++; }
      }
      delete f.t[k]; lost++;
    }
    if (lost) setTimeout(() => toast(rebuilt ? `🏡 Sēta pārbūvēta! ${lost} lauciņi bija ārpus jaunā dārza — tos noņēmām${items ? `, raža un sēklas ir tavā somā 🎒` : ''}.`
      : `🛣️ ${lost} lauciņi bija ārpus dārza — tos noņēmām${items ? `, raža un sēklas ir tavā somā 🎒` : ''}.`, 'good', 7000), 7000);
  },

  // vai lauciņš (ix, iz) ir sētas slot dārzā (20 × 20 lauciņi)
  tileOk(ix, iz, slot) {
    const [a, b] = tileToCanon(ix, iz, slot);
    return gardenTile(a, b);
  },

  // mana lauka lauciņa atslēga saglabājumā (pasaules lauciņš → 0. lauka koordinātes)
  ckey(key) {
    const [ix, iz] = key.split(',').map(Number), [a, b] = tileToCanon(ix, iz, this.mySlot);
    return tkey(a, b);
  },

  loadFarm() {
    this.stage.add(this.farmScene);
    this.farmOn = true;
    this.terr = this.farmW;
    for (let s = 0; s < 4; s++) { this.farmRen[s].key = null; this.setGardenSign(s, null); }
    for (const [, prof] of this.profiles) {
      this.setGardenSign(prof.slot, prof.name);
      this.renderDecor(prof.slot, prof.decor);
    }
    this.syncFarmViews();
    this.renderLandBorder();
    this.timers.vis = 0;
    return Promise.resolve();
  },

  unloadFarm() {
    if (!this.farmOn) return;
    this.farmOn = false;
    this.stage.remove(this.farmScene);
    freeGpu(this.farmScene, [this.farmW.heightTex, this.farmW.groundTex]);
  },

  // ---------- mans lauks: saglabājums un skats draugiem ----------
  // save.farm = { t: { "ix,iz": { c, at, w } }, cl: [nocirsto objektu id] }; at — sēšanas laiks (s, kopējais pulkstenis)
  farmView() {
    const f = this.save.farm, t = [];
    for (const k in f.t) {
      const [ix, iz] = k.split(',').map(Number), v = f.t[k];
      if (v.tr) t.push([ix, iz, 100 + TREE_IDS.indexOf(v.tr), v.at, v.w ? 1 : 0, v.pk || 0]);
      else t.push(v.c ? [ix, iz, CROP_IDS.indexOf(v.c), v.at, v.w ? 1 : 0] : [ix, iz]);
    }
    return { t, cl: f.cl.slice() };
  },

  farmChanged() { this.farmDirty = true; this.renderFarm(this.mySlot, this.farmView()); },

  // visu profilu lauki → zīmējumi (izsauc pēc ielādes un profilu maiņas)
  syncFarmViews() {
    const seen = new Set();
    for (const [, prof] of this.profiles) { seen.add(prof.slot); this.renderFarm(prof.slot, prof.farm || null); }
    for (let s = 0; s < 4; s++) if (!seen.has(s)) this.renderFarm(s, null);
  },

  renderFarm(slot, view) {
    if (slot == null || slot < 0 || slot > 3 || !this.farmViews) return;
    // skats ir 0. lauka koordinātēs → pagriežam uz šo lauku; nocirsto objektu nr. → šī lauka id
    if (view) view = {
      t: view.t.map((e) => { const [a, b] = tileToSlot(e[0], e[1], slot); return [a, b, ...e.slice(2)]; }),
      cl: (view.cl || []).map((id) => slot * 100 + (id % 100)),
    };
    this.farmViews[slot] = view;
    this.farmRen[slot].key = null; // pārzīmēs updateFarm
    this.farmClearedDirty = true;
  },

  // ---------- kadrs ----------
  updateFarm(dt) {
    if (!this.farmOn) return;
    const t = this.now();
    if (this.farmClearedDirty) {
      this.farmClearedDirty = false;
      const cl = new Set();
      this.farmViews.forEach((v, s) => {
        if (!v) return;
        for (const id of v.cl) cl.add(id);
        // koks vai akmens, kas stāv uz uzarta lauciņa (piem., no vecāka saglabājuma), arī pazūd
        const tiles = new Set(v.t.map((e) => tkey(e[0], e[1])));
        if (tiles.size) for (const o of this.farmW.plotObjs) {
          if (o.slot !== s || cl.has(o.id)) continue;
          const r = Math.max(0.5, o.r);
          for (const [dx, dz] of [[0, 0], [-r, -r], [r, -r], [-r, r], [r, r]]) {
            if (tiles.has(tkey(Math.floor((o.x + dx) / TILE), Math.floor((o.z + dz) / TILE)))) { cl.add(o.id); break; }
          }
        }
      });
      this.farmW.cleared = cl;
      for (const o of this.farmW.plotObjs) this.plotField.setHidden(o.id, cl.has(o.id));
    }
    this.timers.farmVis = (this.timers.farmVis || 0) - dt;
    if (this.timers.farmVis <= 0) { this.timers.farmVis = 0.4; this.plotField.update(this.me.pos.x, this.me.pos.z); }
    let holes = false;
    for (let s = 0; s < 4; s++) {
      const R = this.farmRen[s], v = this.farmViews[s];
      const key = v ? JSON.stringify(v.t) : '';
      if (R.key !== key) { R.key = key; this.buildSoil(s, v); this.buildPlants(s, v, t); holes = true; continue; }
      // augi aug — pārzīmējam ik pa brīdim (mērogs un stadija)
      R.t -= dt;
      if (R.growing && R.t <= 0) this.buildPlants(s, v, t);
    }
    if (holes) {
      const all = [];
      this.farmViews.forEach((v) => { if (v) for (const e of v.t) all.push(e); });
      this.farmW.setGrassHoles(all);
    }
    this.updateTileHL();
    this.updateYardHouses();
  },

  // lauciņš zem spēlētāja un vai tas pieder kādam laukam
  tileAt(x, z) {
    const ix = Math.floor(x / TILE), iz = Math.floor(z / TILE);
    const cx = (ix + 0.5) * TILE, cz = (iz + 0.5) * TILE;
    const slot = plotOf(cx, cz);
    if (slot < 0 || !this.tileOk(ix, iz, slot)) return null;
    return { ix, iz, cx, cz, slot, key: tkey(ix, iz) };
  },

  updateTileHL() {
    const me = this.me, hl = this.tileHL;
    const tl = !me.veh && !me.ride && this.zone === FARM ? this.tileAt(me.pos.x, me.pos.z) : null;
    if (!tl || (tl.slot !== this.mySlot && !this.farmTile(tl.slot, tl.key))) { hl.visible = false; return; }
    if (hl.userData.key !== tl.key) {
      hl.userData.key = tl.key;
      const x0 = tl.ix * TILE, z0 = tl.iz * TILE, p = hl.geometry.attributes.position;
      const pts = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
      pts.forEach(([a, b], i) => { const x = x0 + a * TILE, z = z0 + b * TILE; p.setXYZ(i, x, this.farmW.getHeight(x, z) + 0.08, z); });
      p.needsUpdate = true;
      hl.geometry.computeBoundingSphere();
    }
    hl.material.color.set(tl.slot === this.mySlot ? '#ffe14a' : '#7fd0ff');
    hl.visible = true;
  },

  // lauciņa dati no skata (jebkuram laukam): null vai { c, at, w }
  farmTile(slot, key) {
    if (slot === this.mySlot) return this.save.farm.t[this.ckey(key)] || null;
    const v = this.farmViews[slot];
    if (!v) return null;
    for (const e of v.t) if (tkey(e[0], e[1]) === key) return e.length > 2 ? (e[2] >= 100 ? { tr: TREE_IDS[e[2] - 100], at: e[3], w: !!e[4], pk: e[5] || 0 } : { c: CROP_IDS[e[2]], at: e[3], w: !!e[4] }) : {};
    return null;
  },

  cropProgress(v, t = this.now()) {
    if (v.tr) return this.treeProgress(v, t);
    const def = CROPS[v.c];
    const dur = def.grow * (v.w ? 0.6 : 1);
    return Math.min(1, Math.max(0, (t / 1000 - v.at) / dur));
  },
  cropLeft(v, t = this.now()) { const def = v.tr ? TREES[v.tr] : CROPS[v.c]; return Math.max(0, v.at + def.grow * (v.w ? 0.6 : 1) - t / 1000); },
  // augļu koks: augšana līdz pieaugušam, tad augļi ik pēc `every` sekundēm
  treeProgress(v, t = this.now()) { const d = TREES[v.tr]; return Math.min(1, Math.max(0, (t / 1000 - v.at) / (d.grow * (v.w ? 0.6 : 1)))); },
  fruitAt(v) { const d = TREES[v.tr]; return v.pk ? v.pk + d.every : v.at + d.grow * (v.w ? 0.6 : 1); },
  fruitReady(v, t = this.now()) { return this.treeProgress(v, t) >= 1 && t / 1000 >= this.fruitAt(v); },

  // ---------- zīmēšana ----------
  buildSoil(slot, v) {
    const R = this.farmRen[slot];
    if (R.soil) { this.farmScene.remove(R.soil); R.soil.geometry.dispose(); R.soil = null; }
    if (!v || !v.t.length) return;
    const H = (x, z) => this.farmW.getHeight(x, z) + 0.035;
    const pos = [], uv = [], col = [], idx = [];
    for (const e of v.t) {
      const x0 = e[0] * TILE, z0 = e[1] * TILE, wet = e[4] ? 0.68 : 1, base = pos.length / 3;
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) {
        const x = x0 + i * TILE / 2, z = z0 + j * TILE / 2;
        pos.push(x, H(x, z), z); uv.push(x / TILE, z / TILE); col.push(wet, wet, wet);
      }
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const a = base + j * 3 + i; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.soilMat);
    m.receiveShadow = true;
    this.farmScene.add(m);
    R.soil = m;
  },

  cropParts(crop, stage) {
    const k = crop + stage;
    if (this.cropTpl[k]) return this.cropTpl[k];
    const tpl = buildCrop(crop, stage, CROPS[crop].color);
    tpl.updateMatrixWorld(true);
    const out = [];
    tpl.traverse((o) => { if (o.isMesh) out.push({ geo: o.geometry, mat: o.material, local: o.matrixWorld.clone() }); });
    this.cropTpl[k] = out;
    return out;
  },

  treeParts(tr, stage, fruit) {
    const k = 'T' + tr + stage + (fruit ? 'f' : '');
    if (this.cropTpl[k]) return this.cropTpl[k];
    const tpl = buildFruitTree(tr, stage, fruit);
    tpl.updateMatrixWorld(true);
    const out = [];
    tpl.traverse((o) => { if (o.isMesh) out.push({ geo: o.geometry, mat: o.material, local: o.matrixWorld.clone() }); });
    this.cropTpl[k] = out;
    return out;
  },

  // augi: katrai kultūrai un stadijai instancēti meši (katram laukam savi — redzamības pārbaudei)
  buildPlants(slot, v, t) {
    const R = this.farmRen[slot];
    R.growing = false; R.t = 4;
    const lists = new Map();
    if (v) {
      const map = new Map();
      for (const e of v.t) if (e.length > 2 && e[2] < 100) map.set(tkey(e[0], e[1]), CROP_IDS[e[2]]);
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
      for (const e of v.t) {
        if (e.length < 3) continue;
        if (e[2] >= 100) {
          // augļu koks lauciņa vidū
          const tr = TREE_IDS[e[2] - 100];
          if (!tr) continue;
          const tv = { tr, at: e[3], w: !!e[4], pk: e[5] || 0 };
          const p = this.treeProgress(tv, t), fr = this.fruitReady(tv, t);
          R.growing = true; // augļi nogatavojas ar laiku
          const stage = p < 0.35 ? 0 : p < 1 ? 1 : 2;
          const sc = stage === 0 ? 0.8 + p * 0.6 : stage === 1 ? 0.75 + 0.25 * p : 1;
          const key = 'T' + tr + stage + (fr ? 'f' : '');
          if (!lists.has(key)) lists.set(key, { crop: tr, stage, tree: true, fruit: fr, m: [] });
          const x = (e[0] + 0.5) * TILE, z = (e[1] + 0.5) * TILE;
          M.compose(P.set(x, this.farmW.getHeight(x, z) + 0.02, z), Q.setFromAxisAngle(UP, hash(x, z) * 6.28), S.set(sc, sc, sc));
          lists.get(key).m.push(M.clone());
          continue;
        }
        const crop = CROP_IDS[e[2]], def = CROPS[crop];
        if (!def) continue;
        const p = this.cropProgress({ c: crop, at: e[3], w: !!e[4] }, t);
        if (p < 1) R.growing = true;
        const stage = p < 0.3 ? 0 : p < 1 ? 1 : 2;
        const sc = stage === 0 ? 0.7 + p : stage === 1 ? 0.6 + 0.4 * p : 1;
        const n = Math.max(1, Math.round(TILE / def.sp)), d = TILE / n;
        // malas, kur blakus ir cita kultūra vai tukšs — augi atkāpjas (sprauga)
        const same = (dx, dz) => map.get(tkey(e[0] + dx, e[1] + dz)) === crop;
        const gap = { l: !same(-1, 0), r: !same(1, 0), u: !same(0, -1), b: !same(0, 1) };
        const key = crop + stage;
        if (!lists.has(key)) lists.set(key, { crop, stage, m: [] });
        const L = lists.get(key).m;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          if (n >= 3 && ((i === 0 && gap.l) || (i === n - 1 && gap.r) || (j === 0 && gap.u) || (j === n - 1 && gap.b))) continue;
          let ox = (i + 0.5) * d, oz = (j + 0.5) * d;
          if (n < 3) { if (gap.l && i === 0) ox += 0.2; if (gap.r && i === n - 1) ox -= 0.2; if (gap.u && j === 0) oz += 0.2; if (gap.b && j === n - 1) oz -= 0.2; }
          const x = e[0] * TILE + ox + (hash(e[0] * 8 + i, e[1] * 8 + j) - 0.5) * d * 0.25;
          const z = e[1] * TILE + oz + (hash(e[1] * 8 + j, e[0] * 8 + i + 3) - 0.5) * d * 0.25;
          const s = sc * (0.88 + hash(x, z) * 0.24);
          M.compose(P.set(x, this.farmW.getHeight(x, z) + 0.03, z), Q.setFromAxisAngle(UP, hash(z, x) * 6.28), S.set(s, s, s));
          L.push(M.clone());
        }
      }
    }
    // vecos mešus izmetam (ģeometrijas ir kopīgas veidnēm — tās paliek)
    for (const ms of R.plants.values()) for (const m of ms) { this.farmScene.remove(m); m.dispose(); }
    R.plants.clear();
    const tmp = new THREE.Matrix4();
    for (const [key, L] of lists) {
      if (!L.m.length) continue;
      const ms = [];
      for (const part of (L.tree ? this.treeParts(L.crop, L.stage, L.fruit) : this.cropParts(L.crop, L.stage))) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, L.m.length);
        L.m.forEach((mm, i) => im.setMatrixAt(i, tmp.multiplyMatrices(mm, part.local)));
        im.castShadow = !GRAINS.has(L.crop) && !(L.tree && part.noShadow);
        im.receiveShadow = true;
        im.computeBoundingSphere();
        this.farmScene.add(im);
        ms.push(im);
      }
      R.plants.set(key, ms);
    }
  },

  // ---------- mājas zīme un rotājumi ----------
  setGardenSign(slot, name) {
    if (!this.farmOn || slot == null) return;
    if (this.gardenSigns[slot] && this.gardenSignNames[slot] === name) return;
    this.gardenSignNames[slot] = name;
    const old = this.gardenSigns[slot];
    if (old) {
      this.farmScene.remove(old);
      old.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.userData.sign) { o.material.map.dispose(); o.material.dispose(); }
      });
    }
    // koka dēlis ar vārdu, kas karājas abu vārtu arkās
    const g = new THREE.Group(), W = this.farmW;
    const txt = name ? `🏡 ${name}` : '🌾 Brīvā sēta';
    for (const sp of gateSpots(slot)) {
      const { obj } = makeSignBoard(txt, { h: 0.46, style: 'wood', minW: 2.1, color: name ? '#b58450' : '#9c9586' });
      obj.position.set(sp.x, W.getHeight(sp.x, sp.z) + 2.6, sp.z);
      obj.rotation.y = sp.ry;
      g.add(obj);
    }
    const fg = flattenStatic(g);
    g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.farmScene.add(fg);
    this.gardenSigns[slot] = fg;
  },

  // dārza mājiņa: kad esi iekšā, jumts paslēpjas un sienas kļūst caurspīdīgas (lai kamera redz)
  updateYardHouses() {
    const p = this.me.pos;
    for (const b of this.farmW.yardBuildings || []) {
      const dx = p.x - b.x, dz = p.z - b.z, c = Math.cos(b.ry), s = Math.sin(b.ry);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const inside = Math.abs(lx) < b.inner[0] && Math.abs(lz) < b.inner[1] && p.y < b.y0 + 2;
      if (inside === !!b.inside) continue;
      b.inside = inside;
      b.roof.visible = !inside;
      b.wallMat.transparent = inside; b.wallMat.opacity = inside ? 0.28 : 1; b.wallMat.depthWrite = !inside;
      b.wallMat.needsUpdate = true;
    }
  },

  // ---------- darbības (dzeltenā poga) ----------
  farmActions(consider, d2) {
    const me = this.me, slot = this.mySlot;
    if (me.ski || me.lift || me.carry) return;
    // savi rotājumi — var pacelt un pārnest
    (this.save.decor || []).forEach((d, i) => {
      if (typeof d !== 'object') return;
      const [x, z] = rotPlot(d.x, d.z, slot);
      if (Math.abs(x - me.pos.x) > 4 || Math.abs(z - me.pos.z) > 4) return;
      consider(d2(x, z) + 0.3, 2.3, `🤲 Pacelt: ${(DECOR[d.k] || { name: d.k }).name}`, () => this.pickDecor(i));
    });
    // koki/akmeņi savā laukā
    for (const o of this.farmW.plotObjs) {
      if (o.slot !== slot || this.farmW.cleared.has(o.id)) continue;
      if (Math.abs(o.x - me.pos.x) > 5 || Math.abs(o.z - me.pos.z) > 5) continue;
      const left = HITS[o.type] - (this.objHits[o.id] || 0);
      const verb = o.type === 'tree' ? '🪓 Cirst' : o.type === 'rock' ? '⛏️ Novākt' : '✂️ Izcirst';
      consider(d2(o.x, o.z) - o.r * 0.5, 2.4 + o.r, `${verb} ${OBJ_NAME[o.kind]}${HITS[o.type] > 1 ? ` (${left})` : ''}`, () => this.clearObj(o));
    }
    const tl = this.tileAt(me.pos.x, me.pos.z);
    if (!tl) return;
    if (tl.slot === slot) {
      const v = this.save.farm.t[this.ckey(tl.key)];
      const blocked = this.farmW.plotObjs.find((o) => o.slot === slot && !this.farmW.cleared.has(o.id) && Math.abs(o.x - tl.cx) < TILE / 2 + 0.8 && Math.abs(o.z - tl.cz) < TILE / 2 + 0.8);
      if (!v) {
        const [ca, cb] = this.ckey(tl.key).split(',').map(Number);
        if (blocked) consider(9, 10, '🪓 Vispirms notīri šo vietu', () => toast('Šeit aug koks vai ir akmens — vispirms nocērt vai novāc to!'));
        else if (!inLand(ca, cb, this.save.gd.land)) this.landAction(consider);
        else consider(1.0, 2, '⛏️ Uzart lauciņu', () => this.plowTile(tl));
      } else if (v.tr) {
        const d = TREES[v.tr], p = this.treeProgress(v);
        const fname = FRUITS[d.fruit].name.toLowerCase();
        if (this.fruitReady(v)) consider(1.0, 2.2, `🧺 Lasīt: ${fname} (${d.name})`, () => this.pickFruit(tl));
        else if (p < 1 && !v.w) consider(1.0, 2.2, `💧 Aplaistīt: ${d.name}`, () => this.waterTile(tl));
        else if (p < 1) consider(1.0, 2.2, `⏳ ${d.name} aug… ${Math.round(p * 100)}% · vēl ${fmtLeft(this.cropLeft(v))}`, () => toast(`🌳 ${d.name} izaugs pēc ${fmtLeft(this.cropLeft(v))}, tad nesīs ${fname}`));
        else consider(1.0, 2.2, `🌳 ${d.name}: ${fname} pēc ${fmtLeft(this.fruitAt(v) - this.now() / 1000)}`, () => toast(`🌳 Nākamie ${fname} būs gatavi pēc ${fmtLeft(this.fruitAt(v) - this.now() / 1000)}`));
      } else if (!v.c) {
        const seed = this.currentSeed();
        if (seed && seed.startsWith('sap:')) { const tr = seed.slice(4); consider(1.0, 2, `🌳 Stādīt: ${TREES[tr].name} (${this.save.inv[tr + '_sap']})`, () => this.plantTree(tl, tr)); }
        else if (seed) consider(1.0, 2, `🌱 Sēt: ${CROPS[seed].icon} ${CROPS[seed].name} (${this.save.inv[seed + '_seed']})`, () => this.sowTile(tl, seed));
        else consider(1.0, 2, '🌱 Nav sēklu — nopērc tirgū mežā 🛒', () => toast('Sēklas un kociņus pārdod Ūdrs Ojārs Mežvidu mežā (austrumos) 🌱'));
      } else {
        const p = this.cropProgress(v), def = CROPS[v.c];
        if (p >= 1) consider(1.0, 2, `🧺 Novākt: ${def.icon} ${def.name}`, () => this.harvestTile(tl));
        else if (!v.w) consider(1.0, 2, `💧 Aplaistīt (${def.name})`, () => this.waterTile(tl));
        else consider(1.0, 2, `⏳ ${def.icon} ${def.name} aug… ${Math.round(p * 100)}% · vēl ${fmtLeft(this.cropLeft(v))}`, () => toast(`${def.icon} ${def.name} būs gatavs pēc ${fmtLeft(this.cropLeft(v))} — augs arī tad, kad spēle aizvērta`));
      }
    } else {
      // drauga lauks — var aplaistīt
      const v = this.farmTile(tl.slot, tl.key);
      let ownerId = null, owner = null;
      for (const [id, pr] of this.profiles) if (pr.slot === tl.slot) { ownerId = id; owner = pr; }
      if (v && (v.c || v.tr) && owner && !v.w && this.cropProgress(v) < 1) consider(1.0, 2, `💧 Aplaistīt ${owner.name} lauku`, () => { this.net.toHost({ t: 'water', owner: ownerId, plot: tl.key }); sfx('plant'); this.me.petT = 0.6; });
    }
  },

  clearObj(o) {
    const n = (this.objHits[o.id] || 0) + 1;
    this.objHits[o.id] = n;
    this.me.petT = 0.6;
    this.me.heading = Math.atan2(o.x - this.me.pos.x, o.z - this.me.pos.z);
    sfx(o.type === 'tree' ? 'chop' : o.type === 'rock' ? 'hammer' : 'leaves', { at: o, vol: 0.9 });
    if (n < HITS[o.type]) { this.spawnFloat(o.type === 'tree' ? '🪓' : '⛏️', new THREE.Vector3(o.x, o.y + 1, o.z)); return; }
    const f = this.save.farm;
    if (!f.cl.includes(o.id % 100)) f.cl.push(o.id % 100);
    const coins = o.type === 'tree' ? 3 : o.type === 'rock' ? 2 : 1;
    this.addCoins(coins, true);
    if (o.type === 'tree') sfx('tree_fall', { at: o, vol: 0.8 }); else sfx('pop', { vol: 0.6 });
    sfx('coin', { vol: 0.5, delay: 0.25 });
    this.gardenXp(XP.clear);
    this.spawnFloat(o.type === 'tree' ? '🪵' : o.type === 'rock' ? '🪨' : '🌿', new THREE.Vector3(o.x, o.y + 1, o.z));
    toast(`${o.type === 'tree' ? '🪵 Koks nocirsts' : o.type === 'rock' ? '🪨 Akmens novākts' : '🌿 Krūms izcirsts'}! +${coins}🪙`);
    this.stat('cleared');
    this.farmChanged();
  },

  plowTile(tl) {
    const f = this.save.farm;
    const [ca, cb] = this.ckey(tl.key).split(',').map(Number);
    if (!inLand(ca, cb, this.save.gd.land)) { toast('🏡 Šī vieta vēl nav tavā dārzā — paplašini dārzu!'); return; }
    if (Object.keys(f.t).length >= MAX_TILES) { toast(`Uzarti jau ${MAX_TILES} lauciņi — vairāk nevar apstrādāt 🙂`); return; }
    f.t[this.ckey(tl.key)] = {};
    this.me.petT = 0.6;
    sfx('dig', { vol: 0.9 });
    this.spawnFloat('⛏️', new THREE.Vector3(tl.cx, this.me.pos.y, tl.cz));
    this.stat('plowed');
    this.gardenXp(XP.plow);
    this.farmChanged();
  },

  sowTile(tl, crop) {
    const v = this.save.farm.t[this.ckey(tl.key)];
    if (!v || v.c || !(this.save.inv[crop + '_seed'] > 0)) return;
    this.save.inv[crop + '_seed']--;
    v.c = crop; v.at = Math.round(this.now() / 1000); v.w = false;
    this.me.petT = 0.6;
    sfx('leaves', { vol: 0.7 });
    this.stat('planted');
    const def = CROPS[crop];
    toast(`🌱 Iesēji: ${def.icon} ${def.name} (aug ${fmtLeft(def.grow)}). Aplaisti — augs ātrāk!`);
    this.farmChanged();
  },

  waterTile(tl) {
    const v = this.save.farm.t[this.ckey(tl.key)];
    if (!v || !(v.c || v.tr)) return;
    // aplaistot ātrums mainās tikai no šī brīža (paveiktais procents saglabājas)
    const p = this.cropProgress(v);
    v.w = true;
    v.at = Math.round(this.now() / 1000 - p * (v.tr ? TREES[v.tr] : CROPS[v.c]).grow * 0.6);
    this.me.petT = 0.6;
    sfx('water', { vol: 0.6 });
    this.spawnFloat('💧', new THREE.Vector3(tl.cx, this.me.pos.y, tl.cz));
    this.farmChanged();
  },

  harvestTile(tl) {
    const v = this.save.farm.t[this.ckey(tl.key)];
    if (!v || !v.c || this.cropProgress(v) < 1) return;
    const def = CROPS[v.c];
    this.addItem(v.c, def.yield);
    this.save.farm.t[this.ckey(tl.key)] = {}; // zeme paliek uzarta — var sēt vēlreiz
    this.stat('harvested');
    this.me.petT = 0.6;
    sfx('pluck', { vol: 0.8 }); sfx('leaves', { vol: 0.5 });
    this.spawnFloat(def.icon, this.me.pos);
    const xp = cropXp(v.c);
    this.gardenXp(xp, new THREE.Vector3(tl.cx, this.me.pos.y + 0.6, tl.cz));
    toast(`🧺 Novāci: ${def.icon} ${def.name} ×${def.yield}! +${xp}⭐ · Pārdod Āpsim Arnoldam tirgū mežā.`, 'good');
    this.farmChanged();
  },

  plantTree(tl, tr) {
    const v = this.save.farm.t[this.ckey(tl.key)];
    if (!v || v.c || v.tr || !(this.save.inv[tr + '_sap'] > 0)) return;
    this.save.inv[tr + '_sap']--;
    v.tr = tr; v.at = Math.round(this.now() / 1000); v.w = false; v.pk = 0;
    this.me.petT = 0.8;
    sfx('dig', { vol: 0.9 }); sfx('leaves', { vol: 0.5 });
    this.stat('planted');
    const d = TREES[tr];
    toast(`🌳 Iestādīji: ${d.name}! Izaugs pēc ${fmtLeft(d.grow)} un tad ik pa ${fmtLeft(d.every)} dos ${FRUITS[d.fruit].name.toLowerCase()}. Aplaisti!`, 'good', 5000);
    if (this.selectedSeed === 'sap:' + tr && !(this.save.inv[tr + '_sap'] > 0)) this.selectedSeed = null;
    this.farmChanged();
  },

  pickFruit(tl) {
    const v = this.save.farm.t[this.ckey(tl.key)];
    if (!v || !v.tr || !this.fruitReady(v)) return;
    const d = TREES[v.tr];
    v.pk = Math.round(this.now() / 1000);
    this.addItem(d.fruit, d.yield);
    this.stat('fruits', d.yield);
    this.me.petT = 0.8;
    sfx('pluck', { vol: 0.8 });
    this.spawnFloat('🧺', this.me.pos);
    this.gardenXp(fruitXp(v.tr), new THREE.Vector3(tl.cx, this.me.pos.y + 0.6, tl.cz));
    toast(`🧺 Salasīji: ${FRUITS[d.fruit].name} ×${d.yield}! Nākamie pēc ${fmtLeft(d.every)}.`, 'good');
    this.farmChanged();
  },

  // ---------- rotājumu pārnešana (rokās) ----------
  pickDecor(i) {
    const d = this.save.decor[i];
    if (!d || this.me.carry) return;
    this.save.decor.splice(i, 1);
    this.startCarry(d.k);
    toast(`🤲 Nes: ${(DECOR[d.k] || {}).name}. Ej uz vietu savā sētā un spied „📍 Novietot”.`, '', 4000);
  },
  startCarry(k) {
    this.me.carry = { k };
    this.avatar.setCarry(buildDecor(k));
    sfx('leather', { vol: 0.7 });
    this.sendProfile();
    this.timers.action = 0;
  },
  // kur novietot nesamo: 1,3 m priekšā; tikai savā sētā (ne mājiņā, siltumnīcā vai uz uzarta lauciņa)
  carrySpot() {
    const me = this.me, h = me.heading;
    // attālums pēc rotājuma izmēra (strūklaka liela, rūķis mazs), lai to neieliek sev virsū
    const sz = (this.decorSize = this.decorSize || {});
    if (sz[me.carry.k] == null) { const b = new THREE.Box3().setFromObject(buildDecor(me.carry.k)), v = b.getSize(new THREE.Vector3()); sz[me.carry.k] = Math.max(v.x, v.z) / 2; }
    const dist = 0.9 + sz[me.carry.k];
    const x = me.pos.x + Math.sin(h) * dist, z = me.pos.z + Math.cos(h) * dist;
    if (this.zone !== FARM || plotOf(x, z) !== this.mySlot) return null;
    const part = yardPart(x, z);
    if (part === 'house' || part === 'green') return null;
    const tl = this.tileAt(x, z);
    if (tl && tl.slot === this.mySlot && this.save.farm.t[this.ckey(tl.key)]) return null;
    return { x, z };
  },
  carryAction() {
    const c = this.me.carry, name = (DECOR[c.k] || {}).name || c.k;
    const sp = this.carrySpot();
    if (sp) return { label: `📍 Novietot: ${name}`, fn: () => this.placeCarry(sp) };
    return { label: `🎒 Ielikt somā: ${name}`, fn: () => { toast(this.zone === FARM ? 'Šeit nevar novietot — tikai savā sētā (ne uz uzartas zemes). Ieliku somā 🎒' : 'Ieliku somā 🎒'); this.stowCarry(); } };
  },
  placeCarry(sp) {
    const c = this.me.carry;
    if (!c) return;
    const [x, z] = canonPt(sp.x, sp.z, this.mySlot);
    const r = this.me.heading + Math.PI - rotPlotY(this.mySlot);
    this.save.decor.push({ k: c.k, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, r: Math.round(r * 100) / 100 });
    this.me.carry = null;
    this.avatar.setCarry(null);
    sfx('leather', { vol: 0.8 });
    this.spawnFloat('✨', new THREE.Vector3(sp.x, this.me.pos.y, sp.z));
    this.sendProfile();
    this.persist();
  },
  // nesamo — atpakaļ somā (arī aizejot no sētas)
  stowCarry() {
    const c = this.me.carry;
    if (!c) return;
    this.addItem('d_' + c.k);
    this.me.carry = null;
    this.avatar.setCarry(null);
    this.sendProfile();
  },

  // draugs aplaistīja manu lauciņu (water ziņa)
  onFarmWater(m) {
    if (m.owner === this.myId) {
      const v = typeof m.plot === 'string' ? this.save.farm.t[this.ckey(m.plot)] : null;
      if (v && (v.c || v.tr) && !v.w && this.cropProgress(v) < 1) {
        const p = this.cropProgress(v);
        v.w = true; v.at = Math.round(this.now() / 1000 - p * (v.tr ? TREES[v.tr] : CROPS[v.c]).grow * 0.6);
        const who = this.remotes.get(m.by);
        if (m.by !== this.myId) toast(`💧 ${who ? who.prof.name : 'Draugs'} aplaistīja tavu lauku! Augi augs ātrāk.`, 'good');
        this.farmChanged();
      }
    }
    if (m.by === this.myId && m.owner !== this.myId) { this.stat('watered'); this.gardenXp(XP.waterFriend); }
    if (this.zone === FARM && typeof m.plot === 'string') {
      const [ix, iz] = m.plot.split(',').map(Number);
      const x = (ix + 0.5) * TILE, z = (iz + 0.5) * TILE;
      this.spawnFloat('💧', new THREE.Vector3(x, this.farmW.getHeight(x, z), z));
    }
  },

  // ---------- ciemos ----------
  // aiziet uz savu vai drauga sētu (no jebkuras zemes)
  goToPlot(slot) {
    const me = this.me;
    if (me.inKart || me.veh || me.ride) { toast('Vispirms izkāp 🚶'); return; }
    if (this.mgIn && this.mgIn()) { toast('🎲 Spēles laikā nevar aiziet!'); return; }
    if (this.zoneBusy) return;
    // pie sētas galvenajiem vārtiem (ceļa pusē), skatoties uz sētu
    const [gx, gz] = rotPlot(-YARD.gateA, -5, slot), [dx, dz] = rotPlot(0, -1, slot);
    const pos = { x: gx, z: gz };
    const heading = Math.atan2(dx, dz);
    if (this.zone === FARM) {
      me.pos.set(pos.x, this.farmW.getHeight(pos.x, pos.z), pos.z);
      me.heading = heading; this.cam.yaw = heading + Math.PI; this.camInit = false;
      sfx('beep');
      return;
    }
    this.teleport(FARM, pos, heading);
  },
};

function fmtLeft(s) {
  s = Math.ceil(s);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.ceil(s / 60)} min`;
  const h = Math.floor(s / 3600), m = Math.ceil((s % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
export { fmtLeft };

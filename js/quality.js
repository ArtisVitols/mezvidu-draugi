// Grafikas līmeņi un automātiska pielāgošana pēc kadru ātruma (fps).
// Visi iestatījumi mainās uzreiz spēles laikā (bez pārlādes), tāpēc „Auto” var kāpt uz augšu un leju.
import * as THREE from 'three';
import { PlanarReflection, PostFX, upgradeWater, terrainMaterial, loadTexture } from './gfx.js?v=1.41.0';
import { toast } from './ui.js?v=1.41.0';

export const Q_ORDER = ['lowest', 'low', 'mid', 'high'];
export const Q_MODES = ['auto', 'high', 'mid', 'low', 'lowest'];
export const Q_LABEL = { auto: 'Auto', high: 'Augsta', mid: 'Vidēja', low: 'Zema', lowest: 'Viszemākā' };

// pr — izšķirtspējas reizinātājs; shadow — ēnu kartes izmērs (0 = bez ēnām); grass — zāles blīvums; grassR — zāles lauka rādiuss (1 = ~42 m);
// detail — sīko detaļu (ziedi, akmeņi, niedres, zāle) redzamības attāluma reizinātājs (0 = nerāda);
// fog/far — redzamības attālums; treeNear — līdz cik metriem pilni koki (tālāk — attēli);
// cheap — vienkāršots apgaismojums (bez spīduma un vides atspīduma aprēķina, sk. CHEAP_LIGHT); shadowEvery — ēnas pārzīmē ik N kadrus
export const QUALITY = {
  high: { pr: 1.5, post: true, refl: true, shadow: 2048, soft: true, photo: true, grass: 1, detail: 1, fog: [100, 360], far: 450, treeNear: 100 },
  mid: { pr: 1.25, post: false, refl: false, shadow: 2048, soft: true, photo: true, grass: 1, detail: 1, fog: [100, 360], far: 450, treeNear: 100 },
  low: { pr: 1, post: false, refl: false, shadow: 1024, soft: false, photo: false, grass: 0.5, grassR: 0.85, detail: 0.7, fog: [80, 280], far: 340, treeNear: 75, cheap: true, shadowEvery: 2 },
  // viszemākā: asa bilde (pilna izšķirtspēja), bet mazāk darba — bez ēnām, zāle tikai tuvumā, tuvāka migla;
  // izšķirtspēju nedaudz samazina (līdz 0,85) tikai tad, ja telefons joprojām nevelk (dinamiski, Auto režīmā)
  lowest: { pr: 1, post: false, refl: false, shadow: 0, soft: false, photo: false, grass: 0.4, grassR: 0.6, detail: 0.5, fog: [55, 200], far: 240, treeNear: 50, cheap: true },
};

const LS_MODE = 'mezvidi_gfx', LS_AUTO = 'mezvidi_auto_q', LS_STATS = 'mezvidi_stats';
export function statsWanted() { return ls.get(LS_STATS) === '1'; }
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* */ } },
};
const DOWN_FPS = 27;     // zem šī — līmeni zemāk
const UP_FPS = 50;       // virs šī ~6 s — mēģina līmeni augstāk
const TRIAL_FPS = 40;    // pēc paaugstināšanas jābūt vismaz tik, citādi atpakaļ
// pēc neizdevušās paaugstināšanas to pašu līmeni atkal mēģina pēc 30 s, tad 60 s, 120 s … līdz 5 min
// (tikai šajā spēles reizē — lēnums var būt īslaicīgs; bez šīs pauzes grafika raustītos augšā–lejā)
const RETRY_MS = 30000, RETRY_MAX = 300000;

export function loadQualityMode() {
  const m = ls.get(LS_MODE);
  return Q_MODES.includes(m) ? m : 'auto'; // jauna atslēga — visi sāk ar Auto
}

// ar ko sākt: manuālais līmenis vai pēdējais automātiski atrastais; pirmajā reizē — minējums pēc ierīces
export function startLevel(mode) {
  if (mode !== 'auto') return mode;
  const s = ls.get(LS_AUTO);
  if (Q_ORDER.includes(s)) return s;
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
  if (mem <= 2 || cores <= 4) return 'low';
  if (mem >= 8 && cores >= 8) return 'high';
  return 'mid';
}

// ---------- vienkāršotais apgaismojums (zemajiem līmeņiem) ----------
// MeshStandardMaterial ēnotājā ar definīciju CHEAP_LIGHT izlaiž spīdumu (GGX), vides atspīdumu (IBL radiance) un
// daudzkārtējās izkliedes aprēķinu — paliek difūzā gaisma no saules, debesīm un vides. Izskats gandrīz tāds pats
// (spēlē gandrīz viss ir matēts), bet katrs pikselis telefonam ir krietni lētāks.
(function patchCheapLighting() {
  const C = THREE.ShaderChunk;
  const spec = 'reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );';
  if (C.lights_physical_pars_fragment.includes(spec)) C.lights_physical_pars_fragment = C.lights_physical_pars_fragment.replace(spec, '#ifndef CHEAP_LIGHT\n' + spec + '\n#endif');
  const ind = 'void RE_IndirectSpecular_Physical(';
  const i0 = C.lights_physical_pars_fragment.indexOf(ind), body = C.lights_physical_pars_fragment.indexOf('{', i0) + 1;
  if (i0 > 0) C.lights_physical_pars_fragment = C.lights_physical_pars_fragment.slice(0, body) +
    '\n#ifdef CHEAP_LIGHT\n\treflectedLight.indirectDiffuse += material.diffuseColor * irradiance * RECIPROCAL_PI;\n\treturn;\n#endif' + C.lights_physical_pars_fragment.slice(body);
  const rad = 'radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );';
  if (C.lights_fragment_maps.includes(rad)) C.lights_fragment_maps = C.lights_fragment_maps.replace(rad, '#ifndef CHEAP_LIGHT\n' + rad + '\n#endif');
})();
function setCheap(m, on) {
  if (!m || !m.isMeshStandardMaterial || m.userData.keepPBR) return;
  const has = !!(m.defines && 'CHEAP_LIGHT' in m.defines);
  if (has === on) return;
  m.defines = m.defines || {};
  if (on) m.defines.CHEAP_LIGHT = ''; else delete m.defines.CHEAP_LIGHT;
  m.needsUpdate = true;
}

try { localStorage.removeItem('mezvidi_auto_block'); } catch (e) { /* vecā 2 dienu bloķēšana (līdz 1.19.0) */ }

export const Quality = {
  // foto faktūras ielādē tikai tad, kad tās pirmo reizi vajag; atgriežoties tās tiek augšupielādētas no jauna
  ensurePhoto() {
    if (this.photo) return this.photo;
    const soft = (p) => p.catch((e) => { console.warn(e); return null; });
    this.photo = {
      terrain: soft(terrainMaterial()),
      asphalt: soft(Promise.all([new Promise((r, j) => { const im = new Image(); im.onload = () => r(im); im.onerror = j; im.src = 'assets/tex/asphalt_c.jpg'; }), loadTexture('assets/tex/asphalt_n.jpg', false)])),
      rock: soft(Promise.all([loadTexture('assets/tex/rock_c.jpg', true, 1), loadTexture('assets/tex/rock_n.jpg', false, 1)])),
    };
    return this.photo;
  },

  // ūdens atspulgs un pēcapstrāde — izveido tikai augstajam līmenim
  ensureFx() {
    if (this.fxTried) return;
    this.fxTried = true;
    try {
      this.refl = new PlanarReflection(0.5);
      this.post = new PostFX(this.renderer);
    } catch (e) { console.warn('Pēcapstrāde nav pieejama', e); this.refl = null; this.post = null; }
  },

  applyQuality(level) {
    const Q = QUALITY[level], prev = this.Q, R = this.renderer;
    this.qLevel = level;
    this.Q = Q;
    this.prScale = 1;
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
    if (Q.post || Q.refl) this.ensureFx();
    if (this.post) this.post.enabled = Q.post;
    if (this.refl) this.refl.enabled = !!Q.refl;
    // ēnas
    const shOn = Q.shadow > 0, type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const recompile = !prev || R.shadowMap.enabled !== shOn || (shOn && R.shadowMap.type !== type);
    if (recompile || (shOn && this.sun.shadow.mapSize.x !== Q.shadow)) {
      R.shadowMap.enabled = shOn;
      R.shadowMap.type = type;
      this.sun.castShadow = shOn;
      if (shOn) this.sun.shadow.mapSize.set(Q.shadow, Q.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      if (recompile && prev) this.recompileAll();
    }
    // redzamības attālums
    this.stage.fog.near = Q.fog[0];
    this.stage.fog.far = Q.fog[1];
    this.camera.far = Q.far;
    this.sky.scale.setScalar(Q.far * 0.84);
    if (Q.detail > 0) this.camera.layers.enable(1); else this.camera.layers.disable(1);
    if (this.world) for (const W of this.builtWorlds()) this.applyWorldQuality(W);
    if (this.terr && this.terr.applyQuality && !this.terr.isWorld) this.terr.applyQuality(this);
    this.cheapScan(true);
    this.renderer.shadowMap.autoUpdate = true;
    this.onResize();
  },

  // vienkāršotā apgaismojuma definīcija visiem materiāliem (arī ielādētajām, bet paslēptajām zemēm);
  // spēles laikā izsauc ik pēc ~1,5 s, lai pieķertu jaunus objektus (avatārus, augus, zīmes)
  cheapScan(all) {
    const on = !!(this.Q && this.Q.cheap);
    const f = (o) => { if (o.material) { if (Array.isArray(o.material)) o.material.forEach((m) => setCheap(m, on)); else setCheap(o.material, on); } };
    this.stage.traverse(f);
    if (all) for (const g of [this.scene, this.farmScene, this.raceScene]) if (g && g.parent !== this.stage) g.traverse(f);
  },

  // 📊 mērītājs ekrāna augšā: fps, kadra laiks, zīmēšanas izsaukumi un trijstūri (visos zīmēšanas gājienos kopā)
  toggleStats(on = !this.statsOn) {
    this.statsOn = on;
    ls.set(LS_STATS, on ? '1' : '0');
    if (on && !this.statsEl) {
      this.statsEl = document.createElement('div');
      this.statsEl.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 50px);left:50%;transform:translateX(-50%);z-index:60;pointer-events:none;' +
        'background:rgba(0,0,0,.6);color:#fff;font:600 11px/1.35 ui-monospace,monospace;padding:3px 8px;border-radius:8px;white-space:pre;text-align:center';
      document.body.append(this.statsEl);
    }
    if (this.statsEl) this.statsEl.style.display = on ? 'block' : 'none';
    this.st = { t: performance.now(), n: 0, calls: 0, tris: 0 };
  },
  statsTick() {
    const info = this.renderer.info;
    if (this.statsOn) {
      const a = this.st;
      a.n++; a.calls += info.render.calls; a.tris += info.render.triangles;
      const now = performance.now(), d = now - a.t;
      if (d >= 500) {
        const R = this.renderer, px = R.domElement.width * R.domElement.height;
        this.statsEl.textContent = `${(a.n * 1000 / d).toFixed(0)} fps · ${(d / a.n).toFixed(1)} ms · ${Q_LABEL[this.qLevel]}\n` +
          `${Math.round(a.calls / a.n)} zīmējumi · ${Math.round(a.tris / a.n / 1000)}k trijst. · ${(px / 1e6).toFixed(2)} Mpx`;
        this.st = { t: now, n: 0, calls: 0, tris: 0 };
      }
    }
    info.reset(); // skaita visu kadru (ēnas, atspulgs, pēcapstrāde), ne tikai pēdējo zīmēšanu
  },

  // ēnu karte ik N kadrus (Zemā līmenī ik otro): saules virziens nemainās, tāpēc nobīde nav pamanāma
  shadowTick() {
    const n = this.Q && this.Q.shadowEvery, R = this.renderer;
    if (!n || n < 2 || !R.shadowMap.enabled) return;
    this.shN = (this.shN || 0) + 1;
    R.shadowMap.autoUpdate = false;
    R.shadowMap.needsUpdate = this.shN % n === 0;
  },

  applyWorldQuality(W) {
    const Q = this.Q;
    W.detailScale = Q.detail || 1;
    W.treeNear = Q.treeNear;
    W.farCull = Q.far;
    if (W.grassMesh) {
      W.grassMesh.count = Math.round(W.grassMesh.userData.full * Q.grass);
      W.grassMesh.visible = Q.grass > 0;
      if (W.grassR) W.grassR.value = Q.grassR || 1;
    }
    const reflOn = !!(Q.refl && this.refl) && W === this.world; // atspulgs tikai meža ezeros
    if (W.water && W.waterRefl !== reflOn) { upgradeWater(W, reflOn ? this.refl : null); W.waterRefl = reflOn; }
    if (Q.photo) {
      const ph = this.ensurePhoto();
      ph.terrain.then((m) => { if (m && this.Q.photo) W.usePhotoTerrain(m); });
      if (!W.photoDetails) {
        W.photoDetails = true;
        ph.asphalt.then((a) => { if (a && W.trackRoad) W.usePhotoAsphalt(a[0], a[1]); });
        ph.rock.then((a) => { if (a) W.usePhotoRock(a[0], a[1]); });
      }
    } else W.useBaseTerrain();
    if (this.timers) this.timers.vis = 0;
  },

  recompileAll() {
    const f = (o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); };
    this.stage.traverse(f);
    for (const g of [this.scene, this.farmScene, this.raceScene]) if (g && g.parent !== this.stage) g.traverse(f);
  },

  // izvēlne: Auto → Augsta → Vidēja → Zema → Viszemākā
  setQualityMode(mode) {
    this.qMode = mode;
    ls.set(LS_MODE, mode);
    this.qa = null;
    if (mode !== 'auto') this.applyQuality(mode);
  },

  qualityLabel() {
    return this.qMode === 'auto' ? `Auto (tagad: ${Q_LABEL[this.qLevel]})` : Q_LABEL[this.qMode];
  },

  // Automātika: mēra fps 3 s logos. Lēni → līmeni zemāk. Ilgi ātri → mēģina augstāk; ja pēc tam kļūst lēni,
  // atgriežas un to pašu līmeni mēģina atkal pēc 30 s → 60 s → … līdz 5 min (tikai šajā spēles reizē).
  autoQuality() {
    const now = performance.now();
    if (!(now < this.cheapAt)) { this.cheapAt = now + 1500; this.cheapScan(false); }
    if (this.qMode !== 'auto') return;
    const a = this.qa || (this.qa = { last: now, t: 0, n: 0, hold: 4, good: 0, trial: null, trialN: 0, retry: {}, wait: {} });
    const d = (now - a.last) / 1000;
    a.last = now;
    // ielāde, cita lietotne vai ļoti liela aizture — nemērām
    if (this.zoneBusy || document.hidden || d > 5) { a.t = 0; a.n = 0; a.hold = Math.max(a.hold, 1.5); return; }
    if (a.hold > 0) { a.hold -= d; return; }
    a.t += d; a.n++;
    if (a.t < 3) return;
    const fps = a.n / a.t;
    a.t = 0; a.n = 0;
    const i = Q_ORDER.indexOf(this.qLevel);
    if (a.trial === this.qLevel) {
      if (fps < TRIAL_FPS) {
        const w = a.wait[this.qLevel] = Math.min(RETRY_MAX, (a.wait[this.qLevel] || RETRY_MS / 2) * 2);
        a.retry[this.qLevel] = now + w;
        a.trial = null;
        this.autoChange(Q_ORDER[i - 1]);
        return;
      }
      if (++a.trialN >= 2) { a.trial = null; delete a.wait[this.qLevel]; } // apstiprināts
      return;
    }
    if (fps < DOWN_FPS && i > 0) { a.good = 0; this.autoChange(Q_ORDER[i - 1]); return; }
    // viszemākajā līmenī: ja joprojām lēni — nedaudz mazāka izšķirtspēja; kad atkal ātri — atpakaļ uz pilnu
    if (i === 0 && (fps < DOWN_FPS ? this.prScale > 0.86 : fps >= 45 && this.prScale < 1)) {
      this.prScale = Math.round(Math.max(0.85, Math.min(1, this.prScale + (fps < DOWN_FPS ? -0.05 : 0.05))) * 100) / 100;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.Q.pr) * this.prScale);
      this.onResize();
      a.hold = 1;
      if (fps >= 45) return;
    }
    if (fps >= UP_FPS && i < Q_ORDER.length - 1) {
      const next = Q_ORDER[i + 1];
      if (++a.good >= 2 && !(a.retry[next] > now)) {
        a.good = 0; a.trial = next; a.trialN = 0;
        this.autoChange(next);
      }
    } else a.good = 0;
  },

  autoChange(level) {
    const up = Q_ORDER.indexOf(level) > Q_ORDER.indexOf(this.qLevel);
    this.applyQuality(level);
    ls.set(LS_AUTO, level);
    this.qa.hold = 2.5; // ēnotāju kompilēšana — nemērām
    toast(`🎨 Grafika automātiski ${up ? 'uzlabota' : 'vienkāršota'}: ${Q_LABEL[level]}`, '', 2500);
  },
};

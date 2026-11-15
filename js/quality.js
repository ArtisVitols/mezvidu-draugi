// Grafikas līmeņi un automātiska pielāgošana pēc kadru ātruma (fps).
// Visi iestatījumi mainās uzreiz spēles laikā (bez pārlādes), tāpēc „Auto” var kāpt uz augšu un leju.
import * as THREE from 'three';
import { PlanarReflection, PostFX, upgradeWater, terrainMaterial, loadTexture } from './gfx.js?v=1.10.0';
import { toast } from './ui.js?v=1.10.0';

export const Q_ORDER = ['lowest', 'low', 'mid', 'high'];
export const Q_MODES = ['auto', 'high', 'mid', 'low', 'lowest'];
export const Q_LABEL = { auto: 'Auto', high: 'Augsta', mid: 'Vidēja', low: 'Zema', lowest: 'Viszemākā' };

// pr — izšķirtspējas reizinātājs; shadow — ēnu kartes izmērs (0 = bez ēnām); grass — zāles blīvums;
// detail — sīko detaļu (ziedi, akmeņi, niedres, zāle) redzamības attāluma reizinātājs (0 = nerāda);
// fog/far — redzamības attālums; treeNear — līdz cik metriem pilni koki (tālāk — attēli)
export const QUALITY = {
  high: { pr: 1.5, post: true, refl: true, shadow: 2048, soft: true, photo: true, grass: 1, detail: 1, fog: [100, 360], far: 450, treeNear: 100 },
  mid: { pr: 1.25, post: false, refl: false, shadow: 2048, soft: true, photo: true, grass: 1, detail: 1, fog: [100, 360], far: 450, treeNear: 100 },
  low: { pr: 1, post: false, refl: false, shadow: 1024, soft: false, photo: false, grass: 0.5, detail: 0.7, fog: [80, 280], far: 340, treeNear: 75 },
  lowest: { pr: 0.75, post: false, refl: false, shadow: 0, soft: false, photo: false, grass: 0, detail: 0, fog: [60, 210], far: 250, treeNear: 55 },
};

const LS_MODE = 'mezvidi_gfx', LS_AUTO = 'mezvidi_auto_q', LS_BLOCK = 'mezvidi_auto_block';
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* */ } },
};
const DOWN_FPS = 27;     // zem šī — līmeni zemāk
const UP_FPS = 50;       // virs šī ~6 s — mēģina līmeni augstāk
const TRIAL_FPS = 40;    // pēc paaugstināšanas jābūt vismaz tik, citādi atpakaļ un šo līmeni ilgāk nemēģina
const BLOCK_MS = 2 * 24 * 3600 * 1000;

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

function blocks() { try { return JSON.parse(ls.get(LS_BLOCK) || '{}'); } catch (e) { return {}; } }

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
    if (this.world) this.applyWorldQuality(this.world);
    this.onResize();
  },

  applyWorldQuality(W) {
    const Q = this.Q;
    W.detailScale = Q.detail || 1;
    W.treeNear = Q.treeNear;
    W.farCull = Q.far;
    if (W.grassMesh) {
      W.grassMesh.count = Math.round(W.grassMesh.userData.full * Q.grass);
      W.grassMesh.visible = Q.grass > 0;
    }
    const reflOn = !!(Q.refl && this.refl);
    if (W.water && W.waterRefl !== reflOn) { upgradeWater(W, reflOn ? this.refl : null); W.waterRefl = reflOn; }
    if (Q.photo) {
      const ph = this.ensurePhoto();
      ph.terrain.then((m) => { if (m && this.world === W && this.Q.photo) W.usePhotoTerrain(m); });
      if (!W.photoDetails) {
        W.photoDetails = true;
        ph.asphalt.then((a) => { if (a && this.world === W) W.usePhotoAsphalt(a[0], a[1]); });
        ph.rock.then((a) => { if (a && this.world === W) W.usePhotoRock(a[0], a[1]); });
      }
    } else W.useBaseTerrain();
    if (this.timers) this.timers.vis = 0;
  },

  recompileAll() {
    const f = (o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); };
    this.stage.traverse(f);
    if (this.scene && this.scene.parent !== this.stage) this.scene.traverse(f);
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
  // atgriežas un šo līmeni uz šīs ierīces 2 dienas vairs nemēģina.
  autoQuality() {
    if (this.qMode !== 'auto') return;
    const now = performance.now();
    const a = this.qa || (this.qa = { last: now, t: 0, n: 0, hold: 4, good: 0, trial: null, trialN: 0 });
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
        const b = blocks(); b[this.qLevel] = Date.now() + BLOCK_MS; ls.set(LS_BLOCK, JSON.stringify(b));
        a.trial = null;
        this.autoChange(Q_ORDER[i - 1]);
        return;
      }
      if (++a.trialN >= 2) a.trial = null; // apstiprināts
      return;
    }
    if (fps < DOWN_FPS && i > 0) { a.good = 0; this.autoChange(Q_ORDER[i - 1]); return; }
    if (fps >= UP_FPS && i < Q_ORDER.length - 1) {
      const next = Q_ORDER[i + 1];
      if (++a.good >= 2 && !(blocks()[next] > Date.now())) {
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

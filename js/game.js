import * as THREE from 'three';
import { World, WATER_Y, TRACK_Y, TRACK_N, TRACK_WIDTH, GARDEN_SLOTS, plotSign, yardPart, VENDORS, SPAWN, VILLAGE_Y, HALF, SIZE, PLAY_RADIUS } from './world.js?v=1.48.0';
import { buildAnimal, buildNPC, buildKart, buildCart, buildMushroom, buildStar, buildCrop, flattenStatic } from './characters.js?v=1.48.0';
import { Controls } from './controls.js?v=1.48.0';
import { Sky } from 'three/addons/objects/Sky.js';
import { WORLD_SEED, CROPS, MUSHROOMS, HATS, KART_COLORS, ICE_CREAM_PRICE, QUESTS, NPC_TYPES, EMOTES, RACE_LAPS, ANIMALS, TREES, FRUITS, CLOTHES, SLOTS, DECOR } from './data.js?v=1.48.0';
import { writeSave } from './save.js?v=1.48.0';
import { Sound } from './sound.js?v=1.48.0';
import { getVolume, setVolume, getFxVolume, setFxVolume, getVoiceVolume, setVoiceVolume, voice, voiceOn, setVoiceOn } from './audio.js?v=1.48.0';
import { BugSpot } from './bugspot.js?v=1.48.0';
import { VERSION, BUILD_DATE } from './version.js?v=1.48.0';
import { makeTextSprite, makeTag, angleLerp, clamp, lerp, smoothstep, canvasTexture } from './util.js?v=1.48.0';
import { $, toast, showPanel, refreshPanel, closePanel, panelOpen, el, itemRow, sfx, fmtTime } from './ui.js?v=1.48.0';
import { icon, iconEl, fishSvg } from './icons.js?v=1.48.0';
import { Activities, makeTeam } from './activities.js?v=1.48.0';
import { Quality, QUALITY, Q_MODES, loadQualityMode, startLevel, statsWanted } from './quality.js?v=1.48.0';
import { hdrEnvironment } from './gfx.js?v=1.48.0';
import { buildRod, buildDecor } from './props.js?v=1.48.0';
import { buildStall, buildBunting } from './market.js?v=1.48.0';
import { InstanceField } from './instancing.js?v=1.48.0';
import { WinterZone, Winter, winterMap, WINTER_ICONS } from './winter.js?v=1.48.0';
import { Vehicles } from './vehicles.js?v=1.48.0';
import { Farm, fmtLeft } from './farm.js?v=1.48.0';
import { PlainZone, ZONES, ZONE_IDS, DIRS, ZONE_HALF, CROSS_AT, zoneOffset, zoneBounds, alongLat, neighbour, openSides, freeGpu, plainRoads, smoothRoad, FARM, FOREST, RACE } from './zones.js?v=1.48.0';
import { FISH, BERRIES, COOKED, PETS, PLACES, MAP_PIECES, WEEKLY_REWARD } from './data.js?v=1.48.0';
import { plotOf } from './world.js?v=1.48.0';
import { kartClamp } from './racetrack.js?v=1.48.0';
import { Bus, BUS_STOPS } from './bus.js?v=1.48.0';
import { Garden, UNLOCK } from './garden.js?v=1.48.0';
import { MZ } from './assets.js?v=1.48.0';
import { TrailZone, Trail, trailMap, trailIcons, trailItem, TASKS as TRAIL_TASKS } from './trail.js?v=1.48.0';

const ANIM = ['idle', 'walk', 'run', 'jump', 'swim', 'sit', 'pet', 'wave', 'fish', 'ski', 'lift', 'throw'];
const MUSH_RESPAWN = 120000;
const EPOCH = 1.7e12;
const BOTS = [
  { name: 'Zaķis Zigis 🤖', animal: 'zakis', fur: '#d9d2c5', shirt: '#2f6fd6', kart: '#2a6ae0', speed: 14 },
  { name: 'Lapsa Laura 🤖', animal: 'lapsa', fur: '#e8742a', shirt: '#2fa84f', kart: '#2ab04a', speed: 15.5 },
  { name: 'Lācis Lauris 🤖', animal: 'lacis', fur: '#8b5a2b', shirt: '#f2c12e', kart: '#e8c020', speed: 17 },
];
const PLAYER_DOT = ['#ff4040', '#40a0ff', '#ffd040', '#c060ff'];

export class Game {
  constructor({ save, net, roomCode, game }) {
    this.save = save;
    this.gameInfo = game || { id: '', name: 'Pirmā spēle', at: 0, keep: {} }; // kura spēle (pasaule) — 1.28.0
    this.initGarden();
    this.net = net;
    this.roomCode = roomCode;
    this.myId = net.isHost ? 0 : -1;
    this.mySlot = 0;
    this.timeOffset = 0;
    this.remotes = new Map();
    this.profiles = new Map();
    this.picked = {};
    this.team = makeTeam(Date.now(), save.weekly);
    this.race = { phase: 'none', id: 0 };
    this.myRace = null;
    this.hs = null;
    this.selectedSeed = null;
    this.npcCooldown = {};
    this.effects = [];
    this.timers = { send: 0, action: 0, garden: 0, save: 0, map: 0, cull: 0 };
    this.lastGardenKey = '';
    this.currentAction = null;
    this.ended = false;
    this.soundOn = true;
  }

  now() { return Date.now() + this.timeOffset; }

  // ======================= Inicializācija =======================
  // progress(daļa 0..1, teksts) — ielādes ekrānam; starp soļiem atdodam vadību pārlūkam, lai tas var pārzīmēt ekrānu
  async init(progress = () => {}) {
    const step = async (f, t) => { progress(f, t); await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); };
    await step(0.02, 'Gatavojam debesis…');
    const canvas = $('game');
    // grafikas līmenis: Auto (pēc fps) vai izvēlēts izvēlnē; iestatījumi tiek uzlikti pēc pasaules uzbūvēšanas
    this.qMode = loadQualityMode();
    const startQ = startLevel(this.qMode);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[startQ].pr));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false); // CSS izmēru nosaka style.css (100 %)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.info.autoReset = false; // kadra skaitītājus nomet statsTick (visi zīmēšanas gājieni kopā)
    this.renderer.toneMappingExposure = 0.62;
    // stage — īstā three.js aina; scene — Mežvidu (centra zemes) saturs, ko var noņemt, kad esi citā zemē
    this.stage = new THREE.Scene();
    this.scene = new THREE.Group();
    this.stage.add(this.scene);
    this.zone = FOREST; // mežs tiek uzbūvēts pirmais (tā dati vajadzīgi visiem), tad pārejam uz saglabāto zemi
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.2, 450); // near 0.2 — precīzāks dziļums (mazāk mirgošanas)

    // reālistiskas debesis + apkārtnes apgaismojums no tām
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(140));
    const mkSky = (scale) => {
      const sk = new Sky();
      sk.scale.setScalar(scale);
      const u = sk.material.uniforms;
      u.turbidity.value = 2.5; u.rayleigh.value = 2.2; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(this.sunDir);
      return sk;
    };
    this.sky = mkSky(380);
    this.stage.add(this.sky);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(mkSky(500));
    this.stage.environment = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
    pmrem.dispose();
    this.stage.fog = new THREE.Fog(new THREE.Color('#a9c6dc'), 100, 360);

    this.stage.add(new THREE.HemisphereLight('#cfe3f5', '#4a5a30', 0.5));
    const sun = new THREE.DirectionalLight('#fff1d6', 3.2);
    sun.position.copy(this.sunDir).multiplyScalar(120);
    this.stage.add(sun);
    this.stage.add(sun.target);
    this.sun = sun;
    // ēnu kamera (ēnas ieslēdz/izslēdz grafikas līmenis)
    const sc = sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    window.addEventListener('resize', () => this.onResize());

    this.camera.layers.enable(1);
    hdrEnvironment(this.renderer, this.sunDir, 1.0).then((env) => { this.stage.environment = env; }).catch((e) => console.warn(e));
    await step(0.06, 'Veidojam mežu…');
    let n = 0;
    for (const _ of this.buildForest()) await step(0.06 + Math.min(0.42, ++n * 0.05), 'Veidojam mežu…');
    await step(0.5, 'Veidojam sētu un dārzus…');
    n = 0;
    for (const _ of this.buildFarm()) await step(0.5 + Math.min(0.25, ++n * 0.04), 'Veidojam sētu un dārzus…');
    await step(0.76, 'Veidojam sacīkšu trasi…');
    this.raceW = new World(WORLD_SEED + 2000, RACE); // trases dati (aplis, tuneļi) — modeļi tiek uzbūvēti, pirmoreiz ierodoties
    this.raceScene = new THREE.Group();
    await step(0.8, 'Iestatām grafiku…');
    this.applyQuality(startQ);
    this.mapBases = {};
    for (const [id, W] of [[FOREST, this.world], [FARM, this.farmW], [RACE, this.raceW]]) {
      await step(0.8 + Object.keys(this.mapBases).length * 0.012, 'Zīmējam karti…');
      this.mapBases[id] = this.mapBase(W);
    }
    this.buildMinimap();
    await step(0.84, 'Gatavojam tavu tēlu…');

    // mans tēls
    let sz = ZONES[this.save.zone] ? this.save.zone : FARM;
    const lw = this.landWorld(sz);
    const [bx0, bz0, bx1, bz1] = zoneBounds(sz);
    const okPos = (p) => p && p.x > bx0 + 5 && p.x < bx1 - 5 && p.z > bz0 + 5 && p.z < bz1 - 5 && (!lw || lw.getHeight(p.x, p.z) > WATER_Y);
    let sp = okPos(this.save.pos) ? this.save.pos : null;
    if (!sp) { sz = FARM; sp = SPAWN; }
    this.me = {
      pos: new THREE.Vector3(sp.x, 0, sp.z),
      vy: 0, heading: 0, onGround: true, state: 'idle', inKart: false,
      kart: null, boost: 0, dizzy: 0, iceCream: 0, waveT: 0, petT: 0, progress: 0,
    };
    this.avatar = buildAnimal(this.avatarProf());
    this.stage.add(this.avatar.root);
    this.myName = makeTag(this.save.name, { color: '#d8ffc8' });
    this.myName.position.y = 2.1;
    this.avatar.root.add(this.myName);

    this.initActivities();

    this.cam = { yaw: Math.PI * 0.25, pitch: 0.38, dist: 7.5 };
    this.initVehicles();
    this.initBus();
    this.initTrail();
    this.initBugSpot();
    await step(0.88, 'Ejam uz tavu vietu…');
    this.switchZone(sz, sp, null); // ielādējas saglabātā zeme (mežs tiek izlādēts, ja tā nav mežs)
    this.controls = new Controls($('touch'));
    this.bindHud();
    this.setupNet();
    this.updateCoins();
    this.updateGardenHud();
    this.onResize();
    // šeideru kompilēšana pirms pirmā kadra (citādi pirmais kadrs uz brīdi „sasalst”)
    await step(0.92, 'Gatavojam krāsas un gaismas…');
    this.camera.position.set(this.me.pos.x, 3, this.me.pos.z + 6);
    try { await this.precompile((f) => step(0.92 + f * 0.08, 'Gatavojam krāsas un gaismas…')); } catch (e) { console.warn(e); }
    await step(1, 'Gatavs!');
  }

  // šeideri pa daļām (renderer.compile vienam objektam ar visas ainas gaismām), lai ielādes ekrāns paliek dzīvs
  async precompile(tick) {
    const list = [];
    const add = (o, d) => {
      if (!o.visible) return;
      if (d < 3 && !o.isMesh && o.children.length > 6) o.children.forEach((c) => add(c, d + 1));
      else list.push(o);
    };
    this.stage.children.forEach((c) => add(c, 0));
    let t = performance.now();
    for (let i = 0; i < list.length; i++) {
      this.renderer.compile(list[i], this.camera, this.stage);
      if (performance.now() - t > 120) { await tick(i / list.length * 0.3); t = performance.now(); }
    }
    // īstā šeideru saistīšana un ģeometrijas/faktūru augšupielāde notiek pirmajā zīmēšanā — zīmējam vēl zem ielādes
    // ekrāna, atklājot objektus pa daļām (katrā kadrā tikai daļa jaunā darba)
    this.updateCamera(0.016);
    for (const o of list) o.visible = false;
    const parts = 8;
    for (let k = 1; k <= parts; k++) {
      const to = Math.round(list.length * k / parts);
      for (let i = Math.round(list.length * (k - 1) / parts); i < to; i++) list[i].visible = true;
      this.renderFrame();
      await tick(0.3 + 0.7 * k / parts);
    }
  }

  // pilnā pasaule (World) zemei id vai null
  landWorld(id) { return id === FOREST ? this.world : id === FARM ? this.farmW : id === RACE ? this.raceW : null; }
  builtWorlds() { return [this.world, this.farmW, this.raceW && this.raceW.terrainTiles ? this.raceW : null].filter(Boolean); }

  // ---------- trase (rietumu zeme): uzbūvē pirmoreiz ierodoties, pēc tam tikai izlādē/ielādē GPU ----------
  loadRace() {
    const W = this.raceW;
    if (!W.terrainTiles) { W.build(this.raceScene, this.renderer); if (this.Q) this.applyWorldQuality(W); }
    this.stage.add(this.raceScene);
    this.raceOn = true;
    this.terr = W;
    this.timers.vis = 0;
    return Promise.resolve();
  }

  unloadRace() {
    if (!this.raceOn) return;
    this.raceOn = false;
    this.stage.remove(this.raceScene);
    freeGpu(this.raceScene, [this.raceW.heightTex, this.raceW.groundTex]);
  }

  // ---------- Mežvidu mežs: uzbūvēšana, izlādēšana no GPU un atgriešanās ----------
  // Visi meža objekti ir grupā this.scene. Aizejot uz citu zemi, grupa tiek izņemta no ainas un visa tās GPU atmiņa
  // (ģeometriju buferi, faktūras, arī lielā foto reljefa faktūra) atbrīvota. JS dati paliek, tāpēc atgriežoties
  // nekas nav jābūvē no jauna — three.js tikai augšupielādē datus GPU (ātri), nevis vairākas sekundes ģenerē pasauli.
  *buildForest() {
    this.scene = new THREE.Group();
    this.stage.add(this.scene);
    const W = this.world = new World(WORLD_SEED, FOREST);
    yield;
    yield* W.buildSteps(this.scene, this.renderer);
    yield;
    this.terr = W; // aktīvās zemes reljefs (kustībai, kamerai, mājdzīvniekiem)
    if (this.Q) this.applyWorldQuality(W);
    this.buildMushrooms();
    this.buildStars();
    this.buildNpcs();
    this.buildVendors();
    this.bots = [];
    this.centerOn = true;
      }

  unloadForest() {
    if (!this.centerOn) return;
    this.centerOn = false;
    if (this.fishing) this.stopFishing();
    this.stage.remove(this.scene);
    const W = this.world;
    freeGpu(this.scene, [W.heightTex, W.groundTex]);
  }

  // atpakaļ uz mežu: grupa atpakaļ ainā
  reloadForest() {
    this.stage.add(this.scene);
    this.centerOn = true;
    this.terr = this.world;
    this.timers.vis = 0; this.timers.cull = 0; this.timers.berry = 0;
    return Promise.resolve();
  }

  renderFrame() {
    if (this.shadowTick) this.shadowTick();
    if (this.refl && this.refl.enabled && this.zone === FOREST) this.refl.update(this.renderer, this.stage, this.camera, this.world.water, WATER_Y);
    if (this.post && this.post.enabled) this.post.render(this.stage, this.camera);
    else this.renderer.render(this.stage, this.camera);
    this.statsTick();
  }

  onResize() {
    // izmērs no paša audekla (CSS 100 %): ar daļskaitļa ekrāna platumu malās nepaliek gaiša josla
    const cv = this.renderer.domElement;
    const w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    if (this.post) this.post.setSize();
    if (this.refl) this.refl.setSize(w * pr, h * pr);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 72 : 60;
    this.camera.updateProjectionMatrix();
  }

  // sēnes — instancētas pa veidiem un apgabaliem (daži zīmēšanas izsaukumi visām 420 sēnēm)
  buildMushrooms() {
    const tpl = {};
    this.mushField = new InstanceField(this.world.mushrooms.map((m) => ({ id: m.id, kind: m.type, x: m.x, y: m.y, z: m.z, ry: m.id })),
      (k) => tpl[k] || (tpl[k] = buildMushroom(k)), { chunk: 48, view: 60 });
    this.mushField.build(this.scene);
  }

  buildStars() {
    this.starMeshes = this.world.stars.map((s) => {
      const m = buildStar();
      m.position.set(s.x, s.y, s.z);
      m.visible = !this.save.stars.includes(s.id);
      this.scene.add(m);
      return m;
    });
  }

  buildNpcs() {
    this.npcs = this.world.npcHomes.map((h) => {
      const n = buildNPC(h.type);
      n.root.visible = false;
      this.scene.add(n.root);
      return { home: h, model: n, heading: 0, x: h.x, z: h.z, speed: 0, moving: false };
    });
  }

  buildVendors() {
    const market = new THREE.Group(); // visi tirgotāji kopā — kopīgie izskati (kažoks, koks, drēbes) apvienojas
    this.vendors = VENDORS.map((v) => {
      const face = Math.atan2(-v.x, -v.z); // būdas priekša pret laukuma vidu
      const stall = buildStall(v);
      stall.position.set(v.x, VILLAGE_Y, v.z);
      stall.rotation.y = face;
      market.add(stall);
      // pārdevējs aiz letes
      const av = buildAnimal({ animal: v.animal, fur: v.fur, shirt: v.shirt, hat: v.id === 'hats' ? 'cilindrs' : v.id === 'seeds' ? 'salmu' : v.id === 'decor' ? 'vainags' : null });
      av.root.position.set(v.x - Math.sin(face) * 0.85, VILLAGE_Y + 0.36, v.z - Math.cos(face) * 0.85);
      av.root.rotation.y = face;
      for (let k = 0; k < 30; k++) av.animate(0.05, 'idle', 0);
      const n = makeTextSprite(v.name, { fontSize: 36 });
      n.position.set(0, 2.2, 0);
      av.root.add(n);
      market.add(av.root);
      // lete un būdas sienas — šķērslis (pircēji stāv priekšā)
      const rx = Math.cos(face), rz = -Math.sin(face);
      for (const k of [-1.3, 0, 1.3]) this.world.addCollider(v.x + rx * k - Math.sin(face) * 0.3, v.z + rz * k - Math.cos(face) * 0.3, 0.95);
      return { def: v };
    });
    // karodziņu virtenes starp blakus būdām (ap laukuma ziemeļu un austrumu pusi)
    const top = (v, side) => {
      const f = Math.atan2(-v.x, -v.z), rx = Math.cos(f), rz = -Math.sin(f);
      return { x: v.x + rx * side * 1.75 + Math.sin(f) * 0.6, y: VILLAGE_Y + 2.9, z: v.z + rz * side * 1.75 + Math.cos(f) * 0.6 };
    };
    const byAng = [...VENDORS].sort((p, q) => p.ang - q.ang);
    for (let i = 0; i + 1 < byAng.length; i++) {
      const p = byAng[i], q = byAng[i + 1];
      if (q.ang - p.ang > 70) continue;
      market.add(buildBunting(top(p, 1), top(q, -1), 0.6));
    }
    this.scene.add(flattenStatic(market));
    // saldējuma ratiņi, kas brauc pa apli
    this.ice = { cart: flattenStatic(buildCart('#ff8fb0', true)), av: buildAnimal({ animal: 'bebrs', fur: '#7a5230', shirt: '#ffffff', hat: null }) };
    this.scene.add(this.ice.cart);
    this.scene.add(this.ice.av.root);
    const it = makeTextSprite('🍦 Saldējums', { fontSize: 48, bg: 'rgba(255,143,176,0.9)' });
    it.position.y = 3.6;
    this.ice.cart.add(it);
    this.ice.pos = new THREE.Vector3();
  }

  // Kartes pamatattēli zemēm ar reljefu (sēta, mežs, trase); minikarte rāda apkārtni ap spēlētāju (pagriezta pēc
  // skatīšanās virziena — bulta vienmēr centrā un uz augšu), pieskaroties — liela karte (šī zeme / visas zemes).
  // Kopējās kartes koordinātas: lokālā pozīcija + zemes nobīde (zoneOffset), tā redzamas visas zemes kopā.
  buildMinimap() {
    this.mapR = PLAY_RADIUS + 10;
    if (!this.mapBases) this.mapBases = { [FOREST]: this.mapBase(this.world), [FARM]: this.mapBase(this.farmW), [RACE]: this.mapBase(this.raceW) };
    this.mapHi = {};
    this.mapCtx = $('minimap').getContext('2d');
    $('minimap').addEventListener('click', () => this.openBigMap());
  }

  // b — apgabals vietējās koordinātēs {x0, z0, x1, z1} (tuvinātai kartei); citādi visa zeme
  mapBase(W, MS = 360, b = null) {
    const R = ZONE_HALF;
    b = b || { x0: -R, z0: -R, x1: R, z1: R };
    const c = document.createElement('canvas');
    c.width = c.height = MS;
    const g = c.getContext('2d');
    const img = g.createImageData(MS, MS);
    const farm = W.mode === 'farm';
    const st = (b.x1 - b.x0) / MS;
    for (let py = 0; py < MS; py++) for (let px = 0; px < MS; px++) {
      const x = b.x0 + (px + 0.5) / MS * (b.x1 - b.x0), z = b.z0 + (py + 0.5) / MS * (b.z1 - b.z0);
      const h = W.getHeight(x, z);
      let col;
      const tun = W.trackIdx && W.inTunnel(x, z);
      if (h < WATER_Y && !farm) col = h < -1.5 ? [44, 110, 170] : [59, 143, 205];
      else if (h < 0.9 && !farm) col = [222, 205, 150];
      else if (W.trackIdx && W.trackDist(x, z) < TRACK_WIDTH / 2) col = tun ? [60, 60, 66] : [90, 90, 96];
      else if (tun) col = [92, 120, 70];
      else if (W.roadDist(x, z).d < 2.5) col = [160, 130, 90];
      else if (h > 18) col = [150, 148, 132];
      else if (W.forest(x, z) > 0.12) col = [52, 100, 42];
      else col = farm ? [128, 182, 82] : [111, 170, 72];
      if (farm) { const yp = yardPart(x, z); if (yp) col = yp === 'house' ? [170, 60, 48] : yp === 'green' ? [205, 230, 235] : yp === 'garden' ? [168, 140, 98] : [146, 196, 98]; }
      // vieglas ēnas pēc slīpuma
      const sh = Math.max(-25, Math.min(25, (W.getHeight(x - st * 1.4, z - st * 1.4) - h) * 9 * 1.4 / Math.max(0.6, st)));
      col = col.map((v) => Math.max(0, Math.min(255, v + sh)));
      const k = (py * MS + px) * 4;
      img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // visas zemes: Mežvidi no pamatattēla, blakus zemes — vienkrāsaini kvadrāti ar nosaukumu
  drawLands(g, toPx, labels, hiZone = null) {
    const H = ZONE_HALF;
    for (const id of ZONE_IDS) {
      const [ox, oz] = zoneOffset(id), Z = ZONES[id], [bx0, bz0, bx1, bz1] = zoneBounds(id);
      const [x0, y0] = toPx(ox + bx0, oz + bz0), [x1, y1] = toPx(ox + bx1, oz + bz1);
      const base = (hiZone === id && this.mapHi[id]) || this.mapBases[id];
      if (base) g.drawImage(base, x0, y0, x1 - x0, y1 - y0);
      else if (id === 'n') g.drawImage(winterMap(), x0, y0, x1 - x0, y1 - y0); // ziemas zemei — īsta karte
      else if (id === 's') g.drawImage(trailMap(), x0, y0, x1 - x0, y1 - y0); // piedzīvojumu mežs (2× garāks)
      else {
        g.fillStyle = Z.map; g.fillRect(x0, y0, x1 - x0, y1 - y0);
        // grants ceļš
        const rl = (this.plainRoadCache = this.plainRoadCache || {})[id] || (this.plainRoadCache[id] = plainRoads(id).map((p) => smoothRoad(p, 6)));
        g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
        g.strokeStyle = '#8a6a44'; g.lineWidth = Math.max(1.5, Math.abs(toPx(7, 0)[0] - toPx(0, 0)[0]));
        for (const l of rl) { g.beginPath(); l.forEach((p, i) => { const [px, py] = toPx(ox + p.x, oz + p.z); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); }
        g.restore();
      }
      if (id === 'n' && (labels || this.zone === 'n')) {
        g.font = (labels ? 14 : 11) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const [ic, x, z] of WINTER_ICONS) { const [px, py] = toPx(ox + x, oz + z); g.fillText(ic, px, py); }
      }
      if (id === 's' && (labels || this.zone === 's')) {
        const step = this.trail ? this.trail.step : 0;
        for (const [ic, x, z, k] of trailIcons(this.trail)) { const [px, py] = toPx(ox + x, oz + z); this.mapIcon(g, ic, px, py, labels ? 15 : 11, k === step ? 'rgba(255,200,60,0.95)' : null); }
      }
      g.strokeStyle = 'rgba(90,60,30,0.8)'; g.lineWidth = 1; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (labels === 'all') {
        const [cx, cy] = toPx(ox, oz);
        g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.strokeText(`${Z.icon} ${Z.name}`, cx, cy);
        g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillText(`${Z.icon} ${Z.name}`, cx, cy);
      }
    }
  }

  // spēlētāja pozīcija kopējā kartē
  globalPos(zone, x, z) { const [ox, oz] = zoneOffset(zone || 'c'); return [x + ox, z + oz]; }

  // ikona ar baltu apli (labi redzama uz jebkuras zemes)
  mapIcon(g, ic, x, y, size, ring = null) {
    g.beginPath(); g.arc(x, y, size * 0.72, 0, 6.3);
    g.fillStyle = ring || 'rgba(255,255,255,0.85)'; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.stroke();
    g.font = size + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ic, x, y + size * 0.06);
  }
  mapLabel(g, text, x, y, size = 12, color = '#fff') {
    g.font = `bold ${size}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(text, x, y);
    g.fillStyle = color; g.fillText(text, x, y);
  }
  // bulta (spēlētājs): virziens h pasaulē, rot — kartes pagrieziens
  mapArrow(g, x, y, h, rot, k, fill, stroke) {
    g.save(); g.translate(x, y); g.rotate(Math.atan2(Math.cos(h), Math.sin(h)) + rot + Math.PI / 2);
    g.fillStyle = fill;
    g.beginPath(); g.moveTo(0, -7 * k); g.lineTo(5 * k, 5.5 * k); g.lineTo(0, 3 * k); g.lineTo(-5 * k, 5.5 * k); g.closePath(); g.fill();
    g.strokeStyle = stroke; g.lineWidth = 1.6; g.stroke();
    g.restore();
  }

  // zoom: 0 — minikarte, 1 — zemes karte, 2 — visas zemes
  mapMarkers(g, toPx0, zoom, rot = 0) {
    const big = zoom > 0, IS = zoom === 1 ? 20 : zoom === 2 ? 13 : 11;
    const [fx, fz] = zoneOffset(FOREST), [rx, rz] = zoneOffset(RACE), [hx, hz] = zoneOffset(FARM);
    const toPx = (x, z) => toPx0(x + fx, z + fz); // meža objekti
    for (const p of this.world.places) { const [px, py] = toPx(p.x, p.z); if (big) this.mapIcon(g, PLACES[p.id].icon, px, py, IS); else { g.font = IS + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(PLACES[p.id].icon, px, py); } }
    const mg = this.mg;
    if (this.mgIn && this.mgIn()) {
      const [cx, cy] = toPx(mg.cx, mg.cz), [ex, ey] = toPx(mg.cx + mg.R, mg.cz);
      g.strokeStyle = '#ff3030'; g.lineWidth = 2; g.setLineDash([5, 4]);
      g.beginPath(); g.arc(cx, cy, Math.hypot(ex - cx, ey - cy), 0, 6.3); g.stroke(); g.setLineDash([]);
    }
    g.fillStyle = '#ffe14a';
    this.world.stars.forEach((s) => {
      if (this.save.stars.includes(s.id) || !this.save.revealed) return;
      const [px, py] = toPx(s.x, s.z);
      g.beginPath(); g.arc(px, py, big ? 4 : 2, 0, 6.3); g.fill();
    });
    if (zoom === 1) {
      // tirgotāji un aka meža ciematā
      for (const v of VENDORS) { const [px, py] = toPx(v.x, v.z); this.mapIcon(g, v.title.split(' ')[0], px, py, 16); }
      const [wx, wy] = toPx(0, 0); this.mapIcon(g, '🪙', wx, wy, 16, 'rgba(160,220,255,0.9)');
      const [ix, iy] = toPx(this.ice.pos.x, this.ice.pos.z); this.mapIcon(g, '🍦', ix, iy, 14);
    } else { const [vx, vy] = toPx(0, 0); if (big) this.mapIcon(g, '🛒', vx, vy, IS); else { g.font = IS + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🛒', vx, vy); } }
    const [kx, ky] = toPx0(this.raceW.kartSpot.x + rx, this.raceW.kartSpot.z + rz);
    if (big) this.mapIcon(g, '🏎️', kx, ky, IS); else { g.font = IS + 'px sans-serif'; g.fillText('🏎️', kx, ky); }
    if (big) {
      // sētas un to īpašnieki
      for (let slot = 0; slot < 4; slot++) {
        const [sx, sz] = plotSign(slot), [px, py] = toPx0(hx + sx * 45, hz + sz * 45);
        let owner = null;
        for (const [, pr] of this.profiles) if (pr.slot === slot) owner = pr.name;
        if (zoom === 1 || owner) this.mapLabel(g, owner ? `🏡 ${owner}` : '🌾 brīva', px, py, zoom === 1 ? 15 : 11, owner ? '#fff' : '#e8e0c0');
      }
    } else { const [ux, uy] = toPx0(hx, hz); g.font = IS + 'px sans-serif'; g.fillText('🏡', ux, uy); }
    // transports (mašīnas, velosipēds, sniega motocikls)
    for (const v of this.vehMarkers()) {
      if (v.driven) continue; // braucošo rāda pie braucēja
      const [px, py] = toPx0(...this.globalPos(v.zone, v.x, v.z));
      this.mapIcon(g, v.kind === 'car' ? '🚙' : v.kind === 'bike' ? '🚲' : v.kind === 'boat' ? '🚣' : '🛷', px, py, zoom === 1 ? 17 : zoom === 2 ? 12 : 10, v.color);
    }
    // autobuss un pieturas (globālās koordinātēs)
    if (this.bus && this.bus.zone) {
      const named = new Set();
      if (zoom > 0) for (const s of BUS_STOPS) {
        const [px, py] = toPx0(s.x, s.z); this.mapIcon(g, '🚏', px, py, zoom === 1 ? 14 : 10, 'rgba(255,255,255,0.9)');
        if ((this.mapK || 1) >= 2.5 && !named.has(s.name)) { named.add(s.name); this.mapLabel(g, s.name, px, py + 16, 11, '#cfe4ff'); }
      }
      for (const B of this.buses) {
        if (!B.zone) continue;
        const [ox, oz] = zoneOffset(B.zone), [px, py] = toPx0(B.lx + ox, B.lz + oz);
        this.mapIcon(g, '🚌', px, py, zoom === 1 ? 19 : zoom === 2 ? 14 : 12, '#1f6fd6');
      }
    }
    // draugi
    for (const [, r] of this.remotes) {
      if (!r.seen || (this.mgHidden && this.mgHidden(r.id))) continue;
      const [px, py] = toPx0(...this.globalPos(r.zone, r.pos.x, r.pos.z));
      const col = PLAYER_DOT[(r.prof.slot || 0) % 4];
      const vk = r.vehCode === 2 ? '🚙' : r.vehCode === 5 ? '🚲' : r.vehCode === 3 ? '🛷' : r.vehCode === 1 ? '🏎️' : r.vehCode === 7 ? '🚣' : null;
      if (vk && big) this.mapIcon(g, vk, px, py, zoom === 1 ? 17 : 12, col);
      this.mapArrow(g, px, py, r.ry, rot, big ? (zoom === 1 ? 1.6 : 1.2) : 1, col, '#fff');
      if (big) this.mapLabel(g, r.prof.name, px, py - (zoom === 1 ? 20 : 14), zoom === 1 ? 14 : 11);
    }
    const [mx, my] = toPx0(...this.globalPos(this.zone, this.me.pos.x, this.me.pos.z));
    const h = this.me.inKart ? this.me.kart.heading : this.me.veh ? this.me.veh.heading : this.me.heading;
    this.mapArrow(g, mx, my, h, rot, zoom === 1 ? 1.9 : zoom === 2 ? 1.4 : 1.15, '#fff', '#d00');
    if (big) this.mapLabel(g, 'Tu', mx, my - (zoom === 1 ? 22 : 15), zoom === 1 ? 14 : 11, '#ffe14a');
  }

  // minikarte: spēlētājs centrā, bulta uz augšu; karte griežas ap viņu (augša — kur skaties/ej)
  drawMinimap() {
    const g = this.mapCtx, S = 140, c = S / 2;
    const VIEW = 110; // metri no centra līdz minikartes malai
    const [cx, cz] = this.globalPos(this.zone, this.me.pos.x, this.me.pos.z);
    const scale = S / (2 * VIEW);
    const h = this.me.inKart ? this.me.kart.heading : this.me.veh ? this.me.veh.heading : this.me.heading;
    const rot = -Math.PI / 2 - Math.atan2(Math.cos(h), Math.sin(h));
    const cs = Math.cos(rot), sn = Math.sin(rot);
    g.fillStyle = '#4d5a40'; g.fillRect(0, 0, S, S);
    g.save(); g.translate(c, c); g.rotate(rot);
    this.drawLands(g, (x, z) => [(x - cx) * scale, (z - cz) * scale], false);
    g.restore();
    const toPx = (x, z) => { const dx = (x - cx) * scale, dy = (z - cz) * scale; return [c + dx * cs - dy * sn, c + dx * sn + dy * cs]; };
    this.mapMarkers(g, toPx, 0, rot);
    // ziemeļu zīme uz malas
    const nx = c + sn * (c - 9), ny = c - cs * (c - 9);
    g.beginPath(); g.arc(nx, ny, 8, 0, 6.3); g.fillStyle = 'rgba(200,30,30,0.9)'; g.fill();
    g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText('N', nx, ny + 0.5);
  }

  // liela karte: vispirms zeme, kurā esi (detalizēti), poga — visas zemes; pieskaroties zemei visu zemju skatā — tuvāk
  openBigMap() {
    const view = { all: false, zone: this.zone, k: 1, cx: 0, cy: 0 }; // k — tuvinājums (ar diviem pirkstiem), cx/cy — skata centrs
    const box = $('panel').querySelector('.panel-box');
    let timer = null;
    showPanel('🗺️ Karte', (b) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // 1.31.0: liela 16:9 karte; kartes kvadrāts (S×S, S = platums) — sākumā aizpilda platumu, var tālināt līdz visai zemei
      const CW = Math.floor(Math.min(window.innerWidth * 0.97 - 20, (window.innerHeight - 84) * 16 / 9)), CH = Math.round(CW * 9 / 16);
      const css = CW;
      const wrap = el('div', { className: 'bigmap' });
      wrap.style.width = CW + 'px'; wrap.style.height = CH + 'px';
      const c = document.createElement('canvas');
      c.width = Math.round(CW * dpr); c.height = Math.round(CH * dpr);
      c.style.cssText = `width:${CW}px;height:${CH}px;display:block;touch-action:none`;
      wrap.append(c);
      b.append(wrap);
      const g = c.getContext('2d');
      const row = el('div', { className: 'bm-row' });
      const btn = el('button', { className: 'pbtn' }, '');
      const back = el('button', { className: 'pbtn', style: 'background:#7a8a6a' }, '');
      row.append(btn, back);
      const zin = el('button', { className: 'bm-z' }, '➕'), zout = el('button', { className: 'bm-z' }, '➖');
      const zcol = el('div', { className: 'bm-zoom' }, zin, zout);
      const legend = el('div', { className: 'bm-legend' }, '');
      let toPxNow = null, detail = null, detailT = null;
      const KMIN = CH / css;
      view.cx = view.cy = css / 2;
      const clampView = () => {
        view.k = Math.min(8, Math.max(KMIN, view.k));
        const hx = CW / (2 * view.k), hy = CH / (2 * view.k);
        view.cx = hx * 2 >= css ? css / 2 : Math.min(css - hx, Math.max(hx, view.cx));
        view.cy = hy * 2 >= css ? css / 2 : Math.min(css - hy, Math.max(hy, view.cy));
      };
      // visas zemes — redzamas pilnībā; viena zeme — aizpilda platumu
      const resetZoom = () => { view.k = view.all ? KMIN : 1; view.cx = view.cy = css / 2; detail = null; clampView(); };
      // tuvinātai zemes kartei — detalizēts attēls redzamajam apgabalam (uzzīmē, kad pirksti apstājas)
      const wantDetail = () => {
        clearTimeout(detailT);
        if (view.all || view.k < 2.2) return;
        detailT = setTimeout(() => {
          const W = this.landWorld(view.zone);
          if (!W || view.all || view.k < 2.2 || !c.isConnected) return;
          const [ox, oz] = zoneOffset(view.zone), R = this.mapR, span = 2 * R / view.k * 1.25 * (CW / css);
          const mx = (view.cx / css) * 2 * R - R, mz = (view.cy / css) * 2 * R - R;
          const b = { x0: mx - span / 2, z0: mz - span / 2, x1: mx + span / 2, z1: mz + span / 2 };
          try { detail = { zone: view.zone, b, c: this.mapBase(W, Math.min(420, Math.round(css * dpr * 0.8)), b) }; } catch (e) { console.warn(e); }
          void ox; void oz;
          draw();
        }, 350);
      };
      let raf = 0;
      const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
      const draw = () => {
        const S = css;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        let toPx0;
        if (view.all) {
          const E = ZONE_HALF * 4, CZ = ZONE_HALF; // visas 5 zemes krusta formā (dienvidu zeme 2× garāka)
          toPx0 = (x, z) => [(x + E) / (2 * E) * S, (z - CZ + E) / (2 * E) * S];
        } else {
          const [ox, oz0] = zoneOffset(view.zone), R = this.mapR * (view.zone === 's' ? 2 : 1), oz = oz0 + (view.zone === 's' ? ZONE_HALF : 0);
          toPx0 = (x, z) => [(x - ox + R) / (2 * R) * S, (z - oz + R) / (2 * R) * S];
        }
        const toPx = (x, z) => { const [px, py] = toPx0(x, z); return [(px - view.cx) * view.k + CW / 2, (py - view.cy) * view.k + CH / 2]; };
        toPxNow = toPx;
        g.fillStyle = '#2e3a2a'; g.fillRect(0, 0, CW, CH);
        g.imageSmoothingEnabled = true;
        this.drawLands(g, toPx, view.all ? 'all' : false, view.all ? null : view.zone);
        if (detail && !view.all && detail.zone === view.zone && view.k >= 2.2) {
          const [ox, oz] = zoneOffset(view.zone), [x0, y0] = toPx(detail.b.x0 + ox, detail.b.z0 + oz), [x1, y1] = toPx(detail.b.x1 + ox, detail.b.z1 + oz);
          g.drawImage(detail.c, x0, y0, x1 - x0, y1 - y0);
        }
        this.mapK = view.k;
        this.mapMarkers(g, toPx, view.all ? 2 : 1, 0);
        this.mapK = 1;
        if (view.k > 1.01) this.mapLabel(g, `🔍 ×${view.k.toFixed(1)}`, 34, CH - 14, 12);
        // ziemeļi
        this.mapLabel(g, '⬆ N', CW - 26, 16, 13);
        const Z = ZONES[view.zone], ZH = ZONES[this.zone];
        $('panel-title').textContent = view.all ? '🗺️ Visas zemes' : `🗺️ ${Z.icon} ${Z.name}`;
        btn.textContent = view.all ? `🔍 Tuvāk: ${ZH.icon} ${ZH.name}` : '🧭 Visas zemes';
        back.style.display = !view.all && view.zone !== this.zone ? '' : 'none';
        back.textContent = `📍 Kur esmu: ${ZH.icon} ${ZH.name}`;
        legend.textContent = view.all
          ? 'Pieskaries zemei, lai to redzētu tuvāk · 2 pirksti — tuvināt · bultas — spēlētāji'
          : `${view.zone === FOREST ? '🌱🧺🎩🐾🏡 tirgotāji · 🪙 aka · ' : ''}${this.save.revealed ? '⭐ zvaigznes · ' : ''}bultas — spēlētāji · 🚙🚲🛷🚌 transports · velc, 2 pirksti — tuvināt`;
      };
      btn.addEventListener('click', () => { view.all = !view.all; if (!view.all) view.zone = this.zone; resetZoom(); ensureHi(); draw(); });
      back.addEventListener('click', () => { view.all = false; view.zone = this.zone; resetZoom(); ensureHi(); draw(); });
      const zoomAt = (f, px = CW / 2, py = CH / 2) => {
        const mx = view.cx + (px - CW / 2) / view.k, my = view.cy + (py - CH / 2) / view.k;
        view.k *= f; clampView();
        view.cx = mx - (px - CW / 2) / view.k; view.cy = my - (py - CH / 2) / view.k; clampView();
        redraw(); wantDetail();
      };
      zin.addEventListener('click', () => zoomAt(1.6));
      zout.addEventListener('click', () => zoomAt(1 / 1.6));
      // pirksti: viens — bīdīt, divi — tuvināt/tālināt (pinch); pele — ritenītis
      const ptrs = new Map();
      let gest = null, dragged = false;
      const loc = (e) => { const rc = c.getBoundingClientRect(); return [e.clientX - rc.left, e.clientY - rc.top]; };
      const startGest = () => {
        const p = [...ptrs.values()];
        if (p.length === 1) gest = { pan: true, p: p[0], cx: view.cx, cy: view.cy };
        else if (p.length >= 2) {
          const [a, b] = p, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          gest = { pan: false, d: Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])), m, k: view.k, mx: view.cx + (m[0] - CW / 2) / view.k, my: view.cy + (m[1] - CH / 2) / view.k };
        } else gest = null;
      };
      c.addEventListener('pointerdown', (e) => { try { c.setPointerCapture(e.pointerId); } catch (_) { /* nav */ } ptrs.set(e.pointerId, loc(e)); if (ptrs.size === 1) dragged = false; startGest(); });
      c.addEventListener('pointermove', (e) => {
        if (!ptrs.has(e.pointerId) || !gest) return;
        ptrs.set(e.pointerId, loc(e));
        const p = [...ptrs.values()];
        if (gest.pan) {
          const dx = p[0][0] - gest.p[0], dy = p[0][1] - gest.p[1];
          if (Math.hypot(dx, dy) > 6) dragged = true;
          view.cx = gest.cx - dx / view.k; view.cy = gest.cy - dy / view.k; clampView(); redraw();
        } else if (p.length >= 2) {
          dragged = true;
          const [a, b] = p, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          view.k = gest.k * Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])) / gest.d; clampView();
          view.cx = gest.mx - (m[0] - CW / 2) / view.k; view.cy = gest.my - (m[1] - CH / 2) / view.k; clampView();
          redraw();
        }
      });
      const up = (e) => { if (!ptrs.delete(e.pointerId)) return; startGest(); wantDetail(); };
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
      c.addEventListener('wheel', (e) => { e.preventDefault(); const [px, py] = loc(e); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, px, py); }, { passive: false });
      c.addEventListener('click', (e) => {
        if (dragged || !view.all || !toPxNow) return;
        const rc = c.getBoundingClientRect(), px = e.clientX - rc.left, py = e.clientY - rc.top;
        for (const id of ZONE_IDS) {
          const [ox, oz] = zoneOffset(id), [bx0, bz0, bx1, bz1] = zoneBounds(id), [x0, y0] = toPxNow(ox + bx0, oz + bz0), [x1, y1] = toPxNow(ox + bx1, oz + bz1);
          if (px >= x0 && px <= x1 && py >= y0 && py <= y1) { view.all = false; view.zone = id; resetZoom(); ensureHi(); draw(); return; }
        }
      });
      // detalizētāks zemes attēls (uzzīmē vienreiz, kad pirmoreiz atver tuvāk)
      const ensureHi = () => {
        const id = view.zone, W = this.landWorld(id);
        if (view.all || !W || this.mapHi[id] || this.mapHiBusy) return;
        this.mapHiBusy = true;
        setTimeout(() => { try { this.mapHi[id] = this.mapBase(W, 560); } catch (e) { console.warn(e); } this.mapHiBusy = false; if (panelOpen()) draw(); }, 30);
      };
      wrap.append(zcol, row, legend);
      resetZoom();
      draw();
      ensureHi();
      timer = setInterval(() => { if (!c.isConnected) clearInterval(timer); else if (panelOpen()) draw(); }, 300);
    }, () => { clearInterval(timer); box.classList.remove('wide', 'map'); });
    box.classList.add('wide', 'map');
  }

  // ======================= Zemes (pāreja uz blakus kartēm) =======================
  // Robežu var šķērsot jebkurā vietā, ja aiz tās ir kaimiņu zeme: tuvojoties parādās brīdinājums, aiz robežas — pāreja
  updateExits(dt) {
    this.exitWarnT = Math.max(0, (this.exitWarnT || 0) - dt);
    const sign = $('zone-sign');
    if (this.zoneBusy) return;
    if (this.me.ride) { sign.classList.add('hidden'); return; } // pasažieris brauc līdzi vadītājam (updateRide)
    const p = this.me.pos, H = ZONE_HALF;
    let near = null;
    for (const s of openSides(this.zone)) {
      const al = alongLat(p.x, p.z, s);
      if (al.along > H - 18 && (!near || al.along > near.along)) near = { s, ...al };
    }
    if (!near) { sign.classList.add('hidden'); return; }
    const dest = neighbour(this.zone, near.s);
    const Z = ZONES[dest];
    const txt = near.along > H - 4 ? `🧭 Ej tālāk, lai pārietu uz: ${Z.icon} ${Z.name}` : `🧭 Robeža tuvu! Aiz tās — ${Z.icon} ${Z.name}`;
    if (sign.textContent !== txt) sign.textContent = txt;
    sign.classList.remove('hidden');
    if (near.along > H + CROSS_AT) {
      const warn = (m) => { if (this.exitWarnT <= 0) { this.exitWarnT = 4; toast(m); } };
      if (this.me.inKart) return warn('🏎️ Ar kartu uz citu zemi nevar — izkāp un ej kājām!');
      if (this.mgIn && this.mgIn()) return warn('🎲 Spēles laikā nevar aiziet uz citu zemi!');
      if (this.vehicleBlocksExit(warn)) return;
      this.travel(dest, near.s);
    }
  }

  // ielādes ekrāns → izlādē veco zemi, ielādē jauno → ielādes ekrāns pazūd
  travel(dest, side) {
    this.zoneBusy = true;
    $('zone-sign').classList.add('hidden');
    const Z = ZONES[dest];
    $('load-name').textContent = `${Z.icon} ${Z.name}`;
    const scr = $('zone-load');
    scr.classList.add('on');
    sfx('beep');
    const [dx, dz] = DIRS[side], p = this.me.pos;
    const along = p.x * dx + p.z * dz;
    // ierodamies jaunās zemes pretējā malā tajā pašā vietā gar robežu
    const pos = { x: p.x - dx * along - dx * (ZONE_HALF - 6), z: p.z - dz * along - dz * (ZONE_HALF - 6) };
    this.teleport(dest, pos, Math.atan2(dx, dz), true);
  }

  // ielādes ekrāns → cita zeme, konkrēta vieta (arī ciemošanās pie drauga sētā)
  teleport(dest, pos, heading, busy = false) {
    const Z = ZONES[dest];
    if (!busy) {
      this.zoneBusy = true;
      $('zone-sign').classList.add('hidden');
      $('load-name').textContent = `${Z.icon} ${Z.name}`;
      $('zone-load').classList.add('on');
    }
    const scr = $('zone-load');
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    const t0 = performance.now();
    (async () => {
      if (this.net && this.net.busyPing) this.net.busyPing(45); // 1.48.0: ielāde var aizņemt lapu — draugi tik ilgi negaida sirdspukstus
      await new Promise((r) => setTimeout(r, 380)); // ekrāns paspēj aptumšoties
      let ready;
      try { ready = this.switchZone(dest, pos, heading); } catch (e) { console.error(e); }
      await Promise.race([ready, new Promise((r) => setTimeout(r, 8000))]);
      // pirmais kadrs jaunajā zemē (ēnotāju kompilēšana) vēl zem ielādes ekrāna
      this.updateCamera(0.016); this.renderFrame();
      await frame();
      await new Promise((r) => setTimeout(r, Math.max(0, 700 - (performance.now() - t0))));
      scr.classList.remove('on');
      this.zoneBusy = false;
      this.persist();
      toast(`📍 ${Z.icon} ${Z.name}`, 'good');
    })();
  }

  // Noņem iepriekšējo zemi un ieliek jauno. Mežvidi tiek pilnībā izlādēti (to stāvokli glabā saimnieks
  // un tavs saglabājums) un atgriežoties uzbūvēti no jauna; blakus zemes arī tiek izmestas no atmiņas.
  switchZone(id, pos, heading) {
    const prev = this.zone;
    let ready = Promise.resolve();
    if (this.fishing) this.stopFishing();
    if (this.me && this.me.carry && (id !== FARM || prev !== FARM)) this.stowCarry();
    if (prev !== id) {
      if (prev === 'n') this.leaveWinter();
      if (prev === 's') this.leaveTrail();
      if (prev === FOREST) this.unloadForest();
      else if (prev === FARM) this.unloadFarm();
      else if (prev === RACE) this.unloadRace();
      else if (this.terr && this.terr.dispose) this.terr.dispose();
      this.zone = id;
      if (id === FOREST) ready = this.reloadForest();
      else if (id === FARM) ready = this.loadFarm();
      else if (id === RACE) ready = this.loadRace();
      else {
        this.terr = id === 'n' ? new WinterZone(id, this.Q.photo) : id === 's' ? new TrailZone(id, this) : new PlainZone(id, this.Q.photo);
        ready = this.terr.build(this.stage);
      }
      if (id === 'n') this.enterWinter();
    } else if (id === FARM && !this.farmOn) ready = this.loadFarm();
    this.me.pos.set(pos.x, 0, pos.z);
    this.terr.collide(this.me.pos, 0.6); // neierodamies kokā vai mājā
    this.me.pos.y = this.terr.groundAt(this.me.pos.x, this.me.pos.z);
    this.me.vy = 0; this.me.onGround = true;
    if (id === 's' && prev !== 's') this.enterTrail();
    if (heading != null) { this.me.heading = heading; this.cam.yaw = heading + Math.PI; }
    this.camInit = false;
    if (this.pet) this.pet.init = false;
    this.timers.vis = 0; this.timers.send = 0; this.timers.map = 0; this.timers.action = 0;
    this.vehicleZoneChanged(heading);
    this.updateTeamBar();
    return ready;
  }

  findZoneAction() {
    const p = this.me.pos, t = this.now();
    if (this.fishing) return this.fishButton(); // 1.45.0: makšķerē takas dīķī
    if (this.zone === 'n') { const w = this.winterActions(); if (w) return w; }
    let best = null, bd = 1e9;
    const consider = (d, max, label, fn) => { if (d < max && d < bd) { bd = d; best = { label, fn }; } };
    const d2 = (x, z) => Math.hypot(x - p.x, z - p.z);
    if (this.pet && !this.pet.inCar && !(this.petCd > t)) consider(d2(this.pet.x, this.pet.z) + 1.2, 2.6, `🤗 Paglaudīt: ${PETS[this.pet.id].name}`, () => this.petMyPet());
    if (this.zone === FARM) this.farmActions(consider, d2);
    if (this.zone === 's') this.trailActions(consider, d2);
    if (this.zone === RACE) { const ks = this.raceW.kartSpot; consider(d2(ks.x, ks.z), 3.5, '🏎️ Sēsties kartā', () => this.enterKart()); }
    this.vehicleActions(consider, d2);
    this.busActions(consider, d2);
    return best;
  }

  // ======================= HUD =======================
  bindHud() {
    const press = (id, fn) => {
      const b = $(id);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(e); });
    };
    press('btn-jump', () => { this.controls.jumpPressed = true; });
    press('btn-action', () => this.doAction());
    press('btn-emote', () => this.toggleEmotes());
    press('btn-bag', () => this.openBag());
    press('btn-quests', () => this.openQuests());
    press('btn-glevel', () => this.openGardenInfo());
    press('btn-menu', () => this.openMenu());
    press('btn-room', () => this.openRoom());
    press('btn-exit-kart', () => (this.me.bus ? this.leaveBus() : this.me.ride ? this.leaveRide() : this.me.veh ? this.exitVehicle() : this.exitKart()));
    press('btn-race', () => { this.net.toHost({ t: 'raceReq' }); sfx('beep'); });
    press('btn-games', () => this.openGames());
    $('panel-close').addEventListener('click', () => closePanel());
    $('panel').addEventListener('pointerdown', (e) => { if (e.target.id === 'panel') closePanel(); });
    const em = $('emote-menu');
    EMOTES.forEach((t) => {
      const b = el('button', { className: 'pill' }, t);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.net.toHost({ t: 'emote', text: t });
        em.classList.add('hidden');
      });
      em.append(b);
    });
    $('hud').classList.remove('hidden');
    document.body.classList.add('playing');
    this.updateRoomButton();
  }

  toggleEmotes() { $('emote-menu').classList.toggle('hidden'); }

  updateRoomButton() {
    const n = 1 + this.remotes.size;
    $('btn-room').textContent = this.net.offline ? '🌲 Viens' : `👥 ${n}/4 · ${this.roomCode}`;
  }

  updateCoins() { $('coins').textContent = `🪙 ${this.save.coins}`; }

  // rokās nesamais: dārza rotājums vai takas priekšmets ('t:<veids>')
  carryModel(k) { return k.startsWith('t:') ? trailItem(k.slice(2)).clone() : buildDecor(k); }

  updateTeamBar() {
    if (this.zone === 's' && this.trail) { $('team-bar').textContent = this.trailBarText(); return; }
    const tm = this.team;
    if (!tm) return;
    const done = tm.c >= tm.target;
    $('team-bar').textContent = `🤝 Nedēļas mērķis: ${done ? '🏆' : ''}${(this.weeklyIcon && this.weeklyIcon()) || ''} ${Math.min(tm.c, tm.target)}/${tm.target}`;
  }

  addCoins(n, silent = false) {
    this.save.coins += n;
    this.updateCoins();
    if (!silent && n > 0) sfx('coin');
  }

  addItem(k, n = 1) { this.save.inv[k] = (this.save.inv[k] || 0) + n; }

  stat(name, n = 1) {
    this.save.stats[name] = (this.save.stats[name] || 0) + n;
    if (this.team && name === this.team.stat && this.myId >= 0) this.net.toHost({ t: 'teamAdd', n, w: this.team.w });
    this.checkQuests();
  }

  checkQuests() {
    for (const q of QUESTS) {
      if (this.save.quests[q.id]) continue;
      if ((this.save.stats[q.stat] || 0) >= q.need) {
        this.save.quests[q.id] = true;
        this.addCoins(q.reward, true);
        sfx('j_quest'); voice('q_done', { delay: 0.7 });
        toast(`📜 Uzdevums izpildīts: ${q.text}! +${q.reward}🪙`, 'good', 4000);
      }
    }
  }

  // ======================= Tīkls =======================
  myProf() {
    const s = this.save;
    return { name: s.name, animal: s.animal, fur: s.fur, shirt: s.shirt, hat: s.hat, wear: { ...(s.wear || {}) }, kartColor: s.kartColor, farm: this.farmView(), pet: s.pet || null, decor: this.decorView(), carry: this.me && this.me.carry ? this.me.carry.k : null };
  }
  // tēla izskats (buildAnimal)
  avatarProf() { const s = this.save; return { animal: s.animal, fur: s.fur, shirt: s.shirt, hat: s.hat, wear: s.wear || {} }; }

  setupNet() {
    const net = this.net;
    net.onMessage = (m) => this.onMessage(m);
    net.onHostMessage = (from, m) => this.hostHandle(from, m);
    net.onPeerLeave = (id) => this.hostPeerLeave(id);
    net.onDisconnect = (why) => this.onDisconnected(why);
    net.onStatus = (txt) => { if (!this.ended) toast(txt, txt.startsWith('✅') ? 'good' : '', 3500); };
    net.onReconnect = () => this.onReconnected();
    net.isBusy = () => !!this.zoneBusy; // zemes ielādes laikā klusumu neskaitām
  }

  start() {
    if (this.net.isHost) {
      this.hs = { profiles: new Map(), positions: new Map(), picked: {}, pickedB: {}, team: makeTeam(Date.now(), this.save.weekly), race: { phase: 'none', id: 0 }, mg: { kind: null, phase: 'none' } };
      this.hostInitVehs();
      this.hostInitTrail();
      this.hostTimer = setInterval(() => this.hostTick(), 100);
    }
    this.net.toHost({ t: 'hello', prof: this.myProf(), weekly: this.save.weekly });
    this.clock = new THREE.Clock();
    if (statsWanted()) this.toggleStats(true);
    const loop = () => {
      if (this.ended) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, this.clock.getDelta());
      try { this.update(dt); } catch (e) { this.loopError('update', e); }
      try { this.sendPos(dt); } catch (e) { this.loopError('send', e); }
      try { this.renderFrame(); } catch (e) { this.loopError('render', e); }
    };
    loop();
    this.saveHandler = () => this.persist();
    window.addEventListener('pagehide', this.saveHandler);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.persist(); });
    toast(`Sveiks, ${this.save.name}! Šī ir tava sēta 🏡 — uzar zemi un sēj. Mežs ar sēnēm un tirgu ir austrumos 🌲`, 'good', 6000);
  }

  persist() {
    if (!this.me) return;
    if (!this.me.inKart && !this.zoneBusy) {
      this.save.pos = { x: +this.me.pos.x.toFixed(1), z: +this.me.pos.z.toFixed(1) };
      this.save.zone = this.zone;
    }
    writeSave(this.save);
  }

  // 1.47.2: klients pieslēdzās saimniekam no jauna (pēc fona / pārtrūkuma) — saimniekam esam jauns spēlētājs ar jaunu id:
  // izkāpjam no transporta, atstājam nesamo takas lietu, aizmirstam vecos draugus un sakām „hello” vēlreiz
  onReconnected() {
    try { if (this.me.veh) this.exitVehicle(true); if (this.me.ride) this.leaveRide(); } catch (e) { console.warn(e); }
    try { if (this.me.carry && this.me.carry.trail != null && this.trailDropCarry) this.trailDropCarry(false); } catch (e) { console.warn(e); }
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
    this.profiles.clear();
    this.net.toHost({ t: 'hello', prof: this.myProf(), weekly: this.save.weekly, slot: this.mySlot });
  }

  onDisconnected(why) {
    if (this.ended || this.disconnected) return;
    this.disconnected = true;
    this.persist();
    showPanel('Savienojums pārtrūka', (b) => {
      b.append(el('p', {}, `${why}. Tavs progress ir saglabāts. 💾`));
      b.append(el('button', { className: 'pbtn', onclick: () => location.reload() }, 'Uz sākumu'));
    }, () => location.reload());
  }

  // --- saimnieka loģika ---
  hostHandle(from, m) {
    const hs = this.hs;
    if (!hs) return;
    const net = this.net;
    const now = Date.now();
    switch (m.t) {
      case 'gq': // klients pirms ielādes jautā, kura spēle — tad ielādē savu saglabājumu tai
        net.sendTo(from, { t: 'gi', g: { ...this.gameInfo, keep: { ...(this.gameInfo.keep || {}) } } });
        break;
      case 'hello': {
        // 1.47.2: tas pats spēlētājs pieslēdzies no jauna, kamēr vecais savienojums vēl nav aizvērts — veco atvienojam
        for (const [oid, op] of [...hs.profiles]) if (oid !== from && oid !== 0 && m.prof && op.name === m.prof.name) net.dropPeer(oid);
        const used = new Set([...hs.profiles.values()].map((p) => p.slot));
        let slot = 0; while (used.has(slot)) slot++;
        if (m.slot != null && m.slot >= 0 && m.slot < 4 && !used.has(m.slot)) slot = m.slot; // atpakaļ savā sētā
        const prof = { ...m.prof, slot };
        hs.profiles.set(from, prof);
        this.hostMergeWeekly(m.weekly);
        net.sendTo(from, { t: 'welcome', id: from, now, profiles: [...hs.profiles.entries()], picked: hs.picked, pickedB: hs.pickedB, team: hs.team, race: hs.race, mg: hs.mg, vehs: this.hostVehList(), trail: hs.trail });
        net.broadcast({ t: 'join', id: from, prof });
        net.broadcast({ t: 'team', team: hs.team });
        break;
      }
      case 'pos': {
        if (!Array.isArray(m.p)) return;
        hs.positions.set(from, m.p);
        this.hostVehPos(from, m.p);
        // uzreiz pārsūtām pārējiem (bez gaidīšanas uz kopējo sūtījumu) — mazāka aizture, gludāka kustība
        const msg = { t: 's', l: [[from, ...m.p]] };
        for (const [id, c] of net.conns) if (id !== from && c.open) c.send(msg);
        if (from !== 0) this.onMessage(msg);
        break;
      }
      case 'vehTake': case 'vehDrop': this.hostVeh(from, m); break;
      case 'gift': {
        // dāvana citam spēlētājam: saimnieks nodod tālāk; ja saņēmēja vairs nav — atpakaļ sūtītājam
        if (m.to === from || !hs.profiles.has(m.to)) { net.sendTo(from, { t: 'giftBack', g: m.g }); return; }
        const p = hs.profiles.get(from);
        net.sendTo(m.to, { t: 'gift', from, name: p ? p.name : '?', g: m.g });
        break;
      }
      case 'prof': {
        const old = hs.profiles.get(from);
        if (!old) return;
        const prof = { ...m.prof, slot: old.slot };
        hs.profiles.set(from, prof);
        net.broadcast({ t: 'prof', id: from, prof });
        break;
      }
      case 'pick': {
        const mu = this.world.mushrooms[m.id];
        if (!mu || hs.picked[m.id] > now) return;
        hs.picked[m.id] = now + MUSH_RESPAWN;
        net.broadcast({ t: 'picked', id: m.id, until: hs.picked[m.id], by: from });
        break;
      }
      case 'emote': net.broadcast({ t: 'emote', id: from, text: String(m.text).slice(0, 30) }); break;
      case 'water': net.broadcast({ t: 'water', owner: m.owner, plot: m.plot, by: from }); break;
      case 'raceReq': {
        const r = hs.race;
        if (r.phase === 'none' || r.phase === 'done') {
          hs.race = { phase: 'lobby', id: (r.id || 0) + 1, startAt: now + 12000, racers: [from], bots: 0, results: [] };
        } else if (r.phase === 'lobby') {
          if (!r.racers.includes(from) && r.racers.length < 4) r.racers.push(from);
        } else {
          net.sendTo(from, { t: 'toast', text: 'Sacīkstes jau notiek — pagaidi nākamās! ⏳' });
          return;
        }
        net.broadcast({ t: 'race', race: hs.race });
        break;
      }
      case 'raceLeave': {
        const r = hs.race;
        if (!r.racers || !r.racers.includes(from)) return;
        r.racers = r.racers.filter((x) => x !== from);
        if (r.phase === 'lobby' && r.racers.length === 0) hs.race = { phase: 'none', id: r.id };
        net.broadcast({ t: 'race', race: hs.race });
        break;
      }
      case 'raceFinish': {
        const r = hs.race;
        if (r.phase !== 'run' || !r.racers.includes(from) || r.results.some((x) => x.id === from)) return;
        const p = hs.profiles.get(from);
        r.results.push({ id: from, name: p ? p.name : '?', time: Math.max(1000, +m.time || 0) });
        net.broadcast({ t: 'race', race: r });
        break;
      }
      default: this.hostActivity(from, m);
    }
  }

  hostPeerLeave(id) {
    const hs = this.hs;
    hs.profiles.delete(id);
    hs.positions.delete(id);
    this.hostVehLeave(id);
    this.hostTrailLeave(id);
    if (hs.race.racers && hs.race.racers.includes(id)) {
      hs.race.racers = hs.race.racers.filter((x) => x !== id);
      if (hs.race.phase === 'lobby' && hs.race.racers.length === 0) hs.race = { phase: 'none', id: hs.race.id };
      this.net.broadcast({ t: 'race', race: hs.race });
    }
    this.net.broadcast({ t: 'leave', id });
  }

  botTime(botIdx, gridSlot) {
    const back = (6 + Math.floor(gridSlot / 2) * 5) * this.raceW.trackLen / TRACK_N;
    return (RACE_LAPS * this.raceW.trackLen + back) / BOTS[botIdx].speed * 1000;
  }

  hostTick() {
    const hs = this.hs, net = this.net, now = Date.now();
    this.hostMgTick(now);
    this.hostTrailTick(now);
    if (now - (this.weekCheck || 0) > 10000) {
      this.weekCheck = now;
      const nt = makeTeam(now, null);
      if (nt.w !== hs.team.w) { hs.team = nt; net.broadcast({ t: 'team', team: hs.team }); }
    }
    this.hostVehSave();
    const r = hs.race;
    if (r.phase === 'lobby' && now >= r.startAt - 4000) {
      r.phase = 'run';
      r.bots = Math.max(0, Math.min(BOTS.length, 4 - r.racers.length));
      net.broadcast({ t: 'race', race: r });
    } else if (r.phase === 'run') {
      const humansDone = r.racers.every((id) => r.results.some((x) => x.id === id));
      let maxBot = 0;
      for (let b = 0; b < r.bots; b++) maxBot = Math.max(maxBot, this.botTime(b, r.racers.length + b));
      const timeout = r.startAt + Math.max(maxBot, 60000) + 30000;
      if ((humansDone && now > r.startAt) || now > timeout) {
        const final = r.results.map((x) => ({ ...x }));
        for (let b = 0; b < r.bots; b++) final.push({ bot: b, name: BOTS[b].name, time: this.botTime(b, r.racers.length + b) });
        final.sort((a, b) => a.time - b.time);
        for (const id of r.racers) if (!r.results.some((x) => x.id === id)) {
          const p = hs.profiles.get(id);
          final.push({ id, name: p ? p.name : '?', time: null });
        }
        r.phase = 'done'; r.final = final; r.endAt = now;
        net.broadcast({ t: 'race', race: r });
      }
    } else if (r.phase === 'done' && now > r.endAt + 10000) {
      hs.race = { phase: 'none', id: r.id };
      net.broadcast({ t: 'race', race: hs.race });
    }
  }

  // --- ziņojumi visiem ---
  onMessage(m) {
    switch (m.t) {
      case 'welcome':
        this.myId = m.id;
        this.timeOffset = this.net.isHost ? 0 : m.now - Date.now();
        for (const [id, prof] of m.profiles) this.applyProfile(id, prof);
        this.picked = { ...(m.picked || {}) };
        this.berryPicked = { ...(m.pickedB || {}) };
        this.onTeam(m.team);
        this.onRace(m.race);
        if (m.mg) this.onMg(m.mg);
        this.applyVehs(m.vehs);
        if (m.trail) this.onTrail(m.trail);
        break;
      case 'veh': this.applyVeh(m.v); break;
      case 'gift': this.onGift(m); break;
      case 'giftBack': this.onGift({ g: m.g, back: true }); break;
      case 'join':
        if (m.id === this.myId) return;
        this.applyProfile(m.id, m.prof);
        toast(`👋 ${m.prof.name} pievienojās spēlei!`, 'good');
        sfx('beep');
        break;
      case 'leave': {
        const r = this.remotes.get(m.id);
        if (r) {
          toast(`${r.prof.name} aizgāja no spēles`);
          this.removeRemote(m.id);
        }
        break;
      }
      case 'prof': this.applyProfile(m.id, m.prof); break;
      case 's': {
        const nowL = this.now();
        for (const e of m.l) {
          if (e[0] === this.myId) continue;
          const r = this.remotes.get(e[0]);
          if (!r) continue;
          // e: [id, x, y, z, ry, anim, transports, progress, zeme, vadītājs, sēdvieta, transporta id, sūtīšanas laiks]
          const z = ZONE_IDS[e[8] || 0] || 'c';
          const zoneChanged = r.seen && r.zone !== z;
          if (zoneChanged) toast(`🧭 ${r.prof.name} devās uz: ${ZONES[z].icon} ${ZONES[z].name}`);
          r.zone = z;
          const st = e[12];
          if (!r.buf || zoneChanged || !r.seen) { r.buf = []; r.gap = null; r.jit = null; }
          if (typeof st === 'number') {
            // sūtītāja pulkstenis → mans (mazākā novērotā aizture; lēnām pielāgojas)
            const off = nowL - st;
            if (r.off == null || off < r.off) r.off = off; else r.off += (off - r.off) * 0.02;
            // tīkla svārstības (cik vēlāk par ātrāko ziņu pienāk šī): aizturi pielāgo tām — ātri pieaug, lēni samazinās
            const late = off - r.off;
            r.jit = r.jit == null ? late : lerp(r.jit, late, late > r.jit ? 0.25 : 0.01);
            let last = r.buf[r.buf.length - 1];
            // 1.47.1: drauga pulkstenis pārlēca atpakaļ (telefona laika labošana) — citādi visas jaunās pozīcijas tiktu
            // atmestas kā „vecas”, un draugs stāvētu uz vietas, līdz viņa laiks panāk veco
            if (last && st < last.t - 1500) { r.buf = []; r.gap = null; r.jit = null; r.off = off; last = null; }
            if (!last || st > last.t) {
              if (last) r.gap = r.gap == null ? st - last.t : lerp(r.gap, Math.min(400, st - last.t), 0.15);
              r.buf.push({ t: st, x: e[1], y: e[2], z: e[3], ry: e[4] });
              if (r.buf.length > 60) r.buf.splice(0, r.buf.length - 60);
              // ātrums (kamerai, iekāpšanai līdzi)
              const b = r.buf, n = b.length;
              if (n >= 2) {
                const a = b[n - 2], c = b[n - 1], it = Math.max(0.02, (c.t - a.t) / 1000);
                r.netVel = r.netVel || new THREE.Vector3();
                if (Math.hypot(c.x - a.x, c.z - a.z) / it > 60) r.netVel.set(0, 0, 0); else r.netVel.set((c.x - a.x) / it, (c.y - a.y) / it, (c.z - a.z) / it);
              }
            }
          }
          r.target.set(e[1], e[2], e[3]);
          r.tRy = e[4]; r.anim = ANIM[e[5]] || 'idle'; r.inKart = e[6] === 1; r.vehCode = e[6] | 0; r.rideDriver = e[9] == null ? -1 : e[9]; r.rideSeat = e[10] | 0; r.progress = e[7] || 0;
          r.vehId = typeof e[11] === 'string' ? e[11] : '';
          if (!r.seen || zoneChanged) { r.pos.copy(r.target); r.ry = r.tRy; r.seen = true; }
        }
        break;
      }
      case 'picked': {
        this.picked[m.id] = m.until;
        if (m.by === this.myId) {
          const mu = this.world.mushrooms[m.id];
          const def = MUSHROOMS[mu.type];
          if (def.poison) {
            this.me.dizzy = 6;
            sfx('bad');
            toast('🤢 Fui! Mušmire ir indīga — galva griežas! Tās neēd!', 'bad', 3500);
          } else {
            this.addItem(mu.type);
            this.stat('mushrooms');
            sfx('pick');
            toast(`🍄 Atradi: ${def.name}!`);
            this.spawnFloat('🍄', this.me.pos);
          }
        }
        break;
      }
      case 'emote': this.showEmote(m.id, m.text); break;
      case 'water': this.onFarmWater(m); break;
      case 'race': this.onRace(m.race); break;
      case 'toast': toast(m.text); break;
      default: this.onActivityMessage(m);
    }
  }

  applyProfile(id, prof) {
    this.profiles.set(id, prof);
    if (id === this.myId) {
      // vecā vieta jānotīra tikai tad, ja tā nav kāda cita (pirms „welcome” mySlot ir 0 — tas var būt saimnieka lauks!)
      if (this.mySlot !== prof.slot && !this.slotTaken(this.mySlot, id)) { this.renderFarm(this.mySlot, null); this.setGardenSign(this.mySlot, null); }
      this.mySlot = prof.slot;
      this.renderLandBorder();
      this.setGardenSign(prof.slot, prof.name);
      this.renderFarm(prof.slot, prof.farm || null);
      this.renderDecor(prof.slot, prof.decor);
      return;
    }
    let r = this.remotes.get(id);
    const appearance = `${prof.animal}|${prof.fur}|${prof.shirt}|${(prof.wear && prof.wear.top) || ''}`;
    if (!r) {
      r = { id, prof, pos: new THREE.Vector3(SPAWN.x, VILLAGE_Y, SPAWN.z), target: new THREE.Vector3(SPAWN.x, VILLAGE_Y, SPAWN.z), ry: 0, tRy: 0, anim: 'idle', inKart: false, kart: null, progress: 0, seen: false };
      this.remotes.set(id, r);
      this.updateRoomButton();
    } else if (r.prof.slot !== prof.slot && !this.slotTaken(r.prof.slot, id)) {
      this.renderFarm(r.prof.slot, null);
      this.renderDecor(r.prof.slot, null);
      this.setGardenSign(r.prof.slot, null);
    }
    if (r.appearance !== appearance) {
      if (r.avatar) { r.avatar.root.parent && r.avatar.root.parent.remove(r.avatar.root); }
      r.avatar = buildAnimal(prof);
      r.carryK = undefined;
      const ns = makeTag(prof.name);
      ns.position.y = 2.1;
      r.avatar.root.add(ns);
      r.nameSprite = ns;
      r.rod = null;
      if (r.kart) r.kart.seat.add(r.avatar.root); else this.stage.add(r.avatar.root);
      r.appearance = appearance;
    } else if (r.prof.hat !== prof.hat) r.avatar.setHat(prof.hat);
    if (r.kart && r.prof.kartColor !== prof.kartColor) r.kart.setColor(this.kartColorHex(prof.kartColor));
    r.avatar.setWear(prof.wear || null);
    if (r.carryK !== (prof.carry || null)) { r.carryK = prof.carry || null; r.avatar.setCarry(r.carryK ? this.carryModel(r.carryK) : null); }
    r.prof = prof;
    this.setGardenSign(prof.slot, prof.name);
    this.renderFarm(prof.slot, prof.farm || null);
    this.renderDecor(prof.slot, prof.decor);
  }

  // vai lauku slot aizņem kāds cits (ne id)
  slotTaken(slot, id) {
    for (const [pid, pr] of this.profiles) if (pid !== id && pr.slot === slot) return true;
    return false;
  }

  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    if (r.avatar.root.parent) r.avatar.root.parent.remove(r.avatar.root);
    if (r.kart) r.kart.root.removeFromParent();
    this.removeRemoteVehicle(r);
    if (r.pet) this.stage.remove(r.pet.model.root);
    this.renderFarm(r.prof.slot, null);
    this.renderDecor(r.prof.slot, null);
    this.setGardenSign(r.prof.slot, null);
    this.remotes.delete(id);
    this.profiles.delete(id);
    this.updateRoomButton();
  }

  sendProfile() {
    const prof = this.myProf();
    this.applyProfile(this.myId, { ...prof, slot: this.mySlot });
    this.net.toHost({ t: 'prof', prof });
  }

  remoteSpeed(id) { const r = this.remotes.get(id); return r && r.netVel ? Math.hypot(r.netVel.x, r.netVel.z) : 0; }
  kartColorHex(id) { return (KART_COLORS.find((k) => k.id === id) || KART_COLORS[0]).color; }

  // ======================= Galvenais cikls =======================
  update(dt) {
    const t = this.now();
    const ctl = this.controls;
    ctl.setDrive(!!(this.me.inKart || this.me.veh));
    let mv = ctl.getMove();
    const camIn = ctl.consumeCam();
    let jump = ctl.consumeJump();
    const action = ctl.consumeAction();
    if (panelOpen() || this.mgFrozen() || this.zoneBusy) { mv = { x: 0, y: 0, run: false }; jump = false; }
    if (this.fishing && (Math.hypot(mv.x, mv.y) > 0.3 || jump || this.me.inKart)) this.stopFishing();
    if (this.me.dizzy > 0) {
      this.me.dizzy -= dt;
      const w = Math.sin(t / 300) * 0.6;
      mv = { x: mv.x + w * Math.hypot(mv.x, mv.y), y: mv.y, run: false };
    }
    this.me.iceCream = Math.max(0, this.me.iceCream - dt);

    // kamera
    this.cam.yaw -= camIn.x * 0.0065;
    this.cam.pitch = clamp(this.cam.pitch + camIn.y * 0.0045, -0.1, 1.25);
    this.cam.dist = clamp(this.cam.dist + camIn.z, 3.5, 16);

    // lēnākos telefonos sadalām kustību vairākos soļos, lai spēle nepalēninātos
    const steps = Math.min(3, Math.ceil(dt / 0.034));
    // 1.47.1: katra daļa atsevišķi aizsargāta — kļūda vienā (piem. skaņā vai mājdzīvniekos) vairs neaptur
    // draugu zīmēšanu un manas pozīcijas sūtīšanu (agrāk: draugs „pazūd”, un citi neredz mani kustamies)
    const G = (name, f) => { try { f(); } catch (e) { this.loopError(name, e); } };
    G('move', () => {
      for (let i = 0; i < steps; i++) {
        if (this.me.bus) { /* sēž autobusā (updateBus) */ } else if (this.me.inKart) this.updateKart(dt / steps, mv);
        else if (this.me.veh) this.updateVehicle(dt / steps, mv);
        else if (this.me.ride) { if (i === 0) this.updateRide(dt); }
        else if (this.me.lift) { if (i === 0) this.updateLift(dt); }
        else if (this.me.ski) this.updateSki(dt / steps, mv, jump && i === 0);
        else this.updateWalk(dt / steps, mv, jump && i === 0);
      }
    });

    G('bus', () => this.updateBus(dt));
    G('camera', () => this.updateCamera(dt));
    G('sound', () => this.updateSound(dt));
    MZ.time.value += dt; // 1.37.0: vējš jaunajiem augiem/kokiem (assets.js šeideris)
    G('sun', () => this.updateSun(dt));
    G('remotes', () => this.updateRemotes(dt));
    const T = this.terr;
    this.timers.vis = (this.timers.vis || 0) - dt;
    if (this.timers.vis <= 0) { this.timers.vis = 0.3; G('vis', () => T.updateVisibility(this.camera.position.x, this.camera.position.z)); }
    if (T.isWorld) G('clouds', () => {
      T.updateClouds(dt, this.camera.position);
      if (T.grassCenter) T.grassCenter.set(this.me.pos.x, this.me.pos.z);
    });
    if (this.zone === RACE && this.raceW.startFx) G('startFx', () => this.raceW.startFx(t / 1000));
    if (this.zone === FOREST) {
      G('world', () => this.updateWorldObjects(dt, t));
      G('activities', () => this.updateActivities(dt, t));
    } else {
      G('pets', () => this.updatePets(dt));
      G('mg', () => this.updateMg(dt, t));
      G('fishing', () => this.updateFishing(dt, t)); // 1.45.0: makšķerēšana arī takas dīķī
      if (!T.isWorld && T.update) G('zone', () => T.update(dt, this));
      if (this.zone === 's') G('boats', () => this.updateBoats(dt)); // 1.46.0: stāvošā laiva šūpojas
      if (this.zone === 'n') G('winter', () => this.updateWinter(dt));
      if (this.zone === FARM) G('farm', () => this.updateFarm(dt));
    }
    G('race', () => this.updateRace(dt, t));
    G('effects', () => this.updateEffects(dt));
    G('exits', () => this.updateExits(dt));

    this.timers.action -= dt;
    if (this.timers.action <= 0) { this.timers.action = 0.15; G('action', () => this.refreshAction()); }
    if (action) this.doAction();

    this.timers.garden -= dt;
    if (this.timers.garden <= 0) {
      this.timers.garden = 1;
      if (this.farmDirty && this.myId >= 0) { this.farmDirty = false; this.sendProfile(); }
    }


    this.timers.map -= dt;
    if (this.timers.map <= 0) { this.timers.map = 0.25; this.drawMinimap(); }
    this.timers.save -= dt;
    this.save.playTime += dt;
    if (this.timers.save <= 0) { this.timers.save = 5; this.persist(); }
  }

  // manas pozīcijas sūtīšana (1.47.1: atsevišķi no update — sūta arī tad, ja kāda spēles daļa met kļūdu)
  sendPos(dt) {
    this.timers.send -= dt;
    if (this.timers.send > 0 || this.myId < 0) return;
    // braucot sūtām 20× sekundē (ātra kustība), ejot — 10×
    this.timers.send = this.me.inKart || this.me.veh ? 0.05 : 0.1;
    const p = this.me.pos, me = this.me;
    const ry = (me.inKart && me.kart ? me.kart.heading : me.veh ? me.veh.heading : me.heading) || 0;
    const r2 = (v) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    let veh = 0, ride = [-1, 0], vid = '';
    try { veh = me.inKart ? 1 : this.vehCode(); ride = this.rideInfo(); vid = this.vehIdInfo(); } catch (e) { this.loopError('sendPos', e); }
    this.net.toHost({ t: 'pos', p: [r2(p.x), r2(p.y), r2(p.z), r2(ry), Math.max(0, ANIM.indexOf(me.state)), veh, r2(me.progress || 0), ZONE_IDS.indexOf(this.zone), ...ride, vid, Math.round(this.now())] });
  }

  // kļūda kādā spēles daļā: konsolē (🐞 kļūdu vietai) vienreiz par katru atšķirīgu kļūdu, spēle turpinās
  loopError(name, e) {
    const key = name + ':' + (e && e.message);
    this.loopErrs = this.loopErrs || new Set();
    if (this.loopErrs.has(key) || this.loopErrs.size > 50) return;
    this.loopErrs.add(key);
    console.error('Spēles cikla kļūda [' + name + ']:', e);
  }

  updateWalk(dt, mv, jump) {
    const me = this.me, W = this.terr;
    const yaw = this.cam.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const dx = fx * mv.y + rx * mv.x, dz = fz * mv.y + rz * mv.x;
    const mag = Math.min(1, Math.hypot(dx, dz));
    const ground0 = W.groundAt(me.pos.x, me.pos.z, me.pos.y);
    const swimming = ground0 < WATER_Y - 0.9 && me.pos.y < WATER_Y + 0.3;
    let speed = mag * 8.5 * (mv.run ? 1.3 : 1);
    if (swimming) speed *= 0.55;
    if (me.iceCream > 0) speed *= 1.45;
    if (me.dizzy > 0) speed *= 0.7;
    if (mag > 0.05) {
      const ux = dx / mag, uz = dz / mag;
      const tryMove = (ax, az) => {
        const nx = me.pos.x + ax * speed * dt, nz = me.pos.z + az * speed * dt;
        const nh = W.groundAt(nx, nz, me.pos.y);
        const climb = nh - ground0;
        if (climb > Math.max(0.12, speed * dt * 1.6) && me.onGround && nh > WATER_Y) return false;
        me.pos.x = nx; me.pos.z = nz;
        return true;
      };
      if (!tryMove(ux, uz)) { if (!tryMove(ux, 0)) tryMove(0, uz); }
      me.heading = angleLerp(me.heading, Math.atan2(ux, uz), 1 - Math.exp(-dt * 14));
    }
    W.collide(me.pos, 0.4);
    if (this.zone === FOREST) this.collideIce(me.pos, 0.4);
    const ground = W.groundAt(me.pos.x, me.pos.z, me.pos.y);
    const deep = ground < WATER_Y - 0.9;
    if (deep && me.pos.y <= WATER_Y + 0.2) {
      me.pos.y = lerp(me.pos.y, WATER_Y - 0.75, 1 - Math.exp(-dt * 6));
      me.vy = 0; me.onGround = true;
      me.state = 'swim';
    } else {
      me.vy -= 26 * dt;
      me.pos.y += me.vy * dt;
      if (me.pos.y <= ground) { me.pos.y = ground; me.vy = 0; me.onGround = true; }
      else if (me.onGround && me.vy <= 0 && me.pos.y - ground < 0.45) { me.pos.y = ground; me.vy = 0; }
      else me.onGround = false;
      if (jump && me.onGround) { me.vy = 9.5; me.onGround = false; sfx('jump'); }
      if (!me.onGround) me.state = 'jump';
      else if (me.petT > 0) me.state = 'pet';
      else if (this.fishing) me.state = 'fish';
      else if (me.throwT > 0) me.state = 'throw';
      else if (me.waveT > 0 && speed < 0.5) me.state = 'wave';
      else me.state = speed > 6.2 ? 'run' : speed > 0.3 ? 'walk' : 'idle';
    }
    me.petT -= dt; me.waveT -= dt;
    this.avatar.root.position.copy(me.pos);
    this.avatar.root.rotation.y = me.heading;
    this.avatar.shadow.position.y = (deep ? WATER_Y + 0.02 : ground) - me.pos.y + 0.03;
    this.avatar.animate(dt, me.state, speed);
  }

  collideIce(pos, r) {
    const d = Math.hypot(pos.x - this.ice.pos.x, pos.z - this.ice.pos.z);
    const min = 1.6 + r;
    if (d < min && d > 0.001) {
      pos.x = this.ice.pos.x + (pos.x - this.ice.pos.x) / d * min;
      pos.z = this.ice.pos.z + (pos.z - this.ice.pos.z) / d * min;
    }
  }

  // ---------- kartings ----------
  enterKart(spot) {
    const me = this.me;
    if (me.inKart) return;
    if (me.veh) this.exitVehicle();
    if (me.ride) this.leaveRide();
    const kart = buildKart(this.kartColorHex(this.save.kartColor));
    const s = spot || this.raceW.kartSpot;
    me.pos.set(s.x, this.raceW.getHeight(s.x, s.z), s.z);
    me.kart = { obj: kart, speed: 0, heading: s.heading, hint: -1, boost: 0, padCd: 0 };
    me.inKart = true;
    this.stage.add(kart.root);
    this.stage.remove(this.avatar.root);
    kart.seat.add(this.avatar.root);
    this.avatar.root.position.set(0, 0, 0);
    this.avatar.root.rotation.set(0, 0, 0);
    this.avatar.shadow.visible = false;
    me.state = 'sit';
    this.cam.yaw = s.heading + Math.PI;
    $('btn-exit-kart').classList.remove('hidden');
    $('btn-jump').classList.add('hidden');
    toast('🏎️ Kreisajā pusē ⛽ gāze un 🛑 bremze, labajā ◀ ▶ stūre. Dzeltenās bultas dod turbo!', '', 4500);
  }

  exitKart() {
    const me = this.me;
    if (!me.inKart) return;
    if (this.myRace) { this.net.toHost({ t: 'raceLeave' }); this.myRace = null; }
    const h = me.kart.heading;
    me.kart.obj.root.removeFromParent();
    me.kart.obj.seat.remove(this.avatar.root);
    this.stage.add(this.avatar.root);
    this.avatar.shadow.visible = true;
    me.pos.x += Math.cos(h) * 2; me.pos.z -= Math.sin(h) * 2;
    this.terr.collide(me.pos, 0.4);
    me.pos.y = this.terr.getHeight(me.pos.x, me.pos.z) + 0.5;
    me.inKart = false; me.kart = null; me.state = 'idle'; me.progress = 0;
    $('btn-exit-kart').classList.add('hidden');
    $('btn-race').classList.add('hidden');
    $('btn-jump').classList.remove('hidden');
    $('race-hud').classList.add('hidden');
  }

  updateKart(dt, mv) {
    const me = this.me, k = me.kart, W = this.raceW;
    const info = W.nearestTrackIdx(me.pos.x, me.pos.z, k.hint);
    k.hint = info.idx;
    // 1.33.0: maksimālais ātrums mainās gludi pēc attāluma no trases vidus (agrāk pie malas lēcienā 22 → 12 — tāpēc „raustījās”)
    const edge = clamp((info.dist - (TRACK_WIDTH / 2 + 1.0)) / 4, 0, 1);
    const ground = W.getHeight(me.pos.x, me.pos.z);
    const inWater = ground < WATER_Y - 0.4;
    const frozen = this.myRace && this.race.phase === 'run' && this.now() < this.race.startAt;
    k.boost = Math.max(0, k.boost - dt);
    k.padCd = Math.max(0, k.padCd - dt);
    let max = 22 - 10 * edge * edge * (3 - 2 * edge);
    if (inWater) max = 5;
    if (k.boost > 0) max = 31;
    if (me.iceCream > 0) max *= 1.1;
    k.steer = lerp(k.steer || 0, mv.x, 1 - Math.exp(-dt * 10));
    if (frozen) {
      k.speed = 0;
    } else {
      const thr = mv.y;
      k.thr = thr;
      if (thr > 0.1) k.speed += (k.boost > 0 ? 30 : 15) * thr * dt * (k.speed < max ? 1 : 0);
      else if (thr < -0.1) k.speed -= (k.speed > 0.5 ? 26 : 9) * -thr * dt;
      else k.speed *= Math.exp(-1.4 * dt);
      if (k.boost > 0 && k.speed < max) k.speed += 25 * dt;
      if (k.speed > max) k.speed = lerp(k.speed, max, 1 - Math.exp(-dt * 2));
      k.speed = clamp(k.speed, -7, 34);
      const turn = 2.4 * clamp(k.speed / 5, -1, 1) * (1 - Math.min(0.35, Math.abs(k.speed) / 90));
      k.heading -= k.steer * turn * dt;
    }
    me.pos.x += Math.sin(k.heading) * k.speed * dt;
    me.pos.z += Math.cos(k.heading) * k.speed * dt;
    if (W.collide(me.pos, 1.0)) k.speed *= Math.exp(-dt * 4);
    // barjeras: ar kartu nevar izbraukt no trases. Sitiens bremzē pēc trieciena leņķa, slīdot gar malu ātrums saglabājas
    if (kartClamp(W, me.pos, k.hint)) {
      const a = W.trackPts[k.hint], b = W.trackPts[(k.hint + 1) % W.trackPts.length];
      const td = Math.atan2(b.x - a.x, b.z - a.z);
      const al = Math.abs(Math.cos(k.heading - td)); // 1 — paralēli malai
      if (!k.wall) {
        if (Math.abs(k.speed) > 6 && (k.bumpCd || 0) <= 0) { sfx('hit', { vol: 0.4 + 0.5 * (1 - al) }); k.bumpCd = 0.6; }
        k.speed *= 0.55 + 0.45 * al;
      } else k.speed *= Math.exp(-dt * 0.8);
      // kartu maigi pagriež gar malu
      const dir = Math.cos(k.heading - td) >= 0 ? td : td + Math.PI;
      k.heading = angleLerp(k.heading, dir, 1 - Math.exp(-dt * 3));
      k.wall = true;
    } else k.wall = false;
    k.bumpCd = Math.max(0, (k.bumpCd || 0) - dt);
    for (const p of W.boostPads) {
      if (k.padCd <= 0 && Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 2.4) {
        k.boost = 1.6; k.padCd = 1; sfx('boost');
      }
    }
    // augstums — vidējais zem riteņiem, mīksti (bez trīces no zemes režģa)
    const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
    const hf = W.getHeight(me.pos.x + fx, me.pos.z + fz), hb = W.getHeight(me.pos.x - fx, me.pos.z - fz);
    const gy = inWater ? WATER_Y - 0.3 : Math.max(W.getHeight(me.pos.x, me.pos.z), (hf + hb) / 2);
    k.y = k.y == null || Math.abs(k.y - gy) > 2 ? gy : Math.max(gy - 0.02, lerp(k.y, gy, 1 - Math.exp(-dt * 18)));
    me.pos.y = k.y;
    const kr = k.obj.root;
    kr.position.copy(me.pos);
    kr.rotation.order = 'YXZ';
    kr.rotation.y = k.heading;
    const ke = 1 - Math.exp(-dt * 10);
    kr.rotation.x = lerp(kr.rotation.x, -Math.atan2(hf - hb, 2), ke);
    kr.rotation.z = lerp(kr.rotation.z, k.steer * Math.min(1, k.speed / 20) * 0.08, ke);
    for (const w of k.obj.wheels) w.rotation.x += k.speed * dt / 0.32;
    me.state = 'sit';
    this.avatar.animate(dt, 'sit', 0);
    this.avatar.head.rotation.y = -k.steer * 0.3;
  }

  updateCamera(dt) {
    const me = this.me;
    const riding = me.veh || me.ride || me.bus;
    if (me.inKart || me.ski || riding) {
      const rideFast = me.bus ? this.myBus().speed > 1 : me.veh ? Math.abs(me.veh.speed) > 1 : me.ride ? this.remoteSpeed(me.ride.driver) > 1 : false;
      if (this.controls.camId === null && (me.inKart || rideFast || (me.ski && me.ski.v > 1.5))) {
        const target = (me.inKart ? me.kart.heading : me.veh ? me.veh.heading : me.ride || me.bus ? me.heading : me.ski.heading) + Math.PI;
        this.cam.yaw = angleLerp(this.cam.yaw, target, 1 - Math.exp(-dt * 3.5));
        this.cam.pitch = lerp(this.cam.pitch, 0.3, 1 - Math.exp(-dt * 2));
      }
    }
    let dist = me.inKart ? Math.max(this.cam.dist, 8) : me.bus ? Math.max(this.cam.dist, 12) : riding ? Math.max(this.cam.dist, 9.5) : this.cam.dist;
    const tx = me.pos.x, ty = me.pos.y + 1.5, tz = me.pos.z;
    const cp = Math.cos(this.cam.pitch);
    // ja starp kameru un tēlu ir kalns, pievelkam kameru tuvāk
    const ox = Math.sin(this.cam.yaw) * cp, oy = Math.sin(this.cam.pitch), oz = Math.cos(this.cam.yaw) * cp;
    for (let s = 0.15; s <= 1.001; s += 0.085) {
      const d = s * dist;
      if (this.terr.getHeight(tx + ox * d, tz + oz * d) + 0.5 > ty + oy * d || (this.terr.camBlock && this.terr.camBlock(tx + ox * d, ty + oy * d, tz + oz * d))) { dist = Math.max(1.8, d * 0.85); break; }
    }
    let cx = tx + Math.sin(this.cam.yaw) * cp * dist;
    let cz = tz + Math.cos(this.cam.yaw) * cp * dist;
    let cy = ty + Math.sin(this.cam.pitch) * dist;
    const gh = Math.max(this.terr.getHeight(cx, cz), WATER_Y) + 0.6;
    if (cy < gh) cy = gh;
    // tunelī kamera paliek zem griestiem
    if (this.terr.ceilingAt && ty < this.terr.ceilingAt(tx, tz)) cy = Math.min(cy, this.terr.ceilingAt(tx, tz), Math.max(gh, this.terr.ceilingAt(cx, cz)));
    const k = 1 - Math.exp(-dt * 12);
    if ((riding || me.inKart) && this.camInit) {
      // braucot kamera nevelkas pakaļ ar mainīgu nobīdi (tas izskatās pēc raustīšanās) — tikai attālums mainās mīksti
      this.camDistS = lerp(this.camDistS || dist, dist, 1 - Math.exp(-dt * 5));
      const dd = this.camDistS;
      cx = tx + ox * dd; cz = tz + oz * dd; cy = Math.max(ty + oy * dd, Math.max(this.terr.getHeight(cx, cz), WATER_Y) + 0.6);
      if (this.terr.ceilingAt && ty < this.terr.ceilingAt(tx, tz)) cy = Math.min(cy, this.terr.ceilingAt(tx, tz), Math.max(Math.max(this.terr.getHeight(cx, cz), WATER_Y) + 0.6, this.terr.ceilingAt(cx, cz)));
      this.camera.position.set(cx, cy, cz);
      this.camera.lookAt(tx, ty, tz);
      return;
    }
    this.camDistS = dist;
    if (!this.camInit) { this.camera.position.set(cx, cy, cz); this.camInit = true; }
    else this.camera.position.set(lerp(this.camera.position.x, cx, k), lerp(this.camera.position.y, cy, k), lerp(this.camera.position.z, cz, k));
    this.camera.lookAt(tx, ty, tz);
  }

  updateSun(dt) {
    const p = this.me.pos;
    const sx = Math.round(p.x / 4) * 4, sz = Math.round(p.z / 4) * 4;
    this.sun.target.position.set(sx, p.y, sz);
    this.sun.position.set(sx + this.sunDir.x * 120, p.y + this.sunDir.y * 120, sz + this.sunDir.z * 120);
    this.sky.position.copy(this.camera.position);
    this.autoQuality(); // grafikas līmenis pēc fps (quality.js)
  }

  updateRemotes(dt) {
    const k = 1 - Math.exp(-dt * 12);
    for (const r of this.remotes.values()) {
      const here = (r.zone || 'c') === this.zone; // citā zemē esošos rāda tikai kartē
      if (r.kart) r.kart.root.visible = here;
      const prev = r.pos.clone();
      if (r.buf && r.buf.length && r.off != null) {
        // Interpolācija starp saņemtajām pozīcijām: rādām draugu nedaudz pagātnē (≈1,5 sūtīšanas intervāli),
        // tāpēc vienmēr ir divi punkti, starp kuriem vienmērīgi pārvietoties — bez raustīšanās un lēcieniem.
        const delay = clamp((r.gap || 100) * 1.1 + (r.jit || 0) * 1.3 + 20, 80, 380);
        const q = this.sampleRemote(r, this.now() - r.off - delay);
        const ks = 1 - Math.exp(-dt * 20); // viegla izlīdzināšana (ja pozīcija tika nedaudz prognozēta)
        if (r.pos.distanceToSquared(q) > 100) r.pos.set(q.x, q.y, q.z); else r.pos.lerp(q, ks);
        r.ry = angleLerp(r.ry, q.ry, ks);
      } else {
        r.pos.lerp(r.target, k);
        r.ry = angleLerp(r.ry, r.tRy, k);
      }
      if (r.pos.distanceTo(r.target) > 40) r.pos.copy(r.target);
      if (r.inKart && !r.kart && here) {
        r.kart = buildKart(this.kartColorHex(r.prof.kartColor));
        this.stage.add(r.kart.root);
        if (r.avatar.root.parent) r.avatar.root.parent.remove(r.avatar.root);
        r.kart.seat.add(r.avatar.root);
        r.avatar.root.position.set(0, 0, 0); r.avatar.root.rotation.set(0, 0, 0);
        r.avatar.shadow.visible = false;
      } else if (!r.inKart && r.kart) {
        r.kart.root.removeFromParent();
        r.kart.seat.remove(r.avatar.root);
        r.kart = null;
        this.stage.add(r.avatar.root);
        r.avatar.shadow.visible = true;
      }
      if (!r.kart && this.vehicleRemote(r, here, prev, dt)) { /* mašīna / sniega motocikls */ } else if (r.kart) {
        r.kart.root.position.copy(r.pos);
        r.kart.root.rotation.y = r.ry;
        const sp = prev.distanceTo(r.pos) / Math.max(dt, 0.001);
        for (const w of r.kart.wheels) w.rotation.x += sp * dt / 0.32;
        r.avatar.animate(dt, 'sit', 0);
      } else {
        r.avatar.root.position.copy(r.pos);
        r.avatar.root.rotation.y = r.ry;
        const g = this.terr.getHeight(r.pos.x, r.pos.z);
        r.avatar.shadow.position.y = Math.max(g, WATER_Y) - r.pos.y + 0.03;
        r.avatar.animate(dt, r.anim, Math.min(12, prev.distanceTo(r.pos) / Math.max(dt, 0.001)));
        this.winterRemote(r, here);
        if (r.anim === 'fish' && !r.rod) { r.rod = buildRod(); r.rod.position.set(0, 1.0, 0.32); r.avatar.root.add(r.rod); }
        if (r.rod) r.rod.visible = r.anim === 'fish';
        r.avatar.root.visible = here && (!this.mgHidden(r.id) || r.pos.distanceTo(this.me.pos) < 30);
      }
    }
  }

  // drauga pozīcija laikā rt (viņa pulkstenī) no saņemto pozīciju bufera; aiz pēdējās — īsi turpina ar ātrumu
  sampleRemote(r, rt) {
    const b = r.buf, n = b.length, out = this._smp || (this._smp = { x: 0, y: 0, z: 0, ry: 0 });
    let i = n - 1;
    while (i > 0 && b[i].t > rt) i--;
    // vecos punktus izmetam (paturam vismaz 2)
    if (i > 2) { b.splice(0, i - 2); i = 2; }
    const a = b[i];
    if (rt <= a.t || i === b.length - 1) {
      if (rt > a.t && i > 0) {
        const p = b[i - 1], span = a.t - p.t;
        const ex = Math.min(rt - a.t, 220);
        if (span > 0 && span < 500) {
          const f = ex / span;
          out.x = a.x + (a.x - p.x) * f; out.y = a.y + (a.y - p.y) * f; out.z = a.z + (a.z - p.z) * f; out.ry = a.ry;
          return out;
        }
      }
      out.x = a.x; out.y = a.y; out.z = a.z; out.ry = a.ry;
      return out;
    }
    const c = b[i + 1], f = clamp((rt - a.t) / Math.max(1, c.t - a.t), 0, 1);
    out.x = lerp(a.x, c.x, f); out.y = lerp(a.y, c.y, f); out.z = lerp(a.z, c.z, f); out.ry = angleLerp(a.ry, c.ry, f);
    return out;
  }

  npcPos(h, t) {
    const L = 9;
    const kk = t / L + h.p1;
    const seg = Math.floor(kk), f = kk - seg;
    const eased = seg + smoothstep(0, 0.55, f);
    const u = eased * 0.9 * h.sp;
    return {
      x: h.x + h.R * (0.6 * Math.sin(u * 1.3 + h.p1) + 0.4 * Math.sin(u * 2.1 + h.p2)),
      z: h.z + h.R * (0.6 * Math.cos(u * 1.1 + h.p2) + 0.4 * Math.cos(u * 1.7 + h.p1)),
      moving: f < 0.55,
    };
  }

  updateWorldObjects(dt, t) {
    const ts = (t - EPOCH) / 1000;
    const cx = this.me.pos.x, cz = this.me.pos.z;
    this.timers.cull -= dt;
    const doCull = this.timers.cull <= 0;
    if (doCull) this.timers.cull = 0.3;
    // sēnes
    if (doCull) {
      this.mushField.update(cx, cz);
      for (const m of this.world.mushrooms) if (Math.abs(m.x - cx) < 110 && Math.abs(m.z - cz) < 110) this.mushField.setHidden(m.id, this.picked[m.id] > t);
    }
    // zvaigznes
    this.starMeshes.forEach((s, i) => {
      if (!s.visible) return;
      s.rotation.y += dt * 2;
      s.position.y = this.world.stars[i].y + Math.sin(ts * 2 + i) * 0.2;
    });
    // dzīvnieki
    for (const n of this.npcs) {
      const near = Math.abs(n.home.x - cx) < 85 && Math.abs(n.home.z - cz) < 85;
      n.model.root.visible = near;
      if (!near) continue;
      const p = this.npcPos(n.home, ts), p2 = this.npcPos(n.home, ts + 0.15);
      const vx = p2.x - p.x, vz = p2.z - p.z;
      const sp = Math.hypot(vx, vz) / 0.15;
      if (sp > 0.05) n.heading = angleLerp(n.heading, Math.atan2(vx, vz), 1 - Math.exp(-dt * 8));
      n.x = p.x; n.z = p.z;
      let y = this.world.getHeight(p.x, p.z);
      if (n.home.type !== 'starkis') y = Math.max(y, WATER_Y);
      n.model.root.position.set(p.x, y, p.z);
      n.model.root.rotation.y = n.heading;
      n.model.animate(dt, sp > 0.05, sp);
    }
    this.updateIceCart(dt, ts);
    // star savākšana
    if (!this.me.inKart) {
      this.world.stars.forEach((s, i) => {
        if (!this.starMeshes[i].visible) return;
        if (Math.hypot(s.x - cx, s.z - cz) < 1.6 && Math.abs(s.y - 1.3 - this.me.pos.y) < 2.5) this.collectStar(s, i);
      });
    }
  }

  collectStar(s, i) {
    this.starMeshes[i].visible = false;
    if (!this.save.stars.includes(s.id)) this.save.stars.push(s.id);
    this.save.stats.stars = this.save.stars.length;
    this.addCoins(10, true);
    sfx('star');
    toast(`⭐ Zelta zvaigzne! (${this.save.stars.length}/15) +10🪙`, 'good', 3000);
    this.checkQuests();
    this.persist();
  }

  // ---------- efekti ----------
  spawnFloat(text, pos) {
    const sp = makeTag(text, { height: 0.26, color: '#fff6c0' });
    sp.position.set(pos.x, pos.y + 2.4, pos.z);
    this.stage.add(sp);
    this.effects.push({ obj: sp, life: 1.4, t: 0 });
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      e.obj.position.y += dt * 1.2;
      e.obj.material.opacity = 1 - e.t / e.life;
      if (e.t >= e.life) {
        if (e.obj.parent) e.obj.parent.remove(e.obj);
        e.obj.material.map.dispose(); e.obj.material.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  showEmote(id, text) {
    const av = id === this.myId ? this.avatar : this.remotes.get(id)?.avatar;
    if (!av) return;
    if (av.emoteSprite) { av.root.remove(av.emoteSprite); av.emoteSprite = null; }
    const sp = makeTextSprite(text, { bg: 'rgba(255,255,255,0.95)', color: '#222', fontSize: 46 });
    sp.position.y = 2.85;
    av.root.add(sp);
    av.emoteSprite = sp;
    if (id === this.myId) this.me.waveT = 1.6;
    setTimeout(() => { if (av.emoteSprite === sp) { av.root.remove(sp); av.emoteSprite = null; } }, 3500);
  }

  // ======================= Darbības =======================
  refreshAction() {
    const act = this.findAction();
    this.currentAction = act;
    const b = $('btn-action');
    if (!act) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    if (b.textContent !== act.label) b.textContent = act.label;
  }

  doAction() {
    if (panelOpen()) return;
    if (!this.currentAction) this.refreshAction();
    const a = this.currentAction;
    if (!a) return;
    // kļūda darbībā nedrīkst palikt nemanāma (poga „neko nedara”)
    try { a.fn(); } catch (e) { console.error('Darbības kļūda:', a.label, e); toast('⚠️ Neizdevās — mēģini vēlreiz', 'bad'); }
    this.timers.action = 0;
  }

  // ko stādīt uz tukša lauciņa: kultūras id vai 'sap:<koks>' (augļu koka stāds)
  currentSeed() {
    const inv = this.save.inv, sel = this.selectedSeed;
    if (sel && sel.startsWith('sap:') && inv[sel.slice(4) + '_sap'] > 0) return sel;
    if (sel && inv[sel + '_seed'] > 0) return sel;
    const c = Object.keys(CROPS).find((k) => inv[k + '_seed'] > 0);
    if (c) return c;
    const t = Object.keys(TREES).find((k) => inv[k + '_sap'] > 0);
    return t ? 'sap:' + t : null;
  }

  findAction() {
    if (this.me.inKart || this.me.veh || this.me.ride || this.me.bus) return null;
    if (this.me.carry) return this.carryAction();
    if (this.zone !== FOREST) return this.findZoneAction();
    const p = this.me.pos, t = this.now();
    let best = null, bd = 1e9;
    const consider = (d, max, label, fn) => { if (d < max && d < bd) { bd = d; best = { label, fn }; } };
    const d2 = (x, z) => Math.hypot(x - p.x, z - p.z);
    const forced = this.findActivityActions(consider, d2);
    if (forced) return forced;

    for (const m of this.world.mushrooms) {
      if (Math.abs(m.x - p.x) > 3 || Math.abs(m.z - p.z) > 3) continue;
      if (this.picked[m.id] > t) continue;
      consider(d2(m.x, m.z), 1.8, `🍄 Lasīt: ${MUSHROOMS[m.type].name}`, () => this.pickMushroom(m));
    }
    for (const v of this.vendors) consider(d2(v.def.x, v.def.z), 3.4, `💬 ${v.def.name}`, () => this.openShop(v.def.id));
    consider(d2(this.ice.pos.x, this.ice.pos.z), 3.6, `🍦 Saldējums (${ICE_CREAM_PRICE}🪙)`, () => this.buyIceCream());
    for (const n of this.npcs) {
      if (!n.model.root.visible) continue;
      const d = d2(n.x, n.z);
      if (d > 2.8) continue;
      if ((this.npcCooldown[n.home.id] || 0) > t) continue;
      consider(d, 2.8, `🤗 Paglaudīt: ${NPC_TYPES[n.home.type].name}`, () => this.petNpc(n));
    }
    this.vehicleActions(consider, d2);
    this.busActions(consider, d2);
    return best;
  }

  pickMushroom(m) {
    this.picked[m.id] = this.now() + 5000; // paslēpjam uzreiz, saimnieks apstiprinās
    this.mushField.setHidden(m.id, true);
    this.me.petT = 0.5;
    this.net.toHost({ t: 'pick', id: m.id });
  }

  // meža dzīvnieka paglaudīšana (ne `pet` — tā sauc paša mājdzīvnieka objektu this.pet)
  petNpc(n) {
    this.npcCooldown[n.home.id] = this.now() + 20000;
    this.me.petT = 1.2;
    this.me.heading = Math.atan2(n.x - this.me.pos.x, n.z - this.me.pos.z);
    this.spawnFloat('❤️', new THREE.Vector3(n.x, this.world.getHeight(n.x, n.z), n.z));
    sfx('pet');
    this.stat('petted');
    const msgs = { stirna: 'Stirna priecīgi pamāja ar ausīm', zakis: 'Zaķis sarāva degunu', ezis: 'Ezītis nošņaukājās — uzmanīgi, adatas!', mezacuka: 'Mežacūka apmierināti ņurdēja', vavere: 'Vāverīte paslēpa riekstu', starkis: 'Stārķis noklabināja knābi' };
    toast(`❤️ ${msgs[n.home.type]}`);
  }

  // saldējuma pārdevējs lēnām stumj ratiņus pa līkumotu apli ap aku (ratiņu priekšpuse — lokālā +x, rokturi aizmugurē),
  // laiku pa laikam apstājas un pamāj. Ja kāds stāv pie ratiņiem (pērk), viņš stāv uz vietas.
  // Kustība ir tikai vizuāla katrā telefonā (sākuma vieta no kopējā pulksteņa, tāpēc visiem līdzīga).
  updateIceCart(dt, ts) {
    const I = this.ice;
    const path = (th) => { const r = 10 + 1.6 * Math.sin(2 * th + 1) + 0.6 * Math.sin(5 * th); return [Math.cos(th) * r, Math.sin(th) * r]; };
    if (I.th == null) {
      I.th = (ts * 0.012) % (Math.PI * 2); I.v = 0; I.stop = 0; I.wave = 0; I.next = 14 + Math.random() * 14;
      I.av.pushing = true;
    }
    // vai kāds stāv pie ratiņiem
    const near = (x, z) => Math.hypot(x - I.pos.x, z - I.pos.z) < 4.2;
    let buyer = this.zone === FOREST && !this.me.veh && !this.me.ride && near(this.me.pos.x, this.me.pos.z);
    for (const r of this.remotes.values()) if (!buyer && (r.zone || FARM) === FOREST && near(r.pos.x, r.pos.z)) buyer = true;
    if (I.stop > 0) I.stop -= dt;
    if (I.wave > 0) I.wave -= dt;
    const want = buyer || I.stop > 0 ? 0 : 1.15; // m/s — lēns solis
    I.v += (want - I.v) * Math.min(1, dt * (want ? 1.5 : 4));
    if (I.v < 0.02 && !want) I.v = 0;
    const [x0, z0] = path(I.th), [x1, z1] = path(I.th + 0.01);
    const dl = Math.hypot(x1 - x0, z1 - z0) / 0.01;
    const step = I.v * dt;
    I.th += step / dl;
    I.next -= step;
    if (I.next <= 0 && !buyer) {
      // pietura: dažreiz pamāj ar roku
      I.stop = 4 + Math.random() * 4;
      if (Math.random() < 0.65) I.wave = 2.6;
      I.next = 16 + Math.random() * 18;
    }
    const [px, pz] = path(I.th), [qx, qz] = path(I.th + 0.02);
    const tx = qx - px, tz = qz - pz, tl = Math.hypot(tx, tz) || 1;
    const dx = tx / tl, dz = tz / tl;
    I.pos.set(px, VILLAGE_Y, pz);
    I.cart.position.copy(I.pos);
    I.cart.rotation.y = Math.atan2(-dz, dx); // lokālā +x pa kustības virzienu
    // pārdevējs aiz rokturiem, skatās kustības virzienā
    const av = I.av;
    av.root.position.set(px - dx * 2.25, VILLAGE_Y, pz - dz * 2.25);
    let ry = Math.atan2(dx, dz);
    if (I.wave > 0) ry += Math.sin(Math.min(1, (2.6 - I.wave) * 2) * Math.PI / 2) * 0.5; // pagriežas pret garāmgājējiem
    av.root.rotation.y = angleLerp(av.root.rotation.y, ry, 1 - Math.exp(-dt * 6));
    av.pushing = I.wave <= 0;
    av.animate(dt, I.wave > 0 ? 'wave' : I.v > 0.15 ? 'walk' : 'idle', I.v);
  }

  buyIceCream() {
    if (this.save.coins < ICE_CREAM_PRICE) { toast('Nepietiek monētu 🪙', 'bad'); return; }
    this.addCoins(-ICE_CREAM_PRICE, true);
    this.me.iceCream = 40;
    sfx('buy'); sfx('ding', { vol: 0.5 });
    toast('🍦 Mmm! Tagad 40 sekundes skriesi ātrāk!', 'good');
  }

  // ======================= Sacīkstes =======================
  onRace(race) {
    if (!race) return;
    race = JSON.parse(JSON.stringify(race)); // saimniekam objekts ir kopīgs ar hs.race
    const prev = this.race || { phase: 'none' };
    this.race = race;
    const mine = race.racers && race.racers.includes(this.myId);
    if ((race.phase === 'lobby' || race.phase === 'run') && mine && (!this.myRace || this.myRace.id !== race.id)) {
      this.myRace = { id: race.id, placed: false, prevIdx: 0, progress: 0, finished: false, lapsDone: 0, lapStart: 0, lastCount: null };
    }
    if (this.myRace && this.myRace.id === race.id && !mine && race.phase !== 'done') this.myRace = null;
    if (race.phase === 'lobby' && prev.phase !== 'lobby') {
      const s = Math.max(0, Math.round((race.startAt - this.now()) / 1000));
      toast(mine ? `🏁 Gaidām pārējos braucējus… Starts pēc ${s} s` : `🏁 Kartinga sacīkstes sāksies pēc ${s} s! Ej uz trasi un sēdies kartā!`, 'good', 4000);
      sfx('beep');
    }
    if (race.phase === 'done' && prev.phase !== 'done') {
      const wasIn = this.myRace && this.myRace.id === race.id;
      if (wasIn) {
        this.stat('races');
        if (race.final[0] && race.final[0].id === this.myId) { this.stat('wins'); this.addCoins(25, true); }
        this.showResults(race.final);
        this.myRace = null;
      }
    }
  }

  showResults(final) {
    showPanel('🏁 Sacīkšu rezultāti', (b) => {
      const medals = ['🥇', '🥈', '🥉', '4.'];
      final.forEach((r, i) => {
        b.append(itemRow(medals[i] || `${i + 1}.`, r.name, r.time ? fmtTime(r.time) : 'nefinišēja', [], r.id === this.myId ? 'sel' : ''));
      });
      if (final[0] && final[0].id === this.myId) b.append(el('p', {}, '🎉 Tu uzvarēji! +25🪙'));
      if (this.save.bestLap) b.append(el('p', {}, `⏱️ Tavs labākais aplis: ${fmtTime(this.save.bestLap)}`));
    });
    sfx('win');
  }

  updateRace(dt, t) {
    const r = this.race, mr = this.myRace, W = this.raceW;
    const hud = $('race-hud'), cd = $('countdown'), rb = $('btn-race');
    // sacīkšu poga
    if (this.me.inKart && !mr && this.zone === RACE) {
      const s0 = W.trackPts[0];
      const near = Math.hypot(this.me.pos.x - s0.x, this.me.pos.z - s0.z) < 70;
      if (near && (r.phase === 'none' || r.phase === 'done')) { rb.textContent = '🏁 Sākt sacīkstes'; rb.classList.remove('hidden'); }
      else if (near && r.phase === 'lobby') { rb.textContent = `🏁 Pievienoties (${Math.max(0, Math.ceil((r.startAt - 4000 - t) / 1000))})`; rb.classList.remove('hidden'); }
      else rb.classList.add('hidden');
    } else rb.classList.add('hidden');
    // ja kāds sāk sacīkstes, bet es jau sēžu kartā trasē — pievienojos automātiski (arī tas, kurš iekāpa tikko)
    if (r.phase === 'lobby' && this.me.inKart && this.zone === RACE && !(r.racers || []).includes(this.myId) && (r.racers || []).length < 4 && this.autoRace !== r.id) {
      this.autoRace = r.id;
      this.net.toHost({ t: 'raceReq' });
      toast('🏁 Tu arī piedalies sacīkstēs! Gaidi startu…', 'good', 3000);
    }

    // botu kartingi
    this.updateBots(dt, t);

    if (!mr || mr.id !== r.id) {
      hud.classList.add('hidden'); cd.classList.add('hidden');
      this.me.progress = 0;
      return;
    }
    if (r.phase === 'lobby') {
      hud.classList.remove('hidden');
      hud.textContent = `🏁 Gaidām braucējus… ${Math.max(0, Math.ceil((r.startAt - 4000 - t) / 1000))} s (${r.racers.length}/4)`;
      return;
    }
    if (r.phase !== 'run') return;
    if (!mr.placed) {
      const slot = Math.max(0, r.racers.indexOf(this.myId));
      const g = W.gridSlot(slot);
      if (panelOpen()) closePanel();
      if (this.zone !== RACE) { this.net.toHost({ t: 'raceLeave' }); this.myRace = null; return; }
      if (!this.me.inKart) this.enterKart(g);
      this.me.pos.set(g.x, W.getHeight(g.x, g.z), g.z);
      this.me.kart.heading = g.heading;
      this.me.kart.speed = 0;
      this.me.kart.hint = g.idx;
      this.cam.yaw = g.heading + Math.PI;
      mr.placed = true;
      mr.prevIdx = g.idx;
      mr.progress = g.idx - TRACK_N;
      mr.lapStart = r.startAt;
    }
    // atpakaļskaitīšana
    if (t < r.startAt) {
      const n = Math.ceil((r.startAt - t) / 1000);
      cd.classList.remove('hidden');
      cd.textContent = n;
      if (mr.lastCount !== n) { mr.lastCount = n; sfx('beep'); if (n <= 3) voice('r_' + n); }
    } else if (t < r.startAt + 1000) {
      cd.classList.remove('hidden');
      cd.textContent = 'AIZIET!';
      if (mr.lastCount !== 0) { mr.lastCount = 0; sfx('go'); voice('r_go'); }
    } else cd.classList.add('hidden');

    if (t >= r.startAt && !mr.finished && this.me.inKart) {
      const ni = this.me.kart.hint;
      let d = ni - mr.prevIdx;
      if (d < -TRACK_N / 2) d += TRACK_N;
      if (d > TRACK_N / 2) d -= TRACK_N;
      if (Math.abs(d) <= 15) mr.progress += d;
      mr.prevIdx = ni;
      const laps = Math.floor(mr.progress / TRACK_N);
      if (laps > mr.lapsDone && laps >= 1) {
        const lapTime = t - mr.lapStart;
        mr.lapStart = t;
        mr.lapsDone = laps;
        if (!this.save.bestLap || lapTime < this.save.bestLap) {
          this.save.bestLap = lapTime;
          if (laps < RACE_LAPS) toast(`⏱️ Jauns labākais aplis: ${fmtTime(lapTime)}!`, 'good');
        }
        if (laps < RACE_LAPS) { sfx('beep'); toast(laps === RACE_LAPS - 1 ? '🔔 Pēdējais aplis!' : `Aplis ${laps + 1}/${RACE_LAPS}`); }
      }
      if (mr.progress >= RACE_LAPS * TRACK_N) {
        mr.finished = true;
        mr.time = t - r.startAt;
        this.net.toHost({ t: 'raceFinish', time: mr.time });
        sfx('win');
        toast(`🏁 Finišs! Laiks: ${fmtTime(mr.time)}`, 'good', 4000);
      }
    }
    const myProg = mr.finished ? RACE_LAPS + 1 - mr.time / 1e7 : mr.progress / TRACK_N;
    this.me.progress = myProg;
    // vieta
    let rank = 1, total = 1;
    for (const id of r.racers) {
      if (id === this.myId) continue;
      const rr = this.remotes.get(id);
      if (!rr) continue;
      total++;
      if (rr.progress > myProg) rank++;
    }
    for (let b = 0; b < (r.bots || 0); b++) {
      total++;
      if (this.botProgress(b, r.racers.length + b, t) > myProg) rank++;
    }
    hud.classList.remove('hidden');
    const lap = Math.min(RACE_LAPS, Math.max(1, Math.floor(mr.progress / TRACK_N) + 1));
    hud.textContent = mr.finished
      ? `🏁 Finišējis! ${fmtTime(mr.time)} · Vieta ${rank}/${total}`
      : `Aplis ${lap}/${RACE_LAPS} · Vieta ${rank}/${total} · ⏱️ ${fmtTime(Math.max(0, t - r.startAt))}`;
  }

  botDistance(b, gridSlot, t) {
    const back = (6 + Math.floor(gridSlot / 2) * 5) * this.raceW.trackLen / TRACK_N;
    const el2 = Math.max(0, (t - this.race.startAt) / 1000);
    const total = RACE_LAPS * this.raceW.trackLen + back;
    return Math.min(total, el2 * BOTS[b].speed) - back;
  }

  botProgress(b, gridSlot, t) {
    const d = this.botDistance(b, gridSlot, t);
    const fin = this.botTime(b, gridSlot);
    if (t - this.race.startAt >= fin) return RACE_LAPS + 1 - fin / 1e7;
    return d / this.raceW.trackLen;
  }

  updateBots(dt, t) {
    if (!this.raceOn) return;
    const r = this.race;
    if (!this.bots) this.bots = [];
    const active = (r.phase === 'run') ? (r.bots || 0) : 0;
    for (let b = 0; b < BOTS.length; b++) {
      let bot = this.bots[b];
      if (b >= active) { if (bot) bot.kart.root.visible = false; continue; }
      if (!bot) {
        const kart = buildKart(BOTS[b].kart);
        const av = buildAnimal(BOTS[b]);
        kart.seat.add(av.root);
        av.shadow.visible = false;
        const ns = makeTag(BOTS[b].name, { color: '#e0e0e0' });
        ns.position.y = 2.1; av.root.add(ns);
        this.raceScene.add(kart.root);
        bot = this.bots[b] = { kart, av };
      }
      bot.kart.root.visible = true;
      const slot = r.racers.length + b;
      const W = this.raceW;
      let dist = this.botDistance(b, slot, t);
      const L = W.trackLen;
      let f = ((dist % L) + L) % L / L * TRACK_N;
      const i0 = Math.floor(f) % TRACK_N, i1 = (i0 + 1) % TRACK_N, fr = f - Math.floor(f);
      const p0 = W.trackPts[i0], p1 = W.trackPts[i1], tg = W.trackTan[i0];
      const lane = (slot % 2 ? -2.6 : 2.6) * (t < r.startAt + 3000 ? 1 : 0.6) + Math.sin(t / 1500 + b) * 0.8;
      const x = lerp(p0.x, p1.x, fr) - tg.z * lane, z = lerp(p0.z, p1.z, fr) + tg.x * lane;
      bot.kart.root.position.set(x, TRACK_Y, z);
      bot.kart.root.rotation.y = Math.atan2(tg.x, tg.z);
      const moving = t > r.startAt;
      for (const w of bot.kart.wheels) w.rotation.x += (moving ? BOTS[b].speed : 0) * dt / 0.32;
      bot.av.animate(dt, 'sit', 0);
    }
  }

  // ======================= Paneļi =======================
  openShop(id) {
    voice('v_' + id); // 1.44.0: pārdevējs sasveicinās
    if (id === 'seeds') this.shopSeeds();
    else if (id === 'buyer') this.shopBuyer();
    else if (id === 'pets') this.shopPets();
    else if (id === 'decor') this.shopDecor();
    else this.shopHats();
  }

  coinLine(b) { b.append(el('div', { className: 'sect' }, `Tev ir 🪙 ${this.save.coins}`)); }

  shopSeeds() {
    const build = (b) => {
      b.append(el('p', {}, 'Sveiks! Man ir labākās sēklas visā Mežvidu ciemā, augļu koku stādi un makšķeres. Viena sēkla apsēj vienu lauciņu. Dārgākās aug ilgāk, bet nes vairāk! 🌱🎣'));
      this.coinLine(b);
      this.rodRow(b, build);
      const L = this.gardenLvl();
      b.append(el('p', { style: 'font-size:13px;margin:2px 0' }, `🌱 Tavs dārznieka līmenis: ${L}. Jaunas sēklas atveras, kad novāc ražu un iegūsti ⭐.`));
      const crops = Object.entries(CROPS).sort((p, q) => (UNLOCK[p[0]] || 1) - (UNLOCK[q[0]] || 1) || p[1].grow - q[1].grow);
      for (const [k, c] of crops) {
        const have = this.save.inv[k + '_seed'] || 0;
        if (!this.cropOpen(k)) {
          b.append(itemRow(iconEl(k + '_seed', 40), `🔒 ${c.name}`, `no ${UNLOCK[k]}. līmeņa · aug ${fmtLeft(c.grow)} · raža ×${c.yield} (${c.yield * c.sell}🪙)${have ? ` · tev: ${have}` : ''}`, []));
          continue;
        }
        const buy = (n) => () => {
          if (this.save.coins < c.seedPrice * n) { toast('Nepietiek monētu 🪙', 'bad'); return; }
          this.addCoins(-c.seedPrice * n, true); this.addItem(k + '_seed', n); sfx('buy');
          refreshPanel(build);
        };
        b.append(itemRow(iconEl(k + '_seed', 40), `${c.name} — sēkla`, `${c.seedPrice}🪙 · aug ${fmtLeft(c.grow)} · raža ×${c.yield} (${c.yield * c.sell}🪙) · tev: ${have}`, [
          { label: 'Pirkt', onclick: buy(1), disabled: this.save.coins < c.seedPrice },
          { label: '×5', onclick: buy(5), disabled: this.save.coins < c.seedPrice * 5 },
        ]));
      }
      b.append(el('div', { className: 'sect' }, '🌳 Augļu koki (stādi)'));
      b.append(el('p', { style: 'font-size:13px;opacity:.8;margin:2px 0' }, 'Iestādi uz uzarta lauciņa. Kad koks izaug, tas atkal un atkal dod augļus!'));
      for (const [k, t] of Object.entries(TREES).sort((p, q) => UNLOCK[p[0]] - UNLOCK[q[0]])) {
        const have = this.save.inv[k + '_sap'] || 0, f = FRUITS[t.fruit];
        if (!this.cropOpen(k)) { b.append(itemRow(iconEl(k + '_sap', 40), `🔒 ${t.name} — stāds`, `no ${UNLOCK[k]}. līmeņa · ${t.price}🪙`, [])); continue; }
        b.append(itemRow(iconEl(k + '_sap', 40), `${t.name} — stāds`, `${t.price}🪙 · izaug ${fmtLeft(t.grow)} · ${f.name.toLowerCase()} ×${t.yield} ik pa ${fmtLeft(t.every)} (${t.yield * f.sell}🪙) · tev: ${have}`, [
          { label: 'Pirkt', disabled: this.save.coins < t.price, onclick: () => {
            if (this.save.coins < t.price) return;
            this.addCoins(-t.price, true); this.addItem(k + '_sap'); sfx('buy'); refreshPanel(build);
          } },
        ]));
      }
    };
    showPanel('🌱 Ūdrs Ojārs — sēklas un stādi', build);
  }

  // pārdodamās lietas somā (zivis — atsevišķi, katrai savs izmērs un cena)
  sellables() {
    const out = [];
    for (const [k, m] of Object.entries(MUSHROOMS)) if (!m.poison) out.push({ k, name: m.name, price: m.sell });
    for (const [k, c] of Object.entries(CROPS)) out.push({ k, name: c.name, price: c.sell });
    for (const [k, f] of Object.entries(FRUITS)) out.push({ k, name: f.name, price: f.sell });
    for (const [k, b] of Object.entries(BERRIES)) out.push({ k, name: b.name, price: b.sell });
    out.push({ k: 'cepta', name: COOKED.name, price: COOKED.sell });
    return out;
  }

  // zivis somā pa veidiem: [{k, list, sum}]
  fishGroups() {
    const g = {};
    for (const f of this.save.fishBag || []) (g[f.k] = g[f.k] || []).push(f);
    return Object.entries(g).map(([k, list]) => ({ k, list: list.sort((a, b) => b.kg - a.kg), sum: list.reduce((s, f) => s + f.v, 0) }));
  }

  shopBuyer() {
    const build = (b) => {
      b.append(el('p', {}, 'Es uzpērku sēnes, dārzeņus, augļus, zivis un ogas. Par lielu zivi maksāju vairāk! 🧺'));
      this.coinLine(b);
      let any = false, totalAll = 0;
      for (const it of this.sellables()) {
        const n = this.save.inv[it.k] || 0;
        if (!n) continue;
        any = true; totalAll += n * it.price;
        const sell = (cnt) => () => {
          const c = Math.min(cnt, this.save.inv[it.k] || 0);
          if (!c) return;
          this.save.inv[it.k] -= c;
          this.addCoins(c * it.price);
          this.stat('sold', c);
          refreshPanel(build);
        };
        b.append(itemRow(iconEl(it.k, 40), `${it.name} ×${n}`, `${it.price}🪙 gabalā`, [
          { label: 'Pārdot 1', onclick: sell(1) },
          { label: 'Visu', onclick: sell(n), alt: true },
        ]));
      }
      for (const fg of this.fishGroups()) {
        any = true; totalAll += fg.sum;
        const sellFish = (all) => () => {
          const bag = this.save.fishBag;
          const mine = bag.filter((f) => f.k === fg.k).sort((a, c) => c.v - a.v);
          const go = all ? mine : mine.slice(0, 1);
          let sum = 0;
          for (const f of go) { sum += f.v; bag.splice(bag.indexOf(f), 1); }
          this.addCoins(sum); this.stat('sold', go.length); refreshPanel(build);
        };
        const big = fg.list[0];
        b.append(itemRow(iconEl('fish:' + fg.k, 52), `${FISH[fg.k].name} ×${fg.list.length}`, `kopā ${fg.sum}🪙 · lielākā ${big.cm} cm, ${big.kg} kg (${big.v}🪙)`, [
          { label: 'Lielāko', onclick: sellFish(false) },
          { label: 'Visas', onclick: sellFish(true), alt: true },
        ]));
      }
      if (!any) b.append(el('p', {}, 'Tev pagaidām nav ko pārdot. Salasi sēnes mežā, izaudzē dārzeņus vai noķer zivis!'));
      else b.append(el('button', { className: 'pbtn', onclick: () => {
        let sum = 0, cnt = 0;
        for (const it of this.sellables()) { const n = this.save.inv[it.k] || 0; sum += n * it.price; cnt += n; this.save.inv[it.k] = 0; }
        for (const f of this.save.fishBag) { sum += f.v; cnt++; }
        this.save.fishBag = [];
        this.addCoins(sum); this.stat('sold', cnt); refreshPanel(build);
      } }, `💰 Pārdot visu (${totalAll}🪙)`));
    };
    showPanel('🧺 Āpsis Arnolds — uzpircējs', build);
  }

  // drēbju un cepuru veikals
  shopHats() {
    const build = (b) => {
      b.append(el('p', {}, 'Ū-hū! Cepures, krekli, brilles, apavi un vēl! Nopirkto uzvelc somā 🎒 (tur redzams tavs tēls). Esi stilīgs! 🎩'));
      this.coinLine(b);
      const row = (key, name, price, owned, worn, onBuy, onWear) => {
        const btns = owned
          ? [{ label: worn ? 'Novilkt' : 'Uzvilkt', alt: worn, onclick: () => { onWear(!worn); refreshPanel(build); } }]
          : [{ label: `Pirkt ${price}🪙`, disabled: this.save.coins < price, onclick: () => { if (this.save.coins < price) return; this.addCoins(-price); onBuy(); refreshPanel(build); } }];
        b.append(itemRow(iconEl(key, 44), name, owned ? (worn ? '✔ Uzvilkts' : 'Tev pieder') : `${price}🪙`, btns, worn ? 'sel' : ''));
      };
      b.append(el('div', { className: 'sect' }, 'Cepures'));
      for (const [k, h] of Object.entries(HATS)) {
        if (h.hidden && !this.save.ownedHats.includes(k)) continue;
        row('hat:' + k, h.name, h.price, this.save.ownedHats.includes(k), this.save.hat === k,
          () => { this.save.ownedHats.push(k); this.setHat(k); }, (on) => this.setHat(on ? k : null));
      }
      for (const sl of SLOTS) {
        if (sl.id === 'hat') continue;
        b.append(el('div', { className: 'sect' }, sl.name));
        for (const [k, c] of Object.entries(CLOTHES)) {
          if (c.slot !== sl.id) continue;
          row('cl:' + k, c.name, c.price, this.save.ownedClothes.includes(k), this.save.wear[c.slot] === k,
            () => { this.save.ownedClothes.push(k); this.setWearItem(c.slot, k); toast(`👕 ${c.name} — uzvilkts!`, 'good'); }, (on) => this.setWearItem(c.slot, on ? k : null));
        }
      }
      b.append(el('div', { className: 'sect' }, 'Kartinga krāsa'));
      for (const kc of KART_COLORS) {
        const owned = this.save.ownedKarts.includes(kc.id);
        const cur = this.save.kartColor === kc.id;
        const btns = owned
          ? [{ label: cur ? 'Izvēlēta' : 'Izvēlēties', disabled: cur, onclick: () => { this.setKartColor(kc.id); refreshPanel(build); } }]
          : [{ label: `Pirkt ${kc.price}🪙`, disabled: this.save.coins < kc.price, onclick: () => {
              if (this.save.coins < kc.price) return;
              this.addCoins(-kc.price); this.save.ownedKarts.push(kc.id); this.setKartColor(kc.id); refreshPanel(build);
            } }];
        const sw = el('span', { html: `<span style="display:inline-block;width:30px;height:30px;border-radius:8px;background:${kc.color}"></span>` });
        b.append(itemRow(sw, kc.name, '', btns));
      }
    };
    showPanel('🎩 Pūce Paula — drēbes un cepures', build);
  }

  setHat(k) {
    this.save.hat = k;
    this.avatar.setHat(k);
    this.sendProfile();
  }

  // uzvilkt / novilkt drēbi (krekls — tēls jāpārbūvē, pārējais tiek pielikts klāt)
  setWearItem(slot, id) {
    if (slot === 'hat') { this.setHat(id); return; }
    const w = this.save.wear = { ...(this.save.wear || {}) };
    if (id) w[slot] = id; else delete w[slot];
    if (slot === 'top') this.rebuildMyAvatar(); else this.avatar.setWear(w);
    sfx('cloth', { vol: 0.8 });
    this.sendProfile();
  }

  rebuildMyAvatar() {
    const old = this.avatar, parent = old.root.parent;
    const av = buildAnimal(this.avatarProf());
    av.root.position.copy(old.root.position); av.root.rotation.copy(old.root.rotation);
    av.root.visible = old.root.visible;
    av.shadow.visible = old.shadow.visible;
    if (parent) { parent.add(av.root); old.root.removeFromParent(); }
    av.root.add(this.myName);
    if (this.rod) av.root.add(this.rod);
    if (old.emoteSprite) { av.root.add(old.emoteSprite); av.emoteSprite = old.emoteSprite; }
    if (old.winter) av.setWinter(true);
    if (old.skis) av.setSkis(true);
    if (this.me.carry) av.setCarry(this.carryModel(this.me.carry.k));
    this.avatar = av;
  }

  setKartColor(id) {
    this.save.kartColor = id;
    if (this.me.kart) this.me.kart.obj.setColor(this.kartColorHex(id));
    this.sendProfile();
  }

  // ---------- tēla attēls somā (uzzīmē ar spēles zīmētāju atsevišķā mērķī) ----------
  dollImage(angle) {
    const W = 360, H = 480;
    const r = this.renderer;
    if (!this.doll) {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#ffffff', '#8a9a7a', 1.6));
      const d = new THREE.DirectionalLight('#ffffff', 2.2); d.position.set(2, 4, 4); scene.add(d);
      const cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 30);
      this.doll = { scene, cam, rt: new THREE.WebGLRenderTarget(W, H), key: null, av: null, px: new Uint8Array(W * H * 4) };
    }
    const D = this.doll;
    D.scene.environment = this.stage.environment;
    const key = JSON.stringify(this.avatarProf());
    if (D.key !== key) {
      if (D.av) { D.scene.remove(D.av.root); D.av.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      D.av = buildAnimal(this.avatarProf());
      D.av.shadow.visible = false;
      for (let i = 0; i < 40; i++) D.av.animate(0.05, 'idle', 0);
      D.scene.add(D.av.root);
      D.key = key;
    }
    D.av.root.rotation.y = angle;
    D.cam.position.set(0, 0.95, 4.4); D.cam.lookAt(0, 0.82, 0);
    const prevT = r.getRenderTarget(), cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    r.setRenderTarget(D.rt); r.setClearColor(0x000000, 0); r.clear();
    r.render(D.scene, D.cam);
    r.readRenderTargetPixels(D.rt, 0, 0, W, H, D.px);
    r.setRenderTarget(prevT); r.setClearColor(cc, ca);
    // lineāras krāsas → ekrāna (ACES + sRGB), apgriezts pa vertikāli
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), px = D.px;
    const tm = (v) => { v *= 1.25; const x = (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14); const y = Math.min(1, Math.max(0, x)); return y <= 0.0031308 ? y * 12.92 : 1.055 * Math.pow(y, 1 / 2.4) - 0.055; };
    const lut = new Uint8Array(256); for (let i = 0; i < 256; i++) lut[i] = Math.round(tm(i / 255) * 255);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const si = ((H - 1 - y) * W + x) * 4, di = (y * W + x) * 4;
      img.data[di] = lut[px[si]]; img.data[di + 1] = lut[px[si + 1]]; img.data[di + 2] = lut[px[si + 2]]; img.data[di + 3] = px[si + 3];
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---------- 🎒 soma: tēls ar uzvilktajām drēbēm + visas lietas režģī ----------
  bagItems() {
    const inv = this.save.inv, out = [];
    const add = (key, n, name, kind, extra = {}) => { if (n > 0) out.push({ key, n, name, kind, ...extra }); };
    for (const [k, c] of Object.entries(CROPS)) add(k + '_seed', inv[k + '_seed'] | 0, `${c.name} sēkla`, 'seed', { crop: k });
    for (const [k, t] of Object.entries(TREES)) add(k + '_sap', inv[k + '_sap'] | 0, `${t.name} — stāds`, 'sap', { tree: k });
    for (const [k, d] of Object.entries(DECOR)) add('d_' + k, inv['d_' + k] | 0, d.name, 'decor', { decor: k });
    for (const it of this.sellables()) add(it.k, inv[it.k] | 0, it.name, 'goods', { price: it.price });
    for (const fg of this.fishGroups()) add('fish:' + fg.k, fg.list.length, FISH[fg.k].name, 'fish', { fish: fg });
    for (const k of this.save.ownedHats) add('hat:' + k, 1, HATS[k] ? HATS[k].name : k, 'hat', { id: k, worn: this.save.hat === k });
    for (const k of this.save.ownedClothes) if (CLOTHES[k]) add('cl:' + k, 1, CLOTHES[k].name, 'cloth', { id: k, worn: this.save.wear[CLOTHES[k].slot] === k });
    if (this.save.rod) add('rod', 1, 'Makšķere', 'tool');
    return out;
  }

  openBag(sel = null) {
    this.bagSel = sel;
    this.giftN = 1;
    let angle = 0.35;
    const build = (b) => {
      // tēls un drēbju vietas
      const doll = el('div', { className: 'doll' });
      const slotEl = (sl) => {
        const id = sl.id === 'hat' ? this.save.hat : this.save.wear[sl.id];
        const d = el('button', { className: 'slot' + (this.bagSel === 'slot:' + sl.id ? ' on' : '') + (id ? ' full' : ''), onclick: () => { this.bagSel = 'slot:' + sl.id; refreshPanel(build); } });
        if (id) d.append(iconEl(sl.id === 'hat' ? 'hat:' + id : 'cl:' + id, 40)); else d.append(el('span', { className: 'slot-empty' }, '＋'));
        d.append(el('small', {}, sl.name));
        return d;
      };
      const colL = el('div', { className: 'doll-col' }), colR = el('div', { className: 'doll-col' });
      SLOTS.slice(0, 3).forEach((sl) => colL.append(slotEl(sl)));
      SLOTS.slice(3).forEach((sl) => colR.append(slotEl(sl)));
      const mid = el('div', { className: 'doll-mid' });
      try { const c = this.dollImage(angle); c.className = 'doll-img'; mid.append(c); } catch (e) { console.warn(e); mid.append(el('div', { style: 'font-size:60px' }, '🧸')); }
      const rot = el('div', { className: 'doll-rot' });
      rot.append(el('button', { onclick: () => { angle -= 0.8; refreshPanel(build); } }, '↺'), el('button', { onclick: () => { angle += 0.8; refreshPanel(build); } }, '↻'));
      mid.append(rot);
      doll.append(colL, mid, colR);
      b.append(doll);
      // nauda
      const coinRow = el('button', { className: 'coin-row' + (this.bagSel === 'coins' ? ' on' : ''), onclick: () => { this.bagSel = 'coins'; refreshPanel(build); } });
      coinRow.append(iconEl('coin', 26), ` ${this.save.coins} monētas`, this.remotes.size ? el('small', {}, ' · 🎁 dāvināt') : '');
      b.append(coinRow);
      if (this.me.carry && this.me.carry.trail == null) b.append(itemRow(iconEl('decor:' + this.me.carry.k, 40), `Nes rokās: ${DECOR[this.me.carry.k].name}`, 'Novieto savā sētā vai ieliec somā', [{ label: '🎒 Ielikt somā', onclick: () => { this.stowCarry(); refreshPanel(build); } }], 'sel'));
      // izvēlētās lietas apraksts un darbības
      const det = this.bagDetail(build);
      if (det) b.append(det);
      // režģis
      const items = this.bagItems();
      b.append(el('div', { className: 'sect' }, `Somā (${items.length})`));
      const grid = el('div', { className: 'inv-grid' });
      for (const it of items) {
        const cell = el('button', { className: 'inv-cell' + (this.bagSel === it.key ? ' on' : '') + (it.worn ? ' worn' : ''), title: it.name, onclick: () => { this.bagSel = it.key; this.giftN = 1; refreshPanel(build); } });
        cell.append(iconEl(it.key, it.kind === 'fish' ? 48 : 40));
        if (it.n > 1) cell.append(el('span', { className: 'cnt' }, String(it.n)));
        if (it.worn) cell.append(el('span', { className: 'cnt wornb' }, '✔'));
        if (it.kind === 'seed' && this.currentSeed() === it.crop) cell.append(el('span', { className: 'cnt selb' }, '🌱'));
        if (it.kind === 'sap' && this.currentSeed() === 'sap:' + it.tree) cell.append(el('span', { className: 'cnt selb' }, '🌳'));
        grid.append(cell);
      }
      if (!items.length) grid.append(el('p', {}, 'Soma ir tukša.'));
      b.append(grid);
      // sasniegumi
      const ach = el('details', { className: 'ach' });
      ach.append(el('summary', {}, '🏆 Mani sasniegumi'));
      const st = this.save.stats;
      ach.append(itemRow('⭐', `Zelta zvaigznes: ${this.save.stars.length}/15`, this.save.revealed ? 'Visas redzamas kartē' : 'Uzkāp 🗼 skatu tornī — no turienes redz visas!'));
      ach.append(itemRow('🗺️', `Īpašās vietas: ${this.save.places.length}/${this.world.places.length}`, this.save.places.map((id) => PLACES[id].icon).join(' ')));
      ach.append(itemRow('📜', `Kartes gabali: ${this.save.pieces.length}/${MAP_PIECES.length}`, this.save.treasure ? 'Dārgums atrasts! 🏰' : 'Ar visiem gabaliem atver lādi 🏰 Pilsdrupās'));
      const fb = this.save.fishBest || {};
      ach.append(itemRow('🎣', this.save.rod ? `Noķertas zivis: ${st.fish || 0}` : 'Makšķere — pie Ūdra Ojāra', Object.keys(fb).length ? 'Rekordi: ' + Object.entries(fb).map(([k, kg]) => `${FISH[k].name} ${kg} kg`).join(', ') : ''));
      ach.append(itemRow('🫐', `Salasītas ogas: ${st.berries || 0}`));
      ach.append(itemRow('🐾', this.save.pet ? `Mājdzīvnieks: ${PETS[this.save.pet].name}` : 'Mājdzīvnieka vēl nav', 'Suns Sprīdis ciematā'));
      ach.append(itemRow('🏆', `Nedēļas mērķi sasniegti: ${this.save.trophies || 0}`));
      ach.append(itemRow('🍄', `Salasītas sēnes: ${st.mushrooms || 0}`));
      ach.append(itemRow('🥕', `Novākti dārzeņi: ${st.harvested || 0} · augļi: ${st.fruits || 0}`));
      ach.append(itemRow('🏎️', `Sacīkstes: ${st.races || 0} · uzvaras: ${st.wins || 0}`, this.save.bestLap ? `Labākais aplis: ${fmtTime(this.save.bestLap)}` : ''));
      ach.append(itemRow('⏱️', `Spēlēts: ${Math.round(this.save.playTime / 60)} min`));
      b.append(ach);
    };
    this.bagBuild = build;
    showPanel('🎒 Mana soma', build);
  }

  // izvēlētās lietas kartiņa somā
  bagDetail(build) {
    const sel = this.bagSel;
    if (!sel) return el('p', { className: 'bag-hint' }, '👆 Pieskaries lietai, lai to izmantotu, uzvilktu vai uzdāvinātu draugam.');
    const box = el('div', { className: 'bag-detail' });
    const head = (key, title, sub) => {
      const h = el('div', { className: 'bd-head' });
      h.append(iconEl(key, key.startsWith('fish:') ? 90 : 64));
      const t = el('div', {}, el('b', {}, title));
      if (sub) t.append(el('div', { className: 'bd-sub', html: sub }));
      h.append(t);
      box.append(h);
    };
    const btns = el('div', { className: 'bd-btns' });
    const btn = (label, fn, alt = false) => btns.append(el('button', { className: 'pbtn' + (alt ? ' alt' : ''), onclick: () => { fn(); refreshPanel(build); } }, label));
    const redraw = () => refreshPanel(build);
    // drēbju vieta: izvēle no nopirktajām
    if (sel.startsWith('slot:')) {
      const slot = sel.slice(5), sl = SLOTS.find((x) => x.id === slot);
      box.append(el('b', {}, `${sl.name}: izvēlies, ko uzvilkt`));
      const opts = slot === 'hat' ? this.save.ownedHats.map((k) => ['hat:' + k, k, HATS[k] ? HATS[k].name : k])
        : this.save.ownedClothes.filter((k) => CLOTHES[k] && CLOTHES[k].slot === slot).map((k) => ['cl:' + k, k, CLOTHES[k].name]);
      const cur = slot === 'hat' ? this.save.hat : this.save.wear[slot];
      const row = el('div', { className: 'inv-grid small' });
      for (const [key, id, name] of opts) {
        const c = el('button', { className: 'inv-cell' + (cur === id ? ' on worn' : ''), title: name, onclick: () => { this.setWearItem(slot, cur === id ? null : id); redraw(); } });
        c.append(iconEl(key, 40)); row.append(c);
      }
      if (!opts.length) box.append(el('p', {}, `Tev vēl nav — nopērc pie 🎩 Pūces Paulas tirgū!`));
      else box.append(row);
      if (cur) btn('🚫 Novilkt', () => this.setWearItem(slot, null), true);
      box.append(btns);
      return box;
    }
    if (sel === 'coins') {
      head('coin', `${this.save.coins} monētas`, 'Vari uzdāvināt monētas draugam.');
      this.giftRow(box, [5, 10, 25, 50, 100].filter((n) => n <= this.save.coins), (n) => ({ coins: n }), build);
      return box;
    }
    const it = this.bagItems().find((x) => x.key === sel);
    if (!it) { this.bagSel = null; return null; }
    if (it.kind === 'seed') {
      const c = CROPS[it.crop];
      head(it.key, `${it.name} ×${it.n}`, `Aug ${fmtLeft(c.grow)} (aplaistīts — ātrāk) · raža ×${c.yield} · ${c.sell}🪙 gab.`);
      if (this.currentSeed() !== it.crop) btn('🌱 Sēt šo', () => { this.selectedSeed = it.crop; toast(`🌱 Sēsi: ${c.name}`); });
      else btns.append(el('span', { className: 'bd-note' }, '✔ Izvēlēta sēšanai'));
    } else if (it.kind === 'sap') {
      const t = TREES[it.tree];
      head(it.key, `${it.name} ×${it.n}`, `Iestādi uz uzarta lauciņa savā dārzā. Izaug ${fmtLeft(t.grow)}, tad ik pa ${fmtLeft(t.every)} — ${FRUITS[t.fruit].name.toLowerCase()} ×${t.yield}.`);
      if (this.currentSeed() !== 'sap:' + it.tree) btn('🌳 Stādīt šo', () => { this.selectedSeed = 'sap:' + it.tree; toast(`🌳 Stādīsi: ${t.name}. Ej uz uzartu lauciņu!`); });
      else btns.append(el('span', { className: 'bd-note' }, '✔ Izvēlēts stādīšanai'));
    } else if (it.kind === 'decor') {
      head(it.key, `${it.name}${it.n > 1 ? ' ×' + it.n : ''}`, 'Dārza rotājums. Izņem to savā sētā un novieto, kur patīk!');
      btn('📍 Novietot sētā', () => {
        if (this.zone !== FARM || plotOf(this.me.pos.x, this.me.pos.z) !== this.mySlot) { toast('🏡 Vispirms aizej uz savu sētu'); return; }
        if (this.me.carry || this.me.veh || this.me.ride) { toast('Rokas jau aizņemtas!'); return; }
        this.save.inv[it.key]--;
        closePanel();
        this.startCarry(it.decor);
        toast('🤲 Nes rokās. Pagriezies, kur likt, un spied „📍 Novietot”.', '', 4000);
      });
    } else if (it.kind === 'goods') {
      head(it.key, `${it.name} ×${it.n}`, `Vērtība: ${it.price}🪙 gab. · kopā ${it.price * it.n}🪙 · pārdod 🧺 Āpsim Arnoldam tirgū`);
    } else if (it.kind === 'fish') {
      const fg = it.fish;
      head(it.key, `${it.name} ×${it.n}`, fg.list.slice(0, 6).map((f) => `${f.cm} cm · ${f.kg} kg · ${f.v}🪙`).join('<br>') + (fg.list.length > 6 ? '<br>…' : '') + `<br>Kopā ${fg.sum}🪙`);
    } else if (it.kind === 'hat' || it.kind === 'cloth') {
      const slot = it.kind === 'hat' ? 'hat' : CLOTHES[it.id].slot;
      head(it.key, it.name, it.worn ? '✔ Uzvilkts' : 'Tev pieder');
      btn(it.worn ? '🚫 Novilkt' : '👕 Uzvilkt', () => this.setWearItem(slot, it.worn ? null : it.id), it.worn);
    } else {
      head(it.key, it.name, 'Ej pie ezera un spied „🎣 Makšķerēt”.');
    }
    box.append(btns);
    // dāvināšana
    if (it.kind !== 'tool' && !it.worn) {
      if (it.kind === 'hat' || it.kind === 'cloth') this.giftRow(box, [1], () => (it.kind === 'hat' ? { hat: it.id } : { cloth: it.id }), build);
      else if (it.kind === 'fish') this.giftRow(box, [1, it.n].filter((v, i, a) => a.indexOf(v) === i), (n) => ({ fish: it.fish.list.slice(0, n).map((f) => ({ ...f })) }), build);
      else this.giftRow(box, [1, 5, it.n].filter((v, i, a) => v <= it.n && a.indexOf(v) === i), (n) => ({ k: it.key, n }), build);
    }
    return box;
  }

  // dāvināšanas rinda: daudzums un draugi
  giftRow(box, amounts, mk, build) {
    if (!this.remotes.size) { box.append(el('div', { className: 'bd-note' }, '🎁 Dāvināt var, kad istabā ir draugi.')); return; }
    if (!amounts.length) return;
    if (!amounts.includes(this.giftN)) this.giftN = amounts[0];
    const w = el('div', { className: 'gift' });
    w.append(el('b', {}, '🎁 Uzdāvināt: '));
    if (amounts.length > 1) for (const n of amounts) w.append(el('button', { className: 'gn' + (this.giftN === n ? ' on' : ''), onclick: () => { this.giftN = n; refreshPanel(build); } }, `×${n}`));
    const pl = el('div', { className: 'bd-btns' });
    for (const r of this.remotes.values()) {
      pl.append(el('button', { className: 'pbtn gift-to', onclick: () => { this.sendGift(r.id, mk(this.giftN)); refreshPanel(build); } }, `🎁 ${r.prof.name}`));
    }
    w.append(pl);
    box.append(w);
  }

  // dāvana: no manis atņem uzreiz, saimnieks nodod saņēmējam (ja viņa vairs nav — atdod atpakaļ)
  giftText(g) {
    if (g.coins) return `${g.coins}🪙`;
    if (g.hat) return HATS[g.hat] ? HATS[g.hat].name : g.hat;
    if (g.cloth) return CLOTHES[g.cloth] ? CLOTHES[g.cloth].name : g.cloth;
    if (g.fish) return `${FISH[g.fish[0].k].name} ×${g.fish.length}`;
    const it = this.bagItems().find((x) => x.key === g.k);
    const name = it ? it.name : g.k.endsWith('_seed') ? `${(CROPS[g.k.slice(0, -5)] || {}).name} sēkla` : g.k.endsWith('_sap') ? `${(TREES[g.k.slice(0, -4)] || {}).name} — stāds` : g.k.startsWith('d_') ? (DECOR[g.k.slice(2)] || {}).name : ((this.sellables().find((x) => x.k === g.k) || {}).name || g.k);
    return `${name}${g.n > 1 ? ' ×' + g.n : ''}`;
  }
  sendGift(to, g) {
    const s = this.save;
    if (g.coins) { if (s.coins < g.coins) return; this.addCoins(-g.coins, true); }
    else if (g.hat) { if (!s.ownedHats.includes(g.hat) || s.hat === g.hat) return; s.ownedHats = s.ownedHats.filter((x) => x !== g.hat); }
    else if (g.cloth) { if (!s.ownedClothes.includes(g.cloth) || Object.values(s.wear).includes(g.cloth)) return; s.ownedClothes.splice(s.ownedClothes.indexOf(g.cloth), 1); }
    else if (g.fish) { for (const f of g.fish) { const i = s.fishBag.findIndex((x) => x.k === f.k && x.kg === f.kg && x.cm === f.cm); if (i >= 0) s.fishBag.splice(i, 1); } }
    else { const n = Math.min(g.n, s.inv[g.k] | 0); if (!n) return; g.n = n; s.inv[g.k] -= n; }
    const r = this.remotes.get(to);
    this.net.toHost({ t: 'gift', to, g });
    sfx('ui_gift', { vol: 0.7 });
    toast(`🎁 Uzdāvināji ${r ? r.prof.name : 'draugam'}: ${this.giftText(g)}`, 'good');
    this.persist();
  }
  onGift(m) {
    const s = this.save, g = m.g;
    if (!g) return;
    if (g.coins) this.addCoins(Math.max(0, Math.min(100000, g.coins | 0)), true);
    else if (g.hat) { if (HATS[g.hat] && !s.ownedHats.includes(g.hat)) s.ownedHats.push(g.hat); }
    else if (g.cloth) { if (CLOTHES[g.cloth] && !s.ownedClothes.includes(g.cloth)) s.ownedClothes.push(g.cloth); }
    else if (Array.isArray(g.fish)) { for (const f of g.fish.slice(0, 200)) if (FISH[f.k] && !FISH[f.k].junk) s.fishBag.push({ k: f.k, cm: +f.cm || 0, kg: +f.kg || 0, v: Math.max(0, f.v | 0) }); }
    else if (typeof g.k === 'string' && /^[a-z_]+$/.test(g.k)) this.addItem(g.k, Math.max(0, Math.min(999, g.n | 0)));
    if (m.back) toast(`🎁 Dāvanu nevarēja nodot — ${this.giftText(g)} atpakaļ tavā somā`);
    else {
      sfx('ui_gift', { vol: 0.7 }); sfx('j_quest', { vol: 0.6, delay: 0.2 });
      const key = g.coins ? 'coin' : g.hat ? 'hat:' + g.hat : g.cloth ? 'cl:' + g.cloth : g.fish ? 'fish:' + g.fish[0].k : g.k;
      this.showPrize(`🎁 Dāvana no ${m.name}!`, key, this.giftText(g), 'Tā ir tavā somā 🎒');
    }
    this.persist();
    if (panelOpen() && this.bagBuild && $('panel-title').textContent === '🎒 Mana soma') refreshPanel(this.bagBuild);
  }

  openQuests() {
    showPanel('📜 Uzdevumi', (b) => {
      const left = 7 - ((Math.floor(Date.now() / 86400000) + 3) % 7);
      b.append(el('p', {}, `🤝 Šīs nedēļas kopīgais mērķis: ${this.teamText()} (${Math.min(this.team.c, this.team.target)}/${this.team.target}). Skaitās visu draugu darbi, un progress saglabājas! Balva — ${WEEKLY_REWARD}🪙 katram. Jauns mērķis pēc ${left} d.`));
      const sorted = [...QUESTS].sort((a, c) => (!!this.save.quests[a.id]) - (!!this.save.quests[c.id]));
      for (const q of sorted) {
        const done = !!this.save.quests[q.id];
        const have = Math.min(q.need, this.save.stats[q.stat] || 0);
        const row = itemRow(done ? '✅' : '📌', q.text, done ? 'Izpildīts!' : `${have}/${q.need} · balva ${q.reward}🪙`, [], done ? 'done' : '');
        if (!done) {
          const bar = el('div', { className: 'bar' }, el('div', { style: `width:${have / q.need * 100}%` }));
          row.querySelector('.nm').append(bar);
        }
        b.append(row);
      }
    });
  }

  openRoom() {
    showPanel('👥 Istaba', (b) => {
      const gi = this.gameInfo;
      b.append(el('div', { className: 'sect' }, `🎮 Spēle: ${gi.name}${gi.id ? ' · #' + gi.id : ''}`));
      if (this.net.offline) {
        b.append(el('p', {}, 'Tu spēlē viens bez interneta. Lai spēlētu ar draugiem, izej uz sākumu un izveido istabu.'));
      } else {
        b.append(el('div', { className: 'sect' }, `Istabas kods: ${this.roomCode}`));
        b.append(el('p', {}, this.net.isHost ? 'Tu esi saimnieks 🏠. Draugi var pievienoties ar šo kodu vai saiti. Ja tu aizvērsi spēli, istaba beigsies.' : 'Tu esi pievienojies drauga istabai.'));
        b.append(el('p', { style: 'font-size:13px;opacity:.75' }, '💾 Katra spēlētāja progress (monētas, dārzs, soma, drēbes) glabājas viņa paša telefonā — katrai spēlei atsevišķi. Saimnieks, veidojot istabu, izvēlas spēli (vai „🆕 Jauna spēle visiem”), un katrs draugs ielādē savu progresu tieši šai spēlei. Saimnieka telefonā glabājas arī tas, kur stāv kopīgās mašīnas.'));
        const link = location.origin + location.pathname + '?istaba=' + this.roomCode;
        b.append(el('button', { className: 'pbtn', onclick: async () => {
          try {
            if (navigator.share) await navigator.share({ title: 'Mežvidu Draugi', text: `Nāc spēlēt! Istabas kods: ${this.roomCode}`, url: link });
            else { await navigator.clipboard.writeText(link); toast('Saite nokopēta! 📋'); }
          } catch (e) { /* atcelts */ }
        } }, '📤 Dalīties ar saiti'));
      }
      b.append(el('div', { className: 'sect' }, 'Spēlētāji'));
      const animalName = (a) => (ANIMALS.find((x) => x.id === a) || {}).name || a;
      const zn = (z) => ` · ${ZONES[z || 'c'].icon} ${ZONES[z || 'c'].name}`;
      b.append(itemRow('⭐', `${this.save.name} (tu)`, animalName(this.save.animal) + (this.net.isHost ? ' · saimnieks' : '') + zn(this.zone)));
      for (const r of this.remotes.values()) b.append(itemRow('🙂', r.prof.name, animalName(r.prof.animal) + (r.id === 0 ? ' · saimnieks' : '') + zn(r.zone)));
      b.append(el('div', { style: 'font-size:12px;opacity:.7;margin-top:8px' }, '🚶 Pie draugiem un uz savu sētu nokļūsti kājām, ar velosipēdu, mašīnu vai autobusu — kartē redzams, kur kurš ir.'));
    });
  }

  // ☰ izvēlne: lielas flīzes; pamācība un iestatījumi — atsevišķos logos (1.29.0)
  openMenu() {
    showPanel('☰ Izvēlne', (b) => {
      const gi = this.gameInfo || {};
      b.append(el('div', { className: 'menu-hello' }, el('b', {}, `${this.save.name}`), el('span', {}, ` · 🎮 ${gi.name || 'Pirmā spēle'}${gi.id ? ' #' + gi.id : ''} · 🪙 ${this.save.coins}`)));
      const grid = el('div', { className: 'mgrid' });
      const tile = (ic, name, sub, cls, fn) => grid.append(el('button', { className: 'mtile ' + cls, onclick: fn }, el('span', { className: 'mi' }, ic), el('span', { className: 'mn' }, name), el('span', { className: 'ms' }, sub)));
      tile('📖', 'Pamācība', 'Kā spēlēt', 't-blue', () => this.openManual());
      tile('⚙️', 'Iestatījumi', 'Grafika, ekrāns', 't-grey', () => this.openSettings());
      tile('🎒', 'Soma', 'Lietas un drēbes', 't-orange', () => this.openBag());
      tile('📜', 'Uzdevumi', 'Balvas', 't-yellow', () => this.openQuests());
      tile('🌱', 'Mans dārzs', `${this.gardenLvl()}. līmenis`, 't-green', () => this.openGardenInfo());
      tile('👥', 'Istaba', this.net.offline ? 'Viens' : `Kods ${this.roomCode}`, 't-purple', () => this.openRoom());
      tile('🗺️', 'Karte', 'Visas zemes', 't-teal', () => { closePanel(); this.openBigMap(); });
      tile('🎲', 'Spēles', 'Ar draugiem', 't-pink', () => this.openGames());
      tile('🐞', 'Kļūdas vieta', 'Saglabāt / turpināt', 't-grey', () => this.openBugSpot());
      b.append(grid);
      const row = el('div', { className: 'mrow' });
      row.append(el('button', { className: 'mbtn', onclick: () => { this.persist(); toast('💾 Saglabāts!', 'good'); } }, '💾 Saglabāt'));
      row.append(el('button', { className: 'mbtn red', onclick: () => this.quit() }, '🚪 Saglabāt un iziet'));
      b.append(row);
      b.append(el('div', { className: 'mver' }, `Versija ${VERSION} · ${BUILD_DATE}`));
    });
  }

  openSettings() {
    showPanel('⚙️ Iestatījumi', (b) => {
      const opt = (ic, name, sub, valFn, fn) => {
        const v = el('span', { className: 'sv' }, valFn());
        const r = el('button', { className: 'srow', onclick: () => { fn(); v.textContent = valFn(); } },
          el('span', { className: 'si' }, ic), el('span', { className: 'st' }, el('b', {}, name), el('small', {}, sub)), v);
        b.append(r);
      };
      opt('⛶', 'Pilnekrāns', 'Spēle aizņem visu ekrānu', () => (document.fullscreenElement ? 'Ieslēgts' : 'Izslēgts'), () => {
        try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } catch (e) { /* */ }
        setTimeout(() => this.openSettings(), 400);
      });
      opt('🎨', 'Grafika', 'Auto pats izvēlas pēc tā, cik ātri telefons zīmē', () => this.qualityLabel(),
        () => this.setQualityMode(Q_MODES[(Q_MODES.indexOf(this.qMode) + 1) % Q_MODES.length]));
      // 1.47.2: skaļuma slīdņi — kopējais, efekti, balsis (balsis līdz 200 %)
      const slider = (ic, name, sub, get, set, max, test) => {
        const val = el('span', { className: 'sv' }, Math.round(get() * 100) + '%');
        const inp = el('input', { type: 'range', min: '0', max: String(max * 100), step: '5', value: String(Math.round(get() * 100)), className: 'vslider' });
        let tt = 0;
        inp.oninput = () => { set(inp.value / 100); val.textContent = inp.value + '%'; };
        inp.onchange = () => { const n = performance.now(); if (n - tt > 600) { tt = n; test(); } };
        b.append(el('div', { className: 'srow vrow' }, el('span', { className: 'si' }, ic), el('span', { className: 'st' }, el('b', {}, name), el('small', {}, sub), inp), val));
      };
      slider('🔊', 'Kopējais skaļums', 'Visas skaņas kopā', getVolume, setVolume, 1, () => sfx('coin'));
      slider('🎵', 'Efekti', 'Skaņas, soļi, vide un dzinēji', getFxVolume, setFxVolume, 1, () => sfx('coin'));
      slider('🗣️', 'Balsu skaļums', 'Dzīvnieku un stāstnieka runa (virs 100 % — pastiprināta)', getVoiceVolume, setVoiceVolume, 2, () => voice('t_clear'));
      opt('🗣️', 'Balsis', 'Dzīvnieki un stāstnieks runā latviski', () => (voiceOn() ? 'Ieslēgtas' : 'Izslēgtas'), () => {
        setVoiceOn(!voiceOn()); if (voiceOn()) voice('t_clear');
      });
      opt('📊', 'Ātruma mērītājs', 'Kadri sekundē un zīmēšanas izsaukumi', () => (this.statsOn ? 'Ieslēgts' : 'Izslēgts'), () => this.toggleStats());
      b.append(el('div', { className: 'stip' }, '📲 Padoms: pārlūka izvēlnē „Pievienot sākuma ekrānam” — tad spēle atveras pilnekrānā bez Android paziņojuma apakšā.'));
      const row = el('div', { className: 'mrow' });
      row.append(el('button', { className: 'mbtn', onclick: () => this.openMenu() }, '⬅ Atpakaļ'));
      row.append(el('button', { className: 'mbtn', onclick: () => { this.persist(); toast('💾 Saglabāts!', 'good'); } }, '💾 Saglabāt'));
      row.append(el('button', { className: 'mbtn red', onclick: () => this.quit() }, '🚪 Iziet'));
      b.append(row);
    });
  }

  openManual() {
    const S = [
      ['🕹️', 'Vadība', ['<b>Kreisā puse</b> — velc pirkstu, lai staigātu.', '<b>Labā puse</b> — velc, lai grozītu kameru (2 pirksti — tuvināt).', '⤒ — lēkt. <b>Dzeltenā poga</b> parādās, kad vari kaut ko darīt.', '🚙 Braucot: kreisajā pusē ⛽ gāze un 🛑 bremze (atpakaļgaita), labajā ◀ ▶ stūre.']],
      ['🏡', 'Sēta un dārzs', ['Centrā ir sēta — katram draugam savs lauks.', 'Nocērt kokus 🪓, novāc akmeņus ⛏️, uzar, sēj, aplaisti 💧 un novāc ražu 🧺.', 'Augi aug arī tad, kad spēle aizvērta! Blakus vienādie augi saaug vienā laukā.', '🌱 Par darbiem dārzā krājas ⭐ — jauns līmenis atver jaunas sēklas un lielāku dārzu.', '🌳 Augļu koki dod augļus atkal un atkal. 🤲 Rotājumus var pārnest citur.']],
      ['🌲', 'Mežs un tirgus', ['Austrumos — Mežvidu ciems ar tirgu: pārdod ražu, pērc sēklas, cepures, drēbes, mājdzīvniekus un rotājumus.', '🍄 Lasi sēnes (bet ne sarkanās mušmires!), 🫐 mellenes, avenes, purvā — dzērvenes.', '🎣 Nopērc makšķeri un makšķerē ezeros — kad pludiņš raustās, spied „VILKT!”.', '⛺ Pie ugunskura izcep sēnes. 🪙 Akā iemet 5🪙 — dažreiz izkrīt kaut kas jauks!']],
      ['⭐', 'Noslēpumi', ['Kalnu virsotnēs paslēptas 15 zelta zvaigznes — no 🗼 skatu torņa tās redz kartē.', '🗺️ Atrodi 3 kartes gabalus (ugunskurs, tornis, purvs) un atver dārguma lādi 🏰 Pilsdrupās!']],
      ['🚌', 'Transports', ['🚌 Autobuss brauc pa apli: ziema → sēta → trase → tirgus. Iekāp pieturā (2🪙).', '🚙🚲 Mašīnas un velosipēdi — ar tiem var braukt ikviens; kur atstāsi, tur paliks.', '🏎️ Rietumos — sacīkšu trase ar tuneļiem un kartiem.', '🐾 Tavs mājdzīvnieks vienmēr brauc līdzi!']],
      ['❄️', 'Ziema', ['Ziemeļos — slēpošanas kalns ar pacēlāju 🚡, sniega pikas un ziemas laukums.']],
      ['🤝', 'Ar draugiem', ['👥 Draugu sētās var aiziet ciemos un aplaistīt viņu laukus.', '🎁 Somā lietas un monētas var uzdāvināt.', '🎲 Spēlē ķeramo un paslēpes. Katru nedēļu — jauns kopīgais mērķis.', '🧭 Pār robežu var pāriet jebkur. Pieskaries minikartei — liela karte ar draugiem un transportu.']],
    ];
    showPanel('📖 Pamācība', (b) => {
      for (const [ic, h, items] of S) {
        const c = el('details', { className: 'mcard' });
        c.append(el('summary', {}, el('span', { className: 'mi' }, ic), el('b', {}, h)));
        const ul = el('ul');
        for (const t of items) ul.append(el('li', { html: t }));
        c.append(ul);
        b.append(c);
      }
      b.querySelector('details').open = true;
      b.append(el('div', { className: 'mrow' }, el('button', { className: 'mbtn', onclick: () => this.openMenu() }, '⬅ Atpakaļ')));
    });
  }

  quit() {
    this.persist();
    this.ended = true;
    try { this.net.close(); } catch (e) { /* */ }
    location.href = location.pathname;
  }
}

Object.assign(Game.prototype, Activities, Quality, Winter, Vehicles, Farm, Bus, Garden, Sound, Trail, BugSpot);
Game.prototype.weeklyIcon = function () { return ({ mushrooms: '🍄', fish: '🐟', berries: '🫐', harvested: '🥕', petted: '🦌', races: '🏎️' })[this.team.stat] || ''; };

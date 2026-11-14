import * as THREE from 'three';
import { World, WATER_Y, TRACK_Y, TRACK_N, TRACK_WIDTH, GARDEN_SLOTS, plotPos, VENDORS, SPAWN, VILLAGE_Y, HALF, SIZE, PLAY_RADIUS } from './world.js?v=1.6.0';
import { buildAnimal, buildNPC, buildKart, buildCart, buildMushroom, buildStar, buildCrop, flattenStatic } from './characters.js?v=1.6.0';
import { Controls } from './controls.js?v=1.6.0';
import { Sky } from 'three/addons/objects/Sky.js';
import { WORLD_SEED, CROPS, MUSHROOMS, HATS, KART_COLORS, ICE_CREAM_PRICE, QUESTS, NPC_TYPES, EMOTES, RACE_LAPS, ANIMALS } from './data.js?v=1.6.0';
import { writeSave } from './save.js?v=1.6.0';
import { VERSION, BUILD_DATE } from './version.js?v=1.6.0';
import { makeTextSprite, angleLerp, clamp, lerp, smoothstep, canvasTexture } from './util.js?v=1.6.0';
import { $, toast, showPanel, refreshPanel, closePanel, panelOpen, el, itemRow, sfx, fmtTime } from './ui.js?v=1.6.0';
import { Activities, makeTeam } from './activities.js?v=1.6.0';
import { terrainMaterial, hdrEnvironment, upgradeWater, PlanarReflection, PostFX, loadTexture } from './gfx.js?v=1.6.0';
import { buildRod, buildDecor } from './props.js?v=1.6.0';
import { FISH, BERRIES, COOKED, PETS, PLACES, MAP_PIECES, WEEKLY_REWARD } from './data.js?v=1.6.0';

const ANIM = ['idle', 'walk', 'run', 'jump', 'swim', 'sit', 'pet', 'wave', 'fish'];
const MUSH_RESPAWN = 120000;
const EPOCH = 1.7e12;
const BOTS = [
  { name: 'Zaķis Zigis 🤖', animal: 'zakis', fur: '#d9d2c5', shirt: '#2f6fd6', kart: '#2a6ae0', speed: 14 },
  { name: 'Lapsa Laura 🤖', animal: 'lapsa', fur: '#e8742a', shirt: '#2fa84f', kart: '#2ab04a', speed: 15.5 },
  { name: 'Lācis Lauris 🤖', animal: 'lacis', fur: '#8b5a2b', shirt: '#f2c12e', kart: '#e8c020', speed: 17 },
];
const SEED_ICON = '🌱';
const MUSH_ICON = { baravika: '🍄', gailene: '🍄', musmire: '🍄' };
const PLAYER_DOT = ['#ff4040', '#40a0ff', '#ffd040', '#c060ff'];

export class Game {
  constructor({ save, net, roomCode }) {
    this.save = save;
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
  init() {
    const canvas = $('game');
    let q = 'high';
    try { q = localStorage.getItem('mezvidi_quality') || 'high'; } catch (e) { /* */ }
    if (!['high', 'mid', 'low'].includes(q)) q = 'high';
    this.quality = q;
    const hi = q !== 'low';      // ēnas, pilna zāle, foto faktūras
    const ultra = q === 'high';  // + ūdens atspulgi un pēcapstrāde
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hi ? 1.5 : 1));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.62;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 450);

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
    this.scene.add(this.sky);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(mkSky(500));
    this.scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
    pmrem.dispose();
    this.scene.fog = new THREE.Fog(new THREE.Color('#a9c6dc'), 100, 360);

    this.scene.add(new THREE.HemisphereLight('#cfe3f5', '#4a5a30', 0.5));
    const sun = new THREE.DirectionalLight('#fff1d6', 3.2);
    sun.position.copy(this.sunDir).multiplyScalar(120);
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
    if (hi) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera;
      sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.04;
    }
    window.addEventListener('resize', () => this.onResize());

    this.world = new World(WORLD_SEED);
    this.world.lowQ = !hi;
    this.world.build(this.scene, this.renderer);
    this.camera.layers.enable(1);
    this.setupGfx(hi, ultra);

    this.buildMushrooms();
    this.buildStars();
    this.buildNpcs();
    this.buildVendors();
    this.buildGardens();
    this.buildMinimap();

    // mans tēls
    const sp = this.save.pos && Math.hypot(this.save.pos.x, this.save.pos.z) < PLAY_RADIUS - 5 && this.world.getHeight(this.save.pos.x, this.save.pos.z) > WATER_Y
      ? this.save.pos : SPAWN;
    this.me = {
      pos: new THREE.Vector3(sp.x, this.world.getHeight(sp.x, sp.z), sp.z),
      vy: 0, heading: 0, onGround: true, state: 'idle', inKart: false,
      kart: null, boost: 0, dizzy: 0, iceCream: 0, waveT: 0, petT: 0, progress: 0,
    };
    this.avatar = buildAnimal(this.save);
    this.scene.add(this.avatar.root);
    this.myName = makeTextSprite(this.save.name, { bg: 'rgba(40,120,40,0.7)' });
    this.myName.position.y = 2.25;
    this.avatar.root.add(this.myName);

    this.initActivities();

    this.cam = { yaw: Math.PI * 0.25, pitch: 0.38, dist: 7.5 };
    this.controls = new Controls($('touch'));
    this.bindHud();
    this.setupNet();
    this.updateCoins();
    this.onResize();
  }

  // foto faktūras, HDRI gaisma, ūdens atspulgi un pēcapstrāde (ielādējas fonā, spēle sākas uzreiz)
  setupGfx(hi, ultra) {
    const W = this.world;
    if (ultra) {
      try {
        this.refl = new PlanarReflection(0.5);
        this.post = new PostFX(this.renderer);
      } catch (e) { console.warn('Pēcapstrāde nav pieejama', e); this.refl = null; this.post = null; }
    }
    upgradeWater(W, this.refl);
    hdrEnvironment(this.renderer, this.sunDir, 1.0).then((env) => { this.scene.environment = env; }).catch((e) => console.warn(e));
    if (!hi) return;
    terrainMaterial().then((m) => W.usePhotoTerrain(m)).catch((e) => console.warn(e));
    Promise.all([new Promise((r, j) => { const im = new Image(); im.onload = () => r(im); im.onerror = j; im.src = 'assets/tex/asphalt_c.jpg'; }), loadTexture('assets/tex/asphalt_n.jpg', false)])
      .then(([im, n]) => W.usePhotoAsphalt(im, n)).catch((e) => console.warn(e));
    Promise.all([loadTexture('assets/tex/rock_c.jpg', true, 1), loadTexture('assets/tex/rock_n.jpg', false, 1)])
      .then(([c, n]) => W.usePhotoRock(c, n)).catch((e) => console.warn(e));
  }

  renderFrame() {
    if (this.refl && this.refl.enabled) this.refl.update(this.renderer, this.scene, this.camera, this.world.water, WATER_Y);
    if (this.post && this.post.enabled) this.post.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    if (this.post) this.post.setSize();
    if (this.refl) this.refl.setSize(w * pr, h * pr);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 72 : 60;
    this.camera.updateProjectionMatrix();
  }

  buildMushrooms() {
    this.mushMeshes = this.world.mushrooms.map((m) => {
      const g = buildMushroom(MUSHROOMS[m.type]);
      g.position.set(m.x, m.y, m.z);
      g.rotation.y = m.id;
      g.visible = false;
      this.scene.add(g);
      return g;
    });
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
    this.vendors = VENDORS.map((v) => {
      const cart = buildCart(v.cart, false, v.id === 'hats' ? 'hats' : v.id === 'seeds' ? 'seeds' : v.id === 'buyer' ? 'veg' : 'none');
      if (v.id === 'pets') {
        [['ezis', -0.7, 0.9], ['zakis', 0.1, 0.55], ['vavere', 0.8, 1.0]].forEach(([k, x, s]) => {
          const n = buildNPC(k); n.root.scale.multiplyScalar(s * 0.8); n.root.position.set(x, 1.5, 0.05); n.root.rotation.y = Math.PI / 2; cart.add(n.root);
        });
      } else if (v.id === 'decor') {
        [['rukis', -0.85, 0.75], ['pukupods', 0, 0.7], ['laterna', 0.85, 0.42]].forEach(([k, x, s]) => {
          const d = buildDecor(k); d.scale.setScalar(s); d.position.set(x, 1.5, 0.05); d.rotation.y = Math.PI / 2; cart.add(d);
        });
      }
      const face = Math.atan2(-v.x, -v.z);
      cart.position.set(v.x, VILLAGE_Y, v.z);
      cart.rotation.y = face;
      const vg = new THREE.Group();
      vg.add(cart);
      const av = buildAnimal({ animal: v.animal, fur: v.fur, shirt: v.shirt, hat: v.id === 'hats' ? 'cilindrs' : v.id === 'seeds' ? 'salmu' : v.id === 'decor' ? 'vainags' : null });
      av.root.position.set(v.x - Math.sin(face) * 1.4, VILLAGE_Y, v.z - Math.cos(face) * 1.4);
      av.root.rotation.y = face;
      for (let k = 0; k < 30; k++) av.animate(0.05, 'idle', 0);
      vg.add(av.root);
      const n = makeTextSprite(v.name, { fontSize: 36 });
      n.position.set(0, 2.2, 0);
      av.root.add(n);
      const flat = flattenStatic(vg); // nekustīgs — viss apvienots dažos zīmēšanas izsaukumos
      this.scene.add(flat);
      const t = makeTextSprite(v.title, { fontSize: 48, bg: 'rgba(255,255,255,0.85)', color: '#333' });
      t.position.set(v.x, VILLAGE_Y + 3.6, v.z);
      this.scene.add(t);
      this.world.addCollider(v.x, v.z, 1.5);
      return { def: v, cart: flat };
    });
    // saldējuma ratiņi, kas brauc pa apli
    this.ice = { cart: buildCart('#ff8fb0', true), av: buildAnimal({ animal: 'bebrs', fur: '#7a5230', shirt: '#ffffff', hat: null }) };
    this.scene.add(this.ice.cart);
    this.scene.add(this.ice.av.root);
    const it = makeTextSprite('🍦 Saldējums', { fontSize: 48, bg: 'rgba(255,143,176,0.9)' });
    it.position.y = 3.6;
    this.ice.cart.add(it);
    this.ice.pos = new THREE.Vector3();
  }

  buildGardens() {
    this.gardenCrops = [];
    this.gardenKeys = [];
    this.gardenSigns = [];
    const soilG = new THREE.BoxGeometry(2.1, 0.16, 2.1);
    const soilTex = canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#7a6656'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) { const l = 60 + Math.random() * 120; g.fillStyle = `rgba(${l},${l * 0.82 | 0},${l * 0.65 | 0},0.7)`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2); }
      for (let y = 0; y < h; y += 21) { g.fillStyle = 'rgba(25,15,8,0.35)'; g.fillRect(0, y, w, 5); g.fillStyle = 'rgba(255,230,200,0.08)'; g.fillRect(0, y + 8, w, 6); }
    });
    const soilM = new THREE.MeshStandardMaterial({ color: '#8a7058', map: soilTex, roughness: 1 });
    GARDEN_SLOTS.forEach((s, slot) => {
      this.gardenCrops[slot] = [];
      this.gardenKeys[slot] = [];
      for (let i = 0; i < 6; i++) {
        const p = plotPos(slot, i);
        const soil = new THREE.Mesh(soilG, soilM);
        soil.receiveShadow = true;
        soil.position.set(p.x, VILLAGE_Y + 0.05, p.z);
        this.scene.add(soil);
        this.gardenCrops[slot][i] = null;
        this.gardenKeys[slot][i] = '';
      }
      this.setGardenSign(slot, null);
    });
  }

  setGardenSign(slot, name) {
    const s = GARDEN_SLOTS[slot];
    this.gardenSignNames = this.gardenSignNames || [];
    if (this.gardenSigns[slot] && this.gardenSignNames[slot] === name) return;
    this.gardenSignNames[slot] = name;
    if (this.gardenSigns[slot]) this.scene.remove(this.gardenSigns[slot]);
    const sp = makeTextSprite(name ? `🌻 ${name} dārzs` : '🌾 Brīvs dārzs', { fontSize: 40, bg: name ? 'rgba(120,80,30,0.85)' : 'rgba(0,0,0,0.35)' });
    sp.position.set(s.x + 3.6, VILLAGE_Y + 2.6, s.z);
    this.scene.add(sp);
    this.gardenSigns[slot] = sp;
  }

  renderGarden(slot, view) {
    for (let i = 0; i < 6; i++) {
      const v = view && view[i];
      const key = v ? v.c + v.s + (v.w ? 'w' : '') : '';
      if (key === this.gardenKeys[slot][i]) continue;
      this.gardenKeys[slot][i] = key;
      if (this.gardenCrops[slot][i]) { this.scene.remove(this.gardenCrops[slot][i]); this.gardenCrops[slot][i] = null; }
      if (v) {
        const p = plotPos(slot, i);
        const g = buildCrop(v.c, v.s, CROPS[v.c].color);
        g.position.set(p.x, VILLAGE_Y + 0.13, p.z);
        if (v.w) {
          const wet = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12), new THREE.MeshBasicMaterial({ color: '#3a2412', transparent: true, opacity: 0.5 }));
          wet.rotation.x = -Math.PI / 2; wet.position.y = 0.01; g.add(wet);
        }
        this.scene.add(g);
        this.gardenCrops[slot][i] = g;
      }
    }
  }

  // Kartes pamatattēls visai pasaulei; minikarte rāda apkārtni ap spēlētāju, pieskaroties — visu karti
  buildMinimap() {
    const MS = 420, R = PLAY_RADIUS + 10;
    this.mapR = R; this.mapS = MS;
    const c = document.createElement('canvas');
    c.width = c.height = MS;
    const g = c.getContext('2d');
    const img = g.createImageData(MS, MS);
    const W = this.world;
    for (let py = 0; py < MS; py++) for (let px = 0; px < MS; px++) {
      const x = -R + (px + 0.5) / MS * 2 * R, z = -R + (py + 0.5) / MS * 2 * R;
      const h = W.getHeight(x, z);
      let col;
      if (h < WATER_Y) col = h < -1.5 ? [44, 110, 170] : [59, 143, 205];
      else if (h < 0.9) col = [222, 205, 150];
      else if (W.trackDist(x, z) < TRACK_WIDTH / 2) col = [90, 90, 96];
      else if (W.roadDist(x, z).d < 2.5) col = [160, 130, 90];
      else if (h > 18) col = [150, 148, 132];
      else if (W.forest(x, z) > 0.12) col = [52, 100, 42];
      else col = [111, 170, 72];
      // vieglas ēnas pēc slīpuma
      const sh = Math.max(-25, Math.min(25, (W.getHeight(x - 2, z - 2) - h) * 9));
      col = col.map((v) => Math.max(0, Math.min(255, v + sh)));
      if (Math.hypot(x, z) > PLAY_RADIUS) col = [95, 110, 80];
      const k = (py * MS + px) * 4;
      img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.mapBase = c;
    this.mapCtx = $('minimap').getContext('2d');
    $('minimap').addEventListener('click', () => this.openBigMap());
  }

  mapMarkers(g, toPx, big) {
    g.font = (big ? 16 : 11) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of this.world.places) { const [px, py] = toPx(p.x, p.z); g.fillText(PLACES[p.id].icon, px, py); }
    const mg = this.mg;
    if (this.mgIn && this.mgIn()) {
      const [cx, cy] = toPx(mg.cx, mg.cz), [ex] = toPx(mg.cx + mg.R, mg.cz);
      g.strokeStyle = '#ff3030'; g.lineWidth = 2; g.setLineDash([5, 4]);
      g.beginPath(); g.arc(cx, cy, Math.abs(ex - cx), 0, 6.3); g.stroke(); g.setLineDash([]);
    }
    g.fillStyle = '#ffe14a';
    this.world.stars.forEach((s) => {
      if (this.save.stars.includes(s.id) || !this.save.revealed) return;
      const [px, py] = toPx(s.x, s.z);
      g.beginPath(); g.arc(px, py, big ? 3.5 : 2, 0, 6.3); g.fill();
    });
    g.font = (big ? 16 : 11) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const [vx, vy] = toPx(0, 0); g.fillText('🏡', vx, vy);
    const [kx, ky] = toPx(this.world.kartSpot.x, this.world.kartSpot.z); g.fillText('🏎️', kx, ky);
    for (const [, r] of this.remotes) {
      if (this.mgHidden && this.mgHidden(r.id)) continue;
      const [px, py] = toPx(r.pos.x, r.pos.z);
      g.fillStyle = PLAYER_DOT[(r.prof.slot || 0) % 4];
      g.beginPath(); g.arc(px, py, big ? 5 : 3.5, 0, 6.3); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
    }
    const [mx, my] = toPx(this.me.pos.x, this.me.pos.z);
    const h = this.me.inKart ? this.me.kart.heading : this.me.heading;
    g.save();
    g.translate(mx, my);
    g.rotate(-h + Math.PI);
    const k = big ? 1.4 : 1;
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -6 * k); g.lineTo(4.5 * k, 5 * k); g.lineTo(-4.5 * k, 5 * k); g.closePath(); g.fill();
    g.strokeStyle = '#d00'; g.lineWidth = 1.5; g.stroke();
    g.restore();
  }

  drawMinimap() {
    const g = this.mapCtx, R = this.mapR, MS = this.mapS;
    const VIEW = 130; // metri no centra līdz minikartes malai
    const cx = this.me.pos.x, cz = this.me.pos.z;
    const scale = 140 / (2 * VIEW);
    const toPx = (x, z) => [70 + (x - cx) * scale, 70 + (z - cz) * scale];
    g.fillStyle = '#5f6e50'; g.fillRect(0, 0, 140, 140);
    const sp = MS / (2 * R); // pikseļi uz metru pamatattēlā
    g.drawImage(this.mapBase, (cx - VIEW + R) * sp, (cz - VIEW + R) * sp, 2 * VIEW * sp, 2 * VIEW * sp, 0, 0, 140, 140);
    this.mapMarkers(g, toPx, false);
  }

  openBigMap() {
    showPanel('🗺️ Karte', (b) => {
      const c = document.createElement('canvas');
      c.width = c.height = 420;
      c.style.cssText = 'width:min(78vw,62vh);height:min(78vw,62vh);display:block;margin:0 auto;border-radius:12px';
      b.append(c);
      const g = c.getContext('2d');
      g.drawImage(this.mapBase, 0, 0, 420, 420);
      const R = this.mapR;
      this.mapMarkers(g, (x, z) => [(x + R) / (2 * R) * 420, (z + R) / (2 * R) * 420], true);
      b.append(el('div', { style: 'text-align:center;font-size:13px;margin-top:6px;opacity:0.75' }, (this.save.revealed ? '⭐ zvaigznes' : '⭐ — uzkāp 🗼 tornī') + ' · 🏡 ciemats · 🏎️ trase · ⛺🗼🐸🏰🎣 īpašās vietas'));
    });
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
    press('btn-menu', () => this.openMenu());
    press('btn-room', () => this.openRoom());
    press('btn-exit-kart', () => this.exitKart());
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

  updateTeamBar() {
    const tm = this.team;
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
        sfx('win');
        toast(`📜 Uzdevums izpildīts: ${q.text}! +${q.reward}🪙`, 'good', 4000);
      }
    }
  }

  // ======================= Tīkls =======================
  myProf() {
    const s = this.save;
    return { name: s.name, animal: s.animal, fur: s.fur, shirt: s.shirt, hat: s.hat, kartColor: s.kartColor, garden: this.gardenView(), pet: s.pet || null, decor: s.decor || [] };
  }

  setupNet() {
    const net = this.net;
    net.onMessage = (m) => this.onMessage(m);
    net.onHostMessage = (from, m) => this.hostHandle(from, m);
    net.onPeerLeave = (id) => this.hostPeerLeave(id);
    net.onDisconnect = (why) => this.onDisconnected(why);
  }

  start() {
    if (this.net.isHost) {
      this.hs = { profiles: new Map(), positions: new Map(), picked: {}, pickedB: {}, team: makeTeam(Date.now(), this.save.weekly), race: { phase: 'none', id: 0 }, mg: { kind: null, phase: 'none' } };
      this.hostTimer = setInterval(() => this.hostTick(), 100);
    }
    this.net.toHost({ t: 'hello', prof: this.myProf(), weekly: this.save.weekly });
    this.clock = new THREE.Clock();
    const loop = () => {
      if (this.ended) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, this.clock.getDelta());
      this.update(dt);
      this.renderFrame();
    };
    loop();
    this.saveHandler = () => this.persist();
    window.addEventListener('pagehide', this.saveHandler);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.persist(); });
    toast(`Sveiks, ${this.save.name}! Ej uz mežu lasīt sēnes 🍄 vai uz dārzu stādīt 🌱`, 'good', 5000);
  }

  persist() {
    if (!this.me) return;
    if (!this.me.inKart) this.save.pos = { x: +this.me.pos.x.toFixed(1), z: +this.me.pos.z.toFixed(1) };
    writeSave(this.save);
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
      case 'hello': {
        const used = new Set([...hs.profiles.values()].map((p) => p.slot));
        let slot = 0; while (used.has(slot)) slot++;
        const prof = { ...m.prof, slot };
        hs.profiles.set(from, prof);
        this.hostMergeWeekly(m.weekly);
        net.sendTo(from, { t: 'welcome', id: from, now, profiles: [...hs.profiles.entries()], picked: hs.picked, pickedB: hs.pickedB, team: hs.team, race: hs.race, mg: hs.mg });
        net.broadcast({ t: 'join', id: from, prof });
        net.broadcast({ t: 'team', team: hs.team });
        break;
      }
      case 'pos': hs.positions.set(from, m.p); break;
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
    if (hs.race.racers && hs.race.racers.includes(id)) {
      hs.race.racers = hs.race.racers.filter((x) => x !== id);
      if (hs.race.phase === 'lobby' && hs.race.racers.length === 0) hs.race = { phase: 'none', id: hs.race.id };
      this.net.broadcast({ t: 'race', race: hs.race });
    }
    this.net.broadcast({ t: 'leave', id });
  }

  botTime(botIdx, gridSlot) {
    const back = (6 + Math.floor(gridSlot / 2) * 5) * this.world.trackLen / TRACK_N;
    return (RACE_LAPS * this.world.trackLen + back) / BOTS[botIdx].speed * 1000;
  }

  hostTick() {
    const hs = this.hs, net = this.net, now = Date.now();
    this.hostMgTick(now);
    if (now - (this.weekCheck || 0) > 10000) {
      this.weekCheck = now;
      const nt = makeTeam(now, null);
      if (nt.w !== hs.team.w) { hs.team = nt; net.broadcast({ t: 'team', team: hs.team }); }
    }
    const list = [];
    for (const [id, p] of hs.positions) list.push([id, ...p]);
    net.broadcast({ t: 's', l: list });
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
        break;
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
      case 's':
        for (const e of m.l) {
          if (e[0] === this.myId) continue;
          const r = this.remotes.get(e[0]);
          if (!r) continue;
          r.target.set(e[1], e[2], e[3]);
          r.tRy = e[4]; r.anim = ANIM[e[5]] || 'idle'; r.inKart = !!e[6]; r.progress = e[7] || 0;
          if (!r.seen) { r.pos.copy(r.target); r.seen = true; }
        }
        break;
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
      case 'water': {
        if (m.owner === this.myId) {
          const g = this.save.garden[m.plot];
          if (g && !g.watered) {
            g.watered = true;
            const who = this.remotes.get(m.by);
            if (m.by !== this.myId) toast(`💧 ${who ? who.prof.name : 'Draugs'} aplaistīja tavu dārzu! Augi augs ātrāk.`, 'good');
            this.sendProfile();
          }
        }
        if (m.by === this.myId && m.owner !== this.myId) this.stat('watered');
        const owner = m.owner === this.myId ? this.mySlot : this.remotes.get(m.owner)?.prof.slot;
        if (owner != null) { const p = plotPos(owner, m.plot); this.spawnFloat('💧', new THREE.Vector3(p.x, VILLAGE_Y, p.z)); }
        break;
      }
      case 'race': this.onRace(m.race); break;
      case 'toast': toast(m.text); break;
      default: this.onActivityMessage(m);
    }
  }

  applyProfile(id, prof) {
    this.profiles.set(id, prof);
    if (id === this.myId) {
      this.mySlot = prof.slot;
      this.setGardenSign(prof.slot, prof.name);
      this.renderGarden(prof.slot, prof.garden);
      this.renderDecor(prof.slot, prof.decor);
      return;
    }
    let r = this.remotes.get(id);
    const appearance = `${prof.animal}|${prof.fur}|${prof.shirt}`;
    if (!r) {
      r = { id, prof, pos: new THREE.Vector3(SPAWN.x, VILLAGE_Y, SPAWN.z), target: new THREE.Vector3(SPAWN.x, VILLAGE_Y, SPAWN.z), ry: 0, tRy: 0, anim: 'idle', inKart: false, kart: null, progress: 0, seen: false };
      this.remotes.set(id, r);
      this.updateRoomButton();
    } else if (r.prof.slot !== prof.slot) {
      this.renderGarden(r.prof.slot, null);
      this.renderDecor(r.prof.slot, null);
      this.setGardenSign(r.prof.slot, null);
    }
    if (r.appearance !== appearance) {
      if (r.avatar) { r.avatar.root.parent && r.avatar.root.parent.remove(r.avatar.root); }
      r.avatar = buildAnimal(prof);
      const ns = makeTextSprite(prof.name, { bg: 'rgba(30,60,140,0.7)' });
      ns.position.y = 2.25;
      r.avatar.root.add(ns);
      r.nameSprite = ns;
      r.rod = null;
      if (r.kart) r.kart.seat.add(r.avatar.root); else this.scene.add(r.avatar.root);
      r.appearance = appearance;
    } else if (r.prof.hat !== prof.hat) r.avatar.setHat(prof.hat);
    if (r.kart && r.prof.kartColor !== prof.kartColor) r.kart.setColor(this.kartColorHex(prof.kartColor));
    r.prof = prof;
    this.setGardenSign(prof.slot, prof.name);
    this.renderGarden(prof.slot, prof.garden);
    this.renderDecor(prof.slot, prof.decor);
  }

  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    if (r.avatar.root.parent) r.avatar.root.parent.remove(r.avatar.root);
    if (r.kart) this.scene.remove(r.kart.root);
    if (r.pet) this.scene.remove(r.pet.model.root);
    this.renderGarden(r.prof.slot, null);
    this.renderDecor(r.prof.slot, null);
    this.setGardenSign(r.prof.slot, null);
    this.remotes.delete(id);
    this.profiles.delete(id);
    this.updateRoomButton();
  }

  sendProfile() {
    const prof = this.myProf();
    this.lastGardenKey = JSON.stringify(prof.garden);
    this.applyProfile(this.myId, { ...prof, slot: this.mySlot });
    this.net.toHost({ t: 'prof', prof });
  }

  kartColorHex(id) { return (KART_COLORS.find((k) => k.id === id) || KART_COLORS[0]).color; }

  // ======================= Galvenais cikls =======================
  update(dt) {
    const t = this.now();
    const ctl = this.controls;
    let mv = ctl.getMove();
    const camIn = ctl.consumeCam();
    let jump = ctl.consumeJump();
    const action = ctl.consumeAction();
    if (panelOpen() || this.mgFrozen()) { mv = { x: 0, y: 0, run: false }; jump = false; }
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
    for (let i = 0; i < steps; i++) {
      if (this.me.inKart) this.updateKart(dt / steps, mv);
      else this.updateWalk(dt / steps, mv, jump && i === 0);
    }

    this.updateCamera(dt);
    this.updateSun(dt);
    this.updateRemotes(dt);
    this.updateWorldObjects(dt, t);
    this.updateActivities(dt, t);
    this.updateRace(dt, t);
    this.updateEffects(dt);
    this.world.updateClouds(dt, this.camera.position);
    this.timers.vis = (this.timers.vis || 0) - dt;
    if (this.timers.vis <= 0) { this.timers.vis = 0.3; this.world.updateVisibility(this.camera.position.x, this.camera.position.z); }
    if (this.world.grassCenter) this.world.grassCenter.set(this.me.pos.x, this.me.pos.z);

    this.timers.action -= dt;
    if (this.timers.action <= 0) { this.timers.action = 0.15; this.refreshAction(); }
    if (action) this.doAction();

    this.timers.garden -= dt;
    if (this.timers.garden <= 0) {
      this.timers.garden = 1;
      const key = JSON.stringify(this.gardenView());
      if (key !== this.lastGardenKey && this.myId >= 0) this.sendProfile();
    }

    this.timers.send -= dt;
    if (this.timers.send <= 0 && this.myId >= 0) {
      this.timers.send = 0.1;
      const p = this.me.pos;
      const ry = this.me.inKart ? this.me.kart.heading : this.me.heading;
      const r2 = (v) => Math.round(v * 100) / 100;
      this.net.toHost({ t: 'pos', p: [r2(p.x), r2(p.y), r2(p.z), r2(ry), ANIM.indexOf(this.me.state), this.me.inKart ? 1 : 0, r2(this.me.progress || 0)] });
    }

    this.timers.map -= dt;
    if (this.timers.map <= 0) { this.timers.map = 0.25; this.drawMinimap(); }
    this.timers.save -= dt;
    this.save.playTime += dt;
    if (this.timers.save <= 0) { this.timers.save = 5; this.persist(); }
  }

  updateWalk(dt, mv, jump) {
    const me = this.me, W = this.world;
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
    this.collideIce(me.pos, 0.4);
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
    const kart = buildKart(this.kartColorHex(this.save.kartColor));
    const s = spot || this.world.kartSpot;
    me.pos.set(s.x, this.world.getHeight(s.x, s.z), s.z);
    me.kart = { obj: kart, speed: 0, heading: s.heading, hint: -1, boost: 0, padCd: 0 };
    me.inKart = true;
    this.scene.add(kart.root);
    this.scene.remove(this.avatar.root);
    kart.seat.add(this.avatar.root);
    this.avatar.root.position.set(0, 0, 0);
    this.avatar.root.rotation.set(0, 0, 0);
    this.avatar.shadow.visible = false;
    me.state = 'sit';
    this.cam.yaw = s.heading + Math.PI;
    $('btn-exit-kart').classList.remove('hidden');
    $('btn-jump').classList.add('hidden');
    toast('🏎️ Velc kursorsviru uz augšu — gāze, uz leju — bremze. Dzeltenās bultas dod turbo!', '', 4500);
  }

  exitKart() {
    const me = this.me;
    if (!me.inKart) return;
    if (this.myRace) { this.net.toHost({ t: 'raceLeave' }); this.myRace = null; }
    const h = me.kart.heading;
    this.scene.remove(me.kart.obj.root);
    me.kart.obj.seat.remove(this.avatar.root);
    this.scene.add(this.avatar.root);
    this.avatar.shadow.visible = true;
    me.pos.x += Math.cos(h) * 2; me.pos.z -= Math.sin(h) * 2;
    me.pos.y = this.world.getHeight(me.pos.x, me.pos.z) + 0.5;
    me.inKart = false; me.kart = null; me.state = 'idle'; me.progress = 0;
    $('btn-exit-kart').classList.add('hidden');
    $('btn-race').classList.add('hidden');
    $('btn-jump').classList.remove('hidden');
    $('race-hud').classList.add('hidden');
  }

  updateKart(dt, mv) {
    const me = this.me, k = me.kart, W = this.world;
    const info = W.nearestTrackIdx(me.pos.x, me.pos.z, k.hint);
    k.hint = info.idx;
    const onTrack = info.dist < TRACK_WIDTH / 2 + 1.2;
    const ground = W.getHeight(me.pos.x, me.pos.z);
    const inWater = ground < WATER_Y - 0.4;
    const frozen = this.myRace && this.race.phase === 'run' && this.now() < this.race.startAt;
    k.boost = Math.max(0, k.boost - dt);
    k.padCd = Math.max(0, k.padCd - dt);
    let max = onTrack ? 22 : 12;
    if (inWater) max = 5;
    if (k.boost > 0) max = 31;
    if (me.iceCream > 0) max *= 1.1;
    if (frozen) {
      k.speed = 0;
    } else {
      const thr = mv.y;
      if (thr > 0.1) k.speed += (k.boost > 0 ? 30 : 15) * thr * dt;
      else if (thr < -0.1) k.speed -= (k.speed > 0.5 ? 26 : 9) * -thr * dt;
      else k.speed *= 1 - 1.4 * dt;
      if (k.boost > 0 && k.speed < max) k.speed += 25 * dt;
      if (k.speed > max) k.speed = lerp(k.speed, max, 1 - Math.exp(-dt * 3));
      k.speed = clamp(k.speed, -7, 34);
      const turn = 2.4 * clamp(k.speed / 5, -1, 1) * (1 - Math.min(0.35, Math.abs(k.speed) / 90));
      k.heading -= mv.x * turn * dt;
    }
    me.pos.x += Math.sin(k.heading) * k.speed * dt;
    me.pos.z += Math.cos(k.heading) * k.speed * dt;
    if (W.collide(me.pos, 1.0)) k.speed *= 0.92;
    this.collideIce(me.pos, 1.0);
    for (const p of W.boostPads) {
      if (k.padCd <= 0 && Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 2.4) {
        k.boost = 1.6; k.padCd = 1; sfx('boost');
      }
    }
    const g2 = W.getHeight(me.pos.x, me.pos.z);
    me.pos.y = inWater ? WATER_Y - 0.3 : g2;
    const kr = k.obj.root;
    kr.position.copy(me.pos);
    kr.rotation.order = 'YXZ';
    kr.rotation.y = k.heading;
    const hf = W.getHeight(me.pos.x + Math.sin(k.heading), me.pos.z + Math.cos(k.heading));
    const hb = W.getHeight(me.pos.x - Math.sin(k.heading), me.pos.z - Math.cos(k.heading));
    kr.rotation.x = lerp(kr.rotation.x, -Math.atan2(hf - hb, 2), 0.3);
    kr.rotation.z = lerp(kr.rotation.z, mv.x * Math.min(1, k.speed / 20) * 0.08, 0.2);
    for (const w of k.obj.wheels) w.rotation.x += k.speed * dt / 0.32;
    me.state = 'sit';
    this.avatar.animate(dt, 'sit', 0);
    this.avatar.head.rotation.y = -mv.x * 0.3;
  }

  updateCamera(dt) {
    const me = this.me;
    if (me.inKart) {
      if (this.controls.camId === null) {
        const target = me.kart.heading + Math.PI;
        this.cam.yaw = angleLerp(this.cam.yaw, target, 1 - Math.exp(-dt * 3.5));
        this.cam.pitch = lerp(this.cam.pitch, 0.3, 1 - Math.exp(-dt * 2));
      }
    }
    let dist = me.inKart ? Math.max(this.cam.dist, 8) : this.cam.dist;
    const tx = me.pos.x, ty = me.pos.y + 1.5, tz = me.pos.z;
    const cp = Math.cos(this.cam.pitch);
    // ja starp kameru un tēlu ir kalns, pievelkam kameru tuvāk
    const ox = Math.sin(this.cam.yaw) * cp, oy = Math.sin(this.cam.pitch), oz = Math.cos(this.cam.yaw) * cp;
    for (let s = 0.15; s <= 1.001; s += 0.085) {
      const d = s * dist;
      if (this.world.getHeight(tx + ox * d, tz + oz * d) + 0.5 > ty + oy * d) { dist = Math.max(1.8, d * 0.85); break; }
    }
    let cx = tx + Math.sin(this.cam.yaw) * cp * dist;
    let cz = tz + Math.cos(this.cam.yaw) * cp * dist;
    let cy = ty + Math.sin(this.cam.pitch) * dist;
    const gh = Math.max(this.world.getHeight(cx, cz), WATER_Y) + 0.6;
    if (cy < gh) cy = gh;
    const k = 1 - Math.exp(-dt * 12);
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
    // ja telefons ir lēns, samazinām izšķirtspēju
    if (this.fpsCheck == null) this.fpsCheck = { t: 0, n: 0, done: false };
    const f = this.fpsCheck;
    if (!f.done) {
      f.t += dt; f.n++;
      if (f.t > 6) {
        f.done = true;
        const fps = f.n / f.t;
        if (fps < 32 && this.post && this.post.enabled) {
          // vispirms izslēdzam dārgākos efektus un mērām vēlreiz
          this.post.enabled = false;
          if (this.refl) this.refl.enabled = false;
          toast('Spēle raustījās — atspulgi un efekti izslēgti. ☰ izvēlnē var mainīt grafiku.', '', 5000);
          this.fpsCheck = { t: 0, n: 0, done: false };
          return;
        }
        if (fps < 28 && this.renderer.getPixelRatio() > 1) {
          this.renderer.setPixelRatio(1);
          this.onResize();
        }
        if (fps < 22 && this.renderer.shadowMap.enabled) {
          // ļoti lēns telefons: izslēdzam ēnas uzreiz
          this.renderer.shadowMap.enabled = false;
          this.sun.castShadow = false;
          this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
          toast('Spēle raustījās — ēnas izslēgtas. Izvēlnē ☰ var mainīt grafiku.', '', 5000);
        }
      }
    }
  }

  updateRemotes(dt) {
    const k = 1 - Math.exp(-dt * 12);
    for (const r of this.remotes.values()) {
      const prev = r.pos.clone();
      r.pos.lerp(r.target, k);
      if (r.pos.distanceTo(r.target) > 25) r.pos.copy(r.target);
      r.ry = angleLerp(r.ry, r.tRy, k);
      if (r.inKart && !r.kart) {
        r.kart = buildKart(this.kartColorHex(r.prof.kartColor));
        this.scene.add(r.kart.root);
        if (r.avatar.root.parent) r.avatar.root.parent.remove(r.avatar.root);
        r.kart.seat.add(r.avatar.root);
        r.avatar.root.position.set(0, 0, 0); r.avatar.root.rotation.set(0, 0, 0);
        r.avatar.shadow.visible = false;
      } else if (!r.inKart && r.kart) {
        this.scene.remove(r.kart.root);
        r.kart.seat.remove(r.avatar.root);
        r.kart = null;
        this.scene.add(r.avatar.root);
        r.avatar.shadow.visible = true;
      }
      if (r.kart) {
        r.kart.root.position.copy(r.pos);
        r.kart.root.rotation.y = r.ry;
        const sp = prev.distanceTo(r.pos) / Math.max(dt, 0.001);
        for (const w of r.kart.wheels) w.rotation.x += sp * dt / 0.32;
        r.avatar.animate(dt, 'sit', 0);
      } else {
        r.avatar.root.position.copy(r.pos);
        r.avatar.root.rotation.y = r.ry;
        const g = this.world.getHeight(r.pos.x, r.pos.z);
        r.avatar.shadow.position.y = Math.max(g, WATER_Y) - r.pos.y + 0.03;
        r.avatar.animate(dt, r.anim, 5);
        if (r.anim === 'fish' && !r.rod) { r.rod = buildRod(); r.rod.position.set(0, 1.0, 0.32); r.avatar.root.add(r.rod); }
        if (r.rod) r.rod.visible = r.anim === 'fish';
        r.avatar.root.visible = !this.mgHidden(r.id) || r.pos.distanceTo(this.me.pos) < 30;
      }
    }
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
      this.world.mushrooms.forEach((m, i) => {
        const vis = !(this.picked[m.id] > t) && Math.abs(m.x - cx) < 50 && Math.abs(m.z - cz) < 50;
        this.mushMeshes[i].visible = vis;
      });
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
    // saldējuma ratiņi
    const a = ts * 0.035;
    const ip = this.ice.pos.set(Math.cos(a) * 9, VILLAGE_Y, Math.sin(a) * 9);
    this.ice.cart.position.copy(ip);
    this.ice.cart.rotation.y = -a;
    this.ice.av.root.position.set(ip.x - Math.cos(a) * 1.5, VILLAGE_Y, ip.z - Math.sin(a) * 1.5);
    this.ice.av.root.rotation.y = -a + Math.PI;
    this.ice.av.animate(dt, 'walk', 2);
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
    const sp = makeTextSprite(text, { bg: 'rgba(0,0,0,0)', fontSize: 64 });
    sp.position.set(pos.x, pos.y + 2, pos.z);
    this.scene.add(sp);
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
    if (a) { a.fn(); this.timers.action = 0; }
  }

  currentSeed() {
    const inv = this.save.inv;
    if (this.selectedSeed && inv[this.selectedSeed + '_seed'] > 0) return this.selectedSeed;
    return Object.keys(CROPS).find((c) => inv[c + '_seed'] > 0) || null;
  }

  cropStage(g) {
    const dur = CROPS[g.crop].grow * 1000 * (g.watered ? 0.6 : 1);
    const p = (Date.now() - g.plantedAt) / dur;
    return { stage: p < 0.3 ? 0 : p < 1 ? 1 : 2, p: Math.min(1, p) };
  }

  gardenView() {
    return this.save.garden.map((g) => g ? { c: g.crop, s: this.cropStage(g).stage, w: !!g.watered } : null);
  }

  findAction() {
    if (this.me.inKart) return null;
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
    if (Math.abs(p.x + 24) < 8 && Math.abs(p.z) < 28) {
      for (let slot = 0; slot < 4; slot++) {
        let owner = null, ownerId = null;
        for (const [id, pr] of this.profiles) if (pr.slot === slot) { owner = pr; ownerId = id; }
        for (let i = 0; i < 6; i++) {
          const pp = plotPos(slot, i);
          const d = d2(pp.x, pp.z);
          if (d > 1.5) continue;
          if (ownerId === this.myId) {
            const g = this.save.garden[i];
            if (!g) {
              const seed = this.currentSeed();
              if (seed) consider(d, 1.5, `🌱 Stādīt: ${CROPS[seed].name}`, () => this.plant(i, seed));
              else consider(d, 1.5, '🌱 Vajag sēklas (Ūdrs Ojārs)', () => toast('Sēklas var nopirkt pie Ūdra Ojāra tirgū 🌱'));
            } else {
              const st = this.cropStage(g);
              if (st.stage >= 2) consider(d, 1.5, `🧺 Novākt: ${CROPS[g.crop].name}`, () => this.harvest(i));
              else if (!g.watered) consider(d, 1.5, '💧 Aplaistīt', () => this.waterOwn(i));
              else consider(d, 1.5, `⏳ ${CROPS[g.crop].name} aug… ${Math.round(st.p * 100)}%`, () => toast('Pagaidi, augs vēl aug 🌱'));
            }
          } else if (owner) {
            const v = owner.garden && owner.garden[i];
            if (v && v.s < 2 && !v.w) consider(d, 1.5, `💧 Aplaistīt ${owner.name} dārzu`, () => { this.net.toHost({ t: 'water', owner: ownerId, plot: i }); sfx('plant'); });
          } else consider(d, 1.5, '🌾 Šis dārzs ir brīvs', () => toast('Šo dārzu iegūs nākamais draugs, kas pievienosies'));
        }
      }
    }
    for (const v of this.vendors) consider(d2(v.def.x, v.def.z), 3.4, `💬 ${v.def.name}`, () => this.openShop(v.def.id));
    consider(d2(this.ice.pos.x, this.ice.pos.z), 3.6, `🍦 Saldējums (${ICE_CREAM_PRICE}🪙)`, () => this.buyIceCream());
    const ks = this.world.kartSpot;
    consider(d2(ks.x, ks.z), 3.5, '🏎️ Sēsties kartā', () => this.enterKart());
    for (const n of this.npcs) {
      if (!n.model.root.visible) continue;
      const d = d2(n.x, n.z);
      if (d > 2.8) continue;
      if ((this.npcCooldown[n.home.id] || 0) > t) continue;
      consider(d, 2.8, `🤗 Paglaudīt: ${NPC_TYPES[n.home.type].name}`, () => this.pet(n));
    }
    return best;
  }

  pickMushroom(m) {
    this.picked[m.id] = this.now() + 5000; // paslēpjam uzreiz, saimnieks apstiprinās
    this.mushMeshes[m.id].visible = false;
    this.me.petT = 0.5;
    this.net.toHost({ t: 'pick', id: m.id });
  }

  plant(i, crop) {
    this.save.inv[crop + '_seed']--;
    this.save.garden[i] = { crop, plantedAt: Date.now(), watered: false };
    this.stat('planted');
    sfx('plant');
    this.me.petT = 0.6;
    toast(`🌱 Iestādīji: ${CROPS[crop].name}. Aplaisti, lai aug ātrāk!`);
    this.sendProfile();
  }

  waterOwn(i) {
    const g = this.save.garden[i];
    if (!g) return;
    g.watered = true;
    sfx('plant');
    this.me.petT = 0.6;
    const p = plotPos(this.mySlot, i);
    this.spawnFloat('💧', new THREE.Vector3(p.x, VILLAGE_Y, p.z));
    this.sendProfile();
  }

  harvest(i) {
    const g = this.save.garden[i];
    const c = CROPS[g.crop];
    this.addItem(g.crop, c.yield);
    this.save.garden[i] = null;
    this.stat('harvested');
    sfx('pick');
    this.me.petT = 0.6;
    toast(`🧺 Novāci: ${c.icon} ${c.name} ×${c.yield}! Pārdod Āpsim Arnoldam.`, 'good');
    this.spawnFloat(c.icon, this.me.pos);
    this.sendProfile();
  }

  pet(n) {
    this.npcCooldown[n.home.id] = this.now() + 20000;
    this.me.petT = 1.2;
    this.me.heading = Math.atan2(n.x - this.me.pos.x, n.z - this.me.pos.z);
    this.spawnFloat('❤️', new THREE.Vector3(n.x, this.world.getHeight(n.x, n.z), n.z));
    sfx('pet');
    this.stat('petted');
    const msgs = { stirna: 'Stirna priecīgi pamāja ar ausīm', zakis: 'Zaķis sarāva degunu', ezis: 'Ezītis nošņaukājās — uzmanīgi, adatas!', mezacuka: 'Mežacūka apmierināti ņurdēja', vavere: 'Vāverīte paslēpa riekstu', starkis: 'Stārķis noklabināja knābi' };
    toast(`❤️ ${msgs[n.home.type]}`);
  }

  buyIceCream() {
    if (this.save.coins < ICE_CREAM_PRICE) { toast('Nepietiek monētu 🪙', 'bad'); return; }
    this.addCoins(-ICE_CREAM_PRICE, true);
    this.me.iceCream = 40;
    sfx('coin');
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
    const r = this.race, mr = this.myRace, W = this.world;
    const hud = $('race-hud'), cd = $('countdown'), rb = $('btn-race');
    // sacīkšu poga
    if (this.me.inKart && !mr) {
      const s0 = W.trackPts[0];
      const near = Math.hypot(this.me.pos.x - s0.x, this.me.pos.z - s0.z) < 70;
      if (near && (r.phase === 'none' || r.phase === 'done')) { rb.textContent = '🏁 Sākt sacīkstes'; rb.classList.remove('hidden'); }
      else if (near && r.phase === 'lobby') { rb.textContent = `🏁 Pievienoties (${Math.max(0, Math.ceil((r.startAt - 4000 - t) / 1000))})`; rb.classList.remove('hidden'); }
      else rb.classList.add('hidden');
    } else rb.classList.add('hidden');

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
      if (mr.lastCount !== n) { mr.lastCount = n; sfx('beep'); }
    } else if (t < r.startAt + 1000) {
      cd.classList.remove('hidden');
      cd.textContent = 'AIZIET!';
      if (mr.lastCount !== 0) { mr.lastCount = 0; sfx('go'); }
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
    const back = (6 + Math.floor(gridSlot / 2) * 5) * this.world.trackLen / TRACK_N;
    const el2 = Math.max(0, (t - this.race.startAt) / 1000);
    const total = RACE_LAPS * this.world.trackLen + back;
    return Math.min(total, el2 * BOTS[b].speed) - back;
  }

  botProgress(b, gridSlot, t) {
    const d = this.botDistance(b, gridSlot, t);
    const fin = this.botTime(b, gridSlot);
    if (t - this.race.startAt >= fin) return RACE_LAPS + 1 - fin / 1e7;
    return d / this.world.trackLen;
  }

  updateBots(dt, t) {
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
        const ns = makeTextSprite(BOTS[b].name, { bg: 'rgba(90,90,90,0.7)' });
        ns.position.y = 2.25; av.root.add(ns);
        this.scene.add(kart.root);
        bot = this.bots[b] = { kart, av };
      }
      bot.kart.root.visible = true;
      const slot = r.racers.length + b;
      const W = this.world;
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
    if (id === 'seeds') this.shopSeeds();
    else if (id === 'buyer') this.shopBuyer();
    else if (id === 'pets') this.shopPets();
    else if (id === 'decor') this.shopDecor();
    else this.shopHats();
  }

  coinLine(b) { b.append(el('div', { className: 'sect' }, `Tev ir 🪙 ${this.save.coins}`)); }

  shopSeeds() {
    const build = (b) => {
      b.append(el('p', {}, 'Sveiks! Man ir labākās sēklas visā Mežvidu ciemā — un makšķeres. Ūdri zina, kur ķeras! 🌱🎣'));
      this.coinLine(b);
      this.rodRow(b, build);
      for (const [k, c] of Object.entries(CROPS)) {
        const have = this.save.inv[k + '_seed'] || 0;
        const buy = (n) => () => {
          if (this.save.coins < c.seedPrice * n) { toast('Nepietiek monētu 🪙', 'bad'); return; }
          this.addCoins(-c.seedPrice * n, true); this.addItem(k + '_seed', n); sfx('coin');
          refreshPanel(build);
        };
        b.append(itemRow(c.icon, `${c.name} — sēkla`, `${c.seedPrice}🪙 · aug ${c.grow / 60} min · raža ×${c.yield} · tev: ${have}`, [
          { label: 'Pirkt', onclick: buy(1), disabled: this.save.coins < c.seedPrice },
          { label: '×5', onclick: buy(5), disabled: this.save.coins < c.seedPrice * 5 },
        ]));
      }
    };
    showPanel('🌱 Ūdrs Ojārs — sēklas un makšķeres', build);
  }

  sellables() {
    const out = [];
    for (const [k, m] of Object.entries(MUSHROOMS)) if (!m.poison) out.push({ k, name: m.name, icon: MUSH_ICON[k], price: m.sell });
    for (const [k, c] of Object.entries(CROPS)) out.push({ k, name: c.name, icon: c.icon, price: c.sell });
    for (const [k, f] of Object.entries(FISH)) if (!f.junk) out.push({ k, name: f.name, icon: f.icon, price: f.sell });
    for (const [k, b] of Object.entries(BERRIES)) out.push({ k, name: b.name, icon: b.icon, price: b.sell });
    out.push({ k: 'cepta', name: COOKED.name, icon: COOKED.icon, price: COOKED.sell });
    return out;
  }

  shopBuyer() {
    const build = (b) => {
      b.append(el('p', {}, 'Es uzpērku sēnes, dārzeņus, zivis un ogas. Godīga cena! 🧺'));
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
        b.append(itemRow(it.icon, `${it.name} ×${n}`, `${it.price}🪙 gabalā`, [
          { label: 'Pārdot 1', onclick: sell(1) },
          { label: 'Visu', onclick: sell(n), alt: true },
        ]));
      }
      if (!any) b.append(el('p', {}, 'Tev pagaidām nav ko pārdot. Salasi sēnes mežā vai izaudzē dārzeņus!'));
      else b.append(el('button', { className: 'pbtn', onclick: () => {
        let sum = 0, cnt = 0;
        for (const it of this.sellables()) { const n = this.save.inv[it.k] || 0; sum += n * it.price; cnt += n; this.save.inv[it.k] = 0; }
        this.addCoins(sum); this.stat('sold', cnt); refreshPanel(build);
      } }, `💰 Pārdot visu (${totalAll}🪙)`));
    };
    showPanel('🧺 Āpsis Arnolds — uzpircējs', build);
  }

  shopHats() {
    const build = (b) => {
      b.append(el('p', {}, 'Ū-hū! Cepures un kartinga krāsas. Esi stilīgs! 🎩'));
      this.coinLine(b);
      b.append(el('div', { className: 'sect' }, 'Cepures'));
      for (const [k, h] of Object.entries(HATS)) {
        if (h.hidden && !this.save.ownedHats.includes(k)) continue;
        const owned = this.save.ownedHats.includes(k);
        const worn = this.save.hat === k;
        const btns = owned
          ? [{ label: worn ? 'Noņemt' : 'Uzlikt', alt: worn, onclick: () => { this.setHat(worn ? null : k); refreshPanel(build); } }]
          : [{ label: `Pirkt ${h.price}🪙`, disabled: this.save.coins < h.price, onclick: () => {
              if (this.save.coins < h.price) return;
              this.addCoins(-h.price); this.save.ownedHats.push(k); this.setHat(k); refreshPanel(build);
            } }];
        b.append(itemRow('🎩', h.name, owned ? (worn ? 'Uzlikta' : 'Tev pieder') : '', btns));
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
        const sw = el('span', { html: `<span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:${kc.color}"></span>` });
        b.append(itemRow(sw, kc.name, '', btns));
      }
    };
    showPanel('🎩 Pūce Paula — cepures', build);
  }

  setHat(k) {
    this.save.hat = k;
    this.avatar.setHat(k);
    this.sendProfile();
  }

  setKartColor(id) {
    this.save.kartColor = id;
    if (this.me.kart) this.me.kart.obj.setColor(this.kartColorHex(id));
    this.sendProfile();
  }

  openBag() {
    const build = (b) => {
      this.coinLine(b);
      b.append(el('div', { className: 'sect' }, 'Sēklas (pieskaries, lai izvēlētos, ko stādīt)'));
      const cur = this.currentSeed();
      let anySeed = false;
      for (const [k, c] of Object.entries(CROPS)) {
        const n = this.save.inv[k + '_seed'] || 0;
        if (!n) continue;
        anySeed = true;
        const row = itemRow(SEED_ICON, `${c.name} sēkla ×${n}`, cur === k ? '✔ Izvēlēta stādīšanai' : '', [
          { label: cur === k ? '✔' : 'Izvēlēties', disabled: cur === k, onclick: () => { this.selectedSeed = k; refreshPanel(build); } },
        ], cur === k ? 'sel' : '');
        b.append(row);
      }
      if (!anySeed) b.append(el('p', {}, 'Nav sēklu. Nopērc pie Ūdra Ojāra 🌱'));
      b.append(el('div', { className: 'sect' }, 'Raža un sēnes'));
      let any = false;
      for (const it of this.sellables()) {
        const n = this.save.inv[it.k] || 0;
        if (!n) continue;
        any = true;
        b.append(itemRow(it.icon, `${it.name} ×${n}`, `Vērtība: ${it.price}🪙 gab.`));
      }
      if (!any) b.append(el('p', {}, 'Soma ir tukša.'));
      b.append(el('div', { className: 'sect' }, 'Mani sasniegumi'));
      const st = this.save.stats;
      b.append(itemRow('⭐', `Zelta zvaigznes: ${this.save.stars.length}/15`, this.save.revealed ? 'Visas redzamas kartē' : 'Uzkāp 🗼 skatu tornī — no turienes redz visas!'));
      b.append(itemRow('🗺️', `Īpašās vietas: ${this.save.places.length}/${this.world.places.length}`, this.save.places.map((id) => PLACES[id].icon).join(' ')));
      b.append(itemRow('📜', `Kartes gabali: ${this.save.pieces.length}/${MAP_PIECES.length}`, this.save.treasure ? 'Dārgums atrasts! 🏰' : 'Ar visiem gabaliem atver lādi 🏰 Pilsdrupās'));
      b.append(itemRow('🎣', this.save.rod ? `Noķertas zivis: ${st.fish || 0}` : 'Makšķere — pie Ūdra Ojāra', this.save.rod ? `Zelta zivtiņas: ${st.goldfish || 0}` : ''));
      b.append(itemRow('🫐', `Salasītas ogas: ${st.berries || 0}`));
      b.append(itemRow('🐾', this.save.pet ? `Mājdzīvnieks: ${PETS[this.save.pet].name}` : 'Mājdzīvnieka vēl nav', 'Suns Sprīdis ciematā'));
      b.append(itemRow('🏆', `Nedēļas mērķi sasniegti: ${this.save.trophies || 0}`));
      b.append(itemRow('🍄', `Salasītas sēnes: ${st.mushrooms || 0}`));
      b.append(itemRow('🥕', `Novākti dārzeņi: ${st.harvested || 0}`));
      b.append(itemRow('🏎️', `Sacīkstes: ${st.races || 0} · uzvaras: ${st.wins || 0}`, this.save.bestLap ? `Labākais aplis: ${fmtTime(this.save.bestLap)}` : ''));
      b.append(itemRow('⏱️', `Spēlēts: ${Math.round(this.save.playTime / 60)} min`));
    };
    showPanel('🎒 Mana soma', build);
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
      if (this.net.offline) {
        b.append(el('p', {}, 'Tu spēlē viens bez interneta. Lai spēlētu ar draugiem, izej uz sākumu un izveido istabu.'));
      } else {
        b.append(el('div', { className: 'sect' }, `Istabas kods: ${this.roomCode}`));
        b.append(el('p', {}, this.net.isHost ? 'Tu esi saimnieks 🏠. Draugi var pievienoties ar šo kodu vai saiti. Ja tu aizvērsi spēli, istaba beigsies.' : 'Tu esi pievienojies drauga istabai.'));
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
      b.append(itemRow('⭐', `${this.save.name} (tu)`, animalName(this.save.animal) + (this.net.isHost ? ' · saimnieks' : '')));
      for (const r of this.remotes.values()) b.append(itemRow('🙂', r.prof.name, animalName(r.prof.animal) + (r.id === 0 ? ' · saimnieks' : '')));
    });
  }

  openMenu() {
    showPanel('☰ Izvēlne', (b) => {
      b.append(el('div', { className: 'sect' }, 'Kā spēlēt'));
      b.append(el('p', { html: '🕹️ <b>Kreisā puse</b> — velc pirkstu, lai staigātu.<br>👆 <b>Labā puse</b> — velc, lai grozītu kameru (2 pirksti — tuvināt).<br>⤒ — lēkt. Dzeltenā poga parādās, kad vari kaut ko darīt.<br>🍄 Mežā lasi sēnes (bet ne sarkanās mušmires!).<br>🌱 Ciemata dārzā stādi sēklas, aplaisti un novāc ražu.<br>🧺 Pārdod ražu tirgū un pērc cepures.<br>🏎️ Kartinga trase ir uz austrumiem — sēdies kartā un sacenties!<br>⭐ Kalnu virsotnēs paslēptas 15 zelta zvaigznes — no 🗼 skatu torņa tās redz kartē.<br>🎣 Nopērc makšķeri pie Ūdra Ojāra un makšķerē ezeros; kad pludiņš raustās — spied „VILKT!”.<br>🫐 Mežā lasi mellenes un avenes, purvā — dzērvenes.<br>⛺ Pie ugunskura var izcept sēnes (dārgāk pārdot).<br>🗺️ Atrodi 3 kartes gabalus (ugunskurs, tornis, purvs) un atver dārguma lādi 🏰 Pilsdrupās!<br>🐾 Suns Sprīdis pārdod mājdzīvniekus, Lapsa Liene — dārza rotājumus.<br>🎲 Ar draugiem spēlē ķeramo un paslēpes.<br>🤝 Katru nedēļu jauns kopīgais mērķis visiem draugiem.' }));
      b.append(el('div', { className: 'sect' }, 'Iestatījumi'));
      b.append(el('button', { className: 'pbtn', onclick: () => {
        try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } catch (e) { /* */ }
      } }, '⛶ Pilnekrāns'));
      b.append(' ');
      b.append(el('button', { className: 'pbtn', onclick: () => {
        const nq = { high: 'mid', mid: 'low', low: 'high' }[this.quality] || 'high';
        try { localStorage.setItem('mezvidi_quality', nq); } catch (e) { /* */ }
        toast(`${{ high: 'Augsta', mid: 'Vidēja', low: 'Zema' }[nq]} grafika ieslēgsies pēc pārlādes`);
        this.persist();
        if (this.net.offline) setTimeout(() => location.reload(), 800);
      } }, `🎨 Grafika: ${{ high: 'Augsta', mid: 'Vidēja', low: 'Zema' }[this.quality]}`));
      b.append(' ');
      b.append(el('button', { className: 'pbtn', onclick: () => { this.persist(); toast('💾 Saglabāts!', 'good'); } }, '💾 Saglabāt'));
      b.append(' ');
      b.append(el('button', { className: 'pbtn', style: 'background:#c94a3a', onclick: () => this.quit() }, '🚪 Saglabāt un iziet'));
      b.append(el('div', { style: 'margin-top:12px;font-size:12px;opacity:0.6;text-align:center' }, `Versija ${VERSION} · ${BUILD_DATE}`));
    });
  }

  quit() {
    this.persist();
    this.ended = true;
    try { this.net.close(); } catch (e) { /* */ }
    location.href = location.pathname;
  }
}

Object.assign(Game.prototype, Activities);
Game.prototype.weeklyIcon = function () { return ({ mushrooms: '🍄', fish: '🐟', berries: '🫐', harvested: '🥕', petted: '🦌', races: '🏎️' })[this.team.stat] || ''; };

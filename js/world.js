import * as THREE from 'three';
import { makeNoise2D, mulberry32 } from './noise.js?v=1.11.1';
import { MUSHROOMS } from './data.js?v=1.11.1';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, smoothstep, lerp, makeTextSprite, canvasTexture, natureMaterial, leafTexture, spruceTexture, pineTexture, grassTexture, noiseTexture, windTime } from './util.js?v=1.11.1';
import { optimizeRig, flattenStatic } from './characters.js?v=1.11.1';
import { ZONE_HALF, ZONES, DIRS, GROUND_Y, sqDist, clampSquare, buildBorderPosts, smoothRoad, RoadIndex, buildRoadMesh, ROAD_HW } from './zones.js?v=1.11.1';
import { findPlaces, placeHeight, inPlace, buildPlaces, updatePlaces, placeBerries } from './places.js?v=1.11.1';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const SIZE = 560; // reljefs nedaudz pāri robežai (tur tas pāriet kaimiņu zemes līdzenumā)
export const SEG = 224;
export const CELL = SIZE / SEG;
export const HALF = SIZE / 2;
export const WATER_Y = 0;
export const VILLAGE_Y = 4;
export const TRACK_Y = 3;
export const PLAY_RADIUS = ZONE_HALF; // kvadrāta puse (vārds palicis no apļa laikiem)
const EDGE = PLAY_RADIUS - 12; // īpašās vietas paliek tālāk no malas
const BLEND0 = PLAY_RADIUS - 6, BLEND1 = PLAY_RADIUS + 40; // aiz robežas reljefs pāriet kaimiņu zemes līdzenumā
// foto slāņu svari kaimiņu zemēm aiz robežas: [mežs, smiltis, zeme, akmens] (pļava = atlikums)
const SKIRT_SPLAT = { n: [0, 0, 0, 0], e: [0, 0, 1, 0], s: [0, 1, 0, 0], w: [1, 0, 0, 0], x: [0.8, 0, 0, 0] };
const LOD_CH = 80; // apgabala izmērs detalizācijas līmeņiem
export const TRACK_WIDTH = 12;
export const TRACK_N = 400;

const TRACK_CENTER = { x: 112, z: -12 };
const TRACK_PTS = [
  [-50, 0], [-42, -28], [-14, -40], [16, -32], [34, -42], [52, -20],
  [46, 10], [22, 14], [12, 34], [-18, 40], [-44, 24],
];

// grants ceļi no ciemata līdz katrai robežai (robežas vidū — tur turpinās kaimiņu zemes ceļš)
const ROADS = [
  [[-14, -38], [-22, -90], [-6, -150], [0, -180], [0, -212], [0, -255]],          // ziemeļi
  [[36, 22], [70, 52], [125, 60], [170, 45], [186, 14], [196, 2], [212, 0], [255, 0]], // austrumi (apkārt trasei)
  [[22, 40], [20, 100], [4, 160], [0, 180], [0, 212], [0, 255]],                  // dienvidi
  [[-42, 4], [-100, -10], [-150, 6], [-180, 0], [-212, 0], [-255, 0]],           // rietumi
];

export const GARDEN_SLOTS = [
  { x: -24, z: -21 }, { x: -24, z: -8 }, { x: -24, z: 5 }, { x: -24, z: 18 },
];
export function plotPos(slot, i) {
  const g = GARDEN_SLOTS[slot];
  const c = i % 3, r = Math.floor(i / 3);
  return { x: g.x + (r - 0.5) * 2.6, z: g.z + (c - 1) * 2.6 };
}

export const VENDORS = [
  { id: 'seeds', name: 'Ūdrs Ojārs', title: '🌱 Sēklas', x: 14, z: -12, animal: 'udrs', fur: '#6b4a2e', shirt: '#2fa84f', cart: '#3c9a4a' },
  { id: 'buyer', name: 'Āpsis Arnolds', title: '🧺 Uzpērku', x: 18, z: 0, animal: 'apsis', fur: '#7d7d7d', shirt: '#2f6fd6', cart: '#2f6fd6' },
  { id: 'hats', name: 'Pūce Paula', title: '🎩 Cepures', x: 14, z: 12, animal: 'puce', fur: '#9a7348', shirt: '#9b3bd2', cart: '#b04ad2' },
  { id: 'pets', name: 'Suns Sprīdis', title: '🐾 Mājdzīvnieki', x: -9, z: -15, animal: 'suns', fur: '#c89b5e', shirt: '#f07b2a', cart: '#e0902a' },
  { id: 'decor', name: 'Lapsa Liene', title: '🏡 Dārzam', x: -9, z: 15, animal: 'lapsa', fur: '#e8742a', shirt: '#2fa84f', cart: '#3a9a9a' },
];

export const SPAWN = { x: 5, z: 5 };

export class World {
  constructor(seed) {
    this.seed = seed;
    this.noise = makeNoise2D(seed);
    this.noise2 = makeNoise2D(seed + 1);
    this.rnd = mulberry32(seed + 7);
    this.group = new THREE.Group();
    this.grid = new Map();
    this.buildTrackCurve();
    this.buildRoads();
    this.places = [];
    this.platforms = [];
    findPlaces(this, EDGE);
    this.computeHeights();
  }

  // ---------- trase ----------
  buildTrackCurve() {
    const pts = TRACK_PTS.map(([x, z]) => new THREE.Vector3(TRACK_CENTER.x + x, TRACK_Y, TRACK_CENTER.z + z));
    this.trackCurve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const sp = this.trackCurve.getSpacedPoints(TRACK_N);
    sp.pop();
    this.trackPts = sp;
    this.trackLen = this.trackCurve.getLength();
    this.trackTan = sp.map((p, i) => {
      const a = sp[(i - 1 + TRACK_N) % TRACK_N], b = sp[(i + 1) % TRACK_N];
      return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    });
    this.trackBox = { x0: Math.min(...sp.map((p) => p.x)), x1: Math.max(...sp.map((p) => p.x)), z0: Math.min(...sp.map((p) => p.z)), z1: Math.max(...sp.map((p) => p.z)) };
    const s0 = sp[0], t0 = this.trackTan[0];
    this.roadEnd = { x: s0.x - t0.z * -14, z: s0.z + t0.x * -14 };
  }

  trackDist(x, z) {
    // ātra pārbaude: ja tālu no trases taisnstūra, precīzs attālums nav vajadzīgs
    const b = this.trackBox;
    const bx = Math.max(b.x0 - x, 0, x - b.x1), bz = Math.max(b.z0 - z, 0, z - b.z1);
    if (bx > 40 || bz > 40) return Math.hypot(bx, bz);
    let best = 1e9;
    const p = this.trackPts;
    for (let i = 0; i < TRACK_N; i += 2) {
      const dx = p[i].x - x, dz = p[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  // tuvākais trases punkts, meklējot ap iepriekšējo indeksu
  nearestTrackIdx(x, z, hint = -1) {
    const p = this.trackPts;
    let best = 1e9, bi = 0;
    if (hint >= 0) {
      for (let k = -25; k <= 25; k++) {
        const i = (hint + k + TRACK_N) % TRACK_N;
        const dx = p[i].x - x, dz = p[i].z - z, d = dx * dx + dz * dz;
        if (d < best) { best = d; bi = i; }
      }
      if (best < 400) return { idx: bi, dist: Math.sqrt(best) };
    }
    for (let i = 0; i < TRACK_N; i++) {
      const dx = p[i].x - x, dz = p[i].z - z, d = dx * dx + dz * dz;
      if (d < best) { best = d; bi = i; }
    }
    return { idx: bi, dist: Math.sqrt(best) };
  }

  // ceļu līnijas un to augstuma profils (izlīdzināts dabiskais reljefs, virs ūdens)
  buildRoads() {
    this.roadLines = ROADS.map((p) => smoothRoad(p));
    for (const l of this.roadLines) {
      let h = l.map((p) => this.baseHeight(p.x, p.z));
      for (let pass = 0; pass < 3; pass++) {
        h = h.map((_, i) => { let sum = 0, n = 0; for (let k = -12; k <= 12; k++) { const v = h[i + k]; if (v !== undefined) { sum += v; n++; } } return sum / n; });
      }
      l.forEach((p, i) => { p.h = Math.max(1.4, h[i]); });
    }
    this.roadIdx = new RoadIndex(this.roadLines);
  }

  // attālums līdz tuvākajam ceļam (ciemata ceļš uz trasi vai grants ceļi; grants ceļi ir platāki)
  roadDist(x, z) {
    const s = this.spurDist(x, z), r = this.roadIdx.near(x, z);
    if (r.d - (ROAD_HW - 3) < s.d) return { d: r.d - (ROAD_HW - 3), t: s.t };
    return s;
  }

  spurDist(x, z) {
    const ax = 34, az = 0, bx = this.roadEnd.x, bz = this.roadEnd.z;
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    const px = ax + vx * t, pz = az + vz * t;
    return { d: Math.hypot(x - px, z - pz), t };
  }

  forest(x, z) {
    return this.noise2(x * 0.011, z * 0.011) + 0.25 * this.noise2(x * 0.05 + 9, z * 0.05 - 4);
  }

  naturalHeight(x, z) {
    const n = this.noise;
    // maigi pauguri, nevis lieli kalni
    let h = n(x * 0.0045, z * 0.0045) * 6.5 + n(x * 0.013 + 31, z * 0.013 - 17) * 2.6 + n(x * 0.04 - 7, z * 0.04 + 3) * 0.5;
    // lieli apgabali: līdzenumi, paugurainas vietas un zemienes ar ezeriem
    const reg = n(x * 0.0017 + 500, z * 0.0017 - 700);
    const hv = n(x * 0.008 + 200, z * 0.008 - 300);
    if (hv > 0) h += hv * hv * 14 * (1 + Math.max(0, reg) * 1.3);
    h += reg * 3.2;
    return h + 1.6;
  }

  // reljefs bez grants ceļiem, vietām un robežas
  baseHeight(x, z) {
    let h = this.naturalHeight(x, z);
    const d = Math.hypot(x, z);
    h = lerp(h, VILLAGE_Y, 1 - smoothstep(34, 62, d));
    const rd = this.spurDist(x, z);
    h = lerp(h, lerp(VILLAGE_Y, TRACK_Y, rd.t), 1 - smoothstep(3, 9, rd.d));
    const td = this.trackDist(x, z);
    return lerp(h, TRACK_Y - 0.05, 1 - smoothstep(TRACK_WIDTH / 2 + 3, TRACK_WIDTH / 2 + 16, td));
  }

  computeHeight(x, z) {
    let h = this.baseHeight(x, z);
    const r = this.roadIdx.near(x, z);
    if (r.d < 12) h = lerp(h, r.p.h, 1 - smoothstep(ROAD_HW + 0.8, 12, r.d));
    if (this.places.length) h = placeHeight(this, x, z, h);
    const e = sqDist(x, z);
    if (e > BLEND0) h = lerp(h, GROUND_Y, smoothstep(BLEND0, BLEND1, e));
    return h;
  }

  // aiz robežas: kuras kaimiņu zemes izskatā pāriet zeme (side = null stūros) un cik stipri (k)
  edgeBlend(x, z) {
    const ax = Math.abs(x), az = Math.abs(z);
    const k = smoothstep(PLAY_RADIUS + 4, PLAY_RADIUS + 38, Math.max(ax, az));
    if (k <= 0) return null;
    const side = Math.min(ax, az) > PLAY_RADIUS ? null : ax > az ? (x > 0 ? 'e' : 'w') : (z > 0 ? 's' : 'n');
    return { side, k };
  }

  computeHeights() {
    const n = SEG + 1;
    this.heights = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
        this.heights[iz * n + ix] = this.computeHeight(x, z);
      }
    }
  }

  // augstums, kas precīzi sakrīt ar zemes trijstūriem
  getHeight(x, z) {
    const n = SEG + 1;
    let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    fx = Math.max(0, Math.min(SEG - 0.0001, fx));
    fz = Math.max(0, Math.min(SEG - 0.0001, fz));
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const u = fx - ix, v = fz - iz;
    const H = this.heights;
    const ha = H[iz * n + ix], hb = H[(iz + 1) * n + ix], hc = H[(iz + 1) * n + ix + 1], hd = H[iz * n + ix + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }

  // zeme vai laipa/torņa platforma zem kājām (y — pašreizējais augstums)
  groundAt(x, z, y = 1e9) {
    let h = this.getHeight(x, z);
    for (const p of this.platforms) {
      const dx = x - p.x, dz = z - p.z;
      const c = Math.cos(p.ang), s = Math.sin(p.ang);
      const lx = dx * c + dz * s, lz = -dx * s + dz * c;
      if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hl && y >= p.y - 0.7 && p.y > h) h = p.y;
    }
    return h;
  }

  isWater(x, z) { return this.getHeight(x, z) < WATER_Y - 0.2; }

  // ---------- sadursmes ----------
  addCollider(x, z, r) {
    const k = Math.floor(x / 8) + ',' + Math.floor(z / 8);
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push([x, z, r]);
  }

  collide(pos, radius) {
    const cx = Math.floor(pos.x / 8), cz = Math.floor(pos.z / 8);
    let hit = false;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this.grid.get((cx + a) + ',' + (cz + b));
      if (!list) continue;
      for (const c of list) {
        const dx = pos.x - c[0], dz = pos.z - c[1];
        const min = c[2] + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = c[0] + dx / d * min;
          pos.z = c[1] + dz / d * min;
          hit = true;
        }
      }
    }
    if (clampSquare(pos, ['n', 'e', 's', 'w'])) hit = true;
    return hit;
  }

  // ---------- būvēšana ----------
  build(scene, renderer = null) {
    this.renderer = renderer;
    scene.add(this.group);
    this.buildTerrain();
    this.buildWater();
    this.buildTrackMesh();
    this.buildVillage();
    buildPlaces(this);
    this.buildTrees();
    this.buildRocksAndFlowers();
    this.buildClouds();
    this.placeMushrooms();
    this.placeStars();
    this.placeNpcHomes();
    placeBerries(this, PLAY_RADIUS);
    this.buildSkirt();
    this.group.add(buildRoadMesh(this.roadLines, (x, z) => this.getHeight(x, z)));
    this.group.add(buildBorderPosts(Object.keys(DIRS), (x, z) => this.getHeight(x, z)));
  }

  // dabiska zemes krāsa konkrētā vietā (izmanto gan reljefs, gan zāle)
  groundColor(x, z, h, c) {
    const P = this._pal || (this._pal = {
      sandWet: new THREE.Color('#6e6248'), sand: new THREE.Color('#b19d74'),
      grass: new THREE.Color('#4a6b2a'), grass2: new THREE.Color('#62803a'), dry: new THREE.Color('#8f8a52'),
      lush: new THREE.Color('#3f6326'), forestG: new THREE.Color('#3a4f24'), needles: new THREE.Color('#5a4a30'),
      soil: new THREE.Color('#4e3f2a'), rock: new THREE.Color('#77736a'), road: new THREE.Color('#7d6a4c'),
      village: new THREE.Color('#5c8236'), tmp: new THREE.Color(),
    });
    const v = this.noise2(x * 0.03, z * 0.03) * 0.5 + 0.5;
    const v2 = this.noise(x * 0.11 + 40, z * 0.11) * 0.5 + 0.5;
    const v3 = this.noise2(x * 0.006 - 50, z * 0.006 + 20) * 0.5 + 0.5;
    if (h < -0.2) c.copy(P.sandWet).lerp(P.sand, clamp01(h + 1));
    else if (h < 0.9) c.copy(P.sand).lerp(P.lush, smoothstep(0.45, 0.95, h));
    else {
      c.copy(P.grass).lerp(P.grass2, v);
      c.lerp(P.lush, Math.max(0, 0.5 - v3) * 1.2);
      c.lerp(P.dry, Math.max(0, v3 - 0.55) * 1.4 + Math.max(0, v2 - 0.7) * 1.2);
      if (h < 2.2) c.lerp(P.lush, (2.2 - h) * 0.5);
      const f = this.forest(x, z);
      if (f > 0.05) {
        c.lerp(P.forestG, Math.min(1, (f - 0.05) * 3.5));
        c.lerp(P.needles, Math.min(0.55, Math.max(0, v2 - 0.35) * Math.min(1, f * 3)));
      }
      const r = Math.hypot(x, z), e = sqDist(x, z);
      if (r < 30) c.lerp(P.village, 0.4);
      if (h > 13 && e < EDGE + 4) c.lerp(P.rock, Math.min(0.6, (h - 13) / 10));
      const eb = this.edgeBlend(x, z);
      if (eb) c.lerp(eb.side ? (P['z' + eb.side] || (P['z' + eb.side] = new THREE.Color(ZONES[eb.side].ground))) : P.forestG, eb.k);
      const sw = this.swampPlace || (this.swampPlace = this.places.find((p) => p.id === 'purvs') || { x: 1e9, z: 0, swamp: 1 });
      const sd = Math.hypot(x - sw.x, z - sw.z);
      if (sd < sw.swamp * 1.5) c.lerp(P.swamp || (P.swamp = new THREE.Color('#5e5a2c')), 0.6 * (1 - smoothstep(sw.swamp * 0.7, sw.swamp * 1.5, sd)));
      const rd = this.roadDist(x, z).d;
      if (rd < 3.4) c.lerp(P.road, (1 - smoothstep(1.8, 3.4, rd)) * (0.85 + v2 * 0.15));
    }
    return c.multiplyScalar(0.9 + v2 * 0.18);
  }

  // foto faktūru slāņu svari: mežs, smiltis, zeme/dubļi, akmens (pļava = atlikums)
  splatAt(x, z, h, ny, out, o) {
    const r = Math.hypot(x, z), e = sqDist(x, z);
    let wF = 0, wS = 0, wD = 0, wR = 0;
    if (h < 0.9) wS = 1 - smoothstep(0.45, 0.95, h);
    if (h < -0.3) { wD = clamp01((-h - 0.3) * 0.8); wS *= 1 - wD; }
    if (h >= 0.6) {
      const f = this.forest(x, z);
      wF = clamp01((f - 0.08) * 3.2) * smoothstep(0.6, 1.2, h) * smoothstep(40, 55, r);
      const rd = this.roadDist(x, z).d;
      if (rd < 3.6) wD = Math.max(wD, 1 - smoothstep(1.6, 3.6, rd));
      const sw = this.swampPlace || (this.swampPlace = this.places.find((p) => p.id === 'purvs') || { x: 1e9, z: 0, swamp: 1 });
      const sd = Math.hypot(x - sw.x, z - sw.z);
      if (sd < sw.swamp * 1.4) wD = Math.max(wD, 0.55 * (1 - smoothstep(sw.swamp * 0.6, sw.swamp * 1.4, sd)));
      for (const p of this.places) if ((p.id === 'nometne' || p.id === 'drupas') && Math.hypot(x - p.x, z - p.z) < 6) wD = Math.max(wD, 0.6);
      if (r < 4) wD = Math.max(wD, 0.5);
    }
    wR = smoothstep(0.88, 0.72, ny);
    if (h > 13 && e < EDGE + 4) wR = Math.max(wR, Math.min(0.75, (h - 13) / 9));
    const eb = this.edgeBlend(x, z);
    if (eb) {
      const t = SKIRT_SPLAT[eb.side || 'x'];
      wF = lerp(wF, t[0], eb.k); wS = lerp(wS, t[1], eb.k); wD = lerp(wD, t[2], eb.k); wR = lerp(wR, t[3], eb.k);
    }
    const sum = wF + wS + wD + wR;
    const k = sum > 1 ? 1 / sum : 1;
    out[o] = wF * k; out[o + 1] = wS * k; out[o + 2] = wD * k; out[o + 3] = wR * k;
  }

  // trases asfalts no foto faktūras ar baltajām malu līnijām
  usePhotoAsphalt(img, normal) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 1024;
    const c = cv.getContext('2d');
    for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) c.drawImage(img, x * 342, y * 342, 342, 342);
    const grd = c.createLinearGradient(0, 0, 512, 0);
    grd.addColorStop(0.25, 'rgba(10,10,12,0)'); grd.addColorStop(0.5, 'rgba(10,10,12,0.28)'); grd.addColorStop(0.75, 'rgba(10,10,12,0)');
    c.fillStyle = grd; c.fillRect(0, 0, 512, 1024);
    c.fillStyle = 'rgba(235,235,228,0.9)'; c.fillRect(512 * 0.035, 0, 512 * 0.025, 1024); c.fillRect(512 * 0.94, 0, 512 * 0.025, 1024);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    const m = this.trackRoad.material;
    m.map = t; m.normalMap = normal; normal.repeat.set(3, 3); m.normalScale.set(0.8, 0.8); m.roughness = 0.9;
    m.needsUpdate = true;
  }

  // akmeņiem un pilsdrupām foto faktūra
  usePhotoRock(map, normal) {
    for (const m of this.stoneMats || []) { m.map = map; m.normalMap = normal; m.color.multiplyScalar(1.9); m.needsUpdate = true; }
  }

  // nomaina reljefa materiālu uz foto faktūrām (izsauc gfx, kad faktūras ielādētas)
  usePhotoTerrain(material) {
    for (const t of this.terrainTiles) t.material = material;
  }

  // atpakaļ uz vienkāršo (virsotņu krāsu) reljefu — zemākiem grafikas līmeņiem
  useBaseTerrain() {
    if (this.terrainBase) for (const t of this.terrainTiles) t.material = this.terrainBase;
  }

  buildTerrain() {
    // reljefs sadalīts 8×8 flīzēs, lai neredzamās nezīmētu; normāles no kopējā augstumu režģa (bez šuvēm)
    const n = SEG + 1, H = this.heights;
    const TILES = 8, TS = SEG / TILES, TW = SIZE / TILES;
    const c = new THREE.Color(), nv = new THREE.Vector3();
    const hAt = (ix, iz) => H[Math.max(0, Math.min(SEG, iz)) * n + Math.max(0, Math.min(SEG, ix))];
    const detail = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 120; k++) {
        const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 40;
        const l = 170 + Math.random() * 80;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, `rgba(${l},${l},${l},0.35)`); grd.addColorStop(1, `rgba(${l},${l},${l},0)`);
        g.fillStyle = grd;
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
      }
      for (let k = 0; k < 30000; k++) {
        const l = 120 + Math.random() * 135;
        g.fillStyle = `rgba(${l},${l * 1.02},${l * 0.9},0.8)`;
        const x = Math.random() * w, y = Math.random() * h;
        g.fillRect(x, y, 1 + Math.random() * 1.5, 2 + Math.random() * 4);
      }
    });
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.repeat.set(TW / 5.25, TW / 5.25);
    detail.anisotropy = 8;
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 1, metalness: 0 });
    this.terrainBase = material;
    this.terrainTiles = [];
    for (let tz = 0; tz < TILES; tz++) for (let tx = 0; tx < TILES; tx++) {
      const geo = new THREE.PlaneGeometry(TW, TW, TS, TS);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, nor = geo.attributes.normal;
      const colors = new Float32Array(pos.count * 3);
      const splat = new Float32Array(pos.count * 4);
      const ox = -HALF + tx * TW + TW / 2, oz = -HALF + tz * TW + TW / 2;
      for (let i = 0; i < pos.count; i++) {
        const ix = tx * TS + (i % (TS + 1)), iz = tz * TS + Math.floor(i / (TS + 1));
        const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
        const h = H[iz * n + ix];
        pos.setY(i, h);
        nv.set(hAt(ix - 1, iz) - hAt(ix + 1, iz), 2 * CELL, hAt(ix, iz - 1) - hAt(ix, iz + 1)).normalize();
        nor.setXYZ(i, nv.x, nv.y, nv.z);
        this.groundColor(x, z, h, c);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        this.splatAt(x, z, h, nv.y, splat, i * 4);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, material);
      m.position.set(ox, 0, oz);
      m.receiveShadow = true;
      this.group.add(m);
      this.terrainTiles.push(m);
    }
    this.terrain = this.terrainTiles[0];
  }

  // līdzenums ap reljefu līdz horizontam kaimiņu zemju izskatā (tas pats materiāls kā reljefam — bez jaunām faktūrām)
  buildSkirt() {
    const A = HALF, B = 1600, quads = [];
    for (const side of ['n', 'e', 's', 'w', null]) {
      const rects = side === 'n' ? [[-A, -B, A, -A]] : side === 's' ? [[-A, A, A, B]] : side === 'e' ? [[A, -A, B, A]] : side === 'w' ? [[-B, -A, -A, A]]
        : [[-B, -B, -A, -A], [A, -B, B, -A], [-B, A, -A, B], [A, A, B, B]];
      const col = new THREE.Color(side ? ZONES[side].ground : '#3a4f24').multiplyScalar(0.95);
      for (const r of rects) quads.push({ r, col, sp: SKIRT_SPLAT[side || 'x'] });
    }
    const n = quads.length * 4;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), S = new Float32Array(n * 4), U = new Float32Array(n * 2);
    const idx = [];
    quads.forEach((q, k) => {
      const [x0, z0, x1, z1] = q.r;
      [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach(([x, z], j) => {
        const i = k * 4 + j;
        P.set([x, GROUND_Y - 0.01, z], i * 3); N.set([0, 1, 0], i * 3); C.set([q.col.r, q.col.g, q.col.b], i * 3); S.set(q.sp, i * 4);
        U.set([x / (SIZE / 8), z / (SIZE / 8)], i * 2);
      });
      const o = k * 4;
      idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(S, 4));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, this.terrain.material);
    m.receiveShadow = true;
    this.group.add(m);
    this.terrainTiles.push(m);
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(SIZE * 1.6, SIZE * 1.6);
    geo.rotateX(-Math.PI / 2);
    // procedurāla viļņu normāļu karte
    const N = 128, hgt = new Float32Array(N * N);
    const wn = makeNoise2D(this.seed + 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0, a = 1, f = 1;
      for (let o = 0; o < 4; o++) {
        const ang = x / N * Math.PI * 2, bng = y / N * Math.PI * 2;
        v += a * wn(Math.cos(ang) * f * 1.5 + 9 * o, Math.sin(ang) * f * 1.5 + Math.cos(bng) * f * 1.5 + Math.sin(bng) * f * 1.5);
        a *= 0.5; f *= 2;
      }
      hgt[y * N + x] = v;
    }
    const nTex = canvasTexture(N, N, (g) => {
      const img = g.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x - 1 + N) % N];
        const dy = hgt[((y + 1) % N) * N + x] - hgt[((y - 1 + N) % N) * N + x];
        const k = (y * N + x) * 4;
        img.data[k] = 128 + dx * 90; img.data[k + 1] = 128 + dy * 90; img.data[k + 2] = 255; img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
    nTex.colorSpace = THREE.NoColorSpace;
    nTex.wrapS = nTex.wrapT = THREE.RepeatWrapping;
    nTex.repeat.set(110, 110);
    this.waterNormal = nTex;
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: '#24495a', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.9,
      normalMap: nTex, normalScale: new THREE.Vector2(0.18, 0.18),
    }));
    m.position.y = WATER_Y;
    m.renderOrder = 2;
    m.receiveShadow = true;
    this.group.add(m);
    this.water = m;
    this.size = SIZE; this.waterY = WATER_Y; this.waterTime = { value: 0 };
  }

  updateWater(dt) {
    windTime.value += dt;
    if (this.waterTime) this.waterTime.value += dt;
    if (!this.waterNormal) return;
    this.waterNormal.offset.x += dt * 0.006;
    this.waterNormal.offset.y += dt * 0.004;
  }

  buildTrackMesh() {
    const P = this.trackPts, T = this.trackTan, W = TRACK_WIDTH / 2, Y = TRACK_Y + 0.04;
    // asfalts ar UV: u šķērsām, v gar trasi (pēc attāluma)
    const verts = [], uvs = [], idx = [];
    let dist = 0;
    for (let i = 0; i <= TRACK_N; i++) {
      const p = P[i % TRACK_N], t = T[i % TRACK_N];
      if (i > 0) { const q = P[i - 1]; dist += Math.hypot(p.x - q.x, p.z - q.z); }
      const lx = -t.z, lz = t.x;
      verts.push(p.x + lx * W, Y, p.z + lz * W, p.x - lx * W, Y, p.z - lz * W);
      uvs.push(0, dist / 12, 1, dist / 12);
      if (i < TRACK_N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const asphalt = canvasTexture(256, 512, (c, w, h) => {
      c.fillStyle = '#5c5c60'; c.fillRect(0, 0, w, h);
      for (let k = 0; k < 26000; k++) { const l = 50 + Math.random() * 90; c.fillStyle = `rgba(${l},${l},${l + 4},0.55)`; c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random(), 1 + Math.random()); }
      // nobraukta braukšanas līnija un riepu pēdas
      const grd = c.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0.25, 'rgba(20,20,22,0)'); grd.addColorStop(0.5, 'rgba(20,20,22,0.22)'); grd.addColorStop(0.75, 'rgba(20,20,22,0)');
      c.fillStyle = grd; c.fillRect(0, 0, w, h);
      for (let k = 0; k < 6; k++) { c.strokeStyle = 'rgba(15,15,15,0.18)'; c.lineWidth = 5; const x = w * (0.3 + Math.random() * 0.4); c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 20, h / 3, x - 20, h * 2 / 3, x + (Math.random() - 0.5) * 30, h); c.stroke(); }
      for (let k = 0; k < 5; k++) { c.strokeStyle = 'rgba(25,25,25,0.6)'; c.lineWidth = 1; let x = Math.random() * w, y = Math.random() * h; c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 6; j++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 25; c.lineTo(x, y); } c.stroke(); }
      // baltās malu līnijas
      c.fillStyle = 'rgba(235,235,230,0.92)'; c.fillRect(w * 0.035, 0, w * 0.025, h); c.fillRect(w * 0.94, 0, w * 0.025, h);
    });
    asphalt.wrapT = THREE.RepeatWrapping; asphalt.anisotropy = 8;
    const road = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.85, metalness: 0 }));
    this.trackRoad = road;
    road.receiveShadow = true;
    this.group.add(road);

    // paceltas sarkanbaltas apmales ar slīpumu un sānu malu
    const cv = [], cc = [];
    const red = new THREE.Color('#c8282a'), white = new THREE.Color('#ecebe6');
    for (const side of [1, -1]) {
      for (let i = 0; i < TRACK_N; i++) {
        const p0 = P[i], p1 = P[(i + 1) % TRACK_N], t0 = T[i], t1 = T[(i + 1) % TRACK_N];
        const col = Math.floor(i / 3) % 2 ? red : white;
        const at = (p, t, o, y) => [p.x - t.z * o * side, Y + y, p.z + t.x * o * side];
        const quad = (o0, y0, o1, y1, cMul) => {
          const a = at(p0, t0, o0, y0), b = at(p0, t0, o1, y1), c2 = at(p1, t1, o0, y0), d = at(p1, t1, o1, y1);
          for (const q of [a, b, c2, b, d, c2]) { cv.push(...q); cc.push(col.r * cMul, col.g * cMul, col.b * cMul); }
        };
        quad(W - 0.05, 0.005, W + 0.55, 0.09, 1);
        quad(W + 0.55, 0.09, W + 0.95, 0.09, 0.95);
        quad(W + 0.95, 0.09, W + 0.95, -0.4, 0.6);
      }
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cv, 3));
    cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    cg.computeVertexNormals();
    const kerb = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6 }));
    kerb.receiveShadow = true;
    this.group.add(kerb);

    // riepu barjeras līkumu ārpusē
    const tyres = [];
    for (let i = 0; i < TRACK_N; i += 2) {
      const t0 = T[i], t1 = T[(i + 6) % TRACK_N];
      const turn = t0.x * t1.z - t0.z * t1.x;
      if (Math.abs(turn) < 0.05) continue;
      const side = turn > 0 ? 1 : -1;
      const o = W + 3.2;
      const x = P[i].x + t0.z * o * side, z = P[i].z - t0.x * o * side;
      if (this.trackDist(x, z) < W + 2.5 || this.roadDist(x, z).d < 3) continue;
      if (Math.hypot(x - P[0].x, z - P[0].z) < 10) continue;
      const h = this.getHeight(x, z);
      for (let k = 0; k < 3; k++) tyres.push({ x, y: h + 0.12 + k * 0.24, z, c: k % 2 });
      this.addCollider(x, z, 0.5);
    }
    if (tyres.length) {
      const tg = new THREE.TorusGeometry(0.36, 0.13, 6, 12); tg.rotateX(Math.PI / 2);
      const tim = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), tyres.length);
      const dm = new THREE.Object3D(), tc = new THREE.Color();
      tyres.forEach((d, i) => { dm.position.set(d.x, d.y, d.z); dm.updateMatrix(); tim.setMatrixAt(i, dm.matrix); tim.setColorAt(i, d.c ? tc.set('#d8d8d4') : tc.set('#1a1a1a')); });
      tim.castShadow = true; tim.receiveShadow = true; tim.computeBoundingSphere();
      this.group.add(tim);
    }

    // starta līnija
    const checker = canvasTexture(128, 32, (g2) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
        g2.fillStyle = (x + y) % 2 ? '#141414' : '#eeeeea'; g2.fillRect(x * 8, y * 8, 8, 8);
      }
    });
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH, 2), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.7 }));
    sl.rotation.order = 'YXZ';
    sl.rotation.y = Math.atan2(T[0].x, T[0].z);
    sl.rotation.x = -Math.PI / 2;
    sl.position.set(P[0].x, Y + 0.02, P[0].z);
    sl.receiveShadow = true;
    this.group.add(sl);
    // starta vārti: metāla kopņu torņi ar reklāmas joslu
    const gate = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: '#c4c8cc', metalness: 0.85, roughness: 0.35 });
    const bar = (a, b, r = 0.035) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), steel);
      m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); gate.add(m);
    };
    const tw = 0.25;
    for (const s of [1, -1]) {
      const cx = s * (W + 1.2);
      for (const [dx, dz] of [[-tw, -tw], [tw, -tw], [tw, tw], [-tw, tw]]) bar([cx + dx, 0, dz], [cx + dx, 6.2, dz], 0.05);
      for (let y = 0; y < 6; y += 0.6) {
        const c4 = [[-tw, -tw], [tw, -tw], [tw, tw], [-tw, tw]];
        for (let k = 0; k < 4; k++) { const a = c4[k], b = c4[(k + 1) % 4]; bar([cx + a[0], y, a[1]], [cx + b[0], y + 0.6, b[1]], 0.02); }
      }
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.9), mat('#8a8a86')); foot.position.set(cx, 0.07, 0); gate.add(foot);
    }
    for (const y of [5.0, 6.2]) for (const dz of [-tw, tw]) bar([-(W + 1.2), y, dz], [W + 1.2, y, dz], 0.05);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 1.6, 1.0, 0.05), new THREE.MeshStandardMaterial({
      roughness: 0.6,
      map: canvasTexture(1024, 96, (g2, w, h) => {
        const grd = g2.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#b8282a'); grd.addColorStop(1, '#8a1a1c');
        g2.fillStyle = grd; g2.fillRect(0, 0, w, h);
        for (let x = 0; x < 24; x++) for (let y = 0; y < 2; y++) { g2.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g2.fillRect(x * 12, y * 12 + 36, 12, 12); g2.fillRect(w - 288 + x * 12, y * 12 + 36, 12, 12); }
        g2.fillStyle = '#fff'; g2.font = 'bold 60px sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
        g2.fillText('STARTS • FINIŠS', w / 2, h / 2 + 3);
      }),
    }));
    banner.position.y = 5.6;
    gate.add(banner);
    optimizeRig(gate);
    gate.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    gate.position.set(P[0].x, TRACK_Y, P[0].z);
    gate.rotation.y = Math.atan2(T[0].x, T[0].z);
    this.group.add(gate);
    for (const s of [1, -1]) {
      this.addCollider(P[0].x - T[0].z * (W + 1.2) * s, P[0].z + T[0].x * (W + 1.2) * s, 0.5);
    }

    // paātrinājuma joslas: krāsotas, mirdzošas bultas uz asfalta
    const arrowTex = canvasTexture(128, 128, (g2, w, h) => {
      g2.clearRect(0, 0, w, h);
      for (let k = 0; k < 3; k++) {
        const y = 14 + k * 36;
        g2.fillStyle = k === 1 ? '#ffb000' : '#ffd21a';
        g2.beginPath(); g2.moveTo(64, y); g2.lineTo(118, y + 34); g2.lineTo(96, y + 34); g2.lineTo(64, y + 14); g2.lineTo(32, y + 34); g2.lineTo(10, y + 34); g2.closePath(); g2.fill();
      }
    });
    this.boostPads = [];
    const padM = new THREE.MeshStandardMaterial({ map: arrowTex, emissiveMap: arrowTex, emissive: '#ffaa00', emissiveIntensity: 0.6, transparent: true, depthWrite: false, roughness: 0.4 });
    for (const f of [0.22, 0.5, 0.78]) {
      const i = Math.floor(f * TRACK_N);
      const p = P[i], t = T[i];
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), padM);
      pad.rotation.order = 'YXZ';
      pad.rotation.y = Math.atan2(t.x, t.z) + Math.PI;
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(p.x, Y + 0.03, p.z);
      pad.renderOrder = 1;
      this.group.add(pad);
      this.boostPads.push({ x: p.x, z: p.z });
    }

    // kartu stāvvieta: betona laukums ar marķējumu
    const k = 14, pk = P[k], tk = T[k];
    this.kartSpot = { x: pk.x + tk.z * (W + 6), z: pk.z - tk.x * (W + 6), heading: Math.atan2(tk.x, tk.z) };
    const sign = makeTextSprite('🏎️ Kartings', { fontSize: 48, bg: 'rgba(210,40,40,0.85)' });
    sign.position.set(this.kartSpot.x, TRACK_Y + 3.4, this.kartSpot.z);
    this.group.add(sign);
    const concrete = canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = '#b8b4aa'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const l = 140 + Math.random() * 80; c.fillStyle = `rgba(${l},${l},${l - 6},0.5)`; c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
      c.strokeStyle = 'rgba(70,70,65,0.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
      c.strokeStyle = '#e8c020'; c.lineWidth = 6; c.beginPath(); c.arc(w / 2, h / 2, w * 0.44, 0, 7); c.stroke();
    });
    const pad2 = new THREE.Mesh(new THREE.CircleGeometry(2.8, 32), new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.95 }));
    pad2.rotation.x = -Math.PI / 2;
    pad2.receiveShadow = true;
    pad2.position.set(this.kartSpot.x, this.getHeight(this.kartSpot.x, this.kartSpot.z) + 0.06, this.kartSpot.z);
    this.group.add(pad2);
  }

  gridSlot(k) {
    const back = 6 + Math.floor(k / 2) * 5;
    const i = (TRACK_N - back) % TRACK_N;
    const p = this.trackPts[i], t = this.trackTan[i];
    const side = k % 2 ? -2.6 : 2.6;
    return { x: p.x - t.z * side, z: p.z + t.x * side, heading: Math.atan2(t.x, t.z), idx: i };
  }

  buildVillage() {
    const g = new THREE.Group(); // visu ciematu beigās apvieno pa materiāliem (dažos zīmēšanas izsaukumos)
    // aka
    const well = new THREE.Group();
    const wst = noiseTexture('stone', 128); wst.repeat.set(5, 1);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 1, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#9a958a', map: wst, roughness: 1, side: THREE.DoubleSide }));
    ring.position.y = 0.5; well.add(ring);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.33, 0.1, 6, 18), mat('#8d887d', { roughness: 1 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 1.0; well.add(rim);
    const wat = new THREE.Mesh(new THREE.CircleGeometry(1.25, 18), mat('#1e3a44', { roughness: 0.1 }));
    wat.rotation.x = -Math.PI / 2; wat.position.y = 0.35; well.add(wat);
    for (const s of [1, -1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 6), mat('#6e5a45'));
      post.position.set(s * 1.2, 1.3, 0); well.add(post);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.5, 8), mat('#6e5a45'));
    axle.rotation.z = Math.PI / 2; axle.position.y = 1.9; well.add(axle);
    for (const s of [1, -1]) {
      const rf = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 1.4), mat('#5d5650', { roughness: 1 }));
      rf.position.set(0, 2.85, s * 0.55); rf.rotation.x = s * 0.6; well.add(rf);
    }
    optimizeRig(well);
    well.position.set(0, VILLAGE_Y, 0);
    g.add(well);
    this.addCollider(0, 0, 1.5);

    // mājiņas: guļbūves ar skaidu jumtiem
    const logTex = canvasTexture(256, 256, (g, w, h) => {
      const n = 8, bh = h / n;
      for (let i = 0; i < n; i++) {
        const y = i * bh, l = 0.85 + Math.random() * 0.15;
        const grd = g.createLinearGradient(0, y, 0, y + bh);
        grd.addColorStop(0, `rgb(${60 * l | 0},${45 * l | 0},${32 * l | 0})`);
        grd.addColorStop(0.18, `rgb(${150 * l | 0},${118 * l | 0},${86 * l | 0})`);
        grd.addColorStop(0.55, `rgb(${170 * l | 0},${138 * l | 0},${104 * l | 0})`);
        grd.addColorStop(0.9, `rgb(${105 * l | 0},${80 * l | 0},${58 * l | 0})`);
        grd.addColorStop(1, 'rgb(40,30,22)');
        g.fillStyle = grd; g.fillRect(0, y, w, bh);
        for (let k = 0; k < 40; k++) {
          g.strokeStyle = `rgba(50,35,25,${0.1 + Math.random() * 0.2})`; g.lineWidth = 1;
          const yy = y + 4 + Math.random() * (bh - 8), x0 = Math.random() * w;
          g.beginPath(); g.moveTo(x0, yy); g.lineTo(x0 + 20 + Math.random() * 60, yy + (Math.random() - 0.5) * 2); g.stroke();
        }
      }
    });
    logTex.wrapS = logTex.wrapT = THREE.RepeatWrapping;
    const roofTex = canvasTexture(256, 256, (g, w, h) => {
      const rows = 12, rh = h / rows;
      for (let r = 0; r < rows; r++) {
        let x = (r % 2) * -10;
        while (x < w) {
          const sw = 14 + Math.random() * 14, l = 80 + Math.random() * 50;
          g.fillStyle = `rgb(${l},${l * 0.95 | 0},${l * 0.88 | 0})`;
          g.fillRect(x, r * rh, sw - 1.5, rh);
          g.fillStyle = 'rgba(20,18,15,0.55)'; g.fillRect(x, r * rh + rh - 3, sw, 3);
          if (Math.random() < 0.25) { g.fillStyle = 'rgba(90,110,50,0.35)'; g.fillRect(x, r * rh, sw, rh); }
          x += sw;
        }
      }
    });
    roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping;
    const plankTex = canvasTexture(128, 128, (g, w, h) => {
      for (let i = 0; i < 6; i++) {
        const l = 0.8 + Math.random() * 0.25;
        g.fillStyle = `rgb(${120 * l | 0},${88 * l | 0},${60 * l | 0})`; g.fillRect(i * w / 6, 0, w / 6 - 2, h);
        g.fillStyle = 'rgba(30,20,12,0.9)'; g.fillRect(i * w / 6 + w / 6 - 2, 0, 2, h);
      }
    });
    const houses = [[4, -30, 0.2], [20, -25, -0.4], [6, 30, 3.0], [-10, 32, 2.8], [-34, -32, 0.8]];
    const tints = ['#ffffff', '#e6dccf', '#d6cbbd', '#f2e8dc', '#cfc3b3'];
    const frameM = mat('#e9e4da', { roughness: 0.7 });
    const glassM = new THREE.MeshStandardMaterial({ color: '#1d2a33', roughness: 0.08, metalness: 0.4 });
    const doorM = new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.9 });
    const stoneTex = noiseTexture('stone', 128); stoneTex.repeat.set(4, 1);
    const baseM = new THREE.MeshStandardMaterial({ color: '#8a867e', map: stoneTex, roughness: 1 });
    houses.forEach(([x, z, r], i) => {
      const h = new THREE.Group();
      const W = 5, D = 4.4, WH = 2.8;
      const wallM = new THREE.MeshStandardMaterial({ color: tints[i], map: logTex, roughness: 0.95 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.5, D + 0.2), baseM); base.position.y = 0.05; h.add(base);
      const wg = new THREE.BoxGeometry(W, WH, D);
      // UV mērogs, lai baļķi visām sienām vienā biezumā
      const uv = wg.attributes.uv, wp = wg.attributes.position, wn = wg.attributes.normal;
      for (let k = 0; k < uv.count; k++) {
        const nx = Math.abs(wn.getX(k)), ny = Math.abs(wn.getY(k));
        if (ny > 0.5) continue;
        const u = nx > 0.5 ? wp.getZ(k) : wp.getX(k);
        uv.setXY(k, u / 2.4, (wp.getY(k) + WH / 2) / 2.8);
      }
      const w = new THREE.Mesh(wg, wallM); w.position.y = 0.3 + WH / 2; h.add(w);
      // divslīpju jumts + frontoni
      const top = 0.3 + WH, rise = 1.9, half = D / 2 + 0.45;
      const slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
      const roofM = new THREE.MeshStandardMaterial({ color: '#d8d4cc', map: roofTex, roughness: 0.95 });
      for (const sd of [1, -1]) {
        const rg = new THREE.BoxGeometry(W + 0.9, 0.12, slope);
        const ruv = rg.attributes.uv; for (let k = 0; k < ruv.count; k++) ruv.setXY(k, ruv.getX(k) * 2.4, ruv.getY(k) * 1.4);
        const rf = new THREE.Mesh(rg, roofM);
        rf.position.set(0, top + rise / 2, sd * half / 2); rf.rotation.x = sd * ang;
        h.add(rf);
      }
      const gable = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, rise - 0.1)]);
      const gg = new THREE.ExtrudeGeometry(gable, { depth: W - 0.02, bevelEnabled: false });
      gg.rotateY(Math.PI / 2); gg.translate(-(W - 0.02) / 2, top, 0);
      const guv = gg.attributes.uv; for (let k = 0; k < guv.count; k++) guv.setXY(k, guv.getX(k) / 2.4, guv.getY(k) / 2.8);
      h.add(new THREE.Mesh(gg, wallM));
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.6, 0.55), baseM); ch.position.set(1.2, top + rise - 0.1, -0.6); h.add(ch);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.9, 0.08), doorM);
      door.position.set(0, 0.3 + 0.95, D / 2 + 0.03); h.add(door);
      const df = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.05, 0.06), frameM); df.position.set(0, 0.3 + 1.0, D / 2 + 0.01); h.add(df);
      const win = (px, pz, ry) => {
        const gw = new THREE.Group();
        const fr = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.08), frameM); gw.add(fr);
        const gl = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.82, 0.04), glassM); gl.position.z = 0.03; gw.add(gl);
        const m1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.84, 0.03), frameM); m1.position.z = 0.06; gw.add(m1);
        const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.06, 0.03), frameM); m2.position.z = 0.06; gw.add(m2);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.2), frameM); sill.position.set(0, -0.53, 0.08); gw.add(sill);
        gw.position.set(px, 0.3 + 1.7, pz); gw.rotation.y = ry; h.add(gw);
      };
      win(-1.6, D / 2 + 0.02, 0); win(1.6, D / 2 + 0.02, 0);
      win(W / 2 + 0.02, 0, Math.PI / 2); win(-W / 2 - 0.02, 0, -Math.PI / 2);
      const y = this.getHeight(x, z);
      optimizeRig(h);
      h.position.set(x, y - 0.15, z); h.rotation.y = r;
      g.add(h);
      this.addCollider(x, z, 3.1);
    });

    // dārzu žogi: pelēcīgs, laika apstrādāts koks
    const fenceTex = noiseTexture('fur', 64); fenceTex.repeat.set(1, 4);
    const postM = new THREE.MeshStandardMaterial({ color: '#7a7064', map: fenceTex, roughness: 1 });
    const railM = new THREE.MeshStandardMaterial({ color: '#8c8273', map: fenceTex, roughness: 1 });
    GARDEN_SLOTS.forEach((s) => {
      const fence = new THREE.Group();
      const postG = new THREE.CylinderGeometry(0.07, 0.08, 0.9, 6);
      const railX = new THREE.BoxGeometry(6.6, 0.09, 0.05), railZ = new THREE.BoxGeometry(0.05, 0.09, 9.2);
      const hw = 3.3, hd = 4.6;
      for (const [px, pz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [-hw, 0], [hw, 0], [0, -hd], [0, hd], [-hw, -hd / 2], [-hw, hd / 2], [hw, -hd / 2], [hw, hd / 2]]) {
        const p = new THREE.Mesh(postG, postM); p.position.set(px, 0.42, pz); p.rotation.z = (Math.random() - 0.5) * 0.06; fence.add(p);
      }
      for (const y of [0.35, 0.68]) {
        for (const pz of [-hd, hd]) { const r = new THREE.Mesh(railX, railM); r.position.set(0, y, pz); fence.add(r); }
        const r = new THREE.Mesh(railZ, railM); r.position.set(-hw, y, 0); fence.add(r);
      }
      optimizeRig(fence);
      fence.position.set(s.x, VILLAGE_Y, s.z);
      g.add(fence);
    });

    // ceļa zīme
    g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !this.terrainTiles.includes(o) && o !== this.water) { o.castShadow = true; o.receiveShadow = true; } });
    const sign = makeTextSprite('🏡 Mežvidi', { fontSize: 52, bg: 'rgba(60,120,40,0.85)' });
    sign.position.set(30, VILLAGE_Y + 3, -4);
    g.add(sign);
    this.group.add(flattenStatic(g));
  }

  buildTrees() {
    const rnd = this.rnd;
    const lists = { egle: [], priede: [], berzs: [], ozols: [], bush: [] };
    const step = 3.5;
    for (let gx = -HALF; gx < HALF; gx += step) {
      for (let gz = -HALF; gz < HALF; gz += step) {
        const x = gx + (rnd() - 0.5) * step * 0.9, z = gz + (rnd() - 0.5) * step * 0.9;
        const r = Math.hypot(x, z), e = sqDist(x, z);
        if (e > PLAY_RADIUS + 2 || r < 42) { rnd(); rnd(); continue; } // aiz robežas — kaimiņu zemes līdzenums
        const h = this.getHeight(x, z);
        if (h < 1.2 || h > 45) { rnd(); rnd(); continue; }
        if (this.roadDist(x, z).d < 6 || inPlace(this, x, z)) { rnd(); rnd(); continue; }
        const f = this.forest(x, z);
        const p = f > 0.12 ? 0.62 : f > 0.0 ? 0.08 : 0.02;
        if (rnd() > p) {
          if (f > 0.05 && rnd() < 0.25 && this.trackDist(x, z) > TRACK_WIDTH / 2 + 3) lists.bush.push({ x, y: h, z, s: 0.6 + rnd() * 0.7, ry: rnd() * 6.28 });
          continue;
        }
        if (this.trackDist(x, z) < TRACK_WIDTH / 2 + 5) { rnd(); continue; }
        const s = 0.85 + rnd() * 0.55;
        const t = rnd();
        const kind = f > 0.12 ? (t < 0.5 ? 'egle' : t < 0.78 ? 'priede' : 'berzs') : (t < 0.55 ? 'berzs' : 'ozols');
        lists[kind].push({ x, y: h, z, s, ry: rnd() * 6.28, tilt: (rnd() - 0.5) * 0.06 });
        this.addCollider(x, z, { egle: 0.45, priede: 0.35, berzs: 0.3, ozols: 0.55 }[kind] * s);
      }
    }
    this.treeCount = lists.egle.length + lists.priede.length + lists.berzs.length + lists.ozols.length;

    // ---- ģeometrija no caurspīdīgām lapu/skuju kartiņām ----
    const gr = mulberry32(this.seed + 777);
    const V = new THREE.Vector3(), N = new THREE.Vector3(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
    // kartiņu krātuve: pozīcijas, normāles (apaļas no vainaga centra), uv, krāsas (ēnojums iekšpusē)
    const foliage = () => ({ pos: [], nor: [], uv: [], col: [], idx: [] });
    const addCard = (F, w, h, matrix, center, radii, uvx = 0) => {
      const base = F.pos.length / 3;
      const corners = [[-w / 2, 0, 0, 0], [w / 2, 0, 1, 0], [w / 2, h, 1, 1], [-w / 2, h, 0, 1]];
      for (const [x, y, u, v] of corners) {
        V.set(x, y - (uvx ? h / 2 : 0), 0).applyMatrix4(matrix);
        F.pos.push(V.x, V.y, V.z);
        N.set((V.x - center.x) / radii.x, (V.y - center.y) / radii.y, (V.z - center.z) / radii.z);
        const d = Math.min(1, N.length());
        N.normalize(); N.y += 0.35; N.normalize();
        F.nor.push(N.x, N.y, N.z);
        F.uv.push(u, v);
        const ao = 0.42 + 0.58 * Math.pow(d, 1.3) * (0.75 + 0.25 * clamp01((V.y - center.y + radii.y) / (2 * radii.y)));
        F.col.push(ao, ao, ao);
      }
      F.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const toGeo = (F) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(F.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(F.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(F.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(F.col, 3));
      g.setIndex(F.idx);
      return g;
    };
    // lapu mākonis elipsoīdā
    const leafCloud = (count, center, radii, size) => {
      const F = foliage();
      for (let i = 0; i < count; i++) {
        let x, y, z;
        do { x = gr() * 2 - 1; y = gr() * 2 - 1; z = gr() * 2 - 1; } while (x * x + y * y + z * z > 1);
        const k = 0.55 + 0.45 * Math.sqrt(x * x + y * y + z * z);
        V.set(center.x + x * radii.x * k, center.y + y * radii.y * k, center.z + z * radii.z * k);
        E.set((gr() - 0.5) * 1.6, Math.atan2(x, z) + (gr() - 0.5) * 1.2, (gr() - 0.5) * 1.6);
        Q.setFromEuler(E);
        const s = size * (0.75 + gr() * 0.5);
        M.compose(V, Q, new THREE.Vector3(1, 1, 1));
        addCard(F, s, s, M, center, radii, 1);
      }
      return toGeo(F);
    };
    // stumbrs ar zariem
    const cyl = (r0, r1, len, seg = 7) => { const g = new THREE.CylinderGeometry(r1, r0, len, seg, 2); g.translate(0, len / 2, 0); return g; };
    const branch = (from, to, r0, r1) => {
      const dir = new THREE.Vector3().subVectors(to, from), len = dir.length();
      const g = cyl(r0, r1, len, 5);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
      g.translate(from.x, from.y, from.z);
      return g;
    };
    const trunkWith = (h, r0, r1, branches) => {
      const parts = [cyl(r0, r1, h, 9), ...branches];
      // nedaudz nelīdzens stumbrs
      const g = mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p));
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setX(i, p.getX(i) + Math.sin(y * 1.3) * 0.04);
        p.setZ(i, p.getZ(i) + Math.cos(y * 1.1) * 0.03);
      }
      g.computeVertexNormals();
      return g;
    };
    const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

    // EGLE: skuju zaru virpuļi, nokareni uz leju, kas īsāki uz augšu
    const spruceF = foliage();
    {
      const center = v3(0, 3.6, 0), radii = v3(2.2, 3.8, 2.2);
      const whorls = 12;
      for (let i = 0; i < whorls; i++) {
        const t = i / (whorls - 1);
        const y = 0.9 + t * 6.0;
        const L = 0.35 + 2.0 * Math.pow(1 - t, 0.95);
        const n = t > 0.8 ? 4 : 6;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + i * 0.9 + gr() * 0.4;
          const droop = 0.35 + 0.35 * (1 - t) + gr() * 0.15;
          for (const roll of [0.45, -0.45]) {
            // kartiņa guļ horizontāli (x = garums uz āru), tad noliecas un pagriežas
            M.identity();
            const m1 = new THREE.Matrix4().makeRotationX(-Math.PI / 2 + roll);
            const m0 = new THREE.Matrix4().makeTranslation(L / 2, 0, 0);
            const m2 = new THREE.Matrix4().makeRotationZ(-droop);
            const m3 = new THREE.Matrix4().makeRotationY(a);
            const m4 = new THREE.Matrix4().makeTranslation(0, y, 0);
            M.multiply(m4).multiply(m3).multiply(m2).multiply(m0).multiply(m1);
            addCard(spruceF, L, L * 0.55, M, center, radii, 1);
          }
        }
      }
      // galotne
      for (let k = 0; k < 3; k++) {
        M.makeRotationY(k * Math.PI / 3).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).setPosition(0, 7.1, 0);
        addCard(spruceF, 1.5, 0.8, M, center, radii, 1);
      }
    }
    const spruceG = toGeo(spruceF);

    // PRIEDE: augsts kails stumbrs, skuju pušķi galotnē
    const pineBranches = [], pineParts = [];
    const pineClumps = [[0, 7.4, 0, 1.5], [1.1, 6.6, 0.4, 1.2], [-1.0, 6.3, -0.5, 1.2], [0.3, 5.7, -1.1, 1.1], [-0.4, 6.9, 0.9, 1.0]];
    for (const [x, y, z, s] of pineClumps) {
      if (x || z) pineBranches.push(branch(v3(0, y - 0.9, 0), v3(x * 0.9, y, z * 0.9), 0.07, 0.03));
      pineParts.push(leafCloud(7, v3(x, y, z), v3(s * 0.9, s * 0.45, s * 0.9), s * 1.25));
    }
    const pineG = mergeGeometries(pineParts);
    {
      // pārrēķina normāles no kopējā vainaga centra, lai viss vainags ēnojas vienoti
      const p = pineG.attributes.position, nn = pineG.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        N.set(p.getX(i) / 1.8, (p.getY(i) - 6.6) / 1.0, p.getZ(i) / 1.8).normalize(); N.y += 0.35; N.normalize();
        nn.setXYZ(i, N.x, N.y, N.z);
      }
    }
    // BĒRZS: slaids balts stumbrs, nokarena gaiša lapotne
    const birchBranches = [
      branch(v3(0, 3.0, 0), v3(0.9, 4.6, 0.3), 0.06, 0.025), branch(v3(0, 3.6, 0), v3(-0.8, 5.0, -0.4), 0.05, 0.02),
      branch(v3(0, 4.2, 0), v3(0.2, 5.6, -0.9), 0.05, 0.02),
    ];
    const birchG = leafCloud(30, v3(0, 4.9, 0), v3(1.5, 2.1, 1.5), 1.35);
    // OZOLS: resns stumbrs, plats kupls vainags
    const oakBranches = [
      branch(v3(0, 2.4, 0), v3(1.8, 3.8, 0.5), 0.2, 0.08), branch(v3(0, 2.6, 0), v3(-1.6, 3.9, -0.7), 0.18, 0.07),
      branch(v3(0, 2.8, 0), v3(0.3, 4.4, -1.6), 0.16, 0.06), branch(v3(0, 3.0, 0), v3(-0.3, 4.8, 1.4), 0.15, 0.06),
    ];
    const oakG = leafCloud(40, v3(0, 4.5, 0), v3(2.7, 1.9, 2.7), 1.9);
    const bushG = leafCloud(12, v3(0, 0.55, 0), v3(0.95, 0.55, 0.95), 0.9);

    const bark = canvasTexture(64, 256, (g, w, h) => {
      g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 500; i++) { const l = 90 + Math.random() * 150; g.fillStyle = `rgb(${l},${l},${l})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 5 + Math.random() * 20); }
      for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(30,30,30,0.5)'; g.fillRect(Math.random() * w, Math.random() * h, 1, 10 + Math.random() * 30); }
    });
    bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
    const birchBark = canvasTexture(64, 256, (g, w, h) => {
      g.fillStyle = '#e6e3d8'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { const l = 200 + Math.random() * 55; g.fillStyle = `rgb(${l},${l},${l - 8})`; g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 10, 1); }
      for (let i = 0; i < 55; i++) { g.fillStyle = `rgba(25,22,20,${0.6 + Math.random() * 0.35})`; g.fillRect(Math.random() * w, Math.random() * h, 4 + Math.random() * 20, 1 + Math.random() * 3); }
      const grd = g.createLinearGradient(0, h * 0.75, 0, h); grd.addColorStop(0, 'rgba(40,35,30,0)'); grd.addColorStop(1, 'rgba(40,35,30,0.85)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    const barkM = (color, map) => { const m = new THREE.MeshStandardMaterial({ color, map, roughness: 1 }); return natureMaterial(m, { wind: 0.002 }); };
    bark.repeat.set(2, 2);
    const foliageM = (tex, { wind = 0.012, ...opts } = {}) => natureMaterial(new THREE.MeshStandardMaterial({
      map: tex, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, ...opts,
    }), { wind, flutter: 0.025, keepNormals: true, translucent: 0.12 });
    const spruceTex = spruceTexture(), pineTex = pineTexture();
    const types = [
      ['egle', trunkWith(6.6, 0.28, 0.06, []), barkM('#6a5442', bark), spruceG, foliageM(spruceTex, { color: '#c8d8c0', wind: 0.008 })],
      ['priede', trunkWith(7.2, 0.26, 0.1, pineBranches), barkM('#b07a52', bark), pineG, foliageM(pineTex, { color: '#d0dcc0' })],
      ['berzs', trunkWith(6.0, 0.18, 0.05, birchBranches), barkM('#ffffff', birchBark), birchG, foliageM(leafTexture('berzs'), { wind: 0.016 })],
      ['ozols', trunkWith(3.4, 0.5, 0.3, oakBranches), barkM('#7a6656', bark), oakG, foliageM(leafTexture('ozols'))],
    ];
    const dummy = new THREE.Object3D();
    const tc = new THREE.Color();
    const place = (d, y0 = 0) => {
      dummy.position.set(d.x, d.y - 0.15 + y0, d.z);
      dummy.rotation.set(d.tilt || 0, d.ry, (d.tilt || 0) * 0.7);
      dummy.scale.set(d.s, d.s * (0.92 + ((d.ry * 7.3) % 1) * 0.16), d.s);
    };
    const tint = (d) => { const v = (d.ry * 13.7) % 1; return tc.setRGB(0.88 + v * 0.18, 0.9 + v * 0.14, 0.86 + ((d.ry * 3.1) % 1) * 0.16); };
    const im = (geo, material, list, shadow) => {
      const m = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((d, i) => { place(d); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, tint(d)); });
      m.castShadow = shadow; m.receiveShadow = true; m.computeBoundingSphere();
      this.group.add(m);
      return m;
    };
    // tālajiem kokiem: iepriekš uzzīmēti attēli (impostori) — 4 trijstūri uz koku
    const atlas = this.renderer ? this.makeImpostorAtlas(types) : null;
    const quad = (() => {
      const parts = [0, Math.PI / 2].map((a) => { const q = new THREE.PlaneGeometry(1, 1); q.translate(0, 0.5, 0); q.rotateY(a); return q; });
      const g = mergeGeometries(parts);
      const p = g.attributes.position, nn = g.attributes.normal;
      for (let i = 0; i < p.count; i++) { N.set(p.getX(i) * 1.4, 0.55 + p.getY(i) * 0.3, p.getZ(i) * 1.4).normalize(); nn.setXYZ(i, N.x, N.y, N.z); }
      return g;
    })();
    let impM = null;
    if (atlas) {
      impM = new THREE.MeshStandardMaterial({ map: atlas.tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
      impM.onBeforeCompile = (sh) => {
        sh.vertexShader = 'attribute float aSpecies;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv.x = (vMapUv.x + aSpecies) * 0.25;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace(/normal\s*\*=\s*faceDirection;/g, ''));
      };
      impM.customProgramCacheKey = () => 'impostor';
    }
    // grupējam pa apgabaliem: tuvumā pilni koki, tālumā impostori
    this.lodChunks = this.lodChunks || new Map();
    const chunkOf = (d) => {
      const kx = Math.floor(d.x / LOD_CH), kz = Math.floor(d.z / LOD_CH), key = kx + ',' + kz;
      if (!this.lodChunks.has(key)) this.lodChunks.set(key, { cx: (kx + 0.5) * LOD_CH, cz: (kz + 0.5) * LOD_CH, hi: [], lo: [] });
      return this.lodChunks.get(key);
    };
    const buckets = new Map();
    const kinds = ['egle', 'priede', 'berzs', 'ozols'];
    for (const k of [...kinds, 'bush']) for (const d of lists[k]) {
      const ch = chunkOf(d);
      if (!buckets.has(ch)) buckets.set(ch, { egle: [], priede: [], berzs: [], ozols: [], bush: [] });
      buckets.get(ch)[k].push(d);
    }
    const bushM = foliageM(leafTexture('bush'), { wind: 0.03 });
    for (const [ch, b] of buckets) {
      for (const [k, tg, tm, cg, cm] of types) {
        if (!b[k].length) continue;
        ch.hi.push(im(tg, tm, b[k], true), im(cg, cm, b[k], true));
      }
      if (b.bush.length) ch.hi.push(im(bushG, bushM, b.bush, false));
      if (atlas) {
        const all = [];
        kinds.forEach((k, si) => b[k].forEach((d) => all.push([d, si])));
        if (!all.length) continue;
        const g = quad.clone();
        const sp = new Float32Array(all.length);
        const m = new THREE.InstancedMesh(g, impM, all.length);
        all.forEach(([d, si], i) => {
          const A = atlas.dims[si];
          place(d, A.y0 * d.s);
          dummy.scale.set(A.w * d.s, A.h * dummy.scale.y, A.w * d.s);
          dummy.rotation.x = 0; dummy.rotation.z = 0;
          dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, tint(d));
          sp[i] = si;
        });
        g.setAttribute('aSpecies', new THREE.InstancedBufferAttribute(sp, 1));
        m.computeBoundingSphere();
        m.receiveShadow = true;
        m.visible = false;
        this.group.add(m);
        ch.lo.push(m);
      }
    }
  }

  // Uzzīmē katru koka veidu no sāniem tekstūrā (4 kolonnas), ko izmanto tālajiem kokiem
  makeImpostorAtlas(types) {
    const r = this.renderer, CW = 256, CHh = 512;
    const rt = new THREE.WebGLRenderTarget(CW * 4, CHh, { minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true });
    this.impostorRT = rt;
    const scene = new THREE.Scene();
    const prevTarget = r.getRenderTarget(), prevColor = new THREE.Color(), prevAlpha = r.getClearAlpha(), prevAuto = r.autoClear;
    r.getClearColor(prevColor);
    r.setClearColor('#3d5a2c', 0);
    r.setRenderTarget(rt); r.clear();
    r.autoClear = false;
    const dims = [];
    types.forEach(([, tg, tm, cg, cm], i) => {
      scene.clear();
      const trunk = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ map: tm.map, color: tm.color.clone().multiplyScalar(0.75) }));
      const fol = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ map: cm.map, color: cm.color, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide }));
      scene.add(trunk, fol);
      const bb = new THREE.Box3().setFromObject(scene);
      const w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z, (bb.max.y - bb.min.y) / 2) * 1.04;
      const cam = new THREE.OrthographicCamera(-w / 2, w / 2, bb.min.y + w * 2, bb.min.y, 0.1, 100);
      cam.position.set(0, 0, 30); cam.lookAt(0, 0, 0);
      cam.top = bb.min.y + w * 2; cam.bottom = bb.min.y; cam.updateProjectionMatrix();
      rt.viewport.set(i * CW, 0, CW, CHh); rt.scissor.set(i * CW, 0, CW, CHh); rt.scissorTest = true;
      r.setRenderTarget(rt);
      r.render(scene, cam);
      dims.push({ w, h: w * 2, y0: bb.min.y });
      trunk.material.dispose(); fol.material.dispose();
    });
    rt.scissorTest = false; rt.viewport.set(0, 0, CW * 4, CHh);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevAlpha);
    r.autoClear = prevAuto;
    return { tex: rt.texture, dims };
  }

  // Redzamība pēc attāluma: tuvu pilni koki, tālu impostori; sīkas detaļas tikai tuvumā
  updateVisibility(x, z) {
    if (this.lodChunks) for (const ch of this.lodChunks.values()) {
      const d = Math.hypot(ch.cx - x, ch.cz - z);
      const far = Math.min(400, (this.farCull || 450) + 40);
      const near = d < (this.treeNear || 100) || !ch.lo.length;
      for (const m of ch.hi) m.visible = near && d < far;
      for (const m of ch.lo) m.visible = !near && d < far;
    }
    const ds = this.detailScale || 1;
    if (this.distCull) for (const c of this.distCull) c.mesh.visible = Math.hypot(c.cx - x, c.cz - z) < c.max * ds;
  }

  // Instanču saraksts sadalīts apgabalos, katrs redzams tikai līdz attālumam max
  chunked(geo, material, list, setup, max, opts = {}) {
    this.distCull = this.distCull || [];
    const chunks = new Map();
    for (const d of list) {
      const key = Math.floor(d.x / LOD_CH) + ',' + Math.floor(d.z / LOD_CH);
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(d);
    }
    const out = [];
    for (const [key, items] of chunks) {
      const [kx, kz] = key.split(',').map(Number);
      const m = new THREE.InstancedMesh(geo, material, items.length);
      items.forEach((d, i) => setup(m, d, i));
      m.castShadow = !!opts.castShadow; m.receiveShadow = opts.receiveShadow !== false;
      if (opts.layer) m.layers.set(opts.layer); // 1. slānis: sīkumi, ko nezīmē ūdens atspulgā
      m.computeBoundingSphere();
      this.group.add(m);
      this.distCull.push({ mesh: m, cx: (kx + 0.5) * LOD_CH, cz: (kz + 0.5) * LOD_CH, max: max + LOD_CH * 0.7 });
      out.push(m);
    }
    return out;
  }

  buildRocksAndFlowers() {
    const rnd = mulberry32(this.seed + 99);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const rocks = [];
    for (let i = 0; i < 24000 && rocks.length < 500; i++) {
      const x = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 5), z = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 5);
      const r = Math.hypot(x, z);
      if (sqDist(x, z) > PLAY_RADIUS - 8 || r < 38) continue;
      const h = this.getHeight(x, z);
      if (h < 0.3) continue;
      if (this.trackDist(x, z) < TRACK_WIDTH / 2 + 4 || this.roadDist(x, z).d < 4 || inPlace(this, x, z)) continue;
      if (rnd() > (h > 10 ? 0.5 : 0.12)) continue;
      const s = 0.35 + rnd() * rnd() * 1.6;
      rocks.push({ x, y: h - s * 0.12, z, s, ry: rnd() * 6, c: 0.8 + rnd() * 0.3 });
      if (s > 0.7) this.addCollider(x, z, s * 0.85);
    }
    // akmens: noapaļots laukakmens ar sūnām augšpusē
    const rg = new THREE.IcosahedronGeometry(1, 2);
    const rn = makeNoise2D(this.seed + 4);
    const rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
      const k = 1 + rn(x * 1.1 + z * 0.7, y * 1.1) * 0.2 + rn(x * 3.1 - z, y * 3.1 + z) * 0.06;
      rp.setXYZ(i, x * k, Math.max(-0.3, y * k * 0.62), z * k);
    }
    rg.computeVertexNormals();
    const rc = new Float32Array(rp.count * 3), moss = new THREE.Color('#5d6e34'), stone = new THREE.Color('#8d8a82');
    const rnrm = rg.attributes.normal;
    for (let i = 0; i < rp.count; i++) {
      col.copy(stone).multiplyScalar(0.85 + rn(rp.getX(i) * 4, rp.getZ(i) * 4) * 0.15);
      const up = rnrm.getY(i);
      if (up > 0.55) col.lerp(moss, Math.min(0.8, (up - 0.55) * 2.2 * (0.6 + 0.4 * rn(rp.getX(i) * 2, rp.getZ(i) * 2))));
      if (rp.getY(i) < -0.15) col.multiplyScalar(0.65);
      rc[i * 3] = col.r; rc[i * 3 + 1] = col.g; rc[i * 3 + 2] = col.b;
    }
    rg.setAttribute('color', new THREE.BufferAttribute(rc, 3));
    const stoneTex = noiseTexture('stone', 128); stoneTex.repeat.set(2, 2);
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: stoneTex, roughness: 0.95 });
    (this.stoneMats = this.stoneMats || []).push(rockMat);
    this.chunked(rg, rockMat, rocks, (m, d, i) => {
      dummy.position.set(d.x, d.y, d.z); dummy.scale.set(d.s, d.s, d.s * 0.9); dummy.rotation.set(0, d.ry, 0.08);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, col.setScalar(d.c));
    }, 230, { castShadow: true, layer: 1 });

    // ---- blīva zāle ap spēlētāju: GPU to novieto pēc reljefa augstuma un krāsas tekstūrām ----
    {
      const R = 512, cell = SIZE / R;
      const hData = new Uint16Array(R * R), gData = new Uint8Array(R * R * 4);
      const gnz = makeNoise2D(this.seed + 61);
      for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
        const x = -HALF + (i + 0.5) * cell, z = -HALF + (j + 0.5) * cell;
        const h = this.getHeight(x, z);
        hData[j * R + i] = THREE.DataUtils.toHalfFloat(h);
        this.groundColor(x, z, h, col);
        col.convertLinearToSRGB();
        let dens = smoothstep(0.55, 1.1, h) * (1 - smoothstep(16, 20, h));
        dens *= smoothstep(2.0, 3.2, this.roadDist(x, z).d);
        dens *= smoothstep(TRACK_WIDTH / 2 + 0.3, TRACK_WIDTH / 2 + 1.6, this.trackDist(x, z));
        for (const gs of GARDEN_SLOTS) if (Math.abs(x - gs.x) < 3.6 && Math.abs(z - gs.z) < 4.9) dens = 0;
        if (Math.hypot(x, z) < 2.2) dens = 0;
        const f = this.forest(x, z);
        dens *= 1 - Math.min(0.6, Math.max(0, f) * 2.5);
        dens *= 0.55 + 0.45 * (gnz(x * 0.08, z * 0.08) * 0.5 + 0.5);
        const k = (j * R + i) * 4;
        gData[k] = col.r * 255; gData[k + 1] = col.g * 255; gData[k + 2] = col.b * 255; gData[k + 3] = clamp01(dens) * 255;
      }
      const hTex = new THREE.DataTexture(hData, R, R, THREE.RedFormat, THREE.HalfFloatType);
      hTex.magFilter = hTex.minFilter = THREE.LinearFilter; hTex.needsUpdate = true;
      this.heightTex = hTex;
      const gTex = new THREE.DataTexture(gData, R, R, THREE.RGBAFormat);
      this.groundTex = gTex;
      gTex.colorSpace = THREE.SRGBColorSpace;
      gTex.magFilter = gTex.minFilter = THREE.LinearFilter; gTex.needsUpdate = true;

      const COUNT = 9000, TILE = 46; // blīvumu maina grafikas līmenis (grassMesh.count)
      const quads = [];
      for (let k = 0; k < 3; k++) {
        const q = new THREE.PlaneGeometry(0.75, 0.5); q.translate(0, 0.25, 0); q.rotateY(k * Math.PI / 3);
        quads.push(q);
      }
      const tg = mergeGeometries(quads);
      const tn = tg.attributes.normal;
      for (let i = 0; i < tn.count; i++) tn.setXYZ(i, 0, 1, 0);
      const off = new Float32Array(COUNT * 4);
      const gr = mulberry32(this.seed + 62);
      for (let i = 0; i < COUNT; i++) off.set([gr() * TILE, gr() * TILE, gr() * 6.28, 0.7 + gr() * 0.7], i * 4);
      tg.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
      const gm = new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
      const U = { uCenter: { value: new THREE.Vector2() }, uHeightTex: { value: hTex }, uGroundTex: { value: gTex } };
      this.grassCenter = U.uCenter.value;
      gm.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U, { uWind: windTime });
        sh.vertexShader = `uniform float uWind; uniform vec2 uCenter; uniform sampler2D uHeightTex; uniform sampler2D uGroundTex;
          attribute vec4 aOff; varying vec3 vGrass;\n` + sh.vertexShader.replace('#include <begin_vertex>', `
          vec3 transformed = vec3(position);
          vec2 gp = aOff.xy + ${TILE.toFixed(1)} * floor((uCenter - aOff.xy) / ${TILE.toFixed(1)} + 0.5);
          vec2 tuv = (gp + ${HALF.toFixed(1)}) / ${SIZE.toFixed(1)};
          float gh = texture2D(uHeightTex, tuv).r;
          vec4 gc = texture2D(uGroundTex, tuv);
          float gd = length(gp - uCenter) / ${(TILE / 2).toFixed(1)};
          float gs = aOff.w * smoothstep(0.12, 0.45, gc.a) * (1.0 - smoothstep(0.6, 1.0, gd));
          float cs = cos(aOff.z), sn = sin(aOff.z);
          transformed.xz = mat2(cs, -sn, sn, cs) * transformed.xz;
          transformed *= vec3(gs, gs * (0.75 + 0.5 * gc.a), gs);
          float wk = position.y * 0.32;
          float ph = gp.x * 0.11 + gp.y * 0.07;
          float gust = 0.6 + 0.4 * sin(uWind * 0.35 + gp.x * 0.012);
          transformed.x += (sin(uWind * 1.6 + ph) * 0.7 + sin(uWind * 3.7 + ph * 2.7) * 0.3) * wk * gust;
          transformed.z += cos(uWind * 1.3 + ph * 1.2) * 0.45 * wk * gust;
          transformed += vec3(gp.x, gh - 0.04, gp.y);
          vGrass = gc.rgb * (1.1 + 0.25 * fract(aOff.z * 3.7));`);
        sh.fragmentShader = 'varying vec3 vGrass;\n' + sh.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vGrass;')
          .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace(/normal\s*\*=\s*faceDirection;/g, ''));
      };
      gm.customProgramCacheKey = () => 'grassfield' + COUNT;
      const gim = new THREE.InstancedMesh(tg, gm, COUNT);
      gim.frustumCulled = false;
      gim.userData.full = COUNT;
      this.grassMesh = gim;
      gim.layers.set(1);
      gim.receiveShadow = true;
      this.group.add(gim);
    }
    const flowers = [];
    const fc = ['#f4f1e8', '#f0d84a', '#8a62c0', '#c8302a', '#5a7ad8', '#f4f1e8'];
    for (let i = 0; i < 220000 && flowers.length < 2600; i++) {
      const x = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 5), z = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 5);
      const h = this.getHeight(x, z);
      if (h < 1 || h > 16) continue;
      if (this.trackDist(x, z) < TRACK_WIDTH / 2 + 1.5 || this.roadDist(x, z).d < 3) continue;
      if (x > -28.5 && x < -19.5 && Math.abs(z) < 26.5) continue;
      if (this.forest(x, z) > 0.03 || rnd() > 0.3) continue;
      flowers.push({ x, y: h + 0.2 + rnd() * 0.12, z, c: fc[Math.floor(rnd() * fc.length)] });
    }
    // ziedi: stiebrs, divas lapiņas un zieds ar 5 ziedlapām
    const fparts = [new THREE.CylinderGeometry(0.005, 0.007, 0.25, 4).translate(0, -0.125, 0).toNonIndexed()];
    for (let k = 0; k < 5; k++) {
      const pg = new THREE.CircleGeometry(0.022, 4); pg.scale(1, 0.55, 1); pg.translate(0.026, 0, 0); pg.rotateX(-Math.PI / 2 + 0.25); pg.rotateY(k / 5 * Math.PI * 2);
      fparts.push(pg.toNonIndexed());
    }
    fparts.push(new THREE.SphereGeometry(0.012, 4, 2).scale(1, 0.5, 1).translate(0, 0.004, 0).toNonIndexed());
    for (const sd of [-1, 1]) { const lg = new THREE.CircleGeometry(0.03, 3); lg.scale(0.35, 1, 1); lg.rotateZ(sd * 0.6); lg.translate(sd * 0.012, -0.17, 0); fparts.push(lg.toNonIndexed()); }
    const fg = mergeGeometries(fparts.map((g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }));
    const fcols = new Float32Array(fg.attributes.position.count * 3);
    for (let i = 0; i < fg.attributes.position.count; i++) {
      const y = fg.attributes.position.getY(i), r = Math.hypot(fg.attributes.position.getX(i), fg.attributes.position.getZ(i));
      const stem = y < -0.015, centre = !stem && r < 0.013 && y > 0.0;
      fcols.set(stem ? [0.2, 0.34, 0.1] : centre ? [1.6, 1.2, 0.1] : [1, 1, 1], i * 3);
    }
    fg.setAttribute('color', new THREE.BufferAttribute(fcols, 3));
    this.chunked(fg, natureMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), { wind: 0.3 }), flowers, (m, d, i) => {
      dummy.position.set(d.x, d.y, d.z); dummy.scale.setScalar(1.3); dummy.rotation.set(0, d.x * 7 % 6.28, 0);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, col.set(d.c));
    }, 110, { layer: 1 });

    // niedres, vilkvālītes un ūdensrozes ezeru malās
    const reeds = [], pads = [];
    for (let i = 0; i < 330000 && reeds.length < 4500; i++) {
      const x = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 5), z = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 5);
      const h = this.getHeight(x, z);
      if (h > -0.6 && h < 0.35 && this.trackDist(x, z) > TRACK_WIDTH && rnd() < 0.7) reeds.push({ x, y: Math.min(h, 0) - 0.05, z, s: 0.8 + rnd() * 0.6, ry: rnd() * 6.28, cat: rnd() < 0.25 });
      else if (h < -0.9 && h > -2.5 && pads.length < 1300 && rnd() < 0.08) pads.push({ x, z, s: 0.6 + rnd() * 0.6, ry: rnd() * 6.28, fl: rnd() < 0.2 });
    }
    const rparts = [];
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2, r = 0.05 + (k % 3) * 0.04, hh = 1.0 + (k % 4) * 0.25;
      const b = new THREE.PlaneGeometry(0.035, hh, 1, 2); b.translate(0, hh / 2, 0);
      const bp = b.attributes.position;
      for (let j = 0; j < bp.count; j++) { const y = bp.getY(j); bp.setX(j, bp.getX(j) * (1 - y / hh * 0.8)); bp.setZ(j, (y / hh) * (y / hh) * 0.18); }
      b.rotateY(a); b.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
      rparts.push(b);
    }
    const reedG = mergeGeometries(rparts);
    reedG.computeVertexNormals();
    const rcol = new Float32Array(reedG.attributes.position.count * 3);
    for (let j = 0; j < reedG.attributes.position.count; j++) { const t = Math.min(1, reedG.attributes.position.getY(j) / 1.6); rcol.set([0.25 + t * 0.35, 0.36 + t * 0.25, 0.12 + t * 0.06], j * 3); }
    reedG.setAttribute('color', new THREE.BufferAttribute(rcol, 3));
    const reedM = natureMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }), { wind: 0.08 });
    const cats = reeds.filter((d) => d.cat);
    const catG = mergeGeometries([new THREE.CylinderGeometry(0.006, 0.006, 1.5, 3).translate(0, 0.75, 0).toNonIndexed(), new THREE.CapsuleGeometry(0.035, 0.16, 2, 5).translate(0, 1.45, 0).toNonIndexed().deleteAttribute('uv')].map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g; }));
    const ccol = new Float32Array(catG.attributes.position.count * 3);
    for (let j = 0; j < catG.attributes.position.count; j++) ccol.set(catG.attributes.position.getY(j) > 1.35 ? [0.32, 0.2, 0.1] : [0.35, 0.45, 0.18], j * 3);
    catG.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
    const catM = natureMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), { wind: 0.06 });
    this.chunked(reedG, reedM, reeds, (m, d, i) => { dummy.position.set(d.x, d.y, d.z); dummy.scale.set(d.s, d.s, d.s); dummy.rotation.set(0, d.ry, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }, 150, { castShadow: true });
    this.chunked(catG, catM, cats, (m, d, i) => { dummy.position.set(d.x + 0.1, d.y, d.z); dummy.scale.setScalar(d.s); dummy.rotation.set(0.05, d.ry, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }, 150, { castShadow: true });
    // ūdensrožu lapas ar iegriezumu un daži balti ziedi
    const padShape = new THREE.Shape(); padShape.moveTo(0, 0); padShape.absarc(0, 0, 0.35, 0.25, Math.PI * 2 - 0.05, false); padShape.lineTo(0, 0);
    const padG = new THREE.ShapeGeometry(padShape, 12); padG.rotateX(-Math.PI / 2);
    this.chunked(padG, new THREE.MeshStandardMaterial({ color: '#3f6a2a', roughness: 0.4, side: THREE.DoubleSide }), pads, (m, d, i) => { dummy.position.set(d.x, WATER_Y + 0.02, d.z); dummy.scale.setScalar(d.s); dummy.rotation.set(0, d.ry, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, col.setRGB(0.8 + (i % 5) * 0.08, 0.9 + (i % 3) * 0.06, 0.8)); }, 180);
    const lilies = pads.filter((d) => d.fl);
    if (lilies.length) {
      const lparts = [];
      for (let k = 0; k < 8; k++) { const pe = new THREE.SphereGeometry(0.06, 6, 3); pe.scale(0.45, 0.25, 1); pe.translate(0, 0.03, 0.06); pe.rotateX(-0.5); pe.rotateY(k / 8 * Math.PI * 2); lparts.push(pe); }
      lparts.push(new THREE.SphereGeometry(0.025, 8, 6).translate(0, 0.05, 0));
      const lg = mergeGeometries(lparts);
      this.chunked(lg, new THREE.MeshStandardMaterial({ color: '#f6f3ea', roughness: 0.6 }), lilies, (m, d, i) => { dummy.position.set(d.x + 0.1, WATER_Y + 0.02, d.z); dummy.scale.setScalar(1.2); dummy.rotation.set(0, d.ry, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }, 140);
    }
  }

  buildClouds() {
    const rnd = mulberry32(this.seed + 5);
    this.clouds = new THREE.Group();
    // gubu mākoņi: daudz mīkstu kamolu, gaišāka augša un pelēcīgāka, plakana apakša
    const mkTex = () => canvasTexture(256, 128, (g, w, h) => {
      const puffs = [];
      for (let i = 0; i < 70; i++) {
        const x = 30 + Math.random() * 196, base = 92;
        const hump = Math.max(0, 1 - Math.abs(x - 128) / 110);
        const y = base - Math.random() * 50 * hump - 6;
        puffs.push([x, y, 10 + Math.random() * 22 * (0.4 + hump)]);
      }
      for (const [x, y, r] of puffs) {
        const grd = g.createRadialGradient(x, y - r * 0.3, 0, x, y, r);
        const shade = Math.min(1, Math.max(0, (92 - y) / 60));
        const l = 200 + shade * 55 | 0;
        grd.addColorStop(0, `rgba(${l},${l},${l + 4},0.5)`); grd.addColorStop(0.6, `rgba(${l - 10},${l - 8},${l},0.25)`); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // nogriež apakšu plakanāku
      const fade = g.createLinearGradient(0, 88, 0, 112); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 88, w, h - 88);
    });
    const texs = [mkTex(), mkTex(), mkTex()];
    for (let i = 0; i < 20; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texs[i % 3], transparent: true, depthWrite: false, fog: false, opacity: 0.92, toneMapped: false, color: '#e8ecf0' }));
      const s = 70 + rnd() * 70;
      sp.scale.set(s, s * 0.5, 1);
      const c = new THREE.Group();
      c.add(sp);
      c.position.set((rnd() - 0.5) * 420, 85 + rnd() * 35, (rnd() - 0.5) * 640);
      this.clouds.add(c);
    }
    this.group.add(this.clouds);
  }

  updateClouds(dt, cam) {
    const cx = cam ? cam.x : 0, cz = cam ? cam.z : 0;
    for (const c of this.clouds.children) {
      c.position.x += dt * 1.2;
      // mākoņi apkārt kamerai (pasaule ir liela)
      if (c.position.x - cx > 320) c.position.x -= 640; else if (c.position.x - cx < -320) c.position.x += 640;
      if (c.position.z - cz > 320) c.position.z -= 640; else if (c.position.z - cz < -320) c.position.z += 640;
    }
    this.updateWater(dt);
    this._pt = (this._pt || 0) + dt;
    updatePlaces(this, dt, this._pt);
  }

  placeMushrooms() {
    const rnd = mulberry32(this.seed + 31);
    this.mushrooms = [];
    for (let i = 0; i < 80000 && this.mushrooms.length < 170; i++) {
      const x = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 10), z = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 10);
      const tr = rnd();
      if (sqDist(x, z) > PLAY_RADIUS - 14 || Math.hypot(x, z) < 50) continue;
      const h = this.getHeight(x, z);
      if (h < 1.3 || h > 32) continue;
      if (this.forest(x, z) < 0.2) continue;
      if (this.trackDist(x, z) < TRACK_WIDTH || this.roadDist(x, z).d < 4 || inPlace(this, x, z)) continue;
      const type = tr < 0.45 ? 'baravika' : tr < 0.85 ? 'gailene' : 'musmire';
      const p = { x, z };
      this.collide(p, 0.3);
      this.mushrooms.push({ id: this.mushrooms.length, x: p.x, z: p.z, y: this.getHeight(p.x, p.z), type });
    }
  }

  placeStars() {
    const rnd = mulberry32(this.seed + 77);
    this.stars = [];
    for (let k = 0; k < 15; k++) {
      let best = null;
      for (let s = 0; s < 250; s++) {
        const a = (k + rnd()) / 15 * Math.PI * 2;
        const r = 60 + rnd() * (PLAY_RADIUS - 90);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = this.getHeight(x, z);
        if (h < 1) continue;
        if (!best || h > best.y) best = { x, z, y: h };
      }
      if (!best) best = { x: Math.cos(k) * 60, z: Math.sin(k) * 60, y: this.getHeight(Math.cos(k) * 60, Math.sin(k) * 60) };
      const p = { x: best.x, z: best.z };
      this.collide(p, 0.8);
      this.stars.push({ id: k, x: p.x, z: p.z, y: this.getHeight(p.x, p.z) + 1.3 });
    }
  }

  placeNpcHomes() {
    const rnd = mulberry32(this.seed + 55);
    const want = [
      ['stirna', 11, 12, (f, h) => f > -0.05 && f < 0.3 && h > 1.5],
      ['zakis', 10, 8, (f, h) => f < 0.05 && h > 1.5],
      ['ezis', 7, 4, (f, h) => f > 0.18 && h > 1.5],
      ['mezacuka', 6, 9, (f, h) => f > 0.18 && h > 1.5],
      ['vavere', 7, 3, (f, h) => f > 0.15 && h > 1.5],
      ['starkis', 7, 4, (f, h) => h > 0.2 && h < 1.6],
    ];
    this.npcHomes = [];
    for (const [type, count, R, ok] of want) {
      let got = 0;
      for (let i = 0; i < 30000 && got < count; i++) {
        const x = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 15), z = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 15);
        const p1 = rnd() * 6.28, p2 = rnd() * 6.28, sp = 0.6 + rnd() * 0.5;
        if (Math.hypot(x, z) < 45 || sqDist(x, z) > PLAY_RADIUS - 18) continue;
        if (this.trackDist(x, z) < TRACK_WIDTH + R) continue;
        const h = this.getHeight(x, z);
        if (!ok(this.forest(x, z), h)) continue;
        let land = true;
        if (type !== 'starkis') {
          for (let a = 0; a < 8; a++) {
            if (this.getHeight(x + Math.cos(a * 0.785) * R, z + Math.sin(a * 0.785) * R) < 0.6) { land = false; break; }
          }
        }
        if (!land) continue;
        this.npcHomes.push({ id: this.npcHomes.length, type, x, z, R, p1, p2, sp });
        got++;
      }
    }
  }
}

import * as THREE from 'three';
import { makeNoise2D, mulberry32 } from './noise.js?v=1.43.0';
import { MUSHROOMS } from './data.js?v=1.43.0';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, smoothstep, lerp, makeTextSprite, makeSignBoard, signWood, canvasTexture, natureMaterial, leafTexture, spruceTexture, pineTexture, grassTexture, noiseTexture, windTime } from './util.js?v=1.43.0';
import { optimizeRig, flattenStatic } from './characters.js?v=1.43.0';
import { ZONE_HALF, ZONES, DIRS, GROUND_Y, sqDist, clampSquare, buildBorderPosts, smoothRoad, ringRoad, RoadIndex, buildRoadMesh, ROAD_HW, FOREST, neighbour, openSides, buildTerrainFence, wood } from './zones.js?v=1.43.0';
import { buildGardenHouse, buildGreenhouse, buildGateArch, buildFingerpost, buildRoadSign, HOUSE } from './farmyard.js?v=1.43.0';
import { findPlaces, placeHeight, inPlace, buildPlaces, updatePlaces, placeBerries } from './places.js?v=1.43.0';
import { raceFrame, yardWeight, inRaceYard, inLot, buildBarriers, buildStartPad, buildRaceYard, ROAD_END } from './racetrack.js?v=1.43.0';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const SIZE = 760; // reljefs nedaudz pāri robežai (tur tas pāriet kaimiņu zemes līdzenumā)
export const SEG = 304;
export const CELL = SIZE / SEG;
export const HALF = SIZE / 2;
export const WATER_Y = 0;
export const VILLAGE_Y = 4;
export const TRACK_Y = 3;
export const PLAY_RADIUS = ZONE_HALF; // kvadrāta puse (vārds palicis no apļa laikiem)
const EDGE = PLAY_RADIUS - 12; // īpašās vietas paliek tālāk no malas
const BLEND0 = PLAY_RADIUS - 6, BLEND1 = PLAY_RADIUS + 40; // aiz robežas reljefs pāriet kaimiņu zemes līdzenumā
// foto slāņu svari aiz slēgtas robežas (tur tikai mežs): [mežs, smiltis, zeme, akmens] (pļava = atlikums)
const X_SPLAT = [0.8, 0, 0, 0];
const LAND_MODE = { c: 'farm', e: 'forest', w: 'race' };
const LOD_CH = 80; // apgabala izmērs detalizācijas līmeņiem
export const TRACK_WIDTH = 12;
export const TRACK_N = 800;

// sacīkšu trase rietumu zemē (~1,6 km aplis) un divi tuneļi (trases punktu indeksi)
const TRACK_PTS = [
  [150, 40], [148, -60], [120, -150], [40, -200], [-50, -170], [-90, -100], [-160, -120], [-240, -90], [-200, -10],
  [-130, 10], [-150, 90], [-220, 140], [-180, 220], [-80, 230], [-20, 160], [40, 200], [120, 190], [160, 130],
];
const TUNNELS = [[60, 125], [505, 560]];
export const TUN_W = 9.4;       // tuneļa sienas attālums no trases vidus
const TUN_WALL = 4.2, TUN_TOP = 7.8, TUN_H = 9.5, TUN_CUT = 12.6;

// trases līnija un tās apkārtnes rāmis bez zemes būvēšanas (vajag arī autobusa maršrutam, pirms trases zeme ielādēta)
// RACE_RING — autobusa apgriešanās loks ceļa galā pie stāvlaukuma (l — no trases uz austrumiem, a — gar trasi)
export const RACE_RING = { l: 63, a: 0, r: 13 };
let raceGeoC = null;
export function raceGeo() {
  if (raceGeoC) return raceGeoC;
  const curve = new THREE.CatmullRomCurve3(TRACK_PTS.map(([x, z]) => new THREE.Vector3(x, TRACK_Y, z)), true, 'centripetal');
  const sp = curve.getSpacedPoints(TRACK_N);
  sp.pop();
  sp.forEach((p, i) => { p.i = i; });
  const tan = sp.map((p, i) => {
    const a = sp[(i - 1 + TRACK_N) % TRACK_N], b = sp[(i + 1) % TRACK_N];
    return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  });
  const F = raceFrame(sp, tan, 30);
  const C = F.toW(RACE_RING.l, RACE_RING.a), R = RACE_RING.r;
  const east = F.toW(RACE_RING.l + R, RACE_RING.a), e2 = F.toW(RACE_RING.l + R + 14, RACE_RING.a);
  const west = F.toW(RACE_RING.l - R, RACE_RING.a), re = F.toW(ROAD_END.l - 3, ROAD_END.a);
  const main = [[380, 0], [318, 0], [285, 0], [245, 1], [e2.x, e2.z], [east.x, east.z]];
  const ring = { x: C.x, z: C.z, r: R, east, west };
  const roads = [main, ringRoad(C.x, C.z, R, 3), [[west.x, west.z], [re.x, re.z]]];
  return (raceGeoC = { curve, sp, tan, len: curve.getLength(), F, ring, roads, main });
}

// grants ceļi (katras robežas vidū — tur turpinās kaimiņu zemes ceļš)
// meža ciemata tirgus: apļveida ceļš ap tirgus laukumu (autobuss to apbrauc un brauc atpakaļ pa to pašu ceļu)
export const FOREST_RING = { x: 0, z: 0, r: 26 };
const ROADS = {
  forest: [
    [[-26, 0], [-40, 2], [-80, -6], [-130, -14], [-210, 10], [-260, 0], [-285, 0], [-318, 0], [-380, 0]], // no ciemata uz rietumiem (sētu)
    ringRoad(FOREST_RING.x, FOREST_RING.z, FOREST_RING.r, 3),
  ],
  farm: null, // līkumoti ceļi — pēc roadNS / roadEW (zemāk)
  race: null, // pēc kartinga vietas (raceGeo)
};
export const FOREST_ROAD = ROADS.forest[0]; // autobusa maršrutam (bus.js)
// mašīnas stāvvieta meža ciemata malā un sētas pagalmā
// velosipēdu statīvs meža ciemata rietumu malā (pie ceļa uz sētu)
export const BIKE_RACK = { x: -19, z: -2 };
export const CAR_SPOT = { x: 46, z: 40, heading: 0.9 };
export const FARM_CAR = { x: -10, z: 6, heading: Math.PI / 2 };

// ---------- sēta: 4 spēlētāju sētas krustojuma stūros ----------
// Katrā stūrī iežogota sēta (YARD_IN..YARD_OUT m no abiem ceļiem): dārzs 20×20 lauciņi (TILE 2,5 m — 50×50 m),
// dārza mājiņa, siltumnīca un pagalms ar rotājumiem. Ceļi centrā ir taisni, tāpēc dārzi ir kvadrāti, paralēli ceļiem.
export const YARD_IN = 9, YARD_OUT = 81, TILE = 2.5;
export const PLOT_IN = YARD_IN, PLOT_OUT = YARD_OUT; // vecie nosaukumi
export const GARDEN_T = [-25, -6]; // dārza lauciņi 0. sētā: ix un iz no −25 līdz −6 (20 × 20)
// sētas ceļu līkumi: ziemeļu–dienvidu ceļš x = roadNS(z), rietumu–austrumu ceļš z = roadEW(x)
// (līdz ~95 m no centra taisni, tālāk līkumoti; centrā un robežu vidū 0 — tur ceļi satiekas ar kaimiņu zemju ceļiem)
const SW = Math.PI / ZONE_HALF;
export const roadNS = (z) => (Math.abs(z) >= ZONE_HALF ? 0 : (30 * Math.sin(SW * z) + 12 * Math.sin(2 * SW * z)) * smoothstep(95, 150, Math.abs(z)));
// roadEW(x) = −roadNS(x): sēta ir simetriska pret 90° pagriezienu — visas 4 sētas ir vienādas (pagrieztas),
// tāpēc katra spēlētāja dārzu glabā „0. sētas” koordinātēs un var parādīt jebkurā sētā
export const roadEW = (x) => -roadNS(x);
{
  const ns = [[0, -380], [0, -318]], ew = [[-380, 0], [-318, 0]];
  for (let t = -300; t <= 300; t += 25) { ns.push([roadNS(t), t]); ew.push([t, roadEW(t)]); }
  ns.push([0, 318], [0, 380]); ew.push([318, 0], [380, 0]);
  ROADS.farm = [ns, ew];
}
export const plotSign = (slot) => [slot % 2 ? 1 : -1, slot < 2 ? -1 : 1];
// cik reizes 0. sēta jāpagriež par 90° (x,z → −z,x), lai iegūtu sētu slot; objekta pagrieziens ap Y: −k·π/2
export const PLOT_ROT = [0, 1, 3, 2];
export function rotPlot(x, z, slot) { for (let k = PLOT_ROT[slot]; k > 0; k--) [x, z] = [-z, x]; return [x, z]; }
export const rotPlotY = (slot) => -PLOT_ROT[slot] * Math.PI / 2;
// lauciņu režģis: 0. sētas (kanoniskās) koordinātes ↔ sētas slot koordinātes
export function tileToSlot(ix, iz, slot) { for (let k = PLOT_ROT[slot]; k > 0; k--) [ix, iz] = [-1 - iz, ix]; return [ix, iz]; }
export function tileToCanon(ix, iz, slot) { for (let k = PLOT_ROT[slot]; k > 0; k--) [ix, iz] = [iz, -1 - ix]; return [ix, iz]; }
export const gardenTile = (a, b) => a >= GARDEN_T[0] && a <= GARDEN_T[1] && b >= GARDEN_T[0] && b <= GARDEN_T[1];
// 0. sētas plāns (x, z < 0): mājas vieta ar rotājumiem aizmugurē, mājiņa un siltumnīca sānos (durvis pret dārzu, +x),
// vārti abos ceļa pusēs (a — attālums no ceļa līdz vārtu vidum)
export const YARD = { home: { x: -37, z: -72 }, house: { x: -72, z: -22 }, green: { x: -72, z: -49 }, gateA: 37.5 };
export const GARDEN_SLOTS = [0, 1, 2, 3].map((s) => { const [x, z] = rotPlot(YARD.home.x, YARD.home.z, s); return { x, z }; });
// kurā sētā (iežogotajā teritorijā) ir punkts (-1 — nevienā)
export function plotOf(x, z) {
  const a = Math.abs(x), b = Math.abs(z);
  if (a < YARD_IN || b < YARD_IN || a > YARD_OUT || b > YARD_OUT) return -1;
  return (x > 0 ? 1 : 0) + (z > 0 ? 2 : 0);
}
// cik tālu ārpus sētu kvadrāta (0 — iekšā vai starp sētām pie krustojuma)
const yardOut = (x, z) => Math.hypot(Math.max(0, Math.abs(x) - YARD_OUT), Math.max(0, Math.abs(z) - YARD_OUT));
// kas sētā ir šajā punktā: 'house' | 'green' | 'garden' | 'yard' | null (ārpus sētām) — kartei un zālei
export function yardPart(x, z) {
  const s = plotOf(x, z);
  if (s < 0) return null;
  for (let k = PLOT_ROT[s]; k > 0; k--) [x, z] = [z, -x]; // atpakaļ uz 0. sētu
  if (Math.abs(x - YARD.house.x) < 3.3 && Math.abs(z - YARD.house.z) < 2.8) return 'house';
  if (Math.abs(x - YARD.green.x) < 3.2 && Math.abs(z - YARD.green.z) < 5.7) return 'green';
  if (gardenTile(Math.floor(x / TILE), Math.floor(z / TILE))) return 'garden';
  return 'yard';
}
export const inYardBuilding = (x, z) => { const p = yardPart(x, z); return p === 'house' || p === 'green'; };
// vārtu zīmju vietas sētai slot: [{x, z, ry}] (dēlis karājas vārtu arkā)
export function gateSpots(slot) {
  return [[-YARD.gateA, -YARD_IN, 0], [-YARD_IN, -YARD.gateA, Math.PI / 2]].map(([x, z, ry]) => {
    const [px, pz] = rotPlot(x, z, slot);
    return { x: px, z: pz, ry: ry + rotPlotY(slot) };
  });
}

// tirgus: 5 tirgotāju būdas aplī ap aku (ang — leņķis atan2(z, x) grādos), skatās uz laukuma vidu.
// Rietumos (180°) — ieeja no ceļa un velosipēdu statīvs, dienvidos (90°) — autobusa pietura
export const PLAZA_R = 19; // bruģētā laukuma rādiuss
const STALL_R = 15.5;
export const VENDORS = [
  { id: 'seeds', name: 'Ūdrs Ojārs', title: '🌱 Sēklas', ang: -90, animal: 'udrs', fur: '#6b4a2e', shirt: '#2fa84f', cart: '#3c9a4a' },
  { id: 'buyer', name: 'Āpsis Arnolds', title: '🧺 Uzpērku', ang: -30, animal: 'apsis', fur: '#7d7d7d', shirt: '#2f6fd6', cart: '#2f6fd6' },
  { id: 'hats', name: 'Pūce Paula', title: '🎩 Drēbes', ang: 30, animal: 'puce', fur: '#9a7348', shirt: '#9b3bd2', cart: '#b04ad2' },
  { id: 'pets', name: 'Suns Sprīdis', title: '🐾 Mājdzīvnieki', ang: -150, animal: 'suns', fur: '#c89b5e', shirt: '#f07b2a', cart: '#e0902a' },
  { id: 'decor', name: 'Lapsa Liene', title: '🏡 Dārzam', ang: 150, animal: 'lapsa', fur: '#e8742a', shirt: '#2fa84f', cart: '#3a9a9a' },
].map((v) => { const a = v.ang * Math.PI / 180; return { ...v, x: Math.cos(a) * STALL_R, z: Math.sin(a) * STALL_R }; });

export const SPAWN = { x: 5, z: 5 };

// Pasaule ar reljefu. zone: 'e' — mežs ar ciematu, tirgu, dzīvniekiem un īpašām vietām; 'c' — sēta ar 4 laukiem;
// 'w' — sacīkšu trase ar tuneļiem. Visām kopīgs reljefs, koki, zāle, ceļi un robežas.
// reljefa gabala detalizācijas līmeņi: [pilns režģis, 2× retāks]; abiem gar malām „svārki” (paslēpj spraugas starp līmeņiem).
// Virsotnes kopīgas, atšķiras tikai indeksi.
const TERR_LOD = 110;
function terrainLods(geo, TS) {
  const W = TS + 1, n0 = W * W, ring = [];
  for (let a = 0; a < W; a++) ring.push([a, 0]);
  for (let b = 1; b < W; b++) ring.push([TS, b]);
  for (let a = TS - 1; a >= 0; a--) ring.push([a, TS]);
  for (let b = TS - 1; b > 0; b--) ring.push([0, b]);
  // svārku virsotnes: malas virsotņu kopijas 2,5 m zemāk
  for (const name of Object.keys(geo.attributes)) {
    const A = geo.attributes[name], k = A.itemSize, src = A.array, dst = new Float32Array((n0 + ring.length) * k);
    dst.set(src.subarray(0, n0 * k));
    ring.forEach(([a, b], j) => { for (let c = 0; c < k; c++) dst[(n0 + j) * k + c] = src[(b * W + a) * k + c]; if (name === 'position') dst[(n0 + j) * 3 + 1] -= 2.5; });
    geo.setAttribute(name, new THREE.BufferAttribute(dst, k));
  }
  const skirtOf = new Map(ring.map(([a, b], j) => [b * W + a, n0 + j]));
  const make = (st) => {
    const idx = [];
    for (let b = 0; b < TS; b += st) for (let a = 0; a < TS; a += st) {
      const i0 = b * W + a, i1 = i0 + st, i2 = i0 + st * W, i3 = i2 + st;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
    const edge = []; // mala ar soli st
    for (let a = 0; a < TS; a += st) edge.push([a, 0, a + st, 0], [a, TS, a + st, TS]);
    for (let b = 0; b < TS; b += st) edge.push([0, b, 0, b + st], [TS, b, TS, b + st]);
    for (const [a0, b0, a1, b1] of edge) {
      const p = b0 * W + a0, q = b1 * W + a1, ps = skirtOf.get(p), qs = skirtOf.get(q);
      idx.push(p, ps, q, q, ps, qs, p, q, ps, q, qs, ps); // abas puses
    }
    const g = new THREE.BufferGeometry();
    for (const name of Object.keys(geo.attributes)) g.setAttribute(name, geo.attributes[name]);
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  };
  const lods = [make(1), make(2)];
  geo.dispose();
  return lods;
}

export class World {
  constructor(seed, zone = FOREST) {
    this.zone = zone;
    this.mode = LAND_MODE[zone] || 'forest';
    this.isWorld = true;
    this.open = openSides(zone);
    this.cleared = new Set(); // nocirsti koki / novākti akmeņi (sētas laukos)
    this.seed = seed;
    this.noise = makeNoise2D(seed);
    this.noise2 = makeNoise2D(seed + 1);
    this.rnd = mulberry32(seed + 7);
    this.group = new THREE.Group();
    this.grid = new Map();
    if (this.mode === 'race') this.buildTrackCurve();
    this.buildRoads();
    this.places = [];
    this.platforms = [];
    if (this.mode === 'forest') findPlaces(this, EDGE);
    this.computeHeights();
    if (this.mode === 'farm') this.placePlotObjects();
  }

  // ---------- trase ----------
  buildTrackCurve() {
    const RG = raceGeo();
    this.trackCurve = RG.curve;
    const sp = RG.sp;
    this.trackPts = sp;
    this.trackLen = RG.len;
    this.trackTan = RG.tan;
    this.trackIdx = new RoadIndex([sp], 20, 3); // attālums līdz trasei (precīzs līdz 60 m)
    // cik metrus aiz tuneļa (gar trasi) ir katrs trases punkts (0 — tunelī)
    const step = this.trackLen / TRACK_N;
    this.tunnels = TUNNELS;
    this.tunOut = new Float32Array(TRACK_N).fill(999);
    for (const [a, b] of TUNNELS) for (let i = 0; i < TRACK_N; i++) {
      const da = Math.min(((a - i) % TRACK_N + TRACK_N) % TRACK_N, ((i - a) % TRACK_N + TRACK_N) % TRACK_N);
      const db = Math.min(((b - i) % TRACK_N + TRACK_N) % TRACK_N, ((i - b) % TRACK_N + TRACK_N) % TRACK_N);
      const inside = i >= a && i <= b;
      this.tunOut[i] = Math.min(this.tunOut[i], inside ? 0 : Math.min(da, db) * step);
    }
    // kartinga stāvvieta trases austrumu pusē (tur ienāk ceļš no sētas)
    const k = 30, pk = sp[k], tk = this.trackTan[k], o = TRACK_WIDTH / 2 + 6;
    const a1 = { x: pk.x + tk.z * o, z: pk.z - tk.x * o }, a2 = { x: pk.x - tk.z * o, z: pk.z + tk.x * o };
    this.kartSpot = { ...(a1.x > a2.x ? a1 : a2), heading: Math.atan2(tk.x, tk.z) };
    this.carSpot = { x: this.kartSpot.x + 10, z: this.kartSpot.z + 6, heading: Math.PI / 2 };
    // trases apkārtnes rāmis (stāvlaukums, starta laukums, pjedestāls — racetrack.js); ceļš no sētas beidzas stāvlaukumā
    this.raceF = RG.F;
    ROADS.race = RG.roads;
  }

  trackDist(x, z) {
    return this.trackIdx ? this.trackIdx.near(x, z).d : 999;
  }

  // tuneļa informācija tuvākajā trases punktā: d — attālums līdz trases vidum, e — metri līdz tunelim gar trasi
  tunnelInfo(x, z) {
    if (!this.trackIdx) return null;
    const q = this.trackIdx.near(x, z);
    if (!q.p) return null;
    return { d: q.d, e: this.tunOut[q.p.i], p: q.p };
  }

  // pakalns virs tuneļa (augstums virs trases); tuneļa koridorā — 0 (tur ir tunelis), pie ieejām — ierakums
  hillAt(x, z) {
    const t = this.tunnelInfo(x, z);
    if (!t || t.e > 40 || t.d > 58) return 0;
    const cw = TUN_CUT + t.e * 0.9;
    return TUN_H * (1 - smoothstep(0, 38, t.e)) * (1 - smoothstep(14, 58, t.d)) * smoothstep(cw, cw + 1.5 + t.e * 0.5, t.d);
  }

  // tuneļa jumta virsma (l — attālums no trases vidus); malās iegrimst zemē, lai nebūtu šuves
  roofAt(l) { return TRACK_Y + TUN_H * (1 - smoothstep(14, 58, l)) - Math.max(0, l - 13.8) * 0.6; }
  // tuneļa iekšējā augstuma profils (griesti)
  archAt(l) {
    const a = Math.abs(l);
    if (a >= TUN_W) return TUN_WALL;
    return TUN_WALL + (TUN_TOP - TUN_WALL) * Math.sqrt(Math.max(0, 1 - (a / TUN_W) ** 2));
  }
  // vai punkts ir tuneļa iekšpusē (zem jumta)
  inTunnel(x, z) {
    const t = this.tunnelInfo(x, z);
    return t && t.e === 0 && t.d < 14 ? t : null;
  }
  // kameras griesti tunelī (citur — bezgalība)
  ceilingAt(x, z) {
    const t = this.inTunnel(x, z);
    return t && t.d < TUN_W ? TRACK_Y + this.archAt(t.d) - 0.5 : Infinity;
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
    this.roadLines = ROADS[this.mode].map((p) => smoothRoad(p));
    for (const l of this.roadLines) {
      let h = l.map((p) => this.baseHeight(p.x, p.z));
      for (let pass = 0; pass < 3; pass++) {
        h = h.map((_, i) => { let sum = 0, n = 0; for (let k = -12; k <= 12; k++) { const v = h[i + k]; if (v !== undefined) { sum += v; n++; } } return sum / n; });
      }
      l.forEach((p, i) => { p.h = Math.max(1.4, h[i]); });
      // trases zemē ceļš ir līdzens: no robežas lēni pāriet trases augstumā un tālāk paliek tajā
      if (this.mode === 'race') l.forEach((p) => { p.h = lerp(TRACK_Y - 0.05, p.h, smoothstep(250, 305, p.x)); });
    }
    this.roadIdx = new RoadIndex(this.roadLines);
    if (this.mode === 'race') this.roadIdxWide = new RoadIndex(this.roadLines, 22, 3); // ieleja ap ceļu (precīzs līdz 66 m)
  }

  // attālums līdz tuvākajam grants ceļam (no ceļa malas ~3 m platā joslā skaitās "uz ceļa")
  roadDist(x, z) {
    return { d: this.roadIdx.near(x, z).d - (ROAD_HW - 3), t: 0 };
  }

  forest(x, z) {
    // sētā mežs ir tikai josla gar malām (lauki — atklāta pļava)
    if (this.mode === 'farm') return sqDist(x, z) + this.noise2(x * 0.03, z * 0.03) * 8 > 274 ? 0.5 : -0.3;
    return this.noise2(x * 0.011, z * 0.011) + 0.25 * this.noise2(x * 0.05 + 9, z * 0.05 - 4);
  }

  // sētas reljefs: līdzens ar viegliem pauguriem, malās (mežā) nedaudz kalnaināks
  farmHeight(x, z) {
    const n = this.noise;
    let h = VILLAGE_Y + n(x * 0.007 + 11, z * 0.007 - 7) * 1.6 + n(x * 0.02 - 3, z * 0.02 + 8) * 0.55;
    const bump = n(x * 0.035 + 40, z * 0.035 - 12);
    if (bump > 0.35) h += (bump - 0.35) * 4;
    h += smoothstep(255, 300, sqDist(x, z)) * (1.5 + n(x * 0.012, z * 0.012) * 3);
    return h;
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
    const d = Math.hypot(x, z);
    if (this.mode === 'farm') return lerp(this.farmHeight(x, z), VILLAGE_Y, 1 - smoothstep(4, 22, yardOut(x, z))); // sētas un krustojums līdzeni
    let h = this.naturalHeight(x, z);
    if (this.mode === 'race') h += 2.6; // trasē mazāk ezeru
    if (this.mode === 'forest') return lerp(h, VILLAGE_Y, 1 - smoothstep(44, 70, d)); // ciemats ar tirgu un apli līdzens
    // trase: līdzena josla ap trasi + pakalni virs tuneļiem
    const td = this.trackDist(x, z);
    h = lerp(h, TRACK_Y - 0.05, 1 - smoothstep(TRACK_WIDTH / 2 + 3, TRACK_WIDTH / 2 + 16, td));
    const hill = this.hillAt(x, z);
    return hill > 0 ? Math.max(h, TRACK_Y - 0.05 + hill) : h;
  }

  computeHeight(x, z) {
    let h = this.baseHeight(x, z);
    const r = this.roadIdx.near(x, z);
    if (this.mode === 'race') {
      // ceļš uz trasi plašā, līdzenā ielejā (nevis pāri kalnam); stāvlaukums un starta vieta līdzeni; pakalni virs tuneļiem paliek
      const rw = this.roadIdxWide.near(x, z);
      if (rw.d < 60) h = lerp(h, rw.p.h, 1 - smoothstep(ROAD_HW + 6, 60, rw.d));
      h = lerp(h, TRACK_Y - 0.05, yardWeight(this.raceF, x, z));
      const hill = this.hillAt(x, z);
      if (hill > 0) h = Math.max(h, TRACK_Y - 0.05 + hill);
    } else if (r.d < 12) h = lerp(h, r.p.h, 1 - smoothstep(ROAD_HW + 0.8, 12, r.d));
    if (this.places.length) h = placeHeight(this, x, z, h);
    const e = sqDist(x, z);
    if (e > BLEND0) h = lerp(h, GROUND_Y, smoothstep(BLEND0, BLEND1, e));
    return h;
  }

  // aiz robežas: kuras kaimiņu zemes izskatā pāriet zeme (side = null stūros) un cik stipri (k)
  // side — kaimiņu zemes id (vai null: stūris / slēgta mala, tur mežs)
  edgeBlend(x, z) {
    const ax = Math.abs(x), az = Math.abs(z);
    const k = smoothstep(PLAY_RADIUS + 4, PLAY_RADIUS + 38, Math.max(ax, az));
    if (k <= 0) return null;
    const dir = Math.min(ax, az) > PLAY_RADIUS ? null : ax > az ? (x > 0 ? 'e' : 'w') : (z > 0 ? 's' : 'n');
    return { side: dir ? neighbour(this.zone, dir) : null, k };
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
    if (this.trackIdx && y > TRACK_Y + 5) { const t = this.inTunnel(x, z); if (t) h = Math.max(h, this.roofAt(t.d)); } // virs tuneļa — jumts
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
  addCollider(x, z, r, id) {
    const k = Math.floor(x / 8) + ',' + Math.floor(z / 8);
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push(id === undefined ? [x, z, r] : [x, z, r, id]);
  }

  collide(pos, radius) {
    const cx = Math.floor(pos.x / 8), cz = Math.floor(pos.z / 8);
    let hit = false;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this.grid.get((cx + a) + ',' + (cz + b));
      if (!list) continue;
      for (const c of list) {
        if (c[3] !== undefined && this.cleared.has(c[3])) continue; // nocirsts / novākts
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
    // tuneļa sienas (ja neesi virs tā)
    if (this.trackIdx && !(pos.y > TRACK_Y + 5)) {
      const t = this.inTunnel(pos.x, pos.z), lim = TUN_W - radius;
      if (t && t.d > lim) {
        const dx = pos.x - t.p.x, dz = pos.z - t.p.z, d = Math.hypot(dx, dz) || 1;
        pos.x = t.p.x + dx / d * lim; pos.z = t.p.z + dz / d * lim;
        hit = true;
      }
    }
    if (clampSquare(pos, this.open)) hit = true;
    return hit;
  }

  // ---------- būvēšana ----------
  build(scene, renderer = null) {
    for (const _ of this.buildSteps(scene, renderer)) { /* viss uzreiz */ }
  }

  // uzbūve pa soļiem: ielādes laikā starp soļiem pārlūks var pārzīmēt ekrānu (piem., pagriežot telefonu)
  *buildSteps(scene, renderer = null) {
    this.renderer = renderer;
    scene.add(this.group);
    const M = this.mode;
    this.buildTerrain(); yield;
    if (M !== 'farm') this.buildWater();
    if (M === 'race') {
      this.buildTrackMesh(); this.buildTunnels(); yield;
      this.barriers = buildBarriers(this, this.group);
      this.startFx = buildStartPad(this, this.group);
      buildRaceYard(this, this.group);
    }
    if (M === 'forest') { this.buildVillage(); yield; buildPlaces(this); }
    if (M === 'farm') this.buildFarmYard();
    yield;
    this.buildTrees(); yield;
    this.buildRocksAndFlowers(); yield;
    this.buildClouds();
    if (M === 'forest') {
      this.placeMushrooms();
      this.placeStars();
      this.placeNpcHomes();
      placeBerries(this, PLAY_RADIUS);
    }
    this.buildSkirt();
    const hf = (x, z) => this.getHeight(x, z);
    this.group.add(buildRoadMesh(this.roadLines, hf));
    this.group.add(buildBorderPosts(this.open, hf));
    const closed = Object.keys(DIRS).filter((d) => !this.open.includes(d));
    if (closed.length) this.group.add(buildTerrainFence(closed, hf));
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
      if (this.mode === 'farm' && plotOf(x, z) >= 0) c.lerp(P.grass2, 0.35); // lauki — gaišāka pļava
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
      const t = eb.side ? ZONES[eb.side].splat : X_SPLAT;
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
      const lods = terrainLods(geo, TS);
      const m = new THREE.Mesh(lods[0], material);
      m.position.set(ox, 0, oz);
      m.receiveShadow = true;
      m.userData.lodGeos = lods; // freeGpu atbrīvo abus
      this.group.add(m);
      this.terrainTiles.push(m);
      (this.terrLod = this.terrLod || []).push({ m, cx: ox, cz: oz, h: TW / 2, lods, k: 0 });
    }
    this.terrain = this.terrainTiles[0];
  }

  // līdzenums ap reljefu līdz horizontam kaimiņu zemju izskatā (tas pats materiāls kā reljefam — bez jaunām faktūrām)
  buildSkirt() {
    const A = HALF, B = 1600, quads = [];
    for (const side of ['n', 'e', 's', 'w', null]) {
      const rects = side === 'n' ? [[-A, -B, A, -A]] : side === 's' ? [[-A, A, A, B]] : side === 'e' ? [[A, -A, B, A]] : side === 'w' ? [[-B, -A, -A, A]]
        : [[-B, -B, -A, -A], [A, -B, B, -A], [-B, A, -A, B], [A, A, B, B]];
      const look = side ? neighbour(this.zone, side) : null;
      const col = new THREE.Color(look ? ZONES[look].ground : '#3a4f24').multiplyScalar(0.95);
      for (const r of rects) quads.push({ r, col, sp: look ? ZONES[look].splat : X_SPLAT });
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
        const col = Math.floor(i / 2) % 2 ? red : white;
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
    for (let i = 0; i < TRACK_N; i += 3) {
      if (this.tunOut[i] < 14) continue; // tunelī un pie tā — bez riepām
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

    // kartu stāvvieta: betona laukums ar marķējumu (vieta aprēķināta buildTrackCurve)
    const sign = makeTextSprite('🏎️ Kartings', { fontSize: 48, bg: 'rgba(210,40,40,0.85)' });
    sign.position.set(this.kartSpot.x, TRACK_Y + 5.8, this.kartSpot.z);
    this.group.add(sign);
  }

  // ---------- tuneļi (sacīkšu trasē) ----------
  buildTunnels() {
    const P = this.trackPts, T = this.trackTan;
    const tex = noiseTexture('stone', 128); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 1);
    const innerM = new THREE.MeshStandardMaterial({ color: '#8d8a84', map: tex, roughness: 0.95, side: THREE.DoubleSide });
    const portalM = new THREE.MeshStandardMaterial({ color: '#a29d92', map: tex, roughness: 0.9, side: THREE.DoubleSide });
    (this.stoneMats = this.stoneMats || []).push(innerM, portalM);
    const at = (i, l, y) => { const p = P[i], t = T[i]; return [p.x - t.z * l, TRACK_Y + y, p.z + t.x * l]; };
    // virsma gar trasi: prof — [[l, y]], rindas no a līdz b
    const loft = (prof, a, b, terrain) => {
      const pos = [], uv = [], col = [], spl = [], idx = [], c = new THREE.Color();
      const cols = prof.length;
      let along = 0;
      for (let i = a; i <= b; i++) {
        if (i > a) along += P[i].distanceTo(P[i - 1]);
        let across = 0;
        prof.forEach(([l, y], j) => {
          if (j) across += Math.hypot(l - prof[j - 1][0], y - prof[j - 1][1]);
          const v = at(i, l, y);
          pos.push(...v);
          if (terrain) {
            uv.push(v[0] / (SIZE / 8), v[2] / (SIZE / 8));
            this.groundColor(v[0], v[2], v[1], c); col.push(c.r, c.g, c.b);
            this.splatAt(v[0], v[2], v[1], 0.97, spl, spl.length);
          } else uv.push(across / 4, along / 4);
        });
        if (i < b) for (let j = 0; j < cols - 1; j++) {
          const q = (i - a) * cols + j, r = q + cols;
          idx.push(q, q + 1, r, q + 1, r + 1, r);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      if (terrain) { g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('splat', new THREE.Float32BufferAttribute(spl, 4)); }
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const inner = [[-7.2, 0.03], [-TUN_W, 0.03], [-TUN_W, TUN_WALL]];
    for (let k = 1; k < 14; k++) { const l = -TUN_W + 2 * TUN_W * k / 14; inner.push([l, this.archAt(l)]); }
    inner.push([TUN_W, TUN_WALL], [TUN_W, 0.03], [7.2, 0.03]);
    const roof = [];
    for (let l = -17; l <= 17.01; l += 1) roof.push([l, this.roofAt(Math.abs(l)) - TRACK_Y]);
    const lamps = [];
    for (const [a, b] of TUNNELS) {
      const im = new THREE.Mesh(loft(inner, a, b, false), innerM);
      im.receiveShadow = true;
      this.group.add(im);
      const rm = new THREE.Mesh(loft(roof, a, b, true), this.terrain.material);
      rm.castShadow = true; rm.receiveShadow = true;
      this.group.add(rm);
      this.terrainTiles.push(rm);
      for (let i = a + 2; i < b; i += 5) lamps.push(at(i, 0, TUN_TOP - 0.12).concat(Math.atan2(T[i].x, T[i].z)));
      // portāli: betona siena starp arku un jumtu
      for (const [end, out] of [[a, -1], [b, 1]]) {
        const cl = [];
        for (let l = -14; l <= 14.01; l += 0.5) {
          const al = Math.abs(l);
          if (Math.abs(al - TUN_W) < 0.26) { cl.push([Math.sign(l) * TUN_W, l < 0 ? 0 : TUN_WALL]); cl.push([Math.sign(l) * TUN_W, l < 0 ? TUN_WALL : 0]); continue; }
          cl.push([l, al < TUN_W ? this.archAt(l) : 0]);
        }
        const pos = [], idx = [];
        const t = T[end], p = P[end], ox = t.x * out * 0.08, oz = t.z * out * 0.08;
        cl.forEach(([l, lo]) => {
          const hi = Math.max(lo + 0.5, this.roofAt(Math.abs(l)) - TRACK_Y + 0.35);
          const [x, , z] = at(end, l, 0);
          pos.push(x + ox, TRACK_Y + lo, z + oz, x + ox, TRACK_Y + hi, z + oz);
        });
        for (let j = 0; j < cl.length - 1; j++) { const q = j * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.flatMap((v, k) => (k % 3 === 1 ? [] : [v / 4])).slice(0, (pos.length / 3) * 2), 2));
        g.setIndex(idx); g.computeVertexNormals();
        const pm = new THREE.Mesh(g, portalM); pm.castShadow = true; pm.receiveShadow = true;
        this.group.add(pm);
        const sg = makeTextSprite('🚇 TUNELIS', { fontSize: 44, bg: 'rgba(40,40,46,0.85)' });
        sg.position.set(p.x + ox * 4, TRACK_Y + TUN_TOP + 0.9, p.z + oz * 4);
        this.group.add(sg);
      }
    }
    // gaismas griestos
    const lg = new THREE.BoxGeometry(0.5, 0.12, 1.6);
    const lm = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ color: '#fff4d8', emissive: '#ffe2a0', emissiveIntensity: 1.6 }), lamps.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    lamps.forEach(([x, y, z, h], i) => { m4.compose(v.set(x, y, z), q.setFromAxisAngle(up, h), one); lm.setMatrixAt(i, m4); });
    this.group.add(lm);
  }

  // ---------- sēta ----------
  // lauku koki, akmeņi un krūmi — tos var nocirst / novākt (id: lauks × 100 + nr.)
  placePlotObjects() {
    const rnd = mulberry32(this.seed + 4242);
    this.plotObjs = [];
    const trees = ['ozols', 'berzs', 'egle', 'priede'], R = { egle: 0.45, priede: 0.35, berzs: 0.3, ozols: 0.55 };
    // vietas izvēlas 0. laukā, pārējos laukos tās pašas vietas pagrieztas (id nr. visiem laukiem nozīmē to pašu vietu);
    // koka suga, izmērs un pagrieziens katrā laukā savs
    // tikai dārza laukumā (0. sētā x, z no −61 līdz −14) — tos novāc, lai varētu uzart
    const spots = [];
    for (const [type, n] of [['tree', 4], ['rock', 8], ['bush', 5]]) {
      let got = 0;
      for (let k = 0; k < 5000 && got < n; k++) {
        const x = -(14 + rnd() * 47), z = -(14 + rnd() * 47);
        if (spots.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) continue;
        spots.push({ type, x, z });
        got++;
      }
    }
    for (let slot = 0; slot < 4; slot++) {
      const r2 = mulberry32(this.seed + 4300 + slot * 17);
      spots.forEach((sp, nr) => {
        const [x, z] = rotPlot(sp.x, sp.z, slot), type = sp.type;
        const a = r2(), b = r2(), c = r2();
        const kind = type === 'tree' ? trees[Math.floor(a * 4)] : type;
        const s = type === 'tree' ? 0.7 + b * 0.35 : type === 'rock' ? 0.5 + b * 0.8 : 0.8 + b * 0.6;
        const r = type === 'tree' ? R[kind] * s : type === 'rock' ? s * 0.85 : 0;
        const o = { id: slot * 100 + nr, slot, type, kind, x, z, y: this.getHeight(x, z), s, ry: c * 6.28, r };
        this.plotObjs.push(o);
        if (r) this.addCollider(x, z, r, o.id);
      });
    }
  }

  // sētas: žogi ar vārtu arkām, dārza mājiņa, siltumnīca; krustojumā ceļa rādītājs, gar ceļiem — ceļa zīmes
  buildFarmYard() {
    const posts = [], rails = [];
    const H = (x, z) => this.getHeight(x, z);
    const line = (pts) => {
      let prev = null;
      for (const [x, z, gap] of pts) {
        const y = H(x, z);
        if (!gap) posts.push([x, y, z]);
        if (prev && !gap && !prev[3]) {
          const [ax, ay, az] = prev, len = Math.hypot(x - ax, z - az), rise = y - ay;
          for (const hy of [0.45, 0.85]) {
            const g = new THREE.BoxGeometry(Math.hypot(len, rise) + 0.08, 0.1, 0.06);
            g.rotateZ(Math.atan2(rise, len)); g.rotateY(Math.atan2(-(z - az), x - ax));
            g.translate((x + ax) / 2, (y + ay) / 2 + hy, (z + az) / 2);
            rails.push(g);
          }
          // žogs ir ciets (apļu virkne)
          for (let t = 0.35; t < len; t += 0.7) this.addCollider(ax + (x - ax) * t / len, az + (z - az) * t / len, 0.22);
        }
        prev = [x, y, z, gap];
      }
    };
    const st = new THREE.Group(); // statiskās būves — apvienos flattenStatic
    const place = (o, slot, lx, lz, ry = 0) => {
      const [x, z] = rotPlot(lx, lz, slot);
      o.position.set(x, H(x, z), z); o.rotation.y = ry + rotPlotY(slot);
      return o;
    };
    const addCol = (cols, slot, lx, lz) => {
      for (const [cx, cz, r] of cols) { const [x, z] = rotPlot(lx + cx, lz + cz, slot); this.addCollider(x, z, r); }
    };
    this.yardBuildings = [];
    const I = YARD_IN, O = YARD_OUT, gA = YARD.gateA;
    for (let slot = 0; slot < 4; slot++) {
      // 0. sētas žogs (x, z < 0), pagriezts uz sētu slot; vārti abās ceļa pusēs
      const side = (f) => { const pts = []; for (let a = I; a <= O + 0.01; a += 3) pts.push([...rotPlot(...f(a), slot), Math.abs(a - gA) < 4.6]); line(pts); };
      side((a) => [-a, -I]); side((a) => [-I, -a]); side((a) => [-a, -O]); side((a) => [-O, -a]);
      // vārtu arkas (dēli ar vārdu pakar farm.js — gateSpots)
      st.add(place(buildGateArch(), slot, -gA, -I, Math.PI / 2));
      st.add(place(buildGateArch(), slot, -I, -gA, 0));
      // dārza mājiņa un siltumnīca (durvis pret dārzu)
      const hs = buildGardenHouse();
      place(hs.obj, slot, YARD.house.x, YARD.house.z);
      this.group.add(hs.obj); // atsevišķi: sienas/jumts mainās, kad esi iekšā
      addCol(hs.colliders, slot, YARD.house.x, YARD.house.z);
      const [hx, hz] = rotPlot(YARD.house.x, YARD.house.z, slot);
      this.yardBuildings.push({ slot, x: hx, z: hz, y0: H(hx, hz), ry: rotPlotY(slot), inner: HOUSE.inner, roof: hs.roof, wallMat: hs.wallMat });
      const gh = buildGreenhouse();
      this.group.add(place(gh.obj, slot, YARD.green.x, YARD.green.z));
      addCol(gh.colliders, slot, YARD.green.x, YARD.green.z);
    }
    const pg = new THREE.CylinderGeometry(0.06, 0.08, 1.25, 5).translate(0, 0.45, 0);
    const im = new THREE.InstancedMesh(pg, wood(), posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); im.setMatrixAt(i, m4); });
    im.castShadow = true;
    this.group.add(im);
    const rm = new THREE.Mesh(mergeGeometries(rails), wood());
    rm.castShadow = true;
    this.group.add(rm);
    rails.forEach((g) => g.dispose());
    // ceļa rādītājs pie krustojuma (stūrī starp ceļiem un 1. sētas žogu)
    const fp = buildFingerpost([[0, -1, '❄️ Ziemas zeme'], [1, 0, '🌲 Mežs · 🛒 tirgus'], [-1, 0, '🏁 Sacīkšu trase'], [0, 1, '🧭 Piedzīvojumu mežs']]);
    fp.position.set(6.4, H(6.4, -6.4), -6.4);
    st.add(fp);
    this.addCollider(6.4, -6.4, 0.2);
    // ceļa malas zīmes 100 m no krustojuma (labajā pusē braucot prom); aizmugurē — atpakaļ uz sētu
    const R = 100, toB = ZONE_HALF - R;
    for (const [dx, dz, txt] of [[0, -1, '❄️ Ziemas zeme'], [1, 0, '🌲 Mežs · 🛒 tirgus'], [-1, 0, '🏁 Sacīkšu trase'], [0, 1, '🧭 Piedzīvojumu mežs']]) {
      const px = dx ? dx * R : roadNS(dz * R), pz = dz ? dz * R : roadEW(dx * R);
      const rx = -dz, rz = dx, off = ROAD_HW + 1.6; // labā puse
      const x = px + rx * off, z = pz + rz * off;
      const sg = buildRoadSign(`${txt}  ${toB} m`, `🏡 Mežvidu sēta  ${R} m`);
      sg.position.set(x, H(x, z), z);
      sg.rotation.y = Math.atan2(-dx, -dz);
      st.add(sg);
      this.addCollider(x, z, 0.3);
    }
    this.group.add(flattenStatic(st));
  }

  // uzartajos lauciņos zāli nezīmē (tiles — [[ix, iz], ...])
  setGrassHoles(tiles) {
    const D = this.grassData;
    if (!D) return;
    const R = 512, cell = SIZE / R;
    if (!this.grassA0) { this.grassA0 = new Uint8Array(R * R); for (let i = 0; i < R * R; i++) this.grassA0[i] = D[i * 4 + 3]; this.holed = []; }
    for (const i of this.holed) D[i * 4 + 3] = this.grassA0[i];
    this.holed = [];
    for (const [ix, iz] of tiles) {
      const i0 = Math.floor((ix * TILE + HALF) / cell), i1 = Math.floor(((ix + 1) * TILE + HALF) / cell);
      const j0 = Math.floor((iz * TILE + HALF) / cell), j1 = Math.floor(((iz + 1) * TILE + HALF) / cell);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (i < 0 || j < 0 || i >= R || j >= R) continue;
        const k = j * R + i; D[k * 4 + 3] = 0; this.holed.push(k);
      }
    }
    this.groundTex.needsUpdate = true;
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
    // mājas aiz tirgus apļa ceļa, durvis pret laukumu
    const houses = [[-118, 40], [-66, 39], [-14, 41], [62, 40], [114, 39]].map(([a, r]) => {
      const t = a * Math.PI / 180, x = Math.cos(t) * r, z = Math.sin(t) * r;
      return [x, z, Math.atan2(-x, -z)];
    });
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

    // ceļa zīme
    g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !this.terrainTiles.includes(o) && o !== this.water) { o.castShadow = true; o.receiveShadow = true; } });
    // ciemata zīme pie ceļa (koka dēlis uz diviem stabiem), ar seju pret atbraucējiem no rietumiem
    {
      const sg = new THREE.Group(), sx = -40, sz = -7.5;
      const bd = makeSignBoard('🏡 Mežvidu ciems · 🛒 tirgus', { h: 0.62, back: '🏡 Mežvidu sēta' });
      bd.obj.position.y = 2.1; sg.add(bd.obj);
      for (const px of [-bd.w / 2 + 0.25, bd.w / 2 - 0.25]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 8), signWood()); p.position.set(px, 1.3, -0.06); sg.add(p); }
      sg.position.set(sx, this.getHeight(sx, sz), sz); sg.rotation.y = -Math.PI / 2;
      g.add(sg);
      this.addCollider(sx, sz, 0.6);
    }
    this.buildPlaza(g);
    this.group.add(flattenStatic(g));
  }

  // bruģēts tirgus laukums ap aku ar akmens apmali
  buildPlaza(g) {
    const tex = canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = '#6d665c'; c.fillRect(0, 0, w, h);
      const n = 8, cs = w / n;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const off = (j % 2) * cs / 2, x = i * cs + off, y = j * cs, l = 120 + Math.random() * 60, t = Math.random() * 14;
        c.fillStyle = `rgb(${l + t | 0},${l * 0.95 + t | 0},${l * 0.86 | 0})`;
        c.beginPath();
        const r = 4 + Math.random() * 2;
        c.roundRect ? c.roundRect(x + 2, y + 2, cs - 4, cs - 4, r) : c.rect(x + 2, y + 2, cs - 4, cs - 4);
        c.fill();
        if (off) { c.beginPath(); c.roundRect ? c.roundRect(x - w + 2, y + 2, cs - 4, cs - 4, r) : c.rect(x - w + 2, y + 2, cs - 4, cs - 4); c.fill(); }
        c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x + 4, y + 4, cs - 10, 3);
      }
      for (let k = 0; k < 2500; k++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(9, 9); tex.anisotropy = 8;
    const pave = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    pave.position.set(0, VILLAGE_Y + 0.03, 0); pave.receiveShadow = true;
    g.add(pave);
    const curb = new THREE.Mesh(new THREE.TorusGeometry(PLAZA_R, 0.16, 5, 96).rotateX(Math.PI / 2), mat('#9a958a', { roughness: 1 }));
    curb.scale.y = 0.6; curb.position.set(0, VILLAGE_Y + 0.04, 0); curb.receiveShadow = true;
    g.add(curb);
  }

  buildTrees() {
    const rnd = this.rnd;
    const lists = { egle: [], priede: [], berzs: [], ozols: [], bush: [] };
    const step = 3.5;
    for (let gx = -HALF; gx < HALF; gx += step) {
      for (let gz = -HALF; gz < HALF; gz += step) {
        const x = gx + (rnd() - 0.5) * step * 0.9, z = gz + (rnd() - 0.5) * step * 0.9;
        const r = Math.hypot(x, z), e = sqDist(x, z);
        if (e > PLAY_RADIUS + 2 || r < (this.mode === 'forest' ? 50 : 42)) { rnd(); rnd(); continue; } // aiz robežas — kaimiņu zemes līdzenums
        const h = this.getHeight(x, z);
        if (h < 1.2 || h > 45) { rnd(); rnd(); continue; }
        if (this.roadDist(x, z).d < 6 || inPlace(this, x, z) || (this.mode === 'forest' && Math.hypot(x - CAR_SPOT.x, z - CAR_SPOT.z) < 8)) { rnd(); rnd(); continue; }
        if (this.trackIdx) {
          const t = this.tunnelInfo(x, z);
          if ((t && t.e < 4 && t.d < 16) || inRaceYard(this.raceF, x, z, 6) || this.trackDist(x, z) < 11 || Math.hypot(x - raceGeo().ring.x, z - raceGeo().ring.z) < RACE_RING.r + 9) { rnd(); rnd(); continue; }
        }
        const f = this.forest(x, z);
        const p = f > 0.12 ? 0.62 : this.mode === 'farm' ? (yardOut(x, z) > 8 ? 0.012 : 0) : f > 0.0 ? 0.08 : 0.02;
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
    // sētā gar ceļiem — bērzu un ozolu rindas ar krūmiem
    if (this.mode === 'farm') {
      const rr = mulberry32(this.seed + 515);
      for (const l of this.roadLines) for (let i = 4; i < l.length - 4; i += 6 + Math.floor(rr() * 8)) {
        const a = l[i - 1], b = l[i + 1];
        let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        for (const side of [-1, 1]) {
          const skip = rr() < 0.3, off = 6.2 + rr() * 1.2, t = rr(), s = 0.8 + rr() * 0.45, ry = rr() * 6.28;
          if (skip) continue;
          const x = l[i].x - tz * off * side, z = l[i].z + tx * off * side;
          if (yardOut(x, z) < 6 || sqDist(x, z) > 262 || this.roadDist(x, z).d < 4.5) continue;
          const h = this.getHeight(x, z);
          if (t < 0.32) { lists.bush.push({ x, y: h, z, s: s + 0.1, ry }); continue; }
          const kind = t < 0.78 ? 'berzs' : 'ozols';
          lists[kind].push({ x, y: h, z, s, ry, tilt: (t - 0.5) * 0.08 });
          this.addCollider(x, z, (kind === 'berzs' ? 0.3 : 0.55) * s);
        }
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
    this.treeTypes = types; // sētas laukos koki ar tiem pašiem modeļiem (nocērtami)
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
    this.bushParts = [bushG, bushM];
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
    if (this.barriers) this.barriers.update(x, z);
    // tāli reljefa gabali ar 2× retāku režģi
    if (this.terrLod) for (const t of this.terrLod) {
      const d = Math.hypot(Math.max(0, Math.abs(x - t.cx) - t.h), Math.max(0, Math.abs(z - t.cz) - t.h));
      const k = d > TERR_LOD ? 1 : 0;
      if (k !== t.k) { t.m.geometry = t.lods[k]; t.k = k; }
    }
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
    for (let i = 0; i < 40000 && rocks.length < 1100; i++) {
      const x = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 5), z = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 5);
      const r = Math.hypot(x, z);
      if (sqDist(x, z) > PLAY_RADIUS - 8 || r < 38) continue;
      const h = this.getHeight(x, z);
      if (h < 0.3) continue;
      if (this.trackDist(x, z) < TRACK_WIDTH / 2 + 4 || this.roadDist(x, z).d < 4 || inPlace(this, x, z) || (this.raceF && inRaceYard(this.raceF, x, z, 3)) || (this.mode === 'forest' && Math.hypot(x - CAR_SPOT.x, z - CAR_SPOT.z) < 7)) continue;
      if (this.mode === 'farm' && sqDist(x, z) < 268) continue; // lauku akmeņi ir atsevišķi (novācami)
      if (this.trackIdx) { const t = this.tunnelInfo(x, z); if (t && t.e < 4 && t.d < 16) continue; }
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
    this.rockParts = [rg, rockMat];
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
        let h = this.getHeight(x, z);
        if (this.trackIdx) { const t = this.inTunnel(x, z); if (t) h = this.roofAt(t.d); } // zāle uz tuneļa jumta, ne tunelī
        hData[j * R + i] = THREE.DataUtils.toHalfFloat(h);
        this.groundColor(x, z, h, col);
        col.convertLinearToSRGB();
        let dens = smoothstep(0.55, 1.1, h) * (1 - smoothstep(16, 20, h));
        dens *= smoothstep(2.0, 3.2, this.roadDist(x, z).d);
        dens *= smoothstep(TRACK_WIDTH / 2 + 0.3, TRACK_WIDTH / 2 + 1.6, this.trackDist(x, z));
        if (this.raceF && inLot(this.raceF, x, z, 0.5)) dens = 0;
        if (Math.hypot(x, z) < (this.mode === 'forest' ? PLAZA_R + 0.4 : 2.2)) dens = 0; // bruģētais tirgus laukums
        if (this.mode === 'farm' && inYardBuilding(x, z)) dens = 0; // mājiņā un siltumnīcā zāle neaug
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
      this.grassData = gData; // sētā uzartajos lauciņos zāli noņem (setGrassHoles)
      gTex.colorSpace = THREE.SRGBColorSpace;
      gTex.magFilter = gTex.minFilter = THREE.LinearFilter; gTex.needsUpdate = true;

      const COUNT = 26000, TILE = 84; // ~42 m ap spēlētāju; blīvumu maina grafikas līmenis (grassMesh.count)
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
      const U = { uCenter: { value: new THREE.Vector2() }, uHeightTex: { value: hTex }, uGroundTex: { value: gTex }, uGrassR: { value: 1 } };
      this.grassCenter = U.uCenter.value;
      this.grassR = U.uGrassR; // zāles lauka rādiuss (grafikas līmenis)
      gm.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U, { uWind: windTime });
        sh.vertexShader = `uniform float uWind; uniform float uGrassR; uniform vec2 uCenter; uniform sampler2D uHeightTex; uniform sampler2D uGroundTex;
          attribute vec4 aOff; varying vec3 vGrass;\n` + sh.vertexShader.replace('#include <begin_vertex>', `
          vec3 transformed = vec3(position);
          vec2 gp = aOff.xy + ${TILE.toFixed(1)} * floor((uCenter - aOff.xy) / ${TILE.toFixed(1)} + 0.5);
          vec2 tuv = (gp + ${HALF.toFixed(1)}) / ${SIZE.toFixed(1)};
          float gh = texture2D(uHeightTex, tuv).r;
          vec4 gc = texture2D(uGroundTex, tuv);
          float gd = length(gp - uCenter) / (${(TILE / 2).toFixed(1)} * uGrassR);
          float gs = aOff.w * smoothstep(0.12, 0.45, gc.a) * (1.0 - smoothstep(0.45, 1.0, gd)); // tālumā stiebri pakāpeniski mazāki — neparādās pēkšņi
          float keep = 1.0 - 0.55 * smoothstep(0.3, 0.85, gd); // tālāk retāki (bet nedaudz lielāki) kušķi — mazāk pikseļu zīmēšanas
          gs *= step(fract(aOff.z * 5.731), keep) * (1.0 + 0.4 * (1.0 - keep));
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
    for (let i = 0; i < 220000 && flowers.length < 5800; i++) {
      const x = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 5), z = (rnd() - 0.5) * 2 * (PLAY_RADIUS - 5);
      const h = this.getHeight(x, z);
      if (h < 1 || h > 16) continue;
      if (this.trackDist(x, z) < TRACK_WIDTH / 2 + 1.5 || this.roadDist(x, z).d < 3 || (this.raceF && inRaceYard(this.raceF, x, z, 1))) continue;
      if (this.mode === 'farm' && plotOf(x, z) >= 0) continue;
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
    for (let i = 0; i < 330000 && reeds.length < 9500; i++) {
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
    this.chunked(reedG, reedM, reeds, (m, d, i) => { dummy.position.set(d.x, d.y, d.z); dummy.scale.set(d.s, d.s, d.s); dummy.rotation.set(0, d.ry, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }, 150);
    this.chunked(catG, catM, cats, (m, d, i) => { dummy.position.set(d.x + 0.1, d.y, d.z); dummy.scale.setScalar(d.s); dummy.rotation.set(0.05, d.ry, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }, 150);
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
      c.position.set((rnd() - 0.5) * 600, 85 + rnd() * 35, (rnd() - 0.5) * 640);
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
    for (let i = 0; i < 80000 && this.mushrooms.length < 380; i++) {
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
      ['stirna', 17, 12, (f, h) => f > -0.05 && f < 0.3 && h > 1.5],
      ['zakis', 15, 8, (f, h) => f < 0.05 && h > 1.5],
      ['ezis', 11, 4, (f, h) => f > 0.18 && h > 1.5],
      ['mezacuka', 9, 9, (f, h) => f > 0.18 && h > 1.5],
      ['vavere', 11, 3, (f, h) => f > 0.15 && h > 1.5],
      ['starkis', 11, 4, (f, h) => h > 0.2 && h < 1.6],
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

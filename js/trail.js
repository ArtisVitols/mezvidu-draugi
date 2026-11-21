// 🧭 Piedzīvojumu mežs (dienvidu zeme 's', 1.39.0): 630 × 1260 m — 2× garāka par citām zemēm, stiepjas uz dienvidiem.
// Biezs mežs ar līkumotu taku no sētas robežas līdz jūrai. Pa ceļam 5 divkājaini meža iedzīvotāji (NPC), katrs lūdz
// komandai palīdzēt (sanest malku, salasīt riekstus, ienest ābolus, atnest dēļus tiltam, salasīt gliemežvākus).
// Uzdevumi ir viena kopīga ķēde (saimnieks glabā stāvokli `hs.trail`, visiem vienāds): nākamais NPC dod uzdevumu tikai,
// kad iepriekšējais izpildīts. Strautu var šķērsot tikai pa tiltu, ko uzbūvē bebrs (pēc tam tas paliek).
// TrailZone — zemes modelis (uzbūvē, ieejot, izmet, izejot). Trail — Game papildinājums (darbības, tīkls, panelis).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ZONE_HALF, SOUTH_END, GROUND_Y, CROSS_AT, smoothRoad, RoadIndex, buildRoadMesh, roadMaterial, disposeTree, buildBorderPosts, wood, ZONE_IDS } from './zones.js?v=1.43.0';
import { WATER_Y } from './world.js?v=1.43.0';
import { makeTextSprite, makeTag, makeSignBoard, canvasTexture, noiseTexture, smoothstep, lerp, clamp } from './util.js?v=1.43.0';
import { buildAnimal } from './characters.js?v=1.43.0';
import * as A from './assets.js?v=1.43.0';
import { InstanceField } from './instancing.js?v=1.43.0';
import { makeNoise2D, mulberry32 } from './noise.js?v=1.43.0';
import { $, toast, showPanel, refreshPanel, closePanel, panelOpen, el, sfx } from './ui.js?v=1.43.0';
import { HATS } from './data.js?v=1.43.0';
import { TrailLife } from './wildlife.js?v=1.43.0';

const SEED = 4711, TAU = Math.PI * 2, H = ZONE_HALF;
// krasts (ūdens mala) un strauts — tīras funkcijas (tās izmanto arī karte)
export const SHORE = 842;
export const shoreZ = (x) => SHORE + Math.sin(x * 0.011) * 14 + Math.sin(x * 0.031 + 1) * 6;
// 1.43.0: strauts lokās kā čūska (divi viļņi; pie tilta x 150 — līkuma virsotne, tur tas tek taisni austrumu–rietumu virzienā)
const BX = 150, SK1 = 0.032, SP1 = Math.PI / 2 - SK1 * BX, SK2 = 0.06, SP2 = Math.PI / 2 - SK2 * BX;
export const streamZ = (x) => 600 + 30 * Math.sin(SK1 * x + SP1) + 7 * Math.sin(SK2 * x + SP2);
const streamDZ = (x) => 30 * SK1 * Math.cos(SK1 * x + SP1) + 7 * SK2 * Math.cos(SK2 * x + SP2);
// strauta ūdens pusplatums mainās (3,2…6,8 m), pie tilta 5 m
export const streamHW = (x) => 5 + 1.8 * Math.sin(0.045 * (x - BX));
let SL = null;
function streamIdx() {
  if (!SL) { const pts = []; for (let x = -450; x <= 450; x += 1.2) pts.push({ x, z: streamZ(x) }); SL = new RoadIndex([pts], 8, 3); }
  return SL;
}
// attālums līdz strauta vidus līnijai (tuvumā precīzs, tālumā aptuvens)
export function streamDist(x, z) {
  const v = Math.abs(z - streamZ(x));
  if (v > 48) return v / Math.sqrt(1 + streamDZ(x) ** 2);
  return Math.min(v, streamIdx().near(x, z).d);
}
const BRIDGE = { x: BX, hl: 11, hw: 1.35 }; // tilts pāri strautam (gar z asi), pusgarums, puspalatums
const BZ = streamZ(BRIDGE.x);
// 1.43.0: purvs ar laipu (starp ezīti un bebru)
const BOG = { x: 118, z: 455, rx: 185, rz: 64 };
const bogR = (x, z) => Math.hypot((x - BOG.x) / BOG.rx, (z - BOG.z) / BOG.rz);
export const bogAt = (x, z) => 1 - smoothstep(0.62, 0.95, bogR(x, z));
// 1.43.0: takas posmi — katram savs mežs, pamežs un zemes krāsa
export const SECTS = [
  { id: 'jaukts', z: -1e9, name: 'Jauktais mežs', icon: '🌳' },
  { id: 'berzi', z: 62, name: 'Bērzu birzs', icon: '🌿' },
  { id: 'egles', z: 190, name: 'Egļu biezoknis', icon: '🌲' },
  { id: 'ozoli', z: 300, name: 'Veco ozolu birzs', icon: '🌳' },
  { id: 'purvs', z: 392, name: 'Purvs', icon: '🐸' },
  { id: 'strauts', z: 522, name: 'Bebru strauts', icon: '🦫' },
  { id: 'sils', z: 1e9, name: 'Priežu sils', icon: '🌲' },
  { id: 'jura', z: 1e9, name: 'Jūrmala', icon: '🏖️' },
];
// posma robežas ir viļņotas (z + troksnis)
const sectZ = (x, z) => { noiseB = noiseB || makeNoise2D(SEED + 9); return z + 14 * noiseB(x * 0.012 + 7, z * 0.012 - 3); };
export function sectAt(x, z, zz = null) {
  if (z > shoreZ(x) - 58) return 7;
  if (z > streamZ(x)) return 6;
  if (zz == null) zz = sectZ(x, z);
  for (let i = 5; i > 0; i--) if (zz >= SECTS[i].z) return i;
  return 0;
}
const SEA_LIMIT = 902;          // tālāk jūrā neaizpeld
const TRAIL_HW = 2.3;           // takas puse platuma
// 1.43.0: tunelis (pusplatums, augstums), laipa (pusplatums, augstums virs zemes), šķēršļa biezums
const TUN_W = 3.0, TUN_H = 4.7;
const tunArch = (d) => TUN_H * Math.sqrt(Math.max(0, 1 - (d / TUN_W) ** 2));
const BW_HW = 1.2, BW_Y = 0.2, OB_HALF = 0.9;
// šķēršļu veidi: cik sitienu vajag, darbības teksts, skaņa
export const OB_TYPES = {
  koks: { name: 'Nogāzts koks', icon: '🌲', tool: '🪓', verb: 'Zāģēt koku', hits: 10, snd: 'chop', end: 'tree_fall' },
  akmens: { name: 'Akmeņu nogruvums', icon: '🪨', tool: '⛏️', verb: 'Skaldīt akmeņus', hits: 12, snd: 'hammer', end: 'hit' },
  krumi: { name: 'Ērkšķu biezoknis', icon: '🌿', tool: '✂️', verb: 'Griezt ērkšķus', hits: 8, snd: 'leaves', end: 'leaves' },
};

// ---------- uzdevumi (secība = ķēdes secība) ----------
export const TASKS = [
  {
    npc: 'lacis', name: 'Lācis Brunis', icon: '🐻', kind: 'carry', item: 'malka', itemName: 'pagale', itemIcon: '🪵', need: 8, items: 12, coins: 15, xp: 5,
    title: 'Malka šķūnītī', wear: { top: 'rutains' },
    ask: 'Sveiki, ceļotāji! Drīz būs ziema, bet vējš izmētāja manu malku pa visu mežu. Palīdziet sanest 8 pagales manā šķūnītī!',
    help: 'Pagales guļ mežā ap pļaviņu. Pacel vienu un aiznes uz šķūnīti!', thanks: 'Paldies, draugi! Tagad ziemā būs silti. Ejiet tālāk pa taku — Vāverīte Čiekuriņa šķiet noraizējusies!',
  },
  {
    npc: 'vavere', name: 'Vāverīte Čiekuriņa', icon: '🐿️', kind: 'pick', item: 'rieksti', itemName: 'rieksti', itemIcon: '🌰', need: 12, items: 15, coins: 20, xp: 6,
    title: 'Rieksti ziemai', shirt: '#3c9a4a',
    ask: 'Ak vai, ak vai! Vētra nopūta visus riekstus no manām lazdām. Salasiet 12 riekstus, lūdzu — citādi ziemā būšu izsalkusi!',
    help: 'Rieksti mētājas zem lazdām ap Čiekuriņu.', thanks: 'Urrā! Mana noliktava pilna! Tālāk pa taku dzīvo Ezītis Adatiņš — viņam ir ābeļdārzs.',
  },
  {
    npc: 'ezis', name: 'Ezītis Adatiņš', icon: '🦔', kind: 'carry', item: 'abols', itemName: 'ābols', itemIcon: '🍎', need: 8, items: 11, coins: 25, xp: 8,
    title: 'Āboli grozā', shirt: '#d8503a', wear: { glasses: 'apalas' },
    ask: 'Labdien! Mani āboli nokrita zālē, bet es esmu tik maziņš — varu panest tikai vienu dienā. Ienesiet 8 ābolus manā grozā!',
    help: 'Āboli guļ zem ābelēm. Nes pa vienam uz grozu blakus Adatiņam.', thanks: 'Paldies! Tagad varēšu cept ābolkūku. Uzmanieties pie strauta — bebrs Dambītis saka, ka tilts sabrucis!',
  },
  {
    npc: 'bebritis', name: 'Bebrs Dambītis', icon: '🦫', kind: 'carry', item: 'delis', itemName: 'dēlis', itemIcon: '🪵', need: 6, items: 9, coins: 30, xp: 10,
    title: 'Tilts pāri strautam', hat: 'nagene', shirt: '#e8a53a',
    ask: 'Stop, stop! Tilts pāri strautam ir sabrucis — bez tā uz jūru netiksiet. Atnesiet man 6 dēļus no krasta, un es to uzbūvēšu!',
    help: 'Dēļi izmētāti strauta krastā. Nes tos uz tilta galu.', thanks: 'Gatavs! Stiprs kā bebru dambis. Ejiet pāri — aiz meža ir jūra, tur jūs gaida Lapsa Smilga!',
  },
  {
    npc: 'lapsa', name: 'Lapsa Smilga', icon: '🦊', kind: 'pick', item: 'gliemezis', itemName: 'gliemežvāks', itemIcon: '🐚', need: 10, items: 14, coins: 40, xp: 15,
    title: 'Gliemežvāki pludmalē', wear: { top: 'svitrains' },
    ask: 'Sveicināti jūrmalā! Viļņi naktī izskaloja krastā skaistus gliemežvākus. Salasiet 10, un es jums iedošu īpašu dāvanu!',
    help: 'Gliemežvāki mētājas pa visu pludmali.', thanks: 'Jūs esat īsta komanda! Te jums katram jūrnieka cepure ⚓ — tikai tiem, kas izgājuši visu taku!',
  },
];
export const GIFT_HAT = 'jurnieks';
export const FINAL_COINS = 50;
const CARRY_MS = 180000; // nesamais priekšmets atgriežas savā vietā, ja to neatnes 3 min laikā

// ---------- izkārtojums (deterministisks — vienāds visiem un kartē) ----------
const PTS = [[0, -345], [0, -315], [0, -290], [6, -262], [22, -232], [44, -208], [70, -196],
  [104, -180], [148, -150], [190, -108], [212, -52], [204, 4], [168, 46], [110, 68], [50, 80],
  [0, 94], [-60, 104], [-120, 122], [-176, 156], [-216, 206], [-226, 258], [-196, 298],
  [-140, 320], [-80, 338], [-14, 356], [60, 380], [128, 414], [180, 458], [198, 510], [180, 552], [158, BZ - 24],
  [BRIDGE.x, BZ - BRIDGE.hl], [BRIDGE.x, BZ + BRIDGE.hl],
  [143, BZ + 26], [118, 672], [74, 702], [16, 724], [-30, 750], [-46, 782], [-30, 808], [-10, 820]];
// vēlamās NPC vietas (precīzā vieta — 5,5 m no takas uz šo pusi)
const WANT = [[78, -170], [-4, 116], [-150, 344], null, [14, 812]];
// 1.40.0: vietas, kur taka nelokās un zeme ir līdzena (NPC pļavas, tilts)
const KEEP = [...WANT.filter(Boolean), [BRIDGE.x, BZ]];

let noiseA = null, noiseB = null, noiseC = null;
// kalnainums 0..1 — kalni visur starp NPC pļavām; pie ieejas, strauta, pludmales un NPC — līdzens
export function mountAt(x, z) {
  noiseC = noiseC || makeNoise2D(SEED + 17);
  let m = 0.55 + 0.45 * smoothstep(-0.5, 0.4, noiseC(x * 0.004 + 1.7, z * 0.004 - 2.2));
  m *= smoothstep(-255, -175, z);
  m *= smoothstep(28, 80, Math.abs(z - streamZ(x)));
  m *= 1 - smoothstep(shoreZ(x) - 175, shoreZ(x) - 105, z);
  for (const [wx, wz] of KEEP) m *= smoothstep(38, 92, Math.hypot(x - wx, z - wz));
  m *= smoothstep(0.95, 1.5, bogR(x, z)); // purvā līdzens
  return m;
}
function landH(x, z) {
  noiseA = noiseA || makeNoise2D(SEED);
  const n1 = noiseA(x * 0.0045, z * 0.0045), n2 = noiseA(x * 0.017 + 3, z * 0.017 - 5), n3 = noiseA(x * 0.06 - 7, z * 0.06 + 2);
  let h = GROUND_Y + 0.6 + 3.2 * (n1 + 1) + 0.8 * (n2 + 1) + 0.3 * n3;
  // kalni: asas kores (ridged noise)
  const m = mountAt(x, z);
  if (m > 0) {
    noiseC = noiseC || makeNoise2D(SEED + 17);
    const r1 = 1 - Math.abs(noiseC(x * 0.0085 + 11, z * 0.0085 - 4)), r2 = 1 - Math.abs(noiseC(x * 0.021 - 8, z * 0.021 + 13));
    h += m * (5 + 30 * (0.68 * r1 * r1 + 0.32 * r2 * r2));
  }
  h = lerp(GROUND_Y, h, smoothstep(-312, -235, z)); // pie sētas robežas līdzens
  const bg = bogAt(x, z);
  if (bg > 0) h = lerp(h, WATER_Y + 0.45, bg);       // purvs — zems, mitrs
  return h;
}
// meža biezums 0..1 (pļavas starp mežiem)
export function forestAt(x, z) {
  noiseB = noiseB || makeNoise2D(SEED + 9);
  const fn = noiseB(x * 0.008, z * 0.008) * 0.7 + noiseB(x * 0.03 + 4, z * 0.03) * 0.3;
  let f = smoothstep(-0.38, 0.02, fn);
  f *= smoothstep(-300, -230, z);                       // pie ieejas pļava
  f *= 1 - smoothstep(shoreZ(x) - 62, shoreZ(x) - 48, z); // pludmale
  f *= 1 - 0.75 * bogAt(x, z);                           // purvā reti koki
  return f;
}
// NPC pļavu līdzenums (ap katru apstāšanās vietu)
const plateauR = (s) => s.clear.r + (s.k === 0 ? 20 : 12);
function plateau(h, x, z, stops) {
  for (const s of stops) {
    const pr = plateauR(s), d = Math.hypot(x - s.clear.x, z - s.clear.z);
    if (d < pr + 26) h = lerp(h, s.ch ?? (s.ch = landH(s.clear.x, s.clear.z)), 1 - smoothstep(pr, pr + 26, d));
  }
  return h;
}
// 1.40.0: taka lokās kā čūska — mugurkaula līnijai (PTS) pieliek sānu viļņus; pie NPC, tilta, ieejas un jūras taisnāk
function snakePts() {
  noiseC = noiseC || makeNoise2D(SEED + 17);
  const sp = smoothRoad(PTS, 3), out = [];
  let ph = 0;
  for (let i = 0; i < sp.length; i++) {
    const p = sp[i], a0 = sp[Math.max(0, i - 1)], a1 = sp[Math.min(sp.length - 1, i + 1)];
    const tx = a1.x - a0.x, tz = a1.z - a0.z, tl = Math.hypot(tx, tz) || 1;
    if (i) ph += Math.hypot(p.x - sp[i - 1].x, p.z - sp[i - 1].z) * TAU / (82 + 22 * noiseC(i * 0.013, 4.5));
    let a = smoothstep(-288, -240, p.z) * (1 - smoothstep(742, 788, p.z));
    for (const [kx, kz] of KEEP) a *= smoothstep(20, 58, Math.hypot(p.x - kx, p.z - kz));
    const o = Math.sin(ph) * a * (17 + 6 * noiseC(i * 0.009, 9.5));
    out.push([p.x - tz / tl * o, p.z + tx / tl * o]);
  }
  return out;
}

let L = null;
export function trailLayout() {
  if (L) return L;
  noiseC = noiseC || makeNoise2D(SEED + 17);
  const line = smoothRoad(snakePts(), 1.5);
  const wide = new RoadIndex([line], 16, 3);       // NPC vietām
  // NPC vietas
  const stops = TASKS.map((T, k) => {
    let nx, nz, face;
    if (k === 3) { nx = BRIDGE.x + 4.2; nz = BZ - BRIDGE.hl - 3.5; face = Math.atan2(-4.2, 1.5); }
    else {
      const [wx, wz] = WANT[k], np = wide.near(wx, wz).p;
      const dx = wx - np.x, dz = wz - np.z, d = Math.hypot(dx, dz) || 1;
      nx = np.x + dx / d * 5.5; nz = np.z + dz / d * 5.5; face = Math.atan2(-dx, -dz);
    }
    const dx = Math.sin(face), dz = Math.cos(face); // uz taku
    const clear = k === 3 ? { x: BRIDGE.x + 20, z: BZ - 30, r: 22 } : k === 4 ? { x: 0, z: 812, r: 16 } : { x: nx - dx * 9, z: nz - dz * 9, r: k === 2 ? 18 : 15 };
    return { k, x: nx, z: nz, face, clear };
  });
  // takas augstuma profils (no reljefa ar NPC pļavām, izlīdzināts ±30 m), tilta posmā taisna līnija
  const raw = line.map((p) => plateau(landH(p.x, p.z), p.x, p.z, stops));
  const prof = raw.map((_, i) => { let s = 0, n = 0; for (let k = -20; k <= 20; k++) { const j = i + k; if (j >= 0 && j < raw.length) { s += raw[j]; n++; } } return s / n; });
  const onBridge = (p) => Math.abs(p.x - BRIDGE.x) < 3 && Math.abs(p.z - BZ) < BRIDGE.hl + 0.5;
  const bi = line.map((p, i) => (onBridge(p) ? i : -1)).filter((i) => i >= 0);
  if (bi.length) {
    const a = Math.max(0, bi[0] - 1), b = Math.min(line.length - 1, bi[bi.length - 1] + 1);
    for (let i = a; i <= b; i++) prof[i] = lerp(prof[a], prof[b], (i - a) / Math.max(1, b - a));
  }
  // kraujas gar taku: g 0..1 (kalnos stāvas sienas abās pusēs — aiza), m = kalnainums takas vietā
  line.forEach((p, i) => {
    p.h = prof[i]; p.i = i;
    p.m = mountAt(p.x, p.z);
    p.g = p.m * (0.3 + 0.7 * smoothstep(-0.25, 0.3, noiseC(i * 0.006 + 31, 2.5)));
    p.bog = bogAt(p.x, p.z);
    p.bw = 0; // laipa (purvā)
  });
  // 1.43.0: takas indeksi pie NPC
  const nearI = (x, z) => { let b = 0, bd = 1e18; line.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
  const stopI = stops.map((s) => nearI(s.x, s.z));
  const farFromStops = (p, r) => stops.every((s) => Math.hypot(p.x - s.clear.x, p.z - s.clear.z) > r + s.clear.r);
  // 1.43.0: klints tunelis — garākā dziļās aizas vieta starp lāci un vāveri
  let tunnel = null;
  {
    let best = null;
    for (let i = stopI[0] + 30; i < stopI[1] - 30; i++) {
      let j = i;
      while (j < stopI[1] - 30 && line[j].g > 0.5 && line[j].m > 0.55 && farFromStops(line[j], 45)) j++;
      if (j - i > 24 && (!best || j - i > best[1] - best[0])) best = [i, j];
      i = j;
    }
    if (best) {
      const mid = (best[0] + best[1]) >> 1, i0 = Math.max(best[0] + 3, mid - 13), i1 = Math.min(best[1] - 3, mid + 13);
      tunnel = { i0, i1 };
      for (let i = i0 - 18; i <= i1 + 18; i++) { const p = line[i]; if (p) p.g = Math.max(p.g, 1 - smoothstep(0, 18, Math.max(i0 - i, i - i1, 0))); }
    }
  }
  // 1.43.0: šķēršļi uz takas (jānovāc kopā): nogāzts koks, akmeņu nogruvums tuneļa priekšā, ērkšķu biezoknis
  const obst = [];
  const addOb = (type, i) => {
    const p = line[i], q = line[Math.min(line.length - 1, i + 1)], o = line[Math.max(0, i - 1)];
    const tx = q.x - o.x, tz = q.z - o.z, tl = Math.hypot(tx, tz) || 1;
    obst.push({ o: obst.length, type, i, x: p.x, z: p.z, h: p.h, tx: tx / tl, tz: tz / tl, nx: -tz / tl, nz: tx / tl, face: Math.atan2(tx, tz) });
    // apkārt augstas kraujas — šķērslim nevar apiet apkārt
    // ±60 m garumā stāvas, augstas aizas sienas (ob — cik stāvas)
    for (let k = -42; k <= 42; k++) { const pp = line[i + k]; if (pp) { const w = 1 - smoothstep(30, 42, Math.abs(k)); pp.g = Math.max(pp.g, 0.9 * w); pp.m = Math.max(pp.m, 0.6 * w); pp.ob = Math.max(pp.ob || 0, w); } }
  };
  const pickOb = (type, a, b) => {
    let bi = -1, bs = 0;
    for (let i = a; i < b; i++) {
      const p = line[i];
      if (p.g < 0.5 || !farFromStops(p, 40) || (tunnel && i > tunnel.i0 - 40 && i < tunnel.i1 + 25)) continue;
      if (obst.some((o) => Math.abs(o.i - i) < 45)) continue;
      const sc = p.g + 0.2 * Math.min(1, Math.abs(i - (a + b) / 2) < (b - a) / 3 ? 1 : 0);
      if (sc > bs) { bs = sc; bi = i; }
    }
    if (bi >= 0) addOb(type, bi);
  };
  if (tunnel) addOb('akmens', tunnel.i0 - 5);
  pickOb('koks', stopI[0] + 30, tunnel ? tunnel.i0 - 30 : stopI[1] - 30);
  pickOb('krumi', stopI[1] + 30, (stopI[1] + stopI[2]) >> 1);
  pickOb('koks', (stopI[1] + stopI[2]) >> 1, stopI[2] - 30);
  pickOb('koks', stopI[2] + 30, stopI[3] - 30);
  obst.sort((a, b) => a.i - b.i).forEach((o, k) => { o.o = k; });
  // šķērsļa barjeras garums uz katru pusi (līdz 45 m, bet ne līdz citam takas posmam)
  {
    const tmp = new RoadIndex([line], 8, 2);
    for (const o of obst) for (const side of [-1, 1]) {
      let w = 45;
      for (let d = 6; d <= 45; d += 1) { const n = tmp.near(o.x + o.nx * d * side, o.z + o.nz * d * side); if (n.p && n.d < 12 && Math.abs(n.p.i - o.i) > 40) { w = Math.max(8, d - 12); break; } }
      if (side < 0) o.wl = w; else o.wr = w;
    }
  }
  // laipa purvā (ar mīkstiem galiem)
  const bwOn = line.map((p) => (p.bog > 0.35 ? 1 : 0));
  line.forEach((p, i) => {
    if (!bwOn[i]) return;
    let e = 0; while (e < 4 && bwOn[i - e - 1] && bwOn[i + e + 1]) e++;
    p.bw = Math.min(1, (e + 1) / 4);
  });
  // posmu sākuma vietas (zīmēm)
  const sectStart = [];
  {
    let cur = 0;
    line.forEach((p, i) => { const s = sectAt(p.x, p.z); if (s > cur) { cur = s; sectStart.push({ s, i }); } });
  }
  const idx = new RoadIndex([line], 8, 1);        // ātrs (precīzs līdz ~8 m) — kokiem, ceļa attālumam
  const hidx = new RoadIndex([line], 8, 2);       // augstumiem (precīzs līdz 16 m — kraujas)
  // 8 m šūnas, kurām taka ir tuvāk par 16 m (citur augstumam takas meklēšana nav vajadzīga — ātrāk)
  const nearSet = new Set();
  for (const p of line) { const cx = Math.floor(p.x / 8), cz = Math.floor(p.z / 8); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) nearSet.add((cx + a + 500) * 1000 + cz + b + 500); }
  // nodošanas vietas (nesamajiem)
  const s0 = stops[0], s2 = stops[2];
  stops[0].drop = { x: s0.clear.x - Math.sin(s0.face) * 4, z: s0.clear.z - Math.cos(s0.face) * 4, face: s0.face, r: 3.2 }; // šķūnītis
  stops[2].drop = { x: s2.x + Math.cos(s2.face) * 2, z: s2.z - Math.sin(s2.face) * 2, face: s2.face, r: 2.2 };              // grozs
  stops[3].drop = { x: BRIDGE.x, z: BZ - BRIDGE.hl - 1.2, face: 0, r: 3 };                                              // tilta gals
  // ābeles ap ezīša pļaviņu
  const c2 = s2.clear;
  stops[2].trees = [0, 1, 2, 3, 4].map((i) => { const a = s2.face + Math.PI + (i - 2) * 0.75; return { x: c2.x + Math.sin(a) * 9.5, z: c2.z + Math.cos(a) * 9.5 }; });
  // lazdas ap vāveri
  const c1 = stops[1].clear;
  stops[1].bushes = [0, 1, 2, 3, 4, 5].map((i) => { const a = i / 6 * TAU + 0.4; return { x: c1.x + Math.sin(a) * (8 + (i % 2) * 3), z: c1.z + Math.cos(a) * (8 + (i % 2) * 3) }; });
  const box = (pts, m) => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of pts) { a = Math.min(a, p.x); b = Math.min(b, p.z); c = Math.max(c, p.x); d = Math.max(d, p.z); } return pts.length ? [a - m, b - m, c + m, d + m] : null; };
  if (tunnel) tunnel.box = box(line.slice(tunnel.i0, tunnel.i1 + 1), TUN_W + 2);
  const bwBox = box(line.filter((p) => p.bw > 0), BW_HW + 2);
  L = { line, idx, hidx, nearSet, stops, stopI, tunnel, obst, sectStart, bwBox };
  // priekšmetu vietas katram uzdevumam
  const rnd = mulberry32(SEED + 21);
  const nearTrail = (x, z) => idx.near(x, z).d;
  stops.forEach((s, k) => {
    const T = TASKS[k], out = [];
    let guard = 0;
    while (out.length < T.items && guard++ < 4000) {
      let x, z;
      if (k === 4) { x = -95 + rnd() * 190; const sz = shoreZ(x); z = sz - 32 + rnd() * 28; }
      else if (k === 2) { const t = s.trees[Math.floor(rnd() * s.trees.length)], a = rnd() * TAU, r = 1.2 + rnd() * 3.2; x = t.x + Math.sin(a) * r; z = t.z + Math.cos(a) * r; }
      else {
        const a = rnd() * TAU, r = k === 0 ? 10 + rnd() * 26 : k === 1 ? 3 + rnd() * 20 : 3 + rnd() * 22;
        x = s.clear.x + Math.sin(a) * r; z = s.clear.z + Math.cos(a) * r;
        if (k === 3 && (z > streamZ(x) || streamDist(x, z) < streamHW(x) + 4)) continue;
      }
      if (Math.abs(x) > H - 4 || nearTrail(x, z) < 1.6) continue;
      if (streamDist(x, z) < streamHW(x) + 3) continue;
      if (s.drop && Math.hypot(x - s.drop.x, z - s.drop.z) < (k === 0 ? 7 : 4)) continue;
      if (Math.hypot(x - s.x, z - s.z) < 2) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 2.2)) continue;
      out.push({ i: out.length, x, z, ry: rnd() * TAU });
    }
    s.items = out;
  });
  // 1.42.0: uzdevuma zona — aplis ap pļavu, kurā ir NPC, visi priekšmeti un nodošanas vieta (+30 m)
  for (const s of stops) {
    let r = Math.hypot(s.x - s.clear.x, s.z - s.clear.z);
    for (const it of s.items) r = Math.max(r, Math.hypot(it.x - s.clear.x, it.z - s.clear.z));
    if (s.drop) r = Math.max(r, Math.hypot(s.drop.x - s.clear.x, s.drop.z - s.clear.z));
    s.range = r + 30;
  }
  return L;
}
// vai vieta ir uzdevuma zonā
export function inQuestRange(k, x, z) { const s = trailLayout().stops[k]; return !!s && Math.hypot(x - s.clear.x, z - s.clear.z) < s.range; }
const FAIL_MS = 4000; // cik ilgi visiem jābūt ārpus zonas, līdz uzdevums neizdodas

// pilns augstums (bez tilta) — tīra funkcija
export function trailHeight(x, z) {
  const lay = trailLayout();
  let h = plateau(landH(x, z), x, z, lay.stops);
  // purvs: ūdens acis un ciņi
  const bg = bogAt(x, z);
  if (bg > 0) {
    noiseB = noiseB || makeNoise2D(SEED + 9);
    const pn = noiseB(x * 0.055 + 20, z * 0.055 - 8) * 0.7 + noiseB(x * 0.16 - 4, z * 0.16 + 9) * 0.3;
    h = lerp(h, WATER_Y + 0.3 + 0.95 * pn, bg);
  }
  const tn = lay.nearSet.has((Math.floor(x / 8) + 500) * 1000 + Math.floor(z / 8) + 500) ? lay.hidx.near(x, z) : null;
  if (tn && tn.p) {
    // taka iegriezta reljefā; kalnos — stāvas kraujas (aiza) abās pusēs, tālāk atpakaļ dabiskais reljefs
    const p = tn.p, d = tn.d;
    noiseC = noiseC || makeNoise2D(SEED + 17);
    const wall = Math.max(p.g * (5.5 + 6 * (noiseC(x * 0.05 + 3, z * 0.05 - 1) + 1) * 0.5), 8 * (p.ob || 0));
    const side = lerp(Math.max(h, p.h + wall - 3 * p.bog), h, smoothstep(9.5, 16, d));
    const inner = lerp(TRAIL_HW + 0.3, TRAIL_HW + 1.4, p.m);
    h = lerp(p.h, side, smoothstep(inner, lerp(lerp(lerp(7.5, TRAIL_HW + 5.6, p.m), TRAIL_HW + 2.1, p.bog), inner + 2.6, p.ob || 0), d));
  }
  // strauts
  if (Math.abs(z - streamZ(x)) < 60) {
    const sd = streamDist(x, z), hw = streamHW(x);
    if (sd < hw + 8) h = lerp(h, WATER_Y - 1.7, 1 - smoothstep(hw - 1.5, hw + 7, sd));
  }
  // pludmale un jūra
  const sz = shoreZ(x), b = smoothstep(sz - 78, sz - 44, z);
  if (b > 0) { const beach = z < sz ? Math.min(1.45, (sz - z) * 1.45 / 44) : -Math.min(6.5, (z - sz) * 0.09); h = lerp(h, beach, b); }
  // aiz žoga lēzeni līdz līdzenumam (izņemot jūru)
  const ex = smoothstep(338, 396, Math.abs(x)) * (1 - b);
  if (ex > 0) h = lerp(h, GROUND_Y, ex);
  return h;
}

// koku un krūmu saraksti (+ 1.40.0 lieli laukakmeņi `rockList`)
let treeList = null, underList = null, rockList = null;
export function trailTrees() {
  if (treeList) return treeList;
  const lay = trailLayout(), rnd = mulberry32(SEED + 3);
  noiseB = noiseB || makeNoise2D(SEED + 9);
  treeList = []; underList = []; rockList = [];
  const free = (x, z, m) => {
    const nr = lay.idx.near(x, z);
    if (nr.d < TRAIL_HW + 1.7 + m) return false;
    for (const s of lay.stops) if (Math.hypot(x - s.clear.x, z - s.clear.z) < s.clear.r + 2 + m || Math.hypot(x - s.x, z - s.z) < 5) return false;
    if (streamDist(x, z) < streamHW(x) + 4 + m) return false;
    if (z < -300 && Math.abs(x) < 30) return false;
    if (lay.tunnel && nr.p && nr.d < 7 + m && nr.p.i > lay.tunnel.i0 - 4 && nr.p.i < lay.tunnel.i1 + 4) return false;
    for (const o of lay.obst) if (Math.abs(x - o.x) < 7 && Math.abs(z - o.z) < 7) return false;
    return true;
  };
  const kindAt = (x, z, r2) => { const kn = noiseB(x * 0.02 + 50, z * 0.02); return kn < -0.08 ? 'egle' : kn > 0.32 ? 'priede' : r2 < 0.5 ? 'berzs' : 'ozols'; };
  // 1.43.0: katram posmam savi koki
  const sectKind = (sid, x, z, r2) => {
    switch (sid) {
      case 'berzi': return r2 < 0.8 ? 'berzs' : r2 < 0.9 ? 'ozols' : 'priede';
      case 'egles': return r2 < 0.92 ? 'egle' : 'berzs';
      case 'ozoli': return r2 < 0.72 ? 'ozols' : r2 < 0.86 ? 'berzs' : 'egle';
      case 'purvs': return r2 < 0.6 ? 'berzs' : 'priede';
      case 'strauts': return r2 < 0.45 ? 'berzs' : r2 < 0.75 ? 'ozols' : 'egle';
      case 'sils': case 'jura': return r2 < 0.92 ? 'priede' : 'berzs';
      default: return kindAt(x, z, r2);
    }
  };
  const DENS = { jaukts: 1, berzi: 0.85, egles: 1.3, ozoli: 0.62, purvs: 0.55, strauts: 0.85, sils: 0.78, jura: 0.6 };
  const SCL = { jaukts: [0.72, 0.55], berzi: [0.78, 0.5], egles: [0.82, 0.55], ozoli: [1.05, 0.55], purvs: [0.45, 0.35], strauts: [0.72, 0.5], sils: [0.92, 0.5], jura: [0.8, 0.4] };
  const steep = (x, z) => Math.hypot(trailHeight(x + 2, z) - trailHeight(x - 2, z), trailHeight(x, z + 2) - trailHeight(x, z - 2)) / 4;
  for (let gx = -394; gx < 394; gx += 6.5) for (let gz = -300; gz < 860; gz += 6.5) {
    const x = gx + (rnd() - 0.5) * 5.5, z = gz + (rnd() - 0.5) * 5.5, r1 = rnd(), r2 = rnd(), r3 = rnd();
    const sz = shoreZ(x);
    const f = forestAt(x, z), dune = z > sz - 64 && z < sz - 46, sid = SECTS[sectAt(x, z)].id;
    // kalnos mežs biezāks (arī pļavās — skuju koki)
    const p = dune ? 0.22 : Math.max(Math.min(0.95, f * 0.78 * DENS[sid]), mountAt(x, z) * 0.5);
    if (r1 > p || z > sz - 46 || !free(x, z, 0)) continue;
    if (mountAt(x, z) > 0.1 && steep(x, z) > 0.95) continue; // uz stāvām kraujām koki neaug
    const y = trailHeight(x, z);
    if (y < WATER_Y + 0.15) continue; // purva ūdenī ne
    const kind = dune ? 'priede' : sid === 'jaukts' && f < 0.3 ? (r2 < 0.6 ? 'egle' : 'priede') : sectKind(sid, x, z, r2);
    const [s0, s1] = SCL[sid];
    treeList.push({ id: treeList.length, kind, x, z, y: y - 0.1, ry: r3 * TAU, s: s0 + rnd() * s1 });
  }
  // gar taku: koku rinda tuvu malai, aizās — laukakmeņi
  const line = lay.line;
  for (let i = 0; i < line.length; i += 2) {
    const p = line[i], q = line[Math.min(line.length - 1, i + 1)], o = line[Math.max(0, i - 1)];
    const tx = q.x - o.x, tz = q.z - o.z, tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
    for (const side of [-1, 1]) {
      const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
      if (p.g > 0.2 && r1 < 0.16 + p.g * 0.22) {
        const d = TRAIL_HW + 1.9 + r2 * 2.4, x = p.x + nx * d * side, z = p.z + nz * d * side, s = 0.9 + r3 * 1.4 + p.g * 0.8;
        if (lay.idx.near(x, z).d < TRAIL_HW + 1.3 + s * 0.3 || !free(x, z, -2.4)) continue;
        rockList.push({ id: rockList.length, kind: r4 < 0.5 ? 'kl' : 'kl2', x, z, y: trailHeight(x, z) - 0.25 * s, ry: r4 * TAU, s });
      } else if (r1 < 0.32 && p.z > -280 && p.z < shoreZ(p.x) - 60) {
        const d = TRAIL_HW + 2.1 + r2 * 3, x = p.x + nx * d * side, z = p.z + nz * d * side;
        if (!free(x, z, -0.3) || treeList.some((t) => Math.abs(t.x - x) < 2.6 && Math.abs(t.z - z) < 2.6)) continue;
        const sid = SECTS[sectAt(x, z)].id, y = trailHeight(x, z);
        if (y < WATER_Y + 0.15 || (sid === 'purvs' && r1 > 0.12) || (sid === 'ozoli' && r1 > 0.2)) continue;
        const [s0, s1] = SCL[sid];
        treeList.push({ id: treeList.length, kind: sectKind(sid, x, z, r3), x, z, y: y - 0.1, ry: r4 * TAU, s: s0 + r3 * s1 });
      }
    }
  }
  // pamežs: krūmi, papardes, akmeņi; pļavās puķes; stāvās nogāzēs — klintis
  for (let gx = -320; gx < 320; gx += 4.2) for (let gz = -300; gz < 850; gz += 4.2) {
    const x = gx + (rnd() - 0.5) * 3.6, z = gz + (rnd() - 0.5) * 3.6, r1 = rnd(), r2 = rnd(), r3 = rnd();
    if (z > shoreZ(x) - 44 || !free(x, z, -1.5)) continue;
    if (r1 < 0.07 && mountAt(x, z) > 0.2 && steep(x, z) > 0.75) {
      rockList.push({ id: rockList.length, kind: r2 < 0.5 ? 'kl' : 'kl2', x, z, y: trailHeight(x, z) - 0.4, ry: r3 * TAU, s: 1.2 + r2 * 2.2 });
      continue;
    }
    const f = forestAt(x, z), sid = SECTS[sectAt(x, z)].id, h = trailHeight(x, z);
    let kind = null, y = h - 0.03;
    const pick = (list) => { let a = 0; for (const [k, pr] of list) { a += pr; if (r1 < a) return k; } return null; };
    if (sid === 'purvs' && bogAt(x, z) > 0.3) {
      if (h < WATER_Y - 0.08) { kind = r1 < 0.12 ? 'lp' : null; y = WATER_Y + 0.02; }
      else if (h < WATER_Y + 0.32) kind = pick([['ni', 0.32], ['sp', 0.08]]);
      else kind = pick([['sp', 0.14], ['kr', 0.06], ['vi', 0.06]]);
    } else if (h < WATER_Y + 0.05) continue;
    else if (sid === 'egles') kind = f > 0.4 ? pick([['su', 0.1], ['pa', 0.06], ['se', 0.025], ['ak', 0.02]]) : pick([['kr', 0.06], ['su', 0.05]]);
    else if (sid === 'berzi') kind = f > 0.4 ? pick([['pa', 0.14], ['zi', 0.1], ['kr', 0.05]]) : pick([['zi', 0.22], ['kr', 0.03]]);
    else if (sid === 'ozoli') kind = pick([['pa', 0.2], ['kr', 0.08], ['ak', 0.02], ['zi', f > 0.4 ? 0 : 0.08]]);
    else if (sid === 'sils') kind = pick([['vi', 0.16], ['kr', 0.04], ['ak', 0.015], ['se', 0.008]]);
    else if (f > 0.4) { if (r1 < 0.16) kind = 'pa'; else if (r1 < 0.24) kind = 'kr'; else if (r1 < 0.255) kind = 'ak'; }
    else if (r1 < 0.12) kind = 'zi'; else if (r1 < 0.15) kind = 'kr';
    if (!kind) continue;
    underList.push({ id: underList.length, kind, x, z, y, ry: r3 * TAU, s: 0.75 + r2 * 0.6 });
  }
  // 1.43.0: strauta krasti — niedres, ūdensrozes, akmeņi ūdenī
  for (let x = -330; x < 330; x += 1.9) {
    if (Math.abs(x - BRIDGE.x) < 9) continue;
    const sz = streamZ(x), hw = streamHW(x), dz = streamDZ(x), nl = Math.sqrt(1 + dz * dz), nx = -dz / nl, nz = 1 / nl;
    for (const side of [-1, 1]) {
      const r1 = rnd(), r2 = rnd(), r3 = rnd();
      if (r1 < 0.42) { const o = hw - 0.6 + r2 * 1.8; underList.push({ id: underList.length, kind: 'ni', x: x + nx * o * side, z: sz + nz * o * side, y: trailHeight(x + nx * o * side, sz + nz * o * side) - 0.05, ry: r3 * TAU, s: 0.8 + r2 * 0.5 }); }
      else if (r1 < 0.56 && hw > 4.3) { const o = hw - 1.4 - r2 * 1.6; underList.push({ id: underList.length, kind: 'lp', x: x + nx * o * side, z: sz + nz * o * side, y: WATER_Y + 0.02, ry: r3 * TAU, s: 0.8 + r2 * 0.5 }); }
    }
    if (rnd() < 0.07) { const o = (rnd() - 0.5) * hw * 1.3, s = 0.45 + rnd() * 0.4; rockList.push({ id: rockList.length, kind: 'kl', x: x + nx * o, z: sz + nz * o, y: WATER_Y - 0.35 * s - 0.1, ry: rnd() * TAU, s }); }
  }
  return treeList;
}

// ---------- kartes attēls (zīmē minikarte, arī neesot šajā zemē) ----------
let mapCanvas = null;
export function trailMap() {
  if (mapCanvas) return mapCanvas;
  // 1.39.0: augstumus rēķina vienreiz (ēnām ņem kaimiņu pikseli), lai spēles sākumā karte neaizkavētu
  const W = 150, Hh = 300, c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const g = c.getContext('2d'), img = g.createImageData(W, Hh);
  const sx = 2 * H / W, sz = (SOUTH_END + H) / Hh, hs = new Float32Array(W * Hh);
  for (let py = 0; py < Hh; py++) for (let px = 0; px < W; px++) hs[py * W + px] = trailHeight(-H + (px + 0.5) * sx, -H + (py + 0.5) * sz);
  for (let py = 0; py < Hh; py++) for (let px = 0; px < W; px++) {
    const x = -H + (px + 0.5) * sx, z = -H + (py + 0.5) * sz;
    const h = hs[py * W + px];
    let col;
    if (h < WATER_Y) col = h < -1.5 ? [44, 110, 170] : [70, 150, 205];
    else if (h < 1.5 && z > shoreZ(x) - 50) col = [226, 208, 150];
    else { const f = forestAt(x, z); col = [lerp(122, 48, f), lerp(176, 96, f), lerp(78, 40, f)]; }
    const st = Math.hypot(hs[py * W + Math.min(W - 1, px + 1)] - h, hs[Math.min(Hh - 1, py + 1) * W + px] - h) / sx;
    if (st > 0.55 && h >= WATER_Y) { const r = Math.min(1, (st - 0.55) * 2); col = col.map((v, j) => lerp(v, [128, 124, 116][j], r)); }
    const sh = Math.max(-22, Math.min(22, (hs[Math.max(0, py - 1) * W + Math.max(0, px - 1)] - h) * 3.5));
    const k = (py * W + px) * 4;
    img.data[k] = Math.max(0, Math.min(255, col[0] + sh)); img.data[k + 1] = Math.max(0, Math.min(255, col[1] + sh)); img.data[k + 2] = Math.max(0, Math.min(255, col[2] + sh)); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const toPx = (x, z) => [(x + H) / sx, (z + H) / sz];
  g.strokeStyle = '#b08850'; g.lineWidth = 2; g.setLineDash([4, 2]);
  g.beginPath(); trailLayout().line.forEach((p, i) => { const [a, b] = toPx(p.x, p.z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.stroke();
  g.setLineDash([]);
  const T = trailLayout().tunnel; // tunelis — tumšs posms
  if (T) { g.strokeStyle = '#4a4640'; g.lineWidth = 4; g.beginPath(); trailLayout().line.slice(T.i0, T.i1 + 1).forEach((p, i) => { const [a, b] = toPx(p.x, p.z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.stroke(); }
  mapCanvas = c;
  return c;
}
// NPC ikonas kartei (lokālās koordinātēs)
// 1.43.0: + vēl nenovāktie šķēršļi (k = 'o')
export function trailIcons(tr) {
  const L = trailLayout(), out = L.stops.map((s, k) => [TASKS[k].icon, s.x, s.z, k]);
  for (const o of L.obst) if (!tr || ((tr.ob && tr.ob[o.o]) || 0) < OB_TYPES[o.type].hits) out.push([OB_TYPES[o.type].icon, o.x, o.z, 'o']);
  return out;
}

// ---------- modeļi ----------
const tplCache = {};
function kitTpl(key, fn) { return tplCache[key] || (tplCache[key] = fn()); }
// priekšmetu modeļi (rokās un uz zemes)
export function trailItem(kind) {
  return kitTpl('it-' + kind, () => {
    const k = new A.Kit(300 + kind.length); const G = A.G;
    switch (kind) {
      case 'malka':
        k.add(G.cyl(0.14, 0.15, 0.95, 10), '#6b4a2e', { r: [0, 0, Math.PI / 2], p: [0, 0.15, 0], rough: 0.95, fc: (c) => (Math.abs(c.x) > 0.46 ? '#dcb27a' : null) });
        k.add(G.cyl(0.03, 0.04, 0.22, 5), '#5a3c24', { p: [0.1, 0.27, 0], r: [0.4, 0, 0.3], rough: 0.95 });
        break;
      case 'rieksti':
        for (const [x, z, s] of [[0, 0, 1], [0.08, 0.05, 0.9], [-0.06, 0.07, 0.85]]) {
          k.add(G.sph(0.07 * s, 10, 8), '#9a6232', { p: [x, 0.07 * s, z], s: [1, 1.15, 1], rough: 0.5 });
          k.add(G.sph(0.045 * s, 8, 6), '#d8b880', { p: [x, 0.13 * s, z], s: [1.2, 0.5, 1.2], rough: 0.8 });
        }
        k.add(A.G.leaf(0.18, 0.09), '#5a9a34', { p: [0.02, 0.02, -0.04], r: [-1.4, 0.5, 0], rough: 0.8 });
        break;
      case 'abols':
        k.add(G.sph(0.12, 14, 10), '#d8362a', { p: [0, 0.12, 0], s: [1, 0.92, 1], rough: 0.4, fc: (c) => (c.x > 0.05 && c.y > 0.12 ? '#f0c040' : null) });
        k.add(G.cyl(0.008, 0.01, 0.07, 4), '#5a3c24', { p: [0, 0.25, 0], rough: 0.9 });
        k.add(A.G.leaf(0.09, 0.045), '#4f9a38', { p: [0.03, 0.25, 0], r: [0, 0, -1.0], rough: 0.8 });
        break;
      case 'delis':
        k.add(G.rbox(0.3, 0.06, 1.7, 0.02), '#b47c48', { p: [0, 0.04, 0], rough: 0.85, fc: (c) => (Math.floor(c.z * 6) % 3 === 0 ? '#a26c3c' : null) });
        break;
      case 'gliemezis': {
        const fan = new THREE.SphereGeometry(0.13, 14, 8, 0, Math.PI, 0, Math.PI / 2);
        k.add(fan, '#f4d2bc', { p: [0, 0.02, 0], r: [-Math.PI / 2, 0, 0], s: [1, 1, 0.35], rough: 0.5, double: true, fc: (c) => (Math.floor((Math.atan2(c.x, c.y) + 3.2) * 4) % 2 ? '#e8a48a' : null) });
        k.add(G.rbox(0.06, 0.03, 0.04, 0.01), '#e8a48a', { p: [0, 0.02, -0.01], rough: 0.5 });
        break;
      }
    }
    return k.build({ name: 'trail-' + kind });
  });
}
const cloneItem = (kind, sc = 1) => { const o = trailItem(kind).clone(); o.scale.setScalar(sc); return o; };
const ITEM_SCALE = { malka: 1, rieksti: 1.8, abols: 1.4, delis: 1, gliemezis: 1.9 };

// koks tuvumā — no komplekta; tālumā — vienkāršs (maz trīsstūru)
function lowTree(kind) {
  return kitTpl('lo-' + kind, () => {
    const k = new A.Kit(400 + kind.length), G = A.G;
    if (kind === 'egle') { k.add(G.cyl(0.18, 0.24, 2, 5), '#5a3d28', { p: [0, 1, 0] }); k.add(G.cone(2.0, 7.6, 7), '#2c5e3c', { p: [0, 5.0, 0], grad: [0.6, 1.1] }); }
    else if (kind === 'priede') { k.add(G.cyl(0.14, 0.22, 7.2, 5), '#8a5232', { p: [0, 3.6, 0] }); k.add(G.ico(1.8, 0), '#2f5f34', { p: [0, 7.6, 0], s: [1.2, 0.6, 1.2], grad: [0.65, 1.1] }); }
    else if (kind === 'berzs') { k.add(G.cyl(0.08, 0.15, 5.2, 5), '#efece2', { p: [0, 2.6, 0] }); k.add(G.ico(1.7, 0), '#7fae3e', { p: [0, 5.4, 0], s: [0.9, 1.25, 0.9], grad: [0.7, 1.1] }); }
    else { k.add(G.cyl(0.3, 0.5, 3.2, 6), '#5e4430', { p: [0, 1.6, 0] }); k.add(G.ico(2.9, 0), '#3f6f2a', { p: [0, 5.4, 0], s: [1, 0.78, 1], grad: [0.6, 1.1] }); }
    return k.build({ name: 'lotree-' + kind });
  });
}
function underTpl(kind) {
  return kitTpl('un-' + kind, () => {
    const k = new A.Kit(500 + kind.length), G = A.G;
    if (kind === 'kr') { k.add(G.blob(0.75, 1, 0.2, 3), '#3f7a2e', { p: [0, 0.5, 0], s: [1.2, 0.8, 1.1], rough: 0.85, grad: [0.6, 1.1], sway: 0.25 }); k.add(G.blob(0.5, 1, 0.2, 5), '#4c8a34', { p: [0.5, 0.45, 0.3], rough: 0.85, sway: 0.25 }); }
    else if (kind === 'pa') {
      const lf = G.leaf(0.75, 0.2, { rows: 5, fold: 0.35, bend: 0.45 });
      for (let i = 0; i < 7; i++) k.add(lf, i % 2 ? '#4f8f2e' : '#5c9c38', { p: [0, 0.05, 0], r: [-0.75, i / 7 * TAU, 0], ro: 'YXZ', rough: 0.8, sway: (v) => Math.min(1, v.y * 1.6) });
    } else if (kind === 'ak') { k.add(G.dodeca(0.5), '#8a8a82', { p: [0, 0.18, 0], s: [1.3, 0.7, 1], rough: 0.95, jit: 0.08 }); }
    else if (kind === 'ni') { // niedres ar vālītēm
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, r = 0.08 + (i % 3) * 0.1, hh = 1.1 + (i % 4) * 0.25, x = Math.sin(a) * r, z = Math.cos(a) * r;
        k.add(G.cyl(0.012, 0.02, hh, 4), i % 2 ? '#6a8a3a' : '#7a9a44', { p: [x, hh / 2, z], r: [Math.sin(a) * 0.08, 0, Math.cos(a) * 0.08], sway: (v) => Math.min(1, v.y / hh) });
        if (i % 3 === 0) k.add(G.caps(0.035, 0.16, 3, 6), '#6a4026', { p: [x + Math.sin(a) * 0.08 * hh, hh + 0.08, z + Math.cos(a) * 0.08 * hh], rough: 0.9, sway: 1 });
        else k.add(G.leaf(0.5, 0.05), '#6f9440', { p: [x, 0.3, z], r: [-0.3, a, 0], ro: 'YXZ', sway: 0.6 });
      }
    } else if (kind === 'lp') { // ūdensroze (lapa uz ūdens, dažai zieds)
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.absarc(0, 0, 0.4, 0.25, TAU - 0.25, false); shape.lineTo(0, 0);
      k.add(new THREE.ShapeGeometry(shape, 10), '#3f7a2e', { r: [-Math.PI / 2, 0, 0], rough: 0.4, double: true });
      k.add(new THREE.ShapeGeometry(shape, 8), '#4c8a36', { p: [0.55, 0.005, 0.2], r: [-Math.PI / 2, 0, 2], s: 0.65, rough: 0.4, double: true });
      k.add(A.flowerGeo(0.1, 8, 0.03, 0.5), '#fff4f6', { p: [0.1, 0.06, -0.1], r: [-Math.PI / 2, 0, 0], rough: 0.6 });
      k.add(G.sph(0.03, 6, 5), '#f2d040', { p: [0.1, 0.08, -0.1] });
    } else if (kind === 'sp') { // spilves (baltas pūkas)
      for (let i = 0; i < 6; i++) { const a = i * 1.1, r = 0.05 + (i % 2) * 0.1, hh = 0.45 + (i % 3) * 0.1; k.add(G.cyl(0.006, 0.008, hh, 3), '#7a8a4a', { p: [Math.sin(a) * r, hh / 2, Math.cos(a) * r], sway: 0.6 }); k.add(G.sph(0.045, 6, 5), '#fbfbf4', { p: [Math.sin(a) * r, hh + 0.03, Math.cos(a) * r], s: [1, 1.3, 1], rough: 1, sway: 1 }); }
      k.add(G.blob(0.25, 1, 0.2, 3), '#8a9a4a', { p: [0, 0.08, 0], s: [1, 0.4, 1], rough: 0.9 });
    } else if (kind === 'se') { // mušmires
      for (const [x, z, s] of [[0, 0, 1], [0.25, 0.15, 0.7]]) {
        k.add(G.cyl(0.035 * s, 0.05 * s, 0.22 * s, 7), '#f4f0e4', { p: [x, 0.11 * s, z] });
        k.add(G.hemi(0.12 * s, 12, 6), '#d8261e', { p: [x, 0.2 * s, z], s: [1, 0.7, 1], rough: 0.4, fc: (c) => (Math.sin(c.x * 90) * Math.sin(c.z * 90) > 0.7 ? '#ffffff' : null) });
      }
    } else if (kind === 'su') { // sūnu ciņš
      k.add(G.blob(0.55, 1, 0.25, 7), '#4f7a2a', { p: [0, 0.1, 0], s: [1.3, 0.45, 1.1], rough: 1, grad: [0.75, 1.15], jit: 0.1 });
      k.add(G.blob(0.3, 1, 0.25, 9), '#5f8a30', { p: [0.45, 0.08, 0.2], s: [1, 0.5, 1], rough: 1 });
    } else if (kind === 'vi') { // virši (rozā violeti)
      k.add(G.blob(0.45, 0, 0.3, 4), '#5a6a3a', { p: [0, 0.2, 0], s: [1.2, 0.6, 1.1], rough: 0.95 });
      for (let i = 0; i < 7; i++) { const a = i * 0.9; k.add(G.blob(0.16, 0, 0.3, i), i % 2 ? '#b0609a' : '#c87ab0', { p: [Math.sin(a) * 0.35, 0.36 + (i % 3) * 0.04, Math.cos(a) * 0.3], rough: 0.9, sway: 0.4 }); }
    }
    else {
      const cols = ['#ffffff', '#ffd83a', '#b06ae0', '#ff6b8a'];
      for (let i = 0; i < 5; i++) { const a = i * 1.3, r = 0.2 + (i % 2) * 0.15; k.add(G.cyl(0.008, 0.008, 0.32, 3), '#4f8f2e', { p: [Math.sin(a) * r, 0.16, Math.cos(a) * r], sway: 0.6 }); k.add(A.flowerGeo(0.06, 6, 0.01), cols[i % 4], { p: [Math.sin(a) * r, 0.33, Math.cos(a) * r], r: [-Math.PI / 2, 0, 0], sway: 1 }); }
    }
    return k.build({ name: 'under-' + kind });
  });
}

// 1.41.0: lielie akmeņi — savs akmens materiāls ar faktūru (procedurāla; augstākā grafikā foto rock_c/rock_n kā meža akmeņiem)
let rockM = null, rockNoise = null;
function rockMaterial() {
  if (rockM) return rockM;
  rockNoise = noiseTexture('stone', 128); rockNoise.wrapS = rockNoise.wrapT = THREE.RepeatWrapping; rockNoise.repeat.set(2, 2);
  rockM = new THREE.MeshStandardMaterial({ vertexColors: true, map: rockNoise, roughness: 0.95, metalness: 0 });
  return rockM;
}
function setRockPhoto(on, game) {
  const m = rockMaterial();
  if (on && game.ensurePhoto) {
    game.ensurePhoto().rock.then((r) => {
      if (!r || !game.Q || !game.Q.photo) return;
      const [map, nrm] = r;
      m.map = map; m.normalMap = nrm; m.color.setScalar(2.2); m.needsUpdate = true;
    });
  } else if (m.map !== rockNoise) { m.map = rockNoise; m.normalMap = null; m.color.setScalar(1); m.needsUpdate = true; }
}
// akmens ģeometrija: deformēta ikosaedra lode, pelēka ar variācijām, sūnas augšpusē, tumšāka apakša
function rockGeo(seed, detail, sy, amp, crisp) {
  const rn = makeNoise2D(SEED + seed);
  let g = new THREE.IcosahedronGeometry(1, detail);
  if (crisp) g = g.toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + rn(x * 1.1 + z * 0.7, y * 1.1) * amp + rn(x * 3.1 - z, y * 3.1 + z) * amp * 0.3;
    p.setXYZ(i, x * k, Math.max(-0.35, y * k * sy), z * k);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const stone = new THREE.Color('#8f8c84'), moss = new THREE.Color('#5d6e34');
  for (let i = 0; i < p.count; i++) {
    c.copy(stone).multiplyScalar(0.82 + rn(p.getX(i) * 4, p.getZ(i) * 4) * 0.16);
    const up = n.getY(i);
    if (up > 0.6) c.lerp(moss, Math.min(0.75, (up - 0.6) * 2.4 * (0.55 + 0.45 * rn(p.getX(i) * 2, p.getZ(i) * 2))));
    if (p.getY(i) < 0) c.multiplyScalar(0.72);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function rockTpl(kind) {
  return kitTpl('rk-' + kind, () => {
    const grp = new THREE.Group(), m = rockMaterial();
    const add = (geo, x, y, z, sx, sy, sz, ry) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; grp.add(o); };
    if (kind === 'kl') { // apaļš laukakmens + mazs blakus
      add(rockGeo(61, 2, 0.75, 0.2, false), 0, 0.42, 0, 1.25, 1, 1, 0);
      add(rockGeo(62, 1, 0.8, 0.22, false), 0.95, 0.2, 0.35, 0.55, 0.55, 0.6, 1.1);
    } else { // šķautnaina klints
      add(rockGeo(63, 1, 1.35, 0.3, true), 0, 0.75, 0, 0.95, 1, 0.85, 0.4);
      add(rockGeo(64, 1, 0.8, 0.25, true), -0.75, 0.2, 0.45, 0.5, 0.5, 0.5, 0.2);
    }
    return grp;
  });
}

// ---------- reljefa režģis ----------
const X0 = -400, Z0 = -400, CELL = 3.125, NX = 256, NZ = 448, TILE = 64, TLOD = [90, 220];
let heightCache = null;

export class TrailZone {
  constructor(id, game) {
    this.id = id;
    this.game = game;
    this.hi = !!(game.Q && game.Q.photo);
    this.open = ['n'];
    this.group = new THREE.Group();
    this.water = null;
    this.platforms = [];
    this.grassCenter = null;
    this.grid = new Map();
    this.lay = trailLayout();
    const n = NX + 1;
    if (!heightCache) { // reljefs ir noteikts (vienāds katru reizi) — otrreiz ienākot nav jārēķina
      heightCache = new Float32Array(n * (NZ + 1));
      for (let iz = 0; iz <= NZ; iz++) for (let ix = 0; ix <= NX; ix++) heightCache[iz * n + ix] = trailHeight(X0 + ix * CELL, Z0 + iz * CELL);
    }
    this.heights = heightCache;
    this.lastSide = -1;  // kurā strauta pusē biju (−1 ziemeļos)
    this.state = null;
  }

  getHeight(x, z) {
    const fx = (x - X0) / CELL, fz = (z - Z0) / CELL;
    if (fx < 0 || fz < 0 || fx >= NX || fz >= NZ) return fz >= NZ ? -6 : GROUND_Y;
    const n = NX + 1, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, Hh = this.heights;
    const ha = Hh[iz * n + ix], hb = Hh[(iz + 1) * n + ix], hc = Hh[(iz + 1) * n + ix + 1], hd = Hh[iz * n + ix + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }
  bridgeY(z) { return lerp(this.bridgeA, this.bridgeB, clamp((z - (BZ - BRIDGE.hl)) / (2 * BRIDGE.hl), 0, 1)) + 0.28; }
  onBridge(x, z) { return Math.abs(x - BRIDGE.x) < BRIDGE.hw && Math.abs(z - BZ) < BRIDGE.hl + 0.4; }
  groundAt(x, z) {
    const h = this.getHeight(x, z);
    if (this.bridgeDone && this.onBridge(x, z)) return Math.max(h, this.bridgeY(z));
    // laipa purvā
    const B = this.lay.bwBox;
    if (B && x > B[0] && x < B[2] && z > B[1] && z < B[3]) {
      const n = this.lay.idx.near(x, z);
      if (n.p && n.p.bw > 0 && n.d < BW_HW + 0.45) return Math.max(h, n.p.h + BW_Y * n.p.bw * (1 - smoothstep(BW_HW, BW_HW + 0.45, n.d)));
    }
    return h;
  }
  roadDist(x, z) { return Math.max(0, this.lay.idx.near(x, z).d - (TRAIL_HW - ROAD_HW_FIX)); }
  isWater(x, z) { return this.getHeight(x, z) < WATER_Y - 0.2; }
  // skaņām: putni mežā, vējš un viļņi pie jūras
  ambience(x, z) { const s = smoothstep(shoreZ(x) - 120, shoreZ(x) - 20, z); return { birds: 0.5 * (1 - s), wind: 0.12 + 0.4 * s }; }

  addCollider(x, z, r) {
    const k = Math.floor(x / 8) + ',' + Math.floor(z / 8);
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push([x, z, r]);
  }
  collide(pos, radius = 0.5) {
    const cx = Math.floor(pos.x / 8), cz = Math.floor(pos.z / 8);
    let hit = false;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this.grid.get((cx + a) + ',' + (cz + b));
      if (!list) continue;
      for (const c of list) {
        const dx = pos.x - c[0], dz = pos.z - c[1], min = c[2] + radius, d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2); pos.x = c[0] + dx / d * min; pos.z = c[1] + dz / d * min; hit = true; }
      }
    }
    // malas: žogs austrumos/rietumos, jūrā tālāk neaizpeld, ziemeļos — pāreja uz sētu
    if (pos.x > H) { pos.x = H; hit = true; }
    if (pos.x < -H) { pos.x = -H; hit = true; }
    if (pos.z > SEA_LIMIT) { pos.z = SEA_LIMIT; hit = true; }
    const nl = -H - CROSS_AT - 3;
    if (pos.z < nl) { pos.z = nl; hit = true; }
    // 1.40.0: stāvā krauja — uz augšu gandrīz netiek (taka aizā paliek taka); slīd gar sienu, ja var
    const lp = this.lp;
    if (lp && radius < 0.9) {
      const dx = pos.x - lp.x, dz = pos.z - lp.z, d = Math.hypot(dx, dz);
      if (d > 1e-4 && d < 2) {
        const h0 = this.groundAt(lp.x, lp.z), ok = (x, z) => this.groundAt(x, z) - h0 <= Math.hypot(x - lp.x, z - lp.z) * 1.1 + 0.02;
        if (!ok(pos.x, pos.z)) {
          if (Math.abs(dx) > 1e-4 && ok(pos.x, lp.z)) pos.z = lp.z;
          else if (Math.abs(dz) > 1e-4 && ok(lp.x, pos.z)) pos.x = lp.x;
          else { pos.x = lp.x + dx * 0.1; pos.z = lp.z + dz * 0.1; }
          hit = true;
        }
      }
    }
    // strauts: kamēr nav tilta, pāri netiek (krasts kā siena)
    const sz = streamZ(pos.x), band = streamHW(pos.x) + 3, sd = Math.abs(pos.z - sz) < 40 ? streamDist(pos.x, pos.z) : 99;
    if (!this.bridgeDone && sd < band) {
      // atpakaļ uz krastu (pa strauta normāli no tuvākā punkta)
      const np = streamIdx().near(pos.x, pos.z).p || { x: pos.x, z: sz }, dz = streamDZ(np.x), nl = Math.sqrt(1 + dz * dz);
      pos.x = np.x - dz / nl * this.lastSide * band; pos.z = np.z + 1 / nl * this.lastSide * band; hit = true;
    } else if (sd >= band) this.lastSide = pos.z > sz ? 1 : -1;
    // 1.43.0: tunelī — sienas; šķēršļi, kamēr nav novākti
    const tn = this.inTunnel(pos.x, pos.z);
    const lim = TUN_W - 0.05 - Math.min(radius, 0.5);
    if (tn && tn.d > lim) {
      const k = lim / tn.d;
      pos.x = tn.p.x + (pos.x - tn.p.x) * k; pos.z = tn.p.z + (pos.z - tn.p.z) * k; hit = true;
    }
    for (const o of this.lay.obst) {
      if (this.obClear && this.obClear[o.o]) continue;
      const dx = pos.x - o.x, dz = pos.z - o.z;
      if (dx * dx + dz * dz > 2200) continue;
      const along = dx * o.tx + dz * o.tz, across = dx * o.nx + dz * o.nz, w = OB_HALF + radius;
      if (Math.abs(along) < w && across > -o.wl && across < o.wr) {
        // izstumj atpakaļ uz to pusi, no kuras nāk
        const side = this.lp ? Math.sign((this.lp.x - o.x) * o.tx + (this.lp.z - o.z) * o.tz) || 1 : Math.sign(along) || 1;
        pos.x += o.tx * (side * w - along); pos.z += o.tz * (side * w - along); hit = true;
      }
    }
    this.lp = { x: pos.x, z: pos.z };
    return hit;
  }
  // tunelī: tuvākais takas punkts un attālums (citur null)
  inTunnel(x, z) {
    const T = this.lay.tunnel;
    if (!T || x < T.box[0] || x > T.box[2] || z < T.box[1] || z > T.box[3]) return null;
    const n = this.lay.idx.near(x, z);
    return n.p && n.p.i >= T.i0 && n.p.i <= T.i1 && n.d < TUN_W + 1 ? { p: n.p, d: n.d } : null;
  }
  // kamera nedrīkst būt tuneļa sienā (izņemot pa galiem)
  camBlock(x, y, z) {
    const T = this.lay.tunnel;
    if (!T || x < T.box[0] - 4 || x > T.box[2] + 4 || z < T.box[1] - 4 || z > T.box[3] + 4) return false;
    const n = this.lay.idx.near(x, z);
    if (!n.p || n.p.i < T.i0 || n.p.i > T.i1) return false;
    return n.d > TUN_W - 0.35 || y > n.p.h + tunArch(n.d) - 0.3;
  }
  // kameras griesti tunelī
  ceilingAt(x, z) {
    const t = this.inTunnel(x, z);
    return t && t.d < TUN_W ? t.p.h + tunArch(t.d) - 0.45 : Infinity;
  }
  // dzīvniekiem (wildlife.js)
  bogAt(x, z) { return bogAt(x, z); }
  forestAt(x, z) { return forestAt(x, z); }
  mountAt(x, z) { return mountAt(x, z); }
  shoreZ(x) { return shoreZ(x); }
  // vai šī vieta ir aiz strauta (dienvidos)
  southOfStream(x, z) { return z > streamZ(x); }

  updateVisibility(x, z) {
    if (this.tiles) for (const t of this.tiles) {
      const d = Math.hypot(Math.max(0, Math.abs(x - t.cx) - t.h), Math.max(0, Math.abs(z - t.cz) - t.h));
      const k = d < TLOD[0] ? 0 : d < TLOD[1] ? 1 : 2;
      if (k !== t.k) { t.lods[t.k].visible = false; t.lods[k].visible = true; t.k = k; }
    }
    if (!this.trees) return;
    const far = Math.min(this.viewFar || 360, 420);
    this.trees.update(x, z);
    this.treesLo.view = far;
    this.treesLo.update(x, z);
    this.under.view = Math.min(60, far);
    this.under.update(x, z);
    this.rocks.view = Math.min(170, far);
    this.rocks.update(x, z);
  }
  updateClouds() { /* */ }

  build(parent) {
    const G = this.group;
    this.buildTerrain(G);
    this.buildWater(G);
    // koki (tuvumā pilni, tālumā vienkārši) un pamežs
    const trees = trailTrees();
    for (const t of trees) if (Math.abs(t.x) < H + 2) this.addCollider(t.x, t.z, 0.42 * t.s);
    this.trees = new InstanceField(trees, (k) => A.buildTree(k), { chunk: 48, view: 58 });
    this.trees.build(G);
    this.treesLo = new InstanceField(trees, (k) => lowTree(k), { chunk: 48, view: 360, minView: 58 });
    this.treesLo.build(G);
    for (const u of underList) if (u.kind === 'ak') this.addCollider(u.x, u.z, 0.45 * u.s);
    for (const r of rockList) this.addCollider(r.x, r.z, 1.05 * r.s);
    this.rocks = new InstanceField(rockList, (k) => rockTpl(k), { chunk: 48, view: 170 });
    this.rocks.build(G);
    this.under = new InstanceField(underList, (k) => underTpl(k), { chunk: 48, view: 60 });
    this.under.build(G);
    // taka (šaurāks ceļš; pie tilta un pludmalē nezīmē)
    const segs = [];
    let cur = [];
    for (const p of this.lay.line) {
      const skip = (Math.abs(p.x - BRIDGE.x) < 4 && Math.abs(p.z - BZ) < BRIDGE.hl + 1) || p.z > 800 || p.bw > 0;
      if (skip) { if (cur.length > 2) segs.push(cur); cur = []; } else cur.push(p);
    }
    if (cur.length > 2) segs.push(cur);
    G.add(buildRoadMesh(segs, (x, z) => this.getHeight(x, z), 0.05, TRAIL_HW, pathMaterial()));
    this.buildStops(G);
    this.buildBridge(G);
    this.buildTunnel(G);
    this.buildBoardwalk(G);
    this.buildObstacles(G);
    this.buildSectSigns(G);
    this.buildLodge(G);
    this.buildFence(G);
    // 1.43.0: dzīvnieki (vardes, pīles, zaķi, stirnas, stārķi, tauriņi)
    this.life = new TrailLife(this, this.game);
    this.life.build(G);
    G.add(buildBorderPosts(this.open, (x, z) => this.getHeight(x, z)));
    // zīme pie ieejas
    const sg = makeSignBoard('🧭 Piedzīvojumu taka', { h: 0.62, style: 'road', back: '🏡 Mežvidu sēta' });
    sg.obj.position.set(7.5, this.getHeight(7.5, -296) + 1.75, -296); sg.obj.rotation.y = Math.PI;
    G.add(sg.obj);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.1, 6), wood()); p.position.set(7.5 + s * (sg.w / 2 - 0.25), this.getHeight(7.5, -296) + 1.05, -296.05); G.add(p); }
    this.addCollider(7.5, -296, 0.6);
    parent.add(G);
    if (this.state) this.applyState(this.state);
    return this.photoReady || Promise.resolve();
  }

  buildTerrain(G) {
    const n = NX + 1, Hh = this.heights, cnt = n * (NZ + 1);
    const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3), spl = new Float32Array(cnt * 4), uv = new Float32Array(cnt * 2);
    const hAt = (ix, iz) => Hh[clamp(iz, 0, NZ) * n + clamp(ix, 0, NX)];
    const c = new THREE.Color(), nv = new THREE.Vector3();
    const fl = new THREE.Color(), MEADOW = new THREE.Color(0.4, 0.55, 0.2), MUD = new THREE.Color(0.2, 0.19, 0.11);
    const SFLOOR = [[0.24, 0.25, 0.13], [0.3, 0.37, 0.15], [0.15, 0.2, 0.1], [0.27, 0.24, 0.12], [0.3, 0.33, 0.15], [0.24, 0.26, 0.13], [0.4, 0.36, 0.22], [0.24, 0.25, 0.13]].map((a) => new THREE.Color(...a));
    const GRASS = new THREE.Color(0.32, 0.46, 0.17), FLOOR = new THREE.Color(0.24, 0.25, 0.13), DIRT = new THREE.Color(0.42, 0.33, 0.22), SAND = new THREE.Color(0.58, 0.52, 0.38), WET = new THREE.Color(0.42, 0.37, 0.27), ROCK = new THREE.Color(0.4, 0.39, 0.36);
    for (let iz = 0; iz <= NZ; iz++) for (let ix = 0; ix <= NX; ix++) {
      const i = iz * n + ix, x = X0 + ix * CELL, z = Z0 + iz * CELL, h = Hh[i];
      pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
      nv.set(hAt(ix - 1, iz) - hAt(ix + 1, iz), 2 * CELL, hAt(ix, iz - 1) - hAt(ix, iz + 1)).normalize();
      nor[i * 3] = nv.x; nor[i * 3 + 1] = nv.y; nor[i * 3 + 2] = nv.z;
      uv[i * 2] = x / 26; uv[i * 2 + 1] = z / 26;
      const f = forestAt(x, z), td = this.lay.idx.near(x, z).d, sd = Math.abs(z - streamZ(x)) < 22 ? streamDist(x, z) : 99, sz = shoreZ(x), hw = streamHW(x);
      let wF = f * 0.85, wS = 0, wD = 0, wR = smoothstep(0.86, 0.7, nv.y);
      // 1.43.0: posma zemes krāsa (vidējā no 3 vietām — robeža maiga)
      const zz = sectZ(x, z), s1 = sectAt(x, z, zz);
      fl.copy(SFLOOR[s1]);
      if (s1 < 6) { // pie robežas — sajauc ar kaimiņu posmu
        const lo = s1 > 0 ? zz - SECTS[s1].z : 99, hi = s1 < 5 ? SECTS[s1 + 1].z - zz : 99;
        if (lo < 12) fl.lerp(SFLOOR[s1 - 1], 0.5 - lo / 24); else if (hi < 12) fl.lerp(SFLOOR[s1 + 1], 0.5 - hi / 24);
      }
      c.copy(GRASS).lerp(fl, f);
      if (s1 === 1 && f < 0.5) c.lerp(MEADOW, 0.5);                 // bērzu birzī gaišas pļavas
      if (s1 === 6) wS = Math.max(wS, 0.35 * f);                    // priežu silā smilšaina zeme
      if (s1 === 4 && h < WATER_Y + 0.45) { c.lerp(MUD, smoothstep(WATER_Y + 0.45, WATER_Y, h)); wD = Math.max(wD, 0.5); }
      if (wR > 0) c.lerp(ROCK, wR); // stāvas kraujas — akmens
      const tr = 1 - smoothstep(TRAIL_HW - 0.6, TRAIL_HW + 1.4, td);
      if (tr > 0) { wD = Math.max(wD, tr); c.lerp(DIRT, tr); }
      const bank = 1 - smoothstep(hw, hw + 6, sd);
      if (bank > 0) { wD = Math.max(wD, bank * 0.8); c.lerp(DIRT, bank * 0.7); }
      const beach = smoothstep(sz - 58, sz - 44, z) * (h < 2.2 ? 1 : 0.4);
      if (beach > 0) { wS = beach; wF *= 1 - beach; wD *= 1 - beach; c.lerp(z > sz - 4 ? WET : SAND, beach); }
      const sum = wF + wS + wD + wR, kk = sum > 1 ? 1 / sum : 1;
      spl[i * 4] = wF * kk; spl[i * 4 + 1] = wS * kk; spl[i * 4 + 2] = wD * kk; spl[i * 4 + 3] = wR * kk;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    this.baseMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detailTex(), roughness: 1, metalness: 0 });
    this.tiles = [];
    for (let tz = 0; tz < NZ / TILE; tz++) for (let tx = 0; tx < NX / TILE; tx++) {
      const lods = [1, 2, 4].map((st, li) => {
        const cols = [];
        for (let i = 0; i <= TILE / st; i++) cols.push(Math.min(TILE, i * st));
        const C = cols.length, P = [], N = [], CO = [], S = [], U = [], idx = [];
        const gid = (a, b) => (tz * TILE + cols[b]) * n + tx * TILE + cols[a];
        const put = (gi, dy) => { P.push(pos[gi * 3], pos[gi * 3 + 1] + dy, pos[gi * 3 + 2]); N.push(nor[gi * 3], nor[gi * 3 + 1], nor[gi * 3 + 2]); CO.push(col[gi * 3], col[gi * 3 + 1], col[gi * 3 + 2]); S.push(spl[gi * 4], spl[gi * 4 + 1], spl[gi * 4 + 2], spl[gi * 4 + 3]); U.push(uv[gi * 2], uv[gi * 2 + 1]); };
        for (let b = 0; b < C; b++) for (let a = 0; a < C; a++) put(gid(a, b), 0);
        for (let b = 0; b < C - 1; b++) for (let a = 0; a < C - 1; a++) { const i0 = b * C + a; idx.push(i0, i0 + C, i0 + 1, i0 + 1, i0 + C, i0 + C + 1); }
        const edge = (list) => {
          const base = P.length / 3;
          for (const [a, b] of list) put(gid(a, b), -1.5 * st);
          for (let q = 0; q < list.length - 1; q++) {
            const t0 = list[q][1] * C + list[q][0], t1 = list[q + 1][1] * C + list[q + 1][0];
            idx.push(t0, base + q, t1, t1, base + q, base + q + 1, t0, t1, base + q, t1, base + q + 1, base + q);
          }
        };
        const r = [...Array(C).keys()];
        edge(r.map((a) => [a, 0])); edge(r.map((a) => [a, C - 1])); edge(r.map((b) => [0, b])); edge(r.map((b) => [C - 1, b]));
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(CO, 3));
        g.setAttribute('splat', new THREE.Float32BufferAttribute(S, 4));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        g.setIndex(idx);
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, this.baseMat);
        m.receiveShadow = true; m.visible = li === 2;
        G.add(m);
        return m;
      });
      const h = TILE * CELL / 2;
      this.tiles.push({ cx: X0 + tx * TILE * CELL + h, cz: Z0 + tz * TILE * CELL + h, h, lods, k: 2 });
    }
    // līdzenums ap režģi (ziemeļos un sānos; dienvidos ir jūra)
    const B = 1500, x1 = X0 + NX * CELL, zs = SHORE - 70;
    const rects = [[-B, -B, B, Z0], [-B, Z0, X0, zs], [x1, Z0, B, zs]];
    const far = mergeGeometries(rects.map(([a, b, c2, d]) => {
      const g = new THREE.PlaneGeometry(c2 - a, d - b).rotateX(-Math.PI / 2).translate((a + c2) / 2, GROUND_Y - 0.05, (b + d) / 2);
      const k = g.attributes.position.count, co = new Float32Array(k * 3), sp = new Float32Array(k * 4);
      for (let i = 0; i < k; i++) { co.set([0.26, 0.32, 0.15], i * 3); sp.set([0.7, 0, 0, 0], i * 4); }
      g.setAttribute('color', new THREE.BufferAttribute(co, 3)); g.setAttribute('splat', new THREE.BufferAttribute(sp, 4));
      return g;
    }));
    this.far = new THREE.Mesh(far, this.baseMat); this.far.receiveShadow = true; G.add(this.far);
    // foto faktūras (augsta/vidēja grafika) — tas pats materiāls, ko izmanto mežs
    this.applyQuality(this.game);
  }

  // grafikas līmeņa maiņa (izsauc arī quality.js)
  applyQuality(game) {
    const Q = game.Q;
    this.viewFar = Q ? Q.fog[1] : 360;
    const setMat = (m) => { for (const t of this.tiles || []) for (const l of t.lods) l.material = m; if (this.far) this.far.material = m; };
    if (Q && Q.photo && game.ensurePhoto) {
      this.photoReady = game.ensurePhoto().terrain.then((m) => { if (m && game.Q.photo && !this.disposed) { setMat(m); this.photoMat = m; } });
    } else setMat(this.baseMat);
    setRockPhoto(!!(Q && Q.photo), game);
  }

  buildWater(G) {
    const geo = new THREE.PlaneGeometry(2600, 2600).rotateX(-Math.PI / 2).translate(0, WATER_Y, 500);
    const nt = waterNormal();
    this.waterMat = new THREE.MeshStandardMaterial({ color: '#2a6f8e', roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.86, normalMap: nt, normalScale: new THREE.Vector2(0.22, 0.22) });
    this.waterMat.userData.keepPBR = true;
    const m = new THREE.Mesh(geo, this.waterMat);
    m.renderOrder = 2; m.receiveShadow = true;
    G.add(m);
    this.sea = m;
    // putu josla gar krastu
    const pts = [], uvs = [], idx = [];
    for (let i = 0, x = -420; x <= 420; x += 4, i++) {
      const z = shoreZ(x);
      pts.push(x, WATER_Y + 0.03, z - 1.6, x, WATER_Y + 0.03, z + 2.2);
      uvs.push(x / 8, 0, x / 8, 1);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); fg.setIndex(idx); fg.computeVertexNormals();
    this.foamMat = new THREE.MeshStandardMaterial({ map: foamTex(), transparent: true, depthWrite: false, roughness: 0.6, opacity: 0.85 });
    const fm = new THREE.Mesh(fg, this.foamMat); fm.renderOrder = 3; G.add(fm);
    this.foam = fm;
  }

  // NPC, pļaviņas, šķūnītis, grozs, ābeles, lazdas, pludmales lietas
  buildStops(G) {
    const st = new THREE.Group();
    this.npcs = this.lay.stops.map((s, k) => {
      const T = TASKS[k];
      const av = buildAnimal({ animal: T.npc, shirt: T.shirt || '#d23b3b', hat: T.hat || null, wear: T.wear || null });
      if (T.wear) av.setWear(T.wear);
      const y = this.getHeight(s.x, s.z);
      av.root.position.set(s.x, y, s.z);
      av.root.rotation.y = s.face;
      if (av.shadow) av.shadow.visible = true;
      for (let q = 0; q < 20; q++) av.animate(0.05, 'idle', 0);
      const tag = makeTag(T.name, { color: '#ffe9a8' });
      tag.position.y = 2.05; av.root.add(tag);
      G.add(av.root);
      this.addCollider(s.x, s.z, 0.55);
      return { k, s, av, bubble: null, bubbleText: '', t: k * 1.7, near: false };
    });
    // 0: šķūnītis ar malkas grēdu
    const d0 = this.lay.stops[0].drop;
    const shed = shedModel();
    shed.position.set(d0.x, this.getHeight(d0.x, d0.z), d0.z); shed.rotation.y = d0.face + Math.PI;
    st.add(shed);
    const rx = Math.cos(d0.face), rz = -Math.sin(d0.face);
    for (const k of [-1.6, 0, 1.6]) this.addCollider(d0.x + rx * k - Math.sin(d0.face) * 1.2, d0.z + rz * k - Math.cos(d0.face) * 1.2, 0.9);
    this.logs = new THREE.InstancedMesh(trailItem('malka').children[0].geometry, A.toyMaterial(), 8);
    this.logs.position.copy(shed.position); this.logs.rotation.y = shed.rotation.y;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 8; i++) { const col = i % 2, dep = Math.floor(i / 2) % 2, row = Math.floor(i / 4); this.logs.setMatrixAt(i, m4.makeTranslation(-0.55 + col * 1.1, 0.12 + row * 0.27, -0.6 + dep * 0.3 + row * 0.15)); }
    this.logs.count = 0; this.logs.castShadow = true; this.logs.frustumCulled = false; // skaits mainās — robežsfēra no tukša būtu nepareiza
    G.add(this.logs);
    // 1: lazdas
    for (const b of this.lay.stops[1].bushes) {
      const bush = hazelModel(); bush.position.set(b.x, this.getHeight(b.x, b.z), b.z); bush.rotation.y = b.x; st.add(bush);
      this.addCollider(b.x, b.z, 0.9);
    }
    // 2: ābeles un grozs
    for (const t of this.lay.stops[2].trees) {
      const tr = A.buildFruitTree('abele', 2, true); tr.position.set(t.x, this.getHeight(t.x, t.z), t.z); tr.rotation.y = t.z; st.add(tr);
      this.addCollider(t.x, t.z, 0.45);
    }
    const d2 = this.lay.stops[2].drop;
    const basket = basketModel(); basket.position.set(d2.x, this.getHeight(d2.x, d2.z), d2.z); st.add(basket);
    this.addCollider(d2.x, d2.z, 0.45);
    this.apples = new THREE.InstancedMesh(trailItem('abols').children[0].geometry, A.toyMaterial(), 8);
    this.apples.position.copy(basket.position);
    for (let i = 0; i < 8; i++) { const a = i * 2.4; this.apples.setMatrixAt(i, m4.makeTranslation(Math.sin(a) * 0.17 * (i % 3 ? 1 : 0.2), 0.2 + Math.floor(i / 4) * 0.09, Math.cos(a) * 0.17 * (i % 3 ? 1 : 0.2))); }
    this.apples.count = 0; this.apples.frustumCulled = false;
    G.add(this.apples);
    // 4: pludmale — lapsas būdiņa, laiva, akmeņi
    const s4 = this.lay.stops[4];
    const hut = beachHutModel(); const hx = s4.x - 7, hz = s4.z - 6;
    hut.position.set(hx, this.getHeight(hx, hz), hz); hut.rotation.y = 0.3; st.add(hut);
    this.addCollider(hx, hz, 1.6);
    const boat = boatModel(); const bx = 44, bz = shoreZ(44) - 2;
    boat.position.set(bx, Math.max(this.getHeight(bx, bz), WATER_Y) + 0.05, bz); boat.rotation.y = 1.2; boat.rotation.z = 0.08; st.add(boat);
    this.addCollider(bx, bz, 1.4);
    // zīmes pie katra NPC
    this.lay.stops.forEach((s, k) => {
      const T = TASKS[k];
      const sg = makeSignBoard(`${T.icon} ${T.title}`, { h: 0.36, minW: 1.8 });
      const px = s.x + Math.cos(s.face) * 2.2 + Math.sin(s.face) * 1.5, pz = s.z - Math.sin(s.face) * 2.2 + Math.cos(s.face) * 1.5;
      sg.obj.position.set(px, this.getHeight(px, pz) + 1.35, pz); sg.obj.rotation.y = s.face;
      st.add(sg.obj);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.4, 6), wood()); post.position.set(px, this.getHeight(px, pz) + 0.6, pz); st.add(post);
      this.addCollider(px, pz, 0.25);
    });
    G.add(st);
    // priekšmeti (aktīvajam uzdevumam)
    this.itemGroup = new THREE.Group();
    G.add(this.itemGroup);
    this.itemObjs = [];
    this.itemsFor = null;
  }

  // 1.43.0: klinšu tunelis — arka pār taku (iekšpuse, ārpuse, portāli), balsti un laternas
  buildTunnel(G) {
    const T = this.lay.tunnel;
    if (!T) return;
    const line = this.lay.line, NR = 18, rn = makeNoise2D(SEED + 77);
    const rings = [];
    for (let i = T.i0; i <= T.i1; i++) {
      const p = line[i], q = line[Math.min(line.length - 1, i + 1)], o = line[Math.max(0, i - 1)];
      const tx = q.x - o.x, tz = q.z - o.z, tl = Math.hypot(tx, tz) || 1;
      rings.push({ p, nx: -tz / tl, nz: tx / tl, tx: tx / tl, tz: tz / tl, s: (i - T.i0) * 1.5 });
    }
    const RN = rings.length, P = [], C = [], U = [], I = [];
    const stone = new THREE.Color('#8f8c84'), moss = new THREE.Color('#5d6e34'), c = new THREE.Color();
    const ring = (r, k, lxF, lyF, col) => {
      const base = P.length / 3;
      for (let j = 0; j <= NR; j++) {
        const a = Math.PI * j / NR, [lx, ly] = [lxF(a, j, k), lyF(a, j, k)];
        P.push(r.p.x + r.nx * lx, r.p.h + ly, r.p.z + r.nz * lx);
        col(c, a, j, k); C.push(c.r, c.g, c.b); U.push(r.s / 3, j / NR * 5);
      }
      return base;
    };
    const grid = (bases, flip) => {
      for (let k = 0; k < bases.length - 1; k++) for (let j = 0; j < NR; j++) {
        const a = bases[k] + j, b = bases[k + 1] + j, cc = a + 1, d = b + 1;
        if (flip) I.push(a, cc, b, b, cc, d); else I.push(a, b, cc, cc, b, d);
      }
    };
    const edge = (k) => Math.min(k, RN - 1 - k);
    const inLx = (a, j, k) => TUN_W * Math.cos(a) * (1 + rn(k * 0.35, j * 0.5) * 0.06);
    const inLy = (a, j) => (j === 0 || j === NR ? -0.8 : TUN_H * Math.sin(a));
    const th = (j, k) => 1.4 + 0.9 * (rn(k * 0.2 + 5, j * 0.4) + 1) * 0.5 + (edge(k) === 0 ? 0.5 : 0);
    const outLx = (a, j, k) => (TUN_W + th(j, k)) * Math.cos(a);
    const outLy = (a, j, k) => (j === 0 || j === NR ? -1.4 : (TUN_H + th(j, k)) * Math.sin(a));
    const inCol = (cc, a, j, k) => cc.copy(stone).multiplyScalar(0.48 + rn(j * 0.7, k * 0.5) * 0.08 + 0.12 * Math.min(1, edge(k) / 3) * 0);
    const outCol = (cc, a, j, k) => { cc.copy(stone).multiplyScalar(0.8 + rn(j * 0.6 + 3, k * 0.4) * 0.15); const up = Math.sin(a); if (up > 0.55) cc.lerp(moss, Math.min(0.8, (up - 0.55) * 2.2)); };
    grid(rings.map((r, k) => ring(r, k, inLx, inLy, inCol)), true);
    grid(rings.map((r, k) => ring(r, k, outLx, outLy, outCol)), false);
    // portāli: gredzens starp iekšpusi un ārpusi (abas puses)
    for (const k of [0, RN - 1]) {
      const r = rings[k], a0 = ring(r, k, inLx, inLy, inCol), a1 = ring(r, k, outLx, outLy, outCol);
      for (let j = 0; j < NR; j++) I.push(a0 + j, a1 + j, a0 + j + 1, a0 + j + 1, a1 + j, a1 + j + 1, a0 + j, a0 + j + 1, a1 + j, a0 + j + 1, a1 + j + 1, a1 + j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I); g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, rockMaterial());
    m.castShadow = true; m.receiveShadow = true; m.name = 'tunnel';
    G.add(m);
    // balsti gar sienām un laternas
    const k = new A.Kit(91), Gx = A.G;
    for (let q = 2; q < RN - 1; q += 5) {
      const r = rings[q];
      for (const sd of [-1, 1]) {
        const lx = sd * (TUN_W - 0.32), x = r.p.x + r.nx * lx, z = r.p.z + r.nz * lx, top = tunArch(TUN_W - 0.32) + 0.2;
        k.add(Gx.cyl(0.11, 0.13, top + 0.5, 7), '#6a4a2e', { p: [x, r.p.h + top / 2 - 0.25, z], rough: 0.95 });
        if ((q / 5 | 0) % 2 === (sd > 0 ? 0 : 1)) {
          const lx2 = sd * (TUN_W - 0.55), lxp = r.p.x + r.nx * lx2, lzp = r.p.z + r.nz * lx2;
          k.add(Gx.rbox(0.2, 0.28, 0.2, 0.03), '#ffd27a', { p: [lxp, r.p.h + 1.7, lzp], emit: 1, rough: 0.3 });
          k.add(Gx.cone(0.17, 0.12, 6), '#3a2a1e', { p: [lxp, r.p.h + 1.9, lzp], rough: 0.6 });
        }
      }
    }
    G.add(k.build({ name: 'tunnel-props' }));
    // zīme virs ziemeļu portāla
    const r0 = rings[0], sg = makeSignBoard('⛰️ Klinšu tunelis', { h: 0.42, style: 'road' });
    sg.obj.position.set(r0.p.x - r0.tx * 0.9, r0.p.h + TUN_H + 0.2, r0.p.z - r0.tz * 0.9);
    sg.obj.rotation.y = Math.atan2(r0.tx, r0.tz) + Math.PI;
    G.add(sg.obj);
  }

  // 1.43.0: laipa purvā (dēļi šķērsām + mietiņi)
  buildBoardwalk(G) {
    const line = this.lay.line, pts = [];
    for (let i = 0; i < line.length - 1; i++) {
      const p = line[i], q = line[i + 1];
      if (!(p.bw > 0) || !(q.bw > 0)) continue;
      for (let f = 0; f < 3; f++) {
        const t = f / 3, x = lerp(p.x, q.x, t), z = lerp(p.z, q.z, t), y = lerp(p.h + BW_Y * p.bw, q.h + BW_Y * q.bw, t);
        pts.push({ x, z, y, a: Math.atan2(q.x - p.x, q.z - p.z), i, f });
      }
    }
    if (!pts.length) return;
    const pk = new A.Kit(92); pk.add(A.G.rbox(BW_HW * 2, 0.07, 0.44, 0.02), '#8a6a44', { rough: 0.9 });
    const pg = kitTpl('bw-plank', () => { const o = new THREE.Group(); o.add(new THREE.Mesh(pk.geometry(), A.toyMaterial())); return o; }).children[0].geometry;
    const im = new THREE.InstancedMesh(pg, A.toyMaterial(), pts.length), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    pts.forEach((p, i) => {
      q4.setFromAxisAngle(up, p.a + (Math.sin(i * 7.1) * 0.04));
      im.setMatrixAt(i, m4.compose(v.set(p.x, p.y - 0.03, p.z), q4, one));
      im.setColorAt(i, col.setScalar(0.82 + 0.18 * Math.abs(Math.sin(i * 3.7))));
    });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
    G.add(im);
    const posts = pts.filter((p) => p.f === 0 && p.i % 3 === 0);
    const sk = new A.Kit(93); sk.add(A.G.cyl(0.07, 0.08, 1.2, 6), '#5a3e26', { p: [0, -0.5, 0], rough: 0.95 });
    const sg = kitTpl('bw-post', () => { const o = new THREE.Group(); o.add(new THREE.Mesh(sk.geometry(), A.toyMaterial())); return o; }).children[0].geometry;
    const ip = new THREE.InstancedMesh(sg, A.toyMaterial(), posts.length * 2);
    posts.forEach((p, i) => { for (const s of [0, 1]) { const sd = s ? 1 : -1, nx = Math.cos(p.a) * sd, nz = -Math.sin(p.a) * sd; ip.setMatrixAt(i * 2 + s, m4.makeTranslation(p.x + nx * (BW_HW - 0.1), p.y + 0.02, p.z + nz * (BW_HW - 0.1))); } });
    ip.computeBoundingSphere();
    G.add(ip);
  }

  // 1.43.0: šķēršļi uz takas — modelis (pirms) un paliekas (pēc novākšanas)
  buildObstacles(G) {
    this.obs = this.lay.obst.map((o) => {
      const root = new THREE.Group(), parts = [], rest = new THREE.Group();
      root.position.set(o.x, o.h, o.z); root.rotation.y = o.face;
      rest.position.copy(root.position); rest.rotation.y = o.face;
      if (o.type === 'koks') {
        const k = new A.Kit(95 + o.o), Gx = A.G;
        k.add(Gx.cyl(0.34, 0.44, 11, 10), '#6a4a30', { p: [0, 0, 0], r: [0, 0, Math.PI / 2], rough: 0.95, fc: (c) => (Math.floor(c.x * 3 + Math.atan2(c.y, c.z) * 2) % 3 === 0 ? '#5a3e28' : null) });
        k.add(Gx.cyl(1.25, 1.1, 0.45, 12), '#5a4030', { p: [5.6, 0.2, 0], r: [0, 0, Math.PI / 2], rough: 1, fc: (c) => (Math.random() < 0.3 ? '#4a3a2a' : null) });
        for (let i = 0; i < 6; i++) { const a = i * 1.05; A.rod(k, [5.7, 0.2, 0], [5.9, 0.2 + Math.sin(a) * 1.5, Math.cos(a) * 1.5], 0.07, '#4a3424', { rough: 1, seg: 4 }); }
        for (const [x, y, z, r] of [[-3.5, 0.6, 0.7, 0.5], [-2.2, 0.4, -0.8, 0.45], [-4.6, 0.3, -0.5, 0.6], [-1, 0.7, 0.5, 0.35]]) {
          A.rod(k, [x + 0.6, 0.1, 0], [x, y + 0.5, z], 0.06, '#5a3e28', { rough: 0.95, seg: 4 });
          k.add(Gx.blob(0.55 + r * 0.6, 1, 0.25, x * 3), '#2f5a38', { p: [x, y + 0.6, z], s: [1.4, 0.7, 1], rough: 0.85, sway: 0.2 });
        }
        const tree = k.build({ name: 'ob-koks' });
        tree.position.y = 0.42; tree.rotation.x = 0.04;
        root.add(tree); parts.push(tree);
        // paliekas: sazāģēti bluķi malā
        const r = new A.Kit(99), Gr = A.G;
        for (const [x, z, y] of [[-TRAIL_HW - 0.3, -0.6, 0.3], [-TRAIL_HW - 0.3, 0.5, 0.3], [-TRAIL_HW - 0.35, 0, 0.82]]) r.add(Gr.cyl(0.33, 0.33, 1.0, 10), '#6a4a30', { p: [x, y, z], r: [Math.PI / 2, 0, 0], rough: 0.95, fc: (c) => (Math.abs(c.z - z) > 0.45 ? '#dcb27a' : null) });
        r.add(Gr.disc(0.9, 12), '#d8b888', { p: [0, 0.03, 0], r: [-Math.PI / 2, 0, 0], rough: 1 });
        rest.add(r.build({ name: 'ob-koks-rest' }));
      } else if (o.type === 'akmens') {
        const m = rockMaterial();
        const list = [[-1.8, 0, 0.2, 1.1], [1.6, 0.4, -0.3, 1.05], [0, 0.9, 0.5, 1.3], [-0.6, 1.9, -0.4, 0.9], [0.9, 1.6, 0.6, 0.75], [-2.6, 0.3, -0.6, 0.85], [2.6, 0.1, 0.5, 0.8], [0.2, 0.2, -0.9, 0.9]];
        list.forEach(([x, y, z, sc], i) => {
          const r = new THREE.Mesh(rockGeo(120 + i, 1, 0.85, 0.28, true), m);
          r.position.set(x, y + 0.45 * sc, z); r.scale.setScalar(sc); r.rotation.set(i, i * 2.1, 0); r.castShadow = true; r.receiveShadow = true;
          root.add(r); parts.push(r);
        });
        for (const [x, z, sc] of [[-TRAIL_HW - 0.5, 0.6, 0.45], [TRAIL_HW + 0.4, -0.5, 0.5], [-TRAIL_HW - 0.2, -0.9, 0.35]]) {
          const r = new THREE.Mesh(rockGeo(140, 1, 0.8, 0.25, true), m); r.position.set(x, 0.2, z); r.scale.setScalar(sc); r.castShadow = true; rest.add(r);
        }
      } else {
        for (let i = 0; i < 8; i++) {
          const k = new A.Kit(110 + i), Gx = A.G, x = -3.2 + i * 0.92, z = (i % 2 ? 0.45 : -0.4);
          k.add(Gx.blob(0.95, 1, 0.28, i * 5), i % 2 ? '#2f5a28' : '#3a6a2e', { p: [0, 0.75, 0], s: [1, 0.9, 1.1], rough: 0.85, grad: [0.6, 1.1], sway: 0.25 });
          for (let j = 0; j < 7; j++) { const a = j * 0.9 + i; A.rod(k, [0, 0.1, 0], [Math.sin(a) * 1.1, 0.6 + (j % 3) * 0.35, Math.cos(a) * 1.0], 0.025, '#7a3a3a', { rough: 0.8, seg: 3 }); }
          for (let j = 0; j < 9; j++) { const a = j * 2.3 + i; k.add(Gx.sph(0.06, 6, 5), j % 3 ? '#2a1830' : '#c02a3a', { p: [Math.sin(a) * 0.85, 0.6 + (j % 4) * 0.22, Math.cos(a) * 0.85], rough: 0.3 }); }
          const b = k.build({ name: 'ob-krums' }); b.position.set(x, 0, z); b.rotation.y = i * 1.3;
          root.add(b); parts.push(b);
        }
        const r = new A.Kit(119);
        for (const x of [-TRAIL_HW - 0.6, TRAIL_HW + 0.6]) r.add(A.G.blob(0.45, 1, 0.3, x), '#3a6a2e', { p: [x, 0.25, 0], s: [1, 0.6, 1], rough: 0.85 });
        rest.add(r.build({ name: 'ob-krumi-rest' }));
      }
      root.visible = true; rest.visible = false;
      G.add(root); G.add(rest);
      return { o, root, parts, rest, wob: 0, bubble: null, btxt: '', n: -1 };
    });
  }
  // šķēršļa stāvoklis: cik sitienu jau ir (pēc tā rāda daļas), novākts — paliekas
  applyObstacles(tr) {
    this.obClear = this.lay.obst.map((o) => ((tr.ob && tr.ob[o.o]) || 0) >= OB_TYPES[o.type].hits);
    for (const ob of this.obs || []) {
      const T = OB_TYPES[ob.o.type], n = (tr.ob && tr.ob[ob.o.o]) || 0, done = n >= T.hits;
      ob.root.visible = !done; ob.rest.visible = done;
      if (ob.o.type !== 'koks') ob.parts.forEach((p, i) => { p.visible = i < Math.ceil(ob.parts.length * (1 - n / T.hits)) || i === 0 && !done; });
      ob.n = n;
    }
  }
  obHit(o) { const ob = this.obs && this.obs[o]; if (ob) ob.wob = 1; }

  // 1.43.0: zīmes, kur sākas jauns takas posms
  buildSectSigns(G) {
    const line = this.lay.line;
    for (const { s, i: i0 } of this.lay.sectStart) {
      let i = i0;
      const T = this.lay.tunnel;
      while (line[i + 1] && ((Math.abs(line[i].x - BRIDGE.x) < 5 && Math.abs(line[i].z - BZ) < BRIDGE.hl + 4) || (T && i >= T.i0 - 6 && i <= T.i1 + 6))) i++;
      const p = line[i], q = line[Math.min(line.length - 1, i + 1)], tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl, nz = tx / tl, d = TRAIL_HW + 0.9, x = p.x - nx * d, z = p.z - nz * d, y = this.getHeight(x, z);
      const S = SECTS[s], sg = makeSignBoard(`${S.icon} ${S.name}`, { h: 0.4, style: 'road' });
      sg.obj.position.set(x, y + 1.55, z); sg.obj.rotation.y = Math.atan2(tx, tz) + Math.PI;
      G.add(sg.obj);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 6), wood()); post.position.set(x, y + 0.75, z); G.add(post);
      this.addCollider(x, z, 0.25);
    }
  }

  // 1.43.0: bebru mītne strauta krastā un apgrauzti celmi
  buildLodge(G) {
    const x = 104, z = streamZ(104) - streamHW(104) + 0.6;
    const k = new A.Kit(97), Gx = A.G;
    k.add(Gx.blob(2.4, 1, 0.2, 5), '#6a5238', { p: [0, 0.2, 0], s: [1.3, 0.7, 1.1], rough: 1, grad: [0.7, 1.1] });
    for (let i = 0; i < 26; i++) { const a = i * 2.4, r = 1.2 + (i % 4) * 0.5, y = 0.3 + (i % 5) * 0.35; A.rod(k, [Math.sin(a) * r, y, Math.cos(a) * r], [Math.sin(a + 1.3) * (r - 0.6), y + 0.9, Math.cos(a + 1.3) * (r - 0.6)], 0.06, i % 2 ? '#7a5a3a' : '#5a4028', { rough: 1, seg: 4 }); }
    const lodge = k.build({ name: 'trail-lodge' });
    lodge.position.set(x, WATER_Y - 0.4, z); G.add(lodge);
    this.addCollider(x, z, 2.6);
    const st = new A.Kit(98);
    for (const [sx, sz] of [[0, 0], [2.4, 1.2], [-1.8, 2.0]]) {
      st.add(Gx.cyl(0.22, 0.26, 0.5, 9), '#7a5a3a', { p: [sx, 0.25, sz], rough: 0.95 });
      st.add(Gx.cone(0.22, 0.4, 9), '#d8b888', { p: [sx, 0.7, sz], rough: 0.9 });
    }
    const stumps = st.build({ name: 'trail-stumps' });
    const s3 = this.lay.stops[3].clear, sx = s3.x + 12, sz = s3.z - 10;
    stumps.position.set(sx, this.getHeight(sx, sz), sz); G.add(stumps);
  }

  // tilts: baļķi vienmēr (vecā tilta paliekas), dēļi pēc padarītā, margas — kad gatavs
  buildBridge(G) {
    this.bridgeA = this.getHeight(BRIDGE.x, BZ - BRIDGE.hl);
    this.bridgeB = this.getHeight(BRIDGE.x, BZ + BRIDGE.hl);
    const g = new THREE.Group();
    const beamK = new A.Kit(77), Gx = A.G;
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(BRIDGE.x + s * 0.95, this.bridgeA + 0.05, BZ - BRIDGE.hl - 1), b = new THREE.Vector3(BRIDGE.x + s * 0.95, this.bridgeB + 0.05, BZ + BRIDGE.hl + 1);
      A.rod(beamK, a.toArray(), b.toArray(), 0.16, '#5a3e26', { rough: 0.95, seg: 7 });
      for (const z of [BZ - 3.5, BZ + 3.5]) { const top = this.bridgeY(z) - 0.1, bot = WATER_Y - 2; beamK.add(Gx.cyl(0.14, 0.16, top - bot, 7), '#4a3220', { p: [BRIDGE.x + s * 0.95, (top + bot) / 2, z], rough: 0.95 }); }
    }
    g.add(beamK.build({ name: 'bridge-beams' }));
    const NP = 40;
    this.planks = new THREE.InstancedMesh(trailItem('delis').children[0].geometry, A.toyMaterial(), NP);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), sc = new THREE.Vector3(1.6, 1, 1.65), p = new THREE.Vector3();
    for (let i = 0; i < NP; i++) {
      const z = BZ - BRIDGE.hl + (i + 0.5) / NP * 2 * BRIDGE.hl;
      this.planks.setMatrixAt(i, m4.compose(p.set(BRIDGE.x, this.bridgeY(z) - 0.11, z), q, sc));
    }
    this.planks.count = 0; this.planks.castShadow = true; this.planks.frustumCulled = false;
    g.add(this.planks);
    const railK = new A.Kit(78);
    for (const s of [-1, 1]) {
      for (let i = 0; i <= 6; i++) { const z = BZ - BRIDGE.hl + i / 6 * 2 * BRIDGE.hl; railK.add(Gx.cyl(0.06, 0.07, 1.0, 6), '#7a5232', { p: [BRIDGE.x + s * 1.3, this.bridgeY(z) + 0.35, z], rough: 0.9 }); }
      A.rod(railK, [BRIDGE.x + s * 1.3, this.bridgeY(BZ - BRIDGE.hl) + 0.85, BZ - BRIDGE.hl], [BRIDGE.x + s * 1.3, this.bridgeY(BZ + BRIDGE.hl) + 0.85, BZ + BRIDGE.hl], 0.055, '#8a6038', { rough: 0.9, seg: 6 });
    }
    this.rails = railK.build({ name: 'bridge-rails' });
    this.rails.visible = false;
    g.add(this.rails);
    G.add(g);
  }

  buildFence(G) {
    const posts = [], rails = [], z1 = SHORE + 26;
    for (const s of [-1, 1]) {
      const x = s * (H + 0.5);
      let prev = null;
      for (let z = -H; z <= z1; z += 4) {
        const y = Math.max(this.getHeight(x, z), WATER_Y - 0.4);
        posts.push([x, y, z]);
        if (prev) for (const hy of [0.55, 1.05]) {
          const len = 4, rise = y - prev[1];
          const g = new THREE.BoxGeometry(0.08, 0.12, Math.hypot(len, rise) + 0.1);
          g.rotateX(-Math.atan2(rise, len)); g.translate(x, (y + prev[1]) / 2 + hy, z - 2);
          rails.push(g);
        }
        prev = [x, y, z];
      }
    }
    const pg = new THREE.CylinderGeometry(0.07, 0.09, 1.5, 5).translate(0, 0.55, 0);
    const im = new THREE.InstancedMesh(pg, wood(), posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); im.setMatrixAt(i, m4); });
    im.computeBoundingSphere();
    G.add(im);
    G.add(new THREE.Mesh(mergeGeometries(rails), wood()));
    rails.forEach((g) => g.dispose());
  }

  // kopīgā stāvokļa attēlošana: priekšmeti, malka šķūnī, āboli grozā, tilta dēļi
  applyState(tr) {
    this.state = tr;
    if (!this.npcs) return;
    const step = tr.step;
    this.logs.count = step > 0 ? 8 : step === 0 ? Math.min(8, tr.c) : 0;
    this.apples.count = step > 2 ? 8 : step === 2 ? Math.min(8, tr.c) : 0;
    this.bridgeDone = !!tr.bridge;
    this.planks.count = tr.bridge ? this.planks.instanceMatrix.count : step === 3 ? Math.round(tr.c / TASKS[3].need * this.planks.instanceMatrix.count) : 0;
    this.rails.visible = !!tr.bridge;
    this.applyObstacles(tr);
    // priekšmeti
    const T = TASKS[step], key = T && tr.acc ? step + ':' + tr.run : null;
    if (key !== this.itemsFor) {
      for (const o of this.itemObjs) this.itemGroup.remove(o.obj);
      this.itemObjs = [];
      this.itemsFor = key;
      if (key) for (const it of this.lay.stops[step].items) {
        const obj = cloneItem(T.item, ITEM_SCALE[T.item]);
        const y = Math.max(this.getHeight(it.x, it.z), WATER_Y);
        obj.position.set(it.x, y, it.z); obj.rotation.y = it.ry;
        this.itemGroup.add(obj);
        this.itemObjs.push({ it, obj, y, bob: T.kind === 'pick' || T.item === 'abols' });
      }
    }
    for (const o of this.itemObjs) o.obj.visible = !tr.taken || !tr.taken[o.it.i];
  }

  update(dt, game) {
    const t = performance.now() / 1000;
    if (this.waterMat) { const nm = this.waterMat.normalMap; nm.offset.x += dt * 0.006; nm.offset.y += dt * 0.0045; }
    if (this.foam) this.foam.material.opacity = 0.55 + 0.3 * Math.sin(t * 0.9);
    const me = game.me.pos;
    // brīdinājums, ja aizej no pieņemta uzdevuma zonas (ja visi aiziet — uzdevums neizdodas)
    const qt = game.trail;
    if (qt && qt.acc && qt.step < TASKS.length) {
      const inR = inQuestRange(qt.step, me.x, me.z);
      if (this.wasIn === true && !inR) toast(`⚠️ Tu aizej no ${TASKS[qt.step].icon} uzdevuma vietas! Ja visi aizies prom, uzdevums neizdosies.`, 'bad', 4500);
      else if (this.wasIn === false && inR) toast(`${TASKS[qt.step].icon} Atpakaļ pie uzdevuma`, 'good');
      this.wasIn = inR;
    } else this.wasIn = null;
    // 1.43.0: jauns takas posms — paziņojums
    this.sectT = (this.sectT || 0) - dt;
    if (this.sectT <= 0) {
      this.sectT = 0.5;
      const si = sectAt(me.x, me.z);
      if (this.sect != null && si !== this.sect && si > 0) toast(`${SECTS[si].icon} ${SECTS[si].name}`, 'good', 2500);
      this.sect = si;
    }
    // šķēršļi: šūpojas pēc sitiena, virs tiem — cik vēl jāsit
    for (const ob of this.obs || []) {
      const T = OB_TYPES[ob.o.type], d = Math.hypot(ob.o.x - me.x, ob.o.z - me.z);
      if (ob.wob > 0) { ob.wob = Math.max(0, ob.wob - dt * 2.5); ob.root.rotation.z = Math.sin(t * 40) * 0.035 * ob.wob; ob.root.position.y = ob.o.h + Math.abs(Math.sin(t * 30)) * 0.05 * ob.wob; }
      const txt = !ob.root.visible || d > 32 ? '' : `${T.tool} ${T.name}: ${Math.max(0, ob.n)}/${T.hits}`;
      if (txt !== ob.btxt) {
        if (ob.bubble) { ob.root.parent.remove(ob.bubble); ob.bubble.material.map.dispose(); ob.bubble.material.dispose(); }
        ob.bubble = txt ? makeTextSprite(txt, { fontSize: 36, bg: 'rgba(120,70,20,0.85)' }) : null;
        if (ob.bubble) { ob.bubble.position.set(ob.o.x, ob.o.h + (ob.o.type === 'akmens' ? 3.6 : 2.8), ob.o.z); ob.root.parent.add(ob.bubble); }
        ob.btxt = txt;
      }
    }
    if (this.life) this.life.update(dt, game, t);
    // priekšmeti viegli šūpojas, lai tos labāk pamanītu
    for (const o of this.itemObjs) if (o.bob && o.obj.visible && Math.abs(o.it.x - me.x) < 60 && Math.abs(o.it.z - me.z) < 60) { o.obj.position.y = o.y + 0.12 + Math.sin(t * 2.2 + o.it.i) * 0.08; o.obj.rotation.y += dt * 0.8; }
    // NPC: dzīvi tikai tuvumā
    const tr = this.state || { step: 0, acc: false, c: 0 };
    for (const n of this.npcs || []) {
      const d = Math.hypot(n.s.x - me.x, n.s.z - me.z);
      const near = d < 70;
      n.av.root.visible = d < (this.viewFar || 360);
      if (!near) { if (n.bubble) n.bubble.visible = false; continue; }
      const fresh = tr.step === n.k && !tr.acc;
      n.t += dt;
      const wave = fresh && d < 12 && (n.t % 4) < 1.6;
      n.av.animate(dt, wave ? 'wave' : 'idle', 0);
      if (d < 9) {
        const want = Math.atan2(me.x - n.s.x, me.z - n.s.z) - n.s.face;
        const a = Math.atan2(Math.sin(want), Math.cos(want));
        n.av.head.rotation.y = clamp(a, -0.9, 0.9);
      }
      // burbulis virs galvas
      const txt = this.bubbleText(n.k, tr);
      if (txt !== n.bubbleText) {
        if (n.bubble) { n.av.root.remove(n.bubble); n.bubble.material.map.dispose(); n.bubble.material.dispose(); }
        n.bubble = txt ? makeTextSprite(txt, { fontSize: 40, bg: n.k === tr.step && tr.step < TASKS.length ? 'rgba(214,120,20,0.9)' : 'rgba(0,0,0,0.45)' }) : null;
        if (n.bubble) { n.bubble.position.y = 2.55; n.av.root.add(n.bubble); }
        n.bubbleText = txt;
      }
      if (n.bubble) { n.bubble.visible = d < 45; n.bubble.position.y = 2.55 + Math.sin(t * 2 + n.k) * 0.05; }
    }
  }
  bubbleText(k, tr) {
    const T = TASKS[k];
    if (tr.step >= TASKS.length) return k === TASKS.length - 1 ? '🎉 Paldies!' : '😊';
    if (tr.step < k) return '💤';
    if (tr.step > k) return '😊';
    if (!tr.acc) return '❗ Palīgā!';
    return `${T.itemIcon} ${tr.c}/${T.need}`;
  }

  dispose() {
    this.disposed = true;
    if (this.group.parent) this.group.parent.remove(this.group);
    const rm = rockMaterial();
    const keep = [A.toyMaterial(), rm, rm.map, rockNoise, wood(), roadMaterial(), pathMaterial(), pathMaterial().map, detailTex(), waterNormal(), foamTex()];
    if (this.photoMat) keep.push(this.photoMat);
    if (rm.normalMap) keep.push(rm.normalMap);
    for (const k in tplCache) tplCache[k].traverse((o) => { if (o.geometry) keep.push(o.geometry); });
    for (const kind of Object.keys(A.TREE_TYPES)) keep.push(A.treeGeometry(kind));
    if (this.life) keep.push(...this.life.keep());
    disposeTree(this.group, keep);
  }
}
const ROAD_HW_FIX = 3.6 - TRAIL_HW; // roadDist: taka skaitās kā ceļš (velosipēds brauc ātrāk)

// ---------- faktūras ----------
let detailT = null;
function detailTex() {
  if (detailT) return detailT;
  detailT = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 16000; k++) { const l = 120 + Math.random() * 135; g.fillStyle = `rgba(${l},${l * 1.02},${l * 0.9},0.8)`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.5, 2 + Math.random() * 3); }
  });
  detailT.wrapS = detailT.wrapT = THREE.RepeatWrapping; detailT.anisotropy = 4;
  return detailT;
}
let pathM = null;
function pathMaterial() {
  if (pathM) return pathM;
  const tex = canvasTexture(64, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, l = 0.85 + Math.random() * 0.3, a = Math.min(1, Math.min(u, 1 - u) / 0.22);
      const leaf = Math.random() < 0.04, k = (y * w + x) * 4;
      img.data[k] = (leaf ? 150 : 120) * l; img.data[k + 1] = (leaf ? 110 : 96) * l; img.data[k + 2] = (leaf ? 50 : 66) * l; img.data[k + 3] = 255 * a * (0.7 + Math.random() * 0.3);
    }
    g.putImageData(img, 0, 0);
  });
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  pathM = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  return pathM;
}
let waterN = null;
function waterNormal() {
  if (waterN) return waterN;
  const N = 128, hgt = new Float32Array(N * N), wn = makeNoise2D(SEED + 3);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0, a = 1, f = 1;
    for (let o = 0; o < 4; o++) { const ang = x / N * TAU, bng = y / N * TAU; v += a * wn(Math.cos(ang) * f * 1.5 + 9 * o, Math.sin(ang) * f * 1.5 + Math.cos(bng) * f * 1.5 + Math.sin(bng) * f * 1.5); a *= 0.5; f *= 2; }
    hgt[y * N + x] = v;
  }
  waterN = canvasTexture(N, N, (g) => {
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x - 1 + N) % N], dy = hgt[((y + 1) % N) * N + x] - hgt[((y - 1 + N) % N) * N + x], k = (y * N + x) * 4;
      img.data[k] = 128 + dx * 90; img.data[k + 1] = 128 + dy * 90; img.data[k + 2] = 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  waterN.colorSpace = THREE.NoColorSpace; waterN.wrapS = waterN.wrapT = THREE.RepeatWrapping; waterN.repeat.set(140, 140);
  return waterN;
}
let foamT = null;
function foamTex() {
  if (foamT) return foamT;
  foamT = canvasTexture(128, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.55, 'rgba(240,248,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`; g.fillRect(Math.random() * w, h * 0.2 + Math.random() * h * 0.5, 2 + Math.random() * 6, 1 + Math.random() * 2); }
  });
  foamT.wrapS = THREE.RepeatWrapping;
  return foamT;
}

// ---------- vietas modeļi ----------
function shedModel() {
  const k = new A.Kit(81), G = A.G, wd = '#8a5e38', dk = '#6a4526';
  for (const [x, z] of [[-1.7, -0.95], [1.7, -0.95], [-1.7, 0.95], [1.7, 0.95]]) k.add(G.rbox(0.16, 2.3, 0.16, 0.03), dk, { p: [x, 1.15, z], rough: 0.9 });
  for (let i = 0; i < 6; i++) k.add(G.rbox(3.5, 0.3, 0.06, 0.02), i % 2 ? wd : '#946640', { p: [0, 0.3 + i * 0.34, -1.0], rough: 0.9 });
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) k.add(G.rbox(0.06, 0.3, 2.0, 0.02), i % 2 ? wd : '#946640', { p: [s * 1.75, 0.3 + i * 0.34, 0], rough: 0.9 });
  for (const s of [-1, 1]) k.add(G.rbox(3.9, 0.08, 1.35, 0.03), '#a8452e', { p: [0, 2.6, s * 0.6], r: [s * 0.42, 0, 0], rough: 0.7, fc: (c) => (Math.floor((c.x + 3) * 3) % 2 ? '#963a26' : null) });
  k.add(G.rbox(3.5, 0.12, 2.0, 0.03), '#6a5a48', { p: [0, 0.06, 0], rough: 0.95 });
  k.add(G.cyl(0.2, 0.2, 0.6, 10), '#8a6a4a', { p: [1.0, 0.3, 1.5], rough: 0.9 }); // ciršanas klucis
  k.add(G.rbox(0.05, 0.4, 0.05, 0.01), '#6a4526', { p: [1.0, 0.75, 1.5], r: [0, 0, 0.3], rough: 0.9 });
  k.add(G.rbox(0.18, 0.12, 0.03, 0.01), '#9aa0a6', { p: [1.07, 0.92, 1.5], r: [0, 0, 0.3], rough: 0.35, metal: 0.7 });
  return k.build({ name: 'trail-shed' });
}
function hazelModel() {
  const k = new A.Kit(82), G = A.G;
  for (let i = 0; i < 5; i++) { const a = i * 1.26; A.rod(k, [Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2], [Math.sin(a) * 0.9, 2.1 + (i % 2) * 0.4, Math.cos(a) * 0.9], 0.05, '#7a5a3e', { rough: 0.9, seg: 5 }); }
  for (const [x, y, z, s] of [[0, 2.2, 0, 1.3], [0.8, 1.8, 0.3, 0.95], [-0.7, 1.9, -0.3, 1.0], [0.2, 1.6, -0.8, 0.9], [-0.3, 1.5, 0.8, 0.85]]) k.add(G.blob(s, 1, 0.18, x * 4 + z), '#5a8f32', { p: [x, y, z], s: [1, 0.8, 1], rough: 0.85, grad: [0.65, 1.1], sway: 0.6 });
  for (let i = 0; i < 9; i++) { const a = i * 2.1; k.add(G.sph(0.06, 6, 5), '#c09a5a', { p: [Math.sin(a) * 1.05, 1.5 + (i % 3) * 0.3, Math.cos(a) * 1.05], rough: 0.6, sway: 0.5 }); }
  return k.build({ name: 'trail-hazel' });
}
function basketModel() {
  const k = new A.Kit(83), G = A.G;
  k.add(G.lathe([[0.2, 0], [0.3, 0.05], [0.34, 0.3], [0.31, 0.3], [0.27, 0.08], [0, 0.07]], 16), '#c8964a', { rough: 0.9, double: true, fc: (c) => (Math.floor(c.y * 18 + Math.atan2(c.x, c.z) * 3) % 2 ? '#b07e3a' : null) });
  k.add(G.torus(0.3, 0.02, 4, 18, Math.PI), '#a8783a', { p: [0, 0.3, 0], rough: 0.9 });
  return k.build({ name: 'trail-basket' });
}
function beachHutModel() {
  const k = new A.Kit(84), G = A.G;
  for (const [x, z] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2]]) k.add(G.cyl(0.08, 0.09, 2.4, 6), '#d8c0a0', { p: [x, 1.2, z], rough: 0.8 });
  k.add(G.rbox(3.4, 0.1, 2.8, 0.03), '#c8a878', { p: [0, 0.3, 0], rough: 0.85 });
  k.add(G.cone(2.6, 1.0, 12), '#f4f0e4', { p: [0, 2.9, 0], rough: 0.7, fc: (c) => (Math.floor((Math.atan2(c.x, c.z) + 3.2) * 12 / TAU * 2) % 2 ? '#2a7ad0' : null) });
  k.add(G.rbox(1.2, 0.08, 0.5, 0.02), '#2a7ad0', { p: [0.6, 0.38, 1.6], r: [0.2, 0.3, 0], rough: 0.7 }); // dvielis
  k.add(G.sph(0.25, 12, 8), '#ff5a5a', { p: [-1.2, 0.25, 1.9], rough: 0.4, fc: (c) => (c.y > 0.25 ? '#ffffff' : c.x > -1.2 ? '#ffd23a' : null) }); // bumba
  return k.build({ name: 'trail-hut' });
}
function boatModel() {
  const k = new A.Kit(85), G = A.G;
  k.add(G.lathe([[0, 0], [0.55, 0.08], [0.72, 0.5], [0.68, 0.55]], 16), '#c0503a', { s: [1, 1, 2.6], rough: 0.7, double: true, fc: (c) => (c.y > 0.42 ? '#f4f0e4' : null) });
  k.add(G.rbox(1.2, 0.06, 0.3, 0.02), '#8a5e38', { p: [0, 0.4, 0.3], rough: 0.85 });
  k.add(G.rbox(0.06, 0.05, 1.9, 0.02), '#a07040', { p: [0.4, 0.5, -0.2], r: [0, 0.2, 0], rough: 0.85 });
  return k.build({ name: 'trail-boat' });
}

// ======================= Game papildinājums =======================
const defState = () => ({ run: 0, step: 0, c: 0, acc: false, bridge: false, taken: {}, ob: [] });
const STEP_KEYS = ['run', 'step', 'c', 'acc', 'bridge', 'ob'];
const OB_GAP = 250; // saimnieks: min. laiks starp viena spēlētāja sitieniem (ms)

export const Trail = {
  initTrail() {
    this.trail = defState();
  },
  hostInitTrail() {
    const s = this.save.trail || {};
    const tr = defState();
    for (const k of STEP_KEYS) if (s[k] != null) tr[k] = s[k];
    tr.ob = Array.isArray(tr.ob) ? tr.ob.map((n) => n | 0) : [];
    tr.step = clamp(tr.step | 0, 0, TASKS.length);
    this.hs.trail = tr;
  },
  trailZone() { return this.zone === 's' && this.terr instanceof TrailZone ? this.terr : null; },

  enterTrail() {
    const Z = this.terr;
    Z.applyState(this.trail);
    this.trailFixPos();
    this.updateTeamBar();
  },
  leaveTrail() { this.updateTeamBar(); },
  // aiz strauta, bet tilta vēl nav — uz tilta ziemeļu galu
  trailFixPos() {
    const Z = this.trailZone();
    if (!Z || this.trail.bridge || !Z.southOfStream(this.me.pos.x, this.me.pos.z)) return;
    this.me.pos.set(BRIDGE.x - 3, 0, BZ - BRIDGE.hl - 4);
    this.me.pos.y = Z.groundAt(this.me.pos.x, this.me.pos.z);
    Z.lastSide = -1;
  },

  // ---------- klients ----------
  onTrail(tr, ev) {
    if (!tr) return;
    this.trail = JSON.parse(JSON.stringify(tr));
    const Z = this.trailZone();
    if (Z) { Z.applyState(this.trail); this.trailFixPos(); }
    const c = this.me && this.me.carry;
    // nesamais vairs nav mans (beidzās laiks vai jauns uzdevums) — izkrīt
    if (c && c.trail != null) {
      const tk = this.trail.taken[c.trail];
      if (c.step !== this.trail.step || !tk || tk[0] !== this.myId || tk[1] < 0) { this.trailDropCarry(false); if (!(ev && (ev.k === 'drop' || ev.k === 'fail'))) toast('🫳 Nesamais izkrita un atgriezās savā vietā'); }
    }
    if (ev) this.trailEvent(ev);
    this.updateTeamBar();
    if (panelOpen() && this.trailPanel != null) this.openTrailNpc(this.trailPanel, true);
  },
  trailEvent(ev) {
    const here = this.zone === 's', T = TASKS[ev.step];
    if (ev.k === 'take' && ev.by === this.myId && T) {
      this.trailPend = 0;
      this.me.carry = { k: 't:' + T.item, trail: ev.i, step: ev.step };
      this.avatar.setCarry(cloneItem(T.item, ITEM_SCALE[T.item] * 0.9));
      sfx('leather', { vol: 0.7 });
      this.sendProfile();
      this.timers.action = 0;
      toast(`🤲 Nes: ${T.itemIcon} ${T.itemName}. Aiznes pie ${T.icon}!`);
    }
    if (ev.k === 'pick' && ev.by === this.myId && T) {
      this.trailPend = 0;
      sfx('pick');
      this.spawnFloat(T.itemIcon, this.me.pos);
    }
    if (ev.k === 'drop' && ev.by === this.myId) { sfx('j_star', { vol: 0.6 }); this.spawnFloat('✨', this.me.pos); }
    if (ev.k === 'acc' && here && T) { sfx('j_quest', { vol: 0.6 }); toast(`${T.icon} Jauns uzdevums: ${T.title}! ${T.help}`, 'good', 5000); }
    if (ev.k === 'fail' && T) { sfx('bad'); toast(`❌ Uzdevums neizdevās: ${T.title} — visi aizgāja prom no ${T.icon}. ${T.icon} ${T.name} gaida — sāciet vēlreiz!`, 'bad', 6000); }
    if ((ev.k === 'hit' || ev.k === 'clear') && here) {
      const Z = this.trailZone(), O = trailLayout().obst[ev.o], OT = O && OB_TYPES[O.type];
      if (Z && O) {
        Z.obHit(ev.o);
        if (ev.by !== this.myId) sfx(OT.snd, { at: { x: O.x, z: O.z }, vol: 0.8 });
        if (ev.k === 'clear') {
          sfx(OT.end, { at: { x: O.x, z: O.z }, vol: 0.9 });
          this.spawnFloat('✨', new THREE.Vector3(O.x, O.h + 1, O.z));
          if (Math.hypot(O.x - this.me.pos.x, O.z - this.me.pos.z) < 80) toast(`${OT.icon} ${OT.name} novākts — ceļš brīvs! 💪`, 'good', 3500);
        }
      }
    }
    if (ev.k === 'restart' && here) toast('🔁 Piedzīvojums sākas no jauna — ej pie 🐻 Lāča Bruņa!', 'good', 4500);
    if (ev.done != null && here) {
      const D = TASKS[ev.done];
      this.addCoins(D.coins, true);
      if (this.gardenXp) this.gardenXp(D.xp, this.me.pos);
      sfx('j_quest');
      toast(`${D.icon} ${D.title} — paveikts kopā! +${D.coins}🪙`, 'good', 5000);
      if (ev.done === TASKS.length - 1) this.trailFinish();
      this.persist();
    }
  },
  trailFinish() {
    const s = this.save, first = !s.ownedHats.includes(GIFT_HAT);
    this.addCoins(FINAL_COINS, true);
    s.trailDone = (s.trailDone || 0) + 1;
    if (first) { s.ownedHats.push(GIFT_HAT); this.setHat(GIFT_HAT); }
    sfx('j_prize', { vol: 0.8, delay: 0.3 });
    this.showPrize('🎉 Taka pabeigta!', 'hat:' + GIFT_HAT, first ? `${HATS[GIFT_HAT].name} — tikai tiem, kas izgājuši visu Piedzīvojumu taku! +${FINAL_COINS}🪙` : `Atkal visa taka kopā! +${FINAL_COINS}🪙`, 'Cepuri var mainīt somā 🎒');
  },
  trailSend(m) { this.net.toHost(m); },

  // darbības (dzeltenā poga)
  trailActions(consider, d2) {
    const Z = this.trailZone();
    if (!Z || !Z.npcs) return;
    const tr = this.trail, T = TASKS[tr.step];
    for (const n of Z.npcs) consider(d2(n.s.x, n.s.z) - 0.4, 3.2, `💬 ${TASKS[n.k].name}`, () => this.openTrailNpc(n.k));
    // 1.43.0: šķēršļi — sit (zāģē, skaldi, griez), kamēr novākts; palīdzēt var visi
    {
      const p = this.me.pos;
      for (const o of Z.lay.obst) {
        if (Z.obClear && Z.obClear[o.o]) continue;
        const dx = p.x - o.x, dz = p.z - o.z, along = Math.abs(dx * o.tx + dz * o.tz), across = Math.abs(dx * o.nx + dz * o.nz);
        if (across > 4.5 || along > 4) continue;
        const OT = OB_TYPES[o.type], n = (tr.ob && tr.ob[o.o]) || 0;
        consider(Math.max(0, along - OB_HALF), 2.4, `${OT.tool} ${OT.verb} (${n}/${OT.hits})`, () => {
          const now = Date.now();
          if (now < (this.obCd || 0)) return;
          this.obCd = now + 320;
          this.me.petT = 0.4;
          sfx(OT.snd, { vol: 0.9 });
          if (Math.random() < 0.5) this.spawnFloat(o.type === 'koks' ? '🪵' : o.type === 'akmens' ? '💥' : '🍃', new THREE.Vector3(o.x, o.h + 1.2, o.z));
          this.trailSend({ t: 'tHit', o: o.o });
        });
      }
    }
    if (!T || !tr.acc || (this.trailPend || 0) > Date.now()) return;
    const p = this.me.pos;
    for (const o of Z.itemObjs) {
      if (!o.obj.visible || Math.abs(o.it.x - p.x) > 3 || Math.abs(o.it.z - p.z) > 3) continue;
      consider(d2(o.it.x, o.it.z), 2.0, T.kind === 'pick' ? `${T.itemIcon} Lasīt: ${T.itemName}` : `🤲 Pacelt: ${T.itemName}`, () => {
        this.trailPend = Date.now() + 2500;
        o.obj.visible = false; // paslēpjam uzreiz, saimnieks apstiprinās
        this.me.petT = 0.5;
        this.trailSend({ t: 'tPick', step: tr.step, i: o.it.i });
      });
    }
  },
  // nesot: pie nodošanas vietas — nolikt, citur — nomest (atgriežas vietā)
  trailCarryAction() {
    const c = this.me.carry, Z = this.trailZone(), T = TASKS[c.step];
    const dp = Z && Z.lay.stops[c.step] && Z.lay.stops[c.step].drop;
    if (dp && Math.hypot(dp.x - this.me.pos.x, dp.z - this.me.pos.z) < dp.r + 1.2) {
      const where = c.step === 0 ? 'šķūnītī' : c.step === 2 ? 'grozā' : 'pie tilta';
      return { label: `📦 Nolikt ${where}: ${T.itemName}`, fn: () => { this.trailSend({ t: 'tDrop', step: c.step, i: c.trail }); this.trailDropCarry(true); } };
    }
    return { label: `🫳 Nomest: ${T ? T.itemName : ''}`, fn: () => this.trailDropCarry(false) };
  },
  // delivered — nodots (ziņu jau nosūtīja); citādi — paziņo saimniekam, ka priekšmets atgriežas
  trailDropCarry(delivered) {
    const c = this.me.carry;
    if (!c || c.trail == null) return;
    if (!delivered && this.trail.taken[c.trail] && this.trail.taken[c.trail][0] === this.myId) this.trailSend({ t: 'tLost', step: c.step, i: c.trail });
    this.me.carry = null;
    this.avatar.setCarry(null);
    this.sendProfile();
    this.timers.action = 0;
  },

  // saruna ar NPC
  openTrailNpc(k, refresh = false) {
    const T = TASKS[k], tr = this.trail;
    this.trailPanel = k;
    const build = (b) => {
      b.append(el('div', { style: 'display:flex;gap:12px;align-items:center;margin-bottom:8px' }, el('div', { style: 'font-size:46px;line-height:1' }, T.icon), el('div', {}, el('b', {}, T.name), el('div', { style: 'opacity:.75;font-size:13px' }, `${k + 1}. pietura no ${TASKS.length}`))));
      const say = (txt) => b.append(el('div', { style: 'background:#fff8e6;color:#3a2a12;border-radius:14px;padding:10px 12px;margin:6px 0;font-size:15px;line-height:1.35' }, `„${txt}”`));
      const btn = (label, fn, bg = null) => { const x = el('button', { className: 'pbtn', onclick: fn }, label); if (bg) x.style.background = bg; b.append(x); };
      if (tr.step >= TASKS.length) {
        say(k === TASKS.length - 1 ? T.thanks : 'Paldies vēlreiz par palīdzību! Visi meža draugi jums pateicīgi.');
        b.append(el('p', {}, '🎉 Visa taka pabeigta kopā! Piedzīvojumu var sākt no jauna — atkal nopelnīsiet 🪙.'));
        btn('🔁 Sākt piedzīvojumu no jauna', () => { this.trailSend({ t: 'tRestart' }); closePanel(); });
      } else if (tr.step < k) {
        const P = TASKS[tr.step];
        say(`Sveiks! Man arī būs vajadzīga palīdzība, bet vispirms palīdziet ${P.icon} ${P.name} — tas ir atpakaļ pa taku.`);
      } else if (tr.step > k) {
        say(T.thanks);
      } else if (!tr.acc) {
        say(T.ask);
        b.append(el('p', { style: 'font-size:13px;opacity:.8' }, `Uzdevums visai komandai — palīdzēt var visi, kas ir šajā zemē. Balva katram: +${T.coins}🪙 un +${T.xp}⭐`));
        btn('🤝 Palīdzēsim!', () => { this.trailSend({ t: 'tAcc', step: k }); closePanel(); }, '#3a9a4a');
      } else {
        say(T.help);
        const pct = Math.round(tr.c / T.need * 100);
        b.append(el('div', { style: 'margin:8px 0 4px' }, `${T.itemIcon} ${T.title}: ${tr.c}/${T.need}`));
        b.append(el('div', { style: 'height:12px;background:#0003;border-radius:6px;overflow:hidden' }, el('div', { style: `height:100%;width:${pct}%;background:#f2b81a` })));
      }
    };
    if (refresh) refreshPanel(build);
    else showPanel(`${T.icon} ${T.name}`, build, () => { this.trailPanel = null; });
  },

  trailBarText() {
    const tr = this.trail, T = TASKS[tr.step];
    if (!T) return '🧭 Taka pabeigta! 🎉';
    if (!tr.acc) return `🧭 Ej pie: ${T.icon} ${T.name}`;
    return `🧭 ${T.icon} ${T.title}: ${tr.c}/${T.need}`;
  },

  // ---------- saimnieks ----------
  hostTrail(from, m) {
    const hs = this.hs, tr = hs.trail;
    if (!tr) return false;
    const T = TASKS[tr.step], now = Date.now();
    let ev = null;
    switch (m.t) {
      case 'tAcc':
        if (!T || tr.acc || m.step !== tr.step) return true;
        tr.acc = true; tr.c = 0; tr.taken = {};
        ev = { k: 'acc', step: tr.step, by: from };
        break;
      case 'tPick': {
        const i = m.i | 0;
        if (!T || !tr.acc || m.step !== tr.step || i < 0 || i >= T.items) return true;
        if (tr.taken[i]) { this.net.sendTo(from, { t: 'trail', tr }); return true; }
        if (T.kind === 'pick') {
          tr.taken[i] = [from, -1]; tr.c++;
          ev = { k: 'pick', step: tr.step, i, by: from };
          if (tr.c >= T.need) this.hostTrailNext(ev);
        } else {
          tr.taken[i] = [from, now + CARRY_MS];
          ev = { k: 'take', step: tr.step, i, by: from };
        }
        break;
      }
      case 'tDrop': {
        const tk = tr.taken[m.i];
        if (!T || T.kind !== 'carry' || m.step !== tr.step || !tk || tk[0] !== from || tk[1] < 0) return true;
        tk[1] = -1; tr.c++;
        ev = { k: 'drop', step: tr.step, i: m.i, by: from };
        if (tr.c >= T.need) this.hostTrailNext(ev);
        break;
      }
      case 'tLost': {
        const tk = tr.taken[m.i];
        if (m.step !== tr.step || !tk || tk[0] !== from || tk[1] < 0) return true;
        delete tr.taken[m.i];
        break;
      }
      case 'tRestart':
        if (tr.step < TASKS.length) return true;
        tr.run++; tr.step = 0; tr.c = 0; tr.acc = false; tr.taken = {}; tr.ob = [];
        ev = { k: 'restart', step: 0, by: from };
        break;
      // 1.43.0: sitiens pa šķērsli (koks / akmeņi / ērkšķi)
      case 'tHit': {
        const o = m.o | 0, O = trailLayout().obst[o];
        if (!O) return true;
        tr.ob = tr.ob || [];
        const hits = OB_TYPES[O.type].hits, n = tr.ob[o] | 0;
        if (n >= hits) return true;
        this.obLast = this.obLast || new Map();
        if (now - (this.obLast.get(from) || 0) < OB_GAP) return true;
        this.obLast.set(from, now);
        while (tr.ob.length <= o) tr.ob.push(0);
        tr.ob[o] = n + 1;
        ev = { k: n + 1 >= hits ? 'clear' : 'hit', o, by: from, step: tr.step };
        break;
      }
      default: return false;
    }
    this.hostTrailSend(ev);
    return true;
  },
  hostTrailNext(ev) {
    const tr = this.hs.trail;
    ev.done = tr.step;
    if (tr.step === 3) tr.bridge = true;
    tr.step++; tr.c = 0; tr.acc = false; tr.taken = {};
  },
  hostTrailSend(ev) {
    const tr = this.hs.trail, s = {};
    for (const k of STEP_KEYS) s[k] = k === 'ob' ? (tr.ob || []).slice() : tr[k];
    this.save.trail = s;
    this.net.broadcast({ t: 'trail', tr, ev });
    if (ev && (ev.done != null || ev.k === 'clear')) this.persist();
  },
  // nesamie, kuru laiks beidzies, atgriežas vietā
  hostTrailTick(now) {
    const tr = this.hs && this.hs.trail;
    if (!tr || now - (this.trailTickT || 0) < 1000) return;
    this.trailTickT = now;
    let ch = false;
    for (const i in tr.taken) { const tk = tr.taken[i]; if (tk[1] > 0 && tk[1] < now) { delete tr.taken[i]; ch = true; } }
    // 1.42.0: pieņemts uzdevums neizdodas, ja visi spēlētāji ir ārpus tā zonas (arī citā zemē) ilgāk par FAIL_MS
    if (tr.acc && tr.step < TASKS.length) {
      let anyIn = this.zone === 's' && inQuestRange(tr.step, this.me.pos.x, this.me.pos.z);
      for (const [id, p] of this.hs.positions) if (!anyIn && id !== 0 && Array.isArray(p) && ZONE_IDS[p[7]] === 's' && inQuestRange(tr.step, p[0], p[2])) anyIn = true;
      if (anyIn) this.trailOutT = 0;
      else if (!this.trailOutT) this.trailOutT = now;
      else if (now - this.trailOutT > FAIL_MS) {
        this.trailOutT = 0;
        tr.acc = false; tr.c = 0; tr.taken = {};
        this.hostTrailSend({ k: 'fail', step: tr.step });
        return;
      }
    } else this.trailOutT = 0;
    if (ch) this.hostTrailSend(null);
  },
  hostTrailLeave(id) {
    const tr = this.hs && this.hs.trail;
    if (!tr) return;
    let ch = false;
    for (const i in tr.taken) { const tk = tr.taken[i]; if (tk[0] === id && tk[1] > 0) { delete tr.taken[i]; ch = true; } }
    if (ch) this.hostTrailSend(null);
  },
  onTrailMessage(m) {
    if (m.t !== 'trail') return false;
    this.onTrail(m.tr, m.ev);
    return true;
  },
};

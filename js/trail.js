// 🧭 Piedzīvojumu mežs (dienvidu zeme 's', 1.39.0): 630 × 1260 m — 2× garāka par citām zemēm, stiepjas uz dienvidiem.
// Biezs mežs ar līkumotu taku no sētas robežas līdz jūrai. Pa ceļam 5 divkājaini meža iedzīvotāji (NPC), katrs lūdz
// komandai palīdzēt (sanest malku, salasīt riekstus, ienest ābolus, atnest dēļus tiltam, salasīt gliemežvākus).
// Uzdevumi ir viena kopīga ķēde (saimnieks glabā stāvokli `hs.trail`, visiem vienāds): nākamais NPC dod uzdevumu tikai,
// kad iepriekšējais izpildīts. Strautu var šķērsot tikai pa tiltu, ko uzbūvē bebrs (pēc tam tas paliek).
// TrailZone — zemes modelis (uzbūvē, ieejot, izmet, izejot). Trail — Game papildinājums (darbības, tīkls, panelis).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ZONE_HALF, SOUTH_END, GROUND_Y, CROSS_AT, smoothRoad, RoadIndex, buildRoadMesh, roadMaterial, disposeTree, buildBorderPosts, wood } from './zones.js?v=1.39.0';
import { WATER_Y } from './world.js?v=1.39.0';
import { makeTextSprite, makeTag, makeSignBoard, canvasTexture, smoothstep, lerp, clamp } from './util.js?v=1.39.0';
import { buildAnimal } from './characters.js?v=1.39.0';
import * as A from './assets.js?v=1.39.0';
import { InstanceField } from './instancing.js?v=1.39.0';
import { makeNoise2D, mulberry32 } from './noise.js?v=1.39.0';
import { $, toast, showPanel, refreshPanel, closePanel, panelOpen, el, sfx } from './ui.js?v=1.39.0';
import { HATS } from './data.js?v=1.39.0';

const SEED = 4711, TAU = Math.PI * 2, H = ZONE_HALF;
// krasts (ūdens mala) un strauts — tīras funkcijas (tās izmanto arī karte)
export const SHORE = 842;
export const shoreZ = (x) => SHORE + Math.sin(x * 0.011) * 14 + Math.sin(x * 0.031 + 1) * 6;
export const streamZ = (x) => 600 + Math.sin(x * 0.009 + 0.5) * 22 + Math.sin(x * 0.027) * 7;
const STREAM_HW = 5;           // strauta ūdens pusplatums
const BRIDGE = { x: 150, hl: 11, hw: 1.35 }; // tilts pāri strautam (gar z asi), pusgarums, puspalatums
const BZ = streamZ(BRIDGE.x);
const SEA_LIMIT = 902;          // tālāk jūrā neaizpeld
const TRAIL_HW = 2.3;           // takas puse platuma

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

let noiseA = null, noiseB = null;
function landH(x, z) {
  noiseA = noiseA || makeNoise2D(SEED);
  const n1 = noiseA(x * 0.0045, z * 0.0045), n2 = noiseA(x * 0.017 + 3, z * 0.017 - 5), n3 = noiseA(x * 0.06 - 7, z * 0.06 + 2);
  let h = GROUND_Y + 0.6 + 3.2 * (n1 + 1) + 0.8 * (n2 + 1) + 0.3 * n3;
  h = lerp(GROUND_Y, h, smoothstep(-312, -235, z)); // pie sētas robežas līdzens
  return h;
}
// meža biezums 0..1 (pļavas starp mežiem)
export function forestAt(x, z) {
  noiseB = noiseB || makeNoise2D(SEED + 9);
  const fn = noiseB(x * 0.008, z * 0.008) * 0.7 + noiseB(x * 0.03 + 4, z * 0.03) * 0.3;
  let f = smoothstep(-0.38, 0.02, fn);
  f *= smoothstep(-300, -230, z);                       // pie ieejas pļava
  f *= 1 - smoothstep(shoreZ(x) - 62, shoreZ(x) - 48, z); // pludmale
  return f;
}

let L = null;
export function trailLayout() {
  if (L) return L;
  const line = smoothRoad(PTS, 1.5);
  // takas augstuma profils (izlīdzināts), tilta posmā taisna līnija
  const raw = line.map((p) => landH(p.x, p.z));
  const prof = raw.map((_, i) => { let s = 0, n = 0; for (let k = -8; k <= 8; k++) { const j = i + k; if (j >= 0 && j < raw.length) { s += raw[j]; n++; } } return s / n; });
  const onBridge = (p) => Math.abs(p.x - BRIDGE.x) < 3 && Math.abs(p.z - BZ) < BRIDGE.hl + 0.5;
  const bi = line.map((p, i) => (onBridge(p) ? i : -1)).filter((i) => i >= 0);
  if (bi.length) {
    const a = Math.max(0, bi[0] - 1), b = Math.min(line.length - 1, bi[bi.length - 1] + 1);
    for (let i = a; i <= b; i++) prof[i] = lerp(prof[a], prof[b], (i - a) / Math.max(1, b - a));
  }
  line.forEach((p, i) => { p.h = prof[i]; p.i = i; });
  const idx = new RoadIndex([line], 8, 1);        // ātrs (precīzs līdz ~8 m) — augstumiem, kokiem
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
  L = { line, idx, stops };
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
        if (k === 3 && z > streamZ(x) - STREAM_HW - 4) continue;
      }
      if (Math.abs(x) > H - 4 || nearTrail(x, z) < 1.6) continue;
      if (Math.abs(z - streamZ(x)) < STREAM_HW + 3) continue;
      if (s.drop && Math.hypot(x - s.drop.x, z - s.drop.z) < (k === 0 ? 7 : 4)) continue;
      if (Math.hypot(x - s.x, z - s.z) < 2) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 2.2)) continue;
      out.push({ i: out.length, x, z, ry: rnd() * TAU });
    }
    s.items = out;
  });
  return L;
}

// pilns augstums (bez tilta) — tīra funkcija
export function trailHeight(x, z) {
  const lay = trailLayout();
  let h = landH(x, z);
  for (const s of lay.stops) {
    const d = Math.hypot(x - s.clear.x, z - s.clear.z);
    if (d < s.clear.r + 12) h = lerp(h, s.ch ?? (s.ch = landH(s.clear.x, s.clear.z)), 1 - smoothstep(s.clear.r, s.clear.r + 12, d));
  }
  const tn = lay.idx.near(x, z);
  if (tn.p) h = lerp(h, tn.p.h, 1 - smoothstep(TRAIL_HW + 0.3, 7.5, tn.d));
  // strauts
  const sd = Math.abs(z - streamZ(x));
  if (sd < STREAM_HW + 8) h = lerp(h, WATER_Y - 1.7, 1 - smoothstep(STREAM_HW - 1.5, STREAM_HW + 7, sd));
  // pludmale un jūra
  const sz = shoreZ(x), b = smoothstep(sz - 78, sz - 44, z);
  if (b > 0) { const beach = z < sz ? Math.min(1.45, (sz - z) * 1.45 / 44) : -Math.min(6.5, (z - sz) * 0.09); h = lerp(h, beach, b); }
  // aiz žoga lēzeni līdz līdzenumam (izņemot jūru)
  const ex = smoothstep(338, 396, Math.abs(x)) * (1 - b);
  if (ex > 0) h = lerp(h, GROUND_Y, ex);
  return h;
}

// koku un krūmu saraksti
let treeList = null, underList = null;
export function trailTrees() {
  if (treeList) return treeList;
  const lay = trailLayout(), rnd = mulberry32(SEED + 3);
  noiseB = noiseB || makeNoise2D(SEED + 9);
  treeList = []; underList = [];
  const free = (x, z, m) => {
    if (lay.idx.near(x, z).d < TRAIL_HW + 2.2 + m) return false;
    for (const s of lay.stops) if (Math.hypot(x - s.clear.x, z - s.clear.z) < s.clear.r + 2 + m || Math.hypot(x - s.x, z - s.z) < 5) return false;
    if (Math.abs(z - streamZ(x)) < STREAM_HW + 4 + m) return false;
    if (z < -300 && Math.abs(x) < 30) return false;
    return true;
  };
  for (let gx = -394; gx < 394; gx += 6.5) for (let gz = -300; gz < 860; gz += 6.5) {
    const x = gx + (rnd() - 0.5) * 5.5, z = gz + (rnd() - 0.5) * 5.5, r1 = rnd(), r2 = rnd(), r3 = rnd();
    const sz = shoreZ(x);
    const f = forestAt(x, z), dune = z > sz - 64 && z < sz - 46;
    const p = dune ? 0.22 : f * 0.78;
    if (r1 > p || z > sz - 46 || !free(x, z, 0)) continue;
    const kn = noiseB(x * 0.02 + 50, z * 0.02);
    const kind = dune ? 'priede' : kn < -0.08 ? 'egle' : kn > 0.32 ? 'priede' : r2 < 0.5 ? 'berzs' : 'ozols';
    treeList.push({ id: treeList.length, kind, x, z, y: trailHeight(x, z) - 0.1, ry: r3 * TAU, s: 0.72 + r2 * 0.55 });
  }
  // pamežs: krūmi, papardes, akmeņi; pļavās puķes
  for (let gx = -320; gx < 320; gx += 4.2) for (let gz = -300; gz < 850; gz += 4.2) {
    const x = gx + (rnd() - 0.5) * 3.6, z = gz + (rnd() - 0.5) * 3.6, r1 = rnd(), r2 = rnd(), r3 = rnd();
    if (z > shoreZ(x) - 44 || !free(x, z, -1.5)) continue;
    const f = forestAt(x, z);
    let kind = null;
    if (f > 0.4) { if (r1 < 0.16) kind = 'pa'; else if (r1 < 0.24) kind = 'kr'; else if (r1 < 0.255) kind = 'ak'; }
    else if (r1 < 0.12) kind = 'zi'; else if (r1 < 0.15) kind = 'kr';
    if (!kind) continue;
    underList.push({ id: underList.length, kind, x, z, y: trailHeight(x, z) - 0.03, ry: r3 * TAU, s: 0.75 + r2 * 0.6 });
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
    const sh = Math.max(-22, Math.min(22, (hs[Math.max(0, py - 1) * W + Math.max(0, px - 1)] - h) * 3.5));
    const k = (py * W + px) * 4;
    img.data[k] = Math.max(0, Math.min(255, col[0] + sh)); img.data[k + 1] = Math.max(0, Math.min(255, col[1] + sh)); img.data[k + 2] = Math.max(0, Math.min(255, col[2] + sh)); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const toPx = (x, z) => [(x + H) / sx, (z + H) / sz];
  g.strokeStyle = '#b08850'; g.lineWidth = 2; g.setLineDash([4, 2]);
  g.beginPath(); trailLayout().line.forEach((p, i) => { const [a, b] = toPx(p.x, p.z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.stroke();
  g.setLineDash([]);
  mapCanvas = c;
  return c;
}
// NPC ikonas kartei (lokālās koordinātēs)
export function trailIcons() { return trailLayout().stops.map((s, k) => [TASKS[k].icon, s.x, s.z, k]); }

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
    else {
      const cols = ['#ffffff', '#ffd83a', '#b06ae0', '#ff6b8a'];
      for (let i = 0; i < 5; i++) { const a = i * 1.3, r = 0.2 + (i % 2) * 0.15; k.add(G.cyl(0.008, 0.008, 0.32, 3), '#4f8f2e', { p: [Math.sin(a) * r, 0.16, Math.cos(a) * r], sway: 0.6 }); k.add(A.flowerGeo(0.06, 6, 0.01), cols[i % 4], { p: [Math.sin(a) * r, 0.33, Math.cos(a) * r], r: [-Math.PI / 2, 0, 0], sway: 1 }); }
    }
    return k.build({ name: 'under-' + kind });
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
    // strauts: kamēr nav tilta, pāri netiek (krasts kā siena)
    const sz = streamZ(pos.x), band = STREAM_HW + 3;
    if (!this.bridgeDone && Math.abs(pos.z - sz) < band) {
      pos.z = sz + this.lastSide * band; hit = true;
    } else if (Math.abs(pos.z - sz) >= band) this.lastSide = pos.z > sz ? 1 : -1;
    return hit;
  }
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
    this.under = new InstanceField(underList, (k) => underTpl(k), { chunk: 48, view: 60 });
    this.under.build(G);
    // taka (šaurāks ceļš; pie tilta un pludmalē nezīmē)
    const segs = [];
    let cur = [];
    for (const p of this.lay.line) {
      const skip = (Math.abs(p.x - BRIDGE.x) < 4 && Math.abs(p.z - BZ) < BRIDGE.hl + 1) || p.z > 800;
      if (skip) { if (cur.length > 2) segs.push(cur); cur = []; } else cur.push(p);
    }
    if (cur.length > 2) segs.push(cur);
    G.add(buildRoadMesh(segs, (x, z) => this.getHeight(x, z), 0.05, TRAIL_HW, pathMaterial()));
    this.buildStops(G);
    this.buildBridge(G);
    this.buildFence(G);
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
    const GRASS = new THREE.Color(0.32, 0.46, 0.17), FLOOR = new THREE.Color(0.24, 0.25, 0.13), DIRT = new THREE.Color(0.42, 0.33, 0.22), SAND = new THREE.Color(0.58, 0.52, 0.38), WET = new THREE.Color(0.42, 0.37, 0.27);
    for (let iz = 0; iz <= NZ; iz++) for (let ix = 0; ix <= NX; ix++) {
      const i = iz * n + ix, x = X0 + ix * CELL, z = Z0 + iz * CELL, h = Hh[i];
      pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
      nv.set(hAt(ix - 1, iz) - hAt(ix + 1, iz), 2 * CELL, hAt(ix, iz - 1) - hAt(ix, iz + 1)).normalize();
      nor[i * 3] = nv.x; nor[i * 3 + 1] = nv.y; nor[i * 3 + 2] = nv.z;
      uv[i * 2] = x / 26; uv[i * 2 + 1] = z / 26;
      const f = forestAt(x, z), td = this.lay.idx.near(x, z).d, sd = Math.abs(z - streamZ(x)), sz = shoreZ(x);
      let wF = f * 0.85, wS = 0, wD = 0, wR = smoothstep(0.86, 0.7, nv.y);
      c.copy(GRASS).lerp(FLOOR, f);
      const tr = 1 - smoothstep(TRAIL_HW - 0.6, TRAIL_HW + 1.4, td);
      if (tr > 0) { wD = Math.max(wD, tr); c.lerp(DIRT, tr); }
      const bank = 1 - smoothstep(STREAM_HW, STREAM_HW + 6, sd);
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
    const keep = [A.toyMaterial(), wood(), roadMaterial(), pathMaterial(), pathMaterial().map, detailTex(), waterNormal(), foamTex()];
    if (this.photoMat) keep.push(this.photoMat);
    for (const k in tplCache) tplCache[k].traverse((o) => { if (o.geometry) keep.push(o.geometry); });
    for (const kind of Object.keys(A.TREE_TYPES)) keep.push(A.treeGeometry(kind));
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
const defState = () => ({ run: 0, step: 0, c: 0, acc: false, bridge: false, taken: {} });
const STEP_KEYS = ['run', 'step', 'c', 'acc', 'bridge'];

export const Trail = {
  initTrail() {
    this.trail = defState();
  },
  hostInitTrail() {
    const s = this.save.trail || {};
    const tr = defState();
    for (const k of STEP_KEYS) if (s[k] != null) tr[k] = s[k];
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
      if (c.step !== this.trail.step || !tk || tk[0] !== this.myId || tk[1] < 0) { this.trailDropCarry(false); if (!(ev && ev.k === 'drop')) toast('🫳 Nesamais izkrita un atgriezās savā vietā'); }
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
        tr.run++; tr.step = 0; tr.c = 0; tr.acc = false; tr.taken = {};
        ev = { k: 'restart', step: 0, by: from };
        break;
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
    for (const k of STEP_KEYS) s[k] = tr[k];
    this.save.trail = s;
    this.net.broadcast({ t: 'trail', tr, ev });
    if (ev && ev.done != null) this.persist();
  },
  // nesamie, kuru laiks beidzies, atgriežas vietā
  hostTrailTick(now) {
    const tr = this.hs && this.hs.trail;
    if (!tr || now - (this.trailTickT || 0) < 1000) return;
    this.trailTickT = now;
    let ch = false;
    for (const i in tr.taken) { const tk = tr.taken[i]; if (tk[1] > 0 && tk[1] < now) { delete tr.taken[i]; ch = true; } }
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

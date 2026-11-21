// ❄️ Ziemas zeme (ziemeļu zeme): sniega klajums, liels slēpošanas kalns ar krēslu pacēlāju, sniega piku kaujas laukums,
// sniegotas eglītes, izrotāta Ziemassvētku egle, sniegavīri, ziemeļbrieži un sniegputenis.
// WinterZone — zemes modelis (uzbūvē, ieejot, izmet, izejot). Winter — Game papildinājums: slēpošana, pacēlājs,
// sniega pikas (arī ar draugiem), ziemas drēbes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ZONE_HALF, GROUND_Y, DIRS, clampSquare, openSides, buildBorderPosts, disposeTree, smoothRoad, ringRoad, RoadIndex, buildRoadMesh, roadMaterial } from './zones.js?v=1.41.1';
import { makeTextSprite, canvasTexture, mat, smoothstep, lerp, angleLerp, clamp } from './util.js?v=1.41.1';
import { buildNPC, buildAnimal, flattenStatic } from './characters.js?v=1.41.1';
import { loadTexture } from './gfx.js?v=1.41.1';
import { InstanceField } from './instancing.js?v=1.41.1';
import { makeNoise2D, mulberry32 } from './noise.js?v=1.41.1';
import { $, toast, sfx } from './ui.js?v=1.41.1';

const SEED = 9137;
const TAU = Math.PI * 2;
// izkārtojums (zemes lokālās koordinātas; Mežvidi ir dienvidos, +z)
// 1.17.0: kalns 2× lielāks — virsotne ~157 m (bija ~77 m), nobrauciens ~330 m; slīpums tāds pats kā agrāk (līdz ~35°)
export const HILL = { x: 15, z: -260, r: 380, h: 160, p: 1.2 };
const SIDE_HILLS = [[214, -188, 112, 26], [-218, -172, 120, 30], [-251, 94, 82, 12], [251, 45, 90, 13]];
export const LIFT = { x: 42, zB: 62, zT: -238, off: 1.6, v: 13 };
// kur izkāpj kalna galā (ārpus stacijas laukuma, jau uz nogāzes) un uz kuru pusi skatās
export const SKI_START = { x: LIFT.x - 6, z: LIFT.zT + 17, heading: Math.atan2(-0.3, 1) };
const CHAIRS = 28;
export const PISTE = { x0: -85, x1: 24, z0: -272, z1: 85 };
export const ARENA = { x: -170, z: 200, hw: 36, hd: 22 };
export const PLAZA = { x: 95, z: 225 };
const CABIN = { x: 112, z: 84 };
const RACK = { x: 26, z: 74 };
const HERDS = [{ x: 190, z: 140, r: 30, n: 4 }, { x: -230, z: 30, r: 24, n: 2 }, { x: 150, z: -40, r: 22, n: 2 }];
// mašīnas un sniega motocikla stāvvietas
export const WINTER_CAR = { x: 45, z: 288, heading: Math.PI / 2 };
export const SLED_SPOT = { x: 84, z: 118, heading: Math.PI };
// grants ceļi: no Mežvidu robežas līdz laukumam un no laukuma līdz pacēlājam
// laukumu apbrauc apļveida ceļš (autobusa apgriešanās loks)
export const WINTER_RING = { x: PLAZA.x, z: PLAZA.z, r: 27 };
const ringPt = (deg) => [WINTER_RING.x + Math.cos(deg * Math.PI / 180) * WINTER_RING.r, WINTER_RING.z + Math.sin(deg * Math.PI / 180) * WINTER_RING.r];
const ROADS = [
  [[0, 380], [0, 315], [0, 290], [27, 274], [62, 266], [86, 262], ringPt(95)],
  [ringPt(-110), [80, 180], [69, 145], [64, 112], [62, 94]],
  ringRoad(WINTER_RING.x, WINTER_RING.z, WINTER_RING.r, 3),
];
export const WINTER_ROAD = ROADS[0]; // autobusa maršrutam (bus.js)
let roadLines = null, roadIdx = null;
export function winterRoads() {
  if (!roadLines) { roadLines = ROADS.map((p) => smoothRoad(p)); roadIdx = new RoadIndex(roadLines); }
  return roadLines;
}
// reljefa režģis plašāks par spēles laukumu (lielā kalna ziemeļu nogāze aiz žoga lēzeni nolaižas līdz līdzenumam)
const N = 340, SZ = 1000, HS = SZ / 2, CELL = SZ / N;

// ---------- reljefs (tīra funkcija — to izmanto arī karte, neielādējot zemi) ----------
let noise = null;
const bump = (x, z, cx, cz, r, h, p = 1.3) => { const d = Math.hypot(x - cx, z - cz); return d < r ? h * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * d / r), p) : 0; };
function rawHeight(x, z) {
  noise = noise || makeNoise2D(SEED);
  let h = GROUND_Y + noise(x * 0.011, z * 0.011) * 1.1 + noise(x * 0.05 + 7, z * 0.05 - 3) * 0.25;
  const edge = 1 - smoothstep(330, 495, Math.max(Math.abs(x), Math.abs(z))); // reljefa malā kalns pazūd (bez klints)
  h += Math.min(bump(x, z, HILL.x, HILL.z, HILL.r, HILL.h, HILL.p), HILL.h - 1.6) * edge; // virsotnē neliels plato
  for (const [cx, cz, r, hh] of SIDE_HILLS) h += bump(x, z, cx, cz, r, hh);
  return h;
}
const flatMask = (x, z, cx, cz, hw, hd, pad) => {
  const dx = Math.max(0, Math.abs(x - cx) - hw), dz = Math.max(0, Math.abs(z - cz) - hd);
  return 1 - smoothstep(0, pad, Math.hypot(dx, dz));
};
let stationH = null;
export function winterHeight(x, z) {
  if (!stationH) stationH = { b: rawHeight(LIFT.x, LIFT.zB), t: rawHeight(LIFT.x, LIFT.zT) };
  let h = rawHeight(x, z);
  h = lerp(h, GROUND_Y + 0.15, flatMask(x, z, ARENA.x, ARENA.z, ARENA.hw + 5, ARENA.hd + 5, 14));
  h = lerp(h, GROUND_Y + 0.2, flatMask(x, z, PLAZA.x, PLAZA.z, 31, 31, 14));
  h = lerp(h, stationH.b, flatMask(x, z, LIFT.x, LIFT.zB, 7, 8, 8));
  h = lerp(h, stationH.t, flatMask(x, z, LIFT.x, LIFT.zT, 7, 7, 7));
  return h;
}
const inRect = (x, z, r, pad = 0) => Math.abs(x - r.x) < r.hw + pad && Math.abs(z - r.z) < r.hd + pad;
export const inArena = (x, z) => inRect(x, z, ARENA);

// sniegotās eglītes (deterministiski — tās pašas vietas visiem un kartē)
let treeList = null;
export function winterTrees() {
  if (treeList) return treeList;
  const rnd = mulberry32(SEED + 3), fn = makeNoise2D(SEED + 5);
  treeList = [];
  winterRoads();
  for (let gx = -ZONE_HALF + 4; gx < ZONE_HALF; gx += 9) {
    for (let gz = -ZONE_HALF + 4; gz < ZONE_HALF; gz += 9) {
      const x = gx + (rnd() - 0.5) * 7.5, z = gz + (rnd() - 0.5) * 7.5;
      const r1 = rnd(), r2 = rnd(), r3 = rnd();
      const f = fn(x * 0.009, z * 0.009) + 0.35 * fn(x * 0.04, z * 0.04);
      const onHill = Math.hypot(x - HILL.x, z - HILL.z) < HILL.r - 10;
      let p = f > 0.18 ? 0.5 : f > 0 ? 0.1 : 0.025;
      if (onHill) p = Math.max(p, 0.25);
      if (r1 > p) continue;
      // brīvas vietas: trase, pacēlājs, laukumi, ierašanās josla
      if (x > PISTE.x0 - 6 && x < PISTE.x1 + 6 && z > PISTE.z0 && z < PISTE.z1 + 10) continue;
      if (Math.abs(x - LIFT.x) < 11 && z > LIFT.zT - 14 && z < LIFT.zB + 14) continue;
      if (inRect(x, z, ARENA, 14) || Math.hypot(x - PLAZA.x, z - PLAZA.z) < 44) continue;
      if (Math.hypot(x - HILL.x, z - HILL.z) < 24 || Math.hypot(x - CABIN.x, z - CABIN.z) < 14) continue;
      if (z > ZONE_HALF - 12 || Math.abs(x) > ZONE_HALF - 3 || z < -ZONE_HALF + 3 || roadIdx.near(x, z).d < 7) continue;
      if (Math.hypot(x - WINTER_CAR.x, z - WINTER_CAR.z) < 8 || Math.hypot(x - SLED_SPOT.x, z - SLED_SPOT.z) < 7) continue;
      if (HERDS.some((h) => Math.hypot(x - h.x, z - h.z) < h.r * 0.7)) continue;
      treeList.push({ id: treeList.length, kind: r2 < 0.5 ? 'a' : 'b', x, z, y: winterHeight(x, z) - 0.15, ry: r3 * TAU, s: 0.8 + r2 * 0.75 });
    }
  }
  return treeList;
}

// kartes attēls (zīmē minikarte, arī neesot šajā zemē)
let mapCanvas = null;
export function winterMap() {
  if (mapCanvas) return mapCanvas;
  const S = 220, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const x = -ZONE_HALF + (px + 0.5) / S * 2 * ZONE_HALF, z = -ZONE_HALF + (py + 0.5) / S * 2 * ZONE_HALF;
    const h = winterHeight(x, z);
    const sh = Math.max(-40, Math.min(30, (winterHeight(x - 3, z - 3) - h) * 6));
    let col = [236 + sh, 241 + sh, 247 + sh];
    if (x > PISTE.x0 && x < PISTE.x1 && z > PISTE.z0 && z < PISTE.z1) col = col.map((v, i) => v + (i === 2 ? 4 : -6));
    const k = (py * S + px) * 4;
    img.data[k] = Math.min(255, col[0]); img.data[k + 1] = Math.min(255, col[1]); img.data[k + 2] = Math.min(255, col[2]); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const toPx = (x, z) => [(x + ZONE_HALF) / (2 * ZONE_HALF) * S, (z + ZONE_HALF) / (2 * ZONE_HALF) * S];
  g.fillStyle = '#2f5a3a';
  for (const t of winterTrees()) { const [px, py] = toPx(t.x, t.z); g.fillRect(px - 0.8, py - 0.8, 1.6, 1.6); }
  g.strokeStyle = '#a08458'; g.lineWidth = 2;
  for (const l of winterRoads()) { g.beginPath(); l.forEach((p, i) => { const [px, py] = toPx(p.x, p.z); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); }
  g.strokeStyle = '#333'; g.lineWidth = 1.2;
  const [a0, b0] = toPx(LIFT.x, LIFT.zB), [a1, b1] = toPx(LIFT.x, LIFT.zT);
  g.beginPath(); g.moveTo(a0, b0); g.lineTo(a1, b1); g.stroke();
  const [ax, ay] = toPx(ARENA.x - ARENA.hw, ARENA.z - ARENA.hd), [bx, by] = toPx(ARENA.x + ARENA.hw, ARENA.z + ARENA.hd);
  g.strokeStyle = '#4a7ad0'; g.strokeRect(ax, ay, bx - ax, by - ay);
  mapCanvas = c;
  return c;
}
export const WINTER_ICONS = [['⛷️', -25, -245], ['🚡', LIFT.x, LIFT.zB], ['❄️', ARENA.x, ARENA.z], ['🎄', PLAZA.x, PLAZA.z]];

// ---------- sniega reljefa gabali ar detalizācijas līmeņiem ----------
const SNOW_T = 68, SNOW_LOD = [80, 200]; // gabals 68 šūnas (200 m); attālumi, kur pāriet uz 2×/4× retāku režģi
function buildSnowTiles(geo, G, mat) {
  const P = geo.attributes.position.array, Nn = geo.attributes.normal.array, U = geo.attributes.uv.array, W = N + 1;
  const tiles = [];
  for (let tz = 0; tz < N / SNOW_T; tz++) for (let tx = 0; tx < N / SNOW_T; tx++) {
    const lods = [1, 2, 4].map((st, li) => {
      const n = SNOW_T / st; // 34/4 nav vesels — pēdējo kolonnu ņem uz malas
      const cols = [];
      for (let i = 0; i <= Math.ceil(n); i++) cols.push(Math.min(SNOW_T, Math.round(i * st)));
      const C = cols.length, pos = [], nor = [], uv = [], idx = [];
      const put = (gi, dy) => { pos.push(P[gi * 3], P[gi * 3 + 1] + dy, P[gi * 3 + 2]); nor.push(Nn[gi * 3], Nn[gi * 3 + 1], Nn[gi * 3 + 2]); uv.push(U[gi * 2], U[gi * 2 + 1]); };
      const gid = (a, b) => (tz * SNOW_T + cols[b]) * W + tx * SNOW_T + cols[a];
      for (let b = 0; b < C; b++) for (let a = 0; a < C; a++) put(gid(a, b), 0);
      for (let b = 0; b < C - 1; b++) for (let a = 0; a < C - 1; a++) {
        const i0 = b * C + a;
        idx.push(i0, i0 + C, i0 + 1, i0 + 1, i0 + C, i0 + C + 1);
      }
      // „svārki” gar malām — paslēpj spraugas starp blakus gabaliem ar dažādu režģi
      const edge = (list) => {
        const base = pos.length / 3;
        for (const [a, b] of list) put(gid(a, b), -1.5 * st);
        for (let k = 0; k < list.length - 1; k++) {
          const t0 = list[k][1] * C + list[k][0], t1 = list[k + 1][1] * C + list[k + 1][0];
          idx.push(t0, base + k, t1, t1, base + k, base + k + 1, t0, t1, base + k, t1, base + k + 1, base + k);
        }
      };
      const r = [...Array(C).keys()];
      edge(r.map((a) => [a, 0])); edge(r.map((a) => [a, C - 1])); edge(r.map((b) => [0, b])); edge(r.map((b) => [C - 1, b]));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true; m.visible = li === 2;
      G.add(m);
      return m;
    });
    const h = SNOW_T * CELL / 2;
    tiles.push({ cx: -HS + (tx * SNOW_T) * CELL + h, cz: -HS + (tz * SNOW_T) * CELL + h, h, lods, k: 2 });
  }
  return tiles;
}

// ---------- materiāli un modeļi ----------
let snowMat = null;
function snowMaterial() {
  if (snowMat) return snowMat;
  const m = new THREE.MeshStandardMaterial({ color: '#e4eaf1', roughness: 0.72, metalness: 0 });
  // dzirkstošas sniega kristāliņu atblāzmas, kas mainās, kustoties kamerai
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSnowP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnowP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSnowP;')
      .replace('#include <opaque_fragment>', `
{
  vec3 cell = floor(vSnowP * 18.0);
  float r = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vec3 Vd = normalize(cameraPosition - vSnowP);
  float tw = fract(r * 7.13 + dot(Vd, vec3(3.1, 2.7, 1.9)) * 2.0);
  float dist = length(cameraPosition - vSnowP);
  float sp = step(0.992, r) * smoothstep(0.82, 1.0, tw) * (1.0 - smoothstep(8.0, 40.0, dist));
  outgoingLight += vec3(1.0, 0.98, 0.93) * sp * 1.8;
}
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'snow-v1';
  loadTexture('assets/tex/snow_n.jpg', false, 1).then((t) => {
    t.repeat.set(0.25, 0.25); // pasaules mērogs: uv ir metros
    m.normalMap = t; m.normalScale.set(0.9, 0.9); m.needsUpdate = true;
  }).catch((e) => console.warn(e));
  snowMat = m;
  m.addEventListener('dispose', () => { if (snowMat === m) snowMat = null; });
  return m;
}

// sniegota egle: stumbrs, zaru stāvi un sniega cepures — viena ģeometrija ar virsotņu krāsām
const treeTpl = {};
function snowyTreeTemplate(kind) {
  if (treeTpl[kind]) return treeTpl[kind];
  const parts = [], col = new THREE.Color();
  const add = (g, hex, jitter = 0) => {
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col.set(hex); if (jitter) col.offsetHSL(0, 0, (Math.random() - 0.5) * jitter); c.set([col.r, col.g, col.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const tall = kind[0] === 'a';
  const lo = kind.endsWith('lo');
  const H = tall ? 9 : 6.5, R = tall ? 2.3 : 2.6, tiers = lo ? 2 : tall ? 5 : 4, seg = lo ? 6 : 8;
  add(new THREE.CylinderGeometry(0.16, 0.28, H * 0.3, lo ? 4 : 7, 1, lo).translate(0, H * 0.15, 0), '#4a3424');
  for (let i = 0; i < tiers; i++) {
    // tālajai versijai — divi lieli stāvi (tas pats siluets ar ~10× mazāk virsotnēm)
    const t = i / tiers, r = R * (1 - t * 0.82), y = H * 0.18 + t * H * 0.74, hh = lo ? H * (i ? 0.42 : 0.5) : H * 0.32 * (1 - t * 0.35);
    const cone = new THREE.ConeGeometry(r, hh, seg, 1, true); cone.translate(0, y + hh / 2, 0);
    add(cone, i % 2 ? '#1f4630' : '#24503a', 0.05);
    // sniega cepure uz zariem (nedaudz mazāka, augstāk)
    const cap = new THREE.ConeGeometry(r * 0.86, hh * 0.62, seg, 1, true); cap.translate(0, y + hh * 0.38 + hh * 0.31 + 0.05, 0);
    add(cap, '#eef2f7');
  }
  if (!lo) { const top = new THREE.ConeGeometry(0.22, 0.6, 6); top.translate(0, H * 0.95, 0); add(top, '#f2f5f9'); }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, treeMat());
  mesh.castShadow = !lo; mesh.receiveShadow = !lo;
  const grp = new THREE.Group(); grp.add(mesh);
  return (treeTpl[kind] = grp);
}
let treeM = null;
function treeMat() { return treeM || (treeM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })); }

function snowman(scale = 1, hat = 'top') {
  const g = new THREE.Group(), snow = mat('#f4f7fb', { roughness: 0.9 });
  const ball = (r, y) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), snow); m.position.y = y; m.castShadow = true; m.receiveShadow = true; g.add(m); };
  ball(0.75, 0.62); ball(0.55, 1.62); ball(0.4, 2.35);
  const coal = mat('#141414', { roughness: 0.5 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), coal); e.position.set(s * 0.14, 2.45, 0.35); g.add(e); }
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), coal); b.position.set(0, 1.4 + i * 0.2, 0.53 - Math.abs(i - 1) * 0.02); g.add(b); }
  for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), coal); m.position.set(Math.sin(a) * 0.2, 2.24 - Math.cos(a) * 0.05, 0.34); g.add(m); }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.38, 10), mat('#e8701c', { roughness: 0.6 }));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 2.36, 0.55); g.add(nose);
  const stick = mat('#5a3a22', { roughness: 0.9 });
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.1, 5), stick);
    arm.position.set(s * 0.85, 1.85, 0); arm.rotation.z = s * 1.0; g.add(arm);
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.3, 4), stick);
    tw.position.set(s * 1.25, 2.2, 0); tw.rotation.z = s * 0.3; g.add(tw);
  }
  const sc = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.07, 8, 18), mat('#2a64c8', { roughness: 0.95 }));
  sc.rotation.x = Math.PI / 2; sc.position.y = 2.05; g.add(sc);
  if (hat === 'top') {
    const hm = mat('#1a1a1c', { roughness: 0.6 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 18), hm); brim.position.y = 2.68; g.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.48, 18), hm); crown.position.y = 2.94; g.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.08, 18), mat('#b02020')); band.position.y = 2.75; g.add(band);
  } else {
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.4, 14), mat('#7a8a96', { roughness: 0.4, metalness: 0.6 }));
    bucket.position.y = 2.82; bucket.rotation.z = 0.15; g.add(bucket);
  }
  g.scale.setScalar(scale);
  return g;
}

// krēsla pacēlāja krēsls: sēdekļa virsa y=0, pakaramais stienis uz augšu līdz trosei (2.3 m)
let chairG = null;
export function chairGeometry() {
  if (chairG) return chairG;
  const parts = [], col = new THREE.Color();
  const add = (g, hex) => { const n = g.attributes.position.count, c = new Float32Array(n * 3); col.set(hex); for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g.index ? g.toNonIndexed() : g); };
  add(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 6).translate(0, 1.15 + 0.62, -0.32), '#3a3d42');
  add(new THREE.BoxGeometry(0.05, 0.05, 0.42).translate(0, 0.62, -0.12), '#3a3d42');
  add(new THREE.BoxGeometry(1.2, 0.08, 0.5).translate(0, -0.04, 0.0), '#2456a8');
  add(new THREE.BoxGeometry(1.2, 0.62, 0.07).translate(0, 0.28, -0.27), '#2456a8');
  add(new THREE.BoxGeometry(1.22, 0.04, 0.04).translate(0, 0.45, 0.3), '#c8ccd0');
  add(new THREE.BoxGeometry(0.9, 0.04, 0.22).translate(0, -0.5, 0.36), '#3a3d42');
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.62, 0.04).translate(s * 0.58, 0.0, 0.3), '#3a3d42');
  chairG = mergeGeometries(parts);
  chairG.computeVertexNormals();
  return chairG;
}
let chairM = null;
export function chairMaterial() { return chairM || (chairM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 })); }

// ---------- sniegputenis: daļiņas ap kameru, kustība ēnotājā (viens zīmēšanas izsaukums) ----------
function buildSnowfall() {
  const COUNT = 5000, BOX = new THREE.Vector3(90, 45, 90);
  const pos = new Float32Array(COUNT * 3), rnd = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) { pos.set([Math.random() * BOX.x, Math.random() * BOX.y, Math.random() * BOX.z], i * 3); rnd[i] = Math.random(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: BOX }, uAmt: { value: 0 }, uWind: { value: new THREE.Vector2(1.2, 0.4) } },
    vertexShader: `
      uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform vec2 uWind;
      attribute float aRnd; varying float vA;
      void main() {
        vec3 p = position;
        float fall = 1.2 + aRnd * 0.9;
        p.y -= uTime * fall;
        p.x += uTime * uWind.x + sin(uTime * (0.6 + aRnd) + aRnd * 30.0) * 0.9;
        p.z += uTime * uWind.y + cos(uTime * (0.5 + aRnd) + aRnd * 17.0) * 0.9;
        p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (3.0 + aRnd * 4.0) * (32.0 / max(1.0, -mv.z));
        vA = smoothstep(45.0, 18.0, -mv.z) * smoothstep(1.5, 4.5, -mv.z); // tuvās pārslas neaizsedz skatu
      }`,
    fragmentShader: `
      uniform float uAmt; varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.15, length(c));
        gl_FragColor = vec4(vec3(1.0), a * vA * uAmt * 0.95);
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  pts.userData.count = COUNT;
  return pts;
}

// sniegputeņa stiprums 0..1 no kopīgā laika (visiem spēlētājiem vienāds)
export function snowAmount(ms) {
  const t = ms / 1000;
  return smoothstep(0.15, 0.55, 0.5 + 0.5 * Math.sin(t / 95)) * (0.65 + 0.35 * Math.sin(t / 21));
}

// ---------- pati zeme ----------
export class WinterZone {
  constructor(id, hi) {
    this.id = id;
    this.hi = hi;
    this.open = openSides(id);
    this.group = new THREE.Group();
    this.water = null;
    this.platforms = [];
    this.grassCenter = null;
    this.grid = new Map();
    this.obstacles = []; // sniega pikām: [minX, minY, minZ, maxX, maxY, maxZ]
    this.targets = [];
    this.heights = new Float32Array((N + 1) * (N + 1));
    for (let iz = 0; iz <= N; iz++) for (let ix = 0; ix <= N; ix++) this.heights[iz * (N + 1) + ix] = winterHeight(-HS + ix * CELL, -HS + iz * CELL);
    this.lift = this.makeLift();
  }

  getHeight(x, z) {
    let fx = (x + HS) / CELL, fz = (z + HS) / CELL;
    if (fx < 0 || fz < 0 || fx >= N || fz >= N) return GROUND_Y;
    const n = N + 1, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, H = this.heights;
    const ha = H[iz * n + ix], hb = H[(iz + 1) * n + ix], hc = H[(iz + 1) * n + ix + 1], hd = H[iz * n + ix + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }
  groundAt(x, z) { return this.getHeight(x, z); }
  roadDist(x, z) { winterRoads(); return roadIdx.near(x, z).d; }

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
        const dx = pos.x - c[0], dz = pos.z - c[1], min = c[2] + radius, d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2); pos.x = c[0] + dx / d * min; pos.z = c[1] + dz / d * min; hit = true; }
      }
    }
    if (clampSquare(pos, this.open)) hit = true;
    return hit;
  }

  // pacēlāja līnija: augšup brauc rietumu pusē, lejup — austrumu
  makeLift() {
    const hB = winterHeight(LIFT.x, LIFT.zB), hT = winterHeight(LIFT.x, LIFT.zT);
    const L = { len: LIFT.zB - LIFT.zT, cB: hB + 6, cT: hT + 9, hB, hT };
    // trose: taisna līnija, bet kalna izliekumā vismaz 8 m virs zemes (izlīdzināta)
    const CS = 2, cn = Math.ceil(L.len / CS) + 1;
    let cab = Array.from({ length: cn }, (_, i) => { const t = clamp(i * CS / L.len, 0, 1); return Math.max(L.cB + (L.cT - L.cB) * t, winterHeight(LIFT.x, LIFT.zB - i * CS) + 8); });
    for (let pass = 0; pass < 4; pass++) cab = cab.map((v, i) => Math.max(v, (cab[Math.max(0, i - 3)] + cab[Math.min(cn - 1, i + 3)]) / 2));
    cab[0] = L.cB; cab[cn - 1] = Math.max(cab[cn - 1], L.cT);
    L.cable = (s) => { const f = clamp(s, 0, L.len) / CS, i = Math.min(cn - 2, Math.floor(f)); return cab[i] + (cab[i + 1] - cab[i]) * (f - i); };
    L.upPoint = (s, out) => out.set(LIFT.x - LIFT.off, L.cable(s) - 2.3, LIFT.zB - s);
    L.total = 2 * L.len + 2 * Math.PI * LIFT.off;
    // krēsla vieta cilpā pēc parametra u: augšup, apgrieziens, lejup, apgrieziens
    L.loop = (u, out) => {
      u = ((u % L.total) + L.total) % L.total;
      const semi = Math.PI * LIFT.off;
      if (u < L.len) { out.set(LIFT.x - LIFT.off, L.cable(u) - 2.3, LIFT.zB - u); return Math.PI; }
      u -= L.len;
      if (u < semi) { const a = u / LIFT.off; out.set(LIFT.x - Math.cos(a) * LIFT.off, L.cT - 2.3, LIFT.zT - Math.sin(a) * LIFT.off); return Math.PI + a; }
      u -= semi;
      if (u < L.len) { out.set(LIFT.x + LIFT.off, L.cable(L.len - u) - 2.3, LIFT.zT + u); return 0; }
      u -= L.len;
      const a = u / LIFT.off; out.set(LIFT.x + Math.cos(a) * LIFT.off, L.cB - 2.3, LIFT.zB + Math.sin(a) * LIFT.off); return a;
    };
    return L;
  }

  updateVisibility(x, z) {
    if (this.snowTiles) for (const t of this.snowTiles) {
      const d = Math.hypot(Math.max(0, Math.abs(x - t.cx) - t.h), Math.max(0, Math.abs(z - t.cz) - t.h));
      const k = d < SNOW_LOD[0] ? 0 : d < SNOW_LOD[1] ? 1 : 2;
      if (k !== t.k) { t.lods[t.k].visible = false; t.lods[k].visible = true; t.k = k; }
    }
    if (!this.trees) return;
    this.trees.update(x, z);
    this.treesLo.view = Math.min(420, this.viewFar || 420);
    this.treesLo.update(x, z);
  }
  updateClouds() { /* */ }

  // atgriež solījumu (faktūras ielādējas fonā — gaidīt nevajag)
  build(parent) {
    const G = this.group;
    // sniega reljefs (viena ģeometrija) un līdzenums līdz horizontam
    const geo = new THREE.PlaneGeometry(SZ, SZ, N, N);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) { p.setY(i, this.heights[i]); uv.setXY(i, p.getX(i), p.getZ(i)); }
    geo.computeVertexNormals();
    const snow = snowMaterial();
    // reljefu sadala 200 m gabalos (5×5): nezīmē tos, kas nav redzami, un tālos zīmē ar retāku režģi (LOD)
    this.snowTiles = buildSnowTiles(geo, G, snow);
    geo.dispose();
    // līdzenums ap reljefu (gredzens — zem reljefa tā nav, citādi tas izspiežas cauri ieplakām)
    const B = 1300, rects = [[-B, -B, B, -HS], [-B, HS, B, B], [-B, -HS, -HS, HS], [HS, -HS, B, HS]];
    const far = mergeGeometries(rects.map(([x0, z0, x1, z1]) => new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, GROUND_Y - 0.05, (z0 + z1) / 2)));
    const fuv = far.attributes.uv, fp = far.attributes.position;
    for (let i = 0; i < fp.count; i++) fuv.setXY(i, fp.getX(i), fp.getZ(i));
    const farM = new THREE.Mesh(far, snow); farM.receiveShadow = true; G.add(farM);

    // sniegotās eglītes — instancētas pa apgabaliem
    const trees = winterTrees();
    for (const t of trees) this.addCollider(t.x, t.z, 0.55 * t.s);
    // tuvumā pilnas eglītes, tālumā vienkāršas (abi lauki ar vienādiem apgabaliem)
    this.trees = new InstanceField(trees, (k) => snowyTreeTemplate(k), { chunk: 64, view: 130 });
    this.trees.build(G);
    this.treesLo = new InstanceField(trees, (k) => snowyTreeTemplate(k + 'lo'), { chunk: 64, view: 420, minView: 130 });
    this.treesLo.build(G);

    const deco = new THREE.Group();
    this.buildLift(deco);
    this.buildPlaza(deco);
    this.buildArena(deco);
    this.buildCabin(deco);
    this.buildPisteMarkers(deco);
    G.add(flattenStatic(deco));
    G.add(buildRoadMesh(winterRoads(), (x, z) => this.getHeight(x, z), 0.07));
    // kustīgie: krēsli, Ziemassvētku lampiņas, ziemeļbrieži, sniegputenis, mērķi
    this.chairs = new THREE.InstancedMesh(chairGeometry(), chairMaterial(), CHAIRS);
    this.chairs.castShadow = true;
    this.chairs.frustumCulled = false;
    G.add(this.chairs);
    this.buildDeer(G);
    this.buildSkiers(G);
    this.buildTargets(G);
    this.snowfall = buildSnowfall();
    G.add(this.snowfall);
    G.add(buildBorderPosts(this.open, (x, z) => this.getHeight(x, z)));
    this.buildFence(G);
    parent.add(G);
    return Promise.resolve();
  }

  buildFence(G) {
    const H = ZONE_HALF, posts = [], rails = [];
    const wood = mat('#6e5038', { roughness: 0.9 });
    for (const s in DIRS) {
      if (this.open.includes(s)) continue;
      const [dx, dz] = DIRS[s], px = -dz, pz = dx;
      for (let l = -H; l <= H; l += 4) { const x = dx * (H + 0.5) + px * l, z = dz * (H + 0.5) + pz * l; posts.push([x, this.getHeight(x, z), z]); }
    }
    const pg = new THREE.CylinderGeometry(0.07, 0.09, 1.4, 5).translate(0, 0.6, 0);
    const im = new THREE.InstancedMesh(pg, wood, posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); im.setMatrixAt(i, m4); });
    im.computeBoundingSphere();
    G.add(im);
    // sniega cepurītes uz stabiem
    const cap = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 5, 0, TAU, 0, Math.PI / 2).scale(1, 0.6, 1), mat('#f4f7fb', { roughness: 0.9 }), posts.length);
    posts.forEach(([x, y, z], i) => { m4.makeTranslation(x, y + 1.3, z); cap.setMatrixAt(i, m4); });
    cap.computeBoundingSphere();
    G.add(cap);
    void rails;
  }

  buildLift(g) {
    const L = this.lift, steel = mat('#5c636b', { roughness: 0.45, metalness: 0.7 }), red = mat('#b8322a', { roughness: 0.6 });
    const snowM = mat('#f4f7fb', { roughness: 0.9 }), concrete = mat('#9a9690', { roughness: 0.95 }), wood = mat('#6e5038', { roughness: 0.9 });
    const station = (z, h, cableY, label, up) => {
      const s = new THREE.Group();
      s.position.set(LIFT.x, h, z);
      const plat = new THREE.Mesh(new THREE.BoxGeometry(9, 0.4, 9), concrete); plat.position.y = 0.0; s.add(plat);
      for (const [x, zz] of [[-3.8, -3.8], [3.8, -3.8], [-3.8, 3.8], [3.8, 3.8]]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, cableY - h + 1.6, 0.35), steel); post.position.set(x, (cableY - h + 1.6) / 2, zz); s.add(post);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.35, 9.4), red); roof.position.y = cableY - h + 1.75; s.add(roof);
      const rs = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.3, 9.6), snowM); rs.position.y = cableY - h + 2.05; s.add(rs);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(LIFT.off, 0.14, 8, 28), steel); wheel.rotation.x = Math.PI / 2; wheel.position.y = cableY - h + 0.05; s.add(wheel);
      const motor = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.4), red); motor.position.set(0, 1.4, up ? -5.4 : 5.4); s.add(motor);
      const ms = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 2.6), snowM); ms.position.set(0, 2.7, up ? -5.4 : 5.4); s.add(ms);
      const sign = makeTextSprite(label, { fontSize: 44, bg: 'rgba(30,60,120,0.85)' }); sign.position.set(0, cableY - h + 3.2, 0); s.add(sign);
      g.add(s);
      this.addCollider(LIFT.x + (up ? 0 : 0), z + (up ? -5.4 : 5.4), 1.9);
    };
    station(LIFT.zB, L.hB, L.cB, '🚡 Krēslu pacēlājs', false);
    station(LIFT.zT, L.hT, L.cT, '⛷️ Starts', true);
    // troses
    for (const s of [-1, 1]) {
      const pts = [];
      for (let q = 0; q <= L.len; q += 6) pts.push(new THREE.Vector3(LIFT.x + s * LIFT.off, L.cable(q), LIFT.zB - q));
      pts.push(new THREE.Vector3(LIFT.x + s * LIFT.off, L.cable(L.len), LIFT.zT));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.03, 5), steel));
    }
    // balsti
    for (let s = 30; s < L.len - 15; s += 40) {
      const z = LIFT.zB - s, gy = winterHeight(LIFT.x, z), cy = L.cable(s);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, cy - gy + 0.4, 8), steel); col.position.set(LIFT.x, (gy + cy + 0.4) / 2 - 0.2, z); g.add(col);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(LIFT.off * 2 + 0.8, 0.3, 0.4), steel); bar.position.set(LIFT.x, cy + 0.35, z); g.add(bar);
      for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), red); w.rotation.z = Math.PI / 2; w.position.set(LIFT.x + sd * LIFT.off, cy + 0.12, z); g.add(w); }
      const sc = new THREE.Mesh(new THREE.BoxGeometry(LIFT.off * 2 + 0.9, 0.12, 0.5), snowM); sc.position.set(LIFT.x, cy + 0.56, z); g.add(sc);
      this.addCollider(LIFT.x, z, 0.6);
    }
    // slēpju statīvs pie apakšējās stacijas
    const rack = new THREE.Group(); rack.position.set(RACK.x, winterHeight(RACK.x, RACK.z), RACK.z);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.12), wood); beam.position.y = 1.3; rack.add(beam);
    for (const x of [-1.5, 1.5]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), wood); p.position.set(x, 0.7, 0); rack.add(p); }
    ['#d42a2a', '#2a6ad4', '#f2c12e', '#2fa84f', '#e8742a', '#9b3bd2'].forEach((c, i) => {
      const sk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.03), mat(c, { roughness: 0.35 })); sk.position.set(-1.3 + i * 0.5, 0.85, 0.1); sk.rotation.x = -0.12; rack.add(sk);
    });
    const rs = makeTextSprite('⛷️ Slēpes', { fontSize: 40, bg: 'rgba(120,70,30,0.85)' }); rs.position.y = 2.3; rack.add(rs);
    g.add(rack);
    this.addCollider(RACK.x, RACK.z, 1.2);
  }

  buildPlaza(g) {
    const y0 = winterHeight(PLAZA.x, PLAZA.z);
    // liela izrotāta Ziemassvētku egle
    const tree = new THREE.Group(); tree.position.set(PLAZA.x, y0 - 0.1, PLAZA.z);
    const tm = snowyTreeTemplate('a').children[0].clone(); tm.scale.setScalar(1.55); tree.add(tm);
    const rnd = mulberry32(SEED + 11);
    const cols = ['#d42a2a', '#f2c12e', '#2a6ad4', '#e8e8f0', '#c04ad2'];
    for (let i = 0; i < 70; i++) {
      const t = rnd(), a = rnd() * TAU, H = 9 * 1.55, y = H * (0.2 + t * 0.7), r = 2.3 * 1.55 * (1 - (y / H - 0.18) / 0.74 * 0.82) * 0.92;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(cols[i % cols.length], { roughness: 0.15, metalness: 0.6 }));
      b.position.set(Math.cos(a) * r, y, Math.sin(a) * r); tree.add(b);
    }
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.28 : 0.65, a = i / 10 * TAU + Math.PI / 2; (i ? starShape.lineTo.bind(starShape) : starShape.moveTo.bind(starShape))(Math.cos(a) * r, Math.sin(a) * r); }
    const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape, { depth: 0.15, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: '#ffb020', emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.3 }));
    star.position.set(0, 9 * 1.55 + 0.55, -0.07); tree.add(star);
    // dāvanas
    [['#c42830', 1.4, 0.2], ['#2a6ad4', -1.2, 1.0], ['#2fa84f', 0.6, -1.5], ['#f2c12e', -1.6, -0.8], ['#9b3bd2', 1.9, -0.9]].forEach(([c, x, z], i) => {
      const s = 0.55 + (i % 3) * 0.18;
      const box = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s), mat(c, { roughness: 0.5 })); box.position.set(x * 1.6, s * 0.4, z * 1.6 + 1); box.rotation.y = i; tree.add(box);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, s * 0.82, 0.08), mat('#f4e6a0', { roughness: 0.4, metalness: 0.4 })); rib.position.copy(box.position); rib.rotation.y = i; tree.add(rib);
    });
    g.add(tree);
    this.addCollider(PLAZA.x, PLAZA.z, 3.6);
    this.lights = { x: PLAZA.x, y: y0, z: PLAZA.z };
    const sign = makeTextSprite('🎄 Priecīgus Ziemassvētkus!', { fontSize: 48, bg: 'rgba(160,30,30,0.85)' });
    sign.position.set(PLAZA.x, y0 + 17, PLAZA.z); sign.scale.multiplyScalar(1.4); g.add(sign);
    // sniegavīri
    for (const [x, z, s, hat, ry] of [[PLAZA.x - 14, PLAZA.z + 8, 1.0, 'top', 0.4], [PLAZA.x + 13, PLAZA.z + 10, 0.85, 'bucket', -0.5], [PLAZA.x + 35, PLAZA.z + 30, 1.1, 'bucket', 0.2], [PLAZA.x - 45, PLAZA.z - 25, 0.9, 'top', 0]]) {
      const m = snowman(s, hat); m.position.set(x, winterHeight(x, z) - 0.1, z); m.rotation.y = ry; g.add(m);
      this.addCollider(x, z, 0.8 * s);
    }
    // ragavas ar dāvanām
    const sl = new THREE.Group(); const sx = PLAZA.x + 8, sz = PLAZA.z - 9; sl.position.set(sx, winterHeight(sx, sz), sz); sl.rotation.y = 0.6;
    const red = mat('#b8221e', { roughness: 0.45, metalness: 0.2 }), gold = mat('#d8b040', { roughness: 0.3, metalness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 2.6), red); body.position.y = 0.75; sl.add(body);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.25), red); back.position.set(0, 1.4, -1.15); sl.add(back);
    for (const s of [-1, 1]) {
      const run = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 6, 24, Math.PI * 0.35), gold); run.rotation.y = Math.PI / 2; run.position.set(s * 0.7, 1.55, 0.3); run.rotation.z = Math.PI * 1.15; sl.add(run);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 3.0), gold); bar.position.set(s * 0.7, 0.08, 0.2); sl.add(bar);
    }
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.45), mat(cols[i], { roughness: 0.5 })); b.position.set(-0.4 + (i % 2) * 0.7, 1.3, -0.3 + Math.floor(i / 2) * 0.6); b.rotation.y = i * 0.7; sl.add(b); }
    g.add(sl);
    this.addCollider(sx, sz, 1.6);
    // laternas ap laukumu
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + 0.3, x = PLAZA.x + Math.cos(a) * 20, z = PLAZA.z + Math.sin(a) * 20;
      const l = new THREE.Group(); l.position.set(x, winterHeight(x, z), z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 8), mat('#222428', { roughness: 0.4, metalness: 0.6 })); pole.position.y = 1.5; l.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: '#fff2c0', emissive: '#ffc860', emissiveIntensity: 1.2 })); lamp.position.y = 3.15; l.add(lamp);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.25, 10), mat('#f4f7fb', { roughness: 0.9 })); cap.position.y = 3.42; l.add(cap);
      g.add(l);
      this.addCollider(x, z, 0.3);
    }
  }

  buildArena(g) {
    const A = ARENA, y = winterHeight(A.x, A.z);
    const snowM = mat('#eef3f8', { roughness: 0.92 });
    // sniega vaļņi (noapaļoti) — aizsegi
    const wall = (x, z, len, rot = 0, h = 1.25) => {
      const geo = new THREE.CapsuleGeometry(0.6, len, 4, 10); geo.rotateZ(Math.PI / 2); geo.scale(1, h / 1.2, 1);
      const m = new THREE.Mesh(geo, snowM); m.position.set(x, y + 0.35, z); m.rotation.y = rot; m.castShadow = true; m.receiveShadow = true; g.add(m);
      const c = Math.cos(rot), s = Math.sin(rot), hl = len / 2 + 0.6;
      for (let t = -hl; t <= hl + 0.01; t += 0.9) this.addCollider(x + c * t, z - s * t, 0.6);
      // pikām: taisnstūris ap valni (ass sakrīt ar x vai z)
      const ax = Math.abs(c) > 0.5;
      this.obstacles.push([x - (ax ? hl : 0.65), y - 1, z - (ax ? 0.65 : hl), x + (ax ? hl : 0.65), y + 0.35 + h * 0.55, z + (ax ? 0.65 : hl)]);
    };
    for (const sd of [-1, 1]) {
      wall(A.x - 16, A.z + sd * 8, 5); wall(A.x + 16, A.z + sd * 8, 5);
      wall(A.x, A.z + sd * 13, 7); wall(A.x - 26, A.z + sd * 2, 4, Math.PI / 2); wall(A.x + 26, A.z + sd * 2, 4, Math.PI / 2);
      // cietokšņi abos galos (U veida)
      const fz = A.z + sd * 19;
      wall(A.x - 6, fz, 4); wall(A.x + 6, fz, 4); wall(A.x - 9.5, fz + sd * 1.8, 2.5, Math.PI / 2); wall(A.x + 9.5, fz + sd * 1.8, 2.5, Math.PI / 2);
    }
    // sniega piku kaudzes
    for (const [x, z] of [[A.x - 30, A.z], [A.x + 30, A.z], [A.x, A.z]]) {
      for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), snowM); b.position.set(x + (i % 3 - 1) * 0.25, y + 0.15 + Math.floor(i / 6) * 0.2, z + (Math.floor(i / 3) % 2 - 0.5) * 0.25); g.add(b); }
    }
    // stūru karodziņi un nosaukums
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = A.x + sx * A.hw, z = A.z + sz * A.hd;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), mat('#e8e8e8')); pole.position.set(x, y + 1.5, z); g.add(pole);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.8), mat(sz < 0 ? '#2a6ad4' : '#d42a2a', { side: THREE.DoubleSide })); flag.position.set(x, y + 2.7, z + 0.4); g.add(flag);
    }
    const s = makeTextSprite('❄️ Sniega piku kauja', { fontSize: 50, bg: 'rgba(40,90,170,0.85)' }); s.position.set(A.x, y + 5, A.z - A.hd - 2); s.scale.multiplyScalar(1.3); g.add(s);
  }

  buildCabin(g) {
    const c = new THREE.Group(); const y = winterHeight(CABIN.x, CABIN.z); c.position.set(CABIN.x, y - 0.1, CABIN.z); c.rotation.y = -0.5;
    const log = mat('#7a5232', { roughness: 0.9 }), snowM = mat('#f4f7fb', { roughness: 0.9 });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 5.5), log); walls.position.y = 1.6; c.add(walls);
    for (let i = 0; i < 8; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 7.3, 8), log); l.rotation.z = Math.PI / 2; l.position.set(0, 0.2 + i * 0.4, 2.78); c.add(l); }
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, 3.7), mat('#5a3e2a')); r.position.set(0, 4.05, s * 1.55); r.rotation.x = s * 0.62; c.add(r);
      const rs = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.3, 3.7), snowM); rs.position.set(0, 4.3, s * 1.62); rs.rotation.x = s * 0.62; c.add(rs);
    }
    const gable = new THREE.Shape([new THREE.Vector2(-2.75, 0), new THREE.Vector2(2.75, 0), new THREE.Vector2(0, 2.0)]);
    for (const s of [-1, 1]) { const gg = new THREE.Mesh(new THREE.ShapeGeometry(gable), log); gg.rotation.y = Math.PI / 2 * s; gg.position.set(s * 3.5, 3.2, 0); c.add(gg); }
    const winM = new THREE.MeshStandardMaterial({ color: '#ffd890', emissive: '#ffb050', emissiveIntensity: 1.1 });
    for (const x of [-2, 2]) { const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.05), winM); w.position.set(x, 1.8, 2.97); c.add(w); }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.06), mat('#4a3020')); door.position.set(0, 1.0, 2.98); c.add(door);
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2, 0.7), mat('#8a867e', { roughness: 1 })); ch.position.set(2.2, 4.8, -1); c.add(ch);
    const chs = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.8), snowM); chs.position.set(2.2, 5.85, -1); c.add(chs);
    const sign = makeTextSprite('☕ Slēpotāju namiņš', { fontSize: 40, bg: 'rgba(120,70,30,0.85)' }); sign.position.y = 6.6; c.add(sign);
    g.add(c);
    this.addCollider(CABIN.x, CABIN.z, 4.2);
    this.smoke = { x: CABIN.x + Math.cos(-0.5) * 2.2 + Math.sin(-0.5) * -1, y: y + 6.0, z: CABIN.z - Math.sin(-0.5) * 2.2 + Math.cos(-0.5) * -1 };
  }

  // oranži trases malu karodziņi
  buildPisteMarkers(g) {
    const pm = mat('#f07020', { roughness: 0.5 });
    for (let z = PISTE.z0 + 25; z < PISTE.z1; z += 26) {
      for (const x of [PISTE.x0, PISTE.x1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), pm); p.position.set(x, winterHeight(x, z) + 0.75, z); g.add(p);
      }
    }
  }

  buildDeer(G) {
    this.deer = [];
    const rnd = mulberry32(SEED + 21);
    for (const h of HERDS) {
      for (let i = 0; i < h.n; i++) {
        const m = buildNPC('briedis');
        G.add(m.root);
        this.deer.push({ id: this.deer.length, model: m, home: { x: h.x + (rnd() - 0.5) * h.r, z: h.z + (rnd() - 0.5) * h.r, R: 7 + rnd() * 8, p1: rnd() * 10, p2: rnd() * 10, sp: 0.5 + rnd() * 0.4 }, x: h.x, z: h.z, heading: 0 });
      }
    }
  }

  // ⛷️ citi slēpotāji (NPC): slalomā brauc lejā pa trasi, aizslīd līdz pacēlājam, brauc augšā un atkal lejā.
  // Viss pēc kopīgā pulksteņa — visi spēlētāji viņus redz vienās vietās.
  buildSkiers(G) {
    const L = this.lift, H = (x, z) => this.getHeight(x, z);
    const SK = [
      { animal: 'zakis', fur: '#d9d2c5', shirt: '#2f6fd6', A: 18, wave: 64, ph: 0.3, vmax: 15 },
      { animal: 'lapsa', fur: '#e8742a', shirt: '#f2c12e', A: 24, wave: 82, ph: 2.1, vmax: 17 },
      { animal: 'kakis', fur: '#3b3b3b', shirt: '#d23b3b', A: 12, wave: 48, ph: 4.0, vmax: 12 },
      { animal: 'suns', fur: '#c89b5e', shirt: '#2fa84f', A: 20, wave: 70, ph: 5.2, vmax: 14 },
    ];
    const x0 = SKI_START.x, zS = SKI_START.z, zE = LIFT.zB - 12, mid = (PISTE.x0 + PISTE.x1) / 2;
    const lo = PISTE.x0 + 7, hi = PISTE.x1 - 7, tLift = L.len / LIFT.v;
    this.skiers = SK.map((d, i) => {
      // ceļš: no starta vietas ieslīd trasē, tad slaloms līdz pakājei, pēc tam lēni līdz pacēlājam
      const px = [], pz = [], pt = [];
      for (let z = zS; z <= zE; z += 1.5) {
        const sl = mid + 8 * Math.sin(z * 0.011) + d.A * Math.sin((z - zS) * TAU / d.wave + d.ph);
        const k = smoothstep(zS, zS + 45, z), k2 = smoothstep(zE - 50, zE, z);
        let x = lerp(x0, clamp(sl, lo, hi), k);
        x = lerp(x, LIFT.x - 14, k2);
        px.push(x); pz.push(z);
      }
      px.push(LIFT.x - 5, LIFT.x - 1); pz.push(LIFT.zB - 3, LIFT.zB);
      // ātrums: slīpums paātrina, berze un gaiss bremzē, katram sava maksimālā ātruma robeža
      let v = 2, t = 0;
      pt.push(0);
      for (let k = 1; k < px.length; k++) {
        const len = Math.hypot(px[k] - px[k - 1], pz[k] - pz[k - 1]), drop = H(px[k - 1], pz[k - 1]) - H(px[k], pz[k]);
        const v2 = v * v + 2 * (9.8 * drop - 0.08 * 9.8 * len - 0.004 * v * v * len);
        const nv = clamp(Math.sqrt(Math.max(0, v2)), 2.5, d.vmax);
        t += len / ((v + nv) / 2);
        v = nv;
        pt.push(t);
      }
      const tDown = t, cycle = tDown + 3 + tLift + 4;
      const av = buildAnimal({ animal: d.animal, fur: d.fur, shirt: d.shirt });
      av.setWinter(true);
      av.setSkis(true);
      const chair = new THREE.Mesh(chairGeometry(), chairMaterial());
      chair.position.set(0, 0.25, -0.02); chair.visible = false;
      av.root.add(chair);
      av.root.rotation.order = 'YXZ';
      G.add(av.root);
      return { av, chair, px, pz, pt, tDown, tLift, cycle, off: i * cycle / SK.length + i * 7.3, heading: Math.PI, idx: 0 };
    });
  }

  updateSkiers(dt, t, game) {
    const L = this.lift, me = game.me.pos, v3 = new THREE.Vector3();
    for (const s of this.skiers || []) {
      const av = s.av, R = av.root;
      let u = (t + s.off) % s.cycle;
      let x, z, y, heading, speed = 0, state = 'ski', onLift = false;
      if (u < s.tDown) {
        // atrod posmu (secīgi no iepriekšējā — parasti 0–1 solis)
        let i = s.pt[s.idx] <= u ? s.idx : 0;
        while (i < s.pt.length - 2 && s.pt[i + 1] < u) i++;
        s.idx = i;
        const f = (u - s.pt[i]) / Math.max(1e-3, s.pt[i + 1] - s.pt[i]);
        x = lerp(s.px[i], s.px[i + 1], f); z = lerp(s.pz[i], s.pz[i + 1], f);
        const dx = s.px[i + 1] - s.px[i], dz = s.pz[i + 1] - s.pz[i];
        heading = Math.atan2(dx, dz);
        speed = Math.hypot(dx, dz) / Math.max(1e-3, s.pt[i + 1] - s.pt[i]);
        y = this.getHeight(x, z);
      } else if ((u -= s.tDown) < 3) {
        // pie pacēlāja gaida
        x = LIFT.x - 1; z = LIFT.zB; y = this.getHeight(x, z); heading = Math.PI;
      } else if ((u -= 3) < s.tLift) {
        L.upPoint(u * LIFT.v, v3);
        x = v3.x; z = v3.z; y = v3.y - 0.27; heading = Math.PI; state = 'lift'; onLift = true;
      } else {
        // kalna galā atgrūžas un sāk nobraucienu
        x = s.px[0]; z = s.pz[0]; y = this.getHeight(x, z); heading = Math.atan2(s.px[3] - s.px[0], s.pz[3] - s.pz[0]);
        s.idx = 0;
      }
      const near = Math.abs(x - me.x) < 170 && Math.abs(z - me.z) < 170;
      R.visible = near;
      if (!near) continue;
      let dh = heading - s.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const omega = dh / Math.max(dt, 1e-3);
      s.heading += dh * (1 - Math.exp(-dt * 10));
      R.position.set(x, y, z);
      R.rotation.y = s.heading;
      s.chair.visible = onLift;
      av.setSkis(true);
      if (state === 'ski') {
        const sl = skiSlope((a, b) => this.getHeight(a, b), x, z, s.heading);
        const lean = clamp(-Math.atan(speed * omega / 9.8) * 0.55, -0.42, 0.42);
        const k = 1 - Math.exp(-dt * 8);
        R.rotation.x = lerp(R.rotation.x, -sl.pitch, k);
        R.rotation.z = lerp(R.rotation.z, sl.roll * 0.7 + lean, k);
        av.skiPose = { down: R.rotation.x, v: speed, brake: 0, air: false, push: speed < 3.5 };
      } else { R.rotation.x = 0; R.rotation.z = 0; av.skiPose = null; }
      av.shadow.visible = !onLift;
      av.animate(dt, state, speed);
    }
  }

  // sniegavīri — mērķi piku mešanai laukuma ziemeļu galā
  buildTargets(G) {
    const A = ARENA;
    for (const dx of [-24, 0, 24]) {
      const x = A.x + dx, z = A.z - A.hd + 3;
      const m = snowman(0.75, dx === 0 ? 'top' : 'bucket');
      m.position.set(x, winterHeight(x, z) - 0.05, z);
      const f = flattenStatic(m); // viens sniegavīrs — 2–3 zīmēšanas izsaukumi; šūpojas vesels
      G.add(f);
      this.targets.push({ x, y: winterHeight(x, z), z, obj: f, wob: 0 });
      this.addCollider(x, z, 0.6);
    }
  }

  // kustība katrā kadrā: krēsli, lampiņas, brieži, sniegputenis, mērķi
  update(dt, game) {
    const t = game.now() / 1000, L = this.lift;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < CHAIRS; i++) {
      const yaw = L.loop(i * L.total / CHAIRS + t * LIFT.v, v);
      q.setFromAxisAngle(up, yaw);
      this.chairs.setMatrixAt(i, m4.compose(v, q, one));
    }
    this.chairs.instanceMatrix.needsUpdate = true;
    // brieži ganās
    for (const d of this.deer) {
      const h = d.home, ts = t;
      const kk = ts / 11 + h.p1, seg = Math.floor(kk), f = kk - seg, u = (seg + smoothstep(0, 0.5, f)) * 0.8 * h.sp;
      const x = h.x + h.R * (0.6 * Math.sin(u * 1.3 + h.p1) + 0.4 * Math.sin(u * 2.1 + h.p2));
      const z = h.z + h.R * (0.6 * Math.cos(u * 1.1 + h.p2) + 0.4 * Math.cos(u * 1.7 + h.p1));
      const sp = Math.hypot(x - d.x, z - d.z) / Math.max(dt, 1e-3);
      if (sp > 0.05) d.heading = angleLerp(d.heading, Math.atan2(x - d.x, z - d.z), 1 - Math.exp(-dt * 6));
      d.x = x; d.z = z;
      const near = Math.abs(x - game.me.pos.x) < 120 && Math.abs(z - game.me.pos.z) < 120;
      d.model.root.visible = near;
      if (!near) continue;
      d.model.root.position.set(x, this.getHeight(x, z), z);
      d.model.root.rotation.y = d.heading;
      d.model.animate(dt, sp > 0.05, Math.min(sp, 3));
    }
    this.updateSkiers(dt, t, game);
    // mērķu šūpošanās pēc trāpījuma
    for (const tg of this.targets) {
      if (tg.wob > 0) { tg.wob = Math.max(0, tg.wob - dt); tg.obj.rotation.z = Math.sin(tg.wob * 25) * tg.wob * 0.5; }
    }
    // sniegputenis
    const amt = snowAmount(game.now()) * (game.Q && game.Q.detail === 0 ? 0.6 : 1);
    const u = this.snowfall.material.uniforms;
    u.uTime.value = t % 1000; u.uCam.value.copy(game.camera.position); u.uAmt.value = amt;
    this.snowfall.visible = amt > 0.02;
    this.snowfall.geometry.setDrawRange(0, Math.round(this.snowfall.userData.count * (game.Q && game.Q.grass === 0 ? 0.35 : game.Q && game.Q.grass < 1 ? 0.6 : 1)));
    // migla sabiezē sniegputenī
    const fog = game.stage.fog, Q = game.Q;
    if (Q) { fog.near = Q.fog[0] * (1 - 0.55 * amt); fog.far = Q.fog[1] * (1 - 0.5 * amt); }
    this.amount = amt;
    if (Q) this.viewFar = Q.far;
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    // NPC slēpotāju materiāli/ģeometrijas ir kopīgi ar spēlētāju tēliem — tos neizmetam
    for (const s of this.skiers || []) s.av.root.removeFromParent();
    disposeTree(this.group, [treeMat(), chairMaterial(), roadMaterial()]); // sniega materiāls un faktūra tiek izmesti (nākamreiz ielādēs no jauna)
  }
}

// nogāzes slīpums zem slēpēm: pitch — kāpums uz priekšu, roll — kreisā puse augstāk
function skiSlope(h, x, z, heading) {
  const fx = Math.sin(heading), fz = Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading), L = 0.9, Wd = 0.4;
  return {
    pitch: Math.atan2(h(x + fx * L, z + fz * L) - h(x - fx * L, z - fz * L), 2 * L),
    roll: Math.atan2(h(x + rx * Wd, z + rz * Wd) - h(x - rx * Wd, z - rz * Wd), 2 * Wd),
  };
}

// =================== Game papildinājums: slēpošana, pacēlājs, pikas, ziemas drēbes ===================
const ballGeo = new THREE.SphereGeometry(0.11, 10, 8);
let ballMat = null;
const BALL_CD = 0.55;

export const Winter = {
  enterWinter() {
    this.avatar.setWinter(true);
    this.snowStats = this.snowStats || { hits: 0, hitBy: 0 };
    this.balls = this.balls || [];
    this.stage.fog.color.set('#dce6ef');
    toast('❄️ Ziemas zemē tev ir silta cepure, šalle un dūraiņi!', 'good', 3500);
  },

  leaveWinter() {
    this.avatar.setWinter(false);
    this.stopSki(true);
    this.me.lift = null;
    this.setLiftChair(this.avatar, false);
    for (const b of this.balls || []) b.mesh.removeFromParent();
    this.balls = [];
    if (this.Q) { this.stage.fog.near = this.Q.fog[0]; this.stage.fog.far = this.Q.fog[1]; }
    this.stage.fog.color.set('#a9c6dc');
    $('snow-hud').classList.add('hidden');
  },

  // ---------- slēpes ----------
  startSki(fromTop) {
    const me = this.me;
    me.ski = { v: 0, heading: me.heading, fromTop: !!fromTop, t0: this.now(), crashT: 0 };
    this.avatar.setSkis(true);
  },
  stopSki(silent) {
    if (!this.me.ski) return;
    this.me.ski = null;
    this.avatar.setSkis(false);
    this.avatar.root.rotation.z = 0; this.avatar.root.rotation.x = 0;
    this.avatar.skiPose = null;
    if (!silent) toast('🥾 Slēpes noņemtas');
  },

  updateSki(dt, mv, jump) {
    const me = this.me, sk = me.ski, W = this.terr;
    // stūrēšana: pa kreisi/pa labi; lēnāk stūrē lielā ātrumā
    const turnRate = 2.3 * (0.55 + 0.45 * Math.min(1, 6 / Math.max(1, sk.v)));
    sk.heading -= mv.x * turnRate * dt;
    const dx = Math.sin(sk.heading), dz = Math.cos(sk.heading);
    const e = 1.2, gx = (W.getHeight(me.pos.x + e, me.pos.z) - W.getHeight(me.pos.x - e, me.pos.z)) / (2 * e);
    const gz = (W.getHeight(me.pos.x, me.pos.z + e) - W.getHeight(me.pos.x, me.pos.z - e)) / (2 * e);
    const sd = gx * dx + gz * dz; // kāpums braukšanas virzienā
    let acc = -9.8 * sd / Math.sqrt(1 + sd * sd);
    acc -= 0.05 * 9.8 + 0.0028 * sk.v * sk.v; // slīdēšanas berze un gaiss
    if (mv.y > 0.3 && sk.v < 7) acc += 3.2 * mv.y; // atgrūšanās ar nūjām
    if (mv.y < -0.3) acc -= 8 * -mv.y; // arkls (bremzēšana)
    acc -= Math.abs(mv.x) * sk.v * 0.08; // pagriezienos mazliet bremzē
    if (sk.crashT > 0) { sk.crashT -= dt; acc = -sk.v * 3; }
    sk.v = clamp(sk.v + acc * dt, 0, 27);
    const ground0 = W.getHeight(me.pos.x, me.pos.z);
    me.pos.x += dx * sk.v * dt;
    me.pos.z += dz * sk.v * dt;
    if (W.collide(me.pos, 0.45) && sk.v > 7 && sk.crashT <= 0) {
      sk.crashT = 1.2; sfx('st_snow', { vol: 1, rate: 0.8 }); sfx('hit', { vol: 0.5, rate: 0.7 });
      toast('💥 Bums! Uzbrauci virsū šķērslim', 'bad', 1800);
      this.spawnFloat('💫', me.pos);
    }
    const ground = W.getHeight(me.pos.x, me.pos.z);
    me.vy -= 24 * dt;
    me.pos.y += me.vy * dt;
    if (me.pos.y <= ground) { me.pos.y = ground; me.vy = 0; me.onGround = true; }
    else if (me.onGround && me.vy <= 0 && me.pos.y - ground < 0.5 + sk.v * 0.03) { me.pos.y = ground; me.vy = 0; }
    else me.onGround = false;
    if (jump && me.onGround) { me.vy = 7.5; me.onGround = false; sfx('jump'); }
    void ground0;
    me.heading = sk.heading;
    me.state = 'ski';
    const av = this.avatar;
    av.root.position.copy(me.pos);
    av.root.rotation.order = 'YXZ';
    av.root.rotation.y = me.heading;
    // slēpes guļ uz nogāzes (slīpums uz priekšu un sāņus), līkumā slēpotājs sasveras uz iekšu
    const sl = skiSlope((x, z) => W.getHeight(x, z), me.pos.x, me.pos.z, me.heading);
    const omega = -mv.x * turnRate;
    const lean = clamp(-Math.atan(sk.v * omega / 9.8) * 0.55, -0.42, 0.42);
    const kk = 1 - Math.exp(-dt * (me.onGround ? 9 : 3));
    av.root.rotation.x = lerp(av.root.rotation.x, me.onGround ? -sl.pitch : -0.05, kk);
    av.root.rotation.z = lerp(av.root.rotation.z, (me.onGround ? sl.roll * 0.7 : 0) + lean, kk);
    av.skiPose = { down: av.root.rotation.x, v: sk.v, brake: Math.max(0, -mv.y), air: !me.onGround, push: mv.y > 0.3 && sk.v < 7 };
    av.shadow.position.y = ground - me.pos.y + 0.03;
    av.animate(dt, 'ski', sk.v);
    // nobrauciena beigas: no augšas līdz kalna pakājei
    if (sk.fromTop && me.pos.z > LIFT.zB - 15 && ground < GROUND_Y + 4) {
      sk.fromTop = false;
      const s = (this.now() - sk.t0) / 1000;
      sfx('win');
      toast(`🏁 Nobrauci no Ziemas kalna! Laiks: ${s.toFixed(1)} s`, 'good', 4000);
      this.stat('skiRuns');
      if (!this.save.bestSki || s < this.save.bestSki) { this.save.bestSki = +s.toFixed(1); if (this.save.stats.skiRuns > 1) toast(`🏆 Jauns rekords: ${s.toFixed(1)} s!`, 'good', 3500); }
    }
  },

  // ---------- pacēlājs ----------
  startLift() {
    const me = this.me;
    if (me.ski) { /* ar slēpēm var braukt */ }
    me.lift = { s: 0 };
    this.setLiftChair(this.avatar, true);
    sfx('beep');
    toast('🚡 Brauc augšā! Apskaties apkārtni…', '', 2500);
  },
  updateLift(dt) {
    const me = this.me, L = this.terr.lift;
    me.lift.s += LIFT.v * dt;
    if (me.lift.s >= L.len) {
      me.lift = null;
      this.setLiftChair(this.avatar, false);
      // izkāpj kalna galā, slēpes kājās
      me.pos.set(SKI_START.x, 0, SKI_START.z);
      me.pos.y = this.terr.getHeight(me.pos.x, me.pos.z);
      me.heading = SKI_START.heading;
      if (!me.ski) this.startSki(true); else me.ski.fromTop = true;
      me.ski.heading = me.heading; me.ski.t0 = this.now();
      this.cam.yaw = me.heading + Math.PI;
      toast('⛷️ Slēpes kājās! Velc kursorsviru, lai stūrētu, uz leju — bremzē.', 'good', 4500);
      return;
    }
    L.upPoint(me.lift.s, me.pos);
    me.pos.y -= 0.27;
    me.heading = Math.PI;
    me.state = 'lift';
    this.avatar.root.position.copy(me.pos);
    this.avatar.root.rotation.y = me.heading;
    this.avatar.shadow.position.y = this.terr.getHeight(me.pos.x, me.pos.z) - me.pos.y + 0.03;
    this.avatar.animate(dt, 'lift', 0);
  },
  // krēsls zem sēdošā (savs un draugu)
  setLiftChair(av, on) {
    if (on && !av.liftChair) {
      const c = new THREE.Mesh(chairGeometry(), chairMaterial());
      c.position.set(0, 0.25, -0.02); c.castShadow = true;
      // mājdzīvnieks sēž krēslā blakus
      const ps = new THREE.Group(); ps.position.set(0.4, 0.02, 0.04); ps.scale.setScalar(0.8); c.add(ps); c.petSpots = [ps];
      av.root.add(c); av.liftChair = c;
    } else if (!on && av.liftChair) { av.liftChair.removeFromParent(); av.liftChair = null; }
  },

  // ---------- sniega pikas ----------
  throwBall() {
    const t = this.now();
    if ((this.ballCd || 0) > t) return;
    this.ballCd = t + BALL_CD * 1000;
    const yaw = this.cam.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    this.me.heading = Math.atan2(fx, fz);
    this.me.throwT = 0.35;
    const o = [this.me.pos.x + fx * 0.5, this.me.pos.y + 1.7, this.me.pos.z + fz * 0.5];
    const lift = 4.5 + (0.38 - this.cam.pitch) * 6;
    const v = [fx * 18, clamp(lift, 1.5, 9), fz * 18];
    this.spawnBall(o, v, this.myId);
    this.net.toHost({ t: 'ball', o: o.map((n) => +n.toFixed(2)), v: v.map((n) => +n.toFixed(2)) });
    sfx('throw');
  },
  spawnBall(o, v, by) {
    ballMat = ballMat || new THREE.MeshStandardMaterial({ color: '#f6f9fc', roughness: 0.8 });
    const mesh = new THREE.Mesh(ballGeo, ballMat);
    mesh.position.set(o[0], o[1], o[2]);
    mesh.castShadow = true;
    this.stage.add(mesh);
    this.balls.push({ mesh, v: new THREE.Vector3(v[0], v[1], v[2]), by, life: 4 });
  },
  splat(p) {
    sfx('squish', { at: p, vol: 0.9, rate: 0.8 }); sfx('st_snow', { at: p, vol: 0.7 });
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(ballGeo, ballMat);
      m.scale.setScalar(0.35 + Math.random() * 0.3);
      m.position.copy(p);
      this.stage.add(m);
      this.balls.push({ mesh: m, v: new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5), by: null, life: 0.6, bit: true });
    }
  },
  // pikas pārvieto sīkos soļos, lai ātra pika „neizlēktu cauri” spēlētājam vai valnim
  updateBalls(dt) {
    if (!this.balls || !this.balls.length) return;
    const n = Math.min(8, Math.ceil(dt / 0.016));
    for (let k = 0; k < n; k++) this.stepBalls(dt / n);
  },
  stepBalls(dt) {
    const W = this.terr, me = this.me;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i], p = b.mesh.position;
      b.life -= dt;
      b.v.y -= 13 * dt;
      p.addScaledVector(b.v, dt);
      let hit = b.life <= 0;
      if (!hit && !b.bit) {
        if (p.y < W.getHeight(p.x, p.z) + 0.08) hit = true;
        for (const o of W.obstacles || []) if (!hit && p.x > o[0] && p.x < o[3] && p.y > o[1] && p.y < o[4] && p.z > o[2] && p.z < o[5]) hit = true;
        // trāpījums man (citu mestas pikas) — par to ziņo es pats
        if (!hit && b.by !== this.myId && Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 0.55 && p.y > me.pos.y + 0.2 && p.y < me.pos.y + 2.1) {
          hit = true;
          this.net.toHost({ t: 'ballHit', by: b.by });
          this.snowStats.hitBy++;
          const who = this.remotes.get(b.by);
          toast(`❄️ Tev trāpīja ${who ? who.prof.name : 'draugs'}!`, 'bad', 2000);
          const f = $('snow-flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
        }
        // mani trāpījumi mērķiem un (vizuāli) draugiem
        if (!hit && b.by === this.myId) {
          for (const tg of W.targets || []) {
            if (Math.hypot(p.x - tg.x, p.z - tg.z) < 0.85 && p.y < tg.y + 2.4) {
              hit = true; tg.wob = 0.8;
              this.snowStats.hits++;
              this.stat('snowHits');
              this.addCoins(1, true);
              this.spawnFloat('🎯', new THREE.Vector3(tg.x, tg.y + 2, tg.z));
            }
          }
          for (const r of this.remotes.values()) {
            if (!hit && (r.zone || 'c') === this.zone && Math.hypot(p.x - r.pos.x, p.z - r.pos.z) < 0.55 && p.y > r.pos.y + 0.2 && p.y < r.pos.y + 2.1) hit = true;
          }
        }
        if (hit && b.life > 0) this.splat(p);
      }
      if (hit) { b.mesh.removeFromParent(); this.balls.splice(i, 1); }
    }
  },

  // ---------- kadrs ----------
  updateWinter(dt) {
    this.updateBalls(dt);
    if (this.me.throwT > 0) this.me.throwT -= dt;
    const inA = inArena(this.me.pos.x, this.me.pos.z);
    const hud = $('snow-hud');
    if (inA) {
      const s = this.snowStats;
      const txt = `❄️ Trāpījumi: ${s.hits} · Tev trāpīja: ${s.hitBy}`;
      if (hud.textContent !== txt) hud.textContent = txt;
      hud.classList.remove('hidden');
    } else hud.classList.add('hidden');
    // cepure/šalle var būt noņemta pēc slēpēm u.c.
    if (!this.avatar.winter) this.avatar.setWinter(true);
  },

  // dzeltenās pogas darbības ziemas zemē
  winterActions() {
    const me = this.me, W = this.terr, p = me.pos, t = this.now();
    if (me.lift) return { label: '🚡 Brauc augšā…', fn: () => {} };
    const d2 = (x, z) => Math.hypot(x - p.x, z - p.z);
    if (inArena(p.x, p.z) && !me.ski) return { label: '❄️ Mest piku', fn: () => this.throwBall() };
    if (d2(LIFT.x, LIFT.zB) < 7) return { label: '🚡 Braukt ar pacēlāju', fn: () => this.startLift() };
    if (me.ski) {
      if (me.ski.v < 2.5) return { label: '🥾 Noņemt slēpes', fn: () => this.stopSki() };
      return null;
    }
    if (d2(RACK.x, RACK.z) < 4) return { label: '⛷️ Uzlikt slēpes', fn: () => { this.startSki(false); toast('⛷️ Slēpes kājās! Ar pacēlāju uz kalna un lejā!', 'good'); } };
    for (const d of W.deer || []) {
      if (!d.model.root.visible || d2(d.x, d.z) > 3) continue;
      if ((this.npcCooldown['b' + d.id] || 0) > t) continue;
      return { label: '🤗 Paglaudīt: Ziemeļbriedis', fn: () => {
        this.npcCooldown['b' + d.id] = t + 15000;
        me.petT = 1.2; me.heading = Math.atan2(d.x - p.x, d.z - p.z);
        this.spawnFloat('❤️', new THREE.Vector3(d.x, W.getHeight(d.x, d.z), d.z));
        sfx('pet'); this.stat('petted'); this.stat('reindeer');
        toast('🦌 Ziemeļbriedis priecīgi nopūšas tvaika mākonīti!');
      } };
    }
    return null;
  },

  // draugi ziemas zemē: drēbes, slēpes, krēsls
  winterRemote(r, here) {
    const w = here && this.zone === 'n';
    if (!!r.avatar.winter !== w) r.avatar.setWinter(w);
    const ski = w && r.anim === 'ski';
    r.avatar.setSkis(ski);
    this.setLiftChair(r.avatar, w && r.anim === 'lift');
    // draugu slēpotāji arī seko nogāzei un sasveras līkumos
    const R = r.avatar.root;
    if (ski) {
      const now = performance.now(), dt = Math.min(0.1, (now - (r.skiT || now)) / 1000) || 0.016;
      const sp = r.skiP ? Math.hypot(r.pos.x - r.skiP.x, r.pos.z - r.skiP.z) / dt : 0;
      let dy = r.ry - (r.skiRy == null ? r.ry : r.skiRy); dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.skiT = now; r.skiRy = r.ry; r.skiP = (r.skiP || new THREE.Vector3()).copy(r.pos);
      const sl = skiSlope((x, z) => this.terr.getHeight(x, z), r.pos.x, r.pos.z, r.ry);
      const lean = clamp(-Math.atan(sp * (dy / dt) / 9.8) * 0.55, -0.42, 0.42);
      const k = 1 - Math.exp(-dt * 8);
      R.rotation.order = 'YXZ';
      R.rotation.x = lerp(R.rotation.x, -sl.pitch, k);
      R.rotation.z = lerp(R.rotation.z, sl.roll * 0.85 + lean, k);
      r.avatar.skiPose = { down: R.rotation.x, v: sp, brake: 0, air: false, push: false };
    } else if (R.rotation.x || R.rotation.z) { R.rotation.x = 0; R.rotation.z = 0; r.avatar.skiPose = null; }
  },

  // saimnieks pārsūta pikas visiem
  hostWinter(from, m) {
    const net = this.net;
    if (m.t === 'ball' && Array.isArray(m.o) && Array.isArray(m.v)) net.broadcast({ t: 'ball', by: from, o: m.o.slice(0, 3).map(Number), v: m.v.slice(0, 3).map(Number) });
    else if (m.t === 'ballHit') net.broadcast({ t: 'ballHit', by: m.by, target: from });
  },
  onWinterMessage(m) {
    if (m.t === 'ball') { if (m.by !== this.myId && this.zone === 'n' && this.balls) this.spawnBall(m.o, m.v, m.by); }
    else if (m.t === 'ballHit') {
      if (m.by === this.myId && m.target !== this.myId) {
        this.snowStats = this.snowStats || { hits: 0, hitBy: 0 };
        this.snowStats.hits++;
        this.stat('snowHits');
        const r = this.remotes.get(m.target);
        sfx('coin');
        toast(`🎯 Trāpīji: ${r ? r.prof.name : 'draugam'}!`, 'good', 1800);
      }
    }
  },
};

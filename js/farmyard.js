// Sētas būves: dārza mājiņa (var ieiet), siltumnīca, vārtu arkas, ceļa rādītāji.
// Visu būvē „vietējās” koordinātēs (durvis uz +x), sēta to novieto un pagriež.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeSignBoard, signWood } from './util.js?v=1.48.0';
import * as A from './assets.js?v=1.48.0';

// daudzas kastes ar krāsām → viena ģeometrija (virsotņu krāsas)
// b: [w, h, d, x, y, z, krāsa, rx?, ry?, rz?]
const col = new THREE.Color();
function boxes(list, extra = []) {
  const geos = list.map(([w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0]) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.deleteAttribute('uv');
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z));
    return paint(g, c);
  });
  return mergeGeometries([...geos, ...extra]);
}
function paint(g, c) {
  if (g.attributes.uv) g.deleteAttribute('uv');
  col.set(c);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// trīsstūris (frontons) plaknē x = const, abās pusēs
function gable(x, y0, halfW, rise, c) {
  const p = [x, y0, -halfW, x, y0, halfW, x, y0 + rise, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...p, p[0], p[1], p[2], p[6], p[7], p[8], p[3], p[4], p[5]], 3));
  g.computeVertexNormals();
  return paint(g, c);
}
const vcMat = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...opts });
// sienas kā apļu virkne sadursmēm: [[x0, z0, x1, z1], ...] vietējās koordinātēs
function wallColliders(segs, r = 0.22, step = 0.35) {
  const out = [];
  for (const [x0, z0, x1, z1] of segs) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i <= n; i++) out.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, r]);
  }
  return out;
}

// ---------- dārza mājiņa: sarkana koka mājiņa ar baltām apmalēm (6 × 5 m), durvis +x pusē ----------
export const HOUSE = { ...A.HOUSE, inner: [A.HOUSE.hx - 0.2, A.HOUSE.hz - 0.2] }; // 1.37.0: izmēri no jaunā modeļa
export const buildGardenHouse = A.buildGardenHouse; // 1.37.0: jaunais modelis (assets.js)

// ---------- siltumnīca: balts metāla karkass ar stiklu (6 × 11 m), durvis +x pusē, iekšā tomātu dobes ----------
export const GREEN = A.GREEN;
let glassM = null;
export const buildGreenhouse = A.buildGreenhouse; // 1.37.0: jaunais modelis (assets.js)

// ---------- vārtu arka: divi stabi un šķērssija ar ķēdītēm (dēli ar vārdu pakar farm.js) ----------
export const GATE_W = A.GATE_W, GATE_BEAM = A.GATE_BEAM, GATE_BOARD = A.GATE_BOARD;
export const buildGateArch = A.buildGateArch; // 1.37.0: jaunais modelis (assets.js)

export const buildFingerpost = A.buildFingerpost; // 1.37.0: jaunais modelis (assets.js)

export const buildRoadSign = A.buildRoadSign; // 1.37.0: jaunais modelis (assets.js)

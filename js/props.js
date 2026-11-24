// Mazie modeļi jaunajām nodarbēm: ogu krūmi, dārza rotājumi, makšķere, pludiņš
import * as THREE from 'three';
import { mat, canvasTexture, noiseTexture } from './util.js?v=1.49.0';
import { optimizeRig, buildHat } from './characters.js?v=1.49.0';
import { BERRIES, TREES } from './data.js?v=1.49.0';
import * as A from './assets.js?v=1.49.0';

const TAU = Math.PI * 2;
function put(parent, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o;
}
const cyl = (r0, r1, h, s = 8) => new THREE.CylinderGeometry(r1, r0, h, s);
const sph = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const lathe = (prof, seg = 20) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
let woodTex = null;
function woodM(color) {
  if (!woodTex) { woodTex = noiseTexture('fur', 64); woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(1, 3); }
  return new THREE.MeshStandardMaterial({ color, map: woodTex, roughness: 0.95 });
}
function finish(g) {
  optimizeRig(g);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- ogu krūmi (veidne katram veidam, klonē ar kopīgu ģeometriju) ----------
const bushTpl = {};
export const buildBerryBush = A.buildBerryBush; // 1.37.0: jaunais modelis (assets.js)
export function berryTemplate(kind) { if (!bushTpl[kind]) bushTpl[kind] = A.buildBerryBush(kind).root; return bushTpl[kind]; }

// ---------- dārza rotājumi ----------
let flagTex = null;
export const buildDecor = A.buildDecor; // 1.37.0: jaunais modelis (assets.js)

export const buildFruitTree = A.buildFruitTree; // 1.37.0: jaunais modelis (assets.js)

// vietas pie dārza (dx, dz no dārza centra; ry pagrieziens)
export const DECOR_SPOTS = {
  karogs: [-4.6, -3.2, 0], burits: [-4.6, -1.1, Math.PI / 2], biedeklis: [-4.6, 1.1, Math.PI / 2], struklaka: [-4.7, 3.4, 0],
  rukis: [4.2, -3.4, Math.PI / 2], pukupods: [4.2, 3.4, 0], solins: [-1.3, 6.3, Math.PI], laterna: [1.6, 6.3, 0],
};

export const buildRod = A.buildRod; // 1.37.0: jaunais modelis (assets.js)

export const buildBobber = A.buildBobber; // 1.37.0: jaunais modelis (assets.js)

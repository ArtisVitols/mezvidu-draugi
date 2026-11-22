// 🛒 Mežvidu tirgus: koka tirgus būdas ar svītrainu jumtu, koka izkārtni, letes precēm, mucām un kastēm,
// karodziņu virtenes starp būdām. Viss statisks — spēle to apvieno ar flattenStatic.
// Būdas lokālās koordinātes: +z — pret pircējiem (laukuma vidu), pārdevējs stāv aiz letes (z ≈ −0,85).
import * as THREE from 'three';
import { mat, canvasTexture, makeSignBoard } from './util.js?v=1.44.0';
import { buildCart, buildNPC } from './characters.js?v=1.44.0';
import { buildDecor } from './props.js?v=1.44.0';
import * as A from './assets.js?v=1.44.0';

let plankT = null;
function plankTex() {
  return plankT || (plankT = canvasTexture(128, 128, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      const l = 0.78 + Math.random() * 0.3;
      g.fillStyle = `rgb(${150 * l | 0},${108 * l | 0},${70 * l | 0})`; g.fillRect(0, i * h / 8, w, h / 8 - 2);
      g.fillStyle = 'rgba(40,25,12,0.85)'; g.fillRect(0, i * h / 8 + h / 8 - 2, w, 2);
      for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(60,38,20,${0.1 + Math.random() * 0.2})`; g.fillRect(Math.random() * w, i * h / 8 + 2 + Math.random() * (h / 8 - 5), 10 + Math.random() * 30, 1); }
    }
  }));
}
const stripeCache = new Map();
function stripes(color) {
  if (stripeCache.has(color)) return stripeCache.get(color);
  const t = canvasTexture(256, 32, (c, w, h) => {
    for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? '#f7f2e6' : color; c.fillRect(i * w / 10, 0, w / 10, h); }
    for (let k = 0; k < 800; k++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; c.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  });
  stripeCache.set(color, t);
  return t;
}

export const buildStall = A.buildStall; // 1.37.0: jaunais modelis (assets.js)

// karodziņu virtene no a līdz b (lokālās/pasaules koordinātēs, y — piekares augstums), nokarāta pa vidu
let flagGeo = null;
// 1.38.0: karodziņi — atpakaļ iepriekšējais izskats
export function buildBunting(a, b, sag = 0.7) {
  const g = new THREE.Group();
  const cols = ['#d42a2a', '#f2c12e', '#2fa84f', '#2a6ad4', '#f7f2e6', '#c04ad2'];
  const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(4, Math.floor(len / 0.7));
  flagGeo = flagGeo || new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.17, 0, 0), new THREE.Vector3(0.17, 0, 0), new THREE.Vector3(0, -0.36, 0)]);
  if (!flagGeo.attributes.normal) { flagGeo.computeVertexNormals(); flagGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2)); }
  const ry = Math.atan2(-(b.z - a.z), b.x - a.x);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, y = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t);
    pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t));
    if (i > 0 && i < n) {
      const f = new THREE.Mesh(flagGeo, mat(cols[i % cols.length], { roughness: 0.9, side: THREE.DoubleSide }));
      f.position.copy(pts[i]); f.rotation.y = ry; g.add(f);
    }
  }
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.012, 4), mat('#3a3328', { roughness: 1 }));
  g.add(rope);
  return g;
}

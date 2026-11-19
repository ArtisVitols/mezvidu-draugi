// 🛒 Mežvidu tirgus: koka tirgus būdas ar svītrainu jumtu, koka izkārtni, letes precēm, mucām un kastēm,
// karodziņu virtenes starp būdām. Viss statisks — spēle to apvieno ar flattenStatic.
// Būdas lokālās koordinātes: +z — pret pircējiem (laukuma vidu), pārdevējs stāv aiz letes (z ≈ −0,85).
import * as THREE from 'three';
import { mat, canvasTexture, makeSignBoard } from './util.js?v=1.33.0';
import { buildCart, buildNPC } from './characters.js?v=1.33.0';
import { buildDecor } from './props.js?v=1.33.0';

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

// viena būda: v — VENDORS ieraksts (title, cart krāsa, id)
export function buildStall(v) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#ffffff', map: plankTex(), roughness: 0.9 });
  const dark = mat('#5a3e26', { roughness: 0.9 }), beam = mat('#7a5634', { roughness: 0.85 });
  const B = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  const W = 3.6, HW = W / 2;
  // grīda (dēļu paliktnis)
  B(W + 0.4, 0.12, 2.6, dark, 0, 0.06, -0.45);
  // lete: priekšējā siena no dēļiem, virsma, apakšā plaukts
  B(W, 0.72, 0.08, wood, 0, 0.48, 0.55);
  for (const s of [-1, 1]) B(0.08, 0.72, 0.75, wood, s * (HW - 0.04), 0.48, 0.2);
  B(W + 0.16, 0.07, 0.95, beam, 0, 0.87, 0.25);
  B(W - 0.2, 0.05, 0.6, dark, 0, 0.4, 0.2);
  // stabi
  for (const s of [-1, 1]) { B(0.14, 2.75, 0.14, beam, s * (HW - 0.05), 1.38, 0.62); B(0.14, 3.1, 0.14, beam, s * (HW - 0.05), 1.55, -1.55); }
  // pakāpiens pārdevējam (lai labi redzams aiz letes)
  B(1.2, 0.36, 0.8, dark, 0, 0.18, -0.85);
  // aizmugures siena ar plauktu precēm
  B(W, 2.3, 0.07, wood, 0, 1.25, -1.6);
  B(W - 0.3, 0.05, 0.35, beam, 0, 1.75, -1.4);
  // jumts: slīps svītrains audums no aizmugures (3,15 m) uz priekšu (2,75 m) un vīlīte ar zobiņiem
  const awnM = new THREE.MeshStandardMaterial({ map: stripes(v.cart), roughness: 0.95, side: THREE.DoubleSide });
  const D = 2.75, rise = 0.4, len = Math.hypot(D, rise);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.5, len).rotateX(-Math.PI / 2), awnM);
  roof.rotation.x = Math.atan2(rise, D); roof.position.set(0, 2.98, -0.45 + 0.05); g.add(roof);
  const valM = mat(v.cart, { roughness: 0.95 }), valW = mat('#f7f2e6', { roughness: 0.95 });
  for (let i = 0; i < 14; i++) {
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.24, 3), i % 2 ? valW : valM);
    fl.rotation.x = Math.PI; fl.scale.set(1, 1, 0.12); fl.position.set(-HW - 0.12 + (i + 0.5) * (W + 0.25) / 14, 2.67, 0.95); g.add(fl);
  }
  B(W + 0.5, 0.06, 0.04, valM, 0, 2.8, 0.95);
  // izkārtne virs letes (koka dēlis ar iededzinātu nosaukumu)
  const sign = makeSignBoard(v.title, { h: 0.44, minW: 2.4 });
  sign.obj.position.set(0, 3.25, 0.98); g.add(sign.obj);
  for (const s of [-1, 1]) B(0.05, 0.4, 0.05, dark, s * (sign.w / 2 - 0.2), 2.95, 0.96);
  // preces uz letes (tās pašas, kas ratiņos, letes augstumā)
  const kind = v.id === 'hats' ? 'hats' : v.id === 'seeds' ? 'seeds' : v.id === 'buyer' ? 'veg' : 'none';
  const goods = buildCart(v.cart, false, kind, true);
  goods.position.set(0, 0.91 - 1.49, 0.25); g.add(goods);
  if (v.id === 'pets') {
    [['ezis', -0.95, 0.9], ['zakis', 0.05, 0.55], ['vavere', 0.95, 1.0]].forEach(([k, x, s]) => {
      const n = buildNPC(k); n.root.scale.multiplyScalar(s * 0.8); n.root.position.set(x, 0.91, 0.3); n.root.rotation.y = 0; g.add(n.root);
    });
  } else if (v.id === 'decor') {
    [['rukis', -1.05, 0.75], ['pukupods', 0, 0.7], ['laterna', 1.05, 0.42]].forEach(([k, x, s]) => {
      const d = buildDecor(k); d.scale.setScalar(s); d.position.set(x, 0.91, 0.3); g.add(d);
    });
  }
  // plaukts aizmugurē: burkas / podiņi
  const jarC = ['#d8362a', '#f2c12e', '#6aa83a', '#7a3a8a', '#e8741e', '#2a6ad4'];
  for (let i = 0; i < 6; i++) {
    const j = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 10), mat(jarC[(i + v.id.length) % 6], { roughness: 0.4 }));
    j.position.set(-1.25 + i * 0.5, 1.89, -1.4); g.add(j);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.05, 10), mat('#f2ead8', { roughness: 0.6 }));
    lid.position.set(-1.25 + i * 0.5, 2.02, -1.4); g.add(lid);
  }
  // muca un kastes sānos
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.8, 14), mat('#8a5a32', { roughness: 0.85 }));
  barrel.position.set(HW + 0.45, 0.4, 0.3); g.add(barrel);
  for (const y of [0.15, 0.65]) { const hp = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.05, 14), mat('#3a3a3c', { metalness: 0.6, roughness: 0.5 })); hp.position.set(HW + 0.45, y, 0.3); g.add(hp); }
  const crate = new THREE.MeshStandardMaterial({ color: '#d8c4a0', map: plankTex(), roughness: 0.9 });
  B(0.6, 0.45, 0.5, crate, -HW - 0.45, 0.23, 0.15).rotation.y = 0.2;
  B(0.5, 0.35, 0.45, crate, -HW - 0.4, 0.63, 0.1).rotation.y = -0.15;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// karodziņu virtene no a līdz b (lokālās/pasaules koordinātēs, y — piekares augstums), nokarāta pa vidu
let flagGeo = null;
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

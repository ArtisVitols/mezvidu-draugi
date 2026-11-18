// Mazie modeļi jaunajām nodarbēm: ogu krūmi, dārza rotājumi, makšķere, pludiņš
import * as THREE from 'three';
import { mat, canvasTexture, noiseTexture } from './util.js?v=1.24.0';
import { optimizeRig, buildHat } from './characters.js?v=1.24.0';
import { BERRIES, TREES } from './data.js?v=1.24.0';

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
export function buildBerryBush(kind) {
  if (!bushTpl[kind]) {
    const g = new THREE.Group();
    const berries = new THREE.Group(); berries.name = 'berries';
    const bm = mat(BERRIES[kind].color, { roughness: 0.25 });
    let seed = 7;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    if (kind === 'mellene') {
      const lm = mat('#3d6a2a', { roughness: 0.9 });
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU, d = i ? 0.22 : 0;
        put(g, sph(0.2, 7, 5), lm, Math.cos(a) * d, 0.18 + r() * 0.08, Math.sin(a) * d).scale.set(1.1, 0.75, 1.1);
      }
      for (let i = 0; i < 22; i++) {
        const a = r() * TAU, d = 0.1 + r() * 0.28;
        put(berries, sph(0.038, 5, 4), bm, Math.cos(a) * d, 0.18 + r() * 0.22, Math.sin(a) * d);
      }
    } else if (kind === 'avene') {
      const cm = mat('#7a5a3a', { roughness: 0.9 }), lm = mat('#4f8a34', { roughness: 0.85, side: THREE.DoubleSide });
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU, tilt = 0.25 + r() * 0.25, h = 0.9 + r() * 0.4;
        const c = put(g, cyl(0.025, 0.012, h, 5), cm, Math.cos(a) * 0.1, h / 2, Math.sin(a) * 0.1, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
        void c;
      }
      for (let i = 0; i < 16; i++) {
        const a = r() * TAU, d = 0.15 + r() * 0.3, y = 0.35 + r() * 0.75;
        put(g, sph(0.13, 6, 4), lm, Math.cos(a) * d, y, Math.sin(a) * d).scale.set(1.2, 0.45, 0.9);
      }
      for (let i = 0; i < 18; i++) {
        const a = r() * TAU, d = 0.2 + r() * 0.28, y = 0.35 + r() * 0.7;
        put(berries, sph(0.045, 5, 4), bm, Math.cos(a) * d, y, Math.sin(a) * d).scale.y = 1.25;
      }
    } else { // dzērvenes — zems paklājiņš ar sarkanām ogām
      const lm = mat('#4a5a2a', { roughness: 0.95 });
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU, d = i ? 0.3 : 0;
        put(g, sph(0.32, 8, 5), lm, Math.cos(a) * d, 0.02, Math.sin(a) * d).scale.set(1, 0.18, 1);
      }
      for (let i = 0; i < 16; i++) {
        const a = r() * TAU, d = r() * 0.5;
        put(berries, sph(0.042, 5, 4), bm, Math.cos(a) * d, 0.08, Math.sin(a) * d);
      }
    }
    finish(g);
    optimizeRig(berries);
    berries.children.forEach((c) => { c.castShadow = false; });
    g.add(berries);
    bushTpl[kind] = g;
  }
  const c = bushTpl[kind].clone();
  return { root: c, berries: c.getObjectByName('berries') };
}
export function berryTemplate(kind) { if (!bushTpl[kind]) buildBerryBush(kind); return bushTpl[kind]; }

// ---------- dārza rotājumi ----------
let flagTex = null;
export function buildDecor(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'pukupods': {
      const pot = mat('#b8643a', { roughness: 0.8 });
      put(g, lathe([[0, 0], [0.2, 0], [0.24, 0.05], [0.3, 0.42], [0.34, 0.45], [0.34, 0.5], [0.29, 0.5], [0.27, 0.45], [0, 0.44]], 18), pot);
      const lm = mat('#3f7a2a', { roughness: 0.8, side: THREE.DoubleSide });
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; put(g, sph(0.1, 8, 6), lm, Math.cos(a) * 0.15, 0.55, Math.sin(a) * 0.15).scale.set(1.3, 0.5, 0.8); }
      const cols = ['#e83a5a', '#f2d23a', '#ffffff', '#c05ae0', '#ff7a2a'];
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU, d = i ? 0.14 : 0;
        put(g, cyl(0.01, 0.01, 0.25, 4), lm, Math.cos(a) * d, 0.6, Math.sin(a) * d);
        put(g, sph(0.07, 8, 6), mat(cols[i % 5], { roughness: 0.6 }), Math.cos(a) * d, 0.74, Math.sin(a) * d).scale.y = 0.6;
      }
      break;
    }
    case 'rukis': {
      put(g, lathe([[0, 0], [0.22, 0], [0.24, 0.05], [0.2, 0.35], [0.14, 0.5], [0, 0.52]]), mat('#2f5ac0', { roughness: 0.7 }));
      put(g, cyl(0.25, 0.25, 0.06, 14), mat('#5a3a22'), 0, 0.03, 0);
      put(g, sph(0.13, 14, 10), mat('#f2c8a0', { roughness: 0.7 }), 0, 0.6, 0);
      put(g, sph(0.035, 8, 6), mat('#e8907a'), 0, 0.6, 0.13);
      const beard = put(g, new THREE.ConeGeometry(0.12, 0.3, 12), mat('#f4f4f0', { roughness: 0.9 }), 0, 0.46, 0.07);
      beard.rotation.x = Math.PI + 0.25;
      put(g, new THREE.ConeGeometry(0.15, 0.42, 14), mat('#d02a2a', { roughness: 0.6 }), 0, 0.86, -0.02, -0.12, 0, 0);
      for (const s of [-1, 1]) put(g, sph(0.022, 6, 5), mat('#111'), s * 0.045, 0.64, 0.115);
      break;
    }
    case 'burits': {
      const wm = woodM('#8a6a48');
      put(g, cyl(0.05, 0.05, 1.8, 7), wm, 0, 0.9, 0);
      put(g, new THREE.BoxGeometry(0.36, 0.4, 0.34), woodM('#c8a070'), 0, 1.98, 0);
      for (const s of [-1, 1]) put(g, new THREE.BoxGeometry(0.44, 0.03, 0.3), mat('#7a3a2a', { roughness: 0.8 }), s * 0.1, 2.26, 0, 0, Math.PI / 2, s * 0.7);
      put(g, new THREE.CircleGeometry(0.06, 12), mat('#1a120a'), 0, 2.02, 0.172);
      put(g, cyl(0.012, 0.012, 0.1, 5), wm, 0, 1.93, 0.21, Math.PI / 2, 0, 0);
      break;
    }
    case 'solins': {
      const wm = woodM('#9a7048');
      for (let i = 0; i < 3; i++) put(g, new THREE.BoxGeometry(1.5, 0.05, 0.12), wm, 0, 0.45, -0.15 + i * 0.14);
      for (let i = 0; i < 2; i++) put(g, new THREE.BoxGeometry(1.5, 0.12, 0.04), wm, 0, 0.65 + i * 0.18, -0.25, -0.15, 0, 0);
      const iron = mat('#2a2a2a', { metalness: 0.6, roughness: 0.5 });
      for (const s of [-0.65, 0.65]) {
        put(g, new THREE.BoxGeometry(0.05, 0.45, 0.4), iron, s, 0.22, -0.02);
        put(g, new THREE.BoxGeometry(0.05, 0.45, 0.05), iron, s, 0.68, -0.27, -0.15, 0, 0);
      }
      break;
    }
    case 'laterna': {
      const iron = mat('#2a2a2c', { metalness: 0.7, roughness: 0.45 });
      put(g, cyl(0.05, 0.04, 1.6, 8), iron, 0, 0.8, 0);
      put(g, cyl(0.14, 0.14, 0.04, 8), iron, 0, 0.02, 0);
      put(g, new THREE.BoxGeometry(0.24, 0.3, 0.24), new THREE.MeshStandardMaterial({ color: '#fff2b0', emissive: '#ffb84a', emissiveIntensity: 1.2, roughness: 0.3 }), 0, 1.78, 0);
      put(g, new THREE.ConeGeometry(0.22, 0.16, 4), iron, 0, 2.01, 0, 0, Math.PI / 4, 0);
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) put(g, new THREE.BoxGeometry(0.025, 0.32, 0.025), iron, x * 0.12, 1.78, z * 0.12);
      break;
    }
    case 'biedeklis': {
      const wm = woodM('#7a5a3a');
      put(g, cyl(0.04, 0.04, 2.0, 6), wm, 0, 1.0, 0);
      put(g, cyl(0.03, 0.03, 1.5, 6), wm, 0, 1.45, 0, 0, 0, Math.PI / 2);
      put(g, new THREE.BoxGeometry(0.55, 0.6, 0.3), mat('#c03a2a', { roughness: 0.95, map: noiseTexture('cloth', 64) }), 0, 1.3, 0);
      put(g, new THREE.BoxGeometry(1.3, 0.16, 0.18), mat('#c03a2a', { roughness: 0.95 }), 0, 1.47, 0);
      const straw = mat('#e2c46a', { roughness: 1 });
      for (const s of [-1, 1]) put(g, new THREE.ConeGeometry(0.07, 0.2, 6), straw, s * 0.72, 1.44, 0, 0, 0, s * Math.PI / 2);
      put(g, sph(0.2, 12, 10), mat('#e8c890', { roughness: 0.9, map: noiseTexture('cloth', 64) }), 0, 1.82, 0);
      for (const s of [-1, 1]) put(g, sph(0.025, 6, 5), mat('#222'), s * 0.07, 1.86, 0.18);
      const hat = buildHat('salmu'); hat.scale.setScalar(0.85); hat.position.y = 1.93; g.add(hat);
      break;
    }
    case 'karogs': {
      put(g, cyl(0.045, 0.035, 3.6, 8), mat('#e8e8e8', { roughness: 0.4, metalness: 0.4 }), 0, 1.8, 0);
      put(g, sph(0.07, 8, 6), mat('#d8b040', { metalness: 1, roughness: 0.3 }), 0, 3.64, 0);
      if (!flagTex) flagTex = canvasTexture(100, 50, (c, w, h) => { c.fillStyle = '#9e3039'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.fillRect(0, h * 0.4, w, h * 0.2); });
      const fg = new THREE.PlaneGeometry(1.2, 0.6, 12, 1);
      const p = fg.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 0.6; p.setZ(i, Math.sin(x * 4) * 0.06 * x); }
      fg.computeVertexNormals();
      put(g, fg, new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.8, side: THREE.DoubleSide }), 0.62, 3.25, 0);
      break;
    }
    case 'struklaka': {
      const st = new THREE.MeshStandardMaterial({ color: '#b8b4aa', map: noiseTexture('stone', 128), roughness: 0.9 });
      put(g, lathe([[0, 0], [0.85, 0], [0.9, 0.05], [0.9, 0.45], [0.8, 0.45], [0.78, 0.15], [0, 0.15]], 28), st);
      put(g, new THREE.CircleGeometry(0.79, 24), mat('#4a8ab0', { roughness: 0.05, metalness: 0.3 }), 0, 0.38, 0, -Math.PI / 2, 0, 0);
      put(g, cyl(0.12, 0.09, 0.9, 12), st, 0, 0.7, 0);
      put(g, lathe([[0, 0], [0.32, 0.02], [0.35, 0.12], [0.3, 0.12], [0, 0.06]], 20), st, 0, 1.1, 0);
      const wm = new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.45, roughness: 0.05, depthWrite: false });
      put(g, cyl(0.3, 0.02, 0.4, 14), wm, 0, 1.42, 0);
      put(g, cyl(0.75, 0.32, 0.8, 18), new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }), 0, 0.78, 0);
      break;
    }
    case 'sene': {
      put(g, lathe([[0, 0], [0.22, 0], [0.2, 0.2], [0.17, 0.55], [0.15, 0.7], [0, 0.7]], 18), mat('#f2ead6', { roughness: 0.8 }));
      put(g, lathe([[0, 0.62], [0.62, 0.6], [0.66, 0.66], [0.58, 0.82], [0.36, 0.98], [0, 1.04]], 28), mat('#d8302a', { roughness: 0.45 }));
      const wm = mat('#fbf6ea', { roughness: 0.7 });
      for (let i = 0; i < 12; i++) { const a = i * 2.4, r = 0.12 + (i % 4) * 0.12; const y = 1.04 - Math.pow(r / 0.62, 2) * 0.42; put(g, sph(0.05, 8, 6), wm, Math.cos(a) * r, y, Math.sin(a) * r).scale.y = 0.45; }
      put(g, new THREE.BoxGeometry(0.16, 0.24, 0.02), mat('#6a3e1e'), 0, 0.2, 0.2);
      put(g, sph(0.012, 6, 5), mat('#d8b040', { metalness: 0.8 }), 0.05, 0.2, 0.215);
      put(g, new THREE.BoxGeometry(0.1, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: '#fff0b0', emissive: '#ffb84a', emissiveIntensity: 0.6 }), 0, 0.45, 0.17);
      break;
    }
    case 'vejdzirnavas': {
      const wall = mat('#ece4d2', { roughness: 0.9 });
      put(g, lathe([[0, 0], [0.42, 0], [0.36, 1.1], [0.3, 1.25], [0, 1.25]], 8), wall);
      put(g, new THREE.ConeGeometry(0.42, 0.45, 8), mat('#8a3a2a', { roughness: 0.8 }), 0, 1.45, 0);
      put(g, new THREE.BoxGeometry(0.2, 0.36, 0.04), woodM('#6a4a2a'), 0, 0.18, 0.37);
      const hub = new THREE.Group(); hub.position.set(0, 1.2, 0.36); g.add(hub);
      put(hub, cyl(0.05, 0.05, 0.12, 8), mat('#4a3a2a'), 0, 0, 0, Math.PI / 2, 0, 0);
      const sail = woodM('#e8e0cc');
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2 + 0.3; hub.add(arm);
        put(arm, new THREE.BoxGeometry(0.03, 0.85, 0.02), mat('#5a4a3a'), 0, 0.45, 0.05);
        put(arm, new THREE.BoxGeometry(0.18, 0.6, 0.012), sail, 0.1, 0.55, 0.06);
      }
      g.userData.spin = hub;
      break;
    }
    case 'ziedudobe': {
      put(g, cyl(0.85, 0.9, 0.18, 22), mat('#9a948a', { roughness: 1, map: noiseTexture('stone', 64) }), 0, 0.09, 0);
      put(g, cyl(0.78, 0.78, 0.04, 22), mat('#5a4030', { roughness: 1 }), 0, 0.18, 0);
      const lm = mat('#3f7a2a', { roughness: 0.8, side: THREE.DoubleSide });
      const cols = ['#e83a5a', '#f2d23a', '#ffffff', '#c05ae0', '#ff7a2a', '#e8302a'];
      for (let i = 0; i < 26; i++) {
        const a = i * 2.4, r = 0.1 + (i % 5) * 0.14, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.25 + (i % 3) * 0.08;
        put(g, cyl(0.008, 0.008, h, 4), lm, x, 0.2 + h / 2, z);
        put(g, sph(0.06, 8, 6), mat(cols[i % cols.length], { roughness: 0.6 }), x, 0.2 + h, z).scale.y = 0.6;
      }
      break;
    }
  }
  return finish(g);
}

// ---------- augļu koki dārzā (stadija 0 — stāds, 1 — jauns koks, 2 — pieaudzis; fruit — ar augļiem) ----------
export function buildFruitTree(kind, stage, fruit) {
  const T = TREES[kind] || TREES.abele;
  const g = new THREE.Group();
  const bark = woodM('#6a4e36');
  const lm = mat(T.leaf, { roughness: 0.85 });
  if (stage === 0) {
    put(g, cyl(0.025, 0.018, 0.8, 6), bark, 0, 0.4, 0);
    put(g, cyl(0.012, 0.012, 0.9, 4), woodM('#a8885a'), 0.06, 0.45, 0); // mietiņš
    for (let i = 0; i < 4; i++) put(g, sph(0.1, 7, 5), lm, Math.cos(i * 1.7) * 0.07, 0.62 + i * 0.06, Math.sin(i * 1.7) * 0.07).scale.set(1, 0.7, 1);
    return finish(g);
  }
  const big = stage === 2;
  const H = big ? 1.5 : 0.95, R = big ? 1.15 : 0.6;
  put(g, cyl(big ? 0.13 : 0.07, big ? 0.09 : 0.05, H, 8), bark, 0, H / 2, 0);
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; put(g, cyl(0.05, 0.03, R * 0.9, 6), bark, Math.cos(a) * R * 0.3, H + R * 0.25, Math.sin(a) * R * 0.3, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); }
  const blobs = [[0, H + R * 0.75, 0, R], [R * 0.6, H + R * 0.45, 0.1, R * 0.7], [-R * 0.55, H + R * 0.5, -0.15, R * 0.72], [0.1, H + R * 0.5, R * 0.55, R * 0.68], [-0.1, H + R * 0.4, -R * 0.55, R * 0.66]];
  const dark = mat(new THREE.Color(T.leaf).multiplyScalar(0.8).getStyle(), { roughness: 0.9 });
  blobs.forEach(([x, y, z, r], i) => put(g, new THREE.IcosahedronGeometry(r, 1), i % 2 ? dark : lm, x, y, z).scale.set(1, 0.82, 1));
  if (fruit && big) {
    const fm = mat(T.fcol, { roughness: 0.35 });
    const geo = kind === 'bumbiere' ? new THREE.CapsuleGeometry(0.06, 0.06, 3, 8) : sph(kind === 'kirsis' ? 0.045 : 0.075, 8, 6);
    let seed = 3;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 22; i++) {
      const b = blobs[i % blobs.length], th = r() * Math.PI * 2, ph = 0.3 + r() * 1.6;
      const x = b[0] + Math.sin(ph) * Math.cos(th) * b[3] * 0.98, y = b[1] + Math.cos(ph) * b[3] * 0.8, z = b[2] + Math.sin(ph) * Math.sin(th) * b[3] * 0.98;
      put(g, geo, fm, x, y - 0.03, z);
      if (kind === 'kirsis') put(g, geo, fm, x + 0.05, y - 0.06, z + 0.02);
    }
  }
  return finish(g);
}

// vietas pie dārza (dx, dz no dārza centra; ry pagrieziens)
export const DECOR_SPOTS = {
  karogs: [-4.6, -3.2, 0], burits: [-4.6, -1.1, Math.PI / 2], biedeklis: [-4.6, 1.1, Math.PI / 2], struklaka: [-4.7, 3.4, 0],
  rukis: [4.2, -3.4, Math.PI / 2], pukupods: [4.2, 3.4, 0], solins: [-1.3, 6.3, Math.PI], laterna: [1.6, 6.3, 0],
};

// ---------- makšķere un pludiņš ----------
export function buildRod() {
  const g = new THREE.Group();
  const rod = new THREE.Group(); g.add(rod);
  put(rod, cyl(0.03, 0.03, 0.4, 8), mat('#b08a5a', { roughness: 0.9 }), 0, 0.2, 0);
  put(rod, cyl(0.022, 0.006, 2.2, 6), mat('#2a2a30', { roughness: 0.4, metalness: 0.3 }), 0, 1.5, 0);
  put(rod, cyl(0.045, 0.045, 0.05, 10), mat('#c0c0c8', { metalness: 0.8, roughness: 0.3 }), 0.05, 0.35, 0, 0, 0, Math.PI / 2);
  finish(rod);
  rod.rotation.x = 0.95; // uz priekšu un augšup
  const tip = new THREE.Object3D(); tip.position.set(0, 2.6, 0); rod.add(tip);
  g.userData.tip = tip;
  return g;
}

export function buildBobber() {
  const g = new THREE.Group();
  put(g, new THREE.SphereGeometry(0.07, 10, 8, 0, TAU, 0, Math.PI / 2), mat('#e82a2a', { roughness: 0.4 }), 0, 0, 0);
  put(g, new THREE.SphereGeometry(0.07, 10, 8, 0, TAU, Math.PI / 2, Math.PI / 2), mat('#f4f4f4', { roughness: 0.4 }), 0, 0, 0);
  put(g, cyl(0.01, 0.01, 0.12, 4), mat('#e82a2a'), 0, 0.1, 0);
  return g;
}

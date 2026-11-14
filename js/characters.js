import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, makeBlobShadow, noiseTexture, lerp } from './util.js';

// kažoka/auduma materiāli ar smalku faktūru
let furTex = null, clothTex = null;
const furCache = new Map();
export function furMat(color, rough = 0.95) {
  if (!furTex) { furTex = noiseTexture('fur', 128); furTex.repeat.set(4, 4); }
  const k = color + rough;
  if (!furCache.has(k)) furCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, map: furTex, bumpMap: furTex, bumpScale: 0.35 }));
  return furCache.get(k);
}
export function clothMat(color, opts = {}) {
  if (!clothTex) { clothTex = noiseTexture('cloth', 64); clothTex.repeat.set(6, 6); }
  const k = 'c' + color + JSON.stringify(opts);
  if (!furCache.has(k)) furCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.9, map: clothTex, bumpMap: clothTex, bumpScale: 0.3, ...opts }));
  return furCache.get(k);
}

// Apvieno vienas locītavas detaļas ar vienādu materiālu vienā meshā (mazāk zīmēšanas izsaukumu)
export function optimizeRig(root, skip = new Set()) {
  const groups = [];
  root.traverse((o) => { if (!o.isMesh) groups.push(o); });
  for (const g of groups) {
    const buckets = new Map();
    for (const c of g.children) {
      if (!c.isMesh || c.children.length || skip.has(c) || c.material.transparent) continue;
      if (!buckets.has(c.material)) buckets.set(c.material, []);
      buckets.get(c.material).push(c);
    }
    for (const [m, list] of buckets) {
      if (list.length < 2) continue;
      const keepUv = list.every((c) => c.geometry.attributes.uv);
      const geos = list.map((c) => {
        c.updateMatrix();
        let geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUv && k === 'uv')) geo.deleteAttribute(k);
        return geo.applyMatrix4(c.matrix);
      });
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      for (const c of list) g.remove(c);
      const mm = new THREE.Mesh(merged, m);
      mm.castShadow = true;
      g.add(mm);
    }
  }
}

const S = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const lighten = (hex, k) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString();
const darken = (hex, k) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#000000'), k).getHexString();

function mesh(geo, color, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

// ---------------- Spēlētāju dzīvnieki (reālistiskākas proporcijas, staigā uz divām kājām) ----------------
const HIP = 0.7;
const SPECIES = {
  lacis: { bulk: 1.3, head: [1.08, 0.98, 1.0], legC: null },
  lapsa: { bulk: 0.95, head: [0.95, 0.9, 1.0], sock: '#2a2420', chest: '#f4efe6' },
  zakis: { bulk: 0.95, head: [0.92, 1.0, 1.05], feet: 1.5 },
  kakis: { bulk: 0.9, head: [1.0, 0.92, 0.95] },
  cuka:  { bulk: 1.25, head: [1.05, 0.95, 1.05], skin: 0.6 },
  suns:  { bulk: 1.05, head: [0.98, 0.95, 1.05] },
  varde: { bulk: 1.05, head: [1.35, 0.72, 1.1], skin: 0.35, feet: 1.6 },
  pile:  { bulk: 1.05, head: [0.9, 0.95, 1.0], bird: true, legC: '#e8901e' },
  udrs:  { bulk: 1.0, head: [1.0, 0.9, 1.05] },
  apsis: { bulk: 1.2, head: [0.95, 0.88, 1.1] },
  puce:  { bulk: 1.2, head: [1.12, 1.05, 0.95], bird: true, legC: '#c9a13a' },
  bebrs: { bulk: 1.25, head: [1.0, 0.95, 1.05] },
};
const CAP = (r, len, seg = 12) => new THREE.CapsuleGeometry(r, len, 5, seg);
// ekstremitāte, kas karājas uz leju no locītavas
const LIMB = (r, len) => { const g = CAP(r, len); g.translate(0, -(len / 2 + r * 0.6), 0); return g; };

export function buildAnimal({ animal = 'lacis', fur = '#8b5a2b', shirt = '#d23b3b', hat = null }) {
  const P = SPECIES[animal] || SPECIES.lacis;
  const rough = P.skin != null ? P.skin : 0.95;
  const F = (c) => (P.skin != null ? mat(c, { roughness: rough }) : furMat(c, rough));
  const add = (geo, color, x, y, z, parent, m) => {
    const o = new THREE.Mesh(geo, m || F(color));
    o.position.set(x, y, z); o.castShadow = true;
    parent.add(o); return o;
  };
  const light = P.chest || lighten(fur, 0.45);
  const dark = darken(fur, 0.35);
  const B = P.bulk;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = HIP; root.add(body);

  // iegurnis + mugura
  add(S(0.18, 18, 14), fur, 0, 0.03, 0, body).scale.set(B, 0.85, 0.9 * B);
  const spine = new THREE.Group(); spine.position.y = 0.06; body.add(spine);
  const torso = add(CAP(0.165, 0.27, 18), fur, 0, 0.23, 0, spine);
  torso.scale.set(B, 1, 0.82 * B);
  if (P.bird || animal === 'varde') add(S(0.12, 16, 12), light, 0, 0.24, 0.07 * B, spine).scale.set(0.9 * B, 1.25, 0.6);
  else add(S(0.06, 12, 10), light, 0, 0.4, 0.085, spine).scale.set(1.1, 0.9, 0.6);
  // apģērbs: veste/krekls vai šalle putniem
  if (!P.bird) {
    // krekls ar noapaļotiem pleciem (rotācijas virsma)
    const prof = [[0.19, -0.17], [0.19, -0.06], [0.184, 0.03], [0.166, 0.1], [0.135, 0.15], [0.1, 0.185], [0.075, 0.2]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const sh = add(new THREE.LatheGeometry(prof, 24), shirt, 0, 0.22, 0, spine, clothMat(shirt, { side: THREE.DoubleSide }));
    sh.scale.set(B, 1, 0.84 * B);
    const col = add(new THREE.TorusGeometry(0.075, 0.02, 8, 20), shirt, 0, 0.425, 0, spine, clothMat(shirt));
    col.rotation.x = Math.PI / 2; col.scale.set(B, 0.82 * B, 1);
  } else {
    const sc = add(new THREE.TorusGeometry(0.085, 0.03, 8, 20), shirt, 0, 0.42, 0, spine, clothMat(shirt));
    sc.rotation.x = Math.PI / 2;
    add(CAP(0.03, 0.12), shirt, 0.05, 0.33, 0.1, spine, clothMat(shirt)).rotation.z = 0.2;
  }
  // kakls un galva
  add(new THREE.CylinderGeometry(0.065, 0.08, P.bird ? 0.2 : 0.12, 12), fur, 0, P.bird ? 0.47 : 0.43, 0.01, spine);
  const head = new THREE.Group();
  head.position.set(0, animal === 'varde' ? 0.47 : P.bird ? 0.62 : 0.56, 0.02);
  spine.add(head);
  const skull = add(S(0.15, 24, 18), fur, 0, 0, 0, head);
  skull.scale.set(...P.head);
  const eyeM = mat('#120c08', { roughness: 0.15 });
  const nose = (x, y, z, r = 0.022, c = '#1a1412') => add(S(r, 10, 8), c, x, y, z, head, mat(c, { roughness: 0.35 }));
  const eyes = (x, y, z, r = 0.02) => { for (const s of [-1, 1]) add(S(r, 10, 8), '#000', s * x, y, z, head, eyeM); };
  const ears = (geo, color, x, y, z, rz = 0, rx = 0, sc = [1, 1, 1]) => {
    for (const s of [-1, 1]) { const e = add(geo, color, s * x, y, z, head); e.rotation.set(rx, 0, -s * rz); e.scale.set(...sc); }
  };
  const muzzle = (len, r, color, y = -0.04, z = 0.1) => {
    const m = add(CAP(r, len, 12), color, 0, y, z + len / 2, head);
    m.rotation.x = Math.PI / 2 - 0.15; return m;
  };
  let tail = null;
  const tailRoot = new THREE.Group(); tailRoot.position.set(0, 0.04, -0.14 * B); body.add(tailRoot);
  switch (animal) {
    case 'lacis':
      muzzle(0.06, 0.06, lighten(fur, 0.25)); nose(0, -0.02, 0.22, 0.026); eyes(0.06, 0.04, 0.125);
      ears(S(0.045, 12, 10), fur, 0.105, 0.115, -0.01, 0, 0, [1, 1, 0.55]);
      tail = add(S(0.04), fur, 0, 0, -0.02, tailRoot);
      break;
    case 'lapsa': {
      const m = add(new THREE.ConeGeometry(0.07, 0.2, 14), fur, 0, -0.04, 0.2, head); m.rotation.x = Math.PI / 2 + 0.1;
      add(new THREE.ConeGeometry(0.05, 0.16, 12), light, 0, -0.065, 0.19, head).rotation.x = Math.PI / 2 + 0.25;
      nose(0, -0.035, 0.3, 0.018); eyes(0.058, 0.03, 0.12, 0.017);
      ears(new THREE.ConeGeometry(0.055, 0.14, 12), fur, 0.085, 0.15, -0.01, 0.2, -0.1, [1, 1, 0.45]);
      ears(new THREE.ConeGeometry(0.025, 0.05, 8), '#2a2420', 0.098, 0.205, -0.01, 0.2, -0.1, [1, 1, 0.45]);
      tail = new THREE.Group();
      add(S(0.09, 16, 12), fur, 0, -0.02, -0.2, tail).scale.set(0.9, 0.9, 2.6);
      add(S(0.06, 12, 10), '#f4efe6', 0, -0.05, -0.44, tail).scale.set(1, 1, 1.4);
      tail.rotation.x = 0.7; tailRoot.add(tail);
      break;
    }
    case 'zakis':
      muzzle(0.03, 0.055, light, -0.05, 0.08); nose(0, -0.03, 0.17, 0.016, '#c78a8a'); eyes(0.07, 0.03, 0.115, 0.022);
      ears(LIMB(0.03, 0.2).rotateX(Math.PI), fur, 0.045, 0.1, -0.03, 0.12, -0.15, [1, 1, 0.42]);
      ears(LIMB(0.018, 0.17).rotateX(Math.PI), '#d9a5a8', 0.045, 0.11, -0.022, 0.12, -0.15, [1, 1, 0.3]);
      tail = add(S(0.055), '#f4f2ee', 0, 0, -0.02, tailRoot);
      break;
    case 'kakis':
      muzzle(0.02, 0.05, light, -0.045, 0.1); nose(0, -0.025, 0.165, 0.014, '#c97a7a'); eyes(0.06, 0.03, 0.12, 0.02);
      ears(new THREE.ConeGeometry(0.05, 0.1, 4), fur, 0.085, 0.13, 0, 0.3, -0.1, [1, 1, 0.5]);
      for (const s of [-1, 1]) for (const k of [-1, 1]) {
        const w = add(new THREE.CylinderGeometry(0.0015, 0.0015, 0.16, 3), '#ddd', s * 0.08, -0.045 + k * 0.012, 0.16, head); w.rotation.z = Math.PI / 2 + s * k * 0.12;
      }
      tail = new THREE.Group();
      { const t1 = add(LIMB(0.03, 0.28), fur, 0, 0, 0, tail); t1.rotation.x = -2.2; }
      tailRoot.add(tail);
      break;
    case 'cuka': {
      const sn = add(new THREE.CylinderGeometry(0.06, 0.065, 0.08, 18), lighten(fur, 0.15), 0, -0.03, 0.155, head); sn.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) add(S(0.012, 8, 6), '#7a3a44', s * 0.022, -0.03, 0.197, head);
      eyes(0.07, 0.04, 0.12, 0.016);
      ears(new THREE.ConeGeometry(0.06, 0.12, 12), fur, 0.09, 0.12, 0.03, 0.5, 0.6, [1, 1, 0.35]);
      tail = add(new THREE.TorusGeometry(0.035, 0.01, 6, 12, 5), fur, 0, 0, -0.02, tailRoot);
      break;
    }
    case 'suns':
      muzzle(0.08, 0.055, lighten(fur, 0.2)); nose(0, -0.02, 0.255, 0.022); eyes(0.06, 0.04, 0.12, 0.02);
      ears(S(0.07, 14, 10), dark, 0.13, 0.0, -0.01, 0.15, 0, [0.35, 1.1, 0.75]);
      tail = new THREE.Group(); { const t = add(LIMB(0.03, 0.22), fur, 0, 0, 0, tail); t.rotation.x = -2.4; } tailRoot.add(tail);
      break;
    case 'varde': {
      for (const s of [-1, 1]) {
        add(S(0.055, 14, 12), fur, s * 0.1, 0.09, 0.07, head);
        add(S(0.035, 12, 10), '#e8c84a', s * 0.11, 0.11, 0.105, head, mat('#e8c84a', { roughness: 0.2 }));
        add(S(0.02, 10, 8), '#000', s * 0.115, 0.115, 0.13, head, eyeM);
      }
      const mo = add(new THREE.TorusGeometry(0.15, 0.006, 6, 24, Math.PI), '#2a4a1c', 0, -0.03, 0.03, head); mo.rotation.set(Math.PI / 2, Math.PI, 0); mo.scale.set(1.25, 1.05, 1);
      for (let i = 0; i < 5; i++) add(S(0.02, 8, 6), darken(fur, 0.3), Math.sin(i * 2.3) * 0.12, 0.3 - i * 0.05, -0.1 + Math.cos(i) * 0.03, spine);
      break;
    }
    case 'pile': {
      const bill = add(S(0.07, 14, 10), '#e8901e', 0, -0.03, 0.15, head, mat('#e8901e', { roughness: 0.5 })); bill.scale.set(0.8, 0.28, 1.25);
      eyes(0.075, 0.035, 0.1, 0.016);
      tail = add(new THREE.ConeGeometry(0.07, 0.14, 10), fur, 0, 0.04, -0.06, tailRoot); tail.rotation.x = -2.0;
      break;
    }
    case 'puce': {
      add(new THREE.ConeGeometry(0.025, 0.06, 8), '#3a3020', 0, -0.03, 0.15, head).rotation.x = 1.9;
      for (const s of [-1, 1]) {
        add(new THREE.CircleGeometry(0.06, 18), light, s * 0.06, 0.02, 0.135, head).rotation.y = s * 0.35;
        add(S(0.03, 12, 10), '#e8a020', s * 0.06, 0.025, 0.14, head, mat('#e8a020', { roughness: 0.2 }));
        add(S(0.016, 8, 6), '#000', s * 0.06, 0.025, 0.165, head, eyeM);
      }
      ears(new THREE.ConeGeometry(0.03, 0.08, 8), fur, 0.1, 0.14, 0, 0.35, 0, [1, 1, 0.5]);
      break;
    }
    case 'udrs':
      muzzle(0.03, 0.065, light, -0.05, 0.09); nose(0, -0.02, 0.19, 0.022); eyes(0.065, 0.035, 0.12, 0.018);
      ears(S(0.03, 10, 8), fur, 0.11, 0.08, -0.02, 0, 0, [1, 1, 0.55]);
      tail = new THREE.Group(); { const t = add(new THREE.ConeGeometry(0.06, 0.45, 12), fur, 0, -0.22, 0, tail); t.rotation.x = Math.PI; } tail.rotation.x = 2.3; tailRoot.add(tail);
      break;
    case 'apsis':
      muzzle(0.07, 0.05, '#e8e6e0'); nose(0, -0.03, 0.235, 0.02); eyes(0.06, 0.035, 0.12, 0.016);
      for (const s of [-1, 1]) add(S(0.06, 12, 10), '#1c1c1c', s * 0.06, 0.04, 0.06, head).scale.set(0.5, 0.6, 1.5);
      add(S(0.05, 12, 10), '#f0f0ea', 0, 0.09, 0.05, head).scale.set(0.6, 0.5, 2.2);
      ears(S(0.03, 10, 8), '#222', 0.11, 0.08, -0.03, 0, 0, [1, 1, 0.55]);
      break;
    case 'bebrs':
      muzzle(0.03, 0.065, lighten(fur, 0.2), -0.05, 0.09); nose(0, -0.02, 0.19, 0.022); eyes(0.065, 0.04, 0.12, 0.018);
      add(new THREE.BoxGeometry(0.05, 0.04, 0.012), '#f0d070', 0, -0.1, 0.165, head);
      ears(S(0.03, 10, 8), fur, 0.11, 0.09, -0.02, 0, 0, [1, 1, 0.55]);
      tail = add(S(0.12, 14, 10), '#3a2814', 0, -0.06, -0.18, tailRoot); tail.scale.set(0.9, 0.18, 1.6);
      break;
  }

  // rokas ar elkoņiem (putniem — spārni)
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * (0.15 * B + 0.02), 0.33, 0);
    spine.add(sh);
    const el = new THREE.Group();
    if (P.bird) {
      const w = add(S(0.1, 14, 10), fur, 0, -0.14, -0.02, sh); w.scale.set(0.3, 1.3, 0.75);
      el.position.y = -0.26; sh.add(el);
    } else {
      add(LIMB(0.056 * Math.sqrt(B), 0.13), fur, 0, 0, 0, sh);
      add(new THREE.CylinderGeometry(0.066 * Math.sqrt(B), 0.064 * Math.sqrt(B), 0.08, 14), shirt, 0, -0.05, 0, sh, clothMat(shirt));
      el.position.y = -0.2; sh.add(el);
      add(LIMB(0.05 * Math.sqrt(B), 0.12), P.sock || fur, 0, 0, 0, el);
      add(S(0.048, 12, 10), P.sock || (animal === 'varde' ? fur : lighten(fur, 0.15)), 0, -0.2, 0.01, el).scale.set(0.9, 1, 0.8);
    }
    arms.push({ sh, el, side: s });
  }
  // kājas ar ceļgaliem
  const legs = [];
  const legColor = P.legC || fur;
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.095 * B, 0, 0);
    body.add(hip);
    if (P.bird) add(LIMB(0.032, 0.22), legColor, 0, 0, 0, hip, mat(legColor, { roughness: 0.5 }));
    else add(LIMB(0.088 * Math.sqrt(B), 0.17), fur, 0, 0, 0, hip);
    const knee = new THREE.Group(); knee.position.y = -0.3; hip.add(knee);
    add(LIMB(P.bird ? 0.025 : 0.066 * Math.sqrt(B), 0.21), P.sock || legColor, 0, 0, 0, knee);
    const foot = add(S(0.06, 14, 10), P.sock || (P.bird ? legColor : darken(fur, 0.15)), 0, -0.345, 0.05, knee);
    foot.scale.set(P.bird ? 1.4 : 1, 0.5, (P.feet || 1) * 1.7);
    if (P.bird) foot.material = mat(legColor, { roughness: 0.5 });
    legs.push({ hip, knee });
  }

  const shadow = makeBlobShadow(0.9);
  shadow.position.y = 0.03;
  root.add(shadow);
  const hatHolder = new THREE.Group();
  hatHolder.position.y = 0.13 * P.head[1];
  hatHolder.scale.setScalar(0.58 * Math.max(P.head[0], 1));
  head.add(hatHolder);

  // poza, uz kuru vienmērīgi tuvojamies (nav lēcienu starp stāvokļiem)
  const pose = { hip: [0, 0], knee: [0.05, 0.05], sh: [0, 0], shZ: [0, 0], el: [-0.15, -0.15], spX: 0.02, spY: 0, bY: HIP, bX: 0, hX: 0, hY: 0 };
  const tgt = JSON.parse(JSON.stringify(pose));
  const av = {
    root, body, head, spine, legs, arms, tail, shadow, hatHolder,
    phase: Math.random() * 6, t: Math.random() * 10, emoteSprite: null,
    setHat(id) {
      while (hatHolder.children.length) hatHolder.remove(hatHolder.children[0]);
      if (id) { const h = buildHat(id); h.traverse((o) => { if (o.isMesh) o.castShadow = true; }); hatHolder.add(h); }
    },
    animate(dt, state, speed = 0) {
      this.t += dt;
      const T = tgt;
      let k = 1 - Math.exp(-dt * 10);
      T.spY = 0; T.hX = 0; T.bX = 0; T.shZ[0] = -0.07; T.shZ[1] = 0.07;
      if (state === 'walk' || state === 'run') {
        const run = state === 'run';
        this.phase += dt * (run ? 10.5 : 7);
        const amp = run ? 0.7 : 0.42;
        for (let i = 0; i < 2; i++) {
          const ph = this.phase + i * Math.PI, s = Math.sin(ph), c = Math.cos(ph);
          T.hip[i] = -s * amp;
          T.knee[i] = Math.max(0, c) * amp * (run ? 1.9 : 1.3) + 0.08;
          T.sh[1 - i] = -s * amp * 0.75;
          T.el[1 - i] = run ? -1.25 : -0.3 - Math.max(0, -s) * 0.25;
        }
        T.bY = HIP - Math.abs(Math.sin(this.phase)) * (run ? 0.05 : 0.025) - (run ? 0.04 : 0);
        T.spX = run ? 0.22 : 0.06;
        T.spY = Math.sin(this.phase) * 0.07;
        T.hX = -T.spX * 0.6;
        k = 1 - Math.exp(-dt * 22);
      } else if (state === 'jump') {
        T.hip = [-0.7, 0.15]; T.knee = [1.0, 0.35]; T.sh = [-0.6, 0.35]; T.shZ = [-0.35, 0.35]; T.el = [-0.7, -0.5];
        T.bY = HIP; T.spX = 0.1;
      } else if (state === 'swim') {
        this.phase += dt * 4;
        const s = Math.sin(this.phase);
        T.hip = [s * 0.4, -s * 0.4]; T.knee = [0.3, 0.3];
        T.sh = [-2.4 + s * 0.6, -2.4 - s * 0.6]; T.el = [-0.3, -0.3];
        T.bX = 1.25; T.bY = HIP - 0.55; T.spX = -0.1; T.hX = -0.9;
      } else if (state === 'sit') {
        T.hip = [-1.45, -1.45]; T.knee = [1.35, 1.35]; T.sh = [-0.9, -0.9]; T.shZ = [-0.15, 0.15]; T.el = [-0.55, -0.55];
        T.bY = HIP - 0.42; T.spX = 0.05;
        k = 1 - Math.exp(-dt * 20);
      } else if (state === 'pet') {
        this.phase += dt * 6;
        T.hip = [-0.5, -0.2]; T.knee = [0.9, 0.5]; T.bY = HIP - 0.12; T.spX = 0.45;
        T.sh = [-0.2, -1.0 + Math.sin(this.phase) * 0.15]; T.el = [-0.2, -0.3]; T.hX = 0.2;
      } else if (state === 'wave') {
        this.phase += dt * 9;
        T.hip = [0, 0]; T.knee = [0.05, 0.05]; T.bY = HIP; T.spX = 0;
        T.sh = [0, -0.4]; T.shZ = [-0.07, 2.5]; T.el = [-0.15, 0]; T.hY = 0.15;
        T.shZ[1] = 2.4 + Math.sin(this.phase) * 0.25;
      } else {
        // stāvēšana: elpošana un apkārtnes vērošana
        T.hip = [0, 0]; T.knee = [0.05, 0.05]; T.sh = [0.03, 0.03]; T.el = [-0.18, -0.18];
        T.bY = HIP + Math.sin(this.t * 1.8) * 0.004; T.spX = 0.02 + Math.sin(this.t * 1.8) * 0.01;
        T.hY = Math.sin(this.t * 0.35) * 0.35 * Math.max(0, Math.sin(this.t * 0.13));
      }
      const L = (a, b) => a + (b - a) * k;
      for (let i = 0; i < 2; i++) {
        pose.hip[i] = L(pose.hip[i], T.hip[i]); pose.knee[i] = L(pose.knee[i], T.knee[i]);
        pose.sh[i] = L(pose.sh[i], T.sh[i]); pose.shZ[i] = L(pose.shZ[i], T.shZ[i]); pose.el[i] = L(pose.el[i], T.el[i]);
        this.legs[i].hip.rotation.x = pose.hip[i];
        this.legs[i].knee.rotation.x = pose.knee[i];
        this.arms[i].sh.rotation.x = pose.sh[i];
        this.arms[i].sh.rotation.z = pose.shZ[i];
        this.arms[i].el.rotation.x = pose.el[i];
      }
      for (const key of ['spX', 'spY', 'bY', 'bX', 'hX', 'hY']) pose[key] = L(pose[key], T[key]);
      this.body.position.y = pose.bY;
      this.body.rotation.x = pose.bX;
      this.spine.rotation.x = pose.spX;
      this.spine.rotation.y = pose.spY;
      this.head.rotation.x = pose.hX;
      this.head.rotation.y = pose.hY - pose.spY * 0.8;
      if (this.tail) this.tail.rotation.y = Math.sin(this.t * (state === 'idle' ? 1.5 : 4)) * 0.25;
    },
  };
  optimizeRig(root);
  av.setHat(hat);
  return av;
}

export function buildHat(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'salmu': {
      mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 16), '#e8cf6a', 0, 0, 0, g);
      mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.22, 14), '#e2c35a', 0, 0.11, 0, g);
      mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.06, 14), '#d23b3b', 0, 0.04, 0, g);
      break;
    }
    case 'vainags': {
      const t = mesh(new THREE.TorusGeometry(0.27, 0.05, 6, 16), '#3f8a2f', 0, 0, 0, g); t.rotation.x = Math.PI / 2;
      const cols = ['#ffffff', '#ffe03a', '#3a7ae8', '#e8302a', '#b06ae0'];
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2;
        mesh(S(0.06, 6, 6), cols[i % 5], Math.cos(a) * 0.27, 0.04, Math.sin(a) * 0.27, g);
      }
      break;
    }
    case 'ozols': {
      const t = mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 16), '#2f6b24', 0, 0, 0, g); t.rotation.x = Math.PI / 2;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        const l = mesh(new THREE.BoxGeometry(0.12, 0.02, 0.07), '#3f8a2f', Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3, g);
        l.rotation.y = -a;
      }
      break;
    }
    case 'cilindrs': {
      mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 16), '#151515', 0, 0, 0, g);
      mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.45, 16), '#151515', 0, 0.23, 0, g);
      mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.07, 16), '#b02020', 0, 0.06, 0, g);
      break;
    }
    case 'kronis': {
      mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12, 1, true), '#f2c12e', 0, 0.07, 0, g);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        mesh(new THREE.ConeGeometry(0.05, 0.14, 4), '#f2c12e', Math.cos(a) * 0.22, 0.2, Math.sin(a) * 0.22, g);
        mesh(S(0.03, 6, 6), ['#e8302a', '#3a7ae8'][i % 2], Math.cos(a) * 0.245, 0.07, Math.sin(a) * 0.245, g);
      }
      break;
    }
  }
  return g;
}

// ---------------- Meža dzīvnieki (NPC) — reālistiskākas proporcijas ----------------
export function buildNPC(type) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs = [];
  const knees = [];
  const M = (c, r = 0.95) => furMat(c, r);
  const part = (geo, color, x, y, z, parent = body, m) => {
    const o = new THREE.Mesh(geo, m || M(color));
    o.position.set(x, y, z); parent.add(o); return o;
  };
  // sašaurināta "kapsula": ellipsoīds ar dažādu priekšu/aizmuguri
  const ell = (rx, ry, rz, color, x, y, z, parent = body) => { const o = part(S(1, 18, 14), color, x, y, z, parent); o.scale.set(rx, ry, rz); return o; };
  const taper = (r0, r1, len, color, parent, x, y, z, seg = 10) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1); g.translate(0, -len / 2, 0);
    return part(g, color, x, y, z, parent);
  };
  // kāja ar augšstilbu, celi un kāju ar nagu
  const leg = (x, y, z, up, low, r, color, hoof, front) => {
    const hip = new THREE.Group(); hip.position.set(x, y, z); body.add(hip);
    taper(r, r * 0.6, up, color, hip, 0, 0, 0);
    part(S(r * 0.62, 10, 8), color, 0, -up, 0, hip);
    const knee = new THREE.Group(); knee.position.y = -up; hip.add(knee);
    taper(r * 0.55, r * 0.42, low, color, knee, 0, 0, 0, 8);
    if (hoof) part(new THREE.CylinderGeometry(r * 0.42, r * 0.5, 0.06, 8), hoof, 0, -low - 0.01, 0.01, knee, mat(hoof, { roughness: 0.6 }));
    knee.rotation.x = front ? 0.05 : -0.08;
    legs.push(hip); knees.push({ k: knee, front });
    return hip;
  };
  const eyes = (x, y, z, r, parent = body) => { for (const s of [-1, 1]) part(S(r, 10, 8), '#000', s * x, y, z, parent, mat('#0b0806', { roughness: 0.1 })); };
  let scale = 1, hop = false, gait = 8;
  switch (type) {
    case 'stirna': { // stirna: slaida, sarkanbrūna, balts spogulis
      const c = '#93603a', d = '#6e4428';
      const H = 0.78;
      ell(0.22, 0.26, 0.46, c, 0, H + 0.12, 0);
      ell(0.21, 0.25, 0.22, c, 0, H + 0.15, 0.26);
      ell(0.2, 0.22, 0.2, c, 0, H + 0.13, -0.3);
      ell(0.13, 0.15, 0.06, '#f2ece2', 0, H + 0.14, -0.47);
      ell(0.14, 0.12, 0.3, '#b48a64', 0, H + 0.0, 0.02);
      const neck = new THREE.Group(); neck.position.set(0, H + 0.24, 0.36); neck.rotation.x = -0.55; body.add(neck);
      const ng = new THREE.CylinderGeometry(0.075, 0.12, 0.5, 12); ng.translate(0, 0.25, 0); part(ng, c, 0, 0, 0, neck);
      const head = new THREE.Group(); head.position.set(0, 0.5, 0); head.rotation.x = 0.95; neck.add(head);
      ell(0.085, 0.09, 0.12, c, 0, 0, 0, head);
      const mz = new THREE.CylinderGeometry(0.045, 0.075, 0.17, 12); mz.rotateX(Math.PI / 2); part(mz, c, 0, -0.025, 0.14, head);
      part(S(0.032, 10, 8), '#1a1410', 0, -0.025, 0.225, head, mat('#1a1410', { roughness: 0.3 }));
      eyes(0.07, 0.025, 0.05, 0.02, head);
      for (const s of [-1, 1]) {
        const e = part(new THREE.ConeGeometry(0.05, 0.16, 10), c, s * 0.07, 0.11, -0.04, head);
        e.rotation.set(-0.3, 0, -s * 0.5); e.scale.set(1, 1, 0.45);
      }
      for (const s of [-1, 1]) {
        leg(s * 0.12, H + 0.02, 0.3, 0.38, 0.4, 0.06, s > 0 ? c : c, '#2a201a', true);
        leg(s * 0.12, H + 0.06, -0.3, 0.42, 0.38, 0.075, d, '#2a201a', false);
      }
      gait = 7;
      break;
    }
    case 'zakis': { // pelēkbrūns zaķis, garas ausis, lielas pakaļkājas
      hop = true; scale = 0.75;
      const c = '#8b765c';
      ell(0.19, 0.2, 0.3, c, 0, 0.34, -0.02).rotation.x = -0.25;
      ell(0.13, 0.14, 0.13, '#cfc2ae', 0, 0.3, 0.16);
      const head = new THREE.Group(); head.position.set(0, 0.56, 0.24); body.add(head);
      ell(0.11, 0.1, 0.14, c, 0, 0, 0, head);
      ell(0.06, 0.05, 0.06, '#b9a78e', 0, -0.035, 0.1, head);
      part(S(0.016, 8, 6), '#3a2a24', 0, -0.02, 0.155, head, mat('#3a2a24', { roughness: 0.4 }));
      eyes(0.075, 0.025, 0.06, 0.022, head);
      for (const s of [-1, 1]) {
        const e = ell(0.035, 0.17, 0.018, c, s * 0.045, 0.18, -0.04, head); e.rotation.set(-0.35, 0, -s * 0.18);
        const tip = ell(0.02, 0.03, 0.012, '#1f1a16', s * 0.068, 0.33, -0.095, head); tip.rotation.set(-0.35, 0, -s * 0.18);
      }
      ell(0.06, 0.06, 0.05, '#f2efe8', 0, 0.4, -0.3);
      for (const s of [-1, 1]) {
        const th = ell(0.08, 0.13, 0.14, c, s * 0.13, 0.22, -0.12); th.rotation.x = 0.3;
        const f = ell(0.04, 0.03, 0.13, c, s * 0.12, 0.03, -0.04); legs.push(f);
        const fl = ell(0.03, 0.1, 0.03, c, s * 0.08, 0.12, 0.17); legs.push(fl);
      }
      break;
    }
    case 'ezis': { // ezis: adatu kupols
      scale = 0.75;
      const ig = new THREE.IcosahedronGeometry(1, 3);
      const sp = ig.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
        const k = 1 + (y > -0.2 ? (Math.abs(Math.sin(x * 21) * Math.sin(y * 19) * Math.sin(z * 23)) * 0.35) : 0);
        sp.setXYZ(i, x * k, y * k, z * k);
      }
      ig.computeVertexNormals();
      const back = part(ig, '#6b5a48', 0, 0.2, -0.04, body, M('#6b5a48', 1)); back.scale.set(0.27, 0.23, 0.34);
      ell(0.2, 0.12, 0.26, '#a88c6c', 0, 0.12, 0.02);
      const head = new THREE.Group(); head.position.set(0, 0.15, 0.27); body.add(head);
      const sn = new THREE.ConeGeometry(0.09, 0.22, 14); sn.rotateX(Math.PI / 2); part(sn, '#b89a76', 0, 0, 0.06, head);
      part(S(0.025, 8, 6), '#111', 0, 0, 0.17, head, mat('#111', { roughness: 0.2 }));
      eyes(0.05, 0.04, 0.03, 0.017, head);
      for (const s of [-1, 1]) ell(0.025, 0.03, 0.01, '#8a6e52', s * 0.07, 0.08, -0.02, head);
      for (const [x, z] of [[-0.12, 0.14], [0.12, 0.14], [-0.12, -0.14], [0.12, -0.14]]) {
        const l = ell(0.035, 0.05, 0.045, '#8a6e52', x, 0.04, z); legs.push(l);
      }
      gait = 12;
      break;
    }
    case 'mezacuka': { // mežacūka: masīvs priekšgals, gara purns, sari
      const c = '#56483a', d = '#3f342a';
      ell(0.3, 0.34, 0.55, c, 0, 0.72, -0.02);
      ell(0.31, 0.38, 0.3, d, 0, 0.78, 0.25);
      const crest = ell(0.05, 0.07, 0.42, '#2a221a', 0, 1.06, 0.12); crest.rotation.x = -0.15;
      const head = new THREE.Group(); head.position.set(0, 0.72, 0.55); head.rotation.x = 0.35; body.add(head);
      ell(0.19, 0.21, 0.24, d, 0, 0, 0, head);
      const sn = new THREE.CylinderGeometry(0.075, 0.15, 0.32, 14); sn.rotateX(Math.PI / 2); part(sn, d, 0, -0.03, 0.3, head);
      const disc = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 14); disc.rotateX(Math.PI / 2); part(disc, '#5a4636', 0, -0.03, 0.47, head, mat('#5a4636', { roughness: 0.5 }));
      eyes(0.11, 0.07, 0.15, 0.022, head);
      for (const s of [-1, 1]) {
        const e = part(new THREE.ConeGeometry(0.06, 0.15, 8), d, s * 0.12, 0.2, -0.04, head); e.rotation.set(-0.4, 0, -s * 0.4); e.scale.set(1, 1, 0.5);
        const t = part(new THREE.ConeGeometry(0.018, 0.1, 6), '#efe8d8', s * 0.09, -0.04, 0.4, head, mat('#efe8d8', { roughness: 0.4 })); t.rotation.set(-0.5, 0, -s * 0.5);
      }
      for (const s of [-1, 1]) {
        leg(s * 0.16, 0.6, 0.3, 0.26, 0.3, 0.08, d, '#1a1612', true);
        leg(s * 0.15, 0.6, -0.36, 0.28, 0.28, 0.09, d, '#1a1612', false);
      }
      const tl = new THREE.CylinderGeometry(0.01, 0.025, 0.3, 6); tl.translate(0, -0.15, 0);
      part(tl, d, 0, 0.88, -0.56).rotation.x = -0.4;
      gait = 9;
      break;
    }
    case 'vavere': { // vāvere: ruda, kupla aste, pušķainas ausis
      scale = 0.6; hop = true;
      const c = '#a9481c';
      ell(0.14, 0.2, 0.15, c, 0, 0.32, 0).rotation.x = 0.3;
      ell(0.09, 0.14, 0.06, '#f1e2c8', 0, 0.33, 0.12);
      const head = new THREE.Group(); head.position.set(0, 0.56, 0.1); body.add(head);
      ell(0.1, 0.095, 0.12, c, 0, 0, 0, head);
      ell(0.05, 0.045, 0.06, c, 0, -0.03, 0.09, head);
      part(S(0.014, 8, 6), '#2a1a14', 0, -0.02, 0.15, head, mat('#2a1a14', { roughness: 0.3 }));
      eyes(0.06, 0.025, 0.065, 0.021, head);
      for (const s of [-1, 1]) {
        const e = part(new THREE.ConeGeometry(0.03, 0.1, 8), c, s * 0.06, 0.11, -0.02, head); e.rotation.z = -s * 0.15;
        part(new THREE.ConeGeometry(0.012, 0.06, 6), '#6a2c12', s * 0.064, 0.18, -0.02, head).rotation.z = -s * 0.15;
      }
      // kupla, izliekta aste no vairākām daļām
      let tp = new THREE.Vector3(0, 0.22, -0.14);
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const r = 0.08 + Math.sin(t * Math.PI) * 0.06;
        ell(r, r * 1.1, r, i % 2 ? '#b65424' : c, tp.x, tp.y, tp.z);
        tp = tp.add(new THREE.Vector3(0, 0.1 - t * 0.02, -0.05 + t * 0.09));
      }
      for (const s of [-1, 1]) {
        const f = ell(0.04, 0.035, 0.11, c, s * 0.1, 0.05, -0.02); legs.push(f);
        const th = ell(0.065, 0.1, 0.1, c, s * 0.1, 0.2, -0.04); th.rotation.x = 0.4;
      }
      break;
    }
    case 'starkis': { // baltais stārķis: melni lidspalvas, garas sarkanas kājas
      const wM = mat('#f4f2ec', { roughness: 0.9 });
      const H = 1.0;
      part(S(1, 18, 14), '#fff', 0, H + 0.22, 0, body, wM).scale.set(0.2, 0.2, 0.38);
      for (const s of [-1, 1]) {
        const w = part(S(1, 14, 10), '#1a1a1a', s * 0.17, H + 0.24, -0.12, body, mat('#151515', { roughness: 0.7 }));
        w.scale.set(0.06, 0.15, 0.4); w.rotation.x = 0.15;
        const w2 = part(S(1, 14, 10), '#fff', s * 0.18, H + 0.28, 0.06, body, wM); w2.scale.set(0.06, 0.13, 0.22);
      }
      const tail = part(new THREE.ConeGeometry(0.1, 0.25, 10), '#fff', 0, H + 0.24, -0.42, body, wM); tail.rotation.x = -Math.PI / 2 - 0.2; tail.scale.set(1, 1, 0.4);
      const neck = new THREE.Group(); neck.position.set(0, H + 0.3, 0.28); neck.rotation.x = 0.25; body.add(neck);
      const ng = new THREE.CylinderGeometry(0.045, 0.075, 0.5, 12); ng.translate(0, 0.25, 0); part(ng, '#fff', 0, 0, 0, neck, wM);
      const head = new THREE.Group(); head.position.set(0, 0.52, 0.02); neck.add(head);
      part(S(0.075, 14, 10), '#fff', 0, 0, 0, head, wM);
      const bk = new THREE.ConeGeometry(0.03, 0.36, 10); bk.rotateX(Math.PI / 2); bk.translate(0, 0, 0.22);
      const beak = part(bk, '#d8331f', 0, -0.02, 0.02, head, mat('#d8331f', { roughness: 0.4 })); beak.rotation.x = 0.35;
      eyes(0.05, 0.02, 0.04, 0.014, head);
      const lM = mat('#d8331f', { roughness: 0.5 });
      for (const s of [-1, 1]) {
        const hip = new THREE.Group(); hip.position.set(s * 0.07, H + 0.06, 0.02); body.add(hip);
        const ug = new THREE.CylinderGeometry(0.02, 0.016, 0.5, 6); ug.translate(0, -0.25, 0); part(ug, '#d8331f', 0, 0, 0, hip, lM);
        const knee = new THREE.Group(); knee.position.y = -0.5; hip.add(knee); knee.rotation.x = -0.1;
        const lg = new THREE.CylinderGeometry(0.016, 0.014, 0.52, 6); lg.translate(0, -0.26, 0); part(lg, '#d8331f', 0, 0, 0, knee, lM);
        for (const a of [-0.5, 0, 0.5]) { const t = part(new THREE.BoxGeometry(0.012, 0.01, 0.1), '#d8331f', Math.sin(a) * 0.04, -0.52, Math.cos(a) * 0.04, knee, lM); t.rotation.y = a; }
        legs.push(hip); knees.push({ k: knee, front: false });
      }
      gait = 4;
      break;
    }
  }
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  optimizeRig(body, new Set(legs));
  const shadow = makeBlobShadow(type === 'stirna' || type === 'mezacuka' ? 1.6 : 0.9);
  shadow.position.y = 0.03;
  root.add(shadow);
  root.scale.setScalar(scale);
  return {
    root, body, legs, phase: Math.random() * 10, idleT: Math.random() * 10,
    animate(dt, moving, speed) {
      this.idleT += dt;
      if (moving) {
        this.phase += dt * (hop ? 9 : gait) * Math.min(1.6, speed / 1.2 + 0.4);
        if (hop) {
          const p = Math.sin(this.phase);
          this.body.position.y = Math.max(0, p) * 0.3;
          this.body.rotation.x = -p * 0.18;
          this.legs.forEach((l, i) => { l.rotation.x = (i % 2 ? 0.5 : -0.4) * p; });
        } else {
          const s = Math.sin(this.phase);
          this.legs.forEach((l, i) => {
            // diagonāla rikšošana: priekšējā kreisā ar pakaļējo labo
            const ph = (i === 0 || i === 3) ? 0 : Math.PI;
            l.rotation.x = Math.sin(this.phase + ph) * 0.45;
          });
          knees.forEach(({ k, front }, i) => {
            const ph = (i === 0 || i === 3) ? 0 : Math.PI;
            const c = Math.max(0, Math.cos(this.phase + ph));
            k.rotation.x = front ? c * 0.7 : -c * 0.6;
          });
          this.body.position.y = Math.abs(s) * 0.025;
          this.body.rotation.x = 0;
        }
      } else {
        // stāv: viegla elpošana
        this.body.position.y *= 0.8;
        this.body.rotation.x *= 0.85;
        this.body.scale.y = 1 + Math.sin(this.idleT * 2.2) * 0.008;
        this.legs.forEach((l) => { l.rotation.x *= 0.85; });
        knees.forEach(({ k, front }) => { k.rotation.x = lerp(k.rotation.x, front ? 0.05 : -0.08, 0.15); });
      }
    },
  };
}

// ---------------- Karts ----------------
export function buildKart(color = '#e02a2a') {
  const g = new THREE.Group();
  const base = mesh(new THREE.BoxGeometry(1.4, 0.25, 2.2), color, 0, 0.35, 0, g);
  const nose = mesh(new THREE.BoxGeometry(1.1, 0.3, 0.6), color, 0, 0.42, 1.2, g);
  nose.rotation.x = 0.25;
  mesh(new THREE.BoxGeometry(1.5, 0.12, 0.3), '#222', 0, 0.38, 1.55, g);
  mesh(new THREE.BoxGeometry(0.9, 0.5, 0.2), '#333', 0, 0.75, -0.6, g); // sēdekļa atzveltne
  mesh(new THREE.BoxGeometry(1.5, 0.08, 0.4), color, 0, 1.0, -1.05, g); // spoileris
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), '#333', s * 0.6, 0.75, -1.05, g);
  const sw = mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 12), '#222', 0, 0.85, 0.45, g);
  sw.rotation.x = -0.9;
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.32, 0.32, 0.3, 12); wg.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.8, 0.75], [0.8, 0.75], [-0.8, -0.75], [0.8, -0.75]]) {
    const w = mesh(wg, '#1c1c1c', x, 0.32, z, g);
    mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.31, 8).rotateZ(Math.PI / 2), '#bbbbbb', 0, 0, 0, w);
    wheels.push(w);
  }
  const seat = new THREE.Group();
  seat.position.set(0, 0.12, -0.3);
  g.add(seat);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const shadow = makeBlobShadow(2.6);
  shadow.position.y = 0.04;
  g.add(shadow);
  return { root: g, wheels, seat, base, setColor(c) { base.material = mat(c); nose.material = mat(c); } };
}

// ---------------- Tirgotāja ratiņi ----------------
export function buildCart(color = '#3c9a4a', iceCream = false) {
  const g = new THREE.Group();
  mesh(new THREE.BoxGeometry(2.6, 1.0, 1.4), '#a0703f', 0, 0.9, 0, g);
  mesh(new THREE.BoxGeometry(2.7, 0.1, 1.5), '#7a5230', 0, 1.45, 0, g);
  const wg = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 12); wg.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) mesh(wg, '#5a3a1a', s * 0.9, 0.45, 0.76, g);
  for (const s of [-1, 1]) mesh(wg, '#5a3a1a', s * 0.9, 0.45, -0.76, g);
  for (const [x, z] of [[-1.25, -0.65], [1.25, -0.65], [-1.25, 0.65], [1.25, 0.65]]) {
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), '#dddddd', x, 2.1, z, g);
  }
  // svītraina markīze
  for (let i = 0; i < 6; i++) {
    const st = mesh(new THREE.BoxGeometry(0.48, 0.06, 1.7), i % 2 ? '#ffffff' : color, -1.2 + i * 0.48, 2.85, 0, g);
    st.rotation.x = 0;
  }
  // preces uz galda
  if (iceCream) {
    const cols = ['#ffd1dc', '#fff3b0', '#c6f0c2', '#8a5a3a'];
    cols.forEach((c, i) => {
      mesh(new THREE.ConeGeometry(0.1, 0.3, 8).rotateX(Math.PI), '#e0b070', -0.8 + i * 0.5, 1.65, 0.3, g);
      mesh(S(0.12, 8, 6), c, -0.8 + i * 0.5, 1.85, 0.3, g);
    });
  } else {
    const cols = ['#f07b1a', '#e0302a', '#5fae4a', '#f2c12e', '#7a4a22'];
    for (let i = 0; i < 8; i++) mesh(S(0.14, 8, 6), cols[i % 5], -1.0 + i * 0.28, 1.6, 0.35 - (i % 2) * 0.3, g);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  optimizeRig(g);
  return g;
}

// ---------------- Sēnes ----------------
export function buildMushroom(def) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.28, 8), def.stem, 0, 0.14, 0, g);
  const capG = new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const cap = mesh(capG, def.cap, 0, 0.26, 0, g);
  cap.scale.set(1, def.poison ? 0.7 : 0.8, 1);
  if (def.poison) {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      mesh(S(0.025, 4, 4), '#ffffff', Math.cos(a) * 0.12, 0.36, Math.sin(a) * 0.12, g);
    }
  }
  g.scale.setScalar(1.4);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  optimizeRig(g);
  return g;
}

export function buildStar() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.22 : 0.5, a = i / 10 * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
  geo.center();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffd21a', emissive: '#a07000' }));
}

// ---------------- Augi dārzā ----------------
export function buildCrop(crop, stage, color) {
  const g = new THREE.Group();
  if (stage === 0) {
    for (const s of [-1, 1]) {
      const l = mesh(S(0.08, 6, 4), '#5fbf3a', s * 0.06, 0.08, 0, g); l.scale.set(1, 0.4, 0.6);
    }
    return g;
  }
  const h = stage === 1 ? 0.35 : 0.55;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const l = mesh(new THREE.ConeGeometry(0.07, h, 4), '#4caf35', Math.cos(a) * 0.08, h / 2, Math.sin(a) * 0.08, g);
    l.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
  }
  if (stage === 2) {
    switch (crop) {
      case 'burkans': { const c = mesh(new THREE.ConeGeometry(0.11, 0.35, 8), color, 0, 0.02, 0, g); c.rotation.x = Math.PI; break; }
      case 'kartupelis': for (let i = 0; i < 3; i++) mesh(S(0.09, 6, 5), color, (i - 1) * 0.15, 0.06, 0.12, g); break;
      case 'tomats': for (let i = 0; i < 3; i++) mesh(S(0.09, 8, 6), color, Math.cos(i * 2) * 0.14, 0.35 + i * 0.06, Math.sin(i * 2) * 0.14, g); break;
      case 'zemene': for (let i = 0; i < 4; i++) mesh(new THREE.ConeGeometry(0.06, 0.12, 6).rotateX(Math.PI), color, Math.cos(i * 1.6) * 0.18, 0.1, Math.sin(i * 1.6) * 0.18, g); break;
      case 'kirbis': { const p = mesh(S(0.3, 12, 8), color, 0, 0.22, 0.05, g); p.scale.set(1.2, 0.8, 1.2); mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 5), '#4a6a1a', 0, 0.48, 0.05, g); break; }
    }
  }
  return g;
}

export function buildHeart() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.3);
  shape.bezierCurveTo(-0.5, 0.05, -0.25, 0.4, 0, 0.18);
  shape.bezierCurveTo(0.25, 0.4, 0.5, 0.05, 0, -0.3);
  const geo = new THREE.ShapeGeometry(shape);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ff3a6a', side: THREE.DoubleSide, transparent: true }));
}

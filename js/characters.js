import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, makeBlobShadow } from './util.js';

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
      const geos = list.map((c) => {
        c.updateMatrix();
        let geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
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
  const F = (c) => mat(c, { roughness: rough });
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
    const sh = add(new THREE.LatheGeometry(prof, 24), shirt, 0, 0.22, 0, spine, mat(shirt, { roughness: 0.8, side: THREE.DoubleSide }));
    sh.scale.set(B, 1, 0.84 * B);
    const col = add(new THREE.TorusGeometry(0.075, 0.02, 8, 20), shirt, 0, 0.425, 0, spine, mat(shirt, { roughness: 0.8 }));
    col.rotation.x = Math.PI / 2; col.scale.set(B, 0.82 * B, 1);
  } else {
    const sc = add(new THREE.TorusGeometry(0.085, 0.03, 8, 20), shirt, 0, 0.42, 0, spine, mat(shirt, { roughness: 0.9 }));
    sc.rotation.x = Math.PI / 2;
    add(CAP(0.03, 0.12), shirt, 0.05, 0.33, 0.1, spine, mat(shirt, { roughness: 0.9 })).rotation.z = 0.2;
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
      add(new THREE.CylinderGeometry(0.066 * Math.sqrt(B), 0.064 * Math.sqrt(B), 0.08, 14), shirt, 0, -0.05, 0, sh, mat(shirt, { roughness: 0.8 }));
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

// ---------------- Meža dzīvnieki (NPC) ----------------
export function buildNPC(type) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs = [];
  const quad = (color, h, w, l, lr = 0.06) => {
    const lg = new THREE.CylinderGeometry(lr, lr * 0.8, h, 6); lg.translate(0, -h / 2, 0);
    for (const [x, z] of [[-w, l], [w, l], [-w, -l], [w, -l]]) {
      const hip = new THREE.Group(); hip.position.set(x, h, z);
      mesh(lg, color, 0, 0, 0, hip);
      body.add(hip); legs.push(hip);
    }
  };
  let scale = 1, hop = false;
  switch (type) {
    case 'stirna': {
      quad('#7a5232', 0.8, 0.18, 0.4, 0.05);
      const b = mesh(S(0.4, 10, 8), '#a8743f', 0, 1.05, 0, body); b.scale.set(0.75, 0.75, 1.45);
      mesh(S(0.12), '#ffffff', 0, 1.15, -0.55, body);
      const neck = mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.55, 8), '#a8743f', 0, 1.4, 0.5, body); neck.rotation.x = 0.5;
      const head = mesh(S(0.17, 10, 8), '#a8743f', 0, 1.7, 0.68, body); head.scale.set(0.9, 0.9, 1.3);
      mesh(S(0.04, 6, 6), '#222', 0, 1.66, 0.88, body);
      for (const s of [-1, 1]) {
        const e = mesh(S(0.07, 6, 6), '#a8743f', s * 0.12, 1.86, 0.6, body); e.scale.set(0.6, 1.4, 0.4);
        mesh(S(0.025, 6, 6), '#111', s * 0.08, 1.74, 0.82, body);
      }
      break;
    }
    case 'zakis': {
      hop = true; scale = 0.7;
      const b = mesh(S(0.3, 10, 8), '#9b8466', 0, 0.35, 0, body); b.scale.set(0.9, 0.85, 1.2);
      const h = mesh(S(0.18, 10, 8), '#9b8466', 0, 0.62, 0.3, body);
      for (const s of [-1, 1]) {
        const e = mesh(S(0.06, 6, 6), '#9b8466', s * 0.07, 0.92, 0.25, body); e.scale.set(0.7, 3, 0.5);
        mesh(S(0.03, 6, 6), '#111', s * 0.09, 0.66, 0.44, body);
      }
      mesh(S(0.09, 6, 6), '#ffffff', 0, 0.42, -0.36, body);
      for (const s of [-1, 1]) { const f = mesh(S(0.08, 6, 6), '#9b8466', s * 0.13, 0.08, -0.12, body); f.scale.set(0.8, 0.6, 1.8); legs.push(f); }
      break;
    }
    case 'ezis': {
      scale = 0.7;
      const b = mesh(new THREE.IcosahedronGeometry(0.35, 1), '#4a3a2a', 0, 0.28, -0.05, body); b.scale.set(1, 0.75, 1.25);
      b.material = new THREE.MeshStandardMaterial({ color: '#4a3a2a', flatShading: true });
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, r = 0.32;
        const sp = mesh(new THREE.ConeGeometry(0.05, 0.22, 4), '#2e241a', Math.cos(a) * r * 0.8, 0.38 + Math.sin(i * 1.7) * 0.08, Math.sin(a) * r - 0.05, body);
        sp.lookAt(Math.cos(a) * 3, 2.5, Math.sin(a) * 3); sp.rotateX(Math.PI / 2);
      }
      const f = mesh(new THREE.ConeGeometry(0.15, 0.32, 8), '#c9a77a', 0, 0.22, 0.4, body); f.rotation.x = Math.PI / 2;
      mesh(S(0.04, 6, 6), '#111', 0, 0.22, 0.57, body);
      for (const s of [-1, 1]) mesh(S(0.025, 6, 6), '#111', s * 0.07, 0.3, 0.42, body);
      quad('#c9a77a', 0.12, 0.15, 0.15, 0.04);
      break;
    }
    case 'mezacuka': {
      quad('#2e241c', 0.4, 0.2, 0.35, 0.07);
      const b = mesh(S(0.45, 10, 8), '#4a3a2c', 0, 0.75, 0, body); b.scale.set(0.8, 0.85, 1.4);
      const h = mesh(S(0.28, 10, 8), '#4a3a2c', 0, 0.75, 0.62, body); h.scale.set(0.85, 0.9, 1.1);
      const sn = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 10), '#6a5040', 0, 0.68, 0.9, body); sn.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        const t = mesh(new THREE.ConeGeometry(0.03, 0.14, 5), '#f4f0e0', s * 0.1, 0.62, 0.86, body); t.rotation.x = -0.6;
        mesh(new THREE.ConeGeometry(0.07, 0.14, 4), '#3a2e22', s * 0.15, 1.0, 0.55, body);
        mesh(S(0.03, 6, 6), '#111', s * 0.13, 0.82, 0.84, body);
      }
      const crest = mesh(new THREE.BoxGeometry(0.06, 0.12, 0.9), '#2a2018', 0, 1.12, 0.05, body);
      crest.rotation.x = 0;
      break;
    }
    case 'vavere': {
      scale = 0.55; hop = true;
      const b = mesh(S(0.25, 10, 8), '#c4561e', 0, 0.35, 0, body); b.scale.set(0.8, 1.1, 0.9);
      mesh(S(0.15, 8, 6), '#f0d0a0', 0, 0.35, 0.16, body).scale.set(0.8, 1.2, 0.4);
      mesh(S(0.18, 10, 8), '#c4561e', 0, 0.68, 0.06, body);
      for (const s of [-1, 1]) {
        mesh(new THREE.ConeGeometry(0.05, 0.14, 4), '#c4561e', s * 0.1, 0.86, 0.02, body);
        mesh(S(0.03, 6, 6), '#111', s * 0.07, 0.72, 0.21, body);
      }
      const t = mesh(S(0.22, 10, 8), '#d4662e', 0, 0.6, -0.3, body); t.scale.set(0.8, 1.8, 0.7); t.rotation.x = -0.3;
      for (const s of [-1, 1]) { const f = mesh(S(0.07, 6, 6), '#c4561e', s * 0.12, 0.06, 0, body); f.scale.set(0.8, 0.6, 1.6); legs.push(f); }
      break;
    }
    case 'starkis': {
      quad('#e03a2a', 1.0, 0.08, 0, 0.025);
      legs.splice(2, 2).forEach((l) => body.remove(l));
      const b = mesh(S(0.32, 10, 8), '#ffffff', 0, 1.25, 0, body); b.scale.set(0.8, 0.8, 1.4);
      for (const s of [-1, 1]) { const w = mesh(S(0.2, 8, 6), '#1a1a1a', s * 0.24, 1.27, -0.12, body); w.scale.set(0.3, 0.7, 1.8); }
      const neck = mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 8), '#ffffff', 0, 1.6, 0.35, body); neck.rotation.x = 0.35;
      mesh(S(0.12, 8, 6), '#ffffff', 0, 1.92, 0.46, body);
      const beak = mesh(new THREE.ConeGeometry(0.04, 0.45, 6), '#e03a2a', 0, 1.9, 0.7, body); beak.rotation.x = Math.PI / 2 + 0.25;
      for (const s of [-1, 1]) mesh(S(0.025, 6, 6), '#111', s * 0.08, 1.96, 0.52, body);
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
    root, body, legs, phase: Math.random() * 10,
    animate(dt, moving, speed) {
      if (moving) {
        this.phase += dt * (hop ? 9 : 8) * Math.min(1.5, speed / 1.2 + 0.4);
        if (hop) {
          this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.35;
        } else {
          const s = Math.sin(this.phase) * 0.5;
          this.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3) ? s : -s; });
        }
      } else {
        this.body.position.y *= 0.8;
        this.legs.forEach((l) => { l.rotation.x *= 0.85; });
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

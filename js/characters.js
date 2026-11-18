import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, makeBlobShadow, noiseTexture, lerp, canvasTexture } from './util.js?v=1.24.0';

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

// ---------- zīmēšanas izsaukumu apvienošana ----------
// „Izskata” atslēga: gabalus ar vienādu atslēgu var sapludināt vienā ģeometrijā, materiāla krāsu iecepot virsotnēs.
// Vienkrāsainiem materiāliem bez faktūrām arī raupjums/metāliskums tiek glabāts virsotnēs (atribūts rm), tāpēc
// visas acis, degungali, metāla detaļas utt. kļūst par vienu izsaukumu, un izskats nemainās.
const texId = (t) => (t ? t.uuid : '-');
function bucketKey(m) {
  if (!m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.transparent || m.envMap || m.lightMap || m.aoMap || m.emissiveMap || m.alphaMap || m.displacementMap) return m;
  if (m.userData.plainRM) return m; // jau apvienots
  if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) return m;
  const common = [m.side, m.flatShading ? 1 : 0, m.emissive.getHexString(), m.emissiveIntensity, m.alphaTest, m.fog ? 1 : 0].join('|');
  if (!m.map && !m.normalMap && !m.roughnessMap && !m.metalnessMap && !m.bumpMap) return 'plain|' + common;
  return ['look', common, texId(m.map), texId(m.normalMap), texId(m.roughnessMap), texId(m.metalnessMap), texId(m.bumpMap), m.bumpScale, m.roughness.toFixed(2), m.metalness.toFixed(2), m.normalMap ? m.normalScale.x.toFixed(2) : ''].join('|');
}
const sharedMats = new Map();
function sharedMaterial(key, m0) {
  if (sharedMats.has(key)) return sharedMats.get(key);
  let nm;
  if (key.startsWith('plain|')) {
    nm = new THREE.MeshStandardMaterial({ vertexColors: true, side: m0.side, flatShading: m0.flatShading, emissive: m0.emissive, emissiveIntensity: m0.emissiveIntensity, alphaTest: m0.alphaTest, fog: m0.fog });
    nm.userData.plainRM = true;
    nm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 rm;\nvarying vec2 vRM;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = rm;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
    };
    nm.customProgramCacheKey = () => 'plainRM';
  } else {
    nm = m0.clone();
    nm.color.set('#ffffff');
    nm.vertexColors = true;
  }
  nm.name = 'baked';
  sharedMats.set(key, nm);
  nm.addEventListener('dispose', () => sharedMats.delete(key));
  return nm;
}
// sagatavo gabala ģeometriju apvienošanai (krāsa/raupjums virsotnēs), pārveidota ar matricu mtx
function prepGeo(c, key, mtx, keepUv) {
  const m = c.material, g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
  const n = g.attributes.position.count;
  const baked = typeof key === 'string';
  const keepCol = !baked && !!m.vertexColors;
  const keepRm = !baked && !!m.userData.plainRM;
  let col = null, rm = null;
  if (baked) {
    const cc = m.color, src = m.vertexColors && g.attributes.color;
    col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = cc.r * (src ? src.getX(i) : 1); col[i * 3 + 1] = cc.g * (src ? src.getY(i) : 1); col[i * 3 + 2] = cc.b * (src ? src.getZ(i) : 1);
    }
    if (key.startsWith('plain|')) { rm = new Float32Array(n * 2); for (let i = 0; i < n; i++) { rm[i * 2] = m.roughness; rm[i * 2 + 1] = m.metalness; } }
  }
  for (const k of Object.keys(g.attributes)) {
    if (k === 'position' || k === 'normal' || (keepUv && k === 'uv') || (keepCol && k === 'color') || (keepRm && k === 'rm')) continue;
    g.deleteAttribute(k);
  }
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (rm) g.setAttribute('rm', new THREE.BufferAttribute(rm, 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g.applyMatrix4(mtx);
}
function bucketMaterial(key, m0) { return typeof key === 'string' ? sharedMaterial(key, m0) : key; }
function needsUv(m) { return !!(m.map || m.normalMap || m.roughnessMap || m.metalnessMap || m.bumpMap || m.alphaMap); }

// Apvieno vienas locītavas detaļas vienā meshā (mazāk zīmēšanas izsaukumu). bake — apvieno arī dažādus materiālus
// ar vienādu izskatu (tikai objektiem, kuru materiālu krāsas vēlāk nemaina).
export function optimizeRig(root, skip = new Set(), opts = {}) {
  const groups = [];
  root.traverse((o) => { if (!o.isMesh) groups.push(o); });
  for (const g of groups) {
    const buckets = new Map();
    for (const c of g.children) {
      if (!c.isMesh || c.isInstancedMesh || c.children.length || skip.has(c) || c.material.transparent || Array.isArray(c.material)) continue;
      const k = opts.bake ? bucketKey(c.material) : c.material;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(c);
    }
    for (const [k, list] of buckets) {
      if (list.length < 2) continue;
      const m0 = list[0].material;
      const keepUv = needsUv(m0) || (typeof k !== 'string' && list.every((c) => c.geometry.attributes.uv));
      if (keepUv && !list.every((c) => c.geometry.attributes.uv)) continue;
      const geos = list.map((c) => { c.updateMatrix(); return prepGeo(c, k, c.matrix, keepUv); });
      const merged = mergeGeometries(geos);
      geos.forEach((x) => x.dispose());
      if (!merged) continue;
      const cast = list.some((c) => c.castShadow) || !opts.bake;
      for (const c of list) g.remove(c);
      const mm = new THREE.Mesh(merged, bucketMaterial(k, m0));
      mm.castShadow = cast;
      mm.receiveShadow = list.some((c) => c.receiveShadow);
      g.add(mm);
    }
  }
}

// Nekustīgu objektu grupu (tirgotāji, mājas, īpašās vietas) apvieno dažos zīmēšanas izsaukumos pa izskatiem.
// Kvalitāte nemainās — mainās tikai tas, kā dati nonāk GPU.
export function flattenStatic(root, opts = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), loose = [], kept = [];
  // userData.keep — kustīgs apakškoks (vāks, laiva): pārceļ veselu; caurspīdīgi/sprite — pārceļ oriģinālu (atsauces paliek derīgas)
  const visit = (o) => {
    if (o !== root && o.userData.keep) { kept.push(o); return; }
    if (o !== root && !o.visible) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && !o.material.transparent) {
      const k = bucketKey(o.material);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(o);
    } else if (o !== root && (o.isMesh || o.isSprite || o.isPoints || o.isLine)) loose.push(o);
    for (const c of o.children) visit(c);
  };
  visit(root);
  const out = new THREE.Group();
  const rel = (o) => new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
  for (const [key, list] of buckets) {
    const m0 = list[0].material;
    const allUv = list.every((c) => c.geometry.attributes.uv);
    if (needsUv(m0) && !allUv) { list.forEach((c) => loose.push(c)); continue; }
    const keepUv = needsUv(m0) || (typeof key !== 'string' && allUv && !!m0.map);
    const geos = list.map((c) => prepGeo(c, key, rel(c), keepUv));
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) { list.forEach((c) => loose.push(c)); continue; }
    merged.computeBoundingSphere();
    const mm = new THREE.Mesh(merged, bucketMaterial(key, m0));
    mm.castShadow = opts.castShadow != null ? opts.castShadow : list.some((c) => c.castShadow);
    mm.receiveShadow = opts.receiveShadow != null ? opts.receiveShadow : list.some((c) => c.receiveShadow);
    if (list[0].layers.mask !== 1) mm.layers.mask = list[0].layers.mask;
    out.add(mm);
  }
  // pārceltie objekti saglabā savu transformāciju; turētājs atkārto vecā vecāka transformāciju
  // (tā kodā animētās rotācijas/pozīcijas turpina strādāt kā iepriekš)
  const holders = new Map();
  const holderFor = (parent) => {
    if (parent === root) return out;
    if (!holders.has(parent)) {
      const h = new THREE.Group();
      rel(parent).decompose(h.position, h.quaternion, h.scale);
      holders.set(parent, h);
    }
    return holders.get(parent);
  };
  const moves = [...loose.map((o) => [o, holderFor(o.parent), true]), ...kept.map((o) => [o, holderFor(o.parent), false])];
  for (const [o, h, strip] of moves) {
    if (strip) for (const c of o.children.slice()) o.remove(c); // bērni apstrādāti atsevišķi
    o.removeFromParent();
    h.add(o);
  }
  for (const h of holders.values()) out.add(h);
  out.position.copy(root.position); out.quaternion.copy(root.quaternion); out.scale.copy(root.scale);
  return out;
}

// segmentu skaits ×0,72 (1.19.0): tikpat gludi no spēles kameras attāluma, bet ~2× mazāk trijstūru katram dzīvniekam
const S = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, Math.max(6, Math.round(w * 0.72)), Math.max(5, Math.round(h * 0.72)));
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
// konusveida, noapaļota ekstremitāte ar muskuļa izliekumu (rotācijas virsma)
const TL = (r0, r1, len, bulge = 0.12) => {
  const pts = [];
  for (let i = 0; i <= 6; i++) { const a = Math.PI / 2 - (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0)); }
  for (let i = 1; i < 8; i++) {
    const t = i / 8, r = r0 + (r1 - r0) * t + Math.sin(t * Math.PI) * bulge * r0;
    pts.push(new THREE.Vector2(r, -len * t));
  }
  for (let i = 0; i <= 6; i++) { const a = -(i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1, -len + Math.sin(a) * r1)); }
  pts[0].x = 0.0001; pts[pts.length - 1].x = 0.0001;
  return new THREE.LatheGeometry(pts.reverse(), 16);
};
const LATHE = (prof, seg = 24) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);

// ---------- ziemas drēbju un slēpju materiāli (kešoti) ----------
let knitTex = null, knitM = null, cuffM = null, pomM = null, mittM = null, skiG = null, skiM = null;
function knitPattern() {
  if (knitTex) return knitTex;
  knitTex = canvasTexture(128, 128, (g, w, h) => {
    // sarkanbaltas svītras ar adījuma „V” valdziņiem
    for (let y = 0; y < h; y += 8) {
      const band = Math.floor(y / 32) % 2;
      for (let x = 0; x < w; x += 8) {
        const l = 0.85 + Math.random() * 0.15;
        g.fillStyle = band ? `rgb(${245 * l | 0},${242 * l | 0},${236 * l | 0})` : `rgb(${196 * l | 0},${32 * l | 0},${40 * l | 0})`;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y + 8); g.lineTo(x + 8, y); g.lineTo(x + 8, y + 3); g.lineTo(x + 4, y + 11); g.lineTo(x, y + 3); g.fill();
      }
    }
  });
  knitTex.wrapS = knitTex.wrapT = THREE.RepeatWrapping;
  knitTex.repeat.set(3, 2);
  return knitTex;
}
function knitMat() { return knitM || (knitM = new THREE.MeshStandardMaterial({ map: knitPattern(), bumpMap: knitPattern(), bumpScale: 0.6, roughness: 1, side: THREE.DoubleSide })); }
function knitCuffMat() { return cuffM || (cuffM = new THREE.MeshStandardMaterial({ color: '#c42830', map: cachedTex('cloth', 64), bumpMap: cachedTex('cloth', 64), bumpScale: 0.5, roughness: 1 })); }
function pomMat() { return pomM || (pomM = new THREE.MeshStandardMaterial({ color: '#f6f3ee', map: cachedTex('fur', 64), bumpMap: cachedTex('fur', 64), bumpScale: 0.8, roughness: 1 })); }
function mittenMat() { return mittM || (mittM = new THREE.MeshStandardMaterial({ color: '#c42830', map: cachedTex('cloth', 64), bumpMap: cachedTex('cloth', 64), bumpScale: 0.5, roughness: 1 })); }
function skiGeo() {
  if (skiG) return skiG;
  // gara, plāna slēpe ar uzliektu priekšgalu
  const g = new THREE.BoxGeometry(0.085, 0.022, 1.65, 1, 1, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z > 0.55) p.setY(i, p.getY(i) + (z - 0.55) * (z - 0.55) * 0.35); }
  g.computeVertexNormals();
  return (skiG = g);
}
function skiMat() { return skiM || (skiM = new THREE.MeshStandardMaterial({ color: '#d42a2a', roughness: 0.35, metalness: 0.1 })); }

// krekla raksti (nopērkamie krekli): audekla faktūra, ko ietin ap krekla rotācijas virsmu (v — augšup)
const topTex = new Map();
function topMat(id) {
  if (topTex.has(id)) return topTex.get(id);
  const t = canvasTexture(128, 128, (g, w, h) => {
    const fill = (c) => { g.fillStyle = c; g.fillRect(0, 0, w, h); };
    if (id === 'svitrains') { fill('#ffffff'); g.fillStyle = '#2f5fc0'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 8); }
    else if (id === 'rutains') {
      fill('#c83a2a'); g.fillStyle = 'rgba(20,20,20,0.45)';
      for (let i = 0; i < w; i += 32) { g.fillRect(i, 0, 12, h); g.fillRect(0, i + 8, w, 12); }
      g.fillStyle = 'rgba(242,208,64,0.8)'; for (let i = 0; i < w; i += 32) { g.fillRect(i + 5, 0, 2, h); g.fillRect(0, i + 13, w, 2); }
    } else if (id === 'futbola') { fill('#f2c12e'); g.fillStyle = '#1a3a8a'; g.fillRect(0, h * 0.18, w, h * 0.1); g.fillRect(0, h * 0.74, w, h * 0.06); }
    else if (id === 'zvaigznes') {
      fill('#2a2a6a'); g.fillStyle = '#ffd84a';
      const star = (x, y, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); };
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) star(i * 32 + 16 + (j % 2) * 16, j * 32 + 16, 7);
    } else if (id === 'latvija') { fill('#9e3039'); g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.42, w, h * 0.16); }
    else fill('#cccccc');
    // auduma graudainums
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (id === 'latvija' || id === 'futbola') t.repeat.set(3, 1); else t.repeat.set(4, 1);
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide });
  topTex.set(id, m);
  return m;
}

export function buildAnimal({ animal = 'lacis', fur = '#8b5a2b', shirt = '#d23b3b', hat = null, wear = null }) {
  const P = SPECIES[animal] || SPECIES.lacis;
  const topId = wear && wear.top;
  const shirtM = (opts) => (topId ? topMat(topId) : clothMat(shirt, opts));
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
  add(LATHE([[0, -0.15], [0.08, -0.14], [0.14, -0.1], [0.175, -0.03], [0.18, 0.03], [0.165, 0.1], [0.13, 0.15], [0, 0.16]]), fur, 0, 0.03, 0, body).scale.set(B, 1, 0.88 * B);
  const spine = new THREE.Group(); spine.position.y = 0.06; body.add(spine);
  const torso = add(LATHE([[0, -0.02], [0.13, 0.0], [0.15, 0.08], [0.163, 0.18], [0.17, 0.27], [0.162, 0.34], [0.13, 0.4], [0.085, 0.44], [0, 0.46]], 28), fur, 0, 0, 0, spine);
  torso.scale.set(B, 1, 0.82 * B);
  if (P.bird || animal === 'varde') add(S(0.12, 16, 12), light, 0, 0.24, 0.07 * B, spine).scale.set(0.9 * B, 1.25, 0.6);
  else add(S(0.06, 12, 10), light, 0, 0.4, 0.085, spine).scale.set(1.1, 0.9, 0.6);
  // apģērbs: veste/krekls vai šalle putniem
  if (!P.bird) {
    // krekls ar noapaļotiem pleciem (rotācijas virsma)
    const prof = [[0.19, -0.17], [0.19, -0.06], [0.184, 0.03], [0.166, 0.1], [0.135, 0.15], [0.1, 0.185], [0.075, 0.2]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const sh = add(new THREE.LatheGeometry(prof, 24), shirt, 0, 0.22, 0, spine, shirtM({ side: THREE.DoubleSide }));
    sh.scale.set(B, 1, 0.84 * B);
    const col = add(new THREE.TorusGeometry(0.075, 0.02, 8, 20), shirt, 0, 0.425, 0, spine, shirtM());
    col.rotation.x = Math.PI / 2; col.scale.set(B, 0.82 * B, 1);
  } else {
    const sc = add(new THREE.TorusGeometry(0.085, 0.03, 8, 20), shirt, 0, 0.42, 0, spine, shirtM());
    sc.rotation.x = Math.PI / 2;
    add(CAP(0.03, 0.12), shirt, 0.05, 0.33, 0.1, spine, shirtM()).rotation.z = 0.2;
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
  const irisM = mat('#3a2412', { roughness: 0.05, metalness: 0.1 });
  const glintM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  let eyeAt = null; // briļļu vieta (galvas koordinātēs)
  const eyes = (x, y, z, r = 0.02, brow = !P.bird && animal !== 'varde') => {
    eyeAt = { x: x + r * 0.1, y, z: z + r * 1.1, r };
    for (const s of [-1, 1]) {
      add(S(r * 1.08, 14, 12), '#000', s * x, y, z, head, eyeM).scale.set(1, 0.92, 0.8);
      add(S(r * 0.72, 12, 10), '#3a2412', s * (x + r * 0.12), y, z + r * 0.36, head, irisM).scale.set(1, 1, 0.6);
      add(S(r * 0.42, 10, 8), '#000', s * (x + r * 0.14), y, z + r * 0.62, head, eyeM).scale.set(1, 1, 0.5);
      add(S(r * 0.2, 6, 6), '#fff', s * (x + r * 0.05) , y + r * 0.35, z + r * 0.85, head, glintM);
      if (brow) { const b = add(S(r * 1.5, 12, 8), fur, s * x, y + r * 1.05, z - r * 0.35, head); b.scale.set(1.2, 0.36, 0.8); b.rotation.z = s * 0.12; }
    }
  };
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
      ears(S(0.03, 10, 8), darken(fur, 0.45), 0.107, 0.112, 0.008, 0, 0, [1, 1, 0.3]);
      for (const sd of [-1, 1]) add(S(0.05, 12, 10), fur, sd * 0.1, -0.05, 0.06, head).scale.set(1, 0.8, 0.9);
      tail = add(S(0.04), fur, 0, 0, -0.02, tailRoot);
      break;
    case 'lapsa': {
      const m = add(new THREE.ConeGeometry(0.07, 0.2, 14), fur, 0, -0.04, 0.2, head); m.rotation.x = Math.PI / 2 + 0.1;
      add(new THREE.ConeGeometry(0.05, 0.16, 12), light, 0, -0.065, 0.19, head).rotation.x = Math.PI / 2 + 0.25;
      nose(0, -0.035, 0.3, 0.018); eyes(0.058, 0.03, 0.12, 0.017);
      ears(new THREE.ConeGeometry(0.055, 0.14, 12), fur, 0.085, 0.15, -0.01, 0.2, -0.1, [1, 1, 0.45]);
      ears(new THREE.ConeGeometry(0.025, 0.05, 8), '#2a2420', 0.098, 0.205, -0.01, 0.2, -0.1, [1, 1, 0.45]);
      ears(new THREE.ConeGeometry(0.035, 0.09, 12), '#f4efe6', 0.086, 0.14, 0.008, 0.2, -0.1, [1, 1, 0.3]);
      for (const sd of [-1, 1]) { const ch = add(new THREE.ConeGeometry(0.05, 0.12, 12), '#f4efe6', sd * 0.1, -0.06, 0.04, head); ch.rotation.z = sd * 1.9; ch.scale.set(1, 1, 0.6); }
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
      ears(new THREE.ConeGeometry(0.05, 0.1, 16), fur, 0.085, 0.13, 0, 0.3, -0.1, [1, 1, 0.5]);
      ears(new THREE.ConeGeometry(0.032, 0.07, 12), '#d8a0a0', 0.086, 0.125, 0.012, 0.3, -0.1, [1, 1, 0.3]);
      for (const sd of [-1, 1]) add(S(0.045, 12, 10), light, sd * 0.06, -0.06, 0.09, head).scale.set(1.1, 0.75, 0.8);
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
      for (const sd of [-1, 1]) add(S(0.04, 12, 10), lighten(fur, 0.2), sd * 0.05, -0.08, 0.12, head).scale.set(1, 0.7, 1);
      tail = new THREE.Group(); { const t = add(LIMB(0.03, 0.22), fur, 0, 0, 0, tail); t.rotation.x = -2.4; } tailRoot.add(tail);
      break;
    case 'varde': {
      for (const s of [-1, 1]) {
        add(S(0.055, 14, 12), fur, s * 0.1, 0.09, 0.07, head);
        add(S(0.035, 12, 10), '#e8c84a', s * 0.11, 0.11, 0.105, head, mat('#e8c84a', { roughness: 0.2 }));
        add(S(0.02, 10, 8), '#000', s * 0.115, 0.115, 0.13, head, eyeM);
      }
      eyeAt = { x: 0.112, y: 0.112, z: 0.15, r: 0.035 };
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
      const rb = Math.sqrt(B);
      add(TL(0.06 * rb, 0.047 * rb, 0.2, 0.18), fur, 0, 0, 0, sh);
      const sl = add(LATHE([[0.07 * rb, 0.03], [0.072 * rb, -0.02], [0.068 * rb, -0.09], [0.066 * rb, -0.1]], 18), shirt, 0, 0, 0, sh, shirtM({ side: THREE.DoubleSide }));
      sl.rotation.z = s * 0.05;
      el.position.y = -0.2; sh.add(el);
      add(TL(0.048 * rb, 0.036 * rb, 0.17, 0.2), P.sock || fur, 0, 0, 0, el);
      // ķepa ar pirkstiem
      const pc = P.sock || (animal === 'varde' ? fur : lighten(fur, 0.12));
      add(S(0.044, 14, 10), pc, 0, -0.205, 0.008, el).scale.set(0.95, 1.05, 0.72);
      for (let f = 0; f < 4; f++) add(S(0.016, 8, 6), pc, (f - 1.5) * 0.019, -0.245, 0.016, el).scale.set(1, 1.3, 1);
      add(S(0.016, 8, 6), pc, -s * 0.035, -0.215, 0.03, el).scale.set(1, 1.4, 1);
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
    else add(TL(0.1 * Math.sqrt(B), 0.068 * Math.sqrt(B), 0.3, 0.2), fur, 0, 0, 0, hip);
    const knee = new THREE.Group(); knee.position.y = -0.3; hip.add(knee);
    if (P.bird) add(LIMB(0.025, 0.21), legColor, 0, 0, 0, knee, mat(legColor, { roughness: 0.5 }));
    else add(TL(0.068 * Math.sqrt(B), 0.045 * Math.sqrt(B), 0.32, 0.22), P.sock || legColor, 0, 0, 0, knee);
    const fc = P.sock || (P.bird ? legColor : darken(fur, 0.15));
    const foot = add(S(0.06, 16, 12), fc, 0, -0.35, 0.05, knee);
    foot.scale.set(P.bird ? 1.4 : 1, 0.5, (P.feet || 1) * 1.7);
    if (P.bird) {
      foot.material = mat(legColor, { roughness: 0.5 });
      for (const a of [-0.5, 0, 0.5]) { const t = add(LIMB(0.012, 0.08), legColor, Math.sin(a) * 0.03, -0.37, 0.1, knee, mat(legColor, { roughness: 0.5 })); t.rotation.set(-1.45, a, 0); }
    } else {
      for (let f = 0; f < 3; f++) add(S(0.024, 10, 8), fc, (f - 1) * 0.03, -0.365, 0.05 + 0.095 * (P.feet || 1), knee).scale.set(1, 0.75, 1.15);
    }
    legs.push({ hip, knee, foot });
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
    // drēbes, ko var uzvilkt bez tēla pārbūves: brilles, kakls, mugura, apavi (krekls — buildAnimal wear.top)
    setWear(w) {
      const key = w ? ['glasses', 'neck', 'back', 'feet'].map((k) => w[k] || '').join('|') : '';
      if (this.wearKey === key) return;
      this.wearKey = key;
      for (const o of this.wearParts || []) o.removeFromParent();
      this.wearParts = []; this.wings = null;
      if (!w) return;
      const put = (g, parent) => { if (!g) return; g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); optimizeRig(g); parent.add(g); this.wearParts.push(g); return g; };
      if (w.glasses && eyeAt) put(buildGlasses(w.glasses, eyeAt), head);
      if (w.neck) { const g = put(buildNeckwear(w.neck, B, !!P.bird), spine); if (g) g.userData.neck = true; }
      if (w.back) { const g = put(buildBackwear(w.back, B), spine); if (g && w.back === 'sparni') this.wings = g.userData.wings; }
      if (w.feet && !P.bird) for (const L of legs) put(buildShoe(w.feet, B, P.feet || 1, L.foot.position), L.knee);
      this.applyWearVis();
    },
    // ziemā kakla lietas paslēptas (šalle)
    applyWearVis() { for (const o of this.wearParts || []) if (o.userData.neck) o.visible = !this.winter; },
    // lieta rokās (rotājums, ko pārnes): nest — rokas priekšā
    setCarry(obj) {
      if (this.carryObj) { this.carryObj.removeFromParent(); this.carryObj = null; }
      if (!obj) return;
      const bb = new THREE.Box3().setFromObject(obj), sz = bb.getSize(new THREE.Vector3());
      const k = Math.min(1, 0.55 / Math.max(sz.x, sz.z, sz.y * 0.6, 0.01));
      obj.scale.multiplyScalar(k);
      obj.position.set(0, 0.12 - bb.min.y * k, 0.3 * B + sz.z * k * 0.5);
      spine.add(obj);
      this.carryObj = obj;
    },
    setHat(id) {
      this.hatId = id;
      while (hatHolder.children.length) hatHolder.remove(hatHolder.children[0]);
      const h = this.winter ? buildHat('ziemas') : id ? buildHat(id) : null; // ziemā vienmēr adīta cepure
      if (h) { h.traverse((o) => { if (o.isMesh) o.castShadow = true; }); hatHolder.add(h); }
    },
    // ziemas drēbes: adīta cepure, dūraiņi un šalle ar plīvojošiem galiem
    setWinter(on) {
      if (!!this.winter === !!on) return;
      this.winter = !!on;
      if (on) {
        const W = this.winterParts = [];
        const knit = knitMat();
        // šalle ap kaklu
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.036, 10, 22), knit);
        ring.rotation.x = Math.PI / 2; ring.scale.set(B * 1.05, 0.86 * B, 1.15); ring.position.set(0, 0.43, 0.005);
        ring.castShadow = true; spine.add(ring); W.push(ring);
        // divi gali uz muguras: katrs ar 2 posmiem (ejot un slēpojot plīvo aiz muguras)
        this.scarf = [];
        for (const [x, len] of [[0.05, 0.22], [-0.035, 0.17]]) {
          const p1 = new THREE.Group(); p1.position.set(x * B, 0.42, -0.1 * B); spine.add(p1); W.push(p1);
          const g1 = new THREE.BoxGeometry(0.075, len, 0.024); g1.translate(0, -len / 2, 0);
          const s1 = new THREE.Mesh(g1, knit); s1.castShadow = true; p1.add(s1);
          const p2 = new THREE.Group(); p2.position.y = -len; p1.add(p2);
          const g2 = new THREE.BoxGeometry(0.072, len * 0.9, 0.022); g2.translate(0, -len * 0.45, 0);
          const s2 = new THREE.Mesh(g2, knit); s2.castShadow = true; p2.add(s2);
          // bārkstis
          for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.035, 0.008), knit); f.position.set(-0.027 + i * 0.018, -len * 0.9 - 0.016, 0); p2.add(f); }
          this.scarf.push({ p1, p2, a: 0.15, v: 0, b: 0, bv: 0, z: 0 });
        }
        // dūraiņi
        for (const a of arms) {
          if (P.bird) continue;
          const mit = new THREE.Mesh(S(0.056, 14, 10), mittenMat()); mit.scale.set(1, 1.15, 0.85); mit.position.set(0, -0.215, 0.01); mit.castShadow = true;
          const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), knit); cuff.position.y = -0.16;
          a.el.add(mit, cuff); W.push(mit, cuff);
        }
        this.lastPos = null;
      } else {
        for (const o of this.winterParts || []) o.removeFromParent();
        this.winterParts = []; this.scarf = null;
      }
      this.setHat(this.hatId);
      this.applyWearVis();
    },
    // slēpes zem kājām un nūjas rokās
    setSkis(on) {
      if (!!this.skis === !!on) return;
      if (on) {
        const g = new THREE.Group();
        for (const s of [-1, 1]) {
          const sk = new THREE.Mesh(skiGeo(), skiMat()); sk.position.set(s * 0.1 * B, 0.015, 0.12); sk.castShadow = true; sk.userData.side = s; g.add(sk);
        }
        root.add(g);
        const poles = arms.map((a) => {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.0, 6).translate(0, -0.5, 0), mat('#2a2d33', { roughness: 0.4, metalness: 0.6 }));
          p.position.set(0, -0.21, 0.02); p.rotation.x = 0.45;
          const basket = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 4, 10), mat('#222')); basket.rotation.x = Math.PI / 2; basket.position.y = -0.9; p.add(basket);
          a.el.add(p); return p;
        });
        this.skis = { g, poles };
      } else {
        this.skis.g.removeFromParent();
        for (const p of this.skis.poles) p.removeFromParent();
        this.skis = null;
      }
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
      } else if (state === 'ski') {
        // slēpošana: pietupienā, rokas ar nūjām priekšā. Ķermenis paliek gandrīz vertikāls arī stāvā nogāzē
        // (skiPose.down — cik slēpes noliektas uz leju), ātrumā — dziļāks pietupiens, bremzējot — arkls
        const P = this.skiPose || { down: 0, v: 0, brake: 0, air: false, push: false };
        const s = Math.sin(this.t * 3) * 0.04, tuck = Math.min(1, P.v / 22);
        const knee = 0.8 + tuck * 0.55 + P.brake * 0.15;
        T.hip = [-0.55 - tuck * 0.35 + s, -0.55 - tuck * 0.35 - s]; T.knee = [knee, knee];
        T.bY = HIP - 0.1 - tuck * 0.1; T.spX = 0.38 + tuck * 0.3 - P.down * 0.45;
        T.sh = [-0.55 - tuck * 0.3, -0.55 - tuck * 0.3]; T.shZ = [-0.28 + tuck * 0.15, 0.28 - tuck * 0.15]; T.el = [-0.55 - tuck * 0.5, -0.55 - tuck * 0.5]; T.hX = -0.3 - tuck * 0.2 + P.down * 0.4;
        if (P.push) { const ph = Math.sin(this.t * 6); T.sh = [-0.9 + ph * 0.7, -0.9 + ph * 0.7]; T.spX += 0.15; }
        if (P.air) { T.shZ = [-0.75, 0.75]; T.sh = [-0.3, -0.3]; T.knee = [1.1, 1.1]; }
        if (this.skis) for (const m of this.skis.g.children) {
          m.rotation.y = lerp(m.rotation.y, -m.userData.side * P.brake * 0.28, 1 - Math.exp(-dt * 10));
          m.position.x = m.userData.side * (0.1 + P.brake * 0.08) * B;
        }
        k = 1 - Math.exp(-dt * 12);
      } else if (state === 'lift') {
        // sēž pacēlāja krēslā
        T.hip = [-1.45, -1.45]; T.knee = [1.35, 1.35]; T.sh = [-0.4, -0.4]; T.shZ = [-0.2, 0.2]; T.el = [-0.9, -0.9];
        T.bY = HIP - 0.42; T.spX = 0.0; T.hY = Math.sin(this.t * 0.4) * 0.3;
        k = 1 - Math.exp(-dt * 20);
      } else if (state === 'throw') {
        // sniega pikas mešana ar labo roku
        T.hip = [-0.25, 0.2]; T.knee = [0.35, 0.1]; T.bY = HIP - 0.04; T.spX = 0.18; T.spY = -0.35;
        T.sh = [-0.3, -2.6]; T.shZ = [-0.3, 0.2]; T.el = [-0.3, -0.25];
        k = 1 - Math.exp(-dt * 30);
      } else if (state === 'bike') {
        // brauc ar velosipēdu: min pedāļus (ātrums → kāju ātrums), rokas uz stūres, nedaudz noliecies uz priekšu
        this.phase += dt * Math.min(14, speed * 1.5);
        for (let i = 0; i < 2; i++) {
          const ph = this.phase + i * Math.PI;
          T.hip[i] = -1.05 + Math.sin(ph) * 0.42;
          T.knee[i] = 1.25 + Math.cos(ph) * 0.42;
        }
        T.sh = [-1.05, -1.05]; T.shZ = [0.12, -0.12]; T.el = [-0.3, -0.3];
        T.bY = HIP - 0.16; T.spX = 0.32; T.hX = -0.25;
        k = 1 - Math.exp(-dt * 25);
      } else if (state === 'fish') {
        // tur makšķeri ar abām rokām priekšā
        T.hip = [0, 0]; T.knee = [0.08, 0.08]; T.bY = HIP; T.spX = 0.06;
        T.sh = [-0.85, -0.85]; T.shZ = [0.32, -0.32]; T.el = [-0.55, -0.55];
        T.hY = Math.sin(this.t * 0.5) * 0.1;
      } else {
        // stāvēšana: elpošana un apkārtnes vērošana
        T.hip = [0, 0]; T.knee = [0.05, 0.05]; T.sh = [0.03, 0.03]; T.el = [-0.18, -0.18];
        T.bY = HIP + Math.sin(this.t * 1.8) * 0.004; T.spX = 0.02 + Math.sin(this.t * 1.8) * 0.01;
        T.hY = Math.sin(this.t * 0.35) * 0.35 * Math.max(0, Math.sin(this.t * 0.13));
      }
      if (this.carryObj && state !== 'sit' && state !== 'bike') { T.sh = [-1.0, -1.0]; T.shZ = [0.34, -0.34]; T.el = [-0.85, -0.85]; }
      // stumj ratiņus: abas rokas uz priekšu pie rokturiem, nedaudz noliecies
      if (this.pushing && (state === 'walk' || state === 'idle')) { T.sh = [-1.15, -1.15]; T.shZ = [0.2, -0.2]; T.el = [-0.25, -0.25]; T.spX += 0.12; T.spY *= 0.4; }
      if (this.wings) { const f = Math.sin(this.t * (state === 'run' || state === 'jump' ? 9 : 2.2)) * 0.35; this.wings[0].rotation.y = 0.35 + f; this.wings[1].rotation.y = -0.35 - f; }
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
      if (this.scarf) this.animScarf(dt);
    },
    // šalles gali: atsperes, ko velk atpakaļ ātrums un sāņus pagriezieni
    animScarf(dt) {
      const p = this.root.getWorldPosition(this._wp || (this._wp = new THREE.Vector3()));
      const yaw = this.root.rotation.y;
      let sp = 0, turn = 0, up = 0;
      if (this.lastPos && dt > 0) {
        sp = Math.min(30, Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z) / dt);
        up = (p.y - this.lastPos.y) / dt;
        let dy = yaw - this.lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        turn = dy / dt;
      }
      this.lastPos = (this.lastPos || new THREE.Vector3()).copy(p); this.lastYaw = yaw;
      const st = Math.min(dt, 0.05);
      for (let i = 0; i < this.scarf.length; i++) {
        const s = this.scarf[i];
        // ātrumā gali paceļas atpakaļ pār plecu un plivinās
        const tgt = 0.12 + Math.min(1.45, sp * 0.085) + Math.max(-0.4, Math.min(0.5, -up * 0.05));
        const flut = sp > 2 ? Math.sin(this.t * (13 + i * 3) + i) * Math.min(0.35, sp * 0.02) : 0;
        s.v += ((tgt + flut) - s.a) * 60 * st - s.v * 7 * st;
        s.a += s.v * st;
        const side = Math.max(-0.6, Math.min(0.6, -turn * 0.12));
        s.bv += (side - s.b) * 40 * st - s.bv * 6 * st;
        s.b += s.bv * st;
        s.p1.rotation.set(s.a, 0, s.b);
        s.p2.rotation.set(s.a * 0.6 + flut * 0.8, 0, s.b * 0.5);
      }
    },
  };
  // animētās daļas (galva, aste u.c.) nesapludina
  const animated = new Set();
  for (const v of [head, spine, body, tail, ...(legs || []), ...(arms || [])]) {
    if (!v) continue;
    if (v.isMesh) animated.add(v);
    else if (!v.isObject3D) for (const x of Object.values(v)) if (x && x.isMesh) animated.add(x);
  }
  optimizeRig(root, animated, { bake: true });
  av.setHat(hat);
  av.setWear(wear);
  return av;
}

// ---------------- drēbju modeļi ----------------
function buildGlasses(id, E) {
  const g = new THREE.Group();
  const frameM = mat(id === 'saulesbrilles' ? '#151518' : id === 'sirds' ? '#e0307a' : '#6a4a2a', { roughness: 0.4, metalness: 0.2 });
  const lensM = id === 'saulesbrilles'
    ? new THREE.MeshStandardMaterial({ color: '#10141c', roughness: 0.08, metalness: 0.6 })
    : new THREE.MeshStandardMaterial({ color: id === 'sirds' ? '#ff6aa8' : '#cfe8f8', roughness: 0.05, transparent: true, opacity: id === 'sirds' ? 0.75 : 0.3, depthWrite: false });
  const r = Math.max(0.03, E.r * 1.7);
  for (const s of [-1, 1]) {
    let lens, rim;
    if (id === 'sirds') {
      const sh = new THREE.Shape(); const k = r * 1.15;
      sh.moveTo(0, -k * 0.9); sh.bezierCurveTo(-k * 1.6, 0, -k * 0.8, k * 1.1, 0, k * 0.45); sh.bezierCurveTo(k * 0.8, k * 1.1, k * 1.6, 0, 0, -k * 0.9);
      lens = new THREE.Mesh(new THREE.ShapeGeometry(sh, 10), lensM);
      rim = new THREE.Mesh(new THREE.ShapeGeometry(sh, 10).scale(1.18, 1.18, 1), frameM); rim.position.z = -0.002;
    } else if (id === 'saulesbrilles') {
      lens = new THREE.Mesh(new THREE.CircleGeometry(r, 18).scale(1.25, 0.85, 1), lensM);
      rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 6, 20).scale(1.25, 0.85, 1), frameM);
    } else {
      lens = new THREE.Mesh(new THREE.CircleGeometry(r, 18), lensM);
      rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 6, 20), frameM);
    }
    const lx = s * Math.max(E.x, r * 1.05);
    lens.position.set(lx, E.y, E.z + 0.004); rim.position.set(lx, E.y, E.z + 0.004 + (rim.position.z || 0));
    g.add(lens, rim);
    // kājiņa uz auss pusi
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.13), frameM);
    arm.position.set(s * (Math.abs(lx) + r * 1.05), E.y + 0.005, E.z - 0.06); g.add(arm);
  }
  const br = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, Math.max(0.01, 2 * Math.max(E.x, r * 1.05) - 2 * r), 6), frameM);
  br.rotation.z = Math.PI / 2; br.position.set(0, E.y + r * 0.3, E.z + 0.006); g.add(br);
  return g;
}

function buildNeckwear(id, B, bird) {
  const g = new THREE.Group();
  const zf = 0.083 * B + 0.012, y = 0.405;
  if (id === 'taurenitis') {
    const m = mat('#c8102a', { roughness: 0.55 });
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), m); w.rotation.z = s * Math.PI / 2; w.scale.set(1, 1, 0.45); w.position.set(s * 0.035, y, zf); g.add(w); }
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), m); k.position.set(0, y, zf + 0.005); g.add(k);
  } else if (id === 'kaklasaite') {
    const m = mat('#2a5ac0', { roughness: 0.5 });
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.02), m); knot.position.set(0, y, zf); g.add(knot);
    const sh = new THREE.Shape(); sh.moveTo(-0.017, 0); sh.lineTo(0.017, 0); sh.lineTo(0.03, -0.16); sh.lineTo(0, -0.19); sh.lineTo(-0.03, -0.16); sh.lineTo(-0.017, 0);
    const t = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false }), m);
    t.position.set(0, y - 0.015, 0.152 * B + 0.004); t.rotation.x = -0.12; g.add(t);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.01), mat('#f2c12e')); st.position.set(0, y - 0.09, 0.158 * B + 0.006); st.rotation.z = 0.5; g.add(st);
  } else if (id === 'krelles') {
    const m = new THREE.MeshStandardMaterial({ color: '#f8f4ea', roughness: 0.25, metalness: 0.1 });
    const n = 18, R = 0.095 * B;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, p = new THREE.Mesh(new THREE.SphereGeometry(i === n / 4 ? 0.017 : 0.012, 8, 6), m);
      p.position.set(Math.cos(a) * R, y - 0.025 + Math.sin(a) * 0.03, Math.sin(a) * R * 0.86); g.add(p);
    }
  } else if (id === 'medala') {
    const rm = mat('#2a5ac0', { roughness: 0.6 }), rm2 = mat('#c8102a', { roughness: 0.6 });
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.13, 0.006), s < 0 ? rm : rm2); r.position.set(s * 0.03, y - 0.05, 0.14 * B + 0.008); r.rotation.z = -s * 0.35; r.rotation.x = -0.1; g.add(r); }
    const gold = new THREE.MeshStandardMaterial({ color: '#e6b632', metalness: 1, roughness: 0.25 });
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 18), gold); d.rotation.x = Math.PI / 2; d.position.set(0, y - 0.13, 0.16 * B + 0.012); g.add(d);
  } else return null;
  if (bird) g.position.y += 0.02;
  return g;
}

function buildBackwear(id, B) {
  const g = new THREE.Group();
  const zb = -0.155 * B;
  if (id === 'mugursoma') {
    const m = mat('#3a9a4a', { roughness: 0.8, map: null }), dk = mat('#1f5a2a', { roughness: 0.8 });
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.26 * B, 0.3, 0.12, 2, 2, 2), m); bag.position.set(0, 0.22, zb - 0.06); g.add(bag);
    const pk = new THREE.Mesh(new THREE.BoxGeometry(0.2 * B, 0.12, 0.05), dk); pk.position.set(0, 0.14, zb - 0.135); g.add(pk);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.26 * B, 10, 1, false, 0, Math.PI), m); lid.rotation.z = Math.PI / 2; lid.position.set(0, 0.37, zb - 0.06); g.add(lid);
    for (const s of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 5, 12, Math.PI), dk);
      st.rotation.y = Math.PI / 2; st.position.set(s * 0.08 * B, 0.3, 0.0); st.scale.set(1, 1.1, 1.25 * B); g.add(st);
    }
  } else if (id === 'apmetnis') {
    const m = new THREE.MeshStandardMaterial({ color: '#d02a2a', roughness: 0.75, side: THREE.DoubleSide });
    const geo = new THREE.CylinderGeometry(0.17 * B, 0.3 * B, 0.78, 16, 4, true, Math.PI * 0.62, Math.PI * 0.76);
    geo.translate(0, -0.39, 0);
    const c = new THREE.Mesh(geo, m); c.position.set(0, 0.43, 0.02); c.rotation.x = 0.1; c.scale.z = 0.9; g.add(c);
    const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.085 * B, 0.014, 6, 18, Math.PI), mat('#f2c12e', { metalness: 0.8, roughness: 0.3 }));
    clasp.rotation.x = Math.PI / 2; clasp.position.y = 0.43; clasp.rotation.z = Math.PI; g.add(clasp);
  } else if (id === 'sparni') {
    const m = new THREE.MeshStandardMaterial({ color: '#8ac8f8', roughness: 0.3, transparent: true, opacity: 0.8, side: THREE.DoubleSide, emissive: '#2a4a6a', emissiveIntensity: 0.3 });
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.bezierCurveTo(0.05, 0.25, 0.32, 0.3, 0.32, 0.1); sh.bezierCurveTo(0.32, 0.0, 0.2, -0.02, 0.06, -0.01);
    sh.bezierCurveTo(0.22, -0.05, 0.25, -0.2, 0.15, -0.24); sh.bezierCurveTo(0.08, -0.26, 0.02, -0.12, 0, 0);
    const geo = new THREE.ShapeGeometry(sh, 12);
    const wings = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * 0.03, 0.3, zb - 0.01);
      const w = new THREE.Mesh(geo, m); w.scale.set(s, 1, 1); piv.add(w);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), mat('#f2c12e', { side: THREE.DoubleSide })); dot.position.set(s * 0.2, 0.12, 0.002); piv.add(dot);
      g.add(piv); wings.push(piv);
    }
    g.userData.wings = wings;
  } else return null;
  return g;
}

function buildShoe(id, B, feet, fp) {
  const g = new THREE.Group();
  const sq = Math.sqrt(B);
  if (id === 'zabaki') {
    const m = mat('#f2c62e', { roughness: 0.35 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.062 * sq, 0.058 * sq, 0.22, 12, 1, true), m); shaft.position.set(0, fp.y + 0.12, 0); g.add(shaft);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.062 * sq, 0.008, 5, 14), m); rim.rotation.x = Math.PI / 2; rim.position.y = fp.y + 0.23; g.add(rim);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 10), m); toe.position.copy(fp); toe.position.z += 0.012; toe.scale.set(1.05, 0.62, feet * 1.75); g.add(toe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.21 * feet), mat('#2a2a2a', { roughness: 0.9 })); sole.position.set(0, fp.y - 0.03, fp.z + 0.02); g.add(sole);
  } else if (id === 'kedas') {
    const m = mat('#f4f4f4', { roughness: 0.6 });
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 10), m); toe.position.copy(fp); toe.position.z += 0.01; toe.scale.set(1.05, 0.62, feet * 1.75); g.add(toe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.025, 0.22 * feet), mat('#e83a3a', { roughness: 0.7 })); sole.position.set(0, fp.y - 0.028, fp.z + 0.02); g.add(sole);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.016, 0.06), mat('#2a5ac0')); st.position.set(0, fp.y + 0.02, fp.z + 0.02); st.rotation.x = 0.3; g.add(st);
  } else return null;
  return g;
}

const texCache = new Map();
function cachedTex(kind, size) { const k = kind + size; if (!texCache.has(k)) texCache.set(k, noiseTexture(kind, size)); return texCache.get(k); }
// cepuru faktūras
let strawTex = null;
function straw() {
  if (strawTex) return strawTex;
  strawTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#d9bd6a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
      const o = ((x + y) / 8) % 2;
      const l = 0.85 + Math.random() * 0.25;
      g.fillStyle = `rgb(${232 * l | 0},${202 * l | 0},${120 * l | 0})`;
      if (o) g.fillRect(x, y + 1, 8, 6); else g.fillRect(x + 1, y, 6, 8);
      g.fillStyle = 'rgba(90,60,20,0.35)'; g.fillRect(x, y + 7, 8, 1); g.fillRect(x + 7, y, 1, 8);
    }
  });
  strawTex.wrapS = strawTex.wrapT = THREE.RepeatWrapping; strawTex.repeat.set(8, 2);
  return strawTex;
}
// lapas forma (ozola — ar robiem)
function leafShape(oak) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  if (oak) {
    const pts = [[0.03, 0.02], [0.05, 0.05], [0.03, 0.07], [0.055, 0.1], [0.03, 0.12], [0.045, 0.15], [0.0, 0.18]];
    for (const [x, y] of pts) sh.lineTo(x, y);
    for (let i = pts.length - 2; i >= 0; i--) sh.lineTo(-pts[i][0], pts[i][1]);
  } else {
    sh.quadraticCurveTo(0.05, 0.06, 0, 0.14); sh.quadraticCurveTo(-0.05, 0.06, 0, 0);
  }
  return new THREE.ShapeGeometry(sh, 4);
}
export function buildHat(id) {
  const g = new THREE.Group();
  const M = (c, o = {}) => mat(c, o);
  switch (id) {
    case 'salmu': { // pīta salmu cepure ar izliektu malu un lenti
      const sm = new THREE.MeshStandardMaterial({ color: '#f2dc9a', map: straw(), roughness: 0.95, side: THREE.DoubleSide });
      const prof = [[0.52, -0.035], [0.46, -0.01], [0.36, 0.005], [0.27, 0.01], [0.255, 0.05], [0.25, 0.16], [0.235, 0.22], [0.18, 0.25], [0.0, 0.26]];
      g.add(new THREE.Mesh(LATHE(prof, 36), sm));
      g.add(new THREE.Mesh(LATHE([[0.258, 0.03], [0.256, 0.09]], 36), M('#7a2a22', { roughness: 0.6, side: THREE.DoubleSide })));
      const bow = new THREE.Mesh(S(0.035, 10, 8), M('#7a2a22', { roughness: 0.6 })); bow.position.set(0.255, 0.06, 0.05); bow.scale.set(0.5, 1, 1.6); g.add(bow);
      break;
    }
    case 'vainags': { // Jāņu ziedu vainags: zāle, lapas un pļavas ziedi
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 8, 32), M('#4a7a2a', { roughness: 0.9 })); t.rotation.x = Math.PI / 2; g.add(t);
      const lg = leafShape(false), lm = M('#4f8a30', { side: THREE.DoubleSide, roughness: 0.8 });
      for (let i = 0; i < 26; i++) {
        const a = i / 26 * Math.PI * 2, l = new THREE.Mesh(lg, lm);
        l.position.set(Math.cos(a) * 0.27, 0.01, Math.sin(a) * 0.27); l.rotation.set(-0.9, -a + Math.PI / 2 + (i % 2 ? 0.6 : -0.6), 0); g.add(l);
      }
      const cols = ['#ffffff', '#ffe03a', '#4a6ae0', '#e8302a', '#b06ae0', '#ffffff'];
      const petal = new THREE.SphereGeometry(0.022, 8, 6);
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + 0.2, fl = new THREE.Group();
        const pm = M(cols[i % cols.length], { roughness: 0.7 });
        for (let k = 0; k < 6; k++) { const pe = new THREE.Mesh(petal, pm); const b = k / 6 * Math.PI * 2; pe.position.set(Math.cos(b) * 0.026, 0, Math.sin(b) * 0.026); pe.scale.set(1.2, 0.3, 0.7); pe.rotation.y = -b; fl.add(pe); }
        const cn = new THREE.Mesh(S(0.014, 8, 6), M('#f2b81a')); cn.position.y = 0.006; fl.add(cn);
        fl.position.set(Math.cos(a) * 0.27, 0.05, Math.sin(a) * 0.27); fl.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); g.add(fl);
      }
      break;
    }
    case 'ozols': { // ozollapu vainags ar zīlēm
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 32), M('#4a3a22')); t.rotation.x = Math.PI / 2; g.add(t);
      const og = leafShape(true);
      const cols = ['#2f6b24', '#3f7a2a', '#356f22'];
      for (let i = 0; i < 22; i++) {
        const a = i / 22 * Math.PI * 2, l = new THREE.Mesh(og, M(cols[i % 3], { side: THREE.DoubleSide, roughness: 0.75 }));
        l.position.set(Math.cos(a) * 0.28, 0.0, Math.sin(a) * 0.28); l.rotation.set(-1.0, -a + Math.PI / 2 + (i % 2 ? 0.7 : -0.7), 0); l.scale.setScalar(1.15); g.add(l);
      }
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + 0.4;
        const ac = new THREE.Mesh(S(0.025, 10, 8), M('#8a6a2a', { roughness: 0.5 })); ac.scale.set(1, 1.4, 1); ac.position.set(Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3); g.add(ac);
        const cup = new THREE.Mesh(new THREE.SphereGeometry(0.027, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M('#5a4a2a', { roughness: 1 })); cup.position.set(Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3); g.add(cup);
      }
      break;
    }
    case 'ziemas': { // adīta ziemas cepure ar atloku un bumbuli
      const knit = knitMat();
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), knit);
      cap.scale.set(1.04, 1.25, 1.04); cap.position.y = -0.08; g.add(cap);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.065, 10, 26), knitCuffMat());
      cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.08; cuff.scale.set(1.04, 1.04, 1.2); g.add(cuff);
      const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 2), pomMat()); pom.position.y = 0.3; g.add(pom);
      break;
    }
    case 'cilindrs': { // filca cilindrs ar zīda lenti
      const fm = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.45, side: THREE.DoubleSide });
      g.add(new THREE.Mesh(LATHE([[0.4, 0.03], [0.38, 0.0], [0.3, 0.0], [0.24, 0.01], [0.235, 0.2], [0.245, 0.42], [0.25, 0.46], [0.24, 0.47], [0, 0.47]], 36), fm));
      g.add(new THREE.Mesh(LATHE([[0.239, 0.02], [0.24, 0.1]], 36), M('#7a1515', { roughness: 0.3, side: THREE.DoubleSide })));
      break;
    }
    case 'kronis': { // zelta kronis ar zobiem un dārgakmeņiem
      const gold = new THREE.MeshStandardMaterial({ color: '#e6b632', metalness: 1, roughness: 0.28, side: THREE.DoubleSide });
      const sh = new THREE.Shape();
      const N = 8, W = 2 * Math.PI * 0.24;
      sh.moveTo(0, 0);
      for (let i = 0; i < N; i++) { const x0 = i / N * W; sh.lineTo(x0, 0.1); sh.lineTo(x0 + W / N / 2, 0.2); sh.lineTo(x0 + W / N, 0.1); }
      sh.lineTo(W, 0); sh.lineTo(0, 0);
      const bg = new THREE.ShapeGeometry(sh, 2);
      const p = bg.attributes.position;
      for (let i = 0; i < p.count; i++) { const a = p.getX(i) / 0.24; const y = p.getY(i); p.setXYZ(i, Math.cos(a) * 0.24, y, Math.sin(a) * 0.24); }
      bg.computeVertexNormals();
      g.add(new THREE.Mesh(bg, gold));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.242, 0.012, 6, 40), gold); rim.rotation.x = Math.PI / 2; g.add(rim);
      for (let i = 0; i < N; i++) {
        const a = (i + 0.5) / N * Math.PI * 2;
        const ball = new THREE.Mesh(S(0.016, 8, 6), gold); ball.position.set(Math.cos(a) * 0.24, 0.205, Math.sin(a) * 0.24); g.add(ball);
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), new THREE.MeshStandardMaterial({ color: ['#c0102a', '#1a4ad0', '#10a050'][i % 3], metalness: 0.2, roughness: 0.05 }));
        gem.position.set(Math.cos(a) * 0.248, 0.05, Math.sin(a) * 0.248); gem.rotation.y = -a; gem.scale.set(1, 1, 0.5); g.add(gem);
      }
      break;
    }
    case 'nagene': { // beisbola cepure ar nagu uz priekšu
      const m = M('#2a5ad0', { roughness: 0.7, side: THREE.DoubleSide });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), m); cap.scale.set(1, 0.85, 1.05); cap.position.y = -0.04; g.add(cap);
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 20, 1, false, -Math.PI / 2, Math.PI), M('#1a3a98', { roughness: 0.6 }));
      visor.scale.set(1, 1, 0.75); visor.position.set(0, -0.035, 0.2); visor.rotation.x = 0.12; g.add(visor);
      const btn = new THREE.Mesh(S(0.025, 8, 6), M('#1a3a98')); btn.position.y = 0.19; g.add(btn);
      break;
    }
    case 'berete': { // mākslinieka berete, sašķiebta uz sāniem
      const m = M('#b8182a', { roughness: 0.9, map: cachedTex('cloth', 64) });
      const b = new THREE.Mesh(S(0.3, 22, 14), m); b.scale.set(1.08, 0.32, 1.08); b.position.set(0.03, 0.02, 0); b.rotation.z = -0.18; g.add(b);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 6, 24), M('#7a0a18')); band.rotation.x = Math.PI / 2; band.position.y = -0.04; g.add(band);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 6), m); st.position.set(0.0, 0.13, 0); g.add(st);
      break;
    }
    case 'kovbojs': { // kovboja cepure: plata, uz sāniem uzlocīta mala un iespiests virsums
      const m = new THREE.MeshStandardMaterial({ color: '#9a6a3a', roughness: 0.85, map: cachedTex('cloth', 64), side: THREE.DoubleSide });
      const brim = new THREE.CylinderGeometry(0.5, 0.5, 0.02, 32, 1, false);
      const p = brim.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); if (r > 0.28) p.setY(i, p.getY(i) + Math.pow(Math.abs(x) / 0.5, 2.5) * 0.16 - (z > 0 ? 0.02 : 0)); }
      brim.computeVertexNormals();
      g.add(new THREE.Mesh(brim, m));
      const crown = new THREE.Mesh(LATHE([[0.27, 0], [0.26, 0.14], [0.24, 0.26], [0.16, 0.3], [0.05, 0.27], [0, 0.25]], 28), m); g.add(crown);
      const band = new THREE.Mesh(LATHE([[0.272, 0.02], [0.268, 0.07]], 28), M('#3a2010', { side: THREE.DoubleSide })); g.add(band);
      break;
    }
    case 'pirats': { // pirāta trīsstūra cepure ar galvaskausu
      const m = new THREE.MeshStandardMaterial({ color: '#1c1c20', roughness: 0.8, side: THREE.DoubleSide });
      g.add(new THREE.Mesh(LATHE([[0.27, 0], [0.26, 0.12], [0.2, 0.22], [0.0, 0.25]], 24), m));
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2 + Math.PI / 2;
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.02), m);
        f.position.set(Math.cos(a) * 0.27, 0.08, Math.sin(a) * 0.27); f.rotation.y = -a + Math.PI / 2; f.rotation.x = -0.35; g.add(f);
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.025), M('#d8b040', { metalness: 0.8, roughness: 0.3 }));
        trim.position.set(Math.cos(a) * 0.3, 0.18, Math.sin(a) * 0.3); trim.rotation.y = -a + Math.PI / 2; trim.rotation.x = -0.35; g.add(trim);
      }
      const sk = new THREE.Mesh(S(0.05, 10, 8), M('#f4f4f0')); sk.position.set(0, 0.09, 0.3); sk.scale.z = 0.4; g.add(sk);
      for (const s2 of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.01), M('#f4f4f0')); b.position.set(0, 0.06, 0.315); b.rotation.z = s2 * 0.6; g.add(b); }
      break;
    }
    case 'kivere': { // bruņinieka ķivere ar redeli un spalvu
      const steel = new THREE.MeshStandardMaterial({ color: '#b8bcc4', metalness: 1, roughness: 0.3, side: THREE.DoubleSide });
      g.add(new THREE.Mesh(LATHE([[0.29, -0.2], [0.29, -0.05], [0.285, 0.08], [0.25, 0.2], [0.17, 0.29], [0.0, 0.32]], 28), steel));
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.05), M('#111', { roughness: 0.6 })); slit.position.set(0, -0.02, 0.28); g.add(slit);
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 6, 24, Math.PI), steel); ridge.rotation.y = Math.PI / 2; ridge.position.y = 0.0; ridge.scale.set(1, 1.05, 1); g.add(ridge);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.292, 0.016, 6, 32), M('#d8b040', { metalness: 1, roughness: 0.3 })); band.rotation.x = Math.PI / 2; band.position.y = -0.12; g.add(band);
      for (let i = 0; i < 5; i++) {
        const pl = new THREE.Mesh(S(0.06, 10, 8), M(i % 2 ? '#e8302a' : '#f4f4f4', { roughness: 0.8 }));
        pl.position.set(0, 0.36 + i * 0.03, -0.05 - i * 0.07); pl.scale.set(0.5, 0.8, 1.5); g.add(pl);
      }
      break;
    }
  }
  optimizeRig(g);
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
  const eyes = (x, y, z, r, parent = body) => {
    for (const s of [-1, 1]) {
      part(S(r, 12, 10), '#000', s * x, y, z, parent, mat('#0b0806', { roughness: 0.05 }));
      part(S(r * 0.25, 6, 6), '#fff', s * x * 1.05, y + r * 0.35, z + r * 0.75, parent, new THREE.MeshBasicMaterial({ color: '#fff' }));
    }
  };
  // vienlaidu ķermenis (rotācijas virsma gar z asi): prof = [[rādiuss, z], ...] no aizmugures uz priekšu
  const trunk = (prof, color, y, sy = 1) => {
    const g = LATHE(prof.map(([r, z]) => [r, z]), 28); g.rotateX(Math.PI / 2);
    const o = part(g, color, 0, y, 0); o.scale.set(1, sy, 1); return o;
  };
  let scale = 1, hop = false, gait = 8;
  switch (type) {
    case 'stirna': { // stirna: slaida, sarkanbrūna, balts spogulis
      const c = '#93603a', d = '#6e4428';
      const H = 0.78;
      trunk([[0, -0.5], [0.12, -0.47], [0.19, -0.38], [0.21, -0.22], [0.2, 0.0], [0.215, 0.2], [0.21, 0.32], [0.16, 0.44], [0, 0.48]], c, H + 0.13, 1.18);
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
    case 'briedis': { // ziemeļbriedis: pelēkbrūns, gaišs kakls, lieli zaraini ragi
      const c = '#7a6656', d = '#5a4a3e', lt = '#e2dacd';
      const H = 0.95;
      trunk([[0, -0.56], [0.14, -0.53], [0.23, -0.42], [0.26, -0.24], [0.25, 0.0], [0.27, 0.22], [0.26, 0.36], [0.2, 0.5], [0, 0.54]], c, H + 0.15, 1.15);
      ell(0.12, 0.13, 0.06, lt, 0, H + 0.16, -0.54);
      ell(0.18, 0.15, 0.34, '#9c8a78', 0, H + 0.0, 0.02);
      const neck = new THREE.Group(); neck.position.set(0, H + 0.28, 0.42); neck.rotation.x = -0.75; body.add(neck);
      const ng = new THREE.CylinderGeometry(0.1, 0.16, 0.5, 12); ng.translate(0, 0.25, 0); part(ng, lt, 0, 0, 0, neck);
      // gaiša krēpe zem kakla
      const mane = ell(0.13, 0.2, 0.1, lt, 0, 0.12, 0.08, neck); mane.rotation.x = 0.3;
      const head = new THREE.Group(); head.position.set(0, 0.5, 0); head.rotation.x = 1.05; neck.add(head);
      ell(0.1, 0.105, 0.14, c, 0, 0, 0, head);
      const mz = new THREE.CylinderGeometry(0.06, 0.09, 0.2, 12); mz.rotateX(Math.PI / 2); part(mz, d, 0, -0.03, 0.16, head);
      part(S(0.04, 10, 8), '#2a201a', 0, -0.03, 0.26, head, mat('#2a201a', { roughness: 0.3 }));
      eyes(0.085, 0.03, 0.06, 0.022, head);
      for (const s of [-1, 1]) {
        const e = part(new THREE.ConeGeometry(0.045, 0.13, 10), c, s * 0.085, 0.09, -0.05, head);
        e.rotation.set(-0.2, 0, -s * 1.1); e.scale.set(1, 1, 0.45);
        // ragi: galvenais zars ar sānu žuburiem
        const am = mat('#d8c8a8', { roughness: 0.7 });
        const beam = (parent, len, r, rx, rz, x, y, z) => {
          const g = new THREE.CylinderGeometry(r * 0.6, r, len, 6); g.translate(0, len / 2, 0);
          const o = part(g, '#d8c8a8', x, y, z, parent, am); o.rotation.set(rx, 0, rz); return o;
        };
        const main = beam(head, 0.42, 0.028, -0.5, -s * 0.45, s * 0.05, 0.1, -0.06);
        const up = beam(main, 0.36, 0.022, -0.6, -s * 0.15, 0, 0.42, 0);
        beam(up, 0.18, 0.015, 0.5, -s * 0.3, 0, 0.36, 0);
        beam(up, 0.16, 0.015, 0.7, s * 0.4, 0, 0.2, 0);
        beam(main, 0.2, 0.017, 0.9, s * 0.2, 0, 0.22, 0);
        beam(main, 0.16, 0.015, 1.3, -s * 0.1, 0, 0.08, 0);
      }
      for (const s of [-1, 1]) {
        leg(s * 0.14, H + 0.02, 0.36, 0.45, 0.48, 0.075, c, '#2a201a', true);
        leg(s * 0.14, H + 0.06, -0.36, 0.5, 0.46, 0.09, d, '#2a201a', false);
      }
      gait = 6;
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
      trunk([[0, -0.58], [0.16, -0.55], [0.27, -0.42], [0.3, -0.2], [0.32, 0.05], [0.35, 0.28], [0.32, 0.45], [0.2, 0.56], [0, 0.6]], c, 0.74, 1.08);
      ell(0.3, 0.36, 0.28, d, 0, 0.8, 0.28);
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
  optimizeRig(body, new Set(legs), { bake: true });
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
export function tyreGeo(r, w) {
  const ri = r * 0.58, rr = w * 0.3, pts = [];
  // noapaļots riepas šķērsgriezums (r = rādiuss, y = platums)
  const corner = (cx, cy, a0) => { for (let i = 0; i <= 4; i++) { const a = a0 + (i / 4) * Math.PI / 2; pts.push(new THREE.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)); } };
  pts.push(new THREE.Vector2(ri, -w / 2));
  corner(r - rr, -w / 2 + rr, -Math.PI / 2);
  corner(r - rr, w / 2 - rr, 0);
  pts.push(new THREE.Vector2(ri, w / 2));
  const g = new THREE.LatheGeometry(pts, 28);
  g.rotateZ(Math.PI / 2);
  return g;
}
export function buildKart(color = '#e02a2a') {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
  const steel = new THREE.MeshStandardMaterial({ color: '#9aa0a6', metalness: 0.9, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.6, metalness: 0.2 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92 });
  const P = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  const tube = (a, b, r = 0.025, m = steel) => {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), len = d.length();
    const t = P(new THREE.CylinderGeometry(r, r, len, 8), m, (A.x + Bv.x) / 2, (A.y + Bv.y) / 2, (A.z + Bv.z) / 2);
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return t;
  };
  // rāmis no caurulēm
  for (const sx of [-1, 1]) {
    tube([sx * 0.45, 0.22, 0.9], [sx * 0.5, 0.22, -0.95]);
    tube([sx * 0.45, 0.22, 0.9], [0, 0.22, 1.05]);
  }
  tube([-0.75, 0.3, 0.75], [0.75, 0.3, 0.75], 0.03);
  tube([-0.82, 0.32, -0.75], [0.82, 0.32, -0.75], 0.035);
  P(new THREE.BoxGeometry(0.9, 0.03, 1.8), dark, 0, 0.2, -0.02);
  // krāsotās daļas: priekšējais konuss, sānu kārbas, aizmugures buferis
  const nose = P(LATHE([[0, -0.5], [0.12, -0.46], [0.22, -0.3], [0.27, 0], [0.28, 0.32], [0, 0.34]], 20), paint, 0, 0.36, 0.78);
  nose.rotation.x = Math.PI / 2 + 0.12; nose.scale.set(1.7, 1, 0.55);
  const base = nose;
  for (const sx of [-1, 1]) {
    const pod = P(new THREE.CapsuleGeometry(0.13, 0.8, 6, 14), paint, sx * 0.62, 0.3, -0.05);
    pod.rotation.x = Math.PI / 2; pod.scale.set(0.9, 1, 0.75);
  }
  const bump = P(new THREE.CapsuleGeometry(0.08, 1.3, 6, 12), dark, 0, 0.3, -1.12); bump.rotation.z = Math.PI / 2;
  // numura plāksne
  const plate = P(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshStandardMaterial({ roughness: 0.5, map: canvasTexture(128, 80, (c, w, h) => {
    c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = 'bold 64px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(1 + Math.floor(Math.random() * 9)), w / 2, h / 2 + 3);
  }) }), 0, 0.52, 1.08);
  plate.rotation.x = -0.75;
  // sēdeklis (kauss)
  const seatM = new THREE.MeshStandardMaterial({ color: '#202124', roughness: 0.7 });
  const sb = P(new THREE.SphereGeometry(0.32, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), seatM, 0, 0.5, -0.38);
  sb.scale.set(0.95, 0.85, 0.9); sb.rotation.x = -0.25;
  sb.material = seatM.clone(); sb.material.side = THREE.DoubleSide;
  const back = P(new THREE.CapsuleGeometry(0.2, 0.25, 6, 14), seatM, 0, 0.72, -0.65); back.rotation.x = -0.3; back.scale.set(1.25, 1, 0.35);
  // stūre
  tube([0, 0.28, 0.75], [0, 0.78, 0.35], 0.022, dark);
  const sw = P(new THREE.TorusGeometry(0.16, 0.022, 8, 24), dark, 0, 0.8, 0.33); sw.rotation.x = -0.9;
  P(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), paint, 0, 0.8, 0.33).rotation.x = Math.PI / 2 - 0.9;
  // dzinējs ar ribām un izpūtēju
  const eng = new THREE.Group(); eng.position.set(0.42, 0.45, -0.72); g.add(eng);
  P(new THREE.BoxGeometry(0.26, 0.24, 0.3), dark, 0, 0, 0, eng);
  for (let i = 0; i < 5; i++) P(new THREE.BoxGeometry(0.3, 0.012, 0.32), steel, 0, 0.05 + i * 0.03, 0, eng);
  P(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 14), steel, 0.02, 0.24, 0, eng);
  const ex = P(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10), steel, -0.08, -0.04, -0.3, eng); ex.rotation.x = Math.PI / 2;
  // riteņi: noapaļotas riepas, metāla diski ar spieķiem
  const wheels = [];
  const rimM = new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 0.95, roughness: 0.25 });
  for (const [x, z, front] of [[-0.8, 0.75, 1], [0.8, 0.75, 1], [-0.84, -0.75, 0], [0.84, -0.75, 0]]) {
    const w = new THREE.Group(); w.position.set(x, 0.32, z); g.add(w);
    const wd = front ? 0.22 : 0.3;
    P(tyreGeo(0.32, wd), rubber, 0, 0, 0, w);
    const rim = P(new THREE.CylinderGeometry(0.19, 0.19, wd * 0.8, 20, 1, true), rimM, 0, 0, 0, w); rim.rotation.z = Math.PI / 2;
    const hub = P(new THREE.CylinderGeometry(0.05, 0.05, wd * 0.9, 10), rimM, 0, 0, 0, w); hub.rotation.z = Math.PI / 2;
    for (let k = 0; k < 5; k++) {
      const sp = P(new THREE.BoxGeometry(0.03, 0.34, 0.035), rimM, Math.sign(x) * wd * 0.3, 0, 0, w); sp.rotation.x = k / 5 * Math.PI;
    }
    wheels.push(w);
  }
  const seat = new THREE.Group();
  seat.position.set(0, 0.12, -0.3);
  g.add(seat);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  optimizeRig(g);
  const shadow = makeBlobShadow(2.6);
  shadow.position.y = 0.04;
  g.add(shadow);
  return { root: g, wheels, seat, base, setColor(c) { paint.color.set(c); } };
}

// ---------------- Tirgotāja ratiņi ----------------
let plankTex = null;
function planks() {
  if (plankTex) return plankTex;
  plankTex = canvasTexture(128, 128, (c, w, h) => {
    for (let i = 0; i < 6; i++) {
      const l = 0.82 + Math.random() * 0.25, y = i * h / 6;
      c.fillStyle = `rgb(${168 * l | 0},${120 * l | 0},${76 * l | 0})`; c.fillRect(0, y, w, h / 6);
      for (let k = 0; k < 12; k++) { c.strokeStyle = `rgba(70,45,25,${0.15 + Math.random() * 0.2})`; c.beginPath(); const yy = y + Math.random() * h / 6; c.moveTo(0, yy); c.bezierCurveTo(w / 3, yy + 2, w * 2 / 3, yy - 2, w, yy + (Math.random() - 0.5) * 3); c.stroke(); }
      c.fillStyle = 'rgba(40,25,12,0.8)'; c.fillRect(0, y + h / 6 - 2, w, 2);
      c.fillStyle = 'rgba(30,30,30,0.7)'; c.fillRect(6, y + 8, 3, 3); c.fillRect(w - 10, y + 8, 3, 3);
    }
  });
  plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping;
  return plankTex;
}
export function buildCart(color = '#3c9a4a', iceCream = false, goodsKind = 'veg') {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#ffffff', map: planks(), roughness: 0.9 });
  const darkWood = mat('#5a3e26', { roughness: 0.9 });
  const P = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  // kaste ar rāmja malām
  P(new THREE.BoxGeometry(2.6, 0.9, 1.4), wood, 0, 1.0, 0);
  for (const [x, z] of [[-1.3, -0.7], [1.3, -0.7], [-1.3, 0.7], [1.3, 0.7]]) P(new THREE.BoxGeometry(0.1, 1.0, 0.1), darkWood, x, 1.0, z);
  for (const y of [0.55, 1.45]) { P(new THREE.BoxGeometry(2.7, 0.08, 0.1), darkWood, 0, y, 0.72); P(new THREE.BoxGeometry(2.7, 0.08, 0.1), darkWood, 0, y, -0.72); }
  P(new THREE.BoxGeometry(2.8, 0.07, 1.55), darkWood, 0, 1.49, 0);
  // lieli koka riteņi ar spieķiem un ass
  const wM = mat('#4a3220', { roughness: 0.85 }), iron = new THREE.MeshStandardMaterial({ color: '#3a3a3c', metalness: 0.8, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const wg = new THREE.Group(); wg.position.set(0.5, 0.55, s * 0.82); g.add(wg);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 28), wM); wg.add(rim);
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 28), iron); tyre.scale.set(1.04, 1.04, 1.3); wg.add(tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12), wM); hub.rotation.x = Math.PI / 2; wg.add(hub);
    for (let k = 0; k < 8; k++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.9, 6), wM); sp.rotation.z = k / 8 * Math.PI; wg.add(sp); }
  }
  // atbalsta kājas un rokturi
  for (const s of [-1, 1]) {
    P(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), darkWood, -1.15, 0.3, s * 0.55);
    const h = P(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8), darkWood, -1.75, 0.9, s * 0.5); h.rotation.z = Math.PI / 2 - 0.15;
  }
  // stabi un izliekta svītraina tenta
  for (const [x, z] of [[-1.25, -0.65], [1.25, -0.65], [-1.25, 0.65], [1.25, 0.65]]) P(new THREE.CylinderGeometry(0.035, 0.04, 1.45, 8), darkWood, x, 2.2, z);
  const stripes = canvasTexture(256, 64, (c, w, h) => {
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f6f2e8' : color; c.fillRect(i * w / 8, 0, w / 8, h); }
    for (let k = 0; k < 1500; k++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; c.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  });
  const awnM = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.95, side: THREE.DoubleSide });
  const awn = P(new THREE.CylinderGeometry(1.4, 1.4, 3.0, 24, 1, true, Math.PI / 2 - 0.75, 1.5), awnM, 0, 2.46, 0);
  awn.rotation.z = Math.PI / 2; awn.scale.set(0.35, 1, 1);
  // vīlīte ar zobiņiem gar malām
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) {
    const fl = P(new THREE.ConeGeometry(0.12, 0.16, 3), mat(i % 2 ? '#f6f2e8' : color, { roughness: 0.95 }), -1.37 + i * 0.25, 2.76, s * 0.96);
    fl.rotation.x = Math.PI; fl.scale.set(1, 1, 0.15);
  }
  // preces
  if (iceCream) {
    const box = P(new THREE.BoxGeometry(1.8, 0.35, 0.9), mat('#eef2f4', { roughness: 0.3, metalness: 0.2 }), 0, 1.7, 0);
    void box;
    const cols = ['#f7d6df', '#fbf0c0', '#cfeccb', '#7a4a2e', '#f2f2ea'];
    cols.forEach((c, i) => {
      const x = -0.7 + i * 0.35;
      P(new THREE.CylinderGeometry(0.15, 0.13, 0.08, 16), mat('#c8d0d4', { metalness: 0.7, roughness: 0.3 }), x, 1.9, 0.1);
      const sc = P(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(c, { roughness: 0.55 }), x, 1.92, 0.1); sc.scale.set(1, 0.6, 1);
    });
    const coneTex = canvasTexture(64, 64, (c, w, h) => { c.fillStyle = '#d8a35e'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(120,70,30,0.6)'; c.lineWidth = 2; for (let i = -64; i < 128; i += 10) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 64, 64); c.stroke(); c.beginPath(); c.moveTo(i + 64, 0); c.lineTo(i, 64); c.stroke(); } });
    for (let i = 0; i < 4; i++) {
      const cn = P(new THREE.ConeGeometry(0.06, 0.2, 12).rotateX(Math.PI), new THREE.MeshStandardMaterial({ map: coneTex, roughness: 0.8 }), -0.6 + i * 0.4, 1.98, -0.32);
      P(new THREE.SphereGeometry(0.07, 12, 10), mat(cols[i], { roughness: 0.55 }), -0.6 + i * 0.4, 2.1, -0.32);
      void cn;
    }
  } else if (goodsKind === 'hats') {
    // cepures uz koka statīviem
    ['salmu', 'cilindrs', 'vainags', 'kronis'].forEach((id, i) => {
      const x = -0.9 + i * 0.6;
      P(new THREE.CylinderGeometry(0.03, 0.05, 0.3, 8), darkWood, x, 1.68, 0.05);
      const head = P(new THREE.SphereGeometry(0.11, 14, 10), mat('#d8cfc0', { roughness: 0.9 }), x, 1.88, 0.05); head.scale.y = 1.15;
      const h = buildHat(id); h.scale.setScalar(0.42); h.position.set(x, 1.98, 0.05); h.rotation.y = i; g.add(h);
    });
  } else if (goodsKind === 'seeds') {
    // sēklu maisiņi un paciņas
    const sackM = new THREE.MeshStandardMaterial({ color: '#c8b48a', map: cachedTex('fur', 64), roughness: 1 });
    ['#f07b1a', '#c9a25e', '#e0302a', '#ff3355', '#f39a1e'].forEach((c, i) => {
      const x = -1.0 + i * 0.5;
      const sack = P(LATHE([[0, 0], [0.17, 0.0], [0.2, 0.1], [0.19, 0.24], [0.13, 0.32], [0.15, 0.36], [0.1, 0.38], [0, 0.37]], 16), sackM, x, 1.52, 0.15);
      void sack;
      const top = P(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(c, { roughness: 0.7 }), x, 1.84, 0.15); top.scale.y = 0.3;
      const pk = P(new THREE.BoxGeometry(0.16, 0.22, 0.03), new THREE.MeshStandardMaterial({ roughness: 0.6, map: canvasTexture(32, 48, (cx, w, h) => { cx.fillStyle = '#f2ead8'; cx.fillRect(0, 0, w, h); cx.fillStyle = c; cx.beginPath(); cx.arc(w / 2, h * 0.45, 9, 0, 7); cx.fill(); cx.fillStyle = '#3a6a2a'; cx.fillRect(w / 2 - 2, 4, 4, 10); }) }), x, 1.62, -0.38);
      pk.rotation.x = -0.25;
    });
  } else if (goodsKind === 'none') {
    // preces pievieno spēle
  } else {
    // koka kastes ar dārzeņiem
    const crateM = new THREE.MeshStandardMaterial({ color: '#d8c4a0', map: planks(), roughness: 0.9 });
    const goods = [['#e8741e', 'c'], ['#d8362a', 's'], ['#c9a25e', 's'], ['#6aa83a', 's'], ['#7a3a8a', 's']];
    goods.forEach(([c, kind], i) => {
      const x = -1.0 + i * 0.5;
      P(new THREE.BoxGeometry(0.46, 0.18, 0.6), crateM, x, 1.62, 0.1);
      for (let k = 0; k < 6; k++) {
        const px = x + ((k % 3) - 1) * 0.13, pz = 0.1 + (k < 3 ? -0.13 : 0.13);
        if (kind === 'c') { const cr = P(new THREE.ConeGeometry(0.035, 0.28, 10), mat(c, { roughness: 0.7 }), px, 1.76, pz); cr.rotation.z = Math.PI / 2; cr.rotation.y = k; }
        else { const v = P(new THREE.SphereGeometry(0.075, 14, 10), mat(c, { roughness: c === '#d8362a' ? 0.25 : 0.8 }), px, 1.78, pz); v.scale.set(1, 0.85 + (k % 2) * 0.1, 1); }
      }
    });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  optimizeRig(g);
  return g;
}

// ---------------- Sēnes ----------------
export function buildMushroom(def) {
  const g = new THREE.Group();
  const P = (geo, c, x, y, z, o = {}) => { const m = new THREE.Mesh(geo, mat(c, { roughness: 0.8, ...o })); m.position.set(x, y, z); g.add(m); return m; };
  if (def.poison) { // mušmire: slaida kāja ar gredzenu un bumbuli, sarkana cepure ar baltām kārpiņām
    P(LATHE([[0, 0], [0.07, 0.0], [0.085, 0.04], [0.06, 0.09], [0.045, 0.2], [0.04, 0.32], [0, 0.32]], 16), def.stem, 0, 0, 0);
    P(LATHE([[0.04, 0.27], [0.07, 0.24], [0.075, 0.23]], 16), '#f4f0e6', 0, 0, 0, { side: THREE.DoubleSide });
    P(LATHE([[0.0, 0.3], [0.19, 0.29], [0.2, 0.31], [0.18, 0.37], [0.12, 0.42], [0.0, 0.44]], 24), def.cap, 0, 0, 0, { roughness: 0.35 });
    P(LATHE([[0.0, 0.305], [0.19, 0.295]], 24), '#f2ead8', 0, 0, 0, { side: THREE.DoubleSide });
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4, r = 0.04 + (i % 4) * 0.035, y = 0.44 - (r / 0.2) * (r / 0.2) * 0.12;
      const w = P(new THREE.SphereGeometry(0.013 + (i % 3) * 0.004, 6, 5), '#fbf8ef', Math.cos(a) * r, y, Math.sin(a) * r); w.scale.y = 0.5;
    }
  } else if (def.name === 'Gailene') { // gailene: piltuvveida, viļņaina mala, rievas apakšā
    const cap = LATHE([[0.02, 0.0], [0.035, 0.08], [0.06, 0.15], [0.12, 0.2], [0.15, 0.22], [0.13, 0.225], [0.06, 0.2], [0, 0.19]], 28);
    const p = cap.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x);
      if (r > 0.08) p.setY(i, p.getY(i) + Math.sin(a * 5) * 0.015 * (r - 0.08) / 0.07);
    }
    cap.computeVertexNormals();
    P(cap, def.cap, 0, 0, 0, { side: THREE.DoubleSide, roughness: 0.7 });
  } else { // baravika: resna, bumbuļveida kāja, brūna cepure, sūklis apakšā
    const stemTex = cachedTex('fur', 64);
    const stem = new THREE.Mesh(LATHE([[0, 0], [0.09, 0.0], [0.115, 0.06], [0.11, 0.13], [0.085, 0.22], [0.07, 0.28], [0, 0.28]], 20), new THREE.MeshStandardMaterial({ color: def.stem, map: stemTex, roughness: 0.9 }));
    g.add(stem);
    P(LATHE([[0, 0.25], [0.2, 0.25], [0.215, 0.27], [0.2, 0.34], [0.14, 0.39], [0, 0.41]], 28), def.cap, 0, 0, 0, { roughness: 0.55 });
    P(LATHE([[0.0, 0.252], [0.2, 0.252]], 24), '#d8c060', 0, 0, 0, { side: THREE.DoubleSide, roughness: 1 });
  }
  g.scale.setScalar(1.5);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  optimizeRig(g);
  return g;
}

export function buildStar() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.21 : 0.5, a = i / 10 * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.1, bevelSegments: 4 });
  geo.center();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffcc33', emissive: '#7a4a00', emissiveIntensity: 0.8, metalness: 1, roughness: 0.22 }));
}

// ---------------- Augi dārzā ----------------
export function buildCrop(crop, stage, color) {
  const g = new THREE.Group();
  const leafM = (c = '#4f9a32') => mat(c, { side: THREE.DoubleSide, roughness: 0.75 });
  const LF = leafShape(false), OAK = leafShape(true);
  const leaf = (x, y, z, ry, rx, s = 1, c, geo = LF) => { const l = new THREE.Mesh(geo, leafM(c)); l.position.set(x, y, z); l.rotation.set(rx, ry, 0, 'YXZ'); l.scale.setScalar(s); g.add(l); return l; };
  const stemM = mat('#5a8a2a', { roughness: 0.8 });
  const stem = (x0, z0, x1, y1, z1, r = 0.008) => {
    const a = new THREE.Vector3(x0, 0, z0), b = new THREE.Vector3(x1, y1, z1), d = b.clone().sub(a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, d.length(), 5), stemM);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(m); return b;
  };
  if (stage === 0) { // dīglis ar divām dīgļlapām
    stem(0, 0, 0, 0.07, 0, 0.006);
    for (const s of [-1, 1]) leaf(0, 0.07, 0, s * Math.PI / 2, -1.1, 0.5, '#7acb4a');
    return g;
  }
  const big = stage === 2;
  const k = big ? 1 : 0.65;
  switch (crop) {
    case 'burkans': // plūksnaini lakstiņi
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2, tip = stem(0, 0, Math.cos(a) * 0.1 * k, 0.35 * k, Math.sin(a) * 0.1 * k, 0.006);
        for (let j = 0; j < 4; j++) leaf(tip.x * (0.5 + j * 0.15), tip.y * (0.55 + j * 0.13), tip.z * (0.5 + j * 0.15), -a + Math.PI / 2 + (j % 2 ? 0.8 : -0.8), -0.8, 0.45 * k, '#3f8a2a');
      }
      if (big) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 14), mat(color, { roughness: 0.7 })); c.rotation.x = Math.PI; c.position.y = 0.0; g.add(c); }
      break;
    case 'kartupelis': // krūmains, olveida lapas, balti ziedi
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, tip = stem(0, 0, Math.cos(a) * 0.14 * k, 0.32 * k, Math.sin(a) * 0.14 * k, 0.01);
        for (let j = 0; j < 3; j++) leaf(tip.x * (0.6 + j * 0.2), tip.y * (0.6 + j * 0.2), tip.z * (0.6 + j * 0.2), -a + Math.PI / 2 + (j - 1) * 0.9, -0.6, 0.8 * k, '#3d7a28');
      }
      if (big) {
        for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(S(0.025, 8, 6), mat('#f6f2fa')); f.position.set(Math.cos(i * 2) * 0.08, 0.36, Math.sin(i * 2) * 0.08); f.scale.y = 0.4; g.add(f); }
        for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(S(0.06, 12, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.95, map: cachedTex('stone', 32) })); p.position.set((i - 1) * 0.16, 0.03, 0.16); p.scale.set(1.2, 0.8, 0.9); g.add(p); }
      }
      break;
    case 'tomats': { // miets, stublājs, lapas, tomāti ar kauslapām
      const stake = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.75, 0.025), mat('#8a6a42')); stake.position.set(0.04, 0.37, 0); g.add(stake);
      let prev = new THREE.Vector3(0, 0, 0);
      for (let j = 0; j < 5; j++) {
        const nx = Math.sin(j * 1.7) * 0.03, ny = (j + 1) * 0.12 * k;
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.12 * k, 5), stemM); st.position.set((prev.x + nx) / 2, (prev.y + ny) / 2, 0); g.add(st);
        prev = new THREE.Vector3(nx, ny, 0);
        for (const s of [-1, 1]) leaf(nx, ny, 0, s * Math.PI / 2 + j, -0.5, 0.7 * k, '#3b7a2a', OAK);
      }
      if (big) for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(S(0.055, 16, 12), mat(color, { roughness: 0.22 })); t.position.set(Math.cos(i * 1.9) * 0.1, 0.2 + i * 0.1, Math.sin(i * 1.9) * 0.1); t.scale.y = 0.85; g.add(t);
        const cx = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.02, 5), stemM); cx.position.set(t.position.x, t.position.y + 0.05, t.position.z); g.add(cx);
      }
      break;
    }
    case 'zemene': // zema trīsdaļīgu lapu rozete, ogas ar kauslapām
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, tip = stem(0, 0, Math.cos(a) * 0.12 * k, 0.14 * k, Math.sin(a) * 0.12 * k, 0.006);
        for (let j = -1; j <= 1; j++) leaf(tip.x, tip.y, tip.z, -a + Math.PI / 2 + j * 0.7, -1.2, 0.7 * k, '#3f8a30');
      }
      if (big) for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), mat(color, { roughness: 0.3 }));
        b.scale.set(1, 1.35, 1); b.position.set(Math.cos(i * 1.6 + 0.4) * 0.17, 0.04, Math.sin(i * 1.6 + 0.4) * 0.17); g.add(b);
        const cx = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.015, 6), stemM); cx.position.set(b.position.x, 0.09, b.position.z); g.add(cx);
      }
      break;
    case 'auzas': case 'kviesi': { // graudaugi: stiebru kušķis; nobriedis — zeltaini stiebri ar skarām / vārpām
      const oat = crop === 'auzas';
      const bladeG = (h) => { const b = new THREE.PlaneGeometry(0.03, h, 1, 2); b.translate(0, h / 2, 0); const p = b.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y / h * 0.7)); p.setZ(i, (y / h) * (y / h) * 0.08); } return b; };
      const hh = (big ? 0.85 : 0.5) * (oat ? 1 : 1.08);
      const bc = big ? color : '#5f9a34';
      for (let i = 0; i < 5; i++) {
        const b = new THREE.Mesh(bladeG(hh * (0.75 + (i % 3) * 0.13)), leafM(i % 2 && big ? '#a8a050' : bc));
        b.rotation.y = i / 5 * Math.PI * 2; b.position.set(Math.cos(i * 2.4) * 0.03, 0, Math.sin(i * 2.4) * 0.03); g.add(b);
      }
      if (big) for (let i = 0; i < 3; i++) {
        const a = i * 2.1, x = Math.cos(a) * 0.05, z = Math.sin(a) * 0.05, y = hh * (0.92 + i * 0.05);
        if (oat) for (let j = 0; j < 4; j++) { const sp2 = new THREE.Mesh(S(0.018, 5, 4), mat(color, { roughness: 0.8 })); sp2.scale.set(0.7, 1.4, 0.7); sp2.position.set(x + Math.cos(a + j) * 0.05, y - j * 0.05, z + Math.sin(a + j) * 0.05); g.add(sp2); }
        else { const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.09, 2, 5), mat(color, { roughness: 0.8 })); ear.position.set(x, y + 0.04, z); ear.rotation.z = 0.15; g.add(ear); }
      }
      break;
    }
    case 'kaposts': { // apaļa galviņa ar platām ārējām lapām
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.13 * k, 9), leafM(i % 2 ? '#6fa04a' : '#7fb05a'));
        l.position.set(Math.cos(a) * 0.1 * k, 0.08 * k, Math.sin(a) * 0.1 * k); l.rotation.set(-0.7, -a + Math.PI / 2, 0, 'YXZ'); g.add(l);
      }
      if (big) { const h = new THREE.Mesh(S(0.15, 14, 10), mat(color, { roughness: 0.6 })); h.position.y = 0.14; h.scale.y = 0.85; g.add(h); }
      break;
    }
    case 'saulgrieze': { // augsts stublājs ar lapām un dzeltenu ziedu
      const hh = big ? 1.6 : 0.8;
      stem(0, 0, 0, hh, 0, 0.022);
      for (let j = 0; j < 4; j++) leaf(0, hh * (0.25 + j * 0.17), 0, j * 2.2, -0.6, 1.3 * k, '#4a8a2e', OAK);
      if (big) {
        const head = new THREE.Group(); head.position.set(0, hh, 0.04); head.rotation.x = 0.5; g.add(head);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 14), mat('#5a3a1a', { roughness: 0.9 })); disc.rotation.x = Math.PI / 2; head.add(disc);
        for (let i = 0; i < 14; i++) { const pt = new THREE.Mesh(new THREE.CircleGeometry(0.05, 5), leafM(color)); const a = i / 14 * Math.PI * 2; pt.position.set(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0.01); pt.scale.set(0.5, 1, 1); pt.rotation.z = a - Math.PI / 2; head.add(pt); }
      }
      break;
    }
    case 'redisi': // zema lapu rozete, no zemes rēgojas sārts bumbulītis
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; leaf(0, 0.02, 0, -a, -0.75, 0.75 * k, '#4f9a32'); }
      if (big) { const r = new THREE.Mesh(S(0.045, 12, 10), mat(color, { roughness: 0.4 })); r.position.y = 0.02; g.add(r); }
      break;
    case 'salati': { // kupla, cirtaina lapu galviņa
      for (let i = 0; i < (big ? 11 : 7); i++) {
        const a = i * 2.4, r0 = i < 5 ? 0.11 : 0.05;
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.1 * k, 8), leafM(i % 2 ? '#8ccc5a' : '#a8de78'));
        l.position.set(Math.cos(a) * r0 * k, 0.06 * k + (i >= 5 ? 0.04 : 0), Math.sin(a) * r0 * k); l.rotation.set(i < 5 ? -0.9 : -0.25, -a + Math.PI / 2, 0, 'YXZ'); g.add(l);
      }
      break;
    }
    case 'sipols': // stobrveida loki, sīpols pusē zemē
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; stem(0, 0, Math.cos(a) * 0.06 * k, 0.38 * k, Math.sin(a) * 0.06 * k, 0.009); }
      if (big) { const b = new THREE.Mesh(S(0.06, 12, 10), mat(color, { roughness: 0.6 })); b.position.y = 0.03; b.scale.y = 0.9; g.add(b); }
      break;
    case 'zirni': { // mietiņš ar vīteni un pākstīm
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.65 * k + 0.1, 5), mat('#8a6a42')); stake.position.y = (0.65 * k + 0.1) / 2; g.add(stake);
      for (let j = 0; j < 6; j++) { const a = j * 1.7, y = 0.08 + j * 0.09 * k; leaf(Math.cos(a) * 0.03, y, Math.sin(a) * 0.03, -a, -0.4, 0.55 * k, '#5aa83a'); }
      if (big) for (let i = 0; i < 4; i++) {
        const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.07, 3, 6), mat(color, { roughness: 0.55 }));
        pod.position.set(Math.cos(i * 1.6) * 0.05, 0.18 + i * 0.1, Math.sin(i * 1.6) * 0.05); pod.rotation.z = 0.5; g.add(pod);
      }
      break;
    }
    case 'biete': // lielas lapas ar sarkaniem kātiem, tumši sarkana sakne
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, tip = stem(0, 0, Math.cos(a) * 0.08 * k, 0.26 * k, Math.sin(a) * 0.08 * k, 0.008);
        leaf(tip.x, tip.y, tip.z, -a + Math.PI / 2, -0.7, 1.0 * k, i % 2 ? '#3f7a2a' : '#4a8a32');
      }
      if (big) { const b = new THREE.Mesh(S(0.06, 12, 10), mat(color, { roughness: 0.45 })); b.position.y = 0.02; g.add(b); }
      break;
    case 'gurkis': { // vītnes pa zemi ar platām lapām un gurķiem
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + 0.2, tip = stem(0, 0, Math.cos(a) * 0.32 * k, 0.12 * k, Math.sin(a) * 0.32 * k, 0.009);
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.1 * k, 7), leafM('#3f8a2a')); l.position.copy(tip); l.rotation.set(-1.2, -a, 0, 'YXZ'); g.add(l);
      }
      if (big) for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.14, 4, 8), mat(color, { roughness: 0.5 }));
        c.rotation.set(Math.PI / 2, 0, i * 2.1); c.position.set(Math.cos(i * 2.1 + 0.5) * 0.18, 0.03, Math.sin(i * 2.1 + 0.5) * 0.18); g.add(c);
      }
      break;
    }
    case 'kukuruza': { // augsts stiebrs ar garām lapām un vālīti
      const hh = big ? 1.7 : 0.9;
      stem(0, 0, 0, hh, 0, 0.02);
      const bladeG = (h) => { const b = new THREE.PlaneGeometry(0.07, h, 1, 3); b.translate(0, h / 2, 0); const p = b.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y / h * 0.8)); p.setZ(i, (y / h) * (y / h) * 0.3); } return b; };
      for (let j = 0; j < 6; j++) { const b = new THREE.Mesh(bladeG(0.55 * k), leafM(j % 2 ? '#4f9a32' : '#5aa83a')); b.position.y = hh * (0.15 + j * 0.12); b.rotation.y = j * 2.3; g.add(b); }
      if (big) {
        const cob = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 8), mat(color, { roughness: 0.6 })); cob.position.set(0.06, hh * 0.55, 0); cob.rotation.z = -0.35; g.add(cob);
        const husk = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 6, 1, true), leafM('#8ac05a')); husk.position.set(0.05, hh * 0.5, 0); husk.rotation.z = Math.PI - 0.35; g.add(husk);
        const tas = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), mat('#c8a050')); tas.position.y = hh + 0.08; g.add(tas);
      }
      break;
    }
    case 'paprika': // kuplu lapu krūms ar lieliem pipariem
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, tip = stem(0, 0, Math.cos(a) * 0.12 * k, 0.4 * k, Math.sin(a) * 0.12 * k, 0.01);
        for (let j = 0; j < 2; j++) leaf(tip.x * (0.7 + j * 0.3), tip.y * (0.7 + j * 0.3), tip.z * (0.7 + j * 0.3), -a + Math.PI / 2 + j, -0.5, 0.75 * k, '#3a7a28');
      }
      if (big) for (let i = 0; i < 3; i++) {
        const pp = new THREE.Mesh(S(0.05, 12, 10), mat(color, { roughness: 0.25 })); pp.scale.set(1, 1.35, 1);
        pp.position.set(Math.cos(i * 2.1) * 0.1, 0.22 + (i % 2) * 0.06, Math.sin(i * 2.1) * 0.1); g.add(pp);
      }
      break;
    case 'arbuzs': { // vītnes un liels svītrains arbūzs
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 + 0.6, tip = stem(0, 0, Math.cos(a) * 0.4 * k, 0.1 * k, Math.sin(a) * 0.4 * k, 0.01);
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.11 * k, 7), leafM('#3a7a2a')); l.position.copy(tip); l.rotation.set(-1.3, -a, 0, 'YXZ'); g.add(l);
      }
      if (big) {
        const tex = melonTex();
        const w = new THREE.Mesh(S(0.28, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 })); w.scale.set(1.25, 0.85, 1); w.position.set(0, 0.22, 0.05); g.add(w);
      }
      break;
    }
    case 'lavanda': // apaļš pelēcīgi zaļš krūms ar violetām vārpiņām
      for (let i = 0; i < 18; i++) {
        const a = i * 2.4, r0 = 0.02 + (i % 4) * 0.035, h = (0.3 + (i % 3) * 0.06) * k;
        stem(Math.cos(a) * r0 * 0.4, Math.sin(a) * r0 * 0.4, Math.cos(a) * r0, h, Math.sin(a) * r0, 0.005);
        if (big) { const sp2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.07, 2, 5), mat(color, { roughness: 0.7 })); sp2.position.set(Math.cos(a) * r0, h + 0.04, Math.sin(a) * r0); g.add(sp2); }
      }
      break;
    case 'kirbis': { // lielas apaļas lapas uz stīgām, rievots ķirbis
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 + 0.3, tip = stem(0, 0, Math.cos(a) * 0.3 * k, 0.18 * k, Math.sin(a) * 0.3 * k, 0.012);
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.13 * k, 10), leafM('#3d7a28')); l.position.copy(tip); l.rotation.set(-1.25, -a, 0, 'YXZ'); g.add(l);
      }
      if (big) {
        const pg = new THREE.SphereGeometry(0.3, 32, 20);
        const p = pg.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
          const kk = 1 - 0.07 * Math.pow(Math.abs(Math.cos(a * 5)), 0.5) * (1 - Math.abs(y) / 0.3);
          p.setXYZ(i, x * kk, y, z * kk);
        }
        pg.computeVertexNormals();
        const pm = new THREE.Mesh(pg, mat(color, { roughness: 0.55 })); pm.position.set(0, 0.2, 0.08); pm.scale.set(1.2, 0.75, 1.2); g.add(pm);
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.12, 8), mat('#6a6a3a')); st.position.set(0, 0.45, 0.08); st.rotation.z = 0.3; g.add(st);
      }
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  optimizeRig(g);
  return g;
}

let melonT = null;
function melonTex() {
  if (melonT) return melonT;
  melonT = canvasTexture(128, 64, (g, w, h) => {
    g.fillStyle = '#3a8a3a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f5a24';
    for (let i = 0; i < 10; i++) { g.beginPath(); for (let y = 0; y <= h; y += 4) g.lineTo(i * w / 10 + Math.sin(y * 0.4 + i) * 3, y); for (let y = h; y >= 0; y -= 4) g.lineTo(i * w / 10 + 6 + Math.sin(y * 0.4 + i) * 3, y); g.fill(); }
  });
  return melonT;
}

export function buildHeart() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.3);
  shape.bezierCurveTo(-0.5, 0.05, -0.25, 0.4, 0, 0.18);
  shape.bezierCurveTo(0.25, 0.4, 0.5, 0.05, 0, -0.3);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 16 });
  geo.center();
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ff3a6a', transparent: true }));
}

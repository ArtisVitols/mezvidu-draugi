import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, makeBlobShadow, noiseTexture, lerp, canvasTexture } from './util.js?v=1.47.0';
import * as A from './assets.js?v=1.47.0';

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
      if (!c.isMesh || c.isInstancedMesh || c.isSkinnedMesh || c.children.length || skip.has(c) || c.material.transparent || Array.isArray(c.material) || c.material.userData.mzToy) continue;
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
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && !o.material.transparent && !o.material.userData.mzToy) {
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

// 1.37.0: jaunie spēlētāju tēli no assets.js (viens SkinnedMesh, kauli — parastas grupas). Spēles uzvedība (animācija,
// ziemas drēbes, slēpes, nešana, šalle) pievienota šeit tāda pati kā agrāk. Pārdevēju dzīvnieki (ūdrs, āpsis, pūce, bebrs)
// jaunajā komplektā nav — tiem paliek vecais modelis.
export function buildAnimal(opts) {
  const animal = (opts && opts.animal) || 'lacis';
  if (!A.SPECIES[animal]) return buildAnimalOld(opts);
  const av = A.buildAnimal({ ...opts, hat: null });
  attachRig(av, A.SPECIES[animal]);
  av.setHat(opts.hat || null);
  return av;
}
function attachRig(av, P) {
  const { root, body, head, spine, legs, arms, tail, hatHolder } = av;
  const B = av.bulk, HIP = A.HIP;
  void body; void head; void tail; void legs;
  const pose = { hip: [0, 0], knee: [0.05, 0.05], sh: [0, 0], shZ: [0, 0], el: [-0.15, -0.15], spX: 0.02, spY: 0, bY: HIP, bX: 0, hX: 0, hY: 0 };
  const tgt = JSON.parse(JSON.stringify(pose));
  const baseWear = av.setWear.bind(av);
  Object.assign(av, {
    phase: Math.random() * 6, t: Math.random() * 10, emoteSprite: null,
    setWear(w) {
      const key = w ? ['glasses', 'neck', 'back', 'feet'].map((k) => w[k] || '').join('|') : '';
      if (this.wearKey === key) return;
      this.wearKey = key;
      baseWear(w);
      for (const o of this.wearParts) if (o.name && o.name.startsWith('neck-')) o.userData.neck = true;
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
        T.sh = [-1.2, -1.2]; T.shZ = [0.12, -0.12]; T.el = [-0.3, -0.3];
        T.bY = HIP - 0.16; T.spX = 0.28; T.hX = -0.2;
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
      if (state === 'bike' && this.pedal) this.pedalIK();
      if (this.scarf) this.animScarf(dt);
    },
    // 1.33.0: pēdas precīzi uz pedāļiem — divu posmu IK (augšstilbs 0,30 m, apakšstilbs līdz pēdai 0,35 m)
    pedalIK() {
      const Pd = this.pedal, hy = this.body.position.y;
      const L1 = 0.3, L2 = Math.hypot(0.35, 0.05), dl = Math.atan2(0.05, 0.35);
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? -1 : 1;
        const vy = Pd.cy + s * Pd.r * Math.cos(Pd.a) + 0.035 - hy, vz = Pd.cz + s * Pd.r * Math.sin(Pd.a);
        const D = Math.min(L1 + L2 - 0.004, Math.max(0.08, Math.hypot(vy, vz)));
        const av = Math.atan2(-vz, -vy);
        const al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))));
        const be = Math.PI - Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2))));
        const hip = av - al, knee = be + dl;
        this.legs[i].hip.rotation.x = hip; this.legs[i].knee.rotation.x = knee;
        pose.hip[i] = hip; pose.knee[i] = knee;
      }
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
  });
  av.wearKey = undefined;
  return av;
}

function buildAnimalOld({ animal = 'lacis', fur = '#8b5a2b', shirt = '#d23b3b', hat = null, wear = null }) {
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
        T.sh = [-1.2, -1.2]; T.shZ = [0.12, -0.12]; T.el = [-0.3, -0.3];
        T.bY = HIP - 0.16; T.spX = 0.28; T.hX = -0.2;
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
      if (state === 'bike' && this.pedal) this.pedalIK();
      if (this.scarf) this.animScarf(dt);
    },
    // 1.33.0: pēdas precīzi uz pedāļiem — divu posmu IK (augšstilbs 0,30 m, apakšstilbs līdz pēdai 0,35 m)
    pedalIK() {
      const Pd = this.pedal, hy = this.body.position.y;
      const L1 = 0.3, L2 = Math.hypot(0.35, 0.05), dl = Math.atan2(0.05, 0.35);
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? -1 : 1;
        const vy = Pd.cy + s * Pd.r * Math.cos(Pd.a) + 0.035 - hy, vz = Pd.cz + s * Pd.r * Math.sin(Pd.a);
        const D = Math.min(L1 + L2 - 0.004, Math.max(0.08, Math.hypot(vy, vz)));
        const av = Math.atan2(-vz, -vy);
        const al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))));
        const be = Math.PI - Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2))));
        const hip = av - al, knee = be + dl;
        this.legs[i].hip.rotation.x = hip; this.legs[i].knee.rotation.x = knee;
        pose.hip[i] = hip; pose.knee[i] = knee;
      }
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
export const buildHat = A.buildHat; // 1.37.0: jaunais modelis (assets.js)

export const buildNPC = A.buildNPC; // 1.37.0: jaunais modelis (assets.js)

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
export const buildKart = A.buildKart; // 1.37.0: jaunais modelis (assets.js)

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
export const buildCart = A.buildCart; // 1.37.0: jaunais modelis (assets.js)

export const buildMushroom = A.buildMushroom; // 1.37.0: jaunais modelis (assets.js)

export const buildStar = A.buildStar; // 1.37.0: jaunais modelis (assets.js)

export const buildCrop = A.buildCrop; // 1.37.0: jaunais modelis (assets.js)

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

export const buildHeart = A.buildHeart; // 1.37.0: jaunais modelis (assets.js)

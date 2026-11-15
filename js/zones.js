// Zemes (kartes): centrā Mežvidi, katrā debespusē sava kvadrātveida zeme.
// Katrai zemei ir savas lokālās koordinātas (centrs 0,0); kopējā kartē zeme ir nobīdīta par ZONE_SIZE.
// Uz kaimiņu zemi var aiziet pa jebkuru robežas vietu.
import * as THREE from 'three';
import { canvasTexture } from './util.js?v=1.13.0';
import { loadTexture } from './gfx.js?v=1.13.0';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ZONE_HALF = 315;              // spēles laukuma puse (kvadrāts 630 × 630 m)
export const ZONE_SIZE = ZONE_HALF * 2;    // attālums starp zemju centriem kopējā kartē
export const CROSS_AT = 3;                 // cik metrus aiz robežas notiek pāreja
export const ZONE_IDS = ['c', 'n', 'e', 's', 'w']; // secība = tīkla kods
export const DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
export const GROUND_Y = 1;                 // līdzeno zemju augstums (arī Mežvidu malas pāriet uz to)

// Zemju apraksti. Saturu (uzdevumus) definēsim vēlāk — pagaidām tikai līdzena zeme.
export const ZONES = {
  c: { name: 'Mežvidi', icon: '🌲', map: '#6fa848' },
  n: { name: 'Ziemas zeme', icon: '❄️', map: '#e9eff5', ground: '#eef2f6', tex: 'meadow' },
  e: { name: 'Austrumu lauki', icon: '🌻', map: '#c9b45a', ground: '#b49a52', tex: 'dirt' },
  s: { name: 'Dienvidu kāpas', icon: '🏖️', map: '#e2cf94', ground: '#d8c48c', tex: 'sand' },
  w: { name: 'Rietumu sils', icon: '🌲', map: '#4f7a44', ground: '#5d7044', tex: 'forest' },
};

export const zoneOffset = (id) => { const d = DIRS[id]; return d ? [d[0] * ZONE_SIZE, d[1] * ZONE_SIZE] : [0, 0]; };
// kaimiņš zemei `id` virzienā `side` (vai null)
export function neighbour(id, side) {
  if (id === 'c') return side;
  return side === OPP[id] ? 'c' : null;
}
export const openSides = (id) => Object.keys(DIRS).filter((s) => neighbour(id, s));

export function alongLat(x, z, side) {
  const [dx, dz] = DIRS[side];
  return { along: x * dx + z * dz, lat: x * dz - z * dx };
}
export const sqDist = (x, z) => Math.max(Math.abs(x), Math.abs(z));

// Notur spēlētāju kvadrātā; pār atvērtajām robežām var paiet nedaudz tālāk (tur notiek pāreja)
export function clampSquare(pos, open) {
  const H = ZONE_HALF;
  let hit = false;
  for (const s in DIRS) {
    const [dx, dz] = DIRS[s];
    const along = pos.x * dx + pos.z * dz;
    const lim = open.includes(s) ? H + CROSS_AT + 3 : H;
    if (along > lim) { pos.x -= dx * (along - lim); pos.z -= dz * (along - lim); hit = true; }
  }
  return hit;
}

// robežstabiņi gar atvērtajām robežām (viens zīmēšanas izsaukums)
export function buildBorderPosts(open, groundY) {
  const H = ZONE_HALF, pts = [];
  for (const s of open) {
    const [dx, dz] = DIRS[s];
    for (let l = -H + 15; l <= H - 15; l += 30) pts.push([dx * H - dz * l, dz * H + dx * l]);
  }
  const geo = new THREE.CylinderGeometry(0.12, 0.14, 1.3, 6, 4).translate(0, 0.6, 0);
  // sarkani-balti svītrots stabiņš no virsotņu krāsām
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const red = Math.floor((pos.getY(i) + 0.04) / 0.33) % 2 === 1;
    col.set(red ? [0.75, 0.12, 0.1] : [0.92, 0.9, 0.86], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true }), pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, z], i) => { m4.makeTranslation(x, groundY(x, z) - 0.05, z); im.setMatrixAt(i, m4); });
  im.castShadow = true;
  return im;
}

// zemes materiāls ar trokšņa faktūru (zemā grafikā) vai foto faktūru (augstā/vidējā)
export function groundMaterial(id, hi, repeat) {
  const d = ZONES[id];
  const tex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const l = 95 + Math.random() * 70;
      g.fillStyle = `rgba(${l},${l},${l},0.5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat * 0.75, repeat * 0.75);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.ground).multiplyScalar(1.5), map: tex, roughness: 1 });
  if (hi && d.tex) {
    mat.userData.ready = Promise.all([loadTexture(`assets/tex/${d.tex}_c.jpg`, true, repeat), loadTexture(`assets/tex/${d.tex}_n.jpg`, false, repeat)]).then(([c, n]) => {
      if (mat.userData.disposed) { c.dispose(); n.dispose(); return; }
      mat.map.dispose();
      mat.map = c; mat.normalMap = n;
      mat.color.set('#ffffff');
      mat.needsUpdate = true;
    }).catch((e) => console.warn(e));
  }
  return mat;
}

// izmet visu objektu koku no GPU atmiņas (ģeometrijas, materiālus, faktūras).
// Renderēšanas mērķu faktūras (vides gaisma, atspulgs) netiek aiztiktas.
export function disposeTree(root, keep) {
  const seen = new Set(keep || []);
  root.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (seen.has(m)) continue;
      seen.add(m);
      m.userData.disposed = true;
      for (const k in m) {
        const v = m[k];
        if (v && v.isTexture && !v.isRenderTargetTexture && !seen.has(v)) { seen.add(v); v.dispose(); }
      }
      m.dispose();
    }
  });
}

// Atbrīvo GPU atmiņu (ģeometriju buferus un faktūras), bet saglabā JS datus: kad objekts atkal tiek zīmēts,
// three.js tos automātiski augšupielādē no jauna. Renderēšanas mērķu faktūras netiek aiztiktas.
export function freeGpu(root, extraTextures = []) {
  const seen = new Set();
  const tex = (v) => { if (v && v.isTexture && !v.isRenderTargetTexture && !seen.has(v)) { seen.add(v); v.dispose(); } };
  root.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    if (o.isInstancedMesh) o.dispose(); // instanču matricu buferi
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const k in m) tex(m[k]);
      if (m.uniforms) for (const k in m.uniforms) tex(m.uniforms[k].value);
    }
  });
  extraTextures.forEach(tex);
}

// ---------- grants ceļi (pa tiem vēlāk varēs braukt ar mašīnu) ----------
export const ROAD_HW = 3.6; // ceļa puse platuma (≈7 m — divas riepu sliedes)

// gluda līnija caur pieturas punktiem ~1.5 m solī: [{x, z}]
export function smoothRoad(pts, step = 1.5) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  return c.getSpacedPoints(Math.max(2, Math.ceil(c.getLength() / step))).map((v) => ({ x: v.x, z: v.z }));
}

// attālums līdz tuvākajam ceļam (ātrai pārbaudei — rupjš režģis ar līniju punktiem)
export class RoadIndex {
  constructor(lines) {
    this.lines = lines;
    this.cells = new Map();
    for (const l of lines) for (const p of l) {
      const k = Math.floor(p.x / 16) + ',' + Math.floor(p.z / 16);
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(p);
    }
  }
  // attālums (līdz 32 m; tālāk — 99) un tuvākais punkts
  near(x, z) {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    let best = 99 * 99, bp = null;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const l = this.cells.get((cx + a) + ',' + (cz + b));
      if (l) for (const p of l) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; bp = p; } }
    }
    return { d: Math.sqrt(best), p: bp };
  }
}

// grants faktūra: brūna zeme ar divām riepu sliedēm, zāle vidū, mīkstas malas (caurspīdīgas)
let roadMat = null;
export function roadMaterial() {
  if (roadMat) return roadMat;
  const tex = canvasTexture(128, 512, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const rut = Math.min(Math.abs(u - 0.3), Math.abs(u - 0.7));
      let l = 0.92 + Math.random() * 0.22, r = 132, gg = 108, b = 76;
      if (rut < 0.07) { l *= 0.8 + rut * 2.2; }                    // sliedes — tumšākas, gludākas
      else if (Math.abs(u - 0.5) < 0.09 && Math.random() < 0.5) { r = 96; gg = 112; b = 58; } // zāle vidū
      if (Math.random() < 0.035) { const s = 0.6 + Math.random() * 0.7; l *= s; }     // akmentiņi
      const a = Math.min(1, Math.min(u, 1 - u) / 0.13);             // mīksta mala
      const k = (y * w + x) * 4;
      img.data[k] = r * l; img.data[k + 1] = gg * l; img.data[k + 2] = b * l; img.data[k + 3] = 255 * a * (0.75 + Math.random() * 0.25);
    }
    g.putImageData(img, 0, 0);
  });
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
  roadMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  return roadMat;
}

// ceļu lente pa zemi (visi ceļi — viens zīmēšanas izsaukums); heightFn(x, z) — zemes augstums
export function buildRoadMesh(lines, heightFn, lift = 0.05) {
  const geos = [];
  const ACROSS = 4;
  for (const l of lines) {
    const n = l.length, P = new Float32Array(n * (ACROSS + 1) * 3), U = new Float32Array(n * (ACROSS + 1) * 2), idx = [];
    let v = 0;
    for (let i = 0; i < n; i++) {
      const a = l[Math.max(0, i - 1)], b = l[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      if (i > 0) v += Math.hypot(l[i].x - l[i - 1].x, l[i].z - l[i - 1].z);
      for (let j = 0; j <= ACROSS; j++) {
        const s = (j / ACROSS * 2 - 1) * ROAD_HW, x = l[i].x - tz * s, z = l[i].z + tx * s, k = i * (ACROSS + 1) + j;
        P.set([x, heightFn(x, z) + lift, z], k * 3);
        U.set([j / ACROSS, v / 9], k * 2);
      }
      if (i > 0) for (let j = 0; j < ACROSS; j++) {
        const c = i * (ACROSS + 1) + j, p = c - ACROSS - 1;
        idx.push(p, p + 1, c, p + 1, c + 1, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g);
  }
  const geo = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  const m = new THREE.Mesh(geo, roadMaterial());
  m.receiveShadow = true;
  m.renderOrder = 1;
  return m;
}

// līdzenās zemes ceļš: no atvērtās robežas līdz centram, kur tas beidzas ar apli (vieta, kur apgriezties)
export function plainRoads(id) {
  const out = [];
  for (const s of openSides(id)) {
    const [dx, dz] = DIRS[s], H = ZONE_HALF;
    const P = (al, lat) => [dx * al - dz * lat, dz * al + dx * lat];
    const pts = [P(H + 40, 0), P(H, 0), P(H - 30, 0), P(200, 18), P(110, -14), P(36, 4)];
    // aplis ap centru (r 16)
    for (let k = 0; k <= 16; k++) { const a = 0.5 + k / 16 * Math.PI * 2; pts.push(P(16 * Math.cos(a), 16 * Math.sin(a))); }
    out.push(pts);
  }
  return out;
}

let woodM = null;
const wood = () => woodM || (woodM = new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.9 }));

// ---------- līdzena blakus zeme ----------
export class PlainZone {
  constructor(id, hi) {
    this.id = id;
    this.def = ZONES[id];
    this.hi = hi;
    this.open = openSides(id);
    this.group = new THREE.Group();
    this.water = null;
    this.platforms = [];
    this.grassCenter = null;
    this.roadLines = plainRoads(id).map((p) => smoothRoad(p));
    this.roadIdx = new RoadIndex(this.roadLines);
  }

  roadDist(x, z) { return this.roadIdx.near(x, z).d; }
  getHeight() { return GROUND_Y; }
  groundAt() { return GROUND_Y; }
  collide(pos) { return clampSquare(pos, this.open); }
  updateVisibility() { /* */ }
  updateClouds() { /* */ }

  // atgriež solījumu, kas izpildās, kad faktūras ielādētas
  build(parent) {
    // zeme: liela plakne, lai mala nebūtu redzama (miglā izzūd)
    this.mat = groundMaterial(this.id, this.hi, 400);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), this.mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = GROUND_Y;
    plane.receiveShadow = true;
    this.group.add(plane);
    this.buildFence();
    this.group.add(buildBorderPosts(this.open, () => GROUND_Y));
    this.group.add(buildRoadMesh(this.roadLines, () => GROUND_Y, 0.03));
    parent.add(this.group);
    return this.mat.userData.ready || Promise.resolve();
  }

  // žogs gar slēgtajām malām (tur nav kaimiņu zemes): stabi — 1 izsaukums, margas — 1 izsaukums
  buildFence() {
    const H = ZONE_HALF, posts = [], rails = [];
    for (const s in DIRS) {
      if (this.open.includes(s)) continue;
      const [dx, dz] = DIRS[s];
      const px = -dz, pz = dx;
      for (let l = -H; l <= H; l += 4) posts.push([dx * (H + 0.5) + px * l, dz * (H + 0.5) + pz * l]);
      for (const y of [0.55, 1.05]) {
        const geo = new THREE.BoxGeometry(2 * H, 0.12, 0.08);
        geo.rotateY(Math.atan2(-pz, px));
        geo.translate(dx * (H + 0.5), GROUND_Y + y, dz * (H + 0.5));
        rails.push(geo);
      }
    }
    if (!posts.length) return;
    const pg = new THREE.CylinderGeometry(0.07, 0.09, 1.4, 5).translate(0, GROUND_Y + 0.6, 0);
    const im = new THREE.InstancedMesh(pg, wood(), posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach(([x, z], i) => { m4.makeTranslation(x, 0, z); im.setMatrixAt(i, m4); });
    this.group.add(im);
    this.group.add(new THREE.Mesh(mergeGeometries(rails), wood()));
    rails.forEach((g) => g.dispose());
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    disposeTree(this.group, [wood(), roadMaterial(), roadMaterial().map]);
  }
}

// Zemes (kartes): centrā Mežvidi, katrā debespusē sava kvadrātveida zeme.
// Katrai zemei ir savas lokālās koordinātas (centrs 0,0); kopējā kartē zeme ir nobīdīta par ZONE_SIZE.
// Uz kaimiņu zemi var aiziet pa jebkuru robežas vietu.
import * as THREE from 'three';
import { canvasTexture } from './util.js?v=1.9.0';
import { loadTexture } from './gfx.js?v=1.9.0';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ZONE_HALF = 420;              // spēles laukuma puse (kvadrāts 840 × 840 m)
export const ZONE_SIZE = ZONE_HALF * 2;    // attālums starp zemju centriem kopējā kartē
export const CROSS_AT = 3;                 // cik metrus aiz robežas notiek pāreja
export const ZONE_IDS = ['c', 'n', 'e', 's', 'w']; // secība = tīkla kods
export const DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
export const GROUND_Y = 1;                 // līdzeno zemju augstums (arī Mežvidu malas pāriet uz to)

// Zemju apraksti. Saturu (uzdevumus) definēsim vēlāk — pagaidām tikai līdzena zeme.
export const ZONES = {
  c: { name: 'Mežvidi', icon: '🌲', map: '#6fa848' },
  n: { name: 'Ziemeļu klajums', icon: '❄️', map: '#9fb8a0', ground: '#8ea38a', tex: 'meadow' },
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
  }

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
    disposeTree(this.group, [wood()]);
  }
}

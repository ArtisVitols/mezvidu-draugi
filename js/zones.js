// Zemes (kartes): centrā Mežvidi, katrā debespusē sava kvadrātveida zeme.
// Katrai zemei ir savas lokālās koordinātas (centrs 0,0); kopējā kartē zeme ir nobīdīta par ZONE_SIZE.
import * as THREE from 'three';
import { smoothstep, makeTextSprite, canvasTexture } from './util.js?v=1.7.0';
import { loadTexture } from './gfx.js?v=1.7.0';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ZONE_HALF = 420;              // spēles laukuma puse (kvadrāts 840 × 840 m)
export const ZONE_SIZE = ZONE_HALF * 2;    // attālums starp zemju centriem kopējā kartē
export const EXIT_W = 7;                   // pārejas (takas) puse platuma
export const ZONE_IDS = ['c', 'n', 'e', 's', 'w']; // secība = tīkla kods
export const DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };

// Zemju apraksti. Saturu (uzdevumus) definēsim vēlāk — pagaidām tikai līdzena zeme.
export const ZONES = {
  c: { name: 'Mežvidi', icon: '🌲', map: '#6fa848' },
  n: { name: 'Ziemeļu klajums', icon: '❄️', map: '#9fb8a0', ground: '#8ea38a', tex: 'meadow' },
  e: { name: 'Austrumu lauki', icon: '🌻', map: '#c9b45a', ground: '#b49a52', tex: 'dirt' },
  s: { name: 'Dienvidu kāpas', icon: '🏖️', map: '#e2cf94', ground: '#d8c48c', tex: 'sand' },
  w: { name: 'Rietumu sils', icon: '🌲', map: '#4f7a44', ground: '#5d7044', tex: 'forest' },
};

export const zoneOffset = (id) => { const d = DIRS[id]; return d ? [d[0] * ZONE_SIZE, d[1] * ZONE_SIZE] : [0, 0]; };

// tuvākā mala un koordinātas attiecībā pret to (along — cik tālu uz malas pusi, lat — sānis no takas)
export function sideOf(x, z) { return Math.abs(x) > Math.abs(z) ? (x > 0 ? 'e' : 'w') : (z > 0 ? 's' : 'n'); }
export function alongLat(x, z, side) {
  const [dx, dz] = DIRS[side];
  return { along: x * dx + z * dz, lat: Math.abs(x * dz - z * dx) };
}
// 0..1 — cik ļoti punkts atrodas pārejas koridorā (izmanto Mežvidu reljefs: kalnos ir izcirsta taka)
export function corridor(x, z) {
  const s = sideOf(x, z);
  return 1 - smoothstep(EXIT_W, EXIT_W + 11, alongLat(x, z, s).lat);
}
export const sqDist = (x, z) => Math.max(Math.abs(x), Math.abs(z));

// Notur spēlētāju kvadrātā; pa atvērtajām malām var iziet takā līdz +12 m (tur notiek pāreja)
export function clampSquare(pos, open) {
  const H = ZONE_HALF;
  let hit = false;
  for (const s in DIRS) {
    const [dx, dz] = DIRS[s];
    const along = pos.x * dx + pos.z * dz;
    if (along <= H) continue;
    const latS = pos.x * dz - pos.z * dx;
    if (open.includes(s) && Math.abs(latS) < EXIT_W + 1.5) {
      const lim = EXIT_W - 1;
      if (Math.abs(latS) > lim) {
        const k = (Math.sign(latS) * lim - latS);
        pos.x += k * dz; pos.z -= k * dx; hit = true;
      }
      if (along > H + 12) { pos.x -= dx * (along - H - 12); pos.z -= dz * (along - H - 12); hit = true; }
    } else {
      pos.x -= dx * (along - H); pos.z -= dz * (along - H); hit = true;
    }
  }
  return hit;
}

// ---------- kopīgi modeļi: ceļa rādītājs un vārti pie pārejas ----------
let woodM = null;
const wood = () => woodM || (woodM = new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.9 }));

// side — mala, pie kuras stāv; text — kurp ved
export function buildExit(side, text, groundY) {
  const g = new THREE.Group();
  const [dx, dz] = DIRS[side];
  const px = -dz, pz = dx; // sānu virziens
  const H = ZONE_HALF;
  const post = new THREE.CylinderGeometry(0.22, 0.26, 4.2, 8);
  post.translate(0, 2.1, 0);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(post, wood());
    const x = dx * (H - 1) + px * s * (EXIT_W - 0.5), z = dz * (H - 1) + pz * s * (EXIT_W - 0.5);
    p.position.set(x, groundY(x, z) - 0.2, z);
    p.castShadow = true;
    g.add(p);
  }
  const bx = dx * (H - 1), bz = dz * (H - 1);
  const beamY = Math.max(groundY(bx + px * (EXIT_W - 0.5), bz + pz * (EXIT_W - 0.5)), groundY(bx - px * (EXIT_W - 0.5), bz - pz * (EXIT_W - 0.5))) + 3.7;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(EXIT_W * 2 + 0.6, 0.35, 0.35), wood());
  beam.position.set(bx, beamY, bz);
  beam.rotation.y = Math.atan2(-pz, px); // gar sānu virzienu
  beam.castShadow = true;
  g.add(beam);
  const t = makeTextSprite(text, { fontSize: 44, bg: 'rgba(90,60,30,0.9)' });
  t.position.set(bx, beamY + 1.1, bz);
  g.add(t);
  // stabiņš ar norādi pirms vārtiem
  const sx = dx * (H - 16) + px * (EXIT_W + 2.5), sz = dz * (H - 16) + pz * (EXIT_W + 2.5);
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 6).translate(0, 1.3, 0), wood());
  sp.position.set(sx, groundY(sx, sz) - 0.1, sz);
  g.add(sp);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.08), wood());
  board.position.set(0, 2.25, 0);
  board.rotation.y = Math.atan2(-pz, px);
  sp.add(board);
  const st = makeTextSprite('➜ ' + text, { fontSize: 34, bg: 'rgba(255,255,255,0.85)', color: '#4a3010' });
  st.position.set(0, 3.0, 0);
  sp.add(st);
  return g;
}

// ---------- līdzena blakus zeme ----------
const ZY = 1; // zemes augstums

export class PlainZone {
  constructor(id, hi) {
    this.id = id;
    this.def = ZONES[id];
    this.hi = hi;
    this.exitSide = OPP[id]; // vienīgā izeja — atpakaļ uz Mežvidiem
    this.group = new THREE.Group();
    this.water = null;
    this.platforms = [];
    this.grassCenter = null;
  }

  getHeight() { return ZY; }
  groundAt() { return ZY; }
  collide(pos) { return clampSquare(pos, [this.exitSide]); }
  updateVisibility() { /* */ }
  updateClouds() { /* */ }

  build(parent) {
    const d = this.def;
    // zeme: liela plakne, lai mala nebūtu redzama (miglā izzūd)
    const tex = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const l = 95 + Math.random() * 70;
        g.fillStyle = `rgba(${l},${l},${l},0.5)`;
        g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(300, 300);
    this.mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.ground).multiplyScalar(1.5), map: tex, roughness: 1 });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), this.mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = ZY;
    plane.receiveShadow = true;
    this.group.add(plane);
    if (this.hi && d.tex) {
      // foto faktūra, ja grafika augsta/vidēja
      Promise.all([loadTexture(`assets/tex/${d.tex}_c.jpg`, true, 400), loadTexture(`assets/tex/${d.tex}_n.jpg`, false, 400)]).then(([c, n]) => {
        if (this.disposed) { c.dispose(); n.dispose(); return; }
        this.mat.map.dispose();
        this.mat.map = c; this.mat.normalMap = n;
        this.mat.color.set('#ffffff');
        this.mat.needsUpdate = true;
      }).catch((e) => console.warn(e));
    }
    this.buildFence();
    this.group.add(buildExit(this.exitSide, `${ZONES.c.icon} Uz: ${ZONES.c.name}`, () => ZY));
    const title = makeTextSprite(`${d.icon} ${d.name}`, { fontSize: 56, bg: 'rgba(0,0,0,0.45)' });
    title.position.set(0, ZY + 6, 0);
    title.scale.multiplyScalar(2);
    this.group.add(title);
    parent.add(this.group);
  }

  // žogs gar malām (ar spraugu izejai)
  buildFence() {
    const H = ZONE_HALF, posts = [], rails = [];
    for (const s in DIRS) {
      const [dx, dz] = DIRS[s];
      const px = -dz, pz = dx;
      const open = s === this.exitSide;
      for (let l = -H; l <= H; l += 4) {
        if (open && Math.abs(l) < EXIT_W) continue;
        posts.push([dx * (H + 0.5) + px * l, dz * (H + 0.5) + pz * l]);
      }
      const segs = open ? [[-H, -EXIT_W], [EXIT_W, H]] : [[-H, H]];
      for (const [a, b] of segs) for (const y of [0.55, 1.05]) {
        const geo = new THREE.BoxGeometry(b - a, 0.12, 0.08);
        const m = (a + b) / 2;
        geo.rotateY(Math.atan2(-pz, px));
        geo.translate(dx * (H + 0.5) + px * m, ZY + y, dz * (H + 0.5) + pz * m);
        rails.push(geo);
      }
    }
    const pg = new THREE.CylinderGeometry(0.07, 0.09, 1.4, 5).translate(0, ZY + 0.6, 0);
    const im = new THREE.InstancedMesh(pg, wood(), posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach(([x, z], i) => { m4.makeTranslation(x, 0, z); im.setMatrixAt(i, m4); });
    this.group.add(im);
    this.group.add(new THREE.Mesh(mergeGeometries(rails), wood()));
  }

  dispose() {
    this.disposed = true;
    if (this.group.parent) this.group.parent.remove(this.group);
    const w = wood();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) {
        if (m === w) continue;
        for (const k of ['map', 'normalMap']) if (m[k]) m[k].dispose();
        m.dispose();
      }
    });
  }
}

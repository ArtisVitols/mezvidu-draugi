import * as THREE from 'three';
import { makeNoise2D, mulberry32 } from './noise.js';
import { MUSHROOMS } from './data.js';
import { mat, smoothstep, lerp, makeTextSprite, canvasTexture } from './util.js';

export const SIZE = 420;
export const SEG = 168;
export const CELL = SIZE / SEG;
export const HALF = SIZE / 2;
export const WATER_Y = 0;
export const VILLAGE_Y = 4;
export const TRACK_Y = 3;
export const PLAY_RADIUS = 180;
export const TRACK_WIDTH = 12;
export const TRACK_N = 400;

const TRACK_CENTER = { x: 112, z: -12 };
const TRACK_PTS = [
  [-50, 0], [-42, -28], [-14, -40], [16, -32], [34, -42], [52, -20],
  [46, 10], [22, 14], [12, 34], [-18, 40], [-44, 24],
];

export const GARDEN_SLOTS = [
  { x: -24, z: -21 }, { x: -24, z: -8 }, { x: -24, z: 5 }, { x: -24, z: 18 },
];
export function plotPos(slot, i) {
  const g = GARDEN_SLOTS[slot];
  const c = i % 3, r = Math.floor(i / 3);
  return { x: g.x + (r - 0.5) * 2.6, z: g.z + (c - 1) * 2.6 };
}

export const VENDORS = [
  { id: 'seeds', name: 'Ūdrs Ojārs', title: '🌱 Sēklas', x: 14, z: -12, animal: 'udrs', fur: '#6b4a2e', shirt: '#2fa84f', cart: '#3c9a4a' },
  { id: 'buyer', name: 'Āpsis Arnolds', title: '🧺 Uzpērku', x: 18, z: 0, animal: 'apsis', fur: '#7d7d7d', shirt: '#2f6fd6', cart: '#2f6fd6' },
  { id: 'hats', name: 'Pūce Paula', title: '🎩 Cepures', x: 14, z: 12, animal: 'puce', fur: '#9a7348', shirt: '#9b3bd2', cart: '#b04ad2' },
];

export const SPAWN = { x: 5, z: 5 };

export class World {
  constructor(seed) {
    this.seed = seed;
    this.noise = makeNoise2D(seed);
    this.noise2 = makeNoise2D(seed + 1);
    this.rnd = mulberry32(seed + 7);
    this.group = new THREE.Group();
    this.grid = new Map();
    this.buildTrackCurve();
    this.computeHeights();
  }

  // ---------- trase ----------
  buildTrackCurve() {
    const pts = TRACK_PTS.map(([x, z]) => new THREE.Vector3(TRACK_CENTER.x + x, TRACK_Y, TRACK_CENTER.z + z));
    this.trackCurve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const sp = this.trackCurve.getSpacedPoints(TRACK_N);
    sp.pop();
    this.trackPts = sp;
    this.trackLen = this.trackCurve.getLength();
    this.trackTan = sp.map((p, i) => {
      const a = sp[(i - 1 + TRACK_N) % TRACK_N], b = sp[(i + 1) % TRACK_N];
      return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    });
    const s0 = sp[0], t0 = this.trackTan[0];
    this.roadEnd = { x: s0.x - t0.z * -14, z: s0.z + t0.x * -14 };
  }

  trackDist(x, z) {
    let best = 1e9;
    const p = this.trackPts;
    for (let i = 0; i < TRACK_N; i += 2) {
      const dx = p[i].x - x, dz = p[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  // tuvākais trases punkts, meklējot ap iepriekšējo indeksu
  nearestTrackIdx(x, z, hint = -1) {
    const p = this.trackPts;
    let best = 1e9, bi = 0;
    if (hint >= 0) {
      for (let k = -25; k <= 25; k++) {
        const i = (hint + k + TRACK_N) % TRACK_N;
        const dx = p[i].x - x, dz = p[i].z - z, d = dx * dx + dz * dz;
        if (d < best) { best = d; bi = i; }
      }
      if (best < 400) return { idx: bi, dist: Math.sqrt(best) };
    }
    for (let i = 0; i < TRACK_N; i++) {
      const dx = p[i].x - x, dz = p[i].z - z, d = dx * dx + dz * dz;
      if (d < best) { best = d; bi = i; }
    }
    return { idx: bi, dist: Math.sqrt(best) };
  }

  roadDist(x, z) {
    const ax = 34, az = 0, bx = this.roadEnd.x, bz = this.roadEnd.z;
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    const px = ax + vx * t, pz = az + vz * t;
    return { d: Math.hypot(x - px, z - pz), t };
  }

  forest(x, z) {
    return this.noise2(x * 0.011, z * 0.011) + 0.25 * this.noise2(x * 0.05 + 9, z * 0.05 - 4);
  }

  naturalHeight(x, z) {
    const n = this.noise;
    let h = n(x * 0.0045, z * 0.0045) * 12 + n(x * 0.013 + 31, z * 0.013 - 17) * 5 + n(x * 0.04 - 7, z * 0.04 + 3) * 1.2;
    const hv = n(x * 0.008 + 200, z * 0.008 - 300);
    if (hv > 0) h += hv * hv * 55;
    return h + 2.5;
  }

  computeHeight(x, z) {
    let h = this.naturalHeight(x, z);
    const d = Math.hypot(x, z);
    h = lerp(h, VILLAGE_Y, 1 - smoothstep(34, 62, d));
    const rd = this.roadDist(x, z);
    h = lerp(h, lerp(VILLAGE_Y, TRACK_Y, rd.t), 1 - smoothstep(3, 9, rd.d));
    const td = this.trackDist(x, z);
    h = lerp(h, TRACK_Y - 0.05, 1 - smoothstep(TRACK_WIDTH / 2 + 3, TRACK_WIDTH / 2 + 16, td));
    if (d > 165) h += (d - 165) * (d - 165) * 0.07;
    return h;
  }

  computeHeights() {
    const n = SEG + 1;
    this.heights = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
        this.heights[iz * n + ix] = this.computeHeight(x, z);
      }
    }
  }

  // augstums, kas precīzi sakrīt ar zemes trijstūriem
  getHeight(x, z) {
    const n = SEG + 1;
    let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    fx = Math.max(0, Math.min(SEG - 0.0001, fx));
    fz = Math.max(0, Math.min(SEG - 0.0001, fz));
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const u = fx - ix, v = fz - iz;
    const H = this.heights;
    const ha = H[iz * n + ix], hb = H[(iz + 1) * n + ix], hc = H[(iz + 1) * n + ix + 1], hd = H[iz * n + ix + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }

  isWater(x, z) { return this.getHeight(x, z) < WATER_Y - 0.2; }

  // ---------- sadursmes ----------
  addCollider(x, z, r) {
    const k = Math.floor(x / 8) + ',' + Math.floor(z / 8);
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push([x, z, r]);
  }

  collide(pos, radius) {
    const cx = Math.floor(pos.x / 8), cz = Math.floor(pos.z / 8);
    let hit = false;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this.grid.get((cx + a) + ',' + (cz + b));
      if (!list) continue;
      for (const c of list) {
        const dx = pos.x - c[0], dz = pos.z - c[1];
        const min = c[2] + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = c[0] + dx / d * min;
          pos.z = c[1] + dz / d * min;
          hit = true;
        }
      }
    }
    const r = Math.hypot(pos.x, pos.z);
    if (r > PLAY_RADIUS) { pos.x *= PLAY_RADIUS / r; pos.z *= PLAY_RADIUS / r; hit = true; }
    return hit;
  }

  // ---------- būvēšana ----------
  build(scene) {
    scene.add(this.group);
    this.buildTerrain();
    this.buildWater();
    this.buildTrackMesh();
    this.buildVillage();
    this.buildTrees();
    this.buildRocksAndFlowers();
    this.buildClouds();
    this.placeMushrooms();
    this.placeStars();
    this.placeNpcHomes();
  }

  buildTerrain() {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const sandDark = new THREE.Color('#bfae74'), sand = new THREE.Color('#e6d59a');
    const grass = new THREE.Color('#6fb24a'), grass2 = new THREE.Color('#86c25a');
    const forestG = new THREE.Color('#467f33'), rock = new THREE.Color('#8d8c84');
    const road = new THREE.Color('#a8865a'), village = new THREE.Color('#82c35a');
    const n = SEG + 1;
    for (let i = 0; i < pos.count; i++) {
      const ix = i % n, iz = Math.floor(i / n);
      const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
      const h = this.heights[iz * n + ix];
      pos.setY(i, h);
      const v = this.noise2(x * 0.08, z * 0.08) * 0.5 + 0.5;
      if (h < -0.3) c.copy(sandDark);
      else if (h < 1.0) c.copy(sand);
      else {
        c.copy(grass).lerp(grass2, v);
        const f = this.forest(x, z);
        if (f > 0.12) c.lerp(forestG, Math.min(1, (f - 0.12) * 5));
        if (Math.hypot(x, z) < 30) c.lerp(village, 0.6);
        if (h > 26) c.lerp(rock, Math.min(1, (h - 26) / 10));
        if (this.roadDist(x, z).d < 2.6) c.copy(road);
      }
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.group.add(m);
    this.terrain = m;
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(SIZE * 1.6, SIZE * 1.6);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#3b8fd9', transparent: true, opacity: 0.78 }));
    m.position.y = WATER_Y;
    m.renderOrder = 2;
    this.group.add(m);
    this.water = m;
  }

  buildTrackMesh() {
    const P = this.trackPts, T = this.trackTan, W = TRACK_WIDTH / 2, Y = TRACK_Y + 0.04;
    const verts = [], idx = [];
    for (let i = 0; i <= TRACK_N; i++) {
      const p = P[i % TRACK_N], t = T[i % TRACK_N];
      const lx = -t.z, lz = t.x;
      verts.push(p.x + lx * W, Y, p.z + lz * W, p.x - lx * W, Y, p.z - lz * W);
      if (i < TRACK_N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const road = new THREE.Mesh(g, mat('#5a5a60'));
    this.group.add(road);

    // apmales sarkanbaltas
    const cv = [], cc = [];
    const red = new THREE.Color('#e03030'), white = new THREE.Color('#f4f4f4');
    for (const side of [1, -1]) {
      for (let i = 0; i < TRACK_N; i++) {
        const p0 = P[i], p1 = P[(i + 1) % TRACK_N], t0 = T[i], t1 = T[(i + 1) % TRACK_N];
        const col = Math.floor(i / 3) % 2 ? red : white;
        const a = [p0.x - t0.z * W * side, p0.z + t0.x * W * side];
        const b = [p0.x - t0.z * (W + 0.9) * side, p0.z + t0.x * (W + 0.9) * side];
        const c = [p1.x - t1.z * W * side, p1.z + t1.x * W * side];
        const d = [p1.x - t1.z * (W + 0.9) * side, p1.z + t1.x * (W + 0.9) * side];
        const tri = [a, b, c, b, d, c];
        for (const q of tri) { cv.push(q[0], Y + 0.03, q[1]); cc.push(col.r, col.g, col.b); }
      }
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cv, 3));
    cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    cg.computeVertexNormals();
    this.group.add(new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

    // starta līnija
    const checker = canvasTexture(128, 32, (g2, w, h) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
        g2.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g2.fillRect(x * 8, y * 8, 8, 8);
      }
    });
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH, 2), new THREE.MeshLambertMaterial({ map: checker }));
    sl.rotation.order = 'YXZ';
    sl.rotation.y = Math.atan2(T[0].x, T[0].z);
    sl.rotation.x = -Math.PI / 2;
    sl.position.set(P[0].x, Y + 0.02, P[0].z);
    this.group.add(sl);
    // starta vārti
    const gate = new THREE.Group();
    const poleG = new THREE.CylinderGeometry(0.25, 0.25, 6, 8);
    for (const s of [1, -1]) {
      const pole = new THREE.Mesh(poleG, mat('#dddddd'));
      pole.position.set(s * (W + 1.2), 3, 0);
      gate.add(pole);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 2.4, 1.4, 0.2), new THREE.MeshLambertMaterial({
      map: canvasTexture(512, 64, (g2, w, h) => {
        g2.fillStyle = '#d23b3b'; g2.fillRect(0, 0, w, h);
        g2.fillStyle = '#fff'; g2.font = 'bold 48px sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
        g2.fillText('STARTS • FINIŠS', w / 2, h / 2 + 2);
      })
    }));
    banner.position.y = 5.6;
    gate.add(banner);
    gate.position.set(P[0].x, TRACK_Y, P[0].z);
    gate.rotation.y = Math.atan2(T[0].x, T[0].z);
    this.group.add(gate);
    for (const s of [1, -1]) {
      this.addCollider(P[0].x - T[0].z * (W + 1.2) * s, P[0].z + T[0].x * (W + 1.2) * s, 0.4);
    }

    // paātrinājuma joslas
    const arrowTex = canvasTexture(64, 64, (g2, w, h) => {
      g2.fillStyle = '#ffd21a'; g2.fillRect(0, 0, w, h);
      g2.fillStyle = '#ff7a00';
      g2.beginPath(); g2.moveTo(32, 6); g2.lineTo(58, 34); g2.lineTo(44, 34); g2.lineTo(44, 58); g2.lineTo(20, 58); g2.lineTo(20, 34); g2.lineTo(6, 34); g2.closePath(); g2.fill();
    });
    this.boostPads = [];
    for (const f of [0.22, 0.5, 0.78]) {
      const i = Math.floor(f * TRACK_N);
      const p = P[i], t = T[i];
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: arrowTex }));
      pad.rotation.order = 'YXZ';
      pad.rotation.y = Math.atan2(t.x, t.z);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(p.x, Y + 0.05, p.z);
      this.group.add(pad);
      this.boostPads.push({ x: p.x, z: p.z });
    }

    // kartu stāvvieta
    const k = 14, pk = P[k], tk = T[k];
    this.kartSpot = { x: pk.x + tk.z * (W + 6), z: pk.z - tk.x * (W + 6), heading: Math.atan2(tk.x, tk.z) };
    const sign = makeTextSprite('🏎️ Kartings', { fontSize: 48, bg: 'rgba(210,40,40,0.85)' });
    sign.position.set(this.kartSpot.x, TRACK_Y + 3.4, this.kartSpot.z);
    this.group.add(sign);
    const pad2 = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), mat('#e8e0c8'));
    pad2.rotation.x = -Math.PI / 2;
    pad2.position.set(this.kartSpot.x, this.getHeight(this.kartSpot.x, this.kartSpot.z) + 0.06, this.kartSpot.z);
    this.group.add(pad2);
  }

  gridSlot(k) {
    const back = 6 + Math.floor(k / 2) * 5;
    const i = (TRACK_N - back) % TRACK_N;
    const p = this.trackPts[i], t = this.trackTan[i];
    const side = k % 2 ? -2.6 : 2.6;
    return { x: p.x - t.z * side, z: p.z + t.x * side, heading: Math.atan2(t.x, t.z), idx: i };
  }

  buildVillage() {
    const g = this.group;
    // aka
    const well = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 1, 12, 1, true), mat('#9a9a92', { side: THREE.DoubleSide }));
    ring.position.y = 0.5; well.add(ring);
    const wat = new THREE.Mesh(new THREE.CircleGeometry(1.25, 12), mat('#3b8fd9'));
    wat.rotation.x = -Math.PI / 2; wat.position.y = 0.6; well.add(wat);
    for (const s of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 0.2), mat('#7a5230'));
      post.position.set(s * 1.2, 1.2, 0); well.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.1, 4), mat('#b5452e'));
    roof.position.y = 2.8; roof.rotation.y = Math.PI / 4; well.add(roof);
    well.position.set(0, VILLAGE_Y, 0);
    g.add(well);
    this.addCollider(0, 0, 1.5);

    // mājiņas
    const houses = [[4, -30, 0.2], [20, -25, -0.4], [6, 30, 3.0], [-10, 32, 2.8], [-34, -32, 0.8]];
    const wallCols = ['#f3e2b8', '#e8c9a0', '#f6f1e6', '#d9e6f2', '#f2d4d4'];
    houses.forEach(([x, z, r], i) => {
      const h = new THREE.Group();
      const w = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4.4), mat(wallCols[i]));
      w.position.y = 1.5; h.add(w);
      const rf = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 3.6, 2.2, 4, 1), mat('#a3402c'));
      rf.position.y = 4.1; rf.rotation.y = Math.PI / 4; rf.scale.set(1, 1, 0.9); h.add(rf);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.1), mat('#6b4423'));
      door.position.set(0, 0.9, 2.22); h.add(door);
      for (const s of [1, -1]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.1), mat('#7fc4ff'));
        win.position.set(s * 1.6, 1.8, 2.22); h.add(win);
      }
      const y = this.getHeight(x, z);
      h.position.set(x, y, z); h.rotation.y = r;
      g.add(h);
      this.addCollider(x, z, 3.1);
    });

    // dārzu žogi
    GARDEN_SLOTS.forEach((s) => {
      const fence = new THREE.Group();
      const postG = new THREE.BoxGeometry(0.15, 0.8, 0.15);
      const railX = new THREE.BoxGeometry(6.6, 0.1, 0.08), railZ = new THREE.BoxGeometry(0.08, 0.1, 9.2);
      const hw = 3.3, hd = 4.6;
      for (const [px, pz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [-hw, 0], [hw, 0]]) {
        const p = new THREE.Mesh(postG, mat('#8a6238')); p.position.set(px, 0.4, pz); fence.add(p);
      }
      for (const y of [0.35, 0.65]) {
        for (const pz of [-hd, hd]) { const r = new THREE.Mesh(railX, mat('#a77a4a')); r.position.set(0, y, pz); fence.add(r); }
        const r = new THREE.Mesh(railZ, mat('#a77a4a')); r.position.set(-hw, y, 0); fence.add(r);
      }
      fence.position.set(s.x, VILLAGE_Y, s.z);
      g.add(fence);
    });

    // ceļa zīme
    const sign = makeTextSprite('🏡 Mežvidi', { fontSize: 52, bg: 'rgba(60,120,40,0.85)' });
    sign.position.set(30, VILLAGE_Y + 3, -4);
    g.add(sign);
  }

  buildTrees() {
    const rnd = this.rnd;
    const trunks = [], cones = [], crowns = [];
    const step = 3.7;
    for (let gx = -HALF; gx < HALF; gx += step) {
      for (let gz = -HALF; gz < HALF; gz += step) {
        const x = gx + (rnd() - 0.5) * step * 0.9, z = gz + (rnd() - 0.5) * step * 0.9;
        const r = Math.hypot(x, z);
        if (r > 176 || r < 42) { rnd(); rnd(); continue; }
        const h = this.getHeight(x, z);
        if (h < 1.3 || h > 36) { rnd(); rnd(); continue; }
        if (this.roadDist(x, z).d < 5) { rnd(); rnd(); continue; }
        const f = this.forest(x, z);
        const p = f > 0.12 ? 0.6 : 0.025;
        if (rnd() > p) { rnd(); continue; }
        if (this.trackDist(x, z) < TRACK_WIDTH / 2 + 5) { rnd(); continue; }
        const s = 0.8 + rnd() * 0.6;
        const t = rnd();
        const kind = f > 0.12 ? (t < 0.5 ? 'egle' : t < 0.75 ? 'priede' : 'berzs') : (t < 0.5 ? 'berzs' : 'ozols');
        this.addTree(kind, x, h, z, s, trunks, cones, crowns, rnd);
      }
    }
    this.treeCount = trunks.length;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const mk = (geo, list, material) => {
      const im = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((d, i) => {
        dummy.position.set(d.x, d.y, d.z);
        dummy.scale.set(d.sx, d.sy, d.sz);
        dummy.rotation.set(0, d.ry || 0, 0);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        im.setColorAt(i, col.set(d.c));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.group.add(im);
      return im;
    };
    const trunkG = new THREE.CylinderGeometry(0.16, 0.24, 1, 6); trunkG.translate(0, 0.5, 0);
    const coneG = new THREE.ConeGeometry(1.4, 2.6, 7); coneG.translate(0, 1.3, 0);
    const crownG = new THREE.IcosahedronGeometry(1.2, 0);
    const white = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
    mk(trunkG, trunks, white);
    mk(coneG, cones, white);
    mk(crownG, crowns, white);
  }

  addTree(kind, x, y, z, s, trunks, cones, crowns, rnd) {
    const ry = rnd() * 6.28;
    if (kind === 'egle') {
      trunks.push({ x, y, z, sx: s, sy: 1.6 * s, sz: s, c: '#6b4423' });
      const g = ['#2f6b34', '#2a5f30', '#356f3a'][Math.floor(rnd() * 3)];
      cones.push({ x, y: y + 1.0 * s, z, sx: s, sy: s, sz: s, c: g, ry });
      cones.push({ x, y: y + 2.4 * s, z, sx: 0.72 * s, sy: 0.85 * s, sz: 0.72 * s, c: g, ry });
      this.addCollider(x, z, 0.45 * s);
    } else if (kind === 'priede') {
      trunks.push({ x, y, z, sx: s * 0.9, sy: 4.2 * s, sz: s * 0.9, c: '#a0582c' });
      crowns.push({ x, y: y + 4.6 * s, z, sx: 1.4 * s, sy: 0.75 * s, sz: 1.4 * s, c: '#3d6e2e', ry });
      this.addCollider(x, z, 0.35 * s);
    } else if (kind === 'berzs') {
      trunks.push({ x, y, z, sx: s * 0.8, sy: 3.2 * s, sz: s * 0.8, c: '#f2f0ea' });
      crowns.push({ x, y: y + 3.6 * s, z, sx: 1.1 * s, sy: 1.35 * s, sz: 1.1 * s, c: ['#8cc63f', '#9ad04a', '#7fbf3a'][Math.floor(rnd() * 3)], ry });
      this.addCollider(x, z, 0.3 * s);
    } else {
      trunks.push({ x, y, z, sx: s * 1.5, sy: 2.4 * s, sz: s * 1.5, c: '#5e3d22' });
      crowns.push({ x, y: y + 3.4 * s, z, sx: 2.0 * s, sy: 1.6 * s, sz: 2.0 * s, c: '#4f8f32', ry });
      this.addCollider(x, z, 0.5 * s);
    }
  }

  buildRocksAndFlowers() {
    const rnd = mulberry32(this.seed + 99);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    // akmeņi
    const rocks = [];
    for (let i = 0; i < 4000 && rocks.length < 260; i++) {
      const x = (rnd() - 0.5) * 2 * 175, z = (rnd() - 0.5) * 2 * 175;
      const r = Math.hypot(x, z);
      if (r > 178 || r < 38) continue;
      const h = this.getHeight(x, z);
      if (h < 0.3) continue;
      if (this.trackDist(x, z) < TRACK_WIDTH / 2 + 4 || this.roadDist(x, z).d < 4) continue;
      const hill = h > 14 ? 0.6 : 0.12;
      if (rnd() > hill) continue;
      const s = 0.4 + rnd() * 1.4;
      rocks.push({ x, y: h + s * 0.2, z, s, ry: rnd() * 6, c: ['#8d8c84', '#9e9d95', '#7c7b74'][Math.floor(rnd() * 3)] });
      if (s > 0.7) this.addCollider(x, z, s * 0.85);
    }
    const rim = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#fff', flatShading: true }), rocks.length);
    rocks.forEach((d, i) => {
      dummy.position.set(d.x, d.y, d.z); dummy.scale.set(d.s, d.s * 0.7, d.s); dummy.rotation.set(0, d.ry, 0.2);
      dummy.updateMatrix(); rim.setMatrixAt(i, dummy.matrix); rim.setColorAt(i, col.set(d.c));
    });
    this.group.add(rim);

    // ziedi un zāle
    const flowers = [], tufts = [];
    const fc = ['#ffffff', '#ffe03a', '#b06ae0', '#e8302a', '#3a7ae8'];
    for (let i = 0; i < 9000 && flowers.length < 800; i++) {
      const x = (rnd() - 0.5) * 2 * 170, z = (rnd() - 0.5) * 2 * 170;
      const h = this.getHeight(x, z);
      if (h < 1.2 || h > 26) continue;
      if (this.trackDist(x, z) < TRACK_WIDTH / 2 + 1.5) continue;
      if (Math.hypot(x - GARDEN_SLOTS[0].x, 0) < 5 && Math.abs(z) < 26) continue;
      if (this.forest(x, z) > 0.1) { if (tufts.length < 1400) tufts.push({ x, y: h, z }); continue; }
      flowers.push({ x, y: h + 0.18, z, c: fc[Math.floor(rnd() * fc.length)] });
      if (tufts.length < 1400) tufts.push({ x: x + 1.3, y: this.getHeight(x + 1.3, z), z });
    }
    const fim = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: '#fff' }), flowers.length);
    flowers.forEach((d, i) => {
      dummy.position.set(d.x, d.y, d.z); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix(); fim.setMatrixAt(i, dummy.matrix); fim.setColorAt(i, col.set(d.c));
    });
    this.group.add(fim);
    const tg = new THREE.ConeGeometry(0.16, 0.55, 4); tg.translate(0, 0.27, 0);
    const tim = new THREE.InstancedMesh(tg, mat('#4f9a36', { flatShading: true }), tufts.length);
    tufts.forEach((d, i) => {
      dummy.position.set(d.x, d.y, d.z); dummy.scale.set(1, 0.7 + (i % 5) * 0.15, 1); dummy.rotation.set(0, i, 0);
      dummy.updateMatrix(); tim.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(tim);
  }

  buildClouds() {
    const rnd = mulberry32(this.seed + 5);
    this.clouds = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const m = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, emissive: '#cccccc' });
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(geo, m);
        b.position.set(k * 3 - 4.5, rnd() * 1.5, rnd() * 2);
        const s = 2.5 + rnd() * 2;
        b.scale.set(s, s * 0.6, s);
        c.add(b);
      }
      c.position.set((rnd() - 0.5) * 400, 55 + rnd() * 20, (rnd() - 0.5) * 400);
      this.clouds.add(c);
    }
    this.group.add(this.clouds);
  }

  updateClouds(dt) {
    for (const c of this.clouds.children) {
      c.position.x += dt * 1.5;
      if (c.position.x > 220) c.position.x = -220;
    }
  }

  placeMushrooms() {
    const rnd = mulberry32(this.seed + 31);
    this.mushrooms = [];
    for (let i = 0; i < 20000 && this.mushrooms.length < 110; i++) {
      const x = (rnd() - 0.5) * 2 * 170, z = (rnd() - 0.5) * 2 * 170;
      const tr = rnd();
      if (Math.hypot(x, z) > 172 || Math.hypot(x, z) < 50) continue;
      const h = this.getHeight(x, z);
      if (h < 1.3 || h > 32) continue;
      if (this.forest(x, z) < 0.2) continue;
      if (this.trackDist(x, z) < TRACK_WIDTH) continue;
      const type = tr < 0.45 ? 'baravika' : tr < 0.85 ? 'gailene' : 'musmire';
      const p = { x, z };
      this.collide(p, 0.3);
      this.mushrooms.push({ id: this.mushrooms.length, x: p.x, z: p.z, y: this.getHeight(p.x, p.z), type });
    }
  }

  placeStars() {
    const rnd = mulberry32(this.seed + 77);
    this.stars = [];
    for (let k = 0; k < 15; k++) {
      let best = null;
      for (let s = 0; s < 80; s++) {
        const a = (k + rnd()) / 15 * Math.PI * 2;
        const r = 50 + rnd() * 115;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = this.getHeight(x, z);
        if (h < 1) continue;
        if (!best || h > best.y) best = { x, z, y: h };
      }
      if (!best) best = { x: Math.cos(k) * 60, z: Math.sin(k) * 60, y: this.getHeight(Math.cos(k) * 60, Math.sin(k) * 60) };
      const p = { x: best.x, z: best.z };
      this.collide(p, 0.8);
      this.stars.push({ id: k, x: p.x, z: p.z, y: this.getHeight(p.x, p.z) + 1.3 });
    }
  }

  placeNpcHomes() {
    const rnd = mulberry32(this.seed + 55);
    const want = [
      ['stirna', 7, 12, (f, h) => f > -0.05 && f < 0.3 && h > 1.5],
      ['zakis', 7, 8, (f, h) => f < 0.05 && h > 1.5],
      ['ezis', 5, 4, (f, h) => f > 0.18 && h > 1.5],
      ['mezacuka', 4, 9, (f, h) => f > 0.18 && h > 1.5],
      ['vavere', 5, 3, (f, h) => f > 0.15 && h > 1.5],
      ['starkis', 5, 4, (f, h) => h > 0.2 && h < 1.6],
    ];
    this.npcHomes = [];
    for (const [type, count, R, ok] of want) {
      let got = 0;
      for (let i = 0; i < 6000 && got < count; i++) {
        const x = (rnd() - 0.5) * 2 * 165, z = (rnd() - 0.5) * 2 * 165;
        const p1 = rnd() * 6.28, p2 = rnd() * 6.28, sp = 0.6 + rnd() * 0.5;
        if (Math.hypot(x, z) < 45 || Math.hypot(x, z) > 165) continue;
        if (this.trackDist(x, z) < TRACK_WIDTH + R) continue;
        const h = this.getHeight(x, z);
        if (!ok(this.forest(x, z), h)) continue;
        let land = true;
        if (type !== 'starkis') {
          for (let a = 0; a < 8; a++) {
            if (this.getHeight(x + Math.cos(a * 0.785) * R, z + Math.sin(a * 0.785) * R) < 0.6) { land = false; break; }
          }
        }
        if (!land) continue;
        this.npcHomes.push({ id: this.npcHomes.length, type, x, z, R, p1, p2, sp });
        got++;
      }
    }
  }
}

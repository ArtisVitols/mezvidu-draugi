import * as THREE from 'three';
import { makeNoise2D, mulberry32 } from './noise.js';
import { MUSHROOMS } from './data.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, smoothstep, lerp, makeTextSprite, canvasTexture } from './util.js';
import { optimizeRig } from './characters.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

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
    // maigi pauguri, nevis lieli kalni
    let h = n(x * 0.0045, z * 0.0045) * 6.5 + n(x * 0.013 + 31, z * 0.013 - 17) * 2.6 + n(x * 0.04 - 7, z * 0.04 + 3) * 0.5;
    const hv = n(x * 0.008 + 200, z * 0.008 - 300);
    if (hv > 0) h += hv * hv * 14;
    return h + 1.6;
  }

  computeHeight(x, z) {
    let h = this.naturalHeight(x, z);
    const d = Math.hypot(x, z);
    h = lerp(h, VILLAGE_Y, 1 - smoothstep(34, 62, d));
    const rd = this.roadDist(x, z);
    h = lerp(h, lerp(VILLAGE_Y, TRACK_Y, rd.t), 1 - smoothstep(3, 9, rd.d));
    const td = this.trackDist(x, z);
    h = lerp(h, TRACK_Y - 0.05, 1 - smoothstep(TRACK_WIDTH / 2 + 3, TRACK_WIDTH / 2 + 16, td));
    if (d > 168) h += Math.min(22, (d - 168) * (d - 168) * 0.045);
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
    const sandWet = new THREE.Color('#867650'), sand = new THREE.Color('#c2ab7c');
    const grass = new THREE.Color('#58852f'), grass2 = new THREE.Color('#7c9b3e'), dry = new THREE.Color('#9a9a52');
    const forestG = new THREE.Color('#3f5a26'), soil = new THREE.Color('#5c4a2e'), rock = new THREE.Color('#7b776d');
    const road = new THREE.Color('#8a7350'), village = new THREE.Color('#6a9a3c');
    const n = SEG + 1;
    for (let i = 0; i < pos.count; i++) {
      const ix = i % n, iz = Math.floor(i / n);
      const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
      const h = this.heights[iz * n + ix];
      pos.setY(i, h);
      const v = this.noise2(x * 0.03, z * 0.03) * 0.5 + 0.5;
      const v2 = this.noise(x * 0.11 + 40, z * 0.11) * 0.5 + 0.5;
      if (h < -0.2) c.copy(sandWet).lerp(sand, clamp01(h + 1));
      else if (h < 0.9) c.copy(sand).lerp(grass2, smoothstep(0.5, 0.9, h));
      else {
        c.copy(grass).lerp(grass2, v);
        c.lerp(dry, Math.max(0, v2 - 0.65) * 1.5);
        const f = this.forest(x, z);
        if (f > 0.08) { c.lerp(forestG, Math.min(1, (f - 0.08) * 4)); c.lerp(soil, Math.max(0, v2 - 0.5) * 0.5 * Math.min(1, f * 3)); }
        if (Math.hypot(x, z) < 30) c.lerp(village, 0.5);
        if (h > 13 && Math.hypot(x, z) < 172) c.lerp(rock, Math.min(0.6, (h - 13) / 10));
        if (Math.hypot(x, z) > 172) c.lerp(forestG, 0.8);
        const rd = this.roadDist(x, z).d;
        if (rd < 3.2) c.lerp(road, 1 - smoothstep(2, 3.2, rd));
      }
      c.multiplyScalar(0.92 + v2 * 0.16);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    // smalka zāles/zemes faktūra, kas sareizinās ar krāsām
    const detail = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 9000; k++) {
        const l = 170 + Math.random() * 85;
        g.fillStyle = `rgb(${l},${l},${l})`;
        const x = Math.random() * w, y = Math.random() * h;
        g.fillRect(x, y, 1 + Math.random() * 1.5, 2 + Math.random() * 3);
      }
    });
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.repeat.set(110, 110);
    detail.anisotropy = 4;
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 1, metalness: 0 }));
    m.receiveShadow = true;
    this.group.add(m);
    this.terrain = m;
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(SIZE * 1.6, SIZE * 1.6);
    geo.rotateX(-Math.PI / 2);
    // procedurāla viļņu normāļu karte
    const N = 128, hgt = new Float32Array(N * N);
    const wn = makeNoise2D(this.seed + 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0, a = 1, f = 1;
      for (let o = 0; o < 4; o++) {
        const ang = x / N * Math.PI * 2, bng = y / N * Math.PI * 2;
        v += a * wn(Math.cos(ang) * f * 1.5 + 9 * o, Math.sin(ang) * f * 1.5 + Math.cos(bng) * f * 1.5 + Math.sin(bng) * f * 1.5);
        a *= 0.5; f *= 2;
      }
      hgt[y * N + x] = v;
    }
    const nTex = canvasTexture(N, N, (g) => {
      const img = g.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x - 1 + N) % N];
        const dy = hgt[((y + 1) % N) * N + x] - hgt[((y - 1 + N) % N) * N + x];
        const k = (y * N + x) * 4;
        img.data[k] = 128 + dx * 90; img.data[k + 1] = 128 + dy * 90; img.data[k + 2] = 255; img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
    nTex.colorSpace = THREE.NoColorSpace;
    nTex.wrapS = nTex.wrapT = THREE.RepeatWrapping;
    nTex.repeat.set(60, 60);
    this.waterNormal = nTex;
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: '#2b5f78', roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.86,
      normalMap: nTex, normalScale: new THREE.Vector2(0.35, 0.35),
    }));
    m.position.y = WATER_Y;
    m.renderOrder = 2;
    m.receiveShadow = true;
    this.group.add(m);
    this.water = m;
  }

  updateWater(dt) {
    if (!this.waterNormal) return;
    this.waterNormal.offset.x += dt * 0.006;
    this.waterNormal.offset.y += dt * 0.004;
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
    this.group.add(new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide })));

    // starta līnija
    const checker = canvasTexture(128, 32, (g2, w, h) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
        g2.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g2.fillRect(x * 8, y * 8, 8, 8);
      }
    });
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH, 2), new THREE.MeshStandardMaterial({ map: checker }));
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
    const banner = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 2.4, 1.4, 0.2), new THREE.MeshStandardMaterial({
      map: canvasTexture(512, 64, (g2, w, h) => {
        g2.fillStyle = '#d23b3b'; g2.fillRect(0, 0, w, h);
        g2.fillStyle = '#fff'; g2.font = 'bold 48px sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
        g2.fillText('STARTS • FINIŠS', w / 2, h / 2 + 2);
      })
    }));
    banner.position.y = 5.6;
    gate.add(banner);
    optimizeRig(gate);
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
    optimizeRig(well);
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
      optimizeRig(h);
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
      optimizeRig(fence);
      fence.position.set(s.x, VILLAGE_Y, s.z);
      g.add(fence);
    });

    // ceļa zīme
    g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o !== this.terrain && o !== this.water) { o.castShadow = true; o.receiveShadow = true; } });
    const sign = makeTextSprite('🏡 Mežvidi', { fontSize: 52, bg: 'rgba(60,120,40,0.85)' });
    sign.position.set(30, VILLAGE_Y + 3, -4);
    g.add(sign);
  }

  buildTrees() {
    const rnd = this.rnd;
    const lists = { egle: [], priede: [], berzs: [], ozols: [], bush: [] };
    const step = 3.5;
    for (let gx = -HALF; gx < HALF; gx += step) {
      for (let gz = -HALF; gz < HALF; gz += step) {
        const x = gx + (rnd() - 0.5) * step * 0.9, z = gz + (rnd() - 0.5) * step * 0.9;
        const r = Math.hypot(x, z);
        if (r > 215 || r < 42) { rnd(); rnd(); continue; }
        const h = this.getHeight(x, z);
        if (h < 1.2 || h > 45) { rnd(); rnd(); continue; }
        if (this.roadDist(x, z).d < 5) { rnd(); rnd(); continue; }
        if (r > 176 && (r > 200 || rnd() < 0.4)) { rnd(); continue; }
        const f = r > 176 ? 0.5 : this.forest(x, z);
        const p = f > 0.12 ? 0.62 : f > 0.0 ? 0.08 : 0.02;
        if (rnd() > p) {
          if (f > 0.05 && rnd() < 0.25 && this.trackDist(x, z) > TRACK_WIDTH / 2 + 3) lists.bush.push({ x, y: h, z, s: 0.6 + rnd() * 0.7, ry: rnd() * 6.28 });
          continue;
        }
        if (this.trackDist(x, z) < TRACK_WIDTH / 2 + 5) { rnd(); continue; }
        const s = 0.85 + rnd() * 0.55;
        const t = rnd();
        const kind = f > 0.12 ? (t < 0.5 ? 'egle' : t < 0.78 ? 'priede' : 'berzs') : (t < 0.55 ? 'berzs' : 'ozols');
        lists[kind].push({ x, y: h, z, s, ry: rnd() * 6.28, tilt: (rnd() - 0.5) * 0.06 });
        this.addCollider(x, z, { egle: 0.45, priede: 0.35, berzs: 0.3, ozols: 0.55 }[kind] * s);
      }
    }
    this.treeCount = lists.egle.length + lists.priede.length + lists.berzs.length + lists.ozols.length;

    const blob = (r, seed) => {
      const g = new THREE.IcosahedronGeometry(r, 1);
      const nz = makeNoise2D(seed);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = 1 + nz(x * 1.7 + y, z * 1.7 - y) * 0.22;
        p.setXYZ(i, x * k, y * k, z * k);
      }
      g.computeVertexNormals();
      return g;
    };
    const merge = (parts) => mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g));
    const tint = (g, top, bottom) => {
      g.computeBoundingBox();
      const bb = g.boundingBox, p = g.attributes.position;
      const cols = new Float32Array(p.count * 3), a = new THREE.Color(bottom), b = new THREE.Color(top), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        c.copy(a).lerp(b, (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      return g;
    };
    const place = (g, x, y, z, sx = 1, sy = 1, sz = 1) => { g.scale(sx, sy, sz); g.translate(x, y, z); return g; };

    // egle: vairāki konusi viens virs otra
    const spruceParts = [];
    for (let i = 0; i < 5; i++) {
      const r = 1.9 - i * 0.33, hh = 1.9;
      const cg = new THREE.ConeGeometry(r, hh, 8, 1, true);
      const p = cg.attributes.position;
      for (let k = 0; k < p.count; k++) if (p.getY(k) < 0) p.setY(k, p.getY(k) - 0.25);
      cg.computeVertexNormals();
      spruceParts.push(place(cg, 0, 1.5 + i * 1.1, 0));
    }
    const spruceG = tint(merge(spruceParts), '#3d6b3a', '#173a20');
    const pineCrown = tint(merge([place(blob(1, 1), 0, 6.2, 0, 1.5, 0.7, 1.4), place(blob(1, 2), 0.9, 5.6, 0.3, 1.0, 0.55, 1.0), place(blob(1, 3), -0.8, 5.8, -0.4, 1.1, 0.6, 1.0)]), '#4f7a3a', '#2b4d26');
    const birchCrown = tint(merge([place(blob(1, 4), 0, 4.6, 0, 1.3, 1.6, 1.3), place(blob(1, 5), 0.7, 3.9, 0.4, 0.9, 1.1, 0.9), place(blob(1, 6), -0.6, 4.1, -0.5, 0.9, 1.2, 0.9)]), '#9cc25a', '#557f2c');
    const oakCrown = tint(merge([place(blob(1, 7), 0, 4.4, 0, 2.3, 1.7, 2.3), place(blob(1, 8), 1.5, 3.8, 0.6, 1.4, 1.2, 1.4), place(blob(1, 9), -1.4, 4.0, -0.7, 1.5, 1.2, 1.5), place(blob(1, 10), 0.2, 5.4, -0.9, 1.3, 1.0, 1.3)]), '#5e8a3a', '#2f5222');
    const bushG = tint(merge([place(blob(1, 11), 0, 0.45, 0, 0.9, 0.6, 0.9), place(blob(1, 12), 0.5, 0.35, 0.3, 0.6, 0.45, 0.6), place(blob(1, 13), -0.5, 0.35, -0.2, 0.6, 0.45, 0.6)]), '#4f7a32', '#2a4a1e');

    const trunk = (h, r0, r1) => { const g = new THREE.CylinderGeometry(r1, r0, h, 8, 3); g.translate(0, h / 2, 0); return g; };
    const bark = canvasTexture(64, 128, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { const l = 140 + Math.random() * 100; g.fillStyle = `rgb(${l},${l},${l})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 4 + Math.random() * 14); }
    });
    bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
    const birchBark = canvasTexture(64, 128, (g, w, h) => {
      g.fillStyle = '#ecebe4'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(30,30,30,0.85)'; g.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 18, 1.5 + Math.random() * 2.5); }
    });
    birchBark.wrapS = birchBark.wrapT = THREE.RepeatWrapping;
    const leafM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    const types = [
      ['egle', trunk(2.2, 0.26, 0.12), new THREE.MeshStandardMaterial({ color: '#5a3d26', map: bark, roughness: 1 }), spruceG],
      ['priede', trunk(6, 0.24, 0.13), new THREE.MeshStandardMaterial({ color: '#a8643a', map: bark, roughness: 1 }), pineCrown],
      ['berzs', trunk(4.4, 0.2, 0.09), new THREE.MeshStandardMaterial({ map: birchBark, roughness: 0.9 }), birchCrown],
      ['ozols', trunk(3.4, 0.45, 0.28), new THREE.MeshStandardMaterial({ color: '#4e3b2a', map: bark, roughness: 1 }), oakCrown],
    ];
    const dummy = new THREE.Object3D();
    // koki sadalīti apgabalos, lai neredzamos apgabalus nezīmētu (ātrāk telefonā)
    const CH = 90;
    const mk = (geo, material, all, shadow = true) => {
      const chunks = new Map();
      for (const d of all) {
        const key = Math.floor(d.x / CH) + ',' + Math.floor(d.z / CH);
        if (!chunks.has(key)) chunks.set(key, []);
        chunks.get(key).push(d);
      }
      for (const list of chunks.values()) mk1(geo, material, list, shadow);
    };
    const mk1 = (geo, material, list, shadow) => {
      const im = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((d, i) => {
        dummy.position.set(d.x, d.y - 0.1, d.z);
        dummy.rotation.set(d.tilt || 0, d.ry, (d.tilt || 0) * 0.7);
        dummy.scale.setScalar(d.s);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.castShadow = shadow;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    };
    for (const [k, tg, tm, cg] of types) { mk(tg, tm, lists[k]); mk(cg, leafM, lists[k]); }
    mk(bushG, leafM, lists.bush, false);
  }

  buildRocksAndFlowers() {
    const rnd = mulberry32(this.seed + 99);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const rocks = [];
    for (let i = 0; i < 4000 && rocks.length < 260; i++) {
      const x = (rnd() - 0.5) * 2 * 175, z = (rnd() - 0.5) * 2 * 175;
      const r = Math.hypot(x, z);
      if (r > 178 || r < 38) continue;
      const h = this.getHeight(x, z);
      if (h < 0.3) continue;
      if (this.trackDist(x, z) < TRACK_WIDTH / 2 + 4 || this.roadDist(x, z).d < 4) continue;
      if (rnd() > (h > 10 ? 0.5 : 0.12)) continue;
      const s = 0.35 + rnd() * rnd() * 1.6;
      rocks.push({ x, y: h + s * 0.1, z, s, ry: rnd() * 6, c: ['#8a877e', '#9b978c', '#77736a'][Math.floor(rnd() * 3)] });
      if (s > 0.7) this.addCollider(x, z, s * 0.85);
    }
    const rg = new THREE.IcosahedronGeometry(1, 1);
    const rn = makeNoise2D(this.seed + 4);
    const rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
      const k = 1 + rn(x * 1.3 + z, y * 1.3) * 0.28;
      rp.setXYZ(i, x * k, y * k * 0.65, z * k);
    }
    rg.computeVertexNormals();
    const rim = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.95, flatShading: true }), rocks.length);
    rocks.forEach((d, i) => {
      dummy.position.set(d.x, d.y, d.z); dummy.scale.set(d.s, d.s, d.s * 0.9); dummy.rotation.set(0, d.ry, 0.1);
      dummy.updateMatrix(); rim.setMatrixAt(i, dummy.matrix); rim.setColorAt(i, col.set(d.c));
    });
    rim.castShadow = true; rim.receiveShadow = true;
    this.group.add(rim);

    // zāles kušķi un ziedi
    const flowers = [], tufts = [];
    const fc = ['#ffffff', '#f4e04a', '#9b6ad0', '#d8302a', '#4a7ae0', '#ffffff'];
    for (let i = 0; i < 40000 && tufts.length < 9000; i++) {
      const x = (rnd() - 0.5) * 2 * 172, z = (rnd() - 0.5) * 2 * 172;
      const h = this.getHeight(x, z);
      if (h < 0.9 || h > 18) continue;
      if (this.trackDist(x, z) < TRACK_WIDTH / 2 + 1.2) continue;
      if (this.roadDist(x, z).d < 2.5) continue;
      if (x > -28 && x < -20 && Math.abs(z) < 24) continue;
      const f = this.forest(x, z);
      tufts.push({ x, y: h, z, s: 0.7 + rnd() * 0.7, ry: rnd() * 6.28, c: f > 0.1 ? 0.75 : 0.9 + rnd() * 0.25 });
      if (f < 0.05 && rnd() < 0.12 && flowers.length < 1200) flowers.push({ x: x + 0.4, y: this.getHeight(x + 0.4, z) + 0.28, z, c: fc[Math.floor(rnd() * fc.length)] });
    }
    // kušķis no 5 šauriem stiebriem
    const pos = [], cols = [];
    for (let b = 0; b < 5; b++) {
      const a = b / 5 * Math.PI * 2 + 0.3, w = 0.035, hh = 0.32 + (b % 3) * 0.1, lean = 0.12;
      const ox = Math.cos(a) * 0.06, oz = Math.sin(a) * 0.06;
      const tx = ox + Math.cos(a) * lean, tz = oz + Math.sin(a) * lean;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, tx, hh, tz);
      cols.push(0.1, 0.17, 0.05, 0.1, 0.17, 0.05, 0.3, 0.42, 0.13);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    tg.computeVertexNormals();
    const tn = tg.attributes.normal;
    for (let i = 0; i < tn.count; i++) tn.setXYZ(i, 0, 1, 0);
    const tim = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }), tufts.length);
    tufts.forEach((d, i) => {
      dummy.position.set(d.x, d.y - 0.02, d.z); dummy.scale.set(d.s, d.s, d.s); dummy.rotation.set(0, d.ry, 0);
      dummy.updateMatrix(); tim.setMatrixAt(i, dummy.matrix); tim.setColorAt(i, col.setScalar(d.c));
    });
    tim.receiveShadow = true;
    this.group.add(tim);
    const fg = new THREE.IcosahedronGeometry(0.06, 0);
    const fim = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.8 }), flowers.length);
    flowers.forEach((d, i) => {
      dummy.position.set(d.x, d.y, d.z); dummy.scale.set(1, 0.5, 1); dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix(); fim.setMatrixAt(i, dummy.matrix); fim.setColorAt(i, col.set(d.c));
    });
    this.group.add(fim);
  }

  buildClouds() {
    const rnd = mulberry32(this.seed + 5);
    this.clouds = new THREE.Group();
    const tex = canvasTexture(128, 128, (g, w, h) => {
      for (let i = 0; i < 40; i++) {
        const x = 18 + Math.random() * 92, y = 50 + Math.random() * 30 - Math.abs(x - 64) * 0.25, r = 10 + Math.random() * 18;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
      }
    });
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 1; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 }));
        const s = 60 + rnd() * 50;
        sp.scale.set(s, s * 0.5, 1);
        c.add(sp);
      }
      c.position.set((rnd() - 0.5) * 600, 90 + rnd() * 30, (rnd() - 0.5) * 600);
      this.clouds.add(c);
    }
    this.group.add(this.clouds);
  }

  updateClouds(dt) {
    for (const c of this.clouds.children) {
      c.position.x += dt * 1.2;
      if (c.position.x > 320) c.position.x = -320;
    }
    this.updateWater(dt);
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

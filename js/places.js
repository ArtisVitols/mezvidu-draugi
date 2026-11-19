// Īpašās vietas pasaulē: skatu tornis, ugunskura vieta, purvs, pilsdrupas, makšķernieku laipa.
// Vietas atrod deterministiski pēc reljefa (visiem spēlētājiem vienādas), būvē to modeļus un ogu krūmu vietas.
import * as THREE from 'three';
import { mulberry32 } from './noise.js?v=1.32.0';
import { mat, noiseTexture, makeTextSprite, smoothstep } from './util.js?v=1.32.0';
import { optimizeRig, flattenStatic } from './characters.js?v=1.32.0';

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };

// ---------- vietu meklēšana (pirms augstumu režģa aprēķina) ----------
export function findPlaces(W, edge) {
  const rnd = mulberry32(W.seed + 901);
  const H = (x, z) => W.computeHeight(x, z);
  const slope = (x, z) => {
    const h = H(x, z);
    return Math.max(Math.abs(H(x + 4, z) - h), Math.abs(H(x - 4, z) - h), Math.abs(H(x, z + 4) - h), Math.abs(H(x, z - 4) - h));
  };
  const far = (x, z, min) => W.places.every((p) => angDiff(Math.atan2(z, x), Math.atan2(p.z, p.x)) > min || Math.hypot(p.x - x, p.z - z) > 130);
  const okBase = (x, z) => W.trackDist(x, z) > 45 && W.roadDist(x, z).d > 12;
  const sample = (r0, r1) => { const a = rnd() * TAU, r = r0 + rnd() * (r1 - r0); return [Math.cos(a) * r, Math.sin(a) * r]; };
  const add = (p) => { W.places.push(p); return p; };

  // 1) skatu tornis — augstākajā kalnā
  let best = null;
  for (let i = 0; i < 900; i++) {
    const [x, z] = sample(110, edge - 35);
    if (!okBase(x, z)) continue;
    const h = H(x, z);
    if (!best || h > best.h) best = { x, z, h };
  }
  add({ id: 'tornis', x: best.x, z: best.z, h: best.h, flat: 5, blend: 7 });

  // 2) ugunskura vieta — līdzena klajuma malā pie meža
  best = null;
  for (let i = 0; i < 3000; i++) {
    const [x, z] = sample(90, edge - 40);
    if (!okBase(x, z) || !far(x, z, 1.1)) continue;
    const h = H(x, z);
    if (h < 2.5 || h > 12) continue;
    const f = W.forest(x, z);
    if (f < -0.12 || f > 0.08) continue;
    let fn = 0;
    for (let a = 0; a < 8; a++) fn = Math.max(fn, W.forest(x + Math.cos(a * 0.785) * 22, z + Math.sin(a * 0.785) * 22));
    const sl = slope(x, z);
    const score = fn - sl * 0.15;
    if (sl < 1.5 && fn > 0.15 && (!best || score > best.score)) best = { x, z, h, score };
    if (best && i > 1200) break;
  }
  if (!best) best = { x: 150, z: 120, h: H(150, 120) };
  add({ id: 'nometne', x: best.x, z: best.z, h: best.h, flat: 8, blend: 8 });

  // 3) pilsdrupas — paugurā, citā pusē nekā tornis
  best = null;
  for (let i = 0; i < 1500; i++) {
    const [x, z] = sample(120, edge - 35);
    if (!okBase(x, z) || !far(x, z, 1.0)) continue;
    const h = H(x, z);
    if (h < 5 || h > 32) continue;
    const score = h - slope(x, z) * 1.5;
    if (!best || score > best.score) best = { x, z, h, score };
  }
  if (!best) best = { x: -180, z: 150, h: H(-180, 150) };
  add({ id: 'drupas', x: best.x, z: best.z, h: best.h, flat: 10, blend: 8 });

  // 4) purvs — zemiene ar daudz mitras zemes
  best = null;
  for (let i = 0; i < 2500; i++) {
    const [x, z] = sample(90, edge - 40);
    if (!okBase(x, z) || !far(x, z, 0.7)) continue;
    const h = H(x, z);
    if (h < 0.7 || h > 1.8) continue;
    let low = 0;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * TAU, r = 10 + (k % 2) * 12;
      const hh = H(x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (hh > -0.8 && hh < 2.6) low++;
    }
    if (low >= 13 && (!best || low > best.low)) best = { x, z, h, low };
    if (best && best.low >= 16) break;
  }
  if (!best) best = { x: -120, z: -160, h: 1 };
  add({ id: 'purvs', x: best.x, z: best.z, h: 1.0, swamp: 26 });

  // 5) makšķernieku laipa — ezera krastā, kur ūdens dziļš
  best = null;
  for (let i = 0; i < 5000 && !best; i++) {
    const [x, z] = sample(60, edge - 30);
    if (!okBase(x, z) || !far(x, z, 0.5)) continue;
    const h = H(x, z);
    if (h < 0.9 || h > 1.5) continue;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * TAU, dx = Math.cos(a), dz = Math.sin(a);
      if (H(x + dx * 6, z + dz * 6) < -0.6 && H(x + dx * 11, z + dz * 11) < -1.2 && H(x + dx * 15, z + dz * 15) < -1.2 &&
          H(x - dx * 4, z - dz * 4) > h - 0.3) { best = { x, z, h, a }; break; }
    }
  }
  if (best) add({ id: 'laipa', x: best.x, z: best.z, h: best.h, dir: best.a });
}

// līdzināšana augstumu aprēķinā
export function placeHeight(W, x, z, h) {
  for (const p of W.places) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (p.flat) {
      if (d < p.flat + p.blend) h = h + (p.h - h) * (1 - smoothstep(p.flat, p.flat + p.blend, d));
    } else if (p.swamp) {
      if (d < p.swamp * 1.6 && h > 0.9) h = h + (p.h - h) * 0.8 * (1 - smoothstep(p.swamp * 0.6, p.swamp * 1.6, d));
    }
  }
  return h;
}

// vai šeit nedrīkst augt koki / akmeņi
export function inPlace(W, x, z, pad = 0) {
  for (const p of W.places) {
    const r = p.id === 'tornis' ? 7 : p.id === 'nometne' ? 11 : p.id === 'drupas' ? 14 : p.id === 'laipa' ? 6 : 0;
    if (r && Math.hypot(x - p.x, z - p.z) < r + pad) return true;
  }
  return false;
}

// ---------- modeļi ----------
let stoneTex = null, woodTex = null;
function stoneM(color = '#9a958a') {
  if (!stoneTex) { stoneTex = noiseTexture('stone', 128); stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping; }
  const m = new THREE.MeshStandardMaterial({ color, map: stoneTex, roughness: 1 });
  stoneList.push(m);
  return m;
}
const stoneList = [];
export function placeStoneMats() { return stoneList; }
function woodM(color = '#8a6a48') {
  if (!woodTex) { woodTex = noiseTexture('fur', 64); woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(1, 3); }
  return new THREE.MeshStandardMaterial({ color, map: woodTex, roughness: 0.95 });
}
const cyl = (r0, r1, h, s = 8) => new THREE.CylinderGeometry(r1, r0, h, s);
function put(parent, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o;
}
// koka stabs/baļķis starp diviem punktiem
function beam(parent, m, a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const o = new THREE.Mesh(cyl(r, r, len, 7), m);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  parent.add(o); return o;
}
function sign(parent, text, x, y, z) {
  const s = makeTextSprite(text, { fontSize: 40, bg: 'rgba(90,60,30,0.85)' });
  s.position.set(x, y, z); parent.add(s); return s;
}
// kartes gabals (rullītis), redzams tikai, kamēr nav paņemts
export function buildScroll() {
  const g = new THREE.Group();
  put(g, cyl(0.07, 0.07, 0.42, 12), mat('#efe0b8', { roughness: 0.9 }), 0, 0, 0, 0, 0, Math.PI / 2);
  put(g, new THREE.TorusGeometry(0.075, 0.015, 6, 12), mat('#b02a2a', { roughness: 0.6 }), 0, 0, 0, 0, Math.PI / 2, 0);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffe38a', transparent: true, opacity: 0.25, depthWrite: false }));
  g.add(glow);
  return g;
}

function buildTower(W, p) {
  const g = new THREE.Group();
  const wm = woodM('#7d6248'), wd = woodM('#5e4a36');
  const TOP = 11.5;
  p.top = TOP;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of cs) {
    beam(g, wm, V(sx * 2.1, -0.5, sz * 2.1), V(sx * 1.5, TOP + 2.3, sz * 1.5), 0.17);
    W.addCollider(p.x + sx * 2.0, p.z + sz * 2.0, 0.35);
  }
  // šķērssaites
  for (const y0 of [0.6, 4.2, 7.8]) {
    const y1 = y0 + 3.4, k0 = 2.1 - (y0 / (TOP + 2.8)) * 0.6, k1 = 2.1 - (y1 / (TOP + 2.8)) * 0.6;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = cs[i], [bx, bz] = cs[(i + 1) % 4];
      beam(g, wd, V(ax * k0, y0, az * k0), V(bx * k1, y1, bz * k1), 0.07);
      beam(g, wd, V(ax * k0, y0, az * k0), V(bx * k0, y0, bz * k0), 0.07);
    }
  }
  // platforma ar margām
  put(g, new THREE.BoxGeometry(3.8, 0.22, 3.8), woodM('#9a7a56'), 0, TOP - 0.11, 0);
  for (const [sx, sz] of cs) {
    const a = V(sx * 1.8, TOP, sz * 1.8);
    beam(g, wd, a, V(sx * 1.8, TOP + 1.0, sz * 1.8), 0.06);
  }
  for (let i = 0; i < 4; i++) {
    const [ax, az] = cs[i], [bx, bz] = cs[(i + 1) % 4];
    for (const y of [0.5, 1.0]) beam(g, wd, V(ax * 1.8, TOP + y, az * 1.8), V(bx * 1.8, TOP + y, bz * 1.8), 0.045);
  }
  // jumtiņš
  const roof = put(g, new THREE.ConeGeometry(2.9, 1.6, 4, 1), mat('#5a4a3e', { roughness: 1 }), 0, TOP + 3.1, 0);
  roof.rotation.y = Math.PI / 4;
  // kāpnes vienā pusē
  const lx = 0, lz = 2.25;
  beam(g, wd, V(lx - 0.35, 0, lz + 0.6), V(lx - 0.35, TOP, lz - 0.2), 0.05);
  beam(g, wd, V(lx + 0.35, 0, lz + 0.6), V(lx + 0.35, TOP, lz - 0.2), 0.05);
  for (let y = 0.4; y < TOP; y += 0.45) {
    const zz = lz + 0.6 - (y / TOP) * 0.8;
    beam(g, wd, V(lx - 0.35, y, zz), V(lx + 0.35, y, zz), 0.03);
  }
  optimizeRig(g);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(p.x, p.h, p.z);
  sign(g, '🗼 Skatu tornis', 0, 3.2, 3.2);
  p.base = { x: p.x, z: p.z + 3.0 };
  W.platforms.push({ x: p.x, z: p.z, ang: 0, hw: 1.75, hl: 1.75, y: p.h + TOP });
  p.piece = { x: p.x + 1.1, y: p.h + TOP + 0.35, z: p.z - 1.1 };
  return g;
}

function buildCamp(W, p) {
  const g = new THREE.Group();
  // telts
  const tentM = new THREE.MeshStandardMaterial({ color: '#d0702a', roughness: 0.9, side: THREE.DoubleSide, map: noiseTexture('cloth', 128) });
  const tg = new THREE.CylinderGeometry(1.5, 1.5, 3.0, 3, 1, false);
  tg.rotateZ(Math.PI / 2); tg.rotateX(-Math.PI / 2); tg.translate(0, 0.75, 0);
  const tent = put(g, tg, tentM, -3.2, 0, -1.5, 0, Math.PI / 6, 0);
  void tent;
  put(g, new THREE.BoxGeometry(0.05, 1.1, 0.7), mat('#2a1e14'), -3.2 + Math.cos(Math.PI / 6) * 1.52, 0.55, -1.5 - Math.sin(Math.PI / 6) * 1.52, 0, Math.PI / 6, 0);
  W.addCollider(p.x - 3.2, p.z - 1.5, 1.6);
  // ugunskurs: akmeņu aplis, malka, liesmas
  const sm = stoneM('#8a857a');
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU;
    const s = put(g, new THREE.DodecahedronGeometry(0.2, 0), sm, Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75, i, i * 2, 0);
    s.scale.set(1, 0.7, 1.2);
  }
  const lm = woodM('#4e3624');
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + 0.4;
    beam(g, lm, new THREE.Vector3(Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55), new THREE.Vector3(-Math.cos(a) * 0.08, 0.5, -Math.sin(a) * 0.08), 0.07);
  }
  const ember = put(g, new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: '#ff6a1a' }), 0, 0.04, 0, -Math.PI / 2, 0, 0);
  void ember;
  const flames = [];
  const fcols = ['#ffcc33', '#ff8a1a', '#ff5010'];
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.22 - i * 0.02, 0.9, 8, 1, true), new THREE.MeshBasicMaterial({ color: fcols[i % 3], transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    f.position.set(Math.cos(i * 1.3) * 0.15, 0.5, Math.sin(i * 1.3) * 0.15);
    g.add(f); flames.push(f);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ff9a40', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(3, 3, 1); glow.position.y = 0.7; g.add(glow);
  W.addCollider(p.x, p.z, 0.9);
  // soliņi no baļķiem
  const bm = woodM('#7a5a3a');
  for (const [x, z, r] of [[2.4, 0.3, 0.2], [-0.2, 2.5, 1.6], [0.6, -2.4, -1.4]]) {
    put(g, cyl(0.28, 0.28, 2.2, 10), bm, x, 0.28, z, 0, r, Math.PI / 2);
    W.addCollider(p.x + x, p.z + z, 0.5);
  }
  // malkas grēda un celms
  for (let i = 0; i < 9; i++) put(g, cyl(0.12, 0.12, 1.0, 7), lm, -3.0 + (i % 3) * 0.26, 0.12 + Math.floor(i / 3) * 0.22, 2.3, Math.PI / 2, 0, 0);
  put(g, cyl(0.38, 0.32, 0.5, 12), woodM('#6e5038'), -1.2, 0.25, -3.2);
  g.traverse((o) => { if (o.isMesh && !o.material.blending) o.castShadow = true; });
  g.position.set(p.x, p.h, p.z);
  sign(g, '⛺ Ugunskura vieta', 0, 3.0, 0);
  p.fire = { x: p.x, z: p.z };
  p.piece = { x: p.x - 1.2, y: p.h + 0.75, z: p.z - 3.2 };
  W.flames = flames; W.fireGlow = glow;
  return g;
}

function buildRuins(W, p) {
  const g = new THREE.Group();
  const sm = stoneM('#a29c90'), sm2 = stoneM('#8e887c');
  const rnd = mulberry32(W.seed + 333);
  const S = 6.5;
  // sienas ar robotām augšām un spraugām
  const wall = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 1.1), ang = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (rnd() < 0.12) continue; // izgruvums
      const hgt = 1.2 + rnd() * 2.6;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const b = put(g, new THREE.BoxGeometry(len / n + 0.02, hgt, 0.9), rnd() < 0.5 ? sm : sm2, x, hgt / 2 - 0.2, z, 0, -ang, 0);
      void b;
      W.addCollider(p.x + x, p.z + z, 0.6);
    }
  };
  wall(-S, -S, S, -S); wall(S, -S, S, S); wall(-S, S, -S, -S);
  wall(S, S, 2, S); wall(-2, S, -S, S); // vārti dienvidos
  // vārtu arka
  put(g, new THREE.BoxGeometry(0.9, 4.2, 1.1), sm, 2.0, 1.9, S);
  put(g, new THREE.BoxGeometry(0.9, 4.2, 1.1), sm, -2.0, 1.9, S);
  const arch = put(g, new THREE.TorusGeometry(2.0, 0.45, 6, 12, Math.PI), sm2, 0, 4.0, S);
  arch.scale.z = 1.2;
  W.addCollider(p.x + 2, p.z + S, 0.7); W.addCollider(p.x - 2, p.z + S, 0.7);
  // apaļa torņa paliekas
  put(g, cyl(2.2, 2.0, 5.5, 14), sm2, -S, 2.5, -S);
  W.addCollider(p.x - S, p.z - S, 2.2);
  // izkrituši akmeņi
  for (let i = 0; i < 14; i++) {
    const a = rnd() * TAU, r = 3 + rnd() * 6;
    put(g, new THREE.DodecahedronGeometry(0.25 + rnd() * 0.3, 0), sm, Math.cos(a) * r, 0.1, Math.sin(a) * r, rnd() * 3, rnd() * 3, 0);
  }
  // dārguma lāde
  const chest = new THREE.Group();
  const cw = woodM('#7a4a22'), iron = new THREE.MeshStandardMaterial({ color: '#c9a032', metalness: 0.9, roughness: 0.35 });
  put(chest, new THREE.BoxGeometry(1.1, 0.6, 0.7), cw, 0, 0.3, 0);
  for (const x of [-0.45, 0.45]) put(chest, new THREE.BoxGeometry(0.07, 0.62, 0.72), iron, x, 0.3, 0);
  const lid = new THREE.Group(); lid.position.set(0, 0.6, -0.35); chest.add(lid);
  lid.userData.keep = true; // vāks atveras
  const lg = new THREE.CylinderGeometry(0.35, 0.35, 1.1, 14, 1, false, 0, Math.PI); lg.rotateZ(Math.PI / 2); lg.rotateX(Math.PI / 2);
  put(lid, lg, cw, 0, 0, 0.35);
  put(lid, new THREE.BoxGeometry(0.16, 0.18, 0.06), iron, 0, 0.0, 0.72);
  const coins = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 8, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f2c232', metalness: 1, roughness: 0.3, emissive: '#5a3a00' }));
  coins.scale.set(1.1, 0.3, 0.7); coins.position.y = 0.55; coins.visible = false; chest.add(coins);
  coins.userData.keep = true;
  chest.position.set(0, 0, -1);
  g.add(chest);
  W.addCollider(p.x, p.z - 1, 0.8);
  W.chest = { lid, coins, x: p.x, z: p.z - 1 + 0.9 };
  optimizeRig(g);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(p.x, p.h, p.z);
  sign(g, '🏰 Pilsdrupas', 0, 5.6, S + 0.3);
  return g;
}

function buildSwamp(W, p) {
  const g = new THREE.Group();
  const rnd = mulberry32(W.seed + 444);
  const dead = woodM('#8a8478');
  // nokaltuši koki
  for (let i = 0; i < 14; i++) {
    const a = rnd() * TAU, r = 4 + rnd() * p.swamp;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = W.computeHeight(p.x + x, p.z + z);
    if (h < -0.3) continue;
    const t = new THREE.Group(); t.position.set(x, h - p.h, z); g.add(t);
    const hh = 2.5 + rnd() * 3.5;
    put(t, cyl(0.16, 0.05, hh, 7), dead, 0, hh / 2, 0, (rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25);
    for (let k = 0; k < 3; k++) {
      const b = put(t, cyl(0.05, 0.015, 1.1, 5), dead, 0, hh * (0.45 + k * 0.17), 0, 0, rnd() * TAU, 0.9 + rnd() * 0.5);
      b.translateY(0.5);
    }
    W.addCollider(p.x + x, p.z + z, 0.25);
  }
  // ciņi
  const tus = new THREE.SphereGeometry(0.5, 10, 6, 0, TAU, 0, Math.PI / 2);
  const tm = [mat('#6a7a32', { roughness: 1 }), mat('#7a6e3a', { roughness: 1 }), mat('#5a6a2a', { roughness: 1 })];
  for (let i = 0; i < 46; i++) {
    const a = rnd() * TAU, r = rnd() * p.swamp * 1.2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = W.computeHeight(p.x + x, p.z + z);
    if (h < -0.4) continue;
    const o = put(g, tus, tm[i % 3], x, h - p.h - 0.05, z);
    o.scale.set(0.8 + rnd(), 0.5 + rnd() * 0.5, 0.8 + rnd());
  }
  // laipa pāri purvam
  const pm = woodM('#8a7050');
  const len = 18, ang = rnd() * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
  const y = 1.3 - p.h;
  for (let i = 0; i < len / 0.55; i++) {
    const d = -len / 2 + i * 0.55;
    const pl = put(g, new THREE.BoxGeometry(0.45, 0.08, 1.3), pm, ca * d, y, sa * d, 0, -ang, 0);
    pl.rotation.z = (rnd() - 0.5) * 0.04;
    if (i % 4 === 0) for (const s of [-0.55, 0.55]) put(g, cyl(0.06, 0.06, 1.6, 6), pm, ca * d - sa * s, y - 0.75, sa * d + ca * s);
  }
  W.platforms.push({ x: p.x, z: p.z, ang, hw: len / 2, hl: 0.68, y: 1.3 });
  p.piece = { x: p.x + ca * (len / 2 - 0.6), y: 1.3 + 0.35, z: p.z + sa * (len / 2 - 0.6) };
  optimizeRig(g);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.position.set(p.x, p.h, p.z);
  sign(g, '🐸 Purvs', -ca * (len / 2 + 0.5), 2.6, -sa * (len / 2 + 0.5));
  return g;
}

function buildPier(W, p) {
  const g = new THREE.Group();
  const pm = woodM('#8e7252'), post = woodM('#5e4a36');
  const len = 13, deckY = Math.max(0.95, p.h + 0.08);
  p.deckY = deckY;
  const ca = Math.cos(p.dir), sa = Math.sin(p.dir);
  const yaw = -p.dir; // vietējā x ass gar laipu
  const inner = new THREE.Group(); inner.rotation.y = yaw; g.add(inner);
  for (let i = 0; i < len / 0.5; i++) {
    const d = -1 + i * 0.5;
    put(inner, new THREE.BoxGeometry(0.42, 0.09, 2.2), pm, d, deckY - p.h, 0);
  }
  for (let d = 0; d <= len - 1; d += 2.4) for (const s of [-1, 1]) put(inner, cyl(0.1, 0.1, 3.2, 7), post, d, deckY - p.h - 1.3, s * 1.05);
  // margas laipas galā un sols
  for (const s of [-1, 1]) {
    put(inner, new THREE.BoxGeometry(4, 0.08, 0.08), post, len - 3.2, deckY - p.h + 0.9, s * 1.05);
    for (const d of [len - 5.2, len - 3.2, len - 1.2]) put(inner, cyl(0.05, 0.05, 0.9, 6), post, d, deckY - p.h + 0.45, s * 1.05);
  }
  // laiva pie laipas
  const boat = new THREE.Group();
  const hull = new THREE.LatheGeometry([[0.0, 0], [0.45, 0.05], [0.62, 0.25], [0.66, 0.45]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const hm = new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ color: '#4a6a8a', roughness: 0.7, side: THREE.DoubleSide }));
  hm.scale.set(1, 1, 2.6); boat.add(hm);
  put(boat, new THREE.BoxGeometry(1.1, 0.06, 0.3), pm, 0, 0.32, 0.2);
  put(boat, cyl(0.025, 0.025, 2.2, 5), post, 0.35, 0.42, -0.2, 0.1, 0, 1.3);
  boat.position.set(len - 4, -0.12 - p.h, 2.2);
  boat.rotation.y = Math.PI / 2;
  inner.add(boat);
  W.boat = boat;
  boat.userData.keep = true; // laiva šūpojas
  optimizeRig(g);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.position.set(p.x, p.h, p.z);
  W.platforms.push({ x: p.x + ca * (len / 2 - 1.2), z: p.z + sa * (len / 2 - 1.2), ang: p.dir, hw: len / 2 + 0.2, hl: 1.1, y: deckY });
  sign(g, '🎣 Makšķernieku laipa', -ca * 1.5, deckY - p.h + 2.6, -sa * 1.5);
  p.end = { x: p.x + ca * (len - 2), z: p.z + sa * (len - 2) };
  return g;
}

export function buildPlaces(W) {
  const root = new THREE.Group();
  W.platforms = W.platforms || [];
  for (const p of W.places) {
    let g = null;
    if (p.id === 'tornis') g = buildTower(W, p);
    else if (p.id === 'nometne') g = buildCamp(W, p);
    else if (p.id === 'drupas') g = buildRuins(W, p);
    else if (p.id === 'purvs') g = buildSwamp(W, p);
    else if (p.id === 'laipa') g = buildPier(W, p);
    if (g) root.add(flattenStatic(g)); // katra vieta — daži zīmēšanas izsaukumi
  }
  W.group.add(root);
  W.stoneMats = (W.stoneMats || []).concat(stoneList);
}

// liesmu plīvošana
export function updatePlaces(W, dt, t) {
  if (W.flames) {
    W.flames.forEach((f, i) => {
      const s = 0.8 + Math.sin(t * (7 + i) + i * 2) * 0.2 + Math.sin(t * 13 + i) * 0.08;
      f.scale.set(1 + Math.sin(t * 5 + i) * 0.1, s, 1 + Math.cos(t * 6 + i) * 0.1);
      f.position.y = 0.45 * s;
    });
    W.fireGlow.material.opacity = 0.3 + Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.03;
  }
  if (W.boat) { W.boat.rotation.z = Math.sin(t * 1.1) * 0.04; W.boat.position.y += (Math.sin(t * 0.9) * 0.03 - 0.12 - (W.boat.userData.base || 0)) * 0; }
}

// ---------- ogu krūmu vietas ----------
export function placeBerries(W, radius) {
  const rnd = mulberry32(W.seed + 515);
  const out = [];
  const tryAdd = (kind, ok, count, gen) => {
    let got = 0;
    for (let i = 0; i < 60000 && got < count; i++) {
      const [x, z] = gen();
      const r = Math.hypot(x, z);
      if (r < 50 || r > radius - 10) continue;
      if (W.trackDist(x, z) < 14 || W.roadDist(x, z).d < 4 || inPlace(W, x, z, 1)) continue;
      const h = W.getHeight(x, z);
      if (!ok(h, W.forest(x, z))) continue;
      const p = { x, z };
      W.collide(p, 0.4);
      out.push({ id: out.length, kind, x: p.x, z: p.z, y: W.getHeight(p.x, p.z) });
      got++;
    }
  };
  const any = () => [(rnd() - 0.5) * 2 * (radius - 10), (rnd() - 0.5) * 2 * (radius - 10)];
  tryAdd('mellene', (h, f) => h > 1.5 && h < 30 && f > 0.18, 150, any);
  tryAdd('avene', (h, f) => h > 1.5 && h < 25 && f > -0.08 && f < 0.12, 100, any);
  const sw = W.places.find((p) => p.id === 'purvs');
  if (sw) tryAdd('dzervene', (h) => h > 0.3 && h < 1.8, 34, () => { const a = rnd() * TAU, r = rnd() * sw.swamp * 1.3; return [sw.x + Math.cos(a) * r, sw.z + Math.sin(a) * r]; });
  tryAdd('dzervene', (h) => h > 0.6 && h < 1.3, 14, any);
  W.berries = out;
}

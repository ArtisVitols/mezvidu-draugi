// 🧸 Jaunie 3D objekti (2.0 komplekts, 1.37.0): viens kopīgs materiāls (toyMaterial), katrs objekts — viens tīkls.
// Izveidots ar dizaina AI no katalogs.html; spēles moduļi (characters, props, vehicles, bus, farmyard, market) pārsūta savus build* šeit.
// Mežvidu Draugi — 3D asset kit v2 (three.js r160). Generated 2026-11-20.
// Usage: import * as A from './mezvidu-assets.js?v=1.43.0'; scene.add(A.buildAnimal({animal:'lapsa'}).root); each frame: A.MZ.time.value += dt;
import * as THREE from 'three';

// =====================================================================
//  Mežvidu Draugi — asset kit v2  ·  core
//  One shared vertex-colour PBR material + a "Kit" that bakes every part
//  of an asset into ONE mesh (one draw call). Articulated assets
//  (characters, wheels, windmill hubs) become a SkinnedMesh whose bones
//  are ordinary THREE.Group objects, so game code that rotates
//  legs[i].hip / wheels[i] keeps working unchanged.
// =====================================================================

export const MZ = {
  time: { value: 0 },   // advance each frame: MZ.time.value += dt  (wind sway)
  wind: { value: 1 },   // wind strength multiplier
  rim: { value: 0.32 }, // soft rim light strength (toy look)
  lite: false,          // true before building → Lambert shading for weak phones
};

// ---------- small utils ----------
export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const _WHITE = new THREE.Color(1, 1, 1), _BLACK = new THREE.Color(0, 0, 0);
export function C(hex) { return hex && hex.isColor ? hex.clone() : new THREE.Color(hex); }
/** k>0 → towards white, k<0 → towards black */
export function shade(hex, k) { const c = C(hex); return k >= 0 ? c.lerp(_WHITE, k) : c.lerp(_BLACK, -k); }
export function mix(a, b, t) { return C(a).lerp(C(b), t); }
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const toV = (p) => (p.isVector3 ? p.clone() : V(p[0], p[1], p[2]));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export { V, smooth };

// ---------- shared material ----------
const _mats = new Map();
/**
 * The one material every asset uses. Per-vertex attributes drive it:
 *  color (vec3)   albedo
 *  pbr   (vec3)   roughness, metalness, emissive amount
 *  sway  (float)  wind weight (0 = rigid)
 * opts: {transparent, opacity, side, lite, own}
 *  lite: Lambert shading (cheaper on low-end phones, no roughness/metal)
 *  own : a private clone (e.g. house walls that fade when the player is inside)
 */
export function toyMaterial(opts = {}) {
  opts = { lite: MZ.lite, ...opts };
  const key = JSON.stringify({ ...opts, own: 0 });
  if (!opts.own && _mats.has(key)) return _mats.get(key);
  const base = {
    vertexColors: true, transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
    depthWrite: !opts.transparent, side: opts.side ?? THREE.FrontSide,
  };
  const m = opts.lite ? new THREE.MeshLambertMaterial(base)
    : new THREE.MeshStandardMaterial({ ...base, roughness: 1, metalness: 1, envMapIntensity: opts.envMapIntensity ?? 0.5 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = MZ.time; sh.uniforms.uWind = MZ.wind; sh.uniforms.uRim = MZ.rim;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 pbr;
attribute float sway;
varying vec3 vPbr;
uniform float uTime;
uniform float uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPbr = pbr;
if (sway > 0.0) {
  vec4 wq = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wq = instanceMatrix * wq;
  #endif
  wq = modelMatrix * wq;
  float ph = wq.x * 0.37 + wq.z * 0.29;
  float gust = 0.65 + 0.35 * sin(uTime * 0.55 + wq.x * 0.04);
  float k = sway * uWind * gust;
  transformed.x += (sin(uTime * 1.7 + ph) + 0.35 * sin(uTime * 3.9 + ph * 2.3)) * 0.045 * k;
  transformed.z += cos(uTime * 1.3 + ph * 1.4) * 0.032 * k;
  transformed.y += sin(uTime * 2.3 + ph) * 0.006 * k;
}`);
    let f = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vPbr;
uniform float uRim;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vPbr.z;`)
      .replace('#include <opaque_fragment>', `{
  float fr = 1.0 - saturate(abs(dot(normal, normalize(vViewPosition))));
  outgoingLight += mix(vec3(1.0), diffuseColor.rgb, 0.45) * pow(fr, 3.0) * uRim * (1.0 - min(vPbr.z, 1.0));
}
#include <opaque_fragment>`);
    if (!opts.lite) f = f
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = vPbr.x;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = vPbr.y;`);
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => 'mztoy2' + (opts.lite ? 'L' : 'S');
  m.userData.mzToy = true;
  if (!opts.own) _mats.set(key, m);
  return m;
}
export const glassMaterial = () => toyMaterial({ transparent: true, opacity: 0.38, side: THREE.DoubleSide });

// ---------- geometry primitives (all return indexed BufferGeometry) ----------
export const G = {
  sph: (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h),
  hemi: (r, w = 14, h = 6) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2),
  ico: (r, d = 1) => new THREE.IcosahedronGeometry(r, d),
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, s = 10, open = false, hs = 1) => new THREE.CylinderGeometry(rt, rb, h, s, hs, open),
  cone: (r, h, s = 10, open = false) => new THREE.ConeGeometry(r, h, s, 1, open),
  torus: (R, r, rs = 6, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, rs, ts, arc),
  caps: (r, len, cs = 4, rs = 10) => new THREE.CapsuleGeometry(r, len, cs, rs),
  disc: (r, s = 16) => new THREE.CircleGeometry(r, s),
  plane: (w, h, ws = 1, hs = 1) => new THREE.PlaneGeometry(w, h, ws, hs),
  oct: (r) => new THREE.OctahedronGeometry(r, 0),
  dodeca: (r) => new THREE.DodecahedronGeometry(r, 0),
  /** lathe from [[r,y],…] bottom→top */
  lathe: (pts, s = 14) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), s),
  /** extruded 2D shape (THREE.Shape), centred on z */
  ext: (shape, depth, bevel = 0, curve = 6) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curve });
    g.translate(0, 0, -depth / 2); return g;
  },
  /** rounded box (soft toy edges) */
  rbox: (w, h, d, r = 0.05, s = 2) => {
    r = Math.min(r, w / 2, h / 2, d / 2);
    const g = new THREE.BoxGeometry(w, h, d, s * 2 + 1, s * 2 + 1, s * 2 + 1);
    const p = g.attributes.position, n = g.attributes.normal, hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    const v = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
      const dir = v.sub(c).normalize();
      p.setXYZ(i, c.x + dir.x * r, c.y + dir.y * r, c.z + dir.z * r); n.setXYZ(i, dir.x, dir.y, dir.z);
    }
    return mergeVertices(g);
  },
  /** puffy noisy blob (canopies, bushes, clouds) */
  blob: (r, d = 2, amp = 0.12, seed = 1, flat = false) => {
    const g = new THREE.IcosahedronGeometry(r, d), p = g.attributes.position, v = new THREE.Vector3();
    const a = seed * 1.7, b = seed * 2.3;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const n = Math.sin(v.x * 3.1 + a) * Math.sin(v.y * 2.7 + b) * Math.sin(v.z * 3.3 + a * 0.7) + 0.5 * Math.sin(v.x * 6.3 + b) * Math.sin(v.z * 5.9 + a);
      v.multiplyScalar(r * (1 + amp * n)); p.setXYZ(i, v.x, v.y, v.z);
    }
    const m = mergeVertices(g); m.computeVertexNormals(); if (flat) m.userData.flat = true; return m;
  },
  /** swept tube along points; radius: number | [..per point] | fn(t). opts {div, capA, capB} */
  tube: (points, radius, seg = 7, opts = {}) => tubeGeo(points, radius, seg, opts),
  /** leaf blade along +Y in XY plane, folded on midrib, bent backwards (−Z) */
  leaf: (len, wid, opts = {}) => leafGeo(len, wid, opts),
  /** flat polygon from 2D points [[x,y],…] (convex or simple), thickness d */
  poly: (pts, d = 0.02, bevel = 0) => { const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))); return G.ext(s, d, bevel); },
  star: (ro, ri, d, n = 5, bevel = 0.02) => {
    const s = new THREE.Shape();
    for (let i = 0; i <= n * 2; i++) { const a = Math.PI / 2 + i * Math.PI / n, r = i % 2 ? ri : ro; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    return G.ext(s, d, bevel, 1);
  },
  heart: (k, d, bevel = 0.02) => {
    const s = new THREE.Shape();
    s.moveTo(0, -k * 0.95); s.bezierCurveTo(-k * 1.5, -k * 0.1, -k * 1.05, k * 1.0, 0, k * 0.5);
    s.bezierCurveTo(k * 1.05, k * 1.0, k * 1.5, -k * 0.1, 0, -k * 0.95);
    return G.ext(s, d, bevel, 8);
  },
};

function tubeGeo(points, radius, seg, { div = 0, capA = false, capB = false } = {}) {
  let P = points.map(toV);
  if (div > 0) {
    if (P.length > 2) P = new THREE.CatmullRomCurve3(P, false, 'centripetal').getPoints((P.length - 1) * div);
    else { const a = P[0], b = P[1]; P = []; for (let i = 0; i <= div; i++) P.push(a.clone().lerp(b, i / div)); }
  }
  const n = P.length, R = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    if (typeof radius === 'function') R.push(radius(t));
    else if (Array.isArray(radius)) { const f = t * (radius.length - 1), k = Math.min(radius.length - 2, Math.floor(f)); R.push(radius[k] + (radius[k + 1] - radius[k]) * (f - k)); }
    else R.push(radius);
  }
  const T = P.map((p, i) => P[Math.min(n - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize());
  let N = new THREE.Vector3(0, 1, 0); if (Math.abs(T[0].y) > 0.9) N.set(1, 0, 0);
  N = N.sub(T[0].clone().multiplyScalar(N.dot(T[0]))).normalize();
  const pos = [], nor = [], idx = [];
  for (let i = 0; i < n; i++) {
    if (i) { N.sub(T[i].clone().multiplyScalar(N.dot(T[i]))).normalize(); }
    const B = T[i].clone().cross(N).normalize();
    for (let j = 0; j < seg; j++) {
      const a = j / seg * Math.PI * 2, d = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos.push(P[i].x + d.x * R[i], P[i].y + d.y * R[i], P[i].z + d.z * R[i]); nor.push(d.x, d.y, d.z);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + (j + 1) % seg, c = a + seg, d = b + seg;
    idx.push(a, b, c, b, d, c);
  }
  const cap = (i, sgn) => {
    const base = pos.length / 3, t = T[i].clone().multiplyScalar(sgn), p = P[i].clone().addScaledVector(t, R[i] * 0.6);
    for (let j = 0; j < seg; j++) { pos.push(pos[(i * seg + j) * 3], pos[(i * seg + j) * 3 + 1], pos[(i * seg + j) * 3 + 2]); nor.push(t.x * 0.7 + nor[(i * seg + j) * 3] * 0.3, t.y * 0.7 + nor[(i * seg + j) * 3 + 1] * 0.3, t.z * 0.7 + nor[(i * seg + j) * 3 + 2] * 0.3); }
    pos.push(p.x, p.y, p.z); nor.push(t.x, t.y, t.z);
    const c = base + seg;
    for (let j = 0; j < seg; j++) sgn > 0 ? idx.push(base + j, base + (j + 1) % seg, c) : idx.push(base + (j + 1) % seg, base + j, c);
  };
  if (capA) cap(0, -1);
  if (capB) cap(n - 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

function leafGeo(len, wid, { rows = 4, fold = 0.25, bend = 0.25, shape = 'oval', tip = 1 } = {}) {
  const pos = [], idx = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, y = t * len;
    let w;
    if (shape === 'blade') w = wid * (1 - t * 0.85) * (t < 0.08 ? 0.6 + t * 5 : 1);
    else if (shape === 'heart') w = wid * Math.sin(Math.PI * Math.pow(t, 0.75)) * (1.15 - t * 0.3);
    else if (shape === 'round') w = wid * Math.sqrt(Math.max(0, Math.sin(Math.PI * t)));
    else w = wid * Math.sin(Math.PI * Math.pow(t, 0.9)) ** tip;
    const zb = -bend * len * t * t;
    pos.push(-w / 2, y, zb + fold * w * 0.5, 0, y, zb, w / 2, y, zb + fold * w * 0.5);
  }
  for (let i = 0; i < rows; i++) { const a = i * 3; idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  g.userData.double = true;
  return g;
}

/** weld identical positions (needed after rbox and blob) */
export function mergeVertices(g, tol = 1e-4) {
  const src = g.index ? g.toNonIndexed() : g, p = src.attributes.position, nrm = src.attributes.normal;
  const map = new Map(), pos = [], nor = [], idx = [], k = 1 / tol;
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * k)},${Math.round(p.getY(i) * k)},${Math.round(p.getZ(i) * k)}`;
    let j = map.get(key);
    if (j === undefined) { j = pos.length / 3; map.set(key, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(nrm ? nrm.getX(i) : 0, nrm ? nrm.getY(i) : 1, nrm ? nrm.getZ(i) : 0); }
    idx.push(j);
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  o.setIndex(idx);
  return o;
}

// ---------- Kit: collect parts → one merged (optionally skinned) mesh ----------
const _m4 = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
const _box = new THREE.Box3();

export class Kit {
  constructor(seed = 1) {
    this.root = new THREE.Group();
    this.parts = [];
    this.bones = [this.root];
    this.rand = rng(seed);
    this.groundAO = 0;     // >0: vertices below this height get darker (contact shadow)
    this.jitter = 0;       // default per-part colour variation
  }
  /** an articulated sub-group (becomes a bone). p = position, r = rotation */
  group(name, parent = this.root, p = null, r = null) {
    const g = new THREE.Group(); g.name = name;
    if (p) g.position.set(p[0], p[1], p[2]);
    if (r) g.rotation.set(r[0], r[1], r[2]);
    parent.add(g); this.bones.push(g);
    return g;
  }
  /** a plain marker group (seat, pet spot…) — not a bone */
  marker(name, parent = this.root, p = [0, 0, 0]) {
    const g = new THREE.Group(); g.name = name; g.position.set(p[0], p[1], p[2]); parent.add(g); return g;
  }
  /**
   * add(geometry, colour, options)
   *  p:[x,y,z] r:[rx,ry,rz] ro:'XYZ' s:number|[sx,sy,sz] q:Quaternion m:Matrix4
   *  bone: Group (coords are in that group's space)  skin:(v)=>[boneA,wA,boneB,wB]  (v in bone space)
   *  rough metal emit  grad:[bottom,top] multiplier  jit: colour jitter  ao:false to skip groundAO
   *  sway: number|fn(v)  vc: fn(v,n,i)→Color per vertex  fc: fn(centroid)→Color per face (crisp)
   *  flat:true  double:true  ch:'glass'
   */
  add(geo, color, o = {}) { this.parts.push({ geo, color, o }); return this; }
  /** mirrored pair along X: calls fn(side) with side −1 and +1 */
  pair(fn) { fn(-1); fn(1); return this; }

  build({ name = 'mz', castShadow = true, receiveShadow = false, material = null, glassMat = null, cull = 1.25 } = {}) {
    this.root.updateMatrixWorld(true);
    const ch = { main: newBuf(), glass: newBuf() };
    let skinned = false;
    const boneIdx = new Map(this.bones.map((b, i) => [b, i]));
    for (const { geo, color, o } of this.parts) {
      const bone = o.bone || this.root;
      if (bone !== this.root || o.skin) skinned = true;
      let g = geo;
      const double = o.double ?? geo.userData.double;
      const flat = o.flat ?? geo.userData.flat;
      if (flat || o.fc) g = g.index ? g.toNonIndexed() : g;
      if (flat) { g = g === geo ? g.clone() : g; g.computeVertexNormals(); }
      const pa = g.attributes.position, na = g.attributes.normal;
      if (!na) { g = g.clone(); g.computeVertexNormals(); }
      const nrm = g.attributes.normal;
      // local matrix
      if (o.m) _m4.copy(o.m);
      else {
        _v.set(...(o.p || [0, 0, 0]));
        if (o.q) _q.copy(o.q); else { _e.set(...(o.r || [0, 0, 0]), o.ro || 'XYZ'); _q.setFromEuler(_e); }
        const s = o.s ?? 1; Array.isArray(s) ? _s.set(s[0], s[1], s[2]) : _s.set(s, s, s);
        _m4.compose(_v, _q, _s);
      }
      const local = _m4.clone();
      const world = bone.matrixWorld.clone().multiply(local);
      const nm = new THREE.Matrix3().getNormalMatrix(world);
      const flip = world.determinant() < 0;
      // gradient extents in local geometry space
      let y0 = 0, y1 = 1;
      if (o.grad) { _box.setFromBufferAttribute(pa); y0 = _box.min.y; y1 = _box.max.y; if (y1 - y0 < 1e-6) y1 = y0 + 1e-6; }
      const base = C(color);
      const jit = o.jit ?? this.jitter;
      const rough = o.rough ?? 0.72, metal = o.metal ?? 0, emit = o.emit ?? 0;
      const B = o.ch === 'glass' ? ch.glass : ch.main;
      const start = B.pos.length / 3;
      const lv = new THREE.Vector3(), wv = new THREE.Vector3(), wn = new THREE.Vector3(), bv = new THREE.Vector3(), cc = new THREE.Color();
      const partJ = jit ? (this.rand() - 0.5) * jit : 0;
      const sides = double ? [1, -1] : [1];
      for (const side of sides) {
        const s0 = B.pos.length / 3;
        const ks = new Float32Array(pa.count);
        for (let i = 0; i < pa.count; i++) {
          lv.fromBufferAttribute(pa, i);
          bv.copy(lv).applyMatrix4(local);               // in bone space
          wv.copy(lv).applyMatrix4(world);               // in rest model space
          wn.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize().multiplyScalar(side);
          B.pos.push(wv.x, wv.y, wv.z); B.nor.push(wn.x, wn.y, wn.z);
          cc.copy(base);
          if (o.vc) { const r = o.vc(bv, wn, i); if (r) cc.copy(C(r)); }
          let k = 1;
          if (o.grad) k *= o.grad[0] + (o.grad[1] - o.grad[0]) * ((lv.y - y0) / (y1 - y0));
          if (partJ) k *= 1 + partJ;
          if (this.groundAO > 0 && o.ao !== false && wv.y < this.groundAO) k *= 0.62 + 0.38 * Math.max(0, wv.y) / this.groundAO;
          ks[i] = k;
          B.col.push(cc.r * k, cc.g * k, cc.b * k);
          B.pbr.push(rough, metal, emit);
          B.sway.push(typeof o.sway === 'function' ? o.sway(wv) : (o.sway || 0));
          if (o.skin) {
            const sk = o.skin(bv);
            B.si.push(boneIdx.get(sk[0]) ?? 0, boneIdx.get(sk[2] || sk[0]) ?? 0, 0, 0);
            B.sw.push(sk[1], sk[3] || 0, 0, 0);
          } else { B.si.push(boneIdx.get(bone) ?? 0, 0, 0, 0); B.sw.push(1, 0, 0, 0); }
        }
        const ix = g.index ? g.index.array : null, cnt = ix ? ix.length : pa.count;
        const rev = flip !== (side < 0);
        for (let t = 0; t < cnt; t += 3) {
          const a = ix ? ix[t] : t, b = ix ? ix[t + 1] : t + 1, c = ix ? ix[t + 2] : t + 2;
          rev ? B.idx.push(s0 + a, s0 + c, s0 + b) : B.idx.push(s0 + a, s0 + b, s0 + c);
          if (o.fc && side === 1) {
            const cen = new THREE.Vector3(), q = new THREE.Vector3();
            for (const vi of [a, b, c]) cen.add(q.fromBufferAttribute(pa, vi).applyMatrix4(local));
            cen.multiplyScalar(1 / 3);
            const fcol = o.fc(cen);
            if (fcol) { const fc = C(fcol); for (const vi of [a, b, c]) { const j = (s0 + vi) * 3, kk = ks[vi]; B.col[j] = fc.r * kk; B.col[j + 1] = fc.g * kk; B.col[j + 2] = fc.b * kk; } }
          }
        }
      }
      void start;
    }
    const mat = material || toyMaterial();
    const out = this.root;
    out.name = name;
    const meshes = [];
    for (const [key, B] of Object.entries(ch)) {
      if (!B.pos.length) continue;
      const geo = bufToGeo(B, skinned);
      let mesh;
      if (skinned) {
        mesh = new THREE.SkinnedMesh(geo, key === 'glass' ? (glassMat || glassMaterial()) : mat);
        out.add(mesh);
        mesh.bind(new THREE.Skeleton(this.bones.slice()), new THREE.Matrix4());
        mesh.computeBoundingSphere(); if (mesh.boundingSphere) mesh.boundingSphere.radius *= cull;
      } else {
        mesh = new THREE.Mesh(geo, key === 'glass' ? (glassMat || glassMaterial()) : mat);
        out.add(mesh);
      }
      mesh.name = name + (key === 'glass' ? '-glass' : '');
      mesh.castShadow = key === 'glass' ? false : castShadow;
      mesh.receiveShadow = receiveShadow;
      if (key === 'glass') mesh.renderOrder = 2;
      meshes.push(mesh);
    }
    out.userData.mz = { meshes, skinned, tris: meshes.reduce((s, m) => s + m.geometry.index.count / 3, 0) };
    return out;
  }
  /** geometry only (for InstancedMesh). Ignores bones. */
  geometry() {
    const tmp = new Kit(); tmp.parts = this.parts.map((p) => ({ ...p, o: { ...p.o, bone: undefined, skin: undefined } }));
    tmp.groundAO = this.groundAO; tmp.jitter = this.jitter; tmp.rand = this.rand;
    const g = tmp.build({}); const mesh = g.userData.mz.meshes[0]; return mesh.geometry;
  }
}
function newBuf() { return { pos: [], nor: [], col: [], pbr: [], sway: [], si: [], sw: [], idx: [] }; }
function bufToGeo(B, skinned) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
  g.setAttribute('pbr', new THREE.Float32BufferAttribute(B.pbr, 3));
  g.setAttribute('sway', new THREE.Float32BufferAttribute(B.sway, 1));
  if (skinned) {
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(B.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(B.sw, 4));
  }
  g.setIndex(B.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// ---------- placement helpers ----------
/** matrix that maps a +Y unit segment (from 0 to len along Y) from a to b */
export function between(a, b) {
  const A = toV(a), Bv = toV(b), d = Bv.clone().sub(A), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return { m: new THREE.Matrix4().compose(A.clone().add(Bv).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), len };
}
/** a cylinder rod between two points */
export function rod(k, a, b, r, color, o = {}) {
  const { m, len } = between(a, b);
  k.add(G.cyl(o.r2 ?? r, r, len, o.seg ?? 7, o.open ?? false), color, { ...o, m });
  return k;
}

// ---------- blob shadow (shared, transparent) ----------
let _shTex = null, _shMat = null, _shGeo = null;
export function blobShadow(size = 1) {
  if (!_shMat) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.42)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    _shTex = new THREE.CanvasTexture(c);
    _shMat = new THREE.MeshBasicMaterial({ map: _shTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    _shGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }
  const m = new THREE.Mesh(_shGeo, _shMat); m.scale.set(size, 1, size); m.position.y = 0.02; m.renderOrder = 1; m.name = 'shadow';
  return m;
}

// ---------- text / sign faces (one textured quad mesh per sign) ----------
const _texCache = new Map();
export function labelTexture(text, { w = 512, h = 128, bg = '#f3e6c8', fg = '#5a3a1e', font = '700', border = null, radius = 0.18, plank = false } = {}) {
  const key = [text, w, h, bg, fg, font, border, plank].join('|');
  if (_texCache.has(key)) return _texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (plank) {
      for (let i = 1; i < 3; i++) { g.fillStyle = 'rgba(80,45,15,0.18)'; g.fillRect(0, i * h / 3 - 2, w, 3); }
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,55,25,${0.04 + Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 80, 2); }
    }
  }
  if (border) { g.strokeStyle = border; g.lineWidth = h * 0.06; const b = h * 0.08; g.strokeRect(b, b, w - b * 2, h - b * 2); }
  let fs = Math.round(h * 0.56);
  g.font = `${font} ${fs}px system-ui, "Segoe UI", sans-serif`;
  while (g.measureText(text).width > w * 0.9 && fs > 10) { fs -= 2; g.font = `${font} ${fs}px system-ui, "Segoe UI", sans-serif`; }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + fs * 0.06);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  _texCache.set(key, t);
  return t;
}
/** a quad (or two back-to-back quads) with a text texture */
export function labelMesh(text, w, h, opts = {}, twoSided = true) {
  const tex = labelTexture(text, { w: 512, h: Math.round(512 * h / w), ...opts });
  const gap = opts.gap ?? 0.002;
  const geo = new THREE.PlaneGeometry(w, h).translate(0, 0, gap);
  let g = geo;
  if (twoSided) { const b = new THREE.PlaneGeometry(w, h).rotateY(Math.PI).translate(0, 0, -gap); g = mergeSimple([geo, b]); }
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.12 }));
  m.castShadow = false; m.name = 'label';
  return m;
}
function mergeSimple(list) {
  const pos = [], nor = [], uv = [], idx = []; let off = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
    for (const i of g.index.array) idx.push(i + off);
    off += p.count;
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  o.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  o.setIndex(idx); return o;
}

// ---------- stats ----------
export function stats(obj) {
  let draws = 0, tris = 0, verts = 0;
  obj.traverse((o) => {
    if ((o.isMesh || o.isSkinnedMesh) && o.visible !== false && o.name !== 'shadow') {
      const mats = Array.isArray(o.material) ? o.material.length : 1;
      draws += mats * (o.isInstancedMesh ? 1 : 1);
      const g = o.geometry; const t = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      tris += t * (o.isInstancedMesh ? o.count : 1); verts += g.attributes.position.count;
    }
  });
  return { draws, tris: Math.round(tris), verts };
}

// =====================================================================
//  Player animals — one SkinnedMesh per character (1 draw call).
//  Bones keep the original names/roles: root, body, spine, head,
//  legs[i].hip/knee/foot, arms[i].sh/el, tail, hatHolder.
//  Limb lengths are unchanged (thigh 0.30, shin→foot 0.35) so the game's
//  pose code and pedal IK keep working.
// =====================================================================
export const HIP = 0.68;

export const SPECIES = {
  lacis: { name: 'Lācis', fur: '#8b5a2b', bulk: 1.12, head: [1.07, 0.97, 1.0], ears: 'round', muzzle: 'round', nose: '#2b1a12', tail: 'ball', brow: true },
  lapsa: { name: 'Lapsa', fur: '#e8742a', bulk: 0.96, head: [1.02, 0.95, 1.0], ears: 'fox', muzzle: 'snout', nose: '#1f1714', chest: '#fbf2e2', sock: '#2c2420', tail: 'bushy' },
  zakis: { name: 'Zaķis', fur: '#d9d2c5', bulk: 1.0, head: [1.0, 1.0, 1.0], ears: 'long', muzzle: 'bunny', nose: '#d98b96', chest: '#f7f3ec', tail: 'cotton', feet: 1.22 },
  kakis: { name: 'Kaķis', fur: '#9a9a9a', bulk: 0.98, head: [1.06, 0.94, 0.98], ears: 'cat', muzzle: 'cat', nose: '#e08a96', chest: '#efece6', tail: 'long', stripes: true },
  cuka: { name: 'Cūciņa', fur: '#f2a7b5', bulk: 1.1, head: [1.06, 0.98, 1.0], ears: 'pig', muzzle: 'pig', skin: 0.55, tail: 'curly' },
  suns: { name: 'Suns', fur: '#c89b5e', bulk: 1.02, head: [1.02, 0.97, 1.0], ears: 'floppy', muzzle: 'dog', nose: '#231a16', tail: 'wag', patch: true },
  varde: { name: 'Varde', fur: '#5fae4a', bulk: 1.08, head: [1.16, 0.84, 1.0], ears: 'none', muzzle: 'frog', skin: 0.42, chest: '#e3eaa0', tail: 'none', feet: 1.25, headY: 0.5 },
  pile: { name: 'Pīle', fur: '#f5f0e0', bulk: 1.0, head: [0.95, 1.0, 1.0], ears: 'tuft', muzzle: 'bill', bird: true, legC: '#f09a24', tail: 'duck', headY: 0.6 },
  // 1.39.0: Dienvidu meža takas NPC (nav spēlētāju izvēlē)
  vavere: { name: 'Vāvere', fur: '#b8582a', bulk: 0.9, head: [1.0, 0.98, 0.98], ears: 'squirrel', muzzle: 'bunny', nose: '#4a2a1e', chest: '#f6e4c6', tail: 'squirrel' },
  ezis: { name: 'Ezis', fur: '#c9a27a', bulk: 1.05, head: [0.98, 0.92, 1.05], ears: 'round', muzzle: 'snout', nose: '#1b1310', chest: '#efe0c4', tail: 'none', spikes: '#5a4232' },
  bebritis: { name: 'Bebrs', fur: '#7a4c2c', bulk: 1.16, head: [1.04, 0.96, 1.02], ears: 'round', muzzle: 'bunny', nose: '#2a1a12', chest: '#a87a52', tail: 'beaver' },
};

/** shirt patterns: fn(y, angle) → colour or null (base). y in spine space */
export const TOPS = {
  svitrains: { name: 'Svītrains krekls', base: '#f6f3ea', fn: (y) => (Math.floor((y + 0.06) / 0.05) % 2 ? '#2b4b8f' : null), collar: '#2b4b8f' },
  rutains: { name: 'Rūtains krekls', base: '#c63a2e', fn: (y, a) => { const by = Math.floor((y + 0.06) / 0.065) % 2, ba = Math.floor((a + Math.PI) / (Math.PI / 6)) % 2; return by && ba ? '#3a1d1a' : by || ba ? '#932a22' : null; }, collar: '#3a1d1a' },
  futbola: { name: 'Futbola krekls', base: '#f4c430', fn: (y, a) => ((y > 0.17 && y < 0.23) || Math.abs(Math.abs(a) - Math.PI / 2) < 0.18 ? '#1f4aa8' : null), collar: '#1f4aa8', cuff: '#1f4aa8' },
  zvaigznes: { name: 'Krekls ar zvaigznēm', base: '#263a86', fn: null, collar: '#f2c94c', stars: true },
  latvija: { name: 'Latvijas krekls', base: '#9e3039', fn: (y) => (y > 0.13 && y < 0.2 ? '#f7f4ee' : null), collar: '#f7f4ee' },
};

const EYE = '#1b130f', WHITE = '#ffffff', BLUSH = '#ff8d9c';
const qFromY = (d) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
const qFromZ = (d) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().normalize());
function resample(prof, step) {
  const out = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1], n = Math.max(1, Math.round(Math.abs(y1 - y0) / step));
    for (let k = 0; k < n; k++) out.push([r0 + (r1 - r0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  out.push(prof[prof.length - 1]);
  return out;
}
const lerpProf = (prof, y) => { for (let i = 0; i < prof.length - 1; i++) { const [r0, y0] = prof[i], [r1, y1] = prof[i + 1]; if (y >= y0 && y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return prof[prof.length - 1][0]; };

const SHIRT_PROF = [[0.2, -0.05], [0.204, 0.02], [0.2, 0.1], [0.193, 0.18], [0.18, 0.25], [0.16, 0.31], [0.132, 0.35], [0.1, 0.376]];
const TORSO_PROF = [[0, -0.075], [0.12, -0.065], [0.162, -0.01], [0.172, 0.08], [0.169, 0.18], [0.156, 0.27], [0.126, 0.335], [0.082, 0.38], [0, 0.405]];

/**
 * buildAnimal({animal, fur, shirt, hat, wear}) — same signature as the game.
 * Returns the rig object (root, body, spine, head, legs, arms, tail, shadow,
 * hatHolder, eyeAt, mesh, setHat, setWear, setShirt). Game-side behaviour
 * (animate, setWinter, setSkis…) can be attached to this object unchanged.
 */
export function buildAnimal({ animal = 'lacis', fur = null, shirt = '#d23b3b', hat = null, wear = null } = {}) {
  const P = SPECIES[animal] || SPECIES.lacis;
  fur = fur || P.fur;
  const B = P.bulk, rb = Math.sqrt(B), bird = !!P.bird;
  const k = new Kit(animal.length * 7 + 3);
  const furR = P.skin ?? 0.88;
  const light = P.chest || shade(fur, 0.48), dark = shade(fur, -0.3);
  const F = (o = {}) => ({ rough: furR, grad: [0.9, 1.05], ...o });

  const root = k.root;
  const body = k.group('body', root, [0, HIP, 0]);
  const spine = k.group('spine', body, [0, 0.06, 0]);
  const headY = P.headY ?? 0.55;
  const head = k.group('head', spine, [0, headY, 0.02]);
  const tail = k.group('tail', body, [0, 0.02, -0.15 * B]);

  // ---- pelvis + torso ----
  k.add(G.lathe([[0, -0.16], [0.1, -0.15], [0.158, -0.105], [0.19, -0.03], [0.184, 0.05], [0.15, 0.11], [0, 0.13]], 16), fur, F({ bone: body, s: [B, 1, 0.9 * B] }));
  const torsoSkin = (v) => { const w = smooth(-0.05, 0.08, v.y); return [spine, w, body, 1 - w]; };
  k.add(G.lathe(TORSO_PROF, 16), fur, F({ bone: spine, s: [B, 1, 0.86 * B], skin: torsoSkin }));
  if (bird || animal === 'varde') k.add(G.sph(0.13, 14, 10), light, F({ bone: spine, p: [0, 0.17, 0.075 * B], s: [0.95 * B, 1.3, 0.6], skin: torsoSkin }));

  // eža adatas (mugura) — 1.39.0
  if (P.spikes) {
    const R0 = rng(17);
    for (let row = 0; row < 6; row++) for (let i = 0; i < 12; i++) {
      const y = 0.02 + row * 0.07, a = Math.PI + (i - 5.5) * 0.27 + (row % 2) * 0.13, r = lerpProf(TORSO_PROF, Math.min(0.37, y)) + 0.035;
      const x = Math.sin(a) * r * B, z = Math.cos(a) * r * 0.86 * B, d = new THREE.Vector3(Math.sin(a), 0.35 + row * 0.08, Math.cos(a)).normalize();
      k.add(G.cone(0.03, 0.16 + R0() * 0.04, 5), i % 3 ? P.spikes : shade(P.spikes, 0.35), { bone: spine, p: [x, y, z], q: qFromY(d), rough: 0.9, skin: torsoSkin });
    }
  }
  // ---- shirt (skinned with the torso) ----
  const top = wear && wear.top && TOPS[wear.top];
  const shirtBase = top ? top.base : shirt;
  const patt = (v) => { if (!top || !top.fn) return null; return top.fn(v.y, Math.atan2(v.x, v.z)); };
  const shirtTag = [];
  {
    const prof = resample(SHIRT_PROF, 0.034);
    k.add(G.lathe(prof, 16), shirtBase, { bone: spine, s: [B, 1, 0.86 * B], skin: torsoSkin, rough: 0.9, fc: top ? patt : null, grad: [0.86, 1.02] });
    shirtTag.push(k.parts.length - 1);
    k.add(G.torus(0.2, 0.014, 4, 18), top?.collar || shade(shirtBase, -0.18), { bone: spine, p: [0, -0.05, 0], r: [Math.PI / 2, 0, 0], s: [B, 0.86 * B, 1], skin: torsoSkin, rough: 0.9 });
    k.add(G.torus(0.096, 0.02, 5, 16), top?.collar || shade(shirtBase, -0.12), { bone: spine, p: [0, 0.372, 0.004], r: [Math.PI / 2, 0, 0], s: [B, 0.86 * B, 1], rough: 0.9 });
    if (top?.stars) {
      const st = G.star(0.032, 0.014, 0.01, 5, 0.004);
      const spots = [[0.22, 0.0], [0.12, -0.55], [0.28, 0.5], [0.05, 0.42], [0.16, 0.2], [0.26, -0.3], [0.1, Math.PI], [0.22, Math.PI - 0.6], [0.2, Math.PI + 0.55]];
      spots.forEach(([y, a], i) => {
        const r = lerpProf(SHIRT_PROF, y) + 0.004, x = Math.sin(a) * r * B, z = Math.cos(a) * r * 0.86 * B;
        k.add(st, i % 3 ? '#f2c94c' : '#ffffff', { bone: spine, p: [x, y, z], r: [0, a, i * 0.4], skin: torsoSkin, rough: 0.5, emit: 0.08 });
      });
    }
  }

  // ---- arms ----
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = k.group(s < 0 ? 'shR' : 'shL', spine, [s * (0.15 * B + 0.035), 0.3, 0]);
    const el = k.group(s < 0 ? 'elR' : 'elL', sh, [0, -0.2, 0]);
    if (bird) {
      k.add(G.sph(0.1, 12, 10), fur, F({ bone: sh, p: [s * 0.01, -0.12, -0.02], s: [0.3, 1.32, 0.78], r: [0.1, 0, s * 0.08] }));
      for (let i = 0; i < 3; i++) k.add(G.sph(0.05, 8, 6), shade(fur, -0.08 - i * 0.04), F({ bone: sh, p: [s * 0.012, -0.21 - i * 0.025, -0.04 + i * 0.03], s: [0.3, 1.2, 0.7], r: [0.3, 0, 0] }));
      // 1.38.0: īsa piedurkne arī pīlei
      k.add(G.sph(0.085, 12, 8), shirtBase, { bone: sh, p: [s * 0.012, -0.05, -0.02], s: [0.42, 0.75, 0.9], rough: 0.9, fc: top ? (v) => (top.fn ? top.fn(0.3 + v.y, s * Math.PI / 2) : null) : null });
    } else {
      const armSkin = (v) => { const w = smooth(-0.16, -0.245, v.y); return [el, w, sh, 1 - w]; };
      const sock = P.sock;
      k.add(G.tube([[0, 0.03, 0], [0, -0.2, 0.004], [0, -0.355, 0.012]], [0.066 * rb, 0.054 * rb, 0.047 * rb], 8, { div: 3 }), fur,
        F({ bone: sh, skin: armSkin, vc: sock ? (v) => (v.y < -0.2 ? sock : null) : null }));
      // sleeve
      k.add(G.lathe(resample([[0.068, -0.105], [0.073, -0.085], [0.078, -0.02], [0.074, 0.03], [0.05, 0.055]], 0.04), 12), shirtBase,
        { bone: sh, s: [rb, 1, rb], rough: 0.9, fc: top ? (v) => (top.fn ? top.fn(0.28 + v.y, s * Math.PI / 2) : null) : null, grad: [0.88, 1.02] });
      k.add(G.torus(0.071 * rb, 0.011, 4, 12), top?.cuff || top?.collar || shade(shirtBase, -0.15), { bone: sh, p: [0, -0.1, 0], r: [Math.PI / 2, 0, 0], rough: 0.9 });
      // paw
      const pc = sock || (animal === 'varde' ? fur : shade(fur, 0.12));
      k.add(G.sph(0.052, 10, 7), pc, F({ bone: el, p: [0, -0.2, 0.01], s: [0.98, 1.02, 0.8] }));
      k.add(G.sph(0.021, 6, 4), pc, F({ bone: el, p: [-s * 0.042, -0.185, 0.03], s: [1, 1.3, 1] }));
      for (let f = 0; f < 3; f++) k.add(G.sph(0.017, 5, 4), pc, F({ bone: el, p: [(f - 1) * 0.024, -0.243, 0.022], s: [1, 1.15, 1] }));
    }
    arms.push({ sh, el, side: s });
  }

  // ---- legs ----
  const legs = [];
  const legC = P.legC || fur;
  for (const s of [-1, 1]) {
    const hip = k.group(s < 0 ? 'hipR' : 'hipL', body, [s * 0.095 * B, -0.02, 0]);
    const knee = k.group(s < 0 ? 'kneeR' : 'kneeL', hip, [0, -0.3, 0]);
    const foot = k.marker('foot', knee, [0, -0.35, 0.05]);
    const legSkin = (v) => { const w = smooth(-0.255, -0.345, v.y); return [knee, w, hip, 1 - w]; };
    if (bird) {
      k.add(G.tube([[0, 0.02, 0], [0, -0.3, 0.01], [0, -0.63, 0.02]], [0.034, 0.026, 0.022], 7, { div: 3 }), legC, { bone: hip, skin: legSkin, rough: 0.5 });
      const web = G.poly([[-0.07, 0.12], [0.07, 0.12], [0.035, -0.02], [0, 0.0], [-0.035, -0.02]].map(([x, z]) => [x, z]), 0.018, 0.006);
      k.add(web, legC, { bone: knee, p: [0, -0.37, 0.03], r: [Math.PI / 2, 0, 0], s: [1.15, 1.25, 1], rough: 0.5 });
    } else {
      const sock = P.sock;
      k.add(G.tube([[0, 0.04, 0], [0, -0.3, 0.006], [0, -0.6, 0.02]], [0.122 * rb, 0.088 * rb, 0.068 * rb], 8, { div: 3 }), legC,
        F({ bone: hip, skin: legSkin, vc: sock ? (v) => (v.y < -0.32 ? sock : null) : null }));
      const fc = sock || shade(fur, -0.12), fe = P.feet || 1;
      k.add(G.sph(0.07, 12, 8), fc, F({ bone: knee, p: [0, -0.352, 0.045], s: [1.02, 0.55, 1.48 * fe] }));
      for (let f = 0; f < 3; f++) k.add(G.sph(0.026, 6, 4), fc, F({ bone: knee, p: [(f - 1) * 0.032, -0.37, 0.045 + 0.088 * fe], s: [1, 0.8, 1.1] }));
    }
    legs.push({ hip, knee, foot });
  }

  // ---- head ----
  const R = 0.19, H = P.head, hx = R * H[0], hy = R * H[1], hz = R * H[2];
  const surf = (yaw, pitch, out = 1) => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch) * hx * out, Math.sin(pitch) * hy * out, Math.cos(yaw) * Math.cos(pitch) * hz * out);
  const nrm = (p) => new THREE.Vector3(p.x / (hx * hx), p.y / (hy * hy), p.z / (hz * hz)).normalize();
  k.add(G.sph(R, 18, 13), fur, F({ bone: head, s: H, grad: [0.88, 1.06] }));
  const HB = { bone: head };
  const onFace = (geo, col, yaw, pitch, sc, o = {}) => {
    const p = surf(yaw, pitch, o.out ?? 1), q = qFromZ(nrm(p));
    if (o.roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), o.roll));
    const { out, roll, ...rest } = o; k.add(geo, col, { ...HB, p: [p.x, p.y, p.z], q, s: sc, ...rest }); return p;
  };

  // eyes
  let eyeYaw = 0.36, eyePitch = 0.1, er = 0.03;
  if (animal === 'varde') { eyeYaw = 0.48; eyePitch = 0.62; er = 0.034; }
  if (bird) { eyeYaw = 0.5; eyePitch = 0.18; er = 0.026; }
  let eyeAt = null;
  for (const s of [-1, 1]) {
    let p;
    if (animal === 'varde') {
      const bp = surf(s * eyeYaw, eyePitch, 0.92);
      k.add(G.sph(0.07, 14, 10), fur, F({ ...HB, p: [bp.x, bp.y + 0.01, bp.z] }));
      p = bp.clone().add(new THREE.Vector3(s * 0.012, 0.03, 0.05));
      k.add(G.sph(er * 1.35, 14, 10), '#f6f0d8', { ...HB, p: [p.x, p.y, p.z - 0.01], s: [1, 1, 0.75], rough: 0.25 });
    } else p = surf(s * eyeYaw, eyePitch, 0.985);
    const n = animal === 'varde' ? new THREE.Vector3(s * 0.2, 0.15, 1).normalize() : nrm(p);
    k.add(G.sph(er, 10, 8), EYE, { ...HB, p: [p.x, p.y, p.z], q: qFromZ(n), s: [1, 1.18, 0.62], rough: 0.12 });
    const g1 = p.clone().addScaledVector(n, er * 0.5).add(new THREE.Vector3(-er * 0.28, er * 0.42, 0));
    k.add(G.sph(er * 0.34, 6, 4), WHITE, { ...HB, p: [g1.x, g1.y, g1.z], emit: 1, rough: 0.3 });
    const g2 = p.clone().addScaledVector(n, er * 0.55).add(new THREE.Vector3(er * 0.3, -er * 0.35, 0));
    k.add(G.sph(er * 0.15, 5, 3), WHITE, { ...HB, p: [g2.x, g2.y, g2.z], emit: 1, rough: 0.3 });
    if (s > 0) eyeAt = { x: Math.abs(p.x), y: p.y, z: p.z + er * 0.7, r: er };
    // blush
    if (!bird) onFace(G.sph(0.042, 8, 5), mix(fur, BLUSH, animal === 'varde' ? 0.45 : 0.6), s * 0.68, -0.3, [1, 0.62, 0.22], { rough: 0.9, out: 0.985 });
    // brows (small, friendly)
    if (P.brow) onFace(G.caps(0.009, 0.03, 2, 6), dark, s * 0.36, 0.36, 1, { roll: Math.PI / 2 + s * 0.2, rough: 0.9 });
  }

  // muzzle / nose / mouth
  const nose = (x, y, z, r = 0.026, c = P.nose || '#2a1c16', sc = [1.25, 0.85, 0.85]) => {
    k.add(G.sph(r, 12, 9), c, { ...HB, p: [x, y, z], s: sc, rough: 0.28 });
    k.add(G.sph(r * 0.32, 6, 5), WHITE, { ...HB, p: [x - r * 0.35, y + r * 0.42, z + r * 0.62], emit: 0.7 });
  };
  const smile = (x0, y, z, w = 0.018, c = shade(fur, -0.62)) => {
    for (const s of [-1, 1]) k.add(G.torus(w, 0.0042, 4, 8, Math.PI), c, { ...HB, p: [x0 + s * w, y, z], r: [0.25, 0, Math.PI], rough: 0.8 });
  };
  switch (P.muzzle) {
    case 'round': {
      k.add(G.sph(0.088, 12, 8), shade(fur, 0.32), F({ ...HB, p: [0, -0.06, hz * 0.8], s: [1.1, 0.78, 0.82] }));
      nose(0, -0.025, hz * 0.8 + 0.07, 0.03);
      smile(0, -0.085, hz * 0.8 + 0.066);
      break;
    }
    case 'snout': {
      k.add(G.sph(0.08, 12, 8), fur, F({ ...HB, p: [0, -0.04, hz * 0.84], s: [0.95, 0.72, 1.35] }));
      k.add(G.sph(0.07, 12, 9), light, F({ ...HB, p: [0, -0.07, hz * 0.84], s: [0.92, 0.55, 1.3] }));
      nose(0, -0.02, hz * 0.84 + 0.105, 0.022);
      for (const s of [-1, 1]) k.add(G.cone(0.05, 0.14, 8), light, F({ ...HB, p: [s * hx * 0.88, -0.07, 0.03], r: [0, 0, s * 1.95], s: [1, 1, 0.5] }));
      break;
    }
    case 'bunny': {
      for (const s of [-1, 1]) k.add(G.sph(0.045, 12, 9), light, F({ ...HB, p: [s * 0.033, -0.07, hz * 0.86], s: [1, 0.85, 0.85] }));
      nose(0, -0.04, hz * 0.86 + 0.04, 0.018, P.nose, [1.3, 0.9, 0.8]);
      k.add(G.rbox(0.03, 0.034, 0.012, 0.004), WHITE, { ...HB, p: [0, -0.112, hz * 0.86 + 0.028], rough: 0.4 });
      break;
    }
    case 'cat': {
      for (const s of [-1, 1]) k.add(G.sph(0.042, 12, 9), light, F({ ...HB, p: [s * 0.031, -0.07, hz * 0.88], s: [1.05, 0.82, 0.8] }));
      k.add(G.cone(0.016, 0.02, 3), P.nose, { ...HB, p: [0, -0.04, hz * 0.88 + 0.035], r: [Math.PI / 2 + 0.25, 0, Math.PI], s: [1.4, 1, 1], rough: 0.35 });
      for (const s of [-1, 1]) for (const kk of [-1, 0, 1]) {
        k.add(G.cyl(0.0022, 0.0022, 0.13, 3), '#f4f2ee', { ...HB, p: [s * 0.1, -0.072 + kk * 0.012, hz * 0.86], r: [0, 0, Math.PI / 2 + s * kk * 0.13], rough: 0.6 });
      }
      break;
    }
    case 'pig': {
      k.add(G.cyl(0.06, 0.066, 0.07, 16), shade(fur, 0.12), F({ ...HB, p: [0, -0.04, hz * 0.93], r: [Math.PI / 2, 0, 0], grad: [0.9, 1] }));
      k.add(G.torus(0.058, 0.008, 5, 16), shade(fur, 0.05), { ...HB, p: [0, -0.04, hz * 0.93 + 0.035], rough: 0.6 });
      for (const s of [-1, 1]) k.add(G.sph(0.014, 8, 6), '#8a3a4c', { ...HB, p: [s * 0.022, -0.04, hz * 0.93 + 0.036], s: [0.8, 1.2, 0.4], rough: 0.5 });
      smile(0, -0.11, hz * 0.9, 0.015);
      break;
    }
    case 'dog': {
      k.add(G.sph(0.08, 12, 8), shade(fur, 0.28), F({ ...HB, p: [0, -0.055, hz * 0.84], s: [1.0, 0.75, 1.2] }));
      nose(0, -0.02, hz * 0.84 + 0.092, 0.03);
      smile(0, -0.088, hz * 0.84 + 0.08);
      k.add(G.sph(0.022, 8, 6), '#f07a8a', { ...HB, p: [0.012, -0.112, hz * 0.84 + 0.065], s: [1, 0.5, 1.3], rough: 0.4 });
      break;
    }
    case 'frog': {
      k.add(G.torus(hx * 1.0, 0.007, 4, 20, Math.PI), shade(fur, -0.55), { ...HB, p: [0, -0.045, 0], r: [Math.PI / 2 + 0.08, 0, 0], s: [1, hz / hx * 1.0, 1] });
      for (const s of [-1, 1]) k.add(G.sph(0.006, 5, 4), shade(fur, -0.5), { ...HB, p: [s * 0.03, 0.02, hz * 0.985] });
      [[0.1, 0.12, -0.05], [-0.06, 0.15, -0.09], [0.0, 0.06, -0.16]].forEach(([x, y, z]) => k.add(G.sph(0.022, 8, 6), shade(fur, -0.25), { ...HB, p: [x, y, z], s: [1, 0.35, 1], rough: 0.5 }));
      break;
    }
    case 'bill': {
      k.add(G.sph(0.075, 14, 9), '#f2a12a', { ...HB, p: [0, -0.04, hz * 0.95], s: [0.88, 0.26, 1.15], rough: 0.45 });
      k.add(G.sph(0.068, 12, 8), '#e08a1c', { ...HB, p: [0, -0.06, hz * 0.92], s: [0.8, 0.2, 1.05], rough: 0.5 });
      break;
    }
  }
  // dog eye patch, cat forehead stripes
  if (P.patch) onFace(G.sph(0.06, 12, 8), shade(fur, -0.35), 0.38, 0.12, [1, 1, 0.25], { out: 0.97 });
  if (P.stripes) for (const a of [-0.18, 0, 0.18]) onFace(G.caps(0.012, 0.06, 2, 6), shade(fur, -0.35), a, 0.7, 1, { out: 0.99, rough: 0.9 });

  // ears
  const earAt = (s, yaw, pitch, tilt = 0.25) => {
    const p = surf(s * yaw, pitch, 0.9), n = nrm(p);
    const d = n.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, 1, 0)).add(new THREE.Vector3(s * tilt, 0, 0)).normalize();
    return { p, q: qFromY(d), d };
  };
  for (const s of [-1, 1]) {
    switch (P.ears) {
      case 'round': {
        const { p, q } = earAt(s, 0.62, 0.68);
        k.add(G.sph(0.068, 12, 9), fur, F({ ...HB, p: [p.x, p.y, p.z], q, s: [1, 1, 0.5] }));
        const ip = p.clone().add(new THREE.Vector3(0, 0.004, 0.02));
        k.add(G.sph(0.042, 10, 8), shade(fur, -0.42), { ...HB, p: [ip.x, ip.y, ip.z], q, s: [1, 1, 0.3], rough: 0.95 });
        break;
      }
      case 'fox': case 'cat': {
        const fox = P.ears === 'fox';
        const { p, q } = earAt(s, fox ? 0.5 : 0.56, fox ? 0.62 : 0.6, fox ? 0.2 : 0.35);
        const h = fox ? 0.17 : 0.12, r = fox ? 0.064 : 0.058;
        k.add(G.cone(r, h, 8), fur, F({ ...HB, p: [p.x, p.y + h * 0.35, p.z], q, s: [1, 1, 0.5], vc: fox ? (v) => (v.y > p.y + h * 0.55 ? '#2a2220' : null) : null }));
        const ip = p.clone().add(new THREE.Vector3(0, h * 0.3, 0.016));
        k.add(G.cone(r * 0.6, h * 0.72, 6), fox ? '#fbf2e2' : '#e8a2ac', { ...HB, p: [ip.x, ip.y, ip.z], q, s: [1, 1, 0.3], rough: 0.95 });
        break;
      }
      case 'long': {
        const { p, q } = earAt(s, 0.3, 0.75, 0.18);
        const L = 0.21;
        const e = G.sph(1, 12, 10);
        const c = p.clone().add(new THREE.Vector3(s * 0.03, L * 0.85, -0.02));
        k.add(e, fur, F({ ...HB, p: [c.x, c.y, c.z], q, s: [0.052, L, 0.03] }));
        k.add(e, '#eeb0b8', { ...HB, p: [c.x, c.y, c.z + 0.012], q, s: [0.032, L * 0.82, 0.02], rough: 0.95 });
        break;
      }
      case 'floppy': {
        const p = surf(s * 1.25, 0.32, 0.92);
        k.add(G.sph(1, 12, 10), shade(fur, -0.32), F({ ...HB, p: [p.x + s * 0.02, p.y - 0.085, p.z - 0.01], r: [0.1, 0, s * 0.22], s: [0.04, 0.12, 0.072] }));
        break;
      }
      case 'pig': {
        const { p } = earAt(s, 0.55, 0.62);
        k.add(G.cone(0.062, 0.12, 8), fur, F({ ...HB, p: [p.x, p.y + 0.03, p.z + 0.02], r: [0.75, 0, -s * 0.5], s: [1, 1, 0.38] }));
        break;
      }
      case 'squirrel': {
        const { p, q } = earAt(s, 0.5, 0.66, 0.22);
        k.add(G.cone(0.05, 0.12, 8), fur, F({ ...HB, p: [p.x, p.y + 0.04, p.z], q, s: [1, 1, 0.55] }));
        k.add(G.cone(0.022, 0.07, 6), shade(fur, -0.25), F({ ...HB, p: [p.x, p.y + 0.12, p.z - 0.01], q }));
        break;
      }
      case 'tuft': {
        if (s > 0) for (let i = 0; i < 3; i++) k.add(G.cone(0.022, 0.09, 6), shade(fur, -0.05), F({ ...HB, p: [(i - 1) * 0.02, hy * 0.98, 0.02 - i * 0.02], r: [-0.3 - i * 0.15, 0, (i - 1) * 0.35] }));
        break;
      }
    }
  }

  // eža adatas arī pakausī (1.39.0)
  if (P.spikes) for (let row = 0; row < 4; row++) for (let i = 0; i < 8; i++) {
    const p = surf(Math.PI + (i - 3.5) * 0.36 + (row % 2) * 0.18, -0.25 + row * 0.3, 0.93), n = nrm(p);
    const d = n.clone().add(new THREE.Vector3(0, 0.25, -0.5)).normalize();
    k.add(G.cone(0.03, 0.15, 5), i % 3 ? P.spikes : shade(P.spikes, 0.35), { ...HB, p: [p.x, p.y, p.z], q: qFromY(d), rough: 0.9 });
  }
  // ---- tails (on the 'tail' bone, game rotates tail.rotation.y) ----
  const TB = { bone: tail };
  switch (P.tail) {
    case 'ball': k.add(G.sph(0.05, 10, 8), fur, F({ ...TB, p: [0, 0, -0.02] })); break;
    case 'cotton': k.add(G.blob(0.06, 1, 0.12, 3), '#fbfaf6', { ...TB, p: [0, 0, -0.03], rough: 0.95 }); break;
    case 'bushy':
      k.add(G.tube([[0, 0, 0], [0, -0.03, -0.14], [0, 0.04, -0.3], [0, 0.16, -0.42]], (t) => 0.035 + Math.sin(Math.PI * Math.pow(t, 0.6)) * 0.075, 10, { div: 4, capB: true }),
        fur, F({ ...TB, vc: (v) => (v.z < -0.37 ? '#fbf2e2' : null) }));
      break;
    case 'long':
      k.add(G.tube([[0, 0, 0], [0, -0.06, -0.15], [0, 0.05, -0.3], [0, 0.2, -0.33]], (t) => 0.028 - t * 0.008, 7, { div: 4, capB: true }), fur, F({ ...TB, vc: (v) => (v.y > 0.16 ? shade(fur, -0.35) : null) }));
      break;
    case 'wag':
      k.add(G.tube([[0, 0, 0], [0, 0.06, -0.1], [0, 0.18, -0.16]], (t) => 0.032 - t * 0.014, 7, { div: 4, capB: true }), fur, F({ ...TB }));
      break;
    case 'curly': {
      const pts = []; for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 3.2; pts.push([Math.sin(a) * 0.035, 0.02 + Math.cos(a) * 0.035 - 0.035 + i * 0.002, -0.02 - i * 0.004]); }
      k.add(G.tube(pts, 0.011, 6, { capB: true }), fur, F({ ...TB }));
      break;
    }
    case 'squirrel':
      k.add(G.tube([[0, 0, 0], [0, 0.04, -0.12], [0, 0.22, -0.22], [0, 0.48, -0.2], [0, 0.62, -0.08], [0, 0.6, 0.0]], (t) => 0.04 + Math.sin(Math.PI * Math.pow(t, 0.7)) * 0.085, 10, { div: 4, capB: true }),
        fur, F({ ...TB, vc: (v) => (v.y > 0.56 ? shade(fur, 0.25) : null) }));
      break;
    case 'beaver':
      k.add(G.rbox(0.17, 0.035, 0.3, 0.016), '#4a3a32', { ...TB, p: [0, -0.1, -0.16], r: [0.5, 0, 0], rough: 0.7, fc: (c) => ((Math.floor(c.x * 40) + Math.floor(c.z * 40)) % 2 ? '#3c2f28' : null) });
      break;
    case 'duck':
      for (const s of [-1, 0, 1]) k.add(G.cone(0.035, 0.12, 6), fur, F({ ...TB, p: [s * 0.03, 0.06, -0.05], r: [-2.0, 0, s * 0.3], s: [1, 1, 0.5] }));
      break;
  }

  k.groundAO = 0;
  k.build({ name: 'animal-' + animal });
  const mesh = k.root.userData.mz.meshes[0];

  // hat holder sits on the crown and scales hats to this head
  const hatHolder = new THREE.Group();
  hatHolder.position.y = hy * 0.66;
  hatHolder.scale.setScalar(hx * 0.98 / 0.25);
  head.add(hatHolder);
  const shadow = blobShadow(0.95); root.add(shadow);

  const av = {
    root, body, spine, head, legs, arms, tail, shadow, hatHolder, eyeAt, mesh, bulk: B, species: animal,
    hatId: null, wearParts: [],
    setHat(id) {
      this.hatId = id;
      while (hatHolder.children.length) hatHolder.remove(hatHolder.children[0]);
      if (id) hatHolder.add(buildHat(id));
    },
    setWear(w) {
      for (const o of this.wearParts) o.removeFromParent();
      this.wearParts = []; this.wings = null;
      if (!w) return;
      const put = (g, parent) => { if (g) { parent.add(g); this.wearParts.push(g); } return g; };
      if (w.glasses && eyeAt) put(buildGlasses(w.glasses, eyeAt), head);
      if (w.neck) put(buildNeckwear(w.neck, B, bird), spine);
      if (w.back) { const g = put(buildBackwear(w.back, B), spine); if (g && g.userData.wings) this.wings = g.userData.wings; }
      if (w.feet && !bird) for (const L of legs) put(buildShoe(w.feet, B, P.feet || 1, L.foot.position), L.knee);
    },
    /** recolour the shirt without rebuilding (plain shirts only) */
    setShirt(color) {
      const c = C(color), col = mesh.geometry.attributes.color, sh = mesh.userData.shirtRange;
      if (!sh) return; for (let i = sh[0]; i < sh[1]; i++) { const kk = mesh.userData.shirtK[i - sh[0]]; col.setXYZ(i, c.r * kk, c.g * kk, c.b * kk); }
      col.needsUpdate = true;
    },
  };
  // remember the shirt vertex range for setShirt()
  if (!bird && !top) {
    let start = 0, i = 0;
    for (const part of k.parts) { if (i === shirtTag[0]) break; start += partVerts(part); i++; }
    const n = partVerts(k.parts[shirtTag[0]]), col = mesh.geometry.attributes.color, base = C(shirtBase);
    mesh.userData.shirtRange = [start, start + n];
    mesh.userData.shirtK = Array.from({ length: n }, (_, j) => col.getX(start + j) / Math.max(1e-5, base.r));
  }
  av.setHat(hat);
  av.setWear(wear);
  return av;
}
function partVerts(part) { const g = part.geo, flat = part.o.flat ?? g.userData.flat; const fc = part.o.fc; const n = (flat || fc) && g.index ? g.index.count : g.attributes.position.count; return n * ((part.o.double ?? g.userData.double) ? 2 : 1); }

// ---------------- wearables (each = 1 small mesh) ----------------
export const WEAR = {
  glasses: { saulesbrilles: 'Saulesbrilles', apalas: 'Apaļās brilles', sirds: 'Sirsniņbrilles' },
  neck: { taurenitis: 'Tauriņš', kaklasaite: 'Kaklasaite', krelles: 'Pērļu krelles', medala: 'Zelta medaļa' },
  back: { mugursoma: 'Mugursoma', apmetnis: 'Varoņa apmetnis', sparni: 'Tauriņa spārni' },
  feet: { zabaki: 'Gumijas zābaki', kedas: 'Kedas' },
};

export function buildGlasses(id, E) {
  const k = new Kit(5);
  const frame = id === 'saulesbrilles' ? '#18181c' : id === 'sirds' ? '#e83a84' : '#7a4f2a';
  const r = Math.max(0.034, E.r * 1.55), z = E.z + 0.012;
  for (const s of [-1, 1]) {
    const lx = s * Math.max(E.x, r * 1.08);
    if (id === 'sirds') {
      k.add(G.heart(r * 1.05, 0.012, 0.004), frame, { p: [lx, E.y, z], rough: 0.35 });
      k.add(G.heart(r * 0.82, 0.004, 0), '#ff7ab4', { p: [lx, E.y, z + 0.006], rough: 0.08, ch: 'glass' });
    } else {
      const sc = id === 'saulesbrilles' ? [1.22, 0.86, 1] : [1, 1, 1];
      k.add(G.torus(r, 0.0065, 6, 22), frame, { p: [lx, E.y, z], s: sc, rough: 0.3, metal: id === 'apalas' ? 0.6 : 0.1 });
      if (id === 'saulesbrilles') k.add(G.disc(r, 22), '#0d1220', { p: [lx, E.y, z], s: sc, rough: 0.06, metal: 0.55, double: true });
      else k.add(G.disc(r, 22), '#cfe8f8', { p: [lx, E.y, z], rough: 0.05, ch: 'glass', double: true });
    }
    rod(k, [lx + s * r * 1.05, E.y + 0.006, z], [lx + s * r * 1.12, E.y + 0.01, z - 0.13], 0.005, frame, { seg: 4 });
  }
  const bx = Math.max(E.x, r * 1.08) - r * 0.95;
  k.add(G.torus(bx, 0.005, 4, 8, Math.PI), frame, { p: [0, E.y + r * 0.15, z], rough: 0.3 });
  return k.build({ name: 'glasses-' + id, castShadow: false });
}

export function buildNeckwear(id, B, bird) {
  const k = new Kit(6);
  const shirtZ = (yy) => lerpProf(SHIRT_PROF, Math.min(0.376, yy)) * 0.86 * B;
  const y = bird ? 0.39 : 0.35, zf = (bird ? 0.11 * 0.86 * B : shirtZ(0.35)) + 0.016;
  if (id === 'taurenitis') {
    for (const s of [-1, 1]) k.add(G.sph(0.045, 10, 8), '#c8102a', { p: [s * 0.036, y, zf], s: [0.85, 0.62, 0.38], r: [0, 0, s * 0.25], rough: 0.5 });
    k.add(G.sph(0.018, 8, 6), '#9a0a20', { p: [0, y, zf + 0.008], rough: 0.5 });
  } else if (id === 'kaklasaite') {
    k.add(G.rbox(0.038, 0.032, 0.022, 0.008), '#2a5ac0', { p: [0, y, zf], rough: 0.45 });
    const yTop = y - 0.02, yBot = 0.14, zt = shirtZ(yTop) + 0.008, zb = shirtZ(yBot) + 0.01;
    const ang = Math.atan2(zb - zt, yTop - yBot);
    const blade = G.poly([[-0.018, 0], [0.018, 0], [0.032, -0.17], [0, -0.205], [-0.032, -0.17]], 0.008, 0.003);
    k.add(blade, '#2a5ac0', { p: [0, yTop, zt], r: [ang, 0, 0], rough: 0.45, vc: (v) => (Math.abs(v.y - (yTop - 0.09)) < 0.012 ? '#f2c12e' : null) });
  } else if (id === 'krelles') {
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, front = Math.max(0, Math.cos(a)), yy = 0.362 - front * front * 0.06;
      const r = lerpProf(SHIRT_PROF, yy) + 0.012;
      k.add(G.sph(i === 0 ? 0.02 : 0.0135, 8, 6), '#f8f3ea', { p: [Math.sin(a) * r * B, yy, Math.cos(a) * r * 0.86 * B], rough: 0.18, metal: 0.15 });
    }
  } else if (id === 'medala') {
    for (const s of [-1, 1]) {
      const a = [s * 0.07, y + 0.01, shirtZ(y + 0.01) + 0.004], b = [s * 0.012, y - 0.13, shirtZ(y - 0.13) + 0.008];
      const { m, len } = between(a, b);
      k.add(G.box(0.024, len, 0.006), s < 0 ? '#2a5ac0' : '#c8102a', { m, rough: 0.6 });
    }
    const cz = shirtZ(y - 0.16) + 0.016;
    k.add(G.cyl(0.04, 0.04, 0.012, 20), '#e8b730', { p: [0, y - 0.165, cz], r: [Math.PI / 2 - 0.15, 0, 0], rough: 0.25, metal: 1 });
    k.add(G.star(0.022, 0.01, 0.006, 5, 0.002), '#ffd968', { p: [0, y - 0.165, cz + 0.008], r: [-0.15, 0, 0], rough: 0.2, metal: 1 });
  } else return null;
  return k.build({ name: 'neck-' + id });
}

export function buildBackwear(id, B) {
  const k = new Kit(7);
  const zb = -0.86 * 0.2 * B;
  if (id === 'mugursoma') {
    k.add(G.rbox(0.27 * B, 0.3, 0.13, 0.05, 2), '#3a9a4a', { p: [0, 0.2, zb - 0.06], rough: 0.8, grad: [0.85, 1.05] });
    k.add(G.rbox(0.28 * B, 0.1, 0.14, 0.04, 2), '#2a7a38', { p: [0, 0.33, zb - 0.062], r: [0.1, 0, 0], rough: 0.8 });
    k.add(G.rbox(0.18 * B, 0.1, 0.05, 0.025, 2), '#f2c12e', { p: [0, 0.13, zb - 0.135], rough: 0.7 });
    for (const s of [-1, 1]) k.add(G.torus(0.12, 0.012, 5, 12, Math.PI * 1.05), '#2a6a34', { p: [s * 0.075 * B, 0.27, -0.02], r: [0, Math.PI / 2, 0], s: [1.15 * B, 1.0, 1], rough: 0.8 });
  } else if (id === 'apmetnis') {
    const cape = new THREE.CylinderGeometry(0.18 * B, 0.33 * B, 0.8, 14, 4, true, Math.PI * 0.6, Math.PI * 0.8); cape.translate(0, -0.4, 0);
    k.add(cape, '#d42e2e', { p: [0, 0.41, 0.01], r: [0.1, 0, 0], s: [1, 1, 0.88], rough: 0.7, double: true, grad: [0.75, 1.05] });
    k.add(G.torus(0.088 * B, 0.014, 6, 18, Math.PI), '#f2c12e', { p: [0, 0.405, 0.005], r: [Math.PI / 2, 0, Math.PI], rough: 0.3, metal: 1 });
    for (const s of [-1, 1]) k.add(G.sph(0.022, 8, 6), '#f2c12e', { p: [s * 0.088 * B, 0.405, 0.03], rough: 0.25, metal: 1 });
  } else if (id === 'sparni') {
    const wings = [];
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.bezierCurveTo(0.04, 0.26, 0.34, 0.32, 0.33, 0.1); sh.bezierCurveTo(0.33, 0.0, 0.2, -0.02, 0.07, -0.01);
    sh.bezierCurveTo(0.23, -0.05, 0.26, -0.21, 0.15, -0.25); sh.bezierCurveTo(0.08, -0.27, 0.02, -0.12, 0, 0);
    const geo = new THREE.ShapeGeometry(sh, 10);
    for (const s of [-1, 1]) {
      const piv = k.group('wing' + s, k.root, [s * 0.03, 0.3, zb - 0.01]);
      k.add(geo, '#8fd0ff', { bone: piv, s: [s, 1, 1], double: true, rough: 0.35, emit: 0.12, vc: (v) => { const r = Math.hypot(v.x, v.y); return r < 0.06 ? '#6a4ad6' : mix('#8fd0ff', '#ff9fd2', Math.min(1, r * 3)); } });
      k.add(G.sph(0.035, 10, 7), '#f2c12e', { bone: piv, p: [s * 0.2, 0.13, 0.004], s: [1, 1, 0.25], rough: 0.4, emit: 0.2 });
      k.add(G.sph(0.022, 8, 6), '#ffffff', { bone: piv, p: [s * 0.16, -0.14, 0.004], s: [1, 1, 0.25], rough: 0.4 });
      wings.push(piv);
    }
    const g = k.build({ name: 'wings', castShadow: false });
    g.userData.wings = wings;
    return g;
  } else return null;
  return k.build({ name: 'back-' + id });
}

export function buildShoe(id, B, feet, fp) {
  const k = new Kit(8), sq = Math.sqrt(B);
  if (id === 'zabaki') {
    k.add(G.tube([[0, fp.y + 0.02, 0.0], [0, fp.y + 0.24, 0]], [0.072 * sq, 0.075 * sq], 12, { div: 2 }), '#f4c62e', { rough: 0.3, grad: [0.85, 1.05] });
    k.add(G.torus(0.075 * sq, 0.011, 5, 14), '#f8d75a', { p: [0, fp.y + 0.24, 0], r: [Math.PI / 2, 0, 0], rough: 0.3 });
    k.add(G.sph(0.075, 14, 10), '#f4c62e', { p: [fp.x, fp.y + 0.005, fp.z + 0.012], s: [1.06, 0.62, feet * 1.62], rough: 0.3 });
    k.add(G.rbox(0.13, 0.026, 0.23 * feet, 0.012), '#3a3330', { p: [0, fp.y - 0.034, fp.z + 0.018], rough: 0.9 });
  } else if (id === 'kedas') {
    k.add(G.sph(0.074, 14, 10), '#f6f6f4', { p: [fp.x, fp.y + 0.004, fp.z + 0.01], s: [1.06, 0.66, feet * 1.62], rough: 0.6 });
    k.add(G.rbox(0.135, 0.03, 0.235 * feet, 0.012), '#e83a3a', { p: [0, fp.y - 0.032, fp.z + 0.016], rough: 0.6 });
    k.add(G.sph(0.03, 8, 6), '#ffffff', { p: [0, fp.y - 0.01, fp.z + 0.1 * feet + 0.04], s: [1.6, 0.7, 1], rough: 0.5 });
    for (let i = 0; i < 3; i++) k.add(G.box(0.07, 0.008, 0.012), '#2a5ac0', { p: [0, fp.y + 0.035 - i * 0.004, fp.z - 0.005 + i * 0.03], r: [0.35, 0, 0], rough: 0.6 });
  } else return null;
  return k.build({ name: 'shoe-' + id });
}

/** tiny pose driver for the catalogue (the game keeps its own animate()) */
export function posePlayer(av, t, state = 'idle') {
  const L = av.legs, A = av.arms;
  let hip = [0, 0], knee = [0.05, 0.05], sh = [0.03, 0.03], shZ = [-0.07, 0.07], el = [-0.18, -0.18], bY = HIP, spX = 0.02, hY = 0, spY = 0;
  if (state === 'walk') {
    const ph = t * 7;
    for (let i = 0; i < 2; i++) { const s = Math.sin(ph + i * Math.PI), c = Math.cos(ph + i * Math.PI); hip[i] = -s * 0.42; knee[i] = Math.max(0, c) * 0.55 + 0.08; sh[1 - i] = -s * 0.32; el[1 - i] = -0.3 - Math.max(0, -s) * 0.25; }
    bY = HIP - Math.abs(Math.sin(ph)) * 0.025; spX = 0.06; spY = Math.sin(ph) * 0.07;
  } else if (state === 'wave') {
    sh = [0, -0.4]; shZ = [-0.07, 2.4 + Math.sin(t * 9) * 0.25]; el = [-0.15, 0]; hY = 0.15;
  } else {
    bY = HIP + Math.sin(t * 1.8) * 0.004; spX = 0.02 + Math.sin(t * 1.8) * 0.01; hY = Math.sin(t * 0.5) * 0.3;
  }
  for (let i = 0; i < 2; i++) { L[i].hip.rotation.x = hip[i]; L[i].knee.rotation.x = knee[i]; A[i].sh.rotation.x = sh[i]; A[i].sh.rotation.z = shZ[i]; A[i].el.rotation.x = el[i]; }
  av.body.position.y = bY; av.spine.rotation.x = spX; av.spine.rotation.y = spY; av.head.rotation.y = hY - spY * 0.8;
  if (av.tail) av.tail.rotation.y = Math.sin(t * 2) * 0.25;
  if (av.wings) { const f = Math.sin(t * 2.2) * 0.35; av.wings[0].rotation.y = 0.35 + f; av.wings[1].rotation.y = -0.35 - f; }
}

// =====================================================================
//  Hats — each hat is ONE mesh. Hat space: crown radius ≈ 0.25, crown
//  base at y≈0 (same as the game's hatHolder convention).
// =====================================================================
export const HATS = {
  salmu: 'Salmu cepure', vainags: 'Ziedu vainags', ozols: 'Ozollapu vainags', cilindrs: 'Cilindrs', kronis: 'Kronis',
  kivere: 'Bruņinieka ķivere', nagene: 'Beisbola cepure', berete: 'Berete', kovbojs: 'Kovboja cepure', pirats: 'Pirāta cepure', jurnieks: 'Jūrnieka cepure', ziemas: 'Ziemas cepure',
};

/** rounded n-petal flower outline, extruded thin (cheap, crisp silhouette) */
export function flowerGeo(r = 0.04, n = 6, d = 0.008, inner = 0.45) {
  const s = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    const p0 = [Math.cos(a0) * r * inner, Math.sin(a0) * r * inner];
    if (!i) s.moveTo(p0[0], p0[1]);
    s.bezierCurveTo(Math.cos(a0 + 0.1) * r * 1.25, Math.sin(a0 + 0.1) * r * 1.25, Math.cos(a1 - 0.1) * r * 1.25, Math.sin(a1 - 0.1) * r * 1.25, Math.cos(a1) * r * inner, Math.sin(a1) * r * inner);
    void am;
  }
  return G.ext(s, d, d * 0.4, 3);
}
/** lobed oak leaf (flat, double sided) along +Y */
export function oakLeafGeo(len = 0.18) {
  const pts = [[0, 0], [0.018, 0.02], [0.05, 0.04], [0.03, 0.065], [0.058, 0.095], [0.03, 0.115], [0.048, 0.145], [0.02, 0.16], [0, 0.185]];
  const sh = new THREE.Shape(); sh.moveTo(0, 0);
  for (const [x, y] of pts.slice(1)) sh.lineTo(x * len / 0.185, y * len / 0.185);
  for (let i = pts.length - 2; i > 0; i--) sh.lineTo(-pts[i][0] * len / 0.185, pts[i][1] * len / 0.185);
  const g = new THREE.ShapeGeometry(sh, 1); g.userData.double = true; return g;
}

export function buildHat(id) {
  const k = new Kit(11 + id.length);
  const T = Math.PI * 2;
  switch (id) {
    case 'salmu': {
      const straw = '#f0d48c', straw2 = '#d9b866';
      const weave = (v) => { const a = Math.atan2(v.x, v.z), r = Math.hypot(v.x, v.z); return (Math.floor((a + Math.PI) / (T / 28)) + Math.floor((r + v.y) / 0.035)) % 2 ? straw2 : null; };
      k.add(G.lathe([[0.52, -0.035], [0.47, -0.012], [0.38, 0.0], [0.28, 0.008], [0.262, 0.05], [0.255, 0.17], [0.235, 0.225], [0.17, 0.255], [0, 0.262]], 28), straw, { rough: 0.95, double: true, fc: weave, grad: [0.85, 1.05] });
      k.add(G.lathe([[0.264, 0.035], [0.266, 0.1]], 28), '#b8322a', { rough: 0.55, double: true });
      k.add(G.sph(0.04, 10, 8), '#b8322a', { p: [0.26, 0.068, 0.07], s: [0.45, 0.9, 1.5], rough: 0.55 });
      k.add(G.sph(0.04, 10, 8), '#b8322a', { p: [0.26, 0.068, -0.03], s: [0.45, 0.9, 1.5], rough: 0.55 });
      break;
    }
    case 'vainags': {
      k.add(G.torus(0.27, 0.036, 6, 26), '#4b7d2c', { r: [Math.PI / 2, 0, 0], rough: 0.9, jit: 0.1 });
      const lf = G.leaf(0.12, 0.05, { rows: 3, fold: 0.3, bend: 0.2 });
      for (let i = 0; i < 22; i++) {
        const a = i / 22 * T;
        k.add(lf, i % 2 ? '#5a9a34' : '#3f7d28', { p: [Math.sin(a) * 0.27, 0.0, Math.cos(a) * 0.27], r: [-1.0, a + (i % 2 ? 1.1 : -1.1), 0], ro: 'YXZ', rough: 0.8 });
      }
      const cols = ['#ffffff', '#ffd83a', '#4a6ae0', '#ffffff', '#e8302a', '#b06ae0', '#ffffff', '#ff9ac0'];
      const fl = flowerGeo(0.045, 6, 0.01);
      cols.forEach((c, i) => {
        const a = i / cols.length * T + 0.2, x = Math.sin(a) * 0.272, z = Math.cos(a) * 0.272;
        k.add(fl, c, { p: [x, 0.045, z], r: [-Math.PI / 2 + 0.45, a, 0], ro: 'YXZ', rough: 0.6 });
        k.add(G.sph(0.016, 7, 5), c === '#ffd83a' ? '#e08a1a' : '#f2b81a', { p: [x, 0.052, z], rough: 0.6 });
      });
      break;
    }
    case 'ozols': {
      k.add(G.torus(0.28, 0.026, 5, 26), '#5a4126', { r: [Math.PI / 2, 0, 0], rough: 0.9 });
      const lf = oakLeafGeo(0.19);
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * T;
        k.add(lf, ['#2f6b24', '#3f7d2a', '#4f8a30'][i % 3], { p: [Math.sin(a) * 0.28, -0.005, Math.cos(a) * 0.28], r: [-1.05, a + (i % 2 ? 0.75 : -0.75), 0], ro: 'YXZ', rough: 0.75, jit: 0.12 });
      }
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * T + 0.4, x = Math.sin(a) * 0.305, z = Math.cos(a) * 0.305;
        k.add(G.sph(0.026, 10, 8), '#a9772f', { p: [x, 0.03, z], s: [1, 1.35, 1], rough: 0.35 });
        k.add(G.hemi(0.029, 10, 4), '#6a4f2a', { p: [x, 0.048, z], rough: 1 });
      }
      break;
    }
    case 'ziemas': {
      const knit = '#d8333a', rib = (v) => (Math.floor((Math.atan2(v.x, v.z) + Math.PI) / (T / 24)) % 2 ? shade(knit, -0.12) : null);
      k.add(new THREE.SphereGeometry(0.29, 24, 10, 0, T, 0, Math.PI * 0.55), knit, { p: [0, -0.08, 0], s: [1.04, 1.22, 1.04], rough: 1, fc: rib, double: true });
      k.add(G.torus(0.285, 0.064, 8, 24), '#f4f0e8', { p: [0, -0.07, 0], r: [Math.PI / 2, 0, 0], s: [1.03, 1.03, 1.15], rough: 1, fc: (v) => (Math.floor((Math.atan2(v.x, v.z) + Math.PI) / (T / 24)) % 2 ? '#dcd6cc' : null) });
      k.add(G.blob(0.105, 2, 0.16, 4), '#f4f0e8', { p: [0, 0.29, 0], rough: 1 });
      break;
    }
    case 'cilindrs': {
      k.add(G.lathe([[0.4, 0.03], [0.385, 0.004], [0.3, -0.004], [0.24, 0.008], [0.232, 0.2], [0.244, 0.42], [0.25, 0.455], [0.235, 0.47], [0, 0.472]], 28), '#16161a', { rough: 0.42, double: true, grad: [0.8, 1.15] });
      k.add(G.lathe([[0.238, 0.018], [0.242, 0.105]], 28), '#8a1218', { rough: 0.25 });
      break;
    }
    case 'kronis': {
      const gold = '#e9b938';
      k.add(G.lathe([[0.235, 0.0], [0.245, 0.005], [0.246, 0.075], [0.238, 0.08], [0.228, 0.075], [0.226, 0.005]], 32), gold, { rough: 0.22, metal: 1 });
      k.add(G.torus(0.246, 0.012, 6, 36), gold, { p: [0, 0.004, 0], r: [Math.PI / 2, 0, 0], rough: 0.22, metal: 1 });
      for (let i = 0; i < 8; i++) {
        const a = (i + 0.5) / 8 * T, x = Math.sin(a), z = Math.cos(a);
        k.add(G.cone(0.055, 0.15, 4), gold, { p: [x * 0.236, 0.15, z * 0.236], r: [0, a + Math.PI / 4, 0], s: [1, 1, 0.32], rough: 0.22, metal: 1, flat: true });
        k.add(G.sph(0.018, 8, 6), '#ffe27a', { p: [x * 0.236, 0.228, z * 0.236], rough: 0.2, metal: 1 });
        k.add(G.oct(0.024), ['#d8102c', '#1a56e0', '#12b05a'][i % 3], { p: [x * 0.25, 0.042, z * 0.25], r: [0, a, 0], s: [1, 1.2, 0.55], rough: 0.06, metal: 0.25, emit: 0.15, flat: true });
      }
      k.add(G.lathe([[0.22, 0.02], [0.12, 0.12], [0, 0.16]], 20), '#7a1428', { rough: 0.85 });
      break;
    }
    case 'kivere': {
      const steel = '#b9c0c8';
      k.add(G.lathe([[0.3, -0.42], [0.3, -0.2], [0.302, -0.05], [0.295, 0.06], [0.265, 0.16], [0.2, 0.235], [0.1, 0.275], [0, 0.285]], 26), steel, { p: [0, 0.02, 0], s: [1, 1, 1.08], rough: 0.25, metal: 1, grad: [0.75, 1.1] });
      k.add(G.torus(0.302, 0.015, 6, 28), '#d9b13a', { p: [0, -0.04, 0], r: [Math.PI / 2, 0, 0], s: [1, 1.08, 1], rough: 0.25, metal: 1 });
      for (const y of [-0.13, -0.2]) k.add(G.rbox(0.36, 0.022, 0.06, 0.01), '#15171a', { p: [0, y, 0.305], rough: 0.6 });
      k.add(G.rbox(0.03, 0.24, 0.04, 0.012), steel, { p: [0, -0.16, 0.33], rough: 0.25, metal: 1 });
      k.add(G.rbox(0.04, 0.3, 0.6, 0.02), '#d9b13a', { p: [0, 0.2, -0.02], r: [-0.05, 0, 0], s: [1, 1, 1], rough: 0.25, metal: 1 });
      k.add(G.tube([[0, 0.28, 0.12], [0, 0.42, 0.02], [0, 0.45, -0.18], [0, 0.32, -0.38]], (t) => 0.035 + Math.sin(Math.PI * t) * 0.055, 9, { div: 4, capA: true, capB: true }), '#e23a3a', { rough: 0.9, vc: (v) => (Math.floor((v.z + 0.4) / 0.08) % 2 ? '#f4f0ea' : null) });
      break;
    }
    case 'nagene': {
      const blue = '#2c62d6';
      k.add(new THREE.SphereGeometry(0.27, 24, 10, 0, T, 0, Math.PI / 2), blue, { p: [0, -0.04, 0], s: [1, 0.86, 1.06], rough: 0.75, double: true, fc: (v) => (Math.abs(((Math.atan2(v.x, v.z) + Math.PI) % (T / 6)) - 0.02) < 0.035 ? shade(blue, -0.25) : null), grad: [0.85, 1.06] });
      const vis = new THREE.CylinderGeometry(0.21, 0.21, 0.018, 20, 1, false, -Math.PI / 2, Math.PI);
      k.add(vis, '#1b3d9a', { p: [0, -0.04, 0.2], r: [0.14, 0, 0], s: [1, 1, 0.78], rough: 0.65 });
      k.add(G.sph(0.026, 8, 6), '#1b3d9a', { p: [0, 0.19, 0], s: [1, 0.6, 1], rough: 0.6 });
      k.add(G.rbox(0.09, 0.05, 0.015, 0.008), '#ffffff', { p: [0, 0.07, 0.25], r: [-0.45, 0, 0], rough: 0.6 });
      break;
    }
    case 'jurnieks': { // 1.39.0: Piedzīvojumu takas balva — kapteiņa cepure
      k.add(G.cyl(0.25, 0.235, 0.12, 24), '#1d2e5a', { p: [0, 0.02, 0], rough: 0.7 });
      k.add(G.cyl(0.31, 0.26, 0.09, 24), '#f6f4ee', { p: [0, 0.12, 0.01], s: [1, 1, 1.02], rough: 0.6, grad: [0.9, 1.05] });
      k.add(G.cyl(0.3, 0.31, 0.012, 24), '#e8e4da', { p: [0, 0.17, 0.01], rough: 0.6 });
      const vis = new THREE.CylinderGeometry(0.22, 0.22, 0.016, 20, 1, false, -Math.PI / 2, Math.PI);
      k.add(vis, '#111418', { p: [0, -0.03, 0.17], r: [0.32, 0, 0], s: [1, 1, 0.72], rough: 0.25 });
      k.add(G.torus(0.245, 0.01, 4, 24), '#d8b040', { p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0], rough: 0.3, metal: 1 });
      k.add(G.rbox(0.03, 0.09, 0.012, 0.004), '#d8b040', { p: [0, 0.03, 0.25], r: [-0.1, 0, 0], rough: 0.3, metal: 1 });
      k.add(G.torus(0.028, 0.008, 4, 10, Math.PI), '#d8b040', { p: [0, 0.0, 0.252], r: [0, 0, Math.PI], rough: 0.3, metal: 1 });
      k.add(G.rbox(0.07, 0.012, 0.012, 0.004), '#d8b040', { p: [0, 0.065, 0.252], rough: 0.3, metal: 1 });
      break;
    }
    case 'berete': {
      k.add(G.sph(0.3, 22, 12), '#c01b2e', { p: [0.03, 0.03, 0], r: [0, 0, -0.18], s: [1.1, 0.32, 1.1], rough: 0.95, grad: [0.75, 1.08] });
      k.add(G.torus(0.25, 0.026, 6, 24), '#7d0c1c', { p: [0, -0.035, 0], r: [Math.PI / 2, 0, 0], rough: 0.9 });
      k.add(G.cyl(0.012, 0.018, 0.06, 6), '#c01b2e', { p: [0.0, 0.13, 0], rough: 0.95 });
      break;
    }
    case 'kovbojs': {
      const felt = '#a2703e';
      const brim = G.lathe([[0.5, 0.0], [0.44, 0.012], [0.28, 0.015], [0.27, 0.0], [0.4, -0.01], [0.5, -0.004]], 32);
      const p = brim.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); if (r > 0.27) p.setY(i, p.getY(i) + Math.pow(Math.abs(x) / 0.5, 2.4) * 0.17 * ((r - 0.27) / 0.23) - (z > 0 ? 0.02 : 0) * ((r - 0.27) / 0.23)); }
      brim.computeVertexNormals();
      k.add(brim, felt, { rough: 0.9, double: true });
      const crown = G.lathe([[0.272, 0], [0.262, 0.14], [0.24, 0.26], [0.16, 0.305], [0.06, 0.275], [0, 0.255]], 26);
      const cp = crown.attributes.position;
      for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i); if (y > 0.2) cp.setY(i, y - Math.max(0, 0.06 - Math.abs(x) * 0.25)); void z; }
      crown.computeVertexNormals();
      k.add(crown, felt, { rough: 0.9, grad: [0.85, 1.05] });
      k.add(G.lathe([[0.274, 0.02], [0.27, 0.07]], 26), '#3a2212', { rough: 0.7 });
      k.add(G.star(0.025, 0.011, 0.006, 5, 0.002), '#e9c24a', { p: [0, 0.045, 0.274], rough: 0.25, metal: 1 });
      break;
    }
    case 'pirats': {
      const blk = '#1c1c22';
      k.add(G.lathe([[0.27, 0], [0.262, 0.12], [0.2, 0.22], [0, 0.25]], 22), blk, { rough: 0.8 });
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * T;
        const flap = G.rbox(0.5, 0.22, 0.025, 0.012);
        k.add(flap, blk, { p: [Math.sin(a) * 0.27, 0.09, Math.cos(a) * 0.27], r: [-0.35, a, 0], ro: 'YXZ', rough: 0.8 });
        k.add(G.box(0.5, 0.022, 0.03), '#d8b040', { p: [Math.sin(a) * 0.3, 0.195, Math.cos(a) * 0.3], r: [-0.35, a, 0], ro: 'YXZ', rough: 0.3, metal: 1 });
      }
      k.add(G.sph(0.045, 10, 8), '#f2efe6', { p: [0, 0.12, 0.31], s: [1, 1, 0.45], rough: 0.5 });
      for (const s of [-1, 1]) k.add(G.sph(0.011, 6, 5), '#1c1c22', { p: [s * 0.016, 0.125, 0.33], rough: 0.5 });
      for (const s of [-1, 1]) k.add(G.caps(0.009, 0.08, 2, 5), '#f2efe6', { p: [0, 0.07, 0.315], r: [0, 0, s * 0.8], rough: 0.5 });
      break;
    }
    default: return new THREE.Group();
  }
  return k.build({ name: 'hat-' + id });
}

// =====================================================================
//  Forest animals (NPC) and pets — one SkinnedMesh each.
//  API matches the game: { root, body, legs, animate(dt, moving, speed) }
// =====================================================================
export const NPCS = { stirna: 'Stirna', briedis: 'Ziemeļbriedis', zakis: 'Zaķis', ezis: 'Ezis', starkis: 'Stārķis', mezacuka: 'Mežacūka', vavere: 'Vāvere' };
export const PETS = {
  ezitis: { name: 'Ezītis', type: 'ezis', scale: 0.8 }, zakitis: { name: 'Zaķēns', type: 'zakis', scale: 0.6 },
  vaverite: { name: 'Vāverīte', type: 'vavere', scale: 1 }, sivens: { name: 'Mežacūciņa', type: 'mezacuka', scale: 0.45 },
  stirnens: { name: 'Stirnēns', type: 'stirna', scale: 0.5 },
};
export function buildPet(id) {
  const p = PETS[id] || PETS.ezitis;
  const n = buildNPC(p.type, { baby: true });
  n.root.scale.multiplyScalar(p.scale / (n.baseScale || 1) * (n.baseScale || 1));
  return n;
}

const NEYE = '#120c09';
export function buildNPC(type, { baby = false } = {}) {
  const k = new Kit(type.length * 13 + (baby ? 5 : 0));
  const root = k.root;
  const body = k.group('body', root);
  const legs = [], knees = [];
  const HS = baby ? 1.3 : 1; // baby: bigger head & eyes
  let scale = 1, hop = false, gait = 8;
  const fur = (o = {}) => ({ rough: 0.9, grad: [0.82, 1.06], ...o });
  const eyes = (bone, x, y, z, r, yaw = 0.35) => {
    r *= baby ? 1.25 : 1;
    for (const s of [-1, 1]) {
      const n = new THREE.Vector3(s * Math.sin(yaw), 0.1, Math.cos(yaw)).normalize();
      k.add(G.sph(r, 12, 9), NEYE, { bone, p: [s * x, y, z], q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n), s: [1, 1.12, 0.7], rough: 0.1 });
      k.add(G.sph(r * 0.34, 6, 5), '#ffffff', { bone, p: [s * x + n.x * r * 0.5 - r * 0.25, y + r * 0.4, z + n.z * r * 0.5], emit: 1 });
    }
  };
  // quadruped leg: thigh (on hip bone) + shin/hoof (on knee bone), smooth-skinned
  const leg = (x, y, z, up, low, r, color, hoof, front) => {
    const hip = k.group('hip', body, [x, y, z]);
    const knee = k.group('knee', hip, [0, -up, 0]);
    const skin = (v) => { const w = smooth(-up + 0.05, -up - 0.05, v.y); return [knee, w, hip, 1 - w]; };
    k.add(G.tube([[0, 0.06, 0], [0, -up, front ? 0.01 : -0.02], [0, -up - low, 0.0]], [r, r * 0.62, r * 0.45], 8, { div: 3 }), color, fur({ bone: hip, skin }));
    if (hoof) k.add(G.cyl(r * 0.44, r * 0.52, 0.07, 8), hoof, { bone: knee, p: [0, -low - 0.01, 0.01], rough: 0.5 });
    knee.rotation.x = front ? 0.05 : -0.08;
    legs.push(hip); knees.push({ k: knee, front });
    return hip;
  };
  const trunkZ = (prof, color, y, sy = 1, o = {}) => { const g = G.lathe(prof, 18); g.rotateX(Math.PI / 2); k.add(g, color, fur({ bone: body, p: [0, y, 0], s: [1, sy, 1], ...o })); };
  const ell = (bone, rx, ry, rz, color, x, y, z, o = {}) => k.add(G.sph(1, o.w || 16, o.h || 12), color, fur({ bone, p: [x, y, z], s: [rx, ry, rz], ...o }));

  switch (type) {
    case 'stirna': case 'briedis': {
      const deer = type === 'stirna';
      const c = deer ? '#9a6238' : '#7d6a5a', d = deer ? '#734626' : '#5c4b3f', lt = deer ? '#f3ebe0' : '#e6ded2';
      const H = deer ? 0.78 : 0.95, L = deer ? 0.48 : 0.54, Rr = deer ? 0.21 : 0.26;
      trunkZ([[0, -L], [Rr * 0.6, -L + 0.03], [Rr * 0.95, -L * 0.75], [Rr, -L * 0.4], [Rr * 0.96, 0], [Rr * 1.02, L * 0.42], [Rr * 0.95, L * 0.7], [Rr * 0.7, L * 0.92], [0, L]], c, H + 0.13, 1.15);
      ell(body, Rr * 0.66, Rr * 0.55, L * 0.6, deer ? '#c69a70' : '#a4927f', 0, H + 0.0, 0.02);
      ell(body, 0.12, 0.13, 0.06, lt, 0, H + 0.15, -L + 0.02);
      if (baby && deer) for (let i = 0; i < 12; i++) { const a = (i % 6) / 6 * Math.PI - Math.PI / 2, zz = -0.3 + Math.floor(i / 6) * 0.3 + (i % 2) * 0.1; ell(body, 0.03, 0.02, 0.03, '#f6efe4', Math.sin(a) * Rr * 0.7, H + 0.13 + Math.cos(a) * Rr * 1.1, zz, { w: 6, h: 5 }); }
      const neck = k.group('neck', body, [0, H + 0.22, L * 0.72], [-0.55, 0, 0]);
      k.add(G.tube([[0, -0.05, 0], [0, 0.25, 0.02], [0, 0.5, 0]], [deer ? 0.12 : 0.15, deer ? 0.09 : 0.12, deer ? 0.075 : 0.1], 10, { div: 3 }), deer ? c : lt, fur({ bone: neck }));
      if (!deer) ell(neck, 0.13, 0.2, 0.1, lt, 0, 0.14, 0.09, { r: [0.3, 0, 0] });
      const head = k.group('head', neck, [0, 0.5, 0], [0.95, 0, 0]);
      head.scale.setScalar(1);
      const hs = HS;
      ell(head, 0.095 * hs, 0.1 * hs, 0.12 * hs, c, 0, 0, 0);
      k.add(G.tube([[0, -0.02, 0.06], [0, -0.035, 0.2 * hs]], [0.07 * hs, 0.05 * hs], 10, { div: 2, capB: true }), c, fur({ bone: head }));
      k.add(G.sph(0.034 * hs, 10, 8), '#1d1612', { bone: head, p: [0, -0.03, 0.215 * hs], s: [1.2, 0.85, 0.8], rough: 0.3 });
      eyes(head, 0.068 * hs, 0.03 * hs, 0.065 * hs, 0.022, 0.55);
      for (const s of [-1, 1]) {
        const e = G.sph(1, 10, 8);
        k.add(e, c, fur({ bone: head, p: [s * 0.1 * hs, 0.1 * hs, -0.04], r: [-0.3, 0, -s * (deer ? 0.7 : 1.15)], s: [0.04, 0.09 * hs, 0.022] }));
        k.add(e, '#f0c8b8', { bone: head, p: [s * 0.104 * hs, 0.1 * hs, -0.028], r: [-0.3, 0, -s * (deer ? 0.7 : 1.15)], s: [0.026, 0.065 * hs, 0.012], rough: 0.95 });
      }
      if (!deer && !baby) {
        for (const s of [-1, 1]) {
          const ant = '#dccaa6';
          const base = [s * 0.05, 0.09, -0.06];
          const main = [[0, 0, 0], [s * 0.12, 0.2, -0.12], [s * 0.18, 0.42, -0.1], [s * 0.12, 0.64, 0.02]];
          k.add(G.tube(main.map(([x, y, z]) => [base[0] + x, base[1] + y, base[2] + z]), [0.028, 0.022, 0.017, 0.012], 6, { div: 3, capB: true }), ant, { bone: head, rough: 0.7 });
          const tine = (a, b) => k.add(G.tube([a, b], [0.016, 0.009], 5, { capB: true }), ant, { bone: head, rough: 0.7 });
          tine([base[0] + s * 0.12, base[1] + 0.2, base[2] - 0.12], [base[0] + s * 0.1, base[1] + 0.3, base[2] + 0.05]);
          tine([base[0] + s * 0.17, base[1] + 0.4, base[2] - 0.1], [base[0] + s * 0.28, base[1] + 0.5, base[2] - 0.05]);
          tine([base[0] + s * 0.15, base[1] + 0.52, base[2] - 0.06], [base[0] + s * 0.06, base[1] + 0.62, base[2] + 0.08]);
          if (s > 0) tine([base[0] + s * 0.03, base[1] + 0.06, base[2] - 0.03], [base[0] + s * 0.01, base[1] + 0.12, base[2] + 0.16]);
        }
      }
      for (const s of [-1, 1]) {
        leg(s * Rr * 0.55, H + 0.03, L * 0.62, deer ? 0.38 : 0.45, deer ? 0.4 : 0.48, deer ? 0.065 : 0.08, c, '#2a201a', true);
        leg(s * Rr * 0.55, H + 0.07, -L * 0.62, deer ? 0.42 : 0.5, deer ? 0.38 : 0.46, deer ? 0.08 : 0.095, d, '#2a201a', false);
      }
      k.add(G.cone(0.05, 0.1, 6), lt, { bone: body, p: [0, H + 0.24, -L - 0.02], r: [-2.4, 0, 0], rough: 0.9 });
      gait = deer ? 7 : 6;
      break;
    }
    case 'zakis': {
      hop = true; scale = 0.75;
      const c = '#93806a', lt = '#efe6d8';
      ell(body, 0.2, 0.2, 0.28, c, 0, 0.34, -0.03, { r: [-0.25, 0, 0] });
      ell(body, 0.13, 0.15, 0.12, lt, 0, 0.31, 0.15);
      const head = k.group('head', body, [0, 0.58, 0.22]);
      ell(head, 0.12 * HS, 0.11 * HS, 0.14 * HS, c, 0, 0, 0);
      for (const s of [-1, 1]) ell(head, 0.04, 0.035, 0.035, lt, s * 0.03, -0.045 * HS, 0.115 * HS);
      k.add(G.sph(0.017, 8, 6), '#d9848e', { bone: head, p: [0, -0.02 * HS, 0.14 * HS], s: [1.3, 0.9, 0.8], rough: 0.4 });
      eyes(head, 0.075 * HS, 0.025 * HS, 0.07 * HS, 0.024, 0.6);
      for (const s of [-1, 1]) {
        const e = G.sph(1, 12, 10);
        k.add(e, c, fur({ bone: head, p: [s * 0.05, 0.2 * HS, -0.05], r: [-0.35, 0, -s * 0.2], s: [0.04, 0.18 * (baby ? 1.1 : 1), 0.02] }));
        k.add(e, '#eab2b8', { bone: head, p: [s * 0.05, 0.2 * HS, -0.04], r: [-0.35, 0, -s * 0.2], s: [0.024, 0.14 * (baby ? 1.1 : 1), 0.012], rough: 0.95 });
        k.add(G.sph(0.022, 7, 5), '#2a201a', { bone: head, p: [s * (0.05 + 0.065 * Math.sin(0.2)), 0.2 * HS + 0.16 * (baby ? 1.1 : 1) * Math.cos(0.35), -0.05 - 0.16 * Math.sin(0.35)], s: [1.4, 1, 0.7], rough: 0.9 });
      }
      k.add(G.blob(0.06, 1, 0.15, 2), '#fbfaf6', { bone: body, p: [0, 0.42, -0.3], rough: 0.95 });
      for (const s of [-1, 1]) {
        ell(body, 0.085, 0.13, 0.14, c, s * 0.14, 0.22, -0.12, { r: [0.3, 0, 0] });
        const f = k.group('foot', body, [s * 0.12, 0.1, -0.06]);
        ell(f, 0.045, 0.032, 0.14, c, 0, -0.07, 0.02); legs.push(f);
        const fl = k.group('arm', body, [s * 0.08, 0.24, 0.17]);
        k.add(G.tube([[0, 0, 0], [0, -0.17, 0.02]], [0.035, 0.028], 7, { capB: true }), c, fur({ bone: fl })); legs.push(fl);
      }
      break;
    }
    case 'ezis': {
      scale = 0.75; gait = 12;
      const sp = '#5e4c3c', lt = '#b89a78';
      k.add(G.sph(1, 18, 12), sp, fur({ bone: body, p: [0, 0.19, -0.04], s: [0.27, 0.22, 0.33] }));
      // spines: low-poly cones on the upper dome
      const R = rng(7);
      for (let i = 0; i < 130; i++) {
        const u = R(), v = R(), th = u * Math.PI * 2, ph = Math.acos(1 - v * 1.15);
        const n = new THREE.Vector3(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th));
        if (n.z > 0.75 && n.y < 0.6) continue;
        const p = new THREE.Vector3(n.x * 0.27, 0.19 + n.y * 0.22, -0.04 + n.z * 0.33);
        const d = n.clone().add(new THREE.Vector3(0, 0.25, -0.55)).normalize();
        k.add(G.cone(0.03, 0.12, 4), R() > 0.5 ? '#4a3b2e' : '#6e5a46', { bone: body, p: [p.x + d.x * 0.03, p.y + d.y * 0.03, p.z + d.z * 0.03], q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d), rough: 0.95, flat: true, vc: (vv) => (vv.distanceTo(p) > 0.09 ? '#d8c8b0' : null) });
      }
      ell(body, 0.2, 0.12, 0.26, lt, 0, 0.12, 0.03);
      const head = k.group('head', body, [0, 0.15, 0.26]);
      ell(head, 0.1 * HS, 0.09 * HS, 0.1 * HS, lt, 0, 0, 0);
      k.add(G.cone(0.075 * HS, 0.17, 12), lt, fur({ bone: head, p: [0, -0.02, 0.12], r: [Math.PI / 2, 0, 0] }));
      k.add(G.sph(0.026, 8, 6), '#111', { bone: head, p: [0, -0.02, 0.21], rough: 0.25 });
      eyes(head, 0.05 * HS, 0.035 * HS, 0.06 * HS, 0.019, 0.5);
      for (const s of [-1, 1]) ell(head, 0.028, 0.032, 0.012, '#8a6e52', s * 0.07 * HS, 0.07 * HS, -0.01);
      for (const [x, z] of [[-0.12, 0.14], [0.12, 0.14], [-0.12, -0.14], [0.12, -0.14]]) { const l = k.group('leg', body, [x, 0.08, z]); ell(l, 0.035, 0.05, 0.045, '#8a6e52', 0, -0.04, 0.01); legs.push(l); }
      break;
    }
    case 'mezacuka': {
      const c = '#5a4a3b', d = '#3f342a';
      trunkZ([[0, -0.58], [0.16, -0.55], [0.27, -0.42], [0.3, -0.2], [0.32, 0.05], [0.35, 0.28], [0.32, 0.45], [0.2, 0.56], [0, 0.6]], c, 0.74, 1.08);
      ell(body, 0.3, 0.36, 0.28, d, 0, 0.8, 0.28);
      k.add(G.tube([[0, 1.0, 0.45], [0, 1.08, 0.15], [0, 1.0, -0.2]], [0.05, 0.075, 0.03], 6, { div: 3 }), '#2a221a', fur({ bone: body, flat: true }));
      if (baby) for (let i = 0; i < 5; i++) ell(body, 0.32, 0.025, 0.5, '#a08a6c', 0, 0.7 + i * 0.07, -0.03, { s: [0.335 - i * 0.02, 0.02, 0.5], w: 12, h: 6 });
      const head = k.group('head', body, [0, 0.72, 0.55], [0.35, 0, 0]);
      ell(head, 0.19 * HS, 0.21 * HS, 0.24 * HS, d, 0, 0, 0);
      k.add(G.cyl(0.075, 0.15, 0.32, 12), d, fur({ bone: head, p: [0, -0.03, 0.3], r: [Math.PI / 2, 0, 0] }));
      k.add(G.cyl(0.085, 0.085, 0.04, 14), '#6a5444', { bone: head, p: [0, -0.03, 0.47], r: [Math.PI / 2, 0, 0], rough: 0.5 });
      for (const s of [-1, 1]) k.add(G.sph(0.016, 6, 5), '#1a1410', { bone: head, p: [s * 0.03, -0.03, 0.49], s: [0.8, 1.2, 0.4] });
      eyes(head, 0.11 * HS, 0.07 * HS, 0.15 * HS, 0.024, 0.55);
      for (const s of [-1, 1]) {
        k.add(G.cone(0.065, 0.15, 7), d, fur({ bone: head, p: [s * 0.12 * HS, 0.2 * HS, -0.04], r: [-0.4, 0, -s * 0.4], s: [1, 1, 0.5] }));
        if (!baby) k.add(G.tube([[s * 0.07, -0.05, 0.36], [s * 0.1, 0.02, 0.4], [s * 0.08, 0.07, 0.36]], [0.016, 0.012, 0.006], 5, { div: 2, capB: true }), '#f2ead8', { bone: head, rough: 0.35 });
      }
      for (const s of [-1, 1]) { leg(s * 0.16, 0.6, 0.3, 0.26, 0.3, 0.085, d, '#1a1612', true); leg(s * 0.15, 0.6, -0.36, 0.28, 0.28, 0.095, d, '#1a1612', false); }
      k.add(G.tube([[0, 0.88, -0.56], [0, 0.78, -0.66], [0, 0.66, -0.66]], [0.024, 0.016, 0.01], 5, { div: 2 }), d, fur({ bone: body }));
      gait = 9;
      break;
    }
    case 'vavere': {
      scale = 0.6; hop = true;
      const c = '#b0501f', lt = '#f4e6cd';
      ell(body, 0.14, 0.2, 0.15, c, 0, 0.32, 0, { r: [0.3, 0, 0] });
      ell(body, 0.09, 0.14, 0.06, lt, 0, 0.33, 0.12);
      const head = k.group('head', body, [0, 0.57, 0.1]);
      ell(head, 0.105 * HS, 0.1 * HS, 0.12 * HS, c, 0, 0, 0);
      ell(head, 0.05, 0.045, 0.06, lt, 0, -0.035 * HS, 0.09 * HS);
      k.add(G.sph(0.015, 7, 5), '#2a1a14', { bone: head, p: [0, -0.02 * HS, 0.15 * HS], rough: 0.3 });
      eyes(head, 0.062 * HS, 0.028 * HS, 0.075 * HS, 0.023, 0.55);
      for (const s of [-1, 1]) {
        k.add(G.cone(0.032, 0.1, 6), c, fur({ bone: head, p: [s * 0.062 * HS, 0.115 * HS, -0.02], r: [0, 0, -s * 0.15] }));
        k.add(G.cone(0.014, 0.07, 5), '#5e2410', { bone: head, p: [s * 0.067 * HS, 0.19 * HS, -0.02], r: [0, 0, -s * 0.15], rough: 0.95 });
      }
      const tl = k.group('tail', body, [0, 0.22, -0.12]);
      k.add(G.tube([[0, 0, 0], [0, 0.08, -0.12], [0, 0.3, -0.18], [0, 0.5, -0.1], [0, 0.56, 0.02]], (t) => 0.05 + Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.085, 10, { div: 4, capB: true }), c,
        fur({ bone: tl, vc: (v) => (Math.sin(v.y * 40) > 0.6 ? shade(c, 0.12) : null) }));
      for (const s of [-1, 1]) {
        const f = k.group('foot', body, [s * 0.1, 0.1, -0.02]);
        ell(f, 0.042, 0.034, 0.11, c, 0, -0.05, 0.02); legs.push(f);
        ell(body, 0.065, 0.1, 0.1, c, s * 0.1, 0.2, -0.04, { r: [0.4, 0, 0] });
        k.add(G.tube([[s * 0.06, 0.32, 0.12], [s * 0.04, 0.24, 0.16]], [0.025, 0.02], 6, { capB: true }), c, fur({ bone: body }));
      }
      break;
    }
    case 'starkis': {
      const W = '#f6f4ee', H = 1.0, red = '#e0402a';
      ell(body, 0.2, 0.2, 0.38, W, 0, H + 0.22, 0);
      for (const s of [-1, 1]) {
        ell(body, 0.06, 0.15, 0.4, '#18181a', s * 0.17, H + 0.24, -0.12, { r: [0.15, 0, 0], rough: 0.7 });
        ell(body, 0.065, 0.14, 0.24, W, s * 0.18, H + 0.29, 0.07);
      }
      k.add(G.cone(0.1, 0.25, 8), W, fur({ bone: body, p: [0, H + 0.24, -0.42], r: [-Math.PI / 2 - 0.2, 0, 0], s: [1, 1, 0.4] }));
      const neck = k.group('neck', body, [0, H + 0.3, 0.28], [0.25, 0, 0]);
      k.add(G.tube([[0, -0.05, 0], [0, 0.25, -0.02], [0, 0.52, 0.02]], [0.075, 0.055, 0.045], 9, { div: 3 }), W, fur({ bone: neck }));
      const head = k.group('head', neck, [0, 0.54, 0.02]);
      ell(head, 0.075 * HS, 0.075 * HS, 0.085 * HS, W, 0, 0, 0);
      k.add(G.cone(0.032, 0.36, 8), red, { bone: head, p: [0, -0.04, 0.2], r: [Math.PI / 2 + 0.35, 0, 0], rough: 0.4 });
      eyes(head, 0.05 * HS, 0.02 * HS, 0.045 * HS, 0.015, 0.7);
      for (const s of [-1, 1]) {
        const hip = k.group('hip', body, [s * 0.07, H + 0.06, 0.02]);
        const knee = k.group('knee', hip, [0, -0.5, 0]);
        const skin = (v) => { const w = smooth(-0.46, -0.54, v.y); return [knee, w, hip, 1 - w]; };
        k.add(G.tube([[0, 0.04, 0], [0, -0.5, 0], [0, -1.02, 0.0]], [0.022, 0.017, 0.015], 6, { div: 2 }), red, { bone: hip, skin, rough: 0.5 });
        for (const a of [-0.5, 0, 0.5]) k.add(G.box(0.014, 0.012, 0.11), red, { bone: knee, p: [Math.sin(a) * 0.045, -0.52, Math.cos(a) * 0.045], r: [0, a, 0], rough: 0.5 });
        knee.rotation.x = -0.1;
        legs.push(hip); knees.push({ k: knee, front: false });
      }
      gait = 4;
      break;
    }
  }
  k.build({ name: 'npc-' + type });
  const shadow = blobShadow(type === 'stirna' || type === 'mezacuka' || type === 'briedis' ? 1.6 : 0.9);
  root.add(shadow);
  root.scale.setScalar(scale);
  return {
    root, body, legs, baseScale: scale, mesh: root.userData.mz.meshes[0], phase: Math.random() * 10, idleT: Math.random() * 10,
    animate(dt, moving, speed = 1.2) {
      this.idleT += dt;
      if (moving) {
        this.phase += dt * (hop ? 9 : gait) * Math.min(1.6, speed / 1.2 + 0.4);
        if (hop) {
          const p = Math.sin(this.phase);
          this.body.position.y = Math.max(0, p) * 0.3; this.body.rotation.x = -p * 0.18;
          this.legs.forEach((l, i) => { l.rotation.x = (i % 2 ? 0.5 : -0.4) * p; });
        } else {
          const s = Math.sin(this.phase);
          this.legs.forEach((l, i) => { const ph = (i === 0 || i === 3) ? 0 : Math.PI; l.rotation.x = Math.sin(this.phase + ph) * 0.45; });
          knees.forEach(({ k: kn, front }, i) => { const ph = (i === 0 || i === 3) ? 0 : Math.PI; const c = Math.max(0, Math.cos(this.phase + ph)); kn.rotation.x = front ? c * 0.7 : -c * 0.6; });
          this.body.position.y = Math.abs(s) * 0.025; this.body.rotation.x = 0;
        }
      } else {
        this.body.position.y *= 0.8; this.body.rotation.x *= 0.85;
        this.body.scale.y = 1 + Math.sin(this.idleT * 2.2) * 0.008;
        this.legs.forEach((l) => { l.rotation.x *= 0.85; });
        knees.forEach(({ k: kn, front }) => { kn.rotation.x += ((front ? 0.05 : -0.08) - kn.rotation.x) * 0.15; });
      }
    },
  };
}

// =====================================================================
//  Vehicles — body + wheels in ONE skinned mesh (wheels/steer/crank are
//  bones). Return objects keep the game's fields.
// =====================================================================
export const CAR_S = 1.2;
const PAINT = { rough: 0.32, metal: 0.05 }, CHROME = { rough: 0.18, metal: 1 }, RUBBER = { rough: 0.9 }, DARK = { rough: 0.55 };

/** chunky toy tyre + hub (wheel axis = X) */
function wheel(k, bone, R, w, rimC = '#d6dade', o = {}) {
  const tyre = G.lathe([[R * 0.62, -w / 2], [R * 0.86, -w / 2 - 0.004], [R * 0.98, -w * 0.38], [R, 0], [R * 0.98, w * 0.38], [R * 0.86, w / 2 + 0.004], [R * 0.62, w / 2]], o.seg || 18);
  k.add(tyre, '#1c1c1e', { bone, r: [0, 0, Math.PI / 2], ...RUBBER, vc: (v) => (Math.abs(v.x) < w * 0.3 && Math.hypot(v.y, v.z) > R * 0.97 && (Math.floor(Math.atan2(v.y, v.z) / 0.25) % 2) ? '#2a2a2c' : null) });
  k.add(G.cyl(R * 0.64, R * 0.64, w * 0.82, o.seg || 18), rimC, { bone, r: [0, 0, Math.PI / 2], ...CHROME });
  k.add(G.cyl(R * 0.25, R * 0.3, w * 0.95, 10), o.hub || '#9aa1a8', { bone, r: [0, 0, Math.PI / 2], ...CHROME });
  for (let i = 0; i < (o.spokes ?? 5); i++) k.add(G.box(w * 0.86, R * 0.14, R * 1.14), o.spokeC || rimC, { bone, r: [i / (o.spokes ?? 5) * Math.PI, 0, 0], ...CHROME });
}

export function buildKart(color = '#e02a2a') {
  const k = new Kit(21);
  const g = k.root;
  const pc = { ...PAINT };
  // chassis & pods
  k.add(G.rbox(0.92, 0.05, 1.86, 0.02), '#24262a', { p: [0, 0.2, -0.02], ...DARK });
  for (const sx of [-1, 1]) {
    rod(k, [sx * 0.45, 0.22, 0.9], [sx * 0.5, 0.22, -0.95], 0.025, '#9aa0a6', CHROME);
    k.add(G.caps(0.14, 0.82, 4, 12), color, { p: [sx * 0.62, 0.3, -0.05], r: [Math.PI / 2, 0, 0], s: [0.92, 1, 0.75], ...pc, grad: [0.8, 1.1] });
    k.add(G.caps(0.03, 0.82, 2, 8), '#ffffff', { p: [sx * 0.62, 0.38, -0.05], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.6], ...pc });
  }
  rod(k, [-0.78, 0.3, 0.75], [0.78, 0.3, 0.75], 0.03, '#9aa0a6', CHROME);
  rod(k, [-0.84, 0.32, -0.75], [0.84, 0.32, -0.75], 0.035, '#9aa0a6', CHROME);
  // nose cone
  k.add(G.lathe([[0, -0.5], [0.12, -0.46], [0.22, -0.3], [0.27, 0], [0.28, 0.32], [0, 0.34]], 18), color, { p: [0, 0.36, 0.78], r: [Math.PI / 2 + 0.12, 0, 0], s: [1.7, 1, 0.55], ...pc, grad: [1.1, 0.85] });
  k.add(G.caps(0.085, 1.3, 3, 10), '#1f2023', { p: [0, 0.3, -1.12], r: [0, 0, Math.PI / 2], ...DARK });
  // number plate disc (white with coloured ring)
  k.add(G.cyl(0.16, 0.16, 0.02, 20), '#f6f6f2', { p: [0, 0.52, 1.07], r: [Math.PI / 2 - 0.75, 0, 0], rough: 0.5 });
  k.add(G.torus(0.16, 0.018, 5, 20), color, { p: [0, 0.523, 1.075], r: [-0.75, 0, 0], ...pc });
  // seat
  k.add(new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#202124', { p: [0, 0.5, -0.38], r: [-0.25, 0, 0], s: [0.95, 0.85, 0.9], rough: 0.7, double: true });
  k.add(G.caps(0.2, 0.25, 4, 12), '#2a2b2e', { p: [0, 0.72, -0.65], r: [-0.3, 0, 0], s: [1.25, 1, 0.35], rough: 0.7 });
  // steering
  rod(k, [0, 0.28, 0.75], [0, 0.78, 0.35], 0.022, '#1f2023', DARK);
  k.add(G.torus(0.16, 0.025, 6, 20), '#1f2023', { p: [0, 0.8, 0.33], r: [-0.9, 0, 0], ...DARK });
  k.add(G.cyl(0.05, 0.05, 0.04, 12), color, { p: [0, 0.8, 0.33], r: [Math.PI / 2 - 0.9, 0, 0], ...pc });
  // engine
  k.add(G.rbox(0.26, 0.24, 0.3, 0.03), '#2a2c30', { p: [0.42, 0.45, -0.72], ...DARK });
  for (let i = 0; i < 5; i++) k.add(G.box(0.3, 0.012, 0.32), '#a9b0b6', { p: [0.42, 0.5 + i * 0.03, -0.72], ...CHROME });
  k.add(G.cyl(0.07, 0.07, 0.18, 12), '#a9b0b6', { p: [0.44, 0.69, -0.72], ...CHROME });
  k.add(G.cyl(0.035, 0.045, 0.5, 10), '#c3c9ce', { p: [0.34, 0.41, -1.02], r: [Math.PI / 2, 0, 0], ...CHROME });
  // wheels (bones)
  const wheels = [];
  for (const [x, z, front] of [[-0.8, 0.75, 1], [0.8, 0.75, 1], [-0.84, -0.75, 0], [0.84, -0.75, 0]]) {
    const w = k.group('wheel', g, [x, 0.32, z]);
    wheel(k, w, 0.32, front ? 0.22 : 0.3, '#d0d4d8', { spokes: 5 });
    wheels.push(w);
  }
  const seat = k.marker('seat', g, [0, 0.12, -0.3]);
  const petSpot = k.marker('pet', g, [0, 0.42, -0.95]); petSpot.scale.setScalar(0.55);
  k.build({ name: 'kart' });
  g.add(blobShadow(2.6));
  const mesh = g.userData.mz.meshes[0];
  return {
    root: g, wheels, seat, petSpots: [petSpot], base: mesh,
    /** recolour paint in place (vertices tagged by colour) */
    setColor(c) { recolor(mesh, color, c); color = c; },
  };
}
/** swap one baked colour for another (paint jobs) */
export function recolor(mesh, from, to) {
  const a = C(from), b = C(to), col = mesh.geometry.attributes.color;
  for (let i = 0; i < col.count; i++) {
    const r = col.getX(i), gg = col.getY(i), bb = col.getZ(i), kk = r / Math.max(1e-5, a.r);
    if (Math.abs(gg - a.g * kk) < 0.004 && Math.abs(bb - a.b * kk) < 0.004 && kk > 0.5 && kk < 1.5) col.setXYZ(i, b.r * kk, b.g * kk, b.b * kk);
  }
  col.needsUpdate = true;
}

export function buildCar(color = '#3a7d44') {
  const k = new Kit(22), S = CAR_S;
  const root = k.root, body = k.group('body', root);
  const sh = k.group('shell', body); sh.scale.setScalar(S);
  const B = { bone: sh };
  const glass = '#9fc8e0';
  // body tub with soft edges
  k.add(G.rbox(1.62, 0.52, 3.1, 0.12, 2), color, { ...B, p: [0, 0.8, 0], ...PAINT, grad: [0.75, 1.08] });
  k.add(G.rbox(1.5, 0.3, 1.02, 0.12, 2), color, { ...B, p: [0, 1.17, 1.0], ...PAINT });
  k.add(G.rbox(1.7, 0.1, 3.18, 0.04), '#26282c', { ...B, p: [0, 0.52, 0], ...DARK });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const arch = new THREE.CylinderGeometry(0.56, 0.56, 0.36, 16, 1, true, -Math.PI / 2, Math.PI);
    k.add(arch, color, { ...B, p: [sx * 0.84, 0.48, sz * 1.05], r: [0, 0, Math.PI / 2], s: [1, 1, 1], ...PAINT, double: true });
  }
  k.add(G.rbox(1.24, 0.42, 0.06, 0.03), '#1d1e21', { ...B, p: [0, 0.98, 1.56], ...DARK });
  for (let i = -3; i <= 3; i++) k.add(G.box(0.04, 0.36, 0.05), '#c9cfd4', { ...B, p: [i * 0.15, 0.98, 1.59], ...CHROME });
  for (const sx of [-1, 1]) {
    k.add(G.cyl(0.12, 0.12, 0.08, 16), '#fff6d8', { ...B, p: [sx * 0.6, 1.08, 1.58], r: [Math.PI / 2, 0, 0], rough: 0.2, emit: 0.6 });
    k.add(G.torus(0.125, 0.022, 5, 16), '#d5dade', { ...B, p: [sx * 0.6, 1.08, 1.625], ...CHROME });
    k.add(G.rbox(0.14, 0.14, 0.05, 0.02), '#e8352a', { ...B, p: [sx * 0.68, 0.92, -1.57], rough: 0.25, emit: 0.45 });
  }
  k.add(G.rbox(1.86, 0.15, 0.17, 0.06), '#2a2c30', { ...B, p: [0, 0.64, 1.67], ...DARK });
  k.add(G.rbox(1.86, 0.15, 0.17, 0.06), '#2a2c30', { ...B, p: [0, 0.64, -1.65], ...DARK });
  // windscreen
  const wy = 1.38, wz = 0.4;
  k.add(G.box(1.42, 0.48, 0.025), glass, { ...B, p: [0, wy, wz], r: [-0.28, 0, 0], rough: 0.05, metal: 0.3, ch: 'glass' });
  k.add(G.rbox(1.56, 0.06, 0.07, 0.025), '#2a2c30', { ...B, p: [0, wy + 0.26, wz - 0.07], r: [-0.28, 0, 0], ...DARK });
  for (const sx of [-1, 1]) k.add(G.rbox(0.06, 0.56, 0.07, 0.025), '#2a2c30', { ...B, p: [sx * 0.75, wy, wz], r: [-0.28, 0, 0], ...DARK });
  // seats & wheel
  const seatC = '#c9a27a';
  for (const sx of [-1, 1]) {
    k.add(G.rbox(0.56, 0.16, 0.55, 0.07), seatC, { ...B, p: [sx * 0.38, 1.1, -0.25], rough: 0.8 });
    k.add(G.rbox(0.56, 0.6, 0.14, 0.07), seatC, { ...B, p: [sx * 0.38, 1.42, -0.58], r: [-0.15, 0, 0], rough: 0.8 });
  }
  rod(k, [-0.38, 1.07, 0.5], [-0.38, 1.4, 0.18], 0.025, '#2a2c30', { ...B, ...DARK });
  k.add(G.torus(0.17, 0.028, 6, 20), '#2a2c30', { ...B, p: [-0.38, 1.43, 0.15], r: [-1.0 + Math.PI / 2, 0, 0], ...DARK });
  k.add(G.rbox(1.44, 0.16, 0.55, 0.07), seatC, { ...B, p: [0, 1.1, -1.15], rough: 0.8 });
  k.add(G.rbox(1.44, 0.5, 0.12, 0.06), seatC, { ...B, p: [0, 1.38, -1.47], r: [-0.12, 0, 0], rough: 0.8 });
  // roll bar
  const RB = (a, b, r = 0.04) => rod(k, a, b, r, '#2a2c30', { ...B, ...DARK });
  RB([-0.76, 1.06, -0.82], [-0.76, 1.86, -0.82]); RB([0.76, 1.06, -0.82], [0.76, 1.86, -0.82]);
  k.add(G.torus(0.76, 0.04, 6, 14, Math.PI), '#2a2c30', { ...B, p: [0, 1.86, -0.82], s: [1, 0.12, 1], ...DARK });
  RB([-0.76, 1.86, -0.82], [-0.76, 1.08, -1.52], 0.035); RB([0.76, 1.86, -0.82], [0.76, 1.08, -1.52], 0.035);
  // spare wheel (static)
  const sp = k.group('spare', sh, [0, 1.05, -1.8], [0, Math.PI / 2, 0]);
  wheel(k, sp, 0.38, 0.26, color, { spokes: 4, spokeC: '#2a2c30' });
  // wheels (bones), front ones steer
  const wheels = [], steer = [];
  for (const [x, z] of [[-0.88, 1.05], [0.88, 1.05], [-0.88, -1.05], [0.88, -1.05]]) {
    const st = k.group('steer', sh, [x, 0.42, z]);
    const w = k.group('wheel', st);
    wheel(k, w, 0.42, 0.32, '#e8e2d2', { spokes: 4, spokeC: '#2a2c30', hub: color });
    wheels.push(w); if (z > 0) steer.push(st);
  }
  const at = (x, y, z) => k.marker('spot', body, [x * S, y * S, z * S]);
  const lift = 1.17 * S - 1.05;
  const seats = [[-0.38, -0.25], [0.38, -0.25], [-0.38, -1.15], [0.38, -1.15]].map(([x, z]) => { const g = at(x, 0, z); g.position.y = 0.86 + lift; return g; });
  const petSpots = [at(0, 1.17, -1.12), at(0, 1.07, -0.3), at(-0.35, 1.34, 1.05), at(0.35, 1.34, 1.05)];
  k.build({ name: 'car' });
  root.add(blobShadow(4.6));
  return { kind: 'car', root, body, wheels, steer, seat: seats[0], seats, petSpots, wheelR: 0.42 * S };
}

export function buildSled(color = '#d8262a') {
  const k = new Kit(23);
  const root = k.root, body = k.group('body', root);
  const B = { bone: body };
  k.add(G.caps(0.36, 0.8, 4, 14), color, { ...B, p: [0, 0.62, 0.72], r: [Math.PI / 2 - 0.25, 0, 0], s: [1.15, 1, 0.75], ...PAINT, grad: [0.8, 1.1] });
  k.add(G.rbox(0.92, 0.3, 1.0, 0.1), color, { ...B, p: [0, 0.74, 0.45], ...PAINT });
  k.add(G.rbox(0.98, 0.28, 1.7, 0.1), color, { ...B, p: [0, 0.56, -0.45], ...PAINT, grad: [0.8, 1.05] });
  k.add(G.rbox(0.98, 0.06, 1.7, 0.03), '#ffffff', { ...B, p: [0, 0.58, -0.45], s: [1.01, 1, 1.002], ...PAINT });
  k.add(G.rbox(0.58, 0.2, 1.15, 0.09), '#2b2c30', { ...B, p: [0, 0.84, -0.55], rough: 0.75 });
  k.add(G.box(0.8, 0.42, 0.03), '#9fc8e0', { ...B, p: [0, 1.06, 0.2], r: [-0.55, 0, 0], rough: 0.05, ch: 'glass' });
  k.add(G.cyl(0.1, 0.1, 0.06, 14), '#fff6d8', { ...B, p: [0, 0.8, 1.16], r: [Math.PI / 2 - 0.3, 0, 0], rough: 0.2, emit: 0.7 });
  k.add(G.rbox(0.5, 0.08, 0.04, 0.02), '#e8352a', { ...B, p: [0, 0.62, -1.31], emit: 0.4 });
  rod(k, [0, 0.86, 0.2], [0, 1.02, 0.05], 0.03, '#2a2c30', { ...B, ...DARK });
  rod(k, [-0.36, 1.04, 0.02], [0.36, 1.04, 0.02], 0.022, '#c9cfd4', { ...B, ...CHROME });
  for (const sx of [-1, 1]) k.add(G.cyl(0.032, 0.032, 0.13, 8), '#2a2c30', { ...B, p: [sx * 0.4, 1.04, 0.02], r: [0, 0, Math.PI / 2], ...DARK });
  // track + rollers
  k.add(G.rbox(0.6, 0.3, 1.5, 0.13), '#1d1d1f', { ...B, p: [0, 0.2, -0.7], ...RUBBER, vc: (v) => (Math.floor((v.z + 2) / 0.09) % 2 ? '#2b2b2e' : null) });
  for (let i = 0; i < 4; i++) k.add(G.cyl(0.11, 0.11, 0.64, 10), '#43464c', { ...B, p: [0, 0.17, -1.35 + i * 0.42], r: [0, 0, Math.PI / 2], ...DARK });
  // skis
  for (const sx of [-1, 1]) {
    k.add(G.rbox(0.16, 0.05, 1.15, 0.02), '#2a2c30', { ...B, p: [sx * 0.46, 0.05, 0.7], ...DARK });
    k.add(G.rbox(0.16, 0.05, 0.32, 0.02), '#2a2c30', { ...B, p: [sx * 0.46, 0.12, 1.36], r: [-0.6, 0, 0], ...DARK });
    rod(k, [sx * 0.46, 0.08, 0.75], [sx * 0.3, 0.55, 0.65], 0.03, '#c9cfd4', { ...B, ...CHROME });
  }
  const seats = [-0.45, -1.0].map((z, i) => k.marker('seat', body, [0, 0.8 + i * 0.03, z]));
  const pet = k.marker('pet', body, [0, 0.86, -1.32]);
  k.build({ name: 'sled' });
  root.add(blobShadow(2.8));
  return { kind: 'sled', root, body, wheels: [], steer: [], seat: seats[0], seats, petSpots: [pet], wheelR: 1 };
}

export function buildBike(color = '#d23b3b') {
  const k = new Kit(24);
  const root = k.root, body = k.group('body', root);
  const R = 0.34, wz = 0.56, B = { bone: body };
  const T = (a, b, r, c = color, o = {}) => rod(k, a, b, r, c, { ...B, ...PAINT, seg: 8, ...o });
  const bb = [0, 0.4, -0.04], st = [0, 0.8, -0.2], ht = [0, 0.86, 0.36], htL = [0, 0.66, 0.42];
  T(bb, st, 0.026); T(st, ht, 0.023); T(bb, htL, 0.027); T([0.04, 0.4, -0.04], [0.04, R, -wz], 0.016); T([-0.04, 0.4, -0.04], [-0.04, R, -wz], 0.016);
  T([0.035, 0.8, -0.2], [0.035, R, -wz], 0.015); T([-0.035, 0.8, -0.2], [-0.035, R, -wz], 0.015); T(htL, ht, 0.03);
  T(st, [0, 0.84, -0.21], 0.017, '#c9cfd4', CHROME);
  k.add(G.caps(0.065, 0.16, 3, 10), '#2a2b2e', { ...B, p: [0, 0.865, -0.2], r: [Math.PI / 2, 0, 0], s: [1.15, 1, 0.5], rough: 0.7 });
  // rear wheel + mudguard
  const spokeWheel = (bone) => {
    k.add(G.torus(R - 0.028, 0.03, 6, 26), '#1c1c1e', { bone, r: [0, Math.PI / 2, 0], ...RUBBER });
    k.add(G.torus(R - 0.058, 0.01, 4, 26), '#c9cfd4', { bone, r: [0, Math.PI / 2, 0], ...CHROME });
    for (let i = 0; i < 8; i++) k.add(G.cyl(0.0035, 0.0035, 2 * (R - 0.06), 3), '#d8dde1', { bone, r: [i / 8 * Math.PI, 0, 0], ...CHROME });
    k.add(G.cyl(0.026, 0.026, 0.08, 8), '#2a2c30', { bone, r: [0, 0, Math.PI / 2], ...DARK });
  };
  const wheels = [];
  const rw = k.group('wheel', body, [0, R, -wz]); spokeWheel(rw); wheels.push(rw);
  k.add(G.torus(R + 0.02, 0.022, 4, 12, Math.PI * 0.6), color, { ...B, p: [0, R, -wz], r: [0, Math.PI / 2, Math.PI * 0.35], s: [1, 1, 1.8], ...PAINT });
  // steering assembly
  const steer = k.group('steer', body, [0, 0, 0.42]);
  const S = { bone: steer };
  rod(k, [0, R, 0.14], [0, 0.7, -0.02], 0.016, '#c9cfd4', { ...S, ...CHROME });
  rod(k, [0, 0.7, -0.02], [0, 1.02, -0.08], 0.018, '#2a2c30', { ...S, ...DARK });
  k.add(G.tube([[-0.27, 1.06, -0.16], [-0.18, 1.03, -0.1], [0, 1.02, -0.08], [0.18, 1.03, -0.1], [0.27, 1.06, -0.16]], 0.014, 6, { div: 3 }), '#2a2c30', { ...S, ...DARK });
  for (const s of [-1, 1]) k.add(G.caps(0.022, 0.08, 2, 8), s < 0 ? '#ffffff' : '#ffffff', { ...S, p: [s * 0.29, 1.07, -0.17], r: [0, 0, Math.PI / 2], rough: 0.8 });
  const fw = k.group('wheel', steer, [0, R, 0.14]); spokeWheel(fw); wheels.push(fw);
  k.add(G.torus(R + 0.02, 0.022, 4, 12, Math.PI * 0.55), color, { ...S, p: [0, R, 0.14], r: [0, Math.PI / 2, -Math.PI * 0.15], s: [1, 1, 1.8], ...PAINT });
  const basket = k.marker('basket', steer, [0, 0.9, 0.12]);
  const wick = '#c49a58', wd = (v) => (Math.floor((v.x + v.y * 2 + 1) / 0.04) % 2 ? '#a77f40' : null);
  k.add(G.rbox(0.34, 0.02, 0.26, 0.008), wick, { ...S, p: [0, 0.9, 0.12], rough: 0.95 });
  for (const [x, z, w, d] of [[0, 0.13, 0.34, 0.016], [0, -0.13, 0.34, 0.016], [0.17, 0, 0.016, 0.26], [-0.17, 0, 0.016, 0.26]]) k.add(G.box(w, 0.2, d), wick, { ...S, p: [x, 1.0, 0.12 + z], rough: 0.95, fc: wd });
  k.add(G.torus(0.17, 0.012, 4, 16), '#a77f40', { ...S, p: [0, 1.1, 0.12], r: [Math.PI / 2, 0, 0], s: [1, 0.78, 1], rough: 0.95 });
  k.add(G.cyl(0.05, 0.05, 0.03, 10), '#fff6d8', { ...S, p: [0, 0.78, 0.2], r: [Math.PI / 2, 0, 0], rough: 0.2, emit: 0.7 });
  // crank (bone) + chain
  const CR = 0.13;
  const crank = k.group('crank', body, [0, 0.4, -0.04]);
  k.add(G.cyl(0.08, 0.08, 0.02, 16), '#c9cfd4', { bone: crank, p: [0.05, 0, 0], r: [0, 0, Math.PI / 2], ...CHROME });
  for (const s of [-1, 1]) { k.add(G.box(0.02, CR + 0.03, 0.03), '#c9cfd4', { bone: crank, p: [s * 0.07, s * CR / 2, 0], ...CHROME }); k.add(G.rbox(0.1, 0.022, 0.06, 0.008), '#2a2c30', { bone: crank, p: [s * 0.12, s * CR, 0], ...DARK }); }
  rod(k, [0.05, 0.4, -0.04], [0.05, R, -wz], 0.006, '#2a2c30', { ...B, ...DARK });
  const seat = k.marker('seat', body, [0, 0.32, -0.16]);
  const pet = k.marker('pet', steer, [0, 0.93, 0.12]); pet.scale.setScalar(0.6);
  k.build({ name: 'bike' });
  const sh = blobShadow(1.7); sh.scale.set(0.45 * 1.7, 1, 1.7); root.add(sh);
  const pedal = { cy: 0.4 - 0.32, cz: -0.04 + 0.16, r: CR };
  return { kind: 'bike', root, body, wheels, steer: [steer], seat, seats: [seat], petSpots: [pet], wheelR: R, crank, pedal };
}

export function buildBus() {
  const k = new Kit(25);
  const root = k.root, body = k.group('body', root);
  const B = { bone: body };
  const blue = '#2a6fd8', white = '#f4f4f0', glass = '#1d2a3a';
  const L = 10.2, W = 2.9, H0 = 0.55, H1 = 2.95;
  // main shell
  k.add(G.rbox(W, H1 - H0, L, 0.28, 2), white, { ...B, p: [0, (H0 + H1) / 2, 0], ...PAINT, vc: (v) => (v.y < 1.25 ? blue : v.y > 2.85 ? '#e9e9e4' : null) });
  k.add(G.rbox(W - 0.4, 0.18, L - 1.4, 0.08), '#e1e2de', { ...B, p: [0, H1 + 0.08, -0.3], rough: 0.6 });
  // window band (dark glass, opaque — reads well & costs nothing)
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) { const z = -L / 2 + 1.0 + i * 1.42; if (sx > 0 && i === 5) continue; k.add(G.rbox(0.06, 0.92, 1.24, 0.03), glass, { ...B, p: [sx * W / 2, 2.05, z], rough: 0.08, metal: 0.4 }); }
  }
  k.add(G.rbox(W - 0.3, 1.2, 0.06, 0.06), glass, { ...B, p: [0, 1.95, L / 2], r: [0.04, 0, 0], rough: 0.06, metal: 0.4 });
  k.add(G.rbox(W - 0.6, 0.8, 0.06, 0.05), glass, { ...B, p: [0, 2.1, -L / 2], rough: 0.08, metal: 0.4 });
  // destination board is a label mesh (added after build)
  for (const sx of [-1, 1]) {
    k.add(G.cyl(0.17, 0.17, 0.06, 16), '#fff6d8', { ...B, p: [sx * 1.05, 0.95, L / 2 + 0.02], r: [Math.PI / 2, 0, 0], rough: 0.2, emit: 0.7 });
    k.add(G.rbox(0.26, 0.36, 0.06, 0.03), '#e8352a', { ...B, p: [sx * 1.15, 1.05, -L / 2 - 0.02], emit: 0.4 });
    k.add(G.rbox(0.1, 0.3, 0.3, 0.04), '#202226', { ...B, p: [sx * (W / 2 + 0.1), 2.3, L / 2 - 0.3], ...DARK });
  }
  k.add(G.rbox(W + 0.06, 0.24, 0.24, 0.1), '#2a2c30', { ...B, p: [0, 0.62, L / 2 + 0.02], ...DARK });
  k.add(G.rbox(W + 0.06, 0.24, 0.24, 0.1), '#2a2c30', { ...B, p: [0, 0.62, -L / 2 - 0.02], ...DARK });
  k.add(G.rbox(0.7, 0.16, 0.04, 0.02), '#f6f6f2', { ...B, p: [0, 0.62, L / 2 + 0.15], rough: 0.5 });
  // interior floor + seats (visible through door)
  k.add(G.box(W - 0.2, 0.06, L - 0.4), '#5a5e66', { ...B, p: [0, 0.62, 0], rough: 0.9 });
  const seats = [], petSpots = [];
  for (let r = 0; r < 4; r++) for (const sx of [-1, 1]) {
    const z = -L / 2 + 1.5 + r * 1.55;
    k.add(G.rbox(0.9, 0.14, 0.6, 0.06), '#d8433a', { ...B, p: [sx * 0.8, 1.05, z], rough: 0.8 });
    k.add(G.rbox(0.9, 0.6, 0.12, 0.06), '#d8433a', { ...B, p: [sx * 0.8, 1.42, z - 0.3], rough: 0.8 });
    const s = k.marker('seat', body, [sx * 0.8, 0.7, z]); seats.push(s);
  }
  for (let i = 0; i < 3; i++) petSpots.push(k.marker('pet', body, [0, 0.66, -L / 2 + 1.8 + i * 1.6]));
  // doors (bones that slide), right side
  const DZ = [L / 2 - 1.3, -0.4];
  const doors = DZ.map((z) => {
    const d = k.group('door', body, [W / 2 + 0.01, 0, z]);
    for (const s of [-1, 1]) {
      k.add(G.rbox(0.06, 2.0, 0.58, 0.03), blue, { bone: d, p: [0, 1.6, s * 0.3], ...PAINT });
      k.add(G.rbox(0.07, 1.25, 0.42, 0.03), glass, { bone: d, p: [0, 1.85, s * 0.3], rough: 0.08, metal: 0.4 });
    }
    return d;
  });
  // driver (a tiny friendly bear, part of the same mesh)
  const driver = k.marker('driver', body, [-0.8, 1.15, L / 2 - 1.15]);
  k.add(G.sph(0.24, 12, 9), '#8b5a2b', { ...B, p: [-0.8, 2.0, L / 2 - 1.15], rough: 0.85 });
  k.add(G.sph(0.08, 8, 6), '#8b5a2b', { ...B, p: [-0.98, 2.2, L / 2 - 1.18], rough: 0.85 });
  k.add(G.sph(0.08, 8, 6), '#8b5a2b', { ...B, p: [-0.62, 2.2, L / 2 - 1.18], rough: 0.85 });
  k.add(G.sph(0.1, 8, 6), '#c9a07a', { ...B, p: [-0.8, 1.94, L / 2 - 0.95], s: [1.1, 0.8, 0.8], rough: 0.85 });
  k.add(G.caps(0.18, 0.25, 3, 10), '#2a6fd8', { ...B, p: [-0.8, 1.6, L / 2 - 1.18], rough: 0.85 });
  k.add(G.cyl(0.26, 0.26, 0.08, 14), '#1d3f8a', { ...B, p: [-0.8, 2.2, L / 2 - 1.15], rough: 0.6 });
  k.add(G.torus(0.22, 0.03, 5, 16), '#2a2c30', { ...B, p: [-0.8, 1.55, L / 2 - 0.75], r: [-0.6, 0, 0], ...DARK });
  // wheels
  const wheels = [];
  for (const [x, z] of [[-1.3, 3.4], [1.3, 3.4], [-1.3, -3.2], [1.3, -3.2]]) {
    const w = k.group('wheel', body, [x, 0.55, z]);
    wheel(k, w, 0.55, 0.42, '#e3e5e8', { spokes: 6, spokeC: '#9aa1a8', seg: 20 });
    wheels.push(w);
  }
  k.build({ name: 'bus' });
  const label = labelMesh('1 · Ziema · Sēta · Trase · Tirgus', 2.3, 0.28, { bg: '#111316', fg: '#ffb21a' }, false);
  label.position.set(0, 2.72, L / 2 + 0.035); body.add(label);
  root.add(blobShadow(11)); root.children[root.children.length - 1].scale.set(3.6, 1, 11);
  return { root, body, seats, petSpots, wheels, doors, doorZ: DZ, driver };
}

// =====================================================================
//  Market: carts, stalls, bunting. Planks are vertex-coloured boards
//  (no textures); names are a single label quad.
// =====================================================================
export const VENDORS = {
  seeds: { id: 'seeds', title: '🌱 Sēklas', cart: '#4caf50' },
  buyer: { id: 'buyer', title: '🧺 Uzpērku', cart: '#3d8fe0' },
  hats: { id: 'hats', title: '🎩 Drēbes', cart: '#d94fc0' },
  pets: { id: 'pets', title: '🐾 Mājdzīvnieki', cart: '#f2a33a' },
  decor: { id: 'decor', title: '🏡 Dārzam', cart: '#3ab8a8' },
};
const WOOD = '#b9844e', WOOD_D = '#7a5232', WOOD_L = '#d9aa70';
/** board with plank grooves along X (vertex colour per face) */
function planks(k, w, h, d, color, o = {}, n = Math.max(2, Math.round(h / 0.16))) {
  const geo = new THREE.BoxGeometry(w, h, d, 1, n * 2, 1);
  k.add(geo, color, { rough: 0.9, ...o, fc: (c) => { const t = (c.y + h / 2) / h * n; const f = t - Math.floor(t); return f > 0.9 ? shade(color, -0.35) : (Math.floor(t) % 2 ? shade(color, -0.07) : null); } });
}
/** a small goods pile used on carts and stall counters */
function goods(k, kind, y, z, W, o = {}) {
  const R = rng(9);
  if (kind === 'veg') {
    const items = [['#e8452a', 0.075], ['#f28a1e', 0.07], ['#7bbf3a', 0.08], ['#8a3a8a', 0.07], ['#f2c12e', 0.07]];
    for (let i = 0; i < 5; i++) {
      const x = -W / 2 + 0.3 + i * (W - 0.6) / 4;
      k.add(G.rbox(0.5, 0.14, 0.4, 0.03), WOOD_L, { p: [x, y + 0.07, z], rough: 0.9, ...o });
      const [c, r] = items[i];
      for (let j = 0; j < 5; j++) k.add(G.sph(r, 8, 6), c, { p: [x + (R() - 0.5) * 0.3, y + 0.17 + (j > 2 ? 0.08 : 0), z + (R() - 0.5) * 0.22], rough: 0.4, jit: 0.15, ...o });
    }
  } else if (kind === 'seeds') {
    const cols = ['#e8452a', '#f2c12e', '#5aa83a', '#3d8fe0', '#c04ad2', '#f28a1e'];
    for (let i = 0; i < 12; i++) {
      const x = -W / 2 + 0.25 + (i % 6) * (W - 0.5) / 5, zz = z + (i < 6 ? -0.12 : 0.14);
      k.add(G.rbox(0.18, 0.24, 0.03, 0.012), '#f6ecd6', { p: [x, y + 0.13, zz], r: [-0.25, 0, 0], rough: 0.8, ...o });
      k.add(G.sph(0.045, 8, 6), cols[i % 6], { p: [x, y + 0.15, zz + 0.02], s: [1, 1, 0.3], r: [-0.25, 0, 0], rough: 0.6, ...o });
    }
  } else if (kind === 'hats') {
    const hatC = ['#f0d48c', '#16161a', '#c01b2e', '#2c62d6', '#a2703e'];
    for (let i = 0; i < 5; i++) {
      const x = -W / 2 + 0.35 + i * (W - 0.7) / 4, c = hatC[i];
      k.add(G.cyl(0.18, 0.18, 0.02, 14), c, { p: [x, y + 0.02, z], rough: 0.8, ...o });
      k.add(G.lathe([[0.11, 0], [0.105, 0.1], [0.07, 0.14], [0, 0.145]], 12), c, { p: [x, y + 0.03, z], rough: 0.8, ...o });
    }
  } else if (kind === 'ice') {
    const cols = ['#ffd1e0', '#fff1c8', '#c8f0d8', '#d8c8f8', '#8a5a3a'];
    for (let i = 0; i < 5; i++) {
      const x = -W / 2 + 0.35 + i * (W - 0.7) / 4;
      k.add(G.cone(0.06, 0.16, 8), '#e2b06a', { p: [x, y + 0.08, z], r: [Math.PI, 0, 0], rough: 0.8, ...o, fc: (c) => (Math.floor((c.y + c.x * 3) * 40) % 2 ? '#c9934e' : null) });
      k.add(G.sph(0.07, 10, 8), cols[i], { p: [x, y + 0.2, z], rough: 0.5, ...o });
      k.add(G.sph(0.018, 6, 4), '#d8263a', { p: [x, y + 0.28, z], rough: 0.3, ...o });
    }
  }
}

export function buildCart(color = '#3c9a4a', iceCream = false, goodsKind = 'veg', goodsOnly = false) {
  const k = new Kit(31);
  const W = 2.4, D = 1.1, Y = 1.0;
  if (!goodsOnly) {
    k.groundAO = 0.25;
    planks(k, W, 0.5, D, iceCream ? '#f6efe2' : WOOD, { p: [0, Y + 0.25, 0] }, 3);
    k.add(G.rbox(W + 0.12, 0.08, D + 0.12, 0.03), WOOD_D, { p: [0, Y + 0.52, 0], rough: 0.85 });
    k.add(G.rbox(W, 0.06, D, 0.02), WOOD_D, { p: [0, Y, 0], rough: 0.9 });
    if (iceCream) k.add(G.box(W + 0.01, 0.18, D + 0.01), color, { p: [0, Y + 0.2, 0], rough: 0.5 });
    // wheels (big, spoked)
    for (const s of [-1, 1]) {
      k.add(G.torus(0.55, 0.05, 6, 22), '#5a3a22', { p: [W * 0.18, 0.58, s * (D / 2 + 0.1)], rough: 0.85 });
      for (let i = 0; i < 6; i++) k.add(G.cyl(0.025, 0.025, 1.08, 5), '#7a5232', { p: [W * 0.18, 0.58, s * (D / 2 + 0.1)], r: [0, 0, i / 6 * Math.PI], rough: 0.85 });
      k.add(G.cyl(0.08, 0.08, 0.12, 10), '#3a2414', { p: [W * 0.18, 0.58, s * (D / 2 + 0.1)], r: [Math.PI / 2, 0, 0], rough: 0.85 });
    }
    rod(k, [W * 0.18, 0.58, -D / 2 - 0.1], [W * 0.18, 0.58, D / 2 + 0.1], 0.03, '#3a2414');
    // legs & handles
    k.add(G.cyl(0.04, 0.05, Y, 8), WOOD_D, { p: [-W / 2 + 0.15, Y / 2, 0], rough: 0.9 });
    for (const s of [-1, 1]) rod(k, [-W / 2 + 0.1, Y + 0.3, s * 0.35], [-W / 2 - 0.85, Y + 0.05, s * 0.4], 0.035, WOOD_D, { rough: 0.9 });
    rod(k, [-W / 2 - 0.85, Y + 0.05, -0.42], [-W / 2 - 0.85, Y + 0.05, 0.42], 0.04, WOOD_D, { rough: 0.9 });
    // canopy: scalloped striped awning on 4 poles
    for (const [x, z] of [[-W / 2 + 0.08, -D / 2 + 0.08], [W / 2 - 0.08, -D / 2 + 0.08], [-W / 2 + 0.08, D / 2 - 0.08], [W / 2 - 0.08, D / 2 - 0.08]]) k.add(G.cyl(0.025, 0.025, 1.4, 6), '#e8e2d2', { p: [x, Y + 1.25, z], rough: 0.6 });
    const roof = new THREE.BoxGeometry(W + 0.3, 0.06, D + 0.4, 12, 1, 1);
    k.add(roof, color, { p: [0, Y + 1.98, 0], rough: 0.85, fc: (c) => (Math.floor((c.x + 5) / ((W + 0.3) / 12)) % 2 ? '#f7f2e6' : null) });
    for (let i = 0; i < 12; i++) for (const s of [-1, 1]) {
      const x = -(W + 0.3) / 2 + (i + 0.5) * (W + 0.3) / 12;
      k.add(G.sph(0.1, 8, 5, 0), i % 2 ? '#f7f2e6' : color, { p: [x, Y + 1.94, s * (D / 2 + 0.2)], s: [1, 0.9, 0.18], rough: 0.85 });
    }
    k.add(G.sph(0.09, 10, 8), color, { p: [0, Y + 2.08, 0], rough: 0.5 });
  }
  goods(k, iceCream ? 'ice' : goodsKind, Y + 0.56, 0, W);
  return k.build({ name: 'cart' });
}

export function buildStall(v) {
  const k = new Kit(32 + v.id.length);
  k.groundAO = 0.35;
  const W = 3.6, HW = W / 2;
  k.add(G.rbox(W + 0.4, 0.14, 2.6, 0.04), WOOD_D, { p: [0, 0.07, -0.45], rough: 0.9, fc: (c) => (Math.floor((c.x + 3) / 0.3) % 2 ? shade(WOOD_D, -0.1) : null) });
  planks(k, W, 0.74, 0.09, WOOD, { p: [0, 0.48, 0.55] }, 4);
  for (const s of [-1, 1]) planks(k, 0.09, 0.74, 0.75, WOOD, { p: [s * (HW - 0.045), 0.48, 0.2] }, 4);
  k.add(G.rbox(W + 0.16, 0.08, 0.95, 0.03), WOOD_L, { p: [0, 0.88, 0.25], rough: 0.8 });
  for (const s of [-1, 1]) {
    k.add(G.rbox(0.15, 2.8, 0.15, 0.03), '#8a5e38', { p: [s * (HW - 0.05), 1.4, 0.62], rough: 0.85 });
    k.add(G.rbox(0.15, 3.12, 0.15, 0.03), '#8a5e38', { p: [s * (HW - 0.05), 1.56, -1.55], rough: 0.85 });
  }
  k.add(G.rbox(1.2, 0.36, 0.8, 0.04), WOOD_D, { p: [0, 0.18, -0.85], rough: 0.9 });
  planks(k, W, 2.3, 0.08, shade(WOOD, -0.05), { p: [0, 1.25, -1.6] }, 9);
  k.add(G.rbox(W - 0.3, 0.06, 0.36, 0.02), WOOD_L, { p: [0, 1.75, -1.4], rough: 0.8 });
  // striped awning (scalloped front edge)
  const D = 2.75, rise = 0.4, len = Math.hypot(D, rise);
  const aw = new THREE.BoxGeometry(W + 0.5, 0.05, len, 10, 1, 1);
  k.add(aw, v.cart, { p: [0, 2.98, -0.4], r: [Math.atan2(rise, D), 0, 0], rough: 0.9, grad: [0.85, 1.05], fc: (c) => (Math.floor((c.x + 5) / ((W + 0.5) / 10)) % 2 ? '#f7f2e6' : null) });
  for (let i = 0; i < 14; i++) {
    const x = -HW - 0.25 + (i + 0.5) * (W + 0.5) / 14;
    k.add(G.sph(0.13, 8, 5), i % 2 ? '#f7f2e6' : v.cart, { p: [x, 2.72, 0.95], s: [1, 0.9, 0.16], rough: 0.9 });
  }
  // sign posts (sign = label mesh added after)
  for (const s of [-1, 1]) k.add(G.rbox(0.05, 0.42, 0.05, 0.01), WOOD_D, { p: [s * 1.0, 2.98, 0.96], rough: 0.9 });
  // jars on back shelf
  const jarC = ['#d8362a', '#f2c12e', '#6aa83a', '#7a3a8a', '#e8741e', '#2a6ad4'];
  for (let i = 0; i < 6; i++) {
    const x = -1.25 + i * 0.5;
    k.add(G.lathe([[0, 0], [0.095, 0.0], [0.105, 0.04], [0.105, 0.18], [0.08, 0.22], [0, 0.22]], 10), jarC[(i + v.id.length) % 6], { p: [x, 1.78, -1.4], rough: 0.25 });
    k.add(G.cyl(0.085, 0.085, 0.05, 10), '#f2ead8', { p: [x, 2.02, -1.4], rough: 0.7, vc: (vv) => (vv.y > 2.03 ? '#e45a4a' : null) });
  }
  // barrel & crates
  k.add(G.lathe([[0, -0.4], [0.3, -0.4], [0.35, -0.2], [0.36, 0], [0.35, 0.2], [0.3, 0.4], [0, 0.4]], 14), '#8a5a32', { p: [HW + 0.45, 0.4, 0.3], rough: 0.85, fc: (c) => (Math.abs(c.y) > 0.22 && Math.abs(c.y) < 0.3 ? '#3a3a3c' : (Math.floor((Math.atan2(c.x, c.z) + 4) / 0.45) % 2 ? shade('#8a5a32', -0.1) : null)) });
  planks(k, 0.6, 0.45, 0.5, '#d8c4a0', { p: [-HW - 0.45, 0.23, 0.15], r: [0, 0.2, 0] }, 3);
  planks(k, 0.5, 0.35, 0.45, '#d8c4a0', { p: [-HW - 0.4, 0.63, 0.1], r: [0, -0.15, 0] }, 2);
  // goods on the counter
  const kind = v.id === 'hats' ? 'hats' : v.id === 'seeds' ? 'seeds' : v.id === 'buyer' ? 'veg' : 'none';
  goods(k, kind, 0.92, 0.25, 3.2);
  const g = k.build({ name: 'stall-' + v.id });
  const sign = makeSignBoard(v.title, { h: 0.44, minW: 2.4 });
  sign.obj.position.set(0, 3.25, 0.98); g.add(sign.obj);
  if (v.id === 'pets') {
    [['ezitis', -0.95], ['zakitis', 0.05], ['vaverite', 0.95]].forEach(([id, x]) => { const n = buildPet(id); n.root.position.set(x, 0.92, 0.3); g.add(n.root); });
  } else if (v.id === 'decor' && typeof buildDecor === 'function') {
    [['rukis', -1.05, 0.75], ['pukupods', 0, 0.7], ['laterna', 1.05, 0.42]].forEach(([id, x, s]) => { const d = buildDecor(id); d.scale.setScalar(s); d.position.set(x, 0.92, 0.3); g.add(d); });
  }
  return g;
}

export function buildBunting(a, b, sag = 0.7) {
  const k = new Kit(33);
  const cols = ['#d42a2a', '#f2c12e', '#2fa84f', '#2a6ad4', '#f7f2e6', '#c04ad2'];
  const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(4, Math.floor(len / 0.7));
  const ry = Math.atan2(-(b.z - a.z), b.x - a.x);
  const pts = [];
  const tri = G.poly([[-0.17, 0], [0.17, 0], [0, -0.36]], 0.012, 0.004);
  for (let i = 0; i <= n * 2; i++) {
    const t = i / (n * 2);
    pts.push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t]);
  }
  for (let i = 1; i < n; i++) { const p = pts[i * 2]; k.add(tri, cols[i % cols.length], { p, r: [0, ry, 0], rough: 0.85, sway: 0.6 }); }
  k.add(G.tube(pts, 0.012, 4), '#3a3328', { rough: 1 });
  return k.build({ name: 'bunting', castShadow: false });
}

// =====================================================================
//  Farmyard buildings & signs
// =====================================================================
export const HOUSE = { hx: 3.2, hz: 2.3, door: 0.6, wallH: 2.6, rise: 1.45 };
export const GREEN = { hx: 2.7, hz: 5.2, door: 0.7, wallH: 2.1, rise: 1.0 };
export const GATE_W = 9, GATE_BEAM = 3.4, GATE_BOARD = 2.6;

/** wall segments → simple box colliders [x, z, r]-style list the game can adapt */
export function segColliders(segs, step = 0.6, r = 0.3) {
  const out = [];
  for (const [x0, z0, x1, z1] of segs) { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step)); for (let i = 0; i <= n; i++) out.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, r]); }
  return out;
}

export function buildGardenHouse() {
  const { hx, hz, door, wallH, rise } = HOUSE, t = 0.16;
  const RED = '#a63a2c', WHITE = '#f4f1e8', ROOF = '#3d4049', GLASS = '#8fb6c8';
  const g = new THREE.Group();
  // walls: own material instance so the game can fade them when the player is inside
  const wk = new Kit(41); wk.groundAO = 0.4;
  const boards = (c) => { const ang = Math.atan2(c.x, c.z); void ang; return Math.floor(((Math.abs(c.x) > hx - 0.2 ? c.z : c.x) + 10) / 0.22) % 2 ? shade(RED, -0.08) : null; };
  const wall = (w, h, d, x, y, z) => wk.add(new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w / 0.22)), 1, Math.max(1, Math.round(d / 0.22))), RED, { p: [x, y, z], rough: 0.85, fc: boards, grad: [0.85, 1.03] });
  wall(t, wallH, hz * 2, -hx + t / 2, wallH / 2, 0);
  wall(hx * 2, wallH, t, 0, wallH / 2, -hz + t / 2);
  wall(hx * 2, wallH, t, 0, wallH / 2, hz - t / 2);
  wall(t, wallH, hz - door, hx - t / 2, wallH / 2, -(hz + door) / 2);
  wall(t, wallH, hz - door, hx - t / 2, wallH / 2, (hz + door) / 2);
  wall(t, wallH - 2.05, door * 2, hx - t / 2, (wallH + 2.05) / 2, 0);
  for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) wk.add(G.rbox(0.2, wallH, 0.2, 0.03), WHITE, { p: [a * (hx - 0.05), wallH / 2, b * (hz - 0.05)], rough: 0.7 });
  for (const s of [-1, 1]) wk.add(G.rbox(0.22, 2.1, 0.12, 0.03), WHITE, { p: [hx - 0.02, 1.05, s * (door + 0.04)], rough: 0.7 });
  wk.add(G.rbox(0.22, 0.14, door * 2 + 0.24, 0.03), WHITE, { p: [hx - 0.02, 2.1, 0], rough: 0.7 });
  // gables (triangles both sides)
  for (const x of [-hx + 0.01, hx - 0.01]) {
    const sh = G.poly([[-hz, 0], [hz, 0], [0, rise]], t, 0);
    wk.add(sh, RED, { p: [x, wallH, 0], r: [0, Math.PI / 2, 0], rough: 0.85, fc: (c) => (Math.floor((c.z + 10) / 0.22) % 2 ? shade(RED, -0.08) : null) });
    wk.add(G.rbox(0.2, 0.5, 0.5, 0.04), WHITE, { p: [x + Math.sign(x) * 0.02, wallH + 0.55, 0], rough: 0.7 });
    wk.add(G.box(0.22, 0.36, 0.36), GLASS, { p: [x + Math.sign(x) * 0.02, wallH + 0.55, 0], rough: 0.08, metal: 0.3 });
  }
  // windows (frames + cross bars + glass)
  const win = (x, y, z, ry) => {
    wk.add(G.rbox(1.3, 1.05, 0.24, 0.04), WHITE, { p: [x, y, z], r: [0, ry, 0], rough: 0.7 });
    wk.add(G.box(1.1, 0.85, 0.26), GLASS, { p: [x, y, z], r: [0, ry, 0], rough: 0.06, metal: 0.35 });
    wk.add(G.box(0.06, 0.85, 0.28), WHITE, { p: [x, y, z], r: [0, ry, 0], rough: 0.7 });
    wk.add(G.box(1.1, 0.06, 0.28), WHITE, { p: [x, y, z], r: [0, ry, 0], rough: 0.7 });
    wk.add(G.rbox(1.4, 0.08, 0.3, 0.02), WHITE, { p: [x, y - 0.55, z + (ry ? 0 : Math.sign(z) * 0.05)], r: [0, ry, 0], rough: 0.7 });
  };
  for (const b of [-1, 1]) win(-0.6, 1.45, b * (hz - t / 2), 0);
  win(-hx + t / 2, 1.5, 0, Math.PI / 2);
  // stone plinth
  wk.add(G.rbox(hx * 2 + 0.16, 0.25, hz * 2 + 0.16, 0.05), '#9a958a', { p: [0, 0.1, 0], rough: 1, fc: (c) => (Math.floor((c.x + c.z + 10) / 0.35) % 3 === 0 ? '#8a857a' : null) });
  const walls = wk.build({ name: 'house-walls', material: toyMaterial({ own: true, side: THREE.DoubleSide }), receiveShadow: true });
  const wallMat = walls.userData.mz.meshes[0].material;
  g.add(walls);
  // roof (separate so the game can hide it)
  const rk = new Kit(42);
  const ang = Math.atan2(rise, hz), sl = Math.hypot(hz, rise) + 0.42;
  for (const s of [-1, 1]) {
    const roof = new THREE.BoxGeometry(hx * 2 + 0.6, 0.12, sl, 1, 1, 9);
    rk.add(roof, ROOF, { p: [0, wallH + rise / 2 - 0.02 + 0.06, s * hz / 2 + s * 0.05], r: [s * ang, 0, 0], rough: 0.6, fc: (c) => (Math.floor((c.z * s + 10) / (sl / 9)) % 2 ? shade(ROOF, 0.08) : null) });
  }
  rk.add(G.cyl(0.11, 0.11, hx * 2 + 0.62, 8), '#2c2e35', { p: [0, wallH + rise + 0.05, 0], r: [0, 0, Math.PI / 2], rough: 0.6 });
  rk.add(G.rbox(0.45, 1.0, 0.45, 0.04), '#8a3a2c', { p: [-1.4, wallH + rise - 0.05, -0.9], rough: 0.85, fc: (c) => (Math.floor((c.y + 10) / 0.12) % 2 ? '#7a3226' : null) });
  rk.add(G.rbox(0.55, 0.1, 0.55, 0.03), '#3d4049', { p: [-1.4, wallH + rise + 0.48, -0.9], rough: 0.7 });
  const roof = rk.build({ name: 'house-roof' });
  g.add(roof);
  // door (open, white with heart cut-out) + flowers, all in the props mesh
  const pk = new Kit(43);
  pk.add(G.rbox(0.07, 2.0, door * 2 - 0.05, 0.02), '#2f6b4a', { p: [hx + 0.35, 1.02, door + 0.45], r: [0, -1.2, 0], rough: 0.7 });
  pk.add(G.heart(0.09, 0.08, 0.01), '#f4d35e', { p: [hx + 0.36, 1.65, door + 0.45], r: [0, Math.PI / 2 - 1.2, 0], rough: 0.5 });
  for (const b of [-1, 1]) {
    pk.add(G.rbox(1.25, 0.22, 0.3, 0.04), '#7a4f30', { p: [-0.6, 0.86, b * (hz + 0.18)], rough: 0.9 });
    for (let i = 0; i < 4; i++) pk.add(flowerGeo(0.07, 5, 0.012), ['#ff6b8a', '#ffd84a', '#ffffff', '#b06ae0'][i % 4], { p: [-1.05 + i * 0.3, 1.02, b * (hz + 0.2)], r: [-Math.PI / 2 + 0.4 * b, 0, 0], rough: 0.6 });
    pk.add(G.blob(0.14, 1, 0.2, b + 3), '#4f8a30', { p: [-0.6, 0.98, b * (hz + 0.18)], s: [4, 0.6, 1.2], rough: 0.85 });
  }
  pk.add(G.rbox(1.0, 0.1, 0.8, 0.03), '#9a958a', { p: [hx + 0.55, 0.05, 0], rough: 1 });
  g.add(pk.build({ name: 'house-props' }));
  const segs = [[-hx, -hz, -hx, hz], [-hx, -hz, hx, -hz], [-hx, hz, hx, hz], [hx, -hz, hx, -door - 0.15], [hx, door + 0.15, hx, hz]];
  return { obj: g, roof, wallMat, segs, colliders: segColliders(segs) };
}

export function buildGreenhouse() {
  const { hx, hz, door, wallH, rise } = GREEN, W = '#eef2f0';
  const k = new Kit(44); k.groundAO = 0.3;
  // white frame
  const nZ = 8;
  for (let i = 0; i <= nZ; i++) {
    const z = -hz + i * (hz * 2 / nZ);
    for (const s of [-1, 1]) {
      rod(k, [s * hx, 0, z], [s * hx, wallH, z], 0.045, W, { rough: 0.4, seg: 5 });
      rod(k, [s * hx, wallH, z], [0, wallH + rise, z], 0.04, W, { rough: 0.4, seg: 5 });
    }
  }
  for (const s of [-1, 1]) for (const y of [0.05, 0.9, wallH]) rod(k, [s * hx, y, -hz], [s * hx, y, hz], 0.04, W, { rough: 0.4, seg: 5 });
  rod(k, [0, wallH + rise, -hz], [0, wallH + rise, hz], 0.05, W, { rough: 0.4, seg: 5 });
  for (const s of [-1, 1]) for (const x of [-hx, -hx / 2, hx / 2, hx]) if (!(s > 0 && Math.abs(x) < door + 0.3)) rod(k, [x, 0, s * hz], [x, wallH + (1 - Math.abs(x) / hx) * rise * 0.98, s * hz], 0.04, W, { rough: 0.4, seg: 5 });
  // low brick base
  k.add(G.rbox(hx * 2 + 0.12, 0.3, hz * 2 + 0.12, 0.04), '#b0563c', { p: [0, 0.15, 0], rough: 0.95, fc: (c) => (Math.floor((c.x + c.z + 20) / 0.25) % 2 ? '#9a4a33' : null), ao: false });
  k.add(new THREE.BoxGeometry(hx * 2 - 0.1, 0.02, hz * 2 - 0.1, 10, 1, 20), '#c9b796', { p: [0, 0.305, 0], rough: 1, ao: false, fc: (c) => (Math.floor((c.x + 9) / 0.5) % 2 ^ Math.floor((c.z + 9) / 0.5) % 2 ? '#bba886' : null) });
  // raised beds with soil and plants
  const beds = [[-hx + 0.8, -hz + 0.6, hz - 0.6], [hx - 0.8, -hz + 0.6, hz - 0.6]];
  for (const [x, z0, z1] of beds) {
    k.add(G.rbox(1.1, 0.5, z1 - z0, 0.04), '#8a5e38', { p: [x, 0.25, (z0 + z1) / 2], rough: 0.9, fc: (c) => (Math.floor((c.y + 1) / 0.12) % 2 ? '#7a5232' : null) });
    k.add(G.box(0.98, 0.04, z1 - z0 - 0.12), '#4a3424', { p: [x, 0.5, (z0 + z1) / 2], rough: 1 });
    for (let z = z0 + 0.4; z < z1 - 0.2; z += 0.55) {
      k.add(G.blob(0.18, 1, 0.2, z * 3), '#4f9a38', { p: [x, 0.65, z], s: [1, 0.8, 1], rough: 0.8, sway: 0.4 });
      k.add(G.sph(0.05, 8, 6), z % 1.1 > 0.5 ? '#e8452a' : '#f2c12e', { p: [x + 0.12, 0.7, z + 0.08], rough: 0.35 });
    }
  }
  // glass panes (2nd draw call, transparent)
  const gl = '#cfe6ee';
  for (const s of [-1, 1]) {
    k.add(G.box(0.02, wallH - 0.3, hz * 2), gl, { p: [s * hx, 0.3 + (wallH - 0.3) / 2, 0], ch: 'glass', rough: 0.05 });
    const sl = Math.hypot(hx, rise), a = Math.atan2(rise, hx);
    k.add(G.box(sl, 0.02, hz * 2), gl, { p: [s * hx / 2, wallH + rise / 2, 0], r: [0, 0, -s * a], ch: 'glass', rough: 0.05 });
  }
  for (const s of [-1, 1]) {
    const tri = G.poly([[-hx, 0], [hx, 0], [0, rise]], 0.02, 0);
    k.add(tri, gl, { p: [0, wallH, s * hz], ch: 'glass', rough: 0.05 });
    if (s < 0) k.add(G.box(hx * 2, wallH - 0.3, 0.02), gl, { p: [0, 0.3 + (wallH - 0.3) / 2, -hz], ch: 'glass', rough: 0.05 });
    else for (const x of [-1, 1]) k.add(G.box(hx - door, wallH - 0.3, 0.02), gl, { p: [x * (hx + door) / 2, 0.3 + (wallH - 0.3) / 2, hz], ch: 'glass', rough: 0.05 });
  }
  const g = k.build({ name: 'greenhouse', receiveShadow: true });
  const segs = [[-hx, -hz, -hx, hz], [hx, -hz, hx, hz], [-hx, -hz, hx, -hz], [-hx, hz, -door - 0.15, hz], [door + 0.15, hz, hx, hz]];
  return { obj: g, segs, colliders: segColliders(segs), beds };
}

export function buildGateArch() {
  const k = new Kit(45); k.groundAO = 0.4;
  const P = '#7a5230', D = '#5e3d22';
  for (const s of [-1, 1]) {
    k.add(G.cyl(0.13, 0.15, GATE_BEAM + 0.5, 8), P, { p: [0, (GATE_BEAM + 0.5) / 2 - 0.3, s * GATE_W / 2], rough: 0.9, fc: (c) => (Math.floor((c.y + 1) / 0.5) % 2 ? shade(P, -0.08) : null) });
    k.add(G.cone(0.17, 0.22, 8), D, { p: [0, GATE_BEAM + 0.32, s * GATE_W / 2], rough: 0.85 });
    rod(k, [0, GATE_BEAM - 1.05, s * (GATE_W / 2 - 0.05)], [0, GATE_BEAM - 0.05, s * (GATE_W / 2 - 1.15)], 0.07, D, { rough: 0.9, seg: 6 });
    rod(k, [0, GATE_BEAM - 0.1, s * 0.9], [0, GATE_BOARD + 0.18, s * 0.9], 0.015, '#3a3a3a', { rough: 0.5, metal: 0.6, seg: 4 });
  }
  k.add(G.rbox(0.22, 0.22, GATE_W + 0.7, 0.04), D, { p: [0, GATE_BEAM, 0], rough: 0.9 });
  // board with the farm name lives as a label; frame here
  k.add(G.rbox(0.1, 0.62, 2.3, 0.04), '#c99a62', { p: [0, GATE_BOARD, 0], rough: 0.85 });
  // climbing roses
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
    const y = 0.4 + i * 0.5, a = i * 1.7;
    k.add(G.blob(0.15, 1, 0.25, i + s), '#3f7d28', { p: [Math.sin(a) * 0.14, y, s * GATE_W / 2 + Math.cos(a) * 0.14], rough: 0.85, sway: 0.3 });
    if (i % 2) k.add(flowerGeo(0.05, 5, 0.012), '#ff5a7a', { p: [Math.sin(a) * 0.25, y + 0.05, s * GATE_W / 2 + Math.cos(a) * 0.25], r: [0, a, 0], rough: 0.6 });
  }
  const g = k.build({ name: 'gate' });
  const lab = labelMesh('🏡 Mana sēta', 2.1, 0.5, { bg: '#c99a62', fg: '#4a2a12', plank: true, gap: 0.055 });
  lab.position.set(0, GATE_BOARD, 0); lab.rotation.y = Math.PI / 2; g.add(lab);
  return g;
}

/** sign board: wood or road style; arrow optional. Board = toy mesh, faces = 1 label mesh */
export function makeSignBoard(text, opts = {}) {
  const H = opts.h || 0.8, road = opts.style === 'road';
  const c = document.createElement('canvas').getContext('2d'); c.font = 'bold 74px system-ui, sans-serif';
  const tw = Math.max(c.measureText(text).width, opts.back ? c.measureText(opts.back).width : 0);
  const W = Math.max(H * 2, (tw + 90) / 128 * H, opts.minW || 0);
  const D = road || opts.thin ? 0.04 : Math.max(0.05, H * 0.12);
  const k = new Kit(46);
  const e = road ? 0.03 : H * 0.08;
  if (opts.arrow) {
    const x0 = -W / 2 - e, x1 = W / 2, y = H / 2 + e;
    k.add(G.poly([[x0, -y], [x1, -y], [x1 + H * 0.55, 0], [x1, y], [x0, y]], D, 0.012), road ? '#8d9297' : '#9a6a3c', { rough: road ? 0.4 : 0.85, metal: road ? 0.6 : 0 });
  } else k.add(G.rbox(W + e * 2, H + e * 2, D, Math.min(0.05, e)), road ? '#8d9297' : '#9a6a3c', { rough: road ? 0.4 : 0.85, metal: road ? 0.6 : 0 });
  const obj = k.build({ name: 'sign' });
  obj.updateMatrixWorld(true); const fz = Math.max(D / 2, new THREE.Box3().setFromObject(obj).max.z) + 0.004; // 1.38.0: teksts uz dēļa virsmas (bultas apmale ir biezāka par D)
  const face = (t) => labelTexture(t, { w: 512, h: Math.round(512 * H / W), bg: road ? '#6e3f1f' : '#e9c895', fg: road ? '#ffffff' : '#4a2a12', plank: !road, border: road ? '#ffffff' : null });
  const mk = (t, back) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: face(t), roughness: 0.75, emissive: '#ffffff', emissiveMap: face(t), emissiveIntensity: 0.1 }));
    m.position.z = back ? -fz : fz; if (back) m.rotation.y = Math.PI; m.name = 'label'; return m;
  };
  obj.add(mk(text, false), mk(opts.back || text, true));
  return { obj, w: W };
}

export function buildFingerpost(dirs) {
  const k = new Kit(47); const PH = 3.1;
  k.add(G.cyl(0.07, 0.09, PH, 8), '#8a5e38', { p: [0, PH / 2, 0], rough: 0.9, grad: [0.75, 1] });
  k.add(G.cone(0.14, 0.22, 8), '#6a4526', { p: [0, PH + 0.1, 0], rough: 0.85 });
  k.add(G.blob(0.3, 1, 0.2, 2), '#4f8a30', { p: [0, 0.12, 0], s: [1.3, 0.5, 1.3], rough: 0.9, sway: 0.2 });
  const g = k.build({ name: 'fingerpost' });
  dirs.forEach(([dx, dz, txt], i) => {
    const { obj, w } = makeSignBoard(txt, { arrow: true, h: 0.3, style: 'wood' });
    const l = Math.hypot(dx, dz), off = w / 2 + 0.1;
    obj.position.set(dx / l * off, PH - 0.3 - i * 0.38, dz / l * off); obj.rotation.y = Math.atan2(-dz, dx);
    g.add(obj);
  });
  return g;
}

export function buildRoadSign(front, back) {
  const { obj, w } = makeSignBoard(front, { h: 0.62, style: 'road', back, thin: true });
  obj.position.y = 1.75;
  const k = new Kit(48);
  for (const s of [-1, 1]) k.add(G.cyl(0.035, 0.035, 2.1, 6), '#9aa0a6', { p: [s * (w / 2 - 0.25), 1.05, -0.05], rough: 0.4, metal: 0.7 });
  const g = k.build({ name: 'roadsign' }); g.add(obj);
  return g;
}

export function buildStop(stop) {
  const k = new Kit(49); k.groundAO = 0.25;
  const metal = '#8d949b', blue = '#1f6fd6', wood = '#8a6440';
  for (const x of [-1.7, 1.7]) for (const z of [-0.7, 0.6]) k.add(G.cyl(0.04, 0.04, 2.4, 6), metal, { p: [x, 1.2, z], rough: 0.4, metal: 0.7 });
  k.add(G.rbox(3.8, 0.12, 1.8, 0.05), blue, { p: [0, 2.45, -0.05], rough: 0.4 });
  for (let i = 0; i < 3; i++) k.add(G.rbox(3.2, 0.06, 0.14, 0.02), wood, { p: [0, 0.5, -0.56 + i * 0.16], rough: 0.85 });
  for (let i = 0; i < 2; i++) k.add(G.rbox(3.2, 0.14, 0.05, 0.02), wood, { p: [0, 0.72 + i * 0.2, -0.66], rough: 0.85 });
  for (const x of [-1.4, 1.4]) k.add(G.rbox(0.06, 0.5, 0.4, 0.01), metal, { p: [x, 0.25, -0.4], rough: 0.4, metal: 0.7 });
  k.add(G.rbox(3.9, 0.06, 2.0, 0.02), '#a8a397', { p: [0, 0.03, 0], rough: 1, fc: (c) => (Math.floor((c.x + 5) / 0.3) % 2 ^ Math.floor((c.z + 5) / 0.3) % 2 ? '#9a958a' : null), ao: false });
  k.add(G.cyl(0.035, 0.035, 2.9, 6), metal, { p: [2.3, 1.45, 0.55], rough: 0.4, metal: 0.7 });
  k.add(G.cyl(0.33, 0.33, 0.05, 20), blue, { p: [2.3, 2.62, 0.55], r: [Math.PI / 2, 0, 0], rough: 0.4 });
  k.add(G.box(3.4, 1.7, 0.02), '#bcd8e8', { p: [0, 1.45, -0.72], ch: 'glass', rough: 0.05 });
  const g = k.build({ name: 'busstop', receiveShadow: true });
  const bus = labelMesh('🚌', 0.42, 0.42, { bg: '#1f6fd6', fg: '#ffffff', gap: 0.03 });
  bus.position.set(2.3, 2.62, 0.55); g.add(bus);
  const nm = labelMesh(`${stop.icon} ${stop.name}`, 1.5, 0.24, { bg: '#ffffff', fg: '#1d3f8a' });
  nm.position.set(2.3, 2.15, 0.55); g.add(nm);
  const top = labelMesh(`🚌 ${stop.name}`, 2.4, 0.3, { bg: '#1f6fd6', fg: '#ffffff' }, false);
  top.position.set(0, 2.45, 0.87); g.add(top);
  return g;
}

// =====================================================================
//  Forest trees (instancing-ready) and fruit trees.
//  treeGeometry(kind) is cached — use it with THREE.InstancedMesh and
//  toyMaterial() for a whole forest in one draw call per species.
// =====================================================================
export const TREE_TYPES = { egle: 'Egle', priede: 'Priede', berzs: 'Bērzs', ozols: 'Ozols' };
const _treeGeo = new Map();
const swayUp = (h0, h1) => (v) => Math.max(0, Math.min(1, (v.y - h0) / (h1 - h0)));

function treeKit(kind) {
  const k = new Kit(61 + kind.length); k.groundAO = 0.5;
  const R = rng(kind.length * 3 + 1);
  switch (kind) {
    case 'egle': {
      k.add(G.cyl(0.14, 0.26, 2.2, 7), '#5a3d28', { p: [0, 1.1, 0], rough: 0.95 });
      const tiers = 6, H = 8.8;
      for (let i = 0; i < tiers; i++) {
        const t = i / (tiers - 1), r = 1.95 * (1 - t * 0.78) + 0.15, h = 2.3 * (1 - t * 0.35), y = 1.3 + t * (H - 2.6);
        const cone = new THREE.ConeGeometry(r, h, 10, 2, false);
        const p = cone.attributes.position;
        for (let j = 0; j < p.count; j++) { const x = p.getX(j), z = p.getZ(j), rr = Math.hypot(x, z) / r; if (rr > 0.6) { const a = Math.atan2(z, x); p.setY(j, p.getY(j) - rr * 0.22 * h * (0.7 + 0.3 * Math.sin(a * 5 + i))); p.setX(j, x * (1 + 0.08 * Math.sin(a * 5 + i))); p.setZ(j, z * (1 + 0.08 * Math.sin(a * 5 + i))); } }
        cone.computeVertexNormals();
        k.add(cone, i % 2 ? '#2a5a3a' : '#2f6440', { p: [0, y + h / 2, 0], r: [0, i * 0.7, 0], rough: 0.85, grad: [0.62, 1.12], sway: swayUp(1, H) });
      }
      break;
    }
    case 'priede': {
      k.add(G.tube([[0, 0, 0], [0.1, 3, 0.05], [-0.05, 6, 0.1], [0.05, 7.6, 0]], [0.26, 0.2, 0.15, 0.1], 8, { div: 3 }), '#7a4a2e', { rough: 0.95, vc: (v) => (v.y > 3.5 ? '#c26a3a' : null) });
      for (const [x, y, z, l] of [[1, 6.4, 0.2, 1.1], [-0.9, 7.0, -0.3, 0.9], [0.2, 7.5, 0.9, 0.8]]) rod(k, [0, y - 0.6, 0], [x, y, z], 0.07, '#8a5232', { rough: 0.95, seg: 5 });
      for (const [x, y, z, s] of [[0, 8.1, 0, 1.6], [1.0, 7.0, 0.3, 1.1], [-0.95, 7.5, -0.35, 1.05], [0.25, 7.8, 0.95, 0.95], [-0.3, 6.6, 0.6, 0.85]]) {
        k.add(G.blob(s, 1, 0.18, x * 7 + y), '#2f5f34', { p: [x, y, z], s: [1, 0.55, 1], rough: 0.85, grad: [0.62, 1.15], sway: swayUp(5, 9) });
      }
      break;
    }
    case 'berzs': {
      k.add(G.tube([[0, 0, 0], [0.05, 2.5, 0.02], [-0.06, 5, 0.04], [0.02, 6.6, 0]], [0.17, 0.13, 0.09, 0.05], 8, { div: 3 }), '#f2efe6', { rough: 0.8, fc: (c) => { const h = Math.sin(c.y * 7.3 + Math.atan2(c.x, c.z) * 2.1) * Math.sin(c.y * 3.1); return h > 0.55 ? '#2a2a28' : c.y < 0.5 ? '#7a756a' : null; } });
      for (const [x, y, z] of [[0.7, 4.2, 0.3], [-0.6, 4.8, -0.2], [0.3, 5.5, -0.6]]) rod(k, [0, y - 0.7, 0], [x, y, z], 0.04, '#e8e4da', { rough: 0.8, seg: 5 });
      for (const [x, y, z, s] of [[0, 6.0, 0, 1.15], [0.75, 5.0, 0.3, 0.9], [-0.7, 5.3, -0.2, 0.95], [0.3, 4.4, -0.6, 0.85], [-0.25, 4.2, 0.65, 0.8], [0.1, 6.8, 0.1, 0.7]]) {
        k.add(G.blob(s, 1, 0.22, x * 5 + y), '#7fae3e', { p: [x, y, z], s: [0.95, 1.15, 0.95], rough: 0.8, grad: [0.7, 1.15], sway: swayUp(3.5, 7), jit: 0.12 });
      }
      break;
    }
    case 'ozols': {
      k.add(G.tube([[0, -0.1, 0], [0, 1.2, 0], [0.1, 2.6, -0.1]], [0.62, 0.42, 0.36], 10, { div: 3 }), '#5e4430', { rough: 0.95, fc: (c) => (Math.floor(Math.atan2(c.x, c.z) * 4 + c.y * 0.6) % 2 ? '#523a28' : null) });
      for (const [x, y, z] of [[1.6, 4.2, 0.4], [-1.5, 4.4, -0.3], [0.3, 4.6, 1.5], [-0.2, 4.5, -1.5], [0.1, 5.2, 0]]) k.add(G.tube([[0.05, 2.4, -0.05], [x * 0.5, (y + 2.4) / 2 + 0.3, z * 0.5], [x, y, z]], [0.3, 0.2, 0.1], 7, { div: 2 }), '#5e4430', { rough: 0.95 });
      for (const [x, y, z, s] of [[0, 5.6, 0, 2.0], [1.7, 4.6, 0.4, 1.45], [-1.7, 4.8, -0.3, 1.5], [0.3, 4.8, 1.7, 1.4], [-0.2, 4.7, -1.7, 1.45], [1.0, 5.6, -1.0, 1.2], [-1.0, 5.7, 1.0, 1.25], [0, 6.6, 0.2, 1.3]]) {
        k.add(G.blob(s, 2, 0.16, x * 3 + z), '#3f6f2a', { p: [x, y, z], s: [1, 0.82, 1], rough: 0.85, grad: [0.6, 1.15], sway: swayUp(3.5, 7.5), jit: 0.1 });
      }
      break;
    }
  }
  void R;
  return k;
}
export function treeGeometry(kind) {
  if (!_treeGeo.has(kind)) _treeGeo.set(kind, treeKit(kind).geometry());
  return _treeGeo.get(kind);
}
export function buildTree(kind) {
  const m = new THREE.Mesh(treeGeometry(kind), toyMaterial());
  m.castShadow = true; m.name = 'tree-' + kind;
  const g = new THREE.Group(); g.add(m); return g;
}
/** a whole forest of one species in ONE draw call */
export function buildForest(kind, transforms) {
  const im = new THREE.InstancedMesh(treeGeometry(kind), toyMaterial(), transforms.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  transforms.forEach(([x, y, z, rot = 0, sc = 1], i) => im.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(sc, sc, sc))));
  im.castShadow = true; return im;
}

// ---------------- fruit trees ----------------
export const FRUIT_TREES = {
  abele: { name: 'Ābele', leaf: '#4f9a38', fruit: '#e0402e', shape: 'apple', blossom: '#ffd6e0' },
  bumbiere: { name: 'Bumbiere', leaf: '#4a9234', fruit: '#c9d84a', shape: 'pear' },
  kirsis: { name: 'Ķirsis', leaf: '#3f8a34', fruit: '#b0102a', shape: 'cherry', blossom: '#ffffff' },
  plume: { name: 'Plūme', leaf: '#45903a', fruit: '#5a3a8a', shape: 'plum' },
  aprikoze: { name: 'Aprikoze', leaf: '#5aa03e', fruit: '#f4a43a', shape: 'apple' },
  persiks: { name: 'Persiks', leaf: '#5a9a3a', fruit: '#f6a37a', shape: 'peach' },
  valrieksts: { name: 'Valrieksts', leaf: '#3a7a2e', fruit: '#9ab84a', shape: 'nut' },
  citronkoks: { name: 'Citronkoks', leaf: '#3f8a3a', fruit: '#f6dc2e', shape: 'lemon' },
  apelsinkoks: { name: 'Apelsīnkoks', leaf: '#3a8434', fruit: '#f6901e', shape: 'apple' },
  zeltabele: { name: 'Zelta ābele', leaf: '#6aa83a', fruit: '#f2c12e', shape: 'apple', gold: true },
};
function fruitPart(k, T, x, y, z, s = 1) {
  const o = { rough: T.gold ? 0.2 : 0.35, metal: T.gold ? 0.9 : 0, emit: T.gold ? 0.15 : 0 };
  switch (T.shape) {
    case 'pear': k.add(G.lathe([[0, -0.08], [0.05, -0.07], [0.065, -0.03], [0.05, 0.02], [0.03, 0.05], [0, 0.07]], 8), T.fruit, { p: [x, y, z], s, ...o }); break;
    case 'cherry': for (const d of [-1, 1]) k.add(G.sph(0.042 * s, 6, 5), T.fruit, { p: [x + d * 0.035, y - 0.05, z], rough: 0.2 }); rod(k, [x - 0.035, y - 0.04, z], [x, y + 0.04, z], 0.005, '#4a6a2a'); rod(k, [x + 0.035, y - 0.04, z], [x, y + 0.04, z], 0.005, '#4a6a2a'); return;
    case 'plum': k.add(G.sph(0.06, 8, 6), T.fruit, { p: [x, y, z], s: [s * 0.9, s * 1.1, s * 0.9], rough: 0.5 }); break;
    case 'lemon': k.add(G.sph(0.065, 8, 6), T.fruit, { p: [x, y, z], s: [s * 0.85, s * 0.85, s * 1.25], ...o }); break;
    case 'nut': k.add(G.sph(0.06, 8, 6), T.fruit, { p: [x, y, z], s, rough: 0.6 }); break;
    default: k.add(G.sph(0.072, 8, 6), T.fruit, { p: [x, y, z], s: [s, s * 0.92, s], ...o, vc: T.shape === 'peach' ? (v) => (v.x > x + 0.02 ? shade(T.fruit, -0.12) : null) : null });
  }
  k.add(G.cyl(0.006, 0.006, 0.05, 4), '#5a3a22', { p: [x, y + 0.075 * s, z] });
}
export function buildFruitTree(kind, stage = 2, fruit = false) {
  const T = FRUIT_TREES[kind] || FRUIT_TREES.abele;
  const k = new Kit(71 + kind.length * 3 + stage); k.groundAO = 0.25;
  const bark = '#6a4e36';
  if (stage === 0) {
    k.add(G.tube([[0, 0, 0], [0.01, 0.4, 0], [-0.01, 0.75, 0.01]], [0.028, 0.02, 0.014], 6, { div: 2 }), bark, { rough: 0.9 });
    k.add(G.cyl(0.013, 0.013, 0.92, 5), '#c9a46a', { p: [0.07, 0.46, 0], rough: 0.85 });
    k.add(G.torus(0.04, 0.008, 4, 10), '#7aa83a', { p: [0.035, 0.5, 0], r: [Math.PI / 2, 0, 0], s: [1.3, 0.6, 1] });
    for (let i = 0; i < 6; i++) { const a = i * 2.4; k.add(G.leaf(0.13, 0.06, { rows: 3 }), T.leaf, { p: [Math.cos(a) * 0.02, 0.5 + i * 0.06, Math.sin(a) * 0.02], r: [-0.9, a, 0], ro: 'YXZ', rough: 0.75, sway: 0.4 }); }
    k.add(G.cyl(0.16, 0.18, 0.05, 12), '#5a4030', { p: [0, 0.02, 0], rough: 1, ao: false });
    return k.build({ name: 'fruittree-' + kind + '-0' });
  }
  const big = stage === 2, H = big ? 1.5 : 0.95, R = big ? 1.15 : 0.6;
  k.add(G.tube([[0, -0.05, 0], [0.04, H * 0.5, 0], [-0.03, H, 0.02]], [big ? 0.15 : 0.08, big ? 0.11 : 0.06, big ? 0.09 : 0.05], 8, { div: 2 }), bark, { rough: 0.95, fc: (c) => (Math.floor(c.y * 9 + Math.atan2(c.x, c.z) * 2) % 3 === 0 ? '#5a4030' : null) });
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; k.add(G.tube([[0, H * 0.95, 0], [Math.cos(a) * R * 0.35, H + R * 0.3, Math.sin(a) * R * 0.35], [Math.cos(a) * R * 0.55, H + R * 0.55, Math.sin(a) * R * 0.55]], [0.06 * (big ? 1 : 0.6), 0.035, 0.02], 6, { div: 2 }), bark, { rough: 0.95 }); }
  const blobs = [[0, H + R * 0.78, 0, R * 0.95], [R * 0.62, H + R * 0.45, 0.1, R * 0.68], [-R * 0.58, H + R * 0.5, -0.15, R * 0.7], [0.1, H + R * 0.48, R * 0.58, R * 0.66], [-0.1, H + R * 0.42, -R * 0.58, R * 0.66]];
  blobs.forEach(([x, y, z, r], i) => k.add(G.blob(r, big ? 2 : 1, 0.13, i + kind.length), i % 2 ? shade(T.leaf, -0.12) : T.leaf, { p: [x, y, z], s: [1, 0.86, 1], rough: 0.82, grad: [0.62, 1.12], sway: Math.min(1, (y - H) / R) * 0.6, jit: 0.08 }));
  if (fruit && big) {
    const r = rng(3);
    for (let i = 0; i < 18; i++) {
      const b = blobs[i % blobs.length], th = r() * Math.PI * 2, ph = 0.5 + r() * 1.4;
      fruitPart(k, T, b[0] + Math.sin(ph) * Math.cos(th) * b[3] * 1.13, b[1] + Math.cos(ph) * b[3] * 0.95 - 0.02, b[2] + Math.sin(ph) * Math.sin(th) * b[3] * 1.13, 1.8);
    }
  } else if (!big && T.blossom) {
    const r = rng(5);
    for (let i = 0; i < 16; i++) { const b = blobs[i % 5], th = r() * 6.28, ph = 0.3 + r() * 1.2; k.add(flowerGeo(0.07, 5, 0.014), T.blossom, { p: [b[0] + Math.sin(ph) * Math.cos(th) * b[3] * 1.12, b[1] + Math.cos(ph) * b[3] * 0.97, b[2] + Math.sin(ph) * Math.sin(th) * b[3] * 1.12], r: [ph - Math.PI / 2, th, 0], ro: 'YXZ', rough: 0.6 }); }
  }
  return k.build({ name: 'fruittree-' + kind + '-' + stage });
}

// =====================================================================
//  Garden crops — buildCrop(crop, stage, color). Stage 0 = sprout,
//  1 = growing, 2 = ripe. Geometry is cached per (crop, stage, colour):
//  hundreds of plants share buffers; cropGeometry() feeds InstancedMesh.
//  Leaves sway in the wind via the shared material (MZ.time).
// =====================================================================
export const CROPS = {
  burkans: { name: 'Burkāns', color: '#f07a1e' }, auzas: { name: 'Auzas', color: '#e6c76a' }, kartupelis: { name: 'Kartupelis', color: '#c9a465' },
  kviesi: { name: 'Kvieši', color: '#e8c35a' }, tomats: { name: 'Tomāts', color: '#e8382a' }, zemene: { name: 'Zemene', color: '#e8253a' },
  kaposts: { name: 'Kāposts', color: '#9cc87a' }, saulgrieze: { name: 'Saulgrieze', color: '#ffc61a' }, kirbis: { name: 'Ķirbis', color: '#f08a1e' },
  redisi: { name: 'Redīsi', color: '#e83a5a' }, salati: { name: 'Salāti', color: '#5fb03a' }, sipols: { name: 'Sīpols', color: '#d9a35a' },
  zirni: { name: 'Zirņi', color: '#6cc04a' }, biete: { name: 'Biete', color: '#8a1a3a' }, gurkis: { name: 'Gurķis', color: '#3f8a2a' },
  kukuruza: { name: 'Kukurūza', color: '#f6d03a' }, paprika: { name: 'Paprika', color: '#e8382a' }, arbuzs: { name: 'Arbūzs', color: '#3a8a3a' },
  lavanda: { name: 'Lavanda', color: '#9a6ad8' }, spinati: { name: 'Spināti', color: '#2f7a2a' }, kiploks: { name: 'Ķiploks', color: '#f2ece0' },
  tulpe: { name: 'Tulpe', color: '#f24a6a' }, pupas: { name: 'Pupas', color: '#5aa83a' }, brokolis: { name: 'Brokolis', color: '#3f8a3a' },
  kabacis: { name: 'Kabacis', color: '#4a8a2a' }, rabarbers: { name: 'Rabarbers', color: '#d8344a' }, melone: { name: 'Melone', color: '#e8c85a' },
  spargelis: { name: 'Sparģelis', color: '#8ac04a' }, baklazans: { name: 'Baklažāns', color: '#5a2a7a' }, roze: { name: 'Roze', color: '#e8203a' },
  ananass: { name: 'Ananāss', color: '#e0a83a' }, zemesrieksti: { name: 'Zemesrieksti', color: '#d9b07a' }, cili: { name: 'Čili pipari', color: '#e8201a' },
  magone: { name: 'Magone', color: '#ec3a26' }, vinogas: { name: 'Vīnogas', color: '#7a3aa8' }, zeltaburkans: { name: 'Zelta burkāns', color: '#f2c12e' },
  milzkirbis: { name: 'Milzu ķirbis', color: '#f07a12' }, varaviksne: { name: 'Varavīksnes zieds', color: '#ff5aa8' }, zvaigzne: { name: 'Zvaigžņu auglis', color: '#ffd84a' },
};
const LEAF = '#3f8a26', LEAF_D = '#2d6c1e', LEAF_L = '#5fa836', STEM = '#4f7f24';
const _cropCache = new Map();

// ---- tiny plant helpers ----
const sw = (h) => (v) => Math.min(1, Math.max(0, v.y / h)) * 0.9;
function rosette(k, n, len, wid, color, { y = 0, tilt = 0.8, twist = 0, shape = 'oval', fold = 0.3, bend = 0.25, jit = 0.12, rows = 3, h = 0.4, scale = 1, r0 = 0 } = {}) {
  const lf = G.leaf(len * scale, wid * scale, { rows, fold, bend, shape });
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + twist; k.add(lf, i % 2 ? color : shade(color, -0.1), { p: [Math.sin(a) * r0, y, Math.cos(a) * r0], r: [tilt + (i % 3) * 0.08, a, 0], ro: 'YXZ', rough: 0.7, sway: sw(h), jit }); }
}
function blades(k, n, h, w, color, { spread = 0.35, curl = 0.3, r0 = 0.02, seed = 1 } = {}) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + R(), hh = h * (0.7 + R() * 0.4);
    k.add(G.leaf(hh, w, { rows: 4, shape: 'blade', fold: 0.2, bend: curl }), i % 2 ? color : shade(color, -0.12), { p: [Math.sin(a) * r0, 0, Math.cos(a) * r0], r: [spread * (0.5 + R() * 0.6), a, 0], ro: 'YXZ', rough: 0.7, sway: sw(h) });
  }
}
function stem(k, pts, r, color = STEM, o = {}) { k.add(G.tube(pts, Array.isArray(r) ? r : [r, r * 0.7], 5, { div: pts.length > 2 ? 2 : 0 }), color, { rough: 0.75, sway: sw(1), ...o }); }
function berry(k, x, y, z, r, color, o = {}) { k.add(G.sph(r, 8, 6), color, { p: [x, y, z], rough: 0.3, ...o }); }
function calyx(k, x, y, z, r = 0.025) { k.add(G.star(r, r * 0.35, 0.006, 5, 0), LEAF_D, { p: [x, y, z], r: [-Math.PI / 2, 0, 0], rough: 0.7 }); }
function stake(k, h, x = 0.05) { k.add(G.cyl(0.013, 0.016, h, 5), '#a07a4a', { p: [x, h / 2, 0], rough: 0.9 }); k.add(G.cone(0.016, 0.03, 5), '#a07a4a', { p: [x, -0.01, 0], r: [Math.PI, 0, 0] }); }
function vineLeaves(k, n, R, color, { size = 0.16, seed = 1 } = {}) {
  const r = rng(seed), lf = G.leaf(size, size * 1.05, { rows: 3, shape: 'heart', fold: 0.15, bend: -0.25 });
  for (let i = 0; i < n; i++) { const a = i / n * 6.28 + r(), d = R * (0.35 + r() * 0.7); k.add(lf, i % 2 ? color : shade(color, -0.12), { p: [Math.sin(a) * d, 0.02 + r() * 0.06, Math.cos(a) * d], r: [1.2 + r() * 0.3, a + r() - 0.5, 0], ro: 'YXZ', rough: 0.7, sway: 0.4 }); }
  k.add(G.tube([[0, 0.01, 0], [R * 0.5, 0.03, R * 0.2], [R * 0.9, 0.02, -R * 0.1]], 0.012, 5, { div: 2 }), STEM, { rough: 0.8 });
  k.add(G.tube([[0, 0.01, 0], [-R * 0.6, 0.03, -R * 0.1], [-R * 0.8, 0.02, R * 0.3]], 0.012, 5, { div: 2 }), STEM, { rough: 0.8 });
}
function flower(k, x, y, z, r, petal, center = '#f2b81a', n = 5, tilt = 0) { k.add(flowerGeo(r, n, r * 0.25), petal, { p: [x, y, z], r: [-Math.PI / 2 + tilt, 0, 0], rough: 0.6 }); k.add(G.sph(r * 0.38, 7, 5), center, { p: [x, y + r * 0.16, z], s: [1, 0.6, 1], rough: 0.6 }); }
function ribbedLathe(prof, seg, ribs, depth) {
  const g = G.lathe(prof, seg), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 - depth * (0.5 - 0.5 * Math.cos(a * ribs)); p.setX(i, x * k); p.setZ(i, z * k); }
  g.computeVertexNormals(); return g;
}

const CROP_BUILD = {
  burkans(k, s, c, gold) {
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * 6.28, tip = [Math.sin(a) * 0.1 * s, 0.34 * s, Math.cos(a) * 0.1 * s];
      stem(k, [[0, 0.02, 0], tip], 0.006);
      for (let j = 0; j < 4; j++) { const t = 0.45 + j * 0.16; k.add(G.leaf(0.07 * s, 0.035 * s, { rows: 2, shape: 'oval' }), j % 2 ? LEAF : LEAF_D, { p: [tip[0] * t, tip[1] * t, tip[2] * t], r: [0.9, a + (j % 2 ? 0.9 : -0.9), 0], ro: 'YXZ', rough: 0.7, sway: sw(0.4) }); }
    }
    if (s === 1) {
      k.add(G.lathe([[0, -0.12], [0.03, -0.08], [0.05, -0.02], [0.058, 0.03], [0.045, 0.06], [0, 0.065]], 10), c, { p: [0, 0, 0], rough: gold ? 0.2 : 0.6, metal: gold ? 1 : 0, emit: gold ? 0.18 : 0, fc: gold ? null : (v) => (Math.floor((v.y + 0.2) / 0.025) % 3 === 0 ? shade(c, -0.12) : null) });
      if (gold) for (let i = 0; i < 3; i++) k.add(G.star(0.025, 0.01, 0.004, 4, 0), '#fff3a0', { p: [Math.sin(i * 2) * 0.12, 0.12 + i * 0.07, Math.cos(i * 2) * 0.12], r: [0, i, 0], emit: 1 });
    }
  },
  zeltaburkans(k, s, c) { CROP_BUILD.burkans(k, s, c, true); },
  auzas(k, s, c) { CROP_BUILD.kviesi(k, s, c, true); },
  kviesi(k, s, c, oat) {
    const green = s < 1;
    blades(k, 7, 0.45 * s + 0.08, 0.025, green ? LEAF : '#c9b25a', { spread: 0.25, curl: 0.35, seed: oat ? 3 : 4 });
    if (s === 1) {
      const R = rng(oat ? 5 : 6);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + R(), x = Math.sin(a) * 0.05, z = Math.cos(a) * 0.05, top = [x * 1.6, oat ? 0.82 : 0.95, z * 1.6];
        stem(k, [[x, 0, z], top], 0.006, '#d8c06a');
        if (oat) for (let j = 0; j < 6; j++) { const ty = top[1] - j * 0.04; k.add(G.sph(0.012, 5, 4), c, { p: [top[0] + (j % 2 ? 0.035 : -0.035), ty - 0.02, top[2]], s: [0.8, 1.8, 0.8], rough: 0.7, sway: 1 }); }
        else { k.add(G.caps(0.016, 0.1, 2, 6), c, { p: [top[0], top[1] + 0.06, top[2]], rough: 0.7, sway: 1, fc: (v) => (Math.floor(v.y * 60) % 2 ? shade(c, -0.15) : null) }); for (let j = 0; j < 5; j++) rod(k, [top[0], top[1] + 0.02 + j * 0.022, top[2]], [top[0] + 0.03, top[1] + 0.07 + j * 0.022, top[2] + (j % 2 ? 0.02 : -0.02)], 0.002, '#f2dc8a', { seg: 3, sway: 1 }); }
      }
    }
  },
  kartupelis(k, s, c) {
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * 6.28, tip = [Math.sin(a) * 0.15 * s, 0.3 * s, Math.cos(a) * 0.15 * s];
      stem(k, [[0, 0, 0], tip], 0.01);
      for (let j = 0; j < 3; j++) { const t = 0.55 + j * 0.22; k.add(G.leaf(0.11 * s, 0.07 * s, { rows: 3 }), j % 2 ? LEAF : LEAF_D, { p: [tip[0] * t, tip[1] * t, tip[2] * t], r: [1.1, a + (j - 1) * 0.9, 0], ro: 'YXZ', rough: 0.7, sway: sw(0.4) }); }
    }
    if (s === 1) {
      for (let i = 0; i < 4; i++) flower(k, Math.cos(i * 1.6) * 0.07, 0.36, Math.sin(i * 1.6) * 0.07, 0.025, i % 2 ? '#f6f2fa' : '#c8a8e8', '#f2c12e', 5);
      for (let i = 0; i < 3; i++) k.add(G.blob(0.065, 1, 0.15, i + 2), c, { p: [(i - 1) * 0.16, 0.035, 0.17 + (i % 2) * 0.04], s: [1.25, 0.8, 0.95], rough: 0.9, fc: (v) => (Math.sin(v.x * 80) * Math.sin(v.z * 70) > 0.85 ? shade(c, -0.25) : null) });
    }
  },
  tomats(k, s, c) {
    stake(k, 0.75);
    let prev = [0, 0, 0];
    for (let j = 0; j < 5; j++) {
      const n = [Math.sin(j * 1.7) * 0.03, (j + 1) * 0.13 * s, 0];
      stem(k, [prev, n], 0.01); prev = n;
      for (const d of [-1, 1]) k.add(G.leaf(0.11 * s, 0.07 * s, { rows: 3, shape: 'oval' }), d > 0 ? LEAF : LEAF_D, { p: n, r: [1.0, d * Math.PI / 2 + j, 0], ro: 'YXZ', rough: 0.7, sway: sw(0.7) });
    }
    if (s === 1) for (let i = 0; i < 5; i++) { const x = Math.cos(i * 1.9) * 0.1, y = 0.22 + i * 0.09, z = Math.sin(i * 1.9) * 0.1; k.add(G.sph(0.055, 10, 8), i === 4 ? '#f2a23a' : c, { p: [x, y, z], s: [1, 0.85, 1], rough: 0.2 }); calyx(k, x, y + 0.046, z, 0.028); }
  },
  zemene(k, s, c) {
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * 6.28, tip = [Math.sin(a) * 0.11 * s, 0.12 * s, Math.cos(a) * 0.11 * s];
      stem(k, [[0, 0, 0], tip], 0.005);
      for (let j = -1; j <= 1; j++) k.add(G.leaf(0.075 * s, 0.06 * s, { rows: 3, shape: 'round' }), j ? LEAF : LEAF_D, { p: tip, r: [1.25, a + j * 0.7, 0], ro: 'YXZ', rough: 0.65, sway: sw(0.2) });
    }
    if (s === 1) {
      for (let i = 0; i < 4; i++) {
        const a = i * 1.6 + 0.4, x = Math.cos(a) * 0.17, z = Math.sin(a) * 0.17;
        k.add(G.lathe([[0, -0.045], [0.02, -0.035], [0.034, -0.005], [0.03, 0.02], [0, 0.026]], 8), c, { p: [x, 0.05, z], rough: 0.25, vc: (v) => (((v.x * 211 + v.y * 157 + v.z * 133) % 1 + 1) % 1 > 0.88 ? '#ffe680' : null) });
        calyx(k, x, 0.078, z, 0.026);
      }
      flower(k, 0, 0.16, 0.05, 0.03, '#ffffff', '#f2c12e', 5);
    }
  },
  kaposts(k, s, c) {
    rosette(k, 7, 0.17 * s + 0.04, 0.17 * s + 0.04, '#5a9a40', { tilt: 1.2, shape: 'round', fold: 0.35, bend: -0.2, h: 0.25 });
    if (s === 1) { k.add(G.blob(0.15, 2, 0.06, 5), c, { p: [0, 0.14, 0], s: [1, 0.88, 1], rough: 0.55, grad: [0.75, 1.1], fc: (v) => (Math.abs(Math.sin(Math.atan2(v.x, v.z) * 3 + v.y * 9)) < 0.08 ? shade(c, 0.25) : null) }); rosette(k, 5, 0.18, 0.2, '#7ab85a', { y: 0.06, tilt: 0.55, shape: 'round', fold: 0.45, bend: -0.6, r0: 0.08, h: 0.3 }); }
  },
  saulgrieze(k, s, c) {
    const H = s === 1 ? 1.55 : 0.75;
    stem(k, [[0, 0, 0], [0.02, H * 0.5, 0], [0.04, H, 0.05]], [0.022, 0.016], STEM);
    for (let j = 0; j < 4; j++) k.add(G.leaf(0.2 * s + 0.04, 0.16 * s + 0.03, { rows: 3, shape: 'heart', bend: 0.3 }), LEAF, { p: [0.02, H * (0.25 + j * 0.18), 0], r: [1.1, j * 2.3, 0], ro: 'YXZ', rough: 0.7, sway: sw(H) });
    if (s === 1) {
      k.add(G.cyl(0.13, 0.11, 0.06, 18), '#5a3a1a', { p: [0.05, H + 0.02, 0.1], r: [1.15, 0, 0], rough: 0.9, fc: (v) => (Math.floor(Math.hypot(v.x - 0.05, v.y - H) * 60) % 2 ? '#3a2410' : null) });
      for (let i = 0; i < 16; i++) { const a = i / 16 * 6.28; k.add(G.leaf(0.12, 0.05, { rows: 2 }), i % 2 ? c : shade(c, -0.1), { p: [0.05, H + 0.02, 0.1], r: [1.15, 0, 0], ro: 'XYZ', q: new THREE.Quaternion().setFromEuler(new THREE.Euler(1.15, 0, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.45)), rough: 0.6, sway: 1 }); }
    } else k.add(G.sph(0.05, 8, 6), LEAF_D, { p: [0.04, H + 0.03, 0.05], rough: 0.7 });
  },
  kirbis(k, s, c, giant) {
    vineLeaves(k, giant ? 9 : 6, (giant ? 0.75 : 0.42) * (0.6 + 0.4 * s), LEAF, { size: giant ? 0.28 : 0.2, seed: 7 });
    if (s === 1) {
      const R = giant ? 0.62 : 0.32;
      k.add(ribbedLathe([[0, 0], [R * 0.6, 0.02], [R * 0.95, R * 0.3], [R, R * 0.6], [R * 0.85, R * 1.1], [R * 0.4, R * 1.33], [0, R * 1.3]], 22, 8, 0.12), c, { p: [0, 0, 0.05], s: [1, 0.95, 1], rough: 0.45, grad: [0.75, 1.08] });
      k.add(G.tube([[0, R * 1.28, 0.05], [0.02, R * 1.42, 0.06], [0.06, R * 1.48, 0.04]], [R * 0.08, R * 0.06], 6, { div: 2, capB: true }), '#6a8a3a', { rough: 0.8 });
    }
  },
  milzkirbis(k, s, c) { CROP_BUILD.kirbis(k, s, c, true); },
  redisi(k, s, c) {
    rosette(k, 5, 0.07 * s + 0.02, 0.045 * s + 0.01, LEAF, { tilt: 0.75, h: 0.12 });
    if (s === 1) k.add(G.lathe([[0, -0.05], [0.02, -0.035], [0.042, -0.005], [0.04, 0.025], [0.02, 0.04], [0, 0.04]], 10), c, { p: [0, 0.01, 0], rough: 0.3, vc: (v) => (v.y < -0.015 ? '#fbf6f0' : null) });
  },
  salati(k, s, c) { rosette(k, 9, 0.13 * s + 0.05, 0.12 * s + 0.04, c, { tilt: 1.0, shape: 'round', fold: 0.5, bend: -0.4, h: 0.2 }); rosette(k, 5, 0.11 * s + 0.03, 0.1 * s + 0.03, shade(c, 0.15), { tilt: 0.45, shape: 'round', fold: 0.55, bend: -0.6, twist: 0.6, h: 0.2 }); },
  spinati(k, s, c) { rosette(k, 8, 0.09 * s + 0.03, 0.06 * s + 0.02, c, { tilt: 1.25, shape: 'oval', fold: 0.3, bend: -0.1, h: 0.1 }); },
  sipols(k, s, c, garlic) {
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; k.add(G.tube([[0, 0.02, 0], [Math.sin(a) * 0.03, 0.22 * s + 0.05, Math.cos(a) * 0.03], [Math.sin(a) * 0.06, 0.36 * s + 0.08, Math.cos(a) * 0.06]], [0.01, 0.008, 0.002], 5, { div: 2 }), i % 2 ? LEAF : '#5fae3a', { rough: 0.6, sway: sw(0.4) }); }
    if (s === 1) {
      if (garlic) for (let i = 0; i < 5; i++) k.add(G.sph(0.03, 8, 6), c, { p: [Math.sin(i * 1.26) * 0.022, 0.035, Math.cos(i * 1.26) * 0.022], s: [0.8, 1.2, 0.8], rough: 0.5, vc: (v) => (v.y > 0.05 ? '#e8d8f0' : null) });
      else k.add(G.lathe([[0, -0.01], [0.045, 0.0], [0.065, 0.035], [0.05, 0.075], [0.012, 0.11], [0, 0.115]], 10), c, { rough: 0.45, fc: (v) => (Math.floor(Math.atan2(v.x, v.z) * 2.5) % 2 ? shade(c, -0.1) : null) });
    }
  },
  kiploks(k, s, c) { CROP_BUILD.sipols(k, s, c, true); },
  zirni(k, s, c, bean) {
    stake(k, bean ? 0.9 : 0.75, 0);
    k.add(G.tube(Array.from({ length: 9 }, (_, i) => [Math.sin(i * 1.3) * 0.04, i * 0.085 * (s + 0.1), Math.cos(i * 1.3) * 0.04]), 0.007, 4), STEM, { rough: 0.7, sway: sw(0.8) });
    for (let j = 0; j < 6; j++) { const y = 0.12 + j * 0.11 * s, a = j * 2.2; k.add(G.leaf(0.08, 0.055, { rows: 2, shape: 'round' }), j % 2 ? LEAF : LEAF_D, { p: [Math.sin(a) * 0.04, y, Math.cos(a) * 0.04], r: [1.0, a, 0], ro: 'YXZ', rough: 0.7, sway: sw(0.8) }); }
    if (s === 1) for (let i = 0; i < 4; i++) {
      const a = i * 1.7, x = Math.sin(a) * 0.075, y = 0.25 + i * 0.13, z = Math.cos(a) * 0.075;
      k.add(G.caps(bean ? 0.014 : 0.02, bean ? 0.14 : 0.08, 3, 6), c, { p: [x, y, z], r: [0.2, a, 0.25], rough: 0.4 });
      if (i % 2) flower(k, x * 0.6, y + 0.07, z * 0.6, 0.022, bean ? '#ff7a6a' : '#f6f2fa', '#ffffff', 5, 0.8);
    }
  },
  pupas(k, s, c) { CROP_BUILD.zirni(k, s, c, true); },
  biete(k, s, c) {
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; stem(k, [[0, 0.02, 0], [Math.sin(a) * 0.05 * s, 0.18 * s + 0.04, Math.cos(a) * 0.05 * s]], 0.008, '#b8204a'); k.add(G.leaf(0.12 * s + 0.03, 0.07 * s + 0.02, { rows: 3 }), LEAF_D, { p: [Math.sin(a) * 0.05 * s, 0.18 * s + 0.04, Math.cos(a) * 0.05 * s], r: [0.7, a, 0], ro: 'YXZ', rough: 0.6, sway: sw(0.3), vc: (v) => (Math.abs(v.x - Math.sin(a) * 0.05 * s) < 0.004 ? '#b8204a' : null) }); }
    if (s === 1) k.add(G.lathe([[0, -0.07], [0.03, -0.05], [0.06, -0.01], [0.062, 0.02], [0.04, 0.045], [0, 0.05]], 10), c, { rough: 0.45 });
  },
  gurkis(k, s, c, zuc) {
    vineLeaves(k, zuc ? 5 : 7, (zuc ? 0.35 : 0.4) * (0.6 + 0.4 * s), LEAF, { size: zuc ? 0.24 : 0.17, seed: zuc ? 11 : 3 });
    if (s === 1) {
      for (let i = 0; i < (zuc ? 2 : 3); i++) { const a = i * 2.2 + 0.3, d = zuc ? 0.16 : 0.22; k.add(G.caps(zuc ? 0.05 : 0.032, zuc ? 0.2 : 0.13, 3, 8), c, { p: [Math.sin(a) * d, zuc ? 0.05 : 0.035, Math.cos(a) * d], r: [Math.PI / 2, a + 0.6, 0], ro: 'YXZ', rough: 0.4, vc: (v) => (zuc ? (Math.sin(Math.atan2(v.y, v.x) * 7) > 0.6 ? shade(c, 0.18) : null) : (((v.x * 177 + v.z * 131) % 1 + 1) % 1 > 0.85 ? shade(c, 0.3) : null)) }); }
      flower(k, 0.05, 0.08, -0.12, 0.04, '#f6c81a', '#e89a10', 5, 0.4);
    }
  },
  kabacis(k, s, c) { CROP_BUILD.gurkis(k, s, c, true); },
  kukuruza(k, s, c) {
    const H = s === 1 ? 1.75 : 0.95;
    stem(k, [[0, 0, 0], [0, H, 0]], [0.028, 0.016], '#6a9a3a');
    for (let j = 0; j < 7; j++) k.add(G.leaf(0.55 * (1 - j * 0.07), 0.06, { rows: 4, shape: 'blade', bend: 0.6, fold: 0.15 }), j % 2 ? LEAF : '#5aa83a', { p: [0, 0.15 + j * H * 0.12, 0], r: [0.55, j * 2.4, 0], ro: 'YXZ', rough: 0.7, sway: sw(H) });
    if (s === 1) {
      for (const [y, a] of [[0.85, 0.3], [1.05, 3.4]]) {
        k.add(G.caps(0.045, 0.16, 3, 8), c, { p: [Math.sin(a) * 0.06, y, Math.cos(a) * 0.06], r: [0.35, a, 0], ro: 'YXZ', rough: 0.5, fc: (v) => (Math.floor(v.y * 70) % 2 ^ Math.floor(Math.atan2(v.x - Math.sin(a) * 0.06, v.z - Math.cos(a) * 0.06) * 3) % 2 ? shade(c, -0.12) : null) });
        k.add(G.leaf(0.2, 0.08, { rows: 3, fold: 0.6, bend: 0.1 }), '#9ac85a', { p: [Math.sin(a) * 0.05, y - 0.12, Math.cos(a) * 0.05], r: [0.3, a, 0], ro: 'YXZ', rough: 0.7 });
      }
      for (let i = 0; i < 5; i++) k.add(G.leaf(0.16, 0.012, { rows: 2, shape: 'blade', bend: 0.5 }), '#d9b860', { p: [0, H, 0], r: [0.5, i * 1.26, 0], ro: 'YXZ', rough: 0.7, sway: 1 });
    }
  },
  paprika(k, s, c, chili) {
    stem(k, [[0, 0, 0], [0, 0.32 * s + 0.08, 0]], 0.012);
    for (let j = 0; j < 7; j++) { const a = j * 2.4; k.add(G.leaf(0.11 * s + 0.03, 0.06 * s + 0.02, { rows: 3 }), j % 2 ? LEAF : LEAF_D, { p: [0, 0.08 + j * 0.05 * s, 0], r: [1.0, a, 0], ro: 'YXZ', rough: 0.65, sway: sw(0.4) }); }
    if (s === 1) for (let i = 0; i < (chili ? 6 : 3); i++) {
      const a = i * (chili ? 1.05 : 2.1) + 0.4, d = chili ? 0.08 : 0.09, x = Math.sin(a) * d, z = Math.cos(a) * d, y = chili ? 0.22 + (i % 3) * 0.06 : 0.16 + i * 0.05;
      const col = chili ? (i % 3 === 2 ? '#f28a1e' : c) : c;
      if (chili) k.add(G.cone(0.016, 0.1, 6), col, { p: [x, y, z], r: [Math.PI + 0.25, a, 0], ro: 'YXZ', rough: 0.25 });
      else k.add(ribbedLathe([[0, -0.06], [0.04, -0.06], [0.055, -0.02], [0.055, 0.03], [0.04, 0.055], [0, 0.05]], 12, 4, 0.18), col, { p: [x, y, z], rough: 0.2 });
      k.add(G.cyl(0.006, 0.008, 0.03, 4), LEAF_D, { p: [x, y + (chili ? 0.05 : 0.06), z] });
    }
  },
  cili(k, s, c) { CROP_BUILD.paprika(k, s, c, true); },
  baklazans(k, s, c) {
    CROP_BUILD.paprika(k, s, c, false);
    // swap the 3 peppers (6 parts) for eggplants
    if (s === 1) {
      k.parts.splice(k.parts.length - 6, 6);
      for (let i = 0; i < 2; i++) { const a = i * 3.1 + 0.4, x = Math.sin(a) * 0.12, z = Math.cos(a) * 0.12; k.add(G.lathe([[0, -0.12], [0.04, -0.11], [0.055, -0.05], [0.045, 0.03], [0.025, 0.07], [0, 0.075]], 10), c, { p: [x, 0.17, z], r: [0, 0, (i ? 1 : -1) * 0.25], rough: 0.15 }); k.add(G.star(0.03, 0.012, 0.01, 5, 0), LEAF_D, { p: [x, 0.25, z], r: [-Math.PI / 2, 0, 0] }); }
    }
  },
  arbuzs(k, s, c, melon) {
    vineLeaves(k, 6, 0.4 * (0.6 + 0.4 * s), LEAF, { size: 0.15, seed: melon ? 13 : 17 });
    if (s === 1) {
      if (melon) k.add(G.sph(0.17, 14, 10), c, { p: [0, 0.15, 0.05], s: [1.08, 0.92, 1], rough: 0.7, fc: (v) => (Math.abs(Math.sin(v.x * 70) + Math.sin(v.z * 70) + Math.sin(v.y * 70)) < 0.25 ? '#f6ecb8' : null) });
      else k.add(G.sph(0.24, 16, 12), c, { p: [0, 0.2, 0.05], s: [1.0, 0.86, 1.25], rough: 0.4, fc: (v) => (Math.sin(Math.atan2(v.x, v.y - 0.2) * 9 + Math.sin(v.z * 30) * 0.8) > 0.15 ? '#1f5a24' : null) });
    }
  },
  melone(k, s, c) { CROP_BUILD.arbuzs(k, s, c, true); },
  lavanda(k, s, c) {
    blades(k, 10, 0.25 * s + 0.08, 0.012, '#8aa88a', { spread: 0.45, curl: 0.1, seed: 9 });
    if (s === 1) for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, x = Math.sin(a) * 0.08, z = Math.cos(a) * 0.08; stem(k, [[0, 0.05, 0], [x, 0.38, z]], 0.004, '#8aa88a'); k.add(G.caps(0.018, 0.08, 2, 6), c, { p: [x * 1.1, 0.44, z * 1.1], r: [z * 2, 0, -x * 2], rough: 0.8, sway: 1, fc: (v) => (Math.floor(v.y * 90) % 2 ? shade(c, -0.15) : null) }); }
  },
  tulpe(k, s, c) {
    for (const d of [-1, 1]) k.add(G.leaf(0.22 * s + 0.05, 0.06, { rows: 4, shape: 'blade', fold: 0.5, bend: 0.25 }), LEAF, { r: [0.35, d * Math.PI / 2, 0], ro: 'YXZ', rough: 0.6, sway: sw(0.3) });
    stem(k, [[0, 0, 0], [0.01, 0.42 * s + 0.05, 0]], 0.007);
    if (s === 1) { const y = 0.47; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; k.add(G.leaf(0.09, 0.055, { rows: 3, fold: 0.6, bend: -0.35 }), i % 2 ? c : shade(c, -0.1), { p: [0.01, y - 0.02, 0], r: [0.25, a, 0], ro: 'YXZ', rough: 0.45, sway: 1 }); } }
    else k.add(G.sph(0.022, 7, 5), '#7ab84a', { p: [0.01, 0.31, 0], s: [1, 1.6, 1] });
  },
  brokolis(k, s, c) {
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; k.add(G.leaf(0.2 * s + 0.06, 0.09 * s + 0.03, { rows: 3, fold: 0.3, bend: 0.2 }), '#3f7a52', { p: [0, 0.02, 0], r: [0.75, a, 0], ro: 'YXZ', rough: 0.6, sway: sw(0.3) }); }
    stem(k, [[0, 0, 0], [0, 0.32 * s, 0]], 0.025, '#7aa86a');
    if (s === 1) for (let i = 0; i < 7; i++) { const a = i / 6 * 6.28, d = i ? 0.06 : 0; k.add(G.blob(0.055, 1, 0.25, i), c, { p: [Math.sin(a) * d, 0.36 + (i ? 0 : 0.03), Math.cos(a) * d], rough: 0.85, jit: 0.15 }); }
  },
  rabarbers(k, s, c) {
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28, L = 0.28 * s + 0.08, tip = [Math.sin(a) * L * 0.8, L, Math.cos(a) * L * 0.8]; stem(k, [[0, 0, 0], tip], 0.016, c, { rough: 0.4 }); k.add(G.leaf(0.26 * s + 0.08, 0.3 * s + 0.08, { rows: 3, shape: 'heart', fold: 0.1, bend: -0.2 }), i % 2 ? LEAF : LEAF_D, { p: tip, r: [1.3, a, 0], ro: 'YXZ', rough: 0.7, sway: sw(0.6) }); }
  },
  spargelis(k, s, c) {
    const R = rng(4);
    for (let i = 0; i < 7; i++) { const a = R() * 6.28, d = R() * 0.07, h = (0.16 + R() * 0.2) * (s + 0.1); const x = Math.sin(a) * d, z = Math.cos(a) * d; k.add(G.tube([[x, 0, z], [x, h, z]], [0.015, 0.012], 6, { div: 8, capB: true }), c, { rough: 0.5, sway: 0.3, vc: (v) => (v.y > h * 0.86 ? '#8a4aa8' : (Math.floor(v.y * 28) % 3 === 0 ? shade(c, -0.15) : null)) }); }
  },
  roze(k, s, c) {
    for (let i = 0; i < 4; i++) { const a = i * 1.6, tip = [Math.sin(a) * 0.08, 0.38 * s + 0.08, Math.cos(a) * 0.08]; stem(k, [[0, 0, 0], tip], 0.008, '#4a7a2a'); for (let j = 0; j < 3; j++) k.add(G.leaf(0.06, 0.04, { rows: 2 }), LEAF_D, { p: [tip[0] * (0.4 + j * 0.2), tip[1] * (0.4 + j * 0.2), tip[2] * (0.4 + j * 0.2)], r: [1.1, a + j * 2, 0], ro: 'YXZ', rough: 0.6, sway: sw(0.5) }); if (s === 1 && i < 3) { for (let p = 0; p < 7; p++) { const b = p * 2.4, rr = 0.012 + p * 0.005; k.add(G.leaf(0.045 + p * 0.004, 0.045, { rows: 2, fold: 0.6, bend: -0.5 }), p < 3 ? shade(c, -0.15) : c, { p: [tip[0] + Math.sin(b) * rr * 0.3, tip[1] + 0.01, tip[2] + Math.cos(b) * rr * 0.3], r: [0.15 + p * 0.12, b, 0], ro: 'YXZ', rough: 0.5, sway: 1 }); } } }
  },
  ananass(k, s, c) {
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; k.add(G.leaf(0.28 * s + 0.08, 0.035, { rows: 3, shape: 'blade', fold: 0.5, bend: 0.25 }), i % 2 ? '#5a8a6a' : '#4a7a5a', { r: [0.6 + (i % 3) * 0.15, a, 0], ro: 'YXZ', rough: 0.55, sway: sw(0.4) }); }
    if (s === 1) {
      k.add(G.sph(0.09, 12, 10), c, { p: [0, 0.22, 0], s: [1, 1.35, 1], rough: 0.5, fc: (v) => (Math.sin(Math.atan2(v.x, v.z) * 6 + v.y * 60) * Math.sin(Math.atan2(v.x, v.z) * 6 - v.y * 60) > 0.3 ? '#a06a2a' : null) });
      for (let i = 0; i < 7; i++) k.add(G.leaf(0.12, 0.025, { rows: 2, shape: 'blade', fold: 0.5 }), '#4a7a5a', { p: [0, 0.33, 0], r: [0.35, i * 0.9, 0], ro: 'YXZ', rough: 0.55 });
    }
  },
  zemesrieksti(k, s, c) {
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28, tip = [Math.sin(a) * 0.12 * s, 0.1 * s + 0.02, Math.cos(a) * 0.12 * s]; stem(k, [[0, 0, 0], tip], 0.005); for (const d of [-1, 1]) k.add(G.leaf(0.05 * s + 0.02, 0.035 * s + 0.01, { rows: 2, shape: 'round' }), d > 0 ? LEAF : LEAF_D, { p: tip, r: [1.2, a + d * 0.6, 0], ro: 'YXZ', rough: 0.6, sway: sw(0.2) }); }
    if (s === 1) { for (let i = 0; i < 3; i++) flower(k, Math.sin(i * 2) * 0.08, 0.14, Math.cos(i * 2) * 0.08, 0.018, '#f6c81a', '#e8a010', 5); for (let i = 0; i < 4; i++) k.add(G.caps(0.022, 0.035, 2, 6), c, { p: [Math.sin(i * 1.6 + 0.3) * 0.17, 0.02, Math.cos(i * 1.6 + 0.3) * 0.17], r: [Math.PI / 2, i, 0], ro: 'YXZ', rough: 0.85, fc: (v) => (Math.floor((v.x + v.z) * 120) % 3 === 0 ? shade(c, -0.15) : null) }); }
  },
  magone(k, s, c) {
    rosette(k, 5, 0.09, 0.04, LEAF_D, { tilt: 1.0, h: 0.12 });
    for (let i = 0; i < 3; i++) { const a = i * 2.1, x = Math.sin(a) * 0.04, z = Math.cos(a) * 0.04, h = (0.42 + i * 0.06) * (s + 0.05); stem(k, [[0, 0, 0], [x * 0.5, h * 0.6, z * 0.5], [x, h, z]], 0.005);
      if (s === 1) { for (let p = 0; p < 4; p++) k.add(G.leaf(0.06, 0.07, { rows: 3, shape: 'round', fold: 0.35, bend: -0.5 }), p % 2 ? c : shade(c, -0.08), { p: [x, h, z], r: [0.75, p * 1.57 + a, 0], ro: 'YXZ', rough: 0.45, sway: 1 }); k.add(G.sph(0.016, 7, 5), '#1a1a1a', { p: [x, h + 0.015, z], rough: 0.5 }); }
      else k.add(G.sph(0.022, 7, 5), '#8ab86a', { p: [x, h, z], s: [1, 1.3, 1], sway: 1 }); }
  },
  vinogas(k, s, c) {
    for (const x of [-0.35, 0.35]) k.add(G.cyl(0.02, 0.025, 0.95, 6), '#9a7448', { p: [x, 0.47, 0], rough: 0.9 });
    for (const y of [0.45, 0.8]) rod(k, [-0.35, y, 0], [0.35, y, 0], 0.003, '#8a8a8a', { seg: 3, metal: 0.6, rough: 0.4 });
    k.add(G.tube([[-0.34, 0.1, 0], [-0.2, 0.45, 0.01], [0, 0.48, 0], [0.2, 0.8, 0], [0.34, 0.8, 0]], 0.012, 5, { div: 3 }), '#7a5a3a', { rough: 0.9 });
    const lf = G.leaf(0.13, 0.13, { rows: 3, shape: 'heart', fold: 0.1, bend: -0.15 });
    for (let i = 0; i < (s === 1 ? 9 : 6); i++) { const x = -0.3 + (i % 5) * 0.15, y = i < 5 ? 0.47 : 0.82; k.add(lf, i % 2 ? LEAF : LEAF_D, { p: [x, y, 0.02], r: [0.15, (i % 2 ? 0.3 : -0.3), 0], ro: 'YXZ', rough: 0.7, sway: 0.6 }); }
    if (s === 1) for (const [bx, by] of [[-0.2, 0.42], [0.1, 0.42], [-0.05, 0.77], [0.25, 0.77]]) { const R = rng(Math.round(bx * 100 + by * 10)); for (let j = 0; j < 9; j++) { const row = Math.floor(Math.sqrt(j * 2)); berry(k, bx + (R() - 0.5) * 0.06 * (3 - row) / 2, by - 0.03 - row * 0.035, 0.05 + R() * 0.02, 0.019, c, { rough: 0.25 }); } }
  },
  varaviksne(k, s, c) {
    stem(k, [[0, 0, 0], [0.01, 0.5 * s + 0.08, 0]], 0.008);
    for (const d of [-1, 1]) k.add(G.leaf(0.13, 0.05, { rows: 3 }), LEAF, { p: [0, 0.12, 0], r: [0.8, d * Math.PI / 2, 0], ro: 'YXZ', rough: 0.6, sway: sw(0.5) });
    if (s === 1) { const cols = ['#ff4a4a', '#ff9a2a', '#ffe02a', '#4ac84a', '#3a8aff', '#8a5aff', '#ff5ab8']; const y = 0.56; cols.forEach((col, i) => { const a = i / 7 * 6.28; k.add(G.leaf(0.11, 0.06, { rows: 3, shape: 'round', fold: 0.2, bend: -0.2 }), col, { p: [0.01, y, 0], q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a)), rough: 0.4, emit: 0.12, sway: 1 }); }); k.add(G.sph(0.03, 9, 7), '#fff6c0', { p: [0.01, y, 0.02], rough: 0.4, emit: 0.4 }); }
  },
  zvaigzne(k, s, c) {
    CROP_BUILD.paprika(k, s, c, false);
    if (s === 1) {
      k.parts.splice(k.parts.length - 6, 6);
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; k.add(G.star(0.06, 0.03, 0.035, 5, 0.012), c, { p: [Math.sin(a) * 0.11, 0.2 + i * 0.07, Math.cos(a) * 0.11], r: [0, a, 0], rough: 0.25, emit: 0.35 }); }
    }
  },
};

/** sprout used for every crop at stage 0 */
function sprout(k) {
  stem(k, [[0, 0, 0], [0, 0.07, 0]], 0.006);
  for (const d of [-1, 1]) k.add(G.leaf(0.05, 0.035, { rows: 2, shape: 'round', fold: 0.3 }), '#7acb4a', { p: [0, 0.07, 0], r: [1.2, d * Math.PI / 2, 0], ro: 'YXZ', rough: 0.6, sway: 0.3 });
}
export function cropGeometry(crop, stage, color) {
  const key = crop + '|' + stage + '|' + (color || '');
  if (_cropCache.has(key)) return _cropCache.get(key);
  const k = new Kit(crop.length * 17 + stage);
  if (stage === 0) sprout(k);
  else (CROP_BUILD[crop] || CROP_BUILD.salati)(k, stage === 2 ? 1 : 0.65, color || (CROPS[crop] && CROPS[crop].color) || '#e8382a');
  const g = k.geometry();
  _cropCache.set(key, g);
  return g;
}
export function buildCrop(crop, stage, color) {
  const m = new THREE.Mesh(cropGeometry(crop, stage, color), toyMaterial());
  m.castShadow = true; m.name = 'crop-' + crop;
  const g = new THREE.Group(); g.add(m); return g;
}

// =====================================================================
//  Berries, mushrooms, pick-ups, fishing gear and garden decor
// =====================================================================
export const MUSHROOMS = {
  baravika: { id: 'baravika', name: 'Baravika', cap: '#8a5228', stem: '#efe6d2', h: 0.42, r: 0.3 },
  gailene: { id: 'gailene', name: 'Gailene', cap: '#f2b21e', stem: '#f2b21e', h: 0.24, r: 0.22, funnel: true },
  musmire: { id: 'musmire', name: 'Mušmire', cap: '#e02a1e', stem: '#f8f4ea', h: 0.5, r: 0.28, dots: true },
};
export const DECOR = {
  pukupods: 'Puķu pods', rukis: 'Dārza rūķis', burits: 'Putnu būrītis', solins: 'Soliņš', laterna: 'Laterna', biedeklis: 'Putnubiedēklis',
  karogs: 'Latvijas karogs', struklaka: 'Strūklaka', sene: 'Dārza sēne', vejdzirnavas: 'Mazās vējdzirnavas', ziedudobe: 'Ziedu dobe',
};

export function buildBerryBush(kind) {
  const k = new Kit(81 + kind.length); k.groundAO = 0.3;
  const bk = new Kit(82 + kind.length);
  if (kind === 'mellene') {
    for (const [x, z, s] of [[0, 0, 0.3], [0.22, 0.1, 0.22], [-0.2, 0.12, 0.24], [0.05, -0.22, 0.22]]) k.add(G.blob(s, 1, 0.2, x * 9 + z), '#3f7a2e', { p: [x, s * 0.75, z], s: [1, 0.75, 1], rough: 0.85, grad: [0.65, 1.1], sway: 0.3, jit: 0.1 });
    const R = rng(4); for (let i = 0; i < 16; i++) { const a = R() * 6.28, r = 0.18 + R() * 0.16; bk.add(G.sph(0.032, 8, 6), '#2a3a8a', { p: [Math.sin(a) * r, 0.18 + R() * 0.2, Math.cos(a) * r], rough: 0.45, vc: (v) => (v.y > 0 && R() > 0.97 ? '#8a9ae0' : null) }); }
  } else if (kind === 'avene') {
    for (let i = 0; i < 6; i++) { const a = i * 1.05, top = [Math.sin(a) * 0.35, 1.0 + (i % 3) * 0.12, Math.cos(a) * 0.3]; k.add(G.tube([[0, 0, 0], [top[0] * 0.5, top[1] * 0.55, top[2] * 0.5], top], [0.025, 0.018, 0.01], 5, { div: 2 }), '#8a5a3a', { rough: 0.9 });
      for (let j = 0; j < 5; j++) { const t = 0.3 + j * 0.15; k.add(G.leaf(0.17, 0.12, { rows: 3, fold: 0.3 }), j % 2 ? '#4f9a38' : '#3f8a2e', { p: [top[0] * t, top[1] * t, top[2] * t], r: [1.1, a + j * 1.9, 0], ro: 'YXZ', rough: 0.7, sway: 0.6 }); } }
    const R = rng(6); for (let i = 0; i < 14; i++) { const a = R() * 6.28, r = 0.2 + R() * 0.25, x = Math.sin(a) * r, y = 0.45 + R() * 0.6, z = Math.cos(a) * r; for (let j = 0; j < 7; j++) bk.add(G.sph(0.014, 5, 4), '#e02a4a', { p: [x + Math.sin(j) * 0.015, y + (j % 3 - 1) * 0.015, z + Math.cos(j) * 0.015], rough: 0.35 }); }
  } else {
    k.add(G.blob(0.55, 1, 0.15, 3), '#4a6a2a', { p: [0, 0.02, 0], s: [1, 0.12, 1], rough: 0.9, sway: 0.2 });
    const R = rng(8); for (let i = 0; i < 40; i++) { const a = R() * 6.28, r = R() * 0.5; k.add(G.leaf(0.04, 0.02, { rows: 2 }), '#3a6a24', { p: [Math.sin(a) * r, 0.06, Math.cos(a) * r], r: [1.3, R() * 6.28, 0], ro: 'YXZ', rough: 0.7 }); }
    for (let i = 0; i < 18; i++) { const a = R() * 6.28, r = R() * 0.45; bk.add(G.sph(0.028, 7, 5), '#c8102a', { p: [Math.sin(a) * r, 0.1, Math.cos(a) * r], rough: 0.25 }); }
  }
  const root = k.build({ name: 'bush-' + kind });
  const berries = bk.build({ name: 'berries' }); berries.name = 'berries'; root.add(berries);
  return { root, berries };
}

export function buildMushroom(def) {
  const d = typeof def === 'string' ? MUSHROOMS[def] : def;
  const k = new Kit(83 + d.id.length); k.groundAO = 0.08;
  const { h, r } = d;
  if (d.funnel) {
    k.add(G.lathe([[0.04, 0], [0.05, h * 0.5], [r * 0.6, h * 0.85], [r, h], [r * 0.95, h * 1.04], [r * 0.5, h * 0.95], [0, h * 0.9]], 18), d.cap, { rough: 0.6, grad: [0.85, 1.08], fc: (v) => (v.y < h * 0.95 && v.y > h * 0.4 && Math.floor(Math.atan2(v.x, v.z) * 6) % 2 ? shade(d.cap, -0.1) : null) });
    const p = k.parts[k.parts.length - 1].geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), w = 1 + 0.08 * Math.sin(a * 5); if (p.getY(i) > h * 0.8) { p.setX(i, x * w); p.setZ(i, z * w); } }
  } else {
    k.add(G.lathe([[0.06 * r / 0.3 * 1.6, 0], [0.09 * r / 0.3 * 1.6, h * 0.25], [0.085 * r / 0.3 * 1.5, h * 0.6], [0.06 * r / 0.3 * 1.4, h * 0.82], [0, h * 0.82]], 14), d.stem, { rough: 0.7, grad: [0.8, 1.05] });
    if (d.dots) k.add(G.torus(0.065, 0.012, 4, 14), d.stem, { p: [0, h * 0.62, 0], r: [Math.PI / 2, 0, 0], rough: 0.7 });
    k.add(G.lathe([[r * 0.25, h * 0.78], [r * 0.8, h * 0.78], [r, h * 0.84], [r * 0.98, h * 0.95], [r * 0.8, h * 1.07], [r * 0.4, h * 1.14], [0, h * 1.16]], 22), d.cap, { rough: d.dots ? 0.3 : 0.55, grad: [0.7, 1.08] });
    k.add(G.disc(r * 0.82, 20), d.dots ? '#f2ecd8' : '#d9c18a', { p: [0, h * 0.785, 0], r: [Math.PI / 2, 0, 0], rough: 0.9, fc: (v) => (Math.floor(Math.atan2(v.x, v.z) * 12) % 2 ? null : shade(d.dots ? '#f2ecd8' : '#d9c18a', -0.1)) });
    if (d.dots) { const R = rng(2); for (let i = 0; i < 11; i++) { const a = R() * 6.28, t = 0.25 + R() * 0.6; const y = h * (1.16 - t * t * 0.32), rr = r * t * 0.98; k.add(G.sph(0.028, 7, 5), '#fbf8ef', { p: [Math.sin(a) * rr, y, Math.cos(a) * rr], s: [1, 0.45, 1], rough: 0.7 }); } }
  }
  k.add(G.blob(0.07, 1, 0.3, 4), '#5a8a3a', { p: [r * 0.6, 0.02, r * 0.3], s: [1, 0.35, 1], rough: 0.9 });
  return k.build({ name: 'mushroom-' + d.id });
}

export function buildStar() {
  const k = new Kit(84);
  k.add(G.star(0.5, 0.22, 0.14, 5, 0.07), '#f2c12e', { rough: 0.25, metal: 0.85, emit: 0.22 });
  for (const s of [-1, 1]) k.add(G.sph(0.035, 8, 6), '#3a2410', { p: [s * 0.1, 0.04, 0.14], s: [1, 1.3, 0.6], rough: 0.2 });
  k.add(G.torus(0.05, 0.012, 4, 10, Math.PI), '#3a2410', { p: [0, -0.06, 0.135], r: [0, 0, Math.PI] });
  for (const s of [-1, 1]) k.add(G.sph(0.04, 8, 5), '#ff9a6a', { p: [s * 0.2, -0.04, 0.12], s: [1, 0.6, 0.3], rough: 0.8 });
  return k.build({ name: 'star' });
}
export function buildHeart() {
  const k = new Kit(85);
  k.add(G.heart(0.32, 0.08, 0.05), '#ff4a7a', { p: [0, 0.03, 0], rough: 0.25, emit: 0.18 });
  k.add(G.sph(0.06, 8, 6), '#ffffff', { p: [-0.13, 0.13, 0.08], s: [1, 0.6, 0.3], emit: 0.8 });
  return k.build({ name: 'heart' });
}
export function buildScroll() {
  const k = new Kit(86);
  k.add(G.cyl(0.11, 0.11, 0.55, 16), '#f2e6c8', { r: [0, 0, Math.PI / 2], rough: 0.85, vc: (v) => (Math.abs(v.x) > 0.25 ? '#e2d2aa' : null) });
  for (const s of [-1, 1]) k.add(G.cyl(0.035, 0.035, 0.05, 8), '#8a5a32', { p: [s * 0.3, 0, 0], r: [0, 0, Math.PI / 2], rough: 0.7 });
  k.add(G.torus(0.116, 0.014, 5, 16), '#d8342a', { r: [0, Math.PI / 2, 0], rough: 0.5 });
  k.add(G.cyl(0.04, 0.04, 0.02, 12), '#b8241a', { p: [0, 0, 0.12], r: [Math.PI / 2, 0, 0], rough: 0.4 });
  const g = k.build({ name: 'scroll' }); return g;
}
export function buildRod() {
  const k = new Kit(87);
  const pts = [[0, 0, -0.55], [0, 0.35, 0.3], [0, 0.85, 1.05], [0, 1.25, 1.55]];
  k.add(G.tube(pts, [0.025, 0.018, 0.011, 0.006], 6, { div: 3 }), '#3a2a1c', { rough: 0.4, vc: (v) => (v.z < -0.2 ? '#c4935a' : null) });
  k.add(G.cyl(0.05, 0.05, 0.05, 12), '#c9cfd4', { p: [0.04, 0.05, -0.32], r: [0, 0, Math.PI / 2], rough: 0.2, metal: 1 });
  k.add(G.box(0.05, 0.012, 0.012), '#2a2a2a', { p: [0.075, 0.05, -0.32], rough: 0.5 });
  for (const t of [0.2, 0.5, 0.85]) k.add(G.torus(0.012, 0.003, 3, 8), '#c9cfd4', { p: [0, 0.08 + t * 1.1, -0.3 + t * 1.75], rough: 0.2, metal: 1 });
  const g = k.build({ name: 'rod' });
  const tip = new THREE.Object3D(); tip.position.set(0, 1.25, 1.55); g.add(tip); g.userData.tip = tip;
  return g;
}
export function buildBobber() {
  const k = new Kit(88);
  k.add(G.sph(0.06, 14, 10), '#ffffff', { rough: 0.25, vc: (v) => (v.y > 0 ? '#e8282a' : null) });
  k.add(G.cyl(0.006, 0.006, 0.1, 5), '#e8282a', { p: [0, 0.1, 0], rough: 0.3 });
  k.add(G.sph(0.01, 6, 4), '#f6d64a', { p: [0, 0.15, 0], emit: 0.4 });
  return k.build({ name: 'bobber' });
}

export function buildDecor(id) {
  const k = new Kit(89 + id.length); k.groundAO = 0.25;
  let spin = null;
  const FL = ['#ff6b8a', '#ffd84a', '#ffffff', '#b06ae0', '#ff8a3a'];
  switch (id) {
    case 'pukupods': {
      k.add(G.lathe([[0, 0], [0.2, 0], [0.24, 0.05], [0.31, 0.38], [0.33, 0.4], [0.33, 0.46], [0.29, 0.46], [0.28, 0.42], [0, 0.42]], 20), '#d47a4a', { rough: 0.85, grad: [0.75, 1.05], vc: (v) => (v.y > 0.385 && Math.hypot(v.x, v.z) > 0.285 ? '#c26a3c' : null) });
      k.add(G.cyl(0.285, 0.285, 0.02, 18), '#4a3424', { p: [0, 0.43, 0], rough: 1 });
      k.add(G.blob(0.2, 1, 0.25, 2), '#4f9a38', { p: [0, 0.5, 0], s: [1.4, 0.6, 1.4], rough: 0.8, sway: 0.3 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28, r = i ? 0.17 : 0; const x = Math.sin(a) * r, z = Math.cos(a) * r, y = 0.62 + (i ? 0 : 0.08); rod(k, [x * 0.5, 0.45, z * 0.5], [x, y, z], 0.008, '#4a8a2a', { seg: 4, sway: 0.5 }); k.add(flowerGeo(0.08, 6, 0.018), FL[i % 5], { p: [x, y + 0.02, z], r: [-Math.PI / 2 + 0.2, a, 0], ro: 'YXZ', rough: 0.55, sway: 0.6 }); k.add(G.sph(0.025, 7, 5), '#f2a81a', { p: [x, y + 0.04, z], rough: 0.6 }); }
      break;
    }
    case 'rukis': {
      k.add(G.lathe([[0, 0], [0.22, 0], [0.22, 0.04], [0.19, 0.3], [0.15, 0.5], [0, 0.52]], 16), '#3a6ad4', { rough: 0.6, grad: [0.8, 1.05] });
      k.add(G.cyl(0.2, 0.21, 0.05, 16), '#5a3a22', { p: [0, 0.28, 0], rough: 0.6 });
      k.add(G.rbox(0.07, 0.05, 0.02, 0.008), '#f2c12e', { p: [0, 0.28, 0.2], metal: 1, rough: 0.3 });
      k.add(G.sph(0.14, 14, 10), '#f6c8a6', { p: [0, 0.62, 0.02], rough: 0.6 });
      k.add(G.sph(0.04, 8, 6), '#f29a8a', { p: [0, 0.6, 0.155], rough: 0.5 });
      for (const s of [-1, 1]) { k.add(G.sph(0.018, 7, 5), '#1a1410', { p: [s * 0.05, 0.66, 0.13], rough: 0.15 }); k.add(G.sph(0.006, 4, 3), '#ffffff', { p: [s * 0.05 - 0.005, 0.668, 0.145], emit: 1 }); k.add(G.sph(0.03, 7, 5), '#f9a8a0', { p: [s * 0.09, 0.59, 0.11], s: [1, 0.6, 0.3], rough: 0.8 }); }
      k.add(G.lathe([[0.13, 0.04], [0.12, -0.1], [0.06, -0.22], [0, -0.26]], 14), '#f6f4ee', { p: [0, 0.58, 0.07], s: [1, 1, 0.75], rough: 0.95, double: true, fc: (v) => (Math.floor(v.y * 30) % 2 ? '#e8e4da' : null) });
      k.add(G.cone(0.16, 0.42, 16), '#e0402a', { p: [0, 0.92, 0], r: [-0.18, 0, 0], rough: 0.6, grad: [0.85, 1.05] });
      k.add(G.sph(0.03, 7, 5), '#f6f4ee', { p: [0, 1.12, -0.07], rough: 0.8 });
      for (const s of [-1, 1]) k.add(G.caps(0.045, 0.14, 3, 8), '#3a6ad4', { p: [s * 0.21, 0.36, 0.04], r: [-0.3, 0, s * 0.35], rough: 0.6 });
      for (const s of [-1, 1]) k.add(G.sph(0.06, 8, 6), '#3a2a1a', { p: [s * 0.08, 0.03, 0.06], s: [1, 0.6, 1.5], rough: 0.7 });
      break;
    }
    case 'burits': {
      k.add(G.cyl(0.04, 0.05, 1.9, 7), '#8a6440', { p: [0, 0.95, 0], rough: 0.9 });
      k.add(G.rbox(0.3, 0.32, 0.3, 0.03), '#d9a066', { p: [0, 2.05, 0], rough: 0.8, fc: (v) => (Math.floor((v.y + 3) / 0.08) % 2 ? '#c98f58' : null) });
      for (const s of [-1, 1]) k.add(G.rbox(0.42, 0.03, 0.26, 0.01), '#b8432e', { p: [s * 0.1, 2.3, 0], r: [0, 0, -s * 0.7], rough: 0.7 });
      k.add(G.cyl(0.055, 0.055, 0.02, 14), '#2a1a10', { p: [0, 2.08, 0.152], r: [Math.PI / 2, 0, 0], rough: 0.9 });
      k.add(G.cyl(0.01, 0.01, 0.08, 5), '#5a3a22', { p: [0, 1.98, 0.19], r: [Math.PI / 2, 0, 0] });
      k.add(G.sph(0.05, 9, 7), '#3a8ad8', { p: [0.08, 2.37, 0.04], s: [1, 0.9, 1.3], rough: 0.5 });
      k.add(G.cone(0.012, 0.03, 5), '#f2a81a', { p: [0.08, 2.38, 0.11], r: [Math.PI / 2, 0, 0] });
      break;
    }
    case 'solins': {
      for (let i = 0; i < 3; i++) k.add(G.rbox(1.5, 0.05, 0.14, 0.02), '#c9925a', { p: [0, 0.45, -0.17 + i * 0.16], rough: 0.8 });
      for (let i = 0; i < 2; i++) k.add(G.rbox(1.5, 0.12, 0.04, 0.02), '#c9925a', { p: [0, 0.68 + i * 0.16, -0.25], r: [-0.12, 0, 0], rough: 0.8 });
      for (const s of [-1, 1]) {
        k.add(G.tube([[s * 0.65, 0, 0.18], [s * 0.65, 0.45, 0.12], [s * 0.67, 0.6, 0.18], [s * 0.66, 0.62, -0.05]], 0.03, 6, { div: 2 }), '#2c2e33', { rough: 0.4, metal: 0.6 });
        k.add(G.tube([[s * 0.65, 0, -0.2], [s * 0.65, 0.5, -0.22], [s * 0.65, 0.92, -0.3]], 0.03, 6, { div: 2 }), '#2c2e33', { rough: 0.4, metal: 0.6 });
      }
      break;
    }
    case 'laterna': {
      k.add(G.cyl(0.04, 0.06, 1.7, 8), '#2a2c30', { p: [0, 0.85, 0], rough: 0.4, metal: 0.6 });
      k.add(G.lathe([[0, 0], [0.13, 0], [0.12, 0.06], [0.06, 0.12], [0, 0.12]], 10), '#2a2c30', { rough: 0.4, metal: 0.6 });
      k.add(G.cyl(0.1, 0.08, 0.26, 6), '#fff2b0', { p: [0, 1.85, 0], rough: 0.3, emit: 1.6 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; k.add(G.box(0.014, 0.28, 0.014), '#2a2c30', { p: [Math.sin(a) * 0.095, 1.85, Math.cos(a) * 0.095], rough: 0.4, metal: 0.6 }); }
      k.add(G.cone(0.15, 0.14, 6), '#2a2c30', { p: [0, 2.05, 0], rough: 0.4, metal: 0.6 });
      k.add(G.cyl(0.09, 0.07, 0.04, 6), '#2a2c30', { p: [0, 1.71, 0], rough: 0.4, metal: 0.6 });
      k.add(G.sph(0.025, 6, 5), '#2a2c30', { p: [0, 2.14, 0], metal: 0.6, rough: 0.4 });
      break;
    }
    case 'biedeklis': {
      k.add(G.cyl(0.04, 0.05, 1.9, 6), '#8a6440', { p: [0, 0.95, 0], rough: 0.9 });
      k.add(G.cyl(0.035, 0.035, 1.5, 6), '#8a6440', { p: [0, 1.4, 0], r: [0, 0, Math.PI / 2], rough: 0.9 });
      k.add(G.lathe([[0, -0.4], [0.22, -0.38], [0.24, -0.1], [0.22, 0.2], [0.12, 0.3], [0, 0.3]], 12), '#e8603a', { p: [0, 1.3, 0], s: [1, 1, 0.75], rough: 0.9, fc: (v) => (Math.floor((v.x + 1) / 0.08) % 2 ^ Math.floor((v.y + 3) / 0.08) % 2 ? '#c64a2a' : null) });
      for (const s of [-1, 1]) { k.add(G.cyl(0.07, 0.09, 0.32, 8), '#e8603a', { p: [s * 0.32, 1.4, 0], r: [0, 0, Math.PI / 2], rough: 0.9 }); for (let i = 0; i < 4; i++) k.add(G.cone(0.02, 0.12, 4), '#e8c66a', { p: [s * (0.53 + 0.04), 1.4 + (i - 1.5) * 0.03, (i % 2) * 0.02], r: [0, 0, -s * (Math.PI / 2 + (i - 1.5) * 0.3)], rough: 0.9 }); }
      k.add(G.sph(0.17, 12, 9), '#f2d9a6', { p: [0, 1.82, 0], rough: 0.9 });
      for (const s of [-1, 1]) k.add(G.box(0.05, 0.012, 0.01), '#3a2a1a', { p: [s * 0.06, 1.86, 0.165], r: [0, 0, s * 0.7] });
      k.add(G.torus(0.05, 0.008, 3, 8, Math.PI), '#b8432e', { p: [0, 1.76, 0.16], r: [0, 0, Math.PI] });
      k.add(G.cyl(0.4, 0.4, 0.025, 16), '#e8c66a', { p: [0, 1.92, 0], rough: 0.95, fc: (v) => (Math.floor((Math.atan2(v.x, v.z) + Math.hypot(v.x, v.z) * 8) * 4) % 2 ? '#d4b058' : null) });
      k.add(G.cyl(0.17, 0.19, 0.17, 14), '#e8c66a', { p: [0, 2.02, 0], rough: 0.95 });
      k.add(G.cyl(0.192, 0.192, 0.045, 14), '#c8302a', { p: [0, 1.97, 0], rough: 0.7 });
      break;
    }
    case 'karogs': {
      k.add(G.cyl(0.035, 0.045, 3.6, 8), '#e9e9e4', { p: [0, 1.8, 0], rough: 0.3, metal: 0.4 });
      k.add(G.sph(0.06, 10, 8), '#e9c24a', { p: [0, 3.64, 0], metal: 1, rough: 0.25 });
      const fl = new THREE.PlaneGeometry(1.2, 0.6, 12, 5); const p = fl.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 0.6; p.setZ(i, Math.sin(x * 4.5) * 0.06 * x); }
      fl.computeVertexNormals();
      k.add(fl, '#9e3039', { p: [0.62, 3.25, 0], double: true, rough: 0.8, sway: (v) => Math.min(1, v.x * 1.4) * 1.5, vc: (v) => (Math.abs(v.y - 3.25) < 0.06 ? '#f7f4ee' : null) });
      break;
    }
    case 'struklaka': {
      k.add(G.lathe([[0, 0], [0.9, 0], [0.92, 0.1], [0.9, 0.4], [0.82, 0.42], [0.8, 0.12], [0, 0.12]], 22), '#b8b2a4', { rough: 0.9, fc: (v) => (Math.floor(Math.atan2(v.x, v.z) * 3.5) % 2 ? '#a8a294' : null) });
      k.add(G.cyl(0.8, 0.8, 0.02, 22), '#5ab8e0', { p: [0, 0.34, 0], rough: 0.08, metal: 0.2, emit: 0.12 });
      k.add(G.lathe([[0, 0], [0.13, 0], [0.09, 0.6], [0.1, 0.9], [0, 0.9]], 10), '#c2bcb0', { rough: 0.85 });
      k.add(G.lathe([[0, 0.9], [0.45, 0.9], [0.47, 1.02], [0.42, 1.05], [0, 0.98]], 18), '#c2bcb0', { rough: 0.85 });
      k.add(G.cyl(0.4, 0.4, 0.02, 18), '#7ad0f0', { p: [0, 1.03, 0], rough: 0.08, emit: 0.15 });
      k.add(G.lathe([[0, 1.0], [0.05, 1.05], [0.06, 1.45], [0.03, 1.55], [0, 1.6]], 10), '#c2bcb0', { rough: 0.85 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; k.add(G.tube([[0, 1.58, 0], [Math.sin(a) * 0.2, 1.62, Math.cos(a) * 0.2], [Math.sin(a) * 0.38, 1.08, Math.cos(a) * 0.38]], [0.02, 0.016, 0.01], 5, { div: 3 }), '#bfe8fa', { rough: 0.05, emit: 0.35, sway: 0.15 }); }
      break;
    }
    case 'sene': {
      k.add(G.lathe([[0.3, 0], [0.32, 0.25], [0.28, 0.55], [0.26, 0.62], [0, 0.62]], 16), '#f4efe2', { rough: 0.8, grad: [0.8, 1.05] });
      k.add(G.rbox(0.18, 0.28, 0.04, 0.03), '#8a5a32', { p: [0, 0.16, 0.3], rough: 0.8 });
      k.add(G.cyl(0.07, 0.07, 0.04, 12), '#8fc8e8', { p: [0.15, 0.4, 0.25], r: [Math.PI / 2, 0, 0.5], rough: 0.1 });
      k.add(G.lathe([[0.15, 0.55], [0.62, 0.55], [0.66, 0.62], [0.6, 0.78], [0.42, 0.95], [0.18, 1.04], [0, 1.05]], 20), '#e8302a', { rough: 0.35, grad: [0.75, 1.08] });
      k.add(G.disc(0.6, 18), '#f2e6c8', { p: [0, 0.555, 0], r: [Math.PI / 2, 0, 0], rough: 0.9 });
      const R = rng(5); for (let i = 0; i < 10; i++) { const a = R() * 6.28, t = 0.2 + R() * 0.7, rr = 0.62 * t; k.add(G.sph(0.06, 8, 5), '#fbf8ef', { p: [Math.sin(a) * rr, 1.05 - t * t * 0.42, Math.cos(a) * rr], s: [1, 0.4, 1], rough: 0.7 }); }
      break;
    }
    case 'vejdzirnavas': {
      k.add(G.lathe([[0, 0], [0.42, 0], [0.38, 0.6], [0.3, 1.45], [0, 1.45]], 8), '#f4efe2', { rough: 0.85, flat: true, fc: (v) => (v.y < 0.12 ? '#c2bcb0' : null) });
      k.add(G.cone(0.42, 0.45, 8), '#d8432e', { p: [0, 1.65, 0], rough: 0.6, flat: true });
      k.add(G.rbox(0.22, 0.38, 0.04, 0.03), '#7a4a2a', { p: [0, 0.19, 0.39], r: [-0.05, 0, 0], rough: 0.8 });
      k.add(G.cyl(0.08, 0.08, 0.04, 10), '#8fc8e8', { p: [0, 0.95, 0.33], r: [Math.PI / 2 - 0.08, 0, 0], rough: 0.1 });
      const hub = k.group('hub', k.root, [0, 1.42, 0.42]);
      k.add(G.cyl(0.06, 0.06, 0.12, 10), '#5a3a22', { bone: hub, r: [Math.PI / 2, 0, 0] });
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * 6.28 + 0.4, c = Math.cos(a), s = Math.sin(a);
        k.add(G.box(0.05, 0.8, 0.03), '#7a4a2a', { bone: hub, p: [s * 0.4, c * 0.4, 0.04], r: [0, 0, -a], rough: 0.85 });
        k.add(G.box(0.18, 0.6, 0.015), '#f4efe2', { bone: hub, p: [s * 0.48 + c * 0.1, c * 0.48 - s * 0.1, 0.05], r: [0, 0, -a], rough: 0.85, double: true });
      }
      spin = hub;
      break;
    }
    case 'ziedudobe': {
      k.add(G.rbox(1.8, 0.22, 1.8, 0.08), '#8a5e38', { p: [0, 0.11, 0], rough: 0.9, fc: (v) => (Math.floor((v.y + 1) / 0.075) % 2 ? '#7a5232' : null) });
      k.add(G.box(1.6, 0.04, 1.6), '#4a3424', { p: [0, 0.22, 0], rough: 1 });
      const R = rng(11);
      for (let i = 0; i < 16; i++) {
        const x = -0.6 + (i % 4) * 0.4 + (R() - 0.5) * 0.1, z = -0.6 + Math.floor(i / 4) * 0.4 + (R() - 0.5) * 0.1, h = 0.28 + R() * 0.15;
        k.add(G.blob(0.11, 1, 0.3, i), '#4f9a38', { p: [x, 0.3, z], s: [1, 0.6, 1], rough: 0.8, sway: 0.3 });
        rod(k, [x, 0.28, z], [x, h + 0.22, z], 0.007, '#4a8a2a', { seg: 4, sway: 0.6 });
        k.add(flowerGeo(0.07, 5 + (i % 2), 0.015), FL[i % 5], { p: [x, h + 0.24, z], r: [-Math.PI / 2 + 0.25, R() * 6.28, 0], ro: 'YXZ', rough: 0.55, sway: 0.8 });
        k.add(G.sph(0.022, 6, 4), '#f2a81a', { p: [x, h + 0.26, z], rough: 0.6, sway: 0.8 });
      }
      break;
    }
    default: return new THREE.Group();
  }
  const g = k.build({ name: 'decor-' + id });
  if (spin) g.userData.spin = spin;
  return g;
}

// =====================================================================
//  Registry used by the catalogue page (id → builder). Not needed in-game.
// =====================================================================
const _wrap = (o) => (o && o.isObject3D ? o : o.root || o.obj);
export function catalogue() {
  const L = [];
  const add = (cat, id, name, call, build, extra = {}) => L.push({ cat, id, name, call, build, ...extra });
  for (const [id, P] of Object.entries(SPECIES)) add('Spēlētāju dzīvnieki', id, P.name, `buildAnimal({animal:'${id}'})`, () => buildAnimal({ animal: id }), { rig: 'player', src: ['buildAnimal'] });
  for (const [id, n] of Object.entries(HATS)) add('Cepures', id, n, `buildHat('${id}')`, () => buildHat(id), { src: ['buildHat:' + id] });
  for (const [id, t] of Object.entries(TOPS)) add('Drēbes (uz lāča)', id, t.name, `buildAnimal({wear:{top:'${id}'}})`, () => buildAnimal({ animal: 'lacis', wear: { top: id } }), { rig: 'player', src: ['TOPS'] });
  for (const [slot, list] of Object.entries(WEAR)) for (const [id, n] of Object.entries(list)) {
    const fn = { glasses: 'buildGlasses', neck: 'buildNeckwear', back: 'buildBackwear', feet: 'buildShoe' }[slot];
    add('Drēbes (uz lāča)', id, n, `${fn} → wear {${slot}:'${id}'}`, () => buildAnimal({ animal: 'lacis', wear: { [slot]: id } }), { rig: 'player', src: [fn], focus: slot });
  }
  for (const [id, n] of Object.entries(NPCS)) add('Meža dzīvnieki (NPC)', id, n, `buildNPC('${id}')`, () => buildNPC(id), { rig: 'npc', src: ['buildNPC:' + id] });
  for (const [id, p] of Object.entries(PETS)) add('Mājdzīvnieki', id, p.name, `buildPet('${id}')`, () => buildPet(id), { rig: 'npc', src: ['buildPet', 'buildNPC:' + p.type] });
  if (typeof buildKart === 'function') {
    for (const [id, c, n] of [['kart_sarkana', '#e02a2a', 'Sarkana'], ['kart_zila', '#2a6ae0', 'Zila'], ['kart_zala', '#2ab04a', 'Zaļa'], ['kart_zelta', '#e8c020', 'Zelta']])
      add('Transports', id, 'Kartings — ' + n, `buildKart('${c}')`, () => buildKart(c), { rig: 'wheels', src: ['buildKart'] });
    add('Transports', 'car', 'Mašīna', 'buildCar()', () => buildCar(), { rig: 'wheels', src: ['buildCar'] });
    add('Transports', 'sled', 'Ragavas (sniega motocikls)', 'buildSled()', () => buildSled(), { src: ['buildSled'] });
    add('Transports', 'bike', 'Velosipēds', 'buildBike()', () => buildBike(), { rig: 'wheels', src: ['buildBike'] });
    add('Transports', 'bus', 'Autobuss', 'buildBus()', () => buildBus(), { rig: 'wheels', src: ['buildBus'] });
  }
  if (typeof buildCart === 'function') {
    add('Tirgus un pārdevēji', 'cart_veg', 'Ratiņi (dārzeņi)', "buildCart('#3c9a4a', false, 'veg')", () => buildCart('#3c9a4a', false, 'veg'), { src: ['buildCart'] });
    add('Tirgus un pārdevēji', 'cart_ice', 'Saldējuma ratiņi', "buildCart('#ff8fb0', true)", () => buildCart('#ff8fb0', true), { src: ['buildCart'] });
    for (const v of Object.values(VENDORS)) add('Tirgus un pārdevēji', 'stall_' + v.id, 'Būda — ' + v.title, `buildStall(VENDORS['${v.id}'])`, () => buildStall(v), { src: ['buildStall'] });
    add('Tirgus un pārdevēji', 'bunting', 'Karodziņu virtene', 'buildBunting(a, b)', () => buildBunting(new THREE.Vector3(-4, 3, 0), new THREE.Vector3(4, 3, 0)), { src: ['buildBunting'] });
  }
  if (typeof buildGardenHouse === 'function') {
    add('Sēta', 'house', 'Dārza mājiņa', 'buildGardenHouse()', () => buildGardenHouse(), { src: ['buildGardenHouse'] });
    add('Sēta', 'greenhouse', 'Siltumnīca', 'buildGreenhouse()', () => buildGreenhouse(), { src: ['buildGreenhouse'] });
    add('Sēta', 'gate', 'Vārtu arka', 'buildGateArch()', () => buildGateArch(), { src: ['buildGateArch'] });
    add('Sēta', 'fingerpost', 'Ceļa rādītājs', 'buildFingerpost(dirs)', () => buildFingerpost([[1, 0, '🏁 Sacīkšu trase'], [-1, 0, '🌲 Mežs · 🧺 Tirgus'], [0, 1, '🏡 Sēta'], [0, -1, '❄️ Ziemas zeme']]), { src: ['buildFingerpost', 'makeSignBoard'] });
    add('Sēta', 'roadsign', 'Ceļa zīme', "buildRoadSign('🌲 Mežs 120 m', '🏡 Sēta 80 m')", () => buildRoadSign('🌲 Mežs  120 m', '🏡 Sēta  80 m'), { src: ['buildRoadSign', 'makeSignBoard'] });
    add('Sēta', 'sign_wood', 'Koka izkārtne', "makeSignBoard('🌱 Sēklas', {style:'wood'})", () => makeSignBoard('🌱 Sēklas', { style: 'wood', h: 0.5 }).obj, { src: ['makeSignBoard'] });
    add('Sēta', 'sign_road', 'Tūrisma zīme', "makeSignBoard('🏘 Mežvidu ciems', {style:'road'})", () => makeSignBoard('🏘 Mežvidu ciems', { style: 'road', h: 0.6 }).obj, { src: ['makeSignBoard'] });
    add('Sēta', 'busstop', 'Autobusa pietura', "buildStop({icon:'❄️', name:'Ziemas laukums'})", () => buildStop({ icon: '❄️', name: 'Ziemas laukums' }), { src: ['buildStop'] });
  }
  if (typeof buildTree === 'function') for (const [id, n] of Object.entries(TREE_TYPES)) add('Koki', 'tree_' + id, n, `buildTree('${id}')`, () => buildTree(id), { src: ['treeKit:' + id, 'buildTree', 'buildForest'] });
  if (typeof buildCrop === 'function') {
    add('Dārza kultūras', 'sprout', 'Dīglis (0. stadija)', 'buildCrop(id, 0)', () => buildCrop('burkans', 0), { src: ['sprout', 'cropGeometry'] });
    for (const [id, c] of Object.entries(CROPS)) for (const st of [1, 2]) add('Dārza kultūras', `${id}_${st}`, `${c.name} — ${st === 1 ? 'aug' : 'gatavs'}`, `buildCrop('${id}', ${st})`, () => buildCrop(id, st), { src: ['CROP_BUILD:' + id, 'cropGeometry'] });
  }
  if (typeof buildFruitTree === 'function') for (const [id, t] of Object.entries(FRUIT_TREES)) for (const [st, f, lab] of [[0, false, 'stāds'], [1, false, 'jauns koks'], [2, true, 'ar augļiem']])
    add('Augļu koki', `${id}_${st}${f ? 'f' : ''}`, `${t.name} — ${lab}`, `buildFruitTree('${id}', ${st}, ${f})`, () => buildFruitTree(id, st, f), { src: ['buildFruitTree'] });
  if (typeof buildBerryBush === 'function') {
    for (const [id, n] of [['mellene', 'Mellenes (krūms)'], ['avene', 'Avenes (krūms)'], ['dzervene', 'Dzērvenes (krūms)']]) add('Ogas, sēnes, mantas', 'berry_' + id, n, `buildBerryBush('${id}')`, () => buildBerryBush(id), { src: ['buildBerryBush'] });
    for (const [id, m] of Object.entries(MUSHROOMS)) add('Ogas, sēnes, mantas', 'mush_' + id, m.name, `buildMushroom(MUSHROOMS.${id})`, () => buildMushroom(m), { src: ['buildMushroom'] });
    add('Ogas, sēnes, mantas', 'star', 'Zvaigzne', 'buildStar()', () => buildStar(), { src: ['buildStar'] });
    add('Ogas, sēnes, mantas', 'heart', 'Sirds', 'buildHeart()', () => buildHeart(), { src: ['buildHeart'] });
    add('Ogas, sēnes, mantas', 'scroll', 'Kartes gabals (rullis)', 'buildScroll()', () => buildScroll(), { src: ['buildScroll'] });
    add('Ogas, sēnes, mantas', 'rod', 'Makšķere', 'buildRod()', () => buildRod(), { src: ['buildRod'] });
    add('Ogas, sēnes, mantas', 'bobber', 'Pludiņš', 'buildBobber()', () => buildBobber(), { src: ['buildBobber'] });
  }
  if (typeof buildDecor === 'function') for (const [id, n] of Object.entries(DECOR)) add('Dārza rotājumi', id, n, `buildDecor('${id}')`, () => buildDecor(id), { src: ['buildDecor:' + id], spin: true });
  return L.map((e) => ({ ...e, make: () => { const r = e.build(); return { raw: r, obj: _wrap(r) }; } }));
}


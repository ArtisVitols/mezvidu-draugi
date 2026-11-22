// 🐸 Dzīvnieki Piedzīvojumu mežā (1.43.0): vardes, pīles, zaķi, stirnas, stārķi, tauriņi.
// Dzīvo ap spēlētāju (katram savi, nav tīklā): parādās nejaušās piemērotās vietās 10–90 m attālumā, pazūd, kad aizej tālu.
// Vardes lec un kurkst, ielec ūdenī; pīles peld pa strautu; zaķi un stirnas ganās un aizbēg; stārķi brien pa purvu; tauriņi lido pļavās.
import * as THREE from 'three';
import * as A from './assets.js?v=1.47.0';
import { WATER_Y } from './world.js?v=1.47.0';
import { canvasTexture } from './util.js?v=1.47.0';
import { sfx } from './ui.js?v=1.47.0';

const TAU = Math.PI * 2;
// n — cik vienlaikus, near/far — kur parādās (m no spēlētāja), out — kur pazūd
const KINDS = {
  varde: { n: 10, near: 7, far: 42, out: 55 },
  pile: { n: 5, near: 15, far: 85, out: 105 },
  zakis: { n: 4, near: 28, far: 85, out: 115 },
  stirna: { n: 3, near: 38, far: 95, out: 125 },
  starkis: { n: 2, near: 25, far: 85, out: 115 },
  taurenis: { n: 12, near: 4, far: 30, out: 42 },
};

const geoCache = {};
function kitGeo(key, fn) { if (!geoCache[key]) { const k = new A.Kit(700 + key.length); fn(k, A.G); geoCache[key] = k.geometry(); } return geoCache[key]; }
// varde (skatās uz +z)
const frogGeo = () => kitGeo('varde', (k, G) => {
  k.add(G.sph(0.12, 12, 9), '#4f9a34', { p: [0, 0.1, 0], s: [1, 0.68, 1.25], rough: 0.35, fc: (c) => (Math.sin(c.x * 60) * Math.sin(c.z * 50) > 0.75 ? '#3a7a28' : null) });
  k.add(G.sph(0.1, 10, 8), '#e0d878', { p: [0, 0.07, 0.03], s: [0.95, 0.5, 1.15], rough: 0.5 });
  for (const s of [-1, 1]) {
    k.add(G.sph(0.045, 9, 7), '#5aa83a', { p: [s * 0.065, 0.17, 0.08], rough: 0.3 });
    k.add(G.sph(0.028, 8, 6), '#1a1a14', { p: [s * 0.075, 0.185, 0.105], rough: 0.1 });
    k.add(G.sph(0.06, 8, 6), '#4a9030', { p: [s * 0.11, 0.06, -0.08], s: [0.6, 0.55, 1.45], rough: 0.4 });
    k.add(G.sph(0.03, 6, 5), '#4a9030', { p: [s * 0.13, 0.02, 0.03], s: [1.4, 0.5, 1.6], rough: 0.4 });
    k.add(G.cyl(0.018, 0.02, 0.08, 5), '#4a9030', { p: [s * 0.08, 0.03, 0.1], rough: 0.4 });
  }
  k.add(G.box(0.08, 0.008, 0.01), '#2a4a1a', { p: [0, 0.1, 0.15] });
});
// pīle (skatās uz +z, ūdens līmenis y 0)
const duckGeo = () => kitGeo('pile', (k, G) => {
  k.add(G.sph(0.2, 12, 9), '#8a6a4a', { p: [0, 0.08, 0], s: [1, 0.7, 1.45], rough: 0.7, fc: (c) => (c.y > 0.12 && Math.abs(c.x) > 0.1 ? '#6a5038' : null) });
  k.add(G.cone(0.12, 0.2, 8), '#4a3a2a', { p: [0, 0.14, -0.3], r: [-Math.PI / 2 - 0.5, 0, 0], s: [1, 1, 0.5], rough: 0.7 });
  k.add(G.cyl(0.06, 0.08, 0.18, 8), '#ffffff', { p: [0, 0.2, 0.2], r: [0.4, 0, 0], rough: 0.6 });
  k.add(G.sph(0.1, 10, 8), '#2a7a4a', { p: [0, 0.32, 0.25], s: [0.9, 0.95, 1.1], rough: 0.25 });
  k.add(G.rbox(0.09, 0.03, 0.12, 0.012), '#f2b81a', { p: [0, 0.3, 0.37], rough: 0.4 });
  for (const s of [-1, 1]) k.add(G.sph(0.018, 6, 5), '#101010', { p: [s * 0.065, 0.35, 0.3], rough: 0.1 });
});
// tauriņa spārns (vienā pusē, pie ķermeņa x 0)
let wingT = null;
const wingGeo = () => {
  if (geoCache.wing) return geoCache.wing;
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.01); sh.bezierCurveTo(0.08, 0.14, 0.2, 0.12, 0.17, 0.02); sh.bezierCurveTo(0.2, -0.06, 0.12, -0.14, 0.02, -0.04); sh.lineTo(0, 0.01);
  const g = new THREE.ShapeGeometry(sh, 8);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 0.2, (p.getZ(i) + 0.14) / 0.28);
  geoCache.wing = g;
  return g;
};
function wingTex() {
  if (wingT) return wingT;
  wingT = canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#202020'; g.lineWidth = 9; g.strokeRect(0, 0, w, h);
    g.fillStyle = '#202020'; for (const [x, y, r] of [[44, 16, 6], [40, 46, 5]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(44, 16, 2.5, 0, TAU); g.fill();
  });
  return wingT;
}
const BUTTERFLY = ['#f2c81a', '#ffffff', '#f07a1a', '#4a8ae8', '#e85aa8', '#ffe07a'];

export class TrailLife {
  constructor(zone, game) {
    this.Z = zone; this.game = game;
    this.group = new THREE.Group();
    this.list = [];
    this.spawnT = 0;
    this.croakT = 0;
  }
  // ģeometrijas, kas paliek kešā (zemi izmetot neizmest)
  keep() { return Object.values(geoCache).concat(wingT ? [wingT] : []); }

  build(G) {
    const cheap = this.game.Q && this.game.Q.cheap ? 0.6 : 1;
    const n = (k) => Math.max(1, Math.round(KINDS[k].n * cheap));
    this.frogs = new THREE.InstancedMesh(frogGeo(), A.toyMaterial(), n('varde'));
    this.ducks = new THREE.InstancedMesh(duckGeo(), A.toyMaterial(), n('pile'));
    this.wingMat = new THREE.MeshStandardMaterial({ map: wingTex(), side: THREE.DoubleSide, roughness: 0.8, alphaTest: 0.5 });
    const nb = n('taurenis');
    this.wingsL = new THREE.InstancedMesh(wingGeo(), this.wingMat, nb);
    this.wingsR = new THREE.InstancedMesh(wingGeo(), this.wingMat, nb);
    for (const im of [this.frogs, this.ducks, this.wingsL, this.wingsR]) { im.frustumCulled = false; im.count = im.instanceMatrix.count; this.group.add(im); }
    this.frogs.castShadow = true; this.ducks.castShadow = true;
    const col = new THREE.Color();
    for (let i = 0; i < nb; i++) { col.set(BUTTERFLY[i % BUTTERFLY.length]); this.wingsL.setColorAt(i, col); this.wingsR.setColorAt(i, col); }
    let fi = 0, di = 0, bi = 0;
    for (const kind of Object.keys(KINDS)) for (let i = 0; i < n(kind); i++) {
      const a = { kind, on: false, x: 0, z: 0, y: 0, h: 0, st: 'idle', t: Math.random() * 3, sp: 0, fade: 0, hop: 0, ph: Math.random() * 10 };
      if (kind === 'varde') a.idx = fi++;
      else if (kind === 'pile') a.idx = di++;
      else if (kind === 'taurenis') a.idx = bi++;
      // četrkājainos modeļus būvē tikai, kad dzīvnieks pirmoreiz parādās (ātrāka ielāde)
      this.list.push(a);
    }
    this.hideAll();
    G.add(this.group);
  }
  hideAll() {
    const Z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const im of [this.frogs, this.ducks, this.wingsL, this.wingsR]) { for (let i = 0; i < im.count; i++) im.setMatrixAt(i, Z); im.instanceMatrix.needsUpdate = true; }
  }

  // ---------- dzīvesvietas ----------
  hab(kind, x, z) {
    const Z = this.Z, h = Z.getHeight(x, z), L = Z.lay;
    if (Math.abs(x) > 300 || z < -280) return null;
    const slope = () => Math.hypot(Z.getHeight(x + 1.5, z) - Z.getHeight(x - 1.5, z), Z.getHeight(x, z + 1.5) - Z.getHeight(x, z - 1.5)) / 3;
    switch (kind) {
      case 'varde': { // pie ūdens: purvā vai strauta krastā
        if (h < WATER_Y - 0.12 || h > WATER_Y + 0.7) return null;
        const wet = Z.getHeight(x + 2, z) < WATER_Y || Z.getHeight(x - 2, z) < WATER_Y || Z.getHeight(x, z + 2) < WATER_Y || Z.getHeight(x, z - 2) < WATER_Y;
        return wet ? Math.max(h, WATER_Y) : null;
      }
      case 'pile': return h < WATER_Y - 0.6 && Z.getHeight(x + 2.5, z) < WATER_Y - 0.3 && Z.getHeight(x - 2.5, z) < WATER_Y - 0.3 && z < L.stops[L.stops.length - 1].z - 60 && !Z.onBridge(x, z) ? WATER_Y : null;
      case 'starkis': return Z.bogAt(x, z) > 0.55 && h > WATER_Y - 0.3 && h < WATER_Y + 0.35 ? Math.max(h, WATER_Y - 0.25) : null;
      case 'taurenis': return h > WATER_Y + 0.2 && Z.forestAt(x, z) < 0.55 && z < Z.shoreZ(x) - 40 ? h : null;
      default: { // zaķis, stirna — sausā, līdzenā vietā (stirnas — pļavās)
        if (h < WATER_Y + 0.4 || z > Z.shoreZ(x) - 50 || Z.mountAt(x, z) > (kind === 'stirna' ? 0.3 : 0.5)) return null;
        if (Z.forestAt(x, z) > (kind === 'stirna' ? 0.4 : 0.6) || slope() > 0.35 || L.idx.near(x, z).d < 3.5) return null;
        return h;
      }
    }
  }
  spawn(a, px, pz) {
    const K = KINDS[a.kind];
    for (let tries = 0; tries < 5; tries++) {
      const ang = Math.random() * TAU, r = K.near + Math.random() * (K.far - K.near), x = px + Math.sin(ang) * r, z = pz + Math.cos(ang) * r;
      const y = this.hab(a.kind, x, z);
      if (y == null) continue;
      Object.assign(a, { on: true, x, z, y, h: Math.random() * TAU, st: 'idle', t: 0.5 + Math.random() * 3, sp: 0, fade: 0, hop: 0, ax: x, az: z, run: 0 });
      if (!a.av && a.kind !== 'varde' && a.kind !== 'pile' && a.kind !== 'taurenis') {
        a.av = A.buildNPC(a.kind); a.base = a.av.baseScale; this.group.add(a.av.root);
      }
      if (a.av) a.av.root.visible = true;
      return true;
    }
    return false;
  }
  despawn(a) {
    a.on = false;
    if (a.av) a.av.root.visible = false;
    else this.put(a, null);
  }

  update(dt, game, t) {
    const me = game.me.pos;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.35;
      // pa kārtai (lai neveiksmīgas vardes neaizņem visus mēģinājumus)
      const N = this.list.length;
      for (let k = 0, budget = 4; k < N && budget > 0; k++) {
        const a = this.list[(this.cur = ((this.cur || 0) + 1) % N)];
        if (!a.on) { budget--; this.spawn(a, me.x, me.z); }
      }
    }
    this.croakT -= dt;
    for (const a of this.list) {
      if (!a.on) continue;
      const dx = a.x - me.x, dz = a.z - me.z, d = Math.hypot(dx, dz);
      if (d > KINDS[a.kind].out) { this.despawn(a); continue; }
      a.fade = Math.min(1, a.fade + dt * 1.5);
      a.t -= dt;
      this[a.kind](a, dt, d, dx, dz, t);
    }
    for (const im of [this.frogs, this.ducks, this.wingsL, this.wingsR]) im.instanceMatrix.needsUpdate = true;
  }

  // instancētajiem: matrica (null — paslēpt)
  put(a, m) {
    const ims = a.kind === 'varde' ? [this.frogs] : a.kind === 'pile' ? [this.ducks] : [this.wingsL, this.wingsR];
    if (!m) { const Z = _m.makeScale(0, 0, 0); for (const im of ims) im.setMatrixAt(a.idx, Z); return; }
    ims[0].setMatrixAt(a.idx, m);
  }
  // pagriezties prom no spēlētāja
  away(a, dx, dz, jit = 0.6) { a.h = Math.atan2(dx, dz) + (Math.random() - 0.5) * jit; }

  varde(a, dt, d, dx, dz) {
    const Z = this.Z;
    if (a.hop > 0) {
      a.hop = Math.max(0, a.hop - dt / 0.38);
      const f = a.hop0 * dt / 0.38;
      a.x += Math.sin(a.h) * f; a.z += Math.cos(a.h) * f;
      if (a.hop === 0) {
        const h = Z.getHeight(a.x, a.z);
        if (h < WATER_Y - 0.15) { sfx('plop', { at: { x: a.x, z: a.z }, vol: 0.6 }); this.despawn(a); return; } // ielēca ūdenī
        a.y = Math.max(h, WATER_Y);
      }
    } else if (d < 3.2 || a.t <= 0) {
      if (d < 3.2) { this.away(a, dx, dz); a.hop0 = 1.4 + Math.random() * 0.6; }
      else {
        a.h += (Math.random() - 0.5) * 2.4; a.hop0 = 0.5 + Math.random() * 0.6;
        const nx = a.x + Math.sin(a.h) * a.hop0, nz = a.z + Math.cos(a.h) * a.hop0;
        if (this.hab('varde', nx, nz) == null) a.h += Math.PI;
      }
      a.hop = 1; a.t = 1.5 + Math.random() * 4;
    }
    if (a.hop === 0 && d < 25 && this.croakT <= 0 && Math.random() < dt * 0.08) { this.croakT = 1.4; sfx('frog', { at: { x: a.x, z: a.z }, vol: 0.55 }); a.croak = 0.5; }
    a.croak = Math.max(0, (a.croak || 0) - dt);
    const arc = a.hop > 0 ? Math.sin((1 - a.hop) * Math.PI) : 0;
    const s = 1.35 * a.fade, sy = a.hop > 0 ? 1.15 : 1 + Math.sin(a.croak * 30) * 0.06;
    _q.setFromAxisAngle(_up, a.h); _p.set(a.x, a.y + arc * 0.35 * a.hop0, a.z); _s.set(s, s * sy, s);
    this.put(a, _m.compose(_p, _q, _s));
  }

  pile(a, dt, d, dx, dz, t) {
    const Z = this.Z;
    if (d < 7) { this.away(a, dx, dz, 0.3); a.sp = 2.2; }
    else { a.sp += (0.5 - a.sp) * dt; if (a.t <= 0) { a.h += (Math.random() - 0.5) * 1.6; a.t = 2 + Math.random() * 4; } }
    const nx = a.x + Math.sin(a.h) * 1.4, nz = a.z + Math.cos(a.h) * 1.4;
    if (Z.getHeight(nx, nz) > WATER_Y - 0.4) a.h += dt * 3.5; // krasts priekšā — griežas
    else { a.x += Math.sin(a.h) * a.sp * dt; a.z += Math.cos(a.h) * a.sp * dt; }
    if (d < 22 && Math.random() < dt * 0.05) sfx('quack', { vol: 0.9 * (1 - d / 22) });
    const s = 1.1 * a.fade;
    _q.setFromEuler(_e.set(Math.sin(t * 2 + a.ph) * 0.05, a.h, 0)); _p.set(a.x, WATER_Y - 0.06 + Math.sin(t * 1.7 + a.ph) * 0.02, a.z); _s.set(s, s, s);
    this.put(a, _m.compose(_p, _q, _s));
  }

  // zaķis, stirna, stārķis — četrkājaini (vai garkājaini) NPC modeļi ar animate()
  walker(a, dt, d, dx, dz, { flee, alert, run, walk, roam }) {
    const Z = this.Z;
    if (d < flee && a.st !== 'flee') { a.st = 'flee'; a.t = 2.2 + Math.random(); this.away(a, dx, dz); }
    if (a.st === 'flee') { a.sp = run; if (a.t <= 0) { a.st = 'idle'; a.t = 2 + Math.random() * 3; } }
    else if (d < alert) { a.st = 'alert'; a.sp = 0; const want = Math.atan2(-dx, -dz); a.h += Math.atan2(Math.sin(want - a.h), Math.cos(want - a.h)) * Math.min(1, dt * 3); }
    else if (a.t <= 0) {
      if (a.st === 'walk') { a.st = 'idle'; a.t = 2 + Math.random() * 5; a.sp = 0; }
      else { a.st = 'walk'; a.t = 1 + Math.random() * 2.5; a.h += (Math.random() - 0.5) * 2.2; a.sp = walk; if (Math.hypot(a.x - a.ax, a.z - a.az) > roam) a.h = Math.atan2(a.ax - a.x, a.az - a.z); }
    } else if (a.st === 'alert') a.st = 'idle';
    if (a.sp > 0) {
      const nx = a.x + Math.sin(a.h) * a.sp * dt, nz = a.z + Math.cos(a.h) * a.sp * dt;
      const ok = a.kind === 'starkis' ? Z.bogAt(nx, nz) > 0.4 && Z.getHeight(nx, nz) > WATER_Y - 0.35
        : Z.getHeight(nx, nz) > WATER_Y + 0.25 && Math.abs(Z.getHeight(nx, nz) - Z.getHeight(a.x, a.z)) < a.sp * dt * 0.7 + 0.02 && Math.abs(nx) < 305;
      if (ok) { a.x = nx; a.z = nz; } else a.h += (Math.random() < 0.5 ? 1 : -1) * (0.8 + Math.random());
      a.y = Math.max(Z.getHeight(a.x, a.z), a.kind === 'starkis' ? WATER_Y - 0.25 : -9);
    }
    const av = a.av;
    av.root.position.set(a.x, a.y, a.z);
    av.root.rotation.y = a.h;
    av.root.scale.setScalar(a.base * a.fade);
    if (d < 70) {
      av.animate(dt, a.sp > 0.05, a.sp);
      // ganās — galva (ķermenis) uz leju
      if (a.sp === 0 && a.st === 'idle' && a.kind !== 'starkis') av.body.rotation.x = Math.max(0, Math.sin(a.t * 1.3 + a.ph)) * 0.12;
    }
  }
  zakis(a, dt, d, dx, dz) { this.walker(a, dt, d, dx, dz, { flee: 8, alert: 14, run: 7.5, walk: 1.6, roam: 14 }); }
  stirna(a, dt, d, dx, dz) { this.walker(a, dt, d, dx, dz, { flee: 14, alert: 26, run: 9, walk: 1.1, roam: 20 }); }
  starkis(a, dt, d, dx, dz) { this.walker(a, dt, d, dx, dz, { flee: 6, alert: 12, run: 2.2, walk: 0.55, roam: 16 }); }

  taurenis(a, dt, d, dx, dz, t) {
    const Z = this.Z;
    if (a.t <= 0) { a.t = 1 + Math.random() * 2.5; a.tx = a.ax + (Math.random() - 0.5) * 10; a.tz = a.az + (Math.random() - 0.5) * 10; }
    if (d < 2.5) { a.tx = a.x + dx * 2; a.tz = a.z + dz * 2; }
    const want = Math.atan2((a.tx ?? a.x) - a.x, (a.tz ?? a.z) - a.z);
    a.h += Math.atan2(Math.sin(want - a.h), Math.cos(want - a.h)) * Math.min(1, dt * 2.5) + Math.sin(t * 3 + a.ph) * dt * 1.5;
    a.x += Math.sin(a.h) * 1.6 * dt; a.z += Math.cos(a.h) * 1.6 * dt;
    const gy = Math.max(Z.getHeight(a.x, a.z), WATER_Y);
    a.y += (gy + 0.9 + Math.sin(t * 1.3 + a.ph) * 0.5 - a.y) * Math.min(1, dt * 2);
    const flap = Math.sin(t * 22 + a.ph) * 1.1, s = 1.8 * a.fade;
    _p.set(a.x, a.y + Math.abs(Math.sin(t * 11 + a.ph)) * 0.04, a.z); _s.set(s, s, s);
    // labais spārns: pacelts ap ķermeņa asi (z); kreisais — spoguļattēls (x mērogs −1)
    _q.setFromEuler(_e.set(0, a.h, 0.2 + flap, 'YXZ'));
    this.wingsR.setMatrixAt(a.idx, _m.compose(_p, _q, _s));
    _q.setFromEuler(_e.set(0, a.h, -0.2 - flap, 'YXZ'));
    this.wingsL.setMatrixAt(a.idx, _m.compose(_p, _q, _s.set(-s, s, s)));
  }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _up = new THREE.Vector3(0, 1, 0);

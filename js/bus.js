// 🚌 Zilais autobuss: visu laiku brauc no Ziemas zemes laukuma caur sētu līdz Mežvidu tirgum un atpakaļ.
// Kustība izriet tikai no kopējā pulksteņa (game.now()), tāpēc visi spēlētāji redz autobusu vienā vietā bez tīkla ziņām.
// Iekāpt un izkāpt var tikai pieturās (autobuss tur stāv), brauciens maksā BUS_PRICE. Vada kaķis Kārlis.
// Maršruts — globālās koordinātēs (zemes vietējās + zoneOffset); autobuss redzams tikai tajā zemē, kurā tas ir.
import * as THREE from 'three';
import { mat, canvasTexture, angleLerp } from './util.js?v=1.24.0';
import { buildAnimal, flattenStatic } from './characters.js?v=1.24.0';
import { $, toast, sfx } from './ui.js?v=1.24.0';
import { roadNS, roadEW, FOREST_ROAD } from './world.js?v=1.24.0';
import { WINTER_ROAD, winterHeight } from './winter.js?v=1.24.0';
import { zoneOffset, ZONE_HALF, FARM, FOREST } from './zones.js?v=1.24.0';
import { busStopSvg } from './icons.js?v=1.24.0';

export const BUS_PRICE = 2;
export const BUS_CODE = 6; // pos p[5]: pasažieris autobusā (p[9] — sēdvieta)
const VMAX = 10, ACC = 1.1, DWELL = 12, TERM = 24, TURN0 = 8, TURN1 = 16; // m/s, m/s², s
const BUS_ZONES = ['n', FARM, FOREST];

// ---------- maršruts ----------
const route = (() => {
  const pts = [];
  const [wx, wz] = zoneOffset('n'), [fx, fz] = zoneOffset(FOREST);
  // ziema: no laukuma uz dienvidu robežu
  for (const [x, z] of [...WINTER_ROAD].reverse()) if (z <= 316) pts.push([x + wx, z + wz]);
  // sēta: ziemeļu ceļš uz krustojumu, pagrieziens, austrumu ceļš uz robežu
  for (let z = -300; z <= -16; z += 12) pts.push([roadNS(z), z]);
  pts.push([4.7, -4.7]);
  for (let x = 16; x <= 300; x += 12) pts.push([x, roadEW(x)]);
  pts.push([315, 0]);
  // mežs: no rietumu robežas līdz tirgum
  for (const [x, z] of [...FOREST_ROAD].reverse()) if (x > -312) pts.push([x + fx, z + fz]);
  pts.push([-33 + fx, 4.5 + fz]);
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const len = curve.getLength(), n = Math.ceil(len);
  const sp = curve.getSpacedPoints(n);
  const X = new Float32Array(n + 1), Z = new Float32Array(n + 1);
  sp.forEach((p, i) => { X[i] = p.x; Z[i] = p.z; });
  return { X, Z, n, step: len / n, len };
})();
const nearestS = (x, z) => { let b = 1e9, bi = 0; for (let i = 0; i <= route.n; i++) { const d = (route.X[i] - x) ** 2 + (route.Z[i] - z) ** 2; if (d < b) { b = d; bi = i; } } return bi * route.step; };
// pieturas (globāli): side — kurā ceļa pusē nojume (+1 pa kreisi no braukšanas virziena „uz tirgu”)
export const BUS_STOPS = [
  { name: 'Ziemas laukums', icon: '❄️', x: 89 + zoneOffset('n')[0], z: 246 + zoneOffset('n')[1], side: -1 },
  { name: 'Sēta — ziemeļi', icon: '🏡', x: 0, z: -37.5, side: 1 },
  { name: 'Sēta — austrumi', icon: '🏡', x: 37.5, z: 0, side: 1 },
  { name: 'Mežvidu tirgus', icon: '🛒', x: -33 + zoneOffset(FOREST)[0], z: 4.5, side: 1 },
].map((s) => ({ ...s, s: nearestS(s.x, s.z) })).sort((a, b) => a.s - b.s);
BUS_STOPS[0].s = 0; BUS_STOPS[BUS_STOPS.length - 1].s = route.len;

function pathAt(s) {
  const f = Math.max(0, Math.min(route.n - 0.001, s / route.step)), i = Math.floor(f), u = f - i;
  const x = route.X[i] + (route.X[i + 1] - route.X[i]) * u, z = route.Z[i] + (route.Z[i + 1] - route.Z[i]) * u;
  const tx = route.X[i + 1] - route.X[i], tz = route.Z[i + 1] - route.Z[i];
  return { x, z, h: Math.atan2(tx, tz) };
}

// ---------- grafiks: stāv pieturā → brauc uz nākamo → … → galapunktā apgriežas un brauc atpakaļ ----------
const travelTime = (L) => { const dA = VMAX * VMAX / (2 * ACC); return L < 2 * dA ? 2 * Math.sqrt(L / ACC) : 2 * VMAX / ACC + (L - 2 * dA) / VMAX; };
function travelDist(L, t) {
  const T = travelTime(L), dA = VMAX * VMAX / (2 * ACC);
  const vp = L < 2 * dA ? Math.sqrt(ACC * L) : VMAX, ta = vp / ACC;
  if (t <= ta) return 0.5 * ACC * t * t;
  if (t >= T - ta) { const r = T - t; return L - 0.5 * ACC * r * r; }
  return 0.5 * ACC * ta * ta + vp * (t - ta);
}
const EVENTS = (() => {
  const n = BUS_STOPS.length, seq = [];
  for (let i = 0; i < n; i++) seq.push(i);
  for (let i = n - 2; i > 0; i--) seq.push(i);
  const ev = [];
  let t = 0;
  seq.forEach((i, k) => {
    const next = seq[(k + 1) % seq.length], dir = next > i ? 1 : -1;
    const term = i === 0 || i === n - 1;
    const d = term ? TERM : DWELL;
    ev.push({ kind: 'dwell', t0: t, t1: t + d, stop: i, dir: term ? -dir : dir, turn: term });
    t += d;
    const L = Math.abs(BUS_STOPS[next].s - BUS_STOPS[i].s), T = travelTime(L);
    ev.push({ kind: 'move', t0: t, t1: t + T, from: i, to: next, dir, L });
    t += T;
  });
  return { ev, P: t };
})();

export function busState(nowMs) {
  const T = ((nowMs / 1000) % EVENTS.P + EVENTS.P) % EVENTS.P;
  const e = EVENTS.ev.find((x) => T < x.t1) || EVENTS.ev[EVENTS.ev.length - 1];
  if (e.kind === 'dwell') {
    const s = BUS_STOPS[e.stop].s;
    let turn = 0;
    if (e.turn) { const k = Math.min(1, Math.max(0, (T - e.t0 - TURN0) / (TURN1 - TURN0))); turn = k * k * (3 - 2 * k); }
    return { s, dir: e.dir, stop: e.stop, left: e.t1 - T, turn, v: 0 };
  }
  const d = travelDist(e.L, T - e.t0);
  return { s: BUS_STOPS[e.from].s + e.dir * d, dir: e.dir, stop: -1, left: 0, turn: 0, next: e.to };
}
// cik sekundes līdz autobuss nākamreiz stāvēs pieturā i (0 — stāv tagad)
export function busEta(nowMs, i) {
  const T = ((nowMs / 1000) % EVENTS.P + EVENTS.P) % EVENTS.P;
  let best = 1e9;
  for (const e of EVENTS.ev) {
    if (e.kind !== 'dwell' || e.stop !== i) continue;
    if (T >= e.t0 && T < e.t1 - 2) return 0;
    const w = e.t0 >= T ? e.t0 - T : e.t0 + EVENTS.P - T;
    best = Math.min(best, w);
  }
  return best;
}
const zoneOfG = (x, z) => {
  for (const id of BUS_ZONES) { const [ox, oz] = zoneOffset(id); if (Math.max(Math.abs(x - ox), Math.abs(z - oz)) <= ZONE_HALF) return id; }
  return FARM;
};

// ---------- modeļi ----------
function busTex(text, w = 512, h = 64, bg = '#111', fg = '#ffb000') {
  return canvasTexture(w, h, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = fg; c.font = `bold ${Math.round(h * 0.62)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 2);
  });
}
function svgTex(svg) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const img = new Image();
  img.onload = () => { cv.getContext('2d').drawImage(img, 0, 0, 256, 256); tex.needsUpdate = true; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return tex;
}

// autobuss: priekša — lokālā +z, vadītājs kreisajā pusē (+x), durvis labajā (−x)
export function buildBus() {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const st = new THREE.Group(); // statiskās daļas (tiks apvienotas)
  const blue = mat('#1f6fd6', { roughness: 0.45, metalness: 0.25 }), white = mat('#f3f5f8', { roughness: 0.5 }), dark = mat('#26292e', { roughness: 0.8 });
  const B = (w, h, d, m, x, y, z, parent = st) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const L = 10.4, HL = L / 2, W = 2.5, HW = W / 2;
  B(L, 0.12, W, dark, 0, 0.6, 0).scale.set(1, 1, 1);
  st.children[0].geometry = new THREE.BoxGeometry(W, 0.12, L); // grīda
  B(W - 0.2, 0.32, L - 0.4, dark, 0, 0.4, 0); // šasija
  // apakšējās sienas (zilas) ar baltu joslu
  for (const s of [-1, 1]) {
    B(0.08, 0.9, L, blue, s * (HW - 0.04), 1.05, 0);
    B(0.02, 0.14, L, white, s * (HW + 0.005), 1.22, 0);
  }
  B(W, 0.9, 0.08, blue, 0, 1.05, HL - 0.04);
  B(W, 0.9, 0.08, blue, 0, 1.05, -HL + 0.04);
  // statņi starp logiem
  for (const s of [-1, 1]) for (const z of [-HL + 0.06, -3.1, -1.05, 1.0, 3.05, HL - 0.06]) B(0.1, 1.05, 0.14, blue, s * (HW - 0.05), 2.02, z);
  for (const x of [-HW + 0.06, HW - 0.06]) B(0.14, 1.05, 0.1, blue, x, 2.02, HL - 0.05);
  B(W, 0.22, 0.08, blue, 0, 2.43, HL - 0.04); B(W, 0.22, 0.08, blue, 0, 2.43, -HL + 0.04);
  // jumts
  B(W + 0.04, 0.3, L + 0.04, white, 0, 2.68, 0);
  B(W - 0.6, 0.18, 2.6, white, 0, 2.9, -2.2); // jumta kaste (kondicionieris)
  // buferi un lukturi
  B(W + 0.06, 0.25, 0.14, dark, 0, 0.62, HL + 0.04); B(W + 0.06, 0.25, 0.14, dark, 0, 0.62, -HL - 0.04);
  const li = new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffe7a8', emissiveIntensity: 0.9 });
  const ta = new THREE.MeshStandardMaterial({ color: '#b01818', emissive: '#6a0808', emissiveIntensity: 0.8 });
  for (const s of [-1, 1]) { B(0.42, 0.2, 0.05, li, s * 0.86, 0.95, HL + 0.02); B(0.3, 0.35, 0.05, ta, s * 0.95, 1.05, -HL - 0.02); }
  // sēdekļi (2 rindās ar eju vidū) un vadītāja vieta
  const fab = mat('#c23b3b', { roughness: 0.9 }), fab2 = mat('#2a4f9a', { roughness: 0.9 });
  const seats = [];
  const rows = [2.2, 1.05, -0.1, -1.25, -2.4, -3.55];
  rows.forEach((z, r) => {
    for (const x of [-0.72, 0.72]) {
      const f = (r + (x > 0 ? 1 : 0)) % 2 ? fab : fab2;
      B(0.56, 0.12, 0.5, f, x, 1.02, z);
      B(0.56, 0.55, 0.09, f, x, 1.32, z - 0.27);
      B(0.08, 0.36, 0.08, dark, x, 0.8, z);
      const g = new THREE.Group(); g.position.set(x, 0.66, z - 0.02); body.add(g); seats.push(g);
    }
  });
  B(0.6, 0.12, 0.55, dark, 0.7, 1.02, 3.85); B(0.6, 0.6, 0.09, dark, 0.7, 1.35, 3.56);
  const wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 6, 18), dark);
  wheelS.position.set(0.7, 1.5, 4.5); wheelS.rotation.x = -0.9; st.add(wheelS);
  B(0.06, 0.06, 0.5, dark, 0.7, 1.32, 4.65).rotation.x = -0.9;
  // maršruta tablo priekšā un sānā
  const signM = new THREE.MeshStandardMaterial({ map: busTex('❄️ Ziema ⇄ 🛒 Tirgus'), emissive: '#ffffff', emissiveMap: busTex('❄️ Ziema ⇄ 🛒 Tirgus'), emissiveIntensity: 0.5 });
  const fs = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.26), signM); fs.position.set(0, 2.38, HL + 0.01); st.add(fs);
  const sideM = new THREE.MeshStandardMaterial({ map: busTex('MEŽVIDU AUTOBUSS', 512, 64, '#1f6fd6', '#ffffff'), roughness: 0.5 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.4), sideM);
    p.position.set(s * (HW + 0.012), 0.82, -1.2); p.rotation.y = s * Math.PI / 2; st.add(p);
  }
  const flat = flattenStatic(st);
  body.add(flat);
  // stikli (caurspīdīgi — redzami pasažieri)
  const glass = new THREE.MeshStandardMaterial({ color: '#a9cce0', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  for (const s of [-1, 1]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.2, 1.0), glass); g.position.set(s * (HW - 0.03), 2.02, 0); g.rotation.y = Math.PI / 2; body.add(g); }
  const wf = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, 1.05), glass); wf.position.set(0, 2.0, HL - 0.03); body.add(wf);
  const wb = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, 0.9), glass); wb.position.set(0, 2.0, -HL + 0.03); body.add(wb);
  // durvis labajā pusē (divas vērtnes, atveras pieturā)
  const doorM = new THREE.MeshStandardMaterial({ color: '#1a4f9e', roughness: 0.3, metalness: 0.3, transparent: true, opacity: 0.75 });
  const doors = [3.95, 4.55].map((z) => { const d = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.75, 0.58), doorM); d.position.set(-HW - 0.02, 1.5, z); body.add(d); return d; });
  // riteņi
  const tyre = mat('#151515', { roughness: 0.92 }), hub = mat('#d8dde2', { metalness: 0.7, roughness: 0.3 });
  const wheels = [];
  for (const z of [3.3, -3.2]) for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * (HW - 0.18), 0.5, z); body.add(w);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.36, 18).rotateZ(Math.PI / 2), tyre); t.castShadow = true; w.add(t);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.38, 10).rotateZ(Math.PI / 2), hub); w.add(h);
    wheels.push(w);
  }
  // vadītājs — kaķis Kārlis ar beisbola cepuri
  const driver = buildAnimal({ animal: 'kakis', fur: '#e8a24a', shirt: '#1f6fd6', hat: 'nagene' });
  const ds = new THREE.Group(); ds.position.set(0.7, 0.66, 3.83); body.add(ds); ds.add(driver.root);
  driver.shadow.visible = false;
  return { root, body, seats, wheels, doors, driver };
}

// pieturas nojume: lokālā +z — pret ceļu
function buildStop(stop) {
  const g = new THREE.Group(), st = new THREE.Group();
  const metal = mat('#8d949b', { metalness: 0.7, roughness: 0.4 }), blue = mat('#1f6fd6', { roughness: 0.5 }), wood = mat('#8a6440', { roughness: 0.9 });
  const B = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; st.add(o); return o; };
  for (const x of [-1.7, 1.7]) for (const z of [-0.7, 0.6]) B(0.08, 2.4, 0.08, metal, x, 1.2, z);
  B(3.8, 0.12, 1.8, blue, 0, 2.45, -0.05);
  B(3.2, 0.08, 0.45, wood, 0, 0.5, -0.4); B(3.2, 0.45, 0.06, wood, 0, 0.8, -0.65);
  for (const x of [-1.4, 1.4]) B(0.08, 0.5, 0.4, metal, x, 0.25, -0.4);
  // zīme ar autobusu un pieturas nosaukumu
  B(0.07, 2.9, 0.07, metal, 2.3, 1.45, 0.55);
  const sv = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshStandardMaterial({ map: svgTex(busStopSvg()), roughness: 0.45 }));
  sv.position.set(2.3, 2.62, 0.6); st.add(sv);
  const sv2 = sv.clone(); sv2.rotation.y = Math.PI; sv2.position.z = 0.5; st.add(sv2);
  const nameT = busTex(`${stop.icon} ${stop.name}`, 512, 80, '#ffffff', '#1d3f8a');
  const nm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.24), new THREE.MeshStandardMaterial({ map: nameT, roughness: 0.6 }));
  nm.position.set(2.3, 2.15, 0.6); st.add(nm);
  const nm2 = nm.clone(); nm2.rotation.y = Math.PI; nm2.position.z = 0.5; st.add(nm2);
  const nm3 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), new THREE.MeshStandardMaterial({ map: busTex(`🚌 ${stop.name} · ${BUS_PRICE}🪙`, 640, 80, '#1f6fd6', '#ffffff'), roughness: 0.6 }));
  nm3.position.set(0, 2.25, 0.86); st.add(nm3);
  g.add(flattenStatic(st));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshStandardMaterial({ color: '#bcd8e8', transparent: true, opacity: 0.3, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.set(0, 1.45, -0.72); g.add(glass);
  return g;
}

// ---------- spēles daļa (mixin) ----------
export const Bus = {
  initBus() {
    const bus = this.bus = { obj: buildBus(), vis: false, lastS: null, stopShown: -2 };
    bus.obj.root.visible = false;
    this.stage.add(bus.obj.root);
    // pieturas: katrai zemei sava grupa uz stage (redzama tikai tajā zemē)
    this.busStopGroups = {};
    const hf = { n: (x, z) => winterHeight(x, z), [FARM]: (x, z) => this.farmW.getHeight(x, z), [FOREST]: (x, z) => this.world.getHeight(x, z) };
    BUS_STOPS.forEach((s, i) => {
      const zone = zoneOfG(s.x, s.z), [ox, oz] = zoneOffset(zone);
      const p = pathAt(s.s), side = s.side;
      // nojume ceļa malā (6 m no ceļa vidus), ar seju pret ceļu
      const nx = Math.cos(p.h) * side, nz = -Math.sin(p.h) * side;
      const lx = p.x - ox + nx * 6, lz = p.z - oz + nz * 6;
      const g = buildStop(s);
      g.position.set(lx, hf[zone](lx, lz), lz);
      g.rotation.y = Math.atan2(-nx, -nz);
      s.zone = zone; s.lx = lx; s.lz = lz; s.i = i;
      (this.busStopGroups[zone] = this.busStopGroups[zone] || new THREE.Group()).add(g);
    });
    for (const z in this.busStopGroups) this.stage.add(this.busStopGroups[z]);
  },

  // katru kadru: autobusa vieta, pieturu redzamība, pasažieris
  updateBus(dt) {
    const B = this.bus;
    if (!B) return;
    for (const z in this.busStopGroups) this.busStopGroups[z].visible = z === this.zone;
    const now = this.now();
    const st = B.st = busState(now);
    const p = pathAt(st.s);
    const zone = B.zone = zoneOfG(p.x, p.z), [ox, oz] = zoneOffset(zone);
    let h = p.h + (st.dir < 0 ? Math.PI : 0) + st.turn * Math.PI;
    B.lx = p.x - ox; B.lz = p.z - oz; B.h = h;
    const speed = B.lastS == null ? 0 : Math.abs(st.s - B.lastS) / Math.max(dt, 1e-3);
    B.lastS = st.s; B.speed = speed;
    const o = B.obj;
    B.vis = zone === this.zone && !!this.terr && !!this.terr.getHeight;
    o.root.visible = B.vis;
    if (B.vis) {
      const T = this.terr, y = T.getHeight(B.lx, B.lz);
      const fx = Math.sin(h) * 4, fz = Math.cos(h) * 4;
      const hf = T.getHeight(B.lx + fx, B.lz + fz), hb = T.getHeight(B.lx - fx, B.lz - fz);
      o.root.position.set(B.lx, y, B.lz);
      o.root.rotation.order = 'YXZ';
      o.root.rotation.y = h;
      o.root.rotation.x = lerpA(o.root.rotation.x, -Math.atan2(hf - hb, 8), 0.2);
      for (const w of o.wheels) w.rotation.x += speed * dt / 0.5;
      // durvis atveras pieturā
      const open = st.stop >= 0 && st.left > 1.2 && st.turn === 0 ? 1 : st.stop >= 0 && st.turn >= 1 && st.left > 1.2 ? 1 : 0;
      B.door = (B.door || 0) + (open - (B.door || 0)) * Math.min(1, dt * 4);
      o.doors[0].position.z = 3.95 - B.door * 0.5; o.doors[1].position.z = 4.55 + B.door * 0.5;
      o.driver.animate(dt, 'sit', 0);
      o.driver.head.rotation.y = st.stop >= 0 ? Math.sin(now / 900) * 0.5 : 0;
      // gājēji neiet cauri autobusam
      if (!this.me.bus && !this.me.veh && !this.me.inKart && !this.me.ride) pushOut(this.me.pos, B.lx, B.lz, h, 1.25 + 0.4, 5.2 + 0.4);
    }
    if (this.me.bus) this.busRider(dt);
  },

  busActions(consider, d2) {
    const B = this.bus;
    if (!B || this.me.bus) return;
    const st = B.st;
    if (B.vis && st && st.stop >= 0 && st.left > 1.5 && (st.turn === 0 || st.turn >= 1)) {
      consider(d2(B.lx, B.lz) * 0.4, 7.5, `🚌 Iekāpt autobusā (${BUS_PRICE}🪙)`, () => this.boardBus());
    }
    // pie pieturas — cik ilgi jāgaida
    for (const s of BUS_STOPS) {
      if (s.zone !== this.zone) continue;
      const eta = busEta(this.now(), s.i);
      if (eta > 0) consider(d2(s.lx, s.lz) + 1, 4.5, `🚏 ${s.name}: autobuss pēc ${fmtEta(eta)}`, () => toast(`🚏 ${s.name} — autobuss atbrauks pēc ${fmtEta(busEta(this.now(), s.i))}. Brauciens ${BUS_PRICE}🪙.`));
    }
  },

  boardBus() {
    const B = this.bus, me = this.me;
    if (!B.vis || !B.st || B.st.stop < 0) { toast('Autobusā var iekāpt tikai pieturā 🚏'); return; }
    if (this.save.coins < BUS_PRICE) { toast(`Nepietiek monētu — brauciens maksā ${BUS_PRICE}🪙`, 'bad'); return; }
    const taken = this.busTaken();
    const seat = B.obj.seats.findIndex((_, i) => !taken.has(i));
    if (seat < 0) { toast('🚌 Autobuss ir pilns!', 'bad'); return; }
    if (this.fishing) this.stopFishing();
    if (me.carry) this.stowCarry();
    this.addCoins(-BUS_PRICE, true);
    me.bus = { seat };
    B.obj.seats[seat].add(this.avatar.root);
    this.avatar.root.position.set(0, 0, 0); this.avatar.root.rotation.set(0, 0, 0);
    this.avatar.shadow.visible = false;
    me.state = 'sit';
    $('btn-jump').classList.add('hidden');
    sfx('coin');
    B.stopShown = B.st.stop;
    toast(`🐱 Kaķis Kārlis: „Laipni lūdzam! ${BUS_PRICE}🪙, paldies!” Izkāpt var tikai pieturā 🚏`, 'good', 4500);
  },

  busTaken() {
    const t = new Set();
    for (const r of this.remotes.values()) if (r.vehCode === BUS_CODE) t.add(r.rideSeat);
    return t;
  },

  leaveBus(force = false) {
    const B = this.bus, me = this.me;
    if (!me.bus) return;
    if (!force && (!B.st || B.st.stop < 0)) { toast('Izkāpt var tikai pieturā 🚏 — pagaidi nākamo!'); return; }
    me.bus = null;
    this.stage.add(this.avatar.root);
    this.avatar.shadow.visible = true;
    // izkāpj pa durvīm (labā puse) uz ietves
    const o = B.obj.root;
    o.updateMatrixWorld(true);
    const p = new THREE.Vector3(-2.6, 0, 4.2).applyMatrix4(o.matrixWorld);
    me.pos.set(p.x, 0, p.z);
    this.terr.collide(me.pos, 0.4);
    me.pos.y = this.terr.groundAt(me.pos.x, me.pos.z) + 0.2;
    me.heading = B.h - Math.PI / 2;
    this.avatar.root.position.copy(me.pos);
    this.avatar.root.rotation.set(0, me.heading, 0);
    me.state = 'idle';
    $('btn-exit-kart').classList.add('hidden');
    $('btn-jump').classList.remove('hidden');
    sfx('beep');
    const s = B.st && B.st.stop >= 0 ? BUS_STOPS[B.st.stop] : null;
    if (s) toast(`🚏 ${s.icon} ${s.name}`, 'good');
  },

  // pasažieris: sēž savā vietā, pārbrauc uz citu zemi līdz ar autobusu
  busRider(dt) {
    const B = this.bus, me = this.me;
    if (B.zone !== this.zone) {
      if (!this.zoneBusy) this.teleport(B.zone, { x: B.lx, z: B.lz }, B.h);
      return;
    }
    if (!B.vis) return;
    // ja draugs ar mazāku id sēž manā vietā — pārsēžamies
    for (const r of this.remotes.values()) {
      if (r.vehCode === BUS_CODE && r.rideSeat === me.bus.seat && r.id < this.myId) {
        const taken = this.busTaken(), free = B.obj.seats.findIndex((_, i) => !taken.has(i) && i !== me.bus.seat);
        if (free < 0) { this.leaveBus(true); toast('🚌 Autobusā vairs nav vietas'); return; }
        me.bus.seat = free;
        B.obj.seats[free].add(this.avatar.root);
      }
    }
    const seat = B.obj.seats[me.bus.seat];
    if (this.avatar.root.parent !== seat) { seat.add(this.avatar.root); this.avatar.root.position.set(0, 0, 0); this.avatar.root.rotation.set(0, 0, 0); }
    B.obj.root.updateMatrixWorld(true);
    const wp = seat.getWorldPosition(new THREE.Vector3());
    me.pos.copy(wp);
    me.heading = B.h;
    me.vy = 0; me.onGround = true; me.state = 'sit';
    this.avatar.animate(dt, 'sit', 0);
    // pieturā var izkāpt
    const atStop = B.st.stop >= 0 && B.st.left > 1;
    $('btn-exit-kart').classList.toggle('hidden', !atStop);
    if (B.st.stop >= 0 && B.stopShown !== B.st.stop) {
      B.stopShown = B.st.stop;
      const s = BUS_STOPS[B.st.stop];
      toast(`🚏 Pietura: ${s.icon} ${s.name} — vari izkāpt (🚶 Izkāpt)`, 'good', 4000);
      sfx('beep');
    }
    if (B.st.stop < 0) B.stopShown = -1;
  },

  // drauga avatārs autobusa sēdvietā; true — apstrādāts
  busRemote(r, here, dt) {
    if (r.vehCode !== BUS_CODE) return false;
    const B = this.bus;
    if (!here || !B || !B.vis) { r.avatar.root.visible = false; return true; }
    const seat = B.obj.seats[r.rideSeat] || B.obj.seats[0];
    if (r.avatar.root.parent !== seat) { seat.add(r.avatar.root); r.avatar.root.position.set(0, 0, 0); r.avatar.root.rotation.set(0, 0, 0); }
    r.avatar.shadow.visible = false;
    r.avatar.root.visible = true;
    r.avatar.animate(dt, 'sit', 0);
    return true;
  },
};

const lerpA = (a, b, k) => a + (b - a) * k;
const fmtEta = (s) => (s < 60 ? `${Math.ceil(s)} s` : `${Math.floor(s / 60)} min ${Math.ceil(s % 60)} s`);
// izstumj punktu no pagriezta taisnstūra (autobusa)
function pushOut(pos, cx, cz, h, hw, hl) {
  const c = Math.cos(h), s = Math.sin(h);
  const dx = pos.x - cx, dz = pos.z - cz;
  const lx = dx * c - dz * s, lz = dx * s + dz * c; // lokālās: x — sāniski, z — gar autobusu
  if (Math.abs(lx) >= hw || Math.abs(lz) >= hl) return;
  let nx = lx, nz = lz;
  if (hw - Math.abs(lx) < hl - Math.abs(lz)) nx = Math.sign(lx || 1) * hw; else nz = Math.sign(lz || 1) * hl;
  pos.x = cx + nx * c + nz * s;
  pos.z = cz - nx * s + nz * c;
}
void angleLerp;

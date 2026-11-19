// Transportlīdzekļi (1.21.0 — katrs ir viens vienīgs visā pasaulē, kopīgs visiem spēlētājiem):
// 2 🚙 mašīnas un 🚲 velosipēds sētas krustojumā, 🛷 sniega motocikls Ziemas zemē. Ar jebkuru var braukt ikviens,
// ja neviens cits ar to nebrauc; izkāpjot tas paliek tur, kur atstāts (arī citā zemē). Saimnieks glabā, kurš ar ko brauc
// un kur katrs stāv (saimnieka saglabājumā `vehs`). Vehicles — Game papildinājums.
import * as THREE from 'three';
import { mat, lerp, clamp, makeBlobShadow, makeTextSprite } from './util.js?v=1.31.0';
import { optimizeRig, tyreGeo } from './characters.js?v=1.31.0';
import { $, toast, sfx } from './ui.js?v=1.31.0';
import { DIRS, neighbour, FARM, FOREST, RACE, ZONE_IDS } from './zones.js?v=1.31.0';
import { WATER_Y, YARD, YARD_IN, rotPlot, rotPlotY, BIKE_RACK } from './world.js?v=1.31.0';
import { SLED_SPOT } from './winter.js?v=1.31.0';
import { BUS_CODE } from './bus.js?v=1.31.0';
import { ZONES } from './zones.js?v=1.31.0';

// tīkla kods (pos ziņas 6. lauks): 1 = kartings, 2 = mašīna, 3 = sniega motocikls, 5 = velosipēds
export const VEH_CODE = { car: 2, sled: 3, bike: 5 }; // 4 = pasažieris (p[8] — vadītāja id, p[9] — sēdvieta); p[10] — transporta id
export const RIDE_CODE = 4;
const CODE_KIND = { 2: 'car', 3: 'sled', 5: 'bike' };
const DRIVE_CODES = new Set([2, 3, 5]);
export const DEF = {
  car: { name: 'mašīna', icon: '🚙', road: 19, off: 10, snowOff: 6.5, accel: 9, brake: 16, turn: 1.7, radius: 1.75, len: 1.26, wid: 1.04, cam: 10.5 },
  sled: { name: 'sniega motocikls', icon: '🛷', road: 17, off: 20, snowOff: 20, accel: 11, brake: 14, turn: 2.1, radius: 1.1, len: 0.9, wid: 0.46, cam: 8 },
  bike: { name: 'velosipēds', icon: '🚲', road: 12.5, off: 8.5, snowOff: 4, accel: 7.5, brake: 13, turn: 2.6, radius: 0.75, len: 0.55, wid: 0.14, cam: 7 },
};
// visi transportlīdzekļi pasaulē (sākuma vietas). Sētas krustojums: ceļi x≈0 un z≈0, sētas sākas 9 m no ceļa
export const VEHICLES = [
  { id: 'car1', kind: 'car', color: '#3a7d44', name: 'Zaļā mašīna', zone: FARM, x: -15, z: 5.4, h: Math.PI / 2 },
  { id: 'car2', kind: 'car', color: '#2f6fd6', name: 'Zilā mašīna', zone: FARM, x: 15, z: -5.4, h: -Math.PI / 2 },
  { id: 'sled1', kind: 'sled', color: '#d8262a', name: 'Sniega motocikls', zone: 'n', x: SLED_SPOT.x, z: SLED_SPOT.z, h: SLED_SPOT.heading },
];
// velosipēdi: pa vienam pie katras sētas vārtiem (ceļmalā starp ceļu un žogu) un 4 statīvā meža ciemata tirgū
const BIKE_COL = [['#d23b3b', 'Sarkanais'], ['#2f6fd6', 'Zilais'], ['#f2c12e', 'Dzeltenais'], ['#2fa84f', 'Zaļais'],
  ['#e05aa8', 'Rozā'], ['#f07b2a', 'Oranžais'], ['#8a4ad2', 'Violetais'], ['#1f9a9a', 'Tirkīza']];
for (let s = 0; s < 4; s++) {
  const [x, z] = rotPlot(-YARD.gateA + 5.5, -YARD_IN + 2.3, s);
  VEHICLES.push({ id: 'bike' + (s + 1), kind: 'bike', color: BIKE_COL[s][0], name: BIKE_COL[s][1] + ' velosipēds', zone: FARM, x, z, h: Math.PI / 2 + rotPlotY(s) });
}
// 2 velosipēdi trases stāvlaukumā (racetrack.js LOT: l = 22,5, a = 9 un 10,3 — aprēķināts no trases rāmja), ar priekšu pret trasi
VEHICLES.push({ id: 'bike9', kind: 'bike', color: '#222c3a', name: 'Melnais velosipēds', zone: RACE, x: 172.93, z: -28.15, h: -Math.PI / 2 });
VEHICLES.push({ id: 'bike10', kind: 'bike', color: '#c8c8c8', name: 'Sudraba velosipēds', zone: RACE, x: 172.95, z: -29.45, h: -Math.PI / 2 });
for (let i = 0; i < 4; i++) {
  VEHICLES.push({ id: 'bike' + (i + 5), kind: 'bike', color: BIKE_COL[i + 4][0], name: BIKE_COL[i + 4][1] + ' velosipēds', zone: FOREST, x: BIKE_RACK.x, z: BIKE_RACK.z + i * 1.25, h: Math.PI / 2 });
}
const VDEF = Object.fromEntries(VEHICLES.map((v) => [v.id, v]));

// ---------- modeļi ----------
const shared = {};
const M = (k, f) => shared[k] || (shared[k] = f());
const darkM = () => M('dark', () => mat('#1d1f22', { roughness: 0.7 }));
const rubberM = () => M('rub', () => new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.92 }));
const chromeM = () => M('chr', () => new THREE.MeshStandardMaterial({ color: '#c9cdd1', metalness: 0.95, roughness: 0.22 }));
const glassM = () => M('gl', () => new THREE.MeshStandardMaterial({ color: '#a9cce0', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
const lightM = () => M('li', () => new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffe7a8', emissiveIntensity: 0.9 }));
const tailM = () => M('ta', () => new THREE.MeshStandardMaterial({ color: '#b01818', emissive: '#6a0808', emissiveIntensity: 0.8 }));
const seatM = () => M('se', () => mat('#5b3b26', { roughness: 0.65 }));

function kit(parent) {
  const P = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, p = parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); p.add(o); return o; };
  const B = (w, h, d, m, x, y, z, rx = 0, p = parent) => P(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, 0, 0, p);
  const tube = (a, b, r, m, p = parent) => {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A);
    const t = P(new THREE.CylinderGeometry(r, r, d.length(), 8), m, (A.x + Bv.x) / 2, (A.y + Bv.y) / 2, (A.z + Bv.z) / 2, 0, 0, 0, p);
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return t;
  };
  return { P, B, tube };
}

// atvērts visurgājējs ar drošības loku (lai brauciēji labi redzami). Lielāks (×1,2) — 4 braucējiem un mājdzīvniekiem.
// Virsmas nekur nesakrīt vienā plaknē (citādi krāsas „mirgo” — z-fighting).
const CAR_S = 1.2;
export function buildCar(color = '#3a7d44') {
  const root = new THREE.Group(), body = new THREE.Group(), shell = new THREE.Group();
  root.add(body);
  body.add(shell);
  shell.scale.setScalar(CAR_S);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const { P, B, tube } = kit(shell);
  const dark = darkM(), chrome = chromeM();
  B(1.62, 0.5, 3.1, paint, 0, 0.8, 0);                 // kārba (augša 1.05)
  B(1.5, 0.3, 1.0, paint, 0, 1.19, 1.0);               // motora pārsegs (līdz z 1.5)
  B(1.7, 0.1, 3.18, dark, 0, 0.52, 0);                 // slieksnis
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B(0.32, 0.08, 1.08, paint, sx * 0.91, 1.09, sz * 1.05); // spārni virs riteņiem
    B(0.05, 0.26, 1.04, dark, sx * 0.865, 0.93, sz * 1.05);
  }
  B(1.24, 0.44, 0.05, dark, 0, 0.98, 1.57);            // reste
  for (let i = -3; i <= 3; i++) B(0.04, 0.38, 0.05, chrome, i * 0.15, 0.98, 1.6);
  for (const sx of [-1, 1]) {
    P(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16), lightM(), sx * 0.6, 1.08, 1.6, Math.PI / 2);
    P(new THREE.TorusGeometry(0.125, 0.02, 6, 16), chrome, sx * 0.6, 1.08, 1.645);
    B(0.12, 0.14, 0.04, tailM(), sx * 0.68, 0.92, -1.58);
  }
  B(1.84, 0.14, 0.16, dark, 0, 0.64, 1.67);            // buferi
  B(1.84, 0.14, 0.16, dark, 0, 0.64, -1.65);
  // vējstikls ar rāmi
  const wy = 1.38, wz = 0.4;
  B(1.46, 0.5, 0.025, glassM(), 0, wy, wz, -0.28);
  B(1.56, 0.05, 0.07, dark, 0, wy + 0.27, wz - 0.07, -0.28);
  for (const sx of [-1, 1]) B(0.05, 0.56, 0.07, dark, sx * 0.76, wy, wz, -0.28);
  // sēdekļi (virs grīdas, nevis tajā pašā plaknē), stūre
  for (const sx of [-1, 1]) {
    B(0.56, 0.14, 0.55, seatM(), sx * 0.38, 1.1, -0.25);
    B(0.56, 0.6, 0.12, seatM(), sx * 0.38, 1.42, -0.58, -0.15);
  }
  tube([-0.38, 1.07, 0.5], [-0.38, 1.4, 0.18], 0.025, dark);
  P(new THREE.TorusGeometry(0.17, 0.025, 8, 22), dark, -0.38, 1.43, 0.15, -1.0);
  B(1.44, 0.14, 0.55, seatM(), 0, 1.1, -1.15);         // aizmugures sēdeklis
  B(1.44, 0.5, 0.1, seatM(), 0, 1.38, -1.47, -0.12);
  // drošības loks un rezerves ritenis
  tube([-0.76, 1.06, -0.82], [-0.76, 1.86, -0.82], 0.04, dark);
  tube([0.76, 1.06, -0.82], [0.76, 1.86, -0.82], 0.04, dark);
  tube([-0.76, 1.86, -0.82], [0.76, 1.86, -0.82], 0.04, dark);
  tube([-0.76, 1.86, -0.82], [-0.76, 1.08, -1.52], 0.035, dark);
  tube([0.76, 1.86, -0.82], [0.76, 1.08, -1.52], 0.035, dark);
  const spare = P(tyreGeo(0.38, 0.26), rubberM(), 0, 1.05, -1.78, 0, Math.PI / 2, 0);
  spare.rotation.set(0, Math.PI / 2, 0);
  // riteņi (priekšējie stūrējas)
  const wheels = [], steer = [];
  for (const [x, z] of [[-0.88, 1.05], [0.88, 1.05], [-0.88, -1.05], [0.88, -1.05]]) {
    const st = new THREE.Group(); st.position.set(x, 0.42, z); shell.add(st);
    const w = new THREE.Group(); st.add(w);
    P(tyreGeo(0.42, 0.32), rubberM(), 0, 0, 0, 0, 0, 0, w);
    P(new THREE.CylinderGeometry(0.22, 0.22, 0.27, 14), chrome, 0, 0, 0, 0, 0, Math.PI / 2, w);
    for (let k = 0; k < 4; k++) B(0.34, 0.05, 0.4, dark, 0, 0, 0, k / 4 * Math.PI, w);
    wheels.push(w);
    if (z > 0) steer.push(st);
  }
  // sēdvietas un mājdzīvnieku vietas — nemērogotā grupā (tēli paliek parastā lielumā)
  const at = (x, y, z) => { const g = new THREE.Group(); g.position.set(x * CAR_S, y * CAR_S, z * CAR_S); body.add(g); return g; };
  const lift = 1.17 * CAR_S - 1.05; // sēdekļa virsma (tēla sēdēšanas pozai kā iepriekš)
  const seats = [[-0.38, -0.25], [0.38, -0.25], [-0.38, -1.15], [0.38, -1.15]].map(([x, z]) => { const g = at(x, 0, z); g.position.y = 0.86 + lift; return g; });
  const petSpots = [at(0, 1.17, -1.12), at(0, 1.07, -0.3), at(-0.35, 1.34, 1.05), at(0.35, 1.34, 1.05)];
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  optimizeRig(shell);
  const shadow = makeBlobShadow(4.6); shadow.position.y = 0.04; root.add(shadow);
  return { kind: 'car', root, body, wheels, steer, seat: seats[0], seats, petSpots, wheelR: 0.42 * CAR_S };
}

// sniega motocikls: divas slēpes priekšā, kāpurķēde aizmugurē
export function buildSled(color = '#d8262a') {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const { P, B, tube } = kit(body);
  const dark = darkM(), chrome = chromeM();
  const nose = P(new THREE.CapsuleGeometry(0.36, 0.8, 6, 14), paint, 0, 0.62, 0.72, Math.PI / 2 - 0.25);
  nose.scale.set(1.15, 1, 0.75);
  B(0.92, 0.3, 1.0, paint, 0, 0.74, 0.45);
  B(0.98, 0.26, 1.7, paint, 0, 0.56, -0.45);
  B(0.56, 0.2, 1.15, seatM(), 0, 0.84, -0.55);
  B(0.8, 0.42, 0.03, glassM(), 0, 1.06, 0.2, -0.55);
  P(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 14), lightM(), 0, 0.8, 1.16, Math.PI / 2 - 0.3);
  B(0.5, 0.08, 0.04, tailM(), 0, 0.62, -1.31);
  // stūre
  tube([0, 0.86, 0.2], [0, 1.02, 0.05], 0.03, dark);
  tube([-0.36, 1.04, 0.02], [0.36, 1.04, 0.02], 0.022, chrome);
  for (const sx of [-1, 1]) P(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), dark, sx * 0.4, 1.04, 0.02, 0, 0, Math.PI / 2);
  // kāpurķēde ar rullīšiem
  B(0.6, 0.3, 1.5, rubberM(), 0, 0.2, -0.7);
  for (let i = 0; i < 4; i++) P(new THREE.CylinderGeometry(0.12, 0.12, 0.64, 12), dark, 0, 0.17, -1.35 + i * 0.42, 0, 0, Math.PI / 2);
  // slēpes ar balstiem
  for (const sx of [-1, 1]) {
    B(0.15, 0.05, 1.15, dark, sx * 0.46, 0.05, 0.7);
    B(0.15, 0.05, 0.3, dark, sx * 0.46, 0.12, 1.36, -0.6);
    tube([sx * 0.46, 0.08, 0.75], [sx * 0.3, 0.55, 0.65], 0.03, chrome);
  }
  // 2 sēdvietas: vadītājs un pasažieris aiz viņa
  const seats = [-0.45, -1.0].map((z, i) => { const s = new THREE.Group(); s.position.set(0, 0.8 + i * 0.03, z); body.add(s); return s; });
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  optimizeRig(body);
  const shadow = makeBlobShadow(2.8); shadow.position.y = 0.04; root.add(shadow);
  const petSpots = [new THREE.Group()]; petSpots[0].position.set(0, 0.86, -1.32); body.add(petSpots[0]);
  return { kind: 'sled', root, body, wheels: [], steer: [], seat: seats[0], seats, petSpots, wheelR: 1 };
}

// velosipēds: rāmis, divi riteņi ar spieķiem, stūre ar groziņu (tur var braukt mājdzīvnieks), sēdeklis un pedāļi
export function buildBike(color = '#d23b3b') {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.15 });
  const { P, B, tube } = kit(body);
  const dark = darkM(), chrome = chromeM();
  const R = 0.34, wz = 0.56;
  // rāmis (dimanta forma)
  const bb = [0, 0.32, -0.04], st = [0, 0.86, -0.2], ht = [0, 0.86, 0.36], htL = [0, 0.66, 0.42];
  tube(bb, st, 0.025, paint); tube(st, ht, 0.022, paint); tube(bb, htL, 0.026, paint);
  tube(bb, [0, R, -wz], 0.016, paint); tube(st, [0, R, -wz], 0.015, paint);
  tube(htL, ht, 0.028, paint);
  // sēdeklis
  tube(st, [0, 0.95, -0.22], 0.016, chrome);
  const sad = P(new THREE.CapsuleGeometry(0.06, 0.16, 4, 8), seatM(), 0, 0.97, -0.2, Math.PI / 2, 0, 0); sad.scale.set(1.1, 1, 0.5);
  // aizmugures ritenis
  const wheels = [];
  const mkWheel = (z, parent) => {
    const w = new THREE.Group(); w.position.set(0, R, z); parent.add(w);
    const ty = new THREE.Mesh(new THREE.TorusGeometry(R - 0.025, 0.03, 8, 28), rubberM()); ty.rotation.y = Math.PI / 2; w.add(ty);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.055, 0.008, 5, 28), chrome); rim.rotation.y = Math.PI / 2; w.add(rim);
    for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 2 * (R - 0.06), 3), chrome); sp.rotation.x = i / 8 * Math.PI; w.add(sp); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 8), dark); hub.rotation.z = Math.PI / 2; w.add(hub);
    wheels.push(w);
    return w;
  };
  mkWheel(-wz, body);
  // stūre + dakša + priekšējais ritenis + groziņš (pagriežas kopā)
  const steer = new THREE.Group(); steer.position.set(0, 0, 0.42); body.add(steer);
  const sk = kit(steer);
  sk.tube([0, R, 0.14], [0, 0.7, -0.02], 0.016, chrome);
  sk.tube([0, 0.7, -0.02], [0, 1.02, -0.08], 0.018, dark);
  sk.tube([-0.26, 1.02, -0.1], [0.26, 1.02, -0.1], 0.014, dark);
  for (const s of [-1, 1]) sk.P(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), mat('#2a2a2a', { roughness: 0.9 }), s * 0.28, 1.02, -0.1, 0, 0, Math.PI / 2);
  mkWheel(0.14, steer);
  const basket = new THREE.Group(); basket.position.set(0, 0.9, 0.12); steer.add(basket);
  const wick = mat('#b08a4a', { roughness: 0.95 });
  kit(basket).B(0.34, 0.02, 0.26, wick, 0, 0, 0);
  for (const [x, z, w, d] of [[0, 0.13, 0.34, 0.015], [0, -0.13, 0.34, 0.015], [0.17, 0, 0.015, 0.26], [-0.17, 0, 0.015, 0.26]]) kit(basket).B(w, 0.2, d, wick, x, 0.1, z);
  P(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), lightM(), 0, 0.78, 0.62, Math.PI / 2, 0, 0);
  // pedāļi
  const crank = new THREE.Group(); crank.position.set(0, 0.32, -0.04); body.add(crank);
  const ck = kit(crank);
  ck.P(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 14), chrome, 0.05, 0, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) { ck.B(0.02, 0.17, 0.03, chrome, s * 0.07, s * 0.08, 0); ck.B(0.1, 0.02, 0.06, dark, s * 0.12, s * 0.16, 0); }
  tube([0.05, 0.32, -0.04], [0.05, R, -wz], 0.006, dark); // ķēde
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const seat = new THREE.Group(); seat.position.set(0, 0.43, -0.16); body.add(seat);
  const petSpot = new THREE.Group(); petSpot.position.set(0, 0.03, 0); basket.add(petSpot);
  petSpot.scale.setScalar(0.6);
  const shadow = makeBlobShadow(1.7); shadow.position.y = 0.04; shadow.scale.set(0.45, 1, 1); root.add(shadow);
  return { kind: 'bike', root, body, wheels, steer: [steer], seat, seats: [seat], petSpots: [petSpot], wheelR: R, crank };
}

const buildVeh = (kind, color) => (kind === 'car' ? buildCar(color) : kind === 'bike' ? buildBike(color) : buildSled(color));

// zemes slīpums: kāpums uz priekšu un uz sāniem (reljefa funkcija h)
// Mērām pie riteņiem (abās asīs/pusēs vidēji), lai virsbūve nedrebētu uz reljefa trijstūru malām.
export function slopeAt(h, x, z, heading, len, wid) {
  const fx = Math.sin(heading), fz = Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
  const at = (a, b) => h(x + fx * a + rx * b, z + fz * a + rz * b);
  const fl = at(len, wid), fr = at(len, -wid), bl = at(-len, wid), br = at(-len, -wid);
  return { pitch: Math.atan2((fl + fr) - (bl + br), 4 * len), roll: Math.atan2((fl + bl) - (fr + br), 4 * wid), y: (fl + fr + bl + br) / 4 };
}

const r2 = (v) => Math.round(v * 100) / 100;
// saglabātais stāvoklis → derīgs transporta ieraksts (vai sākuma vieta)
function cleanVeh(def, saved) {
  const v = { id: def.id, kind: def.kind, color: def.color, zone: def.zone, x: def.x, z: def.z, h: def.h, d: -1 };
  if (saved && ZONES[saved.zone] && Number.isFinite(saved.x) && Number.isFinite(saved.z) && Math.abs(saved.x) < 330 && Math.abs(saved.z) < 330) {
    if (def.kind !== 'sled' || saved.zone === 'n') { v.zone = saved.zone; v.x = saved.x; v.z = saved.z; v.h = Number.isFinite(saved.h) ? saved.h : def.h; }
  }
  return v;
}

// =================== Game papildinājums ===================
export const Vehicles = {
  // klienta transporta stāvoklis (līdz „welcome” — sākuma vietas)
  initVehicles() {
    this.vehs = {};
    for (const d of VEHICLES) this.vehs[d.id] = cleanVeh(d, null);
    // velosipēdu statīvs meža ciematā (metāla loki) ar zīmi
    const rack = new THREE.Group();
    const pipe = (len) => new THREE.CylinderGeometry(0.035, 0.035, len, 8);
    const bar = new THREE.Mesh(pipe(5.4), chromeM()); bar.rotation.x = Math.PI / 2; bar.position.set(0.95, 0.32, 1.875); rack.add(bar);
    for (let i = 0; i < 4; i++) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 16, Math.PI), chromeM());
      loop.position.set(0.95, 0.32, i * 1.25); rack.add(loop);
    }
    for (const z of [-0.8, 4.55]) { const leg = new THREE.Mesh(pipe(0.34), chromeM()); leg.position.set(0.95, 0.17, z); rack.add(leg); }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 8), darkM()); post.position.set(0.95, 0.95, -1.2); rack.add(post);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 20), mat('#2f6fd6', { roughness: 0.5 }));
    plate.rotation.z = Math.PI / 2; plate.position.set(0.95, 1.9, -1.2); rack.add(plate);
    const sign = makeTextSprite('🚲 Velosipēdi', { fontSize: 40, bg: 'rgba(47,111,214,0.85)' });
    sign.position.set(0.95, 2.55, -1.2); rack.add(sign);
    const W = this.world;
    rack.position.set(BIKE_RACK.x, W.getHeight(BIKE_RACK.x, BIKE_RACK.z + 1.9), BIKE_RACK.z);
    rack.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(rack);
  },
  // saimnieks: transports no saimnieka saglabājuma
  hostInitVehs() {
    const saved = this.save.vehs || {};
    this.hs.vehs = {};
    for (const d of VEHICLES) this.hs.vehs[d.id] = cleanVeh(d, saved[d.id]);
  },
  hostVehList() { return Object.values(this.hs.vehs).map((v) => ({ ...v })); },

  // 3D modelis katram transportam (viens, kopīgs: stāv vai brauc)
  vehObj(id) {
    const v = this.vehs[id];
    if (!v) return null;
    if (!v.obj) v.obj = buildVeh(v.kind, v.color);
    return v.obj;
  },

  // no saimnieka: viss saraksts (welcome) vai viens transports (veh)
  applyVehs(list) {
    for (const nv of list || []) this.applyVeh(nv);
  },
  applyVeh(nv) {
    if (!nv || !VDEF[nv.id]) return;
    const v = this.vehs[nv.id] || (this.vehs[nv.id] = cleanVeh(VDEF[nv.id], null));
    const wasMine = v.d === this.myId && this.me && this.me.veh && this.me.veh.id === nv.id;
    v.zone = nv.zone; v.x = nv.x; v.z = nv.z; v.h = nv.h; v.d = nv.d;
    // man piešķirts — iekāpjam
    if (nv.d === this.myId && this.pendingTake && this.pendingTake.id === nv.id) { this.pendingTake = null; this.enterVehicle(nv.id); }
    // kāds cits paņēma, kamēr gaidīju
    else if (this.pendingTake && this.pendingTake.id === nv.id && nv.d !== this.myId && nv.d !== -1) { this.pendingTake = null; toast(`${DEF[v.kind].icon} Ar to jau brauc kāds cits!`, 'bad'); }
    if (wasMine && nv.d !== this.myId) this.exitVehicle(true);
    this.updateParked();
  },

  // stāvošie transporti šajā zemē (izsauc pēc zemes maiņas un stāvokļa izmaiņām)
  updateParked() {
    if (!this.vehs || !this.terr) return;
    for (const id in this.vehs) {
      const v = this.vehs[id];
      if (v.d !== -1) continue; // brauc — to vieto braucējs
      if (v.zone !== this.zone) { if (v.obj) v.obj.root.removeFromParent(); continue; }
      const o = this.vehObj(id);
      if (o.root.parent !== this.stage) this.stage.add(o.root);
      const D = DEF[v.kind];
      const sl = slopeAt((x, z) => this.terr.getHeight(x, z), v.x, v.z, v.h, D.len, D.wid);
      o.root.position.set(v.x, sl.y, v.z);
      o.root.rotation.y = v.h;
      o.body.rotation.set(-sl.pitch, 0, sl.roll + (v.kind === 'bike' ? 0.12 : 0), 'YXZ'); // velosipēds atbalstīts uz kājiņas
      o.root.children[1].position.y = 0.04;
      o.root.visible = true;
      o.visY = null;
    }
  },
  placeParked() { this.updateParked(); },

  // dzeltenā poga: iekāpt jebkurā brīvā transportā vai braukt līdzi draugam
  vehicleActions(consider, d2) {
    if (this.me.veh || this.me.ride || this.me.ski || this.me.lift || this.me.carry) return;
    // tieši blakus mašīnai iekāpšana uzvar citas darbības (piem., aršanu laukā)
    const near = (d, kind) => (d < (kind === 'car' ? 3.2 : 2.4) ? 0.2 * d / 3.2 : d);
    for (const r of this.remotes.values()) {
      if (!r.vehObj || (r.zone || 'c') !== this.zone || r.vehObj.seats.length < 2) continue;
      const sp = r.netVel ? Math.hypot(r.netVel.x, r.netVel.z) : 0;
      if (sp > 4) continue;
      consider(near(d2(r.pos.x, r.pos.z), r.vehObj.kind), r.vehObj.kind === 'car' ? 4.2 : 3.2, `${DEF[r.vehObj.kind].icon} Braukt līdzi: ${r.prof.name}`, () => this.joinRide(r));
    }
    for (const id in this.vehs || {}) {
      const v = this.vehs[id];
      if (v.d !== -1 || v.zone !== this.zone) continue;
      const k = v.kind;
      consider(near(d2(v.x, v.z), k), k === 'car' ? 4.2 : k === 'bike' ? 2.6 : 3.2, `${DEF[k].icon} ${k === 'bike' ? 'Braukt' : 'Sēsties'}: ${VDEF[id].name}`, () => this.requestVehicle(id));
    }
  },

  // lūdzam saimniekam transportu (lai divi nepaņem vienu un to pašu)
  requestVehicle(id) {
    const v = this.vehs[id];
    if (!v || v.d !== -1 || this.me.veh) return;
    this.pendingTake = { id, t: performance.now() };
    this.net.toHost({ t: 'vehTake', id });
    setTimeout(() => { if (this.pendingTake && this.pendingTake.id === id) { this.pendingTake = null; toast('Neizdevās iekāpt — mēģini vēlreiz'); } }, 4000);
  },

  enterVehicle(id) {
    const me = this.me, v = this.vehs[id];
    if (!v || me.veh || me.inKart || me.ride) return;
    if (this.fishing) this.stopFishing();
    const obj = this.vehObj(id), kind = v.kind;
    if (obj.root.parent !== this.stage) this.stage.add(obj.root);
    obj.root.visible = true;
    me.veh = { id, kind, obj, speed: 0, heading: v.h, steer: 0, vy: 0, air: false, visY: null };
    if (kind === 'sled') this.stat('sledRides');
    me.pos.set(v.x, this.terr.getHeight(v.x, v.z), v.z);
    this.stage.remove(this.avatar.root);
    obj.seat.add(this.avatar.root);
    this.avatar.root.position.set(0, 0, 0);
    this.avatar.root.rotation.set(0, 0, 0);
    this.avatar.shadow.visible = false;
    me.state = 'sit';
    this.cam.yaw = v.h + Math.PI;
    $('btn-exit-kart').classList.remove('hidden');
    $('btn-jump').classList.add('hidden');
    { const k = this.vehs[id] && this.vehs[id].kind; sfx(k === 'bike' ? 'bike_bell' : k === 'sled' ? 'st_snow' : 'car_door', { vol: 0.7 }); }
    toast(kind === 'car'
      ? '🚙 Kreisajā pusē ⛽ gāze un 🛑 bremze/atpakaļgaita, labajā ◀ ▶ stūre. Pa grants ceļu var aizbraukt uz citām zemēm!'
      : kind === 'bike' ? '🚲 Min pedāļus ar ⛽, bremzē ar 🛑, stūrē ar ◀ ▶. Groziņā var braukt tavs mājdzīvnieks!'
        : '🛷 Sniega motocikls brauc pa visu sniegu un kalnos! Kreisajā pusē ⛽ gāze un 🛑 bremze, labajā ◀ ▶ stūre.', 'good', 5000);
  },

  // izkāpt: transports paliek tur, kur tas ir (forced — saimnieks to atņēma, piem., pēc atvienošanās)
  exitVehicle(forced = false) {
    const me = this.me, v = me.veh;
    if (!v) return;
    v.obj.seat.remove(this.avatar.root);
    this.stage.add(this.avatar.root);
    this.avatar.shadow.visible = true;
    this.avatar.root.rotation.set(0, me.heading, 0);
    const h = v.heading, side = { x: Math.cos(h), z: -Math.sin(h) };
    const st = this.vehs[v.id];
    if (st) { st.zone = this.zone; st.x = r2(me.pos.x); st.z = r2(me.pos.z); st.h = r2(h); if (!forced) st.d = -1; }
    if (!forced) this.net.toHost({ t: 'vehDrop', id: v.id, zone: this.zone, x: r2(me.pos.x), z: r2(me.pos.z), h: r2(h) });
    // izkāpj kreisajā pusē
    const out = DEF[v.kind].radius + 0.6;
    me.pos.x += side.x * out; me.pos.z += side.z * out;
    this.terr.collide(me.pos, 0.4);
    me.pos.y = this.terr.groundAt(me.pos.x, me.pos.z) + 0.3;
    me.heading = h;
    me.veh = null; me.state = 'idle';
    $('btn-exit-kart').classList.add('hidden');
    $('btn-jump').classList.remove('hidden');
    this.updateParked();
  },

  updateVehicle(dt, mv) {
    const me = this.me, v = me.veh, D = DEF[v.kind], T = this.terr;
    const H = (x, z) => T.getHeight(x, z);
    const ground = H(me.pos.x, me.pos.z);
    const road = T.roadDist ? T.roadDist(me.pos.x, me.pos.z) : 99;
    const onRoad = (road.d !== undefined ? road.d : road) < 4.2;
    const snow = this.zone === 'n';
    const inWater = !!(T.isWorld && T.water) && ground < WATER_Y - 0.4;
    let max = onRoad ? D.road : snow ? D.snowOff : D.off;
    if (inWater) max = 3;
    if (me.iceCream > 0) max *= 1.08;
    // slīpums: kalnā lēnāk, lejā ātrāk
    const sl = slopeAt(H, me.pos.x, me.pos.z, v.heading, D.len, D.wid);
    if (!v.air) {
      const thr = mv.y;
      if (thr > 0.1) v.speed += D.accel * thr * dt * (v.speed < 0 ? 2 : 1);
      else if (thr < -0.1) v.speed -= (v.speed > 0.5 ? D.brake : D.accel * 0.6) * -thr * dt;
      else v.speed *= 1 - (snow && v.kind === 'sled' ? 0.6 : v.kind === 'bike' ? 0.7 : 1.1) * dt;
      v.speed -= 9.8 * Math.sin(sl.pitch) * (v.kind === 'sled' ? 0.45 : 0.6) * dt;
      if (v.speed > max) v.speed = lerp(v.speed, max, 1 - Math.exp(-dt * 2.5));
      v.speed = clamp(v.speed, v.kind === 'bike' ? -3 : -6, 30);
      // stūrēšana: riteņi pagriežas pakāpeniski
      v.steer = lerp(v.steer, -mv.x, 1 - Math.exp(-dt * 8));
      v.heading += v.steer * D.turn * clamp(v.speed / 4, -1, 1) * (1 - Math.min(0.45, Math.abs(v.speed) / 50)) * dt;
    }
    const ox = me.pos.x, oz = me.pos.z;
    me.pos.x += Math.sin(v.heading) * v.speed * dt;
    me.pos.z += Math.cos(v.heading) * v.speed * dt;
    if (T.collide(me.pos, D.radius)) {
      // bremzē tikai tad, ja tiešām atsitas (slīdot gar šķērsli ātrums saglabājas)
      const moved = Math.hypot(me.pos.x - ox, me.pos.z - oz) / Math.max(dt, 1e-4), want = Math.abs(v.speed);
      if (moved < want * 0.6) {
        if (want > 6 && !(v.bumpT > 0)) { sfx('hit', { vol: 0.9, rate: 0.8 }); this.spawnFloat('💥', me.pos); v.bumpT = 1; }
        v.speed = Math.sign(v.speed) * Math.max(Math.min(want, 2.5), want * 0.6);
      }
    }
    v.bumpT = (v.bumpT || 0) - dt;
    if (this.zone === FOREST) this.collideIce(me.pos, D.radius);
    // vertikāli: uz zemes seko vidējam augstumam zem riteņiem; sniega motocikls lielā ātrumā var pacelties gaisā
    const sl2 = slopeAt(H, me.pos.x, me.pos.z, v.heading, D.len, D.wid);
    const g2 = inWater ? WATER_Y - 0.35 : sl2.y;
    const sdt = Math.max(dt, 1e-3);
    if (v.air) {
      v.vy -= 20 * dt;
      me.pos.y += v.vy * dt;
      if (me.pos.y <= g2) { if (v.vy < -6) sfx('hit', { vol: 0.6, rate: 0.7 }); me.pos.y = g2; v.vy = 0; v.air = false; }
    } else {
      const gv = (g2 - me.pos.y) / sdt;
      if (v.kind === 'sled' && Math.abs(v.speed) > 9 && gv < v.vy - 20 * dt - 4) { v.air = true; v.vy -= 20 * dt; me.pos.y += v.vy * dt; }
      else { me.pos.y = g2; v.vy = lerp(v.vy, gv, 0.5); }
    }
    // virsbūve seko reljefam, līkumos sasveras (velosipēds — stipri iekšā līkumā)
    const o = v.obj;
    v.visY = v.visY == null ? me.pos.y : lerp(v.visY, me.pos.y, 1 - Math.exp(-dt * 14));
    o.root.position.set(me.pos.x, v.visY, me.pos.z);
    o.root.rotation.y = v.heading;
    const k = 1 - Math.exp(-dt * (v.air ? 2 : 6));
    const lean = v.kind === 'bike' ? -v.steer * Math.min(1, Math.abs(v.speed) / 6) * 0.3 : -v.steer * Math.min(1, Math.abs(v.speed) / 15) * 0.05;
    o.body.rotation.order = 'YXZ';
    o.body.rotation.x = lerp(o.body.rotation.x, v.air ? -0.12 : -sl2.pitch, k);
    o.body.rotation.z = lerp(o.body.rotation.z, (v.air || v.kind === 'bike' ? 0 : sl2.roll) + lean, k);
    for (const w of o.wheels) w.rotation.x += v.speed * dt / o.wheelR;
    if (o.crank) o.crank.rotation.x += v.speed * dt / o.wheelR * 0.45;
    for (const s of o.steer) s.rotation.y = v.steer * (v.kind === 'bike' ? 0.35 : 0.45);
    o.root.children[1].position.y = g2 - v.visY + 0.04; // ēna paliek uz zemes
    me.heading = v.heading;
    me.state = 'sit';
    this.avatar.animate(dt, v.kind === 'bike' ? 'bike' : 'sit', Math.abs(v.speed));
    this.avatar.head.rotation.y = -v.steer * 0.35;
  },

  // pie robežas: sniega motocikls paliek Ziemas zemē
  vehicleBlocksExit(warn) {
    if (this.me.veh && this.me.veh.kind === 'sled') { warn('🛷 Sniega motocikls brauc tikai pa sniegu — izkāp un ej kājām vai ņem mašīnu!'); return true; }
    return false;
  },

  // pēc pārejas uz citu zemi ar transportu
  vehicleZoneChanged(heading) {
    const v = this.me.veh;
    if (v) {
      if (heading != null) v.heading = heading;
      v.vy = 0; v.air = false; v.visY = null; v.speed = Math.min(v.speed, 8);
      if (v.kind === 'car') this.stat('carTrips');
      const st = this.vehs[v.id]; if (st) st.zone = this.zone;
    }
    this.updateParked();
  },

  // pos ziņas lauki: [transporta kods] un [transporta id]
  vehCode() { return this.me.bus ? BUS_CODE : this.me.veh ? VEH_CODE[this.me.veh.kind] : this.me.ride ? RIDE_CODE : 0; },
  vehIdInfo() { return this.me.veh ? this.me.veh.id : ''; },
  // papildu lauki pos ziņai (pasažierim — vadītājs un sēdvieta)
  rideInfo() { return this.me.ride ? [this.me.ride.driver, this.me.ride.seat] : this.me.bus ? [-1, this.me.bus.net] : [-1, 0]; },

  // aizņemtās sēdvietas vadītāja mašīnā (0 — vadītājs)
  takenSeats(driverId, exceptId) {
    const t = new Set([0]);
    for (const r of this.remotes.values()) if (r.id !== exceptId && r.vehCode === RIDE_CODE && r.rideDriver === driverId) t.add(r.rideSeat);
    if (exceptId !== this.myId && this.me.ride && this.me.ride.driver === driverId) t.add(this.me.ride.seat);
    return t;
  },

  // ---------- pasažieris drauga mašīnā ----------
  joinRide(r) {
    const me = this.me;
    if (me.veh || me.inKart || me.ride || !r.vehObj) return;
    const taken = this.takenSeats(r.id, this.myId);
    const seat = r.vehObj.seats.findIndex((_, i) => !taken.has(i));
    if (seat < 0) { toast(`${DEF[r.vehObj.kind].icon} Nav brīvu vietu — visas aizņemtas!`, 'bad'); return; }
    if (this.fishing) this.stopFishing();
    me.ride = { driver: r.id, seat, kind: r.vehObj.kind };
    this.avatar.shadow.visible = false;
    me.state = 'sit';
    $('btn-exit-kart').classList.remove('hidden');
    $('btn-jump').classList.add('hidden');
    sfx('car_door', { vol: 0.7 });
    toast(`${DEF[r.vehObj.kind].icon} Brauc līdzi: ${r.prof.name}! Vada ${r.prof.name}, tu vari skatīties apkārt.`, 'good', 4000);
  },

  leaveRide(msg) {
    const me = this.me, R = me.ride;
    if (!R) return;
    me.ride = null;
    this.stage.add(this.avatar.root);
    this.avatar.root.rotation.set(0, me.heading, 0);
    this.avatar.shadow.visible = true;
    // izkāpj blakus mašīnai (kreisās vietas — pa kreisi, labās — pa labi)
    const side = R.seat % 2 === 0 ? 1 : -1, h = me.heading;
    me.pos.x += Math.cos(h) * 2.3 * side; me.pos.z -= Math.sin(h) * 2.3 * side;
    this.terr.collide(me.pos, 0.4);
    me.pos.y = this.terr.groundAt(me.pos.x, me.pos.z) + 0.3;
    this.avatar.root.position.copy(me.pos);
    me.state = 'idle';
    $('btn-exit-kart').classList.add('hidden');
    $('btn-jump').classList.remove('hidden');
    if (msg) toast(msg);
  },

  updateRide(dt) {
    const me = this.me, R = me.ride, r = this.remotes.get(R.driver);
    if (!r || !DRIVE_CODES.has(r.vehCode)) { this.leaveRide('🚶 Vadītājs izkāpa — tu arī izkāpi'); return; }
    const rz = r.zone || 'c';
    if (rz !== this.zone) {
      // vadītājs aizbrauca uz citu zemi — braucam līdzi
      if (!this.zoneBusy) {
        const side = Object.keys(DIRS).find((sd) => neighbour(this.zone, sd) === rz);
        if (side) this.travel(rz, side); else this.leaveRide();
      }
      return;
    }
    // ja kāds ar mazāku id sēž tajā pašā vietā — pārsēžamies uz brīvu
    for (const o of this.remotes.values()) {
      if (o.vehCode === RIDE_CODE && o.rideDriver === R.driver && o.rideSeat === R.seat && o.id < this.myId) {
        const taken = this.takenSeats(R.driver, this.myId), n = r.vehObj ? r.vehObj.seats.length : 2;
        let free = -1;
        for (let i = 1; i < n; i++) if (!taken.has(i)) { free = i; break; }
        if (free < 0) { this.leaveRide('Mašīnā vairs nav vietas'); return; }
        R.seat = free;
      }
    }
    me.pos.copy(r.pos);
    me.heading = r.ry;
    me.vy = 0; me.onGround = true;
    const seatObj = r.vehObj && r.vehObj.seats[R.seat];
    if (seatObj && this.avatar.root.parent !== seatObj) {
      seatObj.add(this.avatar.root);
      this.avatar.root.position.set(0, 0, 0); this.avatar.root.rotation.set(0, 0, 0);
    }
    me.state = 'sit';
    this.avatar.animate(dt, 'sit', 0);
  },

  // draugu transports (kopīgais modelis no this.vehs) un pasažieri tajā; true — avatārs apstrādāts šeit
  vehicleRemote(r, here, prev, dt) {
    if (this.busRemote && this.busRemote(r, here, dt)) return true;
    const kind = CODE_KIND[r.vehCode] || null;
    const vid = kind && r.vehId && this.vehs[r.vehId] ? r.vehId : null;
    // draugs vairs nebrauc ar iepriekšējo transportu — tas paliek stāvam turpat (saimnieka „veh” ziņa to precizēs)
    if (r.lastVid && r.lastVid !== vid) {
      const old = this.vehs[r.lastVid];
      if (old && old.d === r.id) { old.d = -1; old.zone = r.zone || 'c'; old.x = r.pos.x; old.z = r.pos.z; old.h = r.ry; }
      r.lastVid = null;
    }
    if (r.vehObj && (!vid || r.vehObj !== this.vehs[vid].obj || !here)) {
      if (!(this.me.veh && this.me.veh.obj === r.vehObj)) r.vehObj.root.removeFromParent();
      r.vehObj = null;
      this.updateParked();
    }
    if (vid) r.lastVid = vid;
    // pasažieris: sēž vadītāja (mana vai drauga) mašīnā
    if (r.vehCode === RIDE_CODE && here) {
      let car = null;
      if (r.rideDriver === this.myId) car = this.me.veh && this.me.veh.obj;
      else { const d = this.remotes.get(r.rideDriver); car = d && d.vehObj; }
      const seatObj = car && car.seats[r.rideSeat];
      if (seatObj) {
        if (r.avatar.root.parent !== seatObj) { seatObj.add(r.avatar.root); r.avatar.root.position.set(0, 0, 0); r.avatar.root.rotation.set(0, 0, 0); }
        r.avatar.shadow.visible = false;
        r.avatar.root.visible = true;
        r.avatar.animate(dt, 'sit', 0);
        if (this.winterRemote) this.winterRemote(r, here);
        return true;
      }
    }
    if (!vid) {
      // vairs nesēž nekur — atpakaļ uz zemes
      if (!r.kart && r.avatar.root.parent !== this.stage) { this.stage.add(r.avatar.root); r.avatar.shadow.visible = true; r.avatar.root.rotation.set(0, r.ry, 0); }
      return false;
    }
    const st = this.vehs[vid];
    st.d = r.id; st.zone = r.zone || 'c';
    if (!here) { r.avatar.root.visible = false; return true; }
    if (!r.vehObj) {
      r.vehObj = this.vehObj(vid);
      if (r.vehObj.root.parent !== this.stage) this.stage.add(r.vehObj.root);
      r.vehObj.root.visible = true;
      r.vehObj.visY = null;
    }
    if (r.avatar.root.parent !== r.vehObj.seat) {
      r.vehObj.seat.add(r.avatar.root);
      r.avatar.root.position.set(0, 0, 0); r.avatar.root.rotation.set(0, 0, 0);
      r.avatar.shadow.visible = false;
      r.avatar.root.visible = true;
    }
    const o = r.vehObj, H = (x, z) => this.terr.getHeight(x, z);
    const sl = slopeAt(H, r.pos.x, r.pos.z, r.ry, DEF[kind].len, DEF[kind].wid);
    // uz zemes — vidējais augstums zem riteņiem; sniega motocikls lēcienā var būt augstāk
    const ty = kind === 'sled' ? Math.max(sl.y, r.pos.y) : sl.y;
    o.visY = o.visY == null ? ty : lerp(o.visY, ty, 1 - Math.exp(-dt * 14));
    o.root.position.set(r.pos.x, o.visY, r.pos.z);
    o.root.rotation.y = r.ry;
    const k = 1 - Math.exp(-dt * 6);
    // stūres leņķis no virziena maiņas ātruma
    let dh = r.ry - (r.prevRy == null ? r.ry : r.prevRy); dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    r.prevRy = r.ry;
    const sp = prev.distanceTo(r.pos) / Math.max(dt, 0.001);
    const steer = clamp(dh / Math.max(dt, 1e-3) / Math.max(1, sp * 0.3), -1, 1);
    r.steerS = lerp(r.steerS || 0, steer, 1 - Math.exp(-dt * 6));
    const lean = kind === 'bike' ? -r.steerS * Math.min(1, sp / 6) * 0.3 : 0;
    o.body.rotation.order = 'YXZ';
    o.body.rotation.x = lerp(o.body.rotation.x, -sl.pitch, k);
    o.body.rotation.z = lerp(o.body.rotation.z, (kind === 'bike' ? 0 : sl.roll) + lean, k);
    for (const w of o.wheels) w.rotation.x += sp * dt / o.wheelR;
    if (o.crank) o.crank.rotation.x += sp * dt / o.wheelR * 0.45;
    for (const s of o.steer) s.rotation.y = r.steerS * 0.35;
    o.root.children[1].position.y = sl.y - o.visY + 0.04;
    r.avatar.animate(dt, kind === 'bike' ? 'bike' : 'sit', sp);
    if (this.winterRemote) this.winterRemote(r, here);
    return true;
  },

  // vai draugs brauc ar transportu / ir pasažieris (attālo pozīciju prognozei)
  remoteMoving(r) { return DRIVE_CODES.has(r.vehCode) || r.vehCode === RIDE_CODE; },

  removeRemoteVehicle(r) {
    if (r.vehObj) { r.vehObj.root.removeFromParent(); r.vehObj = null; }
  },

  // kartei: transporta vietas (stāvošie — no stāvokļa, braucošie — no braucēja pozīcijas)
  vehMarkers() {
    const out = [];
    for (const id in this.vehs || {}) {
      const v = this.vehs[id];
      let zone = v.zone, x = v.x, z = v.z;
      if (v.d === this.myId && this.me.veh && this.me.veh.id === id) { zone = this.zone; x = this.me.pos.x; z = this.me.pos.z; }
      else if (v.d !== -1) { const r = this.remotes.get(v.d); if (r) { zone = r.zone || 'c'; x = r.pos.x; z = r.pos.z; } }
      out.push({ id, kind: v.kind, color: v.color, zone, x, z, driven: v.d !== -1 });
    }
    return out;
  },

  // ---------- saimnieka puse ----------
  hostVeh(from, m) {
    const hs = this.hs, v = hs.vehs && hs.vehs[m.id];
    if (!v) return true;
    if (m.t === 'vehTake') {
      if (v.d !== -1 && hs.profiles.has(v.d) && v.d !== from) { this.net.sendTo(from, { t: 'veh', v: { ...v } }); return true; }
      // katram var būt tikai viens transports
      for (const o of Object.values(hs.vehs)) if (o.d === from && o !== v) { o.d = -1; this.net.broadcast({ t: 'veh', v: { ...o } }); }
      v.d = from;
    } else if (m.t === 'vehDrop') {
      if (v.d !== from) return true;
      v.d = -1;
      if (ZONES[m.zone] && Number.isFinite(m.x) && Number.isFinite(m.z)) { v.zone = m.zone; v.x = m.x; v.z = m.z; v.h = Number.isFinite(m.h) ? m.h : v.h; }
    }
    this.vehDirty = true;
    this.net.broadcast({ t: 'veh', v: { ...v } });
    return true;
  },
  // saimnieks: braucēja pozīcija → transporta vieta (lai jauni spēlētāji un saglabājums zina, kur tas ir)
  hostVehPos(from, p) {
    const id = p[10], v = id && this.hs.vehs ? this.hs.vehs[id] : null;
    if (!v || v.d !== from || !DRIVE_CODES.has(p[5])) return;
    v.zone = ZONE_IDS[p[7] | 0] || v.zone; v.x = p[0]; v.z = p[2]; v.h = p[3];
    this.vehDirty = true;
  },
  hostVehLeave(id) {
    for (const v of Object.values(this.hs.vehs || {})) if (v.d === id) { v.d = -1; this.vehDirty = true; this.net.broadcast({ t: 'veh', v: { ...v } }); }
  },
  // saimnieka saglabājumā — kur katrs transports stāv
  hostVehSave() {
    if (!this.vehDirty || !this.hs || !this.hs.vehs) return;
    this.vehDirty = false;
    const out = {};
    for (const v of Object.values(this.hs.vehs)) out[v.id] = { zone: v.zone, x: r2(v.x), z: r2(v.z), h: r2(v.h) };
    this.save.vehs = out;
  },
};

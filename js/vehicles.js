// Transportlīdzekļi: 🚙 mašīna (visurgājējs, brauc pa grants ceļiem visās zemēs un pāri robežām)
// un 🛷 sniega motocikls (tikai Ziemas zemē). Abi stāv stāvvietās; izkāpjot mašīna paliek, kur atstāta.
// Vehicles — Game papildinājums: iekāpšana, braukšana pa jebkuru reljefu, slīpums, lēcieni, draugu transports.
import * as THREE from 'three';
import { mat, lerp, clamp, makeBlobShadow } from './util.js?v=1.17.0';
import { optimizeRig, tyreGeo } from './characters.js?v=1.17.0';
import { $, toast, sfx } from './ui.js?v=1.17.0';
import { DIRS, openSides, neighbour, FARM, FOREST, RACE, ZONE_IDS } from './zones.js?v=1.17.0';
import { CAR_SPOT, FARM_CAR, WATER_Y } from './world.js?v=1.17.0';
import { WINTER_CAR, SLED_SPOT } from './winter.js?v=1.17.0';

// tīkla kods (pos ziņas 6. lauks): 1 = kartings, 2 = mašīna, 3 = sniega motocikls
export const VEH_CODE = { car: 2, sled: 3 }; // 4 = pasažieris (p[8] — vadītāja id, p[9] — sēdvieta)
export const RIDE_CODE = 4;
const CODE_KIND = { 2: 'car', 3: 'sled' };
const DEF = {
  car: { name: 'mašīna', icon: '🚙', road: 19, off: 10, snowOff: 6.5, accel: 9, brake: 16, turn: 1.7, radius: 1.75, len: 1.26, wid: 1.04, cam: 10.5 },
  sled: { name: 'sniega motocikls', icon: '🛷', road: 17, off: 20, snowOff: 20, accel: 11, brake: 14, turn: 2.1, radius: 1.1, len: 0.9, wid: 0.46, cam: 8 },
};

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

const buildVeh = (kind, color) => (kind === 'car' ? buildCar(color) : buildSled(color));

// kur katrā zemē stāv mašīna / sniega motocikls
function spots(zone, game) {
  if (zone === FOREST) return [{ kind: 'car', ...CAR_SPOT }];
  if (zone === FARM) return [{ kind: 'car', ...FARM_CAR }];
  if (zone === RACE) return [{ kind: 'car', ...game.raceW.carSpot }];
  if (zone === 'n') return [{ kind: 'car', ...WINTER_CAR }, { kind: 'sled', ...SLED_SPOT }];
  const s = openSides(zone)[0], [dx, dz] = DIRS[s];
  return [{ kind: 'car', x: -dz * 7, z: dx * 7, heading: Math.atan2(dx, dz) }];
}

// zemes slīpums: kāpums uz priekšu un uz sāniem (reljefa funkcija h)
// Mērām pie riteņiem (abās asīs/pusēs vidēji), lai virsbūve nedrebētu uz reljefa trijstūru malām.
export function slopeAt(h, x, z, heading, len, wid) {
  const fx = Math.sin(heading), fz = Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
  const at = (a, b) => h(x + fx * a + rx * b, z + fz * a + rz * b);
  const fl = at(len, wid), fr = at(len, -wid), bl = at(-len, wid), br = at(-len, -wid);
  return { pitch: Math.atan2((fl + fr) - (bl + br), 4 * len), roll: Math.atan2((fl + bl) - (fr + br), 4 * wid), y: (fl + fr + bl + br) / 4 };
}

// =================== Game papildinājums ===================
export const Vehicles = {
  // stāvvietas ar transportu šajā zemē (izsauc pēc zemes ielādes)
  placeParked() {
    this.parked = this.parked || {};
    const list = spots(this.zone, this);
    for (const k of ['car', 'sled']) if (this.parked[k]) this.parked[k].obj.root.visible = false;
    for (const s of list) {
      const p = this.parked[s.kind] || (this.parked[s.kind] = { obj: buildVeh(s.kind, s.kind === 'car' ? '#3a7d44' : '#d8262a') });
      if (!p.obj.root.parent) this.stage.add(p.obj.root);
      p.spot = s;
      const y = this.terr.getHeight(s.x, s.z);
      p.obj.root.position.set(s.x, y, s.z);
      p.obj.root.rotation.y = s.heading;
      const sl = slopeAt((x, z) => this.terr.getHeight(x, z), s.x, s.z, s.heading, DEF[s.kind].len, DEF[s.kind].wid);
      p.obj.body.rotation.set(-sl.pitch, 0, sl.roll, 'YXZ');
      p.obj.root.visible = true;
    }
    // paša atstātā mašīna citā zemē paliek tur — šeit tās nav
    // (tā paliek tajā zemē — draugi to tur redz; atgriežoties tā atkal ir vietā)
    const mp = this.myParked;
    if (mp && mp.zone !== this.zone) mp.obj.root.removeFromParent();
    else if (mp && !mp.obj.root.parent) this.stage.add(mp.obj.root);
    // draugu atstātās mašīnas šajā zemē
    if (this.remotes) for (const r of this.remotes.values()) { r.parkKey = null; this.remoteParked(r, r.parkE); }
  },

  // dzeltenā poga: iekāpt (no stāvvietas vai savā atstātajā mašīnā)
  vehicleActions(consider, d2) {
    if (this.me.veh || this.me.ride || this.me.ski || this.me.lift) return;
    // tieši blakus mašīnai iekāpšana uzvar citas darbības (piem., aršanu laukā)
    const near = (d, kind) => (d < (kind === 'car' ? 3.2 : 2.4) ? 0.2 * d / 3.2 : d);
    // braukt līdzi draugam (viņa mašīnai jābūt apstājušās vai lēnai)
    for (const r of this.remotes.values()) {
      if (!r.vehObj || (r.zone || 'c') !== this.zone) continue;
      const sp = r.netVel ? Math.hypot(r.netVel.x, r.netVel.z) : 0;
      if (sp > 4) continue;
      consider(near(d2(r.pos.x, r.pos.z), r.vehObj.kind), r.vehObj.kind === 'car' ? 4.2 : 3.2, `${DEF[r.vehObj.kind].icon} Braukt līdzi: ${r.prof.name}`, () => this.joinRide(r));
    }
    const mp = this.myParked && this.myParked.zone === this.zone ? this.myParked : null;
    if (mp) consider(near(d2(mp.x, mp.z), mp.kind), mp.kind === 'car' ? 4.2 : 3.2, `${DEF[mp.kind].icon} Sēsties: ${DEF[mp.kind].name}`, () => this.enterVehicle(mp.kind, mp));
    for (const k in this.parked || {}) {
      const p = this.parked[k];
      if (!p.spot || !p.obj.root.visible) continue;
      consider(near(d2(p.spot.x, p.spot.z), k), k === 'car' ? 4.2 : 3.2, `${DEF[k].icon} Sēsties: ${DEF[k].name}`, () => this.enterVehicle(k, null));
    }
  },

  enterVehicle(kind, mine) {
    const me = this.me;
    if (me.veh || me.inKart || me.ride) return;
    if (this.fishing) this.stopFishing();
    let obj, x, z, heading;
    if (mine) { obj = mine.obj; x = mine.x; z = mine.z; heading = mine.heading; this.myParked = null; }
    else {
      if (this.myParked && this.myParked.kind === kind) { this.myParked.obj.root.removeFromParent(); this.myParked = null; }
      const p = this.parked[kind];
      obj = buildVeh(kind, this.kartColorHex(this.save.kartColor));
      x = p.spot.x; z = p.spot.z; heading = p.spot.heading;
      p.obj.root.visible = false; // stāvvietā tagad tukšs (atkal parādās, kad aizbrauc tālāk)
      this.stage.add(obj.root);
    }
    me.veh = { kind, obj, speed: 0, heading, steer: 0, vy: 0, air: false, visY: null };
    if (kind === 'sled') this.stat('sledRides');
    me.pos.set(x, this.terr.getHeight(x, z), z);
    this.stage.remove(this.avatar.root);
    obj.seat.add(this.avatar.root);
    this.avatar.root.position.set(0, 0, 0);
    this.avatar.root.rotation.set(0, 0, 0);
    this.avatar.shadow.visible = false;
    me.state = 'sit';
    this.cam.yaw = heading + Math.PI;
    $('btn-exit-kart').classList.remove('hidden');
    $('btn-jump').classList.add('hidden');
    sfx('beep');
    toast(kind === 'car'
      ? '🚙 Kreisajā pusē ⛽ gāze un 🛑 bremze/atpakaļgaita, labajā ◀ ▶ stūre. Pa grants ceļu var aizbraukt uz citām zemēm!'
      : '🛷 Sniega motocikls brauc pa visu sniegu un kalnos! Kreisajā pusē ⛽ gāze un 🛑 bremze, labajā ◀ ▶ stūre.', 'good', 5000);
  },

  exitVehicle() {
    const me = this.me, v = me.veh;
    if (!v) return;
    v.obj.seat.remove(this.avatar.root);
    this.stage.add(this.avatar.root);
    this.avatar.shadow.visible = true;
    this.avatar.root.rotation.set(0, me.heading, 0);
    // izkāpj kreisajā pusē
    const h = v.heading, side = { x: Math.cos(h), z: -Math.sin(h) };
    const out = DEF[v.kind].radius + 0.6;
    me.pos.x += side.x * out; me.pos.z += side.z * out;
    this.terr.collide(me.pos, 0.4);
    me.pos.y = this.terr.groundAt(me.pos.x, me.pos.z) + 0.3;
    me.heading = h;
    // mašīna paliek turpat (vecā atstātā, ja tāda bija, pazūd — katram viena)
    if (this.myParked && this.myParked.obj !== v.obj) this.myParked.obj.root.removeFromParent();
    this.myParked = { kind: v.kind, obj: v.obj, x: v.obj.root.position.x, z: v.obj.root.position.z, heading: h, zone: this.zone };
    me.veh = null; me.state = 'idle';
    $('btn-exit-kart').classList.add('hidden');
    $('btn-jump').classList.remove('hidden');
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
      else v.speed *= 1 - (snow && v.kind === 'sled' ? 0.6 : 1.1) * dt;
      v.speed -= 9.8 * Math.sin(sl.pitch) * (v.kind === 'sled' ? 0.45 : 0.6) * dt;
      if (v.speed > max) v.speed = lerp(v.speed, max, 1 - Math.exp(-dt * 2.5));
      v.speed = clamp(v.speed, -6, 30);
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
        if (want > 6 && !(v.bumpT > 0)) { sfx('bad'); this.spawnFloat('💥', me.pos); v.bumpT = 1; }
        v.speed = Math.sign(v.speed) * Math.max(Math.min(want, 2.5), want * 0.6);
      }
    }
    v.bumpT = (v.bumpT || 0) - dt;
    if (this.zone === FOREST) this.collideIce(me.pos, D.radius);
    // vertikāli: uz zemes mašīna vienkārši seko vidējam augstumam zem riteņiem (bez lēkāšanas);
    // sniega motocikls gaisā tikai tad, ja lielā ātrumā zeme aiz izciļņa krītas straujāk, nekā tas var krist
    const sl2 = slopeAt(H, me.pos.x, me.pos.z, v.heading, D.len, D.wid);
    const g2 = inWater ? WATER_Y - 0.35 : sl2.y;
    const sdt = Math.max(dt, 1e-3);
    if (v.air) {
      v.vy -= 20 * dt;
      me.pos.y += v.vy * dt;
      if (me.pos.y <= g2) { if (v.vy < -6) sfx('pick'); me.pos.y = g2; v.vy = 0; v.air = false; }
    } else {
      const gv = (g2 - me.pos.y) / sdt; // zemes vertikālais ātrums zem mašīnas
      if (v.kind === 'sled' && Math.abs(v.speed) > 9 && gv < v.vy - 20 * dt - 4) { v.air = true; v.vy -= 20 * dt; me.pos.y += v.vy * dt; }
      else { me.pos.y = g2; v.vy = lerp(v.vy, gv, 0.5); }
    }
    // virsbūve seko reljefam (mīksta „atsperojuma” izlīdzināšana), līkumos nedaudz sasveras
    const o = v.obj;
    v.visY = v.visY == null ? me.pos.y : lerp(v.visY, me.pos.y, 1 - Math.exp(-dt * 14));
    o.root.position.set(me.pos.x, v.visY, me.pos.z);
    o.root.rotation.y = v.heading;
    const k = 1 - Math.exp(-dt * (v.air ? 2 : 6));
    o.body.rotation.order = 'YXZ';
    o.body.rotation.x = lerp(o.body.rotation.x, v.air ? -0.12 : -sl2.pitch, k);
    o.body.rotation.z = lerp(o.body.rotation.z, (v.air ? 0 : sl2.roll) - v.steer * Math.min(1, Math.abs(v.speed) / 15) * 0.05, k);
    for (const w of o.wheels) w.rotation.x += v.speed * dt / o.wheelR;
    for (const s of o.steer) s.rotation.y = v.steer * 0.45;
    o.root.children[1].position.y = g2 - v.visY + 0.04; // ēna paliek uz zemes
    me.heading = v.heading;
    me.state = 'sit';
    this.avatar.animate(dt, 'sit', 0);
    this.avatar.head.rotation.y = -v.steer * 0.35;
    // stāvvietas transports atkal redzams, kad aizbraukts tālāk
    const p = this.parked && this.parked[v.kind];
    if (p && p.spot && !p.obj.root.visible && Math.hypot(me.pos.x - p.spot.x, me.pos.z - p.spot.z) > 9) p.obj.root.visible = true;
  },

  // pie robežas: sniega motocikls paliek Ziemas zemē
  vehicleBlocksExit(warn) {
    if (this.me.veh && this.me.veh.kind === 'sled') { warn('🛷 Sniega motocikls brauc tikai pa sniegu — izkāp un ej kājām vai ņem mašīnu!'); return true; }
    return false;
  },

  // pēc pārejas uz citu zemi ar mašīnu
  vehicleZoneChanged(heading) {
    const v = this.me.veh;
    if (v) { if (heading != null) v.heading = heading; v.vy = 0; v.air = false; v.visY = null; v.speed = Math.min(v.speed, 8); if (v.kind === 'car') this.stat('carTrips'); }
    this.placeParked();
  },

  // mana atstātā mašīna pos ziņai: [veids, x, z, virziens, zemes nr.] (draugi to redz stāvam)
  parkInfo() {
    const mp = this.myParked;
    if (!mp || this.me.veh) return [0, 0, 0, 0, 0];
    const r2 = (v) => Math.round(v * 100) / 100;
    return [VEH_CODE[mp.kind], r2(mp.x), r2(mp.z), r2(mp.heading), ZONE_IDS.indexOf(mp.zone)];
  },

  // drauga atstātā mašīna (no pos ziņas e[11..15]); rāda tikai manā zemē un kamēr viņš ar to nebrauc
  remoteParked(r, e) {
    const code = e ? e[11] | 0 : 0, kind = CODE_KIND[code];
    const zone = kind ? ZONE_IDS[e[15] | 0] : null;
    const show = kind && zone === this.zone && r.vehCode !== code;
    if (!show) { if (r.parkObj) { r.parkObj.root.removeFromParent(); r.parkObj = null; r.parkKey = null; } return; }
    const key = `${kind}|${e[12]}|${e[13]}|${e[14]}|${this.zone}`;
    if (r.parkObj && r.parkKey === key) return;
    if (r.parkObj && r.parkObj.kind !== kind) { r.parkObj.root.removeFromParent(); r.parkObj = null; }
    if (!r.parkObj) { r.parkObj = buildVeh(kind, this.kartColorHex(r.prof.kartColor)); this.stage.add(r.parkObj.root); }
    r.parkKey = key;
    const x = e[12], z = e[13], h = e[14], o = r.parkObj, D = DEF[kind];
    const sl = slopeAt((a, b) => this.terr.getHeight(a, b), x, z, h, D.len, D.wid);
    o.root.position.set(x, sl.y, z);
    o.root.rotation.y = h;
    o.body.rotation.set(-sl.pitch, 0, sl.roll, 'YXZ');
    o.root.children[1].position.y = 0.04;
    r.parkAt = { x, z };
  },

  vehCode() { return this.me.veh ? VEH_CODE[this.me.veh.kind] : this.me.ride ? RIDE_CODE : 0; },
  // papildu lauki pos ziņai (pasažierim — vadītājs un sēdvieta)
  rideInfo() { return this.me.ride ? [this.me.ride.driver, this.me.ride.seat] : [-1, 0]; },

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
    sfx('beep');
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
    if (!r || (r.vehCode !== 2 && r.vehCode !== 3)) { this.leaveRide('🚶 Vadītājs izkāpa — tu arī izkāpi'); return; }
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

  // draugu mašīnas un sniega motocikli, arī pasažieri tajos (true — avatārs apstrādāts šeit)
  vehicleRemote(r, here, prev, dt) {
    const kind = CODE_KIND[r.vehCode] || null;
    if (r.vehObj && (r.vehObj.kind !== kind || !here)) {
      r.vehObj.root.removeFromParent();
      r.vehObj = null;
    }
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
    if (!kind) {
      // vairs nesēž nekur — atpakaļ uz zemes
      if (!r.kart && r.avatar.root.parent !== this.stage) { this.stage.add(r.avatar.root); r.avatar.shadow.visible = true; r.avatar.root.rotation.set(0, r.ry, 0); }
      return false;
    }
    if (!here) { r.avatar.root.visible = false; return true; }
    if (!r.vehObj) {
      r.vehObj = buildVeh(kind, this.kartColorHex(r.prof.kartColor));
      this.stage.add(r.vehObj.root);
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
    o.body.rotation.order = 'YXZ';
    o.body.rotation.x = lerp(o.body.rotation.x, -sl.pitch, k);
    o.body.rotation.z = lerp(o.body.rotation.z, sl.roll, k);
    const sp = prev.distanceTo(r.pos) / Math.max(dt, 0.001);
    for (const w of o.wheels) w.rotation.x += sp * dt / o.wheelR;
    o.root.children[1].position.y = sl.y - o.visY + 0.04;
    r.avatar.animate(dt, 'sit', 0);
    if (this.winterRemote) this.winterRemote(r, here);
    return true;
  },

  // vai draugs brauc ar mašīnu / ir pasažieris (attālo pozīciju prognozei)
  remoteMoving(r) { return r.vehCode === 2 || r.vehCode === 3 || r.vehCode === RIDE_CODE; },

  removeRemoteVehicle(r) {
    if (r.vehObj) { r.vehObj.root.removeFromParent(); r.vehObj = null; }
    if (r.parkObj) { r.parkObj.root.removeFromParent(); r.parkObj = null; r.parkKey = null; }
  },
};


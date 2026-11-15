// Transportlīdzekļi: 🚙 mašīna (visurgājējs, brauc pa grants ceļiem visās zemēs un pāri robežām)
// un 🛷 sniega motocikls (tikai Ziemas zemē). Abi stāv stāvvietās; izkāpjot mašīna paliek, kur atstāta.
// Vehicles — Game papildinājums: iekāpšana, braukšana pa jebkuru reljefu, slīpums, lēcieni, draugu transports.
import * as THREE from 'three';
import { mat, lerp, clamp, makeBlobShadow } from './util.js?v=1.12.0';
import { optimizeRig, tyreGeo } from './characters.js?v=1.12.0';
import { $, toast, sfx } from './ui.js?v=1.12.0';
import { DIRS, openSides } from './zones.js?v=1.12.0';
import { CAR_SPOT, WATER_Y } from './world.js?v=1.12.0';
import { WINTER_CAR, SLED_SPOT } from './winter.js?v=1.12.0';

// tīkla kods (pos ziņas 6. lauks): 1 = kartings, 2 = mašīna, 3 = sniega motocikls
export const VEH_CODE = { car: 2, sled: 3 };
const CODE_KIND = { 2: 'car', 3: 'sled' };
const DEF = {
  car: { name: 'mašīna', icon: '🚙', road: 19, off: 10, snowOff: 6.5, accel: 9, brake: 16, turn: 1.75, radius: 1.5, len: 1.6, wid: 0.85, cam: 9.5 },
  sled: { name: 'sniega motocikls', icon: '🛷', road: 17, off: 20, snowOff: 20, accel: 11, brake: 14, turn: 2.1, radius: 1.1, len: 1.2, wid: 0.5, cam: 8 },
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

// atvērts visurgājējs ar drošības loku (lai brauciējs labi redzams)
export function buildCar(color = '#3a7d44') {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const { P, B, tube } = kit(body);
  const dark = darkM(), chrome = chromeM();
  B(1.62, 0.5, 3.1, paint, 0, 0.8, 0);                 // kārba
  B(1.5, 0.3, 1.05, paint, 0, 1.18, 1.0);              // motora pārsegs
  B(1.68, 0.1, 3.16, dark, 0, 0.55, 0);                // slieksnis
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B(0.3, 0.1, 1.05, paint, sx * 0.9, 1.06, sz * 1.05); // spārni virs riteņiem
    B(0.06, 0.28, 1.05, dark, sx * 0.84, 0.92, sz * 1.05);
  }
  B(1.24, 0.44, 0.06, dark, 0, 0.98, 1.56);            // reste
  for (let i = -3; i <= 3; i++) B(0.04, 0.38, 0.03, chrome, i * 0.15, 0.98, 1.6);
  for (const sx of [-1, 1]) {
    P(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16), lightM(), sx * 0.58, 1.08, 1.6, Math.PI / 2);
    P(new THREE.TorusGeometry(0.125, 0.02, 6, 16), chrome, sx * 0.58, 1.08, 1.64);
    B(0.12, 0.14, 0.04, tailM(), sx * 0.68, 0.92, -1.57);
  }
  B(1.84, 0.14, 0.18, dark, 0, 0.62, 1.64);            // buferi
  B(1.84, 0.14, 0.18, dark, 0, 0.62, -1.62);
  // vējstikls ar rāmi
  const wy = 1.36, wz = 0.4;
  B(1.48, 0.5, 0.03, glassM(), 0, wy, wz, -0.28);
  B(1.56, 0.05, 0.06, dark, 0, wy + 0.26, wz - 0.07, -0.28);
  for (const sx of [-1, 1]) B(0.05, 0.56, 0.06, dark, sx * 0.76, wy, wz, -0.28);
  // sēdekļi, stūre, kravas kaste
  for (const sx of [-1, 1]) {
    B(0.56, 0.14, 0.55, seatM(), sx * 0.38, 0.98, -0.25);
    B(0.56, 0.6, 0.12, seatM(), sx * 0.38, 1.3, -0.56, -0.15);
  }
  tube([-0.38, 0.95, 0.5], [-0.38, 1.33, 0.18], 0.025, dark);
  P(new THREE.TorusGeometry(0.17, 0.025, 8, 22), dark, -0.38, 1.36, 0.15, -1.0);
  B(1.44, 0.06, 0.9, dark, 0, 1.05, -1.1);
  // drošības loks un rezerves ritenis
  tube([-0.74, 1.04, -0.8], [-0.74, 1.8, -0.8], 0.04, dark);
  tube([0.74, 1.04, -0.8], [0.74, 1.8, -0.8], 0.04, dark);
  tube([-0.74, 1.8, -0.8], [0.74, 1.8, -0.8], 0.04, dark);
  tube([-0.74, 1.8, -0.8], [-0.74, 1.06, -1.5], 0.035, dark);
  tube([0.74, 1.8, -0.8], [0.74, 1.06, -1.5], 0.035, dark);
  const spare = P(tyreGeo(0.38, 0.26), rubberM(), 0, 1.05, -1.72, 0, Math.PI / 2, 0);
  spare.rotation.set(0, Math.PI / 2, 0);
  // riteņi (priekšējie stūrējas)
  const wheels = [], steer = [];
  for (const [x, z] of [[-0.86, 1.05], [0.86, 1.05], [-0.86, -1.05], [0.86, -1.05]]) {
    const s = new THREE.Group(); s.position.set(x, 0.42, z); body.add(s);
    const w = new THREE.Group(); s.add(w);
    P(tyreGeo(0.42, 0.32), rubberM(), 0, 0, 0, 0, 0, 0, w);
    P(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 14), chrome, 0, 0, 0, 0, 0, Math.PI / 2, w);
    for (let k = 0; k < 4; k++) B(0.31, 0.05, 0.4, dark, 0, 0, 0, k / 4 * Math.PI, w);
    wheels.push(w);
    if (z > 0) steer.push(s);
  }
  const seat = new THREE.Group(); seat.position.set(-0.38, 0.86, -0.25); body.add(seat);
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  optimizeRig(body);
  const shadow = makeBlobShadow(3.8); shadow.position.y = 0.04; root.add(shadow);
  return { kind: 'car', root, body, wheels, steer, seat, wheelR: 0.42 };
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
  const seat = new THREE.Group(); seat.position.set(0, 0.8, -0.5); body.add(seat);
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  optimizeRig(body);
  const shadow = makeBlobShadow(2.8); shadow.position.y = 0.04; root.add(shadow);
  return { kind: 'sled', root, body, wheels: [], steer: [], seat, wheelR: 1 };
}

const buildVeh = (kind, color) => (kind === 'car' ? buildCar(color) : buildSled(color));

// kur katrā zemē stāv mašīna / sniega motocikls
function spots(zone) {
  if (zone === 'c') return [{ kind: 'car', ...CAR_SPOT }];
  if (zone === 'n') return [{ kind: 'car', ...WINTER_CAR }, { kind: 'sled', ...SLED_SPOT }];
  const s = openSides(zone)[0], [dx, dz] = DIRS[s];
  return [{ kind: 'car', x: -dz * 7, z: dx * 7, heading: Math.atan2(dx, dz) }];
}

// zemes slīpums: kāpums uz priekšu un uz sāniem (reljefa funkcija h)
export function slopeAt(h, x, z, heading, len, wid) {
  const fx = Math.sin(heading), fz = Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
  const pitch = Math.atan2(h(x + fx * len, z + fz * len) - h(x - fx * len, z - fz * len), 2 * len);
  const roll = Math.atan2(h(x + rx * wid, z + rz * wid) - h(x - rx * wid, z - rz * wid), 2 * wid);
  return { pitch, roll };
}

// =================== Game papildinājums ===================
export const Vehicles = {
  // stāvvietas ar transportu šajā zemē (izsauc pēc zemes ielādes)
  placeParked() {
    this.parked = this.parked || {};
    const list = spots(this.zone);
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
    if (this.myParked && this.myParked.zone !== this.zone) { this.myParked.obj.root.removeFromParent(); this.myParked = null; }
  },

  // dzeltenā poga: iekāpt (no stāvvietas vai savā atstātajā mašīnā)
  vehicleActions(consider, d2) {
    if (this.me.veh || this.me.ski || this.me.lift) return;
    const mp = this.myParked;
    if (mp) consider(d2(mp.x, mp.z), mp.kind === 'car' ? 4.2 : 3.2, `${DEF[mp.kind].icon} Sēsties: ${DEF[mp.kind].name}`, () => this.enterVehicle(mp.kind, mp));
    for (const k in this.parked || {}) {
      const p = this.parked[k];
      if (!p.spot || !p.obj.root.visible) continue;
      consider(d2(p.spot.x, p.spot.z), k === 'car' ? 4.2 : 3.2, `${DEF[k].icon} Sēsties: ${DEF[k].name}`, () => this.enterVehicle(k, null));
    }
  },

  enterVehicle(kind, mine) {
    const me = this.me;
    if (me.veh || me.inKart) return;
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
    me.veh = { kind, obj, speed: 0, heading, steer: 0, vy: 0, air: false };
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
      ? '🚙 Kursorsvira uz augšu — gāze, uz leju — bremze/atpakaļgaita. Pa grants ceļu var aizbraukt uz citām zemēm!'
      : '🛷 Sniega motocikls brauc pa visu sniegu un kalnos! Uz augšu — gāze, uz leju — bremze.', 'good', 5000);
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
    me.pos.x += side.x * 1.9; me.pos.z += side.z * 1.9;
    this.terr.collide(me.pos, 0.4);
    me.pos.y = this.terr.groundAt(me.pos.x, me.pos.z) + 0.3;
    me.heading = h;
    // mašīna paliek turpat
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
    const inWater = this.zone === 'c' && ground < WATER_Y - 0.4;
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
      const moved = Math.hypot(me.pos.x - ox, me.pos.z - oz) / Math.max(dt, 1e-4);
      if (Math.abs(v.speed) > 6 && moved < Math.abs(v.speed) * 0.6) { sfx('bad'); this.spawnFloat('💥', me.pos); }
      v.speed *= 0.6;
    }
    if (this.zone === 'c') this.collideIce(me.pos, D.radius);
    // vertikāli: uz kalna virsotnes lielā ātrumā var palekties
    const g2 = inWater ? WATER_Y - 0.35 : H(me.pos.x, me.pos.z);
    v.vy -= 20 * dt;
    me.pos.y += v.vy * dt;
    if (me.pos.y <= g2 || (!v.air && me.pos.y - g2 < 0.08 + Math.abs(v.speed) * 0.012)) {
      if (v.air && v.vy < -6) sfx('pick'); // nosēšanās
      me.pos.y = g2;
      v.vy = Math.max(0, (g2 - ground) / Math.max(dt, 1e-3) * 0.6);
      v.air = false;
    } else v.air = true;
    // virsbūve seko reljefam, līkumos nedaudz sasveras
    const o = v.obj;
    o.root.position.copy(me.pos);
    o.root.rotation.y = v.heading;
    const k = 1 - Math.exp(-dt * (v.air ? 2 : 10));
    o.body.rotation.order = 'YXZ';
    o.body.rotation.x = lerp(o.body.rotation.x, v.air ? -0.12 : -sl.pitch, k);
    o.body.rotation.z = lerp(o.body.rotation.z, (v.air ? 0 : sl.roll) - v.steer * Math.min(1, Math.abs(v.speed) / 15) * 0.06, k);
    for (const w of o.wheels) w.rotation.x += v.speed * dt / o.wheelR;
    for (const s of o.steer) s.rotation.y = v.steer * 0.45;
    o.root.children[1].position.y = g2 - me.pos.y + 0.04; // ēna paliek uz zemes
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
    if (v) { if (heading != null) v.heading = heading; v.vy = 0; v.air = false; v.speed = Math.min(v.speed, 8); if (v.kind === 'car') this.stat('carTrips'); }
    this.placeParked();
  },

  vehCode() { return this.me.veh ? VEH_CODE[this.me.veh.kind] : 0; },

  // draugu mašīnas un sniega motocikli (true — avatārs apstrādāts šeit)
  vehicleRemote(r, here, prev, dt) {
    const kind = CODE_KIND[r.vehCode] || null;
    if (r.vehObj && (r.vehObj.kind !== kind || !here)) {
      r.vehObj.seat.remove(r.avatar.root);
      r.vehObj.root.removeFromParent();
      r.vehObj = null;
      this.stage.add(r.avatar.root);
      r.avatar.shadow.visible = true;
      r.avatar.root.rotation.set(0, r.ry, 0);
    }
    if (!kind) return false;
    if (!here) { r.avatar.root.visible = false; return true; }
    if (!r.vehObj) {
      r.vehObj = buildVeh(kind, this.kartColorHex(r.prof.kartColor));
      this.stage.add(r.vehObj.root);
      if (r.avatar.root.parent) r.avatar.root.parent.remove(r.avatar.root);
      r.vehObj.seat.add(r.avatar.root);
      r.avatar.root.position.set(0, 0, 0); r.avatar.root.rotation.set(0, 0, 0);
      r.avatar.shadow.visible = false;
      r.avatar.root.visible = true;
    }
    const o = r.vehObj, H = (x, z) => this.terr.getHeight(x, z);
    o.root.position.copy(r.pos);
    o.root.rotation.y = r.ry;
    const sl = slopeAt(H, r.pos.x, r.pos.z, r.ry, DEF[kind].len, DEF[kind].wid);
    const k = 1 - Math.exp(-dt * 8);
    o.body.rotation.order = 'YXZ';
    o.body.rotation.x = lerp(o.body.rotation.x, -sl.pitch, k);
    o.body.rotation.z = lerp(o.body.rotation.z, sl.roll, k);
    const sp = prev.distanceTo(r.pos) / Math.max(dt, 0.001);
    for (const w of o.wheels) w.rotation.x += sp * dt / o.wheelR;
    o.root.children[1].position.y = H(r.pos.x, r.pos.z) - r.pos.y + 0.04;
    r.avatar.animate(dt, 'sit', 0);
    if (this.winterRemote) this.winterRemote(r, here);
    return true;
  },

  removeRemoteVehicle(r) { if (r.vehObj) { r.vehObj.root.removeFromParent(); r.vehObj = null; } },
};


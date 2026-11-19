// Sētas būves: dārza mājiņa (var ieiet), siltumnīca, vārtu arkas, ceļa rādītāji.
// Visu būvē „vietējās” koordinātēs (durvis uz +x), sēta to novieto un pagriež.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeSignBoard, signWood } from './util.js?v=1.30.0';

// daudzas kastes ar krāsām → viena ģeometrija (virsotņu krāsas)
// b: [w, h, d, x, y, z, krāsa, rx?, ry?, rz?]
const col = new THREE.Color();
function boxes(list, extra = []) {
  const geos = list.map(([w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0]) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.deleteAttribute('uv');
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z));
    return paint(g, c);
  });
  return mergeGeometries([...geos, ...extra]);
}
function paint(g, c) {
  if (g.attributes.uv) g.deleteAttribute('uv');
  col.set(c);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// trīsstūris (frontons) plaknē x = const, abās pusēs
function gable(x, y0, halfW, rise, c) {
  const p = [x, y0, -halfW, x, y0, halfW, x, y0 + rise, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...p, p[0], p[1], p[2], p[6], p[7], p[8], p[3], p[4], p[5]], 3));
  g.computeVertexNormals();
  return paint(g, c);
}
const vcMat = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...opts });
// sienas kā apļu virkne sadursmēm: [[x0, z0, x1, z1], ...] vietējās koordinātēs
function wallColliders(segs, r = 0.22, step = 0.35) {
  const out = [];
  for (const [x0, z0, x1, z1] of segs) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i <= n; i++) out.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, r]);
  }
  return out;
}

// ---------- dārza mājiņa: sarkana koka mājiņa ar baltām apmalēm (6 × 5 m), durvis +x pusē ----------
export const HOUSE = { hx: 3, hz: 2.5, door: 0.8, wallH: 2.5, rise: 1.45, inner: [2.8, 2.3] };
export function buildGardenHouse() {
  const { hx, hz, door, wallH, rise } = HOUSE, t = 0.16;
  const RED = '#9a3528', WHITE = '#f2efe6', ROOF = '#3c3e45', FLOOR = '#a47a4e';
  const g = new THREE.Group();
  // sienas (caurspīdīgas, kad esi iekšā)
  const walls = boxes([
    [t, wallH, hz * 2, -hx + t / 2, wallH / 2, 0, RED],
    [hx * 2, wallH, t, 0, wallH / 2, -hz + t / 2, RED],
    [hx * 2, wallH, t, 0, wallH / 2, hz - t / 2, RED],
    [t, wallH, hz - door, hx - t / 2, wallH / 2, -(hz + door) / 2, RED],
    [t, wallH, hz - door, hx - t / 2, wallH / 2, (hz + door) / 2, RED],
    [t, wallH - 2.05, door * 2, hx - t / 2, (wallH + 2.05) / 2, 0, RED],
    // baltās stūru līstes un durvju aploce
    ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => [0.2, wallH, 0.2, a * (hx - 0.05), wallH / 2, b * (hz - 0.05), WHITE]),
    [0.22, 2.1, 0.12, hx - 0.02, 1.05, -door - 0.04, WHITE], [0.22, 2.1, 0.12, hx - 0.02, 1.05, door + 0.04, WHITE],
    [0.22, 0.12, door * 2 + 0.2, hx - 0.02, 2.08, 0, WHITE],
    // logi sānos (rāmis + stikls)
    ...[-1, 1].flatMap((b) => [[1.3, 1.05, 0.24, -0.6, 1.45, b * (hz - t / 2), WHITE], [1.1, 0.85, 0.26, -0.6, 1.45, b * (hz - t / 2), '#7fa6b8'],
      [0.06, 0.85, 0.28, -0.6, 1.45, b * (hz - t / 2), WHITE], [1.1, 0.06, 0.28, -0.6, 1.45, b * (hz - t / 2), WHITE]]),
    // logs aizmugurē
    [0.24, 0.9, 1.1, -hx + t / 2, 1.5, 0, WHITE], [0.26, 0.7, 0.9, -hx + t / 2, 1.5, 0, '#7fa6b8'],
  ], [gable(-hx + 0.01, wallH, hz, rise, RED), gable(hx - 0.01, wallH, hz, rise, RED)]);
  const wallMat = vcMat({ side: THREE.DoubleSide });
  const wm = new THREE.Mesh(walls, wallMat);
  wm.castShadow = true; wm.receiveShadow = true;
  g.add(wm);
  // jumts (paslēpj, kad esi iekšā)
  const ang = Math.atan2(rise, hz), sl = Math.hypot(hz, rise) + 0.4;
  const roof = new THREE.Mesh(boxes([
    [hx * 2 + 0.7, 0.12, sl, 0, wallH + rise / 2 + 0.08, hz / 2, ROOF, ang, 0, 0],
    [hx * 2 + 0.7, 0.12, sl, 0, wallH + rise / 2 + 0.08, -hz / 2, ROOF, -ang, 0, 0],
    [hx * 2 + 0.75, 0.16, 0.22, 0, wallH + rise + 0.1, 0, ROOF],
    [0.55, 1.3, 0.55, -1.4, wallH + rise * 0.55 + 0.4, -1.1, '#8a4b3a'],
    [0.7, 0.12, 0.7, -1.4, wallH + rise * 0.55 + 1.05, -1.1, '#5a5a5a'],
  ]), vcMat({ roughness: 0.75 }));
  roof.castShadow = true; roof.receiveShadow = true;
  g.add(roof);
  // grīda, pakāpiens, atvērtas durvis un iekārta
  const inner = new THREE.Mesh(boxes([
    [hx * 2 - 0.3, 0.12, hz * 2 - 0.3, 0, 0.06, 0, FLOOR],
    [0.9, 0.16, 1.9, hx + 0.45, 0.08, 0, '#8d8a82'],
    [1.5, 2.0, 0.06, hx - 0.85, 1.02, door + 0.06, '#7a3a2c'], // durvis atvērtas uz iekšu
    // paklājs
    [2.2, 0.02, 1.5, 0.3, 0.13, 0, '#3f6a9a'], [1.9, 0.025, 1.2, 0.3, 0.13, 0, '#d8c08a'],
    // galds ar 4 kājām un 2 ķeblīši
    [1.3, 0.07, 0.85, -1.6, 0.78, -1.3, '#b98d5a'],
    ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => [0.07, 0.75, 0.07, -1.6 + a * 0.55, 0.375, -1.3 + b * 0.35, '#8b6238']),
    [0.42, 0.06, 0.42, -0.65, 0.47, -1.3, '#b98d5a'], [0.08, 0.45, 0.08, -0.65, 0.23, -1.3, '#8b6238'],
    [0.42, 0.06, 0.42, -2.45, 0.47, -1.0, '#b98d5a'], [0.08, 0.45, 0.08, -2.45, 0.23, -1.0, '#8b6238'],
    // laterna uz galda
    [0.16, 0.24, 0.16, -1.6, 0.94, -1.25, '#ffd36a'],
    // plaukts pie aizmugures sienas ar podiem
    [0.3, 0.05, 2.2, -hx + 0.32, 1.35, 0.9, '#8b6238'], [0.3, 0.05, 2.2, -hx + 0.32, 0.85, 0.9, '#8b6238'],
    [0.2, 0.2, 0.2, -hx + 0.32, 1.48, 0.3, '#c0623a'], [0.2, 0.2, 0.2, -hx + 0.32, 1.48, 0.9, '#c0623a'], [0.22, 0.16, 0.22, -hx + 0.32, 1.46, 1.5, '#5e8f4a'],
    [0.24, 0.3, 0.24, -hx + 0.32, 1.03, 0.5, '#d4a24a'], [0.24, 0.3, 0.24, -hx + 0.32, 1.03, 1.3, '#6a8fb3'],
    // muca un instrumenti stūrī
    [0.6, 0.8, 0.6, 1.9, 0.5, -1.8, '#7c5432'],
    [0.05, 1.6, 0.05, 2.4, 0.9, 1.9, '#9c7a52', 0.15], [0.05, 1.6, 0.05, 2.15, 0.9, 1.95, '#9c7a52', -0.12],
    [0.4, 0.06, 0.12, 2.4, 1.66, 1.78, '#6a6a6a'],
  ]), vcMat());
  inner.receiveShadow = true;
  g.add(inner);
  const segs = [[-hx, -hz, -hx, hz], [-hx, -hz, hx, -hz], [-hx, hz, hx, hz], [hx, -hz, hx, -door - 0.15], [hx, door + 0.15, hx, hz]];
  return { obj: g, roof, wallMat, colliders: [...wallColliders(segs), [-1.6, -1.3, 0.6], [1.9, -1.8, 0.4]] };
}

// ---------- siltumnīca: balts metāla karkass ar stiklu (6 × 11 m), durvis +x pusē, iekšā tomātu dobes ----------
export const GREEN = { hx: 3, hz: 5.5, door: 0.75, wallH: 2.0, rise: 1.2 };
let glassM = null;
export function buildGreenhouse() {
  const { hx, hz, door, wallH, rise } = GREEN, W = '#e9eeee';
  const g = new THREE.Group();
  const frame = [];
  // pamats
  frame.push([hx * 2, 0.3, 0.14, 0, 0.15, -hz, '#8f8a80'], [hx * 2, 0.3, 0.14, 0, 0.15, hz, '#8f8a80'], [0.14, 0.3, hz * 2, -hx, 0.15, 0, '#8f8a80'],
    [0.14, 0.3, hz - door, hx, 0.15, -(hz + door) / 2, '#8f8a80'], [0.14, 0.3, hz - door, hx, 0.15, (hz + door) / 2, '#8f8a80']);
  // statņi gar garajām sienām un kores sija
  const ang = Math.atan2(rise, hx), sl = Math.hypot(hx, rise);
  for (let i = 0; i <= 6; i++) {
    const z = -hz + i * (hz * 2 / 6);
    for (const s of [-1, 1]) {
      frame.push([0.07, wallH, 0.07, s * hx, wallH / 2, z, W]);
      frame.push([sl, 0.07, 0.07, s * hx / 2, wallH + rise / 2, z, W, 0, 0, -s * ang]);
    }
  }
  for (const s of [-1, 1]) { frame.push([0.07, 0.07, hz * 2, s * hx, wallH, 0, W], [0.06, 0.06, hz * 2, s * hx, 1.0, 0, W]); }
  frame.push([0.09, 0.09, hz * 2 + 0.1, 0, wallH + rise, 0, W]);
  for (const s of [-1, 1]) frame.push([0.07, wallH + rise, 0.07, 0, (wallH + rise) / 2, s * hz, W], [hx * 2, 0.07, 0.07, 0, wallH, s * hz, W]);
  // durvju rāmis
  frame.push([0.08, 2.0, 0.08, hx, 1.0, -door, W], [0.08, 2.0, 0.08, hx, 1.0, door, W], [0.08, 0.08, door * 2, hx, 2.0, 0, W]);
  // dobes ar zemi un celiņš
  const beds = [[-1.75, -4.9, 4.9], [1.75, -4.9, -1.2], [1.75, 1.2, 4.9]];
  for (const [x, z0, z1] of beds) {
    frame.push([1.4, 0.45, z1 - z0, x, 0.23, (z0 + z1) / 2, '#8b6238'], [1.26, 0.04, z1 - z0 - 0.14, x, 0.46, (z0 + z1) / 2, '#4e3a2a']);
  }
  frame.push([1.0, 0.04, hz * 2 - 0.4, 0, 0.03, 0, '#b8ad98']);
  // tomāti: miets, zaļš krūms, sarkani augļi
  const plants = [];
  const leafG = new THREE.IcosahedronGeometry(0.32, 0), fruitG = new THREE.IcosahedronGeometry(0.075, 0);
  for (const [x, z0, z1] of beds) for (let z = z0 + 0.5; z < z1 - 0.3; z += 0.9) {
    frame.push([0.03, 1.3, 0.03, x, 1.1, z, '#9c7a52']);
    for (const [dy, sc] of [[0.8, 1], [1.2, 0.85], [1.55, 0.6]]) {
      const l = leafG.clone(); l.scale(sc, sc * 1.1, sc); l.translate(x, dy, z); plants.push(paint(l, '#3f7a2e'));
    }
    for (const [dx, dy, dz] of [[0.2, 0.9, 0.12], [-0.18, 1.1, -0.1], [0.1, 1.35, -0.2], [-0.12, 0.75, 0.2]]) {
      const f = fruitG.clone(); f.translate(x + dx, dy, z + dz); plants.push(paint(f, '#d8402a'));
    }
  }
  const fm = new THREE.Mesh(boxes(frame, plants), vcMat({ roughness: 0.6, flatShading: false }));
  fm.castShadow = true; fm.receiveShadow = true;
  g.add(fm);
  // stikls
  if (!glassM) {
    glassM = new THREE.MeshStandardMaterial({ color: '#d6eef4', transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    glassM.userData.keepPBR = true;
  }
  const gl = [
    [0.02, wallH - 0.3, hz * 2, -hx, 0.3 + (wallH - 0.3) / 2, 0],
    [0.02, wallH - 0.3, hz - door, hx, 0.3 + (wallH - 0.3) / 2, -(hz + door) / 2], [0.02, wallH - 0.3, hz - door, hx, 0.3 + (wallH - 0.3) / 2, (hz + door) / 2],
    [hx * 2, wallH - 0.3, 0.02, 0, 0.3 + (wallH - 0.3) / 2, -hz], [hx * 2, wallH - 0.3, 0.02, 0, 0.3 + (wallH - 0.3) / 2, hz],
    [sl, 0.02, hz * 2, -hx / 2, wallH + rise / 2, 0, 0, 0, ang], [sl, 0.02, hz * 2, hx / 2, wallH + rise / 2, 0, 0, 0, -ang],
  ].map(([w, h, d, x, y, z, rx = 0, ry = 0, rz = 0]) => [w, h, d, x, y, z, '#ffffff', rx, ry, rz]);
  const glass = new THREE.Mesh(boxes(gl), glassM);
  // frontoni (trīsstūri galos) arī stikla
  const gab = mergeGeometries([0, 1].map((k) => { const t = gable(0, wallH, hx, rise, '#ffffff'); t.rotateY(Math.PI / 2); t.translate(0, 0, k ? hz : -hz); return t; }));
  glass.renderOrder = 2;
  g.add(glass, new THREE.Mesh(gab, glassM));
  const segs = [[-hx, -hz, -hx, hz], [-hx, -hz, hx, -hz], [-hx, hz, hx, hz], [hx, -hz, hx, -door - 0.15], [hx, door + 0.15, hx, hz]];
  const bedC = beds.flatMap(([x, z0, z1]) => wallColliders([[x, z0 + 0.4, x, z1 - 0.4]], 0.55, 0.6));
  return { obj: g, colliders: [...wallColliders(segs), ...bedC] };
}

// ---------- vārtu arka: divi stabi un šķērssija ar ķēdītēm (dēli ar vārdu pakar farm.js) ----------
export const GATE_W = 9, GATE_BEAM = 3.35, GATE_BOARD = 2.62;
export function buildGateArch() {
  const g = boxes([
    [0.22, GATE_BEAM + 0.5, 0.22, 0, (GATE_BEAM + 0.5) / 2 - 0.3, -GATE_W / 2, '#7a5230'],
    [0.22, GATE_BEAM + 0.5, 0.22, 0, (GATE_BEAM + 0.5) / 2 - 0.3, GATE_W / 2, '#7a5230'],
    [0.2, 0.2, GATE_W + 0.6, 0, GATE_BEAM, 0, '#6a4526'],
    [0.14, 0.14, 1.6, 0, GATE_BEAM - 0.55, -GATE_W / 2 + 0.75, '#6a4526', Math.PI / 4],
    [0.14, 0.14, 1.6, 0, GATE_BEAM - 0.55, GATE_W / 2 - 0.75, '#6a4526', -Math.PI / 4],
    [0.03, GATE_BEAM - GATE_BOARD - 0.3, 0.03, 0, (GATE_BEAM + GATE_BOARD + 0.3) / 2 - 0.05, -0.9, '#3a3a3a'],
    [0.03, GATE_BEAM - GATE_BOARD - 0.3, 0.03, 0, (GATE_BEAM + GATE_BOARD + 0.3) / 2 - 0.05, 0.9, '#3a3a3a'],
  ]);
  const m = new THREE.Mesh(g, vcMat());
  m.castShadow = true;
  return m;
}

// ---------- ceļa rādītājs (stabs ar koka bultām) ----------
// dirs: [[dx, dz, teksts], ...]; stabs ~3 m kā īstam ceļa rādītājam
export function buildFingerpost(dirs) {
  const g = new THREE.Group();
  const PH = 3.1;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, PH, 8).translate(0, PH / 2, 0), signWood());
  pole.castShadow = true;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 8).translate(0, PH + 0.1, 0), signWood());
  g.add(pole, cap);
  dirs.forEach(([dx, dz, txt], i) => {
    const { obj, w } = makeSignBoard(txt, { arrow: true, h: 0.3, style: 'wood' });
    const l = Math.hypot(dx, dz), off = w / 2 + 0.1;
    obj.position.set(dx / l * off, PH - 0.3 - i * 0.38, dz / l * off);
    obj.rotation.y = Math.atan2(-dz, dx);
    g.add(obj);
  });
  return g;
}

// ---------- ceļa malas zīme (brūna tūrisma zīme uz diviem metāla stabiņiem) ----------
export function buildRoadSign(front, back) {
  const g = new THREE.Group();
  const { obj, w } = makeSignBoard(front, { h: 0.62, style: 'road', color: '#6e3f1f', back, thin: true });
  obj.position.y = 1.75;
  g.add(obj);
  const pg = new THREE.CylinderGeometry(0.035, 0.035, 2.1, 6).translate(0, 1.05, 0);
  const pm = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.5, metalness: 0.6 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(pg, pm); p.position.set(s * (w / 2 - 0.25), 0, -0.05); p.castShadow = true; g.add(p); }
  return g;
}

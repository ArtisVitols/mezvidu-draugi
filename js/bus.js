// 🚌 Zilais autobuss: brauc pa lielu apli — ❄️ Ziemas laukums → sēta → 🏁 sacīkšu trase → sēta → 🛒 Mežvidu tirgus → sēta → atpakaļ uz Ziemu.
// Katrā galā (Ziemas laukums, trase, tirgus) ir apļveida ceļš — autobuss to apbrauc un brauc atpakaļ pa to pašu ceļu (labā josla),
// nevis apgriežas uz vietas. Kustība izriet tikai no kopējā pulksteņa (game.now()), tāpēc visi spēlētāji redz autobusu vienā vietā
// bez tīkla ziņām. Ātrums atkarīgs no līkuma (aplī lēnāk). Iekāpt un izkāpt var tikai pieturās, brauciens maksā BUS_PRICE. Vada kaķis Kārlis.
// Maršruts — globālās koordinātēs (zemes vietējās + zoneOffset); autobuss redzams tikai tajā zemē, kurā tas ir.
import * as THREE from 'three';
import { mat, canvasTexture } from './util.js?v=1.27.0';
import { buildAnimal, flattenStatic } from './characters.js?v=1.27.0';
import { $, toast, sfx } from './ui.js?v=1.27.0';
import { roadNS, roadEW, FOREST_ROAD, FOREST_RING, raceGeo } from './world.js?v=1.27.0';
import { WINTER_ROAD, WINTER_RING } from './winter.js?v=1.27.0';
import { zoneOffset, ZONE_HALF, FARM, FOREST, RACE, smoothRoad } from './zones.js?v=1.27.0';
import { busStopSvg } from './icons.js?v=1.27.0';

export const BUS_PRICE = 2;
export const BUS_CODE = 6; // pos p[5]: pasažieris autobusā (p[9] — sēdvieta)
const VMAX = 14, ACC = 1.2, DEC = 1.4, ALAT = 1.6, DWELL = 10, TERM = 16; // m/s, m/s², s
const LANE = 1.5; // labā josla: tik metru pa labi no ceļa vidus
const BUS_ZONES = ['n', FARM, FOREST, RACE];
const D2R = Math.PI / 180;

// ---------- maršruts ----------
// posmi globālās koordinātēs; lane — divvirzienu ceļš (brauc pa labo joslu), citādi — vienvirziena aplis (pa vidu)
const ring = (cx, cz, R, a0, a1) => {
  const pts = [], n = Math.ceil(Math.abs(a1 - a0) * D2R * R / 2);
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * D2R; pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); }
  return pts;
};
const shift = ([ox, oz], pts) => pts.map(([x, z]) => [x + ox, z + oz]);
const route = (() => {
  const W = zoneOffset('n'), F = zoneOffset(FOREST), R = zoneOffset(RACE), RG = raceGeo();
  const wr = WINTER_RING, fr = FOREST_RING, rr = RG.ring;
  const wJ = Math.atan2(WINTER_ROAD[WINTER_ROAD.length - 1][1] - wr.z, WINTER_ROAD[WINTER_ROAD.length - 1][0] - wr.x) / D2R; // ceļa pieslēgums aplim
  const rE = Math.atan2(rr.east.z - rr.z, rr.east.x - rr.x) / D2R;
  const winterRoadOut = shift(W, [...WINTER_ROAD].reverse().filter(([, z]) => z <= 318)); // no laukuma uz dienvidiem
  const nsDown = [], nsUp = [], ewW = [], ewE = [], ewBack = [];
  for (let z = -312; z <= -18; z += 6) nsDown.push([roadNS(z), z]);
  for (let x = -18; x >= -312; x -= 6) ewW.push([x, roadEW(x)]);
  for (let x = -312; x <= 312; x += 6) ewE.push([x, roadEW(x)]);
  for (let x = 312; x >= 18; x -= 6) ewBack.push([x, roadEW(x)]);
  for (let z = -18; z >= -312; z -= 6) nsUp.push([roadNS(z), z]);
  const raceIn = shift(R, RG.main.filter(([x]) => x <= 318)); // no robežas līdz aplim
  const forestIn = shift(F, [...FOREST_ROAD].reverse().filter(([x]) => x >= -318)); // no robežas līdz aplim
  const legs = [
    { pts: shift(W, ring(wr.x, wr.z, wr.r, 227, wJ + 360)) },              // Ziemas laukuma aplis (pulksteņa virzienā)
    { pts: winterRoadOut, lane: 1 },
    { pts: [...nsDown, [-4.6, -4.6], ...ewW], lane: 1 },                 // sēta: uz dienvidiem, pa labi uz rietumiem
    { pts: raceIn, lane: 1 },
    { pts: shift(R, ring(rr.x, rr.z, rr.r, rE, rE + 360)) },             // trases aplis
    { pts: [...raceIn].reverse(), lane: 1 },
    { pts: ewE, lane: 1 },                                                 // sēta: taisni caur krustojumu uz austrumiem
    { pts: forestIn, lane: 1 },
    { pts: shift(F, ring(fr.x, fr.z, fr.r, 180, 540)) },                  // tirgus aplis
    { pts: [...forestIn].reverse(), lane: 1 },
    { pts: [...ewBack, [4.6, -4.6], ...nsUp], lane: 1 },                // sēta: uz rietumiem, pa labi uz ziemeļiem
    { pts: [...winterRoadOut].reverse(), lane: 1 },
    { pts: shift(W, ring(wr.x, wr.z, wr.r, wJ, 227)) },
  ];
  // divvirzienu posmus nobīda uz labo joslu; posmu savienojumos izmet tuvos punktus, lai līkums būtu gluds
  const all = [];
  legs.forEach((L, k) => {
    let p = smoothRoad(L.pts, 2);
    if (L.lane) p = p.map((q, i) => {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
      return { x: q.x - tz / tl * LANE, z: q.z + tx / tl * LANE };
    });
    const prevRing = !legs[(k + legs.length - 1) % legs.length].lane, nextRing = !legs[(k + 1) % legs.length].lane;
    const cut0 = L.lane || !prevRing ? 7 : 0, cut1 = L.lane || !nextRing ? 7 : 0;
    let len = 0;
    const dist = p.map((q, i) => (len += i ? Math.hypot(q.x - p[i - 1].x, q.z - p[i - 1].z) : 0));
    p.forEach((q, i) => { if (dist[i] >= cut0 && dist[i] <= len - cut1 && (i === 0 || i % 2 === 0 || !L.lane)) all.push(q); });
  });
  // bez dubultiem punktiem (arī beigas = sākums)
  const uniq = all.filter((q, i) => { const r = all[(i + 1) % all.length]; return Math.hypot(r.x - q.x, r.z - q.z) > 0.5; });
  const curve = new THREE.CatmullRomCurve3(uniq.map((q) => new THREE.Vector3(q.x, 0, q.z)), true, 'centripetal');
  const length = curve.getLength(), n = Math.ceil(length);
  const sp = curve.getSpacedPoints(n);
  const X = new Float32Array(n + 1), Z = new Float32Array(n + 1);
  sp.forEach((p, i) => { X[i] = p.x; Z[i] = p.z; });
  return { X, Z, n, step: length / n, len: length };
})();

function pathAt(s) {
  s = ((s % route.len) + route.len) % route.len;
  const f = Math.min(route.n - 0.001, s / route.step), i = Math.floor(f), u = f - i;
  const x = route.X[i] + (route.X[i + 1] - route.X[i]) * u, z = route.Z[i] + (route.Z[i + 1] - route.Z[i]) * u;
  const j = Math.max(0, i - 1), k = Math.min(route.n, i + 2);
  return { x, z, h: Math.atan2(route.X[k] - route.X[j], route.Z[k] - route.Z[j]) };
}
// tuvākais maršruta punkts, kurā autobuss brauc virzienā (dx, dz) (sētas pieturām — katrai ceļa pusei sava)
function nearestS(x, z, dx = 0, dz = 0) {
  let b = 1e18, bi = 0;
  for (let i = 0; i < route.n; i++) {
    const d = (route.X[i] - x) ** 2 + (route.Z[i] - z) ** 2;
    if (d >= b) continue;
    if (dx || dz) { const tx = route.X[i + 1] - route.X[i], tz = route.Z[i + 1] - route.Z[i]; if (tx * dx + tz * dz <= 0) continue; }
    b = d; bi = i;
  }
  return bi * route.step;
}

// ---------- pieturas ----------
// stacijas: sētā katrā ceļa pusē sava nojume (abos braukšanas virzienos), galos — viena nojume apļa iekšpusē
const fr = FOREST_RING, wr = WINTER_RING, rr = raceGeo().ring;
const [WX, WZ] = zoneOffset('n'), [FX, FZ] = zoneOffset(FOREST), [RX, RZ] = zoneOffset(RACE);
const onRing = (cx, cz, R, deg) => [cx + Math.cos(deg * D2R) * R, cz + Math.sin(deg * D2R) * R];
const STATIONS = [
  { name: 'Ziemas laukums', icon: '❄️', term: true, at: [[...onRing(wr.x + WX, wr.z + WZ, wr.r, 227), 0, 0]] },
  { name: 'Sēta — ziemeļi', icon: '🏡', at: [[0, -52, 0, 1], [0, -52, 0, -1]] },
  { name: 'Sēta — rietumi', icon: '🏡', at: [[-52, 0, -1, 0], [-52, 0, 1, 0]] },
  { name: 'Sacīkšu trase', icon: '🏁', term: true, at: [[...onRing(rr.x + RX, rr.z + RZ, rr.r, Math.atan2(rr.east.z - rr.z, rr.east.x - rr.x) / D2R + 180), 0, 0]] },
  { name: 'Sēta — austrumi', icon: '🏡', at: [[52, 0, 1, 0], [52, 0, -1, 0]] },
  { name: 'Mežvidu tirgus', icon: '🛒', term: true, at: [[...onRing(fr.x + FX, fr.z + FZ, fr.r, 90), 0, 0]] },
];
// BUS_STOPS — visas nojumes (platformas), sakārtotas pēc vietas maršrutā; i — kārtas nr., st — stacija
export const BUS_STOPS = [];
STATIONS.forEach((st, si) => st.at.forEach(([x, z, dx, dz]) => {
  const s = nearestS(x, z, dx, dz);
  BUS_STOPS.push({ name: st.name, icon: st.icon, term: !!st.term, si, s, off: dx || dz ? 4.6 : 6 });
}));
BUS_STOPS.sort((a, b) => a.s - b.s);
// nojumes vieta: maršruta labajā pusē (durvju pusē)
BUS_STOPS.forEach((p, i) => {
  p.i = i;
  const q = pathAt(p.s), rx = -Math.cos(q.h), rz = Math.sin(q.h);
  p.x = q.x + rx * p.off; p.z = q.z + rz * p.off; p.ry = Math.atan2(-rx, -rz); // nojumes +z — pret ceļu
});

// ---------- grafiks ----------
// ātruma ierobežojums līkumos (pēc virziena maiņas), tad katram posmam starp pieturām: paātrinājums → ierobežojums → bremzēšana
const vlim = (() => {
  const v = new Float32Array(route.n + 1), H = [];
  for (let i = 0; i <= route.n; i++) H.push(pathAt(i * route.step).h);
  for (let i = 0; i <= route.n; i++) {
    const a = H[(i - 4 + route.n) % route.n], b = H[(i + 4) % route.n];
    let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d;
    const k = d / (8 * route.step);
    v[i] = Math.min(VMAX, Math.sqrt(ALAT / Math.max(k, 1e-4)));
  }
  return v;
})();
function moveTable(sA, sB) {
  const ia = Math.round(sA / route.step), ib = Math.round(sB / route.step), N = ib - ia, ds = route.step;
  const v = new Float32Array(N + 1), t = new Float32Array(N + 1);
  for (let k = 1; k <= N; k++) v[k] = Math.min(vlim[(ia + k) % route.n], Math.sqrt(v[k - 1] ** 2 + 2 * ACC * ds));
  v[N] = 0;
  for (let k = N - 1; k >= 0; k--) v[k] = Math.min(v[k], Math.sqrt(v[k + 1] ** 2 + 2 * DEC * ds));
  v[0] = 0;
  for (let k = 1; k <= N; k++) t[k] = t[k - 1] + 2 * ds / Math.max(0.15, v[k - 1] + v[k]);
  return { ia, N, t, T: t[N] };
}
const EVENTS = (() => {
  const ev = [];
  let t = 0;
  BUS_STOPS.forEach((p, i) => {
    const d = p.term ? TERM : DWELL;
    ev.push({ kind: 'dwell', t0: t, t1: t + d, stop: i });
    t += d;
    const q = BUS_STOPS[(i + 1) % BUS_STOPS.length];
    const m = moveTable(p.s, q.s > p.s ? q.s : q.s + route.len);
    ev.push({ kind: 'move', t0: t, t1: t + m.T, from: i, to: (i + 1) % BUS_STOPS.length, m });
    t += m.T;
  });
  return { ev, P: t };
})();
export const BUS_PERIOD = EVENTS.P;

export function busState(nowMs) {
  const T = ((nowMs / 1000) % EVENTS.P + EVENTS.P) % EVENTS.P;
  let lo = 0, hi = EVENTS.ev.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (T < EVENTS.ev[mid].t1) hi = mid; else lo = mid + 1; }
  const e = EVENTS.ev[lo];
  if (e.kind === 'dwell') return { s: BUS_STOPS[e.stop].s, stop: e.stop, left: e.t1 - T, next: e.stop };
  const m = e.m, tau = T - e.t0;
  let a = 0, b = m.N;
  while (b - a > 1) { const c = (a + b) >> 1; if (m.t[c] <= tau) a = c; else b = c; }
  const u = Math.min(1, Math.max(0, (tau - m.t[a]) / Math.max(1e-4, m.t[b] - m.t[a])));
  return { s: (m.ia + a + u) * route.step, stop: -1, left: 0, next: e.to };
}
// cik sekundes līdz autobuss nākamreiz stāvēs pieturā (platformā) i (0 — stāv tagad)
export function busEta(nowMs, i) {
  const T = ((nowMs / 1000) % EVENTS.P + EVENTS.P) % EVENTS.P;
  for (const e of EVENTS.ev) {
    if (e.kind !== 'dwell' || e.stop !== i) continue;
    if (T >= e.t0 && T < e.t1 - 2) return 0;
    return e.t0 >= T ? e.t0 - T : e.t0 + EVENTS.P - T;
  }
  return 1e9;
}
const zoneOfG = (x, z) => {
  for (const id of BUS_ZONES) { const [ox, oz] = zoneOffset(id); if (Math.max(Math.abs(x - ox), Math.abs(z - oz)) <= ZONE_HALF) return id; }
  return FARM;
};
const nextStopName = (st) => { const p = BUS_STOPS[st.next]; return p ? `${p.icon} ${p.name}` : ''; };

// ---------- modeļi ----------
// teksts uz audekla; burti samazinās, lai ietilptu platumā
function busTex(text, w = 512, h = 64, bg = '#111', fg = '#ffb000', bold = 0.62) {
  return canvasTexture(w, h, (c) => {
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); } else c.clearRect(0, 0, w, h);
    let fs = Math.round(h * bold);
    c.font = `bold ${fs}px sans-serif`;
    while (c.measureText(text).width > w * 0.94 && fs > 8) { fs -= 2; c.font = `bold ${fs}px sans-serif`; }
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
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
const WHEEL_F = 2.75, WHEEL_R = -3.2, ARCH = 0.64;
export function buildBus() {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const st = new THREE.Group(); // statiskās daļas (tiks apvienotas)
  const blue = mat('#1d6ad2', { roughness: 0.35, metalness: 0.3 }), white = mat('#f3f5f8', { roughness: 0.4, metalness: 0.1 });
  const dark = mat('#22252a', { roughness: 0.75 }), black = mat('#121417', { roughness: 0.5 }), chrome = mat('#cfd5da', { metalness: 0.85, roughness: 0.25 });
  const yellow = mat('#f2c12e', { roughness: 0.5 });
  const B = (w, h, d, m, x, y, z, parent = st) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; };
  const L = 10.4, HL = L / 2, W = 2.5, HW = W / 2;
  B(W - 0.04, 0.12, L - 0.1, dark, 0, 0.6, 0); // grīda
  B(W - 0.3, 0.3, L - 0.6, black, 0, 0.42, 0); // šasija
  // apakšējās sānu sienas ar riteņu arkām (zilas)
  const side = new THREE.Shape();
  side.moveTo(-HL, 0.4);
  side.lineTo(WHEEL_R - ARCH, 0.4); side.absarc(WHEEL_R, 0.5, ARCH, Math.PI, 0, true);
  side.lineTo(WHEEL_F - ARCH, 0.4); side.absarc(WHEEL_F, 0.5, ARCH, Math.PI, 0, true);
  side.lineTo(HL, 0.4); side.lineTo(HL, 1.48); side.lineTo(-HL, 1.48); side.closePath();
  const sideGeo = new THREE.ExtrudeGeometry(side, { depth: 0.08, bevelEnabled: false, curveSegments: 10 }).rotateY(-Math.PI / 2);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(sideGeo, blue); m.position.x = s > 0 ? HW : -HW + 0.08; st.add(m);
    // gumijas arku apmales
    for (const z of [WHEEL_F, WHEEL_R]) {
      const a = new THREE.Mesh(new THREE.TorusGeometry(ARCH + 0.02, 0.045, 5, 14, Math.PI).rotateY(Math.PI / 2), black);
      a.position.set(s * (HW + 0.01), 0.5, z); st.add(a);
    }
    B(0.03, 0.1, L - 0.1, white, s * (HW + 0.012), 1.43, 0);   // balta josla zem logiem
    B(0.03, 0.05, L - 0.1, yellow, s * (HW + 0.014), 1.34, 0); // dzeltena līnija
    B(0.03, 0.08, L - 0.2, black, s * (HW + 0.01), 0.44, 0);   // apakšējā apmale
  }
  // priekša: zila apakša, melna maska ar resti, buferis, numurs
  B(W, 1.08, 0.08, blue, 0, 0.94, HL - 0.04);
  B(W - 0.5, 0.32, 0.04, black, 0, 0.98, HL + 0.01);
  for (let i = 0; i < 4; i++) B(W - 0.6, 0.03, 0.02, chrome, 0, 0.88 + i * 0.07, HL + 0.035);
  B(W + 0.04, 0.24, 0.16, dark, 0, 0.52, HL + 0.04);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.15), new THREE.MeshStandardMaterial({ map: busTex('MEŽVIDI 1', 256, 64, '#ffffff', '#111', 0.7), roughness: 0.5 }));
  plate.position.set(0, 0.52, HL + 0.125); st.add(plate);
  // aizmugure: zila siena, motora reste, numurs
  B(W, 1.08, 0.08, blue, 0, 0.94, -HL + 0.04);
  for (let i = 0; i < 5; i++) B(W - 0.9, 0.035, 0.02, black, 0, 0.75 + i * 0.08, -HL - 0.01);
  B(W + 0.04, 0.24, 0.16, dark, 0, 0.52, -HL - 0.04);
  const plate2 = plate.clone(); plate2.position.set(0, 0.52, -HL - 0.125); plate2.rotation.y = Math.PI; st.add(plate2);
  // logu josla: melni statņi starp logiem
  for (const s of [-1, 1]) for (const z of [-HL + 0.07, -3.0, -0.95, 1.1, 3.35, HL - 0.07]) B(0.1, 1.02, 0.16, black, s * (HW - 0.05), 2.0, z);
  for (const x of [-HW + 0.07, HW - 0.07]) { B(0.14, 1.02, 0.1, black, x, 2.0, HL - 0.05); B(0.14, 1.02, 0.1, black, x, 2.0, -HL + 0.05); }
  B(W, 0.1, 0.08, black, 0, 1.53, HL - 0.04); B(W, 0.1, 0.08, black, 0, 1.53, -HL + 0.04);
  // jumts ar noapaļotām malām (balts), jumta kaste un lūka
  const rs = new THREE.Shape(), rr2 = 0.26, rb = 2.5, rt = 2.92;
  rs.moveTo(-HW, rb); rs.lineTo(HW, rb); rs.lineTo(HW, rt - rr2); rs.quadraticCurveTo(HW, rt, HW - rr2, rt);
  rs.lineTo(-HW + rr2, rt); rs.quadraticCurveTo(-HW, rt, -HW, rt - rr2); rs.closePath();
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(rs, { depth: L, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -HL), white);
  st.add(roof);
  B(W - 0.7, 0.2, 2.4, white, 0, 3.0, -2.4); // kondicionieris
  B(0.7, 0.06, 0.7, dark, 0, 2.95, 1.3);    // lūka
  B(W - 0.2, 0.06, 0.06, blue, 0, 2.55, HL + 0.005); // zila mala virs priekšējā stikla
  // lukturi
  const li = new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffe7a8', emissiveIntensity: 0.9 });
  const ta = new THREE.MeshStandardMaterial({ color: '#b01818', emissive: '#6a0808', emissiveIntensity: 0.8 });
  const am = new THREE.MeshStandardMaterial({ color: '#ff9a1a', emissive: '#a05000', emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    B(0.44, 0.2, 0.05, chrome, s * 0.9, 0.98, HL + 0.01);
    B(0.38, 0.15, 0.04, li, s * 0.9, 0.98, HL + 0.035);
    B(0.12, 0.1, 0.04, am, s * 1.12, 0.76, HL + 0.02);
    B(0.22, 0.5, 0.05, ta, s * 1.0, 1.1, -HL - 0.02);
    B(0.12, 0.12, 0.04, am, s * 1.0, 0.75, -HL - 0.02);
  }
  // spoguļi
  for (const s of [-1, 1]) {
    const arm = B(0.42, 0.04, 0.04, black, s * (HW + 0.18), 2.35, HL - 0.15); arm.rotation.y = s * 0.3;
    B(0.05, 0.42, 0.16, black, s * (HW + 0.36), 2.1, HL - 0.05);
    B(0.04, 0.36, 0.12, chrome, s * (HW + 0.36), 2.1, HL + 0.035);
  }
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
  // turēšanās stieņi pie griestiem
  for (const x of [-0.35, 0.35]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, L - 1.6, 6).rotateX(Math.PI / 2), chrome); p.position.set(x, 2.3, -0.4); st.add(p); }
  B(0.6, 0.12, 0.55, dark, 0.7, 1.02, 3.85); B(0.6, 0.6, 0.09, dark, 0.7, 1.35, 3.56);
  const wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 6, 18), dark);
  wheelS.position.set(0.7, 1.5, 4.5); wheelS.rotation.x = -0.9; st.add(wheelS);
  B(0.06, 0.06, 0.5, dark, 0.7, 1.32, 4.65).rotation.x = -0.9;
  B(W - 0.3, 0.5, 0.5, dark, 0, 1.0, HL - 0.35); // panelis
  // maršruta tablo priekšā un aizmugurē, nosaukums sānos starp riteņu arkām
  const route1 = '1 · Ziema · Sēta · Trase · Tirgus';
  const ft = busTex(route1, 768, 64);
  const signM = new THREE.MeshStandardMaterial({ map: ft, emissive: '#ffffff', emissiveMap: ft, emissiveIntensity: 0.55 });
  const fs = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.22), signM); fs.position.set(0, 2.4, HL + 0.012); st.add(fs);
  const bt = busTex('1', 128, 64);
  const rsg = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ map: bt, emissive: '#ffffff', emissiveMap: bt, emissiveIntensity: 0.55 }));
  rsg.position.set(0, 2.35, -HL - 0.012); rsg.rotation.y = Math.PI; st.add(rsg);
  const nameT = busTex('🌲 MEŽVIDU AUTOBUSS', 1024, 80, null, '#ffffff', 0.6);
  const sideM = new THREE.MeshStandardMaterial({ map: nameT, transparent: true, alphaTest: 0.3, roughness: 0.5 });
  const zA = WHEEL_R + ARCH + 0.12, zB = WHEEL_F - ARCH - 0.12; // starp arkām
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(zB - zA, (zB - zA) * 80 / 1024), sideM);
    p.position.set(s * (HW + 0.014), 0.92, (zA + zB) / 2); p.rotation.y = s * Math.PI / 2; st.add(p);
  }
  const flat = flattenStatic(st);
  body.add(flat);
  // stikli (caurspīdīgi — redzami pasažieri)
  const glass = new THREE.MeshStandardMaterial({ color: '#9fc4dc', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  glass.userData.keepPBR = true;
  for (const s of [-1, 1]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.2, 0.92), glass); g.position.set(s * (HW - 0.03), 2.02, 0); g.rotation.y = Math.PI / 2; body.add(g); }
  const wf = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, 1.0), glass); wf.position.set(0, 2.0, HL - 0.02); wf.rotation.x = -0.06; body.add(wf);
  const wb = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, 0.86), glass); wb.position.set(0, 2.0, -HL + 0.03); body.add(wb);
  // durvis labajā pusē (divas stikla vērtnes ar rāmi, atveras pieturā)
  const doorM = new THREE.MeshStandardMaterial({ color: '#1a2a3a', roughness: 0.2, metalness: 0.4, transparent: true, opacity: 0.55 });
  doorM.userData.keepPBR = true;
  const DZ = [3.9, 4.48];
  const doors = DZ.map((z) => {
    const d = new THREE.Group(); d.position.set(-HW - 0.03, 1.5, z); body.add(d);
    d.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.78, 0.56), doorM));
    for (const y of [-0.87, 0.87]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.58), black); f.position.y = y; d.add(f); }
    for (const zz of [-0.27, 0.27]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.78, 0.04), black); f.position.z = zz; d.add(f); }
    return d;
  });
  // riteņi ar diskiem un skrūvēm
  const tyre = mat('#151515', { roughness: 0.92 }), hub = mat('#d8dde2', { metalness: 0.7, roughness: 0.3 });
  const wheels = [];
  const tyreG = new THREE.CylinderGeometry(0.5, 0.5, 0.34, 20).rotateZ(Math.PI / 2), hubG = new THREE.CylinderGeometry(0.28, 0.28, 0.36, 12).rotateZ(Math.PI / 2);
  const capG = new THREE.CylinderGeometry(0.1, 0.1, 0.38, 8).rotateZ(Math.PI / 2), boltG = new THREE.CylinderGeometry(0.025, 0.025, 0.37, 5).rotateZ(Math.PI / 2);
  for (const z of [WHEEL_F, WHEEL_R]) for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * (HW - 0.2), 0.5, z); body.add(w);
    const t = new THREE.Mesh(tyreG, tyre); t.castShadow = true; w.add(t);
    w.add(new THREE.Mesh(hubG, hub));
    w.add(new THREE.Mesh(capG, dark));
    for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(boltG, dark); b.position.set(0, Math.cos(k / 6 * 6.283) * 0.18, Math.sin(k / 6 * 6.283) * 0.18); w.add(b); }
    wheels.push(w);
  }
  body.traverse((o) => { if (o.isMesh && o.material !== glass && o.material !== doorM) { o.castShadow = true; o.receiveShadow = true; } });
  // vadītājs — kaķis Kārlis ar beisbola cepuri
  const driver = buildAnimal({ animal: 'kakis', fur: '#e8a24a', shirt: '#1f6fd6', hat: 'nagene' });
  const ds = new THREE.Group(); ds.position.set(0.7, 0.66, 3.83); body.add(ds); ds.add(driver.root);
  driver.shadow.visible = false;
  return { root, body, seats, wheels, doors, doorZ: DZ, driver };
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
  B(3.9, 0.06, 2.0, mat('#9a968c', { roughness: 1 }), 0, 0.03, 0); // bruģa laukumiņš
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
// Divi autobusi pa to pašu apli: otrais brauc pusapli (pusi no grafika laika) aiz pirmā.
// Tīklā sēdvieta p[9] = autobusa nr. · SEATS + vieta (vecie klienti sūta 0..11 — 1. autobuss).
export const BUS_COUNT = 2;
const SEATS = 12;
const busOffset = (k) => -k * EVENTS.P * 1000 / BUS_COUNT;
export const Bus = {
  initBus() {
    this.buses = [];
    for (let k = 0; k < BUS_COUNT; k++) {
      const b = { k, obj: buildBus(), vis: false, lastS: null };
      b.obj.root.visible = false;
      this.stage.add(b.obj.root);
      this.buses.push(b);
    }
    this.bus = this.buses[0]; // saderībai (karte u.c.)
    this.busStopShown = -2;
    // nojumes: katrai zemei sava grupa uz stage (redzama tikai tajā zemē; augstums — kad zeme ielādēta)
    this.busStopGroups = {};
    BUS_STOPS.forEach((s) => {
      const zone = zoneOfG(s.x, s.z), [ox, oz] = zoneOffset(zone);
      s.zone = zone; s.lx = s.x - ox; s.lz = s.z - oz;
      const g = buildStop(s);
      g.position.set(s.lx, 0, s.lz);
      g.rotation.y = s.ry;
      (this.busStopGroups[zone] = this.busStopGroups[zone] || new THREE.Group()).add(g);
    });
    for (const z in this.busStopGroups) { this.busStopGroups[z].visible = false; this.stage.add(this.busStopGroups[z]); }
  },

  // cik sekundes līdz kāds autobuss stāvēs pieturā i
  busEtaAny(i) { let e = 1e9; for (let k = 0; k < BUS_COUNT; k++) e = Math.min(e, busEta(this.now() + busOffset(k), i)); return e; },
  myBus() { return this.me.bus ? this.buses[this.me.bus.b || 0] : null; },

  // katru kadru: autobusu vietas, pieturu redzamība, pasažieris
  updateBus(dt) {
    if (!this.buses) return;
    for (const z in this.busStopGroups) {
      const grp = this.busStopGroups[z], here = z === this.zone && !this.zoneBusy && !!this.terr && !!this.terr.getHeight;
      if (here && grp.userData.terr !== this.terr) {
        grp.userData.terr = this.terr;
        for (const c of grp.children) c.position.y = this.terr.getHeight(c.position.x, c.position.z);
      }
      grp.visible = here;
    }
    const now = this.now();
    for (const B of this.buses) this.updateOneBus(B, now + busOffset(B.k), dt);
    if (this.me.bus) this.busRider(dt);
  },

  updateOneBus(B, now, dt) {
    const st = B.st = busState(now);
    const p = pathAt(st.s);
    const zone = B.zone = zoneOfG(p.x, p.z), [ox, oz] = zoneOffset(zone);
    const h = p.h;
    B.lx = p.x - ox; B.lz = p.z - oz; B.h = h;
    let ds = B.lastS == null ? 0 : st.s - B.lastS;
    if (ds < -route.len / 2) ds += route.len;
    const speed = Math.abs(ds) / Math.max(dt, 1e-3);
    B.lastS = st.s; B.speed = speed;
    const o = B.obj;
    B.vis = zone === this.zone && !!this.terr && !!this.terr.getHeight && !this.zoneBusy;
    o.root.visible = B.vis;
    if (!B.vis) return;
    const T = this.terr, y = T.getHeight(B.lx, B.lz);
    const fx = Math.sin(h) * 4, fz = Math.cos(h) * 4;
    const hf = T.getHeight(B.lx + fx, B.lz + fz), hb = T.getHeight(B.lx - fx, B.lz - fz);
    o.root.position.set(B.lx, y, B.lz);
    o.root.rotation.order = 'YXZ';
    o.root.rotation.y = h;
    o.root.rotation.x = lerpA(o.root.rotation.x, -Math.atan2(hf - hb, 8), 0.2);
    // līkumā autobuss nedaudz sasveras uz āru
    const dh = B.lastH == null ? 0 : angDiff(h, B.lastH) / Math.max(dt, 1e-3);
    B.lastH = h;
    o.body.rotation.z = lerpA(o.body.rotation.z, Math.max(-0.05, Math.min(0.05, -dh * speed * 0.012)), Math.min(1, dt * 3));
    for (const w of o.wheels) w.rotation.x += speed * dt / 0.5;
    // durvis atveras pieturā
    const open = st.stop >= 0 && st.left > 1.2 ? 1 : 0;
    B.door = (B.door || 0) + (open - (B.door || 0)) * Math.min(1, dt * 4);
    o.doors[0].position.z = o.doorZ[0] - B.door * 0.52; o.doors[1].position.z = o.doorZ[1] + B.door * 0.52;
    o.doors[0].position.x = o.doors[1].position.x = -1.28 - B.door * 0.08;
    o.driver.animate(dt, 'sit', 0);
    o.driver.head.rotation.y = st.stop >= 0 ? Math.sin(now / 900) * 0.5 : 0;
    // gājēji neiet cauri autobusam
    if (!this.me.bus && !this.me.veh && !this.me.inKart && !this.me.ride) pushOut(this.me.pos, B.lx, B.lz, h, 1.25 + 0.4, 5.2 + 0.4);
  },

  busActions(consider, d2) {
    if (!this.buses || this.me.bus) return;
    for (const B of this.buses) {
      const st = B.st;
      if (B.vis && st && st.stop >= 0 && st.left > 1.5) {
        consider(d2(B.lx, B.lz) * 0.4, 7.5, `🚌 Iekāpt autobusā (${BUS_PRICE}🪙)`, () => this.boardBus(B.k));
      }
    }
    // pie pieturas — cik ilgi jāgaida (tuvākais no abiem autobusiem)
    for (const s of BUS_STOPS) {
      if (s.zone !== this.zone) continue;
      const eta = this.busEtaAny(s.i);
      if (eta > 0) consider(d2(s.lx, s.lz) + 1, 4.5, `🚏 ${s.name}: autobuss pēc ${fmtEta(eta)}`, () => toast(`🚏 ${s.name} — autobuss atbrauks pēc ${fmtEta(this.busEtaAny(s.i))}. Brauciens ${BUS_PRICE}🪙. Maršruts: ❄️ Ziema · 🏡 Sēta · 🏁 Trase · 🛒 Tirgus (2 autobusi).`));
    }
  },

  boardBus(k = 0) {
    const B = this.buses[k], me = this.me;
    if (!B.vis || !B.st || B.st.stop < 0) { toast('Autobusā var iekāpt tikai pieturā 🚏'); return; }
    if (this.save.coins < BUS_PRICE) { toast(`Nepietiek monētu — brauciens maksā ${BUS_PRICE}🪙`, 'bad'); return; }
    const taken = this.busTaken(k);
    const seat = B.obj.seats.findIndex((_, i) => !taken.has(i));
    if (seat < 0) { toast('🚌 Autobuss ir pilns!', 'bad'); return; }
    if (this.fishing) this.stopFishing();
    if (me.carry) this.stowCarry();
    this.addCoins(-BUS_PRICE, true);
    me.bus = { seat, b: k, net: k * SEATS + seat };
    B.obj.seats[seat].add(this.avatar.root);
    this.avatar.root.position.set(0, 0, 0); this.avatar.root.rotation.set(0, 0, 0);
    this.avatar.shadow.visible = false;
    me.state = 'sit';
    $('btn-jump').classList.add('hidden');
    sfx('coin');
    this.busStopShown = B.st.stop;
    const q = BUS_STOPS[(B.st.stop + 1) % BUS_STOPS.length];
    toast(`🐱 Kaķis Kārlis: „Laipni lūdzam! ${BUS_PRICE}🪙, paldies! Nākamā pietura — ${q.icon} ${q.name}.” Izkāpt var tikai pieturā 🚏`, 'good', 5000);
  },

  // aizņemtās sēdvietas autobusā k (pēc draugu ziņām)
  busTaken(k) {
    const t = new Set();
    for (const r of this.remotes.values()) if (r.vehCode === BUS_CODE && Math.floor((r.rideSeat || 0) / SEATS) === k) t.add((r.rideSeat || 0) % SEATS);
    return t;
  },

  leaveBus(force = false) {
    const B = this.myBus(), me = this.me;
    if (!me.bus) return;
    if (!force && (!B.st || B.st.stop < 0)) { toast(`Izkāpt var tikai pieturā 🚏 — nākamā: ${nextStopName(B.st)}`); return; }
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
    const B = this.myBus(), me = this.me;
    if (B.zone !== this.zone) {
      if (!this.zoneBusy) this.teleport(B.zone, { x: B.lx, z: B.lz }, B.h);
      return;
    }
    if (!B.vis) return;
    // ja draugs ar mazāku id sēž manā vietā — pārsēžamies
    for (const r of this.remotes.values()) {
      if (r.vehCode === BUS_CODE && r.rideSeat === me.bus.net && r.id < this.myId) {
        const taken = this.busTaken(B.k), free = B.obj.seats.findIndex((_, i) => !taken.has(i) && i !== me.bus.seat);
        if (free < 0) { this.leaveBus(true); toast('🚌 Autobusā vairs nav vietas'); return; }
        me.bus.seat = free; me.bus.net = B.k * SEATS + free;
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
    if (B.st.stop >= 0 && this.busStopShown !== B.st.stop) {
      this.busStopShown = B.st.stop;
      const s = BUS_STOPS[B.st.stop];
      toast(`🚏 Pietura: ${s.icon} ${s.name} — vari izkāpt (🚶 Izkāpt)`, 'good', 4000);
      sfx('beep');
    }
    if (B.st.stop < 0 && this.busStopShown !== -1) {
      this.busStopShown = -1;
      toast(`🚌 Nākamā pietura: ${nextStopName(B.st)}`, '', 2500);
    }
  },

  // drauga avatārs autobusa sēdvietā; true — apstrādāts
  busRemote(r, here, dt) {
    if (r.vehCode !== BUS_CODE) return false;
    const n = r.rideSeat || 0, B = this.buses && this.buses[Math.floor(n / SEATS)] || (this.buses && this.buses[0]);
    if (!here || !B || !B.vis) { r.avatar.root.visible = false; return true; }
    const seat = B.obj.seats[n % SEATS] || B.obj.seats[0];
    if (r.avatar.root.parent !== seat) { seat.add(r.avatar.root); r.avatar.root.position.set(0, 0, 0); r.avatar.root.rotation.set(0, 0, 0); }
    r.avatar.shadow.visible = false;
    r.avatar.root.visible = true;
    r.avatar.animate(dt, 'sit', 0);
    return true;
  },
};

const lerpA = (a, b, k) => a + (b - a) * k;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
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

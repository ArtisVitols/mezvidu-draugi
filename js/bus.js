// 🚌 Zilais autobuss: brauc pa lielu apli — ❄️ Ziemas laukums → sēta → 🏁 sacīkšu trase → sēta → 🛒 Mežvidu tirgus → sēta → atpakaļ uz Ziemu.
// Katrā galā (Ziemas laukums, trase, tirgus) ir apļveida ceļš — autobuss to apbrauc un brauc atpakaļ pa to pašu ceļu (labā josla),
// nevis apgriežas uz vietas. Kustība izriet tikai no kopējā pulksteņa (game.now()), tāpēc visi spēlētāji redz autobusu vienā vietā
// bez tīkla ziņām. Ātrums atkarīgs no līkuma (aplī lēnāk). Iekāpt un izkāpt var tikai pieturās, brauciens maksā BUS_PRICE. Vada kaķis Kārlis.
// Maršruts — globālās koordinātēs (zemes vietējās + zoneOffset); autobuss redzams tikai tajā zemē, kurā tas ir.
import * as THREE from 'three';
import { mat, canvasTexture } from './util.js?v=1.44.0';
import { buildAnimal, flattenStatic } from './characters.js?v=1.44.0';
import { $, toast, sfx } from './ui.js?v=1.44.0';
import { voice } from './audio.js?v=1.44.0';
import { roadNS, roadEW, FOREST_ROAD, FOREST_RING, raceGeo } from './world.js?v=1.44.0';
import { WINTER_ROAD, WINTER_RING } from './winter.js?v=1.44.0';
import { zoneOffset, ZONE_HALF, FARM, FOREST, RACE, smoothRoad } from './zones.js?v=1.44.0';
import { busStopSvg } from './icons.js?v=1.44.0';
import * as A from './assets.js?v=1.44.0';

export const BUS_PRICE = 2;
const BOARD_R = 4; // m no autobusa malas, kur parādās „Iekāpt” (1.32.0)
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
  // gluds virziens katrā punktā (pieskare pa ±3 m, slēgtam aplim), starp punktiem — interpolēts, lai stūrēšana neraustās
  const H = new Float32Array(n + 1), w = 3;
  for (let i = 0; i <= n; i++) {
    const a = ((i - w) % n + n) % n, b = (i + w) % n;
    H[i] = Math.atan2(X[b] - X[a], Z[b] - Z[a]);
  }
  return { X, Z, H, n, step: length / n, len: length };
})();

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function pathAt(s) {
  s = ((s % route.len) + route.len) % route.len;
  const f = Math.min(route.n - 0.001, s / route.step), i = Math.floor(f), u = f - i;
  const x = route.X[i] + (route.X[i + 1] - route.X[i]) * u, z = route.Z[i] + (route.Z[i + 1] - route.Z[i]) * u;
  const h0 = route.H[i], dh = angDiff(route.H[i + 1], h0);
  return { x, z, h: h0 + dh * u, turn: dh / route.step }; // turn — virziena maiņa uz metru (rad/m)
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
export const buildBus = A.buildBus; // 1.37.0: jaunais modelis (assets.js)

export const buildStop = A.buildStop; // 1.37.0: jaunais modelis (assets.js)

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
    for (const B of this.buses) {
      // gluds pulkstenis: kopīgais laiks (Date.now ar sinhronizācijas lēcieniem) raustās — ejam ar kadra dt un maigi pievelkam
      const want = now + busOffset(B.k);
      if (B.clk == null || Math.abs(want - B.clk) > 3000) B.clk = want;
      else B.clk += dt * 1000 + (want - B.clk - dt * 1000) * Math.min(1, dt * 1.5);
      this.updateOneBus(B, B.clk, dt);
    }
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
    const raw = Math.min(30, Math.abs(ds) / Math.max(dt, 1e-3));
    const speed = B.speed = B.speed == null ? raw : B.speed + (raw - B.speed) * (1 - Math.exp(-dt * 6));
    B.lastS = st.s;
    const o = B.obj;
    B.vis = zone === this.zone && !!this.terr && !!this.terr.getHeight && !this.zoneBusy;
    o.root.visible = B.vis;
    if (!B.vis) return;
    const T = this.terr;
    const fx = Math.sin(h) * 3.2, fz = Math.cos(h) * 3.2;
    const hf = T.getHeight(B.lx + fx, B.lz + fz), hb = T.getHeight(B.lx - fx, B.lz - fz), hc = T.getHeight(B.lx, B.lz);
    // augstums un slīpums pēc riteņu vietām, mīksti (bez zemes trīcēšanas)
    const yT = Math.max(hc, (hf + hb) / 2), kk = 1 - Math.exp(-dt * 10);
    B.y = B.y == null || Math.abs(B.y - yT) > 3 ? yT : B.y + (yT - B.y) * kk;
    o.root.position.set(B.lx, B.y, B.lz);
    o.root.rotation.order = 'YXZ';
    o.root.rotation.y = h;
    o.root.rotation.x = lerpA(o.root.rotation.x, -Math.atan2(hf - hb, 6.4), 1 - Math.exp(-dt * 6));
    // līkumā autobuss nedaudz sasveras uz āru (pēc ceļa izliekuma un ātruma — bez trokšņa)
    const yawRate = p.turn * speed;
    o.body.rotation.z = lerpA(o.body.rotation.z, Math.max(-0.05, Math.min(0.05, -yawRate * speed * 0.012)), 1 - Math.exp(-dt * 3));
    for (const w of o.wheels) w.rotation.x += speed * dt / 0.5;
    // durvis atveras pieturā
    const open = st.stop >= 0 && st.left > 1.2 ? 1 : 0;
    B.door = (B.door || 0) + (open - (B.door || 0)) * Math.min(1, dt * 4);
    o.doors[0].position.z = o.doorZ[0] - B.door * 0.52; o.doors[1].position.z = o.doorZ[1] + B.door * 0.52;
    o.doors[0].position.x = o.doors[1].position.x = -1.28 - B.door * 0.08;
    if (o.driver && o.driver.animate) { // 1.37.0: jaunajā autobusā šoferis ir daļa no modeļa (nekustīgs)
      o.driver.animate(dt, 'sit', 0);
      o.driver.head.rotation.y = st.stop >= 0 ? Math.sin(now / 900) * 0.5 : 0;
    }
    // gājēji neiet cauri autobusam
    if (!this.me.bus && !this.me.veh && !this.me.inKart && !this.me.ride) pushOut(this.me.pos, B.lx, B.lz, h, 1.25 + 0.4, 5.2 + 0.4);
  },

  busActions(consider, d2) {
    if (!this.buses || this.me.bus) return;
    const p = this.me.pos;
    for (const B of this.buses) {
      const st = B.st;
      // attālums līdz autobusa malai (taisnstūris 2,5 × 10,4 m)
      const c = Math.cos(B.h || 0), sn = Math.sin(B.h || 0), dx = p.x - B.lx, dz = p.z - B.lz;
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      const edge = B.vis ? Math.hypot(Math.max(0, Math.abs(lx) - 1.25), Math.max(0, Math.abs(lz) - 5.2)) : 99;
      // pēc izkāpšanas šajā autobusā atkal iekāpt var tikai tad, kad esi aizgājis prom un atnācis atpakaļ
      if (this.busLock && this.busLock[B.k]) { if (edge > BOARD_R + 0.5) this.busLock[B.k] = false; else continue; }
      if (B.vis && st && st.stop >= 0 && st.left > 1.5) {
        consider(edge * 0.5, BOARD_R * 0.5, `🚌 Iekāpt autobusā (${BUS_PRICE}🪙)`, () => this.boardBus(B.k));
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
    sfx('coin', { vol: 0.6 }); sfx('st_stone', { vol: 0.6, delay: 0.15 });
    this.busStopShown = B.st.stop;
    const q = BUS_STOPS[(B.st.stop + 1) % BUS_STOPS.length];
    voice('b_in' + q.si);
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
    (this.busLock = this.busLock || {})[me.bus.b || 0] = true;
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
      voice('b_at' + s.si, { delay: 0.5 });
      sfx('beep');
    }
    if (B.st.stop < 0 && this.busStopShown !== -1) {
      this.busStopShown = -1;
      toast(`🚌 Nākamā pietura: ${nextStopName(B.st)}`, '', 2500);
      { const p = BUS_STOPS[B.st.next]; if (p) voice('b_next' + p.si, { delay: 1.2 }); }
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

// Sacīkšu trases apkārtne: barjeras gar trasi (riepas, koka žogs, siena ķīpas), lai ar kartu nevar aizbraukt no trases,
// starta laukums (kartu vieta), grants stāvlaukums ar zīmi „P” un goda pjedestāls 1.–3. vietai.
// Viss trases sākuma rāmī: o — trases punkts 30 (pie kartu vietas), t — trases virziens, n — uz kartu vietas pusi.
// Lokālās koordinātes: l — attālums no trases vidus uz n pusi, a — gar trasi (t virzienā).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js?v=1.32.0';
import { mat, canvasTexture, makeTextSprite, smoothstep } from './util.js?v=1.32.0';
import { InstanceField } from './instancing.js?v=1.32.0';
import { parkingSvg } from './icons.js?v=1.32.0';

export const BARRIER_OFF = 8.4;      // barjeru līnija no trases vidus (trase 12 m plata)
export const KART_LIM = 7.6;         // tālāk par šo karta vidus netiek (no trases vidus)
export const PIT = { a0: -7, a1: 7, l0: 0, l1: 16 };     // iežogotais starta laukums ar kartu vietu (l = 12)
export const LOT = { a0: -12, a1: 12, l0: 20, l1: 42 };  // grants stāvlaukums
export const YARD = { a0: -22, a1: 16, l0: -2, l1: 48 }; // līdzenā vieta (reljefs = trases augstums)
export const PODIUM = { l: 13, a: -12 };
export const ROAD_END = { l: 47, a: 0 };

// rāmis no trases punktiem (World.buildTrackCurve)
export function raceFrame(P, T, k = 30) {
  const o = P[k], t = T[k];
  const n = { x: -t.z, z: t.x };
  // n jāvērš uz austrumiem (uz to pusi ienāk ceļš no sētas)
  if (n.x < 0) { n.x = -n.x; n.z = -n.z; }
  const toW = (l, a) => ({ x: o.x + n.x * l + t.x * a, z: o.z + n.z * l + t.z * a });
  const toL = (x, z) => { const dx = x - o.x, dz = z - o.z; return { l: dx * n.x + dz * n.z, a: dx * t.x + dz * t.z }; };
  return { o, t, n, toW, toL, rotY: Math.atan2(-n.z, n.x) }; // grupai ar rotY: lokālā +X = n, lokālā +Z = −t (a = −Z)
}

const inRect = (q, R, m = 0) => q.a > R.a0 - m && q.a < R.a1 + m && q.l > R.l0 - m && q.l < R.l1 + m;
// cik stipri reljefs jāizlīdzina līdz trases augstumam (1 — pilnībā)
export function yardWeight(F, x, z) {
  const q = F.toL(x, z);
  const da = Math.max(YARD.a0 - q.a, q.a - YARD.a1, 0), dl = Math.max(YARD.l0 - q.l, q.l - YARD.l1, 0);
  return 1 - smoothstep(0, 16, Math.hypot(da, dl)); // gluda mala ~16 m
}
export const inRaceYard = (F, x, z, m = 0) => inRect(F.toL(x, z), YARD, m);
export const inLot = (F, x, z, m = 0) => inRect(F.toL(x, z), LOT, m);

// ---------- karta ierobežošana ----------
// atgriež true, ja karts bija ārpus atļautās vietas (trase + starta laukums) un tika atbīdīts atpakaļ
export function kartClamp(W, pos, hint) {
  const info = W.nearestTrackIdx(pos.x, pos.z, hint);
  if (info.dist <= KART_LIM) return false;
  const F = W.raceF, q = F.toL(pos.x, pos.z);
  const pa0 = PIT.a0 + 0.9, pa1 = PIT.a1 - 0.9, pl1 = PIT.l1 - 0.9;
  if (q.a > pa0 && q.a < pa1 && q.l > 0 && q.l < pl1) return false;
  const p = W.trackPts[info.idx];
  const cx = p.x + (pos.x - p.x) / info.dist * KART_LIM, cz = p.z + (pos.z - p.z) / info.dist * KART_LIM;
  let bx = cx, bz = cz;
  if (q.l > 0 && q.l < PIT.l1 + 6 && q.a > PIT.a0 - 6 && q.a < PIT.a1 + 6) {
    const w = F.toW(Math.min(pl1, Math.max(0, q.l)), Math.min(pa1, Math.max(pa0, q.a)));
    if (Math.hypot(w.x - pos.x, w.z - pos.z) < Math.hypot(cx - pos.x, cz - pos.z)) { bx = w.x; bz = w.z; }
  }
  pos.x = bx; pos.z = bz;
  return true;
}

// ---------- modeļi ----------
let tyreTex = null, strawTex = null, gravelTex = null;
function tyreSide() {
  return tyreTex || (tyreTex = canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { const l = 200 + Math.random() * 55; g.fillStyle = `rgb(${l},${l},${l})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    // divas riepas viena virs otras: sprauga vidū un protektora rievas
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(0, h / 2 - 3, w, 6); g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < w; x += 8) { g.fillRect(x, 5, 3, h / 2 - 10); g.fillRect(x + 4, h / 2 + 5, 3, h / 2 - 10); }
  }));
}
function straw() {
  return strawTex || (strawTex = canvasTexture(128, 64, (g, w, h) => {
    g.fillStyle = '#d9b860'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const l = 150 + Math.random() * 90;
      g.strokeStyle = `rgba(${l},${l * 0.8 | 0},${l * 0.35 | 0},0.7)`; g.lineWidth = 1;
      const x = Math.random() * w, y = Math.random() * h, a = (Math.random() - 0.5) * 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); g.stroke();
    }
  }));
}
function gravel() {
  if (gravelTex) return gravelTex;
  gravelTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#9d968a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const l = 110 + Math.random() * 110, r = 0.8 + Math.random() * 2.2;
      g.fillStyle = `rgb(${l},${l * 0.96 | 0},${l * 0.88 | 0})`;
      g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, r, r * (0.6 + Math.random() * 0.4), Math.random() * 3, 0, 7); g.fill();
    }
  });
  gravelTex.wrapS = gravelTex.wrapT = THREE.RepeatWrapping;
  return gravelTex;
}

// barjeru veidnes: modelis gar lokālo x asi (garums), centrā uz zemes. Katrs veids — viens mešs ar krāsām virsotnēs
// (viens zīmēšanas izsaukums uz apgabalu un veidu)
const tplMats = {};
function barrierTemplate(kind) {
  const parts = [];
  const col = new THREE.Color();
  const add = (geo, color, x = 0, y = 0, z = 0, ry = 0, uvAt = null) => {
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    col.set(color);
    const n = geo.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (uvAt) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uvAt[0], uvAt[1]); }
    parts.push(geo);
  };
  let map = null;
  if (kind.startsWith('tyre')) {
    const sc = kind === 'tyreR' ? '#d42a22' : kind === 'tyreW' ? '#f2f2ee' : '#3a3a3c';
    map = tyreSide();
    add(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 12, 1, true), sc, 0, 0.25, 0);
    add(new THREE.RingGeometry(0.14, 0.32, 12).rotateX(-Math.PI / 2), '#2a2a2c', 0, 0.5, 0, 0, [0.5, 0.95]);
    add(new THREE.CircleGeometry(0.15, 10).rotateX(-Math.PI / 2), '#080808', 0, 0.3, 0, 0, [0.5, 0.5]);
  } else if (kind === 'fence') {
    for (const x of [-1, 1]) add(new THREE.BoxGeometry(0.13, 1.05, 0.13), '#6e4f30', x, 0.5, 0);
    add(new THREE.BoxGeometry(2.1, 0.14, 0.05), '#8d6a42', 0, 0.45, 0.07);
    add(new THREE.BoxGeometry(2.1, 0.14, 0.05), '#8d6a42', 0, 0.82, 0.07);
    add(new THREE.BoxGeometry(2.1, 0.06, 0.06), '#c8382a', 0, 0.98, 0.07);
  } else {
    map = straw();
    const bale = (y, ry) => {
      add(new THREE.BoxGeometry(1.18, 0.5, 0.6), '#ffffff', 0, y, 0, ry);
      for (const x of [-0.3, 0.3]) add(new THREE.BoxGeometry(0.04, 0.52, 0.62), '#4a3820', x * Math.cos(ry), y, -x * Math.sin(ry), ry);
    };
    bale(0.25, 0);
    if (kind === 'hay2') bale(0.75, 0.12);
  }
  const key = map ? (map === tyreTex ? 'tyre' : 'hay') : 'plain';
  const m = tplMats[key] || (tplMats[key] = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, map, roughness: key === 'tyre' ? 0.85 : 0.95 }));
  const mesh = new THREE.Mesh(mergeGeometries(parts), m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  return g;
}

// barjeras abās trases pusēs (izņemot tuneļus un starta laukuma atveri) + starta laukuma žogs
export function buildBarriers(W, parent) {
  const P = W.trackPts, T = W.trackTan, N = P.length, F = W.raceF;
  const rnd = mulberry32(W.seed + 9090);
  const items = [];
  let id = 0;
  const put = (kind, x, z, ry) => items.push({ id: id++, kind, x, y: W.getHeight(x, z), z, ry });
  const SP = { tyre: 0.66, fence: 2.02, hay: 1.24 };
  let alt = 0;
  for (const s of [1, -1]) {
    // nobīdītā līnija; null — tur barjeras nav
    const line = [];
    for (let i = 0; i < N; i++) {
      const p = P[i], t = T[i];
      const x = p.x - t.z * BARRIER_OFF * s, z = p.z + t.x * BARRIER_OFF * s;
      const q = F.toL(x, z);
      const skip = W.tunOut[i] < 3 || W.trackDist(x, z) < BARRIER_OFF - 0.6 || (q.l > 0 && q.a > PIT.a0 && q.a < PIT.a1 && q.l < PIT.l1);
      line.push(skip ? null : { x, z });
    }
    // sākam vietā, kur ir pārtraukums (lai aplis nesadalās nejauši)
    let start = line.findIndex((v) => !v);
    if (start < 0) start = 0;
    let type = null, left = 0, next = 0, painted = false;
    const pick = () => {
      const r = rnd();
      const nt = r < 0.42 ? 'tyre' : r < 0.72 ? 'fence' : 'hay';
      type = nt === type ? (nt === 'tyre' ? 'hay' : 'tyre') : nt;
      left = 18 + rnd() * 40;
      painted = rnd() < 0.55;
      next = 0;
    };
    pick();
    for (let k = 0; k < N; k++) {
      const a = line[(start + k) % N], b = line[(start + k + 1) % N];
      if (!a || !b) { next = 0; continue; }
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      if (len < 1e-3 || len > 6) { next = 0; continue; }
      const ry = Math.atan2(-dz, dx);
      let u = next;
      while (u < len) {
        const x = a.x + dx * (u / len), z = a.z + dz * (u / len);
        if (type === 'tyre') put(painted ? (alt++ % 2 ? 'tyreR' : 'tyreW') : 'tyreK', x, z, ry);
        else if (type === 'fence') put('fence', x + dx / len * 1.0, z + dz / len * 1.0, ry);
        else put(rnd() < 0.25 ? 'hay2' : 'hay', x + dx / len * 0.6, z + dz / len * 0.6, ry);
        u += SP[type];
        left -= SP[type];
        if (left <= 0) { const prev = type; pick(); if (type !== prev) u += 0.6; }
      }
      next = u - len;
    }
  }
  // starta laukuma žogs no riepām (sarkanbaltas) — sānos un aizmugurē, aizmugurē šaura eja kājāmgājējiem
  const seg = (l0, a0, l1, a1) => {
    const A = F.toW(l0, a0), B = F.toW(l1, a1), len = Math.hypot(B.x - A.x, B.z - A.z);
    const ry = Math.atan2(-(B.z - A.z), B.x - A.x);
    for (let u = 0.33; u < len; u += 0.66) put(alt++ % 2 ? 'tyreR' : 'tyreW', A.x + (B.x - A.x) * u / len, A.z + (B.z - A.z) * u / len, ry);
  };
  seg(BARRIER_OFF, PIT.a0, PIT.l1, PIT.a0);
  seg(BARRIER_OFF, PIT.a1, PIT.l1, PIT.a1);
  seg(PIT.l1, PIT.a0, PIT.l1, -1.3);
  seg(PIT.l1, 1.3, PIT.l1, PIT.a1);
  const field = new InstanceField(items, barrierTemplate, { chunk: 96, view: 230 });
  field.build(parent);
  return field;
}

// ---------- starta laukums: liels balts aplis ar rūtotu malu, gaismas aplis un karodziņi ----------
export function buildStartPad(W, parent) {
  const F = W.raceF, ks = W.kartSpot, y = TRACK_Y_OF(W);
  const tex = canvasTexture(512, 512, (c, w, h) => {
    const cx = w / 2, R = w / 2 - 2;
    c.clearRect(0, 0, w, h);
    // rūtota mala
    const n = 36;
    for (let i = 0; i < n; i++) {
      for (let r = 0; r < 2; r++) {
        c.fillStyle = (i + r) % 2 ? '#111111' : '#ffffff';
        c.beginPath(); c.arc(cx, cx, R - r * 22, i / n * Math.PI * 2, (i + 1) / n * Math.PI * 2); c.arc(cx, cx, R - (r + 1) * 22, (i + 1) / n * Math.PI * 2, i / n * Math.PI * 2, true); c.fill();
      }
    }
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx, cx, R - 44, 0, 7); c.fill();
    c.strokeStyle = '#e8262a'; c.lineWidth = 10; c.beginPath(); c.arc(cx, cx, R - 58, 0, 7); c.stroke();
    c.fillStyle = '#e8262a'; c.font = 'bold 84px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('START', cx, cx + 70);
    c.font = '120px sans-serif'; c.fillText('🏎️', cx, cx - 40);
  });
  const padM = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.6, transparent: true });
  const pad = new THREE.Mesh(new THREE.CircleGeometry(3.6, 48), padM);
  pad.rotation.x = -Math.PI / 2;
  pad.rotation.z = F.rotY - Math.PI / 2; // uzraksts pret trasi
  pad.position.set(ks.x, y + 0.07, ks.z);
  pad.receiveShadow = true;
  pad.renderOrder = 1;
  parent.add(pad);
  // pulsējošs gaismas aplis un caurspīdīgs gaismas stabs — redzams no tālienes
  const ringM = new THREE.MeshBasicMaterial({ color: '#ffd21a', transparent: true, opacity: 0.9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.75, 0.1, 6, 48), ringM);
  ring.rotation.x = Math.PI / 2; ring.position.set(ks.x, y + 0.15, ks.z);
  parent.add(ring);
  const beamTex = canvasTexture(4, 64, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
  const beamM = new THREE.MeshBasicMaterial({ color: '#ffe066', map: beamTex, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 5, 32, 1, true), beamM);
  beam.position.set(ks.x, y + 2.5, ks.z);
  parent.add(beam);
  // rūtoti karodziņi abās pusēs
  const flagTex = canvasTexture(64, 48, (c, w, h) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#fff'; c.fillRect(i * 8, j * 8, 8, 8); } });
  const flagM = new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 });
  const poleM = mat('#c9cdd1', { metalness: 0.7, roughness: 0.35 });
  const flags = [];
  for (const s of [-1, 1]) {
    const w = F.toW(F.toL(ks.x, ks.z).l, s * 4.4);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), poleM);
    pole.position.set(w.x, y + 1.6, w.z); pole.castShadow = true; parent.add(pole);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75, 6, 1), flagM);
    fl.geometry.translate(0.55, 0, 0);
    fl.position.set(w.x, y + 2.8, w.z); fl.rotation.y = F.rotY + Math.PI; fl.castShadow = true;
    parent.add(fl); flags.push(fl);
  }
  // animācija (game.update, kad esi trases zemē)
  return (t) => {
    const k = 0.5 + 0.5 * Math.sin(t * 3);
    ring.scale.setScalar(1 + k * 0.06);
    ringM.opacity = 0.55 + k * 0.45;
    beamM.opacity = 0.18 + k * 0.22;
    for (const f of flags) {
      const p = f.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(t * 6 - x * 4) * 0.08 * x); }
      p.needsUpdate = true;
    }
  };
}
const TRACK_Y_OF = (W) => W.getHeight(W.kartSpot.x, W.kartSpot.z);

// ---------- grants stāvlaukums, zīme „P”, goda pjedestāls ----------
export function buildRaceYard(W, parent) {
  const F = W.raceF, y = TRACK_Y_OF(W);
  const g = new THREE.Group();
  g.position.set(F.o.x, y, F.o.z);
  g.rotation.y = F.rotY; // lokālā X = l, Z = −a
  parent.add(g);
  const at = (l, a) => new THREE.Vector3(l, 0, -a);
  // grants laukums
  const gt = gravel();
  const gm = new THREE.MeshStandardMaterial({ map: gt, roughness: 1 });
  const L = LOT.l1 - LOT.l0, A = LOT.a1 - LOT.a0;
  const geo = new THREE.PlaneGeometry(L, A).rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 4, uv.getY(i) * A / 4);
  const lot = new THREE.Mesh(geo, gm);
  lot.position.copy(at((LOT.l0 + LOT.l1) / 2, 0)).setY(0.06);
  lot.receiveShadow = true; g.add(lot);
  // grants ceļš no stāvlaukuma līdz starta laukumam
  const pg = new THREE.PlaneGeometry(LOT.l0 - PIT.l1 + 0.6, 2.6).rotateX(-Math.PI / 2);
  const path = new THREE.Mesh(pg, gm); path.position.copy(at((LOT.l0 + PIT.l1) / 2, 0)).setY(0.055); path.receiveShadow = true; g.add(path);
  // baltas stāvvietu līnijas abās malās
  const lineM = mat('#f4f4ee', { roughness: 0.8 });
  const lines = [];
  for (const lc of [LOT.l0 + 3, LOT.l1 - 3]) for (let a = LOT.a0 + 1; a <= LOT.a1 - 1 + 0.01; a += 2.75) {
    if (Math.abs(a) < 3.5) continue;
    const ln = new THREE.BoxGeometry(5, 0.02, 0.12); ln.translate(lc, 0.08, -a); lines.push(ln);
  }
  if (lines.length) {
    const merged = new THREE.Mesh(mergeAll(lines), lineM); merged.receiveShadow = true; g.add(merged);
  }
  // koka apmales (baļķīši) gar malām, ar ieeju no ceļa un uz starta laukumu
  const logM = mat('#7a5634', { roughness: 0.9 });
  const logs = [];
  const log = (l0, a0, l1, a1) => {
    const len = Math.hypot(l1 - l0, a1 - a0);
    const c = new THREE.CylinderGeometry(0.12, 0.12, len, 8).rotateZ(Math.PI / 2);
    c.rotateY(Math.atan2(a1 - a0, l1 - l0)); c.translate((l0 + l1) / 2, 0.12, -(a0 + a1) / 2); logs.push(c);
  };
  log(LOT.l0, LOT.a0, LOT.l1, LOT.a0); log(LOT.l0, LOT.a1, LOT.l1, LOT.a1);
  log(LOT.l1, LOT.a0, LOT.l1, -4.5); log(LOT.l1, 4.5, LOT.l1, LOT.a1);
  log(LOT.l0, LOT.a0, LOT.l0, -1.6); log(LOT.l0, 1.6, LOT.l0, LOT.a1);
  const lm = new THREE.Mesh(mergeAll(logs), logM); lm.castShadow = true; lm.receiveShadow = true; g.add(lm);
  // zīme „P” (SVG → faktūra) pie iebrauktuves, ar seju pret atbraucējiem
  const sign = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 10), mat('#9ea3a8', { metalness: 0.7, roughness: 0.4 }));
  post.position.y = 1.25; post.castShadow = true; sign.add(post);
  const pc = document.createElement('canvas'); pc.width = pc.height = 256;
  const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace; ptex.anisotropy = 4;
  const img = new Image();
  img.onload = () => { pc.getContext('2d').drawImage(img, 0, 0, 256, 256); ptex.needsUpdate = true; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(parkingSvg());
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.45 }));
  face.rotation.y = Math.PI / 2; face.position.set(0.035, 2.15, 0); sign.add(face);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.75), mat('#8d9297', { metalness: 0.6, roughness: 0.5 }));
  back.position.set(0, 2.15, 0); back.castShadow = true; sign.add(back);
  sign.position.copy(at(LOT.l1 + 1.2, -5.6));
  g.add(sign);
  // goda pjedestāls: 1. vieta vidū (augstākā), 2. un 3. malās; seja pret stāvlaukumu (+X)
  const pod = new THREE.Group();
  const numTex = (n, col) => canvasTexture(128, 128, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = col; c.fillRect(0, 0, w, 16); c.fillRect(0, h - 16, w, 16);
    c.font = 'bold 84px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(String(n), w / 2, h / 2 + 4);
  });
  const steps = [[1, 0, 0.9, '#d4a017'], [2, -1.5, 0.6, '#8f9aa6'], [3, 1.5, 0.4, '#b06a32']];
  const D = 1.5, WD = 1.5;
  const c = F.toW(PODIUM.l, PODIUM.a);
  for (const [n, off, h, col] of steps) {
    const side = mat(col, { roughness: 0.5, metalness: n === 1 ? 0.3 : 0.15 });
    const top = mat('#f6f4ee', { roughness: 0.6 });
    const front = new THREE.MeshStandardMaterial({ map: numTex(n, col), roughness: 0.6 });
    // BoxGeometry materiāli: +x, −x, +y, −y, +z, −z
    const b = new THREE.Mesh(new THREE.BoxGeometry(D, h, WD), [front, side, top, side, side, side]);
    b.position.set(0, h / 2, off); b.castShadow = true; b.receiveShadow = true; pod.add(b);
    // virsma, uz kuras var uzkāpt
    const w = F.toW(PODIUM.l, PODIUM.a - off);
    W.platforms.push({ x: w.x, z: w.z, ang: Math.atan2(F.t.z, F.t.x), hw: WD / 2, hl: D / 2, y: y + h });
  }
  void c;
  const cup = makeTextSprite('🏆 Uzvarētāji', { fontSize: 44, bg: 'rgba(212,160,23,0.9)' });
  cup.position.set(0, 2.6, 0); pod.add(cup);
  pod.position.copy(at(PODIUM.l, PODIUM.a));
  g.add(pod);
  return g;
}

function mergeAll(geos) {
  // vienkārša apvienošana (vienādi atribūti: position, normal, uv)
  let n = 0, ni = 0;
  for (const g of geos) { n += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + o;
    o += g.attributes.position.count; oi += ix.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

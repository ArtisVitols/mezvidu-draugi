// 🔊 Skaņas (1.31.0): CC0 skaņu paraugi no assets/snd (Kenney, OpenGameArt — sk. assets/snd/LICENSE.txt).
// Web Audio: īsās skaņas (ar nejaušu variantu un nelielu toņa svārstību), skaņas vietā (attālums + stereo pa kreisi/labi),
// cilpas (vide, uguns, dzinēji) ar mīkstu skaļuma maiņu. Ja paraugs vēl nav ielādēts, ui.js atskaņo vienkāršu toni.
const BASE = 'assets/snd/';
let ctx = null, master = null, sfxBus = null, ambBus = null;
let list = null, loadP = null;
const buf = {};        // vārds → [AudioBuffer, ...]
const loops = new Map(); // id → {src, gain, name, want}
const L = { x: 0, z: 0, yaw: 0 }; // klausītājs (kamera)
const lastPlay = {};

const VOL_KEY = 'mezvidi_vol';
let vol = 1;
try { const v = parseFloat(localStorage.getItem(VOL_KEY)); if (!isNaN(v)) vol = Math.max(0, Math.min(1, v)); } catch (e) { /* */ }

export function audioCtx() { return ctx; }

export function initSound() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      ambBus = ctx.createGain(); ambBus.gain.value = 0.55; ambBus.connect(master);
      document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
      });
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!buf.skid) buf.skid = [makeSkid()];
    if (!buf.whirr) {
      // velosipēda ķēdes/riepu šņākoņa, sniega šņākoņa (ragavas, slēpes), gaisīgs vējš — dzirdami arī telefona skaļrunī
      buf.whirr = [noiseBuf(1800, 5200, 1.0, (t) => 0.8 + 0.2 * Math.sin(t * 2 * Math.PI * 7))];
      buf.hiss = [noiseBuf(1200, 6500, 1.5, (t) => 0.85 + 0.15 * Math.sin(t * 2 * Math.PI * 3))];
      buf.air = [noiseBuf(280, 1400, 8, (t) => 0.55 + 0.45 * Math.pow(Math.sin(t * Math.PI / 8 * 2) * 0.5 + 0.5, 1.5))];
    }
    if (!loadP) loadP = loadAll();
  } catch (e) { /* bez skaņas */ }
  return ctx;
}

// riepu šņākoņa: troksnis ar joslas filtru (~0,8–3 kHz) un nelielu viļņošanos — sintezēts, nav faila
function makeSkid() {
  const sr = ctx.sampleRate, n = Math.floor(sr * 1.2), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  let lp = 0, hp = 0, prev = 0;
  const kl = 1 - Math.exp(-2 * Math.PI * 3000 / sr), kh = 1 - Math.exp(-2 * Math.PI * 800 / sr);
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    lp += (w - lp) * kl; hp += (lp - hp) * kh;
    const band = lp - hp;
    const mod = 0.75 + 0.25 * Math.sin(i / sr * 2 * Math.PI * 11) * Math.sin(i / sr * 2 * Math.PI * 2.5);
    d[i] = band * mod * 2.2; prev = d[i];
  }
  // gludi savieno cilpas galus
  const F = Math.floor(sr * 0.05);
  for (let i = 0; i < F; i++) { const t = i / F; d[i] = d[i] * t + d[n - F + i] * (1 - t); }
  void prev;
  return b;
}

// filtrēts troksnis kā cilpa (lo..hi Hz, garums s, amplitūdas funkcija no laika)
function noiseBuf(lo, hi, len, amp) {
  const sr = ctx.sampleRate, n = Math.floor(sr * len), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  let l1 = 0, l2 = 0, h1 = 0, h2 = 0;
  const kl = 1 - Math.exp(-2 * Math.PI * hi / sr), kh = 1 - Math.exp(-2 * Math.PI * lo / sr);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    l1 += (w - l1) * kl; l2 += (l1 - l2) * kl; h1 += (l2 - h1) * kh; h2 += (h1 - h2) * kh;
    d[i] = (l2 - h2) * amp(i / sr);
    peak = Math.max(peak, Math.abs(d[i]));
  }
  const F = Math.floor(sr * Math.min(0.2, len / 6));
  for (let i = 0; i < F; i++) { const t = i / F; d[i] = d[i] * t + d[n - F + i] * (1 - t); }
  for (let i = 0; i < n; i++) d[i] *= 0.8 / (peak || 1);
  return b;
}

// ---------- sintezēti dzinēji (1.34.0) ----------
// Ierakstītie dzinēji bija tikai basos (< 150 Hz) — telefona skaļrunī nedzirdami. Šeit: zāģa/taisnstūra vilnis ar harmonikām,
// „rūkšana” (amplitūdas modulācija pēc apgriezieniem), mīksts kropļojums, filtrs pēc slodzes. rpm, load: 0..1.
const ENG = {
  car:  { f0: 36, f1: 120, wave: 'sawtooth', sub: 0.5, cut0: 420, cutR: 900, cutL: 1500, vol: 0.5, chug: 0.35 },
  kart: { f0: 58, f1: 210, wave: 'square', sub: 0.25, cut0: 800, cutR: 1600, cutL: 2400, vol: 0.32, chug: 0.25 },
  bus:  { f0: 26, f1: 62, wave: 'sawtooth', sub: 0.7, cut0: 380, cutR: 400, cutL: 700, vol: 0.6, chug: 0.5 },
};
const engines = new Map();
let shaperCurve = null;
function makeEngine(kind) {
  const E = ENG[kind];
  const o1 = ctx.createOscillator(); o1.type = E.wave;
  const o2 = ctx.createOscillator(); o2.type = 'square';
  const g2 = ctx.createGain(); g2.gain.value = E.sub;
  const lfo = ctx.createOscillator(); lfo.type = 'sine';
  const lfoG = ctx.createGain(); lfoG.gain.value = E.chug;
  const am = ctx.createGain(); am.gain.value = 1;
  if (!shaperCurve) { shaperCurve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; shaperCurve[i] = Math.tanh(x * 2.2); } }
  const sh = ctx.createWaveShaper(); sh.curve = shaperCurve;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.6;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
  const out = ctx.createGain(); out.gain.value = 0;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  o1.connect(am); o2.connect(g2); g2.connect(am);
  lfo.connect(lfoG); lfoG.connect(am.gain);
  am.connect(sh); sh.connect(lp); lp.connect(hp); hp.connect(out);
  if (pan) { out.connect(pan); pan.connect(sfxBus); } else out.connect(sfxBus);
  const t = ctx.currentTime;
  o1.start(t); o2.start(t); lfo.start(t);
  return { E, o1, o2, lfo, lp, out, pan, zero: 0 };
}
// engine(id, 'car'|'kart'|'bus', rpm, load, gain, at?) — izsauc katru kadru; gain 0 → apklust un pēc brīža apstājas
export function engine(id, kind, rpm, load, gain, at) {
  if (!ctx) return;
  let e = engines.get(id);
  let g = gain, p = 0;
  if (at) { const s = spatial(at.x, at.z, 7, 70); g = s ? gain * s.g : 0; p = s ? s.pan : 0; }
  if (!vol) g = 0;
  if (!e) { if (g <= 0.001) return; e = makeEngine(kind); engines.set(id, e); }
  const E = e.E, t = ctx.currentTime, r = Math.max(0, Math.min(1.3, rpm)), l = Math.max(0, Math.min(1, load));
  const f = E.f0 + (E.f1 - E.f0) * r;
  e.o1.frequency.setTargetAtTime(f, t, 0.06);
  e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
  e.lfo.frequency.setTargetAtTime(f * 0.25, t, 0.06);
  e.lp.frequency.setTargetAtTime(E.cut0 + E.cutR * r + E.cutL * l, t, 0.08);
  e.out.gain.setTargetAtTime(g * E.vol * (0.75 + 0.25 * l), t, 0.12);
  if (e.pan) e.pan.pan.setTargetAtTime(p, t, 0.1);
  if (g <= 0.001) {
    e.zero = e.zero || performance.now();
    if (performance.now() - e.zero > 1500) { try { e.o1.stop(); e.o2.stop(); e.lfo.stop(); } catch (x) { /* */ } e.out.disconnect(); engines.delete(id); }
  } else e.zero = 0;
}

async function loadOne(name) {
  try {
    const r = await fetch(BASE + name + '.mp3');
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    return await new Promise((res) => ctx.decodeAudioData(ab, res, () => res(null)));
  } catch (e) { return null; }
}

async function loadAll() {
  try { list = await (await fetch(BASE + 'list.json')).json(); } catch (e) { list = {}; return; }
  // vispirms saskarnes un biežās skaņas, cilpas beigās
  const names = Object.keys(list).sort((a, b) => (list[a] === 0) - (list[b] === 0));
  const jobs = [];
  for (const k of names) {
    const n = list[k];
    if (n === 0 || n === 1) jobs.push([k, k]);
    else for (let i = 0; i < n; i++) jobs.push([k, k + i]);
  }
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const [k, file] = jobs[i++];
      const b = await loadOne(file);
      if (b) (buf[k] = buf[k] || []).push(b);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

export function hasSound(name) { return !!(buf[name] && buf[name].length); }

// skaļums 0..1 (iestatījumos)
export function getVolume() { return vol; }
export function setVolume(v) {
  vol = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(VOL_KEY, String(vol)); } catch (e) { /* */ }
  if (master) master.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
}

export function setListener(x, z, yaw) { L.x = x; L.z = z; L.yaw = yaw; }

// attāluma skaļums un stereo (yaw — kameras virziens kā cam.yaw: kamera skatās uz −sin/−cos)
function spatial(x, z, ref = 6, max = 45) {
  const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
  if (d > max) return null;
  const g = Math.min(1, ref / Math.max(ref, d)) * (1 - Math.max(0, (d - max * 0.6) / (max * 0.4)));
  // labā ass kamerai: (cos yaw, −sin yaw) → x, z
  const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
  const pan = d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / d)) : 0;
  return { g, pan };
}

// atskaņo īsu skaņu; opts: {vol, rate, jit (toņa svārstība), pan, at: {x, z}, gap (min. ms starp atkārtojumiem)}
export function play(name, opts = {}) {
  if (!ctx || !vol || !hasSound(name)) return false;
  const now = performance.now();
  const gap = opts.gap == null ? 40 : opts.gap;
  if (lastPlay[name] && now - lastPlay[name] < gap) return true;
  lastPlay[name] = now;
  let g = opts.vol == null ? 1 : opts.vol, pan = opts.pan || 0;
  if (opts.at) { const s = spatial(opts.at.x, opts.at.z, opts.ref, opts.max); if (!s) return true; g *= s.g; pan = s.pan; }
  if (g < 0.01) return true;
  const arr = buf[name], b = arr[(Math.random() * arr.length) | 0];
  const src = ctx.createBufferSource(); src.buffer = b;
  const jit = opts.jit == null ? 0.06 : opts.jit;
  src.playbackRate.value = (opts.rate || 1) * (1 + (Math.random() * 2 - 1) * jit);
  const gn = ctx.createGain(); gn.gain.value = g;
  let node = gn;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; gn.connect(p); node = p; }
  src.connect(gn); node.connect(sfxBus);
  src.start(ctx.currentTime + (opts.delay || 0));
  return true;
}

// cilpa: katru kadru izsauc loop(id, name, gain, rate); kad gain 0 kādu laiku — apstājas pati
export function loop(id, name, gain, rate = 1, bus = 'amb') {
  if (!ctx) return;
  let l = loops.get(id);
  if (!l) {
    if (gain <= 0.001 || !vol || !hasSound(name)) return;
    const src = ctx.createBufferSource(); src.buffer = buf[name][0]; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(bus === 'sfx' ? sfxBus : ambBus);
    // nejaušs sākums, lai divas vienādas cilpas neskan vienādi
    src.start(0, Math.random() * src.buffer.duration);
    l = { src, g, name, zero: 0 };
    loops.set(id, l);
  }
  const t = ctx.currentTime;
  l.g.gain.setTargetAtTime(Math.max(0, gain), t, 0.25);
  l.src.playbackRate.setTargetAtTime(rate, t, 0.08);
  if (gain <= 0.001) {
    l.zero = l.zero || performance.now();
    if (performance.now() - l.zero > 1500) { try { l.src.stop(); } catch (e) { /* */ } loops.delete(id); }
  } else l.zero = 0;
}

// skaņas cilpa vietā (uguns): skaļums pēc attāluma
export function loopAt(id, name, x, z, gain = 1, ref = 4, max = 30) {
  const s = spatial(x, z, ref, max);
  loop(id, name, s ? gain * s.g : 0, 1);
}

export function stopAllLoops() {
  for (const l of loops.values()) { try { l.src.stop(); } catch (e) { /* */ } }
  loops.clear();
  for (const e of engines.values()) { try { e.o1.stop(); e.o2.stop(); e.lfo.stop(); e.out.disconnect(); } catch (x) { /* */ } }
  engines.clear();
}

// atkļūdošanai: kuras cilpas tagad skan un cik skaļi
export function loopInfo() { return [...loops.entries()].map(([id, l]) => `${id}:${l.g.gain.value.toFixed(2)}`).concat([...engines.entries()].map(([id, e]) => `⚙${id}:${e.out.gain.value.toFixed(2)}@${e.o1.frequency.value.toFixed(0)}Hz`)); }

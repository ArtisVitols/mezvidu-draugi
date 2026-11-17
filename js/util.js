import * as THREE from 'three';

// Teksta etiķete virs galvas (sprite ar canvas tekstūru)
export function makeTextSprite(text, opts = {}) {
  const fontSize = opts.fontSize || 44;
  const pad = 14;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fontSize + pad * 2;
  canvas.width = w; canvas.height = h;
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = opts.bg || 'rgba(0,0,0,0.45)';
  roundRect(ctx, 0, 0, w, h, h / 2.4);
  ctx.fill();
  ctx.fillStyle = opts.color || '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const scale = (opts.scale || 0.6) / fontSize * 1.6;
  sprite.scale.set(w * scale * 0.35, h * scale * 0.35, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let shadowTex = null;
export function makeBlobShadow(size = 1.2) {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.3)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const matCache = new Map();
export function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts }));
  return matCache.get(k);
}

// ---------- Vējš un lapotne ----------
export const windTime = { value: 0 };
// Pievieno materiālam vēja šūpošanos (pēc virsotnes augstuma) un pēc izvēles
// "apaļās" normāles bez apgriešanas aizmugurē (lapotnei izskatās apjomīgāka).
export function natureMaterial(m, { wind = 0, flutter = 0, keepNormals = false, translucent = 0 } = {}) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windTime;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        float ph = wp.x * 0.07 + wp.z * 0.05;
        float k = max(0.0, position.y) * ${wind.toFixed(4)};
        float gust = 0.65 + 0.35 * sin(uWind * 0.35 + wp.x * 0.012);
        transformed.x += (sin(uWind * 1.25 + ph) * 0.7 + sin(uWind * 2.9 + ph * 2.3) * 0.3) * k * gust;
        transformed.z += cos(uWind * 1.05 + ph * 1.4) * 0.5 * k * gust;
        ${flutter ? `float f = ${flutter.toFixed(4)} * gust;
        transformed += vec3(sin(uWind * 7.0 + wp.y * 3.0 + wp.x), sin(uWind * 6.0 + wp.z * 2.0) * 0.6, cos(uWind * 6.5 + wp.x * 2.5)) * f * min(1.0, position.y * 0.3);` : ''}
      }`);
    if (keepNormals) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace(/normal\s*\*=\s*faceDirection;/g, ''));
    }
    if (translucent) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * ${translucent.toFixed(3)};`);
    }
  };
  m.customProgramCacheKey = () => `nat${wind}_${flutter}_${keepNormals}_${translucent}`;
  return m;
}

// Lapu zariņa tekstūra (caurspīdīga), dažādiem kokiem
export function leafTexture(kind) {
  const W = 256, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = Math.random;
  const pal = {
    berzs: ['#6f9a36', '#86ad45', '#5b8a2c', '#a0bf5a', '#4f7a26'],
    ozols: ['#3f6a26', '#4d7a2e', '#36591f', '#5d8a38', '#2e4f1c'],
    bush:  ['#3d6524', '#4b752b', '#33561d', '#5a843a', '#2a4818'],
    lapu:  ['#557f2c', '#6a9238', '#476f25', '#7ea44a', '#3c6120'],
  }[kind] || ['#557f2c', '#6a9238', '#476f25', '#7ea44a'];
  const small = kind === 'berzs' ? 0.75 : 1;
  // zariņi
  g.strokeStyle = 'rgba(70,55,40,1)'; g.lineCap = 'round';
  const twigs = [];
  for (let i = 0; i < 7; i++) {
    const a = R() * Math.PI * 2, len = 60 + R() * 50;
    const x0 = W / 2 + Math.cos(a) * 10, y0 = H / 2 + Math.sin(a) * 10;
    const x1 = W / 2 + Math.cos(a) * len, y1 = H / 2 + Math.sin(a) * len + (kind === 'berzs' ? 25 : 0);
    g.lineWidth = 2.5; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + (R() - 0.5) * 20, (y0 + y1) / 2, x1, y1); g.stroke();
    twigs.push([x0, y0, x1, y1]);
  }
  // lapas gar zariņiem un mākoņveida masā
  const leaf = (x, y, a, s) => {
    g.save(); g.translate(x, y); g.rotate(a);
    const col = pal[Math.floor(R() * pal.length)];
    g.fillStyle = col;
    g.beginPath(); g.moveTo(0, 0);
    g.quadraticCurveTo(s * 0.55, -s * 0.45, s * 1.25, 0);
    g.quadraticCurveTo(s * 0.55, s * 0.45, 0, 0);
    g.fill();
    g.strokeStyle = 'rgba(255,255,230,0.18)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s * 1.1, 0); g.stroke();
    g.restore();
  };
  const N = kind === 'berzs' ? 420 : 520;
  for (let i = 0; i < N; i++) {
    let x, y;
    if (i % 3 === 0) {
      const t = twigs[Math.floor(R() * twigs.length)], u = 0.3 + R() * 0.75;
      x = lerp(t[0], t[2], u) + (R() - 0.5) * 18; y = lerp(t[1], t[3], u) + (R() - 0.5) * 18;
    } else {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 108;
      x = W / 2 + Math.cos(a) * r; y = H / 2 + Math.sin(a) * r * 0.9;
    }
    if (Math.hypot(x - W / 2, y - H / 2) > 120) continue;
    leaf(x, y, R() * Math.PI * 2, (9 + R() * 8) * small);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Egles zars (skats no augšas): stumbrs pa kreisi, gals pa labi
export function spruceTexture() {
  const W = 256, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = Math.random;
  const needles = (x0, y0, x1, y1, len, w) => {
    const n = Math.hypot(x1 - x0, y1 - y0) / 2.2;
    for (let i = 0; i < n; i++) {
      const u = i / n, x = lerp(x0, x1, u), y = lerp(y0, y1, u);
      for (const s of [-1, 1]) {
        const a = Math.atan2(y1 - y0, x1 - x0) + s * (0.9 + R() * 0.4);
        const l = len * (0.7 + R() * 0.5) * (1 - u * 0.35);
        g.strokeStyle = `hsl(${105 + R() * 25},${38 + R() * 15}%,${16 + R() * 12 + u * 6}%)`;
        g.lineWidth = w;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    }
  };
  g.lineCap = 'round';
  // galvenais zars
  g.strokeStyle = '#4a3622'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W - 6, H / 2 + 4); g.stroke();
  // sānu zariņi
  for (let x = 14; x < W - 20; x += 13 + R() * 6) {
    const u = x / W, span = (18 + 34 * Math.sin(Math.min(1, u * 1.3) * Math.PI * 0.75));
    for (const s of [-1, 1]) {
      const x1 = x + span * 0.8, y1 = H / 2 + s * span * (0.9 + R() * 0.2);
      g.strokeStyle = '#4a3a26'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x, H / 2 + u * 4); g.lineTo(x1, y1); g.stroke();
      needles(x, H / 2 + u * 4, x1, y1, 9, 1.6);
    }
  }
  needles(0, H / 2, W - 6, H / 2 + 4, 11, 1.8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Priedes skuju pušķis (centrā), skatoties no sāniem/augšas
export function pineTexture() {
  const W = 256, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = Math.random;
  g.lineCap = 'round';
  for (let k = 0; k < 14; k++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 70;
    const cx = W / 2 + Math.cos(a) * r, cy = H / 2 + Math.sin(a) * r * 0.75;
    g.strokeStyle = '#5a3f28'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(W / 2, H / 2 + 20); g.lineTo(cx, cy); g.stroke();
    for (let i = 0; i < 70; i++) {
      const b = R() * Math.PI * 2, l = 14 + R() * 26;
      g.strokeStyle = `hsl(${95 + R() * 30},${30 + R() * 15}%,${18 + R() * 16}%)`;
      g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(b) * l, cy + Math.sin(b) * l * 0.8); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Zāles kušķa tekstūra (gaiša, krāsu dod zeme)
export function grassTexture() {
  const W = 128, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = Math.random;
  for (let i = 0; i < 60; i++) {
    const x = 10 + R() * (W - 20), h = H * (0.3 + R() * 0.68), lean = (R() - 0.5) * 44, w = 1.4 + R() * 1.8;
    const l = 150 + R() * 105, yel = R() < 0.15 ? 25 : 0;
    g.fillStyle = `rgb(${Math.min(255, l * 0.9 + yel) | 0},${l | 0},${l * 0.72 | 0})`;
    g.beginPath(); g.moveTo(x - w, H); g.quadraticCurveTo(x + lean * 0.3, H - h * 0.6, x + lean, H - h);
    g.quadraticCurveTo(x + lean * 0.3 + w * 0.3, H - h * 0.6, x + w, H); g.fill();
  }
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(255,250,210,0.25)'); grd.addColorStop(0.55, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Pelēcīga tekstūra (kažokam, audumam, akmenim) - reizinās ar materiāla krāsu
export function noiseTexture(kind, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const R = Math.random;
  if (kind === 'fur') {
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, size, size);
    for (let i = 0; i < size * size * 0.3; i++) {
      const l = 195 + R() * 60, x = R() * size, y = R() * size;
      g.strokeStyle = `rgba(${l},${l},${l},0.55)`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 2, y + 3 + R() * 5); g.stroke();
    }
  } else if (kind === 'cloth') {
    g.fillStyle = '#e0e0e0'; g.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 2) for (let x = 0; x < size; x += 2) {
      const l = ((x + y) % 4 ? 200 : 240) + R() * 15;
      g.fillStyle = `rgb(${l},${l},${l})`; g.fillRect(x, y, 2, 2);
    }
  } else {
    g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, size, size);
    for (let i = 0; i < size * size * 0.6; i++) {
      const l = 120 + R() * 135;
      g.fillStyle = `rgba(${l},${l},${l},0.6)`;
      g.fillRect(R() * size, R() * size, 1 + R() * 2, 1 + R() * 2);
    }
    for (let i = 0; i < 25; i++) {
      g.fillStyle = `rgba(${90 + R() * 40},${110 + R() * 40},${60},0.25)`;
      g.beginPath(); g.arc(R() * size, R() * size, 3 + R() * 10, 0, 7); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- koka ceļa zīmes ----------
// Zīmes dēlis ar lieliem burtiem abās pusēs. Dēlis stāv XY plaknē ar centru (0,0,0); arrow — smaile uz +x.
// Atgriež { obj, w } (w — dēļa taisnās daļas platums metros).
let signWoodMat = null;
export function signWood() {
  if (!signWoodMat) signWoodMat = new THREE.MeshStandardMaterial({ color: 0x6e4a2a, roughness: 0.9 });
  return signWoodMat;
}
export function makeSignBoard(text, opts = {}) {
  const H = opts.h || 0.8, PX = 128;
  const font = `bold ${Math.round(PX * 0.6)}px system-ui, sans-serif`;
  const m0 = document.createElement('canvas').getContext('2d');
  m0.font = font;
  const cw = Math.ceil(Math.max(m0.measureText(text).width + PX * 0.7, PX * 2.4));
  const base = opts.color || '#8a5a32';
  const tex = canvasTexture(cw, PX, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // dēļu šuves un koka šķiedras
    g.globalAlpha = 0.18;
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = Math.random() < 0.5 ? '#000' : '#fff';
      g.lineWidth = 1 + Math.random() * 2;
      const y = Math.random() * h;
      g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 8, w * 0.7, y + (Math.random() - 0.5) * 8, w, y); g.stroke();
    }
    g.globalAlpha = 0.45; g.fillStyle = '#2a170a'; g.fillRect(0, h * 0.5 - 1.5, w, 3);
    g.globalAlpha = 1; g.strokeStyle = 'rgba(30,16,6,0.8)'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = '#2a1608';
    g.strokeText(text, w / 2, h / 2 + 4);
    g.fillStyle = opts.textColor || '#fff4d6';
    g.fillText(text, w / 2, h / 2 + 4);
  });
  tex.anisotropy = 4;
  const W = H * cw / PX, D = 0.09;
  const faceMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0x4a4a4a, roughness: 0.85 });
  faceMat.userData.sign = true;
  const obj = new THREE.Group();
  let body;
  if (opts.arrow) {
    const s = new THREE.Shape(), e = 0.06, x0 = -W / 2 - e, x1 = W / 2, y = H / 2 + e;
    s.moveTo(x0, -y); s.lineTo(x1, -y); s.lineTo(x1 + H * 0.5, 0); s.lineTo(x1, y); s.lineTo(x0, y); s.closePath();
    body = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false }).translate(0, 0, -D / 2);
  } else body = new THREE.BoxGeometry(W + 0.14, H + 0.14, D);
  const bm = new THREE.Mesh(body, signWood());
  bm.castShadow = true;
  obj.add(bm);
  const fg = new THREE.PlaneGeometry(W, H);
  const front = new THREE.Mesh(fg, faceMat);
  front.position.z = D / 2 + 0.004;
  const back = new THREE.Mesh(fg, faceMat);
  back.rotation.y = Math.PI; back.position.z = -D / 2 - 0.004;
  obj.add(front, back);
  return { obj, w: W };
}

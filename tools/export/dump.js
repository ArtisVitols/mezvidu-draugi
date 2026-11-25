// Mežvidu Draugi → Godot: three.js objektu koka izgāšana (JSON + bināri masīvi).
// Lieto pārlūkā (headless Chromium, tools/export/export.mjs): dumpObject(root) → { json, bin: Uint8Array }.
// Formāts (v1): json.nodes[] {n: vārds, t: tips, p: vecāka indekss, tr: [px,py,pz, qx,qy,qz,qw, sx,sy,sz], v: redzams,
//   g: ģeometrijas indekss, m: materiāla indekss | [..], inst: {n, mat: buf, col: buf}, skin: {bones: [mezgli], inv: buf},
//   cs: met ēnu, rs: saņem ēnu, ro: renderOrder, lay: slāņu maska, ud: userData (JSON drošais)}
// json.geos[] {a: {vārds: {b: buf, n: komponentes, k: 'f32'|'u16'|'u32'|'i16'|'u8', norm}}, i: buf, gr: grupas}
// json.mats[] materiālu apraksts, json.texs[] tekstūras (src ceļš vai iegults PNG), json.bufs[] [nobīde, garums]
export function dumpObject(root, opts = {}) {
  const nodes = [], geos = [], mats = [], texs = [], bufs = [];
  const chunks = []; let off = 0;
  const geoIdx = new Map(), matIdx = new Map(), texIdx = new Map(), nodeIdx = new Map();
  const addBuf = (ta) => {
    const u8 = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength);
    const pad = (4 - (off % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); off += pad; }
    chunks.push(u8.slice()); bufs.push([off, u8.byteLength]); off += u8.byteLength;
    return bufs.length - 1;
  };
  const kindOf = (a) => a instanceof Float32Array ? 'f32' : a instanceof Uint16Array ? 'u16' : a instanceof Uint32Array ? 'u32' : a instanceof Int16Array ? 'i16' : a instanceof Uint8Array ? 'u8' : a instanceof Int8Array ? 'i8' : a instanceof Int32Array ? 'i32' : 'f32';
  const attrArray = (at) => {
    if (at.isInterleavedBufferAttribute) {
      const n = at.count, k = at.itemSize, out = new Float32Array(n * k);
      for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) out[i * k + j] = at.getComponent ? at.getComponent(i, j) : [at.getX(i), at.getY(i), at.getZ(i), at.getW(i)][j];
      return out;
    }
    return at.array;
  };
  const geo = (g) => {
    if (geoIdx.has(g.uuid)) return geoIdx.get(g.uuid);
    const a = {};
    for (const [name, at] of Object.entries(g.attributes)) {
      const arr = attrArray(at);
      a[name] = { b: addBuf(arr), n: at.itemSize, k: kindOf(arr), norm: !!at.normalized, c: at.count };
    }
    const out = { a, gr: g.groups && g.groups.length ? g.groups.map((x) => [x.start, x.count, x.materialIndex || 0]) : null, ud: safeUD(g.userData) };
    if (g.index) { const ia = g.index.array; out.i = addBuf(ia); out.ik = kindOf(ia); }
    // LOD indeksi (terrainLods)
    geos.push(out);
    geoIdx.set(g.uuid, geos.length - 1);
    return geos.length - 1;
  };
  const tex = (t) => {
    if (!t) return -1;
    if (texIdx.has(t.uuid)) return texIdx.get(t.uuid);
    const d = { name: t.name || '', wrap: [t.wrapS, t.wrapT], rep: [t.repeat.x, t.repeat.y], off: [t.offset.x, t.offset.y], rot: t.rotation || 0, flipY: !!t.flipY, cs: t.colorSpace || '', mag: t.magFilter, min: t.minFilter, arr: !!t.isDataArrayTexture };
    const img = t.image;
    try {
      if (img && img.src && typeof img.src === 'string' && !img.src.startsWith('data:') && !img.src.startsWith('blob:')) d.src = new URL(img.src, location.href).pathname;
      else if (img && (img instanceof HTMLCanvasElement || img instanceof ImageBitmap || img instanceof HTMLImageElement || (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas))) {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        const b64 = c.toDataURL('image/png').split(',')[1];
        const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
        d.png = addBuf(bin); d.w = img.width; d.h = img.height;
      } else if (img && img.data) {
        d.data = addBuf(img.data instanceof Uint8ClampedArray ? new Uint8Array(img.data.buffer) : img.data); d.w = img.width; d.h = img.height; d.depth = img.depth || 1; d.fmt = t.format; d.type = t.type;
      } else d.none = true;
    } catch (e) { d.err = String(e); }
    texs.push(d); texIdx.set(t.uuid, texs.length - 1);
    return texs.length - 1;
  };
  const col = (c) => (c && c.isColor ? [c.r, c.g, c.b] : null);
  const mat = (m) => {
    if (matIdx.has(m.uuid)) return matIdx.get(m.uuid);
    const d = { type: m.type, name: m.name || '', color: col(m.color), emissive: col(m.emissive), ei: m.emissiveIntensity ?? 1, rough: m.roughness, metal: m.metalness, op: m.opacity, tr: !!m.transparent, side: m.side, vc: !!m.vertexColors, at: m.alphaTest || 0, dw: m.depthWrite !== false, dt: m.depthTest !== false, fog: m.fog !== false, flat: !!m.flatShading, wire: !!m.wireframe, blend: m.blending, ud: safeUD(m.userData), defines: m.defines ? Object.keys(m.defines) : null };
    try { const ck = m.customProgramCacheKey ? String(m.customProgramCacheKey()) : ''; if (ck.length < 120) d.ck = ck; } catch (e) { /* */ }
    for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'bumpMap']) if (m[k]) d[k] = tex(m[k]);
    if (m.normalScale) d.ns = [m.normalScale.x, m.normalScale.y];
    if (m.isShaderMaterial || m.uniforms) {
      d.uniforms = {};
      for (const [k, u] of Object.entries(m.uniforms || {})) {
        const v = u.value;
        if (v == null) continue;
        if (typeof v === 'number' || typeof v === 'boolean') d.uniforms[k] = v;
        else if (v.isColor) d.uniforms[k] = { c: col(v) };
        else if (v.isVector2) d.uniforms[k] = [v.x, v.y];
        else if (v.isVector3) d.uniforms[k] = [v.x, v.y, v.z];
        else if (v.isVector4) d.uniforms[k] = [v.x, v.y, v.z, v.w];
        else if (v.isTexture) d.uniforms[k] = { tex: tex(v) };
      }
    }
    mats.push(d); matIdx.set(m.uuid, mats.length - 1);
    return mats.length - 1;
  };
  const skip = opts.skip || (() => false);
  const walk = (o, parent) => {
    if (skip(o)) return;
    const d = { n: o.name || '', t: o.type, p: parent, tr: [o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z], v: o.visible !== false };
    if (o.layers && o.layers.mask !== 1) d.lay = o.layers.mask;
    if (o.renderOrder) d.ro = o.renderOrder;
    const ud = safeUD(o.userData); if (ud) d.ud = ud;
    if (o.isMesh || o.isPoints || o.isLine || o.isSprite) {
      if (o.geometry) d.g = geo(o.geometry);
      d.m = Array.isArray(o.material) ? o.material.map(mat) : mat(o.material);
      d.cs = !!o.castShadow; d.rs = !!o.receiveShadow;
      if (o.frustumCulled === false) d.nfc = true;
      if (o.userData && o.userData.lodGeos) d.lods = o.userData.lodGeos.map((g) => geo(g));
    }
    if (o.isInstancedMesh) {
      d.inst = { n: o.count, mat: addBuf(o.instanceMatrix.array.slice(0, o.count * 16)) };
      if (o.instanceColor) d.inst.col = addBuf(o.instanceColor.array.slice(0, o.count * 3));
    }
    const i = nodes.length; nodes.push(d); nodeIdx.set(o, i);
    for (const c of o.children) walk(c, i);
  };
  walk(root, -1);
  // kauli pēc tam (kad zināmi visi mezglu indeksi)
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !nodeIdx.has(o)) return;
    const d = nodes[nodeIdx.get(o)];
    const sk = o.skeleton;
    const inv = new Float32Array(sk.boneInverses.length * 16);
    sk.boneInverses.forEach((m, k) => inv.set(m.elements, k * 16));
    d.skin = { bones: sk.bones.map((b) => (nodeIdx.has(b) ? nodeIdx.get(b) : -1)), inv: addBuf(inv), bind: Array.from(o.bindMatrix.elements) };
  });
  // papildu masīvi (piem., krāsu varianti): json.extra[vārds] = bufera indekss
  let extra = null;
  if (opts.extra) { extra = {}; for (const [k, ta] of Object.entries(opts.extra)) extra[k] = addBuf(ta); }
  const bin = new Uint8Array(off); let p = 0;
  for (const c of chunks) { bin.set(c, p); p += c.byteLength; }
  return { json: { v: 1, nodes, geos, mats, texs, bufs, meta: opts.meta || null, extra }, bin };
}

// userData: tikai vienkāršas vērtības (skaitļi, teksti, mazi masīvi/objekti)
function safeUD(ud) {
  if (!ud) return null;
  const out = {}; let any = false;
  for (const [k, v] of Object.entries(ud)) {
    if (k === 'lodGeos' || k === 'mz') continue;
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') { out[k] = v; any = true; }
    else if (Array.isArray(v) && v.length <= 64 && v.every((x) => typeof x === 'number' || typeof x === 'string')) { out[k] = v; any = true; }
  }
  return any ? out : null;
}

// palīgs: izgāztā objekta nosūtīšana uz Node (base64 pa gabaliem)
export function packDump(d) {
  let s = ''; const u = d.bin, CH = 0x8000;
  for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
  return { json: JSON.stringify(d.json), b64: btoa(s) };
}

// ---------- paši dati (ne three.js objekti): skaitļi, teksti, vienkārši objekti/masīvi, tipizēti masīvi → bin ----------
// Klašu instances (izņemot Vector2/3, Color, Map, Set) izlaiž; cikliskas atsauces → null.
export function dumpData(obj, opts = {}) {
  const chunks = []; let off = 0; const bufs = [];
  const addBuf = (ta) => {
    const u8 = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength);
    const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); off += pad; }
    chunks.push(u8.slice()); bufs.push([off, u8.byteLength, ta.constructor.name]); off += u8.byteLength; return bufs.length - 1;
  };
  const maxDepth = opts.depth || 6, skipKeys = new Set(opts.skipKeys || []);
  const seen = new WeakSet();
  const conv = (v, d) => {
    if (v == null) return null;
    const t = typeof v;
    if (t === 'number') return Number.isFinite(v) ? v : (v > 0 ? 1e30 : v < 0 ? -1e30 : null);
    if (t === 'string' || t === 'boolean') return v;
    if (t === 'function' || t === 'symbol' || t === 'bigint') return undefined;
    if (ArrayBuffer.isView(v)) return { $b: addBuf(v) };
    if (v.isVector3) return [v.x, v.y, v.z];
    if (v.isVector2) return [v.x, v.y];
    if (v.isColor) return { $c: [v.r, v.g, v.b] };
    if (v.isObject3D || v.isMaterial || v.isTexture || v.isBufferGeometry || v.isCurve) return undefined;
    if (d > maxDepth) return undefined;
    if (seen.has(v)) return null;
    seen.add(v);
    let out;
    if (v instanceof Map) { out = {}; for (const [k, x] of v) { const c = conv(x, d + 1); if (c !== undefined) out[String(k)] = c; } }
    else if (v instanceof Set) { out = []; for (const x of v) { const c = conv(x, d + 1); if (c !== undefined) out.push(c); } }
    else if (Array.isArray(v)) {
      // skaitļu masīvs → bin (ja liels)
      if (v.length > 256 && v.every((x) => typeof x === 'number')) out = { $b: addBuf(Float32Array.from(v)) };
      else out = v.map((x) => { const c = conv(x, d + 1); return c === undefined ? null : c; });
    } else {
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null && !opts.classes) { seen.delete(v); return undefined; }
      out = {};
      for (const k of Object.keys(v)) { if (skipKeys.has(k)) continue; const c = conv(v[k], d + 1); if (c !== undefined) out[k] = c; }
    }
    seen.delete(v);
    return out;
  };
  const root = {};
  for (const k of opts.keys || Object.keys(obj)) { if (skipKeys.has(k)) continue; const c = conv(obj[k], 0); if (c !== undefined) root[k] = c; }
  const bin = new Uint8Array(off); let p = 0;
  for (const c of chunks) { bin.set(c, p); p += c.byteLength; }
  return { json: { v: 1, data: root, bufs }, bin };
}

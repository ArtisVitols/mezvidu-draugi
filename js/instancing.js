// Daudz vienādu objektu (sēnes, ogu krūmi) kā instancēti meši: katram veidam un apgabalam viens zīmēšanas izsaukums
// uz katru modeļa daļu. Atsevišķu objektu (vai tā daļu, piem. ogas) var paslēpt — tad tā matrica kļūst nulles mērogā.
import * as THREE from 'three';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

export class InstanceField {
  // items: [{ id, kind, x, y, z, ry, s }]; template(kind) → THREE.Group (modeļa veidne)
  // hideName — tikai šī nosaukuma apakšgrupa tiek slēpta (citādi viss objekts)
  constructor(items, template, { chunk = 64, view = 90, hideName = null } = {}) {
    this.items = items;
    this.template = template;
    this.chunk = chunk;
    this.view = view;
    this.hideName = hideName;
    this.chunks = new Map();
    this.where = new Map(); // id → { ch, kind, idx, matrix }
    this.hidden = new Set();
    this.group = new THREE.Group();
  }

  parts(kind) {
    this._parts = this._parts || {};
    if (this._parts[kind]) return this._parts[kind];
    const tpl = this.template(kind);
    tpl.updateMatrixWorld(true);
    const out = [];
    tpl.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      let hide = !this.hideName;
      for (let p = o; p && !hide; p = p.parent) if (p.name === this.hideName) hide = true;
      out.push({ geo: o.geometry, mat: o.material, local: o.matrixWorld.clone(), hide, cast: o.castShadow, receive: o.receiveShadow });
    });
    this._parts[kind] = out;
    return out;
  }

  build(parent) {
    const C = this.chunk;
    for (const it of this.items) {
      const k = Math.floor(it.x / C) + ',' + Math.floor(it.z / C);
      if (!this.chunks.has(k)) this.chunks.set(k, { cx: (Math.floor(it.x / C) + 0.5) * C, cz: (Math.floor(it.z / C) + 0.5) * C, kinds: new Map(), meshes: [] });
      const ch = this.chunks.get(k);
      if (!ch.kinds.has(it.kind)) ch.kinds.set(it.kind, { list: [], meshes: [] });
      const kl = ch.kinds.get(it.kind);
      const matrix = new THREE.Matrix4().compose(tmpP.set(it.x, it.y, it.z), tmpQ.setFromAxisAngle(UP, it.ry || 0), tmpS.setScalar(it.s || 1));
      this.where.set(it.id, { ch, kind: it.kind, idx: kl.list.length, matrix });
      kl.list.push(it);
    }
    for (const ch of this.chunks.values()) {
      for (const [kind, kl] of ch.kinds) {
        for (const p of this.parts(kind)) {
          const im = new THREE.InstancedMesh(p.geo, p.mat, kl.list.length);
          kl.list.forEach((it, i) => im.setMatrixAt(i, tmpM.multiplyMatrices(this.where.get(it.id).matrix, p.local)));
          im.castShadow = p.cast; im.receiveShadow = p.receive;
          im.computeBoundingSphere();
          im.userData.part = p;
          kl.meshes.push(im);
          ch.meshes.push(im);
          this.group.add(im);
        }
      }
    }
    parent.add(this.group);
  }

  setHidden(id, hidden) {
    if (this.hidden.has(id) === hidden) return;
    const w = this.where.get(id);
    if (!w) return;
    if (hidden) this.hidden.add(id); else this.hidden.delete(id);
    for (const im of w.ch.kinds.get(w.kind).meshes) {
      const p = im.userData.part;
      if (!p.hide) continue;
      im.setMatrixAt(w.idx, hidden ? ZERO : tmpM.multiplyMatrices(w.matrix, p.local));
      im.instanceMatrix.needsUpdate = true;
    }
  }

  // apgabali tālāk par view netiek zīmēti
  update(x, z) {
    for (const ch of this.chunks.values()) {
      const vis = Math.abs(ch.cx - x) < this.view && Math.abs(ch.cz - z) < this.view;
      for (const m of ch.meshes) m.visible = vis;
    }
  }
}

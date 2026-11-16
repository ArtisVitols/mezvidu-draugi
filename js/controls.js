// Skārienekrāna vadība: kreisajā pusē kursorsvira, labajā - kameras grozīšana.
// Braucot (kartings, mašīna, sniega motocikls) kursorsviras nav: kreisajā pusē pogas gāze/bremze, labajā — stūre ◀ ▶.
// Datorā: WASD/bultiņas, atstarpe - lēkt, E - darbība, peles vilkšana - kamera.
export class Controls {
  constructor(el) {
    this.el = el;
    this.move = { x: 0, y: 0 };
    this.camDelta = { x: 0, y: 0 };
    this.zoomDelta = 0;
    this.keys = {};
    this.jumpPressed = false;
    this.actionPressed = false;
    this.joyId = null; this.camId = null;
    this.joyStart = { x: 0, y: 0 };
    this.camLast = { x: 0, y: 0 };
    this.pinch = null;
    this.pointers = new Map();
    this.base = document.getElementById('joy-base');
    this.knob = document.getElementById('joy-knob');
    this.enabled = true;
    // braukšanas pogas: katrai pogai savs pirksts (var turēt gāzi un stūrēt vienlaikus)
    this.drive = false;
    this.dk = { gas: new Set(), brake: new Set(), left: new Set(), right: new Set() };
    this.steerV = 0; this.steerT = performance.now();
    for (const [id, k] of [['btn-gas', 'gas'], ['btn-brake', 'brake'], ['btn-left', 'left'], ['btn-right', 'right']]) {
      const b = document.getElementById(id);
      if (!b) continue;
      const on = (e) => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch (er) { /* */ } this.dk[k].add(e.pointerId); b.classList.add('on'); };
      const off = (e) => { this.dk[k].delete(e.pointerId); if (!this.dk[k].size) b.classList.remove('on'); };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('lostpointercapture', off);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.moveEv(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('wheel', (e) => { this.zoomDelta += e.deltaY * 0.01; e.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT')) return;
      this.keys[e.code] = true;
      if (e.code === 'Space') { this.jumpPressed = true; e.preventDefault(); }
      if (e.code === 'KeyE' || e.code === 'Enter') this.actionPressed = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.resetJoy(); this.clearDrive(); });
  }

  down(e) {
    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const leftSide = e.clientX < window.innerWidth * 0.45;
    if (leftSide && this.joyId === null && e.pointerType !== 'mouse' && !this.drive) {
      this.joyId = e.pointerId;
      this.joyStart = { x: e.clientX, y: e.clientY };
      this.base.style.display = 'block';
      this.base.style.left = e.clientX + 'px';
      this.base.style.top = e.clientY + 'px';
      this.knob.style.transform = 'translate(-50%,-50%)';
    } else if (this.camId === null) {
      this.camId = e.pointerId;
      this.camLast = { x: e.clientX, y: e.clientY };
    } else if (this.joyId === null || e.pointerType === 'touch') {
      // otrs pirksts labajā pusē -> tālummaiņa
      const a = this.pointers.get(this.camId);
      if (a) this.pinch = { id: e.pointerId, dist: Math.hypot(a.x - e.clientX, a.y - e.clientY) };
    }
  }

  moveEv(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerId === this.joyId) {
      const R = 55;
      let dx = e.clientX - this.joyStart.x, dy = e.clientY - this.joyStart.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.move.x = dx / R; this.move.y = -dy / R;
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (this.pinch && (e.pointerId === this.pinch.id || e.pointerId === this.camId)) {
      const a = this.pointers.get(this.camId), b = this.pointers.get(this.pinch.id);
      if (a && b) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomDelta -= (d - this.pinch.dist) * 0.03;
        this.pinch.dist = d;
      }
    } else if (e.pointerId === this.camId) {
      this.camDelta.x += e.clientX - this.camLast.x;
      this.camDelta.y += e.clientY - this.camLast.y;
      this.camLast = { x: e.clientX, y: e.clientY };
    }
  }

  up(e) {
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.joyId) this.resetJoy();
    if (e.pointerId === this.camId) { this.camId = null; this.pinch = null; }
    if (this.pinch && e.pointerId === this.pinch.id) this.pinch = null;
  }

  resetJoy() {
    this.joyId = null;
    this.move.x = 0; this.move.y = 0;
    if (this.base) this.base.style.display = 'none';
  }

  // braukšanas režīms: pogas redzamas, kursorsviras nav
  setDrive(on) {
    if (this.drive === on) return;
    this.drive = on;
    if (on) this.resetJoy(); else this.clearDrive();
    document.body.classList.toggle('driving', on);
  }

  clearDrive() {
    for (const k in this.dk) this.dk[k].clear();
    document.querySelectorAll('.drive-btn.on').forEach((b) => b.classList.remove('on'));
    this.steerV = 0;
  }

  // apvieno klaviatūru un kursorsviru (braucot — pogas)
  getMove() {
    let x = this.move.x, y = this.move.y;
    const now = performance.now(), dt = Math.min(0.1, (now - this.steerT) / 1000);
    this.steerT = now;
    if (this.drive) {
      const d = this.dk;
      y = (d.gas.size ? 1 : 0) - (d.brake.size ? 1 : 0);
      // stūre pagriežas pakāpeniski (pogas ir tikai ieslēgts/izslēgts)
      const want = (d.right.size ? 1 : 0) - (d.left.size ? 1 : 0);
      const rate = want === 0 ? 8 : Math.sign(want) !== Math.sign(this.steerV) ? 9 : 4.5;
      this.steerV += Math.max(-rate * dt, Math.min(rate * dt, want - this.steerV));
      x = this.steerV;
    }
    const k = this.keys;
    if (k.KeyW || k.ArrowUp) y += 1;
    if (k.KeyS || k.ArrowDown) y -= 1;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y, run: !!(k.ShiftLeft || k.ShiftRight) };
  }

  consumeCam() {
    const d = { x: this.camDelta.x, y: this.camDelta.y, z: this.zoomDelta };
    this.camDelta.x = 0; this.camDelta.y = 0; this.zoomDelta = 0;
    return d;
  }

  consumeJump() { const j = this.jumpPressed; this.jumpPressed = false; return j; }
  consumeAction() { const a = this.actionPressed; this.actionPressed = false; return a; }
}

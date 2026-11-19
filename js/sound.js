// 🔊 Pastāvīgās skaņas (1.31.0): soļi pēc virsmas, vide pēc zemes (putni, vējš, ūdens, purva sienāži), uguns pie ugunskura,
// dzinēji (kartings, mašīna, autobuss), velosipēda spieķi, slēpošanas vējš. Mixin uz Game.prototype; updateSound(dt) katru kadru.
import { loop, loopAt, play, setListener, stopAllLoops } from './audio.js?v=1.31.0';
import { FOREST, FARM, RACE } from './zones.js?v=1.31.0';

const STEP = 0.78;   // m starp soļiem ejot (skrienot — garāki)
const rd = (T, x, z) => { if (!T || !T.roadDist) return 99; const r = T.roadDist(x, z); return typeof r === 'number' ? r : r ? r.d : 99; };

export const Sound = {
  // virsma zem kājām: 'snow' | 'wood' | 'stone' | 'grass' | 'water'
  surfaceAt(x, z, y) {
    const T = this.terr;
    if (!T) return 'grass';
    if (this.zone === 'n') return rd(T, x, z) < 2.6 ? 'stone' : 'snow';
    if (T.getHeight && y > T.getHeight(x, z) + 0.25) return 'wood';  // laipa, tornis, platformas
    if (T.isWater && T.isWater(x, z)) return 'water';
    if (this.zone === FARM && x === this.me.pos.x && z === this.me.pos.z && this.farmW && (this.farmW.yardBuildings || []).some((b) => b.inside)) return 'wood';
    if (rd(T, x, z) < 2.6) return 'stone';
    if (this.zone === RACE && T.trackDist && T.trackDist(x, z) < 6) return 'stone';
    return 'grass';
  },

  stepSound(surf, at, vol) {
    if (surf === 'water') play('splash_s', { vol: vol * 0.35, rate: 1.3, at, gap: 120 });
    else play('st_' + surf, { vol: vol * (surf === 'snow' ? 0.75 : surf === 'wood' ? 0.6 : 0.5), at, jit: 0.08, gap: 120 });
  },

  updateSound(dt) {
    const me = this.me, cam = this.camera;
    if (!me || !cam) return;
    setListener(cam.position.x, cam.position.z, this.cam.yaw);
    const T = this.terr, z = this.zone, busy = this.zoneBusy;
    if (busy) { stopAllLoops(); this.sndLand = null; return; }

    // --- soļi ---
    const walking = !me.veh && !me.ride && !me.bus && !me.inKart && !me.lift && !me.ski;
    if (walking && me.onGround) {
      const lp = this.sndLast || (this.sndLast = { x: me.pos.x, z: me.pos.z, acc: 0 });
      const d = Math.hypot(me.pos.x - lp.x, me.pos.z - lp.z);
      lp.x = me.pos.x; lp.z = me.pos.z;
      if (d < 3) {
        lp.acc += d;
        const stride = me.state === 'run' ? STEP * 1.35 : STEP;
        if (lp.acc >= stride) { lp.acc = 0; this.stepSound(this.surfaceAt(me.pos.x, me.pos.z, me.pos.y), null, 1); }
      }
    } else if (this.sndLast) { this.sndLast.x = me.pos.x; this.sndLast.z = me.pos.z; }
    // draugu soļi tuvumā
    for (const r of this.remotes.values()) {
      if ((r.zone || 'c') !== z || r.vehCode || !r.pos) continue;
      const dd = Math.hypot(r.pos.x - me.pos.x, r.pos.z - me.pos.z);
      const lp = r.sndLast || (r.sndLast = { x: r.pos.x, z: r.pos.z, acc: 0 });
      const d = Math.hypot(r.pos.x - lp.x, r.pos.z - lp.z);
      lp.x = r.pos.x; lp.z = r.pos.z;
      if (dd > 22 || d > 3 || !(r.anim === 'walk' || r.anim === 'run')) continue;
      lp.acc += d;
      if (lp.acc >= (r.anim === 'run' ? STEP * 1.35 : STEP)) { lp.acc = 0; this.stepSound(this.surfaceAt(r.pos.x, r.pos.z, r.pos.y), r.pos, 0.8); }
    }

    // --- vide pēc zemes ---
    const birds = z === FOREST ? 0.55 : z === FARM ? 0.45 : z === RACE ? 0.25 : 0;
    const wind = z === 'n' ? 0.55 : z === 's' ? 0.45 : 0.08;
    loop('amb_birds', 'amb_birds', birds);
    loop('amb_wind', 'amb_wind', wind);
    // ūdens un purvs tuvumā (pārbauda reizi 0,5 s)
    this.sndT = (this.sndT || 0) - dt;
    if (this.sndT <= 0) {
      this.sndT = 0.5;
      let w = 0;
      if (T && T.isWater && z !== 'n') {
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2;
          for (const R of [6, 14]) if (T.isWater(me.pos.x + Math.cos(a) * R, me.pos.z + Math.sin(a) * R)) w += R === 6 ? 0.1 : 0.05;
        }
      }
      this.sndWater = Math.min(0.6, w);
      const sw = z === FOREST && this.world && this.world.places ? this.world.places.find((p) => p.id === 'purvs') : null;
      this.sndSwamp = sw ? Math.max(0, 1 - Math.hypot(sw.x - me.pos.x, sw.z - me.pos.z) / 60) : 0;
      this.sndCamp = z === FOREST && this.world && this.world.places ? this.world.places.find((p) => p.id === 'nometne') : null;
    }
    loop('amb_river', 'amb_river', this.sndWater || 0);
    loop('amb_crickets', 'amb_crickets', (this.sndSwamp || 0) * 0.6);
    if (this.sndSwamp > 0.3 && Math.random() < dt * 0.25) play('frog', { vol: 0.5 * this.sndSwamp, jit: 0.15 });
    // uguns pie ugunskura
    if (this.sndCamp) loopAt('fire', 'fire', this.sndCamp.x, this.sndCamp.z, 0.9, 4, 28); else loop('fire', 'fire', 0);
    // putni dažreiz čivina tuvāk
    if (birds && Math.random() < dt * 0.05) play('chirp', { vol: 0.25, jit: 0.2, pan: Math.random() * 1.4 - 0.7 });

    // --- transports ---
    let kart = 0, kartR = 1, car = 0, carR = 1, spokes = 0, slide = 0;
    if (me.inKart && me.kart) { const v = Math.abs(me.kart.speed || 0); kart = 0.55; kartR = 0.7 + Math.min(1.3, v / 22); }
    else if (me.veh) {
      const v = Math.abs(me.veh.speed || 0), k = me.veh.kind;
      if (k === 'car') { car = 0.6; carR = 0.55 + Math.min(1.1, v / 26); }
      else if (k === 'bike') spokes = Math.min(0.8, v / 8);
      else if (k === 'sled') slide = Math.min(0.7, v / 14);
    } else if (me.ride) {
      const v = this.remoteSpeed ? this.remoteSpeed(me.ride.driver) : 0, d = this.remotes.get(me.ride.driver);
      if (d && d.vehCode === 2) { car = 0.5; carR = 0.55 + Math.min(1.1, v / 26); }
    }
    if (me.ski) slide = Math.min(0.8, (me.ski.v || 0) / 16);
    loop('eng_kart', 'eng_kart', kart, kartR, 'sfx');
    loop('eng_car', 'eng_car', car, carR, 'sfx');
    loop('spokes', 'spokes', spokes, 1, 'sfx');
    loop('slide', 'amb_wind', slide, 1.6, 'sfx');
    // autobusi: dzinējs (iekšā — klusāk un vienmērīgi), durvis, zvaniņš pieturā
    for (const B of this.buses || []) {
      const id = 'bus' + B.k;
      const on = B.vis && B.speed != null;
      const mine = me.bus && (me.bus.b || 0) === B.k;
      const rate = 0.42 + Math.min(0.5, (B.speed || 0) / 30);
      if (!on) loop(id, 'eng_car', 0);
      else if (mine) loop(id, 'eng_car', 0.35, rate, 'sfx');
      else { const dd = Math.hypot(B.lx - cam.position.x, B.lz - cam.position.z); loop(id, 'eng_car', Math.max(0, 1 - dd / 60) * 0.45, rate, 'sfx'); }
      const open = (B.door || 0) > 0.5;
      if (on && B.sndOpen != null && open !== B.sndOpen) {
        const at = mine ? null : { x: B.lx, z: B.lz };
        play('bus_door', { vol: 0.8, at, rate: open ? 1 : 0.9 });
        if (open) play('ding', { vol: 0.5, at, delay: 0.3 });
      }
      B.sndOpen = open;
    }
    // draugu mašīnas un kartingi tuvumā
    for (const r of this.remotes.values()) {
      const id = 'rv' + r.id;
      if ((r.zone || 'c') !== z || !(r.vehCode === 1 || r.vehCode === 2) || !r.pos) { loop(id, 'eng_car', 0); continue; }
      const dd = Math.hypot(r.pos.x - cam.position.x, r.pos.z - cam.position.z);
      const v = this.remoteSpeed ? this.remoteSpeed(r.id) : 0;
      loop(id, r.vehCode === 1 ? 'eng_kart' : 'eng_car', Math.max(0, 1 - dd / 50) * 0.4, 0.6 + Math.min(1.2, v / 24), 'sfx');
    }
  },
};

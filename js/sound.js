// 🔊 Pastāvīgās skaņas (1.31.0): soļi pēc virsmas, vide pēc zemes (putni, vējš, ūdens, purva sienāži), uguns pie ugunskura,
// dzinēji (kartings, mašīna, autobuss), velosipēda spieķi, slēpošanas vējš. Mixin uz Game.prototype; updateSound(dt) katru kadru.
import { loop, loopAt, play, setListener, stopAllLoops, engine } from './audio.js?v=1.40.0';
import { FOREST, FARM, RACE } from './zones.js?v=1.40.0';

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
    const amb = z === 's' && T && T.ambience ? T.ambience(me.pos.x, me.pos.z) : null; // 1.39.0: mežā putni, pie jūras vējš
    const birds = amb ? amb.birds : z === FOREST ? 0.55 : z === FARM ? 0.45 : z === RACE ? 0.25 : 0;
    const wind = amb ? amb.wind : z === 'n' ? 0.55 : z === 's' ? 0.45 : 0.08;
    loop('amb_birds', 'amb_birds', birds);
    loop('amb_wind', 'amb_wind', wind);
    loop('air', 'air', z === 'n' ? 0.28 : amb ? amb.wind * 0.4 : 0);
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

    // --- transports (1.34.0: sintezēti dzinēji, dzirdami telefonā) ---
    let kart = 0, kartR = 0, kartL = 0, car = 0, carR = 0, carL = 0, whirr = 0, hiss = 0, skid = 0, coast = 0;
    if (me.inKart && me.kart) {
      const K = me.kart, v = Math.abs(K.speed || 0), thr = Math.max(0, K.thr || 0);
      kart = 1; kartR = Math.min(1.25, v / 24) + (K.boost > 0 ? 0.15 : 0); kartL = Math.max(thr, K.boost > 0 ? 1 : 0);
      skid = Math.min(0.45, Math.abs(K.steer || 0) * Math.max(0, (v - 12) / 14) * 0.45) + (K.wall && v > 5 ? 0.3 : 0);
    } else if (me.veh) {
      const V = me.veh, v = Math.abs(V.speed || 0), thr = Math.max(0, V.thr || 0);
      if (V.kind === 'car') { car = 1; carR = Math.min(1.2, v / 26); carL = Math.max(thr, 0.15); }
      else if (V.kind === 'bike') { whirr = Math.min(0.5, v / 12); coast = v; }
      else if (V.kind === 'sled') hiss = Math.min(0.7, v / 12);
    } else if (me.ride) {
      const v = this.remoteSpeed ? this.remoteSpeed(me.ride.driver) : 0, d = this.remotes.get(me.ride.driver);
      if (d && d.vehCode === 2) { car = 0.9; carR = Math.min(1.2, v / 26); carL = 0.4; }
      else if (d && d.vehCode === 3) hiss = Math.min(0.6, v / 12);
      else if (d && d.vehCode === 5) whirr = Math.min(0.4, v / 12);
    }
    if (me.ski) hiss = Math.max(hiss, Math.min(0.75, (me.ski.v || 0) / 14));
    engine('my_kart', 'kart', kartR, kartL, kart);
    engine('my_car', 'car', carR, carL, car);
    loop('skid', 'skid', skid, 1, 'sfx');
    loop('whirr', 'whirr', whirr, 0.7 + Math.min(0.8, coast / 14), 'sfx');
    loop('hiss', 'hiss', hiss, 0.8 + hiss * 0.5, 'sfx');
    // velosipēds: brīvgaitas klikšķi, kad nemin (ātrumā bez gāzes)
    if (me.veh && me.veh.kind === 'bike' && coast > 2 && !(me.veh.thr > 0.1)) {
      this.clickT = (this.clickT || 0) - dt * coast;
      if (this.clickT <= 0) { this.clickT = 0.55; play('tick', { vol: 0.12, rate: 1.6, jit: 0.05, gap: 30 }); }
    }
    // autobusi: dzinējs (iekšā — vienmērīgi), durvis, zvaniņš pieturā
    for (const B of this.buses || []) {
      const on = B.vis && B.speed != null;
      const mine = me.bus && (me.bus.b || 0) === B.k;
      const rpm = Math.min(1, (B.speed || 0) / 14), load = B.st && B.st.stop >= 0 ? 0.1 : 0.5;
      engine('bus' + B.k, 'bus', rpm, load, on ? (mine ? 0.7 : 1) : 0, on && !mine ? { x: B.lx, z: B.lz } : null);
      const open = (B.door || 0) > 0.5;
      if (on && B.sndOpen != null && open !== B.sndOpen) {
        const at = mine ? null : { x: B.lx, z: B.lz };
        play('bus_door', { vol: 0.8, at, rate: open ? 1 : 0.9 });
        if (open) play('ding', { vol: 0.5, at, delay: 0.3 });
      }
      B.sndOpen = open;
    }
    // stāvošā mašīna, kurā sēž cits, un draugu transports tuvumā
    for (const r of this.remotes.values()) {
      const here = (r.zone || 'c') === z && r.pos;
      const v = here && this.remoteSpeed ? this.remoteSpeed(r.id) : 0;
      const at = here ? { x: r.pos.x, z: r.pos.z } : null;
      engine('rk' + r.id, 'kart', Math.min(1.2, v / 24), 0.6, here && r.vehCode === 1 ? 1 : 0, at);
      engine('rc' + r.id, 'car', Math.min(1.2, v / 26), 0.5, here && r.vehCode === 2 ? 1 : 0, at);
      const dd = here ? Math.hypot(r.pos.x - cam.position.x, r.pos.z - cam.position.z) : 99;
      loop('rw' + r.id, 'whirr', here && r.vehCode === 5 ? Math.max(0, 1 - dd / 25) * Math.min(0.4, v / 12) : 0, 1, 'sfx');
      loop('rh' + r.id, 'hiss', here && r.vehCode === 3 ? Math.max(0, 1 - dd / 30) * Math.min(0.5, v / 12) : 0, 1, 'sfx');
    }
  },
};

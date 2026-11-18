// Jaunās nodarbes, pievienotas Game klasei: makšķerēšana, ogas, mājdzīvnieki, dārza rotājumi,
// īpašās vietas ar dārgumu, ķeramais un paslēpes, nedēļas kopīgais mērķis.
import * as THREE from 'three';
import { WATER_Y, GARDEN_SLOTS, VILLAGE_Y, rotPlot, rotPlotY } from './world.js?v=1.24.0';
import { buildNPC } from './characters.js?v=1.24.0';
import { InstanceField } from './instancing.js?v=1.24.0';
import { berryTemplate, buildDecor, DECOR_SPOTS, buildRod, buildBobber } from './props.js?v=1.24.0';
import { buildScroll } from './places.js?v=1.24.0';
import { ZONE_IDS, FOREST } from './zones.js?v=1.24.0';
import { FISH, ROD_PRICE, BERRIES, COOKED, PETS, DECOR, PLACES, MAP_PIECES, weekNumber, weeklyGoal, WEEKLY_REWARD, rollFish, CROPS, TREES, CLOTHES, HATS, WISH_PRICE } from './data.js?v=1.24.0';
import { icon, iconEl, fishSvg } from './icons.js?v=1.24.0';
import { makeTextSprite, angleLerp } from './util.js?v=1.24.0';
import { $, toast, showPanel, refreshPanel, closePanel, el, itemRow, sfx, fmtTime } from './ui.js?v=1.24.0';

const BERRY_RESPAWN = 150000;
const MG_NAMES = { tag: '🏃 Ķeramais', hide: '🙈 Paslēpes' };

export function makeTeam(now, weekly) {
  const w = weekNumber(now), g = weeklyGoal(w);
  return { w, c: weekly && weekly.w === w ? weekly.c || 0 : 0, target: g.n, stat: g.stat };
}

export const Activities = {
  // ======================= sagatavošana =======================
  initActivities() {
    this.fixDecor();
    this.berryPicked = {};
    this.buildCenterActivities();
    this.chestAnim = 0;
    // makšķere rokās
    this.rod = buildRod();
    this.rod.position.set(0, 1.0, 0.32);
    this.rod.visible = false;
    this.avatar.root.add(this.rod);
    this.fishing = null;
    // mājdzīvnieks
    this.pet = null;
    this.setPet(this.save.pet, true);
    // minispēles
    this.mg = { kind: null, phase: 'none' };
    this.mgMarker = null;
    this.mgEdgeT = 0;
    this.timers.places = 0;
    this.team = makeTeam(Date.now(), this.save.weekly);
  },

  // Mežvidu objekti nodarbēm (ogu krūmi, kartes gabali, lāde, rotājumi) — atkārtoti, atgriežoties Mežvidos
  buildCenterActivities() {
    const W = this.world;
    // ogu krūmi instancēti; noplūktiem paslēpj tikai ogas
    this.berryField = new InstanceField(W.berries.map((b) => ({ id: b.id, kind: b.kind, x: b.x, y: b.y, z: b.z, ry: b.id * 1.7, s: 0.9 + (b.id % 5) * 0.06 })),
      (k) => berryTemplate(k), { chunk: 64, view: 80, hideName: 'berries' });
    this.berryField.build(this.scene);
    this.placeById = Object.fromEntries(W.places.map((p) => [p.id, p]));
    this.scrolls = {};
    for (const id of MAP_PIECES) {
      const p = this.placeById[id];
      if (!p || !p.piece || this.save.pieces.includes(id)) continue;
      const s = buildScroll();
      s.position.set(p.piece.x, p.piece.y, p.piece.z);
      this.scene.add(s);
      this.scrolls[id] = s;
    }
    if (this.save.treasure && W.chest) { W.chest.lid.rotation.x = -1.9; W.chest.coins.visible = false; }
    // dārza rotājumi
    this.decorObjs = [[], [], [], []];
    this.decorKeys = ['', '', '', ''];
  },

  // ======================= kadrs =======================
  updateActivities(dt, t) {
    const cx = this.me.pos.x, cz = this.me.pos.z;
    this.timers.berry = (this.timers.berry || 0) - dt;
    if (this.timers.berry <= 0) {
      this.timers.berry = 0.3;
      this.berryField.update(cx, cz);
      for (const b of this.world.berries) if (Math.abs(b.x - cx) < 130 && Math.abs(b.z - cz) < 130) this.berryField.setHidden(b.id, this.berryPicked[b.id] > t);
    }
    for (const id in this.scrolls) {
      const s = this.scrolls[id];
      s.rotation.y += dt * 1.5;
      s.position.y = this.placeById[id].piece.y + Math.sin(t / 400) * 0.08;
    }
    if (this.chestAnim > 0 && this.world.chest) {
      this.chestAnim = Math.max(0, this.chestAnim - dt);
      this.world.chest.lid.rotation.x = -1.9 * (1 - this.chestAnim / 1.2);
    }
    this.updateFishing(dt, t);
    this.updatePets(dt);
    this.updateMg(dt, t);
    this.timers.places -= dt;
    if (this.timers.places <= 0) { this.timers.places = 0.5; this.checkDiscover(); }
  },

  // ======================= darbības (dzeltenā poga) =======================
  findActivityActions(consider, d2) {
    const me = this.me, t = this.now(), W = this.world;
    // makšķerēšana notiek — poga tikai tai
    if (this.fishing) {
      const f = this.fishing;
      return { label: f.phase === 'bite' ? '🐟 VILKT!' : '🎣 Gaidi… (beigt)', fn: () => (f.phase === 'bite' ? this.catchFish() : this.stopFishing(true)) };
    }
    // ogas
    for (const b of W.berries) {
      if (Math.abs(b.x - me.pos.x) > 3 || Math.abs(b.z - me.pos.z) > 3) continue;
      if (this.berryPicked[b.id] > t) continue;
      consider(d2(b.x, b.z), 1.9, `${BERRIES[b.kind].icon} Lasīt: ${BERRIES[b.kind].name}`, () => this.pickBerry(b));
    }
    // kartes gabali
    for (const id in this.scrolls) {
      const p = this.placeById[id].piece;
      if (Math.abs(p.y - 0.4 - me.pos.y) > 1.6) continue;
      consider(d2(p.x, p.z), 2.0, '🗺️ Paņemt kartes gabalu', () => this.takePiece(id));
    }
    // ugunskurs
    const camp = this.placeById.nometne;
    if (camp) {
      const raw = (this.save.inv.baravika || 0) + (this.save.inv.gailene || 0);
      consider(d2(camp.x, camp.z), 3.2, raw ? `🔥 Cept sēnes (${raw})` : '🔥 Sildīties pie ugunskura', () => this.cookMushrooms());
    }
    // tornis
    const tw = this.placeById.tornis;
    if (tw) {
      const top = tw.h + tw.top;
      if (me.pos.y > top - 1) consider(d2(tw.x, tw.z) + 0.5, 2.6, '🪜 Kāpt lejā', () => this.towerDown());
      else if (me.pos.y < tw.h + 3) consider(d2(tw.base.x, tw.base.z), 2.6, '🪜 Kāpt skatu tornī', () => this.towerUp());
    }
    // dārguma lāde
    const ch = W.chest;
    if (ch) {
      const n = this.save.pieces.length;
      const label = this.save.treasure ? '🏰 Lāde ir tukša' : n >= MAP_PIECES.length ? '🗝️ Atvērt dārguma lādi!' : `🔒 Lāde (kartes gabali ${n}/${MAP_PIECES.length})`;
      consider(d2(ch.x, ch.z), 2.4, label, () => this.openChest());
    }
    // vēlēšanās aka ciemata vidū
    consider(d2(0, 0) - 0.8, 2.9, `🪙 Iemest akā ${WISH_PRICE}🪙 un vēlēties`, () => this.wishWell());
    // savs mājdzīvnieks
    if (this.pet && !this.pet.inCar && !(this.petCd > t)) consider(d2(this.pet.x, this.pet.z) + 1.2, 2.6, `🤗 Paglaudīt: ${PETS[this.pet.id].name}`, () => this.petMyPet()); // citas darbības svarīgākas
    // makšķerēt pie ūdens
    if (this.save.rod && me.onGround && me.state !== 'swim') {
      const spot = this.fishSpot();
      if (spot) consider(1.6, 1.7, '🎣 Makšķerēt', () => this.startFishing(spot));
    }
    return null;
  },

  // ======================= makšķerēšana =======================
  fishSpot() {
    const W = this.world, p = this.me.pos;
    let best = null;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      const dx = Math.sin(a), dz = Math.cos(a);
      let wd = 0;
      for (const d of [2.2, 3.4, 4.6]) if (W.getHeight(p.x + dx * d, p.z + dz * d) < WATER_Y - 0.4) { wd = d; break; }
      if (!wd) continue;
      const diff = Math.abs(((a - this.me.heading) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (!best || diff < best.diff) best = { a, diff, x: p.x + dx * (wd + 2.2), z: p.z + dz * (wd + 2.2) };
    }
    if (best && W.getHeight(best.x, best.z) > WATER_Y - 0.2) { best.x = p.x + Math.sin(best.a) * 3.4; best.z = p.z + Math.cos(best.a) * 3.4; }
    return best;
  },

  startFishing(spot) {
    const onPier = this.world.groundAt(this.me.pos.x, this.me.pos.z, this.me.pos.y) > this.world.getHeight(this.me.pos.x, this.me.pos.z) + 0.3;
    this.me.heading = spot.a;
    if (!this.bobber) {
      this.bobber = buildBobber();
      const lg = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      this.fishLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.7 }));
      this.fishLine.frustumCulled = false;
    }
    this.bobber.position.set(spot.x, WATER_Y + 0.02, spot.z);
    this.scene.add(this.bobber); this.scene.add(this.fishLine);
    this.fishing = { phase: 'wait', t: 0, bite: 2.5 + Math.random() * 4.5, x: spot.x, z: spot.z, pier: onPier };
    this.rod.visible = true;
    sfx('jump');
    if (!this.save.stats.fishTip) { this.save.stats.fishTip = 1; toast('🎣 Gaidi, kamēr pludiņš raustās, tad ātri spied „VILKT!”', '', 4500); }
    this.timers.action = 0;
  },

  stopFishing(manual = false) {
    if (!this.fishing) return;
    this.fishing = null;
    this.rod.visible = false;
    if (this.bobber) { this.scene.remove(this.bobber); this.scene.remove(this.fishLine); }
    if (manual) toast('🎣 Beidzi makšķerēt');
    this.timers.action = 0;
  },

  updateFishing(dt, t) {
    const f = this.fishing;
    if (!f) return;
    f.t += dt;
    const b = this.bobber;
    if (f.phase === 'wait') {
      b.position.y = WATER_Y + 0.02 + Math.sin(t / 500) * 0.015;
      if (f.t >= f.bite) { f.phase = 'bite'; f.t = 0; sfx('beep'); this.timers.action = 0; }
    } else if (f.phase === 'bite') {
      b.position.y = WATER_Y - 0.06 + Math.sin(f.t * 30) * 0.05;
      b.position.x = f.x + Math.sin(f.t * 17) * 0.06;
      if (f.t > 1.7) {
        toast('🐟 Zivs norāva ēsmu… Gaidi nākamo!');
        f.phase = 'wait'; f.t = 0; f.bite = 2 + Math.random() * 4; b.position.x = f.x;
        this.timers.action = 0;
      }
    }
    // aukla no makšķeres gala līdz pludiņam
    const tip = new THREE.Vector3();
    this.avatar.root.updateMatrixWorld(true);
    this.rod.userData.tip.getWorldPosition(tip);
    const a = this.fishLine.geometry.attributes.position;
    a.setXYZ(0, tip.x, tip.y, tip.z); a.setXYZ(1, b.position.x, b.position.y + 0.05, b.position.z);
    a.needsUpdate = true;
  },

  catchFish() {
    const f = this.fishing;
    if (!f || f.phase !== 'bite') return;
    const list = Object.entries(FISH);
    const tot = list.reduce((s, [, d]) => s + (f.pier ? d.pier : d.w), 0);
    let r = Math.random() * tot, kind = list[0][0];
    for (const [k, d] of list) { r -= f.pier ? d.pier : d.w; if (r <= 0) { kind = k; break; } }
    const d = FISH[kind];
    const pos = new THREE.Vector3(f.x, WATER_Y, f.z);
    this.spawnFloat('💦', pos);
    if (d.junk) {
      sfx('bad');
      this.showPrize('👢 Ak vai…', null, 'Vecs zābaks!', 'Tas gan nav ēdams… Metam atpakaļ 😄', fishSvg('zabaks'));
    } else {
      // zivs ar izmēru un svaru: lielāka — dārgāka
      const fish = rollFish(kind, f.pier ? () => Math.min(1, Math.random() * 1.08) : Math.random);
      this.save.fishBag.push(fish);
      this.stat('fish');
      const best = this.save.fishBest[kind] || 0, record = fish.kg > best;
      if (record) this.save.fishBest[kind] = fish.kg;
      if (kind === 'zelta') { this.stat('goldfish'); sfx('star'); } else sfx(record && best ? 'win' : 'pick');
      const kgTxt = fish.kg < 1 ? `${Math.round(fish.kg * 1000)} g` : `${fish.kg.toFixed(2).replace('.', ',')} kg`;
      this.showPrize(kind === 'zelta' ? '✨ Zelta zivtiņa!' : '🎣 Noķēri zivi!', null, d.name,
        `📏 <b>${fish.cm} cm</b> · ⚖️ <b>${kgTxt}</b> · 💰 <b>${fish.v}🪙</b>${record && best ? '<br>🏆 Tavs jaunais rekords!' : ''}`, fishSvg(kind));
      this.spawnFloat(d.icon, this.me.pos);
    }
    f.phase = 'wait'; f.t = 0; f.bite = 2.5 + Math.random() * 4.5;
    this.bobber.position.x = f.x;
    this.me.petT = 0.4;
    this.timers.action = 0;
  },

  // ======================= ogas =======================
  pickBerry(b) {
    this.berryPicked[b.id] = this.now() + 5000;
    this.berryField.setHidden(b.id, true);
    this.me.petT = 0.5;
    this.net.toHost({ t: 'pickB', id: b.id });
  },

  // ======================= ugunskurs, tornis, dārgums =======================
  cookMushrooms() {
    const inv = this.save.inv;
    const n = (inv.baravika || 0) + (inv.gailene || 0);
    if (!n) { toast('🔥 Silti un omulīgi! Atnes baravikas vai gailenes — te tās var izcept.'); this.me.waveT = 1; return; }
    inv.baravika = 0; inv.gailene = 0;
    this.addItem('cepta', n);
    this.stat('cooked', n);
    sfx('plant');
    this.me.petT = 1;
    toast(`${COOKED.icon} Izcepi ${n} sēnes! Ceptas tās maksā ${COOKED.sell}🪙 gabalā.`, 'good', 3500);
    this.spawnFloat('🍢', this.me.pos);
  },

  towerUp() {
    const tw = this.placeById.tornis;
    this.me.pos.set(tw.x, tw.h + tw.top + 0.05, tw.z + 0.6);
    this.me.vy = 0;
    this.cam.pitch = Math.max(this.cam.pitch, 0.5);
    this.cam.dist = Math.max(this.cam.dist, 10);
    sfx('jump');
    this.stat('tower');
    if (!this.save.revealed) {
      this.save.revealed = true;
      sfx('star');
      toast('🔭 No torņa redzama visa apkārtne! Visas zelta zvaigznes tagad atzīmētas kartē ⭐', 'good', 5000);
    } else toast('🔭 Skaists skats! Pieskaries kartei, lai redzētu visu pasauli.', '', 3000);
  },

  towerDown() {
    const tw = this.placeById.tornis;
    this.me.pos.set(tw.base.x, this.world.getHeight(tw.base.x, tw.base.z), tw.base.z + 0.4);
    this.me.vy = 0;
    sfx('jump');
  },

  takePiece(id) {
    const s = this.scrolls[id];
    if (!s) return;
    this.scene.remove(s);
    delete this.scrolls[id];
    if (!this.save.pieces.includes(id)) this.save.pieces.push(id);
    sfx('star');
    const n = this.save.pieces.length, need = MAP_PIECES.length;
    if (n >= need) toast('🗺️ Visi kartes gabali kopā! Krustiņš rāda uz 🏰 Pilsdrupām — tur ir dārguma lāde!', 'good', 6000);
    else toast(`🗺️ Kartes gabals ${n}/${need}! Pārējie ir citās īpašajās vietās.`, 'good', 4500);
    this.persist();
  },

  openChest() {
    const ch = this.world.chest;
    if (this.save.treasure) { toast('🏰 Lāde jau ir tukša — dārgumu tu atradi!'); return; }
    const n = this.save.pieces.length, need = MAP_PIECES.length;
    if (n < need) {
      const miss = MAP_PIECES.filter((id) => !this.save.pieces.includes(id)).map((id) => `${PLACES[id].icon} ${PLACES[id].name}`).join(', ');
      toast(`🔒 Lāde aizslēgta. Vajag ${need} kartes gabalus (${n}/${need}). Meklē: ${miss}`, 'bad', 5500);
      return;
    }
    this.save.treasure = true;
    this.chestAnim = 1.2;
    ch.coins.visible = true;
    setTimeout(() => { ch.coins.visible = false; }, 6000);
    this.addCoins(150);
    if (!this.save.ownedHats.includes('kivere')) this.save.ownedHats.push('kivere');
    this.setHat('kivere');
    this.stat('treasure');
    sfx('win');
    this.persist();
    showPanel('🏰 Dārgums!', (b) => {
      b.append(el('p', { style: 'font-size:40px;text-align:center;margin:4px' }, '💰🛡️'));
      b.append(el('p', {}, 'Tu atradi seno pilsdrupu dārgumu! +150🪙 un īsta bruņinieka ķivere (tā jau ir galvā, mainīt var pie Pūces Paulas).'));
    });
  },

  checkDiscover() {
    const me = this.me.pos;
    for (const p of this.world.places) {
      if (this.save.places.includes(p.id)) continue;
      if (Math.hypot(p.x - me.x, p.z - me.z) > (p.id === 'purvs' ? 26 : 18)) continue;
      this.save.places.push(p.id);
      this.save.stats.places = this.save.places.length;
      this.addCoins(10, true);
      sfx('star');
      toast(`🗺️ Atklāji jaunu vietu: ${PLACES[p.id].icon} ${PLACES[p.id].name}! +10🪙`, 'good', 4500);
      this.checkQuests();
    }
  },

  // ======================= mājdzīvnieki =======================
  makePet(id, ownerName) {
    const def = PETS[id];
    const m = buildNPC(def.npc);
    m.root.scale.multiplyScalar(def.scale);
    const ns = makeTextSprite(`🐾 ${def.name}`, { fontSize: 34, bg: 'rgba(120,70,20,0.6)' });
    ns.position.y = 1.0 / m.root.scale.y + 0.2;
    ns.scale.multiplyScalar(1 / m.root.scale.y);
    m.root.add(ns);
    void ownerName;
    this.stage.add(m.root); // mājdzīvnieks iet līdzi arī uz citām zemēm
    return { id, model: m, x: 0, z: 0, heading: 0, init: false };
  },

  setPet(id, silent = false) {
    if (this.pet) { this.pet.model.root.removeFromParent(); this.pet = null; }
    this.save.pet = id || null;
    if (id && PETS[id]) this.pet = this.makePet(id);
    if (!silent) this.sendProfile();
  },

  movePet(pet, ox, oz, oh, oy, dt) {
    const tx = ox - Math.sin(oh) * 1.5 + Math.cos(oh) * 0.7, tz = oz - Math.cos(oh) * 1.5 - Math.sin(oh) * 0.7;
    const dx = tx - pet.x, dz = tz - pet.z, d = Math.hypot(dx, dz);
    if (!pet.init || d > 30) { pet.x = tx; pet.z = tz; pet.init = true; }
    let sp = 0;
    if (d > 0.5) {
      sp = Math.min(14, d * 2.8);
      pet.x += dx / d * sp * dt; pet.z += dz / d * sp * dt;
      pet.heading = angleLerp(pet.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8));
    }
    const W = this.terr;
    const y = Math.max(W.groundAt(pet.x, pet.z, oy + 0.3), WATER_Y - 0.1);
    pet.model.root.position.set(pet.x, y, pet.z);
    pet.model.root.rotation.y = pet.heading;
    pet.model.animate(dt, sp > 0.3, sp);
  },

  // mašīna, kurā sēž saimnieks (r — draugs, null — es), un tā sēdvieta: [obj, seat] vai null
  petVehicle(r) {
    const me = this.me;
    if (!r) {
      if (me.veh) return [me.veh.obj, 0];
      if (me.ride) { const d = this.remotes.get(me.ride.driver); return d && d.vehObj ? [d.vehObj, me.ride.seat] : null; }
      return null;
    }
    if (r.vehObj && (r.vehCode === 2 || r.vehCode === 3 || r.vehCode === 5)) return [r.vehObj, 0];
    if (r.vehCode === 4) {
      const d = r.rideDriver === this.myId ? null : this.remotes.get(r.rideDriver);
      const car = r.rideDriver === this.myId ? me.veh && me.veh.obj : d && d.vehObj;
      return car ? [car, r.rideSeat] : null;
    }
    return null;
  },

  // mājdzīvnieks ielec mašīnā (savā vietā) un brauc līdzi; izkāpjot atkal skrien blakus. true — ir mašīnā
  petInVehicle(pet, veh, dt) {
    const root = pet.model.root;
    if (veh && veh[0].petSpots) {
      const spots = veh[0].petSpots, spot = spots[veh[1] % spots.length];
      if (root.parent !== spot) {
        // lēciens no tagadējās vietas uz sēdekli
        const wp = new THREE.Vector3();
        root.getWorldPosition(wp);
        spot.updateWorldMatrix(true, false);
        pet.hopFrom = root.parent ? spot.worldToLocal(wp) : new THREE.Vector3();
        if (pet.hopFrom.length() > 12) pet.hopFrom.set(0, 0, 0);
        pet.hopT = 0;
        spot.add(root);
        root.rotation.set(0, 0, 0);
      }
      pet.hopT = Math.min(1, (pet.hopT || 0) + dt * 2.2);
      const k = pet.hopT;
      root.position.copy(pet.hopFrom).multiplyScalar(1 - k);
      root.position.y += Math.sin(k * Math.PI) * 1.1;
      pet.model.animate(dt, k < 1, k < 1 ? 4 : 0);
      pet.inCar = true;
      return true;
    }
    if (pet.inCar) { this.stage.add(pet.model.root); pet.inCar = false; pet.init = false; }
    return false;
  },

  updatePets(dt) {
    const me = this.me;
    if (this.pet && !this.petInVehicle(this.pet, this.petVehicle(null), dt)) {
      const h = me.inKart ? me.kart.heading : me.heading;
      this.movePet(this.pet, me.pos.x, me.pos.z, h, me.pos.y, dt);
    }
    for (const r of this.remotes.values()) {
      const want = r.prof.pet || null;
      if ((r.pet ? r.pet.id : null) !== want) {
        if (r.pet) r.pet.model.root.removeFromParent();
        r.pet = want && PETS[want] ? this.makePet(want) : null;
      }
      if (!r.pet) continue;
      const near = (r.zone || 'c') === this.zone && Math.abs(r.pos.x - me.pos.x) < 120 && Math.abs(r.pos.z - me.pos.z) < 120;
      r.pet.model.root.visible = near && !this.mgHidden(r.id);
      if (near && !this.petInVehicle(r.pet, this.petVehicle(r), dt)) this.movePet(r.pet, r.pos.x, r.pos.z, r.ry, r.pos.y, dt);
    }
  },

  petMyPet() {
    this.petCd = this.now() + 180000; // paglaudīt var reizi 3 minūtēs (lai poga netraucē)
    this.me.petT = 1.2;
    this.me.heading = Math.atan2(this.pet.x - this.me.pos.x, this.pet.z - this.me.pos.z);
    this.spawnFloat('❤️', this.pet.model.root.position);
    sfx('pet');
    const msgs = ['priecīgi lēkā apkārt!', 'apmierināti murrā… vai ņurd.', 'grib vēl paglaudīšanu!', 'ir tavs labākais draugs!'];
    toast(`🐾 ${PETS[this.pet.id].name} ${msgs[Math.floor(Math.random() * msgs.length)]}`);
  },

  // ======================= dārza rotājumi =======================
  // 1.21.0: rotājumi stāv brīvi izvēlētās vietās ({k, x, z, r} 0. sētas koordinātēs); vecie — fiksētās vietās pie mājas
  fixDecor() {
    const s = this.save;
    if (s.decorV === 2) return;
    const gs = GARDEN_SLOTS[0];
    const placed = [];
    for (const d of s.decor || []) {
      if (typeof d === 'string') { const sp = DECOR_SPOTS[d]; if (sp) placed.push({ k: d, x: gs.x + sp[0], z: gs.z + sp[1], r: sp[2] }); }
      else if (d && d.k) placed.push(d);
    }
    // nopirkti, bet noņemti rotājumi — somā
    for (const k of s.ownedDecor || []) if (!placed.some((d) => d.k === k) && DECOR[k]) s.inv['d_' + k] = (s.inv['d_' + k] || 0) + 1;
    s.decor = placed;
    s.decorV = 2;
  },
  decorView() { return (this.save.decor || []).filter((d) => d && typeof d === 'object').map((d) => [d.k, d.x, d.z, d.r]); },

  renderDecor(slot, list) {
    if (!this.farmOn || slot == null) return;
    // saraksts: [[k, x, z, r]] (vai vecāku versiju draugiem — ['karogs', …] fiksētās vietās)
    const items = [];
    for (const d of list || []) {
      if (typeof d === 'string') { const sp = DECOR_SPOTS[d], gs = GARDEN_SLOTS[0]; if (sp) items.push([d, gs.x + sp[0], gs.z + sp[1], sp[2]]); }
      else if (Array.isArray(d)) items.push(d);
      else if (d && d.k) items.push([d.k, d.x, d.z, d.r]);
    }
    const key = JSON.stringify(items);
    if (this.decorKeys[slot] === key) return;
    this.decorKeys[slot] = key;
    for (const o of this.decorObjs[slot]) this.farmScene.remove(o);
    this.decorObjs[slot] = [];
    for (const [k, cx, cz, r] of items) {
      if (!DECOR[k]) continue;
      const [x, z] = rotPlot(cx, cz, slot);
      const o = buildDecor(k);
      o.position.set(x, this.farmW.getHeight(x, z), z);
      o.rotation.y = (r || 0) + rotPlotY(slot);
      this.farmScene.add(o);
      this.decorObjs[slot].push(o);
    }
  },

  // ======================= veikali =======================
  rodRow(b, rebuild) {
    b.append(el('div', { className: 'sect' }, 'Makšķerēšana'));
    b.append(itemRow(iconEl('rod'), 'Makšķere', this.save.rod ? 'Tev pieder! Ej pie ezera un spied „Makšķerēt”' : `${ROD_PRICE}🪙 · ķer zivis ezeros (no laipas ķeras labāk!)`,
      this.save.rod ? [] : [{ label: `Pirkt ${ROD_PRICE}🪙`, disabled: this.save.coins < ROD_PRICE, onclick: () => {
        if (this.save.coins < ROD_PRICE) return;
        this.addCoins(-ROD_PRICE); this.save.rod = true; sfx('coin');
        toast('🎣 Makšķere ir tavā somā! Ej pie ūdens.', 'good');
        refreshPanel(rebuild);
      } }]));
    b.append(el('div', { className: 'sect' }, 'Sēklas'));
  },

  shopPets() {
    const build = (b) => {
      b.append(el('p', {}, 'Vau! Katram vajag draugu, kas visur skrien līdzi. 🐾'));
      this.coinLine(b);
      for (const [k, p] of Object.entries(PETS)) {
        const owned = this.save.ownedPets.includes(k), cur = this.save.pet === k;
        const btns = owned
          ? [{ label: cur ? 'Mājās' : 'Ņemt līdzi', alt: cur, onclick: () => { this.setPet(cur ? null : k); refreshPanel(build); } }]
          : [{ label: `Pirkt ${p.price}🪙`, disabled: this.save.coins < p.price, onclick: () => {
              if (this.save.coins < p.price) return;
              this.addCoins(-p.price); this.save.ownedPets.push(k);
              this.save.stats.pets = this.save.ownedPets.length; this.checkQuests();
              this.setPet(k); sfx('pet');
              toast(`🐾 ${p.name} tagad ir tavs draugs un skries tev līdzi!`, 'good');
              refreshPanel(build);
            } }];
        b.append(itemRow(iconEl('pet:' + k, 40), p.name, owned ? (cur ? 'Skrien tev līdzi' : 'Tev pieder') : `${p.price}🪙`, btns));
      }
    };
    showPanel('🐾 Suns Sprīdis — mājdzīvnieki', build);
  },

  shopDecor() {
    const build = (b) => {
      b.append(el('p', {}, 'Padari savu sētu skaistāko ciemā! Nopirktais rotājums nonāk tavā somā 🎒 — sētā izņem to un novieto, kur gribi. Jau noliktu rotājumu var pacelt un pārnest. 🏡'));
      this.coinLine(b);
      for (const [k, d] of Object.entries(DECOR)) {
        const inBag = this.save.inv['d_' + k] || 0, placed = (this.save.decor || []).filter((x) => x.k === k).length;
        b.append(itemRow(iconEl('decor:' + k, 40), d.name, `${d.price}🪙${placed ? ` · sētā: ${placed}` : ''}${inBag ? ` · somā: ${inBag}` : ''}`, [{ label: `Pirkt ${d.price}🪙`, disabled: this.save.coins < d.price, onclick: () => {
          if (this.save.coins < d.price) return;
          this.addCoins(-d.price); this.addItem('d_' + k);
          this.save.ownedDecor = Array.from(new Set([...(this.save.ownedDecor || []), k]));
          this.save.stats.decor = this.save.ownedDecor.length; this.checkQuests();
          sfx('plant');
          toast(`${d.icon} ${d.name} ir tavā somā! Sētā atver 🎒 un spied „Novietot”.`, 'good', 4000);
          refreshPanel(build);
        } }]));
      }
    };
    showPanel('🏡 Lapsa Liene — dārza rotājumi', build);
  },

  // ======================= vēlēšanās aka (meža ciemata vidū) =======================
  wishWell() {
    if (this.save.coins < WISH_PRICE) { toast(`Akā jāiemet ${WISH_PRICE}🪙 — tev nepietiek`, 'bad'); return; }
    this.addCoins(-WISH_PRICE, true);
    this.stat('wishes');
    this.me.petT = 0.7;
    this.me.heading = Math.atan2(-this.me.pos.x, -this.me.pos.z);
    sfx('coin');
    this.spawnFloat('🪙', new THREE.Vector3(0, VILLAGE_Y + 1, 0));
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const r = Math.random();
    let gift = null;
    if (r < 0.42) gift = null;
    else if (r < 0.70) { const c = pick(Object.keys(CROPS)); gift = { k: c + '_seed', n: 2 + Math.floor(Math.random() * 3), text: `${CROPS[c].name} sēklas` }; }
    else if (r < 0.80) gift = { coins: 8 + Math.floor(Math.random() * 13) };
    else if (r < 0.89) { const d = pick(Object.keys(DECOR).filter((k) => DECOR[k].price <= 55)); gift = { k: 'd_' + d, n: 1, text: DECOR[d].name }; }
    else if (r < 0.95) { const t = pick(Object.keys(TREES)); gift = { k: t + '_sap', n: 1, text: `Stāds: ${TREES[t].name}` }; }
    else if (r < 0.985) {
      const free = Object.keys(CLOTHES).filter((k) => !this.save.ownedClothes.includes(k) && CLOTHES[k].price <= 45);
      gift = free.length ? { cloth: pick(free) } : { coins: 30 };
    } else gift = { coins: 60, big: true };
    setTimeout(() => {
      if (!gift) {
        const msgs = ['🪙 Plunkš… Aka klusē. Šoreiz nav veiksmes!', '🪙 Monēta aizripoja dziļi… Varbūt nākamreiz!', '🪙 Tikai ūdens apļi… Mēģini vēlreiz!'];
        toast(pick(msgs), '', 3200); return;
      }
      sfx(gift.big ? 'win' : 'star');
      let txt, ic;
      if (gift.coins) { this.addCoins(gift.coins, true); txt = `${gift.coins}🪙`; ic = 'coin'; }
      else if (gift.cloth) { this.save.ownedClothes.push(gift.cloth); txt = CLOTHES[gift.cloth].name + ' (somā)'; ic = 'cl:' + gift.cloth; }
      else { this.addItem(gift.k, gift.n); txt = `${gift.text}${gift.n > 1 ? ' ×' + gift.n : ''}`; ic = gift.k; }
      this.showPrize('✨ Aka piepildīja vēlēšanos!', ic, txt);
      this.persist();
    }, 650);
  },

  // liels attēls ekrāna vidū (laimests, noķerta zivs); pieskaroties pazūd
  showPrize(title, iconKey, text, sub = '', svg = null) {
    let ov = $('prize');
    if (!ov) {
      ov = el('div', { id: 'prize' });
      document.body.append(ov);
      ov.addEventListener('pointerdown', (e) => { e.preventDefault(); ov.classList.remove('on'); });
    }
    ov.innerHTML = '';
    const box = el('div', { className: 'prize-box' });
    box.append(el('div', { className: 'prize-title' }, title));
    const fishPic = svg || (iconKey && iconKey.startsWith('fish:'));
    const pic = el('div', { className: 'prize-pic' + (fishPic ? ' wide' : '') });
    pic.innerHTML = svg || icon(iconKey || 'nothing');
    box.append(pic, el('div', { className: 'prize-text' }, text));
    if (sub) box.append(el('div', { className: 'prize-sub', html: sub }));
    box.append(el('div', { className: 'prize-hint' }, 'Pieskaries, lai turpinātu'));
    ov.append(box);
    ov.classList.add('on');
    clearTimeout(this.prizeT);
    this.prizeT = setTimeout(() => ov.classList.remove('on'), 6000);
  },

  // ======================= nedēļas kopīgais mērķis =======================
  onTeam(team) {
    if (!team || team.w == null) return;
    this.team = { ...team };
    const sw = this.save.weekly && this.save.weekly.w === team.w ? this.save.weekly : { w: team.w, c: 0, done: false };
    sw.c = Math.max(sw.c || 0, team.c);
    if (team.c >= team.target && !sw.done) {
      sw.done = true;
      this.addCoins(WEEKLY_REWARD);
      this.save.trophies = (this.save.trophies || 0) + 1;
      sfx('win');
      toast(`🏆 Nedēļas kopīgais mērķis sasniegts! Visiem +${WEEKLY_REWARD}🪙`, 'good', 6000);
    }
    this.save.weekly = sw;
    this.updateTeamBar();
  },

  teamText() {
    const g = weeklyGoal(this.team.w);
    return g.text.replace('{n}', this.team.target);
  },

  // ======================= saimnieka puse =======================
  hostActivity(from, m) {
    const hs = this.hs, net = this.net, now = Date.now();
    switch (m.t) {
      case 'pickB': {
        const b = this.world.berries[m.id];
        if (!b || hs.pickedB[m.id] > now) return;
        hs.pickedB[m.id] = now + BERRY_RESPAWN;
        net.broadcast({ t: 'pickedB', id: m.id, until: hs.pickedB[m.id], by: from });
        break;
      }
      case 'teamAdd': {
        if (m.w !== hs.team.w) return;
        hs.team.c += Math.max(1, Math.min(50, m.n | 0));
        net.broadcast({ t: 'team', team: hs.team });
        break;
      }
      case 'mgStart': this.hostMgStart(from, m.kind); break;
      default: if (this.hostWinter) this.hostWinter(from, m);
    }
  },

  hostMergeWeekly(weekly) {
    const hs = this.hs;
    if (weekly && weekly.w === hs.team.w && weekly.c > hs.team.c) hs.team.c = weekly.c;
  },

  hostMgStart(from, kind) {
    const hs = this.hs, net = this.net, now = Date.now();
    if (hs.mg.phase !== 'none' && hs.mg.phase !== 'done') { net.sendTo(from, { t: 'toast', text: 'Spēle jau notiek! ⏳' }); return; }
    // spēles notiek Mežvidos; piedalās tikai tie, kas tur ir (pozīcijas 8. lauks — zemes kods)
    const zoneOf = (id) => (hs.positions.get(id) || [])[7] || 0;
    const FZ = ZONE_IDS.indexOf(FOREST);
    if (zoneOf(from) !== FZ) { net.sendTo(from, { t: 'toast', text: 'Ķeramo un paslēpes var spēlēt tikai Mežvidu mežā 🌲' }); return; }
    const players = [...hs.profiles.keys()].filter((id) => zoneOf(id) === FZ);
    if (players.length < 2) { net.sendTo(from, { t: 'toast', text: 'Šai spēlei vajag vismaz 2 spēlētājus — uzaicini draugus! 👥' }); return; }
    const p = hs.positions.get(from) || [0, 0, 0];
    const it = players[Math.floor(Math.random() * players.length)];
    if (kind === 'tag') {
      hs.mg = { kind, phase: 'run', players, it, cx: p[0], cz: p[2], R: 40, startAt: now + 4000, endAt: now + 4000 + 90000, itTime: {}, last: null, lastTick: now };
    } else {
      hs.mg = { kind: 'hide', phase: 'hide', players, it, cx: p[0], cz: p[2], R: 60, startAt: now, seekAt: now + 25000, endAt: now + 25000 + 120000, found: [] };
    }
    net.broadcast({ t: 'mg', mg: hs.mg });
  },

  hostMgTick(now) {
    const hs = this.hs, mg = hs.mg, net = this.net;
    if (!mg || mg.phase === 'none') return;
    const pos = (id) => hs.positions.get(id);
    const dist = (a, b) => { const pa = pos(a), pb = pos(b); return pa && pb && (pa[7] || 0) === (pb[7] || 0) ? Math.hypot(pa[0] - pb[0], pa[2] - pb[2]) : 1e9; };
    if (mg.phase === 'done') {
      if (now > mg.doneAt + 8000) { hs.mg = { kind: null, phase: 'none' }; net.broadcast({ t: 'mg', mg: hs.mg }); }
      return;
    }
    mg.players = mg.players.filter((id) => hs.profiles.has(id));
    if (mg.players.length < 2 || !mg.players.includes(mg.it)) {
      hs.mg = { kind: null, phase: 'none' };
      net.broadcast({ t: 'mg', mg: hs.mg });
      net.broadcast({ t: 'toast', text: 'Spēle beidzās — palika par maz spēlētāju.' });
      return;
    }
    const finish = (winners) => {
      mg.phase = 'done'; mg.doneAt = now; mg.winners = winners;
      net.broadcast({ t: 'mg', mg });
    };
    if (mg.kind === 'tag') {
      if (now < mg.startAt) return;
      mg.itTime[mg.it] = (mg.itTime[mg.it] || 0) + (now - mg.lastTick);
      mg.lastTick = now;
      for (const id of mg.players) {
        if (id === mg.it) continue;
        if (mg.last && mg.last.from === id && now - mg.last.at < 3000) continue; // nevar uzreiz noķert atpakaļ
        if (dist(mg.it, id) < 1.7) {
          mg.last = { from: mg.it, at: now };
          mg.it = id;
          net.broadcast({ t: 'mg', mg });
          break;
        }
      }
      if (now >= mg.endAt) {
        let best = null;
        for (const id of mg.players) { const tm = mg.itTime[id] || 0; if (best === null || tm < best) best = tm; }
        finish(mg.players.filter((id) => (mg.itTime[id] || 0) === best));
      }
    } else {
      if (mg.phase === 'hide' && now >= mg.seekAt) { mg.phase = 'seek'; net.broadcast({ t: 'mg', mg }); return; }
      if (mg.phase !== 'seek') return;
      const hiders = mg.players.filter((id) => id !== mg.it);
      for (const id of hiders) {
        if (mg.found.includes(id)) continue;
        if (dist(mg.it, id) < 2.6) { mg.found.push(id); net.broadcast({ t: 'mg', mg, foundNow: id }); }
      }
      if (hiders.every((id) => mg.found.includes(id))) finish([mg.it]);
      else if (now >= mg.endAt) finish(hiders.filter((id) => !mg.found.includes(id)));
    }
  },

  // ======================= klienta ziņojumi =======================
  onActivityMessage(m) {
    switch (m.t) {
      case 'pickedB': {
        this.berryPicked[m.id] = m.until;
        if (m.by === this.myId) {
          const b = this.world.berries[m.id], def = BERRIES[b.kind];
          this.addItem(b.kind);
          this.stat('berries');
          sfx('pick');
          toast(`${def.icon} Salasīji: ${def.name}!`);
          this.spawnFloat(def.icon, this.me.pos);
        }
        break;
      }
      case 'team': this.onTeam(m.team); break;
      case 'mg': this.onMg(m.mg, m.foundNow); break;
      default: if (this.onWinterMessage) this.onWinterMessage(m);
    }
  },

  // ======================= ķeramais un paslēpes (klients) =======================
  mgActive() { return this.mg && this.mg.kind && this.mg.phase !== 'none' && this.mg.phase !== 'done'; },
  mgIn() { return this.mgActive() && this.mg.players.includes(this.myId); },
  // vai šis spēlētājs man jāslēpj (es esmu meklētājs, viņš slēpjas)
  mgHidden(id) {
    const mg = this.mg;
    return this.mgActive() && mg.kind === 'hide' && mg.it === this.myId && id !== this.myId && mg.players.includes(id) && !mg.found.includes(id);
  },
  mgFrozen() { const mg = this.mg; return this.mgActive() && mg.kind === 'hide' && mg.phase === 'hide' && mg.it === this.myId; },

  onMg(mg, foundNow) {
    mg = JSON.parse(JSON.stringify(mg));
    const prev = this.mg || { phase: 'none' };
    this.mg = mg;
    const mine = mg.players && mg.players.includes(this.myId);
    const nameOf = (id) => (id === this.myId ? 'Tu' : this.remotes.get(id)?.prof.name || '?');
    if (mg.kind === 'tag' && mine) {
      if (prev.phase !== 'run') {
        if (this.me.inKart) this.exitKart();
        closePanel();
        toast(mg.it === this.myId ? '🏃 Ķeramais! TU esi ķērājs — pieskaries kādam!' : `🏃 Ķeramais! Ķērājs ir ${nameOf(mg.it)} — bēdz!`, 'good', 4500);
        sfx('go');
      } else if (prev.it !== mg.it && mg.phase === 'run') {
        sfx(mg.it === this.myId ? 'bad' : 'beep');
        toast(mg.it === this.myId ? '😱 Tevi noķēra! Tagad TU ķer!' : `🏃 ${nameOf(mg.it)} tagad ir ķērājs!`);
      }
    }
    if (mg.kind === 'hide' && mine) {
      if (prev.phase === 'none' || prev.kind !== 'hide') {
        if (this.me.inKart) this.exitKart();
        closePanel();
        toast(mg.it === this.myId ? '🙈 Paslēpes! Tu meklē. Aizver acis un skaiti…' : `🙈 Paslēpes! ${nameOf(mg.it)} skaita — ātri slēpies (25 s)!`, 'good', 5000);
        sfx('go');
      } else if (mg.phase === 'seek' && prev.phase === 'hide') {
        toast(mg.it === this.myId ? '👀 Gatavs vai nē — eju meklēt! Skaties pēc 🔥/❄️ norādes.' : '👀 Meklētājs nāk! Neizdod sevi!', 'good', 4000);
        sfx('go');
      }
      if (foundNow != null) {
        sfx('beep');
        toast(foundNow === this.myId ? '🙈 Tevi atrada!' : `👀 Atrasts: ${nameOf(foundNow)}!`);
      }
    }
    if (mg.phase === 'done' && prev.phase !== 'done' && mine) {
      const won = mg.winners.includes(this.myId);
      this.addCoins(won ? 25 : 5);
      if (won) this.stat('mgwins');
      sfx(won ? 'win' : 'beep');
      showPanel(`${MG_NAMES[mg.kind]} — rezultāti`, (b) => {
        if (mg.kind === 'tag') {
          const rows = mg.players.map((id) => ({ id, t: mg.itTime[id] || 0 })).sort((a, c) => a.t - c.t);
          b.append(el('p', {}, 'Uzvar tas, kurš vismazāk laika bija ķērājs:'));
          rows.forEach((r, i) => b.append(itemRow(['🥇', '🥈', '🥉', '4.'][i] || '•', nameOf(r.id), `ķērājs ${fmtTime(r.t)}`, [], r.id === this.myId ? 'sel' : '')));
        } else {
          const seekerWon = mg.winners.includes(mg.it);
          b.append(el('p', {}, seekerWon ? `👀 ${nameOf(mg.it)} atrada visus!` : `🙈 Paslēpās un netika atrasti: ${mg.winners.map(nameOf).join(', ')}`));
        }
        b.append(el('p', {}, won ? '🎉 Tu uzvarēji! +25🪙' : 'Paldies par spēli! +5🪙'));
      });
    }
    this.updateMgMarker();
  },

  updateMgMarker() {
    const mg = this.mg;
    if (this.mgMarker) { this.mgMarker.parent && this.mgMarker.parent.remove(this.mgMarker); this.mgMarker = null; }
    if (!this.mgActive()) return;
    const av = mg.it === this.myId ? this.avatar : this.remotes.get(mg.it)?.avatar;
    if (!av) return;
    const sp = makeTextSprite(mg.kind === 'tag' ? '🏃 ĶĒRĀJS' : '👀 MEKLĒ', { fontSize: 40, bg: 'rgba(200,40,40,0.85)' });
    sp.position.y = 3.3;
    av.root.add(sp);
    this.mgMarker = sp;
  },

  updateMg(dt, t) {
    const hud = $('mg-hud'), cover = $('hide-cover');
    const mg = this.mg;
    if (!this.mgIn()) {
      hud.classList.add('hidden'); cover.classList.add('hidden');
      for (const r of this.remotes.values()) if (r.nameSprite) r.nameSprite.visible = true;
      return;
    }
    hud.classList.remove('hidden');
    const sec = (ms) => Math.max(0, Math.ceil(ms / 1000));
    if (mg.kind === 'tag') {
      hud.textContent = t < mg.startAt ? `🏃 Ķeramais sāksies pēc ${sec(mg.startAt - t)} s`
        : `🏃 ${mg.it === this.myId ? 'TU ESI ĶĒRĀJS!' : 'Bēdz no ķērāja!'} · ⏱️ ${sec(mg.endAt - t)} s`;
      cover.classList.add('hidden');
    } else {
      const seeker = mg.it === this.myId;
      if (mg.phase === 'hide') {
        hud.textContent = seeker ? `🙈 Skaiti… ${sec(mg.seekAt - t)}` : `🙈 Slēpies! Meklētājs sāks pēc ${sec(mg.seekAt - t)} s`;
        cover.classList.toggle('hidden', !seeker);
        if (seeker) cover.textContent = `🙈 ${sec(mg.seekAt - t)}`;
      } else {
        cover.classList.add('hidden');
        const left = mg.players.filter((id) => id !== mg.it && !mg.found.includes(id)).length;
        if (seeker) {
          let nd = 1e9;
          for (const r of this.remotes.values()) if (mg.players.includes(r.id) && !mg.found.includes(r.id)) nd = Math.min(nd, r.pos.distanceTo(this.me.pos));
          const hint = nd < 8 ? '🔥 Ļoti karsts!' : nd < 18 ? '🌡️ Silts' : nd < 35 ? '🙂 Vēsi' : '❄️ Auksts';
          hud.textContent = `👀 Meklē! Vēl ${left} · ${hint} · ⏱️ ${sec(mg.endAt - t)} s`;
        } else {
          hud.textContent = mg.found.includes(this.myId) ? `🙈 Tevi atrada · vēl slēpjas ${left} · ⏱️ ${sec(mg.endAt - t)} s` : `🤫 Slēpies! Vēl ${left} neatrasti · ⏱️ ${sec(mg.endAt - t)} s`;
        }
      }
    }
    for (const r of this.remotes.values()) if (r.nameSprite) r.nameSprite.visible = !this.mgHidden(r.id);
    // spēles laukuma robeža
    const d = Math.hypot(this.me.pos.x - mg.cx, this.me.pos.z - mg.cz);
    if (d > mg.R) {
      this.me.pos.x = mg.cx + (this.me.pos.x - mg.cx) / d * mg.R;
      this.me.pos.z = mg.cz + (this.me.pos.z - mg.cz) / d * mg.R;
      this.mgEdgeT -= dt;
      if (this.mgEdgeT <= 0) { this.mgEdgeT = 3; toast('🚧 Spēles laukuma mala! (redzama kartē)'); }
    }
  },

  openGames() {
    showPanel('🎲 Spēles ar draugiem', (b) => {
      const alone = this.remotes.size === 0;
      if (alone) b.append(el('p', {}, '👥 Šīm spēlēm vajag vismaz 2 spēlētājus. Izveido istabu un uzaicini draugus!'));
      b.append(el('div', { className: 'sect' }, '🏃 Ķeramais'));
      b.append(el('p', {}, 'Viens ir ķērājs (sarkana zīme virs galvas). Pieskaries citam — tagad viņš ķer! 90 sekundes; uzvar tas, kurš vismazāk bija ķērājs. Spēlē 40 m ap vietu, kur spēle sākta.'));
      b.append(el('button', { className: 'pbtn', disabled: alone ? 'disabled' : null, onclick: () => { this.net.toHost({ t: 'mgStart', kind: 'tag' }); closePanel(); } }, '🏃 Sākt ķeramo'));
      b.append(el('div', { className: 'sect' }, '🙈 Paslēpes'));
      b.append(el('p', {}, 'Meklētājs 25 sekundes skaita (ekrāns aizvērts), pārējie slēpjas 60 m ap sākuma vietu. Tad 2 minūtes meklē — norāde rāda, vai ir 🔥 karsts vai ❄️ auksts. Vārdi virs galvām paslēpti!'));
      b.append(el('button', { className: 'pbtn', disabled: alone ? 'disabled' : null, onclick: () => { this.net.toHost({ t: 'mgStart', kind: 'hide' }); closePanel(); } }, '🙈 Sākt paslēpes'));
      b.append(el('p', { style: 'opacity:.7;font-size:13px' }, 'Uzvarētājam +25🪙, pārējiem +5🪙.'));
    });
  },
};


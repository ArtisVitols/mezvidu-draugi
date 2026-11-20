// 🌱 Dārznieka līmenis un dārza paplašināšana.
// Pieredzes punkti (XP) nāk no ražas novākšanas, augļu lasīšanas, zemes uzaršanas un koku/akmeņu novākšanas.
// Ar katru līmeni atveras jaunas sēklas un augļu koki (UNLOCK) un var nopirkt lielāku dārzu (LAND).
// Dārzs aug no vārtu puses: sākumā 6 × 4 lauciņi pie galvenajiem vārtiem, beigās viss 20 × 20.
// Saglabājumā: save.gd = { xp, land } (land — LAND indekss).
// Garden — Game papildinājums (mixin).
import * as THREE from 'three';
import { CROPS, TREES } from './data.js?v=1.38.0';
import { TILE, GARDEN_T, rotPlot } from './world.js?v=1.38.0';
import { mat } from './util.js?v=1.38.0';
import { $, toast, sfx, showPanel, refreshPanel, el, itemRow } from './ui.js?v=1.38.0';
import { iconEl } from './icons.js?v=1.38.0';
import { FARM } from './zones.js?v=1.38.0';

// cik XP vajag, lai sasniegtu līmeni n (1. līmenis — 0)
export const MAX_LVL = 24;  // 1.36.0: bija 12
export const xpFor = (n) => (n <= 1 ? 0 : Math.round(20 * Math.pow(n - 1, 1.6)));
export function levelOf(xp) { let n = 1; while (n < MAX_LVL && xp >= xpFor(n + 1)) n++; return n; }

// kurā līmenī atveras katra kultūra un koks
export const UNLOCK = {
  burkans: 1, redisi: 1, kartupelis: 1,
  salati: 2, auzas: 2, spinati: 2,
  sipols: 3, kviesi: 3, kiploks: 3,
  zirni: 4, tomats: 4, tulpe: 4,
  zemene: 5, biete: 5, pupas: 5,
  kaposts: 6, abele: 6, brokolis: 6,
  gurkis: 7, saulgrieze: 7, kabacis: 7,
  kirbis: 8, plume: 8, rabarbers: 8,
  kukuruza: 9, bumbiere: 9,
  paprika: 10, kirsis: 10, melone: 10,
  arbuzs: 11, aprikoze: 11,
  lavanda: 12, persiks: 12,
  spargelis: 13,
  baklazans: 14,
  roze: 15, valrieksts: 15,
  ananass: 16,
  zemesrieksti: 17, citronkoks: 17,
  cili: 18,
  magone: 19, apelsinkoks: 19,
  vinogas: 20,
  zeltaburkans: 21,
  milzkirbis: 22, zeltabele: 22,
  varaviksne: 23,
  zvaigzne: 24,
};
// dārza izmēri (platums × dziļums lauciņos), vajadzīgais līmenis un cena
export const LAND = [
  { w: 6, d: 4, lvl: 1, price: 0 },
  { w: 8, d: 6, lvl: 2, price: 30 },
  { w: 10, d: 8, lvl: 3, price: 60 },
  { w: 12, d: 10, lvl: 4, price: 100 },
  { w: 14, d: 12, lvl: 6, price: 160 },
  { w: 16, d: 14, lvl: 7, price: 240 },
  { w: 18, d: 17, lvl: 9, price: 350 },
  { w: 20, d: 20, lvl: 10, price: 500 },
];
// XP par darbiem
export const XP = { plow: 1, clear: 2, waterFriend: 2 };
export const cropXp = (k) => Math.round(2 + 2 * Math.sqrt(CROPS[k].grow / 60));
export const fruitXp = (k) => 3 + Math.round(TREES[k].yield / 2);

// dārza taisnstūris 0. sētas lauciņos: ix — no vārtu vidus (x = −37,5 → robeža starp −16 un −15) uz abām pusēm, iz — no ceļa puses (−6) uz iekšu
export function landRect(land) {
  const L = LAND[Math.max(0, Math.min(LAND.length - 1, land))];
  const ix0 = -15 - L.w / 2, ix1 = -15 + L.w / 2 - 1, iz1 = GARDEN_T[1], iz0 = iz1 - L.d + 1;
  return { ix0, ix1, iz0, iz1 };
}
export const inLand = (a, b, land) => { const r = landRect(land); return a >= r.ix0 && a <= r.ix1 && b >= r.iz0 && b <= r.iz1; };

export const Garden = {
  // vecajiem saglabājumiem: līmenis pēc jau paveiktā, dārzs tik liels, lai visi lauciņi ietilpst
  initGarden() {
    const s = this.save;
    if (s.gd && typeof s.gd.xp === 'number') return;
    const st = s.stats || {};
    const xp = (st.harvested || 0) * 6 + (st.plowed || 0) + (st.cleared || 0) * 2 + (st.fruits || 0);
    let land = 0;
    for (const k in s.farm.t) {
      const [a, b] = k.split(',').map(Number);
      while (land < LAND.length - 1 && !inLand(a, b, land)) land++;
    }
    s.gd = { xp, land };
  },

  gardenLvl() { return levelOf(this.save.gd.xp); },
  cropOpen(k) { return this.gardenLvl() >= (UNLOCK[k] || 1); },

  // pieskaita XP; pārejot uz jaunu līmeni — svētki, monētas un ko tagad var sēt
  gardenXp(n, at = null) {
    if (!n) return;
    const g = this.save.gd, before = levelOf(g.xp);
    g.xp += n;
    if (at && this.spawnFloat) this.spawnFloat(`+${n}⭐`, at);
    const after = levelOf(g.xp);
    this.updateGardenHud();
    if (after > before) {
      for (let L = before + 1; L <= after; L++) this.gardenLevelUp(L);
    }
  },

  gardenLevelUp(L) {
    const prize = L * 10;
    this.addCoins(prize, true);
    sfx('j_level', { vol: 0.85 });
    const opened = Object.keys(UNLOCK).filter((k) => UNLOCK[k] === L).map((k) => (CROPS[k] ? `${CROPS[k].icon} ${CROPS[k].name}` : `🌳 ${TREES[k].name}`));
    const land = LAND.findIndex((x, i) => i > this.save.gd.land && x.lvl === L);
    if (this.spawnFloat) this.spawnFloat('🎉', this.me.pos);
    toast(`🎉 Dārznieka ${L}. līmenis! +${prize}🪙${opened.length ? ` · Jaunas sēklas: ${opened.join(', ')}` : ''}${land >= 0 ? ` · Var paplašināt dārzu (${LAND[land].w}×${LAND[land].d})` : ''}`, 'good', 7000);
    this.persist && this.persist();
  },

  updateGardenHud() {
    const b = $('btn-glevel');
    if (!b || !this.save.gd) return;
    const xp = this.save.gd.xp, L = levelOf(xp);
    const p = L >= MAX_LVL ? 1 : (xp - xpFor(L)) / (xpFor(L + 1) - xpFor(L));
    b.textContent = `🌱 ${L}`;
    b.style.background = `linear-gradient(90deg, rgba(140,220,110,.95) ${Math.round(p * 100)}%, rgba(255,255,255,.88) ${Math.round(p * 100)}%)`;
  },

  // nākamais dārza paplašinājums (null — jau pilns)
  nextLand() { const i = this.save.gd.land + 1; return i < LAND.length ? { i, ...LAND[i] } : null; },

  buyLand() {
    const n = this.nextLand();
    if (!n) return;
    if (this.gardenLvl() < n.lvl) { toast(`🔒 Lielāku dārzu var nopirkt no ${n.lvl}. līmeņa`); return; }
    if (this.save.coins < n.price) { toast(`Nepietiek monētu — vajag ${n.price}🪙`, 'bad'); return; }
    this.addCoins(-n.price, true);
    this.save.gd.land = n.i;
    sfx('coin');
    toast(`🏡 Dārzs paplašināts: ${n.w} × ${n.d} lauciņi!`, 'good', 4000);
    this.renderLandBorder();
    this.persist && this.persist();
  },

  // dārza robeža: mieti ar virvi ap atļauto vietu manā sētā (kamēr dārzs nav pilns)
  renderLandBorder() {
    if (!this.farmScene || this.mySlot == null || this.mySlot < 0) return;
    if (this.landBorder) { this.farmScene.remove(this.landBorder); this.landBorder.traverse((o) => o.geometry && o.geometry.dispose()); this.landBorder = null; }
    const land = this.save.gd.land;
    if (land >= LAND.length - 1) return;
    const r = landRect(land), W = this.farmW, slot = this.mySlot;
    const x0 = r.ix0 * TILE, x1 = (r.ix1 + 1) * TILE, z0 = r.iz0 * TILE, z1 = (r.iz1 + 1) * TILE;
    const pts = [];
    const edge = (ax, az, bx, bz) => { const n = Math.round(Math.hypot(bx - ax, bz - az) / TILE); for (let i = 0; i < n; i++) pts.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]); };
    edge(x0, z1, x0, z0); edge(x0, z0, x1, z0); edge(x1, z0, x1, z1); edge(x1, z1, x0, z1);
    const g = new THREE.Group();
    const stake = new THREE.CylinderGeometry(0.045, 0.06, 0.7, 6);
    const wood = mat('#8a6440', { roughness: 0.9 }), rope = mat('#e8d9a8', { roughness: 1 }), flag = mat('#ffcf3a', { roughness: 0.8 });
    const world = pts.map(([x, z]) => { const [wx, wz] = rotPlot(x, z, slot); return new THREE.Vector3(wx, W.getHeight(wx, wz), wz); });
    world.forEach((p, i) => {
      const s = new THREE.Mesh(stake, wood); s.position.set(p.x, p.y + 0.3, p.z); g.add(s);
      const q = world[(i + 1) % world.length], len = Math.hypot(q.x - p.x, q.z - p.z);
      const rp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, len), rope);
      rp.position.set((p.x + q.x) / 2, (p.y + q.y) / 2 + 0.5, (p.z + q.z) / 2); rp.lookAt(q.x, q.y + 0.5, q.z); g.add(rp);
      if (i % 2 === 0) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.18), flag); f.position.set(p.x, p.y + 0.62, p.z + 0.1); g.add(f); }
    });
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.landBorder = g;
    this.farmScene.add(g);
  },

  // darbība pie lauciņa ārpus dārza robežas
  landAction(consider) {
    const n = this.nextLand();
    if (!n) return;
    if (this.gardenLvl() < n.lvl) consider(1.0, 2, `🔒 Dārzs vēl mazs — lielāks no ${n.lvl}. līmeņa`, () => this.openGardenInfo());
    else consider(1.0, 2, `🏡 Paplašināt dārzu līdz ${n.w}×${n.d} (${n.price}🪙)`, () => this.buyLand());
  },

  // dārznieka panelis: līmenis, progress, kas atveras, dārza izmērs
  openGardenInfo() {
    const build = (b) => {
      const xp = this.save.gd.xp, L = levelOf(xp), land = LAND[this.save.gd.land];
      const next = L < MAX_LVL ? xpFor(L + 1) : null;
      b.append(el('div', { className: 'sect' }, `🌱 Dārznieka ${L}. līmenis`));
      const bar = el('div', { style: 'height:16px;border-radius:8px;background:#e5e0d2;overflow:hidden;margin:4px 0 2px' });
      bar.append(el('div', { style: `height:100%;width:${next ? Math.round((xp - xpFor(L)) / (next - xpFor(L)) * 100) : 100}%;background:#6cc04a` }));
      b.append(bar);
      b.append(el('p', { style: 'margin:2px 0 8px;font-size:14px' }, next ? `⭐ ${xp} / ${next} — līdz ${L + 1}. līmenim vēl ${next - xp} ⭐` : `⭐ ${xp} — augstākais līmenis! 🏆`));
      b.append(el('p', { style: 'font-size:13px;opacity:.85;margin:2px 0' }, '⭐ nāk par ražas novākšanu (ilgāk augošas kultūras dod vairāk), augļu lasīšanu, zemes uzaršanu, koku un akmeņu novākšanu un draugu lauku aplaistīšanu. Katrā līmenī: monētas un jaunas sēklas!'));
      b.append(el('div', { className: 'sect' }, `🏡 Dārzs: ${land.w} × ${land.d} lauciņi`));
      const n = this.nextLand();
      if (n) {
        const can = L >= n.lvl;
        b.append(itemRow(el('div', { style: 'font-size:30px;width:40px;text-align:center' }, '🏡'), `Paplašināt līdz ${n.w} × ${n.d}`, can ? `${n.price}🪙 · tev ir ${this.save.coins}🪙` : `🔒 no ${n.lvl}. līmeņa · ${n.price}🪙`, [
          { label: 'Pirkt', disabled: !can || this.save.coins < n.price, onclick: () => { this.buyLand(); refreshPanel(build); } },
        ]));
      } else b.append(el('p', {}, 'Tavs dārzs ir pilnā izmērā — 20 × 20! 🎉'));
      b.append(el('div', { className: 'sect' }, '🔓 Sēklas un koki pa līmeņiem'));
      for (let k = 1; k <= MAX_LVL; k++) {
        const ids = Object.keys(UNLOCK).filter((id) => UNLOCK[id] === k);
        if (!ids.length) continue;
        const row = el('div', { style: `display:flex;align-items:center;gap:6px;margin:3px 0;opacity:${k <= L ? 1 : 0.55}` });
        row.append(el('b', { style: 'width:62px;font-size:14px' }, `${k <= L ? '✅' : '🔒'} ${k}.`));
        for (const id of ids) {
          const box = el('div', { style: 'display:flex;flex-direction:column;align-items:center;font-size:11px;width:60px' });
          box.append(iconEl(CROPS[id] ? id : id + '_sap', 30), el('span', {}, CROPS[id] ? CROPS[id].name : TREES[id].name));
          row.append(box);
        }
        b.append(row);
      }
    };
    showPanel('🌱 Mans dārzs', build);
  },

  // vai mana sēta ir šajā zemē un vai rādīt robežu
  gardenZoneChanged() { if (this.zone === FARM) this.renderLandBorder(); },
};

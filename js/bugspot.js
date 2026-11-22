// 🐞 Kļūdas vieta (1.41.0): spēlējot kopā, jebkurš spēlētājs var saglabāt "kļūdas vietu" — saimnieks pieraksta visu
// spēlētāju precīzas vietas (zeme, x/y/z, virziens), ko kurš nes, piedzīvojumu takas stāvokli un konsoles kļūdas.
// Vietas glabājas katra pārlūkā (localStorage `mezvidi_bugspots`, pēdējās 10) un paliek arī pēc lapas pārlādes / jaunas versijas.
// Aprakstu var nokopēt un aizsūtīt izstrādātājam. Pēc labojuma saimnieks nospiež "▶ Turpināt" — visi (pēc vārda)
// tiek pārcelti atpakaļ uz savām vietām, taka atjaunota, nesamie atkal rokās.
import { ZONES, ZONE_IDS } from './zones.js?v=1.46.0';
import { VERSION } from './version.js?v=1.46.0';
import { toast, showPanel, refreshPanel, closePanel, panelOpen, el, sfx } from './ui.js?v=1.46.0';

const KEY = 'mezvidi_bugspots', MAX = 10, CARRY_MS = 180000;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
const store = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (e) { /* */ } };
const code = () => { const A = 'ABCDEFGHJKLMNPRSTUVZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };
const fmtT = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

// konsoles kļūdas (pēdējās 12) — lai aprakstā redzētu, kas nogāja greizi
const errs = [];
let hooked = false;
function hookErrors() {
  if (hooked) return; hooked = true;
  const add = (s) => { errs.push(`${new Date().toTimeString().slice(0, 8)} ${String(s).slice(0, 300)}`); if (errs.length > 12) errs.shift(); };
  window.addEventListener('error', (e) => add((e.message || '') + (e.filename ? ` @ ${e.filename.split('/').pop()}:${e.lineno}` : '')));
  window.addEventListener('unhandledrejection', (e) => add('promise: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  const ce = console.error.bind(console);
  console.error = (...a) => { add(a.map((x) => (x && x.stack) || x).join(' ')); ce(...a); };
}

export const BugSpot = {
  initBugSpot() { hookErrors(); },

  // apraksts kopēšanai (izstrādātājam)
  bugText(s) {
    const tr = s.trail;
    const lines = [`🐞 KĻŪDAS VIETA ${s.id} · v${s.ver} · ${fmtT(s.at)} · saglabāja ${s.by}`];
    if (s.note) lines.push('Kas notika: ' + s.note);
    if (tr) lines.push(`Taka: solis ${tr.step + 1}/5, savākts ${tr.c}, uzdevums ${tr.acc ? 'pieņemts' : 'nav pieņemts'}, tilts ${tr.bridge ? 'ir' : 'nav'}, gājiens ${tr.run}, šķēršļi ${JSON.stringify(tr.ob || [])}`);
    for (const p of s.players) lines.push(`- ${p.name}: ${ZONES[p.zone] ? ZONES[p.zone].icon : ''} ${p.zone} x ${p.x} y ${p.y} z ${p.z} virziens ${p.h}${p.carry ? ` nes ${p.carry.replace(/^t:/, '')}` : ''}`);
    if (s.errs && s.errs.length) { lines.push('Kļūdas konsolē:'); for (const e of s.errs) lines.push('  ' + e); }
    return lines.join('\n');
  },

  openBugSpot(refresh = false) {
    const build = (b) => {
      const list = load(), host = this.net.isHost;
      b.append(el('p', { className: 'muted' }, 'Redzi kļūdu? Saglabā vietu — tiks pierakstīts, kur stāv visi spēlētāji un cik tālu ir taka. Pēc labojuma varēsiet turpināt tieši no turienes.'));
      const note = el('textarea', { rows: 2, placeholder: 'Kas notika? (nav obligāti)', style: 'width:100%;box-sizing:border-box;font-size:15px;border-radius:10px;padding:8px' });
      b.append(note);
      b.append(el('div', { className: 'mrow' }, el('button', { className: 'mbtn', onclick: () => this.bugSave(note.value.trim()) }, '📍 Saglabāt kļūdas vietu')));
      if (!list.length) b.append(el('p', { className: 'muted' }, 'Vēl nav saglabātu vietu.'));
      for (const s of list) {
        const card = el('div', { style: 'background:rgba(0,0,0,.06);border-radius:12px;padding:8px 10px;margin:8px 0' });
        card.append(el('div', {}, el('b', {}, `🐞 ${s.id}`), ` · ${fmtT(s.at)} · v${s.ver} · ${s.players.length} sp.`));
        if (s.note) card.append(el('div', { className: 'muted' }, s.note));
        card.append(el('div', { className: 'muted' }, s.players.map((p) => `${p.name} ${ZONES[p.zone] ? ZONES[p.zone].icon : ''}`).join(' · ')));
        const row = el('div', { className: 'mrow' });
        row.append(el('button', { className: 'mbtn', onclick: () => this.bugCopy(s) }, '📋 Kopēt aprakstu'));
        if (host) row.append(el('button', { className: 'mbtn', onclick: () => this.hostBugGo(s) }, '▶ Turpināt no šejienes'));
        row.append(el('button', { className: 'mbtn red', onclick: () => { store(load().filter((x) => x.id !== s.id)); this.openBugSpot(true); } }, '🗑'));
        card.append(row);
        b.append(card);
      }
      if (!host) b.append(el('p', { className: 'muted' }, 'Turpināt no vietas var istabas saimnieks.'));
    };
    if (refresh && panelOpen()) refreshPanel(build); else showPanel('🐞 Kļūdas vieta', build);
  },

  bugCopy(s) {
    const txt = this.bugText(s);
    const done = () => toast('📋 Nokopēts — ielīmē ziņā izstrādātājam', 'good');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => this.bugShowText(txt));
    else this.bugShowText(txt);
  },
  // ja kopēt neļauj — parāda tekstu, ko iezīmēt ar roku
  bugShowText(txt) {
    showPanel('📋 Apraksts', (b) => {
      const t = el('textarea', { rows: 12, readOnly: true, style: 'width:100%;box-sizing:border-box;font-size:12px' });
      t.value = txt; b.append(t);
      setTimeout(() => { t.focus(); t.select(); }, 50);
    });
  },

  bugSave(note) {
    const m = { t: 'bugSave', note: note.slice(0, 300), errs: errs.slice() };
    if (this.net.isHost) this.hostBugSave(0, m); else this.net.toHost(m);
    sfx('pick');
  },

  // saimnieks: momentuzņēmums no visu pozīcijām
  hostBugSave(from, m) {
    const hs = this.hs;
    const nameOf = (id) => ((hs.profiles.get(id) || {}).name) || (id === 0 ? this.save.name : 'Spēlētājs ' + id);
    const players = [];
    const carryOf = (id) => (id === 0 ? (this.me.carry ? this.me.carry.k : null) : ((hs.profiles.get(id) || {}).carry || null));
    // saimnieks pats — no tiešās pozīcijas (precīzāk)
    const me = this.me;
    players.push({ name: this.save.name, zone: this.zone, x: +me.pos.x.toFixed(2), y: +me.pos.y.toFixed(2), z: +me.pos.z.toFixed(2), h: +(me.heading || 0).toFixed(2), carry: carryOf(0) });
    for (const [id, p] of hs.positions) {
      if (id === 0 || !Array.isArray(p)) continue;
      players.push({ name: nameOf(id), zone: ZONE_IDS[p[7]] || 'c', x: p[0], y: p[1], z: p[2], h: p[3], carry: carryOf(id) });
    }
    let trail = null;
    if (hs.trail) {
      trail = JSON.parse(JSON.stringify(hs.trail));
      // kas ko nes — pēc vārda (id pēc pārlādes būs citi)
      for (const i of Object.keys(trail.taken || {})) { const t = trail.taken[i]; trail.taken[i] = [t[1] < 0 ? '' : nameOf(t[0]), t[1] < 0 ? -1 : 1]; }
    }
    const e = [...(m.errs || []).map((x) => `[${nameOf(from)}] ${x}`), ...(from !== 0 ? errs.map((x) => `[${this.save.name}] ${x}`) : [])];
    const s = { id: code(), at: Date.now(), ver: VERSION, by: nameOf(from), note: m.note || '', trail, players, errs: e.slice(-16) };
    this.net.broadcast({ t: 'bugSaved', s });
    this.onBugSaved(s);
  },
  onBugSaved(s) {
    store([s, ...load().filter((x) => x.id !== s.id)]);
    toast(`🐞 Kļūdas vieta saglabāta: ${s.id}`, 'good', 4000);
    if (panelOpen() && this.bugPanelOpen()) this.openBugSpot(true);
  },
  bugPanelOpen() { const t = document.getElementById('panel-title'); return !!(t && t.textContent.includes('Kļūdas vieta')); },

  // saimnieks: visi atpakaļ uz saglabātajām vietām
  hostBugGo(s) {
    const hs = this.hs;
    if (!hs) return;
    const now = Date.now(), byName = new Map();
    byName.set(this.save.name, 0);
    for (const [id, p] of hs.profiles) if (id !== 0 && p && p.name) byName.set(p.name, id);
    const missing = [], carryFor = new Map();
    if (s.trail && hs.trail) {
      const tr = JSON.parse(JSON.stringify(s.trail));
      for (const i of Object.keys(tr.taken || {})) {
        const [nm, kind] = tr.taken[i];
        if (kind < 0) { tr.taken[i] = [0, -1]; continue; }       // jau savākts
        if (byName.has(nm)) { const id = byName.get(nm); tr.taken[i] = [id, now + CARRY_MS]; carryFor.set(id, { i: +i, step: tr.step }); }
        else delete tr.taken[i];                                  // nesējs nav istabā — priekšmets atpakaļ vietā
      }
      Object.assign(hs.trail, tr);
      this.hostTrailSend();
    }
    for (const p of s.players) {
      if (!byName.has(p.name)) { missing.push(p.name); continue; }
      const id = byName.get(p.name), msg = { t: 'bugGo', p, carry: carryFor.get(id) || null };
      if (id === 0) this.onBugGo(msg); else this.net.sendTo(id, msg);
    }
    if (missing.length) toast('Nav istabā: ' + missing.join(', '), '', 4000);
  },
  onBugGo(m) {
    const p = m.p;
    if (!p || !ZONES[p.zone]) return;
    if (this.me.bus && this.leaveBus) this.leaveBus();
    if (this.me.ride && this.leaveRide) this.leaveRide();
    if (this.me.veh && this.exitVehicle) this.exitVehicle();
    if (this.me.inKart && this.exitKart) this.exitKart();
    if (this.me.carry && this.me.carry.trail != null && this.trailDropCarry) this.trailDropCarry(false);
    this.closePanelIfBug();
    this.teleport(p.zone, { x: p.x, z: p.z }, p.h);
    // kad zeme ielādēta — precīzs augstums un nesamais atpakaļ rokās
    const t0 = performance.now();
    const wait = () => {
      if (this.zoneBusy || this.zone !== p.zone) { if (performance.now() - t0 < 20000) setTimeout(wait, 200); return; }
      this.me.pos.set(p.x, Math.max(p.y, this.terr.groundAt(p.x, p.z)), p.z);
      this.me.heading = p.h; this.cam.yaw = p.h + Math.PI;
      if (m.carry && this.trailEvent) this.trailEvent({ k: 'take', by: this.myId, i: m.carry.i, step: m.carry.step });
      else if (p.carry === 't:zivs' && this.trailCatch) this.trailCatch({ x: p.x, z: p.z }); // 1.45.0: zivs kaķim (nav saimnieka sarakstā)
      toast('▶ Turpinām no kļūdas vietas', 'good');
    };
    setTimeout(wait, 500);
  },
  closePanelIfBug() { if (panelOpen() && this.bugPanelOpen()) closePanel(); },

  hostBug(from, m) {
    if (m.t !== 'bugSave') return false;
    this.hostBugSave(from, m);
    return true;
  },
  onBugMessage(m) {
    if (m.t === 'bugSaved') { this.onBugSaved(m.s); return true; }
    if (m.t === 'bugGo') { this.onBugGo(m); return true; }
    return false;
  },
};

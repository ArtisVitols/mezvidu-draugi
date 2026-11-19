// Spēlētāja progresa saglabāšana pārlūka atmiņā (localStorage)
import { FISH } from './data.js?v=1.29.0';
const PREFIX = 'mezvidi_save_v1_';
const LAST = 'mezvidi_last_profile';
const GAMES = 'mezvidi_games';      // zināmās spēles [{id, name, at, last, keep}] (1.28.0)
const LAST_GAME = 'mezvidi_last_game';
// 1.28.0: katrai spēlei (pasaulei) savs saglabājums. Spēle '' = „Pirmā spēle” — vecie saglabājumi bez sufiksa.
export const FIRST_GAME = { id: '', name: 'Pirmā spēle', at: 0, keep: {} };

export function defaultSave(name) {
  return {
    name,
    gid: '',          // kurā spēlē šis saglabājums (1.28.0; '' — pirmā spēle)
    animal: 'lacis',
    fur: '#8b5a2b',
    shirt: '#d23b3b',
    hat: null,
    ownedHats: [],
    kartColor: 'sarkana',
    ownedKarts: ['sarkana'],
    coins: 20,
    inv: { burkans_seed: 3, redisi_seed: 4 },
    gd: null,         // dārznieka līmenis {xp, land} (garden.js; vecajiem saglabājumiem aprēķina initGarden)
    farm: { t: {}, cl: [], v: 3 }, // sētas dārzs (0. sētas koordinātēs): uzartie lauciņi {"ix,iz": {c, at, w}} un nocirsto koku/akmeņu nr. (0–99)
    layout: 2,        // 2 — sēta centrā, mežs austrumos, trase rietumos (1.14.0)
    stats: {},
    quests: {},       // id -> true, kad saņemta balva
    stars: [],        // atrasto zvaigžņu indeksi
    bestLap: null,
    pos: null,
    zone: 'c',        // kurā zemē spēlētājs atrodas (c — sēta, e — mežs, w — trase, n — ziema, s — kāpas)
    zones: {},        // blakus zemju stāvoklis (uzdevumi tiks pievienoti vēlāk)
    playTime: 0,
    rod: false,
    pet: null, ownedPets: [],
    decor: [],        // dārzā noliktie rotājumi [{k, x, z, r}] 0. sētas koordinātēs (pārējie — somā inv.d_<k>)
    ownedDecor: [],   // kādus rotājumus kādreiz esi nopircis (uzdevumam)
    wear: {},         // uzvilktās drēbes {top, glasses, neck, back, feet}
    ownedClothes: [], // nopirktās drēbes
    fishBag: [],      // noķertās zivis [{k, cm, kg, v}]
    fishBest: {},     // lielākā zivs katram veidam (kg)
    vehs: null,       // saimniekam: kur stāv kopīgās mašīnas
    trophies: 0,
    places: [],       // atklātās īpašās vietas
    pieces: [],       // savāktie kartes gabali
    treasure: false,
    revealed: false,  // skatu tornī redzētas visas zvaigznes
    weekly: null,     // {w, c, done} — nedēļas kopīgā mērķa progress
  };
}

function key(name, gid = '') { return PREFIX + name.trim().toLowerCase() + (gid ? '@' + gid : ''); }

export function hasSave(name, gid = '') {
  try { return !!localStorage.getItem(key(name, gid)); } catch (e) { return false; }
}

export function loadSave(name, gid = '') {
  try {
    const raw = localStorage.getItem(key(name, gid));
    if (raw) {
      const data = JSON.parse(raw);
      const def = defaultSave(name);
      const merged = Object.assign(def, data);
      merged.gid = gid;
      merged.inv = Object.assign({}, data.inv || {});
      merged.stats = Object.assign({}, data.stats || {});
      // 1.14.0: zemes pārkārtotas — sāk sētā; vecā dārza augi atdoti atpakaļ kā sēklas
      if (data.layout !== 2) {
        merged.layout = 2; merged.zone = 'c'; merged.pos = null;
        for (const g of Array.isArray(data.garden) ? data.garden : []) if (g && g.crop) merged.inv[g.crop + '_seed'] = (merged.inv[g.crop + '_seed'] || 0) + 1;
        delete merged.garden;
      }
      // 1.21.0: zivis ar izmēru, drēbes, brīvi novietojami rotājumi
      if (!merged.wear || typeof merged.wear !== 'object') merged.wear = {};
      if (!Array.isArray(merged.ownedClothes)) merged.ownedClothes = [];
      if (!Array.isArray(merged.fishBag)) merged.fishBag = [];
      if (!merged.fishBest || typeof merged.fishBest !== 'object') merged.fishBest = {};
      for (const k of Object.keys(FISH)) {
        const n = merged.inv[k] | 0;
        if (n > 0 && !FISH[k].junk) { const d = FISH[k]; for (let i = 0; i < Math.min(n, 200); i++) merged.fishBag.push({ k, cm: Math.round((d.cm[0] + d.cm[1]) / 2.5), kg: Math.round((d.kg[0] + d.kg[1]) / 4 * 100) / 100, v: d.sell }); }
        delete merged.inv[k];
      }
      if (!Array.isArray(merged.decor)) merged.decor = [];
      merged.decor = merged.decor.filter((d) => d && (typeof d === 'string' || typeof d.k === 'string'));
      if (!merged.farm || typeof merged.farm.t !== 'object') merged.farm = { t: {}, cl: [] };
      if (!Array.isArray(merged.farm.cl)) merged.farm.cl = [];
      return { save: merged, isNew: false };
    }
  } catch (e) { console.warn('Neizdevās ielādēt', e); }
  const fresh = defaultSave(name); fresh.gid = gid;
  return { save: fresh, isNew: true };
}

// jaunā spēlē paturamās lietas no iepriekšējā saglabājuma (keep: {look, decor, coins})
export function carryOver(from, to, keep = {}) {
  for (const k of ['animal', 'fur', 'shirt']) to[k] = from[k];
  const cp = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  if (keep.look) {
    for (const k of ['hat', 'ownedHats', 'kartColor', 'ownedKarts', 'wear', 'ownedClothes', 'pet', 'ownedPets', 'rod']) to[k] = cp(from[k]);
  }
  if (keep.decor) {
    to.ownedDecor = cp(from.ownedDecor || []);
    to.decor = cp(from.decor || []);
    for (const [k, n] of Object.entries(from.inv || {})) if (k.startsWith('d_')) to.inv[k] = n;
  }
  if (keep.coins) to.coins = from.coins;
  return to;
}

export function writeSave(save) {
  try {
    localStorage.setItem(key(save.name, save.gid || ''), JSON.stringify(save));
    localStorage.setItem(LAST, save.name);
    return true;
  } catch (e) { console.warn('Neizdevās saglabāt', e); return false; }
}

export function lastProfileName() {
  try { return localStorage.getItem(LAST) || ''; } catch (e) { return ''; }
}

export function listProfiles() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        try { const n = JSON.parse(localStorage.getItem(k)).name; if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n); } catch (e) { /* ignore */ }
      }
    }
  } catch (e) { /* ignore */ }
  return out;
}

// ---------- spēļu saraksts ----------
export function listGames() {
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(GAMES) || '[]'); } catch (e) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  arr = arr.filter((g) => g && typeof g.id === 'string');
  if (!arr.some((g) => g.id === '')) arr.push({ ...FIRST_GAME });
  return arr.sort((a, b) => (b.last || 0) - (a.last || 0));
}

export function rememberGame(g) {
  try {
    const arr = listGames().filter((x) => x.id !== g.id);
    arr.unshift({ id: g.id, name: g.name, at: g.at || 0, keep: g.keep || {}, last: Date.now() });
    localStorage.setItem(GAMES, JSON.stringify(arr.slice(0, 12)));
    localStorage.setItem(LAST_GAME, g.id);
  } catch (e) { /* */ }
}

export function lastGameId() {
  try { return localStorage.getItem(LAST_GAME) || ''; } catch (e) { return ''; }
}

export function newGameId() {
  const chars = 'ABCDEFGHJKLMNPRSTUVZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

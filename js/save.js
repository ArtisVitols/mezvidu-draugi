// Spēlētāja progresa saglabāšana pārlūka atmiņā (localStorage)
import { FISH } from './data.js?v=1.21.0';
const PREFIX = 'mezvidi_save_v1_';
const LAST = 'mezvidi_last_profile';

export function defaultSave(name) {
  return {
    name,
    animal: 'lacis',
    fur: '#8b5a2b',
    shirt: '#d23b3b',
    hat: null,
    ownedHats: [],
    kartColor: 'sarkana',
    ownedKarts: ['sarkana'],
    coins: 20,
    inv: { burkans_seed: 3, auzas_seed: 4 },
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

function key(name) { return PREFIX + name.trim().toLowerCase(); }

export function loadSave(name) {
  try {
    const raw = localStorage.getItem(key(name));
    if (raw) {
      const data = JSON.parse(raw);
      const def = defaultSave(name);
      const merged = Object.assign(def, data);
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
  return { save: defaultSave(name), isNew: true };
}

export function writeSave(save) {
  try {
    localStorage.setItem(key(save.name), JSON.stringify(save));
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
        try { out.push(JSON.parse(localStorage.getItem(k)).name); } catch (e) { /* ignore */ }
      }
    }
  } catch (e) { /* ignore */ }
  return out;
}

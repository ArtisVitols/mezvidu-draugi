// Spēlētāja progresa saglabāšana pārlūka atmiņā (localStorage)
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
    inv: { burkans_seed: 3 },
    garden: Array.from({ length: 6 }, () => null), // {crop, plantedAt, watered}
    stats: {},
    quests: {},       // id -> true, kad saņemta balva
    stars: [],        // atrasto zvaigžņu indeksi
    bestLap: null,
    pos: null,
    playTime: 0,
    rod: false,
    pet: null, ownedPets: [],
    decor: [],        // pie dārza noliktie rotājumi
    ownedDecor: [],   // nopirktie rotājumi
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
      if (!Array.isArray(merged.garden) || merged.garden.length !== 6) merged.garden = def.garden;
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

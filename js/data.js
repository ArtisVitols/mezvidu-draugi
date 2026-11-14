// Spēles dati: dzīvnieki, preces, augi, uzdevumi

export const WORLD_SEED = 20261114; // pasaule vienmēr tā pati, lai dārzi un zvaigznes saglabājas

export const ANIMALS = [
  { id: 'lacis', name: 'Lācis', fur: '#8b5a2b' },
  { id: 'lapsa', name: 'Lapsa', fur: '#e8742a' },
  { id: 'zakis', name: 'Zaķis', fur: '#d9d2c5' },
  { id: 'kakis', name: 'Kaķis', fur: '#9a9a9a' },
  { id: 'cuka',  name: 'Cūciņa', fur: '#f2a7b5' },
  { id: 'suns',  name: 'Suns', fur: '#c89b5e' },
  { id: 'varde', name: 'Varde', fur: '#5fae4a' },
  { id: 'pile',  name: 'Pīle', fur: '#f5f0e0' },
];

export const FUR_COLORS = ['#8b5a2b', '#e8742a', '#d9d2c5', '#9a9a9a', '#f2a7b5', '#c89b5e', '#5fae4a', '#f5f0e0', '#3b3b3b', '#7a4fb5'];
export const SHIRT_COLORS = ['#d23b3b', '#2f6fd6', '#2fa84f', '#f2c12e', '#9b3bd2', '#f07b2a', '#ffffff', '#222222'];

// Augi: augšanas laiks sekundēs
export const CROPS = {
  burkans:   { name: 'Burkāns',   icon: '🥕', seedPrice: 5,  sell: 6,  yield: 2, grow: 60,  color: '#f07b1a' },
  kartupelis:{ name: 'Kartupelis',icon: '🥔', seedPrice: 8,  sell: 7,  yield: 3, grow: 90,  color: '#c9a25e' },
  tomats:    { name: 'Tomāts',    icon: '🍅', seedPrice: 12, sell: 10, yield: 3, grow: 120, color: '#e0302a' },
  zemene:    { name: 'Zemene',    icon: '🍓', seedPrice: 15, sell: 9,  yield: 4, grow: 150, color: '#ff3355' },
  kirbis:    { name: 'Ķirbis',    icon: '🎃', seedPrice: 25, sell: 65, yield: 1, grow: 240, color: '#f39a1e' },
};

export const MUSHROOMS = {
  baravika: { name: 'Baravika', sell: 7, cap: '#7a4a22', stem: '#efe3c8' },
  gailene:  { name: 'Gailene',  sell: 5, cap: '#f2a516', stem: '#f2b83a' },
  musmire:  { name: 'Mušmire',  sell: 0, cap: '#d81e1e', stem: '#ffffff', poison: true },
};

export const HATS = {
  salmu:   { name: 'Salmu cepure', price: 40 },
  vainags: { name: 'Ziedu vainags', price: 60 },
  ozols:   { name: 'Ozollapu vainags', price: 80 },
  cilindrs:{ name: 'Cilindrs', price: 100 },
  kronis:  { name: 'Kronis', price: 150 },
  kivere:  { name: 'Bruņinieka ķivere', price: 0, hidden: true }, // tikai no dārguma lādes
};

export const KART_COLORS = [
  { id: 'sarkana', name: 'Sarkana', color: '#e02a2a', price: 0 },
  { id: 'zila', name: 'Zila', color: '#2a6ae0', price: 30 },
  { id: 'zala', name: 'Zaļa', color: '#2ab04a', price: 30 },
  { id: 'zelta', name: 'Zelta', color: '#e8c020', price: 120 },
];

export const ICE_CREAM_PRICE = 10;

// Uzdevumi: stat - kuru statistiku skaita, need - cik vajag, reward - monētas
export const QUESTS = [
  { id: 'q1', text: 'Salasi 5 ēdamas sēnes', stat: 'mushrooms', need: 5, reward: 20 },
  { id: 'q2', text: 'Iestādi 3 dārzeņus', stat: 'planted', need: 3, reward: 15 },
  { id: 'q3', text: 'Novāc 3 dārzeņus', stat: 'harvested', need: 3, reward: 25 },
  { id: 'q4', text: 'Paglaudi 3 meža dzīvniekus', stat: 'petted', need: 3, reward: 15 },
  { id: 'q5', text: 'Atrodi 3 zelta zvaigznes', stat: 'stars', need: 3, reward: 30 },
  { id: 'q6', text: 'Nobrauc kartinga sacīkstes', stat: 'races', need: 1, reward: 30 },
  { id: 'q7', text: 'Pārdod kaut ko tirgū', stat: 'sold', need: 1, reward: 10 },
  { id: 'q8', text: 'Aplaisti drauga dārzu', stat: 'watered', need: 1, reward: 15 },
  { id: 'q9', text: 'Salasi 25 ēdamas sēnes', stat: 'mushrooms', need: 25, reward: 80 },
  { id: 'q10', text: 'Novāc 15 dārzeņus', stat: 'harvested', need: 15, reward: 100 },
  { id: 'q11', text: 'Atrodi visas 15 zvaigznes', stat: 'stars', need: 15, reward: 200 },
  { id: 'q12', text: 'Uzvari kartinga sacīkstēs', stat: 'wins', need: 1, reward: 60 },
  { id: 'q13', text: 'Noķer 5 zivis', stat: 'fish', need: 5, reward: 25 },
  { id: 'q14', text: 'Salasi 10 saujas ogu', stat: 'berries', need: 10, reward: 20 },
  { id: 'q15', text: 'Iegādājies mājdzīvnieku', stat: 'pets', need: 1, reward: 20 },
  { id: 'q16', text: 'Izrotā dārzu ar 3 rotājumiem', stat: 'decor', need: 3, reward: 30 },
  { id: 'q17', text: 'Uzkāp skatu tornī', stat: 'tower', need: 1, reward: 15 },
  { id: 'q18', text: 'Izcep 5 sēnes pie ugunskura', stat: 'cooked', need: 5, reward: 20 },
  { id: 'q19', text: 'Atklāj visas 5 īpašās vietas', stat: 'places', need: 5, reward: 50 },
  { id: 'q20', text: 'Atrodi apslēpto dārgumu', stat: 'treasure', need: 1, reward: 100 },
  { id: 'q21', text: 'Uzvari ķeramajā vai paslēpēs', stat: 'mgwins', need: 1, reward: 40 },
  { id: 'q22', text: 'Noķer zelta zivtiņu', stat: 'goldfish', need: 1, reward: 50 },
];

// ---------- Makšķerēšana ----------
export const ROD_PRICE = 25;
// w — iespējamība, pier — iespējamība no laipas (tur labāk ķeras)
export const FISH = {
  rauda:   { name: 'Rauda', icon: '🐟', sell: 4, w: 45, pier: 35 },
  asaris:  { name: 'Asaris', icon: '🐠', sell: 6, w: 30, pier: 30 },
  lidaka:  { name: 'Līdaka', icon: '🐊', sell: 12, w: 15, pier: 22 },
  zelta:   { name: 'Zelta zivtiņa', icon: '✨', sell: 40, w: 3, pier: 8 },
  zabaks:  { name: 'Vecs zābaks', icon: '👢', sell: 0, w: 7, pier: 5, junk: true },
};

// ---------- Ogas ----------
export const BERRIES = {
  mellene:  { name: 'Mellenes', icon: '🫐', sell: 4, color: '#2a3a7a' },
  avene:    { name: 'Avenes', icon: '🍇', sell: 5, color: '#d0283a' },
  dzervene: { name: 'Dzērvenes', icon: '🔴', sell: 7, color: '#b0101e' },
};
export const COOKED = { name: 'Cepta sēne', icon: '🍢', sell: 12 };

// ---------- Mājdzīvnieki (seko saimniekam) ----------
export const PETS = {
  ezitis:   { name: 'Ezītis', npc: 'ezis', scale: 0.8, price: 60 },
  zakitis:  { name: 'Zaķēns', npc: 'zakis', scale: 0.6, price: 80 },
  vaverite: { name: 'Vāverīte', npc: 'vavere', scale: 1.0, price: 90 },
  sivens:   { name: 'Mežacūciņa', npc: 'mezacuka', scale: 0.45, price: 120 },
  stirnens: { name: 'Stirnēns', npc: 'stirna', scale: 0.5, price: 150 },
};

// ---------- Dārza rotājumi (katram sava vieta pie dārza) ----------
export const DECOR = {
  pukupods:  { name: 'Puķu pods', icon: '🪴', price: 15 },
  rukis:     { name: 'Dārza rūķis', icon: '🧙', price: 30 },
  burits:    { name: 'Putnu būrītis', icon: '🐦', price: 25 },
  solins:    { name: 'Soliņš', icon: '🪑', price: 35 },
  laterna:   { name: 'Laterna', icon: '🏮', price: 40 },
  biedeklis: { name: 'Putnubiedēklis', icon: '🎃', price: 45 },
  karogs:    { name: 'Latvijas karogs', icon: '🚩', price: 50 },
  struklaka: { name: 'Strūklaka', icon: '⛲', price: 80 },
};

// ---------- Īpašās vietas ----------
export const PLACES = {
  tornis:  { name: 'Skatu tornis', icon: '🗼' },
  nometne: { name: 'Ugunskura vieta', icon: '⛺' },
  purvs:   { name: 'Purvs', icon: '🐸' },
  drupas:  { name: 'Pilsdrupas', icon: '🏰' },
  laipa:   { name: 'Makšķernieku laipa', icon: '🎣' },
};
export const MAP_PIECES = ['nometne', 'tornis', 'purvs']; // kartes gabali dārguma lādei pilsdrupās

// ---------- Nedēļas kopīgais mērķis (mainās katru pirmdienu) ----------
export const WEEKLY = [
  { stat: 'mushrooms', icon: '🍄', text: 'Salasiet kopā {n} ēdamas sēnes', n: 60 },
  { stat: 'fish', icon: '🐟', text: 'Noķeriet kopā {n} zivis', n: 25 },
  { stat: 'berries', icon: '🫐', text: 'Salasiet kopā {n} saujas ogu', n: 50 },
  { stat: 'harvested', icon: '🥕', text: 'Novāciet kopā {n} dārzeņus', n: 40 },
  { stat: 'petted', icon: '🦌', text: 'Paglaudiet kopā {n} meža dzīvniekus', n: 40 },
  { stat: 'races', icon: '🏎️', text: 'Nobrauciet kopā {n} sacīkstes', n: 6 },
];
export const WEEKLY_REWARD = 60;
export function weekNumber(ms) { return Math.floor((ms / 86400000 + 3) / 7); } // nedēļas sākas pirmdienā
export function weeklyGoal(week) { return WEEKLY[((week % WEEKLY.length) + WEEKLY.length) % WEEKLY.length]; }

export const NPC_TYPES = {
  stirna:   { name: 'Stirna' },
  zakis:    { name: 'Zaķis' },
  ezis:     { name: 'Ezis' },
  starkis:  { name: 'Stārķis' },
  mezacuka: { name: 'Mežacūka' },
  vavere:   { name: 'Vāvere' },
};

export const EMOTES = ['Sveiki! 👋', 'Nāc šurp!', 'Paldies! 😊', 'Skrienam! 🏃', 'Ha-ha! 😄', '❤️'];

export const RACE_LAPS = 3;

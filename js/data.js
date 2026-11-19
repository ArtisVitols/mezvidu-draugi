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
// Lauka kultūras. grow — augšanas laiks sekundēs (pulkstenis iet arī tad, kad spēle aizvērta),
// sp — attālums starp augiem (m; lauciņš ir 2,5 m, tāpēc sp dala 2,5 bez atlikuma — blakus lauciņi ar to pašu
// kultūru veido vienu vienmērīgu lauku), yield — raža no viena lauciņa
// 1.27.0: līdzsvars — ilgāk augošas kultūras dod vairāk peļņas (≈10 · minūtes^0,75 vienā lauciņā) un vairāk ⭐
export const CROPS = {
  burkans:   { name: 'Burkāns',    icon: '🥕', seedPrice: 4,  sell: 4,  yield: 4, grow: 60,   sp: 0.5,   color: '#f07b1a' },
  auzas:     { name: 'Auzas',      icon: '🌾', seedPrice: 9,  sell: 5,  yield: 6, grow: 180,  sp: 0.4167, color: '#d9c27a' },
  kartupelis:{ name: 'Kartupelis', icon: '🥔', seedPrice: 13,  sell: 9,  yield: 5, grow: 300,  sp: 0.625, color: '#c9a25e' },
  kviesi:    { name: 'Kvieši',     icon: '🌾', seedPrice: 22, sell: 9,  yield: 9, grow: 600,  sp: 0.4167, color: '#e2b84a' },
  tomats:    { name: 'Tomāts',     icon: '🍅', seedPrice: 30, sell: 18,  yield: 6, grow: 900,  sp: 0.833, color: '#e0302a' },
  zemene:    { name: 'Zemene',     icon: '🍓', seedPrice: 38, sell: 17,  yield: 8, grow: 1200, sp: 0.5,   color: '#ff3355' },
  kaposts:   { name: 'Kāposts',    icon: '🥬', seedPrice: 51, sell: 45, yield: 4, grow: 1800, sp: 0.833, color: '#8fc06a' },
  saulgrieze:{ name: 'Saulgrieze', icon: '🌻', seedPrice: 69, sell: 40, yield: 6, grow: 2700, sp: 0.625, color: '#f2c12e' },
  kirbis:    { name: 'Ķirbis',     icon: '🎃', seedPrice: 86, sell: 151, yield: 2, grow: 3600, sp: 1.25,  color: '#f39a1e' },
  // 1.21.0 — jaunas kultūras (tikai beigās: saglabājumā kultūra ir indekss šajā sarakstā)
  redisi:    { name: 'Redīsi',     icon: '🔴', seedPrice: 3,  sell: 2,  yield: 6, grow: 45,    sp: 0.4167, color: '#e0306a' },
  salati:    { name: 'Salāti',     icon: '🥬', seedPrice: 11,  sell: 8,  yield: 5, grow: 240,   sp: 0.625, color: '#9ad46a' },
  sipols:    { name: 'Sīpols',     icon: '🧅', seedPrice: 19, sell: 10,  yield: 7, grow: 480,   sp: 0.4167, color: '#d9a85a' },
  zirni:     { name: 'Zirņi',      icon: '🫛', seedPrice: 26, sell: 15,  yield: 6, grow: 720,   sp: 0.5,   color: '#7ac04a' },
  biete:     { name: 'Biete',      icon: '🟣', seedPrice: 45, sell: 26,  yield: 6, grow: 1500,  sp: 0.5,   color: '#8a1a3a' },
  gurkis:    { name: 'Gurķis',     icon: '🥒', seedPrice: 64, sell: 28,  yield: 8, grow: 2400,  sp: 0.833, color: '#3a8a2a' },
  kukuruza:  { name: 'Kukurūza',   icon: '🌽', seedPrice: 117, sell: 68,  yield: 6, grow: 5400,  sp: 0.625, color: '#f2d040' },
  paprika:   { name: 'Paprika',    icon: '🫑', seedPrice: 145, sell: 102, yield: 5, grow: 7200,  sp: 0.833, color: '#e8402a' },
  arbuzs:    { name: 'Arbūzs',     icon: '🍉', seedPrice: 197, sell: 344, yield: 2, grow: 10800, sp: 1.25, color: '#2f7a3a' },
  lavanda:   { name: 'Lavanda',    icon: '💜', seedPrice: 244, sell: 171, yield: 5, grow: 14400, sp: 0.625, color: '#9a6ad0' },
  // 1.35.0 — vēl kultūras (tikai beigās!)
  spinati:   { name: 'Spināti',    icon: '🥬', seedPrice: 6,   sell: 4,   yield: 6, grow: 120,   sp: 0.5,   color: '#2f7a2a' },
  kiploks:   { name: 'Ķiploks',    icon: '🧄', seedPrice: 16,  sell: 8,   yield: 6, grow: 420,   sp: 0.4167, color: '#f2ece0' },
  tulpe:     { name: 'Tulpe',      icon: '🌷', seedPrice: 28,  sell: 16,  yield: 5, grow: 800,   sp: 0.4167, color: '#f0406a' },
  pupas:     { name: 'Pupas',      icon: '🫘', seedPrice: 34,  sell: 12,  yield: 9, grow: 1000,  sp: 0.5,   color: '#7ab04a' },
  brokolis:  { name: 'Brokolis',   icon: '🥦', seedPrice: 56,  sell: 40,  yield: 4, grow: 2000,  sp: 0.833, color: '#3a7a3a' },
  kabacis:   { name: 'Kabacis',    icon: '🥒', seedPrice: 75,  sell: 34,  yield: 7, grow: 3000,  sp: 0.833, color: '#e8c83a' },
  rabarbers: { name: 'Rabarbers',  icon: '🌿', seedPrice: 100, sell: 50,  yield: 6, grow: 4500,  sp: 1.25,  color: '#c8304a' },
  melone:    { name: 'Melone',     icon: '🍈', seedPrice: 170, sell: 250, yield: 2, grow: 9000,  sp: 1.25,  color: '#e8d070' },
  // 1.36.0 — 13.–24. līmeņa kultūras (tikai beigās!)
  spargelis:   { name: 'Sparģelis',      icon: '🌱', seedPrice: 260, sell: 140, yield: 7,  grow: 12600, sp: 0.4167, color: '#8ab85a' },
  baklazans:   { name: 'Baklažāns',      icon: '🍆', seedPrice: 280, sell: 165, yield: 6,  grow: 13500, sp: 0.833, color: '#4a2060' },
  roze:        { name: 'Roze',           icon: '🌹', seedPrice: 300, sell: 120, yield: 9,  grow: 14400, sp: 0.625, color: '#d81a3a' },
  ananass:     { name: 'Ananāss',        icon: '🍍', seedPrice: 340, sell: 450, yield: 2,  grow: 16200, sp: 1.25,  color: '#e0a020' },
  zemesrieksti:{ name: 'Zemesrieksti',   icon: '🥜', seedPrice: 360, sell: 75,  yield: 14, grow: 16200, sp: 0.5,   color: '#c8945a' },
  cili:        { name: 'Čili pipari',    icon: '🌶️', seedPrice: 380, sell: 95,  yield: 12, grow: 18000, sp: 0.625, color: '#e01a10' },
  magone:      { name: 'Magone',         icon: '🌺', seedPrice: 400, sell: 115, yield: 11, grow: 18000, sp: 0.4167, color: '#e8281e' },
  vinogas:     { name: 'Vīnogas',        icon: '🍇', seedPrice: 430, sell: 80,  yield: 18, grow: 19800, sp: 0.833, color: '#6a2a8a' },
  zeltaburkans:{ name: 'Zelta burkāns',  icon: '✨', seedPrice: 480, sell: 320, yield: 5,  grow: 21600, sp: 0.5,   color: '#ffc820' },
  milzkirbis:  { name: 'Milzu ķirbis',   icon: '🎃', seedPrice: 520, sell: 1400, yield: 1, grow: 25200, sp: 2.5,   color: '#f07010' },
  varaviksne:  { name: 'Varavīksnes zieds', icon: '🌈', seedPrice: 560, sell: 210, yield: 10, grow: 25200, sp: 0.5, color: '#ff50b0' },
  zvaigzne:    { name: 'Zvaigžņu auglis', icon: '⭐', seedPrice: 650, sell: 480, yield: 6,  grow: 28800, sp: 0.833, color: '#ffe040' },
};

// ---------- Augļu koki (stāda no stāda uz uzarta lauciņa; izaug un tad ik pa laikam dod augļus) ----------
// grow — līdz pieaugušam kokam (s), every — cik bieži nogatavojas augļi (s), yield — augļi vienā reizē
export const TREES = {
  abele:    { name: 'Ābele',    price: 80,  grow: 7200,  every: 1800, yield: 8,  fruit: 'abols',     leaf: '#4a8a30', fcol: '#d8302a' },
  bumbiere: { name: 'Bumbiere', price: 100, grow: 9000,  every: 2100, yield: 7,  fruit: 'bumbieris', leaf: '#3f7f2c', fcol: '#c8c040' },
  kirsis:   { name: 'Ķirsis',   price: 120, grow: 10800, every: 2400, yield: 12, fruit: 'kirsi',     leaf: '#3d7a2a', fcol: '#a0101e' },
  plume:    { name: 'Plūme',    price: 110, grow: 9000,  every: 2100, yield: 10, fruit: 'plumes',    leaf: '#46802e', fcol: '#4a2a6a' },
  // 1.35.0 (tikai beigās!)
  aprikoze: { name: 'Aprikoze', price: 130, grow: 10800, every: 2400, yield: 9,  fruit: 'aprikozes', leaf: '#4f8a34', fcol: '#f2a23a' },
  persiks:  { name: 'Persiks',  price: 150, grow: 12600, every: 2700, yield: 9,  fruit: 'persiki',   leaf: '#3f7a2a', fcol: '#f28a6a' },
  // 1.36.0
  valrieksts: { name: 'Valrieksts',   price: 180, grow: 14400, every: 3000, yield: 14, fruit: 'rieksti',   leaf: '#3a6a2a', fcol: '#9a7a4a' },
  citronkoks: { name: 'Citronkoks',   price: 210, grow: 16200, every: 3000, yield: 10, fruit: 'citroni',   leaf: '#2f6a26', fcol: '#f6e030' },
  apelsinkoks:{ name: 'Apelsīnkoks',  price: 240, grow: 18000, every: 3300, yield: 10, fruit: 'apelsini',  leaf: '#2f6a26', fcol: '#f68a10' },
  zeltabele:  { name: 'Zelta ābele',  price: 400, grow: 21600, every: 3600, yield: 8,  fruit: 'zeltaaboli', leaf: '#5a9a2a', fcol: '#ffd020' },
};
export const FRUITS = {
  abols:     { name: 'Āboli',     sell: 6 },
  bumbieris: { name: 'Bumbieri',  sell: 8 },
  kirsi:     { name: 'Ķirši',     sell: 5 },
  plumes:    { name: 'Plūmes',    sell: 6 },
  aprikozes: { name: 'Aprikozes', sell: 8 },
  persiki:   { name: 'Persiki',   sell: 9 },
  rieksti:   { name: 'Rieksti',   sell: 7 },
  citroni:   { name: 'Citroni',   sell: 11 },
  apelsini:  { name: 'Apelsīni',  sell: 12 },
  zeltaaboli:{ name: 'Zelta āboli', sell: 30 },
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
  nagene:  { name: 'Beisbola cepure', price: 30 },
  berete:  { name: 'Berete', price: 35 },
  kovbojs: { name: 'Kovboja cepure', price: 70 },
  pirats:  { name: 'Pirāta cepure', price: 90 },
};

// ---------- Drēbes (pērk pie Pūces Paulas, uzvelk somā). slot: krekls, brilles, kakls, mugura, kājas ----------
export const SLOTS = [
  { id: 'hat', name: 'Cepure' }, { id: 'glasses', name: 'Brilles' }, { id: 'neck', name: 'Kakls' },
  { id: 'top', name: 'Krekls' }, { id: 'back', name: 'Mugura' }, { id: 'feet', name: 'Apavi' },
];
export const CLOTHES = {
  svitrains:   { slot: 'top', name: 'Svītrains krekls', price: 25 },
  rutains:     { slot: 'top', name: 'Rūtains krekls', price: 30 },
  futbola:     { slot: 'top', name: 'Futbola krekls', price: 35 },
  zvaigznes:   { slot: 'top', name: 'Krekls ar zvaigznēm', price: 45 },
  latvija:     { slot: 'top', name: 'Latvijas krekls', price: 50 },
  saulesbrilles: { slot: 'glasses', name: 'Saulesbrilles', price: 30 },
  apalas:      { slot: 'glasses', name: 'Apaļās brilles', price: 25 },
  sirds:       { slot: 'glasses', name: 'Sirsniņbrilles', price: 35 },
  taurenitis:  { slot: 'neck', name: 'Tauriņš', price: 20 },
  kaklasaite:  { slot: 'neck', name: 'Kaklasaite', price: 25 },
  krelles:     { slot: 'neck', name: 'Pērļu krelles', price: 40 },
  medala:      { slot: 'neck', name: 'Zelta medaļa', price: 60 },
  mugursoma:   { slot: 'back', name: 'Mugursoma', price: 45 },
  apmetnis:    { slot: 'back', name: 'Varoņa apmetnis', price: 70 },
  sparni:      { slot: 'back', name: 'Tauriņa spārni', price: 90 },
  zabaki:      { slot: 'feet', name: 'Gumijas zābaki', price: 35 },
  kedas:       { slot: 'feet', name: 'Kedas', price: 40 },
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
  { id: 'q2', text: 'Iesēj 3 lauciņus', stat: 'planted', need: 3, reward: 15 },
  { id: 'q3', text: 'Novāc 3 lauciņu ražu', stat: 'harvested', need: 3, reward: 25 },
  { id: 'q4', text: 'Paglaudi 3 meža dzīvniekus', stat: 'petted', need: 3, reward: 15 },
  { id: 'q5', text: 'Atrodi 3 zelta zvaigznes', stat: 'stars', need: 3, reward: 30 },
  { id: 'q6', text: 'Nobrauc kartinga sacīkstes', stat: 'races', need: 1, reward: 30 },
  { id: 'q7', text: 'Pārdod kaut ko tirgū', stat: 'sold', need: 1, reward: 10 },
  { id: 'q8', text: 'Aplaisti drauga lauku', stat: 'watered', need: 1, reward: 15 },
  { id: 'q9', text: 'Salasi 25 ēdamas sēnes', stat: 'mushrooms', need: 25, reward: 80 },
  { id: 'q10', text: 'Novāc 15 lauciņu ražu', stat: 'harvested', need: 15, reward: 100 },
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
  { id: 'q23', text: 'Nobrauc ar slēpēm no Ziemas kalna 3 reizes', stat: 'skiRuns', need: 3, reward: 30 },
  { id: 'q24', text: 'Trāpi ar sniega piku 15 reizes', stat: 'snowHits', need: 15, reward: 25 },
  { id: 'q25', text: 'Paglaudi ziemeļbriedi', stat: 'reindeer', need: 1, reward: 15 },
  { id: 'q26', text: 'Aizbrauc ar mašīnu uz citu zemi', stat: 'carTrips', need: 1, reward: 25 },
  { id: 'q27', text: 'Pabrauc ar sniega motociklu', stat: 'sledRides', need: 1, reward: 15 },
  { id: 'q28', text: 'Notīri savu lauku: nocērt vai novāc 5 kokus/akmeņus', stat: 'cleared', need: 5, reward: 20 },
  { id: 'q29', text: 'Uzar 12 lauciņus', stat: 'plowed', need: 12, reward: 25 },
  { id: 'q30', text: 'Novāc 30 lauciņu ražu', stat: 'harvested', need: 30, reward: 120 },
];

// ---------- Makšķerēšana ----------
export const ROD_PRICE = 25;
// w — iespējamība, pier — iespējamība no laipas (tur labāk ķeras)
// sell — vidēja izmēra zivs cena; lielāka zivs maksā vairāk. cm/kg — mazākā un lielākā zivs
export const FISH = {
  rauda:   { name: 'Rauda', icon: '🐟', sell: 4, w: 42, pier: 32, cm: [12, 32], kg: [0.05, 0.6] },
  asaris:  { name: 'Asaris', icon: '🐠', sell: 6, w: 28, pier: 27, cm: [12, 42], kg: [0.08, 1.4] },
  lidaka:  { name: 'Līdaka', icon: '🐟', sell: 12, w: 13, pier: 18, cm: [40, 115], kg: [0.6, 11] },
  karpa:   { name: 'Karpa', icon: '🐟', sell: 14, w: 7, pier: 9, cm: [30, 85], kg: [0.8, 12] },
  sams:    { name: 'Sams', icon: '🐟', sell: 30, w: 1.5, pier: 4, cm: [80, 190], kg: [5, 45] },
  zelta:   { name: 'Zelta zivtiņa', icon: '✨', sell: 40, w: 2.5, pier: 6, cm: [6, 15], kg: [0.03, 0.18] },
  zabaks:  { name: 'Vecs zābaks', icon: '👢', sell: 0, w: 6, pier: 4, junk: true },
};
// noķertās zivs izmērs: t 0..1 (biežāk mazas), lielāka — dārgāka
export function rollFish(kind, rnd = Math.random) {
  const d = FISH[kind];
  const t = Math.pow(rnd(), 1.7);
  const cm = Math.round(d.cm[0] + (d.cm[1] - d.cm[0]) * t);
  const kg = Math.round((d.kg[0] + (d.kg[1] - d.kg[0]) * Math.pow(t, 2.4)) * 100) / 100;
  const v = Math.max(1, Math.round(d.sell * (0.45 + 2.3 * Math.pow(t, 1.4))));
  return { k: kind, cm, kg, v };
}

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
  sene:      { name: 'Dārza sēne', icon: '🍄', price: 55 },
  vejdzirnavas: { name: 'Mazās vējdzirnavas', icon: '🌬️', price: 65 },
  ziedudobe: { name: 'Ziedu dobe', icon: '🌷', price: 40 },
};

// ---------- Vēlēšanās aka meža ciemata vidū: iemet 5🪙 — dažreiz kaut kas izkrīt ----------
export const WISH_PRICE = 5;

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
  briedis:  { name: 'Ziemeļbriedis' },
  zakis:    { name: 'Zaķis' },
  ezis:     { name: 'Ezis' },
  starkis:  { name: 'Stārķis' },
  mezacuka: { name: 'Mežacūka' },
  vavere:   { name: 'Vāvere' },
};

export const EMOTES = ['Sveiki! 👋', 'Nāc šurp!', 'Paldies! 😊', 'Skrienam! 🏃', 'Ha-ha! 😄', '❤️'];

export const RACE_LAPS = 2;

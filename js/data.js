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
];

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

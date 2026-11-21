import * as THREE from 'three';
import { ANIMALS, FUR_COLORS, SHIRT_COLORS } from './data.js?v=1.40.0';
import { loadSave, writeSave, lastProfileName, listProfiles, hasSave, carryOver, listGames, rememberGame, lastGameId, newGameId, FIRST_GAME } from './save.js?v=1.40.0';
import { buildAnimal } from './characters.js?v=1.40.0';
import { Net, randomCode } from './net.js?v=1.40.0';
import { Game } from './game.js?v=1.40.0';
import { $, initAudio, toast } from './ui.js?v=1.40.0';
import { VERSION, BUILD_DATE } from './version.js?v=1.40.0';

const EMOJI = { lacis: '🐻', lapsa: '🦊', zakis: '🐰', kakis: '🐱', cuka: '🐷', suns: '🐶', varde: '🐸', pile: '🦆' };
let save = null;
let isNew = false;

// iOS: neļaujam tuvināt ar diviem pirkstiem
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

const params = new URLSearchParams(location.search);
const urlCode = (params.get('istaba') || '').toUpperCase().slice(0, 5);

function show(id) {
  for (const s of ['scr-name', 'scr-char', 'scr-room']) $(s).classList.toggle('hidden', s !== id);
  if (id === 'scr-char') startPreview(); else stopPreview();
}

$('version').textContent = `Versija ${VERSION} · ${BUILD_DATE}`;

// Ja serverī jau ir jaunāka versija (telefons rāda vecu kešu), pārlādējam ar jaunu adresi
fetch(`js/version.js?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).then((t) => {
  const m = t.match(/VERSION = '([^']+)'/);
  if (!m || m[1] === VERSION) return;
  let tried = '';
  try { tried = sessionStorage.getItem('mezvidi_reload') || ''; sessionStorage.setItem('mezvidi_reload', m[1]); } catch (e) { /* */ }
  if (tried === m[1]) return;
  const q = new URLSearchParams(location.search);
  q.set('v', m[1]);
  location.replace(location.pathname + '?' + q.toString());
}).catch(() => {});

// ---------- 1. vārds ----------
$('in-name').value = lastProfileName();
const profs = listProfiles();
if (profs.length) {
  const box = $('profiles');
  profs.slice(0, 6).forEach((n) => {
    const b = document.createElement('button');
    b.textContent = '👤 ' + n;
    b.onclick = () => { $('in-name').value = n; };
    box.append(b);
  });
}
$('btn-name-ok').onclick = () => {
  initAudio();
  const name = $('in-name').value.trim().replace(/\s+/g, ' ');
  if (name.length < 2) { $('in-name').focus(); $('in-name').placeholder = 'Vismaz 2 burti!'; $('in-name').value = ''; return; }
  // ielādējam pēdējās spēlētās spēles saglabājumu (ja šim vārdam tāds ir), citādi pirmās spēles
  const lg = lastGameId();
  ({ save, isNew } = loadSave(name, lg && hasSave(name, lg) ? lg : ''));
  save.name = name;
  buildCharScreen();
  show('scr-char');
};
$('in-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-name-ok').click(); });

// ---------- 2. tēls ----------
function buildCharScreen() {
  const grid = $('animal-grid');
  grid.innerHTML = '';
  ANIMALS.forEach((a) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="e">${EMOJI[a.id]}</span>${a.name}`;
    b.className = save.animal === a.id ? 'sel' : '';
    b.onclick = () => {
      if (save.animal !== a.id) save.fur = a.fur;
      save.animal = a.id;
      buildCharScreen();
      refreshPreview();
    };
    grid.append(b);
  });
  const sw = (boxId, colors, key) => {
    const box = $(boxId);
    box.innerHTML = '';
    colors.forEach((c) => {
      const b = document.createElement('button');
      b.style.background = c;
      b.className = save[key] === c ? 'sel' : '';
      b.onclick = () => { save[key] = c; buildCharScreen(); refreshPreview(); };
      box.append(b);
    });
  };
  sw('fur-sw', FUR_COLORS, 'fur');
  sw('shirt-sw', SHIRT_COLORS, 'shirt');
}
$('btn-char-back').onclick = () => show('scr-name');
$('btn-char-ok').onclick = () => {
  writeSave(save);
  $('hello-name').textContent = save.name;
  $('save-info').textContent = isNew
    ? 'Jauns spēlētājs! Tev ir 20🪙 un 3 burkānu sēklas.'
    : `Tavs progress ielādēts: 🪙 ${save.coins} · ⭐ ${save.stars.length}/15`;
  if (urlCode) $('in-code').value = urlCode;
  buildGamePick();
  show('scr-room');
};

// ---------- spēles (pasaules) izvēle saimniekam (1.28.0) ----------
const gameLabel = (g) => (g.id ? `${g.name} · #${g.id}` : g.name);
function buildGamePick() {
  const sel = $('sel-game');
  sel.innerHTML = '';
  const games = listGames();
  const want = save.gid || '';
  for (const g of games) {
    const o = document.createElement('option');
    o.value = g.id; o.textContent = '▶ ' + gameLabel(g);
    if (g.id === want) o.selected = true;
    sel.append(o);
  }
  const o = document.createElement('option');
  o.value = '__new'; o.textContent = '🆕 Jauna spēle visiem…';
  sel.append(o);
  sel.onchange = gamePickChanged;
  gamePickChanged();
}
function gamePickChanged() {
  const v = $('sel-game').value, nw = v === '__new';
  $('new-game').classList.toggle('hidden', !nw);
  $('btn-host').textContent = nw ? '🆕 Sākt jaunu spēli visiem' : '🏠 Izveidot istabu';
  if (nw) {
    if (!$('in-gname').value) $('in-gname').placeholder = `Spēle ${new Date().toLocaleDateString('lv-LV')}`;
    return;
  }
  if (v === (save.gid || '') && !isNew) { $('save-info').textContent = `Tavs progress ielādēts: 🪙 ${save.coins} · ⭐ ${save.stars.length}/15`; return; }
  if (hasSave(save.name, v)) {
    const s = loadSave(save.name, v).save;
    $('save-info').textContent = `Šajā spēlē tev ir: 🪙 ${s.coins} · ⭐ ${s.stars.length}/15`;
  } else $('save-info').textContent = 'Šajā spēlē tu sāksi no sākuma.';
}
// saimnieka izvēlētā spēle
function pickedGame() {
  const v = $('sel-game').value;
  if (v !== '__new') return listGames().find((g) => g.id === v) || { ...FIRST_GAME };
  const ids = new Set(listGames().map((g) => g.id));
  let id = newGameId(); while (ids.has(id)) id = newGameId();
  const name = $('in-gname').value.trim().slice(0, 24) || $('in-gname').placeholder;
  return { id, name, at: Date.now(), keep: { look: $('keep-look').checked, decor: $('keep-decor').checked, coins: $('keep-coins').checked } };
}
// pārslēdz `save` uz spēles g saglabājumu; true — ja šajā spēlē sāk no jauna
function enterGame(g) {
  rememberGame(g);
  const prev = save;
  if ((prev.gid || '') === g.id) { writeSave(prev); return isNew && !!g.id; }
  let fresh = false;
  if (hasSave(prev.name, g.id)) {
    save = loadSave(prev.name, g.id).save;
    for (const k of ['animal', 'fur', 'shirt']) save[k] = prev[k]; // izskats — kā tikko izvēlēts
  } else {
    save = carryOver(prev, loadSave(prev.name, g.id).save, g.keep || {});
    fresh = true;
  }
  save.name = prev.name; save.gid = g.id;
  isNew = false;
  writeSave(save);
  return fresh;
}
// klients pajautā saimniekam, kura spēle (vecs saimnieks neatbild → pirmā spēle)
function askGame(net) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { net.onMessage = () => {}; resolve({ ...FIRST_GAME }); }, 4000);
    net.onMessage = (m) => {
      if (m.t !== 'gi' || !m.g || typeof m.g.id !== 'string') return;
      clearTimeout(t); net.onMessage = () => {};
      resolve({ id: m.g.id.slice(0, 8), name: String(m.g.name || 'Spēle').slice(0, 24), at: m.g.at || 0, keep: m.g.keep || {} });
    };
    net.toHost({ t: 'gq' });
  });
}

// mazs 3D priekšskatījums
let pv = null;
function startPreview() {
  if (pv) return;
  const canvas = $('preview');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 180;
  r.setSize(w, h, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#88aa66', 1.8));
  const d = new THREE.DirectionalLight('#ffffff', 1.4); d.position.set(2, 4, 3); scene.add(d);
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 50);
  cam.position.set(0, 1.1, 3.6); cam.lookAt(0, 0.85, 0);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
  pv = { r, scene, cam, av: null, t: 0, run: true };
  refreshPreview();
  const loop = () => {
    if (!pv || !pv.run) return;
    requestAnimationFrame(loop);
    pv.t += 0.016;
    if (pv.av) {
      pv.av.root.rotation.y = Math.sin(pv.t * 0.8) * 0.8;
      pv.av.animate(0.016, Math.floor(pv.t / 3) % 2 ? 'walk' : 'wave', 3);
    }
    r.render(scene, cam);
  };
  loop();
}
function refreshPreview() {
  if (!pv) return;
  if (pv.av) pv.scene.remove(pv.av.root);
  pv.av = buildAnimal(save);
  pv.scene.add(pv.av.root);
}
function stopPreview() {
  if (!pv) return;
  pv.run = false;
  pv.r.dispose();
  pv = null;
}

// ---------- 3. istaba ----------
const status = (t, ok = false) => { $('room-status').textContent = t; $('room-status').className = ok ? 'ok' : ''; };
const setBusy = (b) => { for (const id of ['btn-host', 'btn-join', 'btn-solo']) $(id).disabled = b; };
$('btn-room-back').onclick = () => show('scr-char');

async function launch(net, code, game, fresh) {
  $('loading').classList.remove('hidden');
  $('loading').classList.add('busy');
  const progress = (f, t) => {
    const pc = Math.round(Math.max(0, Math.min(1, f)) * 100);
    $('loading-text').textContent = t;
    $('loading-bar').style.width = pc + '%';
    $('loading-pc').textContent = pc + '%';
  };
  progress(0, 'Veidojam pasauli…');
  await new Promise((r) => setTimeout(r, 50));
  try {
    const g = new Game({ save, net, roomCode: code, game });
    await g.init(progress);
    $('menu').classList.add('hidden');
    $('loading').classList.add('hidden');
    $('loading').classList.remove('busy');
    g.start();
    window.__game = g;
    if (fresh) toast(`🆕 Jauna spēle „${game.name}” — visi sāk no sākuma! Iepriekšējais progress saglabāts.`, 'good', 7000);
    if (code && net.isHost && !net.offline) {
      const url = location.pathname + '?istaba=' + code;
      try { history.replaceState(null, '', url); } catch (e) { /* */ }
    }
  } catch (e) {
    console.error(e);
    $('loading').classList.add('hidden');
    $('loading').classList.remove('busy');
    status('Kļūda: ' + e.message);
    setBusy(false);
  }
}

// Android, ieejot pilnekrānā, apakšā uz pāris sekundēm parāda „velc no augšas, lai izietu” —
// tikmēr apakšējās pogas paceļam augstāk, lai paziņojums tās neaizsedz
let fsNoteT = 0;
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement || !/Android/i.test(navigator.userAgent)) return;
  document.body.classList.add('fs-note');
  clearTimeout(fsNoteT);
  fsNoteT = setTimeout(() => document.body.classList.remove('fs-note'), 5000);
});

function tryFullscreen() {
  if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) return;
  try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch (e) { /* */ }
}

$('btn-host').onclick = async () => {
  initAudio(); tryFullscreen();
  setBusy(true);
  status('Veidojam istabu…', true);
  const net = new Net();
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomCode();
    try {
      await net.host(code);
      status(`Istaba izveidota: ${code}`, true);
      const game = pickedGame();
      await launch(net, code, game, enterGame(game));
      return;
    } catch (e) {
      console.warn(e);
      net.close();
      if (e && e.type === 'unavailable-id') continue;
      status('Neizdevās izveidot istabu. Pārbaudi internetu vai spēlē vienatnē.');
      setBusy(false);
      return;
    }
  }
  setBusy(false);
};

$('btn-join').onclick = async () => {
  initAudio();
  const code = $('in-code').value.trim().toUpperCase();
  if (code.length !== 5) { status('Ieraksti 5 simbolu istabas kodu'); return; }
  tryFullscreen();
  setBusy(true);
  status('Pievienojamies…', true);
  const net = new Net();
  try {
    await net.join(code);
    status('Savienots!', true);
    const game = await askGame(net);
    await launch(net, code, game, enterGame(game));
  } catch (e) {
    console.warn(e);
    net.close();
    status((e && e.message) || 'Neizdevās pievienoties');
    setBusy(false);
  }
};
$('in-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

$('btn-solo').onclick = async () => {
  initAudio(); tryFullscreen();
  setBusy(true);
  const net = new Net();
  await net.startOffline();
  const game = pickedGame();
  await launch(net, null, game, enterGame(game));
};

if (urlCode && lastProfileName()) {
  // ja atvērta saite ar istabas kodu, uzreiz paspiežam "Tālāk"
  $('btn-name-ok').focus();
}

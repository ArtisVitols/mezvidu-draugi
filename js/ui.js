// HUD palīgfunkcijas, paneļi un vienkāršas skaņas
const $ = (id) => document.getElementById(id);
export { $ };
import { initSound, play, audioCtx } from './audio.js?v=1.38.0';

// 1.35.0: mazi paziņojumi, kas parādās un pamazām izgaist (garākiem tekstiem — mazliet ilgāk)
export function toast(text, kind = '', ms = 2600) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  ms = Math.min(ms, 2000 + String(text).length * 35);
  el.style.setProperty('--out', Math.max(0.6, ms / 1000 - 0.45) + 's');
  box.appendChild(el);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => el.remove(), ms);
}

let panelOnClose = null;
export function showPanel(title, build, onClose = null) {
  $('panel').querySelector('.panel-box').classList.remove('wide');
  $('panel-title').textContent = title;
  const body = $('panel-body');
  body.innerHTML = '';
  build(body);
  if ($('panel').classList.contains('hidden')) play('ui_open', { vol: 0.45, jit: 0 });
  else play('book', { vol: 0.35 });
  $('panel').classList.remove('hidden');
  panelOnClose = onClose;
}
export function refreshPanel(build) {
  const body = $('panel-body');
  const st = body.scrollTop;
  body.innerHTML = '';
  build(body);
  body.scrollTop = st;
}
export function closePanel() {
  if (!$('panel').classList.contains('hidden')) play('ui_close', { vol: 0.4, jit: 0 });
  $('panel').classList.add('hidden');
  if (panelOnClose) { const f = panelOnClose; panelOnClose = null; f(); }
}
export function panelOpen() { return !$('panel').classList.contains('hidden'); }

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick') e.addEventListener('click', v);
    else if (k === 'className') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

// rinda ar ikonu, nosaukumu un pogām
export function itemRow(icon, name, sub, buttons = [], extraClass = '') {
  const nm = el('div', { className: 'nm' }, name);
  if (sub) nm.append(el('small', {}, sub));
  const row = el('div', { className: 'item ' + extraClass }, el('div', { className: 'ico' }, icon), nm);
  for (const b of buttons) {
    row.append(el('button', { onclick: b.onclick, disabled: b.disabled ? 'disabled' : null, className: b.alt ? 'alt' : '' }, b.label));
  }
  return row;
}

// ---------- skaņas ----------
let actx = null;
export function initAudio() {
  actx = initSound();
}
// vecie nosaukumi → CC0 paraugi (audio.js); [paraugs, skaļums, ātrums]
const MAP = {
  pick: ['pop', 0.7], coin: ['coin', 0.8], star: ['j_star', 0.8], bad: ['ui_error', 0.7], jump: ['cloth', 0.4, 1.3],
  plant: ['leaves', 0.8], beep: ['ui_select', 0.7], go: ['ding', 0.9, 1.3], boost: ['whoosh', 0.8], pet: ['pluck', 0.8],
  throw: ['cloth', 0.6, 1.15], splat: ['squish', 0.8], win: ['j_win', 0.75],
};
function tone(freq, dur, type = 'sine', vol = 0.15, delay = 0, slide = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
// sfx(nosaukums, opts) — paraugs, ja ielādēts; citādi sintezēts tonis (tikai vecajiem nosaukumiem)
export function sfx(name, opts) {
  const m = MAP[name];
  if (m ? play(m[0], { vol: m[1], rate: m[2] || 1, ...(opts || {}) }) : play(name, opts || {})) return;
  if (actx) actx = audioCtx();
  switch (name) {
    case 'pick': tone(660, 0.1, 'triangle'); tone(990, 0.12, 'triangle', 0.12, 0.08); break;
    case 'coin': tone(988, 0.08, 'square', 0.08); tone(1319, 0.2, 'square', 0.08, 0.07); break;
    case 'star': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, i * 0.08)); break;
    case 'bad': tone(300, 0.3, 'sawtooth', 0.08, 0, -150); break;
    case 'jump': tone(400, 0.15, 'sine', 0.1, 0, 300); break;
    case 'plant': tone(300, 0.08, 'triangle', 0.12); tone(450, 0.1, 'triangle', 0.1, 0.06); break;
    case 'beep': tone(520, 0.2, 'square', 0.08); break;
    case 'go': tone(1040, 0.5, 'square', 0.1); break;
    case 'boost': tone(300, 0.4, 'sawtooth', 0.06, 0, 600); break;
    case 'pet': tone(880, 0.1, 'sine', 0.1); tone(1100, 0.15, 'sine', 0.1, 0.1); break;
    case 'throw': tone(520, 0.14, 'sine', 0.08, 0, -260); break;
    case 'splat': tone(170, 0.12, 'triangle', 0.12, 0, -90); tone(260, 0.06, 'square', 0.04); break;
    case 'win': [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, i * 0.12)); break;
  }
}

export function fmtTime(ms) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return (m > 0 ? m + ':' : '') + (s % 60).toFixed(1).padStart(m > 0 ? 4 : 1, '0');
}

// klusa klikšķa skaņa visām pogām (izņemot braukšanas / lēciena / darbības pogas, kurām savas skaņas)
const NO_CLICK = new Set(['btn-jump', 'btn-gas', 'btn-brake', 'btn-left', 'btn-right', 'btn-action']);
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest && e.target.closest('button, .swatches button, select, summary');
  if (!b || NO_CLICK.has(b.id) || b.disabled) return;
  play(b.classList.contains('mtile') ? 'ui_select' : 'ui_click', { vol: 0.35, gap: 50 });
}, true);

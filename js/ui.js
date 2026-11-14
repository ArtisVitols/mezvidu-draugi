// HUD palīgfunkcijas, paneļi un vienkāršas skaņas
const $ = (id) => document.getElementById(id);
export { $ };

export function toast(text, kind = '', ms = 2600) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => el.remove(), ms);
}

let panelOnClose = null;
export function showPanel(title, build, onClose = null) {
  $('panel-title').textContent = title;
  const body = $('panel-body');
  body.innerHTML = '';
  build(body);
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
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { /* */ }
}
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
export function sfx(name) {
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
    case 'win': [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, i * 0.12)); break;
  }
}

export function fmtTime(ms) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return (m > 0 ? m + ':' : '') + (s % 60).toFixed(1).padStart(m > 0 ? 4 : 1, '0');
}

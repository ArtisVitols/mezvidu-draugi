// Mazi SVG attēli visām lietām (veikali, soma, dāvanas). Katrai precei savs zīmējums, lai attēls atbilst nosaukumam.
// icon(key) → SVG teksts; iconEl(key, px) → <span> ar attēlu. Atslēgas: kultūra ('burkans'), sēkla ('burkans_seed'),
// stāds ('abele_sap'), auglis ('abols'), sēne, oga, zivs, 'hat:salmu', 'cl:svitrains', 'decor:struklaka', 'pet:ezitis', 'rod', 'coin'.

const W = (inner, vb = '0 0 64 64') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%">${inner}</svg>`;
const lg = (id, a, b, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const rg = (id, a, b, cx = 0.38, cy = 0.32) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="0.75"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`;
const shadow = (cx = 32, cy = 58, rx = 18) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="3.2" fill="#000" opacity=".16"/>`;
const shine = (cx, cy, rx = 5, ry = 3, rot = -30) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".45" transform="rotate(${rot} ${cx} ${cy})"/>`;
const leaf = (x, y, rot, s = 1, c = '#4f9a32') => `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 0 C6 -4 14 -3 18 0 C14 3 6 4 0 0Z" fill="${c}" stroke="#2f6a1e" stroke-width=".8"/>`;

// ---------------- kultūras (iekšējais saturs bez <svg>, lai var ielikt sēklu paciņā) ----------------
const CROP = {
  burkans: () => `<defs>${lg('ca', '#ffa53a', '#e0601a', 1, 0)}</defs>${shadow(34, 58, 14)}
    <path d="M40 18 L22 52 C20 56 25 58 27 55 L46 24 Z" fill="url(#ca)" stroke="#b8481a" stroke-width="1.2"/>
    <path d="M30 34 l5 2 M27 41 l5 2 M24 47 l4 2 M34 27 l4 2" stroke="#c0501a" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M41 21 C38 10 34 6 30 4 M43 21 C44 10 47 6 52 4 M44 22 C50 15 56 14 60 14" stroke="#3f8a2a" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${leaf(30, 6, -110, .55, '#5aa83a')}${leaf(50, 6, -60, .55, '#5aa83a')}${leaf(57, 14, -20, .5, '#5aa83a')}`,
  auzas: () => `${shadow(32, 60, 10)}<path d="M32 60 C31 40 30 24 34 6" stroke="#b8a050" stroke-width="2.4" fill="none"/>
    ${[[34, 10, -20], [26, 16, -150], [40, 18, -20], [24, 24, -160], [40, 27, 0], [26, 32, -170], [39, 36, 10]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M0 0 C3 1 7 2 9 6" stroke="#b8a050" stroke-width="1" fill="none"/><ellipse cx="9" cy="8" rx="2.6" ry="4.4" fill="#e8d283" stroke="#a88a3a" stroke-width=".8"/></g>`).join('')}`,
  kviesi: () => `${shadow(32, 60, 10)}<path d="M33 60 C32 46 31 36 32 26" stroke="#c8a040" stroke-width="2.4" fill="none"/>
    ${Array.from({ length: 7 }, (_, i) => `<ellipse cx="${28}" cy="${12 + i * 3.3}" rx="3.2" ry="4.6" fill="#f2c64a" stroke="#b8862a" stroke-width=".8" transform="rotate(-25 28 ${12 + i * 3.3})"/><ellipse cx="${36}" cy="${12 + i * 3.3}" rx="3.2" ry="4.6" fill="#e8b83a" stroke="#b8862a" stroke-width=".8" transform="rotate(25 36 ${12 + i * 3.3})"/>`).join('')}
    <ellipse cx="32" cy="9" rx="3" ry="4.6" fill="#f2c64a" stroke="#b8862a" stroke-width=".8"/>
    <path d="M28 10 L22 0 M36 10 L42 0 M32 6 L32 -2 M27 17 L19 8 M37 17 L45 8" stroke="#d8b050" stroke-width=".9"/>
    ${leaf(32, 44, -150, .9, '#a8b050')}`,
  kartupelis: () => `<defs>${rg('ka', '#e8c98e', '#a8783e')}</defs>${shadow(32, 56, 20)}
    <path d="M10 34 C10 20 26 14 40 18 C54 21 58 32 54 42 C50 52 30 56 18 50 C12 47 10 41 10 34Z" fill="url(#ka)" stroke="#8a5a2a" stroke-width="1.3"/>
    ${[[22, 28], [36, 26], [44, 38], [28, 42], [18, 38]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.8" ry="1.2" fill="#7a4a1e" opacity=".75"/>`).join('')}${shine(24, 24, 6, 2.5)}`,
  tomats: () => `<defs>${rg('to', '#ff6a50', '#c01810')}</defs>${shadow(32, 58, 18)}
    <path d="M32 18 C50 16 58 28 56 40 C54 52 44 56 32 56 C20 56 10 52 8 40 C6 28 14 16 32 18Z" fill="url(#to)" stroke="#9a1008" stroke-width="1.2"/>
    <path d="M32 20 L26 14 L31 17 L32 10 L34 17 L40 13 L36 20 L42 22 L33 22 L32 26 L30 22 L22 23Z" fill="#3f8a2a" stroke="#2a5a1a" stroke-width=".8"/>
    <path d="M32 10 C32 7 34 5 36 4" stroke="#3a7a26" stroke-width="2.2" fill="none" stroke-linecap="round"/>${shine(22, 30, 6, 3.5)}`,
  zemene: () => `<defs>${rg('ze', '#ff5a6a', '#c0102a')}</defs>${shadow(32, 59, 13)}
    <path d="M32 58 C18 50 10 36 14 26 C17 19 26 18 32 21 C38 18 47 19 50 26 C54 36 46 50 32 58Z" fill="url(#ze)" stroke="#8a0818" stroke-width="1.2"/>
    ${[[22, 30], [30, 28], [38, 29], [44, 33], [20, 38], [28, 36], [36, 37], [42, 41], [25, 45], [33, 45], [38, 48], [30, 52]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx=".9" ry="1.4" fill="#ffe680"/>`).join('')}
    <path d="M32 22 L22 16 L28 22 L18 22 L27 25 M32 22 L42 16 L36 22 L46 22 L37 25 M32 22 L32 13" stroke="#2f7a24" stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round"/>${shine(24, 28, 4, 2.5)}`,
  kaposts: () => `<defs>${rg('kp', '#d4f0a8', '#6fa04a', 0.45, 0.35)}</defs>${shadow(32, 58, 22)}
    <path d="M6 40 C4 28 12 22 18 24 C14 32 16 44 22 52 C14 52 8 48 6 40Z M58 40 C60 28 52 22 46 24 C50 32 48 44 42 52 C50 52 56 48 58 40Z" fill="#6fa04a" stroke="#3a6a24" stroke-width="1"/>
    <circle cx="32" cy="36" r="20" fill="url(#kp)" stroke="#4a7a2a" stroke-width="1.2"/>
    <path d="M32 54 C30 44 26 34 18 26 M32 54 C34 42 40 32 46 26 M32 54 C32 42 32 30 30 18" stroke="#9ac87a" stroke-width="1.4" fill="none"/>`,
  saulgrieze: () => `${shadow(32, 60, 12)}<path d="M32 60 L32 40" stroke="#4a8a2a" stroke-width="3"/>${leaf(32, 52, -160, .9)}${leaf(32, 48, -20, .9)}
    ${Array.from({ length: 16 }, (_, i) => `<ellipse cx="32" cy="10" rx="4" ry="10" fill="${i % 2 ? '#f2c12e' : '#ffd84a'}" stroke="#d89a10" stroke-width=".7" transform="rotate(${i * 22.5} 32 26)"/>`).join('')}
    <circle cx="32" cy="26" r="9.5" fill="#6a3e14" stroke="#4a2a0a"/>
    ${Array.from({ length: 12 }, (_, i) => `<circle cx="${32 + Math.cos(i * 2.4) * (i % 3 + 2) * 2}" cy="${26 + Math.sin(i * 2.4) * (i % 3 + 2) * 2}" r=".9" fill="#a87a3a"/>`).join('')}`,
  kirbis: () => `<defs>${rg('ki', '#ffbe5a', '#d8640a')}</defs>${shadow(32, 58, 24)}
    <ellipse cx="32" cy="38" rx="26" ry="19" fill="url(#ki)" stroke="#a84a08" stroke-width="1.2"/>
    <path d="M32 19 C24 26 24 50 32 57 M32 19 C40 26 40 50 32 57 M20 21 C10 30 12 50 22 55 M44 21 C54 30 52 50 42 55" stroke="#c0560a" stroke-width="1.6" fill="none"/>
    <path d="M30 20 C30 14 32 10 37 8 L39 11 C35 13 34 16 34 20Z" fill="#6a7a3a" stroke="#3a4a1a"/>${shine(18, 30, 5, 3)}`,
  redisi: () => `<defs>${rg('re', '#ff6a9a', '#c0104a')}</defs>${shadow(30, 58, 13)}
    <path d="M30 22 C14 22 12 44 22 50 C26 52 28 56 29 62 C31 56 33 52 38 50 C48 44 46 22 30 22Z" fill="url(#re)" stroke="#8a0838" stroke-width="1.2"/>
    <path d="M24 50 C27 53 33 53 36 50 C34 56 30 60 29 62 C28 58 26 54 24 50Z" fill="#fff5f0"/>
    <path d="M30 22 C28 14 22 8 16 6 M30 22 C32 12 38 6 46 4" stroke="#3f8a2a" stroke-width="2.2" fill="none"/>
    ${leaf(16, 8, -150, .8, '#5aa83a')}${leaf(44, 6, -40, .8, '#5aa83a')}${shine(23, 30, 4, 2.5)}`,
  salati: () => `${shadow(32, 58, 22)}${[[-50, '#7ab84a'], [-20, '#9ad46a'], [20, '#9ad46a'], [50, '#7ab84a'], [0, '#b8e88a']].map(([r, c]) => `<path transform="rotate(${r} 32 52)" d="M32 52 C18 46 14 30 20 18 C24 14 28 18 30 14 C32 10 36 12 38 16 C42 14 46 18 44 24 C48 34 44 48 32 52Z" fill="${c}" stroke="#4a8a2a" stroke-width="1"/>`).join('')}
    <path d="M32 52 L32 22 M32 40 L26 32 M32 34 L38 26" stroke="#e8f8d0" stroke-width="1.4" fill="none"/>`,
  sipols: () => `<defs>${rg('si', '#f2c27a', '#b0702a')}</defs>${shadow(32, 58, 16)}
    <path d="M32 18 C20 26 12 34 14 44 C16 54 26 57 32 57 C38 57 48 54 50 44 C52 34 44 26 32 18Z" fill="url(#si)" stroke="#8a4a1a" stroke-width="1.2"/>
    <path d="M32 20 C26 30 24 46 30 56 M32 20 C38 30 40 46 34 56 M32 20 C20 32 18 48 24 55 M32 20 C44 32 46 48 40 55" stroke="#9a5a22" stroke-width="1" fill="none" opacity=".7"/>
    <path d="M30 20 C28 12 26 6 24 2 M33 20 C34 12 37 6 40 2" stroke="#5aa83a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M28 57 l-2 4 M32 57 v5 M36 57 l2 4" stroke="#c8a87a" stroke-width="1.2"/>${shine(24, 34, 4, 3)}`,
  zirni: () => `<defs>${lg('zi', '#9ad45a', '#4a8a2a')}</defs>${shadow(32, 56, 24)}
    <path d="M6 36 C16 20 46 18 58 26 C50 44 18 50 6 36Z" fill="url(#zi)" stroke="#2f6a1e" stroke-width="1.3"/>
    <path d="M10 36 C20 28 44 26 54 28 C46 40 20 44 10 36Z" fill="#c8eca0"/>
    ${[16, 25, 34, 43].map((x, i) => `<circle cx="${x + 2}" cy="${36 - i * 1.6}" r="4.2" fill="#6abf3a" stroke="#3a7a22"/>${shine(x + 1, 34.5 - i * 1.6, 1.4, 1, 0)}`).join('')}
    <path d="M58 26 C60 22 60 18 56 16" stroke="#3a7a22" stroke-width="2" fill="none"/>`,
  biete: () => `<defs>${rg('bi', '#c0305a', '#5a0a24')}</defs>${shadow(32, 58, 16)}
    <path d="M32 24 C18 24 14 38 20 46 C24 51 30 52 32 60 C34 52 40 51 44 46 C50 38 46 24 32 24Z" fill="url(#bi)" stroke="#4a0418" stroke-width="1.2"/>
    <path d="M32 24 C30 16 24 8 16 6 M32 24 C32 14 32 8 34 2 M32 24 C36 16 42 10 50 8" stroke="#b02050" stroke-width="2.2" fill="none"/>
    ${leaf(16, 8, -160, .9, '#3f8a2a')}${leaf(34, 4, -80, .9, '#4a9a32')}${leaf(50, 8, -20, .9, '#3f8a2a')}${shine(25, 33, 4, 2.5)}`,
  gurkis: () => `<defs>${lg('gu', '#7ac04a', '#2a6a1a', 0, 1)}</defs>${shadow(32, 54, 24)}
    <path d="M8 40 C6 30 14 22 30 20 C46 18 58 22 58 30 C58 38 46 44 30 46 C18 48 10 46 8 40Z" fill="url(#gu)" stroke="#1f4a12" stroke-width="1.2" transform="rotate(-10 32 34)"/>
    ${[[18, 30], [28, 26], [38, 25], [48, 26], [22, 38], [34, 36], [46, 33]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="#d8f0b0"/>`).join('')}
    <path d="M58 26 l4 -3" stroke="#6a5a2a" stroke-width="2.2" stroke-linecap="round"/>${shine(22, 27, 7, 2)}`,
  kukuruza: () => `${shadow(32, 60, 12)}<path d="M32 6 C42 8 44 24 42 40 C40 50 36 54 32 54 C28 54 24 50 22 40 C20 24 22 8 32 6Z" fill="#f2c830" stroke="#b88a10" stroke-width="1"/>
    ${Array.from({ length: 9 }, (_, j) => Array.from({ length: 4 }, (_, i) => `<ellipse cx="${26 + i * 4 + (j % 2) * 1.2}" cy="${11 + j * 4.6}" rx="1.9" ry="2.1" fill="#ffe25a" stroke="#d8a020" stroke-width=".5"/>`).join('')).join('')}
    <path d="M32 58 C22 52 14 36 18 20 C22 34 26 44 32 52Z" fill="#7ab84a" stroke="#3a6a22"/><path d="M32 58 C42 52 50 36 46 20 C42 34 38 44 32 52Z" fill="#8acb5a" stroke="#3a6a22"/>
    <path d="M30 6 C28 2 24 0 22 0 M33 6 C34 2 38 0 40 0" stroke="#c8903a" stroke-width="1.2" fill="none"/>`,
  paprika: () => `<defs>${rg('pa', '#ff7a5a', '#b81808')}</defs>${shadow(32, 59, 18)}
    <path d="M32 18 C18 14 10 24 12 38 C14 50 20 58 27 56 C30 55 31 52 32 52 C33 52 34 55 37 56 C44 58 50 50 52 38 C54 24 46 14 32 18Z" fill="url(#pa)" stroke="#8a0808" stroke-width="1.2"/>
    <path d="M24 22 C20 32 22 46 27 55 M40 22 C44 32 42 46 37 55" stroke="#c82a1a" stroke-width="1.4" fill="none"/>
    <path d="M26 19 C28 15 36 15 38 19 C36 21 28 21 26 19Z" fill="#3f8a2a"/><path d="M32 17 C32 11 34 7 38 5" stroke="#3a7a26" stroke-width="3" fill="none" stroke-linecap="round"/>${shine(20, 30, 4, 7, -10)}`,
  arbuzs: () => `${shadow(32, 58, 26)}<path d="M4 30 L60 30 C60 46 48 56 32 56 C16 56 4 46 4 30Z" fill="#2f7a3a"/>
    <path d="M7 30 L57 30 C57 44 46 52 32 52 C18 52 7 44 7 30Z" fill="#d8f0b0"/>
    <path d="M9 30 L55 30 C55 42 45 49 32 49 C19 49 9 42 9 30Z" fill="#f2384a"/>
    ${[[18, 36], [26, 41], [32, 36], [38, 41], [46, 36], [32, 45], [22, 33], [42, 33]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.2" ry="2" fill="#2a1a1a"/>`).join('')}
    <path d="M10 46 C14 50 20 54 26 55 M54 46 C50 50 44 54 38 55" stroke="#1f5a2a" stroke-width="1.4" fill="none"/>`,
  lavanda: () => `${shadow(32, 60, 12)}${[-14, -5, 4, 13].map((dx, i) => `<path d="M32 60 C${32 + dx * 0.3} 44 ${32 + dx * 0.7} 30 ${32 + dx} ${12 + (i % 2) * 4}" stroke="#6a8a4a" stroke-width="1.6" fill="none"/>
    ${Array.from({ length: 6 }, (_, j) => `<ellipse cx="${32 + dx + (j % 2 ? 1.6 : -1.6)}" cy="${13 + (i % 2) * 4 + j * 3.2}" rx="2" ry="2.8" fill="${j % 2 ? '#9a6ad0' : '#b088e0'}"/>`).join('')}`).join('')}
    <path d="M24 52 C28 54 36 54 40 52" stroke="#8a5ac0" stroke-width="3" fill="none"/>`,
  spinati: () => `${shadow(32, 58, 22)}${[[-150, 1.5], [-120, 1.6], [-90, 1.7], [-60, 1.6], [-30, 1.5]].map(([r, sc], i) => leaf(32, 54, r, sc, i % 2 ? '#2f7a2a' : '#3f8f32')).join('')}
    <path d="M32 54 L18 34 M32 54 L32 28 M32 54 L46 34" stroke="#9ad06a" stroke-width="1" opacity=".7"/>`,
  kiploks: () => `<defs>${rg('ki', '#ffffff', '#d8ccb8')}</defs>${shadow(32, 59, 18)}
    <path d="M32 18 C26 26 12 32 14 44 C16 54 26 58 32 58 C38 58 48 54 50 44 C52 32 38 26 32 18Z" fill="url(#ki)" stroke="#a89a80" stroke-width="1.2"/>
    <path d="M32 20 C28 32 26 46 30 57 M32 20 C36 32 38 46 34 57 M32 22 C22 32 18 44 22 54 M32 22 C42 32 46 44 42 54" stroke="#c8b8a0" stroke-width="1" fill="none"/>
    <path d="M30 18 C30 10 32 6 31 2 M34 18 C34 10 33 6 35 2" stroke="#9aa870" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M26 58 l-2 3 M32 58 v4 M38 58 l2 3" stroke="#b8a88a" stroke-width="1.1"/>${shine(22, 40, 3.5, 6, -10)}`,
  tulpe: () => `<defs>${lg('tu', '#ff7a9a', '#d01a4a')}</defs>${shadow(32, 61, 12)}
    <path d="M32 60 V26" stroke="#4a8a32" stroke-width="2.6"/>
    <path d="M32 58 C22 52 16 40 18 30 C24 38 28 46 32 54Z" fill="#5aa040" stroke="#2f6a1e"/><path d="M32 58 C42 52 48 42 46 32 C40 40 36 48 32 54Z" fill="#6ab04a" stroke="#2f6a1e"/>
    <path d="M20 10 C22 4 26 12 28 14 C30 4 34 4 36 14 C38 12 42 4 44 10 C46 20 42 28 32 28 C22 28 18 20 20 10Z" fill="url(#tu)" stroke="#9a0a30" stroke-width="1.2"/>
    <path d="M28 14 C28 22 30 26 32 28 M36 14 C36 22 34 26 32 28" stroke="#b01040" stroke-width="1" fill="none"/>${shine(25, 16, 2, 5, -10)}`,
  pupas: () => `<defs>${lg('pu', '#a8d870', '#5a9a32')}</defs>${shadow(32, 58, 24)}
    <path d="M8 22 C20 26 44 40 56 54 C58 56 56 58 54 57 C40 46 18 34 6 26 C4 24 6 21 8 22Z" fill="url(#pu)" stroke="#3a6a1e" stroke-width="1.2"/>
    <path d="M14 14 C26 18 44 30 54 42 C56 44 54 46 52 45 C40 36 24 24 12 18 C10 16 12 13 14 14Z" fill="url(#pu)" stroke="#3a6a1e" stroke-width="1.2"/>
    ${[[16, 27], [26, 33], [36, 40], [46, 47], [22, 19], [32, 25], [42, 33]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="2" fill="#c8eca0" opacity=".7" transform="rotate(35 ${x} ${y})"/>`).join('')}
    <path d="M8 22 C6 18 4 16 2 16 M14 14 C12 10 10 8 8 8" stroke="#3a6a1e" stroke-width="1.6" fill="none"/>`,
  brokolis: () => `<defs>${rg('br', '#6ab05a', '#2a6a2a')}</defs>${shadow(32, 60, 16)}
    <path d="M26 58 L28 36 L36 36 L38 58Z" fill="#9ac878" stroke="#4a7a3a" stroke-width="1.2"/><path d="M28 40 L18 30 M36 40 L46 30" stroke="#8ab868" stroke-width="4" stroke-linecap="round"/>
    ${[[18, 26, 10], [46, 26, 10], [32, 18, 12], [24, 32, 9], [40, 32, 9], [32, 30, 9]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#br)" stroke="#1f4a1f"/>`).join('')}
    ${[[16, 22], [30, 12], [44, 22], [34, 26], [22, 30]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#9ad88a" opacity=".8"/>`).join('')}`,
  kabacis: () => `<defs>${lg('kb', '#ffe25a', '#d8a018', 0, 1)}</defs>${shadow(32, 54, 24)}
    <path d="M8 40 C6 30 16 24 32 22 C48 20 58 24 58 32 C58 40 48 44 32 46 C18 48 10 46 8 40Z" fill="url(#kb)" stroke="#9a7008" stroke-width="1.2" transform="rotate(-12 32 34)"/>
    <path d="M14 34 C26 30 42 28 54 28" stroke="#f8f0a0" stroke-width="1.4" fill="none" opacity=".8" transform="rotate(-12 32 34)"/>
    <path d="M56 24 l5 -4" stroke="#5a7a2a" stroke-width="3.4" stroke-linecap="round"/>${shine(22, 30, 7, 2, -12)}`,
  rabarbers: () => `${shadow(32, 60, 16)}
    ${[[24, -8], [32, 0], [40, 8]].map(([x, r]) => `<path d="M${x} 60 L${x + r * 0.4} 22" stroke="#c8304a" stroke-width="5" stroke-linecap="round"/><path d="M${x} 60 L${x + r * 0.4} 22" stroke="#f07a8a" stroke-width="1.4" opacity=".7"/>`).join('')}
    <path d="M10 22 C10 6 26 2 32 10 C38 2 54 6 54 22 C48 28 16 28 10 22Z" fill="#4a8a32" stroke="#2f6a1e" stroke-width="1.2"/>
    <path d="M32 10 V24 M32 16 L20 10 M32 16 L44 10 M32 20 L16 20 M32 20 L48 20" stroke="#8ac05a" stroke-width="1" fill="none"/>`,
  melone: () => `<defs>${rg('me', '#fff0a0', '#c8a830')}</defs>${shadow(32, 59, 24)}
    <ellipse cx="32" cy="36" rx="25" ry="21" fill="url(#me)" stroke="#8a7010" stroke-width="1.2"/>
    ${[-14, -7, 0, 7, 14].map((d) => `<path d="M${32 + d} 15 C${32 + d * 1.8} 26 ${32 + d * 1.8} 46 ${32 + d} 57" stroke="#d8c070" stroke-width="1" fill="none" opacity=".9"/>`).join('')}
    ${[22, 30, 38, 46].map((y) => `<path d="M10 ${y} C24 ${y + 3} 40 ${y + 3} 54 ${y}" stroke="#d8c070" stroke-width=".9" fill="none" opacity=".7"/>`).join('')}
    <path d="M32 15 C32 10 34 7 37 6" stroke="#5a7a2a" stroke-width="2.4" fill="none" stroke-linecap="round"/>${shine(22, 26, 5, 7, -20)}`,
  // 1.36.0
  spargelis: () => `${shadow(32, 60, 16)}${[[20, -8, '#8ab85a'], [27, -3, '#7aa84a'], [34, 2, '#8ab85a'], [41, 7, '#9ac86a']].map(([x, r, c]) => `<g transform="rotate(${r} ${x} 58)"><path d="M${x - 3} 58 L${x - 2.4} 14 C${x - 2} 8 ${x + 2} 8 ${x + 2.4} 14 L${x + 3} 58Z" fill="${c}" stroke="#4a7a2a" stroke-width="1"/>
    <path d="M${x - 2.4} 16 C${x - 2} 6 ${x + 2} 6 ${x + 2.4} 16 C${x + 1} 13 ${x - 1} 13 ${x - 2.4} 16Z" fill="#8a5a9a"/>${[26, 36, 46].map((y) => `<path d="M${x - 2.6} ${y} l2.6 -3 l2.6 3" stroke="#6a9a3a" fill="none" stroke-width=".9"/>`).join('')}</g>`).join('')}
    <path d="M14 50 C24 54 40 54 50 50" stroke="#c8a060" stroke-width="3" fill="none"/>`,
  baklazans: () => `<defs>${rg('bk', '#8a5ab0', '#2a0a3a')}</defs>${shadow(32, 59, 20)}
    <path d="M40 18 C52 22 56 36 50 48 C44 58 26 60 18 52 C12 46 14 38 22 34 C28 30 30 22 40 18Z" fill="url(#bk)" stroke="#1a0428" stroke-width="1.2"/>
    <path d="M34 20 C38 14 46 12 50 16 C48 22 40 24 34 20Z" fill="#4a8a32" stroke="#2f5a1e"/><path d="M44 15 C46 10 48 7 52 5" stroke="#4a7a2a" stroke-width="3" fill="none" stroke-linecap="round"/>${shine(22, 42, 3, 7, 40)}`,
  roze: () => `<defs>${rg('ro', '#ff5a6a', '#9a0018')}</defs>${shadow(32, 61, 12)}
    <path d="M32 60 V32" stroke="#3a7a2a" stroke-width="2.6"/>${leaf(32, 48, -160, 1, '#2f6a26')}${leaf(32, 42, -20, 1, '#2f6a26')}
    <circle cx="32" cy="20" r="15" fill="url(#ro)" stroke="#7a0010" stroke-width="1.2"/>
    <path d="M32 10 C24 12 22 22 28 26 C34 30 42 24 40 18 C38 14 32 14 30 18 C28 22 34 24 35 20" stroke="#8a0018" stroke-width="1.4" fill="none"/>
    <path d="M18 24 C20 32 28 36 36 34 M46 22 C46 30 40 34 34 34" stroke="#a0102a" stroke-width="1.2" fill="none"/>`,
  ananass: () => `<defs>${rg('an', '#ffd060', '#b87010')}</defs>${shadow(32, 61, 16)}
    ${[[-30, 14], [-12, 8], [0, 4], [12, 8], [30, 14]].map(([r, y]) => `<path transform="rotate(${r} 32 26)" d="M29 26 C29 ${y + 8} 31 ${y} 32 ${y - 2} C33 ${y} 35 ${y + 8} 35 26Z" fill="#3f8a3a" stroke="#1f5a1f" stroke-width=".8"/>`).join('')}
    <ellipse cx="32" cy="43" rx="15" ry="18" fill="url(#an)" stroke="#7a4a08" stroke-width="1.2"/>
    ${[-12, -6, 0, 6, 12].map((d) => `<path d="M${20 + d} 28 L${44 + d} 58" stroke="#9a5a08" stroke-width=".9" opacity=".7"/><path d="M${44 - d} 28 L${20 - d} 58" stroke="#9a5a08" stroke-width=".9" opacity=".7"/>`).join('')}`,
  zemesrieksti: () => `${shadow(32, 58, 22)}${[[22, 34, -20], [42, 40, 25]].map(([x, y, r]) => `<g transform="rotate(${r} ${x} ${y})"><path d="M${x - 14} ${y} C${x - 14} ${y - 9} ${x - 4} ${y - 9} ${x} ${y - 4} C${x + 4} ${y - 9} ${x + 14} ${y - 9} ${x + 14} ${y} C${x + 14} ${y + 9} ${x + 4} ${y + 9} ${x} ${y + 4} C${x - 4} ${y + 9} ${x - 14} ${y + 9} ${x - 14} ${y}Z" fill="#d8a868" stroke="#8a5a28" stroke-width="1.2"/>
    ${[-9, -5, 5, 9].map((dx) => `<circle cx="${x + dx}" cy="${y}" r=".9" fill="#a8783a"/>`).join('')}</g>`).join('')}`,
  cili: () => `<defs>${lg('cl', '#ff5a3a', '#b00808', 1, 1)}</defs>${shadow(32, 58, 20)}
    <path d="M18 14 C30 18 46 30 52 52 C53 56 50 57 48 54 C38 38 26 28 16 22 C12 20 14 13 18 14Z" fill="url(#cl)" stroke="#7a0404" stroke-width="1.2"/>
    <path d="M18 14 C14 10 12 6 14 2" stroke="#3a7a2a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M14 15 C16 11 22 11 22 16Z" fill="#4a8a32"/>${shine(26, 22, 6, 1.6, 30)}`,
  magone: () => `${shadow(32, 61, 12)}<path d="M32 60 C30 48 34 40 32 30" stroke="#5a8a4a" stroke-width="2.2" fill="none"/>${leaf(31, 50, -150, .9, '#6a9a5a')}
    ${[0, 72, 144, 216, 288].map((r) => `<path transform="rotate(${r} 32 20)" d="M32 20 C22 16 20 4 32 4 C44 4 42 16 32 20Z" fill="#e8281e" stroke="#9a0a08" stroke-width="1"/>`).join('')}
    <circle cx="32" cy="20" r="5" fill="#1a1a1a"/>${[0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${32 + Math.cos(i) * 7}" cy="${20 + Math.sin(i) * 7}" r="1" fill="#222"/>`).join('')}`,
  vinogas: () => `<defs>${rg('vi', '#9a5ac0', '#3a0a5a')}</defs>${shadow(32, 61, 14)}
    <path d="M32 12 C32 8 34 4 38 2" stroke="#6a4a2a" stroke-width="2.4" fill="none"/>${leaf(34, 8, -20, 1.1, '#4a8a32')}
    ${[[24, 16], [32, 16], [40, 16], [20, 24], [28, 24], [36, 24], [44, 24], [24, 32], [32, 32], [40, 32], [28, 40], [36, 40], [32, 48], [32, 56]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.4" fill="url(#vi)" stroke="#2a0640" stroke-width=".8"/>${shine(x - 1.5, y - 2, 1.4, 1, 0)}`).join('')}`,
  zeltaburkans: () => CROP.burkans().replace("'#ffa53a'", "'#fff07a'").replace('#ffa53a', '#fff27a').replace('#e0601a', '#e0a010').replace(/#b8481a/g, '#a87808').replace(/#c0501a/g, '#c89010')
    + [[14, 14], [52, 30], [18, 40]].map(([x, y]) => `<path d="M${x} ${y - 6} L${x + 1.5} ${y - 1.5} L${x + 6} ${y} L${x + 1.5} ${y + 1.5} L${x} ${y + 6} L${x - 1.5} ${y + 1.5} L${x - 6} ${y} L${x - 1.5} ${y - 1.5}Z" fill="#ffe040"/>`).join(''),
  milzkirbis: () => `${CROP.kirbis()}<circle cx="50" cy="14" r="9" fill="#2f6ad0" stroke="#1a3a8a"/><path d="M45 21 l-3 10 l6 -4 l2 7 l2 -11" fill="#2f6ad0"/><text x="50" y="18" font-size="10" font-weight="bold" fill="#fff" text-anchor="middle" font-family="sans-serif">1</text>`,
  varaviksne: () => `${shadow(32, 61, 12)}<path d="M32 60 V30" stroke="#4a9a3a" stroke-width="2.6"/>${leaf(32, 48, -160, 1, '#4a9a3a')}${leaf(32, 44, -20, 1, '#4a9a3a')}
    ${['#ff3040', '#ff9020', '#ffe020', '#40c040', '#3080ff', '#8040e0'].map((c, i) => `<ellipse transform="rotate(${i * 60} 32 20)" cx="32" cy="8" rx="6" ry="10" fill="${c}" stroke="#fff" stroke-width=".8"/>`).join('')}
    <circle cx="32" cy="20" r="6" fill="#fff8e0" stroke="#e0c060"/>`,
  zvaigzne: () => `<defs>${rg('zv', '#fff8a0', '#f0a000')}</defs>${shadow(32, 60, 18)}
    <path d="M32 4 L39 22 L58 23 L43 35 L48 54 L32 43 L16 54 L21 35 L6 23 L25 22Z" fill="url(#zv)" stroke="#b07000" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="27" cy="29" r="1.8" fill="#5a3a00"/><circle cx="37" cy="29" r="1.8" fill="#5a3a00"/><path d="M28 35 C30 37 34 37 36 35" stroke="#5a3a00" stroke-width="1.4" fill="none" stroke-linecap="round"/>${shine(26, 18, 3, 2)}`,
};

// ---------------- augļi ----------------
const FRUIT = {
  abols: () => `<defs>${rg('ab', '#ff6a50', '#b01810')}</defs>${shadow(32, 59, 18)}
    <path d="M32 20 C24 14 10 18 10 34 C10 48 20 58 28 56 C30 55 34 55 36 56 C44 58 54 48 54 34 C54 18 40 14 32 20Z" fill="url(#ab)" stroke="#7a0808" stroke-width="1.2"/>
    <path d="M32 21 C32 14 33 10 35 6" stroke="#5a3a1a" stroke-width="2.4" fill="none" stroke-linecap="round"/>${leaf(34, 10, -30, .9, '#4a9a32')}${shine(20, 30, 4, 7, -20)}`,
  bumbieris: () => `<defs>${rg('bu', '#f2e86a', '#a8a020')}</defs>${shadow(32, 59, 16)}
    <path d="M32 10 C26 10 25 20 24 26 C20 32 12 38 14 48 C16 56 26 58 32 58 C38 58 48 56 50 48 C52 38 44 32 40 26 C39 20 38 10 32 10Z" fill="url(#bu)" stroke="#7a7010" stroke-width="1.2"/>
    <path d="M32 11 C32 7 33 4 35 2" stroke="#5a3a1a" stroke-width="2.2" fill="none" stroke-linecap="round"/>${leaf(34, 5, -20, .7, '#4a9a32')}
    ${[[26, 40], [36, 46], [40, 38], [28, 50]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".8" fill="#8a7a20" opacity=".6"/>`).join('')}${shine(24, 40, 3.5, 6, -10)}`,
  kirsi: () => `<defs>${rg('kr', '#ff4a5a', '#7a0010')}</defs>${shadow(32, 59, 20)}
    <path d="M22 44 C24 30 30 16 38 6 M44 46 C42 32 40 18 38 6" stroke="#5a7a2a" stroke-width="2" fill="none"/>
    ${leaf(38, 6, -10, 1, '#4a9a32')}
    <circle cx="20" cy="46" r="10" fill="url(#kr)" stroke="#5a0010"/><circle cx="44" cy="47" r="10" fill="url(#kr)" stroke="#5a0010"/>
    ${shine(16, 42, 3, 2)}${shine(40, 43, 3, 2)}`,
  plumes: () => `<defs>${rg('pl', '#8a5ab0', '#2a0a4a')}</defs>${shadow(32, 59, 16)}
    <ellipse cx="32" cy="37" rx="17" ry="20" fill="url(#pl)" stroke="#1a0630" stroke-width="1.2"/>
    <path d="M32 18 C28 28 28 46 32 56" stroke="#3a1a5a" stroke-width="1.2" fill="none"/>
    <ellipse cx="32" cy="37" rx="17" ry="20" fill="#c8b8e8" opacity=".18"/>
    <path d="M32 18 C32 12 34 8 36 5" stroke="#5a3a1a" stroke-width="2.2" fill="none" stroke-linecap="round"/>${shine(24, 30, 3, 6, -10)}`,
  aprikozes: () => `<defs>${rg('ap', '#ffc86a', '#e0701a')}</defs>${shadow(32, 59, 20)}
    <circle cx="24" cy="40" r="15" fill="url(#ap)" stroke="#a04a0a" stroke-width="1.2"/><circle cx="42" cy="36" r="13" fill="url(#ap)" stroke="#a04a0a" stroke-width="1.2"/>
    <path d="M24 26 C22 34 22 46 24 54 M42 24 C40 30 40 42 42 48" stroke="#d8701a" stroke-width="1" fill="none"/>
    <path d="M40 23 C40 18 42 14 44 12" stroke="#5a3a1a" stroke-width="2.2" fill="none" stroke-linecap="round"/>${leaf(44, 12, -30, .8, '#4a9a32')}${shine(18, 34, 3, 5, -20)}${shine(37, 30, 2.5, 4, -20)}`,
  persiki: () => `<defs>${rg('pe', '#ffd08a', '#e0405a', 0.3, 0.3)}</defs>${shadow(32, 59, 18)}
    <path d="M32 18 C20 14 10 24 10 36 C10 50 20 58 32 58 C44 58 54 50 54 36 C54 24 44 14 32 18Z" fill="url(#pe)" stroke="#a02a2a" stroke-width="1.2"/>
    <path d="M32 19 C26 30 26 46 32 57" stroke="#c83a4a" stroke-width="1.2" fill="none"/>
    <path d="M32 18 C32 12 34 8 36 5" stroke="#5a3a1a" stroke-width="2.2" fill="none" stroke-linecap="round"/>${leaf(35, 8, -20, 1, '#4a9a32')}${shine(20, 30, 3.5, 7, -15)}`,
  rieksti: () => `${shadow(32, 59, 20)}${[[22, 40], [42, 38]].map(([x, y]) => `<path d="M${x} ${y - 13} C${x + 12} ${y - 13} ${x + 13} ${y + 10} ${x} ${y + 13} C${x - 13} ${y + 10} ${x - 12} ${y - 13} ${x} ${y - 13}Z" fill="#b8925a" stroke="#6a4a1a" stroke-width="1.2"/>
    <path d="M${x} ${y - 13} V${y + 13} M${x - 6} ${y - 6} C${x - 2} ${y - 2} ${x - 8} ${y + 4} ${x - 4} ${y + 8} M${x + 6} ${y - 6} C${x + 2} ${y - 2} ${x + 8} ${y + 4} ${x + 4} ${y + 8}" stroke="#7a5a2a" stroke-width="1" fill="none"/>`).join('')}`,
  citroni: () => `<defs>${rg('ct', '#fff58a', '#d8b808')}</defs>${shadow(32, 58, 22)}
    <path d="M8 36 C6 32 10 30 12 28 C18 18 46 18 52 28 C54 30 58 32 56 36 C58 40 54 42 52 44 C46 54 18 54 12 44 C10 42 6 40 8 36Z" fill="url(#ct)" stroke="#9a8000" stroke-width="1.2"/>
    ${leaf(40, 22, -40, 1, '#3f8a2a')}${shine(22, 30, 7, 3, -10)}`,
  apelsini: () => `<defs>${rg('ap2', '#ffb04a', '#d85a00')}</defs>${shadow(32, 59, 20)}
    <circle cx="32" cy="36" r="21" fill="url(#ap2)" stroke="#9a3a00" stroke-width="1.2"/>
    ${[[24, 30], [38, 28], [30, 44], [42, 42], [20, 40], [34, 36]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="#c85a00" opacity=".7"/>`).join('')}
    <circle cx="32" cy="16" r="2" fill="#5a7a2a"/>${leaf(33, 15, -30, 1, '#3f8a2a')}${shine(22, 28, 4, 7, -25)}`,
  zeltaaboli: () => `<defs>${rg('za', '#fff8b0', '#d89800')}</defs>${shadow(32, 59, 18)}
    <path d="M32 20 C24 14 10 18 10 34 C10 48 20 58 28 56 C30 55 34 55 36 56 C44 58 54 48 54 34 C54 18 40 14 32 20Z" fill="url(#za)" stroke="#8a6000" stroke-width="1.2"/>
    <path d="M32 21 C32 14 33 10 35 6" stroke="#5a3a1a" stroke-width="2.4" fill="none" stroke-linecap="round"/>${leaf(34, 10, -30, .9, '#4a9a32')}${shine(20, 30, 4, 7, -20)}
    ${[[52, 14], [12, 22], [50, 50]].map(([x, y]) => `<path d="M${x} ${y - 5} L${x + 1.2} ${y - 1.2} L${x + 5} ${y} L${x + 1.2} ${y + 1.2} L${x} ${y + 5} L${x - 1.2} ${y + 1.2} L${x - 5} ${y} L${x - 1.2} ${y - 1.2}Z" fill="#ffe040"/>`).join('')}`,
};

// ---------------- sēnes, ogas ----------------
const MISC = {
  baravika: () => `<defs>${rg('bv', '#a8703a', '#5a3214')}</defs>${shadow(32, 59, 18)}
    <path d="M24 34 C22 44 20 54 26 58 L38 58 C44 54 42 44 40 34Z" fill="#efe3c8" stroke="#b8a888"/>
    <path d="M26 46 l3 2 M35 50 l3 -1 M30 54 l2 1" stroke="#c8b898" stroke-width="1"/>
    <path d="M8 34 C8 18 20 10 32 10 C44 10 56 18 56 34 C48 37 16 37 8 34Z" fill="url(#bv)" stroke="#3a2008" stroke-width="1.2"/>
    <path d="M10 34 C20 37 44 37 54 34 C50 38 14 38 10 34Z" fill="#d8c060"/>${shine(22, 20, 6, 3)}`,
  gailene: () => `<defs>${lg('ga', '#ffc23a', '#e88a10')}</defs>${shadow(32, 59, 14)}
    <path d="M10 20 C14 14 22 18 26 14 C30 18 36 12 40 16 C46 14 52 16 54 20 C50 28 40 32 36 40 C34 48 34 54 36 58 L28 58 C30 52 30 46 28 40 C24 32 14 28 10 20Z" fill="url(#ga)" stroke="#b86a08" stroke-width="1.2"/>
    <path d="M16 22 C22 26 28 30 30 40 M48 22 C42 26 36 30 34 40 M32 20 L32 40" stroke="#d87a10" stroke-width="1" fill="none"/>`,
  musmire: () => `<defs>${rg('mu', '#ff4a3a', '#a80a0a')}</defs>${shadow(32, 59, 16)}
    <path d="M27 34 C26 44 24 52 22 56 C26 58 38 58 42 56 C40 52 38 44 37 34Z" fill="#fbf8ef" stroke="#c8c0b0"/>
    <path d="M26 42 C30 45 34 45 38 42 L39 46 C34 48 30 48 25 46Z" fill="#f4f0e6" stroke="#c8c0b0" stroke-width=".8"/>
    <path d="M6 34 C6 16 20 8 32 8 C44 8 58 16 58 34 C50 37 14 37 6 34Z" fill="url(#mu)" stroke="#6a0606" stroke-width="1.2"/>
    ${[[18, 22], [30, 16], [42, 20], [50, 28], [24, 30], [38, 28], [12, 30]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="${2.2 + (i % 2)}" ry="${1.8 + (i % 2) * 0.6}" fill="#fff"/>`).join('')}`,
  cepta: () => `${shadow(32, 60, 20)}<path d="M6 56 L58 8" stroke="#b08a5a" stroke-width="3" stroke-linecap="round"/>
    ${[[20, 43], [32, 32], [44, 21]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="6.5" fill="#a0602a" stroke="#5a300a" stroke-width="1.2" transform="rotate(-42 ${x} ${y})"/><path d="M${x - 4} ${y - 2} l3 -1 M${x + 1} ${y + 2} l3 -1" stroke="#6a3a10" stroke-width="1.4"/>`).join('')}
    <path d="M22 10 C20 6 24 4 22 0 M30 12 C28 8 32 6 30 2" stroke="#bbb" stroke-width="1.4" fill="none" opacity=".7"/>`,
  mellene: () => `${shadow(32, 58, 22)}${leaf(14, 22, -30, 1.1, '#3d6a2a')}${leaf(50, 20, -150, 1.1, '#3d6a2a')}
    ${[[22, 38], [36, 34], [44, 44], [28, 48], [16, 46]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#33407a" stroke="#1a2050"/><circle cx="${x}" cy="${y}" r="9" fill="#a8b8e8" opacity=".22"/><path d="M${x - 2} ${y - 6} l2 2 l2 -2" stroke="#1a2050" stroke-width="1.2" fill="none"/>`).join('')}`,
  avene: () => `${shadow(32, 59, 16)}${leaf(32, 14, -70, 1, '#4f8a34')}${leaf(32, 14, -110, 1, '#4f8a34')}
    ${Array.from({ length: 16 }, (_, i) => { const r = i < 7 ? 12 : i < 13 ? 7 : 0, a = i * 0.9; return `<circle cx="${32 + Math.cos(a) * r * (i < 7 ? 1 : 1)}" cy="${38 + Math.sin(a) * r * 1.15}" r="5.2" fill="#d0283a" stroke="#8a0a1a"/>`; }).join('')}
    ${Array.from({ length: 6 }, (_, i) => `<circle cx="${28 + (i % 3) * 5}" cy="${32 + Math.floor(i / 3) * 8}" r="1.2" fill="#ff9aa8" opacity=".8"/>`).join('')}`,
  dzervene: () => `${shadow(32, 58, 22)}<path d="M4 50 C16 40 30 46 40 40 C48 36 54 38 60 34" stroke="#5a3a2a" stroke-width="1.6" fill="none"/>
    ${[[8, 46], [52, 32], [24, 50]].map(([x, y]) => leaf(x, y, -20, .5, '#4a5a2a')).join('')}
    ${[[16, 38], [30, 32], [42, 42], [26, 46], [50, 46], [38, 28]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="#b0101e" stroke="#6a0010"/>${shine(x - 2, y - 2.5, 2.5, 1.5)}`).join('')}`,
  rod: () => `${shadow(30, 60, 14)}<path d="M14 58 L54 4" stroke="#2a2a30" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M14 58 L22 47" stroke="#b08a5a" stroke-width="5" stroke-linecap="round"/><circle cx="22" cy="50" r="4.5" fill="#c0c0c8" stroke="#666"/>
    <path d="M54 4 C60 18 58 34 52 44" stroke="#ddd" stroke-width=".9" fill="none"/><circle cx="52" cy="46" r="3" fill="#e82a2a"/><path d="M49 46 h6" stroke="#fff" stroke-width="1.6"/>`,
  coin: () => `<defs>${rg('co', '#fff0a0', '#d8a010')}</defs><circle cx="32" cy="32" r="24" fill="url(#co)" stroke="#a87808" stroke-width="2"/>
    <circle cx="32" cy="32" r="18" fill="none" stroke="#c89010" stroke-width="1.6"/><text x="32" y="40" font-size="22" font-weight="900" text-anchor="middle" fill="#a87808" font-family="sans-serif">M</text>`,
  nothing: () => `<circle cx="32" cy="34" r="22" fill="#9ab8c8" stroke="#5a7a8a" stroke-width="2"/><path d="M14 34 C20 28 26 40 32 34 C38 28 44 40 50 34" stroke="#fff" stroke-width="2.4" fill="none" opacity=".8"/>`,
};

// ---------------- zivis (sānskats, viewBox 0 0 200 100) ----------------
const FISHP = {
  rauda: { back: '#56707e', belly: '#e8eef0', mid: '#b8c8d0', fin: '#e0503a', eye: '#d0302a', len: 1, h: 30, scales: true },
  asaris: { back: '#4a6a2a', belly: '#f2e8b0', mid: '#a8b850', fin: '#f06a2a', eye: '#e8a020', len: 1, h: 30, bars: true, spiny: true },
  lidaka: { back: '#3a5a2a', belly: '#e8e8c8', mid: '#7a9a4a', fin: '#8a7a3a', eye: '#e8c040', len: 1.25, h: 20, spots: true, pike: true },
  karpa: { back: '#7a5a1a', belly: '#f2d890', mid: '#c89a3a', fin: '#9a6a2a', eye: '#e0b040', len: 1, h: 36, scales: true, barbel: true, big: true },
  sams: { back: '#3a3a36', belly: '#d8d0c0', mid: '#6a6658', fin: '#4a4640', eye: '#e8d090', len: 1.25, h: 24, mottled: true, cat: true },
  zelta: { back: '#e8701a', belly: '#ffe08a', mid: '#ffa020', fin: '#ffb030', eye: '#222', len: 0.9, h: 32, scales: true, fancy: true },
};
export function fishSvg(kind) { return uniq(fishRaw(kind)); }
function fishRaw(kind) {
  if (kind === 'zabaks') return W(`<defs>${lg('bo', '#6a5a3a', '#3a2a1a')}</defs><ellipse cx="100" cy="92" rx="70" ry="5" fill="#000" opacity=".2"/>
    <path d="M70 8 L112 8 L114 58 C140 60 168 66 172 80 C172 88 160 90 140 90 L64 90 C60 70 66 40 70 8Z" fill="url(#bo)" stroke="#2a1a0a" stroke-width="2.5"/>
    <path d="M64 84 L172 84" stroke="#1a1008" stroke-width="5"/><path d="M76 20 h30 M76 30 h30 M78 44 l30 2" stroke="#2a1a0a" stroke-width="2" opacity=".6"/>
    <path d="M120 60 C126 52 140 56 150 52 C146 62 138 66 128 66Z" fill="#4a7a3a" opacity=".85"/><path d="M90 50 C96 46 104 52 100 58" stroke="#5a8a4a" stroke-width="3" fill="none"/>
    <circle cx="140" cy="76" r="3" fill="#2a1a0a"/><circle cx="152" cy="78" r="3" fill="#2a1a0a"/>`, '0 0 200 100');
  const P = FISHP[kind] || FISHP.rauda;
  const L = Math.min(150 * P.len, 164), x0 = 100 - L / 2 + (P.cat ? 4 : -8), x1 = x0 + L, H = P.h, cy = 50;
  const id = 'f_' + kind;
  const head = P.pike ? `Q${x0 + 8} ${cy - H * 0.95} ${x0 + 30} ${cy - H}` : P.cat ? `Q${x0} ${cy - H * 0.95} ${x0 + 30} ${cy - H}` : `Q${x0 + 4} ${cy - H * 0.85} ${x0 + 30} ${cy - H}`;
  const headB = P.pike ? `Q${x0 + 8} ${cy + H * 0.9} ${x0} ${cy}` : `Q${x0 + 4} ${cy + H * 0.9} ${x0} ${cy}`;
  const tb = x1 - 18; // astes pamats
  const body = `M${x0} ${cy} ${head} C${x0 + L * 0.55} ${cy - H * 1.05} ${tb - 20} ${cy - H * 0.45} ${tb} ${cy - H * 0.22}
    L${tb} ${cy + H * 0.22} C${tb - 20} ${cy + H * 0.5} ${x0 + L * 0.55} ${cy + H * 1.05} ${x0 + 30} ${cy + H * 0.98} ${headB} Z`;
  const tail = P.fancy
    ? `<path d="M${tb - 2} ${cy} C${tb + 20} ${cy - 40} ${tb + 46} ${cy - 44} ${tb + 40} ${cy - 10} C${tb + 50} ${cy} ${tb + 50} ${cy + 6} ${tb + 40} ${cy + 12} C${tb + 46} ${cy + 46} ${tb + 18} ${cy + 40} ${tb - 2} ${cy}Z" fill="${P.fin}" stroke="#c05a0a" stroke-width="1.5" opacity=".92"/>`
    : P.cat ? `<path d="M${tb - 4} ${cy - 6} C${tb + 10} ${cy - 14} ${tb + 24} ${cy - 12} ${tb + 26} ${cy} C${tb + 24} ${cy + 12} ${tb + 10} ${cy + 14} ${tb - 4} ${cy + 6}Z" fill="${P.fin}" stroke="#222" stroke-width="1.2"/>`
      : `<path d="M${tb - 4} ${cy} L${tb + 26} ${cy - H * 0.95} C${tb + 20} ${cy - 8} ${tb + 18} ${cy + 4} ${tb + 26} ${cy + H * 0.95}Z" fill="${P.fin}" stroke="${P.back}" stroke-width="1.2" opacity=".95"/>
         ${[-0.6, -0.3, 0.3, 0.6].map((k) => `<path d="M${tb} ${cy} L${tb + 22} ${cy + H * k}" stroke="${P.back}" stroke-width=".8" opacity=".5"/>`).join('')}`;
  const dorsalX = P.pike ? x0 + L * 0.68 : x0 + L * 0.36;
  const dorsal = P.spiny
    ? `<path d="M${dorsalX} ${cy - H * 0.95} L${dorsalX + 6} ${cy - H - 18} L${dorsalX + 14} ${cy - H - 14} L${dorsalX + 20} ${cy - H - 20} L${dorsalX + 28} ${cy - H - 13} L${dorsalX + 36} ${cy - H - 16} L${dorsalX + 44} ${cy - H * 0.85}Z" fill="${P.fin}" stroke="#3a3a1a" stroke-width="1.2" opacity=".9"/>
       <path d="M${dorsalX + 48} ${cy - H * 0.82} C${dorsalX + 56} ${cy - H - 10} ${dorsalX + 66} ${cy - H - 6} ${dorsalX + 70} ${cy - H * 0.65}Z" fill="${P.mid}" stroke="#3a3a1a" stroke-width="1"/>`
    : P.cat ? `<path d="M${x0 + L * 0.3} ${cy - H * 0.98} C${x0 + L * 0.32} ${cy - H - 10} ${x0 + L * 0.37} ${cy - H - 10} ${x0 + L * 0.39} ${cy - H * 0.92}Z" fill="${P.fin}"/>`
      : `<path d="M${dorsalX} ${cy - H * 0.95} C${dorsalX + 6} ${cy - H - 20} ${dorsalX + 30} ${cy - H - 18} ${dorsalX + 38} ${cy - H * 0.8}Z" fill="${P.fin}" stroke="${P.back}" stroke-width="1" opacity=".92"/>`;
  const anal = P.cat
    ? `<path d="M${x0 + L * 0.4} ${cy + H * 0.9} C${x0 + L * 0.5} ${cy + H + 10} ${tb - 10} ${cy + H * 0.6 + 8} ${tb - 4} ${cy + H * 0.3}Z" fill="${P.fin}" opacity=".9"/>`
    : `<path d="M${x0 + L * (P.pike ? 0.7 : 0.62)} ${cy + H * 0.78} C${x0 + L * 0.66} ${cy + H + 12} ${x0 + L * 0.74} ${cy + H + 10} ${x0 + L * 0.77} ${cy + H * 0.6}Z" fill="${P.fin}" opacity=".9"/>
       <path d="M${x0 + L * 0.36} ${cy + H * 0.95} C${x0 + L * 0.38} ${cy + H + 14} ${x0 + L * 0.44} ${cy + H + 12} ${x0 + L * 0.46} ${cy + H * 0.92}Z" fill="${P.fin}" opacity=".9"/>`;
  let pattern = '';
  if (P.scales) for (let i = 0; i < 9; i++) for (let j = -2; j <= 2; j++) {
    const x = x0 + 40 + i * (L - 70) / 9, y = cy + j * H * 0.32 + (i % 2) * H * 0.16;
    pattern += `<path d="M${x} ${y - 5} C${x + 6} ${y - 3} ${x + 6} ${y + 3} ${x} ${y + 5}" stroke="${P.back}" stroke-width="1" fill="none" opacity=".35"/>`;
  }
  if (P.bars) for (let i = 0; i < 6; i++) { const x = x0 + 42 + i * 17; pattern += `<path d="M${x} ${cy - H * 0.9} C${x + 4} ${cy - 4} ${x - 2} ${cy + 6} ${x + 2} ${cy + H * 0.45}" stroke="#2a3a14" stroke-width="${7 - (i % 2) * 2}" fill="none" opacity=".55" stroke-linecap="round"/>`; }
  if (P.spots) for (let i = 0; i < 26; i++) { const x = x0 + 30 + (i * 37) % (L - 50), y = cy - H * 0.6 + ((i * 13) % 10) / 10 * H * 1.1; pattern += `<ellipse cx="${x}" cy="${y}" rx="3.4" ry="1.8" fill="#e8e8b0" opacity=".7"/>`; }
  if (P.mottled) for (let i = 0; i < 22; i++) { const x = x0 + 26 + (i * 41) % (L - 40), y = cy - H * 0.7 + ((i * 7) % 10) / 10 * H; pattern += `<ellipse cx="${x}" cy="${y}" rx="${4 + i % 4}" ry="${2.5 + i % 3}" fill="#1a1a16" opacity=".35"/>`; }
  const ex = x0 + (P.pike ? 26 : P.cat ? 22 : 20), ey = cy - H * (P.cat ? 0.32 : 0.3);
  const extras = (P.barbel ? `<path d="M${x0 + 4} ${cy + 4} C${x0} ${cy + 12} ${x0 + 4} ${cy + 16} ${x0 + 10} ${cy + 14}" stroke="${P.mid}" stroke-width="1.6" fill="none"/>` : '')
    + (P.cat ? `<path d="M${x0 + 6} ${cy - 2} C${x0 - 14} ${cy + 6} ${x0 - 14} ${cy + 24} ${x0 - 2} ${cy + 34}" stroke="#2a2a26" stroke-width="2" fill="none"/><path d="M${x0 + 6} ${cy + 4} C${x0 - 6} ${cy + 14} ${x0 - 4} ${cy + 22} ${x0 + 4} ${cy + 26}" stroke="#2a2a26" stroke-width="1.5" fill="none"/>` : '');
  const mouth = `<path d="M${x0 + 1} ${cy + 2} C${x0 + 8} ${cy + 3} ${x0 + 12} ${cy + 1} ${x0 + 14} ${cy - 1}" stroke="#2a2a2a" stroke-width="1.4" fill="none"/>`;
  return W(`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.back}"/><stop offset=".45" stop-color="${P.mid}"/><stop offset="1" stop-color="${P.belly}"/></linearGradient>
    <clipPath id="${id}c"><path d="${body}"/></clipPath></defs>
    <ellipse cx="100" cy="93" rx="${L * 0.45}" ry="4" fill="#000" opacity=".18"/>
    ${tail}${dorsal}${anal}
    <path d="${body}" fill="url(#${id})" stroke="${P.back}" stroke-width="1.6"/>
    <g clip-path="url(#${id}c)">${pattern}<path d="M${x0 + 20} ${cy + 4} C${x0 + L * 0.4} ${cy + 2} ${tb - 20} ${cy} ${tb} ${cy}" stroke="#fff" stroke-width="1.2" opacity=".35" fill="none"/>
      <ellipse cx="${x0 + L * 0.45}" cy="${cy - H * 0.55}" rx="${L * 0.28}" ry="${H * 0.18}" fill="#fff" opacity=".18"/></g>
    <path d="M${x0 + 30} ${cy - H * 0.85} C${x0 + 38} ${cy - H * 0.3} ${x0 + 38} ${cy + H * 0.4} ${x0 + 30} ${cy + H * 0.9}" stroke="${P.back}" stroke-width="1.6" fill="none" opacity=".7"/>
    <path d="M${x0 + 40} ${cy + H * 0.2} C${x0 + 50} ${cy + H * 0.3} ${x0 + 60} ${cy + H * 0.55} ${x0 + 58} ${cy + H * 0.7} C${x0 + 52} ${cy + H * 0.6} ${x0 + 44} ${cy + H * 0.45} ${x0 + 40} ${cy + H * 0.2}Z" fill="${P.fin}" opacity=".85"/>
    <circle cx="${ex}" cy="${ey}" r="${P.cat ? 3 : 5.5}" fill="${P.eye}" stroke="#222" stroke-width="1"/><circle cx="${ex + 0.5}" cy="${ey}" r="${P.cat ? 1.6 : 2.8}" fill="#111"/><circle cx="${ex - 1}" cy="${ey - 1.5}" r="${P.cat ? 0.7 : 1.2}" fill="#fff"/>
    ${mouth}${extras}`, '0 0 200 100');
}

// ---------------- cepures ----------------
const HAT = {
  salmu: () => `<defs>${lg('hs', '#f8e2a0', '#d8b860')}</defs>${shadow(32, 50, 28)}<ellipse cx="32" cy="44" rx="29" ry="9" fill="url(#hs)" stroke="#a8883a" stroke-width="1.2"/>
    <path d="M17 44 C16 30 20 18 32 18 C44 18 48 30 47 44Z" fill="url(#hs)" stroke="#a8883a" stroke-width="1.2"/><path d="M17 38 C26 41 38 41 47 38 L47 43 C38 46 26 46 17 43Z" fill="#7a2a22"/>
    ${Array.from({ length: 7 }, (_, i) => `<path d="M${10 + i * 7} ${42 + (i % 2)} l4 2" stroke="#c0a050" stroke-width="1"/>`).join('')}`,
  vainags: () => `${shadow(32, 50, 26)}<ellipse cx="32" cy="40" rx="24" ry="10" fill="none" stroke="#4a7a2a" stroke-width="5"/>
    ${Array.from({ length: 12 }, (_, i) => { const a = i / 12 * 6.283, x = 32 + Math.cos(a) * 24, y = 40 + Math.sin(a) * 10; return leaf(x, y, a * 57 + 60, .45, '#5aa83a'); }).join('')}
    ${[[10, 38, '#fff'], [20, 31, '#ffe03a'], [32, 30, '#4a6ae0'], [44, 31, '#e8302a'], [54, 38, '#b06ae0'], [18, 48, '#fff'], [32, 50, '#ffe03a'], [46, 48, '#4a6ae0']].map(([x, y, c]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="0" cy="-3.2" rx="2" ry="3.2" fill="${c}" stroke="#999" stroke-width=".3" transform="rotate(${r})"/>`).join('')}<circle r="1.6" fill="#f2b81a"/></g>`).join('')}`,
  ozols: () => `${shadow(32, 50, 26)}<ellipse cx="32" cy="40" rx="24" ry="10" fill="none" stroke="#4a3a22" stroke-width="3"/>
    ${Array.from({ length: 14 }, (_, i) => { const a = i / 14 * 6.283, x = 32 + Math.cos(a) * 24, y = 40 + Math.sin(a) * 10; return `<path transform="translate(${x} ${y}) rotate(${a * 57 + 70}) scale(.55)" d="M0 0 C3 -3 5 -1 7 -4 C9 -2 11 -5 13 -2 C15 -4 17 -1 20 0 C17 1 15 4 13 2 C11 5 9 2 7 4 C5 1 3 3 0 0Z" fill="${i % 2 ? '#2f6b24' : '#3f7a2a'}" stroke="#1f4a12" stroke-width=".6"/>`; }).join('')}
    ${[[14, 44], [50, 44], [32, 51]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="3.6" fill="#a8803a" stroke="#5a4020"/><path d="M${x - 3} ${y - 2} h6" stroke="#5a4a2a" stroke-width="2.4"/>`).join('')}`,
  cilindrs: () => `${shadow(32, 54, 26)}<ellipse cx="32" cy="50" rx="26" ry="6" fill="#1a1a1e" stroke="#000"/>
    <path d="M18 50 L20 10 C26 7 38 7 44 10 L46 50 C40 53 24 53 18 50Z" fill="#202024" stroke="#000" stroke-width="1.2"/>
    <ellipse cx="32" cy="10" rx="12" ry="3.2" fill="#2a2a30" stroke="#000"/><path d="M19 40 C26 43 38 43 45 40 L45.5 46 C38 49 26 49 18.5 46Z" fill="#8a1515"/>${shine(25, 24, 2, 10, 0)}`,
  kronis: () => `<defs>${lg('kn', '#ffe070', '#c88a10')}</defs>${shadow(32, 54, 24)}
    <path d="M8 48 L6 18 L18 32 L24 12 L32 30 L40 12 L46 32 L58 18 L56 48Z" fill="url(#kn)" stroke="#8a5a08" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="8" y="42" width="48" height="8" rx="2" fill="#e8b830" stroke="#8a5a08"/>
    ${[[6, 18], [24, 12], [40, 12], [58, 18]].map(([x, y]) => `<circle cx="${x}" cy="${y - 2}" r="2.6" fill="#ffe070" stroke="#8a5a08"/>`).join('')}
    <circle cx="20" cy="46" r="2.4" fill="#c0102a"/><circle cx="32" cy="46" r="2.8" fill="#1a4ad0"/><circle cx="44" cy="46" r="2.4" fill="#10a050"/>`,
  kivere: () => `<defs>${lg('kv', '#e8ecf0', '#8a9098')}</defs>${shadow(32, 58, 22)}
    <path d="M12 54 L12 34 C12 18 22 10 32 10 C42 10 52 18 52 34 L52 54Z" fill="url(#kv)" stroke="#4a5058" stroke-width="1.4"/>
    <rect x="18" y="32" width="28" height="4" rx="2" fill="#1a1a1a"/><path d="M32 10 L32 54" stroke="#6a7078" stroke-width="2"/><path d="M12 46 H52" stroke="#d8b040" stroke-width="3"/>
    ${[0, 1, 2, 3].map((i) => `<ellipse cx="${34 + i * 3}" cy="${8 - i * 2}" rx="3" ry="5" fill="${i % 2 ? '#e8302a' : '#f4f4f4'}" transform="rotate(${20 + i * 15} ${34 + i * 3} ${8 - i * 2})"/>`).join('')}`,
  nagene: () => `<defs>${lg('na', '#4a8ae8', '#1a4aa8')}</defs>${shadow(32, 50, 26)}
    <path d="M8 40 C8 22 20 14 34 14 C48 14 56 24 56 40Z" fill="url(#na)" stroke="#0a2a68" stroke-width="1.2"/>
    <path d="M8 40 C4 42 2 46 6 48 C20 50 34 46 40 40Z" fill="#1a3a88" stroke="#0a2a68"/><path d="M34 14 C30 24 30 32 32 40 M20 18 C18 26 18 34 20 40 M46 18 C46 26 46 34 44 40" stroke="#2a5ab8" stroke-width="1.2" fill="none"/>
    <circle cx="34" cy="14" r="2.2" fill="#0a2a68"/><text x="42" y="34" font-size="11" font-weight="900" fill="#fff" font-family="sans-serif">M</text>`,
  berete: () => `<defs>${rg('be', '#e84a5a', '#8a1020', 0.4, 0.3)}</defs>${shadow(32, 50, 24)}
    <path d="M6 34 C6 22 22 16 36 18 C52 20 60 28 56 36 C52 42 40 44 30 44 C16 44 6 40 6 34Z" fill="url(#be)" stroke="#5a0810" stroke-width="1.2"/>
    <path d="M14 42 C22 46 40 46 48 42 L48 46 C40 50 22 50 14 46Z" fill="#6a0a18"/><path d="M34 18 L36 13" stroke="#5a0810" stroke-width="2.4" stroke-linecap="round"/>`,
  kovbojs: () => `<defs>${lg('kb', '#c8925a', '#7a4a1e')}</defs>${shadow(32, 52, 30)}
    <path d="M2 38 C6 46 20 48 32 48 C44 48 58 46 62 38 C58 42 50 40 46 38 L18 38 C14 40 6 42 2 38Z" fill="url(#kb)" stroke="#4a2a0a" stroke-width="1.2"/>
    <path d="M18 39 C16 28 18 16 24 14 C28 13 30 18 32 18 C34 18 36 13 40 14 C46 16 48 28 46 39Z" fill="url(#kb)" stroke="#4a2a0a" stroke-width="1.2"/>
    <path d="M18 34 C26 37 38 37 46 34 L46 38 C38 41 26 41 18 38Z" fill="#3a2010"/><circle cx="24" cy="36" r="1.5" fill="#d8b040"/>`,
  pirats: () => `${shadow(32, 54, 28)}<path d="M4 40 C12 18 24 22 32 14 C40 22 52 18 60 40 C48 48 16 48 4 40Z" fill="#1e1e22" stroke="#000" stroke-width="1.2"/>
    <path d="M4 40 C16 46 48 46 60 40" stroke="#d8b040" stroke-width="2.2" fill="none"/>
    <circle cx="32" cy="30" r="5.5" fill="#f4f4f0"/><circle cx="30" cy="29.5" r="1.3" fill="#111"/><circle cx="34" cy="29.5" r="1.3" fill="#111"/><rect x="29.5" y="33" width="5" height="2.4" fill="#f4f4f0"/>
    <path d="M24 38 L40 32 M24 32 L40 38" stroke="#f4f4f0" stroke-width="2.2" stroke-linecap="round"/>`,
  ziemas: () => `${shadow(32, 54, 22)}<path d="M12 46 C12 26 20 16 32 16 C44 16 52 26 52 46Z" fill="#d8d8e0" stroke="#8a8a98"/><rect x="10" y="42" width="44" height="10" rx="4" fill="#c42830"/><circle cx="32" cy="13" r="7" fill="#f6f3ee" stroke="#ccc"/>`,
};

// ---------------- drēbes ----------------
const shirt = (fill, extra = '', id = '') => `${id}<path d="M20 10 L8 18 L4 30 L14 34 L16 28 L16 58 L48 58 L48 28 L50 34 L60 30 L56 18 L44 10 C40 15 24 15 20 10Z" fill="${fill}" stroke="#333" stroke-width="1.4" stroke-linejoin="round"/>
  <clipPath id="sc${id.length}x"><path d="M20 10 L8 18 L4 30 L14 34 L16 28 L16 58 L48 58 L48 28 L50 34 L60 30 L56 18 L44 10 C40 15 24 15 20 10Z"/></clipPath>${extra}
  <path d="M20 10 C24 16 40 16 44 10" stroke="#333" stroke-width="1.6" fill="none"/>`;
const CL = {
  svitrains: () => shirt('#ffffff', `<g clip-path="url(#sc0x)">${[14, 22, 30, 38, 46, 54].map((y) => `<rect x="0" y="${y}" width="64" height="4" fill="#2f5fc0"/>`).join('')}</g>`),
  rutains: () => shirt('#c83a2a', `<g clip-path="url(#sc0x)">${[10, 22, 34, 46].map((v) => `<rect x="${v}" y="0" width="5" height="64" fill="#1a1a1a" opacity=".45"/><rect x="0" y="${v + 4}" width="64" height="5" fill="#1a1a1a" opacity=".45"/><rect x="${v + 2}" y="0" width="1" height="64" fill="#f2d040" opacity=".7"/>`).join('')}</g>`),
  futbola: () => shirt('#f2c12e', `<g clip-path="url(#sc0x)"><rect x="0" y="0" width="64" height="20" fill="#1a6a3a" opacity=".0"/><rect x="4" y="16" width="56" height="2.5" fill="#1a3a8a"/></g><text x="32" y="46" font-size="20" font-weight="900" text-anchor="middle" fill="#1a3a8a" font-family="sans-serif">10</text>`),
  zvaigznes: () => shirt('#2a2a6a', `<g clip-path="url(#sc0x)">${[[24, 26], [40, 30], [30, 42], [44, 48], [20, 50], [36, 20]].map(([x, y]) => `<path transform="translate(${x} ${y}) scale(.9)" d="M0 -5 L1.5 -1.5 L5 -1.5 L2.2 .8 L3.2 4.5 L0 2.2 L-3.2 4.5 L-2.2 .8 L-5 -1.5 L-1.5 -1.5Z" fill="#ffd84a"/>`).join('')}</g>`),
  latvija: () => shirt('#9e3039', `<g clip-path="url(#sc0x)"><rect x="0" y="30" width="64" height="9" fill="#ffffff"/></g>`),
  saulesbrilles: () => `${shadow(32, 48, 24)}<path d="M4 24 H60" stroke="#222" stroke-width="3"/><path d="M6 24 C6 40 12 44 20 44 C27 44 30 38 30 24Z M34 24 C34 38 37 44 44 44 C52 44 58 40 58 24Z" fill="#1a1a2a" stroke="#000" stroke-width="1.6"/>
    ${shine(14, 31, 4, 2)}${shine(42, 31, 4, 2)}`,
  apalas: () => `${shadow(32, 48, 24)}<circle cx="18" cy="32" r="11" fill="#d8eef8" fill-opacity=".5" stroke="#6a4a2a" stroke-width="3"/><circle cx="46" cy="32" r="11" fill="#d8eef8" fill-opacity=".5" stroke="#6a4a2a" stroke-width="3"/>
    <path d="M29 30 C31 27 33 27 35 30 M7 30 L2 26 M57 30 L62 26" stroke="#6a4a2a" stroke-width="2.6" fill="none"/>${shine(14, 28, 3, 1.6)}${shine(42, 28, 3, 1.6)}`,
  sirds: () => `${shadow(32, 50, 24)}${[17, 47].map((x) => `<path transform="translate(${x} 32)" d="M0 10 C-14 2 -14 -10 -6 -10 C-2 -10 0 -6 0 -4 C0 -6 2 -10 6 -10 C14 -10 14 2 0 10Z" fill="#ff5a9a" stroke="#c0105a" stroke-width="2"/>`).join('')}
    <path d="M29 28 C31 26 33 26 35 28 M5 26 L1 22 M59 26 L63 22" stroke="#c0105a" stroke-width="2.4" fill="none"/>`,
  taurenitis: () => `${shadow(32, 50, 22)}<path d="M32 32 L8 18 C4 26 4 38 8 46Z M32 32 L56 18 C60 26 60 38 56 46Z" fill="#c8102a" stroke="#6a0010" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="27" y="26" width="10" height="12" rx="3" fill="#a00a20" stroke="#6a0010"/>${[[16, 28], [14, 38], [48, 28], [50, 38]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#fff" opacity=".8"/>`).join('')}`,
  kaklasaite: () => `${shadow(32, 60, 10)}<path d="M26 6 L38 6 L36 14 L28 14Z" fill="#1a3a8a" stroke="#0a1a4a"/><path d="M28 14 L36 14 L42 48 L32 60 L22 48Z" fill="#2a5ac0" stroke="#0a1a4a" stroke-width="1.4"/>
    ${[22, 32, 42].map((y) => `<path d="M${26} ${y} L${40} ${y - 6}" stroke="#f2c12e" stroke-width="2.4"/>`).join('')}`,
  krelles: () => `${shadow(32, 56, 22)}<path d="M8 12 C8 40 20 52 32 52 C44 52 56 40 56 12" stroke="#ccc" stroke-width="1" fill="none"/>
    ${Array.from({ length: 13 }, (_, i) => { const t = i / 12, a = Math.PI * t; const x = 32 - Math.cos(a) * 24, y = 12 + Math.sin(a) * 40; return `<circle cx="${x}" cy="${y}" r="${i === 6 ? 5 : 3.6}" fill="#fbf8f0" stroke="#c8c0b0"/>${shine(x - 1, y - 1, 1.2, .8, 0)}`; }).join('')}`,
  medala: () => `<defs>${rg('md', '#fff0a0', '#d8a010')}</defs>${shadow(32, 60, 14)}<path d="M18 2 L30 34 L34 34 L22 2Z" fill="#2a5ac0"/><path d="M46 2 L34 34 L30 34 L42 2Z" fill="#c8102a"/>
    <circle cx="32" cy="44" r="14" fill="url(#md)" stroke="#a87808" stroke-width="2"/><path transform="translate(32 44)" d="M0 -7 L2 -2.2 L7 -2.2 L3 1 L4.5 6 L0 3 L-4.5 6 L-3 1 L-7 -2.2 L-2 -2.2Z" fill="#c89010"/>`,
  mugursoma: () => `<defs>${lg('ms', '#4ab05a', '#2a7a3a')}</defs>${shadow(32, 60, 20)}
    <path d="M24 10 C24 4 40 4 40 10" stroke="#1a4a22" stroke-width="3" fill="none"/>
    <rect x="12" y="10" width="40" height="48" rx="12" fill="url(#ms)" stroke="#1a4a22" stroke-width="1.4"/>
    <rect x="18" y="34" width="28" height="18" rx="6" fill="#3a9a4a" stroke="#1a4a22"/><path d="M18 40 H46" stroke="#1a4a22"/><circle cx="32" cy="40" r="1.6" fill="#d8b040"/>
    <path d="M12 22 C20 26 44 26 52 22" stroke="#1a4a22" stroke-width="1.2" fill="none"/>`,
  apmetnis: () => `<defs>${lg('ap', '#e83a3a', '#8a0a10')}</defs>${shadow(32, 60, 24)}
    <path d="M20 6 L44 6 C48 22 56 40 60 58 C48 54 40 60 32 56 C24 60 16 54 4 58 C8 40 16 22 20 6Z" fill="url(#ap)" stroke="#5a0408" stroke-width="1.4"/>
    <path d="M20 6 C26 10 38 10 44 6" stroke="#f2c12e" stroke-width="3" fill="none"/><path d="M26 14 C24 30 20 44 18 56 M38 14 C40 30 44 44 46 56" stroke="#a01018" stroke-width="1.2" fill="none"/>`,
  sparni: () => `${shadow(32, 60, 24)}${[-1, 1].map((s) => `<path transform="translate(32 32) scale(${s} 1)" d="M0 -2 C8 -28 30 -30 30 -14 C30 -4 18 0 4 0 C18 2 26 10 22 22 C18 30 6 22 0 4Z" fill="#7ab8f0" fill-opacity=".85" stroke="#2a5a9a" stroke-width="1.4"/>
    <circle transform="translate(32 32) scale(${s} 1)" cx="18" cy="-14" r="4" fill="#f2c12e" opacity=".8"/><circle transform="translate(32 32) scale(${s} 1)" cx="12" cy="12" r="3" fill="#ff7ab0" opacity=".8"/>`).join('')}
    <ellipse cx="32" cy="32" rx="2.6" ry="12" fill="#3a3a4a"/>`,
  zabaki: () => `<defs>${lg('zb', '#f2d040', '#c89a10')}</defs>${shadow(32, 60, 26)}
    ${[[6, 0], [30, 0]].map(([x]) => `<path transform="translate(${x} 0)" d="M4 8 L18 8 L18 42 C24 44 28 48 28 54 L2 54 C2 40 4 20 4 8Z" fill="url(#zb)" stroke="#8a6a08" stroke-width="1.4"/><rect x="${x + 2}" y="52" width="26" height="4" rx="1.5" fill="#3a3a3a"/><path transform="translate(${x} 0)" d="M4 14 H18" stroke="#8a6a08" stroke-width="1.2"/>`).join('')}`,
  kedas: () => `${shadow(32, 58, 28)}<path d="M4 50 C4 40 8 34 16 32 L28 30 C34 36 44 38 56 40 C60 42 60 48 58 52 L6 54Z" fill="#f4f4f4" stroke="#333" stroke-width="1.4"/>
    <path d="M4 52 L58 52 L58 56 L4 56Z" fill="#e83a3a"/><path d="M16 34 L30 38 M18 38 L32 42 M20 42 L34 46" stroke="#2a5ac0" stroke-width="2"/><path d="M40 40 C44 44 50 46 56 46" stroke="#2a5ac0" stroke-width="3" fill="none"/>`,
};

// ---------------- dārza rotājumi ----------------
const DEC = {
  pukupods: () => `${shadow(32, 60, 16)}<path d="M18 38 L46 38 L42 58 L22 58Z" fill="#c8643a" stroke="#7a3a1a" stroke-width="1.3"/><rect x="16" y="35" width="32" height="5" rx="2" fill="#d8744a" stroke="#7a3a1a"/>
    ${leaf(32, 36, -150, .9)}${leaf(32, 36, -30, .9)}${[[22, 22, '#e83a5a'], [32, 14, '#f2d23a'], [42, 22, '#c05ae0'], [27, 30, '#fff'], [38, 30, '#ff7a2a']].map(([x, y, c]) => `<path d="M32 36 L${x} ${y}" stroke="#3f7a2a" stroke-width="1.4"/><g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((r) => `<ellipse cy="-3" rx="2.2" ry="3" fill="${c}" transform="rotate(${r})"/>`).join('')}<circle r="1.6" fill="#f2b81a"/></g>`).join('')}`,
  rukis: () => `${shadow(32, 60, 14)}<path d="M20 58 L22 38 C24 34 40 34 42 38 L44 58Z" fill="#2f5ac0" stroke="#1a2a6a"/><circle cx="32" cy="30" r="8" fill="#f2c8a0" stroke="#a87a5a"/>
    <path d="M24 32 C24 44 40 44 40 32 C38 36 26 36 24 32Z" fill="#f4f4f0" stroke="#ccc"/><path d="M22 26 C22 12 30 2 36 2 C38 10 42 18 42 26Z" fill="#d02a2a" stroke="#7a0a0a"/>
    <circle cx="29" cy="28" r="1.2" fill="#111"/><circle cx="35" cy="28" r="1.2" fill="#111"/><circle cx="32" cy="31" r="1.8" fill="#e8907a"/>`,
  burits: () => `${shadow(32, 61, 10)}<rect x="30" y="34" width="4" height="27" fill="#8a6a48"/><rect x="18" y="16" width="28" height="22" fill="#c8a070" stroke="#7a5a3a"/>
    <path d="M14 18 L32 4 L50 18Z" fill="#7a3a2a" stroke="#4a1a10"/><circle cx="32" cy="26" r="4.5" fill="#1a120a"/><rect x="31" y="32" width="2" height="5" fill="#7a5a3a"/>
    <path d="M44 8 C48 6 52 8 54 6 C52 10 48 12 44 10Z" fill="#4a7ad0"/><circle cx="46" cy="8" r="2.4" fill="#4a7ad0"/>`,
  solins: () => `${shadow(32, 58, 26)}${[30, 36, 42].map((y) => `<rect x="6" y="${y}" width="52" height="4" rx="1" fill="#a87a4a" stroke="#6a4a2a" stroke-width=".8"/>`).join('')}
    ${[14, 20].map((y) => `<rect x="8" y="${y}" width="48" height="5" rx="1" fill="#a87a4a" stroke="#6a4a2a" stroke-width=".8"/>`).join('')}
    <path d="M10 14 L12 56 M54 14 L52 56 M12 46 L16 56 M52 46 L48 56" stroke="#2a2a2a" stroke-width="3" stroke-linecap="round"/>`,
  laterna: () => `${shadow(32, 61, 10)}<rect x="30" y="26" width="4" height="34" fill="#2a2a2c"/><rect x="24" y="58" width="16" height="3" fill="#2a2a2c"/>
    <circle cx="32" cy="16" r="12" fill="#ffd86a" opacity=".35"/><rect x="25" y="10" width="14" height="16" fill="#fff2b0" stroke="#2a2a2c" stroke-width="2"/><path d="M22 10 L32 2 L42 10Z" fill="#2a2a2c"/>
    <path d="M32 10 V26 M25 18 H39" stroke="#2a2a2c" stroke-width="1.4"/>`,
  biedeklis: () => `${shadow(32, 61, 12)}<path d="M32 18 V61" stroke="#7a5a3a" stroke-width="3"/><path d="M8 28 H56" stroke="#7a5a3a" stroke-width="3"/>
    <path d="M20 26 L44 26 L46 46 L18 46Z" fill="#c03a2a" stroke="#7a1a0a"/><rect x="8" y="25" width="48" height="6" rx="2" fill="#c03a2a"/>
    <path d="M6 28 l-4 -2 M6 28 l-4 2 M58 28 l4 -2 M58 28 l4 2" stroke="#e2c46a" stroke-width="2"/><circle cx="32" cy="16" r="8" fill="#e8c890" stroke="#a8885a"/>
    <path d="M20 10 C22 4 42 4 44 10 L50 12 L14 12Z" fill="#e8d07a" stroke="#a8883a"/><circle cx="29" cy="16" r="1.2" fill="#222"/><circle cx="35" cy="16" r="1.2" fill="#222"/><path d="M28 20 Q32 22 36 20" stroke="#222" fill="none"/>`,
  karogs: () => `${shadow(20, 61, 10)}<rect x="14" y="4" width="3" height="57" fill="#e8e8e8" stroke="#999" stroke-width=".6"/><circle cx="15.5" cy="4" r="2.4" fill="#d8b040"/>
    <path d="M17 8 C30 4 40 12 58 8 L58 32 C40 36 30 28 17 32Z" fill="#9e3039" stroke="#5a1018" stroke-width="1"/><path d="M17 18 C30 14 40 22 58 18 L58 23 C40 27 30 19 17 23Z" fill="#fff"/>`,
  struklaka: () => `<defs>${lg('st', '#d8d4ca', '#9a968a')}</defs>${shadow(32, 60, 26)}<ellipse cx="32" cy="52" rx="26" ry="7" fill="url(#st)" stroke="#6a665a"/><ellipse cx="32" cy="50" rx="22" ry="5" fill="#4a8ab0"/>
    <rect x="29" y="28" width="6" height="22" fill="url(#st)" stroke="#6a665a"/><ellipse cx="32" cy="28" rx="12" ry="3.5" fill="url(#st)" stroke="#6a665a"/>
    <path d="M32 24 C32 10 22 10 20 24 M32 24 C32 10 42 10 44 24 M32 22 V8" stroke="#8ac8f0" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M20 28 C16 36 12 42 10 50 M44 28 C48 36 52 42 54 50" stroke="#8ac8f0" stroke-width="1.6" fill="none" opacity=".8"/>`,
  sene: () => `${shadow(32, 60, 20)}<path d="M24 36 C22 46 22 54 20 58 L44 58 C42 54 42 46 40 36Z" fill="#f4ecd8" stroke="#a89a7a"/>
    <path d="M4 36 C4 16 20 6 32 6 C44 6 60 16 60 36 C50 40 14 40 4 36Z" fill="#e83a2a" stroke="#7a0a0a" stroke-width="1.3"/>
    ${[[16, 24], [30, 14], [44, 20], [50, 30], [24, 32], [38, 30]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#fff"/>`).join('')}
    <rect x="28" y="44" width="8" height="10" rx="4" fill="#7a4a2a"/><circle cx="34" cy="49" r=".8" fill="#d8b040"/>`,
  vejdzirnavas: () => `${shadow(32, 60, 14)}<path d="M24 60 L28 26 L36 26 L40 60Z" fill="#e8e0d0" stroke="#8a7a5a"/><path d="M26 26 L32 18 L38 26Z" fill="#8a3a2a"/>
    <rect x="30" y="48" width="5" height="12" fill="#6a4a2a"/><g transform="translate(32 22)">${[0, 90, 180, 270].map((r) => `<path transform="rotate(${r + 20})" d="M0 0 L3 -2 L4 -22 L-3 -22 L-2 -2Z" fill="#f4f0e6" stroke="#6a5a3a"/>`).join('')}<circle r="2.4" fill="#4a3a2a"/></g>`,
  ziedudobe: () => `${shadow(32, 58, 28)}<ellipse cx="32" cy="50" rx="28" ry="9" fill="#6e5440" stroke="#4a3420"/><ellipse cx="32" cy="48" rx="26" ry="7" fill="#8a6a4a"/>
    ${[[12, 44, '#e83a5a'], [20, 38, '#f2d23a'], [30, 42, '#c05ae0'], [40, 37, '#ff7a2a'], [50, 44, '#e83a5a'], [26, 50, '#fff'], [38, 50, '#f2d23a'], [16, 52, '#c05ae0'], [46, 52, '#fff']].map(([x, y, c]) => `<path d="M${x} ${y + 6} V${y}" stroke="#3f7a2a" stroke-width="1.4"/><path transform="translate(${x} ${y})" d="M-3 0 C-4 -6 -1 -8 0 -4 C1 -8 4 -6 3 0 C2 2 -2 2 -3 0Z" fill="${c}" stroke="#555" stroke-width=".3"/>`).join('')}`,
};

// ---------------- mājdzīvnieki ----------------
const PET = {
  ezitis: () => `${shadow(32, 58, 22)}<path d="M8 50 C6 30 20 18 36 20 C50 22 58 34 56 48 C50 54 16 56 8 50Z" fill="#6a4a30" stroke="#3a2410"/>
    ${Array.from({ length: 14 }, (_, i) => { const a = Math.PI * (0.95 + i * 0.075); const x = 32 + Math.cos(a) * 24, y = 46 + Math.sin(a) * 26; return `<path d="M${x} ${y} l${Math.cos(a) * 7} ${Math.sin(a) * 7}" stroke="#3a2410" stroke-width="2.4" stroke-linecap="round"/>`; }).join('')}
    <path d="M44 34 C54 34 62 42 60 48 C54 54 44 52 42 48Z" fill="#d8b890" stroke="#8a6a4a"/><circle cx="61" cy="47" r="2.4" fill="#111"/><circle cx="50" cy="41" r="1.8" fill="#111"/>`,
  zakitis: () => `${shadow(32, 60, 18)}<ellipse cx="30" cy="46" rx="18" ry="13" fill="#d9d2c5" stroke="#8a8274"/><circle cx="44" cy="32" r="10" fill="#e4ddd0" stroke="#8a8274"/>
    <ellipse cx="40" cy="12" rx="3.6" ry="11" fill="#e4ddd0" stroke="#8a8274" transform="rotate(-10 40 12)"/><ellipse cx="48" cy="12" rx="3.6" ry="11" fill="#e4ddd0" stroke="#8a8274" transform="rotate(12 48 12)"/>
    <ellipse cx="40" cy="12" rx="1.6" ry="7" fill="#e8b0b0" transform="rotate(-10 40 12)"/><circle cx="47" cy="31" r="1.8" fill="#111"/><circle cx="53" cy="35" r="1.6" fill="#d88a8a"/><circle cx="12" cy="44" r="4.5" fill="#fff"/>`,
  vaverite: () => `${shadow(32, 60, 18)}<path d="M18 54 C2 50 2 22 14 14 C22 10 26 20 20 26 C16 32 22 40 26 44Z" fill="#c0602a" stroke="#7a3a10"/>
    <ellipse cx="36" cy="44" rx="11" ry="13" fill="#d0702e" stroke="#7a3a10"/><circle cx="42" cy="26" r="9" fill="#d0702e" stroke="#7a3a10"/><path d="M38 18 L36 10 L42 16Z M46 18 L48 10 L50 18Z" fill="#c0602a"/>
    <ellipse cx="38" cy="48" rx="5" ry="7" fill="#f2d8b0"/><circle cx="45" cy="25" r="1.8" fill="#111"/><circle cx="50" cy="29" r="1.3" fill="#3a1a0a"/><ellipse cx="40" cy="40" rx="3" ry="3.6" fill="#8a5a2a"/>`,
  sivens: () => `${shadow(32, 60, 22)}<ellipse cx="30" cy="42" rx="22" ry="14" fill="#7a5a3a" stroke="#3a2410"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="${16 + i * 4}" y="32" width="2.4" height="20" fill="#d8b890" opacity=".7" rx="1"/>`).join('')}
    <path d="M44 34 C56 32 62 40 60 46 C56 50 48 50 44 48Z" fill="#8a6a4a" stroke="#3a2410"/><ellipse cx="60" cy="44" rx="3" ry="3.6" fill="#c89a7a"/><circle cx="52" cy="39" r="1.6" fill="#111"/>
    <path d="M44 32 L42 26 L48 31Z" fill="#6a4a2a"/><path d="M18 54 v5 M26 55 v5 M36 55 v5 M44 53 v5" stroke="#3a2410" stroke-width="3"/>`,
  stirnens: () => `${shadow(32, 61, 16)}<path d="M18 40 C18 30 30 28 40 30 L46 38 C46 44 40 48 30 48 C22 48 18 46 18 40Z" fill="#b8865a" stroke="#6a4a2a"/>
    ${[[24, 34], [32, 33], [28, 40], [38, 36], [34, 43]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#f4ecd8"/>`).join('')}
    <path d="M40 32 L46 16 L52 16 L48 34Z" fill="#b8865a" stroke="#6a4a2a"/><path d="M46 16 C46 10 52 8 56 12 L58 16 L50 18Z" fill="#c8966a" stroke="#6a4a2a"/>
    <ellipse cx="46" cy="10" rx="2.4" ry="5" fill="#b8865a" transform="rotate(-30 46 10)"/><circle cx="52" cy="13" r="1.4" fill="#111"/><circle cx="58" cy="16" r="1.2" fill="#111"/>
    <path d="M22 46 v14 M28 47 v13 M38 47 v13 M44 44 v16" stroke="#8a5a32" stroke-width="2.4"/>`,
};

// ---------------- stādi un sēklu paciņas ----------------
function sapling(fruitKey, leafCol = '#4a8a30') {
  return `${shadow(32, 61, 16)}<path d="M18 46 L46 46 L42 60 L22 60Z" fill="#b8643a" stroke="#6a3a1a"/><rect x="16" y="43" width="32" height="5" rx="2" fill="#c8744a" stroke="#6a3a1a"/>
    <path d="M32 44 C31 34 33 26 32 14" stroke="#7a5a3a" stroke-width="2.6" fill="none"/>
    ${leaf(32, 30, -150, .9, leafCol)}${leaf(32, 26, -30, .9, leafCol)}${leaf(32, 20, -120, .8, leafCol)}${leaf(32, 16, -60, .8, leafCol)}
    <g transform="translate(40 30) scale(.32)">${FRUIT[fruitKey] ? FRUIT[fruitKey]() : ''}</g>`;
}
function packet(inner, color = '#e8d8a8') {
  return `${shadow(32, 61, 18)}<path d="M12 8 L52 8 L52 58 L12 58Z" fill="${color}" stroke="#8a7a4a" stroke-width="1.3"/>
    <path d="M12 8 l4 -3 l4 3 l4 -3 l4 3 l4 -3 l4 3 l4 -3 l4 3 l4 -3 l4 3" fill="${color}" stroke="#8a7a4a" stroke-width="1"/>
    <rect x="16" y="14" width="32" height="32" rx="4" fill="#fff" stroke="#c8b888"/><g transform="translate(17 15) scale(.47)">${inner}</g>
    <rect x="16" y="49" width="32" height="5" rx="2" fill="#3f8a2a"/>${[22, 28, 34, 40].map((x) => `<ellipse cx="${x}" cy="51.5" rx="1.4" ry=".9" fill="#f2e8b0"/>`).join('')}`;
}

// ---------------- publiskā daļa ----------------
const PET_KEYS = { ezitis: 1, zakitis: 1, vaverite: 1, sivens: 1, stirnens: 1 };
const TREE_FRUIT = { abele: 'abols', bumbiere: 'bumbieris', kirsis: 'kirsi', plume: 'plumes', aprikoze: 'aprikozes', persiks: 'persiki', valrieksts: 'rieksti', citronkoks: 'citroni', apelsinkoks: 'apelsini', zeltabele: 'zeltaaboli' };
const cache = new Map();
// katram ievietotajam attēlam savi id (gradientiem/izgriezumiem): vienādi id dokumentā salūzt, ja pirmais ir paslēptā panelī
let uid = 0;
const uniq = (svg) => { const n = (++uid).toString(36); return svg.replace(/id="([^"]+)"/g, `id="$1_${n}"`).replace(/url\(#([^)]+)\)/g, `url(#$1_${n})`); };
export function icon(key) { return uniq(iconRaw(key)); }
function iconRaw(key) {
  if (cache.has(key)) return cache.get(key);
  let out = null;
  const [ns, id] = key.includes(':') ? key.split(':') : [null, key];
  if (ns === 'hat') out = HAT[id] && W(HAT[id]());
  else if (ns === 'cl') out = CL[id] && W(CL[id]());
  else if (ns === 'decor') out = DEC[id] && W(DEC[id]());
  else if (ns === 'pet') out = PET[id] && W(PET[id]());
  else if (ns === 'fish') out = fishRaw(id);
  else if (id.endsWith('_seed')) { const c = id.slice(0, -5); out = CROP[c] && W(packet(CROP[c]())); }
  else if (id.endsWith('_sap')) { const t = id.slice(0, -4); out = TREE_FRUIT[t] && W(sapling(TREE_FRUIT[t])); }
  else if (id.startsWith('d_')) out = DEC[id.slice(2)] && W(DEC[id.slice(2)]());
  else if (CROP[id]) out = W(CROP[id]());
  else if (FRUIT[id]) out = W(FRUIT[id]());
  else if (MISC[id]) out = W(MISC[id]());
  else if (FISHP[id] || id === 'zabaks') out = fishRaw(id);
  else if (PET_KEYS[id]) out = W(PET[id]());
  if (!out) out = W(MISC.nothing());
  cache.set(key, out);
  return out;
}
export function iconEl(key, px = 34) {
  const s = document.createElement('span');
  s.className = 'svgi';
  s.style.cssText = `display:inline-block;width:${px}px;height:${px}px;vertical-align:middle`;
  s.innerHTML = icon(key);
  return s;
}

// zila stāvvietas zīme „P” (ceļa zīme 521) — izmanto arī 3D zīmes faktūrai (racetrack.js)
export function parkingSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256">
  <rect x="2" y="2" width="96" height="96" rx="12" fill="#ffffff"/>
  <rect x="7" y="7" width="86" height="86" rx="9" fill="#1d5fc4"/>
  <path fill="#ffffff" fill-rule="evenodd" d="M31 18 H56 C70 18 78 27 78 39 C78 51 70 60 56 60 H45 V82 H31 Z M45 30 V48 H55 C61 48 64 44 64 39 C64 34 61 30 55 30 Z"/>
</svg>`;
}

// autobusa pieturas zīme: zils kvadrāts ar baltu autobusu
export function busStopSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256">
  <rect x="2" y="2" width="96" height="96" rx="12" fill="#ffffff"/>
  <rect x="7" y="7" width="86" height="86" rx="9" fill="#1d5fc4"/>
  <rect x="22" y="20" width="56" height="54" rx="9" fill="#ffffff"/>
  <rect x="28" y="27" width="44" height="22" rx="3" fill="#1d5fc4"/>
  <rect x="27" y="56" width="10" height="6" rx="2" fill="#1d5fc4"/><rect x="63" y="56" width="10" height="6" rx="2" fill="#1d5fc4"/>
  <rect x="26" y="72" width="12" height="10" rx="3" fill="#ffffff"/><rect x="62" y="72" width="12" height="10" rx="3" fill="#ffffff"/>
</svg>`;
}

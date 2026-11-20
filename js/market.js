// 🛒 Mežvidu tirgus: koka tirgus būdas ar svītrainu jumtu, koka izkārtni, letes precēm, mucām un kastēm,
// karodziņu virtenes starp būdām. Viss statisks — spēle to apvieno ar flattenStatic.
// Būdas lokālās koordinātes: +z — pret pircējiem (laukuma vidu), pārdevējs stāv aiz letes (z ≈ −0,85).
import * as THREE from 'three';
import { mat, canvasTexture, makeSignBoard } from './util.js?v=1.37.0';
import { buildCart, buildNPC } from './characters.js?v=1.37.0';
import { buildDecor } from './props.js?v=1.37.0';
import * as A from './assets.js?v=1.37.0';

let plankT = null;
function plankTex() {
  return plankT || (plankT = canvasTexture(128, 128, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      const l = 0.78 + Math.random() * 0.3;
      g.fillStyle = `rgb(${150 * l | 0},${108 * l | 0},${70 * l | 0})`; g.fillRect(0, i * h / 8, w, h / 8 - 2);
      g.fillStyle = 'rgba(40,25,12,0.85)'; g.fillRect(0, i * h / 8 + h / 8 - 2, w, 2);
      for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(60,38,20,${0.1 + Math.random() * 0.2})`; g.fillRect(Math.random() * w, i * h / 8 + 2 + Math.random() * (h / 8 - 5), 10 + Math.random() * 30, 1); }
    }
  }));
}
const stripeCache = new Map();
function stripes(color) {
  if (stripeCache.has(color)) return stripeCache.get(color);
  const t = canvasTexture(256, 32, (c, w, h) => {
    for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? '#f7f2e6' : color; c.fillRect(i * w / 10, 0, w / 10, h); }
    for (let k = 0; k < 800; k++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; c.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  });
  stripeCache.set(color, t);
  return t;
}

export const buildStall = A.buildStall; // 1.37.0: jaunais modelis (assets.js)

// karodziņu virtene no a līdz b (lokālās/pasaules koordinātēs, y — piekares augstums), nokarāta pa vidu
let flagGeo = null;
export const buildBunting = A.buildBunting; // 1.37.0: jaunais modelis (assets.js)

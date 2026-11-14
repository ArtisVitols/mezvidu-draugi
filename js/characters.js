import * as THREE from 'three';
import { mat, makeBlobShadow } from './util.js';

const S = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const lighten = (hex, k) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString();
const darken = (hex, k) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#000000'), k).getHexString();

function mesh(geo, color, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

// ---------------- Spēlētāju dzīvnieki (staigā uz divām kājām) ----------------
export function buildAnimal({ animal = 'lacis', fur = '#8b5a2b', shirt = '#d23b3b', hat = null }) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // viss, kas šūpojas
  root.add(body);
  const light = lighten(fur, 0.55);
  const isBird = animal === 'pile' || animal === 'puce';
  const legColor = animal === 'pile' ? '#f39a1e' : animal === 'puce' ? '#d9a13a' : fur;

  // kājas
  const legG = new THREE.CylinderGeometry(0.1, 0.09, 0.45, 8); legG.translate(0, -0.22, 0);
  const footG = new THREE.BoxGeometry(0.2, 0.1, 0.3);
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.16, 0.55, 0);
    mesh(isBird ? new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6).translate(0, -0.22, 0) : legG, legColor, 0, 0, 0, hip);
    mesh(footG, isBird ? legColor : darken(fur, 0.25), 0, -0.47, 0.06, hip);
    body.add(hip);
    legs.push(hip);
  }
  // rumpis + krekls
  const torso = mesh(S(0.36, 12, 10), fur, 0, 0.88, 0, body);
  torso.scale.set(1, 1.15, 0.85);
  const shirtM = mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.42, 12), shirt, 0, 0.86, 0, body);
  shirtM.scale.set(1.04, 1, 0.9);
  const belly = mesh(S(0.22, 10, 8), light, 0, 1.0, 0.24, body);
  belly.scale.set(1, 0.7, 0.4);
  // rokas
  const armG = new THREE.CylinderGeometry(0.08, 0.07, 0.4, 8); armG.translate(0, -0.2, 0);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.38, 1.1, 0);
    sh.rotation.z = s * 0.25;
    mesh(armG, isBird ? fur : shirt, 0, 0, 0, sh).scale.set(1.2, 0.45, 1.2);
    mesh(armG, fur, 0, -0.12, 0, sh).scale.set(1, 0.75, 1);
    mesh(S(0.09, 8, 6), isBird ? fur : light, 0, -0.43, 0, sh);
    body.add(sh);
    arms.push(sh);
  }
  // galva
  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  body.add(head);
  const headR = animal === 'varde' ? 0.36 : 0.34;
  const skull = mesh(S(headR, 14, 12), fur, 0, 0, 0, head);
  if (animal === 'varde') skull.scale.set(1.15, 0.8, 1);
  const eyeG = S(0.055, 8, 6), eyeW = S(0.085, 8, 6);
  const eyeY = animal === 'varde' ? 0.24 : 0.06, eyeZ = animal === 'varde' ? 0.14 : 0.29, eyeX = animal === 'varde' ? 0.17 : 0.13;
  for (const s of [-1, 1]) {
    mesh(eyeW, '#ffffff', s * eyeX, eyeY, eyeZ, head).scale.set(animal === 'puce' ? 1.6 : 1, animal === 'puce' ? 1.6 : 1, 0.6);
    mesh(eyeG, '#151515', s * eyeX, eyeY, eyeZ + 0.05, head).scale.setScalar(animal === 'puce' ? 1.3 : 1);
  }
  // ausis un purni
  const earsAt = (geo, color, x, y, z, rz = 0, rx = 0, sc = [1, 1, 1]) => {
    for (const s of [-1, 1]) {
      const e = mesh(geo, color, s * x, y, z, head);
      e.rotation.set(rx, 0, -s * rz);
      e.scale.set(...sc);
    }
  };
  const snout = (color, z = 0.3, y = -0.08, sc = [1, 0.75, 0.8]) => {
    const m = mesh(S(0.15, 10, 8), color, 0, y, z, head); m.scale.set(...sc);
    mesh(S(0.05, 6, 6), '#222', 0, y + 0.05, z + 0.12, head);
    return m;
  };
  let tail = null;
  switch (animal) {
    case 'lacis':
      earsAt(S(0.1, 8, 6), fur, 0.24, 0.26, 0, 0, 0, [1, 1, 0.6]);
      snout(light);
      tail = mesh(S(0.09), fur, 0, 0.7, -0.32, body);
      break;
    case 'udrs':
      earsAt(S(0.07, 8, 6), fur, 0.25, 0.18, 0, 0, 0, [1, 1, 0.6]);
      snout(light, 0.28, -0.1, [1.2, 0.7, 0.8]);
      tail = mesh(new THREE.ConeGeometry(0.1, 0.6, 8), fur, 0, 0.55, -0.4, body); tail.rotation.x = -1.2;
      break;
    case 'apsis':
      earsAt(S(0.07, 8, 6), '#333', 0.24, 0.2, 0, 0, 0, [1, 1, 0.6]);
      mesh(new THREE.BoxGeometry(0.1, 0.05, 0.5), '#ffffff', 0, 0.3, 0.05, head).rotation.x = 0.5;
      snout('#e8e8e8', 0.3, -0.08, [0.9, 0.7, 1.1]);
      break;
    case 'puce':
      earsAt(new THREE.ConeGeometry(0.07, 0.2, 6), fur, 0.2, 0.3, 0, 0.3);
      mesh(new THREE.ConeGeometry(0.06, 0.15, 6), '#e0a020', 0, -0.06, 0.33, head).rotation.x = 1.9;
      break;
    case 'lapsa':
      earsAt(new THREE.ConeGeometry(0.1, 0.26, 6), fur, 0.19, 0.3, 0, 0.25);
      { const sn = mesh(new THREE.ConeGeometry(0.13, 0.3, 8), light, 0, -0.08, 0.36, head); sn.rotation.x = Math.PI / 2;
        mesh(S(0.045, 6, 6), '#222', 0, -0.08, 0.52, head); }
      tail = new THREE.Group();
      mesh(S(0.16, 10, 8), fur, 0, 0, -0.2, tail).scale.set(1, 1, 2.2);
      mesh(S(0.1, 8, 6), '#ffffff', 0, 0, -0.52, tail);
      tail.position.set(0, 0.6, -0.25); tail.rotation.x = 0.5; body.add(tail);
      break;
    case 'zakis':
      earsAt(S(0.08, 8, 6), fur, 0.11, 0.48, -0.02, 0.12, 0, [0.8, 3, 0.5]);
      earsAt(S(0.05, 8, 6), '#f2b5c0', 0.11, 0.48, 0.02, 0.12, 0, [0.6, 2.4, 0.3]);
      snout(light, 0.29, -0.1, [0.9, 0.6, 0.6]);
      tail = mesh(S(0.12), '#ffffff', 0, 0.65, -0.32, body);
      break;
    case 'kakis':
      earsAt(new THREE.ConeGeometry(0.1, 0.2, 4), fur, 0.18, 0.3, 0, 0.3);
      snout(light, 0.3, -0.1, [0.8, 0.6, 0.6]);
      for (const s of [-1, 1]) for (const k of [-1, 1]) {
        const w = mesh(new THREE.BoxGeometry(0.22, 0.01, 0.01), '#333', s * 0.18, -0.08 + k * 0.03, 0.3, head); w.rotation.z = s * k * 0.15;
      }
      tail = mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.7, 6), fur, 0, 0.75, -0.4, body); tail.rotation.x = -0.7;
      break;
    case 'cuka':
      earsAt(new THREE.ConeGeometry(0.1, 0.18, 4), fur, 0.2, 0.26, 0.05, 0.6, 0.4);
      { const sn = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 12), lighten(fur, 0.2), 0, -0.06, 0.33, head); sn.rotation.x = Math.PI / 2;
        for (const s of [-1, 1]) mesh(S(0.025, 6, 6), '#8a3a4a', s * 0.04, -0.06, 0.4, head); }
      tail = mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 10), fur, 0, 0.7, -0.33, body);
      break;
    case 'suns':
      earsAt(S(0.1, 8, 6), darken(fur, 0.35), 0.3, 0.02, -0.02, 0.2, 0, [0.5, 1.4, 0.8]);
      snout(light, 0.3, -0.1, [1, 0.75, 1.1]);
      tail = mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.4, 6), fur, 0, 0.75, -0.36, body); tail.rotation.x = -0.9;
      break;
    case 'varde':
      { const m = mesh(new THREE.TorusGeometry(0.16, 0.015, 6, 16, Math.PI), '#1d4a17', 0, -0.06, 0.3, head); m.rotation.z = Math.PI; }
      break;
    case 'pile':
      { const b = mesh(new THREE.BoxGeometry(0.22, 0.06, 0.2), '#f39a1e', 0, -0.06, 0.38, head); b.scale.set(1, 1, 1); }
      tail = mesh(new THREE.ConeGeometry(0.1, 0.2, 6), fur, 0, 0.8, -0.34, body); tail.rotation.x = -2;
      break;
    case 'bebrs':
      earsAt(S(0.07, 8, 6), fur, 0.24, 0.22, 0, 0, 0, [1, 1, 0.6]);
      snout(light);
      mesh(new THREE.BoxGeometry(0.1, 0.08, 0.02), '#ffffff', 0, -0.2, 0.36, head);
      tail = mesh(new THREE.BoxGeometry(0.3, 0.06, 0.5), '#5a3a1a', 0, 0.35, -0.45, body);
      break;
  }
  // vaigu sārtums
  if (!isBird && animal !== 'varde') for (const s of [-1, 1]) mesh(S(0.05, 6, 6), '#ff9aa8', s * 0.22, -0.06, 0.24, head).scale.set(1, 0.6, 0.4);

  const shadow = makeBlobShadow(1.1);
  shadow.position.y = 0.03;
  root.add(shadow);

  const hatHolder = new THREE.Group();
  hatHolder.position.y = animal === 'varde' ? 0.27 : 0.3;
  head.add(hatHolder);

  const av = {
    root, body, head, legs, arms, tail, shadow, hatHolder,
    phase: 0, emoteSprite: null,
    setHat(id) {
      while (hatHolder.children.length) hatHolder.remove(hatHolder.children[0]);
      if (id) hatHolder.add(buildHat(id));
    },
    // stāvokļi: idle, walk, run, jump, swim, sit
    animate(dt, state, speed = 0) {
      const b = this;
      if (state === 'walk' || state === 'run') {
        b.phase += dt * (state === 'run' ? 13 : 9);
        const k = state === 'run' ? 0.9 : 0.6;
        const s = Math.sin(b.phase);
        b.legs[0].rotation.x = s * k; b.legs[1].rotation.x = -s * k;
        b.arms[0].rotation.x = -s * k; b.arms[1].rotation.x = s * k;
        b.body.position.y = Math.abs(Math.cos(b.phase)) * 0.07;
        b.body.rotation.x = state === 'run' ? 0.12 : 0.04;
        b.body.rotation.z = 0;
      } else if (state === 'jump') {
        b.legs[0].rotation.x = 0.6; b.legs[1].rotation.x = -0.3;
        b.arms[0].rotation.x = -2.6; b.arms[1].rotation.x = -2.6;
        b.body.position.y = 0;
        b.body.rotation.x = 0;
      } else if (state === 'swim') {
        b.phase += dt * 6;
        const s = Math.sin(b.phase);
        b.legs[0].rotation.x = s * 0.5; b.legs[1].rotation.x = -s * 0.5;
        b.arms[0].rotation.x = -1.5 + s * 1.2; b.arms[1].rotation.x = -1.5 - s * 1.2;
        b.body.rotation.x = 0.9;
        b.body.position.y = 0;
      } else if (state === 'sit') {
        b.legs[0].rotation.x = -1.5; b.legs[1].rotation.x = -1.5;
        b.arms[0].rotation.x = -1.1; b.arms[1].rotation.x = -1.1;
        b.body.rotation.x = 0; b.body.position.y = 0;
      } else if (state === 'pet') {
        b.phase += dt * 8;
        b.arms[1].rotation.x = -1.4 + Math.sin(b.phase) * 0.3; b.arms[0].rotation.x = 0;
        b.legs[0].rotation.x = 0; b.legs[1].rotation.x = 0;
        b.body.rotation.x = 0.25;
      } else if (state === 'wave') {
        b.phase += dt * 10;
        b.arms[1].rotation.x = -2.8; b.arms[1].rotation.z = 0.25 + Math.sin(b.phase) * 0.4;
        b.legs[0].rotation.x *= 0.8; b.legs[1].rotation.x *= 0.8;
        b.body.rotation.x = 0;
      } else {
        b.phase += dt * 2;
        const d = 1 - Math.min(1, dt * 10);
        b.legs[0].rotation.x *= d; b.legs[1].rotation.x *= d;
        b.arms[0].rotation.x = Math.sin(b.phase) * 0.05; b.arms[1].rotation.x = -Math.sin(b.phase) * 0.05;
        b.arms[1].rotation.z = 0.25;
        b.body.position.y = Math.sin(b.phase) * 0.015;
        b.body.rotation.x *= d;
      }
      if (state !== 'wave') b.arms[1].rotation.z = 0.25;
      if (b.tail) b.tail.rotation.y = Math.sin(b.phase * 0.7) * 0.3;
    },
  };
  av.setHat(hat);
  return av;
}

export function buildHat(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'salmu': {
      mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 16), '#e8cf6a', 0, 0, 0, g);
      mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.22, 14), '#e2c35a', 0, 0.11, 0, g);
      mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.06, 14), '#d23b3b', 0, 0.04, 0, g);
      break;
    }
    case 'vainags': {
      const t = mesh(new THREE.TorusGeometry(0.27, 0.05, 6, 16), '#3f8a2f', 0, 0, 0, g); t.rotation.x = Math.PI / 2;
      const cols = ['#ffffff', '#ffe03a', '#3a7ae8', '#e8302a', '#b06ae0'];
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2;
        mesh(S(0.06, 6, 6), cols[i % 5], Math.cos(a) * 0.27, 0.04, Math.sin(a) * 0.27, g);
      }
      break;
    }
    case 'ozols': {
      const t = mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 16), '#2f6b24', 0, 0, 0, g); t.rotation.x = Math.PI / 2;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        const l = mesh(new THREE.BoxGeometry(0.12, 0.02, 0.07), '#3f8a2f', Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3, g);
        l.rotation.y = -a;
      }
      break;
    }
    case 'cilindrs': {
      mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 16), '#151515', 0, 0, 0, g);
      mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.45, 16), '#151515', 0, 0.23, 0, g);
      mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.07, 16), '#b02020', 0, 0.06, 0, g);
      break;
    }
    case 'kronis': {
      mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12, 1, true), '#f2c12e', 0, 0.07, 0, g);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        mesh(new THREE.ConeGeometry(0.05, 0.14, 4), '#f2c12e', Math.cos(a) * 0.22, 0.2, Math.sin(a) * 0.22, g);
        mesh(S(0.03, 6, 6), ['#e8302a', '#3a7ae8'][i % 2], Math.cos(a) * 0.245, 0.07, Math.sin(a) * 0.245, g);
      }
      break;
    }
  }
  return g;
}

// ---------------- Meža dzīvnieki (NPC) ----------------
export function buildNPC(type) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs = [];
  const quad = (color, h, w, l, lr = 0.06) => {
    const lg = new THREE.CylinderGeometry(lr, lr * 0.8, h, 6); lg.translate(0, -h / 2, 0);
    for (const [x, z] of [[-w, l], [w, l], [-w, -l], [w, -l]]) {
      const hip = new THREE.Group(); hip.position.set(x, h, z);
      mesh(lg, color, 0, 0, 0, hip);
      body.add(hip); legs.push(hip);
    }
  };
  let scale = 1, hop = false;
  switch (type) {
    case 'stirna': {
      quad('#7a5232', 0.8, 0.18, 0.4, 0.05);
      const b = mesh(S(0.4, 10, 8), '#a8743f', 0, 1.05, 0, body); b.scale.set(0.75, 0.75, 1.45);
      mesh(S(0.12), '#ffffff', 0, 1.15, -0.55, body);
      const neck = mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.55, 8), '#a8743f', 0, 1.4, 0.5, body); neck.rotation.x = 0.5;
      const head = mesh(S(0.17, 10, 8), '#a8743f', 0, 1.7, 0.68, body); head.scale.set(0.9, 0.9, 1.3);
      mesh(S(0.04, 6, 6), '#222', 0, 1.66, 0.88, body);
      for (const s of [-1, 1]) {
        const e = mesh(S(0.07, 6, 6), '#a8743f', s * 0.12, 1.86, 0.6, body); e.scale.set(0.6, 1.4, 0.4);
        mesh(S(0.025, 6, 6), '#111', s * 0.08, 1.74, 0.82, body);
      }
      break;
    }
    case 'zakis': {
      hop = true; scale = 0.7;
      const b = mesh(S(0.3, 10, 8), '#9b8466', 0, 0.35, 0, body); b.scale.set(0.9, 0.85, 1.2);
      const h = mesh(S(0.18, 10, 8), '#9b8466', 0, 0.62, 0.3, body);
      for (const s of [-1, 1]) {
        const e = mesh(S(0.06, 6, 6), '#9b8466', s * 0.07, 0.92, 0.25, body); e.scale.set(0.7, 3, 0.5);
        mesh(S(0.03, 6, 6), '#111', s * 0.09, 0.66, 0.44, body);
      }
      mesh(S(0.09, 6, 6), '#ffffff', 0, 0.42, -0.36, body);
      for (const s of [-1, 1]) { const f = mesh(S(0.08, 6, 6), '#9b8466', s * 0.13, 0.08, -0.12, body); f.scale.set(0.8, 0.6, 1.8); legs.push(f); }
      break;
    }
    case 'ezis': {
      scale = 0.7;
      const b = mesh(new THREE.IcosahedronGeometry(0.35, 1), '#4a3a2a', 0, 0.28, -0.05, body); b.scale.set(1, 0.75, 1.25);
      b.material = new THREE.MeshLambertMaterial({ color: '#4a3a2a', flatShading: true });
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, r = 0.32;
        const sp = mesh(new THREE.ConeGeometry(0.05, 0.22, 4), '#2e241a', Math.cos(a) * r * 0.8, 0.38 + Math.sin(i * 1.7) * 0.08, Math.sin(a) * r - 0.05, body);
        sp.lookAt(Math.cos(a) * 3, 2.5, Math.sin(a) * 3); sp.rotateX(Math.PI / 2);
      }
      const f = mesh(new THREE.ConeGeometry(0.15, 0.32, 8), '#c9a77a', 0, 0.22, 0.4, body); f.rotation.x = Math.PI / 2;
      mesh(S(0.04, 6, 6), '#111', 0, 0.22, 0.57, body);
      for (const s of [-1, 1]) mesh(S(0.025, 6, 6), '#111', s * 0.07, 0.3, 0.42, body);
      quad('#c9a77a', 0.12, 0.15, 0.15, 0.04);
      break;
    }
    case 'mezacuka': {
      quad('#2e241c', 0.4, 0.2, 0.35, 0.07);
      const b = mesh(S(0.45, 10, 8), '#4a3a2c', 0, 0.75, 0, body); b.scale.set(0.8, 0.85, 1.4);
      const h = mesh(S(0.28, 10, 8), '#4a3a2c', 0, 0.75, 0.62, body); h.scale.set(0.85, 0.9, 1.1);
      const sn = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 10), '#6a5040', 0, 0.68, 0.9, body); sn.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        const t = mesh(new THREE.ConeGeometry(0.03, 0.14, 5), '#f4f0e0', s * 0.1, 0.62, 0.86, body); t.rotation.x = -0.6;
        mesh(new THREE.ConeGeometry(0.07, 0.14, 4), '#3a2e22', s * 0.15, 1.0, 0.55, body);
        mesh(S(0.03, 6, 6), '#111', s * 0.13, 0.82, 0.84, body);
      }
      const crest = mesh(new THREE.BoxGeometry(0.06, 0.12, 0.9), '#2a2018', 0, 1.12, 0.05, body);
      crest.rotation.x = 0;
      break;
    }
    case 'vavere': {
      scale = 0.55; hop = true;
      const b = mesh(S(0.25, 10, 8), '#c4561e', 0, 0.35, 0, body); b.scale.set(0.8, 1.1, 0.9);
      mesh(S(0.15, 8, 6), '#f0d0a0', 0, 0.35, 0.16, body).scale.set(0.8, 1.2, 0.4);
      mesh(S(0.18, 10, 8), '#c4561e', 0, 0.68, 0.06, body);
      for (const s of [-1, 1]) {
        mesh(new THREE.ConeGeometry(0.05, 0.14, 4), '#c4561e', s * 0.1, 0.86, 0.02, body);
        mesh(S(0.03, 6, 6), '#111', s * 0.07, 0.72, 0.21, body);
      }
      const t = mesh(S(0.22, 10, 8), '#d4662e', 0, 0.6, -0.3, body); t.scale.set(0.8, 1.8, 0.7); t.rotation.x = -0.3;
      for (const s of [-1, 1]) { const f = mesh(S(0.07, 6, 6), '#c4561e', s * 0.12, 0.06, 0, body); f.scale.set(0.8, 0.6, 1.6); legs.push(f); }
      break;
    }
    case 'starkis': {
      quad('#e03a2a', 1.0, 0.08, 0, 0.025);
      legs.splice(2, 2).forEach((l) => body.remove(l));
      const b = mesh(S(0.32, 10, 8), '#ffffff', 0, 1.25, 0, body); b.scale.set(0.8, 0.8, 1.4);
      for (const s of [-1, 1]) { const w = mesh(S(0.2, 8, 6), '#1a1a1a', s * 0.24, 1.27, -0.12, body); w.scale.set(0.3, 0.7, 1.8); }
      const neck = mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 8), '#ffffff', 0, 1.6, 0.35, body); neck.rotation.x = 0.35;
      mesh(S(0.12, 8, 6), '#ffffff', 0, 1.92, 0.46, body);
      const beak = mesh(new THREE.ConeGeometry(0.04, 0.45, 6), '#e03a2a', 0, 1.9, 0.7, body); beak.rotation.x = Math.PI / 2 + 0.25;
      for (const s of [-1, 1]) mesh(S(0.025, 6, 6), '#111', s * 0.08, 1.96, 0.52, body);
      break;
    }
  }
  const shadow = makeBlobShadow(type === 'stirna' || type === 'mezacuka' ? 1.6 : 0.9);
  shadow.position.y = 0.03;
  root.add(shadow);
  root.scale.setScalar(scale);
  return {
    root, body, legs, phase: Math.random() * 10,
    animate(dt, moving, speed) {
      if (moving) {
        this.phase += dt * (hop ? 9 : 8) * Math.min(1.5, speed / 1.2 + 0.4);
        if (hop) {
          this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.35;
        } else {
          const s = Math.sin(this.phase) * 0.5;
          this.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3) ? s : -s; });
        }
      } else {
        this.body.position.y *= 0.8;
        this.legs.forEach((l) => { l.rotation.x *= 0.85; });
      }
    },
  };
}

// ---------------- Karts ----------------
export function buildKart(color = '#e02a2a') {
  const g = new THREE.Group();
  const base = mesh(new THREE.BoxGeometry(1.4, 0.25, 2.2), color, 0, 0.35, 0, g);
  const nose = mesh(new THREE.BoxGeometry(1.1, 0.3, 0.6), color, 0, 0.42, 1.2, g);
  nose.rotation.x = 0.25;
  mesh(new THREE.BoxGeometry(1.5, 0.12, 0.3), '#222', 0, 0.38, 1.55, g);
  mesh(new THREE.BoxGeometry(0.9, 0.5, 0.2), '#333', 0, 0.75, -0.6, g); // sēdekļa atzveltne
  mesh(new THREE.BoxGeometry(1.5, 0.08, 0.4), color, 0, 1.0, -1.05, g); // spoileris
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), '#333', s * 0.6, 0.75, -1.05, g);
  const sw = mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 12), '#222', 0, 0.85, 0.45, g);
  sw.rotation.x = -0.9;
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.32, 0.32, 0.3, 12); wg.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.8, 0.75], [0.8, 0.75], [-0.8, -0.75], [0.8, -0.75]]) {
    const w = mesh(wg, '#1c1c1c', x, 0.32, z, g);
    mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.31, 8).rotateZ(Math.PI / 2), '#bbbbbb', 0, 0, 0, w);
    wheels.push(w);
  }
  const seat = new THREE.Group();
  seat.position.set(0, 0.0, -0.25);
  g.add(seat);
  const shadow = makeBlobShadow(2.6);
  shadow.position.y = 0.04;
  g.add(shadow);
  return { root: g, wheels, seat, base, setColor(c) { base.material = mat(c); nose.material = mat(c); } };
}

// ---------------- Tirgotāja ratiņi ----------------
export function buildCart(color = '#3c9a4a', iceCream = false) {
  const g = new THREE.Group();
  mesh(new THREE.BoxGeometry(2.6, 1.0, 1.4), '#a0703f', 0, 0.9, 0, g);
  mesh(new THREE.BoxGeometry(2.7, 0.1, 1.5), '#7a5230', 0, 1.45, 0, g);
  const wg = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 12); wg.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) mesh(wg, '#5a3a1a', s * 0.9, 0.45, 0.76, g);
  for (const s of [-1, 1]) mesh(wg, '#5a3a1a', s * 0.9, 0.45, -0.76, g);
  for (const [x, z] of [[-1.25, -0.65], [1.25, -0.65], [-1.25, 0.65], [1.25, 0.65]]) {
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), '#dddddd', x, 2.1, z, g);
  }
  // svītraina markīze
  for (let i = 0; i < 6; i++) {
    const st = mesh(new THREE.BoxGeometry(0.48, 0.06, 1.7), i % 2 ? '#ffffff' : color, -1.2 + i * 0.48, 2.85, 0, g);
    st.rotation.x = 0;
  }
  // preces uz galda
  if (iceCream) {
    const cols = ['#ffd1dc', '#fff3b0', '#c6f0c2', '#8a5a3a'];
    cols.forEach((c, i) => {
      mesh(new THREE.ConeGeometry(0.1, 0.3, 8).rotateX(Math.PI), '#e0b070', -0.8 + i * 0.5, 1.65, 0.3, g);
      mesh(S(0.12, 8, 6), c, -0.8 + i * 0.5, 1.85, 0.3, g);
    });
  } else {
    const cols = ['#f07b1a', '#e0302a', '#5fae4a', '#f2c12e', '#7a4a22'];
    for (let i = 0; i < 8; i++) mesh(S(0.14, 8, 6), cols[i % 5], -1.0 + i * 0.28, 1.6, 0.35 - (i % 2) * 0.3, g);
  }
  return g;
}

// ---------------- Sēnes ----------------
export function buildMushroom(def) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.28, 8), def.stem, 0, 0.14, 0, g);
  const capG = new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const cap = mesh(capG, def.cap, 0, 0.26, 0, g);
  cap.scale.set(1, def.poison ? 0.7 : 0.8, 1);
  if (def.poison) {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      mesh(S(0.025, 4, 4), '#ffffff', Math.cos(a) * 0.12, 0.36, Math.sin(a) * 0.12, g);
    }
  }
  g.scale.setScalar(1.4);
  return g;
}

export function buildStar() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.22 : 0.5, a = i / 10 * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
  geo.center();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#ffd21a', emissive: '#a07000' }));
}

// ---------------- Augi dārzā ----------------
export function buildCrop(crop, stage, color) {
  const g = new THREE.Group();
  if (stage === 0) {
    for (const s of [-1, 1]) {
      const l = mesh(S(0.08, 6, 4), '#5fbf3a', s * 0.06, 0.08, 0, g); l.scale.set(1, 0.4, 0.6);
    }
    return g;
  }
  const h = stage === 1 ? 0.35 : 0.55;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const l = mesh(new THREE.ConeGeometry(0.07, h, 4), '#4caf35', Math.cos(a) * 0.08, h / 2, Math.sin(a) * 0.08, g);
    l.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
  }
  if (stage === 2) {
    switch (crop) {
      case 'burkans': { const c = mesh(new THREE.ConeGeometry(0.11, 0.35, 8), color, 0, 0.02, 0, g); c.rotation.x = Math.PI; break; }
      case 'kartupelis': for (let i = 0; i < 3; i++) mesh(S(0.09, 6, 5), color, (i - 1) * 0.15, 0.06, 0.12, g); break;
      case 'tomats': for (let i = 0; i < 3; i++) mesh(S(0.09, 8, 6), color, Math.cos(i * 2) * 0.14, 0.35 + i * 0.06, Math.sin(i * 2) * 0.14, g); break;
      case 'zemene': for (let i = 0; i < 4; i++) mesh(new THREE.ConeGeometry(0.06, 0.12, 6).rotateX(Math.PI), color, Math.cos(i * 1.6) * 0.18, 0.1, Math.sin(i * 1.6) * 0.18, g); break;
      case 'kirbis': { const p = mesh(S(0.3, 12, 8), color, 0, 0.22, 0.05, g); p.scale.set(1.2, 0.8, 1.2); mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 5), '#4a6a1a', 0, 0.48, 0.05, g); break; }
    }
  }
  return g;
}

export function buildHeart() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.3);
  shape.bezierCurveTo(-0.5, 0.05, -0.25, 0.4, 0, 0.18);
  shape.bezierCurveTo(0.25, 0.4, 0.5, 0.05, 0, -0.3);
  const geo = new THREE.ShapeGeometry(shape);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ff3a6a', side: THREE.DoubleSide, transparent: true }));
}

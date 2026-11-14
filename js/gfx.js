// Reālistiskāka grafika: foto faktūras reljefam, HDRI debesu apgaismojums, ūdens ar atspulgiem un
// pēcapstrāde (apkārtnes aizēnojums, mirdzums, krāsu korekcija). Darbojas tikai "Augsta"/"Vidēja" grafikā.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const LAYERS = ['meadow', 'forest', 'sand', 'dirt', 'rock'];
// faktūras atkārtojums uz metru katram slānim
const SCALES = [0.09, 0.28, 0.22, 0.2, 0.14];

function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Neizdevās ielādēt ' + url));
    im.src = url;
  });
}

// vairāki attēli -> viena masīva faktūra (sampler2DArray), lai ietaupītu faktūru vietas
async function arrayTexture(urls, size, srgb) {
  const ims = await Promise.all(urls.map(loadImage));
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const data = new Uint8Array(size * size * 4 * ims.length);
  ims.forEach((im, i) => {
    g.drawImage(im, 0, 0, size, size);
    data.set(g.getImageData(0, 0, size, size).data, i * size * size * 4);
  });
  const t = new THREE.DataArrayTexture(data, size, size, ims.length);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export async function loadTexture(url, srgb = true, repeat = 1) {
  const t = await new THREE.TextureLoader().loadAsync(url);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

// ---------- reljefa materiāls ar 5 foto slāņiem ----------
export async function terrainMaterial() {
  const [alb, nor] = await Promise.all([
    arrayTexture(LAYERS.map((l) => `assets/tex/${l}_c.jpg`), 1024, true),
    arrayTexture(LAYERS.map((l) => `assets/tex/${l}_n.jpg`), 512, false),
  ]);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tAlb = { value: alb };
    sh.uniforms.tNor = { value: nor };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray tAlb;
uniform sampler2DArray tNor;
varying vec4 vSplat;
varying vec3 vWPos;
varying vec3 vWNorm;
float tW[5];
float tTot;`)
      .replace('#include <map_fragment>', `
{
  vec4 s4 = clamp(vSplat, 0.0, 1.0);
  float w[5];
  w[0] = max(0.0, 1.0 - s4.x - s4.y - s4.z - s4.w); w[1] = s4.x; w[2] = s4.y; w[3] = s4.z; w[4] = s4.w;
  float sc[5] = float[5](${SCALES.map((v) => v.toFixed(3)).join(', ')});
  vec3 lt[5] = vec3[5](vec3(1.0), vec3(0.62, 0.62, 0.5), vec3(1.0), vec3(0.85, 0.85, 0.8), vec3(1.15));
  vec2 p = vWPos.xz;
  vec2 dx = dFdx(p), dy = dFdy(p);
  vec3 al[5];
  float hg[5];
  float ma = 0.0;
  for (int i = 0; i < 5; i++) {
    al[i] = vec3(0.0); hg[i] = 0.0;
    if (w[i] > 0.015) {
      vec2 uv = p * sc[i];
      vec3 a = textureGrad(tAlb, vec3(uv, float(i)), dx * sc[i], dy * sc[i]).rgb;
      vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.23 + vec2(0.37, 0.11);
      vec3 b = textureGrad(tAlb, vec3(uv2, float(i)), dx * sc[i] * 0.23, dy * sc[i] * 0.23).rgb;
      a = mix(a, b, 0.42) * lt[i];
      al[i] = a;
      hg[i] = dot(a, vec3(0.6));
    }
    ma = max(ma, hg[i] + w[i]);
  }
  tTot = 0.0;
  vec3 albedo = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    tW[i] = w[i] > 0.015 ? max(hg[i] + w[i] - ma + 0.22, 0.0) : 0.0;
    tTot += tW[i];
    albedo += al[i] * tW[i];
  }
  albedo /= max(tTot, 1e-4);
  diffuseColor.rgb *= albedo;
}`)
      .replace('#include <color_fragment>', `
#ifdef USE_COLOR
  diffuseColor.rgb *= mix(vec3(1.0), vColor * 3.6, 0.32);
#endif`)
      .replace('#include <normal_fragment_maps>', `
{
  float sc[5] = float[5](${SCALES.map((v) => v.toFixed(3)).join(', ')});
  vec2 p = vWPos.xz;
  vec2 dx = dFdx(p), dy = dFdy(p);
  vec3 nT = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    if (tW[i] > 0.0) nT += (textureGrad(tNor, vec3(p * sc[i], float(i)), dx * sc[i], dy * sc[i]).xyz * 2.0 - 1.0) * tW[i];
  }
  nT /= max(tTot, 1e-4);
  nT.xy *= 1.1;
  vec3 N = normalize(vWNorm);
  vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
  vec3 B = cross(T, N);
  vec3 wn = normalize(T * nT.x + B * nT.y + N * max(nT.z, 0.2));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`);
  };
  m.customProgramCacheKey = () => 'terrain-photo-v1';
  return m;
}

// ---------- HDRI apkārtnes apgaismojums (pagriezts, lai saule sakristu ar mūsu sauli) ----------
export async function hdrEnvironment(renderer, sunDir, intensity = 1) {
  const hdr = await new RGBELoader().loadAsync('assets/sky.hdr');
  hdr.minFilter = hdr.magFilter = THREE.LinearFilter;
  hdr.generateMipmaps = false;
  // saule HDRI attēlā ir pie u=0.6, v≈0.21 (augstums ~52°)
  const texSunAz = (0.598 - 0.5) * Math.PI * 2;
  const ourAz = Math.atan2(sunDir.z, sunDir.x);
  const rot = texSunAz - ourAz;
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { tHdr: { value: hdr }, uRot: { value: rot }, uInt: { value: intensity } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tHdr; uniform float uRot; uniform float uInt; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float c = cos(uRot), s = sin(uRot);
        d = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
        vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
        vec3 col = texture2D(tHdr, uv).rgb;
        col = min(col, vec3(12.0)); // saules punkts tikai mīksts — tiešo sauli dod virziena gaisma
        gl_FragColor = vec4(col * uInt, 1.0);
      }`,
  });
  const sc = new THREE.Scene();
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(sc, 0, 0.1, 1000).texture;
  pmrem.dispose();
  hdr.dispose();
  return env;
}

// ---------- ūdens: krasta caurspīdīgums, putu josla, atspulgi ----------
export function upgradeWater(world, reflection) {
  const m = world.water.material;
  m.color.set('#1d3e48');
  m.opacity = 1;
  m.roughness = 0.04;
  m.metalness = 0.0;
  const half = world.size / 2;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tHeight = { value: world.heightTex };
    sh.uniforms.uHalf = { value: half };
    sh.uniforms.uWater = { value: world.waterY };
    sh.uniforms.uTime = world.waterTime;
    if (reflection) {
      sh.uniforms.tRefl = { value: reflection.rt.texture };
      sh.uniforms.uReflMat = { value: reflection.textureMatrix };
    }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos2;${reflection ? '\nuniform mat4 uReflMat;\nvarying vec4 vRefl;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvWPos2 = (modelMatrix * vec4(transformed, 1.0)).xyz;${reflection ? '\nvRefl = uReflMat * vec4(vWPos2, 1.0);' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tHeight; uniform float uHalf; uniform float uWater; uniform float uTime;
varying vec3 vWPos2;
${reflection ? 'uniform sampler2D tRefl; varying vec4 vRefl;' : ''}
float wDepth;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 huv = (vWPos2.xz + uHalf) / (2.0 * uHalf);
  float gh = texture2D(tHeight, huv).r;
  wDepth = uWater - gh;
  vec3 shallow = vec3(0.16, 0.2, 0.13), deep = vec3(0.025, 0.07, 0.085);
  diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 2.2, wDepth));
  diffuseColor.a = smoothstep(-0.02, 0.55, wDepth) * 0.94 + 0.04;
  // viegla putu josla pie krasta
  float foam = (1.0 - smoothstep(0.0, 0.14, wDepth)) * (0.55 + 0.45 * sin(uTime * 1.6 + vWPos2.x * 0.7 + vWPos2.z * 0.5));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85), foam * 0.35 * step(0.0, wDepth));
}`);
    if (reflection) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
{
  vec2 dist = normal.xz * 0.04;
  vec3 refl = texture2DProj(tRefl, vec4(vRefl.xy + dist * vRefl.w, vRefl.zw)).rgb;
  vec3 V = normalize(cameraPosition - vWPos2);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(V, vec3(0.0, 1.0, 0.0)), 0.0), 5.0);
  fres = clamp(fres * 1.1 + 0.06, 0.0, 0.9);
  outgoingLight = mix(outgoingLight, refl, fres);
  diffuseColor.a = max(diffuseColor.a, fres * smoothstep(-0.02, 0.3, wDepth));
}
#include <opaque_fragment>`);
    }
  };
  m.customProgramCacheKey = () => 'water-v2' + (reflection ? 'r' : '');
  m.needsUpdate = true;
}

// ---------- plaknes atspulgs (Reflector loģika, mazākā izšķirtspējā) ----------
export class PlanarReflection {
  constructor(scale = 0.5) {
    this.scale = scale;
    this.rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
    this.rt.texture.generateMipmaps = false;
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.set(0);
    this.textureMatrix = new THREE.Matrix4();
    this.enabled = true;
  }
  setSize(w, h) { this.rt.setSize(Math.max(16, Math.floor(w * this.scale)), Math.max(16, Math.floor(h * this.scale))); }
  update(renderer, scene, camera, water, y) {
    const normal = new THREE.Vector3(0, 1, 0), mirrorPos = new THREE.Vector3(0, y, 0);
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    if (camPos.y < y) return;
    const view = new THREE.Vector3(camPos.x, 2 * y - camPos.y, camPos.z);
    const target = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())).add(camPos);
    target.y = 2 * y - target.y;
    const vc = this.cam;
    vc.position.copy(view);
    vc.up.set(0, -1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())).reflect(normal);
    vc.lookAt(target);
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // slīpā tuvā plakne nogriež visu, kas zem ūdens
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, mirrorPos);
    plane.applyMatrix4(vc.matrixWorldInverse);
    const cp = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = vc.projectionMatrix, q = new THREE.Vector4();
    q.x = (Math.sign(cp.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(cp.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    cp.multiplyScalar(2.0 / cp.dot(q));
    pm.elements[2] = cp.x; pm.elements[6] = cp.y; pm.elements[10] = cp.z + 1.0; pm.elements[14] = cp.w;
    water.visible = false;
    const prevRT = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = prevShadow;
    water.visible = true;
  }
}

// ---------- pēcapstrāde ----------
const FS_VERT = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.depthTex = new THREE.DepthTexture(size.x, size.y);
    this.depthTex.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4, depthTexture: this.depthTex });
    this.rt.texture.generateMipmaps = false;
    const mk = (s) => { const r = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: false }); r.texture.generateMipmaps = false; r.k = s; return r; };
    this.aoRT = mk(0.5);
    this.bA = mk(0.25);
    this.bB = mk(0.25);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(tri);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);

    this.aoMat = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: this.depthTex }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uRadius: { value: 1.1 } },
      vertexShader: FS_VERT,
      fragmentShader: `
        uniform sampler2D tDepth; uniform mat4 uProjInv; uniform mat4 uProj; uniform float uRadius; varying vec2 vUv;
        vec3 vpos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec4 v = uProjInv * c; return v.xyz / v.w; }
        void main(){
          float d = texture2D(tDepth, vUv).x;
          if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
          vec3 P = vpos(vUv);
          vec3 N = normalize(cross(dFdx(P), dFdy(P)));
          if (dot(N, P) > 0.0) N = -N;
          float rUv = uRadius * uProj[1][1] * 0.5 / max(-P.z, 0.1);
          rUv = min(rUv, 0.08);
          float ang = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
          float occ = 0.0;
          for (int i = 0; i < 10; i++) {
            float fi = float(i) + 0.5;
            float a = ang + fi * 2.39996;
            vec2 off = vec2(cos(a), sin(a)) * rUv * sqrt(fi / 10.0);
            vec3 S = vpos(vUv + off);
            vec3 v = S - P;
            float dl = length(v);
            occ += max(0.0, dot(N, v / max(dl, 1e-4)) - 0.12) * (1.0 - smoothstep(uRadius * 0.6, uRadius * 2.0, dl));
          }
          float ao = clamp(1.0 - occ / 10.0 * 1.6, 0.0, 1.0);
          ao = mix(ao, 1.0, smoothstep(60.0, 140.0, -P.z));
          gl_FragColor = vec4(ao, ao, ao, 1.0);
        }`,
    });
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: this.rt.texture }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 1.6 } },
      vertexShader: FS_VERT,
      fragmentShader: `uniform sampler2D tColor; uniform vec2 uTexel; uniform float uThr; varying vec2 vUv;
        void main(){
          vec3 c = (texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb +
                    texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25;
          float l = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c * max(l - uThr, 0.0) / max(l, 1e-4), 1.0);
        }`,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tIn: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT,
      fragmentShader: `uniform sampler2D tIn; uniform vec2 uDir; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tIn, vUv).rgb * 0.227;
          c += (texture2D(tIn, vUv + uDir * 1.385).rgb + texture2D(tIn, vUv - uDir * 1.385).rgb) * 0.316;
          c += (texture2D(tIn, vUv + uDir * 3.231).rgb + texture2D(tIn, vUv - uDir * 3.231).rgb) * 0.070;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rt.texture }, tAO: { value: this.aoRT.texture }, tBloom: { value: this.bA.texture },
        uAOTexel: { value: new THREE.Vector2() }, uExposure: { value: 0.62 }, uAO: { value: 0.85 }, uBloom: { value: 0.35 },
      },
      vertexShader: FS_VERT,
      fragmentShader: `
        uniform sampler2D tColor, tAO, tBloom; uniform vec2 uAOTexel; uniform float uExposure, uAO, uBloom; varying vec2 vUv;
        vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
        vec3 aces(vec3 c){
          const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
          const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
          c *= uExposure / 0.6; c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0);
        }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec3 c = texture2D(tColor, vUv).rgb;
          float ao = (texture2D(tAO, vUv + uAOTexel * vec2(-0.75, -0.75)).r + texture2D(tAO, vUv + uAOTexel * vec2(0.75, -0.75)).r +
                      texture2D(tAO, vUv + uAOTexel * vec2(-0.75, 0.75)).r + texture2D(tAO, vUv + uAOTexel * vec2(0.75, 0.75)).r) * 0.25;
          c *= mix(1.0, ao, uAO);
          c += texture2D(tBloom, vUv).rgb * uBloom;
          c = toSRGB(aces(c));
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, 1.08);                         // piesātinājums
          c = (c - 0.5) * 1.05 + 0.5;                         // kontrasts
          c *= mix(vec3(0.97, 1.0, 1.04), vec3(1.03, 1.0, 0.95), smoothstep(0.15, 0.85, l)); // vēsas ēnas, silta gaisma
          vec2 q = vUv - 0.5;
          c *= 1.0 - 0.28 * pow(clamp(length(q) * 1.3, 0.0, 1.0), 2.4);  // vinjete
          c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
          gl_FragColor = vec4(c, 1.0);
        }`,
      toneMapped: false,
    });
    this.setSize();
  }

  setSize() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.w = s.x; this.h = s.y;
    this.rt.setSize(s.x, s.y);
    this.depthTex.image.width = s.x; this.depthTex.image.height = s.y;
    for (const r of [this.aoRT, this.bA, this.bB]) r.setSize(Math.max(8, Math.floor(s.x * r.k)), Math.max(8, Math.floor(s.y * r.k)));
    this.brightMat.uniforms.uTexel.value.set(1 / s.x, 1 / s.y);
    this.compMat.uniforms.uAOTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    this.aoMat.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
    this.aoMat.uniforms.uProj.value.copy(camera.projectionMatrix);
    this.pass(this.aoMat, this.aoRT);
    this.pass(this.brightMat, this.bA);
    this.blurMat.uniforms.tIn.value = this.bA.texture; this.blurMat.uniforms.uDir.value.set(1 / this.bA.width, 0);
    this.pass(this.blurMat, this.bB);
    this.blurMat.uniforms.tIn.value = this.bB.texture; this.blurMat.uniforms.uDir.value.set(0, 1 / this.bA.height);
    this.pass(this.blurMat, this.bA);
    this.pass(this.compMat, null);
  }
}

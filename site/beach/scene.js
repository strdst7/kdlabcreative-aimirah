// The particle beach: a Three.js scene made of luminous points.
// Particles are placed once. Waves, colour and light run on the GPU.
import * as THREE from "./three.module.min.js";
import {
  COMMON, SKY_VERT, SKY_FRAG, POINT_FRAG, OCEAN_VERT, SAND_VERT, MOUNTAIN_VERT, STRUCT_VERT,
  WHEEL_VERT, DUST_VERT, FLOW_VERT, FLOW_FRAG, RIBBON_VERT, RIBBON_FRAG, SPRITE_VERT, SPRITE_FRAG,
} from "./shaders.js";
import { clamp, lerp, smooth } from "./palette.js";

const TAU = Math.PI * 2;
const CAM_Y = 9;
const CAM_Z = 12;
const HORIZON = 0.41; // horizon sits at 41% of the screen height, measured from the top

// ---------- small helpers ----------

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const shoreZ = (x) => -17 - 0.14 * x + 1.6 * Math.sin(x * 0.11 + 1.3) + 0.7 * Math.sin(x * 0.27);

const WV = [
  [46, 0.0, 0.55], [26, 0.38, 0.34], [13.5, -0.52, 0.19], [7.2, 0.95, 0.1], [3.7, -1.2, 0.055],
];
// Same swells as the GPU, for things that must sit on the water (the boat, the pointer wake).
export function waveH(x, z, t, amp) {
  const px = x + 0.9 * Math.sin(z * 0.045 + t * 0.13);
  const pz = z + 0.9 * Math.cos(x * 0.05 - t * 0.11);
  const dsh = shoreZ(x) - z;
  const a0 = amp * (0.2 + 0.8 * smooth(0, 34, dsh));
  let h = 0;
  for (let i = 0; i < 5; i++) {
    const [wl, ang, fr] = WV[i];
    const k = TAU / wl;
    const om = Math.sqrt(9.81 * k) * 0.5;
    h += a0 * fr * 1.1 * Math.sin(k * (Math.sin(ang) * px + Math.cos(ang) * pz) - om * t + i * 1.7);
  }
  return h;
}

const PREMULT = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
};

function pointsFrom(positions, rnd, extra, material, order) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 4));
  if (extra) for (const [name, arr, size] of extra) g.setAttribute(name, new THREE.BufferAttribute(arr, size));
  const p = new THREE.Points(g, material);
  p.frustumCulled = false;
  p.renderOrder = order;
  return p;
}

function randomAttr(n, rand) {
  const a = new Float32Array(n * 4);
  for (let i = 0; i < a.length; i++) a[i] = rand();
  return a;
}

// ---------- dynamic ribbon (billboard strip that trails a moving thing) ----------

class Ribbon {
  constructor(maxPoints, order, opacity = 0.6) {
    this.n = maxPoints;
    const pos = new Float32Array(maxPoints * 2 * 3);
    const along = new Float32Array(maxPoints * 2);
    const side = new Float32Array(maxPoints * 2);
    const idx = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlong", new THREE.BufferAttribute(along, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    for (let i = 0; i < maxPoints; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.uniforms = { uColor: { value: new THREE.Vector3(1, 1, 1) }, uOpacity: { value: opacity } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG, side: THREE.DoubleSide, ...PREMULT,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.tmpT = new THREE.Vector3();
    this.tmpV = new THREE.Vector3();
    this.tmpS = new THREE.Vector3();
  }

  // points: array of THREE.Vector3, oldest first. px: ribbon thickness in screen pixels at its head.
  update(points, cam, px, taper = 1) {
    const g = this.mesh.geometry;
    const count = Math.min(points.length, this.n);
    if (count < 2) { g.setDrawRange(0, 0); return; }
    const pos = g.attributes.position.array;
    const along = g.attributes.aAlong.array;
    const start = points.length - count;
    for (let i = 0; i < count; i++) {
      const p = points[start + i];
      const a = points[start + Math.max(i - 1, 0)];
      const b = points[start + Math.min(i + 1, count - 1)];
      this.tmpT.subVectors(b, a);
      this.tmpV.subVectors(cam.position, p);
      this.tmpS.crossVectors(this.tmpT, this.tmpV);
      if (this.tmpS.lengthSq() < 1e-8) this.tmpS.set(0, 1, 0);
      this.tmpS.normalize();
      const dist = this.tmpV.length();
      const f = i / (count - 1);
      const w = (px * dist / 965) * (taper < 0 ? 1 + (1 - f) * -taper : lerp(1, f, taper)) * 0.5;
      const o = i * 6;
      pos[o] = p.x - this.tmpS.x * w; pos[o + 1] = p.y - this.tmpS.y * w; pos[o + 2] = p.z - this.tmpS.z * w;
      pos[o + 3] = p.x + this.tmpS.x * w; pos[o + 4] = p.y + this.tmpS.y * w; pos[o + 5] = p.z + this.tmpS.z * w;
      along[i * 2] = f; along[i * 2 + 1] = f;
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlong.needsUpdate = true;
    g.setDrawRange(0, (count - 1) * 6);
  }
}

// ---------- small dynamic sprite cloud (gull wings, sail) ----------

class Sprites {
  constructor(count, order) {
    this.count = count;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    const shade = new Float32Array(count).fill(1);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aShade", new THREE.BufferAttribute(shade, 1));
    this.shade = shade;
    this.uniforms = { uColor: { value: new THREE.Vector3(1, 1, 1) }, uOpacity: { value: 1 }, uSize: { value: 2.4 }, uDpr: { value: 1 } };
    this.mesh = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, ...PREMULT,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
  }
  set(i, x, y, z, s = 1) { this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.shade[i] = s; }
  commit() { this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.aShade.needsUpdate = true; }
}

// ---------- the scene ----------

export function createScene(canvas, opts = {}) {
  const mobile = !!opts.mobile;
  const reduced = !!opts.reducedMotion;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance", stencil: false, depth: false });
  renderer.setClearColor(0x04101c, 1);
  const maxDpr = mobile ? 1.25 : 1.5;
  let dprScale = 1;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, maxDpr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 8000);
  camera.position.set(0, CAM_Y, CAM_Z);

  // shared uniforms (one object per value, so every material updates together)
  const V3 = () => ({ value: new THREE.Vector3() });
  const U = {
    uTime: { value: 0 }, uAmp: { value: 0.75 }, uDpr: { value: pixelRatio }, uNight: { value: 0 }, uLamps: { value: 0 },
    uSpark: { value: 0.7 }, uCloud: { value: 0.3 }, uWind: { value: 0.3 },
    uFog: V3(), uDeep: V3(), uShallow: V3(), uFoam: V3(), uGlint: V3(), uSand: V3(), uWet: V3(),
    uLightDir: { value: new THREE.Vector3(0, 0.3, -1) }, uLightCol: V3(),
    uHorizon: V3(), uMid: V3(), uZenith: V3(), uSunCol: V3(), uPalm: V3(), uMtnNear: V3(), uMtnFar: V3(),
    uDrops: { value: Array.from({ length: 10 }, () => new THREE.Vector4(0, 0, -100, 0)) },
  };
  const skyU = {
    uRight: V3(), uUp: V3(), uFwd: V3(), uCamPos: V3(), uSunDir: { value: new THREE.Vector3(0, 0.5, -1) },
    uMoonDir: { value: new THREE.Vector3(0, -0.5, -1) },
    uTanY: { value: Math.tan(25 * Math.PI / 180) }, uAspect: { value: 1.6 }, uSunI: { value: 1 }, uMoonI: { value: 0 },
    uStars: { value: 0 }, uMoonF: { value: 0.5 }, uCloudQ: { value: mobile ? 3 : 4 },
  };

  // sky: full-screen triangle that also paints the base fill under the water and sand
  const skyGeo = new THREE.BufferGeometry();
  skyGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.ShaderMaterial({
    uniforms: { ...U, ...skyU }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, depthTest: false, depthWrite: false,
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  const pointMat = (vertexShader, extra = {}) => new THREE.ShaderMaterial({
    uniforms: { ...U, ...extra }, vertexShader, fragmentShader: POINT_FRAG, ...PREMULT,
  });

  // geometry that depends on the screen (ocean, sand, flow ribbons) is rebuilt on resize
  let ocean = null, sand = null, flow = null;
  const oceanMat = pointMat(OCEAN_VERT);
  const sandMat = pointMat(SAND_VERT);
  const flowMat = new THREE.ShaderMaterial({
    uniforms: { ...U }, vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide,
  });

  // ---------- static geometry that never changes ----------

  const area = () => canvas.clientWidth * canvas.clientHeight;
  const quality = mobile ? 0.62 : 1;

  function buildMountains() {
    const group = new THREE.Group();
    const layers = [
      { R: 2000, hMin: 60, hMax: 270, n: 24000, seed: 11, layer: 0.0, skew: 1 },
      { R: 1300, hMin: 35, hMax: 170, n: 16000, seed: 29, layer: 1.0, skew: -1 },
    ];
    for (const L of layers) {
      const rand = mulberry(L.seed);
      const n = Math.round(L.n * quality);
      const pos = new Float32Array(n * 3);
      const rnd = randomAttr(n, rand);
      const ridge = (th) => {
        const u = th / 1.1; // -1..1 across the view
        let h = 0.5 + 0.5 * Math.sin(th * 3.1 + L.seed) * Math.cos(th * 1.7 + 2.0);
        h += 0.25 * Math.sin(th * 9.0 + L.seed * 3) + 0.12 * Math.sin(th * 21.0 + L.seed);
        h = clamp(h * 0.7 + 0.2 + 0.28 * -u * L.skew, 0.04, 1);
        return lerp(L.hMin, L.hMax, h);
      };
      for (let i = 0; i < n; i++) {
        const th = (rand() * 2 - 1) * 1.15;
        const H = ridge(th);
        // concentrate particles near the ridge line so the silhouette glows
        const v = 1 - Math.pow(rand(), 1.7);
        const y = -4 + (H + 4) * v;
        pos[i * 3] = Math.sin(th) * L.R;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = CAM_Z - Math.cos(th) * L.R;
        rnd[i * 4 + 2] = v;
      }
      const m = pointMat(MOUNTAIN_VERT, { uLayer: { value: L.layer } });
      const pts = pointsFrom(pos, rnd, null, m, L.layer > 0.5 ? 1 : 0);
      group.add(pts);
    }
    return group;
  }

  const pierX = (z) => 11 + (-14 - z) * 0.045;
  const WHEEL_Z = -52, WHEEL_R = 4.4;
  const wheelCenter = new THREE.Vector3(pierX(WHEEL_Z), 2.4 + 1.3 + WHEEL_R, WHEEL_Z);
  const wheelRight = new THREE.Vector3(0.92, 0, 0.39).normalize();

  function buildStructures() {
    const rand = mulberry(77);
    const P = [], K = [], R = [];
    const add = (x, y, z, kind, swayW = 0) => { P.push(x, y, z); K.push(kind); R.push(rand(), rand(), swayW, rand()); };

    // pier deck, rails, bulbs and pylons
    const zEnd = -118;
    for (let z = -13; z > zEnd; z -= 0.2) {
      const cx = pierX(z);
      add(cx - 2.4, 2.4, z, 0); add(cx + 2.4, 2.4, z, 0);
      add(cx - 2.4, 3.5, z, 1); add(cx + 2.4, 3.5, z, 1);
    }
    for (let z = -13; z > zEnd; z -= 0.3) {
      const cx = pierX(z);
      for (let k = -9; k <= 9; k++) add(cx + k * 0.25 + (rand() - 0.5) * 0.1, 2.4, z + (rand() - 0.5) * 0.12, 0);
    }
    for (let z = -13, i = 0; z > zEnd; z -= 3.4, i++) {
      const cx = pierX(z);
      const s = i % 2 ? 1 : -1;
      add(cx + s * 2.4, 3.9, z, 2);
      for (let y = 2.4; y < 3.5; y += 0.3) add(cx + s * 2.4, y, z, 1);
    }
    for (let z = -16; z > zEnd; z -= 6) {
      const cx = pierX(z);
      for (const s of [-2, 2]) for (let y = -0.9; y < 2.4; y += 0.34) add(cx + s, y, z, 3);
    }
    // T-shaped pier head
    for (let x = -6; x <= 6; x += 0.4) { const cx = pierX(zEnd) + x; add(cx, 2.4, zEnd - 2.4, 0); add(cx, 2.4, zEnd + 2.4, 0); if (Math.abs(x) % 2 < 0.4) add(cx, 3.9, zEnd - 2.4, 2); }
    // Ferris wheel A-frame legs (the wheel itself turns in its own object)
    for (const s of [-1, 1]) {
      for (let t = 0; t <= 1; t += 0.035) {
        add(wheelCenter.x + wheelRight.x * s * 3.2 * t, lerp(wheelCenter.y, 2.4, t), wheelCenter.z + wheelRight.z * s * 3.2 * t, 0);
      }
    }
    // pier-side amusements: a low row of lit booths near the shore end
    for (let z = -16; z > -44; z -= 0.45) {
      const cx = pierX(z) + 4.3;
      add(cx, 2.4, z, 0); add(cx, 3.6 + 0.5 * Math.sin(z * 0.8), z, 1);
      if (Math.floor(-z) % 3 === 0) add(cx, 4.4, z, 2);
    }

    // palms in the foreground
    const palm = (bx, by, bz, h, lx, lz) => {
      const trunk = 150;
      for (let i = 0; i <= trunk; i++) {
        const t = i / trunk;
        const r = 0.42 - 0.18 * t;
        for (let k = 0; k < 4; k++) {
          const a = rand() * TAU;
          add(bx + lx * t * t + Math.cos(a) * r, by + h * t, bz + lz * t * t + Math.sin(a) * r, 4, 0.12 * t);
        }
      }
      const cx = bx + lx, cy = by + h, cz = bz + lz;
      const fronds = 12;
      for (let j = 0; j < fronds; j++) {
        const ph = (j / fronds) * TAU + rand() * 0.4;
        const L = 5.2 + rand() * 1.6;
        const dx = Math.cos(ph), dz = Math.sin(ph);
        for (let s = 0.0; s <= 1.0; s += 0.011) {
          const run = L * s * (1 - 0.2 * s);
          const rise = L * (0.55 * s - 0.85 * s * s);
          const x = cx + dx * run, y = cy + rise + 0.2, z = cz + dz * run;
          add(x, y, z, 5, 0.3 + s * 0.7);
          const leaf = 0.75 * Math.pow(1 - s, 0.6) * Math.sin(Math.min(s * 14, Math.PI));
          add(x - dz * leaf, y - leaf * 0.7, z + dx * leaf, 5, 0.3 + s * 0.7);
          add(x + dz * leaf, y - leaf * 0.7, z - dx * leaf, 5, 0.3 + s * 0.7);
        }
      }
    };
    palm(-11.4, 0.9, -3, 12.5, 0.9, -1.2);
    palm(-16.6, 0.6, -11, 11, 1.4, -1.0);

    const n = K.length;
    const rnd = new Float32Array(R);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(P), 3));
    g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 4));
    g.setAttribute("aKind", new THREE.BufferAttribute(new Float32Array(K), 1));
    const pts = new THREE.Points(g, pointMat(STRUCT_VERT));
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    return pts;
  }

  function buildWheel() {
    const rand = mulberry(5);
    const P = [], R = [];
    const add = (x, y, kind) => { P.push(x, y, kind); R.push(rand(), rand(), rand(), rand()); };
    for (const r of [WHEEL_R, WHEEL_R - 0.28]) {
      const n = Math.round((TAU * r) / 0.2);
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; add(Math.cos(a) * r, Math.sin(a) * r, 0); }
    }
    const spokes = 16;
    for (let s = 0; s < spokes; s++) {
      const a = (s / spokes) * TAU;
      for (let r = 0.2; r < WHEEL_R; r += 0.3) add(Math.cos(a) * r, Math.sin(a) * r, 1);
      add(Math.cos(a) * (WHEEL_R + 0.45), Math.sin(a) * (WHEEL_R + 0.45) - 0.15, 2); // gondola
    }
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; add(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 3); }
    const lamps = 56;
    for (let i = 0; i < lamps; i++) { const a = (i / lamps) * TAU; add(Math.cos(a) * (WHEEL_R + 0.12), Math.sin(a) * (WHEEL_R + 0.12), 4); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(P), 3));
    g.setAttribute("aRnd", new THREE.BufferAttribute(new Float32Array(R), 4));
    const uniforms = { ...U, uWC: { value: wheelCenter.clone() }, uWR: { value: wheelRight.clone() }, uWA: { value: 0 } };
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms, vertexShader: WHEEL_VERT, fragmentShader: POINT_FRAG, ...PREMULT }));
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    pts.userData.uniforms = uniforms;
    return pts;
  }

  function buildDust() {
    const rand = mulberry(303);
    const n = Math.round(2600 * quality);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rand() * 2 - 1) * 70;
      pos[i * 3 + 1] = 0.5 + rand() * 24;
      pos[i * 3 + 2] = CAM_Z - 6 - rand() * 95;
    }
    return pointsFrom(pos, randomAttr(n, rand), null, pointMat(DUST_VERT), 7);
  }

  scene.add(buildMountains());
  scene.add(buildStructures());
  const wheel = buildWheel();
  scene.add(wheel);
  scene.add(buildDust());

  // ---------- screen-dependent particles: ocean, sand, flow ribbons ----------

  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  let geometryBuilt = false;

  function rayGround(ndcX, ndcY, tanY, aspect, out) {
    dir.set(ndcX * tanY * aspect, ndcY * tanY, -1).applyQuaternion(camera.quaternion).normalize();
    if (dir.y > -1e-4) return -1;
    const t = (0 - camPos.y) / dir.y;
    out.set(camPos.x + dir.x * t, 0, camPos.z + dir.z * t);
    return t;
  }

  function rebuildScreenGeometry() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const aspect = w / h;
    const tanY = Math.tan((camera.fov * Math.PI) / 360);
    // measure the base pose (no parallax)
    const saved = { p: camera.position.clone(), q: camera.quaternion.clone() };
    camera.position.set(0, CAM_Y, CAM_Z);
    camera.rotation.set(-basePitch, 0, 0, "YXZ");
    camera.updateMatrixWorld(true);
    camPos.copy(camera.position);

    let minY = 9, maxY = -9;
    for (let x = -80; x <= 80; x += 4) {
      tmp.set(x, 0, shoreZ(x)).project(camera);
      minY = Math.min(minY, tmp.y); maxY = Math.max(maxY, tmp.y);
    }
    tmp.set(0, CAM_Y, -1e6).project(camera);
    const horizonY = tmp.y;

    const rand = mulberry(2024);
    const P = new THREE.Vector3();

    // ocean
    const nOcean = Math.round(clamp(0.3 * w * h / 5.2, 14000, 88000) * quality);
    const oPos = new Float32Array(nOcean * 3);
    let c = 0, tries = 0;
    while (c < nOcean && tries < nOcean * 4) {
      tries++;
      const nx = (rand() * 2 - 1) * 1.22;
      const ny = lerp(minY - 0.05, horizonY - 0.0006, rand());
      const t = rayGround(nx, ny, tanY, aspect, P);
      if (t < 0 || t > 3600) continue;
      if (P.z > shoreZ(P.x) + 2.5) continue;
      oPos[c * 3] = P.x; oPos[c * 3 + 1] = 0; oPos[c * 3 + 2] = P.z; c++;
    }
    const oRnd = randomAttr(c, rand);
    if (ocean) { ocean.geometry.dispose(); scene.remove(ocean); }
    ocean = pointsFrom(oPos.subarray(0, c * 3), oRnd, null, oceanMat, 1);
    scene.add(ocean);

    // sand
    const nSand = Math.round(clamp(0.26 * w * h / 5.6, 9000, 42000) * quality);
    const sPos = new Float32Array(nSand * 3);
    c = 0; tries = 0;
    while (c < nSand && tries < nSand * 4) {
      tries++;
      const nx = (rand() * 2 - 1) * 1.22;
      const ny = lerp(-1.25, maxY + 0.03, rand());
      const t = rayGround(nx, ny, tanY, aspect, P);
      if (t < 0) continue;
      if (P.z < shoreZ(P.x) - 2.5) continue;
      const inland = Math.max(0, P.z - shoreZ(P.x));
      const y = inland * 0.028 + 0.22 * Math.sin(P.x * 0.21 + P.z * 0.13) * Math.min(1, inland / 8) + 0.1 * Math.sin(P.x * 0.9 + P.z * 0.4);
      sPos[c * 3] = P.x; sPos[c * 3 + 1] = Math.max(y, 0); sPos[c * 3 + 2] = P.z; c++;
    }
    const sRnd = randomAttr(c, rand);
    if (sand) { sand.geometry.dispose(); scene.remove(sand); }
    sand = pointsFrom(sPos.subarray(0, c * 3), sRnd, null, sandMat, 2);
    scene.add(sand);

    // flow ribbons: wave-crest strokes that ride the surface
    const F = Math.round(44 * (mobile ? 0.7 : 1)), N = 40;
    const fPos = new Float32Array(F * N * 2 * 3);
    const fAlong = new Float32Array(F * N * 2);
    const fSide = new Float32Array(F * N * 2);
    const fRnd = new Float32Array(F * N * 2 * 4);
    const idx = [];
    for (let f = 0; f < F; f++) {
      let t = -1, tries2 = 0;
      let nx, ny;
      do {
        nx = (rand() * 2 - 1) * 1.05;
        ny = lerp(minY + 0.05, horizonY - 0.01, Math.pow(rand(), 0.8));
        t = rayGround(nx, ny, tanY, aspect, P);
        tries2++;
      } while ((t < 0 || t > 1400 || P.z > shoreZ(P.x) - 5) && tries2 < 20);
      const d = Math.max(t, 20);
      const len = d * (0.12 + rand() * 0.28);
      const ang = (rand() - 0.5) * 0.5;
      const px = 1.2 + rand() * 1.8;
      const halfW = (px * d * d) / (CAM_Y * 965) * 0.5;
      const wob = (rand() - 0.5) * len * 0.18;
      const rr = [rand(), rand(), rand(), 0.25 + rand() * 0.75];
      for (let i = 0; i < N; i++) {
        const s = i / (N - 1);
        const cx = P.x + (s - 0.5) * len * Math.cos(ang);
        const cz = P.z + (s - 0.5) * len * Math.sin(ang) + Math.sin(s * Math.PI * 2) * wob;
        for (let k = 0; k < 2; k++) {
          const v = (f * N + i) * 2 + k;
          fPos[v * 3] = cx; fPos[v * 3 + 1] = 0; fPos[v * 3 + 2] = cz + (k ? halfW : -halfW);
          fAlong[v] = s; fSide[v] = k ? 1 : -1;
          for (let q = 0; q < 4; q++) fRnd[v * 4 + q] = rr[q];
        }
        if (i < N - 1) {
          const a = (f * N + i) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(fPos, 3));
    fg.setAttribute("aAlong", new THREE.BufferAttribute(fAlong, 1));
    fg.setAttribute("aSide", new THREE.BufferAttribute(fSide, 1));
    fg.setAttribute("aRnd", new THREE.BufferAttribute(fRnd, 4));
    fg.setIndex(idx);
    if (flow) { flow.geometry.dispose(); scene.remove(flow); }
    flow = new THREE.Mesh(fg, flowMat);
    flow.frustumCulled = false;
    flow.renderOrder = 3;
    scene.add(flow);

    camera.position.copy(saved.p);
    camera.quaternion.copy(saved.q);
    geometryBuilt = true;
  }

  // ---------- gulls, sailboat and the pointer wake ----------

  const gulls = [];
  const gullDefs = [
    { c: [-20, 23, -42], ax: 20, az: 9, w: 0.23, p: 0.4 },
    { c: [22, 28, -64], ax: 24, az: 10, w: 0.19, p: 2.2 },
    { c: [4, 33, -80], ax: 30, az: 12, w: 0.15, p: 4.0 },
    { c: [-38, 36, -95], ax: 26, az: 14, w: 0.17, p: 5.5 },
  ];
  for (const d of gullDefs.slice(0, mobile ? 3 : 4)) {
    const sprites = new Sprites(11, 8);
    const ribbon = new Ribbon(60, 8, 0.5);
    scene.add(sprites.mesh); scene.add(ribbon.mesh);
    gulls.push({ ...d, sprites, ribbon, trail: [], last: 0 });
  }
  const gullPos = (g, t) => [
    g.c[0] + g.ax * Math.sin(g.w * t + g.p),
    g.c[1] + 3.5 * Math.sin(g.w * 1.7 * t + g.p * 1.3),
    g.c[2] + g.az * Math.cos(g.w * 0.8 * t + g.p),
  ];

  const boat = { x: -70, z: -88, speed: 1.5, sprites: new Sprites(46, 8), wake: new Ribbon(90, 5, 0.55), trail: [], last: 0 };
  scene.add(boat.sprites.mesh); scene.add(boat.wake.mesh);
  boat.sprites.uniforms.uSize.value = 1.5;

  const wakeRibbon = new Ribbon(48, 9, 0.7);
  scene.add(wakeRibbon.mesh);
  const pointerTrail = []; // {p: Vector3, t}
  const pointerHead = new THREE.Vector3();
  let hasHead = false;
  let dropIndex = 0;
  const lastDrop = { x: 1e9, z: 1e9, t: -10 };

  function addDrop(x, z, time, strength) {
    U.uDrops.value[dropIndex].set(x, z, time, strength);
    dropIndex = (dropIndex + 1) % U.uDrops.value.length;
  }

  // ---------- pointer ----------

  const pointer = { x: 0, y: 0, tx: 0, ty: 0, inside: false, moved: 0 };
  const hit = new THREE.Vector3();
  const ndcToWater = (nx, ny) => {
    const tanY = Math.tan((camera.fov * Math.PI) / 360);
    dir.set(nx * tanY * camera.aspect, ny * tanY, -1).applyQuaternion(camera.quaternion).normalize();
    if (dir.y > -1e-4) return false;
    const t = -camera.position.y / dir.y;
    if (t > 600) return false;
    hit.set(camera.position.x + dir.x * t, 0, camera.position.z + dir.z * t);
    return hit.z < shoreZ(hit.x) - 0.5;
  };

  let basePitch = 0.09;
  let curTime = 0;

  function setPointer(nx, ny) {
    pointer.tx = nx; pointer.ty = ny; pointer.inside = true;
    pointer.moved = performance.now();
  }
  function leave() { pointer.inside = false; pointer.tx = 0; pointer.ty = 0; }
  function splash(nx, ny, strength = 0.9) {
    if (ndcToWater(nx, ny)) addDrop(hit.x, hit.z, curTime, strength);
  }

  // ---------- resize ----------

  let resizeTimer = 0;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    pixelRatio = Math.min(window.devicePixelRatio || 1, maxDpr) * dprScale;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    camera.fov = aspect < 1 ? lerp(50, 64, Math.min(1, 1 - aspect)) : 50;
    basePitch = Math.atan((1 - 2 * HORIZON) * Math.tan((camera.fov * Math.PI) / 360));
    camera.updateProjectionMatrix();
    skyU.uAspect.value = aspect;
    skyU.uTanY.value = Math.tan((camera.fov * Math.PI) / 360);
    U.uDpr.value = pixelRatio;
    for (const g of gulls) g.sprites.uniforms.uDpr.value = pixelRatio;
    boat.sprites.uniforms.uDpr.value = pixelRatio;
    camera.position.set(0, CAM_Y, CAM_Z);
    camera.rotation.set(-basePitch, 0, 0, "YXZ");
    camera.updateMatrixWorld(true);
    if (!geometryBuilt) rebuildScreenGeometry();
    else {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rebuildScreenGeometry, 220);
    }
  }

  function halfFovH() {
    return Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
  }

  function setDprScale(s) {
    dprScale = clamp(s, 0.6, 1);
    resize();
  }

  // ---------- per frame ----------

  const vtmp = new THREE.Vector3();

  function applyEnvironment(env, weather) {
    const p = env.palette;
    const set = (u, c) => u.value.set(c[0], c[1], c[2]);
    set(U.uFog, p.fog); set(U.uDeep, p.deep); set(U.uShallow, p.shallow); set(U.uFoam, p.foam);
    set(U.uGlint, p.glint); set(U.uSand, p.sand); set(U.uWet, p.wet); set(U.uHorizon, p.horizon);
    set(U.uMid, p.mid); set(U.uZenith, p.zenith); set(U.uSunCol, p.sun); set(U.uPalm, p.palm);
    set(U.uMtnNear, p.mtnNear); set(U.uMtnFar, p.mtnFar);
    U.uLightDir.value.set(env.lightDir[0], env.lightDir[1], env.lightDir[2]);
    U.uLightCol.value.set(env.lightCol[0], env.lightCol[1], env.lightCol[2]);
    U.uNight.value = env.nightF; U.uLamps.value = p.lamps; U.uSpark.value = p.spark;
    U.uAmp.value = weather.amp; U.uCloud.value = weather.cloud; U.uWind.value = weather.wind;
    skyU.uSunDir.value.set(env.sunDir[0], env.sunDir[1], env.sunDir[2]);
    skyU.uMoonDir.value.set(env.moonDir[0], env.moonDir[1], env.moonDir[2]);
    skyU.uSunI.value = env.sunI * (1 - 0.45 * smooth(8, 26, env.sun.elev)); skyU.uMoonI.value = env.moonI; skyU.uStars.value = p.stars;
    skyU.uMoonF.value = env.moon.f;

    // light-dependent colours for the little moving things
    const gullFade = 1 - env.nightF * 0.85;
    for (const g of gulls) {
      const dark = env.nightF < 0.5;
      const c = dark ? [p.palm[0] * 1.4 + 0.1, p.palm[1] * 1.4 + 0.12, p.palm[2] * 1.4 + 0.12] : p.foam;
      g.sprites.uniforms.uColor.value.set(c[0], c[1], c[2]);
      g.sprites.uniforms.uOpacity.value = 0.9 * (dark ? gullFade : 0.6);
      g.ribbon.uniforms.uColor.value.set(p.foam[0], p.foam[1], p.foam[2]);
      g.ribbon.uniforms.uOpacity.value = 0.45 * (0.4 + 0.6 * gullFade);
    }
    boat.sprites.uniforms.uColor.value.set(p.foam[0], p.foam[1], p.foam[2]);
    boat.sprites.uniforms.uOpacity.value = 0.95;
    boat.wake.uniforms.uColor.value.set(p.foam[0], p.foam[1], p.foam[2]);
    wakeRibbon.uniforms.uColor.value.set(p.glint[0], p.glint[1], p.glint[2]);
  }

  function update(dt, time, env, weather) {
    curTime = time;
    U.uTime.value = time;

    // camera: slow breathing plus pointer parallax
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 2.2));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 2.2));
    const par = reduced ? 0 : 1;
    const breathe = reduced ? 0 : Math.sin(time * 0.21) * 0.25;
    camera.position.set(pointer.x * 1.2 * par + breathe, CAM_Y + pointer.y * 0.5 * par + Math.sin(time * 0.17) * 0.12 * par, CAM_Z);
    camera.rotation.set(-basePitch + pointer.y * 0.012 * par, -pointer.x * 0.035 * par, 0, "YXZ");
    camera.updateMatrixWorld(true);
    const e = camera.matrixWorld.elements;
    skyU.uRight.value.set(e[0], e[1], e[2]);
    skyU.uUp.value.set(e[4], e[5], e[6]);
    skyU.uFwd.value.set(-e[8], -e[9], -e[10]);
    skyU.uCamPos.value.copy(camera.position);

    wheel.userData.uniforms.uWA.value = time * 0.05;

    // pointer wake on the water
    const now = performance.now();
    const active = pointer.inside && now - pointer.moved < 1400;
    if (active && ndcToWater(pointer.tx, pointer.ty)) {
      if (!hasHead) { pointerHead.copy(hit); hasHead = true; }
      pointerHead.lerp(hit, 1 - Math.exp(-dt * 12));
      const moved = Math.hypot(hit.x - lastDrop.x, hit.z - lastDrop.z);
      if (moved > 0.9 && time - lastDrop.t > 0.07) {
        addDrop(hit.x, hit.z, time, clamp(0.12 + moved * 0.05, 0.12, 0.34));
        lastDrop.x = hit.x; lastDrop.z = hit.z; lastDrop.t = time;
      }
      const y = waveH(pointerHead.x, pointerHead.z, time, weather.amp) + 0.1;
      pointerTrail.push({ p: new THREE.Vector3(pointerHead.x, y, pointerHead.z), t: time });
    }
    while (pointerTrail.length && time - pointerTrail[0].t > 1.15) pointerTrail.shift();
    if (!active) hasHead = false;
    wakeRibbon.update(pointerTrail.map((q) => q.p), camera, 3.2, 0.9);

    // gulls
    for (const g of gulls) {
      const [x, y, z] = gullPos(g, time);
      const [x2, , z2] = gullPos(g, time + 0.1);
      let fx = x2 - x, fz = z2 - z;
      const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const rx = -fz, rz = fx; // right
      const flap = Math.sin(time * 5.5 + g.p * 3) * 0.55;
      g.sprites.set(0, x, y, z, 1);
      for (let k = 1; k <= 4; k++) {
        const s = k * 0.62;
        const lift = flap * s * 0.28 - s * 0.1;
        g.sprites.set(k, x + rx * s, y + lift, z + rz * s, 0.95 - k * 0.1);
        g.sprites.set(k + 4, x - rx * s, y + lift, z - rz * s, 0.95 - k * 0.1);
      }
      g.sprites.set(9, x - fx * 0.5, y, z - fz * 0.5, 0.8);
      g.sprites.set(10, x + fx * 0.45, y + 0.05, z + fz * 0.45, 0.9);
      g.sprites.commit();
      if (time - g.last > 0.05) {
        g.trail.push(new THREE.Vector3(x - fx * 0.4, y, z - fz * 0.4));
        if (g.trail.length > 60) g.trail.shift();
        g.last = time;
      }
      g.ribbon.update(g.trail, camera, 1.8, 0.2);
    }

    // sailboat crossing the bay
    boat.x += boat.speed * dt;
    if (boat.x > 80) { boat.x = -80; boat.trail.length = 0; }
    const bh = waveH(boat.x, boat.z, time, weather.amp);
    const roll = Math.sin(time * 0.8) * 0.06;
    let n = 0;
    for (let i = 0; i < 9; i++) boat.sprites.set(n++, boat.x + (i / 8 - 0.5) * 3.4, bh + 0.35 + Math.abs(i - 4) * 0.02, boat.z, 0.9);
    for (let r = 0; r < 10; r++) {
      const hgt = 0.7 + r * 0.46;
      const w = (1 - r / 10) * 1.5;
      for (let k = 0; k < 3; k++) boat.sprites.set(n++, boat.x - 0.3 + (k / 2 - 0.2) * w + roll * hgt, bh + hgt, boat.z + 0.02, 1);
    }
    for (let r = 0; r < 5; r++) boat.sprites.set(n++, boat.x + 1.1 - r * 0.07, bh + 0.8 + r * 0.55, boat.z + 0.02, 0.9);
    while (n < boat.sprites.count) boat.sprites.set(n++, boat.x, bh, boat.z, 0);
    boat.sprites.commit();
    if (time - boat.last > 0.12) {
      boat.trail.push(new THREE.Vector3(boat.x - 1.7, waveH(boat.x - 1.7, boat.z, time, weather.amp) + 0.12, boat.z));
      if (boat.trail.length > 90) boat.trail.shift();
      boat.last = time;
    }
    boat.wake.update(boat.trail, camera, 2.2, -2.5);

    renderer.render(scene, camera);
  }

  resize();

  return {
    renderer, camera, resize, update, applyEnvironment, setPointer, leave, splash, setDprScale,
    halfFovH, get pixelRatio() { return pixelRatio; }, get dprScale() { return dprScale; },
    dispose() { renderer.dispose(); },
  };
}

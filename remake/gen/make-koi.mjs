// Draws five original koi sprites (top view, head right, transparent PNG, 2048x1016) for the kdmirah remake.
// Run: node remake/gen/make-koi.mjs   (needs Playwright from ~/.remake)
import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/nuramirahmohdkamil/.remake/node_modules/playwright/index.mjs";

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../site/images");
const W = 2048, H = 1016, CY = 508;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) | 0), ((s ^ (s >>> 14)) >>> 0) / 4294967296);
}
const f = (n) => n.toFixed(1);
const pt = (b, a, l) => [b[0] + Math.cos(a) * l, b[1] + Math.sin(a) * l];
const rad = (d) => (d * Math.PI) / 180;

// A fin: rays from a base point, a scalloped membrane through the ray tips.
function fan({ base, a0, a1, len, n, wave = 0.2, phase = 0, scallop = 0.14, id, grad, rayColor, rayOpacity = 0.35, seed = 1 }) {
  const r = rng(seed);
  const tips = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = rad(a0 + (a1 - a0) * t) + (r() - 0.5) * 0.04;
    const mid = Math.sin(t * Math.PI); // longer in the middle
    const l = len * (0.55 + 0.45 * mid) * (1 - wave / 2 + wave * Math.abs(Math.sin(i * 1.7 + phase))) * (0.97 + r() * 0.06);
    tips.push(pt(base, a, l));
  }
  let d = `M${f(base[0])},${f(base[1])} L${f(tips[0][0])},${f(tips[0][1])}`;
  for (let i = 1; i < tips.length; i++) {
    const [x0, y0] = tips[i - 1], [x1, y1] = tips[i];
    const cx = (x0 + x1) / 2 + (base[0] - (x0 + x1) / 2) * scallop;
    const cy = (y0 + y1) / 2 + (base[1] - (y0 + y1) / 2) * scallop;
    d += ` Q${f(cx)},${f(cy)} ${f(x1)},${f(y1)}`;
  }
  d += " Z";
  const rays = tips
    .map((t, i) => {
      const bend = (i % 2 ? 1 : -1) * 6;
      const mx = (base[0] + t[0]) / 2 + bend, my = (base[1] + t[1]) / 2 - bend;
      return `<path d="M${f(base[0])},${f(base[1])} Q${f(mx)},${f(my)} ${f(t[0] * 0.985 + base[0] * 0.015)},${f(t[1] * 0.985 + base[1] * 0.015)}" fill="none" stroke="${rayColor}" stroke-opacity="${rayOpacity}" stroke-width="1.6" stroke-linecap="round"/>`;
    })
    .join("");
  return `<g filter="url(#soft)" opacity=".92"><path d="${d}" fill="url(#${grad})" stroke="${rayColor}" stroke-opacity=".25" stroke-width="2" stroke-linejoin="round"/>${rays}</g>`;
}

function koi(p, seed) {
  const r = rng(seed);
  const body = `M760,486 C980,414 1280,346 1640,346 C1830,348 1938,418 1954,508 C1938,598 1830,668 1640,670 C1280,670 980,602 760,530 Z`;
  const fins = [];
  // tail: two overlapping veils
  fins.push(fan({ base: [820, CY], a0: 180 - 62, a1: 180 + 62, len: 690, n: 30, wave: 0.14, phase: seed, scallop: 0.07, grad: "gTail", rayColor: p.ray, rayOpacity: 0.4, seed }));
  fins.push(fan({ base: [830, CY], a0: 180 - 40, a1: 180 + 46, len: 500, n: 22, wave: 0.12, phase: seed + 2, scallop: 0.06, grad: "gTail2", rayColor: p.ray, rayOpacity: 0.3, seed: seed + 5 }));
  // pectoral fins (big, swept back)
  fins.push(fan({ base: [1620, 372], a0: 180 + 22, a1: 180 + 86, len: 340, n: 20, wave: 0.1, phase: 1, scallop: 0.06, grad: "gPec", rayColor: p.ray, seed: seed + 9 }));
  fins.push(fan({ base: [1620, 644], a0: 180 - 86, a1: 180 - 22, len: 340, n: 20, wave: 0.1, phase: 3, scallop: 0.06, grad: "gPec", rayColor: p.ray, seed: seed + 11 }));
  // pelvic fins
  fins.push(fan({ base: [1140, 446], a0: 180 + 25, a1: 180 + 90, len: 250, n: 14, wave: 0.1, phase: 2, scallop: 0.06, grad: "gPel", rayColor: p.ray, seed: seed + 13 }));
  fins.push(fan({ base: [1140, 580], a0: 180 - 90, a1: 180 - 25, len: 250, n: 14, wave: 0.1, phase: 4, scallop: 0.06, grad: "gPel", rayColor: p.ray, seed: seed + 15 }));
  // dorsal fin seen from above: thin ridge along the back
  const dorsal = `<path d="M1010,${CY - 14} C1180,${CY - 34} 1420,${CY - 30} 1560,${CY - 6} C1420,${CY + 22} 1180,${CY + 24} 1010,${CY + 14} Z" fill="url(#gPel)" opacity=".85"/>`;

  // markings
  const marks = p.marks(r).map(([x, y, rx, ry, col, rot]) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${col}" transform="rotate(${f(rot || 0)} ${f(x)} ${f(y)})"/>`).join("");

  const barbel = (s) => `<path d="M1938,${CY + s * 14} C1960,${CY + s * 30} 1982,${CY + s * 46} 1992,${CY + s * 92}" fill="none" stroke="${p.barbel}" stroke-width="5" stroke-linecap="round"/><path d="M1930,${CY + s * 30} C1950,${CY + s * 50} 1962,${CY + s * 70} 1966,${CY + s * 96}" fill="none" stroke="${p.barbel}" stroke-width="4" stroke-linecap="round"/>`;
  const eye = (y) => `<g><circle cx="1862" cy="${y}" r="17" fill="${p.eyeRing}"/><circle cx="1865" cy="${y}" r="11" fill="#1a1410"/><circle cx="1869" cy="${y - 4}" r="3.5" fill="#fff" opacity=".85"/></g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="gTail" gradientUnits="userSpaceOnUse" x1="830" y1="0" x2="60" y2="0"><stop offset="0" stop-color="${p.finBase}"/><stop offset=".45" stop-color="${p.finMid}"/><stop offset="1" stop-color="${p.finTip}"/></linearGradient>
  <linearGradient id="gTail2" gradientUnits="userSpaceOnUse" x1="830" y1="0" x2="260" y2="0"><stop offset="0" stop-color="${p.finBase}"/><stop offset=".5" stop-color="${p.finMid}"/><stop offset="1" stop-color="${p.finTip}" stop-opacity=".75"/></linearGradient>
  <radialGradient id="gPec" gradientUnits="userSpaceOnUse" cx="1610" cy="${CY}" r="560" fx="1610" fy="${CY}"><stop offset=".3" stop-color="${p.finBase}"/><stop offset=".62" stop-color="${p.finMid}"/><stop offset="1" stop-color="${p.finTip}"/></radialGradient>
  <radialGradient id="gPel" gradientUnits="userSpaceOnUse" cx="1140" cy="${CY}" r="420"><stop offset=".15" stop-color="${p.finBase}"/><stop offset=".6" stop-color="${p.finMid}"/><stop offset="1" stop-color="${p.finTip}"/></radialGradient>
  <linearGradient id="gBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset=".32" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset=".78" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
  <linearGradient id="gHead" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></linearGradient>
  <pattern id="scales" width="34" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
    <path d="M0,13 A17,13 0 0 1 34,13" fill="none" stroke="${p.scaleLine}" stroke-opacity="${p.scaleOpacity}" stroke-width="2.2"/>
    <path d="M-17,26 A17,13 0 0 1 17,26 M17,26 A17,13 0 0 1 51,26" fill="none" stroke="${p.scaleLine}" stroke-opacity="${p.scaleOpacity}" stroke-width="2.2"/>
  </pattern>
  <clipPath id="clipBody"><path d="${body}"/></clipPath>
  <filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".006" numOctaves="2" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="10"/></filter>
  <filter id="blob" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="3" seed="${seed + 3}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="46"/><feGaussianBlur stdDeviation="1.2"/></filter>
</defs>
${fins.join("\n")}
${dorsal}
<path d="${body}" fill="${p.body}"/>
<g clip-path="url(#clipBody)">
  <g filter="url(#blob)">${marks}</g>
  <rect x="740" y="340" width="1230" height="340" fill="url(#scales)"/>
  <rect x="740" y="340" width="1230" height="340" fill="url(#gBody)"/>
  <rect x="740" y="340" width="1230" height="340" fill="url(#gHead)"/>
  <path d="M900,${CY - 6} C1200,${CY - 22} 1600,${CY - 20} 1900,${CY - 4}" stroke="#fff" stroke-opacity=".28" stroke-width="10" fill="none" stroke-linecap="round"/>
</g>
<path d="${body}" fill="none" stroke="${p.outline}" stroke-opacity=".35" stroke-width="3"/>
${barbel(-1)}${barbel(1)}
${eye(CY - 82)}${eye(CY + 82)}
</svg>`;
}

const jitter = (r, a) => (r() - 0.5) * a;

const palettes = {
  koi: {
    seed: 11, body: "#fbeedc", ray: "#c9593f", outline: "#b0452f", barbel: "#f6dcc4", eyeRing: "#d98a2b",
    finBase: "#ee5a45", finMid: "#f6b595", finTip: "#f6d9dc", scaleLine: "#d9a98a", scaleOpacity: 0.5,
    marks: (r) => [
      [1830, 520, 105, 95, "#e8483a"], [1690, 470, 88, 56, "#e8483a", -10], [1640, 560, 100, 50, "#e8483a", 8],
      [1450, 455, 85, 44, "#ee5a45", 6], [1300, 560, 100, 40, "#ee5a45", -4], [1500, 520, 60, 30, "#f0a940"],
      [1170, 480, 100, 36, "#f0a940", -6], [1010, 515, 90, 32, "#f0a940", 8], [1760, 440, 55, 36, "#f0a940"],
      [1560, 585, 50, 24, "#f0a940"], [880, 505, 70, 26, "#f0a940"],
    ],
  },
  "koi-white": {
    seed: 23, body: "#f7f4f2", ray: "#b9a6b0", outline: "#a3939c", barbel: "#f3e9e6", eyeRing: "#c99a45",
    finBase: "#e7dde4", finMid: "#f2ecf0", finTip: "#faf7f8", scaleLine: "#bdb5bc", scaleOpacity: 0.55,
    marks: () => [
      [1500, 540, 190, 62, "#d3d0d6", -3], [1180, 520, 150, 50, "#d6d3d9", 4], [1760, 540, 100, 70, "#dedbe0"],
      [1580, 440, 90, 30, "#eed9ae", 4], [1300, 440, 100, 28, "#efdcb6", -5], [1780, 470, 50, 44, "#efd9ad"], [980, 480, 90, 24, "#efdcb6", 6],
    ],
  },
  "koi-black": {
    seed: 37, body: "#16140f", ray: "#d9a53a", outline: "#000", barbel: "#efe8d6", eyeRing: "#e8b84a",
    finBase: "#2b2823", finMid: "#6d675c", finTip: "#c3bdb0", scaleLine: "#e8b84a", scaleOpacity: 0.35,
    marks: () => [
      [1810, 515, 110, 90, "#e8ad3a"], [1700, 450, 70, 48, "#f58a1f", -12], [1640, 575, 80, 44, "#f58a1f", 10],
      [1450, 470, 90, 46, "#f58a1f", 4], [1330, 560, 80, 36, "#e8ad3a"], [1180, 490, 90, 40, "#f58a1f", -6],
      [1040, 540, 80, 30, "#e8ad3a"], [1560, 540, 60, 34, "#e8ad3a"], [900, 505, 60, 24, "#f58a1f"],
    ],
  },
  "koi-asagi": {
    seed: 51, body: "#7088ad", ray: "#8a9bb8", outline: "#3e5578", barbel: "#d9e2ee", eyeRing: "#3a4c6b",
    finBase: "#d58a6a", finMid: "#c3cfe0", finTip: "#eef2f8", scaleLine: "#3e5578", scaleOpacity: 0.5,
    marks: () => [
      [1860, 520, 100, 100, "#e8643a"], [1760, 430, 60, 40, "#f08a5c"], [1590, 604, 220, 30, "#e8643a", 2], [1160, 592, 190, 24, "#e8764a", 4],
      [1500, 520, 260, 38, "#8ea3c4", 0], [1050, 470, 110, 26, "#5c7399"],
    ],
  },
  "koi-gold": {
    seed: 67, body: "#e1a01c", ray: "#b9892a", outline: "#9b6c12", barbel: "#f6e8c0", eyeRing: "#6d5320",
    finBase: "#e9bd55", finMid: "#f2d996", finTip: "#efe8d6", scaleLine: "#fff1c4", scaleOpacity: 0.28,
    marks: () => [
      [1830, 515, 120, 95, "#fbf1d2"], [1720, 470, 70, 50, "#f6e5ae"], [1520, 508, 330, 46, "#f5c244", 0], [1250, 520, 280, 30, "#cf8f10", 2],
      [1000, 515, 160, 26, "#c98a12"],
    ],
  },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
for (const [name, p] of Object.entries(palettes)) {
  const svg = koi(p, p.seed);
  fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), name + ".svg"), svg);
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: path.join(path.dirname(new URL(import.meta.url).pathname), name + ".png"), omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
  console.log("drew", name);
}
await browser.close();

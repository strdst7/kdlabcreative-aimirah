// Sun, moon and colour model for the Santa Monica particle beach.
// Everything the scene shows is derived from one number: the hour of the day.

export const LAT = 34.0195;
export const LON = -118.4912;
const RAD = Math.PI / 180;

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const hex = (h) => {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
};

// ---------- solar geometry ----------

export function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

export function solarDay(date) {
  const n = dayOfYear(date);
  const dec = -23.44 * RAD * Math.cos(((360 / 365) * (n + 10)) * RAD);
  const cosW0 = clamp(-Math.tan(LAT * RAD) * Math.tan(dec), -1, 1);
  const w0 = Math.acos(cosW0) / RAD; // degrees of hour angle from noon to sunrise
  return { dec, w0, sunrise: 12 - w0 / 15, sunset: 12 + w0 / 15, length: (2 * w0) / 15 };
}

// Elevation and azimuth (from north, clockwise) of the sun at a local decimal hour.
export function sunAt(hour, day) {
  const H = 15 * (hour - 12) * RAD;
  const lat = LAT * RAD;
  const sinE = Math.sin(lat) * Math.sin(day.dec) + Math.cos(lat) * Math.cos(day.dec) * Math.cos(H);
  const elev = Math.asin(clamp(sinE, -1, 1)) / RAD;
  const az = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(day.dec) * Math.cos(lat)) / RAD + 180 + 360) % 360;
  return { elev, az, H: H / RAD };
}

// Moon age as a fraction of the synodic month (0 = new, 0.5 = full).
export function moonPhase(date) {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - ref) / 86400000;
  const age = ((days % synodic) + synodic) % synodic;
  const f = age / synodic;
  const illum = (1 - Math.cos(f * Math.PI * 2)) / 2;
  let name;
  if (f < 0.03 || f > 0.97) name = "New moon";
  else if (f < 0.22) name = "Waxing crescent";
  else if (f < 0.28) name = "First quarter";
  else if (f < 0.47) name = "Waxing gibbous";
  else if (f < 0.53) name = "Full moon";
  else if (f < 0.72) name = "Waning gibbous";
  else if (f < 0.78) name = "Last quarter";
  else name = "Waning crescent";
  return { f, illum, name };
}

// ---------- palettes ----------

const S = {
  night: { zenith: "#040a1c", mid: "#0a1a3a", horizon: "#14305a", fog: "#0f2a52", sun: "#9bbcff", deep: "#030f28", shallow: "#0a3a72", foam: "#9cc4ff", glint: "#c4dcff", sand: "#1d2a4a", wet: "#0a1736", mtnNear: "#0a1630", mtnFar: "#122552", palm: "#050b1c", accent: "#06122b", ink: "#eef5ff", stars: 1, lamps: 1, spark: 0.35 },
  dusk: { zenith: "#121a48", mid: "#4a3b86", horizon: "#d0709a", fog: "#8a5c98", sun: "#ff9ec0", deep: "#0a1a48", shallow: "#4a4a9a", foam: "#ffc0d8", glint: "#ffb8d0", sand: "#4a3a5e", wet: "#1c1c46", mtnNear: "#1a1c48", mtnFar: "#5a4a8a", palm: "#0a0c26", accent: "#1a1f55", ink: "#fff0f6", stars: 0.55, lamps: 0.8, spark: 0.45 },
  sunset: { zenith: "#2a3376", mid: "#c24f86", horizon: "#ffa247", fog: "#ff9a6a", sun: "#ffb066", deep: "#33275f", shallow: "#e8688a", foam: "#ffd9c0", glint: "#ffd08a", sand: "#d89078", wet: "#7a4a6a", mtnNear: "#3a2a62", mtnFar: "#b86a8e", palm: "#1a1030", accent: "#6a2f6e", ink: "#fff6ee", stars: 0.08, lamps: 0.35, spark: 0.6 },
  golden: { zenith: "#4676bd", mid: "#e8ab84", horizon: "#ffd48c", fog: "#f4cf9e", sun: "#ffc66e", deep: "#1b5a78", shallow: "#58b2a8", foam: "#fff1d6", glint: "#ffe0a0", sand: "#ecc590", wet: "#9a7a58", mtnNear: "#5a6a86", mtnFar: "#c8a890", palm: "#14382e", accent: "#2a8a94", ink: "#ffffff", stars: 0, lamps: 0.08, spark: 0.7 },
  day: { zenith: "#1b78dc", mid: "#62b4ee", horizon: "#cdeeff", fog: "#cfeaf6", sun: "#fff3d0", deep: "#066a8c", shallow: "#1fd0cd", foam: "#ffffff", glint: "#ffffff", sand: "#f1dcb2", wet: "#b09c78", mtnNear: "#4b7098", mtnFar: "#86a6c4", palm: "#0f5a44", accent: "#14c8cf", ink: "#ffffff", stars: 0, lamps: 0, spark: 0.8 },
  dawn: { zenith: "#1b2a60", mid: "#6a6eac", horizon: "#eab0a8", fog: "#b8a0b8", sun: "#ffc8b0", deep: "#1b3262", shallow: "#5a7cb2", foam: "#ffe0d8", glint: "#ffd8c8", sand: "#8a7a8a", wet: "#3a3a60", mtnNear: "#2a3260", mtnFar: "#8a82b0", palm: "#0c1230", accent: "#33427e", ink: "#fff4f0", stars: 0.5, lamps: 0.7, spark: 0.45 },
  sunrise: { zenith: "#5878ba", mid: "#f2b6c2", horizon: "#ffd9a0", fog: "#ffe0c4", sun: "#ffd49a", deep: "#35709a", shallow: "#98d6d2", foam: "#fff0e0", glint: "#ffe6b8", sand: "#efd2b2", wet: "#a8947c", mtnNear: "#7a82a6", mtnFar: "#d4b6b8", palm: "#1a4a42", accent: "#7ab4c0", ink: "#ffffff", stars: 0, lamps: 0.15, spark: 0.6 },
  morning: { zenith: "#3a80d0", mid: "#9acae8", horizon: "#ffeac0", fog: "#f4e6d0", sun: "#ffe2a8", deep: "#0d6488", shallow: "#40d0c8", foam: "#ffffff", glint: "#fff0c8", sand: "#f1d8aa", wet: "#a8946c", mtnNear: "#587aa0", mtnFar: "#9db4cc", palm: "#124a3c", accent: "#2cc0c8", ink: "#ffffff", stars: 0, lamps: 0, spark: 0.8 },
};

const COLOR_KEYS = ["zenith", "mid", "horizon", "fog", "sun", "deep", "shallow", "foam", "glint", "sand", "wet", "mtnNear", "mtnFar", "palm", "accent", "ink"];
const NUM_KEYS = ["stars", "lamps", "spark"];

const compiled = {};
for (const [name, p] of Object.entries(S)) {
  const c = {};
  for (const k of COLOR_KEYS) c[k] = hex(p[k]);
  for (const k of NUM_KEYS) c[k] = p[k];
  compiled[name] = c;
}

// Stops are sun elevation in degrees. Evening and morning differ (sunset drama, sunrise pastels).
const EVENING = [
  { e: -14, s: "night" },
  { e: -6, s: "dusk" },
  { e: 0.5, s: "sunset" },
  { e: 7, s: "golden" },
  { e: 24, s: "day" },
];
const MORNING = [
  { e: -14, s: "night" },
  { e: -6, s: "dawn" },
  { e: 0.5, s: "sunrise" },
  { e: 9, s: "morning" },
  { e: 26, s: "day" },
];

const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function paletteAt(elev, morning) {
  const stops = morning ? MORNING : EVENING;
  let i = 0;
  while (i < stops.length - 2 && elev > stops[i + 1].e) i++;
  const a = stops[i], b = stops[i + 1];
  const t = smooth(a.e, b.e, elev);
  const A = compiled[a.s], B = compiled[b.s];
  const out = {};
  for (const k of COLOR_KEYS) out[k] = mix3(A[k], B[k], t);
  for (const k of NUM_KEYS) out[k] = lerp(A[k], B[k], t);
  return out;
}

export function phaseName(elev, morning) {
  if (elev < -12) return "Night";
  if (morning) {
    if (elev < -3) return "Dawn";
    if (elev < 8) return "Sunrise";
    if (elev < 20) return "Morning light";
    return "Daytime";
  }
  if (elev > 20) return "Daytime";
  if (elev > 4) return "Golden hour";
  if (elev > -3) return "Sunset";
  return "Dusk";
}

export const toCss = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

// ---------- full environment state for one hour ----------

export function environmentAt(hour, date, halfFovH) {
  const day = solarDay(date);
  const sun = sunAt(hour, day);
  const morning = hour < 12;
  const palette = paletteAt(sun.elev, morning);
  const moon = moonPhase(date);

  // Sun position on screen: real elevation, but azimuth is compressed into the camera's view.
  const sPhi = clamp(sun.H / Math.max(day.w0, 1), -1.3, 1.3) * 0.6 * halfFovH;
  const e = sun.elev * RAD;
  const sunDir = [Math.sin(sPhi) * Math.cos(e), Math.sin(e), -Math.cos(sPhi) * Math.cos(e)];

  // Moon crosses the sky from left to right between sunset and sunrise.
  const spanNight = 24 - day.sunset + day.sunrise;
  let tn = -1;
  if (hour >= day.sunset) tn = (hour - day.sunset) / spanNight;
  else if (hour <= day.sunrise) tn = (hour + 24 - day.sunset) / spanNight;
  const inNight = tn >= 0 && tn <= 1;
  const mElev = (inNight ? -3 + 36 * Math.sin(Math.PI * tn) : -12) * RAD;
  const mPhi = (inNight ? lerp(-0.62, 0.62, tn) : 0) * halfFovH * 0.95;
  const moonDir = [Math.sin(mPhi) * Math.cos(mElev), Math.sin(mElev), -Math.cos(mPhi) * Math.cos(mElev)];

  const nightF = smooth(-3, -12, sun.elev); // 0 day .. 1 night
  const sunI = smooth(-5, 6, sun.elev) * (1 + 0.35 * smooth(14, 2, sun.elev));
  const moonI = nightF * (0.35 + 0.65 * moon.illum) * smooth(-4, 6, mElev / RAD);

  // Light that draws the glitter path: the sun (lowered so a path always reaches the water) or the moon.
  const wSun = smooth(-6, 0, sun.elev);
  const gE = Math.min(Math.max(sun.elev, 1.5), 22) * RAD;
  const gDir = [Math.sin(sPhi) * Math.cos(gE), Math.sin(gE), -Math.cos(sPhi) * Math.cos(gE)];
  const lx = lerp(moonDir[0], gDir[0], wSun), ly = lerp(Math.max(moonDir[1], 0.05), gDir[1], wSun), lz = lerp(moonDir[2], gDir[2], wSun);
  const ll = Math.hypot(lx, ly, lz);
  const lightDir = [lx / ll, ly / ll, lz / ll];
  const moonCol = [0.78, 0.86, 1.0];
  const lightCol = [
    lerp(moonCol[0] * moonI * 0.9, palette.glint[0] * sunI, wSun),
    lerp(moonCol[1] * moonI * 0.9, palette.glint[1] * sunI, wSun),
    lerp(moonCol[2] * moonI * 0.9, palette.glint[2] * sunI, wSun),
  ];

  return {
    day, sun, morning, palette, moon,
    sunDir, moonDir, lightDir, lightCol, sunI, moonI, nightF,
    phase: phaseName(sun.elev, morning),
  };
}

export function formatHour(h, withSeconds = false) {
  const total = ((h % 24) + 24) % 24;
  let hh = Math.floor(total);
  let mm = Math.floor((total - hh) * 60);
  let ss = Math.floor((((total - hh) * 60) - mm) * 60);
  const p = (n) => String(n).padStart(2, "0");
  return withSeconds ? `${p(hh)}:${p(mm)}:${p(ss)}` : `${p(hh)}:${p(mm)}`;
}

export function compass(deg) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(((deg % 360) / 22.5)) % 16];
}

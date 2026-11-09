// KrackedLab beach: time model, weather, input and the render loop.
// Add ?koi to the address to see the original koi pond instead.
import { createScene } from "./scene.js";
import { createHud } from "./hud.js";
import { environmentAt, paletteAt, solarDay, toCss, clamp, lerp } from "./palette.js";

const params = new URLSearchParams(location.search);
if (!params.has("koi")) start();

function start() {
  document.documentElement.classList.add("beach-mode");

  const mobile = matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 600;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.createElement("canvas");
  canvas.id = "beach-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  let scene = null;
  try {
    scene = createScene(canvas, { mobile, reducedMotion: reduced });
  } catch (err) {
    console.warn("WebGL beach unavailable, using the gradient fallback.", err);
    document.documentElement.classList.add("bh-nogl");
  }

  // ---------- time ----------

  const realHourNow = () => {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 3.6e6;
  };

  const time = { mode: "live", shown: realHourNow(), target: realHourNow(), k: 3 };
  if (params.has("t")) {
    const h = parseFloat(params.get("t"));
    if (Number.isFinite(h)) { time.mode = "hold"; time.shown = time.target = ((h % 24) + 24) % 24; }
  }
  if (params.has("lapse")) time.mode = "lapse";

  const shortestDelta = (from, to) => ((to - from + 36) % 24) - 12;

  const today = new Date();
  const day = solarDay(today);
  const halfFov = () => (scene ? scene.halfFovH() : 0.6);
  const skyAt = (h) => {
    const env = environmentAt(h, today, halfFov());
    const p = env.palette;
    return [lerp(p.horizon[0], p.mid[0], 0.35), lerp(p.horizon[1], p.mid[1], 0.35), lerp(p.horizon[2], p.mid[2], 0.35)];
  };

  // ---------- weather (Open-Meteo, no key; the scene works without it) ----------

  const weather = {
    amp: 0.8, cloud: 0.3, wind: 0.3,
    targetAmp: 0.8, targetCloud: 0.3, targetWind: 0.3,
    temp: null, windSpeed: null, windDir: null, waveH: null, wavePeriod: null, sst: null, t: 0,
  };

  async function loadWeather() {
    try {
      const [a, b] = await Promise.all([
        fetch("https://api.open-meteo.com/v1/forecast?latitude=34.0195&longitude=-118.4912&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover&timezone=auto").then((r) => r.json()),
        fetch("https://marine-api.open-meteo.com/v1/marine?latitude=34.0&longitude=-118.6&current=wave_height,wave_period,sea_surface_temperature").then((r) => r.json()),
      ]);
      const c = a.current || {}, m = b.current || {};
      weather.temp = c.temperature_2m ?? null;
      weather.windSpeed = c.wind_speed_10m ?? null;
      weather.windDir = c.wind_direction_10m ?? null;
      if (c.cloud_cover != null) weather.targetCloud = clamp(c.cloud_cover / 100, 0.08, 0.95);
      if (c.wind_speed_10m != null) weather.targetWind = clamp(c.wind_speed_10m / 30, 0.1, 1);
      weather.waveH = m.wave_height ?? null;
      weather.wavePeriod = m.wave_period ?? null;
      weather.sst = m.sea_surface_temperature ?? null;
      if (m.wave_height != null) weather.targetAmp = clamp(0.45 + m.wave_height * 0.55, 0.45, 1.5);
      weather.t = Date.now();
    } catch {
      /* offline: keep computed values */
    }
  }
  loadWeather();
  setInterval(loadWeather, 20 * 60 * 1000);

  // ---------- HUD ----------

  const hud = createHud({
    skyAt,
    getDay: () => day,
    onScrub(hour, delta) {
      time.mode = "hold";
      time.k = 9;
      time.target = (((hour != null ? hour : time.target + delta) % 24) + 24) % 24;
    },
    onJump(hour) {
      time.mode = "hold";
      time.k = 1.8;
      time.target = ((hour % 24) + 24) % 24;
    },
    onLive() { time.mode = "live"; time.k = 1.6; },
    onLapse() {
      if (time.mode === "lapse") { time.mode = "hold"; time.target = time.shown; }
      else { time.mode = "lapse"; time.k = 6; }
    },
  });

  // ---------- input ----------

  const toNdc = (e) => [(e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)];
  addEventListener("pointermove", (e) => { if (scene) { const [x, y] = toNdc(e); scene.setPointer(x, y); } }, { passive: true });
  addEventListener("pointerdown", (e) => {
    if (!scene || e.target.closest?.("a, button, .bh-timeline")) return;
    const [x, y] = toNdc(e);
    scene.setPointer(x, y);
    scene.splash(x, y, 0.9);
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => scene && scene.leave());

  addEventListener("resize", () => scene && scene.resize());

  // ---------- loop ----------

  let last = performance.now();
  let clockT = 0;
  let cssT = 0;
  let slow = 0, fast = 0, frames = 0;
  let simTime = 0;
  const speed = reduced ? 0.3 : 1;
  let revealed = false;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    simTime += dt * speed;
    frames++;

    // time model
    const real = realHourNow();
    if (time.mode === "live") time.target = real;
    else if (time.mode === "lapse") time.target = (time.target + dt * 1.15) % 24;
    const delta = shortestDelta(time.shown, time.target);
    time.shown = (((time.shown + delta * (1 - Math.exp(-dt * time.k))) % 24) + 24) % 24;
    if (time.mode === "live" && Math.abs(delta) < 0.002) time.k = 3;

    // weather eases toward its targets
    const ease = 1 - Math.exp(-dt * 0.8);
    weather.amp += (weather.targetAmp - weather.amp) * ease;
    weather.cloud += (weather.targetCloud - weather.cloud) * ease;
    weather.wind += (weather.targetWind - weather.wind) * ease;

    const env = environmentAt(time.shown, today, halfFov());

    if (scene) {
      scene.applyEnvironment(env, weather);
      scene.update(dt, simTime, env, weather);
    }

    // HUD and page tint, a few times per second
    clockT += dt; cssT += dt;
    if (clockT > 0.2 || time.mode !== "live") {
      clockT = 0;
      hud.update({ shown: time.shown, live: time.mode === "live", lapse: time.mode === "lapse", env, weather, realHour: real });
    }
    if (cssT > 0.25) {
      cssT = 0;
      const root = document.documentElement.style;
      const p = env.palette;
      root.setProperty("--bh-accent", toCss(p.accent));
      root.setProperty("--bh-ink", toCss(p.ink));
      root.setProperty("--bh-sky", toCss(p.zenith));
      root.setProperty("--bh-horizon", toCss(p.horizon));
      root.setProperty("--bh-water", toCss(p.deep));
      root.setProperty("--bh-night", env.nightF.toFixed(3));
    }

    // adaptive resolution: back off when frames get slow
    if (scene && frames > 90) {
      const ms = dt * 1000;
      if (ms > 30) { slow++; fast = 0; } else { fast++; slow = Math.max(0, slow - 1); }
      if (slow > 50) { scene.setDprScale(scene.dprScale - 0.14); slow = 0; frames = 60; }
    }

    if (!revealed && frames > 2) {
      revealed = true;
      document.documentElement.classList.add("beach-ready");
    }
  }
  requestAnimationFrame(frame);

  // exposed for debugging and screenshots
  window.__beach = { time, weather, scene, hud };
}

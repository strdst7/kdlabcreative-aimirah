// Editorial HUD laid over the ocean: identity, local date and time, conditions and timeline.
import { formatHour, compass, toCss, clamp } from "./palette.js";

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function createHud({ onScrub, onJump, onLive, onLapse, skyAt, getDay }) {
  const root = el("div", "bh");
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "kdmirah ocean, live conditions");

  // ----- left: identity, date and time, phase
  const left = el("section", "bh-left");
  left.append(el("h2", "bh-place", "kdmirah"));
  const clock = el("p", "bh-clock");
  const date = el("span", "bh-date", "");
  const hm = el("span", "bh-hm", "--:--");
  clock.append(date, document.createTextNode(" · "), hm);
  const phase = el("p", "bh-phase");
  const dot = el("i", "bh-dot");
  const phaseText = el("span", "", "—");
  phase.append(dot, phaseText);
  const mode = el("p", "bh-mode", "Live · your local time");
  left.append(clock, phase, mode);

  // ----- right: conditions
  const right = el("aside", "bh-env");
  const rows = {};
  const defs = [
    ["air", "Air"], ["wind", "Wind"], ["swell", "Swell"], ["water", "Water"],
    ["sun", "Sun"], ["daylight", "Daylight"], ["moon", "Moon"],
  ];
  const dl = el("dl", "bh-list");
  for (const [k, label] of defs) {
    const row = el("div", "bh-row");
    const dt = el("dt", "", label);
    const dd = el("dd", "", "—");
    row.append(dt, dd);
    dl.append(row);
    rows[k] = dd;
  }
  const src = el("p", "bh-src", "Live: Open-Meteo");
  right.append(dl, src);

  // ----- bottom: timeline
  const tl = el("nav", "bh-timeline");
  tl.setAttribute("aria-label", "Time of day");
  const chipsTop = el("div", "bh-chips bh-chips-top");
  const track = el("div", "bh-track");
  track.tabIndex = 0;
  track.setAttribute("role", "slider");
  track.setAttribute("aria-label", "Time of day");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "24");
  const ticks = el("div", "bh-ticks");
  for (let h = 0; h <= 24; h += 3) {
    const t = el("i", "bh-tick" + (h % 6 === 0 ? " major" : ""));
    t.style.left = (h / 24) * 100 + "%";
    ticks.append(t);
  }
  const nowMark = el("i", "bh-now");
  const knob = el("div", "bh-knob");
  const knobLabel = el("span", "bh-knob-label", "");
  knob.append(knobLabel);
  track.append(ticks, nowMark, knob);
  const chipsBottom = el("div", "bh-chips bh-chips-bottom");
  const controls = el("div", "bh-controls");
  const liveBtn = el("button", "bh-btn bh-live", "Live");
  liveBtn.type = "button";
  const lapseBtn = el("button", "bh-btn bh-lapse", "Time-lapse");
  lapseBtn.type = "button";
  lapseBtn.setAttribute("aria-pressed", "false");
  controls.append(liveBtn, lapseBtn);
  tl.append(chipsTop, track, chipsBottom, controls);

  root.append(left, right, tl);
  document.body.append(root);

  // ----- chips
  const chips = [];
  function buildChips() {
    chipsTop.textContent = ""; chipsBottom.textContent = ""; chips.length = 0;
    const day = getDay();
    const list = [
      ["Night", 1.5, chipsTop], ["Sunrise", day.sunrise, chipsTop], ["Day", 12, chipsTop],
      ["Golden", day.sunset - 1.1, chipsTop], ["Sunset", day.sunset, chipsBottom],
    ];
    for (const [label, hour, parent] of list) {
      const b = el("button", "bh-chip", label);
      b.type = "button";
      const pct = (hour / 24) * 100;
      b.style.left = pct + "%";
      if (pct > 90) b.classList.add("end");
      if (pct < 8) b.classList.add("start");
      b.addEventListener("click", () => onJump(hour));
      parent.append(b);
      chips.push({ b, hour });
    }
  }

  function paintTrack() {
    const stops = [];
    for (let i = 0; i <= 48; i++) {
      const h = i / 2;
      stops.push(`${toCss(skyAt(h))} ${(i / 48) * 100}%`);
    }
    track.style.background = `linear-gradient(90deg, ${stops.join(",")})`;
  }

  buildChips();
  paintTrack();

  // ----- interaction
  let dragging = false;
  const hourFromEvent = (e) => {
    const r = track.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1) * 24;
  };
  track.addEventListener("pointerdown", (e) => {
    dragging = true;
    track.setPointerCapture(e.pointerId);
    root.classList.add("dragging");
    onScrub(hourFromEvent(e));
    e.preventDefault();
  });
  track.addEventListener("pointermove", (e) => { if (dragging) onScrub(hourFromEvent(e)); });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("dragging");
    try { track.releasePointerCapture(e.pointerId); } catch {}
  };
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
  track.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 1 : 0.25;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { onScrub(null, step); e.preventDefault(); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { onScrub(null, -step); e.preventDefault(); }
    else if (e.key === "Home") { onJump(0); e.preventDefault(); }
    else if (e.key === "End") { onJump(23.99); e.preventDefault(); }
  });
  liveBtn.addEventListener("click", onLive);
  lapseBtn.addEventListener("click", onLapse);

  // hide the HUD while the React menu or about panel is open
  const watch = () => {
    const open = !!document.querySelector('button[aria-label="Close menu"], button[aria-label="Close"]');
    root.classList.toggle("bh-hidden", open);
  };
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded", "aria-label"] });

  // ----- updates
  let lastEnvKey = "";
  function update(s) {
    const { shown, live, lapse, env, weather, realHour } = s;
    const localDate = new Date();
    date.textContent = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(localDate);
    hm.textContent = formatHour(shown);
    phaseText.textContent = env.phase;
    dot.style.background = toCss(env.palette.glint);
    dot.style.boxShadow = `0 0 14px 2px ${toCss(env.palette.glint)}`;
    mode.textContent = live ? "Live · your local time" : lapse ? "Time-lapse · a day in motion" : "Exploring · press Live to return";
    liveBtn.classList.toggle("on", live);
    lapseBtn.classList.toggle("on", lapse);
    lapseBtn.setAttribute("aria-pressed", String(lapse));
    knob.style.left = (shown / 24) * 100 + "%";
    nowMark.style.left = (((realHour % 24) + 24) % 24 / 24) * 100 + "%";
    knobLabel.textContent = formatHour(shown);
    track.setAttribute("aria-valuenow", shown.toFixed(2));
    track.setAttribute("aria-valuetext", `${formatHour(shown)}, ${env.phase}`);
    for (const c of chips) c.b.classList.toggle("near", Math.abs(c.hour - shown) < 0.6);

    const key = [env.day.sunrise.toFixed(1), weather.t, env.moon.name, Math.round(env.sun.elev), Math.round(env.sun.az)].join("|");
    if (key !== lastEnvKey) {
      lastEnvKey = key;
      rows.air.textContent = weather.temp != null ? `${weather.temp.toFixed(0)}°C` : "—";
      rows.wind.textContent = weather.windSpeed != null ? `${weather.windSpeed.toFixed(0)} km/h ${compass(weather.windDir)}` : "—";
      rows.swell.textContent = weather.waveH != null ? `${weather.waveH.toFixed(1)} m · ${weather.wavePeriod.toFixed(0)} s` : "—";
      rows.water.textContent = weather.sst != null ? `${weather.sst.toFixed(0)}°C` : "—";
      rows.sun.textContent = `${Math.round(env.sun.elev)}° · ${compass(env.sun.az)}`;
      rows.daylight.textContent = `${formatHour(env.day.sunrise)} – ${formatHour(env.day.sunset)}`;
      rows.moon.textContent = `${env.moon.name} · ${Math.round(env.moon.illum * 100)}%`;
      src.textContent = weather.t ? "Live: Open-Meteo" : "Conditions offline · sun & moon computed";
    }
  }

  return { update, root, rebuild() { buildChips(); paintTrack(); } };
}

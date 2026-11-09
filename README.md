# KrackedLab

An interactive digital ocean at Santa Monica built from luminous particles that follows the viewer's local time. Project by **kdmirah lab 2026** for **MI4, Inc. | aimirah**.

- aimirah.me
- mi4inc.com
- krackeddevs.com

Live: https://kdlabcreative-aimirah.vercel.app

## What it does

- **Time-adaptive light.** Sun elevation for Santa Monica (34.02°N, 118.49°W) and the day of year drive every colour: sunrise, daytime, golden hour, sunset, dusk and night. Colours blend continuously, with no preset scenes.
- **Particle ocean.** Water fills the view below the horizon. Five crossing swells with Gerstner roll, whitecaps and a glitter path under the sun or moon run on the GPU.
- **Flowing ribbons.** Wave-crest strokes ride the surface. The pointer, gulls and the sailboat leave ribbon wakes.
- **Koi.** The three koi swim in the sea band between the horizon and the shore, dim at night and fade at the band edges. The +/− control changes how many swim, and a click drops a coin they chase.
- **Interaction.** Pointer movement parts the water and adds parallax. A tap or click sends out a ripple.
- **Timeline.** Drag or use the arrow keys to explore any hour. Chips jump to sunrise, day, golden hour, sunset and night. `Live` returns to now, `Time-lapse` plays a whole day.
- **Conditions.** Air, wind, swell and water temperature come from Open-Meteo (no key) and also drive wave height, clouds and wind in the scene. Sun and moon figures are computed locally. The scene works offline.
- **Sound.** An original looping ocean-and-glass ambient track plays after a user gesture. Use the speaker button to mute it. `remake/gen/make-ocean-audio.py` regenerates the track with Python and FFmpeg.

## URLs

| Address | Result |
| --- | --- |
| `/` | The beach at your local time |
| `/?t=18.5` | Hold the beach at 18:30 |
| `/?lapse` | Start in time-lapse |
| `/?koi` | The koi pond full screen, without the beach |

## Layout

| Where | What |
| --- | --- |
| `site/index.html` | Page shell. Loads the React app and the beach. |
| `site/beach/main.js` | Time model, weather, input and the render loop. |
| `site/beach/scene.js` | Three.js scene: particle sets, ribbons, gulls, boat. |
| `site/beach/shaders.js` | GLSL for sky, ocean and light. |
| `site/beach/palette.js` | Sun and moon geometry, phase names and colour palettes. |
| `site/beach/hud.js`, `beach.css` | Editorial HUD and timeline. |
| `site/beach/three.module.min.js` | Three.js r160 (MIT, see `THREE-LICENSE.txt`). |
| `site/assets/` | The original React bundle: menu, about panel, ripples, koi mode. |
| `remake/gen/make-koi.mjs` | Draws the koi sprites used by `?koi`. |

Performance: the particle count scales with screen area and device class, the pixel ratio is capped (1.5 desktop, 1.25 mobile) and backs off automatically when frames run slow. `prefers-reduced-motion` slows time and turns off parallax.

Built with a Remake workflow (github.com/rubenhassid1/remake); the page shell and menu descend from a public landing page, and every picture, sound, word, colour and link is replaced.

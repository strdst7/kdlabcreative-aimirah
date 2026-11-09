// GLSL for the particle beach. Every particle is placed once on the CPU; waves, colour,
// glitter, foam and fog are all computed on the GPU from the shared uniforms below.

export const COMMON = /* glsl */ `
uniform float uTime, uAmp, uDpr, uNight, uLamps, uSpark, uCloud, uWind;
uniform vec3 uFog, uDeep, uShallow, uFoam, uGlint, uSand, uWet, uLightDir, uLightCol;
uniform vec3 uHorizon, uMid, uZenith, uSunCol, uPalm, uMtnNear, uMtnFar;
uniform vec4 uDrops[10];

float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

// The shoreline: a gentle diagonal with soft bays. Water lies at z < shoreZ(x).
float shoreZ(float x){ return -17.0 - 0.14 * x + 1.6 * sin(x * 0.11 + 1.3) + 0.7 * sin(x * 0.27); }

const vec4 WV[5] = vec4[5](
  vec4(46.0,  0.00, 0.55, 1.0),
  vec4(26.0,  0.38, 0.34, 1.0),
  vec4(13.5, -0.52, 0.19, 1.0),
  vec4( 7.2,  0.95, 0.10, 1.0),
  vec4( 3.7, -1.20, 0.055, 1.0)
);

// Five crossing swells with Gerstner roll. Returns (height, d/dx, d/dz, 0) and a horizontal push.
vec4 waves(vec2 p, float t, float amp, out vec2 disp){
  p += 0.9 * vec2(sin(p.y * 0.045 + t * 0.13), cos(p.x * 0.05 - t * 0.11));
  float h = 0.0, gx = 0.0, gz = 0.0;
  disp = vec2(0.0);
  for (int i = 0; i < 5; i++){
    vec4 w = WV[i];
    float k = 6.2831853 / w.x;
    float om = sqrt(9.81 * k) * 0.5;
    vec2 d = vec2(sin(w.y), cos(w.y));
    float ph = k * dot(d, p) - om * t + float(i) * 1.7;
    float a = amp * w.z * 1.1;
    float s = sin(ph), c = cos(ph);
    h += a * s;
    gx += a * k * c * d.x;
    gz += a * k * c * d.y;
    disp -= d * a * c * 0.8;
  }
  return vec4(h, gx, gz, 0.0);
}
`;

// ---------------------------------------------------------------- sky + base fill

export const SKY_VERT = /* glsl */ `
varying vec2 vNdc;
void main(){
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;

export const SKY_FRAG = /* glsl */ `
${COMMON}
uniform vec3 uRight, uUp, uFwd, uCamPos, uSunDir, uMoonDir;
uniform float uTanY, uAspect, uSunI, uMoonI, uStars, uMoonF, uCloudQ;
varying vec2 vNdc;

float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){
    if (float(i) >= uCloudQ) break;
    v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5;
  }
  return v;
}

vec3 skyGrad(vec3 d){
  float y = d.y;
  vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.30, y));
  c = mix(c, uZenith, smoothstep(0.18, 0.95, y));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunCol * uSunI * (pow(s, 6.0) * 0.22 + pow(s, 48.0) * 0.45 + pow(s, 400.0) * 0.6);
  float m = max(dot(d, uMoonDir), 0.0);
  c += vec3(0.55, 0.68, 1.0) * uMoonI * pow(m, 60.0) * 0.35;
  c = mix(c, uFog, exp(-max(y, 0.0) * 10.0) * 0.65);
  return c;
}

void main(){
  vec3 d = normalize(uFwd + vNdc.x * uRight * uTanY * uAspect + vNdc.y * uUp * uTanY);
  vec3 col;
  if (d.y >= 0.0){
    col = skyGrad(d);
    float h = d.y;

    // stars: fixed on the sky, twinkling
    if (uStars > 0.01){
      vec2 uv = vec2(atan(d.x, -d.z), d.y) * 420.0;
      vec2 id = floor(uv), f = fract(uv) - 0.5;
      float r = hash21(id);
      vec2 off = (vec2(hash21(id + 3.1), hash21(id + 7.7)) - 0.5) * 0.6;
      float st = smoothstep(0.24, 0.0, length(f - off)) * step(0.972, r);
      st *= 0.45 + 0.55 * sin(uTime * (0.8 + r * 2.5) + r * 60.0);
      col += vec3(0.85, 0.92, 1.0) * st * uStars * smoothstep(0.02, 0.22, h) * 1.2;
    }

    // clouds
    if (uCloudQ > 0.5){
      vec2 cp = d.xz / (h + 0.10) * 0.55 + vec2(uTime * 0.004 * (0.4 + uWind), 0.0);
      float dens = fbm(cp * 1.4);
      float cov = mix(0.64, 0.40, uCloud);
      float cl = smoothstep(cov, cov + 0.26, dens) * smoothstep(0.0, 0.10, h) * (1.0 - 0.35 * smoothstep(0.5, 1.0, h));
      float l = fbm(cp * 1.4 + uSunDir.xz * 0.18);
      float rim = clamp((dens - l) * 3.0 + 0.5, 0.0, 1.0);
      vec3 shade = uMid * 0.75 + uHorizon * 0.15;
      vec3 lit = mix(uHorizon, vec3(1.0), 0.5) * 1.05 + uSunCol * uSunI * 0.25;
      vec3 cc = mix(shade, lit, rim);
      cc *= 0.22 + 0.78 * (1.0 - uNight);
      cc += vec3(0.5, 0.62, 0.9) * uMoonI * 0.08 * rim;
      col = mix(col, cc, cl * 0.85);
    }

    // sun disc
    float sd = dot(d, uSunDir);
    float disc = smoothstep(0.99975, 0.99982, sd);
    col = mix(col, vec3(1.0, 0.96, 0.86) * 1.2, disc * clamp(uSunI, 0.0, 1.0));

    // moon with a true phase terminator
    if (uMoonI > 0.01){
      vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
      vec3 mu = cross(uMoonDir, mr);
      vec2 q = vec2(dot(d, mr), dot(d, mu)) / 0.03;
      float rr = length(q);
      if (rr < 1.0 && dot(d, uMoonDir) > 0.0){
        vec3 n = vec3(q, sqrt(1.0 - rr * rr));
        vec3 L = vec3(sin(uMoonF * 6.2831853), 0.0, -cos(uMoonF * 6.2831853));
        float lit = smoothstep(-0.03, 0.10, dot(n, L));
        float maria = 0.78 + 0.22 * fbm(q * 2.6 + 4.0);
        float edge = smoothstep(1.0, 0.94, rr);
        col = mix(col, vec3(0.93, 0.95, 1.0) * maria, edge * lit * clamp(uMoonI * 1.6 + 0.1, 0.0, 1.0));
        col += vec3(0.05, 0.07, 0.13) * edge * (1.0 - lit) * uMoonI;
      }
    }
  } else {
    // below the horizon: the base fill under the particle water and sand
    float t = -uCamPos.y / d.y;
    vec3 P = uCamPos + d * t;
    float dsh = shoreZ(P.x) - P.z;
    vec3 r = vec3(d.x, -d.y, d.z);
    float fres = 0.02 + 0.98 * pow(1.0 + d.y, 5.0);
    vec3 refl = skyGrad(r);
    vec3 water = mix(mix(uDeep, uShallow, smoothstep(120.0, 0.0, dsh) * 0.65) * 0.8, refl, clamp(fres * 1.1, 0.0, 0.9));
    float ds = -dsh;
    float wet = smoothstep(7.0, 0.0, ds);
    vec3 sand = mix(uSand * 0.86, uWet, wet * 0.8);
    col = mix(water, sand, smoothstep(-0.7, 0.7, ds));
    col = mix(col, uFog, exp(d.y * 16.0) * 0.7);
  }

  float vg = 1.0 - 0.30 * dot(vNdc * vec2(0.8, 1.0), vNdc * vec2(0.8, 1.0)) * 0.5;
  col *= vg;
  col += (hash21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 200.0;
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- shared particle fragment

export const POINT_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vAlpha;
varying vec3 vGlow;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float core = exp(-d * 3.2);
  float a = vAlpha * core;
  gl_FragColor = vec4(vCol * a + vGlow * core, a);
}`;

// ---------------------------------------------------------------- ocean

export const OCEAN_VERT = /* glsl */ `
${COMMON}
attribute vec4 aRnd;
varying vec3 vCol;
varying float vAlpha;
varying vec3 vGlow;
void main(){
  vec3 p0 = position;
  float dsh = shoreZ(p0.x) - p0.z;
  float amp = uAmp * mix(0.2, 1.0, smoothstep(0.0, 34.0, dsh));
  vec2 disp;
  vec4 w = waves(p0.xz, uTime, amp, disp);

  // pointer and tap ripples
  float rip = 0.0, rgx = 0.0, rgz = 0.0;
  for (int i = 0; i < 10; i++){
    vec4 dr = uDrops[i];
    float age = uTime - dr.z;
    if (age > 0.0 && age < 7.0){
      vec2 q = p0.xz - dr.xy;
      float r = length(q);
      float front = age * 3.4;
      float env = exp(-pow((r - front) / 1.5, 2.0));
      float ph = (r - front) * 2.6;
      float a = dr.w * env * exp(-age * 0.45) / (1.0 + r * 0.08);
      rip += a * cos(ph);
      vec2 dir = q / max(r, 1e-3);
      float dh = -a * 2.6 * sin(ph);
      rgx += dh * dir.x; rgz += dh * dir.y;
    }
  }

  float h = w.x + rip;
  vec3 pos = vec3(p0.x + disp.x * 0.6, h, p0.z + disp.y * 0.6);
  float ph2 = aRnd.x * 6.2831853;
  pos.xz += 0.16 * vec2(cos(uTime * 0.6 + ph2), sin(uTime * 0.5 + ph2 * 1.3));

  vec3 N = normalize(vec3(-(w.y + rgx), 1.0, -(w.z + rgz)));
  vec3 V = normalize(cameraPosition - pos);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 R = reflect(-V, N);

  float crest = smoothstep(0.1, 0.95, h / (uAmp * 1.1 + 0.001));
  float shMix = smoothstep(90.0, 0.0, dsh) * 0.85;
  vec3 body = mix(uDeep, uShallow, clamp(shMix + crest * 0.35 + aRnd.y * 0.12, 0.0, 1.0));
  vec3 refl = mix(uFog, uMid, clamp(R.y * 1.6, 0.0, 1.0));
  vec3 col = mix(body, refl, clamp(fres * 0.9, 0.0, 0.8));

  // glitter along the sun or moon path
  float ld = max(dot(R, uLightDir), 0.0);
  float tw = 0.5 + 0.5 * sin(uTime * (1.3 + 3.2 * aRnd.z) + aRnd.w * 40.0);
  tw *= tw;
  float lobe = pow(ld, 90.0) * 0.4 + pow(ld, 700.0) * 3.4;
  vec3 glow = uLightCol * lobe * tw * 1.15;
  float sp = smoothstep(0.986, 1.0, fract(aRnd.w * 13.7 + uTime * 0.12 * (0.5 + aRnd.z)));
  glow += uGlint * sp * (0.2 + 0.8 * fres) * uSpark * 0.55;

  // foam: breakers near the shore, a few whitecaps further out, and the swash edge
  float breakers = smoothstep(16.0, 2.0, dsh) * smoothstep(0.05, 0.6, crest + rip * 0.3);
  float caps = step(0.94, crest) * aRnd.y * 0.5;
  float swashEdge = -1.6 * (0.5 + 0.5 * sin(uTime * 0.45 + p0.x * 0.17 + h * 1.3));
  float lace = smoothstep(2.8, 0.0, dsh - swashEdge) * (0.55 + 0.45 * sin(p0.x * 2.3 + uTime * 0.8 + aRnd.x * 6.0));
  float foam = clamp(breakers + caps + lace * 0.95, 0.0, 1.0);
  col = mix(col, uFoam, foam);
  glow += vec3(0.10, 0.38, 0.80) * uNight * (0.12 + 0.88 * crest) * (0.25 + 0.75 * tw) * 0.5;
  float edgeFade = smoothstep(swashEdge - 0.2, swashEdge + 1.8, dsh);
  float alpha = (0.62 + 0.25 * foam) * edgeFade;

  float dist = length(cameraPosition - pos);
  float fogF = smoothstep(180.0, 3200.0, dist) * 0.88;
  col = mix(col, uFog, fogF);
  glow *= 1.0 - fogF * 0.5;

  vCol = col; vAlpha = alpha; vGlow = glow * edgeFade;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  gl_PointSize = (1.4 + 1.9 * aRnd.y + 2.2 * clamp(dot(glow, vec3(0.33)), 0.0, 1.0)) * uDpr;
}`;

// ---------------------------------------------------------------- sand

export const SAND_VERT = /* glsl */ `
${COMMON}
attribute vec4 aRnd;
varying vec3 vCol;
varying float vAlpha;
varying vec3 vGlow;
void main(){
  vec3 pos = position;
  float ds = pos.z - shoreZ(pos.x);
  float swash = 0.5 + 0.5 * sin(uTime * 0.45 + pos.x * 0.17);
  float wetLine = 1.6 * swash;
  float wet = smoothstep(wetLine + 5.0, wetLine - 0.2, ds);

  vec3 base = mix(uSand * 0.78, uSand * 1.12, aRnd.y);
  float rip = 0.5 + 0.5 * sin(pos.z * 1.9 + sin(pos.x * 0.4) * 2.0 + aRnd.x * 0.6);
  base *= 0.9 + 0.2 * rip;
  vec3 col = mix(base, uWet, wet * 0.85);
  col += uMid * 0.16 * wet;

  float lace = smoothstep(0.7, 0.0, abs(ds - wetLine)) * (0.5 + 0.5 * sin(pos.x * 3.0 + aRnd.x * 9.0 + uTime));
  col = mix(col, uFoam, clamp(lace, 0.0, 1.0) * 0.8);

  vec3 glow = uLightCol * wet * smoothstep(0.93, 1.0, fract(aRnd.w * 11.3 + uTime * 0.2 * (0.4 + aRnd.z))) * 0.9;
  glow += uGlint * step(0.996, aRnd.w) * (0.2 + 0.3 * sin(uTime * 2.0 + aRnd.x * 40.0)) * uSpark * 0.5;

  vec3 mv = pos;
  mv.y += 0.02 * sin(uTime * 0.7 + aRnd.x * 20.0) * (1.0 - wet);
  float dist = length(cameraPosition - mv);
  col = mix(col, uFog, smoothstep(60.0, 400.0, dist) * 0.5);

  vCol = col; vAlpha = 0.72; vGlow = glow;
  gl_Position = projectionMatrix * viewMatrix * vec4(mv, 1.0);
  gl_PointSize = (1.5 + 1.5 * aRnd.y) * uDpr;
}`;

// ---------------------------------------------------------------- mountains

export const MOUNTAIN_VERT = /* glsl */ `
${COMMON}
attribute vec4 aRnd;
uniform float uLayer;
varying vec3 vCol;
varying float vAlpha;
varying vec3 vGlow;
void main(){
  vec3 pos = position;
  float hf = aRnd.z;
  vec3 col = mix(uMtnFar, uMtnNear, uLayer);
  col = mix(col, uFog, 0.12 + 0.30 * (1.0 - uLayer));
  col *= 0.78 + 0.5 * hf;
  vec3 glow = uLightCol * smoothstep(0.9, 1.0, hf) * 0.16 * (0.5 + 0.5 * uLayer);
  float lamp = step(0.988, aRnd.x) * step(hf, 0.45) * (0.6 + 0.4 * sin(uTime * 1.3 + aRnd.w * 50.0));
  glow += vec3(1.0, 0.78, 0.5) * lamp * uLamps * 0.9;
  vCol = col; vAlpha = 0.58 + 0.25 * hf; vGlow = glow;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  gl_PointSize = (1.5 + 1.2 * aRnd.y + lamp * 1.5) * uDpr;
}`;

// ---------------------------------------------------------------- pier and palms

export const STRUCT_VERT = /* glsl */ `
${COMMON}
attribute vec4 aRnd;
attribute float aKind;
varying vec3 vCol;
varying float vAlpha;
varying vec3 vGlow;
void main(){
  vec3 pos = position;
  float dist0 = length(cameraPosition - pos);
  float kind = aKind;
  if (kind > 3.5) {
    vec2 sw = vec2(sin(uTime * 0.7 + aRnd.x * 6.2831), cos(uTime * 0.6 + aRnd.x * 5.0));
    pos.xz += sw * (0.12 + 0.28 * uWind) * aRnd.z;
  }
  vec3 base = mix(uPalm * 1.15 + uFog * 0.08, uFog, smoothstep(40.0, 900.0, dist0));
  float rim = pow(max(dot(normalize(vec3(0.0, 0.4, -1.0)), uLightDir), 0.0), 2.0);
  vec3 col = base;
  vec3 glow = vec3(0.0);
  float a = 0.85, size = 2.2;
  vec3 wood = mix(uPalm * 0.9 + uFog * 0.05, uSand * 0.5, 0.7);
  wood = mix(wood, uFog, smoothstep(60.0, 900.0, dist0));
  if (kind < 0.5)      { col = wood * 1.1; a = 0.8; size = 2.0; }
  else if (kind < 1.5) { col = wood * 1.3; a = 0.75; size = 1.7; }
  else if (kind < 2.5) {
    float tw = 0.75 + 0.25 * sin(uTime * 2.0 + aRnd.x * 30.0);
    vec3 lamp = mix(vec3(1.0, 0.82, 0.55), vec3(1.0, 0.6, 0.35), aRnd.y);
    glow = lamp * (0.18 + 1.3 * uLamps) * tw;
    a = 0.6; size = 3.6 + 3.0 * uLamps;
  }
  else if (kind < 3.5) { col = wood * 0.8; a = 0.7; size = 1.9; }
  else { col = mix(base, uGlint * 0.5, rim * 0.12); a = 0.9; size = kind < 4.5 ? 2.4 : 2.0; }
  vCol = col; vAlpha = a; vGlow = glow;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  gl_PointSize = clamp(size * uDpr * clamp(60.0 / dist0, 0.6, 2.4), 1.0, 18.0);
}`;

export const WHEEL_VERT = /* glsl */ `
${COMMON}
attribute vec4 aRnd;
uniform vec3 uWC, uWR;
uniform float uWA;
varying vec3 vCol;
varying float vAlpha;
varying vec3 vGlow;
void main(){
  float kind = position.z;
  float c = cos(uWA), s = sin(uWA);
  vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
  vec3 pos = uWC + uWR * q.x + vec3(0.0, 1.0, 0.0) * q.y;
  float dist0 = length(cameraPosition - pos);
  vec3 lampCol = 0.55 + 0.45 * cos(6.2831853 * (aRnd.x + uTime * 0.04 + vec3(0.0, 0.33, 0.67)));
  vec3 base = mix(uPalm * 1.1 + 0.05, uFoam * 0.85, 0.12 + 0.3 * uNight);
  base = mix(base, uFog, smoothstep(60.0, 900.0, dist0));
  vec3 glow = vec3(0.0);
  float a = 0.8, size = 1.8;
  if (kind > 1.5 && kind < 2.5) { glow = lampCol * (0.2 + 1.5 * uLamps); size = 5.0; a = 0.9; }
  else if (kind > 3.5)          { glow = lampCol * (0.12 + 1.3 * uLamps) * (0.7 + 0.3 * sin(uTime * 3.0 + aRnd.y * 40.0)); size = 2.8 + 1.4 * uLamps; }
  else if (kind > 2.5)          { size = 3.4; }
  vCol = base; vAlpha = a; vGlow = glow;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  gl_PointSize = clamp(size * uDpr * clamp(60.0 / dist0, 0.6, 2.4), 1.0, 18.0);
}`;

// ---------------------------------------------------------------- floating spray / fireflies

export const DUST_VERT = /* glsl */ `
${COMMON}
attribute vec4 aRnd;
varying vec3 vCol;
varying float vAlpha;
varying vec3 vGlow;
void main(){
  vec3 p = position;
  p.x = mod(p.x + uTime * (0.5 + aRnd.x * 0.9) * (0.6 + uWind) + 70.0, 140.0) - 70.0;
  p.y += 0.7 * sin(uTime * 0.5 + aRnd.y * 40.0) + aRnd.z * 0.8 * sin(uTime * 0.23 + aRnd.w * 20.0);
  p.z += 1.2 * sin(uTime * 0.31 + aRnd.w * 30.0);
  float tw = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.9 + aRnd.z * 2.2) + aRnd.y * 60.0), 2.0);
  vec3 tint = mix(uGlint, vec3(0.45, 0.78, 1.0), uNight);
  vCol = vec3(0.0); vAlpha = 0.0;
  vGlow = tint * tw * (0.12 + 0.55 * uNight + 0.25 * uSpark * (1.0 - uNight));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  gl_PointSize = (1.2 + 2.2 * aRnd.y) * uDpr * clamp(80.0 / length(cameraPosition - p), 0.5, 2.0);
}`;

// ---------------------------------------------------------------- flow ribbons on the water

export const FLOW_VERT = /* glsl */ `
${COMMON}
attribute float aAlong;
attribute float aSide;
attribute vec4 aRnd;
varying float vA;
varying float vSide;
void main(){
  vec3 p = position;
  p.x += sin(aAlong * 5.0 + uTime * 0.25 + aRnd.x * 6.0) * aRnd.w * 3.0;
  float dsh = shoreZ(p.x) - p.z;
  float amp = uAmp * mix(0.2, 1.0, smoothstep(0.0, 34.0, dsh));
  vec2 disp;
  vec4 w = waves(p.xz, uTime, amp, disp);
  p.y = w.x + 0.06;
  p.xz += disp * 0.6;
  float flow = 0.5 + 0.5 * sin(aAlong * 6.2831853 * (1.0 + aRnd.z * 2.0) - uTime * (0.25 + aRnd.y * 0.4) + aRnd.x * 6.2831853);
  float fade = sin(3.14159265 * aAlong);
  float edge = smoothstep(0.0, 6.0, dsh);
  vA = fade * flow * flow * (0.22 + 0.5 * aRnd.w) * edge;
  vSide = aSide;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

export const FLOW_FRAG = /* glsl */ `
${COMMON}
varying float vA;
varying float vSide;
void main(){
  float soft = 1.0 - vSide * vSide;
  vec3 c = mix(uGlint, uShallow * 1.6, 0.3) * (0.6 + 0.8 * uLightCol);
  float a = vA * soft * (0.55 + 0.45 * uSpark);
  gl_FragColor = vec4(c * a, a);
}`;

// ---------------------------------------------------------------- dynamic ribbons (pointer wake, boat wake, gull trails)

export const RIBBON_VERT = /* glsl */ `
attribute float aAlong;
attribute float aSide;
varying float vAlong;
varying float vSide;
void main(){
  vAlong = aAlong; vSide = aSide;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

export const RIBBON_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlong;
varying float vSide;
void main(){
  float soft = 1.0 - vSide * vSide;
  float a = pow(vAlong, 1.4) * soft * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
}`;

// ---------------------------------------------------------------- small moving sprites (gulls, sailboat)

export const SPRITE_VERT = /* glsl */ `
uniform float uDpr, uSize;
attribute float aShade;
varying float vShade;
void main(){
  vShade = aShade;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * uDpr * (90.0 / max(-mv.z, 1.0)), 1.5, 14.0);
}`;

export const SPRITE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vShade;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float a = exp(-d * 2.4) * uOpacity * vShade;
  gl_FragColor = vec4(uColor * a, a);
}`;

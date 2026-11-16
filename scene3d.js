/* Real-time 3D scene: orbiting camera above Cascadia.
   Fault slip rate -> seafloor displacement -> sea-surface height, from the exported rupture fields.
   Plain WebGL2, no dependencies; data arrive as base64 inside assets/data/*.js so the deck runs from file://. */
(() => {
const cv = document.getElementById('rup3d'); if (!cv) return;
const main = cv.closest('.slide'), cover = document.querySelector('.slide.cover3d');   // the same canvas also plays on the title slide
let slide = main; const hud = id => slide.querySelector('[data-hud="' + id + '"]'), put = (id, s) => { const e = hud(id); if (e) e.textContent = s; };
const gl = cv.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
if (!gl) { hud('phase').textContent = 'WebGL2 is not available in this browser'; return; }
cv.width = 2560; cv.height = 1440;

const COVER = '013703';                   // the title slide loops this one
const EVENTS = ['031843'];      // a small one, then a large one (shown next to the conclusions)
const EX = 4.5, RE = 6371.0;                 // vertical exaggeration of depth, Earth radius (km)
const WIN = [-130.5, 39.6, -122.6, 50.9];    // lon0, lat0, lon1, lat1 of the transparent window
const D2R = Math.PI / 180;

/* ---------- tiny linear algebra ---------- */
const ll = (lon, lat, r) => { const a = lon * D2R, b = lat * D2R; return [r * Math.cos(b) * Math.cos(a), r * Math.sin(b), -r * Math.cos(b) * Math.sin(a)]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));
function persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
function lookAt(e, c, up) { const z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x); return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]; }
function mmul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }

/* ---------- shaders ---------- */
const HEAD = '#version 300 es\nprecision highp float; precision highp sampler3D;\n';
const COMMON = `
const float D2R = 0.017453292519943295;
vec3 ll2xyz(float lon, float lat, float r){ float a = lon*D2R, b = lat*D2R; return vec3(r*cos(b)*cos(a), r*sin(b), -r*cos(b)*sin(a)); }
vec3 diverge(float c){ c = clamp(c,-1.,1.); vec3 w = vec3(.94,.94,.92);
  return c > 0. ? mix(w, vec3(.80,.10,.10), pow(c,.8)) : mix(w, vec3(.10,.33,.82), pow(-c,.8)); }
vec3 hot(float v){ v = clamp(v,0.,1.);
  vec3 c0=vec3(.10,.05,.30), c1=vec3(.52,.12,.48), c2=vec3(.90,.28,.24), c3=vec3(.99,.65,.12), c4=vec3(1.,1.,.80);
  return v<.25 ? mix(c0,c1,v*4.) : v<.5 ? mix(c1,c2,(v-.25)*4.) : v<.75 ? mix(c2,c3,(v-.5)*4.) : mix(c3,c4,(v-.75)*4.); }
vec3 warm(float c){ c = clamp(c,-1.,1.);
  return c > 0. ? (c < .5 ? mix(vec3(1.,.93,.55), vec3(.97,.55,.10), c*2.) : mix(vec3(.97,.55,.10), vec3(.62,.06,.06), (c-.5)*2.)) : mix(vec3(.85,.80,.95), vec3(.42,.16,.70), -c); }
float dec(float e){ float s = (e-.5)*2.; return sign(s)*s*s; }
`;
const VS_SPHERE = HEAD + `in vec3 aP; uniform mat4 uVP; uniform float uR; out vec3 vP;
void main(){ vP = aP*uR; gl_Position = uVP*vec4(vP,1.); }`;
const FS_GLOBE = HEAD + COMMON + `in vec3 vP; out vec4 o;
uniform sampler2D uGlobal, uRegion, uMask; uniform vec4 uBox, uWin; uniform vec3 uCam, uSun; uniform float uWinA;
void main(){ vec3 n = normalize(vP); float lat = degrees(asin(n.y)), lon = degrees(atan(-n.z, n.x));
  vec3 col = texture(uGlobal, vec2((lon+180.)/360., (90.-lat)/180.)).rgb;
  vec2 r = vec2((lon-uBox.x)/(uBox.z-uBox.x), (uBox.w-lat)/(uBox.w-uBox.y));
  float inb = smoothstep(0.,.05,r.x)*smoothstep(0.,.05,1.-r.x)*smoothstep(0.,.05,r.y)*smoothstep(0.,.05,1.-r.y);
  col = mix(col, texture(uRegion, r).rgb, inb);
  col = pow(col, vec3(1.08)) * (0.66 + 0.46*max(dot(n,uSun),0.));
  vec3 V = normalize(uCam - vP); float fr = pow(1. - max(dot(n,V),0.), 3.2);
  col += vec3(.30,.55,1.)*fr*0.75;
  vec2 mq = vec2((lon-uWin.x)/(uWin.z-uWin.x), (uWin.w-lat)/(uWin.w-uWin.y));
  float w = (mq.x > 0. && mq.x < 1. && mq.y > 0. && mq.y < 1.) ? texture(uMask, mq).r : 0.;
  o = vec4(col, 1. - w*(1.-uWinA)); }`;
const FS_INNER = HEAD + `in vec3 vP; out vec4 o;
void main(){ vec3 n = normalize(vP); float lat = degrees(asin(n.y)), lon = degrees(atan(-n.z, n.x));
  vec2 g = abs(fract(vec2(lon,lat))-.5); vec2 fw = fwidth(vec2(lon,lat));
  float line = 1. - min(smoothstep(0., fw.x*1.5, .5-g.x), smoothstep(0., fw.y*1.5, .5-g.y));
  o = vec4(vec3(.030,.042,.058) + vec3(.05,.07,.09)*line, 1.); }`;
const FS_HALO = HEAD + `in vec3 vP; out vec4 o; uniform vec3 uCam;
void main(){ vec3 n = normalize(vP), V = normalize(uCam - vP); float a = pow(clamp(1. + dot(n,V)*3.2, 0., 1.), 3.);
  o = vec4(vec3(.32,.58,1.)*a*0.85, 1.); }`;
const VS_FAULT = HEAD + COMMON + `in vec3 aLLD; in vec3 aB; in float aVid; uniform mat4 uVP; uniform float uEX, uFrame; uniform sampler2D uSR;
out vec3 vB; out float vS; out float vZ;
void main(){ vB = aB; vZ = aLLD.z; int v = int(aVid+.5); float f = clamp(uFrame, 0., 254.999); int f0 = int(floor(f));
  float e = mix(texelFetch(uSR, ivec2(v,f0), 0).r, texelFetch(uSR, ivec2(v,f0+1), 0).r, fract(f)); vS = e*e;
  gl_Position = uVP*vec4(ll2xyz(aLLD.x, aLLD.y, 1. + uEX*aLLD.z/6371.), 1.); }`;
const FS_FAULT = HEAD + COMMON + `in vec3 vB; in float vS; in float vZ; out vec4 o; uniform float uGain, uHi, uDim, uDepth;
vec3 vir(float v){ v = clamp(v,0.,1.); vec3 c0=vec3(.27,.00,.33), c1=vec3(.23,.32,.55), c2=vec3(.13,.57,.55), c3=vec3(.37,.79,.38), c4=vec3(.99,.91,.14);
  return v<.25 ? mix(c0,c1,v*4.) : v<.5 ? mix(c1,c2,(v-.25)*4.) : v<.75 ? mix(c2,c3,(v-.5)*4.) : mix(c3,c4,(v-.75)*4.); }
void main(){ float sr = vS*uGain; float t = clamp((-vZ-6.)/24., 0., 1.);
  vec3 dcol = t < .5 ? mix(vec3(.96,.90,.78), vec3(.72,.52,.36), t*2.) : mix(vec3(.72,.52,.36), vec3(.26,.15,.14), (t-.5)*2.);
  float fz = fract(-vZ/4.), dz = min(fz, 1.-fz)/max(fwidth(vZ/4.), 1e-5); dcol = mix(dcol, vec3(.15,.08,.06), (1. - smoothstep(0., 1.3, dz))*.35);
  vec3 base = mix(vec3(.25,.31,.38), dcol, uDepth)*(1. + .12*uHi);
  vec3 col = mix(base, vir(sr)*1.15 + vec3(.04), smoothstep(.002,.03,sr));
  o = vec4(col*(1. - .5*uDim), 1.); }`;
const VS_GRID = HEAD + COMMON + `in vec3 aLLD; in vec2 aUV; uniform mat4 uVP; uniform sampler3D uF; uniform float uW, uWarp, uEX, uLift, uUseDepth;
out vec2 vUV; out float vD; out float vZ;
void main(){ vUV = aUV; vZ = aLLD.z; float d = dec(texture(uF, vec3(aUV, uW)).r); vD = d;
  float r = 1. + uUseDepth*uEX*aLLD.z/6371. + uLift + uWarp*d;
  gl_Position = uVP*vec4(ll2xyz(aLLD.x, aLLD.y, r), 1.); }`;
const CONTOUR = `float contour(float c, float n){ float f = fract(c*n), d = min(f, 1.-f)/max(fwidth(c*n), 1e-5); return (1. - smoothstep(0., 1.4, d))*smoothstep(.03, .09, abs(c)); }
`;
const FS_SEAFLOOR = HEAD + COMMON + CONTOUR + `in vec2 vUV; in float vD; in float vZ; out vec4 o; uniform float uShow, uGain, uBathy, uWire; uniform vec2 uN;
void main(){ float t = clamp(-vZ/3.2, 0., 1.);
  vec3 bath = t < .5 ? mix(vec3(.72,.95,.93), vec3(.20,.62,.80), t*2.) : mix(vec3(.20,.62,.80), vec3(.04,.16,.46), (t-.5)*2.);
  float fz = fract(-vZ*2.), dz = min(fz, 1.-fz)/max(fwidth(vZ*2.), 1e-5); bath = mix(bath, vec3(1.), (1. - smoothstep(0., 1.3, dz))*.28);
  vec3 col = mix(vec3(.55,.80,.95), bath, uBathy); float a = 0.07*uWire*(1.-uBathy) + 0.86*uBathy;
  float c = vD*uGain; vec3 dc = mix(warm(c), vec3(.20,.04,.04), contour(c, 8.)*.6); float da = clamp(0.04 + 2.4*abs(c), 0., .95);
  col = mix(col, dc, uShow); a = mix(a, da, uShow);
  o = vec4(col, a); }`;
const FS_WATER = HEAD + COMMON + CONTOUR + `in vec2 vUV; in float vD; out vec4 o; uniform sampler3D uF; uniform float uW, uGain, uA; uniform vec2 uN;
void main(){ vec2 d = 1.5/uN;
  float gx = dec(texture(uF, vec3(vUV+vec2(d.x,0.), uW)).r) - dec(texture(uF, vec3(vUV-vec2(d.x,0.), uW)).r);
  float gy = dec(texture(uF, vec3(vUV+vec2(0.,d.y), uW)).r) - dec(texture(uF, vec3(vUV-vec2(0.,d.y), uW)).r);
  float c = vD*uGain; vec3 base = vec3(.035,.20,.36);
  vec3 col = c > 0. ? mix(base, vec3(.78,.95,1.), clamp(c*1.2, 0., 1.)) : mix(base, vec3(.0,.03,.12), clamp(-c*1.2, 0., 1.));
  float sh = clamp((-gx*.8 - gy*.4)*uGain*5., -1., 1.); col *= 1. + .5*sh; col += vec3(.9,.95,1.)*pow(max(sh,0.),3.)*.3;
  float cl = contour(c, 8.); col = mix(col, c > 0. ? vec3(.05,.25,.45) : vec3(.55,.78,.98), cl*.65);
  float edge = smoothstep(0.,.06,vUV.x)*smoothstep(0.,.03,1.-vUV.x)*smoothstep(0.,.03,vUV.y)*smoothstep(0.,.03,1.-vUV.y);
  o = vec4(col, uA*edge*clamp(.22 + abs(c)*3. + cl, 0., .97)); }`;

function prog(vs, fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error('shader', gl.getShaderInfoLog(sh), s); gl.attachShader(p, sh); }
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error('link', gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}
function vao(p, attrs, index) {
  const v = gl.createVertexArray(); gl.bindVertexArray(v);
  for (const [name, data, size] of attrs) { const loc = gl.getAttribLocation(p.p, name); if (loc < 0) continue; const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); }
  if (index) { const b = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW); }
  gl.bindVertexArray(null); return v;
}
const b64bytes = s => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
async function gunzip(s) { const st = new Blob([b64bytes(s)]).stream().pipeThrough(new DecompressionStream('gzip')); return new Uint8Array(await new Response(st).arrayBuffer()); }
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
const loadImg = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = src; });

/* ---------- resources ---------- */
const P = { globe: prog(VS_SPHERE, FS_GLOBE), inner: prog(VS_SPHERE, FS_INNER), halo: prog(VS_SPHERE, FS_HALO), fault: prog(VS_FAULT, FS_FAULT), sea: prog(VS_GRID, FS_SEAFLOOR), water: prog(VS_GRID, FS_WATER) };
let vadj = [], nv = 0, sphere, sphereN, faultV, faultN, gridVs, gridVw, gridN, texG, texR, texM, M, ready = false;
const ev = {};

function buildSphere() {
  const NA = 96, NB = 192, pos = [], idx = [];
  for (let i = 0; i <= NA; i++) for (let j = 0; j <= NB; j++) pos.push(...ll(-180 + 360 * j / NB, 90 - 180 * i / NA, 1));
  for (let i = 0; i < NA; i++) for (let j = 0; j < NB; j++) { const a = i * (NB + 1) + j, b = a + NB + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  sphereN = idx.length; sphere = {};
  for (const k of ['globe', 'inner', 'halo']) sphere[k] = vao(P[k], [['aP', new Float32Array(pos), 3]], new Uint32Array(idx));
}
function tex2D(img, mip) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mip ? gl.CLAMP_TO_EDGE : gl.REPEAT);
  if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  return t; }
function tex3D(data, w, h, d) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, w, h, d, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, k, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; }

async function loadEvent(id) {
  if (ev[id]) return ev[id];
  await loadScript('assets/data/rup_' + id + '.js?v=2');
  const E = window.RUP.ev[id], [sr, sf, ts] = await Promise.all([gunzip(E.cs), gunzip(E.sf), gunzip(E.ts)]);
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const vt = new Uint8Array(nv * 256);          // per-vertex slip (smooth shading, no triangle steps)
  for (let f = 0; f < 256; f++) for (let v = 0; v < nv; v++) { let a = 0; const ad = vadj[v]; for (const c of ad) { const e = sr[f * 963 + c] / 255; a += e * e; } vt[f * nv + v] = Math.round(255 * Math.sqrt(a / Math.max(1, ad.length))); }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, nv, 256, 0, gl.RED, gl.UNSIGNED_BYTE, vt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  ev[id] = { mw: E.mw, csMax: E.csMax, sfMax: E.sfMax, tsMax: E.tsMax, cs: t, sf: tex3D(sf, M.nx, M.ny, M.nfSf), ts: tex3D(ts, M.nx, M.ny, M.nfTs) };
  E.sr = E.sf = E.ts = E.cs = null; return ev[id];
}
async function init() {
  await loadScript('assets/data/earth_tex.js?v=1'); await loadScript('assets/data/rup_mesh.js?v=1');
  const [ig, ir] = await Promise.all([loadImg(window.EARTH_TEX.global), loadImg(window.EARTH_TEX.region)]);
  texG = tex2D(ig, false); texR = tex2D(ir, true); buildSphere();
  M = window.RUP.mesh;
  const fp = new Float32Array(b64bytes(M.faultPts).buffer), tri = new Uint16Array(b64bytes(M.faultTri).buffer), nt = tri.length / 3;
  const lld = new Float32Array(nt * 9), bar = new Float32Array(nt * 9), cell = new Float32Array(nt * 3);
  for (let t = 0; t < nt; t++) { const pts = [];
    for (let k = 0; k < 3; k++) { const v = tri[t * 3 + k]; lld.set([fp[v * 3], fp[v * 3 + 1], fp[v * 3 + 2]], t * 9 + k * 3); bar[t * 9 + k * 3 + k] = 1; cell[t * 3 + k] = v; pts.push(ll(fp[v * 3], fp[v * 3 + 1], 1 + EX * fp[v * 3 + 2] / RE)); }
  }
  faultN = nt * 3; faultV = vao(P.fault, [['aLLD', lld, 3], ['aB', bar, 3], ['aVid', cell, 1]]);
  nv = fp.length / 3; vadj = Array.from({ length: nv }, () => []); for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) vadj[tri[t * 3 + k]].push(t);
  const G = new Float32Array(b64bytes(M.grid).buffer), uv = new Float32Array(M.ny * M.nx * 2), gi = [];
  for (let i = 0; i < M.ny; i++) for (let j = 0; j < M.nx; j++) { uv[(i * M.nx + j) * 2] = (j + .5) / M.nx; uv[(i * M.nx + j) * 2 + 1] = (i + .5) / M.ny; }
  for (let i = 0; i < M.ny - 1; i++) for (let j = 0; j < M.nx - 1; j++) { const a = i * M.nx + j, b = a + M.nx; gi.push(a, b, a + 1, a + 1, b, b + 1); }
  gridN = gi.length; const gidx = new Uint32Array(gi);
  gridVs = vao(P.sea, [['aLLD', G, 3], ['aUV', uv, 2]], gidx); gridVw = vao(P.water, [['aLLD', G, 3], ['aUV', uv, 2]], gidx);
  { // soft footprint of fault + seafloor meshes: where the surface turns transparent (no box)
    const mc = document.createElement('canvas'); mc.width = 320; mc.height = 448; const c2 = mc.getContext('2d');
    const X = lon => (lon - WIN[0]) / (WIN[2] - WIN[0]) * mc.width, Y = lat => (WIN[3] - lat) / (WIN[3] - WIN[1]) * mc.height;
    c2.fillStyle = '#000'; c2.fillRect(0, 0, mc.width, mc.height); c2.filter = 'blur(7px)'; c2.fillStyle = '#fff'; c2.strokeStyle = '#fff'; c2.lineWidth = 10; c2.lineJoin = 'round';
    c2.beginPath(); for (let i = 0; i < M.ny; i++) { const k = (i * M.nx) * 3; i ? c2.lineTo(X(G[k]), Y(G[k + 1])) : c2.moveTo(X(G[k]), Y(G[k + 1])); }
    for (let i = M.ny - 1; i >= 0; i--) { const k = (i * M.nx + M.nx - 1) * 3; c2.lineTo(X(G[k]), Y(G[k + 1])); } c2.closePath(); c2.fill(); c2.stroke();
    c2.beginPath(); for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const v = tri[t * 3 + k]; k ? c2.lineTo(X(fp[v * 3]), Y(fp[v * 3 + 1])) : c2.moveTo(X(fp[v * 3]), Y(fp[v * 3 + 1])); } c2.fill(); c2.stroke();
    texM = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texM); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mc);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
  await loadEvent(COVER); ready = true;
  loadEvent(EVENTS[0]);
}
init().catch(e => { console.error(e); hud('phase').textContent = 'Could not load the rupture data'; });

/* ---------- animation state ---------- */
// deck steps: 0 zoom in · 1 the fault · 2 seafloor mesh (bathymetry) · 3 slip on the fault · 4 seafloor displacement · 5 tsunami · 6, 7 other magnitudes
// Steps 0-4 advance on their own; pressing → skips ahead.
const DUR_R = 12, DUR_T = 28, TS_LAST = 80, HOLD = 2.5, SP2 = 1.25, CYC = (2 * (DUR_R + HOLD) + DUR_T * .7 + HOLD) / SP2;
const END = [4.8, 7, 6, DUR_R + HOLD, DUR_R + HOLD, DUR_T + HOLD, 1e9];   // every stage ends by itself; the last magnitude keeps looping
const AZ0 = 4.42, AMP = 0.24, SWEEP = 100;                  // camera over the ocean to the south-south-west, looking north along the margin
let tIn = 0, st = 0, tl = 0, fresh = true, curId = EVENTS[0], evFade = 1, tCam = 0, last = performance.now(), lastHud = '';
const A = { open: 0, hi: 0, bathy: 0, wire: 0, slip: 0, dim: 0, show: 0, water: 0, depth: 0, concl: 0 };
const AV = {};
const nice = v => v >= 10 ? Math.round(v / 5) * 5 : v >= 2 ? Math.round(v) : v >= 1 ? Math.round(v * 2) / 2 : Math.round(v * 10) / 10;
const CAP = ['', 'The fault, buried 6 to 30 km deep', 'The seafloor: computational mesh for the tsunami', 'Slip on the fault', 'The slip lifts the seafloor', 'The seafloor lifts the water: tsunami'];
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  const host = cover && cover.classList.contains('active') ? cover : main.classList.contains('active') ? main : null;
  if (!host || !ready) { fresh = true; return; }
  if (slide !== host) { slide = host; host.insertBefore(cv, host.firstChild); fresh = true; lastHud = ''; }
  // Steps 0-5 are the stages of the visualization. From step 6 on the animation loops by itself and the clicks only switch the left panel: 6 summary, 7 more from our group.
  const isC = host === cover, step = isC ? 6 : window.deck ? window.deck.state.step : 0;
  if (fresh) { fresh = false; st = Math.min(step, 6); tl = 0; tIn = step > 0 ? 99 : 0; if (isC) { A.concl = 1; A.open = 1; A.wire = 1; AV.concl = AV.open = AV.wire = 0; } }
  // Skipping ahead never cuts: the current stage fast-forwards to its end, then the next one starts.
  if (step < st) { st = step; tl = 0; }
  const ff = step > st && st < 6, rate = ff ? 8 : 1;
  tl += dt * rate; tIn += dt * rate; tCam += dt;
  if (ff && tl >= END[st]) { st++; tl = 0; }
  else if (!ff && st <= 5 && tl >= END[st] && window.deck && !window.RUP_HOLD) window.deck.next();
  const az = AZ0 + AMP * Math.sin(tCam * 2 * Math.PI / SWEEP);
  const tgt = isC ? COVER : EVENTS[0];
  if (!ev[curId]) { if (!ev[tgt]) return; curId = tgt; }
  if (tgt !== curId) { evFade -= dt * 2.2; if (evFade <= 0) { evFade = 0; if (ev[tgt]) { curId = tgt; tl = 0; } } } else evFade = Math.min(1, evFade + dt * 1.8);
  const id = curId, E = ev[id];
  let vs = st, t2 = tl, sp = 1;                      // visual stage 0..5, local time, speed-up
  if (st > 5) { sp = SP2; const a = (DUR_R + HOLD) / sp, u = tl % CYC; if (u < a) { vs = 3; t2 = u; } else if (u < 2 * a) { vs = 4; t2 = u - a; } else { vs = 5; t2 = u - 2 * a; } }
  
  const run = Math.min(255, t2 * sp / DUR_R * 255);
  const frF = window.RUP_FR != null ? window.RUP_FR : vs < 3 ? 0 : vs === 3 ? run : 255;       // fault frame (s)
  const frS = window.RUP_FR != null ? window.RUP_FR : vs < 4 ? 0 : vs === 4 ? run : 255;       // seafloor frame (s)
  const ft = vs === 5 ? Math.min(TS_LAST, t2 * sp / DUR_T * TS_LAST) : 0;
  // critically damped springs: every transition starts and ends with zero velocity (no jerk when a stage begins)
  const om = 2.5 * (ff ? 3 : 1), ex = Math.exp(-om * dt), to = (n, t) => { const x = A[n] - t, v = AV[n] || 0, c = (v + om * x) * dt; A[n] = t + (x + c) * ex; AV[n] = (v - om * c) * ex; };
  to('depth', vs === 1 ? 1 : 0.3); to('concl', st >= 6 ? 1 : 0);
  to('open', vs >= 1 ? 1 : 0); to('hi', vs === 1 ? 1 : 0); to('bathy', vs === 2 ? 1 : 0); to('wire', vs >= 2 ? 1 : 0);
  to('slip', vs >= 3 ? 1 : 0); to('dim', vs === 2 || vs >= 4 ? 1 : 0); to('show', vs === 4 ? 1 : vs === 5 ? 0.45 : 0); to('water', vs === 5 ? 1 : 0);

  /* camera: zoom in from the whole globe, then a slow pendulum */
  const T = ll(-125.5, 45.6, 0.993), up = norm(T), e0 = norm(cross([0, 1, 0], up)), n0 = cross(up, e0);
  const zi = Math.min(1, tIn / 7.5), zs = zi * zi * zi * (zi * (zi * 6 - 15) + 10), el = (78 - 16 * zs) * D2R, Dc = 0.268 * Math.pow(6.5, 1 - zs);
  const cam = add(T, mul(add(mul(add(mul(e0, Math.cos(az)), mul(n0, Math.sin(az))), Math.cos(el)), mul(up, Math.sin(el))), Dc));
  const PR = persp(33 * D2R, cv.width / cv.height, 0.01, 4); PR[8] = -0.5 * A.concl;      // conclusions on the left: the scene moves to the right half
  const VP = mmul(PR, lookAt(cam, T, up));
  const sun = norm(add(mul(up, 0.8), add(mul(e0, 0.45), mul(n0, -0.35))));

  gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0.012, 0.02, 0.035, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  const use = (p, v) => { gl.useProgram(p.p); gl.bindVertexArray(v); gl.uniformMatrix4fv(p.u.uVP, false, VP); return p.u; };
  let u; const csC = nice(E.csMax * 0.8), sfC = nice(E.sfMax * 0.6), tsC = nice(E.tsMax * 0.6);
  u = use(P.inner, sphere.inner); gl.uniform1f(u.uR, 0.958); gl.drawElements(gl.TRIANGLES, sphereN, gl.UNSIGNED_INT, 0);
  // fault: cumulative slip
  gl.disable(gl.CULL_FACE);
  u = use(P.fault, faultV); gl.uniform1f(u.uEX, EX); gl.uniform1f(u.uFrame, frF); gl.uniform1f(u.uGain, evFade * A.slip * E.csMax / csC); gl.uniform1f(u.uDepth, A.depth);
  gl.uniform1f(u.uHi, A.hi * (0.7 + 0.3 * Math.sin(now / 400))); gl.uniform1f(u.uDim, A.dim);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, E.cs); gl.uniform1i(u.uSR, 0); gl.drawArrays(gl.TRIANGLES, 0, faultN);
  // seafloor mesh: bathymetry, then vertical displacement
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  u = use(P.sea, gridVs); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, E.sf); gl.uniform1i(u.uF, 0);
  gl.uniform1f(u.uW, (Math.min(frS / 2, M.nfSf - 1) + .5) / M.nfSf); gl.uniform1f(u.uEX, EX); gl.uniform1f(u.uUseDepth, 1); gl.uniform1f(u.uLift, 0);
  gl.uniform1f(u.uWarp, 0.0085 * Math.min(1, A.show * 1.5)); gl.uniform1f(u.uShow, A.show * evFade); gl.uniform1f(u.uBathy, A.bathy); gl.uniform1f(u.uWire, A.wire);
  gl.uniform1f(u.uGain, E.sfMax / sfC); gl.uniform2f(u.uN, M.nx, M.ny);
  gl.drawElements(gl.TRIANGLES, gridN, gl.UNSIGNED_INT, 0);
  // globe: opaque at first, transparent above the meshes afterwards
  gl.depthMask(true); gl.enable(gl.CULL_FACE);
  const winA = (1 - 0.80 * A.open) * (1 - A.water) + 0.72 * A.water;
  u = use(P.globe, sphere.globe); gl.uniform1f(u.uR, 1); gl.uniform4f(u.uBox, ...window.EARTH_TEX.box); gl.uniform4f(u.uWin, ...WIN); gl.uniform3fv(u.uCam, cam); gl.uniform3fv(u.uSun, sun); gl.uniform1f(u.uWinA, winA);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texG); gl.uniform1i(u.uGlobal, 0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texR); gl.uniform1i(u.uRegion, 1); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texM); gl.uniform1i(u.uMask, 2);
  gl.drawElements(gl.TRIANGLES, sphereN, gl.UNSIGNED_INT, 0);
  if (A.water > 0.01) { gl.disable(gl.CULL_FACE); gl.depthMask(false);
    u = use(P.water, gridVw); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, E.ts); gl.uniform1i(u.uF, 0);
    gl.uniform1f(u.uW, (ft + .5) / M.nfTs); gl.uniform1f(u.uUseDepth, 0); gl.uniform1f(u.uEX, EX); gl.uniform1f(u.uLift, 0.0008); gl.uniform1f(u.uWarp, 0.011 * A.water);
    gl.uniform1f(u.uGain, E.tsMax / tsC); gl.uniform1f(u.uA, A.water * evFade); gl.uniform2f(u.uN, M.nx, M.ny);
    gl.drawElements(gl.TRIANGLES, gridN, gl.UNSIGNED_INT, 0); }
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
  u = use(P.halo, sphere.halo); gl.uniform1f(u.uR, 1.028); gl.uniform3fv(u.uCam, cam); gl.drawElements(gl.TRIANGLES, sphereN, gl.UNSIGNED_INT, 0);
  gl.cullFace(gl.BACK); gl.depthMask(true); gl.bindVertexArray(null);

  /* HUD: one caption, one clock, one colour bar */
  const clock = vs === 3 ? Math.round(frF) + ' s' : vs === 4 ? Math.round(frS) + ' s' : vs === 5 ? (ft * M.tsDt / 60).toFixed(1) + ' min' : '';
  const key = id + vs + clock + st;
  if (key !== lastHud) { lastHud = key;
    put('clock', clock ? 'time  ' + clock : '');
    put('title', 'Potential magnitude ' + E.mw.toFixed(1) + ' earthquake at the Cascadia Subduction Zone');
    put('phase', CAP[vs]); put('tag', 'Potential magnitude ' + E.mw.toFixed(1) + ' earthquake\nat the Cascadia Subduction Zone' + (clock ? '\ntime  ' + clock : '')); slide.dataset.concl = st >= 6 ? 1 : 0;
    slide.dataset.cb = ['', 'dp', '', 'cs', 'sf', 'ts'][vs]; slide.dataset.phase = vs;
    const [lab, hi, mid, lo] = vs === 3 ? ['Slip (m)', csC, csC / 2, 0] : vs === 4 ? ['Vertical seafloor\ndisplacement (m)', '+' + sfC, 0, '−' + sfC] : vs === 5 ? ['Wave height (m)', '+' + tsC, 0, '−' + tsC] : vs === 1 ? ['Depth (km)', 6, 18, 30] : ['', '', '', ''];
    if (lab) { put('cbl', lab); put('cb2', hi); put('cb1', mid); put('cb0', lo); } }
}
requestAnimationFrame(frame);
})();

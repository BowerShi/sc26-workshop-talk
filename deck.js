/* SC26 workshop deck engine + scenes. No dependencies; runs offline from file://. */
(() => {
const $ = (q, el = document) => el.querySelector(q), $$ = (q, el = document) => [...el.querySelectorAll(q)];
const stage = $('#stage'), slides = $$('.slide');
const TAU = Math.PI * 2, clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t;
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const C = { bo: '#BF5700', bo2: '#F8971F', char: '#333F48', teal: '#00A9B7', blue: '#005F86', lime: '#D6D2C4', mute: '#6b7780', paper: '#FBFAF6' };
const SANS = '"Helvetica Neue",Helvetica,Arial,sans-serif', MATH = '"LMR","Latin Modern Roman","Times New Roman",serif', SERIF = '"Charter","Iowan Old Style",Palatino,Georgia,serif';
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

/* ───────── deck state ───────── */
let cur = 0, step = 0, tSlide = 0, tStep = 0, t0 = null, notesOn = false, pres = null, numBuf = '';
const maxStep = s => +s.dataset.steps || 0;

slides.forEach((s, i) => {
  const f = document.createElement('div'); f.className = 'foot';
  const logo = s.classList.contains('light') ? '<img src="assets/UTA_logo.svg" alt="">' : '<span></span>';
  f.innerHTML = s.classList.contains('title') ? '' : `${logo}<span class="cite">${s.dataset.cite || ''}</span><span class="pg">${i + 1} / ${slides.length}</span>`;
  s.appendChild(f);
  $$('canvas[data-scene]', s).forEach(c => { c.width = c.dataset.w * 2; c.height = c.dataset.h * 2; c.style.width = c.dataset.w + 'px'; c.style.height = c.dataset.h + 'px'; });
});

function fit() { stage.style.transform = `translate(-50%,-50%) scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`; }
addEventListener('resize', fit); fit();

function apply() {
  slides.forEach((s, i) => s.classList.toggle('active', i === cur));
  const s = slides[cur];
  for (let k = 0; k < 8; k++) s.classList.toggle('s' + k, step >= k);
  s.classList.toggle('last', step >= maxStep(s));
  $$('.st', s).forEach(e => e.classList.toggle('on', step >= +e.dataset.s));
  $$('[data-c]', s).forEach(e => { const c = +e.dataset.c; e.classList.toggle('cur', step === c); e.classList.toggle('seen', step > c); });
  $$('video').forEach(v => {
    const host = v.closest('.slide'), st = v.closest('.st');
    const vis = host === s && (!st || st.classList.contains('on'));
    if (vis) { if (v.paused) { v.currentTime = 0; v.play().catch(() => {}); } } else v.pause();
  });
  $('#progress i').style.width = (100 * (cur + step / (maxStep(s) + 1)) / (slides.length - 1)) + '%';
  history.replaceState(null, '', '#' + (cur + 1));
  renderNotes();
}
function go(i, st = 0) {
  i = clamp(i, 0, slides.length - 1);
  if (i !== cur) { cur = i; tSlide = performance.now(); Object.values(scenes).forEach(sc => sc.reset && sc.reset()); }
  step = clamp(st, 0, maxStep(slides[cur])); tStep = performance.now(); apply();
}
function next() { if (t0 === null) t0 = Date.now(); if (step < maxStep(slides[cur])) { step++; tStep = performance.now(); apply(); } else if (cur < slides.length - 1) go(cur + 1, 0); }
function prev() { if (step > 0) { step--; tStep = performance.now(); apply(); } else if (cur > 0) go(cur - 1, maxStep(slides[cur - 1])); }

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (/^[0-9]$/.test(k)) { numBuf += k; return; }
  if (k === 'Enter' && numBuf) { go(+numBuf - 1); numBuf = ''; return; }
  numBuf = '';
  if (['ArrowRight', ' ', 'PageDown', 'ArrowDown', 'Enter'].includes(k)) { e.preventDefault(); next(); }
  else if (['ArrowLeft', 'PageUp', 'ArrowUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
  else if (k === 'Home') go(0); else if (k === 'End') go(slides.length - 1);
  else if (k === 'f' || k === 'F') (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  else if (k === 'n' || k === 'N') { notesOn = !notesOn; $('#notes').hidden = !notesOn; }
  else if (k === 'p' || k === 'P') openPresenter();
  else if (k === 'r' || k === 'R') t0 = Date.now();
  else if (k === '?' || k === 'h') $('#help').hidden = !$('#help').hidden;
}
addEventListener('keydown', onKey);

/* ───────── notes / presenter ───────── */
const fmt = ms => { const s = Math.max(0, ms / 1000 | 0); return String(s / 60 | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
function renderNotes() {
  const s = slides[cur], n = $('aside.notes', s), head = `${cur + 1} / ${slides.length} · ${s.dataset.title || ''} · target ${s.dataset.time || ''} · step ${step}/${maxStep(s)}`;
  $('#nslide').textContent = head; $('#ntext').innerHTML = n ? n.innerHTML : '';
  if (pres && !pres.closed) {
    const d = pres.document; d.getElementById('h').textContent = head; d.getElementById('n').innerHTML = n ? n.innerHTML : '';
    d.getElementById('nx').textContent = slides[cur + 1] ? 'Next: ' + slides[cur + 1].dataset.title : 'End';
  }
}
function openPresenter() {
  pres = window.open('', 'sc26presenter', 'width=900,height=700'); if (!pres) return;
  pres.document.write(`<title>Presenter notes</title><body style="margin:0;background:#10181d;color:#eef2f4;font:26px/1.5 'Avenir Next',Helvetica,sans-serif;padding:26px 34px">
  <div style="display:flex;justify-content:space-between;color:#ffb370;font-weight:700;font-size:20px"><span id="h"></span><span id="tm" style="font-size:44px;font-variant-numeric:tabular-nums">00:00</span></div>
  <div id="n" style="margin-top:18px"></div><div id="nx" style="margin-top:26px;color:#8fa2ad;font-size:20px"></div>
  <style>b{color:#ffb370}</style></body>`);
  pres.document.close(); pres.addEventListener('keydown', onKey); renderNotes();
}
setInterval(() => { const s = t0 === null ? '00:00' : fmt(Date.now() - t0); $('#ntimer').textContent = s; if (pres && !pres.closed) pres.document.getElementById('tm').textContent = s; }, 500);

/* ───────── scenes ───────── */
const scenes = {};
if (document.fonts) { document.fonts.load('700 40px LMR'); document.fonts.load('italic 24px LMR'); }
// single letters are math symbols: Latin Modern, bold upright for vectors/matrices, italic for small subscripts
const text = (g, s, x, y, o = {}) => { const sym = /^[A-Za-zΣ]$/.test(s); g.font = sym ? `${(o.size || 24) <= 28 && !o.up ? 'italic 500' : (o.w || 700)} ${Math.round((o.size || 24) * 1.12)}px ${MATH}` : `${o.w || 500} ${o.size || 24}px ${o.serif ? SERIF : SANS}`; g.fillStyle = o.col || '#fff'; g.textAlign = o.al || 'left'; g.textBaseline = o.base || 'alphabetic'; g.globalAlpha = (o.a ?? 1) * (g._ga ?? 1); g.fillText(s, x, y); g.globalAlpha = g._ga ?? 1; };
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
const smooth = (obj, tgt, k) => { for (const p in tgt) { const v = tgt[p]; if (Array.isArray(v)) obj[p] = obj[p] ? obj[p].map((o, i) => o + (v[i] - o) * k) : v.slice(); else obj[p] = obj[p] === undefined ? v : obj[p] + (v - obj[p]) * k; } };

/* title background: drifting wave lines */
scenes.waves = { draw(g, W, H, t) {
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0b1820'); bg.addColorStop(1, '#1a2a33'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 16; i++) {
    const y0 = 520 + i * 38, a = 14 + i * 2.6; g.beginPath();
    for (let x = 0; x <= W; x += 12) { const y = y0 + a * Math.sin(x * 0.0042 + t * (0.35 + i * 0.02) + i * 0.7) + a * 0.5 * Math.sin(x * 0.011 - t * 0.5 + i); x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = i % 4 === 0 ? `rgba(248,151,31,${0.10 + i * 0.022})` : `rgba(0,169,183,${0.05 + i * 0.012})`; g.lineWidth = i % 4 === 0 ? 2.5 : 1.5; g.stroke();
  }
  const v = g.createLinearGradient(0, 0, W * 0.75, 0); v.addColorStop(0, 'rgba(11,24,32,.86)'); v.addColorStop(1, 'rgba(11,24,32,0)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
} };

/* cross-section: locked → rupture (rigid upper plate slides up the fault) → acoustic waves → tsunami */
scenes.xsec = (() => {
  const SURF = 440, TR = 480, TY = 740, CO = 1430, TH = 0.3, LEN = Math.hypot(1, TH), SMAX = 72;
  const iface = x => TY + (x - TR) * TH;
  const oce = x => TY - (TR - x) * 0.05;
  const wtop = x => x < CO ? TY - (TY - SURF) * Math.pow(clamp((x - TR) / (CO - TR)), 0.7) : SURF - 60 * ease((x - CO) / 330);
  const gs = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  const sens = [700, 860, 1020, 1180];
  const arrow = (g, x0, y0, x1, y1, col, lw = 6, hd = 20) => { const an = Math.atan2(y1 - y0, x1 - x0); g.strokeStyle = g.fillStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - hd * 0.7 * Math.cos(an), y1 - hd * 0.7 * Math.sin(an)); g.stroke(); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - hd * Math.cos(an - 0.45), y1 - hd * Math.sin(an - 0.45)); g.lineTo(x1 - hd * Math.cos(an + 0.45), y1 - hd * Math.sin(an + 0.45)); g.closePath(); g.fill(); };
  const town = (g, lit) => {
    const B = [[1500, 26, 34, 'h'], [1548, 30, 40, 'h'], [1610, 34, 86, 'b'], [1656, 40, 122, 'b'], [1708, 34, 70, 'b'], [1760, 30, 38, 'h'], [1812, 44, 100, 'b'], [1868, 30, 36, 'h']];
    B.forEach(([x, w, h, k]) => { const y = wtop(x + w / 2) + 3; g.fillStyle = k === 'b' ? '#dfe3e6' : '#efe6d2'; g.fillRect(x, y - h, w, h);
      if (k === 'h') { g.fillStyle = '#BF5700'; g.beginPath(); g.moveTo(x - 5, y - h); g.lineTo(x + w / 2, y - h - 18); g.lineTo(x + w + 5, y - h); g.closePath(); g.fill(); }
      else { g.fillStyle = lit ? '#ffd27a' : '#6c7a85'; for (let yy = y - h + 9; yy < y - 12; yy += 16) for (let xx = x + 6; xx < x + w - 8; xx += 12) g.fillRect(xx, yy, 6, 8); } });
    const lx = 1462, ly = wtop(lx) + 2; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(lx - 9, ly); g.lineTo(lx - 5, ly - 58); g.lineTo(lx + 5, ly - 58); g.lineTo(lx + 9, ly); g.closePath(); g.fill(); g.fillStyle = '#BF5700'; g.fillRect(lx - 7, ly - 40, 14, 10); g.fillStyle = '#FFD600'; g.fillRect(lx - 6, ly - 68, 12, 10);
  };
  return { draw(g, W, H, t, step, ts) {
    const S = step === 0 ? 0 : step === 1 ? SMAX * ease((ts - 0.3) / 1.2) : SMAX, k = S / SMAX, dx = -S / LEN, dy = -S * TH / LEN;
    const fl = x => x > TR + dx ? Math.min(oce(x), wtop(x - dx) + dy) : oce(x);
    const xc = 900 + dx;
    let eta = x => 0;
    if (step === 1 || step === 2) eta = x => 50 * k * gs(x, xc, 270) * (1 + (step === 2 ? 0.06 * Math.sin(ts * 2.2) : 0));
    if (step === 3) { const tl = ts % 11.5, run = Math.min(78 * tl, 520), q = run / 520, land = Math.max(0, tl - 6.7), fade = tl > 9.5 ? 1 - (tl - 9.5) / 2 : 1;
      eta = x => fade * (24 * gs(x, xc - 115 * tl, 210) + (26 + 44 * q) * Math.exp(-land * 0.5) * gs(x, xc + run, 200 - 110 * q) + 14 * Math.min(1, land) * Math.exp(-land * 0.4) * gs(x, CO + dx, 260)); }
    g.save();
    if (step === 1 && ts > 0.3 && ts < 1.9) { const a = 1 - (ts - 0.3) / 1.6; g.translate(Math.sin(ts * 70) * 5 * a, Math.cos(ts * 53) * 4 * a); }
    // sky + mantle
    const sky = g.createLinearGradient(0, 0, 0, SURF); sky.addColorStop(0, '#0a1620'); sky.addColorStop(1, '#1a3445'); g.fillStyle = sky; g.fillRect(-20, -20, W + 40, H + 40);
    const mg = g.createLinearGradient(0, 700, 0, H); mg.addColorStop(0, '#3a2018'); mg.addColorStop(1, '#1d100c'); g.fillStyle = mg; g.fillRect(-20, 640, W + 40, H);
    // water
    g.beginPath(); const xe = CO + dx + 140;
    for (let x = -20; x <= xe; x += 6) { const yb = fl(x), ys = SURF - eta(x) + 1.6 * Math.sin(x * 0.03 + t * 1.6); x === -20 ? g.moveTo(x, Math.min(ys, yb)) : g.lineTo(x, Math.min(ys, yb)); }
    for (let x = xe; x >= -20; x -= 6) g.lineTo(x, fl(x));
    const wg = g.createLinearGradient(0, SURF, 0, 740); wg.addColorStop(0, '#3393b4'); wg.addColorStop(1, '#0c3d58'); g.fillStyle = wg; g.fill();
    // acoustic waves in the water
    const ac = step === 2 ? ease(ts / 0.8) : step === 3 ? Math.max(0, 1 - ts / 3.5) : 0;
    if (ac > 0) { g.save(); g.globalAlpha = ac; g.beginPath(); g.moveTo(-20, SURF - 60); g.lineTo(xe, SURF - 60); for (let x = xe; x >= -20; x -= 12) g.lineTo(x, fl(x)); g.closePath(); g.clip();
      for (const cx of [xc - 150, xc + 150]) for (let n = 0; n < 6; n++) { const r = (t * 260 + n * 100) % 600; g.strokeStyle = `rgba(200,244,255,${0.8 * (1 - r / 600)})`; g.lineWidth = 4; g.beginPath(); g.arc(cx, fl(cx), r, 0, TAU); g.stroke(); }
      g.restore(); }
    // down-going plate (rigid slab)
    const TK = 190;
    g.beginPath(); g.moveTo(-20, oce(-20)); g.lineTo(TR, TY); g.lineTo(W + 20, iface(W + 20)); g.lineTo(W + 20, iface(W + 20) + TK * LEN); g.lineTo(TR - 40, TY + TK); g.lineTo(-20, oce(-20) + TK); g.closePath();
    const og = g.createLinearGradient(0, 700, 0, 1080); og.addColorStop(0, '#56636c'); og.addColorStop(1, '#333d44'); g.fillStyle = og; g.fill();
    if (step === 0) { for (let i = 0; i < 10; i++) { const x = ((t * 34 + i * 190) % 1900) - 20, onSlope = x > TR, y = (onSlope ? iface(x) : oce(x)) + 96, ang = onSlope ? Math.atan(TH) : Math.atan(0.05);
        g.save(); g.translate(x, y); g.rotate(ang); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(-14, -13); g.lineTo(6, 0); g.lineTo(-14, 13); g.stroke(); g.restore(); } }
    // upper plate: rigid wedge, translated along the fault by the slip
    g.save(); g.translate(dx, dy);
    g.beginPath(); g.moveTo(TR, TY); for (let x = TR; x <= W + 200; x += 8) g.lineTo(x, wtop(x)); g.lineTo(W + 200, iface(W + 200)); g.closePath();
    const cg = g.createLinearGradient(0, 400, 0, 1000); cg.addColorStop(0, '#9c8a69'); cg.addColorStop(1, '#5b503d'); g.fillStyle = cg; g.fill();
    g.save(); g.clip(); g.strokeStyle = 'rgba(0,0,0,.10)'; g.lineWidth = 3; for (let o = 60; o < 620; o += 70) { g.beginPath(); g.moveTo(TR, TY - o * 0.0); for (let x = TR; x <= W + 200; x += 40) g.lineTo(x, iface(x) - o * (0.4 + 0.6 * clamp((x - TR) / 900))); g.stroke(); } g.restore();
    // cable + sensors + town ride with the plate
    g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 2.5; g.beginPath(); for (let x = sens[0]; x <= CO + 20; x += 10) { const y = wtop(x) - 3; x === sens[0] ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
    sens.forEach((x, i) => { const y = wtop(x), on = ac * (0.5 + 0.5 * Math.sin(t * 9 - i * 1.4));
      if (on > 0) { g.fillStyle = `rgba(255,214,0,${0.35 * on})`; g.beginPath(); g.arc(x, y - 10, 34, 0, TAU); g.fill(); }
      g.fillStyle = step >= 2 ? '#FFD600' : '#e6edf0'; g.beginPath(); g.arc(x, y - 4, 15, Math.PI, 0); g.closePath(); g.fill(); g.fillRect(x - 19, y - 5, 38, 7); });
    town(g, step === 3);
    g.restore();
    // fault interface
    const L0 = 600, L1 = 1300, hx = 1060; g.lineCap = 'round';
    if (step === 0) { const p = (t * 0.22) % 1; g.shadowColor = C.bo2; g.shadowBlur = 10 + 40 * p; g.strokeStyle = C.bo2; g.lineWidth = 8; g.beginPath(); g.moveTo(L0, iface(L0)); g.lineTo(L1, iface(L1)); g.stroke(); g.shadowBlur = 0;
      g.strokeStyle = '#fff'; g.lineWidth = 4; for (let x = L0 + 20; x < L1; x += 44) { g.beginPath(); g.moveTo(x - 8 * TH - 0, iface(x) - 14); g.lineTo(x + 8 * TH, iface(x) + 14); g.stroke(); } }
    else { const d = step === 1 ? Math.max(0, ts - 0.2) * 420 : 1e4, a = clamp(hx - d, L0, hx), b = clamp(hx + d, hx, L1);
      g.shadowColor = '#ffb04a'; g.shadowBlur = step === 1 ? 44 : 8; g.strokeStyle = step === 1 ? '#ffd49a' : 'rgba(248,151,31,.6)'; g.lineWidth = step === 1 ? 12 : 5; g.beginPath(); g.moveTo(a, iface(a)); g.lineTo(b, iface(b)); g.stroke(); g.shadowBlur = 0;
      if (step === 1) { for (let n = 0; n < 4; n++) { const r = (ts - 0.2) * 460 - n * 120; if (r > 0 && r < 1000) { g.strokeStyle = `rgba(255,210,160,${0.5 * (1 - r / 1000)})`; g.lineWidth = 4; g.beginPath(); g.arc(hx, iface(hx), r, 0, TAU); g.stroke(); } }
        const ux = 1 / LEN, uy = TH / LEN, mx = 840, my = iface(mx); arrow(g, mx + 70 * ux, my + 70 * uy - 34, mx - 70 * ux, my - 70 * uy - 34, '#fff', 7, 24); arrow(g, mx - 70 * ux, my - 70 * uy + 34, mx + 70 * ux, my + 70 * uy + 34, '#fff', 7, 24); } }
    // labels
    text(g, 'Juan de Fuca plate', 70, 960, { size: 40, w: 600, col: 'rgba(255,255,255,.82)' });
    text(g, 'North American plate', 1310 + dx, 640 + dy, { size: 40, w: 600, col: 'rgba(255,255,255,.9)' });
    text(g, 'Pacific Ocean', 70, 540, { size: 40, w: 600, col: 'rgba(255,255,255,.8)' });
    if (step === 0) { arrow(g, 120, 850, 330, 861, '#fff', 8, 28); text(g, 'fault locked by friction', 930, iface(930) - 64, { size: 38, w: 700, col: '#ffb866', a: ease(ts / 0.9) }); }
    if (step === 1) { const a = ease((ts - 0.9) / 0.8); g._ga = a; arrow(g, xc, SURF - 40, xc, SURF - 130, '#fff', 8, 28); text(g, 'seafloor and water lifted', xc + 34, SURF - 84, { size: 38, w: 700, col: '#fff' }); text(g, 'fault slip', 900, iface(900) + 110, { size: 38, w: 700, col: '#ffb866' }); g._ga = 1; }
    if (step === 2) { g._ga = ease(ts / 0.9); text(g, 'pressure (acoustic) waves:  1.5 km/s', 250, 380, { size: 40, w: 700, col: '#c8f4ff' }); text(g, 'pressure sensors', sens[1] + dx - 30, wtop(sens[1]) + dy + 78, { size: 36, w: 700, col: '#FFD600' }); g._ga = 1; }
    if (step === 3) text(g, 'tsunami:  about 0.2 km/s', 250, 380, { size: 40, w: 700, col: '#c8f4ff', a: ease(ts / 0.9) });
    g.restore();
    const top = g.createLinearGradient(0, 0, 0, 250); top.addColorStop(0, 'rgba(10,22,32,.96)'); top.addColorStop(1, 'rgba(10,22,32,0)'); g.fillStyle = top; g.fillRect(0, 0, W, 250);
  } };
})();

/* q = F_q D_t F_G s as shapes: wide x tall x small vector.
   step 0: block Toeplitz (N_t blocks) · step 1: zero-pad + FFT -> block diagonal with 2 N_t blocks (twice as large) · step 2: how each operator is built */
scenes.shapes = (() => {
  const pal = [C.bo, C.bo2, C.teal].map(hex), empty = hex('#ebe6d8'), a = 26, B = 88, gp = 6, cy = 322, N = 6, v = {};
  return { reset() { delete v.d; delete v.b; }, draw(g, W, H, t, step, ts, dt) {
    g.clearRect(0, 0, W, H); const k = 1 - Math.exp(-dt * 3.2); smooth(v, { d: step >= 1 ? 1 : 0, b: step >= 2 ? 1 : 0 }, k); const d = v.d, bl = v.b, n = 3 + 3 * d, ph = (t * 0.5) % 1;
    const ext = bw => n * (bw + gp) - gp, hS = ext(a), hB = ext(B);
    const cFq = 509, cFG = 951, xq = 100, xs = 1100;
    const cellCol = (i, j) => rgb(mix(i >= j && i - j < 3 ? pal[i - j] : empty, i === j ? mix(hex(C.teal), hex(C.char), i / 5) : empty, d));
    const mat = (cx, bw, bh, tall) => { const x0 = cx - ext(bw) / 2, y0 = cy - ext(bh) / 2;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const al = i < 3 && j < 3 ? 1 : d; if (al < 0.02) continue; const x = x0 + j * (bw + gp), y = y0 + i * (bh + gp);
        g.globalAlpha = al; g.fillStyle = cellCol(i, j); rr(g, x, y, bw, bh, 5); g.fill();
        if (bl > 0.02 && i === j) { g.save(); rr(g, x, y, bw, bh, 5); g.clip(); g.fillStyle = `rgba(255,255,255,${0.9 * bl})`; if (tall) g.fillRect(x + ph * bw - 2.5, y, 5, bh); else g.fillRect(x, y + ph * bh - 2.5, bw, 5); g.restore(); } }
      g.globalAlpha = 1; };
    const vec = (x0, c) => { const y0 = cy - hS / 2; for (let i = 0; i < N; i++) { const al = i < 3 ? 1 : d; if (al < 0.02) continue; g.globalAlpha = al; g.fillStyle = c; rr(g, x0, y0 + i * (a + gp), a, a, 5); g.fill(); } g.globalAlpha = 1; };
    vec(xq, C.teal); text(g, '=', xq + 78, cy + 16, { size: 52, w: 700, col: C.char, al: 'center' });
    mat(cFq, B, a, false); mat(cFG, a, B, true); vec(xs, C.bo);
    // symbols
    text(g, 'q', xq + a / 2, cy - hS / 2 - 22, { size: 46, col: C.char, al: 'center' }); text(g, 's', xs + a / 2, cy - hS / 2 - 22, { size: 46, col: C.char, al: 'center' });
    text(g, 'F', cFq - 10, cy - hS / 2 - 24, { size: 50, col: '#00808c', al: 'center' }); text(g, 'q', cFq + 20, cy - hS / 2 - 12, { size: 28, col: '#00808c', al: 'center' });
    text(g, 'F', cFG - 10, cy - hB / 2 - 20, { size: 50, col: C.bo, al: 'center' }); text(g, 'G', cFG + 22, cy - hB / 2 - 8, { size: 28, col: C.bo, al: 'center' });
    // which direction is what
    const dim = (x0, y0, x1, y1, lab, col) => { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); const vert = x0 === x1;
      for (const [px, py] of [[x0, y0], [x1, y1]]) { g.beginPath(); if (vert) { g.moveTo(px - 9, py); g.lineTo(px + 9, py); } else { g.moveTo(px, py - 9); g.lineTo(px, py + 9); } g.stroke(); }
      g.save(); g.translate((x0 + x1) / 2, (y0 + y1) / 2); if (vert) { g.rotate(-Math.PI / 2); text(g, lab, 0, -14, { size: 28, w: 600, col, al: 'center' }); } else text(g, lab, 0, 38, { size: 28, w: 600, col, al: 'center' }); g.restore(); };
    dim(cFG - hS / 2 - 22, cy - hB / 2, cFG - hS / 2 - 22, cy + hB / 2, 'seafloor: 2.4 million', C.char);
    dim(cFq - hB / 2, cy + hS / 2 + 20, cFq + hB / 2, cy + hS / 2 + 20, 'seafloor: 2.4 million', C.char);
    text(g, '64 waveforms', xq + a / 2, cy + hS / 2 + 48, { size: 28, w: 600, col: '#00808c', al: 'center' });
    text(g, '963 fault patches', xs + a / 2 + 70, cy + hS / 2 + 48, { size: 28, w: 600, col: C.bo, al: 'center' });

    const tx = 1235, cur = step >= 2 ? 2 : step >= 1 ? 1 : 0;
    const cap = ['Block Toeplitz in time', 'Zero-pad, then FFT in time', 'Built once, from the small side'], cap2 = ['Nₜ blocks, same color = same block', 'block diagonal, 2Nₜ blocks', 'tall: forward solves, wide: adjoint solves'];
    const ty = cy - 150; text(g, cap[cur], tx, ty, { size: 32, w: 700, col: C.char }); if (cur < 2) text(g, cap2[cur], tx, ty + 50, { size: 30, col: C.mute });
    g._ga = bl; text(g, 'tall: 963 forward solves,', tx, ty + 54, { size: 30, w: 700, col: C.bo }); text(g, 'one column each', tx, ty + 94, { size: 30, col: C.bo }); text(g, 'wide: 64 adjoint solves,', tx, ty + 150, { size: 30, w: 700, col: '#00808c' }); text(g, 'one row each', tx, ty + 190, { size: 30, col: '#00808c' }); g._ga = 1;
  } };
})();

/* operator filling: columns (forward) vs rows (adjoint) */
scenes.fillG = { draw(g, W, H, t) {
  g.clearRect(0, 0, W, H); const x = 80, y = 16, w = 150, h = 360, nc = 10, cw = w / nc, ph = (t * 1.6) % (nc + 2), full = ph | 0, fr = ph - full;
  g.fillStyle = '#efeadb'; rr(g, x, y, w, h, 8); g.fill();
  for (let c = 0; c < nc; c++) { const f = c < full ? 1 : c === full ? fr : 0; if (f > 0) { g.fillStyle = c === full ? C.bo2 : C.bo; g.fillRect(x + c * cw + 1.5, y, cw - 3, h * f); } }
  g.strokeStyle = C.char; g.lineWidth = 2.5; rr(g, x, y, w, h, 8); g.stroke();
  text(g, '963 columns', x + w / 2, y + h + 38, { size: 28, w: 600, col: C.char, al: 'center' });
  g.save(); g.translate(x - 22, y + h / 2); g.rotate(-Math.PI / 2); text(g, '2.4 M rows', 0, 0, { size: 26, col: C.mute, al: 'center' }); g.restore();
} };
scenes.fillQ = { draw(g, W, H, t) {
  g.clearRect(0, 0, W, H); const x = 14, y = 130, w = 272, h = 120, nr = 6, rh = h / nr, ph = (t * 1.2) % (nr + 2), full = ph | 0, fr = ph - full;
  g.fillStyle = '#e4f3f5'; rr(g, x, y, w, h, 8); g.fill();
  for (let r = 0; r < nr; r++) { const f = r < full ? 1 : r === full ? fr : 0; if (f > 0) { g.fillStyle = r === full ? '#55cdd6' : C.teal; g.fillRect(x, y + r * rh + 1.5, w * f, rh - 3); } }
  g.strokeStyle = C.char; g.lineWidth = 2.5; rr(g, x, y, w, h, 8); g.stroke();
  text(g, '2.4 M columns', x + w / 2, y + h + 38, { size: 26, col: C.mute, al: 'center' });
  text(g, '64 rows', x + w / 2, y - 16, { size: 28, w: 600, col: C.char, al: 'center' });
} };

/* Subduction-zone earthquake cycle, after the USGS three-panel figure:
   0 overall (plate descends) · 1 between earthquakes (stuck: edge dragged down, bulge behind) · 2 during an earthquake (edge springs free: uplift, subsidence, tsunami) */
scenes.subd = (() => {
  const SEA = 190, TX = 500, TY = 390, DIP = 0.26, COAST = 1040, D = 40, U = 24, SQ = 30;
  const iface = x => x < TX ? TY - (TX - x) * 0.04 : TY + (x - TX) * DIP + 0.00006 * (x - TX) ** 2;
  const top0 = x => x < COAST ? TY - (TY - SEA) * Math.pow(clamp((x - TX) / (COAST - TX)), 0.78) : SEA - 30 * ease((x - COAST) / 260);
  const g1 = x => Math.exp(-(((x - 690) / 175) ** 2)), g2 = x => Math.exp(-(((x - 1170) / 210) ** 2));
  const gs = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  const back = x => { x = clamp(x); const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };   // overshoot, then settle
  const barrow = (g, x0, y0, x1, y1, w = 16) => { const an = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0), h = Math.min(L * 0.5, w * 1.5); g.save(); g.translate(x0, y0); g.rotate(an);
    g.beginPath(); g.moveTo(0, -w / 2); g.lineTo(L - h, -w / 2); g.lineTo(L - h, -w); g.lineTo(L, 0); g.lineTo(L - h, w); g.lineTo(L - h, w / 2); g.lineTo(0, w / 2); g.closePath(); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#6b665f'; g.lineWidth = 2.5; g.stroke(); g.restore(); };
  const arrow = (g, x0, y0, x1, y1, col) => { const an = Math.atan2(y1 - y0, x1 - x0); g.strokeStyle = g.fillStyle = col; g.lineWidth = 4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - 18 * Math.cos(an - 0.4), y1 - 18 * Math.sin(an - 0.4)); g.lineTo(x1 - 18 * Math.cos(an + 0.4), y1 - 18 * Math.sin(an + 0.4)); g.closePath(); g.fill(); };
  const lead = (g, x0, y0, x1, y1) => { g.strokeStyle = '#55504a'; g.lineWidth = 2; g.setLineDash([3, 6]); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]); };
  let Lhold = 0;
  return { reset() { Lhold = 0; }, draw(g, W, H, t, step, ts) {
    g.clearRect(0, 0, W, H);
    // strain state L: 0 relaxed, 1 fully dragged
    let L = 0, tau = -1;
    if (step === 1) L = ease(ts / 5.5); else if (step >= 2) { tau = ts - 0.5; L = tau < 0 ? 1 : 1 - back(tau / 1.1); }
    const sx = x => x + (x >= TX ? L * SQ * Math.exp(-(x - TX) / 520) : 0);                 // squeezed landward while stuck
    const top = x => top0(x) + L * (D * g1(x) - U * g2(x));                                // dragged down at the edge, bulging up behind
    const rel = step >= 2 ? clamp(1 - L) : 0;                                              // how much has been released
    let eta = x => 0;
    if (step >= 2 && tau >= 0) { const tp = Math.max(0, tau - 0.7), run = Math.min(62 * tp, 330), q = run / 330, landf = Math.max(0, tp - 5.3), fade = tp > 9 ? Math.max(0, 1 - (tp - 9) / 2.5) : 1;
      eta = x => fade * D * 0.9 * rel * (tp <= 0 ? g1(x) : 0.5 * gs(x, 690 - 95 * tp, 185) + (0.5 + 0.55 * q) * Math.exp(-landf * 0.5) * gs(x, 690 + run, 185 - 80 * q)); }
    g.save(); if (step >= 2 && tau > 0 && tau < 1.3) { const a = 1 - tau / 1.3; g.translate(Math.sin(tau * 70) * 4 * a, Math.cos(tau * 55) * 3 * a); }
    // mantle
    g.fillStyle = '#f0e4da'; g.fillRect(-10, TY - 30, W + 20, H);
    // sea
    const xe = COAST + 120; g.beginPath();
    for (let x = -10; x <= xe; x += 6) { const xs = sx(x), yb = x < TX ? iface(x) : top(x), ys = SEA - eta(xs) + 1.2 * Math.sin(x * 0.03 + t * 1.4); x === -10 ? g.moveTo(xs, Math.min(ys, yb)) : g.lineTo(xs, Math.min(ys, yb)); }
    for (let x = xe; x >= -10; x -= 6) g.lineTo(sx(x), x < TX ? iface(x) : top(x));
    g.closePath(); g.fillStyle = '#bcd9ee'; g.fill();
    g.beginPath(); for (let x = -10; x <= COAST + 20; x += 6) { const xs = sx(x), yb = x < TX ? iface(x) : top(x), ys = SEA - eta(xs); if (ys > yb) break; x === -10 ? g.moveTo(xs, ys) : g.lineTo(xs, ys); } g.strokeStyle = '#5f93bd'; g.lineWidth = 3; g.stroke();
    // subducting plate
    g.beginPath(); for (let x = -10; x <= W + 10; x += 10) x === -10 ? g.moveTo(x, iface(x)) : g.lineTo(x, iface(x)); for (let x = W + 10; x >= -10; x -= 10) g.lineTo(x - 12, iface(x) + 50); g.closePath(); g.fillStyle = '#bdb6ad'; g.fill();
    for (let i = 0; i < 12; i++) { const x = ((t * 22 + i * 160) % 1900) - 40, y = iface(x) + 25, an = Math.atan2(iface(x + 5) - iface(x - 5), 10); g.save(); g.translate(x, y); g.rotate(an); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(-10, -9); g.lineTo(4, 0); g.lineTo(-10, 9); g.stroke(); g.restore(); }
    // overriding plate (deforms elastically)
    g.beginPath(); g.moveTo(sx(TX), iface(sx(TX))); for (let x = TX; x <= W + 60; x += 8) g.lineTo(sx(x), top(x)); g.lineTo(W + 60, iface(W + 60)); for (let x = W + 60; x >= TX; x -= 12) g.lineTo(Math.max(x, sx(TX)), iface(Math.max(x, sx(TX)))); g.closePath();
    g.fillStyle = '#dbd5cb'; g.fill(); g.strokeStyle = '#8f897f'; g.lineWidth = 2.5; g.stroke();
    g.beginPath(); for (let x = TX + 40; x <= W + 60; x += 12) { const y = top(x) + (iface(x) - top(x)) * 0.45; x === TX + 40 ? g.moveTo(sx(x), y) : g.lineTo(sx(x), y); } g.strokeStyle = 'rgba(120,112,100,.35)'; g.lineWidth = 2; g.setLineDash([10, 9]); g.stroke(); g.setLineDash([]);
    // plate boundary; the shallow part is stuck
    g.beginPath(); for (let x = -10; x <= W + 10; x += 10) x === -10 ? g.moveTo(x, iface(x)) : g.lineTo(x, iface(x)); g.strokeStyle = '#2a2724'; g.lineWidth = 4; g.stroke();
    const S0 = 560, S1 = 930;
    if (step >= 1) { const quake = step >= 2 && tau >= 0, fl = quake ? Math.max(0, 1 - tau / 2.2) : 0;
      g.beginPath(); for (let x = S0; x <= S1; x += 10) x === S0 ? g.moveTo(x, iface(x)) : g.lineTo(x, iface(x)); g.lineCap = 'round'; g.strokeStyle = quake ? '#b3261e' : '#2a2724'; g.lineWidth = quake ? 9 + 8 * fl : 11; if (fl > 0) { g.shadowColor = '#e0533f'; g.shadowBlur = 30 * fl; } g.stroke(); g.shadowBlur = 0; }
    g.restore();
    // labels
    const lab = (s, x, y, o = {}) => text(g, s, x, y, { size: 32, w: 600, col: o.col || '#2a2724', al: o.al || 'left', a: o.a ?? 1 });
    const fin = ease(ts / 0.9);
    if (step === 0) { g._ga = fin; lab('Sea', 150, 290); lab('Subducting plate', 90, 560); lead(g, 230, 528, 260, iface(260) + 30); lab('Overriding plate', 1220, 340); lab('Plate boundary', 700, 624); lead(g, 850, 596, 900, iface(900) + 8);
      barrow(g, 120, iface(120) + 110, 300, iface(300) + 118, 18); barrow(g, 1500, 290, 1330, 290, 18); g._ga = 1; }
    if (step === 1) { g._ga = fin; lab('Stuck', 540, 600); lead(g, 620, 570, 700, iface(700) + 10); lab('Sliding freely', 760, 626); lead(g, 960, 610, 1040, iface(1040) + 8);
      const a = ease((ts - 1.2) / 1.5); g._ga = a; arrow(g, sx(690), SEA - 100, sx(690), SEA - 20, '#2a2724'); lab('Dragged down', sx(690), SEA - 112, { al: 'center' }); arrow(g, 1170, top(1170) - 22, 1170, top(1170) - 100, '#2a2724'); lab('Bulges up', 1170, top(1170) - 112, { al: 'center' });
      barrow(g, 1560, 340, 1400, 340, 18); lab('Plate squeezed', 1340, 412); g._ga = 1; }
    if (step >= 2) { const a = ease((tau - 0.9) / 1.2); g._ga = ease(ts / 0.6); lab('Unstuck', 540, 600, { col: '#b3261e' }); lead(g, 650, 570, 710, iface(710) + 10);
      g._ga = a; arrow(g, 690, SEA - 30, 690, SEA - 110, '#2a2724'); lab('Uplift', 690, SEA - 120, { al: 'center' }); arrow(g, 1170, top0(1170) - 104, 1170, top0(1170) - 24, '#2a2724'); lab('Subsidence', 1170, top0(1170) - 114, { al: 'center' });
      lab('Tsunami', 250, SEA - 60, { col: '#2c6d9c' }); lab('Plate relaxes', 1340, 412); g._ga = 1; }
  } };
})();

/* ── shared pieces of the FFT matvec pictures ── */
const palL = [C.bo, C.bo2, C.teal, C.blue].map(hex), EMP = hex('#ebe6d8'), F0 = hex('#00A9B7'), F1 = hex('#333F48'), WHT = [255, 255, 255];
// one bold math symbol, centred at cx, with optional italic subscript / superscript and a hat
const msym = (g, ch, cx, cy, size, o = {}) => { const al = (o.al ?? 1) * (g._ga ?? 1); if (al < 0.02) return; const col = o.col || '#fff', big = `700 ${size}px ${MATH}`, sm = `italic 500 ${size * 0.68}px ${MATH}`;
  g.globalAlpha = al; g.fillStyle = col; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = big; const w = g.measureText(ch).width; g.font = sm; const sw = Math.max(o.sub ? g.measureText(o.sub).width : 0, o.sup ? g.measureText(o.sup).width : 0), x0 = cx - (w + sw) / 2;
  g.font = big; g.fillText(ch, x0, cy); g.font = sm; if (o.sub) g.fillText(o.sub, x0 + w + 1, cy + size * 0.25); if (o.sup) g.fillText(o.sup, x0 + w + 1, cy - size * 0.42);
  if (o.hat > 0.02) { const up = ch === ch.toUpperCase(), hx = x0 + w * 0.5, hy = cy - size * (up ? 0.8 : 0.58); g.globalAlpha = al * o.hat; g.strokeStyle = col; g.lineWidth = size * 0.085; g.lineJoin = 'round'; g.beginPath(); g.moveTo(hx - size * 0.24, hy); g.lineTo(hx, hy - size * 0.19); g.lineTo(hx + size * 0.24, hy); g.stroke(); }
  g.globalAlpha = g._ga ?? 1; };
// the five stages, always visible; cur = stage in progress (-1 none yet, 5 all done)
const TLN = ['Zero-pad', 'FFT in time  (cuFFT)', 'Strided batched GEMV', 'Inverse FFT  (cuFFT)', 'Un-pad'];
const tline = (g, x, y, cur) => { text(g, 'FFTMatvec  (C++ / CUDA)', x, y, { size: 38, w: 700, col: C.char });
  const y0 = y + 70, dy = 70; g.lineWidth = 3; g.strokeStyle = '#cfc9b8'; g.beginPath(); g.moveTo(x + 12, y0); g.lineTo(x + 12, y0 + 4 * dy); g.stroke();
  if (cur > 0) { g.strokeStyle = C.char; g.beginPath(); g.moveTo(x + 12, y0); g.lineTo(x + 12, y0 + Math.min(cur, 4) * dy); g.stroke(); }
  TLN.forEach((s, i) => { const yy = y0 + i * dy, on = i === cur, done = i < cur; g.beginPath(); g.arc(x + 12, yy, on ? 13 : 9, 0, TAU); g.fillStyle = on ? C.bo : done ? C.char : C.paper; g.fill(); if (!on && !done) { g.strokeStyle = '#b0b6ba'; g.lineWidth = 3; g.stroke(); }
    text(g, s, x + 46, yy + 12, { size: 33, w: on ? 700 : 500, col: on ? C.bo : done ? C.char : '#9aa3a8' }); });
 };
/* One FFT matvec y = F x drawn at the origin. o: geometry and names. A: progress of every stage (0..1).
   pad: zero-pad · fft: FFT · off: the empty blocks leave · hit(r): block r flies to its piece of the vector and turns into piece r of the result · ifft: inverse FFT · un: drop the padding */
const fmv = (g, o, A) => { const { N, bw, bh, G, VW, sub } = o, N2 = 2 * N, pw = bw + G, ph = bh + G, n = N + N * A.pad;
  const xv = n * pw + 20, xr = -(60 + VW), yin = r => r * pw, yout = r => r * ph, fc = r => mix(F0, F1, r / (N2 - 1));
  const mA = A.matA ?? 1, inA = A.inA ?? 1, resA = A.resA ?? 1, zf = o.zeroFrom ?? N, col1 = A.col1 || 0, out0 = A.out0 || 0, ls = o.ls || Math.min(26, bw * 0.5), GA = g._ga ?? 1;
  const box = (x, y, w, h, c, al, r = 6) => { if (al < 0.02) return; g.globalAlpha = al * GA; g.fillStyle = rgb(c); rr(g, x, y, w, h, r); g.fill(); g.globalAlpha = GA; };
  // off-diagonal blocks
  for (let i = 0; i < N2; i++) for (let j = 0; j < N2; j++) { if (i === j) continue; const inN = i < N && j < N, lag = (i - j + N2) % N2, low = inN && i > j;
    let al = (inN ? 1 : A.pad) * mA * (1 - A.off); if (low && j > 0) al *= 1 - 0.78 * col1;
    box(j * pw, i * ph, bw, bh, mix(mix(low ? palL[i - j] : EMP, lag < N ? palL[lag] : EMP, A.pad), EMP, A.fft), al);
    if (low) msym(g, 'F', j * pw + bw / 2, i * ph + bh / 2 + ls * 0.34, ls, { sub: (sub ? sub + ',' : '') + (i - j), al: al * (1 - clamp(A.fft * 2)) }); }
  // input vector, one piece per block column
  for (let r = 0; r < N2; r++) { const h = A.hit(r), al = (r < N ? 1 : A.pad * (1 - A.un)) * inA * (1 - 0.74 * clamp((h - 0.4) / 0.2)), fv = ease(A.fft * 1.6 - 0.6 * r / (N2 - 1));
    box(xv, yin(r), VW, bw, mix(r < zf ? (r >= (o.lightFrom ?? 99) ? mix(o.inCol, WHT, 0.55) : o.inCol) : EMP, mix(o.inCol, WHT, 0.12 + 0.4 * r / (N2 - 1)), fv), al);
    if (r >= zf && fv < 0.5 && bw > 30) { g._ga = GA * al * (1 - 2 * fv); text(g, '0', xv + VW / 2, yin(r) + bw / 2 + 10, { size: 26, w: 600, col: C.mute, al: 'center' }); g._ga = GA; } }
  // diagonal blocks: at home, then on their piece of the vector, then they are the result
  for (let r = 0; r < N2; r++) { const h = A.hit(r), a0 = (r < N ? 1 : A.pad) * mA, c0 = mix(palL[0], fc(r), A.fft), hx = r * pw, hy = r * ph, tx = xv + VW / 2 - bw / 2, ty = yin(r) + bw / 2 - bh / 2;
    if (r < N && out0 > 0.02 && h < 0.5) box(xr, yout(r), VW, bh, o.outCol, out0 * resA);
    if (h > 0) box(hx, hy, bw, bh, fc(r), 0.16 * a0 * clamp(h * 3) * (A.ghostA ?? 1));
    let x, y, w = bw, hh = bh, al = a0, c = c0, la = 1;
    if (h < 0.5) { const e = ease(h * 2); x = lerp(hx, tx, e); y = lerp(hy, ty, e); }
    else { const e = ease(h * 2 - 1), iv = ease(A.ifft * 1.6 - 0.6 * r / (N2 - 1)); x = lerp(tx, xr, e); y = lerp(ty, yout(r), e); w = lerp(bw, VW, e); la = 1 - clamp(e * 2.5);
      c = mix(fc(r), r < N ? o.outCol : mix(o.outCol, EMP, 0.72), iv); al = lerp(a0, resA * (r < N ? 1 : 1 - A.un), e); }
    box(x, y, w, hh, c, al);
    if (la > 0.02) { const dim = r > 0 ? 1 - 0.78 * col1 : 1; msym(g, 'F', x + w / 2, y + hh / 2 + ls * 0.34, ls, { sub: (sub ? sub + ',' : '') + '0', al: (r < N ? al : 0) * la * (1 - clamp(A.fft * 2)) * dim }); msym(g, 'F', x + w / 2, y + hh / 2 + ls * 0.34, ls, { sub: (sub ? sub + ',' : '') + r, hat: 1, al: al * la * clamp(A.fft * 2 - 1) }); } }
  // names
  const top = -16, fs = o.fs || 34, gone = clamp(A.hit(N2 - 1) * 2), rA = Math.max(out0, clamp(A.hit(0) * 2 - 1)) * resA;
  msym(g, 'F', n * pw / 2, top, fs, { sub, col: o.mcol || C.char, hat: clamp(A.fft * 2 - 1), al: mA * (1 - gone) });
  msym(g, o.inSym, xv + VW / 2, top, fs, { col: C.char, hat: clamp(A.fft * 2 - 1), al: inA });
  msym(g, o.outSym, xr + VW / 2, top, fs, { col: C.char, hat: clamp(A.hit(0) * 2 - 1) * (1 - clamp(A.ifft * 2)), al: rA });
  g._ga = GA * rA * (A.eqA ?? 1); text(g, '=', -30, N * ph / 2 + 12, { size: fs, w: 700, col: C.char, al: 'center' });
  g._ga = GA * inA * clamp(1 - A.pad * 3); if (o.inDim) text(g, o.inDim, xv + VW / 2, yin(N - 1) + bw + G + 22, { size: 21, w: 600, col: C.mute, al: 'center' });
  g._ga = GA * resA * Math.max(out0, clamp(A.un * 2 - 1)); if (o.outDim) text(g, o.outDim, xr + VW / 2, yout(N - 1) + bh + G + 22, { size: 21, w: 600, col: C.mute, al: 'center' });
  g._ga = GA; return { xv, xr, yin, yout }; };

/* y = F x, one click per stage:
   0 block Toeplitz matvec · 1 store one block column · 2 zero-pad · 3 FFT · 4 strided batched GEMV · 5 inverse FFT · 6 un-pad */
scenes.toep = (() => {
  const o = { N: 4, bw: 72, bh: 72, G: 8, VW: 46, sub: '', inSym: 'x', outSym: 'y', inCol: hex(C.bo), outCol: hex('#00808c'), ls: 30, fs: 42 }, st = {};
  const cap = ['Block Toeplitz matrix times a vector. Same color = same block.', 'Only the first block column is stored.', 'Zero-pad in time: the matrix is now block circulant, twice as large.', 'FFT in time: the matrix becomes block diagonal.', 'Each block hits only its own piece of the vector.', 'Inverse FFT: back to the time domain.', 'Drop the padding: this is the result.'];
  return { reset() { for (const k in st) delete st[k]; }, draw(g, W, H, t, step, ts, dt) {
    g.clearRect(0, 0, W, H); const k = 1 - Math.exp(-dt * 4), on = b => b ? 1 : 0;
    smooth(st, { z: step <= 1 ? 1.85 : 1, pad: on(step >= 2), fft: on(step >= 3), off: on(step >= 4), ifft: on(step >= 5), un: on(step >= 6), col1: on(step === 1), out0: on(step === 0) }, k);
    const A = { pad: st.pad, fft: st.fft, off: st.off, ifft: st.ifft, un: st.un, col1: st.col1, out0: st.out0, hit: r => step > 4 ? 1 : step === 4 ? clamp((ts - 0.5 - r * 0.28) / 1.0) : 0 };
    g.save(); g.translate(30 + 106 * st.z, 12 + 44 * st.z); g.scale(st.z, st.z); fmv(g, o, A); g.restore();
    tline(g, 1240, 150, step - 2 + (step === 6 && st.un > 0.97 ? 1 : 0));
  } };
})();

/* One operator of our problem as a block Toeplitz matvec, with the full FFTMatvec process, then how it is formed and how it is cut across GPUs.
   kind 'G': tall blocks (963 -> 2.4 million), formed by forward solves (columns), cut along rows.
   kind 'q': wide blocks (2.4 million -> 64), formed by adjoint solves (rows), cut along columns.
   steps: 0 block Toeplitz x vector · 1 FFTMatvec (plays: zero-pad, FFT, block hits, inverse FFT + drop padding) · 2 forming · 3 cutting */
const mvScene = kind => {
  const tall = kind === 'G', a = 22, B = 64, G = 6, bw = tall ? a : B, bh = tall ? B : a, OX = tall ? 250 : 90, OY = 84, VW = 44;
  const pal = [C.bo, C.bo2, C.teal].map(hex), empty = hex('#ebe6d8'), f0 = hex('#00A9B7'), f1 = hex('#333F48'), gpu = [C.bo, C.bo2, C.teal, C.blue];
  const inCol = hex(tall ? C.bo : C.char), outCol = hex(tall ? C.char : C.teal), fc = r => mix(f0, f1, r / 5);
  const cx = j => OX + j * (bw + G), cyy = i => OY + i * (bh + G), yin = r => OY + r * (bw + G), yout = r => OY + r * (bh + G);
  const st = {};
  return { reset() { for (const k in st) delete st[k]; }, draw(g, W, H, t, step, ts, dt) {
    g.clearRect(0, 0, W, H); const k = 1 - Math.exp(-dt * 4), u = step < 1 ? -1 : step === 1 ? ts : 99;
    const pad = ease(u / 1.0), fft = ease((u - 1.4) / 1.0), hit = r => ease((u - 2.9 - r * 0.2) / 0.5), un = ease((u - 5.0) / 1.0), ph = u < 0 ? -1 : u < 1.4 ? 0 : u < 2.9 ? 1 : u < 5.0 ? 2 : u < 6.2 ? 3 : 4;
    smooth(st, { z: step < 1 ? 2.0 : 1.3, form: step === 2 ? 1 : 0, cut: step >= 3 ? 1 : 0, out0: step === 0 ? 1 : 0 }, k);
    const n = 3 + 3 * pad;
    g.save(); g.scale(st.z, st.z);
    // matrix: block Toeplitz (3x3) -> padded (6x6) -> block diagonal
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const in3 = i < 3 && j < 3, al = in3 ? 1 : pad; if (al < 0.02) continue; const x = cx(j), y = cyy(i);
      g.globalAlpha = al; g.fillStyle = rgb(mix(in3 && i >= j ? pal[i - j] : empty, i === j ? fc(i) : empty, fft)); rr(g, x, y, bw, bh, 5); g.fill();
      if (i === j && fft > 0.9) { g.save(); rr(g, x, y, bw, bh, 5); g.clip();
        if (st.cut > 0.02) for (let p = 0; p < 4; p++) { g.globalAlpha = st.cut; g.fillStyle = gpu[p]; if (tall) g.fillRect(x, y + p * bh / 4 + 1, bw, bh / 4 - 2); else g.fillRect(x + p * bw / 4 + 1, y, bw / 4 - 2, bh); }
        if (st.form > 0.02) { const s = (t * 0.45) % 1; g.globalAlpha = 0.95 * st.form; g.fillStyle = '#fff'; if (tall) g.fillRect(x + s * bw - 2.5, y, 5, bh); else g.fillRect(x, y + s * bh - 2.5, bw, 5); }
        g.restore(); } }
    g.globalAlpha = 1;
    // input vector (one piece per block column) and result (one piece per block row)
    const xv = OX + n * (bw + G) + 28, xr = xv + VW + 64;
    const banded = (x, y, w, h, al) => { for (let p = 0; p < 4; p++) { g.globalAlpha = al; g.fillStyle = gpu[p]; rr(g, x, y + p * h / 4 + 1, w, h / 4 - 2, 3); g.fill(); } };
    for (let r = 0; r < 6; r++) { const al = r < 3 ? 1 : pad * (1 - un); if (al > 0.02) { const live = fft * (1 - un), yy = yin(r);
        g.globalAlpha = al; g.fillStyle = rgb(mix(r < 3 ? inCol : empty, mix(inCol, hex(C.bo2), 0.25 + r / 8), live)); rr(g, xv, yy, VW, bw, 5); g.fill();
        if (r >= 3 && fft < 0.5 && bw > 30) { g._ga = al * (1 - 2 * fft); text(g, '0', xv + VW / 2, yy + bw / 2 + 10, { size: 26, w: 600, col: C.mute, al: 'center' }); g._ga = 1; }
        if (!tall && st.cut > 0.02 && r < 3) banded(xv, yy, VW, bw, st.cut); }
      let ao = r < 3 ? st.out0 : 0, co = outCol;
      if (u >= 0) { const h = hit(r); ao = r < 3 ? Math.max(h, 0) : h * (1 - un); co = mix(fc(r), outCol, un);
        if (h > 0 && h < 1) { g.globalAlpha = 0.85 * (1 - h); g.fillStyle = rgb(fc(r)); rr(g, lerp(cx(r), xv - 8, h), lerp(cyy(r), yin(r), h), bw, bh, 5); g.fill(); } }
      if (ao > 0.02) { g.globalAlpha = ao; g.fillStyle = rgb(co); rr(g, xr, yout(r), VW, bh, 5); g.fill(); if (tall && st.cut > 0.02 && r < 3) banded(xr, yout(r), VW, bh, st.cut * ao); } }
    g.globalAlpha = 1; const fs = 24 / st.z, top = OY - 14;
    const sym = (x, s1, s2, col) => { text(g, s1, x - (s2 ? 8 / st.z : 0), top, { size: 40 / st.z, col, al: 'center', up: 1 }); if (s2) text(g, s2, x + 17 / st.z, top + 10 / st.z, { size: 24 / st.z, col, al: 'center' }); };
    sym(OX + n * (bw + G) / 2, 'F', tall ? 'G' : 'q', tall ? C.bo : '#00808c'); sym(xv + VW / 2, tall ? 's' : 'm', '', C.char);
    const eqA = u >= 0 ? clamp(hit(0)) : st.out0; g._ga = eqA; text(g, '=', xv + VW + 32, OY + 1.5 * (bh + G) + 10, { size: 40 / Math.sqrt(st.z), w: 700, col: C.char, al: 'center' }); sym(xr + VW / 2, tall ? 'm' : 'q', '', C.char); g._ga = 1;
    const nv = 3 + 3 * pad * (1 - un), yb = OY + (tall ? n : nv) * ((tall ? bh : bw) + G) + 26 / st.z;
    text(g, tall ? '963' : '2.4 million', xv + VW / 2, tall ? yin(nv - 1) + bw + G + 30 / st.z : yb, { size: fs, w: 600, col: C.mute, al: 'center' });
    g._ga = eqA; text(g, tall ? '2.4 million' : '64', xr + VW / 2, tall ? OY + nv * (bh + G) + 26 / st.z : yout(nv - 1) + bh + G + 30 / st.z, { size: fs, w: 600, col: C.mute, al: tall ? 'center' : 'center' }); g._ga = 1;
    g.restore();
    // what is happening
    if (step === 1 && ph < 4) { const names = ['zero-pad', 'FFT', 'block matvec', 'inverse FFT, un-pad']; let x = 30; names.forEach((s, i) => { g.font = `${i === ph ? 700 : 500} 30px ${SANS}`; text(g, s, x, 34, { size: 30, w: i === ph ? 700 : 500, col: i === ph ? C.bo : i < ph ? C.char : '#b0b6ba' }); x += g.measureText(s).width + 26; if (i < 3) { text(g, '→', x, 34, { size: 30, col: '#b0b6ba' }); x += 56; } }); }
    else { const cap = step === 0 ? 'Block Toeplitz in time: same color = same block.' : step === 1 ? 'Done: the result, with the padding dropped.' : step === 2 ? (tall ? 'One forward solve fills one column of every block.' : 'One adjoint solve fills one row of every block.') : (tall ? 'Rows = seafloor: each GPU owns one slice.' : 'Columns = seafloor: the same slices as before.');
      text(g, cap, 30, 34, { size: 30, col: C.mute }); }
  } };
};
scenes.mvG = mvScene('G'); scenes.mvq = mvScene('q');

/* Our problem, laid out as the equation q = F_q D_t F_G s and read from right to left, following one vector:
   s meets the tall earthquake operator (FFT matvec, Algorithm 2) -> seafloor motion m -> time derivative -> velocity v
   -> v meets the wide tsunami operator (same FFT matvec) -> waveforms q -> zoom out: the whole equation as blocks.
   All three vectors have the same number of time steps. One master clock T; a click opens the next gate, clicking early fast-forwards.
   steps: 0 source and earthquake operator · 1 earthquake matvec · 2 m -> v, tsunami operator · 3 tsunami matvec · 4 the whole picture */
scenes.flow = (() => {
  const a = 46, B = 68, G = 6, VW = 46, LW = 1180, ZA = 2.1, ZB = 1.45, ZF = 1.5, Y0 = 80, charc = hex(C.char), bluec = hex(C.blue);
  const oG = { N: 3, bw: a, bh: B, G, VW, sub: 'G', inSym: 's', outSym: 'm', inCol: hex(C.bo), outCol: charc, mcol: C.bo, ls: 22 };
  const oQ = { N: 3, bw: B, bh: a, G, VW, sub: 'q', inSym: 'v', outSym: 'q', inCol: bluec, outCol: hex('#00808c'), mcol: '#00808c', ls: 25 };
  const stage = (u, N2) => { const he = 3.5 + (N2 - 1) * 0.28 + 1.0; return { pad: ease(u / 1.0), fft: ease((u - 1.5) / 1.1), off: ease((u - 3.0) / 0.6), hit: r => clamp((u - 3.5 - r * 0.28) / 1.0), ifft: ease((u - he - 0.5) / 1.1), un: ease((u - he - 2.0) / 0.9),
    ph: u < 0 ? -1 : u < 1.5 ? 0 : u < 3.0 ? 1 : u < he + 0.5 ? 2 : u < he + 2.0 ? 3 : u < he + 3.0 ? 4 : 5, total: he + 3.0 }; };
  const Z0 = { pad: 0, fft: 0, off: 0, hit: () => 0, ifft: 0, un: 0, resA: 0 };
  const SG = [1.2, 2.8, 6.1, 7.7, 9.0], g0 = 2.4, e1 = g0 + 9.0, g2 = e1 + 3.2, e2 = g2 + 9.0, gates = [g0, e1, g2, e2, e2 + 3.6];   // the five FFT stages play by themselves: they were taught on the previous slide
  const XR = -(60 + VW), xQ = n => XR - 20 - n * (B + G);
  const cam = (lo, hi, z) => ({ z, X: LW / 2 - z * (lo + hi) / 2, Y: Y0 }), mixc = (p, q, t) => ({ z: lerp(p.z, q.z, t), X: lerp(p.X, q.X, t), Y: lerp(p.Y, q.Y, t) });
  const CG0 = cam(XR, 3 * (a + G) + 20 + VW, ZA), CG1 = cam(XR, 6 * (a + G) + 20 + VW, ZB), CQ0 = cam(xQ(3) + XR, XR + VW, ZA), CQ1 = cam(xQ(6) + XR, XR + VW, ZB), CF = { z: ZF, X: 1044, Y: 215 };
  const st = {};
  return { reset() { for (const k in st) delete st[k]; }, draw(g, W, H, t, step, ts, dt) {
    g.clearRect(0, 0, W, H);
    const tg = gates[step]; if (st.T === undefined) st.T = step ? tg : 0;
    st.T = st.T < tg ? Math.min(tg, st.T + dt * (step && st.T < gates[step - 1] - 0.01 ? 7 : st.T > g2 ? 1.4 : 1)) : Math.max(tg, st.T - dt * 6); const T = window.FLOW_T ?? st.T;
    const A1 = stage(T - g0, 6), s2 = T - e1, hide = ease(s2 / 0.8), dtv = ease((s2 - 0.4) / 1.0), pan = ease((s2 - 1.6) / 1.4);
    const A2 = stage(T - g2, 6), s4 = T - e2, back = ease((s4 - 0.3) / 1.0), pq = A2.pad * (1 - back), zo = ease(s4 / 1.3), sw = ease((s4 - 1.5) / 0.4), lam = ease((s4 - 2.0) / 1.5), fo = 1 - ease(s4 / 0.6);
    const c = T < e1 ? mixc(CG0, CG1, A1.pad) : T < g2 ? mixc(CG1, CQ0, pan) : mixc(mixc(CQ0, CQ1, pq), CF, zo), vcol = mix(charc, bluec, dtv);
    if (sw < 0.99) { g.save(); g._ga = 1 - sw; g.globalAlpha = 1 - sw; g.translate(c.X, c.Y); g.scale(c.z, c.z);
      // earthquake operator: once m is there, the operator and s leave; only the vector stays, as the input of the next operator
      Object.assign(A1, { inA: ease(T / 0.8) * (1 - hide), matA: ease((T - 1.0) / 1.0), ghostA: 1 - hide, resA: T >= g2 ? 0 : 1, eqA: 1 - hide });
      fmv(g, { ...oG, outCol: vcol, outSym: dtv > 0.5 ? 'v' : 'm' }, A1);
      if (s2 > 0 && dtv > 0 && dtv < 1) { const ga = g._ga; g._ga = ga * Math.sin(dtv * Math.PI); msym(g, 'D', XR + VW + 44, 74 + B / 2 + 12, 40, { sub: 't', col: C.bo }); g._ga = ga; }
      // tsunami operator, to the left of the same vector
      if (s2 > 1.5) { g.save(); g.translate(xQ(3 + 3 * pq), 0); Object.assign(A2, { matA: T >= g2 ? 1 : pan, inA: T >= g2 ? 1 - back : 0, ghostA: 1 - back }); fmv(g, { ...oQ, inCol: vcol }, A2); g.restore(); }
      // the whole picture: both operators and the source come back
      if (back > 0.01) { fmv(g, oG, { ...Z0, matA: back, inA: back }); g.save(); g.translate(xQ(3), 0); fmv(g, oQ, { ...Z0, matA: back, inA: back }); g.restore(); }
      g.restore(); g._ga = 1; g.globalAlpha = 1; }
    if (sw > 0.01) { scenes.part.render(g, { al: sw, geo: scenes.part.geo(lam), lam });
      for (let r = 0; r < 3; r++) { g.globalAlpha = sw * (1 - lam); g.fillStyle = rgb(bluec); rr(g, CF.X + ZF * XR, CF.Y + ZF * r * (B + G), ZF * VW, ZF * B, 8); g.fill(); } g.globalAlpha = 1; }
    if (fo > 0.01) { g._ga = fo; g.globalAlpha = fo; tline(g, 1270, 190, T < e1 + 0.4 ? A1.ph : T < g2 ? -1 : A2.ph); g._ga = 1; g.globalAlpha = 1; }
  } };
})();

/* q = F_q D_t F_G s as a process, read right to left:
   step 1: F_G hits s (pad, FFT, block matvec, inverse FFT, un-pad) -> seafloor motion m (huge); step 2: the same with F_q on m -> q */
scenes.pipe = (() => {
  const a = 20, B = 76, gp = 6, N = 6, cy = 306, emp = hex('#ebe6d8'), pal = [C.bo, C.bo2, C.teal].map(hex), f0 = hex('#00A9B7'), f1 = hex('#333F48');
  const xs = 1620, xG = 1418, xm = 1278, xQ = 696, xq = 608, SW = 26, yS = cy - N * (a + gp) / 2, yB = cy - N * (B + gp) / 2;
  const stage = u => ({ on: u >= 0, pad: ease(u / 0.9), fft: ease((u - 1.2) / 0.9), hit: r => ease((u - 2.4 - r * 0.16) / 0.5), un: ease((u - 3.9) / 0.9) });
  const fcol = r => mix(f0, f1, r / 5);
  return { draw(g, W, H, t, step, ts) {
    g.clearRect(0, 0, W, H);
    const A1 = stage(step < 1 ? -1 : step === 1 ? ts : 99), A2 = stage(step < 2 ? -1 : ts);
    const mat = (x0, y0, bw, bh, A) => { for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const in3 = i < 3 && j < 3, al = in3 ? 1 : A.pad; if (al < 0.02) continue;
        g.globalAlpha = al; g.fillStyle = rgb(mix(in3 && i >= j ? pal[i - j] : emp, i === j ? fcol(i) : emp, A.fft)); rr(g, x0 + j * (bw + gp), y0 + i * (bh + gp), bw, bh, 4); g.fill(); } g.globalAlpha = 1; };
    const slot = (x, y, w, h, col, al, outline) => { if (outline) { g.globalAlpha = 0.5; g.strokeStyle = '#b9b3a2'; g.lineWidth = 2; rr(g, x + 1, y + 1, w - 2, h - 2, 4); g.stroke(); } if (al > 0.02) { g.globalAlpha = al; g.fillStyle = rgb(col); rr(g, x, y, w, h, 4); g.fill(); } g.globalAlpha = 1; };
    // s : input of stage 1
    for (let r = 0; r < N; r++) { const y = yS + r * (a + gp), live = A1.fft * (1 - A1.un);
      if (r < 3) slot(xs, y, SW, a, mix(hex(C.bo), mix(hex(C.bo), hex(C.bo2), r / 5 + 0.3), live), 1); else slot(xs, y, SW, a, mix(emp, mix(hex(C.bo), hex(C.bo2), r / 5), live), A1.pad * (1 - A1.un), false); }
    mat(xG, yB, a, B, A1);
    // m : output of stage 1, input of stage 2
    for (let r = 0; r < N; r++) { const y = yB + r * (B + gp), live2 = A2.fft * (1 - A2.un);
      if (r < 3) slot(xm, y, SW, B, mix(mix(fcol(r), hex(C.char), A1.un), fcol(r), live2), A1.on ? A1.hit(r) : 0, true);
      else { slot(xm, y, SW, B, fcol(r), A1.on ? A1.hit(r) * (1 - A1.un) : 0, false); slot(xm, y, SW, B, mix(emp, fcol(r), live2), A2.pad * (1 - A2.un), false); } }
    mat(xQ, yS, B, a, A2);
    // q : output of stage 2
    for (let r = 0; r < N; r++) { const y = yS + r * (a + gp);
      if (r < 3) slot(xq, y, SW, a, mix(fcol(r), hex(C.teal), A2.un), A2.on ? A2.hit(r) : 0, true); else slot(xq, y, SW, a, fcol(r), A2.on ? A2.hit(r) * (1 - A2.un) : 0, false); }
    // symbols
    const sym = (x, y, s1, s2, col) => { text(g, s1, x - (s2 ? 9 : 0), y, { size: 48, col, al: 'center' }); if (s2) text(g, s2, x + 20, y + 12, { size: 27, col, al: 'center' }); };
    sym(xs + SW / 2, yS - 24, 's', '', C.char); sym(xG + N * (a + gp) / 2, yB - 22, 'F', 'G', C.bo); sym(xm + SW / 2, yB - 22, 'm', '', C.char); sym(xQ + N * (B + gp) / 2, yS - 24, 'F', 'q', '#00808c'); sym(xq + SW / 2, yS - 24, 'q', '', C.char);
    sym((xQ + N * (B + gp) + xm) / 2 - 4, cy + 14, 'D', 't', C.mute);
    const below = (x, y, s1, s2, col, al = 'center') => { text(g, s1, x, y, { size: 30, w: 600, col, al }); if (s2) text(g, s2, x, y + 36, { size: 26, col: C.mute, al }); };
    below(xs + SW / 2, yS + N * (a + gp) + 40, '963', 'fault patches', C.bo);
    below(xm + SW, yB + N * (B + gp) + 36, '2.4 million', 'seafloor points', C.char, 'right');
    below(xq + SW / 2, yS + N * (a + gp) + 40, '64', 'waveforms', '#00808c');
    below(xG, yB + N * (B + gp) + 36, 'tall', '963 forward solves', C.bo, 'left');
    below(xQ + N * (B + gp) / 2, yS + N * (a + gp) + 40, 'wide', 'from 64 adjoint solves', '#00808c');
    // what is happening (left)
    const phase = A => !A.on ? -1 : A.un >= 1 ? 4 : A.un > 0 ? 3 : A.hit(0) > 0 ? 2 : A.fft > 0 ? 1 : 0, names = ['zero-pad', 'FFT in time', 'block-diagonal matvec', 'inverse FFT, drop the padding'];
    const p1 = phase(A1), p2 = phase(A2), lx = 30;
    const head = (y, s, on, done) => text(g, s, lx, y, { size: 36, w: 700, col: on ? C.bo : done ? C.char : '#b0b6ba' });
    head(150, '1   Earthquake', step === 1, step > 1); text(g, 'the tall operator hits the slip', lx + 52, 196, { size: 28, col: step >= 1 ? C.char : '#b0b6ba' });
    head(300, '2   Tsunami', step === 2, false); text(g, 'the wide operator hits the seafloor', lx + 52, 346, { size: 28, col: step >= 2 ? C.char : '#b0b6ba' });
    const cur = step === 1 ? p1 : step === 2 ? p2 : -1;
    if (cur >= 0 && cur < 4) for (let i = 0; i < 4; i++) text(g, names[i], lx + 52, 430 + i * 40, { size: 28, w: i === cur ? 700 : 500, col: i === cur ? C.bo : i < cur ? C.char : '#b0b6ba' });
    if (step === 0) text(g, 'Read from right to left', lx, 430, { size: 30, col: C.mute });
  } };
})();

/* Many GPUs, continuing from the picture that ends the previous slide: q = F_q D_t F_G s drawn as blocks.
   One click per step: 1 cut the seafloor (same places in every block; a diagonal keeps its color, slices differ in shade)
   2 reindex, space outside and time inside: F_q is a row of local block Toeplitz matrices, F_G a column of them; the shapes do not change
   3 row times column = a sum of local products: one pair per GPU · 4 broadcast s · 5 first local matvec · 6 second local matvec · 7 reduce (sum) */
scenes.part = (() => {
  const sw = 44, sh = 36, gp = 5, SH = 100, GAP = 8, gl = 5, LH = 160, LY = p => 8 + p * 171, LQX = 740, LGX = 1030;
  const O1 = { bw: 59.4, bh: 194.4, gs: 10, gb: 20, vw: 34, GX: 1180, GY: 66, QX: 430, QY: 278.4, XS: 1408, YS: 278.4, XQ: 336, YQ: 278.4 };
  const O0 = { bw: 69, bh: 102, gs: 9, gb: 9, vw: 69, GX: 1044, GY: 215, QX: 522, QY: 215, XS: 1308, YS: 215, XQ: 363, YQ: 215 };   // the previous scene's final camera
  const geo = l => { const o = {}; for (const k in O1) o[k] = lerp(O0[k], O1[k], l); return o; };
  const pcs = []; for (const m of 'GQ') for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let p = 0; p < 4; p++) pcs.push({ m, i, j, p });
  const shade = (c, p) => p === 0 ? mix(c, [0, 0, 0], 0.2) : mix(c, WHT, (p - 1) * 0.25);
  const fill = (g, x, y, w, h, col, a, r = 8) => { if (a < 0.02) return; g.globalAlpha = a; g.fillStyle = col; rr(g, x, y, w, h, r); g.fill(); g.globalAlpha = 1; };
  const zero = () => 0;
  const render = (g, o) => { const A = o.al, q = o.geo || O1, lam = o.lam ?? 1, cut = o.cut || 0, shf = o.shf || 0, r1 = o.r1 || zero, r2 = o.r2 || zero, R = o.R || 0, L = o.L || 0, dx = SH * shf;
    const gh = q.bh / 4, QW = 3 * (q.bh + q.gb) - q.gb, QH = 3 * (q.bw + q.gs) - q.gs, HL = 3 * (gh + gl) - gl, tot = 4 * HL + 3 * GAP, GYR = q.GY + (QW - tot) / 2, QXR = q.QX + SH + (QW - tot) / 2, my = q.QY + QH / 2;
    const rect = c => { const G = c.m === 'G', a = G ? [q.GX + dx + c.j * (q.bw + q.gs), q.GY + c.i * (q.bh + q.gb) + c.p * gh + (c.p - 1.5) * 4 * cut, q.bw, gh] : [q.QX + dx + c.j * (q.bh + q.gb) + c.p * gh + (c.p - 1.5) * 4 * cut, q.QY + c.i * (q.bw + q.gs), gh, q.bw];
      const e1 = r1(c), e2 = r2(c); if (e1 <= 0) return a;
      const b = G ? [q.GX + SH + c.j * (q.bw + q.gs), GYR + c.p * (HL + GAP) + c.i * (gh + gl), q.bw, gh] : [QXR + c.p * (HL + GAP) + c.j * (gh + gl), q.QY + c.i * (q.bw + q.gs), gh, q.bw];
      const l = G ? [LGX + c.j * (sw + gp), LY(c.p) + (LH - 118) / 2 + c.i * (sh + gp), sw, sh] : [LQX + c.j * (sh + gp), LY(c.p) + (LH - 142) / 2 + c.i * (sw + gp), sh, sw];
      return a.map((v, k) => lerp(lerp(v, b[k], e1), l[k], e2)); };
    // GPUs
    for (let p = 0; p < 4; p++) { const y = LY(p), a = A * (o.lane || 0); if (a > 0.02) { g.globalAlpha = a; g.fillStyle = '#fff'; g.strokeStyle = C.lime; g.lineWidth = 2.5; rr(g, 520, y, 770, LH, 18); g.fill(); g.stroke(); g.globalAlpha = 1; g._ga = a; text(g, 'GPU ' + p, 538, y + 34, { size: 28, w: 700, col: C.char }); g._ga = 1; } }
    // the slices
    pcs.forEach(c => { const b = rect(c), low = c.i >= c.j, base = low ? palL[c.i - c.j] : EMP;
      g.globalAlpha = A; g.fillStyle = rgb(mix(base, low ? shade(base, c.p) : EMP, cut)); rr(g, b[0], b[1], b[2], b[3], 2 + 3 * cut); g.fill(); });
    g.globalAlpha = 1;
    // names of the local matrices: above the row / beside the column, then inside the GPUs
    if (R > 0.02) for (let p = 0; p < 4; p++) { const e2 = r2({ p, i: 1, j: 1 }); g._ga = A * R;
      msym(g, 'F', lerp(QXR + p * (HL + GAP) + HL / 2, LQX - 50, e2), lerp(q.QY - 20, LY(p) + LH / 2 + 12, e2), 36, { sub: 'q', sup: '(' + p + ')', col: '#00808c' });
      msym(g, 'F', lerp(q.GX + SH + QH + 46, LGX - 50, e2), lerp(GYR + p * (HL + GAP) + HL / 2 + 12, LY(p) + LH / 2 + 12, e2), 36, { sub: 'G', sup: '(' + p + ')', col: C.bo }); g._ga = 1; }
    // the global picture: names, =, D_t, q; s stays and becomes the source that is broadcast
    const ga = A * (1 - L); if (ga > 0.02) { const la = 1 - clamp(cut * 2);
      g._ga = ga * la; for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) { msym(g, 'F', q.GX + dx + j * (q.bw + q.gs) + q.bw / 2, q.GY + i * (q.bh + q.gb) + q.bh / 2 + 8, q.bw * 0.4, { sub: 'G,' + (i - j) }); msym(g, 'F', q.QX + dx + j * (q.bh + q.gb) + q.bh / 2, q.QY + i * (q.bw + q.gs) + q.bw / 2 + 9, q.bw * 0.47, { sub: 'q,' + (i - j) }); }
      g._ga = ga * (1 - R); msym(g, 'F', q.QX + dx + QW / 2, q.QY - 22, 42, { sub: 'q', col: '#00808c' }); msym(g, 'F', q.GX + dx + QH / 2, q.GY - 20, 42, { sub: 'G', col: C.bo });
      g._ga = ga * lam * (1 - R); text(g, 'seafloor points', q.QX + dx + QW / 2, q.QY + QH + 40, { size: 30, w: 700, col: C.bo, al: 'center' });
      g.save(); g.translate(q.GX + dx - 20, q.GY + QW / 2); g.rotate(-Math.PI / 2); text(g, 'seafloor points', 0, 0, { size: 30, w: 700, col: C.bo, al: 'center' }); g.restore();
      g._ga = ga * lam; msym(g, 'D', q.QX + dx + QW + (q.GX - q.QX - QW) * 0.36 + 14 * R, my + 14, 42, { sub: 't', col: C.char });
      g._ga = ga; msym(g, 'q', q.XQ + dx + q.vw / 2, q.YQ - 22, 42, { col: C.char }); text(g, '=', (q.XQ + q.vw + q.QX) / 2 + dx, my + 14, { size: 42, w: 700, col: C.char, al: 'center' }); g._ga = 1;
      for (let i = 0; i < 3; i++) fill(g, q.XQ + dx, q.YQ + i * (q.bw + q.gs), q.vw, q.bw, '#00808c', ga); }
    const sx = lerp(q.XS + dx + 92 * R, 1420, L), sy = lerp(q.YS, 245, L);
    for (let i = 0; i < 3; i++) fill(g, sx, sy + i * (q.bw + q.gs), q.vw, q.bw, C.bo, A);
    g._ga = A; msym(g, 's', sx + q.vw / 2, sy - 22, 42, { col: C.char }); g._ga = 1;
    // run: broadcast, two local matvecs, reduce
    if (o.bc) { g._ga = A * clamp(o.bc(0) * 3); text(g, 'Broadcast', 1437, 500, { size: 36, w: 700, col: C.bo, al: 'center' }); g._ga = 1;
      for (let p = 0; p < 4; p++) { const y = LY(p) + LH / 2, b = o.bc(p), m1 = o.u1, m2 = o.u2, rd = o.rd(p);
        // every vector is cut in time, like the operators: three pieces each
        for (let i = 0; i < 3; i++) {
          if (b > 0) fill(g, lerp(1420, 1216, b), lerp(245 + i * 69, y - 50 + i * 35, b), 34, lerp(59, 30, b), C.bo, A, 6);
          const a1 = clamp(m1 * 3 - i * 0.8); if (a1 > 0) fill(g, 890, y - 59 + i * 41, 34, 36, C.blue, A * a1, 6);
          const a2 = clamp(m2 * 3 - i * 0.8); if (a2 > 0) fill(g, 570, y - 38 + i * 31, 34, 26, '#00808c', A * a2, 6);
          if (rd > 0 && rd < 1) fill(g, lerp(570, 236, rd), lerp(y - 38 + i * 31, 262 + i * 69, rd), 34, lerp(26, 59, rd), '#00808c', A, 6); }
        if (m1 > 0) { g._ga = A * clamp(m1 * 2 - 1); msym(g, 'v', 907, y + 8, 26, {}); g._ga = 1; }
        if (m2 > 0) { g._ga = A * m2; text(g, '=', 640, y + 12, { size: 34, w: 700, col: C.char, al: 'center' }); g._ga = 1; } }
      const qa = o.rd(3); if (qa > 0.3) { const a = A * clamp((qa - 0.3) / 0.7); for (let i = 0; i < 3; i++) fill(g, 236, 262 + i * 69, 34, 59, '#00808c', a); g._ga = a; msym(g, 'q', 253, 240, 42, { col: C.char }); g._ga = 1; }
      g._ga = A * clamp(o.rd(0) * 3); text(g, 'Reduce (sum)', 253, 512, { size: 36, w: 700, col: '#00808c', al: 'center' }); g._ga = 1; } };
  const st = {}, gates = [0, 1.2, 3.8, 6.2, 7.6, 8.8, 10.0, 11.5];
  return { render, geo,
    reset() { for (const k in st) delete st[k]; }, draw(g, W, H, t, step, ts, dt) {
    g.clearRect(0, 0, W, H); const tg = gates[step]; if (st.T === undefined) st.T = tg;
    st.T = st.T < tg ? Math.min(tg, st.T + dt * (step && st.T < gates[step - 1] - 0.01 ? 7 : 1)) : Math.max(tg, st.T - dt * 4); const T = window.PART_T ?? st.T;
    render(g, { al: 1, cut: ease(T / 1.0), shf: ease(T / 1.0), r1: c => ease((T - 1.3 - c.p * 0.3 - (c.i + c.j) * 0.04) / 1.3), r2: c => ease((T - 3.9 - c.p * 0.28) / 1.3), R: ease((T - 2.6) / 1.0), L: ease((T - 3.9) / 1.2), lane: ease((T - 4.6) / 1.2),
      bc: T > 6.2 ? p => ease((T - 6.4 - p * 0.1) / 0.9) : null, u1: ease((T - 7.7) / 0.9), u2: ease((T - 8.9) / 0.9), rd: p => ease((T - 10.1 - p * 0.1) / 1.0), t });
  } };
})();

/* ───────── charts ───────── */
function chart(el, title, series, ideal) {
  const W = 830, H = 520, L = 96, R = 70, T = 44, B = 70, xs = [8, 16, 32, 64], X = i => L + (W - L - R) * i / 3, Y = v => T + (H - T - B) * (1 - (Math.log2(v) - 1) / 8);
  let s = `<svg viewBox="0 0 ${W} ${H}"><text class="ttl" x="${L}" y="22">${title}</text>`;
  for (let p = 1; p <= 9; p++) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(2 ** p)}" y2="${Y(2 ** p)}"/><text x="${L - 14}" y="${Y(2 ** p) + 7}" text-anchor="end">${2 ** p}</text>`;
  xs.forEach((x, i) => s += `<text x="${X(i)}" y="${H - B + 34}" text-anchor="middle">${x}</text>`);
  s += `<line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">Number of GPUs</text><text transform="translate(26 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Time per rupture (ms)</text>`;
  series.forEach(se => {
    const pts = se.d.map((v, i) => [X(i), Y(v)]), cls = se.fft ? 'fft' : 'base';
    s += `<g class="${cls}">`;
    if (ideal && se.fft) s += `<path class="ln" d="M${pts[0]} L${X(3)},${Y(se.d[0] / 8)}" stroke="#9aa5ab" stroke-width="2.5" stroke-dasharray="3 7" style="stroke-width:2.5"/>`;
    s += `<path class="ln" d="M${pts.map(p => p.join(',')).join(' L')}" stroke="${se.c}" ${se.fft ? '' : 'stroke-dasharray="14 10" style="stroke-width:3.5"'}/>`;
    pts.forEach(p => s += se.fft ? `<circle cx="${p[0]}" cy="${p[1]}" r="9" fill="${se.c}" stroke="#fff" stroke-width="3"/>` : `<rect x="${p[0] - 8}" y="${p[1] - 8}" width="16" height="16" fill="#FBFAF6" stroke="${se.c}" stroke-width="3.5"/>`);
    s += `<text class="eff" x="${X(3) + 16}" y="${pts[3][1] + (se.dy || 7)}" fill="${se.c}">${se.e}</text></g>`;
  });
  el.innerHTML = s + '</svg>';
}
chart($('#chartStrong'), 'Strong scaling (efficiency at 64 GPUs)', [
  { d: [271.22, 136.17, 68.01, 37.51], c: C.blue, e: '90%', dy: -8 }, { d: [240.53, 122.5, 61.62, 30.91], c: C.bo, e: '97%', dy: 22 },
  { d: [34.958, 17.776, 9.183, 5.378], c: C.blue, e: '81%', fft: 1 }, { d: [17.216, 8.737, 4.584, 2.531], c: C.bo, e: '85%', fft: 1 }], true);
chart($('#chartWeak'), 'Weak scaling (efficiency at 64 GPUs)', [
  { d: [251.13, 251.36, 251.28, 251.4], c: C.blue, e: '99.9%', dy: 24 }, { d: [261.63, 261.76, 262.0, 262.44], c: C.bo, e: '99.7%', dy: -10 },
  { d: [22.151, 22.241, 22.435, 23.293], c: C.blue, e: '95%', fft: 1 }, { d: [11.573, 11.801, 11.835, 12.077], c: C.bo, e: '96%', fft: 1 }], false);

/* FK receivers */
(() => { const gq = $('.recv'); if (!gq) return; let s = ''; for (let i = 0; i < 26; i++) s += `<circle cx="${22 + i * 26.2}" cy="120" r="6.5"/>`; gq.innerHTML = s; })();

/* ───────── main loop ───────── */
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  $$('canvas[data-scene]', slides[cur]).forEach(c => {
    const sc = scenes[c.dataset.scene]; if (!sc) return; const g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0); g.globalAlpha = 1; g._ga = 1;
    sc.draw(g, +c.dataset.w, +c.dataset.h, (now - tSlide) / 1000, step, (now - tStep) / 1000, dt);
  });
  requestAnimationFrame(frame);
}
tSlide = tStep = performance.now();
go((parseInt(location.hash.slice(1)) || 1) - 1, 0); apply();
requestAnimationFrame(frame);
window.deck = { go, next, prev, get state() { return { cur, step }; } };
})();

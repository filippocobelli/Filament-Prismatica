/* Strati core v0.1 — lettere con un'illustrazione dentro, a colori per altezza.
   Dal raster (maschera delle lettere + colore di ogni pixel) ai contorni, alle mesh a gradini e al 3MF per Bambu/Orca.
   Ogni colore ha la sua altezza: la stampante cambia filamento solo a quelle quote (pochi cambi, AMS o a mano).
   Usa ClipperLib, libtess e fflate (inclusi da build.py). Nessuna dipendenza dal DOM: si prova anche in Node. */
(function (root) {
'use strict';
const LAYER = 0.2;

// ---------------------------------------------------------------- colori
function srgbLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function rgbToLab(r, g, b) {
  const R = srgbLin(r), G = srgbLin(g), B = srgbLin(b);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B), Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
const hexToRgb = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = (c) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// colori principali (k-means++ in Lab) su campioni [r,g,b]; restituisce [r,g,b] medi
function paletteFrom(samples, k, seed) {
  if (!samples.length) return [[20, 20, 20], [240, 240, 240]].slice(0, k);
  const pts = samples.map(c => rgbToLab(c[0], c[1], c[2]));
  k = Math.max(1, Math.min(k, pts.length));
  const rnd = mulberry32(seed || 11), C = [pts[Math.floor(rnd() * pts.length)].slice()], dd = new Float64Array(pts.length).fill(Infinity);
  while (C.length < k) {
    let sum = 0; const last = C[C.length - 1];
    for (let i = 0; i < pts.length; i++) { dd[i] = Math.min(dd[i], d2(pts[i], last)); sum += dd[i]; }
    let r = rnd() * sum, j = 0; for (; j < pts.length - 1; j++) { r -= dd[j]; if (r <= 0) break; }
    C.push(pts[j].slice());
  }
  const as = new Int32Array(pts.length);
  for (let it = 0; it < 14; it++) {
    for (let i = 0; i < pts.length; i++) { let b = 0, bd = Infinity; for (let c = 0; c < C.length; c++) { const d = d2(pts[i], C[c]); if (d < bd) { bd = d; b = c; } } as[i] = b; }
    const acc = C.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) { const a = acc[as[i]]; a[0] += pts[i][0]; a[1] += pts[i][1]; a[2] += pts[i][2]; a[3]++; }
    acc.forEach((a, c) => { if (a[3]) C[c] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
  const rgb = C.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < pts.length; i++) { const a = rgb[as[i]], s = samples[i]; a[0] += s[0]; a[1] += s[1]; a[2] += s[2]; a[3]++; }
  return rgb.filter(a => a[3]).map(a => [a[0] / a[3], a[1] / a[3], a[2] / a[3]]);
}

// ---------------------------------------------------------------- operazioni su raster
// distanza (in pixel, chamfer 3-4 / 3) di ogni pixel acceso dal pixel spento più vicino
function distInside(mask, w, h) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? INF : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!d[i]) continue;
    let v = d[i];
    v = Math.min(v, x > 0 ? d[i - 1] + 3 : 3, y > 0 ? d[i - w] + 3 : 3, x > 0 && y > 0 ? d[i - w - 1] + 4 : 3, x < w - 1 && y > 0 ? d[i - w + 1] + 4 : 3);
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!d[i]) continue;
    let v = d[i];
    v = Math.min(v, x < w - 1 ? d[i + 1] + 3 : 3, y < h - 1 ? d[i + w] + 3 : 3, x < w - 1 && y < h - 1 ? d[i + w + 1] + 4 : 3, x > 0 && y < h - 1 ? d[i + w - 1] + 4 : 3);
    d[i] = v;
  }
  for (let i = 0; i < w * h; i++) d[i] /= 3;
  return d;
}
// ingrossa la maschera di r pixel (distanza dal pixel acceso più vicino ≤ r)
function dilate(mask, w, h, r) {
  if (r <= 0) return mask;
  const inv = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) inv[i] = mask[i] ? 0 : 1;
  const d = distInside(inv, w, h), out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = mask[i] || d[i] <= r ? 1 : 0;
  return out;
}
// filtro di maggioranza sui colori (finestra quadrata di lato 2r+1, solo dentro la maschera): toglie i dettagli troppo piccoli da stampare
function modeFilter(rank, mask, w, h, k, r) {
  if (r <= 0) return rank;
  const W = w + 1, out = new Uint8Array(rank);
  const integ = [];
  for (let c = 0; c < k; c++) {
    const I = new Int32Array(W * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { const i = y * w + x; row += (mask[i] && rank[i] === c) ? 1 : 0; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
    integ.push(I);
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!mask[i]) continue;
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      let best = rank[i], bn = -1;
      for (let c = 0; c < k; c++) { const I = integ[c]; const n = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]; if (n > bn || (n === bn && c === rank[i])) { bn = n; best = c; } }
      out[i] = best;
    }
  }
  return out;
}
// pezzi staccati della maschera (4-connessi) e loro area in pixel
function components(mask, w, h) {
  const lab = new Int32Array(w * h), sizes = [], st = new Int32Array(w * h);
  let n = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s]) continue;
    n++; let sp = 0, cnt = 0; st[sp++] = s; lab[s] = n;
    while (sp) {
      const i = st[--sp]; cnt++; const x = i % w;
      if (x > 0 && mask[i - 1] && !lab[i - 1]) { lab[i - 1] = n; st[sp++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !lab[i + 1]) { lab[i + 1] = n; st[sp++] = i + 1; }
      if (i >= w && mask[i - w] && !lab[i - w]) { lab[i - w] = n; st[sp++] = i - w; }
      if (i < w * (h - 1) && mask[i + w] && !lab[i + w]) { lab[i + w] = n; st[sp++] = i + w; }
    }
    sizes.push(cnt);
  }
  return { lab, sizes };
}

// ---------------------------------------------------------------- contorni
/* Bordi dei pixel accesi come anelli chiusi (coordinate dei vertici dei pixel, y verso il basso).
   Ogni bordo lascia l'interno a destra; ai vertici "a croce" si gira a destra, così due pixel che si toccano
   solo in diagonale restano separati. Poi si tengono solo gli spigoli e si semplifica (Douglas-Peucker). */
function maskRings(mask, w, h, tol) {
  const W = w + 1, out = new Map(); // vertice → lista direzioni uscenti
  const add = (vx, vy, dir) => { const k = vy * W + vx; const l = out.get(k); if (l) l.push(dir); else out.set(k, [dir]); };
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    if (!on(x, y - 1)) add(x, y, 0);         // sopra: verso +x
    if (!on(x + 1, y)) add(x + 1, y, 1);     // destra: verso +y
    if (!on(x, y + 1)) add(x + 1, y + 1, 2); // sotto: verso -x
    if (!on(x - 1, y)) add(x, y + 1, 3);     // sinistra: verso -y
  }
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], rings = [];
  for (const [startK] of out) {
    let l = out.get(startK);
    while (l && l.length) {
      let k = startK, dir = l.pop(); if (!l.length) out.delete(k);
      const ring = []; let prevDir = -1, guard = 0;
      for (;;) {
        const vx = k % W, vy = (k - vx) / W;
        if (dir !== prevDir) ring.push([vx, vy]);
        prevDir = dir;
        const nk = (vy + DY[dir]) * W + (vx + DX[dir]);
        if (nk === startK && !(out.get(nk) || []).length) break;
        const nl = out.get(nk); if (!nl || !nl.length) break;
        // preferenza: destra, dritto, sinistra
        let pick = -1;
        for (const t of [(dir + 1) & 3, dir, (dir + 3) & 3]) { const j = nl.indexOf(t); if (j >= 0) { pick = j; break; } }
        if (pick < 0) pick = 0;
        dir = nl.splice(pick, 1)[0]; if (!nl.length) out.delete(nk);
        k = nk;
        if (++guard > 4 * w * h + 8) break;
      }
      if (ring.length >= 4) rings.push(tol > 0 ? simplifyRing(ring, tol) : ring);
      l = out.get(startK);
    }
  }
  return rings.filter(r => r.length >= 3);
}
function rdp(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]], t2 = tol * tol;
  while (st.length) {
    const [a, b] = st.pop(); const A = pts[a], B = pts[b], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1e-12;
    let mi = -1, md = t2;
    for (let i = a + 1; i < b; i++) { const P = pts[i]; const t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2)); const ex = A[0] + t * dx - P[0], ey = A[1] + t * dy - P[1]; const d = ex * ex + ey * ey; if (d > md) { md = d; mi = i; } }
    if (mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function simplifyRing(r, tol) {
  if (r.length < 8) return r;
  // spezza l'anello nei due punti più lontani e semplifica le due metà
  let far = 0, fd = -1; for (let i = 1; i < r.length; i++) { const d = (r[i][0] - r[0][0]) ** 2 + (r[i][1] - r[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  const a = rdp(r.slice(0, far + 1), tol), b = rdp(r.slice(far).concat([r[0]]), tol);
  const out = a.slice(0, -1).concat(b.slice(0, -1));
  return out.length >= 3 ? out : r;
}
// due pixel che si toccano solo in diagonale darebbero un vertice condiviso (mesh non chiusa): si riempie l'angolo
function fixDiagonals(m, w, h) {
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x, a = m[i], b = m[i + 1], c = m[i + w], d = m[i + w + 1];
    if (a && d && !b && !c) m[i + 1] = 1; else if (b && c && !a && !d) m[i] = 1;
  }
  return m;
}
// anelli in pixel → ExPolygons in mm (y verso l'alto, centrati), unione Clipper; via le isole sotto minArea mm²
function ringsToExPolys(rings, res, w, h, minArea) {
  const S = 1000, cx = w / 2, cy = h / 2;
  const c = new ClipperLib.Clipper(); c.StrictlySimple = true;
  const paths = rings.map(r => r.map(([x, y]) => ({ X: Math.round((x - cx) * res * S), Y: Math.round((cy - y) * res * S) })));
  c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  const area = (r) => Math.abs(ClipperLib.Clipper.Area(r)) / (S * S);
  return ClipperLib.JS.PolyTreeToExPolygons(tree)
    .filter(e => area(e.outer) >= (minArea || 0))
    .map(e => ({ outer: e.outer.map(q => [q.X / S, q.Y / S]), holes: e.holes.filter(hh => area(hh) >= (minArea || 0) / 4).map(hh => hh.map(q => [q.X / S, q.Y / S])) }));
}

// ---------------------------------------------------------------- mesh
function signedArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function cleanRing(r) {
  const o = [];
  for (const p of r) if (!o.length || Math.hypot(o[o.length - 1][0] - p[0], o[o.length - 1][1] - p[1]) > 1e-4) o.push(p);
  while (o.length > 1 && Math.hypot(o[0][0] - o[o.length - 1][0], o[0][1] - o[o.length - 1][1]) <= 1e-4) o.pop();
  return o;
}
let _tess = null;
function tessellate(rings) {
  if (!_tess) {
    _tess = new libtess.GluTesselator();
    _tess.gluTessCallback(libtess.gluEnum.GLU_TESS_VERTEX_DATA, (data, out) => { out.push(data); });
    _tess.gluTessCallback(libtess.gluEnum.GLU_TESS_BEGIN, () => {});
    _tess.gluTessCallback(libtess.gluEnum.GLU_TESS_ERROR, (e) => { throw new Error('tess ' + e); });
    _tess.gluTessCallback(libtess.gluEnum.GLU_TESS_COMBINE, (c) => [c[0], c[1], c[2], 1]);
    _tess.gluTessCallback(libtess.gluEnum.GLU_TESS_EDGE_FLAG, () => {});
    _tess.gluTessProperty(libtess.gluEnum.GLU_TESS_WINDING_RULE, libtess.windingRule.GLU_TESS_WINDING_ODD);
    _tess.gluTessNormal(0, 0, 1);
  }
  const out = [];
  _tess.gluTessBeginPolygon(out);
  for (const r of rings) { _tess.gluTessBeginContour(); for (const p of r) { const c = [p[0], p[1], 0]; _tess.gluTessVertex(c, c); } _tess.gluTessEndContour(); }
  _tess.gluTessEndPolygon();
  return out;
}
// lastra da z0 a z1 sopra le ExPolygons (chiusa: sopra, sotto e pareti)
function slabMesh(exps, z0, z1) {
  const V = [], T = [], idx = new Map();
  const vid = (x, y, z) => { const k = Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' + z; let i = idx.get(k); if (i === undefined) { i = V.length / 3; V.push(x, y, z); idx.set(k, i); } return i; };
  for (const e of exps) {
    let outer = cleanRing(e.outer); if (outer.length < 3) continue;
    if (signedArea(outer) < 0) outer.reverse();
    const holes = e.holes.map(cleanRing).filter(h => h.length >= 3).map(h => (signedArea(h) > 0 ? h.reverse() : h));
    const rings = [outer, ...holes];
    const tri = tessellate(rings);
    for (let i = 0; i + 2 < tri.length; i += 3) {
      let a = tri[i], b = tri[i + 1], c = tri[i + 2];
      const ar = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (ar < 0) [b, c] = [c, b];
      T.push(vid(a[0], a[1], z1), vid(b[0], b[1], z1), vid(c[0], c[1], z1));
      T.push(vid(a[0], a[1], z0), vid(c[0], c[1], z0), vid(b[0], b[1], z0));
    }
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length];
      const a0 = vid(p[0], p[1], z0), b0 = vid(q[0], q[1], z0), b1 = vid(q[0], q[1], z1), a1 = vid(p[0], p[1], z1);
      T.push(a0, b0, b1, a0, b1, a1);
    }
  }
  return { V, T };
}
const exArea = (exps) => exps.reduce((s, e) => s + Math.abs(signedArea(e.outer)) - e.holes.reduce((t, h) => t + Math.abs(signedArea(h)), 0), 0);

/* Un pezzo pronto da stampare.
   piece = { w, h, res (mm/pixel), mask: Uint8Array, rank: Uint8Array (0 = colore più basso) }
   opt   = { k, base (mm), step (mm), rim (mm), minDetail (mm) }
   → { bands: [{ z0, z1, rank (-1 = corpo), exps, mesh, area }], height } */
function buildBands(piece, opt) {
  const { w, h, res, mask } = piece, k = opt.k;
  let rank = piece.rank;
  const rim = Math.max(0, opt.rim || 0) / res;
  if (rim > 0) {
    const d = distInside(mask, w, h); rank = new Uint8Array(rank);
    for (let i = 0; i < w * h; i++) if (mask[i] && d[i] <= rim) rank[i] = k - 1;
  }
  const tol = 0.6, minA = Math.max(0.05, (opt.minDetail || 0) ** 2 * 0.5);
  const T = snap(opt.base), s = snap(opt.step);
  const bands = [];
  const bodyEx = ringsToExPolys(maskRings(fixDiagonals(new Uint8Array(mask), w, h), w, h, tol), res, w, h, 1);
  bands.push({ z0: 0, z1: T, rank: -1, exps: bodyEx });
  for (let i = 0; i < k; i++) {
    const m = new Uint8Array(w * h); let any = 0;
    for (let j = 0; j < w * h; j++) if (mask[j] && rank[j] >= i) { m[j] = 1; any = 1; }
    if (!any) continue;
    fixDiagonals(m, w, h);
    const ex = ringsToExPolys(maskRings(m, w, h, tol), res, w, h, minA);
    if (ex.length) bands.push({ z0: +(T + i * s).toFixed(3), z1: +(T + (i + 1) * s).toFixed(3), rank: i, exps: ex });
  }
  for (const b of bands) { b.mesh = slabMesh(b.exps, b.z0, b.z1); b.area = exArea(b.exps); }
  return { bands, height: bands[bands.length - 1].z1, rankUsed: rank };
}
const snap = (v) => Math.max(LAYER, Math.round(v / LAYER) * LAYER);

// cambi di filamento: prima del primo strato di ogni banda il cui colore è diverso dal precedente
function colorChanges(bands, colorOfRank, bodyColor) {
  const out = []; let cur = bodyColor;
  for (const b of bands) {
    const c = b.rank < 0 ? bodyColor : colorOfRank(b.rank);
    if (c !== cur) { out.push({ z: +(b.z0 + LAYER).toFixed(3), from: cur, to: c, rank: b.rank }); cur = c; }
  }
  return out;
}

// ---------------------------------------------------------------- 3MF (Bambu Studio / Orca)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (v) => { const r = Math.round(v * 1e4) / 1e4; return Object.is(r, -0) ? '0' : String(r); };
function uuid(n, tag) { const h = (n >>> 0).toString(16).padStart(8, '0'); return h + '-' + tag + '-4c03-9d28-80fed5dfa1dc'; }

/* Impostazioni di progetto per n filamenti partendo dal profilo ufficiale della stampante (processo 0,20 mm Standard).
   Le chiavi dei filamenti con un solo valore diventano liste di n valori. */
function buildConfig(base, colors, opt) {
  const M = JSON.parse(JSON.stringify(base.machine)), P = JSON.parse(JSON.stringify(base.process)), F = JSON.parse(JSON.stringify(base.filament));
  const n = colors.length, diff = { P: new Set(), F: new Set() };
  const setP = (k, v) => { const nv = Array.isArray(P[k]) ? P[k].map(() => String(v)) : String(v); if (JSON.stringify(P[k]) !== JSON.stringify(nv)) { P[k] = nv; diff.P.add(k); } };
  setP('layer_height', LAYER); setP('initial_layer_print_height', LAYER);
  setP('enable_prime_tower', opt.primeTower ? 1 : 0); // senza torre: lo spurgo va nello scivolo, la lettera può usare tutto il piatto
  setP('sparse_infill_density', (opt.infill || 15) + '%');
  setP('wall_loops', 2);
  setP('top_shell_layers', 3); setP('bottom_shell_layers', 3);
  setP('brim_type', 'no_brim');
  if (opt.ironing) { setP('ironing_type', 'top'); }
  const out = Object.assign({}, P, F, M);
  for (const [k, v] of Object.entries(F)) if (Array.isArray(v) && v.length === 1) out[k] = Array(n).fill(v[0]);
  out.filament_colour = colors.slice();
  out.filament_settings_id = Array(n).fill(base.names.filament);
  out.filament_ids = Array(n).fill(base.filament_id);
  out.filament_map = Array(n).fill('1');
  out.filament_self_index = colors.map((_, i) => String(i + 1));
  out.print_settings_id = base.names.process;
  out.printer_settings_id = base.names.machine;
  out.print_compatible_printers = base.print_compatible_printers;
  out.different_settings_to_system = [[...diff.P].join(';'), '', ''];
  out.curr_bed_type = 'Textured PEI Plate';
  out.printer_technology = 'FFF';
  out.from = 'project'; out.name = 'project_settings';
  return out;
}

/* piece3D = { name, bands (da buildBands), colors: ['#hex'...] (filamenti, 1 = corpo), bandFil: fn(rank) → indice filamento 1..n,
              changes (da colorChanges, con to = indice filamento), manual: bool, cx, cy (centro sul piatto) }
   → Uint8Array del file 3MF */
function build3MF(piece, base, opt = {}) {
  const enc = (s) => fflate.strToU8(s), files = {};
  const vols = piece.bands.filter(b => b.mesh.T.length);
  const objId = vols.length + 1;
  const chunks = ['<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n'];
  vols.forEach((b, i) => {
    const { V, T } = b.mesh, id = i + 1, parts = [`  <object id="${id}" p:UUID="${uuid(id << 16, '81cb')}" type="model">\n   <mesh>\n    <vertices>\n`];
    for (let q = 0; q < V.length; q += 3) parts.push(`     <vertex x="${fmt(V[q])}" y="${fmt(V[q + 1])}" z="${fmt(V[q + 2])}"/>\n`);
    parts.push('    </vertices>\n    <triangles>\n');
    for (let q = 0; q < T.length; q += 3) parts.push(`     <triangle v1="${T[q]}" v2="${T[q + 1]}" v3="${T[q + 2]}"/>\n`);
    parts.push('    </triangles>\n   </mesh>\n  </object>\n');
    chunks.push(parts.join(''));
  });
  chunks.push(' </resources>\n <build/>\n</model>\n');
  files['3D/Objects/object_1.model'] = enc(chunks.join(''));
  const today = new Date().toISOString().slice(0, 10), tr = `1 0 0 0 1 0 0 0 1 ${fmt(piece.cx)} ${fmt(piece.cy)} 0`;
  files['3D/3dmodel.model'] = enc(`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
 <metadata name="Application">OrcaSlicer-2.5.1</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="CreationDate">${today}</metadata>
 <metadata name="ModificationDate">${today}</metadata>
 <metadata name="Designer">Strati</metadata>
 <metadata name="Title">${esc(piece.name)}</metadata>
 <resources>
  <object id="${objId}" p:UUID="${uuid(1, '61cb')}" type="model">
   <components>
${vols.map((b, i) => `    <component p:path="/3D/Objects/object_1.model" objectid="${i + 1}" p:UUID="${uuid((1 << 16) | i, 'b206')}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`).join('\n')}
   </components>
  </object>
 </resources>
 <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">
  <item objectid="${objId}" p:UUID="${uuid(objId, 'b1ec')}" transform="${tr}" printable="1"/>
 </build>
</model>
`);
  files['3D/_rels/3dmodel.model.rels'] = enc('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n');
  const thumb = opt.thumbnail;
  files['_rels/.rels'] = enc('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n' + (thumb ? ' <Relationship Target="/Metadata/plate_1.png" Id="rel-2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>\n' : '') + '</Relationships>\n');
  files['[Content_Types].xml'] = enc('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n <Default Extension="png" ContentType="image/png"/>\n <Default Extension="gcode" ContentType="text/x.gcode"/>\n</Types>\n');
  const ms = ['<?xml version="1.0" encoding="UTF-8"?>\n<config>\n', `  <object id="${objId}">\n    <metadata key="name" value="${esc(piece.name)}"/>\n    <metadata key="extruder" value="1"/>\n`];
  vols.forEach((b, i) => ms.push(`    <part id="${i + 1}" subtype="normal_part">\n      <metadata key="name" value="${esc(b.label || ('z ' + b.z0 + '–' + b.z1))}"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n      <metadata key="extruder" value="1"/>\n      <mesh_stat face_count="${b.mesh.T.length / 3}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n    </part>\n`));
  ms.push('  </object>\n  <plate>\n    <metadata key="plater_id" value="1"/>\n    <metadata key="plater_name" value="' + esc(piece.name) + '"/>\n    <metadata key="locked" value="false"/>\n');
  if (thumb) ms.push('    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>\n');
  ms.push(`    <model_instance>\n      <metadata key="object_id" value="${objId}"/>\n      <metadata key="instance_id" value="0"/>\n      <metadata key="identify_id" value="${100 + objId}"/>\n    </model_instance>\n  </plate>\n  <assemble>\n   <assemble_item object_id="${objId}" instance_id="0" transform="${tr}" offset="0 0 0" />\n  </assemble>\n</config>\n`);
  files['Metadata/model_settings.config'] = enc(ms.join(''));
  // cambi di filamento per strato: con l'AMS sono cambi automatici (type 2), a mano sono pause (type 1)
  const cg = ['<?xml version="1.0" encoding="utf-8"?>\n<custom_gcodes_per_layer>\n<plate>\n<plate_info id="1"/>\n'];
  for (const c of piece.changes) {
    if (piece.manual) cg.push(`<layer top_z="${fmt(c.z)}" type="1" extruder="1" color="" extra="" gcode="M400 U1"/>\n`);
    else cg.push(`<layer top_z="${fmt(c.z)}" type="2" extruder="${c.to}" color="${esc(piece.colors[c.to - 1])}" extra="" gcode="tool_change"/>\n`);
  }
  cg.push(`<mode value="${piece.manual ? 'SingleExtruder' : 'MultiAsSingle'}"/>\n</plate>\n</custom_gcodes_per_layer>\n`);
  files['Metadata/custom_gcode_per_layer.xml'] = enc(cg.join(''));
  const cfg = buildConfig(base, piece.manual ? [piece.colors[0]] : piece.colors, opt);
  files['Metadata/project_settings.config'] = enc(JSON.stringify(cfg, null, 4));
  if (thumb) files['Metadata/plate_1.png'] = thumb;
  return { data: fflate.zipSync(files, { level: 6 }), config: cfg, tris: vols.reduce((s, b) => s + b.mesh.T.length / 3, 0) };
}

const api = { fixDiagonals, LAYER, rgbToLab, hexToRgb, rgbToHex, d2, mulberry32, paletteFrom, distInside, dilate, modeFilter, components, maskRings, rdp, simplifyRing, ringsToExPolys, slabMesh, signedArea, buildBands, colorChanges, buildConfig, build3MF, snap, exArea };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.STRATI = api;
})(typeof window !== 'undefined' ? window : globalThis);

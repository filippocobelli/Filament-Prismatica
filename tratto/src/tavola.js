/* Tratto — Tavole tecniche: testo a tratto (Hershey Futura Light), quote, cartiglio, cornice,
   tavola da foto (sagoma + quote automatiche) e tavola da mesh STL/3MF (viste ortogonali + isometrica, linee nascoste).
   Coordinate dei tratti in mm sul foglio, origine in alto a sinistra, y verso il basso. */
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const tL = (it, en) => (root.TRATTO_LANG === 'en' ? en : it);
const TR = root.TR || (isNode ? require('./core.js') : null);
const fflate = root.fflate || (isNode ? require('./vendor/fflate.min.js') : null);
const FONT_SRC = root.TRATTO_FONT || (isNode ? JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'font-futural.json'), 'utf8')) : null);

// ---------------------------------------------------------------- testo a tratto
const GLYPHS = FONT_SRC.map(s => { const [o, d] = s.split('|'); return { adv: 2 * +o, polys: d ? d.split(';').map(pl => pl.split(' ').map(p => p.split(',').map(Number))) : [] }; });
const CAP = 21, BASE = 22; // unità Hershey: altezza maiuscole e linea di base
function glyph(ch) { const c = ch.charCodeAt(0); return GLYPHS[c - 33] || null; }
function textWidth(str, h) {
  const k = h / CAP; let w = 0;
  for (const ch of str) { if (ch === ' ') { w += 12 * k; continue; } if (ch === 'Ø' || ch === '°') { w += (ch === '°' ? 10 : 22) * k; continue; } const g = glyph(ch); w += (g ? g.adv : 16) * k; }
  return w;
}
/* testo: x,y = punto di ancoraggio sulla linea di base; anchor 'l'|'c'|'r'; rot in gradi (0 o 90 antiorario) */
function text(str, x, y, h, anchor = 'l', rot = 0) {
  const k = h / CAP, out = []; str = String(str);
  const W = textWidth(str, h); let cx = anchor === 'c' ? -W / 2 : anchor === 'r' ? -W : 0;
  const a = rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const put = (lx, ly) => [x + lx * ca + ly * sa, y - lx * sa + ly * ca]; // y verso il basso, rotazione antioraria a schermo
  for (const ch of str) {
    if (ch === ' ') { cx += 12 * k; continue; }
    if (ch === 'Ø') { // cerchio con barra
      const r = 8.5 * k, ox = cx + 11 * k, oy = -10.5 * k, c = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24 * Math.PI * 2; c.push(put(ox + r * Math.cos(t), oy + r * Math.sin(t))); }
      out.push(c, [put(ox - 10 * k, oy + 10 * k), put(ox + 10 * k, oy - 10 * k)]); cx += 22 * k; continue;
    }
    if (ch === '°') { const r = 2.5 * k, ox = cx + 5 * k, oy = -18 * k, c = []; for (let i = 0; i <= 12; i++) { const t = i / 12 * Math.PI * 2; c.push(put(ox + r * Math.cos(t), oy + r * Math.sin(t))); } out.push(c); cx += 10 * k; continue; }
    const g = glyph(ch); if (!g) { cx += 16 * k; continue; }
    for (const pl of g.polys) {
      let p = pl.map(([gx, gy]) => put(cx + gx * k, (gy - BASE) * k));
      const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
      const ex = Math.max(...xs) - Math.min(...xs), ey = Math.max(...ys) - Math.min(...ys);
      if (Math.max(ex, ey) < 0.5) { // puntini (: . ;) troppo piccoli per lo slicer: diventano un trattino da 0,6 mm
        const mx = (Math.max(...xs) + Math.min(...xs)) / 2, my = (Math.max(...ys) + Math.min(...ys)) / 2; p = [[mx - 0.3 * ca, my + 0.3 * sa], [mx + 0.3 * ca, my - 0.3 * sa]];
      }
      out.push(p);
    }
    cx += g.adv * k;
  }
  return out;
}
const num = (v) => { const r = Math.round(v * 10) / 10; return (Math.abs(r - Math.round(r)) < 1e-6 ? String(Math.round(r)) : r.toFixed(1)).replace('.', ','); };

// ---------------------------------------------------------------- quote
/* quota lineare tra A e B (punti sul disegno), linea di quota spostata di `off` mm lungo la normale `side` (+1/-1).
   Restituisce i tratti: linee di riferimento, linea di quota con frecce aperte, testo centrato sopra la linea. */
function dim(A, B, off, label, o = {}) {
  const h = o.textH || 3, arrow = o.arrow || 2.2, gap = 1, ext = 1.5;
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const nx = -uy, ny = ux; // normale a sinistra della direzione A→B (y verso il basso)
  const P = [A[0] + nx * off, A[1] + ny * off], Q = [B[0] + nx * off, B[1] + ny * off];
  const s = Math.sign(off) || 1, out = [];
  out.push([[A[0] + nx * gap * s, A[1] + ny * gap * s], [P[0] + nx * ext * s, P[1] + ny * ext * s]]);
  out.push([[B[0] + nx * gap * s, B[1] + ny * gap * s], [Q[0] + nx * ext * s, Q[1] + ny * ext * s]]);
  out.push([P, Q]);
  const ah = (T, dirx, diry) => { const a = 0.35; const c = Math.cos(a), sn = Math.sin(a);
    const r1 = [dirx * c - diry * sn, dirx * sn + diry * c], r2 = [dirx * c + diry * sn, -dirx * sn + diry * c];
    return [[T[0] + r1[0] * arrow, T[1] + r1[1] * arrow], T, [T[0] + r2[0] * arrow, T[1] + r2[1] * arrow]]; };
  out.push(ah(P, ux, uy), ah(Q, -ux, -uy));
  // testo: sopra la linea (lato esterno), leggibile dal basso o da destra
  const mid = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
  let ang = Math.atan2(-uy, ux) * 180 / Math.PI; // angolo a schermo, antiorario
  if (ang > 90.01 || ang <= -90) ang += 180;
  if (ang > 180) ang -= 360;
  const a = ang * Math.PI / 180; const tnx = -Math.sin(a), tny = -Math.cos(a); // "sopra" il testo
  const T = [mid[0] + tnx * 0.8, mid[1] + tny * 0.8];
  out.push(...text(label, T[0], T[1], h, 'c', ang));
  return out;
}
function rect(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]; }
function dashed(paths, dash = 1.6, gap = 1.0) {
  const out = [];
  for (const p of paths) {
    let on = true, left = dash, cur = [p[0]];
    for (let i = 1; i < p.length; i++) {
      let a = p[i - 1]; const b = p[i]; let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (seg > 1e-9) {
        const t = Math.min(left, seg), f = t / seg; const m = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        if (on) cur.push(m);
        seg -= t; left -= t; a = m;
        if (left <= 1e-9) { if (on && cur.length > 1) out.push(cur); on = !on; left = on ? dash : gap; cur = [m]; }
      }
    }
    if (on && cur.length > 1) out.push(cur);
  }
  return out;
}

// ---------------------------------------------------------------- foglio: cornice e cartiglio
/* Restituisce { lines, area } dove area è il rettangolo libero per il disegno. */
function sheet(W, H, o = {}) {
  const lines = [], m = o.frame === false ? 2 : 6;
  if (o.frame !== false) {
    lines.push(rect(m, m, W - 2 * m, H - 2 * m));
    // riferimenti di zona (numeri in alto, lettere a sinistra)
    const nx = Math.max(2, Math.round((W - 2 * m) / 50)), ny = Math.max(2, Math.round((H - 2 * m) / 50));
    for (let i = 1; i < nx; i++) { const x = m + (W - 2 * m) * i / nx; lines.push([[x, m], [x, m + 2]], [[x, H - m], [x, H - m - 2]]); }
    for (let j = 1; j < ny; j++) { const y = m + (H - 2 * m) * j / ny; lines.push([[m, y], [m + 2, y]], [[W - m, y], [W - m - 2, y]]); }
    for (let i = 0; i < nx; i++) lines.push(...text(String(nx - i), m + (W - 2 * m) * (i + 0.5) / nx, m - 1.4, 2.4, 'c'));
    const L = 'ABCDEFGHIJ'; for (let j = 0; j < ny; j++) lines.push(...text(L[ny - 1 - j] || '', m - 3.2, m + (H - 2 * m) * (j + 0.5) / ny + 1.2, 2.4, 'c'));
  }
  let area = { x0: m + 3, y0: m + 3, x1: W - m - 3, y1: H - m - 3 };
  if (o.titleBlock !== false) {
    const bw = Math.min(96, W - 2 * m), bh = 28, bx = W - m - bw, by = H - m - bh;
    lines.push(rect(bx, by, bw, bh));
    const c1 = bx + bw * 0.62, r1 = by + 10, r2 = by + 19;
    lines.push([[bx, r1], [bx + bw, r1]], [[bx, r2], [bx + bw, r2]], [[c1, r1], [c1, by + bh]]);
    const lab = (s, x, y) => lines.push(...text(s, x + 1.2, y + 2.9, 2.1));
    const val = (s, x, y, w, h = 3.2) => { let hh = h; while (textWidth(s, hh) > w - 2.4 && hh > 2.2) hh -= 0.2; lines.push(...text(s, x + 1.2, y + 7.6, hh)); };
    lab(tL('TITOLO', 'TITLE'), bx, by - 0.4); val((o.title || tL('TAVOLA', 'DRAWING')).toUpperCase(), bx, by + 1.2, bw, 3.6);
    lab(tL('MATERIALE', 'MATERIAL'), bx, r1); val((o.material || '-').toUpperCase(), bx, r1, c1 - bx);
    lab(tL('SCALA', 'SCALE'), c1, r1); val(o.scale || '-', c1, r1, bx + bw - c1);
    lab(tL('DISEGNATO DA', 'DRAWN BY'), bx, r2); val((o.author || '-').toUpperCase(), bx, r2 - 0.4, c1 - bx, 3);
    lab(tL('DATA', 'DATE'), c1, r2); val(o.date || new Date().toLocaleDateString(tL('it-IT', 'en-GB')), c1, r2 - 0.4, bx + bw - c1, 3);
    lines.push(...text(tL('QUOTE IN MM', 'DIMENSIONS IN MM'), bx, by - 1.6, 2.2));
    area.blocked = { x0: bx - 3, y0: by - 4, x1: W, y1: H };
    area.titleRect = { x0: bx, y0: by - 4, x1: bx + bw, y1: by + bh };
  }
  area.frame = { x0: m, y0: m, x1: W - m, y1: H - m };
  return { lines, area };
}
/* carta millimetrata dentro la cornice, interrotta sul cartiglio. box = {x0,y0,x1,y1}, hole = rettangolo da saltare */
function grid(box, step = 5, major = 5, hole = null) {
  const minor = [], maj = [];
  const cutV = (x) => !hole || x <= hole.x0 || x >= hole.x1 ? [[box.y0, box.y1]] : [[box.y0, hole.y0]].filter(r => r[1] - r[0] > 0.5);
  const cutH = (y) => !hole || y <= hole.y0 || y >= hole.y1 ? [[box.x0, box.x1]] : [[box.x0, hole.x0]].filter(r => r[1] - r[0] > 0.5);
  let i = 1;
  for (let x = box.x0 + step; x < box.x1 - 0.01; x += step, i++) for (const [a, b] of cutV(x)) (i % major ? minor : maj).push([[x, a], [x, b]]);
  i = 1;
  for (let y = box.y0 + step; y < box.y1 - 0.01; y += step, i++) for (const [a, b] of cutH(y)) (i % major ? minor : maj).push([[a, y], [b, y]]);
  return { minor: TR.orderPaths(minor), major: TR.orderPaths(maj) };
}
const NICE = [10, 5, 4, 2, 1.5, 1, 0.8, 0.5, 0.4, 0.25, 0.2, 0.1, 0.05, 0.04, 0.025, 0.02, 0.01];
function niceScale(s) { for (const n of NICE) if (n <= s + 1e-9) return n; return s; }
function scaleLabel(s) { const f = (v) => String(Math.round(v * 100) / 100).replace('.', ','); return s >= 1 ? f(s) + ':1' : '1:' + f(1 / s); }

// ---------------------------------------------------------------- tavola da foto
/* img: { w, h, rgb: Uint8ClampedArray RGBA }  → maschera, sagoma e dettagli in pixel */
function photoAnalyze(img, o = {}) {
  const { w, h } = img, d = img.rgba, n = w * h;
  // colore di sfondo: mediana dei pixel di bordo
  const bp = []; const push = (i) => bp.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]]);
  for (let x = 0; x < w; x += 2) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y += 2) { push(y * w); push(y * w + w - 1); }
  const med = [0, 1, 2, 3].map(c => bp.map(p => p[c]).sort((a, b) => a - b)[bp.length >> 1]);
  const hasAlpha = med[3] < 128;
  const thr = (o.bgThr ?? 0.12) * 441;
  const m = new Float32Array(n), lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3];
    lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (hasAlpha) m[i] = a > 128 ? 1 : 0;
    else m[i] = a > 128 && Math.hypot(r - med[0], g - med[1], b - med[2]) > thr ? 1 : 0;
  }
  // pulizia: chiusura morfologica leggera + riempimento buchi collegati al bordo
  const mb = blurBin(m, w, h, 2, 0.35);
  const filled = fillHoles(mb, w, h);
  const comp = largestComponents(filled, w, h, o.minFrac ?? 0.02);
  // sagoma (contorno esterno)
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (comp[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  // profilo delle larghezze per riga
  const prof = [];
  for (let y = y0; y <= y1; y++) { let l = -1, r = -1; for (let x = x0; x <= x1; x++) if (comp[y * w + x]) { if (l < 0) l = x; r = x; } prof.push({ y, l, r, w: l < 0 ? 0 : r - l + 1 }); }
  // dettagli interni: bordi (Sobel) dentro la sagoma erosa
  let detail = null;
  if ((o.detail ?? 0) > 0) {
    const er = erode(comp, w, h, 3), e = new Float32Array(n); let mx = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; if (!er[i]) continue;
      const gx = lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1];
      const gy = lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1];
      e[i] = Math.hypot(gx, gy); if (e[i] > mx) mx = e[i];
    }
    if (mx > 0) for (let i = 0; i < n; i++) e[i] /= mx;
    detail = { w, h, d: e };
  }
  return { w, h, mask: comp, bbox: { x0, y0, x1, y1 }, prof, detail };
}
function blurBin(m, w, h, r, t) { const tmp = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x < w + r; x++) { if (x + r < w) s += m[y * w + Math.min(w - 1, x + r)]; if (x - r - 1 >= 0) s -= m[y * w + x - r - 1]; if (x >= 0 && x < w) tmp[y * w + x] = s / (2 * r + 1); } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y < h + r; y++) { if (y + r < h) s += tmp[Math.min(h - 1, y + r) * w + x]; if (y - r - 1 >= 0) s -= tmp[(y - r - 1) * w + x]; if (y >= 0 && y < h) o[y * w + x] = s / (2 * r + 1) > t ? 1 : 0; } }
  return o; }
function fillHoles(m, w, h) { const out = new Uint8Array(w * h).fill(1), st = [];
  const seed = (x, y) => { const i = y * w + x; if (!m[i] && out[i]) { out[i] = 0; st.push(i); } };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); } for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  while (st.length) { const i = st.pop(), x = i % w, y = (i / w) | 0; if (x > 0) seed(x - 1, y); if (x < w - 1) seed(x + 1, y); if (y > 0) seed(x, y - 1); if (y < h - 1) seed(x, y + 1); }
  return out; }
function largestComponents(m, w, h, minFrac) { const lab = new Int32Array(w * h), sizes = [0]; let id = 0;
  for (let i = 0; i < w * h; i++) if (m[i] && !lab[i]) { id++; let sz = 0; const st = [i]; lab[i] = id;
    while (st.length) { const j = st.pop(); sz++; const x = j % w, y = (j / w) | 0; for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (k >= 0 && m[k] && !lab[k]) { lab[k] = id; st.push(k); } }
    sizes.push(sz); }
  const big = Math.max(...sizes); const keep = sizes.map(s => s >= big * minFrac);
  const out = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) if (lab[i] && keep[lab[i]]) out[i] = 1; return out; }
function erode(m, w, h, r) { const o = new Uint8Array(w * h);
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) { let ok = 1; for (let k = -r; k <= r && ok; k++) if (!m[(y + k) * w + x] || !m[y * w + x + k]) ok = 0; o[y * w + x] = ok; }
  return o; }
/* livelli caratteristici: estremi locali del profilo delle larghezze (spalle, colli) */
function featureLevels(prof, nWant) {
  if (!nWant || prof.length < 8) return [];
  const H = prof.length, maxW = Math.max(...prof.map(p => p.w));
  const sm = prof.map((p, i) => { let s = 0, c = 0; for (let k = -3; k <= 3; k++) { const q = prof[i + k]; if (q) { s += q.w; c++; } } return s / c; });
  const cand = [];
  for (let i = 4; i < H - 4; i++) {
    const a = sm[i - 4], b = sm[i], c = sm[i + 4];
    if ((b >= a && b >= c) || (b <= a && b <= c)) {
      // prominenza: differenza con i minimi/massimi nell'intorno
      let lo = b, hi = b; for (let k = Math.max(0, i - H / 6 | 0); k < Math.min(H, i + H / 6 | 0); k++) { lo = Math.min(lo, sm[k]); hi = Math.max(hi, sm[k]); }
      const prom = (b >= a ? b - lo : hi - b) / maxW;
      if (prom > 0.06) cand.push({ i, prom });
    }
  }
  cand.sort((p, q) => q.prom - p.prom);
  const pick = [];
  for (const c of cand) {
    if (Math.abs(prof[c.i].w - maxW) < maxW * 0.02) continue; // la larghezza massima è già quotata in basso
    if (pick.some(p => Math.abs(p.i - c.i) < H * 0.08 || Math.abs(prof[p.i].w - prof[c.i].w) < maxW * 0.04)) continue;
    pick.push(c); if (pick.length >= nWant) break;
  }
  return pick.map(p => prof[p.i]).sort((a, b) => a.y - b.y);
}
/* vista da foto in mm reali: sagoma, dettagli, profilo. realH = altezza reale dell'oggetto (mm) */
function photoViewMM(an, realH, o = {}) {
  const { x0, y0, x1, y1 } = an.bbox, pxH = y1 - y0 + 1, k = realH / pxH;
  const toMM = (p) => [(p[0] - x0) * k, (p[1] - y0) * k];
  const f = new Float32Array(an.w * an.h); for (let i = 0; i < f.length; i++) f[i] = an.mask[i];
  const bl = blurF(f, an.w, an.h);
  const outline = TR.algContours({ w: an.w, h: an.h, d: bl }, an.w, an.h, { levels: 1, threshold: 0.5, blur: 0, minLen: 4, simplify: 0.4 })
    .map(p => TR.simplify(p.map(toMM), realH / 600));
  let details = [];
  if (an.detail) {
    const thr = 1 - (o.detail ?? 0.4) * 0.85;
    details = TR.algCenterline(an.detail, an.w, an.h, { threshold: Math.max(0.08, thr * 0.6), minLen: 6, blur: 0 }).map(p => TR.simplify(p.map(toMM), realH / 250));
  }
  const prof = an.prof.map(p => ({ y: (p.y - y0 + 0.5) * k, l: (p.l - x0) * k, r: (p.r - x0 + 1) * k, w: p.w * k }));
  const W = (x1 - x0 + 1) * k;
  return { W, H: realH, outline, details, prof, feats: featureLevels(prof, o.features ?? 3) };
}
function blurF(f, w, h) { const o = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += f[yy * w + xx]; c++; } } o[y * w + x] = s / c; } return o; }

/* Impagina 1..3 viste da foto sul foglio W×H con quote. views: [{name, view}] (view da photoViewMM, stessa altezza reale) */
function layoutPhoto(views, W, H, o = {}) {
  const sh = sheet(W, H, o), A = sh.area;
  const nF = views[0] ? views[0].view.feats.length : 0, step = 7;
  const padL = 14, padB = 14, padT = 6 + nF * step, padR = 6 + nF * step, gapX = 18;
  const blockedH = A.blocked ? (A.y1 - A.blocked.y0) : 0;
  const totalRealW = views.reduce((s, v) => s + v.view.W, 0), realH = views[0].view.H;
  const availW = (A.x1 - A.x0) - padL - padR - gapX * (views.length - 1) - 4;
  const availH = (A.y1 - A.y0) - padT - padB - blockedH * 0.0 - 4;
  let s = Math.min(availW / totalRealW, availH / realH);
  // il cartiglio occupa l'angolo in basso a destra: se il disegno ci finisce sopra, limita l'altezza
  if (A.blocked) {
    const widthUsed = (k) => padL + padR + gapX * (views.length - 1) + totalRealW * k;
    if (A.x0 + widthUsed(s) > A.blocked.x0) s = Math.min(s, Math.max(((A.blocked.y0 - A.y0) - padT - padB - 12) / realH, 0.01));
  }
  s = o.exactScale ? s : niceScale(s);
  const draw = [], dims = [];
  const usedW = padL + padR + gapX * (views.length - 1) + totalRealW * s;
  const rightLimit = (A.blocked && A.y0 + padT + realH * s + padB > A.blocked.y0) ? A.blocked.x0 : A.x1;
  let x = A.x0 + Math.max(0, ((rightLimit - A.x0) - usedW) / 2) + padL; const yTop = A.y0 + padT;
  const T = (vx, vy, p) => [vx + p[0] * s, vy + p[1] * s];
  views.forEach((v, vi) => {
    const V = v.view, vx = x, vy = yTop;
    for (const p of V.outline) draw.push(p.map(q => T(vx, vy, q)));
    for (const p of V.details) draw.push(p.map(q => T(vx, vy, q)));
    const L = vx, R = vx + V.W * s, B = vy + V.H * s;
    // larghezza totale sotto
    dims.push(...dim([L, B], [R, B], 8, num(V.W), o));
    // altezza totale a sinistra (solo prima vista)
    if (vi === 0) dims.push(...dim([L, B], [L, vy], -9, num(V.H), o));
    // quote di dettaglio: larghezze sopra, altezze a destra (prima vista)
    if (vi === 0) V.feats.forEach((f, fi) => {
      const yy = vy + f.y * s, xl = vx + f.l * s, xr = vx + f.r * s;
      dims.push(...dim([xl, yy], [xr, yy], (vy - yy) - 6 - fi * step, num(f.w), o));
      dims.push(...dim([xr, B], [xr, yy], (R - xr) + 6 + fi * step, num(V.H - f.y), o));
    });
    if (views.length > 1 || o.viewNames) draw.push(...text((v.name || '').toUpperCase(), (L + R) / 2, B + 14, 2.6, 'c'));
    x = R + gapX + (vi === 0 ? padR : 0);
  });
  return { draw, dims, frame: sh.lines, area: A, scale: s, scaleLabel: scaleLabel(s) };
}

// ---------------------------------------------------------------- mesh: STL / 3MF
function parseSTL(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const isBin = u8.length >= 84 && 84 + dv.getUint32(80, true) * 50 === u8.length;
  const P = [];
  if (isBin) { const n = dv.getUint32(80, true); for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; for (let k = 0; k < 9; k++) P.push(dv.getFloat32(o + k * 4, true)); } }
  else { const t = new TextDecoder().decode(u8); const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g; let m; while ((m = re.exec(t))) P.push(+m[1], +m[2], +m[3]); }
  return weld(P);
}
function weld(P) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); }
  const q = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) * 1e-6 || 1e-6;
  const map = new Map(), V = [], T = [];
  for (let i = 0; i < P.length; i += 3) {
    const key = Math.round(P[i] / q) + ',' + Math.round(P[i + 1] / q) + ',' + Math.round(P[i + 2] / q);
    let id = map.get(key); if (id === undefined) { id = V.length / 3; V.push(P[i], P[i + 1], P[i + 2]); map.set(key, id); } T.push(id);
  }
  const T2 = []; for (let i = 0; i < T.length; i += 3) if (T[i] !== T[i + 1] && T[i + 1] !== T[i + 2] && T[i] !== T[i + 2]) T2.push(T[i], T[i + 1], T[i + 2]);
  return { V: new Float64Array(V), T: new Uint32Array(T2) };
}
function parse3MF(buf) {
  const files = fflate.unzipSync(new Uint8Array(buf));
  const dec = (k) => new TextDecoder().decode(files[k]);
  const models = {}; for (const k of Object.keys(files)) if (/\.model$/i.test(k)) models['/' + k.replace(/^\//, '')] = dec(k);
  const mainKey = Object.keys(models).find(k => /3D\/3dmodel\.model$/i.test(k)) || Object.keys(models)[0];
  const objs = {}; // path#id -> { mesh:{V,T}?, comps:[{path,id,tr}] }
  const parseTr = (s) => s ? s.trim().split(/\s+/).map(Number) : [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  for (const [path, xml] of Object.entries(models)) {
    const reObj = /<object\b([^>]*)>([\s\S]*?)<\/object>/g; let m;
    while ((m = reObj.exec(xml))) {
      const id = (/\bid="([^"]+)"/.exec(m[1]) || [])[1]; const body = m[2]; const o = { comps: [] };
      const vs = body.match(/<vertex\b[^>]*>/g);
      if (vs) {
        const V = []; for (const v of vs) { V.push(+/x="([^"]+)"/.exec(v)[1], +/y="([^"]+)"/.exec(v)[1], +/z="([^"]+)"/.exec(v)[1]); }
        const T = []; for (const t of body.match(/<triangle\b[^>]*>/g) || []) T.push(+/v1="(\d+)"/.exec(t)[1], +/v2="(\d+)"/.exec(t)[1], +/v3="(\d+)"/.exec(t)[1]);
        o.mesh = { V, T };
      }
      const reC = /<component\b([^>]*)\/?>/g; let c;
      while ((c = reC.exec(body))) { const a = c[1]; o.comps.push({ path: ((/p:path="([^"]+)"/.exec(a) || [])[1]) || path, id: (/objectid="([^"]+)"/.exec(a) || [])[1], tr: parseTr((/transform="([^"]+)"/.exec(a) || [])[1]) }); }
      objs[path + '#' + id] = o;
    }
  }
  const mul = (a, b) => { // 3x4 (riga: m00 m01 m02 m10 ... tx ty tz nella convenzione 3MF: x' = x*m00 + y*m10 + z*m20 + m30)
    const A = [[a[0], a[1], a[2]], [a[3], a[4], a[5]], [a[6], a[7], a[8]], [a[9], a[10], a[11]]], B = [[b[0], b[1], b[2]], [b[3], b[4], b[5]], [b[6], b[7], b[8]], [b[9], b[10], b[11]]];
    const r = []; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) r.push(A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j] + (i === 3 ? B[3][j] : 0)); return r; };
  const P = [];
  const emit = (key, tr, depth) => { const o = objs[key]; if (!o || depth > 8) return;
    if (o.mesh) { const { V, T } = o.mesh; for (const vi of T) { const x = V[vi * 3], y = V[vi * 3 + 1], z = V[vi * 3 + 2]; P.push(x * tr[0] + y * tr[3] + z * tr[6] + tr[9], x * tr[1] + y * tr[4] + z * tr[7] + tr[10], x * tr[2] + y * tr[5] + z * tr[8] + tr[11]); } }
    for (const c of o.comps) emit(c.path + '#' + c.id, mul(c.tr, tr), depth + 1); };
  const main = models[mainKey]; const reI = /<item\b([^>]*)\/?>/g; let it, any = false;
  while ((it = reI.exec(main))) { any = true; const a = it[1]; emit(mainKey + '#' + (/objectid="([^"]+)"/.exec(a) || [])[1], parseTr((/transform="([^"]+)"/.exec(a) || [])[1]), 0); }
  if (!any) for (const k of Object.keys(objs)) if (k.startsWith(mainKey)) emit(k, parseTr(), 0);
  if (!P.length) throw new Error(tL('Nessuna mesh trovata nel 3MF', 'No mesh found in the 3MF'));
  return weld(P);
}

/* edge topology */
function meshEdges(mesh) {
  const { V, T } = mesh, nT = T.length / 3, N = new Float64Array(nT * 3);
  for (let f = 0; f < nT; f++) {
    const a = T[f * 3] * 3, b = T[f * 3 + 1] * 3, c = T[f * 3 + 2] * 3;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1;
    N[f * 3] = nx / L; N[f * 3 + 1] = ny / L; N[f * 3 + 2] = nz / L;
  }
  const map = new Map(), E = [];
  for (let f = 0; f < nT; f++) for (let k = 0; k < 3; k++) {
    let a = T[f * 3 + k], b = T[f * 3 + (k + 1) % 3]; if (a > b) [a, b] = [b, a];
    const key = a * 4294967296 + b; let e = map.get(key);
    if (e === undefined) { e = E.length; E.push({ a, b, f: [f] }); map.set(key, e); } else E[e].f.push(f);
  }
  return { N, E };
}
/* vista ortografica: dir = direzione di vista (verso la scena), u = destra, v = alto (vettori unitari) */
function projectView(mesh, topo, dir, u, v, o = {}) {
  const { V, T } = mesh, nV = V.length / 3, { N, E } = topo;
  const sx = new Float64Array(nV), sy = new Float64Array(nV), sz = new Float64Array(nV);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < nV; i++) { const x = V[i * 3], y = V[i * 3 + 1], z = V[i * 3 + 2];
    sx[i] = x * u[0] + y * u[1] + z * u[2]; sy[i] = x * v[0] + y * v[1] + z * v[2]; sz[i] = x * dir[0] + y * dir[1] + z * dir[2];
    x0 = Math.min(x0, sx[i]); x1 = Math.max(x1, sx[i]); y0 = Math.min(y0, sy[i]); y1 = Math.max(y1, sy[i]); z0 = Math.min(z0, sz[i]); z1 = Math.max(z1, sz[i]); }
  const Wd = x1 - x0 || 1, Hd = y1 - y0 || 1, R = (o.res || 1400) / Math.max(Wd, Hd);
  const bw = Math.ceil(Wd * R) + 3, bh = Math.ceil(Hd * R) + 3, zb = new Float32Array(bw * bh).fill(Infinity);
  const PX = (i) => (sx[i] - x0) * R + 1, PY = (i) => (y1 - sy[i]) * R + 1;
  // z-buffer (profondità: più piccolo = più vicino)
  for (let f = 0; f < T.length / 3; f++) {
    const a = T[f * 3], b = T[f * 3 + 1], c = T[f * 3 + 2];
    const ax = PX(a), ay = PY(a), bx = PX(b), by = PY(b), cx = PX(c), cy = PY(c);
    const minx = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxx = Math.min(bw - 1, Math.ceil(Math.max(ax, bx, cx)));
    const miny = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxy = Math.min(bh - 1, Math.ceil(Math.max(ay, by, cy)));
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, w3 = 1 - w1 - w2;
      if (w1 < -1e-4 || w2 < -1e-4 || w3 < -1e-4) continue;
      const z = w1 * sz[a] + w2 * sz[b] + w3 * sz[c]; const k = y * bw + x; if (z < zb[k]) zb[k] = z;
    }
  }
  const cosT = Math.cos((o.crease ?? 30) * Math.PI / 180), eps = (z1 - z0) * 0.004 + 1.5 / R;
  const vis = [], hid = [];
  const zmax3 = (x, y) => { let m = -Infinity; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < bw && yy < bh) { const z = zb[yy * bw + xx]; m = Math.max(m, z === Infinity ? 1e30 : z); } } return m; };
  for (const e of E) {
    let keep = false;
    if (e.f.length === 1) keep = true;
    else if (e.f.length >= 2) {
      const f1 = e.f[0], f2 = e.f[1];
      const d1 = N[f1 * 3] * dir[0] + N[f1 * 3 + 1] * dir[1] + N[f1 * 3 + 2] * dir[2], d2 = N[f2 * 3] * dir[0] + N[f2 * 3 + 1] * dir[1] + N[f2 * 3 + 2] * dir[2];
      const dot = N[f1 * 3] * N[f2 * 3] + N[f1 * 3 + 1] * N[f2 * 3 + 1] + N[f1 * 3 + 2] * N[f2 * 3 + 2];
      if (dot < cosT) keep = true; else if ((d1 < 0) !== (d2 < 0)) keep = true;
    }
    if (!keep) continue;
    const ax = PX(e.a), ay = PY(e.a), bx = PX(e.b), by = PY(e.b), L = Math.hypot(bx - ax, by - ay);
    if (L < 0.3) continue;
    const n = Math.max(2, Math.ceil(L / 0.7)); let run = null, runVis = null;
    for (let s = 0; s <= n; s++) {
      const t = s / n, px = ax + (bx - ax) * t, py = ay + (by - ay) * t, z = sz[e.a] + (sz[e.b] - sz[e.a]) * t;
      const isVis = z <= zmax3(Math.floor(px), Math.floor(py)) + eps;
      const pt = [sx[e.a] + (sx[e.b] - sx[e.a]) * t - x0, y1 - (sy[e.a] + (sy[e.b] - sy[e.a]) * t)];
      if (runVis === null || isVis !== runVis) { if (run && run.length > 1) (runVis ? vis : hid).push(run); run = run ? [run[run.length - 1], pt] : [pt]; runVis = isVis; }
      else run.push(pt);
    }
    if (run && run.length > 1) (runVis ? vis : hid).push(run);
  }
  const clean = (ps) => TR.chainPaths(ps.map(p => [p[0], p[p.length - 1]]), Math.max(Wd, Hd) * 2e-4).map(p => TR.simplify(p, Math.max(Wd, Hd) * 1e-4));
  return { W: Wd, H: Hd, vis: clean(vis), hid: clean(hid) };
}
/* viste standard: up = 'z' | 'y'. Metodo europeo (primo diedro): pianta sotto, vista da sinistra a destra. */
function standardViews(mesh, o = {}) {
  const topo = meshEdges(mesh);
  const Zup = (o.up || 'z') === 'z';
  // assi del mondo: X destra, Y profondità (verso il retro), Z alto
  const X = [1, 0, 0], Y = Zup ? [0, 1, 0] : [0, 0, -1], Z = Zup ? [0, 0, 1] : [0, 1, 0];
  const neg = (a) => a.map(x => -x);
  const opt = { crease: o.crease, res: o.res };
  const front = projectView(mesh, topo, Y, X, Z, opt);              // dal davanti (guardo verso +Y)
  const top = projectView(mesh, topo, neg(Z), X, Y, opt);           // dall'alto: su = retro
  const left = projectView(mesh, topo, X, neg(Y), Z, opt);          // da sinistra (guardo verso +X): destra = -Y
  const views = { front, top, left };
  if (o.iso !== false) {
    const dir = norm(add(add(scale(X, -1), Y), scale(Z, -1)));
    const u = norm(add(X, Y)); const v = norm(cross(u, dir));
    views.iso = projectView(mesh, topo, dir, u, v, opt); views.iso.hid = [];
  }
  return views;
}
const add = (a, b) => a.map((x, i) => x + b[i]), scale = (a, k) => a.map(x => x * k), norm = (a) => { const L = Math.hypot(...a) || 1; return a.map(x => x / L); }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* impaginazione delle viste da mesh */
function layoutMesh(views, W, H, o = {}) {
  const sh = sheet(W, H, o), A = sh.area, f = views.front, t = views.top, l = views.left, iso = views.iso;
  const dimSp = 13, gap = 10;
  const american = o.method === 'us';
  const availW = (A.x1 - A.x0) - 2 * dimSp - gap, availH = (A.y1 - A.y0) - 2 * dimSp - gap;
  let s = Math.min(availW / (f.W + l.W), availH / (f.H + t.H));
  s = niceScale(s * 0.98);
  const draw = [], hidden = [], dims = [];
  const cellW1 = f.W * s, cellH1 = f.H * s;
  const ox = A.x0 + dimSp, oy = A.y0 + dimSp;
  const place = (view, x, y, sc) => { for (const p of view.vis) draw.push(p.map(q => [x + q[0] * sc, y + q[1] * sc])); if (o.hidden !== false) for (const p of view.hid) hidden.push(p.map(q => [x + q[0] * sc, y + q[1] * sc])); };
  const fx = ox, fy = american ? oy + t.H * s + gap + dimSp * 0.6 : oy;
  const tx = fx, ty = american ? oy : fy + cellH1 + gap + dimSp * 0.6;
  const lx = fx + cellW1 + gap + dimSp * 0.6, ly = fy;
  const sideX = american ? lx : lx; // in metodo americano la vista da destra va a destra: usiamo la stessa vista specchiata
  place(f, fx, fy, s);
  place(t, tx, ty, s);
  if (american) { const lv = { W: l.W, H: l.H, vis: l.vis.map(p => p.map(q => [l.W - q[0], q[1]])), hid: l.hid.map(p => p.map(q => [l.W - q[0], q[1]])) }; place(lv, sideX, ly, s); }
  else place(l, sideX, ly, s);
  // quote d'ingombro
  dims.push(...dim([fx, fy + f.H * s], [fx + f.W * s, fy + f.H * s], 7, num(f.W), o));
  dims.push(...dim([fx, fy + f.H * s], [fx, fy], -8, num(f.H), o));
  dims.push(...dim([tx, ty + t.H * s], [tx, ty], -8, num(t.H), o));
  dims.push(...dim([sideX, ly + l.H * s], [sideX + l.W * s, ly + l.H * s], 7, num(l.W), o));
  // isometrica nell'angolo libero
  if (iso) {
    let ix0 = sideX, iy0 = ty, ix1 = A.x1, iy1 = A.blocked ? A.blocked.y0 - 2 : A.y1;
    if (iy1 - iy0 < 30) { iy0 = ly + l.H * s + 14; }
    const si = Math.min((ix1 - ix0) / iso.W, (iy1 - iy0) / iso.H) * 0.9;
    if (si > 0) place({ W: iso.W, H: iso.H, vis: iso.vis, hid: [] }, ix0 + ((ix1 - ix0) - iso.W * si) / 2, iy0 + ((iy1 - iy0) - iso.H * si) / 2, si);
  }
  return { draw, hidden: dashed(hidden), dims, frame: sh.lines, area: A, scale: s, scaleLabel: scaleLabel(s) };
}

const TAV = { text, textWidth, dim, sheet, grid, dashed, num, niceScale, scaleLabel, photoAnalyze, photoViewMM, layoutPhoto, parseSTL, parse3MF, meshEdges, projectView, standardViews, layoutMesh, weld };
if (isNode) module.exports = TAV; else root.TAV = TAV;
})(typeof window !== 'undefined' ? window : globalThis);

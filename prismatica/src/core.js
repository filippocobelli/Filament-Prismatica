// ===== Prismatica core: geometria pura (nessuna dipendenza dal DOM) =====
// triangolazione iniettata: TRI(contour:[[x,y]], holes:[[[x,y]]]) -> [[i,j,k]]
const SQ3 = Math.sqrt(3);

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sideFromCount(W, H, border, count) {
  const A = Math.max(1, (W - 2 * border) * (H - 2 * border));
  return Math.sqrt(A / (count * SQ3 / 4));
}

const keyOf = (p) => p[0].toFixed(4) + ',' + p[1].toFixed(4);
const centroidOf = (pts) => { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; };
function areaOf(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }

// ---------- reticolo ----------
function buildLayout({ W, H, s, border }) {
  const hrow = s * SQ3 / 2;
  const innerW = W - 2 * border, innerH = H - 2 * border;
  const nRows = Math.max(1, Math.floor(innerH / hrow + 1e-9));
  const nPer = Math.max(1, Math.floor(2 * innerW / s + 1e-9) - 1);
  const imax = nPer + 1;
  const Lw = imax * s / 2, Lh = nRows * hrow;
  const ox = (W - Lw) / 2, oy = (H - Lh) / 2;
  const P = (i, r) => [ox + i * s / 2, oy + r * hrow];
  const cells = [], fillers = [];
  for (let r = 0; r < nRows; r++) {
    for (let j = 0; j < nPer; j++) {
      const up = (j + r) % 2 === 0;
      const verts = up ? [P(j, r), P(j + 2, r), P(j + 1, r + 1)] : [P(j + 1, r), P(j + 2, r + 1), P(j, r + 1)];
      cells.push({ row: r, j, up, verts, c: centroidOf(verts) });
    }
    if (r % 2 === 0) fillers.push([P(0, r), P(1, r + 1), P(0, r + 1)]);
    else fillers.push([P(0, r), P(1, r), P(0, r + 1)]);
    const jl = nPer - 1;
    if ((jl + r) % 2 === 0) fillers.push([P(imax, r), P(imax, r + 1), P(imax - 1, r + 1)]);
    else fillers.push([P(imax - 1, r), P(imax, r), P(imax, r + 1)]);
  }
  // numerazione: dall'alto a sinistra, riga per riga
  cells.sort((a, b) => (b.row - a.row) || (a.j - b.j));
  cells.forEach((c, i) => { c.id = i + 1; c.rowTop = nRows - 1 - c.row; });

  // bordo
  const borders = [];
  const eps = 1e-6;
  const latLoops = unionBoundary([...cells.map(c => c.verts), ...fillers], false);
  const top = oy + Lh, right = ox + Lw;
  if (ox > 0.05 || oy > 0.05) {
    for (const loop of latLoops) for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      let a2, b2;
      if (Math.abs(a[1] - oy) < eps && Math.abs(b[1] - oy) < eps) { if (oy < 0.05) continue; a2 = [a[0], 0]; b2 = [b[0], 0]; }
      else if (Math.abs(a[1] - top) < eps && Math.abs(b[1] - top) < eps) { if (oy < 0.05) continue; a2 = [a[0], H]; b2 = [b[0], H]; }
      else if (Math.abs(a[0] - ox) < eps && Math.abs(b[0] - ox) < eps) { if (ox < 0.05) continue; a2 = [0, a[1]]; b2 = [0, b[1]]; }
      else if (Math.abs(a[0] - right) < eps && Math.abs(b[0] - right) < eps) { if (ox < 0.05) continue; a2 = [W, a[1]]; b2 = [W, b[1]]; }
      else continue;
      borders.push([a2, b2, b, a]);
    }
    if (ox > 0.05 && oy > 0.05) {
      borders.push([[0, 0], [ox, 0], [ox, oy], [0, oy]]);
      borders.push([[right, 0], [W, 0], [W, oy], [right, oy]]);
      borders.push([[right, top], [W, top], [W, H], [right, H]]);
      borders.push([[0, top], [ox, top], [ox, H], [0, H]]);
    }
  }
  return { W, H, s, hrow, nRows, nPer, ox, oy, Lw, Lh, cells, fillers, borders };
}

// contorno dell'unione di poligoni CCW che condividono i lati
function unionBoundary(polys, simplify = true) {
  const pts = new Map(), edges = new Map();
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ka = keyOf(a), kb = keyOf(b);
    if (ka === kb) continue;
    pts.set(ka, a); pts.set(kb, b);
    const rev = kb + '|' + ka;
    if (edges.has(rev)) edges.delete(rev); else edges.set(ka + '|' + kb, [ka, kb]);
  }
  const next = new Map();
  for (const [, [ka, kb]] of edges) { if (!next.has(ka)) next.set(ka, []); next.get(ka).push(kb); }
  const loops = [];
  for (;;) {
    let start = null;
    for (const [k, arr] of next) if (arr.length) { start = k; break; }
    if (start === null) break;
    const loop = []; let cur = start, guard = 0;
    for (;;) {
      loop.push(pts.get(cur));
      const arr = next.get(cur);
      if (!arr || !arr.length) break;
      cur = arr.pop();
      if (cur === start || ++guard > 1e6) break;
    }
    loops.push(simplify ? removeCollinear(loop) : loop);
  }
  return loops.filter(l => l.length >= 3);
}

function removeCollinear(loop) {
  let out = loop.slice(), changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const p = out[(i - 1 + out.length) % out.length], q = out[i], r = out[(i + 1) % out.length];
      const cr = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
      const dot = (q[0] - p[0]) * (r[0] - q[0]) + (q[1] - p[1]) * (r[1] - q[1]);
      if (Math.abs(cr) < 1e-7 && dot > 0) { out.splice(i, 1); changed = true; break; }
    }
  }
  return out;
}

// ---------- utilità poligoni ----------
function insetConvex(poly, d) { // poligono regolare/convesso centrato: inset approssimato via scala sul centro (esatto per triangolo equilatero)
  const c = centroidOf(poly);
  const rin = Math.min(...poly.map((p, i) => distToLine(c, p, poly[(i + 1) % poly.length])));
  const k = (rin - d) / rin;
  return poly.map(p => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]);
}
function distToLine(c, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  return Math.abs((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / L;
}
function chamferPoly(poly, c) {
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const v = poly[i], p = poly[(i - 1 + n) % n], q = poly[(i + 1) % n];
    const dp = [p[0] - v[0], p[1] - v[1]], lp = Math.hypot(...dp);
    const dq = [q[0] - v[0], q[1] - v[1]], lq = Math.hypot(...dq);
    out.push([v[0] + dp[0] / lp * c, v[1] + dp[1] / lp * c]);
    out.push([v[0] + dq[0] / lq * c, v[1] + dq[1] / lq * c]);
  }
  return out;
}
function rayDist(poly, d) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const ex = q[0] - p[0], ey = q[1] - p[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (p[0] * ey - p[1] * ex) / den;
    const u = (p[0] * d[1] - p[1] * d[0]) / den;
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return best === Infinity ? 0 : best;
}
function insideConvex(poly, pt, margin) { // poly CCW
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey);
    const cr = (ex * (pt[1] - a[1]) - ey * (pt[0] - a[0])) / L;
    if (cr < margin) return false;
  }
  return true;
}

// ---------- scrittura triangoli ----------
function T(out, a, b, c) { out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
function face(out, contour, holes, z, up, TRI) {
  const all = contour.concat(...holes);
  const tris = TRI(contour, holes);
  let tot = 0;
  for (const [i, j, k] of tris) { const a = all[i], b = all[j], c = all[k]; tot += (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
  const flip = (tot > 0) !== up; // earcut produce triangoli con verso coerente: si gira tutto insieme
  for (const [i, j, k] of tris) {
    if (i === j || j === k || i === k) continue;
    const a = all[i], b = all[j], c = all[k];
    if (!flip) T(out, [a[0], a[1], z], [b[0], b[1], z], [c[0], c[1], z]);
    else T(out, [a[0], a[1], z], [c[0], c[1], z], [b[0], b[1], z]);
  }
}
function walls(out, loop, z0, z1) { // normale a destra del verso del loop
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const a0 = [a[0], a[1], z0], b0 = [b[0], b[1], z0], b1 = [b[0], b[1], z1], a1 = [a[0], a[1], z1];
    T(out, a0, b0, b1); T(out, a0, b1, a1);
  }
}
function prism(out, outer, holes, z0, z1, TRI) { // outer CCW, holes CW
  face(out, outer, holes, z0, false, TRI);
  face(out, outer, holes, z1, true, TRI);
  walls(out, outer, z0, z1);
  for (const h of holes) walls(out, h, z0, z1);
}

// ---------- cifre a 7 segmenti (incise, specchiate) ----------
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function digitRects(str, poly, minH) {
  const n = str.length;
  const fits = (Hh) => {
    const Wd = 0.62 * Hh, gp = 0.28 * Hh, Wt = n * Wd + (n - 1) * gp, m = 0.7;
    const bx = Wt / 2, by = Hh / 2;
    return [[-bx, -by], [bx, -by], [bx, by], [-bx, by]].every(p => insideConvex(poly, p, m));
  };
  let lo = 0, hi = 30;
  for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  const Hh = Math.min(lo, 7);
  if (Hh < minH) return null;
  const Wd = 0.62 * Hh, gp = 0.28 * Hh, Wt = n * Wd + (n - 1) * gp;
  const t = Math.max(0.5, 0.15 * Hh), sg = Math.max(0.3, 0.06 * Hh);
  const rects = [];
  for (let k = 0; k < n; k++) {
    const cx = -Wt / 2 + Wd / 2 + k * (Wd + gp);
    const w2 = Wd / 2, h2 = Hh / 2;
    const R = {
      a: [-w2 + t + sg, h2 - t, w2 - t - sg, h2],
      g: [-w2 + t + sg, -t / 2, w2 - t - sg, t / 2],
      d: [-w2 + t + sg, -h2, w2 - t - sg, -h2 + t],
      f: [-w2, sg / 2, -w2 + t, h2 - 0.35 * t],
      b: [w2 - t, sg / 2, w2, h2 - 0.35 * t],
      e: [-w2, -h2 + 0.35 * t, -w2 + t, -sg / 2],
      c: [w2 - t, -h2 + 0.35 * t, w2, -sg / 2],
    };
    for (const ch of SEG[str[k]] || '') {
      let [x0, y0, x1, y1] = R[ch];
      const jx = ('abcdefg'.indexOf(ch) + 1) * 0.009, jy = (k * 7 + 'abcdefg'.indexOf(ch) + 1) * 0.006; // evita lati collineari
      x0 += jx; x1 += jx; y0 += jy; y1 += jy;
      if (x1 - x0 < 0.2 || y1 - y0 < 0.2) continue;
      // specchio in X: leggibile guardando il pezzo da sotto
      const X0 = -(cx + x1), X1 = -(cx + x0);
      rects.push([[X0, y0], [X0, y1], [X1, y1], [X1, y0]]); // CW
    }
  }
  return rects;
}

// ---------- profili ----------
const PROFILES = {
  corno: { g: v => v, f: v => Math.pow(v, 2.2) },
  piramide: { g: v => v, f: v => v },
  cupola: { g: v => v, f: v => 1 - Math.pow(1 - v, 2.2) },
  spillo: { g: v => 1 - Math.pow(1 - v, 3), f: v => v },
  pinna: { g: v => Math.sin(v * Math.PI / 2), f: v => Math.pow(v, 1.6) },
  piatto: null,
};

// ---------- pezzo ----------
// cell: {verts, c}; o: parametri
function buildPiece(cell, o, TRI) {
  const out = [];
  const c = cell.c;
  const V = cell.verts.map(v => [v[0] - c[0], v[1] - c[1]]);
  const F = insetConvex(V, o.gapF / 2);
  let bottom, zPlugTop = 0;
  const Z0 = (o.plug ? o.plugH : 0) + o.flangeT;
  if (o.plug) {
    const Pt = insetConvex(V, o.rib / 2 + o.tol);
    bottom = chamferPoly(Pt, o.chamfer);
    zPlugTop = o.plugH;
  } else bottom = F;
  let holes = [];
  if (o.engrave && o.number != null) {
    const r = digitRects(String(o.number), bottom, o.minDigit || 2.4);
    if (r) holes = r;
  }
  face(out, bottom, holes, 0, false, TRI);
  for (const h of holes) {
    walls(out, h, 0, o.engraveDepth);
    face(out, h, [], o.engraveDepth, false, TRI);
  }
  if (o.plug) {
    walls(out, bottom, 0, zPlugTop);
    face(out, F, [bottom.slice().reverse()], zPlugTop, false, TRI);
    walls(out, F, zPlugTop, Z0);
  } else {
    walls(out, F, 0, Z0);
  }
  // sommità
  const prof = PROFILES[o.shape];
  if (!prof || o.h < 0.05) {
    face(out, F, [], Z0, true, TRI);
  } else {
    let d = o.dir || [0, 0];
    const L = Math.hypot(d[0], d[1]);
    let apex = [0, 0];
    if (L > 1e-9 && o.offset > 0) { d = [d[0] / L, d[1] / L]; const k = Math.min(0.97, o.offset) * rayDist(F, d); apex = [d[0] * k, d[1] * k]; }
    const m = o.segs || 14;
    for (let i = 0; i < 3; i++) {
      const A = F[i], B = F[(i + 1) % 3];
      let prevL = null, prevR = null;
      for (let l = 0; l <= m; l++) {
        const v = l / m, gv = l === m ? 1 : prof.g(v), fv = l === m ? 1 : prof.f(v);
        const z = Z0 + o.h * fv;
        const Lp = [A[0] + (apex[0] - A[0]) * gv, A[1] + (apex[1] - A[1]) * gv, z];
        const Rp = [B[0] + (apex[0] - B[0]) * gv, B[1] + (apex[1] - B[1]) * gv, z];
        if (prevL) {
          T(out, prevL, prevR, Rp);
          if (l < m) T(out, prevL, Rp, Lp);
        }
        prevL = Lp; prevR = Rp;
      }
    }
  }
  return out;
}

function transformTris(src, dx, dy, dz, rot, dst) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i], y = src[i + 1];
    dst.push(x * cs - y * sn + dx, x * sn + y * cs + dy, src[i + 2] + dz);
  }
  return dst;
}

// ---------- telaio ----------
function tileFrame(L, bedU, bedV) {
  const elems = [];
  for (const c of L.cells) elems.push({ poly: c.verts, c: c.c, cell: c });
  for (const f of L.fillers) elems.push({ poly: f, c: centroidOf(f) });
  for (const b of L.borders) elems.push({ poly: b, c: centroidOf(b) });
  for (const e of elems) { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of e.poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } e.bb = [x0, y0, x1, y1]; }
  const half = L.s / 2;
  function cutsX(n) { const cs = []; for (let k = 1; k < n; k++) { let m = Math.round((k * L.W / n - L.ox) / half); m = Math.max(1, Math.min(L.nPer - 1, m)); cs.push(L.ox + (m + 0.5) * half); } return [...new Set(cs)].sort((a, b) => a - b); }
  function cutsY(n) { const cs = []; for (let k = 1; k < n; k++) { let m = Math.round((k * L.H / n - L.oy) / L.hrow); m = Math.max(1, Math.min(L.nRows - 1, m)); cs.push(L.oy + m * L.hrow); } return [...new Set(cs)].sort((a, b) => a - b); }
  const idx = (cs, v) => { let i = 0; while (i < cs.length && v > cs[i]) i++; return i; };
  function extents(cs, axis) {
    const ext = cs.map(() => [Infinity, -Infinity]); ext.push([Infinity, -Infinity]);
    for (const e of elems) { const i = idx(cs, e.c[axis]); ext[i][0] = Math.min(ext[i][0], e.bb[axis]); ext[i][1] = Math.max(ext[i][1], e.bb[axis + 2]); }
    return Math.max(...ext.map(x => x[1] - x[0]));
  }
  let cx = [], cy = [];
  for (let n = 1; n <= 80; n++) { cx = cutsX(n); if (extents(cx, 0) <= bedU || n === 80) break; }
  for (let n = 1; n <= 80; n++) { cy = cutsY(n); if (extents(cy, 1) <= bedV || n === 80) break; }
  const nc = cx.length + 1, nr = cy.length + 1;
  const tiles = [];
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) tiles.push({ col: c, row: r, elems: [] });
  for (const e of elems) { const c = idx(cx, e.c[0]), r = idx(cy, e.c[1]); tiles[r * nc + c].elems.push(e); }
  const res = tiles.filter(t => t.elems.length);
  // etichette: riga dall'alto
  for (const t of res) { t.label = 'T' + String.fromCharCode(65 + (nr - 1 - t.row)) + (t.col + 1); }
  return { tiles: res, nc, nr, fits: extents(cx, 0) <= bedU && extents(cy, 1) <= bedV };
}

function buildFrameTile(tile, o, TRI) {
  const out = [], z0 = 0, z1 = o.frameT;
  const fan = (poly, z, up) => { for (let i = 1; i < poly.length - 1; i++) { const a = [poly[0][0], poly[0][1], z], b = [poly[i][0], poly[i][1], z], c = [poly[i + 1][0], poly[i + 1][1], z]; if (up) T(out, a, b, c); else T(out, a, c, b); } };
  for (const e of tile.elems) {
    if (e.cell) {
      const O = e.cell.verts, I = insetConvex(O, o.rib / 2);
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        for (const [z, up] of [[z1, true], [z0, false]]) {
          const Oi = [O[i][0], O[i][1], z], Oj = [O[j][0], O[j][1], z], Ij = [I[j][0], I[j][1], z], Ii = [I[i][0], I[i][1], z];
          if (up) { T(out, Oi, Oj, Ij); T(out, Oi, Ij, Ii); } else { T(out, Oi, Ij, Oj); T(out, Oi, Ii, Ij); }
        }
      }
      walls(out, I.slice().reverse(), z0, z1);
    } else { fan(e.poly, z1, true); fan(e.poly, z0, false); }
  }
  const loops = unionBoundary(tile.elems.map(e => e.poly), false);
  for (const l of loops) walls(out, l, z0, z1);
  return { tris: out, loops: loops.filter(l => areaOf(l) > 0).map(removeCollinear) };
}
function insideConvexLoose(poly, pt) { // punto in poligono (ray casting)
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (((a[1] > pt[1]) !== (b[1] > pt[1])) && (pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0])) ins = !ins;
  }
  return ins;
}

// ---------- piatti ----------
function plateSlots(sF, gap, bedW, bedD, margin) {
  const S = sF + SQ3 * gap, hS = S * SQ3 / 2;
  const uW = bedW - 2 * margin, uD = bedD - 2 * margin;
  const nPer = Math.max(1, Math.floor(2 * uW / S) - 1), nRows = Math.max(1, Math.floor(uD / hS));
  const totW = (nPer + 1) * S / 2, totD = nRows * hS;
  const ox = (bedW - totW) / 2, oy = (bedD - totD) / 2;
  const slots = [];
  for (let r = nRows - 1; r >= 0; r--) for (let j = 0; j < nPer; j++) {
    const up = (j + r) % 2 === 0;
    slots.push({ up, x: ox + (j + 1) * S / 2, y: oy + r * hS + (up ? hS / 3 : 2 * hS / 3) });
  }
  return slots;
}

function meshVolume(t) {
  let v = 0;
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

if (typeof module !== 'undefined') module.exports = { SQ3, mulberry, sideFromCount, buildLayout, unionBoundary, buildPiece, transformTris, tileFrame, buildFrameTile, plateSlots, meshVolume, PROFILES, insetConvex, areaOf };

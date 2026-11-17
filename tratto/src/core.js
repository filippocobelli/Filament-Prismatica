/* Tratto core v0.2 — geometria, algoritmi, export 3MF per il kit UMTS (penna/lama) su Bambu Lab P1S.
   Richiede ClipperLib, libtess, fflate nello scope globale (o via require in Node). */
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const tL = (it, en) => (root.TRATTO_LANG === 'en' ? en : it);
const ClipperLib = root.ClipperLib || (isNode ? require('./vendor/clipper.min.js') : null);
const libtess = root.libtess || (isNode ? require('./vendor/libtess.min.js') : null);
const fflate = root.fflate || (isNode ? require('./vendor/fflate.min.js') : null);

// ---------------------------------------------------------------- costanti P1S + UMTS
const P1S = {
  bed: 256,
  // Area esclusa pubblicata da Falu per UMTS (X1/P1): striscia sinistra 48 mm e frontale 55 mm
  exclude: ['0x0', '258x0', '258x55', '48x55', '48x258', '0x258'],
  // Rettangolo disegnabile (1 mm di margine dall'area esclusa e dal bordo piatto)
  area: { x0: 49, y0: 56, x1: 255, y1: 255 },
};
P1S.areaW = P1S.area.x1 - P1S.area.x0;   // 206
P1S.areaH = P1S.area.y1 - P1S.area.y0;   // 199
P1S.cx = (P1S.area.x0 + P1S.area.x1) / 2; // 152
P1S.cy = (P1S.area.y0 + P1S.area.y1) / 2; // 155.5

const LAYER = 0.1;     // altezza strato UMTS
const BEAD = 0.4;      // larghezza tratto per lo slicer (linea singola Arachne)

// ---------------------------------------------------------------- utilità
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Perlin noise 2D con seme
function makeNoise(seed) {
  const r = mulberry32(seed >>> 0);
  const p = new Uint8Array(512);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const grad = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  function n2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const g = (h, dx, dy) => { const q = grad[h & 7]; return q[0] * dx + q[1] * dy; };
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    return lerp(lerp(g(aa, x, y), g(ba, x - 1, y), u), lerp(g(ab, x, y - 1), g(bb, x - 1, y - 1), u), v);
  }
  n2.fbm = function (x, y, oct = 3) { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * n2(x * f, y * f); n += a; a *= 0.5; f *= 2; } return s / n; };
  return n2;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function pathLength(p) { let L = 0; for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]); return L; }
function isClosed(p, eps = 1e-6) { return p.length > 2 && dist(p[0], p[p.length - 1]) < eps; }

// Ramer–Douglas–Peucker
function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d2;
      if (L2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = Math.max(0, Math.min(1, t));
        d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d2 > md) { md = d2; mi = i; }
    }
    if (md > t2) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = []; for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}
function chaikin(p, it = 1) {
  const closed = isClosed(p);
  for (let k = 0; k < it; k++) {
    if (p.length < 3) return p;
    const q = closed ? [] : [p[0]];
    const n = p.length - 1;
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[i + 1];
      q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    if (closed) q.push(q[0]); else q.push(p[n]);
    p = q;
  }
  return p;
}
// Unisce segmenti/polilinee con estremi coincidenti in catene più lunghe (meno alzate penna)
function chainPaths(paths, eps = 0.05) {
  const key = (p) => Math.round(p[0] / eps) + ',' + Math.round(p[1] / eps);
  const ends = new Map();
  const add = (k, i) => { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); };
  const items = paths.filter(p => p.length > 1).map(p => p.slice());
  const used = new Uint8Array(items.length);
  items.forEach((p, i) => { if (!isClosed(p)) { add(key(p[0]), i); add(key(p[p.length - 1]), i); } });
  const take = (k, self) => { const l = ends.get(k); if (!l) return -1; for (const j of l) if (!used[j] && j !== self) return j; return -1; };
  const out = [];
  for (let i = 0; i < items.length; i++) {
    if (used[i]) continue; used[i] = 1;
    let cur = items[i];
    if (isClosed(cur)) { out.push(cur); continue; }
    for (let dir = 0; dir < 2; dir++) {
      for (;;) {
        const tail = cur[cur.length - 1];
        const j = take(key(tail), i);
        if (j < 0) break;
        used[j] = 1;
        let nx = items[j];
        if (key(nx[0]) !== key(tail)) nx = nx.slice().reverse();
        cur = cur.concat(nx.slice(1));
      }
      cur.reverse();
    }
    out.push(cur);
  }
  return out;
}
// Ordina i tratti per ridurre gli spostamenti a vuoto (nearest neighbour con inversione)
function orderPaths(paths) {
  if (paths.length < 3) return paths;
  const rest = paths.slice(); const out = [];
  let pos = [0, 0];
  const cell = 10, grid = new Map();
  const gk = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
  const alive = new Uint8Array(rest.length);
  rest.forEach((p, i) => { alive[i] = 1; for (const e of [p[0], p[p.length - 1]]) { const k = gk(e[0], e[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); } });
  let left = rest.length;
  while (left) {
    let best = -1, bd = Infinity, rev = false;
    const cx = Math.floor(pos[0] / cell), cy = Math.floor(pos[1] / cell);
    for (let r = 0; r < 60 && best < 0; r++) {
      for (let gx = cx - r; gx <= cx + r; gx++) for (let gy = cy - r; gy <= cy + r; gy++) {
        if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r) continue;
        const l = grid.get(gx + ',' + gy); if (!l) continue;
        for (const i of l) {
          if (!alive[i]) continue; const p = rest[i];
          const d0 = dist(pos, p[0]), d1 = dist(pos, p[p.length - 1]);
          if (d0 < bd) { bd = d0; best = i; rev = false; }
          if (d1 < bd && !isClosed(p)) { bd = d1; best = i; rev = true; }
        }
      }
      if (best >= 0 && bd > (r + 1) * cell) best = -1, bd = Infinity; // cerca ancora un anello
    }
    if (best < 0) { for (let i = 0; i < rest.length; i++) if (alive[i]) { best = i; break; } }
    alive[best] = 0; left--;
    const p = rev ? rest[best].slice().reverse() : rest[best];
    out.push(p); pos = p[p.length - 1];
  }
  return out;
}
function bbox(paths) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of paths) for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
// Ritaglia polilinee al rettangolo [0,W]x[0,H] (Liang–Barsky per segmento)
function clipToRect(paths, W, H) {
  const out = [];
  for (const p of paths) {
    let cur = [];
    for (let i = 1; i < p.length; i++) {
      let [x0, y0] = p[i - 1], [x1, y1] = p[i];
      let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
      const P = [-dx, dx, -dy, dy], Q = [x0, W - x0, y0, H - y0];
      let ok = true;
      for (let k = 0; k < 4; k++) {
        if (P[k] === 0) { if (Q[k] < 0) { ok = false; break; } }
        else { const r = Q[k] / P[k]; if (P[k] < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; } }
      }
      if (!ok) { if (cur.length > 1) out.push(cur); cur = []; continue; }
      const a = [x0 + t0 * dx, y0 + t0 * dy], b = [x0 + t1 * dx, y0 + t1 * dy];
      if (!cur.length) cur.push(a);
      else if (dist(cur[cur.length - 1], a) > 1e-6) { if (cur.length > 1) out.push(cur); cur = [a]; }
      cur.push(b);
      if (t1 < 1) { if (cur.length > 1) out.push(cur); cur = []; }
    }
    if (cur.length > 1) out.push(cur);
  }
  return out;
}

// ---------------------------------------------------------------- campo immagine
// img = { w, h, d: Float32Array (0 chiaro .. 1 scuro), a: Float32Array alpha }  mappata su W x H mm
function sampler(img, W, H) {
  const sx = img.w / W, sy = img.h / H;
  return function (x, y) {
    const u = x * sx - 0.5, v = y * sy - 0.5;
    if (u < -0.5 || v < -0.5 || u > img.w - 0.5 || v > img.h - 0.5) return 0;
    const i0 = Math.max(0, Math.min(img.w - 1, Math.floor(u))), j0 = Math.max(0, Math.min(img.h - 1, Math.floor(v)));
    const i1 = Math.min(img.w - 1, i0 + 1), j1 = Math.min(img.h - 1, j0 + 1);
    const fu = Math.max(0, Math.min(1, u - i0)), fv = Math.max(0, Math.min(1, v - j0));
    const d = img.d;
    return (d[j0 * img.w + i0] * (1 - fu) + d[j0 * img.w + i1] * fu) * (1 - fv) + (d[j1 * img.w + i0] * (1 - fu) + d[j1 * img.w + i1] * fu) * fv;
  };
}

// Tratteggio a più livelli (crosshatch)
function algHatch(img, W, H, o) {
  const S = sampler(img, W, H);
  const levels = o.levels || 4, spacing = Math.max(0.5, o.spacing || 1.2), step = 0.25, minLen = o.minLen ?? 0.8;
  const baseAng = (o.angle ?? 45) * Math.PI / 180;
  const angs = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4, Math.PI / 8, -3 * Math.PI / 8];
  const out = []; out.levels = [];
  const R = Math.hypot(W, H) / 2, cx = W / 2, cy = H / 2;
  for (let L = 0; L < levels; L++) {
    const lev = [];
    const thr = (L + 1) / (levels + 1);
    const a = baseAng + angs[L % angs.length];
    const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    const sp = spacing * (o.denser ? (1 - L * 0.12) : 1);
    let flip = false;
    for (let t = -R; t <= R; t += sp) {
      const segs = []; let cur = null;
      for (let s = -R; s <= R; s += step) {
        const x = cx + ux * s + vx * t, y = cy + uy * s + vy * t;
        const inside = x >= 0 && y >= 0 && x <= W && y <= H && S(x, y) > thr;
        if (inside) { if (!cur) cur = [[x, y]]; else if (cur.length > 1) cur[cur.length - 1] = [x, y]; else cur.push([x, y]); }
        else if (cur) { segs.push(cur); cur = null; }
      }
      if (cur) segs.push(cur);
      let line = segs.filter(sg => sg.length > 1 && dist(sg[0], sg[1]) >= minLen);
      if (flip) { line = line.reverse().map(sg => sg.reverse()); }
      flip = !flip;
      out.push(...line); lev.push(...line);
    }
    if (lev.length) out.levels.push(lev);
  }
  return out;
}
// Linee orizzontali ondulate (squiggle): ampiezza e frequenza dal tono
function algWaves(img, W, H, o) {
  const S = sampler(img, W, H);
  const sp = Math.max(0.8, o.spacing || 2), step = 0.15, freq = o.freq || 1.2, out = [];
  let dir = 1;
  for (let y0 = sp / 2; y0 < H; y0 += sp) {
    const line = []; let ph = 0;
    const xs = dir > 0 ? [0, W] : [W, 0];
    for (let x = xs[0]; dir > 0 ? x <= xs[1] : x >= xs[1]; x += dir * step) {
      const d = Math.pow(S(x, y0), o.gamma || 1);
      ph += 2 * Math.PI * freq * step * (0.15 + d * 1.0);
      const y = y0 + Math.sin(ph) * d * sp * 0.48;
      line.push([x, y]);
    }
    out.push(simplify(line, 0.02)); dir = -dir;
  }
  return out;
}
// Spirale modulata dal tono
function algSpiral(img, W, H, o) {
  const S = sampler(img, W, H);
  const sp = Math.max(0.8, o.spacing || 1.6), cx = W / 2, cy = H / 2;
  const Rm = Math.hypot(W, H) / 2, pts = [], out = [];
  let th = 0; const freq = o.freq || 1.5;
  let ph = 0;
  while (true) {
    const r = sp * th / (2 * Math.PI);
    if (r > Rm) break;
    const ds = 0.2; th += ds / Math.max(r, 0.5);
    const x0 = cx + r * Math.cos(th), y0 = cy + r * Math.sin(th);
    const d = (x0 >= 0 && y0 >= 0 && x0 <= W && y0 <= H) ? Math.pow(S(x0, y0), o.gamma || 1) : 0;
    ph += 2 * Math.PI * freq * ds * (0.15 + d);
    const rr = r + Math.sin(ph) * d * sp * 0.48;
    pts.push([cx + rr * Math.cos(th), cy + rr * Math.sin(th)]);
  }
  out.push(simplify(pts, 0.02));
  return clipToRect(out, W, H);
}
// Binarizzazione
function binarize(img, thr) { const b = new Uint8Array(img.w * img.h); for (let i = 0; i < b.length; i++) b[i] = img.d[i] > thr ? 1 : 0; return b; }
// Marching squares su campo scalare f (w x h) a soglia t → polilinee (in pixel)
function marching(f, w, h, t) {
  const segs = [];
  const v = (i, j) => (i < 0 || j < 0 || i >= w || j >= h) ? 0 : f[j * w + i];
  const interp = (x0, y0, a, x1, y1, b) => { const k = (t - a) / ((b - a) || 1e-9); return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k]; };
  for (let j = -1; j < h; j++) for (let i = -1; i < w; i++) {
    const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
    const idx = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const T = () => interp(i, j, a, i + 1, j, b), Rr = () => interp(i + 1, j, b, i + 1, j + 1, c), B = () => interp(i, j + 1, d, i + 1, j + 1, c), L = () => interp(i, j, a, i, j + 1, d);
    switch (idx) {
      case 1: case 14: segs.push([L(), B()]); break;
      case 2: case 13: segs.push([B(), Rr()]); break;
      case 3: case 12: segs.push([L(), Rr()]); break;
      case 4: case 11: segs.push([T(), Rr()]); break;
      case 5: segs.push([L(), T()], [B(), Rr()]); break;
      case 6: case 9: segs.push([T(), B()]); break;
      case 7: case 8: segs.push([L(), T()]); break;
      case 10: segs.push([T(), Rr()], [L(), B()]); break;
    }
  }
  return chainPaths(segs, 1e-3);
}
// Contorni (isolinee) del tono, uno o più livelli
function algContours(img, W, H, o) {
  const levels = o.levels || 1, out = [];
  const f = blur(img.d, img.w, img.h, o.blur ?? 1);
  const sx = W / img.w, sy = H / img.h;
  for (let L = 0; L < levels; L++) {
    const t = levels === 1 ? (o.threshold ?? 0.5) : (L + 1) / (levels + 1);
    for (const p of marching(f, img.w, img.h, t)) {
      let q = p.map(([x, y]) => [(x + 0.5) * sx, (y + 0.5) * sy]);
      q = simplify(chaikin(q, 1), o.simplify ?? 0.05);
      if (pathLength(q) >= (o.minLen ?? 1)) out.push(q);
    }
  }
  return out;
}
function blur(d, w, h, r) {
  if (!r) return d;
  const t = new Float32Array(d.length), o = new Float32Array(d.length);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const ii = i + k; if (ii >= 0 && ii < w) { s += d[j * w + ii]; n++; } } t[j * w + i] = s / n; }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const jj = j + k; if (jj >= 0 && jj < h) { s += t[jj * w + i]; n++; } } o[j * w + i] = s / n; }
  return o;
}
// Scheletro (Zhang–Suen) → linee centrali, per disegni a tratto
function algCenterline(img, W, H, o) {
  const w = img.w, h = img.h;
  const b = binarize({ w, h, d: blur(img.d, w, h, o.blur ?? 0) }, o.threshold ?? 0.5);
  const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h) ? 0 : b[j * w + i];
  let changed = true; const del = [];
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        if (!b[j * w + i]) continue;
        const p2 = at(i, j - 1), p3 = at(i + 1, j - 1), p4 = at(i + 1, j), p5 = at(i + 1, j + 1), p6 = at(i, j + 1), p7 = at(i - 1, j + 1), p8 = at(i - 1, j), p9 = at(i - 1, j - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]; let A = 0; for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) A++;
        if (A !== 1) continue;
        if (pass === 0 ? (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) : (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0)) del.push(j * w + i);
      }
      if (del.length) { changed = true; for (const k of del) b[k] = 0; }
    }
  }
  // tracciamento del grafo dello scheletro
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  const deg = (i, j) => { let n = 0; for (const [dx, dy] of N8) n += at(i + dx, j + dy); return n; };
  const visited = new Set(); const ek = (a, c) => a < c ? a + ':' + c : c + ':' + a;
  const paths = [];
  const walk = (si, sj, ni, nj) => {
    const pts = [[si, sj]]; let pi = si, pj = sj, ci = ni, cj = nj;
    visited.add(ek(pj * w + pi, cj * w + ci));
    for (;;) {
      pts.push([ci, cj]);
      if (deg(ci, cj) !== 2) break;
      let moved = false;
      for (const [dx, dy] of N8) {
        const xi = ci + dx, yj = cj + dy;
        if (!at(xi, yj) || (xi === pi && yj === pj)) continue;
        const e = ek(cj * w + ci, yj * w + xi); if (visited.has(e)) continue;
        visited.add(e); pi = ci; pj = cj; ci = xi; cj = yj; moved = true; break;
      }
      if (!moved) break;
    }
    return pts;
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (b[j * w + i] && deg(i, j) !== 2) {
    for (const [dx, dy] of N8) { const xi = i + dx, yj = j + dy; if (at(xi, yj) && !visited.has(ek(j * w + i, yj * w + xi))) paths.push(walk(i, j, xi, yj)); }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (b[j * w + i] && deg(i, j) === 2) {
    for (const [dx, dy] of N8) { const xi = i + dx, yj = j + dy; if (at(xi, yj) && !visited.has(ek(j * w + i, yj * w + xi))) { const p = walk(i, j, xi, yj); paths.push(p); } }
  }
  const sx = W / w, sy = H / h, out = [];
  for (const p of chainPaths(paths, 1.01)) {
    let q = p.map(([x, y]) => [(x + 0.5) * sx, (y + 0.5) * sy]);
    q = simplify(chaikin(q, 1), o.simplify ?? 0.06);
    if (pathLength(q) >= (o.minLen ?? 1.5)) out.push(q);
  }
  return out;
}
// Linea continua (TSP) su punti campionati dal tono
function algTSP(img, W, H, o, seed) {
  const S = sampler(img, W, H), r = mulberry32(seed || 1);
  const N = o.points || 3000, pts = []; let tries = 0;
  const g = o.gamma || 1.4;
  while (pts.length < N && tries < N * 200) { tries++; const x = r() * W, y = r() * H; if (r() < Math.pow(S(x, y), g)) pts.push([x, y]); }
  if (pts.length < 2) return [];
  // nearest neighbour con griglia
  const cell = Math.max(1, Math.sqrt(W * H / pts.length) * 2), grid = new Map(), alive = new Uint8Array(pts.length);
  const gk = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
  pts.forEach((p, i) => { alive[i] = 1; const k = gk(p[0], p[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  let cur = 0; alive[0] = 0; const tour = [0];
  for (let n = 1; n < pts.length; n++) {
    const [px, py] = pts[cur]; const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
    let best = -1, bd = Infinity;
    for (let rr = 0; rr < 200; rr++) {
      for (let gx = cx - rr; gx <= cx + rr; gx++) for (let gy = cy - rr; gy <= cy + rr; gy++) {
        if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== rr) continue;
        const l = grid.get(gx + ',' + gy); if (!l) continue;
        for (const i of l) if (alive[i]) { const d = (pts[i][0] - px) ** 2 + (pts[i][1] - py) ** 2; if (d < bd) { bd = d; best = i; } }
      }
      if (best >= 0 && Math.sqrt(bd) < rr * cell) break;
    }
    if (best < 0) break;
    alive[best] = 0; tour.push(best); cur = best;
  }
  // 2-opt limitato
  const P = tour.map(i => pts[i]);
  const t0 = Date.now();
  for (let pass = 0; pass < 3 && Date.now() - t0 < 1500; pass++) {
    let imp = false;
    for (let i = 1; i < P.length - 2; i++) {
      for (let j = i + 1; j < Math.min(P.length - 1, i + 60); j++) {
        const d0 = dist(P[i - 1], P[i]) + dist(P[j], P[j + 1]);
        const d1 = dist(P[i - 1], P[j]) + dist(P[i], P[j + 1]);
        if (d1 < d0 - 1e-9) { let a = i, b = j; while (a < b) { [P[a], P[b]] = [P[b], P[a]]; a++; b--; } imp = true; }
      }
    }
    if (!imp) break;
  }
  return [P];
}

// ---------------------------------------------------------------- generativi (mm, W x H)
const GEN = {
  flow(W, H, o, seed) {
    const N = makeNoise(seed), r = mulberry32(seed + 7);
    const sc = (o.scale || 1) * 0.012, sep = Math.max(0.6, o.spacing || 2.5), maxL = o.length || 80, step = 0.4;
    const cell = sep, grid = new Map(); const gk = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
    const near = (x, y, own) => { const cx = Math.floor(x / cell), cy = Math.floor(y / cell); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grid.get((cx + i) + ',' + (cy + j)); if (l) for (const q of l) if (q[2] !== own && (q[0] - x) ** 2 + (q[1] - y) ** 2 < sep * sep * 0.81) return true; } return false; };
    const put = (x, y, id) => { const k = gk(x, y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, y, id]); };
    const ang = (x, y) => N.fbm(x * sc, y * sc, 3) * Math.PI * 2 * (o.turb || 2);
    const out = []; const tries = Math.round(W * H / (sep * sep) * 1.5);
    for (let t = 0; t < tries; t++) {
      const sx = r() * W, sy = r() * H; if (near(sx, sy, -1)) continue;
      const id = t; const line = [[sx, sy]];
      for (const dir of [1, -1]) {
        let x = sx, y = sy; const seg = [];
        for (let k = 0; k < maxL / step / 2; k++) {
          const a = ang(x, y); x += Math.cos(a) * step * dir; y += Math.sin(a) * step * dir;
          if (x < 0 || y < 0 || x > W || y > H || near(x, y, id)) break;
          seg.push([x, y]);
        }
        if (dir === 1) line.push(...seg); else line.unshift(...seg.reverse());
      }
      if (pathLength(line) > sep * 2) { line.forEach(([x, y], i) => { if (i % 2 === 0) put(x, y, id); }); out.push(simplify(line, 0.03)); }
    }
    return out;
  },
  truchet(W, H, o, seed) {
    const r = mulberry32(seed), c = Math.max(3, o.cell || 10), out = [];
    const nx = Math.floor(W / c), ny = Math.floor(H / c), ox = (W - nx * c) / 2, oy = (H - ny * c) / 2;
    const arc = (cx, cy, a0, a1) => { const p = []; for (let k = 0; k <= 12; k++) { const a = a0 + (a1 - a0) * k / 12; p.push([cx + c / 2 * Math.cos(a), cy + c / 2 * Math.sin(a)]); } return p; };
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = ox + i * c, y = oy + j * c;
      if (r() < 0.5) { out.push(arc(x, y, 0, Math.PI / 2), arc(x + c, y + c, Math.PI, Math.PI * 1.5)); }
      else { out.push(arc(x + c, y, Math.PI / 2, Math.PI), arc(x, y + c, -Math.PI / 2, 0)); }
      if (o.double) { const k = r() < 0.5; const rr = c * 0.25; const p = []; for (let s = 0; s <= 12; s++) { const a = (k ? 0 : Math.PI / 2) + Math.PI / 2 * s / 12; p.push([(k ? x : x + c) + rr * Math.cos(a) * (k ? 1 : -1) * (k ? 1 : -1), y + rr * Math.sin(a)]); } }
    }
    return chainPaths(out, 0.01);
  },
  spiro(W, H, o, seed) {
    const r = mulberry32(seed), out = [];
    const Rm = Math.min(W, H) / 2 * 0.95;
    const R = 96, rr = [23, 37, 41, 53, 29, 61, 17][Math.floor(r() * 7)], d = rr * (0.5 + r() * 0.9);
    const copies = o.copies || 3;
    for (let c = 0; c < copies; c++) {
      const rot = c * Math.PI / copies / 2, k = 1 - c * 0.12, pts = [];
      const g = (a, b) => b ? g(b, a % b) : a; const turns = rr / g(R, rr);
      const steps = Math.min(40000, Math.round(turns * 900));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps * turns * Math.PI * 2;
        let x = (R - rr) * Math.cos(t) + d * Math.cos((R - rr) / rr * t);
        let y = (R - rr) * Math.sin(t) - d * Math.sin((R - rr) / rr * t);
        const sc = Rm / (R - rr + d) * k; [x, y] = [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)];
        pts.push([W / 2 + x * sc, H / 2 + y * sc]);
      }
      out.push(simplify(pts, 0.02));
    }
    return out;
  },
  ridges(W, H, o, seed) {
    const N = makeNoise(seed), n = o.lines || 60, step = 0.5, out = [];
    const top = H * 0.12, bot = H * 0.98, gap = (bot - top) / n, amp = (o.amp || 1) * gap * 6;
    const nx = Math.ceil(W / step) + 1, hor = new Float32Array(nx).fill(Infinity);
    for (let l = n - 1; l >= 0; l--) {
      const y0 = top + l * gap; let cur = [];
      for (let k = 0; k < nx; k++) {
        const x = k * step, cxn = (x - W / 2) / (W * 0.22);
        const env = Math.exp(-cxn * cxn * 2);
        const v = Math.max(0, N.fbm(x * 0.04, l * 0.35, 4) + 0.35) * env;
        const y = y0 - v * amp;
        if (y < hor[k] - 0.05) { cur.push([x, y]); hor[k] = y; }
        else { if (cur.length > 1) out.push(simplify(cur, 0.02)); cur = []; }
      }
      if (cur.length > 1) out.push(simplify(cur, 0.02));
    }
    return out;
  },
  circles(W, H, o, seed) {
    const r = mulberry32(seed), out = [], sp = Math.max(0.8, o.spacing || 2.5);
    const centers = [[W / 2 - W * 0.08 * r(), H / 2 - H * 0.08 * r()], [W / 2 + W * 0.1 * r(), H / 2 + H * 0.1 * r()]];
    const Rm = Math.hypot(W, H);
    for (const [cx, cy] of centers) for (let rad = sp; rad < Rm; rad += sp) {
      const n = Math.max(24, Math.round(rad * 2)), p = [];
      for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2; p.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); }
      out.push(p);
    }
    return clipToRect(out, W, H);
  },
  harmono(W, H, o, seed) {
    const r = mulberry32(seed), f = () => 2 + Math.round(r() * 4) + (r() - 0.5) * 0.02;
    const P = { f1: f(), f2: f(), f3: f(), f4: f(), p1: r() * 6.28, p2: r() * 6.28, p3: r() * 6.28, p4: r() * 6.28, d: 0.0018 + r() * 0.002 };
    const A = Math.min(W, H) / 4 * 0.95, pts = [];
    for (let t = 0; t < 1500; t += 0.02) {
      const e = Math.exp(-P.d * t);
      pts.push([W / 2 + A * e * (Math.sin(P.f1 * t + P.p1) + Math.sin(P.f2 * t + P.p2)), H / 2 + A * e * (Math.sin(P.f3 * t + P.p3) + Math.sin(P.f4 * t + P.p4))]);
    }
    return [simplify(pts, 0.02)];
  },
  maze(W, H, o, seed) {
    const r = mulberry32(seed), c = Math.max(3, o.cell || 8);
    const nx = Math.floor(W / c), ny = Math.floor(H / c), ox = (W - nx * c) / 2, oy = (H - ny * c) / 2;
    const vis = new Uint8Array(nx * ny), wallsH = new Uint8Array(nx * (ny + 1)).fill(1), wallsV = new Uint8Array((nx + 1) * ny).fill(1);
    const st = [[0, 0]]; vis[0] = 1;
    while (st.length) {
      const [x, y] = st[st.length - 1];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy, dx, dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < nx && b < ny && !vis[b * nx + a]);
      if (!nb.length) { st.pop(); continue; }
      const [a, b, dx, dy] = nb[Math.floor(r() * nb.length)];
      if (dx === 1) wallsV[y * (nx + 1) + x + 1] = 0; if (dx === -1) wallsV[y * (nx + 1) + x] = 0;
      if (dy === 1) wallsH[(y + 1) * nx + x] = 0; if (dy === -1) wallsH[y * nx + x] = 0;
      vis[b * nx + a] = 1; st.push([a, b]);
    }
    wallsV[0] = 0; wallsV[(ny - 1) * (nx + 1) + nx] = 0;
    const segs = [];
    for (let y = 0; y <= ny; y++) for (let x = 0; x < nx; x++) if (wallsH[y * nx + x]) segs.push([[ox + x * c, oy + y * c], [ox + (x + 1) * c, oy + y * c]]);
    for (let y = 0; y < ny; y++) for (let x = 0; x <= nx; x++) if (wallsV[y * (nx + 1) + x]) segs.push([[ox + x * c, oy + y * c], [ox + x * c, oy + (y + 1) * c]]);
    return chainPaths(segs, 0.01).map(p => simplify(p, 0.01));
  },
  topo(W, H, o, seed) {
    const N = makeNoise(seed), res = 0.8, w = Math.ceil(W / res) + 1, h = Math.ceil(H / res) + 1, f = new Float32Array(w * h);
    const sc = 0.02 * (o.scale || 1);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) f[j * w + i] = N.fbm(i * res * sc, j * res * sc, 4) * 0.5 + 0.5;
    const out = [], n = o.levels || 18;
    for (let L = 1; L < n; L++) for (const p of marching(f, w, h, 0.2 + 0.6 * L / n)) {
      const q = simplify(chaikin(p.map(([x, y]) => [x * res, y * res]), 1), 0.04);
      if (pathLength(q) > 2) out.push(q);
    }
    return clipToRect(out, W, H);
  },
};

// ---------------------------------------------------------------- forme per taglio
function shapeGrid(W, H, o) {
  const out = [], s = o.size || 40, g = o.gap ?? 5, sh = o.shape || 'circle', rad = Math.min(o.radius ?? 5, s / 2);
  const nx = Math.max(1, Math.floor((W + g) / (s + g))), ny = Math.max(1, Math.floor((H + g) / (s + (o.shape === 'rect' ? (o.height || s) - s : 0) + g)));
  const sh2 = sh === 'rect' ? (o.height || s) : s;
  const ny2 = Math.max(1, Math.floor((H + g) / (sh2 + g)));
  const ox = (W - (nx * s + (nx - 1) * g)) / 2, oy = (H - (ny2 * sh2 + (ny2 - 1) * g)) / 2;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny2; j++) {
    const x = ox + i * (s + g), y = oy + j * (sh2 + g);
    if (sh === 'circle') { const p = [], n = 96; for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2; p.push([x + s / 2 + s / 2 * Math.cos(a), y + s / 2 + s / 2 * Math.sin(a)]); } out.push(p); }
    else out.push(roundRect(x, y, s, sh2, rad));
  }
  return out;
}
function roundRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2)); const p = [];
  const arc = (cx, cy, a0) => { for (let k = 0; k <= 8; k++) { const a = a0 + Math.PI / 2 * k / 8; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  if (r === 0) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
  arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
  p.push(p[0]); return p;
}
// Sagoma di taglio attorno al soggetto di un'immagine (mask = alpha o non-bianco)
function cutOutline(img, W, H, o) {
  const w = img.w, h = img.h, m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = img.mask ? img.mask[i] : (img.d[i] > (o.bgThr ?? 0.08) ? 1 : 0);
  const f = blur(m, w, h, 1);
  const sx = W / w, sy = H / h;
  let polys = marching(f, w, h, 0.5).map(p => simplify(p.map(([x, y]) => [(x + 0.5) * sx, (y + 0.5) * sy]), 0.05)).filter(p => isClosed(p, 0.2) && p.length > 3);
  const S = 1000;
  const co = new ClipperLib.ClipperOffset(2, 0.02 * S);
  co.AddPaths(polys.map(p => p.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }))), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, (o.margin ?? 2) * S);
  const ex = ClipperLib.JS.PolyTreeToExPolygons(tree);
  const out = [];
  for (const e of ex) {
    const area = Math.abs(ClipperLib.Clipper.Area(e.outer)) / (S * S);
    if (area < (o.minArea ?? 20)) continue;
    const ring = e.outer.map(q => [q.X / S, q.Y / S]); ring.push(ring[0]);
    out.push(simplify(chaikin(ring, 2), 0.03));
    if (!o.outerOnly) for (const hole of e.holes) { if (Math.abs(ClipperLib.Clipper.Area(hole)) / (S * S) < (o.minArea ?? 20)) continue; const r2 = hole.map(q => [q.X / S, q.Y / S]); r2.push(r2[0]); out.push(simplify(chaikin(r2, 2), 0.03)); }
  }
  return out;
}

// Riempimento a tratteggio di poligoni (pari/dispari)
function hatchPolygons(polys, spacing, angleDeg) {
  const a = angleDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const rot = ([x, y]) => [x * ca + y * sa, -x * sa + y * ca], unrot = ([u, v]) => [u * ca - v * sa, u * sa + v * ca];
  const R = polys.map(p => p.map(rot)); const edges = [];
  let v0 = Infinity, v1 = -Infinity;
  for (const p of R) for (let i = 0; i < p.length; i++) { const A = p[i], B = p[(i + 1) % p.length]; edges.push([A, B]); v0 = Math.min(v0, A[1]); v1 = Math.max(v1, A[1]); }
  const out = []; let flip = false;
  for (let v = v0 + spacing / 2; v < v1; v += spacing) {
    const xs = [];
    for (const [A, B] of edges) { if ((A[1] <= v) !== (B[1] <= v)) xs.push(A[0] + (v - A[1]) / (B[1] - A[1]) * (B[0] - A[0])); }
    xs.sort((p, q) => p - q);
    const row = [];
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.3) row.push([unrot([xs[i], v]), unrot([xs[i + 1], v])]);
    if (flip) row.reverse().forEach(s => s.reverse());
    flip = !flip; out.push(...row);
  }
  return out;
}

// ---------------------------------------------------------------- tratti → poligoni → mesh
function strokesToExPolys(paths, width) {
  const S = 1000; // µm
  const co = new ClipperLib.ClipperOffset(2, 0.015 * S);
  const open = [], closed = [];
  for (const p of paths) {
    if (!p.length) continue;
    const q = p.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
    if (q.length === 1) q.push({ X: q[0].X + 1, Y: q[0].Y });
    if (isClosed(p, 1e-3) && p.length > 3) { q.pop(); closed.push(q); } else open.push(q);
  }
  if (open.length) co.AddPaths(open, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
  if (closed.length) co.AddPaths(closed, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedLine);
  const solution = new ClipperLib.Paths();
  co.Execute(solution, width / 2 * S);
  // unione "strictly simple": niente vertici toccanti → mesh manifold dopo la triangolazione
  const c = new ClipperLib.Clipper(); c.StrictlySimple = true;
  c.AddPaths(solution, ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return ClipperLib.JS.PolyTreeToExPolygons(tree).map(e => ({
    outer: e.outer.map(q => [q.X / S, q.Y / S]),
    holes: e.holes.map(h => h.map(q => [q.X / S, q.Y / S])),
  }));
}
function signedArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function cleanRing(r) {
  const o = [];
  for (const p of r) if (!o.length || dist(o[o.length - 1], p) > 1e-4) o.push(p);
  while (o.length > 1 && dist(o[0], o[o.length - 1]) <= 1e-4) o.pop();
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
  return out; // vertici, a triplette
}
// Mesh a lastra (z0..z1) da ExPolygons, coordinate già sul piatto/oggetto
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
      T.push(vid(a[0], a[1], z1), vid(b[0], b[1], z1), vid(c[0], c[1], z1)); // alto (CCW)
      T.push(vid(a[0], a[1], z0), vid(c[0], c[1], z0), vid(b[0], b[1], z0)); // basso (CW)
    }
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length];
      const a0 = vid(p[0], p[1], z0), b0 = vid(q[0], q[1], z0), b1 = vid(q[0], q[1], z1), a1 = vid(p[0], p[1], z1);
      T.push(a0, b0, b1, a0, b1, a1);
    }
  }
  return { V, T };
}

// ---------------------------------------------------------------- piano di stampa (strati e pause)
/* groups: [{name,color,passes,paths}] ; restituisce volumi per gruppo con z0/z1 e lista pause
   Strato 1 = passata "a vuoto" senza utensile; pausa prima della prima passata reale (monta UMTS),
   pausa prima di ogni gruppo successivo (cambio penna), pausa prima dell'ultimo strato (rimuovi UMTS). */
function slicesOf(g) { return (g.slices && g.slices.length ? g.slices : [g.paths]).filter(sl => sl && sl.length); }
function planLayers(groups, opt = {}) {
  const zt = (n) => +(n * LAYER).toFixed(4);
  const vols = [], pauses = [];
  let layer = 1;
  const G = groups.map(slicesOf);
  const firstG = G.findIndex(sl => sl.length);
  if (firstG < 0) return { vols, pauses, layers: 0, height: 0 };
  // strato 1: passata a vuoto (senza utensile) con la prima fetta del primo gruppo
  vols.push({ group: firstG, slice: 0, pass: -1, z0: 0, z1: zt(1), ghost: true });
  layer = 2;
  let lastRef = null;
  groups.forEach((g, gi) => {
    const sl = G[gi]; if (!sl.length) return;
    pauses.push({ z: zt(layer), kind: pauses.length ? 'swap' : 'mount', group: gi, msg: (pauses.length ? tL('Cambia utensile: ', 'Change tool: ') : tL('Monta UMTS: ', 'Mount UMTS: ')) + g.name });
    for (let p = 0; p < Math.max(1, g.passes | 0); p++) {
      if (p > 0 && opt.pauseEveryPass) pauses.push({ z: zt(layer), kind: 'adjust', group: gi, msg: tL('Regola altezza (passata ', 'Adjust height (pass ') + (p + 1) + ')' });
      sl.forEach((_, si) => { vols.push({ group: gi, slice: si, pass: p, z0: zt(layer - 1), z1: zt(layer) }); layer++; });
    }
    lastRef = { group: gi, slice: sl.length - 1 };
  });
  // ultimo strato a vuoto: ospita la pausa "rimuovi UMTS" prima del G-code finale
  pauses.push({ z: zt(layer), kind: 'remove', msg: tL('Rimuovi UMTS', 'Remove UMTS') });
  vols.push({ group: lastRef.group, slice: lastRef.slice, pass: -1, z0: zt(layer - 1), z1: zt(layer), ghost: true });
  return { vols, pauses, layers: layer, height: zt(layer) };
}

// ---------------------------------------------------------------- configurazione progetto Orca
function vecLike(cur, v) { return Array.isArray(cur) ? cur.map(() => String(v)) : String(v); }
function buildProjectConfig(base, s) {
  const M = JSON.parse(JSON.stringify(base.machine)), P = JSON.parse(JSON.stringify(base.process)), F = JSON.parse(JSON.stringify(base.filament));
  const diff = { M: new Set(), P: new Set(), F: new Set() };
  const set = (sec, k, v, fallbackVec) => {
    const T = sec === 'M' ? M : sec === 'P' ? P : F;
    const nv = (k in T) ? vecLike(T[k], v) : (fallbackVec ? Array(fallbackVec).fill(String(v)) : String(v));
    if (JSON.stringify(T[k]) !== JSON.stringify(nv)) { T[k] = nv; diff[sec].add(k); }
  };
  // --- stampante (UMTS)
  set('M', 'z_offset', s.zOffset.toFixed(2));
  M.bed_exclude_area = P1S.exclude.slice(); diff.M.add('bed_exclude_area');
  set('M', 'retraction_length', '0.01');
  set('M', 'z_hop', s.zHop);
  set('M', 'z_hop_types', 'Normal Lift');
  set('M', 'retract_lift_enforce', 'All Surfaces', M.z_hop.length);
  set('M', 'retraction_minimum_travel', '0');
  set('M', 'retract_when_changing_layer', '1');
  set('M', 'wipe', '0');
  set('M', 'wipe_distance', '0');
  set('M', 'retract_restart_extra', '0');
  if (s.skipPurge && typeof M.machine_start_gcode === 'string') {
    const g = M.machine_start_gcode;
    const a = g.indexOf('G1 X18.0 Y1.0 Z0.8'), b = g.indexOf('M400', a);
    if (a > 0 && b > a) {
      M.machine_start_gcode = g.slice(0, a) + 'G1 Z10 F1200 ; UMTS/Tratto: linea di spurgo saltata (foglio sul piano)\nM109 S{nozzle_temperature_initial_layer[initial_extruder]}\n' + g.slice(b);
      diff.M.add('machine_start_gcode');
    }
  }
  // --- processo
  set('P', 'layer_height', LAYER); set('P', 'initial_layer_print_height', LAYER);
  for (const k of ['line_width', 'initial_layer_line_width', 'outer_wall_line_width', 'inner_wall_line_width', 'sparse_infill_line_width', 'internal_solid_infill_line_width', 'top_surface_line_width', 'support_line_width']) set('P', k, BEAD);
  set('P', 'wall_loops', 1); set('P', 'wall_generator', 'arachne');
  set('P', 'top_shell_layers', 0); set('P', 'bottom_shell_layers', 0); set('P', 'top_shell_thickness', 0); set('P', 'bottom_shell_thickness', 0);
  set('P', 'sparse_infill_density', '0%');
  set('P', 'enable_prime_tower', 0); set('P', 'skirt_loops', 0); set('P', 'brim_type', 'no_brim'); set('P', 'ironing_type', 'no ironing');
  set('P', 'timelapse_type', 0);
  set('P', 'slice_closing_radius', '0.001'); set('P', 'resolution', '0.012');
  set('P', 'xy_contour_compensation', 0); set('P', 'xy_hole_compensation', 0);
  set('P', 'gap_fill_target', 'nowhere');
  set('P', 'reduce_infill_retraction', 0);
  set('P', 'enable_overhang_speed', 0);
  set('P', 'enable_arc_fitting', 0);
  for (const k of ['outer_wall_speed', 'inner_wall_speed', 'initial_layer_speed', 'gap_infill_speed', 'initial_layer_infill_speed']) set('P', k, s.speed);
  set('P', 'small_perimeter_speed', '100%');
  for (const k of ['outer_wall_acceleration', 'inner_wall_acceleration', 'initial_layer_acceleration', 'default_acceleration']) set('P', k, s.accel);
  // --- filamento "modalità plotter"
  set('F', 'filament_flow_ratio', '0.01');
  set('F', 'nozzle_temperature', s.nozzleTemp); set('F', 'nozzle_temperature_initial_layer', s.nozzleTemp);
  set('F', 'nozzle_temperature_range_low', Math.min(170, s.nozzleTemp));
  for (const k of ['hot_plate_temp', 'hot_plate_temp_initial_layer', 'cool_plate_temp', 'cool_plate_temp_initial_layer', 'eng_plate_temp', 'eng_plate_temp_initial_layer', 'textured_plate_temp', 'textured_plate_temp_initial_layer', 'supertack_plate_temp', 'supertack_plate_temp_initial_layer', 'textured_cool_plate_temp', 'textured_cool_plate_temp_initial_layer']) if (k in F) set('F', k, s.bedTemp);
  for (const k of ['fan_min_speed', 'fan_max_speed', 'overhang_fan_speed', 'additional_cooling_fan_speed', 'during_print_exhaust_fan_speed', 'complete_print_exhaust_fan_speed']) if (k in F) set('F', k, 0);
  for (const k of ['slow_down_for_layer_cooling', 'activate_air_filtration', 'reduce_fan_stop_start_freq', 'enable_overhang_bridge_fan']) if (k in F) set('F', k, 0);
  if ('close_fan_the_first_x_layers' in F) set('F', 'close_fan_the_first_x_layers', 1);
  set('F', 'filament_max_volumetric_speed', 22);
  const out = Object.assign({}, P, F, M);
  out.filament_colour = [s.colour || '#000000'];
  out.filament_settings_id = [base.names.filament];
  out.print_settings_id = base.names.process;
  out.printer_settings_id = base.names.machine;
  out.filament_ids = [base.filament_id];
  out.filament_map = ['1'];
  out.filament_self_index = (F.filament_extruder_variant || ['x']).map(() => '1');
  out.print_compatible_printers = base.print_compatible_printers;
  out.different_settings_to_system = [[...diff.P].join(';'), [...diff.F].join(';'), [...diff.M].join(';')];
  out.curr_bed_type = 'Textured PEI Plate';
  out.printer_technology = 'FFF';
  out.from = 'project'; out.name = 'project_settings';
  return out;
}

// ---------------------------------------------------------------- 3MF (formato progetto Orca/Bambu)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (v) => { const r = Math.round(v * 1e4) / 1e4; return Object.is(r, -0) ? '0' : String(r); };
function uuid(n, tag) { const h = (n >>> 0).toString(16).padStart(8, '0'); return h + '-' + tag + '-4c03-9d28-80fed5dfa1dc'; }

/* job: { name, groups:[{name,color,passes,paths(mm, y verso il basso, origine area)}], W, H, offsetX, offsetY }
   settings: per buildProjectConfig; opt.pauseEveryPass ; thumbnail: Uint8Array PNG opzionale */
function build3MF(job, settings, base, opt = {}) {
  const plan = planLayers(job.groups, opt);
  const cx = P1S.cx + (job.offsetX || 0), cy = P1S.cy + (job.offsetY || 0);
  // geometria locale: x a destra, y verso il retro del piatto (immagine dritta guardando dal fronte)
  const meshCache = new Map();
  const G = job.groups.map(slicesOf);
  const meshFor = (gi, si) => {
    const k = gi + ':' + si; if (meshCache.has(k)) return meshCache.get(k);
    const local = G[gi][si].map(p => p.map(([x, y]) => [x - job.W / 2, job.H / 2 - y]));
    const m = slabMesh(strokesToExPolys(local, BEAD), 0, LAYER); meshCache.set(k, m); return m;
  };
  const volumes = []; let triCount = 0;
  for (const v of plan.vols) {
    const mesh = meshFor(v.group, v.slice); if (!mesh.T.length) continue;
    triCount += mesh.T.length / 3;
    const g = job.groups[v.group];
    const nm = v.ghost ? tL('a vuoto', 'dry run') : (g.name + (G[v.group].length > 1 ? tL(' · fetta ', ' · slice ') + (v.slice + 1) : '') + (g.passes > 1 ? tL(' · passata ', ' · pass ') + (v.pass + 1) : ''));
    volumes.push({ name: nm, mesh, dz: v.z0 });
  }
  if (!volumes.length) throw new Error(tL('Nessun tratto da esportare', 'No strokes to export'));
  const n = volumes.length, objId = n + 1, files = {};
  const enc = (s) => fflate.strToU8(s);
  // oggetti mesh
  let ob = '<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n';
  const chunks = [ob];
  volumes.forEach((vol, i) => {
    const { V, T } = vol.mesh; const id = i + 1, dz = vol.dz;
    const parts = [`  <object id="${id}" p:UUID="${uuid(id << 16, '81cb')}" type="model">\n   <mesh>\n    <vertices>\n`];
    for (let k = 0; k < V.length; k += 3) parts.push(`     <vertex x="${fmt(V[k])}" y="${fmt(V[k + 1])}" z="${fmt(V[k + 2] + dz)}"/>\n`);
    parts.push('    </vertices>\n    <triangles>\n');
    for (let k = 0; k < T.length; k += 3) parts.push(`     <triangle v1="${T[k]}" v2="${T[k + 1]}" v3="${T[k + 2]}"/>\n`);
    parts.push('    </triangles>\n   </mesh>\n  </object>\n');
    chunks.push(parts.join(''));
  });
  chunks.push(' </resources>\n <build/>\n</model>\n');
  files['3D/Objects/object_1.model'] = enc(chunks.join(''));
  const today = new Date().toISOString().slice(0, 10);
  const tr = `1 0 0 0 1 0 0 0 1 ${fmt(cx)} ${fmt(cy)} 0`;
  let mm = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
 <metadata name="Application">OrcaSlicer-2.5.1</metadata>
 <metadata name="OrcaSlicer">2.5.1</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="CreationDate">${today}</metadata>
 <metadata name="ModificationDate">${today}</metadata>
 <metadata name="Designer">Tratto</metadata>
 <metadata name="Title">${esc(job.name)}</metadata>
 <resources>
  <object id="${objId}" p:UUID="${uuid(1, '61cb')}" type="model">
   <components>
${volumes.map((v, i) => `    <component p:path="/3D/Objects/object_1.model" objectid="${i + 1}" p:UUID="${uuid((1 << 16) | i, 'b206')}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`).join('\n')}
   </components>
  </object>
 </resources>
 <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">
  <item objectid="${objId}" p:UUID="${uuid(objId, 'b1ec')}" transform="${tr}" printable="1"/>
 </build>
</model>
`;
  files['3D/3dmodel.model'] = enc(mm);
  files['3D/_rels/3dmodel.model.rels'] = enc(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`);
  const thumb = opt.thumbnail;
  files['_rels/.rels'] = enc(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
${thumb ? ' <Relationship Target="/Metadata/plate_1.png" Id="rel-2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>\n' : ''}</Relationships>
`);
  files['[Content_Types].xml'] = enc(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>
`);
  // model_settings
  const ms = ['<?xml version="1.0" encoding="UTF-8"?>\n<config>\n', `  <object id="${objId}">\n    <metadata key="name" value="${esc(job.name)}"/>\n    <metadata key="extruder" value="1"/>\n`];
  volumes.forEach((v, i) => {
    ms.push(`    <part id="${i + 1}" subtype="normal_part">\n      <metadata key="name" value="${esc(v.name)}"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n      <mesh_stat face_count="${v.mesh.T.length / 3}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n    </part>\n`);
  });
  ms.push('  </object>\n  <plate>\n    <metadata key="plater_id" value="1"/>\n    <metadata key="plater_name" value=""/>\n    <metadata key="locked" value="false"/>\n');
  if (thumb) ms.push('    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>\n');
  ms.push(`    <model_instance>\n      <metadata key="object_id" value="${objId}"/>\n      <metadata key="instance_id" value="0"/>\n      <metadata key="identify_id" value="${100 + objId}"/>\n    </model_instance>\n  </plate>\n  <assemble>\n   <assemble_item object_id="${objId}" instance_id="0" transform="${tr}" offset="0 0 0" />\n  </assemble>\n</config>\n`);
  files['Metadata/model_settings.config'] = enc(ms.join(''));
  // pause
  const cg = ['<?xml version="1.0" encoding="utf-8"?>\n<custom_gcodes_per_layer>\n<plate>\n<plate_info id="1"/>\n'];
  for (const p of plan.pauses) cg.push(`<layer top_z="${fmt(p.z)}" type="1" extruder="1" color="" extra="" gcode="M400 U1"/>\n`);
  cg.push('<mode value="SingleExtruder"/>\n</plate>\n</custom_gcodes_per_layer>\n');
  files['Metadata/custom_gcode_per_layer.xml'] = enc(cg.join(''));
  // impostazioni progetto
  const cfg = buildProjectConfig(base, settings);
  files['Metadata/project_settings.config'] = enc(JSON.stringify(cfg, null, 4));
  if (thumb) files['Metadata/plate_1.png'] = thumb;
  const zip = fflate.zipSync(files, { level: 6 });
  return { data: zip, plan, triCount, config: cfg };
}

// SVG semplice dei tratti (per Inkscape / controllo)
function buildSVG(job) {
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(job.W)}mm" height="${fmt(job.H)}mm" viewBox="0 0 ${fmt(job.W)} ${fmt(job.H)}">`];
  for (const g of job.groups) {
    parts.push(`<g id="${esc(g.name)}" fill="none" stroke="${esc(g.color)}" stroke-width="0.4" stroke-linecap="round" stroke-linejoin="round">`);
    for (const p of g.paths) parts.push(`<polyline points="${p.map(([x, y]) => fmt(x) + ',' + fmt(y)).join(' ')}"/>`);
    parts.push('</g>');
  }
  parts.push('</svg>');
  return parts.join('\n');
}

// ------------------------------------------------------------------ più colori: separazione e penne
function srgbLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function rgbToLab(r, g, b) {
  const R = srgbLin(r), G = srgbLin(g), B = srgbLin(b);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B), Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
const lumOf = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const isPaperLab = (L) => L[0] > 88 && Math.hypot(L[1], L[2]) < 14;
// colori principali dell'immagine (k-means in Lab), escluso il bianco della carta; dal più chiaro al più scuro
function paletteKMeans(rgba, k, seed) {
  const n = rgba.length / 4, step = Math.max(1, Math.floor(n / 30000)), pts = [], cols = [];
  for (let i = 0; i < n; i += step) {
    if (rgba[i * 4 + 3] < 128) continue;
    const c = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]], L = rgbToLab(c[0], c[1], c[2]);
    if (isPaperLab(L)) continue;
    pts.push(L); cols.push(c);
  }
  if (!pts.length) return [[27, 27, 27]];
  k = Math.max(1, Math.min(k, pts.length));
  const r = mulberry32(seed || 7), C = [pts[Math.floor(r() * pts.length)].slice()];
  const d2 = new Float64Array(pts.length).fill(Infinity);
  while (C.length < k) {           // k-means++
    let sum = 0; const last = C[C.length - 1];
    for (let i = 0; i < pts.length; i++) { const p = pts[i], d = (p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2 + (p[2] - last[2]) ** 2; if (d < d2[i]) d2[i] = d; sum += d2[i]; }
    if (sum <= 0) break;
    let t = r() * sum, j = 0; for (; j < pts.length - 1; j++) { t -= d2[j]; if (t <= 0) break; }
    C.push(pts[j].slice());
  }
  const as = new Int32Array(pts.length);
  for (let it = 0; it < 16; it++) {
    for (let i = 0; i < pts.length; i++) { let b = 0, bd = Infinity; for (let c = 0; c < C.length; c++) { const p = pts[i], q = C[c], d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < bd) { bd = d; b = c; } } as[i] = b; }
    const acc = C.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) { const a = acc[as[i]], p = pts[i]; a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; a[3]++; }
    acc.forEach((a, c) => { if (a[3]) C[c] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
  const acc = C.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < pts.length; i++) { const a = acc[as[i]], c = cols[i]; a[0] += c[0]; a[1] += c[1]; a[2] += c[2]; a[3]++; }
  return acc.filter(a => a[3] > pts.length * 0.004).map(a => [a[0] / a[3], a[1] / a[3], a[2] / a[3]].map(Math.round)).sort((a, b) => lumOf(b) - lumOf(a));
}
// ogni pixel va alla penna di colore più vicino (o resta carta); tono = quanto è pieno rispetto al colore della penna
function separateColors(rgba, w, h, pens) {
  const PL = pens.map(c => rgbToLab(c[0], c[1], c[2])), PW = [100, 0, 0], plum = pens.map(lumOf);
  const assign = new Int8Array(w * h).fill(-1), tone = new Float32Array(w * h), cache = new Map();
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let j = cache.get(key);
    if (j === undefined) {
      const L = rgbToLab(r, g, b); let bd = (L[0] - PW[0]) ** 2 + L[1] ** 2 + L[2] ** 2; j = -1;
      for (let c = 0; c < PL.length; c++) { const q = PL[c], d = (L[0] - q[0]) ** 2 + (L[1] - q[1]) ** 2 + (L[2] - q[2]) ** 2; if (d < bd) { bd = d; j = c; } }
      cache.set(key, j);
    }
    if (j < 0) continue;
    assign[i] = j; tone[i] = Math.max(0, Math.min(1, (1 - lumOf([r, g, b])) / Math.max(0.12, 1 - plum[j])));
  }
  return { assign, tone };
}
// taglia i tratti dove lo strato di quel colore è vuoto (per onde e spirale a più colori)
function cutByLayer(paths, img, W, H, thr) {
  const S = sampler(img, W, H), out = [], t = thr == null ? 0.04 : thr;
  for (const p of paths) {
    let cur = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], pts = [a];
      if (i > 0) { const b = p[i - 1], L = Math.hypot(a[0] - b[0], a[1] - b[1]), n = Math.floor(L / 0.4); pts.length = 0; for (let k = 1; k <= n; k++) pts.push([b[0] + (a[0] - b[0]) * k / (n + 1), b[1] + (a[1] - b[1]) * k / (n + 1)]); pts.push(a); }
      for (const q of pts) { if (S(q[0], q[1]) > t) cur.push(q); else { if (cur.length > 1) out.push(cur); cur = []; } }
    }
    if (cur.length > 1) out.push(cur);
  }
  return out.map(q => simplify(q, 0.02)).filter(q => pathLength(q) > 0.6);
}
// divide i tratti di un disegno generativo tra n penne
function splitPens(paths, n, mode, W, H, seed) {
  const G = Array.from({ length: n }, () => []), r = mulberry32((seed || 1) + 101);
  paths.forEach((p, i) => {
    let j;
    if (mode === 'random') j = Math.floor(r() * n);
    else if (mode === 'alternate') j = i % n;
    else {
      const b = bbox([p]), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const f = mode === 'rings' ? Math.min(0.9999, Math.hypot(cx - W / 2, cy - H / 2) / (Math.hypot(W, H) / 2))
        : mode === 'cols' ? cx / W : cy / H;
      j = Math.max(0, Math.min(n - 1, Math.floor(f * n)));
    }
    G[j].push(p);
  });
  return G;
}

const api = { P1S, LAYER, BEAD, mulberry32, makeNoise, simplify, chaikin, chainPaths, orderPaths, bbox, clipToRect, pathLength, isClosed,
  algHatch, algWaves, algSpiral, algContours, algCenterline, algTSP, GEN, shapeGrid, roundRect, cutOutline, hatchPolygons,
  strokesToExPolys, slabMesh, planLayers, slicesOf, buildProjectConfig, build3MF, buildSVG,
  rgbToLab, paletteKMeans, separateColors, cutByLayer, splitPens };
if (isNode) module.exports = api; else root.TR = api;
})(typeof window !== 'undefined' ? window : globalThis);

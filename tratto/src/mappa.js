/* Tratto — piantine (mappe di città) da OpenStreetMap, con curve di livello dai Terrain Tiles.
   fetch: Nominatim (ricerca), Overpass (strade, acqua, ferrovie, edifici), Terrarium PNG (quote).
   build: dati → gruppi di tratti in mm (curve, acqua, strade + testo), pronti per Tratto. */
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const TR = isNode ? require('./core.js') : root.TR;
const TAV = isNode ? require('./tavola.js') : root.TAV;
const tL = (it, en) => (root.TRATTO_LANG === 'en' ? en : it);

const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link']);
const MINOR = new Set(['tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'pedestrian', 'road']);
const SMALL = new Set(['service', 'footway', 'path', 'cycleway', 'steps', 'track', 'bridleway']);
const RAIL = new Set(['rail', 'light_rail', 'subway', 'tram', 'narrow_gauge']);
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

// ---------------------------------------------------------------- rete
async function geocode(q) {
  const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=' + (root.TRATTO_LANG === 'en' ? 'en' : 'it') + '&q=' + encodeURIComponent(q);
  const r = await fetch(u, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Nominatim ' + r.status);
  return (await r.json()).map(x => {
    const a = x.address || {};
    const name = a.city || a.town || a.village || a.municipality || a.county || x.name || q;
    return { lat: +x.lat, lon: +x.lon, name, sub: a.country || '', label: x.display_name };
  });
}
// riquadro (s, w, n, e) di un quadrato di lato «km» attorno al centro
function bboxOf(lat, lon, kmW, kmH) {
  const dLat = (kmH * 1000 / 2) / 110540, dLon = (kmW * 1000 / 2) / (111320 * Math.cos(lat * Math.PI / 180));
  return { s: lat - dLat, n: lat + dLat, w: lon - dLon, e: lon + dLon };
}
async function fetchOSM(b, o) {
  const bb = `(${b.s.toFixed(6)},${b.w.toFixed(6)},${b.n.toFixed(6)},${b.e.toFixed(6)})`;
  const q = `[out:json][timeout:90];(way["highway"]${bb};way["railway"]${bb};way["waterway"]${bb};way["natural"="water"]${bb};relation["natural"="water"]${bb};${o && o.buildings ? `way["building"]${bb};` : ''});out geom;`;
  let err = null;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!r.ok) throw new Error('Overpass ' + r.status);
      return await r.json();
    } catch (e) { err = e; }
  }
  throw err;
}
// quote da Terrarium (AWS Open Data): griglia n × m in metri
async function fetchElevation(b, n) {
  const latc = (b.s + b.n) / 2, wm = (b.e - b.w) * 111320 * Math.cos(latc * Math.PI / 180);
  let z = Math.round(Math.log2(156543.03 * Math.cos(latc * Math.PI / 180) * n / wm));
  z = Math.max(8, Math.min(14, z));
  const X = (lon) => (lon + 180) / 360 * 2 ** z * 256;
  const Y = (lat) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z * 256; };
  const x0 = X(b.w), x1 = X(b.e), y0 = Y(b.n), y1 = Y(b.s);
  const tx0 = Math.floor(x0 / 256), tx1 = Math.floor(x1 / 256), ty0 = Math.floor(y0 / 256), ty1 = Math.floor(y1 / 256);
  const cw = (tx1 - tx0 + 1) * 256, ch = (ty1 - ty0 + 1) * 256;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const jobs = [];
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) jobs.push(new Promise((ok, ko) => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { cx.drawImage(im, (tx - tx0) * 256, (ty - ty0) * 256); ok(); };
    im.onerror = () => ko(new Error('Terrain tile ' + z + '/' + tx + '/' + ty));
    im.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`;
  }));
  await Promise.all(jobs);
  const px = cx.getImageData(0, 0, cw, ch).data;
  const el = (x, y) => { const i = (Math.max(0, Math.min(ch - 1, y | 0)) * cw + Math.max(0, Math.min(cw - 1, x | 0))) * 4; return px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768; };
  const m = Math.max(8, Math.round(n * (y1 - y0) / (x1 - x0))), f = new Float32Array(n * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const x = x0 - tx0 * 256 + (x1 - x0) * i / (n - 1), y = y0 - ty0 * 256 + (y1 - y0) * j / (m - 1);
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    f[j * n + i] = (el(ix, iy) * (1 - fx) + el(ix + 1, iy) * fx) * (1 - fy) + (el(ix, iy + 1) * (1 - fx) + el(ix + 1, iy + 1) * fx) * fy;
  }
  return { n, m, f, bbox: b, zoom: z };
}

// ---------------------------------------------------------------- disegno
// linea parallela a distanza d (mm) — per le strade principali più spesse
function parallel(p, d) {
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    out.push([p[i][0] + nx * d, p[i][1] + ny * d]);
  }
  return out;
}
function tracked(str, x, y, h, gap) { // testo centrato con lettere spaziate
  const chars = [...str], widths = chars.map(c => (c === ' ' ? h * 0.6 : TAV.textWidth(c, h)));
  const tot = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1); let cx = x - tot / 2; const out = [];
  chars.forEach((c, i) => { if (c !== ' ') out.push(...TAV.text(c, cx, y, h, 'l')); cx += widths[i] + gap; });
  return out;
}
function fmtCoord(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S', ew = lon >= 0 ? 'E' : 'W';
  return Math.abs(lat).toFixed(4) + '° ' + ns + '  -  ' + Math.abs(lon).toFixed(4) + '° ' + ew;
}
/* M = { lat, lon, km, osm, elev, name, sub }, o = opzioni, W×H del disegno in mm → [{ key, paths }] */
function build(M, o, W, H) {
  const showText = o.text !== false, foot = showText ? Math.min(H * 0.22, Math.max(18, H * 0.17)) : 0;
  const bx0 = 0, by0 = 0, bw = W, bh = H - foot;
  const kmW = M.km, kmH = M.km * bh / bw, lat0 = M.lat, lon0 = M.lon;
  const mmPerM = bw / (kmW * 1000), kx = 111320 * Math.cos(lat0 * Math.PI / 180) * mmPerM, ky = 110540 * mmPerM;
  const P = (lat, lon) => [bx0 + bw / 2 + (lon - lon0) * kx, by0 + bh / 2 - (lat - lat0) * ky];
  const clip = (paths) => TR.clipToRect(paths, bw, bh).map(p => p.map(([x, y]) => [x + bx0, y + by0]));
  const streets = [], major = [], rail = [], water = [], bld = [];
  for (const el of (M.osm && M.osm.elements) || []) {
    const t = el.tags || {};
    const geoms = el.type === 'way' ? [el.geometry] : (el.members || []).filter(m => m.type === 'way' && m.geometry).map(m => m.geometry);
    for (const g of geoms) {
      if (!g || g.length < 2) continue;
      const p = g.map(q => P(q.lat, q.lon));
      if (t.highway) { if (MAJOR.has(t.highway)) major.push(p); else if (MINOR.has(t.highway) || (o.small && SMALL.has(t.highway))) streets.push(p); }
      else if (t.railway && RAIL.has(t.railway)) rail.push(p);
      else if (t.waterway || t.natural === 'water') { if (t.waterway && !/river|canal|stream|riverbank|drain/.test(t.waterway)) continue; water.push(p); }
      else if (t.building) bld.push(p);
    }
  }
  const groups = [];
  // curve di livello
  if (o.contours !== false && M.elev) {
    const E = M.elev, n = E.n, m = E.m, f = E.f;
    let lo = Infinity, hi = -Infinity; for (const v of f) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const step = Math.max(1, o.step || 10), sm = TR.blurField(f, n, m, 1);
    // la griglia copre il riquadro scaricato: lo riporto in mm
    const b = E.bbox, x0 = (b.w - lon0) * kx + bx0 + bw / 2, x1 = (b.e - lon0) * kx + bx0 + bw / 2, y0 = -(b.n - lat0) * ky + by0 + bh / 2, y1 = -(b.s - lat0) * ky + by0 + bh / 2;
    const out = [];
    for (let L = Math.ceil(lo / step) * step; L <= hi; L += step) {
      for (const p of TR.marching(sm, n, m, L)) {
        const q = TR.simplify(TR.chaikin(p.map(([i, j]) => [x0 + (x1 - x0) * i / (n - 1), y0 + (y1 - y0) * j / (m - 1)]), 1), 0.05);
        if (TR.pathLength(q) > 3) out.push(q);
      }
    }
    const c = clip(out).filter(p => TR.pathLength(p) > 2);
    if (c.length) groups.push({ key: 'contours', paths: c });
  }
  if (o.water !== false && water.length) { const c = clip(water); if (c.length) groups.push({ key: 'water', paths: c }); }
  const black = [];
  if (o.roads !== false) {
    black.push(...clip(streets));
    const mj = clip(major);
    for (const p of mj) { black.push(p); if (o.thick !== false && p.length > 1) { black.push(parallel(p, 0.3), parallel(p, -0.3)); } }
  }
  if (o.rail !== false) black.push(...clip(rail));
  if (o.buildings) black.push(...clip(bld).filter(p => TR.pathLength(p) > 1.5));
  if (o.frame !== false) black.push([[bx0, by0], [bx0 + bw, by0], [bx0 + bw, by0 + bh], [bx0, by0 + bh], [bx0, by0]]);
  if (showText) {
    const name = (o.title != null && o.title !== '' ? o.title : M.name || '').toUpperCase(), sub = (o.sub != null && o.sub !== '' ? o.sub : M.sub || '').toUpperCase();
    let h1 = Math.min(foot * 0.36, 14), gap = h1 * 0.55;
    const wTot = (s, h, g) => [...s].reduce((a, c) => a + (c === ' ' ? h * 0.6 : TAV.textWidth(c, h)), 0) + g * Math.max(0, [...s].length - 1);
    const hs = (h) => [Math.max(2.6, h * 0.38), Math.max(2.4, h * 0.3)];
    const need = (h) => { const [a, c] = hs(h); return foot * 0.12 + h + (sub ? a * 1.9 : 0) + c * 2.1 + (o.credits !== false ? 3.2 : 0.5); };
    while (h1 > 3 && (wTot(name, h1, gap) > W * 0.92 || need(h1) > foot)) { h1 *= 0.93; gap = h1 * 0.55; }
    const yT = by0 + bh + foot * 0.12 + h1, [h2, h3] = hs(h1);
    black.push(...tracked(name, W / 2, yT, h1, gap));
    let y = yT;
    if (sub) { y += h2 * 1.9; black.push(...tracked(sub, W / 2, y, h2, h2 * 0.35)); }
    y += h3 * 2.1; black.push(...TAV.text(fmtCoord(lat0, lon0), W / 2, y, h3, 'c'));
    if (o.credits !== false) black.push(...TAV.text('(C) OPENSTREETMAP CONTRIBUTORS', W, H - 0.2, 1.8, 'r'));
  }
  if (black.length) groups.push({ key: 'streets', paths: black });
  return groups;
}

const api = { geocode, bboxOf, fetchOSM, fetchElevation, build, fmtCoord };
if (isNode) module.exports = api; else root.MAPPA = api;
})(typeof window !== 'undefined' ? window : globalThis);

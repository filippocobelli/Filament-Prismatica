// FilamentBox Lite — API locale v2.0.0
// Sostituisce il server: intercetta le chiamate fetch('/api/...') della stessa interfaccia
// di FilamentBox e le risolve nel browser, con i dati salvati in localStorage.
// Niente Home Assistant, niente lettore NFC fisico. Prismatica legge gli stessi dati.
(function () {
  'use strict';
  const DB_KEY = 'filamentbox-db';
  const CLAUDE_KEY = 'filamentbox-claude';
  const CHANNEL = 'filamentbox';
  const MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-4-6'];
  const DEFAULT_MODEL = 'claude-sonnet-5-5';
  window.FB_LOCAL_CHANNEL = CHANNEL;
  let bc = null; try { bc = new BroadcastChannel(CHANNEL); } catch (e) {}

  // ── dati ──────────────────────────────────────────────
  function empty() { return { spools: [], printLogs: [], locations: [], importedInvoices: [] }; }
  function readDB() {
    try {
      const d = JSON.parse(localStorage.getItem(DB_KEY));
      if (d && Array.isArray(d.spools)) { d.printLogs = d.printLogs || []; d.locations = d.locations || []; d.importedInvoices = d.importedInvoices || []; return d; }
    } catch (e) {}
    return empty();
  }
  function writeDB(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    if (bc) bc.postMessage({ t: Date.now() });
  }
  let lastId = 0;
  const newId = () => { let t = Date.now(); if (t <= lastId) t = lastId + 1; lastId = t; return String(t); };
  function updateSpoolStatus(s) {
    if (s.remainingWeight <= 0) s.status = 'empty';
    else if (s.remainingWeight < s.totalWeight * 0.15) s.status = 'low';
    else s.status = 'available';
  }
  function logPrintOp(db, spool, used, printName, source) {
    spool.remainingWeight = Math.round(Math.max(0, spool.remainingWeight - used));
    if (used > 0) spool.sealed = false;
    updateSpoolStatus(spool);
    db.printLogs.push({ id: newId(), spoolId: spool.id, spoolName: `${spool.brand} ${spool.name}`, usedWeight: used, printName: printName || '', source: source || 'manual', date: new Date().toISOString() });
  }

  // ── Claude (chiave solo in questo browser) ─────────────
  function claudeCfg() { try { return JSON.parse(localStorage.getItem(CLAUDE_KEY)) || {}; } catch (e) { return {}; } }
  const LABEL_PROMPT = `Guarda questa foto di una bobina/confezione di filamento per stampante 3D.
Estrai i dati e rispondi SOLO con JSON valido, nessun testo fuori:
{"brand":"produttore","name":"nome commerciale","material":"PLA|PETG|ABS|TPU|ASA|Nylon","colorName":"nome colore","colorHex":"#RRGGBB","totalWeight":grammi_numero,"nozzleMin":temp_numero,"nozzleMax":temp_numero,"bedTemp":temp_numero}
Campi non visibili: null. Solo JSON.`;
  async function anthropic(body) {
    const c = claudeCfg();
    if (!c.key) throw new Error('Chiave Claude non configurata: impostala in Settings → Claude AI');
    const r = await origFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: c.model || DEFAULT_MODEL, ...body }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error((d.error && d.error.message) || ('HTTP ' + r.status));
    return d;
  }

  // ── barcode (servizi pubblici chiamati dal browser) ────
  function parseTitle(title, brand) {
    const MATERIALS = ['PLA', 'PETG', 'ABS', 'TPU', 'ASA', 'NYLON', 'PA', 'PC', 'HIPS', 'PVA'];
    const COLORS = { BLACK: '#1a1a1a', WHITE: '#f5f5f5', RED: '#ef4444', BLUE: '#3b82f6', GREEN: '#22c55e', YELLOW: '#eab308', ORANGE: '#f97316', PURPLE: '#a855f7', GREY: '#6b7280', GRAY: '#6b7280', SILVER: '#94a3b8', GOLD: '#ca8a04', BROWN: '#92400e', PINK: '#ec4899', CYAN: '#06b6d4' };
    const text = (title + ' ' + brand).toUpperCase();
    const material = MATERIALS.find(m => text.includes(m)) || null;
    const wm = text.match(/(\d+)\s*KG|(\d{3,4})\s*G/);
    const totalWeight = wm ? (wm[1] ? parseInt(wm[1]) * 1000 : parseInt(wm[2])) : null;
    let colorName = null, colorHex = null;
    for (const [n, h] of Object.entries(COLORS)) if (text.includes(n)) { colorName = n[0] + n.slice(1).toLowerCase(); colorHex = h; break; }
    const nozzleMin = material === 'PETG' ? 220 : material === 'ABS' ? 230 : 190;
    const nozzleMax = material === 'PETG' ? 250 : material === 'ABS' ? 250 : 220;
    const bedTemp = material === 'PETG' ? 70 : material === 'ABS' ? 100 : 60;
    return { material, totalWeight, colorName, colorHex, nozzleMin, nozzleMax, bedTemp };
  }
  async function barcodeLookup(code) {
    try {
      const r = await origFetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`);
      if (r.ok) { const d = await r.json(); const it = d.items && d.items[0]; if (it) { const p = parseTitle(it.title || '', it.brand || ''); if (p.material) return { brand: it.brand || null, name: it.title, ...p, source: 'upcitemdb' }; } }
    } catch (e) {}
    try {
      const r = await origFetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`);
      if (r.ok) { const d = await r.json(); if (d.status === 1 && d.product) { const p = parseTitle(d.product.product_name || '', d.product.brands || ''); if (p.material) return { brand: d.product.brands || null, name: d.product.product_name, ...p, source: 'openfoodfacts' }; } }
    } catch (e) {}
    return { found: false };
  }

  // ── tag OpenTag3D (stesso formato del server) ──────────
  function encodeOpenTag3D(s) {
    const buf = new Uint8Array(0x70), dv = new DataView(buf.buffer), enc = new TextEncoder();
    const wfs = (o, l, v) => buf.set(enc.encode(String(v)).slice(0, l), o);
    dv.setUint16(0, 1000);
    wfs(0x02, 5, s.material || 'PLA'); wfs(0x07, 5, s.modifier || ''); wfs(0x1B, 16, s.brand || 'Generic'); wfs(0x2B, 32, s.colorName || s.name || '');
    const rgb = parseInt(String(s.colorHex || '#888888').replace('#', '').slice(0, 6), 16) || 0;
    buf[0x4B] = (rgb >> 16) & 255; buf[0x4C] = (rgb >> 8) & 255; buf[0x4D] = rgb & 255; buf[0x4E] = 255;
    dv.setUint16(0x5C, Math.min(Math.round((s.diameterMm || 1.75) * 1000), 0xFFFF));
    dv.setUint16(0x5E, Math.min(s.totalWeight || 1000, 0xFFFF));
    const dens = { PETG: 1.27, ABS: 1.04, TPU: 1.21, ASA: 1.07, NYLON: 1.14, PA: 1.14, PLA: 1.24 };
    buf[0x60] = Math.min(Math.round((s.nozzleMax || s.nozzleMin || 210) / 5), 255);
    buf[0x61] = Math.min(Math.round((s.bedTemp || 60) / 5), 255);
    dv.setUint16(0x62, Math.round((dens[(s.material || 'PLA').toUpperCase()] || 1.24) * 1000));
    return buf;
  }

  // ── rotte ──────────────────────────────────────────────
  const NOT_IN_LITE = 'Non disponibile nell\'edizione Lite (serve l\'edizione Smart o Full con il server)';
  const R = [];
  const on = (method, pattern, fn) => R.push([method, new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, '([^/]+)') + '$'), fn]);

  on('GET', '/api/spools', (p, q) => { let s = readDB().spools; if (q.get('material') && q.get('material') !== 'all') s = s.filter(x => x.material === q.get('material')); return [200, s]; });
  on('GET', '/api/spools/:id', ([id]) => { const s = readDB().spools.find(x => x.id === id); return s ? [200, s] : [404, { error: 'Not found' }]; });
  on('POST', '/api/spools', (p, q, b) => {
    const db = readDB();
    const s = {
      id: newId(), brand: b.brand || '', material: b.material || 'PLA', name: b.name || '', colorName: b.colorName || '', colorHex: b.colorHex || '#888888',
      totalWeight: Number(b.totalWeight) || 1000, remainingWeight: Number(b.remainingWeight) || 1000,
      nozzleMin: Number(b.nozzleMin) || 190, nozzleMax: Number(b.nozzleMax) || 220, bedTemp: Number(b.bedTemp) || 60, notes: b.notes || '', status: 'available',
      printerSlot: b.printerSlot || null, amsSlot: b.amsSlot !== undefined ? b.amsSlot : null, location: b.location || '', sealed: b.sealed === true, createdAt: new Date().toISOString(),
    };
    updateSpoolStatus(s); db.spools.push(s); writeDB(db); return [201, s];
  });
  on('PUT', '/api/spools/:id', ([id], q, b) => {
    const db = readDB(), i = db.spools.findIndex(x => x.id === id); if (i < 0) return [404, { error: 'Not found' }];
    db.spools[i] = { ...db.spools[i], ...b, id }; updateSpoolStatus(db.spools[i]); writeDB(db); return [200, db.spools[i]];
  });
  on('DELETE', '/api/spools/:id', ([id]) => { const db = readDB(), i = db.spools.findIndex(x => x.id === id); if (i < 0) return [404, { error: 'Not found' }]; db.spools.splice(i, 1); writeDB(db); return [200, { ok: true }]; });
  on('POST', '/api/spools/:id/log', ([id], q, b) => { const db = readDB(), s = db.spools.find(x => x.id === id); if (!s) return [404, { error: 'Not found' }]; logPrintOp(db, s, Number(b.usedWeight) || 0, b.printName, 'manual'); writeDB(db); return [200, s]; });
  on('PUT', '/api/spools/:id/assign-slot', ([id], q, b) => {
    const db = readDB(), s = db.spools.find(x => x.id === id); if (!s) return [404, { error: 'Not found' }];
    const slot = b.amsSlot;
    if (slot !== null) db.spools.forEach(x => { if (x !== s && x.amsSlot === slot) { x.amsSlot = null; x.printerSlot = null; } });
    s.amsSlot = slot; if (slot !== null || b.printerSlot) s.sealed = false;
    s.printerSlot = b.printerSlot || (slot !== null ? 'p1s' : null);
    writeDB(db); return [200, s];
  });
  on('POST', '/api/spools/:id/nfc-uid', ([id], q, b) => { const db = readDB(), s = db.spools.find(x => x.id === id); if (!s) return [404, { error: 'Not found' }]; s.nfcUid = String(b.uid || '').toUpperCase(); writeDB(db); return [200, { ok: true, nfcUid: s.nfcUid }]; });
  on('GET', '/api/invoices', () => [200, readDB().importedInvoices]);
  on('POST', '/api/spools/bulk', (p, q, b) => {
    const db = readDB(), inv = b.invoice || {}, rows = Array.isArray(b.spools) ? b.spools : [];
    if (!rows.length) return [400, { error: 'Nessuna bobina da importare' }];
    const already = inv.invoice && db.importedInvoices.find(i => i.invoice === inv.invoice);
    if (already && !b.force) return [409, { error: 'Fattura già importata', importedAt: already.at, count: already.count }];
    let n = 0;
    for (const r of rows) {
      const qty = Math.max(1, Math.min(50, parseInt(r.qty) || 1));
      for (let k = 0; k < qty; k++) {
        const total = Number(r.totalWeight) || 1000;
        const s = { id: newId(), brand: r.brand || inv.vendor || '', material: r.material || 'PLA', name: r.name || '', colorName: r.colorName || '', colorHex: r.colorHex || '#888888',
          totalWeight: total, remainingWeight: total, nozzleMin: Number(r.nozzleMin) || 190, nozzleMax: Number(r.nozzleMax) || 220, bedTemp: Number(r.bedTemp) || 60,
          notes: r.notes || '', status: 'available', printerSlot: null, amsSlot: null, location: b.location || '', sealed: b.sealed !== false,
          sku: r.sku || '', purchasePrice: r.unitPrice != null ? Number(r.unitPrice) : null, invoiceRef: inv.invoice || '', purchaseDate: inv.date || '', createdAt: new Date().toISOString() };
        updateSpoolStatus(s); db.spools.push(s); n++;
      }
    }
    if (inv.invoice) { db.importedInvoices = db.importedInvoices.filter(i => i.invoice !== inv.invoice); db.importedInvoices.push({ invoice: inv.invoice, order: inv.order || '', date: inv.date || '', vendor: inv.vendor || '', count: n, at: new Date().toISOString() }); }
    writeDB(db); return [201, { ok: true, created: n }];
  });
  on('GET', '/api/locations', () => {
    const db = readDB(), cfg = db.locations, names = cfg.map(l => l.name);
    db.spools.forEach(s => { const n = (s.location || '').trim(); if (n && !names.includes(n)) names.push(n); });
    return [200, names.map(name => { const c = cfg.find(l => l.name === name) || {}, inLoc = db.spools.filter(s => (s.location || '').trim() === name);
      return { name, capacity: c.capacity || null, style: c.style || 'shelf', configured: !!c.name, count: inLoc.length, sealed: inLoc.filter(s => s.sealed).length, opened: inLoc.filter(s => !s.sealed).length }; })];
  });
  on('PUT', '/api/locations', (p, q, b) => {
    const db = readDB(), name = (b.name || '').trim(); if (!name) return [400, { error: 'Nome mancante' }];
    const newName = (b.newName || name).trim(), capacity = Number(b.capacity) > 0 ? Math.round(Number(b.capacity)) : null, style = ['box', 'wood', 'shelf'].includes(b.style) ? b.style : 'shelf';
    db.locations = db.locations.filter(l => l.name !== name && l.name !== newName); db.locations.push({ name: newName, capacity, style });
    if (newName !== name) db.spools.forEach(s => { if ((s.location || '').trim() === name) s.location = newName; });
    writeDB(db); return [200, { ok: true }];
  });
  on('DELETE', '/api/locations/:name', ([name]) => { name = decodeURIComponent(name); const db = readDB(); db.locations = db.locations.filter(l => l.name !== name); db.spools.forEach(s => { if ((s.location || '').trim() === name) s.location = ''; }); writeDB(db); return [200, { ok: true }]; });
  on('GET', '/api/stats', () => {
    const sp = readDB().spools, mat = {}; sp.forEach(s => { mat[s.material] = (mat[s.material] || 0) + 1; });
    return [200, { totalSpools: sp.length, totalWeight: sp.reduce((a, s) => a + s.remainingWeight, 0), mostUsed: (Object.entries(mat).sort((a, b) => b[1] - a[1])[0] || ['-'])[0],
      toReorder: sp.filter(s => s.status === 'low' || s.status === 'empty').length, runningLow: sp.filter(s => s.status === 'low').length }];
  });
  on('GET', '/api/logs', () => [200, readDB().printLogs.slice(-50).reverse()]);
  on('POST', '/api/print-logs/:id/assign', ([id], q, b) => {
    const db = readDB(), log = db.printLogs.find(l => l.id === id); if (!log) return [404, { error: 'Log non trovato' }];
    if (log.spoolId) return [400, { error: 'Questo log è già assegnato a una bobina' }];
    const s = db.spools.find(x => x.id === b.spoolId); if (!s) return [404, { error: 'Bobina non trovata' }];
    s.remainingWeight = Math.round(Math.max(0, s.remainingWeight - log.usedWeight)); updateSpoolStatus(s);
    log.spoolId = s.id; log.spoolName = `${s.brand} ${s.name}`; writeDB(db); return [200, { ok: true, spoolName: log.spoolName, usedWeight: log.usedWeight }];
  });
  // AMS senza Home Assistant: gli slot sono quelli assegnati a mano alle bobine
  on('GET', '/api/ha-ams-slots', () => {
    const sp = readDB().spools;
    return [200, { slots: [1, 2, 3, 4].map(n => { const s = sp.find(x => x.amsSlot === n); return s ? { slot: n, name: s.name || s.material, type: s.material, color: s.colorHex, remain: -1, empty: false } : { slot: n, empty: true }; }) }];
  });
  on('GET', '/api/barcode-lookup', async (p, q) => q.get('code') ? [200, await barcodeLookup(q.get('code'))] : [400, { error: 'Missing code' }]);
  on('GET', '/api/claude-config', () => { const c = claudeCfg(); return [200, { hasKey: !!c.key, source: c.key ? 'browser' : null, model: c.model || DEFAULT_MODEL, models: MODELS, keyHint: c.key ? '…' + c.key.slice(-4) : '' }]; });
  on('POST', '/api/claude-config', (p, q, b) => {
    const c = claudeCfg();
    if (typeof b.key === 'string') { if (b.key.trim()) c.key = b.key.trim(); else delete c.key; }
    if (b.model) c.model = String(b.model);
    localStorage.setItem(CLAUDE_KEY, JSON.stringify(c)); return [200, { ok: true }];
  });
  on('POST', '/api/claude-test', async () => {
    try { const d = await anthropic({ max_tokens: 5, messages: [{ role: 'user', content: 'Rispondi solo: ok' }] }); return [200, { ok: true, model: d.model }]; }
    catch (e) { return [200, { ok: false, error: e.message }]; }
  });
  on('POST', '/api/vision-scan', async (p, q, b) => {
    if (!b.image) return [400, { error: 'Missing image' }];
    try {
      const d = await anthropic({ max_tokens: 400, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: b.mediaType || 'image/jpeg', data: b.image } }, { type: 'text', text: LABEL_PROMPT }] }] });
      const t = (d.content && d.content[0] && d.content[0].text || '').replace(/```json|```/g, '').trim();
      return [200, JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1))];
    } catch (e) { return [500, { error: 'Errore lettura etichetta: ' + e.message }]; }
  });
  on('GET', '/api/backup', () => { const db = readDB(); return [200, { app: 'FilamentBox', edition: 'lite', version: (window.FB_EDITION || {}).version, exportedAt: new Date().toISOString(), ...db }]; });
  on('POST', '/api/restore', (p, q, b) => {
    if (!b || !Array.isArray(b.spools)) return [400, { error: 'File di backup non valido' }];
    writeDB({ spools: b.spools, locations: b.locations || [], printLogs: b.printLogs || [], importedInvoices: b.importedInvoices || [] }); return [200, { ok: true, spools: b.spools.length }];
  });
  on('GET', '/api/reader-status', () => [200, { connected: false, message: NOT_IN_LITE }]);

  // ── intercettazione di fetch ───────────────────────────
  const origFetch = window.fetch.bind(window);
  const reply = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async function (input, init) {
    const raw = typeof input === 'string' ? input : (input && input.url) || '';
    if (!raw.startsWith('/api/')) return origFetch(input, init);
    init = init || {};
    const method = (init.method || 'GET').toUpperCase();
    const [path, qs] = raw.split('?');
    const query = new URLSearchParams(qs || '');
    let body = {};
    if (init.body) { try { body = JSON.parse(init.body); } catch (e) { body = {}; } }
    for (const [m, re, fn] of R) {
      const hit = m === method && path.match(re);
      if (hit) { try { const [st, obj] = await fn(hit.slice(1), query, body); return reply(st, obj); } catch (e) { return reply(500, { error: e.message }); } }
    }
    return reply(404, { error: NOT_IN_LITE });
  };

  // Scarico del tag OpenTag3D senza server
  document.addEventListener('DOMContentLoaded', () => {
    window.downloadNFCBin = function (id) {
      const s = readDB().spools.find(x => x.id === id); if (!s) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([encodeOpenTag3D(s)], { type: 'application/octet-stream' }));
      a.download = `opentag3d_${(s.name || s.material || 'spool').replace(/[^a-z0-9]/gi, '_')}.bin`; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
    };
    // Aggiorna la lista se un'altra scheda (o Prismatica) modifica i dati
    const refresh = () => { if (typeof window.loadSpools === 'function') window.loadSpools(); };
    if (bc) bc.onmessage = refresh;
    window.addEventListener('storage', (e) => { if (e.key === DB_KEY) refresh(); });
  });

  // App installabile e offline quando servita via https (es. GitHub Pages)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/prismatica\//.test(location.pathname)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();

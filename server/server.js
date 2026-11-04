// FilamentBox server — v2.0.4
// CHANGELOG
// v2.0.4 — link Ko-fi in Settings, Prismatica e nella documentazione: nessuna modifica al server
// v2.0.3 — aggiunto il firmware del lettore NFC (nfc-reader/): nessuna modifica al server
// v2.0.2 — pagina del progetto su GitHub Pages (site/), licenza MIT: nessuna modifica al server
// v2.0.1 — progetto pubblico Filament-Prismatica: solo documentazione e numero di versione
// v2.0.0 — tre edizioni: FB_EDITION=full (tutto) | smart (HA + lettore NFC, senza Prismatica);
//          la edizione Lite (senza server) sta in /lite. /edition.js dice al frontend cosa mostrare.
//          Entità Home Assistant configurabili (ha_config.entities); chiave e modello Claude da
//          Settings (claude_config.json) o da env ANTHROPIC_API_KEY / ANTHROPIC_MODEL;
//          backup/ripristino JSON (/api/backup, /api/restore); niente più IP o dati personali nel codice.
// v1.7.0 — import bobine in blocco da fattura: POST /api/spools/bulk (quantità, prezzo, SKU,
//          riferimento fattura); db.importedInvoices per avvisare se una fattura è già stata caricata
// v1.6.1 — aggiornata Prismatica a v1.5 (dima A4 con sovrapposizione e crocini); nessuna modifica al server
// v1.6.0 — Prismatica (wall art 3D) servita su /prismatica/ (file statico in public/prismatica);
//          nuovo stream SSE /api/events: avvisa i client a ogni modifica del db (consumi, bobine, slot)
// v1.5.1 — fix consumi: a fine stampa HA riporta tutti gli slot inattivi, quindi il
//          consumo finiva sulla prima bobina P1S. Ora il server memorizza lo slot attivo
//          durante la stampa (polling HA ogni 20s) e lo usa nel webhook; niente più
//          fallback a caso (se lo slot è ignoto il log resta "da assegnare"); dedup 60s.
// v1.5.0 — vista Scaffali: config posizioni (capienza, stile) via /api/locations;
//          campo spool.sealed (sigillata/aperta), si apre da sola al primo consumo o carico in AMS
// v1.4.0 — lettore NFC fisico (heartbeat, coda scrittura), sync pesi da HA
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT) || 3025;
const VERSION = '2.0.4';
const EDITION = (process.env.FB_EDITION || 'full').toLowerCase() === 'smart' ? 'smart' : 'full';
const FEATURES = EDITION === 'smart' ? ['ha', 'nfc', 'server'] : ['ha', 'nfc', 'server', 'prismatica'];
const DB_PATH = path.join(__dirname, 'db.json');

app.use(express.json({ limit: '10mb' }));
// Edizione: il frontend legge window.FB_EDITION per mostrare solo le funzioni disponibili
app.get('/edition.js', (req, res) => {
  res.type('application/javascript').set('Cache-Control', 'no-store')
    .send(`window.FB_EDITION=${JSON.stringify({ name: EDITION, version: VERSION, features: FEATURES })};`);
});
// L'edizione Smart non include Prismatica
app.use('/prismatica', (req, res, next) => EDITION === 'smart' ? res.status(404).send('Prismatica non è inclusa nell\'edizione Smart') : next());
app.use(express.static(path.join(__dirname, 'public')));

function updateSpoolStatus(spool) {
  if (spool.remainingWeight <= 0) spool.status = 'empty';
  else if (spool.remainingWeight < spool.totalWeight * 0.15) spool.status = 'low';
  else spool.status = 'available';
}

function initDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ spools:[], printLogs:[], webhookToken: crypto.randomBytes(24).toString('hex') }, null, 2));
  } else {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    let changed = false;
    if (!db.webhookToken) { db.webhookToken = crypto.randomBytes(24).toString('hex'); changed = true; }
    if (!Array.isArray(db.locations)) { db.locations = []; changed = true; }
    if (!Array.isArray(db.importedInvoices)) { db.importedInvoices = []; changed = true; }
    db.spools.forEach(s => {
      if (s.printerSlot === undefined) { s.printerSlot = null; changed = true; }
      if (s.amsSlot === undefined) { s.amsSlot = null; changed = true; }
    });
    if (changed) fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  }
}

function readDB() { initDB(); return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); notifyClients(); }

// ── Eventi in tempo reale (v1.6.0) ───────────────────────
// Server-Sent Events: Prismatica (e chiunque) si iscrive e ricarica /api/spools
// quando arriva "spools". Nessuna dipendenza, solo HTTP.
const sseClients = new Set();
let sseTimer = null;
function notifyClients() {
  clearTimeout(sseTimer);
  sseTimer = setTimeout(() => {
    const msg = `event: spools\ndata: ${Date.now()}\n\n`;
    for (const r of sseClients) { try { r.write(msg); } catch (e) { sseClients.delete(r); } }
  }, 300); // raggruppa scritture ravvicinate
}
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});
setInterval(() => { for (const r of sseClients) { try { r.write(': ping\n\n'); } catch (e) { sseClients.delete(r); } } }, 25000);

function logPrintOp(db, spool, usedWeight, printName, source, extra = {}) {
  spool.remainingWeight = Math.round(Math.max(0, spool.remainingWeight - usedWeight));
  if (usedWeight > 0) spool.sealed = false; // usata = aperta
  updateSpoolStatus(spool);
  db.printLogs.push({ id: Date.now().toString(), spoolId: spool.id, spoolName: `${spool.brand} ${spool.name}`, usedWeight, printName: printName||'', source: source||'manual', date: new Date().toISOString(), ...extra });
}

// ── Spools ────────────────────────────────────────────────
app.get('/api/spools', (req, res) => {
  const db = readDB();
  let spools = db.spools;
  const { material } = req.query;
  if (material && material !== 'all') spools = spools.filter(s => s.material === material);
  // Arrotonda i pesi in uscita — pulisce eventuali residui di virgola
  // mobile accumulati da vecchie sottrazioni non arrotondate.
  spools = spools.map(s => ({
    ...s,
    remainingWeight: s.remainingWeight != null ? Math.round(s.remainingWeight) : s.remainingWeight,
    totalWeight: s.totalWeight != null ? Math.round(s.totalWeight) : s.totalWeight,
  }));
  res.json(spools);
});

app.get('/api/spools/:id', (req, res) => {
  const db = readDB();
  const spool = db.spools.find(s => s.id === req.params.id);
  if (!spool) return res.status(404).json({ error: 'Not found' });
  res.json(spool);
});

app.post('/api/spools', (req, res) => {
  const db = readDB();
  const spool = {
    id: Date.now().toString(), brand: req.body.brand||'', material: req.body.material||'PLA',
    name: req.body.name||'', colorName: req.body.colorName||'', colorHex: req.body.colorHex||'#888888',
    totalWeight: Number(req.body.totalWeight)||1000, remainingWeight: Number(req.body.remainingWeight)||1000,
    nozzleMin: Number(req.body.nozzleMin)||190, nozzleMax: Number(req.body.nozzleMax)||220,
    bedTemp: Number(req.body.bedTemp)||60, notes: req.body.notes||'', status: 'available',
    printerSlot: req.body.printerSlot||null, amsSlot: req.body.amsSlot!==undefined ? req.body.amsSlot : null,
    location: req.body.location||'',
    sealed: req.body.sealed === true,
    createdAt: new Date().toISOString()
  };
  updateSpoolStatus(spool);
  db.spools.push(spool);
  writeDB(db);
  res.status(201).json(spool);
});

// ── Import in blocco da fattura (v1.7.0) ─────────────────
app.get('/api/invoices', (req, res) => res.json(readDB().importedInvoices || []));

app.post('/api/spools/bulk', (req, res) => {
  const db = readDB();
  const inv = req.body.invoice || {};
  const rows = Array.isArray(req.body.spools) ? req.body.spools : [];
  if (!rows.length) return res.status(400).json({ error: 'Nessuna bobina da importare' });
  db.importedInvoices = db.importedInvoices || [];
  const already = inv.invoice && db.importedInvoices.find(i => i.invoice === inv.invoice);
  if (already && !req.body.force) return res.status(409).json({ error: 'Fattura già importata', importedAt: already.at, count: already.count });
  const base = Date.now();
  let n = 0;
  rows.forEach(r => {
    const qty = Math.max(1, Math.min(50, parseInt(r.qty) || 1));
    for (let q = 0; q < qty; q++) {
      const total = Number(r.totalWeight) || 1000;
      const spool = {
        id: String(base + n), brand: r.brand || inv.vendor || '', material: r.material || 'PLA',
        name: r.name || '', colorName: r.colorName || '', colorHex: r.colorHex || '#888888',
        totalWeight: total, remainingWeight: total,
        nozzleMin: Number(r.nozzleMin) || 190, nozzleMax: Number(r.nozzleMax) || 220, bedTemp: Number(r.bedTemp) || 60,
        notes: r.notes || '', status: 'available', printerSlot: null, amsSlot: null,
        location: req.body.location || '', sealed: req.body.sealed !== false,
        sku: r.sku || '', purchasePrice: r.unitPrice != null ? Number(r.unitPrice) : null,
        invoiceRef: inv.invoice || '', purchaseDate: inv.date || '',
        createdAt: new Date().toISOString()
      };
      updateSpoolStatus(spool);
      db.spools.push(spool);
      n++;
    }
  });
  if (inv.invoice) {
    db.importedInvoices = db.importedInvoices.filter(i => i.invoice !== inv.invoice);
    db.importedInvoices.push({ invoice: inv.invoice, order: inv.order || '', date: inv.date || '', vendor: inv.vendor || '', count: n, at: new Date().toISOString() });
  }
  writeDB(db);
  res.status(201).json({ ok: true, created: n });
});

app.put('/api/spools/:id', (req, res) => {
  const db = readDB();
  const idx = db.spools.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.spools[idx] = { ...db.spools[idx], ...req.body, id: req.params.id };
  updateSpoolStatus(db.spools[idx]);
  writeDB(db);
  res.json(db.spools[idx]);
});

app.delete('/api/spools/:id', (req, res) => {
  const db = readDB();
  const idx = db.spools.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.spools.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

app.post('/api/spools/:id/log', (req, res) => {
  const db = readDB();
  const idx = db.spools.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  logPrintOp(db, db.spools[idx], Number(req.body.usedWeight)||0, req.body.printName, 'manual');
  writeDB(db);
  res.json(db.spools[idx]);
});

app.put('/api/spools/:id/assign-slot', (req, res) => {
  const db = readDB();
  const idx = db.spools.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const newSlot = req.body.amsSlot;
  if (newSlot !== null) {
    db.spools.forEach((s, i) => { if (i !== idx && s.amsSlot === newSlot) { s.amsSlot = null; s.printerSlot = null; } });
  }
  db.spools[idx].amsSlot = newSlot;
  if (newSlot !== null || req.body.printerSlot) db.spools[idx].sealed = false; // caricata = aperta
  db.spools[idx].printerSlot = req.body.printerSlot || (newSlot !== null ? 'p1s' : null);
  writeDB(db);
  res.json(db.spools[idx]);
});

// ── Posizioni / Scaffali ──────────────────────────────────
// db.locations = [{ name, capacity, style }] — style: 'box' | 'wood' | 'shelf'
const LOCATION_STYLES = ['box', 'wood', 'shelf'];

app.get('/api/locations', (req, res) => {
  const db = readDB();
  const config = db.locations || [];
  const names = config.map(l => l.name);
  db.spools.forEach(s => {
    const n = (s.location || '').trim();
    if (n && !names.includes(n)) names.push(n);
  });
  const list = names.map(name => {
    const cfg = config.find(l => l.name === name) || {};
    const inLoc = db.spools.filter(s => (s.location || '').trim() === name);
    return {
      name,
      capacity: cfg.capacity || null,
      style: cfg.style || 'shelf',
      configured: !!cfg.name,
      count: inLoc.length,
      sealed: inLoc.filter(s => s.sealed).length,
      opened: inLoc.filter(s => !s.sealed).length,
    };
  });
  res.json(list);
});

// Crea o aggiorna una posizione. Con newName rinomina anche la posizione delle bobine.
app.put('/api/locations', (req, res) => {
  const db = readDB();
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome mancante' });
  const newName = (req.body.newName || name).trim();
  const capacity = Number(req.body.capacity) > 0 ? Math.round(Number(req.body.capacity)) : null;
  const style = LOCATION_STYLES.includes(req.body.style) ? req.body.style : 'shelf';
  db.locations = (db.locations || []).filter(l => l.name !== name && l.name !== newName);
  db.locations.push({ name: newName, capacity, style });
  if (newName !== name) db.spools.forEach(s => { if ((s.location || '').trim() === name) s.location = newName; });
  writeDB(db);
  res.json({ ok: true });
});

// Elimina la configurazione; le bobine restano ma senza posizione.
app.delete('/api/locations/:name', (req, res) => {
  const db = readDB();
  const name = req.params.name;
  db.locations = (db.locations || []).filter(l => l.name !== name);
  db.spools.forEach(s => { if ((s.location || '').trim() === name) s.location = ''; });
  writeDB(db);
  res.json({ ok: true });
});

// ── Stats & Logs ──────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const db = readDB();
  const { spools } = db;
  const totalWeight = spools.reduce((s, sp) => s + sp.remainingWeight, 0);
  const matCount = {};
  spools.forEach(sp => { matCount[sp.material] = (matCount[sp.material]||0)+1; });
  const mostUsed = Object.entries(matCount).sort((a,b)=>b[1]-a[1])[0]?.[0]||'-';
  res.json({ totalSpools: spools.length, totalWeight, mostUsed,
    toReorder: spools.filter(sp=>sp.status==='low'||sp.status==='empty').length,
    runningLow: spools.filter(sp=>sp.status==='low').length });
});

app.get('/api/logs', (req, res) => {
  const db = readDB();
  res.json((db.printLogs||[]).slice(-50).reverse());
});

app.post('/api/print-logs/:logId/assign', (req, res) => {
  const db = readDB();
  const log = (db.printLogs||[]).find(l => l.id === req.params.logId);
  if (!log) return res.status(404).json({ error: 'Log non trovato' });
  if (log.spoolId) return res.status(400).json({ error: 'Questo log è già assegnato a una bobina' });

  const spool = db.spools.find(s => s.id === req.body.spoolId);
  if (!spool) return res.status(404).json({ error: 'Bobina non trovata' });

  // Il peso non è mai stato sottratto quando il log è stato creato (dato
  // che non si conosceva la bobina) — lo sottraiamo ora, per la prima volta.
  spool.remainingWeight = Math.round(Math.max(0, spool.remainingWeight - log.usedWeight));
  updateSpoolStatus(spool);

  log.spoolId = spool.id;
  log.spoolName = `${spool.brand} ${spool.name}`;

  writeDB(db);
  res.json({ ok: true, spoolName: log.spoolName, usedWeight: log.usedWeight });
});

// ── Webhook token ─────────────────────────────────────────
app.get('/api/webhook-token', (req, res) => res.json({ token: readDB().webhookToken }));

app.post('/api/webhook-token/regenerate', (req, res) => {
  const db = readDB();
  db.webhookToken = crypto.randomBytes(24).toString('hex');
  writeDB(db);
  res.json({ token: db.webhookToken });
});

// ── HA Webhook ────────────────────────────────────────────
app.post('/api/webhook/print-done', (req, res) => {
  const db = readDB();
  const token = req.query.token || req.headers['x-filamentbox-token'];
  if (!token || token !== db.webhookToken) return res.status(401).json({ error: 'Unauthorized' });
  const grams = parseFloat(req.body.grams)||0;
  if (grams <= 0) return res.status(400).json({ error: 'Invalid grams' });
  if (isDuplicateWebhook(`print:${req.body.print_name||''}:${grams}`)) return res.json({ ok:true, duplicate:true });
  let activeSlot = parseInt(req.body.active_slot);
  if (!(activeSlot >= 1 && activeSlot <= 4)) activeSlot = null;
  // A fine stampa HA mette tutti gli slot active:false → usa lo slot visto durante la stampa
  let useExt = false, slotSource = activeSlot !== null ? 'ha' : null;
  if (activeSlot === null && printTrack.best && printTrack.bestAt && Date.now() - printTrack.bestAt < 6 * 3600 * 1000) {
    if (printTrack.best === 'ext') useExt = true; else activeSlot = printTrack.best;
    slotSource = 'tracker';
  }
  const slotRemainPct = req.body.slot_remain_pct!==undefined ? parseFloat(req.body.slot_remain_pct) : -1;
  const extra = { meters: parseFloat(req.body.meters)||null, amsSlot: activeSlot, slotName: useExt ? 'external' : (req.body.slot_name||null), slotSource };
  const printName = req.body.print_name||req.body.printName||'';
  let idx = activeSlot!==null ? db.spools.findIndex(s=>s.amsSlot===activeSlot)
          : useExt ? db.spools.findIndex(s=>s.printerSlot==='p1s_ext') : -1;
  // niente fallback "prima bobina P1S": meglio un log da assegnare che scalare la bobina sbagliata
  if (idx===-1) {
    db.printLogs.push({ id: Date.now().toString(), spoolId:null, spoolName: extra.slotName||'Unassigned', usedWeight:grams, printName, source:'ha_webhook', date:new Date().toISOString(), ...extra });
    writeDB(db); return res.json({ ok:true, assigned:false });
  }
  const spool = db.spools[idx];
  // Il remain% da RFID è affidabile solo per bobine Bambu Lab originali —
  // l'AMS non può leggere i nostri tag OpenTag3D, quindi per le bobine con
  // tag personalizzato usiamo sempre la sottrazione grammi (più sicura),
  // anche se HA inviasse comunque un valore slotRemainPct per quello slot.
  const isBambuTag = (spool.brand || '').toLowerCase().includes('bambu');
  if (isBambuTag && slotRemainPct>=0 && spool.totalWeight>0) {
    const newRem = Math.round(spool.totalWeight*slotRemainPct/100);
    const used = Math.max(0, spool.remainingWeight-newRem);
    spool.remainingWeight=newRem; updateSpoolStatus(spool);
    db.printLogs.push({ id:Date.now().toString(), spoolId:spool.id, spoolName:`${spool.brand} ${spool.name}`, usedWeight:used>0?used:grams, printName, source:'ha_webhook_rfid', date:new Date().toISOString(), ...extra, rfidRemainPct:slotRemainPct });
  } else {
    logPrintOp(db, spool, grams, printName, 'ha_webhook', extra);
  }
  writeDB(db);
  res.json({ ok:true, assigned:true, remainingWeight:spool.remainingWeight });
});

// ── AMS Sync ──────────────────────────────────────────────
app.post('/api/ams-sync', (req, res) => {
  const db = readDB();
  const slots = (req.body.slots||[]).filter(s=>!s.empty);
  const suggestions = slots.map(slot => {
    const candidates = db.spools.map(sp => {
      let score=0;
      if (sp.amsSlot===slot.slot) score+=10;
      const spN=(sp.brand+' '+sp.name).toLowerCase();
      const slN=(slot.name||'').toLowerCase();
      if (slN&&spN.includes(slN.split(' ')[0])) score+=3;
      if (sp.material===slot.type) score+=2;
      if ((sp.colorHex||'').toLowerCase().replace('#','').slice(0,6)===(slot.color||'').toLowerCase().replace('#','').slice(0,6)) score+=4;
      return { id:sp.id, brand:sp.brand, name:sp.name, colorHex:sp.colorHex, material:sp.material, remainingWeight:sp.remainingWeight, amsSlot:sp.amsSlot, score };
    }).sort((a,b)=>b.score-a.score).slice(0,4);
    return { slot:slot.slot, amsName:slot.name, amsType:slot.type, amsColor:slot.color, amsRemain:slot.remain, currentBinding:db.spools.find(s=>s.amsSlot===slot.slot)||null, candidates };
  });
  res.json({ suggestions });
});

// ── Barcode lookup proxy ──────────────────────────────────
app.get('/api/barcode-lookup', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const MATERIALS = ['PLA','PETG','ABS','TPU','ASA','NYLON','PA','PC','HIPS','PVA'];
  const BRANDS = ['bambu','anycubic','creality','prusament','overture','esun','sunlu','polymaker','hatchbox','colorfabb'];
  const COLORS = { 'BLACK':'#1a1a1a','WHITE':'#f5f5f5','RED':'#ef4444','BLUE':'#3b82f6','GREEN':'#22c55e',
    'YELLOW':'#eab308','ORANGE':'#f97316','PURPLE':'#a855f7','GREY':'#6b7280','GRAY':'#6b7280',
    'SILVER':'#94a3b8','GOLD':'#ca8a04','BROWN':'#92400e','PINK':'#ec4899','CYAN':'#06b6d4' };

  function parse(title, brand) {
    const text = (title+' '+brand).toUpperCase();
    const material = MATERIALS.find(m=>text.includes(m))||null;
    const wm = text.match(/(\d+)\s*KG|(\d{3,4})\s*G/);
    const totalWeight = wm ? (wm[1]?parseInt(wm[1])*1000:parseInt(wm[2])) : null;
    let colorName=null, colorHex=null;
    for(const [n,h] of Object.entries(COLORS)){ if(text.includes(n)){ colorName=n.charAt(0)+n.slice(1).toLowerCase(); colorHex=h; break; } }
    const nozzleMin = material==='PETG'?220:material==='ABS'?230:190;
    const nozzleMax = material==='PETG'?250:material==='ABS'?250:220;
    const bedTemp   = material==='PETG'?70:material==='ABS'?100:60;
    return { material, totalWeight, colorName, colorHex, nozzleMin, nozzleMax, bedTemp };
  }

  // 1. UPC Item DB
  try {
    const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, { headers:{ Accept:'application/json' } });
    if (r.ok) {
      const d = await r.json();
      if (d.items?.length > 0) {
        const item = d.items[0];
        const p = parse(item.title||'', item.brand||'');
        const isFilament = p.material || BRANDS.some(b=>(item.brand||'').toLowerCase().includes(b)||(item.title||'').toLowerCase().includes(b));
        if (isFilament) return res.json({ brand:item.brand||null, name:item.title, ...p, source:'upcitemdb' });
      }
    }
  } catch(e) { console.log('[barcode] UPC failed:', e.message); }

  // 2. Open Food Facts
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
    if (r.ok) {
      const d = await r.json();
      if (d.status===1 && d.product) {
        const p = parse(d.product.product_name||'', d.product.brands||'');
        if (p.material) return res.json({ brand:d.product.brands||null, name:d.product.product_name, ...p, source:'openfoodfacts' });
      }
    }
  } catch(e) { console.log('[barcode] OpenFF failed:', e.message); }

  res.json({ found: false });
});

// ── Claude API: scansione etichette ───────────────────────
// Chiave: variabile d'ambiente ANTHROPIC_API_KEY (consigliata) oppure salvata da Settings
// in claude_config.json (escluso da git). Modello: ANTHROPIC_MODEL o scelta da Settings.
const CLAUDE_CONFIG_PATH = path.join(__dirname, 'claude_config.json');
const CLAUDE_MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-4-6'];
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const LABEL_PROMPT = `Guarda questa foto di una bobina/confezione di filamento per stampante 3D.
Estrai i dati e rispondi SOLO con JSON valido, nessun testo fuori:
{"brand":"produttore","name":"nome commerciale","material":"PLA|PETG|ABS|TPU|ASA|Nylon","colorName":"nome colore","colorHex":"#RRGGBB","totalWeight":grammi_numero,"nozzleMin":temp_numero,"nozzleMax":temp_numero,"bedTemp":temp_numero}
Campi non visibili: null. Solo JSON.`;
function readClaudeConfig() {
  let c = {}; try { c = JSON.parse(fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf8')); } catch (e) {}
  const key = process.env.ANTHROPIC_API_KEY || c.key || '';
  return { key, source: process.env.ANTHROPIC_API_KEY ? 'env' : (c.key ? 'file' : null), model: c.model || DEFAULT_MODEL };
}
app.get('/api/claude-config', (req, res) => {
  const c = readClaudeConfig();
  res.json({ hasKey: !!c.key, source: c.source, model: c.model, models: CLAUDE_MODELS, keyHint: c.key ? '…' + c.key.slice(-4) : '' });
});
app.post('/api/claude-config', (req, res) => {
  let c = {}; try { c = JSON.parse(fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf8')); } catch (e) {}
  if (typeof req.body.key === 'string') { const k = req.body.key.trim(); if (k) c.key = k; else delete c.key; }
  if (req.body.model) c.model = String(req.body.model).trim();
  fs.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(c, null, 2));
  res.json({ ok: true });
});
async function claudeLabel(image, mediaType) {
  const c = readClaudeConfig();
  if (!c.key) throw new Error('Chiave Claude non configurata: impostala in Settings → Claude AI');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: c.model, max_tokens: 400, messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
      { type: 'text', text: LABEL_PROMPT } ] }] })
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + r.status));
  const text = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}
app.post('/api/vision-scan', async (req, res) => {
  const { image, mediaType } = req.body;
  if (!image) return res.status(400).json({ error: 'Missing image' });
  try { res.json(await claudeLabel(image, mediaType)); }
  catch (e) { res.status(500).json({ error: 'Errore lettura etichetta: ' + e.message }); }
});
app.post('/api/claude-test', async (req, res) => {
  const c = readClaudeConfig();
  if (!c.key) return res.json({ ok: false, error: 'Nessuna chiave configurata' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: c.model, max_tokens: 5, messages: [{ role: 'user', content: 'Rispondi solo: ok' }] }) });
    const d = await r.json();
    res.json(r.ok ? { ok: true, model: d.model || c.model } : { ok: false, error: (d.error && d.error.message) || ('HTTP ' + r.status) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── Backup / ripristino ───────────────────────────────────
// Esporta bobine, posizioni, log e fatture importate (mai token o configurazioni).
app.get('/api/backup', (req, res) => {
  const db = readDB();
  res.set('Content-Disposition', `attachment; filename="filamentbox-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ app: 'FilamentBox', version: VERSION, exportedAt: new Date().toISOString(), spools: db.spools, locations: db.locations || [], printLogs: db.printLogs || [], importedInvoices: db.importedInvoices || [] });
});
app.post('/api/restore', (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.spools)) return res.status(400).json({ error: 'File di backup non valido' });
  const db = readDB();
  db.spools = b.spools; db.locations = Array.isArray(b.locations) ? b.locations : [];
  db.printLogs = Array.isArray(b.printLogs) ? b.printLogs : []; db.importedInvoices = Array.isArray(b.importedInvoices) ? b.importedInvoices : [];
  writeDB(db);
  res.json({ ok: true, spools: db.spools.length });
});

// ── HA Config ─────────────────────────────────────────────
const HA_CONFIG_PATH = path.join(__dirname, 'ha_config.json');

// Entità Home Assistant (integrazione Bambu Lab). I nomi dipendono dal nome della stampante
// e dalla lingua di HA: si cambiano da Settings. Default: stampante "p1s", HA in italiano.
const DEFAULT_ENTITIES = {
  slot1: 'sensor.p1s_ams_slot_1', slot2: 'sensor.p1s_ams_slot_2', slot3: 'sensor.p1s_ams_slot_3', slot4: 'sensor.p1s_ams_slot_4',
  external: 'sensor.p1s_bobina_esterna_bobina_esterna', printStatus: 'sensor.p1s_stato_di_stampa',
  printWeight: 'sensor.p1s_grammatura_stampa', printLength: 'sensor.p1s_lunghezza_stampa', taskName: 'sensor.p1s_nome_attivita',
};
function readHaConfig() {
  let c = { url: '', token: '' };
  if (fs.existsSync(HA_CONFIG_PATH)) c = JSON.parse(fs.readFileSync(HA_CONFIG_PATH, 'utf8'));
  c.entities = { ...DEFAULT_ENTITIES, ...(c.entities || {}) };
  return c;
}
const slotSensorsOf = (cfg) => [cfg.entities.slot1, cfg.entities.slot2, cfg.entities.slot3, cfg.entities.slot4];

app.get('/api/ha-config', (req, res) => {
  const cfg = readHaConfig();
  // Return url always, token masked for display but signal if set
  res.json({ url: cfg.url || '', hasToken: !!cfg.token, entities: cfg.entities, defaults: DEFAULT_ENTITIES });
});

app.post('/api/ha-config', (req, res) => {
  const cur = fs.existsSync(HA_CONFIG_PATH) ? JSON.parse(fs.readFileSync(HA_CONFIG_PATH, 'utf8')) : {};
  const { url, token, entities } = req.body;
  if (url !== undefined) cur.url = url;
  if (token) cur.token = token; // token vuoto = mantieni quello salvato
  if (entities && typeof entities === 'object') cur.entities = Object.fromEntries(Object.entries(entities).filter(([k, v]) => k in DEFAULT_ENTITIES && typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim()]));
  fs.writeFileSync(HA_CONFIG_PATH, JSON.stringify(cur, null, 2));
  res.json({ ok: true });
});

app.get('/api/ha-test', async (req, res) => {
  const cfg = readHaConfig();
  if (!cfg.url || !cfg.token) return res.json({ ok: false, error: 'URL o token non configurati' });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(`${cfg.url}/api/`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!r.ok) return res.json({ ok: false, error: `HTTP ${r.status}` });
    const d = await r.json();
    res.json({ ok: true, name: d.location_name || 'Home Assistant' });
  } catch(e) {
    res.json({ ok: false, error: e.name === 'AbortError' ? 'Timeout — HA non raggiungibile' : e.message });
  }
});

// ── HA AMS Slots ──────────────────────────────────────────
app.post('/api/sync-remain-from-ha', async (req, res) => {
  const cfg = readHaConfig();
  if (!cfg.url || !cfg.token) {
    return res.json({ error: 'Home Assistant non configurato. Inserisci URL e token in Settings.' });
  }

  const slotSensors = slotSensorsOf(cfg);

  const db = readDB();
  const updates = [];

  for (let i = 0; i < slotSensors.length; i++) {
    const slotNum = i + 1;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 5000);
      const r = await fetch(`${cfg.url}/api/states/${slotSensors[i]}`, {
        headers: { Authorization: `Bearer ${cfg.token}` },
        signal: controller.signal
      });
      clearTimeout(tid);
      if (!r.ok) continue;
      const d = await r.json();
      const attr = d.attributes || {};
      const remain = attr.remain !== undefined ? attr.remain : -1;
      if (remain < 0) continue; // slot vuoto o dato non disponibile, salta

      const spool = db.spools.find(s => s.amsSlot === slotNum);
      if (!spool || !spool.totalWeight) continue;

      // Il remain% letto dall'AMS è affidabile solo per bobine Bambu Lab
      // originali (RFID Mifare Classic proprietario, letto e aggiornato
      // dalla stampante stessa). Per bobine generiche con il nostro tag
      // OpenTag3D, l'AMS non può leggere il tag: il valore "remain" che
      // HA riporta in quel caso non è affidabile e non va usato — per
      // quelle bobine il tracciamento corretto resta quello a sottrazione
      // grammi già applicato dal webhook print-done ad ogni stampa.
      const isBambuTag = (spool.brand || '').toLowerCase().includes('bambu');
      if (!isBambuTag) continue;

      const oldWeight = spool.remainingWeight;
      const newWeight = Math.round(spool.totalWeight * remain / 100);
      if (newWeight !== oldWeight) {
        spool.remainingWeight = newWeight;
        updateSpoolStatus(spool);
        updates.push({
          slot: slotNum, spoolId: spool.id, spoolName: `${spool.brand} ${spool.name}`,
          oldWeight, newWeight, remainPct: remain
        });
      }
    } catch (slotErr) {
      console.log(`[sync-remain] slot ${slotNum}:`, slotErr.message);
    }
  }

  if (updates.length > 0) writeDB(db);
  res.json({ ok: true, updated: updates.length, details: updates });
});

app.get('/api/ha-ams-slots', async (req, res) => {
  const cfg = readHaConfig();
  if (!cfg.url || !cfg.token) {
    return res.json({ error: 'Home Assistant non configurato. Inserisci URL e token in Settings.' });
  }

  const slotSensors = slotSensorsOf(cfg);
  const slots = [];

  try {
    for (let i = 0; i < slotSensors.length; i++) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        const r = await fetch(`${cfg.url}/api/states/${slotSensors[i]}`, {
          headers: { Authorization: `Bearer ${cfg.token}` },
          signal: controller.signal
        });
        clearTimeout(tid);
        if (!r.ok) continue;
        const d = await r.json();
        const attr = d.attributes || {};
        slots.push({
          slot: i + 1,
          name: d.state || 'Unknown',
          type: attr.type || '',
          color: ((attr.cols || attr.color || '#888888') + '').slice(0, 7),
          remain: attr.remain !== undefined ? attr.remain : -1,
          empty: attr.empty === true || d.state === 'Empty',
          nozzleMin: attr.nozzle_temp_min || null,
          nozzleMax: attr.nozzle_temp_max || null,
          bedTemp: attr.bed_temp || null,
          trayWeight: attr.tray_weight || null,
        });
      } catch(slotErr) {
        console.log(`[ha-ams] slot ${i+1}:`, slotErr.message);
      }
    }
    res.json({ slots });
  } catch(e) {
    res.json({ error: 'Errore connessione HA: ' + e.message });
  }
});

// ── Deduplicazione webhook ────────────────────────────────
// ── Tracciamento slot attivo durante la stampa (v1.5.1) ──
const RUNNING_STATES = ['running', 'prepare', 'pause'];
const printTrack = { running: false, counts: {}, best: null, bestAt: null };

async function haState(cfg, id) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(`${cfg.url}/api/states/${id}`, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: controller.signal });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; } finally { clearTimeout(tid); }
}

async function pollActiveSlot() {
  const cfg = readHaConfig();
  if (!cfg.url || !cfg.token) return;
  const st = await haState(cfg, cfg.entities.printStatus);
  if (!st) return;
  if (!RUNNING_STATES.includes(st.state)) { printTrack.running = false; return; }
  if (!printTrack.running) { printTrack.running = true; printTrack.counts = {}; } // nuova stampa
  const ids = [[1, cfg.entities.slot1], [2, cfg.entities.slot2], [3, cfg.entities.slot3], [4, cfg.entities.slot4], ['ext', cfg.entities.external]];
  for (const [key, id] of ids) {
    const d = await haState(cfg, id);
    if (d && d.attributes && d.attributes.active === true) printTrack.counts[key] = (printTrack.counts[key] || 0) + 1;
  }
  const entries = Object.entries(printTrack.counts).sort((a, b) => b[1] - a[1]);
  if (entries.length) {
    const k = entries[0][0];
    printTrack.best = k === 'ext' ? 'ext' : Number(k);
    printTrack.bestAt = Date.now();
  }
}
setInterval(() => pollActiveSlot().catch(e => console.log('[track]', e.message)), 20000);
app.get('/api/print-tracker', (req, res) => res.json(printTrack));

const recentWebhooks = new Map();
function isDuplicateWebhook(key) {
  const now = Date.now();
  if (recentWebhooks.has(key) && now - recentWebhooks.get(key) < 60000) return true;
  recentWebhooks.set(key, now);
  for (const [k, t] of recentWebhooks) { if (now - t > 120000) recentWebhooks.delete(k); }
  return false;
}

// ── Webhook NFC scan (da ESP32/D1 Mini + PN532) ──────────
// ── Heartbeat lettore NFC fisico ──────────────────────────
// Il D1 Mini chiama questo endpoint ogni 30 secondi. Salviamo l'ultimo
// contatto in memoria (non serve persisterlo su disco) così in Settings
// si vede se il lettore è ancora vivo, senza dover scollegare nulla per
// controllare fisicamente.
let readerHeartbeat = { lastSeen: null, pn532Ok: null, ip: null, rssi: null, uptimeSec: null };

app.post('/api/webhook/reader-heartbeat', (req, res) => {
  const db = readDB();
  const token = req.query.token || req.headers['x-filamentbox-token'];
  if (!token || token !== db.webhookToken) return res.status(401).json({ error: 'Unauthorized' });

  readerHeartbeat = {
    lastSeen: new Date().toISOString(),
    pn532Ok: req.body.pn532_ok !== undefined ? req.body.pn532_ok : null,
    ip: req.body.ip || null,
    rssi: req.body.rssi !== undefined ? req.body.rssi : null,
    uptimeSec: req.body.uptime_sec !== undefined ? req.body.uptime_sec : null,
  };
  res.json({ ok: true });
});

app.get('/api/reader-status', (req, res) => {
  if (!readerHeartbeat.lastSeen) {
    return res.json({ connected: false, message: 'Nessun segnale ricevuto dal lettore NFC finora.' });
  }
  const secondsAgo = Math.round((Date.now() - new Date(readerHeartbeat.lastSeen).getTime()) / 1000);
  // Se non sentiamo il lettore da più di 90 secondi (3 mancati heartbeat),
  // consideriamolo scollegato/spento.
  const connected = secondsAgo < 90;
  res.json({ connected, secondsAgo, ...readerHeartbeat });
});

app.post('/api/webhook/nfc-scan', (req, res) => {
  const db = readDB();
  const token = req.query.token || req.headers['x-filamentbox-token'];
  if (!token || token !== db.webhookToken) return res.status(401).json({ error: 'Unauthorized' });

  const uid = (req.body.uid || '').toUpperCase();
  if (!uid) return res.status(400).json({ error: 'Missing uid' });

  if (isDuplicateWebhook('nfc:' + uid)) {
    return res.json({ ok: true, skipped: 'duplicate' });
  }

  // Cerca bobina con questo UID già associato
  const spool = db.spools.find(s => s.nfcUid === uid);
  if (spool) {
    // Aggiorna i campi con i dati letti dal tag — utile sia per OpenTag3D
    // (colore/materiale scritti da noi) sia per un tag Bambu nativo già
    // associato in precedenza, che può fornire dati più ricchi (nome
    // dettagliato, peso, temperature) di quelli salvati inizialmente.
    const updated = {};
    if (req.body.material)      { spool.material  = req.body.material;      updated.material  = req.body.material; }
    if (req.body.color_hex)     { spool.colorHex   = req.body.color_hex;    updated.colorHex  = req.body.color_hex; }
    if (req.body.color_name)    { spool.colorName  = req.body.color_name;   updated.colorName = req.body.color_name; }
    if (req.body.detailed_type) { spool.name       = req.body.detailed_type; updated.name      = req.body.detailed_type; }
    if (req.body.weight && !spool.totalWeight) { spool.totalWeight = req.body.weight; updated.totalWeight = req.body.weight; }
    if (req.body.print_temp)     { spool.nozzleMax = req.body.print_temp;     updated.nozzleMax = req.body.print_temp; }
    if (req.body.print_temp_min) { spool.nozzleMin = req.body.print_temp_min; updated.nozzleMin = req.body.print_temp_min; }
    if (req.body.bed_temp)       { spool.bedTemp   = req.body.bed_temp;       updated.bedTemp   = req.body.bed_temp; }
    writeDB(db);
    return res.json({ ok: true, found: true, spoolId: spool.id, spoolName: `${spool.brand} ${spool.name}`, updated });
  }

  // Tag non ancora associato a nessuna bobina.
  // Se è un tag Bambu Lab nativo con dati materiale leggibili, creiamo
  // automaticamente la bobina in libreria — non serve intervento manuale,
  // dato che il tag Bambu esiste già di fabbrica e non lo scriviamo noi.
  if (req.body.format === 'bambu_native' && req.body.material) {
    // Il bed_temp letto dal tag non è verificato con certezza (i campioni
    // ABS disponibili per il test mostravano sempre 0 in quella posizione,
    // segno che l'offset assunto potrebbe non essere quello giusto per
    // questo campo). Se il tag restituisce 0, usiamo un default sensato
    // per famiglia di materiale invece di salvare un valore chiaramente
    // errato.
    const bedTempDefaults = {
      PLA: 60, PETG: 80, ABS: 100, 'ABS-GF': 100, ASA: 100,
      TPU: 50, NYLON: 90, PA: 90, 'PA-CF': 90, PC: 100
    };
    let bedTemp = req.body.bed_temp || 0;
    if (!bedTemp) {
      const key = Object.keys(bedTempDefaults).find(k =>
        (req.body.material || '').toUpperCase().includes(k)
      );
      bedTemp = key ? bedTempDefaults[key] : 60;
    }

    const newSpool = {
      id: Date.now().toString(),
      brand: req.body.brand || 'Bambu Lab',
      name: req.body.detailed_type || req.body.material,
      material: req.body.material,
      colorHex: req.body.color_hex || '#888888',
      colorName: '',
      totalWeight: req.body.weight || 1000,
      remainingWeight: req.body.weight || 1000,
      nozzleMin: req.body.print_temp_min || null,
      nozzleMax: req.body.print_temp || null,
      bedTemp: bedTemp,
      location: '',
      createdViaNfc: true,
      sealed: false,
      notes: `Auto-creata da tag Bambu Lab nativo (${req.body.material_id || ''})`.trim(),
      nfcUid: uid,
      amsSlot: null,
      printerSlot: null,
      status: 'available',
      createdAt: new Date().toISOString(),
    };
    db.spools.push(newSpool);
    writeDB(db);
    return res.json({
      ok: true, found: true, created: true,
      spoolId: newSpool.id, spoolName: `${newSpool.brand} ${newSpool.name}`,
      bedTempEstimated: !req.body.bed_temp
    });
  }

  // Tag non riconosciuto in nessun formato — restituisce i dati letti
  // così il frontend può proporre di creare/associare una bobina manualmente
  return res.json({
    ok: true,
    found: false,
    uid,
    format:    req.body.format    || 'uid_only',
    material:  req.body.material  || null,
    brand:     req.body.brand     || null,
    colorHex:  req.body.color_hex || null,
    colorName: req.body.color_name|| null,
    weight:    req.body.weight    || null,
    printTemp: req.body.print_temp|| null,
    bedTemp:   req.body.bed_temp  || null,
  });
});

// ── Associa UID NFC a una bobina ─────────────────────────
app.post('/api/spools/:id/nfc-uid', (req, res) => {
  const db = readDB();
  const spool = db.spools.find(s => s.id === req.params.id);
  if (!spool) return res.status(404).json({ error: 'Not found' });
  spool.nfcUid = (req.body.uid || '').toUpperCase();
  writeDB(db);
  res.json({ ok: true, nfcUid: spool.nfcUid });
});

// ── OpenTag3D binary encoder (Core profile v1.0) ─────────
function encodeOpenTag3D(spool) {
  const buf = Buffer.alloc(0x70);
  buf.writeUInt16BE(1000, 0x00);
  const wfs = (o, l, v) => Buffer.from(String(v),'utf8').slice(0,l).copy(buf, o);
  wfs(0x02, 5, spool.material||'PLA');
  wfs(0x07, 5, spool.modifier||'');
  wfs(0x1B, 16, spool.brand||'Generic');
  wfs(0x2B, 32, spool.colorName||spool.name||'');
  const c = String(spool.colorHex||'#888888').replace('#','');
  const rgb = parseInt(c.slice(0,6),16)||0;
  buf[0x4B]=(rgb>>16)&0xFF; buf[0x4C]=(rgb>>8)&0xFF; buf[0x4D]=rgb&0xFF; buf[0x4E]=255;
  buf.writeUInt16BE(Math.min(Math.round((spool.diameterMm||1.75)*1000),0xFFFF),0x5C);
  buf.writeUInt16BE(Math.min(spool.totalWeight||1000,0xFFFF),0x5E);
  const dens={'PETG':1.27,'ABS':1.04,'TPU':1.21,'ASA':1.07,'NYLON':1.14,'PA':1.14,'PLA':1.24};
  buf[0x60]=Math.min(Math.round((spool.nozzleMax||spool.nozzleMin||210)/5),255);
  buf[0x61]=Math.min(Math.round((spool.bedTemp||60)/5),255);
  buf.writeUInt16BE(Math.round((dens[(spool.material||'PLA').toUpperCase()]||1.24)*1000),0x62);
  return buf;
}

app.get('/api/spools/:id/nfc-tag.bin', (req, res) => {
  const db = readDB();
  const spool = db.spools.find(s=>s.id===req.params.id);
  if (!spool) return res.status(404).json({ error: 'Not found' });
  const bin = encodeOpenTag3D(spool);
  const name = (spool.name||spool.material||'spool').replace(/[^a-z0-9]/gi,'_');
  res.setHeader('Content-Type','application/octet-stream');
  res.setHeader('Content-Disposition',`attachment; filename="opentag3d_${name}.bin"`);
  res.send(bin);
});

// ── Coda di scrittura tag NFC via lettore fisico (D1 Mini + PN532) ──
// Alternativa alla scrittura da telefono/NFC Tools Pro: il D1 Mini
// interroga periodicamente questo endpoint, e se c'è un lavoro in coda
// scrive il tag OpenTag3D al prossimo tag rilevato.
let pendingNfcWrite = null; // { spoolId, spoolName, payloadHex, queuedAt }
let lastNfcWriteResult = null; // { success, timedOut, spoolId, spoolName, uid, completedAt }

app.post('/api/spools/:id/queue-nfc-write', (req, res) => {
  const db = readDB();
  const spool = db.spools.find(s => s.id === req.params.id);
  if (!spool) return res.status(404).json({ error: 'Bobina non trovata' });

  const bin = encodeOpenTag3D(spool);
  pendingNfcWrite = {
    spoolId: spool.id,
    spoolName: `${spool.brand} ${spool.name}`,
    payloadHex: bin.toString('hex'),
    queuedAt: new Date().toISOString(),
  };
  res.json({ ok: true, message: 'Avvicina un tag vuoto al lettore fisico entro 2 minuti.' });
});

app.get('/api/nfc-write-job', (req, res) => {
  const token = req.query.token || req.headers['x-filamentbox-token'];
  const db = readDB();
  if (!token || token !== db.webhookToken) return res.status(401).json({ error: 'Unauthorized' });

  if (!pendingNfcWrite) return res.json({ pending: false });

  // Scade dopo 2 minuti se nessun tag viene presentato al lettore
  const ageMs = Date.now() - new Date(pendingNfcWrite.queuedAt).getTime();
  if (ageMs > 120000) {
    lastNfcWriteResult = {
      success: false, timedOut: true,
      spoolId: pendingNfcWrite.spoolId, spoolName: pendingNfcWrite.spoolName,
      completedAt: new Date().toISOString()
    };
    pendingNfcWrite = null;
    return res.json({ pending: false });
  }
  res.json({ pending: true, spoolId: pendingNfcWrite.spoolId, payloadHex: pendingNfcWrite.payloadHex });
});

app.post('/api/nfc-write-job/complete', (req, res) => {
  const token = req.query.token || req.headers['x-filamentbox-token'];
  const db = readDB();
  if (!token || token !== db.webhookToken) return res.status(401).json({ error: 'Unauthorized' });

  const wasSpoolId = pendingNfcWrite ? pendingNfcWrite.spoolId : null;
  const wasSpoolName = pendingNfcWrite ? pendingNfcWrite.spoolName : null;
  pendingNfcWrite = null;

  if (req.body.success && wasSpoolId) {
    const spool = db.spools.find(s => s.id === wasSpoolId);
    if (spool) {
      spool.nfcUid = (req.body.uid || spool.nfcUid || '').toUpperCase();
      writeDB(db);
    }
  }

  lastNfcWriteResult = {
    success: !!req.body.success, timedOut: false,
    spoolId: wasSpoolId, spoolName: wasSpoolName,
    uid: req.body.uid || null,
    completedAt: new Date().toISOString()
  };

  res.json({ ok: true, spoolName: wasSpoolName });
});

app.get('/api/nfc-write-job/status', (req, res) => {
  if (pendingNfcWrite) {
    const secondsAgo = Math.round((Date.now() - new Date(pendingNfcWrite.queuedAt).getTime()) / 1000);
    return res.json({ pending: true, spoolId: pendingNfcWrite.spoolId, spoolName: pendingNfcWrite.spoolName, secondsAgo });
  }
  // Non più in coda — restituisce l'ultimo esito noto (successo/fallimento/timeout),
  // così il frontend distingue "scritto bene" da "scaduto senza tag" o "errore scrittura".
  res.json({ pending: false, lastResult: lastNfcWriteResult });
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  initDB();
  const db = readDB();
  console.log(`FilamentBox v${VERSION} (${EDITION}) in ascolto sulla porta ${PORT}${EDITION === 'full' ? ' · Prismatica su /prismatica/' : ''}`);
  console.log(`Webhook: http://<indirizzo-del-server>:${PORT}/api/webhook/print-done?token=${db.webhookToken}`);
});

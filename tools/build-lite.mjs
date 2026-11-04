// Genera l'edizione Lite (senza server) in ../lite a partire da ../server/public.
// Uso:  cd tools && npm install && npm run build:lite
// - inserisce edition.js + local-api.js (le API diventano locali, dati in localStorage)
// - Prismatica: three.js viene incluso nel file, così funziona anche offline e da file://
// - aggiunge sw.js per installarla come app (PWA) quando è servita via https
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'server', 'public');
const OUT = path.join(ROOT, 'lite');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'package.json'), 'utf8')).version;

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });

// 1) edizione + API locale
fs.writeFileSync(path.join(OUT, 'edition.js'),
  `// FilamentBox Lite v${VERSION} — generato da tools/build-lite.mjs\nwindow.FB_EDITION = { name: 'lite', version: '${VERSION}', features: ['prismatica', 'local'] };\n`);
fs.copyFileSync(path.join(HERE, 'lite', 'local-api.js'), path.join(OUT, 'local-api.js'));

const indexPath = path.join(OUT, 'index.html');
let index = fs.readFileSync(indexPath, 'utf8');
if (!index.includes('<script src="edition.js"></script>')) throw new Error('edition.js non trovato in index.html');
index = index.replace('<script src="edition.js"></script>', '<script src="edition.js"></script>\n<script src="local-api.js"></script>');
fs.writeFileSync(indexPath, index);

// 2) Prismatica offline: il modulo con import da CDN diventa uno script classico con three.js incluso
const prisPath = path.join(OUT, 'prismatica', 'index.html');
let pris = fs.readFileSync(prisPath, 'utf8');
const mod = pris.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!mod) throw new Error('script module di Prismatica non trovato');
const entry = path.join(HERE, '.prismatica-entry.mjs');
fs.writeFileSync(entry, mod[1].replace("if (typeof module !== 'undefined') module.exports", 'if (false) module.exports'));
const built = await esbuild.build({ entryPoints: [entry], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', nodePaths: [path.join(HERE, 'node_modules')], logLevel: 'warning' });
fs.rmSync(entry);
const bundle = built.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
pris = pris.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
pris = pris.replace(mod[0], () => `<script>\n${bundle}\n</script>`);
pris = pris.replace('<head>', '<head>\n<script src="../edition.js"></script>\n<script src="../local-api.js"></script>');
fs.writeFileSync(prisPath, pris);

// 3) service worker: cache dei file per uso offline
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files.push(path.relative(OUT, p).split(path.sep).join('/')); } })(OUT);
fs.writeFileSync(path.join(OUT, 'sw.js'), `// FilamentBox Lite v${VERSION} — cache offline
const CACHE = 'filamentbox-lite-${VERSION}';
const FILES = ${JSON.stringify(['./', ...files])};
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
`);
fs.writeFileSync(path.join(OUT, 'README.txt'), `FilamentBox Lite v${VERSION}\r\n\r\nApri index.html con Chrome, Edge o Firefox: funziona senza server e senza internet.\r\nI dati restano in questo browser: fai un backup da Settings -> Backup dei dati.\r\nGuida completa: docs/edizione-lite.md nel repository.\r\n`);
console.log(`Lite v${VERSION} generata in ${path.relative(ROOT, OUT)}/ (${files.length} file)`);

/* Tratto — lingua dell'interfaccia (italiano / inglese).
   L'app è scritta in italiano; in inglese ogni testo che compare nella pagina viene tradotto con il dizionario
   window.TRATTO_EN (chiave = testo italiano con i numeri sostituiti da #). Lingua: ?lang=it|en, poi la scelta
   salvata, poi la lingua del browser. Con ?i18n=misses la console elenca i testi senza traduzione. */
(function (root) {
'use strict';
const q = new URLSearchParams(location.search).get('lang');
let lang = null;
if (q === 'it' || q === 'en') { lang = q; try { localStorage.setItem('tratto.lang', q); } catch (e) {} }
if (!lang) { try { lang = localStorage.getItem('tratto.lang'); } catch (e) {} }
if (lang !== 'it' && lang !== 'en') lang = /^it\b/i.test(navigator.language || '') ? 'it' : 'en';
root.TRATTO_LANG = lang;
root.tL = (it, en) => (lang === 'en' ? en : it);
document.documentElement.lang = lang;

const D = root.TRATTO_EN || { t: {}, re: [] };
const RE = (D.re || []).map(([s, r]) => [new RegExp('^' + s + '$'), r]);
const NUM = /(?<![A-Za-z0-9_.,#])(\d+(?:[.,]\d+)?)(?![A-Za-z0-9_])/g;
const INLINE = new Set(['B', 'I', 'U', 'KBD', 'A', 'EM', 'STRONG', 'BR', 'SMALL', 'CODE', 'SUB', 'SUP']);
const misses = root.TRATTO_I18N_MISSES = new Set();
let quiet = 0;
const track = /[?&]i18n=misses/.test(location.search);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
// testo → { key, nums }: i numeri del testo (non quelli dentro i tag) diventano #
function templ(s, html) {
  const nums = [];
  const parts = html ? s.split(/(<[^>]+>)/) : [s];
  const key = parts.map((p, i) => (html && i % 2) ? p : p.replace(NUM, (m) => { nums.push(m); return '#'; })).join('');
  return { key, nums };
}
function fill(t, nums, html) {
  let i = 0;
  const parts = html ? t.split(/(<[^>]+>)/) : [t];
  return parts.map((p, k) => (html && k % 2) ? p : p.replace(/#/g, () => { const n = nums[i++]; return n == null ? '#' : n.replace(',', '.'); })).join('');
}
function trCore(core, html) {
  if (D.t[core] != null) return D.t[core];
  const { key, nums } = templ(core, html);
  if (D.t[key] != null) return fill(D.t[key], nums, html);
  if (!html) for (const [re, r] of RE) {
    const m = core.match(re);
    if (m) return r.replace(/\$(t?)(\d)/g, (_, t, d) => { const g = m[+d] || ''; return t ? (tr(g) ?? g) : g; });
  }
  if (track && !quiet && /[A-Za-zÀ-ÿ]{2}/.test(core)) misses.add(key);
  return null;
}
// testo semplice → traduzione (con gli spazi iniziali e finali) o null
function tr(s) {
  if (lang !== 'en' || !s) return null;
  const core = norm(s);
  if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return null;
  const out = trCore(core, false);
  if (out == null) return null;
  return (/^\s/.test(s) ? ' ' : '') + out + (/\s$/.test(s) ? ' ' : '');
}
const inlineOnly = (el) => el.children.length > 0 && [...el.querySelectorAll('*')].every(c => INLINE.has(c.tagName));
const done = new WeakMap();
function walk(n) {
  if (n.nodeType === 3) {
    if (done.get(n) === n.data) return;
    const p = n.parentElement; if (p && /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.tagName)) return;
    const t = tr(n.data); if (t != null && t !== n.data) n.data = t;
    done.set(n, n.data); return;
  }
  if (n.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA|SVG|CANVAS)$/i.test(n.tagName)) return;
  attrs(n);
  if (inlineOnly(n)) {
    const core = norm(n.innerHTML);
    if (done.get(n) === core) return;
    const t = /[A-Za-zÀ-ÿ]/.test(core) ? trCore(core, true) : null;
    if (t != null) { if (t !== core) n.innerHTML = t; done.set(n, norm(n.innerHTML)); n.querySelectorAll('*').forEach(attrs); return; }
    quiet++; try { n.childNodes.forEach(walk); } finally { quiet--; } return;
  }
  n.childNodes.forEach(walk);
}
function attrs(el) {
  for (const a of ['title', 'placeholder', 'alt', 'aria-label']) {
    const v = el.getAttribute && el.getAttribute(a); if (!v) continue;
    const t = tr(v); if (t != null && t !== v) el.setAttribute(a, t);
  }
}
root.TRATTO_TR = (s) => tr(s) ?? s;

if (lang === 'en') {
  const tt = tr(document.title); if (tt) document.title = tt;
  walk(document.body);
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') {
        const el = m.target.parentElement;
        if (el && inlineOnly(el)) walk(el); else walk(m.target);
      } else if (m.type === 'attributes') attrs(m.target);
      else m.addedNodes.forEach((x) => { const el = m.target; if (x.nodeType === 3 && el.nodeType === 1 && inlineOnly(el)) walk(el); else walk(x); });
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'alt', 'aria-label'] });
}

// selettore lingua nell'intestazione
const sw = document.getElementById('langSw');
if (sw) {
  sw.textContent = lang === 'en' ? 'IT' : 'EN';
  sw.title = lang === 'en' ? 'Passa all’italiano' : 'Switch to English';
  sw.addEventListener('click', () => {
    const nl = lang === 'en' ? 'it' : 'en';
    try { localStorage.setItem('tratto.lang', nl); } catch (e) {}
    const u = new URL(location.href); u.searchParams.set('lang', nl); location.replace(u.href);
  });
}
})(window);

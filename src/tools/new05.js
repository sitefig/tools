// Tools from free-browser-tools.md, batch 05 (web performance and accessibility). See TOOLS.md for the contract.
// Skipped on purpose (need a server, API key or live page): PageSpeed/CrUX runners, live-URL Lighthouse, iframe testers,
// AVIF/Brotli encoders (no browser API, no third-party code), video flash analysis.
const T = [];

// ---------- shared helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtB = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB');
const r1 = (n, d = 1) => Number(n.toFixed(d));
const need = (s, what = 'HTML') => { if (!s || !String(s).trim()) throw new Error('Paste ' + what + ' first.'); };
const tbl = (rows) => {
  const w = []; rows.forEach((r) => r.forEach((c, i) => { w[i] = Math.max(w[i] || 0, String(c).length); }));
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? String(c) : String(c).padEnd(w[i]))).join('  ').trimEnd()).join('\n');
};
const attrQ = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const clip = (s, n = 90) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '...' : s; };

// ---------- tolerant HTML parser (no DOM, works in Node and the browser) ----------
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const CLOSES = { li: ['li'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], option: ['option'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'], thead: ['tbody', 'tfoot'], tbody: ['thead', 'tbody', 'tfoot'], p: ['p'] };
const P_CLOSERS = new Set('address article aside blockquote div dl fieldset footer form h1 h2 h3 h4 h5 h6 header hr main nav ol p pre section table ul'.split(' '));
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const c = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1); try { return String.fromCodePoint(c); } catch { return m; } }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[e.toLowerCase()] ?? m;
});
function parseHTML(src) {
  const root = { tag: '#root', attrs: {}, kids: [], pos: 0, src, open: '' };
  let cur = root, m;
  const re = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\?[^>]*>|<\/([a-zA-Z][^\s>/]*)[^>]*>|<([a-zA-Z][^\s>/]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|[^<]+|</g;
  while ((m = re.exec(src))) {
    if (m[1]) { const t = m[1].toLowerCase(); let n = cur; while (n !== root && n.tag !== t) n = n.parent; if (n !== root) cur = n.parent; continue; }
    if (m[2]) {
      const t = m[2].toLowerCase();
      if (t === 'p' || P_CLOSERS.has(t)) { if (cur.tag === 'p') cur = cur.parent; }
      const cl = CLOSES[t]; if (cl) while (cl.includes(cur.tag)) cur = cur.parent;
      const attrs = {}; let a = m[3], selfc = false;
      if (/\/\s*$/.test(a)) { selfc = true; a = a.replace(/\/\s*$/, ''); }
      a.replace(/([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, (_, k, v1, v2, v3) => { k = k.toLowerCase(); if (!(k in attrs)) attrs[k] = decode(v1 ?? v2 ?? v3 ?? ''); return ''; });
      const n = { tag: t, attrs, kids: [], parent: cur, pos: m.index, open: m[0] };
      cur.kids.push(n);
      if (RAW.has(t) && !selfc) {
        const end = src.toLowerCase().indexOf('</' + t, re.lastIndex), stop = end < 0 ? src.length : end;
        if (stop > re.lastIndex) n.kids.push({ tag: '#text', text: src.slice(re.lastIndex, stop), parent: n, pos: re.lastIndex, raw: true });
        const gt = end < 0 ? src.length : src.indexOf('>', end); re.lastIndex = gt < 0 ? src.length : gt + 1;
      } else if (!VOID.has(t) && !selfc) cur = n;
      continue;
    }
    if (m[0] === '<') cur.kids.push({ tag: '#text', text: '<', parent: cur, pos: m.index });
    else if (m[0][0] !== '<') cur.kids.push({ tag: '#text', text: decode(m[0]), parent: cur, pos: m.index });
  }
  return root;
}
function* walk(n) { for (const k of n.kids) if (k.tag !== '#text') { yield k; yield* walk(k); } }
const all = (root) => [...walk(root)];
const textOf = (n) => (n.tag === '#text' ? n.text : n.tag === 'script' || n.tag === 'style' ? '' : n.kids.map(textOf).join(''));
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const lineOf = (root, n) => root.src.slice(0, n.pos).split('\n').length;
const rootOf = (n) => { while (n.parent) n = n.parent; return n; };
const where = (root, n) => `line ${lineOf(root, n)}: ${clip(n.open, 80)}`;
const hasAnc = (n, f) => { for (let p = n.parent; p && p.tag !== '#root'; p = p.parent) if (f(p)) return true; return false; };
const isHidden = (n) => { for (let p = n; p && p.tag !== '#root'; p = p.parent) { const a = p.attrs; if ('hidden' in a || a['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(a.style || '') || (p.tag === 'input' && (a.type || '').toLowerCase() === 'hidden')) return true; } return false; };
const byId = (root) => { const m = new Map(); for (const n of walk(root)) if (n.attrs.id && !m.has(n.attrs.id)) m.set(n.attrs.id, n); return m; };

// ---------- small CSS selector matcher over the parsed tree ----------
const STATEFUL = new Set('hover focus active visited link any-link focus-visible focus-within target checked disabled enabled required optional valid invalid read-only read-write placeholder-shown default indeterminate in-range out-of-range autofill fullscreen target-within user-invalid modal open popover-open'.split(' '));
function splitTop(s, sep = ',') {
  const out = []; let d = 0, q = '', last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c; else if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--;
    else if (c === sep && d === 0) { out.push(s.slice(last, i)); last = i + 1; }
  }
  out.push(s.slice(last)); return out.map((x) => x.trim()).filter(Boolean);
}
const unesc = (s) => s.replace(/\\(.)/g, '$1');
function parseComplex(s) {
  const parts = []; let i = 0, comb = ' ', unsup = false; s = s.trim();
  while (i < s.length) {
    const c = { comb, tag: '*', id: null, cls: [], attrs: [], first: false, last: false, only: false, empty: false, root: false, not: [] };
    let any = false;
    while (i < s.length && !/[\s>+~]/.test(s[i])) {
      const ch = s[i];
      if (ch === '*') { i++; any = true; }
      else if (ch === '#' || ch === '.') { const m = /^[#.]((?:\\.|[\w-]|[^\x00-\x7f])+)/.exec(s.slice(i)); if (!m) { unsup = true; i++; continue; } if (ch === '#') c.id = unesc(m[1]); else c.cls.push(unesc(m[1])); i += m[0].length; any = true; }
      else if (ch === '[') {
        let j = i, q = ''; for (; j < s.length; j++) { if (q) { if (s[j] === q) q = ''; } else if (s[j] === '"' || s[j] === "'") q = s[j]; else if (s[j] === ']') break; }
        const m = /^\[\s*([\w:-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))\s*(?:\s([iIsS]))?)?\s*$/.exec(s.slice(i, j + 1));
        if (m) c.attrs.push({ n: m[1].toLowerCase(), op: m[2] || '', v: m[3] ?? m[4] ?? m[5] ?? '', ci: /^[iI]$/.test(m[6] || '') }); else unsup = true;
        i = j + 1; any = true;
      } else if (ch === ':') {
        const m = /^(::?)([\w-]+)/.exec(s.slice(i)); if (!m) { unsup = true; i++; continue; }
        i += m[0].length; let arg = null;
        if (s[i] === '(') { let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')' && --d === 0) break; } arg = s.slice(i + 1, j); i = j + 1; }
        const nm = m[2].toLowerCase(); any = true;
        if (m[1] === '::' || ['before', 'after', 'first-line', 'first-letter'].includes(nm)) continue;
        if (STATEFUL.has(nm)) continue;
        if (nm === 'first-child') c.first = true; else if (nm === 'last-child') c.last = true; else if (nm === 'only-child') c.only = true;
        else if (nm === 'empty') c.empty = true; else if (nm === 'root') c.root = true;
        else if (nm === 'not' && arg) { const subs = splitTop(arg).map(parseComplex); if (subs.some((x) => x.unsup || x.parts.length !== 1)) unsup = true; else c.not.push(...subs.map((x) => x.parts[0])); }
        else unsup = true;
      } else { const m = /^(?:\\.|[\w-]|[^\x00-\x7f])+/.exec(s.slice(i)); if (!m) { unsup = true; i++; continue; } c.tag = m[0].toLowerCase(); i += m[0].length; any = true; }
    }
    if (any) parts.push(c); else if (i < s.length && !/[\s>+~]/.test(s[i])) { unsup = true; i++; }
    comb = ' ';
    while (i < s.length && /[\s>+~]/.test(s[i])) { if (s[i] !== ' ' && !/\s/.test(s[i])) comb = s[i]; i++; }
  }
  if (!parts.length) unsup = true;
  return { parts, unsup };
}
function matchC(n, c) {
  if (c.tag !== '*' && n.tag !== c.tag) return false;
  if (c.id && n.attrs.id !== c.id) return false;
  if (c.cls.length) { const cl = (n.attrs.class || '').split(/\s+/); if (!c.cls.every((x) => cl.includes(x))) return false; }
  for (const a of c.attrs) {
    if (!(a.n in n.attrs)) return false;
    if (!a.op) continue;
    let v = n.attrs[a.n], w = a.v; if (a.ci) { v = v.toLowerCase(); w = w.toLowerCase(); }
    if (a.op === '=' && v !== w) return false;
    if (a.op === '~=' && !v.split(/\s+/).includes(w)) return false;
    if (a.op === '|=' && !(v === w || v.startsWith(w + '-'))) return false;
    if (a.op === '^=' && !(w && v.startsWith(w))) return false;
    if (a.op === '$=' && !(w && v.endsWith(w))) return false;
    if (a.op === '*=' && !(w && v.includes(w))) return false;
  }
  const el = n.parent ? n.parent.kids.filter((k) => k.tag !== '#text') : [n];
  if (c.first && el[0] !== n) return false;
  if (c.last && el[el.length - 1] !== n) return false;
  if (c.only && el.length !== 1) return false;
  if (c.empty && n.kids.some((k) => k.tag !== '#text' || k.text.trim() !== '')) return false;
  if (c.root && n.parent && n.parent.tag !== '#root') return false;
  for (const x of c.not) if (matchC(n, x)) return false;
  return true;
}
function matchSel(n, parts, k = parts.length - 1) {
  if (!matchC(n, parts[k])) return false;
  if (k === 0) return true;
  const comb = parts[k].comb;
  if (comb === '>') return !!n.parent && n.parent.tag !== '#root' && matchSel(n.parent, parts, k - 1);
  if (comb === ' ') { for (let p = n.parent; p && p.tag !== '#root'; p = p.parent) if (matchSel(p, parts, k - 1)) return true; return false; }
  const sibs = n.parent ? n.parent.kids.filter((x) => x.tag !== '#text') : [], idx = sibs.indexOf(n);
  if (comb === '+') return idx > 0 && matchSel(sibs[idx - 1], parts, k - 1);
  for (let j = idx - 1; j >= 0; j--) if (matchSel(sibs[j], parts, k - 1)) return true; return false;
}
const matchesAny = (n, sels) => sels.some((s) => matchSel(n, s.parts));
const compile = (list) => splitTop(list).map(parseComplex);

// ---------- CSS rule splitter (keeps original text of every rule) ----------
function scanCss(css, i, stops) {
  let q = '', d = 0;
  for (; i < css.length; i++) {
    const c = css[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 1; continue; }
    if (c === '"' || c === "'") q = c; else if (c === '(') d++; else if (c === ')') d--;
    else if (d <= 0 && stops.includes(c)) return i;
  }
  return css.length;
}
const GROUP_AT = new Set(['media', 'supports', 'layer', 'container', 'scope', 'document']);
function parseCss(css) {
  const out = []; let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;
    if (css[i] === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 2; continue; }
    if (i >= css.length) break;
    if (css[i] === '}') { i++; continue; }
    const start = i, t = scanCss(css, i, ';{}');
    const prelude = css.slice(start, t).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (css[t] !== '{') { i = t + 1; if (prelude) out.push({ k: 'stmt', raw: css.slice(start, Math.min(i, css.length)).trim(), prelude }); continue; }
    let d = 1, j = t + 1;
    while (j < css.length && d > 0) { j = scanCss(css, j, '{}'); if (j >= css.length) break; d += css[j] === '{' ? 1 : -1; j++; }
    const body = css.slice(t + 1, d === 0 ? j - 1 : j), raw = css.slice(start, j);
    i = j;
    if (prelude[0] === '@') {
      const name = (/^@([\w-]+)/.exec(prelude) || [])[1]?.toLowerCase() || '';
      out.push({ k: 'at', name, prelude, raw, body, kids: GROUP_AT.has(name) ? parseCss(body) : null });
    } else out.push({ k: 'rule', sel: prelude, raw, body });
  }
  return out;
}

// ---------- colour helpers ----------
const NAMED = { black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00', gray: '808080', grey: '808080', orange: 'ffa500', purple: '800080', navy: '000080', silver: 'c0c0c0', teal: '008080', maroon: '800000' };
function parseColor(s) {
  s = String(s).trim().toLowerCase();
  if (NAMED[s]) s = '#' + NAMED[s];
  let m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (m) { let h = m[1]; if (h.length <= 4) h = [...h].map((c) => c + c).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((x) => Math.max(0, Math.min(255, Math.round(+x))));
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(s);
  if (m) return hsl2rgb(+m[1], +m[2] / 100, +m[3] / 100);
  throw new Error('Cannot read colour "' + s + '". Use #rrggbb, rgb() or hsl().');
}
function hsl2rgb(h, s, l) { h = ((h % 360) + 360) % 360; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0), f(8), f(4)].map((x) => Math.round(x * 255)); }
function rgb2hsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; let h = 0, s = 0; if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, s, l]; }
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hex = (c) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');

// ---------- Lighthouse report viewer and diff ----------
function lhParse(s) {
  need(s, 'a Lighthouse JSON report');
  let j; try { j = JSON.parse(s); } catch { throw new Error('That is not valid JSON.'); }
  if (j && j.lighthouseResult) j = j.lighthouseResult; // PageSpeed Insights API response
  if (!j || typeof j !== 'object' || !j.categories || !j.audits) throw new Error('This does not look like a Lighthouse JSON report (no "categories" and "audits").');
  return j;
}
const lhBand = (sc) => (sc == null ? 'n/a' : sc >= 0.9 ? 'good' : sc >= 0.5 ? 'needs work' : 'poor');
const lhPct = (sc) => (sc == null ? 'n/a' : String(Math.round(sc * 100)));
const lhUrl = (j) => j.finalDisplayedUrl || j.finalUrl || j.requestedUrl || '(unknown URL)';
const lhEntries = (j) => Object.entries(j.categories);
const lhFail = (a) => a && a.score != null && a.score < 0.9 && !['manual', 'notApplicable', 'informative'].includes(a.scoreDisplayMode);
function lhHead(j) {
  const cs = j.configSettings || {};
  return [`Lighthouse ${j.lighthouseVersion || '?'}  |  ${lhUrl(j)}`, `Form factor: ${cs.formFactor || '?'}  |  Throttling: ${cs.throttlingMethod || '?'}  |  Run: ${j.fetchTime || '?'}`];
}
T.push({
  id: 'lighthouse-report-viewer', cat: 'Web Performance', title: 'Lighthouse JSON Report Viewer: Scores, Metrics and Failing Audits',
  desc: 'Paste a Lighthouse JSON report (or a PageSpeed Insights API response) and read category scores, lab metrics, savings and the audits that failed, grouped by category.',
  labels: ['Lighthouse JSON'], placeholder: ['Paste the contents of report.json'], opts: [
    { id: 'cat', label: 'Category', type: 'select', def: 'all', choices: ['all', 'performance', 'accessibility', 'best-practices', 'seo'] },
    { id: 'all', label: 'List passing audits too', type: 'checkbox', def: false }],
  sample: '',
  run([s], o) {
    const j = lhParse(s), out = lhHead(j);
    for (const w of j.runWarnings || []) out.push('Warning: ' + clip(w, 160));
    out.push('', 'SCORES', tbl(lhEntries(j).map(([k, c]) => [c.title || k, lhPct(c.score), lhBand(c.score)])));
    const perf = j.categories.performance;
    if (perf && (o.cat === 'all' || o.cat === 'performance')) {
      const rows = perf.auditRefs.filter((r) => r.group === 'metrics').map((r) => { const a = j.audits[r.id] || {}; return [(r.acronym || r.id) + ' ' + (a.title || ''), a.displayValue || String(a.numericValue ?? ''), lhPct(a.score), lhBand(a.score), 'weight ' + r.weight]; });
      if (rows.length) out.push('', 'LAB METRICS', tbl(rows));
      const ops = Object.values(j.audits).filter((a) => a.details && a.details.type === 'opportunity' && (a.details.overallSavingsMs > 0 || a.details.overallSavingsBytes > 0)).sort((a, b) => (b.details.overallSavingsMs || 0) - (a.details.overallSavingsMs || 0));
      if (ops.length) out.push('', 'OPPORTUNITIES (estimated savings)', tbl(ops.map((a) => [a.title, Math.round(a.details.overallSavingsMs || 0) + ' ms', a.details.overallSavingsBytes ? fmtB(a.details.overallSavingsBytes) : ''])));
    }
    for (const [k, c] of lhEntries(j)) {
      if (o.cat !== 'all' && o.cat !== k) continue;
      const refs = c.auditRefs.map((r) => ({ r, a: j.audits[r.id] })).filter((x) => x.a && (o.all ? x.a.score != null : lhFail(x.a)));
      refs.sort((x, y) => (y.r.weight || 0) - (x.r.weight || 0) || (x.a.score || 0) - (y.a.score || 0));
      out.push('', `${(c.title || k).toUpperCase()}: ${o.all ? 'AUDITS WITH A SCORE' : 'FAILING OR NEEDING WORK'} (${refs.length})`);
      if (!refs.length) out.push('  none');
      for (const { r, a } of refs) {
        const n = a.details && Array.isArray(a.details.items) ? a.details.items.length : 0;
        out.push(`  [${lhPct(a.score)}] ${a.title}${a.displayValue ? ' - ' + a.displayValue : ''}${n ? ` (${n} item${n > 1 ? 's' : ''})` : ''}${r.weight ? ' [weight ' + r.weight + ']' : ''}`);
      }
    }
    out.push('', 'Scores of 90 and up are good, 50 to 89 need work, below 50 are poor (Lighthouse bands). Manual, informative and not-applicable audits are left out. Lab data from one run; scores vary between runs.');
    return out.join('\n');
  },
});
const LH = (o) => {
  const a = {}; const refs = [];
  const add = (id, title, score, num, disp, mode, extra = {}, w = 0, grp, cat) => { a[id] = { id, title, score, scoreDisplayMode: mode || 'numeric', numericValue: num, displayValue: disp, ...extra }; refs.push({ id, w, grp, cat }); };
  add('first-contentful-paint', 'First Contentful Paint', o.fcpS, o.fcp, (o.fcp / 1000).toFixed(1) + ' s', 'numeric', {}, 10, 'metrics', 'performance');
  add('largest-contentful-paint', 'Largest Contentful Paint', o.lcpS, o.lcp, (o.lcp / 1000).toFixed(1) + ' s', 'numeric', {}, 25, 'metrics', 'performance');
  add('total-blocking-time', 'Total Blocking Time', o.tbtS, o.tbt, o.tbt + ' ms', 'numeric', {}, 30, 'metrics', 'performance');
  add('cumulative-layout-shift', 'Cumulative Layout Shift', o.clsS, o.cls, String(o.cls), 'numeric', {}, 25, 'metrics', 'performance');
  add('render-blocking-resources', 'Eliminate render-blocking resources', o.rbS, 0, 'Potential savings of ' + o.rb + ' ms', 'metricSavings', { details: { type: 'opportunity', overallSavingsMs: o.rb, items: [{ url: 'https://example.com/app.css' }, { url: 'https://example.com/app.js' }] } }, 0, 'load-opportunities', 'performance');
  add('color-contrast', 'Background and foreground colors have a sufficient contrast ratio', o.ccS, null, '', 'binary', { details: { type: 'table', items: o.ccN ? Array.from({ length: o.ccN }, (_, i) => ({ node: { snippet: '<a class="x' + i + '">' } })) : [] } }, 7, 'a11y-color-contrast', 'accessibility');
  add('image-alt', 'Image elements have [alt] attributes', 1, null, '', 'binary', { details: { type: 'table', items: [] } }, 10, 'a11y-names-labels', 'accessibility');
  add('meta-description', 'Document has a meta description', o.mdS, null, '', 'binary', {}, 1, 'seo-content', 'seo');
  const cats = {};
  for (const [id, title, sc] of [['performance', 'Performance', o.perf], ['accessibility', 'Accessibility', o.a11y], ['seo', 'SEO', o.seo]]) cats[id] = { id, title, score: sc, auditRefs: refs.filter((r) => r.cat === id).map((r) => ({ id: r.id, weight: r.w, group: r.grp, ...(r.grp === 'metrics' ? { acronym: { 'first-contentful-paint': 'FCP', 'largest-contentful-paint': 'LCP', 'total-blocking-time': 'TBT', 'cumulative-layout-shift': 'CLS' }[r.id] } : {}) })) };
  return JSON.stringify({ lighthouseVersion: '12.2.2', requestedUrl: 'https://example.com/', finalDisplayedUrl: 'https://example.com/', fetchTime: o.t, configSettings: { formFactor: 'mobile', throttlingMethod: 'simulate' }, categories: cats, audits: a }, null, 1);
};
const LH_A = LH({ t: '2025-01-10T09:00:00.000Z', perf: 0.62, a11y: 0.88, seo: 0.9, fcp: 2100, fcpS: 0.74, lcp: 4100, lcpS: 0.38, tbt: 450, tbtS: 0.45, cls: 0.18, clsS: 0.52, rb: 620, rbS: 0.5, ccS: 0, ccN: 3, mdS: 0 });
const LH_B = LH({ t: '2025-01-17T09:00:00.000Z', perf: 0.81, a11y: 1, seo: 1, fcp: 1500, fcpS: 0.93, lcp: 2600, lcpS: 0.82, tbt: 180, tbtS: 0.89, cls: 0.05, clsS: 0.99, rb: 90, rbS: 0.95, ccS: 1, ccN: 0, mdS: 1 });
T.find((t) => t.id === 'lighthouse-report-viewer').sample = LH_A;
const LH_METRICS = [['first-contentful-paint', 'FCP', 'ms'], ['largest-contentful-paint', 'LCP', 'ms'], ['total-blocking-time', 'TBT', 'ms'], ['cumulative-layout-shift', 'CLS', ''], ['speed-index', 'Speed Index', 'ms'], ['interactive', 'TTI', 'ms']];
T.push({
  id: 'lighthouse-report-diff', cat: 'Web Performance', title: 'Lighthouse Report Diff: Before and After Regressions',
  desc: 'Compare two Lighthouse JSON reports: score changes per category, metric regressions and improvements, and audits that started or stopped failing.',
  inputs: 2, labels: ['Before (Lighthouse JSON)', 'After (Lighthouse JSON)'], opts: [{ id: 'tol', label: 'Treat changes under this percent as noise', type: 'number', def: 5 }],
  sample: LH_A, sample2: LH_B,
  run([a, b], o) {
    const A = lhParse(a), B = lhParse(b), tol = Math.max(0, Number(o.tol) || 0) / 100, out = [];
    out.push('BEFORE  ' + lhHead(A).join(' | '), 'AFTER   ' + lhHead(B).join(' | '));
    if (lhUrl(A) !== lhUrl(B)) out.push('Note: the two reports are for different URLs.');
    if ((A.configSettings || {}).formFactor !== (B.configSettings || {}).formFactor) out.push('Note: different form factors (mobile vs desktop). The comparison is not like for like.');
    out.push('', 'CATEGORY SCORES');
    const rows = [['Category', 'Before', 'After', 'Change']];
    for (const [k, c] of lhEntries(B)) { const p = A.categories[k]; const x = p ? Math.round(p.score * 100) : null, y = Math.round(c.score * 100); rows.push([c.title || k, x ?? '-', y, x == null ? 'new' : (y - x > 0 ? '+' : '') + (y - x)]); }
    out.push(tbl(rows), '', 'METRICS (lower is better)');
    const mr = [['Metric', 'Before', 'After', 'Change', 'Verdict']];
    for (const [id, name] of LH_METRICS) {
      const x = A.audits[id], y = B.audits[id]; if (!x || !y || x.numericValue == null || y.numericValue == null) continue;
      const d = y.numericValue - x.numericValue, rel = x.numericValue ? d / x.numericValue : (d ? 1 : 0);
      const small = id === 'cumulative-layout-shift' ? Math.abs(d) < 0.01 : Math.abs(rel) <= tol;
      mr.push([name, x.displayValue || x.numericValue, y.displayValue || y.numericValue, (d > 0 ? '+' : '') + (id === 'cumulative-layout-shift' ? d.toFixed(3) : Math.round(d) + ' ms') + (small ? '' : ` (${(rel * 100).toFixed(0)}%)`), small ? 'about the same' : d > 0 ? 'REGRESSION' : 'improved']);
    }
    out.push(mr.length > 1 ? tbl(mr) : 'No shared metric values.');
    const newFail = [], fixed = [];
    for (const [id, y] of Object.entries(B.audits)) { const x = A.audits[id]; if (!x) continue; if (lhFail(y) && !lhFail(x)) newFail.push(y.title); if (lhFail(x) && !lhFail(y) && y.score != null) fixed.push(x.title); }
    out.push('', `NEWLY FAILING AUDITS (${newFail.length})`, ...(newFail.length ? newFail.map((x) => '  - ' + x) : ['  none']), '', `FIXED AUDITS (${fixed.length})`, ...(fixed.length ? fixed.map((x) => '  - ' + x) : ['  none']));
    out.push('', 'Lab results vary between runs of the same page (often 5 to 10 percent on timing metrics), so small changes are marked as noise. Run each version several times before you trust a verdict.');
    return out.join('\n');
  },
});

// ---------- page weight vs network profile ----------
// Profiles: Chrome DevTools presets (devtools-frontend NetworkManager.ts, 2024: Slow 3G 500 kbps / 400 ms; Slow 4G 1.6 Mbps / 150 ms; Fast 4G 9 Mbps / 60 ms)
// and Lighthouse desktop (10 Mbps / 40 ms). Nominal values: DevTools applies a small safety factor on top.
const NET = [['Slow 3G (DevTools)', 0.5, 400], ['Slow 4G (Lighthouse mobile)', 1.6, 150], ['Fast 4G (DevTools)', 9, 60], ['Lighthouse desktop', 10, 40], ['Cable / fibre 50 Mbps', 50, 20], ['Gigabit', 1000, 10]];
T.push({
  id: 'page-weight-download-time', cat: 'Web Performance', title: 'Page Weight Download Time on 3G, 4G and Broadband',
  desc: 'Estimate how long a page of a given size takes to download on Slow 3G, Slow 4G, Fast 4G and broadband, with connection setup and extra round trips included.',
  inputs: 0, opts: [
    { id: 'size', label: 'Total transfer size', type: 'number', def: 2048 },
    { id: 'unit', label: 'Unit', type: 'select', def: 'KB', choices: ['KB', 'MB'] },
    { id: 'rtts', label: 'Extra sequential round trips (render-blocking chains, redirects)', type: 'number', def: 3 },
    { id: 'mbps', label: 'Your own connection speed in Mbps (0 = skip)', type: 'number', def: 0 },
    { id: 'rtt', label: 'Your own round-trip time in ms', type: 'number', def: 50 }],
  sample: '',
  run(_, o) {
    const n = Number(o.size); if (!(n > 0)) throw new Error('Enter a page size above 0.');
    const bytes = n * (o.unit === 'MB' ? 1048576 : 1024), extra = Math.max(0, Number(o.rtts) || 0);
    const profiles = NET.slice(); if (Number(o.mbps) > 0) profiles.push(['Your connection', Number(o.mbps), Math.max(0, Number(o.rtt) || 0)]);
    const rows = [['Connection', 'Speed', 'RTT', 'Transfer', 'Setup + trips', 'Total']];
    for (const [name, mbps, rtt] of profiles) {
      const tx = (bytes * 8) / (mbps * 1e6), setup = (3 + extra) * rtt / 1000; // DNS + TCP + TLS + request = about 3 round trips, plus the extra ones
      rows.push([name, mbps + ' Mbps', rtt + ' ms', tx.toFixed(2) + ' s', setup.toFixed(2) + ' s', (tx + setup).toFixed(2) + ' s']);
    }
    return `Page weight: ${fmtB(bytes)} (1 KB = 1024 bytes, 1 Mbps = 1,000,000 bits per second)\n\n${tbl(rows)}\n\nModel: total = size / speed + (3 + extra trips) x RTT. The 3 covers DNS, TCP and TLS setup. It ignores TCP slow start, parallel connections, server time and caching, so treat it as a rough order of magnitude, not a measurement. Profile values are the nominal numbers of Chrome DevTools throttling presets and Lighthouse (read from their source code in October 2026; both may change).`;
  },
});

// ---------- HAR helpers ----------
function harParse(s) {
  need(s, 'a HAR file (JSON)');
  let j; try { j = JSON.parse(s); } catch { throw new Error('That is not valid JSON. Export the HAR from DevTools (Network, Save all as HAR).'); }
  const e = j && j.log && j.log.entries;
  if (!Array.isArray(e) || !e.length) throw new Error('No requests found: a HAR file has log.entries.');
  return j.log;
}
const SLD = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
const siteOf = (h) => { const p = h.split('.'); if (p.length <= 2 || /^[\d.]+$/.test(h)) return h; return (p.at(-1).length === 2 && SLD.has(p.at(-2)) ? p.slice(-3) : p.slice(-2)).join('.'); };
const xfer = (e) => { const r = e.response || {}; if (r._transferSize > 0) return r._transferSize; const b = r.bodySize > 0 ? r.bodySize : 0, h = r.headersSize > 0 ? r.headersSize : 0; return b + h || (r.content && r.content.size > 0 ? r.content.size : 0); };
function kindOf(e) {
  const m = (((e.response || {}).content || {}).mimeType || '').toLowerCase(), rt = (e._resourceType || '').toLowerCase();
  if (rt === 'script' || /javascript|ecmascript/.test(m)) return 'script'; if (rt === 'stylesheet' || m.includes('css')) return 'style';
  if (rt === 'image' || m.startsWith('image/')) return 'image'; if (rt === 'font' || /font|woff/.test(m)) return 'font';
  if (rt === 'document' || m.includes('html')) return 'document'; if (rt === 'media' || /video|audio/.test(m)) return 'media';
  if (/json|xml/.test(m) || rt === 'xhr' || rt === 'fetch') return 'data'; return 'other';
}
const harHdr = (r, name) => { const h = (r.headers || []).find((x) => x.name.toLowerCase() === name); return h ? h.value : ''; };
const shortUrl = (u, n = 70) => { try { const x = new URL(u); return clip(x.host + x.pathname + x.search, n); } catch { return clip(u, n); } };
const HAR_SAMPLE = JSON.stringify({ log: { version: '1.2', pages: [{ startedDateTime: '2025-01-10T09:00:00.000Z', id: 'p', title: 'https://www.example.com/', pageTimings: { onContentLoad: 900, onLoad: 2400 } }], entries: [
  ['https://www.example.com/', 'text/html', 200, 18000, 52000, 0, 420, 'document', 'gzip'],
  ['https://www.example.com/app.css', 'text/css', 200, 24000, 96000, 450, 180, 'stylesheet', 'gzip'],
  ['https://www.example.com/app.js', 'application/javascript', 200, 310000, 980000, 460, 700, 'script', 'br'],
  ['https://www.example.com/hero.jpg', 'image/jpeg', 200, 640000, 640000, 700, 900, 'image', ''],
  ['https://www.googletagmanager.com/gtag/js?id=G-1', 'application/javascript', 200, 98000, 270000, 480, 300, 'script', 'br'],
  ['https://www.google-analytics.com/g/collect?v=2', 'text/plain', 204, 400, 0, 1300, 120, 'xhr', ''],
  ['https://connect.facebook.net/en_US/fbevents.js', 'application/javascript', 200, 56000, 160000, 500, 350, 'script', 'gzip'],
  ['https://static.hotjar.com/c/hotjar-1.js', 'application/javascript', 200, 41000, 120000, 520, 410, 'script', 'br'],
  ['https://fonts.gstatic.com/s/inter/v12/inter.woff2', 'font/woff2', 200, 48000, 48000, 800, 260, 'font', ''],
  ['https://www.example.com/api/products', 'application/json', 200, 5200, 21000, 1500, 640, 'fetch', 'gzip'],
  ['https://www.example.com/logo.svg', 'image/svg+xml', 200, 9000, 9000, 720, 90, 'image', ''],
].map(([url, mime, status, tx, size, off, time, rt, enc]) => ({ startedDateTime: new Date(Date.parse('2025-01-10T09:00:00.000Z') + off).toISOString(), time, request: { method: 'GET', url, headers: [] }, response: { status, headers: enc ? [{ name: 'content-encoding', value: enc }] : [], content: { size, mimeType: mime }, bodySize: tx, headersSize: 300, _transferSize: tx + 300 }, timings: { wait: Math.round(time * 0.6), receive: Math.round(time * 0.3) }, _resourceType: rt })) } });
T.push({
  id: 'har-performance-analyzer', cat: 'Web Performance', title: 'HAR Performance Analyzer: Waterfall, Heaviest Requests and Third-Party Share',
  desc: 'Paste a HAR file and get total weight by type, the largest and slowest requests, third-party share, uncompressed text and a text waterfall. Nothing is uploaded.',
  labels: ['HAR file (JSON)'], placeholder: ['Paste the contents of a .har file'], sample: HAR_SAMPLE,
  opts: [{ id: 'top', label: 'Rows in the top lists', type: 'number', def: 8 }, { id: 'water', label: 'Waterfall rows (0 = off)', type: 'number', def: 30 }],
  run([s], o) {
    const log = harParse(s), es = log.entries, top = Math.max(1, Math.min(50, Number(o.top) || 8)), out = [];
    const first = hostOf(es[0].request.url), mySite = siteOf(first);
    const t0 = Math.min(...es.map((e) => Date.parse(e.startedDateTime) || 0)), end = Math.max(...es.map((e) => (Date.parse(e.startedDateTime) || 0) + (e.time || 0))), span = Math.max(1, end - t0);
    const total = es.reduce((a, e) => a + xfer(e), 0), raw = es.reduce((a, e) => a + Math.max(0, (e.response.content || {}).size || 0), 0);
    const pt = ((log.pages || [])[0] || {}).pageTimings || {};
    out.push(`${es.length} requests, ${fmtB(total)} transferred (${fmtB(raw)} uncompressed), spanning ${(span / 1000).toFixed(2)} s`, `First-party site (from the first request): ${mySite}` + (pt.onContentLoad > 0 ? `   DOMContentLoaded ${Math.round(pt.onContentLoad)} ms` : '') + (pt.onLoad > 0 ? `   load ${Math.round(pt.onLoad)} ms` : ''));
    const by = {}; for (const e of es) { const k = kindOf(e); (by[k] ||= { n: 0, b: 0 }); by[k].n++; by[k].b += xfer(e); }
    out.push('', 'BY TYPE', tbl([['Type', 'Requests', 'Transfer', 'Share'], ...Object.entries(by).sort((a, b) => b[1].b - a[1].b).map(([k, v]) => [k, v.n, fmtB(v.b), total ? Math.round(v.b / total * 100) + '%' : '-'])]));
    const tp = es.filter((e) => siteOf(hostOf(e.request.url)) !== mySite), tpB = tp.reduce((a, e) => a + xfer(e), 0), tpT = tp.reduce((a, e) => a + (e.time || 0), 0), allT = es.reduce((a, e) => a + (e.time || 0), 0);
    out.push('', `THIRD PARTY: ${tp.length} of ${es.length} requests, ${fmtB(tpB)} (${total ? Math.round(tpB / total * 100) : 0}% of bytes), ${allT ? Math.round(tpT / allT * 100) : 0}% of summed request time`);
    const hosts = {}; for (const e of tp) { const h = hostOf(e.request.url); (hosts[h] ||= { n: 0, b: 0 }); hosts[h].n++; hosts[h].b += xfer(e); }
    if (tp.length) out.push(tbl([['Host', 'Requests', 'Transfer'], ...Object.entries(hosts).sort((a, b) => b[1].b - a[1].b).slice(0, top).map(([h, v]) => [h, v.n, fmtB(v.b)])]));
    const row = (e) => [fmtB(xfer(e)), Math.round(e.time || 0) + ' ms', kindOf(e), e.response.status, shortUrl(e.request.url)];
    out.push('', 'LARGEST REQUESTS', tbl([['Size', 'Time', 'Type', 'Status', 'URL'], ...[...es].sort((a, b) => xfer(b) - xfer(a)).slice(0, top).map(row)]));
    out.push('', 'SLOWEST REQUESTS', tbl([['Size', 'Time', 'Type', 'Status', 'URL'], ...[...es].sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, top).map(row)]));
    const notes = [];
    for (const e of es) {
      const r = e.response, k = kindOf(e), sz = (r.content || {}).size || 0;
      if (['script', 'style', 'document', 'data'].includes(k) && sz > 1024 && r.status === 200 && !harHdr(r, 'content-encoding') && !((e.request.url || '').startsWith('data:'))) notes.push(`Text response sent without compression (no content-encoding): ${fmtB(sz)} ${shortUrl(e.request.url, 60)}`);
      if (k === 'image' && xfer(e) > 300 * 1024) notes.push(`Image over 300 KB: ${fmtB(xfer(e))} ${shortUrl(e.request.url, 60)}`);
      if (r.status >= 400) notes.push(`HTTP ${r.status}: ${shortUrl(e.request.url, 70)}`);
      if (e.timings && e.timings.wait > 800 && k !== 'data') notes.push(`Server wait over 800 ms (${Math.round(e.timings.wait)} ms): ${shortUrl(e.request.url, 60)}`);
    }
    out.push('', `THINGS TO REVIEW (${notes.length})`, ...(notes.length ? notes.slice(0, 40).map((x) => '  - ' + x) : ['  none found']));
    const wn = Math.max(0, Math.min(200, Number(o.water) | 0));
    if (wn) {
      const W = 36, sorted = [...es].sort((a, b) => Date.parse(a.startedDateTime) - Date.parse(b.startedDateTime)).slice(0, wn);
      out.push('', `WATERFALL (first ${sorted.length} requests by start time; scale 0 to ${(span / 1000).toFixed(2)} s)`);
      sorted.forEach((e, i) => { const st = Math.floor(((Date.parse(e.startedDateTime) - t0) / span) * W), len = Math.max(1, Math.ceil(((e.time || 0) / span) * W)); out.push(`${String(i + 1).padStart(3)} ${String(e.response.status).padEnd(3)} ${kindOf(e).padEnd(8)} ${fmtB(xfer(e)).padStart(9)} |${' '.repeat(Math.min(st, W - 1))}${'#'.repeat(Math.min(len, W - st))}${' '.repeat(Math.max(0, W - st - len))}| ${shortUrl(e.request.url, 40)}`); });
    }
    out.push('', 'Notes: first party is the registrable domain of the first request, found by a simple rule (last two labels, three for co.uk-style names) without the public suffix list. Request times overlap, so "share of summed time" is not page time. A HAR can contain cookies and tokens: this page reads it locally and sends nothing.');
    return out.join('\n');
  },
});

// ---------- third-party script cost ----------
// Hand-compiled domain list, not exhaustive. [substring of host, vendor, category]
const VENDORS = [['googletagmanager.com', 'Google Tag Manager', 'Tag manager'], ['google-analytics.com', 'Google Analytics', 'Analytics'], ['analytics.google.com', 'Google Analytics', 'Analytics'], ['doubleclick.net', 'Google Ads / DoubleClick', 'Advertising'], ['googlesyndication.com', 'Google AdSense', 'Advertising'], ['googleadservices.com', 'Google Ads', 'Advertising'], ['googleapis.com', 'Google APIs / Fonts CSS', 'CDN / fonts'], ['gstatic.com', 'Google static content', 'CDN / fonts'], ['recaptcha.net', 'reCAPTCHA', 'Security'], ['facebook.net', 'Meta Pixel / SDK', 'Advertising / social'], ['facebook.com', 'Meta (Facebook)', 'Advertising / social'], ['fbcdn.net', 'Meta (Facebook)', 'Advertising / social'], ['instagram.com', 'Instagram', 'Social'], ['twitter.com', 'X (Twitter)', 'Social'], ['twimg.com', 'X (Twitter)', 'Social'], ['platform.x.com', 'X (Twitter)', 'Social'], ['linkedin.com', 'LinkedIn', 'Advertising / social'], ['licdn.com', 'LinkedIn', 'Advertising / social'], ['tiktok.com', 'TikTok', 'Advertising / social'], ['pinterest.com', 'Pinterest', 'Advertising / social'], ['youtube.com', 'YouTube', 'Video'], ['ytimg.com', 'YouTube', 'Video'], ['youtube-nocookie.com', 'YouTube', 'Video'], ['vimeo.com', 'Vimeo', 'Video'], ['vimeocdn.com', 'Vimeo', 'Video'], ['hotjar.com', 'Hotjar', 'Session replay'], ['hotjar.io', 'Hotjar', 'Session replay'], ['clarity.ms', 'Microsoft Clarity', 'Session replay'], ['fullstory.com', 'FullStory', 'Session replay'], ['mouseflow.com', 'Mouseflow', 'Session replay'], ['segment.com', 'Segment', 'Analytics'], ['segment.io', 'Segment', 'Analytics'], ['mixpanel.com', 'Mixpanel', 'Analytics'], ['amplitude.com', 'Amplitude', 'Analytics'], ['posthog.com', 'PostHog', 'Analytics'], ['plausible.io', 'Plausible', 'Analytics'], ['matomo', 'Matomo', 'Analytics'], ['heapanalytics.com', 'Heap', 'Analytics'], ['hs-scripts.com', 'HubSpot', 'Marketing'], ['hsforms.net', 'HubSpot', 'Marketing'], ['hubspot.com', 'HubSpot', 'Marketing'], ['hs-analytics.net', 'HubSpot', 'Marketing'], ['marketo', 'Marketo', 'Marketing'], ['mailchimp.com', 'Mailchimp', 'Marketing'], ['list-manage.com', 'Mailchimp', 'Marketing'], ['intercom.io', 'Intercom', 'Chat / support'], ['intercomcdn.com', 'Intercom', 'Chat / support'], ['drift.com', 'Drift', 'Chat / support'], ['crisp.chat', 'Crisp', 'Chat / support'], ['zdassets.com', 'Zendesk', 'Chat / support'], ['zopim.com', 'Zendesk Chat', 'Chat / support'], ['tawk.to', 'Tawk.to', 'Chat / support'], ['livechatinc.com', 'LiveChat', 'Chat / support'], ['stripe.com', 'Stripe', 'Payments'], ['stripe.network', 'Stripe', 'Payments'], ['paypal.com', 'PayPal', 'Payments'], ['paypalobjects.com', 'PayPal', 'Payments'], ['sentry.io', 'Sentry', 'Error monitoring'], ['sentry-cdn.com', 'Sentry', 'Error monitoring'], ['nr-data.net', 'New Relic', 'Monitoring'], ['newrelic.com', 'New Relic', 'Monitoring'], ['datadoghq', 'Datadog', 'Monitoring'], ['bugsnag', 'Bugsnag', 'Error monitoring'], ['optimizely.com', 'Optimizely', 'A/B testing'], ['vwo.com', 'VWO', 'A/B testing'], ['visualwebsiteoptimizer.com', 'VWO', 'A/B testing'], ['cookielaw.org', 'OneTrust', 'Consent'], ['onetrust.com', 'OneTrust', 'Consent'], ['cookiebot.com', 'Cookiebot', 'Consent'], ['usercentrics', 'Usercentrics', 'Consent'], ['trustarc', 'TrustArc', 'Consent'], ['typekit.net', 'Adobe Fonts', 'CDN / fonts'], ['fontawesome.com', 'Font Awesome', 'CDN / fonts'], ['cdnjs.cloudflare.com', 'cdnjs', 'CDN / fonts'], ['jsdelivr.net', 'jsDelivr', 'CDN / fonts'], ['unpkg.com', 'unpkg', 'CDN / fonts'], ['bootstrapcdn.com', 'BootstrapCDN', 'CDN / fonts'], ['jquery.com', 'jQuery CDN', 'CDN / fonts'], ['cloudflareinsights.com', 'Cloudflare Web Analytics', 'Analytics'], ['gravatar.com', 'Gravatar', 'Images'], ['wp.com', 'WordPress.com / Jetpack', 'CMS services'], ['shopify.com', 'Shopify', 'E-commerce'], ['shopifycdn.com', 'Shopify', 'E-commerce'], ['criteo', 'Criteo', 'Advertising'], ['taboola.com', 'Taboola', 'Advertising'], ['outbrain.com', 'Outbrain', 'Advertising'], ['adnxs.com', 'Xandr (AppNexus)', 'Advertising'], ['amazon-adsystem.com', 'Amazon Ads', 'Advertising'], ['bing.com', 'Microsoft Ads / Bing', 'Advertising'], ['calendly.com', 'Calendly', 'Scheduling'], ['typeform.com', 'Typeform', 'Forms']];
const vendorOf = (host) => { for (const v of VENDORS) if (v[0].includes('.') ? host === v[0] || host.endsWith('.' + v[0]) : host.includes(v[0])) return v; return null; };
T.push({
  id: 'third-party-script-cost', cat: 'Web Performance', title: 'Third-Party Script Cost by Vendor (from a HAR or Lighthouse Report)',
  desc: 'Group HAR requests by known third-party vendors such as analytics, ads, chat and tag managers, and see requests, bytes and time per vendor. Also reads the Lighthouse third-party summary.',
  labels: ['HAR file or Lighthouse JSON'], placeholder: ['Paste a .har file or a Lighthouse report.json'], sample: HAR_SAMPLE,
  run([s]) {
    need(s, 'a HAR file or Lighthouse report');
    let j; try { j = JSON.parse(s); } catch { throw new Error('That is not valid JSON.'); }
    if (j && j.lighthouseResult) j = j.lighthouseResult;
    if (j && j.audits && j.audits['third-party-summary']) {
      const d = j.audits['third-party-summary'].details || {}, items = (d.items || []).filter((x) => x.entity);
      if (!items.length) return 'The report has no third-party entries: Lighthouse found no third-party requests (or the audit is not applicable).';
      const ent = (x) => (typeof x.entity === 'string' ? x.entity : x.entity.text || x.entity.value || '?');
      const rows = [['Vendor', 'Transfer', 'Main thread', 'Blocking time']];
      for (const x of [...items].sort((a, b) => (b.mainThreadTime || 0) - (a.mainThreadTime || 0))) rows.push([ent(x), fmtB(x.transferSize || 0), Math.round(x.mainThreadTime || 0) + ' ms', Math.round(x.blockingTime || 0) + ' ms']);
      return `From the Lighthouse "third-party-summary" audit of ${lhUrl(j)} (${(j.configSettings || {}).formFactor || '?'}):\n\n${tbl(rows)}\n\nMain thread and blocking time are measured by Lighthouse in the lab run. For per-URL detail use a HAR file.`;
    }
    const log = harParse(s), es = log.entries, mySite = siteOf(hostOf(es[0].request.url));
    const V = {}; let tpB = 0, tpN = 0, unk = {};
    for (const e of es) {
      const h = hostOf(e.request.url); if (!h || siteOf(h) === mySite) continue;
      const v = vendorOf(h), key = v ? v[1] : 'Unclassified: ' + siteOf(h), cat = v ? v[2] : '?';
      const x = (V[key] ||= { cat, n: 0, b: 0, js: 0, t: 0, hosts: new Set() });
      const b = xfer(e); x.n++; x.b += b; x.t += (e.time || 0); x.hosts.add(h); if (kindOf(e) === 'script') x.js += b; tpB += b; tpN++;
      if (!v) unk[siteOf(h)] = 1;
    }
    if (!tpN) return `No third-party requests found (first party: ${mySite}).`;
    const total = es.reduce((a, e) => a + xfer(e), 0);
    const rows = [['Vendor', 'Category', 'Requests', 'Transfer', 'Script bytes', 'Request time']];
    for (const [k, v] of Object.entries(V).sort((a, b) => b[1].b - a[1].b)) rows.push([k, v.cat, v.n, fmtB(v.b), fmtB(v.js), Math.round(v.t) + ' ms']);
    const cats = {}; for (const v of Object.values(V)) cats[v.cat] = (cats[v.cat] || 0) + v.b;
    return `${tpN} third-party requests, ${fmtB(tpB)} = ${total ? Math.round(tpB / total * 100) : 0}% of page bytes (first party: ${mySite})\n\n${tbl(rows)}\n\nBY CATEGORY\n${tbl(Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, b]) => [c, fmtB(b)]))}\n\nHow to read this: vendor names come from a short hand-made list of well-known domains (${VENDORS.length} entries). Unlisted domains show as "Unclassified". Bytes and request time are network cost only. The main-thread cost of a script is not in a HAR: run Lighthouse and paste its JSON here to see it. Request times overlap, so do not add them up as page time.`;
  },
});

// ---------- image header reader (width and height without decoding) ----------
function imgDims(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), s = (o, n) => String.fromCharCode(...u8.subarray(o, o + n));
  let r = null;
  if (u8.length > 24 && u8[0] === 0x89 && s(1, 3) === 'PNG') r = { type: 'PNG', w: dv.getUint32(16), h: dv.getUint32(20) };
  else if (s(0, 3) === 'GIF') r = { type: 'GIF', w: dv.getUint16(6, true), h: dv.getUint16(8, true) };
  else if (s(0, 2) === 'BM' && u8.length > 26) r = { type: 'BMP', w: Math.abs(dv.getInt32(18, true)), h: Math.abs(dv.getInt32(22, true)) };
  else if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') {
    const f = s(12, 4);
    if (f === 'VP8X') r = { type: 'WebP', w: 1 + (u8[24] | (u8[25] << 8) | (u8[26] << 16)), h: 1 + (u8[27] | (u8[28] << 8) | (u8[29] << 16)) };
    else if (f === 'VP8 ' && u8[23] === 0x9d && u8[24] === 0x01 && u8[25] === 0x2a) r = { type: 'WebP', w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff };
    else if (f === 'VP8L' && u8[20] === 0x2f) { const b = dv.getUint32(21, true); r = { type: 'WebP', w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  } else if (u8[0] === 0xff && u8[1] === 0xd8) {
    let o = 2, orient = 1;
    while (o + 4 < u8.length) {
      if (u8[o] !== 0xff) { o++; continue; }
      const m = u8[o + 1];
      if (m === 0xff) { o++; continue; }
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd9)) { o += 2; continue; }
      const len = dv.getUint16(o + 2);
      if (m === 0xe1 && s(o + 4, 4) === 'Exif') {
        const b = o + 10, le = s(b, 2) === 'II', ifd = b + dv.getUint32(b + 4, le), n = dv.getUint16(ifd, le);
        for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (e + 10 <= u8.length && dv.getUint16(e, le) === 0x0112) orient = dv.getUint16(e + 8, le); }
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { r = { type: 'JPEG', h: dv.getUint16(o + 5), w: dv.getUint16(o + 7), orient }; break; }
      o += 2 + len;
    }
  } else if (s(4, 4) === 'ftyp') {
    const brand = s(8, 4); let best = null;
    for (let i = 0; i + 20 < u8.length; i++) if (u8[i] === 0x69 && u8[i + 1] === 0x73 && u8[i + 2] === 0x70 && u8[i + 3] === 0x65) { const w = dv.getUint32(i + 8), h = dv.getUint32(i + 12); if (!best || w * h > best.w * best.h) best = { w, h }; }
    if (best) r = { type: /avi[fs]/.test(brand) ? 'AVIF' : 'HEIF/HEIC', ...best };
  }
  if (r && r.orient >= 5 && r.orient <= 8) { [r.w, r.h] = [r.h, r.w]; r.rot = true; }
  return r;
}
async function svgDims(text) {
  const m = /<svg\b([^>]*)>/i.exec(text); if (!m) return null;
  const a = (n) => { const x = new RegExp('\\s' + n + '\\s*=\\s*["\']([^"\']*)["\']', 'i').exec(m[1]); return x ? x[1] : ''; };
  const px = (v) => { const x = /^\s*([\d.]+)\s*(px)?\s*$/.exec(v); return x ? Math.round(+x[1] * 1000) / 1000 : 0; };
  let w = px(a('width')), h = px(a('height')); const vb = a('viewBox').trim().split(/[\s,]+/).map(Number);
  if ((!w || !h) && vb.length === 4 && vb[2] > 0 && vb[3] > 0) { if (!w && !h) { w = vb[2]; h = vb[3]; } else if (!w) w = (h * vb[2]) / vb[3]; else h = (w * vb[3]) / vb[2]; }
  return w && h ? { type: 'SVG', w, h } : null;
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
async function fileDims(f) {
  const buf = new Uint8Array(await f.arrayBuffer());
  let d = imgDims(buf);
  if (!d) { const t = new TextDecoder().decode(buf.subarray(0, 4096)); if (/<svg\b/i.test(t)) d = await svgDims(new TextDecoder().decode(buf)); }
  return d;
}
T.push({
  id: 'image-size-attributes', cat: 'Web Performance', title: 'Image Width and Height Attributes Generator (Prevent Layout Shift)',
  desc: 'Drop images to read their real dimensions from the file header and get ready-to-paste img tags with width, height and aspect-ratio that stop layout shift.',
  inputs: 0, sample: '', file: { accept: 'image/*', multiple: true },
  opts: [{ id: 'path', label: 'URL prefix for the src attribute', type: 'text', def: '/images/' }, { id: 'lazy', label: 'Add loading="lazy" decoding="async"', type: 'checkbox', def: false }],
  async run(_, o, files) {
    if (!files.length) throw new Error('Choose one or more images.');
    const out = [];
    for (const f of files) {
      const d = await fileDims(f);
      if (!d) { out.push(`# ${f.name}\nCould not read the size: not PNG, JPEG, GIF, WebP, BMP, AVIF/HEIC or SVG with width/height or viewBox.`); continue; }
      const w = Math.round(d.w), h = Math.round(d.h), g = gcd(w, h), alt = ' alt=""';
      out.push([`# ${f.name}  (${d.type}, ${fmtB(f.size)})`, `Size: ${d.w} x ${d.h}${d.rot ? '   (EXIF rotation applied: width and height swapped, as browsers display it)' : ''}`, `Ratio: ${w / g}:${h / g}  (${(w / h).toFixed(4)})`,
        `<img src="${attrQ((o.path || '') + f.name)}" width="${w}" height="${h}"${alt}${o.lazy ? ' loading="lazy" decoding="async"' : ''}>`, `CSS: aspect-ratio: ${w} / ${h};`,
        ...(d.type === 'SVG' && d.w !== w ? ['Note: SVG sizes are not whole pixels, so width and height were rounded.'] : [])].join('\n'));
    }
    out.push('Why: with width and height attributes the browser reserves the box before the file arrives (width and height become an aspect-ratio hint), so the page does not jump. Pair them with CSS "img { max-width: 100%; height: auto; }". Set alt to describe the image, or keep alt="" if it is decorative. Sizes come from the file header; no pixels are decoded or uploaded.');
    return out.join('\n\n');
  },
});

T.push({
  id: 'srcset-generator', cat: 'Web Performance', title: 'Responsive Image srcset and sizes Generator with Resized Files',
  desc: 'Upload one image, pick widths, and get an img tag with srcset, sizes, width and height plus resized WebP or JPEG files to download. Runs in your browser.',
  inputs: 0, sample: '', dom: true, file: { accept: 'image/*', multiple: false, optional: true },
  opts: [
    { id: 'widths', label: 'Widths in px, comma separated', type: 'text', def: '480, 768, 1080, 1440' },
    { id: 'sizes', label: 'sizes attribute', type: 'text', def: '(min-width: 1080px) 1080px, 100vw' },
    { id: 'format', label: 'Output format', type: 'select', def: 'webp', choices: ['webp', 'jpeg', 'png'] },
    { id: 'quality', label: 'Quality (1-100)', type: 'number', def: 80 },
    { id: 'path', label: 'URL prefix', type: 'text', def: '/images/' },
    { id: 'alt', label: 'alt text', type: 'text', def: '' },
    { id: 'lazy', label: 'Add loading="lazy" decoding="async"', type: 'checkbox', def: true },
    { id: 'ow', label: 'Original width (only if no file is chosen)', type: 'number', def: 0 },
    { id: 'oh', label: 'Original height (only if no file is chosen)', type: 'number', def: 0 }],
  async run(_, o, files) {
    const f = files[0]; let W = Number(o.ow) || 0, H = Number(o.oh) || 0, base = 'image', bmp = null;
    if (f) { bmp = await createImageBitmap(f).catch(() => { throw new Error('Cannot read that image.'); }); W = bmp.width; H = bmp.height; base = f.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-') || 'image'; }
    if (!(W > 0 && H > 0)) throw new Error('Choose an image, or enter the original width and height.');
    let ws = [...new Set(String(o.widths).split(/[\s,]+/).map(Number).filter((n) => n > 0 && Number.isFinite(n)).map(Math.round))].sort((a, b) => a - b);
    if (!ws.length) throw new Error('Enter at least one width, for example 480, 768, 1080.');
    const dropped = ws.filter((w) => w > W); ws = ws.filter((w) => w <= W);
    if (!ws.length || ws[ws.length - 1] < W && dropped.length) ws.push(W);
    ws = [...new Set(ws)];
    const ext = o.format === 'jpeg' ? 'jpg' : o.format, name = (w) => `${base}-${w}w.${ext}`, top = ws[ws.length - 1];
    const tag = [`<img src="${attrQ(o.path + name(top))}"`, `     srcset="${ws.map((w) => attrQ(o.path + name(w)) + ' ' + w + 'w').join(',\n             ')}"`, `     sizes="${attrQ(o.sizes)}"`, `     width="${top}" height="${Math.round((top * H) / W)}" alt="${attrQ(o.alt)}"${o.lazy ? ' loading="lazy" decoding="async"' : ''}>`].join('\n');
    const lines = [tag, '', `Original ${W} x ${H}. Widths: ${ws.join(', ')}.` + (dropped.length ? ` Skipped ${dropped.join(', ')} (larger than the original; upscaling adds bytes, not detail).` : ''), 'width and height give the largest file\'s size so the browser can reserve space; CSS "height: auto; max-width: 100%" scales it. sizes tells the browser how wide the image is drawn, so check it against your layout: a wrong sizes value makes browsers pick files that are too big or too small.'];
    if (!bmp) return lines.join('\n') + '\n\nNo file chosen, so only the markup was written.';
    const blobs = [];
    for (const w of ws) {
      const h = Math.max(1, Math.round((w * H) / W)), c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; if (o.format === 'jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); } x.drawImage(bmp, 0, 0, w, h);
      const b = await new Promise((res, rej) => c.toBlob((v) => (v ? res(v) : rej(new Error('This browser cannot encode ' + o.format))), 'image/' + o.format, Math.min(1, Math.max(0.01, Number(o.quality) / 100))));
      if (b.type !== 'image/' + o.format) throw new Error('This browser cannot encode ' + o.format + '. Choose another format.');
      blobs.push(new File([b], name(w), { type: b.type }));
    }
    lines.push('', 'Files: ' + blobs.map((b) => `${b.name} ${fmtB(b.size)}`).join(', '));
    return { text: lines.join('\n'), blob: blobs };
  },
});

// ---------- critical CSS and unused CSS ----------
function cssWalk(items, fn) { // fn(rule) -> keep? returns filtered text
  const out = [];
  for (const it of items) {
    if (it.k === 'rule') { const r = fn(it); if (r) out.push(r); }
    else if (it.k === 'at' && it.kids) { const inner = cssWalk(it.kids, fn); if (inner) out.push(it.prelude + '{' + inner + '}'); }
    else if (it.k === 'at') { const r = fn(it); if (r) out.push(r); }
  }
  return out.join('\n');
}
const cssSplit = (css) => { const items = parseCss(css.replace(/\/\*[\s\S]*?\*\//g, '')); return items; };
const rawOf = (it) => it.raw.replace(/\s+/g, ' ').trim();
const SAMPLE_PAGE = '<!doctype html>\n<html lang="en"><head><title>Demo</title></head>\n<body>\n<header class="site-header"><nav class="nav"><a href="/" class="logo">Demo</a><a href="/blog" class="nav__link">Blog</a></nav></header>\n<main><h1 class="hero__title">Fast pages win</h1><p class="lead">Short intro.</p>\n<section class="cards"><article class="card"><h2>One</h2></article><article class="card"><h2>Two</h2></article></section>\n<footer class="site-footer"><p>Footer</p></footer></main>\n</body></html>';
const SAMPLE_CSS = ':root{--brand:#0a5}\nbody{margin:0;font:16px/1.5 Inter,sans-serif}\n.site-header{background:var(--brand)}\n.nav{display:flex;gap:1rem}\n.nav__link:hover{text-decoration:underline}\n.hero__title{font-size:2.5rem}\n.lead{max-width:60ch}\n.cards{display:grid}\n.card{padding:1rem}\n.card--featured{border:2px solid gold}\n.modal,.modal__backdrop{position:fixed}\n.site-footer{margin-top:4rem}\n@media (min-width:60em){.nav{gap:2rem}.sidebar{width:20rem}}\n@media print{.nav{display:none}}\n@font-face{font-family:Inter;src:url(inter.woff2) format("woff2");font-display:swap}\n@keyframes spin{to{transform:rotate(1turn)}}\n.spinner{animation:spin 1s linear infinite}';
T.push({
  id: 'critical-css-extractor', cat: 'Web Performance', title: 'Critical CSS Extractor (Above-the-Fold Rules for Inlining)',
  desc: 'Paste HTML and the full stylesheet, pick how many elements count as above the fold, and get only the matching rules to inline, plus the snippet to load the rest later.',
  inputs: 2, labels: ['Page HTML', 'Full CSS'], sample: SAMPLE_PAGE, sample2: SAMPLE_CSS,
  opts: [{ id: 'n', label: 'Elements counted as above the fold (in document order, from <body>)', type: 'number', def: 40 }, { id: 'fonts', label: 'Keep @font-face for fonts used', type: 'checkbox', def: true }, { id: 'href', label: 'Stylesheet URL for the snippet', type: 'text', def: '/css/main.css' }],
  run([html, css], o) {
    need(html, 'the page HTML'); need(css, 'the full CSS');
    const root = parseHTML(html), els = all(root), body = els.find((e) => e.tag === 'body');
    const above = new Set(); const N = Math.max(1, Number(o.n) || 40);
    for (const e of els) if (e.tag === 'html' || e.tag === 'body') above.add(e);
    let c = 0; for (const e of body ? walk(body) : els) { if (['script', 'style', 'noscript', 'link', 'meta', 'template'].includes(e.tag) || isHidden(e)) continue; if (c++ >= N) break; above.add(e); }
    const items = cssSplit(css); let total = 0, kept = 0, unsure = 0;
    const keep = [];
    const textKept = cssWalk(items, (it) => {
      if (it.k === 'rule') {
        total++; const sels = compile(it.sel); if (sels.some((s) => s.unsup)) { unsure++; kept++; return rawOf(it); }
        for (const e of above) if (matchesAny(e, sels)) { kept++; return rawOf(it); }
        return '';
      }
      if (it.name === 'font-face' || it.name === 'keyframes' || it.name === '-webkit-keyframes') { keep.push(it); return ''; }
      if (it.name === 'media' || it.name === 'supports') return '';
      return '';
    });
    // media queries: print blocks dropped; others recursed by cssWalk
    const filtered = textKept.split('\n').filter((l) => !/^@media[^{]*\bprint\b/.test(l)).join('\n');
    let extra = '';
    for (const it of keep) {
      const nm = it.name === 'font-face' ? ((/font-family\s*:\s*([^;}]+)/i.exec(it.body) || [])[1] || '').replace(/["']/g, '').trim() : (it.prelude.split(/\s+/)[1] || '');
      if (!nm) continue;
      if (it.name === 'font-face' ? o.fonts && new RegExp('font[^:]*:[^;}]*' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(filtered) : new RegExp('animation[^:]*:[^;}]*\\b' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(filtered)) extra += '\n' + rawOf(it);
    }
    const crit = (filtered + extra).trim();
    return [`Kept ${kept} of ${total} style rules (${fmtB(new Blob([crit]).size)} of ${fmtB(new Blob([css]).size)})` + (unsure ? `; ${unsure} rules use selectors this tool cannot test and were kept to be safe` : ''), `Above-the-fold set: html, body and the first ${N} visible body elements (${above.size} elements).`, '', '/* critical CSS */', crit, '', '<!-- in <head>: inline the critical rules, load the rest without blocking -->', `<style>${crit.replace(/\n/g, '')}</style>`, `<link rel="preload" href="${attrQ(o.href)}" as="style" onload="this.onload=null;this.rel='stylesheet'">`, `<noscript><link rel="stylesheet" href="${attrQ(o.href)}"></noscript>`, '', 'Heuristic: there is no layout engine here, so "above the fold" is approximated by the first N elements. Check the result at your real viewport sizes and raise N if content flashes unstyled. Rules for states, media queries and script-added classes may need to be added by hand.'].join('\n');
  },
});
T.push({
  id: 'unused-css-finder', cat: 'Web Performance', title: 'Unused CSS Finder: Selectors Not Matched by Your HTML',
  desc: 'Paste HTML and a stylesheet to list rules whose selectors match nothing in that HTML, with bytes saved, or output the CSS with the unused rules removed.',
  inputs: 2, labels: ['Page HTML (one or more pages joined)', 'CSS'], sample: SAMPLE_PAGE, sample2: SAMPLE_CSS,
  opts: [{ id: 'mode', label: 'Output', type: 'select', def: 'report', choices: ['report', 'css without unused rules'] }],
  run([html, css], o) {
    need(html, 'the page HTML'); need(css, 'the CSS');
    const els = all(parseHTML(html)), items = cssSplit(css);
    let total = 0, unusedB = 0; const unused = [], unsure = []; let nUnsure = 0;
    const cleaned = cssWalk(items, (it) => {
      if (it.k !== 'rule') return rawOf(it);
      total++; const sels = compile(it.sel);
      if (sels.some((s) => s.unsup)) { nUnsure++; unsure.push(clip(it.sel, 80)); return rawOf(it); }
      const used = sels.filter((s) => els.some((e) => matchSel(e, s.parts)));
      if (!used.length) { unusedB += it.raw.length; unused.push(clip(it.sel, 100)); return ''; }
      return rawOf(it);
    });
    if (o.mode !== 'report') return cleaned;
    const origB = css.length;
    return [`${total} style rules: ${unused.length} match nothing in this HTML (${fmtB(unusedB)} of ${fmtB(origB)}, ${origB ? Math.round(unusedB / origB * 100) : 0}%)` + (nUnsure ? `, ${nUnsure} could not be tested` : ''), '', `UNUSED (${unused.length})`, ...(unused.length ? unused.slice(0, 200).map((x) => '  ' + x) : ['  none']), ...(unsure.length ? ['', `NOT TESTED: selectors with :is(), :has(), nth-child and similar (${unsure.length})`, ...unsure.slice(0, 50).map((x) => '  ' + x)] : []), '', 'Review before deleting. A selector can look unused here but be needed: classes added by JavaScript (is-open, active), content rendered later, other pages that share this stylesheet, and state selectors such as :hover are matched on the base element only. Run it against every template that loads the file. Rules inside @media and @supports are checked; @font-face and @keyframes are kept.'].join('\n');
  },
});

// ---------- compression estimator ----------
async function csize(u8, fmt) { const s = new Blob([u8]).stream().pipeThrough(new CompressionStream(fmt)); return (await new Response(s).arrayBuffer()).byteLength; }
T.push({
  id: 'compression-size-estimator', cat: 'Web Performance', title: 'Gzip and Deflate Transfer Size Estimator for Text Assets',
  desc: 'Paste HTML, CSS, JavaScript or JSON and see the raw size and the gzip and deflate size your server would send, with the saving in percent.',
  labels: ['Text to compress'], placeholder: ['Paste a file\'s content'], sample: SAMPLE_CSS.repeat(8),
  async run([s]) {
    need(s, 'some text');
    if (typeof CompressionStream === 'undefined') throw new Error('This browser has no CompressionStream.');
    const u8 = new TextEncoder().encode(s), raw = u8.length, g = await csize(u8, 'gzip'), d = await csize(u8, 'deflate'), r = await csize(u8, 'deflate-raw');
    const pct = (x) => (raw ? ((1 - x / raw) * 100).toFixed(1) + '% smaller' : '-');
    return `${tbl([['Encoding', 'Bytes', 'Size', 'Saving'], ['none (UTF-8)', raw, fmtB(raw), '-'], ['gzip', g, fmtB(g), pct(g)], ['deflate (zlib)', d, fmtB(d), pct(d)], ['deflate-raw', r, fmtB(r), pct(r)]])}\n\nThe browser compresses at its default level, so a server set to gzip -9 or a build step may do a little better. Brotli is not shown: browsers cannot create Brotli data, and this tool does not ship its own encoder. Brotli (content-encoding br) is usually smaller than gzip on text, so measure it on your server or with the brotli command line tool. Images, video and fonts such as WOFF2 are already compressed, so do not expect savings there.`;
  },
});

// ---------- resource hints ----------
const HINTS = new Set(['preload', 'preconnect', 'dns-prefetch', 'prefetch', 'modulepreload']);
const AS_BY_EXT = { woff2: ['font', 'font/woff2'], woff: ['font', 'font/woff'], ttf: ['font', 'font/ttf'], otf: ['font', 'font/otf'], css: ['style'], js: ['script'], mjs: ['modulepreload'], png: ['image'], jpg: ['image'], jpeg: ['image'], gif: ['image'], webp: ['image'], avif: ['image'], svg: ['image'], mp4: ['video'], webm: ['video'], mp3: ['audio'], ogg: ['audio'], json: ['fetch'], vtt: ['track'] };
T.push({
  id: 'resource-hints-generator', cat: 'Web Performance', title: 'Resource Hints Generator: preload, preconnect, dns-prefetch, fetchpriority',
  desc: 'List URLs, one per line, and get correct link tags: preload with as and crossorigin, preconnect for origins, dns-prefetch fallback and fetchpriority, with warnings about overuse.',
  labels: ['URLs, one per line'], placeholder: ['https://cdn.example.com/\n/fonts/inter.woff2\npreload /img/hero.jpg fetchpriority=high'],
  sample: 'https://cdn.example.com/\nhttps://fonts.gstatic.com/\n/fonts/inter-var.woff2\n/css/main.css\n/img/hero.avif fetchpriority=high\nprefetch /next-page.html\nhttps://api.example.com/v1/config.json',
  opts: [{ id: 'dns', label: 'Add a dns-prefetch fallback after each preconnect', type: 'checkbox', def: true }, { id: 'hi', label: 'Add fetchpriority="high" to the first image preload', type: 'checkbox', def: true }],
  run([s], o) {
    need(s, 'at least one URL');
    const out = [], warn = [], seen = new Set(); let pre = 0, pc = 0, imgHi = false;
    for (const line of s.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))) {
      const tk = line.split(/\s+/); let hint = HINTS.has(tk[0]) ? tk.shift() : ''; const url = tk.shift(); if (!url) continue;
      const kv = {}; for (const t of tk) { const [k, v] = t.split('='); kv[k] = v === undefined ? true : v; }
      let u; try { u = new URL(url, 'https://same-origin.invalid'); } catch { warn.push('Skipped, not a URL: ' + url); continue; }
      const abs = /^https?:\/\//.test(url), cross = abs, bare = u.pathname === '/' && !u.search && abs;
      if (!hint) hint = bare ? 'preconnect' : 'preload';
      const key = hint + ' ' + url; if (seen.has(key)) { warn.push('Duplicate ignored: ' + url); continue; } seen.add(key);
      if (hint === 'preconnect' || hint === 'dns-prefetch') {
        const href = abs ? u.origin : url; pc++;
        out.push(`<link rel="${hint}" href="${attrQ(href)}"${hint === 'preconnect' && (kv.crossorigin || /gstatic|fonts|cdn/.test(href)) ? ' crossorigin' : ''}>`);
        if (hint === 'preconnect' && o.dns) out.push(`<link rel="dns-prefetch" href="${attrQ(href)}">`);
        continue;
      }
      const ext = (u.pathname.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase(), g = AS_BY_EXT[ext] || [];
      if (hint === 'modulepreload' || (hint === 'preload' && g[0] === 'modulepreload')) { out.push(`<link rel="modulepreload" href="${attrQ(url)}">`); pre++; continue; }
      const as = kv.as || g[0];
      if (hint === 'preload') {
        if (!as) { warn.push(`No "as" for ${url}: add as=script|style|image|font|fetch|... (preload without as is ignored).`); continue; }
        pre++; const type = kv.type || g[1];
        const fp = kv.fetchpriority || (o.hi && as === 'image' && !imgHi ? 'high' : ''); if (as === 'image' && fp === 'high') imgHi = true;
        out.push(`<link rel="preload" href="${attrQ(url)}" as="${attrQ(as)}"${type && as === 'font' ? ` type="${attrQ(type)}"` : ''}${as === 'font' || as === 'fetch' && cross || kv.crossorigin ? ' crossorigin' : ''}${fp ? ` fetchpriority="${attrQ(fp)}"` : ''}${kv.media ? ` media="${attrQ(kv.media)}"` : ''}>`);
        if (as === 'font' && ext !== 'woff2') warn.push(`${url}: prefer WOFF2 for preload; only preload formats every target browser uses.`);
      } else out.push(`<link rel="prefetch" href="${attrQ(url)}"${as ? ` as="${attrQ(as)}"` : ''}>`);
    }
    if (!out.length) throw new Error('No valid URLs found.');
    if (pre > 5) warn.push(`${pre} preloads: each one competes for bandwidth with the page itself. Keep to the few files needed for the first paint.`);
    if (pc > 4) warn.push(`${pc} preconnect/dns-prefetch origins: browsers close idle connections after a short time, so keep preconnect to the 2 to 4 origins the page needs at once.`);
    return `${out.join('\n')}\n\nPlace these early in <head>.${warn.length ? '\n\nREVIEW\n' + warn.map((x) => '- ' + x).join('\n') : ''}\n\nNotes: fonts always need crossorigin, even from your own origin, or the preload is fetched twice. Preload only what the page uses within a few seconds; unused preloads waste data (Chrome warns in the console). preconnect opens the connection (DNS, TCP, TLS); dns-prefetch only resolves the name and is the cheaper fallback.`;
  },
});

// ---------- font loading ----------
const FMT = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype', eot: 'embedded-opentype', svg: 'svg' };
const WGT = { thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, book: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900 };
T.push({
  id: 'font-loading-snippet-generator', cat: 'Web Performance', title: 'Web Font Loading Snippet Generator: @font-face, font-display and preload',
  desc: 'Describe your font files and get @font-face rules with font-display, WOFF2-first src lists, preload tags and a fallback font stack.',
  labels: ['One font face per line: Family | weight | style | files'], placeholder: ['Inter | 400 | normal | /fonts/inter-400.woff2, /fonts/inter-400.woff'],
  sample: 'Inter | 400 | normal | /fonts/inter-400.woff2, /fonts/inter-400.woff\nInter | 700 | normal | /fonts/inter-700.woff2, /fonts/inter-700.woff\nInter | 400 | italic | /fonts/inter-400i.woff2\nSource Serif | Regular | normal | /fonts/source-serif.woff2 | U+0000-00FF, U+0131',
  opts: [{ id: 'display', label: 'font-display', type: 'select', def: 'swap', choices: ['swap', 'optional', 'fallback', 'block', 'auto'] }, { id: 'preload', label: 'Preload the first N faces', type: 'number', def: 2 }, { id: 'fallback', label: 'Fallback fonts', type: 'text', def: 'system-ui, sans-serif' }],
  run([s], o) {
    need(s, 'at least one font line'); const css = [], tags = [], fam = new Set(); let pl = 0; const N = Math.max(0, Number(o.preload) || 0);
    for (const line of s.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const p = line.split('|').map((x) => x.trim()); if (p.length < 4) throw new Error('Use: Family | weight | style | file1, file2 (got "' + clip(line, 40) + '")');
      const [family, w, st, files, range] = p; const weight = /^\d+(\s+\d+)?$/.test(w) ? w : WGT[w.toLowerCase().replace(/\s+/g, '')];
      if (!weight) throw new Error('Unknown weight "' + w + '". Use 100 to 900 (or a range like "100 900") or Regular, Bold...');
      if (!['normal', 'italic', 'oblique'].includes(st.toLowerCase())) throw new Error('Style must be normal, italic or oblique.');
      const fl = files.split(/[,\s]+/).filter(Boolean).sort((a, b) => (/\.woff2$/i.test(b) ? 1 : 0) - (/\.woff2$/i.test(a) ? 1 : 0));
      const src = fl.map((f) => { const e = (f.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase(); if (!FMT[e]) throw new Error('Unknown font file type: ' + f); return `url("${attrQ(f)}") format("${FMT[e]}")`; });
      fam.add(family);
      css.push(`@font-face {\n  font-family: "${attrQ(family)}";\n  font-style: ${st.toLowerCase()};\n  font-weight: ${weight};\n  font-display: ${o.display};\n  src: ${src.join(',\n       ')};${range ? `\n  unicode-range: ${range};` : ''}\n}`);
      if (pl < N && /\.woff2$/i.test(fl[0])) { tags.push(`<link rel="preload" href="${attrQ(fl[0])}" as="font" type="font/woff2" crossorigin>`); pl++; }
    }
    const first = [...fam][0], why = { swap: 'text shows at once in the fallback and swaps when the font arrives (can shift layout slightly)', optional: 'the font is used only if it is ready almost immediately, otherwise the fallback stays for this page view (least layout shift)', fallback: 'short invisible period, then fallback, with a limited time to swap', block: 'text is invisible for up to about 3 seconds while the font loads (avoid for body text)', auto: 'browser default, usually like block' }[o.display];
    return `${css.join('\n\n')}\n\n/* use it */\nbody { font-family: "${first}", ${o.fallback}; }\n\n<!-- in <head> -->\n${tags.length ? tags.join('\n') : '<!-- no WOFF2 first file to preload -->'}\n\nfont-display: ${o.display}: ${why}.\nTips: preload only the one or two faces used above the fold (a preload for an unused face wastes bandwidth). Serve WOFF2 first; WOFF is only a fallback for very old browsers. Fonts are fetched with CORS, so the preload needs crossorigin even on your own domain. To cut layout shift further, pick a fallback font with similar metrics and consider size-adjust in a fallback @font-face.`;
  },
});

// ---------- CLS risk finder ----------
T.push({
  id: 'cls-risk-finder', cat: 'Web Performance', title: 'CLS Risk Finder: Layout Shift Causes in Your HTML',
  desc: 'Scan pasted HTML and CSS for the usual causes of layout shift: images and embeds without dimensions, late ad and banner slots, font swaps, script-inserted content and animated layout properties.',
  labels: ['Page HTML (with inline <style> and <script> if you have them)'], sample: '<html><head><link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"><style>@font-face{font-family:X;src:url(x.woff2)}.banner{animation:slide 1s}@keyframes slide{from{top:-50px}to{top:0}}</style></head>\n<body><div id="cookie-banner" class="banner"></div><img src="hero.jpg" alt="Hero"><img src="a.jpg" width="400" alt=""><iframe src="https://www.youtube.com/embed/x"></iframe><div class="ad-slot"></div><picture><source srcset="a.webp"><img src="a.png" alt=""></picture>\n<script>document.body.prepend(document.createElement("div"))</script></body></html>',
  run([s]) {
    need(s); const root = parseHTML(s), els = all(root), f = [];
    const add = (lv, msg, n) => f.push(`[${lv}] ${msg}${n ? '  (' + where(root, n) + ')' : ''}`);
    const style = (n) => n.attrs.style || '';
    const hasBox = (n) => (n.attrs.width && n.attrs.height) || /aspect-ratio|min-height|height\s*:/i.test(style(n));
    for (const n of els) {
      if (n.tag === 'img' && !hasBox(n)) add('REVIEW', n.attrs.width || n.attrs.height ? 'Image has only one of width/height' : 'Image without width and height (space is reserved only after it loads)', n);
      if (['iframe', 'video', 'embed', 'object'].includes(n.tag) && !hasBox(n)) add('REVIEW', `<${n.tag}> without width and height or aspect-ratio`, n);
      const id = ((n.attrs.id || '') + ' ' + (n.attrs.class || '')).toLowerCase();
      if (/(^|[\s_-])(ad|ads|adslot|ad-slot|advert|banner|promo|cookie|consent|newsletter|popup|embed|widget|sticky)([\s_-]|$)/.test(id) && !/min-height|height|aspect-ratio/i.test(style(n)) && !['script', 'link', 'style', 'meta'].includes(n.tag)) add('REVIEW', `Element "${clip((n.attrs.id || '') + ' ' + (n.attrs.class || ''), 40)}" looks like a late-loading slot with no reserved height. Give it a min-height or aspect-ratio`, n);
      if (n.tag === 'link' && /fonts\.googleapis\.com/.test(n.attrs.href || '') && !/display=/.test(n.attrs.href)) add('REVIEW', 'Google Fonts URL without &display=swap (or optional): text may be invisible and then shift', n);
      if (n.tag === 'script' && !n.attrs.src) { const t = textOf(n) || (n.kids[0] && n.kids[0].text) || ''; if (/\.(prepend|before)\(|insertBefore\(|insertAdjacentHTML\(\s*['"](beforebegin|afterbegin)/.test(t)) add('REVIEW', 'Script inserts content above or before existing content, which pushes the page down', n); }
      if (n.tag === 'style') {
        const t = (n.kids[0] && n.kids[0].text) || '';
        for (const m of t.matchAll(/@font-face\s*{[^}]*}/gi)) if (!/font-display/i.test(m[0])) add('REVIEW', '@font-face without font-display: text can shift when the font swaps in', n);
        const kf = [...t.matchAll(/@keyframes\s+([\w-]+)\s*{([\s\S]*?})\s*}/gi)];
        for (const k of kf) if (/\b(top|left|right|bottom|width|height|margin[\w-]*|padding[\w-]*)\s*:/i.test(k[2])) add('REVIEW', `@keyframes ${k[1]} animates a layout property (top/left/width/height/margin): use transform instead`, n);
      }
    }
    return `${f.length ? f.join('\n') : 'No common layout-shift causes found in this markup.'}\n\n${f.length} item${f.length === 1 ? '' : 's'} to review. This is a static read of the markup, not a measurement: it cannot see CSS from other files, content added by scripts, or real timing. Measure the real score with the Layout Instability API (see the Web Vitals bookmarklet) or Lighthouse.`;
  },
});

// ---------- bookmarklets ----------
const mkBookmarklet = (src) => 'javascript:' + encodeURIComponent(src.replace(/\n\s*/g, ''));
T.push({
  id: 'web-vitals-bookmarklet', cat: 'Web Performance', title: 'Web Vitals Bookmarklet Builder (LCP, CLS, INP on Any Page)',
  desc: 'Generate a bookmarklet that shows LCP, CLS, INP, FCP and TTFB with good, needs improvement and poor ratings as an overlay on any page, using the browser performance APIs.',
  inputs: 0, sample: '', opts: [{ id: 'overlay', label: 'Show an overlay on the page', type: 'checkbox', def: true }, { id: 'log', label: 'Also log to the console', type: 'checkbox', def: true }],
  run(_, o) {
    const src = `(function(){
var K='__ftVitals';if(window[K]){window[K].box.remove();window[K].stop();window[K]=null;return}
var v={LCP:null,CLS:0,INP:null,FCP:null,TTFB:null},obs=[],ix={},cur=0,t0=0,tl=0;
function po(t,cb,x){try{var q=new PerformanceObserver(function(l){l.getEntries().forEach(cb);paint()}),c={type:t,buffered:true};for(var k in x)c[k]=x[k];q.observe(c);obs.push(q)}catch(e){}}
po('largest-contentful-paint',function(e){v.LCP=e.startTime});
po('layout-shift',function(e){if(e.hadRecentInput)return;if(cur&&e.startTime-tl<1000&&e.startTime-t0<5000){cur+=e.value}else{cur=e.value;t0=e.startTime}tl=e.startTime;if(cur>v.CLS)v.CLS=cur});
po('paint',function(e){if(e.name==='first-contentful-paint')v.FCP=e.startTime});
po('event',function(e){if(!e.interactionId)return;if(!ix[e.interactionId]||e.duration>ix[e.interactionId])ix[e.interactionId]=e.duration;var a=Object.keys(ix).map(function(k){return ix[k]}).sort(function(a,b){return b-a});v.INP=a[Math.min(a.length-1,Math.floor(a.length/50))]},{durationThreshold:40});
var n=performance.getEntriesByType('navigation')[0];if(n)v.TTFB=n.responseStart;
var R={LCP:[2500,4000],CLS:[0.1,0.25],INP:[200,500],FCP:[1800,3000],TTFB:[800,1800]},C=['#6ee7a0','#fcd34d','#fca5a5'],N=['good','needs improvement','poor'];
var box=document.createElement('div');box.setAttribute('role','status');box.setAttribute('aria-label','Web Vitals');
box.style.cssText='position:fixed;z-index:2147483647;bottom:8px;right:8px;background:#111;color:#fff;font:12px/1.5 system-ui,sans-serif;padding:8px 10px;border-radius:6px;box-shadow:0 2px 8px #0008;pointer-events:none';
function paint(){${o.overlay ? "box.textContent='';Object.keys(v).forEach(function(k){var x=v[k],d=document.createElement('div'),s=document.createElement('span');if(x==null){d.textContent=k+': waiting';}else{var r=R[k],i=x<=r[0]?0:x<=r[1]?1:2;d.textContent=k+': '+(k==='CLS'?x.toFixed(3):Math.round(x)+' ms')+' ';s.textContent=N[i];s.style.color=C[i];d.appendChild(s)}box.appendChild(d)});" : ''}${o.log ? "console.log('[Web Vitals]',JSON.stringify(v));" : ''}}
${o.overlay ? 'document.body.appendChild(box);' : ''}paint();
window[K]={box:box,stop:function(){obs.forEach(function(q){q.disconnect()})}};
})();`;
    return `BOOKMARKLET URL (create a bookmark and paste this as its address):\n${mkBookmarklet(src)}\n\nREADABLE SOURCE\n${src}\n\nHow it works: PerformanceObserver reads largest-contentful-paint, layout-shift (grouped in session windows of up to 5 s with gaps under 1 s, as CLS is defined), event timing (INP is the 98th-percentile interaction, or the worst when there are under 50) and paint entries. Click the bookmarklet again to remove it. Thresholds: LCP 2.5 s / 4 s, CLS 0.1 / 0.25, INP 200 ms / 500 ms, FCP 1.8 s / 3 s, TTFB 0.8 s / 1.8 s (web.dev).\nLimits: needs a Chromium-based browser for LCP, CLS and INP (Firefox and Safari support fewer of these entries). INP only sees interactions after you click the bookmarklet, plus what the browser buffered. Pages with a strict Content-Security-Policy may block javascript: bookmarklets; run the readable source in the DevTools console instead. This is lab data from your own browser, not the field data Google uses.`;
  },
});
T.push({
  id: 'text-spacing-bookmarklet', cat: 'Accessibility', title: 'Text Spacing Bookmarklet for WCAG 1.4.12 Testing',
  desc: 'Generate a bookmarklet or CSS that applies the WCAG 1.4.12 text spacing values (line height 1.5, letter 0.12em, word 0.16em, paragraph 2em) so you can check that nothing gets clipped or overlaps.',
  inputs: 0, sample: '', opts: [{ id: 'lh', label: 'Line height (times font size)', type: 'number', def: 1.5 }, { id: 'ls', label: 'Letter spacing (em)', type: 'number', def: 0.12 }, { id: 'ws', label: 'Word spacing (em)', type: 'number', def: 0.16 }, { id: 'ps', label: 'Spacing after paragraphs (em)', type: 'number', def: 2 }],
  run(_, o) {
    const n = (x) => { const v = Number(x); if (!(v >= 0 && v < 20)) throw new Error('Values must be numbers between 0 and 20.'); return v; };
    const css = `*{line-height:${n(o.lh)} !important;letter-spacing:${n(o.ls)}em !important;word-spacing:${n(o.ws)}em !important}p{margin-bottom:${n(o.ps)}em !important}`;
    const src = `(function(){var i='ft-text-spacing',s=document.getElementById(i);if(s){s.remove();return}s=document.createElement('style');s.id=i;s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})();`;
    return `CSS (paste into DevTools, a user style sheet or an extension)\n${css}\n\nBOOKMARKLET URL (click once to apply, again to remove)\n${mkBookmarklet(src)}\n\nWhat to check after applying it: no text is cut off or hidden, nothing overlaps, no control or content disappears, and sticky headers and buttons still work. WCAG 2.2 SC 1.4.12 (Text Spacing, AA) requires that no content or function is lost when a user sets line height to at least 1.5 times the font size, spacing after paragraphs to at least 2 times, letter spacing to at least 0.12 times and word spacing to at least 0.16 times (values quoted from the W3C text). Pages do not have to use these values themselves.\nLimits: the CSS is applied to every element, which is stricter than the criterion (it also sets paragraph margins only on p). It cannot reach text inside cross-origin iframes or closed shadow roots, and a strict Content-Security-Policy can block the bookmarklet (use the CSS in DevTools then).`;
  },
});

// ---------- lazy loading injector ----------
function patchTags(html, edits) { // edits: [{pos, len, text}] applied from the end
  let s = html; for (const e of [...edits].sort((a, b) => b.pos - a.pos)) s = s.slice(0, e.pos) + e.text + s.slice(e.pos + e.len); return s;
}
const addAttr = (open, attr) => open.replace(/\s*\/?>$/, (m) => ' ' + attr + (m.trim() === '/>' ? ' />' : '>'));
T.push({
  id: 'lazy-loading-injector', cat: 'Web Performance', title: 'Lazy Loading Injector: Add loading="lazy" to img and iframe',
  desc: 'Paste HTML and get it back with native loading="lazy" and decoding="async" added below the fold, the first images left eager, and a warning when a likely LCP image is lazy.',
  labels: ['HTML'], sample: '<img src="hero.jpg" width="1200" height="600" alt="Hero" loading="lazy">\n<h2>Gallery</h2>\n<img src="a.jpg" width="400" height="300" alt="A">\n<img src="b.jpg" width="400" height="300" alt="B" loading="eager">\n<picture><source srcset="c.webp"><img src="c.jpg" width="400" height="300" alt="C"></picture>\n<iframe src="https://www.youtube.com/embed/x" width="560" height="315" title="Video"></iframe>',
  opts: [{ id: 'skip', label: 'Leave the first N images eager (likely above the fold)', type: 'number', def: 1 }, { id: 'decode', label: 'Add decoding="async" to lazy images', type: 'checkbox', def: true }, { id: 'iframes', label: 'Also lazy-load iframes', type: 'checkbox', def: true }, { id: 'prio', label: 'Add fetchpriority="high" to the first image', type: 'checkbox', def: true }],
  run([s], o) {
    need(s); const root = parseHTML(s), skip = Math.max(0, Number(o.skip) || 0), edits = [], log = []; let idx = 0;
    for (const n of all(root)) {
      if (!['img', 'iframe'].includes(n.tag) || hasAnc(n, (p) => p.tag === 'noscript' || p.tag === 'head')) continue;
      if (n.tag === 'iframe' && !o.iframes) continue;
      const isImg = n.tag === 'img', i = isImg ? idx++ : Infinity, a = n.attrs, ld = (a.loading || '').toLowerCase();
      let open = n.open;
      if (isImg && i < skip) {
        if (ld === 'lazy') { open = open.replace(/\s+loading\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, ''); log.push(`Removed loading="lazy" from image ${i + 1} (${a.src || a['data-src'] || '?'}): lazy-loading the LCP image delays it.`); }
        if (o.prio && i === 0 && !a.fetchpriority) { open = addAttr(open, 'fetchpriority="high"'); log.push(`Added fetchpriority="high" to image 1.`); }
      } else if (!ld) {
        open = addAttr(open, 'loading="lazy"'); if (isImg && o.decode && !a.decoding) open = addAttr(open, 'decoding="async"');
        if (isImg && (!a.width || !a.height)) log.push(`Image ${i + 1} (${a.src || '?'}) is lazy but has no width/height: add them or the page will shift when it loads.`);
        log.push(`Lazy: ${isImg ? 'image ' + (i + 1) : 'iframe'} ${clip(a.src || a['data-src'] || '', 60)}`);
      } else log.push(`Kept loading="${ld}" on ${isImg ? 'image ' + (i + 1) : 'iframe'} ${clip(a.src || '', 60)}`);
      if (open !== n.open) edits.push({ pos: n.pos, len: n.open.length, text: open });
    }
    if (!edits.length && !log.length) throw new Error('No <img> or <iframe> tags found.');
    return `${patchTags(s, edits)}\n\n<!-- CHANGES\n${log.map((x) => '- ' + x.replace(/--/g, '- -')).join('\n') || '- nothing to change'}\n-->\n\nRules of thumb: never lazy-load the largest image visible at load (the LCP candidate); lazy-load images and iframes well below the fold. "First N images" is a guess, so check which image is your LCP in DevTools or Lighthouse. Images set from JavaScript (data-src libraries) and CSS backgrounds are not touched.`;
  },
});

// ---------- render-blocking finder ----------
T.push({
  id: 'render-blocking-resource-finder', cat: 'Web Performance', title: 'Render-Blocking Resource Finder for Scripts and Stylesheets',
  desc: 'Paste your page HTML and list the scripts and stylesheets that block first paint: sync scripts in head, stylesheets without a media query, @import chains and blocking inline scripts, with a fix for each.',
  labels: ['Page HTML'], sample: '<!doctype html><html><head>\n<link rel="stylesheet" href="/css/main.css">\n<link rel="stylesheet" href="/css/print.css" media="print">\n<link rel="preload" href="/css/late.css" as="style" onload="this.rel=\'stylesheet\'">\n<style>@import url("/css/theme.css");body{margin:0}</style>\n<script src="/js/jquery.js"></script>\n<script src="/js/app.js" defer></script>\n<script src="https://www.googletagmanager.com/gtag/js?id=G-1" async></script>\n<script type="module" src="/js/main.mjs"></script>\n<script>window.dataLayer=[];</script>\n</head><body><h1>Hi</h1><script src="/js/widget.js"></script></body></html>',
  run([s]) {
    need(s); const root = parseHTML(s), els = all(root), out = [], ok = []; let n = 0;
    const add = (kind, msg, fix, el) => { n++; out.push(`${n}. [${kind}] ${msg}\n   ${where(root, el)}\n   Fix: ${fix}`); };
    for (const e of els) {
      const a = e.attrs, inHead = hasAnc(e, (p) => p.tag === 'head');
      if (e.tag === 'script' && a.src !== undefined) {
        const t = (a.type || '').toLowerCase();
        if (t === 'module' || 'async' in a || 'defer' in a) ok.push(`script ${clip(a.src, 50)}: ${t === 'module' ? 'module (deferred by default)' : 'async' in a ? 'async' : 'defer'}`);
        else add('script', `${inHead ? 'Parser-blocking script in <head>' : 'Parser-blocking script in <body>'}: ${clip(a.src, 70)}`, inHead ? 'add defer (keeps order) or async (independent scripts), or move it to the end of <body>.' : 'add defer or async. It stops the browser from parsing the rest of the page until it has downloaded and run.', e);
      } else if (e.tag === 'script' && !a.src && inHead && (a.type || '').toLowerCase() !== 'module' && !/json|speculationrules|importmap|template/i.test(a.type || '')) {
        const t = e.kids[0] ? e.kids[0].text : ''; if (t.trim()) add('inline script', 'Inline script in <head> runs before the page is parsed further (cheap if short, costly if large)', 'keep it tiny, or move it below the content / into a deferred file. Size here: ' + fmtB(t.length) + '.', e);
      } else if (e.tag === 'link' && /(^|\s)stylesheet(\s|$)/i.test(a.rel || '')) {
        const media = (a.media || '').trim().toLowerCase();
        if (media === 'print' || (media && media !== 'all' && !/^(screen)?$/.test(media))) ok.push(`stylesheet ${clip(a.href || '', 50)}: media="${media}" (not render-blocking unless it matches)`);
        else add('stylesheet', `Render-blocking stylesheet: ${clip(a.href || '', 70)}${inHead ? '' : ' (in <body>)'}`, 'inline the critical rules and load the rest with rel="preload" as="style" onload, or split by media query; stylesheets block rendering by design.', e);
      } else if (e.tag === 'style') {
        const t = e.kids[0] ? e.kids[0].text : ''; for (const m of t.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) add('@import', `CSS @import of ${clip(m[1], 60)} is discovered late and chained after this stylesheet`, 'replace with a <link rel="stylesheet"> in the HTML (or bundle the files).', e);
      } else if (e.tag === 'link' && /preload/i.test(a.rel || '') && a.as === 'style' && !a.onload) ok.push(`preload style ${clip(a.href || '', 50)}: only a hint; needs a stylesheet link or onload swap to apply`);
    }
    return `${out.length ? out.join('\n\n') : 'No render-blocking resources found.'}\n\n${out.length} finding${out.length === 1 ? '' : 's'}.${ok.length ? '\n\nNOT BLOCKING\n' + ok.map((x) => '- ' + x).join('\n') : ''}\n\nStatic reading of the HTML you pasted: it does not know file sizes, whether a script is already cached, or CSS loaded by scripts. Lighthouse "Eliminate render-blocking resources" measures the real cost.`;
  },
});

// ---------- speculation rules ----------
T.push({
  id: 'speculation-rules-generator', cat: 'Web Performance', title: 'Speculation Rules Generator for Prefetch and Prerender',
  desc: 'Build the speculationrules JSON for prefetch or prerender from URL lists and URL patterns, with eagerness, exclusions and the script tag to paste in your page.',
  labels: ['URLs or patterns, one per line'], placeholder: ['/pricing\n/blog/*'],
  sample: '/pricing\n/signup\n/blog/*\n/docs/*',
  opts: [{ id: 'action', label: 'Action', type: 'select', def: 'prefetch', choices: ['prefetch', 'prerender'] }, { id: 'eager', label: 'Eagerness', type: 'select', def: 'moderate', choices: ['conservative', 'moderate', 'eager', 'immediate'] }, { id: 'excl', label: 'Never speculate these patterns (comma separated)', type: 'text', def: '/logout, /cart/*, /account/*, *?add-to-cart=*' }, { id: 'sel', label: 'Skip links matching this CSS selector', type: 'text', def: '.no-speculate, [rel~=nofollow]' }],
  run([s], o) {
    need(s, 'at least one URL or pattern');
    const lines = s.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')), urls = lines.filter((l) => !l.includes('*')), pats = lines.filter((l) => l.includes('*'));
    const ex = String(o.excl || '').split(',').map((x) => x.trim()).filter(Boolean), rules = [];
    if (urls.length) rules.push({ urls, eagerness: o.eager });
    if (pats.length) {
      const and = [{ href_matches: pats.length === 1 ? pats[0] : pats }];
      if (ex.length) and.push({ not: { href_matches: ex.length === 1 ? ex[0] : ex } });
      if (String(o.sel || '').trim()) and.push({ not: { selector_matches: o.sel.trim() } });
      rules.push({ where: { and }, eagerness: o.eager });
    }
    const json = JSON.stringify({ [o.action]: rules }, null, 2);
    const warn = [];
    if (o.eager === 'immediate' && pats.length) warn.push('"immediate" with URL patterns speculates on every matching link on load. Use moderate or conservative for pattern rules.');
    if (o.action === 'prerender') warn.push('Prerender runs the whole page, including its scripts and analytics. Make sure pages are safe to load without the user visiting (no one-time actions, no logout or purchase side effects) and that analytics wait for activation.');
    if (urls.some((u) => ex.some((e) => e === u))) warn.push('A listed URL is also in the exclusion list: list rules ignore exclusions.');
    return `<script type="speculationrules">\n${json}\n</script>\n\n${warn.length ? 'REVIEW\n' + warn.map((x) => '- ' + x).join('\n') + '\n\n' : ''}Notes: rules are JSON in a script element with type="speculationrules" (the HTML Standard defines the format; "prefetch" is in the standard, "prerender" is a Chromium feature that other browsers ignore). Eagerness: immediate (as soon as possible), eager, moderate (on hover for a short time), conservative (on pointer or touch down). A rule uses either "urls" or "where", never both, so the tool writes two rules when you mix them. Patterns use the URL Pattern syntax (for example /blog/*). Speculative loads use data, so keep the list short and the eagerness low for mobile visitors. Test in Chrome DevTools, Application, Speculative loads.`;
  },
});

// ---------- Server-Timing ----------
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
T.push({
  id: 'server-timing-parser', cat: 'Web Performance', title: 'Server-Timing Header Parser with Duration Bars',
  desc: 'Paste a Server-Timing response header and read each metric as a table with name, description and duration in milliseconds, with bars and syntax warnings.',
  labels: ['Server-Timing header value (several header lines are fine)'], placeholder: ['cache;desc="Cache Read";dur=23.2, db;dur=53, app;dur=47.2'],
  sample: 'Server-Timing: cache;desc="Cache Read";dur=23.2, db;dur=53, app;dur=47.2\nServer-Timing: cdn-cache;desc=HIT, edge;dur=4, total;dur=130.5, bad name;dur=abc',
  run([s]) {
    need(s, 'a Server-Timing header'); const items = [], warn = [];
    for (const line of s.split('\n')) {
      const v = line.replace(/^\s*server-timing\s*:/i, '').trim(); if (!v) continue;
      for (const m of splitTop(v, ',')) {
        const parts = splitTop(m, ';'), name = parts.shift().trim(); if (!name) continue;
        if (!TOKEN.test(name)) { warn.push(`"${clip(name, 30)}" is not a valid metric name (letters, digits and !#$%&'*+-.^_\`|~ only).`); continue; }
        const it = { name, dur: null, desc: '' };
        for (const p of parts) {
          const eq = p.indexOf('='); const k = (eq < 0 ? p : p.slice(0, eq)).trim().toLowerCase(); let val = eq < 0 ? '' : p.slice(eq + 1).trim();
          if (val.startsWith('"')) val = val.slice(1, val.endsWith('"') && val.length > 1 ? -1 : undefined).replace(/\\(.)/g, '$1');
          if (k === 'dur') { if (val !== '' && /^\d+(\.\d+)?$/.test(val)) it.dur = parseFloat(val); else warn.push(`${name}: dur "${val}" is not a number (dropped).`); }
          else if (k === 'desc') it.desc = val;
          else warn.push(`${name}: unknown parameter "${k}" (ignored).`);
        }
        items.push(it);
      }
    }
    if (!items.length) throw new Error('No metrics found. Example: db;dur=53, app;dur=47.2');
    const max = Math.max(1, ...items.map((i) => i.dur || 0)), sum = items.reduce((a, i) => a + (i.dur || 0), 0);
    const rows = [['Metric', 'Duration', 'Description', 'Bar']];
    for (const i of items) rows.push([i.name, i.dur == null ? '-' : r1(i.dur, 2) + ' ms', i.desc || '', i.dur ? '#'.repeat(Math.max(1, Math.round((i.dur / max) * 30))) : '']);
    return `${tbl(rows)}\n\n${items.length} metric${items.length === 1 ? '' : 's'}, durations add up to ${r1(sum, 2)} ms. Metrics can overlap or nest (a "total" includes the others), so the sum is not always the response time.${warn.length ? '\n\nWARNINGS\n' + warn.map((x) => '- ' + x).join('\n') : ''}\n\nSyntax: name;dur=milliseconds;desc="text", comma separated. Browsers show these in DevTools (Network, Timing) and expose them to scripts through PerformanceServerTiming for same-origin responses, or cross-origin with Timing-Allow-Origin. Do not put secrets or internal hostnames in them: any visitor can read the header.`;
  },
});

// ---------- TBT estimator ----------
T.push({
  id: 'total-blocking-time-estimator', cat: 'Web Performance', title: 'Total Blocking Time Estimator from JavaScript Bundle Sizes',
  desc: 'Enter script sizes and a CPU slowdown to model how many long-task milliseconds they add, and how splitting work into smaller tasks cuts Total Blocking Time. An editable model, not a measurement.',
  labels: ['One script per line: name, size in KB (compressed)'], placeholder: ['app.js, 320'],
  sample: 'framework.js, 140\napp.js, 320\nanalytics.js, 60\nchat-widget.js, 110',
  opts: [
    { id: 'cpu', label: 'Device', type: 'select', def: 'mid-tier mobile (4x slowdown)', choices: ['desktop (1x)', 'mid-tier mobile (4x slowdown)', 'low-tier mobile (6x slowdown)'] },
    { id: 'msKb', label: 'Main-thread ms per compressed KB on a desktop CPU (your assumption)', type: 'number', def: 1 },
    { id: 'split', label: 'Split each script into this many equal tasks', type: 'number', def: 1 }],
  run([s], o) {
    need(s, 'a script list'); const k = { 'desktop (1x)': 1, 'mid-tier mobile (4x slowdown)': 4, 'low-tier mobile (6x slowdown)': 6 }[o.cpu] || 4, per = Number(o.msKb), parts = Math.max(1, Math.floor(Number(o.split) || 1));
    if (!(per > 0)) throw new Error('Milliseconds per KB must be above 0.');
    const rows = [['Script', 'KB', 'Main thread', 'Task length', 'Blocking time']]; let tbt = 0, tot = 0;
    for (const line of s.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const m = /^(.*?)[,\s]+([\d.]+)\s*(?:kb)?$/i.exec(line); if (!m) throw new Error('Use "name, size in KB" on each line: ' + clip(line, 40));
      const kb = parseFloat(m[2]), ms = kb * per * k, task = ms / parts, blk = Math.max(0, task - 50) * parts; tbt += blk; tot += ms;
      rows.push([m[1], kb, Math.round(ms) + ' ms', Math.round(task) + ' ms' + (parts > 1 ? ' x ' + parts : ''), Math.round(blk) + ' ms']);
    }
    const rate = tbt <= 200 ? 'good' : tbt <= 600 ? 'needs improvement' : 'poor';
    return `${tbl(rows)}\n\nModelled main-thread work: ${Math.round(tot)} ms. Estimated Total Blocking Time from scripts: ${Math.round(tbt)} ms (${rate} on the web.dev bands: good up to 200 ms, poor above 600 ms).\n\nHow it works: TBT adds up the part of every main-thread task that is longer than 50 ms. Here each script runs as ${parts === 1 ? 'one task' : parts + ' equal tasks'} that takes size x ms-per-KB x slowdown. CPU slowdowns of 4x (mid-tier mobile) and 6x (low-tier mobile) are the DevTools throttling presets; Lighthouse simulates 4x.\nThis is a model, not a measurement. The ms-per-KB default is a rough assumption: real cost depends on the code (parsing is cheap, executing is not), the engine and the cache. Calibrate it: record one bundle in the DevTools Performance panel, divide its task time by its compressed size, and enter that value. Use it to see the effect of splitting or removing a script, then verify with Lighthouse.`;
  },
});

// ---------- reference data (extracted from W3C WAI-ARIA 1.2, WCAG 2.2 and the WHATWG HTML Standard, October 2026) ----------
// ARIA roles (separator: aria-valuenow is required only when focusable, so it is not listed): name -> [abstract, parents, required attrs, own supported attrs, name required, required context, required owned, prohibited attrs]
const ARIA_ROLES = {"alert":[0,["section"],[],[],0,[],[],[]],"alertdialog":[0,["alert","dialog"],[],[],1,[],[],[]],"application":[0,["structure"],[],["aria-activedescendant","aria-disabled","aria-errormessage","aria-expanded","aria-haspopup","aria-invalid"],1,[],[],[]],"article":[0,["document"],[],["aria-posinset","aria-setsize"],0,[],[],[]],"banner":[0,["landmark"],[],[],0,[],[],[]],"blockquote":[0,["section"],[],[],0,[],[],[]],"button":[0,["command"],[],["aria-disabled","aria-haspopup","aria-expanded","aria-pressed"],1,[],[],[]],"caption":[0,["section"],[],[],0,["figure","grid","table","treegrid"],[],["aria-label","aria-labelledby"]],"cell":[0,["section"],[],["aria-colindex","aria-colspan","aria-rowindex","aria-rowspan"],0,["row"],[],[]],"checkbox":[0,["input"],["aria-checked"],["aria-errormessage","aria-expanded","aria-invalid","aria-readonly","aria-required"],1,[],[],[]],"code":[0,["section"],[],[],0,[],[],["aria-label","aria-labelledby"]],"columnheader":[0,["cell","gridcell","sectionhead"],[],["aria-sort"],1,["row"],[],[]],"combobox":[0,["input"],["aria-controls","aria-expanded"],["aria-activedescendant","aria-autocomplete","aria-errormessage","aria-haspopup","aria-invalid","aria-readonly","aria-required"],1,[],[],[]],"command":[1,["widget"],[],[],0,[],[],[]],"complementary":[0,["landmark"],[],[],0,[],[],[]],"composite":[1,["widget"],[],["aria-activedescendant","aria-disabled"],0,[],[],[]],"contentinfo":[0,["landmark"],[],[],0,[],[],[]],"definition":[0,["section"],[],[],0,[],[],[]],"deletion":[0,["section"],[],[],0,[],[],["aria-label","aria-labelledby"]],"dialog":[0,["window"],[],[],1,[],[],[]],"directory":[0,["list"],[],[],0,[],[],[]],"document":[0,["structure"],[],[],0,[],[],[]],"emphasis":[0,["section"],[],[],0,[],[],["aria-label","aria-labelledby"]],"feed":[0,["list"],[],[],0,[],["article"],[]],"figure":[0,["section"],[],[],0,[],[],[]],"form":[0,["landmark"],[],[],0,[],[],[]],"generic":[0,["structure"],[],[],0,[],[],["aria-label","aria-labelledby","aria-roledescription"]],"grid":[0,["composite","table"],[],["aria-multiselectable","aria-readonly"],1,[],["row","rowgroup","row"],[]],"gridcell":[0,["cell","widget"],[],["aria-disabled","aria-errormessage","aria-expanded","aria-haspopup","aria-invalid","aria-readonly","aria-required","aria-selected"],0,["row"],[],[]],"group":[0,["section"],[],["aria-activedescendant","aria-disabled"],0,[],[],[]],"heading":[0,["sectionhead"],["aria-level"],[],1,[],[],[]],"img":[0,["section"],[],[],1,[],[],[]],"input":[1,["widget"],[],["aria-disabled"],0,[],[],[]],"insertion":[0,["section"],[],[],0,[],[],["aria-label","aria-labelledby"]],"landmark":[1,["section"],[],[],0,[],[],[]],"link":[0,["command"],[],["aria-disabled","aria-expanded","aria-haspopup"],1,[],[],[]],"list":[0,["section"],[],[],0,[],["listitem"],[]],"listbox":[0,["select"],[],["aria-errormessage","aria-expanded","aria-invalid","aria-multiselectable","aria-readonly","aria-required"],1,[],["group","option","option"],[]],"listitem":[0,["section"],[],["aria-level","aria-posinset","aria-setsize"],0,["directory","list"],[],[]],"log":[0,["section"],[],[],0,[],[],[]],"main":[0,["landmark"],[],[],0,[],[],[]],"marquee":[0,["section"],[],[],1,[],[],[]],"math":[0,["section"],[],[],0,[],[],[]],"meter":[0,["range"],["aria-valuenow"],[],1,[],[],[]],"menu":[0,["select"],[],[],0,[],["group","menuitem","group","menuitemradio","group","menuitemcheckbox","menuitem","menuitemcheckbox","menuitemradio"],[]],"menubar":[0,["menu"],[],[],0,[],["group","menuitem","group","menuitemradio","group","menuitemcheckbox","menuitem","menuitemcheckbox","menuitemradio"],[]],"menuitem":[0,["command"],[],["aria-disabled","aria-expanded","aria-haspopup","aria-posinset","aria-setsize"],1,["group","menu","menubar"],[],[]],"menuitemcheckbox":[0,["menuitem"],["aria-checked"],[],1,["group","menu","menubar"],[],[]],"menuitemradio":[0,["menuitemcheckbox"],[],[],1,["group","menu","menubar"],[],[]],"navigation":[0,["landmark"],[],[],0,[],[],[]],"note":[0,["section"],[],[],0,[],[],[]],"option":[0,["input"],["aria-selected"],["aria-checked","aria-posinset","aria-setsize"],1,["group","listbox"],[],[]],"paragraph":[0,["section"],[],[],0,[],[],["aria-label","aria-labelledby"]],"presentation":[0,["structure"],[],[],0,[],[],["aria-label","aria-labelledby"]],"progressbar":[0,["range","widget"],[],[],1,[],[],[]],"radio":[0,["input"],["aria-checked"],["aria-posinset","aria-setsize"],1,[],[],[]],"radiogroup":[0,["select"],[],["aria-errormessage","aria-invalid","aria-readonly","aria-required"],1,[],["radio"],[]],"range":[1,["structure"],[],["aria-valuemax","aria-valuemin","aria-valuenow","aria-valuetext"],0,[],[],[]],"region":[0,["landmark"],[],[],1,[],[],[]],"roletype":[1,[],[],["aria-atomic","aria-busy","aria-controls","aria-current","aria-describedby","aria-details","aria-dropeffect","aria-flowto","aria-grabbed","aria-hidden","aria-keyshortcuts","aria-label","aria-labelledby","aria-live","aria-owns","aria-relevant","aria-roledescription"],0,[],[],[]],"row":[0,["group","widget"],[],["aria-colindex","aria-expanded","aria-level","aria-posinset","aria-rowindex","aria-setsize","aria-selected"],0,["grid","rowgroup","table","treegrid"],["cell","columnheader","gridcell","rowheader"],[]],"rowgroup":[0,["structure"],[],[],0,["grid","table","treegrid"],["row"],[]],"rowheader":[0,["cell","gridcell","sectionhead"],[],["aria-expanded","aria-sort"],1,["row"],[],[]],"scrollbar":[0,["range","widget"],["aria-controls","aria-valuenow"],["aria-disabled","aria-orientation","aria-valuemax","aria-valuemin"],0,[],[],[]],"search":[0,["landmark"],[],[],0,[],[],[]],"searchbox":[0,["textbox"],[],[],1,[],[],[]],"section":[1,["structure"],[],[],0,[],[],[]],"sectionhead":[1,["structure"],[],[],0,[],[],[]],"select":[1,["composite","group"],[],["aria-orientation"],0,[],[],[]],"separator":[0,["structure","widget"],[],["aria-disabled","aria-orientation","aria-valuemax","aria-valuemin","aria-valuetext"],0,[],[],[]],"slider":[0,["input","range"],["aria-valuenow"],["aria-errormessage","aria-haspopup","aria-invalid","aria-orientation","aria-readonly","aria-valuemax","aria-valuemin"],1,[],[],[]],"spinbutton":[0,["composite","input","range"],[],["aria-errormessage","aria-invalid","aria-readonly","aria-required","aria-valuemax","aria-valuemin","aria-valuenow","aria-valuetext"],1,[],[],[]],"status":[0,["section"],[],[],0,[],[],[]],"strong":[0,["section"],[],[],0,[],[],["aria-label","aria-labelledby"]],"structure":[1,["roletype"],[],[],0,[],[],[]],"subscript":[0,["section"],[],[],0,[],[],["aria-label","aria-labelledby"]],"superscript":[0,["section"],[],[],0,[],[],["aria-label","aria-labelledby"]],"switch":[0,["checkbox"],["aria-checked"],[],1,[],[],[]],"tab":[0,["sectionhead","widget"],[],["aria-disabled","aria-expanded","aria-haspopup","aria-posinset","aria-selected","aria-setsize"],0,["tablist"],[],[]],"table":[0,["section"],[],["aria-colcount","aria-rowcount"],1,[],["row","rowgroup","row"],[]],"tablist":[0,["composite"],[],["aria-multiselectable","aria-orientation"],0,[],["tab"],[]],"tabpanel":[0,["section"],[],[],1,[],[],[]],"term":[0,["section"],[],[],0,[],[],[]],"textbox":[0,["input"],[],["aria-activedescendant","aria-autocomplete","aria-errormessage","aria-haspopup","aria-invalid","aria-multiline","aria-placeholder","aria-readonly","aria-required"],1,[],[],[]],"time":[0,["section"],[],[],0,[],[],[]],"timer":[0,["status"],[],[],0,[],[],[]],"toolbar":[0,["group"],[],["aria-orientation"],0,[],[],[]],"tooltip":[0,["section"],[],[],1,[],[],[]],"tree":[0,["select"],[],["aria-errormessage","aria-invalid","aria-multiselectable","aria-required"],1,[],["group","treeitem","treeitem"],[]],"treegrid":[0,["grid","tree"],[],[],1,[],["row","rowgroup","row"],[]],"treeitem":[0,["listitem","option"],[],["aria-expanded","aria-haspopup"],1,["group","tree"],[],[]],"widget":[1,["roletype"],[],[],0,[],[],[]],"window":[1,["roletype"],[],["aria-modal"],0,[],[],[]]};
const ARIA_ATTRS = {"aria-activedescendant":["ID reference",[]],"aria-atomic":["true/false",["false","true"]],"aria-autocomplete":["token",["inline","list","both","none"]],"aria-busy":["true/false",["false","true"]],"aria-checked":["tristate",["false","mixed","true","undefined"]],"aria-colcount":["integer",[]],"aria-colindex":["integer",[]],"aria-colspan":["integer",[]],"aria-controls":["ID reference list",[]],"aria-current":["token",["page","step","location","date","time","true","false"]],"aria-describedby":["ID reference list",[]],"aria-details":["ID reference",[]],"aria-disabled":["true/false",["false","true"]],"aria-dropeffect":["token list",["copy","execute","link","move","none","popup"]],"aria-errormessage":["ID reference",[]],"aria-expanded":["true/false/undefined",["false","true","undefined"]],"aria-flowto":["ID reference list",[]],"aria-grabbed":["true/false/undefined",["false","true","undefined"]],"aria-haspopup":["token",["false","true","menu","listbox","tree","grid","dialog"]],"aria-hidden":["true/false/undefined",["false","true","undefined"]],"aria-invalid":["token",["grammar","false","spelling","true"]],"aria-keyshortcuts":["string",[]],"aria-label":["string",[]],"aria-labelledby":["ID reference list",[]],"aria-level":["integer",[]],"aria-live":["token",["assertive","off","polite"]],"aria-modal":["true/false",["false","true"]],"aria-multiline":["true/false",["false","true"]],"aria-multiselectable":["true/false",["false","true"]],"aria-orientation":["token",["horizontal","undefined","vertical"]],"aria-owns":["ID reference list",[]],"aria-placeholder":["string",[]],"aria-posinset":["integer",[]],"aria-pressed":["tristate",["false","mixed","true","undefined"]],"aria-readonly":["true/false",["false","true"]],"aria-relevant":["token list",["additions","additions text","all","removals","text"]],"aria-required":["true/false",["false","true"]],"aria-roledescription":["string",[]],"aria-rowcount":["integer",[]],"aria-rowindex":["integer",[]],"aria-rowspan":["integer",[]],"aria-selected":["true/false/undefined",["false","true","undefined"]],"aria-setsize":["integer",[]],"aria-sort":["token",["ascending","descending","none","other"]],"aria-valuemax":["number",[]],"aria-valuemin":["number",[]],"aria-valuenow":["number",[]],"aria-valuetext":["string",[]]}; // name -> [value type, allowed tokens]
const NAME_FROM_CONTENT = new Set(["button", "cell", "checkbox", "columnheader", "gridcell", "heading", "link", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "radio", "row", "rowheader", "sectionhead", "switch", "tab", "tooltip", "treeitem"]);
const AUTOCOMPLETE_TOKENS = ["name", "honorific-prefix", "given-name", "additional-name", "family-name", "honorific-suffix", "nickname", "username", "new-password", "current-password", "one-time-code", "organization-title", "organization", "street-address", "address-line1", "address-line2", "address-line3", "address-level4", "address-level3", "address-level2", "address-level1", "country", "country-name", "postal-code", "cc-name", "cc-given-name", "cc-additional-name", "cc-family-name", "cc-number", "cc-exp", "cc-exp-month", "cc-exp-year", "cc-csc", "cc-type", "transaction-currency", "transaction-amount", "language", "bday", "bday-day", "bday-month", "bday-year", "sex", "url", "photo", "tel", "tel-country-code", "tel-national", "tel-area-code", "tel-local", "tel-local-prefix", "tel-local-suffix", "tel-extension", "email", "impp"];
// WCAG 2.2 success criteria: [number, name, level, first sentence of the normative text, Understanding page slug, new in 2.2]
const WCAG22 = [["1.1.1","Non-text Content","A","All non-text content that is presented to the user has a text alternative that serves the equivalent purpose, except for the situations listed below.","non-text-content",0],["1.2.1","Audio-only and Video-only (Prerecorded)","A","For prerecorded audio-only and prerecorded video-only media, the following are true, except when the audio or video is a media alternative for text and is clearly labeled as such:","audio-only-and-video-only-prerecorded",0],["1.2.2","Captions (Prerecorded)","A","Captions are provided for all prerecorded audio content in synchronized media, except when the media is a media alternative for text and is clearly labeled as such.","captions-prerecorded",0],["1.2.3","Audio Description or Media Alternative (Prerecorded)","A","An alternative for time-based media or audio description of the prerecorded video content is provided for synchronized media, except when the media is a media alternative for text and is clearly labeled as such.","audio-description-or-media-alternative-prerecorded",0],["1.2.4","Captions (Live)","AA","Captions are provided for all live audio content in synchronized media.","captions-live",0],["1.2.5","Audio Description (Prerecorded)","AA","Audio description is provided for all prerecorded video content in synchronized media.","audio-description-prerecorded",0],["1.2.6","Sign Language (Prerecorded)","AAA","Sign language interpretation is provided for all prerecorded audio content in synchronized media.","sign-language-prerecorded",0],["1.2.7","Extended Audio Description (Prerecorded)","AAA","Where pauses in foreground audio are insufficient to allow audio descriptions to convey the sense of the video, extended audio description is provided for all prerecorded video content in synchronized media.","extended-audio-description-prerecorded",0],["1.2.8","Media Alternative (Prerecorded)","AAA","An alternative for time-based media is provided for all prerecorded synchronized media and for all prerecorded video-only media.","media-alternative-prerecorded",0],["1.2.9","Audio-only (Live)","AAA","An alternative for time-based media that presents equivalent information for live audio-only content is provided.","audio-only-live",0],["1.3.1","Info and Relationships","A","Information, structure, and relationships conveyed through presentation can be programmatically determined or are available in text.","info-and-relationships",0],["1.3.2","Meaningful Sequence","A","When the sequence in which content is presented affects its meaning, a correct reading sequence can be programmatically determined.","meaningful-sequence",0],["1.3.3","Sensory Characteristics","A","Instructions provided for understanding and operating content do not rely solely on sensory characteristics of components such as shape, color, size, visual location, orientation, or sound.","sensory-characteristics",0],["1.3.4","Orientation","AA","Content does not restrict its view and operation to a single display orientation, such as portrait or landscape, unless a specific display orientation is essential.","orientation",0],["1.3.5","Identify Input Purpose","AA","The purpose of each input field collecting information about the user can be programmatically determined when:","identify-input-purpose",0],["1.3.6","Identify Purpose","AAA","In content implemented using markup languages, the purpose of user interface components, icons, and regions can be programmatically determined.","identify-purpose",0],["1.4.1","Use of Color","A","Color is not used as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element.","use-of-color",0],["1.4.2","Audio Control","A","If any audio on a web page plays automatically for more than 3 seconds, either a mechanism is available to pause or stop the audio, or a mechanism is available to control audio volume independently from the overall system volume level.","audio-control",0],["1.4.3","Contrast (Minimum)","AA","The visual presentation of text and images of text has a contrast ratio of at least 4.5:1, except for the following:","contrast-minimum",0],["1.4.4","Resize Text","AA","Except for captions and images of text, text can be resized without assistive technology up to 200 percent without loss of content or functionality.","resize-text",0],["1.4.5","Images of Text","AA","If the technologies being used can achieve the visual presentation, text is used to convey information rather than images of text except for the following:","images-of-text",0],["1.4.6","Contrast (Enhanced)","AAA","The visual presentation of text and images of text has a contrast ratio of at least 7:1, except for the following:","contrast-enhanced",0],["1.4.7","Low or No Background Audio","AAA","For prerecorded audio-only content that (1) contains primarily speech in the foreground, (2) is not an audio CAPTCHA or audio logo, and (3) is not vocalization intended to be primarily musical expression such as singing or rapping, at least one of the following is true:","low-or-no-background-audio",0],["1.4.8","Visual Presentation","AAA","For the visual presentation of blocks of text, a mechanism is available to achieve the following:","visual-presentation",0],["1.4.9","Images of Text (No Exception)","AAA","Images of text are only used for pure decoration or where a particular presentation of text is essential to the information being conveyed.","images-of-text-no-exception",0],["1.4.10","Reflow","AA","Content can be presented without loss of information or functionality, and without requiring scrolling in two dimensions for:","reflow",0],["1.4.11","Non-text Contrast","AA","The visual presentation of the following have a contrast ratio of at least 3:1 against adjacent color(s):","non-text-contrast",0],["1.4.12","Text Spacing","AA","In content implemented using markup languages that support the following text style properties, no loss of content or functionality occurs by setting all of the following and by changing no other style property:","text-spacing",0],["1.4.13","Content on Hover or Focus","AA","Where receiving and then removing pointer hover or keyboard focus triggers additional content to become visible and then hidden, the following are true:","content-on-hover-or-focus",0],["2.1.1","Keyboard","A","All functionality of the content is operable through a keyboard interface without requiring specific timings for individual keystrokes, except where the underlying function requires input that depends on the path of the user's movement and not just the endpoints.","keyboard",0],["2.1.2","No Keyboard Trap","A","If keyboard focus can be moved to a component of the page using a keyboard interface, then focus can be moved away from that component using only a keyboard interface, and, if it requires more than unmodified arrow or tab keys or other standard exit methods, the user is advised of the method for moving focus away.","no-keyboard-trap",0],["2.1.3","Keyboard (No Exception)","AAA","All functionality of the content is operable through a keyboard interface without requiring specific timings for individual keystrokes.","keyboard-no-exception",0],["2.1.4","Character Key Shortcuts","A","If a keyboard shortcut is implemented in content using only letter (including upper- and lower-case letters), punctuation, number, or symbol characters, then at least one of the following is true:","character-key-shortcuts",0],["2.2.1","Timing Adjustable","A","For each time limit that is set by the content, at least one of the following is true:","timing-adjustable",0],["2.2.2","Pause, Stop, Hide","A","For moving, blinking, scrolling, or auto-updating information, all of the following are true:","pause-stop-hide",0],["2.2.3","No Timing","AAA","Timing is not an essential part of the event or activity presented by the content, except for non-interactive synchronized media and real-time events.","no-timing",0],["2.2.4","Interruptions","AAA","Interruptions can be postponed or suppressed by the user, except interruptions involving an emergency.","interruptions",0],["2.2.5","Re-authenticating","AAA","When an authenticated session expires, the user can continue the activity without loss of data after re-authenticating.","re-authenticating",0],["2.2.6","Timeouts","AAA","Users are warned of the duration of any user inactivity that could cause data loss, unless the data is preserved for more than 20 hours when the user does not take any actions.","timeouts",0],["2.3.1","Three Flashes or Below Threshold","A","Web pages do not contain anything that flashes more than three times in any one second period, or the flash is below the general flash and red flash thresholds.","three-flashes-or-below-threshold",0],["2.3.2","Three Flashes","AAA","Web pages do not contain anything that flashes more than three times in any one second period.","three-flashes",0],["2.3.3","Animation from Interactions","AAA","Motion animation triggered by interaction can be disabled, unless the animation is essential to the functionality or the information being conveyed.","animation-from-interactions",0],["2.4.1","Bypass Blocks","A","A mechanism is available to bypass blocks of content that are repeated on multiple web pages.","bypass-blocks",0],["2.4.2","Page Titled","A","Web pages have titles that describe topic or purpose.","page-titled",0],["2.4.3","Focus Order","A","If a web page can be navigated sequentially and the navigation sequences affect meaning or operation, focusable components receive focus in an order that preserves meaning and operability.","focus-order",0],["2.4.4","Link Purpose (In Context)","A","The purpose of each link can be determined from the link text alone or from the link text together with its programmatically determined link context, except where the purpose of the link would be ambiguous to users in general.","link-purpose-in-context",0],["2.4.5","Multiple Ways","AA","More than one way is available to locate a web page within a set of web pages except where the web page is the result of, or a step in, a process.","multiple-ways",0],["2.4.6","Headings and Labels","AA","Headings and labels describe topic or purpose.","headings-and-labels",0],["2.4.7","Focus Visible","AA","Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible.","focus-visible",0],["2.4.8","Location","AAA","Information about the user's location within a set of web pages is available.","location",0],["2.4.9","Link Purpose (Link Only)","AAA","A mechanism is available to allow the purpose of each link to be identified from link text alone, except where the purpose of the link would be ambiguous to users in general.","link-purpose-link-only",0],["2.4.10","Section Headings","AAA","Section headings are used to organize the content.","section-headings",0],["2.4.11","Focus Not Obscured (Minimum)","AA","When a user interface component receives keyboard focus, the component is not entirely hidden due to author-created content.","focus-not-obscured-minimum",1],["2.4.12","Focus Not Obscured (Enhanced)","AAA","When a user interface component receives keyboard focus, no part of the component is hidden by author-created content.","focus-not-obscured-enhanced",1],["2.4.13","Focus Appearance","AAA","When the keyboard focus indicator is visible, an area of the focus indicator meets all the following:","focus-appearance",1],["2.5.1","Pointer Gestures","A","All functionality that uses multipoint or path-based gestures for operation can be operated with a single pointer without a path-based gesture, unless a multipoint or path-based gesture is essential.","pointer-gestures",0],["2.5.2","Pointer Cancellation","A","For functionality that can be operated using a single pointer, at least one of the following is true:","pointer-cancellation",0],["2.5.3","Label in Name","A","For user interface components with labels that include text or images of text, the name contains the text that is presented visually.","label-in-name",0],["2.5.4","Motion Actuation","A","Functionality that can be operated by device motion or user motion can also be operated by user interface components and responding to the motion can be disabled to prevent accidental actuation, except when:","motion-actuation",0],["2.5.5","Target Size (Enhanced)","AAA","The size of the target for pointer inputs is at least 44 by 44 CSS pixels except when:","target-size-enhanced",0],["2.5.6","Concurrent Input Mechanisms","AAA","Web content does not restrict use of input modalities available on a platform except where the restriction is essential, required to ensure the security of the content, or required to respect user settings.","concurrent-input-mechanisms",0],["2.5.7","Dragging Movements","AA","All functionality that uses a dragging movement for operation can be achieved by a single pointer without dragging, unless dragging is essential or the functionality is determined by the user agent and not modified by the author.","dragging-movements",1],["2.5.8","Target Size (Minimum)","AA","The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when:","target-size-minimum",1],["3.1.1","Language of Page","A","The default human language of each web page can be programmatically determined.","language-of-page",0],["3.1.2","Language of Parts","AA","The human language of each passage or phrase in the content can be programmatically determined except for proper names, technical terms, words of indeterminate language, and words or phrases that have become part of the vernacular of the immediately surrounding text.","language-of-parts",0],["3.1.3","Unusual Words","AAA","A mechanism is available for identifying specific definitions of words or phrases used in an unusual or restricted way, including idioms and jargon.","unusual-words",0],["3.1.4","Abbreviations","AAA","A mechanism for identifying the expanded form or meaning of abbreviations is available.","abbreviations",0],["3.1.5","Reading Level","AAA","When text requires reading ability more advanced than the lower secondary education level after removal of proper names and titles, supplemental content, or a version that does not require reading ability more advanced than the lower secondary education level, is available.","reading-level",0],["3.1.6","Pronunciation","AAA","A mechanism is available for identifying specific pronunciation of words where meaning of the words, in context, is ambiguous without knowing the pronunciation.","pronunciation",0],["3.2.1","On Focus","A","When any user interface component receives focus, it does not initiate a change of context.","on-focus",0],["3.2.2","On Input","A","Changing the setting of any user interface component does not automatically cause a change of context unless the user has been advised of the behavior before using the component.","on-input",0],["3.2.3","Consistent Navigation","AA","Navigational mechanisms that are repeated on multiple web pages within a set of web pages occur in the same relative order each time they are repeated, unless a change is initiated by the user.","consistent-navigation",0],["3.2.4","Consistent Identification","AA","Components that have the same functionality within a set of web pages are identified consistently.","consistent-identification",0],["3.2.5","Change on Request","AAA","Changes of context are initiated only by user request or a mechanism is available to turn off such changes.","change-on-request",0],["3.2.6","Consistent Help","A","If a web page contains any of the following help mechanisms, and those mechanisms are repeated on multiple web pages within a set of web pages, they occur in the same order relative to other page content, unless a change is initiated by the user:","consistent-help",1],["3.3.1","Error Identification","A","If an input error is automatically detected, the item that is in error is identified and the error is described to the user in text.","error-identification",0],["3.3.2","Labels or Instructions","A","Labels or instructions are provided when content requires user input.","labels-or-instructions",0],["3.3.3","Error Suggestion","AA","If an input error is automatically detected and suggestions for correction are known, then the suggestions are provided to the user, unless it would jeopardize the security or purpose of the content.","error-suggestion",0],["3.3.4","Error Prevention (Legal, Financial, Data)","AA","For web pages that cause legal commitments or financial transactions for the user to occur, that modify or delete user-controllable data in data storage systems, or that submit user test responses, at least one of the following is true:","error-prevention-legal-financial-data",0],["3.3.5","Help","AAA","Context-sensitive help is available.","help",0],["3.3.6","Error Prevention (All)","AAA","For web pages that require the user to submit information, at least one of the following is true:","error-prevention-all",0],["3.3.7","Redundant Entry","A","Information previously entered by or provided to the user that is required to be entered again in the same process is either:","redundant-entry",1],["3.3.8","Accessible Authentication (Minimum)","AA","A cognitive function test (such as remembering a password or solving a puzzle) is not required for any step in an authentication process unless that step provides at least one of the following:","accessible-authentication-minimum",1],["3.3.9","Accessible Authentication (Enhanced)","AAA","A cognitive function test (such as remembering a password or solving a puzzle) is not required for any step in an authentication process unless that step provides at least one of the following:","accessible-authentication-enhanced",1],["4.1.2","Name, Role, Value","A","For all user interface components (including but not limited to: form elements, links and components generated by scripts), the name and role can be programmatically determined; states, properties, and values that can be set by the user can be programmatically set; and notification of changes to these items is available to user agents, including assistive technologies.","name-role-value",0],["4.1.3","Status Messages","AA","In content implemented using markup languages, status messages can be programmatically determined through role or properties such that they can be presented to the user by assistive technologies without receiving focus.","status-messages",0]];

// ---------- accessibility helpers: roles, focus, accessible name ----------
const BLOCK = new Set('address article aside blockquote br dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol p pre section summary table td th tr ul'.split(' '));
const isNamed = (n) => !!((n.attrs['aria-label'] || '').trim() || (n.attrs['aria-labelledby'] || '').trim());
function implicitRole(n) {
  const a = n.attrs, t = n.tag, type = (a.type || 'text').toLowerCase();
  const scoped = (r) => (hasAnc(n, (p) => ['article', 'aside', 'main', 'nav', 'section'].includes(p.tag)) ? 'generic' : r);
  switch (t) {
    case 'a': return 'href' in a ? 'link' : 'generic'; case 'area': return 'href' in a ? 'link' : 'generic';
    case 'article': return 'article'; case 'aside': return 'complementary'; case 'button': return 'button'; case 'datalist': return 'listbox';
    case 'details': return 'group'; case 'dialog': return 'dialog'; case 'fieldset': return 'group'; case 'figure': return 'figure';
    case 'footer': return scoped('contentinfo'); case 'header': return scoped('banner');
    case 'form': return isNamed(n) || a.title ? 'form' : 'generic';
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
    case 'hr': return 'separator'; case 'img': return a.alt === '' ? 'presentation' : 'img';
    case 'input':
      if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
      if (type === 'checkbox') return 'checkbox'; if (type === 'radio') return 'radio'; if (type === 'range') return 'slider'; if (type === 'number') return 'spinbutton';
      if (type === 'search') return 'list' in a ? 'combobox' : 'searchbox'; if (type === 'hidden') return null;
      if (['file', 'color', 'date', 'datetime-local', 'month', 'time', 'week', 'password'].includes(type)) return null;
      return 'list' in a ? 'combobox' : 'textbox';
    case 'li': return 'listitem'; case 'main': return 'main'; case 'menu': case 'ol': case 'ul': return 'list'; case 'meter': return 'meter'; case 'nav': return 'navigation';
    case 'option': return 'option'; case 'output': return 'status'; case 'progress': return 'progressbar'; case 'search': return 'search';
    case 'section': return isNamed(n) ? 'region' : 'generic';
    case 'select': return 'multiple' in a || Number(a.size) > 1 ? 'listbox' : 'combobox';
    case 'table': return 'table'; case 'tbody': case 'thead': case 'tfoot': return 'rowgroup'; case 'td': return 'cell';
    case 'th': return (a.scope || '').toLowerCase() === 'row' ? 'rowheader' : 'columnheader'; case 'tr': return 'row'; case 'textarea': return 'textbox';
    case 'dt': return 'term'; case 'dd': return 'definition'; case 'p': return 'paragraph'; case 'html': return 'document';
    case 'div': case 'span': case 'body': return 'generic';
    default: return null;
  }
}
const roleOf = (n) => {
  for (const tk of (n.attrs.role || '').toLowerCase().split(/\s+/).filter(Boolean)) if (ARIA_ROLES[tk] && !ARIA_ROLES[tk][0]) return { role: tk, explicit: true };
  return { role: implicitRole(n), explicit: false };
};
const FOCUSABLE_NATIVE = (n) => {
  const a = n.attrs, t = n.tag;
  if (t === 'a' || t === 'area') return 'href' in a;
  if (t === 'input') return (a.type || '').toLowerCase() !== 'hidden';
  if (['button', 'select', 'textarea', 'iframe'].includes(t)) return true;
  if ((t === 'audio' || t === 'video') && 'controls' in a) return true;
  if (t === 'summary') return !!n.parent && n.parent.tag === 'details' && n.parent.kids.find((k) => k.tag === 'summary') === n;
  if ('contenteditable' in a && a.contenteditable !== 'false') return true;
  return false;
};
const tabIdx = (n) => { const v = n.attrs.tabindex; if (v === undefined) return null; const x = parseInt(v, 10); return Number.isNaN(x) ? null : x; };
const isDisabled = (n) => ('disabled' in n.attrs && ['button', 'input', 'select', 'textarea', 'fieldset', 'optgroup', 'option'].includes(n.tag)) || hasAnc(n, (p) => p.tag === 'fieldset' && 'disabled' in p.attrs && n.tag !== 'legend') || 'inert' in n.attrs || hasAnc(n, (p) => 'inert' in p.attrs);
const canFocus = (n) => !isDisabled(n) && (FOCUSABLE_NATIVE(n) || tabIdx(n) !== null);
const isFocusable = (n) => !isHidden(n) && canFocus(n);

function ctxOf(root) { const labels = all(root).filter((n) => n.tag === 'label'); return { root, ids: byId(root), labels }; }
const labelsFor = (n, c) => {
  const out = []; const id = n.attrs.id;
  for (const l of c.labels) if ((id && l.attrs.for === id) || (!('for' in l.attrs) && hasAnc(n, (p) => p === l))) out.push(l);
  return out;
};
function nameOf(n, c, st) {
  if (st.seen.has(n)) return { s: '', src: '' };
  st.seen.add(n);
  const a = n.attrs, r = roleOf(n).role;
  if (n.tag === '#text') return { s: n.text, src: 'text' };
  if (!st.top && !st.ref && isHiddenSelf(n)) return { s: '', src: '' };
  if (!st.ref && (a['aria-labelledby'] || '').trim()) {
    const ts = a['aria-labelledby'].trim().split(/\s+/).map((i) => c.ids.get(i)).filter(Boolean);
    if (ts.length) { const s = ts.map((x) => nameOf(x, c, { ...st, ref: true, top: false, content: true }).s).join(' '); if (norm(s)) return { s, src: 'aria-labelledby' }; }
  }
  if ((a['aria-label'] || '').trim() && !(st.embedded && ['textbox', 'combobox', 'listbox', 'slider', 'spinbutton'].includes(r))) return { s: a['aria-label'], src: 'aria-label' };
  if (st.embedded && !st.top) { // embedded control inside a label
    if (n.tag === 'input' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'image'].includes((a.type || 'text').toLowerCase())) return { s: a.value || '', src: 'value' };
    if (n.tag === 'select') { const o = all(n).filter((x) => x.tag === 'option'); const sel = o.find((x) => 'selected' in x.attrs) || o[0]; return { s: sel ? norm(textOf(sel)) : '', src: 'selected option' }; }
  }
  const t = n.tag, type = (a.type || 'text').toLowerCase();
  if (t === 'img' || t === 'area') { if ('alt' in a) { if (norm(a.alt)) return { s: a.alt, src: 'alt' }; if (a.alt === '' && !st.top) return { s: '', src: '' }; return { s: '', src: 'empty alt' }; } }
  if (t === 'input' && type === 'image') { const s = a.alt || a.value || 'Submit'; return { s, src: a.alt ? 'alt' : 'value' }; }
  if (t === 'input' && ['button', 'submit', 'reset'].includes(type)) { const s = a.value || { submit: 'Submit', reset: 'Reset', button: '' }[type]; if (norm(s)) return { s, src: a.value ? 'value' : 'default label' }; }
  if (['input', 'select', 'textarea', 'meter', 'progress', 'output'].includes(t) && type !== 'hidden') {
    const ls = labelsFor(n, c);
    if (ls.length) { const s = ls.map((l) => nameOf(l, c, { seen: st.seen, ref: true, top: false, content: true, embedded: true }).s).join(' '); if (norm(s)) return { s, src: '<label>' }; }
  }
  if (t === 'fieldset') { const lg = n.kids.find((k) => k.tag === 'legend'); if (lg && norm(textOf(lg))) return { s: textOf(lg), src: '<legend>' }; }
  if (t === 'table') { const cp = n.kids.find((k) => k.tag === 'caption'); if (cp && norm(textOf(cp))) return { s: textOf(cp), src: '<caption>' }; }
  if (t === 'figure') { const cp = n.kids.find((k) => k.tag === 'figcaption'); if (cp && norm(textOf(cp))) return { s: textOf(cp), src: '<figcaption>' }; }
  if (t === 'svg') { const ti = n.kids.find((k) => k.tag === 'title'); if (ti && norm(textOf(ti))) return { s: textOf(ti), src: '<title>' }; }
  const fromContent = st.content || (st.top && r && NAME_FROM_CONTENT.has(r)) || (st.top && (t === 'a' || t === 'button') && !r);
  if (fromContent && !['input', 'select', 'textarea'].includes(t)) {
    let s = '';
    for (const k of n.kids) { if (k.tag === '#text') { if (!k.raw) s += k.text; continue; } const b = BLOCK.has(k.tag); const v = nameOf(k, c, { ...st, top: false, content: true }).s; s += b ? ' ' + v + ' ' : v; }
    if (norm(s)) return { s, src: 'content' };
  }
  if ((a.placeholder || '').trim() && (t === 'input' || t === 'textarea') && !st.embedded) { if ((a.title || '').trim() === '') return { s: a.placeholder, src: 'placeholder (weak)' }; }
  if ((a.title || '').trim()) return { s: a.title, src: 'title (weak)' };
  return { s: '', src: '' };
}
function isHiddenSelf(n) { const a = n.attrs; return 'hidden' in a || a['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(a.style || '') || (n.tag === 'input' && (a.type || '').toLowerCase() === 'hidden') || ['script', 'style', 'template'].includes(n.tag); }
const accNameOf = (n, c) => { const r = nameOf(n, c, { seen: new Set(), ref: false, top: true, content: false, embedded: false }); return { name: norm(r.s), src: r.src }; };

// ---------- alt text quality ----------
const GENERIC_ALT = /^(image|img|photo|picture|pic|graphic|icon|logo|banner|spacer|placeholder|untitled|thumbnail|screenshot|figure|alt|image\d*|photo\d*)$/i;
T.push({
  id: 'alt-text-quality-checker', cat: 'Accessibility', title: 'Alt Text Quality Checker: Filenames, Redundant Words and Missing Alt',
  desc: 'Paste HTML and review every image alt text: missing alt, filenames, generic words, "image of" openers, very long text, and linked images with no name.',
  labels: ['HTML'], sample: '<img src="a.jpg">\n<img src="IMG_0012.png" alt="IMG_0012.png">\n<img src="b.jpg" alt="image">\n<img src="c.jpg" alt="Photo of a woman holding a red umbrella">\n<a href="/home"><img src="logo.svg" alt=""></a>\n<img src="d.jpg" alt="Bar chart of 2024 sales: Q1 12, Q2 15, Q3 11, Q4 20, the strongest quarter is Q4 and the weakest is Q3 when sales fell sharply after the summer campaign ended">\n<img src="sep.png" alt="" role="presentation">\n<img src="e.jpg" alt="Our team at the 2024 summit">',
  opts: [{ id: 'max', label: 'Flag alt text longer than this many characters', type: 'number', def: 125 }],
  run([s], o) {
    need(s); const root = parseHTML(s), c = ctxOf(root), f = []; let n = 0, ok = 0; const max = Number(o.max) || 125;
    for (const e of all(root)) {
      const isImg = e.tag === 'img' || (e.tag === 'input' && (e.attrs.type || '').toLowerCase() === 'image') || e.tag === 'area';
      if (!isImg || isHiddenSelf(e)) continue; n++;
      const a = e.attrs, alt = a.alt, W = where(root, e), src = a.src || '';
      const link = (() => { let p = e.parent; while (p && p.tag !== '#root' && !(p.tag === 'a' && 'href' in p.attrs)) p = p.parent; return p && p.tag === 'a' ? p : null; })();
      const issues = [];
      if (alt === undefined) issues.push(['ERROR', 'no alt attribute (screen readers may read the file name). Use alt="" if the image is decorative']);
      else if (alt === '') {
        if (link && !accNameOf(link, c).name) issues.push(['ERROR', 'empty alt inside a link that has no other text: the link has no name']);
      } else {
        const t = alt.trim(), base = src.split(/[?#]/)[0].split('/').pop();
        if (/\.(jpe?g|png|gif|webp|svg|avif|bmp)$/i.test(t) || (base && t.toLowerCase() === base.toLowerCase())) issues.push(['REVIEW', 'alt looks like a file name']);
        else if (/^(img|dsc|dscn|pxl|image|photo|screenshot|screen shot|untitled)[-_ ]?\d{2,}/i.test(t) || /^\d{6,}$/.test(t) || /^[\w-]+_[\w-]+_[\w-]+$/.test(t) && !/\s/.test(t)) issues.push(['REVIEW', 'alt looks like a camera or system name']);
        if (GENERIC_ALT.test(t)) issues.push(['REVIEW', `alt "${t}" says nothing about this image`]);
        if (/^(image|picture|photo|photograph|graphic|icon|screenshot) (of|showing)\b/i.test(t)) issues.push(['REVIEW', 'starts with "image of" / "photo of": screen readers already announce an image']);
        if (t.length > max) issues.push(['REVIEW', `alt is ${t.length} characters: put long descriptions in the page text or a figcaption and keep alt short`]);
        if (/^\s|\s$|\s{2,}/.test(alt)) issues.push(['REVIEW', 'extra spaces in alt']);
        const fig = e.parent && e.parent.tag === 'figure' ? e.parent.kids.find((k) => k.tag === 'figcaption') : null;
        if (fig && norm(textOf(fig)).toLowerCase() === t.toLowerCase()) issues.push(['REVIEW', 'alt repeats the figcaption: use alt="" or describe what the caption does not']);
        if (link && norm(textOf(link)) && norm(textOf(link)).toLowerCase() === t.toLowerCase()) issues.push(['REVIEW', 'alt repeats the text of the link next to it']);
      }
      if (issues.length) issues.forEach(([lv, m]) => f.push(`[${lv}] ${m}\n        ${W}`)); else ok++;
    }
    if (!n) throw new Error('No <img>, <area> or image inputs found.');
    return `${n} image${n === 1 ? '' : 's'}: ${ok} without findings, ${n - ok} with findings.\n\n${f.join('\n') || 'Nothing flagged.'}\n\nThese are pattern checks. A tool cannot tell whether alt text is accurate: the right alt depends on what the image is for in context (WCAG 1.1.1). Empty alt is correct for purely decorative images. The length limit is a common rule of thumb, not a WCAG requirement.`;
  },
});

// ---------- form label checker ----------
T.push({
  id: 'form-label-checker', cat: 'Accessibility', title: 'Form Label Checker: Inputs Without an Accessible Name',
  desc: 'Paste HTML and find inputs, selects and textareas with no label, aria-label or aria-labelledby, placeholder-only fields, broken label for links and radio groups without a legend.',
  labels: ['HTML'], sample: '<form>\n<label for="email">Email</label><input id="email" type="email">\n<input type="text" name="q" placeholder="Search">\n<input type="text" name="nolabel">\n<label for="ghost">Phone</label><input id="phone" type="tel">\n<label>City <input name="city"></label>\n<input aria-labelledby="missing-id">\n<select id="c"><option>One</option></select>\n<input type="radio" name="r" id="r1"><label for="r1">Yes</label><input type="radio" name="r" id="r2"><label for="r2">No</label>\n<input type="hidden" name="t"><input type="submit"><button></button>\n</form>',
  run([s]) {
    need(s); const root = parseHTML(s), c = ctxOf(root), f = [], dup = new Map(); let n = 0;
    for (const e of all(root)) if (e.attrs.id) dup.set(e.attrs.id, (dup.get(e.attrs.id) || 0) + 1);
    const radios = new Map();
    for (const e of all(root)) {
      const a = e.attrs, t = (a.type || 'text').toLowerCase();
      if (e.tag === 'label' && a.for && !c.ids.has(a.for)) f.push(`[ERROR] <label for="${a.for}"> points to an id that does not exist\n        ${where(root, e)}`);
      if (e.tag === 'label' && a.for && c.ids.has(a.for) && !['input', 'select', 'textarea', 'button', 'meter', 'output', 'progress'].includes(c.ids.get(a.for).tag)) f.push(`[ERROR] <label for="${a.for}"> points to a ${c.ids.get(a.for).tag}, which cannot be labelled\n        ${where(root, e)}`);
      const isCtl = ['select', 'textarea'].includes(e.tag) || (e.tag === 'input' && !['hidden', 'submit', 'reset', 'button', 'image'].includes(t)) || (e.tag === 'button') || (e.tag === 'input' && ['submit', 'reset', 'button', 'image'].includes(t));
      if (!isCtl || isHidden(e)) continue; n++;
      const r = accNameOf(e, c), W = where(root, e);
      if (a.id && dup.get(a.id) > 1) f.push(`[ERROR] duplicate id "${a.id}": label for= will point to the first one only\n        ${W}`);
      for (const ref of (a['aria-labelledby'] || '').split(/\s+/).filter(Boolean)) if (!c.ids.has(ref)) f.push(`[ERROR] aria-labelledby references missing id "${ref}"\n        ${W}`);
      if (!r.name) f.push(`[ERROR] no accessible name (${e.tag === 'button' || ['submit', 'reset', 'button', 'image'].includes(t) ? 'button text, value or aria-label' : 'label, aria-label or aria-labelledby'} needed)\n        ${W}`);
      else if (/weak/.test(r.src)) f.push(`[REVIEW] name comes only from ${r.src.replace(' (weak)', '')}: it disappears or is not shown to everyone. Add a visible <label>\n        ${W}`);
      if (t === 'radio' || t === 'checkbox') { const k = (a.name || '') + '|' + t; (radios.get(k) || radios.set(k, []).get(k)).push(e); }
    }
    for (const [k, list] of radios) {
      if (list.length < 2) continue;
      const g = list[0]; if (!hasAnc(g, (p) => p.tag === 'fieldset' || ['group', 'radiogroup'].includes((p.attrs.role || '').toLowerCase()))) f.push(`[REVIEW] ${list.length} ${k.split('|')[1]} inputs named "${k.split('|')[0]}" are not in a fieldset with a legend (or role="group" with a name). A group question needs a group label\n        ${where(root, g)}`);
    }
    if (!n) throw new Error('No form controls found.');
    return `${n} form control${n === 1 ? '' : 's'} checked, ${f.length} finding${f.length === 1 ? '' : 's'}.\n\n${f.join('\n') || 'Every control has an accessible name.'}\n\nCovers WCAG 1.3.1, 3.3.2 and 4.1.2 patterns. Names are computed with a simplified version of the accessible name rules. A name existing does not mean it is a good one: read it in context.`;
  },
});

// ---------- ARIA validator ----------
const roleChain = (r) => { const seen = new Set(), sup = new Set(), req = new Set(); const rec = (k) => { if (seen.has(k) || !ARIA_ROLES[k]) return; seen.add(k); const d = ARIA_ROLES[k]; d[3].forEach((x) => sup.add(x)); d[2].forEach((x) => { req.add(x); sup.add(x); }); d[1].forEach(rec); }; rec(r); return { sup, req }; };
const ARIA13 = new Set(['aria-description', 'aria-braillelabel', 'aria-brailleroledescription', 'aria-colindextext', 'aria-rowindextext']);
const NATIVE_REQ_OK = { checkbox: 'input', radio: 'input', slider: 'input', spinbutton: 'input', textbox: 'input', combobox: 'select', option: 'option' };
T.push({
  id: 'aria-attribute-validator', cat: 'Accessibility', title: 'ARIA Validator: Roles, States, Properties and Required Attributes',
  desc: 'Check pasted HTML against WAI-ARIA 1.2: unknown roles, abstract roles, bad attribute values, attributes a role does not support, missing required attributes, broken ID references and aria-hidden on focusable elements.',
  labels: ['HTML'], sample: '<div role="buton" tabindex="0">Save</div>\n<div role="checkbox" tabindex="0">Agree</div>\n<div role="heading">Title</div>\n<span aria-labell="x">hi</span>\n<button aria-pressed="yes" aria-expanded="true">Menu</button>\n<div aria-label="Panel">text</div>\n<ul role="tablist"><li role="tab" aria-selected="true">One</li></ul>\n<input aria-describedby="nope" aria-required="true">\n<a href="/x" aria-hidden="true">Hidden link</a>\n<div role="range">x</div>\n<button role="button">Redundant</button>\n<li role="option">Orphan option</li>',
  run([s]) {
    need(s); const root = parseHTML(s), ids = byId(root), f = []; let checked = 0;
    const add = (lv, n, m) => f.push(`[${lv}] ${m}\n        ${where(root, n)}`);
    for (const n of all(root)) {
      const a = n.attrs, keys = Object.keys(a), aria = keys.filter((k) => k.startsWith('aria-')), has = 'role' in a;
      if (!has && !aria.length) continue; checked++;
      let role = null, explicit = false;
      if (has) {
        const toks = a.role.toLowerCase().split(/\s+/).filter(Boolean);
        if (!toks.length) add('ERROR', n, 'empty role attribute');
        for (const tk of toks) {
          if (/^(doc|graphics)-/.test(tk)) { add('INFO', n, `role "${tk}" belongs to the DPUB-ARIA / Graphics ARIA modules, which this tool does not check`); role = role || 'generic'; explicit = true; break; }
          const d = ARIA_ROLES[tk];
          if (!d) { add('ERROR', n, `"${tk}" is not a WAI-ARIA 1.2 role${toks.length > 1 ? ' (the browser uses the first role it knows)' : ''}`); continue; }
          if (d[0]) { add('ERROR', n, `"${tk}" is an abstract role and must not be used in content`); continue; }
          role = tk; explicit = true; break;
        }
        const imp = implicitRole(n);
        if (explicit && role === imp && role !== 'generic') add('INFO', n, `role="${role}" is already the default role of <${n.tag}>: remove it`);
        if (explicit && (role === 'presentation' || role === 'none') && isFocusable(n)) add('ERROR', n, 'role presentation/none on a focusable element is ignored by browsers: focusable elements keep their semantics');
      }
      if (!role) role = implicitRole(n) || 'generic';
      const { sup, req } = roleChain(role), d = ARIA_ROLES[role];
      for (const k of aria) {
        const v = a[k];
        if (ARIA13.has(k)) { add('INFO', n, `${k} is from the ARIA 1.3 draft, not ARIA 1.2: support varies`); continue; }
        const def = ARIA_ATTRS[k];
        if (!def) { add('ERROR', n, `"${k}" is not a WAI-ARIA 1.2 attribute`); continue; }
        if (k === 'aria-grabbed' || k === 'aria-dropeffect') add('REVIEW', n, `${k} is deprecated in ARIA 1.1 and later`);
        const [type, toks] = def, val = v.trim();
        const bad = (m) => add('ERROR', n, `${k}="${v}": ${m}`);
        if (type === 'true/false' && !/^(true|false)$/.test(val)) bad('must be true or false');
        else if (type === 'true/false/undefined' && !/^(true|false|undefined)$/.test(val)) bad('must be true, false or undefined');
        else if (type === 'tristate' && !/^(true|false|mixed|undefined)$/.test(val)) bad('must be true, false, mixed or undefined');
        else if (type === 'token' && !toks.includes(val)) bad('must be one of: ' + toks.join(', '));
        else if (type === 'token list' && !val.split(/\s+/).every((x) => toks.includes(x))) bad('values must be from: ' + toks.join(', '));
        else if (type === 'integer' && !/^-?\d+$/.test(val)) bad('must be an integer');
        else if (type === 'number' && !/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(val)) bad('must be a number');
        else if (type === 'ID reference' && !ids.has(val)) bad(`no element has id "${val}"`);
        else if (type === 'ID reference list') for (const i of val.split(/\s+/).filter(Boolean)) if (!ids.has(i)) bad(`no element has id "${i}"`);
        if (k === 'aria-hidden') { if (val === 'true' && (canFocus(n) || all(n).some(canFocus))) add('ERROR', n, 'aria-hidden="true" on or around a focusable element: keyboard users can still reach it but screen readers will not announce it (WCAG 4.1.2)'); }
        else if (d && d[7].includes(k)) add(role === 'generic' ? 'REVIEW' : 'ERROR', n, role === 'generic' ? `${k} on <${n.tag}> with no role: naming is not supported on generic elements, so it may be ignored. Add a role or use a semantic element` : `${k} is prohibited on role ${role}`);
        else if (!sup.has(k)) add('ERROR', n, `${k} is not supported on role ${role}${explicit ? '' : ' (default role of <' + n.tag + '>)'}`);
      }
      if (explicit) {
        const native = NATIVE_REQ_OK[role] === n.tag;
        if (!native) for (const r of req) if (!(r in a)) add('ERROR', n, `role ${role} requires ${r}`);
        if (d && d[5].length && !d[5].some((sc) => { for (let p = n.parent; p && p.tag !== '#root'; p = p.parent) if (roleOf(p).role === sc) return true; return false; }) && !('aria-owns' in a)) add('REVIEW', n, `role ${role} should sit inside ${d[5].join(' or ')}`);
        if (d && d[6].length && !all(n).some((x) => d[6].includes(roleOf(x).role)) && n.kids.length && !all(n).some((x) => 'aria-owns' in x.attrs) && !('aria-owns' in a)) add('REVIEW', n, `role ${role} should contain ${d[6].join(' or ')}`);
      }
    }
    const err = f.filter((x) => x.startsWith('[ERROR]')).length;
    if (!checked) throw new Error('No role or aria-* attributes found in this HTML.');
    return `${checked} element${checked === 1 ? '' : 's'} with ARIA checked: ${err} error${err === 1 ? '' : 's'}, ${f.length - err} other note${f.length - err === 1 ? '' : 's'}.\n\n${f.join('\n') || 'No problems found.'}\n\nChecked against the WAI-ARIA 1.2 Recommendation (6 June 2023): role names, abstract roles, attribute names and value types, supported and required attributes per role (including inherited ones), prohibited naming, and ID references. Not checked: which HTML elements may carry which role (ARIA in HTML), live updates made by scripts, and the DPUB and Graphics ARIA roles. "Review" items are structural hints that scripts can legitimately satisfy later. The first rule of ARIA still holds: a native element beats a role.`;
  },
});

// ---------- landmarks ----------
const LAND = new Set(['banner', 'complementary', 'contentinfo', 'form', 'main', 'navigation', 'region', 'search']);
function landOf(n) {
  const r = roleOf(n); if (!r.role || !LAND.has(r.role)) return null;
  if (r.explicit && n.tag === 'header' && hasAnc(n, (p) => ['article', 'aside', 'main', 'nav', 'section'].includes(p.tag))) return r.role;
  return r.role;
}
T.push({
  id: 'landmark-region-outline', cat: 'Accessibility', title: 'Landmark Region Outline: banner, nav, main and footer Map',
  desc: 'Paste HTML and see its landmark regions as a nested outline with accessible names, plus warnings for a missing or duplicate main, unnamed repeated navs and content outside landmarks.',
  labels: ['HTML'], sample: '<body><a href="#m">Skip</a>\n<header><nav aria-label="Primary"><a href="/">Home</a></nav></header>\n<div>Loose text outside any landmark</div>\n<main id="m"><section aria-labelledby="h"><h2 id="h">News</h2></section><aside>Related</aside></main>\n<nav><a href="/a">A</a></nav><nav><a href="/b">B</a></nav>\n<footer>Contact</footer></body>',
  run([s]) {
    need(s); const root = parseHTML(s), c = ctxOf(root), out = [], warn = [], count = {};
    const rec = (node, depth) => {
      for (const k of node.kids) {
        if (k.tag === '#text') continue;
        const lm = isHiddenSelf(k) ? null : landOf(k); let d = depth;
        if (lm) { const nm = accNameOf(k, c).name; count[lm] = (count[lm] || 0) + 1; (count[lm + '|named'] ||= []).push(nm); out.push(`${'  '.repeat(depth)}${lm}${nm ? ' "' + clip(nm, 50) + '"' : ''}  <${k.tag}${k.attrs.role ? ' role=' + k.attrs.role : ''}> line ${lineOf(root, k)}`); d = depth + 1; }
        if (!isHiddenSelf(k)) rec(k, d);
      }
    };
    rec(root, 0);
    if (!out.length) return 'No landmark regions found. Add <header>, <nav>, <main> and <footer> (or role attributes) so screen reader users can jump between page areas.';
    if (!count.main) warn.push('No main landmark: add one <main> that holds the page\'s own content.');
    if (count.main > 1) warn.push(`${count.main} main landmarks: use one (hidden extra <main> elements are allowed only with the hidden attribute).`);
    for (const r of ['banner', 'contentinfo']) if (count[r] > 1) warn.push(`${count[r]} ${r} landmarks: use one at page level.`);
    for (const r of ['navigation', 'complementary', 'region', 'search', 'form']) { const names = count[r + '|named'] || []; if (names.length > 1) { const un = names.filter((x) => !x).length, dup = names.length - new Set(names).size; if (un) warn.push(`${names.length} ${r} landmarks, ${un} without a name: give each a distinct aria-label so users can tell them apart.`); else if (dup) warn.push(`Two ${r} landmarks share the same name.`); } }
    // text outside landmarks
    const outside = [];
    for (const n of all(root)) {
      if (['script', 'style', 'head', 'title', 'meta', 'link', 'noscript', 'template'].includes(n.tag) || isHidden(n) || hasAnc(n, (p) => !!landOf(p) || p.tag === 'head') || landOf(n)) continue;
      if (n.kids.some((k) => k.tag === '#text' && k.text.trim()) && !(n.tag === 'a' && /^#/.test(n.attrs.href || '') && /skip/i.test(textOf(n)))) outside.push(n);
    }
    if (outside.length) warn.push(`${outside.length} element${outside.length > 1 ? 's' : ''} with text outside any landmark, for example ${where(root, outside[0])}. Skip links are fine; other content should sit inside a landmark.`);
    return `${out.join('\n')}\n\n${warn.length ? 'REVIEW\n' + warn.map((x) => '- ' + x).join('\n') : 'No landmark problems found.'}\n\nRules used: <header> and <footer> are banner and contentinfo only when they are not inside article, aside, main, nav or section; <section> and <form> are landmarks only when they have an accessible name; <aside> is complementary. Names are computed in simplified form.`;
  },
});

// ---------- link purpose ----------
const GENERIC_LINK = /^(click here|here|read more|more|learn more|more info|more information|details|link|this|this link|continue|go|click|download|view|see more|see all|read on|info|>>?|»|\.\.\.|…|next|previous|back|submit)$/i;
T.push({
  id: 'link-purpose-checker', cat: 'Accessibility', title: 'Link Purpose Checker: Vague, Duplicate and New-Window Links',
  desc: 'Paste HTML and find links with no name, vague text such as "click here", raw URLs as text, the same text pointing to different pages, and links that open a new window without saying so.',
  labels: ['HTML'], sample: '<p>For prices <a href="/pricing">click here</a>. <a href="/a">Read more</a> and <a href="/b">Read more</a>.</p>\n<a href="https://example.com/very/long/address">https://example.com/very/long/address</a>\n<a href="/empty"><img src="i.svg" alt=""></a>\n<a href="/docs" target="_blank">Documentation</a>\n<a href="/guide.pdf">Annual report</a>\n<a href="/ok" target="_blank">Style guide (opens in a new tab)</a>\n<li><a href="/c">Details</a> of the Spring Sale</li>',
  run([s]) {
    need(s); const root = parseHTML(s), c = ctxOf(root), f = [], byName = new Map(); let n = 0;
    for (const e of all(root)) {
      if (e.tag !== 'a' || !('href' in e.attrs) || isHidden(e)) continue; n++;
      const nm = accNameOf(e, c).name, h = e.attrs.href, W = where(root, e);
      if (!nm) { f.push(`[ERROR] link has no accessible name\n        ${W}`); continue; }
      const key = nm.toLowerCase(); (byName.get(key) || byName.set(key, new Set()).get(key)).add(h);
      if (GENERIC_LINK.test(nm)) { const ctx = e.parent && e.parent.tag !== 'body' && norm(textOf(e.parent)).length > nm.length + 8; f.push(`[REVIEW] vague link text "${nm}"${ctx ? ' (surrounding text may give context, but a link list or screen reader link menu shows it alone)' : ''}\n        ${W}`); }
      else if (/^(https?:\/\/|www\.)\S+$/i.test(nm) && nm.length > 30) f.push(`[REVIEW] a long URL as link text is read out character by character; use words that say where it goes\n        ${W}`);
      if ((e.attrs.target || '').toLowerCase() === '_blank' && !/new (window|tab)|external|opens/i.test(nm + ' ' + (e.attrs['aria-label'] || '') + ' ' + (e.attrs.title || ''))) f.push(`[REVIEW] opens a new window or tab without saying so\n        ${W}`);
      if (/\.(pdf|docx?|xlsx?|pptx?|zip|csv)(\?|#|$)/i.test(h) && !/pdf|doc|xls|ppt|zip|csv|download|file/i.test(nm)) f.push(`[REVIEW] links to a ${(h.match(/\.(\w+)(\?|#|$)/) || [])[1].toUpperCase()} file; say the format (and size) in the link text\n        ${W}`);
    }
    for (const [k, set] of byName) if (set.size > 1) f.push(`[REVIEW] "${k}" is used for ${set.size} different destinations: ${[...set].slice(0, 4).join(', ')}`);
    if (!n) throw new Error('No links with an href found.');
    return `${n} link${n === 1 ? '' : 's'} checked, ${f.length} finding${f.length === 1 ? '' : 's'}.\n\n${f.join('\n') || 'No problems found.'}\n\nWCAG 2.4.4 (Link Purpose in Context, A) lets the purpose come from the sentence, list item, table cell or heading around the link; 2.4.9 (AAA) wants it from the link text alone. So "vague" is a review item, not an automatic fail. New-window advice is a best practice (technique G201), not a requirement.`;
  },
});

// ---------- accessible name calculator ----------
T.push({
  id: 'accessible-name-calculator', cat: 'Accessibility', title: 'Accessible Name and Role Calculator for HTML Elements',
  desc: 'Paste HTML and see the role and accessible name that assistive technology gets for each element, with the source of the name (label, aria-label, alt, content, title). Pick one element with a CSS selector.',
  labels: ['HTML'], sample: '<label for="e">Email address</label><input id="e" type="email" placeholder="you@example.com">\n<button aria-label="Close dialog"><svg><title>x</title></svg></button>\n<a href="/p"><img src="p.png" alt="Pricing"> plans</a>\n<button><span class="icon"></span></button>\n<input type="search" title="Search the site">\n<div role="button" tabindex="0" aria-labelledby="t1 t2"></div><span id="t1">Delete</span> <span id="t2">draft</span>',
  opts: [{ id: 'sel', label: 'Only this element (CSS selector, optional)', type: 'text', def: '' }],
  run([s], o) {
    need(s); const root = parseHTML(s), c = ctxOf(root); let els;
    if (String(o.sel || '').trim()) { const sels = compile(o.sel); if (sels.some((x) => x.unsup)) throw new Error('That selector is too complex. Use tags, #id, .class, [attr] and combinators.'); els = all(root).filter((n) => matchesAny(n, sels)); if (!els.length) throw new Error('No element matches ' + o.sel); }
    else els = all(root).filter((n) => { if (isHiddenSelf(n)) return false; const r = roleOf(n); return isFocusable(n) || ['img', 'heading', 'region', 'form', 'navigation', 'main', 'banner', 'contentinfo', 'complementary', 'table', 'group', 'search'].includes(r.role) || (n.tag === 'input'); });
    const rows = [['Line', 'Element', 'Role', 'Accessible name', 'From']];
    for (const n of els) { const r = roleOf(n), a = accNameOf(n, c); rows.push([lineOf(root, n), '<' + n.tag + (n.attrs.id ? '#' + n.attrs.id : '') + '>', (r.role || '(none)') + (r.explicit ? ' (role attr)' : ''), a.name ? '"' + clip(a.name, 60) + '"' : '(none)', a.src || '-']); }
    const d = els.length === 1 ? (() => { const n = els[0], r = (n.attrs['aria-describedby'] || '').split(/\s+/).map((i) => c.ids.get(i)).filter(Boolean).map((x) => norm(textOf(x))).join(' '); return r || n.attrs.title && accNameOf(n, c).src.indexOf('title') < 0 ? '\nDescription: ' + (r || n.attrs.title) : ''; })() : '';
    return `${tbl(rows)}${d}\n\nFollows the accessible name computation of the Accessible Name and Description spec in simplified form: aria-labelledby, then aria-label, then native sources (label, alt, value, legend, caption), then content for roles that take their name from content, then title or placeholder as a last resort. Hidden elements, CSS-generated text and some edge cases are not modelled, so confirm important cases in the browser's accessibility tree.`;
  },
});

// ---------- tab order ----------
T.push({
  id: 'tab-order-checker', cat: 'Accessibility', title: 'Tab Order Checker: Keyboard Focus Sequence and tabindex Problems',
  desc: 'Paste HTML and get the order in which the Tab key visits elements, with positive tabindex values, clickable divs that cannot be reached, and focusable hidden elements flagged.',
  labels: ['HTML'], sample: '<a href="/">Home</a>\n<div onclick="go()">Clickable div</div>\n<button tabindex="2">Second?</button>\n<input aria-label="Name" tabindex="1">\n<div tabindex="0">Focusable div</div>\n<button tabindex="-1">Script only</button>\n<button disabled>Off</button>\n<a href="#" aria-hidden="true">Hidden but focusable</a>\n<span role="button">No tabindex</span>',
  run([s]) {
    need(s); const root = parseHTML(s), c = ctxOf(root), els = all(root), tab = [], skipped = [], f = [];
    els.forEach((n, i) => {
      const ti = tabIdx(n), W = where(root, n);
      const clickable = ('onclick' in n.attrs || ['button', 'link', 'checkbox', 'switch', 'tab', 'menuitem'].includes(roleOf(n).role) && roleOf(n).explicit) && !isFocusable(n) && !isHiddenSelf(n);
      if (clickable) f.push(`[ERROR] ${n.attrs.onclick !== undefined ? 'has a click handler' : 'has role="' + roleOf(n).role + '"'} but cannot be reached with Tab: use a <button>/<a href> or add tabindex="0" and key handlers (WCAG 2.1.1)\n        ${W}`);
      if (!FOCUSABLE_NATIVE(n) && ti === null) return;
      if (isDisabled(n)) { skipped.push([n, 'disabled']); return; }
      if (isHiddenSelf(n) || isHidden(n)) { if (n.attrs['aria-hidden'] === 'true' && !('hidden' in n.attrs) && !/display\s*:\s*none/i.test(n.attrs.style || '')) { f.push(`[ERROR] aria-hidden="true" but still reachable by Tab\n        ${W}`); tab.push({ n, i, ti }); } return; }
      if (ti !== null && ti < 0) { skipped.push([n, 'tabindex=' + ti]); return; }
      if (ti > 0) f.push(`[REVIEW] tabindex="${ti}": positive values jump ahead of the page order and are hard to maintain. Fix the DOM order and use 0 or none\n        ${W}`);
      if (ti !== null && ti >= 0 && !FOCUSABLE_NATIVE(n) && !roleOf(n).explicit) f.push(`[REVIEW] tabindex="${ti}" on a non-interactive <${n.tag}> without a role: keyboard users land here with nothing announced as interactive\n        ${W}`);
      tab.push({ n, i, ti });
    });
    const ordered = [...tab.filter((x) => x.ti > 0).sort((a, b) => a.ti - b.ti || a.i - b.i), ...tab.filter((x) => !(x.ti > 0))];
    const rows = [['#', 'Line', 'Element', 'tabindex', 'Name']];
    ordered.forEach((x, k) => rows.push([k + 1, lineOf(root, x.n), '<' + x.n.tag + '>', x.ti === null ? '-' : x.ti, clip(accNameOf(x.n, c).name || '(no name)', 40)]));
    if (!ordered.length) return 'No keyboard-focusable elements found.' + (f.length ? '\n\n' + f.join('\n') : '');
    return `TAB ORDER (${ordered.length} stops)\n${tbl(rows)}\n\n${skipped.length ? 'NOT IN THE TAB ORDER (' + skipped.length + '): ' + skipped.map(([n, w]) => `<${n.tag}> line ${lineOf(root, n)} (${w})`).join(', ') + '\n\n' : ''}${f.length ? 'FINDINGS\n' + f.join('\n') + '\n\n' : ''}This is the order from the HTML source and tabindex values. It cannot see CSS that reorders things visually (flex order, grid, absolute positioning), which is where WCAG 2.4.3 (Focus Order) problems usually come from: Tab through the real page to check that the focus order matches the visual order.`;
  },
});

// ---------- lang ----------
const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'dv', 'ug']);
function langInfo(tag) {
  if (!/^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?(-([a-z0-9]{5,8}|\d[a-z0-9]{3}))*(-[a-wy-z0-9](-[a-z0-9]{2,8})+)*$/i.test(tag)) return { ok: false };
  let name = null; try { name = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(tag) || null; } catch {}
  return { ok: true, name, known: !!name };
}
T.push({
  id: 'lang-attribute-checker', cat: 'Accessibility', title: 'Lang Attribute Checker for WCAG 3.1.1 and 3.1.2',
  desc: 'Paste HTML and check the page language on <html> and the lang attributes on passages in other languages: missing, empty, malformed or unknown codes, xml:lang only, and text direction for right-to-left languages.',
  labels: ['HTML'], sample: '<!doctype html><html lang="en-GB"><head><meta http-equiv="content-language" content="fr"></head>\n<body><p>Welcome. <span lang="fr">Bienvenue</span>, <span lang="de-CH">Grüezi</span>.</p>\n<p lang="english">Wrong code</p><p lang="">Empty</p><blockquote lang="ar">مرحبا</blockquote><a href="/fr" hreflang="fr_FR">FR</a></body></html>',
  run([s]) {
    need(s); const root = parseHTML(s), f = [], list = []; const html = all(root).find((n) => n.tag === 'html');
    if (!html) f.push('[ERROR] no <html> element: add <html lang="...">');
    else if (!('lang' in html.attrs)) f.push(`[ERROR] <html> has no lang attribute (WCAG 3.1.1, Level A)${'xml:lang' in html.attrs ? '. xml:lang alone is not enough in HTML5' : ''}`);
    else if (!html.attrs.lang.trim()) f.push('[ERROR] <html lang=""> is empty: screen readers fall back to the user\'s default voice');
    const check = (n, v, label) => {
      const t = v.trim(); if (!t) { f.push(`[ERROR] empty ${label}\n        ${where(root, n)}`); return null; }
      const i = langInfo(t); if (!i.ok) { f.push(`[ERROR] "${t}" is not a valid language tag${/_/.test(t) ? ' (use a hyphen, not an underscore)' : ''}${/^[a-z]{4,}$/i.test(t) ? ' (use the code, such as "en", not the language name)' : ''}\n        ${where(root, n)}`); return null; }
      if (!i.known) f.push(`[REVIEW] "${t}": the browser does not know a language of that name; check the code\n        ${where(root, n)}`);
      return i;
    };
    let pageLang = '';
    if (html && html.attrs.lang && html.attrs.lang.trim()) { const i = check(html, html.attrs.lang, 'page lang'); pageLang = html.attrs.lang.trim().toLowerCase(); if (i) list.push(`Page language: ${html.attrs.lang.trim()}${i.name ? ' (' + i.name + ')' : ''}`); }
    for (const n of all(root)) {
      if (n === html) continue;
      if ('lang' in n.attrs) { const i = check(n, n.attrs.lang, `lang on <${n.tag}>`); if (i) { list.push(`Line ${lineOf(root, n)}: <${n.tag}> lang="${n.attrs.lang.trim()}"${i.name ? ' (' + i.name + ')' : ''}`); if (RTL.has(n.attrs.lang.trim().toLowerCase().split('-')[0]) && !('dir' in n.attrs)) f.push(`[REVIEW] right-to-left language "${n.attrs.lang}" without a dir attribute: add dir="rtl" on this element\n        ${where(root, n)}`); if (n.attrs.lang.trim().toLowerCase() === pageLang) f.push(`[INFO] lang repeats the page language\n        ${where(root, n)}`); } }
      if (n.tag === 'meta' && /content-language/i.test(n.attrs['http-equiv'] || '') && pageLang && (n.attrs.content || '').trim().toLowerCase().split('-')[0] !== pageLang.split('-')[0]) f.push(`[REVIEW] meta content-language "${n.attrs.content}" differs from <html lang="${pageLang}">. The lang attribute is what assistive technology uses; remove the meta tag\n        ${where(root, n)}`);
      if ('hreflang' in n.attrs && n.tag === 'a') check(n, n.attrs.hreflang, 'hreflang');
    }
    if (pageLang && RTL.has(pageLang.split('-')[0]) && html && !('dir' in html.attrs)) f.push('[REVIEW] right-to-left page language without dir="rtl" on <html>');
    return `${list.join('\n') || '(no language declarations found)'}\n\n${f.join('\n') || 'No problems found.'}\n\nChecks: 3.1.1 Language of Page (A) needs a valid lang on <html>; 3.1.2 Language of Parts (AA) needs lang on passages in another language (not on proper names or loan words in common use). The syntax check follows BCP 47 shape; the language name comes from your browser's Intl data, which does not list every registered code. This tool cannot tell which passages are in another language: read the page for those.`;
  },
});

// ---------- screen reader text ----------
T.push({
  id: 'screen-reader-text-preview', cat: 'Accessibility', title: 'Screen Reader Text Preview: What Gets Announced for Your HTML',
  desc: 'Paste HTML and read a linear text approximation of what a screen reader announces: landmarks, headings with levels, links, buttons, form fields with names and states, images, lists and tables.',
  labels: ['HTML'], sample: '<header><h1>Shop</h1><nav aria-label="Main"><ul><li><a href="/">Home</a></li><li><a href="/cart">Cart <span aria-hidden="true">(2)</span></a></li></ul></nav></header>\n<main><h2>Sign up</h2><p>Create an account to continue.</p><form><label for="e">Email</label><input id="e" type="email" required><label><input type="checkbox" checked> Send me news</label><button aria-expanded="false">More options</button><button type="submit">Create account</button></form><img src="a.png" alt="Smiling customer"><img src="d.png" alt=""><table><caption>Plans</caption><tr><th>Plan</th><th>Price</th></tr><tr><td>Basic</td><td>5</td></tr></table></main><footer><p>Contact us</p></footer>',
  run([s]) {
    need(s); const root = parseHTML(s), c = ctxOf(root), out = [];
    const walkN = (node) => {
      for (const n of node.kids) {
        if (n.tag === '#text') { const t = norm(n.text); if (t && !n.raw) out.push(t); continue; }
        if (isHiddenSelf(n)) continue;
        const { role, explicit } = roleOf(n), a = n.attrs, nm = () => accNameOf(n, c).name;
        const st = () => { const x = []; if (a['aria-expanded'] === 'true') x.push('expanded'); if (a['aria-expanded'] === 'false') x.push('collapsed'); if (a['aria-pressed'] === 'true') x.push('pressed'); if ('checked' in a || a['aria-checked'] === 'true') x.push('checked'); else if (['checkbox', 'radio', 'switch'].includes(role)) x.push('not checked'); if ('disabled' in a || a['aria-disabled'] === 'true') x.push('unavailable'); if ('required' in a || a['aria-required'] === 'true') x.push('required'); if (a['aria-invalid'] === 'true') x.push('invalid entry'); if (a['aria-current']) x.push('current'); return x.length ? ', ' + x.join(', ') : ''; };
        if (LAND.has(role) && landOf(n)) { const name = nm(); out.push(`${role}${role === 'main' || role === 'banner' || role === 'contentinfo' ? '' : ''} landmark${name && role !== 'main' ? ', ' + name : name ? ', ' + name : ''}`); walkN(n); out.push(`end of ${role} landmark`); continue; }
        switch (role) {
          case 'heading': out.push(`heading level ${a['aria-level'] || (n.tag.match(/^h(\d)$/) || [0, 2])[1]}, ${nm()}`); continue;
          case 'link': out.push(`link, ${nm() || '(unnamed)'}${st()}`); continue;
          case 'button': out.push(`button, ${nm() || '(unnamed)'}${st()}`); continue;
          case 'img': { const x = nm(); if (x) out.push(`graphic, ${x}`); else if (!('alt' in a)) out.push('graphic, unlabelled'); continue; }
          case 'textbox': case 'searchbox': out.push(`edit text, ${nm() || '(unlabelled)'}${st()}${a.value ? ', ' + a.value : ''}`); continue;
          case 'checkbox': out.push(`check box, ${nm() || '(unlabelled)'}${st()}`); continue;
          case 'radio': out.push(`radio button, ${nm() || '(unlabelled)'}${st()}`); continue;
          case 'combobox': case 'listbox': out.push(`${role === 'combobox' ? 'combo box' : 'list box'}, ${nm() || '(unlabelled)'}${st()}`); continue;
          case 'slider': case 'spinbutton': out.push(`${role === 'slider' ? 'slider' : 'spin button'}, ${nm() || '(unlabelled)'}${st()}${a.value ? ', ' + a.value : ''}`); continue;
          case 'list': { const items = n.kids.filter((k) => k.tag === 'li').length; out.push(`list, ${items} item${items === 1 ? '' : 's'}`); walkN(n); out.push('end of list'); continue; }
          case 'listitem': walkN(n); continue;
          case 'table': { const rows = all(n).filter((x) => x.tag === 'tr'), cols = Math.max(0, ...rows.map((r) => r.kids.filter((k) => k.tag === 'td' || k.tag === 'th').length)); out.push(`table${nm() ? ', ' + nm() : ''}, ${rows.length} rows, ${cols} columns`); for (const r of rows) out.push('row: ' + r.kids.filter((k) => k.tag === 'td' || k.tag === 'th').map((cell) => (cell.tag === 'th' ? '[header] ' : '') + norm(textOf(cell))).join(' | ')); out.push('end of table'); continue; }
          case 'separator': out.push('separator'); continue;
          default: if (role === 'group' && n.tag === 'fieldset' && nm()) out.push(`group, ${nm()}`); if (n.tag === 'label') { walkN({ kids: n.kids.filter((k) => k.tag !== '#text') }); continue; } if (n.tag === 'caption' || n.tag === 'legend' || n.tag === 'option') continue; walkN(n);
        }
      }
    };
    const body = all(root).find((n) => n.tag === 'body') || root; walkN(body);
    if (!out.length) throw new Error('Nothing would be announced for this HTML.');
    return `${out.join('\n')}\n\nA rough linear reading, one line per stop. Real screen readers (NVDA, JAWS, VoiceOver, TalkBack) differ in wording, in what they skip, and in how they treat tables and live regions, and users move by headings, links and landmarks rather than line by line. Use this to spot missing names, empty headings and odd order, then test with a real screen reader. Text hidden with CSS, content added by scripts and generated content are not modelled.`;
  },
});

// ---------- focus indicator, target size ----------
T.push({
  id: 'focus-indicator-contrast-checker', cat: 'Accessibility', title: 'Focus Indicator Contrast Checker for WCAG 1.4.11 and 2.4.13',
  desc: 'Enter your focus ring colour, the colours around and under it, its thickness and the component size to test the 3:1 contrast rule (1.4.11) and the Focus Appearance area and contrast rules (2.4.13).',
  inputs: 0, sample: '', opts: [
    { id: 'ind', label: 'Focus indicator colour', type: 'text', def: '#005fcc' },
    { id: 'adj', label: 'Colour next to the indicator (page background)', type: 'text', def: '#ffffff' },
    { id: 'unf', label: 'Colour of those pixels when not focused', type: 'text', def: '#ffffff' },
    { id: 'shape', label: 'Indicator shape', type: 'select', def: 'outline around the component', choices: ['outline around the component', 'underline (bottom edge only)', 'fills the component background'] },
    { id: 'thick', label: 'Indicator thickness (CSS px)', type: 'number', def: 2 },
    { id: 'off', label: 'Gap between component and outline (CSS px)', type: 'number', def: 2 },
    { id: 'w', label: 'Component width (CSS px)', type: 'number', def: 120 },
    { id: 'h', label: 'Component height (CSS px)', type: 'number', def: 40 }],
  run(_, o) {
    const ind = parseColor(o.ind), adj = parseColor(o.adj), unf = parseColor(o.unf), t = Number(o.thick), g = Math.max(0, Number(o.off) || 0), w = Number(o.w), h = Number(o.h);
    if (!(t > 0) || !(w > 0) || !(h > 0)) throw new Error('Thickness, width and height must be above 0.');
    const c1 = ratio(ind, adj), c2 = ratio(ind, unf), ring = w * h - Math.max(0, w - 4) * Math.max(0, h - 4);
    const area = o.shape.startsWith('outline') ? (w + 2 * (g + t)) * (h + 2 * (g + t)) - (w + 2 * g) * (h + 2 * g) : o.shape.startsWith('underline') ? w * t : w * h;
    const P = (b) => (b ? 'PASS' : 'FAIL');
    return `Indicator ${hex(ind)} on ${hex(adj)}: contrast ${c1.toFixed(2)}:1\nIndicator ${hex(ind)} against the unfocused pixels ${hex(unf)}: contrast ${c2.toFixed(2)}:1\n\n1.4.11 Non-text Contrast (AA): indicator vs adjacent colours at least 3:1 -> ${P(c1 >= 3)}\n2.4.13 Focus Appearance (AAA), two tests:\n  a) contrast between focused and unfocused pixels at least 3:1 -> ${P(c2 >= 3)}\n  b) indicator area at least that of a 2 px thick perimeter of the unfocused component: ${r1(area, 0)} px2 vs ${r1(ring, 0)} px2 -> ${P(area >= ring)}\n\nOverall for 2.4.13: ${c2 >= 3 && area >= ring ? 'meets both tests' : 'does not meet both tests'}.\nSC 2.4.7 Focus Visible (AA) only asks that a focus indicator is visible; 1.4.11 adds the 3:1 contrast for it. 2.4.13 is Level AAA in WCAG 2.2, so it is a goal, not an AA requirement.\nLimits: the area test uses a rectangle; a gap (offset) between the component and the ring counts in the ring's position but not its area; double rings (a light and a dark line) need each colour checked against its own neighbour; indicators drawn by the browser and left unmodified are exempt. Colour values are read as written, with no transparency or gradients.`;
  },
});
T.push({
  id: 'target-size-checker', cat: 'Accessibility', title: 'Target Size Checker for WCAG 2.5.8 (24 by 24 CSS Pixels)',
  desc: 'List your buttons and links with width, height and position and check each against the 24 by 24 px minimum, including the spacing exception that uses a 24 px circle around undersized targets.',
  labels: ['One target per line: name | width | height | x | y'], placeholder: ['Close | 20 | 20 | 300 | 10'],
  sample: 'Close | 20 | 20 | 300 | 10\nHelp | 20 | 20 | 315 | 10\nMenu | 44 | 44 | 10 | 10\nTiny link | 16 | 14 | 100 | 200\nNeighbour | 60 | 30 | 116 | 200\nSave | 24 | 24 | 400 | 400',
  run([s]) {
    need(s, 'a target list'); const T2 = [];
    for (const line of s.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const p = line.split('|').map((x) => x.trim()); if (p.length < 3) throw new Error('Use: name | width | height | x | y (got "' + clip(line, 40) + '")');
      const [name, w, h, x, y] = p; const o = { name, w: Number(w), h: Number(h), x: x === undefined || x === '' ? null : Number(x), y: y === undefined || y === '' ? null : Number(y) };
      if (!(o.w > 0 && o.h > 0)) throw new Error('Width and height must be numbers above 0: ' + clip(line, 40)); T2.push(o);
    }
    const under = (t) => t.w < 24 || t.h < 24, cen = (t) => [t.x + t.w / 2, t.y + t.h / 2];
    const circleHitsRect = (c, r) => { const px = Math.max(r.x, Math.min(c[0], r.x + r.w)), py = Math.max(r.y, Math.min(c[1], r.y + r.h)); return (c[0] - px) ** 2 + (c[1] - py) ** 2 < 144; };
    const rows = [['Target', 'Size', 'Result']]; let bad = 0;
    for (const t of T2) {
      if (!under(t)) { rows.push([t.name, `${t.w} x ${t.h}`, 'PASS: at least 24 x 24']); continue; }
      if (t.x === null || t.y === null) { rows.push([t.name, `${t.w} x ${t.h}`, 'REVIEW: under 24 x 24 and no position given, so the spacing exception cannot be checked']); bad++; continue; }
      const c = cen(t); let hit = null;
      for (const u of T2) { if (u === t || u.x === null || u.y === null) continue; if (circleHitsRect(c, u)) { hit = u; break; } if (under(u)) { const d = Math.hypot(c[0] - cen(u)[0], c[1] - cen(u)[1]); if (d < 24) { hit = u; break; } } }
      if (hit) { rows.push([t.name, `${t.w} x ${t.h}`, `FAIL: undersized and its 24 px circle touches "${hit.name}"`]); bad++; } else rows.push([t.name, `${t.w} x ${t.h}`, 'PASS: undersized but the spacing exception applies']);
    }
    return `${tbl(rows)}\n\n${bad} target${bad === 1 ? '' : 's'} to fix or review out of ${T2.length}.\n\nRule (WCAG 2.2 SC 2.5.8, Level AA): a pointer target is at least 24 by 24 CSS pixels unless one of these applies: Spacing (a 24 px circle centred on the undersized target's box touches no other target and no other undersized target's circle), Equivalent (another control on the page does the same), Inline (the target is in a sentence or limited by line height), User agent control, or Essential. This tool tests size and spacing only. Mark Equivalent, Inline, User agent and Essential cases yourself. Positions are the top-left corner of each box in the same coordinate system. Measure real sizes in DevTools; padding counts as part of the target.`;
  },
});

// ---------- accessible palette ----------
T.push({
  id: 'accessible-palette-generator', cat: 'Accessibility', title: 'Accessible Palette Generator: Shades with Guaranteed Text Contrast',
  desc: 'Enter a brand colour and get a shade ramp where every step shows its contrast with white and black text, the best text colour, the pairs inside the ramp that reach your WCAG target, and CSS variables.',
  labels: ['Brand colour (#hex, rgb() or hsl())'], placeholder: ['#2563eb'], sample: '#2563eb',
  opts: [{ id: 'target', label: 'Minimum contrast ratio', type: 'select', def: '4.5', choices: ['3', '4.5', '7'] }, { id: 'prefix', label: 'CSS variable prefix', type: 'text', def: 'brand' }],
  run([s], o) {
    const rgb = parseColor(s.trim()), [h, sat, l0] = rgb2hsl(rgb), target = Number(o.target);
    const steps = [[50, 0.97], [100, 0.93], [200, 0.85], [300, 0.75], [400, 0.64], [500, 0.53], [600, 0.43], [700, 0.34], [800, 0.25], [900, 0.17], [950, 0.1]];
    let near = 0, nd = 9; steps.forEach(([_, L], i) => { if (Math.abs(L - l0) < nd) { nd = Math.abs(L - l0); near = i; } });
    const ramp = steps.map(([name, L], i) => { const k = 1 - Math.abs(2 * L - 1) ** 2 * 0.4; return { name, hex: i === near ? hex(rgb) : hex(hsl2rgb(h, Math.min(1, sat) * k, L)) }; });
    const rgbOf = (x) => parseColor(x.hex); const W = [255, 255, 255], B = [0, 0, 0];
    const rows = [['Step', 'Hex', 'White text', 'Black text', 'Best text']];
    for (const x of ramp) { const a = ratio(rgbOf(x), W), b = ratio(rgbOf(x), B), best = a >= b ? 'white' : 'black', r = Math.max(a, b); rows.push([x.name + (x === ramp[near] ? ' (brand)' : ''), x.hex, a.toFixed(2), b.toFixed(2), `${best} ${r.toFixed(2)} ${r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'large text/UI only' : 'FAIL'}`]); }
    const pairs = []; for (let i = 0; i < ramp.length; i++) for (let j = i + 1; j < ramp.length; j++) { const r = ratio(rgbOf(ramp[i]), rgbOf(ramp[j])); if (r >= target) pairs.push([ramp[i].name, ramp[j].name, r]); }
    const minGap = {}; for (const [a, b, r] of pairs) { if (!(a in minGap) || b < minGap[a][0]) minGap[a] = [b, r]; }
    // darkest tweak of the brand colour that reaches the target on white
    let L = l0, adj = rgb; while (ratio(adj, W) < target && L > 0.02) { L -= 0.005; adj = hsl2rgb(h, sat, L); }
    const css = ramp.map((x) => `  --${o.prefix}-${x.name}: ${x.hex};`).join('\n');
    return `Brand ${hex(rgb)} (hue ${Math.round(h)}, saturation ${Math.round(sat * 100)}%, lightness ${Math.round(l0 * 100)}%). Target ratio ${target}:1.\n\n${tbl(rows)}\n\nPAIRS INSIDE THE RAMP THAT REACH ${target}:1 (${pairs.length} of ${ramp.length * (ramp.length - 1) / 2})\n${Object.entries(minGap).map(([a, [b, r]]) => `  ${a} pairs with ${b} and every darker step (closest pair ${r.toFixed(2)}:1)`).join('\n') || '  none'}\n\nBRAND AS TEXT OR LINK COLOUR ON WHITE: ${ratio(rgb, W) >= target ? hex(rgb) + ' already reaches ' + ratio(rgb, W).toFixed(2) + ':1' : hex(adj) + ' (brand darkened to ' + ratio(adj, W).toFixed(2) + ':1)'}\n\n:root {\n${css}\n}\n\nContrast uses the WCAG 2 relative luminance formula. Ramp steps are the brand hue with fixed lightness stops and reduced saturation at the ends; the step closest to your colour is replaced by the exact brand colour. WCAG asks 4.5:1 for normal text (AA), 3:1 for large text and UI parts, 7:1 for AAA. Check borders, focus rings and states with the Palette Contrast Matrix or the Contrast Checker.`;
  },
});

// ---------- accessible table builder ----------
function csvRows(text, delim) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"' && cur === '') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}
T.push({
  id: 'accessible-table-builder', cat: 'Accessibility', title: 'Accessible HTML Table Builder from CSV with Caption and Scope',
  desc: 'Turn pasted CSV or tab-separated data into an HTML table with a caption, thead and tbody, th scope="col" and scope="row" headers, and an optional scroll wrapper that keyboard users can reach.',
  labels: ['CSV or tab-separated data'], placeholder: ['Plan,Price,Users\nBasic,5,1'], sample: 'Plan,Monthly price,Users,Support\nBasic,5,1,Email\nTeam,15,10,"Email, chat"\nBusiness,40,50,Phone',
  opts: [{ id: 'cap', label: 'Caption (what the table shows)', type: 'text', def: 'Plans and prices' }, { id: 'rowh', label: 'First column is the row header', type: 'checkbox', def: true }, { id: 'wrap', label: 'Wrap in a scrollable region for small screens', type: 'checkbox', def: true }, { id: 'cls', label: 'Table class (optional)', type: 'text', def: '' }],
  run([s], o) {
    need(s, 'table data'); const first = s.split('\n')[0], delim = (first.match(/\t/g) || []).length >= (first.match(/,/g) || []).length && first.includes('\t') ? '\t' : first.split(';').length > first.split(',').length ? ';' : ',';
    const rows = csvRows(s, delim); if (rows.length < 2) throw new Error('Need a header row and at least one data row.');
    const cols = Math.max(...rows.map((r) => r.length)), cell = (r, i) => esc((r[i] ?? '').trim());
    const head = Array.from({ length: cols }, (_, i) => `      <th scope="col">${cell(rows[0], i)}</th>`).join('\n');
    const body = rows.slice(1).map((r) => '    <tr>\n' + Array.from({ length: cols }, (_, i) => (i === 0 && o.rowh ? `      <th scope="row">${cell(r, i)}</th>` : `      <td>${cell(r, i)}</td>`)).join('\n') + '\n    </tr>').join('\n');
    const id = 'tbl-cap';
    const table = `<table${o.cls ? ` class="${attrQ(o.cls)}"` : ''}>\n  ${o.cap.trim() ? `<caption>${esc(o.cap.trim())}</caption>` : '<!-- add a <caption> that says what the table is -->'}\n  <thead>\n    <tr>\n${head}\n    </tr>\n  </thead>\n  <tbody>\n${body}\n  </tbody>\n</table>`;
    const out = o.wrap ? `<div role="region" aria-labelledby="${id}" tabindex="0" style="overflow-x:auto">\n${table.replace('<caption>', `<caption id="${id}">`)}\n</div>` : table;
    const w = []; if (!o.cap.trim()) w.push('No caption: a table needs a name.'); if (rows.some((r) => r.length !== rows[0].length)) w.push('Some rows have a different number of cells; short rows were padded with empty cells.'); if (rows[0].some((x) => !x.trim())) w.push('A header cell is empty: every column header should have text.');
    return `${out}\n\n${w.length ? 'REVIEW\n' + w.map((x) => '- ' + x).join('\n') + '\n\n' : ''}Why: <caption> names the table, <th scope="col"> and <th scope="row"> tie each cell to its headers so screen readers can announce them when you move through the table. Use this for simple tables with one header row (and one header column). Tables with merged cells or several header levels need colspan/rowspan with scope="colgroup", or id and headers attributes: build those by hand. The scroll wrapper has tabindex="0" so keyboard users can scroll it; remove it if the table always fits. The delimiter was detected as ${delim === '\t' ? 'tab' : delim === ';' ? 'semicolon' : 'comma'}.`;
  },
});

// ---------- skip link ----------
T.push({
  id: 'skip-link-generator', cat: 'Accessibility', title: 'Skip Link Generator: Skip to Main Content HTML and CSS',
  desc: 'Create a "skip to main content" link with CSS that stays hidden until it gets keyboard focus, with your colours checked for contrast and the matching main element markup.',
  inputs: 0, sample: '', opts: [
    { id: 'id', label: 'Target element id', type: 'text', def: 'main-content' },
    { id: 'text', label: 'Link text', type: 'text', def: 'Skip to main content' },
    { id: 'bg', label: 'Background colour', type: 'text', def: '#000000' },
    { id: 'fg', label: 'Text colour', type: 'text', def: '#ffffff' },
    { id: 'ring', label: 'Focus outline colour', type: 'text', def: '#ffbf47' },
    { id: 'pos', label: 'Position when focused', type: 'select', def: 'top left', choices: ['top left', 'top centre'] }],
  run(_, o) {
    const id = String(o.id).trim().replace(/^#/, ''); if (!/^[A-Za-z][\w:.-]*$/.test(id)) throw new Error('The target id must start with a letter and use letters, digits, - or _.');
    const bg = parseColor(o.bg), fg = parseColor(o.fg), ring = parseColor(o.ring), cr = ratio(fg, bg), rr = ratio(ring, bg);
    const centre = o.pos === 'top centre';
    return `<!-- first focusable element in <body> -->\n<a class="skip-link" href="#${id}">${esc(o.text)}</a>\n...\n<main id="${id}" tabindex="-1">\n  ...\n</main>\n\n/* CSS */\n.skip-link {\n  position: absolute;\n  ${centre ? 'left: 50%;\n  transform: translate(-50%, -150%);' : 'left: 0;\n  transform: translateY(-150%);'}\n  top: 0;\n  z-index: 1000;\n  padding: 0.75rem 1rem;\n  background: ${hex(bg)};\n  color: ${hex(fg)};\n  font: inherit;\n  text-decoration: underline;\n}\n.skip-link:focus {\n  transform: ${centre ? 'translate(-50%, 0)' : 'translateY(0)'};\n  outline: 3px solid ${hex(ring)};\n  outline-offset: 2px;\n}\n\nText contrast ${cr.toFixed(2)}:1 (${cr >= 7 ? 'AAA' : cr >= 4.5 ? 'passes AA' : 'FAILS AA, needs 4.5:1'}). Focus outline against the link background ${rr.toFixed(2)}:1 (${rr >= 3 ? 'passes the 3:1 non-text rule' : 'FAILS 3:1'}); also check it against your page background.\n\nHow it works: the link is the first thing Tab reaches, is moved off screen with transform (not display:none, which would remove it from the tab order) and slides into view on focus. tabindex="-1" on <main> lets the browser move focus there after the jump in older browsers. It satisfies WCAG 2.4.1 Bypass Blocks (A). Test: reload, press Tab once, press Enter, press Tab again and check that focus continues inside main. There is no animation, so nothing to turn off for reduced motion.`;
  },
});

// ---------- caption validator ----------
const tcSec = (h, m, s, ms) => (+h || 0) * 3600 + +m * 60 + +s + +ms / 1000;
T.push({
  id: 'caption-file-validator', cat: 'Accessibility', title: 'Caption File Validator for WebVTT and SRT',
  desc: 'Paste a .vtt or .srt caption file and check the header, cue timing, ordering, empty or overlapping cues and tags, plus reading-speed and line-length guidance for readable captions.',
  labels: ['WebVTT or SRT file'], sample: 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500\nWelcome to the show.\n\n2\n00:00:03.000 --> 00:00:02.000\nThis cue ends before it starts.\n\n3\n00:00:06.000 --> 00:00:07.000 align:middle\nThis is a very long caption line that runs well past the usual limit of forty-two characters\n\n00:00:08.00 --> 00:00:09.000\n<v Anna>Hello <b>there</b>\n\n4\n00:00:10,000 --> 00:00:12.000\n',
  opts: [{ id: 'cps', label: 'Flag reading speed above (characters per second)', type: 'number', def: 20 }, { id: 'cpl', label: 'Flag lines longer than (characters)', type: 'number', def: 42 }],
  run([s], o) {
    need(s, 'a caption file'); const text = s.replace(/^﻿/, '').replace(/\r\n?/g, '\n'), lines = text.split('\n'), f = [], add = (lv, ln, m) => f.push(`[${lv}] line ${ln}: ${m}`);
    const vtt = /^WEBVTT(\s|$)/.test(text), cpsMax = Number(o.cps) || 20, cplMax = Number(o.cpl) || 42;
    if (!vtt && /^WEBVTT/i.test(text)) add('ERROR', 1, 'the first line must be exactly "WEBVTT" (capitals), optionally followed by a space and text');
    const TIME = vtt ? /^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/ : /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/;
    const tm = (x, ln) => { const m = TIME.exec(x); if (!m) { const hint = vtt && /,/.test(x) ? ' (WebVTT uses a dot before milliseconds, not a comma)' : !vtt && /\./.test(x) ? ' (SRT uses a comma before milliseconds, not a dot)' : ''; add('ERROR', ln, `bad timestamp "${x}"${hint}`); return null; } if (+m[vtt ? 2 : 2] > 59 || +m[3] > 59) add('ERROR', ln, `minutes or seconds above 59 in "${x}"`); return tcSec(m[1], m[2], m[3], m[4]); };
    let i = vtt ? 1 : 0, n = 0, prevStart = -1, prevEnd = -1, expect = 1; const cues = [];
    if (vtt && lines[1] && lines[1].trim() !== '') add('ERROR', 2, 'a blank line must follow the WEBVTT header line');
    while (i < lines.length) {
      if (lines[i].trim() === '') { i++; continue; }
      if (vtt && /^(NOTE|STYLE|REGION)(\s|$)/.test(lines[i])) { while (i < lines.length && lines[i].trim() !== '') i++; continue; }
      const start = i; let id = null;
      if (!lines[i].includes('-->')) { id = lines[i].trim(); i++; if (i >= lines.length || lines[i].trim() === '') { add('ERROR', start + 1, `"${clip(id, 30)}" is not a cue: no timing line follows`); continue; } }
      const tl = lines[i], ln = i + 1; n++;
      if (!vtt && id !== null && !/^\d+$/.test(id)) add('ERROR', start + 1, 'SRT cue numbers must be digits'); else if (!vtt && id !== null && +id !== expect) add('REVIEW', start + 1, `cue number ${id}, expected ${expect}`);
      if (!vtt && id === null) add('ERROR', ln, 'SRT cues start with a number line');
      expect = (+id || expect) + 1;
      const m = /^\s*(\S+)\s+-->\s+(\S+)(.*)$/.exec(tl);
      if (!m) { add('ERROR', ln, 'timing line must look like 00:00:01.000 --> 00:00:03.000'); i++; while (i < lines.length && lines[i].trim() !== '') i++; continue; }
      const a = tm(m[1], ln), b = tm(m[2], ln);
      if (m[3].trim()) { if (!vtt) add('REVIEW', ln, 'SRT has no cue settings; extra text after the end time is ignored by many players'); else for (const st of m[3].trim().split(/\s+/)) if (!/^(vertical:(rl|lr)|line:-?\d+(\.\d+)?%?(,(start|center|end))?|position:\d+(\.\d+)?%(,(line-left|center|line-right))?|size:\d+(\.\d+)?%|align:(start|center|end|left|right)|region:\S+)$/.test(st)) add('ERROR', ln, `unknown or malformed cue setting "${st}"`); }
      i++; const body = []; while (i < lines.length && lines[i].trim() !== '') { body.push(lines[i]); i++; }
      if (a !== null && b !== null) {
        if (b <= a) add('ERROR', ln, 'the end time must be after the start time');
        if (vtt && a < prevStart) add('ERROR', ln, 'cue starts before the previous cue (WebVTT start times must not decrease)');
        else if (a < prevEnd - 1e-9) add('REVIEW', ln, `overlaps the previous cue by ${(prevEnd - a).toFixed(2)} s; two captions on screen at once are hard to read`);
        prevStart = Math.max(prevStart, a); prevEnd = Math.max(prevEnd, b);
        const plain = body.join(' ').replace(/<[^>]+>/g, '').trim(), dur = b - a;
        if (dur > 0 && plain && plain.replace(/\s/g, '').length / dur > cpsMax) add('REVIEW', ln, `reading speed ${(plain.replace(/\s/g, '').length / dur).toFixed(0)} characters per second is fast; aim for about ${cpsMax} or less`);
        if (dur > 0 && dur < 0.8 && plain) add('REVIEW', ln, `shown for only ${dur.toFixed(2)} s`);
        if (dur > 8) add('REVIEW', ln, `shown for ${dur.toFixed(1)} s; consider splitting`);
      }
      if (!body.length || !body.join('').trim()) add('REVIEW', ln, 'cue has no text');
      if (body.length > 2) add('REVIEW', ln + 1, `${body.length} lines; two lines at most is the usual guidance`);
      body.forEach((l, k) => { const pl = l.replace(/<[^>]+>/g, ''); if (pl.length > cplMax) add('REVIEW', ln + 1 + k, `line has ${pl.length} characters; about ${cplMax} is the usual limit`); if (l.includes('-->')) add('ERROR', ln + 1 + k, 'cue text must not contain "-->"'); if (vtt) { for (const t of l.matchAll(/<\/?([a-zA-Z][\w.]*)(?:[\s.][^>]*)?>/g)) if (!['b', 'i', 'u', 'c', 'v', 'lang', 'ruby', 'rt'].includes(t[1].split('.')[0])) add('ERROR', ln + 1 + k, `unknown tag <${t[1]}>`); const op = (l.match(/<(b|i|u|c|lang)[\s.>]/g) || []).length, cl = (l.match(/<\/(b|i|u|c|v|lang)>/g) || []).length; if (op !== cl && body.length === 1) add('REVIEW', ln + 1 + k, 'a tag is not closed on this line'); } });
      cues.push(1);
    }
    if (!n) throw new Error('No cues found. Is this a ' + (vtt ? 'WebVTT' : 'SRT') + ' file?');
    const err = f.filter((x) => x.startsWith('[ERROR]')).length;
    return `${vtt ? 'WebVTT' : 'SRT'}: ${n} cue${n === 1 ? '' : 's'}, ${err} error${err === 1 ? '' : 's'}, ${f.length - err} to review.\n\n${f.join('\n') || 'No problems found.'}\n\nErrors are syntax problems that make players drop or misread a cue. "Review" items (speed, line length, duration, overlap) are common captioning style guidance, not WCAG rules; WCAG 1.2.2 asks that captions exist and are accurate and synchronised, which only a person can judge. Checked by hand against the WebVTT and SRT formats; settings and regions are checked for shape only.`;
  },
});

// ---------- plain language ----------
const PLAIN = [['utilize', 'use'], ['utilise', 'use'], ['utilization', 'use'], ['commence', 'start'], ['terminate', 'end'], ['approximately', 'about'], ['assistance', 'help'], ['additional', 'more'], ['numerous', 'many'], ['sufficient', 'enough'], ['endeavour', 'try'], ['endeavor', 'try'], ['facilitate', 'help'], ['demonstrate', 'show'], ['obtain', 'get'], ['purchase', 'buy'], ['require', 'need'], ['requirement', 'need'], ['indicate', 'show'], ['regarding', 'about'], ['concerning', 'about'], ['notwithstanding', 'despite'], ['subsequently', 'then'], ['subsequent', 'later'], ['prior to', 'before'], ['in order to', 'to'], ['in the event that', 'if'], ['due to the fact that', 'because'], ['at this point in time', 'now'], ['at the present time', 'now'], ['in the near future', 'soon'], ['a number of', 'some'], ['the majority of', 'most'], ['with regard to', 'about'], ['with respect to', 'about'], ['in addition', 'also'], ['furthermore', 'also'], ['moreover', 'also'], ['however', 'but'], ['therefore', 'so'], ['consequently', 'so'], ['nevertheless', 'but'], ['accordingly', 'so'], ['attempt', 'try'], ['assist', 'help'], ['inform', 'tell'], ['advise', 'tell'], ['reside', 'live'], ['remainder', 'rest'], ['receive', 'get'], ['provide', 'give'], ['possess', 'have'], ['ascertain', 'find out'], ['comprehend', 'understand'], ['compensation', 'pay'], ['component', 'part'], ['conclude', 'end'], ['construct', 'build'], ['designate', 'name'], ['determine', 'decide'], ['discontinue', 'stop'], ['disseminate', 'share'], ['eliminate', 'remove'], ['employ', 'use'], ['encounter', 'meet'], ['enumerate', 'list'], ['equivalent', 'equal'], ['establish', 'set up'], ['evidence', 'proof'], ['exhibit', 'show'], ['expedite', 'speed up'], ['expenditure', 'cost'], ['forward', 'send'], ['frequently', 'often'], ['immediately', 'now'], ['implement', 'carry out'], ['initial', 'first'], ['initiate', 'start'], ['institute', 'start'], ['locate', 'find'], ['magnitude', 'size'], ['maintain', 'keep'], ['modify', 'change'], ['necessitate', 'need'], ['objective', 'aim'], ['participate', 'take part'], ['perform', 'do'], ['permit', 'let'], ['previously', 'before'], ['principal', 'main'], ['procure', 'get'], ['proficiency', 'skill'], ['reduce', 'cut'], ['refrain from', 'avoid'], ['relocate', 'move'], ['remuneration', 'pay'], ['render', 'make'], ['request', 'ask'], ['retain', 'keep'], ['solicit', 'ask for'], ['substantial', 'large'], ['supplement', 'add to'], ['transmit', 'send'], ['validate', 'confirm'], ['verify', 'check'], ['whereas', 'while'], ['leverage', 'use'], ['synergy', 'teamwork'], ['stakeholders', 'people involved'], ['going forward', 'from now on'], ['best practice', 'good way'], ['pertaining to', 'about'], ['aforementioned', 'earlier'], ['heretofore', 'until now'], ['inasmuch as', 'since'], ['per annum', 'a year'], ['kindly', 'please'], ['optimal', 'best'], ['ameliorate', 'improve'], ['prioritize', 'put first'], ['methodology', 'method'], ['functionality', 'features']];
const PASSIVE = /\b(am|is|are|was|were|be|been|being)\s+(\w+ed|built|made|done|given|taken|seen|shown|known|written|chosen|held|kept|sent|found|set|put|run|left|brought|bought)\b(?:\s+by\b)?/gi;
T.push({
  id: 'plain-language-checker', cat: 'Accessibility', title: 'Plain Language Checker: Complex Words, Long Sentences and Passive Voice',
  desc: 'Paste English text and see the words that have a simpler alternative, sentences over your word limit, passive phrases and a simplified version, for readers with low literacy or cognitive disabilities.',
  labels: ['English text'], sample: 'We endeavour to facilitate the provision of assistance to applicants who require additional information prior to commencing the application. In the event that your documents are not received by the deadline, the application will be terminated and you will need to start again with a new form. Approximately 40 percent of forms are rejected due to the fact that they are incomplete.',
  opts: [{ id: 'max', label: 'Long sentence limit (words)', type: 'number', def: 20 }],
  run([s], o) {
    need(s, 'some text'); const max = Number(o.max) || 20, hits = [], list = [...PLAIN].sort((a, b) => b[0].length - a[0].length);
    const re = new RegExp('\\b(' + list.map(([w]) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi'), map = new Map(list.map(([a, b]) => [a, b]));
    let simple = s.replace(re, (m) => { const r = map.get(m.toLowerCase()); hits.push([m, r]); return m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? r[0].toUpperCase() + r.slice(1) : r; });
    const sents = s.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z"'(])/).filter((x) => x.trim()), long = [];
    let words = 0; for (const x of sents) { const w = (x.match(/\b[\w'-]+\b/g) || []).length; words += w; if (w > max) long.push([w, x]); }
    const passive = [...s.matchAll(PASSIVE)].map((m) => m[0]);
    const counts = {}; hits.forEach(([a]) => { counts[a.toLowerCase()] = (counts[a.toLowerCase()] || 0) + 1; });
    return `${sents.length} sentence${sents.length === 1 ? '' : 's'}, ${words} words, ${sents.length ? (words / sents.length).toFixed(1) : 0} words per sentence on average.\n\nCOMPLEX WORDS WITH A SIMPLER OPTION (${hits.length})\n${Object.entries(counts).map(([k, n]) => `  ${k} -> ${map.get(k)}${n > 1 ? ' (x' + n + ')' : ''}`).join('\n') || '  none found'}\n\nLONG SENTENCES, OVER ${max} WORDS (${long.length})\n${long.map(([w, x]) => `  [${w} words] ${clip(x, 110)}`).join('\n') || '  none'}\n\nPOSSIBLE PASSIVE VOICE (${passive.length})\n${[...new Set(passive)].map((x) => '  ' + x).join('\n') || '  none found'}\n\nSIMPLIFIED WORDS ONLY (word swaps; check grammar)\n${simple}\n\nThis is a word list and pattern check for English: ${PLAIN.length} word pairs, a sentence length limit and a rough passive pattern. It does not understand meaning, so a swap can need grammar changes ("assist with" -> "help with") and the passive check misses and over-flags some cases. Short sentences, common words and active verbs help many readers, but who the readers are matters most: keep legal or technical terms they need. WCAG 3.1.5 (Reading Level, AAA) asks for supplementary content when text needs more than lower secondary education.`;
  },
});

// ---------- motion checker ----------
T.push({
  id: 'motion-animation-checker', cat: 'Accessibility', title: 'Motion and Animation Checker: prefers-reduced-motion Coverage in CSS',
  desc: 'Paste CSS (and HTML if you like) and find animations, transitions, smooth scrolling and autoplay that have no prefers-reduced-motion override, plus endless or long-running animations.',
  labels: ['CSS (HTML with <style> works too)'], sample: '.hero{animation:slide 8s ease-in-out infinite}\n.btn{transition:transform .2s,background .2s}\n.card:hover{transform:scale(1.05)}\nhtml{scroll-behavior:smooth}\n.spin{animation:spin 1s linear infinite}\n@keyframes slide{from{transform:translateX(-20px)}to{transform:none}}\n@keyframes spin{to{transform:rotate(1turn)}}\n@media (prefers-reduced-motion: reduce){.spin{animation:none}.btn{transition:none}}',
  run([s]) {
    need(s, 'CSS'); const css = (/<style/i.test(s) ? [...s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') : s).replace(/\/\*[\s\S]*?\*\//g, ''), items = parseCss(css), f = [], anim = [], red = new Set(); let globalOff = false;
    const durs = (v) => [...v.matchAll(/(-?[\d.]+)(ms|s)\b/g)].map((m) => (m[2] === 'ms' ? +m[1] / 1000 : +m[1]));
    const scan = (list, inReduce) => {
      for (const it of list) {
        if (it.k === 'at' && it.kids) { const isRed = /prefers-reduced-motion\s*:\s*reduce/i.test(it.prelude) || /\(\s*prefers-reduced-motion\s*\)/i.test(it.prelude); const noPref = /no-preference/i.test(it.prelude); if (noPref) { for (const r of it.kids) if (r.k === 'rule') anim.push(null); scan(it.kids.map((x) => ({ ...x, __np: true })), false); } else scan(it.kids, isRed || inReduce); continue; }
        if (it.k !== 'rule') continue;
        const decls = it.body, sels = splitTop(it.sel);
        if (inReduce) { if (/(animation(-name|-duration)?|transition(-duration|-property)?|scroll-behavior)\s*:\s*(none|0s?|0ms|auto|0\.01ms)/i.test(decls) || /animation-duration\s*:\s*0/i.test(decls)) { sels.forEach((x) => red.add(x.trim())); if (sels.some((x) => x.trim() === '*' || x.trim().startsWith('*,'))) globalOff = true; } continue; }
        if (it.__np) continue;
        const a = /(?:^|;|\s)animation(?:-name)?\s*:\s*([^;]+)/i.exec(decls), t = /(?:^|;|\s)transition(?:-property)?\s*:\s*([^;]+)/i.exec(decls), sb = /scroll-behavior\s*:\s*smooth/i.test(decls);
        if (a && !/^\s*none\s*$/i.test(a[1])) anim.push({ kind: 'animation', sel: it.sel.trim(), v: a[1].trim(), dur: durs(a[1]), inf: /\binfinite\b/.test(a[1]) || /animation-iteration-count\s*:\s*infinite/i.test(decls) });
        if (t && !/^\s*(none|all\s+0s)\s*$/i.test(t[1])) anim.push({ kind: 'transition', sel: it.sel.trim(), v: t[1].trim(), dur: durs(t[1]) });
        if (sb) anim.push({ kind: 'smooth scroll', sel: it.sel.trim(), v: 'scroll-behavior: smooth', dur: [] });
      }
    };
    scan(items, false);
    const real = anim.filter(Boolean), hasReduce = /prefers-reduced-motion/i.test(css);
    const rows = [['Kind', 'Selector', 'Value', 'Covered by reduce rule?', 'Note']];
    for (const x of real) {
      const covered = globalOff || splitTop(x.sel).every((p) => red.has(p.trim())); const note = [];
      if (x.kind === 'animation' && (x.inf || Math.max(0, ...x.dur) > 5)) note.push(x.inf ? 'runs forever' : 'over 5 s');
      rows.push([x.kind, clip(x.sel, 28), clip(x.v, 34), covered ? 'yes' : 'NO', note.join(', ')]);
      if (!covered && x.kind !== 'transition') f.push(`${x.kind} on ${clip(x.sel, 40)} has no prefers-reduced-motion override`);
      if (x.kind === 'animation' && note.length && !covered) f.push(`${clip(x.sel, 40)} ${note.join(', ')}: moving content that starts automatically and lasts over 5 s needs a way to pause, stop or hide it (WCAG 2.2.2)`);
    }
    if (!real.length && !/@keyframes/i.test(css)) return 'No animations, transitions or smooth scrolling found in this CSS.';
    const kf = [...css.matchAll(/@keyframes\s+([\w-]+)\s*{([\s\S]*?})\s*}/gi)].filter((k) => /\b(top|left|right|bottom|width|height|margin[\w-]*)\s*:/i.test(k[2]));
    return `${tbl(rows)}\n\n${hasReduce ? 'A prefers-reduced-motion block exists.' : 'No prefers-reduced-motion rule found.'}${globalOff ? ' A global "*" reduce rule covers everything.' : ''}\n\nREVIEW (${f.length + kf.length})\n${f.map((x) => '- ' + x).join('\n')}${kf.map((k) => `\n- @keyframes ${k[1]} moves layout properties (top, left, width...): this is heavier and shifts content; transform is smoother`).join('')}${!f.length && !kf.length ? '\n- nothing to flag' : ''}\n\nA starting point:\n@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }\n}\n\nRelevant criteria: 2.2.2 Pause, Stop, Hide (A) for moving content over 5 s; 2.3.3 Animation from Interactions (AAA) for motion from user actions; 2.3.1 limits flashing (more than three flashes a second). Short opacity or colour transitions are usually fine, while large movement, parallax, zoom and spinning can trigger vestibular symptoms. This reads selectors as written: it cannot tell if a reduce rule is more specific or loaded later, or what scripts animate.`;
  },
});

// ---------- accessibility statement ----------
T.push({
  id: 'accessibility-statement-generator', cat: 'Accessibility', title: 'Accessibility Statement Generator (Web Accessibility Directive Style)',
  desc: 'Fill in your organisation, standard, conformance status, known issues, contact and enforcement details and get an accessibility statement in plain text or Markdown, following the usual structure used by EU public bodies.',
  labels: ['Known accessibility issues, one per line (optional): description | WCAG criterion | planned fix'], placeholder: ['PDF forms are not tagged | 1.3.1 | June 2026'],
  sample: 'Some older PDF documents are not tagged for screen readers | 1.3.1 | Replacing them by 30 June 2026\nVideos published before 2021 have no captions | 1.2.2 | Captioning in progress',
  opts: [
    { id: 'org', label: 'Organisation', type: 'text', def: 'Example Organisation' },
    { id: 'site', label: 'Website or app', type: 'text', def: 'www.example.org' },
    { id: 'std', label: 'Standard', type: 'select', def: 'WCAG 2.1 level AA (EN 301 549 V3.2.1)', choices: ['WCAG 2.1 level AA (EN 301 549 V3.2.1)', 'WCAG 2.2 level AA', 'WCAG 2.1 level AA', 'WCAG 2.0 level AA'] },
    { id: 'status', label: 'Compliance status', type: 'select', def: 'partially compliant', choices: ['fully compliant', 'partially compliant', 'not compliant'] },
    { id: 'method', label: 'How it was assessed', type: 'select', def: 'a self-assessment', choices: ['a self-assessment', 'an assessment by an external party', 'automated tests and a manual review'] },
    { id: 'date', label: 'Statement date (YYYY-MM-DD)', type: 'text', def: '2026-01-15' },
    { id: 'contact', label: 'Contact (email or form URL)', type: 'text', def: 'accessibility@example.org' },
    { id: 'days', label: 'Days you aim to reply within', type: 'number', def: 14 },
    { id: 'body', label: 'Enforcement body and link (if one applies to you)', type: 'text', def: '' },
    { id: 'fmt', label: 'Format', type: 'select', def: 'Markdown', choices: ['Markdown', 'plain text'] }],
  run([s], o) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date.trim())) throw new Error('Enter the date as YYYY-MM-DD.');
    if (!o.org.trim() || !o.contact.trim()) throw new Error('Organisation and contact are required.');
    const issues = s.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split('|').map((x) => x.trim()));
    if (o.status !== 'fully compliant' && !issues.length) throw new Error('A partially compliant or non-compliant statement should list the content that is not accessible. Add at least one issue.');
    const md = o.fmt === 'Markdown', H = (t) => (md ? `## ${t}` : `${t.toUpperCase()}\n`), site = o.site.trim() || o.org.trim();
    const cs = { 'fully compliant': `This website is fully compliant with ${o.std}.`, 'partially compliant': `This website is partially compliant with ${o.std}, because of the exceptions and the non-compliances listed below.`, 'not compliant': `This website is not compliant with ${o.std}. The non-compliances are listed below.` }[o.status];
    const parts = [md ? `# Accessibility statement for ${site}` : `ACCESSIBILITY STATEMENT FOR ${site}`, '', `${o.org.trim()} is committed to making ${site} accessible to everyone, including people with disabilities. This statement applies to ${site}.`, '', H('Compliance status'), cs, ''];
    if (issues.length) { parts.push(H('Content that is not accessible'), 'The content listed below is not accessible for these reasons:', ''); for (const [d, c, fx] of issues) parts.push(`- ${d}${c ? ` (WCAG ${c})` : ''}${fx ? `. Plan: ${fx}` : ''}`); parts.push(''); }
    parts.push(H('Preparation of this accessibility statement'), `This statement was prepared on ${o.date.trim()}. It is based on ${o.method}.`, '', H('Feedback and contact information'), `If you find content you cannot use, or want an accessible version of something, contact us at ${o.contact.trim()}. We aim to reply within ${Math.max(1, Math.round(Number(o.days) || 14))} days.`, '');
    if (o.body.trim()) parts.push(H('Enforcement procedure'), `If you are not satisfied with our reply, you can contact: ${o.body.trim()}.`, '');
    return `${parts.join('\n')}\nDRAFTING NOTES (delete before publishing)\n- Only state what you have checked. "Fully compliant" needs evidence for every success criterion at the stated level.\n- The structure (compliance status, non-accessible content, preparation, feedback and contact, enforcement) follows the model statement used under the EU Web Accessibility Directive as the author recalls it; the tool could not check the wording of the Implementing Decision (EU) 2018/1523 in this session. Check it, and your national rules, before publishing. Public bodies must link the statement from every page.\n- Private companies serving EU consumers face similar duties under the European Accessibility Act; the required content differs. Ask your regulator or a lawyer.\n- This is a template, not legal advice. Keep the date current and review the statement when the site changes.`;
  },
});

// ---------- EAA checklist and ACR ----------
const STATUS = { met: 'Met', yes: 'Met', pass: 'Met', partial: 'Partly met', part: 'Partly met', partly: 'Partly met', not: 'Not met', no: 'Not met', fail: 'Not met', na: 'Not applicable', 'n/a': 'Not applicable' };
const EAA_CRIT = WCAG22.filter((c) => !c[5] && (c[2] === 'A' || c[2] === 'AA')).map((c) => ({ id: '9.' + c[0], sc: c[0], name: c[1], lv: c[2] }));
EAA_CRIT.push({ id: '9.4.1.1', sc: '4.1.1', name: 'Parsing (removed in WCAG 2.2, still listed in EN 301 549 V3.2.1)', lv: 'A' }); EAA_CRIT.sort((a, b) => a.id.split('.').map(Number).join('.').localeCompare(b.id.split('.').map(Number).join('.'), undefined, { numeric: true }));
T.push({
  id: 'eaa-en301549-web-checklist', cat: 'Accessibility', title: 'EAA and EN 301 549 Web Content Checklist (Clause 9 Status Summary)',
  desc: 'Mark each EN 301 549 clause 9 web requirement (the WCAG 2.1 A and AA criteria) as met, partly met, not met or not applicable and get a readiness summary by principle with the open items listed.',
  labels: ['Status lines: clause status note (met, partial, not, na)'], placeholder: ['9.1.1.1 met\n9.1.4.3 not Footer links are grey on white'],
  sample: '9.1.1.1 met\n9.1.2.2 not Videos have no captions\n9.1.3.1 partial Some tables lack headers\n9.1.4.3 not Footer links 3.1:1\n9.1.4.10 met\n9.2.1.1 met\n9.2.4.7 partial Focus ring removed on cards\n9.3.1.1 met\n9.4.1.2 met\n9.2.5.1 na No gestures',
  opts: [{ id: 'mode', label: 'Output', type: 'select', def: 'summary of my statuses', choices: ['summary of my statuses', 'blank checklist to fill in'] }],
  run([s], o) {
    if (o.mode.startsWith('blank')) return `Copy this list, put a status after each clause (met, partial, not or na) and paste it back with "summary of my statuses".\n\n${EAA_CRIT.map((c) => `${c.id}  ${c.name}  [${c.lv}]`).join('\n')}\n\nLine format for the summary: "9.1.1.1 met optional note".`;
    need(s, 'status lines'); const byId = new Map(EAA_CRIT.map((c) => [c.id, c])), st = new Map(), bad = [];
    for (const line of s.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const m = /^(9\.\d+\.\d+\.\d+)\s+(\S+)\s*(.*)$/.exec(line); if (!m) { bad.push(line); continue; }
      const c = byId.get(m[1]), v = STATUS[m[2].toLowerCase()]; if (!c) { bad.push(line + '  (not a clause 9 requirement in this list)'); continue; } if (!v) { bad.push(line + '  (status must be met, partial, not or na)'); continue; }
      st.set(m[1], { v, note: m[3] });
    }
    const cnt = { Met: 0, 'Partly met': 0, 'Not met': 0, 'Not applicable': 0, unrated: 0 }; const prin = {};
    for (const c of EAA_CRIT) { const r = st.get(c.id), k = r ? r.v : 'unrated'; cnt[k]++; const p = ['Perceivable', 'Operable', 'Understandable', 'Robust'][+c.sc[0] - 1]; (prin[p] ||= { Met: 0, 'Partly met': 0, 'Not met': 0, 'Not applicable': 0, unrated: 0 })[k]++; }
    const open = EAA_CRIT.filter((c) => st.has(c.id) && ['Not met', 'Partly met'].includes(st.get(c.id).v));
    const rated = EAA_CRIT.length - cnt.unrated - cnt['Not applicable'], ok = cnt.Met;
    return `${EAA_CRIT.length} web requirements (EN 301 549 clause 9). Rated: ${EAA_CRIT.length - cnt.unrated}. Met ${cnt.Met}, partly met ${cnt['Partly met']}, not met ${cnt['Not met']}, not applicable ${cnt['Not applicable']}, not yet rated ${cnt.unrated}.\n${rated ? `Of the ${rated} applicable rated requirements, ${Math.round(ok / rated * 100)}% are fully met.` : ''}\n\nBY PRINCIPLE\n${tbl([['Principle', 'Met', 'Partly', 'Not met', 'N/A', 'Unrated'], ...Object.entries(prin).map(([k, v]) => [k, v.Met, v['Partly met'], v['Not met'], v['Not applicable'], v.unrated])])}\n\nOPEN ITEMS (${open.length})\n${open.map((c) => `  ${c.id} ${c.name} [${c.lv}]: ${st.get(c.id).v}${st.get(c.id).note ? ' - ' + st.get(c.id).note : ''}`).join('\n') || '  none'}${bad.length ? '\n\nLINES NOT UNDERSTOOD\n' + bad.map((x) => '  ' + x).join('\n') : ''}\n\nScope and limits: the list is the WCAG 2.1 level A and AA criteria (plus Parsing, 4.1.1) that EN 301 549 V3.2.1 maps to clause 9 as "9." plus the WCAG number. Clause 9 covers web content only. EN 301 549 also has requirements for non-web documents (10), software (11), documentation and support (12) and functional performance (4), which this tool does not list. The European Accessibility Act (Directive (EU) 2019/882) applies to products and services from 28 June 2025; which parts apply to you, and any exemptions (for example for very small businesses providing services), are legal questions this tool cannot answer. The clause mapping was derived from the WCAG 2.2 text and the author's knowledge of EN 301 549 V3.2.1; the standard itself was not available to check. A status here is your own assessment, not a test result.`;
  },
});
const ACR_ST = { supports: 'Supports', yes: 'Supports', pass: 'Supports', partial: 'Partially Supports', partially: 'Partially Supports', part: 'Partially Supports', no: 'Does Not Support', not: 'Does Not Support', fail: 'Does Not Support', na: 'Not Applicable', 'n/a': 'Not Applicable', ne: 'Not Evaluated', 'not-evaluated': 'Not Evaluated' };
T.push({
  id: 'vpat-acr-builder', cat: 'Accessibility', title: 'VPAT / ACR Builder: WCAG 2.2 Conformance Report Tables',
  desc: 'Enter a conformance level and remarks per WCAG 2.2 success criterion and get an Accessibility Conformance Report with product details and Level A, AA and AAA tables in Markdown.',
  labels: ['One criterion per line: number level remarks (supports, partial, no, na, ne)'], placeholder: ['1.1.1 supports Alt text on all images\n1.4.3 partial Footer text 3.9:1'],
  sample: '1.1.1 supports All images have alt text\n1.2.2 no Older videos have no captions\n1.3.1 partial Some data tables lack header cells\n1.4.3 partial Footer links have 3.9:1 contrast\n2.1.1 supports\n2.4.7 supports\n2.5.8 partial Icon buttons are 20 by 20 px\n3.3.8 na No login on this site\n4.1.2 supports',
  opts: [{ id: 'product', label: 'Product name and version', type: 'text', def: 'Example App 4.2' }, { id: 'date', label: 'Report date', type: 'text', def: '2026-01-15' }, { id: 'contact', label: 'Contact', type: 'text', def: 'accessibility@example.org' }, { id: 'method', label: 'Evaluation methods', type: 'text', def: 'Manual testing with NVDA and VoiceOver, keyboard testing, automated checks.' }, { id: 'unrated', label: 'Level A and AA criteria you leave out are shown as', type: 'select', def: 'Not Evaluated', choices: ['Not Evaluated', 'leave them out'] }],
  run([s], o) {
    need(s, 'criterion lines'); const idx = new Map(WCAG22.map((c) => [c[0], c])), st = new Map(), bad = [];
    for (const line of s.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const m = /^(\d\.\d+\.\d+)\s+(\S+)\s*(.*)$/.exec(line); if (!m) { bad.push(line); continue; }
      const c = idx.get(m[1]), v = ACR_ST[m[2].toLowerCase()]; if (!c) { bad.push(line + '  (no such WCAG 2.2 criterion)'); continue; } if (!v) { bad.push(line + '  (use supports, partial, no, na or ne)'); continue; }
      st.set(m[1], { v, note: m[3] });
    }
    const out = [`# Accessibility Conformance Report`, '', `**Product:** ${o.product}  `, `**Report date:** ${o.date}  `, `**Contact:** ${o.contact}  `, `**Standard:** WCAG 2.2  `, `**Evaluation methods:** ${o.method}`, ''];
    const tot = {};
    for (const lv of ['A', 'AA', 'AAA']) {
      out.push(`## Table: WCAG 2.2 Level ${lv}`, '', '| Criteria | Conformance level | Remarks and explanations |', '| --- | --- | --- |');
      for (const c of WCAG22.filter((x) => x[2] === lv)) {
        const r = st.get(c[0]); if (!r && o.unrated !== 'Not Evaluated') continue;
        const v = r ? r.v : 'Not Evaluated'; tot[v] = (tot[v] || 0) + 1;
        out.push(`| ${c[0]} ${c[1]}${c[5] ? ' (new in 2.2)' : ''} | ${v} | ${(r && r.note ? r.note : '').replace(/\|/g, '\\|')} |`);
      }
      out.push('');
    }
    out.push('**Totals:** ' + Object.entries(tot).map(([k, n]) => `${k} ${n}`).join(', '), '');
    if (bad.length) out.push('Lines not understood:', ...bad.map((x) => '- ' + x), '');
    out.push('_Terms follow the ITI VPAT 2.x conformance levels (Supports, Partially Supports, Does Not Support, Not Applicable, Not Evaluated). Check the current official template and its wording before you publish, and remember that Not Evaluated is meant for Level AAA criteria only. Note: 4.1.1 Parsing was removed in WCAG 2.2 and is not in the tables. This report records your own findings; the tool tests nothing._');
    return out.join('\n');
  },
});

// ---------- WCAG explorer ----------
T.push({
  id: 'wcag-success-criteria-explorer', cat: 'Accessibility', title: 'WCAG 2.2 Success Criteria Explorer and Reference',
  desc: 'Search all 86 WCAG 2.2 success criteria by number, name or words and filter by level, principle or what is new in 2.2, with the opening line of each criterion and a link to its Understanding page.',
  labels: ['Search words or a number (optional)'], placeholder: ['contrast, 2.5, keyboard'], sample: 'focus',
  opts: [{ id: 'level', label: 'Level', type: 'select', def: 'all', choices: ['all', 'A', 'AA', 'A and AA', 'AAA'] }, { id: 'pr', label: 'Principle', type: 'select', def: 'all', choices: ['all', '1 Perceivable', '2 Operable', '3 Understandable', '4 Robust'] }, { id: 'new', label: 'Only criteria new in WCAG 2.2', type: 'checkbox', def: false }],
  run([s], o) {
    const q = (s || '').trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    const list = WCAG22.filter((c) => (o.level === 'all' || (o.level === 'A and AA' ? c[2] !== 'AAA' : c[2] === o.level)) && (o.pr === 'all' || c[0][0] === o.pr[0]) && (!o.new || c[5]) && q.every((w) => (c[0] + ' ' + c[1] + ' ' + c[3]).toLowerCase().includes(w) || (/^[\d.]+$/.test(w) && c[0].startsWith(w))));
    if (!list.length) return 'No criteria match. Try fewer words or reset the filters.';
    return `${list.length} of 86 success criteria\n\n${list.map((c) => `${c[0]}  ${c[1]}  [${c[2]}]${c[5] ? '  NEW in 2.2' : ''}\n    ${c[3]}\n    https://www.w3.org/WAI/WCAG22/Understanding/${c[4]}.html`).join('\n\n')}\n\nSource: Web Content Accessibility Guidelines 2.2 (W3C Recommendation), read in October 2026. Only the opening sentence of each criterion is shown, and many criteria continue with exceptions and lists, so read the full text on the W3C page before you decide that something passes. 4.1.1 Parsing is obsolete and removed in 2.2. Levels: A is the minimum, AA is the usual legal target, AAA is not required for whole sites.`;
  },
});

// ---------- autocomplete helper ----------
const AC_RULES = [[/(^|[^a-z])(e-?mail|mail)\b/, 'email'], [/one.?time|otp|verification.?code|2fa|sms.?code/, 'one-time-code'], [/(name.?on.?card|card.?holder|cc.?name)/, 'cc-name'], [/(card.?(num|no)|cc.?num|credit.?card|pan\b)/, 'cc-number'], [/(cvv|cvc|csc|security.?code)/, 'cc-csc'], [/(exp(iry|iration)?.?(date)?|valid.?(thru|until))/, 'cc-exp'], [/(first.?name|given.?name|fname|forename|vorname|prenom|prénom)/, 'given-name'], [/(last.?name|family.?name|surname|lname|nachname)/, 'family-name'], [/(middle.?name|additional.?name)/, 'additional-name'], [/(full.?name|your.?name|^name$|\bname\b)/, 'name'], [/(user.?name|login|user.?id|userid)/, 'username'], [/(job.?title|position|role\b)/, 'organization-title'], [/(company|organi[sz]ation|employer|business.?name)/, 'organization'], [/(address.?(line)?.?2|apt|apartment|suite|unit\b|flat)/, 'address-line2'], [/(address.?(line)?.?1|street|address)/, 'street-address'], [/(zip|post(al)?.?code|postcode|plz)/, 'postal-code'], [/(city|town|locality)/, 'address-level2'], [/(state|province|region|county)/, 'address-level1'], [/country/, 'country'], [/(birth|dob|bday)/, 'bday'], [/(phone|mobile|tel\b|telephone|cell)/, 'tel'], [/(website|homepage|\burl\b)/, 'url'], [/(gender|sex)\b/, 'sex'], [/(language|lang\b)/, 'language']];
const AC_SECTION = new Set(['shipping', 'billing']), AC_CONTACT = new Set(['home', 'work', 'mobile', 'fax', 'pager']), AC_NOCONTACT = new Set(['name', 'honorific-prefix', 'given-name', 'additional-name', 'family-name', 'honorific-suffix', 'nickname', 'username', 'new-password', 'current-password', 'one-time-code']);
function acCheck(v) {
  const t = v.trim().toLowerCase().split(/\s+/).filter(Boolean); if (!t.length) return 'empty value';
  if (t.length === 1 && (t[0] === 'on' || t[0] === 'off')) return null;
  let i = 0; if (t[i] && t[i].startsWith('section-')) i++; if (AC_SECTION.has(t[i])) i++;
  if (AC_CONTACT.has(t[i])) { i++; if (!['tel', 'tel-country-code', 'tel-national', 'tel-area-code', 'tel-local', 'tel-local-prefix', 'tel-local-suffix', 'tel-extension', 'email', 'impp'].includes(t[i])) return `"${t[i - 1]}" can only be followed by tel, email or impp fields`; }
  if (t[i] === 'webauthn' && i === t.length - 1) return null;
  if (!AUTOCOMPLETE_TOKENS.includes(t[i])) return `"${t[i] || ''}" is not an autofill field name`;
  if (t.length > i + 1 && t[i + 1] !== 'webauthn') return `unexpected token "${t[i + 1]}"`;
  return null;
}
T.push({
  id: 'autocomplete-attribute-helper', cat: 'Accessibility', title: 'Autocomplete Attribute Helper for WCAG 1.3.5 Input Purposes',
  desc: 'Paste a form and get the correct autocomplete value for each field from its name, id, type and label, with existing values validated against the HTML autofill field names.',
  labels: ['HTML form'], sample: '<form><label for="fn">First name</label><input id="fn" name="fname">\n<label for="ln">Surname</label><input id="ln" name="lastname" autocomplete="family-name">\n<label for="em">Email</label><input id="em" type="email" name="email" autocomplete="mail">\n<label for="pw">Password</label><input id="pw" type="password" name="pw">\n<label for="zip">ZIP code</label><input id="zip" name="zip">\n<label for="cc">Card number</label><input id="cc" name="cardnumber" autocomplete="off">\n<label for="q">Search</label><input id="q" type="search" name="q"></form>',
  run([s]) {
    need(s); const root = parseHTML(s), c = ctxOf(root), rows = [['Line', 'Field', 'Current', 'Suggested', 'Result']]; let n = 0, fix = 0;
    for (const e of all(root)) {
      const t = (e.attrs.type || 'text').toLowerCase();
      if (!['input', 'select', 'textarea'].includes(e.tag) || ['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'file', 'range', 'color'].includes(t) || isHidden(e)) continue; n++;
      const label = accNameOf(e, c).name, hay = [e.attrs.name, e.attrs.id, label, e.attrs.placeholder].filter(Boolean).join(' ').toLowerCase().replace(/[_\[\].-]+/g, ' ');
      let guess = null;
      if (t === 'email') guess = 'email'; else if (t === 'tel') guess = 'tel'; else if (t === 'url') guess = 'url'; else if (t === 'password') guess = /new|confirm|repeat|choose|create|retype/.test(hay) ? 'new-password' : 'current-password';
      else if (t === 'search') guess = null; else for (const [re, g] of AC_RULES) if (re.test(hay)) { guess = g; break; }
      if (guess === 'country' && e.tag === 'select') guess = 'country'; if (guess === 'name' && /(card|company|user)/.test(hay)) guess = /card/.test(hay) ? 'cc-name' : guess;
      const cur = e.attrs.autocomplete, err = cur !== undefined ? acCheck(cur) : null;
      let res; if (cur === undefined) { res = guess ? 'ADD' : 'no personal data guessed (fine if the field is not about the user)'; if (guess) fix++; } else if (err) { res = 'INVALID: ' + err; fix++; } else if (cur.trim().toLowerCase() === 'off' && guess) { res = 'REVIEW: "off" blocks autofill on a field about the user (1.3.5 expects a valid purpose)'; fix++; } else if (guess && !cur.toLowerCase().split(/\s+/).includes(guess)) { res = 'REVIEW: differs from the guess'; fix++; } else res = 'OK';
      rows.push([lineOf(root, e), '<' + e.tag + (e.attrs.name ? ' name=' + e.attrs.name : e.attrs.id ? ' #' + e.attrs.id : '') + '>', cur === undefined ? '-' : cur, guess || '-', res]);
    }
    if (!n) throw new Error('No form fields found.');
    return `${tbl(rows)}\n\n${n} field${n === 1 ? '' : 's'}, ${fix} to change or review.\n\nWCAG 1.3.5 Identify Input Purpose (AA) applies to fields that collect information about the user (name, address, email, phone, card and so on) and asks that the purpose can be set programmatically; autocomplete with the HTML autofill field names does that. It does not apply to search boxes, coupon codes or fields about someone else (use a different token set there or "off"). Suggestions come from keywords in the name, id, label and placeholder, so check each one. The ${AUTOCOMPLETE_TOKENS.length} field names, the section-, shipping/billing and home/work/mobile/fax/pager prefixes and "webauthn" are from the HTML Standard (read in October 2026).`;
  },
});

// ---------- error message builder ----------
T.push({
  id: 'accessible-error-message-builder', cat: 'Accessibility', title: 'Accessible Form Error Message Builder (aria-describedby and Error Summary)',
  desc: 'List fields and their error messages and get markup with aria-invalid, aria-describedby, an error summary that links to each field, and the small script that moves focus to it.',
  labels: ['One field per line: id | label | error message'], placeholder: ['email | Email address | Enter an email address in the format name@example.com'],
  sample: 'email | Email address | Enter an email address, like name@example.com\npassword | Password | Password must be at least 12 characters\nterms | Terms | Accept the terms to continue',
  opts: [{ id: 'summary', label: 'Add an error summary at the top', type: 'checkbox', def: true }, { id: 'script', label: 'Include the focus script', type: 'checkbox', def: true }, { id: 'prefix', label: 'Visually hidden prefix before each message', type: 'text', def: 'Error:' }],
  run([s], o) {
    need(s, 'at least one field'); const f = s.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const p = l.split('|').map((x) => x.trim()); if (p.length < 3 || !p[0] || !p[1] || !p[2]) throw new Error('Use: id | label | message (got "' + clip(l, 40) + '")'); if (!/^[A-Za-z][\w:.-]*$/.test(p[0])) throw new Error('"' + p[0] + '" is not a valid id.'); return p; });
    const pre = o.prefix.trim() ? `<span class="visually-hidden">${esc(o.prefix.trim())} </span>` : '';
    const sum = o.summary ? `<div id="error-summary" class="error-summary" role="alert" tabindex="-1">\n  <h2>There is a problem</h2>\n  <ul>\n${f.map(([id, , m]) => `    <li><a href="#${id}">${esc(m)}</a></li>`).join('\n')}\n  </ul>\n</div>\n\n` : '';
    const fields = f.map(([id, l, m]) => `<div class="field field--error">\n  <label for="${id}">${esc(l)}</label>\n  <p id="${id}-error" class="error-message">${pre}${esc(m)}</p>\n  <input id="${id}" name="${id}" aria-invalid="true" aria-describedby="${id}-error">\n</div>`).join('\n\n');
    const css = `.visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}\n.error-message{color:#b3261e;font-weight:600}\n.field--error input{border:3px solid #b3261e}\n.error-summary{border:4px solid #b3261e;padding:1rem}`;
    const js = o.script && o.summary ? `\n\n<script>\n// after validation fails and the summary is rendered:\ndocument.getElementById('error-summary').focus();\n</script>` : '';
    return `${sum}${fields}\n\n/* CSS: error colour is paired with a thick border and bold text, so colour is not the only cue */\n${css}${js}\n\nHow it works: each message is tied to its field with aria-describedby, so a screen reader reads it when the field gets focus; aria-invalid="true" announces the state. The summary has role="alert" and takes focus so users hear that the form failed and can jump to each field by its link (WCAG 3.3.1 Error Identification, 3.3.3 Error Suggestion, 4.1.3 Status Messages). Remove aria-invalid and the message when the value is fixed. Do not use only red text, and do not rely on the title attribute or on placeholder text for errors. Write messages that say what to do. The colour #b3261e gives 6.5:1 on white: re-check it on your background.`;
  },
});

// ---------- dyslexia-friendly typography preview ----------
const FONTS = { 'sans-serif (system)': 'system-ui, sans-serif', Arial: 'Arial, Helvetica, sans-serif', Verdana: 'Verdana, Geneva, sans-serif', Tahoma: 'Tahoma, Geneva, sans-serif', 'Trebuchet MS': '"Trebuchet MS", sans-serif', Georgia: 'Georgia, serif', 'Times New Roman': '"Times New Roman", serif', 'Comic Sans MS': '"Comic Sans MS", "Comic Sans", cursive', 'Courier New': '"Courier New", monospace' };
T.push({
  id: 'readable-typography-previewer', cat: 'Accessibility', title: 'Readable Typography Previewer: Font, Spacing and Line Length for Dyslexia',
  desc: 'Paste text and preview it with adjustable font, size, letter, word and line spacing, line length, colours and alignment, with the text contrast checked and the CSS to copy.',
  labels: ['Text to preview'], sample: 'Reading is easier when the page gives words room to breathe. Short lines, generous spacing and a calm background help many readers, including people with dyslexia, low vision or a tired eye.\n\nChange the settings on the left and compare. What works varies from person to person, so let your readers adjust the text themselves where you can.',
  opts: [
    { id: 'font', label: 'Font', type: 'select', def: 'Verdana', choices: Object.keys(FONTS) },
    { id: 'size', label: 'Size (px)', type: 'number', def: 18 },
    { id: 'ls', label: 'Letter spacing (em)', type: 'number', def: 0.05 },
    { id: 'ws', label: 'Word spacing (em)', type: 'number', def: 0.16 },
    { id: 'lh', label: 'Line height', type: 'number', def: 1.6 },
    { id: 'ch', label: 'Line length (characters)', type: 'number', def: 60 },
    { id: 'ps', label: 'Space between paragraphs (em)', type: 'number', def: 1.5 },
    { id: 'fg', label: 'Text colour', type: 'text', def: '#222222' },
    { id: 'bg', label: 'Background colour', type: 'text', def: '#faf6e9' },
    { id: 'align', label: 'Alignment', type: 'select', def: 'left', choices: ['left', 'justify'] }],
  run([s], o) {
    need(s, 'some text'); const fg = parseColor(o.fg), bg = parseColor(o.bg), n = (v, a, b, nm) => { const x = Number(v); if (!(x >= a && x <= b)) throw new Error(nm + ' must be between ' + a + ' and ' + b + '.'); return x; };
    const size = n(o.size, 10, 48, 'Size'), ls = n(o.ls, 0, 0.5, 'Letter spacing'), ws = n(o.ws, 0, 1, 'Word spacing'), lh = n(o.lh, 1, 3, 'Line height'), ch = n(o.ch, 20, 120, 'Line length'), ps = n(o.ps, 0, 4, 'Paragraph spacing');
    const css = `font-family: ${FONTS[o.font]};\nfont-size: ${size}px;\nletter-spacing: ${ls}em;\nword-spacing: ${ws}em;\nline-height: ${lh};\nmax-width: ${ch}ch;\ncolor: ${hex(fg)};\nbackground: ${hex(bg)};\ntext-align: ${o.align};\n/* paragraphs: margin-bottom: ${ps}em; */`;
    const html = `<!doctype html><meta charset="utf-8"><style>html{background:${hex(bg)}}body{margin:0;padding:1.5rem;font-family:${FONTS[o.font]};font-size:${size}px;letter-spacing:${ls}em;word-spacing:${ws}em;line-height:${lh};color:${hex(fg)};background:${hex(bg)};text-align:${o.align}}main{max-width:${ch}ch}p{margin:0 0 ${ps}em}</style><main>${s.split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')}</main>`;
    const cr = ratio(fg, bg);
    return { html, text: `Text contrast ${cr.toFixed(2)}:1 (${cr >= 7 ? 'AAA' : cr >= 4.5 ? 'passes AA' : 'FAILS AA, needs 4.5:1'}). Pure black on pure white can glare for some readers; soft off-white backgrounds with dark grey text are a common choice and keep good contrast.\n\nCSS\n${css}\n\nCommonly given advice (for example in dyslexia style guides): sans-serif fonts, about 12 to 14 pt or larger, extra letter and word spacing, line height around 1.5, left-aligned text, short lines, no italics or long capitalised passages, and no justified text. Research on special "dyslexia fonts" is mixed; spacing, size and layout matter more than the font name, and individual preference differs. Fonts shown are those installed on your device, and OpenDyslexic or Lexend are not included. Whatever you choose, do not stop users from changing text size and spacing (WCAG 1.4.4, 1.4.12).` };
  },
});

export default T;

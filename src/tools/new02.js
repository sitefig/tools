// Tools from free-browser-tools.md, batch 02 (sitemaps and on-page SEO). See TOOLS.md for the contract.
// All input is pasted or a local file; nothing is fetched. HTML and XML are read with small regex helpers so the
// pure tools run under Node. Facts used (checked against the vendor docs on 2026-10-23): sitemaps.org protocol
// (50,000 URLs / 50 MB / URL < 2048 chars / index up to 50,000 sitemaps), Google image, video, news, text sitemap docs,
// Google redirect and pagination docs, Facebook and LinkedIn image docs.
//
// SKIPPED (need a server, account or live network): Wayback and Common Crawl URL lists, Search Console reports and
// submission, URL Inspection, IndexNow submission, Wikidata lookup, Lighthouse runs.

const T = [];
const tool = (t) => T.push(t);

// ---------- shared helpers ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const dec = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { try { return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)); } catch { return m; } }
  return ENT[e.toLowerCase()] ?? m;
});
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const strip = (s) => dec(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const need = (s, what = 'input') => { if (!String(s ?? '').trim()) throw new Error(`Paste ${what} first.`); return String(s); };
const lines = (t) => String(t).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const isAbs = (u) => /^https?:\/\/[^\s/]+/i.test(u);
const tryUrl = (u, base) => { try { return new URL(u, base); } catch { return null; } };
const parseAttrs = (s) => {
  const o = {};
  s.replace(/([^\s=\/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, (m, k, a, b, c) => { k = k.toLowerCase(); if (!(k in o)) o[k] = dec(a ?? b ?? c ?? ''); return m; });
  return o;
};
const tags = (html, name) => [...html.matchAll(new RegExp(`<(?:${name})\\b([^>]*)>`, 'gi'))].map((m) => ({ a: parseAttrs(m[1]), i: m.index, raw: m[0] }));
const pairs = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)</${name}\\s*>`, 'gi'))].map((m) => ({ a: parseAttrs(m[1]), inner: m[2], text: strip(m[2]), i: m.index }));
const bodyText = (html) => dec(html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const table = (rows, cols) => {
  const w = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => String(r[i] ?? '').length)));
  const line = (r) => r.map((c, i) => String(c ?? '').padEnd(w[i])).join('  ').trimEnd();
  return [line(cols), line(w.map((n) => '-'.repeat(n))), ...rows.map(line)].join('\n');
};
const SEV = { ERROR: 0, WARN: 1, REVIEW: 1, INFO: 2, OK: 3 };
const issues = (list) => list.slice().sort((a, b) => SEV[a[0]] - SEV[b[0]]).map(([s, m]) => `[${s}] ${m}`).join('\n') || '[OK] No issues found.';
const head = (t) => `\n=== ${t} ===\n`;
const pct = (n, d) => (d ? (100 * n / d).toFixed(1) : '0.0') + '%';
const bar = (n, max, w = 36) => '#'.repeat(max ? Math.max(n ? 1 : 0, Math.round(w * n / max)) : 0);
const today = () => new Date().toISOString().slice(0, 10);
const LIMIT_URLS = 50000, LIMIT_BYTES = 52428800;
const bytesOf = (s) => new TextEncoder().encode(s).length;
const kb = (n) => n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1024).toFixed(1) + ' KB';

// W3C datetime (the profile of ISO 8601 that sitemaps use): YYYY, YYYY-MM, YYYY-MM-DD, or with Thh:mm[:ss[.s]] and a zone.
const W3C = /^(\d{4})(?:-(\d\d)(?:-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?(Z|[+-]\d\d:\d\d))?)?)?$/;
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
function parseW3C(v) { // -> { ms, hasTime } or null
  const m = String(v).trim().match(W3C); if (!m) return null;
  const [, Y, M, D, h, mi, s, z] = m, y = +Y, mo = M ? +M : 1, d = D ? +D : 1;
  if (mo < 1 || mo > 12 || d < 1 || d > dim(y, mo)) return null;
  if (h != null && (+h > 23 || +mi > 59 || (s != null && +s > 59))) return null;
  if (z && z !== 'Z' && (+z.slice(1, 3) > 23 || +z.slice(4) > 59)) return null;
  const ms = Date.parse(h != null ? v.trim() : `${Y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  return Number.isNaN(ms) ? null : { ms, hasTime: h != null };
}
const nowMs = (s) => { if (s && String(s).trim()) { const t = Date.parse(String(s).trim()); if (Number.isNaN(t)) throw new Error('"Now" is not a valid date.'); return t; } return Date.now(); };

// Read a sitemap (urlset or index) or a plain URL list into entries.
function readSitemap(text) {
  const x = String(text).replace(/<!--[\s\S]*?-->/g, '');
  const tagv = (b, n) => { const m = b.match(new RegExp(`<${n}>\\s*([\\s\\S]*?)\\s*</${n}>`, 'i')); return m ? dec(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim() : undefined; };
  if (!/<(urlset|sitemapindex|url|sitemap)\b/i.test(x)) {
    const entries = lines(x).filter((l) => !l.startsWith('#')).map((l) => { const p = l.split(/\s+/); return { loc: p[0], lastmod: p[1], images: [], alts: [], videos: 0 }; });
    return { kind: 'list', index: false, entries };
  }
  const index = /<sitemapindex\b/i.test(x);
  const entries = [...x.matchAll(/<(url|sitemap)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map((m) => {
    const b = m[2];
    return {
      loc: tagv(b, 'loc'), lastmod: tagv(b, 'lastmod'), changefreq: tagv(b, 'changefreq'), priority: tagv(b, 'priority'),
      images: [...b.matchAll(/<image:loc>\s*([\s\S]*?)\s*<\/image:loc>/gi)].map((i) => dec(i[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim()),
      alts: tags(b, 'xhtml:link').filter((t) => /alternate/i.test(t.a.rel || '')).map((t) => ({ lang: t.a.hreflang || '', href: t.a.href || '' })),
      videos: (b.match(/<video:video\b/gi) || []).length,
      newsTitle: tagv(b, 'news:title'), newsDate: tagv(b, 'news:publication_date'),
    };
  });
  return { kind: 'xml', index, entries };
}
const needEntries = (t, what = 'a sitemap or URL list') => { const r = readSitemap(need(t, what)); r.entries = r.entries.filter((e) => e.loc); if (!r.entries.length) throw new Error('No URLs found.'); return r; };

// CSV: comma, semicolon or tab; quotes with "" escapes.
function parseCsv(text) {
  const t = String(text).replace(/^\uFEFF/, ''), first = t.split(/\r?\n/)[0] || '';
  const d = [',', ';', '\t'].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === '') q = true;
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else f += c;
  }
  row.push(f); if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}
const csvCell = (v) => { v = String(v ?? ''); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
const colIndex = (header, spec, re, what) => { // spec: name, 1-based number, or '' for auto
  spec = String(spec ?? '').trim();
  if (spec) { if (/^\d+$/.test(spec)) { const n = +spec - 1; if (n >= header.length) throw new Error(`${what}: column ${spec} does not exist.`); return n; } const i = header.findIndex((h) => h.trim().toLowerCase() === spec.toLowerCase()); if (i < 0) throw new Error(`${what}: no column named "${spec}".`); return i; }
  return header.findIndex((h) => re.test(h.trim().toLowerCase()));
};

// robots.txt matching (Google rules: most specific user-agent group, longest matching path wins, Allow wins ties)
function parseRobots(text) {
  const groups = [], sitemaps = []; let cur = null, lastUA = false;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.replace(/#.*/, '').trim(), m = l.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!cur || !lastUA) groups.push(cur = { uas: [], rules: [] }); cur.uas.push(v.toLowerCase()); lastUA = true; continue; }
    lastUA = false;
    if (k === 'sitemap') sitemaps.push(v);
    else if ((k === 'allow' || k === 'disallow') && cur) cur.rules.push({ type: k, path: v });
  }
  return { groups, sitemaps };
}
const pathRe = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$').replace(/\$(?!$)/g, '\\$'));
function robotsDecision(rb, ua, path) {
  ua = ua.toLowerCase(); let best = -1, sel = [];
  for (const g of rb.groups) for (const t of g.uas) { const s = t === '*' ? 0 : ua.includes(t) ? t.length : -1; if (s < 0) continue; if (s > best) { best = s; sel = [g]; } else if (s === best && !sel.includes(g)) sel.push(g); }
  if (!sel.length) return { ok: true, why: 'no matching group' };
  let hit = null;
  for (const g of sel) for (const r of g.rules) {
    if (!r.path || !pathRe(r.path).test(path)) continue;
    if (!hit || r.path.length > hit.path.length || (r.path.length === hit.path.length && r.type === 'allow')) hit = r;
  }
  return hit ? { ok: hit.type === 'allow', why: `${hit.type === 'allow' ? 'Allow' : 'Disallow'}: ${hit.path}` } : { ok: true, why: 'no matching rule' };
}

// Arial-ish advance widths (em) -> estimated pixels. Approximation only; search engines use their own fonts.
const px = (s, size) => {
  let w = 0;
  for (const c of s) {
    w += /[ijl.,:;'|!I\u2019 ft]/.test(c) ? 0.27 : /[r()\-[\]{}"]/.test(c) ? 0.34 : c === 'm' || c === 'M' ? 0.83 : c === 'W' ? 0.94 : c === 'w' ? 0.72
      : /[A-Z]/.test(c) ? 0.69 : /[a-z]/.test(c) ? 0.54 : /[0-9]/.test(c) ? 0.556 : c.charCodeAt(0) > 0x2e80 ? 1 : 0.6;
  }
  return Math.round(w * size);
};

// stored (uncompressed) ZIP writer
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zipStore(files) { // files: [{ name, data: string }]
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
  const d = new Date(), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  for (const f of files) {
    const n = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, tm, true); lh.setUint16(12, dt, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, n.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), n, data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, tm, true); ch.setUint16(14, dt, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, n.length, true); ch.setUint32(42, off, true);
    cd.push(new Uint8Array(ch.buffer), n); off += 30 + n.length + data.length;
  }
  const cdLen = cd.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdLen, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cd, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

const SM_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const SM_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="${SM_NS}">
  <url><loc>https://example.com/</loc><lastmod>2026-09-01</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://example.com/blog/first-post</loc><lastmod>2026-09-01</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>
  <url><loc>https://example.com/blog/second-post/</loc><lastmod>2026-09-01</lastmod><priority>0.5</priority></url>
  <url><loc>https://example.com/products?id=7&amp;sort=asc</loc><lastmod>2026-09-01</lastmod><priority>0.5</priority></url>
  <url><loc>http://www.example.com/admin/login</loc><lastmod>2026-09-01</lastmod><priority>0.5</priority></url>
  <url><loc>https://example.com/about#team</loc><lastmod>2025-01-15</lastmod><priority>0.5</priority></url>
</urlset>`;
const URLS_SAMPLE = 'https://example.com/\nhttps://example.com/about\nhttps://example.com/blog/first-post\nhttps://example.com/blog/second-post\nhttps://example.com/contact';

// ======================= SITEMAPS =======================

tool({
  id: 'sitemap-index-generator', cat: 'SEO – Generators', title: 'Sitemap Splitter and Index Generator', desc: 'Split a long URL list into sitemap files of at most 50,000 URLs (or 50 MB) and build the sitemap index. Download all parts as a ZIP.',
  labels: ['URLs, one per line'], sample: URLS_SAMPLE,
  opts: [{ id: 'base', label: 'Base URL where the files will live', type: 'text', def: 'https://example.com/sitemaps/' }, { id: 'per', label: 'Max URLs per file (up to 50000)', type: 'number', def: 50000 }, { id: 'name', label: 'File name prefix', type: 'text', def: 'sitemap' }, { id: 'lastmod', label: 'lastmod for index entries (today / none / YYYY-MM-DD)', type: 'text', def: 'today' }],
  run: ([t], { base, per, name, lastmod }) => {
    const urls = [...new Set(lines(need(t, 'URLs')))], bad = urls.filter((u) => !isAbs(u) || u.length >= 2048);
    if (bad.length) throw new Error(`Not absolute http(s) URLs (or 2048+ chars): ${bad.slice(0, 3).join(', ')}`);
    const b = String(base || '').trim(); if (!isAbs(b)) throw new Error('Base URL must start with http:// or https://');
    const baseUrl = b.endsWith('/') ? b : b + '/', cap = Math.min(Math.max(1, Math.floor(+per || LIMIT_URLS)), LIMIT_URLS), pre = String(name || 'sitemap').replace(/[^\w.-]/g, '-');
    const headX = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SM_NS}">\n`, tail = '</urlset>\n', files = [];
    let cur = [], size = bytesOf(headX + tail);
    const flush = () => { if (cur.length) { files.push(headX + cur.join('') + tail); cur = []; size = bytesOf(headX + tail); } };
    for (const u of urls) {
      const e = `  <url><loc>${xmlEsc(u)}</loc></url>\n`, eb = bytesOf(e);
      if (cur.length >= cap || size + eb > LIMIT_BYTES) flush();
      cur.push(e); size += eb;
    }
    flush();
    if (files.length > LIMIT_URLS) throw new Error('More than 50,000 files needed.');
    const lm = /^today$/i.test(String(lastmod).trim()) ? today() : parseW3C(lastmod || '') ? String(lastmod).trim() : '';
    const names = files.map((_, i) => `${pre}-${i + 1}.xml`);
    const idx = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${SM_NS}">\n${names.map((n) => `  <sitemap><loc>${xmlEsc(baseUrl + n)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</sitemap>\n`).join('')}</sitemapindex>\n`;
    const hosts = new Set(urls.map((u) => tryUrl(u)?.host)); const bh = tryUrl(baseUrl).host;
    const w = [...hosts].some((h) => h !== bh) ? '\n[REVIEW] Some URLs are on a different host than the base URL. A sitemap normally may only list URLs of the host and path it is served from (unless ownership is verified).' : '';
    const sum = table(names.map((n, i) => [n, files[i].split('<url>').length - 1, kb(bytesOf(files[i]))]), ['File', 'URLs', 'Size']);
    return { text: `${urls.length} unique URLs -> ${files.length} sitemap file(s) + 1 index.${w}\n\n${sum}\n\n=== ${pre}-index.xml ===\n${idx}\nUpload every file to ${baseUrl} and submit only the index. The ZIP has all files.`, blob: zipStore([...names.map((n, i) => ({ name: n, data: files[i] })), { name: `${pre}-index.xml`, data: idx }]), filename: `${pre}-files.zip` };
  },
});

tool({
  id: 'sitemap-limit-checker', cat: 'SEO – Technical', title: 'Sitemap Size and Limit Checker', desc: 'Count URLs and bytes in a sitemap against the 50,000 URL and 50 MB limits, see the percentage used and how many files you would need.',
  labels: ['Sitemap XML (or a URL list)'], sample: SM_SAMPLE,
  run: ([x]) => {
    need(x, 'sitemap XML'); const r = readSitemap(x), n = r.entries.filter((e) => e.loc).length, size = bytesOf(x);
    const what = r.index ? 'sitemaps in index' : 'URLs', st = (v, lim) => (v > lim ? 'OVER LIMIT' : v >= lim * 0.8 ? 'close (80%+)' : 'OK');
    const files = Math.max(1, Math.ceil(n / LIMIT_URLS), Math.ceil(size / LIMIT_BYTES));
    const avg = n ? size / n : 0, bySize = avg ? Math.floor(LIMIT_BYTES / avg) : 0;
    return `${r.kind === 'list' ? 'Plain URL list' : r.index ? 'Sitemap index' : 'URL sitemap'}\n\n${table([[what, n.toLocaleString('en'), LIMIT_URLS.toLocaleString('en'), pct(n, LIMIT_URLS), st(n, LIMIT_URLS)], ['Uncompressed size', `${size.toLocaleString('en')} B (${kb(size)})`, `${LIMIT_BYTES.toLocaleString('en')} B (50 MB)`, pct(size, LIMIT_BYTES), st(size, LIMIT_BYTES)]], ['Measure', 'Value', 'Limit', 'Used', 'Status'])}\n\nFiles needed to stay within both limits: ${files}${files > 1 ? ' (use a sitemap index, see the Sitemap Splitter and Index Generator)' : ''}\nAverage ${avg.toFixed(0)} bytes per entry; at that size one file holds about ${Math.min(bySize, LIMIT_URLS).toLocaleString('en')} entries.\n\nLimits from sitemaps.org: 50,000 URLs and 50 MB (52,428,800 bytes) uncompressed per file, whether or not you gzip it; an index may list 50,000 sitemaps. Size is measured on the pasted text, so line endings in the real file can change it slightly.`;
  },
});

tool({
  id: 'sitemap-gz-reader', cat: 'SEO – Technical', title: 'Gzipped Sitemap Reader (.xml.gz)', desc: 'Open a sitemap.xml.gz in your browser: unzip it, see formatted XML, URL count and size, and save it as plain .xml.',
  inputs: 0, dom: true, file: { accept: '.gz,.xml,application/gzip,application/x-gzip,text/xml,application/xml', multiple: false },
  run: async (_i, _o, files) => {
    const f = files && files[0]; if (!f) throw new Error('Choose a .xml.gz or .xml file.');
    const u8 = new Uint8Array(await f.arrayBuffer()); let xml, gz = u8[0] === 0x1f && u8[1] === 0x8b;
    if (gz) { try { xml = await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); } catch (e) { throw new Error('Not a valid gzip file: ' + e.message); } }
    else xml = new TextDecoder().decode(u8);
    if (!/<(urlset|sitemapindex)\b/i.test(xml)) throw new Error('The content is not a sitemap (no <urlset> or <sitemapindex>).');
    const r = readSitemap(xml), n = r.entries.filter((e) => e.loc).length, outBytes = bytesOf(xml);
    const pretty = xml.replace(/>\s*</g, '>\n<').split('\n'); let d = 0;
    const out = pretty.map((l) => { if (/^<\//.test(l)) d = Math.max(0, d - 1); const s = '  '.repeat(d) + l; if (/^<[^!?\/]/.test(l) && !/\/>$/.test(l) && !/<\/[^>]+>$/.test(l)) d++; return s; });
    const full = out.join('\n') + '\n', shown = out.length > 1500 ? out.slice(0, 1500).join('\n') + `\n... ${out.length - 1500} more lines (the download has them all)\n` : full;
    return { text: `${f.name}: ${gz ? `gzip, ${u8.length} bytes -> ${outBytes} bytes (${kb(outBytes)}) unzipped` : `plain XML, ${outBytes} bytes`}\n${r.index ? 'Sitemap index' : 'URL sitemap'} with ${n} ${r.index ? 'sitemaps' : 'URLs'}${n > LIMIT_URLS || outBytes > LIMIT_BYTES ? '  [OVER the 50,000 URL / 50 MB limit]' : ''}\n\n${shown}`, blob: new Blob([full], { type: 'application/xml' }), filename: f.name.replace(/\.gz$/i, '').replace(/(\.xml)?$/i, '.xml') };
  },
});

tool({
  id: 'sitemap-diff', cat: 'SEO – Technical', title: 'Sitemap Diff (Added, Removed, Changed URLs)', desc: 'Compare two sitemaps or URL lists: URLs added, removed and changed (lastmod, changefreq, priority, images). Also finds pages missing from a sitemap when you paste a crawl or archive list.',
  labels: ['Old sitemap (XML or URL list)', 'New sitemap (XML or URL list)'], inputs: 2,
  sample: SM_SAMPLE, sample2: SM_SAMPLE.replace('<lastmod>2025-01-15</lastmod>', '<lastmod>2026-02-01</lastmod>').replace('  <url><loc>http://www.example.com/admin/login</loc><lastmod>2026-09-01</lastmod><priority>0.5</priority></url>\n', '').replace('</urlset>', '  <url><loc>https://example.com/pricing</loc><lastmod>2026-10-01</lastmod></url>\n</urlset>'),
  opts: [{ id: 'norm', label: 'Ignore trailing slash and host case', type: 'checkbox', def: false }],
  run: ([a, b], { norm }) => {
    const A = needEntries(a, 'the old sitemap').entries, B = needEntries(b, 'the new sitemap').entries;
    const key = (u) => { if (!norm) return u; const p = tryUrl(u); return p ? p.protocol + '//' + p.host.toLowerCase() + (p.pathname.length > 1 ? p.pathname.replace(/\/$/, '') : '/') + p.search : u; };
    const ma = new Map(A.map((e) => [key(e.loc), e])), mb = new Map(B.map((e) => [key(e.loc), e]));
    const added = [...mb].filter(([k]) => !ma.has(k)).map(([, e]) => e), removed = [...ma].filter(([k]) => !mb.has(k)).map(([, e]) => e), changed = [];
    for (const [k, eb] of mb) { const ea = ma.get(k); if (!ea) continue; const ch = []; for (const f of ['lastmod', 'changefreq', 'priority']) if ((ea[f] || '') !== (eb[f] || '')) ch.push(`${f}: ${ea[f] || '(none)'} -> ${eb[f] || '(none)'}`); if (ea.images.join() !== eb.images.join()) ch.push(`images: ${ea.images.length} -> ${eb.images.length}`); if (ch.length) changed.push([eb.loc, ch.join('; ')]); }
    const sec = (title, arr) => `${head(`${title} (${arr.length})`)}${arr.length ? arr.join('\n') : '(none)'}`;
    return `Old: ${ma.size} URLs   New: ${mb.size} URLs   unchanged: ${mb.size - added.length - changed.length}${sec('Added', added.map((e) => e.loc + (e.lastmod ? `  [${e.lastmod}]` : '')))}${sec('Removed', removed.map((e) => e.loc))}${sec('Changed', changed.map(([u, c]) => `${u}\n    ${c}`))}\n\nTip: paste a crawl export, log URLs or an archive URL list as one side to find pages that are missing from the sitemap.`;
  },
});

const imgPages = (t) => { // "page | img | img" per line, same page merged
  const m = new Map();
  for (const l of lines(t)) { const p = l.split(/\s*\|\s*|\t/).map((s) => s.trim()).filter(Boolean); if (p.length < 2) throw new Error(`Line needs a page URL and at least one image URL: ${l.slice(0, 60)}`); (m.get(p[0]) || m.set(p[0], []).get(p[0])).push(...p.slice(1)); }
  return m;
};
tool({
  id: 'image-sitemap-generator', cat: 'SEO – Generators', title: 'Image Sitemap Generator', desc: 'Page URLs with their image URLs to an XML sitemap with image:image entries and the image namespace declared.',
  labels: ['"page URL | image URL | image URL ..." per line'], sample: 'https://example.com/products/shoe | https://example.com/img/shoe-1.jpg | https://example.com/img/shoe-2.jpg\nhttps://example.com/about | https://cdn.example.com/team.png',
  run: ([t]) => {
    const m = imgPages(need(t, 'page and image URLs')), bad = [...m].flatMap(([p, im]) => [p, ...im]).filter((u) => !isAbs(u) || u.length >= 2048);
    if (bad.length) throw new Error(`Not absolute http(s) URLs: ${bad.slice(0, 3).join(', ')}`);
    for (const [p, im] of m) if (im.length > 1000) throw new Error(`${p} has ${im.length} images; the limit is 1,000 per URL.`);
    if (m.size > LIMIT_URLS) throw new Error('Over 50,000 URLs.');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SM_NS}"\n    xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${[...m].map(([p, im]) => `  <url>\n    <loc>${xmlEsc(p)}</loc>\n${[...new Set(im)].map((i) => `    <image:image>\n      <image:loc>${xmlEsc(i)}</image:loc>\n    </image:image>\n`).join('')}  </url>\n`).join('')}</urlset>\n<!-- Google supports image:loc only; image:title, caption, geo_location and license are no longer documented. Images on another domain need both domains verified in Search Console. -->`;
  },
});

const VID_SAMPLE = `page: https://example.com/videos/grilling
thumbnail: https://example.com/thumbs/grilling.jpg
title: Grilling steaks for summer
description: How to grill a steak, step by step.
content: https://cdn.example.com/video/grilling.mp4
duration: 600
published: 2026-05-01
rating: 4.2
family_friendly: yes
tags: grilling, steak, summer

page: https://example.com/videos/salad
thumbnail: https://example.com/thumbs/salad.jpg
title: Summer salad
description: A quick salad.
player: https://example.com/embed/salad`;
tool({
  id: 'video-sitemap-generator', cat: 'SEO – Generators', title: 'Video Sitemap Generator', desc: 'Build a video sitemap from simple blocks (page, thumbnail, title, description, content or player URL). Checks the required fields and limits before it outputs XML.',
  labels: ['One block per video, blank line between. Keys: page, thumbnail, title, description, content, player, duration, published, expires, rating, views, family_friendly, live, requires_subscription, uploader, tags'], sample: VID_SAMPLE,
  run: ([t]) => {
    const blocks = need(t, 'video blocks').split(/\r?\n\s*\r?\n/).map((b) => Object.fromEntries(lines(b).map((l) => l.match(/^([\w]+)\s*:\s*(.*)$/)).filter(Boolean).map((m) => [m[1].toLowerCase(), m[2].trim()]))).filter((b) => Object.keys(b).length);
    const P = [], pages = new Map(), yn = (v) => /^(yes|no)$/i.test(v);
    blocks.forEach((b, i) => {
      const n = `Video ${i + 1}${b.title ? ` ("${b.title.slice(0, 30)}")` : ''}`;
      for (const k of ['page', 'thumbnail', 'title', 'description']) if (!b[k]) P.push(`${n}: missing ${k}`);
      if (!b.content && !b.player) P.push(`${n}: needs content or player URL`);
      for (const k of ['page', 'thumbnail', 'content', 'player']) if (b[k] && !isAbs(b[k])) P.push(`${n}: ${k} is not an absolute http(s) URL`);
      if (b.player && b.player === b.page) P.push(`${n}: player URL must not equal the page URL`);
      if (b.description && b.description.length > 2048) P.push(`${n}: description over 2048 characters`);
      if (b.duration && !(/^\d+$/.test(b.duration) && +b.duration >= 1 && +b.duration <= 28800)) P.push(`${n}: duration must be 1 to 28800 seconds`);
      if (b.rating && !(+b.rating >= 0 && +b.rating <= 5)) P.push(`${n}: rating must be 0.0 to 5.0`);
      for (const k of ['published', 'expires']) if (b[k] && !parseW3C(b[k])) P.push(`${n}: ${k} must be a W3C date (2026-05-01 or 2026-05-01T10:00:00+02:00)`);
      for (const k of ['family_friendly', 'live', 'requires_subscription']) if (b[k] && !yn(b[k])) P.push(`${n}: ${k} must be yes or no`);
      if (b.uploader && b.uploader.length > 255) P.push(`${n}: uploader over 255 characters`);
      const tg = (b.tags || '').split(',').map((s) => s.trim()).filter(Boolean); if (tg.length > 32) P.push(`${n}: more than 32 tags`);
      if (b.page) (pages.get(b.page) || pages.set(b.page, []).get(b.page)).push({ ...b, tg });
    });
    if (!blocks.length) throw new Error('No video blocks found.');
    if (P.length) throw new Error(P.slice(0, 5).join(' | ') + (P.length > 5 ? ` (+${P.length - 5} more)` : ''));
    const el = (k, v) => `      <video:${k}>${xmlEsc(v)}</video:${k}>\n`;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SM_NS}"\n    xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${[...pages].map(([p, vs]) => `  <url>\n    <loc>${xmlEsc(p)}</loc>\n${vs.map((v) => `    <video:video>\n${el('thumbnail_loc', v.thumbnail)}${el('title', v.title)}${el('description', v.description)}${v.content ? el('content_loc', v.content) : ''}${v.player ? el('player_loc', v.player) : ''}${v.duration ? el('duration', v.duration) : ''}${v.expires ? el('expiration_date', v.expires) : ''}${v.rating ? el('rating', v.rating) : ''}${v.views ? el('view_count', v.views) : ''}${v.published ? el('publication_date', v.published) : ''}${v.family_friendly ? el('family_friendly', v.family_friendly.toLowerCase()) : ''}${v.requires_subscription ? el('requires_subscription', v.requires_subscription.toLowerCase()) : ''}${v.uploader ? el('uploader', v.uploader) : ''}${v.live ? el('live', v.live.toLowerCase()) : ''}${v.tg.map((x) => el('tag', x)).join('')}    </video:video>\n`).join('')}  </url>\n`).join('')}</urlset>\n<!-- Text values are XML-escaped. Required by Google: thumbnail_loc, title, description (max 2048) and content_loc or player_loc. restriction and platform elements are not generated here. -->`;
  },
});

const newsAge = (ms, now) => (now - ms) / 36e5;
tool({
  id: 'news-sitemap-generator', cat: 'SEO – Generators', title: 'Google News Sitemap Generator', desc: 'Build a news sitemap with publication name, language, title and publication date for each article, using the Google News namespace.',
  labels: ['"article URL | title | publication date" per line'], sample: 'https://example.com/news/transit-budget | City Council Approves New Transit Budget | 2026-10-20T09:30:00+00:00\nhttps://example.com/news/library-opens | New Library Opens Downtown | 2026-10-21',
  opts: [{ id: 'name', label: 'Publication name', type: 'text', def: 'Example Daily' }, { id: 'lang', label: 'Language code (ISO 639, e.g. en, nl, zh-cn)', type: 'text', def: 'en' }],
  run: ([t], { name, lang }) => {
    const nm = String(name || '').trim(), lg = String(lang || '').trim().toLowerCase(); if (!nm) throw new Error('Publication name is required.');
    if (!/^([a-z]{2,3}|zh-cn|zh-tw)$/.test(lg)) throw new Error('Language must be a 2 or 3 letter ISO 639 code (zh-cn or zh-tw for Chinese).');
    const rows = lines(need(t, 'articles')).map((l) => l.split(/\s*\|\s*/)); if (rows.length > 1000) throw new Error('A news sitemap holds at most 1,000 articles. Split it.');
    const W = [], now = Date.now();
    const body = rows.map((r, i) => {
      const [u, ti, d] = r; if (!u || !isAbs(u) || u.length >= 2048) throw new Error(`Line ${i + 1}: first field must be an absolute URL.`); if (!ti) throw new Error(`Line ${i + 1}: title is missing.`);
      const p = d && parseW3C(d); if (!p) throw new Error(`Line ${i + 1}: date must be W3C format (2026-10-20 or 2026-10-20T09:30:00+00:00).`);
      if (p.ms > now + 864e5) W.push(`${u} has a date in the future.`); else if (newsAge(p.ms, now) > 48) W.push(`${u} is older than two days: Google asks for recent articles only.`);
      return `  <url>\n    <loc>${xmlEsc(u)}</loc>\n    <news:news>\n      <news:publication>\n        <news:name>${xmlEsc(nm)}</news:name>\n        <news:language>${lg}</news:language>\n      </news:publication>\n      <news:publication_date>${xmlEsc(d)}</news:publication_date>\n      <news:title>${xmlEsc(ti)}</news:title>\n    </news:news>\n  </url>\n`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SM_NS}"\n    xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${body}</urlset>\n<!-- ${rows.length} article(s). Use the original publication date, not the date you add the article. Title without author, publication name or date. Name must match news.google.com without parentheses. -->${W.length ? '\n<!-- REVIEW: ' + W.join(' ') + ' -->' : ''}`;
  },
});

const agoIso = (h) => new Date(Date.now() - h * 36e5).toISOString().slice(0, 19) + '+00:00';
const NEWS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SM_NS}" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${[[3, 'Fresh story'], [30, 'Yesterday story'], [60, 'Stale story'], [200, 'Old story']].map(([h, ti], i) => `  <url><loc>https://example.com/news/${i + 1}</loc><news:news><news:publication><news:name>Example Daily</news:name><news:language>en</news:language></news:publication><news:publication_date>${agoIso(h)}</news:publication_date><news:title>${ti}</news:title></news:news></url>`).join('\n')}\n</urlset>`;
tool({
  id: 'news-sitemap-freshness-checker', cat: 'SEO – Technical', title: 'News Sitemap Freshness Checker', desc: 'Show the age of each article in a Google News sitemap and list the entries older than 48 hours that you can remove.',
  labels: ['News sitemap XML'], sample: NEWS_SAMPLE,
  opts: [{ id: 'hours', label: 'Maximum age in hours', type: 'number', def: 48 }, { id: 'now', label: 'Treat this as now (blank = current time)', type: 'text', def: '' }],
  run: ([x], { hours, now }) => {
    const r = needEntries(x, 'news sitemap XML'), nw = nowMs(now), lim = +hours > 0 ? +hours : 48, rows = [], I = [];
    const items = r.entries.filter((e) => e.newsDate !== undefined || e.newsTitle !== undefined); if (!items.length) throw new Error('No <news:news> entries found.');
    if (items.length > 1000) I.push(['ERROR', `${items.length} articles: a news sitemap holds at most 1,000.`]);
    for (const e of items) {
      const p = e.newsDate && parseW3C(e.newsDate);
      if (!p) { rows.push(['INVALID', '-', e.loc, e.newsDate || '(missing publication_date)']); I.push(['ERROR', `Missing or invalid publication_date: ${e.loc}`]); continue; }
      const age = newsAge(p.ms, nw); rows.push([age < 0 ? 'FUTURE' : age > lim ? 'STALE' : 'fresh', age < 0 ? 'future' : age < 48 ? age.toFixed(1) + ' h' : (age / 24).toFixed(1) + ' d', e.loc, e.newsDate]);
      if (age < 0) I.push(['WARN', `Publication date is in the future: ${e.loc}`]);
    }
    const stale = rows.filter((r2) => r2[0] === 'STALE');
    return `${items.length} articles, ${stale.length} older than ${lim} hours, ${rows.filter((r2) => r2[0] === 'fresh').length} fresh\n\n${table(rows, ['Status', 'Age', 'URL', 'Date'])}\n\n${issues(I)}${stale.length ? `${head('Remove or strip the news markup from these')}${stale.map((r2) => r2[2]).join('\n')}` : ''}\n\nGoogle asks for articles from the last two days only; older entries should be removed, or their news:news metadata removed. An empty news sitemap is fine.`;
  },
});

tool({
  id: 'sitemap-lastmod-validator', cat: 'SEO – Technical', title: 'Sitemap Lastmod Date Validator', desc: 'Check every lastmod in a sitemap for W3C datetime format, impossible or future dates, missing values and the tell-tale "all URLs share one date" pattern.',
  labels: ['Sitemap XML (or lines "URL date")'], sample: SM_SAMPLE.replace('2026-09-01</lastmod><changefreq>weekly', '2026-13-45</lastmod><changefreq>weekly').replace('<lastmod>2026-09-01</lastmod><priority>0.5</priority></url>\n  <url><loc>https://example.com/products', '<lastmod>2031-01-01</lastmod><priority>0.5</priority></url>\n  <url><loc>https://example.com/products'),
  run: ([x]) => {
    const r = needEntries(x, 'sitemap XML'), I = [], vals = [], now = Date.now(); let missing = 0;
    for (const e of r.entries) {
      if (!e.lastmod) { missing++; continue; }
      const p = parseW3C(e.lastmod);
      if (!p) { I.push(['ERROR', `Not a valid W3C date or datetime: "${e.lastmod}"  (${e.loc})`]); continue; }
      if (/T/.test(e.lastmod) === false && e.lastmod.length < 10) I.push(['INFO', `Partial date "${e.lastmod}" is valid but vague: ${e.loc}`]);
      if (p.ms > now + 864e5) I.push(['WARN', `Date is in the future: ${e.lastmod}  (${e.loc})`]);
      vals.push(e.lastmod.slice(0, 10));
    }
    for (const e of r.entries) if (e.lastmod && /T\d\d:\d\d(:\d\d)?(\.\d+)?$/.test(e.lastmod)) I.push(['ERROR', `Time without a zone (needs Z or +hh:mm): ${e.lastmod}  (${e.loc})`]);
    const n = r.entries.length;
    if (missing) I.push([missing === n ? 'INFO' : 'WARN', `${missing} of ${n} entries have no lastmod.`]);
    const c = new Map(); for (const v of vals) c.set(v, (c.get(v) || 0) + 1);
    const top = [...c].sort((a, b) => b[1] - a[1])[0];
    if (vals.length >= 3 && c.size === 1) I.push(['WARN', `Every URL with a lastmod has the same date (${top[0]}). That usually means the value is generated at build time, not the real change date. Google uses lastmod only when it is consistently accurate.`]);
    else if (vals.length >= 5 && top[1] / vals.length >= 0.8) I.push(['REVIEW', `${pct(top[1], vals.length)} of dates are ${top[0]}: check for a bulk update or a deploy that rewrites every date.`]);
    return `${n} entries, ${vals.length} valid lastmod values, ${c.size} distinct day(s)${vals.length ? `, range ${[...vals].sort()[0]} to ${[...vals].sort().at(-1)}` : ''}\n\n${issues(I)}\n\nFormat: W3C datetime, as used by sitemaps.org (YYYY-MM-DD, or YYYY-MM-DDThh:mm:ss+hh:mm). Whether a date is truthful cannot be checked from the file alone.`;
  },
});

tool({
  id: 'sitemap-to-csv', cat: 'SEO – Technical', title: 'Sitemap to CSV Converter', desc: 'Turn sitemap XML into a CSV with loc, lastmod, changefreq, priority and, when present, image, video and hreflang columns.',
  labels: ['Sitemap XML'], sample: SM_SAMPLE,
  run: ([x]) => {
    const r = needEntries(x, 'sitemap XML'), hasI = r.entries.some((e) => e.images.length), hasA = r.entries.some((e) => e.alts.length), hasV = r.entries.some((e) => e.videos), hasN = r.entries.some((e) => e.newsTitle);
    const hdr = ['loc', 'lastmod', 'changefreq', 'priority', ...(hasI ? ['image_count', 'image_urls'] : []), ...(hasV ? ['video_count'] : []), ...(hasA ? ['alternates'] : []), ...(hasN ? ['news_title', 'news_date'] : [])];
    const rows = r.entries.map((e) => [e.loc, e.lastmod, e.changefreq, e.priority, ...(hasI ? [e.images.length, e.images.join(' ')] : []), ...(hasV ? [e.videos] : []), ...(hasA ? [e.alts.map((a) => `${a.lang}=${a.href}`).join(' ')] : []), ...(hasN ? [e.newsTitle, e.newsDate] : [])]);
    const csv = toCsv([hdr, ...rows]);
    return { text: csv, blob: new Blob([csv], { type: 'text/csv' }), filename: 'sitemap.csv' };
  },
});

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function toW3C(v, fmt) { // -> string or null
  v = String(v).trim(); if (!v) return null;
  if (parseW3C(v)) return v;
  const p2 = (n) => String(n).padStart(2, '0'), ok = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= dim(y, m) ? `${y}-${p2(m)}-${p2(d)}` : null);
  const tm = v.match(/[ T](\d{1,2}):(\d\d)(?::(\d\d))?\s*(Z|[+-]\d\d:?\d\d)?$/), time = tm ? `T${p2(tm[1])}:${tm[2]}:${tm[3] || '00'}${tm[4] ? (tm[4] === 'Z' ? 'Z' : tm[4].replace(/^([+-]\d\d):?(\d\d)$/, '$1:$2')) : 'Z'}` : '', ds = tm ? v.slice(0, tm.index) : v;
  let m, d;
  if ((m = ds.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/))) d = ok(+m[1], +m[2], +m[3]);
  else if ((m = ds.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/))) d = fmt === 'MDY' ? ok(+m[3], +m[1], +m[2]) : ok(+m[3], +m[2], +m[1]);
  else if ((m = ds.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})$/)) && MONTHS[m[2].toLowerCase()]) d = ok(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  else if ((m = ds.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/)) && MONTHS[m[1].toLowerCase()]) d = ok(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  return d ? d + time : null;
}
tool({
  id: 'csv-to-sitemap', cat: 'SEO – Generators', title: 'CSV to Sitemap Converter', desc: 'Turn a spreadsheet export (URL, date, changefreq, priority columns) into a valid sitemap.xml. Dates are converted to W3C format.',
  labels: ['CSV with a header row'], sample: 'URL,Last Modified,Frequency,Priority\nhttps://example.com/,15/09/2026,daily,1.0\nhttps://example.com/blog/post-1,2026-09-10 14:30,weekly,0.6\nhttps://example.com/about,Sep 1 2026,,',
  opts: [{ id: 'cl', label: 'URL column (name or number, blank = auto)', type: 'text', def: '' }, { id: 'cm', label: 'lastmod column', type: 'text', def: '' }, { id: 'cf', label: 'changefreq column (optional)', type: 'text', def: '' }, { id: 'cp', label: 'priority column (optional)', type: 'text', def: '' }, { id: 'fmt', label: 'Dates like 03/04/2026 are', type: 'select', choices: ['DMY', 'MDY'], def: 'DMY' }, { id: 'hdr', label: 'First row is a header', type: 'checkbox', def: true }],
  run: ([t], { cl, cm, cf, cp, fmt, hdr }) => {
    let rows = parseCsv(need(t, 'CSV')); if (rows.length < (hdr ? 2 : 1)) throw new Error('No data rows.');
    const header = hdr ? rows.shift() : rows[0].map((_, i) => String(i + 1));
    const iL = colIndex(header, cl || (hdr ? '' : '1'), /^(url|loc|address|link|page|landing page)$/, 'URL column'); if (iL < 0) throw new Error('URL column not found: name it in the first option.');
    const iM = colIndex(header, cm, /^(lastmod|last modified|last-modified|modified|updated|date|last updated)$/, 'lastmod column'), iF = colIndex(header, cf, /^(changefreq|change frequency|frequency)$/, 'changefreq column'), iP = colIndex(header, cp, /^(priority)$/, 'priority column');
    const seen = new Set(), skipped = [], FREQ = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'], out = [];
    rows.forEach((r, n) => {
      const u = (r[iL] || '').trim(), line = n + (hdr ? 2 : 1);
      if (!isAbs(u) || u.length >= 2048) { skipped.push(`row ${line}: not an absolute URL`); return; } if (seen.has(u)) { skipped.push(`row ${line}: duplicate`); return; } seen.add(u);
      let s = `  <url>\n    <loc>${xmlEsc(u)}</loc>\n`;
      if (iM >= 0 && (r[iM] || '').trim()) { const d = toW3C(r[iM], fmt); if (d) s += `    <lastmod>${d}</lastmod>\n`; else skipped.push(`row ${line}: date "${r[iM]}" not understood, lastmod left out`); }
      if (iF >= 0 && (r[iF] || '').trim()) { const f = r[iF].trim().toLowerCase(); if (FREQ.includes(f)) s += `    <changefreq>${f}</changefreq>\n`; else skipped.push(`row ${line}: changefreq "${r[iF]}" invalid, left out`); }
      if (iP >= 0 && (r[iP] || '').trim()) { const p = +r[iP].trim().replace(',', '.'); if (p >= 0 && p <= 1) s += `    <priority>${p.toFixed(1)}</priority>\n`; else skipped.push(`row ${line}: priority "${r[iP]}" not between 0 and 1, left out`); }
      out.push(s + '  </url>\n');
    });
    if (!out.length) throw new Error('No valid URLs in the CSV.'); if (out.length > LIMIT_URLS) throw new Error('Over 50,000 URLs: split into several sitemaps with an index.');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SM_NS}">\n${out.join('')}</urlset>\n<!-- ${out.length} URLs. Times without a zone are written as UTC (Z).${skipped.length ? ' Notes: ' + skipped.slice(0, 10).join('; ').replace(/--/g, '-') + (skipped.length > 10 ? ` (+${skipped.length - 10} more)` : '') : ''} -->`;
  },
});

tool({
  id: 'text-sitemap-generator', cat: 'SEO – Generators', title: 'Text Sitemap Generator', desc: 'Clean a URL list into a plain-text sitemap: absolute URLs, deduplicated, percent-encoded, one per line, UTF-8, within the 50,000 URL limit.',
  labels: ['URLs, one per line'], sample: 'https://example.com/\nhttps://example.com/café menu\nhttps://example.com/about#team\nhttps://example.com/about\nhttps://example.com/blog/first-post',
  opts: [{ id: 'frag', label: 'Remove #fragments', type: 'checkbox', def: true }],
  run: ([t], { frag }) => {
    const out = new Set(), bad = [];
    for (const l of lines(need(t, 'URLs'))) { const u = isAbs(l) ? tryUrl(l) : null; if (!u) { bad.push(l); continue; } if (frag) u.hash = ''; out.add(u.href); }
    if (bad.length) throw new Error(`Not absolute http(s) URLs (line ${lines(t).indexOf(bad[0]) + 1}: "${bad[0].slice(0, 50)}"${bad.length > 1 ? `, +${bad.length - 1} more` : ''}).`);
    if (out.size > LIMIT_URLS) throw new Error(`${out.size} URLs: the limit is 50,000 per file. Use the Sitemap Splitter and Index Generator.`);
    const s = [...out].join('\n') + '\n'; if (bytesOf(s) > LIMIT_BYTES) throw new Error('File would exceed 50 MB.');
    return { text: s, blob: new Blob([s], { type: 'text/plain;charset=utf-8' }), filename: 'sitemap.txt' };
  },
});

const feedDate = (v, full) => { if (!v) return ''; const ms = parseW3C(v)?.ms ?? Date.parse(v); if (Number.isNaN(ms)) return ''; const iso = new Date(ms).toISOString(); return full ? iso.slice(0, 19) + 'Z' : iso.slice(0, 10); };
tool({
  id: 'feed-to-sitemap', cat: 'SEO – Generators', title: 'RSS or Atom Feed to Sitemap', desc: 'Paste an RSS 2.0 or Atom feed and get an XML sitemap: item links become loc, publication or update dates become lastmod.',
  labels: ['RSS or Atom XML'], sample: `<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title><link>https://example.com/</link>\n<item><title>Post one</title><link>https://example.com/blog/one?a=1&amp;b=2</link><pubDate>Tue, 06 Oct 2026 09:30:00 GMT</pubDate></item>\n<item><title>Post two</title><link><![CDATA[https://example.com/blog/two]]></link><pubDate>Mon, 05 Oct 2026 18:00:00 +0200</pubDate></item></channel></rss>`,
  opts: [{ id: 'full', label: 'lastmod with time (UTC)', type: 'checkbox', def: false }],
  run: ([x], { full }) => {
    need(x, 'feed XML'); const atom = /<feed\b/i.test(x) && /<entry\b/i.test(x), rss = /<item\b/i.test(x);
    if (!atom && !rss) throw new Error('No <item> (RSS) or <entry> (Atom) elements found.');
    const tv = (b, n) => { const m = b.match(new RegExp(`<${n}\\b[^>]*>\\s*([\\s\\S]*?)\\s*</${n}>`, 'i')); return m ? dec(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim() : ''; };
    const items = [...x.matchAll(atom ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi : /<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => {
      const b = m[1]; let link;
      if (atom) { const ls = tags(b, 'link'), l = ls.find((t) => (t.a.rel || 'alternate') === 'alternate') || ls[0]; link = l?.a.href; } else link = tv(b, 'link') || (/isPermaLink\s*=\s*["']?false/i.test(b) ? '' : tv(b, 'guid'));
      return { link: link || '', d: feedDate(atom ? tv(b, 'updated') || tv(b, 'published') : tv(b, 'pubDate') || tv(b, 'dc:date'), full) };
    });
    const seen = new Set(), skip = [], out = [];
    for (const it of items) { if (!isAbs(it.link)) { skip.push(it.link || '(no link)'); continue; } if (seen.has(it.link)) continue; seen.add(it.link); out.push(it); }
    if (!out.length) throw new Error('No absolute item links found.'); if (out.length > LIMIT_URLS) throw new Error('Over 50,000 items.');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SM_NS}">\n${out.map((i) => `  <url>\n    <loc>${xmlEsc(i.link)}</loc>${i.d ? `\n    <lastmod>${i.d}</lastmod>` : ''}\n  </url>\n`).join('')}</urlset>\n<!-- ${atom ? 'Atom' : 'RSS'} feed, ${out.length} URLs.${skip.length ? ` Skipped ${skip.length} item(s) without an absolute link.` : ''} A feed lists only recent items, so this is not a full site sitemap. -->`;
  },
});

const segTpl = (s, last) => /^\d+$/.test(s) ? '{n}' : /^\d{4}(-\d\d){0,2}$/.test(s) ? '{date}' : /^[0-9a-f]{8,}$/i.test(s) ? '{hash}' : last && (/-.*-/.test(s) || s.length > 30) ? '{slug}' : s;
tool({
  id: 'sitemap-url-pattern-analyzer', cat: 'SEO – Technical', title: 'Sitemap URL Pattern and Structure Analyzer', desc: 'Group sitemap URLs by folder and URL template to see site structure, section sizes, parameter variations and very deep paths.',
  labels: ['Sitemap XML or URL list'], sample: SM_SAMPLE + '\n',
  opts: [{ id: 'depth', label: 'Folder levels to group by', type: 'number', def: 1 }, { id: 'deep', label: 'Flag paths with at least this many segments', type: 'number', def: 5 }],
  run: ([x], { depth, deep }) => {
    const r = needEntries(x), U = r.entries.map((e) => tryUrl(e.loc)).filter(Boolean), dp = Math.max(1, +depth || 1), dd = Math.max(2, +deep || 5), n = U.length;
    if (!n) throw new Error('No valid URLs.');
    const sec = new Map(), pat = new Map(), byPath = new Map(), deepL = [];
    for (const u of U) {
      const s = u.pathname.split('/').filter(Boolean), k = '/' + s.slice(0, Math.min(dp, Math.max(0, s.length - (/\.\w+$/.test(s.at(-1) || '') || s.length <= dp ? 1 : 0)))).join('/'), key = k === '/' ? '/ (root)' : k + '/';
      const o = sec.get(key) || sec.set(key, { n: 0, q: 0, d: 0 }).get(key); o.n++; if (u.search) o.q++; o.d += s.length;
      const t = '/' + s.map((p, i) => segTpl(p, i === s.length - 1)).join('/'); pat.set(t, (pat.get(t) || 0) + 1);
      (byPath.get(u.host + u.pathname) || byPath.set(u.host + u.pathname, new Set()).get(u.host + u.pathname)).add(u.search);
      if (s.length >= dd) deepL.push(u.pathname);
    }
    const secRows = [...sec].sort((a, b) => b[1].n - a[1].n).map(([k, o]) => [k, o.n, pct(o.n, n), o.q, (o.d / o.n).toFixed(1)]);
    const patRows = [...pat].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, c]) => [c, pct(c, n), k]);
    const multi = [...byPath].filter(([, s]) => s.size > 1), q = U.filter((u) => u.search).length, I = [];
    if (q) I.push(['REVIEW', `${q} URLs (${pct(q, n)}) have query strings. Sitemaps should list canonical URLs; parameter variants often are not.`]);
    if (multi.length) I.push(['REVIEW', `${multi.length} path(s) appear with several query variants, e.g. ${multi[0][0]} (${multi[0][1].size} variants).`]);
    if (deepL.length) I.push(['INFO', `${deepL.length} URL(s) have ${dd}+ path segments, e.g. ${deepL[0]}`]);
    const big = secRows[0]; if (secRows.length > 1 && +big[2].slice(0, -1) >= 60) I.push(['INFO', `Section ${big[0]} holds ${big[2]} of all URLs.`]);
    return `${n} URLs, ${sec.size} section(s) at ${dp} level(s)\n${head('Sections')}${table(secRows, ['Section', 'URLs', 'Share', 'With query', 'Avg segments'])}${head('Most common URL templates')}${table(patRows, ['URLs', 'Share', 'Template'])}${head('Observations')}${issues(I)}\n\nTemplates replace numbers, dates, long hex ids and a long final hyphenated segment ({slug}). This is a heuristic, not a crawl.`;
  },
});

tool({
  id: 'sitemap-robots-cross-check', cat: 'SEO – Technical', title: 'Sitemap vs robots.txt Cross-Check', desc: 'List the sitemap URLs that robots.txt blocks for a chosen crawler, with the rule that blocks each one.',
  labels: ['Sitemap XML or URL list', 'robots.txt'], inputs: 2, sample: SM_SAMPLE, sample2: 'User-agent: *\nDisallow: /admin/\nDisallow: /*?sort=\nAllow: /admin/public/\n\nSitemap: https://example.com/sitemap.xml',
  opts: [{ id: 'ua', label: 'Crawler (user-agent)', type: 'text', def: 'Googlebot' }],
  run: ([x, r], { ua }) => {
    const E = needEntries(x, 'the sitemap').entries, rb = parseRobots(need(r, 'robots.txt')); if (!rb.groups.length) throw new Error('No User-agent groups found in robots.txt.');
    const agent = String(ua || '*').trim() || '*', rows = [];
    for (const e of E) { const u = tryUrl(e.loc); if (!u) { rows.push(['INVALID', e.loc, 'not a valid URL']); continue; } const d = robotsDecision(rb, agent, u.pathname + u.search); if (!d.ok) rows.push(['BLOCKED', e.loc, d.why]); }
    const blocked = rows.filter((x2) => x2[0] === 'BLOCKED').length;
    return `${E.length} sitemap URLs checked for "${agent}": ${blocked} blocked${blocked ? '' : ', none blocked'}\n\n${rows.length ? table(rows, ['Result', 'URL', 'Deciding rule']) : '[OK] No sitemap URL is blocked.'}\n\nA blocked URL listed in a sitemap sends mixed signals: remove it from the sitemap or change the rule. Matching follows the usual rules (most specific user-agent group, longest path wins, Allow wins a tie, * and $). Only the path and query are matched, not the host.${rb.sitemaps.length ? `\nrobots.txt declares: ${rb.sitemaps.join(', ')}` : '\nNote: robots.txt has no Sitemap line.'}`;
  },
});

const TRACK = /^(utm_[a-z]+|fbclid|gclid|msclkid|mc_cid|mc_eid|_ga|yclid|igshid)$/i;
tool({
  id: 'sitemap-noncanonical-finder', cat: 'SEO – Technical', title: 'Sitemap Non-Canonical URL Finder', desc: 'Flag sitemap URLs with query strings, fragments, tracking parameters, mixed http/https or www, uppercase, index files or odd trailing slashes, each with a suggested clean form.',
  labels: ['Sitemap XML or URL list'], sample: SM_SAMPLE + '\n',
  run: ([x]) => {
    const E = needEntries(x).entries, U = E.map((e) => ({ raw: e.loc, u: tryUrl(e.loc) })), good = U.filter((r) => r.u);
    const slashy = good.filter((r) => r.u.pathname.length > 1 && !/\.\w{2,5}$/.test(r.u.pathname)), ts = slashy.filter((r) => r.u.pathname.endsWith('/')).length, withSlash = ts > slashy.length - ts;
    const https = good.filter((r) => r.u.protocol === 'https:').length, hostSet = new Set(good.map((r) => r.u.host.toLowerCase().replace(/^www\./, '')));
    const www = good.filter((r) => /^www\./i.test(r.u.host)).length, rows = [];
    for (const r of U) {
      if (!r.u) { rows.push([r.raw, 'not a valid URL', '']); continue; }
      const u = r.u, why = [], s = new URL(u.href);
      if (u.hash) { why.push('fragment'); s.hash = ''; }
      if (u.search) { const keep = [...u.searchParams].filter(([k]) => !TRACK.test(k)); if (keep.length !== [...u.searchParams].length) { why.push('tracking parameter'); s.search = ''; keep.forEach(([k, v]) => s.searchParams.append(k, v)); } if (keep.length) why.push('query string'); }
      if (https && https < good.length) { if (u.protocol === 'http:') { why.push('http (most URLs use https)'); s.protocol = 'https:'; } } else if (https === 0 && good.length) { /* all http */ }
      if (hostSet.size === 1 && www && www < good.length) { const wantW = www > good.length / 2; if (/^www\./i.test(u.host) !== wantW) { why.push(wantW ? 'host without www (most use www)' : 'host with www (most do not)'); s.hostname = wantW ? 'www.' + u.hostname.replace(/^www\./, '') : u.hostname.replace(/^www\./, ''); } }
      if (/[A-Z]/.test(u.pathname)) why.push('uppercase in path (review: paths are case sensitive)');
      if (/\/index\.(html?|php)$/i.test(u.pathname)) { why.push('index file in URL'); s.pathname = s.pathname.replace(/index\.(html?|php)$/i, ''); }
      if (slashy.length > 1 && ts && ts < slashy.length && slashy.includes(r)) { const has = u.pathname.endsWith('/'); if (has !== withSlash) { why.push(withSlash ? 'no trailing slash (most have one)' : 'trailing slash (most have none)'); s.pathname = withSlash ? s.pathname + '/' : s.pathname.replace(/\/$/, ''); } }
      if (/%[0-9a-f]{2}/.test(u.pathname) && /%[0-9a-f]{2}/.test(u.pathname) && /%[a-f]{1}[0-9a-f]|%[0-9][a-f]/.test(u.pathname)) why.push('lowercase percent-encoding (review)');
      if (why.length) rows.push([r.raw, why.join('; '), s.href !== u.href ? s.href : '(review manually)']);
    }
    const dups = new Map(); for (const r of rows) { const k = r[2]; if (k && k.startsWith('http')) dups.set(k, (dups.get(k) || 0) + 1); }
    const clash = [...dups].filter(([k, c]) => c > 1 || U.some((r) => r.raw === k));
    return `${E.length} URLs, ${rows.length} flagged\nMajority style: ${https === good.length ? 'https' : https >= good.length / 2 ? 'mostly https' : 'mostly http'}, trailing slash ${slashy.length > 1 ? (withSlash ? 'used' : 'not used') : 'n/a'}\n\n${rows.length ? table(rows, ['URL', 'Why', 'Suggested form']) : '[OK] Nothing flagged.'}${clash.length ? `\n\n[REVIEW] ${clash.length} suggested form(s) duplicate another URL in the file: ${clash.slice(0, 3).map(([k]) => k).join(', ')}` : ''}\n\nThese are signals, not proof: only the page's own canonical tag says which URL is canonical. Suggestions assume the majority style in this file is the intended one.`;
  },
});

tool({
  id: 'sitemap-xml-escaper', cat: 'SEO – Generators', title: 'Sitemap URL XML Escaper', desc: 'Make raw URLs safe for a sitemap: percent-encode spaces and non-ASCII characters, then entity-escape & < > " \' for XML.',
  labels: ['Raw URLs, one per line'], sample: 'https://example.com/search?q=shoes&color=red&size=10\nhttps://example.com/café/menu card?x=1&y=2\nhttps://example.com/a?b=it\'s',
  opts: [{ id: 'wrap', label: 'Wrap each in <loc> tags', type: 'checkbox', def: false }, { id: 'enc', label: 'Percent-encode spaces and non-ASCII', type: 'checkbox', def: true }, { id: 'keep', label: 'Leave existing entities like &amp; alone', type: 'checkbox', def: true }],
  run: ([t], { wrap, enc, keep }) => lines(need(t, 'URLs')).map((l) => {
    let u = l;
    if (enc) u = [...u].map((c) => { const k = c.codePointAt(0); return k <= 32 || k > 126 || '"<>\\^`{|}'.includes(c) ? encodeURIComponent(c) : c; }).join('');
    u = u.replace(keep ? /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi : /&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    return wrap ? `<loc>${u}</loc>` : u;
  }).join('\n'),
});

// ---------- Search Console export ----------
tool({
  id: 'index-coverage-export-analyzer', cat: 'SEO – Technical', title: 'Search Console Page Indexing Export Analyzer', desc: 'Paste Search Console page-indexing exports (CSV): totals per reason, and URLs grouped by reason and by top folder to show which sections lose the most pages.',
  labels: ['CSV export(s). Start each export with a line "# Reason name" if the file has no reason column'],
  sample: '# Crawled - currently not indexed\nURL,Last crawled\nhttps://example.com/blog/a,2026-09-01\nhttps://example.com/blog/b,2026-09-02\nhttps://example.com/tag/x,2026-09-03\n\n# Duplicate without user-selected canonical\nURL,Last crawled\nhttps://example.com/shop/p1?color=red,2026-09-04\nhttps://example.com/shop/p2?color=red,2026-09-04\nhttps://example.com/blog/a?amp=1,2026-09-05',
  opts: [{ id: 'depth', label: 'Folder levels', type: 'number', def: 1 }],
  run: ([t], { depth }) => {
    const secs = []; let cur = { reason: '', txt: [] };
    for (const l of need(t, 'the export').split(/\r?\n/)) { const m = l.match(/^#\s*(.+)$/); if (m) { if (cur.txt.length) secs.push(cur); cur = { reason: m[1].trim(), txt: [] }; } else cur.txt.push(l); }
    secs.push(cur);
    const items = [], summary = [];
    for (const s of secs) {
      const rows = parseCsv(s.txt.join('\n')); if (!rows.length) continue; const h = rows[0].map((x) => x.trim().toLowerCase());
      const iu = h.findIndex((x) => /^(url|address|page)$/.test(x)), ir = h.findIndex((x) => /^(reason|issue|status|coverage|why pages aren.t indexed)$/.test(x)), ip = h.findIndex((x) => /^(pages|count|affected pages)$/.test(x));
      if (iu >= 0) for (const r of rows.slice(1)) { if (r[iu]) items.push({ url: r[iu].trim(), reason: (ir >= 0 && r[ir]) || s.reason || '(no reason given)' }); }
      else if (ir >= 0 && ip >= 0) for (const r of rows.slice(1)) summary.push([r[ir], +String(r[ip]).replace(/[^\d]/g, '') || 0, r[h.findIndex((x) => x === 'source')] || '']);
      else if (rows.every((r) => isAbs(r[0] || ''))) for (const r of rows) items.push({ url: r[0].trim(), reason: s.reason || '(no reason given)' });
      else throw new Error('No URL column (or Reason and Pages columns) found. Export from the page-indexing report and paste the CSV.');
    }
    if (!items.length && !summary.length) throw new Error('Nothing to analyse.');
    const dp = Math.max(1, +depth || 1), folder = (u) => { const p = tryUrl(u); if (!p) return '(invalid)'; const s = p.pathname.split('/').filter(Boolean); return s.length <= dp ? (s.length ? '/' + s.slice(0, Math.max(0, s.length - 1)).join('/') : '/') : '/' + s.slice(0, dp).join('/') + '/'; };
    let out = '';
    if (summary.length) { const tot = summary.reduce((a, r) => a + r[1], 0); out += `${head('Reasons (from the summary table)')}${table(summary.sort((a, b) => b[1] - a[1]).map((r) => [r[0], r[1], pct(r[1], tot), r[2]]), ['Reason', 'Pages', 'Share', 'Source'])}\n`; }
    if (items.length) {
      const byR = new Map(); for (const i of items) (byR.get(i.reason) || byR.set(i.reason, []).get(i.reason)).push(i);
      out += `${head(`URLs by reason (${items.length} URLs)`)}${table([...byR].sort((a, b) => b[1].length - a[1].length).map(([r, a]) => [r, a.length, pct(a.length, items.length), a.filter((i) => /[?]/.test(i.url)).length]), ['Reason', 'URLs', 'Share', 'With query'])}`;
      const byF = new Map(); for (const i of items) { const f = folder(i.url), o = byF.get(f) || byF.set(f, new Map()).get(f); o.set(i.reason, (o.get(i.reason) || 0) + 1); }
      out += `${head('Most affected folders')}${table([...byF].map(([f, m]) => [f, [...m.values()].reduce((a, b) => a + b, 0), [...m].sort((a, b) => b[1] - a[1]).map(([r, c]) => `${r} (${c})`).join('; ')]).sort((a, b) => b[1] - a[1]).slice(0, 25), ['Folder', 'URLs', 'Reasons'])}`;
    }
    return out.trim() + '\n\nThis groups what you paste; it does not know why Google chose a status. Read each reason in Search Console help before acting.';
  },
});

// ---------- charts as text ----------
const distChart = (title, vals, n) => { const c = new Map(); for (const v of vals) c.set(v, (c.get(v) || 0) + 1); const mx = Math.max(...c.values()); return `${head(title)}${table([...c].sort((a, b) => (isNaN(+a[0]) || isNaN(+b[0]) ? b[1] - a[1] : +b[0] - +a[0])).map(([k, v]) => [k, v, pct(v, n), bar(v, mx)]), ['Value', 'URLs', 'Share', ''])}`; };
tool({
  id: 'sitemap-priority-distribution', cat: 'SEO – Technical', title: 'Sitemap Priority and Changefreq Distribution', desc: 'Count how often each priority and changefreq value appears in a sitemap and show it as a bar chart, so meaningless defaults stand out.',
  labels: ['Sitemap XML'], sample: SM_SAMPLE,
  run: ([x]) => {
    const E = needEntries(x, 'sitemap XML').entries, n = E.length, I = [];
    const P = E.map((e) => (e.priority == null ? '(none)' : e.priority)), F = E.map((e) => (e.changefreq == null ? '(none)' : e.changefreq));
    for (const [name, V] of [['priority', P], ['changefreq', F]]) {
      const c = new Map(); for (const v of V) c.set(v, (c.get(v) || 0) + 1); const top = [...c].sort((a, b) => b[1] - a[1])[0];
      if (n >= 3 && c.size === 1) I.push(['WARN', top[0] === '(none)' ? `No URL sets ${name}.` : `Every URL has ${name} ${top[0]}: the value carries no information.`]);
      else if (n >= 5 && top[0] !== '(none)') I.push([top[1] / n >= 0.8 ? 'REVIEW' : 'INFO', `${pct(top[1], n)} of URLs have ${name} ${top[0]}.`]);
    }
    return `${n} entries${distChart('Priority', P, n)}${distChart('Changefreq', F, n)}${head('Observations')}${issues(I)}\n\nGoogle states it ignores priority and changefreq; other engines may use them as hints. Setting them to real, varied values costs nothing, but an accurate lastmod matters more.`;
  },
});

tool({
  id: 'sitemap-lastmod-timeline', cat: 'SEO – Technical', title: 'Sitemap Lastmod Timeline', desc: 'Chart how many URLs were last modified per day, month or year, find single-day spikes and see which folders are stale.',
  labels: ['Sitemap XML'], sample: SM_SAMPLE,
  opts: [{ id: 'gran', label: 'Bucket', type: 'select', choices: ['auto', 'day', 'month', 'year'], def: 'auto' }, { id: 'stale', label: 'Stale after (months)', type: 'number', def: 12 }, { id: 'now', label: 'Treat this as now (blank = current time)', type: 'text', def: '' }],
  run: ([x], { gran, stale, now }) => {
    const E = needEntries(x, 'sitemap XML').entries, nw = nowMs(now), D = [];
    for (const e of E) { const p = e.lastmod && parseW3C(e.lastmod); if (p) D.push({ e, day: new Date(p.ms).toISOString().slice(0, 10), ms: p.ms }); }
    if (!D.length) throw new Error('No valid lastmod values found.');
    D.sort((a, b) => a.ms - b.ms); const spanDays = (D.at(-1).ms - D[0].ms) / 864e5, g = gran === 'auto' ? (spanDays <= 62 ? 'day' : spanDays <= 1100 ? 'month' : 'year') : gran, len = g === 'day' ? 10 : g === 'month' ? 7 : 4;
    const c = new Map(); for (const d of D) { const k = d.day.slice(0, len); c.set(k, (c.get(k) || 0) + 1); }
    const mx = Math.max(...c.values()), I = [], days = new Map(); for (const d of D) days.set(d.day, (days.get(d.day) || 0) + 1);
    const topDay = [...days].sort((a, b) => b[1] - a[1])[0];
    if (D.length >= 5 && topDay[1] / D.length >= 0.5) I.push(['REVIEW', `${pct(topDay[1], D.length)} of dated URLs share ${topDay[0]}: often a bulk update or a deploy that rewrites every date.`]);
    const cut = nw - (+stale > 0 ? +stale : 12) * 30.44 * 864e5, st = D.filter((d) => d.ms < cut).length;
    if (st) I.push(['INFO', `${st} URLs (${pct(st, D.length)}) have a lastmod older than ${+stale || 12} months.`]);
    if (E.length > D.length) I.push(['INFO', `${E.length - D.length} entries have no valid lastmod.`]);
    const sec = new Map(); for (const d of D) { const p = tryUrl(d.e.loc), s = p ? p.pathname.split('/').filter(Boolean) : []; const k = s.length > 1 ? '/' + s[0] + '/' : '/'; const o = sec.get(k) || sec.set(k, { n: 0, new: 0, old: Infinity, st: 0 }).get(k); o.n++; o.new = Math.max(o.new, d.ms); o.old = Math.min(o.old, d.ms); if (d.ms < cut) o.st++; }
    return `${D.length} dated URLs, ${D[0].day} to ${D.at(-1).day}, bucket: ${g}\n${head('URLs per ' + g)}${table([...c].sort().map(([k, v]) => [k, v, bar(v, mx)]), ['Period', 'URLs', ''])}${head('By top folder')}${table([...sec].sort((a, b) => b[1].n - a[1].n).map(([k, o]) => [k, o.n, new Date(o.new).toISOString().slice(0, 10), new Date(o.old).toISOString().slice(0, 10), pct(o.st, o.n)]), ['Folder', 'URLs', 'Newest', 'Oldest', 'Stale'])}${head('Observations')}${issues(I)}`;
  },
});

// ======================= ON-PAGE =======================
const HTML_SAMPLE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Blue Widgets | Acme</title>
<title>Duplicate title</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Buy blue widgets.">
<meta name="description" content="A second description.">
<meta name="keywords" content="widgets, blue, cheap">
<meta name="robots" content="index,follow">
<link rel="canonical" href="https://acme.test/widgets/blue">
<link rel="canonical" href="https://acme.test/shop/blue">
<link rel="alternate" hreflang="en" href="https://acme.test/widgets/blue/">
<link rel="alternate" hreflang="nl" href="https://acme.test/nl/widgets/blue">
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="/app.css">
<meta property="og:title" content="Blue Widgets">
<meta property="og:url" content="http://acme.test/widgets/blue">
<meta property="og:image" content="https://acme.test/a.jpg">
<meta property="og:image" content="https://acme.test/b.jpg">
<meta http-equiv="refresh" content="5; url=/widgets/blue-new">
<script src="/a.js"></script>
</head><body><h1>Blue widgets</h1><p>Hello.</p></body></html>`;
const headOf = (h) => { const m = h.match(/<head\b[^>]*>([\s\S]*?)(<\/head\s*>|<body\b|$)/i); return m ? m[1] : h; };

tool({
  id: 'html-head-extractor', cat: 'SEO – On-page', title: 'HTML Head Extractor (Meta, Link, Title Table)', desc: 'List every title, meta, link and base element in the head of pasted HTML in one table, with duplicates and missing basics flagged.',
  labels: ['HTML source'], sample: HTML_SAMPLE,
  run: ([h]) => {
    const hd = headOf(need(h, 'HTML')).replace(/<!--[\s\S]*?-->/g, ''), rows = [], I = [], cnt = new Map();
    const REPEAT = /^(og:image|og:video|og:audio|og:locale:alternate|article:(tag|author)|music:|video:|book:|fb:|product:)/;
    const add = (kind, key, val, extra) => rows.push([kind, key, val, extra || '']);
    for (const t of pairs(hd, 'title')) { add('title', '', t.text); cnt.set('title', (cnt.get('title') || 0) + 1); }
    for (const t of tags(hd, 'meta')) {
      const k = (t.a.name || t.a.property || t.a['http-equiv'] || t.a.itemprop || (t.a.charset != null ? 'charset' : '')).toLowerCase();
      add('meta', k || '(no name)', t.a.content ?? t.a.charset ?? '', Object.keys(t.a).filter((x) => !['name', 'property', 'content', 'http-equiv', 'charset', 'itemprop'].includes(x)).map((x) => `${x}=${t.a[x]}`).join(' '));
      if (k && !REPEAT.test(k)) { const kk = 'meta ' + k; cnt.set(kk, (cnt.get(kk) || 0) + 1); }
    }
    for (const t of tags(hd, 'link')) { const rel = (t.a.rel || '').toLowerCase(); add('link', rel || '(no rel)', t.a.href || '', Object.keys(t.a).filter((x) => !['rel', 'href'].includes(x)).map((x) => `${x}=${t.a[x]}`).join(' ')); if (rel === 'canonical') cnt.set('link canonical', (cnt.get('link canonical') || 0) + 1); }
    for (const t of tags(hd, 'base')) { add('base', '', t.a.href || '', t.a.target || ''); cnt.set('base', (cnt.get('base') || 0) + 1); }
    const one = ['title', 'link canonical', 'base', 'meta description', 'meta robots', 'meta viewport', 'meta charset', 'meta og:title', 'meta og:description', 'meta og:url', 'meta og:type', 'meta twitter:card'];
    for (const [k, c] of cnt) if (c > 1 && (one.includes(k) || /^meta /.test(k))) I.push(['WARN', `${c} x ${k}: only one should be present.`]);
    for (const [k, w] of [['title', 'title'], ['meta description', 'meta description'], ['meta viewport', 'viewport meta'], ['link canonical', 'canonical link'], ['meta charset', 'charset']]) if (!cnt.has(k)) I.push(['INFO', `No ${w} found in the head.`]);
    const sc = (hd.match(/<script\b/gi) || []).length, ss = (hd.match(/<style\b/gi) || []).length;
    if (!rows.length) throw new Error('No title, meta or link elements found.');
    return `${rows.length} elements (${sc} script, ${ss} style not listed)\n\n${table(rows, ['Element', 'Name / rel', 'Content / href', 'Other attributes'])}\n\n${issues(I)}\n\nThe head is read as text up to </head> or <body>; this is not a full HTML parser, so unusual markup may be missed.`;
  },
});

tool({
  id: 'og-image-size-checker', cat: 'SEO – On-page', title: 'Social Image Size Checker (Open Graph)', desc: 'Choose an image and check its pixels, aspect ratio and file size against Facebook and LinkedIn link-preview guidance. Nothing is uploaded.',
  inputs: 0, dom: true, file: { accept: 'image/*', multiple: false },
  run: async (_i, _o, files) => {
    const f = files && files[0]; if (!f) throw new Error('Choose an image.');
    let w, h; try { const b = await createImageBitmap(f); w = b.width; h = b.height; b.close?.(); } catch { throw new Error('Could not read this image (try PNG, JPEG, WebP or GIF).'); }
    const ratio = w / h, R = 1200 / 630, near = Math.abs(ratio - R) / R <= 0.03, mb = f.size / 1048576, res = [];
    const row = (p, test, ok, bad, level = 'FAIL') => res.push([p, test, ok ? 'PASS' : level, ok ? '' : bad]);
    row('Facebook', 'minimum 200 x 200 px', w >= 200 && h >= 200, `${w} x ${h} is too small`);
    row('Facebook', 'large preview: at least 600 x 315 px', w >= 600 && h >= 315, 'will show as a small preview', 'REVIEW');
    row('Facebook', 'recommended 1200 x 630 px or larger', w >= 1200 && h >= 630, 'may look soft on high-resolution screens', 'REVIEW');
    row('Facebook', 'aspect ratio about 1.91:1', near, `ratio is ${ratio.toFixed(2)}:1; it may be cropped`, 'REVIEW');
    row('Facebook', 'file size 8 MB or less', mb <= 8, `${mb.toFixed(1)} MB is over the limit`);
    row('LinkedIn', 'at least 1200 x 627 px', w >= 1200 && h >= 627, 'smaller images may not give a full preview', 'REVIEW');
    row('LinkedIn', 'aspect ratio 1.91:1', near, `ratio is ${ratio.toFixed(2)}:1`, 'REVIEW');
    row('LinkedIn', 'width above 400 px (else small thumbnail)', w > 400, 'shows as a small thumbnail');
    row('LinkedIn', 'file size 5 MB or less', mb <= 5, `${mb.toFixed(1)} MB is over the limit`);
    return `${f.name}: ${w} x ${h} px, ratio ${ratio.toFixed(2)}:1, ${f.size.toLocaleString('en')} bytes (${mb.toFixed(2)} MB), type ${f.type || 'unknown'}\n\n${table(res, ['Platform', 'Check', 'Result', 'Note'])}\n\nSources: Facebook Sharing image guide (min 200x200, large preview 600x315, 1200x630 recommended, 8 MB) and LinkedIn Help (1200x627, 1.91:1, 5 MB). Limits for X (Twitter) and Slack could not be checked at the source, so they are not tested. Platforms change rules; PASS is not a guarantee.`;
  },
});

const norm = (u, base) => { const p = tryUrl(u, base); return p ? p : null; };
const urlDiff = (a, b) => {
  const d = []; if (a.protocol !== b.protocol) d.push('scheme'); if (a.host.toLowerCase() !== b.host.toLowerCase()) d.push(a.host.replace(/^www\./, '') === b.host.replace(/^www\./, '') ? 'www' : 'host');
  if (a.pathname !== b.pathname) d.push(a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '') ? 'trailing slash' : a.pathname.toLowerCase() === b.pathname.toLowerCase() ? 'path case' : 'path'); if (a.search !== b.search) d.push('query'); return d;
};
tool({
  id: 'canonical-conflict-checker', cat: 'SEO – On-page', title: 'Canonical Conflict Checker (canonical, og:url, hreflang)', desc: 'Compare the canonical link, og:url, twitter:url and hreflang self-reference in pasted HTML and show where they disagree.',
  labels: ['HTML source', 'Page URL (optional)'], inputs: 2, sample: HTML_SAMPLE, sample2: 'https://acme.test/widgets/blue',
  run: ([h, pu]) => {
    need(h, 'HTML'); const page = pu.trim() ? norm(pu.trim()) : null; if (pu.trim() && !page) throw new Error('Page URL is not valid.');
    const hd = headOf(h), I = [], sig = [];
    const can = tags(hd, 'link').filter((t) => /(^|\s)canonical(\s|$)/i.test(t.a.rel || '')), ogs = tags(h, 'meta').filter((t) => (t.a.property || t.a.name || '').toLowerCase() === 'og:url'), tw = tags(h, 'meta').filter((t) => (t.a.name || t.a.property || '').toLowerCase() === 'twitter:url');
    const alt = tags(h, 'link').filter((t) => /alternate/i.test(t.a.rel || '') && t.a.hreflang);
    const cu = can.map((t) => ({ raw: t.a.href || '', u: norm(t.a.href || '', page?.href) }));
    for (const c of cu) { sig.push(['canonical', c.raw || '(empty)']); if (!c.raw) I.push(['ERROR', 'Canonical link has no href.']); else if (!isAbs(c.raw)) I.push([page ? 'WARN' : 'WARN', `Canonical is relative (${c.raw}); use an absolute URL.`]); }
    if (!can.length) I.push(['INFO', 'No canonical link in the head.']);
    if (can.length > 1) { const d = new Set(cu.map((c) => c.u?.href)); I.push([d.size > 1 ? 'ERROR' : 'WARN', d.size > 1 ? `${can.length} canonical links with different URLs: engines may ignore all of them.` : `${can.length} identical canonical links: keep one.`]); }
    if (hd !== h && /<link\b[^>]*rel=["']?canonical/i.test(h.slice(h.search(/<body\b/i) < 0 ? h.length : h.search(/<body\b/i)))) I.push(['REVIEW', 'A canonical link appears after <body> starts; canonical links belong in the head and may be ignored elsewhere.']);
    const ref = cu.find((c) => c.u)?.u || page, refName = cu.find((c) => c.u) ? 'canonical' : 'page URL';
    if (page && cu[0]?.u) { const d = urlDiff(page, cu[0].u); if (d.length) I.push(['INFO', `Canonical differs from the page URL (${d.join(', ')}). That is fine if this page is a duplicate; review if it is meant to be the main version.`]); }
    for (const [name, list] of [['og:url', ogs], ['twitter:url', tw]]) for (const t of list) {
      sig.push([name, t.a.content || '(empty)']); const u = norm(t.a.content || '', page?.href);
      if (!u) { I.push(['WARN', `${name} is empty or not a URL.`]); continue; }
      if (ref) { const d = urlDiff(u, ref); if (d.length) I.push(['WARN', `${name} (${t.a.content}) differs from the ${refName} in: ${d.join(', ')}. Social shares and the canonical point at different URLs.`]); }
    }
    if (ogs.length > 1) I.push(['WARN', `${ogs.length} og:url tags.`]);
    for (const t of alt) sig.push([`hreflang ${t.a.hreflang}`, t.a.href || '(empty)']);
    if (alt.length) {
      const self = alt.filter((t) => { const u = norm(t.a.href || '', page?.href); return u && ref && !urlDiff(u, ref).length; });
      if (!ref) I.push(['INFO', 'hreflang present but no canonical or page URL to compare with.']);
      else if (!self.length) { const near2 = alt.filter((t) => { const u = norm(t.a.href || '', page?.href); return u && urlDiff(u, ref).every((x) => x === 'trailing slash' || x === 'path case'); }); I.push(['WARN', near2.length ? `The hreflang self-reference (${near2[0].a.href}) differs from the ${refName} only in ${urlDiff(norm(near2[0].a.href, page?.href), ref).join(', ')}.` : `No hreflang entry points at the ${refName} (${ref.href}). Each page should list itself.`]); }
      if (!alt.some((t) => /^x-default$/i.test(t.a.hreflang))) I.push(['INFO', 'No x-default hreflang (optional).']);
    }
    if (!sig.length) throw new Error('No canonical, og:url or hreflang found.');
    return `${table(sig, ['Signal', 'URL'])}\n\nReference: ${ref ? `${refName} ${ref.href}` : '(none)'}\n\n${issues(I)}\n\nSignals are compared as parsed URLs. A mismatch is a thing to review, not always a fault; only a crawl shows what an engine chooses.`;
  },
});

tool({
  id: 'meta-refresh-detector', cat: 'SEO – On-page', title: 'Meta Refresh Redirect Detector', desc: 'Find meta refresh tags in pasted HTML, show delay and target, how Google reads them, and the equivalent 301 or 302 server rule.',
  labels: ['HTML source'], sample: HTML_SAMPLE, opts: [{ id: 'path', label: 'Path of this page (for the server rules)', type: 'text', def: '/old-page' }],
  run: ([h], { path }) => {
    need(h, 'HTML'); const found = tags(h.replace(/<!--[\s\S]*?-->/g, ''), 'meta').filter((t) => (t.a['http-equiv'] || '').toLowerCase() === 'refresh'); if (!found.length) return '[OK] No meta refresh tag found.\nCheck the HTTP response headers too: a Refresh header does the same job and cannot be seen in HTML.';
    const p = String(path || '/old-page').trim() || '/old-page', out = [];
    for (const t of found) {
      const m = (t.a.content || '').match(/^\s*(\d+(?:\.\d+)?)\s*(?:[;,]\s*(?:url\s*=\s*)?['"]?\s*([^'"]*?)\s*['"]?)?\s*$/i);
      if (!m) { out.push(`[WARN] Could not read content="${t.a.content || ''}".`); continue; }
      const sec = +m[1], target = m[2];
      if (!target) { out.push(`[WARN] Refresh every ${sec} s with no URL: the page reloads itself. Slow, wastes crawl budget and can disrupt users and screen readers.`); continue; }
      const inst = sec === 0, code = inst ? 301 : 302, abs = tryUrl(target, 'https://example.com')?.href;
      out.push(`Delay: ${sec} s   Target: ${target}\nGoogle: ${inst ? 'reads an instant (0 s) meta refresh as a permanent redirect' : 'reads a delayed meta refresh as a temporary redirect'} (per its redirect documentation).\nBetter: a server-side ${code} redirect, which is the most reliable signal and avoids a blank flash. Keep meta refresh only when you cannot change the server.\n${sec > 0 ? '[WARN] WCAG technique F40 lists a meta redirect with a time limit as a failure of 2.2.1, 2.2.4 and 3.2.5.\n' : ''}Apache:  Redirect ${code} ${p} ${target}\nnginx:   location = ${p} { return ${code} ${target}; }${abs && !isAbs(target) ? '\n(Relative target; use the full URL in the server rule if the redirect leaves the site.)' : ''}`);
    }
    return `${found.length} meta refresh tag(s)\n\n${out.join('\n\n')}\n\nOther engines may treat meta refresh differently from Google.`;
  },
});

const SH = '\n---\n';
tool({
  id: 'thin-content-detector', cat: 'SEO – Content', title: 'Thin Content Detector (Unique Words per Page)', desc: 'Paste several pages: shows total and unique words per page after removing text shared by most pages (menus, footers), and ranks the thinnest.',
  labels: ['Pages separated by a line containing ---. First line may be "URL: ..." (HTML is also accepted)'],
  sample: `URL: https://example.com/a\nHome Shop About Contact\nBlue widgets are durable and cheap. They come in three sizes and ship free in the EU. Our widgets are tested for years of daily use.\nCopyright Acme 2026. All rights reserved.\n---\nURL: https://example.com/b\nHome Shop About Contact\nBuy now.\nCopyright Acme 2026. All rights reserved.\n---\nURL: https://example.com/c\nHome Shop About Contact\nRed widgets: a long guide to colour, finish, coatings, care and warranty. The finish resists scratches and fading outdoors. Cleaning is simple with mild soap and water.\nCopyright Acme 2026. All rights reserved.`,
  opts: [{ id: 'min', label: 'Thin below this many unique words', type: 'number', def: 100 }, { id: 'share', label: 'Boilerplate: lines on at least this % of pages', type: 'number', def: 60 }],
  run: ([t], { min, share }) => {
    const pages = need(t, 'pages').split(/\r?\n---+\s*\r?\n/).map((s) => s.trim()).filter(Boolean); if (pages.length < 1) throw new Error('No pages found.');
    const P = pages.map((p, i) => { let url = ''; const m = p.match(/^URL:\s*(\S+)\s*\r?\n?/i); if (m) { url = m[1]; p = p.slice(m[0].length); } const html = /<(html|body|p|div|h1)\b/i.test(p); const body = html ? bodyText(p.replace(/<(p|div|li|h\d|br|tr)\b/gi, '\n<$1')) : p; const ls = (html ? p.replace(/<(script|style|head|noscript)\b[\s\S]*?<\/\1>/gi, '').replace(/<(p|div|li|h\d|br|tr|section|article)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, ' ').split(/\n/).map((l) => dec(l).replace(/\s+/g, ' ').trim()) : body.split(/\n/).map((l) => l.replace(/\s+/g, ' ').trim())).filter(Boolean); return { label: url || `page ${i + 1}: ${ls[0]?.slice(0, 40) || ''}`, ls }; });
    const df = new Map(); for (const p of P) for (const l of new Set(p.ls.map((x) => x.toLowerCase()))) df.set(l, (df.get(l) || 0) + 1);
    const th = Math.max(0.1, (+share || 60) / 100), useBp = P.length >= 3, wc = (s) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).length;
    const rows = P.map((p) => { let total = 0, uniq = 0, bp = 0; const seen = new Set(); for (const l of p.ls) { const w = wc(l); total += w; if (useBp && df.get(l.toLowerCase()) / P.length >= th) { bp += w; continue; } if (!seen.has(l.toLowerCase())) { seen.add(l.toLowerCase()); uniq += w; } } return { label: p.label, total, bp, uniq }; }).sort((a, b) => a.uniq - b.uniq);
    const lim = +min > 0 ? +min : 100;
    return `${P.length} pages, threshold ${lim} unique words${useBp ? '' : ' (boilerplate removal needs 3 or more pages)'}\n\n${table(rows.map((r) => [r.uniq < lim ? 'THIN' : 'ok', r.uniq, r.total, r.bp, r.label]), ['Status', 'Unique', 'Total', 'Shared', 'Page'])}\n\nShared = words in lines that repeat on ${Math.round(th * 100)}%+ of pages. Word count is only a hint: a short page can fully answer a query and a long one can still be thin.`;
  },
});

tool({
  id: 'duplicate-title-description-finder', cat: 'SEO – On-page', title: 'Duplicate Title and Meta Description Finder (Crawl CSV)', desc: 'Load a crawl export CSV (Screaming Frog style) and group the URLs that share the same title or meta description. Download the groups as CSV.',
  labels: ['Crawl export CSV with a header row'], sample: 'Address,Title 1,Meta Description 1\nhttps://example.com/,Acme Widgets,Buy widgets online.\nhttps://example.com/shop,Acme Widgets,Browse the shop.\nhttps://example.com/shop?page=2,Shop | Acme,Browse the shop.\nhttps://example.com/about,About | Acme,\nhttps://example.com/contact,about | acme,Contact us.',
  opts: [{ id: 'cu', label: 'URL column (blank = auto)', type: 'text', def: '' }, { id: 'ct', label: 'Title column', type: 'text', def: '' }, { id: 'cd', label: 'Description column', type: 'text', def: '' }, { id: 'ic', label: 'Ignore case and extra spaces', type: 'checkbox', def: true }],
  run: ([t], { cu, ct, cd, ic }) => {
    const rows = parseCsv(need(t, 'the CSV')); if (rows.length < 2) throw new Error('Need a header row and data rows.'); const hd = rows.shift();
    const iu = colIndex(hd, cu, /^(address|url|page|landing page|loc)$/, 'URL column'), it = colIndex(hd, ct, /^(title( 1)?|page title|meta title|title tag)$/, 'Title column'), id = colIndex(hd, cd, /^(meta description( 1)?|description|meta desc.*)$/, 'Description column');
    if (iu < 0 || (it < 0 && id < 0)) throw new Error('Could not find a URL column and a title or description column. Name them in the options.');
    const k = (s) => (ic ? s.toLowerCase().replace(/\s+/g, ' ').trim() : s.trim()); let out = '', csv = [['type', 'group', 'text', 'url']], total = 0;
    for (const [name, ix] of [['Title', it], ['Description', id]]) {
      if (ix < 0) continue; const m = new Map(); let empty = 0;
      for (const r of rows) { const v = (r[ix] || '').trim(); if (!v) { empty++; continue; } const key = k(v); (m.get(key) || m.set(key, { text: v, urls: [] }).get(key)).urls.push(r[iu] || ''); }
      const g = [...m.values()].filter((x) => x.urls.length > 1).sort((a, b) => b.urls.length - a.urls.length); total += g.length;
      out += `${head(`${name}: ${g.length} duplicate group(s), ${g.reduce((a, x) => a + x.urls.length, 0)} URLs, ${empty} empty`)}${g.length ? g.map((x, i) => { x.urls.forEach((u) => csv.push([name.toLowerCase(), i + 1, x.text, u])); return `"${x.text}"  (${x.urls.length} URLs)\n${x.urls.map((u) => '  ' + u).join('\n')}`; }).join('\n\n') : '[OK] None.'}`;
    }
    const s = toCsv(csv);
    return { text: `${rows.length} rows${out}`, blob: total ? new Blob([s], { type: 'text/csv' }) : undefined, filename: 'duplicate-groups.csv' };
  },
});

tool({
  id: 'bulk-title-truncation-preview', cat: 'SEO – On-page', title: 'Bulk Title Truncation Preview (CSV)', desc: 'Check many titles at once: estimated pixel width, desktop and mobile cut-off, and where the ellipsis would fall. Edit the list and re-run to test rewrites.',
  labels: ['Titles, one per line, or a CSV with a "title" column'], sample: 'url,title\nhttps://example.com/,Acme Widgets\nhttps://example.com/guide,The Complete Guide to Choosing Blue Widgets for Every Garden Shed Workshop and Home in 2026 | Acme\nhttps://example.com/shop,Shop Widgets Online - Free Delivery and Easy Returns | Acme',
  opts: [{ id: 'dmax', label: 'Desktop limit (px)', type: 'number', def: 600 }, { id: 'mmax', label: 'Mobile limit (px)', type: 'number', def: 580 }],
  run: ([t], { dmax, mmax }) => {
    need(t, 'titles'); let items; const rows = parseCsv(t), h = rows[0]?.map((x) => x.trim().toLowerCase()) || [], ti = h.findIndex((x) => /^(title( 1)?|page title|title tag)$/.test(x)), ui = h.findIndex((x) => /^(url|address|page)$/.test(x));
    items = ti >= 0 ? rows.slice(1).map((r) => ({ t: (r[ti] || '').trim(), u: ui >= 0 ? r[ui] : '' })) : lines(t).map((l) => ({ t: l, u: '' }));
    if (items.length > 5000) throw new Error('Too many titles (max 5000).');
    const D = +dmax > 0 ? +dmax : 600, M = +mmax > 0 ? +mmax : 580;
    const cut = (s, max) => { if (px(s, 20) <= max) return null; let i = s.length; while (i > 0 && px(s.slice(0, i) + '…', 20) > max) i--; return i; };
    const R = items.map((x, n) => { const w = px(x.t, 20), cd = cut(x.t, D), cm = cut(x.t, M); return [n + 1, x.t.length, w, cd == null ? 'fits' : 'cut', cm == null ? 'fits' : 'cut', cd == null ? x.t : x.t.slice(0, cd).trimEnd() + ' <<CUT>> ' + x.t.slice(cd), x.u]; });
    const over = R.filter((r) => r[3] === 'cut').length;
    return `${R.length} titles, ${over} cut on desktop (${D}px), ${R.filter((r) => r[4] === 'cut').length} on mobile (${M}px)\n\n${table(R.map((r) => [r[0], r[1], r[2] + 'px', r[3], r[4], r[5] + (r[6] ? '   ' + r[6] : '')]), ['#', 'Chars', 'Width', 'Desktop', 'Mobile', 'Preview (text after <<CUT>> is hidden on desktop)'])}\n\nWidths are estimated from Arial-like metrics at 20px and the limits are adjustable estimates. Search engines use their own fonts, may rewrite titles, and measure real pixels.`;
  },
});

const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());
tool({
  id: 'breadcrumb-trail-builder', cat: 'SEO – Generators', title: 'Breadcrumb Trail Builder (HTML and JSON-LD)', desc: 'Turn a URL path into breadcrumb navigation HTML plus matching BreadcrumbList JSON-LD. Rename any level.',
  labels: ['Page URL', 'Optional renames, one per line: segment = Label'], inputs: 2, sample: 'https://example.com/guides/seo-basics/title-tags/', sample2: 'seo-basics = SEO Basics',
  opts: [{ id: 'home', label: 'Home label', type: 'text', def: 'Home' }, { id: 'link', label: 'Link the last item', type: 'checkbox', def: false }],
  run: ([u, r], { home, link }) => {
    const p = tryUrl(need(u, 'a page URL').trim()); if (!p || !/^https?:$/.test(p.protocol)) throw new Error('Enter an absolute http(s) URL.');
    const map = Object.fromEntries(lines(r).map((l) => l.split(/\s*=\s*/)).filter((x) => x.length >= 2).map((x) => [x[0].toLowerCase(), x.slice(1).join('=')]));
    const segs = p.pathname.split('/').filter(Boolean).map((s) => { let d = s; try { d = decodeURIComponent(s); } catch { /* keep */ } return d; }), slash = p.pathname.endsWith('/');
    const items = [{ name: String(home || 'Home'), url: p.origin + '/' }];
    segs.forEach((s, i) => { const last = i === segs.length - 1; items.push({ name: map[s.toLowerCase()] || titleCase(last ? s.replace(/\.\w+$/, '') : s), url: p.origin + '/' + segs.slice(0, i + 1).map(encodeURIComponent).join('/') + (!last || slash ? '/' : '') }); });
    const li = items.map((it, i) => { const last = i === items.length - 1; return last && !link ? `    <li aria-current="page">${esc(it.name)}</li>` : `    <li><a href="${esc(it.url)}"${last ? ' aria-current="page"' : ''}>${esc(it.name)}</a></li>`; }).join('\n');
    const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, ...(i < items.length - 1 || link ? { item: it.url } : {}) })) };
    return `<nav aria-label="Breadcrumb">\n  <ol>\n${li}\n  </ol>\n</nav>\n\n<script type="application/ld+json">\n${JSON.stringify(ld, null, 2).replace(/</g, '\\u003c')}\n</script>\n\n<!-- Names come from URL segments: check them. In JSON-LD the last item may omit "item". The visible trail and the markup must match the page. -->`;
  },
});

const pageNo = (u) => { const m = u && (u.match(/[?&](?:page|p|pg|paged|pagenum)=(\d+)/i) || u.match(/\/page[-/](\d+)(?:\/|$)/i) || u.match(/\/p(\d+)\/?$/i)); return m ? +m[1] : null; };
tool({
  id: 'pagination-link-checker', cat: 'SEO – Technical', title: 'Pagination Link and Canonical Checker', desc: 'Review a paginated series from pasted HTML: self-referencing canonicals, canonical pointing to page 1, prev/next consistency, fragment links and noindex.',
  labels: ['Pages separated by a line ---. Start each with "URL: https://..." then its HTML'],
  sample: `URL: https://example.com/blog/\n<head><title>Blog</title><link rel="canonical" href="https://example.com/blog/"><link rel="next" href="https://example.com/blog/?page=2"></head>\n---\nURL: https://example.com/blog/?page=2\n<head><title>Blog page 2</title><link rel="canonical" href="https://example.com/blog/"><link rel="prev" href="https://example.com/blog/"><link rel="next" href="https://example.com/blog/?page=3"></head>\n---\nURL: https://example.com/blog/?page=3\n<head><title>Blog page 3</title><meta name="robots" content="noindex"><link rel="canonical" href="https://example.com/blog/?page=3"><link rel="prev" href="https://example.com/blog/?page=1"></head><body><a href="#page=4">Next</a></body>`,
  run: ([t]) => {
    const pages = need(t, 'pages').split(/\r?\n---+\s*\r?\n/).map((s) => s.trim()).filter(Boolean).map((p, i) => { const m = p.match(/^URL:\s*(\S+)\s*\r?\n?/i), html = m ? p.slice(m[0].length) : p; const hd = headOf(html), rel = (n) => tags(hd, 'link').filter((x) => (x.a.rel || '').toLowerCase().split(/\s+/).includes(n)).map((x) => x.a.href || ''); const robots = tags(hd, 'meta').find((x) => (x.a.name || '').toLowerCase() === 'robots')?.a.content || ''; return { n: i + 1, url: m ? m[1] : '', can: rel('canonical'), prev: rel('prev')[0], next: rel('next')[0], robots, html }; });
    const I = [], rows = [], key = (u) => { const p = tryUrl(u); return p ? p.origin + p.pathname + p.search : u; }, byUrl = new Map(pages.filter((p) => p.url).map((p) => [key(p.url), p]));
    for (const p of pages) {
      const no = pageNo(p.url), id = `Page ${p.n}${p.url ? ' ' + p.url : ''}`, c = p.can[0] && tryUrl(p.can[0], p.url || undefined);
      rows.push([p.n, p.url || '(no URL)', no ?? (p.url ? 1 : '?'), p.can[0] || '(none)', p.prev ? 'yes' : '-', p.next ? 'yes' : '-', p.robots || '-']);
      if (!p.can.length) I.push(['WARN', `${id}: no canonical link.`]);
      if (p.can.length > 1) I.push(['WARN', `${id}: ${p.can.length} canonical links.`]);
      if (c && p.url && no && no > 1 && !pageNo(c.href)) I.push(['ERROR', `${id}: canonical points to ${c.href}, which looks like the first page. Google advises against using page one as the canonical for the series; give each page its own canonical.`]);
      else if (c && p.url && key(c.href) !== key(p.url) && (no || pageNo(c.href))) I.push(['REVIEW', `${id}: canonical (${c.href}) is not the page's own URL.`]);
      if (/noindex/i.test(p.robots) && (p.next || p.prev)) I.push(['REVIEW', `${id}: noindex with prev/next links; links on a long-term noindex page may stop being followed.`]);
      for (const m of p.html.matchAll(/<a\b[^>]*href\s*=\s*["']?#[^"'\s>]*(?:page|p)=?\d+/gi)) { I.push(['WARN', `${id}: a pagination link uses a #fragment (${m[0].replace(/^.*href\s*=\s*["']?/i, '')}). Google ignores fragments, so the next page may not be found.`]); break; }
      for (const [d, ref, back] of [['next', p.next, 'prev'], ['prev', p.prev, 'next']]) { if (!ref) continue; const q = byUrl.get(key(tryUrl(ref, p.url || undefined)?.href || ref)); if (q && q[back] && p.url && key(tryUrl(q[back], q.url || undefined)?.href || q[back]) !== key(p.url)) I.push(['WARN', `${id}: rel=${d} goes to page ${q.n}, but its rel=${back} points elsewhere (${q[back]}).`]); else if (q && !q[back]) I.push(['INFO', `${id}: page ${q.n} has no rel=${back} back to it.`]); }
      if (!p.url) I.push(['INFO', `${id}: add a "URL:" line for URL-based checks.`]);
    }
    if (pages.length < 2) I.push(['INFO', 'Paste two or more pages of the series to check prev/next consistency.']);
    return `${pages.length} page(s)\n\n${table(rows, ['#', 'URL', 'Page', 'Canonical', 'prev', 'next', 'robots'])}\n\n${issues(I)}\n\nGoogle's guidance (pagination docs): it no longer uses rel=prev/next as an indexing signal, other engines may; each page needs its own URL and its own canonical; fragments are ignored. Page numbers are guessed from ?page=, /page/N and /pN patterns.`;
  },
});

const LEGACY = ['revisit-after', 'distribution', 'rating', 'classification', 'doc-type', 'document-type', 'document-class', 'resource-type', 'page-topic', 'page-type', 'audience', 'coverage', 'expires', 'pragma', 'cache-control'];
tool({
  id: 'meta-keywords-remover', cat: 'SEO – On-page', title: 'Legacy Meta Tag Remover (meta keywords and more)', desc: 'Strip the meta keywords tag and other obsolete meta tags from a pasted head block, and list exactly what was removed.',
  labels: ['HTML head or page source'], sample: HTML_SAMPLE.replace('<meta http-equiv="refresh" content="5; url=/widgets/blue-new">', '<meta name="revisit-after" content="7 days">\n<meta name="rating" content="general">'),
  opts: [{ id: 'legacy', label: 'Also remove other legacy tags (revisit-after, distribution, rating, ...)', type: 'checkbox', def: true }],
  run: ([h], { legacy }) => {
    need(h, 'HTML'); const removed = [], names = new Set(['keywords', ...(legacy ? LEGACY : [])]);
    const out = h.replace(/[ \t]*<meta\b[^>]*>[ \t]*\r?\n?/gi, (m) => { const a = parseAttrs(m.replace(/^[ \t]*<meta\b/i, '').replace(/>[ \t\r\n]*$/, '')), k = (a.name || a['http-equiv'] || '').toLowerCase(); if (names.has(k)) { removed.push(m.trim()); return ''; } return m; });
    return `${out}\n\n<!-- Removed ${removed.length} tag(s)${removed.length ? ':\n' + removed.map((r) => r.replace(/--/g, '- -')).join('\n') : '. Nothing matched.'} -->\n<!-- Google has said it does not use the meta keywords tag. The legacy list is my own judgement of tags no major engine documents: review before shipping. -->`;
  },
});

const cssColor = (v) => /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) || /^(rgb|rgba|hsl|hsla)\(\s*[\d.%\s,\/-]+\)$/i.test(v);
tool({
  id: 'theme-color-meta-generator', cat: 'SEO – Generators', title: 'Theme Color Meta Tag Generator (Light and Dark)', desc: 'Create theme-color meta tags for light and dark mode with prefers-color-scheme media attributes, with a preview of the browser toolbar in each mode.',
  inputs: 0, sample: '', opts: [{ id: 'light', label: 'Light mode color (hex)', type: 'text', def: '#ffffff' }, { id: 'dark', label: 'Dark mode color (hex)', type: 'text', def: '#0b0f19' }, { id: 'cs', label: 'Add color-scheme meta (light dark)', type: 'checkbox', def: true }],
  run: (_i, { light, dark, cs }) => {
    const l = String(light).trim(), d = String(dark).trim(); for (const [n, v] of [['Light', l], ['Dark', d]]) if (!cssColor(v)) throw new Error(`${n} color must be a hex, rgb() or hsl() color.`);
    const tg = `<meta name="theme-color" content="${esc(l)}" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="${esc(d)}" media="(prefers-color-scheme: dark)">${cs ? '\n<meta name="color-scheme" content="light dark">' : ''}`;
    const bar2 = (c, label, bg, fg) => `<div class="m"><div class="bar" style="background:${esc(c)}"><span class="dots"></span><span class="url">example.com</span></div><div class="pg" style="background:${bg};color:${fg}">${label} page</div></div>`;
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:12px;font:14px system-ui,sans-serif;display:flex;gap:12px;flex-wrap:wrap}.m{width:210px;border:1px solid #888;border-radius:10px;overflow:hidden}.bar{height:34px;display:flex;align-items:center;gap:8px;padding:0 10px}.dots{width:30px;height:8px;border-radius:4px;background:rgba(128,128,128,.6)}.url{font-size:12px;background:rgba(255,255,255,.75);border-radius:10px;padding:2px 10px;color:#222}.pg{height:90px;display:flex;align-items:center;justify-content:center}</style>${bar2(l, 'Light', '#fff', '#111')}${bar2(d, 'Dark', '#111', '#eee')}`;
    return { text: `${tg}\n\nAlso set "theme_color" in your web app manifest if you have one. Support differs by browser (mostly mobile Chrome and Safari); browsers that ignore the media attribute may use the first tag. The preview is a simple mock.`, html };
  },
});

const sigs = (h) => {
  const hd = headOf(h), meta = (n) => tags(h, 'meta').filter((t) => (t.a.name || t.a.property || '').toLowerCase() === n).map((t) => t.a.content || '');
  const S = new Map(), add = (k, v) => (S.get(k) || S.set(k, new Set()).get(k)).add(v);
  for (const t of pairs(hd, 'title')) add('title', t.text);
  for (const n of ['description', 'robots', 'og:title', 'og:description', 'og:url', 'og:image', 'twitter:card']) for (const v of meta(n)) add(n, v);
  for (const t of tags(h, 'link')) { const r = (t.a.rel || '').toLowerCase(); if (r === 'canonical') add('canonical', t.a.href || ''); else if (/alternate/.test(r) && t.a.hreflang) add('hreflang ' + t.a.hreflang, t.a.href || ''); }
  for (const n of [1, 2]) for (const t of pairs(h, `h${n}`)) add(`h${n}`, t.text);
  for (const t of tags(h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ''), 'a')) if (t.a.href && !/^(#|javascript:)/i.test(t.a.href)) add('link', t.a.href + (/nofollow/i.test(t.a.rel || '') ? '  [nofollow]' : ''));
  for (const t of pairs(h, 'script')) if (/ld\+json/i.test(t.a.type || '')) { try { const j = JSON.parse(t.inner), arr = Array.isArray(j) ? j : j['@graph'] || [j]; for (const o of arr) add('structured data', [].concat(o['@type'] || '(no @type)').join('/')); } catch { add('structured data', '(invalid JSON-LD)'); } }
  return S;
};
tool({
  id: 'rendered-vs-raw-html-diff', cat: 'SEO – Technical', title: 'Rendered vs Raw HTML SEO Diff (JavaScript-Injected Tags)', desc: 'Paste the view-source HTML and the rendered DOM: lists the title, canonical, robots, headings, links and structured data that only exist, or change, after JavaScript runs.',
  labels: ['Raw HTML (view-source)', 'Rendered HTML (DOM after JavaScript)'], inputs: 2,
  sample: '<html><head><title>Shop</title><meta name="robots" content="index"></head><body><div id="app"></div><a href="/about">About</a></body></html>',
  sample2: '<html><head><title>Blue Widgets | Shop</title><meta name="robots" content="noindex"><link rel="canonical" href="https://example.com/blue"><script type="application/ld+json">{"@type":"Product","name":"Blue Widget"}</script></head><body><h1>Blue Widgets</h1><a href="/about">About</a><a href="/blue/reviews">Reviews</a></body></html>',
  run: ([a, b]) => {
    const A = sigs(need(a, 'the raw HTML')), B = sigs(need(b, 'the rendered HTML')), keys = [...new Set([...A.keys(), ...B.keys()])], onlyR = [], onlyA = [], ch = [];
    for (const k of keys) { const x = A.get(k) || new Set(), y = B.get(k) || new Set(), add = [...y].filter((v) => !x.has(v)), rem = [...x].filter((v) => !y.has(v)); if (!add.length && !rem.length) continue; if (!x.size) onlyR.push(...add.map((v) => `${k}: ${v}`)); else if (!y.size) onlyA.push(...rem.map((v) => `${k}: ${v}`)); else ch.push(`${k}\n    raw:      ${[...x].join(' | ')}\n    rendered: ${[...y].join(' | ')}`); }
    const crit = ['robots', 'canonical'].filter((k) => (A.get(k) && B.get(k) && [...A.get(k)].join() !== [...B.get(k)].join()) || (!A.get(k) && B.get(k)));
    return `${keys.length} signal types compared\n${crit.length ? `\n[REVIEW] ${crit.join(' and ')} differ between raw and rendered HTML. Engines may act on either version, so keep them the same.\n` : ''}${head(`Only in rendered HTML (${onlyR.length})`)}${onlyR.join('\n') || '(none)'}${head(`Only in raw HTML, gone after rendering (${onlyA.length})`)}${onlyA.join('\n') || '(none)'}${head(`Changed (${ch.length})`)}${ch.join('\n') || '(none)'}\n\nCopy the rendered version from DevTools (Elements, Copy outerHTML). Links are compared by their href text only. Content that exists only after JavaScript depends on the engine rendering your page.`;
  },
});

export default T;

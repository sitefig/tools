// SEO tools. All input is PASTED (HTML source, headers, robots.txt, URL lists): a web page cannot fetch other sites (CORS).
// HTML is parsed with small regex helpers (no DOMParser) so every tool runs under Node; none needs dom:true.
//
// SKIPPED (need a server / API / account / live crawl, cannot be done client-side):
//   backlink analysis, rank tracking, search volume / keyword difficulty, live site crawling, PageSpeed / Core Web Vitals
//   lab data, indexation checks, live HTTP header / redirect-chain fetching, Open Graph image size checker (not requested).
// Approximations (documented in tool output): SERP pixel widths use an Arial width table; syllable counts are English heuristics.

// ---------- shared helpers ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const dec = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { try { return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)); } catch { return m; } }
  return ENT[e.toLowerCase()] ?? m;
});
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = (s) => dec(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const need = (s, what = 'input') => { if (!String(s).trim()) throw new Error(`Paste ${what} first.`); return String(s); };
const parseAttrs = (s) => {
  const o = {};
  s.replace(/([^\s=\/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, (m, k, a, b, c) => { k = k.toLowerCase(); if (!(k in o)) o[k] = dec(a ?? b ?? c ?? ''); return m; });
  return o;
};
const tags = (html, name) => [...html.matchAll(new RegExp(`<(?:${name})\\b([^>]*)>`, 'gi'))].map((m) => ({ a: parseAttrs(m[1]), i: m.index }));
const pairs = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)</${name}\\s*>`, 'gi'))].map((m) => ({ a: parseAttrs(m[1]), inner: m[2], text: strip(m[2]), i: m.index }));
const bodyText = (html) => dec(html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const metaOf = (html) => {
  const m = {};
  for (const t of tags(html, 'meta')) { const k = (t.a.name || t.a.property || t.a['http-equiv'] || '').toLowerCase(); if (k) (m[k] ||= []).push(t.a.content ?? ''); }
  return m;
};
const links = (html, rel) => tags(html, 'link').filter((t) => (t.a.rel || '').toLowerCase().split(/\s+/).includes(rel));
const SEV = { ERROR: 0, WARN: 1, INFO: 2, OK: 3 };
const issues = (list) => list.slice().sort((a, b) => SEV[a[0]] - SEV[b[0]]).map(([s, m]) => `[${s}] ${m}`).join('\n') || '[OK] No issues found.';
const head = (t) => `\n=== ${t} ===\n`;
const table = (rows, cols) => {
  const w = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => String(r[i] ?? '').length)));
  const line = (r) => r.map((c, i) => String(c ?? '').padEnd(w[i])).join('  ').trimEnd();
  return [line(cols), line(w.map((n) => '-'.repeat(n))), ...rows.map(line)].join('\n');
};
const kv = (text) => text.split(/\r?\n/).map((l) => l.match(/^\s*([\w.@\-]+)\s*:\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]);
const kvo = (text) => { const o = {}; for (const [k, v] of kv(text)) o[k.toLowerCase()] = v; return o; };
const lines = (t) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const today = () => new Date().toISOString().slice(0, 10);
const isAbs = (u) => /^https?:\/\/[^\s/]+/i.test(u);
const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const tryUrl = (u, base) => { try { return new URL(u, base); } catch { return null; } };

// Arial-ish advance widths (em) -> estimated pixels. Approximation, Google uses its own fonts.
const px = (s, size) => {
  let w = 0;
  for (const c of s) {
    w += /[ijl.,:;'|!I\u2019 ft]/.test(c) ? 0.27 : /[r()\-[\]{}"]/.test(c) ? 0.34 : c === 'm' || c === 'M' ? 0.83 : c === 'W' ? 0.94 : c === 'w' ? 0.72
      : /[A-Z]/.test(c) ? 0.69 : /[a-z]/.test(c) ? 0.54 : /[0-9]/.test(c) ? 0.556 : c.charCodeAt(0) > 0x2e80 ? 1 : 0.6;
  }
  return Math.round(w * size);
};
const clip = (s, size, max) => { if (px(s, size) <= max) return s; let o = s; while (o && px(o + '…', size) > max) o = o.slice(0, -1); return o.trimEnd() + '…'; };

const STOP = new Set(`a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours also may might shall us per via etc ie eg`.split(/\s+/));
const words = (t) => t.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) || [];
const sentencesOf = (t) => t.split(/[.!?…]+(?:\s+|$)|\n{2,}/).map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s));
const syl = (w) => {
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 1; if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, (w.match(/[aeiouy]{1,2}/g) || []).length);
};
const ngrams = (toks, n, filterStop) => {
  const out = [];
  for (let i = 0; i + n <= toks.length; i++) {
    const g = toks.slice(i, i + n);
    if (filterStop && (STOP.has(g[0]) || STOP.has(g[n - 1]))) continue;
    out.push(g.join(' '));
  }
  return out;
};
const count = (arr) => { const m = new Map(); for (const x of arr) m.set(x, (m.get(x) || 0) + 1); return m; };
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);

// JSON-LD helpers (shared by inspector and generator)
const REQ = {
  Article: ['headline', 'image', 'datePublished', 'author'], Product: ['name', 'image', 'offers'], LocalBusiness: ['name', 'address'],
  FAQPage: ['mainEntity'], Organization: ['name', 'url'], BreadcrumbList: ['itemListElement'], Event: ['name', 'startDate', 'location'],
  Recipe: ['name', 'image', 'recipeIngredient'], Person: ['name'], WebSite: ['name', 'url'], VideoObject: ['name', 'description', 'thumbnailUrl', 'uploadDate'],
  HowTo: ['name', 'step'],
};
const ALIAS = { NewsArticle: 'Article', BlogPosting: 'Article', TechArticle: 'Article', Restaurant: 'LocalBusiness', Store: 'LocalBusiness', Dentist: 'LocalBusiness', Hotel: 'LocalBusiness', ProfessionalService: 'LocalBusiness' };
const reqFor = (type) => REQ[ALIAS[type] || type];
const ldBlocks = (html) => pairs(html, 'script').filter((s) => /ld\+json/i.test(s.a.type || ''));

// ---------- HTML report tools ----------
function inspect(html) {
  const out = [], I = [];
  const titles = pairs(html, 'title').map((t) => t.text), m = metaOf(html);
  const desc = m.description?.[0], canon = links(html, 'canonical'), robots = (m.robots || []).join(',').toLowerCase();
  const htmlTag = tags(html, 'html')[0], lang = htmlTag?.a.lang;
  const hs = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].map((x) => [+x[1], strip(x[2])]);
  const imgs = tags(html, 'img'), as = pairs(html, 'a');
  const ld = ldBlocks(html), text = bodyText(html), wc = words(text).length;

  if (!titles.length) I.push(['ERROR', 'Missing <title>.']);
  else {
    if (titles.length > 1) I.push(['WARN', `${titles.length} <title> tags found.`]);
    const t = titles[0];
    if (!t) I.push(['ERROR', '<title> is empty.']);
    else if (t.length < 30) I.push(['WARN', `Title is short (${t.length} chars); aim for 30-60.`]);
    else if (t.length > 60 || px(t, 20) > 600) I.push(['WARN', `Title may be truncated in Google (${t.length} chars, ~${px(t, 20)}px of ~600px).`]);
  }
  if (!desc) I.push(['WARN', 'Missing meta description.']);
  else if (desc.length < 70) I.push(['WARN', `Meta description is short (${desc.length} chars); aim for 70-160.`]);
  else if (desc.length > 160) I.push(['WARN', `Meta description is long (${desc.length} chars); likely truncated past ~160.`]);
  if (!canon.length) I.push(['WARN', 'No rel=canonical link.']);
  else {
    if (canon.length > 1) I.push(['ERROR', 'Multiple canonical links; search engines may ignore them.']);
    if (!isAbs(canon[0].a.href || '')) I.push(['WARN', `Canonical should be an absolute URL (found "${canon[0].a.href || ''}").`]);
  }
  if (/noindex/.test(robots)) I.push(['ERROR', `Robots meta contains noindex ("${robots}"): page will be excluded from search results.`]);
  if (/nofollow/.test(robots)) I.push(['WARN', 'Robots meta contains nofollow: links on this page pass no signals.']);
  if (!m.viewport) I.push(['ERROR', 'Missing meta viewport (not mobile friendly).']);
  else if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/i.test(m.viewport[0])) I.push(['WARN', 'Viewport blocks zooming (accessibility issue).']);
  if (!lang) I.push(['WARN', '<html> has no lang attribute.']);
  if (!tags(html, 'meta').some((t) => t.a.charset || /content-type/i.test(t.a['http-equiv'] || ''))) I.push(['WARN', 'No charset declared (<meta charset="utf-8">).']);
  const h1 = hs.filter((h) => h[0] === 1);
  if (!h1.length) I.push(['ERROR', 'No <h1> found.']); else if (h1.length > 1) I.push(['WARN', `${h1.length} <h1> elements; prefer exactly one.`]);
  for (let i = 1; i < hs.length; i++) if (hs[i][0] > hs[i - 1][0] + 1) { I.push(['WARN', `Heading level skipped: h${hs[i - 1][0]} -> h${hs[i][0]} ("${hs[i][1].slice(0, 40)}").`]); break; }
  const noAlt = imgs.filter((i) => i.a.alt === undefined).length, emptyAlt = imgs.filter((i) => i.a.alt === '').length;
  if (noAlt) I.push(['WARN', `${noAlt} image(s) missing the alt attribute.`]);
  if (emptyAlt) I.push(['INFO', `${emptyAlt} image(s) have empty alt (fine only for decorative images).`]);
  const og = Object.keys(m).filter((k) => k.startsWith('og:')), tw = Object.keys(m).filter((k) => k.startsWith('twitter:'));
  if (!og.length) I.push(['WARN', 'No Open Graph tags (poor social sharing previews).']);
  else for (const k of ['og:title', 'og:image', 'og:url', 'og:type', 'og:description']) if (!m[k]) I.push(['INFO', `Missing ${k}.`]);
  if (!tw.length) I.push(['INFO', 'No Twitter card tags (falls back to Open Graph).']);
  if (!ld.length) I.push(['INFO', 'No JSON-LD structured data.']);
  if (!links(html, 'icon').length && !links(html, 'shortcut icon').length) I.push(['INFO', 'No favicon link.']);
  const empty = as.filter((a) => !a.text && !/<img[^>]+alt=["'][^"']+/i.test(a.inner) && !a.a['aria-label']).length;
  if (empty) I.push(['WARN', `${empty} link(s) have no anchor text.`]);
  if (wc < 300) I.push(['INFO', `Thin content: only ${wc} words of visible text.`]);

  out.push(head('Issues'), issues(I));
  out.push(head('Basics'), table([
    ['Title', titles[0] ? `${titles[0]} (${titles[0].length} chars)` : '(none)'],
    ['Description', desc ? `${desc} (${desc.length} chars)` : '(none)'],
    ['Canonical', canon[0]?.a.href || '(none)'], ['Robots', robots || '(none)'], ['Viewport', m.viewport?.[0] || '(none)'],
    ['Lang', lang || '(none)'], ['Words', wc],
  ], ['Field', 'Value']));
  out.push(head('Headings'), hs.length ? hs.map(([l, t]) => `${'  '.repeat(l - 1)}h${l} ${t}`).join('\n') : '(none)');
  out.push(head('Images'), `${imgs.length} total, ${noAlt} missing alt, ${emptyAlt} empty alt, ${imgs.filter((i) => i.a.loading === 'lazy').length} lazy-loaded`);
  const ext = as.filter((a) => /^https?:/i.test(a.a.href || '')).length;
  out.push(head('Links'), `${as.length} anchors (${ext} absolute http(s)), ${as.filter((a) => /nofollow/i.test(a.a.rel || '')).length} nofollow`);
  out.push(head('Social'), `Open Graph: ${og.length ? og.map((k) => `${k}=${m[k][0].slice(0, 60)}`).join('\n  ') : 'none'}\nTwitter: ${tw.length ? tw.map((k) => `${k}=${m[k][0].slice(0, 60)}`).join('\n  ') : 'none'}`);
  out.push(head('Structured data'), ld.length ? `${ld.length} JSON-LD block(s): ${ld.map((b) => { try { return [].concat(JSON.parse(b.inner)).map((o) => o['@type'] || (o['@graph'] ? '@graph' : '?')).join('+'); } catch { return 'INVALID JSON'; } }).join(', ')}` : 'none');
  return out.join('\n').trim();
}

const SAMPLE_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Free SEO Tools - Analyze Your Pages in the Browser | Example</title>
<meta name="description" content="Free, private SEO tools that run entirely in your browser. Inspect meta tags, headings, links and structured data without uploading anything.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="https://example.com/seo-tools">
<link rel="alternate" hreflang="en" href="https://example.com/seo-tools">
<link rel="alternate" hreflang="nl" href="https://example.com/nl/seo-tools">
<link rel="alternate" hreflang="x-default" href="https://example.com/seo-tools">
<meta property="og:title" content="Free SEO Tools">
<meta property="og:description" content="Private SEO tools in your browser.">
<meta property="og:image" content="https://example.com/img/og.png">
<meta property="og:url" content="https://example.com/seo-tools">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example","url":"https://example.com"}</script>
</head><body>
<h1>Free SEO Tools</h1>
<p>Analyze your pages. <a href="/pricing">Pricing</a> <a href="https://other.com/page" rel="nofollow">Partner</a> <a href="/about">click here</a></p>
<h3>Skipped level</h3>
<img src="/img/hero.jpg" width="800" height="400" loading="lazy" alt="Hero image">
<img src="/img/IMG_0012.png">
<button></button><input type="text" id="q"><div onclick="go()">Go</div>
</body></html>`;

const T = []; // tool list
const tool = (t) => T.push({ inputs: 1, ...t });

tool({ id: 'seo-inspector', cat: 'SEO – On-page', title: 'SEO Page Inspector', desc: 'Paste HTML source: full on-page report with prioritized issues.', labels: ['HTML source'], sample: SAMPLE_HTML, run: ([h]) => inspect(need(h, 'HTML source')) });

tool({
  id: 'heading-analyzer', cat: 'SEO – On-page', title: 'Heading Structure Analyzer', desc: 'Heading hierarchy tree, missing H1, skipped levels, empty headings.', labels: ['HTML source'], sample: SAMPLE_HTML,
  run: ([h]) => {
    const hs = [...need(h, 'HTML').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].map((x) => [+x[1], strip(x[2])]);
    const I = [];
    const n1 = hs.filter((x) => x[0] === 1).length;
    if (!n1) I.push(['ERROR', 'No H1.']); else if (n1 > 1) I.push(['WARN', `${n1} H1 elements.`]);
    if (hs.length && hs[0][0] !== 1) I.push(['WARN', `First heading is h${hs[0][0]}, not h1.`]);
    hs.forEach(([l, t], i) => {
      if (!t) I.push(['WARN', `Empty h${l} (#${i + 1}).`]);
      if (i && l > hs[i - 1][0] + 1) I.push(['WARN', `Skipped level h${hs[i - 1][0]} -> h${l} at "${t.slice(0, 50)}".`]);
      if (t.length > 70) I.push(['INFO', `Long h${l} (${t.length} chars): "${t.slice(0, 40)}..."`]);
    });
    const dup = [...count(hs.map((x) => x[1].toLowerCase()))].filter(([k, v]) => k && v > 1);
    for (const [k, v] of dup) I.push(['INFO', `Duplicate heading text x${v}: "${k}"`]);
    return `Headings: ${hs.length}  (${[1, 2, 3, 4, 5, 6].map((l) => `h${l}:${hs.filter((x) => x[0] === l).length}`).join(' ')})\n${head('Issues')}${issues(I)}\n${head('Outline')}${hs.map(([l, t]) => `${'  '.repeat(l - 1)}h${l}  ${t || '(empty)'}`).join('\n') || '(none)'}`;
  },
});

tool({
  id: 'image-seo', cat: 'SEO – On-page', title: 'Image SEO Audit', desc: 'Alt text, dimensions, lazy loading, format and filename audit from HTML.', labels: ['HTML source'], sample: SAMPLE_HTML,
  run: ([h]) => {
    const imgs = tags(need(h, 'HTML'), 'img');
    if (!imgs.length) return 'No <img> tags found.';
    const I = [], rows = [];
    imgs.forEach(({ a }, n) => {
      const src = a.src || a['data-src'] || '(no src)', f = src.split(/[?#]/)[0].split('/').pop(), ext = (f.match(/\.(\w+)$/) || [])[1]?.toLowerCase() || '';
      const p = [];
      if (a.alt === undefined) { p.push('no alt'); I.push(['WARN', `#${n + 1} ${f}: missing alt attribute.`]); }
      else if (a.alt === '') p.push('empty alt');
      else if (a.alt.length > 125) I.push(['INFO', `#${n + 1} ${f}: alt is ${a.alt.length} chars; keep under ~125.`]);
      else if (/^(image|photo|picture|img)\b/i.test(a.alt)) I.push(['INFO', `#${n + 1} ${f}: alt starts with "${a.alt.split(' ')[0]}" (redundant).`]);
      if (!a.width || !a.height) { p.push('no w/h'); I.push(['WARN', `#${n + 1} ${f}: width/height missing (layout shift risk).`]); }
      if (!a.loading && n > 0) I.push(['INFO', `#${n + 1} ${f}: add loading="lazy" if below the fold.`]);
      if (a.loading === 'lazy' && n === 0) I.push(['INFO', `#${n + 1} ${f}: first image is lazy; avoid lazy on the LCP image.`]);
      if (/^(img|dsc|image|screenshot|photo)[-_ ]?\d+/i.test(f)) I.push(['INFO', `#${n + 1} ${f}: non-descriptive filename.`]);
      if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext) && !a.srcset) I.push(['INFO', `#${n + 1} ${f}: legacy format; consider WebP/AVIF (or <picture>) and srcset.`]);
      if (ext === 'svg' || ext === 'webp' || ext === 'avif') p.push(ext);
      rows.push([n + 1, f.slice(0, 32), ext || '?', a.alt === undefined ? '-' : a.alt.slice(0, 30) || '""', a.width && a.height ? `${a.width}x${a.height}` : '-', a.loading || '-', a.srcset ? 'yes' : '-']);
    });
    return `${imgs.length} images\n${head('Issues')}${issues(I)}\n${head('Images')}${table(rows, ['#', 'File', 'Ext', 'Alt', 'WxH', 'Loading', 'srcset'])}`;
  },
});

tool({
  id: 'meta-analyzer', cat: 'SEO – On-page', title: 'Open Graph & Twitter Card Validator', desc: 'Validate OG and Twitter card tags from pasted HTML.', labels: ['HTML source'], sample: SAMPLE_HTML,
  run: ([h]) => {
    const m = metaOf(need(h, 'HTML')), I = [], g = (k) => m[k]?.[0];
    for (const k of ['og:title', 'og:type', 'og:image', 'og:url']) if (!g(k)) I.push(['ERROR', `Missing required ${k}.`]);
    for (const k of ['og:description', 'og:site_name', 'og:image:alt']) if (!g(k)) I.push(['WARN', `Missing recommended ${k}.`]);
    for (const k of ['og:image', 'og:url']) if (g(k) && !isAbs(g(k))) I.push(['ERROR', `${k} must be an absolute URL.`]);
    if (g('og:title')?.length > 90) I.push(['WARN', `og:title is ${g('og:title').length} chars; many platforms cut near 60-90.`]);
    if (g('og:description')?.length > 200) I.push(['WARN', `og:description is ${g('og:description').length} chars; keep under ~200.`]);
    if (g('og:image') && /^http:/i.test(g('og:image'))) I.push(['WARN', 'og:image uses http://; use https.']);
    if (g('og:image') && !g('og:image:width')) I.push(['INFO', 'og:image:width/height not set (helps first-share rendering).']);
    const card = g('twitter:card');
    if (!card) I.push(['WARN', 'Missing twitter:card (falls back to OG but card type defaults to summary).']);
    else if (!['summary', 'summary_large_image', 'app', 'player'].includes(card)) I.push(['ERROR', `Invalid twitter:card "${card}".`]);
    if (card && !g('twitter:title') && !g('og:title')) I.push(['ERROR', 'No twitter:title or og:title fallback.']);
    if (card === 'summary_large_image' && !g('twitter:image') && !g('og:image')) I.push(['ERROR', 'summary_large_image needs twitter:image or og:image.']);
    if (!g('twitter:site')) I.push(['INFO', 'No twitter:site (@handle).']);
    if (/^@?\w+$/.test(g('twitter:site') || '') === false && g('twitter:site')) I.push(['WARN', 'twitter:site should look like @handle.']);
    const all = Object.entries(m).filter(([k]) => /^(og|twitter|article|fb|product):/.test(k));
    return `${head('Validation')}${issues(I)}\n${head('Found tags')}${all.map(([k, v]) => `${k} = ${v.join(' | ')}`).join('\n') || '(none)'}`;
  },
});

tool({
  id: 'jsonld-inspector', cat: 'SEO – On-page', title: 'JSON-LD Inspector', desc: 'Extract JSON-LD from HTML and sanity-check required properties.', labels: ['HTML source (or raw JSON-LD)'], sample: SAMPLE_HTML,
  run: ([h]) => {
    h = need(h, 'HTML');
    let blocks = ldBlocks(h).map((b) => b.inner);
    if (!blocks.length && /^\s*[[{]/.test(h)) blocks = [h];
    if (!blocks.length) return '[INFO] No <script type="application/ld+json"> blocks found.';
    const out = [`${blocks.length} JSON-LD block(s)`];
    blocks.forEach((b, i) => {
      out.push(head(`Block ${i + 1}`));
      let j;
      try { j = JSON.parse(b.trim()); } catch (e) { out.push(`[ERROR] Invalid JSON: ${e.message}`); return; }
      const I = [], nodes = [];
      const walk = (o, d) => { if (Array.isArray(o)) return o.forEach((x) => walk(x, d)); if (o && typeof o === 'object') { if (o['@type']) nodes.push([o, d]); if (o['@graph']) walk(o['@graph'], d); } };
      walk(j, 0);
      const ctx = JSON.stringify(j['@context'] ?? (Array.isArray(j) ? j[0]?.['@context'] : undefined) ?? '');
      if (!/schema\.org/.test(ctx)) I.push(['ERROR', '@context missing or not schema.org.']);
      else if (/^"http:\/\//.test(ctx)) I.push(['INFO', '@context uses http://schema.org (https is preferred).']);
      if (!nodes.length) I.push(['ERROR', 'No @type found.']);
      for (const [o] of nodes) {
        const types = [].concat(o['@type']);
        for (const t of types) {
          const r = reqFor(t);
          if (!r) { I.push(['INFO', `${t}: no built-in checks for this type.`]); continue; }
          for (const k of r) if (o[k] === undefined || o[k] === '' || (Array.isArray(o[k]) && !o[k].length)) I.push(['WARN', `${t}: missing "${k}".`]);
          if (o.url && !isAbs(String(o.url))) I.push(['WARN', `${t}: url should be absolute.`]);
          if (o.datePublished && isNaN(Date.parse(o.datePublished))) I.push(['ERROR', `${t}: datePublished is not a valid date.`]);
          if (o.offers && !o.offers.price && !o.offers.priceSpecification && !Array.isArray(o.offers)) I.push(['WARN', `${t}: offers has no price.`]);
          if (o.offers?.price !== undefined && !o.offers.priceCurrency) I.push(['WARN', `${t}: offers.price without priceCurrency.`]);
        }
      }
      out.push(`Types: ${nodes.map(([o]) => [].concat(o['@type']).join('/')).join(', ') || '(none)'}`, issues(I), '', JSON.stringify(j, null, 2).slice(0, 4000));
    });
    return out.join('\n');
  },
});

tool({
  id: 'internal-link-extractor', cat: 'SEO – On-page', title: 'Link Extractor (internal / external)', desc: 'Classify links from pasted HTML: internal, external, nofollow, anchor text.', labels: ['HTML source', 'Base URL (page URL)'], inputs: 2,
  sample: SAMPLE_HTML, sample2: 'https://example.com/seo-tools',
  run: ([h, base]) => {
    need(h, 'HTML'); base = base.trim() || (links(h, 'canonical')[0]?.a.href ?? '');
    const bu = tryUrl(base); if (!bu) throw new Error('Enter the base URL (e.g. https://example.com/page) in the second box.');
    const host = bu.hostname.replace(/^www\./, ''), rows = [], I = [];
    const generic = /^(click here|here|read more|more|link|this|learn more|details)$/i;
    for (const a of pairs(h, 'a')) {
      const href = a.a.href; if (href === undefined) continue;
      if (/^(mailto:|tel:|javascript:|sms:)/i.test(href.trim())) { rows.push(['other', href.slice(0, 50), '', '']); continue; }
      const u = tryUrl(href.trim(), bu); if (!u) { I.push(['WARN', `Unparseable href "${href}"`]); continue; }
      const internal = u.hostname.replace(/^www\./, '') === host;
      const txt = a.text || (a.inner.match(/<img[^>]*alt=["']([^"']*)/i)?.[1] ? `[img] ${a.inner.match(/<img[^>]*alt=["']([^"']*)/i)[1]}` : '');
      const rel = (a.a.rel || '').toLowerCase().split(/\s+/).filter((r) => /nofollow|ugc|sponsored/.test(r)).join(',');
      rows.push([internal ? 'internal' : 'external', u.href.replace(/#$/, ''), txt.slice(0, 50), rel || '-']);
      if (!txt) I.push(['WARN', `Empty anchor text: ${u.href}`]);
      else if (generic.test(txt)) I.push(['INFO', `Generic anchor text "${txt}" -> ${u.href}`]);
      if (a.a.target === '_blank' && !/noopener|noreferrer/.test(a.a.rel || '') && !internal) I.push(['INFO', `target=_blank without rel=noopener: ${u.href}`]);
      if (internal && rel.includes('nofollow')) I.push(['INFO', `Internal link is nofollow: ${u.href}`]);
      if (u.protocol === 'http:' && bu.protocol === 'https:') I.push(['WARN', `Insecure http link on https page: ${u.href}`]);
    }
    const c = (k) => rows.filter((r) => r[0] === k).length;
    return `Internal: ${c('internal')}   External: ${c('external')}   Other (mailto/tel/js): ${c('other')}   Unique URLs: ${new Set(rows.map((r) => r[1])).size}\n${head('Issues')}${issues(I)}\n${head('Links')}${table(rows, ['Type', 'URL', 'Anchor', 'Rel'])}`;
  },
});

tool({
  id: 'text-to-html-ratio', cat: 'SEO – On-page', title: 'Text-to-HTML Ratio', desc: 'Visible text vs. total HTML size.', labels: ['HTML source'], sample: SAMPLE_HTML,
  run: ([h]) => {
    need(h, 'HTML');
    const enc = new TextEncoder(), total = enc.encode(h).length, t = bodyText(h), tb = enc.encode(t).length;
    const r = total ? (tb / total) * 100 : 0;
    const scripts = pairs(h, 'script').reduce((n, s) => n + enc.encode(s.inner).length, 0), styles = pairs(h, 'style').reduce((n, s) => n + enc.encode(s.inner).length, 0);
    const verdict = r < 10 ? '[WARN] Very low: mostly markup/scripts. Consider trimming code.' : r < 25 ? '[INFO] Low-to-average; typical for app-like pages.' : '[OK] Healthy ratio.';
    return `Text-to-HTML ratio: ${r.toFixed(1)}%\n${verdict}\n\nHTML size:   ${total} bytes\nText size:   ${tb} bytes (${words(t).length} words)\nInline JS:   ${scripts} bytes\nInline CSS:  ${styles} bytes\nMarkup/other: ${total - tb - scripts - styles} bytes\n\nNote: ratio is not a direct ranking factor; it is a hint about page weight and thin content.`;
  },
});

tool({
  id: 'a11y-html-check', cat: 'SEO – On-page', title: 'Accessibility HTML Lint', desc: 'Basic accessibility checks on pasted HTML (not a full WCAG audit).', labels: ['HTML source'], sample: SAMPLE_HTML,
  run: ([h]) => {
    need(h, 'HTML'); const I = [];
    const htmlTag = tags(h, 'html')[0];
    if (!htmlTag?.a.lang) I.push(['ERROR', '<html> lacks lang attribute (WCAG 3.1.1).']);
    if (!pairs(h, 'title').some((t) => t.text)) I.push(['ERROR', 'Missing or empty <title> (WCAG 2.4.2).']);
    if (!/<main\b|role=["']main/i.test(h)) I.push(['INFO', 'No <main> landmark.']);
    if (!/<a[^>]+href=["']#(main|content|skip)/i.test(h)) I.push(['INFO', 'No skip-to-content link detected.']);
    const vp = metaOf(h).viewport?.[0] || ''; if (/user-scalable\s*=\s*no/i.test(vp)) I.push(['ERROR', 'Viewport disables zoom (WCAG 1.4.4).']);
    tags(h, 'img').forEach((i) => { if (i.a.alt === undefined) I.push(['ERROR', `<img src="${(i.a.src || '').slice(0, 40)}"> has no alt (WCAG 1.1.1).`]); });
    const ids = tags(h, '[a-z][a-z0-9-]*').map((t) => t.a.id).filter(Boolean), dup = [...count(ids)].filter(([, v]) => v > 1);
    for (const [k] of dup) I.push(['ERROR', `Duplicate id "${k}".`]);
    // form controls
    const labelFor = new Set(pairs(h, 'label').map((l) => l.a.for).filter(Boolean));
    for (const t of tags(h, 'input|select|textarea')) {
      const a = t.a; if (['hidden', 'submit', 'button', 'reset', 'image'].includes((a.type || '').toLowerCase())) continue;
      const pre = h.slice(0, t.i), inLabel = pre.lastIndexOf('<label') > pre.lastIndexOf('</label');
      if (!(a.id && labelFor.has(a.id)) && !inLabel && !a['aria-label'] && !a['aria-labelledby'] && !a.title) I.push(['ERROR', `Form control (${a.type || 'text'}${a.id ? '#' + a.id : ''}) has no label (WCAG 1.3.1/4.1.2).`]);
    }
    pairs(h, 'button').forEach((b) => { if (!b.text && !b.a['aria-label'] && !b.a['aria-labelledby'] && !/<img[^>]+alt=["'][^"']+/i.test(b.inner) && !b.a.title) I.push(['ERROR', 'Button with no accessible name.']); });
    pairs(h, 'a').forEach((a) => {
      if (a.a.href !== undefined && !a.text && !a.a['aria-label'] && !a.a['aria-labelledby'] && !/<img[^>]+alt=["'][^"']+/i.test(a.inner)) I.push(['ERROR', `Link with no accessible name (${a.a.href.slice(0, 40)}).`]);
      if (/^(click here|here|read more|more)$/i.test(a.text)) I.push(['WARN', `Non-descriptive link text "${a.text}".`]);
      if (a.a.href === '#' || /^javascript:/i.test(a.a.href || '')) I.push(['WARN', `Link with href="${a.a.href}" should probably be a <button>.`]);
    });
    tags(h, 'iframe').forEach((f) => { if (!f.a.title) I.push(['WARN', 'iframe without title.']); });
    tags(h, 'div|span').forEach((d) => { if (d.a.onclick && !d.a.role && d.a.tabindex === undefined) I.push(['WARN', `<div/span onclick> is not keyboard accessible; use <button> or add role+tabindex.`]); });
    tags(h, '[a-z][a-z0-9-]*').forEach((t) => { if (+t.a.tabindex > 0) I.push(['WARN', 'Positive tabindex disrupts natural focus order.']); if (t.a.autofocus !== undefined) I.push(['INFO', 'autofocus can disorient screen-reader users.']); });
    pairs(h, 'table').forEach((t) => { if (!/<th\b/i.test(t.inner)) I.push(['WARN', 'Table without <th> header cells.']); });
    tags(h, 'video|audio').forEach(() => { if (!/<track\b/i.test(h)) I.push(['WARN', 'Media element without <track> captions.']); });
    if (/<(marquee|blink)\b/i.test(h)) I.push(['ERROR', 'Obsolete <marquee>/<blink> found.']);
    const hs = [...h.matchAll(/<h([1-6])\b/gi)].map((x) => +x[1]);
    for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) { I.push(['WARN', `Heading level skipped (h${hs[i - 1]} -> h${hs[i]}).`]); break; }
    if (!hs.includes(1)) I.push(['WARN', 'No h1.']);
    return `${issues(I)}\n\nThis is a static lint of markup only. Colour contrast, focus visibility and dynamic behaviour need manual or browser-based testing.`;
  },
});

// ---------- previews / generators for meta ----------
const FIELDS_OG = `title: Free SEO Tools for Everyone
description: Private, browser-based SEO tools. Nothing leaves your device.
url: https://example.com/seo-tools
image: https://example.com/img/og.png
image_alt: Screenshot of the SEO tools dashboard
site_name: Example
type: website
locale: en_US
twitter_card: summary_large_image
twitter_site: @example`;

tool({
  id: 'meta-tag-generator', cat: 'SEO – Generators', title: 'Meta Tag Generator', desc: 'Generate title, description, canonical, robots, viewport and more.', labels: ['Fields (key: value per line)'],
  sample: `title: Free SEO Tools - Example
description: Private, browser-based SEO tools. Nothing leaves your device.
canonical: https://example.com/seo-tools
robots: index, follow
lang: en
author: Example Team
theme_color: #0f172a
charset: utf-8`,
  run: ([t]) => {
    const f = kvo(need(t, 'fields')), o = [], w = [];
    o.push(`<meta charset="${esc(f.charset || 'utf-8')}">`, '<meta name="viewport" content="width=device-width, initial-scale=1">');
    if (f.title) { o.push(`<title>${esc(f.title)}</title>`); if (f.title.length > 60) w.push(`Title is ${f.title.length} chars (>60).`); } else w.push('No title.');
    if (f.description) { o.push(`<meta name="description" content="${esc(f.description)}">`); if (f.description.length > 160) w.push(`Description is ${f.description.length} chars (>160).`); } else w.push('No description.');
    if (f.canonical) o.push(`<link rel="canonical" href="${esc(f.canonical)}">`);
    if (f.robots) o.push(`<meta name="robots" content="${esc(f.robots)}">`);
    if (f.author) o.push(`<meta name="author" content="${esc(f.author)}">`);
    if (f.keywords) o.push(`<meta name="keywords" content="${esc(f.keywords)}">`);
    if (f.theme_color) o.push(`<meta name="theme-color" content="${esc(f.theme_color)}">`);
    if (f.favicon) o.push(`<link rel="icon" href="${esc(f.favicon)}">`);
    return `${f.lang ? `<html lang="${esc(f.lang)}">  <!-- set on the <html> tag -->\n` : ''}${o.join('\n')}${w.length ? `\n\n<!-- Warnings: ${w.join(' ')} -->` : ''}`;
  },
});

tool({
  id: 'og-twitter-generator', cat: 'SEO – Generators', title: 'Open Graph & Twitter Card Generator', desc: 'Generate OG and Twitter card meta tags.', labels: ['Fields (key: value per line)'], sample: FIELDS_OG,
  run: ([t]) => {
    const f = kvo(need(t, 'fields')), o = [], m = (p, v, a = 'property') => v && o.push(`<meta ${a}="${p}" content="${esc(v)}">`);
    m('og:type', f.type || 'website'); m('og:title', f.title); m('og:description', f.description); m('og:url', f.url); m('og:image', f.image); m('og:image:alt', f.image_alt);
    m('og:site_name', f.site_name); m('og:locale', f.locale);
    m('twitter:card', f.twitter_card || (f.image ? 'summary_large_image' : 'summary'), 'name'); m('twitter:site', f.twitter_site, 'name'); m('twitter:creator', f.twitter_creator, 'name');
    m('twitter:title', f.title, 'name'); m('twitter:description', f.description, 'name'); m('twitter:image', f.image, 'name'); m('twitter:image:alt', f.image_alt, 'name');
    return o.join('\n') + '\n\n<!-- Recommended og:image size: 1200x630 (1.91:1), under 5 MB. -->';
  },
});

tool({
  id: 'social-preview', cat: 'SEO – Generators', title: 'Social Share Preview', desc: 'Approximate Facebook, X/Twitter and LinkedIn link cards from fields.', labels: ['Fields (key: value per line)'], sample: FIELDS_OG,
  run: ([t]) => {
    const f = kvo(need(t, 'fields')), host = (tryUrl(f.url || '')?.hostname || 'example.com');
    const img = (r) => `<div class="img" style="aspect-ratio:${r}">${f.image ? `image: ${esc(f.image.slice(0, 60))}` : 'no image'}<br><small>(not loaded: previews never fetch)</small></div>`;
    const card = (n, body, cls = '') => `<h3>${n}</h3><div class="card ${cls}">${body}</div>`;
    const t1 = esc(clip(f.title || '', 16, 560)), d1 = esc(clip(f.description || '', 14, 480));
    const html = `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui,sans-serif;margin:16px;background:#f3f4f6;color:#111}h3{margin:18px 0 6px;font-size:13px;color:#555}
.card{width:500px;max-width:100%;background:#fff;border:1px solid #d0d7de;overflow:hidden}.img{background:#dde3ea;color:#556;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:12px}
.b{padding:10px 12px}.h{font-weight:700;font-size:16px;line-height:1.25}.d{color:#555;margin-top:4px;font-size:13px}.u{color:#666;font-size:12px;text-transform:uppercase}
.tw{border-radius:16px}.tw .b .u{text-transform:none}.fb{background:#f0f2f5}.li{border-radius:2px}</style>
${card('Facebook', img('1.91/1') + `<div class="b"><div class="u">${esc(host)}</div><div class="h">${t1}</div><div class="d">${d1}</div></div>`, 'fb')}
${card('X / Twitter (' + (f.twitter_card || 'summary_large_image') + ')', (f.twitter_card === 'summary' ? `<div style="display:flex"><div style="width:120px">${img('1/1')}</div><div class="b"><div class="u">${esc(host)}</div><div class="h">${t1}</div><div class="d">${d1}</div></div></div>` : img('2/1') + `<div class="b"><div class="u">${esc(host)}</div><div class="h">${t1}</div><div class="d">${d1}</div></div>`), 'tw')}
${card('LinkedIn', img('1.91/1') + `<div class="b"><div class="h">${t1}</div><div class="u" style="margin-top:6px">${esc(host)}</div></div>`, 'li')}`;
    const w = [];
    if (!f.title) w.push('[WARN] No title.'); if (!f.image) w.push('[WARN] No image: cards will be text only.'); if (f.image && !isAbs(f.image)) w.push('[ERROR] Image must be an absolute URL.');
    return { html, text: (w.join('\n') || '[OK] Fields look fine.') + '\nPreviews are approximations; platforms change layouts and cache old scrapes.' };
  },
});

tool({
  id: 'serp-snippet', cat: 'SEO – On-page', title: 'SERP Snippet Preview', desc: 'Google-style preview with estimated pixel widths and truncation warnings.', labels: ['Title', 'Meta description'], inputs: 2,
  sample: 'Free SEO Tools - Analyze Your Pages Privately in the Browser | Example', sample2: 'Free, private SEO tools that run entirely in your browser. Inspect meta tags, headings, links and structured data without uploading anything to a server.',
  opts: [{ id: 'device', label: 'Device', type: 'select', choices: ['desktop', 'mobile'], def: 'desktop' }, { id: 'url', label: 'URL', type: 'text', def: 'https://example.com/seo-tools' }],
  run: ([title, desc], { device, url }) => {
    const mob = device === 'mobile', tMax = mob ? 580 : 600, dMax = mob ? 680 : 920, tp = px(title, 20), dp = px(desc, 14);
    const u = tryUrl(url) || new URL('https://example.com'), crumbs = [u.hostname, ...u.pathname.split('/').filter(Boolean)].join(' › ');
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:16px;font-family:Arial,sans-serif;background:#fff"><div style="max-width:${mob ? 360 : 640}px">
<div style="font-size:12px;color:#202124">${esc(crumbs)}</div><div style="font-size:20px;line-height:1.3;color:#1a0dab">${esc(mob ? title.length > 62 ? clip(title, 20, tMax * 2) : title : clip(title, 20, tMax))}</div>
<div style="font-size:14px;line-height:1.58;color:#4d5156">${esc(mob ? clip(desc, 14, dMax) : clip(desc, 14, dMax))}</div></div>`;
    const I = [];
    const chk = (n, s, pxw, max, lo, hi) => { if (!s) I.push(['ERROR', `${n} is empty.`]); else { if (pxw > max) I.push(['WARN', `${n} ~${pxw}px exceeds ~${max}px: will be truncated.`]); if (s.length < lo) I.push(['INFO', `${n} is short (${s.length} chars).`]); if (s.length > hi) I.push(['INFO', `${n} has ${s.length} chars (guide: <=${hi}).`]); } };
    chk('Title', title, tp, tMax, 30, 60); chk('Description', desc, dp, dMax, 70, 160);
    return { html, text: `${device}: title ${title.length} chars ~${tp}px / ${tMax}px   description ${desc.length} chars ~${dp}px / ${dMax}px\n${issues(I)}\nPixel widths are estimated from Arial metrics; Google may rewrite titles and descriptions.` };
  },
});

tool({
  id: 'title-length-checker', cat: 'SEO – On-page', title: 'Title / Description Length Checker', desc: 'Check many titles or descriptions at once (one per line).', labels: ['Titles or descriptions, one per line'],
  sample: 'Home\nFree SEO Tools - Analyze Your Pages Privately in the Browser | Example\nBuy Shoes\nThe Complete, Extremely Detailed Guide To Choosing Running Shoes For Every Terrain, Budget And Foot Type In 2026',
  opts: [{ id: 'kind', label: 'Type', type: 'select', choices: ['title', 'description'], def: 'title' }],
  run: ([t], { kind }) => {
    const d = kind === 'description', [lo, hi, size, max] = d ? [70, 160, 14, 920] : [30, 60, 20, 600];
    const rows = lines(need(t)).map((l, i) => { const p = px(l, size), s = !l.length ? 'EMPTY' : p > max || l.length > hi ? 'WARN too long' : l.length < lo ? 'WARN too short' : 'OK'; return [i + 1, l.length, p, s, l.slice(0, 50)]; });
    const dup = [...count(lines(t).map((l) => l.toLowerCase()))].filter(([, v]) => v > 1).map(([k]) => `[WARN] Duplicate: "${k}"`);
    return `Targets: ${lo}-${hi} chars, ~${max}px\n\n${table(rows, ['#', 'Chars', '~px', 'Status', 'Text'])}${dup.length ? '\n\n' + dup.join('\n') : ''}`;
  },
});

// ---------- schema ----------
const SAMPLES = {
  Article: 'headline: How to Audit Your Site\nimage: https://example.com/a.jpg\ndatePublished: 2026-01-15\ndateModified: 2026-02-01\nauthor.name: Jane Doe\nauthor.url: https://example.com/jane\npublisher.name: Example\npublisher.logo.url: https://example.com/logo.png\nmainEntityOfPage: https://example.com/audit',
  Product: 'name: Trail Runner Shoe\nimage: https://example.com/shoe.jpg\ndescription: Lightweight trail running shoe.\nsku: TR-100\nbrand.name: Acme\noffers.price: 89.99\noffers.priceCurrency: EUR\noffers.availability: https://schema.org/InStock\noffers.url: https://example.com/shoe\naggregateRating.ratingValue: 4.6\naggregateRating.reviewCount: 128',
  LocalBusiness: 'type: Restaurant\nname: Cafe Example\nimage: https://example.com/cafe.jpg\ntelephone: +32 2 123 45 67\nurl: https://example.com\npriceRange: $$\naddress.streetAddress: 1 Main Street\naddress.addressLocality: Brussels\naddress.postalCode: 1000\naddress.addressCountry: BE\ngeo.latitude: 50.85\ngeo.longitude: 4.35\nopeningHours: Mo-Fr 08:00-18:00',
  FAQPage: 'q: What is SEO? | Search engine optimization is the practice of improving visibility in search results.\nq: Is it free? | Yes, these tools are free and run in your browser.',
  Organization: 'name: Example\nurl: https://example.com\nlogo: https://example.com/logo.png\nsameAs: https://twitter.com/example\nsameAs: https://www.linkedin.com/company/example\ncontactPoint.telephone: +32 2 123 45 67\ncontactPoint.contactType: customer service',
  BreadcrumbList: 'item: Home | https://example.com/\nitem: Tools | https://example.com/tools\nitem: SEO Tools | https://example.com/tools/seo',
  Event: 'name: SEO Meetup\nstartDate: 2026-05-20T19:00\nendDate: 2026-05-20T21:00\neventAttendanceMode: https://schema.org/OfflineEventAttendanceMode\nlocation.name: Community Hall\nlocation.address.streetAddress: 5 Park Road\nlocation.address.addressLocality: Ghent\nlocation.address.addressCountry: BE\noffers.price: 10\noffers.priceCurrency: EUR\noffers.url: https://example.com/tickets',
  Recipe: 'name: Pancakes\nimage: https://example.com/pancakes.jpg\nauthor.name: Jane Doe\nprepTime: PT10M\ncookTime: PT15M\nrecipeYield: 4 servings\nnutrition.calories: 250 calories\ningredient: 200g flour\ningredient: 2 eggs\ningredient: 300ml milk\ninstruction: Whisk everything together.\ninstruction: Fry in a hot pan until golden.',
  Person: 'name: Jane Doe\njobTitle: SEO Consultant\nurl: https://example.com/jane\nimage: https://example.com/jane.jpg\nworksFor.name: Example\nsameAs: https://www.linkedin.com/in/janedoe',
  WebSite: 'name: Example\nurl: https://example.com\npotentialAction.target: https://example.com/search?q={search_term_string}\npotentialAction.query-input: required name=search_term_string',
  VideoObject: 'name: How to use the tools\ndescription: A two minute walkthrough.\nthumbnailUrl: https://example.com/thumb.jpg\nuploadDate: 2026-01-10\nduration: PT2M10S\ncontentUrl: https://example.com/video.mp4\nembedUrl: https://example.com/embed/1',
  HowTo: 'name: How to add a canonical tag\ndescription: Prevent duplicate content.\nstep: Open the page head | Open the HTML file and find the <head> section.\nstep: Add the tag | Insert <link rel="canonical" href="..."> with the preferred URL.\nstep: Verify | Inspect the page source to confirm one canonical tag.\ntool: Text editor',
};
const NEST = { offers: 'Offer', address: 'PostalAddress', author: 'Person', publisher: 'Organization', logo: 'ImageObject', geo: 'GeoCoordinates', aggregateRating: 'AggregateRating', brand: 'Brand', location: 'Place', organizer: 'Organization', performer: 'Person', nutrition: 'NutritionInformation', contactPoint: 'ContactPoint', worksFor: 'Organization', review: 'Review', reviewRating: 'Rating', potentialAction: 'SearchAction' };
function buildLd(type, text) {
  const o = { '@context': 'https://schema.org', '@type': type }, ing = [], ins = [], qa = [], items = [], steps = [], sup = [], tl = [];
  const put = (path, val) => {
    const seg = path.split('.'); let cur = o;
    for (const s of seg.slice(0, -1)) cur = (typeof cur[s] === 'object' && cur[s]) ? cur[s] : (cur[s] = NEST[s] ? { '@type': NEST[s] } : {});
    const k = seg.at(-1);
    if (k === 'query-input') cur['query-input'] = val;
    else if (k in cur) cur[k] = [].concat(cur[k], val); else cur[k] = val;
  };
  for (const [k, v] of kv(text)) {
    const [a, b] = v.split(/\s*\|\s*(.*)/s);
    if (k === 'type') o['@type'] = v;
    else if (type === 'FAQPage' && k === 'q') qa.push({ '@type': 'Question', name: a, acceptedAnswer: { '@type': 'Answer', text: b || '' } });
    else if (type === 'BreadcrumbList' && k === 'item') items.push({ '@type': 'ListItem', position: items.length + 1, name: a, item: b });
    else if (type === 'HowTo' && k === 'step') steps.push({ '@type': 'HowToStep', name: a, text: b || a });
    else if (type === 'HowTo' && k === 'supply') sup.push({ '@type': 'HowToSupply', name: v });
    else if (type === 'HowTo' && k === 'tool') tl.push({ '@type': 'HowToTool', name: v });
    else if (type === 'Recipe' && k === 'ingredient') ing.push(v);
    else if (type === 'Recipe' && k === 'instruction') ins.push({ '@type': 'HowToStep', text: v });
    else if (type === 'LocalBusiness' && k === 'openingHours') put(k, v);
    else if (k === 'potentialAction.target' && type === 'WebSite') { put('potentialAction.target', { '@type': 'EntryPoint', urlTemplate: v }); }
    else put(k, v);
  }
  if (qa.length) o.mainEntity = qa; if (items.length) o.itemListElement = items; if (steps.length) o.step = steps; if (sup.length) o.supply = sup; if (tl.length) o.tool = tl;
  if (ing.length) o.recipeIngredient = ing; if (ins.length) o.recipeInstructions = ins;
  return o;
}
tool({
  id: 'schema-generator', cat: 'SEO – Generators', title: 'Schema.org JSON-LD Generator', desc: 'Article, Product, LocalBusiness, FAQ, Organization, Breadcrumb, Event, Recipe, Person, WebSite, Video, HowTo.',
  labels: ['Fields (key: value per line; dotted keys nest, repeated keys make arrays)'], sample: SAMPLES.Article,
  opts: [{ id: 'type', label: 'Type', type: 'select', choices: Object.keys(SAMPLES), def: 'Article' }],
  run: ([t], { type }) => {
    if (Object.values(SAMPLES).some((s) => s === t.trim())) t = SAMPLES[type]; // switching type swaps in that type's example
    need(t, 'fields');
    const o = buildLd(type, t), req = reqFor(o['@type']) || REQ[type] || [];
    const miss = req.filter((k) => o[k] === undefined).map((k) => `[WARN] Missing recommended property "${k}" for ${o['@type']}.`);
    return `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>\n\n${miss.join('\n') || '[OK] All key properties present.'}\nValidate with Google Rich Results Test before deploying.`;
  },
});

// ---------- text / content ----------
const ARTICLE = `Search engine optimization helps people find your website. Good content answers real questions clearly and quickly. Short sentences are easier to read, but you should vary them to keep readers interested.

Many writers use complicated terminology and unnecessarily elaborate constructions, which frequently diminishes comprehension among general audiences. Simple words usually work better. Readers scan pages, so headings and short paragraphs matter. Keyword research shows what people search for, and content should match their intent. Link to related pages, and keep your titles descriptive. Fast pages with clear content rank better and convert more visitors into customers.`;

tool({
  id: 'readability', cat: 'SEO – Content', title: 'Readability Scores', desc: 'Flesch, Flesch-Kincaid, Gunning Fog, SMOG, Coleman-Liau, ARI.', labels: ['Text (English)'], sample: ARTICLE,
  run: ([t]) => {
    need(t, 'text'); const w = words(t), S = Math.max(1, sentencesOf(t).length), W = w.length;
    if (W < 5) throw new Error('Need at least a few words.');
    const sy = w.map(syl), Y = sy.reduce((a, b) => a + b, 0), poly = sy.filter((s) => s >= 3).length, L = w.join('').replace(/['’]/g, '').length;
    const fre = 206.835 - 1.015 * (W / S) - 84.6 * (Y / W), fk = 0.39 * (W / S) + 11.8 * (Y / W) - 15.59, fog = 0.4 * ((W / S) + 100 * (poly / W));
    const smog = 1.043 * Math.sqrt(poly * (30 / S)) + 3.1291, cl = 0.0588 * (L / W * 100) - 0.296 * (S / W * 100) - 15.8, ari = 4.71 * (L / W) + 0.5 * (W / S) - 21.43;
    const band = fre >= 90 ? 'very easy (5th grade)' : fre >= 80 ? 'easy' : fre >= 70 ? 'fairly easy' : fre >= 60 ? 'plain English (8th-9th grade)' : fre >= 50 ? 'fairly difficult' : fre >= 30 ? 'difficult (college)' : 'very difficult';
    const f = (n) => n.toFixed(1), grades = [fk, fog, smog, cl, ari], avg = grades.reduce((a, b) => a + b, 0) / 5;
    const long = sentencesOf(t).filter((s) => words(s).length > 25).length;
    return `Flesch Reading Ease : ${f(fre)}  -> ${band}\nFlesch-Kincaid Grade: ${f(fk)}\nGunning Fog Index   : ${f(fog)}\nSMOG Index          : ${f(smog)}${S < 30 ? '  (designed for 30+ sentences; rough here)' : ''}\nColeman-Liau Index  : ${f(cl)}\nAutomated Readability: ${f(ari)}\nAverage grade level : ${f(avg)}\n\nWords ${W}, sentences ${S}, syllables ${Y}, letters ${L}, complex words (3+ syllables) ${poly}\nAvg words/sentence ${f(W / S)}, avg syllables/word ${(Y / W).toFixed(2)}\n${issues([[avg > 12 ? 'WARN' : 'OK', avg > 12 ? 'Grade level above 12: simplify for a general web audience (aim 7-9).' : 'Grade level suits a general web audience.'], ...(long ? [['WARN', `${long} sentence(s) over 25 words.`]] : [])])}\nFormulas are tuned for English; syllable counting is heuristic.`;
  },
});

tool({
  id: 'keyword-density', cat: 'SEO – Content', title: 'Keyword Density', desc: '1-3 word phrase frequency and density.', labels: ['Text'], sample: ARTICLE,
  opts: [{ id: 'n', label: 'Phrase length (1-3)', type: 'number', def: 1 }, { id: 'stop', label: 'Ignore stop words', type: 'checkbox', def: true }, { id: 'min', label: 'Min count', type: 'number', def: 1 }, { id: 'limit', label: 'Rows', type: 'number', def: 25 }],
  run: ([t], { n, stop, min, limit }) => {
    n = Math.min(3, Math.max(1, n | 0 || 1)); const w = words(need(t, 'text')), total = w.length;
    const toks = n === 1 && stop ? w.filter((x) => !STOP.has(x) && x.length > 1) : w;
    const m = count(ngrams(toks, n, stop && n > 1)), rows = top(m, limit || 25).filter(([, c]) => c >= (min || 1)).map(([k, c], i) => [i + 1, k, c, (c / total * 100).toFixed(2) + '%']);
    return `Total words: ${total}  |  unique: ${new Set(w).size}\n\n${table(rows, ['#', n === 1 ? 'Word' : n + '-gram', 'Count', 'Density'])}\n\n${rows[0] && parseFloat(rows[0][3]) > 4 ? '[WARN] Top term density above 4%: check for keyword stuffing.' : '[OK] No obvious over-optimization.'}`;
  },
});

// RAKE-style extraction
tool({
  id: 'keyword-extractor', cat: 'SEO – Content', title: 'Keyword Extractor', desc: 'Extract key phrases from text (RAKE-style scoring).', labels: ['Text'], sample: ARTICLE,
  opts: [{ id: 'limit', label: 'Results', type: 'number', def: 20 }],
  run: ([t], { limit }) => {
    const cands = need(t, 'text').toLowerCase().split(/[^\p{L}\p{N}'’\s-]+|\s+-\s+/u).flatMap((seg) => seg.split(/\s+/).reduce((acc, w) => { if (STOP.has(w) || !w) acc.push([]); else acc.at(-1).push(w); return acc; }, [[]])).filter((p) => p.length && p.length <= 4);
    const freq = new Map(), deg = new Map();
    for (const p of cands) for (const w of p) { freq.set(w, (freq.get(w) || 0) + 1); deg.set(w, (deg.get(w) || 0) + p.length); }
    const sc = new Map();
    for (const p of cands) { const k = p.join(' '); sc.set(k, p.reduce((s, w) => s + deg.get(w) / freq.get(w), 0)); }
    const pc = count(cands.map((p) => p.join(' ')));
    const rows = [...sc].sort((a, b) => b[1] - a[1]).slice(0, limit || 20).map(([k, s], i) => [i + 1, k, s.toFixed(1), pc.get(k)]);
    const uni = top(count(words(t).filter((w) => !STOP.has(w) && w.length > 2)), 10).map(([k, c]) => `${k} (${c})`).join(', ');
    return `${table(rows, ['#', 'Phrase', 'Score', 'Occurrences'])}\n\nMost frequent single words: ${uni}`;
  },
});

tool({
  id: 'content-gap', cat: 'SEO – Content', title: 'Content Gap (Term Comparison)', desc: 'Compare terms in two texts: what a competitor covers that you miss.', labels: ['Your text', 'Competitor text'], inputs: 2,
  sample: 'Our guide explains keyword research, title tags and meta descriptions for small websites.',
  sample2: 'Complete guide to keyword research, title tags, schema markup, internal linking and page speed. Schema markup and internal linking improve crawl efficiency; page speed matters for mobile users.',
  run: ([a, b]) => {
    need(a, 'your text'); need(b, 'the competitor text');
    const terms = (t) => { const w = words(t); return count([...w.filter((x) => !STOP.has(x) && x.length > 2), ...ngrams(w, 2, true)]); };
    const A = terms(a), B = terms(b);
    const miss = [...B].filter(([k]) => !A.has(k)).sort((x, y) => y[1] - x[1] || y[0].length - x[0].length).slice(0, 40), only = [...A].filter(([k]) => !B.has(k)).sort((x, y) => y[1] - x[1]).slice(0, 25);
    const shared = [...A].filter(([k]) => B.has(k)).length, total = new Set([...A.keys(), ...B.keys()]).size;
    return `Term overlap (Jaccard): ${(shared / total * 100).toFixed(0)}%   shared terms: ${shared}\n${head('In competitor text but missing from yours (gaps)')}${miss.map(([k, c]) => `${k}${c > 1 ? ` (x${c})` : ''}`).join(', ') || '(none)'}\n${head('Only in your text (unique angle)')}${only.map(([k, c]) => `${k}${c > 1 ? ` (x${c})` : ''}`).join(', ') || '(none)'}\n\nWords: yours ${words(a).length} vs competitor ${words(b).length}`;
  },
});

tool({
  id: 'tfidf', cat: 'SEO – Content', title: 'TF-IDF Term Ranker', desc: 'Rank distinctive terms in document 1 against others (separate docs with a line ---).', labels: ['Documents (separate with a line containing ---)'],
  sample: 'Trail running shoes need grip, cushioning and durability. The best trail shoes grip wet rocks and mud.\n---\nRoad running shoes focus on cushioning and weight. Road shoes suit asphalt.\n---\nHiking boots protect ankles on rough trails with durable soles.',
  opts: [{ id: 'limit', label: 'Rows', type: 'number', def: 20 }],
  run: ([t], { limit }) => {
    const docs = need(t, 'documents').split(/^\s*---\s*$/m).map((d) => d.trim()).filter(Boolean);
    if (docs.length < 2) throw new Error('Provide at least 2 documents separated by a line containing ---.');
    const toks = docs.map((d) => words(d).filter((w) => !STOP.has(w) && w.length > 2)), N = docs.length, df = new Map();
    for (const d of toks) for (const w of new Set(d)) df.set(w, (df.get(w) || 0) + 1);
    const tf = count(toks[0]), len = toks[0].length || 1;
    const rows = [...tf].map(([w, c]) => [w, (c / len) * (Math.log((1 + N) / (1 + df.get(w))) + 1), c, df.get(w)]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, limit || 20).map((r, i) => [i + 1, r[0], r[1].toFixed(4), r[2], `${r[3]}/${N}`]);
    return `${N} documents; ranking terms of document 1 (smoothed idf = ln((1+N)/(1+df))+1)\n\n${table(rows, ['#', 'Term', 'TF-IDF', 'Count', 'In docs'])}`;
  },
});

// ---------- robots / bots ----------
const ROBOTS_SAMPLE = `User-agent: *
Disallow: /admin/
Disallow: /*?sessionid=
Allow: /admin/public/

User-agent: Googlebot
Disallow: /private/
Allow: /private/press$

Sitemap: https://example.com/sitemap.xml`;

function parseRobots(text) {
  const groups = [], sitemaps = []; let cur = null, lastUA = false;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.replace(/#.*/, '').trim(), m = l.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!cur || !lastUA) groups.push(cur = { uas: [], rules: [] }); cur.uas.push(v.toLowerCase()); lastUA = true; continue; }
    lastUA = false;
    if (k === 'sitemap') sitemaps.push(v);
    else if ((k === 'allow' || k === 'disallow') && cur) cur.rules.push({ type: k, path: v });
    else if (k === 'crawl-delay' && cur) cur.delay = v;
  }
  return { groups, sitemaps };
}
const pathRe = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$') .replace(/\$(?!$)/g, '\\$'));
function robotsDecision(rb, ua, path) {
  ua = ua.toLowerCase(); let best = -1, sel = [];
  for (const g of rb.groups) for (const t of g.uas) { const s = t === '*' ? 0 : ua.includes(t) ? t.length : -1; if (s < 0) continue; if (s > best) { best = s; sel = [g]; } else if (s === best && !sel.includes(g)) sel.push(g); }
  if (!sel.length) return { ok: true, why: 'no matching group (allowed by default)', group: '-' };
  let hit = null;
  for (const g of sel) for (const r of g.rules) {
    if (!r.path) continue; if (!pathRe(r.path).test(path)) continue;
    if (!hit || r.path.length > hit.path.length || (r.path.length === hit.path.length && r.type === 'allow')) hit = r;
  }
  const grp = sel[0].uas.join(',');
  return hit ? { ok: hit.type === 'allow', why: `${hit.type === 'allow' ? 'Allow' : 'Disallow'}: ${hit.path}`, group: grp } : { ok: true, why: 'no matching rule', group: grp };
}
tool({
  id: 'robots-tester', cat: 'SEO – Technical', title: 'robots.txt Tester', desc: 'Test URLs against robots.txt with longest-match, wildcard and $ rules.', labels: ['robots.txt', 'URLs or paths (one per line)'], inputs: 2,
  sample: ROBOTS_SAMPLE, sample2: 'https://example.com/\nhttps://example.com/admin/settings\nhttps://example.com/admin/public/help\nhttps://example.com/shop?sessionid=42\nhttps://example.com/private/press\nhttps://example.com/private/press-kit',
  opts: [{ id: 'ua', label: 'User-agent', type: 'text', def: 'Bingbot' }],
  run: ([r, u], { ua }) => {
    const rb = parseRobots(need(r, 'robots.txt')); if (!rb.groups.length) throw new Error('No User-agent groups found.');
    const urls = lines(u); if (!urls.length) throw new Error('Add URLs in the second box.');
    const rows = urls.map((x) => { const p = tryUrl(x, 'https://example.com'); const path = p ? p.pathname + p.search : x; const d = robotsDecision(rb, ua || '*', path); return [d.ok ? 'ALLOWED' : 'BLOCKED', x.slice(0, 60), d.why]; });
    const bl = rows.filter((x) => x[0] === 'BLOCKED').length;
    return `User-agent: ${ua || '*'}   ${rows.length - bl} allowed, ${bl} blocked\nMatched group: ${robotsDecision(rb, ua || '*', '/').group}\n\n${table(rows, ['Result', 'URL', 'Deciding rule'])}\n\nRules: most specific agent group wins; longest matching path wins; Allow beats Disallow on ties; * wildcards and $ end anchor supported.${rb.sitemaps.length ? `\nSitemaps: ${rb.sitemaps.join(', ')}` : ''}`;
  },
});

tool({
  id: 'robots-generator', cat: 'SEO – Generators', title: 'robots.txt Generator', desc: 'Build a robots.txt with disallow/allow paths and sitemap.', labels: ['Extra rules: one per line, "Disallow: /x" or "Allow: /y"'],
  sample: 'Disallow: /admin/\nDisallow: /cart\nDisallow: /*?sort=\nAllow: /admin/public/',
  opts: [{ id: 'mode', label: 'Default', type: 'select', choices: ['allow all', 'block all'], def: 'allow all' }, { id: 'agent', label: 'User-agent', type: 'text', def: '*' }, { id: 'sitemap', label: 'Sitemap URL', type: 'text', def: 'https://example.com/sitemap.xml' }, { id: 'delay', label: 'Crawl-delay (s, optional)', type: 'number', def: 0 }],
  run: ([t], { mode, agent, sitemap, delay }) => {
    const rules = lines(t).map((l) => { const m = l.match(/^(allow|disallow)\s*:?\s*(.*)$/i); return m ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}: ${m[2]}` : `Disallow: ${l}`; });
    const o = [`User-agent: ${agent || '*'}`];
    if (mode === 'block all') o.push('Disallow: /'); else { o.push(...rules); if (!rules.some((r) => r.startsWith('Disallow'))) o.push('Disallow:'); }
    if (delay > 0) o.push(`Crawl-delay: ${delay}  # ignored by Google`);
    if (sitemap) o.push('', `Sitemap: ${sitemap}`);
    return o.join('\n') + (mode === 'block all' ? '\n\n# WARNING: this blocks all crawling. Note: robots.txt does not prevent indexing of URLs linked elsewhere; use noindex.' : '');
  },
});

const AI_BOTS = {
  training: [['GPTBot', 'OpenAI'], ['ClaudeBot', 'Anthropic'], ['anthropic-ai', 'Anthropic'], ['CCBot', 'Common Crawl'], ['Google-Extended', 'Google AI training/Gemini'], ['Applebot-Extended', 'Apple AI'], ['Bytespider', 'ByteDance'], ['meta-externalagent', 'Meta'], ['cohere-ai', 'Cohere'], ['Diffbot', 'Diffbot'], ['Amazonbot', 'Amazon'], ['omgili', 'Webz.io']],
  search: [['OAI-SearchBot', 'OpenAI search'], ['PerplexityBot', 'Perplexity search'], ['Claude-SearchBot', 'Anthropic search']],
  user: [['ChatGPT-User', 'OpenAI user fetch'], ['Claude-User', 'Anthropic user fetch'], ['Perplexity-User', 'Perplexity user fetch']],
};
tool({
  id: 'ai-bot-robots-builder', cat: 'SEO – Generators', title: 'AI Bot robots.txt Builder', desc: 'Policy builder for GPTBot, ClaudeBot, CCBot, Google-Extended, PerplexityBot and more.', labels: ['Per-bot overrides ("GPTBot: allow" / "block" / "/path" to disallow only that path)'],
  sample: 'GPTBot: block\nPerplexityBot: allow\nClaudeBot: /private/',
  opts: [{ id: 'training', label: 'AI training crawlers', type: 'select', choices: ['block', 'allow'], def: 'block' }, { id: 'search', label: 'AI search crawlers', type: 'select', choices: ['allow', 'block'], def: 'allow' }, { id: 'user', label: 'User-triggered fetchers', type: 'select', choices: ['allow', 'block'], def: 'allow' }, { id: 'sitemap', label: 'Sitemap URL', type: 'text', def: 'https://example.com/sitemap.xml' }],
  run: ([t], o) => {
    const ov = Object.fromEntries(kv(t).map(([k, v]) => [k.toLowerCase(), v])), out = ['# AI crawler policy'];
    for (const [cat, label] of [['training', 'Training / dataset crawlers'], ['search', 'AI search crawlers (citations in answers)'], ['user', 'User-triggered fetchers']]) {
      out.push('', `# ${label}: default ${o[cat]}`);
      for (const [bot, who] of AI_BOTS[cat]) {
        const p = (ov[bot.toLowerCase()] ?? o[cat]).trim(); out.push(`# ${who}`, `User-agent: ${bot}`);
        out.push(p.startsWith('/') ? `Disallow: ${p}` : p === 'allow' ? 'Allow: /' : 'Disallow: /');
      }
    }
    out.push('', 'User-agent: *', 'Allow: /'); if (o.sitemap) out.push('', `Sitemap: ${o.sitemap}`);
    return out.join('\n') + '\n\n# Notes: robots.txt is advisory; well-behaved bots honour it. Blocking Google-Extended does not affect Google Search ranking. Some user fetchers (e.g. ChatGPT-User) may not follow robots.txt.';
  },
});

tool({
  id: 'llms-txt-generator', cat: 'SEO – Generators', title: 'llms.txt Generator', desc: 'Create an llms.txt index of your key pages for AI assistants.', labels: ['Site info and links'],
  sample: 'title: Example\nsummary: Example builds private, browser-based SEO tools.\ndetails: Everything runs client-side; no data is uploaded.\n## Docs\nGetting started | https://example.com/docs/start | How to use the tools\nAPI reference | https://example.com/docs/api\n## Optional\nChangelog | https://example.com/changelog',
  run: ([t]) => {
    const f = kvo(t.split(/^##/m)[0]), out = [`# ${f.title || 'Site name'}`]; need(t);
    if (f.summary) out.push('', `> ${f.summary}`); if (f.details) out.push('', f.details);
    for (const sec of t.split(/^##\s*/m).slice(1)) {
      const [name, ...rest] = sec.split(/\r?\n/); out.push('', `## ${name.trim()}`);
      for (const l of rest.map((x) => x.trim()).filter(Boolean)) { const [n, u, d] = l.split(/\s*\|\s*/); out.push(`- [${n}](${u || '#'})${d ? `: ${d}` : ''}`); }
    }
    return out.join('\n') + '\n\n<!-- Save as /llms.txt at your site root. Section named "Optional" marks lower-priority links. -->';
  },
});

// ---------- sitemap ----------
tool({
  id: 'sitemap-generator', cat: 'SEO – Generators', title: 'XML Sitemap Generator', desc: 'URL list to sitemap.xml with lastmod, changefreq, priority.', labels: ['URLs, one per line'],
  sample: 'https://example.com/\nhttps://example.com/about\nhttps://example.com/blog/first-post\nhttps://example.com/contact',
  opts: [{ id: 'lastmod', label: 'lastmod (today / none / YYYY-MM-DD)', type: 'text', def: 'today' }, { id: 'freq', label: 'changefreq', type: 'select', choices: ['(none)', 'always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'], def: 'weekly' }, { id: 'prio', label: 'priority (0-1, blank=none)', type: 'text', def: '0.8' }, { id: 'home', label: 'Homepage priority 1.0', type: 'checkbox', def: true }],
  run: ([t], { lastmod, freq, prio, home }) => {
    const urls = [...new Set(lines(need(t, 'URLs')))], bad = urls.filter((u) => !isAbs(u) || u.length > 2048);
    if (bad.length) throw new Error(`Not absolute http(s) URLs (or >2048 chars): ${bad.slice(0, 3).join(', ')}`);
    if (urls.length > 50000) throw new Error('Over 50,000 URLs: split into multiple sitemaps and use a sitemap index.');
    const lm = /^today$/i.test(lastmod.trim()) ? today() : /^\d{4}-\d\d-\d\d/.test(lastmod.trim()) ? lastmod.trim() : '';
    const body = urls.map((u) => `  <url>\n    <loc>${xmlEsc(u)}</loc>${lm ? `\n    <lastmod>${lm}</lastmod>` : ''}${freq !== '(none)' ? `\n    <changefreq>${freq}</changefreq>` : ''}${prio.trim() ? `\n    <priority>${home && tryUrl(u)?.pathname === '/' ? '1.0' : prio.trim()}</priority>` : ''}\n  </url>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n<!-- ${urls.length} URLs. Google ignores changefreq and priority; an accurate lastmod is what matters. -->`;
  },
});

const SM_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2026-01-10</lastmod><priority>1.0</priority></url>
  <url><loc>https://example.com/about</loc><lastmod>2026-13-45</lastmod><changefreq>sometimes</changefreq></url>
  <url><loc>https://example.com/about</loc></url>
  <url><loc>http://example.com/contact</loc><priority>1.7</priority></url>
  <url><loc>/relative</loc></url>
  <url><loc>https://example.com/search?a=1&b=2</loc></url>
</urlset>`;
const locs = (x) => [...x.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((m) => m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim());
tool({
  id: 'sitemap-validator', cat: 'SEO – Technical', title: 'Sitemap Validator', desc: 'Check limits, duplicates, bad URLs, dates and values in pasted sitemap XML.', labels: ['Sitemap XML'], sample: SM_SAMPLE,
  run: ([x]) => {
    need(x, 'sitemap XML'); const I = [], idx = /<sitemapindex\b/i.test(x), root = idx ? 'sitemapindex' : 'urlset';
    if (!/<(urlset|sitemapindex)\b/i.test(x)) throw new Error('No <urlset> or <sitemapindex> root element.');
    if (!/xmlns\s*=\s*["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9/i.test(x)) I.push(['ERROR', 'Missing sitemap namespace xmlns="http://www.sitemaps.org/schemas/sitemap/0.9".']);
    if (!/^\s*<\?xml/i.test(x)) I.push(['INFO', 'No XML declaration.']);
    const size = new TextEncoder().encode(x).length, L = locs(x);
    if (size > 52428800) I.push(['ERROR', 'Over 50 MB uncompressed limit.']);
    if (L.length > 50000) I.push(['ERROR', `${L.length} entries; limit is 50,000.`]);
    if (!L.length) I.push(['ERROR', 'No <loc> entries.']);
    const entries = [...x.matchAll(new RegExp(`<${idx ? 'sitemap' : 'url'}\\b[^>]*>([\\s\\S]*?)</${idx ? 'sitemap' : 'url'}>`, 'gi'))].map((m) => m[1]);
    if (entries.length !== L.length) I.push(['WARN', `${entries.length} <${idx ? 'sitemap' : 'url'}> blocks but ${L.length} <loc> tags: some entries lack <loc> or are malformed.`]);
    const seen = new Set(), hosts = new Set(), schemes = new Set();
    for (const l of L) {
      if (!isAbs(l)) { I.push(['ERROR', `Not an absolute URL: ${l}`]); continue; }
      const u = tryUrl(l); if (!u) { I.push(['ERROR', `Unparseable URL: ${l}`]); continue; }
      hosts.add(u.host); schemes.add(u.protocol);
      if (seen.has(l)) I.push(['WARN', `Duplicate URL: ${l}`]); seen.add(l);
      if (l.length > 2048) I.push(['ERROR', `URL over 2048 chars: ${l.slice(0, 60)}...`]);
      if (/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(l)) I.push(['ERROR', `Unescaped & in <loc> (must be &amp;): ${l}`]);
      if (/\s/.test(l)) I.push(['ERROR', `Whitespace inside URL: ${l}`]);
      if (/#/.test(l)) I.push(['WARN', `Fragment in URL (ignored by crawlers): ${l}`]);
    }
    if (hosts.size > 1) I.push(['WARN', `Multiple hosts: ${[...hosts].join(', ')} (a sitemap may only list URLs of its own host).`]);
    if (schemes.size > 1) I.push(['WARN', 'Mixed http and https URLs.']); else if (schemes.has('http:')) I.push(['INFO', 'All URLs use http://.']);
    for (const m of x.matchAll(/<lastmod>\s*([^<]*?)\s*<\/lastmod>/gi)) { const v = m[1]; if (!/^\d{4}-\d\d-\d\d(T[\d:.]+(Z|[+-]\d\d:\d\d)?)?$/.test(v) || isNaN(Date.parse(v))) I.push(['ERROR', `Invalid lastmod "${v}" (use W3C date, e.g. 2026-01-31).`]); else if (Date.parse(v) > Date.now() + 864e5) I.push(['WARN', `lastmod in the future: ${v}`]); }
    for (const m of x.matchAll(/<changefreq>\s*([^<]*?)\s*<\/changefreq>/gi)) if (!['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].includes(m[1])) I.push(['ERROR', `Invalid changefreq "${m[1]}".`]);
    for (const m of x.matchAll(/<priority>\s*([^<]*?)\s*<\/priority>/gi)) if (!(+m[1] >= 0 && +m[1] <= 1) || m[1] === '') I.push(['ERROR', `Invalid priority "${m[1]}" (0.0-1.0).`]);
    return `Type: ${root}   entries: ${L.length}   unique: ${seen.size}   size: ${(size / 1024).toFixed(1)} KB\n\n${issues(I)}`;
  },
});

tool({
  id: 'sitemap-url-extractor', cat: 'SEO – Technical', title: 'Sitemap URL Extractor', desc: 'Pull all <loc> URLs out of sitemap XML.', labels: ['Sitemap XML'], sample: SM_SAMPLE,
  opts: [{ id: 'dedupe', label: 'Remove duplicates', type: 'checkbox', def: true }, { id: 'lm', label: 'Include lastmod (TSV)', type: 'checkbox', def: false }],
  run: ([x], { dedupe, lm }) => {
    need(x, 'sitemap XML');
    let rows = [...x.matchAll(/<(?:url|sitemap)\b[^>]*>([\s\S]*?)<\/(?:url|sitemap)>/gi)].map((m) => [locs(m[1])[0], m[1].match(/<lastmod>\s*([^<]*?)\s*<\/lastmod>/i)?.[1] || '']).filter((r) => r[0]);
    if (!rows.length) rows = locs(x).map((l) => [l, '']);
    if (!rows.length) throw new Error('No <loc> elements found.');
    if (dedupe) { const s = new Set(); rows = rows.filter((r) => !s.has(r[0]) && s.add(r[0])); }
    return `${rows.map((r) => (lm ? r.join('\t') : r[0])).join('\n')}\n\n# ${rows.length} URL(s)`;
  },
});

// ---------- canonical / hreflang ----------
tool({
  id: 'canonical-generator', cat: 'SEO – Generators', title: 'Canonical URL Generator', desc: 'Normalize URLs (https, www, trailing slash, tracking params) and output canonical tags.', labels: ['URLs, one per line'],
  sample: 'http://www.Example.com/Blog/Post/?utm_source=x&b=2&a=1#top\nhttps://example.com/index.html\nhttps://example.com/products?id=5&fbclid=abc',
  opts: [{ id: 'https', label: 'Force https', type: 'checkbox', def: true }, { id: 'www', label: 'Host', type: 'select', choices: ['keep', 'remove www', 'add www'], def: 'remove www' }, { id: 'slash', label: 'Trailing slash', type: 'select', choices: ['keep', 'remove', 'add'], def: 'remove' }, { id: 'track', label: 'Strip tracking params', type: 'checkbox', def: true }, { id: 'idx', label: 'Strip index.html/php', type: 'checkbox', def: true }, { id: 'lc', label: 'Lowercase path', type: 'checkbox', def: false }, { id: 'sort', label: 'Sort params', type: 'checkbox', def: true }],
  run: ([t], o) => {
    const out = lines(need(t, 'URLs')).map((l) => {
      const u = tryUrl(l.startsWith('//') ? 'https:' + l : /^[a-z]+:\/\//i.test(l) ? l : 'https://' + l); if (!u) return `# invalid: ${l}`;
      if (o.https) u.protocol = 'https:'; u.hash = '';
      if (o.www === 'remove www') u.hostname = u.hostname.replace(/^www\./, ''); else if (o.www === 'add www' && !/^www\./.test(u.hostname)) u.hostname = 'www.' + u.hostname;
      if (o.track) for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|msclkid|mc_|_ga|ref$|yclid|igshid)/i.test(k)) u.searchParams.delete(k);
      if (o.sort) u.searchParams.sort();
      if (o.idx) u.pathname = u.pathname.replace(/\/index\.(html?|php|aspx?)$/i, '/');
      if (o.lc) u.pathname = u.pathname.toLowerCase();
      if (o.slash === 'remove' && u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, ''); else if (o.slash === 'add' && !/\.\w{2,5}$/.test(u.pathname) && !u.pathname.endsWith('/')) u.pathname += '/';
      let s = u.href; if (o.slash === 'remove' && u.pathname === '/' && !u.search) s = s.replace(/\/$/, '');
      return `<link rel="canonical" href="${esc(s)}">   <!-- from ${l} -->`;
    });
    return out.join('\n');
  },
});

const HL_RE = /^(x-default|[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?)$/i;
const hlProblems = (code) => {
  if (!HL_RE.test(code)) return /_/.test(code) ? 'uses underscore; use hyphen (en-GB)' : 'invalid format (expected ll or ll-RR, e.g. en, en-GB, zh-Hant)';
  const [l, r] = code.toLowerCase().split('-'); if (l === 'uk' && !r) return null;
  if (r === 'uk') return 'region "uk" is invalid; the UK is "GB"';
  if (l === 'jp') return 'language "jp" is invalid; Japanese is "ja"'; if (l === 'eu' || r === 'eu') return '"eu" is not a valid language/region subtag';
  return null;
};
tool({
  id: 'hreflang-generator', cat: 'SEO – Generators', title: 'Hreflang Tag Generator', desc: 'Language/URL pairs to link tags and sitemap xhtml:link markup.', labels: ['"code | URL" per line (use x-default for fallback)'],
  sample: 'en | https://example.com/\nen-GB | https://example.com/uk/\nnl-BE | https://example.com/nl-be/\nde | https://example.com/de/\nx-default | https://example.com/',
  run: ([t]) => {
    const rows = lines(need(t)).map((l) => l.split(/\s*[|,\t]\s*|\s+/)).map(([c, u]) => [c, u]);
    const I = [];
    rows.forEach(([c, u]) => { const p = hlProblems(c || ''); if (p) I.push(['ERROR', `"${c}": ${p}`]); if (!u || !isAbs(u)) I.push(['ERROR', `"${c}": URL must be absolute.`]); });
    if (!rows.some((r) => r[0] === 'x-default')) I.push(['INFO', 'No x-default (recommended fallback for unmatched users).']);
    const dup = [...count(rows.map((r) => r[0]?.toLowerCase()))].filter(([, v]) => v > 1); dup.forEach(([k]) => I.push(['ERROR', `Duplicate code "${k}".`]));
    const link = rows.map(([c, u]) => `<link rel="alternate" hreflang="${esc(c)}" href="${esc(u)}">`).join('\n');
    const sm = rows.map(([c, u]) => `<xhtml:link rel="alternate" hreflang="${esc(c)}" href="${xmlEsc(u)}"/>`).join('\n');
    return `${issues(I)}\n${head('HTML <head> (put the full set on EVERY language version, including itself)')}${link}\n${head('Sitemap alternative (inside each <url>; add xmlns:xhtml="http://www.w3.org/1999/xhtml" to <urlset>)')}${sm}`;
  },
});

tool({
  id: 'hreflang-validator', cat: 'SEO – Technical', title: 'Hreflang Validator', desc: 'Validate hreflang link tags in pasted HTML; paste several pages (--- between) to check reciprocity.', labels: ['HTML source(s); separate multiple pages with a line containing ---'],
  sample: `<link rel="canonical" href="https://example.com/">
<link rel="alternate" hreflang="en" href="https://example.com/">
<link rel="alternate" hreflang="nl" href="https://example.com/nl/">
<link rel="alternate" hreflang="en_GB" href="https://example.com/uk/">
<link rel="alternate" hreflang="fr" href="/fr/">
---
<link rel="canonical" href="https://example.com/nl/">
<link rel="alternate" hreflang="nl" href="https://example.com/nl/">
<link rel="alternate" hreflang="en" href="https://example.com/">`,
  run: ([t]) => {
    const pages = need(t, 'HTML').split(/^\s*---\s*$/m).map((p) => p.trim()).filter(Boolean), I = [], info = [], map = new Map();
    pages.forEach((p, n) => {
      const alts = links(p, 'alternate').filter((l) => l.a.hreflang !== undefined).map((l) => ({ c: l.a.hreflang, u: l.a.href || '' })), can = links(p, 'canonical')[0]?.a.href;
      const tag = `Page ${n + 1}`; if (!alts.length) { I.push(['WARN', `${tag}: no hreflang links.`]); return; }
      const self = alts.find((a) => a.u === can) || null; const url = can || self?.u; map.set(url, new Set(alts.map((a) => a.u)));
      info.push(`${tag}: ${url || '(unknown URL)'} -> ${alts.map((a) => a.c).join(', ')}`);
      if (!can) I.push(['WARN', `${tag}: no canonical; cannot confirm self-reference.`]);
      else if (!alts.some((a) => a.u === can)) I.push(['ERROR', `${tag}: missing self-referencing hreflang for ${can}.`]);
      for (const c of alts.map((a) => a.c)) { const pr = hlProblems(c); if (pr) I.push(['ERROR', `${tag}: hreflang "${c}" ${pr}.`]); }
      for (const a of alts) if (!isAbs(a.u)) I.push(['ERROR', `${tag}: "${a.c}" href is not absolute (${a.u}).`]);
      for (const [c, v] of count(alts.map((a) => a.c.toLowerCase()))) if (v > 1) I.push(['ERROR', `${tag}: duplicate hreflang "${c}".`]);
      for (const [u, v] of count(alts.map((a) => a.u))) if (v > 1) I.push(['WARN', `${tag}: URL listed ${v} times (${u}).`]);
      if (!alts.some((a) => a.c.toLowerCase() === 'x-default')) I.push(['INFO', `${tag}: no x-default.`]);
      if (can && alts.some((a) => a.u === can) && alts.filter((a) => a.u === can).every((a) => a.c.toLowerCase() === 'x-default')) I.push(['WARN', `${tag}: self-reference exists only as x-default; add the language code too.`]);
      if (alts.length === 1) I.push(['INFO', `${tag}: only one hreflang entry.`]);
    });
    for (const [url, set] of map) for (const o of set) if (o !== url && map.has(o) && !map.get(o).has(url)) I.push(['ERROR', `Reciprocity: ${url} links to ${o}, but ${o} does not link back.`]);
    if (map.size < 2 && pages.length < 2) I.push(['INFO', 'Reciprocity (return links) can only be checked when 2+ pages are pasted. Every alternate must link back to this page.']);
    return `${issues(I)}\n${head('Pages')}${info.join('\n') || '(none)'}`;
  },
});

// ---------- redirects / server config ----------
tool({
  id: 'redirect-code-generator', cat: 'SEO – Generators', title: 'Redirect Rules Generator', desc: 'old -> new pairs to Apache .htaccess, NGINX and Netlify/Cloudflare _redirects.', labels: ['Pairs: "old new", "old -> new" or "old,new" per line'],
  sample: '/old-page /new-page\n/blog/2019/post -> https://example.com/blog/post\n/promo, /sale',
  opts: [{ id: 'code', label: 'Status', type: 'select', choices: ['301', '302', '307', '308'], def: '301' }],
  run: ([t], { code }) => {
    const pr = lines(need(t, 'redirect pairs')).filter((l) => !l.startsWith('#')).map((l) => l.split(/\s*(?:->|=>|,|\s)\s*/).filter(Boolean)).filter((p) => p.length >= 2);
    if (!pr.length) throw new Error('Use one pair per line: old new');
    const op = (u) => { if (isAbs(u)) { const x = tryUrl(u); return x.pathname + x.search; } return u.startsWith('/') ? u : '/' + u; };
    const nw = (u) => (isAbs(u) ? u : u.startsWith('/') ? u : '/' + u);
    const a = pr.map(([o, n]) => (/[?]/.test(op(o)) ? `RewriteCond %{QUERY_STRING} ^${op(o).split('?')[1].replace(/[.+()]/g, '\\$&')}$\nRewriteRule ^${op(o).split('?')[0].slice(1).replace(/[.+()]/g, '\\$&')}$ ${nw(n)}? [R=${code},L]` : `Redirect ${code} ${op(o)} ${nw(n)}`));
    const n = pr.map(([o, nn]) => (/[?]/.test(op(o)) ? `# query-string match: use  if ($request_uri = "${op(o)}") { return ${code} ${nw(nn)}; }  inside the server block` : `location = ${op(o)} { return ${code} ${nw(nn)}; }`));
    const nl = pr.map(([o, nn]) => `${op(o)} ${nw(nn)} ${code}`);
    return `# --- Apache (.htaccess) ---\n${a.join('\n')}\n\n# --- NGINX (server block) ---\n${n.join('\n')}\n\n# --- _redirects (Netlify / Cloudflare Pages) ---\n${nl.join('\n')}\n\n# Tip: 301/308 are permanent (pass ranking signals), 302/307 temporary. Avoid redirect chains; point old URLs straight at the final URL.`;
  },
});

tool({
  id: 'htaccess-generator', cat: 'SEO – Generators', title: '.htaccess Generator', desc: 'HTTPS, www, trailing slash, gzip, caching and security headers for Apache.', inputs: 0, sample: '',
  opts: [{ id: 'https', label: 'Force HTTPS', type: 'checkbox', def: true }, { id: 'www', label: 'www', type: 'select', choices: ['leave', 'add www', 'remove www'], def: 'remove www' }, { id: 'slash', label: 'Trailing slash', type: 'select', choices: ['leave', 'add', 'remove'], def: 'remove' }, { id: 'gzip', label: 'Gzip/Deflate', type: 'checkbox', def: true }, { id: 'cache', label: 'Browser caching', type: 'checkbox', def: true }, { id: 'sec', label: 'Security headers', type: 'checkbox', def: true }, { id: 'domain', label: 'Domain (no www)', type: 'text', def: 'example.com' }],
  run: (_, o) => {
    const d = o.domain.trim().replace(/^www\./, '').replace(/\./g, '\\.') || 'example\\.com', out = ['# Generated .htaccess', 'Options -Indexes', '<IfModule mod_rewrite.c>', 'RewriteEngine On'];
    if (o.https) out.push('', '# Force HTTPS', 'RewriteCond %{HTTPS} !=on', 'RewriteCond %{HTTP:X-Forwarded-Proto} !https', `RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]`);
    if (o.www === 'remove www') out.push('', '# Remove www', 'RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]', 'RewriteRule ^ https://%1%{REQUEST_URI} [L,R=301]');
    if (o.www === 'add www') out.push('', '# Add www', `RewriteCond %{HTTP_HOST} ^${d}$ [NC]`, `RewriteRule ^ https://www.${d.replace(/\\/g, '')}%{REQUEST_URI} [L,R=301]`);
    if (o.slash === 'remove') out.push('', '# Remove trailing slash', 'RewriteCond %{REQUEST_FILENAME} !-d', 'RewriteRule ^(.*)/$ /$1 [L,R=301]');
    if (o.slash === 'add') out.push('', '# Add trailing slash', 'RewriteCond %{REQUEST_FILENAME} !-f', 'RewriteCond %{REQUEST_URI} !/$', 'RewriteRule ^(.*)$ /$1/ [L,R=301]');
    out.push('</IfModule>');
    if (o.gzip) out.push('', '<IfModule mod_deflate.c>', 'AddOutputFilterByType DEFLATE text/html text/plain text/css text/xml application/xml application/javascript text/javascript application/json image/svg+xml font/ttf font/otf', '</IfModule>');
    if (o.cache) out.push('', '<IfModule mod_expires.c>', 'ExpiresActive On', 'ExpiresDefault "access plus 1 month"', 'ExpiresByType text/html "access plus 0 seconds"', 'ExpiresByType image/webp "access plus 1 year"', 'ExpiresByType image/avif "access plus 1 year"', 'ExpiresByType image/jpeg "access plus 1 year"', 'ExpiresByType image/png "access plus 1 year"', 'ExpiresByType image/svg+xml "access plus 1 year"', 'ExpiresByType text/css "access plus 1 year"', 'ExpiresByType application/javascript "access plus 1 year"', 'ExpiresByType font/woff2 "access plus 1 year"', '</IfModule>');
    if (o.sec) out.push('', '<IfModule mod_headers.c>', 'Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"', 'Header always set X-Content-Type-Options "nosniff"', 'Header always set X-Frame-Options "SAMEORIGIN"', 'Header always set Referrer-Policy "strict-origin-when-cross-origin"', 'Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"', 'Header unset X-Powered-By', '</IfModule>', 'ServerSignature Off');
    return out.join('\n') + '\n\n# Test on staging first; a bad .htaccess causes 500 errors. HSTS is sticky: only enable once HTTPS works everywhere.';
  },
});

const SH = (o) => [
  ['Strict-Transport-Security', `max-age=${o.hsts}; includeSubDomains${o.preload ? '; preload' : ''}`], ['Content-Security-Policy', o.csp], ['X-Content-Type-Options', 'nosniff'], ['X-Frame-Options', o.xfo],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'], ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'], ['Cross-Origin-Opener-Policy', 'same-origin'], ['Cross-Origin-Resource-Policy', 'same-origin'],
].filter(([k, v]) => v && !(k === 'Strict-Transport-Security' && !o.hsts));
tool({
  id: 'security-headers-generator', cat: 'SEO – Generators', title: 'Security Headers Generator', desc: 'HSTS, CSP, X-Frame-Options and friends for Apache, NGINX, Netlify, Cloudflare.', inputs: 0, sample: '',
  opts: [{ id: 'platform', label: 'Platform', type: 'select', choices: ['Apache', 'NGINX', 'Netlify (_headers)', 'Cloudflare (Worker)'], def: 'NGINX' }, { id: 'csp', label: 'Content-Security-Policy', type: 'text', def: "default-src 'self'; img-src 'self' data:; frame-ancestors 'self'" }, { id: 'hsts', label: 'HSTS max-age (s, 0 = off)', type: 'number', def: 31536000 }, { id: 'preload', label: 'HSTS preload', type: 'checkbox', def: false }, { id: 'xfo', label: 'X-Frame-Options', type: 'select', choices: ['SAMEORIGIN', 'DENY'], def: 'SAMEORIGIN' }],
  run: (_, o) => {
    const h = SH(o), p = o.platform;
    const body = p === 'Apache' ? `<IfModule mod_headers.c>\n${h.map(([k, v]) => `Header always set ${k} "${v}"`).join('\n')}\n</IfModule>`
      : p === 'NGINX' ? h.map(([k, v]) => `add_header ${k} "${v}" always;`).join('\n')
        : p.startsWith('Netlify') ? `/*\n${h.map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
          : `export default {\n  async fetch(request, env) {\n    const res = await fetch(request);\n    const r = new Response(res.body, res);\n${h.map(([k, v]) => `    r.headers.set(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n')}\n    return r;\n  },\n};`;
    return `${body}\n\n# Notes: test CSP in Content-Security-Policy-Report-Only first. ${o.preload ? 'HSTS preload is hard to undo; read hstspreload.org requirements. ' : ''}${p === 'NGINX' ? 'add_header inside a location block replaces inherited headers; repeat them there. ' : ''}${p.startsWith('Cloudflare') ? '(For Cloudflare Pages use a _headers file as in the Netlify format.)' : ''}`;
  },
});

tool({
  id: 'http-headers-analyzer', cat: 'SEO – Technical', title: 'HTTP Headers Analyzer', desc: 'Paste raw response headers: security, caching, compression, SEO issues.', labels: ['Raw response headers'],
  sample: `HTTP/2 200
content-type: text/html
server: Apache/2.4.41 (Ubuntu)
x-powered-by: PHP/7.4.3
cache-control: no-cache
last-modified: Mon, 05 Jan 2026 10:00:00 GMT
x-frame-options: SAMEORIGIN
access-control-allow-origin: *
set-cookie: sid=abc123; Path=/
x-robots-tag: noindex
link: <https://example.com/page>; rel="canonical"`,
  run: ([t]) => {
    const H = {}, raw = need(t, 'headers').split(/\r?\n/); let status = '';
    for (const l of raw) { const m = l.match(/^([\w-]+)\s*:\s*(.*)$/); if (m) (H[m[1].toLowerCase()] ||= []).push(m[2].trim()); else if (/^HTTP\//i.test(l.trim())) status = l.trim(); }
    if (!Object.keys(H).length) throw new Error('No "Name: value" header lines found.');
    const g = (k) => H[k]?.[0], I = [], code = +(status.match(/\s(\d{3})\b/)?.[1] || 0);
    if (status) { if (code >= 500) I.push(['ERROR', `Server error ${code}.`]); else if (code >= 400) I.push(['ERROR', `Client error ${code}.`]); else if (code >= 300) { I.push(['INFO', `Redirect ${code} -> ${g('location') || '(no Location!)'}`]); if (code === 302 || code === 307) I.push(['INFO', 'Temporary redirect: use 301/308 if the move is permanent.']); } }
    const sec = [['strict-transport-security', 'WARN', 'HSTS missing: browsers may use plain HTTP.'], ['content-security-policy', 'WARN', 'No Content-Security-Policy.'], ['x-content-type-options', 'WARN', 'X-Content-Type-Options: nosniff missing.'], ['referrer-policy', 'INFO', 'No Referrer-Policy.'], ['permissions-policy', 'INFO', 'No Permissions-Policy.']];
    for (const [k, s, m] of sec) if (!g(k)) I.push([s, m]);
    if (!g('x-frame-options') && !/frame-ancestors/i.test(g('content-security-policy') || '')) I.push(['WARN', 'Clickjacking protection missing (X-Frame-Options or CSP frame-ancestors).']);
    const hs = g('strict-transport-security'); if (hs) { const ma = +(hs.match(/max-age=(\d+)/i)?.[1] || 0); if (ma < 15552000) I.push(['WARN', `HSTS max-age ${ma} is below 6 months.`]); if (!/includesubdomains/i.test(hs)) I.push(['INFO', 'HSTS lacks includeSubDomains.']); }
    if (/unsafe-inline|unsafe-eval/.test(g('content-security-policy') || '')) I.push(['WARN', "CSP allows 'unsafe-inline'/'unsafe-eval'."]);
    if (g('x-xss-protection') && g('x-xss-protection') !== '0') I.push(['INFO', 'X-XSS-Protection is obsolete; use CSP (or set to 0).']);
    if (/\d/.test(g('server') || '')) I.push(['INFO', `Server header leaks version: ${g('server')}`]);
    if (g('x-powered-by')) I.push(['INFO', `X-Powered-By reveals stack: ${g('x-powered-by')}`]);
    if (g('access-control-allow-origin') === '*') I.push(['INFO', 'CORS allows any origin (*): fine for public assets, risky for APIs with credentials.']);
    for (const c of H['set-cookie'] || []) { const n = c.split('=')[0], miss = ['Secure', 'HttpOnly', 'SameSite'].filter((f) => !new RegExp(f, 'i').test(c)); if (miss.length) I.push(['WARN', `Cookie "${n}" missing ${miss.join(', ')}.`]); }
    const cc = g('cache-control'), ct = g('content-type') || '';
    if (!cc && !g('expires')) I.push(['WARN', 'No Cache-Control/Expires: caching is heuristic.']);
    if (cc && /no-store|no-cache/.test(cc) && /\.(css|js|png|jpe?g|webp|woff2?)/.test(raw.join(' '))) I.push(['INFO', 'Static assets should be cacheable.']);
    if (cc && /max-age=(\d+)/.test(cc) && +cc.match(/max-age=(\d+)/)[1] < 3600 && /image|css|javascript|font/.test(ct)) I.push(['WARN', 'Short max-age for a static resource type.']);
    if (!g('etag') && !g('last-modified') && code === 200) I.push(['INFO', 'No ETag/Last-Modified: conditional requests (304) impossible.']);
    if (/text|json|xml|javascript|svg/.test(ct) && !g('content-encoding')) I.push(['WARN', 'No Content-Encoding (gzip/br): text response is uncompressed.']);
    if (/^text\/html/.test(ct) && !/charset/i.test(ct)) I.push(['INFO', 'Content-Type has no charset (ok if <meta charset> is present).']);
    if (!g('vary') && g('content-encoding')) I.push(['INFO', 'Compressed response should send Vary: Accept-Encoding.']);
    const xr = g('x-robots-tag'); if (xr) I.push([/noindex|none/i.test(xr) ? 'ERROR' : 'INFO', `X-Robots-Tag: ${xr}${/noindex|none/i.test(xr) ? ' -> page will NOT be indexed' : ''}`]);
    const lk = g('link'); if (lk && /rel="?canonical/i.test(lk)) I.push(['INFO', `Canonical via Link header: ${lk.match(/<([^>]+)>/)?.[1]}`]);
    return `${status || '(no status line)'}\n${head('Issues')}${issues(I)}\n${head('Parsed headers')}${Object.entries(H).map(([k, v]) => `${k}: ${v.join(' | ')}`).join('\n')}`;
  },
});

// ---------- misc generators ----------
const TR = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', þ: 'th', ð: 'd' };
tool({
  id: 'slug-generator', cat: 'SEO – Generators', title: 'URL Slug Generator', desc: 'Turn titles into clean, SEO-friendly URL slugs.', labels: ['Titles, one per line'],
  sample: 'Crème Brûlée: The Best Dessert Recipe (2026)!\nHow to Choose the Right Running Shoes for Your Feet\nStraße & Café – Über uns',
  opts: [{ id: 'sep', label: 'Separator', type: 'select', choices: ['-', '_'], def: '-' }, { id: 'stop', label: 'Remove stop words', type: 'checkbox', def: false }, { id: 'max', label: 'Max length (0 = none)', type: 'number', def: 60 }],
  run: ([t], { sep, stop, max }) => lines(need(t, 'titles')).map((l) => {
    let w = l.toLowerCase().replace(/[ßæœøđłþð]/g, (c) => TR[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    if (stop) { const f = w.filter((x) => !STOP.has(x)); if (f.length) w = f; }
    let s = w.join(sep); if (max > 0 && s.length > max) { s = s.slice(0, max); const i = s.lastIndexOf(sep); if (i > max * 0.5) s = s.slice(0, i); }
    return s || '(empty)';
  }).join('\n'),
});

tool({
  id: 'utm-builder', cat: 'SEO – Generators', title: 'UTM Campaign URL Builder', desc: 'Add utm_ parameters to a URL (single or one URL per line).', labels: ['Fields (key: value)'],
  sample: 'url: https://example.com/landing\nsource: newsletter\nmedium: email\ncampaign: spring_sale\nterm: running shoes\ncontent: header_link\nid: 123',
  opts: [{ id: 'lc', label: 'Lowercase values', type: 'checkbox', def: true }],
  run: ([t], { lc }) => {
    const f = kvo(need(t, 'fields')); if (!f.url) throw new Error('Add a "url:" line.');
    const u = tryUrl(/^[a-z]+:\/\//i.test(f.url) ? f.url : 'https://' + f.url); if (!u) throw new Error('Invalid URL.');
    const I = []; for (const k of ['source', 'medium', 'campaign']) if (!f[k]) I.push(['WARN', `utm_${k} is required by GA4 best practice.`]);
    for (const [k, p] of [['source', 'utm_source'], ['medium', 'utm_medium'], ['campaign', 'utm_campaign'], ['term', 'utm_term'], ['content', 'utm_content'], ['id', 'utm_id']]) if (f[k]) u.searchParams.set(p, lc ? f[k].toLowerCase() : f[k]);
    if (/\s/.test(Object.values(f).join(''))) I.push(['INFO', 'Spaces are encoded as +; prefer underscores.']);
    I.push(['INFO', 'Do not use UTM parameters on internal links: they reset the session source.']);
    return `${u.href}\n\n${issues(I)}`;
  },
});

export default T;

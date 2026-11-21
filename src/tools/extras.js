// Extras: SEO/marketing helpers, product planning, small games & learning widgets, dev odds and ends.
// Pure tools have `sample` and run under Node; render/dom tools are marked `custom:true` / `dom:true`.
// Everything is client-side; localStorage is only touched inside try/catch.

const SEO = 'SEO – Extras', MKT = 'Marketing', PRD = 'Product Planning', GAM = 'Games', LRN = 'Learning', DEV = 'Dev Extras';

// ---------- helpers ----------
const num = (id, label, def) => ({ id, label, type: 'number', def });
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const chk = (id, label, def = false) => ({ id, label, type: 'checkbox', def });
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const calc = (id, cat, title, desc, opts, fn) => ({ id, cat, title, desc, inputs: 0, sample: '', opts, run: (_i, o) => fn(o) });
const lines = (s) => String(s || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const csvList = (s) => String(s || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
const r2 = (x, d = 2) => Number(x).toLocaleString('en-US', { maximumFractionDigits: d });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const need = (o, ...ks) => { for (const k of ks) if (!Number.isFinite(o[k])) throw new Error('Enter a valid number for ' + k); };
const tbl = (head, rows) => {
  const all = [head, ...rows].map((x) => x.map(String));
  const w = head.map((_, i) => Math.max(...all.map((x) => x[i].length)));
  return all.map((x) => x.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd()).join('\n');
};
const csvCell = (s) => (/[",\n]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
const mdCell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const bar = (p, n = 20) => '#'.repeat(Math.round(Math.max(0, Math.min(1, p)) * n)).padEnd(n, '.');
const store = {
  get(k, d) { try { const v = localStorage.getItem('ft-extras-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ft-extras-' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.setAttribute('style', v);
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...kids.flat().filter((x) => x != null));
  return e;
}
const BTN = 'margin:2px 4px 2px 0';
const btn = (label, fn, extra = '', name = '') => h('button', { onclick: fn, style: BTN + extra, ...(name ? { 'aria-label': name } : {}) }, label);
const day = () => Math.floor(Date.now() / 864e5);
const pDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) throw new Error('Use a start date like 2026-01-05');
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
};
const normCdf = (z) => {
  // erfc via Numerical Recipes Chebyshev fit (abs error < 1.2e-7)
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.5 * x);
  const erfc = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return z >= 0 ? 1 - erfc / 2 : erfc / 2;
};
const invNorm = (p) => { let lo = -10, hi = 10; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (normCdf(mid) < p) lo = mid; else hi = mid; } return (lo + hi) / 2; };

// ---------- SEO ----------
const disavow = {
  id: 'disavow-file-generator', cat: SEO, title: 'Disavow File Generator',
  desc: 'Turn a list of spammy domains/URLs into a Google Search Console disavow.txt with comments.',
  labels: ['Domains or URLs (one per line)'], placeholder: ['spam-site.example\nhttps://bad.example/page.html'],
  sample: 'http://spammy-links.example/page?id=1\nhttps://www.cheap-seo.example/\nlink-farm.example\n# already a comment\ndomain:old-entry.example',
  opts: [sel('mode', 'Mode', ['whole domains', 'keep full URLs']), txt('reason', 'Comment (reason)', 'Unnatural links found in link audit'), chk('date', 'Add date in header', true)],
  run: ([t], o) => {
    const out = new Set(); let n = 0;
    for (let l of lines(t)) {
      if (l.startsWith('#')) continue;
      n++;
      if (/^domain:/i.test(l)) { out.add('domain:' + l.slice(7).trim().toLowerCase()); continue; }
      const host = l.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0].replace(/^www\./i, '').toLowerCase();
      if (!host.includes('.')) throw new Error('Not a domain or URL: ' + l);
      out.add(o.mode === 'whole domains' || !/^[a-z]+:\/\//i.test(l) ? 'domain:' + host : l);
    }
    if (!out.size) throw new Error('Add at least one domain or URL');
    const head = ['# Disavow file' + (o.date ? ' generated ' + new Date().toISOString().slice(0, 10) : ''), o.reason ? '# ' + o.reason : null, `# ${out.size} entries from ${n} input lines`].filter(Boolean);
    return [...head, ...[...out].sort()].join('\n');
  },
};

const AD_LIMITS = {
  'Google Search (RSA)': [['Headline 1', 30], ['Headline 2', 30], ['Headline 3', 30], ['Description 1', 90], ['Description 2', 90], ['Path 1', 15], ['Path 2', 15]],
  'Meta (Facebook/Instagram)': [['Primary text (recommended)', 125], ['Headline', 40], ['Description', 30]],
  'LinkedIn Sponsored Content': [['Intro text (recommended)', 150], ['Headline', 70], ['Description', 100]],
  'X (Twitter) post': [['Post', 280], ['Card title', 70]],
};
const adCopy = {
  id: 'ad-copy-counter', cat: MKT, title: 'Ad Copy Character Counter',
  desc: 'Check ad text against Google, Meta, LinkedIn and X limits. One line per field, in field order.',
  labels: ['Ad copy (one field per line, in order)'],
  sample: 'Fast Free SEO Tools\nNo Signup Needed\nRun Audits In Seconds\nAudit titles, links and schema right in your browser. Nothing is uploaded.\nPrivate, fast and free forever.\nseo\ntools',
  opts: [sel('platform', 'Platform', Object.keys(AD_LIMITS))],
  run: ([t], o) => {
    const f = AD_LIMITS[o.platform], ls = lines(t);
    if (!ls.length) throw new Error('Enter ad copy');
    const rows = ls.map((l, i) => {
      const [name, lim] = f[i] || ['(extra line)', f[f.length - 1][1]], n = [...l].length;
      return [name, `${n}/${lim}`, n <= lim ? 'ok' : `over by ${n - lim}`];
    });
    return tbl(['Field', 'Chars', 'Status'], rows) + (ls.length < f.length ? '\n\nMissing fields: ' + f.slice(ls.length).map((x) => x[0]).join(', ') : '') +
      '\n\nLimits are the standard/recommended display limits; platforms may truncate or change them.';
  },
};

const anchorDist = {
  id: 'anchor-text-distribution', cat: SEO, title: 'Anchor Text Distribution',
  desc: 'Paste backlink anchor texts and see branded / exact / partial / generic / URL buckets.',
  labels: ['Anchor texts (one per line, repeats allowed)'],
  sample: 'Sitefig\nsitefig.eu\nfree seo tools\nclick here\nbest free seo tools\nread more\nseo tools for free\nSitefig tools\nhttps://sitefig.eu/tools\nthis article\nseo checker',
  opts: [txt('brand', 'Brand terms (comma)', 'sitefig'), txt('kw', 'Target keywords (comma)', 'free seo tools, seo checker')],
  run: ([t], o) => {
    const brand = csvList(o.brand).map((x) => x.toLowerCase()), kws = csvList(o.kw).map((x) => x.toLowerCase());
    const generic = /^(click here|here|read more|learn more|this|this (article|page|post|site|link|website)|website|link|source|visit|more|check it out|see more|homepage|go|view)$/;
    const b = { 'URL / naked link': 0, Branded: 0, 'Exact match': 0, 'Partial match': 0, Generic: 0, Other: 0 };
    const ls = lines(t);
    if (!ls.length) throw new Error('Enter anchors');
    for (const a of ls.map((x) => x.toLowerCase())) {
      const k = /^(https?:\/\/|www\.)/.test(a) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(a) ? 'URL / naked link'
        : brand.some((x) => a.includes(x)) ? 'Branded'
        : kws.includes(a) ? 'Exact match'
        : kws.some((k2) => a.includes(k2) || k2.split(/\s+/).filter((w) => w.length > 2).some((w) => a.split(/\W+/).includes(w))) ? 'Partial match'
        : generic.test(a) ? 'Generic' : 'Other';
      b[k]++;
    }
    const rows = Object.entries(b).map(([k, v]) => [k, v, (v / ls.length * 100).toFixed(1) + '%', bar(v / ls.length)]);
    const ex = b['Exact match'] / ls.length;
    return tbl(['Bucket', 'Count', 'Share', ''], rows) + `\n\nTotal: ${ls.length}` + (ex > 0.1 ? '\nWarning: exact-match share above ~10% can look over-optimised.' : '');
  },
};

const STOP = new Set('a an the and or of for to in on with how what why is are do does best top vs near me my your you i from by at as it'.split(' '));
const stem = (w) => w.replace(/(ing|ers|er|es|ed|s)$/, (m) => (w.length - m.length >= 3 ? '' : m)).replace(/([^aeiou0-9])\1$/, '$1');
const kwClusterer = {
  id: 'keyword-clusterer', cat: SEO, title: 'Keyword Clusterer',
  desc: 'Group keywords by their most shared stem word. Deterministic, no ML.',
  labels: ['Keywords (one per line)'],
  sample: 'running shoes\nbest running shoes for women\ntrail running shoes\nrunning shorts\nhow to start running\nmarathon training plan\nmarathon training schedule\nhalf marathon training\ncheap trainers',
  opts: [num('min', 'Min cluster size', 2)],
  run: ([t], o) => {
    const ks = [...new Set(lines(t).map((x) => x.toLowerCase()))];
    if (!ks.length) throw new Error('Enter keywords');
    const toks = ks.map((k) => [...new Set(k.split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).map(stem))]);
    const freq = {};
    toks.forEach((ts) => ts.forEach((w) => { freq[w] = (freq[w] || 0) + 1; }));
    const groups = {};
    ks.forEach((k, i) => {
      const best = toks[i].filter((w) => freq[w] >= Math.max(2, o.min)).sort((a, b) => freq[b] - freq[a] || a.localeCompare(b))[0];
      (groups[best || '(unclustered)'] ||= []).push(k);
    });
    return Object.entries(groups).sort((a, b) => (a[0] === '(unclustered)') - (b[0] === '(unclustered)') || b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([g, v]) => `## ${g} (${v.length})\n` + v.sort().map((x) => '- ' + x).join('\n')).join('\n\n');
  },
};

const INTENT = [
  ['transactional', /\b(buy|purchase|order|price|prices|pricing|cheap|cheapest|discount|coupon|promo|deal|deals|sale|for sale|shop|hire|quote|subscribe|download|free trial|cost)\b/],
  ['navigational', /\b(login|log in|sign in|signin|official|website|homepage|contact|support number|app|dashboard|portal|account)\b|\.(com|net|org|io)\b/],
  ['commercial', /\b(best|top|review|reviews|vs|versus|compare|comparison|alternative|alternatives|rated|ranking|recommended)\b/],
  ['informational', /\b(how|what|why|when|where|who|which|guide|tutorial|tips|examples?|ideas|definition|meaning|learn|explained|checklist|template|can|does|is|are)\b/],
];
const intentTool = {
  id: 'keyword-intent-classifier', cat: SEO, title: 'Keyword Intent Classifier',
  desc: 'Rule-based search intent labels (informational, commercial, transactional, navigational).',
  labels: ['Keywords (one per line)'],
  sample: 'how to start a blog\nbest crm software\nbuy running shoes online\nfacebook login\nseo tools vs semrush\nhosting coupon code\nwhat is schema markup\nmailchimp pricing',
  run: ([t]) => {
    const ks = lines(t);
    if (!ks.length) throw new Error('Enter keywords');
    const rows = ks.map((k) => {
      const l = k.toLowerCase();
      for (const [name, re] of INTENT) { const m = re.exec(l); if (m) return [k, name, m[0]]; }
      return [k, 'informational?', '(no signal; default)'];
    });
    const c = {}; rows.forEach((x) => { c[x[1]] = (c[x[1]] || 0) + 1; });
    return tbl(['Keyword', 'Intent', 'Signal'], rows) + '\n\n' + Object.entries(c).map(([k, v]) => `${k}: ${v}`).join('\n');
  },
};

const POWER = 'free ultimate proven secret essential amazing powerful easy simple fast quick instant best complete guide surprising shocking incredible effortless exclusive new now today ultimate hidden brutal honest critical must mistakes stop why how'.split(' ');
const POS = 'best love great easy win success boost happy better improve smart growth free simple secure amazing proven'.split(' ');
const NEG = 'worst mistake mistakes fail failure avoid stop never kill danger risk wrong bad hate lose problem hurt scam'.split(' ');
const headlineTool = {
  id: 'title-case-headline-analyzer', cat: SEO, title: 'Headline Analyzer',
  desc: 'Score headlines on length, numbers, power words and sentiment-lite. Heuristic, not an SEO guarantee.',
  labels: ['Headlines (one per line)'],
  sample: '10 Proven Ways to Boost Your Site Speed Today\nSEO Tips\nWhy Most Link Building Mistakes Are Easy to Avoid',
  run: ([t]) => {
    const hs = lines(t);
    if (!hs.length) throw new Error('Enter headlines');
    return hs.map((hd) => {
      const w = hd.toLowerCase().match(/[a-z']+/g) || [], len = [...hd].length;
      const pw = [...new Set(w.filter((x) => POWER.includes(x)))], pos = w.filter((x) => POS.includes(x)).length, neg = w.filter((x) => NEG.includes(x)).length;
      const hasNum = /\d/.test(hd);
      let s = 30 + (len >= 40 && len <= 65 ? 25 : len >= 30 && len <= 70 ? 12 : 0) + (hasNum ? 12 : 0) + Math.min(15, pw.length * 5) + (pos + neg ? 8 : 0) + (/^(how|why|what|when|\d)/i.test(hd) ? 5 : 0) + (w.length >= 5 && w.length <= 12 ? 5 : 0);
      s = Math.min(100, s);
      const tone = pos > neg ? 'positive' : neg > pos ? 'negative' : 'neutral';
      return `${hd}\n  score ${s}/100 | ${len} chars${len > 60 ? ' (may truncate in SERP)' : len < 30 ? ' (short)' : ''} | ${w.length} words | number: ${hasNum ? 'yes' : 'no'} | tone: ${tone}\n  power words: ${pw.join(', ') || 'none'}`;
    }).join('\n\n');
  },
};

const operators = {
  id: 'search-operators-builder', cat: SEO, title: 'Google Search Operators Builder',
  desc: 'Build an advanced Google query from fields (site:, intitle:, filetype:, exclusions, dates).',
  inputs: 0, sample: '',
  opts: [txt('q', 'Keywords', 'seo audit checklist'), txt('exact', 'Exact phrase', 'technical seo'), txt('any', 'Any of (comma, OR)', 'template, pdf'), txt('none', 'Exclude words (comma)', 'jobs, salary'),
    txt('site', 'site:', 'example.com'), txt('nosite', '-site:', ''), txt('intitle', 'intitle:', 'checklist'), txt('inurl', 'inurl:', 'blog'), txt('intext', 'intext:', ''),
    txt('filetype', 'filetype:', ''), txt('after', 'after: (YYYY-MM-DD)', '2024-01-01'), txt('before', 'before: (YYYY-MM-DD)', ''), txt('related', 'related: domain', '')],
  run: (_i, o) => {
    const q = (s) => (/\s/.test(s) ? `"${s}"` : s), p = [];
    if (o.q) p.push(o.q.trim());
    if (o.exact) p.push(`"${o.exact.trim()}"`);
    const any = csvList(o.any); if (any.length) p.push('(' + any.map(q).join(' OR ') + ')');
    csvList(o.none).forEach((x) => p.push('-' + q(x)));
    for (const k of ['site', 'intitle', 'inurl', 'intext', 'filetype', 'related', 'after', 'before']) if (o[k]?.trim()) p.push(`${k}:${q(o[k].trim())}`);
    if (o.nosite?.trim()) p.push('-site:' + o.nosite.trim());
    if (!p.length) throw new Error('Fill at least one field');
    const query = p.join(' ');
    return `${query}\n\nhttps://www.google.com/search?q=${encodeURIComponent(query)}`;
  },
};

const topicCluster = {
  id: 'topic-cluster-planner', cat: SEO, title: 'Topic Cluster Planner',
  desc: 'First line = pillar topic, remaining lines = subtopics. Outputs a pillar/cluster outline with a linking plan.',
  labels: ['Pillar topic, then subtopics'],
  sample: 'Technical SEO\nXML sitemaps\nRobots.txt rules\nCanonical tags\nCore Web Vitals\nStructured data',
  run: ([t]) => {
    const [pillar, ...subs] = lines(t);
    if (!pillar || !subs.length) throw new Error('Add a pillar line and at least one subtopic');
    const out = [`PILLAR PAGE: The Complete Guide to ${pillar}`, `  Target: "${pillar.toLowerCase()}" | broad, ~2,500+ words, links to every cluster page`, ''];
    subs.forEach((s, i) => out.push(`CLUSTER ${i + 1}: ${s}`, `  Title idea: ${['What Is', 'How to Use', 'A Practical Guide to', 'Common Mistakes With', 'Checklist for'][i % 5]} ${s}`,
      `  Links: -> pillar (anchor "${pillar.toLowerCase()}"); pillar -> this page${subs.length > 1 ? `; <-> ${subs[(i + 1) % subs.length]}` : ''}`, ''));
    out.push('Rules: every cluster links up to the pillar with descriptive anchors; link sideways only where topics overlap; update the pillar when a cluster is published.');
    return out.join('\n');
  },
};

const utmBulk = {
  id: 'utm-bulk-builder', cat: SEO, title: 'UTM Bulk Builder',
  desc: 'Add UTM parameters to many URLs at once (existing query strings are preserved).',
  labels: ['URLs (one per line)'],
  sample: 'https://example.com/landing\nhttps://example.com/pricing?plan=pro\nhttps://example.com/blog/post#intro',
  opts: [txt('source', 'utm_source', 'newsletter'), txt('medium', 'utm_medium', 'email'), txt('campaign', 'utm_campaign', 'spring_launch'), txt('term', 'utm_term', ''), txt('content', 'utm_content', ''), chk('lower', 'Lowercase values', true)],
  run: ([t], o) => {
    if (!o.source || !o.medium || !o.campaign) throw new Error('source, medium and campaign are required');
    const ls = lines(t);
    if (!ls.length) throw new Error('Enter URLs');
    return ls.map((l) => {
      let u; try { u = new URL(l); } catch { throw new Error('Invalid URL: ' + l); }
      for (const k of ['source', 'medium', 'campaign', 'term', 'content']) if (o[k]) u.searchParams.set('utm_' + k, o.lower ? o[k].toLowerCase() : o[k]);
      return u.href;
    }).join('\n');
  },
};

// ---------- Marketing ----------
const roas = calc('ads-roas-calculator', MKT, 'Ads ROAS / CPA Calculator', 'ROAS, CPA, CPC, CTR, break-even ROAS and a channel budget split.',
  [num('spend', 'Ad spend', 1000), num('revenue', 'Revenue from ads', 4200), num('clicks', 'Clicks', 2500), num('impr', 'Impressions', 90000), num('conv', 'Conversions', 70), num('margin', 'Gross margin %', 35),
    txt('split', 'Budget split (name weight, ...)', 'Search 50, Social 30, Display 20'), num('budget', 'Budget to split', 5000)],
  (o) => {
    need(o, 'spend', 'revenue', 'clicks', 'impr', 'conv', 'margin', 'budget');
    if (o.spend <= 0) throw new Error('Ad spend must be above 0');
    const d = (a, b) => (b ? a / b : 0), be = o.margin > 0 ? 100 / o.margin : Infinity, ro = o.revenue / o.spend, profit = o.revenue * o.margin / 100 - o.spend;
    const parts = csvList(o.split).map((x) => { const m = /^(.*?)\s+(\d+(?:\.\d+)?)$/.exec(x); if (!m) throw new Error('Split item needs a weight: ' + x); return [m[1], +m[2]]; });
    const tot = parts.reduce((a, b) => a + b[1], 0);
    return [`ROAS: ${r2(ro)}x (${r2(ro * 100, 0)}%)`, `Break-even ROAS: ${isFinite(be) ? r2(be) + 'x' : 'n/a'} -> ${ro >= be ? 'profitable' : 'losing money'}`, `Profit after ad spend: ${r2(profit)}`,
      `CPA: ${r2(d(o.spend, o.conv))}`, `CPC: ${r2(d(o.spend, o.clicks))}`, `CTR: ${r2(d(o.clicks, o.impr) * 100)}%`, `Conversion rate: ${r2(d(o.conv, o.clicks) * 100)}%`, `AOV: ${r2(d(o.revenue, o.conv))}`,
      `CPM: ${r2(d(o.spend, o.impr) * 1000)}`, '', 'Budget split:', ...(tot ? parts.map(([n, w]) => `  ${n}: ${r2(o.budget * w / tot)} (${r2(w / tot * 100, 1)}%)`) : ['  (none)'])].join('\n');
  });

const abTest = calc('ab-test-calculator', MKT, 'A/B Test Significance Calculator', 'Two-proportion z-test (pooled), confidence and required sample size.',
  [num('na', 'Visitors A', 5000), num('ca', 'Conversions A', 200), num('nb', 'Visitors B', 5000), num('cb', 'Conversions B', 250), sel('conf', 'Confidence', ['90', '95', '99'], '95'),
    num('mde', 'Sample size: relative lift to detect %', 10), sel('power', 'Power', ['80', '90'], '80')],
  (o) => {
    need(o, 'na', 'ca', 'nb', 'cb', 'mde');
    if (o.na <= 0 || o.nb <= 0 || o.ca < 0 || o.cb < 0 || o.ca > o.na || o.cb > o.nb) throw new Error('Conversions must be between 0 and visitors');
    const pa = o.ca / o.na, pb = o.cb / o.nb, pp = (o.ca + o.cb) / (o.na + o.nb), se = Math.sqrt(pp * (1 - pp) * (1 / o.na + 1 / o.nb));
    const z = se ? (pb - pa) / se : 0, p2 = 2 * (1 - normCdf(Math.abs(z))), p1 = 1 - normCdf(Math.abs(z));
    const alpha = 1 - +o.conf / 100, sig = p2 < alpha;
    const seU = Math.sqrt(pa * (1 - pa) / o.na + pb * (1 - pb) / o.nb), zc = invNorm(1 - alpha / 2);
    const out = [`A: ${r2(pa * 100, 3)}%   B: ${r2(pb * 100, 3)}%   relative lift: ${pa ? r2((pb / pa - 1) * 100) + '%' : 'n/a'}`, `z = ${z.toFixed(3)}`, `p-value (two-sided) = ${p2.toFixed(4)}   (one-sided = ${p1.toFixed(4)})`,
      `Significant at ${o.conf}% confidence: ${sig ? 'YES' : 'no'}`, `Difference CI (${o.conf}%): ${r2((pb - pa - zc * seU) * 100, 3)}% to ${r2((pb - pa + zc * seU) * 100, 3)}% points`];
    if (pa > 0 && o.mde > 0) {
      const q = Math.min(0.9999, pa * (1 + o.mde / 100)), za = zc, zb = invNorm(+o.power / 100), pm = (pa + q) / 2;
      const n = Math.ceil((za * Math.sqrt(2 * pm * (1 - pm)) + zb * Math.sqrt(pa * (1 - pa) + q * (1 - q))) ** 2 / (q - pa) ** 2);
      out.push('', `Sample size to detect a ${o.mde}% relative lift from baseline ${r2(pa * 100, 2)}% (${o.power}% power): ${n.toLocaleString('en-US')} per variant, ${(2 * n).toLocaleString('en-US')} total`);
    }
    return out.join('\n');
  });

const funnel = {
  id: 'conversion-funnel-visualizer', cat: MKT, title: 'Conversion Funnel Visualizer',
  desc: 'Stages and counts become a funnel chart with step and overall conversion.',
  labels: ['Stage, count (one per line)'], sample: 'Visits, 10000\nSign-up page, 3200\nSigned up, 950\nActivated, 410\nPaid, 120',
  run: ([t]) => {
    const st = lines(t).map((l) => { const m = /^(.*?)[,;\t]\s*([\d.,]+)$/.exec(l); if (!m) throw new Error('Use "Stage, count": ' + l); return [m[1], parseFloat(m[2].replace(/,/g, ''))]; });
    if (st.length < 2) throw new Error('Need at least two stages');
    const top = st[0][1];
    const rows = st.map(([n, c], i) => {
      const step = i ? (st[i - 1][1] ? c / st[i - 1][1] * 100 : 0) : 100;
      return `<div class="r"><div class="l">${esc(n)}</div><div class="t"><div class="b" style="width:${Math.max(1, c / top * 100).toFixed(1)}%">${c.toLocaleString('en-US')}</div></div><div class="s">${i ? step.toFixed(1) + '% of prev<br>drop-off ' + (100 - step).toFixed(1) + '%' : '100%'}<br><b>${(c / top * 100).toFixed(1)}% overall</b></div></div>`;
    }).join('');
    return { html: `<!doctype html><meta charset=utf-8><style>body{font:14px system-ui,sans-serif;margin:12px}.r{display:flex;align-items:center;gap:10px;margin:6px 0}.l{width:130px}.t{flex:1;background:#eee;border-radius:4px}.b{background:#2b6cb0;color:#fff;padding:6px 8px;border-radius:4px;box-sizing:border-box;white-space:nowrap;min-width:max-content}.s{width:150px;font-size:12px;color:#444}</style>${rows}` };
  },
};

const retention = calc('retention-calculator', MKT, 'Retention & Churn Calculator', 'Customer count projection with constant churn, lifetime and LTV.',
  [num('start', 'Starting customers', 1000), num('add', 'New customers per period', 100), num('churn', 'Churn % per period', 5), num('n', 'Periods', 12), num('arpu', 'Revenue per customer per period', 20)],
  (o) => {
    need(o, 'start', 'add', 'churn', 'n', 'arpu');
    if (o.churn < 0 || o.churn > 100 || o.n < 1 || o.n > 240) throw new Error('Churn 0-100, periods 1-240');
    const c = o.churn / 100; let cur = o.start; const rows = [];
    for (let i = 1; i <= o.n; i++) { const lost = cur * c, end = cur - lost + o.add; rows.push([i, r2(cur, 0), r2(lost, 0), r2(o.add, 0), r2(end, 0)]); cur = end; }
    return tbl(['Period', 'Start', 'Churned', 'New', 'End'], rows) + `\n\nRetention per period: ${r2(100 - o.churn)}%\nOriginal cohort left after ${o.n} periods: ${r2(o.start * (1 - c) ** o.n, 0)} (${r2((1 - c) ** o.n * 100)}%)\n` +
      (c ? `Average lifetime: ${r2(1 / c)} periods\nLTV (revenue): ${r2(o.arpu / c)}\nSteady-state customers: ${r2(o.add / c, 0)}` : 'No churn: lifetime is unbounded.');
  });

const calendar = {
  id: 'content-calendar-generator', cat: MKT, title: 'Content Calendar Generator',
  desc: 'Assign topics to dates on a cadence; export Markdown or CSV.',
  labels: ['Topics (one per line)'], sample: 'Launch announcement\nHow-to: first audit\nCustomer story\nPricing explained\nYear in review',
  opts: [txt('start', 'Start date (YYYY-MM-DD)', '2026-01-05'), sel('cad', 'Cadence', ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'], 'weekly'), txt('chan', 'Channel', 'Blog'), sel('fmt', 'Format', ['markdown', 'csv'])],
  run: ([t], o) => {
    const ts = lines(t);
    if (!ts.length) throw new Error('Enter topics');
    let d = pDate(o.start); const W = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], rows = [];
    const skip = () => { while (o.cad === 'weekdays' && [0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() + 864e5); };
    skip();
    for (const tp of ts) {
      rows.push([d.toISOString().slice(0, 10), W[d.getUTCDay()], tp, o.chan, 'Planned']);
      if (o.cad === 'monthly') { const day0 = d.getUTCDate(); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day0, last)); }
      else { d = new Date(d.getTime() + 864e5 * ({ daily: 1, weekdays: 1, weekly: 7, biweekly: 14 }[o.cad])); skip(); }
    }
    const head = ['Date', 'Day', 'Topic', 'Channel', 'Status'];
    return o.fmt === 'csv' ? [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
      : `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n` + rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`).join('\n');
  },
};

// generic fill-in template tool: fields -> text
const template = (id, cat, title, desc, fields, fn) => ({ id, cat, title, desc, inputs: 0, sample: '', opts: fields.map(([i, l, d]) => txt(i, l, d)), run: (_i, o) => fn(o) });

const pressRelease = template('press-release-template', MKT, 'Press Release Template', 'Fill in the blanks for a standard press release.',
  [['company', 'Company', 'Acme Inc.'], ['headline', 'Headline', 'Acme Launches Free Privacy-First SEO Toolbox'], ['city', 'City', 'Ghent, Belgium'], ['date', 'Date', '5 January 2026'],
    ['what', 'What is announced (1-2 sentences)', 'Acme today announced a free toolbox of 150 SEO and developer tools that run entirely in the browser.'], ['why', 'Why it matters', 'No data leaves the user\'s device, which removes the usual privacy trade-off of online tools.'],
    ['person', 'Quote from (name, title)', 'Jane Doe, CEO of Acme'], ['quote', 'Quote', 'We built the tools we wanted: fast, free and private.'], ['link', 'More info URL', 'https://example.com'], ['contact', 'Press contact', 'press@example.com'], ['about', 'About company', 'Acme builds small, focused tools for marketers and developers.']],
  (o) => `FOR IMMEDIATE RELEASE\n\n${o.headline}\n\n${o.city} - ${o.date} - ${o.what} ${o.why}\n\n"${o.quote}" said ${o.person}.\n\nTo learn more, visit ${o.link}.\n\nAbout ${o.company}\n${o.about}\n\nMedia contact\n${o.contact}\n\n###`);

const appStore = template('app-store-description-template', PRD, 'App Store Description Template', 'App Store / Google Play listing text with character-limit checks.',
  [['name', 'App name', 'Tidy Tasks'], ['tagline', 'Tagline / subtitle', 'Plan your day in seconds'], ['what', 'What it does (one sentence)', 'Tidy Tasks is a minimal to-do app that keeps your day on one screen.'],
    ['features', 'Features (comma)', 'Offline first, Widgets, Recurring tasks, Dark mode'], ['who', 'Who it is for', 'busy people who dislike complicated planners'], ['kw', 'Keywords (comma, iOS)', 'todo,tasks,planner,checklist,reminders'], ['cta', 'Call to action', 'Download Tidy Tasks and finish what matters today.']],
  (o) => {
    const f = csvList(o.features), L = (s, n) => `${[...s].length}/${n}${[...s].length > n ? ' OVER' : ''}`;
    const kw = csvList(o.kw).join(','), short = o.what.slice(0, 80);
    return [`APP NAME (30): ${o.name} [${L(o.name, 30)}]`, `SUBTITLE (iOS 30): ${o.tagline} [${L(o.tagline, 30)}]`, `KEYWORDS (iOS 100): ${kw} [${L(kw, 100)}]`, `SHORT DESCRIPTION (Google Play 80): ${short} [${L(short, 80)}]`, '',
      'FULL DESCRIPTION (4000)', o.what, '', `Made for ${o.who}.`, '', 'KEY FEATURES', ...f.map((x) => '- ' + x), '', o.cta].join('\n');
  });

const swot = template('swot-generator', PRD, 'SWOT Analysis Template', 'Fill four comma lists and get a SWOT matrix in Markdown.',
  [['subject', 'Subject', 'My SaaS'], ['s', 'Strengths (comma)', 'Fast product, loyal early users'], ['w', 'Weaknesses (comma)', 'Small team, no brand'], ['o', 'Opportunities (comma)', 'Growing niche, partner channels'], ['t', 'Threats (comma)', 'Big incumbents, platform changes']],
  (o) => {
    const c = (k) => csvList(o[k]).map((x) => '- ' + x).join('\n') || '- ';
    return `# SWOT: ${o.subject}\n\n## Strengths (internal, helpful)\n${c('s')}\n\n## Weaknesses (internal, harmful)\n${c('w')}\n\n## Opportunities (external, helpful)\n${c('o')}\n\n## Threats (external, harmful)\n${c('t')}\n\n## Next\n- Use strengths to capture opportunities\n- Fix weaknesses that expose threats`;
  });

const persona = template('user-persona-template', PRD, 'User Persona Template', 'A one-page user persona in Markdown.',
  [['name', 'Name', 'Sam, the busy freelancer'], ['age', 'Age', '32'], ['job', 'Role', 'Freelance designer'], ['goals', 'Goals (comma)', 'Win more clients, spend less time on admin'], ['pains', 'Frustrations (comma)', 'Chasing invoices, too many tools'],
    ['tools', 'Current tools (comma)', 'Spreadsheet, email'], ['quote', 'Quote', 'I just want it to work without setup.'], ['channels', 'Where to reach them (comma)', 'Newsletters, Reddit']],
  (o) => `# Persona: ${o.name}\n\n> "${o.quote}"\n\n- Age: ${o.age}\n- Role: ${o.job}\n\n## Goals\n${csvList(o.goals).map((x) => '- ' + x).join('\n')}\n\n## Frustrations\n${csvList(o.pains).map((x) => '- ' + x).join('\n')}\n\n## Current tools\n${csvList(o.tools).map((x) => '- ' + x).join('\n')}\n\n## Channels\n${csvList(o.channels).map((x) => '- ' + x).join('\n')}`);

// ---------- Product planning ----------
const rice = {
  id: 'rice-prioritization', cat: PRD, title: 'RICE / ICE / MoSCoW Prioritization',
  desc: 'Score features: "feature, reach, impact, confidence, effort" per line, ranked.',
  labels: ['feature, reach, impact, confidence, effort'],
  sample: 'Dark mode, 2000, 1, 80, 2\nCSV export, 500, 2, 100, 1\nTeam accounts, 800, 3, 50, 8\nMobile app, 3000, 2, 50, 20',
  opts: [sel('m', 'Method', ['RICE', 'ICE', 'MoSCoW'])],
  run: ([t], o) => {
    const rows = lines(t).filter((l) => !/^feature\b/i.test(l)).map((l) => {
      const p = l.split(',').map((x) => x.trim()); if (p.length < 5) throw new Error('Need 5 comma-separated fields: ' + l);
      const [reach, impact, conf, eff] = p.slice(-4).map(Number), name = p.slice(0, -4).join(',');
      if ([reach, impact, conf, eff].some((x) => !Number.isFinite(x)) || eff <= 0) throw new Error('Numbers required (effort > 0): ' + l);
      const c01 = conf > 1 ? conf / 100 : conf, c10 = conf <= 1 ? conf * 10 : conf > 10 ? conf / 10 : conf;
      return { name, reach, impact, conf: c01, eff, rice: reach * impact * c01 / eff, ice: impact * c10 * Math.max(0.1, 10 - Math.min(eff, 9.9)) };
    });
    if (!rows.length) throw new Error('Enter features');
    const key = o.m === 'ICE' ? 'ice' : 'rice';
    rows.sort((a, b) => b[key] - a[key]);
    if (o.m === 'MoSCoW') {
      const lab = (i) => { const q = i / rows.length; return q < 0.25 ? 'Must' : q < 0.5 ? 'Should' : q < 0.8 ? 'Could' : "Won't"; };
      return tbl(['#', 'Feature', 'RICE', 'MoSCoW'], rows.map((r, i) => [i + 1, r.name, r2(r.rice), lab(i)])) + '\n\nBuckets are assigned by RICE rank quartiles (25% Must, 25% Should, 30% Could, 20% Won\'t). Adjust by hand.';
    }
    return tbl(['#', 'Feature', o.m, 'Reach', 'Impact', 'Conf', 'Effort'], rows.map((r, i) => [i + 1, r.name, r2(r[key]), r.reach, r.impact, r2(r.conf * 100, 0) + '%', r.eff])) +
      (o.m === 'ICE' ? '\n\nICE = impact x confidence(0-10) x ease, ease = 10 - effort (floor 0.1). Use effort on a 1-9 scale for ICE.' : '\n\nRICE = reach x impact x confidence / effort.');
  },
};

const userFlow = {
  id: 'user-flow-to-mermaid-text', cat: PRD, title: 'User Flow to Mermaid Text',
  desc: 'Indented list to Mermaid flowchart source. Prefix "? " for decisions, "(label) " for edge labels.',
  labels: ['Indented steps (2 spaces or tab per level)'],
  sample: 'Landing page\n  Click sign up\n    ? Has account\n      (yes) Log in\n        Dashboard\n      (no) Create account\n        Verify email\n          Dashboard',
  run: ([t]) => {
    const out = ['flowchart TD'], stack = [], ids = {}; let n = 0;
    for (const raw of String(t).split(/\r?\n/)) {
      if (!raw.trim()) continue;
      const lvl = Math.floor(raw.match(/^[ \t]*/)[0].replace(/\t/g, '  ').length / 2);
      let s = raw.trim(), edge = '', dec = false, m;
      if ((m = /^\(([^)]*)\)\s*(.*)$/.exec(s))) { edge = m[1]; s = m[2]; }
      if (s.startsWith('? ')) { dec = true; s = s.slice(2); }
      const label = s.replace(/"/g, "'");
      const key = label.toLowerCase();
      const merge = ids[key] && !dec; // same label reused => same node (lets branches rejoin)
      const id = merge ? ids[key] : (ids[key] = 'n' + ++n);
      if (!merge || !out.some((l) => l.startsWith('  ' + id + '[') || l.startsWith('  ' + id + '{'))) out.push(dec ? `  ${id}{"${label}"}` : `  ${id}["${label}"]`);
      stack.length = lvl;
      const parent = stack[lvl - 1];
      if (lvl > 0 && !parent) throw new Error('Indentation jumps a level at: ' + raw.trim());
      if (parent) out.push(edge ? `  ${parent} -->|${edge.replace(/"/g, "'")}| ${id}` : `  ${parent} --> ${id}`);
      stack[lvl] = id;
    }
    if (n === 0) throw new Error('Enter at least one step');
    return out.join('\n');
  },
};

const PRE = ['Go', 'My', 'Get', 'Hey', 'Super', 'Pro', 'Smart', 'Easy', 'Quick', 'One', 'Open', 'True'], SUF = ['ly', 'ify', 'hub', 'kit', 'lab', 'base', 'flow', 'ish', 'wise', 'nest', 'loop', 'snap', 'ster', 'zen'];
const appNames = {
  id: 'app-name-ideas', cat: PRD, title: 'App Name Ideas',
  desc: 'Combine your keywords with prefixes, suffixes and blends. Names only; check trademarks and domains yourself.',
  labels: ['Keywords (one per line)'], sample: 'task\nplan\ntidy',
  opts: [num('count', 'How many', 40), num('seed', 'Shuffle seed', 1)],
  run: ([t], o) => {
    const ks = lines(t).map((x) => x.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
    if (!ks.length) throw new Error('Enter at least one keyword');
    const cap = (s) => s[0].toUpperCase() + s.slice(1), set = new Set();
    for (const k of ks) {
      PRE.forEach((p) => set.add(p + k)); SUF.forEach((s) => set.add(k.replace(/[aeiouy]$/, '') + s)); set.add(k + 'r'); set.add(k + 'o');
      for (const k2 of ks) if (k !== k2) { set.add(k + k2); set.add(k.slice(0, Math.max(2, Math.ceil(k.length / 2))) + k2.slice(Math.floor(k2.length / 2))); }
    }
    let s = (o.seed | 0) || 1; const arr = [...set].sort();
    for (let i = arr.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr.slice(0, Math.max(1, o.count | 0)).map(cap).join('\n');
  },
};

const startupCost = {
  id: 'startup-cost-calculator', cat: PRD, title: 'Startup Cost Calculator',
  desc: 'One-time and monthly costs with contingency and runway total. Lines: "item, amount, once|monthly".',
  labels: ['item, amount, once|monthly'], sample: 'Company registration, 300, once\nLaptop, 1500, once\nHosting, 25, monthly\nDesign tools, 40, monthly\nMarketing, 500, monthly',
  opts: [num('months', 'Runway months', 12), num('cont', 'Contingency %', 15)],
  run: ([t], o) => {
    need(o, 'months', 'cont');
    let once = 0, mon = 0;
    const rows = lines(t).map((l) => {
      const p = l.split(',').map((x) => x.trim()), a = parseFloat(String(p[1]).replace(/[^0-9.\-]/g, ''));
      if (p.length < 3 || !Number.isFinite(a) || !/^(once|one-time|monthly|month)$/i.test(p[2])) throw new Error('Use "item, amount, once|monthly": ' + l);
      const m = /^m/i.test(p[2]); if (m) mon += a; else once += a;
      return [p[0], r2(a), m ? 'monthly' : 'once'];
    });
    if (!rows.length) throw new Error('Enter cost lines');
    const base = once + mon * o.months, tot = base * (1 + o.cont / 100);
    return tbl(['Item', 'Amount', 'Type'], rows) + `\n\nOne-time total: ${r2(once)}\nMonthly burn: ${r2(mon)}\nCost over ${o.months} months: ${r2(base)}\nContingency (${o.cont}%): ${r2(base * o.cont / 100)}\nFunding needed: ${r2(tot)}`;
  },
};

const monetization = calc('monetization-calculator', PRD, 'App Monetization Calculator', 'Project ads, subscription and in-app purchase revenue over time.',
  [num('mau', 'Monthly active users', 50000), num('imp', 'Ad impressions per user / month', 30), num('ecpm', 'eCPM', 2), num('sub', 'Subscriber % of users', 2), num('price', 'Subscription price / month', 4.99),
    num('iap', 'IAP payer % of users', 3), num('arppu', 'IAP revenue per payer / month', 8), num('fee', 'Store fee % (subs + IAP)', 15), num('growth', 'User growth % / month', 5), num('months', 'Months', 12)],
  (o) => {
    need(o, 'mau', 'imp', 'ecpm', 'sub', 'price', 'iap', 'arppu', 'fee', 'growth', 'months');
    if (o.months < 1 || o.months > 120) throw new Error('Months 1-120');
    let u = o.mau, tot = 0; const rows = [];
    for (let m = 1; m <= o.months; m++) {
      const ads = u * o.imp * o.ecpm / 1000, subs = u * o.sub / 100 * o.price * (1 - o.fee / 100), iap = u * o.iap / 100 * o.arppu * (1 - o.fee / 100), s = ads + subs + iap;
      tot += s; rows.push([m, r2(u, 0), r2(ads, 0), r2(subs, 0), r2(iap, 0), r2(s, 0)]); u *= 1 + o.growth / 100;
    }
    return tbl(['Month', 'Users', 'Ads', 'Subs', 'IAP', 'Net'], rows) + `\n\nTotal net revenue: ${r2(tot, 0)}\nAverage per month: ${r2(tot / o.months, 0)}\nSimple model: no churn cohorts, no ad fill-rate, constant ratios.`;
  });

const CONN = { 'slow-3g': [0.4, 400], 'slow-4g': [1.6, 150], '4g': [9, 70], wifi: [30, 20] };
const perfBudget = calc('app-performance-budget-calculator', PRD, 'Performance Budget Calculator', 'Page-weight budget from connection speed and a target load time.',
  [sel('conn', 'Connection', Object.keys(CONN), 'slow-4g'), num('target', 'Target load time (s)', 5), num('rt', 'Round trips before first byte (DNS+TCP+TLS+request)', 4)],
  (o) => {
    need(o, 'target', 'rt');
    const [mbps, rtt] = CONN[o.conn], usable = o.target - o.rt * rtt / 1000;
    if (usable <= 0) throw new Error('Target time is eaten by latency alone; raise the target or cut round trips');
    const kb = usable * mbps * 1e6 / 8 / 1024, sp = [['JavaScript', 0.35], ['Images', 0.35], ['CSS', 0.1], ['Fonts', 0.1], ['HTML / other', 0.1]];
    return `${o.conn}: ${mbps} Mbps, ${rtt} ms RTT\nTime left for transfer: ${usable.toFixed(2)} s\nTotal transfer budget (compressed): ${r2(kb, 0)} KB\n\nSuggested split:\n` + sp.map(([n, p]) => `  ${n.padEnd(13)} ${r2(kb * p, 0)} KB`).join('\n') +
      `\n\nJS is parsed after download: ${r2(kb * 0.35, 0)} KB compressed is roughly ${r2(kb * 0.35 * 3.5, 0)} KB of source. Ideal-case maths; real throughput is lower.`;
  });

const decision = {
  id: 'decision-matrix', cat: PRD, title: 'Weighted Decision Matrix',
  desc: 'Criteria with weights (input 1) and option scores (input 2), ranked by weighted total.',
  inputs: 2, labels: ['Criteria: name, weight', 'Options: name, score per criterion (same order)'],
  sample: 'Price, 5\nQuality, 4\nSpeed, 3', sample2: 'Option A, 7, 8, 5\nOption B, 9, 6, 6\nOption C, 5, 9, 9',
  run: ([c, s]) => {
    const cr = lines(c).map((l) => { const p = l.split(','); const w = parseFloat(p.pop()); if (!Number.isFinite(w)) throw new Error('Criterion needs a numeric weight: ' + l); return [p.join(',').trim(), w]; });
    if (!cr.length) throw new Error('Enter criteria');
    const tw = cr.reduce((a, b) => a + b[1], 0) || 1;
    const rows = lines(s).map((l) => {
      const p = l.split(',').map((x) => x.trim()), sc = p.slice(1).map(Number);
      if (sc.length !== cr.length || sc.some((x) => !Number.isFinite(x))) throw new Error(`Expected ${cr.length} scores for: ${l}`);
      return [p[0], sc.reduce((a, v, i) => a + v * cr[i][1], 0) / tw, sc];
    }).sort((a, b) => b[1] - a[1]);
    if (!rows.length) throw new Error('Enter options');
    return tbl(['Rank', 'Option', 'Weighted', ...cr.map((x) => `${x[0]} (x${x[1]})`)], rows.map((r, i) => [i + 1, r[0], r2(r[1]), ...r[2]]));
  },
};

// ---------- render tools ----------
const listenKeys = (root, fn) => { const f = (e) => { if (!root.isConnected) return document.removeEventListener('keydown', f); fn(e); }; document.addEventListener('keydown', f); };

function checklistTool(id, title, desc, groups) {
  return { id, cat: PRD, title, desc, custom: true, render(el) {
    const st = store.get(id, {}), prog = h('p', { style: 'font-weight:600' });
    const upd = () => { const all = groups.flatMap((g) => g[1]), d = all.filter((x) => st[x]).length; prog.textContent = `${d}/${all.length} done (${Math.round(d / all.length * 100)}%)`; };
    el.append(prog, ...groups.map(([g, items]) => h('div', {}, h('h3', {}, g), ...items.map((it) => h('label', { style: 'display:block;margin:4px 0' }, h('input', { type: 'checkbox', checked: !!st[it], onchange: (e) => { st[it] = e.target.checked; store.set(id, st); upd(); } }), ' ' + it)))),
      btn('Reset', () => { for (const k in st) delete st[k]; store.set(id, st); el.replaceChildren(); this.render(el); }),
      btn('Copy as Markdown', () => navigator.clipboard?.writeText(groups.map(([g, items]) => `## ${g}\n` + items.map((x) => `- [${st[x] ? 'x' : ' '}] ${x}`).join('\n')).join('\n\n'))));
    upd();
  } };
}
const launchList = checklistTool('app-launch-checklist', 'App Launch Checklist', 'Tick off pre-launch tasks; progress is saved in this browser.', [
  ['Product', ['Core flows tested on real devices', 'Crash reporting enabled', 'Onboarding reviewed', 'Accessibility pass (contrast, labels, focus)', 'Performance budget met']],
  ['Store listing', ['Name, subtitle and keywords final', 'Screenshots for all required sizes', 'Description and release notes written', 'Privacy policy URL live', 'Age rating and data-safety forms completed', 'Support URL / email set']],
  ['Legal & privacy', ['Terms of service published', 'Consent flows checked (GDPR/ePrivacy)', 'Third-party licences reviewed']],
  ['Growth', ['Landing page and waitlist ready', 'Analytics events verified', 'Press kit and launch post drafted', 'Support inbox staffed', 'Rollback / hotfix plan agreed']],
]);

const compMatrix = { id: 'competitor-comparison-matrix', cat: PRD, title: 'Competitor Comparison Matrix', desc: 'Edit a feature table, then copy it as Markdown or CSV.', custom: true, render(el) {
  const s = store.get('matrix', null) || { cols: ['Us', 'Competitor A', 'Competitor B'], rows: [['Price', '', '', ''], ['Free plan', '', '', ''], ['Key feature', '', '', '']] };
  const host = h('div', { style: 'overflow:auto' }), md = h('textarea', { rows: 8, readOnly: true, style: 'width:100%' }), csv = h('textarea', { rows: 6, readOnly: true, style: 'width:100%' });
  const out = () => {
    const head = ['Feature', ...s.cols];
    md.value = `| ${head.map(mdCell).join(' | ')} |\n|${head.map(() => '---').join('|')}|\n` + s.rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`).join('\n');
    csv.value = [head, ...s.rows].map((r) => r.map(csvCell).join(',')).join('\n'); store.set('matrix', s);
  };
  const cell = (v, set, name = '') => h('input', { value: v, 'aria-label': name, style: 'width:130px', oninput: (e) => { set(e.target.value); out(); } });
  const draw = () => {
    host.replaceChildren(h('table', {}, h('tr', {}, h('th', {}, 'Feature'), ...s.cols.map((c, i) => h('th', {}, cell(c, (v) => { s.cols[i] = v; }, `Column ${i + 1} name`)))),
      ...s.rows.map((r, ri) => h('tr', {}, ...r.map((v, i) => h('td', {}, cell(v, (x) => { r[i] = x; }, i ? `Row ${ri + 1}, ${s.cols[i - 1] || 'column ' + i}` : `Row ${ri + 1} feature name`)))))));
    out();
  };
  el.append(host, btn('+ Row', () => { s.rows.push(['', ...s.cols.map(() => '')]); draw(); }), btn('+ Competitor', () => { s.cols.push(''); s.rows.forEach((r) => r.push('')); draw(); }),
    btn('- Row', () => { if (s.rows.length > 1) { s.rows.pop(); draw(); } }), btn('- Column', () => { if (s.cols.length > 1) { s.cols.pop(); s.rows.forEach((r) => r.pop()); draw(); } }),
    h('label', {}, 'Markdown'), md, h('label', {}, 'CSV'), csv);
  draw();
} };

// ---------- Games ----------
// tile colour + a text colour (black/white) with >= 4.5:1 contrast on it
const tile = (v) => `hsl(${40 - Math.log2(v) * 3},${60 + Math.log2(v) * 3}%,${88 - Math.log2(v) * 5}%)`;
const tileFg = (v) => {
  const hh = 40 - Math.log2(v) * 3, ss = (60 + Math.log2(v) * 3) / 100, ll = (88 - Math.log2(v) * 5) / 100, a = ss * Math.min(ll, 1 - ll);
  const f = (n) => { const k = (n + hh / 30) % 12, c = ll - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4) > 0.179 ? '#000' : '#fff';
};
const game2048 = { id: 'game-2048', cat: GAM, title: '2048', desc: 'Slide and merge tiles. Arrow keys, swipe or buttons. Best score is saved locally.', custom: true, render(el) {
  let g, score = 0, best = store.get('2048-best', 0), over = false;
  const info = h('p', { style: 'font-weight:600', role: 'status' }), board = h('div', { role: 'img', style: 'display:grid;grid-template-columns:repeat(4,70px);gap:6px;touch-action:none;width:max-content;padding:6px;background:#bbada0;border-radius:6px' });
  const add = () => { const e = []; g.forEach((r, i) => r.forEach((v, j) => !v && e.push([i, j]))); if (e.length) { const [i, j] = e[Math.floor(Math.random() * e.length)]; g[i][j] = Math.random() < 0.9 ? 2 : 4; } };
  const draw = () => {
    info.textContent = `Score ${score}   Best ${best}${over ? '   GAME OVER' : ''}`;
    board.setAttribute('aria-label', 'Board, row by row: ' + g.map((r) => r.map((v) => v || 'empty').join(', ')).join('; '));
    board.replaceChildren(...g.flat().map((v) => h('div', { style: `outline:1px solid transparent;height:70px;display:flex;align-items:center;justify-content:center;font:bold ${v > 512 ? 20 : 26}px system-ui;border-radius:4px;background:${v ? tile(v) : '#cdc1b4'};color:${v ? tileFg(v) : '#333'}` }, v || '')));
  };
  const reset = () => { g = Array.from({ length: 4 }, () => Array(4).fill(0)); score = 0; over = false; add(); add(); draw(); };
  const move = (d) => {
    if (over) return; let changed = false;
    for (let a = 0; a < 4; a++) {
      const co = [0, 1, 2, 3].map((b) => (d === 'left' ? [a, b] : d === 'right' ? [a, 3 - b] : d === 'up' ? [b, a] : [3 - b, a]));
      const v = co.map(([i, j]) => g[i][j]).filter(Boolean), res = [];
      for (let k = 0; k < v.length; k++) { if (v[k] === v[k + 1]) { res.push(v[k] * 2); score += v[k] * 2; k++; } else res.push(v[k]); }
      while (res.length < 4) res.push(0);
      co.forEach(([i, j], k) => { if (g[i][j] !== res[k]) changed = true; g[i][j] = res[k]; });
    }
    if (!changed) return;
    add(); if (score > best) { best = score; store.set('2048-best', best); }
    over = !g.flat().includes(0) && !g.some((r, i) => r.some((v, j) => v === r[j + 1] || v === (g[i + 1] || [])[j]));
    draw();
  };
  const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  listenKeys(el, (e) => { if (keys[e.key] && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); move(keys[e.key]); } });
  let sx, sy; board.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  board.addEventListener('touchend', (e) => { const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); });
  el.append(info, board, h('div', { style: 'margin-top:8px' }, ...[['Left', 'left'], ['Up', 'up'], ['Down', 'down'], ['Right', 'right']].map(([l, d]) => btn(l, () => move(d))), btn('New game', reset)));
  reset();
} };

const memory = { id: 'memory-match', cat: GAM, title: 'Memory Match', desc: 'Flip cards and find all pairs in the fewest moves. Best score saved locally.', custom: true, render(el) {
  const E = ['🍎', '🚀', '🎲', '🐱', '🌵', '🎧', '🔑', '🌙'];
  let cards, open, moves, found, lock, best = store.get('memory-best', null);
  const info = h('p', { style: 'font-weight:600', role: 'status' }), grid = h('div', { role: 'group', 'aria-label': 'Cards', style: 'display:grid;grid-template-columns:repeat(4,64px);gap:8px;width:max-content' });
  const draw = () => {
    info.textContent = `Moves ${moves}   Best ${best ?? '-'}${found === 8 ? '   Done!' : ''}`;
    grid.replaceChildren(...cards.map((c, i) => h('button', { 'aria-label': `Card ${i + 1}: ${c.up || c.done ? c.e + (c.done ? ' (matched)' : '') : 'face down'}`, style: 'height:64px;font-size:28px;padding:0', disabled: c.done, onclick: () => flip(i) }, c.up || c.done ? c.e : '?')));
  };
  const flip = (i) => {
    if (lock || cards[i].up || cards[i].done) return;
    cards[i].up = true; open.push(i);
    if (open.length === 2) {
      moves++; const [a, b] = open;
      if (cards[a].e === cards[b].e) { cards[a].done = cards[b].done = true; found++; open = []; if (found === 8 && (best == null || moves < best)) { best = moves; store.set('memory-best', best); } }
      else { lock = true; setTimeout(() => { cards[a].up = cards[b].up = false; open = []; lock = false; draw(); }, 700); }
    }
    draw();
  };
  const reset = () => {
    cards = [...E, ...E].map((e) => ({ e, r: Math.random() })).sort((a, b) => a.r - b.r); open = []; moves = 0; found = 0; lock = false; draw();
  };
  el.append(info, grid, btn('New game', reset)); reset();
} };

const mines = { id: 'minesweeper', cat: GAM, title: 'Minesweeper', desc: '9x9 board with 10 mines. Right-click or use flag mode to flag. Best time saved locally.', custom: true, render(el) {
  const N = 9, M = 10; let c, state, started, flagMode = false, t0, timer, secs = 0, best = store.get('mines-best', null);
  const info = h('p', { style: 'font-weight:600' }), grid = h('div', { role: 'group', 'aria-label': 'Minefield', style: `display:grid;grid-template-columns:repeat(${N},30px);gap:2px;width:max-content` }), result = h('p', { role: 'status', style: 'font-weight:600' });
  const nb = (i) => { const r = Math.floor(i / N), q = i % N, o = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const y = r + a, x = q + b; if ((a || b) && y >= 0 && y < N && x >= 0 && x < N) o.push(y * N + x); } return o; };
  const head = () => { info.textContent = `Mines left ${M - c.filter((x) => x.f).length}   Time ${secs}s   Best ${best ?? '-'}${state === 'won' ? '   YOU WIN' : state === 'lost' ? '   BOOM' : ''}`; };
  const draw = () => {
    head();
    result.textContent = state === 'won' ? 'You win.' : state === 'lost' ? 'Boom, you hit a mine.' : '';
    const cellName = (x, i) => `Row ${Math.floor(i / N) + 1}, column ${(i % N) + 1}: ` + (x.o ? (x.m ? 'mine' : x.n ? `${x.n} adjacent mine${x.n > 1 ? 's' : ''}` : 'empty') : x.f ? 'flagged' : state === 'lost' && x.m ? 'mine' : 'unopened');
    grid.replaceChildren(...c.map((x, i) => h('button', { 'aria-label': cellName(x, i), style: `width:30px;height:30px;padding:0;font-weight:bold;${x.o ? 'background:#ddd;color:#000' : ''}`, oncontextmenu: (e) => { e.preventDefault(); flag(i); }, onclick: () => (flagMode ? flag(i) : open(i)) },
      x.o ? (x.m ? '💣' : x.n || '') : x.f ? '🚩' : (state === 'lost' && x.m ? '💣' : ''))));
  };
  const flag = (i) => { if (state !== 'play' || c[i].o) return; c[i].f = !c[i].f; draw(); };
  const open = (i) => {
    if (state === 'won' || state === 'lost' || c[i].f || c[i].o) return;
    if (!started) {
      started = true; state = 'play'; t0 = Date.now(); timer = setInterval(() => { if (!el.isConnected) return clearInterval(timer); secs = Math.floor((Date.now() - t0) / 1000); head(); }, 1000);
      const ids = [...c.keys()].filter((k) => k !== i && !nb(i).includes(k)).map((k) => [k, Math.random()]).sort((a, b) => a[1] - b[1]).slice(0, M);
      ids.forEach(([k]) => { c[k].m = true; }); c.forEach((x, k) => { x.n = nb(k).filter((j) => c[j].m).length; });
    }
    const q = [i];
    while (q.length) { const k = q.pop(); if (c[k].o || c[k].f) continue; c[k].o = true; if (c[k].m) { state = 'lost'; break; } if (!c[k].n) q.push(...nb(k)); }
    if (state === 'lost') clearInterval(timer);
    else if (c.filter((x) => x.o).length === N * N - M) { state = 'won'; clearInterval(timer); secs = Math.floor((Date.now() - t0) / 1000); if (best == null || secs < best) { best = secs; store.set('mines-best', best); } }
    draw();
  };
  const reset = () => { clearInterval(timer); c = Array.from({ length: N * N }, () => ({ m: false, o: false, f: false, n: 0 })); state = 'ready'; started = false; secs = 0; draw(); };
  el.append(info, result, grid, h('label', {}, h('input', { type: 'checkbox', onchange: (e) => { flagMode = e.target.checked; } }), ' Flag mode (tap or press Enter on a cell to flag instead of open)  '), btn('New game', reset)); reset();
} };

// ---------- Learning ----------
const INTERVALS = [0, 1, 2, 4, 8, 16];
const flashcards = { id: 'flashcards-spaced-repetition', cat: LRN, title: 'Flashcards (Leitner)', desc: 'Leitner boxes with 1/2/4/8/16-day intervals. Cards stay in this browser.', custom: true, render(el) {
  let cards = store.get('cards', []), shown = false;
  const save = () => store.set('cards', cards), area = h('textarea', { rows: 4, style: 'width:100%', placeholder: 'front | back (one per line)', 'aria-label': 'Add cards, one per line as front | back' }), study = h('div', { 'aria-live': 'polite' }), stats = h('p');
  const draw = () => {
    const due = cards.filter((c) => c.due <= day()).sort((a, b) => a.box - b.box || a.due - b.due), c = due[0];
    stats.textContent = `${cards.length} cards | due now: ${due.length} | boxes: ` + [1, 2, 3, 4, 5].map((b) => `${b}:${cards.filter((x) => x.box === b).length}`).join(' ');
    if (!c) { study.replaceChildren(h('p', {}, cards.length ? 'Nothing due. Come back later.' : 'Add some cards above.')); return; }
    const ans = (ok) => { c.box = ok ? Math.min(5, c.box + 1) : 1; c.due = day() + INTERVALS[c.box]; shown = false; save(); draw(); };
    study.replaceChildren(h('div', { style: 'border:1px solid;border-radius:6px;padding:16px;margin:8px 0;font-size:18px' }, h('small', {}, `Box ${c.box}`), h('div', {}, c.f), shown ? h('hr') : null, shown ? h('div', {}, c.b) : null),
      shown ? h('div', {}, btn('I knew it', () => ans(true)), btn('Missed it', () => ans(false))) : btn('Show answer', () => { shown = true; draw(); }));
  };
  el.append(h('label', {}, 'Add cards'), area, btn('Add', () => { for (const l of lines(area.value)) { const [f, ...b] = l.split('|'); if (f.trim() && b.length) cards.push({ f: f.trim(), b: b.join('|').trim(), box: 1, due: day() }); } area.value = ''; save(); draw(); }),
    btn('Delete all', () => { if (confirm('Delete all cards?')) { cards = []; save(); draw(); } }), stats, study);
  draw();
} };

const kanban = { id: 'kanban-board', cat: LRN, title: 'Kanban Board', desc: 'Three-column board saved in this browser.', custom: true, render(el) {
  const s = store.get('kanban', null) || { cols: [['To do', []], ['Doing', []], ['Done', []]] }, board = h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start' });
  const draw = () => {
    store.set('kanban', s);
    board.replaceChildren(...s.cols.map(([name, items], ci) => {
      const inp = h('input', { placeholder: 'New card', 'aria-label': `New card in ${name}`, style: 'width:150px' });
      const add = () => { if (inp.value.trim()) { items.push(inp.value.trim()); draw(); } };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      return h('div', { style: 'min-width:200px;border:1px solid;border-radius:6px;padding:8px' }, h('h3', {}, `${name} (${items.length})`),
        ...items.map((t, i) => h('div', { style: 'border:1px solid;border-radius:4px;padding:6px;margin:6px 0' }, h('div', {}, t),
          ci ? btn('<', () => { s.cols[ci - 1][1].push(...items.splice(i, 1)); draw(); }, '', `Move "${t}" to ${s.cols[ci - 1][0]}`) : null, ci < s.cols.length - 1 ? btn('>', () => { s.cols[ci + 1][1].push(...items.splice(i, 1)); draw(); }, '', `Move "${t}" to ${s.cols[ci + 1][0]}`) : null, btn('x', () => { items.splice(i, 1); draw(); }, '', `Delete "${t}"`))),
        inp, btn('Add', add, '', `Add card to ${name}`));
    }));
  };
  el.append(board); draw();
} };

const mindMap = { id: 'mind-map-maker', cat: LRN, title: 'Mind Map Maker', desc: 'Edit a tree of ideas and export it as a Markdown outline.', custom: true, render(el) {
  const root = store.get('mindmap', null) || { t: 'Central idea', c: [{ t: 'Branch 1', c: [] }, { t: 'Branch 2', c: [] }] };
  const host = h('div'), out = h('textarea', { rows: 10, readOnly: true, style: 'width:100%' });
  const md = (n, d = 0) => (d ? '  '.repeat(d - 1) + '- ' : '# ') + n.t + '\n' + n.c.map((k) => md(k, d + 1)).join('');
  const sync = () => { out.value = md(root).trim(); store.set('mindmap', root); };
  const node = (n, par) => h('div', { style: 'margin-left:18px;border-left:2px solid #8885;padding-left:8px' }, h('div', {}, h('input', { value: n.t, 'aria-label': par ? `Idea under "${par.t}"` : 'Central idea', style: 'width:200px', oninput: (e) => { n.t = e.target.value; sync(); } }),
    btn('+ child', () => { n.c.push({ t: 'New idea', c: [] }); draw(); }, '', `Add child to "${n.t}"`), par ? btn('delete', () => { par.c.splice(par.c.indexOf(n), 1); draw(); }, '', `Delete "${n.t}" and its children`) : null), ...n.c.map((k) => node(k, n)));
  const draw = () => { host.replaceChildren(node(root, null)); sync(); };
  el.append(host, h('label', {}, 'Markdown outline'), out, btn('Copy', () => navigator.clipboard?.writeText(out.value))); draw();
} };

// ---------- Dev extras ----------
const cssSel = {
  id: 'css-selector-tester', cat: DEV, title: 'CSS Selector Tester', desc: 'Paste HTML and a selector to see what matches.', dom: true,
  inputs: 2, labels: ['HTML', 'CSS selector'], sample: '<ul id="nav"><li class="item active"><a href="/">Home</a></li><li class="item"><a href="/about">About</a></li></ul>', sample2: 'li.item > a',
  run: ([html, sel2]) => {
    if (!sel2.trim()) throw new Error('Enter a selector');
    const doc = new DOMParser().parseFromString(html, 'text/html'); let m;
    try { m = [...doc.querySelectorAll(sel2.trim())]; } catch { throw new Error('Invalid selector'); }
    return `${m.length} match${m.length === 1 ? '' : 'es'}\n\n` + m.slice(0, 200).map((e, i) => `#${i + 1} <${e.localName}> ${e.outerHTML.length > 200 ? e.outerHTML.slice(0, 200) + '...' : e.outerHTML}`).join('\n');
  },
};

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–' };
const stripTags = {
  id: 'html-tag-stripper', cat: DEV, title: 'HTML Tag Stripper', desc: 'Remove tags, scripts, styles and comments; decode entities.',
  sample: '<h1>Hello &amp; welcome</h1><script>alert(1)</script><p>First <b>bold</b> paragraph.</p><!-- note --><p>Second&nbsp;one</p>',
  opts: [chk('br', 'Keep line breaks for block tags', true), chk('ent', 'Decode entities', true)],
  run: ([t], o) => {
    let s = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');
    if (o.br) s = s.replace(/<\s*(br|\/(p|div|li|h[1-6]|tr|ul|ol|table|section|article))\b[^>]*>/gi, '\n');
    s = s.replace(/<[^>]*>/g, '');
    if (o.ent) s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m));
    return s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter((l, i, a) => l || (i && a[i - 1])).join('\n').trim();
  },
};

const basicAuth = {
  id: 'http-basic-auth-generator', cat: DEV, title: 'HTTP Basic Auth Header Generator', desc: 'Encode user:password into an Authorization header and snippets.',
  inputs: 2, labels: ['Username', 'Password'], sample: 'alice', sample2: 's3cret:pass',
  run: ([u, p]) => {
    if (!u) throw new Error('Enter a username');
    if (u.includes(':')) throw new Error('Username must not contain ":"');
    const b = btoa(String.fromCharCode(...new TextEncoder().encode(`${u}:${p}`)));
    return `Authorization: Basic ${b}\n\ncurl -H "Authorization: Basic ${b}" https://example.com/\n\nfetch(url, { headers: { Authorization: 'Basic ${b}' } })\n\nBase64 is encoding, not encryption: only use Basic auth over HTTPS.`;
  },
};

const jsonl = {
  id: 'json-lines-tools', cat: DEV, title: 'JSON Lines <-> JSON Array', desc: 'Convert JSONL/NDJSON to a JSON array and back.',
  sample: '{"id":1,"name":"a"}\n{"id":2,"name":"b"}', opts: [sel('dir', 'Direction', ['JSONL to array', 'array to JSONL']), num('indent', 'Indent', 2)],
  run: ([t], o) => {
    if (o.dir === 'JSONL to array') return JSON.stringify(lines(t).map((l, i) => { try { return JSON.parse(l); } catch { throw new Error(`Invalid JSON on line ${i + 1}`); } }), null, o.indent);
    let a; try { a = JSON.parse(t); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
    if (!Array.isArray(a)) throw new Error('Input must be a JSON array');
    return a.map((x) => JSON.stringify(x)).join('\n');
  },
};

const caseDetect = {
  id: 'string-case-detector', cat: DEV, title: 'String Case Detector', desc: 'Detect camelCase, PascalCase, snake_case, kebab-case and more per line.',
  sample: 'userName\nUserName\nuser_name\nUSER_NAME\nuser-name\nUser-Name\nuser.name\nUser Name\nUser name\nuser name\nUSERNAME', labels: ['Strings (one per line)'],
  run: ([t]) => {
    const R = [['camelCase', /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/], ['PascalCase', /^([A-Z][a-z0-9]+){2,}$/], ['snake_case', /^[a-z0-9]+(_[a-z0-9]+)+$/], ['SCREAMING_SNAKE_CASE', /^[A-Z0-9]+(_[A-Z0-9]+)+$/],
      ['kebab-case', /^[a-z0-9]+(-[a-z0-9]+)+$/], ['Train-Case', /^[A-Z][a-z0-9]*(-[A-Z][a-z0-9]*)+$/], ['COBOL-CASE', /^[A-Z0-9]+(-[A-Z0-9]+)+$/], ['dot.case', /^[a-z0-9]+(\.[a-z0-9]+)+$/],
      ['Title Case', /^[A-Z][a-z0-9]*( [A-Z][a-z0-9]*)+$/], ['Sentence case', /^[A-Z][a-z0-9]*( [a-z0-9]+)+$/], ['lower case (words)', /^[a-z0-9]+( [a-z0-9]+)+$/], ['UPPER CASE (words)', /^[A-Z0-9]+( [A-Z0-9]+)+$/],
      ['lowercase', /^[a-z0-9]+$/], ['UPPERCASE', /^[A-Z0-9]+$/], ['Capitalized', /^[A-Z][a-z0-9]+$/]];
    const ls = lines(t);
    if (!ls.length) throw new Error('Enter strings');
    return tbl(['String', 'Case'], ls.map((l) => [l, (R.find(([, re]) => re.test(l)) || ['mixed / unknown'])[0]]));
  },
};

// ---- semver ----
const SV = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const svParse = (s) => { const m = SV.exec(String(s).trim()); if (!m) throw new Error('Not a valid semver: ' + s); return { M: +m[1], m: +m[2], p: +m[3], pre: m[4] ? m[4].split('.') : [] }; };
const svStr = (v) => `${v.M}.${v.m}.${v.p}${v.pre.length ? '-' + v.pre.join('.') : ''}`;
const svCmp = (a, b) => {
  for (const k of ['M', 'm', 'p']) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === undefined) return -1; if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) { if (+x !== +y) return +x < +y ? -1 : 1; } else if (nx !== ny) return nx ? -1 : 1; else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};
const svBump = (v, kind) => {
  const c = { ...v, pre: [...v.pre] };
  switch (kind) {
    case 'major': return v.pre.length && !v.m && !v.p ? { ...c, pre: [] } : { M: v.M + 1, m: 0, p: 0, pre: [] };
    case 'minor': return v.pre.length && !v.p ? { ...c, pre: [] } : { M: v.M, m: v.m + 1, p: 0, pre: [] };
    case 'patch': return v.pre.length ? { ...c, pre: [] } : { ...c, p: v.p + 1 };
    case 'premajor': return { M: v.M + 1, m: 0, p: 0, pre: ['0'] };
    case 'preminor': return { M: v.M, m: v.m + 1, p: 0, pre: ['0'] };
    case 'prepatch': return { M: v.M, m: v.m, p: v.p + 1, pre: ['0'] };
    case 'prerelease': {
      if (!v.pre.length) return { ...c, p: v.p + 1, pre: ['0'] };
      const i = c.pre.findLastIndex((x) => /^\d+$/.test(x));
      if (i < 0) c.pre.push('0'); else c.pre[i] = String(+c.pre[i] + 1);
      return c;
    }
    default: return v;
  }
};
const svRange = (str) => {
  const part = (s) => { // partial version -> [M,m,p,pre] with null for wildcards
    const m = /^v?([0-9xX*]+)(?:\.([0-9xX*]+))?(?:\.([0-9xX*]+))?(?:-([0-9A-Za-z.-]+))?$/.exec(s); if (!m) throw new Error('Bad range part: ' + s);
    const n = (x) => (x == null || /^[xX*]$/.test(x) ? null : +x), a = [n(m[1]), n(m[2]), n(m[3])];
    for (let i = 1; i < 3; i++) if (a[i - 1] == null) a[i] = null;
    return [...a, m[4] ? m[4].split('.') : []];
  };
  const V = (M, m, p, pre = []) => ({ M, m, p, pre });
  const cmpr = (op, v) => ({ op, v });
  const desugar = (op, s) => {
    const [M, m, p, pre] = part(s), lo = V(M ?? 0, m ?? 0, p ?? 0, pre), full = p != null;
    if (M == null) return op === '<' || op === '>' ? [cmpr('<', V(0, 0, 0, ['0']))] : [cmpr('>=', V(0, 0, 0))];
    const nextAfter = m == null ? V(M + 1, 0, 0) : V(M, m + 1, 0);
    switch (op) {
      case '^': return [cmpr('>=', lo), cmpr('<', M > 0 || m == null ? V(M + 1, 0, 0) : m > 0 || p == null ? V(0, m + 1, 0) : V(0, 0, p + 1))];
      case '~': case '~>': return [cmpr('>=', lo), cmpr('<', m == null ? V(M + 1, 0, 0) : V(M, m + 1, 0))];
      case '>=': return [cmpr('>=', lo)];
      case '>': return full ? [cmpr('>', lo)] : [cmpr('>=', nextAfter)];
      case '<': return [cmpr('<', lo)];
      case '<=': return full ? [cmpr('<=', lo)] : [cmpr('<', nextAfter)];
      default: return full ? [cmpr('=', lo)] : [cmpr('>=', lo), cmpr('<', nextAfter)];
    }
  };
  const sets = String(str).split('||').map((seg) => {
    let s = seg.trim().replace(/\s+-\s+/g, ' @H ').replace(/(\^|~>?|>=|<=|>|<|=)\s+/g, '$1');
    const toks = s.split(/\s+/).filter(Boolean), out = [];
    for (let i = 0; i < toks.length; i++) {
      if (toks[i + 1] === '@H') { out.push(...desugar('>=', toks[i]), ...desugar('<=', toks[i + 2])); i += 2; continue; }
      const m = /^(\^|~>?|>=|<=|>|<|=)?(.*)$/.exec(toks[i]); out.push(...desugar(m[1] || '', m[2] || '*'));
    }
    return out.length ? out : desugar('', '*');
  });
  return (v) => sets.some((set) => set.every((c) => { const r = svCmp(v, c.v); return { '>=': r >= 0, '>': r > 0, '<': r < 0, '<=': r <= 0, '=': r === 0 }[c.op]; }) &&
    (!v.pre.length || set.some((c) => c.v.pre.length && c.v.M === v.M && c.v.m === v.m && c.v.p === v.p)));
};
const semver = calc('semver-calculator', DEV, 'Semver Calculator', 'Compare versions, bump them, and test npm-style ranges (^ ~ >= < x-ranges, hyphen, ||).',
  [txt('a', 'Version A', '1.2.3'), txt('b', 'Version B', '1.10.0-beta.2'), sel('bump', 'Bump A', ['major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease'], 'minor'), txt('range', 'Range', '^1.2.0 || >=3.0.0 <3.5')],
  (o) => {
    const a = svParse(o.a), b = svParse(o.b), c = svCmp(a, b), out = [`${svStr(a)} ${['<', '=', '>'][c + 1]} ${svStr(b)}  (${c < 0 ? 'A is older' : c > 0 ? 'A is newer' : 'equal'})`, `Bump ${o.bump}: ${svStr(a)} -> ${svStr(svBump(a, o.bump))}`];
    if (o.range.trim()) { const f = svRange(o.range); out.push(`Range "${o.range.trim()}":`, `  ${svStr(a)} satisfies: ${f(a)}`, `  ${svStr(b)} satisfies: ${f(b)}`); }
    return out.join('\n');
  });
export const _semver = { svParse, svCmp, svRange, svBump }; // exposed for tests; ignored by the app

export default [
  disavow, adCopy, anchorDist, kwClusterer, intentTool, headlineTool, operators, topicCluster, utmBulk,
  roas, abTest, funnel, retention, calendar, pressRelease,
  launchList, compMatrix, swot, persona, rice, userFlow, appNames, startupCost, monetization, perfBudget, appStore, decision,
  game2048, memory, mines, flashcards, kanban, mindMap,
  cssSel, stripTags, basicAuth, jsonl, caseDetect, semver,
];

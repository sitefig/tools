// Tools from free-browser-tools.md, batch 07 (server log SEO analysis, encoders, code formatters). See TOOLS.md for the contract.
// Skipped on purpose (need network or an account): live reverse/forward DNS lookups, Search Console API (paste-in versions are built).
// Honest limits: log tools trust the user-agent text, which anyone can fake. Formatters are hand-written re-indenters, not the
// official formatters (no WASM or third-party code is allowed here), and say so on their pages.
const T = [];
const SEO = 'SEO – Technical', ENC = 'Encoding', FMT = 'Formatters';
const lines = (t) => String(t ?? '').split(/\r\n|\r|\n/);
const need = (t, n = 'input') => { if (!String(t ?? '').trim()) throw new Error(`Paste ${n} first.`); return String(t); };
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const num = (id, label, def) => ({ id, label, type: 'number', def });
const chk = (id, label, def) => ({ id, label, type: 'checkbox', def });
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const tool = (o) => T.push(o);
const tbl = (head, rows) => {
  const all = [head, ...rows.map((r) => r.map(String))], w = head.map((_, i) => Math.max(...all.map((r) => String(r[i]).length)));
  const right = head.map((_, i) => i > 0 && all.slice(1).every((r) => /^[\d.,%+\- ]*$/.test(r[i])));
  return all.map((r) => r.map((c, i) => (right[i] ? String(c).padStart(w[i]) : String(c).padEnd(w[i]))).join('  ').trimEnd()).join('\n');
};
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '0%');
const countBy = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); m.set(k, (m.get(k) || 0) + 1); } return m; };
const topN = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const quant = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };

// ---------- access log core (Apache / nginx combined format) ----------
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const LOGRE = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d{3})\s+(\S+)(?:\s+"([^"]*)"\s+"([^"]*)")?(.*)$/;
const RT_DIV = { seconds: 1, milliseconds: 1000, microseconds: 1e6 };
function parseLine(raw, unit) {
  const m = LOGRE.exec(raw.trim()); if (!m) return null;
  const rq = m[3].split(' '); if (rq.length < 2) return null;
  let u = rq[1].replace(/#.*/, '').replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?]*/i, ''); if (!u.startsWith('/')) u = '/' + u;
  const qi = u.indexOf('?'), path = qi < 0 ? u : u.slice(0, qi), query = qi < 0 ? '' : u.slice(qi + 1);
  let ts = null, day = '';
  const tm = /^(\d+)\/(\w{3})\/(\d{4}):(\d\d):(\d\d):(\d\d)(?: ([+-])(\d\d)(\d\d))?/.exec(m[2]);
  if (tm && tm[2] in MON) {
    ts = Date.UTC(+tm[3], MON[tm[2]], +tm[1], +tm[4], +tm[5], +tm[6]);
    if (tm[7]) ts -= (tm[7] === '-' ? -1 : 1) * (+tm[8] * 60 + +tm[9]) * 60000;
    day = `${tm[3]}-${String(MON[tm[2]] + 1).padStart(2, '0')}-${tm[1].padStart(2, '0')}`;
  }
  const tail = m[8].trim(), rm = /(\d+(?:\.\d+)?)\s*$/.exec(tail);
  return { ip: m[1], ts, day, method: rq[0], path, query, status: +m[4], bytes: m[5] === '-' ? 0 : +m[5] || 0, ref: m[6] || '', ua: m[7] || '', rt: rm ? +rm[1] / (RT_DIV[unit] || 1) : null };
}
// [family, regex, group]; group google | bing | search | ai | seo | other. kind is set for AI agents.
const AIB = [ // purpose per the vendors' pages, as recorded in ai-crawler-user-agent-directory on 2026-10-23 (not re-checked here)
  ['GPTBot', 'OpenAI', 'training'], ['OAI-SearchBot', 'OpenAI', 'search'], ['ChatGPT-User', 'OpenAI', 'user fetch'], ['OAI-AdsBot', 'OpenAI', 'ads'],
  ['ClaudeBot', 'Anthropic', 'training'], ['Claude-SearchBot', 'Anthropic', 'search'], ['Claude-User', 'Anthropic', 'user fetch'], ['anthropic-ai', 'Anthropic', 'training'],
  ['PerplexityBot', 'Perplexity', 'search'], ['Perplexity-User', 'Perplexity', 'user fetch'],
  ['Google-CloudVertexBot', 'Google', 'other'], ['Meta-ExternalAgent', 'Meta', 'training'], ['Meta-ExternalFetcher', 'Meta', 'user fetch'], ['Meta-WebIndexer', 'Meta', 'search'], ['Meta-ExternalAds', 'Meta', 'ads'],
  ['Amazonbot', 'Amazon', 'training'], ['Amzn-SearchBot', 'Amazon', 'search'], ['Amzn-User', 'Amazon', 'user fetch'], ['CCBot', 'Common Crawl', 'training'],
  ['Bytespider', 'ByteDance', 'training'], ['cohere-ai', 'Cohere', 'training'], ['DuckAssistBot', 'DuckDuckGo', 'user fetch'], ['MistralAI-User', 'Mistral', 'user fetch'],
  ['Diffbot', 'Diffbot', 'other'], ['ImagesiftBot', 'Hive', 'training'], ['Omgilibot', 'Webz.io', 'other'], ['YouBot', 'You.com', 'search'],
].map(([t, op, kind]) => ({ fam: t, re: new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), grp: 'ai', kind, op })).sort((a, b) => b.fam.length - a.fam.length);
const BOTFAM = [
  ['Googlebot-Image', /Googlebot-Image/i, 'google'], ['Googlebot-Video', /Googlebot-Video/i, 'google'], ['Googlebot-News', /Googlebot-News/i, 'google'],
  ['Google-InspectionTool', /Google-InspectionTool/i, 'google'], ['GoogleOther', /GoogleOther/i, 'google'], ['AdsBot-Google', /AdsBot-Google/i, 'google'], ['Storebot-Google', /Storebot-Google/i, 'google'],
  ['Googlebot', /Googlebot/i, 'google'], ['Bingbot', /bingbot/i, 'bing'], ['AdIdxBot', /adidxbot/i, 'bing'], ['BingPreview', /bingpreview/i, 'bing'],
  ['YandexBot', /Yandex(Bot|Images|Media)/i, 'search'], ['Baiduspider', /Baiduspider/i, 'search'], ['DuckDuckBot', /DuckDuckBot/i, 'search'], ['Applebot', /Applebot/i, 'search'],
  ['Yeti (Naver)', /Yeti\//i, 'search'], ['SeznamBot', /SeznamBot/i, 'search'], ['Yahoo Slurp', /Slurp/i, 'search'],
  ['AhrefsBot', /AhrefsBot/i, 'seo'], ['SemrushBot', /SemrushBot/i, 'seo'], ['MJ12bot', /MJ12bot/i, 'seo'], ['DotBot', /DotBot/i, 'seo'],
].map(([fam, re, grp]) => ({ fam, re, grp }));
const GENERIC = /bot\b|crawl|spider|scrape|fetch|python-requests|python-urllib|curl\/|wget|go-http-client|okhttp|headless|libwww|axios|node-fetch|scrapy/i;
const botOf = (ua) => {
  if (!ua || ua === '-') return null;
  const ai = AIB.find((b) => b.re.test(ua)); if (ai && !/^Applebot-Extended/i.test(ua)) return ai;
  const f = BOTFAM.find((b) => b.re.test(ua)); if (f) return f;
  return GENERIC.test(ua) ? { fam: 'Other bot or tool', grp: 'other' } : null;
};
const BOT_FILTER = { 'Google crawlers (Googlebot, Googlebot-Image, ...)': 'google', 'Bingbot and Microsoft crawlers': 'bing', 'Any search engine bot': 'search', 'Any AI bot': 'ai', 'Any known bot': 'bot', 'All requests (no filter)': 'all' };
const passes = (b, f) => (f === 'all' ? true : !b ? false : f === 'google' ? b.grp === 'google' : f === 'bing' ? b.grp === 'bing' : f === 'search' ? ['google', 'bing', 'search'].includes(b.grp) : f === 'ai' ? b.grp === 'ai' : true);
const BOTSEL = (def) => sel('bot', 'Requests to analyse', Object.keys(BOT_FILTER), def || Object.keys(BOT_FILTER)[0]);
const RTSEL = sel('rtunit', 'Number at the end of each line is', ['seconds', 'milliseconds', 'microseconds'], 'seconds');
const LOGLABEL = 'Access log lines (Apache or nginx combined format)';
const CAVEAT = 'Bots are recognised by the user-agent text only. Anyone can fake it, so treat the numbers as claims, not proof.';
function prep(t, o) {
  const raw = lines(need(t, 'access log lines')).filter((x) => x.trim()), all = []; let bad = 0;
  for (const l of raw) { const p = parseLine(l, o.rtunit); if (p) all.push(p); else bad++; }
  if (!all.length) throw new Error('No lines in Apache/nginx combined log format were found.');
  const f = BOT_FILTER[o.bot] || 'google';
  for (const r of all) r.bot = botOf(r.ua);
  const rows = all.filter((r) => passes(r.bot, f));
  if (!rows.length) throw new Error('No requests match the filter "' + o.bot + '". Try "All requests".');
  const days = [...new Set(all.map((r) => r.day).filter(Boolean))].sort();
  const stamps = all.map((r) => r.ts).filter((x) => x != null);
  const end = stamps.length ? Math.max(...stamps) : null, start = stamps.length ? Math.min(...stamps) : null;
  const head = `Read ${all.length} log lines${bad ? ` (${bad} skipped, not in combined format)` : ''}. Selected: ${o.bot}, ${rows.length} requests${days.length ? `, log covers ${days[0]} to ${days[days.length - 1]} (${days.length} day${days.length > 1 ? 's' : ''})` : ''}.`;
  return { all, rows, bad, days, head, start, end };
}
const isId = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) || /^[0-9a-f]{12,}$/i.test(s);
function groupKey(path, mode) {
  const segs = path.split('/').filter(Boolean);
  if (mode === 'folder level 2') return segs.length < 2 ? (segs.length ? '/(top-level pages)' : '/ (home)') : segs.length === 2 && /\.\w{2,5}$/.test(segs[1]) ? '/' + segs[0] + '/' : '/' + segs[0] + '/' + segs[1] + '/';
  if (mode === 'URL template') {
    if (!segs.length) return '/ (home)';
    return '/' + segs.map((s, i) => (/^\d+$/.test(s) ? '{n}' : isId(s) ? '{id}' : i === segs.length - 1 && i >= 1 && !/\.\w{2,5}$/.test(s) && (s.includes('-') || s.length > 24) ? '{slug}' : s)).join('/');
  }
  if (!segs.length) return '/ (home)';
  return segs.length === 1 && !path.endsWith('/') ? '/(top-level pages)' : segs.length === 2 && /\.\w{2,5}$/.test(segs[1]) ? '/' + segs[0] + '/' : '/' + segs[0] + '/';
}
const GROUPSEL = sel('group', 'Group URLs by', ['folder', 'folder level 2', 'URL template'], 'folder');
const cls = (s) => `${Math.floor(s / 100)}xx`;
const normU = (u, keepQ) => {
  let s = String(u).trim().replace(/#.*/, '').replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, ''); if (!s.startsWith('/')) s = '/' + s;
  const qi = s.indexOf('?'); let p = qi < 0 ? s : s.slice(0, qi); const q = qi < 0 ? '' : s.slice(qi + 1);
  try { p = decodeURI(p); } catch { /* keep raw */ }
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return keepQ && q ? p + '?' + q : p;
};
const urlList = (t, what) => {
  const s = need(t, what), locs = [...s.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  if (locs.length) return locs;
  return lines(s).map((l) => l.trim().split(/[,\t]/)[0].replace(/^"|"$/g, '').trim()).filter((x) => /^(https?:\/\/|\/)/i.test(x));
};
const fmtD = (ts) => (ts == null ? '' : new Date(ts).toISOString().slice(0, 16).replace('T', ' '));
const dayNum = (d) => Date.parse(d + 'T00:00:00Z') / 86400000;

// deterministic sample log: 7 days, mixed bots and humans
const SMART = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const DESK = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BING = 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)';
const HUMAN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const GPT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)';
const CLAUDE = 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)';
const CHATU = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot';
const SPATHS = ['/', '/blog/', '/blog/seo-basics-for-new-sites', '/blog/crawl-budget-explained', '/products/12', '/products/13', '/products/14', '/products/15', '/products/13?color=red&sort=price', '/products/12?utm_source=news', '/search?q=shoes', '/old-page', '/old-page', '/missing-page', '/de/produkte/', '/en/products/', '/about', '/static/app.js', '/static/site.css', '/img/hero.jpg', '/api/data.json', '/robots.txt', '/category/shoes/red/size-42/page-3'];
const SSTATUS = { '/old-page': 301, '/missing-page': 404, '/search?q=shoes': 200 };
function buildSample() {
  let s = 12345; const r = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff, out = [];
  const mon = 'Oct';
  for (let d = 1; d <= 7; d++) {
    const dd = String(d).padStart(2, '0'), n = d === 5 ? 38 : 14 + (d % 3) * 2;
    for (let i = 0; i < n; i++) {
      const roll = r(), pi = Math.floor(r() * SPATHS.length), p = SPATHS[pi];
      const ua = roll < 0.55 ? SMART : roll < 0.7 ? DESK : roll < 0.82 ? BING : roll < 0.88 ? GPT : roll < 0.92 ? CLAUDE : roll < 0.94 ? CHATU : HUMAN;
      const ip = ua === SMART || ua === DESK ? '66.249.66.' + (1 + Math.floor(r() * 30)) : ua === BING ? '40.77.167.' + (1 + Math.floor(r() * 30)) : ua === HUMAN ? '203.0.113.' + (1 + Math.floor(r() * 90)) : '20.171.206.' + (1 + Math.floor(r() * 30));
      const st = SSTATUS[p] || (p === '/category/shoes/red/size-42/page-3' && r() < 0.3 ? 500 : 200);
      const hh = String(Math.floor(r() * 24)).padStart(2, '0'), mm = String(Math.floor(r() * 60)).padStart(2, '0'), ss = String(Math.floor(r() * 60)).padStart(2, '0');
      const rt = (0.04 + r() * (p.startsWith('/search') || p.startsWith('/category') ? 1.8 : 0.4)).toFixed(3);
      const bytes = st === 301 ? 169 : st === 404 ? 1120 : p.endsWith('.js') ? 84210 : p.endsWith('.css') ? 20110 : p.endsWith('.jpg') ? 142000 : 9000 + Math.floor(r() * 30000);
      out.push({ t: `${hh}${mm}${ss}`, l: `${ip} - - [${dd}/${mon}/2025:${hh}:${mm}:${ss} +0000] "GET ${p} HTTP/1.1" ${st} ${bytes} "-" "${ua}" ${rt}` });
    }
  }
  out.push({ t: '000000', l: `66.249.66.7 - - [01/Oct/2025:00:00:00 +0000] "GET /robots.txt HTTP/1.1" 200 1204 "-" "${SMART}" 0.011` });
  return out.map((x) => x.l).join('\n');
}
const LOG_SAMPLE = buildSample();

// ---------- log tools ----------
const logTool = (o) => tool({ cat: SEO, labels: [LOGLABEL], sample: LOG_SAMPLE, ...o, desc: o.desc });
const TOP = num('top', 'Rows to show', 25);
const urlOf = (r) => r.path + (r.query ? '?' + r.query : '');
const PAGEEXT = /\.(html?|php|aspx?|jsp|shtml)$/i;
const isPageHit = (r) => r.method === 'GET' && r.path !== '/robots.txt' && (!/\.\w{2,5}$/.test(r.path) || PAGEEXT.test(r.path));
const sampleSitemap = ['/', '/blog/', '/blog/seo-basics-for-new-sites', '/blog/crawl-budget-explained', '/blog/new-post', '/products/12', '/products/13', '/products/14', '/products/16', '/products/17', '/about', '/contact', '/de/produkte/', '/en/products/'].map((p) => 'https://example.com' + p).join('\n');

logTool({
  id: 'googlebot-crawl-budget-analyzer', title: 'Googlebot Crawl Budget Analyzer (Hits by Section, Template and Day)',
  desc: 'Paste access log lines and see how many Googlebot requests go to each site section or URL template, with status codes and hits per day.',
  opts: [BOTSEL(), GROUPSEL, TOP],
  run: ([t], o) => {
    const p = prep(t, o), g = new Map();
    for (const r of p.rows) {
      const k = groupKey(r.path, o.group); let e = g.get(k); if (!e) g.set(k, e = { n: 0, u: new Set(), c: {} });
      e.n++; e.u.add(urlOf(r)); const c = cls(r.status); e.c[c] = (e.c[c] || 0) + 1;
    }
    const rows = [...g.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, o.top).map(([k, e]) => [k, e.n, pct(e.n, p.rows.length), e.u.size, (e.n / e.u.size).toFixed(1), e.c['2xx'] || 0, e.c['3xx'] || 0, e.c['4xx'] || 0, e.c['5xx'] || 0]);
    const byDay = [...countBy(p.rows, (r) => r.day || '(no date)').entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return `${p.head}\n\nHits by ${o.group}\n${tbl(['Group', 'Hits', 'Share', 'Unique URLs', 'Hits/URL', '2xx', '3xx', '4xx', '5xx'], rows)}\n\nHits per day\n${tbl(['Day', 'Hits'], byDay)}\nAverage per day: ${(p.rows.length / Math.max(1, byDay.length)).toFixed(1)}\n\nA section with many hits per URL and few real pages is where crawl effort goes. The first and last day of a log are often partial.\n${CAVEAT}`;
  },
});

logTool({
  id: 'orphan-page-finder', title: 'Orphan Page Finder: Bot-Crawled URLs Missing From Your URL List',
  desc: 'Compare the pages bots request in your access log with your sitemap or crawl export, and list crawled pages that are in neither.',
  inputs: 2, labels: [LOGLABEL, 'Sitemap XML, or one URL per line (sitemap or crawl export)'], sample2: sampleSitemap,
  opts: [BOTSEL(), chk('ok', 'Only count requests answered with 200', true), TOP],
  run: ([t, t2], o) => {
    const p = prep(t, o), known = new Set(urlList(t2, 'a sitemap or URL list').map((u) => normU(u, false)));
    if (!known.size) throw new Error('No URLs found in the second box.');
    const m = new Map();
    for (const r of p.rows) {
      if (!isPageHit(r) || (o.ok && r.status !== 200)) continue;
      const k = normU(r.path, false); let e = m.get(k); if (!e) m.set(k, e = { n: 0, bots: new Set(), last: 0 });
      e.n++; e.bots.add(r.bot ? r.bot.fam : 'browser or unknown'); e.last = Math.max(e.last, r.ts || 0);
    }
    if (!m.size) throw new Error('No page requests left after filtering.');
    const orph = [...m.entries()].filter(([k]) => !known.has(k)).sort((a, b) => b[1].n - a[1].n);
    return `${p.head}\n\nDistinct pages requested: ${m.size}. In your list: ${m.size - orph.length}. Not in your list: ${orph.length} (${pct(orph.length, m.size)}).\n\n${orph.length ? tbl(['URL (query ignored)', 'Hits', 'Last seen', 'Bots'], orph.slice(0, o.top).map(([k, e]) => [k, e.n, fmtD(e.last), [...e.bots].join(', ')])) : 'Every requested page is in your list.'}\n\nThese pages are requested by bots but are missing from the list you pasted. That makes them candidates for orphan pages, old URLs that still get crawled, or pages you forgot to list. A sitemap is not a link map: confirm against an internal-link crawl before calling a page orphaned. Trailing slashes are ignored when matching.\n${CAVEAT}`;
  },
});

logTool({
  id: 'uncrawled-sitemap-urls', title: 'Uncrawled Sitemap URLs Report (Never Requested by Bots in the Log)',
  desc: 'List the sitemap URLs that no selected bot requested during the log period, grouped by folder, with coverage per folder.',
  inputs: 2, labels: [LOGLABEL, 'Sitemap XML, or one URL per line'], sample2: sampleSitemap,
  opts: [BOTSEL(), TOP],
  run: ([t, t2], o) => {
    const p = prep(t, o), list = [...new Set(urlList(t2, 'a sitemap or URL list').map((u) => normU(u, false)))];
    if (!list.length) throw new Error('No URLs found in the second box.');
    const seen = new Set(p.rows.map((r) => normU(r.path, false))), miss = list.filter((u) => !seen.has(u));
    const byF = new Map();
    for (const u of list) { const k = groupKey(u, 'folder'); const e = byF.get(k) || { all: 0, miss: 0 }; e.all++; if (!seen.has(u)) e.miss++; byF.set(k, e); }
    const fr = [...byF.entries()].sort((a, b) => b[1].miss - a[1].miss).slice(0, o.top).map(([k, e]) => [k, e.all, e.all - e.miss, e.miss, pct(e.all - e.miss, e.all)]);
    return `${p.head}\n\nSitemap URLs: ${list.length}. Requested at least once: ${list.length - miss.length} (${pct(list.length - miss.length, list.length)}). Not requested: ${miss.length}.\n\nBy folder\n${tbl(['Folder', 'In sitemap', 'Crawled', 'Not crawled', 'Coverage'], fr)}\n\nNot requested during the log period\n${miss.slice(0, o.top * 2).join('\n') || '(none)'}${miss.length > o.top * 2 ? `\n... and ${miss.length - o.top * 2} more` : ''}\n\nA short log period will miss URLs that bots visit rarely, so a URL listed here is not proof that it is ignored. Compare with a longer period before acting. Any status code counts as requested.\n${CAVEAT}`;
  },
});

logTool({
  id: 'crawl-frequency-per-url', title: 'Crawl Frequency per URL (Hits and Days Since Last Bot Visit)',
  desc: 'See how often each URL was requested by a bot, when it was first and last seen, the average gap between visits and days since the last visit.',
  opts: [BOTSEL(), sel('sort', 'Order', ['most crawled first', 'longest since last visit first', 'crawled once only']), chk('q', 'Treat different query strings as different URLs', false), TOP],
  run: ([t], o) => {
    const p = prep(t, o), m = new Map();
    for (const r of p.rows) {
      const k = o.q ? urlOf(r) : r.path; let e = m.get(k); if (!e) m.set(k, e = { n: 0, first: Infinity, last: 0 });
      e.n++; if (r.ts != null) { e.first = Math.min(e.first, r.ts); e.last = Math.max(e.last, r.ts); }
    }
    const end = p.end, DAY = 86400000;
    let arr = [...m.entries()].map(([k, e]) => ({ k, ...e, since: end != null && e.last ? (end - e.last) / DAY : null, gap: e.n > 1 && e.last > e.first ? (e.last - e.first) / DAY / (e.n - 1) : null }));
    const once = arr.filter((e) => e.n === 1).length;
    if (o.sort === 'crawled once only') arr = arr.filter((e) => e.n === 1).sort((a, b) => a.k.localeCompare(b.k));
    else if (o.sort === 'longest since last visit first') arr.sort((a, b) => (b.since ?? -1) - (a.since ?? -1));
    else arr.sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));
    return `${p.head}\n\nDistinct URLs: ${m.size}. Requested once: ${once} (${pct(once, m.size)}). Median hits per URL: ${median([...m.values()].map((e) => e.n))}.\n\n${tbl(['URL', 'Hits', 'First seen', 'Last seen', 'Days since last', 'Avg days between'], arr.slice(0, o.top).map((e) => [e.k, e.n, fmtD(e.first === Infinity ? null : e.first), fmtD(e.last || null), e.since == null ? '' : e.since.toFixed(1), e.gap == null ? '' : e.gap.toFixed(1)]))}\n\n"Days since last" is measured from the newest line in the log, not from today. ${CAVEAT}`;
  },
});

logTool({
  id: 'bot-status-code-report', title: 'Bot Status Code Report (2xx, 3xx, 4xx, 5xx per Crawler)',
  desc: 'Break down the HTTP status codes your server returned to each crawler, list exact codes and show the URLs behind most errors.',
  opts: [BOTSEL('Any known bot'), TOP],
  run: ([t], o) => {
    const p = prep(t, o), by = new Map();
    for (const r of p.rows) { const f = r.bot ? r.bot.fam : 'browser or unknown'; const e = by.get(f) || { n: 0 }; e.n++; const c = cls(r.status); e[c] = (e[c] || 0) + 1; by.set(f, e); }
    const rows = [...by.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, o.top).map(([f, e]) => [f, e.n, e['2xx'] || 0, e['3xx'] || 0, e['4xx'] || 0, e['5xx'] || 0, pct((e['4xx'] || 0) + (e['5xx'] || 0), e.n)]);
    const codes = topN(countBy(p.rows, (r) => r.status), 15).map(([c, n]) => [c, n, pct(n, p.rows.length)]);
    const errs = topN(countBy(p.rows.filter((r) => r.status >= 400), urlOf), 10);
    return `${p.head}\n\nStatus classes per crawler\n${tbl(['Crawler', 'Hits', '2xx', '3xx', '4xx', '5xx', 'Error share'], rows)}\n\nExact status codes\n${tbl(['Code', 'Hits', 'Share'], codes)}\n\nURLs with the most 4xx and 5xx answers\n${errs.length ? tbl(['URL', 'Hits'], errs) : '(none)'}\n\nA steady stream of 3xx and 4xx answers means crawl effort goes to URLs that do not resolve. A rise in 5xx answers is worth checking against server logs for the same hours. ${CAVEAT}`;
  },
});

const WASTE_SAMPLE_NOTE = 'Categories are heuristics. Review the examples before changing robots.txt or redirects.';
logTool({
  id: 'wasted-crawl-detector', title: 'Wasted Crawl Detector (Parameters, Facets, Redirects, Errors in Logs)',
  desc: 'Group bot requests into likely waste: error pages, redirects, faceted and parameter URLs, tracking and session parameters, internal search and thin pages.',
  opts: [BOTSEL(), txt('facets', 'Facet and sort parameter names (comma separated)', 'filter,facet,sort,order,color,colour,size,price,brand,view,limit,page'), txt('track', 'Tracking and session parameter prefixes', 'utm_,gclid,fbclid,sessionid,sid,phpsessid,ref'), txt('search', 'Internal search parameter names', 'q,s,search,query,keyword'), num('thin', 'Flag 200 pages smaller than this many bytes (0 = off)', 0), TOP],
  run: ([t], o) => {
    const p = prep(t, o), L = (s) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    const facets = new Set(L(o.facets)), track = L(o.track), search = new Set(L(o.search));
    const catOf = (r) => {
      if (r.status >= 500) return '5xx server errors'; if (r.status >= 400) return '4xx client errors'; if (r.status >= 300 && r.status < 400 && r.status !== 304) return '3xx redirects';
      const keys = r.query ? r.query.split('&').map((k) => decodeURIComponent_safe(k.split('=')[0]).toLowerCase()) : [];
      if (keys.some((k) => facets.has(k))) return 'Faceted and sort parameters';
      if (keys.some((k) => track.some((x) => k.startsWith(x)))) return 'Tracking and session parameters';
      if (keys.some((k) => search.has(k)) || /^\/(search|suche|recherche|zoeken)\b/i.test(r.path)) return 'Internal search results';
      if (keys.length) return 'Other parameter URLs';
      if (o.thin > 0 && r.status === 200 && isPageHit(r) && r.bytes < o.thin) return 'Thin 200 pages (review for soft 404)';
      return 'Likely useful';
    };
    const by = new Map();
    for (const r of p.rows) { const c = catOf(r); const e = by.get(c) || { n: 0, ex: new Map() }; e.n++; e.ex.set(urlOf(r), (e.ex.get(urlOf(r)) || 0) + 1); by.set(c, e); }
    const waste = p.rows.length - (by.get('Likely useful') || { n: 0 }).n;
    const rows = [...by.entries()].sort((a, b) => (a[0] === 'Likely useful') - (b[0] === 'Likely useful') || b[1].n - a[1].n).map(([c, e]) => [c, e.n, pct(e.n, p.rows.length), topN(e.ex, 1)[0][0].slice(0, 70)]);
    const ex = [...by.entries()].filter(([c]) => c !== 'Likely useful').sort((a, b) => b[1].n - a[1].n).map(([c, e]) => `${c}\n${topN(e.ex, Math.min(5, o.top)).map(([u, n]) => `  ${n}  ${u}`).join('\n')}`).join('\n');
    return `${p.head}\n\nLikely waste: ${waste} of ${p.rows.length} requests (${pct(waste, p.rows.length)}).\n\n${tbl(['Category', 'Hits', 'Share', 'Most requested example'], rows)}\n\nTop examples per category\n${ex || '(none)'}\n\n${WASTE_SAMPLE_NOTE} A request is counted once, in the first matching category. "Likely useful" only means no waste signal was found. ${CAVEAT}`;
  },
});
function decodeURIComponent_safe(s) { try { return decodeURIComponent(s); } catch { return s; } }

logTool({
  id: 'redirect-hits-in-logs', title: 'Redirect Hits in Logs (URLs Bots Keep Requesting That Redirect)',
  desc: 'Find the URLs that crawlers request again and again and that answer with 301, 302, 307 or 308, ranked by hits, so you can fix the links that point to them.',
  opts: [BOTSEL(), num('min', 'Show URLs with at least this many hits', 2), TOP],
  run: ([t], o) => {
    const p = prep(t, o), red = p.rows.filter((r) => r.status >= 300 && r.status < 400 && r.status !== 304), m = new Map();
    for (const r of red) { const k = urlOf(r); const e = m.get(k) || { n: 0, codes: new Set(), bots: new Set(), last: 0 }; e.n++; e.codes.add(r.status); e.bots.add(r.bot ? r.bot.fam : 'unknown'); e.last = Math.max(e.last, r.ts || 0); m.set(k, e); }
    const arr = [...m.entries()].filter(([, e]) => e.n >= o.min).sort((a, b) => b[1].n - a[1].n);
    const temp = arr.filter(([, e]) => [...e.codes].some((c) => c === 302 || c === 307)).length;
    return `${p.head}\n\nRedirect answers: ${red.length} of ${p.rows.length} requests (${pct(red.length, p.rows.length)}), ${m.size} distinct URLs.\n\n${arr.length ? tbl(['URL', 'Hits', 'Codes', 'Last seen', 'Bots'], arr.slice(0, o.top).map(([k, e]) => [k.slice(0, 80), e.n, [...e.codes].join('/'), fmtD(e.last), [...e.bots].join(', ')])) : 'No URL reached the minimum number of redirect hits.'}\n\n${temp ? `${temp} listed URLs answer with a temporary redirect (302 or 307). Review whether they should be permanent.\n` : ''}The log shows the status only, not the redirect target, so it cannot show full chains. Paste the listed URLs into a redirect checker to see where they lead, then update the internal links and sitemap entries that still point to them. ${CAVEAT}`;
  },
});

logTool({
  id: 'robots-txt-fetch-monitor', title: 'robots.txt Fetch Monitor (Bot Requests, Status and Timing from Logs)',
  desc: 'Pull every crawler request for /robots.txt out of your log with status code and response time, plus a fetch count per day and bot.',
  opts: [BOTSEL('Any known bot'), RTSEL, TOP],
  run: ([t], o) => {
    const p = prep(t, o), rows = p.rows.filter((r) => r.path.toLowerCase() === '/robots.txt');
    if (!rows.length) return `${p.head}\n\nNo request for /robots.txt was found for this filter. That can mean the log period is short, or the file is served by another host or CDN.`;
    const per = new Map();
    for (const r of rows) { const k = `${r.day}\t${r.bot ? r.bot.fam : 'unknown'}`; const e = per.get(k) || { n: 0, c: new Set() }; e.n++; e.c.add(r.status); per.set(k, e); }
    const dayRows = [...per.entries()].sort().map(([k, e]) => [...k.split('\t'), e.n, [...e.c].sort().join('/')]);
    const sorted = [...rows].sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const bad = rows.filter((r) => r.status !== 200 && r.status !== 304);
    const rts = rows.map((r) => r.rt).filter((x) => x != null);
    return `${p.head}\n\n/robots.txt requests: ${rows.length}. Non-200 answers: ${bad.length}.${rts.length ? ` Response time: median ${median(rts).toFixed(3)} s, max ${Math.max(...rts).toFixed(3)} s.` : ' (no response times in this log)'}\n\nFetches per day and bot\n${tbl(['Day', 'Bot', 'Fetches', 'Status codes'], dayRows)}\n\nLatest fetches\n${tbl(['Time (UTC)', 'Bot', 'Status', 'Bytes', 'Seconds'], sorted.slice(-Math.min(o.top, sorted.length)).reverse().map((r) => [fmtD(r.ts), r.bot ? r.bot.fam : 'unknown', r.status, r.bytes, r.rt == null ? '' : r.rt.toFixed(3)]))}\n\n${bad.length ? 'Review the non-200 answers: crawlers treat server errors and missing files differently, so check each vendor\'s robots.txt documentation. ' : ''}A bot that never fetches robots.txt in a long log is worth a look. ${CAVEAT}`;
  },
});

logTool({
  id: 'crawl-depth-bot-hits', title: 'Crawl Depth vs Bot Hits (URL Path Depth)',
  desc: 'Count bot requests and distinct URLs by path depth (number of folders) to see where crawling thins out on your site.',
  opts: [BOTSEL(), chk('q', 'Treat different query strings as different URLs', false)],
  run: ([t], o) => {
    const p = prep(t, o), m = new Map();
    for (const r of p.rows) { const d = r.path.split('/').filter(Boolean).length; const e = m.get(d) || { n: 0, u: new Set() }; e.n++; e.u.add(o.q ? urlOf(r) : r.path); m.set(d, e); }
    const rows = [...m.entries()].sort((a, b) => a[0] - b[0]).map(([d, e]) => [d === 0 ? '0 (home)' : d, e.n, pct(e.n, p.rows.length), e.u.size, (e.n / e.u.size).toFixed(1), '#'.repeat(Math.max(1, Math.round((e.n / p.rows.length) * 40)))]);
    return `${p.head}\n\n${tbl(['Depth', 'Hits', 'Share', 'Distinct URLs', 'Hits/URL', ''], rows)}\n\nDepth here is the number of path segments in the URL, not the number of clicks from the home page. If hits per URL fall sharply at deeper levels, bots reach those pages less often. Check internal links and sitemaps for those folders. ${CAVEAT}`;
  },
});

logTool({
  id: 'content-discovery-lag', title: 'New Content Discovery Lag (Publish Date to First Bot Visit)',
  desc: 'Measure how long a bot took to request each new URL for the first time, from your publish dates and your access log.',
  inputs: 2, labels: [LOGLABEL, 'New URLs with publish time, one per line: /path,2025-10-02 08:00'],
  sample2: '/blog/crawl-budget-explained,2025-10-01 06:00\n/blog/seo-basics-for-new-sites,2025-10-01 00:00\n/products/15,2025-10-01 00:00\n/products/99,2025-10-04 10:00',
  opts: [BOTSEL(), chk('ok', 'Only count requests answered with 200', true)],
  run: ([t, t2], o) => {
    const p = prep(t, o), first = new Map();
    for (const r of p.rows) { if (o.ok && r.status !== 200) continue; if (r.ts == null) continue; const k = normU(r.path, false); if (!first.has(k) || r.ts < first.get(k)) first.set(k, r.ts); }
    const items = lines(need(t2, 'URLs with publish times')).map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.search(/[,\t]/); if (i < 0) return null; let d = l.slice(i + 1).trim().replace(/"/g, '').replace(' ', 'T'); if (!/[zZ]|[+-]\d\d:?\d\d$/.test(d)) d += d.includes('T') ? 'Z' : 'T00:00:00Z'; const ts = Date.parse(d);
      return Number.isNaN(ts) ? null : { u: normU(l.slice(0, i), false), pub: ts };
    }).filter(Boolean);
    if (!items.length) throw new Error('No "url,date" lines could be read. Use /path,2025-10-02 08:00 (UTC).');
    const lags = [], rows = [];
    for (const it of items) {
      const f = first.get(it.u); let note = '', lag = null;
      if (f == null) note = 'not requested in this log';
      else { lag = f - it.pub; if (lag < 0) note = 'seen before the publish time (check the date)'; }
      if (p.start != null && it.pub < p.start && f != null) note = note || 'published before the log starts, lag unreliable';
      if (lag != null && lag >= 0 && !note) lags.push(lag);
      rows.push([it.u.slice(0, 60), fmtD(it.pub), fmtD(f), lag == null || lag < 0 ? '' : fmtLag(lag), note]);
    }
    const never = rows.filter((r) => r[4] === 'not requested in this log').length;
    return `${p.head}\n\n${tbl(['URL', 'Published (UTC)', 'First bot visit (UTC)', 'Lag', 'Note'], rows)}\n\n${lags.length ? `Reliable lags: ${lags.length}. Median ${fmtLag(median(lags))}, slowest ${fmtLag(Math.max(...lags))}.` : 'No reliable lag could be measured.'} Not requested: ${never}.\n\nPublish times without a time zone are read as UTC, as are log times with their own offset applied. Check your server time zone. ${CAVEAT}`;
  },
});
function fmtLag(ms) { const m = ms / 60000; return m < 60 ? `${Math.round(m)} min` : m < 2880 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} days`; }

logTool({
  id: 'googlebot-mobile-desktop-split', title: 'Googlebot Smartphone vs Desktop Split Over Time',
  desc: 'Chart Googlebot smartphone against desktop requests per day from your log, with image, video and other Google crawlers counted apart.',
  opts: [],
  run: ([t], o) => {
    const p = prep(t, { ...o, bot: Object.keys(BOT_FILTER)[0] }), kind = (r) => {
      const f = r.bot.fam; if (f === 'Googlebot') return /Mobile|Android/i.test(r.ua) ? 'smartphone' : 'desktop';
      return /Image|Video|News/.test(f) ? 'image / video / news' : 'other Google';
    };
    const days = new Map();
    for (const r of p.rows) { const e = days.get(r.day) || { smartphone: 0, desktop: 0, 'image / video / news': 0, 'other Google': 0 }; e[kind(r)]++; days.set(r.day, e); }
    const tot = { smartphone: 0, desktop: 0, 'image / video / news': 0, 'other Google': 0 };
    const rows = [...days.entries()].sort().map(([d, e]) => { for (const k in tot) tot[k] += e[k]; const pg = e.smartphone + e.desktop; return [d, e.smartphone, e.desktop, e['image / video / news'], e['other Google'], pg ? pct(e.smartphone, pg) : '', '#'.repeat(Math.round((e.smartphone / Math.max(1, pg)) * 20))]; });
    const pg = tot.smartphone + tot.desktop;
    return `${p.head}\n\n${tbl(['Day', 'Smartphone', 'Desktop', 'Image/video/news', 'Other Google', 'Smartphone share', ''], rows)}\n\nTotal: smartphone ${tot.smartphone}, desktop ${tot.desktop} (smartphone share of Googlebot page crawls ${pg ? pct(tot.smartphone, pg) : 'n/a'}).\n\nThe split uses the user-agent: Googlebot with "Mobile" or "Android" in it counts as smartphone. Other Google crawlers are shown separately. ${CAVEAT}`;
  },
});

logTool({
  id: 'bot-response-time-report', title: 'Bot Response Time Report (Slow Sections and URLs for Crawlers)',
  desc: 'Show how long your server took to answer crawlers, per section or URL template, with median, 95th percentile and the slowest URLs.',
  opts: [BOTSEL(), GROUPSEL, RTSEL, num('slow', 'Count a request as slow above (seconds)', 1), TOP],
  run: ([t], o) => {
    const p = prep(t, o), rows = p.rows.filter((r) => r.rt != null);
    if (!rows.length) throw new Error('No response times found. Log the time at the end of each line ($request_time in nginx, %D in Apache) and pick the unit.');
    const g = new Map(), u = new Map();
    for (const r of rows) { const k = groupKey(r.path, o.group); (g.get(k) || g.set(k, []).get(k)).push(r.rt); const k2 = r.path; (u.get(k2) || u.set(k2, []).get(k2)).push(r.rt); }
    const f = (x) => x.toFixed(3), avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const grows = [...g.entries()].sort((a, b) => avg(b[1]) - avg(a[1])).slice(0, o.top).map(([k, a]) => [k, a.length, f(avg(a)), f(median(a)), f(quant(a, 0.95)), f(Math.max(...a)), pct(a.filter((x) => x > o.slow).length, a.length)]);
    const urows = [...u.entries()].filter(([, a]) => a.length >= 2).sort((a, b) => avg(b[1]) - avg(a[1])).slice(0, 10).map(([k, a]) => [k.slice(0, 70), a.length, f(avg(a)), f(Math.max(...a))]);
    const all = rows.map((r) => r.rt);
    return `${p.head}\n\nRequests with a response time: ${rows.length}. Median ${f(median(all))} s, 95th percentile ${f(quant(all, 0.95))} s, slowest ${f(Math.max(...all))} s.\n\nBy ${o.group} (slowest average first)\n${tbl(['Group', 'Hits', 'Avg s', 'Median s', 'p95 s', 'Max s', `Over ${o.slow} s`], grows)}\n\nSlowest URLs (at least 2 hits)\n${urows.length ? tbl(['URL', 'Hits', 'Avg s', 'Max s'], urows) : '(none)'}\n\nThe number at the end of each line is taken as the response time in the unit you picked. If your format puts another number last, the figures are wrong. ${CAVEAT}`;
  },
});

logTool({
  id: 'crawl-spike-drop-alerts', title: 'Crawl Spike and Drop Alerts from Access Logs',
  desc: 'Flag days when bot request volume jumps or falls compared with the previous days, per crawler or in total.',
  opts: [BOTSEL(), sel('by', 'Count', ['all selected bots together', 'each bot separately']), num('win', 'Days to average for the baseline', 3), num('thr', 'Alert when the change is above (percent)', 50), num('min', 'Ignore baselines below (requests per day)', 5)],
  run: ([t], o) => {
    const p = prep(t, o), win = Math.max(1, Math.floor(o.win)), thr = Math.max(1, o.thr) / 100;
    const span = new Map(); for (const r of p.all) if (r.ts != null) { const e = span.get(r.day) || [Infinity, 0]; e[0] = Math.min(e[0], r.ts); e[1] = Math.max(e[1], r.ts); span.set(r.day, e); }
    const partial = (d) => { const e = span.get(d); return e && e[1] - e[0] < 20 * 3600000; };
    const series = new Map();
    for (const r of p.rows) { const k = o.by === 'each bot separately' ? (r.bot ? r.bot.fam : 'unknown') : 'All selected'; const m = series.get(k) || new Map(); m.set(r.day, (m.get(r.day) || 0) + 1); series.set(k, m); }
    const alerts = [], out = [];
    const days = p.days;
    for (const [k, m] of [...series.entries()].sort((a, b) => [...b[1].values()].reduce((s, x) => s + x, 0) - [...a[1].values()].reduce((s, x) => s + x, 0))) {
      const vals = days.map((d) => m.get(d) || 0); const rows = [];
      days.forEach((d, i) => {
        let note = '', base = '';
        if (i >= win) {
          const b = vals.slice(i - win, i).reduce((s, x) => s + x, 0) / win; base = b.toFixed(1);
          if (b >= o.min) { const ch = (vals[i] - b) / b; if (ch > thr) note = `SPIKE +${(ch * 100).toFixed(0)}%`; else if (ch < -thr) note = `DROP ${(ch * 100).toFixed(0)}%`; }
          if (note) alerts.push(`${k} ${d}: ${note} (${vals[i]} vs ${base})${partial(d) ? ' [partial day, review]' : ''}`);
        }
        rows.push([d, vals[i], base, note + (partial(d) ? (note ? ' ' : '') + '(partial day?)' : '')]);
      });
      out.push(`${k}\n${tbl(['Day', 'Requests', `Avg of previous ${win}`, 'Alert'], rows)}`);
    }
    return `${p.head}\n\nAlerts: ${alerts.length}${alerts.length ? '\n' + alerts.join('\n') : ' (none above the threshold)'}\n\n${out.slice(0, 8).join('\n\n')}\n\nThe baseline is the plain average of the previous days, so a long log gives better baselines than a week. Days with less than 20 hours of log lines are marked as partial. ${CAVEAT}`;
  },
});

const gscSample = (() => {
  const c = new Map(); for (const l of LOG_SAMPLE.split('\n')) { const m = /\[(\d\d)\/Oct\/2025.*"([^"]*)" [\d.]+$/.exec(l); if (m && /Googlebot/.test(m[2])) c.set(m[1], (c.get(m[1]) || 0) + 1); }
  return 'Date,Total crawl requests\n' + [...c.entries()].sort().map(([d, n], i) => `2025-10-${d},${n + (i % 3) - 1}`).join('\n');
})();
logTool({
  id: 'log-vs-gsc-crawl-comparison', title: 'Log vs Search Console Crawl Comparison (Paste-In)',
  desc: 'Compare daily Googlebot hits counted in your access log with the daily crawl requests you copied from the Search Console Crawl stats report.',
  inputs: 2, labels: [LOGLABEL, 'Search Console crawl requests per day: date,count (one per line)'], sample2: gscSample,
  opts: [BOTSEL(), TOP],
  run: ([t, t2], o) => {
    const p = prep(t, o), g = new Map();
    for (const l of lines(need(t2, 'daily crawl counts from Search Console'))) { const i = l.lastIndexOf(','); if (i < 1) continue; const d = Date.parse(l.slice(0, i).replace(/"/g, '').trim() + (/^\d{4}-\d\d-\d\d$/.test(l.slice(0, i).trim()) ? 'T00:00:00Z' : '')), n = +l.slice(i + 1).replace(/[\s"]/g, '').replace(/,/g, ''); if (!Number.isNaN(d) && Number.isFinite(n)) g.set(new Date(d).toISOString().slice(0, 10), n); }
    if (!g.size) throw new Error('No "date,count" lines could be read from the second box.');
    const log = countBy(p.rows, (r) => r.day), ds = [...new Set([...log.keys(), ...g.keys()])].sort();
    let sl = 0, sg = 0; const rows = ds.filter((d) => log.has(d) && g.has(d)).map((d) => { const a = log.get(d), b = g.get(d); sl += a; sg += b; return [d, a, b, a - b, b ? (a / b).toFixed(2) : '']; });
    if (!rows.length) throw new Error('The two inputs have no day in common.');
    return `${p.head}\n\nDays in both: ${rows.length}\n${tbl(['Day', 'Log hits', 'Search Console', 'Difference', 'Log / GSC'], rows)}\n\nTotal log ${sl}, Search Console ${sg}, ratio ${(sl / Math.max(1, sg)).toFixed(2)}.\n\nA ratio above 1 can come from fake Googlebot requests, from a server that logs more than Google counts, or from a time zone shift. A ratio below 1 can come from logs that miss a CDN or load balancer layer. Search Console may use a different time zone from your server (not verified here), so compare totals over several days. Nothing is fetched: you paste the Search Console numbers yourself. The API itself needs an account and is not used. ${CAVEAT}`;
  },
});

logTool({
  id: 'ai-bot-training-retrieval-splitter', title: 'AI Bot Training vs Retrieval Splitter (from Access Logs)',
  desc: 'Split AI crawler requests in your log into training, search indexing and user-triggered fetches, per bot and per purpose.',
  opts: [TOP],
  run: ([t], o) => {
    const p = prep(t, { ...o, bot: 'Any AI bot' }), by = new Map(), bots = new Map();
    for (const r of p.rows) {
      const k = r.bot.kind; const e = by.get(k) || { n: 0, paths: new Map(), bots: new Set() }; e.n++; e.bots.add(r.bot.fam); e.paths.set(r.path, (e.paths.get(r.path) || 0) + 1); by.set(k, e);
      const b = bots.get(r.bot.fam) || { n: 0, ok: 0, op: r.bot.op, kind: k }; b.n++; if (r.status === 200) b.ok++; bots.set(r.bot.fam, b);
    }
    const order = ['training', 'search', 'user fetch', 'ads', 'other'];
    const prow = order.filter((k) => by.has(k)).map((k) => [k, by.get(k).n, pct(by.get(k).n, p.rows.length), [...by.get(k).bots].join(', ')]);
    const brow = [...bots.entries()].sort((a, b) => b[1].n - a[1].n).map(([f, b]) => [f, b.op, b.kind, b.n, pct(b.ok, b.n)]);
    const tp = order.filter((k) => by.has(k)).map((k) => `${k}\n${topN(by.get(k).paths, 5).map(([u, n]) => `  ${n}  ${u}`).join('\n')}`).join('\n');
    return `${p.head}\n\nBy purpose\n${tbl(['Purpose', 'Hits', 'Share', 'Bots'], prow)}\n\nBy bot\n${tbl(['Bot', 'Operator', 'Purpose', 'Hits', '200 share'], brow)}\n\nTop paths per purpose\n${tp}\n\nPurposes follow what the operators publish, copied from the AI Crawler User-Agent Directory on this site (vendor pages read 2026-10-23 there, not re-checked here). "Training" means the operator says the content may be used for model training. "User fetch" bots act when a person asks and may ignore robots.txt rules. Names not in the list are not counted; new bots appear often. ${CAVEAT}`;
  },
});

const EXTCLS = [['Pages (HTML)', /^$|^(html?|php|aspx?|jsp|shtml)$/i], ['CSS', /^css$/i], ['JavaScript', /^(m?js|map)$/i], ['Images', /^(jpe?g|png|gif|webp|avif|svg|ico|bmp)$/i], ['Fonts', /^(woff2?|ttf|otf|eot)$/i], ['Data (JSON, XML, feeds)', /^(json|xml|rss|atom|txt|csv|webmanifest)$/i], ['Media and downloads', /^(mp4|webm|mp3|ogg|pdf|zip|gz|docx?|xlsx?)$/i]];
const extClass = (path) => { const m = /\.(\w{1,6})$/.exec(path.split('/').pop()); const e = m ? m[1] : ''; return (EXTCLS.find(([, re]) => re.test(e)) || ['Other files'])[0]; };
logTool({
  id: 'resource-crawl-report', title: 'Resource Crawl Report (CSS, JS, Images, Fonts Requested by Bots)',
  desc: 'See how often crawlers fetch pages, CSS, JavaScript, images, fonts and data files, with the status codes each file type received.',
  opts: [BOTSEL(), TOP],
  run: ([t], o) => {
    const p = prep(t, o), by = new Map();
    for (const r of p.rows) { const k = extClass(r.path); const e = by.get(k) || { n: 0, u: new Set(), bad: 0 }; e.n++; e.u.add(r.path); if (r.status >= 400) e.bad++; by.set(k, e); }
    const rows = [...by.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, e]) => [k, e.n, pct(e.n, p.rows.length), e.u.size, e.bad, pct(e.bad, e.n)]);
    const bad = topN(countBy(p.rows.filter((r) => r.status >= 400 && extClass(r.path) !== 'Pages (HTML)'), (r) => r.path), 10);
    const pages = (by.get('Pages (HTML)') || { n: 0 }).n;
    return `${p.head}\n\n${tbl(['Type', 'Hits', 'Share', 'Distinct files', 'Errors (4xx/5xx)', 'Error share'], rows)}\n\nPage requests: ${pages}. Resource requests: ${p.rows.length - pages}.\n\nResources with errors\n${bad.length ? tbl(['File', 'Hits'], bad) : '(none)'}\n\nThe type comes from the file extension in the URL path, and URLs without an extension count as pages. Errors on CSS or JavaScript files are worth checking, because a crawler that cannot fetch them may render the page without them. Whether those files are blocked by robots.txt is not visible in an access log. ${CAVEAT}`;
  },
});

const urlTokens = (l) => (l.match(/https?:\/\/[^\s,"<>]+|\/[^\s,"<>]*/g) || []).filter(Boolean);
logTool({
  id: 'hreflang-crawl-coverage', title: 'Hreflang Alternate Crawl Coverage (Are All Language Versions Crawled?)',
  desc: 'Check in your log whether bots requested every language version of a page, using hreflang groups you paste.',
  inputs: 2, labels: [LOGLABEL, 'Hreflang groups: one URL per line, a blank line between pages'],
  sample2: 'https://example.com/en/products/\nhttps://example.com/de/produkte/\nhttps://example.com/fr/produits/\n\nhttps://example.com/en/about\nhttps://example.com/de/ueber-uns',
  opts: [BOTSEL()],
  run: ([t, t2], o) => {
    const p = prep(t, o), hits = countBy(p.rows, (r) => normU(r.path, false)), groups = [];
    let cur = []; for (const l of [...lines(need(t2, 'hreflang groups')), '']) { if (!l.trim()) { if (cur.length) groups.push(cur); cur = []; } else { const u = urlTokens(l.trim()).find((x) => /^https?:\/\//.test(x)) || urlTokens(l.trim())[0]; if (u) cur.push(normU(u, false)); } }
    if (!groups.length) throw new Error('No URL groups found. Put each page\'s language versions together and separate pages with a blank line.');
    let full = 0, partial = 0, none = 0; const out = [];
    groups.forEach((g, i) => {
      const n = g.filter((u) => hits.has(u)).length; if (n === g.length) full++; else if (n) partial++; else none++;
      out.push(`Group ${i + 1}: ${n} of ${g.length} versions crawled${n && n < g.length ? '  <- review' : ''}\n${g.map((u) => `  ${String(hits.get(u) || 0).padStart(4)}  ${u}`).join('\n')}`);
    });
    return `${p.head}\n\nGroups: ${groups.length}. All versions crawled: ${full}. Some crawled: ${partial}. None crawled: ${none}.\n\n${out.join('\n\n')}\n\nA group where some versions are crawled and others are not may point to missing links between the versions, a block on one language folder or a short log. Matching ignores the host, query and trailing slash. ${CAVEAT}`;
  },
});

logTool({
  id: 'canonical-vs-crawled-url-mismatch', title: 'Canonical vs Crawled URL Mismatch (Bot Hits on Non-Canonical URLs)',
  desc: 'Find URL variants that declare a different canonical URL but still receive bot requests, using a crawl export you paste next to the log.',
  inputs: 2, labels: [LOGLABEL, 'URL and its canonical, one pair per line: url,canonical (crawl export)'],
  sample2: 'Address,Canonical\nhttps://example.com/products/13?color=red&sort=price,https://example.com/products/13\nhttps://example.com/products/12?utm_source=news,https://example.com/products/12\nhttps://example.com/products/12,https://example.com/products/12\nhttps://example.com/search?q=shoes,https://example.com/search',
  opts: [BOTSEL(), TOP],
  run: ([t, t2], o) => {
    const p = prep(t, o), map = new Map();
    for (const l of lines(need(t2, 'url,canonical pairs'))) { const f = l.split(/[,\t]/).map((x) => x.trim().replace(/^"|"$/g, '')); if (f.length >= 2 && /^(https?:\/\/|\/)/.test(f[0]) && /^(https?:\/\/|\/)/.test(f[1])) map.set(normU(f[0], true), normU(f[1], true)); }
    if (!map.size) throw new Error('No "url,canonical" pairs could be read.');
    const m = new Map(); let known = 0, nonc = 0, unknown = 0;
    for (const r of p.rows) {
      const k = normU(urlOf(r), true), c = map.get(k);
      if (c == null) { unknown++; continue; } known++;
      if (c !== k) { nonc++; const e = m.get(k) || { n: 0, c }; e.n++; m.set(k, e); }
    }
    const rows = [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, o.top).map(([k, e]) => [k.slice(0, 70), e.n, e.c.slice(0, 70)]);
    return `${p.head}\n\nRequests for URLs in your export: ${known}. Of these, on non-canonical URLs: ${nonc} (${pct(nonc, known)}). Requests for URLs not in the export: ${unknown}.\n\n${rows.length ? tbl(['Crawled URL', 'Hits', 'Declared canonical'], rows) : 'No bot hit went to a URL whose canonical points elsewhere.'}\n\nA canonical is a hint, not a command, and crawlers still fetch the variants. Many hits here can mean internal links, sitemaps or redirects still point to the variants. URLs are matched by path and query, ignoring the host and a trailing slash. ${CAVEAT}`;
  },
});

// ---------- encoders and decoders ----------
const te = new TextEncoder();
const hex2 = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');
function hexBytes(s) {
  const h = String(s).replace(/0x/gi, '').replace(/[\s:,_-]/g, '');
  if (!h) throw new Error('Enter hex bytes.');
  if (!/^[0-9a-fA-F]+$/.test(h)) throw new Error('Hex may only contain 0-9 and a-f.');
  if (h.length % 2) throw new Error('Hex needs an even number of digits.');
  return Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
}
function b64Bytes(s) {
  let x = String(s).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (/[^A-Za-z0-9+/]/.test(x)) throw new Error('Not valid Base64: it contains characters outside A-Z, a-z, 0-9, +, /.');
  if (x.length % 4 === 1) throw new Error('Not valid Base64: the length is impossible (one stray character).');
  x += '='.repeat((4 - (x.length % 4)) % 4);
  const bin = atob(x), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u;
}
function b64Str(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
const textOrHex = (u, mode) => {
  if (mode === 'Hex bytes') return hex2(u).replace(/(..)(?!$)/g, '$1 ');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u); } catch { throw new Error('The decoded bytes are not valid UTF-8 text. Switch the bytes option to "Hex bytes".'); }
};
const inBytes = (s, mode) => (mode === 'Hex bytes' ? hexBytes(s) : te.encode(s));
const BYTES_OPT = sel('bytes', 'Plain side is', ['UTF-8 text', 'Hex bytes']);
const DIR_OPT = sel('dir', 'Direction', ['encode', 'decode']);

// file type from the first bytes: [mime, extension, test]
const MAGIC = [
  ['image/png', 'png', (u) => u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47], ['image/jpeg', 'jpg', (u) => u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff],
  ['image/gif', 'gif', (u) => u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x38], ['image/webp', 'webp', (u) => u[0] === 0x52 && u[1] === 0x49 && u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50],
  ['application/pdf', 'pdf', (u) => u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46], ['application/zip', 'zip', (u) => u[0] === 0x50 && u[1] === 0x4b && (u[2] === 3 || u[2] === 5)],
  ['application/gzip', 'gz', (u) => u[0] === 0x1f && u[1] === 0x8b], ['audio/mpeg', 'mp3', (u) => (u[0] === 0x49 && u[1] === 0x44 && u[2] === 0x33) || (u[0] === 0xff && (u[1] & 0xe0) === 0xe0)],
  ['video/mp4', 'mp4', (u) => u[4] === 0x66 && u[5] === 0x74 && u[6] === 0x79 && u[7] === 0x70], ['font/woff2', 'woff2', (u) => u[0] === 0x77 && u[1] === 0x4f && u[2] === 0x46 && u[3] === 0x32],
  ['font/woff', 'woff', (u) => u[0] === 0x77 && u[1] === 0x4f && u[2] === 0x46 && u[3] === 0x46], ['image/x-icon', 'ico', (u) => u[0] === 0 && u[1] === 0 && u[2] === 1 && u[3] === 0],
  ['audio/ogg', 'ogg', (u) => u[0] === 0x4f && u[1] === 0x67 && u[2] === 0x67 && u[3] === 0x53], ['application/wasm', 'wasm', (u) => u[0] === 0 && u[1] === 0x61 && u[2] === 0x73 && u[3] === 0x6d],
];
const sniff = (u) => {
  const m = MAGIC.find(([, , f]) => u.length > 3 && f(u)); if (m) return { mime: m[0], ext: m[1] };
  try { const s = new TextDecoder('utf-8', { fatal: true }).decode(u.subarray(0, 2048)); if (/^\s*<svg[\s>]|^\s*<\?xml[^>]*\?>\s*<svg/i.test(s)) return { mime: 'image/svg+xml', ext: 'svg' }; if (!/[\x00-\x08\x0e-\x1f]/.test(s)) return { mime: 'text/plain', ext: 'txt' }; } catch { /* binary */ }
  return { mime: 'application/octet-stream', ext: 'bin' };
};
const safeName = (n, d) => (String(n || '').replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '') || d);
const fmtSize = (n) => (n < 1024 ? `${n} bytes` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB (${n} bytes)` : `${(n / 1048576).toFixed(2)} MiB (${n} bytes)`);

// --- Base85
const Z85 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';
function a85enc(u, delim) {
  let out = '';
  for (let i = 0; i < u.length; i += 4) {
    const n = Math.min(4, u.length - i); let v = 0; for (let j = 0; j < 4; j++) v = v * 256 + (j < n ? u[i + j] : 0);
    if (n === 4 && v === 0) { out += 'z'; continue; }
    const c = []; for (let j = 0; j < 5; j++) { c.unshift(v % 85); v = Math.floor(v / 85); }
    out += c.slice(0, n + 1).map((x) => String.fromCharCode(33 + x)).join('');
  }
  return delim ? `<~${out}~>` : out;
}
function a85dec(s) {
  s = s.trim(); if (s.startsWith('<~')) s = s.slice(2); const e = s.indexOf('~>'); if (e >= 0) s = s.slice(0, e);
  s = s.replace(/\s+/g, ''); const out = []; let g = [];
  const flush = (n) => { let v = 0; for (let j = 0; j < 5; j++) v = v * 85 + (j < g.length ? g[j] : 84); if (v > 0xffffffff) throw new Error('Invalid Ascii85: a group is larger than 32 bits.'); const b = [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; out.push(...b.slice(0, n)); g = []; };
  for (const ch of s) {
    if (ch === 'z') { if (g.length) throw new Error('Invalid Ascii85: "z" inside a group.'); out.push(0, 0, 0, 0); continue; }
    const c = ch.charCodeAt(0); if (c < 33 || c > 117) throw new Error(`Invalid Ascii85 character "${ch}". Allowed are ! to u and z.`);
    g.push(c - 33); if (g.length === 5) flush(4);
  }
  if (g.length === 1) throw new Error('Invalid Ascii85: the last group has a single character.');
  if (g.length) flush(g.length - 1);
  return Uint8Array.from(out);
}
function z85enc(u) {
  if (u.length % 4) throw new Error('Z85 needs a multiple of 4 bytes (it has no padding). Use Ascii85 for other lengths.');
  let out = ''; for (let i = 0; i < u.length; i += 4) { let v = ((u[i] << 24) >>> 0) + (u[i + 1] << 16) + (u[i + 2] << 8) + u[i + 3]; const c = []; for (let j = 0; j < 5; j++) { c.unshift(Z85[v % 85]); v = Math.floor(v / 85); } out += c.join(''); } return out;
}
function z85dec(s) {
  s = s.replace(/\s+/g, ''); if (s.length % 5) throw new Error('Z85 text must be a multiple of 5 characters.');
  const out = []; for (let i = 0; i < s.length; i += 5) { let v = 0; for (let j = 0; j < 5; j++) { const k = Z85.indexOf(s[i + j]); if (k < 0) throw new Error(`Invalid Z85 character "${s[i + j]}".`); v = v * 85 + k; } if (v > 0xffffffff) throw new Error('Invalid Z85: a group is larger than 32 bits.'); out.push(v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); }
  return Uint8Array.from(out);
}
tool({
  id: 'base85-ascii85-converter', cat: ENC, title: 'Base85 Converter: Ascii85 and Z85 Encode and Decode',
  desc: 'Encode text or hex bytes to Ascii85 (PostScript, PDF) or Z85 (ZeroMQ), and decode both back, with optional <~ ~> delimiters.',
  labels: ['Input'], sample: 'Man is distinguished',
  opts: [DIR_OPT, sel('variant', 'Variant', ['Ascii85', 'Z85']), chk('delim', 'Add <~ ~> around Ascii85 output', false), BYTES_OPT],
  run: ([s], o) => {
    need(s);
    if (o.dir === 'encode') { const u = inBytes(s, o.bytes); return o.variant === 'Z85' ? z85enc(u) : a85enc(u, o.delim); }
    return textOrHex(o.variant === 'Z85' ? z85dec(s) : a85dec(s), o.bytes);
  },
});

// --- uuencode
function uuenc(u, name, mode) {
  const out = [`begin ${mode} ${name}`], ch = (v) => (v === 0 ? '`' : String.fromCharCode(32 + v));
  for (let i = 0; i < u.length; i += 45) {
    const n = Math.min(45, u.length - i); let line = ch(n);
    for (let j = 0; j < n; j += 3) { const a = u[i + j], b = i + j + 1 < u.length && j + 1 < n ? u[i + j + 1] : 0, c = i + j + 2 < u.length && j + 2 < n ? u[i + j + 2] : 0; line += ch(a >> 2) + ch(((a & 3) << 4) | (b >> 4)) + ch(((b & 15) << 2) | (c >> 6)) + ch(c & 63); }
    out.push(line);
  }
  out.push('`', 'end'); return out.join('\n');
}
function uudec(s) {
  const L = lines(s).map((l) => l.replace(/\s+$/, '')); let name = 'decoded.bin', i = 0;
  const bi = L.findIndex((l) => /^begin\s/.test(l)); if (bi >= 0) { const m = /^begin\s+(?:\d+\s+)?(.*)$/.exec(L[bi]); if (m && m[1]) name = m[1]; i = bi + 1; }
  const out = [];
  for (; i < L.length; i++) {
    const l = L[i]; if (l === 'end') break; if (!l) continue;
    const n = (l.charCodeAt(0) - 32) & 63; if (n === 0) continue;
    const need4 = Math.ceil(n / 3) * 4, body = l.slice(1).padEnd(need4, ' ');
    const v = (k) => (body.charCodeAt(k) - 32) & 63; const bytes = [];
    for (let k = 0; k < need4; k += 4) bytes.push((v(k) << 2) | (v(k + 1) >> 4), ((v(k + 1) & 15) << 4) | (v(k + 2) >> 2), ((v(k + 2) & 3) << 6) | v(k + 3));
    if (l.length - 1 < need4 - 3 || /[^\x20-\x60]/.test(l)) throw new Error(`Line ${i + 1} is not valid uuencoded data.`);
    out.push(...bytes.slice(0, n));
  }
  if (!out.length) throw new Error('No uuencoded data lines found.');
  return { u: Uint8Array.from(out), name };
}
tool({
  id: 'uuencode-decoder', cat: ENC, title: 'UUencode Encoder and Decoder (begin / end Blocks)',
  desc: 'Encode text or bytes to classic uuencoded blocks with begin and end lines, or decode a uuencoded block back to text, hex or a file download.',
  labels: ['Input'], sample: 'The quick brown fox jumps over the lazy dog.',
  opts: [DIR_OPT, txt('name', 'File name in the begin line', 'data.txt'), txt('mode', 'File mode in the begin line', '644'), BYTES_OPT],
  run: ([s], o) => {
    need(s);
    if (o.dir === 'encode') return uuenc(inBytes(s, o.bytes), safeName(o.name, 'data.txt'), /^[0-7]{3,4}$/.test(o.mode) ? o.mode : '644');
    const { u, name } = uudec(s);
    let text; try { text = textOrHex(u, o.bytes); } catch { text = textOrHex(u, 'Hex bytes'); }
    return { text: `${u.length} bytes decoded, file name in header: ${name}\n\n${text}`, blob: new Blob([u], { type: 'application/octet-stream' }), filename: safeName(name, 'decoded.bin') };
  },
});

// --- MIME encoded words (RFC 2047)
const QDEC = (s) => { const out = []; s = s.replace(/_/g, ' '); for (let i = 0; i < s.length; i++) { if (s[i] === '=' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) { out.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; } else out.push(...te.encode(s[i])); } return Uint8Array.from(out); };
function decodeWords(s) {
  const re = /=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g; let last = 0, out = '', prevEnc = false, count = 0, bad = [];
  for (const m of s.matchAll(re)) {
    const gap = s.slice(last, m.index);
    if (!(prevEnc && /^\s*$/.test(gap))) out += gap; // whitespace between two encoded words is dropped
    let cs = m[1].split('*')[0]; let txt;
    try { const u = m[2].toLowerCase() === 'b' ? b64Bytes(m[3]) : QDEC(m[3]); txt = new TextDecoder(cs).decode(u); } catch { txt = m[0]; bad.push(m[1]); }
    out += txt; last = m.index + m[0].length; prevEnc = true; count++;
  }
  out += s.slice(last); return { out, count, bad };
}
function encodeWords(s, cs, kind) {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const words = [], chars = [...s]; let cur = [];
  const enc = (a) => { const u = te.encode(a.join('')); return kind === 'Q' ? '=?' + cs + '?Q?' + [...u].map((b) => (/[A-Za-z0-9!*+\-/]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : b === 32 ? '_' : '=' + b.toString(16).toUpperCase().padStart(2, '0'))).join('') + '?=' : '=?' + cs + '?B?' + b64Str(u) + '?='; };
  for (const c of chars) { if (enc([...cur, c]).length > 75 && cur.length) { words.push(enc(cur)); cur = []; } cur.push(c); }
  if (cur.length) words.push(enc(cur));
  return words.join('\r\n ');
}
tool({
  id: 'mime-encoded-word-decoder', cat: ENC, title: 'MIME Encoded-Word Decoder (=?UTF-8?B?...?= Email Headers)',
  desc: 'Decode =?charset?B?...?= and =?charset?Q?...?= words in email Subject or From headers (RFC 2047), or encode non-ASCII header text.',
  labels: ['Header text'], sample: 'Subject: =?UTF-8?B?SGVsbG8gV8O2cmxkIOKCrA==?= =?UTF-8?Q?_and_caf=C3=A9?=',
  opts: [sel('dir', 'Direction', ['decode', 'encode']), sel('kind', 'Encode with', ['B', 'Q']), txt('cs', 'Charset when encoding', 'UTF-8')],
  run: ([s], o) => {
    need(s, 'a header');
    if (o.dir === 'encode') { const cs = (o.cs || 'UTF-8').trim(); if (!/^utf-8$/i.test(cs)) throw new Error('Encoding is only supported for UTF-8.'); return lines(s).map((l) => encodeWords(l, 'UTF-8', o.kind)).join('\n'); }
    const r = decodeWords(s);
    if (!r.count) throw new Error('No encoded words (=?charset?B?...?=) found.');
    return r.out + (r.bad.length ? `\n\nCould not decode a word with charset: ${[...new Set(r.bad)].join(', ')} (kept as is).` : '');
  },
});

// --- Protobuf wire format without a schema
function readVar(u, p) {
  let v = 0n, s = 0n, n = 0;
  for (;;) { if (p >= u.length) throw new Error('truncated varint'); const b = u[p++]; v |= BigInt(b & 127) << s; n++; if (!(b & 128)) break; s += 7n; if (n > 10) throw new Error('varint longer than 10 bytes'); }
  return [v, p];
}
function pbParse(u, depth) {
  const fields = []; let p = 0;
  while (p < u.length) {
    let key; [key, p] = readVar(u, p); const wt = Number(key & 7n), no = key >> 3n;
    if (no < 1n || no > 536870911n) throw new Error('bad field number');
    if (wt === 0) { let v; [v, p] = readVar(u, p); fields.push({ no, wt, v }); }
    else if (wt === 1) { if (p + 8 > u.length) throw new Error('truncated'); fields.push({ no, wt, b: u.subarray(p, p + 8) }); p += 8; }
    else if (wt === 5) { if (p + 4 > u.length) throw new Error('truncated'); fields.push({ no, wt, b: u.subarray(p, p + 4) }); p += 4; }
    else if (wt === 2) { let l; [l, p] = readVar(u, p); if (l > BigInt(u.length - p)) throw new Error('length past the end'); const n = Number(l); const b = u.subarray(p, p + n); p += n; fields.push({ no, wt, b, sub: null }); }
    else throw new Error('wire type ' + wt + ' (groups) not supported');
  }
  return fields;
}
const printable = (u) => { try { const s = new TextDecoder('utf-8', { fatal: true }).decode(u); return /^[^\x00-\x08\x0e-\x1f\x7f]*$/.test(s) ? s : null; } catch { return null; } };
function pbShow(u, ind, depth) {
  const pad = '  '.repeat(ind), out = [];
  for (const f of pbParse(u, depth)) {
    if (f.wt === 0) { const sz = f.v >= 1n << 63n ? f.v - (1n << 64n) : f.v, zz = (f.v >> 1n) ^ -(f.v & 1n); out.push(`${pad}${f.no}: varint ${f.v}${f.v !== sz ? ` (int64 ${sz})` : ''}${f.v > 1n ? `, zigzag ${zz}` : ''}`); }
    else if (f.wt === 1) { const dv = new DataView(f.b.buffer, f.b.byteOffset, 8); out.push(`${pad}${f.no}: fixed64 u64 ${dv.getBigUint64(0, true)}, i64 ${dv.getBigInt64(0, true)}, double ${dv.getFloat64(0, true)}`); }
    else if (f.wt === 5) { const dv = new DataView(f.b.buffer, f.b.byteOffset, 4); out.push(`${pad}${f.no}: fixed32 u32 ${dv.getUint32(0, true)}, i32 ${dv.getInt32(0, true)}, float ${dv.getFloat32(0, true)}`); }
    else {
      const t = f.b.length ? printable(f.b) : null; let nested = null;
      if (f.b.length && depth < 8) { try { nested = pbShow(f.b, ind + 1, depth + 1); } catch { nested = null; } }
      if (t !== null && f.b.length) out.push(`${pad}${f.no}: string ${JSON.stringify(t)}${nested ? ' (could also be a nested message)' : ''}`);
      else if (nested) out.push(`${pad}${f.no}: message {\n${nested}\n${pad}}`);
      else out.push(`${pad}${f.no}: bytes (${f.b.length}) ${hex2(f.b.subarray(0, 64))}${f.b.length > 64 ? '...' : ''}`);
    }
  }
  return out.join('\n');
}
tool({
  id: 'protobuf-raw-decoder', cat: ENC, title: 'Protobuf Raw Decoder (Wire Format Without a Schema)',
  desc: 'Paste protobuf bytes as hex or Base64 and see each field number, wire type and a best-guess reading: varint, fixed, string, nested message or bytes.',
  labels: ['Protobuf bytes (hex or Base64)'], sample: '08 96 01 12 07 74 65 73 74 69 6e 67 1a 03 08 96 01 25 db 0f 49 40',
  opts: [sel('enc', 'Input is', ['auto', 'hex', 'base64'])],
  run: ([s], o) => {
    need(s, 'protobuf bytes'); const t = s.trim().replace(/^data:[^,]*,/, '');
    const isHex = o.enc === 'hex' || (o.enc === 'auto' && /^(0x)?[0-9a-fA-F\s:,]+$/.test(t) && t.replace(/0x|[\s:,]/g, '').length % 2 === 0);
    const u = isHex ? hexBytes(t) : b64Bytes(t);
    let r; try { r = pbShow(u, 0, 0); } catch (e) { throw new Error('Not valid protobuf wire format: ' + e.message + '. Check the input type.'); }
    return `${u.length} bytes\n\n${r || '(empty message)'}\n\nWithout the .proto file the types are guesses: a varint may be an int, a bool, an enum or a zigzag sint, a length-delimited field may be a string, bytes or a message. Field names are not in the data.`;
  },
});

// --- Bencode
function bparse(u, p, spans, depth = 0) {
  if (depth > 64) throw new Error('nesting too deep'); const c = u[p];
  if (c === 0x69) { const e = u.indexOf(0x65, p); if (e < 0) throw new Error('integer without closing "e" at byte ' + p); const s = String.fromCharCode(...u.subarray(p + 1, e)); if (!/^(0|-?[1-9]\d*)$/.test(s)) throw new Error(`bad integer "${s}" at byte ${p}`); return [BigInt(s), e + 1]; }
  if (c === 0x6c || c === 0x64) {
    const isD = c === 0x64, arr = []; let q = p + 1;
    while (u[q] !== 0x65) { if (q >= u.length) throw new Error((isD ? 'dictionary' : 'list') + ' without closing "e"'); let k; [k, q] = bparse(u, q, null, depth + 1); if (isD) { if (!(k instanceof Uint8Array)) throw new Error('dictionary key is not a string at byte ' + q); const vs = q; let v; [v, q] = bparse(u, q, null, depth + 1); arr.push([k, v]); if (spans) spans[new TextDecoder('latin1').decode(k)] = [vs, q]; } else arr.push(k); }
    return [isD ? { d: arr } : arr, q + 1];
  }
  if (c >= 0x30 && c <= 0x39) { const e = u.indexOf(0x3a, p); if (e < 0) throw new Error('string length without ":" at byte ' + p); const len = Number(String.fromCharCode(...u.subarray(p, e))); if (!Number.isSafeInteger(len) || e + 1 + len > u.length) throw new Error('string longer than the data at byte ' + p); return [u.subarray(e + 1, e + 1 + len), e + 1 + len]; }
  throw new Error(`unexpected byte 0x${(c ?? 0).toString(16)} at position ${p}`);
}
const bstr = (b) => { const t = printable(b); return t !== null ? t : null; };
function bshow(v, ind, key) {
  const pad = '  '.repeat(ind);
  if (typeof v === 'bigint') return String(v);
  if (v instanceof Uint8Array) { if (key === 'pieces') return `<${v.length} bytes, ${v.length / 20} SHA-1 piece hashes>`; const t = bstr(v); return t !== null ? JSON.stringify(t) : `<${v.length} bytes: ${hex2(v.subarray(0, 24))}${v.length > 24 ? '...' : ''}>`; }
  if (Array.isArray(v)) return v.length ? '[\n' + v.map((x) => pad + '  ' + bshow(x, ind + 1)).join(',\n') + '\n' + pad + ']' : '[]';
  return v.d.length ? '{\n' + v.d.map(([k, x]) => `${pad}  ${JSON.stringify(bstr(k) ?? hex2(k))}: ${bshow(x, ind + 1, bstr(k))}`).join(',\n') + '\n' + pad + '}' : '{}';
}
const dget = (d, k) => { const e = d.d.find(([kk]) => bstr(kk) === k); return e ? e[1] : undefined; };
tool({
  id: 'bencode-decoder', cat: ENC, title: 'Bencode Decoder and .torrent Viewer',
  desc: 'Decode bencoded data from pasted text or a .torrent file into a readable tree, with tracker, files, size and info hash for torrents.',
  labels: ['Bencode text (or choose a .torrent file)'], sample: (() => { const b = (x) => `${x.length}:${x}`; return `d${b('announce')}${b('http://tracker.example/announce')}${b('comment')}${b('hello')}${b('info')}d${b('length')}i12e${b('name')}${b('hello.txt')}${b('piece length')}i16384e${b('pieces')}${b('A'.repeat(20))}ee`; })(),
  file: { accept: '.torrent,application/x-bittorrent', multiple: false, optional: true }, dom: true,
  run: async ([s], _o, files) => {
    let u; if (files && files[0]) u = new Uint8Array(await files[0].arrayBuffer()); else u = te.encode(need(s, 'bencode text or choose a file'));
    const spans = {}; let v, end;
    try { [v, end] = bparse(u, 0, spans); } catch (e) { throw new Error('Not valid bencode: ' + e.message); }
    let sum = '';
    if (v && v.d) {
      const info = dget(v, 'info');
      if (info && info.d) {
        const name = bstr(dget(info, 'name') || new Uint8Array()) ?? '', len = dget(info, 'length'), fl = dget(info, 'files'), pl = dget(info, 'piece length'), pc = dget(info, 'pieces');
        let total = len, listing = '';
        if (Array.isArray(fl)) { total = 0n; listing = '\nFiles:\n' + fl.map((f) => { const sz = dget(f, 'length') || 0n; total += typeof sz === 'bigint' ? sz : 0n; return `  ${sz}  ${(dget(f, 'path') || []).map((x) => bstr(x) ?? '?').join('/')}`; }).join('\n'); }
        let ih = ''; if (spans.info && globalThis.crypto?.subtle) { ih = hex2(new Uint8Array(await crypto.subtle.digest('SHA-1', u.subarray(spans.info[0], spans.info[1])))); }
        const ann = dget(v, 'announce'), cd = dget(v, 'creation date'), cb = dget(v, 'created by');
        sum = [`Torrent summary`, `Name: ${name}`, ann ? `Tracker: ${bstr(ann) ?? '?'}` : '', cd && typeof cd === 'bigint' ? `Created: ${new Date(Number(cd) * 1000).toISOString()}` : '', cb ? `Created by: ${bstr(cb) ?? '?'}` : '', total != null ? `Total size: ${total} bytes` : '', pl ? `Piece length: ${pl}` : '', pc instanceof Uint8Array ? `Pieces: ${pc.length / 20}${pc.length % 20 ? ' (length is not a multiple of 20: review)' : ''}` : '', ih ? `Info hash (SHA-1 of the info dictionary as stored): ${ih}` : '', ih ? `Magnet: magnet:?xt=urn:btih:${ih}&dn=${encodeURIComponent(name)}` : '', listing].filter(Boolean).join('\n') + '\n\n';
      }
    }
    return `${sum}${bshow(v, 0)}${end < u.length ? `\n\nWarning: ${u.length - end} extra bytes after the first value.` : ''}`;
  },
});

// --- Data URI
function parseDataUri(s) {
  const t = s.trim().replace(/^url\(\s*['"]?|['"]?\s*\)$/g, '').replace(/^['"]|['"]$/g, '');
  const m = /^data:([^,]*),([\s\S]*)$/i.exec(t); if (!m) throw new Error('Not a data: URI. It must look like data:[type][;base64],data');
  const parts = m[1].split(';'), b64 = parts.length && /^base64$/i.test(parts[parts.length - 1]); if (b64) parts.pop();
  let mime = 'text/plain', params = []; if (parts.length) { if (parts[0] === '' || parts[0].includes('=')) params = parts.filter(Boolean); else { mime = parts[0].toLowerCase(); params = parts.slice(1); } }
  const raw = m[2]; let bytes;
  if (b64) { let d; try { d = decodeURIComponent(raw); } catch { d = raw; } bytes = b64Bytes(d); }
  else { const out = []; for (let i = 0; i < raw.length; i++) { if (raw[i] === '%' && /^[0-9a-fA-F]{2}$/.test(raw.slice(i + 1, i + 3))) { out.push(parseInt(raw.slice(i + 1, i + 3), 16)); i += 2; } else out.push(...te.encode(raw[i])); } bytes = Uint8Array.from(out); }
  return { mime, params, b64, raw, bytes };
}
tool({
  id: 'data-uri-inspector', cat: ENC, title: 'Data URI Inspector: Type, Size and Decoded Preview',
  desc: 'Parse a data: URI and see its MIME type, charset, encoding, decoded size, overhead and a type check against the real bytes, with an image preview.',
  labels: ['data: URI'], sample: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  run: ([s]) => {
    need(s, 'a data URI'); const d = parseDataUri(s), sn = sniff(d.bytes), cs = (d.params.find((p) => /^charset=/i.test(p)) || '').slice(8);
    const lines_ = [`Declared type: ${d.mime}${d.params.length ? ' ; ' + d.params.join(' ; ') : ''}`, `Charset: ${cs || (d.mime.startsWith('text/') ? 'US-ASCII (default for data: URIs)' : 'not given')}`, `Encoding: ${d.b64 ? 'base64' : 'percent-encoded'}`, `Encoded payload: ${d.raw.length} characters`, `Decoded size: ${fmtSize(d.bytes.length)}`, d.b64 && d.bytes.length ? `Base64 overhead: ${(((d.raw.length - d.bytes.length) / d.bytes.length) * 100).toFixed(0)}% larger than the bytes` : '', `Type detected from the bytes: ${sn.mime}`];
    const match = d.mime === sn.mime || (d.mime.startsWith('text/') && sn.mime === 'text/plain') || (d.mime.includes('json') || d.mime.includes('xml') || d.mime.includes('javascript') || d.mime.includes('svg')) && sn.mime === 'text/plain';
    if (!match) lines_.push(`Review: the declared type (${d.mime}) does not match what the bytes look like (${sn.mime}).`);
    if (/html|javascript|svg/.test(d.mime)) lines_.push('Note: this type can contain scripts. Most browsers block top-level navigation to data: URLs, but do not open untrusted ones.');
    const tx = printable(d.bytes.subarray(0, 4000)); const prev = tx !== null && d.bytes.length ? `\nText preview:\n${tx.slice(0, 600)}${tx.length > 600 || d.bytes.length > 4000 ? '\n...' : ''}` : '';
    const res = { text: lines_.filter(Boolean).join('\n') + prev };
    if (/^image\/(png|jpeg|gif|webp|svg\+xml|x-icon)$/.test(sn.mime)) { res.blob = new Blob([d.bytes], { type: sn.mime }); res.filename = 'decoded.' + sn.ext; }
    return res;
  },
});

// --- File to data URI / Base64 to file
tool({
  id: 'file-to-data-uri', cat: ENC, title: 'File to Base64 Data URI Converter (Any File Type)',
  desc: 'Turn any file into a data: URI, raw Base64, a CSS url() value or an HTML tag. The file stays in your browser.',
  inputs: 0, file: { accept: '*/*', multiple: false }, dom: true,
  opts: [sel('as', 'Output as', ['data URI', 'raw Base64', 'CSS url()', 'HTML tag (img, audio, video or link)'])],
  run: async (_i, o, files) => {
    const f = files && files[0]; if (!f) throw new Error('Choose a file.');
    const u = new Uint8Array(await f.arrayBuffer()), mime = f.type || sniff(u).mime, b = b64Str(u), uri = `data:${mime};base64,${b}`;
    const tag = mime.startsWith('image/') ? `<img src="${uri}" alt="">` : mime.startsWith('audio/') ? `<audio controls src="${uri}"></audio>` : mime.startsWith('video/') ? `<video controls src="${uri}"></video>` : `<a download="${safeName(f.name, 'file')}" href="${uri}">${safeName(f.name, 'file')}</a>`;
    const body = o.as === 'raw Base64' ? b : o.as === 'CSS url()' ? `url("${uri}")` : o.as.startsWith('HTML') ? tag : uri;
    return `File: ${f.name}\nType: ${mime}\nSize: ${fmtSize(u.length)}; output: ${body.length} characters${body.length > 100000 ? '\nNote: large data URIs bloat HTML and CSS and cannot be cached on their own. A normal file is usually better above ~10 KB.' : ''}\n\n${body}`;
  },
});
tool({
  id: 'base64-to-file', cat: ENC, title: 'Base64 to File Downloader (Any File Type)',
  desc: 'Decode a Base64, Base64URL or data: URI string and download the bytes as a file, with the file type detected from the content.',
  labels: ['Base64 or data URI'], sample: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  opts: [txt('name', 'File name without extension', 'decoded')],
  run: ([s], o) => {
    need(s, 'Base64'); const t = s.trim(); let u, hint = '';
    if (/^data:/i.test(t)) { const d = parseDataUri(t); u = d.bytes; hint = d.mime; } else u = b64Bytes(t.replace(/^"|"$/g, ''));
    if (!u.length) throw new Error('The input decodes to zero bytes.');
    const sn = sniff(u), name = safeName(o.name, 'decoded') + '.' + sn.ext;
    return { text: `Decoded ${fmtSize(u.length)}\nType detected from the bytes: ${sn.mime}${hint && hint !== sn.mime ? `\nThe data: URI said ${hint}: review.` : ''}\nSaved as: ${name}\nFirst bytes: ${hex2(u.subarray(0, 16))}`, blob: new Blob([u], { type: sn.mime }), filename: name };
  },
});

// ---------- code re-indenters ----------
// Honest limits: these fix indentation, blank lines and (optionally) line breaks. They do not wrap long lines, reorder
// imports or rewrite spacing inside a line, so the output is not byte-identical to gofmt, rustfmt, Prettier or clang-format.
const CLANG = { lc: ['//'], bc: true, str: ['"'], chr: ["'"] };
const LANGS = {
  go: { name: 'Go', ...CLANG, raw: true, ind: 'tab', caseGo: true },
  rust: { name: 'Rust', lc: ['//'], bc: true, nest: true, str: ['"'], rustChr: true, rawR: true, ind: 4 },
  java: { name: 'Java', ...CLANG, tb: true, ind: 4, caseC: true },
  c: { name: 'C/C++', ...CLANG, pp: true, cppRaw: true, ind: 2, caseC: true },
  php: { name: 'PHP', lc: ['//', '#'], bc: true, str: ['"', "'"], php: true, ind: 4, caseC: true },
  ts: { name: 'TypeScript', lc: ['//'], bc: true, str: ['"', "'"], tpl: true, regex: true, ind: 2, caseC: true },
};
const isWord = (c) => /[\w$]/.test(c || '');
function scanLang(src, L) {
  const lines = [], n = src.length; let i = 0, st = L.php ? 'html' : 'code', q = '', nest = 0, endp = '', hid = '', raw = '', mask = '', inside = null, prev = '';
  const push = () => { lines.push({ raw, mask, inside }); raw = ''; mask = ''; inside = ['bc', 'raw', 'tpl', 'heredoc', 'html'].includes(st) ? st : null; };
  const lit = (s) => { raw += s; mask += '\x01'.repeat(s.length); }, cmt = (s) => { raw += s; mask += '\0'.repeat(s.length); };
  while (i < n) {
    const c = src[i];
    if (c === '\r' && src[i + 1] === '\n') { i++; continue; }
    if (c === '\n' || c === '\r') { if (st === 'lc' || st === 'str') st = 'code'; push(); i++; continue; }
    if (st === 'heredoc' && raw === '') { const m = new RegExp('^[ \\t]*' + hid + '(?!\\w)').exec(src.slice(i, i + hid.length + 80)); if (m) { lit(m[0]); i += m[0].length; st = 'code'; continue; } }
    if (st === 'html') { const m = /^<\?(?:php\b|=)?/i.exec(src.slice(i, i + 6)); if (m) { lit(m[0]); i += m[0].length; st = 'code'; continue; } lit(c); i++; continue; }
    if (st === 'lc') { cmt(c); i++; continue; }
    if (st === 'bc') {
      if (L.nest && src.startsWith('/*', i)) { nest++; cmt('/*'); i += 2; continue; }
      if (src.startsWith('*/', i)) { cmt('*/'); i += 2; if (--nest <= 0) st = 'code'; continue; }
      cmt(c); i++; continue;
    }
    if (st === 'str') { if (c === '\\' && i + 1 < n && src[i + 1] !== '\n' && src[i + 1] !== '\r') { lit(c + src[i + 1]); i += 2; continue; } lit(c); if (c === q) st = 'code'; i++; continue; }
    if (st === 'tpl') { if (c === '\\' && i + 1 < n && src[i + 1] !== '\n') { lit(c + src[i + 1]); i += 2; continue; } lit(c); if (c === '`') st = 'code'; i++; continue; }
    if (st === 'raw') { if (src.startsWith(endp, i)) { lit(endp); i += endp.length; st = 'code'; continue; } lit(c); i++; continue; }
    // code
    if (L.php && src.startsWith('?>', i)) { lit('?>'); i += 2; st = 'html'; continue; }
    const lcm = L.lc && L.lc.find((p) => src.startsWith(p, i) && !(L.php && p === '#' && src[i + 1] === '[')); if (lcm) { st = 'lc'; cmt(c); i++; continue; }
    if (L.bc && src.startsWith('/*', i)) { st = 'bc'; nest = 1; cmt('/*'); i += 2; continue; }
    if (L.tb && src.startsWith('"""', i)) { st = 'raw'; endp = '"""'; lit('"""'); i += 3; continue; }
    if (L.cppRaw) { const m = /^(?:u8|u|U|L)?R"([^ ()\\\t\n]{0,16})\(/.exec(src.slice(i, i + 30)); if (m && !isWord(prev)) { st = 'raw'; endp = ')' + m[1] + '"'; lit(m[0]); i += m[0].length; continue; } }
    if (L.rawR && (c === 'r' || c === 'b') && !isWord(prev)) { const m = /^b?r(#*)"/.exec(src.slice(i, i + 24)); if (m) { st = 'raw'; endp = '"' + m[1]; lit(m[0]); i += m[0].length; continue; } }
    if (L.php && src.startsWith('<<<', i)) { const m = /^<<<[ \t]*(['"]?)(\w+)\1/.exec(src.slice(i, i + 80)); if (m) { st = 'heredoc'; hid = m[2]; lit(m[0]); i += m[0].length; continue; } }
    if (L.raw && c === '`') { st = 'raw'; endp = '`'; lit(c); i++; continue; }
    if (L.tpl && c === '`') { st = 'tpl'; lit(c); i++; continue; }
    if (L.rustChr && c === "'") { const m = /^'(?:\\(?:u\{[0-9a-fA-F_]+\}|x[0-9a-fA-F]{2}|.)|[^'\\\n])'/.exec(src.slice(i, i + 14)); if (m) { lit(m[0]); i += m[0].length; prev = "'"; continue; } }
    if (L.str.includes(c) || (L.chr && L.chr.includes(c))) { st = 'str'; q = c; lit(c); i++; continue; }
    if (L.regex && c === '/' && src[i + 1] !== '/' && src[i + 1] !== '*' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /(?:^|[^\w$])(?:return|typeof|case|in|of)\s*$/.test(raw))) {
      let j = i + 1, cls = false; for (; j < n && src[j] !== '\n'; j++) { if (src[j] === '\\') { j++; continue; } if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; }
      if (j < n && src[j] === '/') { j++; while (/[a-z]/i.test(src[j] || '')) j++; lit(src.slice(i, j)); i = j; prev = '/'; continue; }
    }
    raw += c; mask += c; if (!/\s/.test(c)) prev = c; i++;
  }
  push(); return lines;
}
// insert line breaks after { and ; and around }, collapse spaces in code (only whitespace changes)
function breakLines(src, L, go) {
  const ls = scanLang(src, L), chars = [], code = [];
  ls.forEach((l, k) => { for (let x = 0; x < l.raw.length; x++) { chars.push(l.raw[x]); code.push(l.mask[x] !== '\0' && l.mask[x] !== '\x01'); } if (k < ls.length - 1) { chars.push('\n'); code.push(true); } });
  const out = [], stack = []; let cur = '';
  const nextCode = (i) => { let j = i + 1; while (j < chars.length && code[j] && /[ \t]/.test(chars[j])) j++; return j; };
  const isCmtAt = (j) => j < chars.length && !code[j];
  const nl = () => { out.push(cur.replace(/[ \t]+$/, '')); cur = ''; };
  const top = () => stack[stack.length - 1];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (!code[i]) { cur += c; continue; }
    if (c === '\n') { nl(); continue; }
    if (c === ' ' || c === '\t') { if (cur !== '' && !/[ \t]$/.test(cur)) cur += ' '; continue; }
    if (c === '{') {
      const pc = cur.replace(/\s+$/, '').slice(-1), head = cur.trim();
      const inline = (top() && top().inl && (go || pc !== ')')) || pc === '=' || pc === ',' || pc === '(' || (pc === ']' && !go) || (pc === ':' && !L.php && false) || (go && /[\w\]}]$/.test(cur) && head !== '');
      if (cur && !/[\s(\[{$]$/.test(cur) && !(inline && go)) cur += ' ';
      const j = nextCode(i);
      if (chars[j] === '}' && code[j]) { cur += '{}'; i = j; continue; }
      cur += '{';
      if (inline) { stack.push({ c: '[', inl: true }); continue; }
      stack.push({ c: '{' });
      if (!isCmtAt(j) && chars[j] !== '\n') nl();
      continue;
    }
    if (c === '}') {
      const t0 = top();
      if (t0 && t0.inl) { stack.pop(); cur += '}'; continue; }
      if (cur.trim()) nl();
      stack.pop(); cur += '}'; const j = nextCode(i); const rest = chars.slice(j, j + 8).join('');
      if (!(go ? /^[;,)\].({]/ : /^[;,)\].(]/).test(rest) && !/^(else|catch|finally|while)\b/.test(rest) && chars[j] !== '\n' && !isCmtAt(j) && j < chars.length) nl();
      continue;
    }
    if (c === '(' || c === '[') stack.push({ c });
    if (c === ')' || c === ']') stack.pop();
    if (cur.endsWith('}') && isWord(c)) cur += ' ';
    cur += c;
    const t1 = top();
    if (c === ';' && (!t1 || t1.c === '{')) {
      if (go && /^\s*(\}\s*else\s+)?(for|if|switch)\b/.test(cur)) continue;
      const j = nextCode(i); if (!isCmtAt(j) && chars[j] !== '\n' && j < chars.length) nl();
    } else if (c === ':' && chars[i + 1] !== '=' && (!t1 || t1.c === '{') && L.caseC | L.caseGo && /^\s*(case\b.*|default)\s*:$/.test(cur)) {
      const j = nextCode(i); if (!isCmtAt(j) && chars[j] !== '\n' && j < chars.length) nl();
    }
  }
  nl(); return out.join('\n');
}
function reindent(src, L, o) {
  const unit = o.indent === 'tab' ? '\t' : o.indent === '2 spaces' ? '  ' : o.indent === '4 spaces' ? '    ' : L.ind === 'tab' ? '\t' : ' '.repeat(L.ind);
  let text = src.replace(/^﻿/, '');
  if (o.breaks === 'break lines at { } ;') text = breakLines(text, L, L === LANGS.go);
  const ls = scanLang(text, L), out = []; let blank = 0, cont = false, ppCont = false, stack = [], prevCmt = false, id = 0, stmt = 0, where = false; const caseSet = new Set();
  const lvl = () => { let n = 0, last = -1; for (const x of stack) if (x !== last) { n++; last = x; } return n; };
  for (const ln of ls) {
    const t = ln.raw.trim(), m = ln.mask.replace(/\0/g, ' ').trim();
    id++;
    const walk = (from) => { for (const ch of ln.mask.slice(from)) { if ('({['.includes(ch)) stack.push(id); else if (')}]'.includes(ch)) stack.pop(); } };
    if (ppCont) { out.push({ s: ln.raw.replace(/\s+$/, '') }); ppCont = /\\\s*$/.test(ln.raw); blank = 0; continue; }
    if (ln.inside && ln.inside !== 'html') {
      cont = false;
      if (ln.inside === 'bc') {
        const star = /^\*/.test(t) && prevCmt;
        out.push(star ? { s: t, lv: () => lvl(), pad: ' ' } : { s: ln.raw.replace(/\s+$/, '') });
        prevCmt = /^(\/\*|\*)/.test(t) && !/\*\/\s*$/.test(t) || (star && !/\*\/\s*$/.test(t)) ? true : /^\/\*|^\*/.test(t);
      } else { out.push({ s: ln.raw }); prevCmt = false; }
      walk(0); blank = 0; continue;
    }
    prevCmt = /^\/\*/.test(t) && !/\*\/\s*$/.test(t);
    if (ln.inside === 'html') { out.push({ s: ln.raw }); walk(0); blank = 0; continue; }
    if (!t) { blank++; continue; }
    if (L.pp && t.startsWith('#')) { if (blank && out.length) out.push({ s: '' }); out.push({ s: t }); if (/\\\s*$/.test(t)) ppCont = true; blank = 0; continue; }
    if (blank && out.length) out.push({ s: '' });
    blank = 0;
    if (!m) { out.push({ t, cmt: true, lv: lvl() + [...caseSet].filter((k) => k <= lvl()).length, w: /^\s*/.exec(ln.raw)[0].replace(/\t/g, '    ').length }); continue; }
    let lead = 0; while (lead < m.length && /[)}\]]/.test(m[lead])) { stack.pop(); lead++; }
    const nd = lvl(); for (const k of [...caseSet]) if (k > nd) caseSet.delete(k);
    const isCase = L.caseC && /^(case\b[^;]*:|default\s*:)/.test(m), isCaseGo = L.caseGo && /^(case\b|default\s*:)/.test(m), isLabel = L.caseGo && /^[A-Za-z_]\w*:$/.test(m);
    const extra = [...caseSet].filter((k) => (isCase ? k < nd : k <= nd)).length;
    let level = nd + extra - (isCaseGo || isLabel ? 1 : 0);
    let wh = false;
    if (L === LANGS.rust) { if (where) { if (/^\{/.test(m)) where = false; else wh = true; } if (!where && /^where\b/.test(m)) where = true; if (where && (/[{;]$/.test(m) || /^\{/.test(m)) && !/^where\b/.test(m)) where = false; if (where && /^where\b/.test(m) && /[{;]$/.test(m)) where = false; }
    const chain = ((cont || /^\.(?!\.)/.test(m)) && !lead) || wh;
    if (chain) level = Math.max(level, stmt + 1); else stmt = level;
    out.push({ t, lv: Math.max(0, level), code: true, w: /^\s*/.exec(ln.raw)[0].replace(/\t/g, '    ').length, label: isCase || isCaseGo });
    if (isCase) caseSet.add(nd);
    { const ms = ln.mask.replace(/\0/g, ' '); walk(ms.length - ms.trimStart().length + lead); }
    const last = m.replace(/\x01+/g, 'x').replace(/\s+$/, '').slice(-2);
    cont = /(?:&&|\|\||[+\-*/%?]|[^=!<>]=|\.)$/.test(last) && !/(\+\+|--|\*\/)$/.test(last) && !/[{(\[]$/.test(last);
  }
  // comment-only lines take the indent of the next code line, unless that line closes a block
  const closing = (k) => { for (let j = k + 1; j < out.length; j++) { if (out[j].code) return /^[)}\]]/.test(out[j].t); if (out[j].s !== undefined && out[j].s === '') continue; if (!out[j].cmt) return false; } return true; };
  const res = out.map((e, k) => {
    if (e.s !== undefined && !e.pad) return e.s;
    if (e.pad) return unit.repeat(Math.max(0, e.lv())) + e.pad + e.s;
    if (e.cmt) { let j = k + 1; while (j < out.length && !out[j].code && (out[j].s === '' || out[j].cmt)) j++; const nx = out[j]; const lv = nx && nx.code && !closing(k) ? (nx.label && e.w > nx.w ? nx.lv + 1 : nx.lv) : e.lv; return unit.repeat(Math.max(0, lv)) + e.t; }
    return unit.repeat(e.lv) + e.t;
  });
  while (res.length && res[res.length - 1] === '') res.pop();
  return res.join('\n') + '\n';
}
const IND_OPT = sel('indent', 'Indent with', ['language default', '2 spaces', '4 spaces', 'tab']);
const BRK_OPT = sel('breaks', 'Line breaks', ['keep my line breaks', 'break lines at { } ;']);
const fmtTool = (id, L, title, desc, sample, extraOpts = []) => tool({
  id, cat: FMT, title, desc, labels: [L.name + ' code'], sample, opts: [IND_OPT, BRK_OPT, ...extraOpts],
  run: ([s], o) => { need(s, L.name + ' code'); return reindent(s, L, o); },
});
fmtTool('typescript-formatter', LANGS.ts, 'TypeScript Formatter: Re-indent and Break Lines (No Prettier)', 'Re-indent TypeScript or JavaScript by brace depth, fix blank lines and optionally break minified code into lines. Strings, templates, regexes and comments are left alone.',
  'interface User {\nid: number;\n   name?: string }\nexport async function load<T extends User>(ids: number[]): Promise<T[]> {\nconst out: T[] = [];\n      for (const id of ids) {\nif (id > 0) {\n out.push(await fetch(`/api/${id}`) as T)\n}\n        }\n    return out;\n}\nswitch (mode) {\ncase "a":\nrun();\nbreak;\ndefault:\nstop();\n}');
fmtTool('go-formatter', LANGS.go, 'Go Code Formatter: Re-indent with Tabs (gofmt-Style Layout)', 'Re-indent Go source with tabs the way gofmt lays out blocks and switch cases, fix blank lines and optionally break one-line code. It does not align comments or struct fields.',
  'package main\nimport "fmt"\ntype P struct {\nName string\n  Age int\n}\nfunc main() {\n  for i := 0; i < 3; i++ {\n      switch {\n      case i == 1:\n      fmt.Println("one")\n  default:\n    fmt.Println(i)\n      }\n  }\n   s := `raw\n  text`\n  fmt.Println(s)\n}');
fmtTool('rust-formatter', LANGS.rust, 'Rust Code Formatter: Re-indent Blocks (No rustfmt)', 'Re-indent Rust code by brace depth with 4 spaces, keep lifetimes, raw strings and nested comments intact, and optionally break minified code into lines. It does not wrap long lines.',
  'use std::collections::HashMap;\nstruct P<\'a> { name: &\'a str,\n   age: u32 }\nfn main() {\nlet mut m: HashMap<&str, u32> = HashMap::new();\n      m.insert("a", 1);\nfor (k, v) in &m {\nprintln!("{} {}", k, v);\n   }\n    let c = \'x\';\n    match c {\n   \'x\' => {\nprintln!("x");\n   }\n _ => {}\n    }\n}');
fmtTool('java-formatter', LANGS.java, 'Java Code Formatter: Re-indent Classes and Methods', 'Re-indent Java by brace depth with 4 spaces, indent switch cases, keep text blocks and comments, and optionally break one-line code. It does not wrap lines or sort imports.',
  'public class Demo {\nprivate int x;\n  public int get() {\nreturn x;\n      }\n   public static void main(String[] args) {\nfor (int i = 0; i < 3; i++) {\nswitch (i) {\ncase 1:\nSystem.out.println("one");\nbreak;\ndefault:\nSystem.out.println(i);\n}\n   }\n  }\n}');
fmtTool('c-cpp-formatter', LANGS.c, 'C and C++ Code Formatter: Re-indent Blocks (No clang-format)', 'Re-indent C or C++ by brace depth with 2 spaces, keep preprocessor lines at column 0, indent switch cases and keep raw strings. It does not apply clang-format style presets.',
  '#include <stdio.h>\n#define SQ(x) \\\n  ((x) * (x))\nint main(void) {\nint i;\n      for (i = 0; i < 3; i++) {\nswitch (i) {\ncase 1:\nprintf("one\\n");\nbreak;\ndefault:\nprintf("%d\\n", SQ(i));\n}\n  }\nreturn 0;\n}');
fmtTool('php-formatter', LANGS.php, 'PHP Code Formatter: Re-indent PHP Inside <?php Tags', 'Re-indent PHP code by brace depth with 4 spaces. Text outside PHP tags, heredocs and comments are left alone. Optionally break one-line code. It does not apply PSR-12 spacing rules.',
  '<?php\nclass Demo {\nprivate $x = 1;\n  public function get() {\nreturn $this->x;\n      }\n   public function run($m) {\nswitch ($m) {\ncase "a":\necho "a";\nbreak;\ndefault:\necho "other";\n}\n  }\n}\n?>\n<p>Plain HTML stays as it is.</p>');

// ---------- Lua ----------
const LUA_IN = /\b(function|if|for|while|repeat|do|then|elseif|else|end|until)\b/g;
function luaTokens(line, st) { // returns { toks, st } with strings and comments removed; st carries multi-line [[ ]] state
  let out = '', i = 0;
  while (i < line.length) {
    if (st) { const e = line.indexOf(st, i); if (e < 0) return { toks: out, st }; i = e + st.length; st = ''; out += ' '; continue; }
    const c = line[i];
    if (c === '-' && line[i + 1] === '-') { const m = /^--\[(=*)\[/.exec(line.slice(i)); if (m) { st = ']' + m[1] + ']'; i += m[0].length; continue; } break; }
    if (c === '[') { const m = /^\[(=*)\[/.exec(line.slice(i)); if (m) { st = ']' + m[1] + ']'; i += m[0].length; continue; } }
    if (c === '"' || c === "'") { let j = i + 1; while (j < line.length && line[j] !== c) { if (line[j] === '\\') j++; j++; } i = j + 1; out += ' '; continue; }
    out += c; i++;
  }
  return { toks: out, st };
}
tool({
  id: 'lua-formatter', cat: FMT, title: 'Lua Code Formatter: Re-indent function, if, for and end Blocks',
  desc: 'Re-indent Lua scripts by block keywords (function, if, for, while, repeat, end, until) and brackets. Strings, long strings and comments are not touched.',
  labels: ['Lua code'], sample: 'local function greet(name)\nif name == nil then\nreturn "hi"\nelseif #name > 3 then\n  for i = 1, 3 do\nprint(name, i)\n      end\nelse\nlocal t = {\n a = 1,\n  b = 2 }\nreturn t.a\nend\nend\n-- comment\nprint(greet("Lua"))',
  opts: [sel('indent', 'Indent with', ['2 spaces', '4 spaces', 'tab'])],
  run: ([s], o) => {
    need(s, 'Lua code'); const unit = o.indent === 'tab' ? '\t' : o.indent === '4 spaces' ? '    ' : '  ';
    let depth = 0, st = '', expectDo = false, blank = 0; const out = [];
    for (const raw of lines(s.replace(/^\uFEFF/, ''))) {
      const t = raw.trim(), inLong = st !== '';
      const r = luaTokens(raw, st); st = r.st;
      if (inLong) { out.push(raw.replace(/\s+$/, '')); blank = 0; continue; }
      if (!t) { blank++; continue; }
      if (blank && out.length) out.push(''); blank = 0;
      // events in order
      const ev = []; const re = /\b(function|if|for|while|repeat|do|elseif|else|end|until)\b|[({[]|[)}\]]/g; let m;
      while ((m = re.exec(r.toks))) ev.push(m[0]);
      let d = depth, lineIndent = null, leading = true;
      const evPos = []; { const re2 = /\b(function|if|for|while|repeat|do|elseif|else|end|until)\b|[({[]|[)}\]]/g; let mm; while ((mm = re2.exec(r.toks))) evPos.push(mm.index); }
      for (let ei = 0; ei < ev.length; ei++) {
        const e = ev[ei];
        if (leading && r.toks.slice(0, evPos[ei]).replace(/[)}\]]|\b(end|until|else|elseif)\b/g, '').trim() !== '') leading = false;
        const closer = e === 'end' || e === 'until' || e === ')' || e === '}' || e === ']', mid = e === 'else' || e === 'elseif';
        if (leading && (closer || mid)) { d--; lineIndent = d; if (mid) d++; continue; }
        leading = false;
        if (closer) d--;
        else if (mid) { /* mid keyword inside a line: net zero */ }
        else if (e === 'for' || e === 'while') { expectDo = true; d++; }
        else if (e === 'do') { if (expectDo) expectDo = false; else d++; }
        else d++; // function if repeat ( { [
      }
      if (lineIndent === null) lineIndent = depth;
      out.push(unit.repeat(Math.max(0, lineIndent)) + t); depth = Math.max(0, d);
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n') + '\n';
  },
});

// ---------- shell ----------
function shWords(line) { // bare words only; quotes become x, stops at a comment
  const w = []; let cur = '', i = 0, q = '';
  while (i < line.length) {
    const c = line[i];
    if (q) { if (c === '\\' && q === '"') { i += 2; continue; } if (c === q) q = ''; i++; continue; }
    if (c === '"' || c === "'") { q = c; cur += 'x'; i++; continue; }
    if (c === '\\') { i += 2; continue; }
    if (c === '#' && cur === '') break;
    if (/\s/.test(c) || c === ';') { if (cur) w.push(cur); cur = ''; if (c === ';') w.push(';'); i++; continue; }
    cur += c; i++;
  }
  if (cur) w.push(cur);
  return { w, q };
}
tool({
  id: 'shell-script-formatter', cat: FMT, title: 'Shell Script Formatter: Re-indent if, for, while and case Blocks',
  desc: 'Re-indent Bash or POSIX shell scripts by if/fi, do/done, case/esac and brace blocks the way shfmt lays them out. Heredocs and quoted strings are left alone.',
  labels: ['Shell script'], sample: '#!/bin/bash\nset -eu\ngreet() {\nlocal who="$1"\nif [ -n "$who" ]; then\necho "hello $who"\nelse\necho "hello"\nfi\n}\nfor f in *.txt; do\ncase "$f" in\na*)\necho "a file"\n;;\n*)\n  echo other\n;;\nesac\ndone\ncat <<EOF\n   kept as typed\nEOF\ngreet "$USER" \\\n--verbose',
  opts: [sel('indent', 'Indent with', ['tab', '2 spaces', '4 spaces'])],
  run: ([s], o) => {
    need(s, 'a shell script'); const unit = o.indent === 'tab' ? '\t' : o.indent === '4 spaces' ? '    ' : o.indent === '2 spaces' ? '  ' : '\t';
    const out = []; let depth = 0, blank = 0, heredoc = null, q = '', contLine = false; const cases = []; // case frames: {base, inBody}
    for (const raw of lines(s.replace(/^\uFEFF/, ''))) {
      if (heredoc) { out.push(raw); const tt = heredoc.dash ? raw.replace(/^\t+/, '') : raw; if (tt === heredoc.id) heredoc = null; continue; }
      if (q) { out.push(raw); const r = shWords(q + raw); q = r.q; continue; }
      const t = raw.trim();
      if (!t) { blank++; continue; }
      if (blank && out.length) out.push(''); blank = 0;
      const { w, q: q2 } = shWords(t); const first = w[0] || '';
      let level = depth + (contLine ? 1 : 0), after = depth;
      const topCase = cases[cases.length - 1];
      const isPattern = topCase && !topCase.inBody && /^\(?[^\s()]+(\|[^\s()]+)*\)/.test(t) && !/^(esac)\b/.test(t);
      if (isPattern) { level = topCase.base; after = topCase.base + 1; topCase.inBody = true; if (/;;\s*(#.*)?$/.test(t)) { after = topCase.base; topCase.inBody = false; } }
      else if (first === ';;' || /^;;/.test(t)) { level = depth; after = topCase ? topCase.base : depth; if (topCase) topCase.inBody = false; }
      else if (first === 'esac') { const f = cases.pop(); level = f ? f.base : depth - 1; after = level; }
      else {
        let d = depth;
        if (['fi', 'done', '}'].includes(first)) { d--; level = d; }
        else if (['else', 'elif'].includes(first)) { level = d - 1; }
        const nonFirst = w.slice(first === 'esac' ? 1 : 0);
        for (let k = 0; k < nonFirst.length; k++) {
          const x = nonFirst[k];
          if (k === 0 && ['fi', 'done', '}'].includes(x)) continue;
          if (x === 'then' || x === 'do' || x === 'else') d++;
          else if (x === 'fi' || x === 'done') d--;
          else if (x === '{' && (k === nonFirst.length - 1 || nonFirst[k + 1] === ';')) d++;
          else if (x === '}' && k > 0) d--;
          else if (x === 'case') cases.push({ base: depth, inBody: false });
          else if (x === 'in' && cases.length && k > 0 && nonFirst.slice(0, k).includes('case')) { cases[cases.length - 1].base = d; cases[cases.length - 1].inBody = false; }
        }
        // 'elif x; then' / 'else': keywords already counted; mid keywords net zero
        if (['else', 'elif'].includes(first)) { /* 'else' counted as +1 above for first word */ d = d; }
        after = d;
        if (first === 'else' || first === 'elif') { after = depth - 1 + (nonFirst.filter((x) => x === 'then').length) + (first === 'else' ? 1 : 0); after = Math.max(0, after); }
      }
      out.push(unit.repeat(Math.max(0, level)) + (q2 ? raw.trimStart() : t));
      contLine = /(^|[^\\])(\\\\)*\\$/.test(t);
      depth = Math.max(0, after); q = q2;
      const hd = /<<(-?)\s*\\?(["']?)([^\s"'<>|&;()]+)\2/.exec(t); if (hd && !/<<</.test(t)) heredoc = { id: hd[3], dash: hd[1] === '-' };
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n') + '\n';
  },
});

// ---------- Python ----------
function pyScan(t, br) { // bracket depth and open triple quote at end of line, ignoring strings and comments
  let i = 0, tq = '';
  while (i < t.length) {
    const c = t[i];
    if (c === '#') break;
    if (c === '"' || c === "'") {
      if (t.startsWith(c.repeat(3), i)) { const e = t.indexOf(c.repeat(3), i + 3); if (e < 0) { tq = c.repeat(3); break; } i = e + 3; continue; }
      let j = i + 1; while (j < t.length && t[j] !== c) { if (t[j] === '\\') j++; j++; } i = j + 1; continue;
    }
    if ('([{'.includes(c)) br++; else if (')]}'.includes(c)) br = Math.max(0, br - 1);
    i++;
  }
  return { br, tq };
}
const PY_CONT = /^(else|elif|except|finally)\b/;
tool({
  id: 'python-formatter', cat: FMT, title: 'Python Whitespace Formatter: Indentation and Blank Lines (No Ruff)',
  desc: 'Convert mixed tabs and spaces to one indent, put two blank lines around top-level defs and classes, one around methods, strip trailing spaces. It does not change quotes or wrap lines.',
  labels: ['Python code'], sample: 'import os\ndef f(a,\n      b):\n\tif a:\n\t\treturn b\n\treturn None\nclass K:\n  x = 1\n  def m(self):\n      s = """keep\n   this"""\n      return s\n\n\n\n\nprint(f(1, 2))\n',
  opts: [sel('indent', 'Indent with', ['4 spaces', '2 spaces', 'tab']), chk('blanks', 'Add blank lines around defs and classes', true)],
  run: ([s], o) => {
    need(s, 'Python code'); const unit = o.indent === 'tab' ? '\t' : o.indent === '2 spaces' ? '  ' : '    ';
    const width = (ws) => { let w = 0; for (const ch of ws) w = ch === '\t' ? Math.floor(w / 8) * 8 + 8 : w + 1; return w; };
    const items = [], stack = [0]; let br = 0, tq = '', cont = false, base = { lvl: 0, w: 0 };
    for (const raw of lines(s.replace(/^\uFEFF/, ''))) {
      if (tq) { items.push({ verb: raw }); const k = raw.indexOf(tq); if (k >= 0) { const r = pyScan(raw.slice(k + 3), br); br = r.br; tq = r.tq; cont = !tq && /\\$/.test(raw); } continue; }
      const t = raw.trim(), ws = /^\s*/.exec(raw)[0];
      if (!t) { items.push({ blank: true }); continue; }
      if (br > 0 || cont) { items.push({ text: t, lvl: base.lvl, extra: Math.max(0, width(ws) - base.w), cont: true }); const r = pyScan(t, br); br = r.br; tq = r.tq; cont = !tq && /\\$/.test(t); continue; }
      const w = width(ws);
      if (t.startsWith('#')) { items.push({ text: t, lvl: null, w, cmt: true }); continue; }
      if (w > stack[stack.length - 1]) stack.push(w); else while (stack.length > 1 && w < stack[stack.length - 1]) stack.pop();
      const lvl = stack.length - 1; base = { lvl, w };
      const r = pyScan(t, 0); br = r.br; tq = r.tq; cont = !tq && /\\$/.test(t);
      items.push({ text: t, lvl, def: /^(async\s+def|def|class)\b/.test(t), deco: t.startsWith('@'), head: /:\s*(#.*)?$/.test(t) && br === 0 });
    }
    // comment-only lines take the level of the next statement (or the previous one at the end of a block)
    items.forEach((it, k) => { if (it.cmt) { const nx = items.slice(k + 1).find((x) => x.text !== undefined && !x.cmt && !x.cont && !x.verb); it.lvl = nx ? Math.min(nx.lvl, (items.slice(0, k).reverse().find((x) => x.lvl != null && !x.cmt && !x.cont) || { lvl: nx.lvl }).lvl + 1) : 0; } });
    const out = []; let blankRun = 0, prev = null; const pending = [];
    const fill = (k) => { while (out.length && out[out.length - 1] === '') out.pop(); if (out.length) for (let x = 0; x < k; x++) out.push(''); };
    for (const it of items) {
      if (it.verb !== undefined) { out.push(it.verb); continue; }
      if (it.blank) { blankRun++; continue; }
      if (it.cont) { out.push(unit.repeat(it.lvl) + ' '.repeat(it.extra) + it.text); blankRun = 0; continue; }
      let want = Math.min(blankRun, it.lvl === 0 ? 2 : 1);
      const afterHead = prev && prev.head && prev.lvl < it.lvl;
      if (o.blanks && prev && !it.cmt && !afterHead) {
        if (prev.deco) want = 0;
        else if (it.def || it.deco) { if (!(prev.cmt && blankRun === 0)) want = it.lvl === 0 ? 2 : 1; }
        else if (!PY_CONT.test(it.text)) {
          const hit = pending.filter((l) => l >= it.lvl);
          if (hit.length) want = it.lvl === 0 && hit.includes(0) ? 2 : Math.max(want, 1);
        }
      }
      if (!it.cmt) { while (pending.length && pending[pending.length - 1] >= it.lvl && !PY_CONT.test(it.text)) pending.pop(); if (it.def) pending.push(it.lvl); }
      if (afterHead) want = 0;
      if (out.length) fill(want);
      out.push(unit.repeat(it.lvl) + it.text); blankRun = 0; prev = it;
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n') + '\n';
  },
});

// ---------- Dockerfile ----------
const DOCKER_KW = ['FROM', 'RUN', 'CMD', 'LABEL', 'MAINTAINER', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL'];
function splitAnd(cmd) { // split on top-level " && "
  const parts = []; let cur = '', q = '', par = 0, i = 0;
  while (i < cmd.length) {
    const c = cmd[i];
    if (q) { cur += c; if (c === '\\' && q === '"') { cur += cmd[i + 1] || ''; i += 2; continue; } if (c === q) q = ''; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; i++; continue; }
    if (c === '(' ) par++; if (c === ')') par = Math.max(0, par - 1);
    if (!par && cmd.startsWith('&&', i)) { parts.push(cur.trim()); cur = ''; i += 2; continue; }
    cur += c; i++;
  }
  parts.push(cur.trim()); return parts.filter(Boolean);
}
tool({
  id: 'dockerfile-formatter', cat: FMT, title: 'Dockerfile Formatter: Uppercase Instructions and Tidy RUN Lines',
  desc: 'Uppercase Dockerfile instructions, indent continuation lines, collapse blank lines and optionally split long RUN chains at && onto their own lines.',
  labels: ['Dockerfile'], sample: '# syntax=docker/dockerfile:1\nfrom node:20 as build\nworkdir /app\ncopy package*.json ./\nrun apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*\nrun npm ci \\\n     && npm run build\n\n\n\nfrom nginx:alpine\ncopy --from=build /app/dist /usr/share/nginx/html\nexpose 80\ncmd ["nginx", "-g", "daemon off;"]',
  opts: [chk('split', 'Split RUN commands at &&', true), sel('indent', 'Indent continuation lines', ['4 spaces', '2 spaces', 'tab'])],
  run: ([s], o) => {
    need(s, 'a Dockerfile'); const unit = o.indent === 'tab' ? '\t' : o.indent === '2 spaces' ? '  ' : '    ';
    let esc = '\\'; const src = lines(s.replace(/^\uFEFF/, '')), out = []; let i = 0, blank = 0, header = true;
    const escRe = (c) => new RegExp('\\' + c + '\\s*$');
    while (i < src.length) {
      const raw = src[i], t = raw.trim();
      if (!t) { blank++; i++; continue; }
      if (blank && out.length) out.push(''); blank = 0;
      if (t.startsWith('#')) { const dm = /^#\s*escape\s*=\s*(\S)\s*$/i.exec(t); if (dm && header) esc = dm[1]; out.push(t); i++; continue; }
      header = false;
      let logical = t; const startLine = i; i++;
      while (escRe(esc).test(logical) && i < src.length) { logical = logical.replace(escRe(esc), '').replace(/\s+$/, '') + ' ' + src[i].trim(); i++; if (/^\s*#/.test(src[i - 1])) { logical = logical.replace(/\s*#.*$/, ''); } }
      const m = /^(\w+)(\s+|$)([\s\S]*)$/.exec(logical); if (!m) { out.push(t); continue; }
      let kw = m[1], rest = m[3].trim();
      if (!DOCKER_KW.includes(kw.toUpperCase())) { out.push(src.slice(startLine, i).map((x) => x.replace(/\s+$/, '')).join('\n')); continue; }
      kw = kw.toUpperCase();
      if (kw === 'ONBUILD') { const m2 = /^(\w+)(\s+|$)([\s\S]*)$/.exec(rest); if (m2 && DOCKER_KW.includes(m2[1].toUpperCase())) { kw += ' ' + m2[1].toUpperCase(); rest = m2[3].trim(); } }
      if (kw === 'FROM') rest = rest.replace(/\s+as\s+/i, ' AS ');
      const hd = /<<-?["']?\w+/.test(rest);
      if (hd) { out.push(src.slice(startLine, i).map((x) => x.replace(/\s+$/, '')).join('\n')); continue; } // heredoc RUN: keep as typed (BuildKit)
      if ((kw === 'RUN' || kw === 'ONBUILD RUN') && o.split && !/^\[/.test(rest) && !/^--\w/.test(rest)) {
        const parts = splitAnd(rest);
        out.push(parts.length > 1 ? `${kw} ${parts[0]} ${esc}\n` + parts.slice(1).map((p, k, a) => `${unit}&& ${p}${k < a.length - 1 ? ' ' + esc : ''}`).join('\n') : `${kw} ${rest}`);
      } else if (i - startLine > 1 && !/^\[/.test(rest)) {
        // keep the author's line breaks, only normalise indentation
        const ls2 = src.slice(startLine, i).map((x) => x.trim()); out.push(ls2.map((x, k) => (k === 0 ? kw === ls2[0].split(/\s+/)[0].toUpperCase() ? x.replace(/^\w+/, kw.split(' ')[0]) : x : unit + x)).join('\n'));
      } else out.push(`${kw} ${rest}`.trim());
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n') + '\n';
  },
});

// ---------- LaTeX ----------
const LATEX_VERB = /^(verbatim\*?|lstlisting|minted|comment|Verbatim|alltt)$/;
tool({
  id: 'latex-formatter', cat: FMT, title: 'LaTeX Formatter: Indent Environments and Tidy Whitespace',
  desc: 'Indent the content of \\begin{...} and \\end{...} environments and \\[ \\] blocks, trim trailing spaces and collapse blank lines. Verbatim-style environments are not touched.',
  labels: ['LaTeX source'], sample: '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\nSome text with 50\\% growth.   \n\\begin{itemize}\n\\item One\n  \\item Two\n\\begin{enumerate}\n\\item Nested\n\\end{enumerate}\n\\end{itemize}\n\n\n\n\\begin{verbatim}\n   keep   this\n\\end{verbatim}\n\\[\nx^2 + y^2 = z^2\n\\]\n\\end{document}',
  opts: [sel('indent', 'Indent with', ['2 spaces', '4 spaces', 'tab']), chk('doc', 'Indent inside \\begin{document}', false)],
  run: ([s], o) => {
    need(s, 'LaTeX source'); const unit = o.indent === 'tab' ? '\t' : o.indent === '4 spaces' ? '    ' : '  ';
    const out = []; let depth = 0, blank = 0, verb = null;
    for (const raw of lines(s.replace(/^\uFEFF/, ''))) {
      if (verb) { out.push(raw); const m = new RegExp('\\\\end\\{' + verb.replace(/[*]/g, '\\*') + '\\}').exec(raw); if (m) { verb = null; depth = Math.max(0, depth - 1); } continue; }
      const t = raw.trim(); if (!t) { blank++; continue; }
      if (blank && out.length) out.push(''); blank = 0;
      const code = t.replace(/(^|[^\\])%.*$/, '$1');
      const ev = []; const re = /\\begin\{([^}]*)\}|\\end\{([^}]*)\}|\\\[|\\\]/g; let m;
      while ((m = re.exec(code))) ev.push(m[0] === '\\[' ? ['b', '[display]'] : m[0] === '\\]' ? ['e', '[display]'] : m[1] !== undefined ? ['b', m[1]] : ['e', m[2]]);
      let d = depth, level = depth, leading = true, vb = null;
      const isDoc = (n) => n === 'document' && !o.doc;
      for (const [k, n] of ev) {
        if (k === 'e') { if (!isDoc(n)) d--; if (leading) level = d; } else { leading = false; if (!isDoc(n)) d++; if (LATEX_VERB.test(n)) vb = n; }
        if (k === 'b') leading = false;
      }
      // a \begin that is not first keeps the line level; a leading \end dedents
      out.push(unit.repeat(Math.max(0, level)) + t);
      depth = Math.max(0, d);
      if (vb && !new RegExp('\\\\end\\{' + vb.replace(/[*]/g, '\\*') + '\\}').test(code)) verb = vb;
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n') + '\n';
  },
});

// ---------- log lines with JSON ----------
function jsonEnd(s, i) { // index after the balanced {...} or [...] starting at i, or -1
  const o = s[i], c = o === '{' ? '}' : ']'; let d = 0, q = false;
  for (let j = i; j < s.length; j++) { const ch = s[j]; if (q) { if (ch === '\\') j++; else if (ch === '"') q = false; continue; } if (ch === '"') q = true; else if (ch === '{' || ch === '[') d++; else if (ch === '}' || ch === ']') { d--; if (d === 0) return ch === c ? j + 1 : -1; } }
  return -1;
}
tool({
  id: 'log-line-prettifier', cat: FMT, title: 'Log Line Prettifier: Expand JSON Inside Log Lines',
  desc: 'Find JSON objects and arrays inside application log lines and print each as an indented block under its line, leaving the rest of the line as it was.',
  labels: ['Log lines'], sample: '2025-10-01T10:00:01Z INFO request done {"method":"GET","path":"/api/items","status":200,"ms":12.5,"tags":["a","b"]} user=42\n2025-10-01T10:00:02Z ERROR payload={"error":{"code":"E_TIMEOUT","retry":true},"id":7} after 3 tries\n2025-10-01T10:00:03Z DEBUG plain line with [brackets] and no JSON\n[WARN] queue depth [{"q":"mail","n":120},{"q":"sms","n":3}]',
  opts: [sel('indent', 'Indent', ['2 spaces', '4 spaces']), chk('arrays', 'Also expand arrays of plain values', false)],
  run: ([s], o) => {
    need(s, 'log lines'); const ind = o.indent === '4 spaces' ? 4 : 2, out = []; let found = 0;
    for (const line of lines(s)) {
      let i = 0, text = '', pieces = [];
      while (i < line.length) {
        const c = line[i];
        if (c === '{' || c === '[') {
          const e = jsonEnd(line, i);
          if (e > 0) {
            try { const v = JSON.parse(line.slice(i, e)); if (v && typeof v === 'object' && (!Array.isArray(v) || o.arrays || v.some((x) => x && typeof x === 'object'))) { pieces.push({ pre: text.replace(/\s+$/, ''), json: JSON.stringify(v, null, ind) }); text = ''; i = e; found++; continue; } } catch { /* not JSON */ }
          }
        }
        text += c; i++;
      }
      if (!pieces.length) { out.push(line); continue; }
      out.push(pieces[0].pre);
      pieces.forEach((p, k) => { if (k > 0 && p.pre.trim()) out.push('  ' + p.pre.trim()); out.push(p.json.split('\n').map((l) => '  ' + l).join('\n')); });
      if (text.trim()) out.push('  ' + text.trim());
    }
    if (!found) throw new Error('No JSON objects or arrays found in these lines.');
    return out.join('\n');
  },
});

// ---------- crontab ----------
tool({
  id: 'crontab-formatter', cat: FMT, title: 'Crontab Formatter: Align Cron Entries into Columns',
  desc: 'Line up the minute, hour, day, month and weekday fields of crontab entries in columns. Commands, comments and variable lines are kept exactly as written.',
  labels: ['crontab'], sample: '# m h dom mon dow command\nMAILTO=admin@example.com\n*/5 * * * * /usr/bin/check.sh --quiet\n0 3 * * 1-5 /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1\n30 4 1 * *   cleanup\n@reboot /usr/local/bin/start.sh\n  15   14   1   *  *   echo "kept   spacing   in   commands"',
  opts: [chk('user', 'Has a user column (/etc/crontab, /etc/cron.d)', false)],
  run: ([s], o) => {
    need(s, 'a crontab'); const rows = [], extra = o.user ? 1 : 0, w = [0, 0, 0, 0, 0, 0]; const notes = [];
    lines(s).forEach((l, n) => {
      const t = l.trim();
      if (!t || t.startsWith('#') || /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(t)) { rows.push({ raw: t }); return; }
      const sp = /^@\w+/.test(t) ? 1 : 5, re = new RegExp('^((?:\\S+\\s+){' + (sp + extra - 1) + '}\\S+)\\s+(.+)$'), m = re.exec(t);
      if (!m) { rows.push({ raw: t }); notes.push(`Line ${n + 1}: not enough fields, left as typed (review).`); return; }
      const f = m[1].split(/\s+/); if (sp > 1) f.forEach((x, k) => { w[k] = Math.max(w[k], x.length); });
      rows.push({ f, cmd: m[2], sp });
    });
    const text = rows.map((r) => (r.raw !== undefined ? r.raw : r.f.map((x, k) => (k < r.f.length - 1 ? x.padEnd(w[k]) : x)).join(' ') + ' ' + r.cmd)).join('\n');
    return text + (notes.length ? '\n\n' + notes.join('\n') : '');
  },
});

// ---------- line endings ----------
function countEol(s) { const crlf = (s.match(/\r\n/g) || []).length, cr = (s.match(/\r(?!\n)/g) || []).length, lf = (s.match(/(?<!\r)\n/g) || []).length; return { crlf, lf, cr }; }
tool({
  id: 'line-ending-normalizer', cat: FMT, title: 'Line Ending Normalizer: CRLF, LF and CR Converter',
  desc: 'Convert text or a file between Windows (CRLF), Unix (LF) and old Mac (CR) line endings and see how many of each the file has.',
  labels: ['Text (or choose a file)'], sample: 'first line\nsecond line\nthird line\n',
  file: { accept: '*/*', multiple: false, optional: true }, dom: true,
  opts: [sel('to', 'Convert to', ['LF (Unix, macOS)', 'CRLF (Windows)', 'CR (classic Mac)']), chk('trim', 'Remove trailing spaces', false), chk('final', 'End with one line break', false)],
  run: async ([s], o, files) => {
    let text, from = '';
    if (files && files[0]) { const u = new Uint8Array(await files[0].arrayBuffer()); if (u.includes(0)) throw new Error('This looks like a binary file (it contains NUL bytes). Only text files can be converted.'); text = new TextDecoder().decode(u); const c = countEol(text); from = `File: ${files[0].name}\nFound: CRLF ${c.crlf}, LF ${c.lf}, CR ${c.cr}${[c.crlf, c.lf, c.cr].filter((x) => x).length > 1 ? ' (mixed endings)' : ''}\n`; }
    else { text = need(s, 'text or choose a file'); from = 'Note: browsers turn every line break typed or pasted into a text box into LF, so the original endings of pasted text cannot be detected. Choose a file to see them.\n'; }
    const eol = o.to.startsWith('CRLF') ? '\r\n' : o.to.startsWith('CR ') ? '\r' : '\n';
    let t = text.replace(/\r\n|\r|\n/g, '\n'); if (o.trim) t = t.replace(/[ \t]+$/gm, ''); if (o.final) t = t.replace(/\n*$/, '\n');
    const out = t.replace(/\n/g, eol), c2 = countEol(out), res = { text: out };
    res.html = `<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;margin:8px"><p>${from.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}Result: CRLF ${c2.crlf}, LF ${c2.lf}, CR ${c2.cr}</p>`;
    if (files && files[0]) { res.blob = new Blob([out], { type: 'text/plain' }); res.filename = files[0].name; }
    return res;
  },
});

// ---------- Markdown ----------
const splitRow = (l) => { let t = l.trim(); if (t.startsWith('|')) t = t.slice(1); if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1); const cells = []; let cur = ''; for (let i = 0; i < t.length; i++) { if (t[i] === '\\' && t[i + 1] === '|') { cur += '\\|'; i++; } else if (t[i] === '|') { cells.push(cur.trim()); cur = ''; } else cur += t[i]; } cells.push(cur.trim()); return cells; };
const isDelim = (l) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l) && l.includes('-') && (l.includes('|') || /^\s*:?-+:?\s*$/.test(l) && false);
function mdTable(rows) { // rows: raw lines, first = header, second = delimiter
  const cells = rows.map(splitRow), al = cells[1].map((c) => (c.startsWith(':') && c.endsWith(':') ? 'c' : c.endsWith(':') ? 'r' : c.startsWith(':') ? 'l' : ''));
  const n = Math.max(...cells.map((r) => r.length)), w = Array.from({ length: n }, (_, i) => Math.max(3, ...cells.filter((_, k) => k !== 1).map((r) => (r[i] || '').length)));
  const fmt = (r) => '| ' + w.map((x, i) => { const c = r[i] || ''; return al[i] === 'r' ? c.padStart(x) : al[i] === 'c' ? c.padStart(Math.floor((x + c.length) / 2)).padEnd(x) : c.padEnd(x); }).join(' | ') + ' |';
  const d = '| ' + w.map((x, i) => (al[i] === 'c' ? ':' + '-'.repeat(x - 2) + ':' : al[i] === 'r' ? '-'.repeat(x - 1) + ':' : al[i] === 'l' ? ':' + '-'.repeat(x - 1) : '-'.repeat(x))).join(' | ') + ' |';
  return [fmt(cells[0]), d, ...cells.slice(2).map(fmt)];
}
tool({
  id: 'markdown-formatter', cat: FMT, title: 'Markdown Formatter: Lists, Headings, Tables and Blank Lines',
  desc: 'Normalise Markdown: one list marker style, renumbered ordered lists, tidy ATX headings, aligned tables, blank lines around blocks and no trailing spaces. Code blocks are left alone.',
  labels: ['Markdown'], sample: '#  Title #\nSome text   \nwith a hard break.  \nNext line\n## Lists\n* one\n+ two\n    * nested\n1) first\n3) second\n3) third\n\n\n\n| Name | Qty | Note |\n|:--|--:|:-:|\n| Apples | 3 | fresh |\n| Figs | 12 | dried |\n***\n```js\nlet   x  =  1;\n```\nEnd',
  opts: [sel('bullet', 'Bullet marker', ['-', '*', '+']), chk('renumber', 'Renumber ordered lists (1. 2. 3.)', true), chk('tables', 'Align tables', true)],
  run: ([s], o) => {
    need(s, 'Markdown'); const src = lines(s.replace(/^﻿/, '')), out = []; let i = 0;
    const blankBefore = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
    if (src[0] === '---') { let j = 1; while (j < src.length && src[j] !== '---') j++; if (j < src.length) { out.push(...src.slice(0, j + 1)); i = j + 1; } }
    const counters = new Map(); let lastWasBlank = false, inList = false, para = false;
    for (; i < src.length; i++) {
      const raw = src[i];
      const fm = /^(\s*)(`{3,}|~{3,})/.exec(raw);
      if (fm) {
        const free = fm[1] === '' && !inList, fence = fm[2][0], len = fm[2].length; if (free) blankBefore();
        out.push(raw.replace(/\s+$/, '')); i++; let closed = false;
        while (i < src.length) { if (new RegExp('^\\s*' + (fence === '`' ? '`' : '~') + '{' + len + ',}\\s*$').test(src[i])) { closed = true; break; } out.push(src[i]); i++; }
        if (closed) out.push(src[i].replace(/\s+$/, ''));
        if (free && closed) { out.push(''); lastWasBlank = true; counters.clear(); } else lastWasBlank = false;
        continue;
      }
      if (/^( {4}|\t)\S/.test(raw) && !inList && (out.length === 0 || out[out.length - 1] === '')) { out.push(raw.replace(/\s+$/, '')); lastWasBlank = false; continue; } // indented code block
      let line = raw.replace(/\s+$/, '');
      const hard = /\S {2,}$/.test(raw) && i + 1 < src.length && src[i + 1].trim() !== '';
      if (!line) { if (!lastWasBlank && out.length) out.push(''); lastWasBlank = true; para = false; continue; }
      const wasBlank = lastWasBlank; lastWasBlank = false; const wasPara = para; para = false;
      if (wasPara && /^\s*-{1,}\s*$/.test(line)) { out.push(line.trim()); continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blankBefore(); out.push('---'); out.push(''); lastWasBlank = true; inList = false; counters.clear(); continue; }
      const h = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?$/.exec(line);
      if (h) { blankBefore(); out.push(`${h[1]} ${h[2].trim()}`.trim()); out.push(''); lastWasBlank = true; inList = false; counters.clear(); continue; }
      if (o.tables && line.includes('|') && i + 1 < src.length && isDelim(src[i + 1]) && splitRow(line).length === splitRow(src[i + 1]).length) {
        const blk = [line, src[i + 1]]; let j = i + 2; while (j < src.length && src[j].trim() && src[j].includes('|')) { blk.push(src[j]); j++; }
        const ind = /^\s*/.exec(line)[0]; blankBefore(); out.push(...(blk.some((r) => splitRow(r).length > splitRow(line).length) ? blk.map((r) => r.replace(/\s+$/, '')) : mdTable(blk).map((r) => ind + r))); out.push(''); lastWasBlank = true; i = j - 1; continue;
      }
      const b = /^(\s*)([*+-])\s+(.*)$/.exec(line);
      if (b && !wasPara && b[1].length < 4) { out.push(`${b[1]}${o.bullet} ${b[3]}${hard ? '  ' : ''}`); inList = true; para = false; continue; }
      const n = /^(\s*)(\d{1,9})([.)])\s+(.*)$/.exec(line);
      if (n && !wasPara) {
        const ind = n[1].length; for (const k of [...counters.keys()]) if (k > ind) counters.delete(k);
        const next = counters.has(ind) ? counters.get(ind) : +n[2]; counters.set(ind, next + 1);
        out.push(`${n[1]}${o.renumber ? next : n[2]}${n[3]} ${n[4]}${hard ? '  ' : ''}`); inList = true; para = false; continue;
      }
      if (wasBlank) { const ind = /^\s*/.exec(line)[0].length; for (const k of [...counters.keys()]) if (k >= ind) counters.delete(k); if (!ind) inList = false; }
      para = !inList;
      out.push(hard ? line + '  ' : line);
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    while (out.length && out[0] === '') out.shift();
    return out.join('\n') + '\n';
  },
});

export default T;

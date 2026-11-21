// Tools from free-browser-tools.md, batch 01 (robots.txt, AI crawlers, bot management). See TOOLS.md for the contract.
// Skipped on purpose (need network or an account): Wayback/Common Crawl/crt.sh lookups, DNS-over-HTTPS, downloading
// vendors' IP lists. The client-side halves (paste-in analysers, offline reference data) are built instead.
// Robots semantics follow RFC 9309 and Google's robots.txt documentation (read 2026-10-23).
const T = [];
const SEO = 'SEO – Technical', GEN = 'SEO – Generators', AI = 'AI Crawlers';
const lines = (t) => String(t ?? '').split(/\r\n|\r|\n/);
const need = (t, n = 'input') => { if (!String(t ?? '').trim()) throw new Error(`Paste ${n} first.`); return String(t); };
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));
const table = (rows, head) => {
  const all = head ? [head, ...rows] : rows, w = [];
  all.forEach((r) => r.forEach((c, i) => { w[i] = Math.max(w[i] || 0, String(c).length); }));
  const f = (r) => r.map((c, i) => (i === r.length - 1 ? String(c) : pad(c, w[i]))).join('  ');
  return (head && head.length ? [f(head), w.map((x) => '-'.repeat(x)).join('  ')] : []).concat(rows.map(f)).join('\n');
};
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const num = (id, label, def) => ({ id, label, type: 'number', def });
const chk = (id, label, def) => ({ id, label, type: 'checkbox', def });
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const tool = (o) => T.push({ cat: SEO, ...o });
const MAX_BYTES = 512000; // 500 KiB, RFC 9309 section 2.5 and Google docs
const enc = new TextEncoder();
const bytes = (s) => enc.encode(s).length;

// ---------- robots.txt parser ----------
const TYPOS = { 'user-agent': 'ua', useragent: 'ua', 'user agent': 'ua', allow: 'allow', disallow: 'disallow', dissallow: 'disallow', dissalow: 'disallow', disalow: 'disallow', diasllow: 'disallow', disallaw: 'disallow', sitemap: 'sitemap', 'site-map': 'sitemap' };
const STRICT = { 'user-agent': 'ua', allow: 'allow', disallow: 'disallow', sitemap: 'sitemap' };
const CANON = { ua: 'User-agent', allow: 'Allow', disallow: 'Disallow', sitemap: 'Sitemap' };
const OTHER_CASE = { 'crawl-delay': 'Crawl-delay', host: 'Host', 'clean-param': 'Clean-param', noindex: 'Noindex', nofollow: 'Nofollow', 'request-rate': 'Request-rate', 'visit-time': 'Visit-time', 'content-signal': 'Content-Signal', 'content-usage': 'Content-Usage' };
/** Parse robots.txt. opts.google: accept Google's frequent typos and "key value" without colon; opts.cut: drop bytes past 500 KiB. */
function parseRobots(text, o = {}) {
  let t = String(text), bom = false;
  if (t.charCodeAt(0) === 0xfeff) { bom = true; t = t.slice(1); }
  let truncatedAt = 0;
  if (o.cut && bytes(t) > MAX_BYTES) { // cut on a byte boundary
    const b = enc.encode(t).slice(0, MAX_BYTES); t = new TextDecoder().decode(b).replace(/�$/, ''); truncatedAt = t.split(/\r\n|\r|\n/).length;
  }
  const map = o.google ? TYPOS : STRICT;
  const rb = { groups: [], sitemaps: [], unknown: [], bom, truncatedAt, comments: 0, errors: [], typos: [], nocolon: [], total: 0 };
  let cur = null, lastUA = false;
  lines(t).forEach((raw, i) => {
    const ln = i + 1; rb.total = ln;
    const hash = raw.indexOf('#'); let line = hash >= 0 ? raw.slice(0, hash) : raw;
    if (hash >= 0 && raw.slice(0, hash).trim() === '' ) rb.comments++;
    line = line.trim(); if (!line) return;
    let key, val, colon = line.indexOf(':');
    if (colon < 0) {
      const m = /^(\S+)\s+(\S.*)$/.exec(line);
      if (o.google && m && !/\s/.test(m[2]) && map[m[1].toLowerCase()]) { key = m[1]; val = m[2]; rb.nocolon.push({ line: ln, text: raw.trim() }); } else { rb.errors.push({ line: ln, text: raw.trim(), msg: 'no colon, line ignored' }); return; }
    } else { key = line.slice(0, colon).trim(); val = line.slice(colon + 1).trim(); }
    const k = key.toLowerCase(), kind = map[k];
    if (!kind) { if (!k || /\s/.test(k) && !TYPOS[k]) { rb.errors.push({ line: ln, text: raw.trim(), msg: 'not a "name: value" line' }); return; } rb.unknown.push({ line: ln, key, value: val, group: cur }); if (cur) cur.extras.push({ line: ln, key: k, value: val }); return; }
    if (!STRICT[k] && TYPOS[k]) rb.typos.push({ line: ln, key });
    if (kind === 'sitemap') { rb.sitemaps.push({ line: ln, url: val }); return; }
    if (kind === 'ua') {
      if (!cur || !lastUA) { cur = { agents: [], rules: [], extras: [], line: ln }; rb.groups.push(cur); }
      cur.agents.push({ name: val, line: ln }); lastUA = true; return;
    }
    lastUA = false;
    if (!cur) { rb.errors.push({ line: ln, text: raw.trim(), msg: `${CANON[kind]} before any User-agent line, ignored` }); return; }
    cur.rules.push({ type: kind, path: val, line: ln });
  });
  return rb;
}
const escRe = (s) => s.replace(/[.+?^${}()|[\]\\\/]/g, '\\$&');
const normPath = (s) => s.replace(/[^\x00-\x7f]/gu, (c) => { try { return encodeURIComponent(c); } catch { return c; } }).replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
function patRegex(p) {
  p = normPath(p); const end = p.endsWith('$'); if (end) p = p.slice(0, -1);
  return new RegExp('^' + p.split('*').map(escRe).join('.*') + (end ? '$' : ''), 's');
}
const pathOf = (u) => {
  u = u.trim(); if (!u) return '/';
  const m = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(.*)$/i.exec(u); let p = m ? m[1] : u;
  p = p.split('#')[0]; if (!p) return '/'; if (p[0] === '?') p = '/' + p; if (p[0] !== '/' && !m) p = '/' + p;
  return p;
};
/** Merge the groups that apply to a product token (case-insensitive exact match, fall back to *). */
function groupFor(rb, token, chain) {
  const names = chain || [token];
  for (const n of names) {
    const gs = rb.groups.filter((g) => g.agents.some((a) => a.name.toLowerCase() === n.toLowerCase()));
    if (gs.length) return { agent: n, groups: gs, rules: gs.flatMap((g) => g.rules), extras: gs.flatMap((g) => g.extras) };
  }
  const gs = rb.groups.filter((g) => g.agents.some((a) => a.name === '*'));
  return { agent: gs.length ? '*' : '(none)', groups: gs, rules: gs.flatMap((g) => g.rules), extras: gs.flatMap((g) => g.extras) };
}
const reCache = new Map();
const re = (p) => { let r = reCache.get(p); if (!r) { r = patRegex(p); reCache.set(p, r); } return r; };
/** Longest match wins; on a tie the Allow rule wins (RFC 9309 and Google). Empty patterns are ignored. */
function decide(rules, path) {
  const np = normPath(path); let best = null;
  for (const r of rules) {
    if (!r.path) continue;
    if (!re(r.path).test(np)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow' && best.type !== 'allow')) best = r;
  }
  return best ? { allowed: best.type === 'allow', rule: best } : { allowed: true, rule: null };
}
const ruleTxt = (d) => (d.rule ? `${CANON[d.rule.type]}: ${d.rule.path} (line ${d.rule.line})` : 'no matching rule');
const gchain = (tok) => { const t = tok, c = [t]; const i = t.indexOf('-'); if (i > 0) c.push(t.slice(0, i)); return c; };
const agentsOf = (g) => g.agents.map((a) => a.name).join(', ');
const outRules = (g) => g.rules.map((r) => `${CANON[r.type]}: ${r.path}`);
const ROBOTS_SAMPLE = `# Example site
User-agent: *
Disallow: /admin/
Disallow: /cart
Disallow: /*?sort=
Allow: /admin/public/
Crawl-delay: 10

User-agent: GPTBot
Disallow: /

User-agent: Googlebot
User-agent: Bingbot
Disallow: /tmp/
Noindex: /old/

Sitemap: https://example.com/sitemap.xml
`;
const URL_SAMPLE = 'https://example.com/\nhttps://example.com/admin/settings\nhttps://example.com/admin/public/help\nhttps://example.com/shop?sort=price\nhttps://example.com/files/report.pdf\nhttps://example.com/cart';

// ---------- 1 validator ----------
const KNOWN_OTHER = { 'crawl-delay': 'Google ignores Crawl-delay; other crawlers differ (see the Crawl-delay calculator).', host: 'Host was a Yandex directive; Google ignores it.', 'clean-param': 'Clean-param is Yandex-only; Google ignores it.', noindex: 'Google stopped supporting Noindex in robots.txt in 2019. Use a robots meta tag or X-Robots-Tag.', nofollow: 'Nofollow in robots.txt is not supported. Use rel or a robots meta tag.', 'request-rate': 'Not part of RFC 9309; ignored by Google.', 'visit-time': 'Not part of RFC 9309; ignored by Google.', 'content-signal': 'Content signals are a newer convention; not one of the four directives in RFC 9309.', 'content-usage': 'Content-Usage is an IETF draft (aipref); not one of the four directives in RFC 9309.' };
function lint(text) {
  const I = [], add = (level, line, msg) => I.push({ level, line, msg });
  const size = bytes(text);
  if (size > MAX_BYTES) add('error', 0, `File is ${(size / 1024).toFixed(1)} KiB. Crawlers read at most 500 KiB (512,000 bytes); the rest is ignored.`);
  else if (size > MAX_BYTES * 0.9) add('warn', 0, `File is ${(size / 1024).toFixed(1)} KiB, close to the 500 KiB limit.`);
  if (text.includes('�')) add('error', 0, 'Contains U+FFFD replacement characters: the bytes were not valid UTF-8.');
  const rb = parseRobots(text, { google: true });
  for (const n of rb.nocolon) add('warn', n.line, `Missing colon: "${n.text.slice(0, 40)}". Google accepts a space instead, other crawlers ignore the line.`);
  if (rb.bom) add('warn', 1, 'File starts with a byte order mark. Google lists a BOM as an invalid line; save as UTF-8 without BOM.');
  for (const e of rb.errors) add(/before any/.test(e.msg) ? 'error' : 'warn', e.line, `${e.msg}: ${e.text.slice(0, 60)}`);
  for (const t of rb.typos) add('warn', t.line, `"${t.key}" is a misspelling. Google accepts frequent typos, other crawlers may not.`);
  for (const u of rb.unknown) {
    const k = u.key.toLowerCase();
    add(KNOWN_OTHER[k] ? 'info' : 'warn', u.line, KNOWN_OTHER[k] ? `${u.key}: ${KNOWN_OTHER[k]}` : `Unknown directive "${u.key}", ignored by crawlers that follow RFC 9309.`);
  }
  for (const g of rb.groups) {
    for (const a of g.agents) {
      if (a.name === '') add('error', a.line, 'User-agent has no value.');
      else if (a.name !== '*' && !/^[A-Za-z_-]+$/.test(a.name)) add('warn', a.line, `User-agent "${a.name}" contains characters other than letters, "-" and "_". Crawlers match the product token only (for example "Googlebot", not a full user-agent string).`);
    }
    if (!g.rules.length) add('info', g.line, `Group for ${agentsOf(g)} has no Allow or Disallow rules (everything is allowed).`);
    for (const r of g.rules) {
      if (!r.path) { add('info', r.line, r.type === 'disallow' ? 'Empty Disallow means "allow everything".' : 'Empty Allow is ignored.'); continue; }
      if (r.path[0] !== '/' && r.path[0] !== '*') add('warn', r.line, `Path "${r.path}" should start with "/" or "*".`);
      if (/\s/.test(r.path)) add('warn', r.line, 'Path contains a space. Percent-encode it as %20.');
      if (r.path.indexOf('$') >= 0 && r.path.indexOf('$') < r.path.length - 1) add('warn', r.line, '"$" only means "end of URL" at the very end of a pattern.');
      if (/[^\x00-\x7f]/.test(r.path)) add('warn', r.line, 'Path has non-ASCII characters. Crawlers compare percent-encoded UTF-8; write them encoded.');
    }
  }
  const seen = new Map();
  for (const g of rb.groups) for (const a of g.agents) { const k = a.name.toLowerCase(); if (seen.has(k)) add('info', a.line, `User-agent "${a.name}" is already used on line ${seen.get(k)}. Crawlers merge such groups, which can surprise you.`); else seen.set(k, a.line); }
  for (const s of rb.sitemaps) if (!/^https?:\/\/[^\s/]+/i.test(s.url)) add('error', s.line, `Sitemap must be an absolute URL: ${s.url || '(empty)'}`);
  if (!rb.groups.length) add('error', 0, 'No User-agent group found.');
  else if (!rb.groups.some((g) => g.agents.some((a) => a.name === '*'))) add('info', 0, 'No "User-agent: *" group: crawlers you did not name are unrestricted.');
  if (!rb.sitemaps.length) add('info', 0, 'No Sitemap line.');
  const order = { error: 0, warn: 1, info: 2 };
  I.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line);
  return { issues: I, rb, size };
}
tool({
  id: 'robots-txt-validator', title: 'robots.txt Validator (RFC 9309 Syntax Check)', desc: 'Parse a pasted robots.txt and flag syntax errors, unknown directives, misspellings, bad paths, size and encoding problems.',
  labels: ['robots.txt'], sample: ROBOTS_SAMPLE + 'Disalow: /misc/\nDisallow: private\nSitemap: /sitemap.xml\n',
  run: ([t]) => {
    need(t, 'a robots.txt'); const { issues, rb, size } = lint(t);
    const c = (l) => issues.filter((i) => i.level === l).length;
    const head = `${rb.total} lines, ${(size / 1024).toFixed(2)} KiB, ${rb.groups.length} group(s), ${rb.sitemaps.length} sitemap line(s)\n${c('error')} error(s), ${c('warn')} warning(s), ${c('info')} note(s)`;
    if (!issues.length) return head + '\n\nNo problems found.';
    return head + '\n\n' + table(issues.map((i) => [i.level.toUpperCase(), i.line ? `line ${i.line}` : 'file', i.msg]), ['Level', 'Where', 'Message']) + '\n\nBased on RFC 9309 and Google\'s robots.txt documentation. "Review" items depend on which crawler reads the file.';
  },
});

// ---------- 3 diff ----------
function ruleSet(rb) {
  const m = new Map();
  for (const g of rb.groups) for (const a of g.agents) {
    const k = a.name.toLowerCase(); if (!m.has(k)) m.set(k, { name: a.name, rules: new Set(), extras: new Set() });
    const e = m.get(k); g.rules.forEach((r) => e.rules.add(`${CANON[r.type]}: ${r.path}`)); g.extras.forEach((x) => e.extras.add(`${OTHER_CASE[x.key] || x.key}: ${x.value}`));
  }
  return m;
}
tool({
  id: 'robots-txt-diff', title: 'robots.txt Diff Viewer (Rule Changes per User-agent)', desc: 'Compare two versions of a robots.txt and see added and removed rules per user-agent, ignoring comments, blank lines and order.',
  inputs: 2, labels: ['Old robots.txt', 'New robots.txt'], sample: ROBOTS_SAMPLE, sample2: ROBOTS_SAMPLE.replace('Disallow: /cart', 'Disallow: /checkout').replace('User-agent: GPTBot\nDisallow: /', 'User-agent: ClaudeBot\nDisallow: /') + 'Sitemap: https://example.com/news.xml\n',
  run: ([a, b]) => {
    need(a, 'the old robots.txt'); need(b, 'the new robots.txt');
    const A = ruleSet(parseRobots(a)), B = ruleSet(parseRobots(b)), out = []; let n = 0;
    for (const k of new Set([...A.keys(), ...B.keys()])) {
      const x = A.get(k), y = B.get(k);
      if (!x) { out.push(`+ User-agent: ${y.name}  (new group)`, ...[...y.rules, ...y.extras].map((r) => '    + ' + r)); n++; continue; }
      if (!y) { out.push(`- User-agent: ${x.name}  (group removed)`, ...[...x.rules, ...x.extras].map((r) => '    - ' + r)); n++; continue; }
      const add = [...y.rules, ...y.extras].filter((r) => !x.rules.has(r) && !x.extras.has(r)), del = [...x.rules, ...x.extras].filter((r) => !y.rules.has(r) && !y.extras.has(r));
      if (add.length || del.length) { out.push(`~ User-agent: ${y.name}`, ...del.map((r) => '    - ' + r), ...add.map((r) => '    + ' + r)); n += add.length + del.length; }
    }
    const sa = new Set(parseRobots(a).sitemaps.map((s) => s.url)), sb = new Set(parseRobots(b).sitemaps.map((s) => s.url));
    const sd = [...sa].filter((s) => !sb.has(s)), sn = [...sb].filter((s) => !sa.has(s));
    if (sd.length || sn.length) { out.push('~ Sitemap lines', ...sd.map((s) => '    - ' + s), ...sn.map((s) => '    + ' + s)); n += sd.length + sn.length; }
    return (n ? `${n} change(s)\n\n${out.join('\n')}` : 'No rule changes. The files may still differ in comments, blank lines, casing or order, which do not affect crawling.') + '\n\nGroups with the same user-agent are merged before comparing, as crawlers do.';
  },
});

// ---------- 5 viewer (paste-in half of "fetcher") ----------
tool({
  id: 'robots-txt-viewer', title: 'robots.txt Viewer: Grouped Rules per Crawler', desc: 'Read a pasted robots.txt as a plain-English summary: which crawlers are named, what each may not fetch, sitemaps and ignored lines.',
  labels: ['robots.txt'], sample: ROBOTS_SAMPLE,
  run: ([t]) => {
    need(t, 'a robots.txt'); const rb = parseRobots(t, { google: true }), out = [];
    out.push(`${rb.groups.length} group(s), ${rb.sitemaps.length} sitemap(s), ${rb.comments} comment line(s)`);
    rb.groups.forEach((g, i) => {
      const dis = g.rules.filter((r) => r.type === 'disallow' && r.path), al = g.rules.filter((r) => r.type === 'allow' && r.path);
      out.push('', `Group ${i + 1} (line ${g.line}): ${agentsOf(g)}`);
      out.push(dis.length === 1 && dis[0].path === '/' && !al.length ? '  Blocks the whole site.' : !dis.length ? '  Blocks nothing.' : `  Blocks ${dis.length} pattern(s):`);
      if (!(dis.length === 1 && dis[0].path === '/' && !al.length)) dis.forEach((r) => out.push(`    ${r.path}`));
      if (al.length) { out.push('  Exceptions (Allow):'); al.forEach((r) => out.push(`    ${r.path}`)); }
      g.extras.forEach((x) => out.push(`  Other: ${OTHER_CASE[x.key] || x.key}: ${x.value}`));
    });
    if (rb.sitemaps.length) out.push('', 'Sitemaps:', ...rb.sitemaps.map((s) => '  ' + s.url));
    if (rb.errors.length) out.push('', 'Ignored lines:', ...rb.errors.map((e) => `  line ${e.line}: ${e.msg}`));
    out.push('', 'Fetching a live robots.txt needs a network request, which this site never makes: open /robots.txt in your browser and paste it here.');
    return out.join('\n');
  },
});

// ---------- 6 size ----------
tool({
  id: 'robots-txt-size-checker', title: 'robots.txt Size Checker (500 KiB Limit)', desc: 'Measure a robots.txt in bytes against the 500 KiB crawler limit and show which line a crawler stops reading at.',
  labels: ['robots.txt'], sample: ROBOTS_SAMPLE,
  opts: [num('limit', 'Limit in KiB (RFC 9309 minimum and Google: 500)', 500)],
  run: ([t], o) => {
    need(t, 'a robots.txt'); const limit = Math.round((+o.limit || 500) * 1024), size = bytes(t), parts = t.split(/(\r\n|\r|\n)/);
    const head = `${size.toLocaleString('en')} bytes = ${(size / 1024).toFixed(2)} KiB, ${((size / limit) * 100).toFixed(1)}% of the ${limit.toLocaleString('en')} byte limit.`;
    if (size <= limit) return head + `\nWithin the limit, ${(limit - size).toLocaleString('en')} bytes to spare.`;
    let off = 0, ln = 1, cutLine = 0, mid = false, lastDir = '';
    for (let i = 0; i < parts.length; i += 2) {
      const l = bytes(parts[i]) + bytes(parts[i + 1] || '');
      if (off + l > limit) { cutLine = ln; mid = off + bytes(parts[i]) > limit; break; }
      off += l; ln++; if (parts[i].trim() && !parts[i].trim().startsWith('#')) lastDir = parts[i].trim();
    }
    const total = Math.ceil(parts.length / 2);
    return `${head}\nOVER THE LIMIT by ${(size - limit).toLocaleString('en')} bytes.\n\nA crawler stops reading ${mid ? `in the middle of line ${cutLine}` : `after line ${cutLine - 1}`}. Lines ${cutLine} to ${total} (${total - cutLine + 1} of ${total}) are at risk of being ignored.\nLast fully read rule: ${lastDir.slice(0, 80) || '(none)'}\n\nFixes: remove comments and duplicates, replace long lists of paths with wildcard patterns, and block by pattern instead of by URL.`;
  },
});

// ---------- 7 wildcard pattern tester ----------
tool({
  id: 'robots-wildcard-pattern-tester', title: 'robots.txt Wildcard Pattern Tester (* and $)', desc: 'See which sample URLs a robots.txt pattern such as /*.pdf$ or /shop/*?sort= matches, with the regular expression it stands for.',
  inputs: 2, labels: ['Patterns, one per line (the value of an Allow or Disallow line)', 'URLs or paths to test, one per line'],
  sample: '/*.pdf$\n/shop/*?sort=\n/private\n/*/print/', sample2: 'https://example.com/files/report.pdf\nhttps://example.com/files/report.pdf?v=2\nhttps://example.com/shop/shoes?sort=price\nhttps://example.com/private-notes\nhttps://example.com/blog/post/print/',
  run: ([p, u]) => {
    const pats = lines(need(p, 'patterns')).map((x) => x.trim().replace(/^(allow|disallow)\s*:\s*/i, '')).filter(Boolean), urls = lines(need(u, 'URLs')).map((x) => x.trim()).filter(Boolean), out = [];
    for (const pt of pats) {
      const r = patRegex(pt), hit = urls.filter((x) => r.test(normPath(pathOf(x))));
      out.push(`Pattern ${pt}`, `  Means: path starts with ${pt.replace(/\$$/, '').split('*').map((s) => JSON.stringify(s)).join(' then anything then ')}${pt.endsWith('$') ? ' and the URL ends there' : ''}`, `  Regex: ${r.source}`, `  Matches ${hit.length} of ${urls.length}:`);
      urls.forEach((x) => out.push(`    ${hit.includes(x) ? 'MATCH   ' : 'no match'}  ${x}`)); out.push('');
    }
    return out.join('\n') + 'Rules: "*" matches any run of characters (including none), "$" at the end anchors the end of the URL, matching starts at the path and includes the query string, and it is case sensitive.';
  },
});

// ---------- 8 conflicts ----------
const probe = (p) => normPath(p.replace(/\$$/, '').replace(/\*/g, 'x'));
tool({
  id: 'robots-conflict-detector', title: 'robots.txt Allow / Disallow Conflict Detector', desc: 'Find Allow and Disallow rules that overlap in the same group and show which one wins for each overlap.',
  labels: ['robots.txt'], sample: ROBOTS_SAMPLE + '\nUser-agent: Slurp\nDisallow: /media/\nAllow: /media/\nDisallow: /docs/*.pdf\nAllow: /docs/public/\n',
  run: ([t]) => {
    need(t, 'a robots.txt'); const rb = parseRobots(t, { google: true }), out = [], seen = new Set(); let n = 0;
    const byAgent = new Map();
    rb.groups.forEach((g) => g.agents.forEach((a) => { const k = a.name.toLowerCase(); (byAgent.get(k) || byAgent.set(k, { name: a.name, rules: [] }).get(k)).rules.push(...g.rules.filter((r) => r.path)); }));
    for (const { name, rules } of byAgent.values()) {
      const al = rules.filter((r) => r.type === 'allow'), di = rules.filter((r) => r.type === 'disallow');
      for (const a of al) for (const d of di) {
        const pa = probe(a.path), pd = probe(d.path), k = name + a.path + '|' + d.path; if (seen.has(k)) continue;
        const aHitsD = re(a.path).test(pd), dHitsA = re(d.path).test(pa); if (!aHitsD && !dHitsA) continue;
        seen.add(k); n++;
        const w = decide([a, d], aHitsD && !dHitsA ? pd : pa), tie = a.path.length === d.path.length;
        out.push(`${name}: Allow ${a.path} (line ${a.line}) overlaps Disallow ${d.path} (line ${d.line})`, `   Winner: ${w.rule.type === 'allow' ? 'Allow' : 'Disallow'} ${w.rule.path}${tie ? ' (same length, Allow wins a tie)' : ' (longer pattern is more specific)'}`, `   Example path where both match: ${aHitsD && !dHitsA ? pd : pa}`, `   Effect: ${w.rule.type === 'allow' ? 'the Allow carves an exception out of the Disallow' : 'the Disallow overrides the Allow, so the Allow has no effect there'}`);
      }
    }
    return (n ? `${n} overlapping pair(s)\n\n${out.join('\n')}` : 'No overlapping Allow and Disallow rules found.') + '\n\nOverlaps are found by testing a sample path built from each pattern, so exotic wildcard combinations can be missed. Review the result for important rules.';
  },
});

// ---------- 9 group merger ----------
tool({
  id: 'robots-group-merger', title: 'robots.txt User-agent Group Merger (Effective Rules)', desc: 'Show the rules each crawler really follows after groups with the same user-agent are merged, and that the * group is not added on top.',
  labels: ['robots.txt'], sample: ROBOTS_SAMPLE + '\nUser-agent: Googlebot\nDisallow: /beta/\nAllow: /tmp/ok/\n',
  run: ([t]) => {
    need(t, 'a robots.txt'); const rb = parseRobots(t, { google: true }), m = new Map();
    rb.groups.forEach((g) => g.agents.forEach((a) => { const k = a.name.toLowerCase(); (m.get(k) || m.set(k, { name: a.name, groups: new Set(), rules: [] }).get(k)).groups.add(g); m.get(k).rules.push(...outRules(g)); }));
    const out = [];
    for (const e of m.values()) {
      const rules = [...new Set(e.rules)];
      out.push(`User-agent: ${e.name}   (${e.groups.size} group${e.groups.size > 1 ? 's merged' : ''}, line(s) ${[...e.groups].map((g) => g.line).join(', ')})`, ...rules.map((r) => '  ' + r), '');
    }
    const star = m.get('*');
    return out.join('\n') + (star && m.size > 1 ? `A crawler that has its own group ignores the "*" group completely: the ${m.size - 1} named group(s) above do not inherit the "*" rules. Copy rules across if you want them shared.` : 'Crawlers without their own group use the "*" group.');
  },
});

// ---------- 10 bulk ----------
tool({
  id: 'robots-bulk-url-checker', title: 'Bulk robots.txt URL Checker (CSV Export)', desc: 'Test hundreds of pasted URLs against a robots.txt for one or more crawlers and export blocked and allowed results as CSV.',
  inputs: 2, labels: ['robots.txt', 'URLs, one per line'], sample: ROBOTS_SAMPLE, sample2: URL_SAMPLE,
  opts: [txt('agents', 'Crawlers (comma separated product tokens)', 'Googlebot, Bingbot, GPTBot, *'), sel('format', 'Output', ['table', 'csv']), chk('onlyBlocked', 'Show only blocked', false)],
  run: ([r, u], o) => {
    const rb = parseRobots(need(r, 'a robots.txt'), { google: true }), urls = lines(need(u, 'URLs')).map((x) => x.trim()).filter(Boolean);
    if (urls.length > 50000) throw new Error('Over 50,000 URLs. Split the list.');
    const ags = o.agents.split(',').map((x) => x.trim()).filter(Boolean); if (!ags.length) throw new Error('Name at least one crawler.');
    const rows = [], q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    for (const a of ags) { const g = a === '*' ? groupFor(rb, '*') : groupFor(rb, a, gchain(a)); for (const x of urls) { const d = decide(g.rules, pathOf(x)); if (o.onlyBlocked && d.allowed) continue; rows.push([x, a, d.allowed ? 'allowed' : 'blocked', ruleTxt(d), g.agent]); } }
    const blocked = rows.filter((x) => x[2] === 'blocked').length;
    if (o.format === 'csv') return { text: ['url,crawler,result,rule,group_used', ...rows.map((x) => x.map(q).join(','))].join('\n'), filename: 'robots-check.csv' };
    return `${urls.length} URL(s) x ${ags.length} crawler(s): ${blocked} blocked, ${rows.length - blocked} allowed shown\n\n` + table(rows, ['URL', 'Crawler', 'Result', 'Deciding rule', 'Group']);
  },
});

// ---------- 11 crawl-delay ----------
tool({
  id: 'crawl-delay-calculator', title: 'Crawl-delay Calculator (Requests per Day)', desc: 'Turn a robots.txt Crawl-delay value into maximum requests per hour, day and month, and see which crawlers read it.',
  inputs: 0, sample: '', opts: [num('delay', 'Crawl-delay (seconds)', 10), num('urls', 'Pages on your site (optional)', 5000)],
  run: (_i, o) => {
    const d = +o.delay; if (!(d > 0)) throw new Error('Enter a delay above 0 seconds.');
    const day = Math.floor(86400 / d), n = +o.urls > 0 ? +o.urls : 0;
    return `Crawl-delay: ${d}\n\nAt most one request every ${d} s per crawler that obeys it:\n  per hour   ${Math.floor(3600 / d).toLocaleString('en')}\n  per day    ${day.toLocaleString('en')}\n  per month  ${(day * 30).toLocaleString('en')} (30 days)\n${n ? `\nTime to fetch ${n.toLocaleString('en')} pages once: ${(n / day).toFixed(1)} days (${(n * d / 3600).toFixed(1)} hours of crawling).\n` : ''}\nWho reads it:\n  Google      ignores Crawl-delay (Google's robots.txt documentation lists only user-agent, allow, disallow and sitemap).\n  Applebot    ignores it (Apple's Applebot page).\n  Amazonbot   does not support it (Amazon's Amazonbot page).\n  Bing, Yandex, others   vary and are not verified here. Check each vendor's documentation. Bing is commonly reported to honour it.\n\nSome crawlers read the number as a pause between requests, others as a time window, so the figures are the upper bound for a crawler that uses the simple "one request per N seconds" reading. A server that cannot cope should answer 429 or 503 instead of relying on Crawl-delay.`;
  },
});

// ---------- 12 encoding ----------
const WEIRD = [[/\uFEFF/g, 'byte order mark (U+FEFF)'], [/\uFFFD/g, 'replacement character (invalid UTF-8 was decoded)'], [/[\u200B-\u200D\u2060]/g, 'zero-width character'], [/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, 'non-breaking or exotic space'], [/[\u2018\u2019\u201C\u201D]/g, 'curly quote'], [/[\uFF1A\uFF03\uFF0F]/g, 'full-width colon, hash or slash'], [/[\u2010-\u2015\u2212]/g, 'dash that looks like a hyphen'], [/\u0000/g, 'NUL character (file may be UTF-16)'], [/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, 'control character']];
tool({
  id: 'robots-txt-encoding-checker', title: 'robots.txt Encoding and Invisible Character Checker', desc: 'Find byte order marks, invisible characters, look-alike symbols and non-ASCII paths that make crawlers ignore robots.txt lines.',
  labels: ['robots.txt'], sample: '\uFEFFUser-agent: *\nDisallow: /private\u200B/\nDisallow:\u00A0/tmp/\nDisallow: /caf\u00E9/\n\u201CAllow\u201D: /ok/\n',
  opts: [chk('clean', 'Also output a cleaned copy', true)],
  run: ([t], o) => {
    need(t, 'a robots.txt'); const out = []; let clean = t;
    lines(t).forEach((l, i) => {
      for (const [r, name] of WEIRD) for (const m of l.matchAll(r)) out.push([`line ${i + 1}`, `col ${m.index + 1}`, 'U+' + m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0'), name]);
      const hash = l.indexOf('#'), code = hash >= 0 ? l.slice(0, hash) : l;
      if (/[^\x00-\x7f]/.test(code) && !/[\u200B-\u200D\u2060\uFEFF\u00A0\uFFFD]/.test(code)) out.push([`line ${i + 1}`, '', '', 'non-ASCII text in a rule: write the path percent-encoded UTF-8 (for example %C3%A9)']);
    });
    const crlf = (t.match(/\r\n/g) || []).length, cr = (t.match(/\r(?!\n)/g) || []).length, lf = (t.match(/(?<!\r)\n/g) || []).length;
    const eol = [crlf && 'CRLF', lf && 'LF', cr && 'CR'].filter(Boolean);
    clean = clean.replace(/\uFEFF/g, '').replace(/[\u200B-\u200D\u2060]/g, '').replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '').replace(/[\uFF1A]/g, ':').replace(/\u0000/g, '');
    return (out.length ? `${out.length} suspicious item(s)\n\n${table(out, ['Line', 'Column', 'Code point', 'Problem'])}` : 'No byte order mark, invisible or look-alike characters found.') + `\n\nLine endings: ${eol.join(' + ') || 'none'}${eol.length > 1 ? ' (mixed, harmless but untidy)' : ''}. CR, LF and CRLF are all valid.\nPasted text is already decoded, so invalid UTF-8 shows up as U+FFFD. To check a file on disk, run: file robots.txt  or  iconv -f UTF-8 -t UTF-8 robots.txt >/dev/null` + (o.clean && out.length ? `\n\n--- cleaned copy (review before use; non-ASCII paths are not rewritten) ---\n${clean}` : '');
  },
});

// ---------- 13 minifier / 14 formatter ----------
function groupsCanonical(rb) { // merge groups with identical agent sets; dedupe rules
  const out = [], idx = new Map();
  for (const g of rb.groups) { const names = g.agents.map((a) => a.name), key = [...names].map((x) => x.toLowerCase()).sort().join('\0'); let e = idx.get(key); if (!e) { e = { agents: names, rules: [], extras: [] }; idx.set(key, e); out.push(e); } g.rules.forEach((r) => { if (!e.rules.some((x) => x.type === r.type && x.path === r.path)) e.rules.push(r); }); g.extras.forEach((x) => { if (!e.extras.some((y) => y.key === x.key && y.value === x.value)) e.extras.push(x); }); }
  return out;
}
const fmtGroups = (gs, extras) => gs.map((g) => [...g.agents.map((a) => `User-agent: ${a}`), ...g.rules.map((r) => `${CANON[r.type]}: ${r.path}`), ...(g.rules.length || g.extras.length ? [] : ['Disallow:']), ...g.extras.map((x) => `${OTHER_CASE[x.key] || x.key}: ${x.value}`)].join('\n')).join(extras ? '\n\n' : '\n');
tool({
  id: 'robots-txt-minifier', title: 'robots.txt Minifier (Strip Comments and Duplicates)', desc: 'Make a robots.txt smaller without changing what crawlers do: remove comments, blank lines, duplicate rules and merge groups for the same user-agent.',
  labels: ['robots.txt'], sample: ROBOTS_SAMPLE + '\nUser-agent: Googlebot\nDisallow: /tmp/\nDisallow: /beta/\n',
  run: ([t]) => {
    need(t, 'a robots.txt'); const rb = parseRobots(t, { google: true }), gs = groupsCanonical(rb);
    const text = fmtGroups(gs, false) + (rb.sitemaps.length ? '\n' + [...new Set(rb.sitemaps.map((s) => 'Sitemap: ' + s.url))].join('\n') : '') + '\n';
    const a = bytes(t), b = bytes(text);
    return `${text}\n# ${a} -> ${b} bytes (${a ? Math.round((1 - b / a) * 100) : 0}% smaller)\n# Not minified: rules that another rule makes redundant are kept, because the result can depend on Allow rules. Unsupported lines such as Noindex are kept in their group.`;
  },
});
const KEYCASE = { 'user-agent': 'User-agent', useragent: 'User-agent', 'user agent': 'User-agent', allow: 'Allow', disallow: 'Disallow', dissallow: 'Disallow', dissalow: 'Disallow', disalow: 'Disallow', diasllow: 'Disallow', disallaw: 'Disallow', sitemap: 'Sitemap', 'site-map': 'Sitemap', ...OTHER_CASE };
tool({
  id: 'robots-txt-formatter', title: 'robots.txt Formatter (Casing, Spacing, Order)', desc: 'Tidy a robots.txt: consistent directive casing, one space after the colon, a blank line between groups, optional sorted rules and misspellings fixed. Comments are kept.',
  labels: ['robots.txt'], sample: 'user-agent:*\nDISALLOW :/zzz/\ndisalow: /admin/\n  allow:/admin/public/\n\n\n\n# bots\nUSER-AGENT: GPTBot\nDisallow:/\nsitemap:https://example.com/sitemap.xml\n',
  opts: [chk('sort', 'Sort consecutive Allow/Disallow lines by path', false), chk('fix', 'Fix misspelled directives (Disalow, UserAgent...)', true)],
  run: ([t], o) => {
    need(t, 'a robots.txt'); const out = []; let prevUA = false, block = [];
    const flush = () => { if (o.sort && block.length > 1) block.sort((a, b) => a.path.localeCompare(b.path) || a.l.localeCompare(b.l)); out.push(...block.map((x) => x.l)); block = []; };
    for (const raw of lines(t.replace(/^\uFEFF/, ''))) {
      const hash = raw.indexOf('#'), code = (hash >= 0 ? raw.slice(0, hash) : raw).trim(), com = hash >= 0 ? raw.slice(hash).trim() : '';
      if (!code) { flush(); if (com) out.push(com); else if (out.length && out[out.length - 1] !== '') out.push(''); prevUA = false; continue; }
      const c = code.indexOf(':'); if (c < 0) { flush(); out.push(raw.trim()); continue; }
      const key = code.slice(0, c).trim(), val = code.slice(c + 1).trim(), lk = key.toLowerCase();
      let name = KEYCASE[lk] || key; if (!o.fix && TYPOS[lk] && !STRICT[lk]) name = key;
      const line = `${name}: ${val}`.trimEnd().replace(/: $/, ':') + (com ? `  ${com}` : '');
      const isUA = name === 'User-agent', isRule = name === 'Allow' || name === 'Disallow';
      if (isUA && !prevUA) { flush(); if (out.length && out[out.length - 1] !== '' && !out[out.length - 1].startsWith('#')) out.push(''); }
      if (name === 'Sitemap' && out.length && out[out.length - 1] !== '' && !/^Sitemap/.test(out[out.length - 1])) { flush(); out.push(''); }
      if (isRule && !com) block.push({ l: line, path: val }); else { flush(); out.push(line); }
      prevUA = isUA;
    }
    flush(); while (out[out.length - 1] === '') out.pop();
    return out.join('\n') + '\n';
  },
});

// ---------- 15 json ----------
tool({
  id: 'robots-txt-to-json', title: 'robots.txt to JSON Converter', desc: 'Convert a robots.txt into structured JSON: groups with user-agents and rules, sitemaps, other directives and ignored lines.',
  labels: ['robots.txt'], sample: ROBOTS_SAMPLE, opts: [num('indent', 'Indent', 2)],
  run: ([t], o) => {
    need(t, 'a robots.txt'); const rb = parseRobots(t);
    return JSON.stringify({ groups: rb.groups.map((g) => ({ userAgents: g.agents.map((a) => a.name), rules: g.rules.map((r) => ({ type: r.type, path: r.path, line: r.line })), other: g.extras.map((x) => ({ directive: x.key, value: x.value, line: x.line })), line: g.line })), sitemaps: rb.sitemaps.map((s) => s.url), ignoredLines: rb.errors.map((e) => ({ line: e.line, reason: e.msg })) }, null, Math.max(0, Math.min(8, +o.indent || 0)));
  },
});

// ---------- 16 sitemap directives ----------
tool({
  id: 'robots-sitemap-directive-extractor', title: 'robots.txt Sitemap Line Extractor and Checker', desc: 'List every Sitemap line in a robots.txt and check that each is an absolute URL, not duplicated and not mixing http and https.',
  labels: ['robots.txt'], sample: ROBOTS_SAMPLE + 'Sitemap: /relative.xml\nSitemap: http://example.com/news.xml\nSitemap: https://example.com/sitemap.xml\nSitemap: https://example.com/feed.php\n',
  run: ([t]) => {
    need(t, 'a robots.txt'); const rb = parseRobots(t, { google: true }), rows = [], seen = new Set(), hosts = new Set(), schemes = new Set();
    for (const s of rb.sitemaps) {
      let note = 'ok'; const m = /^(https?):\/\/([^/\s?#]+)(\/[^\s?#]*)?/i.exec(s.url);
      if (!m) note = 'ERROR: must be an absolute URL starting with http:// or https://'; else { hosts.add(m[2].toLowerCase()); schemes.add(m[1].toLowerCase()); if (!/\.(xml|xml\.gz|txt)$/i.test(m[3] || '')) note = 'review: unusual extension (sitemaps are normally .xml, .xml.gz or .txt)'; }
      if (seen.has(s.url)) note = 'duplicate'; seen.add(s.url); rows.push([`line ${s.line}`, s.url, note]);
    }
    if (!rows.length) return 'No Sitemap lines. Add "Sitemap: https://example.com/sitemap.xml" (absolute URL) anywhere in the file; it applies to all crawlers.';
    return `${rows.length} Sitemap line(s)\n\n${table(rows, ['Where', 'URL', 'Check'])}\n\n${schemes.size > 1 ? 'Review: both http and https are used.\n' : ''}${hosts.size > 1 ? `Hosts: ${[...hosts].join(', ')} (a sitemap on another host is only honoured when that host is allowed to submit for yours).\n` : ''}\nPlain list:\n${[...seen].join('\n')}`;
  },
});

// ---------- 17 blocking resources ----------
const RES_PROBES = ['/wp-content/themes/site/style.css', '/wp-includes/js/jquery/jquery.min.js', '/wp-content/plugins/plugin/script.js', '/wp-content/uploads/2026/01/photo.jpg', '/assets/app.js', '/assets/main.css', '/static/css/main.css', '/static/js/bundle.js', '/_next/static/chunks/main.js', '/build/app.js', '/dist/app.css', '/css/site.css', '/js/app.js', '/images/hero.webp', '/fonts/body.woff2'];
tool({
  id: 'robots-blocked-resources-checker', title: 'robots.txt Blocked CSS, JS and Image Checker', desc: 'Check whether robots.txt blocks the CSS, JavaScript, image and font files a crawler needs to render your pages.',
  inputs: 2, labels: ['robots.txt', 'Your resource URLs, one per line (leave empty to test common paths)'], sample: 'User-agent: *\nDisallow: /wp-includes/\nDisallow: /assets/\nDisallow: /*.js$\nAllow: /assets/main.css\n', sample2: 'https://example.com/assets/app.js\nhttps://example.com/assets/main.css\nhttps://example.com/js/vendor.js',
  opts: [txt('agent', 'Crawler', 'Googlebot')],
  run: ([r, u], o) => {
    const rb = parseRobots(need(r, 'a robots.txt'), { google: true }), g = groupFor(rb, o.agent || 'Googlebot', gchain(o.agent || 'Googlebot'));
    const list = lines(u).map((x) => x.trim()).filter(Boolean), own = list.length > 0, urls = own ? list : RES_PROBES;
    const rows = urls.map((x) => { const d = decide(g.rules, pathOf(x)); return [d.allowed ? 'ok' : 'BLOCKED', x, ruleTxt(d)]; }), bl = rows.filter((x) => x[0] === 'BLOCKED').length;
    const sus = g.rules.filter((x) => x.type === 'disallow' && /(css|\.js|assets|static|wp-includes|wp-content|themes|plugins|_next|dist|build|fonts?|images?|img|media|uploads)/i.test(x.path)).map((x) => `  ${x.path} (line ${x.line})`);
    return `Group used: ${g.agent}. ${own ? 'Your URLs' : 'Common resource paths (not your real files)'}: ${bl} blocked of ${rows.length}.\n\n${table(rows, ['Result', 'Path', 'Deciding rule'])}\n\n${sus.length ? 'Disallow rules that look like they cover page resources (review):\n' + sus.join('\n') + '\n' : ''}\nReview: Google renders pages and needs the CSS and JavaScript they load. Blocking those files can make a page look broken to the crawler. Blocking /uploads/ or images only matters if you want them in image search. Use the URL Inspection tool in Search Console to confirm what a crawler really fetches.`;
  },
});

// ---------- 18 templates ----------
const TPL = {
  WordPress: { why: 'WordPress core serves a similar virtual file by default.', body: 'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nDisallow: /?s=\nDisallow: /search/' },
  WooCommerce: { why: 'WordPress rules plus cart, checkout and account pages and parameter URLs.', body: 'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nDisallow: /cart/\nDisallow: /checkout/\nDisallow: /my-account/\nDisallow: /*?add-to-cart=\nDisallow: /*?orderby=\nDisallow: /?s=' },
  Shopify: { why: 'Shopify generates robots.txt itself (edit it through robots.txt.liquid). This is the kind of rule set it uses, not a copy of the current default.', body: 'User-agent: *\nDisallow: /admin\nDisallow: /cart\nDisallow: /orders\nDisallow: /checkout\nDisallow: /account\nDisallow: /collections/*sort_by*\nDisallow: /search' },
  Magento: { why: 'Typical Magento hygiene: session ids, internal search, compare lists and customer areas.', body: 'User-agent: *\nDisallow: /index.php/\nDisallow: /*?SID=\nDisallow: /checkout/\nDisallow: /customer/\nDisallow: /catalogsearch/\nDisallow: /catalog/product_compare/\nDisallow: /*?dir=\nDisallow: /*?limit=\nDisallow: /*?order=' },
  'Static site or blog': { why: 'Everything public, only drafts and a search page blocked.', body: 'User-agent: *\nDisallow: /drafts/\nDisallow: /search' },
  'Allow everything': { why: 'An explicit "crawl everything" file. Same as having no file, but it avoids 404 noise in logs.', body: 'User-agent: *\nDisallow:' },
  'Staging or private site (block all)': { why: 'Stops well-behaved crawlers. It is not security and does not remove indexed URLs: add noindex or a password, and never ship this file to production.', body: 'User-agent: *\nDisallow: /' },
  'Block AI training crawlers': { why: 'Opt out of crawlers documented as collecting training data, keep normal search. Check the AI directory tool for the current list.', body: 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: Google-Extended\nDisallow: /\n\nUser-agent: Applebot-Extended\nDisallow: /\n\nUser-agent: Meta-ExternalAgent\nDisallow: /\n\nUser-agent: *\nDisallow:' },
};
tool({
  id: 'robots-txt-template-library', cat: GEN, title: 'robots.txt Templates for WordPress, Shopify, Magento and More', desc: 'Starting-point robots.txt files for WordPress, WooCommerce, Shopify, Magento, static sites, staging and AI-crawler opt-out, with a sitemap line.',
  inputs: 0, sample: '', opts: [sel('platform', 'Template', Object.keys(TPL)), txt('sitemap', 'Sitemap URL (optional)', 'https://example.com/sitemap.xml')],
  run: (_i, o) => { const t = TPL[o.platform]; if (!t) throw new Error('Pick a template.'); return `# ${o.platform}\n# ${t.why}\n${t.body}\n${o.sitemap.trim() ? `\nSitemap: ${o.sitemap.trim()}\n` : ''}\n# These are generic starting points, not vendor defaults. Test them with the robots.txt tester before you publish.`; },
});

// ---------- 19 staging ----------
const BIG_BOTS = ['Googlebot', 'Bingbot', 'GPTBot', 'ClaudeBot'];
tool({
  id: 'staging-robots-txt-checker', title: 'Staging robots.txt Left on Production Checker', desc: 'Detect a blanket Disallow: / (and noindex on the page) that was pushed from staging to production, or a staging site that is not blocked.',
  inputs: 2, labels: ['The robots.txt your site serves', 'Optional: response headers and page HTML head'], sample: 'User-agent: *\nDisallow: /\n', sample2: 'HTTP/1.1 200 OK\nX-Robots-Tag: noindex\n\n<html><head><meta name="robots" content="noindex, nofollow"></head>',
  opts: [sel('env', 'This is the', ['production site', 'staging or test site'])],
  run: ([r, p], o) => {
    const prod = o.env.startsWith('production'), rb = parseRobots(need(r, 'a robots.txt'), { google: true }), res = [], F = [];
    for (const b of ['*', ...BIG_BOTS]) { const g = b === '*' ? groupFor(rb, '*') : groupFor(rb, b, gchain(b)); const root = decide(g.rules, '/'), deep = decide(g.rules, '/products/item-1'); res.push([b, root.allowed ? 'allowed' : 'BLOCKED', deep.allowed ? 'allowed' : 'BLOCKED', g.agent]); }
    const blocked = res.filter((x) => x[2] === 'BLOCKED').length;
    if (prod && blocked) F.push(`REVIEW: ${blocked} crawler(s) are blocked from ordinary pages. If this is production, this is the classic "staging file shipped to live" problem and search traffic will fall.`);
    if (prod && !blocked) F.push('OK: ordinary pages are crawlable in robots.txt.');
    if (!prod && !blocked) F.push('REVIEW: this staging site is crawlable. Block it with a password; robots.txt alone only asks crawlers to stay away.');
    if (!prod && blocked) F.push('OK: crawlers are asked to stay out. Remember this does not stop already-linked URLs from being listed, and it must not reach production.');
    const page = String(p || '');
    if (page.trim()) { const nx = /noindex|\bnone\b/i.test((page.match(/<meta[^>]+name\s*=\s*["']?(?:robots|googlebot)["']?[^>]*>/gi) || []).join(' ')) || /x-robots-tag:[^\n]*(noindex|none)/i.test(page); F.push(nx ? (prod ? 'REVIEW: a noindex directive is present on the page or headers. On production that removes the page from search.' : 'OK: noindex is present on staging.') : (prod ? 'OK: no noindex found in the pasted headers or HTML.' : 'REVIEW: no noindex found on this staging page.')); }
    return `${table(res, ['Crawler', '/', '/products/item-1', 'Group used'])}\n\n${F.join('\n')}\n\nThe check reads only what you pasted. Compare against the live https://yoursite/robots.txt, and add it to your release checklist.`;
  },
});

// ---------- 20 robots meta ----------
const mkRobotsOpts = [sel('bot', 'Applies to', ['robots (all search engines)', 'googlebot', 'googlebot-news', 'bingbot']), sel('index', 'Indexing', ['index', 'noindex']), sel('follow', 'Links', ['follow', 'nofollow']), chk('nosnippet', 'nosnippet (no text snippet)', false), txt('maxSnippet', 'max-snippet (characters, -1 = no limit, empty = omit)', ''), sel('img', 'max-image-preview', ['(omit)', 'none', 'standard', 'large']), txt('maxVideo', 'max-video-preview (seconds, -1 = no limit, empty = omit)', ''), chk('noimageindex', 'noimageindex', false), chk('notranslate', 'notranslate', false), chk('noarchive', 'noarchive (Google ignores it today)', false), chk('indexifembedded', 'indexifembedded (needs noindex)', false), txt('after', 'unavailable_after (date, for example 2027-01-31T23:59:00+00:00)', '')];
function robotsDirectives(o) {
  const d = [], W = [];
  d.push(o.index); d.push(o.follow);
  if (o.nosnippet) d.push('nosnippet');
  const ms = String(o.maxSnippet ?? '').trim(); if (ms) { if (!/^-?\d+$/.test(ms)) throw new Error('max-snippet must be a whole number.'); d.push('max-snippet:' + ms); if (o.nosnippet) W.push('nosnippet already blocks snippets; max-snippet is redundant.'); }
  if (o.img && o.img !== '(omit)') d.push('max-image-preview:' + o.img);
  const mv = String(o.maxVideo ?? '').trim(); if (mv) { if (!/^-?\d+$/.test(mv)) throw new Error('max-video-preview must be a whole number.'); d.push('max-video-preview:' + mv); }
  if (o.noimageindex) d.push('noimageindex'); if (o.notranslate) d.push('notranslate'); if (o.noarchive) { d.push('noarchive'); W.push('Google lists noarchive as ignored for Search; other engines may still honour it.'); }
  if (o.indexifembedded) { if (o.index !== 'noindex') W.push('indexifembedded only works together with noindex.'); d.push('indexifembedded'); }
  if (String(o.after ?? '').trim()) d.push('unavailable_after: ' + o.after.trim());
  if (o.index === 'index' && o.follow === 'follow' && d.length === 2) W.push('index, follow is the default. The tag changes nothing unless you add other directives.');
  return { d, W };
}
tool({
  id: 'robots-meta-tag-generator', cat: GEN, title: 'Robots Meta Tag Generator (noindex, max-snippet, max-image-preview)', desc: 'Generate a robots meta tag and the matching X-Robots-Tag header with noindex, nofollow, max-snippet, max-image-preview, max-video-preview and unavailable_after.',
  inputs: 0, sample: '', opts: mkRobotsOpts.map((x) => (x.id === 'index' ? { ...x, def: 'noindex' } : x)),
  run: (_i, o) => {
    const { d, W } = robotsDirectives(o), name = o.bot.split(' ')[0], v = d.join(', ');
    return `<meta name="${name}" content="${v}">\n\nHTTP header equivalent:\nX-Robots-Tag: ${name === 'robots' ? '' : name + ': '}${v}\n${W.length ? '\nNotes:\n' + W.map((x) => '- ' + x).join('\n') + '\n' : ''}\nDirectives checked against Google's robots meta tag documentation (read 2026-10-23). Other engines support fewer. A page blocked in robots.txt is never fetched, so its meta tag is never seen.`;
  },
});

// ---------- 21 x-robots-tag ----------
const XR_OK = /^(all|noindex|nofollow|none|nosnippet|indexifembedded|max-snippet:-?\d+|max-image-preview:(none|standard|large)|max-video-preview:-?\d+|notranslate|noimageindex|noarchive|unavailable_after:.+)$/i;
tool({
  id: 'x-robots-tag-header-builder', cat: GEN, title: 'X-Robots-Tag Header Builder for Apache, Nginx and Cloudflare', desc: 'Build X-Robots-Tag rules for PDFs and other files or a whole site as Apache, Nginx, Cloudflare Transform Rule and _headers snippets.',
  inputs: 0, sample: '', opts: [txt('dir', 'Directives (comma separated)', 'noindex, nofollow'), sel('scope', 'Applies to', ['file extensions', 'whole site']), txt('ext', 'File extensions (comma separated)', 'pdf, docx'), txt('bot', 'Only for this crawler (optional, for example googlebot)', ''), sel('fmt', 'Format', ['all', 'Apache', 'Nginx', 'Cloudflare', '_headers'])],
  run: (_i, o) => {
    const ds = o.dir.split(',').map((x) => x.trim()).filter(Boolean); if (!ds.length) throw new Error('Add at least one directive.');
    const bad = ds.filter((x) => !XR_OK.test(x)); if (bad.length) throw new Error('Unknown directive: ' + bad.join(', '));
    const val = (o.bot.trim() ? o.bot.trim().toLowerCase() + ': ' : '') + ds.join(', '), ext = o.ext.split(',').map((x) => x.trim().replace(/^\./, '').toLowerCase()).filter((x) => /^[a-z0-9]+$/.test(x));
    const site = o.scope === 'whole site'; if (!site && !ext.length) throw new Error('Add at least one file extension.');
    const S = {
      Apache: site ? `Header set X-Robots-Tag "${val}"` : `<FilesMatch "\\.(${ext.join('|')})$">\n  Header set X-Robots-Tag "${val}"\n</FilesMatch>`,
      Nginx: site ? `add_header X-Robots-Tag "${val}" always;` : `location ~* \\.(${ext.join('|')})$ {\n  add_header X-Robots-Tag "${val}" always;\n}`,
      Cloudflare: site ? `Rules > Transform Rules > Modify Response Header\n  When: All incoming requests (expression: true)\n  Then: Set static  X-Robots-Tag = ${val}` : `Rules > Transform Rules > Modify Response Header\n  When (custom filter expression): (http.request.uri.path.extension in {${ext.map((e) => `"${e}"`).join(' ')}})\n  Then: Set static  X-Robots-Tag = ${val}`,
      _headers: site ? `/*\n  X-Robots-Tag: ${val}` : `# Netlify and Cloudflare Pages _headers files match paths, not extensions. Use one entry per file or folder:\n/downloads/*\n  X-Robots-Tag: ${val}`,
    };
    const keys = o.fmt === 'all' ? Object.keys(S) : [o.fmt];
    return keys.map((k) => `# ${k}\n${S[k]}`).join('\n\n') + '\n\nApache needs mod_headers. In Nginx, add_header inside a location replaces headers set in the server block. Check with: curl -I https://example.com/file.pdf\nCloudflare field names are from its rules language documentation; not tested against a live account here.';
  },
});

// ---------- 23 unsupported directives ----------
tool({
  id: 'robots-unsupported-directives-detector', title: 'Unsupported robots.txt Directives Detector (Noindex, Host, Crawl-delay)', desc: 'Flag lines such as Noindex, Nofollow, Host and Crawl-delay that Google ignores, with what to use instead.',
  labels: ['robots.txt'], sample: ROBOTS_SAMPLE + 'Host: example.com\nNofollow: /x/\nClean-param: ref /\n',
  run: ([t]) => {
    need(t, 'a robots.txt'); const rb = parseRobots(t, { google: true }), ALT = { noindex: 'Use <meta name="robots" content="noindex"> or an X-Robots-Tag header, on a page that crawlers may fetch.', nofollow: 'Use rel="nofollow" on links or a robots meta tag.', host: 'Use a 301 redirect to the preferred host and a canonical tag.', 'crawl-delay': 'Slow the server with 429/503 responses, or set crawl rate in the search engine\'s webmaster tools where offered.', 'clean-param': 'Use canonical tags, or Disallow patterns for parameters.', 'request-rate': 'Not supported by major engines.', 'visit-time': 'Not supported by major engines.' };
    const rows = rb.unknown.map((u) => { const k = u.key.toLowerCase(); return [`line ${u.line}`, `${u.key}: ${u.value}`, ALT[k] ? 'ignored by Google' : 'unknown to Google', ALT[k] || 'Not one of the four directives (user-agent, allow, disallow, sitemap) that RFC 9309 and Google define.']; });
    if (!rows.length) return 'No unsupported directives found. Only user-agent, allow, disallow and sitemap lines are present.';
    return `${rows.length} line(s) that Google does not use\n\n${table(rows, ['Where', 'Line', 'Google', 'Instead'])}\n\nGoogle supports only user-agent, allow, disallow and sitemap (Google's robots.txt documentation). Other search engines may read some of these lines; this tool does not check them.`;
  },
});

// ---------- 24 regex ----------
tool({
  id: 'robots-pattern-to-regex-converter', title: 'robots.txt Pattern to Regex Converter (for Log Analysis)', desc: 'Convert robots.txt Allow and Disallow paths with * and $ into regular expressions for grep, awk, BigQuery or log tools.',
  labels: ['robots.txt rules or bare paths'], sample: 'Disallow: /admin/\nDisallow: /*?sort=\nDisallow: /*.pdf$\nAllow: /admin/public/',
  run: ([t]) => {
    const rows = [];
    for (const l of lines(need(t, 'rules')).map((x) => x.replace(/#.*$/, '').trim()).filter(Boolean)) {
      const m = /^(allow|disallow)\s*:\s*(.*)$/i.exec(l), p = m ? m[2].trim() : l; if (!p) continue;
      const r = patRegex(p).source.replace(/\\\//g, '/'); rows.push([m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : '', p, r]);
    }
    if (!rows.length) throw new Error('No patterns found.');
    return table(rows, ['Rule', 'Pattern', 'Regex (match against path + query)']) + '\n\nThe regexes use "." for "*" and are anchored at the start of the path, like crawlers do. Use extended regex (grep -E, awk, PCRE, RE2). Apply them to the request path including the query string, case sensitive. Percent-encoded characters should be normalised first. The longest-match rule between Allow and Disallow is not part of a regex: apply it yourself.';
  },
});

// ---------- 25/26 url lister ----------
tool({
  id: 'robots-txt-url-lister', title: 'robots.txt URL Lister (http, https, www and Subdomains)', desc: 'List the robots.txt URL for every host variant (http, https, www, non-www, each subdomain) you need to check, because each has its own file.',
  labels: ['Domains or subdomains, one per line'], sample: 'example.com\nblog.example.com\nshop.example.com',
  opts: [chk('proto', 'Include http:// variants', true), chk('www', 'Include www / non-www counterpart', true)],
  run: ([t], o) => {
    const hosts = lines(need(t, 'domains')).map((x) => x.trim().replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0].toLowerCase()).filter(Boolean), out = [];
    for (const h of hosts) { if (!/^[a-z0-9.-]+$/.test(h) || !h.includes('.')) throw new Error('Not a hostname: ' + h); const hs = [h]; if (o.www) { const root = h.split('.').length === 2, alt = h.startsWith('www.') ? h.slice(4) : root ? 'www.' + h : ''; if (alt) hs.push(alt); } for (const x of hs) { out.push(`https://${x}/robots.txt`); if (o.proto) out.push(`http://${x}/robots.txt`); } }
    return [...new Set(out)].join('\n') + '\n\nA robots.txt only covers the exact protocol, host and port it is served from. https://example.com/robots.txt does not apply to blog.example.com or to http://example.com. Open each URL and check it returns 200 (or redirects to the preferred host).\nFinding subdomains needs certificate-log or DNS lookups, which this site does not do: paste a list from your own DNS zone or a CT-log export.';
  },
});

// ---------- 27 Googlebot simulator ----------
const GOOGLE_TOKENS = ['Googlebot', 'Googlebot-Image', 'Googlebot-Video', 'Googlebot-News', 'Storebot-Google', 'Google-InspectionTool', 'GoogleOther', 'GoogleOther-Image', 'GoogleOther-Video', 'Google-CloudVertexBot', 'Google-Extended'];
tool({
  id: 'googlebot-robots-rule-simulator', title: 'Googlebot robots.txt Rule Simulator (Parser Edge Cases)', desc: 'Test URLs the way Google reads robots.txt: accepted typos, group merging, 500 KiB cut-off, ignored directives and the least-restrictive tie-break.',
  inputs: 2, labels: ['robots.txt', 'URLs or paths, one per line'], sample: ROBOTS_SAMPLE + 'Disalow: /typo-dir/\n', sample2: URL_SAMPLE + '\nhttps://example.com/typo-dir/page',
  opts: [sel('bot', 'Google crawler', GOOGLE_TOKENS)],
  run: ([r, u], o) => {
    need(r, 'a robots.txt'); const urls = lines(need(u, 'URLs')).map((x) => x.trim()).filter(Boolean);
    const rb = parseRobots(r, { google: true, cut: true }), g = groupFor(rb, o.bot, gchain(o.bot)), strict = parseRobots(r, { cut: true });
    const rows = urls.map((x) => { const d = decide(g.rules, pathOf(x)); return [d.allowed ? 'ALLOWED' : 'BLOCKED', x.slice(0, 70), ruleTxt(d)]; });
    const N = [`Group used: ${g.agent === '(none)' ? 'none, so everything is allowed' : g.agent + ` (${g.groups.length} group${g.groups.length > 1 ? 's' : ''} merged)`}`];
    if (rb.truncatedAt) N.push(`The file is over 500 KiB: everything after line ${rb.truncatedAt} was ignored, as Google does.`);
    if (rb.typos.length) N.push(`Misspellings Google accepts (lines ${rb.typos.map((x) => x.line).join(', ')}); a strict RFC parser would ignore them: ${rb.typos.map((x) => x.key).join(', ')}`);
    const un = g.extras; if (un.length) N.push(`Ignored by Google in this group: ${[...new Set(un.map((x) => OTHER_CASE[x.key] || x.key))].join(', ')}`);
    const emp = g.rules.filter((x) => !x.path).length; if (emp) N.push(`${emp} rule(s) without a path are ignored.`);
    const diff = strict.groups.length !== rb.groups.length; if (diff) N.push('A strict parser would see a different number of groups than Google here.');
    return `${table(rows, ['Result', 'URL', 'Deciding rule'])}\n\n${N.join('\n')}\n\nThis follows Google's published robots.txt documentation and the behaviour of its open-source parser (typo list read from the source, 2026-10-23). It is a model, not Google's live crawler: confirm important pages with the robots.txt report and URL Inspection in Search Console.`;
  },
});

// ---------- 28 Bingbot simulator ----------
tool({
  id: 'bingbot-robots-rule-simulator', title: 'Bingbot robots.txt Rule Simulator (Compared with Googlebot)', desc: 'Test URLs for Bingbot, show its Crawl-delay and see where the result differs from Googlebot because of group selection.',
  inputs: 2, labels: ['robots.txt', 'URLs or paths, one per line'], sample: ROBOTS_SAMPLE + '\nUser-agent: Bingbot\nDisallow: /beta/\nCrawl-delay: 5\n', sample2: URL_SAMPLE + '\nhttps://example.com/beta/x',
  opts: [sel('bot', 'Bing crawler', ['Bingbot', 'AdIdxBot', 'BingPreview', 'MSNBot'])],
  run: ([r, u], o) => {
    const rb = parseRobots(need(r, 'a robots.txt')), urls = lines(need(u, 'URLs')).map((x) => x.trim()).filter(Boolean);
    const gb = groupFor(rb, o.bot), gg = groupFor(rb, 'Googlebot', gchain('Googlebot')), cd = gb.extras.find((x) => x.key === 'crawl-delay');
    let diffs = 0;
    const rows = urls.map((x) => { const p = pathOf(x), a = decide(gb.rules, p), b = decide(gg.rules, p), d = a.allowed !== b.allowed; if (d) diffs++; return [a.allowed ? 'ALLOWED' : 'BLOCKED', b.allowed ? 'allowed' : 'blocked', x.slice(0, 60), ruleTxt(a)]; });
    return `${o.bot} uses group: ${gb.agent}   Googlebot uses group: ${gg.agent}\nCrawl-delay for ${o.bot}: ${cd ? cd.value + ' (Bing is reported to read it, not verified here; Google ignores it)' : 'none'}\n\n${table(rows, [o.bot, 'Googlebot', 'URL', 'Deciding rule'])}\n\n${diffs} URL(s) differ.\nThe matching engine is RFC 9309 (longest match, Allow wins ties, * and $), used for both. Bing-specific parsing differences, if any, were NOT verified, and no misspelling tolerance is applied. Check results with Bing Webmaster Tools.`;
  },
});

// ---------- 29 annotator ----------
function describe(p) {
  if (p === '/') return 'the whole site';
  const end = p.endsWith('$'), q = end ? p.slice(0, -1) : p;
  if (!q) return 'nothing (an empty value)';
  if (q === '/*' || q === '*') return 'every URL';
  if (!q.includes('*')) return end ? `exactly the URL ${q}` : q.endsWith('/') ? `everything inside the folder ${q}` : `every URL that starts with ${q}`;
  if (/^\/?\*\?/.test(q)) return `any URL with a query string starting ${q.replace(/^\/?\*/, '')}`;
  const parts = q.split('*'); if (parts.length === 2 && parts[0] === '/' && end) return `any URL ending in ${parts[1]}`;
  return `URLs that start with ${parts[0] || '(anything)'} and then contain ${parts.slice(1).filter(Boolean).join(' ... ') || 'anything'}${end ? ', and end there' : ''}`;
}
tool({
  id: 'robots-txt-comment-annotator', cat: GEN, title: 'robots.txt Comment Annotator (Plain-English Rule Notes)', desc: 'Add a comment above each rule in a robots.txt that says in plain language which URLs it blocks or allows.',
  labels: ['robots.txt'], sample: ROBOTS_SAMPLE,
  run: ([t]) => {
    need(t, 'a robots.txt'); const out = []; let ua = '', uas = [], prevUA = false;
    for (const raw of lines(t.replace(/^﻿/, ''))) {
      const code = raw.split('#')[0].trim(), m = /^([^:]+):\s*(.*)$/.exec(code), k = m && m[1].trim().toLowerCase();
      if (k === 'user-agent') { out.push(raw); uas = prevUA ? [...uas, m[2]] : [m[2]]; ua = uas.join(', '); prevUA = true; continue; }
      if (code) prevUA = false;
      if ((k === 'disallow' || k === 'allow') && raw.indexOf('#') < 0) { const indent = /^\s*/.exec(raw)[0]; out.push(`${indent}# ${k === 'disallow' ? (m[2] ? 'Blocks ' : 'Blocks nothing, so all is allowed') : 'Allows '}${m[2] ? describe(m[2].trim()) : ''}${ua === '*' || !ua ? '' : ` for ${ua}`}`, raw); continue; }
      if (k === 'crawl-delay') { out.push(`# Asks for ${m[2]} s between requests (Google ignores this)`, raw); continue; }
      out.push(raw);
    }
    return out.join('\n');
  },
});

// ---------- 30 crawl budget ----------
tool({
  id: 'crawl-budget-waste-estimator', title: 'Crawl Budget Waste Estimator', desc: 'Estimate the share of crawler requests spent on parameter, facet and duplicate URLs, and how long a full crawl of your real pages takes.',
  inputs: 0, sample: '', opts: [num('good', 'Pages you want crawled', 20000), num('param', 'Parameter URLs (sort, session, tracking)', 40000), num('facet', 'Faceted navigation URLs', 150000), num('dup', 'Duplicate URLs (www, http, trailing slash, print)', 5000), num('rate', 'Crawler requests per day (for example from Search Console Crawl Stats)', 8000)],
  run: (_i, o) => {
    const g = +o.good, w = (+o.param || 0) + (+o.facet || 0) + (+o.dup || 0), r = +o.rate; if (!(g > 0) || !(r > 0)) throw new Error('Pages and crawl rate must be above 0.');
    const total = g + w, share = w / total, goodPerDay = r * (1 - share), now = g / goodPerDay, after = g / r;
    return `Crawlable URLs: ${total.toLocaleString('en')} (${g.toLocaleString('en')} wanted, ${w.toLocaleString('en')} waste)\nWaste share if the crawler visited URLs evenly: ${(share * 100).toFixed(1)}%\nRequests per day on waste: ${Math.round(r * share).toLocaleString('en')} of ${r.toLocaleString('en')}\n\nTime for one pass over your wanted pages:\n  now:                 ${now.toFixed(1)} days\n  waste fully removed: ${after.toFixed(1)} days (${Math.round((1 - after / now) * 100)}% faster)\n\nThis is a rough model. Real crawlers favour popular and fresh URLs and do not visit evenly, so use it to rank problems, not to predict. Crawl budget mostly matters for large sites or sites that publish many pages quickly. Use the URL Parameter Analyzer on a crawl export to get the counts.`;
  },
});

// ---------- 31 facet rules ----------
tool({
  id: 'faceted-navigation-robots-rule-builder', cat: GEN, title: 'Faceted Navigation robots.txt Rule Builder', desc: 'Generate robots.txt Disallow rules for filter, sort and tracking parameters, or block every parameter except a few you keep crawlable.',
  inputs: 2, labels: ['Parameters to block, one per line (color, size, sort...)', 'Parameters to keep crawlable (used by "block all except")'], sample: 'color\nsize\nsort\nsessionid', sample2: 'page',
  opts: [sel('mode', 'Mode', ['block the listed parameters', 'block all parameters except the kept ones']), txt('scope', 'Only under this path (optional, for example /collections/)', ''), txt('agent', 'User-agent', '*')],
  run: ([a, b], o) => {
    const clean = (x) => lines(x).map((v) => v.trim().replace(/^[?&]/, '').replace(/=.*$/, '')).filter(Boolean), bad = (v) => !/^[\w.\[\]-]+$/.test(v);
    const block = clean(a), keep = clean(b), sc = o.scope.trim(), pre = sc ? (sc.endsWith('/') ? sc : sc + '/') : '/'; [...block, ...keep].forEach((v) => { if (bad(v)) throw new Error('Odd parameter name: ' + v); });
    const rules = [];
    if (o.mode.startsWith('block the')) { if (!block.length) throw new Error('List at least one parameter.'); for (const p of block) rules.push(`Disallow: ${pre}*?${p}=`, `Disallow: ${pre}*&${p}=`); }
    else { rules.push(`Disallow: ${pre}*?*`); for (const p of keep) rules.push(`Allow: ${pre}*?${p}=`, `Allow: ${pre}*&${p}=`); }
    const ex = o.mode.startsWith('block the') ? block : keep, rg = rules.map((x) => { const [t, ...p] = x.split(': '); return { type: t.toLowerCase(), path: p.join(': ') }; });
    const tests = [`${pre}products?${(block[0] || 'x')}=1`, `${pre}products?page=2`, `${pre}products?${(block[1] || block[0] || 'x')}=1&page=2`, `${pre}products`].map((p) => [decide(rg, p).allowed ? 'allowed' : 'BLOCKED', p]);
    return `User-agent: ${o.agent || '*'}\n${rules.join('\n')}\n\nSample URLs against these rules:\n${table(tests, [])}\n\n${o.mode.startsWith('block all') ? 'Caution: "Allow ...page=" also lets page=2 plus a blocked parameter through. Longest match decides, so test your real URLs.\n' : ''}Notes: robots.txt stops crawling, not indexing. Blocked URLs that are linked can still be indexed without content, and crawlers cannot see canonical tags on blocked pages. Canonical tags or noindex are the safer way to consolidate, robots.txt is for saving crawl effort.`;
  },
});

// ---------- 33 status codes ----------
const STATUS = (c) => c >= 200 && c < 300 ? ['Success. The rules in the response are used.', 'Success. Rules are used.'] : c >= 300 && c < 400 ? ['Redirect. Google follows at least five hops, then treats the file as a 404 (no restrictions). Logical redirects (meta refresh, JavaScript) are not followed.', 'Crawlers should follow at least five redirects; after that they may treat it as unavailable.'] : c === 429 ? ['429 is the one 4xx code Google does NOT treat as "no robots.txt": it counts as a server error, so crawling is paused and the last good copy is used (see 5xx).', '4xx means unavailable, so everything may be crawled (RFC 9309 does not single out 429).'] : c >= 400 && c < 500 ? ['Treated as if there is no robots.txt: no crawl restrictions. Do not use 401 or 403 to slow crawlers.', 'Unavailable: the crawler may access any resource.'] : c >= 500 && c < 600 ? ['Server error. For the first 12 hours Google stops crawling the site and retries. After that, for up to 30 days it uses the last good cached copy (or assumes no restrictions if it has none). After 30 days a generally available site is treated as having no robots.txt; a site with availability problems stops being crawled.', 'Unreachable: assume complete disallow. After a long time (30 days is given as an example) crawlers may treat it as unavailable or use a cached copy.'] : null;
tool({
  id: 'robots-txt-status-code-explainer', title: 'robots.txt HTTP Status Code Explainer (200, 301, 404, 429, 503)', desc: 'See how Google and RFC 9309 treat each HTTP status code returned for robots.txt: success, redirect, 4xx unavailable and 5xx unreachable.',
  labels: ['Status codes, separated by spaces, commas or lines'], sample: '200\n301\n403\n404\n429\n503',
  run: ([t]) => {
    const codes = need(t, 'status codes').split(/[\s,;]+/).filter(Boolean), out = [];
    for (const c of codes) { const n = +c; if (!Number.isInteger(n) || n < 100 || n > 599) throw new Error('Not an HTTP status code: ' + c); const s = STATUS(n); out.push(`${n}`, s ? `  Google: ${s[0]}\n  RFC 9309: ${s[1]}` : `  Informational (1xx) is not defined for robots.txt. Final responses are what count.`, ''); }
    return out.join('\n') + 'Sources: Google Search Central "How Google interprets the robots.txt specification" and RFC 9309 section 2.3.1 (both read 2026-10-23). Other crawlers may differ. DNS and network failures count as server errors for Google. The practical advice: serve 200 with a file, or a plain 404 if you want no rules, and never a 5xx.';
  },
});

// ---------- AI crawler directory ----------
// v: 'vendor' = read on the vendor's own page on 2026-10-23, 'memory' = from memory, NOT verified.
const DOC = { OpenAI: 'platform.openai.com/docs/bots', Anthropic: 'support.claude.com (article 8896518)', Perplexity: 'docs.perplexity.ai/guides/bots', Google: 'developers.google.com/search/docs/crawling-indexing/google-common-crawlers', Apple: 'support.apple.com/en-us/119829', Meta: 'developers.facebook.com/docs/sharing/webmasters/web-crawlers', Amazon: 'developer.amazon.com/amazonbot', 'Common Crawl': 'commoncrawl.org/ccbot' };
const B = (t, op, cat, rob, v, note = '') => ({ t, op, cat, rob, v, note });
const BOTS = [
  B('GPTBot', 'OpenAI', 'training', 'obeys robots.txt', 'vendor', 'Crawls content that may train OpenAI foundation models.'),
  B('OAI-SearchBot', 'OpenAI', 'search', 'obeys robots.txt', 'vendor', 'Surfaces sites in ChatGPT search. Not used for training per OpenAI.'),
  B('ChatGPT-User', 'OpenAI', 'user fetch', 'rules may not apply (user-initiated)', 'vendor', 'Visits a page when a user or a GPT action asks.'),
  B('OAI-AdsBot', 'OpenAI', 'ads', 'not stated', 'vendor', 'Checks landing pages of ads submitted to ChatGPT.'),
  B('ClaudeBot', 'Anthropic', 'training', 'obeys robots.txt', 'vendor', 'Collects content that may contribute to training.'),
  B('Claude-SearchBot', 'Anthropic', 'search', 'robots.txt (general statement)', 'vendor', 'Improves search result quality.'),
  B('Claude-User', 'Anthropic', 'user fetch', 'robots.txt (general statement)', 'vendor', 'Fetches pages when a person asks Claude a question.'),
  B('anthropic-ai', 'Anthropic', 'training', 'unknown', 'memory', 'Older token. Not on Anthropic\'s current help page; kept for old robots.txt files.'),
  B('PerplexityBot', 'Perplexity', 'search', 'obeys robots.txt', 'vendor', 'Surfaces sites in Perplexity search. Perplexity says it is not for training.'),
  B('Perplexity-User', 'Perplexity', 'user fetch', 'generally ignores robots.txt', 'vendor', 'Fetches a page when a user asks.'),
  B('Google-Extended', 'Google', 'training', 'robots.txt control token only', 'vendor', 'Not a crawler and has no user-agent string. Controls Gemini training and grounding use; does not affect Search.'),
  B('GoogleOther', 'Google', 'other', 'obeys robots.txt', 'vendor', 'Generic crawler used by various Google teams.'),
  B('Google-CloudVertexBot', 'Google', 'other', 'obeys robots.txt', 'vendor', 'Crawls requested by site owners to build Vertex AI agents.'),
  B('Applebot', 'Apple', 'search', 'honours robots.txt, ignores Crawl-delay', 'vendor', 'Powers Spotlight, Siri and Safari search; data may also help train Apple models.'),
  B('Applebot-Extended', 'Apple', 'training', 'robots.txt control token', 'vendor', 'Does not crawl. Controls use of Applebot data for training.'),
  B('Meta-ExternalAgent', 'Meta', 'training', 'obeys robots.txt', 'vendor', 'Trains foundation models or indexes content.'),
  B('Meta-ExternalFetcher', 'Meta', 'user fetch', 'may bypass robots.txt', 'vendor', 'User-requested fetches for agent features.'),
  B('Meta-WebIndexer', 'Meta', 'search', 'robots.txt', 'vendor', 'Improves Meta AI search.'),
  B('Meta-ExternalAds', 'Meta', 'ads', 'robots.txt', 'vendor', 'Advertising and business products.'),
  B('facebookexternalhit', 'Meta', 'link preview', 'may bypass robots.txt', 'vendor', 'Fetches shared links for previews.'),
  B('Amazonbot', 'Amazon', 'training', 'honours robots.txt, no Crawl-delay', 'vendor', 'Improves Amazon services; may train Amazon AI models.'),
  B('Amzn-SearchBot', 'Amazon', 'search', 'honours robots.txt', 'vendor', 'Search experiences such as Alexa. Not for training per Amazon.'),
  B('Amzn-User', 'Amazon', 'user fetch', 'may not follow all directives', 'vendor', 'Live fetches for user requests.'),
  B('CCBot', 'Common Crawl', 'training', 'obeys robots.txt', 'vendor', 'Builds the open Common Crawl dataset that many models use.'),
  B('Bytespider', 'ByteDance', 'training', 'unknown', 'memory', 'Often reported to ignore robots.txt. Not verified.'),
  B('cohere-ai', 'Cohere', 'training', 'unknown', 'memory'),
  B('DuckAssistBot', 'DuckDuckGo', 'user fetch', 'unknown', 'memory'),
  B('MistralAI-User', 'Mistral', 'user fetch', 'unknown', 'memory'),
  B('Diffbot', 'Diffbot', 'data extraction', 'unknown', 'memory'),
  B('ImagesiftBot', 'Hive', 'training', 'unknown', 'memory'),
  B('Omgilibot', 'Webz.io', 'data extraction', 'unknown', 'memory'),
  B('Timpibot', 'Timpi', 'search', 'unknown', 'memory'),
  B('YouBot', 'You.com', 'search', 'unknown', 'memory'),
];
const CLASSIC = [['Googlebot', 'Google', 'search engine'], ['AdsBot-Google', 'Google', 'ads'], ['Google-InspectionTool', 'Google', 'testing tool'], ['Storebot-Google', 'Google', 'shopping'], ['bingbot', 'Microsoft', 'search engine'], ['AdIdxBot', 'Microsoft', 'ads'], ['BingPreview', 'Microsoft', 'preview'], ['YandexBot', 'Yandex', 'search engine'], ['Baiduspider', 'Baidu', 'search engine'], ['DuckDuckBot', 'DuckDuckGo', 'search engine'], ['Slurp', 'Yahoo', 'search engine'], ['Twitterbot', 'X', 'link preview'], ['LinkedInBot', 'LinkedIn', 'link preview'], ['Slackbot', 'Slack', 'link preview'], ['SemrushBot', 'Semrush', 'SEO tool'], ['AhrefsBot', 'Ahrefs', 'SEO tool'], ['MJ12bot', 'Majestic', 'SEO tool']].map(([t, op, cat]) => ({ t, op, cat, rob: 'varies', v: /^(Googlebot|Storebot-Google|Google-InspectionTool)$/.test(t) ? 'vendor' : 'memory', note: '' }));
const ALL_BOTS = [...BOTS, ...CLASSIC].sort((a, b) => b.t.length - a.t.length);
const matchBot = (ua) => { const u = ua.toLowerCase(); return ALL_BOTS.find((b) => u.includes(b.t.toLowerCase())) || null; };
const isGenericBot = (ua) => /bot\b|crawl|spider|slurp|fetch|scrap|curl\/|wget|python-requests|python-urllib|go-http-client|okhttp|httpclient|java\/|headless|libwww|axios|node-fetch|scrapy/i.test(ua);
const VERIFY = 'User-agent strings are easy to forge. Anything that matters should be verified by IP range or reverse DNS.';

tool({
  id: 'ai-crawler-user-agent-directory', cat: AI, title: 'AI Crawler User-Agent Directory (GPTBot, ClaudeBot and More)', desc: 'Searchable list of AI crawler robots.txt tokens with operator, purpose, robots.txt behaviour and whether each row was checked against the vendor page.',
  labels: ['Filter (word or bot name, empty = all)'], sample: '', placeholder: ['training, openai, claude...'],
  opts: [sel('cat', 'Purpose', ['all', 'training', 'search', 'user fetch', 'ads', 'other', 'data extraction', 'link preview'])],
  run: ([q], o) => {
    const w = (q || '').toLowerCase().split(/\s+/).filter(Boolean), rows = BOTS.filter((b) => (o.cat === 'all' || b.cat === o.cat) && w.every((x) => `${b.t} ${b.op} ${b.cat} ${b.note}`.toLowerCase().includes(x)));
    if (!rows.length) return 'No match.';
    const ops = [...new Set(rows.filter((b) => b.v === 'vendor').map((b) => b.op))];
    return `${rows.length} crawler(s)\n\n${table(rows.map((b) => [b.t, b.op, b.cat, b.rob, b.v === 'vendor' ? 'checked' : 'NOT verified']), ['robots.txt token', 'Operator', 'Purpose', 'robots.txt behaviour', 'Source'])}${rows.length <= 12 ? '\n\n' + rows.filter((b) => b.note).map((b) => `${b.t}: ${b.note}`).join('\n') : '\n\n(Filter to 12 rows or fewer to see a note for each crawler.)'}\n\n"checked" = read on the operator's own documentation on 2026-10-23:\n${ops.map((x) => '  ' + x + ': ' + DOC[x]).join('\n')}\n"NOT verified" = listed from memory; check before relying on it. Purposes change and new bots appear often. ${VERIFY}`;
  },
});

const BOT_SAMPLE = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.4; +https://openai.com/gptbot)\nMozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)\nMozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36\nMozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)\nMyCustomScraper/0.3 python-requests/2.31';
tool({
  id: 'bot-user-agent-identifier', cat: AI, title: 'Bot Identifier: Who Is Behind This User-Agent?', desc: 'Name the bot, operator and purpose behind each pasted user-agent string, with its robots.txt behaviour and a reminder to verify the source.',
  labels: ['User-agent strings, one per line'], sample: BOT_SAMPLE,
  run: ([t]) => {
    const rows = lines(need(t, 'user-agent strings')).map((x) => x.trim()).filter(Boolean).map((u) => { const b = matchBot(u); return b ? [u.slice(0, 50), b.t, b.op, b.cat, b.rob, b.v === 'vendor' ? 'checked' : 'not verified'] : [u.slice(0, 50), isGenericBot(u) ? 'unknown bot or tool' : 'no known bot (likely a browser)', '', '', '', '']; });
    return table(rows, ['User-agent (start)', 'Match', 'Operator', 'Purpose', 'robots.txt', 'Source']) + `\n\nMatching is by the bot name inside the string against ${ALL_BOTS.length} known names. ${VERIFY}`;
  },
});

// ---------- 35 AI audit ----------
const botState = (rb, tok) => {
  const g = groupFor(rb, tok, [tok]), named = g.agent.toLowerCase() === tok.toLowerCase(), root = decide(g.rules, '/'), dis = g.rules.filter((r) => r.type === 'disallow' && r.path);
  if (g.agent === '(none)') return { s: 'open (no rules apply)', named: false };
  const s = !root.allowed ? 'BLOCKED' : dis.length ? 'partly blocked' : 'open';
  return { s: s + (named ? '' : ' (via *)'), named };
};
tool({
  id: 'ai-bot-robots-txt-audit', cat: AI, title: 'AI Bot robots.txt Audit: Allowed, Blocked or Not Addressed', desc: 'Check a robots.txt against known AI crawlers and see which are blocked, allowed or not named, with their purpose.',
  labels: ['robots.txt'], sample: 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /private/\n\nUser-agent: *\nDisallow: /admin/\n',
  run: ([t]) => {
    const rb = parseRobots(need(t, 'a robots.txt'), { google: true }), rows = BOTS.filter((b) => b.t !== 'facebookexternalhit').map((b) => { const s = botState(rb, b.t); return [b.t, b.op, b.cat, s.s, s.named ? 'named' : 'not named', b.v === 'vendor' ? '' : 'unverified token']; });
    const un = rows.filter((r) => r[4] === 'not named').length, tr = BOTS.filter((b) => b.cat === 'training' && !botState(rb, b.t).named).map((b) => b.t);
    return table(rows, ['Crawler', 'Operator', 'Purpose', 'Effect on /', 'Named?', 'Note']) + `\n\n${un} of ${rows.length} crawlers are not named and follow the "*" group (or nothing).\n${tr.length ? 'Training crawlers not named: ' + tr.join(', ') : 'All listed training crawlers are named.'}\n\n"partly blocked" means some paths are disallowed but "/" is open. Blocking is advisory: only crawlers that obey robots.txt respect it, and user-initiated fetchers may not. See the AI crawler directory for sources.`;
  },
});

// ---------- logs ----------
const LOGRE = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d{3})\s+(\S+)(?:\s+"([^"]*)"\s+"([^"]*)")?/;
function parseLog(raw) {
  const m = LOGRE.exec(raw); if (!m) return null;
  const rq = m[3].split(' '), size = m[5] === '-' ? 0 : +m[5] || 0;
  return { ip: m[1], time: m[2], method: rq[0], path: rq[1] || '/', status: +m[4], size, ua: m[7] || '' };
}
const LOG_SAMPLE = [
  '66.249.66.1 - - [10/Oct/2026:13:55:36 +0000] "GET /guides/running-shoes HTTP/1.1" 200 5120 "-" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"',
  '20.171.206.4 - - [10/Oct/2026:13:56:01 +0000] "GET /admin/settings HTTP/1.1" 403 220 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.4; +https://openai.com/gptbot)"',
  '20.171.206.4 - - [10/Oct/2026:13:56:03 +0000] "GET /blog/post-1 HTTP/1.1" 200 8300 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.4; +https://openai.com/gptbot)"',
  '203.0.113.9 - - [10/Oct/2026:13:57:10 +0000] "GET /blog/post-1 HTTP/1.1" 200 8300 "-" "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)"',
  '198.51.100.7 - - [10/Oct/2026:13:58:42 +0000] "GET / HTTP/1.1" 200 10450 "https://www.google.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"',
  '198.51.100.8 - - [10/Oct/2026:13:59:00 +0000] "GET /shop?sort=price HTTP/1.1" 200 9100 "-" "python-requests/2.31"',
].join('\n');
const top = (m, n = 10) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '0%');
function readLog(t) { const L = lines(need(t, 'access log lines')).filter((x) => x.trim()), ok = []; for (const l of L) { const p = parseLog(l); if (p) ok.push(p); } if (!ok.length) throw new Error('No lines in combined log format were found.'); return { ok, bad: L.length - ok.length }; }

tool({
  id: 'ai-bot-access-log-analyzer', cat: AI, title: 'AI Bot Access Log Analyzer (Hits per Crawler, Path and Status)', desc: 'Paste Apache or Nginx access log lines and count hits per AI crawler, with top paths and status codes for each.',
  labels: ['Access log lines (combined format)'], sample: LOG_SAMPLE,
  run: ([t]) => {
    const { ok, bad } = readLog(t), by = new Map();
    for (const e of ok) { const b = BOTS.find((x) => e.ua.toLowerCase().includes(x.t.toLowerCase())); if (!b) continue; const r = by.get(b.t) || { b, n: 0, paths: new Map(), st: new Map(), ips: new Set() }; r.n++; r.paths.set(e.path.split('?')[0], (r.paths.get(e.path.split('?')[0]) || 0) + 1); r.st.set(e.status, (r.st.get(e.status) || 0) + 1); r.ips.add(e.ip); by.set(b.t, r); }
    const n = [...by.values()].reduce((s, r) => s + r.n, 0);
    if (!n) return `${ok.length} requests read${bad ? `, ${bad} unreadable lines` : ''}. No known AI crawler found.`;
    const out = [`${ok.length} requests, ${n} from AI crawlers (${pct(n, ok.length)})${bad ? `, ${bad} unreadable lines skipped` : ''}`, '', table([...by.values()].sort((a, b) => b.n - a.n).map((r) => [r.b.t, r.b.op, r.b.cat, r.n, r.ips.size, top(r.st, 4).map(([s, c]) => `${s}:${c}`).join(' ')]), ['Crawler', 'Operator', 'Purpose', 'Hits', 'IPs', 'Status codes'])];
    for (const r of [...by.values()].sort((a, b) => b.n - a.n)) out.push('', `${r.b.t} top paths:`, ...top(r.paths, 5).map(([p, c]) => `  ${pad(c, 5)} ${p}`));
    return out.join('\n') + `\n\nOnly the combined log format is parsed. Matching is by user-agent text. ${VERIFY} IP addresses stay in your browser.`;
  },
});

const SEARCH_BOTS = /googlebot|bingbot|adidxbot|bingpreview|yandex|baiduspider|duckduckbot|slurp|storebot|google-inspectiontool|adsbot/i;
tool({
  id: 'bot-traffic-share-calculator', cat: AI, title: 'Bot Traffic Share Calculator: Human vs Search Bot vs AI Bot', desc: 'Split a pasted access log sample into likely human, search engine bot, AI bot and other bot requests, by requests and bytes.',
  labels: ['Access log lines (combined format)'], sample: LOG_SAMPLE,
  run: ([t]) => {
    const { ok, bad } = readLog(t), c = { 'AI bot': [0, 0], 'Search engine bot': [0, 0], 'Other bot or tool': [0, 0], 'Likely human': [0, 0] };
    for (const e of ok) { const k = BOTS.some((b) => e.ua.toLowerCase().includes(b.t.toLowerCase())) ? 'AI bot' : SEARCH_BOTS.test(e.ua) ? 'Search engine bot' : isGenericBot(e.ua) || !e.ua || e.ua === '-' ? 'Other bot or tool' : 'Likely human'; c[k][0]++; c[k][1] += e.size; }
    const tb = ok.reduce((s, e) => s + e.size, 0);
    return `${ok.length} requests${bad ? `, ${bad} unreadable lines skipped` : ''}\n\n${table(Object.entries(c).map(([k, [n, b]]) => [k, n, pct(n, ok.length), (b / 1048576).toFixed(2) + ' MB', pct(b, tb)]), ['Class', 'Requests', 'Share', 'Bytes', 'Byte share'])}\n\nHeuristic: the class comes from the user-agent only. Bots that pretend to be browsers count as human, so the human share is an upper bound. Googlebot and Applebot appear under search bot and AI bot respectively; a sample of a few hours can mislead.`;
  },
});

tool({
  id: 'robots-txt-compliance-log-checker', cat: AI, title: 'robots.txt Compliance Log Checker (Bots Hitting Disallowed Paths)', desc: 'Cross-reference access log hits with robots.txt rules to find crawlers that requested paths they were told not to fetch.',
  inputs: 2, labels: ['robots.txt', 'Access log lines (combined format)'], sample: 'User-agent: GPTBot\nDisallow: /admin/\n\nUser-agent: *\nDisallow: /shop?\nDisallow: /admin/\n', sample2: LOG_SAMPLE,
  run: ([r, l]) => {
    const rb = parseRobots(need(r, 'a robots.txt'), { google: true }), { ok } = readLog(l), names = [...new Set(rb.groups.flatMap((g) => g.agents.map((a) => a.name)).filter((n) => n && n !== '*'))], res = new Map();
    for (const e of ok) {
      if (e.path.split('?')[0] === '/robots.txt') continue;
      const nm = names.find((n) => e.ua.toLowerCase().includes(n.toLowerCase())), bot = nm || (isGenericBot(e.ua) || matchBot(e.ua) ? (matchBot(e.ua)?.t || 'unnamed bot') : null); if (!bot) continue;
      const g = groupFor(rb, nm || '*'), d = decide(g.rules, e.path), x = res.get(bot) || { n: 0, v: 0, ok: 0, paths: new Map() }; x.n++;
      if (!d.allowed) { x.v++; if (e.status < 400) x.ok++; x.paths.set(e.path, (x.paths.get(e.path) || 0) + 1); } res.set(bot, x);
    }
    if (!res.size) return 'No bot requests found in the log.';
    const out = [table([...res.entries()].map(([b, x]) => [b, x.n, x.v, x.ok, x.v ? (x.v === x.ok ? 'REVIEW: served' : 'blocked by server') : 'compliant in this sample']), ['Bot', 'Requests', 'Hit disallowed', 'of which served (<400)', 'Verdict'])];
    for (const [b, x] of res) if (x.v) out.push('', `${b} disallowed paths requested:`, ...top(x.paths, 5).map(([p, c]) => `  ${pad(c, 4)} ${p}`));
    return out.join('\n') + `\n\nCaveats: the rules are applied as they are now, but the bot may have fetched robots.txt before you changed it (crawlers cache it up to a day or more). Bots without their own group are judged by the "*" group. User-triggered fetchers (such as ChatGPT-User) are expected to ignore robots.txt. ${VERIFY}`;
  },
});

// ---------- IP ranges ----------
function parseIP(s) {
  s = s.trim();
  let m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (m) { const p = m.slice(1).map(Number); if (p.some((x) => x > 255)) return null; return { v: 4, n: p.reduce((a, x) => (a << 8n) + BigInt(x), 0n) }; }
  if (!/^[0-9a-f:]+$/i.test(s) || !s.includes(':') || (s.match(/::/g) || []).length > 1) return null;
  let [h, t] = s.split('::'); const A = h ? h.split(':') : [], Z = t ? t.split(':') : [];
  if (s.includes('::')) { const miss = 8 - A.length - Z.length; if (miss < 1) return null; A.push(...Array(miss).fill('0'), ...Z); } else if (A.length !== 8) return null;
  if (A.length !== 8 || A.some((x) => !/^[0-9a-f]{1,4}$/i.test(x))) return null;
  return { v: 6, n: A.reduce((a, x) => (a << 16n) + BigInt(parseInt(x, 16)), 0n) };
}
function parseCidr(s) {
  const [a, l] = s.split('/'), ip = parseIP(a); if (!ip) return null; const max = ip.v === 4 ? 32 : 128, len = l === undefined ? max : +l;
  if (!Number.isInteger(len) || len < 0 || len > max) return null; const sh = BigInt(max - len);
  return { v: ip.v, base: (ip.n >> sh) << sh, sh, text: s };
}
const inCidr = (ip, c) => ip.v === c.v && (ip.n >> c.sh) << c.sh === c.base;
function readRanges(t) {
  const cands = String(t).match(/(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?|[0-9a-fA-F]{0,4}(?::[0-9a-fA-F]{0,4}){2,7}(?:\/\d{1,3})?/g) || [], out = [];
  for (const c of cands) { const r = parseCidr(c); if (r) out.push(r); }
  if (!out.length) throw new Error('No IP ranges found. Paste the vendor\'s JSON file or one CIDR per line.');
  return out;
}
const RANGE_SAMPLE = '{"creationTime": "2026-10-01T00:00:00.000000", "prefixes": [{"ipv4Prefix": "192.0.2.0/24"}, {"ipv4Prefix": "198.51.100.0/25"}, {"ipv6Prefix": "2001:db8::/32"}]}';
tool({
  id: 'crawler-ip-range-checker', cat: AI, title: 'Crawler IP Range Checker (Googlebot, Bingbot, GPTBot JSON Lists)', desc: 'Paste a crawler operator\'s published IP range JSON (or CIDR lines) and test whether IP addresses belong to it. Works for Google, Bing and OpenAI lists.',
  inputs: 2, labels: ['Published ranges: the operator\'s JSON file or CIDR lines (the sample uses documentation addresses, not real crawler ranges)', 'IP addresses, one per line'], sample: RANGE_SAMPLE, sample2: '192.0.2.77\n198.51.100.200\n2001:db8:abcd::1\n203.0.113.5',
  run: ([r, i]) => {
    const ranges = readRanges(r), ips = lines(need(i, 'IP addresses')).map((x) => x.trim()).filter(Boolean), rows = ips.map((x) => { const ip = parseIP(x.split(/\s/)[0]); if (!ip) return [x, 'not a valid IP', '']; const hit = ranges.find((c) => inCidr(ip, c)); return [x, hit ? 'IN RANGE' : 'not in list', hit ? hit.text : '']; });
    return `${ranges.length} range(s) read. ${rows.filter((x) => x[1] === 'IN RANGE').length} of ${ips.length} IP(s) in range.\n\n${table(rows, ['IP', 'Result', 'Range'])}\n\nDownload the current list from the operator yourself (Google: common-crawlers.json and related files; OpenAI: gptbot.json, searchbot.json, chatgpt-user.json; Bing: its bingbot.json), because this site makes no network requests. Lists change, so use a fresh copy. An IP in range proves the source, a matching user-agent alone proves nothing.`;
  },
});

const RDNS = { 'Google common crawlers (Googlebot)': ['googlebot.com'], 'Google special-case crawlers': ['google.com'], 'Google user-triggered fetchers': ['googleusercontent.com', 'google.com'], Applebot: ['applebot.apple.com'], CCBot: ['crawl.commoncrawl.org'], 'Bingbot (suffix from memory, verify with Bing docs)': ['search.msn.com'] };
tool({
  id: 'bot-reverse-dns-verifier', cat: AI, title: 'Reverse DNS Bot Verifier (Check host and Forward Lookup Results)', desc: 'Paste the IP, reverse hostname and forward lookup you got from the host command and check them against the crawler operator\'s domain.',
  labels: ['One line per check: IP, reverse hostname, forward IP (separated by spaces). A line with only an IP prints the commands to run.'], sample: '66.249.66.1 crawl-66-249-66-1.googlebot.com 66.249.66.1\n203.0.113.9 evil.example.net 203.0.113.9\n198.51.100.5',
  opts: [sel('bot', 'Claimed crawler', Object.keys(RDNS))],
  run: ([t], o) => {
    const suf = RDNS[o.bot], out = [];
    for (const l of lines(need(t, 'checks')).map((x) => x.trim()).filter(Boolean)) {
      const [ip, host, fwd] = l.split(/\s+/), a = parseIP(ip); if (!a) { out.push(`${l}: not a valid IP`); continue; }
      if (!host) { out.push(`${ip}: run  host ${ip}  then  host <hostname returned>  and paste "${ip} <hostname> <forward IP>"`); continue; }
      const h = host.toLowerCase().replace(/\.$/, ''), okH = suf.some((s) => h.endsWith('.' + s)), f = fwd && parseIP(fwd), okF = f && f.v === a.v && f.n === a.n;
      out.push(`${ip}: ${okH && okF ? 'VERIFIED' : 'NOT VERIFIED'}   hostname ${okH ? 'is under' : 'is NOT under'} ${suf.join(' / ')}; forward lookup ${!fwd ? 'missing' : okF ? 'returns the same IP' : 'does NOT return the same IP'}`);
    }
    return out.join('\n') + '\n\nMethod (Google, Apple and Common Crawl document it): reverse-lookup the IP, check the domain, forward-lookup the hostname, and require the original IP. Both steps are needed because anyone can set a reverse record. This tool cannot run DNS queries; you run them in a terminal. IPv6 reverse records are not available for every crawler.';
  },
});

tool({
  id: 'fake-googlebot-log-detector', cat: AI, title: 'Fake Googlebot Detector for Access Logs', desc: 'Find log lines that claim to be Googlebot, then flag the IPs that are outside Google\'s published ranges (paste the JSON) or list them for DNS checks.',
  inputs: 2, labels: ['Access log lines (combined format)', 'Optional: Google\'s published ranges (common-crawlers.json or CIDR lines)'], sample: LOG_SAMPLE + '\n203.0.113.50 - - [10/Oct/2026:14:00:00 +0000] "GET /admin HTTP/1.1" 200 100 "-" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"', sample2: '192.0.2.0/24\n66.249.64.0/19',
  run: ([l, r]) => {
    const { ok } = readLog(l), claims = ok.filter((e) => /googlebot|googleother|google-inspectiontool|storebot-google/i.test(e.ua)), ips = new Map();
    for (const e of claims) { const x = ips.get(e.ip) || { n: 0, paths: new Set() }; x.n++; x.paths.add(e.path); ips.set(e.ip, x); }
    if (!claims.length) return 'No log lines claim to be a Google crawler.';
    const ranges = String(r || '').trim() ? readRanges(r) : null;
    const rows = [...ips.entries()].map(([ip, x]) => { const a = parseIP(ip); const hit = ranges && a ? ranges.some((c) => inCidr(a, c)) : null; return [ip, x.n, hit === null ? 'unchecked' : hit ? 'in Google range' : 'OUTSIDE ranges: likely fake', [...x.paths][0]]; });
    return `${claims.length} request(s) claim to be Google, from ${ips.size} IP(s)\n\n${table(rows, ['IP', 'Requests', 'Range check', 'First path'])}\n\n${ranges ? 'Compared with the ranges you pasted. A stale range file gives false alarms: download a fresh copy from Google (common-crawlers.json, special-crawlers.json, user-triggered-fetchers.json).' : 'No ranges pasted. Verify each IP with reverse DNS (host <ip> must end in googlebot.com or google.com, then host <name> must return the IP), or paste Google\'s JSON in the second box.'}\nGoogle documents these checks on Search Central ("Verifying Googlebot and other Google crawlers").`;
  },
});

// ---------- 46 llms-full ----------
tool({
  id: 'llms-full-txt-builder', cat: GEN, title: 'llms-full.txt Builder (Combine Pages into One File)', desc: 'Combine pasted page contents into a single llms-full.txt with a title, summary and a consistent heading and source line for every page.',
  labels: ['Pages: start each with a line "=== https://example.com/page | Page title", then its text or Markdown'], sample: '=== https://example.com/start | Getting started\nInstall the tool and run it.\n\n=== https://example.com/api | API reference\n<h2>Endpoints</h2><p>GET /items returns a list.</p>',
  opts: [txt('name', 'Site name', 'Example'), txt('summary', 'One-line summary (optional)', 'Browser-based tools. Everything runs locally.'), chk('strip', 'Strip HTML tags', true)],
  run: ([t], o) => {
    const parts = need(t, 'pages').split(/^===\s*/m).slice(1); if (!parts.length) throw new Error('Start each page with a line like: === https://example.com/page | Title');
    const out = [`# ${o.name || 'Site'}`]; if (o.summary.trim()) out.push('', `> ${o.summary.trim()}`);
    for (const p of parts) {
      const [head, ...rest] = p.split(/\r?\n/), [url, title] = head.split('|').map((x) => x.trim()); let body = rest.join('\n');
      if (o.strip) body = body.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, x) => `\n${'#'.repeat(Math.min(6, +n + 1))} ${x}\n`).replace(/<li[^>]*>/gi, '- ').replace(/<\/(p|div|li|tr)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      out.push('', `## ${title || url}`, `Source: ${url}`, '', body.replace(/\n{3,}/g, '\n\n').trim());
    }
    return out.join('\n') + '\n';
  },
});

// ---------- 47 ai.txt ----------
const AITXT = { Text: ['txt', 'md', 'html', 'pdf', 'doc', 'docx', 'rtf', 'epub'], Images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'tiff'], Audio: ['mp3', 'wav', 'flac', 'ogg', 'aac'], Video: ['mp4', 'mov', 'webm', 'avi', 'mkv'], Code: ['js', 'ts', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'css'] };
tool({
  id: 'ai-txt-generator', cat: GEN, title: 'ai.txt Generator (AI Training Permissions by File Type)', desc: 'Create an ai.txt that allows or disallows AI training per media type: text, images, audio, video and code.',
  inputs: 0, sample: '', opts: Object.keys(AITXT).map((k) => sel(k, `${k} (${AITXT[k].slice(0, 4).join(', ')}...)`, ['disallow', 'allow'])).concat([txt('extra', 'Extra extensions to disallow (comma separated, optional)', '')]),
  run: (_i, o) => {
    const dis = [], al = []; for (const k of Object.keys(AITXT)) (o[k] === 'allow' ? al : dis).push(...AITXT[k]);
    dis.push(...o.extra.split(',').map((x) => x.trim().replace(/^\.|\*\./g, '').toLowerCase()).filter((x) => /^[a-z0-9]+$/.test(x)));
    return `# ai.txt: permissions for AI training use of this site's files\nUser-Agent: *\n${dis.map((e) => `Disallow: *.${e}`).join('\n')}${al.length ? '\n' + al.map((e) => `Allow: *.${e}`).join('\n') : ''}\n\n# Save as /ai.txt in your site root.\n# ai.txt is a proposal by Spawning; I could not load its specification, so the syntax above (robots.txt-style wildcards per file type) is from memory and NOT verified.\n# No AI company is documented to read it. robots.txt and the TDM headers are the signals more likely to be honoured.`;
  },
});

// ---------- 48 TDMRep builder ----------
tool({
  id: 'tdm-reservation-header-builder', cat: GEN, title: 'TDMRep Builder: tdm-reservation Header, Meta Tag and tdmrep.json', desc: 'Generate the W3C TDM Reservation Protocol signals for EU text-and-data-mining opt-out: HTTP headers, HTML meta tags and /.well-known/tdmrep.json.',
  labels: ['Optional path rules, one per line: location | 1 or 0 | policy URL (optional)'], sample: '/ | 1 | https://example.com/tdm-policy.json\n/open-data/ | 0',
  opts: [sel('res', 'Site-wide reservation for headers and meta', ['1 (rights reserved)', '0 (not reserved)']), txt('policy', 'Policy URL (optional)', 'https://example.com/tdm-policy.json')],
  run: ([t], o) => {
    const v = o.res[0], pol = o.policy.trim(); if (pol && !/^https?:\/\//.test(pol)) throw new Error('Policy must be an absolute URL.');
    const rules = lines(t || '').map((l) => l.trim()).filter(Boolean).map((l) => { const [loc, r, p] = l.split('|').map((x) => x.trim()); if (!loc.startsWith('/')) throw new Error('Location must start with /: ' + loc); if (!['0', '1'].includes(r)) throw new Error(`Reservation must be 1 or 0 for ${loc}`); const x = { location: loc, 'tdm-reservation': +r }; if (p) { if (!/^https?:\/\//.test(p)) throw new Error('Policy must be an absolute URL: ' + p); x['tdm-policy'] = p; } return x; });
    return `# HTTP response headers\ntdm-reservation: ${v}${pol && v === '1' ? `\ntdm-policy: ${pol}` : ''}\n\n# HTML <head>\n<meta name="tdm-reservation" content="${v}">${pol && v === '1' ? `\n<meta name="tdm-policy" content="${pol}">` : ''}\n\n# Apache (mod_headers)\nHeader set tdm-reservation "${v}"\n\n# Nginx\nadd_header tdm-reservation "${v}" always;\n${rules.length ? `\n# /.well-known/tdmrep.json (first matching rule wins, so put specific paths first)\n${JSON.stringify(rules, null, 2)}\n` : ''}\nBased on the W3C TDM Reservation Protocol community report (final report of 2024-05-10, read 2026-10-23). Per the spec a policy is not processed when the reservation is 0, and the spec advises using one technique rather than several. This is a technical signal, not legal advice: how it works under EU copyright law (Article 4 of Directive 2019/790) is a legal question.`;
  },
});

// ---------- 49 TDMRep validator ----------
tool({
  id: 'tdmrep-json-validator', title: 'TDMRep JSON Validator (/.well-known/tdmrep.json)', desc: 'Validate a tdmrep.json file against the W3C TDM Reservation Protocol: array shape, location patterns, 1 or 0 values, policy URLs and rule order.',
  labels: ['tdmrep.json'], sample: '[\n  {"location": "/", "tdm-reservation": 1, "tdm-policy": "https://example.com/policy.json"},\n  {"location": "/open/*.jpg", "tdm-reservation": 0},\n  {"location": "docs", "tdm-reservation": "yes", "extra": true}\n]',
  run: ([t]) => {
    let j; try { j = JSON.parse(need(t, 'a tdmrep.json')); } catch (e) { throw new Error('Not valid JSON: ' + e.message.slice(0, 80)); }
    const I = [], add = (l, m) => I.push([l, m]);
    if (!Array.isArray(j)) add('ERROR', 'The top level must be an array, even for a single rule.'); else {
      j.forEach((r, i) => {
        const w = `rule ${i + 1}`; if (!r || typeof r !== 'object' || Array.isArray(r)) return add('ERROR', `${w}: must be an object`);
        if (typeof r.location !== 'string') add('ERROR', `${w}: "location" is required and must be a string`); else if (!r.location.startsWith('/')) add('ERROR', `${w}: location "${r.location}" should be a path starting with /`);
        if (r['tdm-reservation'] === undefined) add('ERROR', `${w}: "tdm-reservation" is required`); else if (r['tdm-reservation'] !== 0 && r['tdm-reservation'] !== 1) add('ERROR', `${w}: tdm-reservation must be the number 1 or 0 (anything else is a protocol error; agents treat it as unset)`);
        if (r['tdm-policy'] !== undefined && (typeof r['tdm-policy'] !== 'string' || !/^https?:\/\/\S+$/.test(r['tdm-policy']))) add('ERROR', `${w}: tdm-policy must be an absolute URL`);
        if (r['tdm-policy'] && r['tdm-reservation'] === 0) add('WARN', `${w}: a policy is ignored when tdm-reservation is 0`);
        for (const k of Object.keys(r)) if (!['location', 'tdm-reservation', 'tdm-policy'].includes(k)) add('WARN', `${w}: unknown key "${k}"`);
        if (typeof r.location === 'string') for (let p = 0; p < i; p++) { const q = j[p]; if (q && typeof q.location === 'string' && q.location.startsWith('/') && r.location.startsWith('/') && patRegex(q.location).test(r.location.replace(/\$$/, '').replace(/\*/g, 'x'))) { add('WARN', `${w} (${r.location}) is never reached for some paths: rule ${p + 1} (${q.location}) matches first, and the first match wins`); break; } }
      });
      if (!j.length) add('WARN', 'The array is empty, so nothing is reserved.');
    }
    return (I.length ? table(I, ['Level', 'Finding']) : 'No problems found.') + '\n\nChecked against the W3C TDMRep community report (2024-05-10). Location patterns use * and $ like robots.txt and are case sensitive. The file should be served as application/json from /.well-known/tdmrep.json.';
  },
});

// ---------- 50 noai ----------
tool({
  id: 'noai-meta-tag-generator', cat: GEN, title: 'noai and noimageai Meta Tag Generator', desc: 'Generate noai and noimageai robots meta tags and X-Robots-Tag headers, with an honest note on who reads them.',
  inputs: 0, sample: '', opts: [chk('noai', 'noai (text and content)', true), chk('noimageai', 'noimageai (images)', true), sel('name', 'Meta name', ['robots', 'googlebot', 'bingbot'])],
  run: (_i, o) => {
    const d = [o.noai && 'noai', o.noimageai && 'noimageai'].filter(Boolean); if (!d.length) throw new Error('Pick at least one directive.');
    return `<meta name="${o.name}" content="${d.join(', ')}">\n\nHTTP header:\nX-Robots-Tag: ${d.join(', ')}\n\nNotes:\n- noai and noimageai are not part of any standard. They were introduced by an art platform (DeviantArt) as an opt-out signal. Google's list of robots rules does not include them.\n- Which AI crawlers or platforms honour them is NOT verified here and the support is believed to be small. The robots.txt tokens of AI crawlers (see the AI crawler directory) are the better-documented control.\n- Using the name "googlebot" or "bingbot" only helps if that crawler reads the directive; "robots" is the usual choice.`;
  },
});

// ---------- 51-53 bot block rules ----------
const botList = (t) => { const l = lines(need(t, 'bot names')).map((x) => x.trim().replace(/^user-agent:\s*/i, '')).filter(Boolean); l.forEach((x) => { if (!/^[A-Za-z0-9._-]+$/.test(x)) throw new Error('Use plain bot tokens such as GPTBot (letters, digits, . _ -): ' + x); }); return [...new Set(l)]; };
const BLOCK_SAMPLE = 'GPTBot\nClaudeBot\nCCBot\nBytespider\nAmazonbot';
const NOTE = '\n\nUser-agent blocking only stops bots that tell the truth about who they are, and it also blocks any real visitor whose user-agent contains the word. Put the same bots in robots.txt first, test with:  curl -A "GPTBot" -I https://example.com/';
function botRules(bots, fmt, o) {
  const alt = bots.join('|'), st = +o.status || 403, rl = o.action && o.action.startsWith('rate');
  const nginxMap = (v) => `map $http_user_agent $${v} {\n    default 0;\n    ~*(${alt}) 1;\n}`;
  const S = {
    Cloudflare: `Security > WAF > Custom rules > Create rule\n  Expression: ${bots.map((b) => `(http.user_agent contains "${b}")`).join(' or ')}\n  Action: ${rl ? 'use a Rate limiting rule with the same expression (Security > WAF > Rate limiting rules)' : 'Block'}`,
    Nginx: rl ? `${nginxMap('is_bot')}\n\nmap $is_bot $bot_key {\n    0 "";\n    1 $binary_remote_addr;\n}\n\nlimit_req_zone $bot_key zone=bots:10m rate=${o.rate || '30r/m'};\nlimit_req_status 429;\n\nserver {\n    limit_req zone=bots burst=5 nodelay;\n}` : `${nginxMap('is_blocked_bot')}\n\nserver {\n    if ($is_blocked_bot) { return ${st}; }\n}`,
    Apache: `RewriteEngine On\nRewriteCond %{HTTP_USER_AGENT} (${alt}) [NC]\nRewriteRule .* - [F,L]` + (rl ? '\n# Apache has no built-in per-client request rate limit: use block here, or mod_evasive / a reverse proxy for rate limiting.' : ''),
  };
  return S[fmt];
}
const botOpts = [sel('action', 'Action', ['block (403)', 'rate limit (429)']), txt('rate', 'Nginx rate for rate limit (for example 30r/m)', '30r/m'), num('status', 'Block status code', 403)];
tool({
  id: 'bot-firewall-rule-builder', cat: AI, title: 'Bot Firewall Rule Builder (Cloudflare WAF, Nginx, Apache)', desc: 'Generate Cloudflare WAF, Nginx and Apache rules that block or rate-limit chosen bots by user-agent.',
  labels: ['Bot tokens, one per line'], sample: BLOCK_SAMPLE, opts: [sel('fmt', 'Format', ['all', 'Cloudflare', 'Nginx', 'Apache']), ...botOpts],
  run: ([t], o) => { const bots = botList(t), ks = o.fmt === 'all' ? ['Cloudflare', 'Nginx', 'Apache'] : [o.fmt]; return ks.map((k) => `# ${k}\n${botRules(bots, k, o)}`).join('\n\n') + NOTE + '\nCloudflare menu names and the http.user_agent field are from its documentation as remembered, not tested on a live account.'; },
});
tool({
  id: 'htaccess-bot-blocker-generator', cat: AI, title: '.htaccess Bot Blocker Generator (403 for Bad Bots)', desc: 'Create .htaccess rules that return 403 Forbidden to selected bots and scrapers, with mod_rewrite or SetEnvIf.',
  labels: ['Bot tokens, one per line'], sample: BLOCK_SAMPLE, opts: [sel('method', 'Method', ['mod_rewrite', 'SetEnvIf (Apache 2.4)'])],
  run: ([t], o) => { const bots = botList(t), alt = bots.join('|'); return (o.method === 'mod_rewrite' ? botRules(bots, 'Apache', {}) : `SetEnvIfNoCase User-Agent "(${alt})" bad_bot\n<RequireAll>\n    Require all granted\n    Require not env bad_bot\n</RequireAll>`) + NOTE + '\nmod_rewrite and mod_setenvif must be enabled. Keep a backup of .htaccess: a typo causes a 500 error.'; },
});
tool({
  id: 'nginx-bot-map-generator', cat: AI, title: 'Nginx Bot Map Generator (map $http_user_agent)', desc: 'Build an Nginx map block that flags selected user-agents, plus the server snippet that denies or rate-limits them.',
  labels: ['Bot tokens, one per line'], sample: BLOCK_SAMPLE, opts: [txt('var', 'Variable name', 'is_blocked_bot'), ...botOpts],
  run: ([t], o) => { const bots = botList(t), v = o.var.replace(/^\$/, ''); if (!/^\w+$/.test(v)) throw new Error('Variable name: letters, digits, underscore.'); const r = botRules(bots, 'Nginx', o); return (v === 'is_blocked_bot' || o.action.startsWith('rate') ? r : r.replace(/is_blocked_bot/g, v)) + '\n\nPut the map in the http {} block, the rest in server {} or location {}.' + NOTE; },
});

// ---------- 54/55 comparators ----------
function snaps(t) {
  const parts = need(t, 'robots.txt copies').split(/^===\s*/m).slice(1); if (parts.length < 1) throw new Error('Start each robots.txt with a line like: === example.com');
  return parts.map((p) => { const [h, ...r] = p.split(/\r?\n/); return { label: h.trim() || '(unnamed)', rb: parseRobots(r.join('\n'), { google: true }) }; });
}
const WATCH = BOTS.filter((b) => b.v === 'vendor' && !['facebookexternalhit', 'OAI-AdsBot', 'Meta-ExternalAds', 'Google-CloudVertexBot'].includes(b.t));
const SNAP_SAMPLE = '=== news.example\nUser-agent: GPTBot\nDisallow: /\nUser-agent: CCBot\nDisallow: /\nUser-agent: *\nDisallow: /search\n\n=== shop.example\nUser-agent: *\nDisallow: /cart\n\n=== blog.example\nUser-agent: ClaudeBot\nDisallow: /\nUser-agent: Google-Extended\nDisallow: /private/\n';
tool({
  id: 'ai-crawler-policy-comparator', cat: AI, title: 'AI Crawler Policy Comparator (Compare robots.txt Files)', desc: 'Paste several robots.txt files and compare how each treats GPTBot, ClaudeBot, CCBot, Google-Extended and other AI crawlers.',
  labels: ['robots.txt copies, each starting with a line "=== name"'], sample: SNAP_SAMPLE,
  run: ([t]) => {
    const S = snaps(t), head = ['Crawler', ...S.map((s) => s.label)];
    return table(WATCH.map((b) => [b.t, ...S.map((s) => botState(s.rb, b.t).s.replace('open (no rules apply)', 'open'))]), head) + `\n\n${S.map((s) => `${s.label}: ${WATCH.filter((b) => botState(s.rb, b.t).s.startsWith('BLOCKED')).length} of ${WATCH.length} blocked`).join('\n')}\n\nTo compare other sites, open each site's /robots.txt yourself and paste it (archived copies work too). This site makes no network requests. "via *" means no rule names the crawler.`;
  },
});
tool({
  id: 'ai-block-adoption-timeline', cat: AI, title: 'AI Block Adoption Timeline from robots.txt Snapshots', desc: 'Paste dated robots.txt snapshots (for example from the Internet Archive) and see when each AI crawler was first blocked or unblocked.',
  labels: ['Snapshots, each starting with a line "=== 2024-03-01" (any sortable date)'], sample: '=== 2023-06-01\nUser-agent: *\nDisallow: /search\n\n=== 2023-09-15\nUser-agent: GPTBot\nDisallow: /\nUser-agent: *\nDisallow: /search\n\n=== 2024-05-01\nUser-agent: GPTBot\nDisallow: /\nUser-agent: ClaudeBot\nDisallow: /\nUser-agent: CCBot\nDisallow: /\n\n=== 2025-01-10\nUser-agent: ClaudeBot\nDisallow: /\nUser-agent: CCBot\nDisallow: /\n',
  run: ([t]) => {
    const S = snaps(t).sort((a, b) => a.label.localeCompare(b.label)), rows = [], ev = [];
    for (const b of WATCH) { let first = '', prev = '', last = ''; S.forEach((s) => { const st = botState(s.rb, b.t).s.startsWith('BLOCKED') ? 'blocked' : 'not blocked'; if (st === 'blocked' && !first) first = s.label; if (prev && st !== prev) ev.push(`${s.label}: ${b.t} ${st === 'blocked' ? 'became blocked' : 'was unblocked'}`); prev = st; last = st; }); if (first || last === 'blocked') rows.push([b.t, first || '-', last]); }
    ev.sort();
    return `${S.length} snapshot(s), ${S[0].label} to ${S[S.length - 1].label}\n\n${rows.length ? table(rows, ['Crawler', 'First blocked in', 'Status in latest']) : 'No AI crawler is blocked in any snapshot.'}\n\n${ev.length ? 'Changes:\n' + ev.join('\n') : 'No changes between snapshots.'}\n\nLimits: a snapshot shows the file on its capture date only, and only crawlers that exist in the list are checked (a bot that did not exist yet cannot be blocked). Fetching archived copies needs the network, so paste them.`;
  },
});

// ---------- 56/57 Common Crawl index ----------
tool({
  id: 'common-crawl-index-analyzer', cat: AI, title: 'Common Crawl Index Result Analyzer', desc: 'Paste the JSON lines returned by the Common Crawl index API for your domain and see captures per crawl, status codes, MIME types and top URLs.',
  labels: ['Index API output: one JSON object per line (url, status, mime, filename...)'], sample: '{"urlkey":"com,example)/","timestamp":"20260110120000","url":"https://example.com/","mime":"text/html","status":"200","filename":"crawl-data/CC-MAIN-2026-05/segments/1/warc/a.warc.gz"}\n{"urlkey":"com,example)/about","timestamp":"20260111010101","url":"https://example.com/about","mime":"text/html","status":"200","filename":"crawl-data/CC-MAIN-2026-05/segments/1/warc/b.warc.gz"}\n{"urlkey":"com,example)/robots.txt","timestamp":"20251001000000","url":"https://example.com/robots.txt","mime":"text/plain","status":"200","filename":"crawl-data/CC-MAIN-2025-40/segments/2/robotstxt/c.warc.gz"}\n{"urlkey":"com,example)/old","timestamp":"20251002000000","url":"https://example.com/old","mime":"text/html","status":"404","filename":"crawl-data/CC-MAIN-2025-40/segments/2/crawldiagnostics/d.warc.gz"}',
  run: ([t]) => {
    const rec = []; let bad = 0; for (const l of lines(need(t, 'index results')).filter((x) => x.trim())) { try { const o = JSON.parse(l); if (o && o.url) rec.push(o); else bad++; } catch { bad++; } }
    if (!rec.length) throw new Error('No JSON lines with a "url" field found.');
    const cnt = (f) => { const m = new Map(); rec.forEach((r) => { const k = f(r) || '?'; m.set(k, (m.get(k) || 0) + 1); }); return top(m, 12); };
    const crawl = cnt((r) => /crawl-data\/(CC-MAIN-[\d-]+)/.exec(r.filename || '')?.[1]).sort((a, b) => b[0].localeCompare(a[0]));
    return `${rec.length} capture(s)${bad ? `, ${bad} unreadable line(s)` : ''}, ${new Set(rec.map((r) => r.url)).size} distinct URL(s)\n\nPer crawl (more captures = more of your site is in the dataset):\n${table(crawl.map(([k, c]) => [k, c]), ['Crawl', 'Captures'])}\n\nStatus:\n${table(cnt((r) => r.status), ['Status', 'Captures'])}\n\nMIME type:\n${table(cnt((r) => r.mime), ['MIME', 'Captures'])}\n\nMost captured URLs:\n${table(cnt((r) => r.url).slice(0, 8), ['URL', 'Captures'])}\n\nRun the query yourself, for example:  curl 'https://index.commoncrawl.org/CC-MAIN-2026-05-index?url=example.com/*&output=json'  (crawl names are listed at index.commoncrawl.org). This site cannot call the API. Presence in Common Crawl means the content could be in datasets built from it; it does not say who used it.`;
  },
});

// ---------- 60 rate limits ----------
tool({
  id: 'bot-rate-limit-rule-calculator', cat: AI, title: 'Bot Rate Limit Calculator: Cloudflare, Nginx limit_req and HAProxy', desc: 'Turn a request limit such as 60 requests per minute into Cloudflare rate rule fields, Nginx limit_req_zone and HAProxy stick-table settings.',
  inputs: 0, sample: '', opts: [num('req', 'Allowed requests', 60), sel('per', 'per', ['second', 'minute', 'hour'], 'minute'), num('burst', 'Burst allowance (requests)', 10), num('clients', 'Distinct clients to track', 50000), num('timeout', 'Block / penalty time (seconds)', 600)],
  run: (_i, o) => {
    const n = Math.floor(+o.req), secs = { second: 1, minute: 60, hour: 3600 }[o.per]; if (!(n >= 1)) throw new Error('Allowed requests must be at least 1.');
    const perMin = (n * 60) / secs, ngx = o.per === 'second' ? `${n}r/s` : `${Math.max(1, Math.round(perMin))}r/m`, hp = o.per === 'second' ? '1s' : o.per === 'minute' ? '1m' : '1h', mb = Math.max(1, Math.ceil((+o.clients || 1) / 16000));
    return `Limit: ${n} requests per ${o.per} (${perMin.toFixed(2)} per minute, one every ${(secs / n).toFixed(2)} s)\n\n# Nginx\nlimit_req_zone $binary_remote_addr zone=bots:${mb}m rate=${ngx};\nlimit_req_status 429;\nserver { limit_req zone=bots burst=${Math.max(0, Math.floor(+o.burst || 0))} nodelay; }\n${o.per === 'hour' ? '# Nginx rates are per second or per minute only, so the hourly figure was converted to per minute.\n' : ''}\n# HAProxy\nfrontend web\n    stick-table type ip size ${Math.max(1000, Math.round(+o.clients || 1000))} expire ${Math.max(60, secs)}s store http_req_rate(${hp})\n    http-request track-sc0 src\n    http-request deny deny_status 429 if { sc_http_req_rate(0) gt ${n} }\n\n# Cloudflare rate limiting rule (fields)\n  Characteristics: IP\n  Requests: ${n}\n  Period: ${secs} s${[10, 60, 120, 300, 600, 3600].includes(secs) ? '' : ' (check which periods your plan allows)'}\n  Mitigation timeout: ${+o.timeout || 600} s\n  Action: Block (or Managed Challenge)\n\nNotes: Nginx zone memory is sized at roughly 16,000 client states per megabyte (nginx documentation). Allowed periods and limits in Cloudflare depend on your plan: check its documentation. Behind a proxy or CDN, key on the real client IP header, not the proxy address.`;
  },
});

// ---------- 61 headless signals ----------
tool({
  id: 'headless-browser-signal-tester', cat: AI, title: 'Headless Browser Signal Tester (What Bot Detectors See)', desc: 'Show which automation signals your own browser exposes, such as navigator.webdriver, a HeadlessChrome user agent, missing plugins and software rendering.',
  inputs: 0, sample: '', dom: true, opts: [],
  run: async () => {
    const n = navigator, rows = [], add = (s, v, flag, why) => rows.push([s, String(v).slice(0, 60), flag ? 'looks automated' : 'looks normal', why]);
    add('navigator.webdriver', n.webdriver, n.webdriver === true, 'true in WebDriver-controlled browsers');
    add('user agent contains "Headless"', /headless/i.test(n.userAgent), /headless/i.test(n.userAgent), 'old headless Chrome announces itself');
    add('plugins length', n.plugins?.length ?? 'n/a', n.plugins && n.plugins.length === 0, 'desktop Chrome and Firefox expose built-in viewers; mobile browsers expose none');
    add('languages', (n.languages || []).join(',') || 'empty', !n.languages || n.languages.length === 0, 'real browsers have at least one');
    add('window.chrome on a Chrome UA', typeof window.chrome, /Chrome\//.test(n.userAgent) && !/Edg|OPR|Firefox/.test(n.userAgent) && typeof window.chrome === 'undefined', 'Chrome defines window.chrome');
    add('outer window size', `${window.outerWidth}x${window.outerHeight}`, window.outerWidth === 0 || window.outerHeight === 0, 'zero size is typical of some headless modes');
    add('hardwareConcurrency', n.hardwareConcurrency ?? 'n/a', false, 'informational');
    add('userAgentData brands', n.userAgentData ? n.userAgentData.brands.map((b) => b.brand).join('; ') : 'not supported', !!n.userAgentData && n.userAgentData.brands.some((b) => /headless/i.test(b.brand)), 'client hints can reveal HeadlessChrome');
    let gl = 'n/a'; try { const c = document.createElement('canvas').getContext('webgl'); const e = c && c.getExtension('WEBGL_debug_renderer_info'); gl = e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c ? 'masked' : 'no WebGL'; } catch { gl = 'error'; }
    add('WebGL renderer', gl, /swiftshader|llvmpipe|software/i.test(gl), 'software rendering is common in servers and containers, but also on some real machines');
    const flagged = rows.filter((r) => r[2] === 'looks automated').length;
    return `${flagged} of ${rows.length} signals look automated\n\n${table(rows, ['Signal', 'Value in your browser', 'Verdict', 'Why it matters'])}\n\nEverything is read locally and nothing is sent. This is what simple detectors check. Modern automation hides most of these, and detectors use many more signals (timing, behaviour, TLS fingerprints), so a clean result proves nothing and a flag can be a false alarm (privacy extensions, unusual setups).`;
  },
});

// ---------- 62 content signals ----------
tool({
  id: 'content-signals-policy-builder', cat: GEN, title: 'Content Signals Policy Builder for robots.txt', desc: 'Generate Content-Signal lines (search, ai-input, ai-train) for robots.txt to say how crawlers may use your content.',
  inputs: 0, sample: '', opts: [sel('search', 'search (build a search index and show links and short excerpts)', ['yes', 'no', 'not stated']), sel('ai-input', 'ai-input (use content as input to AI answers, grounding, RAG)', ['no', 'yes', 'not stated']), sel('ai-train', 'ai-train (train or fine-tune AI models)', ['no', 'yes', 'not stated']), txt('agent', 'User-agent', '*')],
  run: (_i, o) => {
    const p = ['search', 'ai-input', 'ai-train'].filter((k) => o[k] !== 'not stated').map((k) => `${k}=${o[k]}`); if (!p.length) throw new Error('State at least one signal. Leaving all out means no signal.');
    return `User-agent: ${o.agent || '*'}\nContent-Signal: ${p.join(', ')}\nAllow: /\n\n# A signal you leave out states no preference (it is not the same as yes or no).\n# Content-Signal is a convention introduced by Cloudflare (syntax read from its announcement, 2026-10-23). It expresses a preference: it does not block anything, and a crawler must choose to read it. Combine it with Disallow rules for crawlers you want to stop.`;
  },
});

// ---------- 63 aipref ----------
tool({
  id: 'ai-preferences-header-generator', cat: GEN, title: 'AI Preferences (IETF aipref) Header and robots.txt Generator', desc: 'Draft Content-Usage statements with the IETF AI preferences vocabulary (train-ai, ai-use, search) for an HTTP header and robots.txt.',
  labels: ['Optional per-path robots.txt rules, one per line: /path train-ai=y'], sample: '/open/ train-ai=y',
  opts: [sel('train-ai', 'train-ai (training generative models)', ['n', 'y', 'unspecified']), sel('ai-use', 'ai-use (input to a generative model, not training)', ['unspecified', 'n', 'y']), sel('search', 'search (finding assets and linking to them)', ['y', 'n', 'unspecified']), txt('agent', 'robots.txt User-agent', '*')],
  run: ([t], o) => {
    const p = ['train-ai', 'ai-use', 'search'].filter((k) => o[k] !== 'unspecified').map((k) => `${k}=${o[k]}`); if (!p.length) throw new Error('State at least one preference.');
    const per = lines(t || '').map((x) => x.trim()).filter(Boolean).map((l) => { const m = /^(\/\S*)\s+((?:[a-z-]+=[yn](?:,\s*)?)+)$/i.exec(l); if (!m) throw new Error('Use: /path train-ai=y'); return `Content-Usage: ${m[1]} ${m[2]}`; });
    return `# HTTP response header (a Structured Fields dictionary)\nContent-Usage: ${p.join(', ')}\n\n# robots.txt\nUser-Agent: ${o.agent || '*'}\nAllow: /\nContent-Usage: ${p.join(', ')}${per.length ? '\n' + per.join('\n') : ''}\n\nThese are IETF drafts, not final standards: the vocabulary is draft-ietf-aipref-vocab-08 (September 2026) and the header and robots.txt syntax is draft-ietf-aipref-attach-05 (August 2026), both read on 2026-10-23. Names and syntax may change and the drafts say they do not reflect working group consensus. Absent preferences are "unknown". "search" overrides the other categories in the vocabulary. Whether any crawler reads these today is not verified.`;
  },
});

// ---------- 64 bot trap ----------
tool({
  id: 'bot-trap-url-generator', cat: AI, title: 'Bot Trap URL Generator (Honeypot Path, robots.txt and Log Filter)', desc: 'Create a honeypot path, the robots.txt rule that forbids it, a hidden link and log filters to catch crawlers that ignore robots.txt.',
  inputs: 0, sample: '', opts: [txt('seed', 'Seed word (makes the path hard to guess)', 'my-site'), txt('base', 'Folder name', 'private-archive')],
  run: (_i, o) => {
    let h = 2166136261; for (const c of `${o.seed}|${o.base}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } const id = h.toString(16).padStart(8, '0'), base = o.base.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'archive', path = `/${base}-${id}/`;
    return `Trap path: ${path}\n\n# 1. robots.txt: good bots never request it\nUser-agent: *\nDisallow: ${path}\n\n# 2. Hidden link in your page (not visible, not announced by screen readers, not focusable)\n<a href="${path}" rel="nofollow" tabindex="-1" aria-hidden="true" style="display:none">archive</a>\n\n# 3. Find who visited (Apache or Nginx combined log)\ngrep '${path}' access.log | awk '{print $1}' | sort | uniq -c | sort -rn\n\n# 4. Make the trap path answer with something harmless, such as a 404 or a short text page.\n\nNotes: only bots that ignore robots.txt and follow hidden links will hit it. Do not auto-ban on one hit without checking: shared proxies, link-preview tools and security scanners can request it. Anyone who reads your robots.txt sees the path, which is the point, but do not put real private content there. The path is derived from your seed with a simple hash, not a secret.`;
  },
});

// ---------- 66 snippet advisor ----------
tool({
  id: 'ai-snippet-control-advisor', cat: GEN, title: 'Snippet Control Advisor: nosnippet, max-snippet, data-nosnippet', desc: 'Pick what you want to limit and get the matching nosnippet, max-snippet or data-nosnippet markup that Google documents for limiting what Search shows.',
  inputs: 0, sample: '', opts: [sel('goal', 'Goal', ['Show only a short excerpt', 'Show no text snippet at all', 'Hide one part of a page from snippets', 'Keep the page out of Search results']), num('chars', 'Excerpt length in characters', 50)],
  run: (_i, o) => {
    const g = o.goal, c = Math.max(0, Math.floor(+o.chars) || 0);
    const body = g.startsWith('Show only') ? `<meta name="robots" content="max-snippet:${c}">\nHTTP header: X-Robots-Tag: max-snippet:${c}\n(Use max-snippet:0 for none, -1 for no limit.)` : g.startsWith('Show no') ? '<meta name="robots" content="nosnippet">\nHTTP header: X-Robots-Tag: nosnippet' : g.startsWith('Hide one') ? '<p>Public text. <span data-nosnippet>This sentence is kept out of snippets.</span></p>\n(data-nosnippet works on span, div and section elements. Close the tags properly and do not add the attribute with JavaScript.)' : '<meta name="robots" content="noindex">\nHTTP header: X-Robots-Tag: noindex\n(The page must stay crawlable, or the crawler never sees the tag.)';
    return `${body}\n\nWhat Google says: its AI features page lists nosnippet, data-nosnippet, max-snippet and noindex as the controls for limiting what is shown from your pages in Search, and says a page needs to be indexed and eligible for a snippet to appear as a supporting link. It does not spell out how each control changes AI Overviews or AI Mode beyond that, so treat the effect as the documented snippet behaviour and check it over time (read 2026-10-23).\nSeparate controls: Google-Extended in robots.txt limits use for Gemini training and grounding in some other Google systems and does not affect Search. Blocking Googlebot removes you from Search.`;
  },
});

export default T;

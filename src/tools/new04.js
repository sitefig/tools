// Tools from free-browser-tools.md, batch 04 (redirects, URLs, keywords, content). See TOOLS.md for the contract.
// Everything is pasted-text in, text out. Nothing is fetched. Skipped rows and why: peerreview/new-list/04.md.
// Ceilings: URL and redirect tools work on the strings you paste (no live status checks); content tools are heuristics and say so.
const T = [];
const TECH = 'SEO – Technical', CONT = 'SEO – Content', XTRA = 'SEO – Extras';

const need = (t, w = 'input') => { if (t == null || !String(t).trim()) throw new Error('Paste ' + w + ' first.'); return String(t); };
const lines = (t) => String(t ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round = (n, d = 1) => { const p = 10 ** d; return Math.round((n + Number.EPSILON) * p) / p; };
const pct = (a, b) => (b ? round(100 * a / b, 1) + '%' : 'n/a');
const table = (head, rows) => {
  const all = [head, ...rows].map((r) => r.map((c) => String(c ?? '')));
  const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  return all.map((r) => r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd()).join('\n');
};
const sec = (title, body) => `${title}\n${'-'.repeat(title.length)}\n${body}`;
const uniq = (a) => [...new Set(a)];
const STOP = new Set('a an and are as at be but by for from has have he her his how i if in into is it its of on or our she so than that the their them then there these they this to was we were what when where which who why will with you your about after all also am any been before being between both can could did do does down during each few further had here him just more most my no nor not now off once only other out over own same should some such too under until up very while would'.split(' '));
const decode = (s) => { try { return decodeURI(s); } catch { return s; } };
// split "old new [code]" rows: tab, "->" / "=>", whitespace, or a single comma
function splitRow(l) {
  let p;
  if (l.includes('\t')) p = l.split('\t');
  else if (/\s(->|=>)\s|^\S+(->|=>)\S/.test(l)) { p = l.split(/\s*(?:->|=>)\s*/); if (p.length === 2) p = [p[0], ...p[1].split(/\s+/)]; }
  else if (/\s/.test(l)) p = l.split(/\s+/);
  else if (l.split(',').length >= 2 && l.split(',').length <= 3) p = l.split(',');
  else return null;
  p = p.map((x) => x.trim().replace(/^["']|["']$/g, '')).filter((x) => x !== '');
  if (p.length < 2) return null;
  let code = null; if (p.length >= 3 && /^30[1278]$/.test(p[p.length - 1])) code = +p.pop();
  if (p.length !== 2) return null;
  return { from: p[0], to: p[1], code };
}
// "https://host/path?query#frag" -> parts; also accepts a bare path
function urlParts(u) {
  const m = /^(https?:\/\/[^/?#]+)?([^?#]*)(\?[^#]*)?/i.exec(u.trim());
  return { origin: m[1] || '', host: (m[1] || '').replace(/^https?:\/\//i, ''), path: m[2] || '/', query: m[3] ? m[3].slice(1) : '' };
}
const normPct = (s) => s.replace(/%[0-9a-f]{2}/gi, (m) => { const c = String.fromCharCode(parseInt(m.slice(1), 16)); return /[A-Za-z0-9\-._~]/.test(c) ? c : m.toUpperCase(); });

// ---------- 1. HTTP status codes with SEO notes ----------
// Sources: Google Search Central "How HTTP status codes, and network and DNS errors affect Google Search" and the site-move guide, read 2026-10.
const GOOGLE = {
  200: ['OK', 'Content is passed on for indexing, but indexing is not guaranteed. A 200 page that looks like an error or is empty is reported as a soft 404.'],
  201: ['Created', 'Rare on pages. Google treats 2xx as success and passes the content on.'],
  202: ['Accepted', 'Google waits a limited time for content, and the timeout varies by crawler. Avoid it for pages you want indexed.'],
  204: ['No Content', 'Success with nothing to index. Google has no content to process, so the URL will not be indexed.'],
  206: ['Partial Content', 'Used for range requests (video, PDF). Not covered by Google\'s status page; normal page crawls should return 200.'],
  301: ['Moved Permanently', 'Followed. A strong signal that the target should be the indexed URL. Use for permanent moves, domain changes and HTTP to HTTPS.'],
  302: ['Found', 'Followed. A weak signal that the target is canonical, so the old URL may stay indexed. Use only for truly temporary moves.'],
  303: ['See Other', 'Redirect to GET after a POST. Not covered by Google\'s status page; avoid for page moves.'],
  304: ['Not Modified', 'Tells Google the content has not changed since the last crawl. No effect on indexing otherwise. Supporting it saves crawl budget.'],
  307: ['Temporary Redirect', 'Treated like 302 by Google: followed, weak canonical signal. Keeps the request method.'],
  308: ['Permanent Redirect', 'Treated like 301 by Google: followed, strong signal. Keeps the request method.'],
  400: ['Bad Request', 'Google treats 400, 401, 403, 404, 410 and 411 alike: no content to index, indexed URLs are dropped over time, crawling slows gradually.'],
  401: ['Unauthorized', 'Treated like 404 by Google. Pages behind a login are not indexed. Do not use 401 or 403 to slow Googlebot; use 503 or 429 for that.'],
  403: ['Forbidden', 'Treated like 404 by Google. Check that a firewall or bot rule is not blocking Googlebot by mistake.'],
  404: ['Not Found', 'The correct answer for a page that is gone with no replacement. New 404s are not processed, indexed ones drop out over time, crawl rate decreases. Not a penalty.'],
  405: ['Method Not Allowed', 'Not covered by Google\'s status page. Usually an API or form endpoint; make sure GET works for pages.'],
  410: ['Gone', 'Google handles it like 404. Use it when you want to state the removal is deliberate; do not expect it to be much faster.'],
  411: ['Length Required', 'Google treats it like 404 and the other 4xx codes.'],
  414: ['URI Too Long', 'The server refused a long URL. Not covered by Google\'s status page. Look for parameter or session ID loops.'],
  429: ['Too Many Requests', 'Google treats it as a server error: a sign of overload, so crawling slows down. Use it (or 503) to rate-limit crawlers temporarily.'],
  451: ['Unavailable For Legal Reasons', 'Not covered by Google\'s status page; assume it behaves like other 4xx (not indexed).'],
  500: ['Internal Server Error', 'Content is ignored and Google slows crawling. Indexed URLs are kept at first but dropped if the errors persist.'],
  501: ['Not Implemented', 'Server errors are grouped together by Google: crawling slows down, long-running errors lead to removal.'],
  502: ['Bad Gateway', 'Handled with 5xx server errors: crawl rate drops, URLs are kept at first and dropped if errors persist.'],
  503: ['Service Unavailable', 'The right code for planned downtime, with Retry-After if you can. Short outages are tolerated; weeks of 503 lead to removal.'],
  504: ['Gateway Timeout', 'Handled with 5xx server errors. Slow upstream servers also hurt crawl rate.'],
};
T.push({
  id: 'http-status-seo-reference', cat: TECH, title: 'HTTP Status Codes: What Each Means for SEO',
  desc: 'Search the common HTTP status codes and see how Google Search treats each one: indexing, crawl rate, redirect strength. Notes marked "not covered" are not in Google\'s documentation.',
  labels: ['Search (code, class like 3xx, or a word; empty = all)'], sample: '3', placeholder: ['404, 3xx, redirect, server'],
  run: ([q]) => {
    const s = String(q || '').trim().toLowerCase();
    const rows = Object.entries(GOOGLE).filter(([c, [n, d]]) => !s || (/^\dxx$/.test(s) ? c[0] === s[0] : (c.startsWith(s) || (n + ' ' + d).toLowerCase().includes(s))));
    if (!rows.length) throw new Error('No code matches "' + s + '".');
    return rows.map(([c, [n, d]]) => `${c} ${n}\n  ${d}`).join('\n\n') + '\n\nSource: Google Search Central, "HTTP status codes, and network and DNS errors" and "Site moves with URL changes", read October 2026. Google follows up to 10 redirect hops; keep chains to 3 or fewer. Codes not listed here are rare for web pages.';
  },
});

// ---------- 2. Redirect type advisor ----------
const ADV = {
  'Page moved to a new URL for good': ['301 (or 308)', 'Strong signal to Google that the new URL replaces the old one. Keep the redirect for at least a year.', 'Point straight to the final URL. Update internal links and the sitemap.'],
  'Domain change (same paths)': ['301 (or 308), page to page', 'Redirect every old URL to the same path on the new domain. Then use the Change of Address tool in Search Console for the old domain.', 'Do not send everything to the home page. Keep redirects at least a year.'],
  'HTTP to HTTPS': ['301 (or 308)', 'Permanent move of every URL to its https twin, in one hop.', 'Combine with the www rule so the visitor is not bounced twice. Add HSTS only when HTTPS works everywhere.'],
  'www to non-www (or back)': ['301 (or 308)', 'Pick one host and redirect the other to it, keeping the path and query.', 'Set the same host in canonical tags and sitemaps.'],
  'Trailing slash policy change': ['301 (or 308)', 'Redirect the non-preferred form to the preferred one.', 'Skip file URLs such as /file.pdf. Update canonical tags to match.'],
  'URL structure change in a migration': ['301 (or 308), one rule per old URL', 'Map old URLs one to one where a close match exists.', 'Test the map for chains and loops before launch. Use 404 or 410 for pages with no equivalent.'],
  'Temporary maintenance or A/B test': ['302 (or 307)', 'The original URL stays the one that is indexed.', 'Remove the redirect when the test ends. A 302 left in place for months may be treated as permanent over time.'],
  'Seasonal page, back in a few weeks': ['302 (or 307)', 'Send visitors to the current offer and keep the original URL as the main one.', 'If the page will not return, change to 301 or 410.'],
  'Product out of stock, will return': ['Keep the page (200)', 'Redirecting would drop a page that will rank again. Show stock status and alternatives on the page.', 'If it is gone for good and a close replacement exists, use 301.'],
  'Product or article removed, close replacement exists': ['301 (or 308)', 'Send to the closest equivalent page, not to the home page.', 'A redirect to an unrelated page may be treated as a soft 404.'],
  'Page removed, no replacement': ['404 or 410 (no redirect)', 'Google treats both the same: the URL drops out of the index over time.', 'Show a helpful 404 page with links. Do not redirect everything to the home page.'],
  'After a form POST (post/redirect/get)': ['303', 'Tells the browser to load the result with GET, so a refresh does not resubmit the form.', 'Not for SEO purposes; use 307/308 when the method must be kept.'],
  'API or POST endpoint moves, method must be kept': ['307 (temporary) or 308 (permanent)', 'Both keep the method and body. 301 and 302 let old clients change POST to GET.', 'Check that your HTTP clients follow 307 and 308.'],
  'Visitor language or country redirect': ['302 (or 307), or no redirect', 'The target depends on the visitor, so it is not permanent.', 'Prefer a banner plus hreflang. Never hide pages from Googlebot by IP or language redirect.'],
  'Mobile subdomain (m.) to responsive site': ['301 (or 308)', 'Redirect each m. URL to the equivalent responsive URL.', 'Remove old alternate and canonical annotations.'],
  'Only JavaScript or meta refresh is possible': ['Meta refresh with 0 delay or JavaScript (last resort)', 'Google can follow them, but a server-side redirect is clearer and faster.', 'Use only when you cannot change server config. Add a canonical tag to the target.'],
};
T.push({
  id: 'redirect-type-advisor', cat: TECH, title: 'Redirect Type Advisor: 301, 302, 307, 308 or Meta Refresh',
  desc: 'Pick the situation and get the redirect status code to use, why, and what to watch for. Based on how Google Search treats each code.',
  inputs: 0, sample: '', opts: [{ id: 'scenario', label: 'What is happening to the URL?', type: 'select', choices: Object.keys(ADV), def: 'Page moved to a new URL for good' }],
  run: (_, o) => {
    const a = ADV[o.scenario]; if (!a) throw new Error('Choose a scenario.');
    return `Situation: ${o.scenario}\n\nUse: ${a[0]}\n\nWhy: ${a[1]}\n\nWatch for: ${a[2]}\n\nBasis: Google treats 301/308 as strong and 302/307 as weak signals that the target is the canonical URL, and follows up to 10 hops (Google Search Central). Other engines may differ. This is guidance, not a guarantee.`;
  },
});

// ---------- 3. Bulk redirect rule generator ----------
const FORMATS = ['Apache Redirect (prefix match)', 'Apache RedirectMatch (exact path)', 'Apache RewriteRule (.htaccess, handles query strings)', 'Nginx location blocks', 'Nginx map (for long lists)', 'Cloudflare Bulk Redirects CSV', 'Netlify / Cloudflare Pages _redirects', 'Vercel vercel.json'];
const q = (s) => (/[\s"'#;{}]/.test(s) ? '"' + s.replace(/(["\\])/g, '\\$1') + '"' : s);
function bulkRules(t, o) {
  const warn = [], rows = [], seen = new Map();
  lines(need(t, 'old and new URLs')).forEach((l, i) => {
    if (l[0] === '#') return;
    const r = splitRow(l); if (!r) { warn.push(`line ${i + 1}: expected "old new" (got "${l.slice(0, 50)}")`); return; }
    const f = urlParts(r.from), key = f.path + (f.query ? '?' + f.query : '');
    const row = { path: f.path.startsWith('/') ? f.path : '/' + f.path, query: f.query, host: f.host, to: r.to, code: r.code || +o.code };
    if (row.path === normT(row.to) && !row.query) { warn.push(`line ${i + 1}: ${row.path} redirects to itself, skipped`); return; }
    if (seen.has(key)) { warn.push(`line ${i + 1}: ${key} is already redirected on line ${seen.get(key)}, skipped`); return; }
    seen.set(key, i + 1); rows.push(row);
  });
  if (!rows.length) throw new Error('No usable rows. Use "old-url new-url" per line.');
  const srcs = new Set(rows.map((r) => r.path));
  for (const r of rows) { const tp = normT(r.to); if (tp !== r.to || r.to.startsWith('/')) if (srcs.has(tp) && tp !== r.path) warn.push(`${r.path} -> ${r.to}: the target is itself redirected (a chain). Run the Redirect Map Flattener first.`); }
  const f = o.format, c = rows.length; let out = [];
  const skipQ = (what) => rows.filter((r) => { if (r.query) { warn.push(`${r.path}?${r.query}: ${what} cannot match a query string, skipped`); return false; } return true; });
  if (f.startsWith('Apache Redirect (')) out = skipQ('Redirect').map((r) => `Redirect ${r.code} ${q(decode(r.path))} ${q(r.to)}`);
  else if (f.startsWith('Apache RedirectMatch')) out = skipQ('RedirectMatch').map((r) => { if (r.to.includes('$')) warn.push(`${r.path}: target contains "$", Apache reads it as a back-reference`); return `RedirectMatch ${r.code} "^${reEsc(decode(r.path)).replace(/"/g, '\\"')}$" ${q(r.to)}`; });
  else if (f.startsWith('Apache RewriteRule')) {
    out.push('RewriteEngine On');
    for (const r of rows) {
      const pat = '^' + reEsc(decode(r.path).replace(/^\//, '')) + '$';
      if (r.query) out.push(`RewriteCond %{QUERY_STRING} ^${reEsc(r.query)}$`);
      out.push(`RewriteRule ${q(pat)} ${q(r.to + (r.query && !r.to.includes('?') ? '?' : ''))} [R=${r.code},L]`);
    }
  } else if (f.startsWith('Nginx location')) {
    const g = new Map(); for (const r of rows) { if (!g.has(r.path)) g.set(r.path, []); g.get(r.path).push(r); }
    for (const [p, rs] of g) {
      const plain = rs.find((r) => !r.query), qs = rs.filter((r) => r.query);
      const body = [...qs.map((r) => `    if ($args = "${r.query.replace(/(["\\$])/g, '\\$1')}") { return ${r.code} ${q(r.to)}; }`), ...(plain ? [`    return ${plain.code} ${q(plain.to)};`] : [])];
      out.push(`location = ${q(decode(p))} {\n${body.join('\n')}\n}`);
    }
  } else if (f.startsWith('Nginx map')) {
    for (const code of uniq(rows.map((r) => r.code))) {
      out.push(`map $request_uri $redirect_${code} {\n    default "";\n${rows.filter((r) => r.code === code).map((r) => `    "${(r.path + (r.query ? '?' + r.query : '')).replace(/(["\\$])/g, '\\$1')}" "${r.to.replace(/(["\\$])/g, '\\$1')}";`).join('\n')}\n}`);
    }
    out.push('# inside the server block:\n' + uniq(rows.map((r) => r.code)).map((code) => `if ($redirect_${code}) { return ${code} $redirect_${code}; }`).join('\n'));
    out.push('# The map goes in the http block. For thousands of rows raise map_hash_max_size and map_hash_bucket_size if nginx -t complains.');
  } else if (f.startsWith('Cloudflare')) {
    const dom = String(o.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const flags = [o.pq, o.sub, o.subpath, o.suffix].map((v) => (v ? 'TRUE' : 'FALSE'));
    const anyFlag = flags.includes('TRUE');
    out = skipQ('A Bulk Redirect source').map((r) => {
      const host = r.host || dom; if (!host) throw new Error('Enter your domain: some old URLs have no host.');
      const tgt = /^https?:\/\//i.test(r.to) ? r.to : 'https://' + (r.host || dom) + (r.to.startsWith('/') ? '' : '/') + r.to;
      const cell = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
      return [cell(host + r.path), cell(tgt), r.code, ...(anyFlag ? flags : [])].join(',');
    });
    warn.push('Cloudflare: no header row. Columns: source, target, status, preserve query, include subdomains, subpath matching, preserve path suffix (the flags are only written when you tick one). Source URLs may not contain a query string.');
  } else if (f.startsWith('Netlify')) {
    out = rows.map((r) => `${r.path}${r.query ? ' ' + r.query.split('&').join(' ') : ''}  ${r.to}  ${r.code}`);
    warn.push('Netlify applies the first matching rule, so keep specific rules above wildcard ones. Query rows match only that exact parameter set.');
  } else {
    const ok = skipQ('Vercel "source"'), vr = ok.map((r) => {
      const o2 = { source: r.path.replace(/[(){}:*+?]/g, '\\$&'), destination: r.to };
      if (r.code === 308) o2.permanent = true; else if (r.code === 307) o2.permanent = false; else o2.statusCode = r.code; return o2;
    });
    out = [JSON.stringify({ redirects: vr }, null, 2)];
    warn.push('Vercel sources are path patterns (path-to-regexp); special characters are escaped here, which I could not check against a live deployment. Very long lists belong in bulkRedirectsPath instead (see Vercel docs).');
  }
  const head = `# ${c} rule${c === 1 ? '' : 's'} for: ${f}`;
  const body = f.startsWith('Vercel') || f.startsWith('Cloudflare') ? out.join('\n') : `${head}\n${out.join('\n')}`;
  return body + (warn.length ? '\n\n' + sec('Review', warn.map((w) => '- ' + w).join('\n')) : '') + '\n\nAlways test on staging: one wrong rule can redirect the whole site. Syntax was written from vendor documentation; Apache output was checked with apache2.';
}
function normT(to) { const p = urlParts(to); return p.path; }
T.push({
  id: 'bulk-redirect-rules', cat: TECH, title: 'Bulk Redirect Rule Generator: Apache, Nginx, Cloudflare, Netlify, Vercel',
  desc: 'Paste old and new URLs and get redirect rules for Apache (Redirect, RedirectMatch, RewriteRule), Nginx (location or map), Cloudflare Bulk Redirects CSV, Netlify _redirects or vercel.json.',
  labels: ['Old URL and new URL, one pair per line (space, tab, comma or ->; optional status code at the end)'],
  sample: '/old-page /new-page\n/blog/2019/post https://example.com/blog/post 301\n/promo -> /sale 302\n/shop?id=5 /shop/widget-5\n/old-page /duplicate-rule',
  opts: [{ id: 'format', label: 'Output format', type: 'select', choices: FORMATS, def: FORMATS[2] }, { id: 'code', label: 'Default status', type: 'select', choices: ['301', '302', '307', '308'], def: '301' },
    { id: 'domain', label: 'Domain (Cloudflare, for relative URLs)', type: 'text', def: 'example.com' }, { id: 'pq', label: 'Cloudflare: preserve query string', type: 'checkbox', def: false }, { id: 'sub', label: 'Cloudflare: include subdomains', type: 'checkbox', def: false },
    { id: 'subpath', label: 'Cloudflare: subpath matching', type: 'checkbox', def: false }, { id: 'suffix', label: 'Cloudflare: preserve path suffix', type: 'checkbox', def: false }],
  run: ([t], o) => bulkRules(t, o),
});

// ---------- 4. Redirect map flattener ----------
const keyOf = (u, slash) => { const p = urlParts(u); let path = normPct(p.path || '/'); if (slash && path.length > 1) path = path.replace(/\/+$/, ''); return (p.host.toLowerCase() ? p.host.toLowerCase() : '') + path + (p.query ? '?' + p.query : ''); };
T.push({
  id: 'redirect-map-flattener', cat: TECH, title: 'Redirect Map Flattener: Find Chains and Loops in a Redirect List',
  desc: 'Paste your old to new redirect pairs. Finds chains (A to B to C) and loops, and gives rules that point every old URL straight at its final destination.',
  labels: ['Redirect pairs, one per line (old new)'],
  sample: '/a /b\n/b /c\n/c https://example.com/final\n/x /y\n/y /x\n/old /new\n/new /new-2\n/plain /ok',
  opts: [{ id: 'slash', label: 'Ignore trailing slash when matching', type: 'checkbox', def: true }, { id: 'changed', label: 'Show only rules that changed', type: 'checkbox', def: false }],
  run: ([t], o) => {
    const map = new Map(), order = [], dup = [];
    lines(need(t, 'redirect pairs')).forEach((l) => { if (l[0] === '#') return; const r = splitRow(l); if (!r) return; const k = keyOf(r.from, o.slash); if (map.has(k)) dup.push(r.from); else { map.set(k, r); order.push(k); } });
    if (!order.length) throw new Error('No pairs found. Use "old new" per line.');
    const flat = [], loops = [], chains = [];
    for (const k of order) {
      const r = map.get(k), path = [r.from]; let cur = r.to, seen = new Set([k]), loop = false;
      for (;;) {
        const ck = keyOf(cur, o.slash);
        if (seen.has(ck)) { loop = true; path.push(cur); break; }
        const nx = map.get(ck); if (!nx) break;
        seen.add(ck); path.push(cur); cur = nx.to; if (path.length > 50) { loop = true; break; }
      }
      if (loop) loops.push(path.join(' -> ')); else { if (path.length > 1) chains.push(path.join(' -> ') + ' -> ' + cur + `  (${path.length} hops)`); flat.push([r.from, cur, path.length > 1]); }
    }
    const rules = flat.filter((f) => !o.changed || f[2]).map((f) => `${f[0]} ${f[1]}`);
    return [`${order.length} rules read: ${flat.length - chains.length} fine, ${chains.length} chains, ${loops.length} loops.`,
      sec('Flattened rules (loops excluded)', rules.join('\n') || '(none changed)'),
      chains.length ? sec('Chains found', chains.join('\n')) : '', loops.length ? sec('Loops (no valid destination, fix by hand)', loops.join('\n')) : '',
      dup.length ? sec('Duplicate sources ignored (first rule wins)', dup.join('\n')) : '',
      'Matching is on host + path + query exactly as pasted (trailing slash optional). Google follows up to 10 hops but advises 3 or fewer.'].filter(Boolean).join('\n\n');
  },
});

// ---------- 5. HTTPS / www / trailing slash rules ----------
T.push({
  id: 'canonical-host-rules', cat: TECH, title: 'HTTPS, www and Trailing Slash Redirect Rule Builder (Apache, Nginx)',
  desc: 'Build the rules that force HTTPS, one preferred host (www or non-www) and one trailing slash policy, in a single hop where possible. File URLs are left alone.',
  inputs: 0, sample: '',
  opts: [{ id: 'server', label: 'Server', type: 'select', choices: ['Apache (.htaccess)', 'Nginx'], def: 'Apache (.htaccess)' }, { id: 'domain', label: 'Domain without www', type: 'text', def: 'example.com' },
    { id: 'host', label: 'Preferred host', type: 'select', choices: ['non-www (example.com)', 'www (www.example.com)'], def: 'non-www (example.com)' }, { id: 'https', label: 'Force HTTPS', type: 'checkbox', def: true },
    { id: 'slash', label: 'Trailing slash', type: 'select', choices: ['leave as is', 'always add (except files)', 'always remove'], def: 'leave as is' }],
  run: (_, o) => {
    const d = String(o.domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw new Error('Enter a domain like example.com.');
    const www = o.host.startsWith('www'), host = (www ? 'www.' : '') + d, ap = o.server.startsWith('Apache'), out = [];
    if (ap) {
      out.push('RewriteEngine On', '');
      {
        const conds = [];
        if (o.https) conds.push(`RewriteCond %{HTTPS} !=on [OR]`);
        conds.push(www ? `RewriteCond %{HTTP_HOST} !^www\\.${reEsc(d)}$ [NC]` : `RewriteCond %{HTTP_HOST} !^${reEsc(d)}$ [NC]`);
        out.push('# one hop to the preferred scheme and host', ...conds, `RewriteRule ^ https://${host}%{REQUEST_URI} [L,R=301]`.replace('https://', o.https ? 'https://' : 'http://'));
      }
      if (o.slash.startsWith('always add')) out.push('', '# add a trailing slash to paths without a file extension', 'RewriteCond %{REQUEST_URI} !\\.[A-Za-z0-9]{1,6}$', 'RewriteCond %{REQUEST_URI} !/$', `RewriteRule ^(.*)$ /$1/ [L,R=301]`);
      if (o.slash.startsWith('always remove')) out.push('', '# remove the trailing slash (not for real directories)', 'RewriteCond %{REQUEST_FILENAME} !-d', 'RewriteRule ^(.+)/$ /$1 [L,R=301]');
      out.push('', '# Behind a load balancer or CDN that ends TLS, HTTPS may always read "off": test the X-Forwarded-Proto header instead of %{HTTPS}.');
    } else {
      const sch = o.https ? 'https' : 'http', other = www ? d : 'www.' + d, L = o.https ? '443 ssl' : '80', crt = o.https ? '\n    # ssl_certificate ...;' : '';
      if (o.https) out.push(`server {\n    listen 80;\n    server_name ${d} www.${d};\n    return 301 ${sch}://${host}$request_uri;\n}\n`);
      out.push(`# the non-preferred host\nserver {\n    listen ${L};\n    server_name ${other};${crt}\n    return 301 ${sch}://${host}$request_uri;\n}\n`);
      out.push(`server {\n    listen ${L};\n    server_name ${host};${crt}`);
      if (o.slash.startsWith('always add')) out.push('    # add a trailing slash when the last segment has no dot\n    rewrite ^(/(?:.*/)?[^/.]+)$ $1/ permanent;');
      if (o.slash.startsWith('always remove')) out.push('    # remove the trailing slash\n    rewrite ^/(.+)/$ /$1 permanent;');
      out.push('    # ... your location blocks ...\n}');
    }
    return out.join('\n') + '\n\nTest on staging first. A wrong slash rule can loop with your framework or a directory index. Verify with curl -I on http and https, www and non-www, with and without a trailing slash.';
  },
});

// ---------- 6. URL list normalizer / deduplicator ----------
const TRACK = /^(utm_[a-z0-9_]+|fbclid|gclid|gbraid|wbraid|msclkid|dclid|yclid|mc_cid|mc_eid|igshid|_ga|_gl|ref_src|twclid)$/i;
function normUrl(raw, o) {
  let s = raw.trim(); if (!s) return null;
  if (/^\/\//.test(s)) s = 'https:' + s; else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let u; try { u = new URL(s); } catch { return null; }          // URL() lowercases scheme and host, drops default ports, resolves dot segments
  if (!/^https?:$/.test(u.protocol)) return null;
  let host = u.hostname; if (o.www === 'remove www') host = host.replace(/^www\./, ''); else if (o.www === 'add www' && !host.startsWith('www.')) host = 'www.' + host;
  const proto = o.https ? 'https:' : u.protocol, port = u.port && !((proto === 'https:' && u.port === '443') || (proto === 'http:' && u.port === '80')) ? ':' + u.port : '';
  let path = normPct(u.pathname);
  if (o.index) path = path.replace(/\/index\.(html?|php|aspx?)$/i, '/');
  if (o.lowerpath) path = path.toLowerCase();
  if (o.slash === 'remove') path = path.length > 1 ? path.replace(/\/+$/, '') : path;
  else if (o.slash === 'add' && !/\/$|\.[A-Za-z0-9]{1,6}$/.test(path)) path += '/';
  let parts = u.search ? u.search.slice(1).split('&').filter((x) => x !== '') : [];
  parts = parts.map(normPct);
  if (o.track) parts = parts.filter((x) => !TRACK.test(x.split('=')[0]));
  if (o.emptyq) parts = parts.filter((x) => x.includes('=') ? x.split('=').slice(1).join('=') !== '' : true);
  if (o.sort) parts.sort((a, b) => (a.split('=')[0] < b.split('=')[0] ? -1 : a.split('=')[0] > b.split('=')[0] ? 1 : a < b ? -1 : a > b ? 1 : 0));
  const hash = o.hash ? '' : u.hash;
  return `${proto}//${host}${port}${path}${parts.length ? '?' + parts.join('&') : ''}${hash}`;
}
T.push({
  id: 'url-list-normalizer', cat: TECH, title: 'URL List Normalizer and Deduplicator',
  desc: 'Clean a URL list so equal URLs look equal: host case, default ports, dot segments, percent-encoding, parameter order, tracking parameters, slashes. Then remove or group duplicates.',
  labels: ['URLs, one per line'],
  sample: 'HTTP://Example.COM:80/a/./b/../Shop/?b=2&a=1&utm_source=x\nhttps://example.com/Shop?a=1&b=2\nhttps://www.example.com/shop/index.html#top\nhttps://example.com/caf%c3%a9/\nhttps://example.com/café\nhttps://example.com/Shop?a=1&b=2',
  opts: [{ id: 'mode', label: 'Output', type: 'select', choices: ['Normalized list', 'Unique normalized URLs', 'Duplicate groups'], def: 'Unique normalized URLs' },
    { id: 'https', label: 'Force https', type: 'checkbox', def: false }, { id: 'www', label: 'Host', type: 'select', choices: ['keep', 'remove www', 'add www'], def: 'keep' },
    { id: 'slash', label: 'Trailing slash', type: 'select', choices: ['keep', 'remove', 'add'], def: 'keep' }, { id: 'sort', label: 'Sort query parameters', type: 'checkbox', def: true },
    { id: 'track', label: 'Remove tracking parameters (utm_, gclid, fbclid ...)', type: 'checkbox', def: true }, { id: 'emptyq', label: 'Remove empty parameters (a=)', type: 'checkbox', def: false },
    { id: 'hash', label: 'Remove #fragment', type: 'checkbox', def: true }, { id: 'index', label: 'index.html / index.php to folder', type: 'checkbox', def: true },
    { id: 'lowerpath', label: 'Lowercase the path (paths are case-sensitive on most servers)', type: 'checkbox', def: false }],
  run: ([t], o) => {
    const src = lines(need(t, 'a URL list')), bad = [], groups = new Map();
    for (const l of src) { const n = normUrl(l, o); if (n == null) { bad.push(l); continue; } if (!groups.has(n)) groups.set(n, []); groups.get(n).push(l); }
    if (!groups.size) throw new Error('No valid http(s) URLs found.');
    const total = src.length - bad.length, dups = total - groups.size;
    const head = `${total} valid URLs, ${groups.size} unique after normalizing, ${dups} duplicate${dups === 1 ? '' : 's'}${bad.length ? `, ${bad.length} skipped` : ''}.`;
    let body;
    if (o.mode === 'Normalized list') body = src.map((l) => normUrl(l, o)).filter((x) => x != null).join('\n');
    else if (o.mode === 'Unique normalized URLs') body = [...groups.keys()].join('\n');
    else body = [...groups].filter(([, v]) => v.length > 1).map(([k, v]) => `${k}\n${v.map((x) => '  <- ' + x).join('\n')}`).join('\n\n') || '(no duplicates)';
    return `${head}\n\n${body}` + (bad.length ? `\n\nSkipped (not http or https URLs):\n${bad.join('\n')}` : '') + '\n\nNormalizing is a guess about which URLs your server treats as the same page. Case, parameter order and slashes can matter on your site: review before redirecting or removing anything.';
  },
});

// ---------- 7. Bulk URL sorter by path ----------
T.push({
  id: 'url-path-grouper', cat: TECH, title: 'URL Sorter and Folder Counter: Sort URLs by Path and Depth',
  desc: 'Sort a URL list by folder, group it under its directories and see a count for each folder and each depth level. Good for sitemap and crawl exports.',
  labels: ['URLs, one per line'],
  sample: 'https://example.com/\nhttps://example.com/blog/post-1\nhttps://example.com/blog/post-2\nhttps://example.com/blog/2024/post-3\nhttps://example.com/shop/widgets/blue\nhttps://example.com/shop/widgets/red\nhttps://example.com/shop\nhttps://example.com/about',
  opts: [{ id: 'level', label: 'Group by folder level', type: 'number', def: 1 }, { id: 'sort', label: 'Order of folders', type: 'select', choices: ['A to Z', 'most URLs first'], def: 'most URLs first' }, { id: 'list', label: 'List the URLs under each folder', type: 'checkbox', def: true }],
  run: ([t], o) => {
    const lvl = Math.max(1, Math.floor(+o.level || 1)), rows = lines(need(t, 'a URL list')).map((l) => { const p = urlParts(l), segs = p.path.split('/').filter(Boolean); return { l, host: p.host, segs, depth: segs.length }; });
    const grp = new Map(), depth = new Map();
    for (const r of rows) {
      const folders = r.segs.slice(0, Math.min(lvl, Math.max(r.segs.length - 1, 0)));
      const key = '/' + folders.join('/') + (folders.length ? '/' : ''); if (!grp.has(key)) grp.set(key, []); grp.get(key).push(r);
      depth.set(r.depth, (depth.get(r.depth) || 0) + 1);
    }
    const keys = [...grp.keys()].sort((a, b) => (o.sort === 'A to Z' ? a.localeCompare(b) : grp.get(b).length - grp.get(a).length || a.localeCompare(b)));
    const byPath = (a, b) => a.segs.join('/').localeCompare(b.segs.join('/'));
    return [`${rows.length} URLs, ${keys.length} folder${keys.length === 1 ? '' : 's'} at level ${lvl}. URLs directly in a folder (and files) count toward that folder; a URL with fewer folders than the level counts toward its deepest folder.`,
      sec('URLs per folder', table(['folder', 'URLs', 'share'], keys.map((k) => [k, grp.get(k).length, pct(grp.get(k).length, rows.length)]))),
      sec('URLs per depth (path segments)', table(['depth', 'URLs'], [...depth].sort((a, b) => a[0] - b[0]).map(([d, n]) => [d, n]))),
      o.list ? sec('Sorted URLs by folder', keys.map((k) => `${k}  (${grp.get(k).length})\n` + grp.get(k).sort(byPath).map((r) => '  ' + r.l).join('\n')).join('\n')) : ''].filter(Boolean).join('\n\n');
  },
});

// ---------- 8. Regex URL tester ----------
T.push({
  id: 'regex-url-filter', cat: TECH, title: 'Regex URL Tester: Match a Pattern Against a URL List',
  desc: 'Test one regular expression against many URLs at once. Shows which match, which do not, capture groups and an optional replacement, for redirect rules and analytics filters.',
  inputs: 2, labels: ['Regular expression (e.g. ^/blog/(\\d{4})/(.+)$ or /pattern/i)', 'URLs, one per line'], placeholder: ['^/blog/(\\d{4})/(.+)$', ''],
  sample: '^/blog/(\\d{4})/(.+)$', sample2: 'https://example.com/blog/2021/hello-world\nhttps://example.com/blog/about\n/blog/2019/old-post?utm_source=x\nhttps://example.com/shop/blue-widget',
  opts: [{ id: 'on', label: 'Test against', type: 'select', choices: ['path only', 'path and query', 'full URL'], def: 'path only' }, { id: 'rep', label: 'Replacement preview (optional, e.g. /articles/$2)', type: 'text', def: '/articles/$2' }, { id: 'flags', label: 'Flags (i = ignore case)', type: 'text', def: '' }],
  run: ([re, list], o) => {
    let src = need(re, 'a regular expression').trim(), fl = String(o.flags || '').replace(/[^gimsuy]/g, '');
    const m = /^\/(.*)\/([a-z]*)$/s.exec(src); if (m) { src = m[1]; fl = m[2] || fl; }
    fl = fl.replace(/g/g, ''); let rx; try { rx = new RegExp(src, fl); } catch (e) { throw new Error('Invalid regex: ' + e.message); }
    const us = lines(need(list, 'URLs')), hit = [], miss = [];
    for (const u of us) {
      const p = urlParts(u), subject = o.on === 'full URL' ? (p.origin ? u : u) : o.on === 'path and query' ? p.path + (p.query ? '?' + p.query : '') : p.path, mm = rx.exec(subject);
      if (!mm) { miss.push(u); continue; }
      let line = u; if (mm.length > 1) line += '\n    groups: ' + mm.slice(1).map((g, i) => `$${i + 1}=${g === undefined ? '(unset)' : JSON.stringify(g)}`).join('  ');
      if (o.rep) line += '\n    replaced: ' + subject.replace(rx, o.rep);
      hit.push(line);
    }
    return [`${hit.length} of ${us.length} URLs match (${pct(hit.length, us.length)}). Tested against: ${o.on}. JavaScript regex syntax: Apache (PCRE), Nginx and Google Analytics use slightly different dialects, so re-check rules there.`, sec(`Match (${hit.length})`, hit.join('\n') || '(none)'), sec(`No match (${miss.length})`, miss.join('\n') || '(none)')].join('\n\n');
  },
});

// ---------- 9. Redirect rule tester ----------
const rxFrom = (s) => s.replace(/\\\//g, '/');
function parseRules(text) {
  const rules = [], notes = [];
  lines(text).forEach((l, i) => {
    if (l[0] === '#') return; const lc = l.split(/\s+/)[0].toLowerCase(), tok = l.split(/\s+/);
    const noteBad = (why) => notes.push(`rule ${i + 1} not simulated: ${why}`);
    try {
      if (lc === 'redirect') {
        let k = 1, code = 302; const w = tok[1] && tok[1].toLowerCase();
        if (/^\d{3}$/.test(w)) { code = +w; k = 2; } else if (w === 'permanent') { code = 301; k = 2; } else if (w === 'temp') { k = 2; } else if (w === 'seeother') { code = 303; k = 2; } else if (w === 'gone') { code = 410; k = 2; }
        const from = tok[k].replace(/^"|"$/g, ''), to = (tok[k + 1] || '').replace(/^"|"$/g, '');
        rules.push({ i: i + 1, l, code, test: (p) => (p === from || p.startsWith(from.endsWith('/') ? from : from + '/') ? { to: to + p.slice(from.length) } : null) });
      } else if (lc === 'redirectmatch') {
        let k = 1, code = 302; const w = tok[1] && tok[1].toLowerCase();
        if (/^\d{3}$/.test(w)) { code = +w; k = 2; } else if (w === 'permanent') { code = 301; k = 2; } else if (w === 'temp') k = 2; else if (w === 'seeother') { code = 303; k = 2; } else if (w === 'gone') { code = 410; k = 2; }
        const rest = l.split(/\s+/).slice(k).join(' '), mm = /^("[^"]*"|\S+)\s*("[^"]*"|\S*)/.exec(rest), rx = new RegExp(mm[1].replace(/^"|"$/g, '')), to = mm[2].replace(/^"|"$/g, '');
        rules.push({ i: i + 1, l, code, test: (p) => { const r = rx.exec(p); return r ? { to: to.replace(/\$(\d)/g, (_, n) => r[n] ?? '') } : null; } });
      } else if (lc === 'rewrite') {
        const m = /^rewrite\s+("[^"]*"|\S+)\s+("[^"]*"|\S+)\s*(last|break|redirect|permanent)?\s*;?$/i.exec(l); if (!m) return noteBad('unreadable nginx rewrite');
        const rx = new RegExp(m[1].replace(/^"|"$/g, '')), rep = m[2].replace(/^"|"$/g, ''), flag = (m[3] || '').toLowerCase(), ext = /^https?:\/\//.test(rep);
        const code = flag === 'permanent' ? 301 : flag === 'redirect' || ext ? 302 : 0;
        rules.push({ i: i + 1, l, code, internal: !code, test: (p) => { const r = rx.exec(p); return r ? { to: rep.replace(/\$(\d)/g, (_, n) => r[n] ?? '') } : null; } });
      } else if (lc === 'location') {
        const m = /^location\s+(=|~\*|~|\^~)?\s*("[^"]*"|\S+)\s*\{\s*return\s+(30[1278])\s+("[^"]*"|[^;\s]+)\s*;\s*\}$/i.exec(l); if (!m) return noteBad('only one-line "location ... { return 3xx target; }" is read');
        const mod = m[1] || '', pat = m[2].replace(/^"|"$/g, ''), rx = mod.startsWith('~') ? new RegExp(pat, mod === '~*' ? 'i' : '') : null;
        rules.push({ i: i + 1, l, code: +m[3], test: (p) => ((mod === '=' ? p === pat : rx ? rx.test(p) : p.startsWith(pat)) ? { to: m[4].replace(/^"|"$/g, '') } : null) });
      } else if (/^(\/|https?:\/\/|\*)/.test(l)) {
        const tk = l.replace(/\s+#.*$/, '').split(/\s+/);
        if (tk.length < 2) return noteBad('need "from to [code]"');
        const code = /^\d{3}!?$/.test(tk[tk.length - 1]) && tk.length > 2 ? +tk.pop().replace('!', '') : 301;
        const to = tk.pop(); const from = tk[0];
        if (tk.length > 1) return noteBad('rules that match query parameters are not simulated');
        if (/^https?:\/\//.test(from)) return noteBad('host-specific rules are not simulated');
        const names = []; let src = ''; from.split(/(\*$|:[A-Za-z_][A-Za-z0-9_]*)/).forEach((part) => { if (part === '*') { src += '(.*)'; names.push('splat'); } else if (part[0] === ':' && part.length > 1) { src += '([^/]+)'; names.push(part.slice(1)); } else src += reEsc(part); });
        const rx = new RegExp('^' + src + '$');
        rules.push({ i: i + 1, l, code, test: (p) => { const r = rx.exec(p) || (p.length > 1 ? rx.exec(p.endsWith('/') ? p.slice(0, -1) : p + '/') : null); return r ? { to: to.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (m0, n) => { const k = names.indexOf(n); return k >= 0 ? r[k + 1] : m0; }) } : null; } });
      } else noteBad('unknown syntax');
    } catch (e) { notes.push(`rule ${i + 1} not simulated: ${e.message}`); }
  });
  return { rules, notes };
}
T.push({
  id: 'redirect-rule-tester', cat: TECH, title: 'Redirect Rule Tester: See Which Rule Matches a URL',
  desc: 'Paste your redirect rules (Apache Redirect and RedirectMatch, Nginx rewrite and one-line location, Netlify style wildcards) and test URLs to see the matching rule, status and final destination.',
  inputs: 2, labels: ['Redirect rules, one per line', 'URLs to test, one per line'],
  sample: 'Redirect 301 /old-shop /shop\nRedirectMatch 301 ^/blog/(\\d{4})/(.*)$ /articles/$2\nrewrite ^/docs/v1/(.*)$ /docs/latest/$1 permanent;\n/news/* /blog/:splat 301\n/legacy/:id /items/:id 302\n/shop /store 301',
  sample2: '/old-shop/widgets\n/blog/2020/hello\n/docs/v1/install\n/news/2024/launch\n/legacy/77\n/old-shop\n/nothing-here',
  opts: [{ id: 'hops', label: 'Follow chains up to (hops)', type: 'number', def: 10 }],
  run: ([rt, ut], o) => {
    const { rules, notes } = parseRules(need(rt, 'redirect rules')), us = lines(need(ut, 'URLs to test'));
    if (!rules.length) throw new Error('No readable rules.' + (notes[0] ? ' ' + notes[0] : ''));
    const max = Math.max(1, Math.min(30, +o.hops || 10)), out = []; let hit = 0, loops = 0, chains = 0;
    for (const u of us) {
      const p0 = urlParts(u); let path = decode(p0.path), query = p0.query, trace = [], status = 'no rule matches', seen = new Set();
      for (let h = 0; h < max + 1; h++) {
        if (h === max) { status = `stopped after ${max} hops (too many, or a loop)`; break; }
        let r = null, res = null; for (const c of rules) { res = c.test(path); if (res) { r = c; break; } }
        if (!r) { if (h > 0) status = `final destination: ${path}${query ? '?' + query : ''}`; break; }
        if (r.internal) { path = res.to; trace.push(`rule ${r.i}: internal rewrite (no redirect) to ${res.to}`); continue; }
        let to = res.to; if (r.code === 410) { trace.push(`rule ${r.i}: ${r.code} Gone`); status = '410 Gone'; break; }
        const tp = urlParts(to), dest = /^https?:\/\//.test(to) ? to : to;
        trace.push(`rule ${r.i}: ${r.code} -> ${dest}${query && !/\?/.test(to) ? '?' + query : ''}`);
        if (tp.origin) { status = `final: ${r.code} to another host`; break; }
        if (seen.has(path)) { status = 'loop'; loops++; break; }
        seen.add(path); path = decode(tp.path); if (tp.query) query = tp.query;
        status = `final: ${r.code} to ${to}`;
      }
      if (trace.length) hit++; if (trace.filter((x) => /-> /.test(x)).length > 1) chains++;
      out.push(`${u}\n  ${trace.length ? trace.join('\n  ') + '\n  ' : ''}=> ${status}`);
    }
    return [`${hit} of ${us.length} URLs matched a rule; ${chains} went through more than one redirect; ${loops} loops.`, out.join('\n\n'),
      notes.length ? sec('Rules not simulated', notes.join('\n')) : '',
      'Assumptions: the first matching rule wins, in the order you pasted (real servers use their own precedence: nginx location order, Apache module order). Redirect matches whole path segments and carries the rest of the path and the query string. Apache Redirect and RedirectMatch behaviour was checked with apache2 2.4; Netlify and nginx behaviour follows their documentation and was not run against the real servers; Netlify rules are also tried with the trailing slash added or removed, which is an assumption. Query-parameter rules and host rules are not simulated.'].filter(Boolean).join('\n\n');
  },
});

// ---------- 10. Custom 404 page ----------
T.push({
  id: 'custom-404-page-generator', cat: TECH, title: '404 Page Generator: Helpful Not Found Page with Search and Links',
  desc: 'Builds a single-file, accessible 404.html with a clear message, a search box and your popular links. Light and dark mode, no scripts, no external files.',
  labels: ['Popular links, one per line: Label | /url'], sample: 'Home | /\nBlog | /blog/\nProducts | /products/\nContact | /contact/',
  opts: [{ id: 'site', label: 'Site name', type: 'text', def: 'Example Site' }, { id: 'heading', label: 'Heading', type: 'text', def: 'This page could not be found' },
    { id: 'msg', label: 'Message', type: 'text', def: 'The link may be old or mistyped. Try a search, or one of the pages below.' }, { id: 'search', label: 'Search form action (leave empty for no search box)', type: 'text', def: '/search' },
    { id: 'param', label: 'Search parameter name', type: 'text', def: 'q' }, { id: 'lang', label: 'Page language code', type: 'text', def: 'en' }, { id: 'accent', label: 'Accent colour (hex)', type: 'text', def: '#1a56db' }],
  run: ([t], o) => {
    const links = lines(need(t, 'links')).map((l) => { const [a, ...b] = l.split('|'); const href = (b.join('|') || a).trim(); if (/^\s*(javascript|data):/i.test(href)) throw new Error('Unsafe link: ' + href); return [(b.length ? a : href).trim(), href]; });
    const acc = /^#[0-9a-f]{6}$/i.test(String(o.accent).trim()) ? o.accent.trim() : (() => { throw new Error('Accent colour must look like #1a56db.'); })();
    const lang = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(String(o.lang).trim()) ? o.lang.trim() : 'en';
    const s = o.search ? `\n  <form action="${esc(o.search)}" method="get" role="search">\n    <label for="q">Search ${esc(o.site)}</label>\n    <input id="q" name="${esc(o.param || 'q')}" type="search" autocomplete="off">\n    <button type="submit">Search</button>\n  </form>` : '';
    const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>404 - ${esc(o.heading)} | ${esc(o.site)}</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1b1f24;--muted:#4b5563;--acc:${acc};--line:#d0d5dd}
@media (prefers-color-scheme:dark){:root{--bg:#10141a;--fg:#e8eaed;--muted:#aab2bd;--line:#3a424d;--acc:#8ab4ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:1.0625rem/1.6 system-ui,sans-serif}
main{max-width:40rem;margin:0 auto;padding:3rem 1rem}
h1{font-size:1.75rem;line-height:1.25}.code{color:var(--muted);font-weight:600;letter-spacing:.05em}
a{color:var(--acc)}label{display:block;font-weight:600;margin:1.5rem 0 .25rem}
input,button{font:inherit;padding:.5rem .75rem;border:1px solid var(--line);border-radius:.375rem;background:var(--bg);color:var(--fg)}
button{background:var(--acc);color:var(--bg);border-color:var(--acc);cursor:pointer}
:focus-visible{outline:3px solid var(--acc);outline-offset:2px}ul{padding-left:1.25rem}li{margin:.25rem 0}
</style>
</head>
<body>
<main>
  <p class="code">Error 404</p>
  <h1>${esc(o.heading)}</h1>
  <p>${esc(o.msg)}</p>${s}
  <h2>Popular pages</h2>
  <ul>
${links.map(([a, h]) => `    <li><a href="${esc(h)}">${esc(a)}</a></li>`).join('\n')}
  </ul>
</main>
</body>
</html>
`;
    return { text: html, html, filename: '404.html' };
  },
});

// ---------- 11. DNS answer comparer ----------
const RT = 'A AAAA CNAME MX NS TXT SOA SRV CAA PTR DS DNSKEY HTTPS SVCB'.split(' ');
function parseDns(text) {
  const recs = [];
  for (const raw of lines(text)) {
    const l = raw.replace(/\s;.*$/, ''); if (/^[;#]/.test(l)) continue;
    let m = /^(\S+)\s+(\d+)\s+IN\s+([A-Z0-9]+)\s+(.+)$/i.exec(l) || /^(\S+)\s+IN\s+([A-Z0-9]+)\s+(.+)$/i.exec(l);
    let name = '', ttl = null, type = '', val = '';
    if (m && m.length === 5) [, name, ttl, type, val] = m; else if (m) [, name, type, val] = m;
    else { m = /^([A-Z]+)\s+(.+)$/.exec(l); if (m && RT.includes(m[1])) [, type, val] = m; else { type = '?'; val = l; } }
    val = val.trim().replace(/\s+/g, ' ');
    if (type.toUpperCase() === 'TXT') val = val.replace(/"\s+"/g, '');
    recs.push({ name: name.toLowerCase().replace(/\.$/, ''), ttl: ttl == null ? null : +ttl, type: type.toUpperCase(), val: val.toLowerCase().replace(/\.$/, '') });
  }
  return recs;
}
T.push({
  id: 'dns-answer-comparer', cat: TECH, title: 'DNS Answer Comparer: Compare Two Resolver Results After a Change',
  desc: 'Paste dig output (or record lines) from two resolvers, or from before and after a DNS change, and see what matches, what differs and which TTLs disagree.',
  inputs: 2, labels: ['Answer from resolver A (e.g. dig @8.8.8.8 example.com A)', 'Answer from resolver B (e.g. dig @1.1.1.1 example.com A)'],
  sample: ';; ANSWER SECTION:\nexample.com. 300 IN A 203.0.113.10\nexample.com. 300 IN MX 10 mail.example.com.\nwww.example.com. 300 IN CNAME example.com.', sample2: ';; ANSWER SECTION:\nexample.com. 120 IN A 198.51.100.7\nexample.com. 300 IN MX 10 mail.example.com.\nwww.example.com. 300 IN CNAME example.com.',
  opts: [{ id: 'ttl', label: 'Report TTL differences', type: 'checkbox', def: true }],
  run: ([a, b], o) => {
    const A = parseDns(need(a, 'resolver A output')), B = parseDns(need(b, 'resolver B output'));
    if (!A.length || !B.length) throw new Error('No records found in one of the inputs.');
    const key = (r) => `${r.name}|${r.type}|${r.val}`, ma = new Map(A.map((r) => [key(r), r])), mb = new Map(B.map((r) => [key(r), r]));
    const fmt = (r) => `${r.name || '(name?)'} ${r.type} ${r.val}`.trim(), same = [], onlyA = [], onlyB = [], ttl = [];
    for (const [k, r] of ma) { if (mb.has(k)) { same.push(fmt(r)); const t2 = mb.get(k).ttl; if (o.ttl && r.ttl != null && t2 != null && r.ttl !== t2) ttl.push(`${fmt(r)}: A ${r.ttl}s, B ${t2}s`); } else onlyA.push(fmt(r)); }
    for (const [k, r] of mb) if (!ma.has(k)) onlyB.push(fmt(r));
    const verdict = !onlyA.length && !onlyB.length ? 'The two answers agree.' : 'The two answers DIFFER. This can be propagation still in progress, caching until the TTL runs out, or geo/load-balanced DNS.';
    return [verdict + ` ${same.length} records in both, ${onlyA.length} only in A, ${onlyB.length} only in B.`, onlyA.length ? sec('Only in A', onlyA.join('\n')) : '', onlyB.length ? sec('Only in B', onlyB.join('\n')) : '', ttl.length ? sec('Same record, different TTL (a cached copy is older)', ttl.join('\n')) : '', same.length ? sec('In both', same.join('\n')) : '',
      'Records are compared as sets: order is ignored, names and values are lowercased, a trailing dot is ignored. Round-robin DNS may legitimately return different records on each query. Nothing is looked up by this page: run dig or nslookup yourself and paste the results.'].filter(Boolean).join('\n\n');
  },
});

// ---------- 12. Domain migration checklist (custom UI) ----------
// Steps follow Google Search Central, "Site moves with URL changes" (read 2026-10).
const MIG = [
  ['Prepare', ['Set up the new site and check TLS certificates', 'Make the new robots.txt block only what you intend', 'List the URLs whose noindex must be removed at launch', 'Return 404 or 410 on the new site for content you are not moving', 'Verify every variant of the old and new site in Search Console (http/https, www/non-www)', 'Keep verification files, tags and analytics snippets on the new site', 'Set crawl rate to "Let Googlebot determine" on both properties', 'Re-upload the disavow file to the new property if you use one', 'Check the new domain for manual actions and old removal requests', 'Set up analytics for the new site and check the server can handle extra crawling']],
  ['Map URLs', ['Collect old URLs from sitemaps, server logs, analytics and Search Console (include images, CSS, JS, PDFs)', 'Map each old URL to its new URL', 'Add self-referencing canonical tags on the new site', 'Update hreflang annotations to the new URLs', 'Update internal links to the new URLs', 'Prepare the new sitemap and keep a list of sites linking to the old URLs']],
  ['Launch', ['Plan server-side permanent redirects (301 or 308)', 'Redirect straight to the final URL (aim for 3 hops or fewer, never more than 5)', 'Do not redirect many old pages to the home page or to unrelated pages', 'Turn on the redirects', 'Remove temporary noindex rules and check canonicals point to new URLs', 'Test redirects with URL Inspection and a script for the full list', 'Submit the Change of Address tool for the old domain (domain moves only; not needed for http to https or www changes)', 'Submit the new sitemap, then remove the old one']],
  ['After launch', ['Update links on social profiles, ads, email signatures and partner sites', 'Ask the most important external sites to update their links', 'Watch the Sitemaps, Page indexing and Performance reports', 'Check server logs for Googlebot activity and unexpected errors', 'Keep the redirects for at least a year', 'Expect ranking changes for a few weeks or longer on large sites']],
];
const ckStore = { get() { try { return JSON.parse(localStorage.getItem('ft-migration-checklist') || '{}'); } catch { return {}; } }, set(v) { try { localStorage.setItem('ft-migration-checklist', JSON.stringify(v)); } catch { /* storage blocked: the list still works for this visit */ } } };
T.push({
  id: 'domain-migration-checklist', cat: TECH, title: 'Domain Migration SEO Checklist: Redirects, Search Console, Sitemaps',
  desc: 'Tick off a site move step by step: preparation, URL mapping, redirects, Change of Address and follow-up. Progress is saved in this browser only.',
  custom: true,
  render(el) {
    const st = ckStore.get(), all = MIG.flatMap((g) => g[1]), mk = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
    const prog = mk('p', { role: 'status' }), upd = () => { const d = all.filter((x) => st[x]).length; prog.textContent = `${d} of ${all.length} steps done (${Math.round(100 * d / all.length)}%)`; };
    const note = mk('p', { className: 'muted', textContent: 'Based on Google Search Central, "Site moves with URL changes" (read October 2026). Your site may need more steps. Not legal or professional advice.' });
    const groups = MIG.map(([g, items], gi) => mk('fieldset', {}, mk('legend', { textContent: g }), ...items.map((it, i) => {
      const id = `mig-${gi}-${i}`, cb = mk('input', { type: 'checkbox', id, checked: !!st[it] });
      cb.addEventListener('change', () => { st[it] = cb.checked; ckStore.set(st); upd(); });
      return mk('div', {}, cb, mk('label', { htmlFor: id, textContent: ' ' + it }));
    })));
    const msg = mk('p', { role: 'status' });
    const copy = mk('button', { type: 'button', textContent: 'Copy as Markdown' });
    copy.addEventListener('click', async () => { const md = MIG.map(([g, items]) => `## ${g}\n` + items.map((x) => `- [${st[x] ? 'x' : ' '}] ${x}`).join('\n')).join('\n\n'); try { await navigator.clipboard.writeText(md); msg.textContent = 'Copied.'; } catch { msg.textContent = 'Copy failed: select the list manually.'; } });
    const reset = mk('button', { type: 'button', textContent: 'Reset all' });
    reset.addEventListener('click', () => { for (const k of Object.keys(st)) delete st[k]; ckStore.set(st); el.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = false; }); upd(); msg.textContent = 'Checklist cleared.'; });
    el.replaceChildren(prog, ...groups, mk('p', {}, copy, ' ', reset), msg, note); upd();
  },
});

// ---------- 13. URL length checker ----------
T.push({
  id: 'url-length-checker', cat: TECH, title: 'URL Length Checker: Sitemap, Apache and Nginx Limits',
  desc: 'Check URL length in characters and bytes against the sitemap limit (2,048), the default Apache request line limit and the default Nginx header buffer, plus your own limit.',
  labels: ['URLs, one per line'], sample: 'https://example.com/\nhttps://example.com/blog/a-very-long-article-title-that-keeps-going-and-going-for-seo-purposes-and-then-some-more\nhttps://example.com/search?q=' + 'x'.repeat(2100) + '\nhttps://example.com/caf%C3%A9?ref=top',
  opts: [{ id: 'soft', label: 'Your own guideline (characters, 0 = off)', type: 'number', def: 100 }, { id: 'rows', label: 'Rows to list', type: 'number', def: 50 }],
  run: ([t], o) => {
    const rows = lines(need(t, 'URLs')).map((u) => { const enc = new TextEncoder().encode(u).length, p = urlParts(u); let d; try { d = decodeURI(u); } catch { d = u; } const segs = p.path.split('/').filter(Boolean);
      return { u, chars: u.length, bytes: enc, dec: d.length, depth: segs.length, long: Math.max(0, ...segs.map((x) => x.length)), q: p.query ? p.query.split('&').length : 0 }; });
    const soft = Math.max(0, Math.floor(+o.soft || 0)), flag = (r) => [r.chars >= 2048 ? 'OVER SITEMAP LIMIT' : '', r.bytes > 8000 ? 'near Apache/Nginx default (8190 / 8192)' : '', soft && r.chars > soft ? 'over your guideline' : ''].filter(Boolean).join('; ');
    const sorted = [...rows].sort((a, b) => b.chars - a.chars), lim = Math.max(1, +o.rows || 50), avg = round(rows.reduce((s, r) => s + r.chars, 0) / rows.length);
    return [`${rows.length} URLs. Longest ${sorted[0].chars} characters, average ${avg}. Over 2,048 characters: ${rows.filter((r) => r.chars >= 2048).length}${soft ? `; over ${soft}: ${rows.filter((r) => r.chars > soft).length}` : ''}.`,
      table(['chars', 'bytes', 'depth', 'params', 'flag', 'URL'], sorted.slice(0, lim).map((r) => [r.chars, r.bytes, r.depth, r.q, flag(r), r.u.length > 90 ? r.u.slice(0, 87) + '...' : r.u])),
      'Limits: sitemaps.org says a <loc> must be less than 2,048 characters. Apache LimitRequestLine defaults to 8190 bytes (method, URL and protocol together); Nginx large_client_header_buffers defaults to 8k and answers 414 when the request line is longer (both from their documentation). Google publishes no maximum URL length for Search that I could verify, so the guideline above is your own style rule, not a ranking threshold. Browsers and CDNs have their own limits that are not checked here.'].join('\n\n');
  },
});

// ---------- 14. Case-only URL duplicates ----------
T.push({
  id: 'url-case-duplicates', cat: TECH, title: 'Case Sensitivity URL Checker: URLs That Differ Only by Letter Case',
  desc: 'Find URLs in a list that are the same except for upper and lower case. On case-sensitive servers they can be separate duplicate pages. Gives the lowercase version to redirect to.',
  labels: ['URLs, one per line'], sample: 'https://example.com/Shop/Widgets\nhttps://example.com/shop/widgets\nhttps://example.com/shop/widgets/\nhttps://EXAMPLE.com/Blog/Post?ID=5\nhttps://example.com/blog/post?id=5\nhttps://example.com/about',
  opts: [{ id: 'scope', label: 'Compare case in', type: 'select', choices: ['path only', 'path and query'], def: 'path only' }, { id: 'slash', label: 'Treat trailing slash as the same', type: 'checkbox', def: true }],
  run: ([t], o) => {
    const rows = lines(need(t, 'URLs')), g = new Map();
    for (const u of rows) {
      const p = urlParts(u), path = o.slash && p.path.length > 1 ? p.path.replace(/\/+$/, '') : p.path, qs = o.scope === 'path and query' ? p.query : p.query.toLowerCase(), k = p.host.toLowerCase() + path.toLowerCase() + (qs ? '?' + (o.scope === 'path and query' ? qs.toLowerCase() : qs) : '');
      if (!g.has(k)) g.set(k, new Set()); g.get(k).add(u);
    }
    const dup = [...g].filter(([, v]) => v.size > 1);
    if (!dup.length) return `${rows.length} URLs checked: no case-only duplicates found.`;
    return [`${dup.length} group${dup.length === 1 ? '' : 's'} of URLs that differ only by case (${dup.reduce((s, [, v]) => s + v.size, 0)} URLs of ${rows.length}).`,
      dup.map(([k, v]) => `${k}\n${[...v].map((x) => '  ' + x).join('\n')}`).join('\n\n'),
      'Next: pick one lowercase form, 301 the others to it and use it in canonical tags and the sitemap. Host names are never case-sensitive, so host-only differences are shown but need no fix. Whether your server treats these as different pages depends on its operating system and configuration: check one pair with curl -I before acting.'].join('\n\n');
  },
});

// ---------- 15. Crawl error URL grouper ----------
const tmpl = (seg) => (/^\d+$/.test(seg) ? '{n}' : /^[0-9a-f]{8,}$/i.test(seg) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) ? '{id}' : (seg.match(/-/g) || []).length >= 2 && /^[a-z0-9-%]+$/i.test(seg) ? '{slug}' : seg);
T.push({
  id: 'crawl-error-url-grouper', cat: TECH, title: 'Crawl Error URL Grouper: Find Patterns in 404 and Error URL Lists',
  desc: 'Paste URLs from a Search Console export, a crawler or a log. Groups them by folder, URL pattern, file type or query parameter so you can fix a whole class of errors at once.',
  labels: ['URLs (optionally followed by the reason or status), one per line'], sample: 'https://example.com/blog/2019/old-post-title-here 404\nhttps://example.com/blog/2020/another-old-one 404\nhttps://example.com/products/12345 404\nhttps://example.com/products/12346 404\nhttps://example.com/products/12399 Soft 404\nhttps://example.com/img/banner.jpg 404\nhttps://example.com/search?q=widgets&page=3 404\nhttps://example.com/search?q=gadgets&page=9 404\nhttps://example.com/old.html 404',
  opts: [{ id: 'by', label: 'Group by', type: 'select', choices: ['URL pattern', 'first folder', 'first two folders', 'file type', 'query parameter names', 'reason / status'], def: 'URL pattern' }, { id: 'min', label: 'Show groups with at least', type: 'number', def: 1 }],
  run: ([t], o) => {
    const rows = []; for (const l of lines(need(t, 'a URL list'))) { const m = /(https?:\/\/\S+|\/\S*)/.exec(l); if (!m) continue; const p = urlParts(m[1]); rows.push({ u: m[1], reason: l.replace(m[1], '').replace(/^[\s,;|\t]+|[\s,;|\t]+$/g, '').replace(/^"|"$/g, ''), segs: p.path.split('/').filter(Boolean), q: p.query, host: p.host }); }
    if (!rows.length) throw new Error('No URLs found.');
    const key = (r) => o.by === 'first folder' ? '/' + (r.segs.length > 1 ? r.segs[0] + '/' : '') : o.by === 'first two folders' ? '/' + r.segs.slice(0, Math.min(2, r.segs.length - 1)).join('/') + (r.segs.length > 1 ? '/' : '')
      : o.by === 'file type' ? ((/\.([A-Za-z0-9]{1,6})$/.exec(r.segs[r.segs.length - 1] || '') || [, '(page, no extension)'])[1]).toLowerCase()
      : o.by === 'query parameter names' ? (r.q ? r.q.split('&').map((x) => x.split('=')[0]).sort().join(', ') : '(no query)') : o.by === 'reason / status' ? r.reason || '(none given)'
      : '/' + r.segs.map(tmpl).join('/') + (r.q ? '?' + r.q.split('&').map((x) => x.split('=')[0] + '=*').join('&') : '');
    const g = new Map(); for (const r of rows) { const k = key(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
    const list = [...g].filter(([, v]) => v.length >= Math.max(1, +o.min || 1)).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    return [`${rows.length} URLs in ${g.size} group${g.size === 1 ? '' : 's'} (by ${o.by}).`, table(['URLs', 'share', 'group', 'example'], list.map(([k, v]) => [v.length, pct(v.length, rows.length), k, v[0].u.length > 70 ? v[0].u.slice(0, 67) + '...' : v[0].u])),
      'Patterns: digits become {n}, long hex or UUID values {id}, hyphenated words {slug}. Review each group: a large group with one cause (a deleted section, a moved folder, a broken link template) is the best thing to fix first, with a redirect if there is a close replacement or with a corrected link if the URL was never valid. This is a grouping aid; it does not check the URLs.'].join('\n\n');
  },
});

// ---------- shared text helpers for the content tools ----------
const sentences = (t) => String(t).replace(/\s+/g, ' ').match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)?.map((x) => x.trim()).filter(Boolean) || [];
const wordsOf = (t) => String(t).toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
const stem = (w) => w.replace(/(ies)$/, 'y').replace(/(sses)$/, 'ss').replace(/([^s])s$/, '$1');

// ---------- 16. N-gram extractor ----------
T.push({
  id: 'ngram-extractor', cat: CONT, title: 'N-gram Extractor: Most Frequent 2, 3 and 4-Word Phrases',
  desc: 'Finds the most repeated two, three and four word phrases in a text, with counts, without crossing sentence breaks. Choose how stop words are handled.',
  labels: ['Text'], sample: 'Our running shoes are made for trail running. Trail running shoes need grip, and good trail running shoes need cushioning too. Choose running shoes that fit. Running shoes for trail running are not road running shoes.',
  opts: [{ id: 'min', label: 'Shortest phrase (words)', type: 'number', def: 2 }, { id: 'max', label: 'Longest phrase (words)', type: 'number', def: 4 }, { id: 'stop', label: 'Stop words', type: 'select', choices: ['skip phrases that start or end with one', 'skip phrases containing any', 'keep all'], def: 'skip phrases that start or end with one' },
    { id: 'count', label: 'Minimum count', type: 'number', def: 2 }, { id: 'rows', label: 'Rows per length', type: 'number', def: 15 }],
  run: ([t], o) => {
    const lo = Math.max(2, Math.floor(+o.min || 2)), hi = Math.min(8, Math.max(lo, Math.floor(+o.max || 4))), segs = sentences(need(t, 'text')).flatMap((s) => s.split(/[,;:()—]|\s-\s/)).map(wordsOf).filter((w) => w.length), total = segs.reduce((n, w) => n + w.length, 0), out = [`${total} words. Phrases never cross a sentence, comma or bracket.`];
    for (let n = lo; n <= hi; n++) {
      const m = new Map();
      for (const w of segs) for (let i = 0; i + n <= w.length; i++) {
        const g = w.slice(i, i + n); if (o.stop.startsWith('skip phrases that') && (STOP.has(g[0]) || STOP.has(g[n - 1]))) continue; if (o.stop.startsWith('skip phrases containing') && g.some((x) => STOP.has(x))) continue;
        const k = g.join(' '); m.set(k, (m.get(k) || 0) + 1);
      }
      const rows = [...m].filter(([, c]) => c >= Math.max(1, +o.count || 1)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, Math.max(1, +o.rows || 15));
      out.push(sec(`${n}-word phrases`, rows.length ? table(['count', 'per 1000 words', 'phrase'], rows.map(([k, c]) => [c, round(1000 * c / total), k])) : '(none at this minimum count)'));
    }
    return out.join('\n\n');
  },
});

// ---------- 17. Keyword permutation generator ----------
T.push({
  id: 'keyword-permutation-generator', cat: CONT, title: 'Keyword Permutation Generator: Combine Word Lists',
  desc: 'Put two to four lists of words in separate blocks (separated by a blank line) and get every combination, optionally in all column orders. Up to 50,000 results.',
  labels: ['Word lists: one word or phrase per line, blank line between lists'], sample: 'buy\ncheap\nbest\n\nrunning shoes\ntrail shoes\n\nonline\nnear me',
  opts: [{ id: 'sep', label: 'Join with', type: 'text', def: ' ' }, { id: 'orders', label: 'Also use every column order', type: 'checkbox', def: false }, { id: 'lower', label: 'Lowercase', type: 'checkbox', def: true }],
  run: ([t], o) => {
    const cols = String(need(t, 'your lists')).split(/\r?\n\s*\r?\n/).map(lines).filter((c) => c.length);
    if (cols.length < 2 || cols.length > 4) throw new Error('Use two to four lists, separated by a blank line.');
    const sep = o.sep === '' ? '' : String(o.sep ?? ' '), orders = [], idx = cols.map((_, i) => i);
    const perm = (a, k = 0) => { if (k === a.length - 1) orders.push([...a]); else for (let i = k; i < a.length; i++) { [a[k], a[i]] = [a[i], a[k]]; perm(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; } };
    if (o.orders) perm(idx); else orders.push(idx);
    const size = cols.reduce((n, c) => n * c.length, 1) * orders.length; if (size > 50000) throw new Error(`That would make ${size} combinations. The limit is 50,000: shorten the lists.`);
    const res = new Set();
    for (const ord of orders) { let acc = ['']; ord.forEach((ci, k) => { const nx = []; for (const a of acc) for (const w of cols[ci]) nx.push(k ? a + sep + w : w); acc = nx; }); for (const r of acc) res.add(o.lower ? r.toLowerCase() : r); }
    return `${res.size} combinations from ${cols.map((c) => c.length).join(' x ')} items${o.orders ? ' in all column orders' : ''}.\n\n${[...res].join('\n')}`;
  },
});

// ---------- 18. Keyword list cleaner ----------
T.push({
  id: 'keyword-list-cleaner', cat: CONT, title: 'Keyword List Cleaner: Remove Duplicates, Stop Words and Near-Duplicates',
  desc: 'Cleans a keyword list: lowercase, trim, strip symbols, drop exact duplicates, optionally drop stop words and near-duplicates (same words in another order, simple plurals).',
  labels: ['Keywords, one per line'], sample: 'Running Shoes\nrunning shoes \nshoes running\nrunning shoe\nThe best trail shoes!!\nbest trail shoes\nbuy shoes online\nshoes',
  opts: [{ id: 'sym', label: 'Remove symbols and extra spaces', type: 'checkbox', def: true }, { id: 'stop', label: 'Remove stop words', type: 'checkbox', def: false }, { id: 'near', label: 'Remove near-duplicates (word order and plural)', type: 'checkbox', def: true },
    { id: 'minw', label: 'Minimum words per keyword', type: 'number', def: 1 }, { id: 'report', label: 'List what was removed', type: 'checkbox', def: true }],
  run: ([t], o) => {
    const src = lines(need(t, 'a keyword list')), seen = new Map(), keep = [], gone = [];
    for (const raw of src) {
      let k = raw.toLowerCase(); if (o.sym) k = k.replace(/[^\p{L}\p{N}\s'’-]+/gu, ' ').replace(/\s+/g, ' ').trim();
      let w = k.split(/\s+/).filter(Boolean); if (o.stop) w = w.filter((x) => !STOP.has(x)); k = w.join(' ');
      if (!k) { gone.push([raw, 'empty after cleaning']); continue; }
      if (w.length < Math.max(1, +o.minw || 1)) { gone.push([raw, 'too short']); continue; }
      const sig = o.near ? w.map(stem).sort().join(' ') : k;
      if (seen.has(sig)) { gone.push([raw, `same as "${seen.get(sig)}"`]); continue; }
      seen.set(sig, k); keep.push(k);
    }
    return `${src.length} lines in, ${keep.length} kept, ${gone.length} removed.\n\n${keep.join('\n')}` + (o.report && gone.length ? '\n\n' + sec('Removed', gone.map(([a, r]) => `${a}  (${r})`).join('\n')) : '') + '\n\nNear-duplicate matching is a simple plural and word-order rule in English. It can merge keywords that mean different things ("shoe store" and "store shoes"): check the removed list.';
  },
});

// ---------- 19. Question keyword extractor ----------
const QW = ['who', 'whom', 'whose', 'what', 'when', 'where', 'why', 'how', 'which', 'can', 'could', 'do', 'does', 'did', 'is', 'are', 'was', 'were', 'will', 'would', 'should', 'shall', 'may', 'might', 'has', 'have', 'am'];
T.push({
  id: 'question-keyword-extractor', cat: CONT, title: 'Question Keyword Extractor: Filter a Keyword List to Questions',
  desc: 'Keeps only the question-style keywords (who, what, how, can, is ...) from a list and groups them by question word, ready for FAQ and how-to content.',
  labels: ['Keywords, one per line'], sample: 'how to clean running shoes\nrunning shoes\nwhat are the best trail shoes\nare trail shoes waterproof\nbest trail shoes 2025\ncan you wash shoes in a washing machine\nshoes for flat feet\nwhy do my shoes squeak\nshoes near me?',
  opts: [{ id: 'anywhere', label: 'Also keep keywords that contain a question word later ("best way how to ...")', type: 'checkbox', def: false }, { id: 'mark', label: 'Keep ones ending with ?', type: 'checkbox', def: true }],
  run: ([t], o) => {
    const src = lines(need(t, 'a keyword list')), g = new Map(), rx = new RegExp('\\b(' + QW.join('|') + ')\\b');
    for (const k of src) {
      const low = k.toLowerCase().trim(), first = low.split(/\s+/)[0]; let w = QW.includes(first) ? first : null;
      if (!w && o.anywhere) { const m = rx.exec(low); if (m) w = m[1]; }
      if (!w && o.mark && low.endsWith('?')) w = '(ends with ?)';
      if (w) { if (!g.has(w)) g.set(w, []); g.get(w).push(k); }
    }
    const n = [...g.values()].reduce((s, v) => s + v.length, 0); if (!n) return `0 of ${src.length} keywords look like questions.`;
    return `${n} of ${src.length} keywords look like questions.\n\n` + [...g].sort((a, b) => b[1].length - a[1].length).map(([w, v]) => `${w} (${v.length})\n${v.map((x) => '  ' + x).join('\n')}`).join('\n\n') + '\n\nEnglish question words only. A keyword that starts with "can", "is" or "do" can also be a product name or a statement: check the list.';
  },
});

// ---------- 20. Content decay finder ----------
function csvRows(text) {
  const d = text.split('\n', 1)[0].includes('\t') ? '\t' : ',', rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"' && cur === '') q = true; else if (c === d) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); if (row.some((x) => x.trim())) rows.push(row); row = []; cur = ''; } else cur += c; }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row); return rows;
}
const numOf = (s) => { const x = parseFloat(String(s ?? '').replace(/[%\s]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.')); return Number.isFinite(x) ? x : NaN; };
function gscPages(text, what) {
  const r = csvRows(need(text, what)), h = r[0].map((x) => x.toLowerCase()), col = (re) => h.findIndex((x) => re.test(x));
  const ic = col(/click/), ii = col(/impress/), ip = col(/position/);
  if (ic < 0) throw new Error(`${what}: no Clicks column in the header row.`);
  const m = new Map(); for (const x of r.slice(1)) { const k = x[0].trim(); if (!k) continue; m.set(k, { c: numOf(x[ic]) || 0, i: ii >= 0 ? numOf(x[ii]) || 0 : NaN, p: ip >= 0 ? numOf(x[ip]) : NaN }); } return m;
}
T.push({
  id: 'content-decay-finder', cat: CONT, title: 'Content Decay Finder: Pages Losing Clicks Between Two Search Console Exports',
  desc: 'Paste the Pages export from Search Console for an earlier and a later period. Lists pages that lost clicks, with impression, position and CTR changes and a hint about the likely cause.',
  inputs: 2, labels: ['Earlier period: Pages export (page, clicks, impressions, CTR, position)', 'Later period: Pages export'],
  sample: 'Top pages,Clicks,Impressions,CTR,Position\n/guide-widgets,400,9000,4.4%,5.1\n/blog/old-tips,220,6000,3.7%,6.0\n/pricing,90,900,10%,3.2\n/blog/steady,50,2000,2.5%,9.0\n/blog/gone,60,1500,4%,8.0',
  sample2: 'Top pages,Clicks,Impressions,CTR,Position\n/guide-widgets,250,8800,2.8%,5.3\n/blog/old-tips,90,3000,3%,11.2\n/pricing,92,950,9.7%,3.1\n/blog/steady,52,2100,2.5%,8.9',
  opts: [{ id: 'minc', label: 'Minimum clicks in the earlier period', type: 'number', def: 20 }, { id: 'drop', label: 'Minimum drop in clicks (%)', type: 'number', def: 20 }],
  run: ([a, b], o) => {
    const A = gscPages(a, 'Earlier export'), B = gscPages(b, 'Later export'), minc = +o.minc || 0, drop = +o.drop || 0, rows = [];
    for (const [k, x] of A) {
      if (x.c < minc) continue; const y = B.get(k), c2 = y ? y.c : 0, ch = 100 * (c2 - x.c) / x.c; if (-ch < drop) continue;
      let why = 'review';
      if (!y) why = 'not in the later export (no impressions, or dropped out of the top rows)';
      else if (Number.isFinite(x.p) && Number.isFinite(y.p) && y.p - x.p >= 2) why = 'ranking fell: check competitors and freshness';
      else if (Number.isFinite(x.i) && Number.isFinite(y.i) && y.i < x.i * 0.8) why = 'fewer impressions: demand or visibility dropped';
      else if (Number.isFinite(x.i) && Number.isFinite(y.i)) why = 'impressions and rank steady: title/snippet or SERP features may have changed';
      rows.push({ k, c1: x.c, c2, ch, why, dp: y && Number.isFinite(y.p) && Number.isFinite(x.p) ? round(y.p - x.p) : '' });
    }
    rows.sort((p, q) => (q.c1 - q.c2) - (p.c1 - p.c2));
    const lost = rows.reduce((n, r) => n + r.c1 - r.c2, 0);
    return `${A.size} pages in the earlier export, ${B.size} in the later one. ${rows.length} pages lost at least ${drop}% of their clicks (${lost} clicks in total).\n\n` + (rows.length ? table(['page', 'clicks before', 'clicks now', 'change', 'position change', 'hint'], rows.map((r) => [r.k.length > 60 ? r.k.slice(0, 57) + '...' : r.k, r.c1, r.c2, round(r.ch) + '%', r.dp === '' ? '' : (r.dp > 0 ? '+' : '') + r.dp, r.why])) : 'No page crossed the thresholds.') +
      '\n\nUse two periods of the same length (for example 3 months against the 3 months before), and keep seasonality in mind: a seasonal page will "decay" every off-season. Search Console exports are capped at 1,000 rows, so pages missing from the later file may only be below that cutoff. Hints are rules of thumb; confirm in Search Console.';
  },
});

// ---------- 21. Passive voice and sentence length ----------
const IRREG = 'been born borne beaten become begun bent bet bitten blown broken brought built bought caught chosen come cut dealt done drawn driven eaten fallen fed felt fought found flown forgotten forgiven frozen gotten given gone grown hung heard hidden hit held hurt kept known laid led left lent let lain lit lost made meant met paid put read ridden rung risen run said seen sold sent set shaken shot shown shut sung sunk sat slept spoken spent spun split spread stood stolen struck sworn swept taken taught torn told thought thrown understood woken worn won written'.split(' ');
const BE = /\b(am|is|are|was|were|be|been|being)\b/i;
const PASSIVE = new RegExp('\\b(?:am|is|are|was|were|be|been|being)\\s+(?:(?:not|never|also|often|usually|always|then|still|just|already|n\'t|really|being)\\s+)*((?:[a-z]+ed)|' + IRREG.join('|') + ')\\b(?!\\s+(?:to|by\\s+(?:the way)))', 'i');
T.push({
  id: 'passive-voice-checker', cat: CONT, title: 'Passive Voice and Long Sentence Checker',
  desc: 'Flags sentences that look passive ("was written by") and sentences that are too long, with counts and percentages. A heuristic for English text, not a grammar parser.',
  labels: ['Text'], sample: 'The report was written by the team last week. We reviewed it carefully. Mistakes were made, and the budget was not approved because the numbers had been changed by someone who was tired and who did not check them against the original spreadsheet that the finance department keeps on the shared drive. The meeting is scheduled for Monday. She is tired.',
  opts: [{ id: 'max', label: 'Long sentence from (words)', type: 'number', def: 25 }],
  run: ([t], o) => {
    const ss = sentences(need(t, 'text')), lim = Math.max(5, +o.max || 25), rows = ss.map((s, i) => ({ s, n: wordsOf(s).length, p: PASSIVE.test(s) && !/\bis\s+(tired|done|gone|finished|married|lost|known|born)\b/i.test(s) })), pas = rows.filter((r) => r.p), lng = rows.filter((r) => r.n >= lim);
    const avg = round(rows.reduce((n, r) => n + r.n, 0) / rows.length);
    return [`${rows.length} sentences, average ${avg} words. Possible passive voice: ${pas.length} (${pct(pas.length, rows.length)}). Long (${lim}+ words): ${lng.length} (${pct(lng.length, rows.length)}).`,
      rows.some((r) => r.p || r.n >= lim) ? sec('Flagged sentences', rows.map((r, i) => (r.p || r.n >= lim) ? `${i + 1}. [${[r.p ? 'passive?' : '', r.n >= lim ? r.n + ' words' : ''].filter(Boolean).join(', ')}] ${r.s}` : '').filter(Boolean).join('\n')) : 'No sentence flagged.',
      'How it works: it looks for a form of "to be" followed by a past participle (words ending in -ed plus a list of common irregular ones). That finds most simple passives but also some adjectives ("is tired") and misses others. Passive voice is not an error: use it when the doer is unknown or unimportant. A common guideline is to keep most sentences under about 20 words; there is no Google rule about it.'].join('\n\n');
  },
});

// ---------- 22. Content brief builder ----------
function headingsOf(block) {
  const out = []; const txt = String(block);
  if (/<h[1-6][\s>]/i.test(txt)) { for (const m of txt.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)) out.push([+m[1], m[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()]); }
  else for (const l of txt.split(/\r?\n/)) { const m = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l); if (m) out.push([m[1].length, m[2]]); else { const d = /^\s*(H[1-6])\s*[:\-]\s*(.+)$/i.exec(l); if (d) out.push([+d[1][1], d[2].trim()]); } }
  return out.filter((h) => h[1]);
}
T.push({
  id: 'content-brief-builder', cat: CONT, title: 'Content Brief Builder from Competitor Headings',
  desc: 'Paste the headings of top-ranking pages (HTML or Markdown, one block per page) and get a brief: topics most pages cover, questions asked, common terms, typical length of the outline and a draft outline.',
  inputs: 2, labels: ['Target keyword and notes (first line = keyword)', 'Competitor outlines: paste each page\'s headings; separate pages with a line "==="'],
  sample: 'trail running shoes\nAudience: beginners', sample2: '# Best Trail Running Shoes\n## How to choose trail running shoes\n## Cushioning and grip\n## What is the difference between trail and road shoes?\n## Our top picks\n===\n# Trail Running Shoes Guide\n## Choosing trail shoes\n## Grip and lugs\n## Do you need waterproof trail shoes?\n## Care and cleaning\n===\n<h1>Trail shoes</h1><h2>Top picks</h2><h2>How to choose a trail running shoe</h2><h2>Grip: lug depth explained</h2><h3>Waterproof or not?</h3>',
  run: ([k, c]) => {
    const kw = lines(need(k, 'the target keyword'))[0], pages = String(need(c, 'competitor headings')).split(/^\s*={3,}\s*$/m).map(headingsOf).filter((h) => h.length);
    if (!pages.length) throw new Error('No headings found. Use # Markdown headings, H2: lines or HTML <h2> tags.');
    const topics = [];
    pages.forEach((hs, pi) => hs.filter((h) => h[0] >= 2).forEach(([lv, text]) => {
      const set = new Set(wordsOf(text).filter((w) => !STOP.has(w)).map(stem)); if (!set.size) return;
      let best = null, bs = 0; for (const t of topics) { const inter = [...set].filter((w) => t.set.has(w)).length, j = inter / (set.size + t.set.size - inter); if (j > bs) { bs = j; best = t; } }
      if (best && bs >= 0.5) { best.pages.add(pi); best.v.push(text); } else topics.push({ set, pages: new Set([pi]), v: [text], lv });
    }));
    topics.sort((a, b) => b.pages.size - a.pages.size);
    const q = uniq(pages.flat().filter(([, t]) => /\?\s*$/.test(t) || QW.includes(wordsOf(t)[0])).map((h) => h[1])), freq = new Map();
    for (const hs of pages) for (const w of new Set(hs.flatMap(([, t]) => wordsOf(t).filter((x) => !STOP.has(x) && x.length > 2).map(stem)))) freq.set(w, (freq.get(w) || 0) + 1);
    const common = [...freq].filter(([, n]) => n >= Math.min(2, pages.length)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15).map(([w, n]) => `${w} (${n}/${pages.length} pages)`), h2s = pages.map((h) => h.filter((x) => x[0] === 2).length), avg = round(h2s.reduce((a, b) => a + b, 0) / pages.length);
    return [`CONTENT BRIEF: ${kw}`, `Pages analysed: ${pages.length}. Average H2 sections: ${avg} (range ${Math.min(...h2s)} to ${Math.max(...h2s)}).`,
      sec('Topics to cover (by how many pages cover them)', topics.slice(0, 15).map((t) => `${t.pages.size}/${pages.length}  ${t.v[0]}`).join('\n')), q.length ? sec('Questions competitors answer', q.map((x) => '- ' + x).join('\n')) : '', common.length ? sec('Terms used in headings across pages', common.join(', ')) : '',
      sec('Draft outline (edit this)', `H1: ${kw[0].toUpperCase() + kw.slice(1)}: ...\n` + topics.filter((t) => t.pages.size >= Math.min(2, pages.length)).slice(0, 8).map((t) => `H2: ${t.v[0]}`).join('\n') + (q.length ? `\nH2: Frequently asked questions\n` + q.slice(0, 4).map((x) => `  H3: ${x}`).join('\n') : '')),
      'Topics are grouped by shared words in the headings (a simple overlap rule), so check the groups. A brief shows what others cover; it does not tell you what will rank or what is missing from your own angle. Use it with your own expertise and sources.'].filter(Boolean).join('\n\n');
  },
});

// ---------- 23. Featured snippet formatter ----------
T.push({
  id: 'featured-snippet-formatter', cat: CONT, title: 'Featured Snippet Formatter: Paragraph, List or Table Answer',
  desc: 'Reshape an answer into a short paragraph, an ordered or bulleted list or a table, with clean HTML under a question heading. Checks length against common rules of thumb.',
  labels: ['Your answer (text, a list with one item per line, or table rows)'], sample: 'Trail running shoes have deeper lugs for grip on soft ground. They often add a rock plate under the forefoot. They are stiffer than road shoes. Most also use tougher uppers that resist scuffs. Road shoes are lighter and smoother and work best on pavement.',
  opts: [{ id: 'q', label: 'Question (becomes the H2)', type: 'text', def: 'What is the difference between trail and road running shoes?' }, { id: 'fmt', label: 'Format', type: 'select', choices: ['auto', 'paragraph', 'ordered list', 'bulleted list', 'table'], def: 'auto' }, { id: 'max', label: 'Paragraph target (max words)', type: 'number', def: 55 }],
  run: ([t], o) => {
    const raw = need(t, 'your answer').trim(), ls = lines(raw), marker = /^\s*(?:[-*•]|\d+[.)])\s+/, nums = ls.filter((l) => /^\s*\d+[.)]\s+/.test(l)).length;
    const delim = ls.length >= 2 ? (ls.every((l) => l.includes('\t')) ? '\t' : ls.every((l) => l.includes('|')) ? '|' : ls.every((l) => l.split(',').length >= 2 && l.split(',').length === ls[0].split(',').length) ? ',' : null) : null;
    let f = o.fmt; if (f === 'auto') f = ls.filter((l) => marker.test(l)).length >= 2 ? (nums >= 2 ? 'ordered list' : 'bulleted list') : delim ? 'table' : ls.length >= 3 && ls.every((l) => wordsOf(l).length <= 15 && !/[.!?]$/.test(l)) ? 'bulleted list' : 'paragraph';
    const h = o.q ? `<h2>${esc(o.q)}</h2>\n` : '', notes = []; let body;
    if (f === 'paragraph') {
      const ss = sentences(ls.join(' ')), max = Math.max(10, +o.max || 55), keep = []; let n = 0;
      for (const s of ss) { const w = wordsOf(s).length; if (keep.length && n + w > max) break; keep.push(s); n += w; }
      let txt = keep.join(' '); if (n > max) { txt = txt.split(/\s+/).slice(0, max).join(' ') + '...'; notes.push('The first sentence alone is longer than the target, so it was cut. Split it.'); }
      body = `<p>${esc(txt)}</p>`; notes.push(`Paragraph: ${wordsOf(txt).length} words${keep.length < ss.length ? ` (${ss.length - keep.length} sentence${ss.length - keep.length === 1 ? '' : 's'} left out: put them after the answer)` : ''}. A common rule of thumb is 40 to 60 words.`);
      if (wordsOf(txt).length < 30) notes.push('Short: add a clear one-sentence definition or answer.');
    } else if (f.endsWith('list')) {
      let items = ls.length >= 2 ? ls.map((l) => l.replace(marker, '')) : sentences(raw); const tag = f.startsWith('ordered') ? 'ol' : 'ul';
      body = `<${tag}>\n${items.map((i) => `  <li>${esc(i.replace(/[.;]$/, ''))}</li>`).join('\n')}\n</${tag}>`;
      notes.push(`List: ${items.length} items. A common rule of thumb is 3 to 8 short items${items.some((i) => wordsOf(i).length > 15) ? '; some items are longer than 15 words, shorten them' : ''}.`); if (tag === 'ol') notes.push('Use an ordered list only when the order matters (steps, rankings).');
    } else {
      const d = delim || (ls[0].includes('\t') ? '\t' : ls[0].includes('|') ? '|' : ','), rows = ls.map((l) => l.split(d).map((c) => c.trim()).filter((c, i, a) => !(d === '|' && (i === 0 || i === a.length - 1) && c === ''))), cols = rows[0].length;
      if (rows.some((r) => r.length !== cols) || cols < 2) throw new Error('Table rows need the same number of columns (separate with tabs, | or commas).');
      body = `<table>\n  <thead><tr>${rows[0].map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>\n  <tbody>\n${rows.slice(1).map((r) => `    <tr>${r.map((c, i) => (i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('')}</tr>`).join('\n')}\n  </tbody>\n</table>`;
      notes.push(`Table: ${rows.length - 1} rows x ${cols} columns. Keep it small (about 3 to 5 columns, a handful of rows).`);
    }
    return `${h}${body}\n\n${sec('Notes', notes.map((x) => '- ' + x).join('\n'))}\n\nGoogle chooses featured snippets itself. No markup guarantees one: a direct answer placed right under a matching heading is simply the easiest thing to quote. Length guidance here is a rule of thumb, not a Google rule.`;
  },
});

// ---------- 24. Keyword difficulty estimator ----------
T.push({
  id: 'keyword-difficulty-estimator', cat: CONT, title: 'Keyword Difficulty Estimator from Competitor Metrics You Enter',
  desc: 'Turn the authority and link counts of the pages ranking for a keyword into a 0 to 100 difficulty score with a simple, shown formula, and compare it with your own site.',
  labels: ['One keyword per line: keyword, average authority (0-100) of the top 10, average referring domains to those pages, lowest authority in the top 10 (optional)'], placeholder: ['trail running shoes, 62, 140, 28'],
  sample: 'trail running shoes, 62, 140, 28\nwaterproof trail shoes for wide feet, 35, 12, 14\nbest running shoes, 78, 520, 55\nhow to lace trail shoes, 30, 6',
  opts: [{ id: 'mine', label: 'Your site authority (0-100, same scale)', type: 'number', def: 30 }, { id: 'cap', label: 'Referring domains counted as "maximum" links', type: 'number', def: 500 }],
  run: ([t], o) => {
    const mine = +o.mine, cap = Math.max(10, +o.cap || 500), rows = lines(need(t, 'keyword rows')).map((l, i) => {
      const p = l.split(',').map((x) => x.trim()), da = numOf(p[1]), rd = numOf(p[2]), lo = p[3] === undefined || p[3] === '' ? NaN : numOf(p[3]);
      if (p.length < 3 || !Number.isFinite(da) || !Number.isFinite(rd) || da < 0 || da > 100 || rd < 0) throw new Error(`Line ${i + 1}: use "keyword, authority 0-100, referring domains" (got "${l.slice(0, 40)}")`);
      const link = 100 * Math.min(1, Math.log10(1 + rd) / Math.log10(1 + cap)), score = Math.round(0.5 * da + 0.5 * link);
      return { k: p[0], da, rd, lo, score, lab: score < 25 ? 'easy' : score < 45 ? 'moderate' : score < 65 ? 'hard' : 'very hard', gap: Math.round(score - mine) };
    }).sort((a, b) => a.score - b.score);
    return table(['difficulty', 'label', 'vs you', 'avg authority', 'avg ref. domains', 'lowest in top 10', 'keyword'], rows.map((r) => [r.score, r.lab, (r.gap > 0 ? '+' : '') + r.gap, r.da, r.rd, Number.isFinite(r.lo) ? r.lo + (Number.isFinite(mine) && mine >= r.lo - 5 ? ' (weak spot)' : '') : '', r.k])) +
      `\n\nFormula: difficulty = 50% x average authority + 50% x link score, where link score = 100 x log10(1 + referring domains) / log10(1 + ${cap}), capped at 100. "vs you" = difficulty minus your authority. "Weak spot" = your authority is within 5 of the lowest-authority page already ranking. This is a transparent rule of thumb built only from what you type: it ignores content quality, search intent, brand strength and SERP features, and it is not comparable with any tool's own keyword difficulty. Use it to rank your own list, not as a prediction.`;
  },
});

// ---------- 25. Monthly volume seasonality ----------
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], MONFULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
T.push({
  id: 'monthly-volume-seasonality', cat: CONT, title: 'Search Volume Seasonality Chart from Monthly Data',
  desc: 'Paste monthly search volumes (from a keyword tool, 12 or more months) and see a text bar chart, a seasonal index per month, peak and low months and the swing between them.',
  labels: ['Monthly volumes: "2024-01 1200", "Jan 2024: 1,200", "Jan 1200", or just numbers starting in the month you choose'], sample: '2024-01 900\n2024-02 950\n2024-03 1100\n2024-04 1500\n2024-05 2100\n2024-06 2600\n2024-07 2400\n2024-08 1800\n2024-09 1200\n2024-10 1000\n2024-11 1300\n2024-12 1500\n2025-01 1000\n2025-02 1000\n2025-03 1200\n2025-04 1700\n2025-05 2300\n2025-06 2800',
  opts: [{ id: 'start', label: 'First month (only for lists of bare numbers)', type: 'select', choices: MONFULL, def: 'January' }],
  run: ([t], o) => {
    const ls = lines(need(t, 'monthly volumes')), by = Array.from({ length: 12 }, () => []);
    const bare = ls.every((l) => /^[\d.,\s]+$/.test(l));
    if (bare) { const vals = ls.flatMap((l) => (l.includes(',') && !/\d,\d{3}\b/.test(l) ? l.split(',') : [l])).map(numOf).filter(Number.isFinite), s0 = MONFULL.indexOf(o.start); vals.forEach((v, i) => by[(s0 + i) % 12].push(v)); }
    else for (const l of ls) {
      let m, mi = -1, rest = l;
      if ((m = /(\d{4})[-\/.](\d{1,2})\b/.exec(l))) { mi = +m[2] - 1; rest = l.replace(m[0], ' '); }
      else if ((m = /\b(\d{1,2})[-\/.](\d{4})\b/.exec(l))) { mi = +m[1] - 1; rest = l.replace(m[0], ' '); }
      else if ((m = new RegExp('\\b(' + MON.join('|') + ')[a-z]*\\.?(?:\\s+\\d{4})?', 'i').exec(l))) { mi = MON.indexOf(m[1].toLowerCase()); rest = l.replace(m[0], ' '); }
      const v = numOf(rest.replace(/[:;|=]/g, ' ').trim().split(/\s+/).pop()); if (mi < 0 || mi > 11 || !Number.isFinite(v)) throw new Error(`Could not read month and volume in: "${l.slice(0, 40)}"`);
      by[mi].push(v);
    }
    const avg = by.map((a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)); if (avg.filter(Number.isFinite).length < 6) throw new Error('Need at least 6 different months.');
    const ok = avg.filter(Number.isFinite), mean = ok.reduce((a, b) => a + b, 0) / ok.length, mx = Math.max(...ok), mn = Math.min(...ok);
    const rows = avg.map((v, i) => Number.isFinite(v) ? `${MONFULL[i].slice(0, 3)}  ${String(Math.round(v)).padStart(7)}  ${String(Math.round(100 * v / mean)).padStart(4)}  ${'#'.repeat(Math.max(1, Math.round(30 * v / mx)))}${by[i].length > 1 ? `  (${by[i].length} yrs)` : ''}` : `${MONFULL[i].slice(0, 3)}  (no data)`);
    const hi = avg.map((v, i) => [v, i]).filter(([v]) => v >= mean * 1.2).map(([, i]) => MONFULL[i]), lo = avg.map((v, i) => [v, i]).filter(([v]) => v <= mean * 0.8).map(([, i]) => MONFULL[i]);
    return `Month  average  index  chart (index 100 = average month)\n${rows.join('\n')}\n\nPeak: ${MONFULL[avg.indexOf(mx)]} (index ${Math.round(100 * mx / mean)}). Low: ${MONFULL[avg.indexOf(mn)]} (index ${Math.round(100 * mn / mean)}). Peak to low: ${round(mx / mn)}x.\nHigh season (index 120 or more): ${hi.join(', ') || 'none'}. Low season (80 or less): ${lo.join(', ') || 'none'}.\n\n${mx / mn >= 1.5 ? 'Clearly seasonal. A common rule of thumb is to publish or refresh a few weeks to two months before the rise, so the page can be indexed and ranked in time. Test it on your own site.' : 'Little seasonality in this data.'} With under 2 years of data, one-off events can look like seasons. Monthly keyword tool volumes are estimates.`;
  },
});

// ---------- 26. SERP position CTR traffic model ----------
const DEF_CURVE = '1:28, 2:15, 3:11, 4:8, 5:6, 6:5, 7:4, 8:3, 9:2.5, 10:2';
T.push({
  id: 'serp-ctr-traffic-model', cat: CONT, title: 'SERP Position CTR Model: Estimate Clicks from Target Rankings',
  desc: 'Estimate monthly clicks from search volume and ranking position with a click-through curve you can edit. Compare current and target positions and see the possible gain.',
  labels: ['One per line: keyword, monthly volume, current position (optional, 0 or empty = not ranking), target position'], placeholder: ['trail running shoes, 5400, 12, 3'],
  sample: 'trail running shoes, 5400, 12, 3\nwaterproof trail shoes, 1900, 0, 5\nbest trail shoes 2025, 3600, 8, 2\ntrail shoe laces, 480, 4, 1',
  opts: [{ id: 'curve', label: 'CTR by position (position:percent, ...)', type: 'text', def: DEF_CURVE }, { id: 'beyond', label: 'CTR below the last position in the curve (%)', type: 'number', def: 0.5 }, { id: 'conf', label: 'Chance the target is reached (%)', type: 'number', def: 100 }],
  run: ([t], o) => {
    const curve = new Map(String(o.curve).split(',').map((x) => x.trim().split(':').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite) && p[0] >= 1)); if (!curve.size) throw new Error('Curve format: 1:28, 2:15, 3:11');
    const last = Math.max(...curve.keys()), ctr = (p) => (!p || p < 1 ? 0 : p > last ? (+o.beyond || 0) : (curve.get(Math.round(p)) ?? [...curve].filter(([k]) => k <= p).sort((a, b) => b[0] - a[0])[0]?.[1] ?? 0)) / 100, conf = Math.min(100, Math.max(0, +o.conf)) / 100;
    const rows = lines(need(t, 'keyword rows')).map((l, i) => {
      const p = l.split(',').map((x) => x.trim()), vol = numOf(p[1]), cur = p[2] ? numOf(p[2]) : 0, tgt = numOf(p[3] ?? p[2]);
      if (!p[0] || !Number.isFinite(vol) || !Number.isFinite(tgt)) throw new Error(`Line ${i + 1}: use "keyword, volume, current position, target position"`);
      const now = vol * ctr(cur || 0), goal = vol * ctr(tgt); return { k: p[0], vol, cur: cur || '-', tgt, now, goal, gain: (goal - now) * conf };
    });
    const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
    return table(['keyword', 'volume', 'now', 'target', 'clicks now', 'clicks at target', 'expected gain'], rows.map((r) => [r.k, r.vol, r.cur, r.tgt, Math.round(r.now), Math.round(r.goal), (r.gain >= 0 ? '+' : '') + Math.round(r.gain)])) +
      `\n\nTotal: ${Math.round(sum((r) => r.now))} clicks a month now, ${Math.round(sum((r) => r.goal))} at target positions, expected gain ${Math.round(sum((r) => r.gain))} (at ${Math.round(conf * 100)}% chance).\n\nThe default curve (${DEF_CURVE}) is illustrative: round numbers chosen for illustration, not measured data. Real CTR depends on intent, brand, SERP features, ads and device. Replace it with the curve from your own Search Console data (the Search Console Performance Export Analyzer shows CTR by position). Volume is the monthly average from your keyword tool.`;
  },
});

// ---------- 27. Transliteration for keywords ----------
const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const UKR = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: ['ye', 'ie'], ж: 'zh', з: 'z', и: 'y', і: 'i', ї: ['yi', 'i'], й: ['y', 'i'], к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: ['yu', 'iu'], я: ['ya', 'ia'], 'ʼ': '', "'": '', '’': '' };
const GRK = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
const GDI = { ου: 'ou', αι: 'ai', ει: 'ei', οι: 'oi', υι: 'yi', μπ: 'b', ντ: 'd', γγ: 'ng', γκ: 'g', αυ: 'av', ευ: 'ev' };
const KANA_V = { あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho', ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'o', が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po' };
const KANA_S = { き: 'ky', し: 'sh', ち: 'ch', に: 'ny', ひ: 'hy', み: 'my', り: 'ry', ぎ: 'gy', じ: 'j', ぢ: 'j', び: 'by', ぴ: 'py' };
const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
function kana(s) {
  s = kataToHira(s); let out = '', dbl = false, miss = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (c === 'っ') { dbl = true; continue; }
    if (c === 'ー') { const m = out.match(/[aiueo]$/); if (m) out += m[0]; continue; }
    let r;
    if (c === 'ん') { r = /[あいうえおやゆよ]/.test(n || '') ? "n'" : 'n'; }
    else if (n && 'ゃゅょ'.includes(n) && KANA_S[c]) { const v = { ゃ: 'a', ゅ: 'u', ょ: 'o' }[n]; r = KANA_S[c].length === 1 ? KANA_S[c] + v : (c === 'し' || c === 'ち' || c === 'じ' || c === 'ぢ' ? KANA_S[c] + v : KANA_S[c] + v); i++; }
    else if (KANA_V[c]) r = KANA_V[c];
    else { out += c; dbl = false; if (/[㐀-鿿]/.test(c)) miss++; continue; }
    if (dbl) { r = (r.startsWith('ch') ? 't' : r[0]) + r; dbl = false; }
    out += r;
  }
  return [out, miss];
}
function xlit(line, lang) {
  const low = line;
  if (lang === 'Japanese kana (Hepburn style)') return kana(low);
  if (lang === 'Greek') {
    let out = '', i = 0; const s = low.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    while (i < s.length) { const d = s.slice(i, i + 2); if (GDI[d]) { let r = GDI[d]; if ((d === 'μπ' || d === 'ντ') && i > 0 && /\p{L}/u.test(s[i - 1])) r = d === 'μπ' ? 'mp' : 'nt'; if (d === 'γκ' && i > 0 && /\p{L}/u.test(s[i - 1])) r = 'ng'; out += r; i += 2; } else { out += GRK[s[i]] ?? s[i]; i++; } }
    return [out, 0];
  }
  const map = lang === 'Ukrainian' ? UKR : CYR; let out = '', miss = 0; const s = low.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    const c = s[i], r = map[c]; if (r === undefined) { out += c; if (/[Ѐ-ӿ]/.test(c)) miss++; continue; }
    out += Array.isArray(r) ? r[i === 0 || !/\p{L}/u.test(s[i - 1]) ? 0 : 1] : r;
  }
  return [out, miss];
}
T.push({
  id: 'keyword-transliterator', cat: CONT, title: 'Transliteration Keyword Tool: Cyrillic, Greek and Japanese Kana to Latin',
  desc: 'Turns Russian, Ukrainian, Greek or Japanese kana keywords into Latin-letter spellings, with an optional URL-slug form. A simplified rule-based romanization, not an official standard.',
  labels: ['Keywords, one per line'], sample: 'купить кроссовки\nтрейлраннинг обувь',
  opts: [{ id: 'lang', label: 'Script', type: 'select', choices: ['Russian', 'Ukrainian', 'Greek', 'Japanese kana (Hepburn style)'], def: 'Russian' }, { id: 'slug', label: 'Also give a URL slug', type: 'checkbox', def: true }],
  run: ([t], o) => {
    let miss = 0; const out = lines(need(t, 'keywords')).map((l) => { const [r, m] = xlit(l, o.lang); miss += m; const slug = r.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); return o.slug ? `${l}\n  ${r}\n  /${slug}` : `${l}\t${r}`; });
    return out.join('\n') + `\n\n${miss ? `${miss} character${miss === 1 ? '' : 's'} left unchanged (letters of another language or script, or kanji, which cannot be converted without a dictionary).\n` : ''}Simplified romanization written from general knowledge of common schemes: Russian is close to BGN/PCGN, Ukrainian follows the usual national scheme with initial and medial forms, Greek handles common digraphs, Japanese follows Hepburn without macrons. I did not check these against the official standard texts, so do not use them for passports or legal names. Chinese (pinyin) is not supported: it needs a character dictionary that is not included. People search in many ways: check real queries in Search Console before using a spelling.`;
  },
});

export default T;

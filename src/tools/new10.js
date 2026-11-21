// Tools from free-browser-tools.md, batch 10. See TOOLS.md for the contract.
// Skipped in this batch (need network, accounts or a parser too large to hand-write): live DNS/RDAP/IP/ASN/GitHub/npm/PyPI/crates lookups,
// speed test, Tor list, CORS/WebSocket/SSE/GraphQL/REST clients, JS obfuscator, TS/Babel transpilers, bundler, AST explorer, Pyodide, ESLint, WAT.
const T = [];
const NET = 'Network & HTTP', DEV = 'Code Formatters';

/* ---------- IP helpers (BigInt) ---------- */
function p4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s.trim());
  if (!m || m.slice(1).some((x) => +x > 255 || (x.length > 1 && x[0] === '0'))) return null;
  return m.slice(1).reduce((a, x) => (a << 8n) | BigInt(x), 0n);
}
function p6(s) {
  s = s.trim().toLowerCase().replace(/%.*$/, '');
  if (!/^[0-9a-f:.]+$/.test(s)) return null;
  const dc = s.indexOf('::');
  if (dc !== s.lastIndexOf('::')) return null;
  const conv = (part) => {
    if (part === '') return [];
    const g = part.split(':'), out = [];
    for (let i = 0; i < g.length; i++) {
      if (g[i].includes('.')) { if (i !== g.length - 1) return null; const v = p4(g[i]); if (v === null) return null; out.push(Number(v >> 16n), Number(v & 0xffffn)); }
      else { if (!/^[0-9a-f]{1,4}$/.test(g[i])) return null; out.push(parseInt(g[i], 16)); }
    }
    return out;
  };
  let w;
  if (dc >= 0) {
    const a = conv(s.slice(0, dc)), b = conv(s.slice(dc + 2));
    if (!a || !b || a.length + b.length > 7) return null;
    w = [...a, ...Array(8 - a.length - b.length).fill(0), ...b];
  } else { w = conv(s); if (!w || w.length !== 8) return null; }
  return w.reduce((a, x) => (a << 16n) | BigInt(x), 0n);
}
const words = (v) => Array.from({ length: 8 }, (_, i) => Number((v >> BigInt(112 - 16 * i)) & 0xffffn));
function f6(v) { // RFC 5952 compression
  const w = words(v); let bs = -1, bl = 0;
  for (let i = 0; i < 8;) { if (w[i]) { i++; continue; } let j = i; while (j < 8 && !w[j]) j++; if (j - i > bl) { bs = i; bl = j - i; } i = j; }
  const h = (x) => x.toString(16);
  if (bl < 2) return w.map(h).join(':');
  return w.slice(0, bs).map(h).join(':') + '::' + w.slice(bs + bl).map(h).join(':');
}
const x6 = (v) => words(v).map((x) => x.toString(16).padStart(4, '0')).join(':');
const f4 = (v) => [24n, 16n, 8n, 0n].map((s) => Number((v >> s) & 255n)).join('.');
const lines = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

/* ---------- 1. IPv6 prefix splitter ---------- */
T.push({
  id: 'ipv6-prefix-splitter', cat: NET, title: 'IPv6 Prefix Expander, Compressor and Subnet Splitter',
  desc: 'Expand and compress IPv6 prefixes, then split them into longer prefixes such as /48 into /52 or /64.',
  inputs: 1, labels: ['IPv6 prefixes (one per line)'], placeholder: ['2001:db8::/48'],
  opts: [{ id: 'newlen', label: 'Split into /N (0 = do not split)', type: 'number', def: 52 }, { id: 'max', label: 'List at most', type: 'number', def: 32 }],
  sample: '2001:db8::/48\n2001:0DB8:0:0:0:0:0:1/64',
  run([inp], o) {
    const out = [];
    for (const l of lines(inp)) {
      const m = /^([^/\s]+)(?:\/(\d{1,3}))?$/.exec(l);
      const v = m && p6(m[1]);
      const len = m && m[2] !== undefined ? +m[2] : 128;
      if (v === null || v === undefined || len > 128) throw new Error('Not a valid IPv6 prefix: ' + l);
      const host = 128n - BigInt(len), mask = ((1n << 128n) - 1n) ^ ((1n << host) - 1n), net = v & mask, last = net | ((1n << host) - 1n);
      out.push(`Input: ${l}`, `Expanded: ${x6(v)}`, `Compressed: ${f6(v)}`, `Prefix: ${f6(net)}/${len}${net !== v ? ' (host bits were cleared)' : ''}`, `First: ${f6(net)}`, `Last: ${f6(last)}`, `Addresses: ${1n << host} (2^${host})`);
      const n = +o.newlen;
      if (n) {
        if (n > 128) throw new Error('The split length must be at most 128.');
        if (n <= len) out.push(`(cannot split into /${n}: the prefix is already /${len})`);
        else { const cnt = 1n << BigInt(n - len), step = 1n << BigInt(128 - n), max = Math.max(1, +o.max || 32);
        out.push(`Subnets of /${n}: ${cnt}`);
        for (let i = 0n; i < cnt && i < BigInt(max); i++) out.push('  ' + f6(net + i * step) + '/' + n);
        if (cnt > BigInt(max)) out.push(`  ... ${cnt - BigInt(max)} more`); }
      }
      out.push('');
    }
    if (!out.length) throw new Error('Enter at least one IPv6 prefix.');
    return out.join('\n').trim();
  },
});

/* ---------- 2. IPv4 to IPv6 mapper ---------- */
T.push({
  id: 'ipv4-to-ipv6-mapper', cat: NET, title: 'IPv4 to IPv6 Address Mapper (Mapped, 6to4, NAT64)',
  desc: 'Show the IPv4-mapped, 6to4 and NAT64 (64:ff9b::/96) IPv6 forms of an IPv4 address, or pull the IPv4 address back out.',
  inputs: 1, labels: ['IPv4 or IPv6 addresses (one per line)'], sample: '192.0.2.1\n::ffff:198.51.100.7\n2002:c000:0204::1\n64:ff9b::203.0.113.9',
  run([inp]) {
    const out = [];
    for (const l of lines(inp)) {
      const a = p4(l);
      if (a !== null) {
        out.push(l, `  IPv4-mapped (RFC 4291): ::ffff:${f4(a)}  =  ${f6(0xffff00000000n | a)}`,
          `  6to4 prefix (RFC 3056): ${f6((0x2002n << 112n) | (a << 80n))}/48`,
          `  NAT64 well-known prefix (RFC 6052): 64:ff9b::${f4(a)}  =  ${f6((0x64ff9bn << 96n) | a)}`, '');
        continue;
      }
      const v = p6(l);
      if (v === null) throw new Error('Not an IPv4 or IPv6 address: ' + l);
      const w = words(v), r = [l, '  Compressed: ' + f6(v)];
      if (v >> 32n === 0xffffn) r.push('  IPv4-mapped: embedded IPv4 is ' + f4(v & 0xffffffffn));
      else if (w[0] === 0x2002) r.push('  6to4 (2002::/16): embedded IPv4 is ' + f4((v >> 80n) & 0xffffffffn));
      else if (v >> 32n === 0x64ff9bn << 64n) r.push('  NAT64 64:ff9b::/96: embedded IPv4 is ' + f4(v & 0xffffffffn));
      else r.push('  Not an IPv4-mapped, 6to4 or NAT64 well-known address.');
      out.push(...r, '');
    }
    if (!out.length) throw new Error('Enter at least one address.');
    return out.join('\n').trim();
  },
});

/* ---------- 3. DNS zone file parser ---------- */
const TTLU = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
function ttlSecs(t) {
  if (/^\d+$/.test(t)) return +t;
  if (!/^(\d+[smhdw])+$/i.test(t)) return null;
  let s = 0; for (const m of t.matchAll(/(\d+)([smhdw])/gi)) s += +m[1] * TTLU[m[2].toLowerCase()]; return s;
}
function zoneTokens(text) { // returns logical entries: {tokens, startsWithSpace, line}
  const ents = []; let cur = null, depth = 0;
  text.split(/\r?\n/).forEach((raw, ln) => {
    let i = 0; const toks = []; const lead = /^\s/.test(raw);
    while (i < raw.length) {
      const c = raw[i];
      if (c === ';') break;
      if (/\s/.test(c)) { i++; continue; }
      if (c === '(') { depth++; i++; continue; }
      if (c === ')') { depth--; i++; continue; }
      if (c === '"') { let j = i + 1, s = ''; while (j < raw.length && raw[j] !== '"') { if (raw[j] === '\\' && j + 1 < raw.length) { s += raw[j] + raw[j + 1]; j += 2; } else s += raw[j++]; } if (j >= raw.length) throw new Error('Unterminated quote on line ' + (ln + 1)); toks.push({ q: true, v: s }); i = j + 1; continue; }
      let j = i; while (j < raw.length && !/[\s;()"]/.test(raw[j])) j++;
      toks.push({ q: false, v: raw.slice(i, j) }); i = j;
    }
    if (cur) { cur.tokens.push(...toks); if (depth <= 0) { ents.push(cur); cur = null; depth = 0; } }
    else if (toks.length || depth > 0) {
      const e = { tokens: toks, lead, line: ln + 1 };
      if (depth > 0) cur = e; else if (toks.length) ents.push(e);
    }
  });
  if (cur) throw new Error('Unclosed ( starting on line ' + cur.line);
  return ents;
}
const TYPES = new Set('A AAAA AFSDB APL CAA CDNSKEY CDS CERT CNAME DHCID DLV DNAME DNSKEY DS HINFO HIP IPSECKEY KEY KX LOC MX NAPTR NS NSEC NSEC3 NSEC3PARAM OPENPGPKEY PTR RP RRSIG SIG SMIMEA SOA SPF SRV SSHFP SVCB HTTPS TA TLSA TXT URI ZONEMD'.split(' '));
function parseZone(text, origin0) {
  let origin = origin0 ? origin0.replace(/\.?$/, '.') : '', defTtl = null, prevName = null, lastTtl = null, lastClass = 'IN';
  const recs = [], notes = [];
  const abs = (n) => (n === '@' ? origin : n.endsWith('.') ? n : origin ? (n + '.' + origin) : n);
  for (const e of zoneTokens(text)) {
    const t = e.tokens, f = t[0].v;
    if (!t[0].q && f.startsWith('$')) {
      const d = f.toUpperCase();
      if (d === '$ORIGIN') { if (!t[1]) throw new Error('$ORIGIN needs a name (line ' + e.line + ')'); origin = t[1].v.endsWith('.') ? t[1].v : abs(t[1].v); }
      else if (d === '$TTL') { const s = t[1] && ttlSecs(t[1].v); if (s === null || s === undefined) throw new Error('Bad $TTL on line ' + e.line); defTtl = s; }
      else notes.push(`${f} on line ${e.line} is not processed`);
      continue;
    }
    let k = 0, name;
    if (e.lead) { if (prevName === null) throw new Error('Line ' + e.line + ': record without an owner name and no previous record'); name = prevName; }
    else { name = abs(f); k = 1; }
    let ttl = null, cls = null;
    for (let n = 0; n < 2 && t[k] && !t[k].q; n++) {
      const v = t[k].v;
      if (/^(IN|CH|HS|CS)$/i.test(v) && cls === null) { cls = v.toUpperCase(); k++; }
      else if (ttl === null && ttlSecs(v) !== null && !TYPES.has(v.toUpperCase())) { ttl = ttlSecs(v); k++; }
      else break;
    }
    if (!t[k]) throw new Error('Line ' + e.line + ': missing record type');
    const type = t[k].v.toUpperCase();
    if (!/^(TYPE\d+|[A-Z0-9-]+)$/.test(type) || (!TYPES.has(type) && !/^TYPE\d+$/.test(type))) throw new Error(`Line ${e.line}: unknown record type "${t[k].v}"`);
    k++;
    let rdata = t.slice(k).map((x) => (x.q ? '"' + x.v + '"' : x.v));
    const nameFields = { CNAME: [0], NS: [0], PTR: [0], DNAME: [0], MX: [1], SRV: [3], SOA: [0, 1], RP: [0, 1], AFSDB: [1], KX: [1] }[type];
    if (nameFields) rdata = rdata.map((x, i) => (nameFields.includes(i) ? abs(x) : x));
    let usedTtl = ttl !== null ? ttl : (lastTtl !== null && cls === null && ttl === null && false ? lastTtl : defTtl);
    if (usedTtl === null) { usedTtl = type === 'SOA' ? null : lastTtl; }
    if (cls === null) cls = lastClass; lastClass = cls;
    if (ttl !== null) lastTtl = ttl;
    prevName = name;
    recs.push({ name, ttl: usedTtl, class: cls, type, rdata: rdata.join(' '), line: e.line, ttlExplicit: ttl !== null });
  }
  return { recs, notes, origin };
}
T.push({
  id: 'dns-zone-file-parser', cat: NET, title: 'DNS Zone File Parser (BIND Format to Record Table)',
  desc: 'Parse a BIND zone file: applies $ORIGIN and $TTL, handles multi-line parentheses, @ and blank owners, and lists every record with its full name.',
  inputs: 1, labels: ['Zone file'], opts: [{ id: 'origin', label: 'Origin if the file has no $ORIGIN (example.com.)', type: 'text', def: '' }, { id: 'json', label: 'Output JSON', type: 'checkbox', def: false }],
  sample: '$ORIGIN example.com.\n$TTL 1h\n@ IN SOA ns1 hostmaster (\n   2024010101 ; serial\n   7200 3600 1209600 300 )\n  IN NS ns1\n  IN NS ns2.example.net.\n  IN MX 10 mail\nns1 IN A 192.0.2.53\nmail 300 IN A 192.0.2.25\nwww IN CNAME @\n@ IN TXT "v=spf1 mx -all"\n',
  run([inp], o) {
    const { recs, notes, origin } = parseZone(inp, o.origin);
    if (!recs.length) throw new Error('No records found.');
    const warn = [...notes];
    if (!recs.some((r) => r.type === 'SOA')) warn.push('No SOA record found (a full zone needs one).');
    const by = {}; recs.forEach((r) => (by[r.name] = by[r.name] || []).push(r));
    for (const [n, rs] of Object.entries(by)) if (rs.some((r) => r.type === 'CNAME') && rs.length > 1) warn.push(`Review: ${n} has a CNAME and other records (not allowed by RFC 1034, except DNSSEC types).`);
    if (recs.some((r) => r.ttl === null)) warn.push('Some records have no TTL (no $TTL and no earlier TTL). They show "-".');
    if (o.json) return JSON.stringify({ origin, records: recs.map(({ ttlExplicit, ...r }) => r), warnings: warn }, null, 2);
    const w = (k) => Math.max(...recs.map((r) => String(r[k] ?? '-').length));
    const nw = w('name'), tw = w('ttl'), cw = w('class'), yw = w('type');
    return [`Origin: ${origin || '(none)'}   Records: ${recs.length}`, '', ...recs.map((r) => `${r.name.padEnd(nw)}  ${String(r.ttl ?? '-').padStart(tw)}  ${r.class.padEnd(cw)}  ${r.type.padEnd(yw)}  ${r.rdata}`), ...(warn.length ? ['', 'Notes:', ...warn.map((x) => '- ' + x)] : [])].join('\n');
  },
});

/* ---------- 4. RDAP JSON parser ---------- */
const vc = (e, key) => { const a = e.vcardArray && e.vcardArray[1]; if (!Array.isArray(a)) return ''; const r = a.find((x) => x[0] === key); return r ? (Array.isArray(r[3]) ? r[3].filter(Boolean).join(' ') : String(r[3] ?? '')) : ''; };
function rdapEntities(es, ind = '  ') {
  const out = [];
  for (const e of es || []) {
    const bits = [vc(e, 'fn'), vc(e, 'org') && 'org ' + vc(e, 'org'), vc(e, 'email'), vc(e, 'tel')].filter(Boolean);
    out.push(`${ind}${(e.roles || ['entity']).join(', ')}: ${bits.join(' | ') || e.handle || '-'}${e.handle && bits.length ? ' [' + e.handle + ']' : ''}`);
    if (e.entities) out.push(...rdapEntities(e.entities, ind + '  '));
  }
  return out;
}
T.push({
  id: 'rdap-json-parser', cat: NET, title: 'RDAP JSON Response Reader (Domain, IP and ASN)',
  desc: 'Paste an RDAP JSON response (RFC 9083) for a domain, IP network or AS number and read the registrar, dates, status, name servers and contacts.',
  inputs: 1, labels: ['RDAP JSON'], opts: [{ id: 'asof', label: 'Today (YYYY-MM-DD, blank = your clock)', type: 'text', def: '' }],
  sample: '{"objectClassName":"domain","ldhName":"EXAMPLE.COM","status":["client transfer prohibited"],"events":[{"eventAction":"registration","eventDate":"1995-08-14T04:00:00Z"},{"eventAction":"expiration","eventDate":"2030-08-13T04:00:00Z"},{"eventAction":"last changed","eventDate":"2024-08-14T07:01:34Z"}],"nameservers":[{"ldhName":"A.IANA-SERVERS.NET"},{"ldhName":"B.IANA-SERVERS.NET"}],"secureDNS":{"delegationSigned":true},"entities":[{"roles":["registrar"],"handle":"376","vcardArray":["vcard",[["version",{},"text","4.0"],["fn",{},"text","Example Registrar, Inc."]]],"entities":[{"roles":["abuse"],"vcardArray":["vcard",[["fn",{},"text","Abuse"],["email",{},"text","abuse@registrar.example"]]]}]}]}',
  run([inp], o) {
    let j; try { j = JSON.parse(inp); } catch { throw new Error('This is not valid JSON.'); }
    if (j && j.rdapConformance === undefined && j.objectClassName === undefined && !j.ldhName && !j.startAddress) throw new Error('This does not look like an RDAP response (no objectClassName).');
    const now = o.asof ? new Date(o.asof + 'T00:00:00Z') : new Date();
    if (isNaN(now)) throw new Error('Today must be YYYY-MM-DD.');
    const out = [], cls = j.objectClassName || (j.ldhName ? 'domain' : j.startAddress ? 'ip network' : j.startAutnum !== undefined ? 'autnum' : 'unknown');
    out.push('Object: ' + cls);
    if (cls === 'domain') { out.push('Domain: ' + (j.ldhName || '-') + (j.unicodeName ? ' (' + j.unicodeName + ')' : '')); if (j.handle) out.push('Handle: ' + j.handle); }
    else if (cls.startsWith('ip')) out.push(`Range: ${j.startAddress} - ${j.endAddress}`, `Name: ${j.name || '-'}`, `Type: ${j.type || '-'}`, `IP version: ${j.ipVersion || '-'}`, `Country: ${j.country || '-'}`, ...((j.cidr0_cidrs || []).length ? ['CIDR: ' + j.cidr0_cidrs.map((c) => (c.v4prefix || c.v6prefix) + '/' + c.length).join(', ')] : []), ...(j.parentHandle ? ['Parent: ' + j.parentHandle] : []));
    else if (cls === 'autnum') out.push(`AS range: ${j.startAutnum}${j.endAutnum !== j.startAutnum ? ' - ' + j.endAutnum : ''}`, `Name: ${j.name || '-'}`, `Type: ${j.type || '-'}`, `Country: ${j.country || '-'}`);
    if (j.status) out.push('Status: ' + [].concat(j.status).join(', '));
    for (const e of j.events || []) {
      const d = new Date(e.eventDate); let extra = '';
      if (!isNaN(d) && /expir/i.test(e.eventAction)) { const dd = Math.floor((d - now) / 864e5); extra = dd < 0 ? `  (EXPIRED ${-dd} days ago)` : `  (${dd} days left)`; }
      out.push(`Event ${e.eventAction}: ${e.eventDate}${extra}`);
    }
    if (j.nameservers) out.push('Name servers: ' + j.nameservers.map((n) => (n.ldhName || '').toLowerCase()).join(', '));
    if (j.secureDNS) out.push('DNSSEC: ' + (j.secureDNS.delegationSigned ? 'delegation signed' : 'not signed'));
    const ents = rdapEntities(j.entities); if (ents.length) out.push('Entities:', ...ents);
    if (j.notices && j.notices.length) out.push('Notices: ' + j.notices.map((n) => n.title).filter(Boolean).join('; '));
    return out.join('\n');
  },
});

/* ---------- 5. Domain expiry tracker ---------- */
T.push({
  id: 'domain-expiry-tracker', cat: NET, title: 'Domain Expiry Date Tracker (From Your Own List)',
  desc: 'Paste domains with their expiry dates and get a table sorted by days left, with renewal warnings.',
  inputs: 1, labels: ['One per line: domain, expiry date (YYYY-MM-DD)'], opts: [{ id: 'warn', label: 'Warn when fewer days than', type: 'number', def: 60 }, { id: 'asof', label: 'Today (YYYY-MM-DD, blank = your clock)', type: 'text', def: '' }],
  sample: 'example.com, 2030-08-13\nold-shop.net 2024-01-05\nblog.example.org\t2026-12-01T00:00:00Z\nsoon.io, 2099-01-01',
  run([inp], o) {
    const now = o.asof ? new Date(o.asof + 'T00:00:00Z') : new Date(); if (isNaN(now)) throw new Error('Today must be YYYY-MM-DD.');
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()), rows = [];
    for (const l of lines(inp)) {
      const m = /^(\S+?)[\s,;]+(\d{4}-\d{2}-\d{2})(?:[T ][\d:.]+Z?)?$/.exec(l);
      if (!m) throw new Error('Cannot read: ' + l + ' (use "domain, YYYY-MM-DD")');
      const d = new Date(m[2] + 'T00:00:00Z'); if (isNaN(d) || d.toISOString().slice(0, 10) !== m[2]) throw new Error('Not a real date: ' + l);
      rows.push([m[1].toLowerCase(), m[2], Math.round((d - today) / 864e5)]);
    }
    if (!rows.length) throw new Error('Enter at least one domain and date.');
    rows.sort((a, b) => a[2] - b[2]);
    const w = Math.max(...rows.map((r) => r[0].length), 6), warn = +o.warn || 0;
    return ['Domain'.padEnd(w) + '  Expires      Days left  Status', ...rows.map(([n, d, k]) => `${n.padEnd(w)}  ${d}   ${String(k).padStart(9)}  ${k < 0 ? 'EXPIRED' : k < warn ? 'Renew soon' : 'OK'}`)].join('\n') + '\n\nDates are what you typed. Check them against the registrar, because renewals change them.';
  },
});

/* ---------- 6. BIMI record checker ---------- */
T.push({
  id: 'bimi-record-checker', cat: NET, title: 'BIMI Record Checker (default._bimi TXT)',
  desc: 'Check a BIMI TXT record for tag order, HTTPS links, SVG file type and optional evidence URL, and check your DMARC policy against BIMI needs.',
  inputs: 2, labels: ['BIMI TXT record', 'DMARC TXT record (optional)'], placeholder: ['v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/vmc.pem', 'v=DMARC1; p=reject; pct=100'],
  sample: 'v=BIMI1; l=https://example.com/brand/logo.svg; a=https://example.com/brand/vmc.pem', sample2: 'v=DMARC1; p=quarantine; pct=50; rua=mailto:d@example.com',
  run([b, d]) {
    const tags = (s) => s.replace(/^"|"$/g, '').split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf('='); return i < 0 ? [x, ''] : [x.slice(0, i).trim(), x.slice(i + 1).trim()]; });
    const t = tags(b.replace(/"\s*"/g, '')), g = (k) => (t.find((x) => x[0] === k) || [])[1];
    if (!t.length) throw new Error('Paste the BIMI TXT record value.');
    const out = [], ok = (s) => out.push('OK      ' + s), bad = (s) => out.push('PROBLEM ' + s), rev = (s) => out.push('REVIEW  ' + s);
    if (t[0][0] === 'v' && t[0][1] === 'BIMI1') ok('v=BIMI1 is the first tag.'); else bad('The first tag must be exactly v=BIMI1 (case matters, receivers do not repair it).');
    const l = g('l'), a = g('a');
    if (l === undefined) bad('Missing l= (the logo URL).');
    else if (l === '') rev('l= is empty: this is a declination, the domain opts out of BIMI.');
    else { if (!/^https:\/\//i.test(l)) bad('l= must be an https:// URL.'); else ok('l= uses https.'); if (!/\.svgz?([?#]|$)/i.test(l)) rev('l= does not end in .svg. Only SVG (or SVGZ) is accepted. The file itself is not checked here.'); else ok('l= points to an SVG file name (content not checked: BIMI needs the SVG Tiny PS profile).'); }
    if (a === undefined) rev('No a= tag. Without an evidence document (VMC or CMC) some mailbox providers will not show the logo.');
    else if (a === '') rev('a= is empty: no evidence document is disclosed.');
    else if (!/^https:\/\/[^/]+\./i.test(a)) bad('a= must be an https:// URL with a fully qualified host name.'); else ok('a= uses https.');
    const av = g('avp'); if (av !== undefined && !/^(brand|personal)$/.test(av)) rev('avp= should be brand or personal; other values are ignored.');
    const known = new Set(['v', 'l', 'a', 'lps', 'avp']); const unk = t.filter((x) => !known.has(x[0])).map((x) => x[0]); if (unk.length) rev('Unknown tags are ignored by receivers: ' + unk.join(', '));
    out.push('');
    if (d && d.trim()) {
      const dt = tags(d), dg = (k) => (dt.find((x) => x[0] === k) || [])[1];
      if (dg('v') !== 'DMARC1') bad('The second box is not a DMARC record (v=DMARC1).');
      else {
        const p = dg('p'), sp = dg('sp'), pct = dg('pct') === undefined ? 100 : +dg('pct');
        if (p === 'reject') ok('DMARC p=reject.'); else if (p === 'quarantine') ok('DMARC p=quarantine.'); else bad('DMARC p=' + p + ': BIMI needs quarantine or reject.');
        if (sp === 'none') bad('DMARC sp=none: BIMI is skipped for subdomain senders.');
        if (p === 'quarantine' && pct < 100) bad('Quarantine with pct=' + pct + ': the draft requires pct=100 for quarantine.');
        else if (pct < 100) rev('pct=' + pct + ' is below 100.');
      }
    } else rev('No DMARC record given. BIMI needs DMARC with p=quarantine (pct=100) or p=reject on the From domain and the organizational domain.');
    return out.join('\n') + '\n\nBased on the BIMI Internet-Draft (draft-brand-indicators-for-message-identification, draft-14, not a final standard). Mailbox providers add their own rules. Nothing was fetched.';
  },
});

/* ---------- 7. Swagger 2 to OpenAPI 3 ---------- */
function s2toS3(sw) {
  if (!sw || typeof sw !== 'object' || !String(sw.swagger || '').startsWith('2')) throw new Error('This is not a Swagger 2.0 document (missing "swagger": "2.0").');
  const o = { openapi: '3.0.3', info: sw.info || { title: 'API', version: '1.0.0' } };
  const fixRefs = (x) => {
    if (Array.isArray(x)) return x.map(fixRefs);
    if (!x || typeof x !== 'object') return x;
    const r = {};
    for (const [k, v] of Object.entries(x)) {
      if (k === '$ref' && typeof v === 'string') r[k] = v.replace(/^#\/definitions\//, '#/components/schemas/').replace(/^#\/parameters\//, '#/components/parameters/').replace(/^#\/responses\//, '#/components/responses/');
      else if (k === 'x-nullable') r.nullable = v;
      else if (k === 'discriminator' && typeof v === 'string') r.discriminator = { propertyName: v };
      else r[k] = fixRefs(v);
    }
    if (r.type === 'file') { r.type = 'string'; r.format = 'binary'; }
    return r;
  };
  if (sw.host || sw.basePath || sw.schemes) {
    const sch = sw.schemes && sw.schemes.length ? sw.schemes : (sw.host ? ['https'] : []);
    o.servers = sch.length ? sch.map((s) => ({ url: `${s}://${sw.host || ''}${sw.basePath || ''}` })) : [{ url: sw.basePath || '/' }];
  }
  const gc = sw.consumes || ['application/json'], gp = sw.produces || ['application/json'];
  const schemaOf = (p) => { const s = {}; for (const k of ['type', 'format', 'items', 'enum', 'default', 'maximum', 'minimum', 'exclusiveMaximum', 'exclusiveMinimum', 'maxLength', 'minLength', 'pattern', 'maxItems', 'minItems', 'uniqueItems', 'multipleOf']) if (p[k] !== undefined) s[k] = p[k]; if (s.type === 'file') { s.type = 'string'; s.format = 'binary'; } return fixRefs(s); };
  const convParam = (p) => {
    if (p.$ref) return fixRefs(p);
    const q = { name: p.name, in: p.in }; if (p.description) q.description = p.description; if (p.required !== undefined) q.required = p.required;
    if (p.allowEmptyValue !== undefined) q.allowEmptyValue = p.allowEmptyValue;
    q.schema = p.schema ? fixRefs(p.schema) : schemaOf(p);
    if (p.collectionFormat && p.type === 'array') {
      const m = { csv: ['form', false], ssv: ['spaceDelimited', false], pipes: ['pipeDelimited', false], multi: ['form', true], tsv: null }[p.collectionFormat];
      if (p.in === 'path' || p.in === 'header') { if (p.collectionFormat !== 'csv') q['x-collectionFormat'] = p.collectionFormat; } else if (m) { if (m[0] !== 'form') q.style = m[0]; if (m[1]) q.explode = true; if (!m[1] && m[0] === 'form') q.explode = false; } else q['x-collectionFormat'] = 'tsv';
    }
    for (const k of Object.keys(p)) if (k.startsWith('x-')) q[k] = p[k];
    return q;
  };
  const body = (params, consumes) => {
    const b = params.find((p) => p.in === 'body'), forms = params.filter((p) => p.in === 'formData');
    if (b) { const rb = { content: {} }; if (b.description) rb.description = b.description; if (b.required) rb.required = true; for (const mt of consumes) rb.content[mt] = { schema: fixRefs(b.schema || {}) }; return rb; }
    if (forms.length) {
      const props = {}, req = [];
      for (const f of forms) { props[f.name] = { ...schemaOf(f), ...(f.description ? { description: f.description } : {}) }; if (f.required) req.push(f.name); }
      const sc = { type: 'object', properties: props }; if (req.length) sc.required = req;
      const mt = consumes.filter((c) => /form/.test(c)); const types = mt.length ? mt : [forms.some((f) => f.type === 'file') ? 'multipart/form-data' : 'application/x-www-form-urlencoded'];
      const rb = { content: {} }; for (const t of types) rb.content[t] = { schema: sc }; return rb;
    }
    return null;
  };
  const resp = (r, produces) => {
    if (r.$ref) return fixRefs(r);
    const x = { description: r.description ?? '' };
    if (r.schema) { x.content = {}; for (const mt of produces) x.content[mt] = { schema: fixRefs(r.schema) }; if (r.examples) for (const mt of Object.keys(r.examples)) { x.content[mt] = x.content[mt] || { schema: fixRefs(r.schema) }; x.content[mt].example = r.examples[mt]; } }
    if (r.headers) { x.headers = {}; for (const [k, h] of Object.entries(r.headers)) x.headers[k] = { ...(h.description ? { description: h.description } : {}), schema: schemaOf(h) }; }
    return x;
  };
  o.paths = {};
  for (const [path, item] of Object.entries(sw.paths || {})) {
    const pi = {}, shared = item.parameters || [];
    for (const [k, v] of Object.entries(item)) {
      if (k === 'parameters') continue;
      if (!/^(get|put|post|delete|options|head|patch)$/.test(k)) { pi[k] = fixRefs(v); continue; }
      const op = { ...v }, all = [...shared, ...(v.parameters || [])];
      const consumes = v.consumes || gc, produces = v.produces || gp;
      delete op.consumes; delete op.produces; delete op.parameters; delete op.schemes;
      const nonBody = all.filter((p) => !p.$ref && p.in !== 'body' && p.in !== 'formData').concat(all.filter((p) => p.$ref));
      const resolved = all.map((p) => (p.$ref ? (sw.parameters || {})[p.$ref.replace('#/parameters/', '')] || p : p));
      const rb = body(resolved.filter((p) => p.in === 'body' || p.in === 'formData'), consumes);
      const keep = all.filter((p) => { const r = p.$ref ? (sw.parameters || {})[p.$ref.replace('#/parameters/', '')] : p; return !r || (r.in !== 'body' && r.in !== 'formData'); });
      void nonBody;
      if (keep.length) op.parameters = keep.map(convParam);
      if (rb) op.requestBody = rb;
      op.responses = {}; for (const [c, r] of Object.entries(v.responses || {})) op.responses[c] = c.startsWith('x-') ? r : resp(r, produces);
      pi[k] = fixRefs(op);
    }
    o.paths[path] = pi;
  }
  const comp = {};
  if (sw.definitions) comp.schemas = fixRefs(sw.definitions);
  const cp = {}, rbs = {};
  for (const [k, p] of Object.entries(sw.parameters || {})) { if (p.in === 'body') rbs[k] = body([p], gc); else if (p.in !== 'formData') cp[k] = convParam(p); }
  if (Object.keys(cp).length) comp.parameters = cp;
  if (Object.keys(rbs).length) comp.requestBodies = rbs;
  if (sw.responses) { comp.responses = {}; for (const [k, r] of Object.entries(sw.responses)) comp.responses[k] = resp(r, gp); }
  if (sw.securityDefinitions) {
    comp.securitySchemes = {};
    for (const [k, s] of Object.entries(sw.securityDefinitions)) {
      if (s.type === 'basic') comp.securitySchemes[k] = { type: 'http', scheme: 'basic', ...(s.description ? { description: s.description } : {}) };
      else if (s.type === 'oauth2') {
        const f = {}; if (s.authorizationUrl) f.authorizationUrl = s.authorizationUrl; if (s.tokenUrl) f.tokenUrl = s.tokenUrl; f.scopes = s.scopes || {};
        const name = { implicit: 'implicit', password: 'password', application: 'clientCredentials', accessCode: 'authorizationCode' }[s.flow];
        comp.securitySchemes[k] = { type: 'oauth2', flows: { [name || 'implicit']: f }, ...(s.description ? { description: s.description } : {}) };
      } else comp.securitySchemes[k] = s;
    }
  }
  if (Object.keys(comp).length) o.components = comp;
  for (const k of ['security', 'tags', 'externalDocs']) if (sw[k]) o[k] = sw[k];
  for (const k of Object.keys(sw)) if (k.startsWith('x-')) o[k] = sw[k];
  return o;
}
T.push({
  id: 'swagger2-to-openapi3', cat: 'API Converters', title: 'Swagger 2.0 to OpenAPI 3.0 Converter',
  desc: 'Convert a Swagger 2.0 JSON document to OpenAPI 3.0.3: servers, components, request bodies, responses and security schemes.',
  inputs: 1, labels: ['Swagger 2.0 JSON (convert YAML to JSON first)'], opts: [{ id: 'indent', label: 'Indent', type: 'number', def: 2 }],
  sample: '{"swagger":"2.0","info":{"title":"Pets","version":"1.0"},"host":"api.example.com","basePath":"/v1","schemes":["https"],"consumes":["application/json"],"produces":["application/json"],"paths":{"/pets":{"get":{"parameters":[{"name":"tags","in":"query","type":"array","items":{"type":"string"},"collectionFormat":"multi"}],"responses":{"200":{"description":"ok","schema":{"type":"array","items":{"$ref":"#/definitions/Pet"}}}}},"post":{"parameters":[{"name":"body","in":"body","required":true,"schema":{"$ref":"#/definitions/Pet"}}],"responses":{"201":{"description":"created"}},"security":[{"key":[]}]}}},"definitions":{"Pet":{"type":"object","required":["name"],"properties":{"name":{"type":"string"},"photo":{"type":"file"}}}},"securityDefinitions":{"key":{"type":"apiKey","in":"header","name":"X-Key"}}}',
  run([inp], o) { let j; try { j = JSON.parse(inp); } catch { throw new Error('This is not valid JSON. Convert YAML to JSON first.'); } return JSON.stringify(s2toS3(j), null, Math.min(8, Math.max(0, +o.indent || 0))); },
});

/* ---------- 8. OAuth authorization URL builder ---------- */
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
T.push({
  id: 'oauth-authorization-url-builder', cat: NET, title: 'OAuth 2.0 Authorization URL Builder',
  desc: 'Build an OAuth 2.0 / OpenID Connect authorization request URL with scopes, state, nonce and an optional PKCE S256 challenge.',
  inputs: 1, labels: ['Extra parameters (one key=value per line, optional)'], placeholder: ['prompt=consent\naccess_type=offline'],
  opts: [
    { id: 'endpoint', label: 'Authorization endpoint (https)', type: 'text', def: 'https://auth.example.com/oauth2/authorize' },
    { id: 'client_id', label: 'client_id', type: 'text', def: 'my-client-id' },
    { id: 'redirect_uri', label: 'redirect_uri', type: 'text', def: 'https://app.example.com/callback' },
    { id: 'response_type', label: 'response_type', type: 'select', choices: ['code', 'token', 'id_token', 'code id_token', 'id_token token'], def: 'code' },
    { id: 'scope', label: 'Scopes (space or comma separated)', type: 'text', def: 'openid profile email' },
    { id: 'state', label: 'state (blank = random)', type: 'text', def: 'xyz123' },
    { id: 'nonce', label: 'nonce (blank = none, "random" = random)', type: 'text', def: '' },
    { id: 'pkce', label: 'Add PKCE (S256, random verifier)', type: 'checkbox', def: true },
  ],
  sample: 'prompt=consent',
  async run([extra], o) {
    let u; try { u = new URL(o.endpoint); } catch { throw new Error('The endpoint is not a valid URL.'); }
    if (u.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) throw new Error('Use an https:// endpoint (http only for localhost).');
    if (!o.client_id) throw new Error('client_id is required.');
    const rnd = (n) => b64u(crypto.getRandomValues(new Uint8Array(n)));
    const p = u.searchParams, notes = [];
    p.set('response_type', o.response_type); p.set('client_id', o.client_id);
    if (o.redirect_uri) p.set('redirect_uri', o.redirect_uri);
    const sc = String(o.scope || '').split(/[\s,]+/).filter(Boolean); if (sc.length) p.set('scope', sc.join(' '));
    const st = o.state || rnd(16); p.set('state', st); if (!o.state) notes.push('state (random): ' + st);
    if (/id_token/.test(o.response_type) && !sc.includes('openid')) notes.push('Review: ID tokens need the "openid" scope.');
    if (o.nonce) { const n = o.nonce === 'random' ? rnd(16) : o.nonce; p.set('nonce', n); if (o.nonce === 'random') notes.push('nonce (random): ' + n); }
    else if (/id_token/.test(o.response_type)) notes.push('Review: implicit and hybrid flows with id_token normally need a nonce.');
    if (o.pkce) {
      if (o.response_type !== 'code') notes.push('PKCE ignored: it only applies to response_type=code.');
      else { const v = rnd(32), ch = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))); p.set('code_challenge', ch); p.set('code_challenge_method', 'S256'); notes.push('code_verifier (keep it, send it at the token step): ' + v); }
    }
    for (const l of lines(extra)) { const i = l.indexOf('='); if (i < 1) throw new Error('Extra parameter needs key=value: ' + l); p.set(l.slice(0, i), l.slice(i + 1)); }
    return [u.toString(), '', 'Parameters:', ...[...p].map(([k, v]) => `  ${k} = ${v}`), ...(notes.length ? ['', ...notes] : [])].join('\n');
  },
});

/* ---------- 9. Cookie header parser ---------- */
T.push({
  id: 'cookie-header-parser', cat: NET, title: 'Cookie and Set-Cookie Header Parser (Name, Value, Attributes)',
  desc: 'Split a Cookie request header or Set-Cookie response headers into name, value (decoded) and attributes, as a table or JSON.',
  inputs: 1, labels: ['Cookie: and/or Set-Cookie: header lines'], opts: [{ id: 'json', label: 'Output JSON', type: 'checkbox', def: false }],
  sample: 'Cookie: sid=abc123; theme=dark; q=a%20b%26c\nSet-Cookie: sid=abc123; Path=/; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Secure; HttpOnly; SameSite=Lax\nSet-Cookie: lang=nl; Max-Age=3600; Domain=example.com',
  run([inp], o) {
    const items = [];
    const dec = (v) => { try { return decodeURIComponent(v); } catch { return v; } };
    for (const l of inp.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
      const m = /^(set-cookie|cookie)\s*:\s*(.*)$/i.exec(l);
      if (m && m[1].toLowerCase() === 'cookie') { for (const part of m[2].split(/;\s*/).filter(Boolean)) { const i = part.indexOf('='); items.push({ kind: 'Cookie', name: i < 0 ? '' : part.slice(0, i).trim(), value: dec(i < 0 ? part : part.slice(i + 1)) }); } continue; }
      const body = m ? m[2] : l, parts = body.split(/;\s*/), f = parts.shift(), i = f.indexOf('=');
      if (i < 0) throw new Error('No name=value in: ' + l);
      const c = { kind: 'Set-Cookie', name: f.slice(0, i).trim(), value: dec(f.slice(i + 1)), attributes: {} };
      for (const a of parts) { const j = a.indexOf('='), k = (j < 0 ? a : a.slice(0, j)).trim(), v = j < 0 ? true : a.slice(j + 1).trim(); if (k) c.attributes[k.toLowerCase()] = v; }
      const ex = c.attributes.expires; if (typeof ex === 'string') { const d = new Date(ex); c.attributes.expiresISO = isNaN(d) ? 'unparseable date' : d.toISOString(); }
      items.push(c);
    }
    if (!items.length) throw new Error('Paste a Cookie or Set-Cookie header.');
    if (o.json) return JSON.stringify(items, null, 2);
    return items.map((c) => `${c.kind}  ${c.name} = ${c.value}` + (c.attributes ? '\n' + Object.entries(c.attributes).map(([k, v]) => `    ${k}${v === true ? '' : ' = ' + v}`).join('\n') : '')).join('\n') + '\n\nValues are percent-decoded where valid. For security checks use the Cookie Flag Analyzer.';
  },
});

/* ---------- 10. JSON to JS object literal ---------- */
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
T.push({
  id: 'json-to-js-object-literal', cat: 'JSON', title: 'JSON to JavaScript Object Literal Converter',
  desc: 'Turn JSON into a JavaScript object literal: unquoted keys, your choice of quotes, trailing commas and an optional const declaration.',
  inputs: 1, labels: ['JSON'], opts: [
    { id: 'quote', label: 'String quotes', type: 'select', choices: ['single', 'double'], def: 'single' },
    { id: 'indent', label: 'Indent', type: 'number', def: 2 },
    { id: 'trailing', label: 'Trailing commas', type: 'checkbox', def: false },
    { id: 'decl', label: 'Variable name (blank = bare literal)', type: 'text', def: 'data' },
  ],
  sample: '{"name":"Ada","first-name":"A","tags":["x","it\'s"],"nested":{"a":1,"b":null},"__proto__":1,"empty":{},"list":[]}',
  run([inp], o) {
    let j; try { j = JSON.parse(inp); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
    const q = o.quote === 'double' ? '"' : "'", ind = Math.min(8, Math.max(0, +o.indent || 0));
    const str = (s) => q + s.replace(/[\\\u0000-\u001f\u2028\u2029'"]/g, (c) => (c === q ? '\\' + c : c === '\\' ? '\\\\' : (c === "'" || c === '"') ? c : { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' }[c] || '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))) + q;
    const key = (k) => (k === '__proto__' ? '[' + str(k) + ']' : IDENT.test(k) ? k : str(k));
    const go = (v, d) => {
      if (v === null || typeof v !== 'object') return typeof v === 'string' ? str(v) : String(v);
      const pad = ' '.repeat(ind * (d + 1)), end = ' '.repeat(ind * d);
      const items = Array.isArray(v) ? v.map((x) => go(x, d + 1)) : Object.entries(v).map(([k, x]) => key(k) + ': ' + go(x, d + 1));
      if (!items.length) return Array.isArray(v) ? '[]' : '{}';
      const [a, b] = Array.isArray(v) ? ['[', ']'] : ['{', '}'];
      return ind ? a + '\n' + items.map((x) => pad + x).join(',\n') + (o.trailing ? ',' : '') + '\n' + end + b : a + items.join(', ') + b;
    };
    const lit = go(j, 0);
    return o.decl ? (IDENT.test(o.decl) ? `const ${o.decl} = ${lit};` : (() => { throw new Error('The variable name is not a valid identifier.'); })()) : lit;
  },
});

/* ---------- 11. Source map stack trace decoder ---------- */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decodeMappings(m) {
  const lines = []; let src = 0, ol = 0, oc = 0, nm = 0;
  for (const ln of m.split(';')) {
    let gc = 0; const segs = [];
    for (const s of ln.split(',')) {
      if (!s) continue;
      const v = []; let shift = 0, val = 0;
      for (const ch of s) {
        const d = B64.indexOf(ch); if (d < 0) throw new Error('Invalid base64 VLQ in mappings.');
        val += (d & 31) << shift;
        if (d & 32) shift += 5; else { v.push(val & 1 ? -(val >> 1) : val >> 1); val = 0; shift = 0; }
      }
      gc += v[0];
      if (v.length >= 4) { src += v[1]; ol += v[2]; oc += v[3]; const seg = [gc, src, ol, oc]; if (v.length >= 5) { nm += v[4]; seg.push(nm); } segs.push(seg); } else segs.push([gc]);
    }
    lines.push(segs);
  }
  return lines;
}
function lookup(map, ml, line, col) { // line 0-based, col 0-based
  const segs = ml[line]; if (!segs) return null;
  let lo = 0, hi = segs.length - 1, best = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (segs[mid][0] <= col) { best = mid; lo = mid + 1; } else hi = mid - 1; }
  if (best < 0 || segs[best].length < 4) return null;
  const s = segs[best];
  return { source: map.sources[s[1]], line: s[2], col: s[3], name: s.length > 4 ? map.names[s[4]] : null, srcIdx: s[1] };
}
T.push({
  id: 'source-map-stack-trace-decoder', cat: DEV, title: 'Source Map Stack Trace Decoder (Minified Position Lookup)',
  desc: 'Paste a minified stack trace or line:column positions plus the .map file and get original file, line, column, name and source lines.',
  inputs: 2, labels: ['Stack trace or line:column positions', 'Source map (.map JSON)'], opts: [{ id: 'ctx', label: 'Show source line', type: 'checkbox', def: true }],
  sample: 'TypeError: x is not a function\n    at foo (https://cdn.example.com/app.min.js:1:20)\n    at https://cdn.example.com/app.min.js:1:42',
  sample2: JSON.stringify({ version: 3, file: 'app.min.js', sources: ['src/util.js', 'src/main.js'], sourcesContent: ['export function foo(a) {\n  return a.b();\n}\n', 'import { foo } from "./util";\nfoo(window);\n'], names: ['foo', 'a'], mappings: 'AAAA,SAASA,EAAIC;ACAA,YAAgB' }),
  run([st, mj], o) {
    let map; try { map = JSON.parse(mj); } catch { throw new Error('The source map is not valid JSON.'); }
    if (map.sections) throw new Error('Index source maps (with "sections") are not supported.');
    if (map.version !== 3 || typeof map.mappings !== 'string' || !Array.isArray(map.sources)) throw new Error('This is not a version 3 source map.');
    map.names = map.names || []; const root = map.sourceRoot ? map.sourceRoot.replace(/\/?$/, '/') : '';
    const ml = decodeMappings(map.mappings), out = []; let hit = 0, miss = 0;
    const re = /(?:\(|@|\s|^)((?:[a-z][a-z0-9+.-]*:\/\/|\/|[A-Za-z]:\\)?[^\s()@]*?):(\d+):(\d+)\)?\s*$|^\s*(\d+):(\d+)\s*$/i;
    for (const raw of st.split(/\r?\n/)) {
      const m = re.exec(raw);
      if (!m) { out.push(raw); continue; }
      const L = +(m[2] ?? m[4]), C = +(m[3] ?? m[5]);
      const r = L >= 1 && C >= 1 ? lookup(map, ml, L - 1, C - 1) : null;
      if (!r) { miss++; out.push(raw + '   [no mapping]'); continue; }
      hit++;
      const orig = `${root}${r.source}:${r.line + 1}:${r.col + 1}`;
      out.push(raw.replace(/\s*$/, '') + `\n      -> ${orig}${r.name ? ' (' + r.name + ')' : ''}`);
      const sc = map.sourcesContent && map.sourcesContent[r.srcIdx];
      if (o.ctx && sc) { const t = sc.split(/\r?\n/)[r.line]; if (t !== undefined) out.push('         ' + t.trim()); }
    }
    return out.join('\n') + `\n\n${hit} position(s) mapped, ${miss} without mapping. Line and column are 1-based as in browser stack traces. Every frame is looked up in this one map regardless of file name.`;
  },
});

/* ---------- 12. Syntax highlighter to HTML ---------- */
const KW = {
  js: 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await static get set null true false undefined interface type enum implements public private protected readonly as from',
  python: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield None True False self',
  c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while class public private protected new delete this namespace using template typename virtual override final bool true false null nullptr string fn let mut pub impl trait use mod match loop func package interface go defer chan map range var type',
  sql: 'select from where and or not insert into values update set delete create table alter drop index join left right inner outer full on group by order having limit offset as distinct union all null is in like between exists case when then else end primary key foreign references default unique count sum avg min max asc desc',
  bash: 'if then else elif fi for while do done case esac function in return exit export local echo cd set unset source alias read test',
  css: '', json: 'true false null', html: '',
};
function tokenize(src, lang) {
  const t = []; const kw = new Set((KW[lang] || '').split(' ').filter(Boolean)); let i = 0;
  const push = (k, s) => t.push([k, s]);
  const hash = lang === 'python' || lang === 'bash', slash = lang === 'js' || lang === 'c' || lang === 'css', dash = lang === 'sql';
  while (i < src.length) {
    const c = src[i], r = src.slice(i);
    if (lang === 'html') {
      let m;
      if ((m = /^<!--[\s\S]*?(-->|$)/.exec(r))) { push('c', m[0]); i += m[0].length; continue; }
      if ((m = /^<\/?[A-Za-z][^\s>/]*/.exec(r))) { push('k', m[0]); i += m[0].length; while (i < src.length && src[i] !== '>') { const a = /^(\s+)|^([^\s=>"'/]+)|^("[^"]*"?|'[^']*'?)|^(.)/.exec(src.slice(i)); push(a[3] ? 's' : a[2] ? 'a' : 'p', a[0]); i += a[0].length; } if (src[i] === '>') { push('k', '>'); i++; } continue; }
      push('p', c); i++; continue;
    }
    let m;
    if ((slash && (m = /^\/\/[^\n]*/.exec(r))) || (hash && (m = /^#[^\n]*/.exec(r))) || (dash && (m = /^--[^\n]*/.exec(r))) || ((slash || dash) && (m = /^\/\*[\s\S]*?(\*\/|$)/.exec(r)))) { push('c', m[0]); i += m[0].length; continue; }
    if (lang === 'python' && (m = /^("""[\s\S]*?("""|$)|'''[\s\S]*?('''|$))/.exec(r))) { push('s', m[0]); i += m[0].length; continue; }
    if (c === '"' || (c === "'" && lang !== 'css') || (c === '`' && lang === 'js') || c === "'") {
      let j = i + 1; while (j < src.length && src[j] !== c && !(src[j] === '\n' && c !== '`')) { if (src[j] === '\\' && lang !== 'sql') j++; j++; }
      const s = src.slice(i, Math.min(j + 1, src.length));
      push(lang === 'json' && /^\s*:/.test(src.slice(j + 1)) ? 'a' : 's', s); i += s.length; continue;
    }
    if ((m = /^(0x[0-9a-f]+|\d+(\.\d+)?([eE][+-]?\d+)?)/i.exec(r)) && !/[A-Za-z_$]/.test(src[i - 1] || '')) { push('n', m[0]); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_$][\w$-]*/.exec(r))) {
      const w = m[0]; const isKw = lang === 'sql' ? kw.has(w.toLowerCase()) : kw.has(w);
      push(isKw ? 'k' : lang === 'css' && /^\s*:/.test(src.slice(i + w.length)) ? 'a' : /^\s*\(/.test(src.slice(i + w.length)) ? 'f' : 'p', w); i += w.length; continue;
    }
    if (lang === 'css' && (m = /^[.#@][\w-]+/.exec(r))) { push('k', m[0]); i += m[0].length; continue; }
    push('p', c); i++;
  }
  return t;
}
const HL = {
  light: { bg: '#ffffff', fg: '#1f2328', c: '#59636e', s: '#0a3069', n: '#0550ae', k: '#cf222e', a: '#0550ae', f: '#6639ba', ln: '#6e7781' },
  dark: { bg: '#0d1117', fg: '#e6edf3', c: '#9198a1', s: '#a5d6ff', n: '#79c0ff', k: '#ff7b72', a: '#79c0ff', f: '#d2a8ff', ln: '#8b949e' },
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
T.push({
  id: 'code-syntax-highlighter-html', cat: DEV, title: 'Code Syntax Highlighter (HTML With Inline Styles)',
  desc: 'Colour a code snippet and copy it as self-contained HTML with inline styles, in a light or dark theme, for blogs, emails and docs.',
  inputs: 1, labels: ['Code'], opts: [
    { id: 'lang', label: 'Language', type: 'select', choices: ['js', 'json', 'python', 'c', 'css', 'html', 'sql', 'bash'], def: 'js' },
    { id: 'theme', label: 'Theme', type: 'select', choices: ['light', 'dark'], def: 'light' },
    { id: 'nums', label: 'Line numbers', type: 'checkbox', def: false },
  ],
  sample: "// add two numbers\nfunction add(a, b) {\n  return a + b; /* sum */\n}\nconst msg = `total: ${add(1, 2)}`;\nconsole.log('done', 42, true);",
  run([inp], o) {
    const th = HL[o.theme] || HL.light, toks = tokenize(inp, o.lang);
    const span = (k, s) => (k === 'p' ? esc(s) : `<span style="color:${th[k]}${k === 'c' ? ';font-style:italic' : ''}">${esc(s)}</span>`);
    let body = toks.map(([k, s]) => span(k, s)).join('');
    if (o.nums) { const n = inp.split('\n').length, w = String(n).length; body = body.split('\n').map((l, i) => `<span style="color:${th.ln};user-select:none">${String(i + 1).padStart(w)}  </span>${l}`).join('\n'); }
    const pre = `<pre style="background:${th.bg};color:${th.fg};padding:1em;border-radius:6px;overflow:auto;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;margin:0"><code>${body}</code></pre>`;
    return { text: pre, html: '<!doctype html><meta charset="utf-8"><body style="margin:0;padding:12px;background:#888">' + pre };
  },
});

/* ---------- 13. Big-O cheatsheet ---------- */
const BIGO = [
  ['Sort', 'Bubble sort', 'n', 'n^2', 'n^2', '1', 'stable'],
  ['Sort', 'Insertion sort', 'n', 'n^2', 'n^2', '1', 'stable'],
  ['Sort', 'Selection sort', 'n^2', 'n^2', 'n^2', '1', 'not stable'],
  ['Sort', 'Merge sort', 'n log n', 'n log n', 'n log n', 'n', 'stable'],
  ['Sort', 'Quicksort', 'n log n', 'n log n', 'n^2', 'log n', 'not stable'],
  ['Sort', 'Heapsort', 'n log n', 'n log n', 'n log n', '1', 'not stable'],
  ['Sort', 'Counting sort', 'n + k', 'n + k', 'n + k', 'k', 'stable'],
  ['Sort', 'Radix sort (LSD)', 'd(n + k)', 'd(n + k)', 'd(n + k)', 'n + k', 'stable'],
  ['Sort', 'Timsort', 'n', 'n log n', 'n log n', 'n', 'stable'],
  ['Search', 'Linear search', '1', 'n', 'n', '1', ''],
  ['Search', 'Binary search (sorted array)', '1', 'log n', 'log n', '1', ''],
  ['Structure: access / search / insert / delete', 'Array', '1 / n / n / n', '', '', 'n', 'insert and delete shift elements'],
  ['Structure: access / search / insert / delete', 'Singly linked list', 'n / n / 1 / 1', '', '', 'n', 'insert and delete at a known node'],
  ['Structure: access / search / insert / delete', 'Hash table (average)', '- / 1 / 1 / 1', '', '', 'n', 'worst case of each is n'],
  ['Structure: access / search / insert / delete', 'Binary search tree (average)', 'log n / log n / log n / log n', '', '', 'n', 'worst case n when unbalanced'],
  ['Structure: access / search / insert / delete', 'Balanced tree (AVL, red-black)', 'log n / log n / log n / log n', '', '', 'n', 'worst case equals average'],
  ['Structure: access / search / insert / delete', 'Binary heap', 'peek 1 / n / log n / log n', '', '', 'n', 'build heap from n items is n'],
  ['Graph', 'BFS / DFS', 'V + E', '', '', 'V', ''],
  ['Graph', 'Dijkstra (binary heap)', '(V + E) log V', '', '', 'V', 'no negative edges'],
  ['Graph', 'Bellman-Ford', 'V * E', '', '', 'V', 'handles negative edges'],
  ['Graph', 'Floyd-Warshall', 'V^3', '', '', 'V^2', 'all pairs'],
  ['Graph', 'Topological sort', 'V + E', '', '', 'V', ''],
  ['Graph', 'Kruskal MST', 'E log E', '', '', 'V', ''],
  ['Graph', 'Prim MST (binary heap)', 'E log V', '', '', 'V', ''],
];
const GROW = [['1', (n) => 1], ['log n', (n) => Math.log2(n)], ['n', (n) => n], ['n log n', (n) => n * Math.log2(n)], ['n^2', (n) => n * n], ['n^3', (n) => n ** 3], ['2^n', (n) => 2 ** n], ['n!', (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }]];
T.push({
  id: 'big-o-cheatsheet', cat: DEV, title: 'Big-O Complexity Cheatsheet (Sorting, Structures, Graphs)',
  desc: 'Time and space complexity of common sorting, search, data structure and graph algorithms, plus how many steps each growth class needs for your n.',
  inputs: 1, labels: ['Filter (word to look for, blank = all)'], opts: [{ id: 'n', label: 'Input size n for the growth table', type: 'number', def: 1000 }], sample: '',
  run([f], o) {
    const q = f.trim().toLowerCase(), rows = BIGO.filter((r) => !q || r.join(' ').toLowerCase().includes(q)), out = [];
    let sec = '';
    for (const r of rows) {
      if (r[0] !== sec) { sec = r[0]; out.push('', sec.toUpperCase()); if (sec === 'Sort') out.push('  name | best | average | worst | extra space | stability'); else if (sec === 'Search') out.push('  name | best | average | worst | extra space'); else if (sec.startsWith('Structure')) out.push('  name | time (average unless noted) | space | note'); else out.push('  name | time | space | note'); }
      out.push('  ' + (sec === 'Sort' || sec === 'Search' ? [r[1], r[2], r[3], r[4], r[5], r[6]].filter((x, i) => sec === 'Sort' || i < 5) : sec.startsWith('Structure') || sec === 'Graph' ? [r[1], r[2], r[5], r[6]] : [r[1], r[2], r[3], r[4], r[5]]).join(' | '));
    }
    if (!rows.length) out.push('No row matches "' + f + '".');
    const n = Math.min(+o.n || 1000, 1e6); if (n < 1) throw new Error('n must be at least 1.');
    out.push('', `GROWTH FOR n = ${n}`);
    for (const [name, fn] of GROW) { const v = name === 'n!' && n > 170 ? Infinity : fn(Math.min(n, name === '2^n' ? 1100 : n)); out.push(`  O(${name}): ` + (!isFinite(v) || (name === '2^n' && n > 1000) ? 'more than 10^300 steps' : v >= 1e15 ? v.toExponential(2) : Math.round(v).toLocaleString('en-US'))); }
    out.push('', 'n = input size, k = value range, d = digits, V = vertices, E = edges. Standard textbook values (not re-checked against a source in this build). Real speed also depends on constants and memory access.');
    return out.join('\n').trim();
  },
});

/* ---------- 14-15. Comment stripper and LOC counter (shared scanner) ---------- */
const LANGS = {
  js: { exts: ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'java', 'c', 'h', 'cpp', 'cc', 'hpp', 'cs', 'go', 'rs', 'swift', 'kt', 'php', 'scala', 'dart'], line: ['//'], block: [['/*', '*/']], q: ['"', "'", '`'], name: 'C-style' },
  css: { exts: ['css', 'scss', 'less'], line: [], block: [['/*', '*/']], q: ['"', "'"], name: 'CSS' },
  python: { exts: ['py'], line: ['#'], block: [], q: ['"""', "'''", '"', "'"], name: 'Python' },
  shell: { exts: ['sh', 'bash', 'zsh', 'rb', 'yml', 'yaml', 'toml', 'pl'], line: ['#'], block: [], q: ['"', "'"], name: 'Shell/Ruby/YAML' },
  sql: { exts: ['sql'], line: ['--'], block: [['/*', '*/']], q: ["'", '"'], name: 'SQL' },
  html: { exts: ['html', 'htm', 'xml', 'svg', 'vue'], line: [], block: [['<!--', '-->']], q: [], name: 'HTML/XML' },
};
function scan(src, L) { // returns array of {s, e, kind:'c'|'code'} comment ranges
  const cm = []; let i = 0;
  const rest = (a) => src.startsWith(a, i);
  while (i < src.length) {
    let hit = false;
    for (const [a, b] of L.block) if (rest(a)) { let j = src.indexOf(b, i + a.length); j = j < 0 ? src.length : j + b.length; cm.push([i, j]); i = j; hit = true; break; }
    if (hit) continue;
    for (const a of L.line) if (rest(a) && !(a === '#' && L === LANGS.shell && (src[i - 1] && /[\w$]/.test(src[i - 1]) || src[i - 1] === '{' ) ) && !(a === '#' && i === 0 && src[1] === '!')) { let j = src.indexOf('\n', i); if (j < 0) j = src.length; cm.push([i, j]); i = j; hit = true; break; }
    if (hit) continue;
    for (const qq of L.q) if (rest(qq)) {
      let j = i + qq.length; const multi = qq.length === 3 || qq === '`';
      while (j < src.length && !src.startsWith(qq, j)) { if (src[j] === '\\') j++; else if (src[j] === '\n' && !multi && L !== LANGS.sql) break; j++; }
      i = Math.min(src.length, src.startsWith(qq, j) ? j + qq.length : j); hit = true; break;
    }
    if (!hit && L === LANGS.js && src[i] === '/' && src[i + 1] !== '/' && src[i + 1] !== '*') { // regex literal (heuristic: only after an operator or opening bracket)
      let k = i - 1; while (k >= 0 && /\s/.test(src[k])) k--;
      if (k < 0 || '=(,:;!&|?{}[+-*%<>~^'.includes(src[k]) || /(?:return|typeof)$/.test(src.slice(Math.max(0, k - 5), k + 1))) {
        let j = i + 1, cls = false; while (j < src.length && src[j] !== '\n' && (src[j] !== '/' || cls)) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
        if (src[j] === '/') { i = j + 1; hit = true; }
      }
    }
    if (!hit) i++;
  }
  return cm;
}
const keepLic = (t) => /^\/\*[!*]|@license|@preserve|^\/\/!/.test(t);
T.push({
  id: 'code-comment-stripper', cat: DEV, title: 'Code Comment Stripper (JS, CSS, Python, SQL, HTML, Shell)',
  desc: 'Remove line and block comments from code while leaving strings alone. Optionally keep license comments and drop the blank lines left behind.',
  inputs: 1, labels: ['Code'], opts: [
    { id: 'lang', label: 'Language', type: 'select', choices: Object.keys(LANGS), def: 'js' },
    { id: 'lic', label: 'Keep license comments (/*! and @license)', type: 'checkbox', def: true },
    { id: 'blank', label: 'Remove lines left empty', type: 'checkbox', def: true },
  ],
  sample: '/*! (c) Example */\n// helper\nconst url = "http://example.com/*not a comment*/"; // trailing\n/* block\n   comment */\nfunction f() { return 1; }\n',
  run([inp], o) {
    const L = LANGS[o.lang]; if (!L) throw new Error('Unknown language.');
    const cm = scan(inp, L).filter(([s, e]) => !(o.lic && keepLic(inp.slice(s, e))));
    const res = []; let off = 0;
    for (const ln of inp.split('\n')) {
      const s0 = off, e0 = off + ln.length; off = e0 + 1;
      let kept = '', p = s0, cut = false;
      for (const [a, b] of cm) { if (b <= s0 || a >= e0) continue; kept += inp.slice(p, Math.max(a, s0)); p = Math.min(b, e0); cut = true; }
      kept += inp.slice(p, e0);
      if (cut) { kept = kept.replace(/[ \t]+$/, ''); if (o.blank && !kept.trim()) continue; }
      res.push(kept);
    }
    return res.join('\n');
  },
});
T.push({
  id: 'lines-of-code-counter', cat: DEV, title: 'Lines of Code Counter (Code, Comment and Blank, Per Language)',
  desc: 'Count code, comment and blank lines. Paste one file, or several files each started by a line like "=== path/file.py" to get a per-language table.',
  inputs: 1, labels: ['Code (separate files with "=== filename" lines)'], opts: [{ id: 'lang', label: 'Language for text without a "===" line', type: 'select', choices: Object.keys(LANGS), def: 'js' }],
  sample: '=== app.js\n// entry\nconst a = 1;\n\n/* multi\n   line */\nconsole.log(a);\n=== style.css\n/* theme */\nbody { margin: 0; }\n=== run.py\n#!/usr/bin/env python\n# go\nprint("hi # not a comment")\n',
  run([inp], o) {
    const files = []; let cur = { name: '(pasted)', lang: o.lang, text: [] };
    for (const l of inp.split(/\r?\n/)) {
      const m = /^===\s*(.+?)\s*$/.exec(l);
      if (m) { if (cur.text.length || files.length) files.push(cur); const ext = (m[1].split('.').pop() || '').toLowerCase(); const lg = Object.entries(LANGS).find(([, v]) => v.exts.includes(ext)); cur = { name: m[1], lang: lg ? lg[0] : o.lang, unk: !lg, text: [] }; }
      else cur.text.push(l);
    }
    files.push(cur);
    const tot = {}, rows = [];
    for (const f of files) {
      const src = f.text.join('\n'), L = LANGS[f.lang], cm = scan(src, L); let off = 0, code = 0, com = 0, blank = 0;
      for (const ln of f.text) {
        const s = off, e = off + ln.length; off = e + 1;
        if (!ln.trim()) { blank++; continue; }
        let covered = 0; for (const [a, b] of cm) { const x = Math.max(a, s), y = Math.min(b, e); if (y > x) covered += src.slice(x, y).replace(/\s/g, '').length; }
        const nonws = ln.replace(/\s/g, '').length;
        if (covered >= nonws) com++; else code++;
      }
      const t = tot[L.name] = tot[L.name] || { files: 0, code: 0, com: 0, blank: 0 }; t.files++; t.code += code; t.com += com; t.blank += blank;
      rows.push(`${f.name}${f.unk ? ' (unknown extension, used ' + L.name + ' rules)' : ''}: code ${code}, comment ${com}, blank ${blank}`);
    }
    const w = (n) => String(n).padStart(7);
    const sum = Object.entries(tot), all = sum.reduce((a, [, t]) => ({ files: a.files + t.files, code: a.code + t.code, com: a.com + t.com, blank: a.blank + t.blank }), { files: 0, code: 0, com: 0, blank: 0 });
    return ['Language'.padEnd(18) + 'files   blank comment    code', ...sum.map(([n, t]) => n.padEnd(18) + w(t.files) + w(t.blank) + w(t.com) + w(t.code)), 'Total'.padEnd(18) + w(all.files) + w(all.blank) + w(all.com) + w(all.code), '', ...(files.length > 1 ? rows : []), 'A line with both code and a trailing comment counts as code. Strings spanning lines are counted as code.'].join('\n');
  },
});

/* ---------- 16. Cyclomatic complexity ---------- */
function jsMask(src) { // blank out comments, strings, template text (keep ${} content), regex literals (heuristic)
  let out = '', i = 0; const stack = [];
  const prevSig = () => { for (let k = out.length - 1; k >= 0; k--) if (!/\s/.test(out[k])) return out[k]; return ''; };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { const j = src.indexOf('\n', i); const e = j < 0 ? src.length : j; out += ' '.repeat(e - i); i = e; continue; }
    if (c === '/' && n === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? src.length : j + 2; out += src.slice(i, j).replace(/[^\n]/g, ' '); i = j; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < src.length && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; } out += ' '.repeat(Math.min(j + 1, src.length) - i); i = Math.min(j + 1, src.length); continue; }
    if (c === '`') { let j = i + 1; out += ' '; while (j < src.length && src[j] !== '`') { if (src[j] === '\\') { out += '  '; j += 2; continue; } if (src[j] === '$' && src[j + 1] === '{') { stack.push(1); out += '  '; j += 2; let d = 1; while (j < src.length && d) { if (src[j] === '{') d++; if (src[j] === '}') d--; if (d) { out += src[j]; j++; } } out += ' '; j++; continue; } out += src[j] === '\n' ? '\n' : ' '; j++; } out += ' '; i = j + 1; continue; }
    if (c === '/' && /[=(,:;!&|?{}[\n]|^$|return|typeof/.test(prevSig() || '')) { let j = i + 1, cls = false; while (j < src.length && src[j] !== '\n' && (src[j] !== '/' || cls)) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; } if (src[j] === '/') { j++; while (/[a-z]/.test(src[j] || '')) j++; out += ' '.repeat(j - i); i = j; continue; } }
    out += c; i++;
  }
  return out;
}
const CTRL = /\b(if|for|while|case|catch)\b|&&|\|\||\?\?(?!=)|(?<![?.])\?(?![.?:])(?!\s*[,)\]}])/g;
T.push({
  id: 'cyclomatic-complexity-estimator', cat: DEV, title: 'Cyclomatic Complexity Estimator for JavaScript Functions',
  desc: 'Estimate McCabe cyclomatic complexity per function: 1 plus branches (if, loops, case, catch, &&, ||, ??, ternary). Flags functions above your limit.',
  inputs: 1, labels: ['JavaScript'], opts: [{ id: 'limit', label: 'Review when complexity is above', type: 'number', def: 10 }],
  sample: 'function grade(score, bonus) {\n  if (score > 90 || bonus) {\n    return "A";\n  } else if (score > 80 && !bonus) {\n    return "B";\n  }\n  for (let i = 0; i < 3; i++) {\n    if (i === score) return "?";\n  }\n  return score > 50 ? "C" : "F";\n}\nconst add = (a, b) => a + b;\nclass K { run(x) { switch (x) { case 1: return 1; case 2: return 2; default: return 0; } } }\n',
  run([src], o) {
    const m = jsMask(src), lim = +o.limit || 10, fns = [];
    const FN = /\bfunction\b\s*\*?\s*([\w$]*)\s*\(|([\w$]+)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*\{|(?:\(([^()]*)\)|([\w$]+))\s*=>/g;
    const NOT = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'function']);
    let mt;
    const lineOf = (p) => src.slice(0, p).split('\n').length;
    while ((mt = FN.exec(m))) {
      let name, bs, be, kind = 'function';
      if (mt[0].startsWith('function')) { name = mt[1] || '(anonymous)'; let k = FN.lastIndex, d = 1; while (k < m.length && d) { if (m[k] === '(') d++; else if (m[k] === ')') d--; k++; } while (/\s/.test(m[k])) k++; if (m[k] !== '{') continue; bs = k; }
      else if (mt[2] !== undefined) { if (NOT.has(mt[2])) continue; name = mt[2]; bs = mt.index + mt[0].length - 1; kind = 'method'; }
      else { name = '(arrow)'; const nm = /([\w$.]+)\s*[=:]\s*(?:async\s*)?$/.exec(m.slice(Math.max(0, mt.index - 60), mt.index)); if (nm) name = nm[1]; kind = 'arrow'; let k = FN.lastIndex; while (/\s/.test(m[k])) k++; if (m[k] === '{') bs = k; else { bs = k; let d = 0, e = k; while (e < m.length) { const ch = m[e]; if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) { if (!d) break; d--; } else if ((ch === ',' || ch === ';') && !d) break; e++; } be = e; } }
      if (be === undefined) { let d = 0, e = bs; for (; e < m.length; e++) { if (m[e] === '{') d++; else if (m[e] === '}') { d--; if (!d) break; } } be = e + 1; }
      fns.push({ name, kind, s: bs, e: be, line: lineOf(mt.index) });
      if (kind === 'method' || kind === 'function') FN.lastIndex = Math.max(FN.lastIndex, bs + 1) && FN.lastIndex;
    }
    if (!fns.length) throw new Error('No functions found.');
    fns.forEach((f) => { f.cx = 1; });
    const owner = (p) => { let best = null; for (const f of fns) if (p >= f.s && p < f.e && (!best || f.s >= best.s)) best = f; return best; };
    CTRL.lastIndex = 0; let c;
    while ((c = CTRL.exec(m))) { const f = owner(c.index); if (f) f.cx++; }
    const rows = fns.sort((a, b) => a.line - b.line).map((f) => `line ${String(f.line).padEnd(4)} ${f.cx > lim ? 'REVIEW ' : '       '}${String(f.cx).padStart(3)}  ${f.name} (${f.kind})`);
    return ['Complexity per function (nested functions are counted on their own):', ...rows, '', `Limit for review: ${lim}. Heuristic: regex literals, unusual syntax and optional chaining (?.) are not counted. Use a real linter for gating builds.`].join('\n');
  },
});

/* ---------- 17. String literal escaper ---------- */
const NAMED = { '\n': 'n', '\r': 'r', '\t': 't', '\b': 'b', '\f': 'f' };
function escLang(s, lang, q, ascii) {
  const cp = (ch) => ch.codePointAt(0);
  const u = (c, braces) => (braces ? '\\u{' + c.toString(16) + '}' : c > 0xffff ? (lang === 'python' || lang === 'go' || lang === 'c' ? '\\U' + c.toString(16).padStart(8, '0') : (() => { const x = c - 0x10000; return '\\u' + (0xd800 + (x >> 10)).toString(16) + '\\u' + (0xdc00 + (x & 0x3ff)).toString(16); })()) : '\\u' + c.toString(16).padStart(4, '0'));
  if (lang === 'sql') return "'" + s.replace(/'/g, "''") + "'";
  if (lang === 'bash') return "'" + s.replace(/'/g, "'\\''") + "'";
  let r = '';
  for (const ch of s) {
    const c = cp(ch);
    if (ch === '\\') r += '\\\\';
    else if (ch === q) r += '\\' + ch;
    else if (lang === 'js' && q === '`' && (ch === '$')) r += '\\$';
    else if (NAMED[ch] && !(lang === 'json' && false)) r += '\\' + NAMED[ch];
    else if (ch === '\v' && lang !== 'json' && lang !== 'java' && lang !== 'rust' && lang !== 'csharp' ) r += lang === 'js' || lang === 'python' || lang === 'c' || lang === 'go' ? '\\v' : '\\u000b';
    else if ((c < 0x20 || c === 0x7f) && lang === 'c') r += '\\' + c.toString(8).padStart(3, '0');
    else if (c < 0x20 || c === 0x7f) r += lang === 'java' || lang === 'json' || lang === 'csharp' ? '\\u' + c.toString(16).padStart(4, '0') : lang === 'rust' ? '\\u{' + c.toString(16) + '}' : '\\x' + c.toString(16).padStart(2, '0');
    else if (c === 0x2028 || c === 0x2029) r += lang === 'rust' ? u(c, true) : u(c);
    else if (ascii && c > 126) r += lang === 'rust' ? u(c, true) : lang === 'js' && c > 0xffff ? u(c, true) : u(c);
    else r += ch;
  }
  if (lang === 'php' && q === '"') r = r.replace(/\$/g, '\\$').replace(/\\x([0-9a-f]{2})/g, '\\x$1');
  return q + r + q;
}
T.push({
  id: 'string-literal-escaper', cat: DEV, title: 'String Literal Escaper (Java, C, C#, Python, Go, Rust, JSON, SQL, Bash)',
  desc: 'Turn raw text into a quoted string literal for Java, C, C#, Python, Go, Rust, JavaScript, JSON, PHP, SQL or Bash, or undo common backslash escapes.',
  inputs: 1, labels: ['Text'], opts: [
    { id: 'lang', label: 'Language', type: 'select', choices: ['java', 'c', 'csharp', 'python', 'go', 'rust', 'js', 'json', 'php', 'sql', 'bash'], def: 'java' },
    { id: 'mode', label: 'Direction', type: 'select', choices: ['escape', 'unescape'], def: 'escape' },
    { id: 'ascii', label: 'Escape non-ASCII characters', type: 'checkbox', def: false },
    { id: 'single', label: 'Single quotes (JS, Python, PHP)', type: 'checkbox', def: false },
  ],
  sample: 'He said "hi"\nPath: C:\\temp\\new\ttab\té',
  run([inp], o) {
    const lang = o.lang;
    if (o.mode === 'unescape') {
      let t = inp.trim();
      if (lang === 'sql') return t.replace(/^'|'$/g, '').replace(/''/g, "'");
      if (lang === 'bash') return t.replace(/^'|'$/g, '').replace(/'\\''/g, "'");
      if (/^(["'`]).*\1$/s.test(t) && t.length > 1) t = t.slice(1, -1);
      return t.replace(/\\(u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8})|x([0-9a-fA-F]{2})|[0-7]{1,3}|[\s\S])/g, (m, a, b, c, d, e) => {
        if (b || c || d || e) { const n = parseInt(b || c || d || e, 16); if (n > 0x10ffff) throw new Error('Code point out of range: ' + m); return String.fromCodePoint(n); }
        const ch = m[1];
        if (/[0-7]/.test(ch)) return lang === 'json' ? m : String.fromCharCode(parseInt(m.slice(1), 8));
        return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', a: '\x07', '0': '\0' }[ch] ?? ch;
      }).replace(/\\u([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})/g, (m, h, l) => String.fromCharCode(parseInt(h, 16), parseInt(l, 16)));
    }
    const q = o.single && (lang === 'js' || lang === 'python' || lang === 'php') ? "'" : '"';
    return escLang(inp, lang, q, o.ascii);
  },
});

export default T;

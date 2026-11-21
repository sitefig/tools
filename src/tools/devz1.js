// devz1.js: extra developer tools (SQL/JSON converters, DNS, .htaccess, LLM prompt helpers, BIP-39, misc). Zero dependencies, client-side only.
//
// Slice reviewed: devstools.app slugchunk_00. Built here (id <- slug):
//   sql-to-json, sql-to-typescript, json-to-graphql-schema (converters/json-to-graphql), json-to-env, markdown-table-to-csv,
//   csv-column-extractor, hex-to-base64, base64-to-pdf, json-size-analyzer, mac-address-generator, dns-record-generator,
//   text-obfuscator, htaccess-to-nginx, bip39-generator, tailwind-class-sorter, css-media-query-builder, css-grid-area-builder,
//   prompt-linter (ai-agent-prompt-optimizer), mcp-message-validator (mcp-inspector), embedding-similarity,
//   prompt-format-converter, sampling-curve-visualizer, system-prompt-formatter.
//
// Skipped (function already covered by an existing tool, or impossible offline):
//   quoted-printable-encoder -> quoted-printable | json-patch-generator -> json-patch-generator | json-flatten-unflatten -> same id
//   morse-code-audio-converter -> morse-code-audio | base64url-encoder, subtitle-srt-vtt-converter, sql-slugifier -> same ids
//   apache-conf/docker-compose/toml/protobuf-formatter -> same ids | totp-authenticator-simulator -> totp-generator
//   ed25519-key-generator, x509-csr-decoder, abi-encoder-decoder, ethereum-keccak256-hasher, solana-address-validator -> same ids
//   mongodb/clickhouse/elasticsearch/react-hook-form/gitlab-ci/k8s-ingress/ollama/wrangler/gh-matrix/tailwind-v4/shadcn -> same ids
//   svg-to-webp -> svg-to-png (has a WebP format option) | docker-to-compose -> docker-run-to-compose | har-to-k6, json-to-graphql-query,
//   avro-to-json-schema, openapi-to-typescript-fetch, postman-to-curl, svg-to-react-native, json-schema-to-zod, zod-to-json-schema -> same ids
//   aspect-ratio-resizer -> aspect-ratio-calculator | subresource-integrity-generator, nginx-rate-limit-calculator -> same ids
//   csp-evaluator -> csp-analyzer | cron-next-runs-visualizer, crontab-descriptor, cron-parser -> cron-explainer | rag-chunking-visualizer -> same id
//   tiktoken-visualizer, claude-token-counter, deepseek-token-counter, llm-token-counter: need the real BPE/SentencePiece vocabularies
//     (hundreds of thousands of merges; not reproducible offline) -> SKIPPED; llm-token-estimator gives an honest estimate instead.
//   prompt-diff -> text-diff | css-to-tailwind / tailwind-to-css -> tailwind-converter | css-keyframes-generator -> css-animation-generator
//   fluid-typography -> css-clamp-generator | tsv-to-json -> csv-to-json (any delimiter) | ndjson-to-json -> json-lines-tools
//   ipv6-subnet-calculator -> ip-subnet-calculator | semver-calculator, slug-to-title, text-chunk-splitter, jsonl-dataset-validator -> same ids
//   openai-function-schema -> llm-tool-definition-builder | prompt-template-formatter -> prompt-template-filler | mock/format/validate basics
//   (json-formatter, base64, uuid, hash, jwt, qr, regex, diff, markdown, css generators, pdf, ...) -> existing tools of the same function.

const T = [];
const enc = new TextEncoder();
const sel = (id, label, choices, def) => ({ id, label, type: 'select', def: def ?? choices[0], choices });
const num = (id, label, def) => ({ id, label, type: 'number', def });
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const chk = (id, label, def) => ({ id, label, type: 'checkbox', def });
const need = (s, m) => { if (!String(s).trim()) throw new Error(m); };
const parseJ = (s) => { try { return JSON.parse(s); } catch (e) { throw new Error('Invalid JSON: ' + e.message); } };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
const pascal = (s) => { const r = words(s).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(''); return /^\d/.test(r) ? '_' + r : r || 'Field'; };
const camel = (s) => { const p = pascal(s); return p[0].toLowerCase() + p.slice(1); };
const singular = (s) => (/ies$/i.test(s) ? s.replace(/ies$/i, 'y') : /(ss|us)$/i.test(s) ? s : s.replace(/s$/i, ''));
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
const b64e = (u, url) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  s = btoa(s);
  return url ? s.replace(/\+/g, '-').replace(/\//g, '_') : s;
};
const b64d = (s) => {
  s = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (/[^A-Za-z0-9+/]/.test(s) || s.length % 4 === 1) throw new Error('Invalid Base64 input');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const unhex = (s) => {
  s = s.trim().replace(/^0x/i, '').replace(/[\s:,-]|0x/gi, '');
  if (!/^[0-9a-f]*$/i.test(s) || s.length % 2) throw new Error('Invalid hex (need an even number of hex digits 0-9 a-f)');
  return Uint8Array.from(s.match(/../g) || [], (h) => parseInt(h, 16));
};
// RFC 4180-ish CSV parser (quotes, doubled quotes, embedded newlines)
const parseCSV = (s, d = ',') => {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === '') q = true;
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; }
    else f += c;
  }
  if (q) throw new Error('Unterminated quoted field');
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
};
const csvCell = (v, d = ',') => (/["\r\n]/.test(v) || v.includes(d) || /^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

// ---------------- SQL helpers (shared by sql-to-json and sql-to-typescript)
const stripSqlComments = (s) => {
  let o = '', i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') { let j = i + 1; while (j < s.length && !(s[j] === c && s[j + 1] !== c)) j += s[j] === c ? 2 : 1; o += s.slice(i, j + 1); i = j + 1; }
    else if (c === '-' && s[i + 1] === '-') { while (i < s.length && s[i] !== '\n') i++; }
    else if (c === '/' && s[i + 1] === '*') { const j = s.indexOf('*/', i + 2); i = j < 0 ? s.length : j + 2; o += ' '; }
    else { o += c; i++; }
  }
  return o;
};
// split on a separator at paren depth 0, outside quotes
const splitTop = (s, sep = ',') => {
  const out = []; let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') { let j = i + 1; while (j < s.length && !(s[j] === c && s[j + 1] !== c && !(c === "'" && s[j - 1] === '\\'))) j += s[j] === c ? 2 : 1; cur += s.slice(i, j + 1); i = j; continue; }
    if (c === '(') d++; else if (c === ')') d--;
    if (c === sep && d === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim() !== '' || out.length) out.push(cur);
  return out;
};
const unq = (s) => { s = s.trim(); const m = /^"(.*)"$|^`(.*)`$|^\[(.*)\]$/s.exec(s); return m ? (m[1] ?? m[2] ?? m[3]) : s; };
const lastIdent = (s) => unq(splitTop(s.trim(), '.').pop());
const matchParen = (s, open) => { let d = 0; for (let i = open; i < s.length; i++) { const c = s[i]; if (c === "'" || c === '"' || c === '`') { let j = i + 1; while (j < s.length && !(s[j] === c && s[j + 1] !== c)) j += s[j] === c ? 2 : 1; i = j; } else if (c === '(') d++; else if (c === ')' && --d === 0) return i; } return -1; };
const sqlStatements = (s) => splitTop(stripSqlComments(s), ';').map((x) => x.trim()).filter(Boolean);
const sqlValue = (t) => {
  t = t.trim();
  if (/^null$/i.test(t)) return null;
  if (/^true$/i.test(t)) return true;
  if (/^false$/i.test(t)) return false;
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) && Math.abs(Number(t)) <= Number.MAX_SAFE_INTEGER) return Number(t);
  const m = /^(?:[nN]|[eE])?'(.*)'$/s.exec(t);
  if (m) return m[1].replace(/''/g, "'").replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  return t; // expression / function call / hex literal: kept as raw text
};
const CONSTRAINT = /^(primary|foreign|unique|constraint|key|index|check|fulltext|spatial|exclude|like)\b/i;
const parseCreates = (sql) => {
  const tables = [];
  for (const st of sqlStatements(sql)) {
    const m = /^create\s+(?:(?:global\s+|local\s+)?(?:temp|temporary)\s+|unlogged\s+|virtual\s+)?table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)\s*\(/i.exec(st);
    if (!m) continue;
    const open = st.indexOf('(', m[0].length - 1), close = matchParen(st, open);
    if (close < 0) throw new Error('Unbalanced parentheses in CREATE TABLE ' + m[1]);
    const cols = [], pks = new Set();
    for (const def of splitTop(st.slice(open + 1, close)).map((x) => x.trim()).filter(Boolean)) {
      if (CONSTRAINT.test(def)) { const pk = /primary\s+key\s*\(([^)]*)\)/i.exec(def); if (pk) pk[1].split(',').forEach((c) => pks.add(unq(c.trim()))); continue; }
      const cm = /^("[^"]+"|`[^`]+`|\[[^\]]+\]|[^\s]+)\s*(.*)$/s.exec(def);
      if (!cm) continue;
      const rest = cm[2], tm = /^(.*?)(?=\s+(?:not\s+null|null|default|primary|references|unique|check|constraint|collate|generated|auto_increment|autoincrement|comment|identity)\b|$)/is.exec(rest);
      cols.push({ name: unq(cm[1]), type: (tm ? tm[1] : rest).trim().toLowerCase(), notNull: /\bnot\s+null\b/i.test(rest) || /\bprimary\s+key\b/i.test(rest), pk: /\bprimary\s+key\b/i.test(rest), hasDefault: /\bdefault\b|auto_?increment|\bserial\b|identity|generated/i.test(def) });
    }
    cols.forEach((c) => { if (pks.has(c.name)) { c.pk = true; c.notNull = true; } });
    tables.push({ name: lastIdent(m[1]), cols });
  }
  return tables;
};

// ---------------- Converters
const SQL_SAMPLE = `CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email VARCHAR(255),
  active BOOLEAN DEFAULT TRUE,
  balance NUMERIC(10,2),
  created_at TIMESTAMP
);
INSERT INTO users (id, name, email, active, balance) VALUES
  (1, 'Ada O''Neil', 'ada@example.com', TRUE, 12.50),
  (2, 'Linus', NULL, FALSE, 0);
INSERT INTO "users" VALUES (3, 'Grace', 'g@example.com', 1, 99, '2024-01-02 03:04:05');`;

T.push({
  id: 'sql-to-json', cat: 'SQL & Data', title: 'SQL INSERT to JSON', desc: 'Parse INSERT ... VALUES statements (multi-row, quoted strings, NULL, booleans, numbers) into JSON rows per table. Column names come from the INSERT or the CREATE TABLE in the same script. Subset: INSERT/CREATE TABLE only; expressions stay as raw text.',
  labels: ['SQL script'], sample: SQL_SAMPLE, opts: [sel('shape', 'Output', ['object per table', 'flat array of rows']), num('indent', 'Indent', 2)],
  run: ([sql], o) => {
    need(sql, 'Paste SQL with INSERT statements');
    const tables = parseCreates(sql), cols = Object.fromEntries(tables.map((t) => [t.name, t.cols.map((c) => c.name)]));
    const out = {}; let n = 0;
    for (const t of tables) out[t.name] = [];
    for (const st of sqlStatements(sql)) {
      const m = /^insert\s+(?:or\s+\w+\s+|ignore\s+)?(?:into\s+)?([^\s(]+)\s*(\([^)]*\))?\s*(?:values|value)\s*/i.exec(st);
      if (!m) continue;
      const tn = lastIdent(m[1]);
      const names = m[2] ? splitTop(m[2].slice(1, -1)).map((c) => unq(c.trim())) : cols[tn];
      const rest = st.slice(m[0].length).replace(/\s*on\s+(conflict|duplicate)\b[\s\S]*$/i, '');
      for (const tup of splitTop(rest)) {
        const t = tup.trim();
        if (!t) continue;
        if (t[0] !== '(' || t[t.length - 1] !== ')') throw new Error('Malformed VALUES tuple: ' + t.slice(0, 40));
        const vals = splitTop(t.slice(1, -1)).map(sqlValue), row = {};
        if (names && names.length !== vals.length) throw new Error(`Row for ${tn} has ${vals.length} values but ${names.length} columns`);
        vals.forEach((v, i) => { row[names ? names[i] : 'col' + (i + 1)] = v; });
        (out[tn] ||= []).push(row); n++;
      }
    }
    if (!n) throw new Error('No INSERT ... VALUES rows found');
    return JSON.stringify(o.shape === 'flat array of rows' ? Object.values(out).flat() : out, null, Number(o.indent) || 0);
  },
});

const TS_MAP = [[/^(tiny|small|medium)?int(eger)?\d*|^serial|^smallserial|^numeric|^decimal|^float|^real|^double|^money|^number/, 'number'], [/^bigint|^bigserial|^int8/, 'bigint'], [/^bool/, 'boolean'], [/^(timestamp|datetime|date|time)/, 'date'], [/^json/, 'unknown'], [/^(blob|bytea|binary|varbinary|longblob)/, 'Uint8Array']];
T.push({
  id: 'sql-to-typescript', cat: 'SQL & Data', title: 'SQL CREATE TABLE to TypeScript', desc: 'Turn CREATE TABLE statements (MySQL, PostgreSQL, SQLite flavours) into TypeScript interfaces: NOT NULL columns become required, nullable ones get "| null". Handles quoted identifiers, constraints and IF NOT EXISTS.',
  labels: ['SQL (CREATE TABLE)'], sample: SQL_SAMPLE,
  opts: [sel('bigint', 'BIGINT as', ['string', 'number', 'bigint']), sel('date', 'Dates as', ['string', 'Date']), sel('names', 'Property names', ['keep', 'camelCase']), chk('exp', 'export', true), chk('opt', 'Columns with DEFAULT are optional (?)', false)],
  run: ([sql], o) => {
    const tables = parseCreates(sql);
    if (!tables.length) throw new Error('No CREATE TABLE statement found');
    return tables.map((t) => {
      const body = t.cols.map((c) => {
        let ty = 'string';
        for (const [re, r] of TS_MAP) if (re.test(c.type)) { ty = r; break; }
        if (ty === 'bigint') ty = o.bigint; else if (ty === 'date') ty = o.date;
        if (/\[\]$|^_|^array/.test(c.type)) ty = ty + '[]';
        const nm = o.names === 'camelCase' ? camel(c.name) : /^[A-Za-z_$][\w$]*$/.test(c.name) ? c.name : JSON.stringify(c.name);
        return `  ${nm}${o.opt && c.hasDefault && !c.pk ? '?' : ''}: ${ty}${c.notNull ? '' : ' | null'};`;
      });
      return `${o.exp ? 'export ' : ''}interface ${pascal(singular(t.name))} {\n${body.join('\n')}\n}`;
    }).join('\n\n');
  },
});

T.push({
  id: 'json-to-graphql-schema', cat: 'Data Models', title: 'JSON to GraphQL Schema (SDL)', desc: 'Infer GraphQL type definitions from a JSON sample: nested objects become types, arrays become lists, keys missing or null in some array items become nullable, "id" becomes ID, integers vs floats are told apart.',
  labels: ['JSON sample'], sample: '{"id":"u1","name":"Ada","age":36,"score":9.5,"admin":false,"address":{"city":"London","zip":null},"posts":[{"id":1,"title":"Hello","tags":["a","b"]},{"id":2,"title":"Again"}]}',
  opts: [txt('root', 'Root type name', 'Root'), chk('input', 'Also emit input types', false)],
  run: ([s], o) => {
    const types = new Map();
    const reg = (name, objs) => {
      const fields = new Map(); let total = 0;
      for (const ob of objs) {
        total++;
        for (const [k, v] of Object.entries(ob)) { if (!fields.has(k)) fields.set(k, { vals: [], n: 0 }); const f = fields.get(k); f.vals.push(v); f.n++; }
      }
      const prev = types.get(name);
      const lines = [];
      for (const [k, f] of fields) {
        const fn = /^[A-Za-z_]\w*$/.test(k) ? k : camel(k);
        lines.push(`  ${fn}: ${infer(k, f.vals, f.n < total)}`);
      }
      types.set(name, prev ? prev + '\n' + lines.join('\n') : lines.join('\n'));
      return name;
    };
    const infer = (key, vals, optional) => {
      let nullable = optional || vals.some((v) => v === null);
      const vs = vals.filter((v) => v !== null);
      if (!vs.length) return 'String';
      let base;
      if (vs.every(Array.isArray)) {
        const items = vs.flat(); nullable ||= false;
        base = '[' + (items.length ? infer(singular(key) || key, items, false) : 'String!') + ']';
        return base + (nullable ? '' : '!');
      }
      if (vs.every(isObj)) base = reg(pascal(singular(key)), vs);
      else if (vs.every((v) => typeof v === 'boolean')) base = 'Boolean';
      else if (vs.every((v) => typeof v === 'number')) base = key.toLowerCase() === 'id' ? 'ID' : vs.every(Number.isInteger) ? 'Int' : 'Float';
      else base = key.toLowerCase() === 'id' ? 'ID' : 'String';
      return base + (nullable ? '' : '!');
    };
    const v = parseJ(s);
    const rootName = pascal(o.root || 'Root');
    reg(rootName, Array.isArray(v) ? v.filter(isObj) : [v]);
    if (!isObj(v) && !Array.isArray(v)) throw new Error('Top level must be an object or array of objects');
    const dedupe = (body) => { const seen = new Set(); return body.split('\n').filter((l) => { const k = l.split(':')[0]; if (seen.has(k)) return false; seen.add(k); return true; }).join('\n'); };
    const out = [...types].map(([n, b]) => `type ${n} {\n${dedupe(b)}\n}`);
    if (o.input) out.push(...[...types].map(([n, b]) => `input ${n}Input {\n${dedupe(b).replace(/: \[?([A-Z]\w*?)(!?\]?!?)$/gm, (m, t, r) => (types.has(t) ? `: ${m.includes('[') ? '[' : ''}${t}Input${r}` : m))}\n}`));
    return out.join('\n\n');
  },
});

T.push({
  id: 'json-to-env', cat: 'Converters+', title: 'JSON to .env', desc: 'Flatten JSON into KEY=VALUE lines: nested keys are joined with underscores and upper-cased (database.host -> DATABASE_HOST); arrays become indexed keys or one JSON/comma value. Values with spaces or special characters are quoted.',
  labels: ['JSON'], sample: '{"app":{"name":"My App","debug":true,"port":3000},"database":{"host":"localhost","pass":"p@ss word","replicas":["a","b"]},"empty":null}',
  opts: [txt('prefix', 'Prefix', ''), txt('sep', 'Separator', '_'), chk('upper', 'UPPER_CASE keys', true), sel('arrays', 'Arrays', ['indexed (KEY_0)', 'comma separated', 'JSON string'])],
  run: ([s], o) => {
    const v = parseJ(s);
    if (!isObj(v)) throw new Error('Top-level JSON must be an object');
    const out = [];
    const q = (x) => { x = String(x); return x === '' || /[\s#"'$`\\=]/.test(x) ? '"' + x.replace(/(["\\$`])/g, '\\$1').replace(/\n/g, '\\n') + '"' : x; };
    const key = (p) => { const k = p.join(o.sep ?? '_').replace(/[^A-Za-z0-9_]/g, '_'); return o.upper ? k.toUpperCase() : k; };
    const walk = (x, p) => {
      if (Array.isArray(x)) {
        if (o.arrays === 'indexed (KEY_0)') x.forEach((e, i) => walk(e, [...p, i]));
        else if (o.arrays === 'comma separated' && x.every((e) => e === null || typeof e !== 'object')) out.push(`${key(p)}=${q(x.join(','))}`);
        else out.push(`${key(p)}=${q(JSON.stringify(x))}`);
      } else if (isObj(x)) Object.entries(x).forEach(([k, e]) => walk(e, [...p, k]));
      else out.push(`${key(p)}=${x === null ? '' : q(x)}`);
    };
    walk(v, o.prefix ? [o.prefix] : []);
    return out.join('\n');
  },
});

T.push({
  id: 'markdown-table-to-csv', cat: 'Converters+', title: 'Markdown Table to CSV', desc: 'Extract GitHub-style Markdown tables (pipe tables, alignment row, escaped \\| pipes) to CSV, TSV or JSON. Handles several tables in one document.',
  labels: ['Markdown'], sample: '| Name | Role | Note |\n|:-----|:----:|-----:|\n| Ada | Dev | likes `code`, **bold** |\n| Linus | "Kernel" | a \\| pipe |\n\nSome text\n\n| A | B |\n|---|---|\n| 1 | 2 |',
  opts: [sel('table', 'Table', ['first', 'all']), sel('fmt', 'Output', ['CSV', 'TSV', 'JSON']), chk('strip', 'Strip emphasis / code / links', true)],
  run: ([md], o) => {
    const split = (l) => { l = l.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, ''); return l.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|')); };
    const clean = (c) => (o.strip ? c.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/(\*\*|__|\*|~~|`)/g, '').replace(/<br\s*\/?>/gi, '\n') : c);
    const L = md.split(/\r?\n/), tables = [];
    for (let i = 0; i < L.length - 1; i++) {
      if (!L[i].includes('|') || !/^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(L[i + 1]) || !L[i + 1].includes('-')) continue;
      const t = [split(L[i])]; i += 2;
      while (i < L.length && L[i].includes('|') && L[i].trim()) t.push(split(L[i++]));
      i--; tables.push(t.map((r) => r.map(clean)));
    }
    if (!tables.length) throw new Error('No Markdown table found (need a header row followed by a |---|---| row)');
    return (o.table === 'first' ? tables.slice(0, 1) : tables).map((t) => {
      if (o.fmt === 'JSON') return JSON.stringify(t.slice(1).map((r) => Object.fromEntries(t[0].map((h, i) => [h, r[i] ?? '']))), null, 2);
      const d = o.fmt === 'TSV' ? '\t' : ',';
      return t.map((r) => r.map((c) => csvCell(c, d)).join(d)).join('\n');
    }).join('\n\n');
  },
});

T.push({
  id: 'csv-column-extractor', cat: 'CSV', title: 'CSV Column Extractor', desc: 'Pick, reorder or drop CSV columns by header name or 1-based index (ranges like 2-4 work), optionally de-duplicate, and output CSV, one value per line or JSON.',
  labels: ['CSV'], sample: 'id,name,email,country\n1,Ada,ada@example.com,UK\n2,Linus,linus@example.com,FI\n3,Grace,grace@example.com,UK',
  opts: [txt('cols', 'Columns (names or numbers, comma separated)', 'email,country'), sel('mode', 'Mode', ['keep', 'drop']), sel('delim', 'Delimiter', [',', ';', '\\t', '|']), chk('header', 'First row is header', true), chk('uniq', 'Remove duplicate rows', false), sel('fmt', 'Output', ['CSV', 'one value per line', 'JSON'])],
  run: ([csv], o) => {
    const d = o.delim === '\\t' ? '\t' : o.delim, rows = parseCSV(csv, d);
    need(csv, 'Paste CSV'); if (!rows.length) throw new Error('No rows');
    const head = o.header ? rows[0] : rows[0].map((_, i) => String(i + 1)), body = o.header ? rows.slice(1) : rows;
    const idx = [];
    for (const raw of String(o.cols).split(',').map((x) => x.trim()).filter(Boolean)) {
      const r = /^(\d+)\s*-\s*(\d+)$/.exec(raw), by = head.indexOf(raw);
      if (by >= 0) idx.push(by);
      else if (r) for (let i = +r[1]; i <= +r[2]; i++) idx.push(i - 1);
      else if (/^\d+$/.test(raw)) idx.push(+raw - 1);
      else throw new Error('Unknown column: ' + raw);
    }
    if (idx.some((i) => i < 0 || i >= head.length)) throw new Error(`Column index out of range (1-${head.length})`);
    const use = o.mode === 'drop' ? head.map((_, i) => i).filter((i) => !idx.includes(i)) : idx;
    if (!use.length) throw new Error('No columns selected');
    let out = body.map((r) => use.map((i) => r[i] ?? ''));
    if (o.uniq) { const seen = new Set(); out = out.filter((r) => { const k = JSON.stringify(r); return seen.has(k) ? false : seen.add(k); }); }
    const h = use.map((i) => head[i]);
    if (o.fmt === 'JSON') return JSON.stringify(out.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))), null, 2);
    if (o.fmt === 'one value per line') return out.map((r) => r.join(' ')).join('\n');
    return [...(o.header ? [h] : []), ...out].map((r) => r.map((c) => csvCell(c, d)).join(d)).join('\n');
  },
});

// ---------------- Encoding
T.push({
  id: 'hex-to-base64', cat: 'Encoding+', title: 'Hex ⇄ Base64 Converter', desc: 'Convert raw bytes between hexadecimal and Base64 (or Base64URL) directly, without going through text. Accepts 0x prefixes, spaces and colons in hex.',
  labels: ['Input'], sample: 'deadbeef00ff10',
  opts: [sel('dir', 'Direction', ['hex → base64', 'base64 → hex']), chk('url', 'Base64URL alphabet', false), chk('pad', 'Keep = padding', true), chk('upper', 'Upper-case hex', false), sel('group', 'Hex grouping', ['none', 'space', 'colon'])],
  run: ([s], o) => {
    need(s, 'Enter a value');
    if (o.dir === 'hex → base64') { let b = b64e(unhex(s), o.url); if (!o.pad) b = b.replace(/=+$/, ''); return b; }
    let h = hex(b64d(s));
    if (o.upper) h = h.toUpperCase();
    return o.group === 'none' ? h : h.match(/../g).join(o.group === 'space' ? ' ' : ':');
  },
});

// minimal valid one-page PDF (sample)
const SAMPLE_PDF_B64 = 'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUi9TaXplIDQ+PgolJUVPRgo=';
T.push({
  id: 'base64-to-pdf', cat: 'PDF', title: 'Base64 to PDF', desc: 'Decode a Base64 string (or data:application/pdf;base64, URI) into a downloadable PDF file after checking for the %PDF header.',
  labels: ['Base64 / data URI'], sample: SAMPLE_PDF_B64, opts: [txt('name', 'File name', 'decoded.pdf')],
  run: ([s], o) => {
    need(s, 'Paste Base64 data');
    const u = b64d(s.trim().replace(/^data:[^,]*,/i, '').replace(/^"|"$/g, ''));
    if (String.fromCharCode(...u.subarray(0, 5)) !== '%PDF-') throw new Error('Decoded data is not a PDF (missing %PDF- header)');
    const tail = String.fromCharCode(...u.subarray(Math.max(0, u.length - 1024)));
    return { text: `Decoded ${u.length} bytes, PDF version ${String.fromCharCode(...u.subarray(5, 8))}${tail.includes('%%EOF') ? '' : '\nWarning: no %%EOF marker found (file may be truncated)'}`, blob: new Blob([u], { type: 'application/pdf' }), filename: (o.name || 'decoded.pdf').replace(/[^\w.\-]/g, '_') };
  },
});

T.push({
  id: 'text-obfuscator', cat: 'Text+', title: 'Text / Email Obfuscator', desc: 'Make text harder for scrapers and naive filters: HTML numeric entities, \\u escapes, "[at]/[dot]" email spelling, zero-width spaces, look-alike Cyrillic homoglyphs, or reversed text with a CSS direction trick. Obfuscation is not encryption.',
  labels: ['Text'], sample: 'contact@example.com',
  opts: [sel('mode', 'Method', ['HTML entities (decimal)', 'HTML entities (hex)', 'HTML entities (random mix)', 'JavaScript \\u escapes', 'Email: [at] / [dot]', 'Zero-width spaces', 'Cyrillic homoglyphs', 'Reversed + CSS bidi'])],
  run: ([s], o) => {
    need(s, 'Enter text');
    const cps = [...s];
    switch (o.mode) {
      case 'HTML entities (decimal)': return cps.map((c) => `&#${c.codePointAt(0)};`).join('');
      case 'HTML entities (hex)': return cps.map((c) => `&#x${c.codePointAt(0).toString(16)};`).join('');
      case 'HTML entities (random mix)': { const r = rnd(cps.length); return cps.map((c, i) => (r[i] % 3 === 0 ? c.replace(/[&<>"]/g, (x) => `&#${x.charCodeAt(0)};`) : r[i] % 3 === 1 ? `&#${c.codePointAt(0)};` : `&#x${c.codePointAt(0).toString(16)};`)).join(''); }
      case 'JavaScript \\u escapes': return s.split('').map((c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
      case 'Email: [at] / [dot]': return s.replace(/@/g, ' [at] ').replace(/\./g, ' [dot] ');
      case 'Zero-width spaces': return cps.join('\u200b');
      case 'Cyrillic homoglyphs': { const m = { a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', i: 'і', j: 'ј', s: 'ѕ', A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х' }; return cps.map((c) => m[c] || c).join(''); }
      default: return `<span style="unicode-bidi:bidi-override;direction:rtl">${esc(cps.reverse().join(''))}</span>`;
    }
  },
});

// ---------------- JSON analysis
T.push({
  id: 'json-size-analyzer', cat: 'JSON+', title: 'JSON Size Analyzer', desc: 'Find out why a JSON payload is big: raw / minified / pretty / gzip byte sizes, value-type counts, depth, and the heaviest paths and keys by serialized size.',
  labels: ['JSON'], sample: '{"users":[{"id":1,"name":"Ada","bio":"' + 'x'.repeat(80) + '","tags":["a","b"]},{"id":2,"name":"Linus","bio":null,"tags":[]}],"meta":{"total":2,"page":1}}',
  opts: [num('top', 'Rows in "heaviest" lists', 10)],
  run: async ([s], o) => {
    need(s, 'Paste JSON');
    const v = parseJ(s), bytes = (x) => enc.encode(x).length, ser = (x) => JSON.stringify(x);
    const raw = bytes(s), min = bytes(ser(v)), pretty = bytes(JSON.stringify(v, null, 2));
    const gz = async (str) => new Uint8Array(await new Response(new Blob([enc.encode(str)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()).length;
    const cnt = { object: 0, array: 0, string: 0, number: 0, boolean: 0, null: 0 }, byPath = [], byKey = new Map();
    let depth = 0, strBytes = 0;
    const walk = (x, p, d) => {
      depth = Math.max(depth, d);
      const t = x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x;
      cnt[t]++;
      if (t === 'string') strBytes += bytes(x);
      const size = bytes(ser(x));
      if (t === 'object') for (const [k, e] of Object.entries(x)) { const sz = walk(e, p + '.' + k, d + 1); const r = byKey.get(k) || { n: 0, b: 0 }; r.n++; r.b += sz + bytes(ser(k)) + 1; byKey.set(k, r); }
      else if (t === 'array') x.forEach((e, i) => walk(e, `${p}[${i}]`, d + 1));
      if (p) byPath.push([p, size, t]);
      return size;
    };
    walk(v, '', 0);
    const n = Math.max(1, Number(o.top) || 10), pct = (b) => (min ? ((b / min) * 100).toFixed(1) : '0') + '%';
    const g = await gz(ser(v)), gp = await gz(s);
    return [
      `Raw input        ${raw} B`, `Minified         ${min} B`, `Pretty (2 sp)    ${pretty} B`, `Gzip (minified)  ${g} B  (${((g / (min || 1)) * 100).toFixed(1)}% of minified)`, `Gzip (as pasted) ${gp} B`,
      '', `Max depth ${depth}; objects ${cnt.object}, arrays ${cnt.array}, strings ${cnt.string} (${strBytes} B of text), numbers ${cnt.number}, booleans ${cnt.boolean}, nulls ${cnt.null}`,
      '', `Heaviest values (minified bytes):`, ...byPath.sort((a, b) => b[1] - a[1]).slice(0, n).map(([p, b, t]) => `  ${String(b).padStart(7)} B ${pct(b).padStart(6)}  ${t.padEnd(7)} ${p}`),
      '', 'Heaviest keys (inclusive, summed over all occurrences):', ...[...byKey].sort((a, b) => b[1].b - a[1].b).slice(0, n).map(([k, r]) => `  ${String(r.b).padStart(7)} B ${pct(r.b).padStart(6)}  x${r.n}  ${k}`),
    ].join('\n');
  },
});

// ---------------- Network / config
T.push({
  id: 'mac-address-generator', cat: 'Network & HTTP', title: 'MAC Address Generator', desc: 'Generate random MAC addresses (cryptographically random) as unicast/multicast, globally- or locally-administered, optionally with your own OUI prefix, in colon, dash, Cisco-dot or plain format.',
  inputs: 0, sample: '', opts: [num('n', 'How many', 5), sel('fmt', 'Format', ['aa:bb:cc:dd:ee:ff', 'aa-bb-cc-dd-ee-ff', 'aabb.ccdd.eeff', 'aabbccddeeff']), sel('kind', 'Type', ['unicast, locally administered', 'unicast, globally unique (random)', 'multicast, locally administered']), txt('oui', 'OUI / prefix (optional, hex, e.g. 00:1A:2B)', ''), chk('upper', 'Upper case', false)],
  run: (_i, o) => {
    const n = Math.min(1000, Math.max(1, Number(o.n) || 1)), pre = o.oui ? unhex(o.oui.replace(/[.-]/g, ':')) : new Uint8Array(0);
    if (pre.length > 5) throw new Error('Prefix can be at most 5 bytes');
    const out = [];
    for (let i = 0; i < n; i++) {
      const b = rnd(6); b.set(pre);
      if (!pre.length) { b[0] = (b[0] & 0xfc) | (o.kind.startsWith('multicast') ? 1 : 0) | (o.kind.includes('locally') ? 2 : 0); b[0] = o.kind.includes('globally') ? b[0] & 0xfc : b[0]; }
      let h = hex(b);
      h = o.fmt.includes(':') ? h.match(/../g).join(':') : o.fmt.includes('-') ? h.match(/../g).join('-') : o.fmt.includes('.') ? h.match(/..../g).join('.') : h;
      out.push(o.upper ? h.toUpperCase() : h);
    }
    return out.join('\n');
  },
});

const v4 = (s) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(s);
const v6 = (s) => { try { return new URL(`http://[${s}]/`).hostname !== '' && /^[0-9a-f:.]+$/i.test(s) && s.includes(':'); } catch { return false; } };
const hostOk = (s) => /^(\*\.)?(_?[A-Za-z0-9]([A-Za-z0-9_-]{0,61}[A-Za-z0-9])?)(\.(_?[A-Za-z0-9]([A-Za-z0-9_-]{0,61}[A-Za-z0-9])?))*\.?$/.test(s) || s === '@';
const dnsToks = (l) => { const t = []; const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g; let m; while ((m = re.exec(l))) t.push({ v: m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2], q: m[1] !== undefined }); return t; };
T.push({
  id: 'dns-record-generator', cat: 'Network & HTTP', title: 'DNS Zone Record Generator', desc: 'Write DNS records as simple lines (TYPE name value ...) and get a validated BIND zone file, Route 53 change batch JSON or a generic JSON list. Supports A, AAAA, CNAME, MX, TXT (auto-split at 255 bytes), NS, SRV, CAA, PTR. Not a resolver: nothing is looked up or published.',
  labels: ['Records (TYPE name value...; optional ttl=300)'], sample: 'A @ 203.0.113.10\nA www 203.0.113.10 ttl=60\nAAAA @ 2001:db8::10\nCNAME blog example.net.\nMX @ 10 mail.example.com\nMX @ 20 mail2.example.com\nTXT @ "v=spf1 include:_spf.example.com ~all"\nSRV _sip._tcp 10 60 5060 sip.example.com\nCAA @ 0 issue "letsencrypt.org"\nNS sub ns1.example.net',
  opts: [txt('domain', 'Zone / domain', 'example.com'), num('ttl', 'Default TTL (seconds)', 3600), sel('fmt', 'Output', ['BIND zone file', 'Route 53 ChangeBatch JSON', 'JSON list']), chk('soa', 'Include SOA + $ORIGIN/$TTL header (BIND)', true)],
  run: ([s], o) => {
    const zone = o.domain.trim().replace(/\.$/, '').toLowerCase();
    if (!hostOk(zone) || !zone.includes('.')) throw new Error('Enter a valid zone, e.g. example.com');
    const dt = Number(o.ttl) || 3600, recs = [];
    const fq = (t, ln) => { if (!hostOk(t) && t !== '@') throw new Error(`Line ${ln}: invalid hostname "${t}"`); return t === '@' ? '@' : t.endsWith('.') ? t : t.includes('.') ? t + '.' : t; };
    s.split(/\r?\n/).forEach((raw, i) => {
      const l = raw.replace(/\s+#.*$/, '').trim(), ln = i + 1;
      if (!l || l.startsWith('#') || l.startsWith(';')) return;
      let t = dnsToks(l), ttl = dt;
      const ti = t.findIndex((x) => !x.q && /^ttl=\d+$/i.test(x.v));
      if (ti >= 0) { ttl = +t[ti].v.slice(4); t.splice(ti, 1); }
      const type = t[0]?.v.toUpperCase(), name = t[1]?.v, a = t.slice(2);
      const argc = { A: 1, AAAA: 1, CNAME: 1, NS: 1, PTR: 1, MX: 2, SRV: 4, CAA: 3 };
      if (!['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR'].includes(type)) throw new Error(`Line ${ln}: unsupported record type "${t[0]?.v}"`);
      if (!name || a.length < (argc[type] || 1)) throw new Error(`Line ${ln}: ${type} needs ${argc[type] || 1} value field(s) after the name`);
      if (!hostOk(name)) throw new Error(`Line ${ln}: invalid name "${name}"`);
      const val = a.map((x) => x.v);
      let data;
      if (type === 'A') { if (!v4(val[0])) throw new Error(`Line ${ln}: "${val[0]}" is not an IPv4 address`); data = val[0]; }
      else if (type === 'AAAA') { if (!v6(val[0])) throw new Error(`Line ${ln}: "${val[0]}" is not an IPv6 address`); data = val[0]; }
      else if (type === 'MX') { if (!/^\d+$/.test(val[0]) || +val[0] > 65535) throw new Error(`Line ${ln}: MX priority must be 0-65535`); data = `${val[0]} ${fq(val[1], ln)}`; }
      else if (type === 'SRV') { if (val.slice(0, 3).some((x) => !/^\d+$/.test(x))) throw new Error(`Line ${ln}: SRV needs priority weight port target`); data = `${val.slice(0, 3).join(' ')} ${fq(val[3], ln)}`; }
      else if (type === 'CAA') { if (!/^(issue|issuewild|iodef)$/i.test(val[1])) throw new Error(`Line ${ln}: CAA tag must be issue, issuewild or iodef`); data = `${val[0]} ${val[1].toLowerCase()} "${val[2].replace(/"/g, '\\"')}"`; }
      else if (type === 'TXT') { const full = val.join(' ').replace(/"/g, '\\"'), parts = full.match(/[^]{1,255}/g) || ['']; data = parts.map((p) => `"${p}"`).join(' '); }
      else data = fq(val[0], ln);
      recs.push({ name, type, ttl, data, raw: val });
    });
    if (!recs.length) throw new Error('Add at least one record');
    const cn = recs.filter((r) => r.type === 'CNAME');
    for (const c of cn) if (recs.some((r) => r !== c && r.name === c.name && r.type !== 'CNAME')) throw new Error(`"${c.name}" has a CNAME and other records; that is not allowed in DNS`);
    if (o.fmt === 'JSON list') return JSON.stringify(recs.map(({ name, type, ttl, data }) => ({ name, type, ttl, data })), null, 2);
    const full = (n) => (n === '@' ? zone : n.endsWith('.') ? n.slice(0, -1) : n + '.' + zone) + '.';
    if (o.fmt.startsWith('Route')) {
      const g = new Map();
      for (const r of recs) { const k = full(r.name) + '|' + r.type; (g.get(k) || g.set(k, { r, v: [] }).get(k)).v.push(r.data); }
      return JSON.stringify({ Comment: 'Generated by free-tools', Changes: [...g.values()].map(({ r, v }) => ({ Action: 'UPSERT', ResourceRecordSet: { Name: full(r.name), Type: r.type, TTL: r.ttl, ResourceRecords: v.map((x) => ({ Value: x })) } })) }, null, 2);
    }
    const w = Math.max(...recs.map((r) => r.name.length), 4);
    const head = o.soa ? [`$ORIGIN ${zone}.`, `$TTL ${dt}`, `@ IN SOA ns1.${zone}. hostmaster.${zone}. ( 1 7200 3600 1209600 ${dt} )`, ''] : [];
    return [...head, ...recs.map((r) => `${r.name.padEnd(w)} ${String(r.ttl).padEnd(6)} IN ${r.type.padEnd(5)} ${r.data}`)].join('\n');
  },
});

T.push({
  id: 'htaccess-to-nginx', cat: 'Dev Config++', title: '.htaccess to nginx Converter', desc: 'Translate common Apache .htaccess directives to nginx: Redirect, RedirectMatch, RewriteRule/RewriteCond (R, L, NC, F, G flags, www/https/front-controller patterns), ErrorDocument, Options -Indexes, DirectoryIndex, Header set, ExpiresByType, Require/Deny. Anything unsupported is left as a "# TODO" comment: review before use (run nginx -t).',
  labels: ['.htaccess'], sample: 'Options -Indexes\nDirectoryIndex index.php index.html\nErrorDocument 404 /404.html\nRedirect 301 /old-page https://example.com/new-page\nRedirectMatch 301 ^/blog/(\\d+)$ /posts/$1\n\nRewriteEngine On\nRewriteCond %{HTTPS} off\nRewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]\nRewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]\nRewriteRule ^(.*)$ https://%1/$1 [R=301,L]\nRewriteRule ^shop/(.*)$ /store/$1 [NC,L]\nRewriteRule ^secret/ - [F]\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteCond %{REQUEST_FILENAME} !-d\nRewriteRule . /index.php [L]\n\nHeader set X-Frame-Options "SAMEORIGIN"\nHeader always set Strict-Transport-Security "max-age=31536000"\nExpiresByType image/png "access plus 1 month"\nphp_value upload_max_filesize 64M',
  run: ([src]) => {
    need(src, 'Paste .htaccess');
    const out = [], todo = (l) => out.push(`# TODO unsupported: ${l}`), exp = [];
    let conds = [];
    const lines = src.replace(/\\\r?\n/g, ' ').split(/\r?\n/);
    const cond = (c) => {
      const m = /^(\S+)\s+(\S+)(?:\s+\[([^\]]*)\])?$/.exec(c);
      if (!m) return null;
      const v = { '%{HTTPS}': '$https', '%{HTTP_HOST}': '$host', '%{REQUEST_URI}': '$request_uri', '%{QUERY_STRING}': '$query_string', '%{REQUEST_METHOD}': '$request_method', '%{HTTP_USER_AGENT}': '$http_user_agent', '%{HTTP_REFERER}': '$http_referer', '%{REQUEST_FILENAME}': '$request_filename', '%{SERVER_PORT}': '$server_port', '%{REMOTE_ADDR}': '$remote_addr' }[m[1]];
      if (!v) return null;
      const nc = /NC/.test(m[3] || ''), t = m[2];
      if (m[1] === '%{REQUEST_FILENAME}' && /^!?-[fd]$/.test(t)) return { front: t };
      if (m[1] === '%{HTTPS}') { const on = /^on$/i.test(t); return { expr: on ? '$scheme = https' : '$scheme != https' }; }
      const neg = t.startsWith('!'), pat = neg ? t.slice(1) : t;
      if (/^[=<>]/.test(pat)) return { expr: `${v} ${pat[0] === '=' ? (neg ? '!=' : '=') : '~'} "${pat.slice(1)}"` };
      return { expr: `${v} ${neg ? '!' : ''}~${nc ? '*' : ''} "${pat.replace(/"/g, '\\"')}"`, backref: !neg && /\(/.test(pat) };
    };
    for (let raw of lines) {
      const l = raw.trim();
      if (!l) { out.push(''); continue; }
      if (l.startsWith('#')) { out.push(l); continue; }
      let m;
      if (/^<\/?(IfModule|Files|FilesMatch|Directory)/i.test(l)) { out.push(`# ${l}  (container directives: flattened, check scope)`); continue; }
      if (/^RewriteEngine\b/i.test(l) || /^RewriteBase\b/i.test(l)) continue;
      if ((m = /^RewriteCond\s+(.*)$/i.exec(l))) { const c = cond(m[1]); if (!c) { todo(l); conds.push({ bad: true }); } else conds.push(c); continue; }
      if ((m = /^RewriteRule\s+(\S+)\s+(\S+)(?:\s+\[([^\]]*)\])?\s*$/i.exec(l))) {
        const [, pat0, sub0, fl = ''] = m, flags = fl.split(',').map((x) => x.trim().toUpperCase()), has = (f) => flags.some((x) => x === f || x.startsWith(f + '='));
        const cs = conds; conds = [];
        if (cs.some((c) => c.bad)) { todo(l); continue; }
        if (cs.length && cs.every((c) => c.front) && cs[0].front.startsWith('!') && ['.', '^(.*)$', '(.*)', '^'].includes(pat0) && sub0.startsWith('/')) { out.push(`location / {\n    try_files $uri $uri/ ${sub0}?$args;\n}`); continue; }
        const guards = cs.filter((c) => c.expr).map((c) => c.expr), catchAll = /^\^?\(\.\*\)\$?$/.test(pat0);
        let pat = pat0 === '.' ? '^/.' : pat0.replace(/^\^?\/?/, '^/');
        if (has('NC')) pat = '(?i)' + pat;
        let sub = sub0.replace(/%\{HTTP_HOST\}/g, '$host').replace(/%\{REQUEST_URI\}/g, '$request_uri').replace(/%\{QUERY_STRING\}/g, '$query_string').replace(/%\{(HTTPS|REQUEST_SCHEME)\}/g, '$scheme');
        if (/%\d/.test(sub)) { // %N = capture of the last RewriteCond; only supported for catch-all rules
          if (!catchAll) { todo(l); continue; }
          sub = sub.replace(/%1/g, '$1').replace(/\/\$1$/, '$request_uri');
          if (/%\d/.test(sub)) { todo(l); continue; }
        }
        let stmt;
        if (has('F') || has('G')) { stmt = `return ${has('F') ? 403 : 410};`; guards.push(`$uri ~${has('NC') ? '*' : ''} "${pat0.replace(/^\^?\/?/, '^/').replace(/"/g, '\\"')}"`); }
        else if (sub === '-') { out.push(`# no-op rule: ${l}`); continue; }
        else if (has('R')) {
          const code = (/R=(\d+)/i.exec(fl) || [, '302'])[1];
          if (catchAll && /^https?:\/\//.test(sub)) stmt = `return ${code} ${sub};`;
          else if (code === '301' || code === '302') stmt = `rewrite ${pat} ${sub} ${code === '301' ? 'permanent' : 'redirect'};`;
          else stmt = `rewrite ${pat} ${sub} redirect; # NOTE: status ${code} unsupported by rewrite, use return ${code}`;
        } else stmt = `rewrite ${pat} ${sub} ${has('L') || has('END') ? 'last' : 'break'};`;
        out.push(guards.length ? guards.reduceRight((inner, g) => `if (${g}) {\n${inner.split('\n').map((x) => '    ' + x).join('\n')}\n}`, stmt) : stmt);
        continue;
      }
      conds = [];
      if ((m = /^Redirect(Permanent|Temp)?\s+(?:(\d{3}|permanent|temp|seeother|gone)\s+)?(\S+)(?:\s+(\S+))?$/i.exec(l))) {
        const st = (m[1] ? { permanent: '301', temp: '302' }[m[1].toLowerCase()] : null) || ({ permanent: '301', temp: '302', seeother: '303', gone: '410' }[(m[2] || '').toLowerCase()] || m[2] || '302');
        if (st === '410') out.push(`location ^~ ${m[3]} {\n    return 410;\n}`);
        else if (!m[4]) todo(l);
        else out.push(`rewrite ^${m[3].replace(/[.+*?()|[\]{}^$]/g, '\\$&')}(.*)$ ${m[4].replace(/\/$/, '')}$1 ${st === '301' ? 'permanent' : 'redirect'};${st !== '301' && st !== '302' ? ` # NOTE: status ${st}: use return ${st}` : ''}`);
      } else if ((m = /^RedirectMatch\s+(?:(\d{3}|permanent|temp)\s+)?(\S+)\s+(\S+)$/i.exec(l))) {
        const st = { permanent: '301', temp: '302' }[(m[1] || '').toLowerCase()] || m[1] || '302';
        out.push(`rewrite ${m[2]} ${m[3]} ${st === '301' ? 'permanent' : 'redirect'};`);
      } else if ((m = /^ErrorDocument\s+(\d{3})\s+(\S+)$/i.exec(l))) out.push(`error_page ${m[1]} ${m[2].replace(/^"|"$/g, '')};`);
      else if ((m = /^Options\s+(.*)$/i.exec(l))) {
        const parts = m[1].split(/\s+/); let any = false;
        for (const p of parts) { if (/^-Indexes$/i.test(p)) { out.push('autoindex off;'); any = true; } else if (/^\+?Indexes$/i.test(p)) { out.push('autoindex on;'); any = true; } else if (/^[-+]?(FollowSymLinks|SymLinksIfOwnerMatch|MultiViews|ExecCGI|Includes)$/i.test(p)) any = true; else todo(l); }
        if (any && parts.every((p) => /FollowSymLinks|MultiViews|ExecCGI|Includes/i.test(p))) out.push(`# ${l} (no nginx equivalent needed)`);
      } else if ((m = /^DirectoryIndex\s+(.+)$/i.exec(l))) out.push(`index ${m[1]};`);
      else if ((m = /^Header\s+(?:always\s+)?(?:set|add|append)\s+(\S+)\s+(.+)$/i.exec(l))) out.push(`add_header ${m[1]} ${/^".*"$/.test(m[2].trim()) ? m[2].trim() : '"' + m[2].trim() + '"'}${/^Header\s+always/i.test(l) ? ' always' : ''};`);
      else if ((m = /^Header\s+(?:always\s+)?unset\s+(\S+)$/i.exec(l))) out.push(`proxy_hide_header ${m[1]}; # or fastcgi_hide_header for PHP-FPM`);
      else if ((m = /^ExpiresByType\s+(\S+)\s+"?access plus (\d+) (second|minute|hour|day|week|month|year)s?"?$/i.exec(l))) exp.push([m[1], `${m[2]}${{ second: 's', minute: 'm', hour: 'h', day: 'd', week: 'w', month: 'M', year: 'y' }[m[3].toLowerCase()]}`]);
      else if (/^ExpiresActive\b/i.test(l)) out.push('# ExpiresActive: handled by the map below');
      else if (/^(Require all denied|Deny from all)$/i.test(l)) out.push('deny all;');
      else if (/^(Require all granted|Allow from all|Order\b.*)$/i.test(l)) out.push(`# ${l} (default in nginx)`);
      else if ((m = /^(?:php_value|php_flag)\s+(\S+)\s+(.+)$/i.exec(l))) out.push(`# TODO php setting ${m[1]}=${m[2]}: use fastcgi_param PHP_VALUE "${m[1]}=${m[2]}"; in the PHP location (or php.ini)`);
      else todo(l);
    }
    if (exp.length) out.push('', '# --- http {} level: map content type to expiry; then in server {}: expires $expires_by_type; ---', 'map $sent_http_content_type $expires_by_type {\n    default off;\n' + exp.map(([t, e]) => `    ${t} ${e};`).join('\n') + '\n}');
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  },
});

// ---------------- BIP-39
const BIP39_WORDS = 'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult advance advice aerobic affair afford afraid again age agent agree ahead aim air airport aisle alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount amused analyst anchor ancient anger angle angry animal ankle announce annual another answer antenna antique anxiety any apart apology appear apple approve april arch arctic area arena argue arm armed armor army around arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete atom attack attend attitude attract auction audit august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward axis baby bachelor bacon badge bag balance balcony ball bamboo banana banner bar barely bargain barrel base basic basket battle beach bean beauty because become beef before begin behave behind believe below belt bench benefit best betray better between beyond bicycle bid bike bind biology bird birth bitter black blade blame blanket blast bleak bless blind blood blossom blouse blue blur blush board boat body boil bomb bone bonus book boost border boring borrow boss bottom bounce box boy bracket brain brand brass brave bread breeze brick bridge brief bright bring brisk broccoli broken bronze broom brother brown brush bubble buddy budget buffalo build bulb bulk bullet bundle bunker burden burger burst bus business busy butter buyer buzz cabbage cabin cable cactus cage cake call calm camera camp can canal cancel candy cannon canoe canvas canyon capable capital captain car carbon card cargo carpet carry cart case cash casino castle casual cat catalog catch category cattle caught cause caution cave ceiling celery cement census century cereal certain chair chalk champion change chaos chapter charge chase chat cheap check cheese chef cherry chest chicken chief child chimney choice choose chronic chuckle chunk churn cigar cinnamon circle citizen city civil claim clap clarify claw clay clean clerk clever click client cliff climb clinic clip clock clog close cloth cloud clown club clump cluster clutch coach coast coconut code coffee coil coin collect color column combine come comfort comic common company concert conduct confirm congress connect consider control convince cook cool copper copy coral core corn correct cost cotton couch country couple course cousin cover coyote crack cradle craft cram crane crash crater crawl crazy cream credit creek crew cricket crime crisp critic crop cross crouch crowd crucial cruel cruise crumble crunch crush cry crystal cube culture cup cupboard curious current curtain curve cushion custom cute cycle dad damage damp dance danger daring dash daughter dawn day deal debate debris decade december decide decline decorate decrease deer defense define defy degree delay deliver demand demise denial dentist deny depart depend deposit depth deputy derive describe desert design desk despair destroy detail detect develop device devote diagram dial diamond diary dice diesel diet differ digital dignity dilemma dinner dinosaur direct dirt disagree discover disease dish dismiss disorder display distance divert divide divorce dizzy doctor document dog doll dolphin domain donate donkey donor door dose double dove draft dragon drama drastic draw dream dress drift drill drink drip drive drop drum dry duck dumb dune during dust dutch duty dwarf dynamic eager eagle early earn earth easily east easy echo ecology economy edge edit educate effort egg eight either elbow elder electric elegant element elephant elevator elite else embark embody embrace emerge emotion employ empower empty enable enact end endless endorse enemy energy enforce engage engine enhance enjoy enlist enough enrich enroll ensure enter entire entry envelope episode equal equip era erase erode erosion error erupt escape essay essence estate eternal ethics evidence evil evoke evolve exact example excess exchange excite exclude excuse execute exercise exhaust exhibit exile exist exit exotic expand expect expire explain expose express extend extra eye eyebrow fabric face faculty fade faint faith fall false fame family famous fan fancy fantasy farm fashion fat fatal father fatigue fault favorite feature february federal fee feed feel female fence festival fetch fever few fiber fiction field figure file film filter final find fine finger finish fire firm first fiscal fish fit fitness fix flag flame flash flat flavor flee flight flip float flock floor flower fluid flush fly foam focus fog foil fold follow food foot force forest forget fork fortune forum forward fossil foster found fox fragile frame frequent fresh friend fringe frog front frost frown frozen fruit fuel fun funny furnace fury future gadget gain galaxy gallery game gap garage garbage garden garlic garment gas gasp gate gather gauge gaze general genius genre gentle genuine gesture ghost giant gift giggle ginger giraffe girl give glad glance glare glass glide glimpse globe gloom glory glove glow glue goat goddess gold good goose gorilla gospel gossip govern gown grab grace grain grant grape grass gravity great green grid grief grit grocery group grow grunt guard guess guide guilt guitar gun gym habit hair half hammer hamster hand happy harbor hard harsh harvest hat have hawk hazard head health heart heavy hedgehog height hello helmet help hen hero hidden high hill hint hip hire history hobby hockey hold hole holiday hollow home honey hood hope horn horror horse hospital host hotel hour hover hub huge human humble humor hundred hungry hunt hurdle hurry hurt husband hybrid ice icon idea identify idle ignore ill illegal illness image imitate immense immune impact impose improve impulse inch include income increase index indicate indoor industry infant inflict inform inhale inherit initial inject injury inmate inner innocent input inquiry insane insect inside inspire install intact interest into invest invite involve iron island isolate issue item ivory jacket jaguar jar jazz jealous jeans jelly jewel job join joke journey joy judge juice jump jungle junior junk just kangaroo keen keep ketchup key kick kid kidney kind kingdom kiss kit kitchen kite kitten kiwi knee knife knock know lab label labor ladder lady lake lamp language laptop large later latin laugh laundry lava law lawn lawsuit layer lazy leader leaf learn leave lecture left leg legal legend leisure lemon lend length lens leopard lesson letter level liar liberty library license life lift light like limb limit link lion liquid list little live lizard load loan lobster local lock logic lonely long loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics machine mad magic magnet maid mail main major make mammal man manage mandate mango mansion manual maple marble march margin marine market marriage mask mass master match material math matrix matter maximum maze meadow mean measure meat mechanic medal media melody melt member memory mention menu mercy merge merit merry mesh message metal method middle midnight milk million mimic mind minimum minor minute miracle mirror misery miss mistake mix mixed mixture mobile model modify mom moment monitor monkey monster month moon moral more morning mosquito mother motion motor mountain mouse move movie much muffin mule multiply muscle museum mushroom music must mutual myself mystery myth naive name napkin narrow nasty nation nature near neck need negative neglect neither nephew nerve nest net network neutral never news next nice night noble noise nominee noodle normal north nose notable note nothing notice novel now nuclear number nurse nut oak obey object oblige obscure observe obtain obvious occur ocean october odor off offer office often oil okay old olive olympic omit once one onion online only open opera opinion oppose option orange orbit orchard order ordinary organ orient original orphan ostrich other outdoor outer output outside oval oven over own owner oxygen oyster ozone pact paddle page pair palace palm panda panel panic panther paper parade parent park parrot party pass patch path patient patrol pattern pause pave payment peace peanut pear peasant pelican pen penalty pencil people pepper perfect permit person pet phone photo phrase physical piano picnic picture piece pig pigeon pill pilot pink pioneer pipe pistol pitch pizza place planet plastic plate play please pledge pluck plug plunge poem poet point polar pole police pond pony pool popular portion position possible post potato pottery poverty powder power practice praise predict prefer prepare present pretty prevent price pride primary print priority prison private prize problem process produce profit program project promote proof property prosper protect proud provide public pudding pull pulp pulse pumpkin punch pupil puppy purchase purity purpose purse push put puzzle pyramid quality quantum quarter question quick quit quiz quote rabbit raccoon race rack radar radio rail rain raise rally ramp ranch random range rapid rare rate rather raven raw razor ready real reason rebel rebuild recall receive recipe record recycle reduce reflect reform refuse region regret regular reject relax release relief rely remain remember remind remove render renew rent reopen repair repeat replace report require rescue resemble resist resource response result retire retreat return reunion reveal review reward rhythm rib ribbon rice rich ride ridge rifle right rigid ring riot ripple risk ritual rival river road roast robot robust rocket romance roof rookie room rose rotate rough round route royal rubber rude rug rule run runway rural sad saddle sadness safe sail salad salmon salon salt salute same sample sand satisfy satoshi sauce sausage save say scale scan scare scatter scene scheme school science scissors scorpion scout scrap screen script scrub sea search season seat second secret section security seed seek segment select sell seminar senior sense sentence series service session settle setup seven shadow shaft shallow share shed shell sheriff shield shift shine ship shiver shock shoe shoot shop short shoulder shove shrimp shrug shuffle shy sibling sick side siege sight sign silent silk silly silver similar simple since sing siren sister situate six size skate sketch ski skill skin skirt skull slab slam sleep slender slice slide slight slim slogan slot slow slush small smart smile smoke smooth snack snake snap sniff snow soap soccer social sock soda soft solar soldier solid solution solve someone song soon sorry sort soul sound soup source south space spare spatial spawn speak special speed spell spend sphere spice spider spike spin spirit split spoil sponsor spoon sport spot spray spread spring spy square squeeze squirrel stable stadium staff stage stairs stamp stand start state stay steak steel stem step stereo stick still sting stock stomach stone stool story stove strategy street strike strong struggle student stuff stumble style subject submit subway success such sudden suffer sugar suggest suit summer sun sunny sunset super supply supreme sure surface surge surprise surround survey suspect sustain swallow swamp swap swarm swear sweet swift swim swing switch sword symbol symptom syrup system table tackle tag tail talent talk tank tape target task taste tattoo taxi teach team tell ten tenant tennis tent term test text thank that theme then theory there they thing this thought three thrive throw thumb thunder ticket tide tiger tilt timber time tiny tip tired tissue title toast tobacco today toddler toe together toilet token tomato tomorrow tone tongue tonight tool tooth top topic topple torch tornado tortoise toss total tourist toward tower town toy track trade traffic tragic train transfer trap trash travel tray treat tree trend trial tribe trick trigger trim trip trophy trouble truck true truly trumpet trust truth try tube tuition tumble tuna tunnel turkey turn turtle twelve twenty twice twin twist two type typical ugly umbrella unable unaware uncle uncover under undo unfair unfold unhappy uniform unique unit universe unknown unlock until unusual unveil update upgrade uphold upon upper upset urban urge usage use used useful useless usual utility vacant vacuum vague valid valley valve van vanish vapor various vast vault vehicle velvet vendor venture venue verb verify version very vessel veteran viable vibrant vicious victory video view village vintage violin virtual virus visa visit visual vital vivid vocal voice void volcano volume vote voyage wage wagon wait walk wall walnut want warfare warm warrior wash wasp waste water wave way wealth weapon wear weasel weather web wedding weekend weird welcome west wet whale what wheat wheel when where whip whisper wide width wife wild will win window wine wing wink winner winter wire wisdom wise wish witness wolf woman wonder wood wool word work world worry worth wrap wreck wrestle wrist write wrong yard year yellow you young youth zebra zero zone zoo'.split(' ');
T.push({
  id: 'bip39-generator', cat: 'Crypto', title: 'BIP-39 Mnemonic Generator & Validator', desc: 'Generate a BIP-39 English recovery phrase (12/15/18/21/24 words, crypto.getRandomValues or your own entropy hex), validate an existing phrase checksum, and derive the 512-bit seed (PBKDF2-HMAC-SHA512, 2048 rounds). Runs locally, but never use a phrase generated or pasted into any website for real funds.',
  labels: ['Entropy hex (generate; empty = random) or mnemonic (validate)'], sample: '00000000000000000000000000000000', placeholder: ['e.g. 7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f'],
  opts: [sel('mode', 'Mode', ['generate', 'validate']), sel('words', 'Words (generate)', ['12', '15', '18', '21', '24']), txt('pass', 'Passphrase (optional)', '')],
  run: async ([s], o) => {
    const sha = async (u) => new Uint8Array(await crypto.subtle.digest('SHA-256', u));
    let ent, mnemonic;
    if (o.mode === 'generate') {
      ent = s.trim() ? unhex(s) : rnd((Number(o.words) * 11 - Number(o.words) / 3) / 8);
      if (![16, 20, 24, 28, 32].includes(ent.length)) throw new Error('Entropy must be 128, 160, 192, 224 or 256 bits (32/40/48/56/64 hex digits)');
      const cs = ent.length / 4, bits = [...ent].map((b) => b.toString(2).padStart(8, '0')).join('') + [...(await sha(ent))].map((b) => b.toString(2).padStart(8, '0')).join('').slice(0, cs);
      mnemonic = bits.match(/.{11}/g).map((b) => BIP39_WORDS[parseInt(b, 2)]).join(' ');
    } else {
      mnemonic = s.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');
      const w = mnemonic.split(' ');
      if (![12, 15, 18, 21, 24].includes(w.length)) throw new Error(`A mnemonic has 12, 15, 18, 21 or 24 words (got ${w.length})`);
      const bad = w.find((x) => !BIP39_WORDS.includes(x));
      if (bad) throw new Error(`"${bad}" is not in the BIP-39 English word list`);
      const bits = w.map((x) => BIP39_WORDS.indexOf(x).toString(2).padStart(11, '0')).join(''), cl = w.length / 3, eb = bits.slice(0, bits.length - cl);
      ent = Uint8Array.from(eb.match(/.{8}/g), (b) => parseInt(b, 2));
      const want = [...(await sha(ent))].map((b) => b.toString(2).padStart(8, '0')).join('').slice(0, cl);
      if (want !== bits.slice(-cl)) throw new Error('Invalid mnemonic: checksum does not match');
    }
    const k = await crypto.subtle.importKey('raw', enc.encode(mnemonic.normalize('NFKD')), 'PBKDF2', false, ['deriveBits']);
    const seed = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-512', salt: enc.encode(('mnemonic' + (o.pass || '')).normalize('NFKD')), iterations: 2048 }, k, 512));
    return `${o.mode === 'validate' ? 'Valid mnemonic (checksum OK)\n' : ''}Mnemonic (${mnemonic.split(' ').length} words):\n${mnemonic}\n\nEntropy: ${hex(ent)}\nSeed (PBKDF2-HMAC-SHA512${o.pass ? ', with passphrase' : ''}):\n${hex(seed)}`;
  },
});

// ---------------- CSS
const TW_ORDER = [
  /^(container|sr-only|not-sr-only)$/, /^(pointer-events-)/, /^(visible|invisible|collapse)$/, /^(static|fixed|absolute|relative|sticky)$/,
  /^-?inset-x-/, /^-?inset-y-/, /^-?inset-/, /^-?(start|end)-/, /^-?top-/, /^-?right-/, /^-?bottom-/, /^-?left-/, /^(isolate|isolation-)/, /^-?z-/, /^-?order-/, /^col-/, /^row-/, /^(float-|clear-)/,
  /^-?mx-/, /^-?my-/, /^-?m-/, /^-?(ms|me)-/, /^-?mt-/, /^-?mr-/, /^-?mb-/, /^-?ml-/, /^box-/, /^line-clamp-/,
  /^(block|inline-block|inline|flex|inline-flex|table|inline-table|table-\w+|grid|inline-grid|contents|list-item|flow-root|hidden)$/, /^aspect-/, /^size-/, /^h-/, /^max-h-/, /^min-h-/, /^w-/, /^min-w-/, /^max-w-/,
  /^flex-(1|auto|initial|none)$|^flex-\[/, /^shrink/, /^grow/, /^basis-/, /^table-(auto|fixed)$/, /^border-(collapse|separate)$/, /^origin-/, /^-?translate-/, /^-?rotate-/, /^-?skew-/, /^-?scale-/, /^transform/, /^animate-/, /^cursor-/, /^(touch-|select-|resize|snap-|scroll-)/, /^(list-|appearance-)/, /^columns-/, /^break-(after|before|inside)/,
  /^grid-cols-/, /^grid-rows-/, /^grid-flow-/, /^auto-(cols|rows)-/, /^flex-(row|col)/, /^flex-(wrap|nowrap)/, /^place-content-/, /^place-items-/, /^content-/, /^items-/, /^justify-items-/, /^justify-(?!self)/, /^gap-x-/, /^gap-y-/, /^gap-/, /^space-x-|^-space-x-/, /^space-y-|^-space-y-/, /^divide-/, /^place-self-/, /^self-/, /^justify-self-/,
  /^overflow-x-/, /^overflow-y-/, /^overflow-/, /^overscroll-/, /^(truncate|text-ellipsis|text-clip)$/, /^whitespace-/, /^break-/, /^rounded(-|$)/, /^border(-[xytrblse])?(-(\d+|\[.*\])|$)/, /^border-(solid|dashed|dotted|double|hidden|none)$/, /^border-/, /^bg-(fixed|local|scroll|clip|origin|bottom|center|left|right|top|repeat|no-repeat|auto|cover|contain)/, /^bg-gradient-/, /^bg-/, /^from-/, /^via-/, /^to-/, /^(fill|stroke)-/, /^object-/,
  /^p-/, /^px-/, /^py-/, /^(ps|pe)-/, /^pt-/, /^pr-/, /^pb-/, /^pl-/, /^text-(left|center|right|justify|start|end)$/, /^indent-/, /^align-/, /^font-(sans|serif|mono)$/, /^text-(xs|sm|base|lg|xl|\d?xl|\[\d.*(px|rem|em)\])$/, /^font-/, /^(uppercase|lowercase|capitalize|normal-case)$/, /^(italic|not-italic)$/, /^(normal-nums|ordinal|tabular-nums)/, /^leading-/, /^tracking-/, /^text-/, /^(underline|overline|line-through|no-underline)$/, /^(decoration|underline-offset)-/, /^(antialiased|subpixel-antialiased)$/,
  /^opacity-/, /^mix-blend-/, /^shadow/, /^outline/, /^ring-offset-/, /^ring/, /^(blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|saturate|sepia|filter)/, /^backdrop-/, /^transition/, /^delay-/, /^duration-/, /^ease-/, /^will-change-/,
];
const TW_VARIANTS = ['before', 'after', 'placeholder', 'file', 'marker', 'selection', 'first-line', 'first-letter', 'backdrop', 'first', 'last', 'only', 'odd', 'even', 'first-of-type', 'last-of-type', 'only-of-type', 'visited', 'target', 'open', 'default', 'checked', 'indeterminate', 'placeholder-shown', 'autofill', 'optional', 'required', 'valid', 'invalid', 'in-range', 'out-of-range', 'read-only', 'empty', 'focus-within', 'hover', 'focus', 'focus-visible', 'active', 'enabled', 'disabled', 'group', 'peer', 'ltr', 'rtl', 'motion-safe', 'motion-reduce', 'dark', 'portrait', 'landscape', 'contrast-more', 'contrast-less', 'print', 'sm', 'md', 'lg', 'xl', '2xl'];
const twSplit = (c) => { const parts = []; let d = 0, cur = ''; for (const ch of c) { if (ch === '[') d++; if (ch === ']') d--; if (ch === ':' && d === 0) { parts.push(cur); cur = ''; } else cur += ch; } return [parts, cur]; };
T.push({
  id: 'tailwind-class-sorter', cat: 'Formatters+', title: 'Tailwind Class Sorter', desc: 'Sort Tailwind CSS utility classes into the conventional order (layout, box model, typography, effects ... with variants like hover:/md:/dark: after base classes), similar to prettier-plugin-tailwindcss. Hand-written approximation of the official ordering: unknown/custom classes come first, results can differ in rare edge cases.',
  labels: ['class list or HTML with class="..." attributes'], sample: '<div class="p-4 text-white hover:bg-blue-700 flex md:flex-row bg-blue-500 items-center rounded-lg mt-2 custom-card dark:bg-gray-900 font-bold text-lg shadow-md w-full">Hi</div>',
  opts: [chk('dedupe', 'Remove duplicate classes', true)],
  run: ([s], o) => {
    need(s, 'Paste classes or HTML');
    const rank = (cls) => {
      const [vs, base0] = twSplit(cls), imp = base0.startsWith('!'), base = imp ? base0.slice(1) : base0;
      let u = TW_ORDER.findIndex((r) => r.test(base.replace(/^-(?=\d)/, '-')));
      let vm = 0n;
      for (const v of vs) { const n = v.replace(/^(group|peer)-.*/, '$1').replace(/^(min|max)-.*/, '2xl'); const i = TW_VARIANTS.indexOf(n); vm |= 1n << BigInt(i < 0 ? TW_VARIANTS.length : i); }
      return { u: u < 0 ? -1 : u, vm, cls, hasV: vs.length > 0 };
    };
    const sortList = (str) => {
      let list = str.trim().split(/\s+/).filter(Boolean);
      if (o.dedupe) list = [...new Set(list)];
      const known = list.map(rank), unk = known.filter((r) => r.u < 0 && !r.hasV).map((r) => r.cls);
      const rest = known.filter((r) => !(r.u < 0 && !r.hasV)).sort((a, b) => (a.vm === b.vm ? a.u - b.u || (a.cls < b.cls ? -1 : a.cls > b.cls ? 1 : 0) : a.vm < b.vm ? -1 : 1));
      return [...unk, ...rest.map((r) => r.cls)].join(' ');
    };
    if (/class(Name)?\s*=/.test(s)) return s.replace(/(class(?:Name)?\s*=\s*)(["'])([^"']*)\2/g, (m, a, q, v) => (v.includes('{') ? m : a + q + sortList(v) + q)).replace(/(class(?:Name)?\s*=\s*)\{`([^`$]*)`\}/g, (m, a, v) => a + '{`' + sortList(v) + '`}');
    return sortList(s);
  },
});

T.push({
  id: 'css-media-query-builder', cat: 'CSS+', title: 'CSS Media Query Builder', desc: 'Compose a @media rule from widths, heights, orientation, colour scheme, reduced motion, hover/pointer, resolution and contrast preferences, in classic (min-width) or modern range syntax (400px <= width <= 800px). Wraps your CSS if you paste any.',
  labels: ['CSS to wrap (optional)'], sample: '.card { padding: 2rem; }',
  opts: [sel('type', 'Media type', ['screen', 'all', 'print']), txt('minw', 'min width', '640px'), txt('maxw', 'max width', '1023.98px'), txt('minh', 'min height', ''), txt('maxh', 'max height', ''), sel('orient', 'Orientation', ['any', 'portrait', 'landscape']), sel('scheme', 'Color scheme', ['any', 'dark', 'light']), sel('motion', 'Motion', ['any', 'reduce', 'no-preference']), sel('hover', 'Hover', ['any', 'hover', 'none']), sel('pointer', 'Pointer', ['any', 'fine', 'coarse']), txt('dppx', 'min resolution (dppx)', ''), sel('contrast', 'Contrast', ['any', 'more', 'less']), sel('syntax', 'Syntax', ['classic (min-/max-)', 'range (>=, <=)'])],
  run: ([css], o) => {
    const unit = /^\d*\.?\d+(px|em|rem|vw|vh|ch|cm|mm|in|pt)$/;
    for (const k of ['minw', 'maxw', 'minh', 'maxh']) if (o[k] && !unit.test(o[k].trim())) throw new Error(`"${o[k]}" is not a CSS length (e.g. 640px, 40em)`);
    if (o.dppx && !/^\d*\.?\d+$/.test(o.dppx.trim())) throw new Error('Resolution must be a number of dppx, e.g. 2');
    const c = [], rng = o.syntax.startsWith('range');
    const dim = (n, lo, hi) => {
      lo = lo.trim(); hi = hi.trim();
      if (rng) c.push(lo && hi ? `(${lo} <= ${n} <= ${hi})` : lo ? `(${n} >= ${lo})` : hi ? `(${n} <= ${hi})` : null);
      else { if (lo) c.push(`(min-${n}: ${lo})`); if (hi) c.push(`(max-${n}: ${hi})`); }
    };
    dim('width', o.minw, o.maxw); dim('height', o.minh, o.maxh);
    if (o.orient !== 'any') c.push(`(orientation: ${o.orient})`);
    if (o.scheme !== 'any') c.push(`(prefers-color-scheme: ${o.scheme})`);
    if (o.motion !== 'any') c.push(`(prefers-reduced-motion: ${o.motion})`);
    if (o.hover !== 'any') c.push(`(hover: ${o.hover})`);
    if (o.pointer !== 'any') c.push(`(pointer: ${o.pointer})`);
    if (o.dppx) c.push(`(min-resolution: ${o.dppx.trim()}dppx)`);
    if (o.contrast !== 'any') c.push(`(prefers-contrast: ${o.contrast})`);
    const conds = c.filter(Boolean);
    if (!conds.length && o.type === 'all') throw new Error('Set at least one condition or a media type');
    const query = o.type === 'all' ? conds.join(' and ') : [o.type, ...conds].join(' and ');
    const body = css.trim() ? css.trim().split('\n').map((l) => '  ' + l).join('\n') : '  /* styles */';
    return `@media ${query} {\n${body}\n}\n\n/* JavaScript */\nwindow.matchMedia(${JSON.stringify(query)}).matches`;
  },
});

T.push({
  id: 'css-grid-area-builder', cat: 'CSS+', title: 'CSS Grid Template Areas Builder', desc: 'Draw a layout as text rows (use . for empty cells) and get validated grid-template-areas CSS with per-area classes and a coloured preview. Checks that every named area is a single rectangle.',
  labels: ['Layout rows (one row per line)'], sample: 'header header header\nsidebar main main\nsidebar footer footer',
  opts: [txt('cols', 'grid-template-columns', '200px 1fr 1fr'), txt('rows', 'grid-template-rows', 'auto 1fr auto'), txt('gap', 'gap', '8px'), txt('sel', 'Container selector', '.layout')],
  run: ([s], o) => {
    const rows = s.split(/\r?\n/).map((l) => l.trim().split(/\s+/).filter(Boolean)).filter((r) => r.length);
    if (!rows.length) throw new Error('Enter at least one row');
    const w = rows[0].length;
    rows.forEach((r, i) => { if (r.length !== w) throw new Error(`Row ${i + 1} has ${r.length} cells, row 1 has ${w}`); });
    const names = [...new Set(rows.flat())].filter((n) => !/^\.+$/.test(n));
    for (const n of names) {
      if (!/^[A-Za-z_-][\w-]*$/.test(n)) throw new Error(`Invalid area name "${n}"`);
      const cells = []; rows.forEach((r, y) => r.forEach((c, x) => c === n && cells.push([x, y])));
      const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]), area = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
      if (area !== cells.length) throw new Error(`Area "${n}" is not a rectangle; CSS requires each named area to be one rectangular block`);
    }
    const colr = (i) => `hsl(${(i * 67) % 360} 65% 78%)`;
    const css = `${o.sel} {\n  display: grid;\n${o.cols ? `  grid-template-columns: ${o.cols};\n` : ''}${o.rows ? `  grid-template-rows: ${o.rows};\n` : ''}${o.gap ? `  gap: ${o.gap};\n` : ''}  grid-template-areas:\n${rows.map((r) => `    "${r.join(' ')}"`).join('\n')};\n}\n` + names.map((n) => `.${n} { grid-area: ${n}; }`).join('\n');
    const html = `<style>${o.sel.replace(/[<>]/g, '')}{display:grid;${o.cols ? 'grid-template-columns:' + o.cols.replace(/[<;{}]/g, '') + ';' : ''}${o.rows ? 'grid-template-rows:' + o.rows.replace(/[<;{}]/g, '') + ';' : ''}${o.gap ? 'gap:' + o.gap.replace(/[<;{}]/g, '') + ';' : ''}grid-template-areas:${rows.map((r) => `"${r.join(' ')}"`).join(' ')};min-height:240px;font:14px sans-serif}${names.map((n, i) => `.a-${i}{grid-area:${n};background:${colr(i)};display:flex;align-items:center;justify-content:center;border-radius:4px}`).join('')}</style><div class="${o.sel.replace(/^\./, '').replace(/[^\w-]/g, '')}">${names.map((n, i) => `<div class="a-${i}">${esc(n)}</div>`).join('')}</div>`;
    return { text: css, html };
  },
});

// ---------------- LLM / prompt tools (all heuristic or exact maths; no model is ever called)
T.push({
  id: 'prompt-linter', cat: 'LLM Tools', title: 'Prompt Linter / Optimizer Checklist', desc: 'Rule-based review of an LLM prompt (no model is called): checks for role, task, output format, constraints, examples, structure, vague or hedging wording, shouting, negative-only instructions, unfilled placeholders, repeated sentences and length, then lists concrete fixes with a score.',
  labels: ['Prompt'], sample: 'You are a helpful assistant. Try to write some good stuff about our product, maybe something nice. DO NOT be boring!!! Do not use jargon. Do not make it too long. {{product_name}}',
  run: ([p]) => {
    need(p, 'Paste a prompt');
    const checks = [], tok = Math.ceil(p.length / 4), L = p.toLowerCase();
    const add = (ok, good, fix, w = 1) => checks.push({ ok, msg: ok ? good : fix, w });
    add(/\b(you are|act as|your role|as an? (expert|assistant)|persona)\b/.test(L), 'Defines a role/persona', 'Add a role (e.g. "You are a senior technical writer for ...") so tone and expertise are anchored.');
    add(/\b(write|summari[sz]e|translate|classify|extract|generate|answer|review|explain|list|analy[sz]e|rewrite|draft|create|compare)\b/.test(L), 'States an explicit task verb', 'State the task with a clear action verb (summarize, classify, extract ...).', 2);
    add(/\b(json|markdown|bullet|table|format|schema|csv|yaml|xml|sentences|words|paragraphs?|characters)\b/.test(L), 'Specifies output format/length', 'Describe the exact output format (JSON schema, bullets, max words) so it is parseable and consistent.', 2);
    add(/\b(example|e\.g\.|for instance|<example|input:|output:)\b/.test(L), 'Contains example(s)', 'Add 1-3 short input/output examples; few-shot examples are the strongest steering tool.');
    add(/<\w+>|^#{1,3} |```|^[-*] |^\d+\. /m.test(p) || p.length < 280, 'Structured or short enough to scan', 'Structure long prompts with sections or XML-style tags (<context>, <rules>, <output_format>).');
    add(/\b(audience|reader|customer|user|context|background|because|so that|goal|purpose)\b/.test(L), 'Gives context/purpose', 'Explain who the output is for and why (audience, goal); models follow reasons better than bare rules.');
    const vague = [...L.matchAll(/\b(good|nice|some|stuff|things?|etc\.?|appropriate|as needed|properly|better|interesting|engaging|various|a few|short|long|too long|too short)\b/g)].map((m) => m[1]);
    add(!vague.length, 'No vague wording', `Vague words: ${[...new Set(vague)].join(', ')}. Replace with measurable criteria (e.g. "under 80 words").`, 2);
    const hedge = [...L.matchAll(/\b(try to|maybe|perhaps|if possible|kind of|sort of|i think|attempt to|you might want to)\b/g)].map((m) => m[1]);
    add(!hedge.length, 'No hedging', `Hedges found (${[...new Set(hedge)].join(', ')}): state requirements directly ("Write X", not "Try to write X").`);
    const caps = (p.match(/\b[A-Z]{3,}\b/g) || []).filter((w) => !/^(JSON|HTML|CSS|API|XML|CSV|YAML|SQL|URL|AI|LLM|USD|EUR|PDF|SEO|HTTP|UTC)$/.test(w)).length, ex = (p.match(/!{2,}/g) || []).length;
    add(caps + ex === 0, 'No shouting', `${caps} ALL-CAPS word(s) / ${ex} repeated "!": modern models over-react to emphasis; prefer a calm sentence explaining why it matters.`);
    const neg = (L.match(/\b(do not|don't|never|avoid|must not|shouldn't|cannot)\b/g) || []).length, pos = (L.match(/\b(always|must|should|use|include|write|respond|ensure)\b/g) || []).length;
    add(neg <= 1 || pos >= neg, 'Balanced positive/negative instructions', `${neg} prohibitions vs ${pos} positive instructions: say what to do instead of only what to avoid.`);
    const ph = [...p.matchAll(/\{\{[^}]*\}\}|\[(?:INSERT|TODO|YOUR)[^\]]*\]|<(?:insert|todo)[^>]*>|\{[a-z_]+\}/gi)].map((m) => m[0]);
    add(!ph.length, 'No unfilled placeholders', `Unfilled placeholders: ${[...new Set(ph)].join(', ')}.`, 2);
    const sents = p.split(/(?<=[.!?\n])\s+/).map((x) => x.trim().toLowerCase()).filter((x) => x.length > 15), dup = sents.length - new Set(sents).size;
    add(dup === 0, 'No repeated sentences', `${dup} repeated sentence(s): remove duplicates to avoid conflicting emphasis.`);
    add(tok < 3000, `Length OK (~${tok} tokens, estimate)`, `Long prompt (~${tok} tokens, estimate): consider moving reference material to a separate context block.`);
    const total = checks.reduce((n, c) => n + c.w, 0), got = checks.filter((c) => c.ok).reduce((n, c) => n + c.w, 0);
    return `Prompt score: ${Math.round((got / total) * 100)}/100  (${p.length} chars, ~${tok} tokens, ${p.split(/\s+/).filter(Boolean).length} words)\n\nIssues:\n${checks.filter((c) => !c.ok).map((c) => '  - ' + c.msg).join('\n') || '  none'}\n\nPassed:\n${checks.filter((c) => c.ok).map((c) => '  + ' + c.msg).join('\n') || '  none'}\n\nHeuristic checklist only: it cannot judge whether the prompt actually works. Test on real inputs.`;
  },
});

const rpcCheck = (m, i) => {
  const e = [], at = (x) => (i == null ? x : `#${i + 1}: ${x}`);
  if (!isObj(m)) return [at('message must be a JSON object')];
  if (m.jsonrpc !== '2.0') e.push(at('"jsonrpc" must be the string "2.0"'));
  const isReq = typeof m.method === 'string', isRes = 'result' in m || 'error' in m;
  if (isReq === isRes) { e.push(at(isReq ? 'has both "method" and result/error' : 'neither a request ("method") nor a response ("result"/"error")')); return e; }
  if ('id' in m && !(typeof m.id === 'string' || (typeof m.id === 'number' && Number.isFinite(m.id)))) e.push(at('"id" must be a string or number (MCP forbids null ids)'));
  if (isReq) {
    if (m.params !== undefined && (m.params === null || typeof m.params !== 'object')) e.push(at('"params" must be an object or array'));
    const p = m.params || {};
    if (m.method === 'initialize') {
      if (!('id' in m)) e.push(at('initialize must have an id'));
      if (typeof p.protocolVersion !== 'string') e.push(at('initialize.params.protocolVersion (string) is required'));
      if (!isObj(p.capabilities)) e.push(at('initialize.params.capabilities (object) is required'));
      if (!isObj(p.clientInfo) || typeof p.clientInfo.name !== 'string') e.push(at('initialize.params.clientInfo.name is required'));
    } else if (m.method === 'tools/call') {
      if (typeof p.name !== 'string') e.push(at('tools/call.params.name (string) is required'));
      if (p.arguments !== undefined && !isObj(p.arguments)) e.push(at('tools/call.params.arguments must be an object'));
    } else if (m.method === 'resources/read' && typeof p.uri !== 'string') e.push(at('resources/read.params.uri is required'));
    else if (m.method === 'prompts/get' && typeof p.name !== 'string') e.push(at('prompts/get.params.name is required'));
    else if (m.method.startsWith('notifications/') && 'id' in m) e.push(at('notifications must not have an id'));
    else if (!('id' in m) && !m.method.startsWith('notifications/')) e.push(at('requests need an "id" (only notifications/* may omit it)'));
  } else {
    if ('result' in m && 'error' in m) e.push(at('response has both "result" and "error"'));
    if (!('id' in m)) e.push(at('response needs an "id"'));
    if ('error' in m && (!isObj(m.error) || !Number.isInteger(m.error.code) || typeof m.error.message !== 'string')) e.push(at('"error" needs integer "code" and string "message"'));
    const r = m.result;
    if (isObj(r) && Array.isArray(r.tools)) r.tools.forEach((t, k) => {
      if (typeof t?.name !== 'string' || !t.name) e.push(at(`tools[${k}].name (non-empty string) is required`));
      else if (!/^[A-Za-z0-9_.-]{1,128}$/.test(t.name)) e.push(at(`tools[${k}].name "${t.name}" should match [A-Za-z0-9_.-]{1,128}`));
      if (!isObj(t?.inputSchema) || t.inputSchema.type !== 'object') e.push(at(`tools[${k}].inputSchema must be a JSON Schema with type "object"`));
      else if (t.inputSchema.properties !== undefined && !isObj(t.inputSchema.properties)) e.push(at(`tools[${k}].inputSchema.properties must be an object`));
      else if (Array.isArray(t.inputSchema.required)) for (const q of t.inputSchema.required) if (!(q in (t.inputSchema.properties || {}))) e.push(at(`tools[${k}] requires "${q}" which is not in properties`));
      if (t?.description !== undefined && typeof t.description !== 'string') e.push(at(`tools[${k}].description must be a string`));
    });
    if (isObj(r) && Array.isArray(r.content)) r.content.forEach((c, k) => {
      if (!['text', 'image', 'audio', 'resource', 'resource_link'].includes(c?.type)) e.push(at(`content[${k}].type must be text/image/audio/resource/resource_link`));
      else if (c.type === 'text' && typeof c.text !== 'string') e.push(at(`content[${k}].text (string) is required`));
      else if ((c.type === 'image' || c.type === 'audio') && (typeof c.data !== 'string' || typeof c.mimeType !== 'string')) e.push(at(`content[${k}] needs base64 "data" and "mimeType"`));
    });
    if (isObj(r) && Array.isArray(r.resources)) r.resources.forEach((x, k) => { if (typeof x?.uri !== 'string' || typeof x?.name !== 'string') e.push(at(`resources[${k}] needs "uri" and "name"`)); });
    if (isObj(r) && Array.isArray(r.prompts)) r.prompts.forEach((x, k) => { if (typeof x?.name !== 'string') e.push(at(`prompts[${k}].name is required`)); });
  }
  return e;
};
T.push({
  id: 'mcp-message-validator', cat: 'LLM Tools', title: 'MCP / JSON-RPC Message Inspector', desc: 'Offline inspector for Model Context Protocol traffic: paste one JSON-RPC message, an array, or one message per line and get structure checks (jsonrpc 2.0, ids, initialize, tools/list schemas, tools/call, content blocks, errors). It cannot connect to a live server.',
  labels: ['MCP messages (JSON / JSON Lines)'], sample: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"demo","version":"1.0"}}}\n{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"get_weather","description":"Weather","inputSchema":{"type":"object","properties":{"city":{"type":"string"}},"required":["city","unit"]}}]}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}',
  run: ([s]) => {
    need(s, 'Paste MCP messages');
    let msgs;
    try { const v = JSON.parse(s); msgs = Array.isArray(v) ? v : [v]; } catch { msgs = s.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => { try { return JSON.parse(l); } catch (e) { throw new Error(`Line ${i + 1} is not valid JSON: ${e.message}`); } }); }
    const out = [], ids = new Map();
    msgs.forEach((m, i) => {
      const kind = isObj(m) ? (typeof m.method === 'string' ? ('id' in m ? 'request' : 'notification') : 'error' in m ? 'error response' : 'result' in m ? 'response' : 'unknown') : 'invalid';
      const errs = rpcCheck(m, msgs.length > 1 ? i : null);
      if (isObj(m) && 'id' in m) { if (kind === 'request') ids.set(m.id, m.method); else if (ids.has(m.id)) ids.set(m.id, ids.get(m.id) + ' (answered)'); }
      out.push(`${String(i + 1).padStart(2)}. ${kind.padEnd(14)} ${m?.method || (m && 'id' in m ? 'id ' + JSON.stringify(m.id) : '')}${isObj(m) && isObj(m.result) && Array.isArray(m.result.tools) ? ` [${m.result.tools.length} tool(s): ${m.result.tools.map((t) => t?.name).join(', ')}]` : ''}  ${errs.length ? 'PROBLEMS' : 'ok'}`);
      errs.forEach((e) => out.push('      - ' + e));
    });
    const pending = [...ids].filter(([, v]) => !v.endsWith('(answered)')).map(([k, v]) => `id ${JSON.stringify(k)} (${v})`);
    if (msgs.length > 1 && pending.length) out.push('', 'Requests without a response in this capture: ' + pending.join(', '));
    return out.join('\n');
  },
});

const parseVecs = (s) => {
  s = s.trim();
  if (!s) return [];
  let rows;
  if (s.startsWith('[[')) rows = parseJ(s);
  else rows = s.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.replace(/[[\]]/g, '').trim().split(/[\s,;]+/).filter(Boolean).map(Number));
  rows.forEach((r, i) => { if (!Array.isArray(r) || !r.length || r.some((x) => typeof x !== 'number' || !Number.isFinite(x))) throw new Error(`Vector ${i + 1} contains a non-number`); });
  return rows;
};
const dotp = (a, b) => a.reduce((n, x, i) => n + x * b[i], 0);
T.push({
  id: 'embedding-similarity', cat: 'LLM Tools', title: 'Embedding Vector Similarity', desc: 'Compare embedding vectors you paste (JSON arrays or numbers, one vector per line): cosine similarity, dot product, Euclidean and Manhattan distance, plus a similarity matrix and best matches for several vectors. It does not create embeddings.',
  inputs: 2, labels: ['Vectors A (one per line)', 'Vectors B (optional; empty = compare A with itself)'], sample: '[0.12, -0.5, 0.33, 0.9]\n[0.1, 0.4, -0.2, 0.7]', sample2: '[0.11, -0.45, 0.30, 0.95]',
  opts: [num('dec', 'Decimals', 4)],
  run: ([a, b], o) => {
    const A = parseVecs(a), B0 = parseVecs(b), B = B0.length ? B0 : A, d = Math.min(15, Math.max(0, Number(o.dec) || 4)), f = (x) => x.toFixed(d);
    if (!A.length) throw new Error('Enter at least one vector in A');
    for (const v of [...A, ...B]) if (v.length !== A[0].length) throw new Error(`All vectors need the same dimension (${A[0].length}); found ${v.length}`);
    const norm = (v) => Math.sqrt(dotp(v, v)), cos = (x, y) => (norm(x) && norm(y) ? dotp(x, y) / (norm(x) * norm(y)) : NaN);
    const eu = (x, y) => Math.sqrt(x.reduce((n, v, i) => n + (v - y[i]) ** 2, 0)), mh = (x, y) => x.reduce((n, v, i) => n + Math.abs(v - y[i]), 0);
    if (A.length === 1 && B.length === 1 && B0.length) return `Dimensions: ${A[0].length}\nCosine similarity: ${f(cos(A[0], B[0]))}\nCosine distance:   ${f(1 - cos(A[0], B[0]))}\nDot product:       ${f(dotp(A[0], B[0]))}\nEuclidean (L2):    ${f(eu(A[0], B[0]))}\nManhattan (L1):    ${f(mh(A[0], B[0]))}\n|A| = ${f(norm(A[0]))}, |B| = ${f(norm(B[0]))}${Math.abs(norm(A[0]) - 1) < 1e-3 && Math.abs(norm(B[0]) - 1) < 1e-3 ? '\n(both unit length: dot product equals cosine)' : ''}`;
    const M = A.map((x) => B.map((y) => cos(x, y)));
    return `Cosine similarity matrix (rows = A${B0.length ? '' : ', cols = A'}, cols = B):\n` + M.map((r, i) => `A${i + 1}: ` + r.map(f).join('  ')).join('\n') + '\n\nBest match per row:\n' + M.map((r, i) => { const cand = r.map((v, j) => [v, j]).filter(([, j]) => B0.length || j !== i).sort((x, y) => y[0] - x[0])[0]; return `A${i + 1} -> ${cand ? `${B0.length ? 'B' : 'A'}${cand[1] + 1} (${f(cand[0])})` : 'n/a'}`; }).join('\n');
  },
});

const parseMsgs = (s) => {
  s = s.trim();
  const txtOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (typeof b === 'string' ? b : b?.text ?? b?.content ?? '')).join('\n') : c == null ? '' : String(c));
  const role = (r) => { r = String(r).toLowerCase(); return r === 'human' ? 'user' : r === 'ai' || r === 'model' || r === 'bot' ? 'assistant' : r; };
  if (s[0] === '[' || s[0] === '{') {
    const v = parseJ(s), out = [];
    if (Array.isArray(v)) return v.map((m) => (m.parts ? { role: role(m.role), content: m.parts.map((p) => p.text ?? '').join('') } : { role: role(m.role), content: txtOf(m.content) }));
    const sys = v.system ?? v.systemInstruction ?? v.system_instruction;
    if (sys) out.push({ role: 'system', content: typeof sys === 'object' && !Array.isArray(sys) && sys.parts ? sys.parts.map((p) => p.text).join('') : txtOf(sys) });
    for (const m of v.messages || v.contents || []) out.push(m.parts ? { role: role(m.role), content: m.parts.map((p) => p.text ?? '').join('') } : { role: role(m.role), content: txtOf(m.content) });
    if (!out.length) throw new Error('JSON object has no "messages"/"contents"/"system"');
    return out;
  }
  const out = [];
  for (const l of s.split(/\r?\n/)) {
    const m = /^(system|user|assistant|human|ai|model)\s*:\s?(.*)$/i.exec(l);
    if (m) out.push({ role: role(m[1]), content: m[2] }); else if (out.length) out[out.length - 1].content += '\n' + l; else if (l.trim()) out.push({ role: 'user', content: l });
  }
  return out.map((m) => ({ ...m, content: m.content.trim() }));
};
T.push({
  id: 'prompt-format-converter', cat: 'LLM Tools', title: 'Chat Prompt Format Converter', desc: 'Convert a conversation between OpenAI messages, Anthropic (system + messages), Gemini contents, ChatML, Llama 2, Llama 3, Mistral [INST] templates and a plain transcript. Input can be any of the JSON shapes or "System:/User:/Assistant:" lines. Special-token templates follow each family\'s published chat template; model-specific variants may differ slightly.',
  labels: ['Conversation'], sample: 'System: You are a terse assistant.\nUser: What is 2+2?\nAssistant: 4\nUser: And 3+3?',
  opts: [sel('to', 'Convert to', ['OpenAI messages', 'Anthropic', 'Gemini', 'ChatML', 'Llama 3', 'Llama 2', 'Mistral', 'Transcript']), chk('gen', 'Append generation prompt (open assistant turn)', true)],
  run: ([s], o) => {
    need(s, 'Paste a conversation');
    const m = parseMsgs(s), sys = m.filter((x) => x.role === 'system').map((x) => x.content).join('\n\n'), turns = m.filter((x) => x.role !== 'system');
    if (!m.length) throw new Error('No messages found');
    const J = (x) => JSON.stringify(x, null, 2);
    switch (o.to) {
      case 'OpenAI messages': return J(m);
      case 'Anthropic': return J({ ...(sys ? { system: sys } : {}), messages: turns.map((x) => ({ role: x.role, content: x.content })) });
      case 'Gemini': return J({ ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}), contents: turns.map((x) => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] })) });
      case 'ChatML': return m.map((x) => `<|im_start|>${x.role}\n${x.content}<|im_end|>\n`).join('') + (o.gen ? '<|im_start|>assistant\n' : '');
      case 'Llama 3': return '<|begin_of_text|>' + m.map((x) => `<|start_header_id|>${x.role}<|end_header_id|>\n\n${x.content}<|eot_id|>`).join('') + (o.gen ? '<|start_header_id|>assistant<|end_header_id|>\n\n' : '');
      case 'Llama 2': case 'Mistral': {
        const l2 = o.to === 'Llama 2'; let out = '', first = true;
        for (let i = 0; i < turns.length; i++) {
          const t = turns[i];
          if (t.role === 'user') { out += `${l2 || first ? '<s>' : ''}[INST] ${first && sys ? (l2 ? `<<SYS>>\n${sys}\n<</SYS>>\n\n` : sys + '\n\n') : ''}${t.content} [/INST]`; first = false; }
          else out += ` ${t.content}${l2 ? ' </s>' : '</s>'}`;
        }
        return out.trim();
      }
      default: return m.map((x) => `${x.role[0].toUpperCase() + x.role.slice(1)}: ${x.content}`).join('\n') + (o.gen ? '\nAssistant:' : '');
    }
  },
});

T.push({
  id: 'sampling-curve-visualizer', cat: 'LLM Tools', title: 'LLM Sampling Curve Visualizer', desc: 'See what temperature, top-k, top-p (nucleus) and min-p do to a next-token distribution. Paste token:logit lines (or just logits); the tool applies softmax and the filters in the common order temperature, top-k, top-p, min-p, and prints probabilities before and after as text bars plus entropy.',
  labels: ['Tokens with logits (token: logit, one per line, or comma separated numbers)'], sample: 'the: 4.1\na: 3.2\nthis: 2.9\ncat: 2.0\ndog: 1.8\nzebra: -0.5\nquantum: -2',
  opts: [num('temp', 'Temperature', 0.8), num('k', 'Top-k (0 = off)', 0), num('p', 'Top-p (1 = off)', 0.9), num('minp', 'Min-p (0 = off)', 0)],
  run: ([s], o) => {
    const items = s.includes('\n') || s.includes(':') ? s.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => { const m = /^(.*?)[:=\t]\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*$/i.exec(l.trim()); return m ? { t: m[1].trim() || 'tok' + i, l: Number(m[2]) } : { t: 'tok' + i, l: Number(l) }; }) : s.split(/[\s,]+/).filter(Boolean).map((x, i) => ({ t: 'tok' + i, l: Number(x) }));
    if (!items.length || items.some((x) => !Number.isFinite(x.l))) throw new Error('Could not parse logits (use "token: 1.5" lines)');
    const T0 = Number(o.temp);
    if (!(T0 >= 0)) throw new Error('Temperature must be >= 0');
    const soft = (ls, t) => { if (t === 0) { const mx = Math.max(...ls); const n = ls.filter((x) => x === mx).length; return ls.map((x) => (x === mx ? 1 / n : 0)); } const mx = Math.max(...ls), e = ls.map((x) => Math.exp((x - mx) / t)), z = e.reduce((a, b) => a + b, 0); return e.map((x) => x / z); };
    const base = soft(items.map((x) => x.l), 1), pr = soft(items.map((x) => x.l), T0);
    const order = items.map((_, i) => i).sort((a, b) => pr[b] - pr[a]), keep = new Set(order);
    const k = Number(o.k) | 0, p = Number(o.p), mp = Number(o.minp);
    if (k > 0) order.slice(k).forEach((i) => keep.delete(i));
    let cur = pr.map((x, i) => (keep.has(i) ? x : 0)), z = cur.reduce((a, b) => a + b, 0); cur = cur.map((x) => x / z);
    if (p > 0 && p < 1) { let c = 0; const nk = new Set(); for (const i of order) { if (!keep.has(i)) continue; nk.add(i); c += cur[i]; if (c >= p) break; } for (const i of [...keep]) if (!nk.has(i)) keep.delete(i); cur = cur.map((x, i) => (keep.has(i) ? x : 0)); z = cur.reduce((a, b) => a + b, 0); cur = cur.map((x) => x / z); }
    if (mp > 0) { const mx = Math.max(...cur); for (const i of [...keep]) if (cur[i] < mp * mx) keep.delete(i); cur = cur.map((x, i) => (keep.has(i) ? x : 0)); z = cur.reduce((a, b) => a + b, 0); cur = cur.map((x) => x / z); }
    const H = (ps) => -ps.reduce((a, x) => a + (x > 0 ? x * Math.log2(x) : 0), 0), bar = (x) => '#'.repeat(Math.round(x * 30)).padEnd(30, '.');
    const w = Math.max(...items.map((x) => x.t.length), 5);
    return [`${'token'.padEnd(w)}  logit    softmax(T=1)  after temperature  final (renormalised)`, ...order.map((i) => `${items[i].t.padEnd(w)}  ${items[i].l.toFixed(2).padStart(6)}   ${(base[i] * 100).toFixed(1).padStart(6)}%      ${(pr[i] * 100).toFixed(1).padStart(6)}%         ${keep.has(i) ? bar(cur[i]) + ' ' + (cur[i] * 100).toFixed(1) + '%' : 'filtered out'}`), '', `Tokens kept: ${keep.size}/${items.length}`, `Entropy: ${H(base).toFixed(3)} bits at T=1, ${H(pr).toFixed(3)} after temperature, ${H(cur).toFixed(3)} after filters`, `Order applied: temperature -> top-k -> top-p -> min-p (frameworks differ slightly in order and tie handling).`].join('\n');
  },
});

T.push({
  id: 'system-prompt-formatter', cat: 'LLM Tools', title: 'System Prompt Formatter', desc: 'Restructure a free-form system prompt into labelled sections (role, context, instructions, constraints, output format, examples) using XML tags or Markdown headings. Sections are detected from existing headings/tags or, failing that, by keyword heuristics per paragraph or bullet; review the result, it does not rewrite wording.',
  labels: ['System prompt'], sample: 'You are a support agent for Acme Cloud.\nThe customer is usually a developer on the free plan.\nAlways greet the customer by name.\nNever reveal internal ticket IDs.\nRespond in JSON with keys "answer" and "confidence".\nExample: {"answer":"Restart the pod","confidence":0.8}',
  opts: [sel('style', 'Style', ['XML tags', 'Markdown headings', 'Plain labels'])],
  run: ([s], o) => {
    need(s, 'Paste a system prompt');
    const ORDER = ['role', 'context', 'instructions', 'constraints', 'output_format', 'examples'], sec = Object.fromEntries(ORDER.map((k) => [k, []]));
    const alias = (h) => { h = h.toLowerCase().replace(/[^a-z ]/g, '').trim(); return /^(role|persona|identity)/.test(h) ? 'role' : /^(context|background|about)/.test(h) ? 'context' : /^(instructions?|task|steps|guidelines|rules to follow)/.test(h) ? 'instructions' : /^(constraints?|rules|restrictions|limits|dos and donts|dont)/.test(h) ? 'constraints' : /^(output|format|response)/.test(h) ? 'output_format' : /^examples?/.test(h) ? 'examples' : null; };
    const classify = (l) => {
      const t = l.toLowerCase();
      if (/^(you are|act as|your role|you will act)/.test(t)) return 'role';
      if (/^(example|e\.g\.|input:|output:|user:|assistant:|<example)/.test(t)) return 'examples';
      if (/\b(json|markdown|format|respond in|reply in|output|schema|bullet|word limit|at most \d+|no more than \d+|length|language of)\b/.test(t) && !/\b(never|do not|don't)\b/.test(t)) return 'output_format';
      if (/\b(never|do not|don't|must not|avoid|only|forbidden|prohibited|cannot|should not|refuse|not allowed)\b/.test(t)) return 'constraints';
      if (/\b(context|background|audience|customer|the user is|users? (are|is)|company|product|we are|our )\b/.test(t) && !/^(always|please|make sure)/.test(t)) return 'context';
      return 'instructions';
    };
    let cur = null;
    for (const raw of s.split(/\r?\n/)) {
      const l = raw.trim();
      if (!l) continue;
      const h = /^<(\w+)>$/.exec(l) || /^#{1,4}\s*(.+?)\s*$/.exec(l) || /^([A-Za-z ]{3,24}):\s*$/.exec(l);
      if (h && alias(h[1])) { cur = alias(h[1]); continue; }
      if (/^<\/\w+>$/.test(l)) { cur = null; continue; }
      sec[cur || classify(l.replace(/^[-*\d.)\s]+/, ''))].push(l.replace(/^[-*]\s+/, ''));
    }
    const used = ORDER.filter((k) => sec[k].length), title = (k) => k.replace('_', ' ').replace(/^./, (c) => c.toUpperCase());
    const bullets = (k, a) => (['instructions', 'constraints'].includes(k) && a.length > 1 ? a.map((x) => '- ' + x.replace(/^\d+[.)]\s*/, '')).join('\n') : a.join('\n'));
    return used.map((k) => (o.style === 'XML tags' ? `<${k}>\n${bullets(k, sec[k])}\n</${k}>` : o.style === 'Markdown headings' ? `## ${title(k)}\n\n${bullets(k, sec[k])}` : `${title(k).toUpperCase()}:\n${bullets(k, sec[k])}`)).join('\n\n');
  },
});

export default T;

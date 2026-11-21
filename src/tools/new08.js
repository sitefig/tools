// Tools from free-browser-tools.md, batch 08 (JSON, YAML, XML, CSV and data converters). See TOOLS.md for the contract.
// Skipped on purpose: live currency rates (needs a network call; the manual-rates converter already exists).
// Honest limits: the XSD validator checks a documented subset of XSD 1.0 and ignores namespaces; the XSLT page uses the
// browser's own XSLT 1.0 engine; the YAML duplicate-key check is a line scan. Each page says so.
// Reuses the parsers of data.js (YAML, TOML, JSON to YAML) and devz1.js (SQL INSERT) by calling their tools, not by copying them.
import data from './data.js';
import devz1 from './devz1.js';

const T = [];
const get = (list, id) => { const t = list.find((x) => x.id === id); if (!t) throw new Error('Internal error: missing tool ' + id); return t; };
const need = (t, n = 'input') => { if (!String(t ?? '').trim()) throw new Error(`Paste ${n} first.`); return String(t); };
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const num = (id, label, def) => ({ id, label, type: 'number', def });
const chk = (id, label, def) => ({ id, label, type: 'checkbox', def });
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });

// ---------- CSV core ----------
const DELIMS = { comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
function parseCsv(text, d) {
  const rows = []; let row = [], f = '', q = false, i = 0, any = false;
  const s = String(text).replace(/^\uFEFF/, '');
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"' && f === '') { q = true; any = true; }
    else if (c === d) { row.push(f); f = ''; any = true; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; any = false; }
    else { f += c; any = true; }
  }
  if (q) throw new Error('A quoted field is never closed.');
  if (any || f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
function detectDelim(text) {
  const first = String(text).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).find((l) => l.trim()) || '';
  let best = ',', bn = 0;
  for (const d of [',', ';', '\t', '|']) {
    let n = 0, q = false;
    for (const c of first) { if (c === '"') q = !q; else if (c === d && !q) n++; }
    if (n > bn) { bn = n; best = d; }
  }
  return best;
}
const delimFor = (choice, text) => (choice === 'auto' ? detectDelim(text) : DELIMS[choice]);
const csvField = (v, d, all) => { v = String(v ?? ''); return all || v.includes(d) || /["\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const writeCsv = (rows, d, all = false, eol = '\n') => rows.map((r) => r.map((v) => csvField(v, d, all)).join(d)).join(eol);

tool({
  id: 'csv-delimiter-converter', cat: 'CSV', title: 'CSV Delimiter Converter (Comma, Semicolon, Tab, Pipe)',
  desc: 'Switch a CSV between comma, semicolon, tab and pipe delimiters. Quoted fields are parsed and re-quoted correctly, and the input delimiter can be detected.',
  labels: ['CSV or delimited text'], sample: 'name;city;note\nAda;London;"likes ; and, commas"\nLinus;Helsinki;"line one\nline two"\nGrace;"New York";say "hi"',
  opts: [sel('from', 'Input delimiter', ['auto', 'comma', 'semicolon', 'tab', 'pipe']), sel('to', 'Output delimiter', ['comma', 'semicolon', 'tab', 'pipe']), chk('all', 'Quote every field', false), sel('eol', 'Line ending', ['LF', 'CRLF'])],
  run: ([t], o) => {
    need(t, 'CSV');
    const from = delimFor(o.from, t), rows = parseCsv(t, from);
    if (!rows.length) throw new Error('No rows found.');
    const to = DELIMS[o.to], cols = new Set(rows.map((r) => r.length));
    const out = writeCsv(rows, to, o.all, o.eol === 'CRLF' ? '\r\n' : '\n');
    return out;
  },
});

tool({
  id: 'csv-deduplicator', cat: 'CSV', title: 'CSV Deduplicator (Remove Duplicate Rows by Key Columns)',
  desc: 'Remove duplicate rows from a CSV by one or more key columns, keep the first or last match, ignore case or spaces, and list what was removed.',
  labels: ['CSV'], sample: 'email,name,plan\nada@example.com,Ada,pro\nlinus@example.com,Linus,free\nADA@example.com ,Ada L.,team\ngrace@example.com,Grace,pro\nlinus@example.com,Linus,free',
  opts: [txt('keys', 'Key columns (names or 1-based numbers, comma separated; empty = whole row)', 'email'), sel('keep', 'Keep', ['first', 'last']), chk('ci', 'Ignore case', true), chk('trim', 'Trim spaces before comparing', true), chk('header', 'First row is a header', true), sel('delim', 'Delimiter', ['auto', 'comma', 'semicolon', 'tab', 'pipe']), sel('out', 'Output', ['cleaned CSV', 'removed rows', 'duplicate groups'])],
  run: ([t], o) => {
    need(t, 'CSV');
    const d = delimFor(o.delim, t), rows = parseCsv(t, d);
    if (!rows.length) throw new Error('No rows found.');
    const head = o.header ? rows[0] : null, body = o.header ? rows.slice(1) : rows;
    const width = Math.max(...rows.map((r) => r.length));
    let idx = [];
    for (const k of String(o.keys || '').split(',').map((s) => s.trim()).filter(Boolean)) {
      let i = /^\d+$/.test(k) ? +k - 1 : -1;
      if (i < 0 && head) { i = head.findIndex((h) => h.trim() === k); if (i < 0) i = head.findIndex((h) => h.trim().toLowerCase() === k.toLowerCase()); }
      if (i < 0 || i >= width) throw new Error(`Column "${k}" was not found.`);
      idx.push(i);
    }
    const norm = (v) => { v = v ?? ''; if (o.trim) v = v.trim(); return o.ci ? v.toLowerCase() : v; };
    const keyOf = (r) => JSON.stringify((idx.length ? idx.map((i) => r[i]) : r).map(norm));
    const groups = new Map();
    body.forEach((r, n) => { const k = keyOf(r); (groups.get(k) || groups.set(k, []).get(k)).push(n); });
    const keepIdx = new Set([...groups.values()].map((g) => (o.keep === 'first' ? g[0] : g[g.length - 1])));
    const kept = body.filter((_, n) => keepIdx.has(n)), removed = body.filter((_, n) => !keepIdx.has(n));
    const wrap = (b) => writeCsv(head ? [head, ...b] : b, d);
    if (o.out === 'cleaned CSV') return wrap(kept);
    if (o.out === 'removed rows') return removed.length ? wrap(removed) : 'No duplicates found.';
    const dup = [...groups.values()].filter((g) => g.length > 1);
    if (!dup.length) return 'No duplicates found.';
    return dup.map((g) => `${g.length} rows share the key ${JSON.stringify(idx.length ? idx.map((i) => body[g[0]][i]) : body[g[0]])}: data rows ${g.map((n) => n + 1).join(', ')}`).join('\n');
  },
});

// ---------- NDJSON viewer ----------
const flat = (v, p, out) => {
  if (v && typeof v === 'object') { const ks = Object.keys(v); if (!ks.length) out[p || 'value'] = Array.isArray(v) ? '[]' : '{}'; for (const k of ks) flat(v[k], p ? p + '.' + k : k, out); } else out[p || 'value'] = v;
  return out;
};
const cell = (v) => (v === undefined ? '' : v === null ? 'null' : String(v));
tool({
  id: 'ndjson-viewer', cat: 'JSON', title: 'NDJSON / JSON Lines Viewer (Table, Sort, CSV)',
  desc: 'Read newline-delimited JSON as a table. Keys become columns (nested keys use dot paths), rows can be sorted, and bad lines are reported with their line number.',
  labels: ['NDJSON / JSONL (one JSON value per line)'],
  sample: '{"id":3,"user":{"name":"Grace","plan":"pro"},"ms":120}\n{"id":1,"user":{"name":"Ada","plan":"free"},"ms":45,"tags":["a","b"]}\n{"id":2,"user":{"name":"Linus","plan":"pro"},"ms":9}\nnot json\n{"id":4,"user":{"name":"Alan","plan":"free"},"ms":300}',
  opts: [txt('cols', 'Columns (comma separated; empty = all)', ''), txt('sort', 'Sort by column', 'ms'), chk('desc', 'Descending', true), sel('fmt', 'Output', ['table', 'CSV', 'TSV']), num('width', 'Max cell width (table)', 40)],
  run: ([t], o) => {
    need(t, 'NDJSON');
    const rows = [], bad = [];
    String(t).split(/\r\n|\r|\n/).forEach((l, i) => {
      if (!l.trim()) return;
      try { rows.push(flat(JSON.parse(l), '', {})); } catch (e) { bad.push(`line ${i + 1}: ${e.message.slice(0, 80)}`); }
    });
    if (!rows.length) throw new Error('No valid JSON lines found.' + (bad[0] ? ' First problem: ' + bad[0] : ''));
    let cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const want = String(o.cols || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (want.length) { const miss = want.filter((c) => !cols.includes(c)); if (miss.length) throw new Error('Unknown column: ' + miss.join(', ')); cols = want; }
    const sk = String(o.sort || '').trim();
    if (sk) {
      if (!cols.includes(sk)) throw new Error(`Cannot sort by "${sk}": no such column.`);
      const dir = o.desc ? -1 : 1;
      rows.sort((a, b) => {
        const x = a[sk], y = b[sk];
        if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1;
        const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        return r * dir;
      });
    }
    if (o.fmt !== 'table') {
      if (bad.length) throw new Error('Cannot write ' + o.fmt + ' while some lines are invalid: ' + bad.slice(0, 3).join('; '));
      return writeCsv([cols, ...rows.map((r) => cols.map((c) => cell(r[c])))], o.fmt === 'CSV' ? ',' : '\t');
    }
    const w = Math.max(5, +o.width || 40), cut = (s) => (s.length > w ? s.slice(0, w - 1) + '…' : s);
    const table = [cols, ...rows.map((r) => cols.map((c) => cut(cell(r[c]).replace(/\s+/g, ' '))))];
    const wid = cols.map((_, i) => Math.max(...table.map((r) => r[i].length)));
    const lines = table.map((r) => r.map((c, i) => c.padEnd(wid[i])).join('  ').trimEnd());
    lines.splice(1, 0, wid.map((n) => '-'.repeat(n)).join('  '));
    let out = lines.join('\n') + `\n\n${rows.length} row(s), ${cols.length} column(s)` + (sk ? `, sorted by ${sk} ${o.desc ? 'descending' : 'ascending'}` : '');
    if (bad.length) out += `\n${bad.length} line(s) skipped:\n  ` + bad.slice(0, 20).join('\n  ');
    return out;
  },
});

// ---------- YAML validator ----------
tool({
  id: 'yaml-validator', cat: 'YAML & TOML', title: 'YAML Validator (Syntax, Duplicate Keys, Tabs)',
  desc: 'Check YAML for syntax and indentation errors with line numbers, plus a review list for tabs used as indentation and duplicate keys in the same mapping.',
  labels: ['YAML'], sample: 'service:\n  name: api\n  port: 8080\n  port: 9090\n  env:\n    - key: A\n      value: "1"\n    - key: B\n      key: C\n',
  opts: [],
  run: ([t]) => {
    need(t, 'YAML');
    const lines = t.split(/\r\n|\r|\n/), review = [];
    let parsed;
    try { parsed = JSON.parse(get(data, 'yaml-to-json').run([t], { indent: 0 })); } catch (e) { return `Invalid YAML\n${e.message}`; }
    // line scan: tabs and duplicate keys
    const stack = []; let blockIndent = -1;
    lines.forEach((raw, i) => {
      const n = i + 1;
      if (/^ *\t/.test(raw) && raw.trim()) review.push(`line ${n}: tab used for indentation (YAML only allows spaces)`);
      if (/^(---|\.\.\.)(\s|$)/.test(raw)) { stack.length = 0; blockIndent = -1; return; }
      if (!raw.trim() || /^\s*#/.test(raw)) return;
      let ind = raw.match(/^ */)[0].length;
      if (blockIndent >= 0) { if (ind > blockIndent) return; blockIndent = -1; }
      let s = raw.slice(ind), fresh = false;
      while (/^-(\s+|$)/.test(s)) { const m = s.match(/^-\s*/)[0]; ind += m.length; s = s.slice(m.length); fresh = true; }
      if (fresh) { while (stack.length && stack[stack.length - 1].ind >= ind) stack.pop(); stack.push({ ind, keys: new Set() }); } else {
        while (stack.length && stack[stack.length - 1].ind > ind) stack.pop();
        if (!stack.length || stack[stack.length - 1].ind < ind) stack.push({ ind, keys: new Set() });
      }
      const m = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#'"[{&*!|>%@`-][^#]*?|-[^\s#][^#]*?)\s*:(\s|$)/.exec(s);
      if (!m) return;
      let key = m[1]; if (/^["']/.test(key)) key = key.slice(1, -1);
      const top = stack[stack.length - 1];
      if (top.keys.has(key)) review.push(`line ${n}: key "${key}" appears twice in the same mapping (the last value usually wins)`);
      top.keys.add(key);
      if (/(^|\s)[|>][-+0-9]*\s*(#.*)?$/.test(s.slice(m[0].length - 1))) blockIndent = ind;
    });
    const docs = lines.filter((l) => /^---(\s|$)/.test(l)).length;
    const kind = Array.isArray(parsed) ? `list of ${parsed.length}` : parsed && typeof parsed === 'object' ? `mapping with ${Object.keys(parsed).length} top-level key(s)` : typeof parsed;
    let out = `Valid YAML syntax\nTop level: ${kind}${docs > 1 ? ` (${docs} documents separated by ---)` : ''}`;
    out += review.length ? `\n\nReview (${review.length}):\n  ` + review.join('\n  ') : '\n\nNo tabs or duplicate keys found by the line scan.';
    return out + '\n\nSyntax is checked by this site\'s own YAML parser, which covers common YAML 1.2 but not every corner (complex keys, some tags). The duplicate-key scan is a line scan and skips flow style {a: 1, a: 2}. Treat the review list as hints.';
  },
});

// ---------- TOML to YAML ----------
tool({
  id: 'toml-to-yaml', cat: 'YAML & TOML', title: 'TOML to YAML Converter (Cargo.toml, pyproject.toml)',
  desc: 'Validate TOML and convert it to YAML. Tables, arrays of tables, inline tables and dotted keys are handled, and syntax errors name the line.',
  labels: ['TOML'], sample: '[package]\nname = "demo"\nversion = "0.3.1"\nedition = "2021"\n\n[dependencies]\nserde = { version = "1", features = ["derive"] }\nrand = "0.8"\n\n[[bin]]\nname = "cli"\npath = "src/main.rs"\n\n[[bin]]\nname = "srv"\npath = "src/srv.rs"\n',
  opts: [sel('indent', 'Indent', ['2', '4'])],
  run: ([t], o) => {
    need(t, 'TOML');
    const json = get(data, 'toml-to-json').run([t], { indent: 0 });
    return get(data, 'json-to-yaml').run([json], { indent: o.indent });
  },
});

// ---------- SQL INSERT to CSV ----------
const csvVal = (v, nullAs) => (v === null ? nullAs : typeof v === 'object' ? JSON.stringify(v) : String(v));
tool({
  id: 'sql-insert-to-csv', cat: 'SQL & Data', title: 'SQL INSERT to CSV Converter',
  desc: 'Parse INSERT ... VALUES statements into CSV. Column names become the header, multi-row inserts become rows, and NULL can be written as empty or as the word NULL.',
  labels: ['SQL (INSERT statements, optional CREATE TABLE)'],
  sample: "CREATE TABLE users (id INT, name TEXT, email TEXT, active BOOLEAN);\nINSERT INTO users (id, name, email, active) VALUES\n  (1, 'Ada O''Neil', 'ada@example.com', TRUE),\n  (2, 'Linus, Jr.', NULL, FALSE);\nINSERT INTO orders (id, user_id, total) VALUES (10, 1, 19.90), (11, 2, 5);",
  opts: [txt('table', 'Table (empty = first table with rows)', ''), sel('delim', 'Delimiter', ['comma', 'semicolon', 'tab', 'pipe']), sel('nulls', 'NULL becomes', ['empty', 'NULL'])],
  run: ([t], o) => {
    need(t, 'SQL');
    const json = JSON.parse(get(devz1, 'sql-to-json').run([t], { shape: 'object per table', indent: 0 }));
    const names = Object.keys(json).filter((k) => json[k].length);
    if (!names.length) throw new Error('No rows found in the INSERT statements.');
    const want = String(o.table || '').trim().replace(/^["`\[]|["`\]]$/g, '');
    const name = want ? names.find((n) => n.toLowerCase() === want.toLowerCase()) : names[0];
    if (!name) throw new Error(`Table "${want}" has no rows. Tables with rows: ${names.join(', ')}`);
    const rows = json[name], cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const nullAs = o.nulls === 'NULL' ? 'NULL' : '';
    const out = writeCsv([cols, ...rows.map((r) => cols.map((c) => (r[c] === undefined ? '' : csvVal(r[c], nullAs))))], DELIMS[o.delim]);
    return out;
  },
});

// ---------- .properties to YAML ----------
function parseProps(src) {
  const out = [], lines = src.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i].replace(/^[ \t\f]+/, '');
    if (!l || l[0] === '#' || l[0] === '!') continue;
    while (/(^|[^\\])(\\\\)*\\$/.test(l) && i + 1 < lines.length) l = l.slice(0, -1) + lines[++i].replace(/^[ \t\f]+/, '');
    let k = '', j = 0;
    for (; j < l.length; j++) {
      const c = l[j];
      if (c === '\\') { k += l[j] + (l[j + 1] ?? ''); j++; continue; }
      if (c === '=' || c === ':' || c === ' ' || c === '\t' || c === '\f') break;
      k += c;
    }
    let rest = l.slice(j).replace(/^[ \t\f]*/, '');
    if (/^[=:]/.test(rest)) rest = rest.slice(1).replace(/^[ \t\f]*/, '');
    out.push([unesc(k), unesc(rest), i + 1]);
  }
  return out;
}
function unesc(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|[\s\S])/g, (_, c) => (c[0] === 'u' && c.length === 5 ? String.fromCharCode(parseInt(c.slice(1), 16)) : c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c === 'f' ? '\f' : c));
}
const guess = (v) => (v === 'true' ? true : v === 'false' ? false : /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v) && String(+v) === v ? +v : v);
function nest(pairs, typed) {
  const root = {};
  for (const [key, val, ln] of pairs) {
    const parts = []; key.replace(/([^.[\]]+)|\[(\d+)\]/g, (_, a, b) => { parts.push(a !== undefined ? a : +b); });
    if (!parts.length) throw new Error(`Line ${ln}: empty key.`);
    let cur = root;
    parts.forEach((p, i) => {
      const last = i === parts.length - 1, nextIsIdx = typeof parts[i + 1] === 'number';
      if (last) { if (cur[p] !== undefined && typeof cur[p] === 'object') throw new Error(`Line ${ln}: "${key}" is both a value and a parent of other keys.`); cur[p] = typed ? guess(val) : val; return; }
      if (cur[p] === undefined) cur[p] = nextIsIdx ? [] : {};
      else if (typeof cur[p] !== 'object') throw new Error(`Line ${ln}: "${parts.slice(0, i + 1).join('.')}" is already a plain value, so "${key}" cannot nest under it.`);
      cur = cur[p];
    });
  }
  const fix = (v) => (Array.isArray(v) ? v.filter((x) => x !== undefined).map(fix) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)])) : v);
  return fix(root);
}
const flatProps = (v, p, out) => {
  if (Array.isArray(v)) v.forEach((x, i) => flatProps(x, `${p}[${i}]`, out));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) flatProps(v[k], p ? p + '.' + k : k, out);
  else out.push([p, v === null ? '' : String(v)]);
  return out;
};
const escProp = (s, key) => {
  let r = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  if (key) r = r.replace(/([=: #!])/g, '\\$1'); else r = r.replace(/^ /, '\\ ');
  return r;
};
tool({
  id: 'properties-to-yaml', cat: 'YAML & TOML', title: 'Java .properties to YAML Converter (Spring application.properties)',
  desc: 'Convert Java .properties files to nested YAML (dotted keys become maps, a[0] becomes lists), or turn YAML into .properties lines. Escapes and line continuations are handled.',
  labels: ['.properties text (or YAML / JSON for the other direction)'],
  sample: '# Spring Boot settings\nspring.datasource.url=jdbc:postgresql://localhost:5432/app\nspring.datasource.username = app\nspring.datasource.password: s3cr\\u00e9t\nserver.port=8080\nserver.ssl.enabled=true\nmy.servers[0].host=a.example.com\nmy.servers[1].host=b.example.com\nmessage=Hello, \\\n    world!\n',
  opts: [sel('dir', 'Direction', ['properties to YAML', 'YAML or JSON to properties']), chk('typed', 'Turn numbers and true/false into YAML types', true), sel('indent', 'Indent', ['2', '4'])],
  run: ([t], o) => {
    need(t, 'input');
    if (o.dir === 'properties to YAML') {
      const pairs = parseProps(t);
      if (!pairs.length) throw new Error('No key=value lines found.');
      return get(data, 'json-to-yaml').run([JSON.stringify(nest(pairs, o.typed))], { indent: o.indent });
    }
    let v;
    try { v = JSON.parse(t); } catch { v = JSON.parse(get(data, 'yaml-to-json').run([t], { indent: 0 })); }
    return flatProps(v, '', []).map(([k, x]) => `${escProp(k, true)}=${escProp(x, false)}`).join('\n');
  },
});

// ---------- Endianness swapper ----------
tool({
  id: 'endianness-swapper', cat: 'Converters+', title: 'Endianness Swapper (Big and Little Endian Byte Order)',
  desc: 'Reverse the byte order of a hex value or a stream of 2, 4, 8 or 16-byte words, and read the same bytes as big-endian and little-endian numbers.',
  labels: ['Hex bytes'], sample: '0x12345678',
  opts: [sel('w', 'Word size', ['whole value', '2 bytes', '4 bytes', '8 bytes', '16 bytes']), chk('spaces', 'Space between bytes', true)],
  run: ([t], o) => {
    let h = need(t, 'hex bytes').replace(/0x|\\x|[\s,:_-]/gi, '');
    if (!/^[0-9a-f]*$/i.test(h)) throw new Error('Only hex digits (0-9, a-f) are allowed.');
    if (!h) throw new Error('Paste hex bytes first.');
    if (h.length % 2) throw new Error(`Odd number of hex digits (${h.length}). Add a leading 0 so every byte has two digits.`);
    const bytes = h.match(/../g), n = bytes.length, w = o.w === 'whole value' ? n : parseInt(o.w);
    if (n % w) throw new Error(`${n} byte(s) is not a multiple of ${w}. Add or remove bytes.`);
    const words = []; for (let i = 0; i < n; i += w) words.push(bytes.slice(i, i + w));
    const sw = words.map((x) => [...x].reverse());
    const show = (ws) => ws.map((x) => x.join(o.spaces ? ' ' : '')).join(o.spaces ? '  ' : ' ').toUpperCase();
    const big = (x) => BigInt('0x' + x.join(''));
    let out = `Input:   ${show(words)}\nSwapped: ${show(sw)}\n`;
    words.forEach((x, i) => {
      const be = big(x), le = big(sw[i]);
      out += `\nWord ${i + 1} (${w} byte${w > 1 ? 's' : ''})\n  read as big-endian:    ${be} (0x${be.toString(16).toUpperCase().padStart(w * 2, '0')})\n  read as little-endian: ${le} (0x${le.toString(16).toUpperCase().padStart(w * 2, '0')})\n`;
    });
    if (words.length > 40) out = out.split('\n').slice(0, 2).join('\n') + `\n\n${words.length} words; per-word values omitted.`;
    return out.trimEnd();
  },
});

// ---------- ISO 8601 parser ----------
const pad = (n, w = 2) => String(n).padStart(w, '0');
const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dim = (y, m) => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const utc = (y, m, d, hh = 0, mm = 0, ss = 0, ms = 0) => { const x = new Date(0); x.setUTCFullYear(y, m - 1, d); x.setUTCHours(hh, mm, ss, ms); return x; };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isoWeek = (y, m, d) => {
  const dt = utc(y, m, d), dow = (dt.getUTCDay() + 6) % 7, th = new Date(dt); th.setUTCDate(dt.getUTCDate() - dow + 3);
  const wy = th.getUTCFullYear(), j4 = utc(wy, 1, 4), w1 = new Date(j4); w1.setUTCDate(j4.getUTCDate() - ((j4.getUTCDay() + 6) % 7));
  return [wy, Math.round((th - w1) / 6048e5) + 1];
};
const weeksIn = (y) => isoWeek(y, 12, 28)[1];
function parseDatePart(s) {
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) || /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return { y: +m[1], m: +m[2], d: +m[3], form: 'calendar date' };
  if ((m = /^(\d{4})-(\d{2})$/.exec(s))) return { y: +m[1], m: +m[2], d: null, form: 'year and month' };
  if ((m = /^(\d{4})$/.exec(s))) return { y: +m[1], m: null, d: null, form: 'year' };
  if ((m = /^(\d{4})-?(\d{3})$/.exec(s))) return { y: +m[1], ord: +m[2], form: 'ordinal date' };
  if ((m = /^(\d{4})-?W(\d{2})(?:-?([1-7]))?$/.exec(s))) return { y: +m[1], wk: +m[2], wd: m[3] ? +m[3] : null, form: 'week date' };
  return null;
}
function parseTimePart(s) {
  const m = /^(\d{2})(?::?(\d{2})(?::?(\d{2})(?:[.,](\d+))?)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(s);
  if (!m) return null;
  let off = null;
  if (m[5]) { off = m[5] === 'Z' ? 0 : (m[5][0] === '-' ? -1 : 1) * (+m[5].slice(1, 3) * 60 + +(m[5].slice(3).replace(':', '') || 0)); }
  return { hh: +m[1], mi: m[2] === undefined ? null : +m[2], ss: m[3] === undefined ? null : +m[3], frac: m[4] || '', off, offText: m[5] || '' };
}
const durRe = /^P(?!$)(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?=\d)(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/;
const fmtOff = (m) => (m === 0 ? 'Z (UTC)' : (m < 0 ? '-' : '+') + pad(Math.floor(Math.abs(m) / 60)) + ':' + pad(Math.abs(m) % 60));
function describeDate(s) {
  const L = [];
  let dp = parseDatePart(s.date), tp = s.time == null ? null : parseTimePart(s.time);
  if (!dp) return { err: 'not a recognised ISO 8601 date (try 2026-03-01, 2026-W09-7, 2026-060, 20260301)' };
  if (s.time != null && !tp) return { err: `time part "${s.time}" is not valid (try 10:00:00Z or 10:00:00+02:00)` };
  const probs = [];
  if (dp.ord) { if (dp.ord < 1 || dp.ord > (leap(dp.y) ? 366 : 365)) probs.push(`day of year ${dp.ord} is out of range for ${dp.y} (1 to ${leap(dp.y) ? 366 : 365})`); else { const x = utc(dp.y, 1, dp.ord); dp.m = x.getUTCMonth() + 1; dp.d = x.getUTCDate(); } }
  if (dp.wk) {
    if (dp.wk < 1 || dp.wk > weeksIn(dp.y)) probs.push(`week ${dp.wk} does not exist in ${dp.y} (it has ${weeksIn(dp.y)} ISO weeks)`);
    else { const j4 = utc(dp.y, 1, 4), mon = new Date(j4); mon.setUTCDate(j4.getUTCDate() - ((j4.getUTCDay() + 6) % 7) + (dp.wk - 1) * 7 + ((dp.wd || 1) - 1)); dp.cy = mon.getUTCFullYear(); dp.m = mon.getUTCMonth() + 1; dp.d = mon.getUTCDate(); }
  }
  const cy = dp.cy || dp.y;
  if (dp.m !== null && dp.m !== undefined && (dp.m < 1 || dp.m > 12)) probs.push(`month ${dp.m} is out of range (1 to 12)`);
  else if (dp.d !== null && dp.d !== undefined && !dp.ord && !dp.wk && (dp.d < 1 || dp.d > dim(dp.y, dp.m))) probs.push(`day ${dp.d} is out of range for ${dp.y}-${pad(dp.m)} (1 to ${dim(dp.y, dp.m)})`);
  if (tp) {
    const end24 = tp.hh === 24 && !tp.mi && !tp.ss && !/[1-9]/.test(tp.frac);
    if (tp.hh > 23 && !end24) probs.push(`hour ${tp.hh} is out of range (0 to 23, or 24:00:00 for end of day)`);
    if (tp.mi > 59) probs.push(`minute ${tp.mi} is out of range`);
    if (tp.ss > 60) probs.push(`second ${tp.ss} is out of range`);
    if (tp.ss === 60) L.push('note: second 60 is a leap second; JavaScript dates roll it into the next minute');
    if (tp.off !== null && Math.abs(tp.off) > 14 * 60) probs.push('UTC offset is beyond +/-14:00');
  }
  if (probs.length) return { err: probs.join('; ') };
  L.unshift(`Kind: ${s.time != null ? 'date and time' : dp.form}${s.time != null ? ` (${dp.form})` : ''}`);
  L.push(`Year: ${cy}${leap(cy) ? ' (leap year)' : ''}`);
  if (dp.m != null && dp.d != null) {
    const dt = utc(cy, dp.m, dp.d), yday = Math.round((dt - utc(cy, 1, 1)) / 864e5) + 1, [wy, wn] = isoWeek(cy, dp.m, dp.d);
    L.push(`Month: ${dp.m}`, `Day: ${dp.d}`, `Weekday: ${DAYS[dt.getUTCDay()]}`, `Day of year: ${yday}`, `ISO week: ${wy}-W${pad(wn)}-${((dt.getUTCDay() + 6) % 7) + 1}`);
  } else if (dp.m != null) L.push(`Month: ${dp.m}`);
  if (tp) {
    L.push(`Hour: ${tp.hh}`); if (tp.mi != null) L.push(`Minute: ${tp.mi}`); if (tp.ss != null) L.push(`Second: ${tp.ss}`); if (tp.frac) L.push(`Fraction: .${tp.frac}`);
    L.push(tp.off === null ? 'UTC offset: none given (local time of an unspecified zone)' : `UTC offset: ${fmtOff(tp.off)}`);
    if (dp.m != null && dp.d != null) {
      let ms = utc(cy, dp.m, dp.d, tp.hh, tp.mi || 0, Math.min(tp.ss || 0, 59), tp.frac ? Math.round(+('0.' + tp.frac) * 1000) : 0).getTime() - (tp.off || 0) * 6e4;
      if (tp.ss === 60) ms += 1000;
      L.push(`${tp.off === null ? 'If read as UTC' : 'UTC'}: ${new Date(ms).toISOString()}`, `Unix seconds: ${Math.floor(ms / 1000)}`, `Unix milliseconds: ${ms}`);
    }
  }
  return { lines: L };
}
function describeDuration(s) {
  const m = durRe.exec(s);
  if (!m) return null;
  const v = m.slice(1).map((x) => (x === undefined ? 0 : +x.replace(',', '.'))), [Y, M, W, D, H, Mi, S] = v;
  const names = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds'];
  const L = ['Kind: duration', 'Parts: ' + v.map((x, i) => (x ? `${x} ${names[i]}` : '')).filter(Boolean).join(', ')];
  const exact = D * 864e2 + W * 6048e2 + H * 3600 + Mi * 60 + S;
  if (!Y && !M) L.push(`Total: ${exact} seconds (days counted as 24 hours)`);
  else L.push(`Approximate total: ${Math.round(Y * 31556952 + M * 2629746 + exact)} seconds (a year is taken as 365.2425 days, a month as 30.436875 days; the real length depends on the start date)`);
  const last = v.reduce((a, x, i) => (x ? i : a), -1);
  if (v.some((x, i) => x % 1 && i !== last)) L.push('note: a decimal fraction is normally only allowed on the last (smallest) unit');
  return { lines: L, parts: { Y, M, W, D, H, Mi, S } };
}
function parseOne(s) {
  s = s.trim();
  if (!s) return null;
  const dur = describeDuration(s); if (dur) return dur;
  if (/^P/i.test(s) && !/\//.test(s)) return { err: 'not a valid duration (format PnYnMnDTnHnMnS or PnW; at least one number, and T before time parts)' };
  let m = /^(\d{4}(?:-?\d{2}(?:-?\d{2})?)?|\d{4}-?\d{3}|\d{4}-?W\d{2}(?:-?[1-7])?)(?:[T ](.+))?$/.exec(s);
  if (m && !/^\d{6}$/.test(m[1])) { const r = describeDate({ date: m[1], time: m[2] ?? null }); if (m[2] && s[m[1].length] === ' ') (r.lines || []).push('note: a space instead of T is accepted by RFC 3339, not by ISO 8601 itself'); return r; }
  if ((m = /^T?(\d{2}(?::?\d{2}(?::?\d{2}(?:[.,]\d+)?)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)$/.exec(s)) && parseTimePart(m[1])) {
    const tp = parseTimePart(m[1]), L = ['Kind: time of day', `Hour: ${tp.hh}`];
    if (tp.mi != null) L.push(`Minute: ${tp.mi}`); if (tp.ss != null) L.push(`Second: ${tp.ss}`); if (tp.frac) L.push(`Fraction: .${tp.frac}`);
    L.push(tp.off === null ? 'UTC offset: none given' : `UTC offset: ${fmtOff(tp.off)}`);
    return (tp.hh > 24 || tp.mi > 59 || tp.ss > 60) ? { err: 'time value out of range' } : { lines: L };
  }
  return { err: 'not recognised. Examples: 2026-03-01, 2026-03-01T10:00:00+01:00, 2026-W09-7, 2026-060, PT1H30M, 2026-03-01/P1W, R5/2026-03-01/P1D' };
}
function describeInterval(s) {
  let rep = '';
  const r = /^R(\d*)\/(.+)$/.exec(s);
  if (r) { rep = r[1] ? `Repeats: ${r[1]} time(s)` : 'Repeats: unbounded'; s = r[2]; }
  const parts = s.split('/');
  if (parts.length !== 2 && !r) return null;
  if (parts.length !== 2) return { err: 'an interval needs two parts separated by one /' };
  const L = ['Kind: ' + (rep ? 'repeating interval' : 'time interval')]; if (rep) L.push(rep);
  const res = parts.map(parseOne);
  const bad = res.findIndex((x) => !x || x.err); if (bad >= 0) return { err: `part ${bad + 1} (${parts[bad]}): ${res[bad]?.err}` };
  const dI = res.findIndex((x) => x.parts);
  if (dI >= 0 && res[1 - dI].parts) return { err: 'both parts are durations; one must be a date or time' };
  L.push(`Start: ${parts[0]}`, `End: ${parts[1]}`);
  if (dI >= 0) {
    const base = res[1 - dI].lines.find((x) => /^(UTC|If read as UTC): /.test(x)) || (/^\d{4}-\d{2}-\d{2}$/.test(parts[1 - dI]) ? `UTC: ${parts[1 - dI]}T00:00:00.000Z` : null);
    if (base) {
      const t0 = new Date(base.replace(/^[^:]+: /, '')), p = res[dI].parts, sg = dI === 1 ? 1 : -1, x = new Date(t0);
      x.setUTCFullYear(x.getUTCFullYear() + sg * p.Y); x.setUTCMonth(x.getUTCMonth() + sg * p.M); x.setUTCDate(x.getUTCDate() + sg * (p.D + 7 * p.W)); x.setTime(x.getTime() + sg * (p.H * 3600 + p.Mi * 60 + p.S) * 1000);
      L.push(`${dI === 1 ? 'End' : 'Start'} computed (UTC): ${x.toISOString()}`);
    }
  } else {
    const [a, b] = res.map((x) => x.lines.find((l) => /^Unix milliseconds: /.test(l))?.split(': ')[1]);
    if (a && b) L.push(`Length: ${(b - a) / 1000} seconds (${((b - a) / 864e5).toFixed(3)} days)${b < a ? ' (end is before start)' : ''}`);
  }
  return { lines: L };
}
tool({
  id: 'iso-8601-date-parser', cat: 'Time & Productivity', title: 'ISO 8601 Date, Time and Interval Parser',
  desc: 'Break ISO 8601 dates, week dates, ordinal dates, times, durations, intervals and repeats into their parts, with validity checks, weekday, ISO week and Unix time.',
  labels: ['ISO 8601 strings, one per line'],
  sample: '2026-03-01T10:00:00+01:00\n2026-W09-7\n2026-060\n20260229\nPT1H30M\nP1Y2M10DT2H30M\n2026-03-01/P1W\nR5/2026-03-01T08:00:00Z/P1D\n2026-13-01',
  opts: [],
  run: ([t]) => {
    need(t, 'ISO 8601 strings');
    const blocks = t.split(/\r\n|\r|\n/).filter((l) => l.trim()).map((l) => {
      const s = l.trim(), r = /\//.test(s) ? describeInterval(s) : parseOne(s);
      return `${s}\n` + (r?.err ? `  Review: ${r.err}` : (r?.lines || ['  not recognised']).map((x) => '  ' + x).join('\n'));
    });
    return blocks.join('\n\n') + '\n\nBased on the ISO 8601 formats as commonly used (calendar, ordinal and week dates, basic and extended forms), checked against the Python date library but not against the paywalled standard text. Values with no offset have no fixed instant; "If read as UTC" is an assumption.';
  },
});

// ---------- CSS Color 4 converter ----------
const mmul = (m, v) => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const minv = (m) => {
  const [[a, b, c], [d, e, f], [g, h, i]] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [[A, -(b * i - c * h), b * f - c * e], [B, a * i - c * g, -(a * f - c * d)], [C, -(a * h - b * g), a * e - b * d]].map((r) => r.map((x) => x / det));
};
const M_RGB_XYZ = [[0.4123907992659595, 0.357584339383878, 0.1804807884018343], [0.21263900587151036, 0.715168678767756, 0.07219231536073371], [0.01933081871559185, 0.11919477979462598, 0.9505321522496607]];
const M_D65_D50 = [[1.0479297925449969, 0.022946870601609652, -0.05019226628920524], [0.02962780877005599, 0.9904344267538799, -0.017073799063418826], [-0.009243040646204504, 0.015055191490298152, 0.7518742814281371]];
const M_P3_XYZ = [[0.4865709486482162, 0.26566769316909306, 0.1982172852343625], [0.2289745640697488, 0.6917385218365064, 0.079286914093745], [0, 0.04511338185890264, 1.043944368900976]];
const M_OK1 = [[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]];
const M_OK2 = [[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]];
const M_XYZ_RGB = minv(M_RGB_XYZ), M_D50_D65 = minv(M_D65_D50), M_XYZ_P3 = minv(M_P3_XYZ), M_OK1i = minv(M_OK1), M_OK2i = minv(M_OK2);
const D50 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
const toLin = (c) => (Math.abs(c) <= 0.04045 ? c / 12.92 : Math.sign(c) * Math.pow((Math.abs(c) + 0.055) / 1.055, 2.4));
const toGam = (c) => (Math.abs(c) <= 0.0031308 ? c * 12.92 : Math.sign(c) * (1.055 * Math.pow(Math.abs(c), 1 / 2.4) - 0.055));
const E = 216 / 24389, K = 24389 / 27;
const labF = (t) => (t > E ? Math.cbrt(t) : (K * t + 16) / 116), labFi = (f) => (f ** 3 > E ? f ** 3 : (116 * f - 16) / K);
const rad = Math.PI / 180;
function rgb2hsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) { s = l === 0 || l === 1 ? 0 : (mx - l) / Math.min(l, 1 - l); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, s * 100, l * 100];
}
function hsl2rgb(h, s, l) { h = ((h % 360) + 360) % 360; s /= 100; l /= 100; const f = (n) => { const k = (n + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; }
const lin2xyz50 = (lin) => mmul(M_D65_D50, mmul(M_RGB_XYZ, lin));
function xyz50ToLab(x) { const f = x.map((v, i) => labF(v / D50[i])); return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])]; }
function labToXyz50([L, a, b]) { const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200; return [labFi(fx) * D50[0], (L > 8 ? fy ** 3 : L / K), labFi(fz) * D50[2]]; }
const polar = (a, b) => [Math.hypot(a, b), Math.hypot(a, b) < 1e-4 ? 0 : ((Math.atan2(b, a) / rad) + 360) % 360];
function linToOklab(lin) { const lms = mmul(M_OK1, lin).map(Math.cbrt); return mmul(M_OK2, lms); }
const oklabToLin = (lab) => mmul(M_OK1i, mmul(M_OK2i, lab).map((v) => v ** 3));
const NUM = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?';
function parseColor(str) {
  const s = str.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (m) { let h = m[1]; if (h.length <= 4) h = [...h].map((c) => c + c).join(''); const v = h.match(/../g).map((x) => parseInt(x, 16)); return { lin: [v[0] / 255, v[1] / 255, v[2] / 255].map(toLin), a: v[3] === undefined ? 1 : v[3] / 255 }; }
  m = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*(.+?)\s*\)$/.exec(s);
  if (!m) throw new Error(`Cannot read "${str.trim()}". Use hex, rgb(), hsl(), hwb(), lab(), lch(), oklab() or oklch().`);
  const fn = m[1].replace(/a$/, '').replace(/^(rgb|hsl)a$/, '$1'), [main, al] = m[2].split('/').map((x) => x.trim());
  let parts = main.split(/[\s,]+/).filter(Boolean);
  let alpha = al !== undefined ? al : (parts.length === 4 ? parts.pop() : undefined);
  if (parts.length !== 3) throw new Error(`"${str.trim()}" needs three components.`);
  const pn = (x, pctScale, name) => { const mm = new RegExp(`^(${NUM})(%|deg)?$`).exec(x); if (!mm) throw new Error(`Bad ${name} value "${x}".`); return mm[2] === '%' ? (+mm[1] * pctScale) / 100 : +mm[1]; };
  const hue = (x) => { const mm = new RegExp(`^(${NUM})(deg|grad|rad|turn)?$`).exec(x); if (!mm) throw new Error(`Bad hue "${x}".`); const u = { grad: 0.9, rad: 180 / Math.PI, turn: 360 }[mm[2]] || 1; return +mm[1] * u; };
  const a = alpha === undefined ? 1 : pn(alpha, 1, 'alpha');
  let lin;
  const [p0, p1, p2] = parts;
  if (fn === 'rgb') lin = [pn(p0, 255, 'red'), pn(p1, 255, 'green'), pn(p2, 255, 'blue')].map((v) => toLin(v / 255));
  else if (fn === 'hsl') lin = hsl2rgb(hue(p0), pn(p1, 100, 'saturation'), pn(p2, 100, 'lightness')).map(toLin);
  else if (fn === 'hwb') { let w = pn(p1, 100, 'whiteness') / 100, b = pn(p2, 100, 'blackness') / 100; if (w + b >= 1) { const g = w / (w + b); lin = [g, g, g].map(toLin); } else lin = hsl2rgb(hue(p0), 100, 50).map((c) => toLin(c * (1 - w - b) + w)); }
  else if (fn === 'lab') lin = mmul(M_XYZ_RGB, mmul(M_D50_D65, labToXyz50([pn(p0, 100, 'L'), pn(p1, 125, 'a'), pn(p2, 125, 'b')])));
  else if (fn === 'lch') { const c = pn(p1, 150, 'chroma'), h = hue(p2) * rad; lin = mmul(M_XYZ_RGB, mmul(M_D50_D65, labToXyz50([pn(p0, 100, 'L'), c * Math.cos(h), c * Math.sin(h)]))); }
  else if (fn === 'oklab') lin = oklabToLin([pn(p0, 1, 'L'), pn(p1, 0.4, 'a'), pn(p2, 0.4, 'b')]);
  else { const c = pn(p1, 0.4, 'chroma'), h = hue(p2) * rad; lin = oklabToLin([pn(p0, 1, 'L'), c * Math.cos(h), c * Math.sin(h)]); }
  return { lin, a: Math.min(1, Math.max(0, a)) };
}
const r2 = (x, d) => { const v = +x.toFixed(d); return Object.is(v, -0) ? 0 : v; };
function colorLines(c) {
  const { lin, a } = c, inGamut = lin.every((v) => v > -0.0005 && v < 1.0005);
  const g = lin.map((v) => Math.min(1, Math.max(0, toGam(v)))), as = a < 1 ? ` / ${r2(a, 3)}` : '';
  const hex = '#' + g.map((v) => pad(Math.round(v * 255).toString(16))).join('') + (a < 1 ? pad(Math.round(a * 255).toString(16)) : '');
  const [h, s, l] = rgb2hsl(g), w = Math.min(...g) * 100, bk = (1 - Math.max(...g)) * 100;
  const lab = xyz50ToLab(lin2xyz50(lin)), [lc, lh] = polar(lab[1], lab[2]);
  const ok = linToOklab(lin), [oc, oh] = polar(ok[1], ok[2]);
  const p3 = mmul(M_XYZ_P3, mmul(M_RGB_XYZ, lin)).map(toGam).map((v) => r2(v, 4));
  const L = [
    `HEX:    ${hex}`, `RGB:    rgb(${g.map((v) => r2(v * 255, 0)).join(' ')}${as})`, `HSL:    hsl(${r2(h, 1)} ${r2(s, 1)}% ${r2(l, 1)}%${as})`, `HWB:    hwb(${r2(h, 1)} ${r2(w, 1)}% ${r2(bk, 1)}%${as})`,
    `LAB:    lab(${r2(lab[0], 2)} ${r2(lab[1], 2)} ${r2(lab[2], 2)}${as})`, `LCH:    lch(${r2(lab[0], 2)} ${r2(lc, 2)} ${r2(lh, 1)}${as})`,
    `OKLAB:  oklab(${r2(ok[0], 4)} ${r2(ok[1], 4)} ${r2(ok[2], 4)}${as})`, `OKLCH:  oklch(${r2(ok[0], 4)} ${r2(oc, 4)} ${r2(oh, 1)}${as})`, `P3:     color(display-p3 ${p3.join(' ')}${as})`,
  ];
  if (!inGamut) L.push('Note: this colour is outside sRGB. HEX, RGB, HSL and HWB show the nearest clipped values; LAB, LCH, OKLAB, OKLCH and P3 keep the true colour.');
  return L;
}
tool({
  id: 'css-color-formats', cat: 'Color', title: 'CSS Color Level 4 Converter (HWB, LAB, LCH, OKLAB, Display P3)',
  desc: 'Convert HEX, rgb(), hsl(), hwb(), lab(), lch(), oklab() and oklch() into every other CSS format, including Display P3, with alpha and an out-of-gamut warning.',
  labels: ['Colours, one per line'], sample: '#3366cc\nhwb(194 0% 0%)\nlab(54.29 80.8 69.89)\noklch(0.7 0.15 150 / 0.5)\nrgb(255 0 0)',
  opts: [],
  run: ([t]) => {
    need(t, 'colours');
    return t.split(/\r\n|\r|\n/).filter((l) => l.trim()).map((l) => `${l.trim()}\n` + colorLines(parseColor(l)).map((x) => '  ' + x).join('\n')).join('\n\n') + '\n\nComputed with the CSS Color Level 4 maths (D50 for lab and lch, D65 for the rest, Bradford adaptation). Last digits can differ by one from a browser.';
  },
});

const pe = (e) => e.textContent.replace(/This page contains the following errors:|Below is a rendering of the page up to the first error\./g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
// ---------- XSLT playground ----------
tool({
  id: 'xslt-playground', cat: 'XML', title: 'XSLT Playground (Transform XML in Your Browser)',
  desc: 'Apply an XSLT 1.0 stylesheet to pasted XML and see the output. Uses the XSLT engine built into your browser, so nothing is uploaded.',
  dom: true, labels: ['XML', 'XSLT stylesheet'],
  sample: '<?xml version="1.0"?>\n<library>\n  <book year="1999"><title>Alpha</title><price>12.50</price></book>\n  <book year="2005"><title>Beta</title><price>8</price></book>\n  <book year="2021"><title>Gamma</title><price>20.25</price></book>\n</library>',
  sample2: '<?xml version="1.0"?>\n<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">\n  <xsl:output method="text"/>\n  <xsl:template match="/library">\n    <xsl:for-each select="book">\n      <xsl:sort select="price" data-type="number" order="descending"/>\n      <xsl:value-of select="title"/> (<xsl:value-of select="@year"/>): <xsl:value-of select="price"/>\n      <xsl:text>&#10;</xsl:text>\n    </xsl:for-each>\n    <xsl:text>Total: </xsl:text><xsl:value-of select="sum(book/price)"/>\n  </xsl:template>\n</xsl:stylesheet>',
  opts: [],
  run: ([xml, xsl]) => {
    need(xml, 'the XML'); need(xsl, 'the XSLT stylesheet');
    if (typeof XSLTProcessor === 'undefined') throw new Error('This browser has no built-in XSLT processor.');
    const parse = (s, what) => { const d = new DOMParser().parseFromString(s, 'application/xml'), e = d.getElementsByTagName('parsererror')[0]; if (e) throw new Error(`${what} is not well-formed: ${pe(e)}`); return d; };
    const x = parse(xml, 'The XML'), s = parse(xsl, 'The stylesheet');
    const p = new XSLTProcessor();
    try { p.importStylesheet(s); } catch (e) { throw new Error('Stylesheet rejected: ' + (e.message || e)); }
    let frag;
    try { frag = p.transformToFragment(x, document); } catch (e) { throw new Error('Transform failed: ' + (e.message || e)); }
    if (!frag) throw new Error('The transform produced no output. Check that a template matches the root element.');
    const ser = new XMLSerializer();
    const out = [...frag.childNodes].map((n) => (n.nodeType === 3 || n.nodeType === 4 ? n.nodeValue : ser.serializeToString(n))).join('').replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
    return out.trim() ? out : 'The transform ran but produced empty output.';
  },
});

// ---------- XSD validator (subset) ----------
const XS = 'http://www.w3.org/2001/XMLSchema', XSI = 'http://www.w3.org/2001/XMLSchema-instance';
const INT_RANGE = { int: [-(2n ** 31n), 2n ** 31n - 1n], long: [-(2n ** 63n), 2n ** 63n - 1n], short: [-32768n, 32767n], byte: [-128n, 127n], unsignedInt: [0n, 2n ** 32n - 1n], unsignedLong: [0n, 2n ** 64n - 1n], unsignedShort: [0n, 65535n], unsignedByte: [0n, 255n], positiveInteger: [1n, null], nonNegativeInteger: [0n, null], negativeInteger: [null, -1n], nonPositiveInteger: [null, 0n], integer: [null, null] };
const TZ = '(?:Z|[+-](?:0\\d|1[0-4]):[0-5]\\d)?';
const BUILTIN_RE = {
  decimal: /^[+-]?(\d+(\.\d*)?|\.\d+)$/, float: /^([+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?|[+-]?INF|NaN)$/, boolean: /^(true|false|1|0)$/,
  time: new RegExp(`^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(\\.\\d+)?${TZ}$`), gYear: new RegExp(`^-?\\d{4,}${TZ}$`), gYearMonth: new RegExp(`^-?\\d{4,}-(0[1-9]|1[0-2])${TZ}$`),
  gMonth: new RegExp(`^--(0[1-9]|1[0-2])${TZ}$`), gDay: new RegExp(`^---(0[1-9]|[12]\\d|3[01])${TZ}$`), gMonthDay: new RegExp(`^--(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])${TZ}$`),
  duration: /^-?P(?!$)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/, language: /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/, base64Binary: /^[A-Za-z0-9+/\s]*={0,2}\s*$/, hexBinary: /^([0-9a-fA-F]{2})*$/,
  NCName: /^[A-Za-z_][\w.-]*$/, ID: /^[A-Za-z_][\w.-]*$/, IDREF: /^[A-Za-z_][\w.-]*$/, Name: /^[A-Za-z_:][\w.:-]*$/, NMTOKEN: /^[\w.:-]+$/, QName: /^([A-Za-z_][\w.-]*:)?[A-Za-z_][\w.-]*$/,
};
const KNOWN_BUILTIN = new Set(['string', 'normalizedString', 'token', 'anyURI', 'anySimpleType', 'anyType', 'double', 'date', 'dateTime', 'NMTOKENS', 'IDREFS', 'ENTITY', 'ENTITIES', 'NOTATION', 'dateTimeStamp', ...Object.keys(INT_RANGE), ...Object.keys(BUILTIN_RE)]);
function builtinCheck(name, raw) {
  const v = ['string'].includes(name) ? raw : raw.replace(/\s+/g, ' ').trim();
  if (INT_RANGE[name]) {
    if (!/^[+-]?\d+$/.test(v)) return `"${v}" is not an integer`;
    const n = BigInt(v), [lo, hi] = INT_RANGE[name];
    if ((lo !== null && n < lo) || (hi !== null && n > hi)) return `"${v}" is out of range for xs:${name}`;
    return null;
  }
  if (name === 'double') name = 'float';
  if (name === 'date' || name === 'dateTime' || name === 'dateTimeStamp') {
    const m = new RegExp(`^(-?\\d{4,})-(\\d\\d)-(\\d\\d)${name === 'date' ? '' : '(T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?|T24:00:00(?:\\.0+)?)'}${TZ}$`).exec(v);
    if (!m) return `"${v}" is not a valid xs:${name}`;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > dim(Math.abs(y), mo)) return `"${v}" is not a real calendar date`;
    return null;
  }
  if (BUILTIN_RE[name]) return BUILTIN_RE[name].test(v) ? null : `"${v.slice(0, 40)}" is not a valid xs:${name}`;
  if (name === 'NMTOKENS' || name === 'IDREFS') return v ? null : 'needs at least one item';
  return null;
}
function xsdValidate(xmlText, xsdText) {
  const parse = (s, what) => { const d = new DOMParser().parseFromString(s, 'application/xml'), e = d.getElementsByTagName('parsererror')[0]; if (e) throw new Error(`${what} is not well-formed XML: ${pe(e)}`); return d; };
  const xdoc = parse(xmlText, 'The XML'), sdoc = parse(xsdText, 'The schema');
  const sroot = sdoc.documentElement;
  if (sroot.namespaceURI !== XS || sroot.localName !== 'schema') throw new Error('The schema root must be <xs:schema> in the http://www.w3.org/2001/XMLSchema namespace.');
  const notes = new Set(), errors = []; let checked = 0;
  const xk = (n, ...names) => [...n.children].filter((c) => c.namespaceURI === XS && (!names.length || names.includes(c.localName)));
  const local = (q) => String(q).replace(/^.*:/, '');
  const G = { el: new Map(), type: new Map(), group: new Map(), attrGroup: new Map(), attr: new Map() };
  for (const c of xk(sroot)) {
    const nm = c.getAttribute('name');
    const map = { element: G.el, complexType: G.type, simpleType: G.type, group: G.group, attributeGroup: G.attrGroup, attribute: G.attr }[c.localName];
    if (map && nm) map.set(nm, c);
    else if (['include', 'import', 'redefine', 'override'].includes(c.localName)) notes.add(`xs:${c.localName} is not followed (schemas from other files are not loaded)`);
  }
  if (sroot.getAttribute('targetNamespace')) notes.add('namespaces are ignored: names are compared by local name only');
  for (const c of sroot.getElementsByTagNameNS(XS, '*')) if (['key', 'keyref', 'unique'].includes(c.localName)) notes.add(`xs:${c.localName} identity constraints are not checked`);
  if (sroot.getElementsByTagNameNS(XS, 'element') && [...sroot.getElementsByTagNameNS(XS, 'element')].some((e) => e.hasAttribute('substitutionGroup'))) notes.add('substitution groups are not supported');
  // type model
  const typeRef = (owner, q) => { // -> {b: builtinName} | {n: node}
    const i = q.indexOf(':'), pre = i > 0 ? q.slice(0, i) : '', nm = local(q);
    if (owner.lookupNamespaceURI(pre || null) === XS && (pre || !sroot.getAttribute('targetNamespace'))) return { b: nm };
    if (G.type.has(nm)) return { n: G.type.get(nm) };
    if (KNOWN_BUILTIN.has(nm)) return { b: nm };
    notes.add(`type "${q}" is not defined in the schema`);
    return { b: 'anyType' };
  };
  const typeOfDecl = (el) => {
    if (el.hasAttribute('type')) return typeRef(el, el.getAttribute('type'));
    const k = xk(el, 'complexType', 'simpleType')[0];
    return k ? { n: k } : { b: 'anyType' };
  };
  const isSimple = (t) => (t.b ? t.b !== 'anyType' : t.n.localName === 'simpleType');
  const facets = (r) => { const f = { enum: [], pat: [] }; for (const x of xk(r)) { const v = x.getAttribute('value'); if (x.localName === 'enumeration') f.enum.push(v); else if (x.localName === 'pattern') f.pat.push(v); else if (['length', 'minLength', 'maxLength', 'minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive', 'fractionDigits', 'totalDigits', 'whiteSpace'].includes(x.localName)) f[x.localName] = v; } return f; };
  const checkSimple = (t, raw, depth = 0) => {
    if (depth > 20) return null;
    if (t.b) return t.b === 'anyType' ? null : builtinCheck(t.b, raw);
    const st = t.n, r = xk(st, 'restriction')[0], li = xk(st, 'list')[0], un = xk(st, 'union')[0];
    if (li) {
      const item = li.hasAttribute('itemType') ? typeRef(li, li.getAttribute('itemType')) : { n: xk(li, 'simpleType')[0] };
      for (const part of raw.trim().split(/\s+/).filter(Boolean)) { const e = checkSimple(item, part, depth + 1); if (e) return 'list item ' + e; }
      return null;
    }
    if (un) {
      const ms = (un.getAttribute('memberTypes') || '').split(/\s+/).filter(Boolean).map((q) => typeRef(un, q)).concat(xk(un, 'simpleType').map((n) => ({ n })));
      return ms.some((m) => !checkSimple(m, raw, depth + 1)) ? null : `"${raw.trim().slice(0, 40)}" matches none of the union member types`;
    }
    if (!r) return null;
    const base = r.hasAttribute('base') ? typeRef(r, r.getAttribute('base')) : { n: xk(r, 'simpleType')[0] };
    return checkRestriction(r, base, raw, depth);
  };
  const checkRestriction = (r, base, raw, depth) => {
    const be = base.b || base.n ? checkSimple(base, raw, depth + 1) : null;
    if (be) return be;
    const f = facets(r), v = f.whiteSpace === 'preserve' || (base.b === 'string' && !f.whiteSpace) ? raw : raw.replace(/\s+/g, ' ').trim();
    if (f.enum.length && !f.enum.includes(v)) return `"${v.slice(0, 40)}" is not one of: ${f.enum.join(', ')}`;
    if (f.pat.length) {
      const ok = f.pat.some((p) => { try { return new RegExp('^(?:' + p + ')$', 'u').test(v); } catch { notes.add('a pattern facet uses XSD regex syntax this checker cannot read; it was skipped'); return true; } });
      if (!ok) return `"${v.slice(0, 40)}" does not match the pattern ${f.pat.join(' or ')}`;
    }
    const len = [...v].length;
    if (f.length !== undefined && len !== +f.length) return `length is ${len}, must be ${f.length}`;
    if (f.minLength !== undefined && len < +f.minLength) return `length ${len} is below minLength ${f.minLength}`;
    if (f.maxLength !== undefined && len > +f.maxLength) return `length ${len} is above maxLength ${f.maxLength}`;
    const nv = Number(v);
    if (['minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive'].some((k) => f[k] !== undefined) && /^[+-]?[\d.]+([eE][+-]?\d+)?$/.test(v)) {
      if (f.minInclusive !== undefined && nv < +f.minInclusive) return `${v} is below minInclusive ${f.minInclusive}`;
      if (f.maxInclusive !== undefined && nv > +f.maxInclusive) return `${v} is above maxInclusive ${f.maxInclusive}`;
      if (f.minExclusive !== undefined && nv <= +f.minExclusive) return `${v} must be greater than ${f.minExclusive}`;
      if (f.maxExclusive !== undefined && nv >= +f.maxExclusive) return `${v} must be less than ${f.maxExclusive}`;
    } else if (['minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive'].some((k) => f[k] !== undefined)) notes.add('range facets on non-numeric types (dates) are not checked');
    if (f.fractionDigits !== undefined && /^[+-]?\d*\.\d+$/.test(v) && v.split('.')[1].replace(/0+$/, '').length > +f.fractionDigits) return `${v} has more than ${f.fractionDigits} fraction digits`;
    if (f.totalDigits !== undefined && v.replace(/[^0-9]/g, '').replace(/^0+/, '').length > +f.totalDigits) return `${v} has more than ${f.totalDigits} digits`;
    return null;
  };
  const occ = (n) => ({ min: n.hasAttribute('minOccurs') ? +n.getAttribute('minOccurs') : 1, max: n.hasAttribute('maxOccurs') ? (n.getAttribute('maxOccurs') === 'unbounded' ? Infinity : +n.getAttribute('maxOccurs')) : 1 });
  const buildParticle = (n, depth = 0) => {
    const o = occ(n);
    if (depth > 30) return { t: 'seq', kids: [], ...o };
    if (n.localName === 'element') {
      if (n.hasAttribute('ref')) { const d = G.el.get(local(n.getAttribute('ref'))); if (!d) { notes.add(`element ref "${n.getAttribute('ref')}" is not defined`); return { t: 'any', ...o }; } return { t: 'el', name: d.getAttribute('name'), decl: d, ...o }; }
      return { t: 'el', name: n.getAttribute('name'), decl: n, ...o };
    }
    if (n.localName === 'any') { notes.add('xs:any wildcards accept any element without checking it'); return { t: 'any', ...o }; }
    if (n.localName === 'group') { const g = G.group.get(local(n.getAttribute('ref') || '')); const c = g && xk(g, 'sequence', 'choice', 'all')[0]; if (!c) return { t: 'seq', kids: [], ...o }; const p = buildParticle(c, depth + 1); return { ...p, min: o.min, max: o.max }; }
    return { t: n.localName === 'all' ? 'all' : n.localName === 'choice' ? 'choice' : 'seq', kids: xk(n, 'element', 'sequence', 'choice', 'any', 'group', 'all').map((k) => buildParticle(k, depth + 1)), ...o };
  };
  const attrsOf = (nodes, out, depth = 0) => {
    for (const a of nodes) {
      if (a.localName === 'attribute') { const ref = a.hasAttribute('ref') ? G.attr.get(local(a.getAttribute('ref'))) || a : a; out.attrs.set(a.getAttribute('name') || local(a.getAttribute('ref') || ''), { use: a.getAttribute('use') || 'optional', node: ref, fixed: a.getAttribute('fixed') ?? ref.getAttribute('fixed'), dflt: a.getAttribute('default') }); }
      else if (a.localName === 'attributeGroup' && depth < 20) { const g = G.attrGroup.get(local(a.getAttribute('ref') || '')); if (g) attrsOf(xk(g, 'attribute', 'attributeGroup', 'anyAttribute'), out, depth + 1); }
      else if (a.localName === 'anyAttribute') out.anyAttr = true;
    }
  };
  const complexInfo = (node, depth = 0) => {
    const info = { attrs: new Map(), anyAttr: false, mixed: node.getAttribute('mixed') === 'true', kind: 'empty', particle: null, simple: null };
    if (depth > 20) return info;
    const sc = xk(node, 'simpleContent')[0], cc = xk(node, 'complexContent')[0];
    if (sc) {
      const d = xk(sc, 'extension', 'restriction')[0], base = typeRef(d, d.getAttribute('base') || 'string');
      info.kind = 'simple';
      if (base.n && base.n.localName === 'complexType') { const bi = complexInfo(base.n, depth + 1); info.simple = bi.simple; for (const [k, v] of bi.attrs) info.attrs.set(k, v); } else info.simple = base;
      if (d.localName === 'restriction') info.restr = d;
      attrsOf(xk(d, 'attribute', 'attributeGroup', 'anyAttribute'), info);
      return info;
    }
    if (cc) {
      info.mixed = info.mixed || cc.getAttribute('mixed') === 'true';
      const d = xk(cc, 'extension', 'restriction')[0], parts = [];
      if (d.localName === 'extension') { const base = typeRef(d, d.getAttribute('base')); if (base.n && base.n.localName === 'complexType') { const bi = complexInfo(base.n, depth + 1); if (bi.particle) parts.push(bi.particle); for (const [k, v] of bi.attrs) info.attrs.set(k, v); info.mixed = info.mixed || bi.mixed; info.anyAttr = bi.anyAttr; } }
      const c = xk(d, 'sequence', 'choice', 'all', 'group')[0]; if (c) parts.push(buildParticle(c));
      info.particle = parts.length === 1 ? parts[0] : parts.length ? { t: 'seq', kids: parts, min: 1, max: 1 } : null;
      attrsOf(xk(d, 'attribute', 'attributeGroup', 'anyAttribute'), info);
    } else {
      const c = xk(node, 'sequence', 'choice', 'all', 'group')[0];
      info.particle = c ? buildParticle(c) : null;
      attrsOf(xk(node, 'attribute', 'attributeGroup', 'anyAttribute'), info);
    }
    info.kind = info.mixed ? 'mixed' : info.particle ? 'element' : 'empty';
    return info;
  };
  // matching
  const ends = (p, kids, pos, ctx) => {
    const out = new Set();
    if (p.t === 'all') {
      const used = new Set(); let i = pos;
      for (; i < kids.length; i++) { const k = p.kids.find((q, j) => q.t === 'el' && q.name === kids[i].localName && !used.has(j)); if (!k) break; used.add(p.kids.indexOf(k)); }
      const missing = p.kids.filter((q, j) => q.min > 0 && !used.has(j) && q.t === 'el');
      if (p.min === 0 && i === pos) out.add(pos);
      else if (!missing.length) out.add(i);
      else { fail(ctx, i, missing.map((q) => q.name)); }
      return out;
    }
    const one = (at) => {
      const r = new Set();
      if (p.t === 'el') { if (kids[at] && kids[at].localName === p.name) r.add(at + 1); else fail(ctx, at, [p.name]); }
      else if (p.t === 'any') { if (kids[at]) r.add(at + 1); }
      else if (p.t === 'choice') { if (!p.kids.length) r.add(at); for (const k of p.kids) for (const e of ends(k, kids, at, ctx)) r.add(e); }
      else { let cur = new Set([at]); for (const k of p.kids) { const nx = new Set(); for (const c of cur) for (const e of ends(k, kids, c, ctx)) nx.add(e); cur = nx; if (!cur.size) break; } cur.forEach((e) => r.add(e)); }
      return r;
    };
    let cur = new Set([pos]); const seen = new Set([pos]);
    if (p.min === 0) out.add(pos);
    for (let i = 1; i <= Math.min(p.max, kids.length + p.min + 1); i++) {
      const nx = new Set(); for (const c of cur) for (const e of one(c)) nx.add(e);
      if (!nx.size) break;
      if (i >= p.min) nx.forEach((e) => out.add(e));
      const fresh = [...nx].filter((e) => !seen.has(e)); nx.forEach((e) => seen.add(e));
      if (!fresh.length && i >= p.min) break;
      cur = nx;
    }
    return out;
  };
  const fail = (ctx, pos, names) => { if (pos > ctx.far) { ctx.far = pos; ctx.exp = new Set(); } if (pos === ctx.far) names.forEach((n) => ctx.exp.add(n)); };
  const decls = (p, m = new Map()) => { if (p.t === 'el') { if (!m.has(p.name)) m.set(p.name, p.decl); } else if (p.kids) p.kids.forEach((k) => decls(k, m)); return m; };
  const err = (path, msg) => { if (errors.length < 100) errors.push(`${path}: ${msg}`); };
  const pathOf = (n) => { const parts = []; for (let e = n; e && e.nodeType === 1; e = e.parentNode) { const sib = [...(e.parentNode?.children || [])].filter((c) => c.localName === e.localName); parts.unshift(e.localName + (sib.length > 1 ? `[${sib.indexOf(e) + 1}]` : '')); } return '/' + parts.join('/'); };
  const checkAttrs = (el, info, simpleOnly) => {
    const path = pathOf(el);
    for (const a of [...el.attributes]) {
      if (a.name === 'xmlns' || a.name.startsWith('xmlns:') || a.namespaceURI === XSI) continue;
      const d = info.attrs.get(a.localName);
      if (simpleOnly || (!d && !info.anyAttr)) { err(path, `attribute "${a.name}" is not allowed here`); continue; }
      if (!d) continue;
      if (d.use === 'prohibited') { err(path, `attribute "${a.name}" is prohibited`); continue; }
      const e = checkSimple(typeOfDecl(d.node), a.value); if (e) err(path, `attribute "${a.name}": ${e}`);
      if (d.fixed != null && a.value !== d.fixed) err(path, `attribute "${a.name}" must be "${d.fixed}"`);
    }
    if (!simpleOnly) for (const [n, d] of info.attrs) if (d.use === 'required' && !el.hasAttribute(n)) err(path, `required attribute "${n}" is missing`);
  };
  const validateEl = (el, decl, depth = 0) => {
    checked++;
    if (depth > 200) return;
    const path = pathOf(el), t = typeOfDecl(decl), kids = [...el.children], text = [...el.childNodes].filter((n) => n.nodeType === 3 || n.nodeType === 4).map((n) => n.nodeValue).join('');
    if (decl.getAttribute('abstract') === 'true') err(path, 'element is declared abstract');
    if (el.getAttributeNS(XSI, 'nil') === 'true') { if (decl.getAttribute('nillable') !== 'true') err(path, 'xsi:nil is used but the element is not nillable'); else if (kids.length || text.trim()) err(path, 'a nil element must be empty'); return; }
    if (isSimple(t)) {
      if (kids.length) err(path, `<${kids[0].localName}> is not allowed: this element holds text only`);
      checkAttrs(el, null, true);
      const v = text === '' && decl.hasAttribute('default') ? decl.getAttribute('default') : text;
      const e = checkSimple(t, v); if (e) err(path, e);
      if (decl.hasAttribute('fixed') && v.trim() !== decl.getAttribute('fixed')) err(path, `value must be "${decl.getAttribute('fixed')}"`);
      return;
    }
    if (t.b === 'anyType') return;
    const info = complexInfo(t.n);
    checkAttrs(el, info, false);
    if (info.kind === 'simple') { if (kids.length) err(path, `<${kids[0].localName}> is not allowed: this element holds text only`); const s = info.simple; const e = s ? (info.restr ? checkRestriction(info.restr, s, text, 0) : checkSimple(s, text)) : null; if (e) err(path, e); return; }
    if (info.kind === 'empty') { if (kids.length) err(path, `<${kids[0].localName}> is not allowed: this element must be empty`); if (text.trim()) err(path, 'this element must be empty but has text'); return; }
    if (info.kind === 'element' && text.trim()) err(path, 'text is not allowed here, only child elements');
    const dm = decls(info.particle), ctx = { far: 0, exp: new Set() };
    const ok = info.particle.max === 0 || ends(info.particle, kids, 0, ctx).has(kids.length);
    if (!ok) {
      const e = [...ends(info.particle, kids, 0, ctx)], pos = Math.max(ctx.far, ...e, 0), exp = ctx.far === pos ? [...ctx.exp] : [];
      err(path, pos < kids.length ? `unexpected element <${kids[pos].localName}>` + (exp.length ? `, expected ${exp.map((x) => '<' + x + '>').join(' or ')}` : ', no more elements are allowed here') : `missing required element ${exp.map((x) => '<' + x + '>').join(' or ') || '(see the schema)'}`);
    }
    for (const k of kids) { const d = dm.get(k.localName); if (d) validateEl(k, d, depth + 1); }
  };
  const root = xdoc.documentElement, rd = G.el.get(root.localName);
  if (!rd) return { errors: [`/${root.localName}: no global element <${root.localName}> is declared in the schema`], checked: 0, notes };
  validateEl(root, rd);
  return { errors, checked, notes };
}
tool({
  id: 'xsd-validator', cat: 'XML', title: 'XSD Validator (Check XML Against an XML Schema)',
  desc: 'Check an XML document against an XSD 1.0 schema in your browser. Reports element order, missing or extra elements, attributes, types, enumerations, patterns and ranges with the path of each problem.',
  dom: true, labels: ['XML document', 'XSD schema'],
  sample: '<?xml version="1.0"?>\n<order id="A-17" status="shipped">\n  <customer>Ada</customer>\n  <item sku="X1"><qty>2</qty><price>9.50</price></item>\n  <item sku="X2"><qty>0</qty><price>abc</price></item>\n  <note>rush</note>\n</order>',
  sample2: '<?xml version="1.0"?>\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">\n  <xs:element name="order">\n    <xs:complexType>\n      <xs:sequence>\n        <xs:element name="customer" type="xs:string"/>\n        <xs:element name="item" maxOccurs="unbounded">\n          <xs:complexType>\n            <xs:sequence>\n              <xs:element name="qty" type="xs:positiveInteger"/>\n              <xs:element name="price" type="xs:decimal"/>\n            </xs:sequence>\n            <xs:attribute name="sku" type="xs:string" use="required"/>\n          </xs:complexType>\n        </xs:element>\n      </xs:sequence>\n      <xs:attribute name="id" type="xs:string" use="required"/>\n      <xs:attribute name="status">\n        <xs:simpleType><xs:restriction base="xs:string"><xs:enumeration value="new"/><xs:enumeration value="paid"/></xs:restriction></xs:simpleType>\n      </xs:attribute>\n    </xs:complexType>\n  </xs:element>\n</xs:schema>',
  opts: [],
  run: ([xml, xsd]) => {
    need(xml, 'the XML'); need(xsd, 'the XSD schema');
    const r = xsdValidate(xml, xsd);
    let out = r.errors.length ? `Invalid: ${r.errors.length} problem(s)${r.errors.length >= 100 ? ' (stopped at 100)' : ''}\n\n${r.errors.join('\n')}` : `Valid: ${r.checked} element(s) checked against the schema`;
    out += `\n\nChecked: element structure (sequence, choice, all, minOccurs, maxOccurs), attributes, built-in types, restrictions (enumeration, pattern, length, ranges), list and union types, extension.`;
    out += `\nNot checked: ${r.notes.size ? [...r.notes].join('; ') + '; ' : ''}xs:key, xs:keyref and xs:unique (unless noted above), ID and IDREF uniqueness, namespaces, XSD 1.1 assertions.`;
    out += '\nThis is a hand-written checker for common XSD 1.0 schemas, not a full validator. Treat a "Valid" result as a good sign and confirm with xmllint or your toolchain before relying on it.';
    return out;
  },
});

function tool(o) { T.push(o); }
export default T;

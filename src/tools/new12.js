// Tools from free-browser-tools.md, batch 12 (Git, DevOps and config, then log parsing and analysis). See TOOLS.md for the contract.
// Skipped on purpose (need a network call, key or account): GitHub release notes, GitHub Actions SHA pinning, Docker Hub tags,
// npm update check, IP geolocation. Binary .evtx files are not parsed (XML export only); iOS crash symbolication needs dSYM files.
// Honest limits: every log parser here is a hand-written pattern match. Odd or customised formats can be missed, so each
// result says how many lines did not match. Reference facts (syslog codes, Heroku H-codes, HAProxy flags, pfSense filterlog
// fields, AWS log fields, Windows event titles) were read from the vendor documents or source and the source is named in the text.
const T = [];

const need = (t, n = 'input') => { if (!String(t ?? '').trim()) throw new Error(`Paste ${n} first.`); return String(t); };
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const num = (id, label, def) => ({ id, label, type: 'number', def });
const chk = (id, label, def) => ({ id, label, type: 'checkbox', def });
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const FILE = { accept: '.log,.txt,.gz,.json,.ndjson,.csv,text/*', multiple: true, optional: true };
const ONE = (s) => String(s);
const lines = (s) => String(s).replace(/^﻿/, '').split(/\r?\n/);
const nonEmpty = (s) => lines(s).filter((l) => l.trim() !== '');
const pad2 = (n) => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monIdx = (s) => MON.findIndex((m) => m.toLowerCase() === String(s).slice(0, 3).toLowerCase());

// Text from the box plus any dropped files; .gz files are inflated with DecompressionStream.
async function readAll(input, files) {
  const parts = [];
  if (String(input ?? '').trim()) parts.push({ name: 'pasted', text: String(input) });
  for (const f of files || []) {
    let buf = new Uint8Array(await f.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
      buf = new Uint8Array(await new Response(ds).arrayBuffer());
    }
    parts.push({ name: f.name || 'file', text: new TextDecoder().decode(buf) });
  }
  if (!parts.length) throw new Error('Paste log lines or choose a file first.');
  return parts;
}
async function readText(input, files) { return (await readAll(input, files)).map((p) => p.text).join('\n'); }

// ---------- output helpers ----------
const cell = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
function csvLine(a) { return a.map((v) => { const s = cell(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','); }
function asTable(rows, cols, maxw = 60) {
  if (!rows.length) return '(no rows)';
  const cut = (v) => { const s = cell(v).replace(/\s+/g, ' '); return s.length > maxw ? s.slice(0, maxw - 1) + '…' : s; };
  const w = cols.map((c) => Math.max(String(c).length, ...rows.map((r) => cut(r[c]).length)));
  const row = (f) => cols.map((c, i) => f(c).padEnd(w[i])).join('  ').trimEnd();
  return [row((c) => String(c)), w.map((n) => '-'.repeat(n)).join('  '), ...rows.map((r) => row((c) => cut(r[c])))].join('\n');
}
function emit(rows, cols, fmt, maxw) {
  if (fmt === 'JSON') return JSON.stringify(rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null]))), null, 2);
  if (fmt === 'CSV') return [csvLine(cols), ...rows.map((r) => csvLine(cols.map((c) => r[c])))].join('\n');
  return asTable(rows, cols, maxw);
}
const FMT = sel('fmt', 'Output', ['table', 'CSV', 'JSON']);
const MAXW = num('maxw', 'Max cell width (table)', 60);
const LIMIT = num('limit', 'Max rows shown (0 = all)', 200);
function count(arr, key) { const m = new Map(); for (const x of arr) { const k = key(x); if (k == null) continue; m.set(k, (m.get(k) || 0) + 1); } return m; }
function topRows(m, n, label = 'value') { return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n).map(([k, c]) => ({ [label]: k, count: c })); }
function bars(m, n = 10, total) {
  const rows = [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);
  const sum = total ?? [...m.values()].reduce((a, b) => a + b, 0), mx = rows.length ? rows[0][1] : 1;
  const w = Math.max(0, ...rows.map((r) => String(r[0]).length));
  return rows.map(([k, c]) => `${String(k).padEnd(w)}  ${String(c).padStart(7)}  ${(sum ? (100 * c / sum).toFixed(1) : '0.0').padStart(5)}%  ${'#'.repeat(Math.max(1, Math.round(24 * c / mx)))}`).join('\n') || '(none)';
}
const sec = (title, body) => `${title}\n${'='.repeat(title.length)}\n${body}\n`;
// nearest-rank percentile on a sorted array
const pctl = (s, p) => (s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil(p / 100 * s.length) - 1))] : NaN);
const f1 = (x, d = 1) => (Number.isFinite(x) ? (Math.round(x * 10 ** d) / 10 ** d).toString() : '-');
function stats(vals) {
  const s = vals.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  return { n: s.length, min: s[0], p50: pctl(s, 50), p90: pctl(s, 90), p95: pctl(s, 95), p99: pctl(s, 99), max: s[s.length - 1], mean: s.reduce((a, b) => a + b, 0) / s.length };
}
const fmtBytes = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KiB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MiB' : (n / 1073741824).toFixed(2) + ' GiB');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function parseJsonRecords(text) { // JSON array, {Records|records|logEntries|entries|items:[...]}, or one JSON object per line
  const t = text.trim();
  const unwrap = (v) => {
    if (Array.isArray(v)) return v.flatMap((x) => (isObj(x) && Array.isArray(x.records) ? x.records : [x]));
    if (isObj(v)) for (const k of ['Records', 'records', 'logEntries', 'entries', 'items', 'events']) if (Array.isArray(v[k])) return v[k];
    return [v];
  };
  if (t[0] === '[' || t[0] === '{') { try { return { recs: unwrap(JSON.parse(t)), bad: 0 }; } catch { /* maybe NDJSON */ } }
  const recs = []; let bad = 0;
  for (const l of nonEmpty(t)) { try { const v = JSON.parse(l); recs.push(...unwrap(v)); } catch { bad++; } }
  if (!recs.length) throw new Error('No JSON records found. Expected a JSON array, an object with a records list, or one JSON object per line.');
  return { recs, bad };
}
const dig = (o, path) => { let v = o; for (const k of path.split('.')) { if (v == null) return undefined; v = v[k]; } return v; };
const pick = (o, paths) => { for (const p of paths) { const v = dig(o, p); if (v !== undefined && v !== null && v !== '') return v; } return undefined; };

// split on spaces, keeping "quoted" and [bracketed] fields whole
function tokens(line) {
  const out = []; let i = 0; const n = line.length;
  while (i < n) {
    while (i < n && line[i] === ' ') i++;
    if (i >= n) break;
    const c = line[i];
    if (c === '"') { let j = i + 1; while (j < n && !(line[j] === '"' && line[j - 1] !== '\\')) j++; out.push(line.slice(i + 1, j)); i = j + 1; }
    else if (c === '[') { let j = line.indexOf(']', i); if (j < 0) j = n; out.push(line.slice(i + 1, j)); i = j + 1; }
    else { let j = line.indexOf(' ', i); if (j < 0) j = n; out.push(line.slice(i, j)); i = j; }
  }
  return out;
}

// ---------- timestamps ----------
function clfTime(s) { // 10/Oct/2000:13:55:36 -0700
  const m = /^(\d{1,2})\/(\w{3})\/(\d{4}):(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:\s*([+-])(\d\d):?(\d\d))?/.exec(s);
  if (!m || monIdx(m[2]) < 0) return NaN;
  const off = m[7] ? (m[7] === '-' ? -1 : 1) * (+m[8] * 60 + +m[9]) : 0;
  return Date.UTC(+m[3], monIdx(m[2]), +m[1], +m[4], +m[5], +m[6]) - off * 60000;
}
// Find the first timestamp in a line. Returns {ms, fmt, start, end} or null. defTz = offset minutes for times without a zone.
function findTs(line, o = {}) {
  const defTz = o.defTz || 0, year = o.year || new Date().getUTCFullYear();
  let m;
  if ((m = /(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d):(\d\d)(?:[.,](\d{1,9}))?(?:\s?(Z|[+-]\d\d(?::?\d\d)?|UTC|GMT)\b|(Z))?/.exec(line))) {
    let off = defTz, z = m[8] || m[9];
    if (z === 'Z' || z === 'UTC' || z === 'GMT') off = 0;
    else if (z) { const zz = /([+-])(\d\d):?(\d\d)?/.exec(z); off = (zz[1] === '-' ? -1 : 1) * (+zz[2] * 60 + +(zz[3] || 0)); }
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], m[7] ? Math.round(+('0.' + m[7]) * 1000) : 0) - off * 60000;
    return { ms, fmt: z ? 'ISO 8601' : 'date time (no zone)', start: m.index, end: m.index + m[0].length };
  }
  if ((m = /(\d{1,2})\/(\w{3})\/(\d{4}):(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:\s([+-]\d{4}))?/.exec(line)) && monIdx(m[2]) >= 0) {
    const ms = clfTime(m[0]); if (Number.isFinite(ms)) return { ms: m[7] ? ms : ms - defTz * 60000, fmt: 'Common Log Format', start: m.index, end: m.index + m[0].length };
  }
  if ((m = /(\d{4})\/(\d\d)\/(\d\d) (\d\d):(\d\d):(\d\d)/.exec(line))) return { ms: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - defTz * 60000, fmt: 'yyyy/mm/dd (no zone)', start: m.index, end: m.index + m[0].length };
  if ((m = /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{1,2}) (\w{3}) (\d{4}) (\d\d):(\d\d):(\d\d) ([+-]\d{4}|GMT|UTC)/.exec(line)) && monIdx(m[2]) >= 0) {
    const off = /^[+-]/.test(m[7]) ? (m[7][0] === '-' ? -1 : 1) * (+m[7].slice(1, 3) * 60 + +m[7].slice(3)) : 0;
    return { ms: Date.UTC(+m[3], monIdx(m[2]), +m[1], +m[4], +m[5], +m[6]) - off * 60000, fmt: 'RFC 2822', start: m.index, end: m.index + m[0].length };
  }
  if ((m = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) {1,2}(\d{1,2}) (\d\d):(\d\d):(\d\d)\b/.exec(line))) return { ms: Date.UTC(year, monIdx(m[1]), +m[2], +m[3], +m[4], +m[5]) - defTz * 60000, fmt: 'syslog (no year)', start: m.index, end: m.index + m[0].length };
  if ((m = /(?:^|[^\d.])(\d{2})-(\d\d) (\d\d):(\d\d):(\d\d)\.(\d{3})\b/.exec(line))) return { ms: Date.UTC(year, +m[1] - 1, +m[2], +m[3], +m[4], +m[5], +m[6]) - defTz * 60000, fmt: 'logcat (no year)', start: m.index + m[0].indexOf(m[1]), end: m.index + m[0].length };
  if ((m = /(?:^|[^\d.:])(\d{13})(?![\d])/.exec(line))) { const ms = +m[1]; if (ms > 9e11 && ms < 4.2e12) return { ms, fmt: 'epoch milliseconds', start: m.index + m[0].indexOf(m[1]), end: m.index + m[0].length }; }
  if ((m = /(?:^|[^\d.:])(\d{10})(?:\.(\d+))?(?![\d])/.exec(line))) { const s = +m[1]; if (s > 9e8 && s < 4.2e9) return { ms: Math.round((s + (m[2] ? +('0.' + m[2]) : 0)) * 1000), fmt: 'epoch seconds', start: m.index + m[0].indexOf(m[1]), end: m.index + m[0].length }; }
  return null;
}
const iso = (ms) => new Date(ms).toISOString();
function tzMinutes(s) {
  const t = String(s ?? '').trim();
  if (!t || /^(utc|z|gmt)$/i.test(t)) return 0;
  const m = /^([+-])(\d{1,2})(?::?(\d\d))?$/.exec(t);
  if (!m) throw new Error('Time zone must look like UTC, +02:00 or -0530.');
  return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0));
}
const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'NOTICE', 'WARN', 'ERROR', 'FATAL'];
function findLevel(line) {
  const m = /(?:^|[\s\[|<(,=:"])(TRACE|DEBUG|INFO|INFORMATION|NOTICE|WARN|WARNING|ERR|ERROR|SEVERE|CRIT|CRITICAL|FATAL|PANIC|EMERG|ALERT)(?=$|[\s\]|>),:"])/i.exec(line);
  if (!m) return null;
  const u = m[1].toUpperCase();
  return u === 'INFORMATION' ? 'INFO' : u === 'WARNING' ? 'WARN' : u === 'ERR' || u === 'SEVERE' ? 'ERROR' : ['CRIT', 'CRITICAL', 'PANIC', 'EMERG', 'ALERT'].includes(u) ? 'FATAL' : u;
}

// ---------- web access logs ----------
const ACCESS_RE = /^(\S+) (\S+) (\S+) \[([^\]]+)\] "((?:[^"\\]|\\.)*)" (\d{3}|-) (\d+|-)(?: "((?:[^"\\]|\\.)*)" "((?:[^"\\]|\\.)*)")?(.*)$/;
function parseAccess(line) {
  const m = ACCESS_RE.exec(line);
  if (!m) return null;
  const rq = /^(\S+) (\S+)(?: (\S+))?$/.exec(m[5]);
  const path = rq ? rq[2] : m[5];
  const extra = m[10].trim();
  const nums = extra.split(/\s+/).filter((x) => /^\d+(\.\d+)?$/.test(x));
  return {
    ip: m[1], user: m[3] === '-' ? '' : m[3], time: m[4], ms: clfTime(m[4]), request: m[5], method: rq ? rq[1] : '', path, route: path.split('?')[0],
    proto: rq ? rq[3] || '' : '', status: m[6] === '-' ? 0 : +m[6], bytes: m[7] === '-' ? 0 : +m[7], referer: m[8] ?? '', ua: m[9] ?? '', extra, lastNum: nums.length ? +nums[nums.length - 1] : NaN,
  };
}
const ACC_COLS = ['ip', 'time', 'method', 'path', 'status', 'bytes', 'referer', 'ua'];
function accessRecords(text) {
  const recs = []; let bad = 0, total = 0;
  for (const l of nonEmpty(text)) { total++; const r = parseAccess(l); if (r) recs.push(r); else bad++; }
  if (!recs.length) throw new Error('No line matched the Common or Combined Log Format. Try the Log Format Auto-Detector.');
  return { recs, bad, total };
}
const badNote = (bad, total) => (bad ? `\n${bad} of ${total} lines did not match and were skipped.` : '');
const statusClass = (s) => (s >= 100 ? Math.floor(s / 100) + 'xx' : 'none');

function yamlScalar(s) {
  if (s === '' || s === '~' || /^(null|Null|NULL)$/.test(s)) return null;
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^[-+]?(0|[1-9][0-9_]*)$/.test(s)) { const n = Number(s.replace(/_/g, '')); return Number.isSafeInteger(n) ? n : s; }
  if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
  if (/^0o[0-7]+$/.test(s)) return parseInt(s.slice(2), 8);
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(s)) return Number(s);
  if (/^[-+]?\.(inf|Inf|INF)$/.test(s)) return s[0] === '-' ? -Infinity : Infinity;
  if (/^\.(nan|NaN|NAN)$/.test(s)) return NaN;
  return s;
}
function ystripC(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (q === '"' && c === '\\') { i++; continue; } if (c === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } q = null; } continue; }
    if ((c === '"' || c === "'") && (i === 0 || /[\s\[{,:]/.test(s[i - 1]))) { q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}
function ykeyColon(s) {
  if (!s || '[{'.includes(s[0])) return -1;
  let i = 0;
  if (s[0] === '"' || s[0] === "'") {
    const q = s[0]; i = 1;
    while (i < s.length) { if (q === '"' && s[i] === '\\') i += 2; else if (s[i] === q) { if (q === "'" && s[i + 1] === "'") i += 2; else { i++; break; } } else i++; }
    return s[i] === ':' && (i + 1 >= s.length || s[i + 1] === ' ') ? i : -1;
  }
  for (; i < s.length; i++) { if (s[i] === ':' && (i + 1 === s.length || s[i + 1] === ' ')) return i; if (s[i] === '#' && s[i - 1] === ' ') return -1; }
  return -1;
}
const ESC = { n: '\n', t: '\t', r: '\r', 0: '\0', '\\': '\\', '"': '"', '/': '/', ' ': ' ', _: '\u00a0', N: '\u0085', L: '\u2028', P: '\u2029', e: '\x1b', a: '\x07', b: '\b', f: '\f', v: '\v' };
const yfold = (s) => s.replace(/[ \t]*\n(?:[ \t]*\n)*[ \t]*/g, (m) => { const n = (m.match(/\n/g) || []).length; return n === 1 ? ' ' : '\n'.repeat(n - 1); });
function readQuoted(s) { // s starts with a quote; returns {v,end} or null if unterminated
  const q = s[0]; let i = 1;
  for (; i < s.length; i++) {
    if (q === '"' && s[i] === '\\') { i++; continue; }
    if (s[i] === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } break; }
  }
  if (i >= s.length) return null;
  let raw = s.slice(1, i);
  if (q === "'") return { v: yfold(raw).replace(/''/g, "'"), end: i + 1 };
  raw = yfold(raw.replace(/\\\n[ \t]*/g, ''));
  const v = raw.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[\s\S])/g, (m, g) => (g.length > 1 && 'xuU'.includes(g[0]) ? String.fromCodePoint(parseInt(g.slice(1), 16)) : g in ESC ? ESC[g] : m));
  return { v, end: i + 1 };
}
function yflow(s, anchors) {
  let i = 0;
  const err = (m) => { throw new Error(`YAML flow error: ${m} in "${s.slice(0, 40)}"`); };
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const val = () => {
    ws();
    let anchor = null, m;
    while (s[i] === '&' || s[i] === '!') { m = /^[&!]\S*\s*/.exec(s.slice(i)); i += m[0].length; if (m[0][0] === '&') anchor = m[0].slice(1).trim(); }
    let v;
    const c = s[i];
    if (c === '[') {
      i++; v = [];
      for (;;) { ws(); if (s[i] === ']') { i++; break; } if (i >= s.length) err('unterminated ['); let x = val(); ws(); if (s[i] === ':') { i++; ws(); const y = s[i] === ',' || s[i] === ']' ? null : val(); x = { [String(x)]: y }; ws(); } v.push(x); if (s[i] === ',') i++; else if (s[i] !== ']') err("expected ',' or ']'"); }
    } else if (c === '{') {
      i++; v = {};
      for (;;) { ws(); if (s[i] === '}') { i++; break; } if (i >= s.length) err('unterminated {'); const k = val(); ws(); let y = null; if (s[i] === ':') { i++; ws(); y = s[i] === ',' || s[i] === '}' ? null : val(); } v[String(k)] = y; ws(); if (s[i] === ',') i++; else if (s[i] !== '}') err("expected ',' or '}'"); }
    } else if (c === '"' || c === "'") {
      const r = readQuoted(s.slice(i)); if (!r) err('unterminated string'); i += r.end; v = r.v;
    } else if (c === '*') {
      m = /^\*([^\s,\]}]+)/.exec(s.slice(i)); i += m[0].length; if (!(m[1] in anchors)) err(`unknown alias *${m[1]}`); v = anchors[m[1]];
    } else {
      let j = i;
      while (j < s.length && !',[]{}'.includes(s[j]) && !(s[j] === ':' && (j + 1 >= s.length || /[\s,\]}]/.test(s[j + 1])))) j++;
      v = yamlScalar(s.slice(i, j).trim()); i = j;
    }
    if (anchor) anchors[anchor] = v;
    return v;
  };
  const v = val(); ws();
  if (i < s.length) err('unexpected trailing text');
  return v;
}
function yflowDepth(s) {
  let d = 0, q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (q === '"' && c === '\\') i++; else if (c === q) q = null; continue; }
    if ((c === '"' || c === "'") && (i === 0 || /[\s\[{,:]/.test(s[i - 1]))) q = c; else if (c === '[' || c === '{') d++; else if (c === ']' || c === '}') d--;
  }
  return d;
}
function yamlDoc(L) {
  let p = 0;
  const anchors = {};
  const err = (m, n = p) => { throw new Error(`YAML error on line ${n + 1}: ${m}`); };
  const blank = (l) => { const t = l.trim(); return !t || t[0] === '#'; };
  const indent = (l) => { let k = 0; while (l[k] === ' ') k++; if (l[k] === '\t' && l.trim()) err('tabs are not allowed for indentation'); return k; };
  const skip = () => { while (p < L.length && blank(L[p])) p++; };
  const put = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

  function blockScalar(header, parentInd) {
    const m = /^([|>])([+-]?)(\d?)([+-]?)\s*$/.exec(header);
    if (!m) err('bad block scalar header');
    const chomp = m[2] || m[4];
    let bi = m[3] ? Math.max(parentInd, 0) + +m[3] : null;
    p++;
    const buf = [];
    while (p < L.length) {
      const l = L[p];
      if (!l.trim()) { buf.push(''); p++; continue; }
      const ind = indent(l);
      if (bi === null) { if (ind <= parentInd) break; bi = ind; }
      if (ind < bi) break;
      buf.push(l.slice(bi)); p++;
    }
    let trail = 0;
    while (buf.length && buf[buf.length - 1] === '') { buf.pop(); trail++; }
    let text = '';
    if (m[1] === '|') text = buf.join('\n');
    else buf.forEach((l, i) => {
      if (i === 0) { text = l; return; }
      const pr = buf[i - 1];
      if (l === '') text += '\n';
      else if (pr === '') text += l;
      else text += /^\s/.test(l) || /^\s/.test(pr) ? '\n' + l : ' ' + l;
    });
    if (chomp === '+') return text + (buf.length ? '\n' : '') + '\n'.repeat(trail);
    if (chomp === '-') return text;
    return buf.length ? text + '\n' : '';
  }

  function inline(rest, parentInd) {
    const c = rest[0];
    if (c === '|' || c === '>') return blockScalar(rest, parentInd);
    if (c === '[' || c === '{') {
      let acc = rest;
      while (yflowDepth(acc) > 0) { p++; if (p >= L.length) err('unterminated flow collection'); acc += ' ' + ystripC(L[p].trim()); }
      p++;
      try { return yflow(acc, anchors); } catch (e) { err(e.message.replace(/^YAML flow error: /, ''), p - 1); }
    }
    if (c === '"' || c === "'") {
      let acc = rest, r;
      while (!(r = readQuoted(acc))) { p++; if (p >= L.length) err('unterminated quoted string'); acc += '\n' + L[p]; }
      p++;
      if (ystripC(acc.slice(r.end)) !== '') err('unexpected text after quoted scalar', p - 1);
      return r.v;
    }
    const parts = [rest]; p++;
    let pendingBlank = 0;
    while (p < L.length) {
      const l = L[p];
      if (!l.trim()) { pendingBlank++; p++; continue; }
      if (l.trim()[0] === '#' || indent(l) <= parentInd) break;
      const t = ystripC(l.trim());
      parts.push(...Array(pendingBlank).fill('\n'), t); pendingBlank = 0; p++;
    }
    p -= pendingBlank; // leave trailing blanks unconsumed
    let out = '';
    parts.forEach((t, i) => { if (t === '\n') out += '\n'; else out += (i && !out.endsWith('\n') ? ' ' : '') + t; });
    return yamlScalar(out);
  }

  function value(rest, parentInd, seqOk) {
    let anchor = null, tag = null, m;
    for (;;) {
      if ((m = /^&(\S+)\s*/.exec(rest))) { anchor = m[1]; rest = rest.slice(m[0].length); }
      else if ((m = /^!(\S*)\s*/.exec(rest))) { tag = m[1]; rest = rest.slice(m[0].length); }
      else break;
    }
    let v;
    if (rest === '') {
      p++; skip();
      v = null;
      if (p < L.length) {
        const ind = indent(L[p]);
        if (ind > parentInd) v = block(ind);
        else if (seqOk && ind === parentInd && /^-(\s|$)/.test(L[p].slice(ind))) v = seq(ind);
      }
    } else if ((m = /^\*(\S+)$/.exec(rest))) {
      if (!(m[1] in anchors)) err(`unknown alias *${m[1]}`);
      v = anchors[m[1]]; p++;
    } else v = inline(rest, parentInd);
    if (tag === '!str') v = v == null ? '' : String(v);
    if (anchor) anchors[anchor] = v;
    return v;
  }

  function block(minInd) {
    skip();
    if (p >= L.length) return null;
    const ind = indent(L[p]);
    if (ind < minInd) return null;
    const t = ystripC(L[p].slice(ind));
    if (/^-(\s|$)/.test(t)) return seq(ind);
    if (ykeyColon(t) >= 0) return map(ind);
    return value(t, minInd - 1, false);
  }

  function seq(ind) {
    const out = [];
    for (;;) {
      skip();
      if (p >= L.length || indent(L[p]) !== ind) break;
      const t = L[p].slice(ind);
      if (!/^-(\s|$)/.test(t)) break;
      const after = t.slice(1), restRaw = after.trimStart(), sp = after.length - restRaw.length;
      const rest = ystripC(restRaw);
      if (rest === '') out.push(value('', ind, false));
      else if (/^-(\s|$)/.test(rest) || ykeyColon(rest) >= 0) { L[p] = ' '.repeat(ind + 1 + sp) + restRaw; out.push(block(ind + 1)); }
      else out.push(value(rest, ind, false));
    }
    return out;
  }

  function map(ind) {
    const out = {}, merges = [];
    for (;;) {
      skip();
      if (p >= L.length || indent(L[p]) !== ind) break;
      const t = ystripC(L[p].slice(ind)), c = ykeyColon(t);
      if (c < 0) { if (/^-(\s|$)/.test(t)) break; err('expected "key: value"'); }
      const kraw = t.slice(0, c).trim();
      const key = kraw[0] === '"' || kraw[0] === "'" ? (readQuoted(kraw) || err('bad quoted key')).v : kraw;
      const v = value(t.slice(c + 1).trim(), ind, true);
      if (key === '<<' && (isObj(v) || Array.isArray(v))) merges.push(v); else put(out, key, v);
    }
    for (const m of merges) for (const o of [].concat(m)) if (isObj(o)) for (const k of Object.keys(o)) if (!Object.hasOwn(out, k)) put(out, k, o[k]);
    return out;
  }

  skip();
  if (p >= L.length) return null;
  const v = block(0);
  skip();
  if (p < L.length) err('unexpected content, check indentation');
  return v;
}
function yamlParse(src) {
  const docs = [[]];
  for (const l of String(src).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (/^---(\s|$)/.test(l)) {
      if (docs[docs.length - 1].some((x) => x.trim() && x.trim()[0] !== '#')) docs.push([]);
      const rest = l.slice(3).trim();
      if (rest && rest[0] !== '#') docs[docs.length - 1].push(rest);
      continue;
    }
    if (/^\.\.\.\s*$/.test(l)) { docs.push([]); continue; }
    if (l[0] === '%' && !docs[docs.length - 1].length) continue;
    docs[docs.length - 1].push(l);
  }
  const res = docs.filter((d) => d.some((x) => x.trim() && x.trim()[0] !== '#')).map(yamlDoc);
  return res.length === 0 ? null : res.length === 1 ? res[0] : res;
}

// =====================================================================================================
// Git, DevOps and config
// =====================================================================================================

// ---------- Conventional Commit linter (rules of @commitlint/config-conventional, read from its source) ----------
const CC_TYPES = 'build,chore,ci,docs,feat,fix,perf,refactor,revert,style,test';
function lintCommit(msg, o) {
  const types = o.types.split(',').map((s) => s.trim()).filter(Boolean);
  const out = [], err = (r, m) => out.push({ lvl: 'error', r, m }), warn = (r, m) => out.push({ lvl: 'warning', r, m });
  const L = msg.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
  const header = L[0] ?? '';
  if (header !== header.trim()) err('header-trim', 'header must not start or end with whitespace');
  const h = header.trim();
  const m = /^(\w[\w-]*)(?:\(([^)]*)\))?(!)?:\s*(.*)$/.exec(h);
  let type = '', subject = '';
  if (m) { type = m[1]; subject = m[4]; } else {
    const t = /^([^:(!\s]+)/.exec(h); type = ''; subject = h;
    if (t && /:/.test(h)) { type = t[1]; subject = h.slice(h.indexOf(':') + 1).trim(); } else { err('type-empty', 'type may not be empty (expected "type(scope): subject")'); err('subject-empty', 'subject may not be empty'); }
  }
  if (m || type) {
    if (!type) err('type-empty', 'type may not be empty');
    else {
      if (type !== type.toLowerCase()) err('type-case', `type must be lower-case, found "${type}"`);
      if (!types.includes(type)) err('type-enum', `type must be one of [${types.join(', ')}], found "${type}"`);
    }
    if (!subject.trim()) err('subject-empty', 'subject may not be empty');
  }
  if (subject) {
    if (subject.endsWith('.')) err('subject-full-stop', 'subject may not end with a full stop');
    const first = subject[0];
    if (/\p{Lu}/u.test(first)) err('subject-case', 'subject must not be sentence-case, start-case, pascal-case or upper-case (it starts with a capital letter; approximate check)');
    else if (subject === subject.toUpperCase() && /\p{L}/u.test(subject)) err('subject-case', 'subject must not be upper-case');
  }
  if (h.length > o.maxHeader) err('header-max-length', `header must not be longer than ${o.maxHeader} characters, current length is ${h.length}`);
  if (L.length > 1 && L[1].trim() !== '') warn('body-leading-blank', 'body must have a leading blank line');
  // footer: last paragraph where every line is a trailer
  const rest = L.slice(1);
  const para = []; let cur = [];
  for (const l of rest) { if (l.trim() === '') { if (cur.length) para.push(cur); cur = []; } else cur.push(l); }
  if (cur.length) para.push(cur);
  const isTrailer = (l) => /^(BREAKING[ -]CHANGE|[A-Za-z][A-Za-z0-9-]*)(: | #)/.test(l);
  let footerAt = -1;
  if (para.length > 1 || (para.length === 1 && rest[0] !== undefined && rest[0].trim() === '')) { const last = para[para.length - 1]; if (last.some(isTrailer) && isTrailer(last[0])) footerAt = para.length - 1; }
  if (footerAt >= 0) {
    const firstFooterLine = rest.indexOf(para[footerAt][0]);
    if (firstFooterLine > 0 && rest[firstFooterLine - 1].trim() !== '') warn('footer-leading-blank', 'footer must have a leading blank line');
  }
  L.slice(1).forEach((l, i) => {
    if (l.length > o.maxLine) { const inFooter = footerAt >= 0 && para[footerAt].includes(l); err(inFooter ? 'footer-max-line-length' : 'body-max-line-length', `line ${i + 2} is longer than ${o.maxLine} characters (${l.length})`); }
  });
  return out;
}
T.push({
  id: 'conventional-commit-linter', cat: 'Dev Config', title: 'Conventional Commit Linter (commitlint Rules in the Browser)',
  desc: 'Check commit messages against the default commitlint conventional rules: type list, lower-case type, subject, full stop, header length, blank lines and line length. Several messages can be separated by a line of three dashes.',
  inputs: 1, labels: ['Commit message(s), separated by a line containing only ---'],
  opts: [txt('types', 'Allowed types (comma separated)', CC_TYPES), num('maxHeader', 'Max header length', 100), num('maxLine', 'Max body/footer line length', 100)],
  sample: 'feat(parser): add support for nested arrays\n\nThe parser now accepts arrays inside arrays.\n\nCloses #12\n---\nFix: Broken build.\n---\nupdated stuff',
  run: ([i], o) => {
    need(i, 'a commit message');
    const msgs = ONE(i).split(/^---\s*$/m).map((s) => s.replace(/^\n+/, '')).filter((s) => s.trim());
    let bad = 0;
    const out = msgs.map((msg, n) => {
      const res = lintCommit(msg, { types: o.types || CC_TYPES, maxHeader: +o.maxHeader || 100, maxLine: +o.maxLine || 100 });
      const errs = res.filter((r) => r.lvl === 'error'), warns = res.filter((r) => r.lvl === 'warning');
      if (errs.length) bad++;
      return [`#${n + 1}  ${msg.split('\n')[0]}`, errs.length ? `  RESULT: ${errs.length} error(s), ${warns.length} warning(s)` : warns.length ? `  RESULT: OK with ${warns.length} warning(s)` : '  RESULT: OK', ...res.map((r) => `  ${r.lvl === 'error' ? 'error  ' : 'warning'} ${r.r}: ${r.m}`)].join('\n');
    });
    return `${msgs.length} message(s), ${bad} with errors\n\n${out.join('\n\n')}\n\nRules: the defaults of @commitlint/config-conventional (type-enum, type-case, type-empty, subject-empty, subject-full-stop, subject-case, header-max-length, header-trim, body/footer leading blank and max line length). Subject case is an approximation: a leading capital letter is reported.`;
  },
});

// ---------- Unified diff viewer ----------
function parseUnified(text) {
  const files = []; let f = null, h = null;
  const active = () => h && (h.ro < h.oc || h.rn < h.nc);
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    let m;
    if (active()) {
      const c = raw[0];
      if (c === '+') { h.lines.push({ t: '+', s: raw.slice(1) }); h.rn++; continue; }
      if (c === '-') { h.lines.push({ t: '-', s: raw.slice(1) }); h.ro++; continue; }
      if (c === ' ' || raw === '') { h.lines.push({ t: ' ', s: raw.slice(1) }); h.ro++; h.rn++; continue; }
    }
    if (raw[0] === '\\' && h) { h.lines.push({ t: '\\', s: raw }); continue; }
    if ((m = /^diff --git a\/(.+?) b\/(.+)$/.exec(raw))) { f = { a: m[1], b: m[2], hunks: [] }; files.push(f); h = null; continue; }
    if (raw.startsWith('--- ') && !active()) { if (!f || f.hunks.length) { f = { a: '', b: '', hunks: [] }; files.push(f); } f.a = raw.slice(4).replace(/^a\//, '').split('\t')[0]; h = null; continue; }
    if (raw.startsWith('+++ ') && f && !active()) { f.b = raw.slice(4).replace(/^b\//, '').split('\t')[0]; continue; }
    if ((m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(raw))) {
      if (!f) { f = { a: '(unnamed)', b: '(unnamed)', hunks: [] }; files.push(f); }
      h = { head: raw, ol: +m[1], nl: +m[3], oc: m[2] === undefined ? 1 : +m[2], nc: m[4] === undefined ? 1 : +m[4], lines: [], ro: 0, rn: 0 }; f.hunks.push(h);
    }
  }
  if (!files.some((x) => x.hunks.length)) throw new Error('No diff hunks found. Paste output of git diff, git show or a .patch file.');
  return files.filter((x) => x.hunks.length);
}
T.push({
  id: 'unified-diff-viewer', cat: 'Text', title: 'Git Diff Viewer: Unified Diff or Patch Side by Side',
  desc: 'Paste git diff or patch output and read each file as two columns with removed and added lines marked, line numbers and a change count. Nothing is uploaded.',
  inputs: 1, labels: ['Unified diff / patch'],
  opts: [sel('layout', 'Layout', ['side by side', 'unified'])],
  sample: 'diff --git a/src/app.js b/src/app.js\nindex 83db48f..bf2a3c1 100644\n--- a/src/app.js\n+++ b/src/app.js\n@@ -1,6 +1,7 @@\n const port = 3000;\n-const host = "localhost";\n+const host = process.env.HOST || "localhost";\n+const debug = false;\n \n function start() {\n   listen(host, port);\n }\n',
  run: ([i], o) => {
    const files = parseUnified(need(i, 'a diff'));
    let add = 0, del = 0;
    const body = files.map((f) => {
      const name = f.b && f.b !== f.a && f.b !== '/dev/null' ? `${f.a} → ${f.b}` : f.a === '/dev/null' ? f.b : f.a;
      const hs = f.hunks.map((h) => {
        let ol = h.ol, nl = h.nl; const rows = [];
        const L = h.lines;
        for (let k = 0; k < L.length;) {
          if (L[k].t === ' ') { rows.push([ol++, L[k].s, nl++, L[k].s, 'c', 'c']); k++; continue; }
          if (L[k].t === '\\') { rows.push([null, L[k].s, null, '', 'n', 'n']); k++; continue; }
          const ds = [], as = [];
          while (k < L.length && L[k].t === '-') ds.push(L[k++].s);
          while (k < L.length && L[k].t === '+') as.push(L[k++].s);
          del += ds.length; add += as.length;
          for (let j = 0; j < Math.max(ds.length, as.length); j++) rows.push([j < ds.length ? ol++ : null, ds[j] ?? '', j < as.length ? nl++ : null, as[j] ?? '', j < ds.length ? 'd' : 'e', j < as.length ? 'a' : 'e']);
        }
        if (o.layout === 'unified') {
          // unified: re-walk original lines so order is kept
          let r = ''; let a = h.ol, b = h.nl;
          for (const l of L) {
            if (l.t === ' ') r += `<tr><td class=n>${a++}</td><td class=n>${b++}</td><td class=c>&nbsp;${esc(l.s)}</td></tr>`;
            else if (l.t === '-') r += `<tr><td class=n>${a++}</td><td class=n></td><td class=d>-${esc(l.s)}</td></tr>`;
            else if (l.t === '+') r += `<tr><td class=n></td><td class=n>${b++}</td><td class=a>+${esc(l.s)}</td></tr>`;
            else r += `<tr><td class=n></td><td class=n></td><td class=c>${esc(l.s)}</td></tr>`;
          }
          return `<tr><td colspan=3 class=h>${esc(h.head)}</td></tr>${r}`;
        }
        return `<tr><td colspan=4 class=h>${esc(h.head)}</td></tr>` + rows.map((x) => `<tr><td class=n>${x[0] ?? ''}</td><td class=${x[4]}>${esc(x[1])}</td><td class=n>${x[2] ?? ''}</td><td class=${x[5]}>${esc(x[3])}</td></tr>`).join('');
      }).join('');
      return `<h2>${esc(name)}</h2><table>${hs}</table>`;
    }).join('');
    return { html: `<!doctype html><meta charset=utf-8><title>Diff</title><style>:root{color-scheme:light dark;--a:#d9f5dd;--d:#ffdcd7;--e:#f0f0f0}@media(prefers-color-scheme:dark){:root{--a:#16381f;--d:#4a1d1d;--e:#262626}}body{font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;margin:8px}h2{font-size:14px;margin:16px 0 4px}table{border-collapse:collapse;width:100%;table-layout:fixed}td{white-space:pre-wrap;word-break:break-all;vertical-align:top;padding:0 4px}td.n{width:3.5em;text-align:right;opacity:.7}td.a{background:var(--a)}td.d{background:var(--d)}td.e{background:var(--e)}td.h{opacity:.75;padding:4px}</style><p role=status>${files.length} file(s), +${add} added, -${del} removed</p>${body}` };
  },
});

// ---------- GitLab CI linter ----------
const GL_JOB_KEYS = 'after_script allow_failure artifacts before_script cache coverage dast_configuration dependencies environment except extends hooks id_tokens identity image inherit interruptible manual_confirmation needs only pages parallel release resource_group retry rules run script secrets services stage start_in tags timeout trigger variables when'.split(' ');
const GL_GLOBAL = 'default include stages workflow variables spec image services cache before_script after_script'.split(' ');
T.push({
  id: 'gitlab-ci-linter', cat: 'Dev Config', title: 'GitLab CI Linter: .gitlab-ci.yml Structure Check',
  desc: 'Check .gitlab-ci.yml for YAML errors, jobs without script, unknown stages, needs and extends that point nowhere, bad when values and keywords outside the documented list. It does not call GitLab.',
  inputs: 1, labels: ['.gitlab-ci.yml'],
  sample: 'stages: [build, test, deploy]\n\nbuild:\n  stage: build\n  script:\n    - npm ci\n    - npm run build\n\ntest:\n  stage: tst\n  needs: [build, lint]\n  script: npm test\n  retries: 2\n\ndeploy:\n  stage: deploy\n  when: sometimes\n  only: [main]\n',
  run: ([i]) => {
    let doc;
    try { doc = yamlParse(need(i, 'a .gitlab-ci.yml')); } catch (e) { throw new Error('YAML error: ' + e.message.replace(/^YAML error /, '')); }
    if (!isObj(doc)) throw new Error('The file must be a YAML mapping of jobs and keywords.');
    const errors = [], review = [], info = [];
    const stages = Array.isArray(doc.stages) ? doc.stages.map(String) : ['build', 'test', 'deploy'];
    const allStages = new Set(['.pre', '.post', ...stages]);
    if (doc.stages !== undefined && !Array.isArray(doc.stages)) errors.push('stages must be a list of names');
    const jobs = {}, hidden = {};
    for (const [k, v] of Object.entries(doc)) {
      if (GL_GLOBAL.includes(k) && !(k === 'pages' )) continue;
      if (k.startsWith('.')) { hidden[k] = v; continue; }
      if (!isObj(v)) { errors.push(`"${k}" is not a job (a job is a mapping with script) and not a known global keyword`); continue; }
      jobs[k] = v;
    }
    const names = new Set([...Object.keys(jobs), ...Object.keys(hidden)]);
    if (!Object.keys(jobs).length) errors.push('no jobs found');
    const get = (j, seen = new Set()) => { // resolve extends for stage/script presence
      let r = { ...j };
      const ex = j.extends === undefined ? [] : [].concat(j.extends);
      for (const e of ex) { const p = jobs[e] || hidden[e]; if (p && !seen.has(e)) r = { ...get(p, new Set([...seen, e])), ...r }; }
      return r;
    };
    for (const [n, j] of Object.entries(jobs)) {
      for (const k of Object.keys(j)) if (!GL_JOB_KEYS.includes(k)) review.push(`${n}: keyword "${k}" is not in the documented job keyword list (typo? "${k}" will be ignored or rejected by GitLab)`);
      const r = get(j);
      for (const e of j.extends === undefined ? [] : [].concat(j.extends)) if (!names.has(e)) errors.push(`${n}: extends "${e}" but no job or template with that name exists in this file (it may come from include:, not checked)`);
      if (r.script === undefined && r.trigger === undefined && r.run === undefined) errors.push(`${n}: job has no script, trigger or run`);
      else if (r.script !== undefined && !(typeof r.script === 'string' || (Array.isArray(r.script) && r.script.length))) errors.push(`${n}: script must be a string or a non-empty list`);
      const st = r.stage ?? 'test';
      if (!allStages.has(String(st))) errors.push(`${n}: stage "${st}" is not in stages (${[...allStages].join(', ')})`);
      if (r.when !== undefined && !['on_success', 'on_failure', 'always', 'manual', 'delayed', 'never'].includes(r.when)) errors.push(`${n}: when "${r.when}" is not one of on_success, on_failure, always, manual, delayed, never`);
      if (r.when === 'delayed' && r.start_in === undefined) errors.push(`${n}: when: delayed needs start_in`);
      if (r.needs !== undefined) {
        for (const x of [].concat(r.needs)) {
          const nm = isObj(x) ? x.job : x;
          if (isObj(x) && (x.pipeline || x.project)) continue;
          if (!jobs[nm]) { if (!(isObj(x) && x.optional)) errors.push(`${n}: needs "${nm}" but there is no such job in this file`); }
          else if (nm === n) errors.push(`${n}: a job cannot need itself`);
          else if (allStages.size && [...allStages].indexOf(String(get(jobs[nm]).stage ?? 'test')) > [...allStages].indexOf(String(st)) && allStages.has(String(st))) errors.push(`${n}: needs "${nm}", which runs in a later stage`);
        }
      }
      if (r.dependencies !== undefined) for (const d of [].concat(r.dependencies)) if (!jobs[d]) errors.push(`${n}: dependencies "${d}" is not a job in this file`);
      if (j.only !== undefined || j.except !== undefined) review.push(`${n}: only/except are older keywords; GitLab recommends rules for new pipelines`);
      if (r.retry !== undefined && !(Number.isInteger(r.retry) || isObj(r.retry))) errors.push(`${n}: retry must be a number from 0 to 2 or a mapping`);
      if (Number.isInteger(r.retry) && (r.retry < 0 || r.retry > 2)) errors.push(`${n}: retry must be 0, 1 or 2`);
      if (r.rules !== undefined && !Array.isArray(r.rules)) errors.push(`${n}: rules must be a list`);
      if (r.rules !== undefined && (j.only !== undefined || j.except !== undefined)) errors.push(`${n}: rules cannot be combined with only/except`);
      if (r.image === undefined && doc.image === undefined && !(doc.default && doc.default.image)) info.push(`${n}: no image set (the runner default is used)`);
    }
    for (const [n, j] of Object.entries(hidden)) if (!isObj(j)) review.push(`${n}: hidden key is not a mapping (fine if it is a YAML anchor value)`);
    if (doc.include !== undefined) info.push('include: files are not fetched, so jobs, stages and templates that come from them show up as unknown references above');
    const list = (t, a) => (a.length ? `${t} (${a.length})\n${a.map((x) => '  - ' + x).join('\n')}\n\n` : '');
    return `${Object.keys(jobs).length} job(s), ${errors.length} problem(s), ${review.length} to review\n\n${list('Problems', errors)}${list('Review', review)}${list('Notes', info)}${errors.length ? '' : 'No structural problems found.\n'}\nChecked against the keyword list of the GitLab CI/CD YAML reference (docs.gitlab.com/ci/yaml, read ${'2026-10'}). This is not GitLab\'s own linter: it cannot see includes, variables, rules logic or runner settings.`;
  },
});

// ---------- Helm values diff ----------
function flatten(v, p = '', out = {}) {
  if (isObj(v)) { const k = Object.keys(v); if (!k.length && p) out[p] = '{}'; for (const x of k) flatten(v[x], p ? `${p}.${x}` : x, out); }
  else if (Array.isArray(v)) { if (!v.length && p) out[p] = '[]'; v.forEach((x, i) => flatten(x, `${p}[${i}]`, out)); }
  else out[p] = v;
  return out;
}
const showV = (v) => (typeof v === 'string' ? JSON.stringify(v) : v === null ? 'null' : String(v));
T.push({
  id: 'helm-values-diff', cat: 'Infra', title: 'Helm Values Diff: Compare Two values.yaml Files by Key Path',
  desc: 'Compare two Helm values (or any YAML) files key by key. Nested keys become dotted paths and each one is marked added, removed or changed, with the old and new value.',
  inputs: 2, labels: ['Values A (old)', 'Values B (new)'],
  opts: [chk('same', 'Also list unchanged keys', false), sel('fmt', 'Output', ['table', 'CSV', 'JSON'])],
  sample: 'replicaCount: 2\nimage:\n  repository: nginx\n  tag: "1.25"\nservice:\n  port: 80\nresources:\n  limits:\n    cpu: 200m\n',
  sample2: 'replicaCount: 3\nimage:\n  repository: nginx\n  tag: "1.27"\nservice:\n  port: 80\n  type: ClusterIP\ningress:\n  enabled: true\n',
  run: ([a, b], o) => {
    const parse = (s, n) => { try { const d = yamlParse(need(s, n)); return isObj(d) ? d : Array.isArray(d) && isObj(d[0]) ? d[0] : {}; } catch (e) { throw new Error(`${n}: ${e.message}`); } };
    const A = flatten(parse(a, 'values A')), B = flatten(parse(b, 'values B'));
    const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort();
    const rows = [];
    for (const k of keys) {
      const ia = k in A, ib = k in B;
      const st = ia && ib ? (JSON.stringify(A[k]) === JSON.stringify(B[k]) ? 'same' : 'changed') : ia ? 'removed' : 'added';
      if (st === 'same' && !o.same) continue;
      rows.push({ status: st, key: k, old: ia ? showV(A[k]) : '', new: ib ? showV(B[k]) : '' });
    }
    const c = (s) => rows.filter((r) => r.status === s).length;
    if (!rows.length) return 'No differences: both files have the same keys and values.';
    return `${c('added')} added, ${c('removed')} removed, ${c('changed')} changed\n\n` + emit(rows, ['status', 'key', 'old', 'new'], o.fmt, 60);
  },
});

// ---------- Kubernetes quantity converter ----------
const QSUF = { '': 1n, k: 1000n, M: 1000n ** 2n, G: 1000n ** 3n, T: 1000n ** 4n, P: 1000n ** 5n, E: 1000n ** 6n, Ki: 1024n, Mi: 1024n ** 2n, Gi: 1024n ** 3n, Ti: 1024n ** 4n, Pi: 1024n ** 5n, Ei: 1024n ** 6n };
function parseQty(s) { // returns value in milli-units as BigInt
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(m|k|M|G|T|P|E|Ki|Mi|Gi|Ti|Pi|Ei|[eE][+-]?\d+)?$/.exec(s.trim());
  if (!m || (!m[2] && !m[3])) throw new Error(`"${s}" is not a Kubernetes quantity (examples: 250m, 0.5, 1.5Gi, 512Mi, 2e3)`);
  const frac = m[3] || '', digits = BigInt((m[2] || '0') + frac), sc = 10n ** BigInt(frac.length);
  let milli;
  if (m[4] === 'm') milli = (digits + sc - 1n) / sc; // sub-milli values round up, as Kubernetes does
  else if (m[4] && /^[eE]/.test(m[4])) { const e = BigInt(m[4].slice(1)); milli = e >= 0n ? (digits * 1000n * 10n ** e) / sc : (digits * 1000n) / (sc * 10n ** -e); }
  else milli = (digits * 1000n * QSUF[m[4] || '']) / sc;
  return m[1] === '-' ? -milli : milli;
}
function canon(milli, binary) {
  if (milli % 1000n !== 0n) return milli + 'm';
  const v = milli / 1000n, ent = binary ? [['Ei', QSUF.Ei], ['Pi', QSUF.Pi], ['Ti', QSUF.Ti], ['Gi', QSUF.Gi], ['Mi', QSUF.Mi], ['Ki', QSUF.Ki]] : [['E', QSUF.E], ['P', QSUF.P], ['T', QSUF.T], ['G', QSUF.G], ['M', QSUF.M], ['k', QSUF.k]];
  if (v === 0n) return '0';
  for (const [s, f] of ent) if (v % f === 0n) return v / f + s;
  return String(v);
}
const dec = (n, d) => { const neg = n < 0n; if (neg) n = -n; const q = n / 10n ** BigInt(d), r = String(n % 10n ** BigInt(d)).padStart(d, '0').replace(/0+$/, ''); return (neg ? '-' : '') + q + (r ? '.' + r : ''); };
T.push({
  id: 'k8s-quantity-converter', cat: 'Infra', title: 'Kubernetes CPU and Memory Quantity Converter (250m, 1.5Gi)',
  desc: 'Convert Kubernetes resource quantities such as 250m, 0.5, 1.5Gi, 512Mi or 2e3 into cores, millicores, bytes, MiB and GiB, plus the canonical form Kubernetes would print.',
  inputs: 1, labels: ['Quantities, one per line'],
  sample: '250m\n1.5\n512Mi\n1.5Gi\n2G\n128974848\n129e6',
  run: ([i]) => {
    const f = (x) => +x.toPrecision(6);
    const rows = nonEmpty(need(i, 'quantities')).map((l) => {
      const s = l.trim(), m = parseQty(s);
      return { quantity: s, cores: dec(m, 3), millicores: String(m), bytes: m % 1000n === 0n ? String(m / 1000n) : '(fractional)', MiB: m % 1000n === 0n ? f(Number(m) / 1000 / 1048576) : '-', GiB: m % 1000n === 0n ? f(Number(m) / 1000 / 1073741824) : '-', canonical: canon(m, /(Ki|Mi|Gi|Ti|Pi|Ei)$/.test(s)) };
    });
    return asTable(rows, ['quantity', 'cores', 'millicores', 'bytes', 'MiB', 'GiB', 'canonical'], 24) + '\n\ncores/millicores read the value as CPU. bytes, MiB and GiB read the same number as memory (MiB = 1024*1024 bytes). "canonical" is the form Kubernetes prints (largest suffix with no fraction; 1.5 becomes 1500m, 1.5Gi becomes 1536Mi). Values below 1m are rounded up to 1m. Suffix rules from the Kubernetes Quantity API reference.';
  },
});

// ---------- tsconfig explainer ----------
const TS_OPT = {
  target: 'JavaScript language version of the emitted code. Newer targets keep modern syntax; older ones are down-levelled.',
  module: 'Module system of the emitted code (CommonJS, ESNext, NodeNext ...).',
  moduleResolution: 'How import paths are looked up. NodeNext and Bundler match modern Node and bundler behaviour.',
  lib: 'Built-in type declarations to include (DOM, ES2022 ...). Setting it replaces the defaults from target.',
  jsx: 'How JSX is emitted or preserved (preserve, react, react-jsx ...).',
  strict: 'Turns on the whole family of strict checks (strictNullChecks, noImplicitAny, strictFunctionTypes ...).',
  noImplicitAny: 'Error when a type would silently become any.',
  strictNullChecks: 'null and undefined are distinct types and must be handled.',
  strictFunctionTypes: 'Stricter (contravariant) checking of function parameter types.',
  strictBindCallApply: 'Checks the arguments of bind, call and apply.',
  strictPropertyInitialization: 'Class properties must be set in the constructor or have an initializer.',
  strictBuiltinIteratorReturn: 'Built-in iterators return undefined instead of any when done.',
  noImplicitThis: 'Error on this with an implied any type.',
  useUnknownInCatchVariables: 'catch clause variables are unknown instead of any.',
  alwaysStrict: 'Emits "use strict" and parses in strict mode.',
  noUnusedLocals: 'Error on local variables that are never read.',
  noUnusedParameters: 'Error on function parameters that are never read.',
  exactOptionalPropertyTypes: 'Optional properties cannot be set to undefined unless the type says so.',
  noImplicitReturns: 'Error when some code paths of a function do not return a value.',
  noFallthroughCasesInSwitch: 'Error on switch cases that fall through.',
  noUncheckedIndexedAccess: 'Index access (obj[key], arr[i]) adds undefined to the type.',
  noImplicitOverride: 'Overriding members need the override keyword.',
  noPropertyAccessFromIndexSignature: 'Properties from an index signature must be read with brackets.',
  allowUnreachableCode: 'Controls reporting of unreachable code (undefined = editor hint, false = error).',
  allowUnusedLabels: 'Controls reporting of unused labels.',
  esModuleInterop: 'Emit helpers so CommonJS modules can be imported with default import syntax.',
  allowSyntheticDefaultImports: 'Allow default imports from modules with no default export (types only).',
  forceConsistentCasingInFileNames: 'Error when the same file is imported with different letter case.',
  isolatedModules: 'Reject code that cannot be compiled one file at a time (needed by many transpilers).',
  verbatimModuleSyntax: 'Keep import and export statements exactly as written; use "import type" for types.',
  resolveJsonModule: 'Allow importing .json files.',
  allowJs: 'Allow JavaScript files to be part of the program.',
  checkJs: 'Report type errors in JavaScript files (needs allowJs).',
  declaration: 'Emit .d.ts files next to the output.',
  declarationMap: 'Emit source maps for .d.ts files.',
  declarationDir: 'Folder for emitted .d.ts files.',
  emitDeclarationOnly: 'Emit only .d.ts files, no JavaScript.',
  sourceMap: 'Emit .map files so debuggers can show the TypeScript source.',
  inlineSourceMap: 'Put the source map inside the .js file.',
  inlineSources: 'Include the TypeScript source in the source map.',
  outDir: 'Folder for emitted files.',
  outFile: 'Bundle all output into one file (only with module amd or system).',
  rootDir: 'Root folder of input files; controls the layout inside outDir.',
  rootDirs: 'Several folders treated as one virtual root when resolving relative imports.',
  baseUrl: 'Base folder for resolving non-relative import names.',
  paths: 'Import aliases (e.g. "@/*": ["src/*"]). Does not rewrite emitted code.',
  typeRoots: 'Folders that hold @types style packages.',
  types: 'Only these @types packages are included globally. An empty list includes none.',
  noEmit: 'Type-check only, write no files.',
  noEmitOnError: 'Do not write output if there are type errors.',
  removeComments: 'Strip comments from emitted JavaScript.',
  importHelpers: 'Import helpers such as __extends from tslib instead of repeating them in each file.',
  downlevelIteration: 'Accurate for-of, spread and destructuring when targeting ES5 or ES3.',
  incremental: 'Save build information so later runs only re-check what changed.',
  tsBuildInfoFile: 'Where the incremental build information is stored.',
  composite: 'Required for project references; enables incremental builds and declarations.',
  skipLibCheck: 'Skip type checking of .d.ts files. Faster, but hides errors in libraries.',
  skipDefaultLibCheck: 'Skip type checking of the default lib .d.ts files.',
  experimentalDecorators: 'Enable the older (stage 2) decorator syntax.',
  emitDecoratorMetadata: 'Emit design-time type metadata for decorated declarations.',
  useDefineForClassFields: 'Emit class fields with define semantics (the default for ES2022 and newer targets).',
  isolatedDeclarations: 'Require declarations that can be generated per file without type inference.',
  moduleDetection: 'How a file is decided to be a module or a script (auto, legacy, force).',
  allowImportingTsExtensions: 'Allow imports that end in .ts. Needs noEmit or emitDeclarationOnly.',
  rewriteRelativeImportExtensions: 'Rewrite .ts extensions in relative imports to .js on emit.',
  erasableSyntaxOnly: 'Error on TypeScript syntax that cannot simply be erased (enums, namespaces, parameter properties).',
  noCheck: 'Skip type checking entirely.',
  noLib: 'Do not include the default lib .d.ts files.',
  stripInternal: 'Drop declarations marked @internal from the .d.ts output.',
  preserveConstEnums: 'Keep const enum declarations in the output.',
  pretty: 'Colour and format error messages.',
  charset: 'Deprecated. Has no effect.',
  newLine: 'Line ending for emitted files (CRLF or LF).',
  customConditions: 'Extra conditions used when resolving package.json exports and imports.',
  resolvePackageJsonExports: 'Use the exports field of package.json when resolving imports.',
  resolvePackageJsonImports: 'Use the imports field of package.json when resolving # imports.',
  allowArbitraryExtensions: 'Allow imports of files with unknown extensions that have a matching .d.ts file.',
  allowUmdGlobalAccess: 'Allow UMD globals to be used from module files.',
  maxNodeModuleJsDepth: 'How deep to look into JavaScript inside node_modules (with allowJs).',
  jsxImportSource: 'Package that provides the JSX runtime for react-jsx.',
  jsxFactory: 'Function used for JSX elements with the classic runtime (default React.createElement).',
};
const TS_ROOT = { extends: 'Another tsconfig (or list of them) to inherit from.', include: 'Glob patterns of files that belong to the program.', exclude: 'Glob patterns removed from include. Defaults to node_modules and the output folder.', files: 'An explicit list of files; no globs.', references: 'Other projects this one depends on (project references).', compilerOptions: 'Compiler settings.', watchOptions: 'Settings for watch mode.', typeAcquisition: 'Automatic type acquisition for JavaScript projects in editors.' };
const TS_KNOWN = new Set('allowArbitraryExtensions allowImportingTsExtensions allowJs allowSyntheticDefaultImports allowUmdGlobalAccess allowUnreachableCode allowUnusedLabels alwaysStrict assumeChangesOnlyAffectDirectDependencies baseUrl charset checkJs composite customConditions declaration declarationDir declarationMap diagnostics disableFilenameBasedTypeAcquisition disableReferencedProjectLoad disableSizeLimit disableSolutionSearching disableSourceOfProjectReferenceRedirect downlevelIteration emitBOM emitDeclarationOnly emitDecoratorMetadata erasableSyntaxOnly esModuleInterop exactOptionalPropertyTypes experimentalDecorators explainFiles extendedDiagnostics forceConsistentCasingInFileNames generateCpuProfile generateTrace importHelpers importsNotUsedAsValues incremental inlineSourceMap inlineSources isolatedDeclarations isolatedModules jsx jsxFactory jsxFragmentFactory jsxImportSource keyofStringsOnly lib libReplacement listEmittedFiles listFiles mapRoot maxNodeModuleJsDepth module moduleDetection moduleResolution moduleSuffixes newLine noCheck noEmit noEmitHelpers noEmitOnError noErrorTruncation noFallthroughCasesInSwitch noImplicitAny noImplicitOverride noImplicitReturns noImplicitThis noImplicitUseStrict noLib noPropertyAccessFromIndexSignature noResolve noStrictGenericChecks noUncheckedIndexedAccess noUncheckedSideEffectImports noUnusedLocals noUnusedParameters out outDir outFile paths plugins preserveConstEnums preserveSymlinks preserveValueImports preserveWatchOutput pretty reactNamespace removeComments resolveJsonModule resolvePackageJsonExports resolvePackageJsonImports rewriteRelativeImportExtensions rootDir rootDirs skipDefaultLibCheck skipLibCheck sourceMap sourceRoot strict strictBindCallApply strictBuiltinIteratorReturn strictFunctionTypes strictNullChecks strictPropertyInitialization stripInternal suppressExcessPropertyErrors suppressImplicitAnyIndexErrors target traceResolution tsBuildInfoFile typeRoots types useDefineForClassFields useUnknownInCatchVariables verbatimModuleSyntax'.split(' '));
function stripJsonc(s) { // remove // and /* */ comments and trailing commas, respecting strings
  let o = '', i = 0; const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '"') { let j = i + 1; while (j < n && s[j] !== '"') j += s[j] === '\\' ? 2 : 1; o += s.slice(i, j + 1); i = j + 1; }
    else if (c === '/' && s[i + 1] === '/') { while (i < n && s[i] !== '\n') i++; }
    else if (c === '/' && s[i + 1] === '*') { const j = s.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; }
    else { o += c; i++; }
  }
  return o.replace(/,(\s*[}\]])/g, '$1');
}
T.push({
  id: 'tsconfig-explainer', cat: 'Dev Config', title: 'tsconfig.json Explainer: What Each Option Does',
  desc: 'Paste a tsconfig.json (comments and trailing commas are fine) and get one plain-language line per option, its value, and a review list for unknown options and risky settings.',
  inputs: 1, labels: ['tsconfig.json'],
  sample: '{\n  // Strict app config\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "NodeNext",\n    "strict": true,\n    "skipLibCheck": true,\n    "noUncheckedIndexedAccess": true,\n    "outDir": "dist",\n    "esModuleInterop": true,\n    "stricts": true,\n  },\n  "include": ["src"],\n}',
  run: ([i]) => {
    let j;
    try { j = JSON.parse(stripJsonc(need(i, 'a tsconfig.json'))); } catch (e) { throw new Error('Not valid JSON (comments and trailing commas are allowed): ' + e.message); }
    if (!isObj(j)) throw new Error('A tsconfig.json must be a JSON object.');
    const out = [], review = [];
    for (const [k, v] of Object.entries(j)) if (k !== 'compilerOptions') out.push(`${k} = ${JSON.stringify(v)}\n    ${TS_ROOT[k] || 'Not a documented top-level key (review).'}`);
    const co = isObj(j.compilerOptions) ? j.compilerOptions : {};
    for (const [k, v] of Object.entries(co)) {
      const known = TS_KNOWN.has(k) || Object.keys(TS_OPT).includes(k);
      const lc = Object.keys(TS_OPT).concat([...TS_KNOWN]).find((x) => x.toLowerCase() === k.toLowerCase() && x !== k);
      out.push(`compilerOptions.${k} = ${JSON.stringify(v)}\n    ${TS_OPT[k] || (known ? 'Documented option; this page has no short note for it. See the TSConfig Reference.' : `Unknown option, not in the TSConfig reference list${lc ? ` (did you mean "${lc}"?)` : ''}.`)}`);
      if (!known) review.push(`"${k}" is not a compiler option I know${lc ? `; "${lc}" has different capitalisation` : ''}. TypeScript reports an error for unknown options.`);
    }
    if (co.strict !== true && !('strict' in co)) review.push('strict is not set: null checks and implicit any are not enforced.');
    if (co.strict === false) review.push('strict is false.');
    if (co.skipLibCheck === true) review.push('skipLibCheck is true: faster builds, but errors inside .d.ts files are hidden.');
    if (co.moduleResolution && co.module && /^node(16|next)$/i.test(co.module) && !/^node(16|next)$/i.test(co.moduleResolution)) review.push('module is Node16/NodeNext but moduleResolution is different; TypeScript expects them to match.');
    if (co.allowJs === undefined && co.checkJs === true) review.push('checkJs without allowJs has no effect.');
    if (co.baseUrl && co.paths === undefined) review.push('baseUrl is set without paths; modern setups often use paths or package imports instead.');
    if (co.noEmit === true && (co.outDir || co.declaration)) review.push('noEmit is true, so outDir/declaration produce nothing (unless emitDeclarationOnly is used).');
    return `${out.length} entries\n\n${out.join('\n')}\n\n${review.length ? `Review (${review.length})\n${review.map((x) => '  - ' + x).join('\n')}\n\n` : ''}Notes are short summaries written for this page from the TSConfig Reference (typescriptlang.org/tsconfig, option names checked against it in October 2026). Defaults depend on your TypeScript version, so confirm details in the reference.`;
  },
});

// ---------- SSH config builder ----------
T.push({
  id: 'ssh-config-builder', cat: 'Dev Config', title: 'SSH Config Builder: ~/.ssh/config Host Entries',
  desc: 'Turn one line per server into ready ~/.ssh/config Host blocks: alias, host name, user, port, identity file, jump host and keep-alive options.',
  inputs: 1, labels: ['One host per line: alias, hostname, user, port, identity file, jump host (comma separated, trailing parts optional)'],
  opts: [chk('identitiesOnly', 'IdentitiesOnly yes (use only the listed key)', true), chk('addKeys', 'AddKeysToAgent yes', false), num('alive', 'ServerAliveInterval seconds (0 = off)', 60), chk('wildcard', 'Add a final "Host *" block with the shared options', true)],
  sample: 'web1, 203.0.113.10, deploy, 22, ~/.ssh/id_ed25519\ndb, 10.0.0.5, admin, 2222, ~/.ssh/id_ed25519, web1\nstaging, staging.example.com, ubuntu',
  run: ([i], o) => {
    const blocks = [];
    for (const [n, l] of nonEmpty(need(i, 'host lines')).entries()) {
      const p = l.split(',').map((x) => x.trim());
      const [alias, host, user, port, key, jump] = p;
      if (!alias || /\s/.test(alias)) throw new Error(`Line ${n + 1}: the alias is empty or contains spaces.`);
      if (!host) throw new Error(`Line ${n + 1}: add a host name or IP after the alias.`);
      if (/\s/.test(host)) throw new Error(`Line ${n + 1}: the host name contains spaces.`);
      if (port && !(/^\d+$/.test(port) && +port >= 1 && +port <= 65535)) throw new Error(`Line ${n + 1}: port must be 1 to 65535.`);
      const b = [`Host ${alias}`, `    HostName ${host}`];
      if (user) b.push(`    User ${user}`);
      if (port && port !== '22') b.push(`    Port ${port}`);
      if (key) { b.push(`    IdentityFile ${key}`); if (o.identitiesOnly) b.push('    IdentitiesOnly yes'); }
      if (jump) b.push(`    ProxyJump ${jump}`);
      blocks.push(b.join('\n'));
    }
    if (o.wildcard) {
      const g = ['Host *'];
      if (+o.alive > 0) g.push(`    ServerAliveInterval ${Math.floor(+o.alive)}`, '    ServerAliveCountMax 3');
      if (o.addKeys) g.push('    AddKeysToAgent yes');
      if (g.length > 1) blocks.push(g.join('\n'));
    }
    return blocks.join('\n\n') + '\n';
  },
});

// ---------- Terraform plan viewer ----------
T.push({
  id: 'terraform-plan-viewer', cat: 'Infra', title: 'Terraform Plan Viewer (terraform show -json)',
  desc: 'Summarise a Terraform plan JSON: counts of resources to add, change, replace and destroy, the list per resource, changed attributes (sensitive values hidden) and output changes.',
  inputs: 1, labels: ['Plan JSON (output of terraform show -json tfplan)'], file: { accept: '.json,application/json', multiple: false, optional: true },
  opts: [chk('attrs', 'Show changed attribute names', true), chk('noop', 'List resources with no change', false)],
  sample: JSON.stringify({ format_version: '1.2', terraform_version: '1.9.0', resource_changes: [
    { address: 'aws_instance.web', type: 'aws_instance', change: { actions: ['update'], before: { instance_type: 't3.small', tags: { a: '1' } }, after: { instance_type: 't3.medium', tags: { a: '1' } }, after_unknown: {}, after_sensitive: {} } },
    { address: 'aws_s3_bucket.logs', type: 'aws_s3_bucket', change: { actions: ['create'], before: null, after: { bucket: 'logs-1', acl: 'private' }, after_unknown: { id: true, arn: true }, after_sensitive: {} } },
    { address: 'aws_db_instance.old', type: 'aws_db_instance', change: { actions: ['delete', 'create'], before: { engine: 'mysql', password: 'x' }, after: { engine: 'postgres', password: 'y' }, after_unknown: {}, after_sensitive: { password: true } } },
    { address: 'aws_vpc.main', type: 'aws_vpc', change: { actions: ['no-op'], before: {}, after: {} } }],
  output_changes: { url: { actions: ['create'], after_unknown: true } } }, null, 1),
  run: async ([i], o, files) => {
    const text = (await readText(i, files));
    let p; try { p = JSON.parse(text); } catch { throw new Error('This is not JSON. Create it with: terraform show -json tfplan > plan.json'); }
    if (!Array.isArray(p.resource_changes) && !p.output_changes) throw new Error('No resource_changes in this JSON. It must come from terraform show -json on a plan file.');
    const kind = (a) => (a.length === 2 ? (a[0] === 'delete' ? 'replace (destroy, then create)' : 'replace (create, then destroy)') : a[0]);
    const sym = { create: '+', update: '~', delete: '-', 'no-op': ' ', read: '<=', forget: 'x' };
    const rcs = p.resource_changes || [];
    const tot = { create: 0, update: 0, delete: 0, replace: 0, read: 0, forget: 0, 'no-op': 0 };
    const out = [];
    for (const r of rcs) {
      const a = r.change?.actions || ['no-op'];
      if (a.length === 2) tot.replace++; else tot[a[0]] = (tot[a[0]] || 0) + 1;
      if (a[0] === 'no-op' && !o.noop) continue;
      const mark = a.length === 2 ? '-/+' : sym[a[0]] ?? '?';
      let line = `${mark.padEnd(3)} ${r.address}  [${kind(a)}]`;
      if (o.attrs && a[0] !== 'no-op') {
        const b = r.change.before ?? {}, af = r.change.after ?? {}, unk = r.change.after_unknown ?? {}, sens = r.change.after_sensitive ?? {};
        const keys = new Set([...Object.keys(isObj(b) ? b : {}), ...Object.keys(isObj(af) ? af : {}), ...Object.keys(isObj(unk) ? unk : {})]);
        const ch = [];
        for (const k of keys) {
          const s = isObj(sens) ? sens[k] : false, u = isObj(unk) ? unk[k] : false;
          if (u === true) ch.push(`${k} (known after apply)`);
          else if (JSON.stringify(b?.[k]) !== JSON.stringify(af?.[k])) ch.push(s ? `${k} (sensitive, hidden)` : a.length === 1 && a[0] === 'create' ? `${k} = ${JSON.stringify(af[k])}` : a.length === 1 && a[0] === 'delete' ? k : `${k}: ${JSON.stringify(b?.[k])} -> ${JSON.stringify(af?.[k])}`);
        }
        if (ch.length) line += '\n' + ch.slice(0, 40).map((x) => '      ' + (x.length > 140 ? x.slice(0, 139) + '…' : x)).join('\n') + (ch.length > 40 ? `\n      … ${ch.length - 40} more` : '');
      }
      out.push(line);
    }
    const oc = Object.entries(p.output_changes || {}).filter(([, v]) => !(v.actions || []).every((x) => x === 'no-op')).map(([k, v]) => `${(v.actions || []).join('/')}  ${k}`);
    const drift = (p.resource_drift || []).length;
    return `Plan: ${tot.create} to add, ${tot.update} to change, ${tot.replace} to replace, ${tot.delete} to destroy` + (tot.read ? `, ${tot.read} to read` : '') + `, ${tot['no-op']} unchanged` + (p.terraform_version ? `\nTerraform ${p.terraform_version}, plan format ${p.format_version || '?'}` : '') + (drift ? `\n${drift} resource(s) changed outside Terraform (resource_drift)` : '') + `\n\n${out.join('\n') || '(no changes)'}` + (oc.length ? `\n\nOutput changes\n${oc.join('\n')}` : '') + '\n\nAttribute lists are computed by comparing before and after in the plan JSON; Terraform\'s own plan text may group nested blocks differently. Sensitive values are never printed.';
  },
});

// ---------- AWS ARN parser ----------
T.push({
  id: 'aws-arn-parser', cat: 'Infra', title: 'AWS ARN Parser: Partition, Service, Region, Account, Resource',
  desc: 'Split Amazon Resource Names into partition, service, region, account ID, resource type and resource ID, with notes on common mistakes such as a bad account number or an empty region.',
  inputs: 1, labels: ['ARNs, one per line'],
  sample: 'arn:aws:s3:::my-bucket/logs/2024/app.log\narn:aws:iam::123456789012:role/service-role/deploy\narn:aws:lambda:eu-west-1:123456789012:function:orders:prod\narn:aws:ec2:us-east-1:12345:instance/i-0abc',
  run: ([i]) => nonEmpty(need(i, 'an ARN')).map((l) => {
    const a = l.trim();
    const p = a.split(':');
    if (p[0] !== 'arn' || p.length < 6) return `${a}\n  Not an ARN. Expected arn:partition:service:region:account-id:resource (at least 6 parts separated by colons).`;
    const [, partition, service, region, account] = p;
    const resource = p.slice(5).join(':');
    const notes = [];
    if (!['aws', 'aws-cn', 'aws-us-gov', 'aws-iso', 'aws-iso-b'].includes(partition)) notes.push(`partition "${partition}" is not one of aws, aws-cn, aws-us-gov, aws-iso, aws-iso-b`);
    if (account && !/^\d{12}$/.test(account) && account !== '*' && !/^aws$/.test(account)) notes.push('account ID should be 12 digits');
    if (region && !/^[a-z]{2}(-[a-z]+)+-\d$/.test(region) && region !== '*') notes.push('region does not look like us-east-1');
    if (service === 's3' && (region || account)) notes.push('S3 bucket and object ARNs normally have an empty region and account');
    if (service === 'iam' && region) notes.push('IAM ARNs are global and normally have an empty region');
    if (!resource) notes.push('resource part is empty');
    let rtype = '', rid = resource;
    const m = /^([^:/]+)([:/])(.*)$/.exec(resource);
    if (m) { rtype = m[1]; rid = m[3]; }
    const wild = /[*?]/.test(a);
    return [a, `  partition : ${partition}`, `  service   : ${service}`, `  region    : ${region || '(empty)'}`, `  account   : ${account || '(empty)'}`, `  resource  : ${resource}`, m ? `  type      : ${rtype}   (separator "${m[2]}")\n  id / path : ${rid}` : '  type      : (none; the resource is a plain name)', ...(wild ? ['  note      : contains a wildcard (valid in IAM policies, not for a real resource)'] : []), ...notes.map((n) => '  review    : ' + n)].join('\n');
  }).join('\n\n') + '\n\nFormat from the AWS General Reference "Amazon Resource Names (ARNs)". The type split is a guess: services choose their own resource layout.',
});

// ---------- IAM policy simulator lite ----------
const globRe = (g, ci) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', ci ? 'i' : '');
T.push({
  id: 'iam-policy-simulator-lite', cat: 'Infra', title: 'IAM Policy Simulator Lite: Is This Action Allowed?',
  desc: 'Paste an AWS IAM identity policy and a list of action and resource pairs. Each one is evaluated offline: explicit Deny, then Allow, otherwise implicit deny. Conditions are listed, not evaluated.',
  inputs: 2, labels: ['IAM policy JSON', 'Requests, one per line: action resource'],
  sample: JSON.stringify({ Version: '2012-10-17', Statement: [{ Sid: 'ReadBucket', Effect: 'Allow', Action: ['s3:GetObject', 's3:ListBucket'], Resource: ['arn:aws:s3:::my-bucket', 'arn:aws:s3:::my-bucket/*'] }, { Sid: 'NoSecrets', Effect: 'Deny', Action: 's3:*', Resource: 'arn:aws:s3:::my-bucket/secret/*' }] }, null, 1),
  sample2: 's3:GetObject arn:aws:s3:::my-bucket/a.txt\ns3:GetObject arn:aws:s3:::my-bucket/secret/key.pem\ns3:PutObject arn:aws:s3:::my-bucket/a.txt\nec2:DescribeInstances *',
  run: ([pol, req]) => {
    let p; try { p = JSON.parse(need(pol, 'a policy')); } catch (e) { throw new Error('Policy is not valid JSON: ' + e.message); }
    const st = [].concat(p.Statement || []);
    if (!st.length) throw new Error('The policy has no Statement.');
    const arr = (v) => (v === undefined ? [] : [].concat(v));
    const out = [];
    for (const l of nonEmpty(need(req, 'requests'))) {
      const m = /^(\S+)\s+(\S+)$/.exec(l.trim());
      if (!m) { out.push(`${l.trim()}\n  Use "action resource", for example: s3:GetObject arn:aws:s3:::bucket/key`); continue; }
      const [, act, res] = m;
      const hit = [];
      for (const [k, s] of st.entries()) {
        const aM = s.Action !== undefined ? arr(s.Action).some((g) => globRe(g, true).test(act)) : s.NotAction !== undefined ? !arr(s.NotAction).some((g) => globRe(g, true).test(act)) : false;
        const sub = (g) => g.replace(/\$\{[^}]+\}/g, '*');
        const rM = s.Resource !== undefined ? arr(s.Resource).some((g) => globRe(sub(g), false).test(res)) : s.NotResource !== undefined ? !arr(s.NotResource).some((g) => globRe(sub(g), false).test(res)) : false;
        if (aM && rM) hit.push({ k, eff: s.Effect, sid: s.Sid, cond: s.Condition });
      }
      const deny = hit.find((h) => h.eff === 'Deny' && !h.cond), denyC = hit.find((h) => h.eff === 'Deny' && h.cond), allow = hit.find((h) => h.eff === 'Allow' && !h.cond), allowC = hit.find((h) => h.eff === 'Allow' && h.cond);
      const name = (h) => `statement ${h.k + 1}${h.sid ? ` (${h.sid})` : ''}`;
      let verdict, why;
      if (deny) { verdict = 'DENIED (explicit deny)'; why = name(deny); }
      else if (denyC) { verdict = 'REVIEW (a Deny with a Condition may apply)'; why = `${name(denyC)}; Condition: ${JSON.stringify(denyC.cond)}`; }
      else if (allow) { verdict = allowC ? 'ALLOWED' : 'ALLOWED'; why = name(allow); }
      else if (allowC) { verdict = 'REVIEW (allowed only if the Condition holds)'; why = `${name(allowC)}; Condition: ${JSON.stringify(allowC.cond)}`; }
      else { verdict = 'DENIED (implicit deny: no statement allows it)'; why = ''; }
      out.push(`${act}  ${res}\n  ${verdict}${why ? '\n  matched: ' + why : ''}`);
    }
    return out.join('\n\n') + '\n\nOnly this one identity policy is evaluated. Not modelled: resource policies, permission boundaries, SCPs, session policies, Principal, and Condition keys (shown, never evaluated). Policy variables such as ${aws:username} are treated as wildcards. Use the AWS IAM policy simulator for a real answer.';
  },
});


// =====================================================================================================
// Log parsing and analysis, part 1: web servers, text formats, containers and cloud logs
// =====================================================================================================
const LOGCAT = 'Log Parsing';
const VIEW = sel('view', 'View', ['summary', 'table', 'CSV', 'JSON']);
function view(recs, cols, o, summary) {
  if (o.view === 'summary') return summary;
  const lim = +o.limit > 0 ? +o.limit : recs.length, rows = recs.slice(0, lim);
  return emit(rows, cols, o.view, +o.maxw || 60) + (rows.length < recs.length ? `\n\n(showing ${rows.length} of ${recs.length} rows; raise "Max rows" or set it to 0)` : '');
}
const VOPTS = [VIEW, LIMIT, MAXW];
const statusMatcher = (spec) => {
  const parts = String(spec || '').split(/[,\s]+/).filter(Boolean);
  if (!parts.length) return () => true;
  return (s) => parts.some((p) => (/^\dxx$/i.test(p) ? String(s)[0] === p[0] : String(s) === p));
};
const lineFilter = (spec) => {
  const s = String(spec || '');
  if (!s) return () => true;
  const m = /^\/(.+)\/([a-z]*)$/.exec(s);
  if (m) { let re; try { re = new RegExp(m[1], m[2]); } catch { throw new Error('The filter is not a valid regular expression.'); } return (x) => re.test(x); }
  return (x) => x.toLowerCase().includes(s.toLowerCase());
};
const fix2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : '-');
function latLine(label, vals, unit) {
  const s = stats(vals);
  return s ? `${label}: n=${s.n}  p50=${fix2(s.p50)}${unit}  p90=${fix2(s.p90)}${unit}  p95=${fix2(s.p95)}${unit}  p99=${fix2(s.p99)}${unit}  max=${fix2(s.max)}${unit}  mean=${fix2(s.mean)}${unit}` : `${label}: no values`;
}
// header-driven logs (IIS W3C, CloudFront): "#Fields: a b c"
function fieldsLog(text, delim) {
  const recs = []; let cols = null, bad = 0, total = 0;
  for (const l of lines(text)) {
    if (!l.trim()) continue;
    if (l.startsWith('#')) { const m = /^#Fields:\s*(.*)$/.exec(l); if (m) cols = m[1].trim().split(delim === '\t' ? /\t| +/ : / +/); continue; }
    total++;
    if (!cols) { bad++; continue; }
    const p = delim === '\t' ? l.split('\t') : l.split(' ');
    if (p.length < cols.length) { bad++; continue; }
    const r = {}; cols.forEach((c, i) => { r[c] = p[i] === '-' ? '' : p[i]; });
    recs.push(r);
  }
  if (!recs.length) throw new Error(cols ? 'No data lines found under the #Fields header.' : 'No "#Fields:" header line found. Include the lines that start with #.');
  return { recs, cols, bad, total };
}
const sumN = (recs, k) => recs.reduce((a, r) => a + (+r[k] || 0), 0);
const decodeUri = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// ---------- 799 Access log parser ----------
T.push({
  id: 'access-log-parser', cat: LOGCAT, title: 'Apache and Nginx Access Log Parser (Common and Combined Format Table)',
  desc: 'Turn Common or Combined Log Format lines into a table with IP, time, method, path, status, bytes, referrer and user agent. Filter by text, regex, status or method, sort, and export CSV or JSON.',
  inputs: 1, labels: ['Access log lines'], file: FILE,
  opts: [txt('filter', 'Filter: text, or /regex/flags', ''), txt('status', 'Status filter (404, 5xx, 301,302)', ''), txt('method', 'Method filter (GET, POST)', ''), sel('sort', 'Sort by', ['file order', 'status', 'bytes', 'ip', 'path']), chk('desc', 'Descending', false), txt('cols', 'Columns (comma separated)', ACC_COLS.join(',')), sel('view', 'Output', ['table', 'CSV', 'JSON']), LIMIT, MAXW],
  sample: '203.0.113.7 - - [10/Oct/2024:13:55:36 +0000] "GET /index.html HTTP/1.1" 200 2326 "https://example.com/" "Mozilla/5.0 (X11; Linux x86_64)"\n198.51.100.4 - bob [10/Oct/2024:13:55:40 +0000] "POST /login HTTP/1.1" 401 128 "-" "curl/8.5.0"\n203.0.113.7 - - [10/Oct/2024:13:56:02 +0000] "GET /missing.png HTTP/1.1" 404 512 "https://example.com/" "Mozilla/5.0 (X11; Linux x86_64)"\n192.0.2.9 - - [10/Oct/2024:13:57:10 +0000] "GET /api/items?page=2 HTTP/2.0" 500 77 "-" "Googlebot/2.1"',
  run: async ([i], o, files) => {
    const { recs, bad, total } = accessRecords(await readText(i, files));
    const cols = String(o.cols || '').split(',').map((s) => s.trim()).filter(Boolean);
    const allc = ['ip', 'user', 'time', 'method', 'path', 'route', 'proto', 'status', 'bytes', 'referer', 'ua', 'extra', 'request'];
    for (const c of cols) if (!allc.includes(c)) throw new Error(`Unknown column "${c}". Choose from: ${allc.join(', ')}.`);
    const sm = statusMatcher(o.status), lf = lineFilter(o.filter), mt = String(o.method || '').toUpperCase();
    let rows = recs.filter((r) => sm(r.status) && (!mt || r.method === mt) && lf(`${r.ip} ${r.request} ${r.status} ${r.referer} ${r.ua}`));
    const sk = { status: 'status', bytes: 'bytes', ip: 'ip', path: 'path' }[o.sort];
    if (sk) rows = [...rows].sort((a, b) => (typeof a[sk] === 'number' ? a[sk] - b[sk] : String(a[sk]).localeCompare(String(b[sk], undefined, { numeric: true }))) * (o.desc ? -1 : 1));
    else if (o.desc) rows = [...rows].reverse();
    const lim = +o.limit > 0 ? +o.limit : rows.length;
    return `${rows.length} of ${recs.length} parsed lines match${badNote(bad, total)}\n\n` + emit(rows.slice(0, lim), cols, o.view, +o.maxw || 60) + (rows.length > lim ? `\n\n(showing ${lim} of ${rows.length})` : '');
  },
});

// ---------- 800 Log format to regex ----------
const NGX_RE = { remote_addr: '\\S+', remote_user: '\\S+', status: '\\d{3}', body_bytes_sent: '\\d+', bytes_sent: '\\d+', request_length: '\\d+', request_time: '[\\d.]+', msec: '[\\d.]+', upstream_response_time: '[\\d.,: -]+', upstream_connect_time: '[\\d.,: -]+', upstream_status: '[\\d, :-]+', connection: '\\d+', pid: '\\d+', server_port: '\\d+', remote_port: '\\d+', time_local: '[^\\]]+' };
const APA = { h: ['remote_host', '\\S+'], l: ['remote_logname', '\\S+'], u: ['remote_user', '\\S+'], t: ['time', '\\[[^\\]]+\\]'], r: ['request', null], s: ['status', '\\d{3}'], '>s': ['status', '\\d{3}'], '<s': ['status_orig', '\\d{3}'], b: ['bytes', '\\d+|-'], B: ['bytes', '\\d+'], D: ['duration_us', '\\d+'], T: ['duration_s', '\\d+'], a: ['client_ip', '\\S+'], A: ['local_ip', '\\S+'], H: ['protocol', '\\S+'], m: ['method', '\\S+'], q: ['query', '\\S*'], U: ['url_path', '\\S+'], v: ['server_name', '\\S+'], V: ['canonical_name', '\\S+'], p: ['port', '\\d+'], I: ['bytes_in', '\\d+'], O: ['bytes_out', '\\d+'], k: ['keepalive', '\\d+'], P: ['pid', '\\d+'], f: ['filename', '\\S+'], X: ['conn_status', '\\S'], L: ['request_log_id', '\\S+'] };
function fmtToRegex(src, kind) {
  let s = src.trim();
  if (kind === 'auto') kind = /\$\w+/.test(s) ? 'nginx' : /%/.test(s) ? 'apache' : null;
  if (!kind) throw new Error('No $variables (nginx) or %codes (Apache) found in the format string.');
  const names = new Set(), cols = [];
  const nm = (n) => { n = n.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1').toLowerCase(); let k = n, c = 2; while (names.has(k)) k = n + '_' + c++; names.add(k); cols.push(k); return k; };
  let body = '', fmt = s;
  if (kind === 'nginx') {
    const d = /log_format\s+\S+\s+([\s\S]*?);?\s*$/.exec(s);
    if (d) fmt = d[1].replace(/;\s*$/, '');
    fmt = fmt.replace(/'\s*\n\s*'/g, '').replace(/^\s*(['"])([\s\S]*)\1\s*$/, '$2');
    fmt = fmt.replace(/'\s*'/g, '');
    const re = /\$\{?(\w+)\}?/g; let last = 0, m;
    while ((m = re.exec(fmt))) {
      body += fmt.slice(last, m.index).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
      const prev = fmt[m.index - 1], next = fmt[m.index + m[0].length];
      let pat = NGX_RE[m[1]] || (/^(http_|sent_http_|cookie_|arg_|upstream_http_)/.test(m[1]) ? '[^"]*' : '\\S+');
      if (prev === '"' && next === '"') pat = m[1] === 'time_iso8601' ? '[^"]*' : '[^"]*';
      else if (prev === '[' && next === ']') pat = '[^\\]]*';
      body += `(?<${nm(m[1])}>${pat})`; last = m.index + m[0].length;
    }
    body += fmt.slice(last).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  } else {
    const d = /^\s*LogFormat\s+("(?:[^"\\]|\\.)*"|\S+)/.exec(s);
    if (d) fmt = d[1];
    if (fmt[0] === '"') fmt = fmt.slice(1, -1);
    fmt = fmt.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const re = /%(?:[0-9,!<>]*)(?:\{([^}]*)\})?([A-Za-z%]|[<>]s)/g; let last = 0, m;
    while ((m = re.exec(fmt))) {
      body += fmt.slice(last, m.index).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
      last = m.index + m[0].length;
      if (m[2] === '%') { body += '%'; continue; }
      const prev = fmt[m.index - 1], next = fmt[last];
      let name, pat;
      if (m[1] !== undefined && 'iont'.includes(m[2]) && m[2] !== 't') { name = (m[2] === 'i' ? '' : m[2] === 'o' ? 'resp_' : m[2] === 'n' ? 'note_' : 'env_') + m[1]; pat = prev === '"' && next === '"' ? '[^"]*' : '\\S+'; }
      else if (m[1] !== undefined && m[2] === 't') { name = 'time_custom'; pat = '[^\\]]*'; }
      else { const a = APA[m[2]] || [m[2], '\\S+']; name = a[0]; pat = a[1] ?? ((prev === '"' && next === '"') ? '[^"]*' : '.*?'); if (m[2] === 'r' && !(prev === '"' && next === '"')) pat = '.*?'; if (prev === '"' && next === '"' && pat !== '\\S+' && m[2] !== 't') pat = m[2] === 'r' || m[2] === 'U' || m[2] === 'q' || m[2] === 'f' ? '[^"]*' : pat; }
      body += `(?<${nm(name)}>${pat})`;
    }
    body += fmt.slice(last).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  }
  return { kind, js: '^' + body + '$', cols };
}
T.push({
  id: 'log-format-to-regex', cat: LOGCAT, title: 'Nginx log_format and Apache LogFormat to Regex Converter',
  desc: 'Paste a log_format or LogFormat directive and get a regular expression with named groups for JavaScript and Python, plus a test against a sample line.',
  inputs: 2, labels: ['log_format / LogFormat directive', 'Sample log line (optional)'],
  opts: [sel('kind', 'Server', ['auto', 'nginx', 'apache'])],
  sample: 'log_format main \'$remote_addr - $remote_user [$time_local] "$request" \'\n                \'$status $body_bytes_sent "$http_referer" \'\n                \'"$http_user_agent" $request_time\';',
  sample2: '203.0.113.7 - - [10/Oct/2024:13:55:36 +0000] "GET /a?b=1 HTTP/1.1" 200 2326 "-" "curl/8.5.0" 0.012',
  run: ([f, line], o) => {
    const r = fmtToRegex(need(f, 'a log format'), o.kind);
    const py = r.js.replace(/\(\?</g, '(?P<').replace(/\\\//g, '/');
    let test = '';
    if (String(line || '').trim()) {
      const m = new RegExp(r.js).exec(line.trim().split('\n')[0]);
      test = m ? '\n\nSample line matches:\n' + r.cols.map((c) => `  ${c.padEnd(Math.max(...r.cols.map((x) => x.length)))} = ${m.groups[c]}`).join('\n') : '\n\nThe sample line does NOT match this pattern. Check quotes, brackets and trailing fields.';
    }
    return `Detected: ${r.kind}\n\nJavaScript (named groups):\n/${r.js}/\n\nPython re / PCRE:\n${py}\n\nFields (${r.cols.length}): ${r.cols.join(', ')}${test}\n\nPatterns are inferred from the variable name and the quotes or brackets around it. A field that can hold odd text (a user agent with quotes, an unescaped request) can still break a match. Test with your own lines.`;
  },
});

// ---------- 801 IIS W3C ----------
T.push({
  id: 'iis-w3c-log-parser', cat: LOGCAT, title: 'IIS W3C Log Parser (#Fields Header to Table)',
  desc: 'Read IIS u_ex log files: the #Fields line names the columns and every data line is mapped to them. See status codes, top URLs and the slowest requests, or export the rows.',
  inputs: 1, labels: ['IIS W3C log text'], file: FILE,
  opts: [...VOPTS, txt('cols', 'Columns (comma separated, empty = all)', ''), txt('status', 'Status filter (404, 5xx)', '')],
  sample: '#Software: Microsoft Internet Information Services 10.0\n#Version: 1.0\n#Date: 2024-10-10 13:55:36\n#Fields: date time s-ip cs-method cs-uri-stem cs-uri-query s-port cs-username c-ip cs(User-Agent) sc-status sc-substatus sc-win32-status time-taken\n2024-10-10 13:55:36 10.0.0.4 GET /default.aspx - 443 - 203.0.113.7 Mozilla/5.0+(Windows+NT+10.0) 200 0 0 125\n2024-10-10 13:55:41 10.0.0.4 POST /api/login - 443 - 198.51.100.4 curl/8.5.0 401 2 5 40\n2024-10-10 13:56:02 10.0.0.4 GET /missing.css - 443 - 203.0.113.7 Mozilla/5.0+(Windows+NT+10.0) 404 0 2 3',
  run: async ([i], o, files) => {
    const { recs, cols, bad, total } = fieldsLog(await readText(i, files), ' ');
    const sm = statusMatcher(o.status), rows = recs.filter((r) => sm(r['sc-status']));
    const show = String(o.cols || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const c of show) if (!cols.includes(c)) throw new Error(`No column "${c}". Columns in this log: ${cols.join(', ')}.`);
    const sum = [`${rows.length} request(s) of ${recs.length}${badNote(bad, total)}`, `Columns: ${cols.join(', ')}`, ''];
    if (cols.includes('sc-status')) sum.push(sec('Status codes', bars(count(rows, (r) => r['sc-status']))));
    if (cols.includes('cs-uri-stem')) sum.push(sec('Top URLs', bars(count(rows, (r) => r['cs-uri-stem']))));
    if (cols.includes('c-ip')) sum.push(sec('Top client IPs', bars(count(rows, (r) => r['c-ip']), 5)));
    if (cols.includes('time-taken')) { sum.push(latLine('time-taken', rows.map((r) => +r['time-taken']), ' ms')); const sl = [...rows].sort((a, b) => b['time-taken'] - a['time-taken']).slice(0, 5); sum.push('\nSlowest\n' + sl.map((r) => `  ${r['time-taken']} ms  ${r['cs-method'] || ''} ${r['cs-uri-stem'] || ''}`).join('\n')); }
    sum.push('\nIIS writes times in UTC unless the log was configured for local time. Column set comes from the #Fields line.');
    return view(rows, show.length ? show : cols, o, sum.join('\n'));
  },
});

// ---------- 802 JSON lines log filter ----------
function flat(o, p = '', out = {}) {
  if (isObj(o)) for (const [k, v] of Object.entries(o)) flat(v, p ? p + '.' + k : k, out);
  else if (Array.isArray(o)) out[p] = o.every((x) => !isObj(x) && !Array.isArray(x)) ? o.join(',') : JSON.stringify(o);
  else out[p] = o;
  return out;
}
function condMatcher(spec) {
  const conds = String(spec || '').split(';').map((s) => s.trim()).filter(Boolean).map((c) => {
    const m = /^([\w.@$-]+)\s*(>=|<=|!=|!~|=|~|>|<)\s*(.*)$/.exec(c);
    if (!m) throw new Error(`Filter "${c}" is not like key=value. Operators: = != ~ !~ > < >= <=. Separate filters with ;`);
    return { k: m[1], op: m[2], v: m[3] };
  });
  return (r) => conds.every(({ k, op, v }) => {
    const x = r[k];
    if (x === undefined) return op === '!=' || op === '!~';
    const s = String(x);
    if (op === '=') return s === v; if (op === '!=') return s !== v;
    if (op === '~') return s.toLowerCase().includes(v.toLowerCase()); if (op === '!~') return !s.toLowerCase().includes(v.toLowerCase());
    const a = Number(x), b = Number(v);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return op === '>' ? s > v : op === '<' ? s < v : op === '>=' ? s >= v : s <= v;
    return op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b;
  });
}
const TIMEK = ['time', 'timestamp', 'ts', '@timestamp', 'datetime', 't.$date'], LEVK = ['level', 'severity', 'lvl', 'loglevel', 'log.level'], MSGK = ['msg', 'message', 'log', 'event', 'text'];
T.push({
  id: 'jsonl-log-filter', cat: LOGCAT, title: 'JSON Lines Log Filter: Flatten Fields and Filter by Any Key',
  desc: 'Load newline-delimited JSON logs, flatten nested fields to dotted keys and filter by any key with =, !=, ~, >, <. Shows a level summary and a table of the matching rows.',
  inputs: 1, labels: ['JSON Lines logs'], file: FILE,
  opts: [txt('where', 'Filters, separated by ; (level=error;status>=500;msg~timeout)', ''), txt('cols', 'Columns (comma separated, empty = auto)', ''), txt('sort', 'Sort by key (empty = file order)', ''), chk('desc', 'Descending', false), ...VOPTS],
  sample: '{"time":"2024-10-10T10:00:00Z","level":"info","msg":"started","port":8080}\n{"time":"2024-10-10T10:00:05Z","level":"error","msg":"db timeout","ctx":{"query":"select 1","ms":5000}}\n{"time":"2024-10-10T10:00:09Z","level":"warn","msg":"slow request","ctx":{"ms":1800}}\nnot json',
  run: async ([i], o, files) => {
    const { recs, bad } = parseJsonRecords(await readText(i, files));
    const all = recs.map((r) => flat(r));
    const f = condMatcher(o.where);
    let rows = all.filter(f);
    if (o.sort) rows = [...rows].sort((a, b) => { const x = a[o.sort], y = b[o.sort]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })) * (o.desc ? -1 : 1); });
    else if (o.desc) rows.reverse();
    const keys = new Map(); for (const r of all) for (const k of Object.keys(r)) keys.set(k, (keys.get(k) || 0) + 1);
    let cols = String(o.cols || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!cols.length) { const have = [...keys.keys()]; const pri = [TIMEK, LEVK, MSGK].map((g) => have.find((k) => g.includes(k.toLowerCase()))).filter(Boolean); cols = [...pri, ...have.filter((k) => !pri.includes(k))].slice(0, 7); }
    const lk = [...keys.keys()].find((k) => LEVK.includes(k.toLowerCase()));
    const sum = `${rows.length} of ${all.length} records match${bad ? `; ${bad} line(s) were not JSON` : ''}\n\n` + (lk ? sec(`Values of "${lk}"`, bars(count(rows, (r) => r[lk]))) + '\n' : '') + sec('Keys seen (records containing the key)', [...keys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, c]) => `${k}  ${c}`).join('\n'));
    return view(rows, cols, o, sum);
  },
});

// ---------- 803 logfmt ----------
function parseLogfmt(line, typed, bare) {
  const out = {}; const re = /([^\s=]+)(?:=("(?:[^"\\]|\\.)*"|[^\s]*))?/g; let m;
  while ((m = re.exec(line))) {
    const k = m[1];
    if (m[2] === undefined) { if (!bare) continue; out[k] = true; continue; }
    let v = m[2];
    if (v[0] === '"') { try { v = JSON.parse(v); } catch { v = v.slice(1, -1); } }
    else if (typed) { if (v === 'true') v = true; else if (v === 'false') v = false; else if (/^-?\d+(\.\d+)?$/.test(v) && v.length < 16) v = Number(v); }
    out[k] = v;
  }
  return out;
}
T.push({
  id: 'logfmt-parser', cat: LOGCAT, title: 'Logfmt Parser: key=value Log Lines to JSON or Table',
  desc: 'Convert logfmt lines (key=value, quoted values) from Heroku, Go and other services into JSON, a table or CSV. Numbers and booleans can be typed.',
  inputs: 1, labels: ['logfmt lines'], file: FILE,
  opts: [sel('fmt', 'Output', ['table', 'JSON', 'JSON lines', 'CSV']), chk('typed', 'Convert numbers and true/false', true), chk('bare', 'Keep bare words as key=true', false), LIMIT, MAXW],
  sample: 'ts=2024-10-10T10:00:00Z level=info msg="request done" method=GET path=/api/items status=200 dur_ms=12.5\nts=2024-10-10T10:00:01Z level=error msg="upstream failed" status=502 err="dial tcp: i/o timeout"\nheroku[router]: at=info method=GET path="/" host=app.example.com fwd="203.0.113.7" status=200',
  run: async ([i], o, files) => {
    const recs = nonEmpty(await readText(i, files)).map((l) => parseLogfmt(l, o.typed, o.bare)).filter((r) => Object.keys(r).length);
    if (!recs.length) throw new Error('No key=value pairs found.');
    const cols = [...new Set(recs.flatMap((r) => Object.keys(r)))];
    const lim = +o.limit > 0 ? +o.limit : recs.length, rows = recs.slice(0, lim);
    if (o.fmt === 'JSON') return JSON.stringify(rows, null, 2);
    if (o.fmt === 'JSON lines') return rows.map((r) => JSON.stringify(r)).join('\n');
    return emit(rows, cols, o.fmt, +o.maxw || 60) + (rows.length < recs.length ? `\n\n(showing ${rows.length} of ${recs.length})` : '');
  },
});

// ---------- 804 Syslog ----------
const FAC = ['kern', 'user', 'mail', 'daemon', 'auth', 'syslog', 'lpr', 'news', 'uucp', 'cron', 'authpriv', 'ftp', 'ntp', 'audit', 'alert', 'clock', 'local0', 'local1', 'local2', 'local3', 'local4', 'local5', 'local6', 'local7'];
const SEV = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];
function parseSyslog(l) {
  let m, pri = null, rest = l;
  if ((m = /^<(\d{1,3})>(.*)$/.exec(l))) { pri = +m[1]; rest = m[2]; }
  const base = pri === null ? {} : { pri, facility: FAC[pri >> 3] ?? String(pri >> 3), severity: SEV[pri & 7] };
  if (pri !== null && (m = /^(\d{1,2}) (\S+) (\S+) (\S+) (\S+) (\S+) (-|(?:\[(?:[^\]\\]|\\.)*\])+)(?: ?(.*))?$/.exec(rest))) {
    return { ...base, version: m[1], time: m[2], host: m[3], app: m[4], pid: m[5] === '-' ? '' : m[5], msgid: m[6] === '-' ? '' : m[6], sd: m[7] === '-' ? '' : m[7], msg: m[8] ?? '', rfc: '5424' };
  }
  if ((m = /^([A-Z][a-z]{2} [ \d]\d \d\d:\d\d:\d\d|\d{4}-\d\d-\d\dT\S+) (\S+) (.*)$/.exec(rest))) {
    const t = /^([^\s:\[]+)(?:\[(\d+)\])?:? ?(.*)$/.exec(m[3]);
    return { ...base, time: m[1], host: m[2], app: t ? t[1] : '', pid: t && t[2] ? t[2] : '', msg: t ? t[3] : m[3], rfc: pri === null ? 'file' : '3164' };
  }
  return null;
}
T.push({
  id: 'syslog-parser', cat: LOGCAT, title: 'Syslog Parser: RFC 3164 and RFC 5424 with Facility and Severity',
  desc: 'Decode syslog lines into time, host, app, process ID and message. The <PRI> number is split into facility and severity names. Works with RFC 3164, RFC 5424 and plain /var/log/syslog lines.',
  inputs: 1, labels: ['Syslog lines'], file: FILE,
  opts: [txt('sev', 'Show this severity and worse (emerg alert crit err warning notice info debug, empty = all)', ''), ...VOPTS],
  sample: '<34>Oct 11 22:14:15 mymachine su: \'su root\' failed for lonvick on /dev/pts/8\n<165>1 2003-08-24T05:14:15.000003-07:00 192.0.2.1 myproc 8710 - - %% It\'s time to make the do-nuts.\n<134>1 2024-10-10T10:00:00Z web1 nginx 412 ID47 [exampleSDID@32473 iut="3" eventSource="Application"] request served\nOct 10 10:05:01 web1 CRON[1234]: (root) CMD (run-parts /etc/cron.hourly)',
  run: async ([i], o, files) => {
    const all = nonEmpty(await readText(i, files)); let bad = 0;
    let recs = all.map((l) => { const r = parseSyslog(l); if (!r) bad++; return r; }).filter(Boolean);
    if (!recs.length) throw new Error('No syslog lines recognised (expected <PRI>..., or "Mon dd hh:mm:ss host app: message").');
    if (o.sev) { const k = SEV.indexOf(String(o.sev).trim().toLowerCase()); if (k < 0) throw new Error(`Severity must be one of: ${SEV.join(', ')}.`); recs = recs.filter((r) => r.pri !== undefined && (r.pri & 7) <= k); }
    const sum = `${recs.length} line(s) shown${badNote(bad, all.length)}\n\n` + sec('Severity', bars(count(recs, (r) => r.severity))) + '\n' + sec('Facility', bars(count(recs, (r) => r.facility))) + '\n' + sec('Host', bars(count(recs, (r) => r.host), 5)) + '\nFacility and severity names follow RFC 5424 tables 1 and 2 (<PRI> = facility*8 + severity). Plain file lines carry no PRI, so those columns stay empty. RFC 3164 times have no year or zone.';
    return view(recs, ['rfc', 'pri', 'facility', 'severity', 'time', 'host', 'app', 'pid', 'msgid', 'sd', 'msg'], o, sum);
  },
});

// ---------- 805 journald ----------
const JPRI = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];
T.push({
  id: 'journald-json-viewer', cat: LOGCAT, title: 'systemd Journal Export Viewer (journalctl -o json)',
  desc: 'Read journalctl -o json output: counts per unit and priority, the noisiest messages and a table of entries. Filter by unit, minimum priority or text.',
  inputs: 1, labels: ['journalctl -o json output'], file: FILE,
  opts: [txt('unit', 'Unit contains', ''), sel('prio', 'Priority and worse', ['all', 'emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug']), txt('text', 'Message contains', ''), ...VOPTS],
  sample: '{"__REALTIME_TIMESTAMP":"1728554400000000","_HOSTNAME":"web1","_SYSTEMD_UNIT":"nginx.service","PRIORITY":"6","SYSLOG_IDENTIFIER":"nginx","MESSAGE":"worker started","_PID":"812"}\n{"__REALTIME_TIMESTAMP":"1728554460000000","_HOSTNAME":"web1","_SYSTEMD_UNIT":"nginx.service","PRIORITY":"3","SYSLOG_IDENTIFIER":"nginx","MESSAGE":"connect() failed (111: Connection refused)","_PID":"812"}\n{"__REALTIME_TIMESTAMP":"1728554500000000","_HOSTNAME":"web1","_SYSTEMD_UNIT":"cron.service","PRIORITY":"6","SYSLOG_IDENTIFIER":"CRON","MESSAGE":[104,101,108,108,111]}',
  run: async ([i], o, files) => {
    const { recs, bad } = parseJsonRecords(await readText(i, files));
    let rows = recs.filter(isObj).map((r) => {
      const m = Array.isArray(r.MESSAGE) ? new TextDecoder().decode(new Uint8Array(r.MESSAGE)) : String(r.MESSAGE ?? '');
      const p = r.PRIORITY === undefined ? null : +r.PRIORITY;
      return { time: r.__REALTIME_TIMESTAMP ? iso(Math.round(+r.__REALTIME_TIMESTAMP / 1000)) : '', host: r._HOSTNAME ?? '', unit: r._SYSTEMD_UNIT ?? r.SYSLOG_IDENTIFIER ?? '', priority: p === null ? '' : JPRI[p] ?? p, p, pid: r._PID ?? '', message: m };
    });
    const k = o.prio === 'all' ? 7 : JPRI.indexOf(o.prio), uf = String(o.unit || '').toLowerCase(), tf = String(o.text || '').toLowerCase();
    rows = rows.filter((r) => (r.p === null || r.p <= k) && (!uf || r.unit.toLowerCase().includes(uf)) && (!tf || r.message.toLowerCase().includes(tf)));
    const byUnit = new Map(); for (const r of rows) { const u = byUnit.get(r.unit || '(none)') || { n: 0, worst: 8 }; u.n++; u.worst = Math.min(u.worst, r.p ?? 8); byUnit.set(r.unit || '(none)', u); }
    const sum = `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}${bad ? `; ${bad} line(s) were not JSON` : ''}\n\n` + sec('Priority', bars(count(rows, (r) => r.priority || '(none)'))) + '\n' + sec('Units (entries, worst priority)', [...byUnit.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15).map(([u, v]) => `${u}  ${v.n}  ${JPRI[v.worst] ?? '-'}`).join('\n')) + '\n' + sec('Most repeated messages', topRows(count(rows, (r) => r.message.replace(/\d+/g, '#')), 8, 'message').map((r) => `${r.count}  ${r.message.slice(0, 100)}`).join('\n'));
    return view(rows, ['time', 'host', 'unit', 'priority', 'pid', 'message'], o, sum);
  },
});

// ---------- 806/807 container logs ----------
function parseContainer(l) {
  let m, pod = '', ctr = '', rest = l;
  if ((m = /^\[(?:([^\]/]+)\/)?([^\]/]+)\/([^\]/]+)\] (.*)$/.exec(l))) { pod = m[2]; ctr = m[3]; rest = m[4]; }
  if (rest[0] === '{') { try { const j = JSON.parse(rest); if (typeof j.log === 'string') return { pod, ctr, ts: j.time || '', stream: j.stream || '', msg: j.log.replace(/\n$/, '') }; } catch { /* plain */ } }
  if ((m = /^(\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)) (stdout|stderr) ([FP]) ?(.*)$/.exec(rest))) return { pod, ctr, ts: m[1], stream: m[2], msg: m[4] };
  if ((m = /^(\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)) ?(.*)$/.exec(rest))) return { pod, ctr, ts: m[1], stream: '', msg: m[2] };
  return { pod, ctr, ts: '', stream: '', msg: rest };
}
const tsMs = (s) => { if (!s) return NaN; const m = /^(.*\.\d{3})\d*(Z|[+-]\d\d:\d\d)$/.exec(s); return Date.parse(m ? m[1] + m[2] : s); };
function containerRows(text, o, keep) {
  const all = nonEmpty(text).map(parseContainer); let prev = NaN;
  const rows = all.map((r, i) => ({ ...r, n: i + 1, ms: tsMs(r.ts), level: findLevel(r.msg) || '' }));
  const gf = lineFilter(o.grep);
  const out = rows.filter((r) => (!o.stream || o.stream === 'all' || r.stream === o.stream) && gf(r.msg) && (!keep || keep(r)));
  for (const r of out) { r.delta = Number.isFinite(r.ms) && Number.isFinite(prev) ? r.ms - prev : ''; if (Number.isFinite(r.ms)) prev = r.ms; }
  return { all, out };
}
const SPAN = (rows) => { const t = rows.map((r) => r.ms).filter(Number.isFinite); return t.length ? `${iso(Math.min(...t))} to ${iso(Math.max(...t))} (${f1((Math.max(...t) - Math.min(...t)) / 1000)} s)` : 'no timestamps found (use --timestamps)'; };
T.push({
  id: 'docker-log-viewer', cat: LOGCAT, title: 'Docker Log Viewer: docker logs --timestamps with Streams and Gaps',
  desc: 'Parse docker logs --timestamps output, JSON-file driver lines or CRI lines into time, stream and message. Shows time since the previous line, level counts and filters by stream or text.',
  inputs: 1, labels: ['docker logs output'], file: FILE,
  opts: [sel('stream', 'Stream', ['all', 'stdout', 'stderr']), txt('grep', 'Message filter: text or /regex/', ''), ...VOPTS],
  sample: '2024-10-10T10:00:00.123456789Z Server listening on :8080\n2024-10-10T10:00:01.500000000Z GET /health 200\n{"log":"panic: nil pointer\\n","stream":"stderr","time":"2024-10-10T10:00:03.250000000Z"}\n2024-10-10T10:00:09.000000000Z stdout F request done',
  run: async ([i], o, files) => {
    const { all, out } = containerRows(await readText(i, files), o);
    if (!all.length) throw new Error('No lines found.');
    const known = out.filter((r) => r.stream).length;
    const sum = `${out.length} of ${all.length} lines\nTime span: ${SPAN(out)}\n\n` + sec('Streams', bars(count(out, (r) => r.stream || '(unknown)'))) + (known === 0 ? 'Plain docker logs text does not say which stream a line came from. The stream is known only for JSON-file log files and CRI lines.\n' : '') + '\n' + sec('Levels', bars(count(out, (r) => r.level || null))) + '\n' + sec('Longest gaps between lines', out.filter((r) => r.delta !== '').sort((a, b) => b.delta - a.delta).slice(0, 5).map((r) => `${f1(r.delta / 1000, 3)} s before line ${r.n}: ${r.msg.slice(0, 80)}`).join('\n'));
    return view(out.map((r) => ({ line: r.n, time: r.ts, stream: r.stream, 'delta_ms': r.delta === '' ? '' : Math.round(r.delta), level: r.level, message: r.msg })), ['line', 'time', 'stream', 'delta_ms', 'level', 'message'], o, sum);
  },
});
T.push({
  id: 'kubectl-log-viewer', cat: LOGCAT, title: 'Kubernetes Pod Log Viewer: kubectl logs by Pod and Container',
  desc: 'Split kubectl logs output (--prefix, --timestamps, --all-containers) by pod and container, merge lines in time order and filter by pod, container or text.',
  inputs: 1, labels: ['kubectl logs --prefix --timestamps output'], file: FILE,
  opts: [txt('pod', 'Pod contains', ''), txt('container', 'Container contains', ''), txt('grep', 'Message filter: text or /regex/', ''), chk('merge', 'Sort all lines by timestamp', true), ...VOPTS],
  sample: '[pod/api-7d9f/api] 2024-10-10T10:00:00.100Z listening on 8080\n[pod/api-7d9f/sidecar] 2024-10-10T10:00:00.050Z proxy ready\n[pod/api-7d9f/api] 2024-10-10T10:00:02.300Z ERROR db connection refused\n[pod/worker-55c/worker] 2024-10-10T10:00:01.000Z job 41 started',
  run: async ([i], o, files) => {
    const pf = String(o.pod || '').toLowerCase(), cf = String(o.container || '').toLowerCase();
    const { all, out } = containerRows(await readText(i, files), { grep: o.grep, stream: 'all' }, (r) => (!pf || r.pod.toLowerCase().includes(pf)) && (!cf || r.ctr.toLowerCase().includes(cf)));
    if (!all.length) throw new Error('No lines found.');
    let rows = out;
    if (o.merge) rows = [...out].sort((a, b) => (Number.isFinite(a.ms) ? a.ms : -Infinity) - (Number.isFinite(b.ms) ? b.ms : -Infinity) || a.n - b.n);
    const src = (r) => (r.pod ? `${r.pod}/${r.ctr}` : '(no prefix)');
    const noPrefix = all.filter((r) => !r.pod).length;
    const sum = `${rows.length} of ${all.length} lines\nTime span: ${SPAN(rows)}\n\n` + sec('Lines per pod/container', bars(count(rows, src))) + '\n' + sec('Levels', bars(count(rows, (r) => r.level || null))) + (noPrefix ? `\n${noPrefix} line(s) have no [pod/container] prefix. Run kubectl logs with --prefix (and --all-containers or -l selector) to get it.\n` : '');
    return view(rows.map((r) => ({ time: r.ts, source: src(r), level: r.level, message: r.msg })), ['time', 'source', 'level', 'message'], o, sum);
  },
});

// ---------- 808 CloudFront ----------
T.push({
  id: 'cloudfront-log-parser', cat: LOGCAT, title: 'CloudFront Standard Log Parser (Tab-Separated, .gz Supported)',
  desc: 'Read CloudFront standard access logs, including gzipped files from S3. Shows cache hit ratio by result type, status codes, top URLs, edge locations and slow requests.',
  inputs: 1, labels: ['CloudFront log text (or drop .gz files)'], file: { accept: '.gz,.log,.txt', multiple: true, optional: true },
  opts: [txt('status', 'Status filter (404, 5xx)', ''), ...VOPTS],
  sample: '#Version: 1.0\n#Fields: date time x-edge-location sc-bytes c-ip cs-method cs(Host) cs-uri-stem sc-status cs(Referer) cs(User-Agent) cs-uri-query cs(Cookie) x-edge-result-type x-edge-request-id x-host-header cs-protocol cs-bytes time-taken x-forwarded-for ssl-protocol ssl-cipher x-edge-response-result-type cs-protocol-version fle-status fle-encrypted-fields c-port time-to-first-byte x-edge-detailed-result-type sc-content-type sc-content-len sc-range-start sc-range-end\n2024-10-10\t10:00:00\tAMS54-C1\t4521\t203.0.113.7\tGET\td111.cloudfront.net\t/index.html\t200\t-\tMozilla/5.0\t-\t-\tHit\tabc1\texample.com\thttps\t310\t0.002\t-\tTLSv1.3\tTLS_AES_128_GCM_SHA256\tHit\tHTTP/2.0\t-\t-\t51234\t0.002\tHit\ttext/html\t4200\t-\t-\n2024-10-10\t10:00:03\tAMS54-C1\t13\t198.51.100.4\tGET\td111.cloudfront.net\t/missing\t404\t-\tcurl/8.5.0\t-\t-\tError\tabc2\texample.com\thttps\t200\t0.150\t-\tTLSv1.3\tTLS_AES_128_GCM_SHA256\tError\tHTTP/2.0\t-\t-\t51240\t0.150\tError\ttext/html\t-\t-\t-',
  run: async ([i], o, files) => {
    const { recs, cols, bad, total } = fieldsLog(await readText(i, files), '\t');
    const sm = statusMatcher(o.status), rows = recs.filter((r) => sm(r['sc-status']));
    const res = count(rows, (r) => r['x-edge-result-type'] || null);
    const hits = (res.get('Hit') || 0) + (res.get('RefreshHit') || 0) + (res.get('OriginShieldHit') || 0);
    const sum = `${rows.length} request(s)${badNote(bad, total)}\nBytes sent to viewers (sc-bytes): ${fmtBytes(sumN(rows, 'sc-bytes'))}\n\n` + sec(`Edge result type (cache hit ratio ${rows.length ? (100 * hits / rows.length).toFixed(1) : 0}% = Hit + RefreshHit + OriginShieldHit over all requests)`, bars(res)) + '\n' + sec('Status codes', bars(count(rows, (r) => r['sc-status']))) + '\n' + sec('Top URLs', bars(count(rows, (r) => r['cs-uri-stem']), 10)) + '\n' + sec('Edge locations', bars(count(rows, (r) => r['x-edge-location']), 8)) + '\n' + latLine('time-taken', rows.map((r) => +r['time-taken'] * 1000), ' ms') + '\n\nHit ratio here counts every request, including errors and redirects. Field names come from the #Fields line of your file.';
    return view(rows, cols.filter((c) => !/cookie|fle|cipher/i.test(c)), o, sum);
  },
});

// ---------- 809 ALB / ELB ----------
const ALB_F = ['type', 'time', 'elb', 'client', 'target', 'request_processing_time', 'target_processing_time', 'response_processing_time', 'elb_status_code', 'target_status_code', 'received_bytes', 'sent_bytes', 'request', 'user_agent', 'ssl_cipher', 'ssl_protocol', 'target_group_arn', 'trace_id', 'domain_name', 'chosen_cert_arn', 'matched_rule_priority', 'request_creation_time', 'actions_executed', 'redirect_url', 'error_reason', 'target_port_list', 'target_status_code_list', 'classification', 'classification_reason', 'conn_trace_id', 'transformed_host', 'transformed_uri', 'request_transform_status'];
const ELB_F = ['time', 'elb', 'client', 'target', 'request_processing_time', 'target_processing_time', 'response_processing_time', 'elb_status_code', 'target_status_code', 'received_bytes', 'sent_bytes', 'request', 'user_agent', 'ssl_cipher', 'ssl_protocol'];
T.push({
  id: 'alb-elb-log-parser', cat: LOGCAT, title: 'AWS ALB and Classic ELB Access Log Parser (Latency and Errors)',
  desc: 'Parse Application Load Balancer and Classic ELB access logs. Shows status codes from the balancer and the targets, latency percentiles, requests never sent to a target, and the slowest URLs.',
  inputs: 1, labels: ['Load balancer log lines (or drop .gz files)'], file: FILE,
  opts: [txt('status', 'ELB status filter (502, 5xx)', ''), ...VOPTS],
  sample: 'https 2024-10-10T10:00:00.123456Z app/my-lb/50dc6c495c0c9188 203.0.113.7:51234 10.0.1.5:80 0.000 0.045 0.000 200 200 134 5121 "GET https://example.com:443/api/items HTTP/1.1" "curl/8.5.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:eu-west-1:123456789012:targetgroup/tg/73e2d6bc24d8a067 "Root=1-67891233-abcdef012345678912345678" "example.com" "arn:aws:acm:eu-west-1:123456789012:certificate/c1" 0 2024-10-10T10:00:00.075000Z "forward" "-" "-" "10.0.1.5:80" "200" "-" "-"\nhttps 2024-10-10T10:00:02.000000Z app/my-lb/50dc6c495c0c9188 198.51.100.4:40000 - -1 -1 -1 503 - 120 310 "GET https://example.com:443/ HTTP/1.1" "Mozilla/5.0" - - arn:aws:elasticloadbalancing:eu-west-1:123456789012:targetgroup/tg/73e2d6bc24d8a067 "Root=1-67891234-abcdef012345678912345679" "example.com" "-" 0 2024-10-10T10:00:02.000000Z "forward" "-" "-" "-" "-" "-" "-"',
  run: async ([i], o, files) => {
    const text = await readText(i, files); let bad = 0, total = 0, classic = false;
    const recs = [];
    for (const l of nonEmpty(text)) {
      total++; const t = tokens(l);
      const isClassic = /^\d{4}-\d\d-\d\dT/.test(t[0]);
      const F = isClassic ? ELB_F : ALB_F;
      if (t.length < (isClassic ? 12 : 13) || (!isClassic && !/^(http|https|h2|grpcs|ws|wss)$/.test(t[0]))) { bad++; continue; }
      classic = isClassic; const r = {}; F.forEach((f, k) => { r[f] = t[k] ?? ''; }); recs.push(r);
    }
    if (!recs.length) throw new Error('No load balancer log lines recognised. ALB lines start with http, https, h2, grpcs, ws or wss; classic ELB lines start with a timestamp.');
    const sm = statusMatcher(o.status), rows = recs.filter((r) => sm(r.elb_status_code));
    for (const r of rows) { const m = /^\w+ (\S+)/.exec(r.request); let p = m ? m[1] : r.request; try { p = new URL(p).pathname; } catch { /* keep */ } r.path = p; r.rt = +r.target_processing_time; }
    const ok = rows.filter((r) => r.rt >= 0), nd = rows.filter((r) => r.rt < 0 || r.target_processing_time === '-1');
    const slow = [...ok].sort((a, b) => b.rt - a.rt).slice(0, 5);
    const sum = `${rows.length} request(s) (${classic ? 'Classic ELB' : 'ALB'} format)${badNote(bad, total)}\nBytes received ${fmtBytes(sumN(rows, 'received_bytes'))}, sent ${fmtBytes(sumN(rows, 'sent_bytes'))}\n\n` + sec('ELB status', bars(count(rows, (r) => r.elb_status_code))) + '\n' + sec('Target status', bars(count(rows, (r) => r.target_status_code || null))) + '\n' + latLine('target_processing_time', ok.map((r) => r.rt * 1000), ' ms') + `\n${nd.length} request(s) have -1 times: the balancer did not get a response from a target (timeout, no healthy target or closed connection).\n\n` + sec('Slowest by target time', slow.map((r) => `${f1(r.rt * 1000)} ms  ${r.path}`).join('\n')) + '\n' + sec('Top paths', bars(count(rows, (r) => r.path), 8)) + (rows.some((r) => r.error_reason && r.error_reason !== '-') ? '\n' + sec('Error reasons', bars(count(rows, (r) => (r.error_reason && r.error_reason !== '-' ? r.error_reason : null)))) : '') + '\nField names follow the AWS access log entry documentation (ALB: first 36 fields; newer fields may be appended).';
    return view(rows, classic ? ['time', 'client', 'elb_status_code', 'target_status_code', 'target_processing_time', 'received_bytes', 'sent_bytes', 'request'] : ['time', 'client', 'elb_status_code', 'target_status_code', 'target_processing_time', 'sent_bytes', 'path', 'user_agent', 'error_reason'], o, sum);
  },
});

// ---------- 810 S3 access log ----------
const S3_F = ['bucket_owner', 'bucket', 'time', 'remote_ip', 'requester', 'request_id', 'operation', 'key', 'request_uri', 'http_status', 'error_code', 'bytes_sent', 'object_size', 'total_time', 'turn_around_time', 'referer', 'user_agent', 'version_id', 'host_id', 'signature_version', 'cipher_suite', 'authentication_type', 'host_header', 'tls_version', 'access_point_arn', 'acl_required'];
T.push({
  id: 's3-access-log-parser', cat: LOGCAT, title: 'S3 Server Access Log Parser: Requesters, Operations and Bytes',
  desc: 'Turn S3 server access log lines into a table and a summary: who made requests, which operations, which keys, status codes, error codes and bytes sent.',
  inputs: 1, labels: ['S3 access log lines'], file: FILE,
  opts: [txt('status', 'Status filter (403, 4xx)', ''), ...VOPTS],
  sample: '79a59df900b949e55d96a1e698fbacedfd6e09d98eacf8f8d5218e7cd47ef2be awsexamplebucket1 [06/Feb/2024:00:00:38 +0000] 192.0.2.3 79a59df900b949e55d96a1e698fbacedfd6e09d98eacf8f8d5218e7cd47ef2be 3E57427F3EXAMPLE REST.GET.OBJECT photos/cat.jpg "GET /awsexamplebucket1/photos/cat.jpg HTTP/1.1" 200 - 4739 4739 7 6 "-" "curl/8.5.0" - s9lzHYrFp76ZVxRcpX9+5cjAnEH2ROuNkd2BHfIa6UkFVdtjf5mKR3/eTPFvsiP/XV/VLi31234= SigV4 ECDHE-RSA-AES128-SHA AuthHeader awsexamplebucket1.s3.us-west-1.amazonaws.com TLSV1.2 - -\n79a59df900b949e55d96a1e698fbacedfd6e09d98eacf8f8d5218e7cd47ef2be awsexamplebucket1 [06/Feb/2024:00:01:10 +0000] 198.51.100.8 - 3E57427F4EXAMPLE REST.GET.OBJECT secret.txt "GET /awsexamplebucket1/secret.txt HTTP/1.1" 403 AccessDenied 243 - 5 - "-" "Boto3/1.34" - abc= SigV4 ECDHE-RSA-AES128-SHA AuthHeader awsexamplebucket1.s3.us-west-1.amazonaws.com TLSV1.2 - -',
  run: async ([i], o, files) => {
    const text = await readText(i, files); let bad = 0, total = 0; const recs = [];
    for (const l of nonEmpty(text)) { total++; const t = tokens(l); if (t.length < 17 || !/^\d{1,2}\/\w{3}\/\d{4}:/.test(t[2])) { bad++; continue; } const r = {}; S3_F.forEach((f, k) => { r[f] = t[k] === '-' ? '' : t[k] ?? ''; }); recs.push(r); }
    if (!recs.length) throw new Error('No S3 access log lines recognised. Lines start with the bucket owner ID, the bucket and a [time].');
    const sm = statusMatcher(o.status), rows = recs.filter((r) => sm(r.http_status));
    const sum = `${rows.length} request(s)${badNote(bad, total)}\nBytes sent: ${fmtBytes(sumN(rows, 'bytes_sent'))}\n\n` + sec('Operations', bars(count(rows, (r) => r.operation))) + '\n' + sec('HTTP status', bars(count(rows, (r) => r.http_status))) + '\n' + sec('Error codes', bars(count(rows, (r) => r.error_code || null))) + '\n' + sec('Requesters (anonymous when empty)', bars(count(rows, (r) => r.requester || '(anonymous)'), 8)) + '\n' + sec('Remote IPs', bars(count(rows, (r) => r.remote_ip), 8)) + '\n' + sec('Top keys', bars(count(rows, (r) => r.key || null), 8)) + '\n' + latLine('total_time', rows.map((r) => +r.total_time), ' ms') + '\n\nField order is the one in the Amazon S3 server access log format documentation; newer fields may be appended by AWS.';
    return view(rows, ['time', 'remote_ip', 'requester', 'operation', 'key', 'http_status', 'error_code', 'bytes_sent', 'total_time', 'user_agent'], o, sum);
  },
});

// ---------- 811 CloudTrail ----------
T.push({
  id: 'cloudtrail-event-viewer', cat: LOGCAT, title: 'CloudTrail Event Viewer: Who Did What, Where and When',
  desc: 'Load CloudTrail JSON (a Records file, an array or JSON lines, .gz allowed) and see events by name, identity, source, region and error, with a short list of events worth a second look.',
  inputs: 1, labels: ['CloudTrail JSON'], file: { accept: '.json,.gz,.txt', multiple: true, optional: true },
  opts: [txt('event', 'Event name contains', ''), txt('who', 'Identity contains (name, ARN or type)', ''), chk('errors', 'Only events with an error', false), ...VOPTS],
  sample: JSON.stringify({ Records: [
    { eventTime: '2024-10-10T10:00:00Z', eventSource: 'signin.amazonaws.com', eventName: 'ConsoleLogin', awsRegion: 'us-east-1', sourceIPAddress: '203.0.113.7', userIdentity: { type: 'IAMUser', userName: 'alice', arn: 'arn:aws:iam::123456789012:user/alice' }, additionalEventData: { MFAUsed: 'No' }, responseElements: { ConsoleLogin: 'Success' }, readOnly: false },
    { eventTime: '2024-10-10T10:02:00Z', eventSource: 's3.amazonaws.com', eventName: 'GetObject', awsRegion: 'eu-west-1', sourceIPAddress: '198.51.100.4', userIdentity: { type: 'AssumedRole', arn: 'arn:aws:sts::123456789012:assumed-role/app/i-0abc' }, errorCode: 'AccessDenied', errorMessage: 'Access Denied', readOnly: true },
    { eventTime: '2024-10-10T10:05:00Z', eventSource: 'iam.amazonaws.com', eventName: 'CreateAccessKey', awsRegion: 'us-east-1', sourceIPAddress: '203.0.113.7', userIdentity: { type: 'Root', arn: 'arn:aws:iam::123456789012:root' }, readOnly: false }] }, null, 1),
  run: async ([i], o, files) => {
    const { recs, bad } = parseJsonRecords(await readText(i, files));
    const who = (r) => r.userIdentity?.userName || r.userIdentity?.arn || r.userIdentity?.principalId || r.userIdentity?.type || r.userIdentity?.invokedBy || '';
    const ef = String(o.event || '').toLowerCase(), wf = String(o.who || '').toLowerCase();
    const rows = recs.filter((r) => isObj(r) && r.eventName && (!ef || r.eventName.toLowerCase().includes(ef)) && (!wf || `${who(r)} ${r.userIdentity?.arn || ''} ${r.userIdentity?.type || ''}`.toLowerCase().includes(wf)) && (!o.errors || r.errorCode));
    if (!rows.length && !recs.some((r) => isObj(r) && r.eventName)) throw new Error('No CloudTrail events found (records need eventName and eventTime).');
    const flags = [];
    for (const r of rows) {
      const w = `${r.eventTime}  ${r.eventName}  by ${who(r)} from ${r.sourceIPAddress || '?'}`;
      if (r.userIdentity?.type === 'Root') flags.push(`root identity used: ${w}`);
      if (r.eventName === 'ConsoleLogin' && r.responseElements?.ConsoleLogin === 'Failure') flags.push(`failed console login: ${w}`);
      if (r.eventName === 'ConsoleLogin' && r.additionalEventData?.MFAUsed === 'No') flags.push(`console login without MFA: ${w}`);
      if (/AccessDenied|UnauthorizedOperation|Unauthorized/i.test(r.errorCode || '')) flags.push(`${r.errorCode}: ${w}`);
    }
    const times = rows.map((r) => Date.parse(r.eventTime)).filter(Number.isFinite);
    const sum = `${rows.length} event(s)${bad ? `; ${bad} line(s) were not JSON` : ''}${times.length ? `\nFrom ${iso(Math.min(...times))} to ${iso(Math.max(...times))}` : ''}\n\n` + sec('Event names', bars(count(rows, (r) => r.eventName), 12)) + '\n' + sec('Identities', bars(count(rows, who), 8)) + '\n' + sec('Services (eventSource)', bars(count(rows, (r) => r.eventSource), 8)) + '\n' + sec('Regions', bars(count(rows, (r) => r.awsRegion), 6)) + '\n' + sec('Source IPs', bars(count(rows, (r) => r.sourceIPAddress), 6)) + '\n' + sec('Errors', bars(count(rows, (r) => r.errorCode || null), 6)) + '\n' + sec('Worth a second look (review, not proof of a problem)', [...new Set(flags)].slice(0, 30).join('\n') || '(none of the simple patterns matched)') + '\nThe review list uses four fixed patterns: Root identity, failed console login, console login without MFA, AccessDenied-type errors.';
    return view(rows.map((r) => ({ time: r.eventTime, event: r.eventName, source: r.eventSource, who: who(r), ip: r.sourceIPAddress, region: r.awsRegion, error: r.errorCode || '', readOnly: r.readOnly })), ['time', 'event', 'source', 'who', 'ip', 'region', 'error', 'readOnly'], o, sum);
  },
});

// ---------- 812 Cloudflare Logpush ----------
T.push({
  id: 'cloudflare-logpush-viewer', cat: LOGCAT, title: 'Cloudflare Logpush HTTP Request Log Viewer (Cache, Country, Bot Score)',
  desc: 'Summarise Cloudflare Logpush http_requests files (NDJSON, .gz allowed): cache status, status codes, countries, bot score bands, top paths and edge time to first byte.',
  inputs: 1, labels: ['Logpush NDJSON'], file: FILE,
  opts: [txt('where', 'Filters, separated by ; (EdgeResponseStatus>=500;ClientCountry=DE)', ''), ...VOPTS],
  sample: '{"ClientIP":"203.0.113.7","ClientCountry":"de","ClientRequestHost":"example.com","ClientRequestMethod":"GET","ClientRequestPath":"/","ClientRequestUserAgent":"Mozilla/5.0","EdgeResponseStatus":200,"CacheCacheStatus":"hit","BotScore":96,"EdgeStartTimestamp":"2024-10-10T10:00:00Z","EdgeTimeToFirstByteMs":12,"EdgeResponseBytes":4521}\n{"ClientIP":"198.51.100.4","ClientCountry":"us","ClientRequestHost":"example.com","ClientRequestMethod":"GET","ClientRequestPath":"/wp-login.php","ClientRequestUserAgent":"python-requests/2.31","EdgeResponseStatus":404,"CacheCacheStatus":"dynamic","BotScore":3,"EdgeStartTimestamp":"2024-10-10T10:00:02Z","EdgeTimeToFirstByteMs":40,"EdgeResponseBytes":300}',
  run: async ([i], o, files) => {
    const { recs, bad } = parseJsonRecords(await readText(i, files));
    const f = condMatcher(o.where), rows = recs.filter(isObj).map((r) => flat(r)).filter(f);
    if (!rows.some((r) => 'EdgeResponseStatus' in r || 'ClientIP' in r)) throw new Error('These records do not look like Cloudflare http_requests logs (no EdgeResponseStatus or ClientIP).');
    const band = (r) => (r.BotScore === undefined || r.BotScore === '' || r.BotScore === 0 ? 'no score' : r.BotScore === 1 ? '1 automated' : r.BotScore < 30 ? '2-29 likely automated' : '30-99 likely human');
    const sum = `${rows.length} request(s)${bad ? `; ${bad} line(s) were not JSON` : ''}\n\n` + sec('Cache status', bars(count(rows, (r) => r.CacheCacheStatus || '(none)'))) + '\n' + sec('Edge response status', bars(count(rows, (r) => r.EdgeResponseStatus))) + '\n' + sec('Origin response status', bars(count(rows, (r) => r.OriginResponseStatus || null), 6)) + '\n' + sec('Client country', bars(count(rows, (r) => (r.ClientCountry ? String(r.ClientCountry).toUpperCase() : null)), 10)) + '\n' + sec('Bot score band', bars(count(rows, band))) + '\n' + sec('Top paths', bars(count(rows, (r) => r.ClientRequestPath), 8)) + '\n' + sec('Top client IPs', bars(count(rows, (r) => r.ClientIP), 6)) + '\n' + latLine('EdgeTimeToFirstByteMs', rows.map((r) => +r.EdgeTimeToFirstByteMs), ' ms') + '\n\nBot score bands follow Cloudflare\'s description (1 automated, 2-29 likely automated, 30-99 likely human). Bot score is only present on plans that include Bot Management.';
    return view(rows, ['EdgeStartTimestamp', 'ClientIP', 'ClientCountry', 'ClientRequestMethod', 'ClientRequestPath', 'EdgeResponseStatus', 'CacheCacheStatus', 'BotScore'], o, sum);
  },
});

// ---------- 813 CDN edge log, mapped fields ----------
const DELIMS = { space: ' ', tab: '\t', comma: ',', pipe: '|', semicolon: ';' };
function splitDelim(line, d) {
  if (d === ' ') return tokens(line);
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === d && !q) { out.push(cur); cur = ''; } else cur += c; }
  out.push(cur); return out;
}
T.push({
  id: 'cdn-edge-log-parser', cat: LOGCAT, title: 'CDN Edge Log Parser for Fastly and Akamai (Map Your Own Fields)',
  desc: 'Name the fields of your CDN log once (delimiter plus a list of names) and get a table with cache hit ratio, status codes, top URLs and bytes. Works with Fastly custom formats, Akamai DataStream exports and similar.',
  inputs: 1, labels: ['CDN log lines'], file: FILE,
  opts: [sel('delim', 'Delimiter', Object.keys(DELIMS)), txt('fields', 'Field names in order (comma separated)', 'time,client_ip,method,url,status,bytes,cache,user_agent'), txt('statusF', 'Status field', 'status'), txt('cacheF', 'Cache result field', 'cache'), txt('urlF', 'URL field', 'url'), txt('bytesF', 'Bytes field', 'bytes'), txt('timeF', 'Duration field (optional, milliseconds)', ''), ...VOPTS],
  sample: '2024-10-10T10:00:00Z 203.0.113.7 GET /index.html 200 4521 HIT "Mozilla/5.0"\n2024-10-10T10:00:01Z 198.51.100.4 GET /app.js 200 88123 MISS "Mozilla/5.0"\n2024-10-10T10:00:02Z 203.0.113.7 GET /app.js 304 0 HIT "Mozilla/5.0"\n2024-10-10T10:00:03Z 192.0.2.9 GET /api/x 502 120 PASS "curl/8.5.0"',
  run: async ([i], o, files) => {
    const names = String(o.fields).split(',').map((s) => s.trim()).filter(Boolean);
    if (!names.length) throw new Error('Name at least one field.');
    const d = DELIMS[o.delim]; const recs = []; let bad = 0, total = 0;
    for (const l of nonEmpty(await readText(i, files))) { total++; const p = splitDelim(l, d); if (p.length < names.length) { bad++; continue; } const r = {}; names.forEach((n, k) => { r[n] = p[k]; }); recs.push(r); }
    if (!recs.length) throw new Error('No line had enough fields. Check the delimiter and the field list.');
    for (const k of [o.statusF, o.cacheF, o.urlF, o.bytesF].filter(Boolean)) if (!names.includes(k)) throw new Error(`"${k}" is not in your field list.`);
    const cache = o.cacheF ? count(recs, (r) => { const v = String(r[o.cacheF]); return /hit/i.test(v) ? 'hit' : /miss/i.test(v) ? 'miss' : v || '(empty)'; }) : new Map();
    const h = cache.get('hit') || 0, m = cache.get('miss') || 0;
    const sum = `${recs.length} request(s)${badNote(bad, total)}\n` + (o.bytesF ? `Bytes: ${fmtBytes(sumN(recs, o.bytesF))}\n` : '') + '\n' + (o.cacheF ? sec(`Cache result (hit ratio ${recs.length ? (100 * h / recs.length).toFixed(1) : 0}% of all requests, ${h + m ? (100 * h / (h + m)).toFixed(1) : '-'}% of hit+miss)`, bars(cache)) + '\n' : '') + (o.statusF ? sec('Status', bars(count(recs, (r) => r[o.statusF]))) + '\n' : '') + (o.urlF ? sec('Top URLs', bars(count(recs, (r) => r[o.urlF]), 10)) + '\n' : '') + (o.timeF ? latLine(o.timeF, recs.map((r) => +r[o.timeF]), ' ms') + '\n' : '') + '\n"hit" is any cache value containing HIT (HIT, TCP_HIT, REFRESH_HIT); "miss" any value containing MISS. PASS, BYPASS and others are listed on their own.';
    return view(recs, names, o, sum);
  },
});

// ---------- 814 GCP ----------
const GSEV = ['DEFAULT', 'DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY'];
T.push({
  id: 'gcp-log-export-viewer', cat: LOGCAT, title: 'Google Cloud Logging Export Viewer (LogEntry JSON)',
  desc: 'Read JSON exported from Logs Explorer or a log sink. Filter by minimum severity, resource type or text, and see counts by severity and resource with the message of each entry.',
  inputs: 1, labels: ['LogEntry JSON (array or JSON lines)'], file: { accept: '.json,.ndjson,.gz,.txt', multiple: true, optional: true },
  opts: [sel('sev', 'Severity and worse', GSEV), txt('rtype', 'Resource type contains', ''), txt('text', 'Message contains', ''), ...VOPTS],
  sample: JSON.stringify([{ timestamp: '2024-10-10T10:00:00Z', severity: 'INFO', resource: { type: 'cloud_run_revision', labels: { service_name: 'api', location: 'europe-west1' } }, logName: 'projects/p/logs/run.googleapis.com%2Frequests', httpRequest: { requestMethod: 'GET', requestUrl: 'https://api.example.com/items', status: 200, latency: '0.045s' } }, { timestamp: '2024-10-10T10:00:05Z', severity: 'ERROR', resource: { type: 'cloud_run_revision', labels: { service_name: 'api' } }, logName: 'projects/p/logs/run.googleapis.com%2Fstderr', textPayload: 'Unhandled exception: connection reset' }, { timestamp: '2024-10-10T10:01:00Z', severity: 'NOTICE', resource: { type: 'gce_instance', labels: { instance_id: '123' } }, protoPayload: { methodName: 'v1.compute.instances.start', authenticationInfo: { principalEmail: 'ops@example.com' } } }], null, 1),
  run: async ([i], o, files) => {
    const { recs, bad } = parseJsonRecords(await readText(i, files));
    const msg = (r) => r.textPayload ?? r.jsonPayload?.message ?? r.jsonPayload?.msg ?? (r.protoPayload ? `${r.protoPayload.methodName || r.protoPayload['@type'] || ''}${r.protoPayload.authenticationInfo?.principalEmail ? ' by ' + r.protoPayload.authenticationInfo.principalEmail : ''}` : '') ?? '';
    const k = GSEV.indexOf(o.sev), tf = String(o.text || '').toLowerCase(), rf = String(o.rtype || '').toLowerCase();
    const rows = recs.filter((r) => isObj(r) && (r.logName || r.severity || r.resource)).map((r) => {
      const m = r.httpRequest ? `${r.httpRequest.requestMethod || ''} ${r.httpRequest.requestUrl || ''} ${r.httpRequest.status || ''} ${r.httpRequest.latency || ''}`.trim() : String(typeof msg(r) === 'string' ? msg(r) : JSON.stringify(msg(r)));
      return { time: r.timestamp || r.receiveTimestamp || '', severity: r.severity || 'DEFAULT', resource: r.resource?.type || '', source: r.resource?.labels?.service_name || r.resource?.labels?.instance_id || r.resource?.labels?.function_name || r.resource?.labels?.pod_name || '', log: decodeUri((r.logName || '').split('/logs/')[1] || r.logName || ''), message: m };
    }).filter((r) => GSEV.indexOf(r.severity) >= k && (!rf || r.resource.toLowerCase().includes(rf)) && (!tf || r.message.toLowerCase().includes(tf)));
    if (!rows.length && !recs.some((r) => isObj(r) && (r.logName || r.severity))) throw new Error('No LogEntry records found (expected logName, severity or resource).');
    const sum = `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}${bad ? `; ${bad} line(s) were not JSON` : ''}\n\n` + sec('Severity', bars(count(rows, (r) => r.severity))) + '\n' + sec('Resource type', bars(count(rows, (r) => r.resource || null))) + '\n' + sec('Source (service, instance, function or pod)', bars(count(rows, (r) => r.source || null), 8)) + '\n' + sec('Most repeated messages', topRows(count(rows, (r) => r.message.replace(/\d+/g, '#').slice(0, 100)), 6, 'message').map((r) => `${r.count}  ${r.message}`).join('\n')) + '\nSeverity order is the LogSeverity enum: DEFAULT, DEBUG, INFO, NOTICE, WARNING, ERROR, CRITICAL, ALERT, EMERGENCY.';
    return view(rows, ['time', 'severity', 'resource', 'source', 'log', 'message'], o, sum);
  },
});

// ---------- 815 Azure Monitor ----------
T.push({
  id: 'azure-monitor-log-viewer', cat: LOGCAT, title: 'Azure Monitor Diagnostic Log Viewer (Exported JSON Records)',
  desc: 'Parse Azure diagnostic log JSON from storage blobs, Event Hubs or Log Analytics exports into a searchable table, with counts by category, level, operation and result.',
  inputs: 1, labels: ['Azure diagnostic JSON (records array or JSON lines)'], file: { accept: '.json,.ndjson,.gz,.txt,.csv', multiple: true, optional: true },
  opts: [txt('category', 'Category contains', ''), txt('level', 'Level contains (Error, Warning)', ''), txt('text', 'Any field contains', ''), ...VOPTS],
  sample: '{"time":"2024-10-10T10:00:00.000Z","resourceId":"/SUBSCRIPTIONS/0000/RESOURCEGROUPS/RG1/PROVIDERS/MICROSOFT.WEB/SITES/MYAPP","category":"AppServiceHTTPLogs","operationName":"Microsoft.Web/sites/log","level":"Informational","properties":{"CsMethod":"GET","CsUriStem":"/","ScStatus":200,"TimeTaken":31}}\n{"time":"2024-10-10T10:00:03.000Z","resourceId":"/SUBSCRIPTIONS/0000/RESOURCEGROUPS/RG1/PROVIDERS/MICROSOFT.KEYVAULT/VAULTS/KV1","category":"AuditEvent","operationName":"SecretGet","resultType":"Failure","resultSignature":"Forbidden","level":"Error","callerIpAddress":"203.0.113.7"}',
  run: async ([i], o, files) => {
    const { recs, bad } = parseJsonRecords(await readText(i, files));
    const cf = String(o.category || '').toLowerCase(), lf = String(o.level || '').toLowerCase(), tf = String(o.text || '').toLowerCase();
    const rows = recs.filter((r) => isObj(r) && (r.time || r.TimeGenerated || r.category || r.Category || r.resourceId)).map((r) => ({
      time: r.time || r.TimeGenerated || r.timestamp || '', resource: String(r.resourceId || r._ResourceId || '').split('/').slice(-3).join('/'), category: r.category || r.Category || '', level: r.level || r.Level || r.properties?.level || '', operation: r.operationName || r.OperationName || '',
      result: r.resultType || r.ResultType || r.resultSignature || r.properties?.ScStatus || '', ip: r.callerIpAddress || r.CallerIPAddress || '', detail: JSON.stringify(r.properties ?? r.Properties ?? {}).slice(0, 300), _raw: JSON.stringify(r).toLowerCase(),
    })).filter((r) => (!cf || String(r.category).toLowerCase().includes(cf)) && (!lf || String(r.level).toLowerCase().includes(lf)) && (!tf || r._raw.includes(tf)));
    if (!rows.length && !recs.some((r) => isObj(r) && (r.category || r.resourceId))) throw new Error('No Azure diagnostic records found (expected time, category or resourceId).');
    const sum = `${rows.length} record(s)${bad ? `; ${bad} line(s) were not JSON` : ''}\n\n` + sec('Category', bars(count(rows, (r) => r.category || null))) + '\n' + sec('Level', bars(count(rows, (r) => r.level || null))) + '\n' + sec('Operation', bars(count(rows, (r) => r.operation || null), 8)) + '\n' + sec('Result', bars(count(rows, (r) => String(r.result) || null), 8)) + '\n' + sec('Resource (last three parts of resourceId)', bars(count(rows, (r) => r.resource || null), 6)) + '\nField names differ between resource types and between the blob and Log Analytics shapes; unknown names are left empty. The detail column shows the properties object.';
    return view(rows, ['time', 'resource', 'category', 'level', 'operation', 'result', 'ip', 'detail'], o, sum);
  },
});

// ---------- 816 Vercel / Netlify ----------
T.push({
  id: 'vercel-netlify-log-viewer', cat: LOGCAT, title: 'Vercel and Netlify Log Export Viewer (Routes, Status, Errors)',
  desc: 'Parse Vercel log drain or runtime log JSON and Netlify function log lines. Groups requests by route and status, shows error rates and the most common error messages.',
  inputs: 1, labels: ['Vercel JSON / JSON lines, or Netlify function log lines'], file: FILE,
  opts: [txt('where', 'Filters, separated by ; (status>=500;path~/api)', ''), ...VOPTS],
  sample: '{"timestamp":1728554400000,"source":"lambda","level":"info","path":"/api/items","statusCode":200,"proxy":{"method":"GET","host":"example.com","path":"/api/items","statusCode":200,"region":"fra1"},"message":"GET /api/items 200"}\n{"timestamp":1728554405000,"source":"lambda","level":"error","path":"/api/pay","statusCode":500,"proxy":{"method":"POST","host":"example.com","path":"/api/pay","statusCode":500},"message":"TypeError: Cannot read properties of undefined"}\n{"timestamp":1728554410000,"source":"edge","level":"info","path":"/","statusCode":200,"proxy":{"method":"GET","host":"example.com","path":"/","statusCode":200}}',
  run: async ([i], o, files) => {
    const text = await readText(i, files); let recs = [], bad = 0;
    try { ({ recs, bad } = parseJsonRecords(text)); } catch { /* maybe Netlify text lines */ }
    if (!recs.length) {
      for (const l of nonEmpty(text)) {
        const m = /^(?:(\d{4}-\d\d-\d\dT[\d:.]+Z)\s+)?(?:\[?(INFO|WARN|ERROR|DEBUG)\]?\s+)?(?:(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s+(\d{3})\b)?\s*(.*)$/i.exec(l);
        if (m && (m[3] || m[2] || m[1])) recs.push({ timestamp: m[1], level: m[2] && m[2].toLowerCase(), method: m[3], path: m[4], statusCode: m[5] && +m[5], message: m[6] }); else bad++;
      }
    }
    if (!recs.length) throw new Error('No Vercel JSON records or Netlify log lines found.');
    const rows = recs.filter(isObj).map((r) => {
      const t = pick(r, ['timestamp', 'time', 'ts', 'date']);
      return { time: typeof t === 'number' ? iso(t) : t || '', source: r.source || '', level: String(pick(r, ['level', 'severity']) ?? '').toLowerCase(), method: pick(r, ['proxy.method', 'method', 'requestMethod']) || '', path: String(pick(r, ['proxy.path', 'requestPath', 'path', 'url']) ?? '').split('?')[0], status: +(pick(r, ['proxy.statusCode', 'responseStatusCode', 'statusCode', 'status']) || 0) || '', region: pick(r, ['proxy.region', 'region', 'executionRegion']) || '', message: String(pick(r, ['message', 'msg', 'text']) ?? '').slice(0, 300) };
    }).filter(condMatcher(o.where));
    const withStatus = rows.filter((r) => r.status);
    const routes = new Map(); for (const r of withStatus) { const x = routes.get(r.path || '(none)') || { n: 0, e: 0 }; x.n++; if (r.status >= 500) x.e++; routes.set(r.path || '(none)', x); }
    const errMsgs = count(rows.filter((r) => r.level === 'error' || r.status >= 500), (r) => r.message.replace(/\d+/g, '#').slice(0, 100) || null);
    const sum = `${rows.length} record(s), ${withStatus.length} with a status${bad ? `; ${bad} line(s) not recognised` : ''}\n\n` + sec('Routes (requests, 5xx errors, 5xx rate)', [...routes.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12).map(([p, v]) => `${p}  ${v.n}  ${v.e}  ${(100 * v.e / v.n).toFixed(1)}%`).join('\n')) + '\n' + sec('Status', bars(count(withStatus, (r) => r.status))) + '\n' + sec('Level', bars(count(rows, (r) => r.level || null))) + '\n' + sec('Source', bars(count(rows, (r) => r.source || null))) + '\n' + sec('Most common error messages', bars(errMsgs, 6)) + '\nField names are matched by guesswork (proxy.statusCode, statusCode, requestPath, path ...). Export shapes differ by plan and drain type, so check the columns against your file.';
    return view(rows, ['time', 'source', 'level', 'method', 'path', 'status', 'region', 'message'], o, sum);
  },
});


// =====================================================================================================
// Log parsing and analysis, part 2: proxies, databases, grouping and text tools
// =====================================================================================================

// ---------- 817 Heroku router ----------
const H_CODES = { H10: 'App crashed', H11: 'Backlog too deep', H12: 'Request timeout', H13: 'Connection closed without response', H14: 'No web dynos running', H15: 'Idle connection', H17: 'Poorly formatted HTTP response', H18: 'Server Request Interrupted', H19: 'Backend connection timeout', H20: 'App boot timeout', H21: 'Backend connection refused', H22: 'Connection limit reached', H24: 'Forced close', H25: 'HTTP Restriction', H26: 'Request Error', H27: 'Client Request Interrupted', H28: 'Client Connection Idle', H31: 'Misdirected Request', H32: 'TLS Certificate Mismatch', H33: 'HTTP/2 Stream Broken', H34: 'All up dynos are quarantined', H80: 'Maintenance mode', H81: 'Blank app', H82: 'You\'ve used up your dyno hour pool', H83: 'Planned Service Degradation', H99: 'Platform error' };
const ms0 = (v) => (v === undefined || v === '' ? NaN : parseFloat(String(v)));
T.push({
  id: 'heroku-router-log-parser', cat: LOGCAT, title: 'Heroku Router Log Parser (Dyno, Service Time, H-Code Errors)',
  desc: 'Extract dyno, connect and service time, status and bytes from heroku[router] lines. Counts H-code errors such as H12 request timeout with their official titles, and ranks slow paths.',
  inputs: 1, labels: ['heroku logs output'], file: FILE,
  opts: [txt('status', 'Status filter (503, 5xx)', ''), ...VOPTS],
  sample: '2024-10-10T10:00:00.123456+00:00 heroku[router]: at=info method=GET path="/" host=app.example.com request_id=a1 fwd="203.0.113.7" dyno=web.1 connect=1ms service=12ms status=200 bytes=5120 protocol=https\n2024-10-10T10:00:05.000000+00:00 heroku[router]: at=error code=H12 desc="Request timeout" method=GET path="/report" host=app.example.com request_id=a2 fwd="203.0.113.7" dyno=web.2 connect=1ms service=30000ms status=503 bytes= protocol=https\n2024-10-10T10:00:06.000000+00:00 app[web.1]: started',
  run: async ([i], o, files) => {
    const ls = nonEmpty(await readText(i, files)); const recs = []; let other = 0;
    for (const l of ls) {
      const m = /^(\S+)\s+heroku\[router\]:\s+(.*)$/.exec(l) || /^()heroku\[router\]:\s+(.*)$/.exec(l) || /^()(?=.*\bat=(?:info|warning|error)\b)(.*\b(?:method|path)=.*)$/.exec(l);
      if (!m) { other++; continue; }
      const k = parseLogfmt(m[2], false, false);
      recs.push({ time: m[1] || '', at: k.at || '', code: k.code || '', desc: k.desc || (H_CODES[k.code] ? H_CODES[k.code] : ''), method: k.method || '', path: k.path || '', host: k.host || '', dyno: k.dyno || '', connect: ms0(k.connect), service: ms0(k.service), status: k.status ? +k.status : '', bytes: k.bytes === '' || k.bytes === undefined ? '' : +k.bytes, fwd: k.fwd || '' });
    }
    if (!recs.length) throw new Error('No heroku[router] lines found. Run: heroku logs --source heroku --dyno router');
    const sm = statusMatcher(o.status), rows = recs.filter((r) => sm(r.status));
    const pathStats = new Map(); for (const r of rows) { const a = pathStats.get(r.path) || []; a.push(r.service); pathStats.set(r.path, a); }
    const slow = [...pathStats.entries()].map(([p, v]) => ({ p, n: v.length, p95: pctl(v.filter(Number.isFinite).sort((a, b) => a - b), 95) })).sort((a, b) => b.p95 - a.p95).slice(0, 6);
    const sum = `${rows.length} router line(s)${other ? `; ${other} other line(s) skipped` : ''}\n\n` + sec('Status', bars(count(rows, (r) => r.status || '(none)'))) + '\n' + sec('H-codes (titles from the Heroku error codes page)', bars(count(rows, (r) => (r.code ? `${r.code} ${H_CODES[r.code] || r.desc}` : null)))) + '\n' + latLine('service', rows.map((r) => r.service), ' ms') + '\n' + latLine('connect', rows.map((r) => r.connect), ' ms') + '\n\n' + sec('Dynos', bars(count(rows, (r) => r.dyno || null), 8)) + '\n' + sec('Slowest paths by p95 service time', slow.map((s) => `${s.p95} ms  (${s.n} req)  ${s.p}`).join('\n')) + '\nA service time near 30000 ms with status 503 is the signature of an H12 timeout.';
    return view(rows, ['time', 'dyno', 'method', 'path', 'status', 'code', 'connect', 'service', 'bytes', 'fwd'], o, sum);
  },
});

// ---------- 818 HAProxy ----------
const HAP1 = { C: 'client aborted the TCP session', S: 'server aborted or refused the session', P: 'proxy aborted it (limit, deny rule or security check)', L: 'processed locally by HAProxy', R: 'a proxy resource was exhausted', I: 'internal error in the proxy', D: 'killed because the server was detected as down', U: 'killed on a backup server because an active server came back up', K: 'killed by an admin', c: 'client-side timeout', s: 'server-side timeout', '-': 'normal completion' };
const HAP2 = { R: 'waiting for a complete request', Q: 'waiting in the queue', C: 'waiting for the server connection', H: 'waiting for response headers', D: 'data phase', L: 'sending last data to the client', T: 'tarpitted', '-': 'normal end' };
const HAP_RE = /^(?:(\w{3} +\d+ [\d:]+) (\S+) )?(?:(\S+?)\[(\d+)\]: )?(\S+):(\d+) \[([^\]]+)\] (\S+) (\S+?)\/(\S+) (-?\d+)\/(-?\d+)\/(-?\d+)\/(-?\d+)\/(-?\d+) (\d{3}|-1) (\d+) (\S+) (\S+) (\S{4}) (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+) (\d+)\/(\d+)(?: \{([^}]*)\})?(?: \{([^}]*)\})? "(.*)"$/;
T.push({
  id: 'haproxy-log-parser', cat: LOGCAT, title: 'HAProxy HTTP Log Parser: Timers and Termination State Decoder',
  desc: 'Decode HAProxy httplog lines: client, frontend, backend/server, the Tq/Tw/Tc/Tr/Ta timers, status, bytes and the four-letter termination state such as sD-- explained in words.',
  inputs: 1, labels: ['HAProxy httplog lines'], file: FILE,
  opts: [txt('status', 'Status filter (503, 5xx)', ''), ...VOPTS],
  sample: 'Oct 10 12:14:14 localhost haproxy[14389]: 10.0.1.2:33317 [10/Oct/2024:12:14:14.655] http-in static/srv1 10/0/30/69/109 200 2750 - - ---- 1/1/1/1/0 0/0 {example.com} {} "GET /index.html HTTP/1.1"\nOct 10 12:14:20 localhost haproxy[14389]: 10.0.1.3:40001 [10/Oct/2024:12:14:15.100] http-in api/srv2 5/0/0/-1/30005 504 194 - - sH-- 3/2/1/1/0 0/0 "GET /slow HTTP/1.1"\nOct 10 12:14:21 localhost haproxy[14389]: 10.0.1.4:40002 [10/Oct/2024:12:14:21.000] http-in api/<NOSRV> -1/-1/-1/-1/0 503 212 - - SC-- 0/0/0/0/0 0/0 "GET /down HTTP/1.1"',
  run: async ([i], o, files) => {
    const ls = nonEmpty(await readText(i, files)); const recs = []; let bad = 0;
    for (const l of ls) {
      const m = HAP_RE.exec(l); if (!m) { bad++; continue; }
      const st = m[19];
      recs.push({ time: m[7], client: `${m[5]}:${m[6]}`, frontend: m[8], backend: m[9], server: m[10], Tq: +m[11], Tw: +m[12], Tc: +m[13], Tr: +m[14], Ta: +m[15], status: +m[16], bytes: +m[17], state: m[20], retries: +m[25], srv_queue: +m[26], be_queue: +m[27], request: m[30] });
    }
    if (!recs.length) throw new Error('No HAProxy HTTP log lines recognised. Expected "client:port [date] frontend backend/server TR/Tw/Tc/Tr/Ta status bytes ...". TCP-mode logs and custom log-format lines are not supported.');
    const sm = statusMatcher(o.status), rows = recs.filter((r) => sm(r.status));
    const words = (s) => (s === '----' ? null : `${s}: ${HAP1[s[0]] || '?'}; ${HAP2[s[1]] || '?'}`);
    const sum = `${rows.length} request(s)${badNote(bad, ls.length)}\n\n` + sec('Status', bars(count(rows, (r) => r.status))) + '\n' + sec('Termination state (first two letters decoded; "----" is normal)', [...count(rows, (r) => words(r.state)).entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${c}  ${k}`).join('\n') || '(all normal)') + '\n' + sec('Backend / server', bars(count(rows, (r) => `${r.backend}/${r.server}`), 8)) + '\n' + latLine('Ta (total time)', rows.map((r) => r.Ta).filter((x) => x >= 0), ' ms') + '\n' + latLine('Tr (server response time)', rows.map((r) => r.Tr).filter((x) => x >= 0), ' ms') + `\nRequests that waited in a queue (Tw > 0): ${rows.filter((r) => r.Tw > 0).length}. Requests with retries: ${rows.filter((r) => r.retries > 0).length}.\n\nTimers and flags follow the HAProxy configuration manual, section 8 (TR/Tw/Tc/Tr/Ta in ms; -1 means the stage was not reached). The third and fourth letters (cookie handling) are shown in the table but not decoded.`;
    return view(rows, ['time', 'client', 'frontend', 'backend', 'server', 'Tq', 'Tw', 'Tc', 'Tr', 'Ta', 'status', 'bytes', 'state', 'request'], o, sum);
  },
});

// ---------- 819 Traefik / Caddy ----------
T.push({
  id: 'traefik-caddy-log-parser', cat: LOGCAT, title: 'Traefik and Caddy JSON Access Log Summary',
  desc: 'Read JSON access logs from Traefik or Caddy and summarise requests per router or host, status codes, top paths and duration percentiles.',
  inputs: 1, labels: ['Traefik or Caddy JSON access log'], file: FILE,
  opts: [txt('where', 'Filters, separated by ; (status>=500;path~/api)', ''), ...VOPTS],
  sample: '{"ClientHost":"203.0.113.7","RequestMethod":"GET","RequestHost":"app.example.com","RequestPath":"/api/items","DownstreamStatus":200,"Duration":45000000,"RouterName":"app@docker","ServiceName":"app@docker","StartUTC":"2024-10-10T10:00:00Z"}\n{"level":"info","ts":1728554405.12,"logger":"http.log.access.log0","msg":"handled request","request":{"remote_ip":"198.51.100.4","method":"GET","host":"www.example.com","uri":"/missing"},"duration":0.0012,"size":19,"status":404}',
  run: async ([i], o, files) => {
    const { recs, bad } = parseJsonRecords(await readText(i, files));
    const rows = recs.filter(isObj).map((r) => {
      const traefik = 'DownstreamStatus' in r || 'RouterName' in r;
      const caddy = isObj(r.request) && 'status' in r;
      if (!traefik && !caddy) return null;
      return traefik ? { time: r.StartUTC || r.StartLocal || '', kind: 'traefik', route: r.RouterName || r.RequestHost || '', host: r.RequestHost || '', ip: String(r.ClientHost || '').replace(/:\d+$/, ''), method: r.RequestMethod || '', path: String(r.RequestPath || '').split('?')[0], status: +r.DownstreamStatus || 0, ms: (+r.Duration || 0) / 1e6, bytes: +r.DownstreamContentSize || 0 }
        : { time: typeof r.ts === 'number' ? iso(r.ts * 1000) : '', kind: 'caddy', route: r.request.host || '', host: r.request.host || '', ip: r.request.remote_ip || String(r.request.remote_addr || '').replace(/:\d+$/, ''), method: r.request.method || '', path: String(r.request.uri || '').split('?')[0], status: +r.status || 0, ms: (+r.duration || 0) * 1000, bytes: +r.size || 0 };
    }).filter(Boolean).filter(condMatcher(o.where));
    if (!rows.length) throw new Error('No Traefik (DownstreamStatus) or Caddy (request + status) access records found.');
    const by = new Map(); for (const r of rows) { const x = by.get(r.route) || { n: 0, e: 0, ms: [] }; x.n++; if (r.status >= 500) x.e++; x.ms.push(r.ms); by.set(r.route, x); }
    const sum = `${rows.length} request(s) (${[...new Set(rows.map((r) => r.kind))].join(', ')})${bad ? `; ${bad} line(s) were not JSON` : ''}\n\n` + sec('Routers or hosts (requests, 5xx, p95 ms)', [...by.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12).map(([k, v]) => `${k}  ${v.n}  ${v.e}  ${fix2(pctl(v.ms.sort((a, b) => a - b), 95))}`).join('\n')) + '\n' + sec('Status', bars(count(rows, (r) => r.status))) + '\n' + sec('Top paths', bars(count(rows, (r) => r.path), 10)) + '\n' + latLine('duration', rows.map((r) => r.ms), ' ms') + '\n\nTraefik Duration is read as nanoseconds, Caddy duration as seconds.';
    return view(rows.map((r) => ({ ...r, ms: fix2(r.ms) })), ['time', 'route', 'ip', 'method', 'path', 'status', 'ms', 'bytes'], o, sum);
  },
});

// ---------- SQL fingerprint (shared by Postgres and MySQL) ----------
function fingerprint(q) {
  return q.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').replace(/'(?:[^'\\]|\\.|'')*'/g, '?').replace(/"(?:[^"\\]|\\.)*"(?=\s*[,)=<>])/g, '?').replace(/\b0x[0-9a-f]+\b/gi, '?').replace(/(?<![\w$.])-?\d+(?:\.\d+)?(?![\w$])/g, '?').replace(/\bin\s*\(\s*\?(?:\s*,\s*\?)*\s*\)/gi, 'in (?+)').replace(/\bvalues\s*\(\s*\?(?:\s*,\s*\?)*\s*\)(?:\s*,\s*\(\s*\?(?:\s*,\s*\?)*\s*\))+/gi, 'values (?+)').replace(/\s+/g, ' ').trim().toLowerCase();
}
function queryTable(groups, sortBy, n) {
  const rows = [...groups.entries()].map(([fp, g]) => ({ fp, n: g.t.length, total: g.t.reduce((a, b) => a + b, 0), avg: g.t.reduce((a, b) => a + b, 0) / g.t.length, max: Math.max(...g.t), ex: g.ex, extra: g.extra }));
  rows.sort((a, b) => ({ total: b.total - a.total, avg: b.avg - a.avg, max: b.max - a.max, count: b.n - a.n }[sortBy] || b.total - a.total));
  return rows.slice(0, n);
}
const addG = (m, fp, t, ex, extra) => { const g = m.get(fp) || { t: [], ex, extra: [] }; g.t.push(t); if (extra !== undefined) g.extra.push(extra); m.set(fp, g); };

// ---------- 820 Postgres ----------
T.push({
  id: 'postgres-log-analyzer', cat: LOGCAT, title: 'PostgreSQL Log Analyzer: Slow Queries, Errors and Lock Waits',
  desc: 'Find slow statements (grouped by query shape), errors, lock waits, deadlocks and temporary files in a PostgreSQL server log. A small pgBadger-style summary that runs in your browser.',
  inputs: 1, labels: ['PostgreSQL log text'], file: FILE,
  opts: [sel('sort', 'Rank slow queries by', ['total', 'avg', 'max', 'count']), num('top', 'Queries to show', 10), num('minMs', 'Ignore statements faster than (ms)', 0)],
  sample: '2024-10-10 10:00:00.123 UTC [4121] LOG:  duration: 1520.442 ms  statement: SELECT * FROM orders WHERE customer_id = 42 AND status = \'open\'\n2024-10-10 10:00:03.001 UTC [4122] LOG:  duration: 980.101 ms  statement: SELECT * FROM orders WHERE customer_id = 7 AND status = \'closed\'\n2024-10-10 10:00:04.500 UTC [4123] ERROR:  duplicate key value violates unique constraint "users_email_key"\n2024-10-10 10:00:04.500 UTC [4123] DETAIL:  Key (email)=(a@example.com) already exists.\n2024-10-10 10:00:04.500 UTC [4123] STATEMENT:  INSERT INTO users(email) VALUES (\'a@example.com\')\n2024-10-10 10:00:07.000 UTC [4130] LOG:  process 4130 still waiting for ShareLock on transaction 991 after 1000.123 ms\n2024-10-10 10:00:09.000 UTC [4131] ERROR:  deadlock detected\n2024-10-10 10:00:10.000 UTC [4140] LOG:  temporary file: path "base/pgsql_tmp/pgsql_tmp4140.0", size 104857600',
  run: async ([i], o, files) => {
    const raw = lines(await readText(i, files)); const ents = [];
    for (const l of raw) {
      const m = /^(.*?)\b(LOG|ERROR|FATAL|PANIC|WARNING|NOTICE|INFO|DEBUG[1-5]?|STATEMENT|DETAIL|HINT|CONTEXT|QUERY):\s{1,2}(.*)$/.exec(l);
      if (m && !/^\s/.test(l)) ents.push({ pre: m[1].trim(), sev: m[2], msg: m[3], more: [] });
      else if (ents.length && (/^\s/.test(l) || !l.trim())) ents[ents.length - 1].more.push(l.trim());
    }
    if (!ents.length) throw new Error('No PostgreSQL log entries found (lines like "... LOG:  message"). Check log_line_prefix includes a timestamp and the level is printed.');
    const full = (e) => [e.msg, ...e.more].join(' ').trim();
    const slow = new Map(), errs = new Map(), locks = [], temp = []; let dead = 0, nSlow = 0;
    ents.forEach((e, k) => {
      const m = /^duration: ([\d.]+) ms\s+(?:(statement|execute [^:]*|parse [^:]*|bind [^:]*):\s*)?([\s\S]*)$/.exec(full(e));
      if (e.sev === 'LOG' && m) { const t = +m[1]; if (t >= (+o.minMs || 0)) { nSlow++; addG(slow, fingerprint(m[3] || '(no statement text; log_min_duration_statement logged only the time)'), t, (m[3] || '').slice(0, 300)); } return; }
      if (['ERROR', 'FATAL', 'PANIC'].includes(e.sev)) {
        if (/deadlock detected/.test(e.msg)) dead++;
        let st = ''; for (let j = k + 1; j < Math.min(ents.length, k + 5); j++) { if (ents[j].sev === 'STATEMENT') { st = full(ents[j]).slice(0, 200); break; } if (['ERROR', 'FATAL', 'LOG'].includes(ents[j].sev)) break; }
        const key = `${e.sev}: ${e.msg.replace(/"[^"]*"/g, '"?"').replace(/\d+/g, '#')}`; const g = errs.get(key) || { n: 0, first: e.pre, st }; g.n++; errs.set(key, g); return;
      }
      const lw = /process (\d+) (still waiting for|acquired) (\w+) on (.*?) after ([\d.]+) ms/.exec(e.msg); if (lw) { locks.push({ pid: lw[1], what: lw[2], lock: lw[3], on: lw[4], ms: +lw[5], at: e.pre }); return; }
      const tf = /temporary file: path "([^"]*)", size (\d+)/.exec(e.msg); if (tf) temp.push(+tf[2]);
    });
    const qrows = queryTable(slow, o.sort, +o.top || 10);
    const out = `${ents.length} log entries; ${nSlow} timed statement(s) (needs log_min_duration_statement or log_duration); ${[...errs.values()].reduce((a, b) => a + b.n, 0)} error entries; ${dead} deadlock(s)\n\n` + sec('Severity', bars(count(ents, (e) => e.sev))) + '\n' + sec(`Slow statements by query shape (ranked by ${o.sort})`, qrows.map((r, k) => `#${k + 1}  count ${r.n}  total ${fix2(r.total)} ms  avg ${fix2(r.avg)} ms  max ${fix2(r.max)} ms\n    shape:   ${r.fp.slice(0, 220)}\n    example: ${r.ex.replace(/\s+/g, ' ').slice(0, 220)}`).join('\n') || '(none)') + '\n' + sec('Errors (grouped)', [...errs.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10).map(([k, v]) => `${v.n}  ${k.slice(0, 160)}${v.st ? `\n      statement: ${v.st.replace(/\s+/g, ' ')}` : ''}`).join('\n') || '(none)') + '\n' + sec('Lock waits', locks.slice(0, 10).map((l) => `${l.at}  pid ${l.pid} ${l.what} ${l.lock} on ${l.on} after ${l.ms} ms`).join('\n') || '(none)') + `\n${temp.length ? `Temporary files: ${temp.length}, ${fmtBytes(temp.reduce((a, b) => a + b, 0))} in total (a sign of work_mem being too small for some queries)\n` : ''}\nQuery shapes replace string and number literals with ? and lower-case the text. Parsing depends on log_line_prefix; multi-line statements are joined with spaces.`;
    return out;
  },
});

// ---------- 821 MySQL slow log ----------
T.push({
  id: 'mysql-slow-query-analyzer', cat: LOGCAT, title: 'MySQL Slow Query Log Analyzer (Group by Fingerprint)',
  desc: 'Group slow queries by their fingerprint and rank by total time, average, maximum or count. Shows rows examined versus rows sent, lock time and an example of each pattern.',
  inputs: 1, labels: ['MySQL slow query log'], file: FILE,
  opts: [sel('sort', 'Rank by', ['total', 'avg', 'max', 'count']), num('top', 'Patterns to show', 10)],
  sample: '# Time: 2024-10-10T10:00:00.123456Z\n# User@Host: app[app] @ web1 [10.0.0.4]  Id: 77\n# Query_time: 2.501234  Lock_time: 0.000100 Rows_sent: 1  Rows_examined: 1048576\nuse shop;\nSET timestamp=1728554400;\nSELECT * FROM orders WHERE customer_id = 42;\n# Time: 2024-10-10T10:00:05.000000Z\n# User@Host: app[app] @ web1 [10.0.0.4]  Id: 78\n# Query_time: 1.250000  Lock_time: 0.000050 Rows_sent: 1  Rows_examined: 900000\nSELECT * FROM orders WHERE customer_id = 7;\n# Time: 2024-10-10T10:00:09.000000Z\n# User@Host: app[app] @ web1 [10.0.0.4]  Id: 79\n# Query_time: 0.900000  Lock_time: 0.800000 Rows_sent: 0  Rows_examined: 0\nUPDATE stock SET qty = qty - 1 WHERE id IN (1,2,3);',
  run: async ([i], o, files) => {
    const text = await readText(i, files); const groups = new Map(); let cur = null, n = 0, db = '';
    const flush = () => { if (cur && cur.q.trim()) { n++; const fp = fingerprint(cur.q.trim()); addG(groups, fp, cur.qt, cur.q.trim(), { lock: cur.lock, sent: cur.sent, exam: cur.exam }); } cur = null; };
    for (const l of lines(text)) {
      let m;
      if ((m = /^# Query_time: ([\d.]+)\s+Lock_time: ([\d.]+)\s+Rows_sent: (\d+)\s+Rows_examined: (\d+)/.exec(l))) { flush(); cur = { qt: +m[1], lock: +m[2], sent: +m[3], exam: +m[4], q: '' }; continue; }
      if (l.startsWith('#')) { if (cur && l.startsWith('# Time') ) flush(); continue; }
      if (!cur) continue;
      if (/^SET timestamp=\d+;?$/.test(l)) continue;
      if ((m = /^use (\S+);$/i.exec(l))) { db = m[1]; continue; }
      cur.q += (cur.q ? ' ' : '') + l;
    }
    flush();
    if (!n) throw new Error('No slow log entries found (lines starting with "# Query_time:").');
    const rows = queryTable(groups, o.sort, +o.top || 10);
    const allT = [...groups.values()].flatMap((g) => g.t), tot = allT.reduce((a, b) => a + b, 0);
    const avg = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
    return `${n} slow queries in ${groups.size} pattern(s), ${fix2(tot)} s in total\n\n` + rows.map((r, k) => `#${k + 1}  count ${r.n}  total ${fix2(r.total)} s (${(100 * r.total / tot).toFixed(1)}%)  avg ${fix2(r.avg)} s  max ${fix2(r.max)} s\n    avg lock ${fix2(avg(r.extra, 'lock'))} s, rows sent ${fix2(avg(r.extra, 'sent'))}, rows examined ${fix2(avg(r.extra, 'exam'))}${avg(r.extra, 'sent') > 0 && avg(r.extra, 'exam') / avg(r.extra, 'sent') > 100 ? '  (examines >100x the rows it returns: review indexes)' : ''}\n    shape:   ${r.fp.slice(0, 220)}\n    example: ${r.ex.replace(/\s+/g, ' ').slice(0, 220)}`).join('\n\n') + '\n\nFingerprints replace literals with ? and collapse IN and VALUES lists. This is a simplified take on what pt-query-digest does; it does not read the binary or performance_schema forms.';
  },
});

// ---------- 822 Redis slowlog / MongoDB ----------
T.push({
  id: 'redis-mongodb-slowlog-parser', cat: LOGCAT, title: 'Redis SLOWLOG and MongoDB Slow Query Log Parser',
  desc: 'Rank slow operations from redis-cli SLOWLOG GET output or from a mongod JSON log. Redis commands are grouped by command name, MongoDB operations by namespace, command and plan.',
  inputs: 1, labels: ['SLOWLOG GET output or mongod JSON log'], file: FILE,
  opts: [num('top', 'Rows to show', 15), num('minMs', 'Ignore operations faster than (ms)', 0)],
  sample: '1) 1) (integer) 14\n   2) (integer) 1728554400\n   3) (integer) 25000\n   4) 1) "KEYS"\n      2) "user:*"\n   5) "10.0.0.4:51234"\n   6) "worker"\n2) 1) (integer) 13\n   2) (integer) 1728554390\n   3) (integer) 12000\n   4) 1) "SMEMBERS"\n      2) "big:set"\n   5) "10.0.0.4:51236"\n   6) ""',
  run: async ([i], o, files) => {
    const text = (await readText(i, files)).trim(); const min = +o.minMs || 0;
    if (text[0] === '{') {
      const ops = new Map(); let n = 0, total = 0;
      for (const l of nonEmpty(text)) {
        let j; try { j = JSON.parse(l); } catch { continue; }
        const a = j.attr; if (!a || a.durationMillis === undefined || !(j.msg === 'Slow query' || a.type)) continue;
        if (a.durationMillis < min) continue;
        const cmd = a.command ? Object.keys(a.command)[0] : a.type || '?';
        const key = `${a.ns || '(no ns)'}  ${cmd}  plan:${a.planSummary || '-'}`; n++; total += a.durationMillis;
        addG(ops, key, a.durationMillis, JSON.stringify(a.command || a.originatingCommand || {}).slice(0, 220), { exam: a.docsExamined ?? 0, ret: a.nreturned ?? 0 });
      }
      if (!n) throw new Error('No slow operations found. Look for lines with "msg":"Slow query" (MongoDB 4.4+ structured logs).');
      const rows = queryTable(ops, 'total', +o.top || 15);
      return `${n} slow operation(s) in ${ops.size} group(s), ${fix2(total)} ms in total\n\n` + rows.map((r, k) => `#${k + 1}  count ${r.n}  total ${fix2(r.total)} ms  avg ${fix2(r.avg)} ms  max ${fix2(r.max)} ms\n    ${r.fp}\n    docs examined (avg) ${fix2(r.extra.reduce((s, x) => s + x.exam, 0) / r.extra.length)}, returned (avg) ${fix2(r.extra.reduce((s, x) => s + x.ret, 0) / r.extra.length)}${/COLLSCAN/.test(r.fp) ? '  (COLLSCAN: review indexes)' : ''}\n    example: ${r.ex}`).join('\n\n') + '\n\nRead from attr.durationMillis, attr.ns, attr.command and attr.planSummary of the structured log format.';
    }
    const blocks = text.split(/^(?=\s*\d+\) 1\) \(integer\) \d+)/m).filter((b) => /\(integer\)/.test(b)); const cmds = new Map(); let n = 0, total = 0;
    for (const b of blocks) {
      const ints = [...b.matchAll(/\(integer\) (\d+)/g)].map((m) => +m[1]); if (ints.length < 3) continue;
      const strs = [...b.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
      const ci = strs.findIndex((s, k) => k >= 1 && /^\S+:\d+$/.test(s)); const args = ci > 0 ? strs.slice(0, ci) : strs;
      const us = ints[2]; if (us / 1000 < min) continue; n++; total += us;
      addG(cmds, (args[0] || '?').toUpperCase(), us / 1000, args.join(' ').slice(0, 200), { ts: ints[1] });
    }
    if (!n) throw new Error('No SLOWLOG entries found. Paste the output of redis-cli SLOWLOG GET (entries start with "1) 1) (integer) id") or a mongod JSON log.');
    const rows = queryTable(cmds, 'total', +o.top || 15);
    return `${n} slow command(s), ${fix2(total / 1000)} ms in total\n\n` + rows.map((r, k) => `#${k + 1}  ${r.fp}  count ${r.n}  total ${fix2(r.total)} ms  avg ${fix2(r.avg)} ms  max ${fix2(r.max)} ms\n    example: ${r.ex}`).join('\n\n') + '\n\nSLOWLOG durations are microseconds; they are shown in ms. Redis cuts long arguments in the log itself.';
  },
});

// ---------- 825 Exception grouper ----------
function normalizeMsg(s, keepStr) {
  let x = s.replace(/^\s*(?:\[?\d{4}-\d\d-\d\d[T ][\d:.,]+(?:Z|[+-]\d\d:?\d\d)?\]?|\w{3} +\d+ [\d:]{8}|\d{2}:\d\d:\d\d(?:[.,]\d+)?)\s*/, '');
  x = x.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>').replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '<ip>').replace(/\bhttps?:\/\/\S+/g, '<url>').replace(/\b0x[0-9a-f]+\b|\b[0-9a-f]{12,}\b/gi, '<hex>').replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@~+-]+){2,}/g, '<path>');
  if (!keepStr) x = x.replace(/'[^']{0,80}'|"[^"]{0,80}"/g, '<str>');
  return x.replace(/\b\d+(?:\.\d+)?\b/g, '<n>').replace(/\s+/g, ' ').trim();
}
const ERR_LINE = /\b(?:[A-Za-z_.]*(?:Exception|Error)|ERROR|FATAL|SEVERE|Traceback|panic|CRITICAL)\b/;
T.push({
  id: 'exception-grouper', cat: LOGCAT, title: 'Exception Grouper: Cluster Similar Error Messages in a Log',
  desc: 'Group error and exception lines by replacing variable parts (numbers, IDs, IPs, paths, URLs, quoted values) with placeholders. Shows count, first and last line and an example for each group.',
  inputs: 1, labels: ['Log text'], file: FILE,
  opts: [sel('mode', 'Lines to group', ['errors and exceptions only', 'all lines']), chk('keepStr', 'Keep quoted values (do not mask them)', false), num('top', 'Groups to show', 20)],
  sample: '2024-10-10 10:00:00 ERROR Failed to connect to 10.0.0.5:5432 after 3 retries\n2024-10-10 10:00:04 ERROR Failed to connect to 10.0.0.9:5432 after 5 retries\n2024-10-10 10:00:06 INFO started worker 12\njava.lang.NullPointerException: Cannot invoke "User.getName()" because "user" is null\n2024-10-10 10:00:09 ERROR user 8841 not found in /var/data/users/8841.json\n2024-10-10 10:00:11 ERROR user 9120 not found in /var/data/users/9120.json',
  run: async ([i], o, files) => {
    const all = nonEmpty(await readText(i, files)); const groups = new Map();
    all.forEach((l, k) => {
      if (o.mode !== 'all lines' && (!ERR_LINE.test(l) || /^\s+at /.test(l))) return;
      const key = normalizeMsg(l, o.keepStr); if (!key) return;
      const g = groups.get(key) || { n: 0, first: k + 1, last: k + 1, ex: l.trim() }; g.n++; g.last = k + 1; groups.set(key, g);
    });
    if (!groups.size) throw new Error('No error or exception lines found. Switch "Lines to group" to all lines to group everything.');
    const rows = [...groups.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, +o.top || 20);
    const total = [...groups.values()].reduce((a, g) => a + g.n, 0);
    return `${total} line(s) in ${groups.size} group(s), out of ${all.length} non-empty lines\n\n` + rows.map(([k, g], n) => `#${n + 1}  ${g.n}x  (lines ${g.first} to ${g.last})\n    pattern: ${k.slice(0, 200)}\n    example: ${g.ex.slice(0, 200)}`).join('\n\n') + '\n\nMasked: UUIDs, IPs, URLs, hex strings, paths, quoted values, numbers and a leading timestamp. Stack frame lines (starting with "at ") are skipped.';
  },
});

// ---------- 826 Log pattern miner (Drain-style) ----------
T.push({
  id: 'log-pattern-miner', cat: LOGCAT, title: 'Log Pattern Miner: Find Recurring Log Templates (Drain-Style)',
  desc: 'Paste thousands of log lines and get a short list of templates with <*> where lines differ, how often each occurs and an example. Uses a simplified Drain-like clustering.',
  inputs: 1, labels: ['Log lines'], file: FILE,
  opts: [num('sim', 'Similarity threshold (0.1 to 1)', 0.5), chk('strip', 'Strip a leading timestamp and level first', true), num('top', 'Templates to show', 25)],
  sample: '2024-10-10 10:00:00 INFO Accepted connection from 10.0.0.5 port 4412\n2024-10-10 10:00:01 INFO Accepted connection from 10.0.0.9 port 5120\n2024-10-10 10:00:02 WARN Disk usage at 91% on /dev/sda1\n2024-10-10 10:00:03 WARN Disk usage at 95% on /dev/sdb2\n2024-10-10 10:00:04 INFO Accepted connection from 10.0.0.77 port 6001\n2024-10-10 10:00:05 ERROR Timeout while calling payments',
  run: async ([i], o, files) => {
    const st = Math.min(1, Math.max(0.1, +o.sim || 0.5)); const all = nonEmpty(await readText(i, files));
    const buckets = new Map(); const clusters = [];
    for (let k = 0; k < all.length; k++) {
      let s = all[k].trim();
      if (o.strip) { const t = findTs(s); if (t && t.start < 3) s = s.slice(t.end).trim(); s = s.replace(/^[\[(]?(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|FATAL|CRITICAL)[\])]?:?\s+/i, (m, lv) => lv.toUpperCase() + ' '); }
      const tk = s.split(/\s+/).map((w) => (/\d/.test(w) || /^[0-9a-f]{8,}$/i.test(w) ? '<*>' : w));
      const key = `${tk.length}|${tk[0] === '<*>' ? '' : tk[0]}|${tk[1] === '<*>' ? '' : tk[1] ?? ''}`;
      const list = buckets.get(key) || []; let best = null, bs = -1;
      for (const c of list) { let same = 0; for (let j = 0; j < tk.length; j++) if (c.t[j] === tk[j] || c.t[j] === '<*>') same++; const sim = same / tk.length; if (sim > bs) { bs = sim; best = c; } }
      if (best && bs >= st) { for (let j = 0; j < tk.length; j++) if (best.t[j] !== tk[j]) best.t[j] = '<*>'; best.n++; best.last = k + 1; }
      else { const c = { t: tk, n: 1, ex: all[k].trim(), first: k + 1, last: k + 1 }; list.push(c); buckets.set(key, list); clusters.push(c); }
    }
    const rows = clusters.sort((a, b) => b.n - a.n);
    return `${all.length} line(s) in ${rows.length} template(s)\n\n` + rows.slice(0, +o.top || 25).map((c, n) => `#${n + 1}  ${c.n}x (${(100 * c.n / all.length).toFixed(1)}%)\n    ${c.t.join(' ')}\n    example: ${c.ex.slice(0, 160)}`).join('\n\n') + '\n\nWords containing a digit, and long hex strings, are treated as variables up front. Lines are first grouped by word count and their first two words, then merged when at least the similarity share of words match. It is a small take on the Drain idea, so very different wordings of one event stay separate.';
  },
});

// ---------- 827 Log level histogram ----------
T.push({
  id: 'log-level-histogram', cat: LOGCAT, title: 'Log Level Histogram: DEBUG, INFO, WARN, ERROR Counts Over Time',
  desc: 'Count log lines per level in time buckets. Timestamps are detected automatically (ISO 8601, Apache, syslog, epoch) and the result is a table with bars per bucket.',
  inputs: 1, labels: ['Timestamped log lines'], file: FILE,
  opts: [sel('bucket', 'Bucket size', ['auto', 'minute', '5 minutes', '15 minutes', 'hour', 'day']), txt('tz', 'Zone for times without one (UTC, +02:00)', 'UTC'), num('year', 'Year for syslog times (0 = current)', 0)],
  sample: '2024-10-10 10:00:01 INFO started\n2024-10-10 10:00:20 DEBUG cache warm\n2024-10-10 10:01:05 WARN slow query\n2024-10-10 10:01:40 ERROR upstream timeout\n  at com.example.Foo.bar(Foo.java:10)\n2024-10-10 10:01:55 ERROR upstream timeout\n2024-10-10 10:03:10 INFO done',
  run: async ([i], o, files) => {
    const defTz = tzMinutes(o.tz), year = +o.year || undefined; const pts = []; let last = null, noTs = 0;
    for (const l of nonEmpty(await readText(i, files))) {
      const t = findTs(l, { defTz, year }); const lv = findLevel(l);
      if (t) last = t.ms;
      if (lv) { if (last === null) { noTs++; continue; } pts.push({ ms: t ? t.ms : last, lv }); }
    }
    if (!pts.length) throw new Error('No lines with both a timestamp and a level (DEBUG, INFO, WARN, ERROR ...) were found.');
    const lo = Math.min(...pts.map((p) => p.ms)), hi = Math.max(...pts.map((p) => p.ms)), span = hi - lo;
    const size = { minute: 60e3, '5 minutes': 300e3, '15 minutes': 900e3, hour: 3600e3, day: 86400e3 }[o.bucket] || (span <= 2 * 3600e3 ? 60e3 : span <= 2 * 86400e3 ? 3600e3 : 86400e3);
    const start = Math.floor(lo / size) * size, nb = Math.floor((hi - start) / size) + 1;
    if (nb > 2000) throw new Error(`That would be ${nb} buckets. Pick a larger bucket size.`);
    const lvls = LEVELS.filter((l) => pts.some((p) => p.lv === l)), tab = Array.from({ length: nb }, () => Object.fromEntries(lvls.map((l) => [l, 0])));
    for (const p of pts) tab[Math.floor((p.ms - start) / size)][p.lv]++;
    const mx = Math.max(...tab.map((r) => lvls.reduce((a, l) => a + r[l], 0)), 1);
    const rows = tab.map((r, k) => { const tot = lvls.reduce((a, l) => a + r[l], 0); return { bucket: iso(start + k * size).replace(/\.000Z$/, 'Z'), ...r, total: tot, bar: '#'.repeat(Math.round(30 * tot / mx)) }; });
    return `${pts.length} line(s) with a level, bucket ${size / 60000} min, times in UTC${noTs ? `\n${noTs} level line(s) before the first timestamp were skipped` : ''}\n\n` + asTable(rows, ['bucket', ...lvls, 'total', 'bar'], 40) + '\n\nContinuation lines (stack traces) have no level and are not counted. A level is the first word such as ERROR, WARN or INFO found in the line.';
  },
});

// ---------- 828 Timestamp normalizer ----------
const pad3 = (n) => String(n).padStart(3, '0');
function fmtOffset(ms, offMin, withMs) {
  const d = new Date(ms + offMin * 60000), s = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}${withMs ? '.' + pad3(d.getUTCMilliseconds()) : ''}`;
  return s + (offMin === 0 ? 'Z' : (offMin < 0 ? '-' : '+') + pad2(Math.floor(Math.abs(offMin) / 60)) + ':' + pad2(Math.abs(offMin) % 60));
}
T.push({
  id: 'log-timestamp-normalizer', cat: LOGCAT, title: 'Log Timestamp Normalizer: Mixed Formats to ISO 8601',
  desc: 'Find the timestamp in every log line (ISO, Apache, RFC 2822, syslog, logcat, epoch seconds or milliseconds) and rewrite it as ISO 8601 in one time zone. Reports how many lines used each format.',
  inputs: 1, labels: ['Log lines'], file: FILE,
  opts: [txt('from', 'Zone of times that have none (UTC, +02:00)', 'UTC'), txt('to', 'Output zone', 'UTC'), num('year', 'Year for syslog and logcat times (0 = current)', 0), chk('ms', 'Always print milliseconds', false)],
  sample: '10/Oct/2024:13:55:36 +0200 GET /index.html 200\n1728554400 job started\n1728554401123 job step\nOct 10 10:00:05 web1 sshd[12]: Accepted publickey\n2024/10/10 10:00:09 [error] upstream timed out\n2024-10-10T10:00:12.5+02:00 done\nno timestamp on this line',
  run: async ([i], o, files) => {
    const dz = tzMinutes(o.from), oz = tzMinutes(o.to), year = +o.year || undefined; const fm = new Map(); let miss = 0;
    const out = lines(await readText(i, files)).map((l) => {
      if (!l.trim()) return l;
      const t = findTs(l, { defTz: dz, year }); if (!t) { miss++; return l; }
      fm.set(t.fmt, (fm.get(t.fmt) || 0) + 1);
      const hasMs = o.ms || t.fmt === 'epoch milliseconds' || /[.,]\d/.test(l.slice(t.start, t.end));
      return l.slice(0, t.start) + fmtOffset(t.ms, oz, hasMs) + l.slice(t.end);
    });
    if (!fm.size) throw new Error('No timestamps found.');
    return out.join('\n') + `\n\n--- ${[...fm.entries()].map(([k, v]) => `${v} x ${k}`).join(', ')}; ${miss} line(s) without a timestamp left as they were. Only the first timestamp in each line is changed. Dates like 03/04/2024 are not guessed because day/month order is ambiguous.`;
  },
});

// ---------- 829 Multi-log merger ----------
T.push({
  id: 'multi-log-merger', cat: LOGCAT, title: 'Multi-Log Merger: Interleave Several Logs by Timestamp',
  desc: 'Merge two pasted logs plus any number of files into one chronological view. Each line gets its source name. Lines without a timestamp (stack traces) stay with the line before them.',
  inputs: 2, labels: ['Log A', 'Log B'], file: FILE,
  opts: [txt('tz', 'Zone of times that have none (UTC, +02:00)', 'UTC'), chk('tag', 'Prefix each line with its source', true), num('year', 'Year for syslog times (0 = current)', 0)],
  sample: '2024-10-10 10:00:01 web: request received\n2024-10-10 10:00:05 web: calling db\n2024-10-10 10:00:09 web: done',
  sample2: '2024-10-10 10:00:02 db: connection opened\n2024-10-10 10:00:06 db: slow query 3200ms\n  at Query.run(db.js:44)\n2024-10-10 10:00:08 db: closed',
  run: async ([a, b], o, files) => {
    const srcs = [['A', a], ['B', b]].filter(([, t]) => String(t || '').trim()).map(([n, t]) => ({ name: n, text: String(t) }));
    for (const f of files || []) srcs.push(...(await readAll('', [f])).map((p) => ({ name: p.name, text: p.text })));
    if (srcs.length < 2) throw new Error('Give at least two logs (paste into both boxes, or choose files).');
    const dz = tzMinutes(o.tz), year = +o.year || undefined, all = []; let seq = 0, noTs = 0;
    for (const s of srcs) {
      let cur = null;
      for (const l of nonEmpty(s.text)) { const t = findTs(l, { defTz: dz, year }); if (t) cur = t.ms; else if (cur === null) { noTs++; cur = -Infinity; } all.push({ ms: cur, seq: seq++, line: (o.tag ? `[${s.name}] ` : '') + l }); }
    }
    all.sort((x, y) => x.ms - y.ms || x.seq - y.seq);
    return all.map((x) => x.line).join('\n') + `\n\n--- ${srcs.length} sources, ${all.length} lines merged by the first timestamp found in each line${noTs ? `; ${noTs} line(s) at the start of a source had no timestamp and sort first` : ''}.`;
  },
});

// ---------- 830 Log grep with context ----------
T.push({
  id: 'log-grep-context', cat: LOGCAT, title: 'Log Grep with Context: Regex Search with Before and After Lines',
  desc: 'Search a log with a regular expression and show lines of context around each match, like grep -n -B -A. Optional match highlighting, inverted match and a match limit. Files up to a few hundred MB work; larger files are better streamed.',
  inputs: 1, labels: ['Log text'], file: FILE,
  opts: [txt('pattern', 'Regular expression', 'ERROR|FATAL'), num('before', 'Lines before', 2), num('after', 'Lines after', 2), chk('ci', 'Ignore case', false), chk('invert', 'Invert match (lines that do not match)', false), chk('hl', 'Mark matches with «»', false), num('max', 'Max matches (0 = all)', 100)],
  sample: '10:00:00 INFO start\n10:00:01 INFO load config\n10:00:02 ERROR cannot open /etc/app.conf\n10:00:03 INFO retry\n10:00:04 INFO retry\n10:00:05 INFO retry\n10:00:06 INFO retry\n10:00:07 FATAL giving up\n10:00:08 INFO exit',
  run: async ([i], o, files) => {
    if (!o.pattern) throw new Error('Enter a regular expression.');
    let re; try { re = new RegExp(o.pattern, o.ci ? 'i' : ''); } catch (e) { throw new Error('Not a valid regular expression: ' + e.message); }
    const L = lines(await readText(i, files)); if (L.length && L[L.length - 1] === '') L.pop();
    const B = Math.max(0, +o.before | 0), A = Math.max(0, +o.after | 0), mx = +o.max > 0 ? +o.max : Infinity;
    const hits = []; for (let k = 0; k < L.length && hits.length < mx; k++) if (re.test(L[k]) !== !!o.invert) hits.push(k);
    if (!hits.length) return `No matches in ${L.length} lines.`;
    const out = []; let lastEnd = -1; const w = String(L.length).length, isHit = new Set(hits);
    const g = new RegExp(o.pattern, o.ci ? 'gi' : 'g');
    for (const h of hits) {
      const s = Math.max(h - B, lastEnd + 1), e = Math.min(L.length - 1, h + A);
      if (lastEnd >= 0 && s > lastEnd + 1) out.push('--');
      for (let k = s; k <= e; k++) {
        const hit = isHit.has(k);
        out.push(`${String(k + 1).padStart(w)}${hit ? ':' : '-'} ${hit && o.hl && !o.invert ? L[k].replace(g, (m) => '«' + m + '»') : L[k]}`);
      }
      lastEnd = Math.max(lastEnd, e);
    }
    return out.join('\n') + `\n\n${hits.length}${hits.length === mx ? '+' : ''} match(es) in ${L.length} lines. ":" marks a match, "-" marks context. If matches are near each other their context is merged.`;
  },
});

// =====================================================================================================
// Log parsing and analysis, part 3: access-log analytics, security views, platform logs
// =====================================================================================================

// ---------- 833 Log to CSV ----------
T.push({
  id: 'log-to-csv', cat: LOGCAT, title: 'Log to CSV Converter (Access Logs, logfmt, JSON Lines, Custom Regex)',
  desc: 'Convert log lines to CSV for a spreadsheet. Pick Common/Combined, an nginx or Apache format string, logfmt, JSON lines or your own regex with named groups, then choose the columns.',
  inputs: 1, labels: ['Log lines'], file: FILE,
  opts: [sel('kind', 'Log format', ['Common / Combined', 'nginx log_format or Apache LogFormat', 'logfmt', 'JSON lines', 'Custom regex (named groups)']), txt('format', 'Format string or regex (for the two options above that need one)', ''), txt('cols', 'Columns to keep (comma separated, empty = all)', ''), chk('header', 'Include header row', true)],
  sample: '203.0.113.7 - - [10/Oct/2024:13:55:36 +0000] "GET /index.html HTTP/1.1" 200 2326 "-" "curl/8.5.0"\n198.51.100.4 - bob [10/Oct/2024:13:55:40 +0000] "POST /login HTTP/1.1" 401 128 "https://example.com/" "Mozilla/5.0, (test)"',
  run: async ([i], o, files) => {
    const ls = nonEmpty(await readText(i, files)); let rows = [], cols = [], bad = 0;
    if (o.kind === 'Common / Combined') { cols = ['ip', 'ident', 'user', 'time', 'request', 'method', 'path', 'proto', 'status', 'bytes', 'referer', 'ua', 'extra']; for (const l of ls) { const r = parseAccess(l); if (r) rows.push({ ...r, ident: '' }); else bad++; } }
    else if (o.kind === 'logfmt') { for (const l of ls) { const r = parseLogfmt(l, false, false); if (Object.keys(r).length) rows.push(r); else bad++; } }
    else if (o.kind === 'JSON lines') { const p = parseJsonRecords(ls.join('\n')); rows = p.recs.map((r) => flat(r)); bad = p.bad; }
    else {
      if (!String(o.format || '').trim()) throw new Error('Enter the format string or the regex in the "Format string or regex" option.');
      let re;
      try { re = o.kind.startsWith('nginx') ? new RegExp(fmtToRegex(o.format, 'auto').js) : new RegExp(o.format); } catch (e) { throw new Error('Could not use that pattern: ' + e.message); }
      for (const l of ls) { const m = re.exec(l); if (m) rows.push(m.groups && Object.keys(m.groups).length ? { ...m.groups } : Object.fromEntries(m.slice(1).map((v, k) => ['group' + (k + 1), v]))); else bad++; }
    }
    if (!rows.length) throw new Error('No line matched the chosen format.');
    cols = [...new Set([...cols, ...rows.flatMap((r) => Object.keys(r))])];
    const keep = String(o.cols || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (keep.length) { for (const c of keep) if (!cols.includes(c)) throw new Error(`No column "${c}". Columns: ${cols.join(', ')}.`); cols = keep; }
    if (o.kind === 'Common / Combined' && !keep.length) cols = cols.filter((c) => !['ident', 'ms', 'route', 'lastNum'].includes(c));
    return { text: [...(o.header ? [csvLine(cols)] : []), ...rows.map((r) => csvLine(cols.map((c) => r[c])))].join('\n'), filename: 'log.csv' };
  },
});

// ---------- 835 Request rate spike detector ----------
function bucketCounts(pts, size) {
  const lo = Math.floor(Math.min(...pts.map((p) => p.ms)) / size) * size, hi = Math.max(...pts.map((p) => p.ms));
  const nb = Math.floor((hi - lo) / size) + 1; if (nb > 20000) throw new Error(`That would be ${nb} buckets. Use a larger bucket size.`);
  const total = new Array(nb).fill(0), errs = new Array(nb).fill(0);
  for (const p of pts) { const k = Math.floor((p.ms - lo) / size); total[k]++; if (p.err) errs[k]++; }
  return { lo, total, errs };
}
function spikes(series, k, minCount) {
  const s = [...series].sort((a, b) => a - b), med = pctl(s, 50), dev = s.map((x) => Math.abs(x - med)).sort((a, b) => a - b), mad = pctl(dev, 50);
  const thr = med + k * Math.max(1.4826 * mad, 1);
  return { med, mad, thr, hot: series.map((x, i) => (x > thr && x >= minCount ? i : -1)).filter((i) => i >= 0) };
}
function accessPoints(text, o) {
  const defTz = tzMinutes(o.tz), pts = []; let bad = 0;
  for (const l of nonEmpty(text)) {
    const a = parseAccess(l); let ms = a ? a.ms : NaN, err = a ? a.status >= 500 : false;
    if (!Number.isFinite(ms)) { const t = findTs(l, { defTz }); if (!t) { bad++; continue; } ms = t.ms; const lv = findLevel(l); err = lv === 'ERROR' || lv === 'FATAL' || /\s5\d\d\s/.test(l); }
    pts.push({ ms, err });
  }
  if (!pts.length) throw new Error('No timestamps found. Access logs (Common/Combined) and lines with ISO or syslog times are supported.');
  return { pts, bad };
}
T.push({
  id: 'request-spike-detector', cat: LOGCAT, title: 'Request Rate Spike Detector: Minutes with Unusual Traffic or Errors',
  desc: 'Build a per-minute (or larger) count of requests and errors from an access log and flag buckets far above the typical level. The baseline is the median plus a multiple of the robust spread (MAD).',
  inputs: 1, labels: ['Access log or timestamped log lines'], file: FILE,
  opts: [num('minutes', 'Bucket size (minutes)', 1), num('k', 'Sensitivity: spread multiples above the median', 3), num('min', 'Ignore buckets below this count', 5), txt('tz', 'Zone for times without one (UTC, +02:00)', 'UTC')],
  sample: Array.from({ length: 12 }, (_, m) => Array.from({ length: m === 7 ? 90 : 10 + (m % 3) }, (_, k) => `203.0.113.${k % 200} - - [10/Oct/2024:10:${pad2(m)}:${pad2(k % 60)} +0000] "GET /p${k} HTTP/1.1" ${m === 7 && k % 3 === 0 ? 503 : 200} 512 "-" "x"`).join('\n')).join('\n'),
  run: async ([i], o, files) => {
    const size = Math.max(1, +o.minutes || 1) * 60000, { pts, bad } = accessPoints(await readText(i, files), o);
    const { lo, total, errs } = bucketCounts(pts, size), sp = spikes(total, +o.k || 3, +o.min || 1), se = spikes(errs, +o.k || 3, Math.max(1, Math.round((+o.min || 1) / 5)));
    const rows = sp.hot.map((i2) => ({ bucket: iso(lo + i2 * size).slice(0, 16) + 'Z', requests: total[i2], times_baseline: fix2(total[i2] / Math.max(sp.med, 1)), errors: errs[i2], error_share: (100 * errs[i2] / total[i2]).toFixed(0) + '%' }));
    const erows = se.hot.map((i2) => ({ bucket: iso(lo + i2 * size).slice(0, 16) + 'Z', errors: errs[i2], requests: total[i2] }));
    const mx = Math.max(...total);
    const spark = total.length <= 60 ? '\n\n' + sec('Requests per bucket', total.map((c, k) => `${iso(lo + k * size).slice(11, 16)}  ${String(c).padStart(6)}  ${'#'.repeat(Math.round(40 * c / mx))}${sp.hot.includes(k) ? '  <-- spike' : ''}`).join('\n')) : '';
    return `${pts.length} line(s) in ${total.length} bucket(s) of ${size / 60000} min${badNote(bad, pts.length + bad)}\nRequests per bucket: median ${sp.med}, spread (MAD) ${fix2(sp.mad)}, flag above ${fix2(sp.thr)}\nErrors per bucket (5xx or ERROR lines): median ${se.med}, flag above ${fix2(se.thr)}\n\n` + sec(`Request spikes (${rows.length})`, rows.length ? asTable(rows, ['bucket', 'requests', 'times_baseline', 'errors', 'error_share']) : 'none') + '\n' + sec(`Error spikes (${erows.length})`, erows.length ? asTable(erows, ['bucket', 'errors', 'requests']) : 'none') + spark + '\n\nA flagged bucket is a statistical outlier, not proof of an attack or an outage. Quiet logs with a median near zero flag any bucket above the minimum count. Times are UTC.';
  },
});

// ---------- 836 Response time percentiles ----------
T.push({
  id: 'response-time-percentiles', cat: LOGCAT, title: 'Response Time Percentile Calculator per Endpoint (p50, p90, p95, p99)',
  desc: 'Compute p50, p90, p95 and p99 latency per endpoint from an access log that records request time (nginx $request_time, Apache %D or %T). Pick the unit and group numeric IDs into one route.',
  inputs: 1, labels: ['Access log lines that end with a duration'], file: FILE,
  opts: [sel('src', 'Duration is', ['last number on the line', 'named group "rt" in my regex']), txt('regex', 'Regex with a named group rt (and optional path)', ''), sel('unit', 'Duration unit in the log', ['seconds', 'milliseconds', 'microseconds']), chk('ids', 'Merge numeric and UUID path parts into :id', true), num('min', 'Hide endpoints with fewer requests than', 1), sel('sort', 'Sort by', ['requests', 'p95', 'p99', 'mean'])],
  sample: '203.0.113.7 - - [10/Oct/2024:13:55:36 +0000] "GET /api/items/1 HTTP/1.1" 200 512 "-" "x" 0.012\n203.0.113.7 - - [10/Oct/2024:13:55:37 +0000] "GET /api/items/2 HTTP/1.1" 200 512 "-" "x" 0.020\n203.0.113.7 - - [10/Oct/2024:13:55:38 +0000] "GET /api/items/3 HTTP/1.1" 200 512 "-" "x" 0.450\n203.0.113.7 - - [10/Oct/2024:13:55:39 +0000] "POST /login HTTP/1.1" 200 64 "-" "x" 0.150\n203.0.113.7 - - [10/Oct/2024:13:55:40 +0000] "POST /login HTTP/1.1" 401 64 "-" "x" 0.090',
  run: async ([i], o, files) => {
    const div = { seconds: 0.001, milliseconds: 1, microseconds: 1000 }[o.unit], ls = nonEmpty(await readText(i, files)); const by = new Map(); let bad = 0, n = 0;
    let re = null; if (o.src.startsWith('named')) { try { re = new RegExp(o.regex); } catch { throw new Error('The regex is not valid.'); } if (!/\(\?<rt>/.test(o.regex)) throw new Error('The regex needs a named group called rt, for example (?<rt>[\\d.]+).'); }
    for (const l of ls) {
      let path, rt;
      if (re) { const m = re.exec(l); if (!m) { bad++; continue; } rt = parseFloat(m.groups.rt); path = m.groups.path || (parseAccess(l) || {}).route || 'all'; }
      else { const a = parseAccess(l); if (!a || !Number.isFinite(a.lastNum)) { bad++; continue; } rt = a.lastNum; path = a.route; }
      if (!Number.isFinite(rt)) { bad++; continue; }
      if (o.ids) path = path.replace(/\/(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=\/|$)/gi, '/:id');
      const a = by.get(path) || []; a.push(rt / div); by.set(path, a); n++;
    }
    if (!n) throw new Error('No line had a usable duration. Access lines must end with a number (for nginx add $request_time to log_format) or use the regex option.');
    const rows = [...by.entries()].map(([endpoint, v]) => ({ endpoint, ...stats(v) })).filter((r) => r.n >= (+o.min || 1));
    const key = { requests: 'n', p95: 'p95', p99: 'p99', mean: 'mean' }[o.sort]; rows.sort((a, b) => b[key] - a[key]);
    const all = stats([...by.values()].flat());
    return `${n} request(s), ${rows.length} endpoint(s)${badNote(bad, ls.length)}\nAll: p50 ${fix2(all.p50)} ms, p90 ${fix2(all.p90)} ms, p95 ${fix2(all.p95)} ms, p99 ${fix2(all.p99)} ms, max ${fix2(all.max)} ms\n\n` + asTable(rows.map((r) => ({ endpoint: r.endpoint, requests: r.n, 'p50 ms': fix2(r.p50), 'p90 ms': fix2(r.p90), 'p95 ms': fix2(r.p95), 'p99 ms': fix2(r.p99), 'max ms': fix2(r.max), 'mean ms': fix2(r.mean) })), ['endpoint', 'requests', 'p50 ms', 'p90 ms', 'p95 ms', 'p99 ms', 'max ms', 'mean ms'], 50) + '\n\nPercentiles use the nearest-rank method (the smallest value with at least p% of values at or below it). With few requests per endpoint the high percentiles are just the largest values.';
  },
});

// ---------- 837 Top IPs and user agents ----------
T.push({
  id: 'top-ips-user-agents', cat: LOGCAT, title: 'Top IPs and User Agents Report from an Access Log',
  desc: 'Rank the busiest client IPs and user agents in a Common or Combined log with request count, share of traffic, bytes, error counts and first and last request.',
  inputs: 1, labels: ['Access log lines'], file: FILE,
  opts: [num('top', 'Entries per ranking', 10)],
  sample: '203.0.113.7 - - [10/Oct/2024:13:55:36 +0000] "GET /a HTTP/1.1" 200 512 "-" "Mozilla/5.0 (Windows NT 10.0)"\n203.0.113.7 - - [10/Oct/2024:13:55:37 +0000] "GET /b HTTP/1.1" 404 128 "-" "Mozilla/5.0 (Windows NT 10.0)"\n198.51.100.4 - - [10/Oct/2024:13:56:01 +0000] "GET /a HTTP/1.1" 200 512 "-" "curl/8.5.0"\n198.51.100.4 - - [10/Oct/2024:13:56:02 +0000] "GET /c HTTP/1.1" 500 12 "-" "curl/8.5.0"\n192.0.2.9 - - [10/Oct/2024:13:57:00 +0000] "GET /robots.txt HTTP/1.1" 200 90 "-" "Googlebot/2.1"',
  run: async ([i], o, files) => {
    const { recs, bad, total } = accessRecords(await readText(i, files)), n = +o.top || 10;
    const rank = (keyf, label, extra) => {
      const m = new Map(); for (const r of recs) { const k = keyf(r); const x = m.get(k) || { n: 0, bytes: 0, e4: 0, e5: 0, first: Infinity, last: -Infinity, paths: new Set(), ips: new Set() }; x.n++; x.bytes += r.bytes; if (r.status >= 500) x.e5++; else if (r.status >= 400) x.e4++; if (Number.isFinite(r.ms)) { x.first = Math.min(x.first, r.ms); x.last = Math.max(x.last, r.ms); } x.paths.add(r.route); x.ips.add(r.ip); m.set(k, x); }
      const rows = [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, n).map(([k, x]) => ({ [label]: k || '(empty)', requests: x.n, share: (100 * x.n / recs.length).toFixed(1) + '%', bytes: fmtBytes(x.bytes), '4xx': x.e4, '5xx': x.e5, [extra]: extra === 'ips' ? x.ips.size : x.paths.size, first: Number.isFinite(x.first) ? iso(x.first).slice(11, 19) : '', last: Number.isFinite(x.last) ? iso(x.last).slice(11, 19) : '' }));
      return asTable(rows, [label, 'requests', 'share', 'bytes', '4xx', '5xx', extra, 'first', 'last'], 70);
    };
    return `${recs.length} request(s)${badNote(bad, total)}\n\n` + sec('Top client IPs', rank((r) => r.ip, 'ip', 'paths')) + '\n' + sec('Top user agents', rank((r) => r.ua, 'user_agent', 'ips')) + '\nTimes are the time of day (UTC) of the first and last request. A user agent is a claim by the client and can be faked; many requests from one IP behind a proxy or CDN may be many people.';
  },
});

// ---------- 839 Brute force and scan detector ----------
const PROBES = [[/wp-login\.php|xmlrpc\.php|wp-admin/i, 'WordPress login or XML-RPC'], [/\/\.env\b|\/\.git\/|\/\.svn\/|\/\.aws\/|\/\.ssh\//i, 'dot-file or secrets path'], [/phpmyadmin|\/pma\/|adminer/i, 'database admin tool'], [/\/cgi-bin\/|\/shell\b|\bcmd=|eval-stdin\.php|\/vendor\/phpunit/i, 'shell or PHP test-framework probe'], [/\.\.[\/\\]|%2e%2e|etc\/passwd|boot\.ini/i, 'path traversal pattern'], [/\$\{jndi:|\$%7Bjndi/i, 'JNDI lookup string (Log4Shell style)'], [/union(\s|%20|\+)+select|<script|%3Cscript/i, 'SQL injection or script pattern'], [/\/actuator\b|\/manager\/html|\/solr\/|\/boaform\/|\/HNAP1|\/owa\/auth/i, 'framework or device admin path']];
const LOGINISH = /login|signin|sign-in|auth|admin|wp-login|xmlrpc|session|token|password/i;
T.push({
  id: 'brute-force-scan-detector', cat: LOGCAT, title: 'Brute-Force and Scan Detector for Access Logs (401, 404 Bursts, Probe Paths)',
  desc: 'List IPs with many failed logins (401/403 on login-like paths), bursts of 404s within a time window, and requests for well-known vulnerability probe paths. Findings are patterns to review.',
  inputs: 1, labels: ['Access log lines (Common or Combined)'], file: FILE,
  opts: [num('window', 'Burst window (seconds)', 60), num('fails', 'Failed logins in window to report', 5), num('nf', '404 responses in window to report', 20)],
  sample: Array.from({ length: 8 }, (_, k) => `198.51.100.4 - - [10/Oct/2024:10:00:${pad2(k * 3)} +0000] "POST /wp-login.php HTTP/1.1" 401 512 "-" "python-requests/2.31"`).join('\n') + '\n' + Array.from({ length: 25 }, (_, k) => `192.0.2.50 - - [10/Oct/2024:10:01:${pad2(k)} +0000] "GET /page${k}.php HTTP/1.1" 404 120 "-" "Mozilla/5.0"`).join('\n') + '\n203.0.113.7 - - [10/Oct/2024:10:02:00 +0000] "GET /.env HTTP/1.1" 404 120 "-" "curl/8.5.0"\n203.0.113.8 - - [10/Oct/2024:10:02:05 +0000] "GET / HTTP/1.1" 200 5120 "-" "Mozilla/5.0"',
  run: async ([i], o, files) => {
    const { recs, bad, total } = accessRecords(await readText(i, files)), W = (+o.window || 60) * 1000;
    const by = new Map(); for (const r of recs) { const a = by.get(r.ip) || []; a.push(r); by.set(r.ip, a); }
    const maxWin = (times) => { const t = [...times].sort((a, b) => a - b); let best = 0, j = 0; for (let k = 0; k < t.length; k++) { while (t[k] - t[j] > W) j++; best = Math.max(best, k - j + 1); } return best; };
    const out = [];
    for (const [ip, rs] of by) {
      const reasons = [];
      const fails = rs.filter((r) => (r.status === 401 || r.status === 403 || (r.status === 200 && false)) && (LOGINISH.test(r.route) || r.status === 401));
      const f = maxWin(fails.map((r) => r.ms).filter(Number.isFinite)); if (f >= (+o.fails || 5)) reasons.push(`${f} failed logins (401/403) within ${o.window}s on ${[...new Set(fails.map((r) => r.route))].slice(0, 3).join(', ')}`);
      const nf = maxWin(rs.filter((r) => r.status === 404).map((r) => r.ms).filter(Number.isFinite)); if (nf >= (+o.nf || 20)) reasons.push(`${nf} not-found (404) responses within ${o.window}s`);
      const hits = new Map(); for (const r of rs) for (const [re, label] of PROBES) if (re.test(decodeUri(r.path))) { const x = hits.get(label) || []; x.push(r.route); hits.set(label, x); }
      for (const [label, p] of hits) reasons.push(`${label}: ${p.length} request(s), e.g. ${[...new Set(p)].slice(0, 2).join(', ')}`);
      if (reasons.length) out.push({ ip, n: rs.length, reasons });
    }
    out.sort((a, b) => b.reasons.length - a.reasons.length || b.n - a.n);
    return `${recs.length} request(s) from ${by.size} IP(s)${badNote(bad, total)}\n\n` + (out.length ? sec(`IPs to review (${out.length})`, out.slice(0, 30).map((x) => `${x.ip}  (${x.n} requests)\n${x.reasons.map((r) => '    - ' + r).join('\n')}`).join('\n')) : 'No IP matched the rules.\n') + '\nThese are simple rules: a burst of 401/403s on a login-like path, a burst of 404s, and a short list of well-known probe path patterns. A match means "worth a look", not "attack": monitoring tools, broken links and shared NAT addresses trigger them too. A request for a probe path that returned 404 usually means the server had nothing there.';
  },
});

// ---------- 840 auth.log / fail2ban ----------
T.push({
  id: 'auth-log-analyzer', cat: LOGCAT, title: 'auth.log and fail2ban Analyzer: Failed SSH Logins, Bans, sudo',
  desc: 'Summarise /var/log/auth.log (or secure) and fail2ban.log: failed and invalid-user SSH logins by IP and user, accepted logins, fail2ban bans and unbans, and sudo commands.',
  inputs: 1, labels: ['auth.log and/or fail2ban.log'], file: FILE,
  opts: [num('top', 'Entries per ranking', 10)],
  sample: 'Oct 10 10:00:01 web1 sshd[811]: Failed password for invalid user admin from 198.51.100.4 port 40022 ssh2\nOct 10 10:00:03 web1 sshd[811]: Failed password for invalid user admin from 198.51.100.4 port 40024 ssh2\nOct 10 10:00:09 web1 sshd[812]: Failed password for root from 198.51.100.4 port 40030 ssh2\nOct 10 10:01:00 web1 sshd[820]: Invalid user test from 192.0.2.77 port 51122\nOct 10 10:02:00 web1 sshd[830]: Accepted publickey for deploy from 203.0.113.7 port 50500 ssh2: ED25519 SHA256:abc\nOct 10 10:03:00 web1 sudo:   deploy : TTY=pts/0 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/apt update\n2024-10-10 10:01:30,123 fail2ban.actions        [900]: NOTICE  [sshd] Ban 198.51.100.4\n2024-10-10 10:11:30,123 fail2ban.actions        [900]: NOTICE  [sshd] Unban 198.51.100.4',
  run: async ([i], o, files) => {
    const ls = nonEmpty(await readText(i, files)), n = +o.top || 10;
    const failedIp = [], failedUser = [], invalid = [], ok = [], bans = [], unbans = [], sudo = [], closed = []; let sshd = 0, f2b = 0;
    for (const l of ls) {
      let m;
      if (/sshd\[\d+\]/.test(l)) sshd++;
      if ((m = /Failed (\S+) for (?:invalid user )?(\S+) from (\S+) port \d+/.exec(l))) { failedIp.push(m[3]); failedUser.push(m[2]); if (/invalid user/.test(l)) invalid.push(m[2]); }
      else if ((m = /Invalid user (\S*) from (\S+)/.exec(l))) { invalid.push(m[1] || '(empty)'); }
      else if ((m = /Accepted (\S+) for (\S+) from (\S+) port/.exec(l))) ok.push({ user: m[2], ip: m[3], how: m[1] });
      else if ((m = /maximum authentication attempts exceeded for (?:invalid user )?(\S+) from (\S+)/.exec(l))) closed.push(m[2]);
      else if ((m = /\[(\S+)\]\s+(Ban|Unban)\s+(\S+)/.exec(l))) { f2b++; (m[2] === 'Ban' ? bans : unbans).push(`${m[3]} (${m[1]})`); }
      else if ((m = /sudo:\s+(\S+) : .*?COMMAND=(.*)$/.exec(l))) sudo.push(`${m[1]}: ${m[2]}`);
    }
    if (!sshd && !f2b && !sudo.length && !failedIp.length) throw new Error('No sshd, fail2ban or sudo lines found.');
    const cm = (a, label) => bars(count(a, (x) => x), n);
    return `${ls.length} line(s): ${sshd} sshd, ${f2b} fail2ban ban/unban, ${sudo.length} sudo command(s)\n\n` + sec(`Failed SSH logins by IP (${failedIp.length} total)`, cm(failedIp)) + '\n' + sec('Failed logins by user name tried', cm(failedUser)) + '\n' + sec(`Invalid user names tried (${invalid.length})`, cm(invalid)) + '\n' + sec('Accepted logins', bars(count(ok, (x) => `${x.user} from ${x.ip} (${x.how})`), n)) + '\n' + sec('Too many attempts', cm(closed)) + '\n' + sec(`fail2ban bans (${bans.length}) and unbans (${unbans.length})`, bars(count(bans, (x) => x), n)) + '\n' + sec('sudo commands', bars(count(sudo, (x) => x), n)) + '\nPatterns follow OpenSSH, sudo and fail2ban message wording as commonly logged; wording differs a little between versions and distributions, so unmatched lines are ignored.';
  },
});

// ---------- 841 Firewall logs ----------
const PF_COLS = ['rulenum', 'subrule', 'anchor', 'tracker', 'iface', 'reason', 'action', 'dir', 'ipver'];
function parseFirewall(l) {
  let m;
  if ((m = /filterlog(?:\[\d+\])?:\s*(.*)$/.exec(l))) { // pfSense, fields as in pfSense syslog.inc
    const f = m[1].split(','); const r = { type: 'pfSense', time: (/^(\w{3} +\d+ [\d:]+|\S+T[\d:.]+\S*)/.exec(l) || [])[1] || '', iface: f[4], action: f[6], dir: f[7], rule: f[3] };
    if (f[8] === '4') { r.proto = (f[16] || '').toUpperCase(); r.src = f[18]; r.dst = f[19]; if (['6', '17', '132'].includes(f[15])) { r.sport = f[20]; r.dport = f[21]; if (f[15] === '6') r.flags = f[23]; } }
    else if (f[8] === '6') { r.proto = (f[12] || '').toUpperCase(); r.src = f[15]; r.dst = f[16]; if (['6', '17', '132'].includes(f[13])) { r.sport = f[17]; r.dport = f[18]; if (f[13] === '6') r.flags = f[20]; } }
    return r.src ? r : null;
  }
  if (/\bSRC=\S+\s+DST=\S+/.test(l)) {
    const kv = Object.fromEntries([...l.matchAll(/\b([A-Z]+)=(\S*)/g)].map((x) => [x[1], x[2]]));
    const um = /\[UFW (\w+)\]/.exec(l), pre = /kernel:\s*(?:\[\s*[\d.]+\]\s*)?(.*?)\s*IN=/.exec(l);
    const flags = ['SYN', 'ACK', 'FIN', 'RST', 'PSH', 'URG'].filter((f) => new RegExp(`\\b${f}\\b`).test(l)).join(',');
    return { type: um ? 'UFW' : 'iptables', time: (/^(\w{3} +\d+ [\d:]+|\S+T[\d:.]+\S*)/.exec(l) || [])[1] || '', iface: kv.IN || kv.OUT || '', action: um ? um[1] : pre && pre[1] ? pre[1].replace(/[:\s]+$/, '') : 'logged', dir: kv.IN ? 'in' : 'out', proto: kv.PROTO || '', src: kv.SRC, dst: kv.DST, sport: kv.SPT || '', dport: kv.DPT || '', flags };
  }
  return null;
}
T.push({
  id: 'firewall-log-parser', cat: LOGCAT, title: 'Firewall Log Parser: iptables, UFW and pfSense filterlog',
  desc: 'Parse iptables and UFW kernel log lines and pfSense filterlog lines into action, interface, protocol, source, destination and ports, then rank sources, destination ports and actions.',
  inputs: 1, labels: ['Firewall log lines'], file: FILE,
  opts: [txt('action', 'Action contains (block, pass, ALLOW)', ''), ...VOPTS],
  sample: 'Oct 10 10:00:00 gw kernel: [123.4] [UFW BLOCK] IN=eth0 OUT= MAC=aa:bb SRC=198.51.100.4 DST=10.0.0.2 LEN=60 TOS=0x00 TTL=50 ID=1 DF PROTO=TCP SPT=40022 DPT=22 WINDOW=64240 RES=0x00 SYN URGP=0\nOct 10 10:00:02 gw kernel: [125.4] [UFW BLOCK] IN=eth0 OUT= MAC=aa:bb SRC=198.51.100.4 DST=10.0.0.2 LEN=60 PROTO=TCP SPT=40023 DPT=3389 SYN\nOct 10 10:00:03 fw filterlog[4431]: 5,,,1000000103,igb0,match,block,in,4,0x0,,64,12345,0,none,6,tcp,60,192.0.2.9,10.0.0.2,51000,443,0,S,1234,,64240,,mss;sackOK',
  run: async ([i], o, files) => {
    const ls = nonEmpty(await readText(i, files)); const recs = []; let bad = 0;
    for (const l of ls) { const r = parseFirewall(l); if (r) recs.push(r); else bad++; }
    if (!recs.length) throw new Error('No firewall lines recognised (iptables/UFW lines contain SRC= and DST=; pfSense lines contain filterlog).');
    const af = String(o.action || '').toLowerCase(), rows = recs.filter((r) => !af || String(r.action).toLowerCase().includes(af));
    const sum = `${rows.length} firewall line(s)${badNote(bad, ls.length)}\n\n` + sec('Action', bars(count(rows, (r) => String(r.action).toLowerCase()))) + '\n' + sec('Protocol', bars(count(rows, (r) => r.proto || null), 6)) + '\n' + sec('Top sources', bars(count(rows, (r) => r.src), 10)) + '\n' + sec('Top destination ports', bars(count(rows, (r) => (r.dport ? `${r.proto}/${r.dport}` : null)), 10)) + '\n' + sec('Interface', bars(count(rows, (r) => r.iface || null), 5)) + '\npfSense fields are read by position as in the pfSense source (syslog.inc, filterlog); iptables and UFW lines by their KEY=value pairs. IPv6 and ICMP details are only partly shown.';
    return view(rows, ['time', 'type', 'action', 'dir', 'iface', 'proto', 'src', 'sport', 'dst', 'dport', 'flags'], o, sum);
  },
});

// ---------- 842 Windows event XML ----------
const WIN_ID = { 1102: 'The audit log was cleared', 4624: 'An account was successfully logged on', 4625: 'An account failed to log on', 4634: 'An account was logged off', 4647: 'User initiated logoff', 4648: 'A logon was attempted using explicit credentials', 4672: 'Special privileges assigned to new logon', 4688: 'A new process has been created', 4697: 'A service was installed in the system', 4720: 'A user account was created', 4722: 'A user account was enabled', 4723: 'An attempt was made to change an account\'s password', 4724: 'An attempt was made to reset an account\'s password', 4725: 'A user account was disabled', 4726: 'A user account was deleted', 4732: 'A member was added to a security-enabled local group', 4740: 'A user account was locked out', 4768: 'A Kerberos authentication ticket (TGT) was requested', 4769: 'A Kerberos service ticket was requested', 4776: 'The computer attempted to validate the credentials for an account' };
const WIN_LVL = { 1: 'Critical', 2: 'Error', 3: 'Warning', 4: 'Information', 5: 'Verbose', 0: 'LogAlways' };
const xmlUn = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
T.push({
  id: 'windows-event-xml-viewer', cat: LOGCAT, title: 'Windows Event Log XML Viewer (Filter by Event ID)',
  desc: 'Read Windows events exported as XML (Event Viewer "Save All Events As", wevtutil qe /f:xml) and filter by event ID. Common Security event IDs get their Microsoft title; failed logons are summarised by account and IP.',
  inputs: 1, labels: ['Event XML'], file: { accept: '.xml,.txt', multiple: true, optional: true },
  opts: [txt('ids', 'Event IDs to show (comma separated, empty = all)', ''), txt('text', 'Any field contains', ''), ...VOPTS],
  sample: '<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><Provider Name="Microsoft-Windows-Security-Auditing"/><EventID>4625</EventID><Level>0</Level><TimeCreated SystemTime="2024-10-10T10:00:00.123456700Z"/><Channel>Security</Channel><Computer>SRV01</Computer></System><EventData><Data Name="TargetUserName">administrator</Data><Data Name="LogonType">3</Data><Data Name="IpAddress">198.51.100.4</Data></EventData></Event>\n<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><Provider Name="Microsoft-Windows-Security-Auditing"/><EventID>4624</EventID><Level>0</Level><TimeCreated SystemTime="2024-10-10T10:01:00.000000000Z"/><Channel>Security</Channel><Computer>SRV01</Computer></System><EventData><Data Name="TargetUserName">deploy</Data><Data Name="LogonType">10</Data><Data Name="IpAddress">203.0.113.7</Data></EventData></Event>',
  run: async ([i], o, files) => {
    const text = await readText(i, files), blocks = text.match(/<Event\b[\s\S]*?<\/Event>/g);
    if (!blocks) throw new Error('No <Event> elements found. This tool reads XML exports, not binary .evtx files. In Event Viewer use Save All Events As and choose XML, or run wevtutil qe Security /f:xml.');
    const ids = String(o.ids || '').split(/[,\s]+/).filter(Boolean), tf = String(o.text || '').toLowerCase();
    const rows = blocks.map((b) => {
      const g = (re) => (re.exec(b) || [])[1];
      const data = {}; for (const m of b.matchAll(/<Data(?:\s+Name=["']([^"']*)["'])?\s*(?:\/>|>([^<]*)<\/Data>)/g)) data[m[1] || 'Data' + Object.keys(data).length] = xmlUn(m[2] || '');
      const id = g(/<EventID(?:\s[^>]*)?>(\d+)<\/EventID>/);
      return { time: g(/<TimeCreated\s+SystemTime=["']([^"']+)/) || '', id, title: WIN_ID[id] || '', level: WIN_LVL[g(/<Level>(\d+)<\/Level>/)] ?? '', channel: g(/<Channel>([^<]*)</) || '', computer: g(/<Computer>([^<]*)</) || '', provider: g(/<Provider\s+Name=["']([^"']+)/) || '', data, detail: Object.entries(data).slice(0, 8).map(([k, v]) => `${k}=${v}`).join('; ') };
    }).filter((r) => (!ids.length || ids.includes(r.id)) && (!tf || JSON.stringify(r).toLowerCase().includes(tf)));
    const fails = rows.filter((r) => r.id === '4625'), LT = { 2: 'Interactive', 3: 'Network', 4: 'Batch', 5: 'Service', 7: 'Unlock', 8: 'NetworkCleartext', 9: 'NewCredentials', 10: 'RemoteInteractive', 11: 'CachedInteractive' };
    const sum = `${rows.length} event(s) of ${blocks.length}\n\n` + sec('Event IDs', [...count(rows, (r) => r.id).entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, c]) => `${c}  ${k}  ${WIN_ID[k] || '(no title in this tool)'}`).join('\n')) + '\n' + sec('Level', bars(count(rows, (r) => r.level || null))) + '\n' + sec('Computer', bars(count(rows, (r) => r.computer || null), 5)) + (fails.length ? '\n' + sec(`Failed logons (4625): ${fails.length}`, 'By account\n' + bars(count(fails, (r) => r.data.TargetUserName || null), 6) + '\n\nBy source IP\n' + bars(count(fails, (r) => r.data.IpAddress || null), 6) + '\n\nBy logon type\n' + bars(count(fails, (r) => (r.data.LogonType ? `${r.data.LogonType} ${LT[r.data.LogonType] || ''}`.trim() : null)), 6)) : '') + '\n\nTitles for the listed Security event IDs come from the Microsoft Learn "Windows 10 security auditing" event pages. Other IDs are shown without a title. Logon type names are from the 4624 page.';
    return view(rows, ['time', 'id', 'level', 'computer', 'channel', 'title', 'detail'], o, sum);
  },
});

// ---------- 843 Console log cleaner ----------
const CON_NOISE = [/Download the React DevTools/i, /DevTools failed to load source map/i, /^\[vite\]/, /^\[HMR\]/, /^\[webpack-dev-server\]/, /^\[Violation\]/, /Third-party cookie will be blocked/i];
T.push({
  id: 'console-log-cleaner', cat: LOGCAT, title: 'Browser Console Log Cleaner: Strip Links and Group Repeats',
  desc: 'Clean pasted DevTools console output: remove file:line prefixes and VM numbers, drop known dev-server noise, and collapse repeated messages with a count.',
  inputs: 1, labels: ['Pasted console output'],
  opts: [chk('prefix', 'Remove leading file:line prefixes (app.js:12, VM123:4)', true), chk('trail', 'Remove trailing "@ file:line"', true), chk('noise', 'Drop known noise lines', true), sel('group', 'Repeated messages', ['collapse every repeat', 'collapse neighbours only', 'keep all']), chk('blank', 'Drop blank lines', true)],
  sample: 'index.js:45 Fetching /api/items\nindex.js:45 Fetching /api/items\nVM203:1 Uncaught TypeError: Cannot read properties of undefined (reading \'id\')\n    at render (app.js:88:12)\nDownload the React DevTools for a better development experience\n[vite] connecting...\nindex.js:45 Fetching /api/items\nwarn @ utils.js:10\nindex.js:51 Saved 3 items',
  run: ([i], o) => {
    const SRC = /^\s*(?:VM\d+|[\w./@\-\\]+\.(?:m?js|cjs|jsx?|tsx?|vue|svelte|html?)(?:\?[\w=.\-]*)?):\d+(?::\d+)?\s+/;
    let dropped = 0, ls = lines(need(i, 'console output')).map((l) => (o.prefix ? l.replace(SRC, '') : l)).map((l) => (o.trail ? l.replace(/\s+@\s+\S+:\d+(?::\d+)?\s*$/, '') : l));
    ls = ls.filter((l) => { if (o.blank && !l.trim()) return false; if (o.noise && CON_NOISE.some((r) => r.test(l.trim()))) { dropped++; return false; } return true; });
    let out;
    if (o.group === 'keep all') out = ls;
    else if (o.group === 'collapse neighbours only') { out = []; for (const l of ls) { const p = out[out.length - 1]; if (p && p.l === l && !/^\s/.test(l)) p.n++; else out.push({ l, n: 1 }); } out = out.map((x) => (x.n > 1 ? `${x.l}  (x${x.n})` : x.l)); }
    else { const m = new Map(); for (const l of ls) { if (/^\s/.test(l)) { m.set('\0' + m.size + l, { l, n: 1 }); continue; } const x = m.get(l) || { l, n: 0 }; x.n++; m.set(l, x); } out = [...m.values()].map((x) => (x.n > 1 ? `${x.l}  (x${x.n})` : x.l)); }
    return out.join('\n') + `\n\n--- ${lines(i).length} lines in, ${out.length} out${dropped ? `, ${dropped} noise line(s) dropped` : ''}. Noise list: React DevTools hint, source-map warnings, [vite], [HMR], [webpack-dev-server], [Violation], third-party cookie notice. Indented stack lines are kept as they are.`;
  },
});

// ---------- 844 Android logcat ----------
const PRIO = { V: 'Verbose', D: 'Debug', I: 'Info', W: 'Warn', E: 'Error', F: 'Fatal', A: 'Assert', S: 'Silent' }, PORD = 'VDIWEFAS';
function parseLogcat(l) {
  let m;
  if ((m = /^(\d\d-\d\d \d\d:\d\d:\d\d\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEFAS])\s+(.*?)\s*:\s?(.*)$/.exec(l))) return { time: m[1], pid: m[2], tid: m[3], prio: m[4], tag: m[5], msg: m[6] };
  if ((m = /^(\d\d-\d\d \d\d:\d\d:\d\d\.\d{3})\s+([VDIWEFAS])\/(.+?)\(\s*(\d+)\):\s?(.*)$/.exec(l))) return { time: m[1], pid: m[4], tid: '', prio: m[2], tag: m[3], msg: m[5] };
  if ((m = /^([VDIWEFAS])\/(.+?)\(\s*(\d+)\):\s?(.*)$/.exec(l))) return { time: '', pid: m[3], tid: '', prio: m[1], tag: m[2], msg: m[4] };
  return null;
}
T.push({
  id: 'android-logcat-viewer', cat: LOGCAT, title: 'Android Logcat Viewer: Filter by Tag, PID and Priority',
  desc: 'Parse adb logcat output (threadtime, time and brief formats), filter by minimum priority, tag, process ID or text, and see crashes (FATAL EXCEPTION) and ANRs. Optional colour-coded HTML view.',
  inputs: 1, labels: ['adb logcat output'], file: FILE,
  opts: [sel('prio', 'Priority and above', ['V', 'D', 'I', 'W', 'E', 'F']), txt('tag', 'Tag contains', ''), txt('pid', 'PID equals', ''), txt('text', 'Message contains', ''), sel('view', 'View', ['summary', 'table', 'CSV', 'JSON', 'colour-coded HTML']), LIMIT, MAXW],
  sample: '10-10 10:00:00.123  1234  1234 I ActivityManager: Start proc 4521:com.example.app/u0a123\n10-10 10:00:01.500  4521  4521 D MainActivity: onCreate\n10-10 10:00:02.250  4521  4560 W OkHttp: connection retry 1\n10-10 10:00:03.000  4521  4521 E AndroidRuntime: FATAL EXCEPTION: main\n10-10 10:00:03.001  4521  4521 E AndroidRuntime: Process: com.example.app, PID: 4521\n10-10 10:00:03.002  4521  4521 E AndroidRuntime: java.lang.NullPointerException: x is null',
  run: async ([i], o, files) => {
    const ls = nonEmpty(await readText(i, files)); let bad = 0; const all = [];
    for (const l of ls) { const r = parseLogcat(l); if (r) all.push(r); else bad++; }
    if (!all.length) throw new Error('No logcat lines recognised. Expected "MM-DD HH:MM:SS.mmm PID TID P Tag: message" (adb logcat -v threadtime).');
    const k = PORD.indexOf(o.prio), tf = String(o.tag || '').toLowerCase(), xf = String(o.text || '').toLowerCase();
    const rows = all.filter((r) => PORD.indexOf(r.prio) >= k && (!tf || r.tag.toLowerCase().includes(tf)) && (!o.pid || r.pid === String(o.pid).trim()) && (!xf || r.msg.toLowerCase().includes(xf)));
    const crashes = rows.filter((r) => /FATAL EXCEPTION|ANR in /.test(r.msg));
    const sum = `${rows.length} of ${all.length} lines${badNote(bad, ls.length)}\n\n` + sec('Priority', bars(count(rows, (r) => `${r.prio} ${PRIO[r.prio]}`))) + '\n' + sec('Tags', bars(count(rows, (r) => r.tag), 10)) + '\n' + sec('Processes (PID)', bars(count(rows, (r) => r.pid), 6)) + '\n' + sec('Crashes and ANRs', crashes.map((r) => `${r.time}  pid ${r.pid}  ${r.msg}`).join('\n') || '(none: no "FATAL EXCEPTION" or "ANR in" line)');
    if (o.view === 'colour-coded HTML') {
      const colr = { V: '#808080', D: '#2f6fb3', I: '#2e8b3a', W: '#b8860b', E: '#c0392b', F: '#c0392b', A: '#c0392b' };
      return { html: `<!doctype html><meta charset=utf-8><title>logcat</title><style>:root{color-scheme:light dark}body{font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;margin:8px}div{white-space:pre-wrap;word-break:break-word}b{display:inline-block;width:1.4em;text-align:center;color:#fff;border-radius:3px;margin-right:.5em}.t{opacity:.65}@media(prefers-color-scheme:dark){.V{color:#aaa!important}.D{color:#6aa9ec!important}.I{color:#5fc26a!important}.W{color:#e0b64a!important}.E,.F,.A{color:#ff7b6b!important}}</style>` + rows.slice(0, +o.limit > 0 ? +o.limit : rows.length).map((r) => `<div class="${r.prio}" style="color:${colr[r.prio] || 'inherit'}"><b style="background:${colr[r.prio] || '#666'}">${esc(r.prio)}</b><span class=t>${esc(r.time)} ${esc(r.pid)}</span> ${esc(r.tag)}: ${esc(r.msg)}</div>`).join('') };
    }
    return view(rows, ['time', 'pid', 'tid', 'prio', 'tag', 'msg'], o, sum);
  },
});

// ---------- 845 iOS crash report ----------
function fmtFrame(f, imgs, k) {
  const img = imgs[f.imageIndex]; const nm = img ? (img.name || (img.path || '').split('/').pop() || '?') : '?';
  return `${String(k).padEnd(3)} ${nm.padEnd(28)} +${f.imageOffset ?? '?'}  ${f.symbol ? f.symbol + (f.symbolLocation !== undefined ? ' + ' + f.symbolLocation : '') : '(not symbolicated)'}${f.sourceFile ? `  ${f.sourceFile}:${f.sourceLine}` : ''}`;
}
T.push({
  id: 'ios-crash-report-viewer', cat: LOGCAT, title: 'iOS Crash Report Viewer (.crash and .ips): Crashed Thread First',
  desc: 'Format Apple crash reports in the older text layout or the newer .ips JSON: device and OS, exception type and codes, termination reason and the crashed thread backtrace. It does not symbolicate.',
  inputs: 1, labels: ['.crash or .ips contents'], file: { accept: '.crash,.ips,.txt,.json', multiple: false, optional: true },
  opts: [chk('all', 'Also list the other threads', false)],
  sample: '{"app_name":"Demo","timestamp":"2024-10-10 10:00:00.00 +0000","app_version":"1.2.0","bundleID":"com.example.demo","os_version":"iPhone OS 17.5 (21F79)","incident_id":"AAAA-1111"}\n{"procName":"Demo","modelCode":"iPhone15,2","exception":{"type":"EXC_BAD_ACCESS","signal":"SIGSEGV","subtype":"KERN_INVALID_ADDRESS at 0x0000000000000010","codes":"0x0000000000000001, 0x0000000000000010"},"termination":{"namespace":"SIGNAL","code":11,"indicator":"Segmentation fault: 11"},"faultingThread":0,"threads":[{"triggered":true,"id":1001,"queue":"com.apple.main-thread","frames":[{"imageOffset":4660,"imageIndex":0,"symbol":"-[ViewController loadData]","symbolLocation":88},{"imageOffset":55012,"imageIndex":1,"symbol":"UIApplicationMain","symbolLocation":340}]},{"id":1002,"name":"com.apple.uikit.eventfetch-thread","frames":[{"imageOffset":9000,"imageIndex":1,"symbol":"mach_msg2_trap","symbolLocation":8}]}],"usedImages":[{"name":"Demo","uuid":"x"},{"name":"UIKitCore","uuid":"y"}]}',
  run: async ([i], o, files) => {
    const text = (await readText(i, files)).trim(); const out = [];
    let hdr = {}, body = null;
    const nl = text.indexOf('\n');
    try { body = JSON.parse(text); } catch { try { hdr = JSON.parse(text.slice(0, nl)); body = JSON.parse(text.slice(nl + 1)); } catch { body = null; } }
    if (body && (body.threads || body.exception || body.procName)) {
      const b = { ...hdr, ...body }, imgs = b.usedImages || [];
      out.push('Process:    ' + (b.procName || b.app_name || '?') + (b.bundleID || b.bundleInfo?.CFBundleIdentifier ? `  (${b.bundleID || b.bundleInfo.CFBundleIdentifier})` : ''), 'Version:    ' + (b.app_version || b.bundleInfo?.CFBundleShortVersionString || '?'), 'OS:         ' + (b.os_version || b.osVersion?.train || '?'), 'Device:     ' + (b.modelCode || '?'), 'Time:       ' + (b.captureTime || b.timestamp || '?'), 'Incident:   ' + (b.incident_id || b.incident || '?'), '');
      if (b.exception) out.push(`Exception:  ${b.exception.type || '?'}${b.exception.signal ? ` (${b.exception.signal})` : ''}`, `Subtype:    ${b.exception.subtype || '-'}`, `Codes:      ${b.exception.codes || '-'}`);
      if (b.termination) out.push(`Termination: ${[b.termination.namespace, b.termination.indicator, ...(b.termination.reasons || [])].filter(Boolean).join(' / ')}`);
      if (b.asi) out.push('Application info: ' + JSON.stringify(b.asi).slice(0, 400));
      if (b.lastExceptionBacktrace) out.push('', 'Last exception backtrace', ...b.lastExceptionBacktrace.map((f, k) => '  ' + fmtFrame(f, imgs, k)));
      const th = b.threads || []; const ft = b.faultingThread ?? th.findIndex((t) => t.triggered);
      th.forEach((t, k) => { if (k === ft || t.triggered) out.push('', `Crashed thread ${k}${t.name ? ' "' + t.name + '"' : ''}${t.queue ? ' queue ' + t.queue : ''}`, ...(t.frames || []).map((f, j) => '  ' + fmtFrame(f, imgs, j))); else if (o.all) out.push('', `Thread ${k}${t.name ? ' "' + t.name + '"' : ''}${t.queue ? ' queue ' + t.queue : ''}`, ...(t.frames || []).map((f, j) => '  ' + fmtFrame(f, imgs, j))); });
    } else if (/^(Incident Identifier|Exception Type|Process:|Hardware Model)/m.test(text)) {
      const L = text.split(/\r?\n/); const head = L.filter((l) => /^(Incident Identifier|Hardware Model|Process|Path|Identifier|Version|Code Type|OS Version|Date\/Time|Exception Type|Exception Codes|Exception Subtype|Termination Reason|Termination Description|Triggered by Thread|Crashed Thread|Application Specific Information):/.test(l));
      out.push(...head.slice(0, 20), '');
      const secs = []; let cur = null;
      for (const l of L) { const m = /^Thread (\d+)(?: name:\s*(.*?))?(?: Crashed)?:\s*(.*)$/.exec(l) || /^Thread (\d+) (Crashed):\s*$/.exec(l); if (m && /^Thread \d+/.test(l)) { cur = { n: m[1], crashed: /Crashed/.test(l), title: l, lines: [] }; secs.push(cur); } else if (cur) { if (!l.trim()) cur = null; else cur.lines.push(l); } }
      for (const s of secs) if (s.crashed) out.push(s.title, ...s.lines.map((l) => '  ' + l), ''); else if (o.all) out.push(s.title, ...s.lines.map((l) => '  ' + l), '');
      if (!secs.some((s) => s.crashed)) out.push('(no "Thread N Crashed:" section found; see the Triggered by Thread line)');
      const lb = L.findIndex((l) => /^Last Exception Backtrace:/.test(l)); if (lb >= 0) { out.push('Last Exception Backtrace:'); for (let k = lb + 1; k < L.length && L[k].trim(); k++) out.push('  ' + L[k]); }
    } else throw new Error('Not recognised as a crash report. Paste a .ips file (JSON) or an older .crash text file.');
    return out.join('\n') + '\n\nThe frames show image offsets, so lines marked "not symbolicated" need your app\'s dSYM files (symbolicate in Xcode or with atos). This page only reformats the report.';
  },
});

// ---------- 846 CI build log error extractor ----------
const CI_STRONG = [/^##\[error\]/, /\bnpm ERR!/, /^\s*(?:ERROR|Error|FATAL|Fatal)[:\s]/, /\berror TS\d+/, /\berror(?:\[[A-Z]\d+\])?:\s/, /^\s*FAIL(?:ED)?\b/, /\bTraceback \(most recent call last\)/, /\bBUILD FAILURE\b/, /^\[ERROR\]/, /^fatal:/, /\bProcess completed with exit code [1-9]/, /\bexited with (?:code )?[1-9]/i, /\bcommand not found\b/, /\bNo such file or directory\b/, /\bPermission denied\b/, /\bCannot find module\b/, /^panic:/, /\bUnhandled(?:Promise)?Rejection/, /\bSegmentation fault\b/];
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;
T.push({
  id: 'ci-build-log-error-extractor', cat: LOGCAT, title: 'CI Build Log Error Extractor (GitHub Actions, Jenkins, GitLab)',
  desc: 'Find the first failure in a long CI log: the step name, the error line and the lines around it, plus a list of other error lines. ANSI colours and timestamps are removed first.',
  inputs: 1, labels: ['Raw CI log'], file: FILE,
  opts: [num('before', 'Lines of context before', 8), num('after', 'Lines of context after', 3), chk('weak', 'Also count lines that contain the word "error" or "exception"', false), num('max', 'Other error lines to list', 20)],
  sample: '2024-10-10T10:00:00.1Z ##[group]Run npm test\n2024-10-10T10:00:00.2Z > app@1.0.0 test\n2024-10-10T10:00:01.0Z > jest\n2024-10-10T10:00:02.0Z \x1b[31mFAIL\x1b[0m src/sum.test.js\n2024-10-10T10:00:02.1Z   ● adds numbers\n2024-10-10T10:00:02.2Z     expect(received).toBe(expected)\n2024-10-10T10:00:02.3Z     Expected: 3  Received: 4\n2024-10-10T10:00:03.0Z npm ERR! Test failed.\n2024-10-10T10:00:03.1Z ##[error]Process completed with exit code 1.\n2024-10-10T10:00:03.2Z ##[endgroup]',
  run: async ([i], o, files) => {
    const raw = lines(await readText(i, files)).map((l) => l.replace(ANSI_RE, '').replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, ''));
    let step = ''; const hits = [];
    const weak = /\b(error|exception)s?\b/i, okay = /\b(0|no|zero) (errors?|exceptions?|failures?)\b|errors?: 0\b/i;
    raw.forEach((l, k) => {
      let m;
      if ((m = /^##\[group\](.*)$/.exec(l)) || (m = /^\[Pipeline\] \{ \((.*)\)$/.exec(l)) || (m = /^section_start:\d+:\S+\r?\x1b?\[?0?K?(.*)$/.exec(l))) step = m[1].trim() || step;
      if (okay.test(l)) return;
      if (CI_STRONG.some((r) => r.test(l)) || (o.weak && weak.test(l))) hits.push({ k, step, l });
    });
    if (!hits.length) return `No error lines found in ${raw.length} lines. Try "Also count lines that contain the word error".`;
    const f = hits[0], B = Math.max(0, +o.before | 0), A = Math.max(0, +o.after | 0);
    const ctx = raw.slice(Math.max(0, f.k - B), Math.min(raw.length, f.k + A + 1)).map((l, j) => `${String(Math.max(0, f.k - B) + j + 1).padStart(String(raw.length).length)}${Math.max(0, f.k - B) + j === f.k ? ' >' : '  '} ${l}`);
    return `First failure: line ${f.k + 1}${f.step ? `, step "${f.step}"` : ''}\n\n${ctx.join('\n')}\n\n` + sec(`Error-looking lines (${hits.length} in ${raw.length})`, hits.slice(0, +o.max || 20).map((h) => `${String(h.k + 1).padStart(6)}  ${h.l.trim().slice(0, 160)}`).join('\n')) + '\nThe first failing line is not always the root cause (a later line may explain it), and some tools print "error" in passing runs. Patterns cover GitHub Actions, npm, TypeScript, Jest, Maven, Python, Git, shell and common runtime messages.';
  },
});

// ---------- 847 ANSI renderer ----------
const A16 = ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5', '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff'];
function c256(n) { if (n < 16) return A16[n]; if (n >= 232) { const v = 8 + 10 * (n - 232); return `rgb(${v},${v},${v})`; } n -= 16; const l = [0, 95, 135, 175, 215, 255]; return `rgb(${l[Math.floor(n / 36)]},${l[Math.floor(n / 6) % 6]},${l[n % 6]})`; }
function ansiToSpans(text, repair) {
  let t = String(text).replace(/\r\n/g, '\n');
  if (repair) t = t.replace(/(?:\\e|\\x1b|\\033|\^\[|␛)(?=\[)/gi, '\x1b').replace(/(?<!\x1b)\[(\d{1,3}(?:;\d{1,5})*)m/g, '\x1b[$1m');
  t = t.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[A-Za-ln-z]/g, '');
  t = t.split('\n').map((l) => { const p = l.split('\r').filter((x) => x !== ''); return p.length ? p[p.length - 1] : ''; }).join('\n');
  const out = []; let st = {}, last = 0, m; const re = /\x1b\[([0-9;]*)m/g;
  const push = (s) => { if (s) out.push({ s, st: { ...st } }); };
  while ((m = re.exec(t))) {
    push(t.slice(last, m.index)); last = m.index + m[0].length;
    const c = m[1] === '' ? [0] : m[1].split(';').map(Number);
    for (let k = 0; k < c.length; k++) {
      const x = c[k];
      if (x === 0) st = {}; else if (x === 1) st.b = 1; else if (x === 2) st.d = 1; else if (x === 3) st.i = 1; else if (x === 4) st.u = 1; else if (x === 7) st.r = 1; else if (x === 9) st.s = 1;
      else if (x === 22) { delete st.b; delete st.d; } else if (x === 23) delete st.i; else if (x === 24) delete st.u; else if (x === 27) delete st.r; else if (x === 29) delete st.s;
      else if (x >= 30 && x <= 37) st.fg = A16[x - 30]; else if (x >= 90 && x <= 97) st.fg = A16[x - 90 + 8]; else if (x === 39) delete st.fg;
      else if (x >= 40 && x <= 47) st.bg = A16[x - 40]; else if (x >= 100 && x <= 107) st.bg = A16[x - 100 + 8]; else if (x === 49) delete st.bg;
      else if ((x === 38 || x === 48) && c[k + 1] === 5) { st[x === 38 ? 'fg' : 'bg'] = c256(c[k + 2] | 0); k += 2; }
      else if ((x === 38 || x === 48) && c[k + 1] === 2) { st[x === 38 ? 'fg' : 'bg'] = `rgb(${c[k + 2] | 0},${c[k + 3] | 0},${c[k + 4] | 0})`; k += 4; }
    }
  }
  push(t.slice(last));
  return out;
}
T.push({
  id: 'ansi-log-color-renderer', cat: LOGCAT, title: 'ANSI Escape Code Renderer: Terminal Colours to HTML',
  desc: 'Render terminal logs with ANSI colour and style codes (16, 256 and true colour, bold, underline) as coloured HTML, copy the HTML, or strip the codes to plain text.',
  inputs: 1, labels: ['Terminal output with ANSI codes'],
  opts: [sel('mode', 'Output', ['preview', 'HTML source', 'plain text (codes removed)']), chk('repair', 'Repair lost escape characters (bare [32m, \\e[, ^[[ or \\x1b[)', true), chk('cr', 'Keep only the last part after a carriage return (progress bars)', true)],
  sample: '\x1b[1;32m✔ PASS\x1b[0m src/a.test.js \x1b[2m(12 ms)\x1b[0m\n\x1b[31mFAIL\x1b[0m src/b.test.js\n\x1b[38;5;208morange 256-colour\x1b[0m and \x1b[38;2;80;160;255mtrue colour\x1b[0m and \x1b[4munderline\x1b[0m\n[33mwarning with a lost escape character[0m\nprogress 10%\rprogress 100%',
  run: ([i], o) => {
    const spans = ansiToSpans(need(i, 'terminal output'), o.repair);
    if (o.mode.startsWith('plain')) return spans.map((x) => x.s).join('');
    const body = spans.map(({ s, st }) => {
      let fg = st.fg, bg = st.bg; if (st.r) [fg, bg] = [bg || '#1e1e1e', fg || '#d4d4d4'];
      const css = [fg && `color:${fg}`, bg && `background:${bg}`, st.b && 'font-weight:bold', st.d && 'opacity:.6', st.i && 'font-style:italic', (st.u || st.s) && `text-decoration:${[st.u && 'underline', st.s && 'line-through'].filter(Boolean).join(' ')}`].filter(Boolean).join(';');
      return css ? `<span style="${css}">${esc(s)}</span>` : esc(s);
    }).join('');
    const pre = `<pre style="margin:0;padding:12px;background:#1e1e1e;color:#d4d4d4;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere">${body}</pre>`;
    return o.mode === 'HTML source' ? pre : { html: `<!doctype html><meta charset=utf-8><title>ANSI log</title><body style="margin:0">${pre}` };
  },
});

// ---------- 848 Log format auto-detector ----------
const DET = [
  ['Combined / Common access log', 'access-log-parser', (l) => ACCESS_RE.test(l)],
  ['nginx error log', 'log-grep-context', (l) => /^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d \[\w+\] \d+#\d+:/.test(l)],
  ['Apache error log', 'log-grep-context', (l) => /^\[\w{3} \w{3} +\d+ [\d:.]+ \d{4}\] \[/.test(l)],
  ['HAProxy HTTP log', 'haproxy-log-parser', (l) => HAP_RE.test(l)],
  ['Heroku router', 'heroku-router-log-parser', (l) => /heroku\[router\]:/.test(l)],
  ['AWS ALB log', 'alb-elb-log-parser', (l) => /^(http|https|h2|grpcs|ws|wss) \d{4}-\d\d-\d\dT[\d:.]+Z /.test(l)],
  ['S3 access log', 's3-access-log-parser', (l) => /^[0-9a-f]{20,} \S+ \[\d{1,2}\/\w{3}\/\d{4}:/.test(l)],
  ['iptables / UFW', 'firewall-log-parser', (l) => /\bSRC=\S+ DST=\S+/.test(l)],
  ['pfSense filterlog', 'firewall-log-parser', (l) => /filterlog(\[\d+\])?:/.test(l)],
  ['sshd / auth.log', 'auth-log-analyzer', (l) => /\b(sshd|sudo|fail2ban\S*)\b.*(Failed|Accepted|Invalid|COMMAND|Ban|Unban)/.test(l)],
  ['Android logcat', 'android-logcat-viewer', (l) => !!parseLogcat(l)],
  ['Docker / CRI / kubectl lines', 'docker-log-viewer', (l) => /^(\[[^\]]+\] )?\d{4}-\d\d-\d\dT[\d:.]+(Z|[+-]\d\d:\d\d) (stdout|stderr) [FP] /.test(l) || /^\[(pod\/)?[^\]/]+\/[^\]]+\] /.test(l) || /^\{"log":.*"stream":/.test(l)],
  ['PostgreSQL log', 'postgres-log-analyzer', (l) => /\b(LOG|ERROR|FATAL|STATEMENT|DETAIL):  /.test(l)],
  ['MySQL slow query log', 'mysql-slow-query-analyzer', (l) => /^# (Query_time|User@Host|Time):/.test(l)],
  ['Syslog (RFC 3164 / 5424)', 'syslog-parser', (l) => !!parseSyslog(l)],
  ['logfmt (key=value)', 'logfmt-parser', (l) => (l.match(/(?:^|\s)[\w.-]+=(?:"[^"]*"|\S*)/g) || []).length >= 3],
  ['Windows event XML', 'windows-event-xml-viewer', (l) => /<Event\b/.test(l)],
  ['ANSI colour codes', 'ansi-log-color-renderer', (l) => /\x1b\[[0-9;]*m/.test(l)],
  ['Timestamped application log with levels', 'log-level-histogram', (l) => !!findTs(l) && !!findLevel(l)],
  ['Stack trace frame', 'stacktrace-formatter', (l) => /^\s+at \S+/.test(l) || /^\s+File ".*", line \d+/.test(l)],
];
function jsonKind(o) {
  if (o.eventName && o.eventSource) return ['CloudTrail event', 'cloudtrail-event-viewer'];
  if (o.Records && Array.isArray(o.Records)) return ['CloudTrail Records file', 'cloudtrail-event-viewer'];
  if ('EdgeResponseStatus' in o || 'ClientRequestHost' in o) return ['Cloudflare Logpush', 'cloudflare-logpush-viewer'];
  if ('DownstreamStatus' in o || 'RouterName' in o) return ['Traefik access JSON', 'traefik-caddy-log-parser'];
  if (isObj(o.request) && 'status' in o && 'duration' in o) return ['Caddy access JSON', 'traefik-caddy-log-parser'];
  if (o.logName || (o.severity && o.resource)) return ['Google Cloud LogEntry', 'gcp-log-export-viewer'];
  if (o.category && (o.resourceId || o.operationName)) return ['Azure diagnostic record', 'azure-monitor-log-viewer'];
  if (o.__REALTIME_TIMESTAMP || o._SYSTEMD_UNIT) return ['systemd journal JSON', 'journald-json-viewer'];
  if (isObj(o.t) && o.attr !== undefined) return ['MongoDB structured log', 'redis-mongodb-slowlog-parser'];
  if (isObj(o.proxy) || 'statusCode' in o) return ['Vercel / Netlify style JSON', 'vercel-netlify-log-viewer'];
  if (typeof o.log === 'string' && o.stream) return ['Docker json-file log', 'docker-log-viewer'];
  return ['JSON lines (generic)', 'jsonl-log-filter'];
}
T.push({
  id: 'log-format-detector', cat: LOGCAT, title: 'Log Format Auto-Detector: Which Parser Fits These Lines?',
  desc: 'Paste a sample of log lines and see which known format each line matches (Combined, syslog, JSON, logfmt, W3C, HAProxy, cloud logs and more), with a share per format and the tool to open next.',
  inputs: 1, labels: ['A sample of log lines'], file: FILE,
  sample: '203.0.113.7 - - [10/Oct/2024:13:55:36 +0000] "GET /index.html HTTP/1.1" 200 2326 "-" "curl/8.5.0"\n198.51.100.4 - - [10/Oct/2024:13:55:40 +0000] "GET /a HTTP/1.1" 404 12 "-" "curl/8.5.0"\n<34>Oct 11 22:14:15 mymachine su: \'su root\' failed\nts=2024-10-10T10:00:00Z level=info msg=started port=8080\n{"time":"2024-10-10T10:00:00Z","level":"info","msg":"hello"}',
  run: async ([i], o, files) => {
    const text = await readText(i, files), ls = nonEmpty(text).slice(0, 5000);
    if (!ls.length) throw new Error('No lines.');
    const hdr = ls.filter((l) => l.startsWith('#Fields:')); const found = new Map(); let none = 0; const noneEx = [];
    const add = (name, tool) => { const x = found.get(name) || { n: 0, tool }; x.n++; found.set(name, x); };
    if (hdr.length) add(/cs-uri-stem/.test(hdr[0]) && /x-edge/.test(hdr[0]) ? 'CloudFront standard log (tab-separated, #Fields)' : 'W3C extended log (IIS), #Fields header', /x-edge/.test(hdr[0]) ? 'cloudfront-log-parser' : 'iis-w3c-log-parser');
    for (const l of ls) {
      if (l.startsWith('#')) continue;
      if (l.trim()[0] === '{') { try { const j = JSON.parse(l); const [n, t] = jsonKind(j); add(n, t); continue; } catch { /* not JSON */ } }
      const d = DET.find(([, , f]) => f(l));
      if (d) add(d[0], d[1]); else { none++; if (noneEx.length < 3) noneEx.push(l.slice(0, 100)); }
    }
    const rows = [...found.entries()].sort((a, b) => b[1].n - a[1].n);
    if (!rows.length) return `No known format matched ${ls.length} line(s).\nExamples:\n${noneEx.join('\n')}\n\nTry the Log Pattern Miner to see the shapes in the file.`;
    return `${ls.length} line(s) checked (first 5000 at most)\n\nBest guess: ${rows[0][0]}  ->  open "${rows[0][1].tool}"\n\n` + asTable(rows.map(([k, v]) => ({ format: k, lines: v.n, share: (100 * v.n / ls.length).toFixed(1) + '%', 'tool id': v.tool })), ['format', 'lines', 'share', 'tool id'], 60) + `\n\n${none} line(s) matched nothing${noneEx.length ? ':\n' + noneEx.map((x) => '  ' + x).join('\n') : ''}\n\nDetection is by simple pattern per line; the first matching pattern wins, so a line can fit several formats. Tool ids are pages on this site.`;
  },
});

// ---------- 831 Large log file viewer (custom UI, reads the file in slices) ----------
const LF_CHUNK = 512 * 1024;
async function lfReadLines(file, offset, n) { // lines starting at a line-start byte offset; returns {text, next}
  const end = Math.min(file.size, offset + LF_CHUNK), buf = new Uint8Array(await file.slice(offset, end).arrayBuffer());
  let pos = 0, count2 = 0;
  while (pos < buf.length && count2 < n) { const nl = buf.indexOf(10, pos); if (nl < 0) { if (end >= file.size) { pos = buf.length; count2++; } else if (count2 === 0) pos = buf.length; break; } pos = nl + 1; count2++; }
  return { text: new TextDecoder().decode(buf.subarray(0, pos)).replace(/\n$/, ''), next: offset + pos };
}
async function lfPrevOffset(file, offset, n) { // start of the n lines before offset
  if (offset <= 0) return 0;
  let start = Math.max(0, offset - LF_CHUNK); const buf = new Uint8Array(await file.slice(start, offset).arrayBuffer());
  let p = buf.length - 1; if (buf[p] === 10) p--; let seen = 0;
  for (; p >= 0; p--) if (buf[p] === 10 && ++seen === n) return start + p + 1;
  return start === 0 ? 0 : start + (buf.indexOf(10) + 1);
}
async function lfAlign(file, offset) { // move to the next line start
  if (offset <= 0) return 0; if (offset >= file.size) return file.size;
  const buf = new Uint8Array(await file.slice(offset - 1, Math.min(file.size, offset + 65536)).arrayBuffer());
  if (buf[0] === 10) return offset; const nl = buf.indexOf(10, 1); return nl < 0 ? file.size : offset - 1 + nl + 1;
}
async function lfSearch(file, from, re) { // first line at or after `from` that matches; returns its start offset or -1
  let off = from; const dec = new TextDecoder();
  while (off < file.size) {
    const end = Math.min(file.size, off + 4 * LF_CHUNK), buf = new Uint8Array(await file.slice(off, end).arrayBuffer());
    const lastNl = end >= file.size ? buf.length : buf.lastIndexOf(10) + 1; if (lastNl <= 0 && end < file.size) { off = end; continue; }
    let p = 0;
    while (p < lastNl) { let nl = buf.indexOf(10, p); if (nl < 0 || nl >= lastNl) nl = lastNl; if (re.test(dec.decode(buf.subarray(p, nl)))) return off + p; p = nl + 1; }
    off += lastNl;
  }
  return -1;
}
T.push({
  id: 'large-log-file-viewer', cat: LOGCAT, title: 'Large Log File Viewer: Page Through Multi-GB Logs Without Loading Them',
  desc: 'Open a very large text log and read it in pages. Only the part you look at is read from disk. Jump to a percentage of the file or search forward for text or a regex.',
  custom: true,
  lib: { lfReadLines, lfPrevOffset, lfAlign, lfSearch },
  render(el) {
    const mk = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
    let file = null, offset = 0, shownFrom = 0, busy = false;
    const inp = mk('input', { type: 'file', id: 'lf-file' }), lines2 = mk('input', { type: 'number', id: 'lf-n', value: 100, min: 10, max: 2000 }), pct = mk('input', { type: 'number', id: 'lf-pct', value: 0, min: 0, max: 100, step: 1 });
    const q = mk('input', { type: 'text', id: 'lf-q', placeholder: 'text or /regex/i' });
    const status = mk('p', { role: 'status', textContent: 'Choose a file to start.' }), out = mk('pre', { tabIndex: 0, style: 'max-height:60vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere' });
    out.setAttribute('aria-label', 'Log lines');
    const btn = (label, fn) => { const b = mk('button', { type: 'button', textContent: label }); b.addEventListener('click', () => { if (!file || busy) return; busy = true; Promise.resolve(fn()).catch((e) => { status.textContent = 'Error: ' + e.message; }).finally(() => { busy = false; }); }); return b; };
    const nLines = () => Math.min(2000, Math.max(10, +lines2.value | 0 || 100));
    const show = async (from) => { const r = await lfReadLines(file, from, nLines()); shownFrom = from; offset = r.next; out.textContent = r.text; out.scrollTop = 0; status.textContent = `Showing bytes ${from.toLocaleString()} to ${r.next.toLocaleString()} of ${file.size.toLocaleString()} (${(100 * from / Math.max(1, file.size)).toFixed(1)}%). Line numbers are not counted in large files.`; pct.value = Math.round(100 * from / Math.max(1, file.size)); };
    inp.addEventListener('change', () => { file = inp.files[0] || null; if (file) show(0).catch((e) => { status.textContent = 'Error: ' + e.message; }); });
    const row = (...k) => mk('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin:8px 0' }, ...k);
    const lab = (t, id, c) => mk('div', {}, mk('label', { htmlFor: id, textContent: t }), c);
    const findNext = btn('Find next', async () => {
      const s = q.value; if (!s) { status.textContent = 'Enter text to find.'; return; }
      let re; const m = /^\/(.+)\/([a-z]*)$/.exec(s); try { re = m ? new RegExp(m[1], m[2]) : new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); } catch { status.textContent = 'Not a valid regular expression.'; return; }
      status.textContent = 'Searching…'; const from = offset > shownFrom ? shownFrom + 1 : shownFrom; const start = await lfAlign(file, Math.max(from, shownFrom + 1));
      const hit = await lfSearch(file, start >= file.size ? 0 : start, re);
      if (hit < 0) status.textContent = 'No further match in the file.'; else await show(hit);
    });
    el.replaceChildren(
      mk('p', {}, 'The file stays on your computer. Pages are read from disk in small slices, so the browser does not hold the whole file.'),
      row(lab('Log file', 'lf-file', inp), lab('Lines per page', 'lf-n', lines2)),
      row(btn('First page', () => show(0)), btn('Previous page', async () => show(await lfPrevOffset(file, shownFrom, nLines()))), btn('Next page', () => (offset >= file.size ? (status.textContent = 'End of file.') : show(offset))), btn('Last page', async () => show(await lfPrevOffset(file, file.size, nLines())))),
      row(lab('Jump to percent of file', 'lf-pct', pct), btn('Go', async () => show(await lfAlign(file, Math.floor(file.size * Math.min(100, Math.max(0, +pct.value || 0)) / 100))))),
      row(lab('Find (forward from here)', 'lf-q', q), findNext),
      status, out,
    );
  },
});

export default T;

// Hand-written ZIP / XLSX / PDF / bcrypt tools. Zero dependencies, platform APIs only
// (CompressionStream/DecompressionStream 'deflate-raw' + 'deflate', crypto.getRandomValues, BigInt, canvas).
// Pure tools (xlsx writers, text/markdown->pdf, bcrypt) run under Node 22; file/canvas tools are `file`/`dom`.
// Skipped (need big third-party libraries, out of scope for hand-written code): generic PDF merge/split/rotate of
// arbitrary PDFs, HEIC decoding, Mermaid rendering, SQL playgrounds.
// Ceilings:
//  - ZIP: no ZIP64, no encryption, only stored(0)/deflate(8). Names are UTF-8 (flag 0x800) or read as Latin-1.
//  - XLSX viewer: first/selected sheet only, no formula evaluation (cached values shown), dates appear as serial
//    numbers (cell styles are not interpreted), no XML namespace prefixes other than the default.
//  - bcrypt: $2a/$2b/$2y, passwords truncated to 72 bytes (standard). Pi digits for Blowfish are computed at first
//    use with a BigInt Machin formula (no embedded tables) and verified against bcryptjs in testing.
//  - PDF writer: standard-14 fonts with WinAnsi (characters outside WinAnsi become '?'); widths are the Adobe AFM
//    metrics for Helvetica/Times (regular+bold); Courier is fixed 600. Markdown is a small subset, inline emphasis
//    is stripped (no bold/italic runs), tables are printed as plain text lines.
//  - PDF readers (pdf-info, pdf-text-extract-simple) are regex/lexer based and best-effort: no encryption, no
//    LZW/ASCII85, no xref repair. Text extraction only works for simple fonts with WinAnsi/Latin-1 style codes;
//    subset-embedded / Type0 / Identity-H fonts (most Word/Chrome/LaTeX PDFs) yield nothing readable.

// ---------- byte helpers ----------
const enc = new TextEncoder();
const u8 = (s) => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; };
const latin = (b) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };
const concat = (arrs) => { let n = 0; for (const a of arrs) n += a.length; const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; };
const readBytes = async (f) => new Uint8Array(await f.arrayBuffer());
const pipe = async (data, stream) => new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer());
const deflateRaw = (d) => pipe(d, new CompressionStream('deflate-raw'));
const inflateRaw = (d) => pipe(d, new DecompressionStream('deflate-raw'));
const zDeflate = (d) => pipe(d, new CompressionStream('deflate'));
const zInflate = (d) => pipe(d, new DecompressionStream('deflate'));
const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB');
const pad = (n, w = 2) => String(n).padStart(w, '0');
const one = (files, what) => { if (!files?.length) throw new Error(`Choose ${what} first`); return files[0]; };

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// little-endian packer: le(size, value, size, value, ...)
function le(...p) {
  let n = 0; for (let i = 0; i < p.length; i += 2) n += p[i];
  const o = new Uint8Array(n), v = new DataView(o.buffer); let q = 0;
  for (let i = 0; i < p.length; i += 2) { const s = p[i], x = p[i + 1]; if (s === 1) v.setUint8(q, x); else if (s === 2) v.setUint16(q, x, true); else v.setUint32(q, x >>> 0, true); q += s; }
  return o;
}

// ---------- ZIP ----------
function dosDT(ms) {
  const d = new Date(ms || Date.now()), y = Math.max(1980, d.getFullYear());
  return [(d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()];
}
const dosToStr = (t, d) => `${1980 + (d >> 9)}-${pad((d >> 5) & 15)}-${pad(d & 31)} ${pad(t >> 11)}:${pad((t >> 5) & 63)}`;

// entries: [{name, data:Uint8Array, date?:ms}] -> Uint8Array .zip. Falls back to "stored" when deflate does not help.
async function zipBuild(entries, compress = true) {
  if (entries.length > 65535) throw new Error('Too many files for a ZIP (max 65535, ZIP64 not supported)');
  const out = [], cd = []; let off = 0, cdSize = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), data = e.data, crc = crc32(data);
    let method = 0, body = data;
    if (compress && data.length > 0) { const d = await deflateRaw(data); if (d.length < data.length) { method = 8; body = d; } }
    const [t, dt] = dosDT(e.date);
    const lh = le(4, 0x04034b50, 2, 20, 2, 0x800, 2, method, 2, t, 2, dt, 4, crc, 4, body.length, 4, data.length, 2, name.length, 2, 0);
    const ch = le(4, 0x02014b50, 2, 20, 2, 20, 2, 0x800, 2, method, 2, t, 2, dt, 4, crc, 4, body.length, 4, data.length, 2, name.length, 2, 0, 2, 0, 2, 0, 2, 0, 4, e.name.endsWith('/') ? 0x10 : 0, 4, off);
    out.push(lh, name, body); cd.push(ch, name);
    off += lh.length + name.length + body.length; cdSize += ch.length + name.length;
    if (off > 0xfffffff0) throw new Error('Archive would exceed 4 GB (ZIP64 not supported)');
  }
  return concat([...out, ...cd, le(4, 0x06054b50, 2, 0, 2, 0, 2, entries.length, 2, entries.length, 4, cdSize, 4, off, 2, 0)]);
}

// -> {entries:[{name,method,flags,crc,cs,us,lo,time,date,zip64,isDir}], comment}
function zipRead(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.length);
  const min = Math.max(0, b.length - 22 - 65535);
  let p = b.length - 22;
  while (p >= min && v.getUint32(p, true) !== 0x06054b50) p--;
  if (p < min) throw new Error('Not a ZIP file (end-of-central-directory record not found)');
  const n = v.getUint16(p + 10, true), cdOff = v.getUint32(p + 16, true), clen = v.getUint16(p + 20, true);
  if (n === 0xffff || cdOff === 0xffffffff) throw new Error('ZIP64 archives are not supported');
  const entries = []; let q = cdOff;
  for (let i = 0; i < n; i++) {
    if (q + 46 > b.length || v.getUint32(q, true) !== 0x02014b50) throw new Error('Corrupt ZIP central directory');
    const flags = v.getUint16(q + 8, true), nl = v.getUint16(q + 28, true), el = v.getUint16(q + 30, true), cl = v.getUint16(q + 32, true);
    const nb = b.subarray(q + 46, q + 46 + nl);
    const e = {
      flags, method: v.getUint16(q + 10, true), time: v.getUint16(q + 12, true), date: v.getUint16(q + 14, true), crc: v.getUint32(q + 16, true),
      cs: v.getUint32(q + 20, true), us: v.getUint32(q + 24, true), lo: v.getUint32(q + 42, true),
      name: flags & 0x800 ? new TextDecoder().decode(nb) : latin(nb),
    };
    e.zip64 = e.cs === 0xffffffff || e.us === 0xffffffff || e.lo === 0xffffffff;
    e.isDir = e.name.endsWith('/');
    entries.push(e); q += 46 + nl + el + cl;
  }
  return { entries, comment: latin(b.subarray(p + 22, p + 22 + clen)) };
}
const METHODS = { 0: 'stored', 8: 'deflate', 9: 'deflate64', 12: 'bzip2', 14: 'lzma', 93: 'zstd', 95: 'xz' };
function unsupported(e) {
  if (e.zip64) return 'ZIP64 entry (not supported)';
  if (e.flags & 1) return 'encrypted (not supported)';
  if (e.method !== 0 && e.method !== 8) return `compression method ${e.method} ${METHODS[e.method] || ''} (not supported)`;
  return '';
}
async function zipData(b, e) {
  const bad = unsupported(e); if (bad) throw new Error(`${e.name}: ${bad}`);
  const v = new DataView(b.buffer, b.byteOffset, b.length);
  if (e.lo + 30 > b.length || v.getUint32(e.lo, true) !== 0x04034b50) throw new Error(`${e.name}: bad local header`);
  const s = e.lo + 30 + v.getUint16(e.lo + 26, true) + v.getUint16(e.lo + 28, true);
  if (s + e.cs > b.length) throw new Error(`${e.name}: truncated data`);
  const raw = b.subarray(s, s + e.cs);
  const data = e.method === 0 ? raw : await inflateRaw(raw);
  if (data.length !== e.us || crc32(data) !== e.crc) throw new Error(`${e.name}: CRC/size mismatch (corrupt entry)`);
  return data;
}
const openZip = async (files) => { const f = one(files, 'a .zip file'); return [await readBytes(f), f]; };

// ---------- XML / XLSX ----------
const xesc = (s) => String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const xunesc = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e]);
const colName = (i) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
const colIndex = (ref) => { let n = 0; for (const ch of ref.match(/^[A-Z]+/i)[0].toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const attr = (tag, name) => { const m = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`)); return m ? xunesc(m[1] ?? m[2]) : undefined; };

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const STYLES = `${XH}<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// rows: array of arrays of string|number|boolean|null. Returns a .xlsx Blob.
async function xlsxBuild(rows, { header = true, sheetName = 'Sheet1' } = {}) {
  if (rows.length > 1048576) throw new Error('Too many rows for XLSX (max 1,048,576)');
  const ncol = Math.max(1, ...rows.map((r) => r.length));
  if (ncol > 16384) throw new Error('Too many columns for XLSX (max 16,384)');
  const widths = new Array(ncol).fill(8);
  rows.slice(0, 200).forEach((r) => r.forEach((v, c) => { if (v != null) widths[c] = Math.min(60, Math.max(widths[c], String(v).length + 2)); }));
  let sd = '';
  rows.forEach((r, ri) => {
    let cells = '';
    r.forEach((v, c) => {
      if (v == null || v === '') return;
      const ref = colName(c) + (ri + 1), s = header && ri === 0 ? ' s="1"' : '';
      if (typeof v === 'number' && isFinite(v)) cells += `<c r="${ref}"${s}><v>${v}</v></c>`;
      else if (typeof v === 'boolean') cells += `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
      else cells += `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xesc(String(v).slice(0, 32767))}</t></is></c>`;
    });
    sd += `<row r="${ri + 1}">${cells}</row>`;
  });
  const name = (sheetName || 'Sheet1').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Sheet1';
  const sheet = `${XH}<worksheet xmlns="${NS}">${header && rows.length > 1 ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : ''}<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sd}</sheetData></worksheet>`;
  const T = (s) => enc.encode(s), d = Date.UTC(2020, 0, 1);
  const files = [
    ['[Content_Types].xml', `${XH}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `${XH}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${XH}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="${xesc(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${XH}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
  const zip = await zipBuild(files.map(([n, s]) => ({ name: n, data: T(s), date: d })), true);
  return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const NUM = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
function parseCsv(s, d) {
  s = s.replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === '') q = true;
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); f = ''; if (!(row.length === 1 && row[0] === '')) rows.push(row); row = []; }
    else f += c;
  }
  if (q) throw new Error('Unterminated quoted field in CSV');
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const cellOf = (v) => (v != null && typeof v === 'object' ? JSON.stringify(v) : v ?? null);
function jsonRows(data) {
  if (Array.isArray(data)) {
    if (data.length && data.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      const keys = [...new Set(data.flatMap(Object.keys))];
      return [keys, ...data.map((o) => keys.map((k) => cellOf(o[k])))];
    }
    if (data.length && data.every(Array.isArray)) return data.map((r) => r.map(cellOf));
    return [['value'], ...data.map((x) => [cellOf(x)])];
  }
  if (data && typeof data === 'object') { const k = Object.keys(data); return [k, k.map((x) => cellOf(data[x]))]; }
  return [['value'], [cellOf(data)]];
}
const csvQuote = (v) => (/[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

// ---------- bcrypt (Blowfish with computed pi digits) ----------
let PI_WORDS;
function piWords() {
  if (PI_WORDS) return PI_WORDS;
  const N = 18 + 4 * 256, B = BigInt(N * 32 + 64), ONE = 1n << B;
  const atanInv = (x) => {
    x = BigInt(x); const x2 = x * x; let t = ONE / x, s = t;
    for (let k = 3n; ; k += 2n) { t /= x2; if (t === 0n) break; if ((k >> 1n) & 1n) s -= t / k; else s += t / k; }
    return s;
  };
  const frac = 16n * atanInv(5) - 4n * atanInv(239) - 3n * ONE;
  PI_WORDS = new Uint32Array(N);
  for (let i = 0; i < N; i++) PI_WORDS[i] = Number((frac >> (B - BigInt(32 * (i + 1)))) & 0xffffffffn);
  return PI_WORDS;
}
const B64 = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function b64enc(b, len) {
  let out = '', acc = 0, bits = 0;
  for (let i = 0; i < len; i++) { acc = (acc << 8) | b[i]; bits += 8; while (bits >= 6) { bits -= 6; out += B64[(acc >> bits) & 63]; } acc &= (1 << bits) - 1; }
  if (bits) out += B64[(acc << (6 - bits)) & 63];
  return out;
}
function b64dec(s, len) {
  const out = []; let acc = 0, bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch); if (v < 0) throw new Error('Invalid bcrypt salt/hash character: ' + ch);
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); acc &= (1 << bits) - 1; if (out.length === len) break; }
  }
  if (out.length < len) throw new Error('Salt too short');
  return Uint8Array.from(out);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

async function bcryptRaw(pw, salt, cost) {
  const pi = piWords(), P = new Int32Array(18), S = new Int32Array(1024);
  P.set(pi.subarray(0, 18)); S.set(pi.subarray(18));
  const key = new Uint8Array(Math.min(72, pw.length + 1)); key.set(pw.subarray(0, key.length)); // NUL terminator is the extra byte (72-byte cap)
  const sw = new Int32Array(4); for (let i = 0; i < 4; i++) sw[i] = (salt[i * 4] << 24) | (salt[i * 4 + 1] << 16) | (salt[i * 4 + 2] << 8) | salt[i * 4 + 3];
  let L = 0, R = 0;
  const enc2 = (l, r) => {
    l ^= P[0];
    for (let i = 1; i <= 15; i += 2) {
      r ^= (((S[l >>> 24] + S[256 + ((l >> 16) & 255)]) ^ S[512 + ((l >> 8) & 255)]) + S[768 + (l & 255)]) ^ P[i];
      l ^= (((S[r >>> 24] + S[256 + ((r >> 16) & 255)]) ^ S[512 + ((r >> 8) & 255)]) + S[768 + (r & 255)]) ^ P[i + 1];
    }
    L = r ^ P[17]; R = l;
  };
  const expand = (data, withSalt) => {
    let o = 0;
    for (let i = 0; i < 18; i++) { let w = 0; for (let k = 0; k < 4; k++) { w = (w << 8) | data[o]; o = (o + 1) % data.length; } P[i] ^= w; }
    let l = 0, r = 0, j = 0;
    for (let i = 0; i < 18; i += 2) { if (withSalt) { l ^= sw[j]; r ^= sw[j + 1]; j = (j + 2) & 3; } enc2(l, r); l = L; r = R; P[i] = l; P[i + 1] = r; }
    for (let i = 0; i < 1024; i += 2) { if (withSalt) { l ^= sw[j]; r ^= sw[j + 1]; j = (j + 2) & 3; } enc2(l, r); l = L; r = R; S[i] = l; S[i + 1] = r; }
  };
  expand(key, true);
  const total = 2 ** cost; let last = Date.now();
  for (let i = 0; i < total; i++) {
    expand(key, false); expand(salt, false);
    if ((i & 15) === 15 && Date.now() - last > 30) { await tick(); last = Date.now(); } // keep the page responsive
  }
  const c = Int32Array.of(0x4f727068, 0x65616e42, 0x65686f6c, 0x64657253, 0x63727944, 0x6f756274);
  for (let i = 0; i < 64; i++) for (let j = 0; j < 6; j += 2) { enc2(c[j], c[j + 1]); c[j] = L; c[j + 1] = R; }
  const out = new Uint8Array(24);
  for (let i = 0; i < 6; i++) { out[i * 4] = c[i] >>> 24; out[i * 4 + 1] = (c[i] >>> 16) & 255; out[i * 4 + 2] = (c[i] >>> 8) & 255; out[i * 4 + 3] = c[i] & 255; }
  return out;
}
// salt22: 22 bcrypt-base64 chars -> full "$2b$12$<salt><hash>" string
async function bcryptHash(password, cost, ver, salt22) {
  if (!(cost >= 4 && cost <= 16)) throw new Error('Cost must be between 4 and 16');
  const salt = b64dec(salt22, 16);
  const h = await bcryptRaw(enc.encode(password), salt, cost);
  return `$${ver}$${pad(cost)}$${b64enc(salt, 16)}${b64enc(h, 23)}`;
}
const randSalt = () => b64enc(crypto.getRandomValues(new Uint8Array(16)), 16);

// ---------- PDF writer ----------
const AFM = {
  Helvetica: '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584 0 556 0 222 556 333 1000 556 556 333 1000 667 333 1000 0 611 0 0 222 222 333 333 350 556 1000 333 1000 500 333 944 0 500 500 278 333 556 556 556 556 260 556 333 737 370 556 584 333 737 333 400 584 333 333 333 556 537 278 333 333 365 556 834 834 834 611 667 667 667 667 667 667 1000 722 667 667 667 667 278 278 278 278 722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611 556 556 556 556 556 556 889 500 556 556 556 556 278 278 278 278 556 556 556 556 556 556 556 584 611 556 556 556 556 500 556 500',
  HelveticaB: '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584 0 556 0 278 556 500 1000 556 556 333 1000 667 333 1000 0 611 0 0 278 278 500 500 350 556 1000 333 1000 556 333 944 0 500 556 278 333 556 556 556 556 280 556 333 737 370 556 584 333 737 333 400 584 333 333 333 611 556 278 333 333 365 556 834 834 834 611 722 722 722 722 722 722 1000 722 667 667 667 667 278 278 278 278 722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611 556 556 556 556 556 556 889 556 556 556 556 556 278 278 278 278 611 611 611 611 611 611 611 584 611 611 611 611 611 556 611 556',
  Times: '250 333 408 500 500 833 778 180 333 333 500 564 250 333 250 278 500 500 500 500 500 500 500 500 500 500 278 278 564 564 564 444 921 722 667 667 722 611 556 722 722 333 389 722 611 889 722 722 556 722 667 556 611 722 722 944 722 722 611 333 278 333 469 500 333 444 500 444 500 444 333 500 500 278 278 500 278 778 500 500 500 500 333 389 278 500 500 722 500 500 444 480 200 480 541 0 500 0 333 500 444 1000 500 500 333 1000 556 333 889 0 611 0 0 333 333 444 444 350 500 1000 333 980 389 333 722 0 444 500 250 333 500 500 500 500 200 500 333 760 276 500 564 333 760 333 400 564 300 300 333 500 453 250 333 300 310 500 750 750 750 444 722 722 722 722 722 722 889 667 611 611 611 611 333 333 333 333 722 722 722 722 722 722 722 564 722 722 722 722 722 722 556 500 444 444 444 444 444 444 667 444 444 444 444 444 278 278 278 278 500 500 500 500 500 500 500 564 500 500 500 500 500 500 500 500',
  TimesB: '250 333 555 500 500 1000 833 278 333 333 500 570 250 333 250 278 500 500 500 500 500 500 500 500 500 500 333 333 570 570 570 500 930 722 667 722 722 667 611 778 778 389 500 778 667 944 722 778 611 778 722 556 667 722 722 1000 722 722 667 333 278 333 581 500 333 500 556 444 556 444 333 500 556 278 333 556 278 833 556 500 556 556 444 389 333 556 500 722 500 500 444 394 220 394 520 0 500 0 333 500 500 1000 500 500 333 1000 556 333 1000 0 667 0 0 333 333 500 500 350 500 1000 333 1000 389 333 722 0 444 500 250 333 500 500 500 500 220 500 333 747 300 500 570 333 747 333 400 570 300 300 333 556 540 250 333 300 330 500 750 750 750 500 722 722 722 722 722 722 1000 722 667 667 667 667 389 389 389 389 722 722 778 778 778 778 778 570 778 722 722 722 722 722 611 556 500 500 500 500 500 500 722 444 444 444 444 444 278 278 278 278 500 556 500 500 500 500 500 570 500 556 556 556 556 500 556 500',
};
const AFMT = Object.fromEntries(Object.entries(AFM).map(([k, v]) => [k, v.split(' ').map(Number)]));
const FONTS = { Helvetica: ['Helvetica', 'Helvetica-Bold'], Times: ['Times-Roman', 'Times-Bold'], Courier: ['Courier', 'Courier-Bold'] };
const widther = (fam, bold) => {
  if (fam === 'Courier') return () => 600;
  const t = AFMT[fam + (bold ? 'B' : '')], d = fam === 'Times' ? 500 : 556;
  return (c) => t[c - 32] || d;
};
const strw = (wf, s) => { let w = 0; for (let i = 0; i < s.length; i++) w += wf(s.charCodeAt(i)); return w; };

const WIN = new Map();
const C1 = '\u20ac\x81\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\x8d\u017d\x8f\x90\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\x9d\u017e\u0178'; // cp1252 0x80-0x9F
[...C1].forEach((ch, i) => { if (i !== 1 && i !== 13 && i !== 15 && i !== 16 && i !== 29) WIN.set(ch, 0x80 + i); });
// unicode text -> string whose char codes are WinAnsi bytes
function toWin(s) {
  let o = '';
  for (const ch of s.replace(/\r\n?/g, '\n').normalize('NFC')) {
    const c = ch.codePointAt(0);
    if (ch === '\t') o += '    ';
    else if (ch === '\n' || (c >= 32 && c < 127) || (c >= 160 && c < 256)) o += ch;
    else if (WIN.has(ch)) o += String.fromCharCode(WIN.get(ch));
    else if (c < 32 || c === 127 || (c >= 0x200b && c <= 0x200f) || c === 0xfeff) continue;
    else o += '?';
  }
  return o;
}
const pdfHex = (b) => '<' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('') + '>';
const n2 = (n) => +n.toFixed(2);

class Doc {
  constructor() { this.o = []; this.add('<< /Type /Catalog /Pages 2 0 R >>'); this.add(''); const t = new Date(); this.add(`<< /Producer ${pdfHex(enc.encode('Free Tools'))} /CreationDate (D:${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}Z) >>`); }
  add(x) { this.o.push(x); return this.o.length; }
  set(n, x) { this.o[n - 1] = x; }
  async flate(dict, data) { if (data.length > 32) { const z = await zDeflate(data); if (z.length < data.length) return { dict: `/Filter /FlateDecode ${dict}`, data: z }; } return { dict, data }; }
  async addPages(specs) {
    const kids = [];
    for (const s of specs) {
      const c = this.add(await this.flate('', typeof s.content === 'string' ? u8(s.content) : s.content));
      kids.push(this.add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(s.W)} ${n2(s.H)}] /Resources ${s.res} /Contents ${c} 0 R >>`) + ' 0 R');
    }
    this.set(2, `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`);
    return new Blob([this.finish()], { type: 'application/pdf' });
  }
  finish() {
    const head = u8('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'), parts = [head], offs = []; let len = head.length;
    this.o.forEach((x, i) => {
      offs.push(len);
      const b = typeof x === 'string' ? u8(`${i + 1} 0 obj\n${x}\nendobj\n`) : concat([u8(`${i + 1} 0 obj\n<< ${x.dict} /Length ${x.data.length} >>\nstream\n`), x.data, u8('\nendstream\nendobj\n')]);
      parts.push(b); len += b.length;
    });
    const xr = `xref\n0 ${this.o.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
      `trailer\n<< /Size ${this.o.length + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${len}\n%%EOF\n`;
    parts.push(u8(xr));
    return concat(parts);
  }
}
const fontRes = (d, fam) => {
  const [r, b] = FONTS[fam], mk = (n) => d.add(`<< /Type /Font /Subtype /Type1 /BaseFont /${n} /Encoding /WinAnsiEncoding >>`);
  return `<< /Font << /F1 ${mk(r)} 0 R /F2 ${mk(b)} 0 R /F3 ${mk('Courier')} 0 R >> >>`;
};

// greedy word wrap on a WinAnsi string; leading spaces of a paragraph are kept, long words are hard-broken
function wrap(s, maxW, wf) {
  const toks = s.match(/ *[^ ]+/g); if (!toks) return [''];
  const lines = []; let line = '';
  for (let t of toks) {
    if (line && strw(wf, line + t) <= maxW) { line += t; continue; }
    if (line) { lines.push(line); line = ''; t = t.trimStart(); }
    while (strw(wf, t) > maxW && t.length > 1) { let k = 1; while (k < t.length - 1 && strw(wf, t.slice(0, k + 1)) <= maxW) k++; lines.push(t.slice(0, k)); t = t.slice(k); }
    line = t;
  }
  lines.push(line);
  return lines;
}
// blocks: {t, f:'r'|'b'|'m', size, ind, before, after, bullet, bw}
function layoutPages(blocks, W, H, m, fam) {
  const wfs = { r: widther(fam, 0), b: widther(fam, 1), m: () => 600 };
  const pages = [[]]; let y = H - m;
  for (const b of blocks) {
    const lh = b.size * 1.2, ind = b.ind || 0;
    const lines = b.t === '' ? [''] : wrap(b.t, Math.max(30, W - 2 * m - ind) * 1000 / b.size, wfs[b.f]);
    if (y < H - m - 0.01) y -= b.before || 0;
    lines.forEach((ln, i) => {
      if (y - lh < m) { pages.push([]); y = H - m; }
      const items = pages[pages.length - 1];
      if (ln) items.push({ x: m + ind, y: y - b.size, f: b.f, s: b.size, t: ln });
      if (i === 0 && b.bullet) items.push({ x: m + ind - (b.bw || 14), y: y - b.size, f: 'r', s: b.size, t: b.bullet });
      y -= lh;
    });
    y -= b.after || 0;
  }
  return { pages, wfs };
}
const PAGE = { A4: [595.28, 841.89], Letter: [612, 792] };
const clamp = (v, a, b, d) => { v = parseFloat(v); return isNaN(v) ? d : Math.min(b, Math.max(a, v)); };
async function renderText(blocks, o) {
  let [W, H] = PAGE[o.page] || PAGE.A4;
  if (o.orientation === 'landscape') [W, H] = [H, W];
  const m = clamp(o.margin, 24, 144, 56), fam = FONTS[o.font] ? o.font : 'Helvetica';
  const { pages, wfs } = layoutPages(blocks, W, H, m, fam), N = pages.length;
  const hdr = toWin(String(o.header || '')).replace(/\n/g, ' ');
  pages.forEach((items, i) => {
    if (hdr) items.push({ x: m, y: H - m / 2 + 2, f: 'r', s: 9, t: hdr });
    if (o.numbers && o.numbers !== 'none') {
      const t = o.numbers === 'n' ? String(i + 1) : `Page ${i + 1} of ${N}`;
      items.push({ x: (W - strw(wfs.r, t) * 9 / 1000) / 2, y: m / 2 - 4, f: 'r', s: 9, t });
    }
  });
  const d = new Doc(), res = fontRes(d, fam), K = { r: '/F1', b: '/F2', m: '/F3' };
  const specs = pages.map((items) => ({ W, H, res, content: items.map((it) => `BT ${K[it.f]} ${n2(it.s)} Tf ${n2(it.x)} ${n2(it.y)} Td ${pdfHex(u8(it.t))} Tj ET\n`).join('') }));
  const blob = await d.addPages(specs);
  return { blob, filename: 'document.pdf', text: `${N} page${N === 1 ? '' : 's'}, ${fmtSize(blob.size)}` };
}
const pdfOpts = [
  { id: 'page', label: 'Page size', type: 'select', choices: ['A4', 'Letter'], def: 'A4' },
  { id: 'orientation', label: 'Orientation', type: 'select', choices: ['portrait', 'landscape'], def: 'portrait' },
  { id: 'font', label: 'Font', type: 'select', choices: ['Helvetica', 'Times', 'Courier'], def: 'Helvetica' },
  { id: 'size', label: 'Font size (pt)', type: 'number', def: 11 },
  { id: 'margin', label: 'Margin (pt)', type: 'number', def: 56 },
  { id: 'header', label: 'Header text', type: 'text', def: '' },
  { id: 'numbers', label: 'Page numbers', type: 'select', choices: ['none', 'Page n of N', 'n'], def: 'none' },
];
const numMode = (o) => ({ ...o, numbers: o.numbers === 'Page n of N' ? 'pn' : o.numbers });

function mdInline(s) {
  return s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '$1 ($2)')
    .replace(/`([^`]+)`/g, '$1').replace(/(\*\*|__)(.+?)\1/g, '$2').replace(/~~(.+?)~~/g, '$1')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=$|[\s).,;:!?])/g, '$1$2').replace(/(^|[\s(])_([^_\s][^_]*)_(?=$|[\s).,;:!?])/g, '$1$2');
}
function mdBlocks(src, base) {
  const out = [], para = []; let cur = null, code = false;
  const flush = () => { if (cur) { out.push({ ...cur.p, t: toWin(mdInline(cur.lines.join(' '))) }); cur = null; } };
  const hs = [2, 1.6, 1.3, 1.15, 1, 1];
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) { flush(); code = !code; if (code) out.push({ t: '', f: 'm', size: base * 0.4, ind: 0 }); else out.push({ t: '', f: 'm', size: base * 0.4, ind: 0, after: base * 0.3 }); continue; }
    if (code) { out.push({ t: toWin(raw), f: 'm', size: base * 0.85, ind: 8 }); continue; }
    let m;
    if (!raw.trim()) { flush(); continue; }
    if ((m = raw.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { flush(); const sz = base * hs[m[1].length - 1]; out.push({ t: toWin(mdInline(m[2])), f: 'b', size: sz, ind: 0, before: sz * 0.7, after: sz * 0.25 }); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) { flush(); out.push({ t: '', f: 'r', size: base, ind: 0 }); continue; }
    if ((m = raw.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)/))) {
      flush(); const lvl = Math.floor(m[1].replace(/\t/g, '  ').length / 2), ord = /\d/.test(m[2]);
      cur = { lines: [m[3]], p: { f: 'r', size: base, ind: 20 + lvl * 18, bw: 16, bullet: ord ? m[2] : '\x95', before: base * 0.25 } };
      continue;
    }
    if ((m = raw.match(/^\s*>\s?(.*)/))) { if (!cur || cur.p.ind !== 18) { flush(); cur = { lines: [], p: { f: 'r', size: base, ind: 18, before: base * 0.4, after: base * 0.4 } }; } cur.lines.push(m[1]); continue; }
    if (cur) { cur.lines.push(raw.trim()); continue; }
    cur = { lines: [raw.trim()], p: { f: 'r', size: base, ind: 0, before: base * 0.5 } };
  }
  flush();
  return out;
}

// ---------- JPEG / PNG helpers for images-to-pdf ----------
function jpegInfo(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2, orient = 1;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xe1 && latin(b.subarray(i + 4, i + 10)) === 'Exif\0\0') {
      const t = i + 10, v = new DataView(b.buffer, b.byteOffset + t, Math.max(0, b.length - t)), le_ = b[t] === 0x49;
      try { const o = v.getUint32(4, le_), c = v.getUint16(o, le_); for (let k = 0; k < c; k++) if (v.getUint16(o + 2 + k * 12, le_) === 0x112) orient = v.getUint16(o + 10 + k * 12, le_); } catch { /* ignore broken EXIF */ }
    }
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9], orient };
    if (m === 0xda) return null;
    i += 2 + len;
  }
  return null;
}

// ---------- PDF reader (best-effort) ----------
const CP1252 = Array.from({ length: 256 }, (_, c) => (c >= 128 && c < 160 ? [...C1][c - 128] : String.fromCharCode(c)));
const pdfUnescape = (s) => s.replace(/\\(?:([nrtbf])|([0-7]{1,3})|(\r\n|\r|\n)|([\s\S]))/g, (m, c, o, nl, ch) => c ? { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[c] : o ? String.fromCharCode(parseInt(o, 8) & 255) : nl ? '' : ch);
function pdfText(s) {
  if (s.startsWith('\xFE\xFF')) { let o = ''; for (let i = 2; i + 1 < s.length; i += 2) o += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1)); return o; }
  return s;
}
function pdfField(body, key) {
  const m = body.match(new RegExp('/' + key + '\\s*(\\((?:\\\\[\\s\\S]|[^\\\\)])*\\)|<[0-9A-Fa-f\\s]*>)'));
  if (!m) return undefined;
  const v = m[1];
  if (v[0] === '(') return pdfText(pdfUnescape(v.slice(1, -1)));
  const h = v.slice(1, -1).replace(/\s/g, ''); let s = '';
  for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.substr(i, 2).padEnd(2, '0'), 16));
  return pdfText(s);
}
// -> {text, objs: Map(num -> {body, dict, raw?:Uint8Array, objstm?:true}), notes:[]}
async function parsePdf(bytes) {
  if (bytes.length > 150e6) throw new Error('File too large for the in-browser PDF reader (150 MB max)');
  const text = latin(bytes);
  if (!text.includes('%PDF-')) throw new Error('Not a PDF file (no %PDF- header)');
  const objs = new Map(), re = /(\d+)\s+(\d+)\s+obj\b/g, notes = []; let m;
  while ((m = re.exec(text))) {
    const start = re.lastIndex, end = text.indexOf('endobj', start); if (end < 0) break;
    let body = text.slice(start, end), dict = body, raw = null;
    const sm = body.match(/stream(\r\n|\n|\r)/);
    if (sm && /^\s*<</.test(body)) {
      const ds = sm.index; dict = body.slice(0, ds);
      const from = ds + sm[0].length, lm = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
      let to = lm && from + +lm[1] <= body.length ? from + +lm[1] : body.lastIndexOf('endstream');
      if (to < 0) to = body.length;
      if (!lm) to = body.slice(from, to).replace(/(\r\n|\n|\r)$/, '').length + from;
      raw = bytes.subarray(start + from, start + to);
    }
    objs.set(+m[1], { body, dict, raw });
    re.lastIndex = end;
  }
  for (const [num, o] of [...objs]) {
    if (o.raw && /\/Type\s*\/ObjStm/.test(o.dict)) {
      const data = await decodeStream(o);
      if (!data) { notes.push(`object stream ${num} could not be decoded`); continue; }
      const t = latin(data), first = +(o.dict.match(/\/First\s+(\d+)/)?.[1] ?? 0), nn = +(o.dict.match(/\/N\s+(\d+)/)?.[1] ?? 0);
      const h = t.slice(0, first).trim().split(/\s+/).map(Number);
      for (let i = 0; i < nn; i++) {
        const on = h[i * 2], oo = h[i * 2 + 1], oe = i + 1 < nn ? h[i * 2 + 3] : t.length - first;
        const body = t.slice(first + oo, first + oe); objs.set(on, { body, dict: body, objstm: true });
      }
    }
  }
  return { text, objs, notes };
}
async function decodeStream(o) {
  if (!o.raw) return null;
  const f = o.dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/)?.[1];
  if (!f) return o.raw;
  if (f.replace(/[\[\]\s]/g, '') !== '/FlateDecode') return null;
  try { return await zInflate(o.raw); } catch { return null; }
}
const refOf = (s) => { const m = s?.match(/(\d+)\s+\d+\s+R/); return m ? +m[1] : null; };
function pageList(objs, text) {
  const roots = [...text.matchAll(/\/Root\s+(\d+)\s+\d+\s+R/g)];
  let root = roots.length ? +roots[roots.length - 1][1] : [...objs].find(([, o]) => /\/Type\s*\/Catalog/.test(o.body))?.[0];
  const pages = [], seen = new Set();
  const walk = (n, depth) => {
    const o = objs.get(n); if (!o || seen.has(n) || depth > 30) return; seen.add(n);
    if (/\/Type\s*\/Pages(?![A-Za-z])/.test(o.dict) || /\/Kids/.test(o.dict)) {
      const kids = o.dict.match(/\/Kids\s*\[([^\]]*)\]/)?.[1] || '';
      for (const k of kids.matchAll(/(\d+)\s+\d+\s+R/g)) walk(+k[1], depth + 1);
    } else pages.push(n);
  };
  const cat = objs.get(root); const pr = cat && refOf(cat.body.match(/\/Pages\s+\d+\s+\d+\s+R/)?.[0]);
  if (pr) walk(pr, 0);
  if (!pages.length) for (const [n, o] of [...objs].sort((a, b) => a[0] - b[0])) if (/\/Type\s*\/Page(?![A-Za-z])/.test(o.dict)) pages.push(n);
  return pages;
}

// content stream -> text. map: byte -> char
function contentText(s) {
  let out = '', i = 0, st = [], arr = null, lastY = null;
  const n = s.length, WS = /[\s\0]/, DL = '()<>[]{}/%';
  const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
  const sp = () => { if (out && !/\s$/.test(out)) out += ' '; };
  const dec = (r) => r.replace(/[\s\S]/g, (c) => CP1252[c.charCodeAt(0) & 255]);
  const push = (v) => (arr || st).push(v);
  while (i < n) {
    const c = s[i];
    if (WS.test(c)) { i++; continue; }
    if (c === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
    if (c === '(') {
      let d = 1, j = i + 1, r = '';
      while (j < n) {
        const ch = s[j];
        if (ch === '\\') {
          const e = s[j + 1]; j += 2;
          if (e === 'n') r += '\n'; else if (e === 'r') r += '\r'; else if (e === 't') r += '\t'; else if (e === 'b') r += '\b'; else if (e === 'f') r += '\f';
          else if (e >= '0' && e <= '7') { let o = e; while (o.length < 3 && s[j] >= '0' && s[j] <= '7') o += s[j++]; r += String.fromCharCode(parseInt(o, 8) & 255); }
          else if (e === '\r') { if (s[j] === '\n') j++; } else if (e === '\n') { /* continuation */ } else r += e;
        } else if (ch === '(') { d++; r += ch; j++; } else if (ch === ')') { d--; j++; if (!d) break; r += ch; } else { r += ch; j++; }
      }
      i = j; push({ s: r }); continue;
    }
    if (c === '<') {
      if (s[i + 1] === '<') { i += 2; continue; }
      const e = s.indexOf('>', i), h = s.slice(i + 1, e < 0 ? n : e).replace(/\s/g, ''); let r = '';
      for (let k = 0; k < h.length; k += 2) r += String.fromCharCode(parseInt(h.substr(k, 2).padEnd(2, '0'), 16));
      i = e < 0 ? n : e + 1; push({ s: r }); continue;
    }
    if (c === '>') { i++; continue; }
    if (c === '[') { arr = []; i++; continue; }
    if (c === ']') { if (arr) { st.push({ a: arr }); arr = null; } i++; continue; }
    if (c === '{' || c === '}' || c === ')') { i++; continue; }
    let j = i + 1; while (j < n && !WS.test(s[j]) && !DL.includes(s[j])) j++;
    const tok = s.slice(i, j); i = j;
    if (c === '/') { push({ n: tok }); continue; }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) { push(parseFloat(tok)); continue; }
    const last = st[st.length - 1];
    switch (tok) {
      case 'Tj': if (last?.s != null) out += dec(last.s); break;
      case "'": case '"': nl(); if (last?.s != null) out += dec(last.s); break;
      case 'TJ': if (last?.a) for (const e of last.a) { if (e.s != null) out += dec(e.s); else if (typeof e === 'number' && e < -250) sp(); } break;
      case 'T*': nl(); break;
      case 'Td': case 'TD': if (st[st.length - 1] !== 0) nl(); else if (st[st.length - 2] > 0) sp(); break;
      case 'Tm': if (lastY !== null && st[5] !== lastY) nl(); lastY = st[5]; break;
      case 'ET': nl(); break;
      case 'ID': { const e = s.slice(i).search(/\sEI(?=\s|$)/); i = e < 0 ? n : i + e + 3; break; }
      default: break;
    }
    st = [];
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- tool definitions ----------
const ZIP = 'Archives & Spreadsheets';
const sampleJson = '[{"name":"Alice","age":30,"active":true,"city":"Ghent"},{"name":"Bob","age":25,"active":false,"city":"Antwerp"},{"name":"Chloé","age":41,"active":true,"city":null}]';
const sampleCsv = 'name,age,city,note\nAlice,30,Ghent,"likes ""quotes"", commas"\nBob,25,Antwerp,007\nChloé,41.5,Brussels,';
const sampleMd = '# Release notes\n\nThis is a **simple** markdown document with a [link](https://example.com) and `inline code`.\n\n## Features\n\n- Headings, paragraphs and lists\n- Nested items:\n  - second level\n1. Ordered item\n2. Another one\n\n> A quote that wraps over the line width when it is long enough to need wrapping onto a second line.\n\n```\nfunction hi() {\n  return "code block";\n}\n```\n\nThe end.';
const sampleText = 'Hello PDF world.\n\nThis text is wrapped automatically at the page margins, so long paragraphs flow across lines and pages without any manual line breaks. Accents work too: café, Ünïcödé, “quotes”, €10, – dashes.\n\n\tIndented with a tab.';

export default [
  // ===== ZIP =====
  {
    id: 'zip-creator', cat: ZIP, title: 'ZIP Creator', inputs: 0,
    desc: 'Pack several files into a .zip in your browser (deflate, stored fallback; max 4 GB, no encryption).',
    file: { accept: '*/*', multiple: true },
    opts: [{ id: 'compress', label: 'Compress (deflate)', type: 'checkbox', def: true }, { id: 'name', label: 'Archive name', type: 'text', def: 'archive.zip' }],
    run: async (_i, o, files) => {
      if (!files?.length) throw new Error('Choose one or more files first');
      const seen = new Map(), entries = [];
      for (const f of files) {
        let name = (f.webkitRelativePath || f.name).replace(/^\/+/, '');
        if (seen.has(name)) { const k = seen.get(name) + 1; seen.set(name, k); name = name.replace(/(\.[^./]*)?$/, ` (${k})$1`); } else seen.set(name, 1);
        entries.push({ name, data: await readBytes(f), date: f.lastModified });
      }
      const zip = await zipBuild(entries, o.compress !== false);
      const filename = (o.name || 'archive.zip').replace(/[\\/]/g, '_');
      return { blob: new Blob([zip], { type: 'application/zip' }), filename: /\.zip$/i.test(filename) ? filename : filename + '.zip', text: `${entries.length} file(s) -> ${fmtSize(zip.length)} (${fmtSize(entries.reduce((a, e) => a + e.data.length, 0))} before compression)` };
    },
  },
  {
    id: 'zip-extractor', cat: ZIP, title: 'ZIP Extractor', inputs: 0,
    desc: 'Open a .zip and download its files one by one. Stored + deflate entries only; ZIP64 and encrypted entries are reported as unsupported.',
    file: { accept: '.zip,application/zip' },
    run: async (_i, _o, files) => {
      const [b] = await openZip(files), { entries, comment } = zipRead(b);
      if (entries.reduce((a, e) => a + e.us, 0) > 1.5e9) throw new Error('Archive expands to more than 1.5 GB; refusing to extract in the browser');
      const lines = [], blobs = []; let skipped = 0;
      for (const e of entries) {
        if (e.isDir) { lines.push(`[dir]  ${e.name}`); continue; }
        const bad = unsupported(e);
        if (bad) { lines.push(`[SKIP] ${e.name}: ${bad}`); skipped++; continue; }
        if (blobs.length >= 300) { lines.push(`[more] ${e.name} (download list capped at 300 files)`); continue; }
        try { const d = await zipData(b, e); blobs.push(new File([d], e.name.replace(/[\\/]+/g, '_').replace(/^\.+/, '_') || 'file', { type: 'application/octet-stream' })); lines.push(`${fmtSize(d.length).padStart(10)}  ${e.name}`); }
        catch (err) { lines.push(`[FAIL] ${err.message}`); skipped++; }
      }
      return { text: `${entries.length} entries, ${blobs.length} extracted${skipped ? `, ${skipped} skipped` : ''}${comment ? `\nComment: ${comment}` : ''}\n\n${lines.join('\n')}`, blob: blobs };
    },
  },
  {
    id: 'zip-inspector', cat: ZIP, title: 'ZIP Inspector', inputs: 0,
    desc: 'List the contents of a .zip (names, sizes, method, CRC, date) without extracting anything.',
    file: { accept: '.zip,application/zip' },
    run: async (_i, _o, files) => {
      const [b] = await openZip(files), { entries, comment } = zipRead(b);
      let us = 0, cs = 0;
      const rows = entries.map((e) => {
        us += e.us; cs += e.cs;
        const ratio = e.us ? Math.round((1 - e.cs / e.us) * 100) + '%' : '-';
        return [e.name, e.isDir ? 'dir' : e.zip64 ? 'zip64' : METHODS[e.method] || 'method ' + e.method, e.us, e.cs, ratio, e.crc.toString(16).padStart(8, '0'), dosToStr(e.time, e.date), e.flags & 1 ? 'encrypted' : ''];
      });
      const head = ['name', 'method', 'size', 'packed', 'saved', 'crc32', 'modified', 'flags'];
      return `${entries.length} entries, ${fmtSize(us)} uncompressed, ${fmtSize(cs)} packed, archive ${fmtSize(b.length)}${comment ? `\nComment: ${comment}` : ''}\n\n` + [head, ...rows].map((r) => r.join('\t')).join('\n');
    },
  },
  // ===== XLSX =====
  {
    id: 'json-to-xlsx', cat: ZIP, title: 'JSON to XLSX', desc: 'Convert a JSON array of objects (or arrays) to an Excel .xlsx file with a bold, frozen header row and typed numbers.',
    inputs: 1, labels: ['JSON'], sample: sampleJson,
    opts: [{ id: 'header', label: 'Bold header row', type: 'checkbox', def: true }, { id: 'sheet', label: 'Sheet name', type: 'text', def: 'Sheet1' }],
    run: async ([src], o) => {
      let data; try { data = JSON.parse(src); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
      const rows = jsonRows(data), blob = await xlsxBuild(rows, { header: o.header !== false, sheetName: o.sheet });
      return { blob, filename: 'data.xlsx', text: `${rows.length - 1} data row(s) x ${rows[0].length} column(s), ${fmtSize(blob.size)}` };
    },
  },
  {
    id: 'csv-to-xlsx', cat: ZIP, title: 'CSV to XLSX', desc: 'Convert CSV text to an Excel .xlsx file. Numbers become numeric cells (leading-zero values like 007 stay text).',
    inputs: 1, labels: ['CSV'], sample: sampleCsv,
    opts: [
      { id: 'delim', label: 'Delimiter', type: 'select', choices: ['auto', ',', ';', 'tab', '|'], def: 'auto' },
      { id: 'numbers', label: 'Detect numbers', type: 'checkbox', def: true },
      { id: 'header', label: 'Bold header row', type: 'checkbox', def: true },
      { id: 'sheet', label: 'Sheet name', type: 'text', def: 'Sheet1' },
    ],
    run: async ([src], o) => {
      if (!src.trim()) throw new Error('Empty input');
      let d = o.delim === 'tab' ? '\t' : o.delim;
      if (!d || d === 'auto') { const first = src.split('\n')[0]; d = [',', ';', '\t', '|'].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0]; }
      const rows = parseCsv(src, d).map((r) => r.map((v) => (o.numbers !== false && NUM.test(v) && v.replace(/\D/g, '').length <= 15 && isFinite(+v) ? +v : v)));
      const blob = await xlsxBuild(rows, { header: o.header !== false, sheetName: o.sheet });
      return { blob, filename: 'data.xlsx', text: `${rows.length} row(s) x ${Math.max(...rows.map((r) => r.length))} column(s), delimiter ${JSON.stringify(d)}, ${fmtSize(blob.size)}` };
    },
  },
  {
    id: 'xlsx-viewer', cat: ZIP, title: 'XLSX to CSV Viewer', inputs: 0,
    desc: 'Read an .xlsx in your browser: lists sheet names and prints one sheet as CSV (cached formula values; dates show as serial numbers).',
    file: { accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    opts: [{ id: 'sheet', label: 'Sheet number', type: 'number', def: 1 }, { id: 'list', label: 'Prefix with sheet list (# lines)', type: 'checkbox', def: true }],
    run: async (_i, o, files) => {
      const [b] = await openZip(files), { entries } = zipRead(b), by = new Map(entries.map((e) => [e.name, e]));
      const get = async (n) => { const e = by.get(n); return e ? new TextDecoder().decode(await zipData(b, e)) : null; };
      const wb = await get('xl/workbook.xml'); if (wb == null) throw new Error('Not an .xlsx workbook (xl/workbook.xml missing)');
      const rels = new Map(); for (const t of (await get('xl/_rels/workbook.xml.rels') || '').match(/<Relationship\b[^>]*>/g) || []) rels.set(attr(t, 'Id'), attr(t, 'Target'));
      const sheets = (wb.match(/<sheet\b[^>]*>/g) || []).map((t) => ({ name: attr(t, 'name'), rid: attr(t, 'r:id') }));
      if (!sheets.length) throw new Error('Workbook has no sheets');
      const idx = Math.min(sheets.length, Math.max(1, parseInt(o.sheet, 10) || 1)) - 1;
      let tgt = rels.get(sheets[idx].rid) || `worksheets/sheet${idx + 1}.xml`;
      tgt = tgt.startsWith('/') ? tgt.slice(1) : 'xl/' + tgt;
      const sx = await get(tgt); if (sx == null) throw new Error(`Sheet part ${tgt} not found`);
      const ss = []; const sst = await get('xl/sharedStrings.xml');
      if (sst) for (const si of sst.match(/<si\b[^>]*?(?:\/>|>[\s\S]*?<\/si>)/g) || []) ss.push(xunesc([...si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)].map((m) => m[1] ?? '').join('')));
      const grid = []; let rn = 0;
      for (const rm of sx.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const r = parseInt(attr(rm[1], 'r'), 10) || rn + 1; rn = r; const row = grid[r - 1] = [];
        let cn = 0;
        for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ref = attr(cm[1], 'r'), t = attr(cm[1], 't'), inner = cm[2] || '', ci = ref ? colIndex(ref) : cn; cn = ci + 1;
          const v = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
          let val = '';
          if (t === 'inlineStr') val = xunesc([...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
          else if (v != null) val = t === 's' ? ss[+v] ?? '' : t === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : xunesc(v);
          row[ci] = val;
        }
      }
      const width = Math.max(0, ...grid.map((r) => (r ? r.length : 0)));
      const csv = Array.from(grid, (r) => Array.from({ length: width }, (_, c) => csvQuote(r?.[c] ?? '')).join(',')).join('\n');
      const head = o.list !== false ? sheets.map((s, i) => `# sheet ${i + 1}${i === idx ? ' (shown)' : ''}: ${s.name}`).join('\n') + '\n' : '';
      return head + csv;
    },
  },
  // ===== bcrypt =====
  {
    id: 'bcrypt-generator', cat: 'Hashing – bcrypt', title: 'Bcrypt Hash Generator',
    desc: 'Hash passwords with bcrypt ($2a/$2b, cost 4-14) entirely in your browser. One password per line. Only the first 72 bytes count (bcrypt limit). Cost 12 takes a second or so.',
    inputs: 1, labels: ['Password(s), one per line'], sample: 'correct horse battery staple',
    opts: [
      { id: 'cost', label: 'Cost (rounds = 2^cost)', type: 'select', choices: ['4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'], def: '10' },
      { id: 'ver', label: 'Prefix', type: 'select', choices: ['2b', '2a'], def: '2b' },
      { id: 'salt', label: 'Fixed salt (22 chars, optional; testing only)', type: 'text', def: '' },
    ],
    run: async ([src], o) => {
      const cost = parseInt(o.cost, 10) || 10;
      if (cost < 4 || cost > 14) throw new Error('Cost must be 4-14');
      const pws = src.replace(/\r/g, '').split('\n').filter((l) => l !== '');
      if (!pws.length) throw new Error('Enter a password');
      if (o.salt && !/^[./A-Za-z0-9]{22}$/.test(o.salt)) throw new Error('Salt must be exactly 22 characters from ./A-Za-z0-9');
      const out = [];
      for (const pw of pws) out.push(await bcryptHash(pw, cost, o.ver === '2a' ? '2a' : '2b', o.salt || randSalt()));
      return out.join('\n');
    },
  },
  {
    id: 'bcrypt-verifier', cat: 'Hashing – bcrypt', title: 'Bcrypt Hash Verifier',
    desc: 'Check a password against a bcrypt hash ($2a/$2b/$2y, cost up to 16). Runs locally; nothing is sent anywhere.',
    inputs: 2, labels: ['Password', 'Bcrypt hash'], sample: 'U*U', sample2: '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW',
    run: async ([pw, hash]) => {
      const m = hash.trim().match(/^\$(2[aby])\$(\d{2})\$([./A-Za-z0-9]{22})([./A-Za-z0-9]{31})$/);
      if (!m) throw new Error('Not a valid bcrypt hash (expected $2b$12$ + 53 characters)');
      const cost = +m[2]; if (cost < 4 || cost > 16) throw new Error('Cost out of range (4-16)');
      const got = await bcryptHash(pw.replace(/\r?\n$/, ''), cost, m[1], m[3]);
      let diff = 0; const a = got.slice(-31), b = m[4]; for (let i = 0; i < 31; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
      return diff === 0 ? `MATCH - the password matches this hash (version $${m[1]}$, cost ${cost}).` : `NO MATCH - the password does not match this hash (cost ${cost}).`;
    },
  },
  // ===== PDF writers =====
  {
    id: 'text-to-pdf', cat: 'PDF', title: 'Text to PDF', inputs: 1, labels: ['Text'], sample: sampleText,
    desc: 'Turn plain text into a multi-page PDF (A4/Letter, standard Helvetica/Times/Courier, WinAnsi characters, optional header and page numbers).',
    opts: pdfOpts,
    run: async ([src], o) => {
      if (!src.trim()) throw new Error('Enter some text');
      const sz = clamp(o.size, 6, 48, 11), blocks = toWin(src).split('\n').map((t) => ({ t, f: 'r', size: sz, ind: 0 }));
      return renderText(blocks, numMode(o));
    },
  },
  {
    id: 'markdown-to-pdf', cat: 'PDF', title: 'Markdown to PDF', inputs: 1, labels: ['Markdown'], sample: sampleMd,
    desc: 'Render a Markdown subset (headings, paragraphs, lists, quotes, fenced code) to a text-only PDF. Inline emphasis is stripped; no images or tables.',
    opts: pdfOpts.filter((x) => x.id !== 'font').concat([{ id: 'font', label: 'Font', type: 'select', choices: ['Helvetica', 'Times'], def: 'Helvetica' }]),
    run: async ([src], o) => {
      if (!src.trim()) throw new Error('Enter some Markdown');
      return renderText(mdBlocks(src, clamp(o.size, 6, 48, 11)), numMode(o));
    },
  },
  {
    id: 'images-to-pdf', cat: 'PDF', title: 'Images to PDF', inputs: 0, dom: true,
    desc: 'Combine images into one PDF, one per page. JPEGs are embedded untouched; PNG/WebP/GIF are re-encoded (PNG transparency can be kept losslessly).',
    file: { accept: 'image/*', multiple: true },
    opts: [
      { id: 'page', label: 'Page size', type: 'select', choices: ['A4', 'Letter', 'Fit image'], def: 'A4' },
      { id: 'margin', label: 'Margin (pt, fixed sizes)', type: 'number', def: 24 },
      { id: 'alpha', label: 'Keep transparency (lossless, larger)', type: 'checkbox', def: true },
      { id: 'quality', label: 'JPEG quality for re-encoding (0.5-1)', type: 'number', def: 0.9 },
    ],
    run: async (_i, o, files) => {
      if (!files?.length) throw new Error('Choose one or more images first');
      const d = new Doc(), specs = [], q = clamp(o.quality, 0.5, 1, 0.9), notes = [];
      for (const f of files) {
        let bytes = await readBytes(f), info = jpegInfo(bytes), w, h, xo;
        if (info && info.orient === 1 && (info.comps === 1 || info.comps === 3)) {
          w = info.w; h = info.h;
          xo = d.add({ dict: `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /${info.comps === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode`, data: bytes });
        } else {
          let bmp; try { bmp = await createImageBitmap(f); } catch { throw new Error(`${f.name}: cannot decode this image`); }
          w = bmp.width; h = bmp.height;
          if (w * h > 120e6) throw new Error(`${f.name}: image too large (${w}x${h})`);
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0);
          let done = false;
          if (o.alpha !== false && !/jpe?g/i.test(f.type)) {
            const px = cx.getImageData(0, 0, w, h).data, n = w * h; let hasA = false;
            for (let i = 3; i < px.length; i += 4) if (px[i] !== 255) { hasA = true; break; }
            if (hasA) {
              const rgb = new Uint8Array(n * 3), a = new Uint8Array(n);
              for (let i = 0, j = 0; i < n; i++, j += 3) { rgb[j] = px[i * 4]; rgb[j + 1] = px[i * 4 + 1]; rgb[j + 2] = px[i * 4 + 2]; a[i] = px[i * 4 + 3]; }
              const sm = d.add({ dict: `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, data: await zDeflate(a) });
              xo = d.add({ dict: `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask ${sm} 0 R`, data: await zDeflate(rgb) });
              done = true;
            }
          }
          if (!done) {
            const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
            const x2 = c2.getContext('2d'); x2.fillStyle = '#fff'; x2.fillRect(0, 0, w, h); x2.drawImage(bmp, 0, 0);
            const jb = await new Promise((r) => c2.toBlob(r, 'image/jpeg', q));
            if (!jb) throw new Error(`${f.name}: JPEG encoding failed`);
            xo = d.add({ dict: `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, data: new Uint8Array(await jb.arrayBuffer()) });
          }
          bmp.close?.();
        }
        let W, H, m = 0;
        if (o.page === 'Fit image') { W = w * 0.75; H = h * 0.75; }
        else { [W, H] = PAGE[o.page] || PAGE.A4; if (w > h) [W, H] = [H, W]; m = clamp(o.margin, 0, 144, 24); }
        const s = Math.min((W - 2 * m) / w, (H - 2 * m) / h), dw = w * s, dh = h * s;
        specs.push({ W, H, res: `<< /XObject << /Im0 ${xo} 0 R >> >>`, content: `q ${n2(dw)} 0 0 ${n2(dh)} ${n2((W - dw) / 2)} ${n2((H - dh) / 2)} cm /Im0 Do Q\n` });
      }
      const blob = await d.addPages(specs);
      return { blob, filename: 'images.pdf', text: `${specs.length} page(s), ${fmtSize(blob.size)}${notes.join('')}` };
    },
  },
  // ===== PDF readers =====
  {
    id: 'pdf-info', cat: 'PDF', title: 'PDF Info', inputs: 0,
    desc: 'Inspect a plain, non-encrypted PDF: version, page count, Info fields, producer, encryption, object streams. Best effort (regex based; no repair of broken files).',
    file: { accept: '.pdf,application/pdf' },
    run: async (_i, _o, files) => {
      const f = one(files, 'a PDF file'), bytes = await readBytes(f), { text, objs, notes } = await parsePdf(bytes);
      const ver = text.match(/%PDF-(\d\.\d)/)?.[1] ?? '?';
      const enc_ = /\/Encrypt\s*(?:<<|\d+\s+\d+\s+R)/.test(text);
      const scanned = [...objs.values()].filter((o) => /\/Type\s*\/Page(?![A-Za-z])/.test(o.dict)).length;
      const tree = pageList(objs, text);
      const countKey = [...objs.values()].map((o) => +(o.dict.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/)?.[1] ?? 0)).sort((a, b) => b - a)[0] || 0;
      const infos = [...text.matchAll(/\/Info\s+(\d+)\s+\d+\s+R/g)], inf = infos.length ? objs.get(+infos[infos.length - 1][1]) : null;
      const objstm = [...objs.values()].some((o) => o.raw && /\/Type\s*\/ObjStm/.test(o.dict)), xrefStream = [...objs.values()].some((o) => o.raw && /\/Type\s*\/XRef/.test(o.dict));
      const fonts = [...new Set([...objs.values()].map((o) => o.body.match(/\/Type\s*\/Font[\s\S]*?\/BaseFont\s*\/([^\s/<>\[\]()]+)/)?.[1]).filter(Boolean))];
      const mb = [...objs.values()].find((o) => /\/MediaBox/.test(o.dict))?.dict.match(/\/MediaBox\s*\[([^\]]*)\]/)?.[1].trim().split(/\s+/).map(Number);
      const L = [`File: ${f.name} (${fmtSize(bytes.length)})`, `PDF version: ${ver}${/\/Linearized/.test(text.slice(0, 2048)) ? ' (linearized)' : ''}`,
        `Pages: ${tree.length || scanned} (page-tree walk ${tree.length}, /Type /Page objects ${scanned}${countKey ? `, root /Count ${countKey}` : ''})`,
        `Objects found: ${objs.size}`, `Encrypted: ${enc_ ? 'YES (content and Info strings cannot be read here)' : 'no'}`,
        `Object streams (/ObjStm): ${objstm ? 'yes' : 'no'}; cross-reference streams: ${xrefStream ? 'yes' : 'no'}`];
      if (mb && mb.length === 4) L.push(`First MediaBox: ${mb.join(' ')} pt (${Math.round((mb[2] - mb[0]) / 72 * 25.4)} x ${Math.round((mb[3] - mb[1]) / 72 * 25.4)} mm)`);
      if (fonts.length) L.push(`Fonts: ${fonts.slice(0, 20).join(', ')}${fonts.length > 20 ? ', ...' : ''}`);
      L.push('', 'Info dictionary:');
      if (inf && !enc_) for (const k of ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate']) L.push(`  ${k}: ${pdfField(inf.body, k) ?? '-'}`);
      else L.push(inf ? '  (encrypted)' : '  (none found)');
      L.push(...notes.map((n) => 'Note: ' + n));
      L.push('', 'Ceiling: regex-based reader for plain PDFs. Encrypted files, broken xref tables and incremental-update edge cases are not handled; deleted objects may still be counted.');
      return L.join('\n');
    },
  },
  {
    id: 'pdf-text-extract-simple', cat: 'PDF', title: 'PDF Text Extractor (simple)', inputs: 0,
    desc: 'Best-effort text from PDFs whose content streams are uncompressed or Flate-compressed and use simple fonts. Will NOT work for subset-encoded / Type0 / Identity-H fonts (most Word, Chrome, LaTeX output) or scanned pages.',
    file: { accept: '.pdf,application/pdf' },
    opts: [{ id: 'sep', label: 'Page separators', type: 'checkbox', def: true }],
    run: async (_i, o, files) => {
      const f = one(files, 'a PDF file'), { text, objs } = await parsePdf(await readBytes(f));
      if (/\/Encrypt\s*(?:<<|\d+\s+\d+\s+R)/.test(text)) throw new Error('This PDF is encrypted; text cannot be extracted here');
      const pages = pageList(objs, text); if (!pages.length) throw new Error('No pages found in this PDF');
      const out = []; let empty = 0, skipped = 0;
      for (let p = 0; p < pages.length; p++) {
        const pg = objs.get(pages[p]), cm = pg.dict.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/)?.[1] || '';
        const refs = [...cm.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => +m[1]), parts = [];
        for (const r of refs) { const so = objs.get(r), d = so && await decodeStream(so); if (d) parts.push(latin(d)); else if (so?.raw) skipped++; }
        const t = contentText(parts.join('\n'));
        if (!t) empty++;
        out.push(o.sep !== false ? `--- page ${p + 1} ---\n${t}` : t);
      }
      const type0 = [...objs.values()].some((x) => /\/Subtype\s*\/Type0/.test(x.body) || /\/Identity-H/.test(x.body));
      const warn = [];
      if (type0) warn.push('This PDF uses composite (Type0 / Identity-H) fonts: the text below, if any, is probably garbled or missing because glyph codes are not Unicode.');
      if (skipped) warn.push(`${skipped} content stream(s) use an unsupported filter and were skipped.`);
      if (empty === pages.length) warn.push('No text could be extracted (scanned/image-only PDF, or unsupported fonts).');
      return (warn.length ? warn.map((w) => 'WARNING: ' + w).join('\n') + '\n\n' : '') + out.join('\n\n');
    },
  },
];

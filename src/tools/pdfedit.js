// Structural PDF editing: hand-written reader + rewriter (no rendering). Zero dependencies, platform APIs only
// (DecompressionStream('deflate'), Blob/File). The engine is exported by name so Node scripts can drive it.
//
// How it works: the file is scanned for `N G obj ... endobj` (last definition wins, so incremental updates work and
// broken xref tables don't matter), /Type /ObjStm members are inflated and parsed into plain objects at the position
// of their container, /Root comes from the last trailer or xref-stream dict that has one (else the last /Type /Catalog),
// and the /Pages tree is walked with inheritance of /Resources /MediaBox /CropBox /Rotate. Output is a fresh file:
// pages are deep-copied with everything reachable (stream bytes are copied raw, /Filter untouched), renumbered, with a
// new catalog/pages tree/classic xref table.
//
// Ceilings (see also the report of the author):
//  - Encrypted PDFs (/Encrypt) are refused. Streams are only decoded for ObjStm and for counting q/Q in page content:
//    FlateDecode (+ PNG/TIFF predictors) only; other filters on an ObjStm make that ObjStm unreadable (reported).
//  - Document-level structure is dropped: outlines/bookmarks, named destinations, AcroForm (Widget annotations are
//    removed), page labels, tagged structure, optional-content config, JavaScript. Link annotations keep URIs only.
//  - Stream /Length is found by the stated length if followed by `endstream`, else by searching `endstream`.
//  - Page numbers / watermark use the standard Helvetica fonts with WinAnsi (other characters become '?').

const enc = new TextEncoder();
const u8 = (s) => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; };
const latin = (b) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };
const concat = (arrs) => { let n = 0; for (const a of arrs) n += a.length; const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; };
const zInflate = async (d) => new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB');

// ---------- object model ----------
class Name { constructor(n) { this.n = n; } }
class Ref { constructor(n) { this.n = n; } }
class Str { constructor(b) { this.b = b; } }
class Stream { constructor(dict, data) { this.dict = dict; this.data = data; } }
class Kw { constructor(k) { this.k = k; } }
const isDict = (v) => v != null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const nm = (s) => new Name(s);
const WS = '\0\t\n\f\r ', DELIM = '()<>[]{}/%';

function parseValue(s, i) {
  for (;;) { // skip whitespace and comments
    while (i < s.length && WS.includes(s[i])) i++;
    if (s[i] === '%') { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; } else break;
  }
  const c = s[i];
  if (c === undefined) throw new Error('unexpected end');
  if (c === '<' && s[i + 1] === '<') {
    const d = {}; i += 2;
    for (;;) {
      while (i < s.length && WS.includes(s[i])) i++;
      if (s[i] === '>' && s[i + 1] === '>') return [d, i + 2];
      if (i >= s.length) throw new Error('unterminated dict');
      let k; [k, i] = parseValue(s, i);
      if (!(k instanceof Name)) { if (k instanceof Kw) return [d, i]; continue; }
      let v; [v, i] = parseValue(s, i);
      if (v instanceof Kw) { if (v.k === 'endobj' || v.k === 'stream') return [d, i - v.k.length]; continue; }
      d[k.n] = v;
    }
  }
  if (c === '<') {
    const e = s.indexOf('>', i); if (e < 0) throw new Error('bad hex');
    let h = s.slice(i + 1, e).replace(/[^0-9a-fA-F]/g, ''); if (h.length & 1) h += '0';
    const b = new Uint8Array(h.length / 2); for (let k = 0; k < b.length; k++) b[k] = parseInt(h.substr(k * 2, 2), 16);
    return [new Str(b), e + 1];
  }
  if (c === '(') {
    const out = []; let depth = 1; i++;
    while (i < s.length && depth) {
      let ch = s[i++];
      if (ch === '\\') {
        ch = s[i++];
        if (ch === 'n') out.push(10); else if (ch === 'r') out.push(13); else if (ch === 't') out.push(9); else if (ch === 'b') out.push(8); else if (ch === 'f') out.push(12);
        else if (ch >= '0' && ch <= '7') { let o = ch; while (o.length < 3 && s[i] >= '0' && s[i] <= '7') o += s[i++]; out.push(parseInt(o, 8) & 255); }
        else if (ch === '\r') { if (s[i] === '\n') i++; } else if (ch === '\n') { /* continuation */ } else out.push(ch.charCodeAt(0));
      } else if (ch === '(') { depth++; out.push(40); } else if (ch === ')') { if (--depth) out.push(41); }
      else if (ch === '\r') { if (s[i] === '\n') i++; out.push(10); } else out.push(ch.charCodeAt(0) & 255);
    }
    return [new Str(Uint8Array.from(out)), i];
  }
  if (c === '[') {
    const a = []; i++;
    for (;;) {
      while (i < s.length && WS.includes(s[i])) i++;
      if (s[i] === ']') return [a, i + 1];
      if (i >= s.length) throw new Error('unterminated array');
      let v; [v, i] = parseValue(s, i);
      if (v instanceof Kw) { if (v.k === 'endobj') return [a, i - 6]; continue; }
      a.push(v);
    }
  }
  if (c === '/') {
    let j = i + 1; while (j < s.length && !WS.includes(s[j]) && !DELIM.includes(s[j])) j++;
    return [new Name(s.slice(i + 1, j).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))), j];
  }
  if (c === ']' || c === '>' || c === ')' || c === '}' || c === '{') return [new Kw(c), i + 1];
  const num = /[+-]?(?:\d+\.?\d*|\.\d+)/y; num.lastIndex = i;
  const m = num.exec(s);
  if (m) {
    let j = num.lastIndex;
    if (/^[+-]?\d+$/.test(m[0])) {
      const r = /[ \t\r\n\f\0]+(\d+)[ \t\r\n\f\0]+R(?![A-Za-z0-9])/y; r.lastIndex = j;
      const rm = r.exec(s); if (rm && m[0][0] !== '-') return [new Ref(+m[0]), r.lastIndex];
    }
    return [parseFloat(m[0]), j];
  }
  let j = i; while (j < s.length && !WS.includes(s[j]) && !DELIM.includes(s[j])) j++;
  if (j === i) j++;
  const k = s.slice(i, j);
  return [k === 'true' ? true : k === 'false' ? false : k === 'null' ? null : new Kw(k), j];
}

// ---------- stream decoding (Flate + predictors) ----------
async function decodeStream(d, st) {
  let f = d.r(st.dict.Filter), p = d.r(st.dict.DecodeParms ?? st.dict.DP);
  f = f == null ? [] : Array.isArray(f) ? f.map((x) => d.r(x)) : [f];
  p = Array.isArray(p) ? p.map((x) => d.r(x)) : [p];
  let data = st.data;
  for (let k = 0; k < f.length; k++) {
    const n = f[k]?.n;
    if (n !== 'FlateDecode' && n !== 'Fl') throw new Error('unsupported filter ' + n);
    data = await zInflate(data);
    const parm = d.r(p[k]);
    if (isDict(parm)) data = unpredict(data, d.num(parm.Predictor, 1), d.num(parm.Colors, 1), d.num(parm.BitsPerComponent, 8), d.num(parm.Columns, 1));
  }
  return data;
}
function unpredict(data, pred, colors, bpc, cols) {
  if (pred < 2) return data;
  const bpp = Math.max(1, (colors * bpc) >> 3), row = (colors * bpc * cols + 7) >> 3;
  if (pred === 2) {
    if (bpc !== 8) throw new Error('TIFF predictor needs 8-bit components');
    const o = Uint8Array.from(data);
    for (let r = 0; r + row <= o.length; r += row) for (let x = bpp; x < row; x++) o[r + x] = (o[r + x] + o[r + x - bpp]) & 255;
    return o;
  }
  const n = Math.ceil(data.length / (row + 1)), o = new Uint8Array(n * row);
  for (let r = 0; r < n; r++) {
    const ft = data[r * (row + 1)], src = r * (row + 1) + 1, dst = r * row;
    for (let x = 0; x < row; x++) {
      const v = data[src + x] ?? 0, a = x >= bpp ? o[dst + x - bpp] : 0, b = r ? o[dst - row + x] : 0, c = r && x >= bpp ? o[dst - row + x - bpp] : 0;
      let q = 0;
      if (ft === 1) q = a; else if (ft === 2) q = b; else if (ft === 3) q = (a + b) >> 1;
      else if (ft === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); q = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      o[dst + x] = (v + q) & 255;
    }
  }
  return o;
}

// ---------- document ----------
export class PdfDoc {
  constructor() { this.objs = new Map(); this.notes = []; this.pages = []; this.trailer = {}; this.version = '1.4'; }
  r(v) { for (let k = 0; v instanceof Ref && k < 50; k++) v = this.objs.get(v.n) ?? null; return v instanceof Ref ? null : v; }
  dict(v) { v = this.r(v); return v instanceof Stream ? v.dict : isDict(v) ? v : null; }
  num(v, def = 0) { v = this.r(v); return typeof v === 'number' ? v : def; }
  nums(v) { v = this.r(v); return Array.isArray(v) ? v.map((x) => this.num(x, NaN)) : null; }
  box(v) { const a = this.nums(v); if (!a || a.length < 4 || a.slice(0, 4).some(isNaN)) return null; return [Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3])]; }
  // geometry of page i: user-space boxes, effective rotation, displayed size
  info(i) {
    const p = this.pages[i], g = (k) => (p.dict[k] !== undefined ? p.dict[k] : p.inh[k]);
    const media = this.box(g('MediaBox')) || [0, 0, 612, 792];
    let crop = this.box(g('CropBox')) || media;
    const vis = [Math.max(media[0], crop[0]), Math.max(media[1], crop[1]), Math.min(media[2], crop[2]), Math.min(media[3], crop[3])];
    if (vis[2] <= vis[0] || vis[3] <= vis[1]) vis.splice(0, 4, ...media);
    const rot = ((Math.round(this.num(g('Rotate'), 0) / 90) * 90) % 360 + 360) % 360, sw = rot === 90 || rot === 270;
    const uw = vis[2] - vis[0], uh = vis[3] - vis[1];
    return { media, crop, vis, rot, w: sw ? uh : uw, h: sw ? uw : uh };
  }
}

export async function openPdf(bytes, name = 'file') {
  const d = new PdfDoc(), s = latin(bytes);
  const hv = /%PDF-(\d\.\d)/.exec(s.slice(0, 1024)); if (hv) d.version = hv[1];
  if (!hv && !/\bobj\b/.test(s)) throw new Error(`${name} does not look like a PDF`);
  const entries = [], trailers = [], re = /(\d+)[ \t\r\n\f\0]+(\d+)[ \t\r\n\f\0]+obj(?![A-Za-z])/g;
  let m;
  while ((m = re.exec(s))) {
    const num = +m[1], off = m.index;
    try {
      let [v, i] = parseValue(s, re.lastIndex);
      if (v instanceof Kw) { continue; }
      if (isDict(v)) {
        let j = i; while (j < s.length && WS.includes(s[j])) j++;
        if (s.startsWith('stream', j)) {
          j += 6; if (s[j] === '\r' && s[j + 1] === '\n') j += 2; else if (s[j] === '\n' || s[j] === '\r') j++;
          let end = -1; const L = v.Length;
          if (typeof L === 'number' && L >= 0 && j + L <= s.length) { let k = j + L; while (k < s.length && WS.includes(s[k])) k++; if (s.startsWith('endstream', k)) end = j + L; }
          if (end < 0) { const e = s.indexOf('endstream', j); end = e < 0 ? s.length : e; if (s[end - 1] === '\n') end--; if (s[end - 1] === '\r') end--; }
          v = new Stream(v, bytes.subarray(j, end)); i = Math.max(i, end);
        }
        if (v instanceof Stream && v.dict.Type?.n === 'XRef') trailers.push({ off, d: v.dict });
      }
      entries.push({ num, v, off }); re.lastIndex = i;
    } catch { /* garbage that looked like an object header */ }
  }
  const tre = /trailer[ \t\r\n\f\0]*<</g;
  while ((m = tre.exec(s))) { try { const [v] = parseValue(s, m.index + 7); if (isDict(v)) trailers.push({ off: m.index, d: v }); } catch { /* ignore */ } }
  trailers.sort((a, b) => a.off - b.off);
  if (trailers.some((t) => t.d.Encrypt != null)) throw new Error(`${name} is encrypted (password-protected); encrypted PDFs are not supported`);
  // assemble the object table in file order, expanding object streams in place
  for (const e of entries) {
    d.objs.set(e.num, e.v);
    if (e.v instanceof Stream && e.v.dict.Type?.n === 'ObjStm') {
      try {
        const data = await decodeStream(d, e.v), t = latin(data), n = d.num(e.v.dict.N), first = d.num(e.v.dict.First), hdr = [];
        const nre = /\d+/g; for (let k = 0; k < n * 2; k++) { const mm = nre.exec(t.slice(0, first)); if (!mm) break; hdr.push(+mm[0]); }
        for (let k = 0; k + 1 < hdr.length; k += 2) {
          try { const [v] = parseValue(t, first + hdr[k + 1]); d.objs.set(hdr[k], v); } catch { d.notes.push(`object ${hdr[k]} in an object stream could not be parsed`); }
        }
      } catch (err) { d.notes.push(`object stream ${e.num} unreadable (${err.message})`); }
    }
  }
  for (const t of trailers) { if (t.d.Root != null) { d.trailer.Root = t.d.Root; } if (t.d.Info != null) d.trailer.Info = t.d.Info; }
  let cat = d.dict(d.trailer.Root);
  if (!cat || !cat.Pages) { // catalog scan
    cat = null;
    for (const [n, v] of d.objs) if (isDict(v) && v.Type?.n === 'Catalog' && (v.Pages || !cat)) { cat = v; d.trailer.Root = new Ref(n); }
  }
  d.catalog = cat;
  const keys = ['Resources', 'MediaBox', 'CropBox', 'Rotate'], seen = new Set();
  const walk = (node, inh, depth) => {
    const ref = node instanceof Ref ? node.n : null;
    if (ref != null) { if (seen.has(ref)) return; seen.add(ref); }
    const n = d.dict(node); if (!n || depth > 60) return;
    const kids = d.r(n.Kids);
    if (Array.isArray(kids) && n.Type?.n !== 'Page') {
      const i2 = { ...inh }; for (const k of keys) if (n[k] !== undefined) i2[k] = n[k];
      for (const k of kids) walk(k, i2, depth + 1);
    } else d.pages.push({ ref, dict: n, inh });
  };
  if (cat?.Pages) walk(cat.Pages, {}, 0);
  if (!d.pages.length) { // fallback: every /Type /Page object, inheritance via /Parent chain
    for (const [n, v] of d.objs) if (isDict(v) && v.Type?.n === 'Page') {
      const inh = {}; let p = d.dict(v.Parent);
      for (let k = 0; p && k < 50; k++) { for (const key of keys) if (p[key] !== undefined && inh[key] === undefined) inh[key] = p[key]; p = d.dict(p.Parent); }
      d.pages.push({ ref: n, dict: v, inh });
    }
    if (d.pages.length) d.notes.push('page tree missing or damaged: pages recovered by scanning');
  }
  if (!d.pages.length) throw new Error(`No pages found in ${name}`);
  return d;
}

// ---------- serialisation / building ----------
const numStr = (n) => { if (Number.isInteger(n)) return String(n); const t = String(+n.toFixed(4)); return /e/i.test(t) ? '0' : t; };
const hex = (b) => '<' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('') + '>';
function ser(v) {
  if (v == null) return 'null';
  if (v === true) return 'true'; if (v === false) return 'false';
  if (typeof v === 'number') return numStr(v);
  if (v instanceof Name) return '/' + v.n.replace(/[^!-~]|[#()<>[\]{}/%]/g, (c) => '#' + c.charCodeAt(0).toString(16).padStart(2, '0'));
  if (v instanceof Ref) return v.n + ' 0 R';
  if (v instanceof Str) return hex(v.b);
  if (Array.isArray(v)) return '[' + v.map(ser).join(' ') + ']';
  if (isDict(v)) return '<<' + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => ser(nm(k)) + ' ' + ser(x)).join(' ') + '>>';
  return 'null';
}
class Out {
  constructor() { this.objs = [null]; }
  alloc() { this.objs.push(null); return this.objs.length - 1; }
  add(v) { const n = this.alloc(); this.objs[n] = v; return n; }
  bytes(version) {
    const parts = [u8(`%PDF-${version}\n%\xE2\xE3\xCF\xD3\n`)], offs = [0]; let len = parts[0].length;
    for (let n = 1; n < this.objs.length; n++) {
      const v = this.objs[n]; offs.push(len);
      const b = v instanceof Stream
        ? concat([u8(`${n} 0 obj\n${ser({ ...v.dict, Length: v.data.length })}\nstream\n`), v.data, u8('\nendstream\nendobj\n')])
        : u8(`${n} 0 obj\n${ser(v)}\nendobj\n`);
      parts.push(b); len += b.length;
    }
    this.xrefAt = len; this.offs = offs; this.parts = parts;
    return parts;
  }
}
const SKIP = new Set(['StructParents', 'StructParent']);
function cv(d, v, ctx) {
  if (v instanceof Ref) {
    const t = d.objs.get(v.n); if (t == null) return null;
    if (isDict(t) && /^(Page|Pages|Catalog)$/.test(t.Type?.n || '')) return null;
    let n = ctx.map.get(t);
    if (n == null) { n = ctx.out.alloc(); ctx.map.set(t, n); ctx.out.objs[n] = cv(d, ctx.over.get(t) ?? t, ctx); }
    return new Ref(n);
  }
  if (Array.isArray(v)) return v.map((x) => cv(d, x, ctx));
  if (v instanceof Stream) { const dd = {}; for (const [k, x] of Object.entries(v.dict)) if (k !== 'Length' && !SKIP.has(k) && !(ctx.strip && (k === 'Metadata' || k === 'PieceInfo'))) dd[k] = cv(d, x, ctx); return new Stream(dd, v.data); }
  if (isDict(v)) { const o = {}; for (const [k, x] of Object.entries(v)) if (!SKIP.has(k) && !(ctx.strip && (k === 'Metadata' || k === 'PieceInfo'))) o[k] = cv(d, x, ctx); return o; }
  return v;
}

// content stream q/Q balance of a page (0 when the streams cannot be decoded)
async function qDepth(d, contents) {
  let t = '';
  try {
    for (const c of contents) { const st = d.r(c); if (st instanceof Stream) t += latin(await decodeStream(d, st)) + '\n'; }
  } catch { return 0; }
  t = t.replace(/\bBI\b[\s\S]*?\bID\b[\s\S]*?\bEI\b/g, ' ').replace(/\((?:\\[\s\S]|[^\\()])*\)/g, ' ').replace(/<[0-9A-Fa-f\s]*>/g, ' ').replace(/\/[^\s/[\]()<>{}%]*/g, ' ');
  let dep = 0;
  for (const m of t.matchAll(/(?<![A-Za-z0-9_*'"\-.])(q|Q)(?![A-Za-z0-9_*'"\-.])/g)) dep += m[1] === 'q' ? 1 : -1;
  return dep;
}
function addRes(d, src, cat, name, val) {
  const r0 = d.dict(src.Resources), res = { ...(r0 || {}) }, sub = { ...(d.dict(res[cat]) || {}) };
  sub[name] = val; res[cat] = sub; src.Resources = res;
}
const cleanAnnot = (a) => {
  const o = {}; for (const [k, x] of Object.entries(a)) if (!['Parent', 'P', 'IRT', 'Popup', 'StructParent', 'Dest'].includes(k)) o[k] = x; return o;
};

// specs: [{doc, index, rot?, mod?(src, info, i) -> {content, fonts:{name:baseFont}, gs:{name:alpha}} | void}]
// opts: info 'first'|null|dict (source-level values), xmp:bool, strip:bool, annots:bool
export async function buildPdf(specs, opts = {}) {
  if (!specs.length) throw new Error('No pages selected');
  const out = new Out(), ctx = { out, map: new Map(), over: new Map(), strip: !!opts.strip };
  const catN = out.alloc(), pagesN = out.alloc(), kids = [];
  let version = 0;
  for (const s of specs) version = Math.max(version, parseFloat(s.doc.version) || 0);
  for (let si = 0; si < specs.length; si++) {
    const { doc: d, index, rot = 0, mod } = specs[si], p = d.pages[index], inf = d.info(index);
    const src = {}; for (const [k, v] of Object.entries(p.dict)) src[k] = v;
    for (const k of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) if (src[k] === undefined && p.inh[k] !== undefined) src[k] = p.inh[k];
    delete src.Parent; delete src.Type; delete src.StructParents; delete src.B; delete src.Thumb; delete src.PieceInfo; delete src.Metadata; delete src.AA;
    let ct = d.r(src.Contents); ct = ct == null ? [] : Array.isArray(ct) ? src.Contents instanceof Ref ? ct : ct : [src.Contents];
    delete src.Contents;
    // annotations
    let annots = d.r(src.Annots); delete src.Annots;
    const keep = [];
    if (opts.annots !== false && Array.isArray(annots)) {
      for (const a of annots) {
        const ad = d.dict(a); if (!ad || a instanceof Str) continue;
        const sub = d.r(ad.Subtype)?.n; if (sub === 'Widget' || sub === 'Popup') continue;
        const c = cleanAnnot(ad), act = d.dict(c.A);
        if (act && !/^(URI|Launch|Named)$/.test(d.r(act.S)?.n || '')) delete c.A;
        if (a instanceof Ref) { ctx.over.set(d.objs.get(a.n), c); keep.push(a); } else keep.push(c);
      }
    }
    let ov;
    if (mod) ov = await mod(src, inf, si);
    if (rot) src.Rotate = (((d.num(src.Rotate, 0) + rot) % 360) + 360) % 360;
    if (ov) {
      for (const [k, v] of Object.entries(ov.fonts || {})) addRes(d, src, 'Font', k, { Type: nm('Font'), Subtype: nm('Type1'), BaseFont: nm(v), Encoding: nm('WinAnsiEncoding') });
      for (const [k, v] of Object.entries(ov.gs || {})) addRes(d, src, 'ExtGState', k, { Type: nm('ExtGState'), ca: v, CA: v });
    }
    const np = cv(d, src, ctx);
    np.Type = nm('Page'); np.Parent = new Ref(pagesN);
    const cs = ct.map((c) => cv(d, c, ctx)).filter((c) => c);
    if (ov) {
      const dep = await qDepth(d, ct), mk = (t) => new Ref(out.add(new Stream({}, u8(t))));
      np.Contents = [mk('q\n'.repeat(1 + Math.max(0, -dep))), ...cs, mk('Q\n'.repeat(1 + Math.max(0, dep)) + ov.content)];
    } else if (cs.length) np.Contents = cs.length === 1 ? cs[0] : cs;
    if (keep.length) np.Annots = keep.map((a) => cv(d, a, ctx));
    kids.push(new Ref(out.add(np)));
  }
  out.objs[pagesN] = { Type: nm('Pages'), Kids: kids, Count: kids.length };
  const first = specs[0].doc, cat = { Type: nm('Catalog'), Pages: new Ref(pagesN) };
  if (opts.xmp && first.catalog?.Metadata) { const x = cv(first, first.catalog.Metadata, ctx); if (x) cat.Metadata = x; }
  if (first.catalog?.Lang) cat.Lang = first.catalog.Lang;
  out.objs[catN] = cat;
  const trailer = { Root: new Ref(catN) };
  let info = opts.info === undefined ? 'first' : opts.info;
  if (info === 'first') info = first.dict(first.trailer.Info);
  if (info && Object.keys(info).length) trailer.Info = new Ref(out.add(cv(first, info, { ...ctx, strip: false })));
  const parts = out.bytes((Math.max(1.4, version)).toFixed(1));
  const n = out.objs.length;
  trailer.Size = n;
  trailer.ID = [new Str(crypto.getRandomValues(new Uint8Array(16))), new Str(crypto.getRandomValues(new Uint8Array(16)))];
  let xr = `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 1; i < n; i++) xr += String(out.offs[i]).padStart(10, '0') + ' 00000 n \n';
  parts.push(u8(`${xr}trailer\n${ser(trailer)}\nstartxref\n${out.xrefAt}\n%%EOF\n`));
  return concat(parts);
}

// ---------- range specs ----------
// '1-3,5,7-' -> 0-based indices. 'end'/'last' = last page, descending ranges allowed ('5-3'), '-4' = 1..4.
export function parseRanges(spec, total) {
  const out = [];
  const pg = (t) => { t = t.trim().toLowerCase(); const n = t === 'end' || t === 'last' ? total : /^\d+$/.test(t) ? +t : NaN; if (isNaN(n)) throw new Error(`Bad page number "${t}"`); if (n < 1 || n > total) throw new Error(`Page ${n} is out of range (the document has ${total} page${total === 1 ? '' : 's'})`); return n; };
  for (const tok of String(spec).split(/[,;\s]+/).filter(Boolean)) {
    const m = /^([^-]*)-([^-]*)$/.exec(tok);
    if (!m) { out.push(pg(tok) - 1); continue; }
    const a = m[1] === '' ? 1 : pg(m[1]), b = m[2] === '' ? total : pg(m[2]);
    if (a <= b) for (let i = a; i <= b; i++) out.push(i - 1); else for (let i = a; i >= b; i--) out.push(i - 1);
  }
  if (!out.length) throw new Error('Enter a page range such as 1-3,5,7-');
  return out;
}

// ---------- pure operations on Uint8Array (used by the tools and by Node tests) ----------
const seq = (n) => Array.from({ length: n }, (_, i) => i);
const all = (d, f) => d.pages.map((_, i) => ({ doc: d, index: i, ...(f ? { mod: f } : {}) }));
export const ops = {
  async merge(list) { const docs = []; for (const [b, n] of list) docs.push(await openPdf(b, n)); return buildPdf(docs.flatMap((d) => all(d))); },
  async pick(bytes, indices) { const d = await openPdf(bytes); return buildPdf(indices.map((i) => ({ doc: d, index: i }))); },
  async extract(bytes, spec) { const d = await openPdf(bytes); return buildPdf(parseRanges(spec, d.pages.length).map((i) => ({ doc: d, index: i }))); },
  async remove(bytes, spec) {
    const d = await openPdf(bytes), del = new Set(parseRanges(spec, d.pages.length));
    if (del.size >= d.pages.length) throw new Error('That would delete every page');
    return buildPdf(seq(d.pages.length).filter((i) => !del.has(i)).map((i) => ({ doc: d, index: i })));
  },
  async reorder(bytes, spec) { return ops.extract(bytes, spec); },
  async reverse(bytes) { const d = await openPdf(bytes); return buildPdf(seq(d.pages.length).reverse().map((i) => ({ doc: d, index: i }))); },
  async rotate(bytes, spec, deg) {
    if (![90, 180, 270, -90].includes(deg)) throw new Error('Rotation must be 90, 180 or 270');
    const d = await openPdf(bytes), set = new Set(spec && spec.trim() ? parseRanges(spec, d.pages.length) : seq(d.pages.length));
    return buildPdf(seq(d.pages.length).map((i) => ({ doc: d, index: i, rot: set.has(i) ? deg : 0 })));
  },
  // parts: array of index arrays -> array of Uint8Array
  async split(bytes, parts) { const d = await openPdf(bytes); const r = []; for (const p of parts) r.push(await buildPdf(p.map((i) => ({ doc: d, index: i })))); return r; },
};

// ---------- metadata ----------
const dec = (s) => {
  const b = s.b;
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder().decode(b.subarray(3));
  return latin(b);
};
const textStr = (t) => {
  if (/^[\x20-\x7e]*$/.test(t)) return new Str(u8(t));
  const o = new Uint8Array(2 + t.length * 2); o[0] = 0xfe; o[1] = 0xff;
  for (let i = 0; i < t.length; i++) { o[2 + i * 2] = t.charCodeAt(i) >> 8; o[3 + i * 2] = t.charCodeAt(i) & 255; }
  return new Str(o);
};
const META = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'];
const pdfDate = (t = new Date()) => { const p = (n) => String(n).padStart(2, '0'); return `D:${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}Z`; };
export function readInfo(d) {
  const inf = d.dict(d.trailer.Info) || {}, o = {};
  for (const [k, v] of Object.entries(inf)) { const x = d.r(v); o[k] = x instanceof Str ? dec(x) : x instanceof Name ? '/' + x.n : typeof x === 'number' ? String(x) : ''; }
  return o;
}
ops.setMeta = async (bytes, vals) => {
  const d = await openPdf(bytes), info = { ...(d.dict(d.trailer.Info) || {}) };
  for (const k of META) { const v = vals[k]; if (v == null || v === '') continue; if (v.trim() === '-') delete info[k]; else info[k] = textStr(v); }
  info.ModDate = new Str(u8(pdfDate()));
  return buildPdf(all(d), { info, xmp: false });
};
ops.stripMeta = async (bytes) => { const d = await openPdf(bytes); return buildPdf(all(d), { info: null, xmp: false, strip: true }); };

// ---------- overlays ----------
const AFM_H = '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584'.split(' ').map(Number);
const AFM_HB = '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584'.split(' ').map(Number);
const textW = (s, bold) => { const t = bold ? AFM_HB : AFM_H; let w = 0; for (let i = 0; i < s.length; i++) w += t[s.charCodeAt(i) - 32] || 556; return w / 1000; };
const winText = (s) => String(s).replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
const showHex = (s) => hex(u8(s));
// matrix mapping displayed-page coordinates (u right, v up, origin bottom-left of the displayed page) to user space
function frame(inf) {
  const [x0, y0, x1, y1] = inf.vis;
  return inf.rot === 90 ? [0, 1, -1, 0, x1, y0] : inf.rot === 180 ? [-1, 0, 0, -1, x1, y1] : inf.rot === 270 ? [0, -1, 1, 0, x0, y1] : [1, 0, 0, 1, x0, y0];
}
const cm = (m) => m.map(numStr).join(' ') + ' cm';
ops.numberPages = async (bytes, o = {}) => {
  const d = await openPdf(bytes), N = d.pages.length, size = o.size > 0 ? +o.size : 10, margin = o.margin >= 0 ? +o.margin : 28;
  const fmt = winText(o.format || '{n}'), start = Number.isFinite(+o.start) ? +o.start : 1, pos = o.position || 'bottom-center';
  const sel = new Set(o.range && String(o.range).trim() ? parseRanges(o.range, N) : seq(N)), bold = !!o.bold;
  return buildPdf(all(d, (src, inf, i) => {
    if (!sel.has(i)) return undefined;
    const t = fmt.replace(/\{n\}/g, start + i).replace(/\{N\}/g, N), w = textW(t, bold) * size;
    const x = pos.endsWith('left') ? margin : pos.endsWith('right') ? inf.w - margin - w : (inf.w - w) / 2;
    const y = pos.startsWith('top') ? inf.h - margin - size * 0.72 : margin;
    return { fonts: { FtPN: bold ? 'Helvetica-Bold' : 'Helvetica' }, content: `q ${cm(frame(inf))} BT /FtPN ${numStr(size)} Tf 0 g ${numStr(x)} ${numStr(y)} Td ${showHex(t)} Tj ET Q\n` };
  }));
};
ops.watermark = async (bytes, o = {}) => {
  const d = await openPdf(bytes), t = winText(o.text || 'CONFIDENTIAL');
  if (!t.trim()) throw new Error('Enter the watermark text');
  const alpha = Math.min(1, Math.max(0.02, (o.opacity ?? 30) / 100)), gray = Math.min(1, Math.max(0, (o.gray ?? 60) / 100));
  const tw1 = textW(t, true);
  return buildPdf(all(d, (src, inf) => {
    const ang = o.angle === '' || o.angle == null || o.angle === 'auto' ? Math.min(60, Math.max(15, Math.atan2(inf.h, inf.w) * 180 / Math.PI)) : +o.angle;
    const a = ang * Math.PI / 180, diag = Math.hypot(inf.w, inf.h);
    const size = o.size > 0 ? +o.size : Math.max(8, Math.min(200, diag * 0.7 / tw1, Math.min(inf.w, inf.h) * 0.3 * 3.5 / 1));
    const c = Math.cos(a), s = Math.sin(a), w = tw1 * size;
    return { fonts: { FtWM: 'Helvetica-Bold' }, gs: { GsWM: alpha }, content: `q ${cm(frame(inf))} /GsWM gs ${numStr(gray)} g 1 0 0 1 ${numStr(inf.w / 2)} ${numStr(inf.h / 2)} cm ${numStr(c)} ${numStr(s)} ${numStr(-s)} ${numStr(c)} 0 0 cm BT /FtWM ${numStr(size)} Tf ${numStr(-w / 2)} ${numStr(-size * 0.36)} Td ${showHex(t)} Tj ET Q\n` };
  }));
};
ops.crop = async (bytes, m, o = {}) => {
  const d = await openPdf(bytes), sel = new Set(o.range && String(o.range).trim() ? parseRanges(o.range, d.pages.length) : seq(d.pages.length));
  return buildPdf(all(d, (src, inf, k) => {
    if (!sel.has(k)) return;
    const { t, r, b, l } = m, u = inf.rot === 90 ? { l: t, b: l, r: b, t: r } : inf.rot === 180 ? { l: r, b: t, r: l, t: b } : inf.rot === 270 ? { l: b, b: r, r: t, t: l } : { l, b, r, t };
    const v = inf.vis, box = [v[0] + u.l, v[1] + u.b, v[2] - u.r, v[3] - u.t];
    if (box[2] - box[0] < 1 || box[3] - box[1] < 1) throw new Error(`Margins leave nothing of page ${k + 1}`);
    src.CropBox = box; if (o.both) src.MediaBox = box;
  }));
};

// ---------- report ----------
const SIZES = [['A3', 841.89, 1190.55], ['A4', 595.28, 841.89], ['A5', 419.53, 595.28], ['A6', 297.64, 419.53], ['Letter', 612, 792], ['Legal', 612, 1008], ['Tabloid', 792, 1224]];
const sizeName = (w, h) => { for (const [n, a, b] of SIZES) { if (Math.abs(w - a) < 2 && Math.abs(h - b) < 2) return n + ' portrait'; if (Math.abs(w - b) < 2 && Math.abs(h - a) < 2) return n + ' landscape'; } return ''; };
export function pageReport(d, name) {
  const L = [`${name}: ${d.pages.length} page${d.pages.length === 1 ? '' : 's'}, PDF ${d.version}`];
  const meta = readInfo(d); for (const k of META) if (meta[k]) L.push(`  ${k}: ${meta[k]}`);
  L.push('', 'Page  Displayed size (pt)    mm              Rotate  Format');
  d.pages.forEach((_, i) => {
    const f = d.info(i), mm = (x) => (x / 72 * 25.4).toFixed(1);
    L.push(`${String(i + 1).padEnd(6)}${(numStr(+f.w.toFixed(2)) + ' x ' + numStr(+f.h.toFixed(2))).padEnd(23)}${(mm(f.w) + ' x ' + mm(f.h)).padEnd(16)}${String(f.rot).padEnd(8)}${sizeName(f.w, f.h)}`);
  });
  if (d.notes.length) L.push('', ...d.notes.map((n) => 'Note: ' + n));
  return L.join('\n');
}

// ---------- tools ----------
const base = (f) => f.name.replace(/\.pdf$/i, '') || 'document';
const bytesOf = async (f) => new Uint8Array(await f.arrayBuffer());
const pdfBlob = (b) => new Blob([b], { type: 'application/pdf' });
const one = (files) => { if (!files?.length) throw new Error('Choose a PDF file'); return files[0]; };
const wrap = async (f, fn) => { try { return await fn(await bytesOf(f)); } catch (e) { throw new Error(files1(e, f)); } };
const files1 = (e, f) => (e.message.includes(f.name) ? e.message : `${f.name}: ${e.message}`);
const FILE1 = { accept: 'application/pdf,.pdf' };
const done = async (f, suffix, make) => wrap(f, async (b) => {
  const out = await make(b), n = (await openPdf(out)).pages.length;
  return { blob: pdfBlob(out), filename: `${base(f)}-${suffix}.pdf`, text: `${n} page${n === 1 ? '' : 's'}, ${fmtSize(out.length)}` };
});
const RANGE = (def, label = 'Pages') => ({ id: 'pages', label: `${label} (e.g. 1-3,5,7-)`, type: 'text', def });

export default [
  {
    id: 'pdf-merge', cat: 'PDF', title: 'Merge PDFs', inputs: 0, dom: true,
    desc: 'Combine several PDFs into one, in the order selected. Works on existing PDFs without re-rendering; bookmarks and form fields are dropped.',
    file: { accept: 'application/pdf,.pdf', multiple: true },
    run: async (_i, _o, files) => {
      if (!files?.length) throw new Error('Choose two or more PDF files');
      const list = []; for (const f of files) list.push([await bytesOf(f), f.name]);
      let out; try { out = await ops.merge(list); } catch (e) { throw e; }
      const n = (await openPdf(out)).pages.length;
      return { blob: pdfBlob(out), filename: 'merged.pdf', text: `${files.length} file(s) merged, ${n} pages, ${fmtSize(out.length)}` };
    },
  },
  {
    id: 'pdf-split', cat: 'PDF', title: 'Split PDF', inputs: 0, dom: true,
    desc: 'Split a PDF into several files: every N pages, or custom ranges (each comma-separated range becomes its own file).',
    file: FILE1,
    opts: [{ id: 'every', label: 'Every N pages (0 = use ranges)', type: 'number', def: 1 }, RANGE('1-3,5,7-', 'Ranges, one file each')],
    run: async (_i, o, files) => {
      const f = one(files);
      return wrap(f, async (b) => {
        const d = await openPdf(b), N = d.pages.length; let parts, names;
        if (o.every > 0) { const n = Math.floor(o.every); parts = []; names = []; for (let i = 0; i < N; i += n) { const p = seq(Math.min(n, N - i)).map((k) => i + k); parts.push(p); names.push(p.length === 1 ? `${i + 1}` : `${i + 1}-${i + p.length}`); } }
        else { const toks = String(o.pages).split(/[,;\s]+/).filter(Boolean); parts = toks.map((t) => parseRanges(t, N)); names = toks.map((t) => t.replace(/[^0-9a-z-]/gi, '')); }
        const outs = await ops.split(b, parts);
        return { blob: outs.map((x, i) => new File([x], `${base(f)}-pages-${names[i]}.pdf`, { type: 'application/pdf' })), text: `${outs.length} file(s) from ${N} pages` };
      });
    },
  },
  {
    id: 'pdf-extract-pages', cat: 'PDF', title: 'Extract PDF Pages', inputs: 0, dom: true,
    desc: 'Pull selected pages (e.g. 1-3,5,7-) out of a PDF into a new PDF.', file: FILE1, opts: [RANGE('1')],
    run: (_i, o, files) => { const f = one(files); return done(f, 'extract', (b) => ops.extract(b, o.pages)); },
  },
  {
    id: 'pdf-delete-pages', cat: 'PDF', title: 'Delete PDF Pages', inputs: 0, dom: true,
    desc: 'Remove selected pages (e.g. 2,4-6) from a PDF.', file: FILE1, opts: [RANGE('1')],
    run: (_i, o, files) => { const f = one(files); return done(f, 'deleted', (b) => ops.remove(b, o.pages)); },
  },
  {
    id: 'pdf-reorder-pages', cat: 'PDF', title: 'Reorder PDF Pages', inputs: 0, dom: true,
    desc: 'Rearrange pages by an order list such as 3,1,2,4-6 (pages you leave out are dropped, a page may be repeated, 6-4 reverses a run).',
    file: FILE1, opts: [RANGE('2,1,3-', 'New order')],
    run: (_i, o, files) => { const f = one(files); return done(f, 'reordered', (b) => ops.reorder(b, o.pages)); },
  },
  {
    id: 'pdf-rotate', cat: 'PDF', title: 'Rotate PDF Pages', inputs: 0, dom: true,
    desc: 'Rotate all pages or a range by 90, 180 or 270 degrees clockwise (adds to any existing rotation).',
    file: FILE1, opts: [{ id: 'deg', label: 'Rotate clockwise', type: 'select', choices: ['90', '180', '270'], def: '90' }, RANGE('', 'Pages, blank = all')],
    run: (_i, o, files) => { const f = one(files); return done(f, 'rotated', (b) => ops.rotate(b, o.pages, +o.deg)); },
  },
  {
    id: 'pdf-reverse', cat: 'PDF', title: 'Reverse PDF Page Order', inputs: 0, dom: true,
    desc: 'Put the pages of a PDF in reverse order.', file: FILE1,
    run: (_i, _o, files) => { const f = one(files); return done(f, 'reversed', (b) => ops.reverse(b)); },
  },
  {
    id: 'pdf-page-count-and-sizes', cat: 'PDF', title: 'PDF Page Count and Sizes', inputs: 0, dom: true,
    desc: 'List the number of pages with each page size, rotation and paper format (A4, Letter...).',
    file: { accept: 'application/pdf,.pdf', multiple: true },
    run: async (_i, _o, files) => {
      if (!files?.length) throw new Error('Choose a PDF file');
      const r = []; for (const f of files) { try { r.push(pageReport(await openPdf(await bytesOf(f), f.name), f.name)); } catch (e) { r.push(files1(e, f)); } }
      return r.join('\n\n');
    },
  },
  {
    id: 'pdf-metadata-editor', cat: 'PDF', title: 'PDF Metadata Editor', inputs: 0, dom: true,
    desc: 'Edit Title, Author, Subject, Keywords, Creator and Producer. Leave a field empty to keep it, type - to delete it. The old XMP packet is dropped so it cannot contradict the new values.',
    file: FILE1,
    opts: META.map((k) => ({ id: k, label: k, type: 'text', def: '' })),
    run: async (_i, o, files) => {
      const f = one(files), before = readInfo(await openPdf(await bytesOf(f), f.name));
      const r = await done(f, 'meta', (b) => ops.setMeta(b, o));
      const after = readInfo(await openPdf(new Uint8Array(await r.blob.arrayBuffer())));
      r.text += '\n\n' + META.map((k) => `${k}: ${before[k] ?? '-'}  ->  ${after[k] ?? '-'}`).join('\n');
      return r;
    },
  },
  {
    id: 'pdf-remove-metadata', cat: 'PDF', title: 'Remove PDF Metadata', inputs: 0, dom: true,
    desc: 'Strip the Info dictionary (author, title, creator...) and XMP metadata packets from a PDF.', file: FILE1,
    run: (_i, _o, files) => { const f = one(files); return done(f, 'clean', (b) => ops.stripMeta(b)); },
  },
  {
    id: 'pdf-add-page-numbers', cat: 'PDF', title: 'Add Page Numbers to PDF', inputs: 0, dom: true,
    desc: 'Stamp page numbers (Helvetica) onto existing pages. Honors page rotation and crop offsets. Use {n} for the number and {N} for the total.',
    file: FILE1,
    opts: [
      { id: 'position', label: 'Position', type: 'select', choices: ['bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right', 'top-left'], def: 'bottom-center' },
      { id: 'format', label: 'Format', type: 'text', def: 'Page {n} of {N}' },
      { id: 'start', label: 'First number', type: 'number', def: 1 },
      { id: 'size', label: 'Font size (pt)', type: 'number', def: 10 },
      { id: 'margin', label: 'Margin (pt)', type: 'number', def: 28 },
      { id: 'bold', label: 'Bold', type: 'checkbox', def: false },
      RANGE('', 'Number only these pages, blank = all'),
    ],
    run: (_i, o, files) => { const f = one(files); return done(f, 'numbered', (b) => ops.numberPages(b, { ...o, range: o.pages })); },
  },
  {
    id: 'pdf-add-text-watermark', cat: 'PDF', title: 'Add Text Watermark to PDF', inputs: 0, dom: true,
    desc: 'Overlay light diagonal text (semi-transparent) on every page of an existing PDF.', file: FILE1,
    opts: [
      { id: 'text', label: 'Text', type: 'text', def: 'CONFIDENTIAL' },
      { id: 'opacity', label: 'Opacity (%)', type: 'number', def: 30 },
      { id: 'gray', label: 'Lightness (0 black - 100 white)', type: 'number', def: 60 },
      { id: 'size', label: 'Font size (pt, 0 = auto)', type: 'number', def: 0 },
      { id: 'angle', label: 'Angle (degrees, or auto)', type: 'text', def: 'auto' },
    ],
    run: (_i, o, files) => { const f = one(files); return done(f, 'watermarked', (b) => ops.watermark(b, o)); },
  },
  {
    id: 'pdf-crop-margins', cat: 'PDF', title: 'Crop PDF Margins', inputs: 0, dom: true,
    desc: 'Trim margins from every page by setting its CropBox (and optionally MediaBox). Margins refer to the page as displayed. Content is not deleted.',
    file: FILE1,
    opts: [
      { id: 'unit', label: 'Unit', type: 'select', choices: ['mm', 'pt', 'in'], def: 'mm' },
      { id: 'top', label: 'Top', type: 'number', def: 10 }, { id: 'right', label: 'Right', type: 'number', def: 10 },
      { id: 'bottom', label: 'Bottom', type: 'number', def: 10 }, { id: 'left', label: 'Left', type: 'number', def: 10 },
      { id: 'both', label: 'Also set MediaBox', type: 'checkbox', def: false },
      RANGE('', 'Only these pages, blank = all'),
    ],
    run: (_i, o, files) => {
      const f = one(files), k = o.unit === 'in' ? 72 : o.unit === 'pt' ? 1 : 72 / 25.4, v = (x) => Math.max(0, Number(x) || 0) * k;
      return done(f, 'cropped', (b) => ops.crop(b, { t: v(o.top), r: v(o.right), b: v(o.bottom), l: v(o.left) }, { both: o.both, range: o.pages }));
    },
  },
];

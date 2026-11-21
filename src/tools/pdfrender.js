// PDF page renderer: PDF -> PNG/JPEG/WebP through a hand-written content-stream interpreter drawing on a 2D canvas.
// Zero dependencies. The object parser/page tree come from pdfedit.js (openPdf); everything else here is new:
// content tokenizer, filters (Flate/LZW/A85/AHx/RL + predictors), functions (types 0,2,3,4), colour spaces,
// TrueType / CFF (Type 2) / Type 1 outline parsers, simple + Type0 + Type3 fonts, images, tiling + shading patterns
// (axial/radial via canvas gradients, function + mesh types by pixel rasterisation), forms, annotations, OCGs.
//
// Limits (documented): encrypted PDFs refused (by pdfedit); JBIG2, JPEG2000 and CCITT images are drawn as a grey box
// labelled with the filter; PDF soft masks in ExtGState (/SMask) are ignored; non-embedded fonts use system fonts
// (Liberation/Arial/DejaVu...) so glyph shapes differ from the PDF viewer's; predefined CJK CMaps (other than
// Identity) are not available; vertical writing is drawn horizontally; CMYK uses the plain 1-c-k conversion
// (no ICC), ICC profiles are replaced by their alternate device space; radial shadings without Extend are extended.
import { openPdf, parseRanges } from './pdfedit.js';

const latin = (b) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };
const concat = (arrs) => { let n = 0; for (const a of arrs) n += a.length; const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; };
const isDict = (v) => v != null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const isName = (v) => v != null && typeof v === 'object' && typeof v.n === 'string' && !isDict(v);
const isStr = (v) => v != null && typeof v === 'object' && v.b instanceof Uint8Array;
const isStream = (v) => v != null && typeof v === 'object' && v.dict !== undefined && v.data instanceof Uint8Array;
const isArr = Array.isArray;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
class CName { constructor(n) { this.n = n; } }
class CStr { constructor(b) { this.b = b; } }
class Op { constructor(k) { this.k = k; } }
const WS = '\0\t\n\f\r ', DELIM = '()<>[]{}/%';
const isWs = (c) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
const isDelim = (c) => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;

// ---------- content stream tokenizer ----------
const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)/y;
function mkTok(s) {
  let i = 0;
  const n = s.length;
  function skip() {
    for (;;) {
      while (i < n && isWs(s.charCodeAt(i))) i++;
      if (s.charCodeAt(i) === 37) { while (i < n && s.charCodeAt(i) !== 10 && s.charCodeAt(i) !== 13) i++; } else break;
    }
  }
  function tok() {
    skip();
    if (i >= n) return undefined;
    const c = s[i];
    if (c === '/') {
      let j = i + 1; while (j < n && !isWs(s.charCodeAt(j)) && !isDelim(s.charCodeAt(j))) j++;
      const nm = s.slice(i + 1, j); i = j;
      return new CName(nm.includes('#') ? nm.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : nm);
    }
    if (c === '(') {
      const out = []; let depth = 1; i++;
      while (i < n && depth) {
        let ch = s[i++];
        if (ch === '\\') {
          ch = s[i++];
          if (ch === 'n') out.push(10); else if (ch === 'r') out.push(13); else if (ch === 't') out.push(9); else if (ch === 'b') out.push(8); else if (ch === 'f') out.push(12);
          else if (ch >= '0' && ch <= '7') { let o = ch; while (o.length < 3 && s[i] >= '0' && s[i] <= '7') o += s[i++]; out.push(parseInt(o, 8) & 255); }
          else if (ch === '\r') { if (s[i] === '\n') i++; } else if (ch === '\n') { /* continuation */ } else if (ch !== undefined) out.push(ch.charCodeAt(0) & 255);
        } else if (ch === '(') { depth++; out.push(40); } else if (ch === ')') { if (--depth) out.push(41); } else out.push(ch.charCodeAt(0) & 255);
      }
      return new CStr(Uint8Array.from(out));
    }
    if (c === '<' && s[i + 1] === '<') {
      i += 2; const d = {};
      for (;;) {
        skip();
        if (i >= n) return d;
        if (s[i] === '>' && s[i + 1] === '>') { i += 2; return d; }
        const k = tok();
        if (!(k instanceof CName)) { if (k === undefined) return d; continue; }
        const v = tok();
        if (v instanceof Op) { if (v.k === 'ID' || v.k === 'EI') { i -= v.k.length; return d; } continue; }
        d[k.n] = v;
      }
    }
    if (c === '<') {
      let e = s.indexOf('>', i); if (e < 0) e = n;
      let h = s.slice(i + 1, e).replace(/[^0-9a-fA-F]/g, ''); if (h.length & 1) h += '0';
      const b = new Uint8Array(h.length / 2); for (let k = 0; k < b.length; k++) b[k] = parseInt(h.substr(k * 2, 2), 16);
      i = e + 1; return new CStr(b);
    }
    if (c === '[') {
      i++; const a = [];
      for (;;) {
        skip();
        if (i >= n) return a;
        if (s[i] === ']') { i++; return a; }
        const v = tok();
        if (v === undefined) return a;
        if (v instanceof Op) continue;
        a.push(v);
      }
    }
    if (c === ']' || c === '>' || c === ')' || c === '{' || c === '}') { i++; return new Op(c); }
    NUM.lastIndex = i;
    const m = NUM.exec(s);
    if (m) { i = NUM.lastIndex; return parseFloat(m[0]); }
    let j = i; while (j < n && !isWs(s.charCodeAt(j)) && !isDelim(s.charCodeAt(j))) j++;
    if (j === i) j++;
    const k = s.slice(i, j); i = j;
    if (k === 'true') return true; if (k === 'false') return false; if (k === 'null') return null;
    return new Op(k);
  }
  return { tok, get pos() { return i; }, set pos(v) { i = v; }, s };
}
const INL_KEY = { BPC: 'BitsPerComponent', CS: 'ColorSpace', D: 'Decode', DP: 'DecodeParms', F: 'Filter', H: 'Height', IM: 'ImageMask', I: 'Interpolate', W: 'Width', L: 'Length' };
const INL_VAL = { G: 'DeviceGray', RGB: 'DeviceRGB', CMYK: 'DeviceCMYK', I: 'Indexed', AHx: 'ASCIIHexDecode', A85: 'ASCII85Decode', LZW: 'LZWDecode', Fl: 'FlateDecode', RL: 'RunLengthDecode', CCF: 'CCITTFaxDecode', DCT: 'DCTDecode' };
const inlVal = (v) => (v instanceof CName ? (INL_VAL[v.n] ? new CName(INL_VAL[v.n]) : v) : isArr(v) ? v.map(inlVal) : v);
function parseContent(s) {
  const t = mkTok(s), out = []; let args = [];
  for (;;) {
    const v = t.tok();
    if (v === undefined) break;
    if (!(v instanceof Op)) { args.push(v); if (args.length > 64) args.shift(); continue; }
    if (v.k === 'BI') {
      const dict = {};
      for (;;) {
        const k = t.tok();
        if (k === undefined || (k instanceof Op && k.k === 'ID')) break;
        if (!(k instanceof CName)) continue;
        const val = t.tok();
        if (val instanceof Op && val.k === 'ID') break;
        const kk = INL_KEY[k.n] || k.n;
        dict[kk] = kk === 'ColorSpace' || kk === 'Filter' ? inlVal(val) : val;
      }
      let p = t.pos; if (isWs(s.charCodeAt(p))) p++;
      let e = p;
      for (;;) {
        e = s.indexOf('EI', e);
        if (e < 0) { e = s.length; break; }
        if (isWs(s.charCodeAt(e - 1)) && (e + 2 >= s.length || isWs(s.charCodeAt(e + 2)))) {
          let bad = false; const lim = Math.min(s.length, e + 24);
          for (let q = e + 2; q < lim; q++) { const cc = s.charCodeAt(q); if (cc > 127 || (cc < 9) || (cc > 13 && cc < 32)) { bad = true; break; } }
          if (!bad) break;
        }
        e += 2;
      }
      let end = e; if (end > p && isWs(s.charCodeAt(end - 1))) end--;
      const data = new Uint8Array(end - p); for (let q = 0; q < data.length; q++) data[q] = s.charCodeAt(p + q) & 255;
      out.push({ k: 'BI', a: [dict, data] }); t.pos = Math.min(s.length, e + 2); args = []; continue;
    }
    out.push({ k: v.k, a: args }); args = [];
  }
  return out;
}

// ---------- stream filters ----------
async function inflate(data) {
  const run = async (fmt, bytes) => {
    const ds = new DecompressionStream(fmt), w = ds.writable.getWriter(), r = ds.readable.getReader(), chunks = [];
    const wp = w.write(bytes).then(() => w.close()).catch(() => {});
    try { for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); } } catch { /* truncated/corrupt: keep what we got */ }
    await wp; return concat(chunks);
  };
  let o = await run('deflate', data);
  if (!o.length && data.length > 2) o = await run('deflate-raw', data.subarray(2));
  return o;
}
class Buf { constructor(n = 1024) { this.a = new Uint8Array(n); this.n = 0; } push(b) { if (this.n >= this.a.length) { const t = new Uint8Array(this.a.length * 2); t.set(this.a); this.a = t; } this.a[this.n++] = b; } get out() { return this.a.subarray(0, this.n); } }
function lzw(data, early) {
  const out = new Buf(data.length * 4), tab = []; let bits = 9, nxt = 258, prev = null, acc = 0, nb = 0, p = 0;
  const reset = () => { tab.length = 0; for (let i = 0; i < 256; i++) tab[i] = [i]; nxt = 258; bits = 9; prev = null; };
  reset();
  for (;;) {
    while (nb < bits && p < data.length) { acc = (acc << 8) | data[p++]; nb += 8; }
    if (nb < bits) break;
    const code = (acc >> (nb - bits)) & ((1 << bits) - 1); nb -= bits; acc &= (1 << nb) - 1;
    if (code === 256) { reset(); continue; }
    if (code === 257) break;
    let ent;
    if (code < nxt && tab[code]) ent = tab[code]; else if (prev) ent = prev.concat(prev[0]); else break;
    for (const b of ent) out.push(b);
    if (prev && nxt < 4096) tab[nxt++] = prev.concat(ent[0]);
    prev = ent;
    const lim = nxt + early;
    bits = lim >= 2048 ? 12 : lim >= 1024 ? 11 : lim >= 512 ? 10 : 9;
  }
  return out.out;
}
function a85(data) {
  const out = new Buf(data.length), g = []; let i = 0;
  if (data[0] === 60 && data[1] === 126) i = 2;
  for (; i < data.length; i++) {
    const c = data[i];
    if (c === 126) break; if (isWs(c)) continue;
    if (c === 122 && !g.length) { out.push(0); out.push(0); out.push(0); out.push(0); continue; }
    if (c < 33 || c > 117) continue;
    g.push(c - 33);
    if (g.length === 5) { let v = 0; for (const x of g) v = v * 85 + x; out.push((v >>> 24) & 255); out.push((v >>> 16) & 255); out.push((v >>> 8) & 255); out.push(v & 255); g.length = 0; }
  }
  if (g.length > 1) { const k = g.length; while (g.length < 5) g.push(84); let v = 0; for (const x of g) v = v * 85 + x; const b = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; for (let q = 0; q < k - 1; q++) out.push(b[q]); }
  return out.out;
}
function ahx(data) {
  const out = new Buf(data.length / 2 + 1); let hi = -1;
  for (const c of data) {
    if (c === 62) break;
    const v = c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1;
    if (v < 0) continue;
    if (hi < 0) hi = v; else { out.push(hi * 16 + v); hi = -1; }
  }
  if (hi >= 0) out.push(hi * 16);
  return out.out;
}
function runlen(data) {
  const out = new Buf(data.length * 2);
  for (let i = 0; i < data.length;) {
    const l = data[i++];
    if (l === 128) break;
    if (l < 128) { for (let k = 0; k <= l && i < data.length; k++) out.push(data[i++]); } else { const b = data[i++]; for (let k = 0; k < 257 - l; k++) out.push(b); }
  }
  return out.out;
}
function unpredict(data, pred, colors, bpc, cols) {
  if (pred < 2) return data;
  const bpp = Math.max(1, (colors * bpc + 7) >> 3), row = (colors * bpc * cols + 7) >> 3;
  if (pred === 2) {
    if (bpc !== 8) return data;
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
const IMG_FILTERS = new Set(['DCTDecode', 'JPXDecode', 'JBIG2Decode', 'CCITTFaxDecode']);
// decodes the whole filter chain; stops at an image codec and reports it as `rest`
async function decodeStream(d, st) {
  let f = d.r(st.dict.Filter), p = d.r(st.dict.DecodeParms);
  f = f == null ? [] : isArr(f) ? f.map((x) => d.r(x)) : [f];
  p = isArr(p) ? p.map((x) => d.r(x)) : [p];
  let data = st.data, rest = null;
  for (let k = 0; k < f.length; k++) {
    const n = f[k]?.n, parm = d.dict(p[k]) || {};
    if (n === 'FlateDecode' || n === 'Fl') { data = await inflate(data); data = unpredict(data, d.num(parm.Predictor, 1), d.num(parm.Colors, 1), d.num(parm.BitsPerComponent, 8), d.num(parm.Columns, 1)); }
    else if (n === 'LZWDecode' || n === 'LZW') { data = lzw(data, d.num(parm.EarlyChange, 1)); data = unpredict(data, d.num(parm.Predictor, 1), d.num(parm.Colors, 1), d.num(parm.BitsPerComponent, 8), d.num(parm.Columns, 1)); }
    else if (n === 'ASCII85Decode' || n === 'A85') data = a85(data);
    else if (n === 'ASCIIHexDecode' || n === 'AHx') data = ahx(data);
    else if (n === 'RunLengthDecode' || n === 'RL') data = runlen(data);
    else if (IMG_FILTERS.has(n)) { rest = { name: n, parm }; break; }
    else if (n === 'Crypt') continue;
    else { rest = { name: String(n), parm }; break; }
  }
  return { data, rest };
}

// ---------- functions ----------
const fnCache = new WeakMap();
async function mkFn(d, fo) {
  fo = d.r(fo);
  if (isArr(fo)) { const fs = []; for (const f of fo) fs.push(await mkFn(d, f)); return (x) => fs.flatMap((f) => f(x)); }
  if (fo == null) return (x) => x;
  if (typeof fo === 'object' && fnCache.has(fo)) return fnCache.get(fo);
  const dict = d.dict(fo) || {}, type = d.num(dict.FunctionType, -1), dom = d.nums(dict.Domain) || [0, 1], rng = d.nums(dict.Range);
  const cl = (x) => x.map((v, i) => (dom.length > 2 * i + 1 ? clamp(v, dom[2 * i], dom[2 * i + 1]) : v));
  const cr = (y) => (rng ? y.map((v, i) => clamp(v, rng[2 * i], rng[2 * i + 1])) : y);
  let f;
  if (type === 2) {
    const c0 = d.nums(dict.C0) || [0], c1 = d.nums(dict.C1) || [1], N = d.num(dict.N, 1);
    f = (x) => { const t = clamp(x[0], dom[0], dom[1]), tn = N === 1 ? t : Math.pow(t, N); return cr(c0.map((a, i) => a + tn * ((c1[i] ?? a) - a))); };
  } else if (type === 3) {
    const fs = []; for (const g of d.r(dict.Functions) || []) fs.push(await mkFn(d, g));
    const bounds = d.nums(dict.Bounds) || [], enc = d.nums(dict.Encode) || [];
    f = (x) => {
      const t = clamp(x[0], dom[0], dom[1]); let k = 0; while (k < bounds.length && t >= bounds[k]) k++;
      if (k >= fs.length) k = fs.length - 1;
      const lo = k === 0 ? dom[0] : bounds[k - 1], hi = k === bounds.length ? dom[1] : bounds[k], e0 = enc[2 * k] ?? 0, e1 = enc[2 * k + 1] ?? 1;
      return cr(fs[k]([hi === lo ? e0 : e0 + (t - lo) * (e1 - e0) / (hi - lo)]));
    };
  } else if (type === 0 && isStream(fo)) {
    const size = d.nums(dict.Size), bps = d.num(dict.BitsPerSample, 8), m = size.length, nOut = rng.length / 2;
    const enc = d.nums(dict.Encode) || size.flatMap((s) => [0, s - 1]), dec = d.nums(dict.Decode) || rng;
    const data = (await decodeStream(d, fo)).data, maxv = Math.pow(2, bps) - 1;
    const sample = (idx, j) => {
      const bit = (idx * nOut + j) * bps; let v = 0;
      if (bps === 8) v = data[bit >> 3] ?? 0; else if (bps === 16) v = ((data[bit >> 3] ?? 0) << 8) | (data[(bit >> 3) + 1] ?? 0);
      else if (bps === 32) v = (((data[bit >> 3] ?? 0) * 16777216) + ((data[(bit >> 3) + 1] ?? 0) << 16) + ((data[(bit >> 3) + 2] ?? 0) << 8) + (data[(bit >> 3) + 3] ?? 0));
      else { for (let q = 0; q < bps; q++) { const b = bit + q; v = (v << 1) | (((data[b >> 3] ?? 0) >> (7 - (b & 7))) & 1); } }
      return v;
    };
    f = (x) => {
      const e = [], i0 = [], fr = [];
      for (let i = 0; i < m; i++) {
        const t = clamp(x[i] ?? 0, dom[2 * i], dom[2 * i + 1]), den = dom[2 * i + 1] - dom[2 * i];
        const ev = clamp(enc[2 * i] + (den ? (t - dom[2 * i]) * (enc[2 * i + 1] - enc[2 * i]) / den : 0), 0, size[i] - 1);
        e.push(ev); const fl = Math.min(Math.floor(ev), size[i] - 1); i0.push(fl); fr.push(ev - fl);
      }
      const res = new Array(nOut).fill(0);
      for (let c = 0; c < (1 << m); c++) {
        let w = 1, idx = 0, stride = 1;
        for (let i = 0; i < m; i++) { const hi = (c >> i) & 1, ii = Math.min(i0[i] + hi, size[i] - 1); w *= hi ? fr[i] : 1 - fr[i]; idx += ii * stride; stride *= size[i]; }
        if (w) for (let j = 0; j < nOut; j++) res[j] += w * sample(idx, j);
      }
      return cr(res.map((v, j) => dec[2 * j] + v * (dec[2 * j + 1] - dec[2 * j]) / maxv));
    };
  } else if (type === 4 && isStream(fo)) {
    const prog = psParse(latin((await decodeStream(d, fo)).data));
    f = (x) => { const st = cl(x).slice(); try { psRun(prog, st); } catch { /* bad program */ } const nO = rng ? rng.length / 2 : st.length; return cr(st.slice(-nO)); };
  } else f = (x) => x;
  if (typeof fo === 'object') fnCache.set(fo, f);
  return f;
}
function psParse(s) {
  const toks = s.match(/[{}]|[^\s{}]+/g) || [], pos = { i: 0 };
  const block = () => {
    const out = [];
    while (pos.i < toks.length) {
      const t = toks[pos.i++];
      if (t === '{') out.push(block()); else if (t === '}') return out; else { const v = Number(t); out.push(Number.isNaN(v) ? t : v); }
    }
    return out;
  };
  while (pos.i < toks.length && toks[pos.i] !== '{') pos.i++;
  pos.i++; return block();
}
function psRun(prog, st) {
  for (let pc = 0; pc < prog.length; pc++) {
    const t = prog[pc];
    if (typeof t === 'number') { st.push(t); continue; }
    if (isArr(t)) { // procedure followed by if / ifelse
      const nx = prog[pc + 1];
      if (isArr(nx) && prog[pc + 2] === 'ifelse') { const c = st.pop(); psRun(c ? t : nx, st); pc += 2; } else if (nx === 'if') { if (st.pop()) psRun(t, st); pc += 1; }
      continue;
    }
    let a, b;
    switch (t) {
      case 'abs': st.push(Math.abs(st.pop())); break;
      case 'add': b = st.pop(); a = st.pop(); st.push(a + b); break;
      case 'sub': b = st.pop(); a = st.pop(); st.push(a - b); break;
      case 'mul': b = st.pop(); a = st.pop(); st.push(a * b); break;
      case 'div': b = st.pop(); a = st.pop(); st.push(b ? a / b : 0); break;
      case 'idiv': b = st.pop(); a = st.pop(); st.push(b ? Math.trunc(a / b) : 0); break;
      case 'mod': b = st.pop(); a = st.pop(); st.push(b ? a % b : 0); break;
      case 'neg': st.push(-st.pop()); break;
      case 'atan': b = st.pop(); a = st.pop(); { let r = Math.atan2(a, b) * 180 / Math.PI; if (r < 0) r += 360; st.push(r); } break;
      case 'ceiling': st.push(Math.ceil(st.pop())); break;
      case 'floor': st.push(Math.floor(st.pop())); break;
      case 'round': st.push(Math.floor(st.pop() + 0.5)); break;
      case 'truncate': case 'cvi': st.push(Math.trunc(st.pop())); break;
      case 'cvr': break;
      case 'cos': st.push(Math.cos(st.pop() * Math.PI / 180)); break;
      case 'sin': st.push(Math.sin(st.pop() * Math.PI / 180)); break;
      case 'exp': b = st.pop(); a = st.pop(); st.push(Math.pow(a, b)); break;
      case 'ln': st.push(Math.log(st.pop())); break;
      case 'log': st.push(Math.log10(st.pop())); break;
      case 'sqrt': st.push(Math.sqrt(st.pop())); break;
      case 'eq': b = st.pop(); a = st.pop(); st.push(a === b); break;
      case 'ne': b = st.pop(); a = st.pop(); st.push(a !== b); break;
      case 'gt': b = st.pop(); a = st.pop(); st.push(a > b); break;
      case 'ge': b = st.pop(); a = st.pop(); st.push(a >= b); break;
      case 'lt': b = st.pop(); a = st.pop(); st.push(a < b); break;
      case 'le': b = st.pop(); a = st.pop(); st.push(a <= b); break;
      case 'and': b = st.pop(); a = st.pop(); st.push(typeof a === 'boolean' ? a && b : a & b); break;
      case 'or': b = st.pop(); a = st.pop(); st.push(typeof a === 'boolean' ? a || b : a | b); break;
      case 'xor': b = st.pop(); a = st.pop(); st.push(typeof a === 'boolean' ? a !== b : a ^ b); break;
      case 'not': a = st.pop(); st.push(typeof a === 'boolean' ? !a : ~a); break;
      case 'bitshift': b = st.pop(); a = st.pop(); st.push(b >= 0 ? a << b : a >> -b); break;
      case 'true': st.push(true); break;
      case 'false': st.push(false); break;
      case 'pop': st.pop(); break;
      case 'exch': b = st.pop(); a = st.pop(); st.push(b, a); break;
      case 'dup': st.push(st[st.length - 1]); break;
      case 'copy': { const n = st.pop(); if (n > 0) st.push(...st.slice(-n)); } break;
      case 'index': { const n = st.pop(); st.push(st[st.length - 1 - n]); } break;
      case 'roll': {
        let j = st.pop(); const n = st.pop();
        if (n > 0 && n <= st.length) { const seg = st.splice(st.length - n, n); j = ((j % n) + n) % n; for (let q = 0; q < n; q++) st.push(seg[(q - j + n) % n]); }
      } break;
      default: break;
    }
  }
}

// ---------- colour spaces ----------
const GRAY = { name: 'DeviceGray', n: 1, init: [0], rgb: (c) => { const g = clamp(c[0], 0, 1) * 255 + 0.5 | 0; return [g, g, g]; } };
const RGB = { name: 'DeviceRGB', n: 3, init: [0, 0, 0], rgb: (c) => [clamp(c[0], 0, 1) * 255 + 0.5 | 0, clamp(c[1], 0, 1) * 255 + 0.5 | 0, clamp(c[2], 0, 1) * 255 + 0.5 | 0] };
// CMYK: multilinear interpolation between typical SWOP-like ink corner colours (close to what viewers show without ICC)
const CMYK_C = [[255, 255, 255], [0, 173, 239], [236, 0, 140], [46, 49, 146], [255, 242, 0], [0, 166, 80], [237, 28, 36], [54, 54, 57]];
function cmykTo(c, m, y, k, out, p) {
  c = clamp(c, 0, 1); m = clamp(m, 0, 1); y = clamp(y, 0, 1); k = clamp(k, 0, 1);
  const kk = 1 - k * 0.863; let r = 0, g = 0, b = 0;
  for (let i = 0; i < 8; i++) {
    const w = (i & 1 ? c : 1 - c) * (i & 2 ? m : 1 - m) * (i & 4 ? y : 1 - y);
    if (w) { const q = CMYK_C[i]; r += w * q[0]; g += w * q[1]; b += w * q[2]; }
  }
  out[p] = r * kk + 0.5; out[p + 1] = g * kk + 0.5; out[p + 2] = b * kk + 0.5;
}
const CMYK = {
  name: 'DeviceCMYK', n: 4, init: [0, 0, 0, 1],
  rgb: (c) => { const o = [0, 0, 0]; cmykTo(c[0], c[1], c[2], c[3], o, 0); return [o[0] | 0, o[1] | 0, o[2] | 0]; },
};
const PATTERN_CS = { name: 'Pattern', n: 0, init: [], rgb: () => [0, 0, 0], pattern: true };
const lin2srgb = (v) => { v = clamp(v, 0, 1); return (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255 + 0.5 | 0; };
function mkLab(d, dict) {
  const wp = d.nums(dict.WhitePoint) || [0.9505, 1, 1.089], rg = d.nums(dict.Range) || [-100, 100, -100, 100];
  const g = (x) => (x >= 6 / 29 ? x * x * x : 108 / 841 * (x - 4 / 29));
  return {
    name: 'Lab', n: 3, init: [0, 0, 0], range: [0, 100, ...rg],
    rgb: (c) => {
      const L = clamp(c[0], 0, 100), a = clamp(c[1], rg[0], rg[1]), b = clamp(c[2], rg[2], rg[3]), M = (L + 16) / 116;
      const X = wp[0] * g(M + a / 500), Y = wp[1] * g(M), Z = wp[2] * g(M - b / 200);
      const k = 1 / wp[1]; // normalise white to Y=1, D50 sRGB matrix
      const x = X * k, y = Y * k, z = Z * k;
      return [lin2srgb(3.1338561 * x - 1.6168667 * y - 0.4906146 * z), lin2srgb(-0.9787684 * x + 1.9161415 * y + 0.033454 * z), lin2srgb(0.0719453 * x - 0.2289914 * y + 1.4052427 * z)];
    },
  };
}
const csCache = new WeakMap();
async function parseCS(d, obj, res) {
  const o = d.r(obj);
  if (o == null) return GRAY;
  if (isName(o)) {
    switch (o.n) {
      case 'DeviceGray': case 'G': case 'CalGray': return GRAY;
      case 'DeviceRGB': case 'RGB': case 'CalRGB': return RGB;
      case 'DeviceCMYK': case 'CMYK': return CMYK;
      case 'Pattern': return PATTERN_CS;
      default: {
        const r = d.dict(res?.ColorSpace)?.[o.n];
        if (r !== undefined && !(isName(d.r(r)) && d.r(r).n === o.n)) return parseCS(d, r, res);
        return GRAY;
      }
    }
  }
  if (typeof o === 'object' && csCache.has(o)) return csCache.get(o);
  let cs = GRAY;
  if (isArr(o)) {
    const kind = d.r(o[0])?.n;
    if (kind === 'CalGray') cs = GRAY;
    else if (kind === 'CalRGB') cs = RGB;
    else if (kind === 'Lab') cs = mkLab(d, d.dict(o[1]) || {});
    else if (kind === 'ICCBased') {
      const st = d.r(o[1]), nn = d.num(st?.dict?.N, 3);
      cs = nn === 1 ? GRAY : nn === 4 ? CMYK : RGB;
      if (nn === 3 && st?.dict?.Alternate && d.r(st.dict.Alternate)?.n === 'Lab') cs = RGB;
    } else if (kind === 'Indexed' || kind === 'I') {
      const base = await parseCS(d, o[1], res), hival = d.num(o[2], 255), tb = d.r(o[3]);
      let bytes = isStr(tb) ? tb.b : isStream(tb) ? (await decodeStream(d, tb)).data : new Uint8Array(0);
      const pal = new Array(hival + 1);
      for (let i = 0; i <= hival; i++) {
        const comps = []; for (let j = 0; j < base.n; j++) {
          let v = (bytes[i * base.n + j] ?? 0) / 255;
          if (base.range) { const rj = base.range; v = rj[2 * j] + v * (rj[2 * j + 1] - rj[2 * j]); }
          comps.push(v);
        }
        pal[i] = base.rgb(comps);
      }
      cs = { name: 'Indexed', n: 1, init: [0], indexed: true, pal, hival, rgb: (c) => pal[clamp(Math.round(c[0]), 0, hival)] || [0, 0, 0] };
    } else if (kind === 'Separation' || kind === 'DeviceN') {
      const names = kind === 'Separation' ? [d.r(o[1])?.n] : (d.r(o[1]) || []).map((x) => d.r(x)?.n);
      const alt = await parseCS(d, o[2], res), fn = await mkFn(d, o[3]), n = names.length;
      const none = names.every((x) => x === 'None');
      cs = { name: kind, n, init: new Array(n).fill(1), none, rgb: (c) => alt.rgb(fn(c)) };
    } else if (kind === 'Pattern') {
      const base = o[1] !== undefined ? await parseCS(d, o[1], res) : null;
      cs = { ...PATTERN_CS, base };
    } else if (kind === 'DeviceGray' || kind === 'DeviceRGB' || kind === 'DeviceCMYK' || kind === 'G' || kind === 'RGB' || kind === 'CMYK') cs = await parseCS(d, o[0], res);
    else if (isName(d.r(o[0]))) cs = GRAY;
  }
  if (typeof o === 'object') csCache.set(o, cs);
  return cs;
}

// ---------- glyph names / encodings ----------
const WIN_NAMES = ('space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at '
  + 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde bullet '
  + 'Euro bullet quotesinglbase florin quotedblbase ellipsis dagger daggerdbl circumflex perthousand Scaron guilsinglleft OE bullet Zcaron bullet bullet quoteleft quoteright quotedblleft quotedblright bullet endash emdash tilde trademark scaron guilsinglright oe bullet zcaron Ydieresis '
  + 'space exclamdown cent sterling currency yen brokenbar section dieresis copyright ordfeminine guillemotleft logicalnot hyphen registered macron degree plusminus twosuperior threesuperior acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright onequarter onehalf threequarters questiondown '
  + 'Agrave Aacute Acircumflex Atilde Adieresis Aring AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis Eth Ntilde Ograve Oacute Ocircumflex Otilde Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls '
  + 'agrave aacute acircumflex atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute icircumflex idieresis eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ugrave uacute ucircumflex udieresis yacute thorn ydieresis').split(' ');
const cp1252 = new TextDecoder('windows-1252'), macRoman = new TextDecoder('macintosh');
const NAME2U = new Map(), U2NAME = new Map();
{
  for (let c = 32; c < 256; c++) {
    const nm = WIN_NAMES[c - 32]; if (nm === 'bullet' && c !== 0x95) continue;
    const u = cp1252.decode(Uint8Array.of(c)).codePointAt(0);
    if (!NAME2U.has(nm)) NAME2U.set(nm, u); if (!U2NAME.has(u)) U2NAME.set(u, nm);
  }
  const extra = {
    fi: 0xFB01, fl: 0xFB02, ff: 0xFB00, ffi: 0xFB03, ffl: 0xFB04, fraction: 0x2044, dotlessi: 0x131, Lslash: 0x141, lslash: 0x142, ogonek: 0x2DB, ring: 0x2DA, caron: 0x2C7, breve: 0x2D8, dotaccent: 0x2D9, hungarumlaut: 0x2DD,
    minus: 0x2212, nbspace: 0xA0, sfthyphen: 0xAD, middot: 0xB7, quotesingle: 0x27, grave: 0x60, mu1: 0xB5, Delta: 0x2206, Omega: 0x2126, summation: 0x2211, product: 0x220F, radical: 0x221A, infinity: 0x221E, integral: 0x222B,
    notequal: 0x2260, lessequal: 0x2264, greaterequal: 0x2265, approxequal: 0x2248, partialdiff: 0x2202, lozenge: 0x25CA, arrowleft: 0x2190, arrowup: 0x2191, arrowright: 0x2192, arrowdown: 0x2193, arrowboth: 0x2194,
    Gamma: 0x393, Theta: 0x398, Lambda: 0x39B, Xi: 0x39E, Pi: 0x3A0, Sigma: 0x3A3, Upsilon: 0x3A5, Phi: 0x3A6, Psi: 0x3A8, alpha: 0x3B1, beta: 0x3B2, gamma: 0x3B3, delta: 0x3B4, epsilon: 0x3B5, zeta: 0x3B6, eta: 0x3B7, theta: 0x3B8,
    iota: 0x3B9, kappa: 0x3BA, lambda: 0x3BB, nu: 0x3BD, xi: 0x3BE, omicron: 0x3BF, pi: 0x3C0, rho: 0x3C1, sigma: 0x3C3, tau: 0x3C4, upsilon: 0x3C5, phi: 0x3C6, chi: 0x3C7, psi: 0x3C8, omega: 0x3C9, element: 0x2208, emptyset: 0x2205,
    union: 0x222A, intersection: 0x2229, universal: 0x2200, existential: 0x2203, asteriskmath: 0x2217, dagger2: 0x2020, Euro: 0x20AC, bar: 0x7C, uni00A0: 0xA0, Zcaron: 0x17D, zcaron: 0x17E, Scaron: 0x160, scaron: 0x161,
    Lcaron: 0x13D, lcaron: 0x13E, Aogonek: 0x104, aogonek: 0x105, Cacute: 0x106, cacute: 0x107, Ccaron: 0x10C, ccaron: 0x10D, Dcaron: 0x10E, dcaron: 0x10F, Eogonek: 0x118, eogonek: 0x119, Ecaron: 0x11A, ecaron: 0x11B, Nacute: 0x143, nacute: 0x144,
    Ncaron: 0x147, ncaron: 0x148, Odblacute: 0x150, odblacute: 0x151, Rcaron: 0x158, rcaron: 0x159, Sacute: 0x15A, sacute: 0x15B, Tcaron: 0x164, tcaron: 0x165, Uring: 0x16E, uring: 0x16F, Udblacute: 0x170, udblacute: 0x171, Zacute: 0x179, zacute: 0x17A, Zdotaccent: 0x17B, zdotaccent: 0x17C,
    Gbreve: 0x11E, gbreve: 0x11F, Idotaccent: 0x130, Scedilla: 0x15E, scedilla: 0x15F, Amacron: 0x100, amacron: 0x101, Abreve: 0x102, abreve: 0x103, commaaccent: 0x2C, Tcommaaccent: 0x162, tcommaaccent: 0x163,
    endash: 0x2013, emdash: 0x2014, quotedblleft: 0x201C, quotedblright: 0x201D, quoteleft: 0x2018, quoteright: 0x2019, bullet: 0x2022, ellipsis: 0x2026, trademark: 0x2122, uni2022: 0x2022,
  };
  for (const [k, v] of Object.entries(extra)) { if (!NAME2U.has(k) || k === 'mu1') NAME2U.set(k, v); if (!U2NAME.has(v)) U2NAME.set(v, k); }
  NAME2U.set('quotesingle', 0x27); NAME2U.set('grave', 0x60); NAME2U.set('hyphen', 0x2D);
  U2NAME.set(0x20, 'space'); U2NAME.set(0x2D, 'hyphen'); U2NAME.set(0x27, 'quotesingle'); U2NAME.set(0x60, 'grave');
}
function nameToUni(nm) {
  if (!nm) return 0;
  const k = NAME2U.get(nm); if (k !== undefined) return k;
  let m = /^uni([0-9A-Fa-f]{4})/.exec(nm); if (m) return parseInt(m[1], 16);
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(nm); if (m) return parseInt(m[1], 16);
  const dot = nm.indexOf('.'); if (dot > 0) return nameToUni(nm.slice(0, dot));
  const us = nm.indexOf('_'); if (us > 0) return nameToUni(nm.slice(0, us));
  return 0;
}
const STD_HI = { 161: 'exclamdown', 162: 'cent', 163: 'sterling', 164: 'fraction', 165: 'yen', 166: 'florin', 167: 'section', 168: 'currency', 169: 'quotesingle', 170: 'quotedblleft', 171: 'guillemotleft', 172: 'guilsinglleft', 173: 'guilsinglright', 174: 'fi', 175: 'fl', 177: 'endash', 178: 'dagger', 179: 'daggerdbl', 180: 'periodcentered', 182: 'paragraph', 183: 'bullet', 184: 'quotesinglbase', 185: 'quotedblbase', 186: 'quotedblright', 187: 'guillemotright', 188: 'ellipsis', 189: 'perthousand', 191: 'questiondown', 193: 'grave', 194: 'acute', 195: 'circumflex', 196: 'tilde', 197: 'macron', 198: 'breve', 199: 'dotaccent', 200: 'dieresis', 202: 'ring', 203: 'cedilla', 205: 'hungarumlaut', 206: 'ogonek', 207: 'caron', 208: 'emdash', 225: 'AE', 227: 'ordfeminine', 232: 'Lslash', 233: 'Oslash', 234: 'OE', 235: 'ordmasculine', 241: 'ae', 245: 'dotlessi', 248: 'lslash', 249: 'oslash', 250: 'oe', 251: 'germandbls' };
const ENC = {
  WinAnsiEncoding: Array.from({ length: 256 }, (_, c) => (c >= 32 ? WIN_NAMES[c - 32] : null)),
  StandardEncoding: Array.from({ length: 256 }, (_, c) => (c === 0x27 ? 'quoteright' : c === 0x60 ? 'quoteleft' : c >= 32 && c < 127 ? WIN_NAMES[c - 32] : STD_HI[c] || null)),
  MacRomanEncoding: Array.from({ length: 256 }, (_, c) => (c < 32 ? null : c < 127 ? WIN_NAMES[c - 32] : U2NAME.get(macRoman.decode(Uint8Array.of(c)).codePointAt(0)) || null)),
};
ENC.WinAnsiEncoding[0xA0] = 'space'; ENC.WinAnsiEncoding[0x7F] = 'bullet';
ENC.MacExpertEncoding = ENC.StandardEncoding;
const SYM_MAP = (() => {
  const g = 'ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ', l = 'αβχδεφγηιϕκλμνοπθρστυϖωξψζ', m = new Map();
  for (let i = 0; i < 26; i++) { m.set(65 + i, g[i]); m.set(97 + i, l[i]); }
  const o = { 0x22: '∀', 0x24: '∃', 0x27: '∋', 0x2D: '−', 0x40: '≅', 0x5C: '∴', 0x5E: '⊥', 0x7E: '∼', 0xA3: '≤', 0xA5: '∞', 0xB1: '±', 0xB3: '≥', 0xB4: '×', 0xB5: '∝', 0xB6: '∂', 0xB7: '•', 0xB8: '÷', 0xB9: '≠', 0xBA: '≡', 0xBB: '≈', 0xB2: '″', 0xAE: '→', 0xAC: '←', 0xAD: '↑', 0xAF: '↓', 0xAB: '↔', 0xD7: '⋅', 0xC5: '⊕', 0xC6: '∅', 0xC7: '∩', 0xC8: '∪', 0xCE: '∈', 0xD1: '∇', 0xD5: '∏', 0xD6: '√', 0xE5: '∑', 0xF2: '∫', 0xA0: '€', 0xD8: '¬', 0xD9: '∧', 0xDA: '∨' };
  for (const [k, v] of Object.entries(o)) m.set(+k, v);
  return m;
})();

const ZAPF_EX = { 0x25: 0x260E, 0x2A: 0x261B, 0x2B: 0x261E, 0x6C: 0x25CF, 0x6E: 0x25A0, 0x73: 0x25B2, 0x74: 0x25BC, 0x75: 0x25C6, 0x77: 0x25D7 };
const zapfMap = (c) => (c < 0x21 || c > 0x7E ? 0 : ZAPF_EX[c] || (c <= 0x24 ? 0x2701 + c - 0x21 : c <= 0x29 ? 0x2706 + c - 0x26 : c <= 0x6B ? 0x270C + c - 0x2C : 0x274D + c - 0x6D));
// ---------- CMap parser (embedded CMaps and ToUnicode) ----------
const hexNum = (b) => { let v = 0; for (const x of b) v = v * 256 + x; return v; };
const utf16 = (b) => { let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); if (b.length === 1) s = String.fromCharCode(b[0]); return s; };
function parseCMap(text) {
  const t = mkTok(text), cm = { space: [], ranges: [], chars: new Map(), bfChars: new Map(), bfRanges: [] };
  let a = [];
  for (let v = t.tok(); v !== undefined; v = t.tok()) {
    if (!(v instanceof Op)) { a.push(v); continue; }
    const k = v.k;
    if (k === 'endcodespacerange') for (let i = 0; i + 1 < a.length; i += 2) cm.space.push({ n: a[i].b.length, lo: hexNum(a[i].b), hi: hexNum(a[i + 1].b) });
    else if (k === 'endcidrange') for (let i = 0; i + 2 < a.length; i += 3) cm.ranges.push([hexNum(a[i].b), hexNum(a[i + 1].b), a[i + 2], a[i].b.length]);
    else if (k === 'endcidchar') for (let i = 0; i + 1 < a.length; i += 2) cm.chars.set(hexNum(a[i].b), a[i + 1]);
    else if (k === 'endbfchar') for (let i = 0; i + 1 < a.length; i += 2) { if (isStr(a[i]) && isStr(a[i + 1])) cm.bfChars.set(hexNum(a[i].b), utf16(a[i + 1].b)); }
    else if (k === 'endbfrange') for (let i = 0; i + 2 < a.length; i += 3) { if (isStr(a[i]) && isStr(a[i + 1])) cm.bfRanges.push([hexNum(a[i].b), hexNum(a[i + 1].b), isArr(a[i + 2]) ? a[i + 2].map((x) => (isStr(x) ? utf16(x.b) : '')) : isStr(a[i + 2]) ? utf16(a[i + 2].b) : '']); }
    a = [];
  }
  cm.cid = (code) => { const c = cm.chars.get(code); if (c !== undefined) return c; for (const r of cm.ranges) if (code >= r[0] && code <= r[1]) return r[2] + code - r[0]; return 0; };
  cm.uni = (code) => {
    const c = cm.bfChars.get(code); if (c !== undefined) return c;
    for (const r of cm.bfRanges) if (code >= r[0] && code <= r[1]) { if (isArr(r[2])) return r[2][code - r[0]] || ''; const s = r[2]; return s.slice(0, -1) + String.fromCharCode(s.charCodeAt(s.length - 1) + code - r[0]); }
    return '';
  };
  cm.split = (bytes) => { // bytes -> [[code, nbytes]]
    const out = [];
    for (let i = 0; i < bytes.length;) {
      let found = 0, code = 0;
      for (let n = 1; n <= 4 && i + n <= bytes.length; n++) {
        code = code * 256 + bytes[i + n - 1];
        if (cm.space.some((s) => s.n === n && code >= s.lo && code <= s.hi)) { found = n; break; }
      }
      if (!found) { found = Math.min(cm.space.length ? cm.space[0].n : 1, bytes.length - i); code = hexNum(bytes.subarray(i, i + found)); }
      out.push([code, found]); i += found;
    }
    return out;
  };
  return cm;
}

// ---------- TrueType / OpenType ----------
function parseSfnt(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let base = 0;
  if (latin(buf.subarray(0, 4)) === 'ttcf') base = dv.getUint32(12);
  const n = dv.getUint16(base + 4), tabs = {};
  for (let i = 0; i < n; i++) { const o = base + 12 + 16 * i; tabs[latin(buf.subarray(o, o + 4))] = [dv.getUint32(o + 8), dv.getUint32(o + 12)]; }
  return { dv, buf, tabs };
}
function parseTTF(buf) {
  const { dv, tabs } = parseSfnt(buf);
  if (tabs['CFF '] && !tabs.glyf) { const c = parseCFF(buf.subarray(tabs['CFF '][0], tabs['CFF '][0] + tabs['CFF '][1])); const sf = parseSfnt(buf); c.cmaps = tabs.cmap ? parseCmapTable(sf) : []; return c; }
  if (!tabs.glyf || !tabs.loca || !tabs.head) throw new Error('not a TrueType font');
  const upem = dv.getUint16(tabs.head[0] + 18) || 1000, locFmt = dv.getInt16(tabs.head[0] + 50);
  const numGlyphs = tabs.maxp ? dv.getUint16(tabs.maxp[0] + 4) : 0xFFFF;
  const nHM = tabs.hhea ? dv.getUint16(tabs.hhea[0] + 34) : 0;
  const glyfO = tabs.glyf[0], locaO = tabs.loca[0], locaN = tabs.loca[1] / (locFmt ? 4 : 2) - 1;
  const loc = (g) => (locFmt ? dv.getUint32(locaO + g * 4) : dv.getUint16(locaO + g * 2) * 2);
  const advance = (g) => { if (!tabs.hmtx || !nHM) return 0; return dv.getUint16(tabs.hmtx[0] + 4 * Math.min(g, nHM - 1)); };
  const contours = (g, depth) => {
    if (g < 0 || g >= locaN || g >= numGlyphs || depth > 6) return [];
    const s = loc(g), e = loc(g + 1); if (e <= s) return [];
    let p = glyfO + s;
    const nc = dv.getInt16(p); p += 10;
    if (nc >= 0) {
      const ends = []; for (let i = 0; i < nc; i++) { ends.push(dv.getUint16(p)); p += 2; }
      const np = nc ? ends[nc - 1] + 1 : 0, il = dv.getUint16(p); p += 2 + il;
      const flags = [];
      while (flags.length < np) { const f = dv.getUint8(p++); flags.push(f); if (f & 8) { let r = dv.getUint8(p++); while (r-- > 0 && flags.length < np) flags.push(f); } }
      const xs = [], ys = []; let v = 0;
      for (let i = 0; i < np; i++) { const f = flags[i]; if (f & 2) { const d = dv.getUint8(p++); v += f & 16 ? d : -d; } else if (!(f & 16)) { v += dv.getInt16(p); p += 2; } xs.push(v); }
      v = 0;
      for (let i = 0; i < np; i++) { const f = flags[i]; if (f & 4) { const d = dv.getUint8(p++); v += f & 32 ? d : -d; } else if (!(f & 32)) { v += dv.getInt16(p); p += 2; } ys.push(v); }
      const out = []; let st = 0;
      for (const en of ends) { const c = []; for (let i = st; i <= en; i++) c.push({ x: xs[i], y: ys[i], on: flags[i] & 1 }); out.push(c); st = en + 1; }
      return out;
    }
    let out = [];
    for (;;) {
      const fl = dv.getUint16(p), gi = dv.getUint16(p + 2); p += 4;
      let dx, dy;
      if (fl & 1) { dx = dv.getInt16(p); dy = dv.getInt16(p + 2); p += 4; } else { dx = dv.getInt8(p); dy = dv.getInt8(p + 1); p += 2; }
      if (!(fl & 2)) { dx = 0; dy = 0; }
      let a = 1, b = 0, c = 0, d = 1;
      const f2 = (q) => dv.getInt16(q) / 16384;
      if (fl & 8) { a = d = f2(p); p += 2; } else if (fl & 0x40) { a = f2(p); d = f2(p + 2); p += 4; } else if (fl & 0x80) { a = f2(p); b = f2(p + 2); c = f2(p + 4); d = f2(p + 6); p += 8; }
      for (const ct of contours(gi, depth + 1)) out.push(ct.map((q) => ({ x: a * q.x + c * q.y + dx, y: b * q.x + d * q.y + dy, on: q.on })));
      if (!(fl & 0x20)) break;
    }
    return out;
  };
  const f = {
    kind: 'ttf', upem, cmaps: tabs.cmap ? parseCmapTable({ dv, tabs }) : [], numGlyphs,
    glyph(g) {
      const sc = 1 / upem, path = new Path2D();
      try {
        for (const c of contours(g, 0)) {
          const n = c.length; if (!n) continue;
          let st, i0;
          if (c[0].on) { st = c[0]; i0 = 1; } else if (c[n - 1].on) { st = c[n - 1]; i0 = 0; } else { st = { x: (c[0].x + c[n - 1].x) / 2, y: (c[0].y + c[n - 1].y) / 2 }; i0 = 0; }
          path.moveTo(st.x * sc, st.y * sc);
          let ctrl = null; const last = c[n - 1].on && c[0].on ? n : n; // iterate remaining points
          const seq = []; for (let i = i0; i < n; i++) seq.push(c[i]);
          if (c[0].on === 0 && c[n - 1].on === 1) seq.pop();
          for (const q of seq) {
            if (q.on) { if (ctrl) { path.quadraticCurveTo(ctrl.x * sc, ctrl.y * sc, q.x * sc, q.y * sc); ctrl = null; } else path.lineTo(q.x * sc, q.y * sc); }
            else { if (ctrl) { const mx = (ctrl.x + q.x) / 2, my = (ctrl.y + q.y) / 2; path.quadraticCurveTo(ctrl.x * sc, ctrl.y * sc, mx * sc, my * sc); } ctrl = q; }
          }
          if (ctrl) path.quadraticCurveTo(ctrl.x * sc, ctrl.y * sc, st.x * sc, st.y * sc);
          path.closePath(); void last;
        }
      } catch { /* damaged glyph */ }
      return { path, w: advance(g) * 1000 / upem };
    },
  };
  return f;
}
function parseCmapTable({ dv, tabs }) {
  const t = tabs.cmap[0], n = dv.getUint16(t + 2), out = [];
  for (let i = 0; i < n; i++) {
    const pid = dv.getUint16(t + 4 + 8 * i), eid = dv.getUint16(t + 6 + 8 * i), off = t + dv.getUint32(t + 8 + 8 * i);
    let fmt = 0; try { fmt = dv.getUint16(off); } catch { continue; }
    let look = null;
    try {
      if (fmt === 0) look = (c) => (c < 256 ? dv.getUint8(off + 6 + c) : 0);
      else if (fmt === 4) {
        const sc = dv.getUint16(off + 6) / 2, endO = off + 14, stO = endO + 2 * sc + 2, dlO = stO + 2 * sc, roO = dlO + 2 * sc;
        look = (c) => {
          if (c > 0xFFFF) return 0;
          for (let s = 0; s < sc; s++) {
            if (c <= dv.getUint16(endO + 2 * s)) {
              const st = dv.getUint16(stO + 2 * s); if (c < st) return 0;
              const ro = dv.getUint16(roO + 2 * s), dl = dv.getInt16(dlO + 2 * s);
              if (ro === 0) return (c + dl) & 0xFFFF;
              const g = dv.getUint16(roO + 2 * s + ro + 2 * (c - st)); return g ? (g + dl) & 0xFFFF : 0;
            }
          }
          return 0;
        };
      } else if (fmt === 6) { const fc = dv.getUint16(off + 6), cnt = dv.getUint16(off + 8); look = (c) => (c >= fc && c < fc + cnt ? dv.getUint16(off + 10 + 2 * (c - fc)) : 0); }
      else if (fmt === 12) {
        const ng = dv.getUint32(off + 12);
        look = (c) => { for (let g = 0; g < ng; g++) { const o = off + 16 + 12 * g, s = dv.getUint32(o), e = dv.getUint32(o + 4); if (c >= s && c <= e) return dv.getUint32(o + 8) + c - s; } return 0; };
      }
    } catch { look = null; }
    if (look) out.push({ pid, eid, look });
  }
  return out;
}

// ---------- CFF / Type 2 ----------
const CFF_STD = ('.notdef space exclam quotedbl numbersign dollar percent ampersand quoteright parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at '
  + 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore quoteleft a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde '
  + 'exclamdown cent sterling fraction yen florin section currency quotesingle quotedblleft guillemotleft guilsinglleft guilsinglright fi fl endash dagger daggerdbl periodcentered paragraph bullet quotesinglbase quotedblbase quotedblright guillemotright ellipsis perthousand questiondown '
  + 'grave acute circumflex tilde macron breve dotaccent dieresis ring cedilla hungarumlaut ogonek caron emdash AE ordfeminine Lslash Oslash OE ordmasculine ae dotlessi lslash oslash oe germandbls onesuperior logicalnot mu trademark Eth onehalf plusminus Thorn onequarter divide brokenbar degree thorn threequarters twosuperior registered minus eth multiply threesuperior copyright '
  + 'Aacute Acircumflex Adieresis Agrave Aring Atilde Ccedilla Eacute Ecircumflex Edieresis Egrave Iacute Icircumflex Idieresis Igrave Ntilde Oacute Ocircumflex Odieresis Ograve Otilde Scaron Uacute Ucircumflex Udieresis Ugrave Yacute Ydieresis Zcaron '
  + 'aacute acircumflex adieresis agrave aring atilde ccedilla eacute ecircumflex edieresis egrave iacute icircumflex idieresis igrave ntilde oacute ocircumflex odieresis ograve otilde scaron uacute ucircumflex udieresis ugrave yacute ydieresis zcaron').split(' ');
function cffIndex(b, o) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), cnt = dv.getUint16(o);
  if (!cnt) return { items: [], end: o + 2 };
  const sz = b[o + 2], rd = (p) => { let v = 0; for (let i = 0; i < sz; i++) v = v * 256 + b[p + i]; return v; };
  const base = o + 3 + (cnt + 1) * sz - 1, items = [];
  for (let i = 0; i < cnt; i++) items.push([base + rd(o + 3 + i * sz), base + rd(o + 3 + (i + 1) * sz)]);
  return { items, end: base + rd(o + 3 + cnt * sz) };
}
function cffDict(b, s, e) {
  const d = {}; let st = [];
  for (let p = s; p < e;) {
    const b0 = b[p++];
    if (b0 <= 21) { let op = b0; if (b0 === 12) op = 1200 + b[p++]; d[op] = st; st = []; }
    else if (b0 === 28) { st.push(((b[p] << 8) | b[p + 1]) << 16 >> 16); p += 2; }
    else if (b0 === 29) { st.push((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]); p += 4; }
    else if (b0 === 30) {
      let str = ''; for (let done = false; !done && p < e;) { const by = b[p++]; for (const nb of [by >> 4, by & 15]) { if (nb === 15) { done = true; break; } str += nb < 10 ? nb : nb === 10 ? '.' : nb === 11 ? 'E' : nb === 12 ? 'E-' : nb === 14 ? '-' : ''; } }
      st.push(parseFloat(str) || 0);
    } else if (b0 >= 32 && b0 <= 246) st.push(b0 - 139);
    else if (b0 >= 247 && b0 <= 250) st.push((b0 - 247) * 256 + b[p++] + 108);
    else if (b0 >= 251 && b0 <= 254) st.push(-(b0 - 251) * 256 - b[p++] - 108);
  }
  return d;
}
function parseCFF(b) {
  const hdr = b[2], nameIdx = cffIndex(b, hdr), topIdx = cffIndex(b, nameIdx.end), strIdx = cffIndex(b, topIdx.end), gsub = cffIndex(b, strIdx.end);
  const top = cffDict(b, topIdx.items[0][0], topIdx.items[0][1]);
  const csIdx = cffIndex(b, top[17][0]), nG = csIdx.items.length;
  const sidName = (sid) => (sid < CFF_STD.length ? CFF_STD[sid] : (() => { const it = strIdx.items[sid - 391]; return it ? latin(b.subarray(it[0], it[1])) : 'sid' + sid; })());
  const isCID = top[1230] !== undefined;
  const privOf = (dict) => {
    const pr = dict[18]; if (!pr) return { subrs: [], dw: 0, nw: 0 };
    const [sz, off] = pr, pd = cffDict(b, off, off + sz);
    return { subrs: pd[19] ? cffIndex(b, off + pd[19][0]).items : [], dw: pd[20]?.[0] ?? 0, nw: pd[21]?.[0] ?? 0 };
  };
  const privs = [];
  let fdSel = null;
  if (isCID && top[1236]) {
    for (const [s, e] of cffIndex(b, top[1236][0]).items) privs.push(privOf(cffDict(b, s, e)));
    const fo = top[1237][0], fmt = b[fo]; fdSel = new Uint8Array(nG);
    if (fmt === 0) for (let i = 0; i < nG; i++) fdSel[i] = b[fo + 1 + i];
    else if (fmt === 3) { const nr = (b[fo + 1] << 8) | b[fo + 2]; for (let r = 0; r < nr; r++) { const p = fo + 3 + 3 * r, first = (b[p] << 8) | b[p + 1], fd = b[p + 2], nx = (b[p + 3] << 8) | b[p + 4]; for (let g = first; g < nx && g < nG; g++) fdSel[g] = fd; } }
  } else privs.push(privOf(top));
  // charset: gid -> sid/cid
  const charset = new Array(nG).fill(0);
  const cso = top[15]?.[0] ?? 0;
  if (cso > 2) {
    const fmt = b[cso]; let p = cso + 1, g = 1;
    if (fmt === 0) for (; g < nG; g++, p += 2) charset[g] = (b[p] << 8) | b[p + 1];
    else for (; g < nG;) { const first = (b[p] << 8) | b[p + 1]; let left; if (fmt === 1) { left = b[p + 2]; p += 3; } else { left = (b[p + 2] << 8) | b[p + 3]; p += 4; } for (let k = 0; k <= left && g < nG; k++) charset[g++] = first + k; }
  } else for (let g = 0; g < nG; g++) charset[g] = g; // predefined ISOAdobe (ok for ids < 229)
  const fm = top[1207] && top[1207].length === 6 ? top[1207] : [0.001, 0, 0, 0.001, 0, 0];
  const nameToGid = new Map(), cidToGid = new Map();
  if (isCID) charset.forEach((c, g) => cidToGid.set(c, g)); else charset.forEach((s, g) => { const nm = sidName(s); if (!nameToGid.has(nm)) nameToGid.set(nm, g); });
  // builtin encoding code -> gid
  const enc = new Array(256).fill(0);
  if (!isCID) {
    const eo = top[16]?.[0] ?? 0;
    if (eo > 1) {
      const fmt = b[eo] & 127; let p = eo + 1;
      if (fmt === 0) { const nc = b[p++]; for (let i = 0; i < nc; i++) enc[b[p++]] = i + 1; }
      else { const nr = b[p++]; let g = 1; for (let r = 0; r < nr; r++) { const first = b[p++], left = b[p++]; for (let k = 0; k <= left; k++) enc[first + k] = g++; } }
      if (b[eo] & 128) { const ns = b[p++]; for (let i = 0; i < ns; i++) { const code = b[p], sid = (b[p + 1] << 8) | b[p + 2]; p += 3; const g = nameToGid.get(sidName(sid)); if (g !== undefined) enc[code] = g; } }
    } else for (let c = 0; c < 256; c++) { const g = nameToGid.get(ENC.StandardEncoding[c]); if (g !== undefined) enc[c] = g; }
  }
  const gbias = gsub.items.length < 1240 ? 107 : gsub.items.length < 33900 ? 1131 : 32768;
  const cache = new Map();
  const glyphRaw = (g, pathOut, depth) => {
    const pv = privs[fdSel ? fdSel[g] : 0] || privs[0], subrs = pv.subrs, sbias = subrs.length < 1240 ? 107 : subrs.length < 33900 ? 1131 : 32768;
    const sc = fm[0] || 0.001, scy = fm[3] || 0.001;
    let x = 0, y = 0, stack = [], nStems = 0, haveW = false, width = pv.dw, open = false, done = false;
    const P = pathOut;
    const mv = (dx, dy) => { if (open) P.closePath(); x += dx; y += dy; P.moveTo(x * sc, y * scy); open = true; };
    const ln = (dx, dy) => { x += dx; y += dy; P.lineTo(x * sc, y * scy); };
    const cv = (a, b2, c, d, e, f) => { const x1 = x + a, y1 = y + b2, x2 = x1 + c, y2 = y1 + d; x = x2 + e; y = y2 + f; P.bezierCurveTo(x1 * sc, y1 * scy, x2 * sc, y2 * scy, x * sc, y * scy); };
    const chkW = (even) => { if (!haveW) { haveW = true; if (even ? stack.length % 2 === 1 : false) width = pv.nw + stack.shift(); } };
    const exec = (s, e, dpt) => {
      if (dpt > 10) return;
      for (let p = s; p < e && !done;) {
        const b0 = b[p++];
        if (b0 >= 32 || b0 === 28) {
          if (b0 === 28) { stack.push(((b[p] << 8) | b[p + 1]) << 16 >> 16); p += 2; }
          else if (b0 <= 246) stack.push(b0 - 139);
          else if (b0 <= 250) stack.push((b0 - 247) * 256 + b[p++] + 108);
          else if (b0 <= 254) stack.push(-(b0 - 251) * 256 - b[p++] - 108);
          else { stack.push(((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) / 65536); p += 4; }
          continue;
        }
        const a = stack;
        switch (b0) {
          case 1: case 3: case 18: case 23: chkW(true); nStems += a.length >> 1; stack = []; break;
          case 19: case 20: chkW(true); nStems += a.length >> 1; stack = []; p += (nStems + 7) >> 3; break;
          case 21: if (!haveW) { haveW = true; if (a.length > 2) width = pv.nw + a.shift(); } mv(a[0] || 0, a[1] || 0); stack = []; break;
          case 22: if (!haveW) { haveW = true; if (a.length > 1) width = pv.nw + a.shift(); } mv(a[0] || 0, 0); stack = []; break;
          case 4: if (!haveW) { haveW = true; if (a.length > 1) width = pv.nw + a.shift(); } mv(0, a[0] || 0); stack = []; break;
          case 5: for (let i = 0; i + 1 < a.length; i += 2) ln(a[i], a[i + 1]); stack = []; break;
          case 6: case 7: { let h = b0 === 6; for (let i = 0; i < a.length; i++, h = !h) h ? ln(a[i], 0) : ln(0, a[i]); stack = []; break; }
          case 8: for (let i = 0; i + 5 < a.length; i += 6) cv(a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5]); stack = []; break;
          case 24: { let i = 0; for (; i + 7 < a.length; i += 6) cv(a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5]); ln(a[i], a[i + 1]); stack = []; break; }
          case 25: { let i = 0; for (; i + 7 < a.length; i += 2) ln(a[i], a[i + 1]); cv(a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5]); stack = []; break; }
          case 26: { let i = 0, dx1 = 0; if (a.length & 1) dx1 = a[i++]; for (; i + 3 < a.length; i += 4) { cv(dx1, a[i], a[i + 1], a[i + 2], 0, a[i + 3]); dx1 = 0; } stack = []; break; }
          case 27: { let i = 0, dy1 = 0; if (a.length & 1) dy1 = a[i++]; for (; i + 3 < a.length; i += 4) { cv(a[i], dy1, a[i + 1], a[i + 2], a[i + 3], 0); dy1 = 0; } stack = []; break; }
          case 30: case 31: {
            let h = b0 === 31, i = 0;
            while (i + 3 < a.length) {
              const last = a.length - i === 5 ? a[i + 4] : 0;
              if (h) cv(a[i], 0, a[i + 1], a[i + 2], last, a[i + 3]); else cv(0, a[i], a[i + 1], a[i + 2], a[i + 3], last);
              h = !h; i += 4;
            }
            stack = []; break;
          }
          case 10: { const i = a.pop() + sbias; const it = subrs[i]; if (it) exec(it[0], it[1], dpt + 1); break; }
          case 29: { const i = a.pop() + gbias; const it = gsub.items[i]; if (it) exec(it[0], it[1], dpt + 1); break; }
          case 11: return;
          case 14:
            if (!haveW) { haveW = true; if (a.length === 1 || a.length === 5) width = pv.nw + a.shift(); }
            if (a.length >= 4) { // seac
              const [adx, ady, bch, ach] = a.slice(-4), bn = nameToGid.get(ENC.StandardEncoding[bch]), an = nameToGid.get(ENC.StandardEncoding[ach]);
              if (open) P.closePath(); open = false;
              if (bn !== undefined) glyphRaw(bn, P, depth + 1);
              if (an !== undefined) { const Q = new Path2D(); glyphRaw(an, Q, depth + 1); P.addPath(Q, new DOMMatrix([1, 0, 0, 1, adx * sc, ady * scy])); }
            }
            if (open) P.closePath(); open = false; done = true; return;
          case 12: {
            const b1 = b[p++];
            if (b1 === 35) { cv(a[0], a[1], a[2], a[3], a[4], a[5]); cv(a[6], a[7], a[8], a[9], a[10], a[11]); } // flex
            else if (b1 === 34) { cv(a[0], 0, a[1], a[2], a[3], 0); cv(a[4], 0, a[5], -a[2], a[6], 0); } // hflex
            else if (b1 === 36) { cv(a[0], a[1], a[2], a[3], a[4], 0); cv(a[5], 0, a[6], a[7], a[8], -(a[1] + a[3] + a[7])); } // hflex1
            else if (b1 === 37) {
              const dx = a[0] + a[2] + a[4] + a[6] + a[8], dy = a[1] + a[3] + a[5] + a[7] + a[9];
              cv(a[0], a[1], a[2], a[3], a[4], a[5]);
              if (Math.abs(dx) > Math.abs(dy)) cv(a[6], a[7], a[8], a[9], a[10], -dy); else cv(a[6], a[7], a[8], a[9], -dx, a[10]);
            }
            stack = []; break;
          }
          default: stack = []; break;
        }
      }
      return undefined;
    };
    const it = csIdx.items[g]; if (!it) return 0;
    try { exec(it[0], it[1], 0); } catch { /* bad charstring */ }
    if (open) P.closePath();
    return width;
  };
  return {
    kind: 'cff', isCID, nameToGid, cidToGid, enc, nG, fm, charset, sidName,
    glyph(g) {
      let r = cache.get(g); if (r) return r;
      const path = new Path2D(); const w = glyphRaw(g, path, 0);
      r = { path, w: w * (fm[0] || 0.001) * 1000 }; cache.set(g, r); return r;
    },
  };
}

// ---------- Type 1 ----------
function parseType1(buf) {
  let b = buf;
  if (b[0] === 0x80) { // PFB
    const parts = []; let p = 0;
    while (p + 6 <= b.length && b[p] === 0x80 && b[p + 1] !== 3) { const len = b[p + 2] | (b[p + 3] << 8) | (b[p + 4] << 16) | (b[p + 5] << 24); parts.push(b.subarray(p + 6, p + 6 + len)); p += 6 + len; }
    b = concat(parts);
  }
  const s = latin(b), ei = s.indexOf('eexec');
  if (ei < 0) throw new Error('no eexec');
  const clear = s.slice(0, ei);
  let p = ei + 5; while (p < s.length && (s[p] === ' ' || s[p] === '\n' || s[p] === '\r' || s[p] === '\t')) p++;
  let bin = b.subarray(p);
  if (/^[0-9a-fA-F\s]{8}/.test(s.slice(p, p + 8)) && /^[0-9a-fA-F\s]{4}/.test(s.slice(p, p + 4))) { // hex form
    const hx = s.slice(p).replace(/[^0-9a-fA-F]/g, ''); const n = hx.length >> 1; bin = new Uint8Array(n); for (let i = 0; i < n; i++) bin[i] = parseInt(hx.substr(2 * i, 2), 16);
  }
  const dec = (data, r, skip) => { const o = new Uint8Array(Math.max(0, data.length - skip)); for (let i = 0; i < data.length; i++) { const c = data[i]; const pl = c ^ (r >> 8); r = ((c + r) * 52845 + 22719) & 0xFFFF; if (i >= skip) o[i - skip] = pl; } return o; };
  const priv = dec(bin, 55665, 4), ps = latin(priv);
  const lenIV = /\/lenIV\s+(\d+)/.exec(ps)?.[1] ?? 4;
  const subrs = [], chars = new Map();
  const reSub = /dup\s+(\d+)\s+(\d+)\s+(?:RD|-\|)\s/g;
  const ci = ps.indexOf('/CharStrings');
  let m;
  reSub.lastIndex = 0;
  while ((m = reSub.exec(ps)) && (ci < 0 || m.index < ci)) { const st = m.index + m[0].length, ln = +m[2]; subrs[+m[1]] = dec(priv.subarray(st, st + ln), 4330, +lenIV); reSub.lastIndex = st + ln; }
  if (ci >= 0) {
    const reC = /\/(\S+)\s+(\d+)\s+(?:RD|-\|)\s/g; reC.lastIndex = ci + 12;
    while ((m = reC.exec(ps))) { const st = m.index + m[0].length, ln = +m[2]; chars.set(m[1], dec(priv.subarray(st, st + ln), 4330, +lenIV)); reC.lastIndex = st + ln; }
  }
  const fmM = /\/FontMatrix\s*\[([^\]]*)\]/.exec(clear), fm = fmM ? fmM[1].trim().split(/\s+/).map(Number) : [0.001, 0, 0, 0.001, 0, 0];
  const enc = new Array(256).fill(null);
  if (/\/Encoding\s+StandardEncoding/.test(clear)) for (let c = 0; c < 256; c++) enc[c] = ENC.StandardEncoding[c];
  else { const re = /dup\s+(\d+)\s*\/(\S+)\s+put/g; while ((m = re.exec(clear))) enc[+m[1]] = m[2]; }
  const cache = new Map();
  const run = (name, P, depth, ox, oy) => {
    const cs = chars.get(name); if (!cs) return 0;
    const sc = fm[0] || 0.001;
    let x = 0, y = 0, sbx = 0, wx = 0, stack = [], ps2 = [], open = false, flex = false, flexPts = [];
    const mv = (dx, dy) => { x += dx; y += dy; if (flex) { flexPts.push([x, y]); return; } if (open) P.closePath(); P.moveTo((x + ox) * sc, (y + oy) * sc); open = true; };
    const ln = (dx, dy) => { if (!open) { P.moveTo((x + ox) * sc, (y + oy) * sc); open = true; } x += dx; y += dy; P.lineTo((x + ox) * sc, (y + oy) * sc); };
    const cv = (a, b2, c, d, e, f) => { if (!open) { P.moveTo((x + ox) * sc, (y + oy) * sc); open = true; } const x1 = x + a, y1 = y + b2, x2 = x1 + c, y2 = y1 + d; x = x2 + e; y = y2 + f; P.bezierCurveTo((x1 + ox) * sc, (y1 + oy) * sc, (x2 + ox) * sc, (y2 + oy) * sc, (x + ox) * sc, (y + oy) * sc); };
    let fin = false;
    const exec = (data, dpt) => {
      if (dpt > 10) return;
      for (let i = 0; i < data.length && !fin;) {
        const v = data[i++];
        if (v >= 32) {
          if (v <= 246) stack.push(v - 139); else if (v <= 250) stack.push((v - 247) * 256 + data[i++] + 108); else if (v <= 254) stack.push(-(v - 251) * 256 - data[i++] - 108);
          else { stack.push((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]); i += 4; }
          continue;
        }
        const a = stack;
        switch (v) {
          case 13: sbx = a[0]; wx = a[1]; x = sbx; y = 0; stack = []; break;
          case 1: case 3: stack = []; break;
          case 4: mv(0, a[0]); stack = []; break;
          case 5: ln(a[0], a[1]); stack = []; break;
          case 6: ln(a[0], 0); stack = []; break;
          case 7: ln(0, a[0]); stack = []; break;
          case 8: cv(a[0], a[1], a[2], a[3], a[4], a[5]); stack = []; break;
          case 9: if (open) { P.closePath(); open = false; } stack = []; break;
          case 10: { const n = a.pop(); if (subrs[n]) exec(subrs[n], dpt + 1); break; }
          case 11: return;
          case 14: fin = true; return;
          case 21: mv(a[0], a[1]); stack = []; break;
          case 22: mv(a[0], 0); stack = []; break;
          case 30: cv(0, a[0], a[1], a[2], a[3], 0); stack = []; break;
          case 31: cv(a[0], 0, a[1], a[2], 0, a[3]); stack = []; break;
          case 12: {
            const v2 = data[i++];
            if (v2 === 7) { sbx = a[0]; wx = a[2]; x = sbx; y = a[1]; stack = []; }
            else if (v2 === 12) { const q = a.pop(), r = a.pop(); a.push(r / q); }
            else if (v2 === 16) {
              const idx = a.pop(), n = a.pop(), args = []; for (let k = 0; k < n; k++) args.push(a.pop());
              if (idx === 1) { flex = true; flexPts = []; }
              else if (idx === 2) { /* point collected by rmoveto */ }
              else if (idx === 0) {
                flex = false;
                if (flexPts.length >= 7) {
                  const f = flexPts; if (!open) { P.moveTo((f[0][0] + ox) * sc, (f[0][1] + oy) * sc); open = true; }
                  P.bezierCurveTo((f[1][0] + ox) * sc, (f[1][1] + oy) * sc, (f[2][0] + ox) * sc, (f[2][1] + oy) * sc, (f[3][0] + ox) * sc, (f[3][1] + oy) * sc);
                  P.bezierCurveTo((f[4][0] + ox) * sc, (f[4][1] + oy) * sc, (f[5][0] + ox) * sc, (f[5][1] + oy) * sc, (f[6][0] + ox) * sc, (f[6][1] + oy) * sc);
                  x = f[6][0]; y = f[6][1];
                }
                ps2 = [y, x];
              } else ps2 = args;
            } else if (v2 === 17) a.push(ps2.length ? ps2.pop() : 0);
            else if (v2 === 33) { x = a[0]; y = a[1]; stack = []; }
            else if (v2 === 6) { // seac
              const [asb, adx, ady, bch, ach] = a; stack = [];
              const bn = ENC.StandardEncoding[bch], an = ENC.StandardEncoding[ach];
              if (open) P.closePath(); open = false;
              if (bn) run(bn, P, depth + 1, ox, oy);
              if (an) run(an, P, depth + 1, ox + sbx - asb + adx, oy + ady);
              fin = true; return;
            } else stack = [];
            break;
          }
          default: stack = []; break;
        }
      }
    };
    try { exec(cs, 0); } catch { /* bad charstring */ }
    if (open) P.closePath();
    return wx;
  };
  return {
    kind: 't1', enc, fm, has: (n) => chars.has(n),
    glyph(name) {
      let r = cache.get(name); if (r) return r;
      const path = new Path2D(), w = run(name, path, 0, 0, 0);
      r = { path, w: w * (fm[0] || 0.001) * 1000 }; cache.set(name, r); return r;
    },
  };
}

const AFM = {
  Helvetica: '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584 0 556 0 222 556 333 1000 556 556 333 1000 667 333 1000 0 611 0 0 222 222 333 333 350 556 1000 333 1000 500 333 944 0 500 500 278 333 556 556 556 556 260 556 333 737 370 556 584 333 737 333 400 584 333 333 333 556 537 278 333 333 365 556 834 834 834 611 667 667 667 667 667 667 1000 722 667 667 667 667 278 278 278 278 722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611 556 556 556 556 556 556 889 500 556 556 556 556 278 278 278 278 556 556 556 556 556 556 556 584 611 556 556 556 556 500 556 500',
  HelveticaB: '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584 0 556 0 278 556 500 1000 556 556 333 1000 667 333 1000 0 611 0 0 278 278 500 500 350 556 1000 333 1000 556 333 944 0 500 556 278 333 556 556 556 556 280 556 333 737 370 556 584 333 737 333 400 584 333 333 333 611 556 278 333 333 365 556 834 834 834 611 722 722 722 722 722 722 1000 722 667 667 667 667 278 278 278 278 722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611 556 556 556 556 556 556 889 556 556 556 556 556 278 278 278 278 611 611 611 611 611 611 611 584 611 611 611 611 611 556 611 556',
  Times: '250 333 408 500 500 833 778 180 333 333 500 564 250 333 250 278 500 500 500 500 500 500 500 500 500 500 278 278 564 564 564 444 921 722 667 667 722 611 556 722 722 333 389 722 611 889 722 722 556 722 667 556 611 722 722 944 722 722 611 333 278 333 469 500 333 444 500 444 500 444 333 500 500 278 278 500 278 778 500 500 500 500 333 389 278 500 500 722 500 500 444 480 200 480 541 0 500 0 333 500 444 1000 500 500 333 1000 556 333 889 0 611 0 0 333 333 444 444 350 500 1000 333 980 389 333 722 0 444 500 250 333 500 500 500 500 200 500 333 760 276 500 564 333 760 333 400 564 300 300 333 500 453 250 333 300 310 500 750 750 750 444 722 722 722 722 722 722 889 667 611 611 611 611 333 333 333 333 722 722 722 722 722 722 722 564 722 722 722 722 722 722 556 500 444 444 444 444 444 444 667 444 444 444 444 444 278 278 278 278 500 500 500 500 500 500 500 564 500 500 500 500 500 500 500 500',
  TimesB: '250 333 555 500 500 1000 833 278 333 333 500 570 250 333 250 278 500 500 500 500 500 500 500 500 500 500 333 333 570 570 570 500 930 722 667 722 722 667 611 778 778 389 500 778 667 944 722 778 611 778 722 556 667 722 722 1000 722 722 667 333 278 333 581 500 333 500 556 444 556 444 333 500 556 278 333 556 278 833 556 500 556 556 444 389 333 556 500 722 500 500 444 394 220 394 520 0 500 0 333 500 500 1000 500 500 333 1000 556 333 1000 0 667 0 0 333 333 500 500 350 500 1000 333 1000 389 333 722 0 444 500 250 333 500 500 500 500 220 500 333 747 300 500 570 333 747 333 400 570 300 300 333 556 540 250 333 300 330 500 750 750 750 500 722 722 722 722 722 722 1000 722 667 667 667 667 389 389 389 389 722 722 778 778 778 778 778 570 778 722 722 722 722 722 611 556 500 500 500 500 500 500 722 444 444 444 444 444 278 278 278 278 500 556 500 500 500 500 500 570 500 556 556 556 556 500 556 500',
};

const AFMT = Object.fromEntries(Object.entries(AFM).map(([k, v]) => [k, v.split(' ').map(Number)]));
const U2CP = new Map(); for (let c = 32; c < 256; c++) U2CP.set(cp1252.decode(Uint8Array.of(c)).codePointAt(0), c);
const afmWidth = (kind, bold, u) => {
  if (kind === 'mono') return 600;
  const t = AFMT[(kind === 'serif' ? 'Times' : 'Helvetica') + (bold ? 'B' : '')], c = U2CP.get(u);
  return c ? t[c - 32] || 0 : kind === 'serif' ? 500 : 556;
};
let MAC_REV = null;
const SYS_FAM = {
  sans: 'Helvetica, Arial, "Liberation Sans", "Nimbus Sans", Arimo, "DejaVu Sans", sans-serif',
  serif: 'Times, "Times New Roman", "Liberation Serif", "Nimbus Roman", Tinos, "DejaVu Serif", serif',
  mono: 'Courier, "Courier New", "Liberation Mono", "Nimbus Mono PS", Cousine, "DejaVu Sans Mono", monospace',
  symbol: '"Standard Symbols PS", Symbol, "DejaVu Sans", "Liberation Sans", sans-serif',
  zapf: 'ZapfDingbats, D050000L, "Dingbats", "DejaVu Sans", "Noto Sans Symbols2", sans-serif',
};
function sysInfo(name, desc, d) {
  const n = name.toLowerCase().replace(/[\s_,-]/g, ''), flags = d.num(desc?.Flags, 0);
  let kind = 'sans';
  if (/courier|mono|consolas|lucidaconsole|typewriter|cmtt|nimbusmon/.test(n) || (flags & 1)) kind = 'mono';
  else if (/^symbol|symbolmt/.test(n)) kind = 'symbol';
  else if (/dingbats/.test(n)) kind = 'zapf';
  else if (!/sans|arial|helvet|verdana|tahoma|calibri/.test(n) && (/times|serif|georgia|garamond|palatino|bookman|minion|cambria|roman|cmr|nimbusrom|century|charter|latin ?modern|lmroman/.test(n) || (flags & 2))) kind = 'serif';
  const bold = /bold|black|heavy|semibold|demi/.test(n) || !!(flags & 0x40000) || d.num(desc?.FontWeight, 400) >= 700;
  const italic = /italic|oblique|ital$/.test(n) || !!(flags & 64) || d.num(desc?.ItalicAngle, 0) !== 0;
  return { kind, bold, italic, fam: SYS_FAM[kind] || SYS_FAM.symbol };
}
const sysFontStr = (s) => `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}1000px ${s.fam}`;

async function embeddedProgram(d, desc, rc) {
  if (!desc) return null;
  try {
    const f2 = d.r(desc.FontFile2), f3 = d.r(desc.FontFile3), f1 = d.r(desc.FontFile);
    const st = isStream(f2) ? f2 : isStream(f3) ? f3 : isStream(f1) ? f1 : null;
    if (!st) return null;
    const bytes = (await decodeStream(d, st)).data, tag = latin(bytes.subarray(0, 4));
    if (tag === 'OTTO' || tag === 'true' || tag === 'ttcf' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) return parseTTF(bytes);
    if (bytes[0] === 1 && bytes[1] === 0 && isStream(f3)) return parseCFF(bytes);
    if (bytes[0] === 0x80 || tag.startsWith('%!')) return parseType1(bytes);
    if (isStream(f3)) return parseCFF(bytes);
    return parseTTF(bytes);
  } catch (e) { rc.warn.add('embedded font program could not be parsed (' + e.message + '); using a system font'); return null; }
}
async function readCMapStream(d, o) {
  o = d.r(o);
  if (!isStream(o)) return null;
  try { return parseCMap(latin((await decodeStream(d, o)).data)); } catch { return null; }
}

async function loadFont(d, fo, rc) {
  const f = d.dict(fo) || {}, sub = d.r(f.Subtype)?.n, base = (d.r(f.BaseFont)?.n || '').replace(/^[A-Z]{6}\+/, '');
  const toUni = await readCMapStream(d, f.ToUnicode);
  if (sub === 'Type3') return loadType3(d, f, rc, toUni);
  if (sub === 'Type0') return loadType0(d, f, rc, toUni, base);
  const desc = d.dict(f.FontDescriptor) || (sub ? null : null), flags = d.num(desc?.Flags, 0);
  const si = sysInfo(base, desc, d), prog = await embeddedProgram(d, desc, rc);
  const symbolic = !!(flags & 4) && !(flags & 32);
  // encoding
  const eo = d.r(f.Encoding), diffs = {};
  let baseName = isName(eo) ? eo.n : isDict(eo) ? d.r(eo.BaseEncoding)?.n : null;
  if (isDict(eo) && isArr(d.r(eo.Differences))) { let c = 0; for (const x of d.r(eo.Differences)) { const v = d.r(x); if (typeof v === 'number') c = v; else if (isName(v)) diffs[c++] = v.n; } }
  const hasEnc = !!(baseName && ENC[baseName]) || Object.keys(diffs).length > 0;
  let baseNames = baseName && ENC[baseName] ? ENC[baseName] : null;
  if (!baseNames && !prog) baseNames = sub === 'TrueType' || !symbolic ? (sub === 'TrueType' ? ENC.WinAnsiEncoding : ENC.StandardEncoding) : null;
  if (!baseNames && prog?.kind === 'ttf' && !symbolic) baseNames = ENC.WinAnsiEncoding;
  if (!baseNames && prog?.kind === 'cff' && symbolic === false && !prog.isCID && !Object.keys(diffs).length) baseNames = null;
  const nameOf = (code) => diffs[code] ?? baseNames?.[code] ?? null;
  const first = d.num(f.FirstChar, 0), wArr = d.r(f.Widths), widths = isArr(wArr) ? wArr.map((x) => d.num(x, 0)) : null, miss = d.num(desc?.MissingWidth, 0);
  const std = !widths && !prog;
  const recs = new Array(256);
  const rec = (code) => {
    if (recs[code]) return recs[code];
    const name = nameOf(code);
    let path = null, pw = null, ch = '';
    let u = nameToUni(name) || 0;
    if (!u && toUni) { const s = toUni.uni(code); if (s) u = s.codePointAt(0); }
    if (si.kind === 'symbol' && !prog) { const sm = SYM_MAP.get(code); if (sm) u = sm.codePointAt(0); }
    if (si.kind === 'zapf' && !prog) u = zapfMap(code) || u;
    if (prog) {
      let gl = null;
      if (prog.kind === 't1') {
        const nm = name ?? prog.enc[code];
        if (nm && prog.has(nm)) gl = prog.glyph(nm); else if (prog.enc[code] && prog.has(prog.enc[code])) gl = prog.glyph(prog.enc[code]);
        if (!u) u = nameToUni(nm);
      } else if (prog.kind === 'cff') {
        let g;
        if (name != null) g = prog.nameToGid.get(name);
        if (g === undefined && !prog.isCID) g = prog.enc[code] || undefined;
        if (g === undefined && prog.isCID) g = code;
        if (g !== undefined) gl = prog.glyph(g);
      } else if (prog.kind === 'ttf') {
        const cm = prog.cmaps, c31 = cm.find((c) => c.pid === 3 && c.eid === 1) || cm.find((c) => c.pid === 0) || cm.find((c) => c.pid === 3 && c.eid === 10), c30 = cm.find((c) => c.pid === 3 && c.eid === 0), c10 = cm.find((c) => c.pid === 1 && c.eid === 0);
        let gid = 0;
        if (name && (hasEnc || !symbolic)) {
          const uu = nameToUni(name);
          if (c31 && uu) gid = c31.look(uu);
          if (!gid && c10 && uu) { if (!MAC_REV) { MAC_REV = new Map(); for (let c = 32; c < 256; c++) MAC_REV.set(macRoman.decode(Uint8Array.of(c)).codePointAt(0), c); } const mc = MAC_REV.get(uu); if (mc) gid = c10.look(mc); }
        }
        if (!gid && c30) gid = c30.look(code) || c30.look(0xF000 + code) || c30.look(0xF100 + code) || c30.look(0xF200 + code);
        if (!gid && c10) gid = c10.look(code);
        if (!gid && c31) gid = c31.look(code) || c31.look(0xF000 + code);
        if (!gid && !cm.length) gid = code;
        gl = prog.glyph(gid);
      }
      if (gl) { path = gl.path; pw = gl.w; }
    }
    if (u) ch = String.fromCodePoint(u); else if (!prog) ch = code >= 32 ? String.fromCharCode(code) : '';
    let w;
    if (widths && code >= first && code - first < widths.length) w = widths[code - first];
    else if (widths) w = miss;
    else if (std || pw == null) w = u ? afmWidth(si.kind, si.bold, u) : miss || 500;
    else w = pw;
    return (recs[code] = { w: w / 1000, sp: code === 32, path, ch });
  };
  return { kind: 'simple', sys: prog ? null : si, decode: (bytes) => Array.from(bytes, rec), sysFallback: si, hasProg: !!prog };
}

async function loadType0(d, f, rc, toUni, base) {
  const cf = d.dict(d.r(f.DescendantFonts)?.[0]) || {}, desc = d.dict(cf.FontDescriptor), cst = d.r(cf.Subtype)?.n;
  const prog = await embeddedProgram(d, desc, rc), si = sysInfo(d.r(cf.BaseFont)?.n || base, desc, d);
  const eo = d.r(f.Encoding);
  let cmap = null, vertical = false;
  if (isStream(eo)) { cmap = await readCMapStream(d, eo); if (cmap && !cmap.ranges.length && !cmap.chars.size) cmap = null; }
  else if (isName(eo)) { vertical = /-V$/.test(eo.n); if (!/^Identity/.test(eo.n)) rc.warn.add('predefined CMap ' + eo.n + ' not available; treated as 2-byte identity'); }
  const dw = d.num(cf.DW, 1000), W = new Map(), wa = d.r(cf.W);
  if (isArr(wa)) {
    for (let i = 0; i < wa.length;) {
      const c0 = d.num(wa[i], 0), nx = d.r(wa[i + 1]);
      if (isArr(nx)) { nx.forEach((x, k) => W.set(c0 + k, d.num(x, 0))); i += 2; }
      else { const c1 = d.num(nx, 0), w = d.num(wa[i + 2], 0); for (let c = c0; c <= c1 && c - c0 < 70000; c++) W.set(c, w); i += 3; }
    }
  }
  let c2g = null;
  const c2gO = d.r(cf.CIDToGIDMap);
  if (isStream(c2gO)) c2g = (await decodeStream(d, c2gO)).data;
  const cache = new Map();
  const rec = (code, cid, nb) => {
    const key = code * 8 + nb; let r = cache.get(key); if (r) return r;
    let path = null, pw = null;
    if (prog) {
      let gl = null;
      if (prog.kind === 'ttf') gl = prog.glyph(c2g ? (c2g[2 * cid] << 8) | c2g[2 * cid + 1] : cid);
      else if (prog.kind === 'cff') gl = prog.glyph(prog.isCID ? (prog.cidToGid.get(cid) ?? 0) : cid);
      else if (prog.kind === 't1') gl = null;
      if (gl) { path = gl.path; pw = gl.w; }
    }
    let ch = '';
    if (!prog) { const s = toUni ? toUni.uni(code) : ''; ch = s || (cmap ? '' : ''); }
    const w = W.has(cid) ? W.get(cid) : dw;
    r = { w: w / 1000, sp: nb === 1 && code === 32, path, ch }; void pw; void cst;
    cache.set(key, r); return r;
  };
  const decode = (bytes) => {
    const out = [];
    if (cmap) for (const [code, nb] of cmap.split(bytes)) out.push(rec(code, cmap.cid(code), nb));
    else for (let i = 0; i + 1 < bytes.length; i += 2) { const c = (bytes[i] << 8) | bytes[i + 1]; out.push(rec(c, c, 2)); }
    return out;
  };
  return { kind: 'type0', sys: prog ? null : si, decode, vertical, hasProg: !!prog, sysFallback: si };
}

async function loadType3(d, f, rc, toUni) {
  const fm = d.nums(f.FontMatrix) || [0.001, 0, 0, 0.001, 0, 0], procs = d.dict(f.CharProcs) || {}, eo = d.r(f.Encoding), names = [];
  if (isDict(eo) && isArr(d.r(eo.Differences))) { let c = 0; for (const x of d.r(eo.Differences)) { const v = d.r(x); if (typeof v === 'number') c = v; else if (isName(v)) names[c++] = v.n; } }
  else if (isName(eo) && ENC[eo.n]) ENC[eo.n].forEach((n, i) => { names[i] = n; });
  const first = d.num(f.FirstChar, 0), wArr = d.nums(f.Widths) || [], res = d.dict(f.Resources);
  const recs = [];
  const rec = (code) => recs[code] || (recs[code] = { w: ((wArr[code - first] ?? 0) * fm[0]), sp: code === 32, path: null, ch: '', proc: names[code] ? d.r(procs[names[code]]) : null });
  void toUni; void rc;
  return { kind: 'type3', fm, res, sys: null, decode: (bytes) => Array.from(bytes, rec) };
}

// ---------- renderer ----------
const mmul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
const fromDM = (m) => [m.a, m.b, m.c, m.d, m.e, m.f];
const scaleOf = (m) => { const a = m.a ?? m[0], b = m.b ?? m[1], c = m.c ?? m[2], d = m.d ?? m[3]; return Math.sqrt(Math.abs(a * d - b * c)) || 1e-9; };
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
const rgbCss = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const BLEND = { Normal: 'source-over', Compatible: 'source-over', Multiply: 'multiply', Screen: 'screen', Overlay: 'overlay', Darken: 'darken', Lighten: 'lighten', ColorDodge: 'color-dodge', ColorBurn: 'color-burn', HardLight: 'hard-light', SoftLight: 'soft-light', Difference: 'difference', Exclusion: 'exclusion', Hue: 'hue', Saturation: 'saturation', Color: 'color', Luminosity: 'luminosity' };
const solid = (cs, comps) => { const rgb = cs.rgb(comps); return { cs, comps, rgb, css: rgbCss(rgb), pat: null }; };
const IDENT = [1, 0, 0, 1, 0, 0];

class R {
  constructor(d, opts = {}) {
    this.d = d; this.opts = opts; this.warn = new Set(); this.fonts = new WeakMap(); this.imgCache = new WeakMap(); this.opCache = new WeakMap();
    this.depth = 0; this.hide = 0; this.mc = []; this.noColor = 0; this.stack = []; this.ocOff = new Set(); this.ocAll = null;
    this.initOC();
  }
  initOC() {
    const d = this.d, oc = d.dict(d.catalog?.OCProperties), cfg = d.dict(oc?.D);
    if (!cfg) return;
    const offs = d.r(cfg.OFF), ons = d.r(cfg.ON);
    if (d.r(cfg.BaseState)?.n === 'OFF') { const onset = new Set((isArr(ons) ? ons : []).map((x) => x.n)); for (const g of d.r(oc.OCGs) || []) if (!onset.has(g.n)) this.ocOff.add(g.n); }
    if (isArr(offs)) for (const g of offs) if (typeof g?.n === 'number') this.ocOff.add(g.n);
  }
  ocVisible(raw) {
    const d = this.d, o = d.dict(raw);
    if (!o) return true;
    if (typeof raw?.n === 'number' && d.r(o.Type)?.n !== 'OCMD') return !this.ocOff.has(raw.n);
    if (d.r(o.Type)?.n === 'OCMD') {
      const g = d.r(o.OCGs) == null ? [] : isArr(d.r(o.OCGs)) ? d.r(o.OCGs) : [o.OCGs];
      if (!g.length) return true;
      const on = g.map((x) => !this.ocOff.has(x.n)), p = d.r(o.P)?.n || 'AnyOn';
      return p === 'AllOn' ? on.every(Boolean) : p === 'AnyOff' ? on.some((v) => !v) : p === 'AllOff' ? on.every((v) => !v) : on.some(Boolean);
    }
    return true;
  }
  newGS() { return { fill: solid(GRAY, [0]), stroke: solid(GRAY, [0]), lw: 1, cap: 0, join: 0, ml: 10, dash: [], dp: 0, fa: 1, sa: 1, bm: 'source-over', font: null, fs: 0, tc: 0, tw: 0, th: 1, tl: 0, rise: 0, mode: 0 }; }

  // ----- page -----
  async renderPage(i, o = {}) {
    const d = this.d, info = d.info(i), pg = d.pages[i];
    const uu = d.num(pg.dict.UserUnit, 1) || 1, s = (o.dpi || 150) / 72 * uu;
    const W = Math.max(1, Math.ceil(info.w * s - 1e-6)), H = Math.max(1, Math.ceil(info.h * s - 1e-6));
    if (W * H > 120e6 || W > 32000 || H > 32000) throw new Error(`Page ${i + 1} would be ${W}x${H} px; lower the DPI`);
    const sx = s, sy = s, [x0, y0, x1, y1] = info.vis;
    const base = info.rot === 0 ? [sx, 0, 0, -sy, -x0 * sx, y1 * sy] : info.rot === 90 ? [0, sy, sx, 0, -y0 * sx, -x0 * sy] : info.rot === 180 ? [-sx, 0, 0, sy, x1 * sx, -y0 * sy] : [0, -sy, -sx, 0, y1 * sx, x1 * sy];
    const cnv = mkCanvas(W, H), ctx = cnv.getContext('2d');
    this.ctx = ctx; this.W = W; this.H = H; this.baseM = base; this.stack = []; this.hide = 0; this.mc = [];
    ctx.setTransform(...base); this.path = new Path2D();
    this.gs = this.newGS(); this.cp = [0, 0]; this.sp = [0, 0]; this.tm = IDENT.slice(); this.tlm = IDENT.slice(); this.pendingClip = null;
    const res = d.dict(pg.dict.Resources !== undefined ? pg.dict.Resources : pg.inh.Resources) || {};
    let c = d.r(pg.dict.Contents); c = isArr(c) ? c : c ? [c] : [];
    const parts = [];
    for (const x of c) { const st = d.r(x); if (isStream(st)) { try { parts.push(latin((await decodeStream(d, st)).data)); } catch (e) { this.warn.add('content stream: ' + e.message); } } }
    const ops = parseContent(parts.join('\n'));
    await this.run(ops, res);
    if (o.annots !== false) await this.annots(pg, base);
    if (!o.background || o.background === 'transparent') return cnv;
    // the page group starts transparent (blend modes need that) and is composited on the paper colour at the end
    const out = mkCanvas(W, H), oc = out.getContext('2d');
    oc.fillStyle = o.background; oc.fillRect(0, 0, W, H); oc.drawImage(cnv, 0, 0);
    return out;
  }
  async annots(pg, base) {
    const d = this.d, an = d.r(pg.dict.Annots);
    if (!isArr(an)) return;
    for (const a of an) {
      try {
        const ad = d.dict(a); if (!ad) continue;
        const sub = d.r(ad.Subtype)?.n, fl = d.num(ad.F, 0);
        if (sub === 'Popup' || (fl & 2) || (fl & 32)) continue;
        if (ad.OC && !this.ocVisible(ad.OC)) continue;
        let n = d.dict(ad.AP)?.N; n = d.r(n);
        if (isDict(n) && !isStream(n)) { const as = d.r(ad.AS)?.n; n = as ? d.r(n[as]) : null; }
        if (!isStream(n)) continue;
        const rect = d.box(ad.Rect), bb = d.box(n.dict.BBox) || [0, 0, 1, 1], m = d.nums(n.dict.Matrix) || IDENT;
        if (!rect) continue;
        const pts = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
        const tx0 = Math.min(...pts.map((p) => p[0])), tx1 = Math.max(...pts.map((p) => p[0])), ty0 = Math.min(...pts.map((p) => p[1])), ty1 = Math.max(...pts.map((p) => p[1]));
        const sx = tx1 - tx0 ? (rect[2] - rect[0]) / (tx1 - tx0) : 1, sy = ty1 - ty0 ? (rect[3] - rect[1]) / (ty1 - ty0) : 1;
        const A = [sx, 0, 0, sy, rect[0] - tx0 * sx, rect[1] - ty0 * sy];
        this.ctx.save(); this.ctx.setTransform(...base); this.ctx.transform(...A);
        this.gs = this.newGS(); this.baseM = base;
        await this.doForm(n);
        this.ctx.restore();
      } catch (e) { this.warn.add('annotation: ' + e.message); }
    }
  }

  async run(ops, res) {
    const sres = this.res, sd = this.stack.length, shide = this.hide, smc = this.mc, sfl = this.floor;
    this.res = res; this.mc = []; this.floor = sd;
    for (const op of ops) {
      try { await this.exec(op); } catch (e) { this.warn.add(`operator ${op.k}: ${e.message}`); }
    }
    while (this.stack.length > sd) this.Q();
    this.res = sres; this.hide = shide; this.mc = smc; this.floor = sfl;
  }
  q() { this.ctx.save(); this.stack.push(this.gs); this.gs = { ...this.gs }; }
  Q() { if (this.stack.length <= (this.floor || 0)) return; this.ctx.restore(); this.gs = this.stack.pop(); }

  async exec(op) {
    const a = op.a, ctx = this.ctx, g = this.gs, d = this.d;
    switch (op.k) {
      case 'q': this.q(); break;
      case 'Q': this.Q(); break;
      case 'cm': if (a.length >= 6) ctx.transform(a[0], a[1], a[2], a[3], a[4], a[5]); break;
      case 'w': g.lw = a[0] ?? 1; break;
      case 'J': g.cap = a[0] | 0; break;
      case 'j': g.join = a[0] | 0; break;
      case 'M': g.ml = a[0] ?? 10; break;
      case 'd': g.dash = (isArr(a[0]) ? a[0] : []).filter((x) => typeof x === 'number'); g.dp = a[1] || 0; if (!g.dash.some((x) => x > 0)) g.dash = []; break;
      case 'ri': case 'i': break;
      case 'gs': await this.extGState(a[0]); break;
      // path construction
      case 'm': this.path.moveTo(a[0], a[1]); this.cp = [a[0], a[1]]; this.sp = this.cp; break;
      case 'l': this.path.lineTo(a[0], a[1]); this.cp = [a[0], a[1]]; break;
      case 'c': this.path.bezierCurveTo(a[0], a[1], a[2], a[3], a[4], a[5]); this.cp = [a[4], a[5]]; break;
      case 'v': this.path.bezierCurveTo(this.cp[0], this.cp[1], a[0], a[1], a[2], a[3]); this.cp = [a[2], a[3]]; break;
      case 'y': this.path.bezierCurveTo(a[0], a[1], a[2], a[3], a[2], a[3]); this.cp = [a[2], a[3]]; break;
      case 'h': this.path.closePath(); this.cp = this.sp; break;
      case 're': this.path.rect(a[0], a[1], a[2], a[3]); this.cp = [a[0], a[1]]; this.sp = this.cp; break;
      // painting
      case 'S': this.paint(false, true, null); break;
      case 's': this.path.closePath(); this.paint(false, true, null); break;
      case 'f': case 'F': this.paint(true, false, 'nonzero'); break;
      case 'f*': this.paint(true, false, 'evenodd'); break;
      case 'B': this.paint(true, true, 'nonzero'); break;
      case 'B*': this.paint(true, true, 'evenodd'); break;
      case 'b': this.path.closePath(); this.paint(true, true, 'nonzero'); break;
      case 'b*': this.path.closePath(); this.paint(true, true, 'evenodd'); break;
      case 'n': this.paint(false, false, null); break;
      case 'W': this.pendingClip = 'nonzero'; break;
      case 'W*': this.pendingClip = 'evenodd'; break;
      // colour
      case 'g': case 'G': { const w = op.k === 'g' ? 'fill' : 'stroke'; if (!this.noColor) g[w] = solid(GRAY, [a[0] ?? 0]); break; }
      case 'rg': case 'RG': { const w = op.k === 'rg' ? 'fill' : 'stroke'; if (!this.noColor) g[w] = solid(RGB, [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0]); break; }
      case 'k': case 'K': { const w = op.k === 'k' ? 'fill' : 'stroke'; if (!this.noColor) g[w] = solid(CMYK, [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 0]); break; }
      case 'cs': case 'CS': { if (this.noColor) break; const cs = await parseCS(d, a[0], this.res); g[op.k === 'cs' ? 'fill' : 'stroke'] = cs.pattern ? { cs, comps: [], rgb: [0, 0, 0], css: '#000', pat: null } : solid(cs, cs.init.slice()); break; }
      case 'sc': case 'scn': case 'SC': case 'SCN': {
        if (this.noColor) break;
        const w = op.k[0] === 's' ? 'fill' : 'stroke', cur = g[w], cs = cur.cs;
        if (cs.pattern) {
          const nm = a[a.length - 1];
          if (nm instanceof CName) {
            const comps = a.slice(0, -1).filter((x) => typeof x === 'number');
            const base = cs.base ? solid(cs.base, comps) : null;
            const pat = await makePattern(this, nm.n, base);
            g[w] = { cs, comps, rgb: base?.rgb || [128, 128, 128], css: base?.css || '#808080', pat };
          }
        } else {
          const comps = a.filter((x) => typeof x === 'number'); while (comps.length < cs.n) comps.push(0);
          g[w] = solid(cs, comps);
        }
        break;
      }
      case 'sh': {
        if (this.hide) break;
        const sh = d.dict(this.res?.Shading)?.[a[0].n];
        if (sh === undefined) break;
        const m = ctx.getTransform(), st = await shadingStyle(this, sh, m);
        if (!st) break;
        await this.masked(() => { const ctx = this.ctx; ctx.globalAlpha = g.fa; ctx.globalCompositeOperation = g.bm;
        ctx.save();
        if (st.raster) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(st.raster, 0, 0); }
        else {
          ctx.fillStyle = st.style; const inv = m.inverse(), pts = [[0, 0], [this.W, 0], [0, this.H], [this.W, this.H]].map(([x, y]) => inv.transformPoint(new DOMPoint(x, y)));
          const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x)), y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
        ctx.restore(); });
        break;
      }
      // xobjects / images
      case 'Do': {
        const xo = d.r(d.dict(this.res?.XObject)?.[a[0]?.n]);
        if (!isStream(xo) || this.hide) break;
        if (xo.dict.OC && !this.ocVisible(xo.dict.OC)) break;
        const sub = d.r(xo.dict.Subtype)?.n;
        if (sub === 'Image') await this.masked(() => drawImage(this, xo, false));
        else if (sub === 'Form') await this.masked(() => this.doForm(xo));
        break;
      }
      case 'BI': if (!this.hide) await this.masked(() => drawImage(this, { dict: a[0], data: a[1], inline: true }, true)); break;
      // text
      case 'BT': this.tm = IDENT.slice(); this.tlm = IDENT.slice(); this.textClip = null; this.textMask = null; break;
      case 'ET':
        if (this.textClip) { const m = ctx.getTransform(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clip(this.textClip); ctx.setTransform(m); this.textClip = null; }
        if (this.textMask) { // clip by system-font text: realised as a soft mask for the rest of the graphics state
          const tm = this.textMask; this.textMask = null;
          if (g.smask) { const sc = g.smask.getContext('2d'); sc.globalCompositeOperation = 'destination-in'; sc.drawImage(tm, 0, 0); sc.globalCompositeOperation = 'source-over'; } else g.smask = tm;
        }
        break;
      case 'Tc': g.tc = a[0] || 0; break;
      case 'Tw': g.tw = a[0] || 0; break;
      case 'Tz': g.th = (a[0] ?? 100) / 100; break;
      case 'TL': g.tl = a[0] || 0; break;
      case 'Ts': g.rise = a[0] || 0; break;
      case 'Tr': g.mode = a[0] | 0; break;
      case 'Tf': {
        g.fs = a[1] || 0;
        const fo = d.dict(this.res?.Font)?.[a[0]?.n], fr = d.r(fo);
        if (fr == null) { g.font = null; this.warn.add('font ' + a[0]?.n + ' not found'); break; }
        let ft = this.fonts.get(fr);
        if (!ft) { try { ft = await loadFont(d, fr, this); } catch (e) { this.warn.add('font: ' + e.message); ft = null; } if (ft) this.fonts.set(fr, ft); }
        g.font = ft; break;
      }
      case 'Td': this.tlm = mmul([1, 0, 0, 1, a[0] || 0, a[1] || 0], this.tlm); this.tm = this.tlm.slice(); break;
      case 'TD': g.tl = -(a[1] || 0); this.tlm = mmul([1, 0, 0, 1, a[0] || 0, a[1] || 0], this.tlm); this.tm = this.tlm.slice(); break;
      case 'Tm': if (a.length >= 6) { this.tlm = a.slice(0, 6); this.tm = this.tlm.slice(); } break;
      case 'T*': this.tlm = mmul([1, 0, 0, 1, 0, -g.tl], this.tlm); this.tm = this.tlm.slice(); break;
      case 'Tj': if (isStr(a[0])) await this.masked(() => this.showText(a[0].b)); break;
      case 'TJ':
        if (isArr(a[0])) await this.masked(async () => { for (const x of a[0]) { if (isStr(x)) await this.showText(x.b); else if (typeof x === 'number') this.tm = mmul([1, 0, 0, 1, -x / 1000 * g.fs * g.th, 0], this.tm); } });
        break;
      case "'": this.tlm = mmul([1, 0, 0, 1, 0, -g.tl], this.tlm); this.tm = this.tlm.slice(); if (isStr(a[0])) await this.masked(() => this.showText(a[0].b)); break;
      case '"': g.tw = a[0] || 0; g.tc = a[1] || 0; this.tlm = mmul([1, 0, 0, 1, 0, -g.tl], this.tlm); this.tm = this.tlm.slice(); if (isStr(a[2])) await this.masked(() => this.showText(a[2].b)); break;
      // type 3 glyph metrics
      case 'd0': break;
      case 'd1': break;
      // marked content
      case 'BMC': this.mc.push(false); break;
      case 'BDC': {
        let hid = false;
        if (a[0]?.n === 'OC') { const raw = a[1] instanceof CName ? d.dict(this.res?.Properties)?.[a[1].n] : a[1]; if (raw !== undefined && !this.ocVisible(raw)) hid = true; }
        this.mc.push(hid); if (hid) this.hide++;
        break;
      }
      case 'EMC': if (this.mc.length && this.mc.pop()) this.hide--; break;
      case 'MP': case 'DP': case 'BX': case 'EX': break;
      default: this.warn.add('unknown operator ' + op.k);
    }
  }

  async extGState(nm) {
    const d = this.d, e = d.dict(d.dict(this.res?.ExtGState)?.[nm?.n]);
    if (!e) return;
    const g = this.gs;
    for (const [k, v0] of Object.entries(e)) {
      const v = d.r(v0);
      switch (k) {
        case 'LW': g.lw = v; break; case 'LC': g.cap = v; break; case 'LJ': g.join = v; break; case 'ML': g.ml = v; break;
        case 'D': if (isArr(v)) { g.dash = (d.nums(v[0]) || []).filter((x) => x >= 0); g.dp = d.num(v[1], 0); if (!g.dash.some((x) => x > 0)) g.dash = []; } break;
        case 'CA': g.sa = typeof v === 'number' ? v : 1; break;
        case 'ca': g.fa = typeof v === 'number' ? v : 1; break;
        case 'BM': { const nmv = isArr(v) ? d.r(v[0])?.n : v?.n; g.bm = BLEND[nmv] || 'source-over'; break; }
        case 'Font': if (isArr(v)) { this.pendingFont = v; } break;
        case 'SMask': if (isDict(v)) { try { g.smask = await this.buildSMask(v); } catch (e) { g.smask = null; this.warn.add('soft mask: ' + e.message); } } else g.smask = null; break;
        default: break;
      }
    }
  }

  masked(fn) {
    const g = this.gs;
    if (!g.smask || this.inMask) return fn();
    const main = this.ctx, off = mkCanvas(this.W, this.H), oc = off.getContext('2d'), sm = g.smask, sbm = g.bm;
    oc.setTransform(main.getTransform());
    this.ctx = oc; this.inMask = true; g.bm = 'source-over';
    const fin = () => {
      this.ctx = main; this.inMask = false; g.bm = sbm;
      oc.setTransform(1, 0, 0, 1, 0, 0); oc.globalCompositeOperation = 'destination-in'; oc.globalAlpha = 1; oc.drawImage(sm, 0, 0);
      const t = main.getTransform(); main.setTransform(1, 0, 0, 1, 0, 0); main.globalAlpha = 1; main.globalCompositeOperation = sbm; main.drawImage(off, 0, 0); main.setTransform(t);
    };
    let r;
    try { r = fn(); } catch (e) { fin(); throw e; }
    if (r && r.then) return r.then((v) => { fin(); return v; }, (e) => { fin(); throw e; });
    fin(); return r;
  }
  async buildSMask(sd) {
    const d = this.d, G = d.r(sd.G);
    if (!isStream(G)) return null;
    const lum = d.r(sd.S)?.n === 'Luminosity', W = this.W, H = this.H, cv = mkCanvas(W, H), c = cv.getContext('2d');
    c.setTransform(this.ctx.getTransform());
    if (lum) {
      let bc = [0, 0, 0]; const bca = d.nums(sd.BC), gcs = d.dict(G.dict.Group)?.CS;
      if (bca) { const cs = gcs ? await parseCS(d, gcs, this.res) : bca.length === 3 ? RGB : bca.length === 4 ? CMYK : GRAY; bc = cs.rgb(bca); }
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = rgbCss(bc); c.fillRect(0, 0, W, H); c.restore();
    }
    const s = { ctx: this.ctx, gs: this.gs, path: this.path, inMask: this.inMask, base: this.baseM, tm: this.tm, tlm: this.tlm };
    this.ctx = c; this.gs = this.newGS(); this.path = new Path2D(); this.inMask = true;
    try { await this.doForm(G); } finally { Object.assign(this, { ctx: s.ctx, gs: s.gs, path: s.path, inMask: s.inMask, baseM: s.base, tm: s.tm, tlm: s.tlm }); }
    const id = c.getImageData(0, 0, W, H), px = id.data, tr = d.r(sd.TR);
    const fn = tr && !isName(tr) ? await mkFn(d, tr) : null, lut = fn ? Array.from({ length: 256 }, (_, i) => clamp(Math.round(fn([i / 255])[0] * 255), 0, 255)) : null;
    for (let i = 0; i < px.length; i += 4) {
      let a = lum ? (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) : px[i + 3];
      a = Math.round(a); if (lut) a = lut[a];
      px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = a;
    }
    c.setTransform(1, 0, 0, 1, 0, 0); c.putImageData(id, 0, 0);
    return cv;
  }

  // ----- painting -----
  paint(fill, stroke, rule) {
    const ctx = this.ctx, path = this.path;
    if (!this.hide && (fill || stroke)) {
      this.masked(() => { if (fill) this.paintOne('fill', rule || 'nonzero', path); if (stroke) this.paintOne('stroke', 'nonzero', path); });
    }
    if (this.pendingClip) { ctx.clip(path, this.pendingClip); this.pendingClip = null; }
    this.path = new Path2D();
  }
  paintOne(kind, rule, p, scDev) {
    const ctx = this.ctx, g = this.gs, c = kind === 'fill' ? g.fill : g.stroke, cur = ctx.getTransform();
    ctx.globalAlpha = kind === 'fill' ? g.fa : g.sa; ctx.globalCompositeOperation = g.bm;
    const sc0 = scDev ?? scaleOf(cur);
    if (c.pat?.raster) {
      if (kind === 'fill') {
        ctx.save(); if (p) ctx.clip(p, rule); else ctx.clip(rule); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c.pat.raster, 0, 0); ctx.restore();
        return;
      }
      ctx[kind + 'Style'] = c.css;
    } else if (c.pat) { const q = new Path2D(); q.addPath(p, c.pat.mat.inverse().multiply(cur)); p = q; ctx.setTransform(c.pat.mat); ctx[kind + 'Style'] = c.pat.style; } else ctx[kind + 'Style'] = c.css;
    if (kind === 'fill') { if (p) ctx.fill(p, rule); else ctx.fill(rule); } else {
      const sc1 = scaleOf(ctx.getTransform()), k = sc0 / sc1;
      ctx.lineWidth = Math.max(g.lw * sc0, 1) / sc1;
      ctx.lineCap = ['butt', 'round', 'square'][g.cap] || 'butt'; ctx.lineJoin = ['miter', 'round', 'bevel'][g.join] || 'miter'; ctx.miterLimit = Math.max(1, g.ml);
      ctx.setLineDash(g.dash.length % 2 ? g.dash.concat(g.dash).map((x) => x * k) : g.dash.map((x) => x * k)); ctx.lineDashOffset = g.dp * k;
      if (p) ctx.stroke(p); else ctx.stroke();
    }
    ctx.setTransform(cur);
  }

  // ----- text -----
  async showText(bytes) {
    const g = this.gs, font = g.font, ctx = this.ctx;
    if (!font) return;
    const recs = font.decode(bytes), ctm = fromDM(ctx.getTransform()), sc0 = scaleOf(ctm), mode = g.mode;
    const doFill = (mode === 0 || mode === 2 || mode === 4 || mode === 6) && !this.hide, doStroke = (mode === 1 || mode === 2 || mode === 5 || mode === 6) && !this.hide, doClip = mode >= 4;
    ctx.globalAlpha = g.fa; ctx.globalCompositeOperation = g.bm; ctx.fillStyle = g.fill.css;
    const patFill = g.fill.pat;
    for (const r of recs) {
      const M = mmul([g.fs * g.th, 0, 0, g.fs, 0, g.rise], mmul(this.tm, ctm));
      if (font.kind === 'type3') { if (!this.hide && mode !== 3 && r.proc) await this.drawT3(font, r, M); }
      else if (r.path) {
        if (doFill) {
          if (patFill) { const dp = new Path2D(); dp.addPath(r.path, new DOMMatrix(M)); ctx.setTransform(1, 0, 0, 1, 0, 0); this.paintOne('fill', 'nonzero', dp); ctx.fillStyle = g.fill.css; ctx.globalAlpha = g.fa; }
          else { ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]); ctx.fill(r.path); }
        }
        if (doStroke) { const dp = new Path2D(); dp.addPath(r.path, new DOMMatrix(M)); ctx.setTransform(1, 0, 0, 1, 0, 0); this.paintOne('stroke', 'nonzero', dp, sc0); }
        if (doClip) (this.textClip || (this.textClip = new Path2D())).addPath(r.path, new DOMMatrix(M));
      } else if (font.sys && r.ch && (doFill || doStroke || doClip)) {
        const M2 = mmul([0.001, 0, 0, -0.001, 0, 0], M);
        ctx.setTransform(M2[0], M2[1], M2[2], M2[3], M2[4], M2[5]); ctx.font = sysFontStr(font.sys);
        if (doFill) { ctx.fillStyle = patFill ? g.fill.css : g.fill.css; ctx.fillText(r.ch, 0, 0); }
        if (doStroke) { ctx.strokeStyle = g.stroke.css; ctx.lineWidth = Math.max(g.lw * sc0, 1) / scaleOf(M2); ctx.strokeText(r.ch, 0, 0); }
        if (doClip) { // no outline for system fonts: collect a coverage mask instead of a clip path
          if (!this.textMask) this.textMask = mkCanvas(this.W, this.H);
          const mc = this.textMask.getContext('2d'); mc.setTransform(M2[0], M2[1], M2[2], M2[3], M2[4], M2[5]); mc.font = ctx.font; mc.fillStyle = '#000'; mc.fillText(r.ch, 0, 0);
        }
      }
      const adv = (r.w * g.fs + g.tc + (r.sp ? g.tw : 0)) * g.th;
      this.tm = [this.tm[0], this.tm[1], this.tm[2], this.tm[3], this.tm[4] + adv * this.tm[0], this.tm[5] + adv * this.tm[1]];
    }
    ctx.setTransform(ctm[0], ctm[1], ctm[2], ctm[3], ctm[4], ctm[5]);
  }
  async drawT3(font, r, M) {
    if (this.depth > 8) return;
    const ctx = this.ctx, st = r.proc;
    if (!isStream(st)) return;
    let ops = this.opCache.get(st);
    if (!ops) { ops = parseContent(latin((await decodeStream(this.d, st)).data)); this.opCache.set(st, ops); }
    const spath = this.path, full = mmul(font.fm, M), sg = this.gs, stm = this.tm, stlm = this.tlm, snc = this.noColor, sbase = this.baseM, ssp = this.sp, scp = this.cp;
    ctx.save(); const cur = ctx.getTransform(); ctx.setTransform(full[0], full[1], full[2], full[3], full[4], full[5]);
    this.gs = { ...sg, lw: 1, dash: [], cap: 0, join: 0 }; this.depth++; this.noColor = 0; this.t3colorLock = false;
    const sdepth = this.stack.length;
    this.path = new Path2D();
    try {
      // d1 glyphs use the current fill colour for everything: honour by locking colour ops after the first operator d1
      const first = ops.find((o) => o.k === 'd1' || o.k === 'd0');
      if (first?.k === 'd1') { this.noColor = 1; this.gs.stroke = sg.fill; }
      await this.run(ops, font.res || this.res);
    } finally {
      while (this.stack.length > sdepth) this.Q();
      this.depth--; this.gs = sg; this.tm = stm; this.tlm = stlm; this.noColor = snc; this.baseM = sbase; this.sp = ssp; this.cp = scp;
      ctx.restore(); ctx.setTransform(cur); this.path = spath;
    }
  }

  // ----- forms -----
  async doForm(xo) {
    if (this.depth > 12) return;
    const d = this.d, dict = xo.dict, m = d.nums(dict.Matrix) || IDENT, bb = d.box(dict.BBox), ctx = this.ctx;
    let ops = this.opCache.get(xo);
    if (!ops) { try { ops = parseContent(latin((await decodeStream(d, xo)).data)); } catch (e) { this.warn.add('form: ' + e.message); ops = []; } this.opCache.set(xo, ops); }
    const res = d.dict(dict.Resources) || this.res;
    const g = this.gs, grp = d.dict(dict.Group), needGroup = grp && d.r(grp.S)?.n === 'Transparency' && (g.fa < 1 || g.bm !== 'source-over');
    const sg = this.gs, sbase = this.baseM, sctx = this.ctx, stm = this.tm, stlm = this.tlm, scp = this.cp, ssp = this.sp, sdepth = this.stack.length, spath = this.path;
    ctx.save(); ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    if (bb) { const bp = new Path2D(); bp.rect(bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]); ctx.clip(bp); }
    this.path = new Path2D();
    this.baseM = fromDM(ctx.getTransform());
    this.gs = { ...g }; this.depth++;
    let off = null;
    if (needGroup) {
      off = mkCanvas(this.W, this.H); const oc = off.getContext('2d'); oc.setTransform(ctx.getTransform()); this.ctx = oc;
      this.gs.fa = 1; this.gs.sa = 1; this.gs.bm = 'source-over';
    }
    try { await this.run(ops, res); } finally {
      while (this.stack.length > sdepth) this.Q();
      this.depth--; this.ctx = sctx; this.gs = sg; this.baseM = sbase; this.tm = stm; this.tlm = stlm; this.cp = scp; this.sp = ssp;
      if (off) { const t = ctx.getTransform(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = g.fa; ctx.globalCompositeOperation = g.bm; ctx.drawImage(off, 0, 0); ctx.setTransform(t); }
      ctx.restore(); this.path = spath;
    }
  }
}

// ---------- images ----------
function rawToRGBA(data, w, h, bpc, cs, dec, key) {
  const n = cs.n, out = new Uint8ClampedArray(w * h * 4), row = (w * n * bpc + 7) >> 3, maxv = bpc >= 16 ? 65535 : (1 << bpc) - 1;
  const dmin = [], dmax = [];
  for (let c = 0; c < n; c++) {
    let a = 0, b = 1;
    if (cs.indexed) b = maxv; else if (cs.range) { a = cs.range[2 * c]; b = cs.range[2 * c + 1]; }
    if (dec && dec.length >= 2 * c + 2) { a = dec[2 * c]; b = dec[2 * c + 1]; }
    dmin.push(a); dmax.push(b);
  }
  const sample = (off, idx) => {
    if (bpc === 8) return data[off + idx] ?? 0;
    if (bpc === 16) return ((data[off + 2 * idx] ?? 0) << 8) | (data[off + 2 * idx + 1] ?? 0);
    const bit = idx * bpc; return ((data[off + (bit >> 3)] ?? 0) >> (8 - bpc - (bit & 7))) & maxv;
  };
  const keyed = (raw) => { if (!key) return false; for (let c = 0; c < n; c++) if (raw[c] < key[2 * c] || raw[c] > key[2 * c + 1]) return false; return true; };
  const defDec = !dec || dec.every((v, i) => v === (i & 1 ? (cs.indexed ? maxv : 1) : 0));
  if (n === 1) {
    const levels = bpc > 8 ? 256 : maxv + 1, lut = new Array(levels);
    for (let v = 0; v < levels; v++) lut[v] = cs.rgb([dmin[0] + v * (dmax[0] - dmin[0]) / (levels - 1)]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const raw = sample(y * row, x), v = bpc > 8 ? raw >> 8 : raw, p = (y * w + x) * 4, c = lut[v] || [0, 0, 0];
      out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2]; out[p + 3] = key && raw >= key[0] && raw <= key[1] ? 0 : 255;
    }
    return out;
  }
  if (bpc === 8 && defDec && !key && (cs === RGB || cs === CMYK)) {
    for (let y = 0; y < h; y++) {
      let s = y * row, p = y * w * 4;
      if (cs === RGB) for (let x = 0; x < w; x++, s += 3, p += 4) { out[p] = data[s]; out[p + 1] = data[s + 1]; out[p + 2] = data[s + 2]; out[p + 3] = 255; }
      else for (let x = 0; x < w; x++, s += 4, p += 4) { cmykTo(data[s] / 255, data[s + 1] / 255, data[s + 2] / 255, data[s + 3] / 255, out, p); out[p + 3] = 255; }
    }
    return out;
  }
  const raw = new Array(n), comps = new Array(n); let lastKey = '', last = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let k = '';
    for (let c = 0; c < n; c++) { raw[c] = sample(y * row, x * n + c); k += raw[c] + ','; }
    const p = (y * w + x) * 4;
    if (k !== lastKey) { for (let c = 0; c < n; c++) comps[c] = dmin[c] + raw[c] * (dmax[c] - dmin[c]) / maxv; last = cs.rgb(comps); lastKey = k; }
    out[p] = last[0]; out[p + 1] = last[1]; out[p + 2] = last[2]; out[p + 3] = keyed(raw) ? 0 : 255;
  }
  return out;
}
function jpegComps(b) {
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return b[i + 9];
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return 3;
}
// returns {w,h,rgba} (or {img} drawable when no pixel access is needed, or {ph})
async function pixelsOf(r, st, o = {}) {
  const d = r.d, dict = st.dict, w = d.num(dict.Width), h = d.num(dict.Height);
  if (!w || !h) return null;
  const isMask = d.r(dict.ImageMask) === true, dec = d.nums(dict.Decode);
  const { data, rest } = await decodeStream(d, st);
  if (rest && rest.name !== 'DCTDecode') return { ph: rest.name.replace('Decode', ''), w, h };
  if (rest) {
    let bmp;
    try { bmp = await createImageBitmap(new Blob([data], { type: 'image/jpeg' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); } catch { return { ph: 'DCT (undecodable)', w, h }; }
    const cnv = mkCanvas(bmp.width, bmp.height), cx = cnv.getContext('2d'); cx.drawImage(bmp, 0, 0);
    const nc = jpegComps(data);
    if (!o.needPixels && !(dec && dec.some((v, i) => v === (i & 1 ? 0 : 1)))) return { img: cnv, w: bmp.width, h: bmp.height };
    const id = cx.getImageData(0, 0, bmp.width, bmp.height), px = id.data;
    if (dec && dec.length >= 2 && dec[0] === 1 && dec[1] === 0 && !(nc === 4)) for (let i = 0; i < px.length; i += 4) { px[i] = 255 - px[i]; px[i + 1] = 255 - px[i + 1]; px[i + 2] = 255 - px[i + 2]; }
    // 4-component (Adobe) JPEGs are already converted by the browser decoder; a Decode [1 0 ...] array must not invert them again
    return { w: bmp.width, h: bmp.height, rgba: px };
  }
  const bpc = isMask ? 1 : d.num(dict.BitsPerComponent, 8);
  const cs = isMask ? GRAY : await parseCS(d, dict.ColorSpace, r.res);
  if (isMask) {
    const row = (w + 7) >> 3, out = new Uint8ClampedArray(w * h * 4), inv = dec && dec[0] === 1, c = o.fillRGB || [0, 0, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const bit = ((data[y * row + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1, p = (y * w + x) * 4, on = inv ? bit === 1 : bit === 0;
      out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2]; out[p + 3] = on ? 255 : 0;
    }
    return { w, h, rgba: out };
  }
  const maskO = d.r(dict.Mask), key = isArr(maskO) ? maskO.map((x) => d.num(x, 0)) : null;
  return { w, h, rgba: rawToRGBA(data, w, h, bpc, cs, dec, key) };
}
function resizeRGBA(px, W, H) {
  if (px.w === W && px.h === H) return px.rgba;
  const o = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) { const sy = Math.min(px.h - 1, y * px.h / H | 0); for (let x = 0; x < W; x++) { const sx = Math.min(px.w - 1, x * px.w / W | 0), s = (sy * px.w + sx) * 4, p = (y * W + x) * 4; o[p] = px.rgba[s]; o[p + 1] = px.rgba[s + 1]; o[p + 2] = px.rgba[s + 2]; o[p + 3] = px.rgba[s + 3]; } }
  return o;
}
async function buildImage(r, st, fillRGB) {
  const d = r.d, dict = st.dict, sm = d.r(dict.SMask), mk = d.r(dict.Mask), hasMask = isStream(sm) || isStream(mk);
  let px = await pixelsOf(r, st, { needPixels: hasMask, fillRGB });
  if (!px || px.ph || px.img) return px;
  if (hasMask) {
    const m = await pixelsOf(r, isStream(sm) ? sm : mk, { needPixels: true });
    if (m && m.rgba) {
      const W = Math.max(px.w, m.w), H = Math.max(px.h, m.h), a = resizeRGBA(px, W, H), mm = resizeRGBA(m, W, H), ch = isStream(sm) ? 0 : 3;
      for (let i = 0; i < W * H; i++) a[i * 4 + 3] = mm[i * 4 + ch];
      px = { w: W, h: H, rgba: a };
    }
  }
  const cnv = mkCanvas(px.w, px.h);
  cnv.getContext('2d').putImageData(new ImageData(px.rgba instanceof Uint8ClampedArray ? px.rgba : new Uint8ClampedArray(px.rgba), px.w, px.h), 0, 0);
  return { img: cnv, w: px.w, h: px.h };
}
async function drawImage(r, st, inline) {
  const d = r.d, g = r.gs, ctx = r.ctx, isMask = d.r(st.dict.ImageMask) === true;
  let im = !isMask && !inline ? r.imgCache.get(st) : null;
  if (!im) {
    im = await buildImage(r, st, g.fill.rgb);
    if (im && !isMask && !inline && im.img && im.w * im.h < 25e6) r.imgCache.set(st, im);
  }
  if (!im) return;
  ctx.save();
  ctx.globalAlpha = g.fa; ctx.globalCompositeOperation = g.bm;
  if (im.ph) {
    r.warn.add(im.ph + ' images are not supported (grey placeholder drawn)');
    const m = ctx.getTransform();
    ctx.fillStyle = '#d0d0d0'; ctx.fillRect(0, 0, 1, 1); ctx.strokeStyle = '#808080'; ctx.lineWidth = 1 / scaleOf(m); ctx.strokeRect(0, 0, 1, 1);
    const p0 = m.transformPoint(new DOMPoint(0.5, 0.5)), sz = Math.max(8, Math.min(18, scaleOf(m) / 8));
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#404040'; ctx.font = `${sz}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(im.ph, p0.x, p0.y);
    ctx.restore(); return;
  }
  const m = ctx.getTransform(), up = Math.hypot(m.a, m.b) / im.w;
  ctx.transform(1 / im.w, 0, 0, -1 / im.h, 0, 1);
  ctx.imageSmoothingEnabled = up < 1 || r.opts.smoothUpscale === true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im.img, 0, 0);
  ctx.restore();
}

// ---------- patterns and shadings ----------
const invM = (m) => { const det = m[0] * m[3] - m[1] * m[2] || 1e-12; return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]; };
async function makePattern(r, name, under) {
  const d = r.d, po = d.r(d.dict(r.res?.Pattern)?.[name]), pd = d.dict(po);
  if (!pd) return null;
  const pm = d.nums(pd.Matrix) || IDENT, M = mmul(pm, r.baseM);
  if (d.num(pd.PatternType) === 2) {
    const st = await shadingStyle(r, pd.Shading, new DOMMatrix(M));
    if (!st) return null;
    return st.raster ? { raster: st.raster } : { mat: st.mat, style: st.style };
  }
  const bb = d.box(pd.BBox), xs = Math.abs(d.num(pd.XStep, 0)) || (bb ? bb[2] - bb[0] : 0), ys = Math.abs(d.num(pd.YStep, 0)) || (bb ? bb[3] - bb[1] : 0);
  if (!bb || !xs || !ys || !isStream(po)) return null;
  const sx = Math.hypot(M[0], M[1]), sy = Math.hypot(M[2], M[3]);
  let tw = Math.max(1, Math.ceil(xs * sx)), th = Math.max(1, Math.ceil(ys * sy));
  const lim = 2500, f = Math.min(1, lim / tw, lim / th); tw = Math.max(1, Math.round(tw * f)); th = Math.max(1, Math.round(th * f));
  const tile = mkCanvas(tw, th), tc = tile.getContext('2d'), kx = tw / xs, ky = th / ys;
  const uncolored = d.num(pd.PaintType, 1) === 2;
  const save = { path: r.path, ctx: r.ctx, gs: r.gs, stack: r.stack, W: r.W, H: r.H, baseM: r.baseM, res: r.res, hide: r.hide, nc: r.noColor, tm: r.tm, tlm: r.tlm, cp: r.cp, sp: r.sp, pc: r.pendingClip, depth: r.depth };
  let ops = r.opCache.get(po);
  if (!ops) { ops = parseContent(latin((await decodeStream(d, po)).data)); r.opCache.set(po, ops); }
  const nx = Math.ceil((bb[2] - bb[0]) / xs - 1e-6) - 1, ny = Math.ceil((bb[3] - bb[1]) / ys - 1e-6) - 1;
  try {
    for (let i = -Math.max(0, nx); i <= 0; i++) for (let j = -Math.max(0, ny); j <= 0; j++) {
      tc.setTransform(1, 0, 0, 1, 0, 0);
      tc.save();
      const T = [kx, 0, 0, ky, (-bb[0] + i * xs) * kx, (-bb[1] + j * ys) * ky];
      tc.setTransform(...T); { const bp = new Path2D(); bp.rect(bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]); tc.clip(bp); }
      r.ctx = tc; r.W = tw; r.H = th; r.baseM = T; r.stack = []; r.hide = 0; r.gs = r.newGS(); r.depth = save.depth + 1; r.pendingClip = null; r.path = new Path2D();
      if (uncolored) { r.gs.fill = under || solid(GRAY, [0]); r.gs.stroke = r.gs.fill; r.noColor = 1; } else r.noColor = 0;
      if (r.depth < 6) await r.run(ops, d.dict(pd.Resources) || r.res);
      tc.restore();
    }
  } finally { Object.assign(r, { ctx: save.ctx, gs: save.gs, stack: save.stack, W: save.W, H: save.H, baseM: save.baseM, res: save.res, hide: save.hide, noColor: save.nc, tm: save.tm, tlm: save.tlm, cp: save.cp, sp: save.sp, pendingClip: save.pc, depth: save.depth, path: save.path }); }
  const pat = r.ctx.createPattern(tile, 'repeat');
  pat.setTransform(new DOMMatrix([xs / tw, 0, 0, ys / th, bb[0], bb[1]]));
  return { mat: new DOMMatrix(M), style: pat };
}

const shCache = new WeakMap();
async function shadingStyle(r, shObj, M) {
  const sh = r.d.r(shObj);
  if (sh == null || typeof sh !== 'object') return shadingStyle0(r, shObj, M);
  const key = (isArr(M) ? M : fromDM(M)).map((v) => v.toFixed(4)).join(',') + '|' + r.W + 'x' + r.H + '|' + (r.ctx?.canvas?.width);
  let m = shCache.get(sh); if (!m) shCache.set(sh, m = new Map());
  const hit = m.get(key); if (hit) return hit;
  const res = await shadingStyle0(r, shObj, M);
  if (res?.raster && m.size < 8) m.set(key, res);
  return res;
}
async function shadingStyle0(r, shObj, M) {
  const d = r.d, sh = d.r(shObj), sd = d.dict(sh);
  if (!sd) return null;
  const type = d.num(sd.ShadingType), cs = await parseCS(d, sd.ColorSpace, r.res), fn = sd.Function !== undefined ? await mkFn(d, sd.Function) : null;
  const ctx = r.ctx, Ma = isArr(M) ? M : fromDM(M), Md = isArr(M) ? new DOMMatrix(M) : M;
  const toRGB = (t) => cs.rgb(fn ? fn(t) : t);
  if (type === 2 || type === 3) {
    const c = d.nums(sd.Coords), dom = d.nums(sd.Domain) || [0, 1], ex = (d.r(sd.Extend) || [false, false]).map((x) => d.r(x) === true);
    if (!c) return null;
    if (ex[0] && ex[1] || (type === 3 && false)) {
      const grad = type === 2 ? ctx.createLinearGradient(c[0], c[1], c[2], c[3]) : ctx.createRadialGradient(c[0], c[1], c[2], c[3], c[4], c[5]);
      const N = 96; for (let s = 0; s <= N; s++) grad.addColorStop(s / N, rgbCss(toRGB([dom[0] + (dom[1] - dom[0]) * s / N])));
      return { style: grad, mat: Md };
    }
    // non-extended ends: per-pixel raster
    const inv = invM(Ma), W0 = r.W, H0 = r.H, rs = W0 * H0 > 300000 ? 3 : 1, W = Math.ceil(W0 / rs), H = Math.ceil(H0 / rs), img = new ImageData(W, H), lut = []; // ponytail: computed at 1/3 resolution on big pages, then scaled up
    const N = 255; for (let s = 0; s <= N; s++) lut.push(toRGB([dom[0] + (dom[1] - dom[0]) * s / N]));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const X0 = (x + 0.5) * rs, Y0 = (y + 0.5) * rs, px = inv[0] * X0 + inv[2] * Y0 + inv[4], py = inv[1] * X0 + inv[3] * Y0 + inv[5];
      let s = NaN;
      if (type === 2) {
        const dx = c[2] - c[0], dy = c[3] - c[1], den = dx * dx + dy * dy;
        s = den ? ((px - c[0]) * dx + (py - c[1]) * dy) / den : NaN;
        if (s < 0) s = ex[0] ? 0 : NaN; else if (s > 1) s = ex[1] ? 1 : NaN;
      } else {
        const cdx = c[3] - c[0], cdy = c[4] - c[1], dr = c[5] - c[2], pdx = px - c[0], pdy = py - c[1];
        const A = cdx * cdx + cdy * cdy - dr * dr, B = pdx * cdx + pdy * cdy + c[2] * dr, C = pdx * pdx + pdy * pdy - c[2] * c[2];
        const cand = [];
        if (Math.abs(A) < 1e-9) { if (B) cand.push(C / (2 * B)); } else { const disc = B * B - A * C; if (disc >= 0) { const sq = Math.sqrt(disc); cand.push((B + sq) / A, (B - sq) / A); } }
        cand.sort((a2, b2) => b2 - a2);
        for (const t of cand) {
          if (c[2] + t * dr < 0) continue;
          if (t >= 0 && t <= 1) { s = t; break; }
          if (t < 0 && ex[0]) { s = 0; break; }
          if (t > 1 && ex[1]) { s = 1; break; }
        }
      }
      if (s === s) { const col = lut[Math.round(s * N)], p = (y * W + x) * 4; img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255; }
    }
    const sm = mkCanvas(W, H); sm.getContext('2d').putImageData(img, 0, 0);
    if (rs === 1) return { raster: sm };
    const cv = mkCanvas(W0, H0), cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(sm, 0, 0, W0, H0);
    return { raster: cv };
  }
  const W = r.W, H = r.H;
  if (type === 1) {
    const dom = d.nums(sd.Domain) || [0, 1, 0, 1], mt = d.nums(sd.Matrix) || IDENT, inv = invM(mmul(mt, Ma)), rs = W * H > 300000 ? 3 : 1, w1 = Math.ceil(W / rs), h1 = Math.ceil(H / rs), img = new ImageData(w1, h1);
    for (let y = 0; y < h1; y++) for (let x = 0; x < w1; x++) {
      const X0 = (x + 0.5) * rs, Y0 = (y + 0.5) * rs, px = inv[0] * X0 + inv[2] * Y0 + inv[4], py = inv[1] * X0 + inv[3] * Y0 + inv[5];
      if (px < dom[0] || px > dom[1] || py < dom[2] || py > dom[3]) continue;
      const col = toRGB([px, py]), p = (y * w1 + x) * 4; img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255;
    }
    const sm = mkCanvas(w1, h1); sm.getContext('2d').putImageData(img, 0, 0);
    if (rs === 1) return { raster: sm };
    const cv = mkCanvas(W, H), cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(sm, 0, 0, W, H);
    return { raster: cv };
  }
  if (type >= 4 && type <= 7 && isStream(sh)) return meshShading(r, sh, cs, fn, Ma);
  r.warn.add('shading type ' + type + ' not supported');
  return null;
}

async function meshShading(r, sh, cs, fn, Ma) {
  const d = r.d, sd = sh.dict, type = d.num(sd.ShadingType), data = (await decodeStream(d, sh)).data;
  const bpco = d.num(sd.BitsPerCoordinate, 8), bpcm = d.num(sd.BitsPerComponent, 8), bpf = d.num(sd.BitsPerFlag, 8), dec = d.nums(sd.Decode) || [0, 1, 0, 1, 0, 1];
  const nc = fn ? 1 : cs.n, W = r.W, H = r.H;
  let bp = 0;
  const bits = (n) => { let v = 0; for (let i = 0; i < n; i++, bp++) v = v * 2 + (((data[bp >> 3] ?? 0) >> (7 - (bp & 7))) & 1); return v; };
  const align = () => { bp = (bp + 7) & ~7; };
  const more = () => bp + 8 <= data.length * 8;
  const rdPt = () => { const mx = Math.pow(2, bpco) - 1, x = dec[0] + bits(bpco) * (dec[1] - dec[0]) / mx, y = dec[2] + bits(bpco) * (dec[3] - dec[2]) / mx; return [Ma[0] * x + Ma[2] * y + Ma[4], Ma[1] * x + Ma[3] * y + Ma[5]]; };
  const rdCol = () => { const mx = Math.pow(2, bpcm) - 1, c = []; for (let i = 0; i < nc; i++) c.push(dec[4 + 2 * i] + bits(bpcm) * (dec[5 + 2 * i] - dec[4 + 2 * i]) / mx); return c; };
  const tris = [];
  if (type === 4) {
    let prev = null;
    while (more()) {
      const f = bits(bpf), p = rdPt(), c = rdCol(); align();
      const v = { p, c };
      if (f === 0 || !prev) {
        if (!more()) break; bits(bpf); const p2 = rdPt(), c2 = rdCol(); align(); if (!more()) break; bits(bpf); const p3 = rdPt(), c3 = rdCol(); align();
        prev = [v, { p: p2, c: c2 }, { p: p3, c: c3 }];
      } else prev = f === 1 ? [prev[1], prev[2], v] : [prev[0], prev[2], v];
      tris.push(prev);
    }
  } else if (type === 5) {
    const vpr = d.num(sd.VerticesPerRow, 2), rows = []; let row = [];
    while (more()) { const p = rdPt(), c = rdCol(); align(); row.push({ p, c }); if (row.length === vpr) { rows.push(row); row = []; } }
    for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j + 1 < vpr; j++) { tris.push([rows[i][j], rows[i][j + 1], rows[i + 1][j]], [rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]]); }
  } else {
    let prevP = null, prevC = null;
    while (more()) {
      const f = bits(bpf); let P = [], C = [];
      const nPts = type === 6 ? 12 : 16;
      if (f === 0 || !prevP) { for (let i = 0; i < nPts; i++) P.push(rdPt()); C = [rdCol(), rdCol(), rdCol(), rdCol()]; }
      else {
        const e = f === 1 ? [3, 4, 5, 6] : f === 2 ? [6, 7, 8, 9] : [9, 10, 11, 0], ce = f === 1 ? [1, 2] : f === 2 ? [2, 3] : [3, 0];
        P = e.map((k) => prevP[k]); for (let i = 4; i < nPts; i++) P.push(rdPt());
        C = [prevC[ce[0]], prevC[ce[1]], rdCol(), rdCol()];
      }
      align(); prevP = P; prevC = C;
      const bez = (a, b, c, dd, t) => { const u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * dd[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * dd[1]]; };
      const c1 = (u) => bez(P[0], P[1], P[2], P[3], u), d2 = (v) => bez(P[3], P[4], P[5], P[6], v), c2 = (u) => bez(P[9], P[8], P[7], P[6], u), d1 = (v) => bez(P[0], P[11], P[10], P[9], v);
      const N = 10, grid = [];
      for (let i = 0; i <= N; i++) {
        grid.push([]);
        for (let j = 0; j <= N; j++) {
          const u = i / N, v = j / N, A = c1(u), B = c2(u), Cc = d1(v), D = d2(v);
          const pt = [0, 1].map((k) => (1 - v) * A[k] + v * B[k] + (1 - u) * Cc[k] + u * D[k] - ((1 - u) * (1 - v) * P[0][k] + u * (1 - v) * P[3][k] + (1 - u) * v * P[9][k] + u * v * P[6][k]));
          const col = C[0].map((_, k) => (1 - u) * (1 - v) * C[0][k] + u * (1 - v) * C[1][k] + u * v * C[2][k] + (1 - u) * v * C[3][k]);
          grid[i].push({ p: pt, c: col });
        }
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) tris.push([grid[i][j], grid[i + 1][j], grid[i][j + 1]], [grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]);
    }
  }
  const img = new ImageData(W, H), px = img.data;
  const lut = fn ? (() => { const t0 = dec[4], t1 = dec[5], a = []; for (let s = 0; s <= 255; s++) a.push(cs.rgb(fn([t0 + (t1 - t0) * s / 255]))); return a; })() : null;
  for (const [a, b, c] of tris) {
    const minX = Math.max(0, Math.floor(Math.min(a.p[0], b.p[0], c.p[0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(a.p[0], b.p[0], c.p[0])));
    const minY = Math.max(0, Math.floor(Math.min(a.p[1], b.p[1], c.p[1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(a.p[1], b.p[1], c.p[1])));
    const den = (b.p[1] - c.p[1]) * (a.p[0] - c.p[0]) + (c.p[0] - b.p[0]) * (a.p[1] - c.p[1]);
    if (Math.abs(den) < 1e-12) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const X = x + 0.5, Y = y + 0.5;
      const l1 = ((b.p[1] - c.p[1]) * (X - c.p[0]) + (c.p[0] - b.p[0]) * (Y - c.p[1])) / den, l2 = ((c.p[1] - a.p[1]) * (X - c.p[0]) + (a.p[0] - c.p[0]) * (Y - c.p[1])) / den, l3 = 1 - l1 - l2;
      const e = -0.02; if (l1 < e || l2 < e || l3 < e) continue;
      const comps = a.c.map((_, k) => l1 * a.c[k] + l2 * b.c[k] + l3 * c.c[k]);
      const col = lut ? lut[clamp(Math.round((comps[0] - dec[4]) / ((dec[5] - dec[4]) || 1) * 255), 0, 255)] : cs.rgb(comps), p = (y * W + x) * 4;
      px[p] = col[0]; px[p + 1] = col[1]; px[p + 2] = col[2]; px[p + 3] = 255;
    }
  }
  const cv = mkCanvas(W, H); cv.getContext('2d').putImageData(img, 0, 0);
  return { raster: cv };
}

// ---------- public API + tools ----------
const FMT = { png: ['image/png', 'png'], jpeg: ['image/jpeg', 'jpg'], webp: ['image/webp', 'webp'] };
const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode ' + type))), type, q));
const baseName = (f) => f.name.replace(/\.pdf$/i, '') || 'document';
const bgOf = (s, fmt) => { s = String(s || '#ffffff').trim(); if (/^transparent$/i.test(s)) return fmt === 'jpeg' ? '#ffffff' : 'transparent'; return s; };
// Renders pages of an already opened PdfDoc; returns [{canvas, ms}], plus warnings.
export async function renderPdfPages(doc, indices, opts = {}) {
  const r = new R(doc, opts), out = [];
  for (const i of indices) {
    const t = performance.now();
    try { out.push({ index: i, canvas: await r.renderPage(i, opts), ms: performance.now() - t }); }
    catch (e) { if (/lower the DPI/.test(e.message)) throw e; r.warn.add(`page ${i + 1}: ${e.message}`); const c = mkCanvas(200, 200); out.push({ index: i, canvas: c, ms: 0 }); }
  }
  return { pages: out, warnings: [...r.warn] };
}
const pdfFile = async (files) => {
  if (!files?.length) throw new Error('Choose a PDF file');
  const f = files[0];
  try { return { f, doc: await openPdf(new Uint8Array(await f.arrayBuffer()), f.name) }; } catch (e) { throw new Error(e.message.includes(f.name) ? e.message : `${f.name}: ${e.message}`); }
};
const LIMITS = 'Not supported: JBIG2/JPEG2000/CCITT images (grey placeholder), predefined CJK CMaps, encrypted files; non-embedded fonts use system fonts.';

export default [
  {
    id: 'pdf-to-image', cat: 'PDF', title: 'PDF to Image (PNG, JPEG, WebP)', inputs: 0, dom: true,
    desc: 'Render PDF pages to PNG, JPEG or WebP images with a built-in renderer (nothing is uploaded). Text, vector graphics, gradients, patterns, transparency and images are supported; JBIG2/JPEG2000 images show as grey boxes.',
    file: { accept: 'application/pdf,.pdf' },
    opts: [
      { id: 'format', label: 'Format', type: 'select', choices: ['png', 'jpeg', 'webp'], def: 'png' },
      { id: 'pages', label: 'Pages (e.g. 1-3,5,7-; blank = all)', type: 'text', def: '1' },
      { id: 'dpi', label: 'Resolution (DPI)', type: 'number', def: 150 },
      { id: 'background', label: 'Background colour (CSS, or transparent for PNG/WebP)', type: 'text', def: '#ffffff' },
      { id: 'quality', label: 'JPEG/WebP quality (1-100)', type: 'number', def: 92 },
      { id: 'annots', label: 'Draw annotations and form fields', type: 'checkbox', def: true },
    ],
    run: async (_i, o, files) => {
      const { f, doc } = await pdfFile(files), N = doc.pages.length, fmt = FMT[o.format] ? o.format : 'png';
      const idx = parseRanges(String(o.pages || '').trim() || `1-${N}`, N);
      if (idx.length > 300) throw new Error('At most 300 pages per run');
      const dpi = clamp(Number(o.dpi) || 150, 10, 600), t0 = performance.now();
      const { pages, warnings } = await renderPdfPages(doc, idx, { dpi, background: bgOf(o.background, fmt), annots: o.annots !== false });
      const blobs = [], pad = String(N).length, lines = [];
      for (const p of pages) {
        const b = await toBlob(p.canvas, FMT[fmt][0], clamp(Number(o.quality) || 92, 1, 100) / 100);
        blobs.push(new File([b], `${baseName(f)}-p${String(p.index + 1).padStart(pad, '0')}.${FMT[fmt][1]}`, { type: FMT[fmt][0] }));
        lines.push(`page ${p.index + 1}: ${p.canvas.width}x${p.canvas.height}px, ${Math.round(p.ms)} ms, ${(b.size / 1024).toFixed(0)} KB`);
      }
      return { blob: blobs, text: `${blobs.length} image(s) at ${dpi} DPI in ${Math.round(performance.now() - t0)} ms\n${lines.join('\n')}${warnings.length ? '\n\nNotes:\n- ' + warnings.slice(0, 12).join('\n- ') : ''}\n\n${LIMITS}` };
    },
  },
  {
    id: 'pdf-thumbnail-sheet', cat: 'PDF', title: 'PDF Thumbnail Sheet (Contact Sheet)', inputs: 0, dom: true,
    desc: 'Render the pages of a PDF as small thumbnails on one image, with page numbers.',
    file: { accept: 'application/pdf,.pdf' },
    opts: [
      { id: 'pages', label: 'Pages (blank = all)', type: 'text', def: '' },
      { id: 'cols', label: 'Columns', type: 'number', def: 4 },
      { id: 'width', label: 'Thumbnail width (px)', type: 'number', def: 220 },
      { id: 'format', label: 'Format', type: 'select', choices: ['png', 'jpeg', 'webp'], def: 'png' },
      { id: 'background', label: 'Sheet background', type: 'text', def: '#eeeeee' },
    ],
    run: async (_i, o, files) => {
      const { f, doc } = await pdfFile(files), N = doc.pages.length, fmt = FMT[o.format] ? o.format : 'png';
      const idx = parseRanges(String(o.pages || '').trim() || `1-${Math.min(N, 200)}`, N).slice(0, 200);
      const cols = clamp(Math.round(Number(o.cols) || 4), 1, 12), tw = clamp(Math.round(Number(o.width) || 220), 60, 800), gap = 12, lab = 18;
      const rows = Math.ceil(idx.length / cols), cellH = [];
      let maxH = 0;
      for (const i of idx) { const inf = doc.info(i); maxH = Math.max(maxH, Math.round(tw * inf.h / inf.w)); }
      const sheet = mkCanvas(gap + cols * (tw + gap), gap + rows * (maxH + lab + gap)), sc = sheet.getContext('2d');
      sc.fillStyle = bgOf(o.background, fmt) === 'transparent' ? '#eeeeee' : bgOf(o.background, fmt); sc.fillRect(0, 0, sheet.width, sheet.height);
      sc.font = '12px sans-serif'; sc.textAlign = 'center'; void cellH;
      const rr = new R(doc, {}); let k = 0;
      for (const i of idx) {
        const inf = doc.info(i), c = await rr.renderPage(i, { dpi: tw / inf.w * 72, background: '#ffffff', annots: true });
        const x = gap + (k % cols) * (tw + gap), y = gap + Math.floor(k / cols) * (maxH + lab + gap);
        sc.drawImage(c, x, y, tw, c.height * tw / c.width); sc.strokeStyle = '#999'; sc.strokeRect(x - 0.5, y - 0.5, tw + 1, c.height * tw / c.width + 1);
        sc.fillStyle = '#333'; sc.fillText(String(i + 1), x + tw / 2, y + maxH + 14); k++;
      }
      const b = await toBlob(sheet, FMT[fmt][0], 0.92);
      return { blob: new File([b], `${baseName(f)}-sheet.${FMT[fmt][1]}`, { type: FMT[fmt][0] }), text: `${idx.length} page(s) on a ${sheet.width}x${sheet.height}px sheet\n${[...rr.warn].slice(0, 8).join('\n')}` };
    },
  },
];

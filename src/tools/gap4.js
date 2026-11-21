// gap4.js: PDF compress, PDF password protect / remove, PDF annotate, PDF form filler, DOCX to PDF.
// Zero dependencies, client-side only. Own whole-document engine (parse -> object map -> garbage-collected rewrite with a
// classic xref table). Unlike pdfedit.js it keeps every reachable object (AcroForm, outlines, annotations, ...) and can
// read and write the standard security handler. The engine is exported by name so Node scripts can drive it.
//
// Built here: pdf-compress, pdf-password-protect (RC4-128, AES-128, AES-256 R6), pdf-password-remove (RC4-40/128, AES-128,
//   AES-256 R5/R6, user or owner password), pdf-annotate, pdf-form-filler, docx-to-pdf (text subset).
//
// Skipped: Office to PDF for layout, fonts, images, numbering or other formats (needs a layout engine; only plain text, headings,
//   bullets and table rows of .docx are converted); audio trim / convert / record (audio-trimmer, audio-converter, audio-recorder
//   exist); video trim/convert (needs ffmpeg-class encoders; MediaRecorder only re-records in real time and WebCodecs has no
//   muxer); pdf-metadata-editor (exists).
//
// Ceilings (shared):
//  - Output is a fresh rewrite: unreachable objects are dropped, object/xref streams become plain objects, digital signatures
//    are invalidated, linearization is lost. Only Flate (+ no predictor) object streams are readable; others are reported.
//  - Public-key security handlers and encrypted files using crypt filters other than Standard are refused.
//  - Page content is appended to, never parsed: annotate/flatten wraps it in q ... Q (an unbalanced original can bleed state).

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
const AFM_H = '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584'.split(' ').map(Number);
const AFM_HB = '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584'.split(' ').map(Number);
const zDeflate = async (d) => new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
const eqB = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
const pwBytes = (s) => (/^[\0-\xff]*$/.test(s) ? u8(s) : enc.encode(s));

// ====================================================================== crypto primitives
function md5(m) {
  const s = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
  const n = m.length, total = (((n + 8) >> 6) + 1) << 6, buf = new Uint8Array(total);
  buf.set(m); buf[n] = 0x80;
  const dv = new DataView(buf.buffer); dv.setUint32(total - 8, (n * 8) >>> 0, true); dv.setUint32(total - 4, Math.floor(n / 536870912), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < total; off += 64) {
    const M = Array.from({ length: 16 }, (_, i) => dv.getUint32(off + i * 4, true));
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0; A = D; D = C; C = B;
      const r = s[(i >> 4) * 4 + (i & 3)]; B = (B + ((F << r) | (F >>> (32 - r)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const o = new Uint8Array(16), ov = new DataView(o.buffer); [a0, b0, c0, d0].forEach((x, i) => ov.setUint32(i * 4, x, true));
  return o;
}
function rc4(key, data) {
  const S = new Uint8Array(256); for (let i = 0; i < 256; i++) S[i] = i;
  for (let i = 0, j = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; [S[i], S[j]] = [S[j], S[i]]; }
  const o = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + S[i]) & 255; [S[i], S[j]] = [S[j], S[i]]; o[k] = data[k] ^ S[(S[i] + S[j]) & 255]; }
  return o;
}
const subtle = crypto.subtle, aesKey = (k, use) => subtle.importKey('raw', k, 'AES-CBC', false, [use]);
async function aesEnc(key, iv, data, pad = true) { const o = new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv }, await aesKey(key, 'encrypt'), data)); return pad ? o : o.slice(0, data.length); }
async function aesDec(key, iv, data, pad = true) { // pad=false: data is whole blocks, no padding (WebCrypto cannot, so a block that decrypts to valid padding is appended)
  const k = await aesKey(key, 'decrypt');
  if (pad) return new Uint8Array(await subtle.decrypt({ name: 'AES-CBC', iv }, k, data));
  const last = data.length ? data.subarray(data.length - 16) : iv, x = new Uint8Array(16); for (let i = 0; i < 16; i++) x[i] = 16 ^ last[i];
  const e = (await aesEnc(key, new Uint8Array(16), x)).slice(0, 16);
  return new Uint8Array(await subtle.decrypt({ name: 'AES-CBC', iv }, k, concat([data, e]))).slice(0, data.length);
}
const sha = async (alg, d) => new Uint8Array(await subtle.digest(alg, d));

// ====================================================================== standard security handler
const PAD = Uint8Array.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A'.match(/../g), (h) => parseInt(h, 16));
const padPw = (b) => { b = b.slice(0, 32); return concat([b, PAD.subarray(0, 32 - b.length)]); };
const le32 = (n) => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
const xorK = (k, i) => k.map((b) => b ^ i);
function fileKeyOld(padded, O, P, id0, R, n, encMeta) { // Algorithm 2
  let h = md5(concat([padded, O, le32(P), id0, R >= 4 && !encMeta ? new Uint8Array([255, 255, 255, 255]) : new Uint8Array(0)]));
  if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, n));
  return h.slice(0, n);
}
function makeU(key, R, id0) { // Algorithms 4/5
  if (R === 2) return rc4(key, PAD);
  let x = rc4(key, md5(concat([PAD, id0]))); for (let i = 1; i < 20; i++) x = rc4(xorK(key, i), x);
  return concat([x, new Uint8Array(16)]);
}
function ownerKey(ownerPad, R, n) { let h = md5(ownerPad); if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h); return h.slice(0, n); }
function makeO(ownerB, userB, R, n) { // Algorithm 3
  const k = ownerKey(padPw(ownerB), R, n); let x = rc4(k, padPw(userB));
  if (R >= 3) for (let i = 1; i < 20; i++) x = rc4(xorK(k, i), x);
  return x;
}
async function hash2B(pw, salt, udata) { // ISO 32000-2 Algorithm 2.B (R6)
  let K = await sha('SHA-256', concat([pw, salt, udata])), i = 0, e;
  while (i < 64 || e[e.length - 1] > i - 32) {
    const one = concat([pw, K, udata]), k1 = concat(Array.from({ length: 64 }, () => one));
    e = await aesEnc(K.subarray(0, 16), K.subarray(16, 32), k1, false);
    let sum = 0; for (let j = 0; j < 16; j++) sum += e[j];
    K = await sha(['SHA-256', 'SHA-384', 'SHA-512'][sum % 3], e); i++;
  }
  return K.slice(0, 32);
}
const hash2A = async (pw, salt, udata) => sha('SHA-256', concat([pw, salt, udata]));

// Open the Encrypt dictionary E with a password. Returns {key, R, stm, str, encMeta, owner}; throws on a wrong password.
async function openHandler(E, r, id0, pw) {
  if ((r(E.Filter)?.n ?? 'Standard') !== 'Standard') throw new Error('Only the standard password security handler is supported');
  const V = r(E.V) || 0, R = r(E.R) || 2, O = r(E.O).b, U = r(E.U).b, P = r(E.P) | 0, encMeta = r(E.EncryptMetadata) !== false;
  if (V > 5 || R > 6 || R < 2) throw new Error(`Unsupported encryption version V${V} R${R}`);
  let stm = 'rc4', str = 'rc4', n = Math.max(5, Math.floor((r(E.Length) || 40) / 8));
  if (V === 1) n = 5;
  if (V >= 4) {
    const cf = r(E.CF) || {}, method = (name) => {
      name = r(name); if (!name || name.n === 'Identity') return 'none';
      const c = r(cf[name.n]) || {}, m = r(c.CFM)?.n;
      return m === 'V2' ? 'rc4' : m === 'AESV2' ? 'aes128' : m === 'AESV3' ? 'aes256' : 'none';
    };
    stm = method(E.StmF); str = method(E.StrF);
    if (V === 4) n = 16;
  }
  const pwb = pwBytes(pw);
  if (R >= 5) {
    const pw8 = enc.encode(pw).slice(0, 127), H = R === 6 ? hash2B : hash2A, U48 = U.subarray(0, 48), z = new Uint8Array(16), none = new Uint8Array(0);
    if (eqB(await H(pw8, U.subarray(32, 40), none), U.subarray(0, 32)))
      return { key: await aesDec(await H(pw8, U.subarray(40, 48), none), z, r(E.UE).b.subarray(0, 32), false), R, stm, str, encMeta, owner: false };
    if (eqB(await H(pw8, O.subarray(32, 40), U48), O.subarray(0, 32)))
      return { key: await aesDec(await H(pw8, O.subarray(40, 48), U48), z, r(E.OE).b.subarray(0, 32), false), R, stm, str, encMeta, owner: true };
    throw new Error(pw ? 'Wrong password' : 'This PDF needs a password to open');
  }
  const check = (padded) => {
    const key = fileKeyOld(padded, O, P, id0, R, n, encMeta), u = makeU(key, R, id0);
    return eqB(R === 2 ? u : u.subarray(0, 16), R === 2 ? U.subarray(0, 32) : U.subarray(0, 16)) ? key : null;
  };
  let key = check(padPw(pwb)), owner = false;
  if (!key) { // pw may be the owner password: recover the user password from /O (Algorithm 7)
    const k = ownerKey(padPw(pwb), R, n); let x = O.subarray(0, 32);
    if (R === 2) x = rc4(k, x); else for (let i = 19; i >= 0; i--) x = rc4(xorK(k, i), x);
    key = check(x); owner = !!key;
  }
  if (!key) throw new Error(pw ? 'Wrong password' : 'This PDF needs a password to open');
  return { key, R, stm, str, encMeta, owner };
}
// encrypt or decrypt one byte string / stream body for object (num, gen)
async function crypt(h, method, num, gen, data, encrypt) {
  if (method === 'none') return data;
  let k = h.key;
  if (method !== 'aes256') {
    const extra = method === 'aes128' ? u8('sAlT') : new Uint8Array(0);
    k = md5(concat([k, new Uint8Array([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]), extra])).slice(0, Math.min(h.key.length + 5, 16));
  }
  if (method === 'rc4') return rc4(k, data);
  if (encrypt) { const iv = rnd(16); return concat([iv, await aesEnc(k, iv, data)]); }
  if (data.length < 32) return new Uint8Array(0);
  return aesDec(k, data.subarray(0, 16), data.subarray(16, 16 + ((data.length - 16) >> 4 << 4)));
}
async function xform(v, h, num, gen, encrypt) {
  if (v instanceof Str) return new Str(await crypt(h, h.str, num, gen, v.b, encrypt));
  if (Array.isArray(v)) return Promise.all(v.map((x) => xform(x, h, num, gen, encrypt)));
  if (v instanceof Stream) {
    const d = (await xform(v.dict, h, num, gen, encrypt)), t = v.dict.Type?.n, f = [].concat(v.dict.Filter ?? []);
    const skip = t === 'XRef' || (t === 'Metadata' && !h.encMeta) || f.some((x) => x instanceof Name && x.n === 'Crypt');
    return new Stream(d, skip ? v.data : await crypt(h, h.stm, num, gen, v.data, encrypt));
  }
  if (isDict(v)) { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = await xform(x, h, num, gen, encrypt); return o; }
  return v;
}

// ====================================================================== reader
async function inflateStream(st) {
  const f = [].concat(st.dict.Filter ?? []).map((x) => x?.n);
  if (f.length > 1 || (f.length && f[0] !== 'FlateDecode' && f[0] !== 'Fl')) throw new Error('unsupported filter ' + f.join(','));
  const p = st.dict.DecodeParms; if (p && isDict(p) && (p.Predictor || 1) > 1) throw new Error('predictor');
  return f.length ? zInflate(st.data) : st.data;
}
// -> {objs: Map(num -> value), trailer: {Root, Info, ID}, version, wasEncrypted, owner, notes}
export async function loadPdf(bytes, password = '', name = 'file') {
  const s = latin(bytes), hv = /%PDF-(\d\.\d)/.exec(s.slice(0, 1024));
  if (!hv && !/\bobj\b/.test(s)) throw new Error(`${name} does not look like a PDF`);
  const entries = [], trailers = [], re = /(\d+)[ \t\r\n\f\0]+(\d+)[ \t\r\n\f\0]+obj(?![A-Za-z])/g, notes = [];
  let m;
  while ((m = re.exec(s))) {
    const num = +m[1], gen = +m[2], off = m.index;
    try {
      let [v, i] = parseValue(s, re.lastIndex);
      if (v instanceof Kw) continue;
      if (isDict(v)) {
        let j = i; while (j < s.length && WS.includes(s[j])) j++;
        if (s.startsWith('stream', j)) {
          j += 6; if (s[j] === '\r' && s[j + 1] === '\n') j += 2; else if (s[j] === '\n' || s[j] === '\r') j++;
          let end = -1; const L = v.Length;
          if (typeof L === 'number' && L >= 0 && j + L <= s.length) { let k = j + L; while (k < s.length && WS.includes(s[k])) k++; if (s.startsWith('endstream', k)) end = j + L; }
          if (end < 0) { const e = s.indexOf('endstream', j); end = e < 0 ? s.length : e; if (s[end - 1] === '\n') end--; if (s[end - 1] === '\r') end--; }
          v = new Stream(v, bytes.slice(j, end)); i = Math.max(i, end);
        }
        if (v instanceof Stream && v.dict.Type?.n === 'XRef') trailers.push({ off, d: v.dict });
      }
      entries.push({ num, gen, v }); re.lastIndex = i;
    } catch { /* garbage that looked like an object header */ }
  }
  const tre = /trailer[ \t\r\n\f\0]*<</g;
  while ((m = tre.exec(s))) { try { const [v] = parseValue(s, m.index + 7); if (isDict(v)) trailers.push({ off: m.index, d: v }); } catch { /* ignore */ } }
  trailers.sort((a, b) => a.off - b.off);
  const trailer = {}; let encRaw = null;
  for (const t of trailers) { for (const k of ['Root', 'Info', 'ID', 'Encrypt']) if (t.d[k] != null) trailer[k] = t.d[k]; }
  const byNum = new Map(); for (const e of entries) byNum.set(e.num, e);
  const r = (v) => { for (let k = 0; v instanceof Ref && k < 50; k++) v = byNum.get(v.n)?.v ?? null; return v instanceof Ref ? null : v; };
  let wasEncrypted = false, owner = false, h = null, skip = -1;
  if (trailer.Encrypt != null) {
    wasEncrypted = true; if (trailer.Encrypt instanceof Ref) skip = trailer.Encrypt.n; encRaw = r(trailer.Encrypt);
    const id = r(trailer.ID), id0 = Array.isArray(id) && id[0] instanceof Str ? id[0].b : new Uint8Array(0);
    h = await openHandler(encRaw, r, id0, password); owner = h.owner;
  }
  const objs = new Map();
  for (const e of entries) {
    let v = e.v;
    if (h && e.num !== skip) v = await xform(v, h, e.num, e.gen, false);
    objs.set(e.num, v);
  }
  for (const e of entries) {
    const st = objs.get(e.num);
    if (st instanceof Stream && st.dict.Type?.n === 'ObjStm') {
      try {
        const t = latin(await inflateStream(st)), n = st.dict.N, first = st.dict.First, hdr = [], nre = /\d+/g, head = t.slice(0, first);
        for (let k = 0; k < n * 2; k++) { const mm = nre.exec(head); if (!mm) break; hdr.push(+mm[0]); }
        for (let k = 0; k + 1 < hdr.length; k += 2) { try { objs.set(hdr[k], parseValue(t, first + hdr[k + 1])[0]); } catch { notes.push(`object ${hdr[k]} unreadable`); } }
      } catch (err) { notes.push(`object stream ${e.num} unreadable (${err.message}); its objects are lost`); }
    }
  }
  let root = trailer.Root;
  const rr = (v) => { for (let k = 0; v instanceof Ref && k < 50; k++) v = objs.get(v.n) ?? null; return v instanceof Ref ? null : v; };
  if (!isDict(rr(root)) || !rr(rr(root).Pages)) {
    root = null; for (const [n, v] of objs) if (isDict(v) && v.Type?.n === 'Catalog') root = new Ref(n);
    if (!root) throw new Error(`No catalog found in ${name}`);
  }
  return { objs, trailer: { Root: root, Info: trailer.Info, ID: rr(trailer.ID) }, version: hv ? hv[1] : '1.4', wasEncrypted, owner, notes, r: rr };
}

// ====================================================================== writer (garbage-collecting rewrite)
function collect(objs, roots) { // reachable objects, renumbered in discovery order
  const map = new Map(), order = [], stack = [...roots].reverse();
  while (stack.length) {
    const v = stack.pop();
    if (v instanceof Ref) { if (!map.has(v.n) && objs.has(v.n)) { map.set(v.n, order.length + 1); order.push(v.n); stack.push(objs.get(v.n)); } }
    else if (Array.isArray(v)) for (let i = v.length - 1; i >= 0; i--) stack.push(v[i]);
    else if (v instanceof Stream) stack.push(v.dict);
    else if (isDict(v)) for (const x of Object.values(v)) stack.push(x);
  }
  return { map, order };
}
function remap(v, map) {
  if (v instanceof Ref) return map.has(v.n) ? new Ref(map.get(v.n)) : null;
  if (Array.isArray(v)) return v.map((x) => remap(x, map));
  if (v instanceof Stream) return new Stream(remap(v.dict, map), v.data);
  if (isDict(v)) { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = remap(x, map); return o; }
  return v;
}
// doc: {objs, trailer, version}; encrypt: {h, dict} or null. Returns {bytes, count}.
export async function writePdf(doc, { encrypt = null, version = null, pack = false } = {}) {
  const roots = [doc.trailer.Root, doc.trailer.Info].filter((x) => x instanceof Ref);
  const { map, order } = collect(doc.objs, roots), objs = [null];
  for (const old of order) objs.push(remap(doc.objs.get(old), map));
  const trailer = { Root: new Ref(map.get(doc.trailer.Root.n)) };
  if (doc.trailer.Info instanceof Ref && map.has(doc.trailer.Info.n)) trailer.Info = new Ref(map.get(doc.trailer.Info.n));
  const id0 = doc.trailer.ID?.[0] instanceof Str ? doc.trailer.ID[0].b : rnd(16);
  trailer.ID = [new Str(id0), new Str(encrypt ? rnd(16) : doc.trailer.ID?.[1] instanceof Str ? doc.trailer.ID[1].b : id0)];
  const ver = version || String(Math.max(parseFloat(doc.version) || 1.4, 1.4));
  if (pack && !encrypt) return packed(objs, trailer, maxV(ver, '1.5'), order.length, doc.objs.size);
  const parts = [u8(`%PDF-${ver}\n%\xE2\xE3\xCF\xD3\n`)], offs = [0]; let len = parts[0].length;
  const put = (n, v) => {
    offs[n] = len;
    const b = v instanceof Stream
      ? concat([u8(`${n} 0 obj\n${ser({ ...v.dict, Length: v.data.length })}\nstream\n`), v.data, u8('\nendstream\nendobj\n')])
      : u8(`${n} 0 obj\n${ser(v)}\nendobj\n`);
    parts.push(b); len += b.length;
  };
  for (let n = 1; n < objs.length; n++) put(n, encrypt ? await xform(objs[n], encrypt.h, n, 0, true) : objs[n]);
  if (encrypt) { trailer.Encrypt = new Ref(objs.length); put(objs.length, encrypt.dict); }
  const size = encrypt ? objs.length + 1 : objs.length; trailer.Size = size;
  let xr = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) xr += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  parts.push(u8(`${xr}trailer\n${ser(trailer)}\nstartxref\n${len}\n%%EOF\n`));
  return { bytes: concat(parts), count: size - 1, kept: order.length, total: doc.objs.size };
}


// object streams + cross-reference stream (PDF 1.5): every non-stream object goes into /ObjStm chunks of 100
async function packed(objs, trailer, ver, kept, total) {
  const parts = [u8(`%PDF-${ver}\n%\xE2\xE3\xCF\xD3\n`)], offs = [], place = new Map(); let len = parts[0].length;
  const put = (n, v) => { offs[n] = len; const b = concat([u8(`${n} 0 obj\n${ser({ ...v.dict, Length: v.data.length })}\nstream\n`), v.data, u8('\nendstream\nendobj\n')]); parts.push(b); len += b.length; };
  const plain = []; for (let n = 1; n < objs.length; n++) { if (objs[n] instanceof Stream) put(n, objs[n]); else plain.push(n); }
  let next = objs.length;
  for (let c = 0; c < plain.length; c += 100) {
    let hdr = '', body = ''; const ch = plain.slice(c, c + 100), num = next++;
    ch.forEach((n, i) => { hdr += `${n} ${body.length} `; body += ser(objs[n]) + '\n'; place.set(n, [num, i]); });
    put(num, new Stream({ Type: nm('ObjStm'), N: ch.length, First: hdr.length, Filter: nm('FlateDecode') }, await zDeflate(u8(hdr + body))));
  }
  const xr = next++, rows = new Uint8Array(next * 7), dv = new DataView(rows.buffer);
  rows.set([0, 0, 0, 0, 0, 255, 255], 0);
  const row = (i, t, a, b) => { dv.setUint8(i * 7, t); dv.setUint32(i * 7 + 1, a); dv.setUint16(i * 7 + 5, b); };
  for (let n = 1; n < xr; n++) { if (place.has(n)) row(n, 2, ...place.get(n)); else row(n, 1, offs[n], 0); }
  row(xr, 1, len, 0);
  const t = { ...trailer, Type: nm('XRef'), Size: next, W: [1, 4, 2], Filter: nm('FlateDecode') }; delete t.Encrypt;
  put(xr, new Stream(t, await zDeflate(rows)));
  parts.push(u8(`startxref\n${offs[xr]}\n%%EOF\n`));
  return { bytes: concat(parts), count: next - 1, kept, total };
}

const loadPlain = async (bytes) => { const d = await loadPdf(bytes); if (d.wasEncrypted) throw new Error('This PDF is encrypted: remove its password first (the Remove PDF Password tool), because the result would otherwise lose the encryption'); return d; };

// ====================================================================== protect
export async function buildEncrypt({ user = '', owner = '', method = 'AES-256', perms = {} }, id0) {
  if (!user && !owner) throw new Error('Enter a user password (to open the file) and/or an owner password (to restrict it)');
  if (!owner) owner = Array.from(rnd(12), (b) => b.toString(16).padStart(2, '0')).join(''); // random: restrictions can then only be lifted by tools that ignore them
  let bits = 0xFFFFF0C0;
  if (perms.print) bits |= 4 | 2048; if (perms.modify) bits |= 8 | 1024; if (perms.copy) bits |= 16 | 512; if (perms.annotate) bits |= 32 | 256;
  if (!perms.copy) bits |= 512; // accessibility extraction stays allowed (PDF/UA)
  const P = bits | 0, z = new Uint8Array(16), none = new Uint8Array(0);
  if (method === 'AES-256') {
    const fk = rnd(32), pu = enc.encode(user).slice(0, 127), po = enc.encode(owner).slice(0, 127), [vs, ks, ovs, oks] = [rnd(8), rnd(8), rnd(8), rnd(8)];
    const U = concat([await hash2B(pu, vs, none), vs, ks]), UE = await aesEnc(await hash2B(pu, ks, none), z, fk, false);
    const O = concat([await hash2B(po, ovs, U), ovs, oks]), OE = await aesEnc(await hash2B(po, oks, U), z, fk, false);
    const Perms = await aesEnc(fk, z, concat([le32(P), new Uint8Array([255, 255, 255, 255, 84]), u8('adb'), rnd(4)]), false);
    const dict = { Filter: nm('Standard'), V: 5, R: 6, Length: 256, P, O: new Str(O), U: new Str(U), OE: new Str(OE), UE: new Str(UE), Perms: new Str(Perms),
      CF: { StdCF: { Type: nm('CryptFilter'), CFM: nm('AESV3'), AuthEvent: nm('DocOpen'), Length: 32 } }, StmF: nm('StdCF'), StrF: nm('StdCF') };
    return { h: { key: fk, stm: 'aes256', str: 'aes256', encMeta: true }, dict, version: '2.0' };
  }
  const aes = method === 'AES-128', R = aes ? 4 : 3;
  const O = makeO(pwBytes(owner), pwBytes(user), R, 16), key = fileKeyOld(padPw(pwBytes(user)), O, P, id0, R, 16, true), U = makeU(key, R, id0);
  const dict = { Filter: nm('Standard'), V: aes ? 4 : 2, R, Length: 128, P, O: new Str(O), U: new Str(U) };
  if (aes) Object.assign(dict, { CF: { StdCF: { Type: nm('CryptFilter'), CFM: nm('AESV2'), AuthEvent: nm('DocOpen'), Length: 16 } }, StmF: nm('StdCF'), StrF: nm('StdCF') });
  return { h: { key, stm: aes ? 'aes128' : 'rc4', str: aes ? 'aes128' : 'rc4', encMeta: true }, dict, version: aes ? '1.6' : '1.5' };
}
export async function protectPdf(bytes, o) {
  const doc = await loadPlain(bytes);
  const id0 = rnd(16); doc.trailer.ID = [new Str(id0), new Str(id0)];
  const e = await buildEncrypt(o, id0);
  return { ...(await writePdf(doc, { encrypt: e, version: maxV(doc.version, e.version) })), notes: doc.notes };
}
const maxV = (a, b) => (parseFloat(a) >= parseFloat(b) ? a : b);
export async function unlockPdf(bytes, password) {
  const doc = await loadPdf(bytes, password);
  if (!doc.wasEncrypted) throw new Error('This PDF is not password protected');
  return { ...(await writePdf(doc)), notes: doc.notes, owner: doc.owner };
}

// ====================================================================== compress
async function reJpeg(data, maxpx, q) {
  const bmp = await createImageBitmap(new Blob([data], { type: 'image/jpeg' }), { colorSpaceConversion: 'none', imageOrientation: 'none' });
  const sc = Math.min(1, maxpx / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * sc)), h = Math.max(1, Math.round(bmp.height * sc));
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const blob = cv.convertToBlob ? await cv.convertToBlob({ type: 'image/jpeg', quality: q }) : await new Promise((res) => cv.toBlob(res, 'image/jpeg', q));
  return { data: new Uint8Array(await blob.arrayBuffer()), w, h };
}
export async function compressPdf(bytes, { recompress = true, images = false, maxpx = 1600, quality = 0.7 } = {}) {
  const doc = await loadPlain(bytes), stat = { deflated: 0, recompressed: 0, images: 0, imagesSkipped: 0, saved: 0 };
  const { map, order } = collect(doc.objs, [doc.trailer.Root, doc.trailer.Info].filter((x) => x instanceof Ref));
  const live = new Map(order.map((n) => [n, doc.objs.get(n)])), r = (v) => { for (let k = 0; v instanceof Ref && k < 50; k++) v = doc.objs.get(v.n) ?? null; return v instanceof Ref ? null : v; };
  for (const [n, st] of live) {
    if (!(st instanceof Stream)) continue;
    const t = st.dict.Type?.n; if (t === 'XRef' || t === 'ObjStm') continue;
    const f = [].concat(st.dict.Filter ?? []).map((x) => x?.n), parm = st.dict.DecodeParms, before = st.data.length;
    if (images && f.length === 1 && f[0] === 'DCTDecode' && st.dict.Subtype?.n === 'Image' && !st.dict.Decode && !st.dict.Mask && r(st.dict.BitsPerComponent) === 8) {
      const raw = r(st.dict.ColorSpace), cn = Array.isArray(raw) ? r(raw[0])?.n : raw?.n; // ICCBased (3 channels): pixel values are kept, profile stays attached
      if (cn === 'DeviceRGB' || cn === 'DeviceGray' || (cn === 'ICCBased' && r(raw[1])?.dict?.N === 3)) {
        try {
          const j = await reJpeg(st.data, maxpx, quality);
          if (j.data.length < before * 0.95) {
            live.set(n, new Stream({ ...st.dict, Width: j.w, Height: j.h, ColorSpace: cn === 'DeviceGray' ? nm('DeviceRGB') : st.dict.ColorSpace, Filter: nm('DCTDecode'), DecodeParms: undefined }, j.data));
            stat.images++; stat.saved += before - j.data.length; continue;
          }
        } catch { /* fall through: leave the image alone */ }
      }
      stat.imagesSkipped++; continue;
    }
    if (!f.length) {
      if (before < 40) continue;
      const z = await zDeflate(st.data);
      if (z.length < before) { live.set(n, new Stream({ ...st.dict, Filter: nm('FlateDecode') }, z)); stat.deflated++; stat.saved += before - z.length; }
    } else if (recompress && f.length === 1 && (f[0] === 'FlateDecode' || f[0] === 'Fl')) {
      try {
        const z = await zDeflate(await zInflate(st.data));
        if (z.length < before) { live.set(n, new Stream({ ...st.dict }, z)); stat.recompressed++; stat.saved += before - z.length; }
      } catch { /* damaged stream: keep as is */ }
    }
  }
  doc.objs = live;
  const out = await writePdf(doc, { pack: true });
  return { ...out, stat, notes: doc.notes };
}

// ====================================================================== page helpers
function getPages(doc) {
  const r = doc.r, pages = [], seen = new Set(), keys = ['Resources', 'MediaBox', 'CropBox', 'Rotate'];
  const walk = (node, inh, depth) => {
    const ref = node instanceof Ref ? node : null;
    if (ref) { if (seen.has(ref.n)) return; seen.add(ref.n); }
    const n = r(node); if (!isDict(n) || depth > 60) return;
    const kids = r(n.Kids);
    if (Array.isArray(kids) && n.Type?.n !== 'Page') { const i2 = { ...inh }; for (const k of keys) if (n[k] !== undefined) i2[k] = n[k]; for (const k of kids) walk(k, i2, depth + 1); }
    else pages.push({ ref, dict: n, inh });
  };
  walk(r(doc.trailer.Root).Pages, {}, 0);
  if (!pages.length) throw new Error('No pages found');
  return pages;
}
const nums = (doc, v) => { v = doc.r(v); return Array.isArray(v) ? v.map((x) => doc.r(x)) : null; };
const boxOf = (doc, v) => { const a = nums(doc, v); if (!a || a.length < 4 || a.slice(0, 4).some((x) => typeof x !== 'number')) return null; return [Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3])]; };
// matrix mapping top-left based, y-down displayed coordinates (points) to user space
function geom(doc, p) {
  const g = (k) => (p.dict[k] !== undefined ? p.dict[k] : p.inh[k]);
  const media = boxOf(doc, g('MediaBox')) || [0, 0, 612, 792], crop = boxOf(doc, g('CropBox')) || media;
  let v = [Math.max(media[0], crop[0]), Math.max(media[1], crop[1]), Math.min(media[2], crop[2]), Math.min(media[3], crop[3])];
  if (v[2] <= v[0] || v[3] <= v[1]) v = media;
  const rot = ((Math.round((doc.r(g('Rotate')) || 0) / 90) * 90) % 360 + 360) % 360, [x0, y0, x1, y1] = v;
  const m = rot === 90 ? [0, 1, 1, 0, x0, y0] : rot === 180 ? [-1, 0, 0, 1, x1, y0] : rot === 270 ? [0, -1, -1, 0, x1, y1] : [1, 0, 0, -1, x0, y1];
  const sw = rot === 90 || rot === 270;
  return { vis: v, rot, m, w: sw ? y1 - y0 : x1 - x0, h: sw ? x1 - x0 : y1 - y0 };
}
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const bboxUser = (m, pts) => { const q = pts.map(([x, y]) => apply(m, x, y)); return [Math.min(...q.map((a) => a[0])), Math.min(...q.map((a) => a[1])), Math.max(...q.map((a) => a[0])), Math.max(...q.map((a) => a[1]))]; };
const nextNum = (doc) => { let n = 0; for (const k of doc.objs.keys()) if (k > n) n = k; return n + 1; };
const addObj = (doc, v) => { const n = nextNum(doc); doc.objs.set(n, v); return new Ref(n); };
const HELV = () => ({ Type: nm('Font'), Subtype: nm('Type1'), BaseFont: nm('Helvetica'), Encoding: nm('WinAnsiEncoding') });
const CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
const winBytes = (s) => { const o = []; for (const ch of String(s)) { const c = ch.codePointAt(0); o.push(c >= 32 && c < 127 || c >= 160 && c < 256 ? c : CP1252[c] ?? (c === 9 ? 32 : 63)); } return Uint8Array.from(o); };
const cw = (b, bold) => (c) => ((bold ? AFM_HB : AFM_H)[c - 32] ?? 556) / 1000;
const strW = (bytes, size, bold) => { let w = 0; const f = cw(0, bold); for (const c of bytes) w += f(c); return w * size; };
const COLORS = { black: '#000000', red: '#d00000', green: '#008000', blue: '#0040d0', yellow: '#ffff00', orange: '#ff9000', pink: '#ff60b0', cyan: '#00c0ff', gray: '#808080', white: '#ffffff' };
function color(s) {
  s = (COLORS[String(s).toLowerCase()] || String(s)).replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, '$&$&');
  if (!/^[0-9a-f]{6}$/i.test(s)) throw new Error(`Unknown colour "${s}" (use #rrggbb or a name such as red, yellow)`);
  return [0, 2, 4].map((i) => +(parseInt(s.slice(i, i + 2), 16) / 255).toFixed(3));
}
function pageSel(spec, total) {
  if (spec === 'all') return Array.from({ length: total }, (_, i) => i);
  const m = /^(\d+)(?:-(\d+))?$/.exec(spec); if (!m) throw new Error(`Bad page "${spec}" (use 3, 2-4 or all)`);
  const a = +m[1], b = m[2] ? +m[2] : a;
  if (a < 1 || b < a || b > total) throw new Error(`Page "${spec}" is outside 1-${total}`);
  return Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i);
}
// make page resources and contents editable, return helpers
function editable(doc, p) {
  const res = { ...(doc.r(p.dict.Resources ?? p.inh.Resources) || {}) };
  res.XObject = { ...(doc.r(res.XObject) || {}) };
  p.dict.Resources = res;
  const c = p.dict.Contents, cur = doc.r(c);
  const list = c === undefined ? [] : Array.isArray(cur) ? [...cur] : [c];
  return {
    addForm(name, ref) { res.XObject[name] = ref; },
    uniq(base) { let i = 0; while (res.XObject[base + i]) i++; return base + i; },
    wrap(tail) { p.dict.Contents = [addObj(doc, new Stream({}, u8('q\n'))), ...list, addObj(doc, new Stream({}, u8('Q\n' + tail)))]; },
    pushAnnot(ref) {
      const a = p.dict.Annots, arr = doc.r(a);
      if (Array.isArray(arr) && a instanceof Ref) arr.push(ref); else p.dict.Annots = [...(Array.isArray(arr) ? arr : []), ref];
    },
  };
}

// ====================================================================== annotate
// line grammar (coordinates in points from the top-left corner of the page as displayed):
//   PAGES text X Y SIZE COLOR words...  |  highlight X Y W H COLOR  |  rect X Y W H COLOR [WIDTH]
//   PAGES line X1 Y1 X2 Y2 COLOR [WIDTH]  |  draw COLOR WIDTH x,y x,y x,y ...      PAGES = 3, 2-4 or all
export function parseAnnotations(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach((raw, li) => {
    const line = raw.trim(); if (!line || line[0] === '#') return;
    const bad = (m) => new Error(`Line ${li + 1}: ${m}`);
    const t = line.split(/\s+/), pages = t[0], kind = (t[1] || '').toLowerCase(), n = (i) => { const v = Number(t[i]); if (t[i] === undefined || !isFinite(v)) throw bad(`number expected at word ${i + 1}`); return v; };
    try {
      if (kind === 'text') { const s = n(4); out.push({ pages, kind, x: n(2), y: n(3), size: s, col: color(t[5]), text: t.slice(6).join(' ') }); if (!out.at(-1).text) throw bad('text is empty'); }
      else if (kind === 'highlight' || kind === 'rect') out.push({ pages, kind, x: n(2), y: n(3), w: n(4), h: n(5), col: color(t[6] || (kind === 'highlight' ? 'yellow' : 'red')), lw: kind === 'rect' && t[7] ? n(7) : 1.5 });
      else if (kind === 'line') out.push({ pages, kind, pts: [[n(2), n(3)], [n(4), n(5)]], col: color(t[6] || 'red'), lw: t[7] ? n(7) : 1.5 });
      else if (kind === 'draw') {
        const pts = t.slice(4).map((s) => s.split(',').map(Number)); if (pts.length < 2 || pts.some((q) => q.length !== 2 || q.some((v) => !isFinite(v)))) throw bad('draw needs at least two x,y points');
        out.push({ pages, kind, pts, col: color(t[2]), lw: n(3) });
      } else throw bad(`unknown annotation "${kind}" (text, highlight, rect, line, draw)`);
    } catch (e) { throw e.message.startsWith('Line') ? e : bad(e.message); }
  });
  if (!out.length) throw new Error('Write at least one annotation line');
  return out;
}
const f4 = numStr;
function annContent(a) { // content in displayed (y down) space
  const [r, g, b] = a.col, c = `${r} ${g} ${b}`;
  if (a.kind === 'text') return `BT /Helv ${f4(a.size)} Tf ${c} rg 1 0 0 -1 ${f4(a.x)} ${f4(a.y + a.size * 0.8)} Tm ${ser(new Str(winBytes(a.text)))} Tj ET\n`;
  if (a.kind === 'highlight') return `/GS gs ${c} rg ${f4(a.x)} ${f4(a.y)} ${f4(a.w)} ${f4(a.h)} re f\n`;
  if (a.kind === 'rect') return `${c} RG ${f4(a.lw)} w ${f4(a.x)} ${f4(a.y)} ${f4(a.w)} ${f4(a.h)} re S\n`;
  const pts = a.pts.map(([x, y], i) => `${f4(x)} ${f4(y)} ${i ? 'l' : 'm'}`).join(' ');
  return `${c} RG ${f4(a.lw)} w 1 J 1 j ${pts} S\n`;
}
function annBox(a) {
  if (a.kind === 'text') { const w = strW(winBytes(a.text), a.size, false) + 2; return [[a.x, a.y], [a.x + w, a.y + a.size * 1.25]]; }
  if (a.kind === 'highlight' || a.kind === 'rect') { const e = a.kind === 'rect' ? a.lw / 2 : 0; return [[a.x - e, a.y - e], [a.x + a.w + e, a.y + a.h + e]]; }
  const e = a.lw; const xs = a.pts.map((p) => p[0]), ys = a.pts.map((p) => p[1]);
  return [[Math.min(...xs) - e, Math.min(...ys) - e], [Math.max(...xs) + e, Math.max(...ys) + e]];
}
export async function annotatePdf(bytes, text, { burn = false } = {}) {
  const doc = await loadPlain(bytes), pages = getPages(doc), list = parseAnnotations(text), per = new Map();
  for (const a of list) for (const i of pageSel(a.pages, pages.length)) { if (!per.has(i)) per.set(i, []); per.get(i).push(a); }
  const resources = () => ({ Font: { Helv: HELV() }, ExtGState: { GS: { Type: nm('ExtGState'), BM: nm('Multiply'), ca: 1, CA: 1 } } });
  let count = 0;
  for (const [i, items] of per) {
    const p = pages[i], g = geom(doc, p), ed = editable(doc, p), mtx = g.m.map(f4).join(' ') + ' cm\n';
    if (burn) {
      const form = addObj(doc, new Stream({ Type: nm('XObject'), Subtype: nm('Form'), BBox: g.vis, Resources: resources() }, u8(mtx + items.map(annContent).join(''))));
      const nmx = ed.uniq('GapAnn'); ed.addForm(nmx, form); ed.wrap(`q /${nmx} Do Q\n`); count += items.length;
    } else {
      for (const a of items) {
        const pts = annBox(a), rect = bboxUser(g.m, pts), [r, gg, b] = a.col;
        const ap = addObj(doc, new Stream({ Type: nm('XObject'), Subtype: nm('Form'), BBox: rect, Resources: resources() }, u8(mtx + annContent(a))));
        const an = { Type: nm('Annot'), Rect: rect, F: 4, C: [r, gg, b], AP: { N: ap } };
        if (a.kind === 'text') Object.assign(an, { Subtype: nm('FreeText'), Contents: new Str(winBytes(a.text)), DA: new Str(u8(`/Helv ${f4(a.size)} Tf ${r} ${gg} ${b} rg`)), Border: [0, 0, 0] });
        else if (a.kind === 'highlight') {
          const q = [[a.x, a.y], [a.x + a.w, a.y], [a.x, a.y + a.h], [a.x + a.w, a.y + a.h]].flatMap(([x, y]) => apply(g.m, x, y));
          Object.assign(an, { Subtype: nm('Highlight'), QuadPoints: q });
        } else if (a.kind === 'rect') Object.assign(an, { Subtype: nm('Square'), BS: { W: a.lw, S: nm('S') }, Border: [0, 0, a.lw] });
        else if (a.kind === 'line') Object.assign(an, { Subtype: nm('Line'), L: a.pts.flatMap(([x, y]) => apply(g.m, x, y)), BS: { W: a.lw }, Border: [0, 0, a.lw] });
        else Object.assign(an, { Subtype: nm('Ink'), InkList: [a.pts.flatMap(([x, y]) => apply(g.m, x, y))], BS: { W: a.lw }, Border: [0, 0, a.lw] });
        ed.pushAnnot(addObj(doc, an)); count++;
      }
    }
  }
  return { ...(await writePdf(doc)), count, pagesTouched: per.size, notes: doc.notes };
}

// ====================================================================== form filler
const textOf = (s) => (s.b[0] === 254 && s.b[1] === 255 ? new TextDecoder('utf-16be').decode(s.b.subarray(2)) : latin(s.b));
const pdfStr = (t) => { if (/^[\x20-\x7e]*$/.test(t)) return new Str(u8(t)); const b = new Uint8Array(2 + t.length * 2); b[0] = 254; b[1] = 255; for (let i = 0; i < t.length; i++) { b[2 + i * 2] = t.charCodeAt(i) >> 8; b[3 + i * 2] = t.charCodeAt(i) & 255; } return new Str(b); };
export function formFields(doc) {
  const r = doc.r, af = r(r(doc.trailer.Root).AcroForm);
  if (!isDict(af)) throw new Error('This PDF has no form fields (no AcroForm). Only PDF forms with fillable fields can be filled');
  const fields = [], seen = new Set();
  const walk = (node, parent, name, depth) => {
    const d = r(node); if (!isDict(d) || depth > 30 || seen.has(d)) return; seen.add(d);
    const t = r(d.T), full = t instanceof Str ? (name ? name + '.' : '') + textOf(t) : name;
    const inh = {}; for (const k of ['FT', 'Ff', 'V', 'DA', 'Q', 'Opt']) inh[k] = d[k] !== undefined ? d[k] : parent[k];
    const kids = r(d.Kids), kd = Array.isArray(kids) ? kids.map(r).filter(isDict) : [];
    if (kd.some((k) => r(k.T) instanceof Str)) { for (const k of kids) walk(k, inh, full, depth + 1); return; }
    if (r(inh.FT)) fields.push({ name: full, d, inh, widgets: kd.length ? kd : [d] });
  };
  for (const f of r(af.Fields) || []) walk(f, {}, '', 0);
  for (const f of fields) {
    const ft = r(f.inh.FT).n, ff = r(f.inh.Ff) || 0;
    f.kind = ft === 'Tx' ? 'text' : ft === 'Btn' ? (ff & 65536 ? 'button' : ff & 32768 ? 'radio' : 'checkbox') : ft === 'Ch' ? (ff & 131072 ? 'dropdown' : 'list') : ft === 'Sig' ? 'signature' : ft;
    f.ff = ff;
  }
  return { af, fields };
}
const states = (doc, w) => { const n = doc.r(doc.r(w.AP)?.N); return isDict(n) ? Object.keys(n) : []; };
const onState = (doc, w) => states(doc, w).find((k) => k !== 'Off') ?? 'Yes';
const opts = (doc, f) => (doc.r(f.inh.Opt) || []).map((o) => { o = doc.r(o); return Array.isArray(o) ? [textOf(doc.r(o[0])), textOf(doc.r(o[1]))] : o instanceof Str ? [textOf(o), textOf(o)] : null; }).filter(Boolean);
export function describeFields(doc, fields) {
  return fields.map((f) => {
    const v = doc.r(f.inh.V), cur = v instanceof Str ? textOf(v) : v instanceof Name ? v.n : '';
    let extra = '';
    if (f.kind === 'checkbox') extra = `  (on-state "${onState(doc, f.widgets[0])}"; write yes or no)`;
    else if (f.kind === 'radio') extra = `  (choices: ${[...new Set(f.widgets.flatMap((w) => states(doc, w)).filter((s) => s !== 'Off'))].join(', ')})`;
    else if (f.kind === 'dropdown' || f.kind === 'list') extra = `  (options: ${opts(doc, f).map((o) => o[0]).join(', ')})`;
    else if (f.kind === 'text' && f.ff & 4096) extra = '  (multi-line; use \\n for a line break)';
    return `${f.name}  [${f.kind}]  currently: ${cur || '(empty)'}${extra}`;
  }).join('\n');
}
function widgetAP(doc, af, f, w, value) {
  const r = doc.r, box = boxOf(doc, w.Rect); if (!box) return false;
  const W = box[2] - box[0], H = box[3] - box[1], mk = r(w.MK) || {}, bs = r(w.BS) || {};
  if (r(mk.R)) return false; // rotated widget: leave to the viewer (NeedAppearances)
  const bg = nums(doc, mk.BG), bc = nums(doc, mk.BC), bw = bc ? (typeof r(bs.W) === 'number' ? r(bs.W) : 1) : 0;
  const col = (a) => (a.length === 1 ? `${a[0]} ${a[0]} ${a[0]}` : a.length === 4 ? `${1 - Math.min(1, a[0] + a[3])} ${1 - Math.min(1, a[1] + a[3])} ${1 - Math.min(1, a[2] + a[3])}` : a.join(' '));
  const da = latin(r(f.inh.DA)?.b || r(af.DA)?.b || u8('/Helv 0 Tf 0 g')), fm = /\/(\S+)\s+([\d.]+)\s+Tf/.exec(da);
  const fname = fm?.[1] || 'Helv', ops = da.replace(/\/\S+\s+[\d.]+\s+Tf/, '').trim() || '0 g';
  let size = +(fm?.[2] || 0), q = r(f.inh.Q) || 0;
  const dfont = r(r(af.DR)?.Font)?.[fname], fd = r(dfont), simple = isDict(fd) && /^(Type1|TrueType)$/.test(r(fd.Subtype)?.n || '');
  const multi = f.kind === 'text' && f.ff & 4096, pwd = f.kind === 'text' && f.ff & 8192;
  let shown = pwd ? '*'.repeat(value.length) : value;
  if (f.kind === 'dropdown' || f.kind === 'list') shown = opts(doc, f).find((o) => o[0] === value)?.[1] ?? value;
  const avail = W - 4 - 2 * bw;
  let lines = shown.split(/\r?\n|\r/);
  if (!multi) lines = [lines.join(' ')];
  if (!size) size = multi ? 12 : Math.min(12, Math.max(4, H - 2 * bw - 3));
  const wrapL = (txt) => { const out = []; let cur = ''; for (const wd of txt.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (cur && strW(winBytes(t), size) > avail) { out.push(cur); cur = wd; } else cur = t; } out.push(cur); return out; };
  if (multi) lines = lines.flatMap(wrapL);
  else while (size > 4 && strW(winBytes(lines[0]), size) > avail && !(fm && +fm[2])) size -= 0.5;
  let c = '/Tx BMC q\n';
  if (bg) c += `${col(bg)} rg 0 0 ${f4(W)} ${f4(H)} re f\n`;
  if (bc && bw) c += `${col(bc)} RG ${f4(bw)} w ${f4(bw / 2)} ${f4(bw / 2)} ${f4(W - bw)} ${f4(H - bw)} re S\n`;
  c += `BT /${fname} ${f4(size)} Tf ${ops}\n`;
  let px = 0, py = 0;
  lines.forEach((ln, i) => {
    const b = winBytes(ln), tw = strW(b, size), x = q === 1 ? (W - tw) / 2 : q === 2 ? W - 2 - bw - tw : 2 + bw;
    const y = multi ? H - 2 - bw - size * 0.95 - i * size * 1.15 : (H - 0.72 * size) / 2;
    c += `${f4(x - px)} ${f4(y - py)} Td ${ser(new Str(b))} Tj\n`; px = x; py = y;
  });
  c += 'ET Q EMC\n';
  const font = simple ? dfont : HELV();
  w.AP = { N: addObj(doc, new Stream({ Type: nm('XObject'), Subtype: nm('Form'), BBox: [0, 0, W, H], Resources: { Font: { [fname]: font } } }, u8(c))) };
  delete w.AS; return true;
}
export async function fillForm(bytes, text, { flatten = false } = {}) {
  const doc = await loadPlain(bytes), { af, fields } = formFields(doc), r = doc.r, warn = [], done = [];
  const vals = [];
  String(text).split(/\r?\n/).forEach((l) => { l = l.trim(); if (!l || l[0] === '#') return; const i = l.indexOf('='); if (i < 1) { warn.push(`ignored line "${l}" (use name = value)`); return; } vals.push([l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/\\n/g, '\n')]); });
  const listing = describeFields(doc, fields);
  if (!vals.length && !flatten) return { listing, bytes: null, warn };
  let needApp = false;
  for (const [name, val] of vals) {
    const f = fields.find((x) => x.name === name) || fields.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!f) { warn.push(`no field named "${name}"`); continue; }
    if (f.ff & 1) warn.push(`"${f.name}" is marked read-only; filled anyway`);
    if (f.kind === 'text' || f.kind === 'dropdown' || f.kind === 'list') {
      f.d.V = pdfStr(val);
      if (f.kind === 'text' && f.ff & 16777216) warn.push(`"${f.name}" is a comb field: shown as plain text`);
      for (const w of f.widgets) if (!widgetAP(doc, af, f, w, val)) needApp = true;
    } else if (f.kind === 'checkbox') {
      const on = /^(1|yes|y|on|true|x|checked)$/i.test(val) || val === onState(doc, f.widgets[0]), st = on ? onState(doc, f.widgets[0]) : 'Off';
      f.d.V = nm(st); for (const w of f.widgets) w.AS = nm(st);
    } else if (f.kind === 'radio') {
      const all = [...new Set(f.widgets.flatMap((w) => states(doc, w)).filter((s) => s !== 'Off'))], pick = all.find((s) => s === val) ?? all.find((s) => s.toLowerCase() === val.toLowerCase());
      if (!pick && !/^(off|no)?$/i.test(val)) { warn.push(`"${f.name}": "${val}" is not one of ${all.join(', ')}`); continue; }
      f.d.V = nm(pick ?? 'Off'); for (const w of f.widgets) w.AS = nm(pick && states(doc, w).includes(pick) ? pick : 'Off');
    } else { warn.push(`"${f.name}" is a ${f.kind} field and cannot be filled`); continue; }
    done.push(f.name);
  }
  if (vals.length && !done.length) throw new Error('No field was filled: ' + warn.join('; '));
  let flat = 0;
  if (flatten) {
    for (const p of getPages(doc)) {
      const arr = r(p.dict.Annots); if (!Array.isArray(arr)) continue;
      const keep = [], ed = editable(doc, p); let tail = '';
      for (const a of arr) {
        const ad = r(a);
        if (!isDict(ad) || r(ad.Subtype)?.n !== 'Widget') { keep.push(a); continue; }
        const fl = r(ad.F) || 0; if (fl & 34) continue; // hidden / no-view widgets just disappear
        let nref = r(ad.AP)?.N; const nobj = r(nref);
        if (isDict(nobj)) nref = nobj[r(ad.AS)?.n]; // state dictionary
        const st = r(nref), rect = boxOf(doc, ad.Rect);
        if (!(st instanceof Stream) || !rect) continue;
        const M = nums(doc, st.dict.Matrix) || [1, 0, 0, 1, 0, 0], bb = boxOf(doc, st.dict.BBox) || [0, 0, rect[2] - rect[0], rect[3] - rect[1]];
        const t = bboxUser(M, [[bb[0], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]], [bb[2], bb[1]]]);
        const sx = (rect[2] - rect[0]) / ((t[2] - t[0]) || 1), sy = (rect[3] - rect[1]) / ((t[3] - t[1]) || 1);
        const nmx = ed.uniq('GapFld'); ed.addForm(nmx, nref);
        tail += `q ${[sx, 0, 0, sy, rect[0] - t[0] * sx, rect[1] - t[1] * sy].map(f4).join(' ')} cm /${nmx} Do Q\n`; flat++;
      }
      p.dict.Annots = keep; if (tail) ed.wrap(tail);
    }
    delete r(doc.trailer.Root).AcroForm;
  } else if (needApp) { af.NeedAppearances = true; warn.push('some widgets could not get a generated appearance; viewers will redraw them'); }
  const out = await writePdf(doc);
  return { ...out, listing, warn, done, flat, notes: doc.notes };
}

// ====================================================================== DOCX -> PDF (text subset)
async function unzipFile(b, want) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = b.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Not a .docx (zip) file');
  let p = dv.getUint32(e + 16, true);
  for (let k = dv.getUint16(e + 10, true); k > 0 && dv.getUint32(p, true) === 0x02014b50; k--) {
    const method = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = latin(b.subarray(p + 46, p + 46 + nl));
    if (name === want) {
      const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = b.subarray(start, start + cs);
      if (method === 0) return raw;
      if (method === 8) return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      throw new Error('Unsupported zip compression');
    }
    p += 46 + nl + el + cl;
  }
  return null;
}
const xmlText = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()]));
export function docxBlocks(xml) {
  const blocks = [], re = /<w:tbl>|<\/w:tbl>|<w:tr[ >]|<\/w:tr>|<w:tc[ >]|<\/w:tc>|<w:p\/>|<w:p[ >][\s\S]*?<\/w:p>/g;
  let depth = 0, row = null, cell = null, m;
  const para = (x) => {
    let t = ''; const rr = /<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<w:br [^>]*\/>|<w:cr\/>/g; let q;
    while ((q = rr.exec(x))) t += q[1] !== undefined ? xmlText(q[1]) : q[0].startsWith('<w:tab') ? '    ' : '\n';
    const sty = /<w:pStyle w:val="([^"]*)"/.exec(x)?.[1] || '', hm = /^(?:heading|überschrift|titre)\s*(\d)/i.exec(sty);
    return { text: t, level: /^title$/i.test(sty) ? 0 : hm ? +hm[1] : -1, li: /<w:numPr>/.test(x) };
  };
  while ((m = re.exec(xml))) {
    const tok = m[0];
    if (tok === '<w:tbl>') depth++; else if (tok === '</w:tbl>') depth = Math.max(0, depth - 1);
    else if (tok.startsWith('<w:tr')) row = []; else if (tok === '</w:tr>') { if (row?.length) blocks.push({ kind: 'row', text: row.join(' | ') }); row = null; }
    else if (tok.startsWith('<w:tc')) cell = []; else if (tok === '</w:tc>') { if (row && cell) row.push(cell.join(' ').trim()); cell = null; }
    else {
      const p = tok === '<w:p/>' ? { text: '', level: -1, li: false } : para(tok);
      if (cell) { if (p.text.trim()) cell.push(p.text.replace(/\s+/g, ' ')); }
      else blocks.push(p.level >= 0 ? { kind: 'h', level: p.level, text: p.text } : p.li ? { kind: 'li', text: p.text } : { kind: 'p', text: p.text });
    }
  }
  return blocks;
}
export async function docxToPdf(bytes, { paper = 'A4', size = 11, margin = 20, name = 'document' } = {}) {
  const x = await unzipFile(bytes, 'word/document.xml');
  if (!x) throw new Error('word/document.xml not found: is this a .docx file?');
  const blocks = docxBlocks(new TextDecoder().decode(x));
  if (!blocks.some((b) => b.text.trim())) throw new Error('No text found in the document');
  const [PW, PH] = paper === 'Letter' ? [612, 792] : [595.28, 841.89], mg = Math.max(10, margin) * 72 / 25.4, W = PW - 2 * mg, S = Math.max(6, Math.min(24, +size || 11));
  const pages = [[]]; let y = PH - mg;
  const room = (h) => { if (y - h < mg && pages.at(-1).length) { pages.push([]); y = PH - mg; } };
  for (const b of blocks) {
    const hs = b.kind === 'h' ? [22, 18, 15, 13, 12, 12, 12, 12, 12, 12][b.level] * S / 11 : S, bold = b.kind === 'h', ind = b.kind === 'li' ? 16 : 0, lh = hs * 1.25;
    if (!b.text.trim()) { y -= S * 0.8; continue; }
    if (bold && pages.at(-1).length) y -= hs * 0.5;
    const lines = [];
    for (const para of b.text.split('\n')) {
      let cur = '';
      for (let word of para.split(/ +/)) {
        const wb = () => strW(winBytes(word), hs, bold);
        while (wb() > W - ind) { let k = word.length; while (k > 1 && strW(winBytes(word.slice(0, k)), hs, bold) > W - ind) k--; if (cur) { lines.push(cur); cur = ''; } lines.push(word.slice(0, k)); word = word.slice(k); }
        const t = cur ? cur + ' ' + word : word;
        if (cur && strW(winBytes(t), hs, bold) > W - ind) { lines.push(cur); cur = word; } else cur = t;
      }
      lines.push(cur);
    }
    lines.forEach((ln, i) => {
      room(lh); y -= lh;
      if (b.kind === 'li' && !i) pages.at(-1).push({ x: mg + 2, y: y + hs * 0.25, s: hs, t: winBytes('•'), f: 'F1' });
      pages.at(-1).push({ x: mg + ind, y: y + hs * 0.25, s: hs, t: winBytes(ln), f: bold ? 'F2' : 'F1' });
    });
    y -= bold ? hs * 0.35 : S * 0.55;
  }
  const objs = new Map(), R = (n) => new Ref(n);
  objs.set(1, { Type: nm('Catalog'), Pages: R(2) });
  objs.set(3, { Type: nm('Font'), Subtype: nm('Type1'), BaseFont: nm('Helvetica'), Encoding: nm('WinAnsiEncoding') });
  objs.set(4, { Type: nm('Font'), Subtype: nm('Type1'), BaseFont: nm('Helvetica-Bold'), Encoding: nm('WinAnsiEncoding') });
  objs.set(5, { Title: pdfStr(name), Producer: pdfStr('Sitefig free tools (docx-to-pdf)') });
  const kids = [];
  for (let i = 0; i < pages.length; i++) {
    const c = pages[i].map((l) => `BT /${l.f} ${f4(l.s)} Tf ${f4(l.x)} ${f4(l.y)} Td ${ser(new Str(l.t))} Tj ET`).join('\n');
    objs.set(6 + i * 2, new Stream({ Filter: nm('FlateDecode') }, await zDeflate(u8(c))));
    objs.set(7 + i * 2, { Type: nm('Page'), Parent: R(2), MediaBox: [0, 0, +PW.toFixed(2), +PH.toFixed(2)], Resources: { Font: { F1: R(3), F2: R(4) } }, Contents: R(6 + i * 2) });
    kids.push(R(7 + i * 2));
  }
  objs.set(2, { Type: nm('Pages'), Kids: kids, Count: kids.length });
  return { ...(await writePdf({ objs, trailer: { Root: R(1), Info: R(5) }, version: '1.4' })), pages: pages.length, blocks: blocks.length };
}

// ====================================================================== tools
const pdfBlob = (b) => new Blob([b], { type: 'application/pdf' });
const one = (files) => { if (!files?.length) throw new Error('Choose a file'); return files[0]; };
const stem = (f) => f.name.replace(/\.[^.]+$/, '') || 'document';
const bytesOf = async (f) => new Uint8Array(await f.arrayBuffer());
const FILE = { accept: 'application/pdf,.pdf' };
const wrapErr = async (f, fn) => { try { return await fn(await bytesOf(f)); } catch (e) { throw new Error(e.message.includes(f.name) ? e.message : `${f.name}: ${e.message}`); } };
const pct = (a, b) => (a ? `${(((a - b) / a) * 100).toFixed(1)}%` : '0%');
const notesTxt = (n) => (n?.length ? '\nNotes: ' + n.join('; ') : '');

export default [
  {
    id: 'pdf-compress', cat: 'PDF', title: 'Compress PDF', inputs: 0, dom: true,
    desc: 'Make a PDF smaller without re-rendering it: deflate uncompressed streams, recompress Flate streams, drop objects nothing refers to and optionally downsample JPEG images.',
    file: FILE,
    opts: [
      { id: 'recompress', label: 'Recompress existing Flate streams', type: 'checkbox', def: true },
      { id: 'images', label: 'Downsample / re-encode JPEG images (lossy)', type: 'checkbox', def: false },
      { id: 'maxpx', label: 'Longest image side (px)', type: 'number', def: 1600 },
      { id: 'quality', label: 'JPEG quality (10-95)', type: 'number', def: 70 },
    ],
    run: async (_i, o, files) => {
      const f = one(files);
      return wrapErr(f, async (b) => {
        const r = await compressPdf(b, { recompress: o.recompress, images: o.images, maxpx: Math.max(32, +o.maxpx || 1600), quality: Math.min(0.95, Math.max(0.1, (+o.quality || 70) / 100)) });
        const s = r.stat, size = r.bytes.length;
        let note = '';
        if (size >= b.length) note = '\nThe result is not smaller than the original (it is already well compressed). Keep the original, or enable the lossy image option.';
        return {
          blob: pdfBlob(r.bytes), filename: `${stem(f)}-compressed.pdf`,
          text: `${fmtSize(b.length)} -> ${fmtSize(size)} (${size < b.length ? '-' + pct(b.length, size) : 'no gain'})\nObjects kept ${r.kept} of ${r.total}; streams deflated ${s.deflated}, recompressed ${s.recompressed}; JPEG images re-encoded ${s.images}` +
            `${s.imagesSkipped ? ` (${s.imagesSkipped} left alone: CMYK, masked or not smaller)` : ''}.${note}${notesTxt(r.notes)}`,
        };
      });
    },
  },
  {
    id: 'pdf-password-protect', cat: 'PDF', title: 'Password Protect PDF', inputs: 0, dom: true,
    desc: 'Encrypt a PDF with the standard security handler: AES-256, AES-128 or RC4-128, with a password to open it and permission flags (print, copy, edit). Encrypted in your browser.',
    file: FILE,
    opts: [
      { id: 'user', label: 'Password to open (leave empty to only restrict)', type: 'text', def: '' },
      { id: 'owner', label: 'Owner password (blank = random)', type: 'text', def: '' },
      { id: 'method', label: 'Encryption', type: 'select', choices: ['AES-256', 'AES-128', 'RC4-128'], def: 'AES-256' },
      { id: 'print', label: 'Allow printing', type: 'checkbox', def: true },
      { id: 'copy', label: 'Allow copying text', type: 'checkbox', def: true },
      { id: 'modify', label: 'Allow editing and page changes', type: 'checkbox', def: false },
      { id: 'annotate', label: 'Allow annotations and form filling', type: 'checkbox', def: true },
    ],
    run: async (_i, o, files) => {
      const f = one(files);
      return wrapErr(f, async (b) => {
        const r = await protectPdf(b, o);
        return { blob: pdfBlob(r.bytes), filename: `${stem(f)}-protected.pdf`, text: `${o.method} encrypted, ${fmtSize(r.bytes.length)}.\n${o.user ? 'A password is required to open the file.' : 'No open password: anyone can open it, the permission flags are advisory.'}\nKeep the password: it cannot be recovered.${notesTxt(r.notes)}` };
      });
    },
  },
  {
    id: 'pdf-password-remove', cat: 'PDF', title: 'Remove PDF Password (Unlock)', inputs: 0, dom: true,
    desc: 'Remove the password and restrictions from a PDF you can open, by giving its user or owner password. Handles RC4-40/128, AES-128 and AES-256. Nothing is uploaded.',
    file: FILE,
    opts: [{ id: 'password', label: 'Password (user or owner; blank if it opens without one)', type: 'text', def: '' }],
    run: async (_i, o, files) => {
      const f = one(files);
      return wrapErr(f, async (b) => {
        const r = await unlockPdf(b, o.password || '');
        return { blob: pdfBlob(r.bytes), filename: `${stem(f)}-unlocked.pdf`, text: `Unlocked with the ${r.owner ? 'owner' : 'user'} password, ${fmtSize(r.bytes.length)}. Encryption and permission flags are gone.${notesTxt(r.notes)}` };
      });
    },
  },
  {
    id: 'pdf-annotate', cat: 'PDF', title: 'Annotate PDF (Text, Highlight, Shapes, Drawing)', dom: true,
    desc: 'Add text, highlight boxes, rectangles, lines and freehand strokes to a PDF. One line per annotation, positions in points from the top-left of the page. Real annotations or burned into the page.',
    file: FILE, inputs: 1, labels: ['Annotations (one per line)'],
    placeholder: ['1 text 72 80 14 red Reviewed\nall highlight 72 120 200 16 yellow\n2 rect 60 200 220 90 blue 2\n1 line 72 300 300 300 black 1.5\n1 draw red 2 100,400 130,380 160,420 190,390'],
    sample: '1 text 72 80 14 red Reviewed\n1 highlight 72 100 200 16 yellow\n1 rect 60 140 220 90 blue 2\n1 line 72 260 300 260 black 1.5\n1 draw red 2 100,300 130,280 160,320 190,290',
    opts: [{ id: 'burn', label: 'Burn into the page (cannot be edited or removed later)', type: 'checkbox', def: false }],
    run: async (i, o, files) => {
      const f = one(files);
      return wrapErr(f, async (b) => {
        const r = await annotatePdf(b, i[0], { burn: o.burn });
        return { blob: pdfBlob(r.bytes), filename: `${stem(f)}-annotated.pdf`, text: `${r.count} annotation${r.count === 1 ? '' : 's'} on ${r.pagesTouched} page${r.pagesTouched === 1 ? '' : 's'}${o.burn ? ', burned into the page content' : ', stored as real PDF annotations'}. ${fmtSize(r.bytes.length)}${notesTxt(r.notes)}` };
      });
    },
  },
  {
    id: 'pdf-form-filler', cat: 'PDF', title: 'Fill PDF Form Fields', dom: true,
    desc: 'Fill AcroForm text fields, checkboxes, radio buttons and drop-downs in a PDF, optionally flatten the form so the values become fixed page content. Run without values to list the fields.',
    file: FILE, inputs: 1, labels: ['Values, one "field name = value" per line (empty: list the fields)'],
    placeholder: ['Name = Ada Lovelace\nSubscribe = yes\nComments = first line\\nsecond line'],
    sample: '',
    opts: [{ id: 'flatten', label: 'Flatten (fixed text, remove the form)', type: 'checkbox', def: false }],
    run: async (i, o, files) => {
      const f = one(files);
      return wrapErr(f, async (b) => {
        const r = await fillForm(b, i[0] || '', { flatten: o.flatten });
        const warn = r.warn?.length ? '\n\nWarnings:\n- ' + r.warn.join('\n- ') : '';
        if (!r.bytes) return { text: `Fields found in ${f.name}:\n\n${r.listing}\n\nWrite "field name = value" lines above and run again.${warn}` };
        return { blob: pdfBlob(r.bytes), filename: `${stem(f)}-filled.pdf`, text: `Filled ${r.done.length} field${r.done.length === 1 ? '' : 's'}${o.flatten ? `; flattened ${r.flat} widget${r.flat === 1 ? '' : 's'}` : ''}. ${fmtSize(r.bytes.length)}${warn}${notesTxt(r.notes)}` };
      });
    },
  },
  {
    id: 'docx-to-pdf', cat: 'PDF', title: 'DOCX to PDF (Text Only)', inputs: 0, dom: true,
    desc: 'Turn the text of a Word .docx into a simple paginated PDF: headings, paragraphs, bullets and table rows in Helvetica. No images, fonts, columns or exact Word layout.',
    file: { accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    opts: [
      { id: 'paper', label: 'Paper', type: 'select', choices: ['A4', 'Letter'], def: 'A4' },
      { id: 'size', label: 'Body font size (pt)', type: 'number', def: 11 },
      { id: 'margin', label: 'Margin (mm)', type: 'number', def: 20 },
    ],
    run: async (_i, o, files) => {
      const f = one(files);
      return wrapErr(f, async (b) => {
        const r = await docxToPdf(b, { paper: o.paper, size: o.size, margin: +o.margin, name: stem(f) });
        return { blob: pdfBlob(r.bytes), filename: `${stem(f)}.pdf`, text: `${r.pages} page${r.pages === 1 ? '' : 's'} from ${r.blocks} blocks, ${fmtSize(r.bytes.length)}. Text, headings, bullets and table rows only; images, fonts, numbering, headers/footers and Word's own layout are not reproduced.` };
      });
    },
  },
];

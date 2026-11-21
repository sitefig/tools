// crypto2.js: "Crypto+" tools. Hand-written, zero dependencies, client-side only (platform crypto.subtle for SHA-1/2, AES, digests).
// Built: BLAKE2b/2s, BLAKE3, Argon2d/i/id (+PHC verify), scrypt, HKDF, bech32/bech32m, EIP-55/191/712, Solidity storage slots,
// ENS namehash, CREATE/CREATE2, RLP, OpenPGP armor inspector, SSH key fingerprints, Shamir (GF256), CRC16/32/64, xxHash, MurmurHash3,
// FNV-1a, SipHash-2-4, Luhn/Verhoeff/Damm, ChaCha20-Poly1305, AES demo, XOR/one-time pad, Vigenere/Autokey/Playfair.
// Skipped on purpose: BIP39 (the 2048-word English list is not available offline and must not be typed from memory),
// ENSIP-15 full name normalisation (only lowercase + NFC here), Argon2 memory above 64 MiB.
// Ceilings: big-input hashing is not streamed; CRC/xxh64/siphash use BigInt (fine for KBs, slow for many MBs).
const T = [];
const CAT = 'Crypto+';
const enc = new TextEncoder(), dec = new TextDecoder();
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => {
  s = String(s).trim().replace(/^0x/i, '').replace(/[\s:,]|0x/gi, '');
  if (!/^[0-9a-f]*$/i.test(s) || s.length % 2) throw new Error('Invalid hex (need an even number of hex digits)');
  return Uint8Array.from(s.match(/../g) || [], (h) => parseInt(h, 16));
};
const cat = (...a) => { const r = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { r.set(x, o); o += x.length; } return r; };
const b64e = (u, url) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  s = btoa(s);
  return url ? s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : s;
};
const b64d = (s) => {
  s = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (/[^A-Za-z0-9+/]/.test(s) || s.length % 4 === 1) throw new Error('Invalid Base64 input');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const sel = (id, label, def, choices) => ({ id, label, type: 'select', def, choices });
const num = (id, label, def) => ({ id, label, type: 'number', def });
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const chk = (id, label, def) => ({ id, label, type: 'checkbox', def });
const lines = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const parseJ = (s) => { try { return JSON.parse(s); } catch (e) { throw new Error('Invalid JSON: ' + e.message); } };
const dig = async (a, u) => new Uint8Array(await crypto.subtle.digest(a, u));
const tick = () => new Promise((r) => setTimeout(r));
const ival = (v, name, lo, hi) => { v = Number(v); if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${name} must be an integer ${lo}..${hi}`); return v; };
// bytes from text/hex/base64 according to a format choice
const toBytes = (s, f) => (f === 'hex' ? unhex(s) : f === 'base64' ? b64d(s) : enc.encode(s));
const FMT = ['text', 'hex', 'base64'];
const be = (n, len) => { const r = new Uint8Array(len); let x = BigInt(n); for (let i = len - 1; i >= 0; i--) { r[i] = Number(x & 255n); x >>= 8n; } return r; };
const toBig = (u) => (u.length ? BigInt('0x' + hex(u)) : 0n);

// ---------------- BLAKE2b (64-bit words kept as lo/hi uint32 pairs) and BLAKE2s
const B2B_IV = [0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85, 0xfe94f82b, 0x3c6ef372, 0x5f1d36f1, 0xa54ff53a, 0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c, 0xfb41bd6b, 0x1f83d9ab, 0x137e2179, 0x5be0cd19];
const SIGMA = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3], [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4], [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8], [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13], [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9], [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11], [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10], [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5], [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0]];
const P32 = 4294967296;
// rotate the 64-bit word at v[i],v[i+1] right by n (1..63)
function rotr64(v, i, n) {
  let lo = v[i], hi = v[i + 1];
  if (n === 32) { v[i] = hi; v[i + 1] = lo; return; }
  if (n > 32) { const t = lo; lo = hi; hi = t; n -= 32; }
  v[i] = (lo >>> n) | (hi << (32 - n)); v[i + 1] = (hi >>> n) | (lo << (32 - n));
}
function g64(v, a, b, c, d, m, x, y) {
  a *= 2; b *= 2; c *= 2; d *= 2; x *= 2; y *= 2;
  let l = v[a] + v[b] + m[x]; v[a + 1] += v[b + 1] + m[x + 1] + Math.floor(l / P32); v[a] = l;
  v[d] ^= v[a]; v[d + 1] ^= v[a + 1]; rotr64(v, d, 32);
  l = v[c] + v[d]; v[c + 1] += v[d + 1] + Math.floor(l / P32); v[c] = l;
  v[b] ^= v[c]; v[b + 1] ^= v[c + 1]; rotr64(v, b, 24);
  l = v[a] + v[b] + m[y]; v[a + 1] += v[b + 1] + m[y + 1] + Math.floor(l / P32); v[a] = l;
  v[d] ^= v[a]; v[d + 1] ^= v[a + 1]; rotr64(v, d, 16);
  l = v[c] + v[d]; v[c + 1] += v[d + 1] + Math.floor(l / P32); v[c] = l;
  v[b] ^= v[c]; v[b + 1] ^= v[c + 1]; rotr64(v, b, 63);
}
function b2bCompress(h, blk, t, last) {
  const m = new Uint32Array(32), dv = new DataView(blk.buffer, blk.byteOffset, 128);
  for (let i = 0; i < 32; i++) m[i] = dv.getUint32(i * 4, true);
  const v = new Uint32Array(32); v.set(h); v.set(B2B_IV, 16);
  v[24] ^= t % P32; v[25] ^= Math.floor(t / P32);
  if (last) { v[28] = ~v[28]; v[29] = ~v[29]; }
  for (let r = 0; r < 12; r++) {
    const s = SIGMA[r % 10];
    g64(v, 0, 4, 8, 12, m, s[0], s[1]); g64(v, 1, 5, 9, 13, m, s[2], s[3]); g64(v, 2, 6, 10, 14, m, s[4], s[5]); g64(v, 3, 7, 11, 15, m, s[6], s[7]);
    g64(v, 0, 5, 10, 15, m, s[8], s[9]); g64(v, 1, 6, 11, 12, m, s[10], s[11]); g64(v, 2, 7, 8, 13, m, s[12], s[13]); g64(v, 3, 4, 9, 14, m, s[14], s[15]);
  }
  for (let i = 0; i < 32; i++) h[i] ^= v[i] ^ v[i + 16];
}
function blake2b(msg, nn = 64, key = new Uint8Array(0)) {
  if (nn < 1 || nn > 64) throw new Error('BLAKE2b digest length must be 1..64 bytes');
  if (key.length > 64) throw new Error('BLAKE2b key must be at most 64 bytes');
  const h = Uint32Array.from(B2B_IV); h[0] ^= 0x01010000 ^ (key.length << 8) ^ nn;
  let data = msg;
  if (key.length) { const kb = new Uint8Array(128); kb.set(key); data = cat(kb, msg); }
  const n = data.length, buf = new Uint8Array(128);
  if (n === 0) b2bCompress(h, buf, 0, true);
  else for (let off = 0; off < n; off += 128) {
    const end = Math.min(off + 128, n); buf.fill(0); buf.set(data.subarray(off, end));
    b2bCompress(h, buf, end, end === n);
  }
  return new Uint8Array(h.buffer.slice(0, 64)).subarray(0, nn);
}
const S_IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const r32 = (x, n) => (x >>> n) | (x << (32 - n));
function g32(v, a, b, c, d, x, y) {
  v[a] = v[a] + v[b] + x; v[d] = r32(v[d] ^ v[a], 16); v[c] = v[c] + v[d]; v[b] = r32(v[b] ^ v[c], 12);
  v[a] = v[a] + v[b] + y; v[d] = r32(v[d] ^ v[a], 8); v[c] = v[c] + v[d]; v[b] = r32(v[b] ^ v[c], 7);
}
function blake2s(msg, nn = 32, key = new Uint8Array(0)) {
  if (nn < 1 || nn > 32) throw new Error('BLAKE2s digest length must be 1..32 bytes');
  if (key.length > 32) throw new Error('BLAKE2s key must be at most 32 bytes');
  const h = Uint32Array.from(S_IV); h[0] ^= 0x01010000 ^ (key.length << 8) ^ nn;
  let data = msg;
  if (key.length) { const kb = new Uint8Array(64); kb.set(key); data = cat(kb, msg); }
  const n = data.length, buf = new Uint8Array(64), m = new Uint32Array(16), v = new Uint32Array(16);
  const comp = (t, last) => {
    const dv = new DataView(buf.buffer); for (let i = 0; i < 16; i++) m[i] = dv.getUint32(i * 4, true);
    v.set(h); v.set(S_IV, 8); v[12] ^= t % P32; v[13] ^= Math.floor(t / P32); if (last) v[14] = ~v[14];
    for (let r = 0; r < 10; r++) {
      const s = SIGMA[r];
      g32(v, 0, 4, 8, 12, m[s[0]], m[s[1]]); g32(v, 1, 5, 9, 13, m[s[2]], m[s[3]]); g32(v, 2, 6, 10, 14, m[s[4]], m[s[5]]); g32(v, 3, 7, 11, 15, m[s[6]], m[s[7]]);
      g32(v, 0, 5, 10, 15, m[s[8]], m[s[9]]); g32(v, 1, 6, 11, 12, m[s[10]], m[s[11]]); g32(v, 2, 7, 8, 13, m[s[12]], m[s[13]]); g32(v, 3, 4, 9, 14, m[s[14]], m[s[15]]);
    }
    for (let i = 0; i < 8; i++) h[i] ^= v[i] ^ v[i + 8];
  };
  if (n === 0) comp(0, true);
  else for (let off = 0; off < n; off += 64) { const end = Math.min(off + 64, n); buf.fill(0); buf.set(data.subarray(off, end)); comp(end, end === n); }
  return new Uint8Array(h.buffer.slice(0, 32)).subarray(0, nn);
}
T.push({
  id: 'blake2-hash', cat: CAT, title: 'BLAKE2b / BLAKE2s Hash', desc: 'Hand-written BLAKE2b (1-64 byte digest) and BLAKE2s (1-32) with optional MAC key, per RFC 7693. Input as text, hex or base64.',
  labels: ['Message'], sample: 'abc',
  opts: [sel('algo', 'Algorithm', 'blake2b', ['blake2b', 'blake2s']), num('len', 'Digest length (bytes)', 64), sel('fmt', 'Input is', 'text', FMT), txt('key', 'Key (hex, optional, MAC mode)', '')],
  run: ([s], o) => {
    const key = o.key.trim() ? unhex(o.key) : new Uint8Array(0), max = o.algo === 'blake2s' ? 32 : 64;
    const len = ival(o.len, 'Digest length', 1, max);
    return hex((o.algo === 'blake2s' ? blake2s : blake2b)(toBytes(s, o.fmt), len, key));
  },
});

// ---------------- BLAKE3 (hash, keyed hash, derive_key, XOF)
const B3 = { START: 1, END: 2, PARENT: 4, ROOT: 8, KEYED: 16, DKC: 32, DKM: 64 };
const B3P = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];
function b3compress(cv, bw, ctr, blen, flags) {
  const v = new Uint32Array(16); v.set(cv); v.set(S_IV.slice(0, 4), 8);
  v[12] = ctr % P32; v[13] = Math.floor(ctr / P32); v[14] = blen; v[15] = flags;
  let m = bw;
  for (let r = 0; r < 7; r++) {
    g32(v, 0, 4, 8, 12, m[0], m[1]); g32(v, 1, 5, 9, 13, m[2], m[3]); g32(v, 2, 6, 10, 14, m[4], m[5]); g32(v, 3, 7, 11, 15, m[6], m[7]);
    g32(v, 0, 5, 10, 15, m[8], m[9]); g32(v, 1, 6, 11, 12, m[10], m[11]); g32(v, 2, 7, 8, 13, m[12], m[13]); g32(v, 3, 4, 9, 14, m[14], m[15]);
    if (r < 6) m = B3P.map((i) => m[i]);
  }
  for (let i = 0; i < 8; i++) { v[i] ^= v[i + 8]; v[i + 8] ^= cv[i]; }
  return v;
}
function b3words(u) { const b = new Uint8Array(64); b.set(u); const dv = new DataView(b.buffer); return Uint32Array.from({ length: 16 }, (_, i) => dv.getUint32(i * 4, true)); }
function b3hash(input, key, base, outLen) {
  const nch = Math.max(1, Math.ceil(input.length / 1024));
  const chunk = (ci) => {
    const c = input.subarray(ci * 1024, ci * 1024 + 1024), nb = Math.max(1, Math.ceil(c.length / 64));
    let cv = Uint32Array.from(key);
    for (let b = 0; b < nb; b++) {
      const blk = c.subarray(b * 64, b * 64 + 64), fl = base | (b === 0 ? B3.START : 0) | (b === nb - 1 ? B3.END : 0), bw = b3words(blk);
      if (b === nb - 1) return { cv, bw, ctr: ci, blen: blk.length, fl };
      cv = b3compress(cv, bw, ci, 64, fl).slice(0, 8);
    }
  };
  const node = (lo, n) => {
    if (n === 1) return chunk(lo);
    const left = 1 << (31 - Math.clz32(n - 1));
    const cvOf = (o) => b3compress(o.cv, o.bw, o.ctr, o.blen, o.fl).slice(0, 8);
    const l = cvOf(node(lo, left)), r = cvOf(node(lo + left, n - left));
    return { cv: Uint32Array.from(key), bw: Uint32Array.from([...l, ...r]), ctr: 0, blen: 64, fl: base | B3.PARENT };
  };
  const root = node(0, nch), out = new Uint8Array(Math.ceil(outLen / 64) * 64), dv = new DataView(out.buffer);
  for (let i = 0; i * 64 < outLen; i++) { const w = b3compress(root.cv, root.bw, i, root.blen, root.fl | B3.ROOT); for (let j = 0; j < 16; j++) dv.setUint32(i * 64 + j * 4, w[j], true); }
  return out.subarray(0, outLen);
}
function blake3(msg, mode, outLen, keyBytes, context) {
  if (mode === 'keyed_hash') {
    if (keyBytes.length !== 32) throw new Error('keyed_hash needs a 32-byte key (64 hex characters)');
    const dv = new DataView(keyBytes.buffer, keyBytes.byteOffset, 32);
    return b3hash(msg, Uint32Array.from({ length: 8 }, (_, i) => dv.getUint32(i * 4, true)), B3.KEYED, outLen);
  }
  if (mode === 'derive_key') {
    const c = b3hash(enc.encode(context), Uint32Array.from(S_IV), B3.DKC, 32), dv = new DataView(c.buffer, c.byteOffset, 32);
    return b3hash(msg, Uint32Array.from({ length: 8 }, (_, i) => dv.getUint32(i * 4, true)), B3.DKM, outLen);
  }
  return b3hash(msg, Uint32Array.from(S_IV), 0, outLen);
}
T.push({
  id: 'blake3-hash', cat: CAT, title: 'BLAKE3 Hash / Keyed / Derive Key', desc: 'Hand-written BLAKE3 with the three official modes: hash, keyed_hash (32-byte key) and derive_key (context string), plus extendable output of any length.',
  labels: ['Message / key material'], sample: 'hello world',
  opts: [sel('mode', 'Mode', 'hash', ['hash', 'keyed_hash', 'derive_key']), num('len', 'Output length (bytes)', 32), sel('fmt', 'Input is', 'text', FMT), txt('key', 'Key (64 hex chars, keyed_hash)', ''), txt('ctx', 'Context string (derive_key)', 'my app 2024 session keys')],
  run: ([s], o) => hex(blake3(toBytes(s, o.fmt), o.mode, ival(o.len, 'Output length', 1, 1 << 20), o.key.trim() ? unhex(o.key) : new Uint8Array(0), o.ctx)),
});

// ---------------- HMAC (on crypto.subtle digests, so empty keys work), HKDF, scrypt
const HALG = { 'SHA-1': 20, 'SHA-256': 32, 'SHA-384': 48, 'SHA-512': 64 };
async function hmac(alg, key, msg) {
  const bs = alg === 'SHA-384' || alg === 'SHA-512' ? 128 : 64;
  if (key.length > bs) key = await dig(alg, key);
  const k = new Uint8Array(bs); k.set(key);
  return dig(alg, cat(k.map((x) => x ^ 0x5c), await dig(alg, cat(k.map((x) => x ^ 0x36), msg))));
}
async function hkdf(alg, ikm, salt, info, len) {
  const hl = HALG[alg];
  if (len < 1 || len > 255 * hl) throw new Error(`Output length must be 1..${255 * hl} bytes for ${alg}`);
  const prk = await hmac(alg, salt.length ? salt : new Uint8Array(hl), ikm), out = new Uint8Array(Math.ceil(len / hl) * hl);
  let t = new Uint8Array(0);
  for (let i = 1; i * hl <= out.length; i++) { t = await hmac(alg, prk, cat(t, info, Uint8Array.of(i))); out.set(t, (i - 1) * hl); }
  return out.subarray(0, len);
}
T.push({
  id: 'hkdf-derive', cat: CAT, title: 'HKDF Key Derivation (RFC 5869)', desc: 'HKDF extract-and-expand with SHA-1/256/384/512 from input key material, salt and info.',
  inputs: 1, labels: ['Input key material'], sample: '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b',
  opts: [sel('ikmf', 'IKM is', 'hex', FMT), sel('hash', 'Hash', 'SHA-256', Object.keys(HALG)), txt('salt', 'Salt (hex, optional)', '000102030405060708090a0b0c'), txt('info', 'Info (hex, optional)', 'f0f1f2f3f4f5f6f7f8f9'), num('len', 'Output length (bytes)', 42)],
  run: async ([s], o) => hex(await hkdf(o.hash, toBytes(s, o.ikmf), o.salt.trim() ? unhex(o.salt) : new Uint8Array(0), o.info.trim() ? unhex(o.info) : new Uint8Array(0), ival(o.len, 'Output length', 1, 255 * 64))),
});

async function pbkdf2c1(pw, salt, len) { // PBKDF2-HMAC-SHA256 with c=1 (what scrypt needs)
  const out = new Uint8Array(Math.ceil(len / 32) * 32);
  for (let i = 1; i * 32 <= out.length; i++) out.set(await hmac('SHA-256', pw, cat(salt, be(i, 4))), (i - 1) * 32);
  return out.subarray(0, len);
}
function salsa8(B) {
  const x = Uint32Array.from(B), R = (v, n) => (v << n) | (v >>> (32 - n));
  const qr = (a, b, c, d) => { x[b] ^= R(x[a] + x[d], 7); x[c] ^= R(x[b] + x[a], 9); x[d] ^= R(x[c] + x[b], 13); x[a] ^= R(x[d] + x[c], 18); };
  for (let i = 0; i < 4; i++) {
    qr(0, 4, 8, 12); qr(5, 9, 13, 1); qr(10, 14, 2, 6); qr(15, 3, 7, 11);
    qr(0, 1, 2, 3); qr(5, 6, 7, 4); qr(10, 11, 8, 9); qr(15, 12, 13, 14);
  }
  for (let i = 0; i < 16; i++) B[i] += x[i];
}
function blockMix(B, Y, r) {
  const X = B.slice(16 * (2 * r - 1), 16 * 2 * r);
  for (let i = 0; i < 2 * r; i++) {
    for (let k = 0; k < 16; k++) X[k] ^= B[i * 16 + k];
    salsa8(X);
    Y.set(X, (i % 2 ? r + (i - 1) / 2 : i / 2) * 16);
  }
  B.set(Y);
}
async function scrypt(pw, salt, N, r, p, dkLen) {
  if (N < 2 || (N & (N - 1)) || N > 2 ** 24) throw new Error('N must be a power of two >= 2');
  r = ival(r, 'r', 1, 64); p = ival(p, 'p', 1, 64);
  if (128 * r * N > 64 * 1048576) throw new Error('Memory cost 128*N*r exceeds the 64 MiB cap; lower N or r');
  const B = await pbkdf2c1(pw, salt, p * 128 * r), w = 32 * r, V = new Uint32Array(N * w), Y = new Uint32Array(w);
  let work = 0;
  for (let b = 0; b < p; b++) {
    const dv = new DataView(B.buffer, B.byteOffset + b * 128 * r, 128 * r), X = Uint32Array.from({ length: w }, (_, i) => dv.getUint32(i * 4, true));
    for (let i = 0; i < N; i++) { V.set(X, i * w); blockMix(X, Y, r); if (++work % 2048 === 0) await tick(); }
    for (let i = 0; i < N; i++) {
      const j = X[(2 * r - 1) * 16] & (N - 1);
      for (let k = 0; k < w; k++) X[k] ^= V[j * w + k];
      blockMix(X, Y, r); if (++work % 2048 === 0) await tick();
    }
    for (let i = 0; i < w; i++) dv.setUint32(i * 4, X[i], true);
  }
  return pbkdf2c1(pw, B, dkLen);
}
T.push({
  id: 'scrypt-kdf', cat: CAT, title: 'scrypt Key Derivation', desc: 'Hand-written scrypt (RFC 7914) on PBKDF2-HMAC-SHA256 and Salsa20/8. Memory 128*N*r capped at 64 MiB; yields to the UI while working.',
  labels: ['Password'], sample: 'password',
  opts: [txt('salt', 'Salt (text)', 'NaCl'), num('N', 'N (power of 2)', 1024), num('r', 'r', 8), num('p', 'p', 16), num('len', 'Output length (bytes)', 64)],
  run: async ([s], o) => hex(await scrypt(enc.encode(s), enc.encode(o.salt), ival(o.N, 'N', 2, 2 ** 24), o.r, o.p, ival(o.len, 'Output length', 1, 1024))),
});

// ---------------- Argon2 (RFC 9106), 64-bit math as lo/hi uint32 pairs
let mlo = 0, mhi = 0;
function mul32(a, b) { // full 32x32 -> 64 into mlo/mhi
  const a0 = a & 65535, a1 = a >>> 16, b0 = b & 65535, b1 = b >>> 16, p00 = a0 * b0, mid = a0 * b1 + a1 * b0 + (p00 >>> 16);
  mlo = (mid % 65536) * 65536 + (p00 & 65535); mhi = a1 * b1 + Math.floor(mid / 65536);
}
function fb(R, a, b) { // R[a] = R[a] + R[b] + 2 * lo32(R[a]) * lo32(R[b])
  mul32(R[a], R[b]);
  const L = R[a] + R[b] + ((mlo << 1) >>> 0);
  R[a + 1] += R[b + 1] + mhi * 2 + (mlo >>> 31) + Math.floor(L / P32); R[a] = L;
}
function bg(R, a, b, c, d) {
  fb(R, a, b); R[d] ^= R[a]; R[d + 1] ^= R[a + 1]; rotr64(R, d, 32);
  fb(R, c, d); R[b] ^= R[c]; R[b + 1] ^= R[c + 1]; rotr64(R, b, 24);
  fb(R, a, b); R[d] ^= R[a]; R[d + 1] ^= R[a + 1]; rotr64(R, d, 16);
  fb(R, c, d); R[b] ^= R[c]; R[b + 1] ^= R[c + 1]; rotr64(R, b, 63);
}
const PIDX = Array.from({ length: 16 }, () => new Array(16));
for (let i = 0; i < 8; i++) for (let k = 0; k < 16; k++) { PIDX[i][k] = 32 * i + 2 * k; PIDX[8 + i][k] = 2 * (2 * i + 16 * (k >> 1) + (k & 1)); }
function permute(R) {
  for (const P of PIDX) {
    bg(R, P[0], P[4], P[8], P[12]); bg(R, P[1], P[5], P[9], P[13]); bg(R, P[2], P[6], P[10], P[14]); bg(R, P[3], P[7], P[11], P[15]);
    bg(R, P[0], P[5], P[10], P[15]); bg(R, P[1], P[6], P[11], P[12]); bg(R, P[2], P[7], P[8], P[13]); bg(R, P[3], P[4], P[9], P[14]);
  }
}
const aR = new Uint32Array(256), aT = new Uint32Array(256);
function fillBlock(prev, po, ref, ro, out, oo, xor) {
  for (let k = 0; k < 256; k++) aT[k] = aR[k] = ref[ro + k] ^ prev[po + k];
  if (xor) for (let k = 0; k < 256; k++) aT[k] ^= out[oo + k];
  permute(aR);
  for (let k = 0; k < 256; k++) out[oo + k] = aT[k] ^ aR[k];
}
const mulhi = (a, b) => { mul32(a, b); return mhi; };
const le32 = (n) => be(n, 4).reverse();
function hPrime(len, A) {
  const inp = cat(le32(len), A);
  if (len <= 64) return blake2b(inp, len);
  const r = Math.ceil(len / 32) - 2, out = new Uint8Array(len);
  let V = blake2b(inp, 64); out.set(V.subarray(0, 32), 0);
  for (let i = 2; i <= r; i++) { V = blake2b(V, 64); out.set(V.subarray(0, 32), (i - 1) * 32); }
  out.set(blake2b(V, len - 32 * r), 32 * r);
  return out;
}
const A2T = { argon2d: 0, argon2i: 1, argon2id: 2 };
async function argon2(type, pw, salt, secret, ad, t, mKiB, p, tagLen) {
  if (!(type in A2T)) throw new Error('Unknown Argon2 variant');
  t = ival(t, 'Iterations', 1, 1000); p = ival(p, 'Parallelism', 1, 255); tagLen = ival(tagLen, 'Tag length', 4, 1024);
  mKiB = ival(mKiB, 'Memory (KiB)', 8, 65536);
  if (mKiB < 8 * p) throw new Error('Memory must be at least 8 * parallelism KiB');
  if (salt.length < 8) throw new Error('Salt must be at least 8 bytes');
  const ty = A2T[type], q4 = Math.floor(mKiB / (4 * p)) * 4, q = q4, seg = q >> 2, mem = new Uint32Array(p * q * 256);
  const H0 = blake2b(cat(le32(p), le32(tagLen), le32(mKiB), le32(t), le32(0x13), le32(ty), le32(pw.length), pw, le32(salt.length), salt, le32(secret.length), secret, le32(ad.length), ad), 64);
  for (let l = 0; l < p; l++) for (let j = 0; j < 2; j++) {
    const b = hPrime(1024, cat(H0, le32(j), le32(l))), dv = new DataView(b.buffer);
    for (let k = 0; k < 256; k++) mem[(l * q + j) * 256 + k] = dv.getUint32(k * 4, true);
  }
  const Z = new Uint32Array(256), IN = new Uint32Array(256), AD = new Uint32Array(256);
  let work = 0;
  for (let pass = 0; pass < t; pass++) for (let slice = 0; slice < 4; slice++) for (let lane = 0; lane < p; lane++) {
    const indep = ty === 1 || (ty === 2 && pass === 0 && slice < 2);
    let start = 0;
    const nextAddr = () => { IN[12]++; fillBlock(Z, 0, IN, 0, AD, 0, false); fillBlock(Z, 0, AD, 0, AD, 0, false); };
    if (indep) { IN.fill(0); IN[0] = pass; IN[2] = lane; IN[4] = slice; IN[6] = p * q; IN[8] = t; IN[10] = ty; }
    if (pass === 0 && slice === 0) { start = 2; if (indep) nextAddr(); }
    for (let i = start; i < seg; i++) {
      const cur = slice * seg + i, curOff = (lane * q + cur) * 256, prev = cur === 0 ? q - 1 : cur - 1, prevOff = (lane * q + prev) * 256;
      let j1, j2;
      if (indep) { if (i % 128 === 0) nextAddr(); j1 = AD[(i % 128) * 2]; j2 = AD[(i % 128) * 2 + 1]; } else { j1 = mem[prevOff]; j2 = mem[prevOff + 1]; }
      const rl = pass === 0 && slice === 0 ? lane : j2 % p, same = rl === lane;
      let area;
      if (pass === 0) area = slice === 0 ? i - 1 : same ? slice * seg + i - 1 : slice * seg + (i === 0 ? -1 : 0);
      else area = same ? q - seg + i - 1 : q - seg + (i === 0 ? -1 : 0);
      const rel = area - 1 - mulhi(area, mulhi(j1, j1)), s0 = pass === 0 ? 0 : slice === 3 ? 0 : (slice + 1) * seg;
      const ri = (s0 + rel) % q;
      fillBlock(mem, prevOff, mem, (rl * q + ri) * 256, mem, curOff, pass > 0);
      if (++work % 1024 === 0) await tick();
    }
  }
  const C = new Uint32Array(256);
  for (let l = 0; l < p; l++) for (let k = 0; k < 256; k++) C[k] ^= mem[(l * q + q - 1) * 256 + k];
  return hPrime(tagLen, new Uint8Array(C.buffer));
}
const b64np = (u) => b64e(u).replace(/=+$/, '');
const A2OPTS = [sel('variant', 'Variant', 'argon2id', Object.keys(A2T)), num('m', 'Memory (KiB, max 65536)', 32), num('t', 'Iterations', 3), num('p', 'Parallelism (lanes)', 4), num('len', 'Tag length (bytes)', 32)];
T.push({
  id: 'argon2-hash', cat: CAT, title: 'Argon2d / Argon2i / Argon2id', desc: 'Hand-written Argon2 (RFC 9106, v1.3) with memory, iterations, parallelism, tag length, secret and associated data. Raw hex or PHC string. Memory capped at 64 MiB; the UI stays responsive.',
  labels: ['Password'], sample: 'correct horse battery staple',
  opts: [...A2OPTS, txt('salt', 'Salt', 'somesaltsomesalt'), sel('saltf', 'Salt is', 'text', FMT), txt('secret', 'Secret / pepper (hex, optional)', ''), txt('ad', 'Associated data (hex, optional)', ''), sel('out', 'Output', 'phc', ['phc', 'hex', 'both'])],
  run: async ([s], o) => {
    const salt = o.salt ? toBytes(o.salt, o.saltf) : crypto.getRandomValues(new Uint8Array(16));
    const tag = await argon2(o.variant, enc.encode(s), salt, o.secret.trim() ? unhex(o.secret) : new Uint8Array(0), o.ad.trim() ? unhex(o.ad) : new Uint8Array(0), o.t, o.m, o.p, o.len);
    const phc = `$${o.variant}$v=19$m=${o.m},t=${o.t},p=${o.p}$${b64np(salt)}$${b64np(tag)}`;
    const note = o.secret.trim() || o.ad.trim() ? '\n(note: PHC strings cannot carry the secret or associated data)' : '';
    return (o.out === 'hex' ? hex(tag) : o.out === 'phc' ? phc : `${hex(tag)}\n${phc}`) + (o.salt ? '' : '\n(random salt used: ' + hex(salt) + ')') + (o.out !== 'hex' ? note : '');
  },
});
T.push({
  id: 'argon2-verify', cat: CAT, title: 'Argon2 PHC Hash Verifier', desc: 'Check a password against a $argon2id$v=19$m=..,t=..,p=..$salt$hash string (Argon2d/i/id, v1.3). Constant-time compare.',
  inputs: 2, labels: ['PHC hash string', 'Password'], sample: '$argon2id$v=19$m=32,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$JHMCdGC4/yRiyVFEwh2n5g0eSeiCudRZZRiPDHTD/S4', sample2: 'correct horse battery staple',
  run: async ([phc, pw]) => {
    const m = /^\$(argon2(?:id|i|d))\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(phc.trim());
    if (!m) throw new Error('Not a PHC Argon2 string: expected $argon2id$v=19$m=..,t=..,p=..$salt$hash');
    if (m[2] !== '19') throw new Error('Only Argon2 version 19 (0x13) is supported');
    const salt = b64d(m[6]), want = b64d(m[7]), got = await argon2(m[1], enc.encode(pw.replace(/\r?\n$/, '')), salt, new Uint8Array(0), new Uint8Array(0), +m[4], +m[3], +m[5], want.length);
    let d = 0; for (let i = 0; i < want.length; i++) d |= want[i] ^ got[i];
    return (d ? 'NO MATCH' : 'MATCH') + `\nvariant ${m[1]}, m=${m[3]} KiB, t=${m[4]}, p=${m[5]}, salt ${salt.length} B, tag ${want.length} B`;
  },
});

// ---------------- Keccak-256 (copied from devx.js) for the Ethereum tools
const MASK = (1n << 64n) - 1n, rotl = (x, n) => n ? ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK : x;
const rcbit = (t) => { let R = 1; for (let i = 0; i < t % 255; i++) { R <<= 1; if (R & 0x100) R ^= 0x171; } return R & 1; };
const RC = Array.from({ length: 24 }, (_, ir) => { let c = 0n; for (let j = 0; j < 7; j++) if (rcbit(j + 7 * ir)) c |= 1n << BigInt((1 << j) - 1); return c; });
const ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]];
function keccakF(A) {
  for (let rnd = 0; rnd < 24; rnd++) {
    const C = [0, 1, 2, 3, 4].map((x) => A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20]);
    for (let x = 0; x < 5; x++) { const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1); for (let y = 0; y < 25; y += 5) A[x + y] ^= D; }
    const B = new Array(25).fill(0n);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], ROT[x][y]);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x + 5 * y] = B[x + 5 * y] ^ (~B[(x + 1) % 5 + 5 * y] & MASK & B[(x + 2) % 5 + 5 * y]);
    A[0] ^= RC[rnd];
  }
}
function sponge(msg, rate, pad, outLen) {
  const A = new Array(25).fill(0n), m = cat(msg, new Uint8Array(rate - (msg.length % rate)));
  m[msg.length] ^= pad; m[m.length - 1] ^= 0x80;
  for (let o = 0; o < m.length; o += rate) {
    for (let i = 0; i < rate / 8; i++) { let w = 0n; for (let b = 7; b >= 0; b--) w = (w << 8n) | BigInt(m[o + i * 8 + b]); A[i] ^= w; }
    keccakF(A);
  }
  const out = new Uint8Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = Number((A[i >> 3] >> BigInt(8 * (i & 7))) & 0xffn);
  return out;
}
const keccak256 = (u) => sponge(u, 136, 0x01, 32);
const kh = (...a) => keccak256(cat(...a));
const hx0 = (u) => '0x' + hex(u);

// ---------------- bech32 / bech32m (BIP173 / BIP350)
const BCS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', BGEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
function bpoly(v) { let c = 1; for (const x of v) { const t = c >>> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((t >> i) & 1) c ^= BGEN[i]; } return c >>> 0; }
const bexp = (h) => [...[...h].map((c) => c.charCodeAt(0) >> 5), 0, ...[...h].map((c) => c.charCodeAt(0) & 31)];
const BK = { bech32: 1, bech32m: 0x2bc830a3 };
const bmake = (hrp, d5, spec) => { const p = bpoly([...bexp(hrp), ...d5, 0, 0, 0, 0, 0, 0]) ^ BK[spec]; return hrp + '1' + [...d5, ...Array.from({ length: 6 }, (_, i) => (p >>> (5 * (5 - i))) & 31)].map((x) => BCS[x]).join(''); };
function conv(data, from, to, pad) {
  let acc = 0, bits = 0; const out = [], max = (1 << to) - 1;
  for (const v of data) { if (v < 0 || v >> from) throw new Error('Value out of range for bit conversion'); acc = (acc << from) | v; bits += from; while (bits >= to) { bits -= to; out.push((acc >> bits) & max); } acc &= (1 << bits) - 1; }
  if (pad) { if (bits) out.push((acc << (to - bits)) & max); } else if (bits >= from || (acc << (to - bits)) & max) throw new Error('Invalid padding in data part');
  return out;
}
function bdecode(s, nolimit) {
  s = s.trim();
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) throw new Error('Mixed case is not allowed');
  s = s.toLowerCase();
  if (!nolimit && s.length > 90) throw new Error('Longer than 90 characters (tick "no length limit" for e.g. Lightning invoices)');
  const i = s.lastIndexOf('1');
  if (i < 1) throw new Error('Missing separator "1" or empty human-readable part');
  if (s.length - i - 1 < 6) throw new Error('Data part too short (needs a 6-character checksum)');
  const hrp = s.slice(0, i);
  if ([...hrp].some((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126)) throw new Error('Invalid character in human-readable part');
  const d = [...s.slice(i + 1)].map((c) => { const k = BCS.indexOf(c); if (k < 0) throw new Error(`Invalid data character "${c}"`); return k; });
  const pm = bpoly([...bexp(hrp), ...d]), spec = pm === 1 ? 'bech32' : pm === 0x2bc830a3 ? 'bech32m' : null;
  return { hrp, data: d.slice(0, -6), spec };
}
T.push({
  id: 'bech32-codec', cat: CAT, title: 'Bech32 / Bech32m Encoder & Decoder', desc: 'Decode and validate bech32 (BIP173) / bech32m (BIP350) strings including SegWit/Taproot addresses, or encode hex bytes or a witness program.',
  labels: ['Bech32 string (decode) or hex bytes / witness program (encode)'], sample: 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
  opts: [sel('mode', 'Mode', 'decode', ['decode', 'encode bytes', 'encode segwit']), txt('hrp', 'HRP (encode)', 'bc'), sel('spec', 'Checksum (encode bytes)', 'bech32', ['bech32', 'bech32m']), num('wv', 'Witness version (encode segwit)', 0), chk('nolimit', 'No 90-character limit', false)],
  run: ([s], o) => {
    if (o.mode === 'encode bytes') return bmake(o.hrp.toLowerCase(), conv(unhex(s), 8, 5, true), o.spec);
    if (o.mode === 'encode segwit') {
      const wv = ival(o.wv, 'Witness version', 0, 16), prog = unhex(s);
      if (prog.length < 2 || prog.length > 40 || (wv === 0 && prog.length !== 20 && prog.length !== 32)) throw new Error('Invalid witness program length');
      return bmake(o.hrp.toLowerCase(), [wv, ...conv(prog, 8, 5, true)], wv ? 'bech32m' : 'bech32');
    }
    const r = bdecode(s, o.nolimit);
    if (!r.spec) throw new Error('Invalid checksum (neither bech32 nor bech32m)');
    const out = [`valid ${r.spec}`, `hrp: ${r.hrp}`, `data (5-bit values): ${r.data.join(',') || '(empty)'}`];
    try { out.push(`data as bytes: ${hex(Uint8Array.from(conv(r.data, 5, 8, false))) || '(empty)'}`); } catch { out.push('data as bytes: (5-bit data does not fit whole bytes)'); }
    if (r.data.length && r.data[0] <= 16) {
      try {
        const prog = conv(r.data.slice(1), 5, 8, false), wv = r.data[0], issues = [];
        if (prog.length < 2 || prog.length > 40) issues.push('program length must be 2..40');
        if (wv === 0 && prog.length !== 20 && prog.length !== 32) issues.push('v0 program must be 20 or 32 bytes');
        if ((wv === 0) !== (r.spec === 'bech32')) issues.push(`v${wv} must use ${wv ? 'bech32m' : 'bech32'}`);
        out.push(`segwit: version ${wv}, program ${hex(Uint8Array.from(prog))} (${prog.length} bytes)` + (prog.length === 20 && wv === 0 ? ' [P2WPKH]' : prog.length === 32 && wv === 0 ? ' [P2WSH]' : prog.length === 32 && wv === 1 ? ' [P2TR]' : ''), issues.length ? 'segwit rule violations: ' + issues.join('; ') : 'segwit rules: OK');
      } catch {}
    }
    return out.join('\n');
  },
});

// ---------------- EIP-55, EIP-191, ENS, CREATE/CREATE2
function checksumAddr(a) {
  const l = a.replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(l)) throw new Error(`Not a 20-byte hex address: ${a}`);
  const h = hex(keccak256(enc.encode(l)));
  return '0x' + [...l].map((c, i) => (parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c)).join('');
}
T.push({
  id: 'eip55-checksum-address', cat: CAT, title: 'Ethereum EIP-55 Checksum Address', desc: 'Convert addresses (one per line) to EIP-55 mixed-case checksum form and validate existing checksums.',
  labels: ['Addresses'], sample: '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed\n0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359\n0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359\n0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6Fa',
  run: ([s]) => lines(s).map((a) => {
    const c = checksumAddr(a), raw = a.replace(/^0x/i, ''), mixed = raw !== raw.toLowerCase() && raw !== raw.toUpperCase();
    return `${c}  ${mixed ? (raw === c.slice(2) ? 'checksum valid' : 'CHECKSUM INVALID (typo or wrong case)') : 'no checksum in input'}`;
  }).join('\n'),
});
T.push({
  id: 'eip191-message-hash', cat: CAT, title: 'EIP-191 personal_sign Message Hash', desc: 'Digest signed by personal_sign / eth_sign style wallets: keccak256("\\x19Ethereum Signed Message:\\n" + len + message). Also version 0x00 (intended validator).',
  labels: ['Message'], sample: 'hello world',
  opts: [sel('fmt', 'Message is', 'text', ['text', 'hex']), sel('ver', 'Version', '0x45 personal_sign', ['0x45 personal_sign', '0x00 validator']), txt('validator', 'Validator address (0x00 only)', '')],
  run: ([s], o) => {
    const m = toBytes(s, o.fmt);
    const pre = o.ver.startsWith('0x45') ? cat(enc.encode('\x19Ethereum Signed Message:\n' + m.length), m) : cat(Uint8Array.of(0x19, 0), (() => { const v = unhex(o.validator); if (v.length !== 20) throw new Error('Validator must be a 20-byte address'); return v; })(), m);
    return `preimage: ${hx0(pre)}\nhash:     ${hx0(keccak256(pre))}`;
  },
});
const nameNorm = (n) => n.trim().normalize('NFC').toLowerCase();
function namehash(name) {
  let node = new Uint8Array(32); const steps = [];
  const labels = name ? name.split('.') : [];
  for (let i = labels.length - 1; i >= 0; i--) {
    if (!labels[i]) throw new Error('Empty label in name');
    const lh = keccak256(enc.encode(labels[i])); node = kh(node, lh); steps.unshift(`${labels.slice(i).join('.')}\n  labelhash(${labels[i]}) = ${hx0(lh)}\n  node = ${hx0(node)}`);
  }
  return { node, steps };
}
T.push({
  id: 'ens-namehash', cat: CAT, title: 'ENS Namehash & Labelhash', desc: 'EIP-137 namehash for ENS names, one per line, with every labelhash step. Normalisation is lowercase + NFC only (not the full ENSIP-15 rules).',
  labels: ['ENS names'], sample: 'eth\nfoo.eth\nvitalik.eth',
  run: ([s], o) => s.split(/\r?\n/).map((l) => l.trim()).filter((l, i, a) => l || a.length === 1).map((l) => { const n = nameNorm(l), r = namehash(n); return `${n || '(root)'}: ${hx0(r.node)}\n${r.steps.map((x) => x.replace(/^/gm, '    ')).join('\n')}`; }).join('\n\n'),
});

// ---------------- RLP
const minBE = (n) => { if (!n) return new Uint8Array(0); const h = BigInt(n).toString(16); return unhex(h.length % 2 ? '0' + h : h); };
const rlpLen = (n, off) => (n < 56 ? Uint8Array.of(off + n) : cat(Uint8Array.of(off + 55 + minBE(n).length), minBE(n)));
function rlpEnc(v) {
  if (Array.isArray(v)) { const body = cat(...v.map(rlpEnc)); return cat(rlpLen(body.length, 0xc0), body); }
  let b;
  if (typeof v === 'number') { if (!Number.isSafeInteger(v) || v < 0) throw new Error('RLP integers must be non-negative safe integers (use a "0x.." string for big values)'); b = minBE(v); } else if (typeof v === 'string') {
    if (/^0x/i.test(v)) { if (v.length % 2) v = '0x0' + v.slice(2); b = unhex(v); } else b = enc.encode(v);
  } else throw new Error('RLP items must be strings, non-negative integers or arrays');
  return b.length === 1 && b[0] < 0x80 ? b : cat(rlpLen(b.length, 0x80), b);
}
function rlpDec(u, p = 0) { // returns [value, next]
  if (p >= u.length) throw new Error('Unexpected end of RLP data');
  const t = u[p], need = (n) => { if (p + n > u.length) throw new Error('RLP length exceeds data'); };
  const rd = (o, n) => { let x = 0; for (let i = 0; i < n; i++) x = x * 256 + u[o + i]; if (n && !u[o]) throw new Error('Non-canonical length (leading zero)'); return x; };
  if (t < 0x80) return [hx0(u.subarray(p, p + 1)), p + 1];
  if (t < 0xb8) { const n = t - 0x80; p++; need(n); if (n === 1 && u[p] < 0x80) throw new Error('Non-canonical single byte encoding'); return [hx0(u.subarray(p, p + n)), p + n]; }
  if (t < 0xc0) { const ll = t - 0xb7; need(1 + ll); const n = rd(p + 1, ll); if (n < 56) throw new Error('Non-canonical long string length'); p += 1 + ll; need(n); return [hx0(u.subarray(p, p + n)), p + n]; }
  let n, s;
  if (t < 0xf8) { n = t - 0xc0; s = p + 1; } else { const ll = t - 0xf7; need(1 + ll); n = rd(p + 1, ll); if (n < 56) throw new Error('Non-canonical long list length'); s = p + 1 + ll; }
  if (s + n > u.length) throw new Error('RLP list length exceeds data');
  const out = []; let q = s;
  while (q < s + n) { const [v, nx] = rlpDec(u, q); out.push(v); q = nx; if (q > s + n) throw new Error('Item overruns its list'); }
  return [out, s + n];
}
T.push({
  id: 'rlp-codec', cat: CAT, title: 'RLP Encoder / Decoder', desc: 'Ethereum Recursive Length Prefix. Encode JSON (strings "0x.." = bytes, other strings = UTF-8, numbers = integers, arrays = lists) or decode hex into nested hex strings, with canonical-form checks.',
  labels: ['JSON value (encode) or hex (decode)'], sample: '["cat", "dog", [], 1024, "0x0102"]',
  opts: [sel('mode', 'Mode', 'encode', ['encode', 'decode'])],
  run: ([s], o) => {
    if (o.mode === 'encode') return hx0(rlpEnc(parseJ(s)));
    const u = unhex(s), [v, n] = rlpDec(u); if (n !== u.length) throw new Error(`Trailing ${u.length - n} byte(s) after the RLP item`);
    return JSON.stringify(v, null, 2);
  },
});
T.push({
  id: 'evm-create-address', cat: CAT, title: 'CREATE / CREATE2 Contract Address', desc: 'Predict contract addresses: CREATE = keccak(rlp([sender, nonce])), CREATE2 = keccak(0xff ++ deployer ++ salt ++ keccak(init_code)) (EIP-1014).',
  inputs: 2, labels: ['Deployer / sender address', 'Init code (hex) for CREATE2, or its keccak256 if ticked'], sample: '0x6ac7ea33f8831ea9dcc53393aaa88b25a785dbf0', sample2: '',
  opts: [sel('mode', 'Opcode', 'CREATE', ['CREATE', 'CREATE2']), num('nonce', 'Nonce (CREATE)', 0), txt('salt', 'Salt (CREATE2, hex up to 32 bytes)', '0x00'), chk('ishash', 'Second input is already the init code hash', false)],
  run: ([a, code], o) => {
    const d = unhex(a); if (d.length !== 20) throw new Error('Deployer must be a 20-byte address');
    if (o.mode === 'CREATE') return checksumAddr(hex(kh(rlpEnc([hx0(d), ival(o.nonce, 'Nonce', 0, Number.MAX_SAFE_INTEGER)])).subarray(12)));
    const sb = unhex(o.salt); if (sb.length > 32) throw new Error('Salt is longer than 32 bytes');
    const ih = o.ishash ? unhex(code) : keccak256(unhex(code)); if (ih.length !== 32) throw new Error('Init code hash must be 32 bytes');
    return checksumAddr(hex(kh(Uint8Array.of(0xff), d, be(toBig(sb), 32), ih).subarray(12)));
  },
});

// ---------------- Solidity storage slots
function slotKey(type, v) {
  if (/^u?int\d*$/.test(type)) { const b = BigInt(v); return be(BigInt.asUintN(256, b), 32); }
  if (type === 'address') { const u = unhex(v); if (u.length !== 20) throw new Error('address must be 20 bytes'); return cat(new Uint8Array(12), u); }
  if (type === 'bool') return be(/^(true|1)$/i.test(v) ? 1 : 0, 32);
  const bn = /^bytes(\d+)$/.exec(type);
  if (bn) { const u = unhex(v); if (u.length > +bn[1]) throw new Error(`${type} value too long`); const r = new Uint8Array(32); r.set(u); return r; }
  if (type === 'string') return enc.encode(v);
  if (type === 'bytes') return unhex(v);
  throw new Error(`Unsupported key type "${type}"`);
}
T.push({
  id: 'solidity-storage-slot', cat: CAT, title: 'Solidity Storage Slot Calculator', desc: 'Walk a storage path through mappings, dynamic arrays, struct offsets and namespaced slots (EIP-1967 / ERC-7201) using keccak256, one operation per line.',
  labels: ['Path (one op per line)'], inputs: 1,
  placeholder: ['slot N | map <keytype> <key> | array [elemBytes] <index> | add N | sub N | keccak <text> | erc7201 <id> | bytes'],
  sample: '# mapping(address => mapping(uint256 => X)) at slot 3, then struct member +1\nslot 3\nmap address 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed\nmap uint256 7\nadd 1',
  run: ([s]) => {
    let slot = 0n, off = '', out = [];
    const W = 1n << 256n, w32 = (n) => be(((n % W) + W) % W, 32), shown = (n) => '0x' + (((n % W) + W) % W).toString(16).padStart(64, '0');
    for (const raw of s.split(/\r?\n/)) {
      const l = raw.trim(); if (!l || l.startsWith('#')) continue;
      const [op, ...ar] = l.split(/\s+/), rest = l.slice(op.length).trim(); off = '';
      if (op === 'slot') slot = BigInt(ar[0] ?? 0);
      else if (op === 'map') { if (ar.length < 2) throw new Error('map needs <keytype> <key>'); slot = toBig(kh(slotKey(ar[0], ar.slice(1).join(' ')), w32(slot))); }
      else if (op === 'array') {
        const size = ar.length > 1 ? ival(ar[0], 'elemBytes', 1, 1 << 20) : 32, i = BigInt(ar[ar.length - 1]), start = toBig(kh(w32(slot)));
        if (size <= 16) { const per = BigInt(Math.floor(32 / size)); slot = start + i / per; off = `  (byte offset in slot: ${(i % per) * BigInt(size)})`; } else slot = start + i * BigInt(Math.ceil(size / 32));
      } else if (op === 'add') slot += BigInt(ar[0]);
      else if (op === 'sub') slot -= BigInt(ar[0]);
      else if (op === 'keccak') slot = toBig(keccak256(enc.encode(rest)));
      else if (op === 'bytes') slot = toBig(kh(w32(slot)));
      else if (op === 'erc7201') slot = toBig(kh(w32(toBig(keccak256(enc.encode(rest))) - 1n))) & ~0xffn;
      else throw new Error(`Unknown operation "${op}"`);
      out.push(`${l}\n  -> ${shown(slot)}${off}`);
    }
    if (!out.length) throw new Error('Enter at least one operation');
    return out.join('\n') + `\n\nfinal slot: ${shown(slot)}  (decimal ${((slot % W) + W) % W})`;
  },
});

// ---------------- EIP-712 typed data
const MAILX = { types: { Person: [{ name: 'name', type: 'string' }, { name: 'wallet', type: 'address' }], Mail: [{ name: 'from', type: 'Person' }, { name: 'to', type: 'Person' }, { name: 'contents', type: 'string' }] }, primaryType: 'Mail', domain: { name: 'Ether Mail', version: '1', chainId: 1, verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC' }, message: { from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' }, to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' }, contents: 'Hello, Bob!' } };
const DOMF = { name: 'string', version: 'string', chainId: 'uint256', verifyingContract: 'address', salt: 'bytes32' };
function typed712(td) {
  if (!td || typeof td !== 'object' || !td.types || !td.primaryType) throw new Error('Expected {types, primaryType, domain, message}');
  const types = { ...td.types }, domain = td.domain || {};
  if (!types.EIP712Domain) types.EIP712Domain = Object.keys(DOMF).filter((k) => k in domain).map((k) => ({ name: k, type: DOMF[k] }));
  const base = (t) => t.replace(/(\[\d*\])+$/, '');
  const deps = (t, f = new Set()) => { t = base(t); if (f.has(t) || !types[t]) return f; f.add(t); for (const x of types[t]) deps(x.type, f); return f; };
  const encType = (t) => { if (!types[t]) throw new Error(`Type ${t} is not defined in "types"`); const d = deps(t); d.delete(t); return [t, ...[...d].sort()].map((n) => `${n}(${types[n].map((f) => `${f.type} ${f.name}`).join(',')})`).join(''); };
  const tHash = (t) => keccak256(enc.encode(encType(t)));
  const word = (v, type) => {
    const m = /^(u?)int(\d*)$/.exec(type);
    if (m) {
      const bits = m[2] ? +m[2] : 256; let n; try { n = BigInt(v); } catch { throw new Error(`Bad ${type} value: ${JSON.stringify(v)}`); }
      const lo = m[1] ? 0n : -(1n << BigInt(bits - 1)), hi = m[1] ? (1n << BigInt(bits)) - 1n : (1n << BigInt(bits - 1)) - 1n;
      if (n < lo || n > hi) throw new Error(`${type} value out of range: ${v}`);
      return be(BigInt.asUintN(256, n), 32);
    }
    if (type === 'bool') return be(v === true || v === 'true' || v === 1 ? 1 : 0, 32);
    if (type === 'address') { const u = unhex(String(v)); if (u.length !== 20) throw new Error(`Bad address: ${v}`); return cat(new Uint8Array(12), u); }
    const bn = /^bytes(\d+)$/.exec(type);
    if (bn) { const u = unhex(String(v)); if (u.length !== +bn[1]) throw new Error(`${type} needs exactly ${bn[1]} bytes`); const r = new Uint8Array(32); r.set(u); return r; }
    throw new Error(`Unsupported atomic type ${type}`);
  };
  const encVal = (type, v) => {
    if (v === undefined) throw new Error(`Missing value for type ${type}`);
    const ar = /^(.*)\[(\d*)\]$/.exec(type);
    if (ar) { if (!Array.isArray(v)) throw new Error(`Expected an array for ${type}`); if (ar[2] && v.length !== +ar[2]) throw new Error(`${type} needs ${ar[2]} elements`); return keccak256(cat(...v.map((x) => encVal(ar[1], x)))); }
    if (types[type]) return hStruct(type, v);
    if (type === 'string') return keccak256(enc.encode(String(v)));
    if (type === 'bytes') return keccak256(unhex(String(v)));
    return word(v, type);
  };
  const hStruct = (t, data) => { if (!types[t]) throw new Error(`Type ${t} is not defined`); return keccak256(cat(tHash(t), ...types[t].map((f) => encVal(f.type, data[f.name])))); };
  const ds = hStruct('EIP712Domain', domain), sh = td.primaryType === 'EIP712Domain' ? ds : hStruct(td.primaryType, td.message || {});
  return { ds, sh, digest: keccak256(cat(Uint8Array.of(0x19, 1), ds, sh)), encType: encType(td.primaryType), encDom: encType('EIP712Domain'), th: tHash(td.primaryType) };
}
T.push({
  id: 'eip712-typed-data-hash', cat: CAT, title: 'EIP-712 Typed Data Hash', desc: 'Compute the domain separator, struct hash and final signing digest (keccak256(0x1901 ++ domainSeparator ++ hashStruct)) from eth_signTypedData_v4-style JSON. Supports nested structs, arrays, bytesN, intN/uintN.',
  labels: ['Typed data JSON {types, primaryType, domain, message}'], sample: JSON.stringify(MAILX, null, 2),
  run: ([s]) => {
    const r = typed712(parseJ(s));
    return `domainSeparator: ${hx0(r.ds)}\nhashStruct(message): ${hx0(r.sh)}\nsigning digest:  ${hx0(r.digest)}\n\nencodeType(primary): ${r.encType}\ntypeHash(primary): ${hx0(r.th)}\nencodeType(domain): ${r.encDom}`;
  },
});

// ---------------- OpenPGP armor / packet inspector
const PGP_TAGS = { 1: 'Public-Key Encrypted Session Key', 2: 'Signature', 3: 'Symmetric-Key Encrypted Session Key', 4: 'One-Pass Signature', 5: 'Secret-Key', 6: 'Public-Key', 7: 'Secret-Subkey', 8: 'Compressed Data', 9: 'Symmetrically Encrypted Data', 10: 'Marker', 11: 'Literal Data', 12: 'Trust', 13: 'User ID', 14: 'Public-Subkey', 17: 'User Attribute', 18: 'Sym. Encrypted Integrity Protected Data', 19: 'Modification Detection Code', 20: 'AEAD Encrypted Data', 21: 'Padding' };
const PK_ALGO = { 1: 'RSA (encrypt or sign)', 2: 'RSA (encrypt only)', 3: 'RSA (sign only)', 16: 'Elgamal (encrypt only)', 17: 'DSA', 18: 'ECDH', 19: 'ECDSA', 22: 'EdDSA (legacy)', 25: 'X25519', 26: 'X448', 27: 'Ed25519', 28: 'Ed448' };
const HASH_ALGO = { 1: 'MD5', 2: 'SHA1', 3: 'RIPEMD160', 8: 'SHA256', 9: 'SHA384', 10: 'SHA512', 11: 'SHA224', 12: 'SHA3-256', 14: 'SHA3-512' };
const SYM_ALGO = { 0: 'plaintext', 1: 'IDEA', 2: '3DES', 3: 'CAST5', 4: 'Blowfish', 7: 'AES128', 8: 'AES192', 9: 'AES256', 10: 'Twofish', 11: 'Camellia128', 12: 'Camellia192', 13: 'Camellia256' };
const ZIP_ALGO = { 0: 'uncompressed', 1: 'ZIP', 2: 'ZLIB', 3: 'BZip2' };
const SIG_TYPE = { 0: 'binary document', 1: 'canonical text document', 2: 'standalone', 0x10: 'generic certification', 0x11: 'persona certification', 0x12: 'casual certification', 0x13: 'positive certification', 0x18: 'subkey binding', 0x19: 'primary key binding', 0x1f: 'direct key', 0x20: 'key revocation', 0x28: 'subkey revocation', 0x30: 'certification revocation', 0x40: 'timestamp', 0x50: 'third-party confirmation' };
const CURVES = { '2a8648ce3d030107': 'NIST P-256', '2b81040022': 'NIST P-384', '2b81040023': 'NIST P-521', '2b8104000a': 'secp256k1', '2b2403030208010107': 'brainpoolP256r1', '2b240303020801010b': 'brainpoolP384r1', '2b240303020801010d': 'brainpoolP512r1', '2b06010401da470f01': 'Ed25519', '2b060104019755010501': 'Curve25519' };
const KEYFLAGS = [[1, 'certify'], [2, 'sign'], [4, 'encrypt communications'], [8, 'encrypt storage'], [0x10, 'split key'], [0x20, 'authenticate'], [0x80, 'shared key']];
const nm = (t, v) => t[v] ? `${t[v]} (${v})` : `unknown (${v})`;
const iso = (s) => new Date(s * 1000).toISOString().replace('.000Z', 'Z');
const dur = (s) => { const d = s / 86400, y = +(d / 365.25).toFixed(2), n = +d.toFixed(2); return d >= 365 ? `${y} year${y === 1 ? '' : 's'}` : `${n} day${n === 1 ? '' : 's'}`; };
const u32 = (u, p) => ((u[p] << 24) | (u[p + 1] << 16) | (u[p + 2] << 8) | u[p + 3]) >>> 0;
function crc24(u) {
  let c = 0xb704ce;
  for (const b of u) { c ^= b << 16; for (let i = 0; i < 8; i++) { c <<= 1; if (c & 0x1000000) c ^= 0x864cfb; } }
  return c & 0xffffff;
}
function dearmor(text) {
  const blocks = [], re = /-----BEGIN (PGP [A-Z0-9 ,]+)-----\r?\n([\s\S]*?)-----END \1-----/g;
  let m;
  while ((m = re.exec(text))) {
    const ls = m[2].split(/\r?\n/), hdr = [];
    let i = 0;
    while (i < ls.length && ls[i].trim() !== '') hdr.push(ls[i++]);
    const body = []; let crc = null;
    for (i++; i < ls.length; i++) { const l = ls[i].trim(); if (!l) continue; if (l[0] === '=' && l.length === 5) crc = l.slice(1); else body.push(l); }
    const data = b64d(body.join(''));
    let status = 'no CRC-24 line';
    if (crc) { const got = crc24(data), want = (b64d(crc)[0] << 16) | (b64d(crc)[1] << 8) | b64d(crc)[2]; status = got === want ? `CRC-24 OK (${crc})` : `CRC-24 MISMATCH (armor says ${crc}, data gives ${b64e(Uint8Array.of(got >> 16, (got >> 8) & 255, got & 255))})`; }
    blocks.push({ type: m[1], hdr, data, status });
  }
  return blocks;
}
function pgpPackets(u) {
  const out = []; let p = 0;
  while (p < u.length) {
    const b = u[p++];
    if (!(b & 0x80)) throw new Error(`Bad packet header 0x${b.toString(16)} at offset ${p - 1}`);
    let tag, len, parts = null;
    if (b & 0x40) {
      tag = b & 0x3f; const o = u[p++];
      if (o < 192) len = o; else if (o < 224) len = ((o - 192) << 8) + u[p++] + 192; else if (o === 255) { len = u32(u, p); p += 4; } else {
        parts = []; let n = 1 << (o & 31);
        for (;;) { parts.push(u.subarray(p, p + n)); p += n; const q = u[p++]; if (q < 192) { n = q; parts.push(u.subarray(p, p + n)); p += n; break; } if (q < 224) { n = ((q - 192) << 8) + u[p++] + 192; parts.push(u.subarray(p, p + n)); p += n; break; } if (q === 255) { n = u32(u, p); p += 4; parts.push(u.subarray(p, p + n)); p += n; break; } n = 1 << (q & 31); }
      }
    } else {
      tag = (b >> 2) & 15; const lt = b & 3;
      if (lt === 0) len = u[p++]; else if (lt === 1) { len = (u[p] << 8) | u[p + 1]; p += 2; } else if (lt === 2) { len = u32(u, p); p += 4; } else len = u.length - p;
    }
    const body = parts ? cat(...parts) : u.subarray(p, p + len);
    if (!parts) { if (p + len > u.length) throw new Error(`Packet (tag ${tag}) claims ${len} bytes but only ${u.length - p} remain`); p += len; }
    out.push({ tag, body, fmt: b & 0x40 ? 'new' : 'old' });
  }
  return out;
}
function mpi(u, p) { const bits = (u[p] << 8) | u[p + 1], n = (bits + 7) >> 3; if (p + 2 + n > u.length) throw new Error('Truncated MPI'); return { bits, end: p + 2 + n, bytes: u.subarray(p + 2, p + 2 + n) }; }
function keyMaterial(u, p, algo) { // returns {end, desc}
  const mp = (k) => { const m = mpi(u, p); p = m.end; return m; };
  if (algo >= 1 && algo <= 3) { const n = mp(), e = mp(); return { end: p, desc: `RSA ${n.bits}-bit, e=${toBig(e.bytes)}` }; }
  if (algo === 17) { const pp = mp(), q = mp(); mp(); mp(); return { end: p, desc: `DSA p=${pp.bits} bits, q=${q.bits} bits` }; }
  if (algo === 16 || algo === 20) { const pp = mp(); mp(); mp(); return { end: p, desc: `Elgamal p=${pp.bits} bits` }; }
  if (algo === 18 || algo === 19 || algo === 22) {
    const ol = u[p], oid = hex(u.subarray(p + 1, p + 1 + ol)); p += 1 + ol; mp();
    let extra = '';
    if (algo === 18) { const kl = u[p]; extra = `, KDF hash ${HASH_ALGO[u[p + 2]] || u[p + 2]}, wrap cipher ${SYM_ALGO[u[p + 3]] || u[p + 3]}`; p += 1 + kl; }
    return { end: p, desc: `curve ${CURVES[oid] || 'OID ' + oid}${extra}` };
  }
  const raw = { 25: 32, 26: 56, 27: 32, 28: 57 }[algo];
  if (raw) return { end: p + raw, desc: `${PK_ALGO[algo]} ${raw * 8}-bit public key` };
  throw new Error(`Cannot parse key material for algorithm ${algo}`);
}
async function pgpFingerprint(body, ver) {
  if (ver === 4) return hex(await dig('SHA-1', cat(Uint8Array.of(0x99, body.length >> 8, body.length & 255), body)));
  if (ver === 6) return hex(await dig('SHA-256', cat(Uint8Array.of(0x9b), be(body.length, 4), body)));
  return null;
}
async function describeKey(pk, secret) {
  const u = pk.body, ver = u[0], L = [];
  if (ver === 3) return [`  version 3 key (obsolete; MD5-based fingerprint not computed)`];
  if (ver !== 4 && ver !== 5 && ver !== 6) return [`  unknown key version ${ver}`];
  const ct = u32(u, 1), algo = u[5];
  let p = 6; if (ver === 5 || ver === 6) p += 4;
  const km = keyMaterial(u, p, algo), pub = u.subarray(0, km.end);
  L.push(`  version ${ver}, created ${iso(ct)}, algorithm ${nm(PK_ALGO, algo)}`, `  ${km.desc}`);
  const fp = await pgpFingerprint(pub, ver);
  if (fp) L.push(`  fingerprint: ${fp.toUpperCase().match(/.{1,4}/g).join(' ')}`, `  key ID: ${(ver === 4 ? fp.slice(-16) : fp.slice(0, 16)).toUpperCase()}`);
  else L.push('  (v5 fingerprint not computed)');
  if (secret) { const s = u[km.end]; L.push(`  secret material: ${s === 0 ? 'UNPROTECTED (not encrypted)' : s === 254 || s === 255 ? `passphrase-protected (S2K usage ${s})` : `legacy encryption (cipher ${nm(SYM_ALGO, s)})`}`); }
  return L;
}
function subpackets(u, fp4) { // fp4: 4-byte lengths
  const L = []; let p = 0;
  while (p < u.length) {
    let n = u[p++];
    if (fp4) { n = u32(u, p - 1); p += 3; } else if (n >= 192 && n < 255) n = ((n - 192) << 8) + u[p++] + 192; else if (n === 255) { n = u32(u, p); p += 4; }
    const t = u[p] & 0x7f, crit = u[p] & 0x80, d = u.subarray(p + 1, p + n); p += n;
    let s;
    switch (t) {
      case 2: s = `signature created ${iso(u32(d, 0))}`; break;
      case 3: s = `signature expires after ${dur(u32(d, 0))}`; break;
      case 9: s = u32(d, 0) ? `key expires ${dur(u32(d, 0))} after creation` : 'key does not expire'; break;
      case 4: s = `exportable: ${d[0] ? 'yes' : 'no'}`; break;
      case 34: s = 'preferred AEAD algorithms: ' + [...d].map((x) => ({ 1: 'EAX', 2: 'OCB', 3: 'GCM' }[x] || x)).join(', '); break;
      case 11: s = 'preferred ciphers: ' + [...d].map((x) => SYM_ALGO[x] || x).join(', '); break;
      case 21: s = 'preferred hashes: ' + [...d].map((x) => HASH_ALGO[x] || x).join(', '); break;
      case 22: s = 'preferred compression: ' + [...d].map((x) => ZIP_ALGO[x] || x).join(', '); break;
      case 16: s = `issuer key ID ${hex(d).toUpperCase()}`; break;
      case 33: s = `issuer fingerprint (v${d[0]}) ${hex(d.subarray(1)).toUpperCase()}`; break;
      case 25: s = `primary user ID: ${d[0] ? 'yes' : 'no'}`; break;
      case 27: s = 'key flags: ' + (KEYFLAGS.filter(([m]) => d[0] & m).map(([, n]) => n).join(', ') || 'none'); break;
      case 23: s = `key server preferences 0x${hex(d)}${d[0] & 0x80 ? ' (no-modify)' : ''}`; break;
      case 24: s = 'preferred key server: ' + dec.decode(d); break;
      case 26: s = 'policy URI: ' + dec.decode(d); break;
      case 28: s = "signer's user ID: " + dec.decode(d); break;
      case 29: s = `reason for revocation: code ${d[0]} "${dec.decode(d.subarray(1))}"`; break;
      case 30: s = `features 0x${hex(d)}${d[0] & 1 ? ' (MDC)' : ''}`; break;
      case 32: s = 'embedded signature (' + d.length + ' bytes)'; break;
      case 20: s = `notation: ${dec.decode(d.subarray(8, 8 + ((d[4] << 8) | d[5])))}=${dec.decode(d.subarray(8 + ((d[4] << 8) | d[5])))}`; break;
      default: s = `type ${t} (${d.length} bytes)`;
    }
    L.push(s + (crit ? ' [critical]' : ''));
  }
  return L;
}
function describeSig(u) {
  const ver = u[0], L = [];
  if (ver === 3) {
    L.push(`  version 3, type ${nm(SIG_TYPE, u[2])}, created ${iso(u32(u, 3))}, issuer key ID ${hex(u.subarray(7, 15)).toUpperCase()}, ${nm(PK_ALGO, u[15])}, ${nm(HASH_ALGO, u[16])}`);
    return L;
  }
  if (ver !== 4 && ver !== 6) return [`  signature version ${ver} (not parsed)`];
  L.push(`  version ${ver}, type ${nm(SIG_TYPE, u[1])}, ${nm(PK_ALGO, u[2])}, hash ${nm(HASH_ALGO, u[3])}`);
  const w = ver === 6 ? 4 : 2; let p = 4;
  const hl = w === 4 ? u32(u, p) : (u[p] << 8) | u[p + 1]; p += w;
  for (const s of subpackets(u.subarray(p, p + hl), w === 4)) L.push('  hashed: ' + s);
  p += hl;
  const ul = w === 4 ? u32(u, p) : (u[p] << 8) | u[p + 1]; p += w;
  for (const s of subpackets(u.subarray(p, p + ul), w === 4)) L.push('  unhashed: ' + s);
  p += ul; L.push(`  left 16 bits of hash: ${hex(u.subarray(p, p + 2))}`);
  return L;
}
async function pgpReport(u, indent = '') {
  const out = [];
  let i = 0;
  for (const pk of pgpPackets(u)) {
    i++;
    const nameT = PGP_TAGS[pk.tag] || 'Unknown', b = pk.body, L = [];
    try {
      if (pk.tag === 6 || pk.tag === 14 || pk.tag === 5 || pk.tag === 7) L.push(...await describeKey(pk, pk.tag === 5 || pk.tag === 7));
      else if (pk.tag === 13) L.push(`  "${dec.decode(b)}"`);
      else if (pk.tag === 2) L.push(...describeSig(b));
      else if (pk.tag === 1) L.push(`  version ${b[0]}, key ID ${hex(b.subarray(1, 9)).toUpperCase()}${/^0+$/.test(hex(b.subarray(1, 9))) ? ' (anonymous/hidden recipient)' : ''}, ${nm(PK_ALGO, b[9])}`);
      else if (pk.tag === 3) L.push(`  version ${b[0]}, cipher ${nm(SYM_ALGO, b[1])}, S2K type ${b[2]}${b[2] === 3 ? ` (iterated+salted, hash ${nm(HASH_ALGO, b[3])})` : b[2] === 4 ? ' (Argon2)' : ''}`);
      else if (pk.tag === 4) L.push(`  version ${b[0]}, type ${nm(SIG_TYPE, b[1])}, hash ${nm(HASH_ALGO, b[2])}, ${nm(PK_ALGO, b[3])}, key ID ${hex(b.subarray(4, 12)).toUpperCase()}`);
      else if (pk.tag === 8) L.push(`  compression ${nm(ZIP_ALGO, b[0])} (contents not decompressed)`);
      else if (pk.tag === 11) { const fl = b[1]; L.push(`  format '${String.fromCharCode(b[0])}', file name "${dec.decode(b.subarray(2, 2 + fl))}", date ${u32(b, 2 + fl) ? iso(u32(b, 2 + fl)) : 'none'}, ${b.length - 6 - fl} data bytes`); }
      else if (pk.tag === 18 || pk.tag === 20) L.push(`  version ${b[0]} (encrypted, ${b.length} bytes)`);
    } catch (e) { L.push('  (could not parse body: ' + e.message + ')'); }
    out.push(`${indent}#${i} ${nameT} (tag ${pk.tag}, ${pk.body.length} bytes, ${pk.fmt} format)\n` + L.map((l) => indent + l).join('\n'));
  }
  return out.join('\n');
}
T.push({
  id: 'openpgp-inspector', cat: CAT, title: 'OpenPGP Armor / Packet Inspector', desc: 'Paste an ASCII-armored PGP key, signature or message: checks the CRC-24, lists packets (algorithms, curves, key sizes, creation time, user IDs, signature subpackets) and computes v4 (SHA-1) / v6 (SHA-256) fingerprints. Nothing is verified or decrypted.',
  labels: ['ASCII-armored OpenPGP block (or hex of binary packets)'],
  sample: `-----BEGIN PGP PUBLIC KEY BLOCK-----

mDMEatpiAhYJKwYBBAHaRw8BAQdATKuMZ/i+BtzYAWAe/Nx8amAR4OamN0OGT/Gj
lV08nhq0HFRlc3QgVXNlciA8dGVzdEBleGFtcGxlLm9yZz6ImQQTFgoAQRYhBAel
1UIhpYwd/U41ecIqWJfafW0zBQJq2mICAhsDBQkB4TOABQsJCAcCAiICBhUKCQgL
AgQWAgMBAh4HAheAAAoJEMIqWJfafW0zxv4A/1W9LwedTq+3BHclBTJ3hyul7Ldv
lwH2uGvij9eycHK3AP9v51PHpspiCTGZmSiJWArMIowUaXuG9ERFYqcVxKuTB7g4
BGraYgISCisGAQQBl1UBBQEBB0Af5/bDrG4VixObO9F25fSahgbyqlv3TS6y/Ujl
S9YkdQMBCAeIfgQYFgoAJhYhBAel1UIhpYwd/U41ecIqWJfafW0zBQJq2mICAhsM
BQkB4TOAAAoJEMIqWJfafW0zSDQA/3Dw7gpfwiCFSXz41GJ9Anu/zKszo6QajY7l
F18HHgC/AP9dbPftptZ+vuu0f+40Rl1dGcgCG04CyurMbHh1WGyfCw==
=Onui
-----END PGP PUBLIC KEY BLOCK-----`,
  run: async ([s]) => {
    const t = s.trim();
    if (/^[0-9a-f\s]+$/i.test(t) && !t.includes('-----')) return pgpReport(unhex(t));
    const bl = dearmor(s);
    if (!bl.length) throw new Error('No "-----BEGIN PGP ...-----" armor block found');
    const out = [];
    for (const b of bl) out.push(`== ${b.type} (${b.data.length} bytes) ==${b.hdr.length ? '\n' + b.hdr.join('\n') : ''}\n${b.status}\n${await pgpReport(b.data)}`);
    return out.join('\n\n');
  },
});

// MD5 (copied from devx.js), only for legacy SSH fingerprints
function md5(u) {
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const n = u.length, m = new Uint8Array(((n + 8) >> 6 << 6) + 64); m.set(u); m[n] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(m.length - 8, (n * 8) >>> 0, true); dv.setUint32(m.length - 4, Math.floor(n / 2 ** 29), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let o = 0; o < m.length; o += 64) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + dv.getUint32(o + g * 4, true)) | 0; A = D; D = C; C = B;
      const s = S[(i >> 4) * 4 + (i & 3)]; B = (B + ((F << s) | (F >>> (32 - s)))) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  const r = new Uint8Array(16), rv = new DataView(r.buffer); [a0, b0, c0, d0].forEach((x, i) => rv.setUint32(i * 4, x >>> 0, true));
  return r;
}

// ---------------- SSH public key / known_hosts fingerprints
const sshStr = (u, p) => { const n = u32(u, p); if (p + 4 + n > u.length) throw new Error('Truncated SSH key blob'); return [u.subarray(p + 4, p + 4 + n), p + 4 + n]; };
T.push({
  id: 'ssh-key-fingerprint', cat: CAT, title: 'SSH Public Key Fingerprint', desc: 'SHA256 (base64) and legacy MD5 fingerprints of authorized_keys / .pub / known_hosts lines, with key type and size. Same output as ssh-keygen -lf.',
  labels: ['Public key lines (authorized_keys, .pub, known_hosts)'], sample: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl user@example',
  run: async ([s]) => {
    const out = [];
    for (const l of lines(s)) {
      if (l.startsWith('#')) continue;
      const tk = l.split(/\s+/);
      let idx = -1, blob;
      for (let i = 1; i < tk.length && idx < 0; i++) {
        try { const b = b64d(tk[i]), [t] = sshStr(b, 0); if (dec.decode(t) === tk[i - 1]) { idx = i; blob = b; } } catch {}
      }
      if (idx < 0) throw new Error(`No "<keytype> <base64>" pair found in: ${l.slice(0, 60)}`);
      const type = tk[idx - 1];
      let detail = '';
      try {
        let [, p] = sshStr(blob, 0);
        if (type === 'ssh-rsa') { const [e, p2] = sshStr(blob, p), [n] = sshStr(blob, p2); let nn = n; while (nn.length && !nn[0]) nn = nn.subarray(1); detail = `${(nn.length - 1) * 8 + (32 - Math.clz32(nn[0] || 1))} bits`; } else if (type.startsWith('ecdsa-')) detail = dec.decode(sshStr(blob, p)[0]); else if (type === 'ssh-ed25519' || type.startsWith('sk-ssh-ed25519')) detail = '256 bits';
        else if (type.endsWith('-cert-v01@openssh.com')) detail = 'OpenSSH certificate';
      } catch {}
      const sha = b64np(await dig('SHA-256', blob));
      out.push(`${idx > 1 ? 'host(s): ' + tk.slice(0, idx - 1).join(' ') + '\n' : ''}${type}${detail ? ' (' + detail + ')' : ''}${tk.slice(idx + 1).length ? ' ' + tk.slice(idx + 1).join(' ') : ''}\nSHA256:${sha}\nMD5:${hex(md5(blob)).match(/../g).join(':')}`);
    }
    if (!out.length) throw new Error('No key lines found');
    return out.join('\n\n');
  },
});

// ---------------- Shamir secret sharing over GF(256) (AES polynomial 0x11b)
const GEXP = new Uint8Array(512), GLOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { GEXP[i] = GEXP[i + 255] = x; GLOG[x] = i; x ^= (x << 1) ^ (x & 0x80 ? 0x11b : 0); x &= 255; }
const gmul = (a, b) => (a && b ? GEXP[GLOG[a] + GLOG[b]] : 0);
const gdiv = (a, b) => { if (!b) throw new Error('Division by zero in GF(256)'); return a ? GEXP[GLOG[a] + 255 - GLOG[b]] : 0; };
function shamirSplit(secret, n, k) {
  n = ival(n, 'Shares (n)', 2, 255); k = ival(k, 'Threshold (k)', 2, n);
  if (!secret.length) throw new Error('Secret is empty');
  const ys = Array.from({ length: n }, () => new Uint8Array(secret.length));
  for (let j = 0; j < secret.length; j++) {
    const co = crypto.getRandomValues(new Uint8Array(k)); co[0] = secret[j];
    for (let i = 0; i < n; i++) { const x = i + 1; let y = 0; for (let c = k - 1; c >= 0; c--) y = gmul(y, x) ^ co[c]; ys[i][j] = y; }
  }
  return ys.map((y, i) => `${k}-${i + 1}-${hex(y)}`);
}
function shamirCombine(shares) {
  const ps = shares.map((s) => { const m = /^(\d+)-(\d+)-([0-9a-f]+)$/i.exec(s.trim()); if (!m || m[3].length % 2) throw new Error(`Bad share format "${s.slice(0, 20)}": expected k-x-hex`); return { k: +m[1], x: +m[2], y: unhex(m[3]) }; });
  if (new Set(ps.map((p) => p.x)).size !== ps.length) throw new Error('Duplicate share index');
  if (ps.some((p) => p.x < 1 || p.x > 255 || p.k !== ps[0].k || p.y.length !== ps[0].y.length)) throw new Error('Shares do not belong together (different threshold, index or length)');
  if (ps.length < ps[0].k) throw new Error(`Need at least ${ps[0].k} shares, got ${ps.length}`);
  const use = ps.slice(0, ps[0].k), out = new Uint8Array(use[0].y.length);
  for (let j = 0; j < out.length; j++) {
    let acc = 0;
    use.forEach((pi, i) => { let l = 1; use.forEach((pj, m) => { if (m !== i) l = gmul(l, gdiv(pj.x, pi.x ^ pj.x)); }); acc ^= gmul(pi.y[j], l); });
    out[j] = acc;
  }
  return out;
}
T.push({
  id: 'shamir-secret-sharing', cat: CAT, title: 'Shamir Secret Sharing (GF(256))', desc: "Split a secret into n shares so any k recover it (byte-wise Shamir over GF(256), random coefficients from crypto.getRandomValues), or combine shares. Shares look like k-x-hex. Fewer than k shares reveal nothing.",
  labels: ['Secret (split) or shares, one per line (combine)'], sample: 'my secret passphrase',
  opts: [sel('mode', 'Mode', 'split', ['split', 'combine']), num('n', 'Shares (n)', 5), num('k', 'Threshold (k)', 3), sel('fmt', 'Secret is (split) / show as (combine)', 'text', ['text', 'hex'])],
  run: ([s], o) => {
    if (o.mode === 'split') {
      const sh = shamirSplit(toBytes(s, o.fmt), o.n, o.k);
      if (hex(shamirCombine(sh.slice(-o.k))) !== hex(toBytes(s, o.fmt))) throw new Error('Self-check failed');
      return sh.join('\n');
    }
    const u = shamirCombine(lines(s));
    if (o.fmt === 'hex') return hex(u);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u); } catch { return 'not valid UTF-8; as hex: ' + hex(u); }
  },
});

// ---------------- CRC (table driven, BigInt registers), xxHash, MurmurHash3, FNV, SipHash
// [width, poly, init, reflected (refin == refout), xorout]
const CRCS = {
  'CRC-16/ARC': [16, 0x8005n, 0n, 1, 0n], 'CRC-16/CCITT-FALSE': [16, 0x1021n, 0xffffn, 0, 0n], 'CRC-16/XMODEM': [16, 0x1021n, 0n, 0, 0n], 'CRC-16/KERMIT': [16, 0x1021n, 0n, 1, 0n],
  'CRC-16/MODBUS': [16, 0x8005n, 0xffffn, 1, 0n], 'CRC-16/X-25': [16, 0x1021n, 0xffffn, 1, 0xffffn], 'CRC-16/AUG-CCITT': [16, 0x1021n, 0x1d0fn, 0, 0n], 'CRC-16/GENIBUS': [16, 0x1021n, 0xffffn, 0, 0xffffn],
  'CRC-16/USB': [16, 0x8005n, 0xffffn, 1, 0xffffn], 'CRC-16/DNP': [16, 0x3d65n, 0n, 1, 0xffffn], 'CRC-16/BUYPASS': [16, 0x8005n, 0n, 0, 0n], 'CRC-16/MAXIM': [16, 0x8005n, 0n, 1, 0xffffn],
  'CRC-16/T10-DIF': [16, 0x8bb7n, 0n, 0, 0n], 'CRC-16/MCRF4XX': [16, 0x1021n, 0xffffn, 1, 0n], 'CRC-16/CDMA2000': [16, 0xc867n, 0xffffn, 0, 0n], 'CRC-16/EN-13757': [16, 0x3d65n, 0n, 0, 0xffffn], 'CRC-16/DDS-110': [16, 0x8005n, 0x800dn, 0, 0n],
  'CRC-32/ISO-HDLC (zip, png)': [32, 0x04c11db7n, 0xffffffffn, 1, 0xffffffffn], 'CRC-32C (Castagnoli)': [32, 0x1edc6f41n, 0xffffffffn, 1, 0xffffffffn], 'CRC-32/BZIP2': [32, 0x04c11db7n, 0xffffffffn, 0, 0xffffffffn],
  'CRC-32/MPEG-2': [32, 0x04c11db7n, 0xffffffffn, 0, 0n], 'CRC-32/JAMCRC': [32, 0x04c11db7n, 0xffffffffn, 1, 0n], 'CRC-32/XFER': [32, 0xafn, 0n, 0, 0n], 'CRC-32/CKSUM (POSIX)': [32, 0x04c11db7n, 0n, 0, 0xffffffffn], 'CRC-32D': [32, 0xa833982bn, 0xffffffffn, 1, 0xffffffffn],
  'CRC-64/XZ': [64, 0x42f0e1eba9ea3693n, 0xffffffffffffffffn, 1, 0xffffffffffffffffn], 'CRC-64/ECMA-182': [64, 0x42f0e1eba9ea3693n, 0n, 0, 0n], 'CRC-64/GO-ISO': [64, 0x1bn, 0xffffffffffffffffn, 1, 0xffffffffffffffffn],
  'CRC-64/WE': [64, 0x42f0e1eba9ea3693n, 0xffffffffffffffffn, 0, 0xffffffffffffffffn], 'CRC-64/REDIS': [64, 0xad93d23594c935a9n, 0n, 1, 0n],
};
const CRC_TABLES = {};
function crcCalc(name, u) {
  const [w, poly, init, refl, xo] = CRCS[name], W = BigInt(w), mask = (1n << W) - 1n;
  const rev = (x) => { let r = 0n; for (let i = 0n; i < W; i++) if (x >> i & 1n) r |= 1n << (W - 1n - i); return r; };
  const tb = CRC_TABLES[name] ||= Array.from({ length: 256 }, (_, i) => {
    if (refl) { let r = BigInt(i); const p = rev(poly); for (let k = 0; k < 8; k++) r = r & 1n ? (r >> 1n) ^ p : r >> 1n; return r; }
    let r = BigInt(i) << (W - 8n); for (let k = 0; k < 8; k++) r = r & (1n << (W - 1n)) ? ((r << 1n) ^ poly) & mask : (r << 1n) & mask; return r;
  });
  let c = refl ? rev(init) : init;
  if (refl) for (const b of u) c = tb[Number((c ^ BigInt(b)) & 255n)] ^ (c >> 8n); else for (const b of u) c = tb[Number(((c >> (W - 8n)) ^ BigInt(b)) & 255n)] ^ ((c << 8n) & mask);
  return (c ^ xo) & mask;
}
T.push({
  id: 'crc-calculator', cat: CAT, title: 'CRC-16 / CRC-32 / CRC-64 Calculator', desc: '30 named CRC variants (CRC-16 ARC/CCITT/XMODEM/Modbus/X-25..., CRC-32 and 32C, CRC-64 XZ/ECMA/Redis) computed with hand-written table CRCs. Shows hex, decimal and the little-endian byte form.',
  labels: ['Data'], sample: '123456789',
  opts: [sel('algo', 'Algorithm', 'CRC-16/ARC', Object.keys(CRCS)), sel('fmt', 'Input is', 'text', FMT)],
  run: ([s], o) => {
    const v = crcCalc(o.algo, toBytes(s, o.fmt)), w = CRCS[o.algo][0];
    return `0x${v.toString(16).toUpperCase().padStart(w / 4, '0')}\ndecimal: ${v}\nlittle-endian bytes: ${hex(be(v, w / 8).reverse())}`;
  },
});

const M32 = 0xffffffff, rl32 = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0, rd32 = (u, p) => (u[p] | (u[p + 1] << 8) | (u[p + 2] << 16) | (u[p + 3] << 24)) >>> 0;
function xxh32(u, seed = 0) {
  const P1 = 2654435761, P2 = 2246822519, P3 = 3266489917, P4 = 668265263, P5 = 374761393, n = u.length;
  let p = 0, h;
  const rnd = (a, v) => Math.imul(rl32((a + Math.imul(v, P2)) >>> 0, 13), P1) >>> 0;
  if (n >= 16) {
    let v1 = (seed + P1 + P2) >>> 0, v2 = (seed + P2) >>> 0, v3 = seed >>> 0, v4 = (seed - P1) >>> 0;
    for (; p <= n - 16; p += 16) { v1 = rnd(v1, rd32(u, p)); v2 = rnd(v2, rd32(u, p + 4)); v3 = rnd(v3, rd32(u, p + 8)); v4 = rnd(v4, rd32(u, p + 12)); }
    h = (rl32(v1, 1) + rl32(v2, 7) + rl32(v3, 12) + rl32(v4, 18)) >>> 0;
  } else h = (seed + P5) >>> 0;
  h = (h + n) >>> 0;
  for (; p + 4 <= n; p += 4) h = Math.imul(rl32((h + Math.imul(rd32(u, p), P3)) >>> 0, 17), P4) >>> 0;
  for (; p < n; p++) h = Math.imul(rl32((h + Math.imul(u[p], P5)) >>> 0, 11), P1) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, P2) >>> 0; h ^= h >>> 13; h = Math.imul(h, P3) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}
const U64 = (1n << 64n) - 1n, rl64 = (x, n) => ((x << BigInt(n)) | (x >> BigInt(64 - n))) & U64;
const rd64 = (u, p) => { let x = 0n; for (let i = 7; i >= 0; i--) x = (x << 8n) | BigInt(u[p + i]); return x; };
function xxh64(u, seed = 0n) {
  const P1 = 11400714785074694791n, P2 = 14029467366897019727n, P3 = 1609587929392839161n, P4 = 9650029242287828579n, P5 = 2870177450012600261n, n = u.length;
  seed = BigInt.asUintN(64, seed);
  const rnd = (a, v) => (rl64((a + v * P2) & U64, 31) * P1) & U64, mrg = (a, v) => (((a ^ rnd(0n, v)) * P1) + P4) & U64;
  let p = 0, h;
  if (n >= 32) {
    let v1 = (seed + P1 + P2) & U64, v2 = (seed + P2) & U64, v3 = seed, v4 = (seed - P1) & U64;
    for (; p <= n - 32; p += 32) { v1 = rnd(v1, rd64(u, p)); v2 = rnd(v2, rd64(u, p + 8)); v3 = rnd(v3, rd64(u, p + 16)); v4 = rnd(v4, rd64(u, p + 24)); }
    h = (rl64(v1, 1) + rl64(v2, 7) + rl64(v3, 12) + rl64(v4, 18)) & U64;
    h = mrg(h, v1); h = mrg(h, v2); h = mrg(h, v3); h = mrg(h, v4);
  } else h = (seed + P5) & U64;
  h = (h + BigInt(n)) & U64;
  for (; p + 8 <= n; p += 8) h = (rl64(h ^ rnd(0n, rd64(u, p)), 27) * P1 + P4) & U64;
  if (p + 4 <= n) { h = (rl64(h ^ (BigInt(rd32(u, p)) * P1 & U64), 23) * P2 + P3) & U64; p += 4; }
  for (; p < n; p++) h = (rl64(h ^ (BigInt(u[p]) * P5 & U64), 11) * P1) & U64;
  h ^= h >> 33n; h = (h * P2) & U64; h ^= h >> 29n; h = (h * P3) & U64; h ^= h >> 32n;
  return h;
}
function murmur3(u, seed = 0) {
  const c1 = 0xcc9e2d51, c2 = 0x1b873593, n = u.length;
  let h = seed >>> 0, p = 0;
  for (; p + 4 <= n; p += 4) { let k = Math.imul(rd32(u, p), c1); k = Math.imul(rl32(k >>> 0, 15), c2); h ^= k; h = (Math.imul(rl32(h >>> 0, 13), 5) + 0xe6546b64) >>> 0; }
  let k = 0; for (let i = n & 3; i > 0; i--) k = (k << 8) | u[p + i - 1];
  if (n & 3) { k = Math.imul(k >>> 0, c1); k = Math.imul(rl32(k >>> 0, 15), c2); h ^= k; }
  h ^= n; h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
function fnv(u, bits, a) {
  const B = bits === 64, prime = B ? 0x100000001b3n : 0x01000193n, mask = B ? U64 : 0xffffffffn;
  let h = B ? 0xcbf29ce484222325n : 0x811c9dc5n;
  for (const b of u) h = a ? ((h ^ BigInt(b)) * prime) & mask : ((h * prime) & mask) ^ BigInt(b);
  return h;
}
function siphash(u, key, cr = 2, fr = 4) {
  if (key.length !== 16) throw new Error('SipHash key must be 16 bytes (32 hex characters)');
  const k0 = rd64(key, 0), k1 = rd64(key, 8);
  let v0 = k0 ^ 0x736f6d6570736575n, v1 = k1 ^ 0x646f72616e646f6dn, v2 = k0 ^ 0x6c7967656e657261n, v3 = k1 ^ 0x7465646279746573n;
  const rnd = () => {
    v0 = (v0 + v1) & U64; v1 = rl64(v1, 13) ^ v0; v0 = rl64(v0, 32); v2 = (v2 + v3) & U64; v3 = rl64(v3, 16) ^ v2;
    v0 = (v0 + v3) & U64; v3 = rl64(v3, 21) ^ v0; v2 = (v2 + v1) & U64; v1 = rl64(v1, 17) ^ v2; v2 = rl64(v2, 32);
  };
  const n = u.length, end = n - (n % 8);
  for (let p = 0; p < end; p += 8) { const m = rd64(u, p); v3 ^= m; for (let i = 0; i < cr; i++) rnd(); v0 ^= m; }
  let b = BigInt(n & 255) << 56n; for (let i = 0; i < n % 8; i++) b |= BigInt(u[end + i]) << BigInt(8 * i);
  v3 ^= b; for (let i = 0; i < cr; i++) rnd(); v0 ^= b; v2 ^= 0xffn;
  for (let i = 0; i < fr; i++) rnd();
  return v0 ^ v1 ^ v2 ^ v3;
}
const NCH = { xxh32: 1, xxh64: 1, 'murmur3 (x86, 32-bit)': 1, 'fnv-1a 32': 1, 'fnv-1a 64': 1, 'fnv-1 32': 1, 'fnv-1 64': 1, 'siphash-2-4': 1, 'siphash-1-3': 1 };
T.push({
  id: 'noncrypto-hashes', cat: CAT, title: 'xxHash / MurmurHash3 / FNV-1a / SipHash', desc: 'Fast non-cryptographic hashes, hand-written: xxHash32/64, MurmurHash3 x86_32, FNV-1/1a (32 and 64 bit) and SipHash-2-4/1-3 with a 128-bit key. Not for security except SipHash as a keyed MAC for hash tables.',
  labels: ['Data'], sample: 'The quick brown fox jumps over the lazy dog',
  opts: [sel('algo', 'Algorithm', 'xxh32', Object.keys(NCH)), txt('seed', 'Seed (number or 0x hex)', '0'), txt('key', 'SipHash key (32 hex chars)', '000102030405060708090a0b0c0d0e0f'), sel('fmt', 'Input is', 'text', FMT)],
  run: ([s], o) => {
    const u = toBytes(s, o.fmt);
    let seed; try { seed = BigInt(o.seed.trim() || '0'); } catch { throw new Error('Seed must be an integer'); }
    let v, w;
    if (o.algo === 'xxh32') { v = BigInt(xxh32(u, Number(BigInt.asUintN(32, seed)))); w = 8; } else if (o.algo === 'xxh64') { v = xxh64(u, seed); w = 16; } else if (o.algo.startsWith('murmur')) { v = BigInt(murmur3(u, Number(BigInt.asUintN(32, seed)))); w = 8; } else if (o.algo.startsWith('fnv')) { const m = /fnv-1(a?) (\d+)/.exec(o.algo); v = fnv(u, +m[2], m[1]); w = m[2] / 4; } else { v = siphash(u, unhex(o.key), o.algo.endsWith('2-4') ? 2 : 1, o.algo.endsWith('2-4') ? 4 : 3); w = 16; }
    return `0x${v.toString(16).padStart(w, '0')}\ndecimal: ${v}`;
  },
});

// ---------------- Check digits: Luhn, Verhoeff, Damm
const VD = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const VP = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4]];
for (let i = 2; i < 8; i++) VP.push(VP[1].map((_, j) => VP[i - 1][VP[1][j]]));
const VINV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
const DAMM = ['0317598642', '7092154863', '4206871359', '1750983426', '6123045978', '3674209581', '5869720134', '8945362017', '9438617205', '2581436790'].map((r) => [...r].map(Number));
const digs = (s) => [...s].map(Number);
const CHECK = {
  luhn: { sum: (d) => d.reduceRight((a, x, i) => { let v = x; if ((d.length - 1 - i) % 2) { v *= 2; if (v > 9) v -= 9; } return a + v; }, 0) % 10 === 0, gen: (d) => { for (let c = 0; c < 10; c++) if (CHECK.luhn.sum([...d, c])) return c; } },
  verhoeff: { sum: (d) => d.reduceRight((c, x, i) => VD[c][VP[(d.length - 1 - i) % 8][x]], 0) === 0, gen: (d) => VINV[[...d].reverse().reduce((c, x, i) => VD[c][VP[(i + 1) % 8][x]], 0)] },
  damm: { sum: (d) => d.reduce((c, x) => DAMM[c][x], 0) === 0, gen: (d) => d.reduce((c, x) => DAMM[c][x], 0) },
};
T.push({
  id: 'check-digit-tool', cat: CAT, title: 'Luhn / Verhoeff / Damm Check Digits', desc: 'Validate numbers or compute the check digit (credit card style Luhn, Verhoeff dihedral-group, Damm quasigroup). One number per line; spaces and dashes ignored.',
  labels: ['Numbers'], sample: '4539 1488 0343 6467\n79927398713\n236\n572',
  opts: [sel('algo', 'Algorithm', 'luhn', Object.keys(CHECK)), sel('mode', 'Mode', 'validate', ['validate', 'generate'])],
  run: ([s], o) => lines(s).map((l) => {
    const c = l.replace(/[\s-]/g, '');
    if (!/^\d+$/.test(c)) throw new Error(`Digits only, got "${l}"`);
    const d = digs(c), A = CHECK[o.algo];
    return o.mode === 'generate' ? `${l} -> check digit ${A.gen(d)}  (${c}${A.gen(d)})` : `${l}: ${A.sum(d) ? 'valid' : 'INVALID'}`;
  }).join('\n'),
});

// ---------------- ChaCha20, Poly1305, ChaCha20-Poly1305 (RFC 8439)
function chachaBlock(key, counter, nonce) {
  const s = new Uint32Array(16), dv = (u) => new DataView(u.buffer, u.byteOffset, u.length);
  s.set([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]);
  for (let i = 0; i < 8; i++) s[4 + i] = dv(key).getUint32(i * 4, true);
  s[12] = counter >>> 0;
  for (let i = 0; i < 3; i++) s[13 + i] = dv(nonce).getUint32(i * 4, true);
  const x = Uint32Array.from(s), q = (a, b, c, d) => { x[a] += x[b]; x[d] = rl32(x[d] ^ x[a], 16); x[c] += x[d]; x[b] = rl32(x[b] ^ x[c], 12); x[a] += x[b]; x[d] = rl32(x[d] ^ x[a], 8); x[c] += x[d]; x[b] = rl32(x[b] ^ x[c], 7); };
  for (let i = 0; i < 10; i++) { q(0, 4, 8, 12); q(1, 5, 9, 13); q(2, 6, 10, 14); q(3, 7, 11, 15); q(0, 5, 10, 15); q(1, 6, 11, 12); q(2, 7, 8, 13); q(3, 4, 9, 14); }
  const out = new Uint8Array(64), od = dv(out);
  for (let i = 0; i < 16; i++) od.setUint32(i * 4, (x[i] + s[i]) >>> 0, true);
  return out;
}
function chacha20(key, nonce, counter, data) {
  if (key.length !== 32) throw new Error('ChaCha20 key must be 32 bytes (64 hex characters)');
  if (nonce.length !== 12) throw new Error('Nonce must be 12 bytes (24 hex characters)');
  const out = new Uint8Array(data.length);
  for (let o = 0, c = counter; o < data.length; o += 64, c++) { const ks = chachaBlock(key, c, nonce); for (let i = 0; i < 64 && o + i < data.length; i++) out[o + i] = data[o + i] ^ ks[i]; }
  return out;
}
function poly1305(key, msg) {
  if (key.length !== 32) throw new Error('Poly1305 key must be 32 bytes (64 hex characters)');
  const le = (u) => toBig(Uint8Array.from(u).reverse()), P = (1n << 130n) - 5n, r = le(key.subarray(0, 16)) & 0x0ffffffc0ffffffc0ffffffc0fffffffn;
  let acc = 0n;
  for (let i = 0; i < msg.length; i += 16) { const b = msg.subarray(i, i + 16); acc = ((acc + le(b) + (1n << BigInt(8 * b.length))) * r) % P; }
  return be((acc + le(key.subarray(16))) & ((1n << 128n) - 1n), 16).reverse();
}
const pad16 = (u) => new Uint8Array((16 - (u.length % 16)) % 16);
function aeadMac(key, nonce, aad, ct) {
  const otk = chachaBlock(key, 0, nonce).subarray(0, 32);
  return poly1305(otk, cat(aad, pad16(aad), ct, pad16(ct), be(aad.length, 8).reverse(), be(ct.length, 8).reverse()));
}
T.push({
  id: 'chacha20-poly1305', cat: CAT, title: 'ChaCha20 / Poly1305 / AEAD (RFC 8439)', desc: 'Hand-written ChaCha20 stream cipher, Poly1305 one-time MAC and the ChaCha20-Poly1305 AEAD. Defaults are the RFC 8439 section 2.8.2 test vector. Decrypt checks the tag in constant time before releasing plaintext.',
  labels: ['Plaintext (encrypt / chacha20 / poly1305) or hex ciphertext||tag (decrypt)'], sample: "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
  opts: [sel('mode', 'Mode', 'aead-encrypt', ['aead-encrypt', 'aead-decrypt', 'chacha20 (raw stream)', 'poly1305 (MAC)']), txt('key', 'Key (hex, 32 bytes)', '808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f'), txt('nonce', 'Nonce (hex, 12 bytes)', '070000004041424344454647'), txt('aad', 'AAD (hex, AEAD only)', '50515253c0c1c2c3c4c5c6c7'), num('ctr', 'Initial counter (raw chacha20)', 1), sel('fmt', 'Plaintext is', 'text', ['text', 'hex'])],
  run: ([s], o) => {
    const key = unhex(o.key), nonce = o.nonce.trim() ? unhex(o.nonce) : new Uint8Array(0);
    if (o.mode === 'poly1305 (MAC)') return hex(poly1305(key, toBytes(s, o.fmt)));
    if (o.mode.startsWith('chacha20')) { const r = chacha20(key, nonce, ival(o.ctr, 'Counter', 0, 2 ** 32 - 1), toBytes(s, o.fmt)); return hex(r); }
    const aad = o.aad.trim() ? unhex(o.aad) : new Uint8Array(0);
    if (key.length !== 32 || nonce.length !== 12) throw new Error('AEAD needs a 32-byte key and 12-byte nonce');
    if (o.mode === 'aead-encrypt') { const ct = chacha20(key, nonce, 1, toBytes(s, o.fmt)), tag = aeadMac(key, nonce, aad, ct); return `ciphertext: ${hex(ct)}\ntag:        ${hex(tag)}\ncombined:   ${hex(cat(ct, tag))}`; }
    const u = unhex(s); if (u.length < 16) throw new Error('Input must be ciphertext followed by the 16-byte tag');
    const ct = u.subarray(0, -16), tag = aeadMac(key, nonce, aad, ct);
    let d = 0; for (let i = 0; i < 16; i++) d |= tag[i] ^ u[u.length - 16 + i];
    if (d) throw new Error('Authentication failed: wrong key, nonce, AAD or modified data');
    const pt = chacha20(key, nonce, 1, ct);
    let t; try { t = new TextDecoder('utf-8', { fatal: true }).decode(pt); } catch { t = null; }
    return `tag OK\n${t != null ? 'plaintext: ' + t + '\n' : ''}hex: ${hex(pt)}`;
  },
});

// ---------------- AES demo (WebCrypto), XOR / one-time pad, classical ciphers
async function aesDemo(mode, dir, key, iv, aad, data, ctrBits) {
  const zero = new Uint8Array(16);
  if (![16, 24, 32].includes(key.length)) throw new Error('AES key must be 16, 24 or 32 bytes (32/48/64 hex characters)');
  const kCbc = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt', 'decrypt']);
  const encBlock = async (b) => new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: zero }, kCbc, b)).subarray(0, 16);
  if (mode === 'ECB') {
    if (dir === 'encrypt') { const pd = 16 - (data.length % 16), m = cat(data, new Uint8Array(pd).fill(pd)); return cat(...await Promise.all(Array.from({ length: m.length / 16 }, (_, i) => encBlock(m.subarray(i * 16, i * 16 + 16))))); }
    if (data.length % 16 || !data.length) throw new Error('ECB ciphertext must be a multiple of 16 bytes');
    const pad = new Uint8Array(16).fill(16);
    const blocks = await Promise.all(Array.from({ length: data.length / 16 }, async (_, i) => {
      const c = data.subarray(i * 16, i * 16 + 16), c2 = await encBlock(c.map((x, j) => x ^ pad[j]));
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: zero }, kCbc, cat(c, c2)));
    }));
    const m = cat(...blocks), pd = m[m.length - 1];
    if (!pd || pd > 16 || m.subarray(m.length - pd).some((x) => x !== pd)) throw new Error('Bad PKCS#7 padding (wrong key or not ECB data)');
    return m.subarray(0, m.length - pd);
  }
  const need = mode === 'GCM' ? 12 : 16;
  if (iv.length !== need) throw new Error(`${mode} needs a ${need}-byte ${mode === 'CTR' ? 'counter block' : 'IV'} (${need * 2} hex characters)`);
  const alg = mode === 'CBC' ? { name: 'AES-CBC', iv } : mode === 'CTR' ? { name: 'AES-CTR', counter: iv, length: ctrBits } : { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 };
  const k = await crypto.subtle.importKey('raw', key, alg.name, false, ['encrypt', 'decrypt']);
  try { return new Uint8Array(await crypto.subtle[dir](alg, k, data)); } catch { throw new Error(dir === 'decrypt' ? 'Decryption failed: wrong key/IV, bad padding or (GCM) authentication failure' : 'Encryption failed'); }
}
T.push({
  id: 'aes-modes-demo', cat: CAT, title: 'AES CBC / CTR / GCM / ECB Demo (educational)', desc: 'EDUCATIONAL ONLY, not a vetted encryption product. Encrypt/decrypt with AES-CBC (PKCS#7), CTR, GCM (ciphertext||16-byte tag) or ECB (shown to demonstrate why ECB leaks patterns) via WebCrypto. Never reuse an IV/nonce with the same key; use a proper audited tool for real secrets.',
  labels: ['Plaintext (encrypt) or ciphertext in the chosen encoding (decrypt)'], sample: 'Attack at dawn! Attack at dawn! Attack at dawn!',
  opts: [sel('mode', 'Mode', 'CBC', ['CBC', 'CTR', 'GCM', 'ECB']), sel('dir', 'Direction', 'encrypt', ['encrypt', 'decrypt']), txt('key', 'Key (hex, 16/24/32 bytes)', '2b7e151628aed2a6abf7158809cf4f3c'), txt('iv', 'IV / counter block (hex; 16 bytes, GCM 12; ignored for ECB)', '000102030405060708090a0b0c0d0e0f'), txt('aad', 'GCM additional data (hex, optional)', ''), num('ctrbits', 'CTR counter bits', 64), sel('fmt', 'Plaintext is', 'text', ['text', 'hex']), sel('cfmt', 'Ciphertext is', 'hex', ['hex', 'base64'])],
  run: async ([s], o) => {
    const key = unhex(o.key), iv = o.iv.trim() ? unhex(o.iv) : new Uint8Array(0), aad = o.aad.trim() ? unhex(o.aad) : undefined;
    if (o.dir === 'encrypt') { const c = await aesDemo(o.mode, 'encrypt', key, iv, aad, toBytes(s, o.fmt), o.ctrbits); return o.cfmt === 'hex' ? hex(c) : b64e(c); }
    const p = await aesDemo(o.mode, 'decrypt', key, iv, aad, o.cfmt === 'hex' ? unhex(s) : b64d(s), o.ctrbits);
    let t; try { t = new TextDecoder('utf-8', { fatal: true }).decode(p); } catch { t = null; }
    return (t != null && o.fmt === 'text') ? t : hex(p);
  },
});
T.push({
  id: 'xor-one-time-pad', cat: CAT, title: 'XOR Cipher / One-Time Pad', desc: 'XOR a message with a key. A true one-time pad needs a random key at least as long as the message and never reused; shorter keys can be repeated (Vernam/XOR cipher, easily broken) or a random pad can be generated for you.',
  inputs: 2, labels: ['Message', 'Key / pad'], sample: 'ATTACK AT DAWN', sample2: 'XMCKLQWERTYUIO',
  opts: [sel('mf', 'Message is', 'text', FMT), sel('kf', 'Key is', 'text', FMT), sel('of', 'Output', 'hex', ['hex', 'base64', 'text']), chk('repeat', 'Repeat a shorter key (NOT a one-time pad)', false), chk('gen', 'Generate a random pad (ignore key input)', false)],
  run: ([m, k], o) => {
    const msg = toBytes(m, o.mf);
    const key = o.gen ? crypto.getRandomValues(new Uint8Array(msg.length)) : toBytes(k, o.kf);
    if (!key.length) throw new Error('Key is empty');
    if (key.length < msg.length && !o.repeat) throw new Error(`Key is ${key.length} bytes but the message is ${msg.length}; a one-time pad needs a key at least as long (or tick "repeat")`);
    const out = msg.map((b, i) => b ^ key[i % key.length]);
    const r = o.of === 'hex' ? hex(out) : o.of === 'base64' ? b64e(out) : dec.decode(out);
    return (o.gen ? `pad (hex): ${hex(key)}\n` : '') + r;
  },
});

const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function vig(text, key, dir, auto, beau) {
  const k = [...key.toUpperCase()].filter((c) => AZ.includes(c)).map((c) => AZ.indexOf(c));
  if (!k.length) throw new Error('Key must contain letters');
  let i = 0; const stream = [...k];
  return [...text].map((ch) => {
    const up = ch.toUpperCase(), x = AZ.indexOf(up);
    if (x < 0 || ch.length !== 1) return ch;
    const ks = stream[i++ % (auto ? Infinity : k.length)];
    const y = beau ? (ks - x + 26) % 26 : (dir === 'encrypt' ? x + ks : x - ks + 26) % 26;
    if (auto && !beau) stream.push(dir === 'encrypt' ? x : y);
    return ch === up ? AZ[y] : AZ[y].toLowerCase();
  }).join('');
}
function playfair(text, key, dir) {
  const norm = (s) => [...s.toUpperCase().replace(/J/g, 'I')].filter((c) => AZ.includes(c));
  const sq = [...new Set([...norm(key), ...norm(AZ.replace('J', ''))])], pos = (c) => [Math.floor(sq.indexOf(c) / 5), sq.indexOf(c) % 5];
  let t = norm(text);
  if (dir === 'encrypt') { const o = []; for (let i = 0; i < t.length; i++) { o.push(t[i]); if (i + 1 < t.length && t[i + 1] === t[i] && o.length % 2) o.push(t[i] === 'X' ? 'Q' : 'X'); } if (o.length % 2) o.push('X'); t = o; } else if (t.length % 2) throw new Error('Playfair ciphertext needs an even number of letters');
  const d = dir === 'encrypt' ? 1 : 4, out = [];
  for (let i = 0; i < t.length; i += 2) {
    const [r1, c1] = pos(t[i]), [r2, c2] = pos(t[i + 1]);
    if (r1 === r2) out.push(sq[r1 * 5 + (c1 + d) % 5], sq[r2 * 5 + (c2 + d) % 5]);
    else if (c1 === c2) out.push(sq[((r1 + d) % 5) * 5 + c1], sq[((r2 + d) % 5) * 5 + c2]);
    else out.push(sq[r1 * 5 + c2], sq[r2 * 5 + c1]);
  }
  return out.join('');
}
T.push({
  id: 'classical-ciphers', cat: CAT, title: 'Vigenere / Autokey / Beaufort / Playfair', desc: 'Classical ciphers for puzzles and teaching (not secure). Vigenere, Autokey, Beaufort keep case and punctuation; Playfair works on a 5x5 square (J=I) and inserts X fillers, which stay in the decrypted text.',
  labels: ['Text'], sample: 'ATTACK AT DAWN',
  opts: [sel('cipher', 'Cipher', 'vigenere', ['vigenere', 'autokey', 'beaufort', 'playfair']), sel('dir', 'Direction', 'encrypt', ['encrypt', 'decrypt']), txt('key', 'Key', 'LEMON')],
  run: ([s], o) => (o.cipher === 'playfair' ? playfair(s, o.key, o.dir) : vig(s, o.key, o.dir, o.cipher === 'autokey', o.cipher === 'beaufort')),
});

export default T;

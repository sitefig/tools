// devx.js: developer-experience tools (encoding, crypto, JSON, converters, text). Zero dependencies, client-side only.
// Ceilings: token counts are ESTIMATES (no vocab offline); zod/OpenAPI/Dockerfile parsers handle common subsets;
// YAML parsing reuses the yaml-to-json tool from data.js. Skipped on purpose: see end of file.
import data from './data.js';

const T = [];
const enc = new TextEncoder();
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => {
  s = s.trim().replace(/^0x/i, '').replace(/[\s:,]|0x/gi, '');
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
const lines = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const parseJ = (s) => { try { return JSON.parse(s); } catch (e) { throw new Error('Invalid JSON: ' + e.message); } };
const J = (v, i = 2) => JSON.stringify(v, null, i);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
const pascal = (s) => words(s).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('') || 'Field';
const camel = (s) => { const p = pascal(s); return p[0].toLowerCase() + p.slice(1); };
const snake = (s) => words(s).map((w) => w.toLowerCase()).join('_') || 'field';
const sel = (id, label, def, choices) => ({ id, label, type: 'select', def, choices });
const num = (id, label, def) => ({ id, label, type: 'number', def });
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const chk = (id, label, def) => ({ id, label, type: 'checkbox', def });
// YAML or JSON text -> value (YAML parsing is delegated to the data.js yaml-to-json tool)
const yamlOrJson = async (s) => {
  s = s.trim();
  if (s[0] === '{' || s[0] === '[') return parseJ(s);
  const t = data.find((x) => x.id === 'yaml-to-json');
  return JSON.parse(await t.run([s], { indent: 2 }));
};

// ---------------- Encoding+
T.push({
  id: 'quoted-printable', cat: 'Encoding+', title: 'Quoted-Printable Encoder / Decoder', desc: 'MIME quoted-printable (RFC 2045): encode UTF-8 text with 76-column soft line breaks, or decode it back.',
  labels: ['Text'], sample: 'Café crème = €3.50 — a long line that needs to be wrapped because quoted-printable lines may not exceed 76 characters.',
  opts: [sel('mode', 'Mode', 'encode', ['encode', 'decode'])],
  run: ([s], o) => {
    if (o.mode === 'decode') {
      s = s.replace(/[ \t]+(\r?\n)/g, '$1').replace(/=\r?\n/g, '');
      if (/=(?![0-9A-Fa-f]{2})/.test(s)) throw new Error('Invalid quoted-printable: "=" must be followed by two hex digits');
      return s.replace(/(?:=[0-9A-Fa-f]{2})+/g, (m) => new TextDecoder().decode(Uint8Array.from(m.slice(1).split('='), (h) => parseInt(h, 16))));
    }
    return s.split(/\r?\n/).map((line) => {
      const bytes = enc.encode(line), toks = [];
      bytes.forEach((b, i) => {
        const ws = b === 32 || b === 9;
        toks.push(b === 61 || b < 32 && !ws || b > 126 || (ws && i === bytes.length - 1) ? '=' + b.toString(16).toUpperCase().padStart(2, '0') : String.fromCharCode(b));
      });
      const out = []; let cur = '';
      for (const t of toks) { if (cur.length + t.length > 75) { out.push(cur + '='); cur = ''; } cur += t; }
      out.push(cur);
      return out.join('\n');
    }).join('\n');
  },
});
T.push({
  id: 'base64url-encoder', cat: 'Encoding+', title: 'Base64URL Encoder / Decoder', desc: 'URL-safe Base64 (RFC 4648 section 5): - and _ instead of + and /, no padding. Decoder accepts standard Base64 too.',
  labels: ['Text'], sample: 'subjects?_d=1&x=üÿ~', opts: [sel('mode', 'Mode', 'encode', ['encode', 'decode'])],
  run: ([s], o) => o.mode === 'decode' ? new TextDecoder('utf-8', { fatal: true }).decode(b64d(s)) : b64e(enc.encode(s), true),
});
const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', _: '..--.-', '"': '.-..-.', $: '...-..-', '@': '.--.-.' };
T.push({
  id: 'morse-code-audio', cat: 'Encoding+', title: 'Morse Code Audio Generator', desc: 'Turn text into Morse code and a playable, downloadable WAV beep track (PARIS timing, adjustable speed and pitch).',
  labels: ['Text'], sample: 'SOS CQ CQ', opts: [num('wpm', 'Speed (words per minute)', 18), num('freq', 'Tone (Hz)', 650)],
  run: ([s], o) => {
    const wpm = Math.min(60, Math.max(5, +o.wpm || 18)), freq = Math.min(2000, Math.max(200, +o.freq || 650));
    const words = s.toUpperCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) throw new Error('Enter some text');
    const m = words.map((w) => [...w].filter((c) => MORSE[c]).map((c) => MORSE[c]).join(' ')).join(' / ');
    const rate = 8000, dot = Math.round(rate * 1.2 / wpm), samples = [];
    const tone = (n) => { for (let i = 0; i < n; i++) { const env = Math.min(1, i / 40, (n - i) / 40); samples.push(Math.round(Math.sin(2 * Math.PI * freq * i / rate) * 0.6 * env * 32767)); } };
    const gap = (n) => { for (let i = 0; i < n; i++) samples.push(0); };
    m.split(' ').forEach((tok, k, a) => {
      if (tok === '/') gap(dot); // 3 + 1 + 3 = 7 units between words
      else [...tok].forEach((c, j) => { tone(c === '.' ? dot : 3 * dot); if (j < tok.length - 1) gap(dot); });
      if (k < a.length - 1) gap(3 * dot);
    });
    const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
    const w4 = (p, t) => [...t].forEach((c, i) => v.setUint8(p + i, c.charCodeAt(0)));
    w4(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w4(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w4(36, 'data'); v.setUint32(40, samples.length * 2, true);
    samples.forEach((x, i) => v.setInt16(44 + i * 2, x, true));
    return { text: `${m}\n\n${(samples.length / rate).toFixed(1)} s at ${wpm} WPM, ${freq} Hz`, blob: new Blob([buf], { type: 'audio/wav' }), filename: 'morse.wav' };
  },
});
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58enc = (u) => {
  let n = 0n; for (const b of u) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of u) { if (b) break; s = '1' + s; }
  return s;
};
const b58dec = (s) => {
  let n = 0n;
  for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error(`Invalid Base58 character "${c}"`); n = n * 58n + BigInt(i); }
  let h = n.toString(16); if (h.length % 2) h = '0' + h;
  const body = n ? unhex(h) : new Uint8Array();
  let z = 0; while (s[z] === '1') z++;
  return cat(new Uint8Array(z), body);
};
T.push({
  id: 'base58-encoder', cat: 'Encoding+', title: 'Base58 Encoder / Decoder', desc: 'Bitcoin-alphabet Base58 (no checksum) for text or hex bytes. Used by Solana addresses, IPFS CIDv0 and more.',
  labels: ['Input'], sample: 'Hello World', opts: [sel('mode', 'Mode', 'encode', ['encode', 'decode']), sel('as', 'Bytes as', 'text', ['text', 'hex'])],
  run: ([s], o) => {
    if (o.mode === 'encode') return b58enc(o.as === 'hex' ? unhex(s) : enc.encode(s));
    const u = b58dec(s.trim());
    return o.as === 'hex' ? hex(u) : new TextDecoder().decode(u);
  },
});
const CK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
T.push({
  id: 'crockford-base32-encoder', cat: 'Encoding+', title: 'Crockford Base32 Encoder / Decoder', desc: 'Crockford Base32 (no I, L, O, U; case-insensitive; O and I decode as 0 and 1) for text or hex bytes, as used by ULIDs.',
  labels: ['Input'], sample: 'Hello', opts: [sel('mode', 'Mode', 'encode', ['encode', 'decode']), sel('as', 'Bytes as', 'text', ['text', 'hex'])],
  run: ([s], o) => {
    if (o.mode === 'encode') {
      const u = o.as === 'hex' ? unhex(s) : enc.encode(s); let bits = 0, acc = 0, out = '';
      for (const b of u) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { out += CK[(acc >> (bits - 5)) & 31]; bits -= 5; } acc &= (1 << bits) - 1; }
      if (bits) out += CK[(acc << (5 - bits)) & 31];
      return out;
    }
    const clean = s.toUpperCase().replace(/[-\s]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1'); let bits = 0, acc = 0; const out = [];
    for (const c of clean) { const v = CK.indexOf(c); if (v < 0) throw new Error(`Invalid Crockford Base32 character "${c}"`); acc = (acc << 5) | v; bits += 5; if (bits >= 8) { out.push((acc >> (bits - 8)) & 255); bits -= 8; acc &= (1 << bits) - 1; } }
    const u = Uint8Array.from(out);
    return o.as === 'hex' ? hex(u) : new TextDecoder().decode(u);
  },
});
T.push({
  id: 'rot47-encoder', cat: 'Encoding+', title: 'ROT47 Encoder / Decoder', desc: 'ROT47 rotates all printable ASCII (33-126) by 47 positions. Applying it twice returns the original.',
  labels: ['Text'], sample: 'Hello, World! 123', run: ([s]) => s.replace(/[!-~]/g, (c) => String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94))),
});
T.push({
  id: 'hex-dump-viewer', cat: 'Encoding+', title: 'Hex Dump Viewer', desc: 'Classic hexdump -C style view (offset, hex bytes, ASCII) of UTF-8 text or pasted hex bytes.',
  labels: ['Input'], sample: 'Hex dump of this text: café €\n\ttabs and newlines too.', opts: [sel('as', 'Input is', 'text', ['text', 'hex']), num('width', 'Bytes per row', 16)],
  run: ([s], o) => {
    const u = o.as === 'hex' ? unhex(s) : enc.encode(s), w = Math.min(64, Math.max(4, o.width | 0 || 16)), out = [];
    for (let i = 0; i < u.length; i += w) {
      const row = u.subarray(i, i + w), h = [...row].map((b) => b.toString(16).padStart(2, '0'));
      out.push(`${i.toString(16).padStart(8, '0')}  ${h.slice(0, w / 2 | 0).join(' ').padEnd(3 * (w / 2 | 0) - 1)}  ${h.slice(w / 2 | 0).join(' ').padEnd(3 * (w - (w / 2 | 0)) - 1)}  |${[...row].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')}|`);
    }
    out.push(u.length.toString(16).padStart(8, '0'));
    return out.join('\n');
  },
});
T.push({
  id: 'ieee754-converter', cat: 'Encoding+', title: 'IEEE 754 Float / Hex Converter', desc: 'Show a number as 32-bit and 64-bit IEEE 754 hex and bits (sign, exponent, mantissa), or decode a hex pattern to a float.',
  labels: ['Number (e.g. 0.1, -3.5e10, NaN) or hex (0x3f800000 / 0x3ff0000000000000)'], sample: '0.1\n-118.625\n0x40490fdb',
  run: ([s]) => lines(s).map((l) => {
    const dv = new DataView(new ArrayBuffer(8)); let x;
    const m = /^0x([0-9a-f]+)$/i.exec(l);
    if (m) {
      if (m[1].length <= 8) { dv.setUint32(0, parseInt(m[1], 16)); x = dv.getFloat32(0); return `${l} as float32 = ${x}`; }
      if (m[1].length > 16) throw new Error('Hex pattern longer than 64 bits');
      dv.setBigUint64(0, BigInt('0x' + m[1])); return `${l} as float64 = ${dv.getFloat64(0)}`;
    }
    x = l.toLowerCase() === 'nan' ? NaN : Number(l);
    if (Number.isNaN(x) && l.toLowerCase() !== 'nan') throw new Error(`Not a number: ${l}`);
    dv.setFloat32(0, x); const b32 = dv.getUint32(0).toString(2).padStart(32, '0'), f32 = dv.getFloat32(0);
    dv.setFloat64(0, x); const b64 = dv.getBigUint64(0).toString(2).padStart(64, '0');
    return [`${l}`, `float32: 0x${parseInt(b32, 2).toString(16).padStart(8, '0')}  (stored value ${f32})`, `  bits: ${b32.slice(0, 1)} ${b32.slice(1, 9)} ${b32.slice(9)}  (sign exponent mantissa)`,
      `float64: 0x${BigInt('0b' + b64).toString(16).padStart(16, '0')}`, `  bits: ${b64.slice(0, 1)} ${b64.slice(1, 12)} ${b64.slice(12)}`].join('\n');
  }).join('\n\n'),
});
T.push({
  id: 'bcd-converter', cat: 'Encoding+', title: 'BCD (Binary-Coded Decimal) Converter', desc: 'Convert decimal numbers to packed/unpacked BCD nibbles and back.',
  labels: ['Decimal digits, or BCD bits when decoding'], sample: '2026', opts: [sel('mode', 'Mode', 'decimal to BCD', ['decimal to BCD', 'BCD to decimal'])],
  run: ([s], o) => {
    s = s.trim();
    if (o.mode === 'decimal to BCD') {
      if (!/^\d+$/.test(s)) throw new Error('Enter digits 0-9 only');
      const d = [...s].map((c) => (+c).toString(2).padStart(4, '0'));
      return `Packed BCD:   ${d.join(' ')}\nHex:          ${s.length % 2 ? '0' : ''}${s}\nUnpacked BCD: ${[...s].map((c) => '0000 ' + (+c).toString(2).padStart(4, '0')).join(' ')}`;
    }
    const b = s.replace(/\s+/g, '');
    if (!/^[01]+$/.test(b) || b.length % 4) throw new Error('Enter groups of 4 bits (0/1)');
    return b.match(/.{4}/g).map((n) => { const v = parseInt(n, 2); if (v > 9) throw new Error(`Invalid BCD nibble ${n} (${v} > 9)`); return v; }).join('');
  },
});

// ---------------- Crypto: hashes
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
const KV = { keccak256: [136, 1, 32], keccak512: [72, 1, 64], 'sha3-224': [144, 6, 28], 'sha3-256': [136, 6, 32], 'sha3-384': [104, 6, 48], 'sha3-512': [72, 6, 64] };
T.push({
  id: 'ethereum-keccak256-hasher', cat: 'Crypto', title: 'Keccak-256 / SHA-3 Hasher', desc: 'Hand-written Keccak-f[1600]: Ethereum Keccak-256 (not NIST SHA3-256), Keccak-512 and SHA3-224/256/384/512. Shows the 4-byte selector for function signatures.',
  labels: ['Text (one input per line) or hex bytes'], sample: 'transfer(address,uint256)\nhello\n',
  opts: [sel('algo', 'Algorithm', 'keccak256', Object.keys(KV)), sel('as', 'Input is', 'text', ['text', 'hex']), chk('perline', 'Hash each line separately', true)],
  run: ([s], o) => {
    const [rate, pad, len] = KV[o.algo] || KV.keccak256;
    const items = o.as === 'hex' ? [s] : o.perline ? s.split(/\r?\n/).filter((l, i, a) => l || a.length === 1) : [s];
    return items.map((it) => {
      const h = hex(sponge(o.as === 'hex' ? unhex(it) : enc.encode(it), rate, pad, len));
      return `${o.as === 'hex' ? '' : JSON.stringify(it) + '\n'}0x${h}` + (/^\w+\(.*\)$/.test(it) && o.algo === 'keccak256' ? `\nselector: 0x${h.slice(0, 8)}` : '');
    }).join('\n\n');
  },
});

// ---------------- Crypto: keys, DER, ABI
const sha = async (a, u) => new Uint8Array(await crypto.subtle.digest(a, u));
const pem = (label, der) => `-----BEGIN ${label}-----\n${b64e(der).match(/.{1,64}/g).join('\n')}\n-----END ${label}-----`;
const unpem = (s, labels) => {
  const m = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(s);
  if (!m) { if (!s.trim()) throw new Error('Paste a PEM block'); return { label: '', der: b64d(s) }; }
  if (labels && !labels.includes(m[1])) throw new Error(`Unexpected PEM type "${m[1]}" (expected ${labels.join(' / ')})`);
  return { label: m[1], der: b64d(m[2]) };
};
// minimal DER reader/writer
const dlen = (n) => (n < 128 ? [n] : n < 256 ? [0x81, n] : n < 65536 ? [0x82, n >> 8, n & 255] : [0x83, n >> 16, (n >> 8) & 255, n & 255]);
const dwrap = (tag, ...parts) => { const body = cat(...parts); return cat(Uint8Array.of(tag, ...dlen(body.length)), body); };
function dparse(b) {
  const tlv = (p) => {
    if (p + 2 > b.length) throw new Error('Truncated DER data');
    let l = b[p + 1], q = p + 2;
    if (l & 0x80) { const n = l & 0x7f; if (!n || n > 4) throw new Error('Unsupported DER length'); l = 0; for (let i = 0; i < n; i++) l = l * 256 + b[q++]; }
    if (q + l > b.length) throw new Error('Truncated or invalid DER data');
    return { tag: b[p], s: q, e: q + l };
  };
  const kids = (n) => { const r = []; for (let p = n.s; p < n.e;) { const k = tlv(p); r.push(k); p = k.e; } return r; };
  const raw = (n) => b.subarray(n.s, n.e);
  const oid = (n) => {
    const v = raw(n), r = [Math.floor(v[0] / 40), v[0] % 40]; let x = 0;
    for (const c of v.subarray(1)) { x = x * 128 + (c & 127); if (!(c & 128)) { r.push(x); x = 0; } }
    return r.join('.');
  };
  return { tlv, kids, raw, oid, root: tlv(0) };
}
const OIDN = {
  '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.5': 'serialNumber', '1.2.840.113549.1.9.1': 'emailAddress',
  '1.2.840.113549.1.1.1': 'rsaEncryption', '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption', '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption', '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption', '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption', '1.2.840.113549.1.1.10': 'RSASSA-PSS',
  '1.2.840.10045.2.1': 'id-ecPublicKey', '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256', '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384', '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512', '1.3.101.112': 'Ed25519',
  '1.2.840.10045.3.1.7': 'prime256v1 (P-256)', '1.3.132.0.34': 'secp384r1 (P-384)', '1.3.132.0.35': 'secp521r1 (P-521)',
  '1.3.6.1.5.5.7.3.1': 'serverAuth', '1.3.6.1.5.5.7.3.2': 'clientAuth', '1.3.6.1.5.5.7.3.3': 'codeSigning', '1.3.6.1.5.5.7.3.4': 'emailProtection',
};
const KUN = ['digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment', 'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly'];
T.push({
  id: 'x509-csr-decoder', cat: 'Crypto', title: 'X.509 CSR Decoder', desc: 'Decode a PEM certificate signing request (PKCS#10): subject, public key, signature algorithm, requested SANs / key usage, SHA-256 fingerprint.',
  labels: ['PEM CSR'], placeholder: ['-----BEGIN CERTIFICATE REQUEST-----\n...'], sample: `-----BEGIN CERTIFICATE REQUEST-----
MIIC2jCCAcICAQAwOTELMAkGA1UEBhMCQkUxFDASBgNVBAoMC0V4YW1wbGUgT3Jn
MRQwEgYDVQQDDAtleGFtcGxlLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCC
AQoCggEBAI93OdYJWPtIVQK8FK8MFpdZDiwr1Oz9TJpZ2q5KHTvIjmrLE1Jj/gcU
n5vlkAca0tZOf7zOIyxx7ttCDdspMBbpaTyZaRyWn+LbmpOiwoXN/6aY0qke9pq9
n79nu70qbNR5sCwztgVBFvBTNfpqHAIosKGqFLOv7ZytvXb8CqHMuP9bFA2XVkIY
vSC/jA3eo+sE79DHEkF9wACRSDCTGoqH4Iijp1tRJlcwTpYPXek4drr6ivrRMDrc
E7m4xXYB1k8hvTu6fNtSAtfP5KDfV1677PXyNZvCurl53dhzw/Q4zvJzSJwLALlL
Gg4EIdoa0E4qwK4zudePzlMYCieQnM8CAwEAAaBcMFoGCSqGSIb3DQEJDjFNMEsw
PAYDVR0RBDUwM4ILZXhhbXBsZS5jb22CD3d3dy5leGFtcGxlLmNvbYcECgAAAYEN
YUBleGFtcGxlLmNvbTALBgNVHQ8EBAMCBaAwDQYJKoZIhvcNAQELBQADggEBADSA
StTXW7oUXnEpNbUREsGQleIP8ObkBSOsKoM2SYfA0lClp4JWSM9Q9iLv3s5CXt6R
atNewGa6MmTSBZky4H8H3h62QgLu0OLOaC2jb4+Pl44NAY6AfigArYKEEAlq8yNc
X36ZLGDlUNcR+0BxK5U6G/DYt2gnIBwjdXcY+xklaXXXkGeUjhegJxukJ07NvuFo
0ZfnsjDDaizTaqHBGAUZ5+UwRrFv5d1xLp+QqRg3NVNNsTnUh1YRv61TO3ClFpbB
brODygPanpHu4EwMrkUx++uwU3+vb+X+u7/BHTQcVHe9mG9/zv9dBWRw7wHNijyL
0FNLV3p5KZ2OqwAIHsc=
-----END CERTIFICATE REQUEST-----`,
  run: async ([s]) => {
    const { der } = unpem(s, ['CERTIFICATE REQUEST', 'NEW CERTIFICATE REQUEST']);
    const { kids, raw, oid, tlv, root } = dparse(der);
    const on = (n) => { const o = oid(n); return OIDN[o] || o; };
    const str = (n) => (n.tag === 0x1e ? [...raw(n)].reduce((a, c, i, arr) => (i % 2 ? a : a + String.fromCharCode((c << 8) | arr[i + 1])), '') : new TextDecoder().decode(raw(n)));
    if (root.tag !== 0x30) throw new Error('Not a DER CSR (expected SEQUENCE)');
    const [info, sigAlg, sigBits] = kids(root), f = kids(info);
    if (f.length < 3) throw new Error('Not a CSR: CertificationRequestInfo too short');
    const subject = kids(f[1]).flatMap((set) => kids(set).map((a) => { const [o, v] = kids(a); return `${on(o)}=${str(v)}`; })).join(', ');
    const [ka, kbits] = kids(f[2]), [kalg, kparam] = kids(ka), alg = on(kalg), key = raw(kbits).subarray(1);
    let keyDesc = alg;
    if (alg === 'rsaEncryption') { const n = raw(kids(tlv(kbits.s + 1))[0]); let i = 0; while (n[i] === 0) i++; keyDesc = `RSA ${(n.length - i - 1) * 8 + 32 - Math.clz32(n[i])} bit`; }
    else if (alg === 'id-ecPublicKey') keyDesc = `EC ${kparam ? on(kparam) : '?'}`;
    const out = [`Subject: ${subject || '(empty)'}`, `Version: ${raw(f[0])[0] + 1}`, `Public key: ${keyDesc} (${key.length} bytes)`, `Signature algorithm: ${on(kids(sigAlg)[0])}`, `Signature: ${raw(sigBits).length - 1} bytes`];
    const attrs = f.find((x) => x.tag === 0xa0);
    for (const a of attrs ? kids(attrs) : []) {
      const [ao, av] = kids(a);
      if (oid(ao) === '1.2.840.113549.1.9.14') {
        for (const e of kids(kids(av)[0])) {
          const p = kids(e), id = oid(p[0]), body = tlv(p[p.length - 1].s);
          if (id === '2.5.29.17') out.push('Subject Alt Names: ' + kids(body).map((g) => { const v = raw(g); return g.tag === 0x82 ? 'DNS:' + new TextDecoder().decode(v) : g.tag === 0x81 ? 'email:' + new TextDecoder().decode(v) : g.tag === 0x86 ? 'URI:' + new TextDecoder().decode(v) : g.tag === 0x87 ? 'IP:' + (v.length === 4 ? [...v].join('.') : hex(v).match(/..../g).join(':')) : `other(0x${g.tag.toString(16)})`; }).join(', '));
          else if (id === '2.5.29.15') { const u = raw(body), bits = (u[1] << 8) | (u[2] || 0); out.push('Key Usage: ' + KUN.filter((_, k) => bits & (0x8000 >> k)).join(', ')); }
          else if (id === '2.5.29.37') out.push('Extended Key Usage: ' + kids(body).map(on).join(', '));
          else if (id === '2.5.29.19') out.push('Basic Constraints: CA=' + (kids(body)[0]?.tag === 1 && raw(kids(body)[0])[0] === 0xff ? 'TRUE' : 'FALSE'));
          else out.push(`Extension ${OIDN[id] || id}: ${raw(p[p.length - 1]).length} bytes`);
        }
      } else out.push(`Attribute ${OIDN[oid(ao)] || oid(ao)}`);
    }
    out.push('SHA-256 fingerprint: ' + hex(await sha('SHA-256', der)).toUpperCase().replace(/../g, '$&:').slice(0, -1), 'Signature is not verified (decode only).');
    return out.join('\n');
  },
});
const ALGID_RSA = Uint8Array.from([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
T.push({
  id: 'rsa-pkcs1-pkcs8-converter', cat: 'Crypto', title: 'RSA PKCS#1 / PKCS#8 PEM Converter', desc: 'Convert RSA keys between PKCS#1 (BEGIN RSA PRIVATE/PUBLIC KEY) and PKCS#8 / SPKI (BEGIN PRIVATE/PUBLIC KEY). Auto-detects direction.',
  labels: ['PEM key'], sample: `-----BEGIN RSA PUBLIC KEY-----
MIGJAoGBAMNUix6HTQQA0m+vzBxYdKxrCM8qGp9avWZh7WPPbarBbEidjTXnnQWq
o2BuaWMcwCiIBKAdL5bqvv6GJ+mgUTudMnPmNFobo3Pf9RPl7eGS72D0ubLmJvSz
NprZdr/sbo4nH6T+Fb9o/as+cvPx4yBW58sVszAIIbVn6uAc6+y7AgMBAAE=
-----END RSA PUBLIC KEY-----`,
  run: ([s]) => {
    const { label, der } = unpem(s, ['RSA PRIVATE KEY', 'PRIVATE KEY', 'RSA PUBLIC KEY', 'PUBLIC KEY']);
    const D = dparse(der);
    if (label === 'RSA PRIVATE KEY') return pem('PRIVATE KEY', dwrap(0x30, Uint8Array.of(2, 1, 0), ALGID_RSA, dwrap(4, der)));
    if (label === 'RSA PUBLIC KEY') return pem('PUBLIC KEY', dwrap(0x30, ALGID_RSA, dwrap(3, Uint8Array.of(0), der)));
    const k = D.kids(D.root);
    if (label === 'PRIVATE KEY') {
      if (D.oid(D.kids(k[1])[0]) !== '1.2.840.113549.1.1.1') throw new Error('Not an RSA key (only RSA can be written as PKCS#1)');
      return pem('RSA PRIVATE KEY', D.raw(k[2]));
    }
    if (D.oid(D.kids(k[0])[0]) !== '1.2.840.113549.1.1.1') throw new Error('Not an RSA key (only RSA can be written as PKCS#1)');
    return pem('RSA PUBLIC KEY', D.raw(k[1]).subarray(1));
  },
});
const sshStr = (u) => cat(Uint8Array.of(u.length >>> 24, (u.length >> 16) & 255, (u.length >> 8) & 255, u.length & 255), u);
T.push({
  id: 'ed25519-key-generator', cat: 'Crypto', title: 'Ed25519 Key Pair Generator', desc: 'Generate an Ed25519 key pair with WebCrypto: PKCS#8 private PEM, SPKI public PEM, OpenSSH public key line and raw hex. Keys never leave your browser.',
  inputs: 0, sample: '',
  run: async () => {
    let kp;
    try { kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']); }
    catch { throw new Error('This browser does not support Ed25519 in WebCrypto (try a current Chrome, Edge, Firefox 129+ or Safari 17+).'); }
    const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey)), spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));
    const pub = spki.subarray(spki.length - 32), seed = priv.subarray(priv.length - 32);
    return [pem('PRIVATE KEY', priv), pem('PUBLIC KEY', spki), `ssh-ed25519 ${b64e(cat(sshStr(enc.encode('ssh-ed25519')), sshStr(pub)))}`, `private seed (hex): ${hex(seed)}`, `public key (hex):   ${hex(pub)}`].join('\n\n');
  },
});
T.push({
  id: 'rsa-key-pair-generator', cat: 'Crypto', title: 'RSA Key Pair Generator', desc: 'Generate an RSA key pair with WebCrypto: PKCS#8 private key and SPKI public key as PEM (optional PKCS#1 format). Nothing is uploaded.',
  inputs: 0, sample: '', opts: [sel('bits', 'Key size', '2048', ['2048', '3072', '4096']), sel('fmt', 'Private key format', 'PKCS#8', ['PKCS#8', 'PKCS#1'])],
  run: async (_, o) => {
    const kp = await crypto.subtle.generateKey({ name: 'RSA-PSS', modulusLength: +o.bits, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey)), pub = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));
    // WebCrypto labels RSA-PSS keys with the RSASSA-PSS OID; rewrite to plain rsaEncryption so tools like openssl/ssh treat it as a generic RSA key
    const D = dparse(priv), pk = D.raw(D.kids(D.root)[2]);
    const P = dparse(pub), pbits = P.raw(P.kids(P.root)[1]).subarray(1);
    const out = o.fmt === 'PKCS#1' ? pem('RSA PRIVATE KEY', pk) : pem('PRIVATE KEY', dwrap(0x30, Uint8Array.of(2, 1, 0), ALGID_RSA, dwrap(4, pk)));
    return `${out}\n\n${pem('PUBLIC KEY', dwrap(0x30, ALGID_RSA, dwrap(3, Uint8Array.of(0), pbits)))}`;
  },
});
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
T.push({
  id: 'pkce-generator', cat: 'Crypto', title: 'PKCE Generator (OAuth code_verifier / challenge)', desc: 'Generate an RFC 7636 code_verifier, its S256 code_challenge, plus random state and nonce. Paste your own verifier to compute its challenge.',
  inputs: 1, labels: ['Existing code_verifier (optional)'], sample: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', opts: [num('len', 'Verifier length (43-128)', 64)],
  run: async ([s], o) => {
    let v = s.trim();
    if (v) { if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(v)) throw new Error('code_verifier must be 43-128 characters from A-Z a-z 0-9 - . _ ~'); }
    else { const n = Math.min(128, Math.max(43, o.len | 0 || 64)), al = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'; v = [...rand(n)].map((b) => al[b % 66]).join(''); }
    return `code_verifier=${v}\ncode_challenge=${b64e(await sha('SHA-256', enc.encode(v)), true)}\ncode_challenge_method=S256\nstate=${b64e(rand(16), true)}\nnonce=${b64e(rand(16), true)}`;
  },
});
// MD5 (needed for apr1; not in WebCrypto)
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
const ITOA = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function apr1(pw, salt) {
  const P = enc.encode(pw), S = enc.encode(salt), magic = enc.encode('$apr1$');
  let alt = md5(cat(P, S, P)), ctx = cat(P, magic, S);
  for (let n = P.length; n > 0; n -= 16) ctx = cat(ctx, alt.subarray(0, Math.min(16, n)));
  for (let i = P.length; i; i >>= 1) ctx = cat(ctx, i & 1 ? Uint8Array.of(0) : P.subarray(0, 1));
  let f = md5(ctx);
  for (let i = 0; i < 1000; i++) f = md5(cat(i & 1 ? P : f, i % 3 ? S : new Uint8Array(), i % 7 ? P : new Uint8Array(), i & 1 ? f : P));
  const to64 = (v, n) => { let s = ''; for (; n > 0; n--, v >>= 6) s += ITOA[v & 63]; return s; };
  return `$apr1$${salt}$` + to64((f[0] << 16) | (f[6] << 8) | f[12], 4) + to64((f[1] << 16) | (f[7] << 8) | f[13], 4) + to64((f[2] << 16) | (f[8] << 8) | f[14], 4) + to64((f[3] << 16) | (f[9] << 8) | f[15], 4) + to64((f[4] << 16) | (f[10] << 8) | f[5], 4) + to64(f[11], 2);
}
T.push({
  id: 'htpasswd-generator', cat: 'Crypto', title: 'htpasswd Generator (apr1 / SHA-1)', desc: 'Create Apache/nginx .htpasswd lines from user:password pairs with apr1 (MD5) or {SHA}. For bcrypt use the bcrypt-generator tool.',
  labels: ['One user:password per line'], sample: 'alice:s3cret\nbob:hunter2', opts: [sel('algo', 'Algorithm', 'apr1 (MD5)', ['apr1 (MD5)', '{SHA} (SHA-1)']), txt('salt', 'Salt for apr1 (empty = random)', '')],
  run: async ([s], o) => {
    const out = [];
    for (const l of lines(s)) {
      const i = l.indexOf(':'); if (i < 1) throw new Error(`Line must look like user:password -> "${l}"`);
      const u = l.slice(0, i), p = l.slice(i + 1);
      if (o.algo.startsWith('{SHA}')) out.push(`${u}:{SHA}${b64e(await sha('SHA-1', enc.encode(p)))}`);
      else { const salt = o.salt.trim() ? o.salt.trim().slice(0, 8) : [...rand(8)].map((b) => ITOA[b & 63]).join(''); out.push(`${u}:${apr1(p, salt)}`); }
    }
    return out.join('\n');
  },
});
T.push({
  id: 'pbkdf2-key-derivation', cat: 'Crypto', title: 'PBKDF2 Key Derivation', desc: 'Derive a key from a password with PBKDF2 (WebCrypto) using SHA-1/256/384/512; output as hex and Base64.',
  labels: ['Password'], sample: 'password', opts: [txt('salt', 'Salt (text)', 'salt'), num('iter', 'Iterations', 100000), num('len', 'Output bytes', 32), sel('hash', 'Hash', 'SHA-256', ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'])],
  run: async ([s], o) => {
    const n = Math.min(1024, Math.max(1, o.len | 0 || 32));
    const k = await crypto.subtle.importKey('raw', enc.encode(s), 'PBKDF2', false, ['deriveBits']);
    const u = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(o.salt), iterations: Math.max(1, o.iter | 0), hash: o.hash }, k, n * 8));
    return `hex:    ${hex(u)}\nbase64: ${b64e(u)}`;
  },
});
const uuidStr = (u) => hex(u).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
T.push({
  id: 'uuid-v5-generator', cat: 'Crypto', title: 'UUID v5 / v3 Name-Based Generator', desc: 'Deterministic UUIDs from a namespace and name (RFC 9562): v5 uses SHA-1, v3 uses MD5. One name per line.',
  labels: ['Names, one per line'], sample: 'python.org\nexample.com', opts: [sel('ver', 'Version', '5', ['5', '3']), sel('ns', 'Namespace', 'DNS', ['DNS', 'URL', 'OID', 'X500', 'custom UUID']), txt('custom', 'Custom namespace UUID', '')],
  run: async ([s], o) => {
    const NS = { DNS: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', URL: '6ba7b811-9dad-11d1-80b4-00c04fd430c8', OID: '6ba7b812-9dad-11d1-80b4-00c04fd430c8', X500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8' };
    const nsS = o.ns === 'custom UUID' ? o.custom.trim() : NS[o.ns];
    if (!/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(nsS)) throw new Error('Namespace must be a UUID');
    const nsB = unhex(nsS.replace(/-/g, ''));
    const out = [];
    for (const l of s.split(/\r?\n/).filter(Boolean)) {
      const h = o.ver === '3' ? md5(cat(nsB, enc.encode(l))) : (await sha('SHA-1', cat(nsB, enc.encode(l)))).slice(0, 16);
      h[6] = (h[6] & 15) | (+o.ver << 4); h[8] = (h[8] & 63) | 128; out.push(`${uuidStr(h)}  ${l}`);
    }
    return out.join('\n');
  },
});
T.push({
  id: 'uuid-v7-timestamp-extractor', cat: 'Crypto', title: 'UUID v7 / v1 Timestamp Extractor', desc: 'Read the embedded creation time (and version, variant) from UUIDs. v7 stores Unix milliseconds, v1/v6 store 100 ns ticks since 1582.',
  labels: ['UUIDs, one per line'], sample: '017f22e2-79b0-7cc3-98c4-dc0c0c07398f\nc232ab00-9414-11ec-b3c8-9f6bdeced846',
  run: ([s]) => lines(s).map((l) => {
    const h = l.replace(/[-{}]/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(h)) throw new Error(`Not a UUID: ${l}`);
    const ver = parseInt(h[12], 16), variant = parseInt(h[16], 16) >> 2 === 2 ? 'RFC 4122/9562' : 'other';
    let ms = null;
    if (ver === 7) ms = Number(BigInt('0x' + h.slice(0, 12)));
    else if (ver === 1 || ver === 6) {
      const t = ver === 1 ? BigInt('0x' + h.slice(13, 16) + h.slice(8, 12) + h.slice(0, 8)) : BigInt('0x' + h.slice(0, 12) + h.slice(13, 16));
      ms = Number(t / 10000n - 12219292800000n);
    }
    return `${l}\n  version ${ver}, variant ${variant}` + (ms === null ? '\n  no embedded timestamp for this version' : `\n  time: ${new Date(ms).toISOString()}  (${ms} ms)`);
  }).join('\n'),
});
T.push({
  id: 'ssh-key-inspector', cat: 'Crypto', title: 'SSH Public Key Inspector', desc: 'Parse an OpenSSH public key line: type, size, comment and the SHA-256 / MD5 fingerprints shown by ssh-keygen -l.',
  labels: ['ssh-ed25519 AAAA... comment'], sample: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl user@host',
  run: async ([s]) => {
    const out = [];
    for (const l of lines(s)) {
      const [type, b, ...c] = l.split(/\s+/);
      if (!b) throw new Error('Expected "type base64 [comment]"');
      const u = b64d(b), parts = []; let p = 0;
      while (p + 4 <= u.length) { const n = new DataView(u.buffer, u.byteOffset).getUint32(p); parts.push(u.subarray(p + 4, p + 4 + n)); p += 4 + n; }
      if (new TextDecoder().decode(parts[0]) !== type) throw new Error('Key blob type does not match the key type');
      let size = '';
      if (type === 'ssh-rsa') { const n = parts[2]; let i = 0; while (n[i] === 0) i++; size = `${(n.length - i - 1) * 8 + 32 - Math.clz32(n[i])} bit`; }
      else if (type === 'ssh-ed25519') size = '256 bit'; else if (type.startsWith('ecdsa-sha2-')) size = type.slice(11);
      out.push(`Type: ${type}${size ? `\nSize: ${size}` : ''}\nComment: ${c.join(' ') || '(none)'}\nSHA256:${b64e(await sha('SHA-256', u)).replace(/=+$/, '')}\nMD5:${hex(md5(u)).replace(/../g, '$&:').slice(0, -1)}`);
    }
    return out.join('\n\n');
  },
});

// ---- Solana + ABI
const P25519 = 2n ** 255n - 19n;
const pw = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };
function onCurve(u) { // ed25519 point decompression check
  const b = Uint8Array.from(u); b[31] &= 0x7f;
  let y = 0n; for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(b[i]);
  if (y >= P25519) return false;
  const d = (P25519 - 121665n * pw(121666n, P25519 - 2n, P25519) % P25519) % P25519, y2 = y * y % P25519;
  const x2 = (y2 - 1n + P25519) % P25519 * pw((d * y2 + 1n) % P25519, P25519 - 2n, P25519) % P25519;
  return x2 === 0n ? !(u[31] & 0x80) : pw(x2, (P25519 - 1n) / 2n, P25519) === 1n;
}
T.push({
  id: 'solana-address-validator', cat: 'Crypto', title: 'Solana Address Validator', desc: 'Validate Solana public keys: Base58 alphabet, 32-byte length, and whether the key lies on the ed25519 curve (wallet) or off it (PDA).',
  labels: ['Addresses, one per line'], sample: '11111111111111111111111111111111\nTokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA\nnot-an-address',
  run: ([s]) => lines(s).map((l) => {
    let u; try { u = b58dec(l); } catch (e) { return `INVALID  ${l}\n  ${e.message}`; }
    if (u.length !== 32) return `INVALID  ${l}\n  decodes to ${u.length} bytes, need 32`;
    return `VALID    ${l}\n  32 bytes, ${onCurve(u) ? 'on the ed25519 curve (can be a wallet / signer)' : 'off the curve (program-derived address, PDA, cannot sign)'}`;
  }).join('\n'),
});
// ABI encoding (head/tail layout), supports uintN/intN/address/bool/bytesN/bytes/string/T[]/T[k]/tuples
function splitTop(s) { const out = []; let d = 0, cur = ''; for (const c of s) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && !d) { out.push(cur); cur = ''; } else cur += c; } if (cur.trim() || out.length) out.push(cur); return out.map((x) => x.trim()); }
function aType(t) {
  let m;
  if ((m = /^(.*)\[(\d*)\]$/.exec(t))) { const el = aType(m[1]); return { k: 'arr', el, n: m[2] === '' ? null : +m[2], dyn: m[2] === '' || el.dyn, t: `${el.t}[${m[2]}]` }; }
  if (t[0] === '(' && t.endsWith(')')) { const c = splitTop(t.slice(1, -1)).filter(Boolean).map(aType); return { k: 'tup', c, dyn: c.some((x) => x.dyn), t: `(${c.map((x) => x.t).join(',')})` }; }
  if (t === 'string' || t === 'bytes') return { k: t, dyn: true, t };
  if ((m = /^(u?int)(\d*)$/.exec(t))) { const b = +(m[2] || 256); if (b % 8 || b < 8 || b > 256) throw new Error(`Bad type ${t}`); return { k: m[1], b, dyn: false, t: m[1] + b }; }
  if ((m = /^bytes(\d+)$/.exec(t))) { if (+m[1] < 1 || +m[1] > 32) throw new Error(`Bad type ${t}`); return { k: 'fb', n: +m[1], dyn: false, t }; }
  if (t === 'address' || t === 'bool') return { k: t, dyn: false, t };
  throw new Error(`Unsupported ABI type "${t}"`);
}
const word = (n) => { const b = new Uint8Array(32); let x = BigInt.asUintN(256, n); for (let i = 31; i >= 0; i--) { b[i] = Number(x & 255n); x >>= 8n; } return b; };
const padR = (u) => cat(u, new Uint8Array((32 - (u.length % 32)) % 32));
function aEnc(ty, v) {
  switch (ty.k) {
    case 'uint': case 'int': { const n = BigInt(v); const lo = ty.k === 'uint' ? 0n : -(1n << BigInt(ty.b - 1)), hi = ty.k === 'uint' ? (1n << BigInt(ty.b)) - 1n : (1n << BigInt(ty.b - 1)) - 1n; if (n < lo || n > hi) throw new Error(`${v} out of range for ${ty.t}`); return word(n); }
    case 'bool': return word(v === true || v === 'true' || v === 1 ? 1n : 0n);
    case 'address': { if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`Bad address ${v}`); return cat(new Uint8Array(12), unhex(v)); }
    case 'fb': { const u = unhex(String(v)); if (u.length !== ty.n) throw new Error(`${ty.t} needs ${ty.n} bytes`); return padR(u); }
    case 'bytes': { const u = unhex(String(v)); return cat(word(BigInt(u.length)), padR(u)); }
    case 'string': { const u = enc.encode(String(v)); return cat(word(BigInt(u.length)), padR(u)); }
    case 'arr': { if (!Array.isArray(v)) throw new Error(`Expected array for ${ty.t}`); if (ty.n !== null && v.length !== ty.n) throw new Error(`${ty.t} needs ${ty.n} items`); const body = aEncSeq(v.map(() => ty.el), v); return ty.n === null ? cat(word(BigInt(v.length)), body) : body; }
    case 'tup': if (!Array.isArray(v) || v.length !== ty.c.length) throw new Error(`Tuple ${ty.t} needs ${ty.c.length} values`); return aEncSeq(ty.c, v);
  }
}
const aHead = (ty) => (ty.dyn ? 32 : ty.k === 'tup' ? ty.c.reduce((a, c) => a + aHead(c), 0) : ty.k === 'arr' ? ty.n * aHead(ty.el) : 32);
function aEncSeq(types, vals) {
  const heads = [], tails = []; let off = types.reduce((a, t) => a + aHead(t), 0);
  types.forEach((t, i) => { const e = aEnc(t, vals[i]); if (t.dyn) { heads.push(word(BigInt(off))); tails.push(e); off += e.length; } else heads.push(e); });
  return cat(...heads, ...tails);
}
function aDec(ty, u, base, p) { // returns [value, nextHeadPos]
  const rd = (q) => { if (q + 32 > u.length) throw new Error('Data too short'); return u.subarray(q, q + 32); };
  const big = (q) => BigInt('0x' + hex(rd(q)));
  const off = () => { const o = Number(big(p)); return base + o; };
  switch (ty.k) {
    case 'uint': return [big(p).toString(), p + 32];
    case 'int': return [BigInt.asIntN(ty.b, big(p)).toString(), p + 32];
    case 'bool': return [big(p) !== 0n, p + 32];
    case 'address': return ['0x' + hex(rd(p).subarray(12)), p + 32];
    case 'fb': return ['0x' + hex(rd(p).subarray(0, ty.n)), p + 32];
    case 'bytes': case 'string': { const q = off(), n = Number(big(q)); if (q + 32 + n > u.length) throw new Error('Data too short'); const b = u.subarray(q + 32, q + 32 + n); return [ty.k === 'bytes' ? '0x' + hex(b) : new TextDecoder().decode(b), p + 32]; }
    case 'arr': {
      let q = ty.dyn ? off() : p, n = ty.n, np = ty.dyn ? p + 32 : null;
      if (ty.n === null) { n = Number(big(q)); q += 32; }
      const r = []; let pos = q;
      for (let i = 0; i < n; i++) { const [v, nx] = aDec(ty.el, u, q, pos); r.push(v); pos = nx; }
      return [r, np ?? pos];
    }
    case 'tup': { const q = ty.dyn ? off() : p; const r = []; let pos = q; for (const c of ty.c) { const [v, nx] = aDec(c, u, q, pos); r.push(v); pos = nx; } return [r, ty.dyn ? p + 32 : pos]; }
  }
}
T.push({
  id: 'abi-encoder-decoder', cat: 'Crypto', title: 'Solidity ABI Encoder / Decoder', desc: 'Encode values or decode calldata with the Ethereum ABI: uintN/intN, address, bool, bytesN, bytes, string, arrays and tuples. Accepts a function signature to add the 4-byte selector.',
  inputs: 2, labels: ['Types or signature, e.g. transfer(address,uint256)', 'Values as JSON array (encode) or hex data (decode)'], sample: 'transfer(address,uint256)', sample2: '["0x000000000000000000000000000000000000dEaD", "1000000000000000000"]',
  opts: [sel('mode', 'Mode', 'encode', ['encode', 'decode']), chk('selector', 'Data starts with a 4-byte selector (decode)', true)],
  run: ([sig, val], o) => {
    sig = sig.trim(); let name = '', inner = sig;
    const m = /^([A-Za-z_$][\w$]*)\((.*)\)$/s.exec(sig);
    if (m) { name = m[1]; inner = m[2]; }
    const types = splitTop(inner).filter((x, i, a) => x || a.length > 1).map(aType);
    const selector = name ? hex(keccak256(enc.encode(`${name}(${types.map((t) => t.t).join(',')})`))).slice(0, 8) : '';
    if (o.mode === 'encode') {
      const body = aEncSeq(types, parseJ(val));
      return (selector ? `selector: 0x${selector}\n\n0x${selector}${hex(body)}\n\nwords:\n` : '0x' + hex(body) + '\n\nwords:\n') + (hex(body).match(/.{1,64}/g) || []).join('\n');
    }
    let u = unhex(val);
    if (o.selector && name) { if (hex(u.subarray(0, 4)) !== selector) throw new Error(`Selector mismatch: data has 0x${hex(u.subarray(0, 4))}, signature gives 0x${selector}`); u = u.subarray(4); }
    else if (o.selector && !name && u.length % 32 === 4) u = u.subarray(4);
    let pos = 0; const out = types.map((t) => { const [v, np] = aDec(t, u, 0, pos); pos = np; return v; });
    return J(out);
  },
});

// ---------------- JSON+
const ptrEsc = (t) => String(t).replace(/~/g, '~0').replace(/\//g, '~1');
const ptrTok = (p) => {
  if (p === '' || p === '#') return [];
  if (p[0] === '#') p = decodeURIComponent(p.slice(1));
  if (p[0] !== '/') throw new Error(`Pointer "${p}" must be empty or start with "/"`);
  return p.slice(1).split('/').map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
};
const isIdx = (t) => /^(0|[1-9]\d*)$/.test(t);
function ptrGet(doc, toks) {
  let c = doc;
  for (const t of toks) {
    if (Array.isArray(c)) { if (!isIdx(t) || +t >= c.length) throw new Error(`array index "${t}" out of range`); c = c[+t]; }
    else if (isObj(c)) { if (!Object.hasOwn(c, t)) throw new Error(`key "${t}" not found`); c = c[t]; }
    else throw new Error(`cannot descend into ${c === null ? 'null' : typeof c} with "${t}"`);
  }
  return c;
}
const canon = (v) => JSON.stringify(v, (k, x) => (isObj(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const deq = (a, b) => canon(a) === canon(b);
T.push({
  id: 'json-pointer-tester', cat: 'JSON+', title: 'JSON Pointer Tester (RFC 6901)', desc: 'Evaluate JSON Pointers (/a/0/b, URI fragments like #/a%20b) against a document. Handles ~0 and ~1 escapes and shows the escaped form.',
  inputs: 2, labels: ['JSON document', 'Pointers, one per line'], sample: '{"users":[{"name":"Ann","a/b":1},{"name":"Bob"}],"m~n":8,"":"empty key"}', sample2: '/users/0/name\n/users/0/a~1b\n/m~0n\n/\n/users/-\n/users/5',
  run: ([d, p]) => {
    const doc = parseJ(d);
    return p.split(/\r?\n/).filter((l, i, a) => l !== '' || a.length === 1).map((l) => {
      try { const toks = ptrTok(l.trim()), v = ptrGet(doc, toks); return `${l}\n  = ${JSON.stringify(v)}${typeof v === 'object' && v ? '' : ''}\n  tokens: ${JSON.stringify(toks)}  canonical: ${toks.map((t) => '/' + ptrEsc(t)).join('') || '(root)'}`; }
      catch (e) { return `${l}\n  ERROR: ${e.message}`; }
    }).join('\n\n');
  },
});
function diffPatch(a, b, path, ops) {
  if (deq(a, b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) diffPatch(a[i], b[i], `${path}/${i}`, ops);
    for (let i = a.length - 1; i >= n; i--) ops.push({ op: 'remove', path: `${path}/${i}` });
    for (let i = n; i < b.length; i++) ops.push({ op: 'add', path: `${path}/${i}`, value: b[i] });
  } else if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a)) if (!Object.hasOwn(b, k)) ops.push({ op: 'remove', path: `${path}/${ptrEsc(k)}` });
    for (const k of Object.keys(b)) {
      if (!Object.hasOwn(a, k)) ops.push({ op: 'add', path: `${path}/${ptrEsc(k)}`, value: b[k] });
      else diffPatch(a[k], b[k], `${path}/${ptrEsc(k)}`, ops);
    }
  } else ops.push({ op: 'replace', path, value: b });
}
function applyPatch(doc, patch) {
  if (!Array.isArray(patch)) throw new Error('A JSON Patch must be an array of operations');
  let root = structuredClone(doc);
  const parent = (toks) => ({ par: ptrGet(root, toks.slice(0, -1)), key: toks[toks.length - 1] });
  const add = (toks, v) => {
    if (!toks.length) { root = v; return; }
    const { par, key } = parent(toks);
    if (Array.isArray(par)) { const i = key === '-' ? par.length : isIdx(key) ? +key : NaN; if (!(i <= par.length)) throw new Error(`bad array index "${key}"`); par.splice(i, 0, v); }
    else if (isObj(par)) par[key] = v; else throw new Error('parent is not a container');
  };
  const rem = (toks) => {
    if (!toks.length) throw new Error('cannot remove the document root');
    const { par, key } = parent(toks); ptrGet(root, toks);
    if (Array.isArray(par)) par.splice(+key, 1); else delete par[key];
  };
  patch.forEach((o, n) => {
    try {
      if (!isObj(o) || typeof o.path !== 'string') throw new Error('operation needs "op" and "path"');
      const t = ptrTok(o.path);
      switch (o.op) {
        case 'add': add(t, structuredClone(o.value)); break;
        case 'remove': rem(t); break;
        case 'replace': { ptrGet(root, t); if (!t.length) root = structuredClone(o.value); else { const { par, key } = parent(t); par[key] = structuredClone(o.value); } break; }
        case 'move': { const f = ptrTok(o.from), v = ptrGet(root, f); if (o.path.startsWith(o.from + '/')) throw new Error('cannot move into own child'); rem(f); add(t, v); break; }
        case 'copy': add(t, structuredClone(ptrGet(root, ptrTok(o.from)))); break;
        case 'test': if (!deq(ptrGet(root, t), o.value)) throw new Error('test failed: value differs'); break;
        default: throw new Error(`unknown op "${o.op}"`);
      }
    } catch (e) { throw new Error(`Operation #${n + 1} (${o?.op} ${o?.path}): ${e.message}`); }
  });
  return root;
}
T.push({
  id: 'json-patch-generator', cat: 'JSON+', title: 'JSON Patch Generator (RFC 6902 diff)', desc: 'Compare an original and a modified JSON document and produce the add / remove / replace operations that turn one into the other.',
  inputs: 2, labels: ['Original JSON', 'Modified JSON'], sample: '{"name":"Ann","tags":["a","b","c"],"address":{"city":"Gent","zip":"9000"},"old":true}', sample2: '{"name":"Anna","tags":["a","x"],"address":{"city":"Gent","zip":"9000","country":"BE"}}',
  run: ([a, b]) => { const ops = []; diffPatch(parseJ(a), parseJ(b), '', ops); return ops.length ? J(ops) : '[]  (documents are identical)'; },
});
T.push({
  id: 'json-patch-applier', cat: 'JSON+', title: 'JSON Patch Applier (RFC 6902)', desc: 'Apply a JSON Patch (add, remove, replace, move, copy, test) to a document. The error names the failing operation.',
  inputs: 2, labels: ['JSON document', 'JSON Patch'], sample: '{"name":"Ann","tags":["a","b"],"n":1}', sample2: '[{"op":"test","path":"/n","value":1},{"op":"replace","path":"/name","value":"Anna"},{"op":"add","path":"/tags/-","value":"c"},{"op":"move","from":"/n","path":"/count"}]',
  run: ([d, p]) => J(applyPatch(parseJ(d), parseJ(p))),
});
const flatten = (v, delim, brackets, p = '', out = {}) => {
  if (Array.isArray(v) && v.length) v.forEach((x, i) => flatten(x, delim, brackets, brackets ? `${p}[${i}]` : p ? `${p}${delim}${i}` : String(i), out));
  else if (isObj(v) && Object.keys(v).length) for (const [k, x] of Object.entries(v)) flatten(x, delim, brackets, p ? `${p}${delim}${k}` : k, out);
  else out[p] = v;
  return out;
};
T.push({
  id: 'json-flatten-unflatten', cat: 'JSON+', title: 'JSON Flatten / Unflatten', desc: 'Flatten nested JSON to dotted keys (a.b[0].c) or rebuild the nested structure from flat keys.',
  labels: ['JSON'], sample: '{"user":{"name":"Ann","emails":["a@x.io","b@x.io"],"address":{"city":"Gent"}},"active":true,"empty":{}}',
  opts: [sel('mode', 'Mode', 'flatten', ['flatten', 'unflatten']), txt('delim', 'Delimiter', '.'), chk('brackets', 'Array indexes as [0]', true)],
  run: ([s], o) => {
    const v = parseJ(s), d = o.delim || '.';
    if (o.mode === 'flatten') return J(flatten(v, d, o.brackets));
    if (!isObj(v)) throw new Error('Unflatten needs a JSON object of flat keys');
    const root = {};
    for (const [key, val] of Object.entries(v)) {
      const toks = []; const re = new RegExp(`\\[(\\d+)\\]|([^\\[\\]${d.replace(/[\]\\^-]/g, '\\$&')}]+)|${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'); let m;
      while ((m = re.exec(key))) { if (m[1] !== undefined) toks.push(+m[1]); else if (m[2] !== undefined) toks.push(/^\d+$/.test(m[2]) && toks.length && !o.brackets ? +m[2] : m[2]); }
      if (!toks.length) { toks.push(key); }
      let c = root;
      toks.forEach((t, i) => {
        if (i === toks.length - 1) { c[t] = val; return; }
        if (c[t] === undefined || typeof c[t] !== 'object' || c[t] === null) c[t] = typeof toks[i + 1] === 'number' ? [] : {};
        c = c[t];
      });
    }
    return J(root);
  },
});
// ---- shape inference shared by GraphQL / SQL / models
function shapeOf(v) {
  if (v === null) return { k: 'null' };
  if (Array.isArray(v)) return { k: 'arr', e: v.map(shapeOf).reduce(mergeShape, null) };
  if (isObj(v)) return { k: 'obj', f: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, { s: shapeOf(x), opt: false }])) };
  return { k: typeof v === 'string' ? 'str' : typeof v === 'boolean' ? 'bool' : Number.isInteger(v) ? 'int' : 'num' };
}
function mergeShape(a, b) {
  if (!a) return b; if (!b) return a;
  if (a.k === 'null') return b.k === 'null' ? a : { ...b, n: true };
  if (b.k === 'null') return { ...a, n: true };
  const n = a.n || b.n || undefined;
  if (a.k === b.k) {
    if (a.k === 'obj') {
      const f = {};
      for (const k of new Set([...Object.keys(a.f), ...Object.keys(b.f)])) {
        const x = a.f[k], y = b.f[k];
        f[k] = x && y ? { s: mergeShape(x.s, y.s), opt: x.opt || y.opt } : { s: (x || y).s, opt: true };
      }
      return { k: 'obj', f, n };
    }
    if (a.k === 'arr') return { k: 'arr', e: mergeShape(a.e, b.e), n };
    return { ...a, n };
  }
  if ((a.k === 'int' && b.k === 'num') || (a.k === 'num' && b.k === 'int')) return { k: 'num', n };
  return { k: 'any', n };
}
const singular = (s) => (/ies$/i.test(s) ? s.slice(0, -3) + 'y' : /(ss|us)$/i.test(s) ? s : /s$/i.test(s) && s.length > 2 ? s.slice(0, -1) : s);
T.push({
  id: 'json-to-graphql-query', cat: 'JSON+', title: 'JSON to GraphQL Query / Schema', desc: 'Build a GraphQL query selection set from a sample JSON response, or infer GraphQL SDL types from it.',
  labels: ['Sample JSON response (root object or {"data":{...}})'], sample: '{"data":{"user":{"id":1,"name":"Ann","active":true,"score":9.5,"posts":[{"id":10,"title":"Hi","tags":["a"],"author":{"id":1,"name":"Ann"}}]}}}',
  opts: [sel('mode', 'Output', 'query', ['query', 'schema (SDL types)']), txt('name', 'Operation / root type name', 'GetData')],
  run: ([s], o) => {
    let v = parseJ(s); if (isObj(v) && Object.keys(v).length === 1 && isObj(v.data)) v = v.data;
    const sh = shapeOf(Array.isArray(v) ? { items: v } : v);
    if (sh.k !== 'obj') throw new Error('Root must be a JSON object');
    if (o.mode === 'query') {
      const sel = (x, ind) => {
        while (x.k === 'arr') x = x.e || { k: 'any' };
        if (x.k !== 'obj') return '';
        return ' {\n' + Object.entries(x.f).map(([k, f]) => `${ind}  ${k}${sel(f.s, ind + '  ')}`).join('\n') + `\n${ind}}`;
      };
      return `query ${o.name || 'GetData'}${sel(sh, '')}`;
    }
    const types = [], used = new Set();
    const build = (x, nm) => {
      while (x.k === 'arr') { return `[${build(x.e || { k: 'any' }, nm)}!]`; }
      if (x.k === 'obj') {
        let n = pascal(singular(nm)); while (used.has(n)) n += '_'; used.add(n);
        const idx = types.push(null) - 1;
        const body = Object.entries(x.f).map(([k, f]) => { const t = build(f.s, k); return `  ${k}: ${t}${f.s.n || f.opt ? '' : '!'}`; });
        types[idx] = `type ${n} {\n${body.join('\n')}\n}`; return n;
      }
      return { str: 'String', int: 'Int', num: 'Float', bool: 'Boolean' }[x.k] || 'String';
    };
    build(sh, o.name === 'GetData' ? 'Query' : o.name);
    return types.join('\n\n');
  },
});
const sqlQ = (id, d) => (d === 'mysql' ? '`' + id.replace(/`/g, '``') + '`' : '"' + id.replace(/"/g, '""') + '"');
T.push({
  id: 'json-to-sql', cat: 'JSON+', title: 'JSON to SQL (CREATE TABLE + INSERT)', desc: 'Infer a table from a JSON array of objects: column types, NULLability, and escaped INSERT statements for PostgreSQL, MySQL or SQLite.',
  labels: ['JSON array of objects'], sample: '[{"id":1,"name":"Ann","score":9.5,"active":true,"joined":"2024-03-01T10:00:00Z","meta":{"a":1}},{"id":2,"name":"O\'Brien","score":null,"active":false,"joined":"2024-04-02T11:30:00Z"}]',
  opts: [txt('table', 'Table name', 'items'), sel('dialect', 'Dialect', 'postgres', ['postgres', 'mysql', 'sqlite']), chk('create', 'Include CREATE TABLE', true), chk('multi', 'One multi-row INSERT', false)],
  run: ([s], o) => {
    let v = parseJ(s); if (isObj(v)) v = [v];
    if (!Array.isArray(v) || !v.length || !v.every(isObj)) throw new Error('Input must be a JSON array of objects (or a single object)');
    const d = o.dialect, Q = (x) => sqlQ(x, d), cols = []; const info = {};
    for (const r of v) for (const [k, x] of Object.entries(r)) { if (!info[k]) { info[k] = { kinds: new Set(), nul: false, len: 0, ts: true }; cols.push(k); } const c = info[k]; if (x === null) c.nul = true; else { c.kinds.add(Array.isArray(x) ? 'json' : typeof x === 'object' ? 'json' : typeof x === 'number' ? (Number.isInteger(x) ? 'int' : 'num') : typeof x); if (typeof x === 'string') { c.len = Math.max(c.len, [...x].length); if (!/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:?\d\d)?$/.test(x)) c.ts = false; } if (typeof x === 'number' && Math.abs(x) > 2147483647) c.big = true; } }
    for (const r of v) for (const k of cols) if (!(k in r)) info[k].nul = true;
    const typ = (c) => {
      const ks = [...c.kinds];
      if (ks.length > 1 && !(ks.every((k) => k === 'int' || k === 'num'))) return d === 'postgres' ? 'JSONB' : d === 'mysql' ? 'JSON' : 'TEXT';
      const k = ks[0] || 'string';
      if (k === 'int') return d === 'sqlite' ? 'INTEGER' : c.big ? 'BIGINT' : 'INTEGER';
      if (k === 'num' || ks.length > 1) return d === 'postgres' ? 'DOUBLE PRECISION' : d === 'mysql' ? 'DOUBLE' : 'REAL';
      if (k === 'boolean') return d === 'sqlite' ? 'INTEGER' : 'BOOLEAN';
      if (k === 'json') return d === 'postgres' ? 'JSONB' : d === 'mysql' ? 'JSON' : 'TEXT';
      if (c.ts && c.len) return d === 'postgres' ? 'TIMESTAMPTZ' : d === 'mysql' ? 'DATETIME' : 'TEXT';
      return d === 'sqlite' ? 'TEXT' : c.len <= 255 ? `VARCHAR(${Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, c.len))))})` : 'TEXT';
    };
    const lit = (x, c) => {
      if (x === undefined || x === null) return 'NULL';
      if (typeof x === 'boolean') return d === 'postgres' ? (x ? 'TRUE' : 'FALSE') : x ? '1' : '0';
      if (typeof x === 'number') return String(x);
      let t = typeof x === 'object' ? JSON.stringify(x) : (c.ts && d !== 'sqlite' && /(Z|[+-]\d\d:?\d\d)$/.test(x) && d === 'mysql' ? x.replace('T', ' ').replace(/(\.\d+)?(Z|[+-]\d\d:?\d\d)$/, '') : x);
      t = t.replace(/'/g, "''"); if (d === 'mysql') t = t.replace(/\\/g, '\\\\');
      return `'${t}'`;
    };
    const tn = Q(o.table || 'items'), out = [];
    if (o.create) out.push(`CREATE TABLE ${tn} (\n${cols.map((k) => `  ${Q(k)} ${typ(info[k])}${info[k].nul ? '' : ' NOT NULL'}`).join(',\n')}\n);`);
    const rows = v.map((r) => `(${cols.map((k) => lit(r[k], info[k])).join(', ')})`), head = `INSERT INTO ${tn} (${cols.map(Q).join(', ')}) VALUES`;
    out.push(o.multi ? `${head}\n  ${rows.join(',\n  ')};` : rows.map((r) => `${head} ${r};`).join('\n'));
    return out.join('\n\n');
  },
});

// ---- JSON to models
const KW = {
  Java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while record var'.split(' '),
  Kotlin: 'as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while'.split(' '),
  Swift: 'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as Any catch false is nil super self Self throw throws true try'.split(' '),
  Python: 'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '),
  'C#': 'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while'.split(' '),
  Rust: 'as break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while async await dyn abstract become box do final macro override priv typeof unsized virtual yield try'.split(' '),
};
T.push({
  id: 'json-to-models', cat: 'JSON+', title: 'JSON to Java / Kotlin / Swift / Python / C# / Rust Models', desc: 'Generate typed model classes from sample JSON: Java records, Kotlin data classes, Swift Codable, Python dataclasses, C# classes, Rust serde structs. Merges array items to find optional fields.',
  labels: ['Sample JSON'], sample: '{"id":42,"user_name":"ann","score":9.5,"active":true,"tags":["a","b"],"address":{"city":"Gent","zip":null},"orders":[{"sku":"A1","qty":2},{"sku":"B2","qty":1,"note":"gift"}]}',
  opts: [sel('lang', 'Language', 'Python dataclass', ['Java', 'Kotlin', 'Swift', 'Python dataclass', 'C#', 'Rust']), txt('root', 'Root type name', 'Root')],
  run: ([s], o) => {
    const lang = o.lang === 'Python dataclass' ? 'Python' : o.lang, v = parseJ(s);
    let sh = shapeOf(v); if (Array.isArray(v)) sh = sh.e || { k: 'obj', f: {} };
    if (sh.k !== 'obj') throw new Error('Root must be a JSON object (or an array of objects)');
    const classes = [], used = new Set();
    const caseF = { Java: camel, Kotlin: camel, Swift: camel, Python: snake, 'C#': pascal, Rust: snake }[lang];
    const fname = (k) => { let n = caseF(k); if (/^\d/.test(n)) n = (lang === 'Python' || lang === 'Rust' ? '_' : 'n') + n; if (KW[lang].includes(n)) n = lang === 'Rust' ? 'r#' + n : lang === 'Swift' || lang === 'Kotlin' ? '`' + n + '`' : n + '_'; return n; };
    const ty = (x, nm, opt) => {
      let t;
      if (x.k === 'arr') { const el = ty(x.e || { k: 'any' }, nm, false); t = { Java: `List<${el}>`, Kotlin: `List<${el}>`, Swift: `[${el}]`, Python: `list[${el}]`, 'C#': `List<${el}>`, Rust: `Vec<${el}>` }[lang]; }
      else if (x.k === 'obj') {
        let n = pascal(singular(nm)); while (used.has(n)) n += '2'; used.add(n);
        const slot = classes.push(null) - 1;
        classes[slot] = { n, f: Object.entries(x.f).map(([k, f]) => ({ k, name: fname(k), t: ty(f.s, k, f.opt), opt: f.opt || !!f.s.n || f.s.k === 'null' })) };
        t = n;
      } else t = {
        str: { Java: 'String', Kotlin: 'String', Swift: 'String', Python: 'str', 'C#': 'string', Rust: 'String' },
        int: { Java: 'long', Kotlin: 'Long', Swift: 'Int', Python: 'int', 'C#': 'long', Rust: 'i64' },
        num: { Java: 'double', Kotlin: 'Double', Swift: 'Double', Python: 'float', 'C#': 'double', Rust: 'f64' },
        bool: { Java: 'boolean', Kotlin: 'Boolean', Swift: 'Bool', Python: 'bool', 'C#': 'bool', Rust: 'bool' },
      }[x.k]?.[lang] || { Java: 'Object', Kotlin: 'JsonElement', Swift: 'String', Python: 'Any', 'C#': 'object', Rust: 'serde_json::Value' }[lang];
      return t;
    };
    used.add(pascal(o.root || 'Root')); 
    const rootName = pascal(o.root || 'Root');
    used.delete(rootName);
    const slot0 = ty(sh, rootName, false); // registers root class under rootName
    const nullable = (c, t) => ({ Java: { long: 'Long', double: 'Double', boolean: 'Boolean' }[t] || t, Kotlin: t + '?', Swift: t + '?', Python: `Optional[${t}]`, 'C#': t + '?', Rust: `Option<${t}>` }[lang]);
    const out = [];
    const ordered = classes.slice().reverse(); // nested first
    for (const c of lang === 'Python' ? ordered : classes) {
      const L = [];
      if (lang === 'Java') {
        L.push(`public record ${c.n}(`, c.f.map((f) => `    ${f.k !== f.name ? `@JsonProperty(${JSON.stringify(f.k)}) ` : ''}${f.opt ? nullable(c, f.t) : f.t} ${f.name}`).join(',\n'), ') {}');
      } else if (lang === 'Kotlin') {
        L.push('@Serializable', `data class ${c.n}(`, c.f.map((f) => `    ${f.k !== f.name.replace(/`/g, '') ? `@SerialName(${JSON.stringify(f.k)}) ` : ''}val ${f.name}: ${f.opt ? nullable(c, f.t) + ' = null' : f.t}`).join(',\n'), ')');
      } else if (lang === 'Swift') {
        L.push(`struct ${c.n}: Codable {`, ...c.f.map((f) => `    let ${f.name}: ${f.opt ? nullable(c, f.t) : f.t}`));
        if (c.f.some((f) => f.k !== f.name.replace(/`/g, ''))) L.push('', '    enum CodingKeys: String, CodingKey {', ...c.f.map((f) => `        case ${f.name}${f.k !== f.name.replace(/`/g, '') ? ` = ${JSON.stringify(f.k)}` : ''}`), '    }');
        L.push('}');
      } else if (lang === 'Python') {
        const req = c.f.filter((f) => !f.opt), opt = c.f.filter((f) => f.opt);
        L.push('@dataclass', `class ${c.n}:`, ...(c.f.length ? [...req.map((f) => `    ${f.name}: ${f.t}`), ...opt.map((f) => `    ${f.name}: ${nullable(c, f.t)} = None`)] : ['    pass']));
        const ren = c.f.filter((f) => f.k !== f.name);
        if (ren.length) L.push(`    # JSON keys: ${ren.map((f) => `${f.name} <- ${JSON.stringify(f.k)}`).join(', ')}`);
      } else if (lang === 'C#') {
        L.push(`public class ${c.n}`, '{', ...c.f.map((f) => `    [JsonPropertyName(${JSON.stringify(f.k)})]\n    public ${f.opt ? nullable(c, f.t) : f.t} ${f.name} { get; set; }`), '}');
      } else {
        L.push('#[derive(Debug, Serialize, Deserialize)]', `pub struct ${c.n} {`, ...c.f.map((f) => `    ${f.k !== f.name.replace('r#', '') ? `#[serde(rename = ${JSON.stringify(f.k)})]\n    ` : ''}pub ${f.name}: ${f.opt ? nullable(c, f.t) : f.t},`), '}');
      }
      out.push(L.join('\n'));
    }
    const head = { Java: 'import java.util.List;\nimport com.fasterxml.jackson.annotation.JsonProperty;', Kotlin: 'import kotlinx.serialization.*\nimport kotlinx.serialization.json.JsonElement', Swift: 'import Foundation', Python: 'from dataclasses import dataclass\nfrom typing import Any, Optional', 'C#': 'using System.Collections.Generic;\nusing System.Text.Json.Serialization;', Rust: 'use serde::{Deserialize, Serialize};' }[lang];
    return head + '\n\n' + out.join('\n\n');
  },
});
// ---- Avro -> JSON Schema
T.push({
  id: 'avro-to-json-schema', cat: 'JSON+', title: 'Avro Schema to JSON Schema', desc: 'Convert an Avro schema (.avsc: records, enums, arrays, maps, unions, fixed, logical types, named references) to JSON Schema draft 2020-12.',
  labels: ['Avro schema JSON'], sample: '{"type":"record","name":"User","namespace":"com.acme","fields":[{"name":"id","type":"long"},{"name":"email","type":["null","string"],"default":null},{"name":"role","type":{"type":"enum","name":"Role","symbols":["ADMIN","USER"]}},{"name":"tags","type":{"type":"array","items":"string"}},{"name":"attrs","type":{"type":"map","values":"int"}},{"name":"created","type":{"type":"long","logicalType":"timestamp-millis"}},{"name":"friend","type":["null","User"],"default":null}]}',
  run: ([s]) => {
    const named = {}, defs = {};
    const nm = (n, ns) => (n.includes('.') ? n : ns ? `${ns}.${n}` : n);
    const prim = { null: { type: 'null' }, boolean: { type: 'boolean' }, int: { type: 'integer', minimum: -2147483648, maximum: 2147483647 }, long: { type: 'integer' }, float: { type: 'number' }, double: { type: 'number' }, bytes: { type: 'string', contentEncoding: 'base64' }, string: { type: 'string' } };
    const LOG = { 'timestamp-millis': { type: 'integer', format: 'int64' }, 'timestamp-micros': { type: 'integer' }, date: { type: 'integer', format: 'int32' }, uuid: { type: 'string', format: 'uuid' }, 'time-millis': { type: 'integer' } };
    const conv = (t, ns) => {
      if (typeof t === 'string') {
        if (prim[t]) return { ...prim[t] };
        const full = nm(t, ns); if (!named[full]) throw new Error(`Unknown Avro type "${t}"`);
        return { $ref: `#/$defs/${named[full]}` };
      }
      if (Array.isArray(t)) { const parts = t.map((x) => conv(x, ns)); return parts.length === 2 && t.includes('null') ? { anyOf: parts } : { anyOf: parts }; }
      if (!isObj(t)) throw new Error('Invalid Avro type');
      if (t.logicalType && LOG[t.logicalType] && typeof t.type === 'string' && prim[t.type]) return { ...LOG[t.logicalType] };
      switch (t.type) {
        case 'record': case 'error': {
          const ns2 = t.namespace ?? (t.name.includes('.') ? t.name.slice(0, t.name.lastIndexOf('.')) : ns), full = nm(t.name, ns2), id = t.name.split('.').pop();
          named[full] = id;
          const props = {}, req = [];
          for (const f of t.fields || []) { const sc = conv(f.type, ns2); if (f.doc) sc.description = f.doc; if ('default' in f) sc.default = f.default; props[f.name] = sc; if (!('default' in f)) req.push(f.name); }
          defs[id] = { type: 'object', properties: props, ...(req.length ? { required: req } : {}), additionalProperties: false, ...(t.doc ? { description: t.doc } : {}) };
          return { $ref: `#/$defs/${id}` };
        }
        case 'enum': { const id = t.name.split('.').pop(); named[nm(t.name, t.namespace ?? ns)] = id; defs[id] = { type: 'string', enum: t.symbols }; return { $ref: `#/$defs/${id}` }; }
        case 'fixed': { const id = t.name.split('.').pop(); named[nm(t.name, t.namespace ?? ns)] = id; defs[id] = { type: 'string', description: `fixed(${t.size}) bytes, base64` }; return { $ref: `#/$defs/${id}` }; }
        case 'array': return { type: 'array', items: conv(t.items, ns) };
        case 'map': return { type: 'object', additionalProperties: conv(t.values, ns) };
        default: return conv(t.type, ns);
      }
    };
    const root = conv(parseJ(s), '');
    const out = { $schema: 'https://json-schema.org/draft/2020-12/schema' };
    if (root.$ref) {
      const id = root.$ref.split('/').pop(), body = defs[id]; delete defs[id];
      const fix = (x) => JSON.parse(JSON.stringify(x).replaceAll(`"#/$defs/${id}"`, '"#"'));
      return J({ ...out, title: id, ...fix(body), ...(Object.keys(defs).length ? { $defs: fix(defs) } : {}) });
    }
    Object.assign(out, root); if (Object.keys(defs).length) out.$defs = defs; return J(out);
  },
});
// ---- JSON Schema -> Zod and Zod -> JSON Schema
T.push({
  id: 'json-schema-to-zod', cat: 'JSON+', title: 'JSON Schema to Zod', desc: 'Turn a JSON Schema (draft-07 / 2020-12 subset: types, formats, bounds, enum/const, anyOf/oneOf/allOf, $ref to $defs) into Zod source code.',
  labels: ['JSON Schema'], sample: '{"type":"object","properties":{"id":{"type":"integer","minimum":1},"email":{"type":"string","format":"email"},"role":{"enum":["admin","user"]},"tags":{"type":"array","items":{"type":"string"},"maxItems":5},"address":{"$ref":"#/$defs/Address"},"nick":{"type":["string","null"],"minLength":2}},"required":["id","email"],"$defs":{"Address":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}',
  opts: [txt('name', 'Schema const name', 'schema')],
  run: ([s], o) => {
    const root = parseJ(s), defs = { ...(root.$defs || {}), ...(root.definitions || {}) };
    const lit = (v) => JSON.stringify(v);
    const conv = (sc, seen = []) => {
      if (sc === true || !sc || Object.keys(sc).length === 0) return 'z.any()';
      if (sc === false) return 'z.never()';
      let z;
      if (sc.$ref) { const n = sc.$ref.split('/').pop(); if (sc.$ref === '#') return 'z.any()'; if (seen.includes(n)) return 'z.lazy(() => z.any())'; z = defs[n] ? conv(defs[n], [...seen, n]) : 'z.any()'; }
      else if (sc.const !== undefined) z = `z.literal(${lit(sc.const)})`;
      else if (sc.enum) z = sc.enum.every((x) => typeof x === 'string') ? `z.enum(${lit(sc.enum)})` : `z.union([${sc.enum.map((x) => `z.literal(${lit(x)})`).join(', ')}])`;
      else if (sc.anyOf || sc.oneOf) { const a = (sc.anyOf || sc.oneOf).map((x) => conv(x, seen)); z = a.length === 1 ? a[0] : `z.union([${a.join(', ')}])`; }
      else if (sc.allOf) z = sc.allOf.map((x) => conv(x, seen)).reduce((a, b) => `z.intersection(${a}, ${b})`);
      else if (Array.isArray(sc.type)) { const a = sc.type.map((t) => conv({ ...sc, type: t }, seen)); z = a.length === 1 ? a[0] : `z.union([${a.join(', ')}])`; }
      else switch (sc.type) {
        case 'string': {
          z = 'z.string()';
          if (sc.minLength != null) z += `.min(${sc.minLength})`; if (sc.maxLength != null) z += `.max(${sc.maxLength})`;
          if (sc.pattern) z += `.regex(new RegExp(${lit(sc.pattern)}))`;
          const f = { email: '.email()', uuid: '.uuid()', uri: '.url()', url: '.url()', 'date-time': '.datetime()', date: '.date()', time: '.time()', ipv4: '.ip({ version: "v4" })', ipv6: '.ip({ version: "v6" })' }[sc.format]; if (f) z += f;
          break;
        }
        case 'number': case 'integer': {
          z = 'z.number()'; if (sc.type === 'integer') z += '.int()';
          if (sc.minimum != null) z += `.min(${sc.minimum})`; if (sc.maximum != null) z += `.max(${sc.maximum})`;
          if (typeof sc.exclusiveMinimum === 'number') z += `.gt(${sc.exclusiveMinimum})`; if (typeof sc.exclusiveMaximum === 'number') z += `.lt(${sc.exclusiveMaximum})`;
          if (sc.multipleOf != null) z += `.multipleOf(${sc.multipleOf})`;
          break;
        }
        case 'boolean': z = 'z.boolean()'; break;
        case 'null': z = 'z.null()'; break;
        case 'array': {
          if (Array.isArray(sc.items) || sc.prefixItems) z = `z.tuple([${(sc.prefixItems || sc.items).map((x) => conv(x, seen)).join(', ')}])`;
          else { z = `z.array(${conv(sc.items ?? true, seen)})`; if (sc.minItems != null) z += `.min(${sc.minItems})`; if (sc.maxItems != null) z += `.max(${sc.maxItems})`; }
          break;
        }
        case 'object': default: {
          if (sc.properties) {
            const req = new Set(sc.required || []);
            z = `z.object({\n${Object.entries(sc.properties).map(([k, p]) => `  ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : lit(k)}: ${conv(p, seen).replace(/\n/g, '\n  ')}${req.has(k) ? '' : '.optional()'},`).join('\n')}\n})`;
            if (sc.additionalProperties === false) z += '.strict()'; else if (isObj(sc.additionalProperties)) z += `.catchall(${conv(sc.additionalProperties, seen)})`; else z += '.passthrough()';
          } else if (sc.type === 'object') z = isObj(sc.additionalProperties) ? `z.record(z.string(), ${conv(sc.additionalProperties, seen)})` : 'z.record(z.string(), z.any())';
          else z = 'z.any()';
        }
      }
      if (sc.nullable) z += '.nullable()';
      if (sc.description) z += `.describe(${lit(sc.description)})`;
      if (sc.default !== undefined) z += `.default(${lit(sc.default)})`;
      return z;
    };
    return `import { z } from "zod";\n\nexport const ${o.name || 'schema'} = ${conv(root)};\n\nexport type ${pascal(o.name || 'schema')} = z.infer<typeof ${o.name || 'schema'}>;`;
  },
});
// minimal JS-expression parser for zod sources
function parseZodSource(src) {
  const toks = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2 || src.length; continue; }
    let m;
    if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1; toks.push({ t: 'str', v: JSON.parse('"' + src.slice(i + 1, j).replace(/\\'/g, "'").replace(/"/g, '\\"') + '"') }); i = j + 1; continue; }
    if (c === '/' && (!toks.length || /[(,:=\[]/.test(toks[toks.length - 1].v ?? ''))) { let j = i + 1; while (j < src.length && src[j] !== '/') j += src[j] === '\\' ? 2 : 1; const fl = /^[a-z]*/.exec(src.slice(j + 1))[0]; toks.push({ t: 're', v: src.slice(i + 1, j), f: fl }); i = j + 1 + fl.length; continue; }
    if ((m = /^-?\d+(\.\d+)?([eE][-+]?\d+)?n?/.exec(src.slice(i))) && (c !== '-' || !toks.length || /[(,:=\[]/.test(toks[toks.length - 1].v ?? ''))) { toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i)))) { toks.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
    toks.push({ t: 'p', v: c }); i++;
  }
  let p = 0;
  const peek = () => toks[p], eat = (v) => { const t = toks[p]; if (!t || (v && t.v !== v)) throw new Error(`Zod parse error: expected "${v}" near token ${p}${t ? ` ("${t.v}")` : ''}`); p++; return t; };
  const is = (v) => toks[p] && toks[p].t === 'p' && toks[p].v === v;
  function expr() {
    const t = peek(); if (!t) throw new Error('Unexpected end of Zod source');
    if (t.t === 'num' || t.t === 'str') { p++; return t.v; }
    if (t.t === 're') { p++; return { re: t.v }; }
    if (is('[')) { p++; const a = []; while (!is(']')) { a.push(expr()); if (is(',')) p++; } p++; return a; }
    if (is('{')) { p++; const o = {}; while (!is('}')) { const k = eat(); if (is(':')) { p++; o[k.v] = expr(); } else o[k.v] = { ref: k.v }; if (is(',')) p++; } p++; return o; }
    if (t.t === 'id') {
      p++;
      if (t.v === 'true' || t.v === 'false') return t.v === 'true';
      if (t.v === 'null') return null;
      let node = { id: t.v, calls: [] };
      while (is('.') || is('(')) {
        if (is('.')) { p++; const n = eat().v; node.calls.push({ name: n, args: null }); if (is('(')) { p++; const a = []; while (!is(')')) { a.push(expr()); if (is(',')) p++; } p++; node.calls[node.calls.length - 1].args = a; } }
        else { p++; const a = []; while (!is(')')) { a.push(expr()); if (is(',')) p++; } p++; node.calls.push({ name: '()', args: a }); }
      }
      return node;
    }
    throw new Error(`Zod parse error near "${t.v}"`);
  }
  const decls = {}; let last = null, lastName = null;
  while (p < toks.length) {
    const t = peek();
    if (t.t === 'id' && (t.v === 'import' || t.v === 'export' && 0)) { while (p < toks.length && !(toks[p].t === 'str' )) p++; p++; if (is(';')) p++; continue; }
    if (t.t === 'id' && (t.v === 'const' || t.v === 'let' || t.v === 'var')) {
      p++; const n = eat().v;
      if (is(':')) { while (!is('=')) p++; }
      eat('='); const e = expr(); if (is(';')) p++; decls[n] = e; last = e; lastName = n; continue;
    }
    if (t.t === 'id' && t.v === 'export') { p++; continue; }
    if (t.t === 'id' && t.v === 'type') { while (p < toks.length && !is(';') && !(toks[p + 1] && toks[p + 1].v === 'const')) p++; if (is(';')) p++; continue; }
    const e = expr(); if (is(';')) p++; last = e; lastName = null;
  }
  if (!last) throw new Error('No Zod schema found');
  return { decls, root: last, rootName: lastName };
}
T.push({
  id: 'zod-to-json-schema', cat: 'JSON+', title: 'Zod to JSON Schema', desc: 'Parse Zod source (z.object, string/number checks, enum, union, array, optional/nullable/default, const references) and emit JSON Schema. Static parser, no code is executed.',
  labels: ['Zod source'], sample: 'const Address = z.object({ city: z.string(), zip: z.string().regex(/^\\d{4}$/) });\n\nexport const User = z.object({\n  id: z.number().int().positive(),\n  email: z.string().email(),\n  role: z.enum(["admin", "user"]),\n  age: z.number().min(0).max(150).optional(),\n  tags: z.array(z.string()).max(5).default([]),\n  address: Address,\n  nick: z.string().min(2).nullable(),\n});',
  run: ([s]) => {
    const { decls, root } = parseZodSource(s);
    const isZ = (n) => n && n.id === 'z';
    const lit = (v) => (v && v.re !== undefined ? v.re : v);
    const conv = (n, depth = 0) => {
      if (depth > 40) throw new Error('Schema too deeply nested or recursive');
      if (n && n.ref) n = decls[n.ref];
      if (!n || !n.id) throw new Error('Unsupported expression in schema');
      if (n.id !== 'z') { if (!decls[n.id]) throw new Error(`Unknown reference "${n.id}"`); return applyChain(conv(decls[n.id], depth + 1), n.calls, depth); }
      const [f, ...rest] = n.calls;
      if (!f) throw new Error('Expected z.something()');
      const a = f.args || [];
      let sc;
      switch (f.name) {
        case 'string': sc = { type: 'string' }; break;
        case 'number': sc = { type: 'number' }; break;
        case 'bigint': sc = { type: 'integer' }; break;
        case 'boolean': sc = { type: 'boolean' }; break;
        case 'null': sc = { type: 'null' }; break;
        case 'date': sc = { type: 'string', format: 'date-time' }; break;
        case 'any': case 'unknown': sc = {}; break;
        case 'never': sc = { not: {} }; break;
        case 'literal': sc = { const: a[0] }; break;
        case 'enum': sc = { type: 'string', enum: a[0] }; break;
        case 'nativeEnum': sc = {}; break;
        case 'array': sc = { type: 'array', items: conv(a[0], depth + 1) }; break;
        case 'tuple': sc = { type: 'array', prefixItems: a[0].map((x) => conv(x, depth + 1)), minItems: a[0].length, maxItems: a[0].length }; break;
        case 'record': sc = { type: 'object', additionalProperties: conv(a[a.length - 1], depth + 1) }; break;
        case 'union': case 'discriminatedUnion': sc = { anyOf: (a[a.length - 1]).map((x) => conv(x, depth + 1)) }; break;
        case 'intersection': sc = { allOf: [conv(a[0], depth + 1), conv(a[1], depth + 1)] }; break;
        case 'object': case 'strictObject': case 'looseObject': {
          const props = {}, req = [];
          for (const [k, v] of Object.entries(a[0] || {})) { props[k] = conv(v, depth + 1); if (!isOptional(v)) req.push(k); }
          sc = { type: 'object', properties: props, ...(req.length ? { required: req } : {}) };
          if (f.name === 'strictObject') sc.additionalProperties = false;
          break;
        }
        default: throw new Error(`Unsupported Zod type z.${f.name}()`);
      }
      return applyChain(sc, rest, depth);
    };
    const isOptional = (v) => { if (v && v.ref) v = decls[v.ref]; if (!v || !v.id) return false; if (v.id !== 'z') return decls[v.id] ? isOptional(decls[v.id]) || v.calls.some((c) => c.name === 'optional' || c.name === 'default') : false; return v.calls.some((c) => c.name === 'optional' || c.name === 'default' || c.name === 'nullish'); };
    function applyChain(sc, calls, depth) {
      for (const c of calls) {
        const a = c.args || [], N = sc.type;
        const num = (k, v) => { sc[k] = v; };
        switch (c.name) {
          case 'min': if (N === 'string') num('minLength', a[0]); else if (N === 'array') num('minItems', a[0]); else num('minimum', a[0]); break;
          case 'max': if (N === 'string') num('maxLength', a[0]); else if (N === 'array') num('maxItems', a[0]); else num('maximum', a[0]); break;
          case 'length': if (N === 'string') { num('minLength', a[0]); num('maxLength', a[0]); } else { num('minItems', a[0]); num('maxItems', a[0]); } break;
          case 'nonempty': if (N === 'array') num('minItems', 1); else num('minLength', 1); break;
          case 'int': sc.type = 'integer'; break;
          case 'positive': num('exclusiveMinimum', 0); break;
          case 'negative': num('exclusiveMaximum', 0); break;
          case 'nonnegative': num('minimum', 0); break;
          case 'nonpositive': num('maximum', 0); break;
          case 'gt': num('exclusiveMinimum', a[0]); break; case 'lt': num('exclusiveMaximum', a[0]); break;
          case 'gte': num('minimum', a[0]); break; case 'lte': num('maximum', a[0]); break;
          case 'multipleOf': case 'step': num('multipleOf', a[0]); break;
          case 'email': num('format', 'email'); break; case 'url': num('format', 'uri'); break; case 'uuid': num('format', 'uuid'); break;
          case 'datetime': num('format', 'date-time'); break; case 'date': num('format', 'date'); break; case 'time': num('format', 'time'); break;
          case 'ip': num('format', 'ipv4'); break; case 'cuid': case 'cuid2': case 'ulid': case 'nanoid': break;
          case 'regex': num('pattern', lit(a[0])); break;
          case 'startsWith': num('pattern', '^' + String(a[0]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); break;
          case 'optional': case 'nullish': case 'trim': case 'toLowerCase': case 'toUpperCase': case 'strict': case 'passthrough': case 'strip': case 'readonly': case 'brand': case 'refine': case 'superRefine': case 'transform': case 'coerce': break;
          case 'nullable': sc = { anyOf: [sc, { type: 'null' }] }; break;
          case 'default': case 'catch': sc.default = typeof a[0] === 'object' && a[0] && a[0].id ? undefined : a[0]; if (sc.default === undefined) delete sc.default; break;
          case 'describe': sc.description = a[0]; break;
          case 'array': sc = { type: 'array', items: sc }; break;
          case 'or': sc = { anyOf: [sc, conv(a[0], depth + 1)] }; break;
          case 'and': sc = { allOf: [sc, conv(a[0], depth + 1)] }; break;
          case 'extend': case 'merge': { const ex = c.name === 'extend' ? conv({ id: 'z', calls: [{ name: 'object', args: [a[0]] }] }, depth + 1) : conv(a[0], depth + 1); sc = { ...sc, properties: { ...sc.properties, ...ex.properties }, required: [...new Set([...(sc.required || []), ...(ex.required || [])])] }; break; }
          case 'partial': delete sc.required; break;
          case 'shape': case '()': break;
          default: throw new Error(`Unsupported Zod method .${c.name}()`);
        }
      }
      return sc;
    }
    return J({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...conv(root) });
  },
});

// ---------------- Converters+
// OpenAPI -> TypeScript
const refName = (r) => String(r).split('/').pop();
const tsKey = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
function tsType(sc, ind = '') {
  if (!sc || sc === true) return 'unknown';
  let t;
  if (sc.$ref) t = pascal(refName(sc.$ref)) === refName(sc.$ref) ? refName(sc.$ref) : tsIdent(refName(sc.$ref));
  else if (sc.enum) t = sc.enum.map((x) => JSON.stringify(x)).join(' | ');
  else if (sc.const !== undefined) t = JSON.stringify(sc.const);
  else if (sc.allOf) t = sc.allOf.map((x) => tsType(x, ind)).join(' & ');
  else if (sc.oneOf || sc.anyOf) t = (sc.oneOf || sc.anyOf).map((x) => tsType(x, ind)).join(' | ');
  else if (Array.isArray(sc.type)) t = sc.type.map((x) => tsType({ ...sc, type: x }, ind)).join(' | ');
  else switch (sc.type) {
    case 'string': t = sc.format === 'binary' ? 'Blob' : 'string'; break;
    case 'integer': case 'number': t = 'number'; break;
    case 'boolean': t = 'boolean'; break;
    case 'null': t = 'null'; break;
    case 'array': { const e = tsType(sc.items, ind); t = /[|&]/.test(e) ? `(${e})[]` : `${e}[]`; break; }
    default: {
      if (sc.properties) {
        const req = new Set(sc.required || []);
        const body = Object.entries(sc.properties).map(([k, p]) => `${ind}  ${p.readOnly ? 'readonly ' : ''}${tsKey(k)}${req.has(k) ? '' : '?'}: ${tsType(p, ind + '  ')};`).join('\n');
        const extra = sc.additionalProperties ? `\n${ind}  [key: string]: ${sc.additionalProperties === true ? 'unknown' : tsType(sc.additionalProperties, ind + '  ')};` : '';
        t = `{\n${body}${extra}\n${ind}}`;
      } else if (sc.additionalProperties) t = `Record<string, ${sc.additionalProperties === true ? 'unknown' : tsType(sc.additionalProperties, ind)}>`;
      else t = sc.type === 'object' ? 'Record<string, unknown>' : 'unknown';
    }
  }
  return sc.nullable ? `${t} | null` : t;
}
const tsIdent = (s) => { const n = pascal(s); return /^\d/.test(n) ? '_' + n : n; };
const HTTP = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];
function oaOps(spec) {
  const out = [];
  for (const [path, item] of Object.entries(spec.paths || {})) {
    if (!isObj(item)) continue;
    for (const m of HTTP) {
      const op = item[m]; if (!isObj(op)) continue;
      out.push({ path, method: m, op, params: [...(item.parameters || []), ...(op.parameters || [])] });
    }
  }
  return out;
}
const oaResolve = (spec, x) => { let n = 0; while (x && x.$ref && n++ < 20) { const parts = x.$ref.replace(/^#\//, '').split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~')); x = parts.reduce((a, k) => a?.[k], spec); } return x; };
T.push({
  id: 'openapi-to-typescript-fetch', cat: 'Converters+', title: 'OpenAPI to TypeScript Types + Fetch Client', desc: 'Generate TypeScript interfaces from components.schemas and a typed fetch client (one function per operation) from an OpenAPI 3 / Swagger 2 document in JSON or YAML.',
  labels: ['OpenAPI JSON or YAML'], sample: 'openapi: 3.0.3\ninfo:\n  title: Pets\n  version: 1.0.0\nservers:\n  - url: https://api.example.com/v1\npaths:\n  /pets:\n    get:\n      operationId: listPets\n      parameters:\n        - name: limit\n          in: query\n          schema: { type: integer }\n      responses:\n        "200":\n          description: ok\n          content:\n            application/json:\n              schema:\n                type: array\n                items: { $ref: "#/components/schemas/Pet" }\n    post:\n      operationId: createPet\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema: { $ref: "#/components/schemas/NewPet" }\n      responses:\n        "201":\n          description: created\n          content:\n            application/json:\n              schema: { $ref: "#/components/schemas/Pet" }\n  /pets/{petId}:\n    get:\n      operationId: getPet\n      parameters:\n        - name: petId\n          in: path\n          required: true\n          schema: { type: string }\n      responses:\n        "200":\n          description: ok\n          content:\n            application/json:\n              schema: { $ref: "#/components/schemas/Pet" }\ncomponents:\n  schemas:\n    NewPet:\n      type: object\n      required: [name]\n      properties:\n        name: { type: string }\n        tag: { type: string }\n    Pet:\n      allOf:\n        - $ref: "#/components/schemas/NewPet"\n        - type: object\n          required: [id]\n          properties:\n            id: { type: integer, format: int64 }\n            status: { type: string, enum: [available, sold] }\n',
  opts: [chk('client', 'Include fetch client', true), txt('base', 'Base URL (empty = first server)', '')],
  run: async ([s], o) => {
    const spec = await yamlOrJson(s);
    if (!isObj(spec) || (!spec.openapi && !spec.swagger)) throw new Error('Not an OpenAPI/Swagger document (missing "openapi" or "swagger")');
    const schemas = spec.components?.schemas || spec.definitions || {}, out = ['// Generated from OpenAPI. Do not edit by hand.', ''];
    for (const [n, sc] of Object.entries(schemas)) {
      const t = tsType(sc);
      out.push(t.startsWith('{') && !sc.allOf ? `export interface ${tsIdent(n)} ${t}\n` : `export type ${tsIdent(n)} = ${t};\n`);
    }
    if (!o.client) return out.join('\n');
    const base = o.base.trim() || spec.servers?.[0]?.url || (spec.host ? `https://${spec.host}${spec.basePath || ''}` : '');
    out.push(`const BASE_URL = ${JSON.stringify(base)};`, '', 'async function request<T>(method: string, path: string, query?: Record<string, unknown>, body?: unknown, init?: RequestInit): Promise<T> {',
      '  const url = new URL(BASE_URL.replace(/\\/$/, "") + path, typeof location !== "undefined" ? location.href : undefined);',
      '  for (const [k, v] of Object.entries(query ?? {})) {', '    if (v === undefined || v === null) continue;', '    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));', '    else url.searchParams.set(k, String(v));', '  }',
      '  const res = await fetch(url, {', '    ...init,', '    method,', '    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...init?.headers },', '    body: body !== undefined ? JSON.stringify(body) : undefined,', '  });',
      '  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${res.statusText}`);', '  if (res.status === 204) return undefined as T;', '  return (res.headers.get("content-type")?.includes("json") ? res.json() : res.text()) as Promise<T>;', '}', '');
    const names = new Set();
    for (const { path, method, op, params } of oaOps(spec)) {
      let name = camel(op.operationId || `${method} ${path.replace(/[{}]/g, '')}`); while (names.has(name)) name += '_'; names.add(name);
      const ps = params.map((p) => oaResolve(spec, p)).filter(Boolean), pth = ps.filter((p) => p.in === 'path'), qs = ps.filter((p) => p.in === 'query');
      const body = op.requestBody ? oaResolve(spec, op.requestBody) : null, bsch = body?.content?.['application/json']?.schema ?? ps.find((p) => p.in === 'body')?.schema;
      const okCode = Object.keys(op.responses || {}).find((c) => /^2/.test(c)), resp = oaResolve(spec, op.responses?.[okCode]);
      const rsch = resp?.content?.['application/json']?.schema ?? resp?.schema;
      const fields = [...pth.map((p) => `${camel(p.name)}: ${tsType(p.schema || p)}`), ...(qs.length ? [`query${qs.every((p) => !p.required) ? '?' : ''}: { ${qs.map((p) => `${tsKey(p.name)}${p.required ? '' : '?'}: ${tsType(p.schema || p)}`).join('; ')} }`] : []), ...(bsch ? [`body${body?.required || ps.some((p) => p.in === 'body' && p.required) ? '' : '?'}: ${tsType(bsch)}`] : [])];
      const url = path.replace(/\{([^}]+)\}/g, (_, n) => '${encodeURIComponent(String(args.' + camel(n) + '))}');
      if (op.summary || op.description) out.push(`/** ${(op.summary || op.description).replace(/\*\//g, '* /').split('\n')[0]} */`);
      out.push(`export function ${name}(${fields.length ? `args: { ${fields.map((f) => f.replace(/^(\w+)(\??):/, '$1$2:')).join('; ')} }` : ''}${fields.length ? ', ' : ''}init?: RequestInit): Promise<${rsch ? tsType(rsch) : 'void'}> {`,
        `  return request(${JSON.stringify(method.toUpperCase())}, \`${url}\`, ${qs.length ? 'args.query' : 'undefined'}, ${bsch ? 'args.body' : 'undefined'}, init);`, '}', '');
    }
    return out.join('\n');
  },
});
T.push({
  id: 'openapi-validator', cat: 'Converters+', title: 'OpenAPI Structural Validator', desc: 'Check an OpenAPI 3 / Swagger 2 document (JSON or YAML) for required fields, path parameters, duplicate operationIds, missing responses and unresolved $refs.',
  labels: ['OpenAPI JSON or YAML'], sample: 'openapi: 3.0.3\ninfo:\n  title: Demo\npaths:\n  /users/{id}:\n    get:\n      operationId: getUser\n      responses:\n        "200":\n          description: ok\n          content:\n            application/json:\n              schema: { $ref: "#/components/schemas/User" }\n  /users:\n    post:\n      operationId: getUser\n      responses: {}\ncomponents:\n  schemas:\n    Other: { type: object }\n',
  run: async ([s]) => {
    const spec = await yamlOrJson(s), errs = [], warns = [];
    if (!isObj(spec)) throw new Error('Document must be an object');
    const v3 = !!spec.openapi;
    if (!v3 && !spec.swagger) errs.push('Missing "openapi" (or "swagger") version field');
    else if (v3 && !/^3\.[01]\.\d+/.test(spec.openapi)) warns.push(`Unusual openapi version "${spec.openapi}"`);
    if (!isObj(spec.info)) errs.push('Missing "info" object'); else { if (!spec.info.title) errs.push('info.title is required'); if (!spec.info.version) errs.push('info.version is required'); }
    if (!isObj(spec.paths)) { if (!spec.webhooks && !spec.components) errs.push('Missing "paths" object'); }
    const ids = new Map();
    for (const { path, method, op, params } of oaOps(spec)) {
      const where = `${method.toUpperCase()} ${path}`;
      if (!path.startsWith('/')) errs.push(`Path "${path}" must start with "/"`);
      if (!isObj(op.responses) || !Object.keys(op.responses).length) errs.push(`${where}: "responses" must contain at least one response`);
      else for (const [c, r] of Object.entries(op.responses)) { if (!/^([1-5]\d\d|[1-5]XX|default)$/.test(c)) errs.push(`${where}: invalid response code "${c}"`); if (isObj(r) && !r.$ref && !r.description) errs.push(`${where}: response ${c} needs a description`); }
      if (op.operationId) { if (ids.has(op.operationId)) errs.push(`${where}: operationId "${op.operationId}" already used by ${ids.get(op.operationId)}`); else ids.set(op.operationId, where); } else warns.push(`${where}: no operationId`);
      const declared = new Set(params.map((p) => oaResolve(spec, p)).filter((p) => p?.in === 'path').map((p) => p.name));
      const tmpl = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      for (const t of tmpl) if (!declared.has(t)) errs.push(`${where}: path parameter {${t}} is not declared in parameters`);
      for (const d of declared) if (!tmpl.includes(d)) errs.push(`${where}: path parameter "${d}" does not appear in the path`);
      for (const p of params.map((x) => oaResolve(spec, x))) { if (!p) continue; if (!p.name || !p.in) errs.push(`${where}: parameter missing name/in`); else if (p.in === 'path' && p.required !== true) errs.push(`${where}: path parameter "${p.name}" must have required: true`); }
      if (!op.summary && !op.description) warns.push(`${where}: no summary or description`);
    }
    const walk = (x, at) => {
      if (Array.isArray(x)) x.forEach((e, i) => walk(e, `${at}/${i}`));
      else if (isObj(x)) for (const [k, e] of Object.entries(x)) {
        if (k === '$ref' && typeof e === 'string') { if (e.startsWith('#/') && oaResolve(spec, { $ref: e }) === undefined) errs.push(`Unresolved $ref ${e} (at ${at})`); }
        else walk(e, `${at}/${k}`);
      }
    };
    walk(spec, '');
    const used = JSON.stringify(spec.paths || {}) + JSON.stringify(spec.components || {});
    for (const n of Object.keys(spec.components?.schemas || {})) if (!used.includes(`/schemas/${n}"`)) warns.push(`components.schemas.${n} is never referenced`);
    return [`${errs.length} error(s), ${warns.length} warning(s)`, '', ...errs.map((e) => 'ERROR   ' + e), ...warns.map((w) => 'WARNING ' + w), ...(errs.length || warns.length ? [] : ['Looks structurally valid.']), '', 'Structural checks only; not a full JSON-Schema validation of the OpenAPI meta-schema.'].join('\n');
  },
});
const shq = (s) => (s === '' ? "''" : /^[\w@%+=:,./-]+$/.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'");
T.push({
  id: 'postman-to-curl', cat: 'Converters+', title: 'Postman Collection to cURL', desc: 'Convert every request in a Postman Collection v2.x JSON (folders, headers, raw / urlencoded / form-data bodies, basic / bearer / API-key auth) to curl commands.',
  labels: ['Postman collection JSON'], sample: '{"info":{"name":"Demo","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},"variable":[{"key":"host","value":"https://api.example.com"}],"item":[{"name":"Users","item":[{"name":"Create user","request":{"method":"POST","header":[{"key":"Content-Type","value":"application/json"}],"auth":{"type":"bearer","bearer":[{"key":"token","value":"abc123"}]},"body":{"mode":"raw","raw":"{\\"name\\":\\"Ann\\"}"},"url":{"raw":"{{host}}/users?active=true","query":[{"key":"active","value":"true"}]}}}]},{"name":"Health","request":{"method":"GET","url":"{{host}}/health"}}]}',
  opts: [chk('vars', 'Substitute collection variables', true), chk('comments', 'Add request names as comments', true)],
  run: ([s], o) => {
    const col = parseJ(s); if (!col.item) throw new Error('Not a Postman collection (no "item" array)');
    const vars = Object.fromEntries((col.variable || []).filter((v) => !v.disabled).map((v) => [v.key, v.value ?? '']));
    const sub = (x) => (o.vars ? String(x ?? '').replace(/\{\{([^}]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m)) : String(x ?? ''));
    const kv = (a, k = 'key') => (Array.isArray(a) ? Object.fromEntries(a.map((e) => [e[k], e.value])) : {});
    const out = [];
    const walk = (items, path) => {
      for (const it of items) {
        if (it.item) { walk(it.item, [...path, it.name]); continue; }
        const r = typeof it.request === 'string' ? { method: 'GET', url: it.request } : it.request; if (!r) continue;
        const method = (r.method || 'GET').toUpperCase();
        let url = typeof r.url === 'string' ? r.url : r.url?.raw ?? '';
        if (r.url?.query?.length && !url.includes('?')) url += '?' + r.url.query.filter((q) => !q.disabled).map((q) => `${q.key}=${q.value ?? ''}`).join('&');
        const g = [], A = (...x) => g.push(x.join(' ')), au = r.auth;
        if (au?.type === 'apikey') { const k = kv(au.apikey); if (k.in === 'query') url += (url.includes('?') ? '&' : '?') + `${k.key}=${k.value}`; }
        if (method !== 'GET') A('-X', method);
        for (const h of r.header || []) if (!h.disabled) A('-H', shq(sub(`${h.key}: ${h.value}`)));
        if (au?.type === 'bearer') A('-H', shq(sub(`Authorization: Bearer ${kv(au.bearer).token}`)));
        else if (au?.type === 'basic') { const b = kv(au.basic); A('-u', shq(sub(`${b.username}:${b.password}`))); }
        else if (au?.type === 'apikey' && kv(au.apikey).in !== 'query') { const k = kv(au.apikey); A('-H', shq(sub(`${k.key}: ${k.value}`))); }
        const b = r.body;
        if (b?.mode === 'raw') A('--data-raw', shq(sub(b.raw)));
        else if (b?.mode === 'urlencoded') for (const e of b.urlencoded || []) { if (!e.disabled) A('--data-urlencode', shq(sub(`${e.key}=${e.value}`))); }
        else if (b?.mode === 'formdata') for (const e of b.formdata || []) { if (!e.disabled) A('-F', shq(e.type === 'file' ? `${e.key}=@${e.src}` : sub(`${e.key}=${e.value}`))); }
        else if (b?.mode === 'graphql') A('--data-raw', shq(sub(JSON.stringify({ query: b.graphql?.query, variables: b.graphql?.variables ? JSON.parse(b.graphql.variables) : undefined }))));
        const cmd = ['curl ' + shq(sub(url)), ...g].join(g.length ? ' \\\n  ' : '');
        out.push((o.comments ? `# ${[...path, it.name].join(' / ')}\n` : '') + cmd);
      }
    };
    walk(col.item, []);
    if (!out.length) throw new Error('No requests found in collection');
    return out.join('\n\n');
  },
});
T.push({
  id: 'har-to-k6', cat: 'Converters+', title: 'HAR to k6 Script', desc: 'Turn a HAR capture into a k6 load-test script: one http request per entry with headers, body and status checks.',
  labels: ['HAR JSON'], sample: '{"log":{"version":"1.2","entries":[{"request":{"method":"GET","url":"https://example.com/api/items?limit=5","headers":[{"name":"Accept","value":"application/json"},{"name":"Host","value":"example.com"}]},"response":{"status":200,"content":{"mimeType":"application/json"}}},{"request":{"method":"POST","url":"https://example.com/api/items","headers":[{"name":"Content-Type","value":"application/json"}],"postData":{"mimeType":"application/json","text":"{\\"name\\":\\"x\\"}"}},"response":{"status":201,"content":{"mimeType":"application/json"}}},{"request":{"method":"GET","url":"https://example.com/logo.png","headers":[]},"response":{"status":200,"content":{"mimeType":"image/png"}}}]}}',
  opts: [chk('skipStatic', 'Skip images, CSS, fonts and scripts', true), num('vus', 'Virtual users', 1), txt('duration', 'Duration (e.g. 30s, empty = 1 iteration)', ''), num('sleep', 'Sleep between requests (s, 0 = none)', 1)],
  run: ([s], o) => {
    const har = parseJ(s), entries = har.log?.entries; if (!Array.isArray(entries)) throw new Error('Not a HAR file (missing log.entries)');
    const skipH = new Set(['host', 'content-length', 'connection', 'accept-encoding', 'cookie', 'user-agent', 'origin', 'referer', 'upgrade-insecure-requests']);
    const body = [];
    for (const e of entries) {
      const r = e.request, mt = e.response?.content?.mimeType || '';
      if (o.skipStatic && /^(image|font|text\/css)|javascript|font/.test(mt)) continue;
      const headers = Object.fromEntries((r.headers || []).filter((h) => !h.name.startsWith(':') && !skipH.has(h.name.toLowerCase())).map((h) => [h.name, h.value]));
      const m = r.method.toUpperCase(), params = Object.keys(headers).length ? `{ headers: ${JSON.stringify(headers)} }` : '';
      const url = JSON.stringify(r.url), bd = r.postData?.text !== undefined ? JSON.stringify(r.postData.text) : 'null';
      const call = m === 'GET' ? `http.get(${url}${params ? ', ' + params : ''})` : m === 'POST' && r.postData ? `http.post(${url}, ${bd}${params ? ', ' + params : ''})` : `http.request(${JSON.stringify(m)}, ${url}, ${bd}${params ? ', ' + params : ''})`;
      let path; try { path = new URL(r.url).pathname; } catch { path = r.url; }
      body.push(`  res = ${call};\n  check(res, { ${JSON.stringify(`${m} ${path} status is ${e.response?.status ?? 200}`)}: (r) => r.status === ${e.response?.status ?? 200} });` + (+o.sleep > 0 ? `\n  sleep(${+o.sleep});` : ''));
    }
    if (!body.length) throw new Error('No requests left after filtering');
    return `import http from 'k6/http';\nimport { check, sleep } from 'k6';\n\nexport const options = {\n  vus: ${Math.max(1, o.vus | 0)},\n  ${o.duration.trim() ? `duration: ${JSON.stringify(o.duration.trim())}` : 'iterations: 1'},\n};\n\nexport default function () {\n  let res;\n\n${body.join('\n\n')}\n}\n`;
  },
});
// docker run -> compose
function shellSplit(s) {
  const out = []; let cur = '', has = false, q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; else if (q === '"' && c === '\\' && /["\\$`]/.test(s[i + 1])) cur += s[++i]; else cur += c; continue; }
    if (c === '"' || c === "'") { q = c; has = true; }
    else if (c === '\\' && s[i + 1] === '\n') i++;
    else if (c === '\\') { cur += s[++i] ?? ''; has = true; }
    else if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ''; has = false; }
    else { cur += c; has = true; }
  }
  if (q) throw new Error('Unterminated quote in command');
  if (cur || has) out.push(cur);
  return out;
}
const ys = (v) => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : /^[A-Za-z_][\w./:-]*$/.test(v) && !/^(true|false|null|yes|no|on|off|y|n)$/i.test(v) ? v : JSON.stringify(v));
function ydump(v, ind = 0) {
  const pad = ' '.repeat(ind);
  if (Array.isArray(v)) return v.map((x) => (isObj(x) || Array.isArray(x) ? `${pad}-\n${ydump(x, ind + 2)}` : `${pad}- ${ys(x)}`)).join('\n');
  return Object.entries(v).map(([k, x]) => (x === null || (isObj(x) && !Object.keys(x).length) ? `${pad}${k}: ${x === null ? '' : '{}'}`.trimEnd() : isObj(x) || Array.isArray(x) ? `${pad}${k}:\n${ydump(x, ind + 2)}` : `${pad}${k}: ${ys(x)}`)).join('\n');
}
const DR_VAL = { p: 'ports', publish: 'ports', v: 'volumes', volume: 'volumes', e: 'environment', env: 'environment', 'env-file': 'env_file', name: 'container_name', network: 'networks', net: 'networks', restart: 'restart', w: 'working_dir', workdir: 'working_dir', u: 'user', user: 'user', h: 'hostname', hostname: 'hostname', entrypoint: 'entrypoint', l: 'labels', label: 'labels', 'cap-add': 'cap_add', 'cap-drop': 'cap_drop', device: 'devices', link: 'links', 'add-host': 'extra_hosts', dns: 'dns', platform: 'platform', expose: 'expose', tmpfs: 'tmpfs', 'security-opt': 'security_opt', 'group-add': 'group_add', m: 'mem_limit', memory: 'mem_limit', cpus: 'cpus', pid: 'pid', 'shm-size': 'shm_size', 'stop-signal': 'stop_signal', 'log-driver': 'logging', 'health-cmd': 'healthcheck', ulimit: 'ulimits', sysctl: 'sysctls', 'volumes-from': 'volumes_from', ipc: 'ipc', runtime: 'runtime' };
const DR_BOOL = { d: 0, detach: 0, i: 'stdin_open', t: 'tty', rm: 0, privileged: 'privileged', init: 'init', 'read-only': 'read_only', P: 0 };
T.push({
  id: 'docker-run-to-compose', cat: 'Converters+', title: 'docker run to docker-compose.yml', desc: 'Convert one or more docker run commands (ports, volumes, env, network, restart, limits, labels...) into a docker-compose.yml with named volumes extracted.',
  labels: ['docker run command(s)'], sample: 'docker run -d --name web \\\n  -p 8080:80 -p 443:443 \\\n  -v ./html:/usr/share/nginx/html:ro -v certs:/etc/ssl \\\n  -e NGINX_HOST=example.com -e "GREETING=hello world" \\\n  --restart unless-stopped --network frontend \\\n  nginx:1.27\n\ndocker run -it --rm --name db -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:16',
  run: ([s]) => {
    const cmds = s.replace(/\\\n/g, ' ').split(/\n+/).map((l) => l.trim()).filter((l) => /^(sudo\s+)?docker\s+(container\s+)?run\b/.test(l));
    if (!cmds.length) throw new Error('No "docker run" command found');
    const services = {}, volumes = {}, nets = {}, notes = [];
    for (const cmd of cmds) {
      const t = shellSplit(cmd); let i = t.findIndex((x) => x === 'run') + 1;
      const svc = {}; let image = null, rest = [];
      const add = (k, v) => { (svc[k] ||= []).push(v); };
      for (; i < t.length; i++) {
        const a = t[i];
        if (image) { rest.push(a); continue; }
        if (!a.startsWith('-') || a === '-') { image = a; continue; }
        if (a === '--') { image = t[++i]; continue; }
        let name, val;
        if (a.startsWith('--')) { const eq = a.indexOf('='); name = eq > 0 ? a.slice(2, eq) : a.slice(2); val = eq > 0 ? a.slice(eq + 1) : undefined; }
        else {
          const f = a.slice(1);
          if (f.length > 1 && [...f].every((c) => c in DR_BOOL)) { for (const c of f) if (DR_BOOL[c]) svc[DR_BOOL[c]] = true; continue; }
          name = f[0]; if (f.length > 1) val = f.slice(1);
        }
        if (name in DR_BOOL) { if (DR_BOOL[name]) svc[DR_BOOL[name]] = true; else if (name === 'rm') notes.push('--rm has no compose equivalent (use docker compose run --rm)'); continue; }
        if (!(name in DR_VAL)) { if (val === undefined && t[i + 1] && !t[i + 1].startsWith('-') && !image) { notes.push(`unsupported flag --${name} ${t[i + 1]} ignored`); i++; } else notes.push(`unsupported flag --${name} ignored`); continue; }
        if (val === undefined) val = t[++i];
        const key = DR_VAL[name];
        if (key === 'environment' && !val.includes('=')) val += '=';
        if (key === 'volumes') { const src = val.split(':')[0]; if (val.includes(':') && !/^[./~$]/.test(src) && !src.startsWith('/')) volumes[src] = null; }
        if (key === 'networks') { nets[val] = null; add('networks', val); continue; }
        if (['container_name', 'restart', 'working_dir', 'user', 'hostname', 'platform', 'mem_limit', 'cpus', 'pid', 'shm_size', 'stop_signal', 'ipc', 'runtime'].includes(key)) svc[key] = key === 'cpus' ? +val : val;
        else if (key === 'entrypoint') svc.entrypoint = val;
        else if (key === 'healthcheck') svc.healthcheck = { test: ['CMD-SHELL', val] };
        else if (key === 'logging') svc.logging = { driver: val };
        else add(key, val);
      }
      if (!image) throw new Error(`No image found in: ${cmd.slice(0, 60)}`);
      const sname = (svc.container_name || image.split('/').pop().split(':')[0].split('@')[0]).replace(/[^\w.-]/g, '-'); let n = sname; for (let k = 2; services[n]; k++) n = `${sname}-${k}`;
      const ordered = { image };
      for (const k of ['container_name', 'hostname', 'platform', 'entrypoint']) if (svc[k]) ordered[k] = svc[k];
      if (rest.length) ordered.command = rest.length === 1 ? rest[0] : rest;
      for (const k of Object.keys(svc)) if (!(k in ordered)) ordered[k] = svc[k];
      services[n] = ordered;
    }
    const doc = { services };
    if (Object.keys(volumes).length) doc.volumes = volumes;
    if (Object.keys(nets).length) doc.networks = Object.fromEntries(Object.keys(nets).map((k) => [k, { external: true }]));
    return ydump(doc) + (notes.length ? '\n' : '') + notes.map((x) => `# note: ${x}`).join('\n');
  },
});

// ---- tiny XML reader (for SVG) and SVG -> react-native-svg
function xmlParse(src) {
  const root = { name: '#root', attrs: {}, kids: [] }, stack = [root]; let i = 0;
  while (i < src.length) {
    if (src[i] !== '<') { const j = src.indexOf('<', i); const t = src.slice(i, j < 0 ? src.length : j); if (t.trim()) stack[stack.length - 1].kids.push({ text: t.replace(/\s+/g, ' ').trim() }); i = j < 0 ? src.length : j; continue; }
    if (src.startsWith('<!--', i)) { i = src.indexOf('-->', i) + 3 || src.length; continue; }
    if (src.startsWith('<![CDATA[', i)) { const j = src.indexOf(']]>', i); stack[stack.length - 1].kids.push({ text: src.slice(i + 9, j) }); i = j + 3; continue; }
    if (src[i + 1] === '?' || src[i + 1] === '!') { i = src.indexOf('>', i) + 1 || src.length; continue; }
    const end = (() => { let q = null; for (let j = i + 1; j < src.length; j++) { const c = src[j]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') return j; } return -1; })();
    if (end < 0) throw new Error('Malformed XML: unterminated tag');
    const body = src.slice(i + 1, end); i = end + 1;
    if (body[0] === '/') { if (stack.length < 2) throw new Error('Malformed XML: unexpected closing tag'); stack.pop(); continue; }
    const self = body.endsWith('/'), m = /^([^\s/>]+)([\s\S]*?)\/?$/.exec(body), attrs = {};
    for (const a of m[2].matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1]] = a[3] ?? a[4];
    const node = { name: m[1], attrs, kids: [] }; stack[stack.length - 1].kids.push(node);
    if (!self) stack.push(node);
  }
  if (stack.length > 1) throw new Error(`Malformed XML: <${stack[stack.length - 1].name}> is not closed`);
  return root;
}
const RN = { svg: 'Svg', g: 'G', path: 'Path', circle: 'Circle', ellipse: 'Ellipse', rect: 'Rect', line: 'Line', polygon: 'Polygon', polyline: 'Polyline', text: 'Text', tspan: 'TSpan', defs: 'Defs', lineargradient: 'LinearGradient', radialgradient: 'RadialGradient', stop: 'Stop', clippath: 'ClipPath', mask: 'Mask', use: 'Use', symbol: 'Symbol', pattern: 'Pattern', image: 'Image', marker: 'Marker', textpath: 'TextPath' };
const RN_NAME = { linearGradient: 'LinearGradient', radialGradient: 'RadialGradient', clipPath: 'ClipPath', textPath: 'TextPath' };
const attrName = (k) => (k === 'class' ? null : k === 'xlink:href' ? 'href' : /^(xmlns|xml:|data-|xmlns:)/.test(k) ? null : k.replace(/[-:]([a-z])/g, (_, c) => c.toUpperCase()));
T.push({
  id: 'svg-to-react-native', cat: 'Converters+', title: 'SVG to React Native (react-native-svg)', desc: 'Convert SVG markup into a react-native-svg component (TSX or JSX): elements mapped to Svg / Path / Circle..., attributes camelCased, props spread onto the root.',
  labels: ['SVG code'], sample: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">\n  <!-- check -->\n  <circle cx="12" cy="12" r="10" class="ring" style="opacity:0.5;stroke-dasharray: 4 2"/>\n  <path d="M8 12l3 3 5-6"/>\n</svg>',
  opts: [sel('lang', 'Output', 'TSX', ['TSX', 'JSX']), txt('name', 'Component name', 'Icon')],
  run: ([s], o) => {
    const doc = xmlParse(s), svg = doc.kids.find((k) => k.name === 'svg'); if (!svg) throw new Error('No <svg> root element found');
    const used = new Set(), ts = o.lang === 'TSX';
    const el = (n, ind, root) => {
      if (n.text !== undefined) return ind + n.text.replace(/[{}<>]/g, (c) => `{'${c}'}`);
      const comp = RN[n.name.toLowerCase()] ? (RN_NAME[n.name] || RN[n.name.toLowerCase()]) : null;
      if (!comp) return `${ind}{/* <${n.name}> is not supported by react-native-svg */}`;
      used.add(comp);
      const props = [];
      for (const [k, v] of Object.entries(n.attrs)) {
        if (k === 'style') { for (const d of v.split(';')) { const [pk, ...pv] = d.split(':'); if (pk && pv.length) { const nk = attrName(pk.trim()); if (nk) props.push(`${nk}="${pv.join(':').trim()}"`); } } continue; }
        const nk = attrName(k); if (nk) props.push(`${nk}=${/^-?\d+(\.\d+)?$/.test(v) && !/^(id|d|points|x|y)$/.test(nk) && 0 ? `{${v}}` : JSON.stringify(v)}`);
      }
      if (root) props.push('{...props}');
      const open = `${ind}<${comp}${props.length ? ' ' + props.join(' ') : ''}`;
      if (!n.kids.length) return open + ' />';
      return `${open}>\n${n.kids.map((c) => el(c, ind + '  ')).join('\n')}\n${ind}</${comp}>`;
    };
    const body = el(svg, '  ', true), comps = [...used].sort(), def = comps.filter((c) => c !== 'Svg');
    const name = pascal(o.name || 'Icon');
    return `import * as React from 'react';\nimport Svg${def.length ? `, { ${def.join(', ')}${ts ? ', SvgProps' : ''} }` : ts ? ', { SvgProps }' : ''} from 'react-native-svg';\n\nconst ${name} = (props${ts ? ': SvgProps' : ''}) => (\n${body}\n);\n\nexport default ${name};\n`;
  },
});
// .env -> JSON
T.push({
  id: 'env-to-json', cat: 'Converters+', title: '.env to JSON', desc: 'Parse a dotenv file (export prefix, quotes, escapes, comments, multi-line values, ${VAR} expansion) into a JSON object.',
  labels: ['.env file'], sample: '# app\nexport NODE_ENV=production\nPORT=3000\nDEBUG=false\nDB_URL="postgres://u:p@localhost/db"\nGREETING="hello\\nworld"\nRAW=\'$not_expanded\'\nBASE=http://x\nAPI=${BASE}/v1 # comment\nEMPTY=\nPEM="line1\nline2"',
  opts: [chk('types', 'Convert numbers and booleans', false), chk('expand', 'Expand ${VAR} references', true), sel('nest', 'Nest keys on', 'none', ['none', '__', '_'])],
  run: ([s], o) => {
    const out = {}, L = s.replace(/\r\n?/g, '\n').split('\n'); const lit = new Set();
    for (let i = 0; i < L.length; i++) {
      const line = L[i].trim(); if (!line || line[0] === '#') continue;
      const m = /^(?:export\s+)?([A-Za-z_][\w.-]*)\s*=\s*(.*)$/.exec(line);
      if (!m) throw new Error(`Line ${i + 1}: expected KEY=value`);
      let [, k, v] = m; const start = i + 1;
      if (v[0] === '"' || v[0] === "'") {
        const q = v[0]; let acc = v.slice(1), end;
        while ((end = q === '"' ? acc.search(/(?<!\\)"/) : acc.indexOf("'")) < 0) { if (++i >= L.length) throw new Error(`Line ${start}: unterminated ${q} quote for ${k}`); acc += '\n' + L[i]; }
        v = acc.slice(0, end);
        if (q === '"') v = v.replace(/\\([nrt"\\$])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t' }[c] ?? c)); else lit.add(k);
      } else v = v.replace(/\s+#.*$/, '').trim();
      out[k] = v;
    }
    if (o.expand) for (const k of Object.keys(out)) if (!lit.has(k)) out[k] = out[k].replace(/\$\{([A-Za-z_]\w*)(?::-([^}]*))?\}/g, (_, n, d) => out[n] ?? d ?? '');
    const val = (v) => (o.types && /^(true|false)$/i.test(v) ? v.toLowerCase() === 'true' : o.types && /^-?\d+(\.\d+)?$/.test(v) && Number.isSafeInteger(+v) ? +v : v);
    if (o.nest === 'none') return J(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, val(v)])));
    const root = {};
    for (const [k, v] of Object.entries(out)) { const p = k.toLowerCase().split(o.nest); let c = root; p.forEach((t, i) => { if (i === p.length - 1) c[t] = val(v); else c = isObj(c[t]) ? c[t] : (c[t] = {}); }); }
    return J(root);
  },
});
// HTML table -> JSON
const decodeEnt = (s) => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }[e.toLowerCase()]));
T.push({
  id: 'html-table-to-json', cat: 'Converters+', title: 'HTML Table to JSON', desc: 'Extract <table> elements from HTML and convert them to JSON: array of objects keyed by the header row, or raw arrays.',
  labels: ['HTML containing table(s)'], sample: '<table>\n <thead><tr><th>Name</th><th>Qty</th><th>Price</th></tr></thead>\n <tbody>\n  <tr><td>Widget &amp; Co</td><td>3</td><td>9.99</td></tr>\n  <tr><td><b>Gadget</b></td><td>10</td><td>24.50</td></tr>\n </tbody>\n</table>',
  opts: [num('which', 'Table number (0 = all)', 1), sel('shape', 'Output', 'objects', ['objects', 'arrays']), chk('types', 'Convert numbers', true)],
  run: ([s], o) => {
    const tables = [...s.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)].map((m) => m[1]);
    if (!tables.length) throw new Error('No <table> found');
    const conv = (t) => {
      const rows = [...t.matchAll(/<tr\b[^>]*>([\s\S]*?)(?=<\/tr\s*>|<tr\b|$)/gi)].map((r) => [...r[1].matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)(?=<\/t[hd]\s*>|<t[hd]\b|$)/gi)].map((c) => ({ th: c[1].toLowerCase() === 'th', v: decodeEnt(c[2].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t\r\n\u00a0]+/g, ' ').trim() }))).filter((r) => r.length);
      const val = (v) => (o.types && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
      if (o.shape === 'arrays') return rows.map((r) => r.map((c) => val(c.v)));
      if (!rows.length) return [];
      const head = rows[0].map((c, i) => c.v || `column${i + 1}`), seen = {};
      const keys = head.map((h) => { seen[h] = (seen[h] || 0) + 1; return seen[h] > 1 ? `${h}_${seen[h]}` : h; });
      return rows.slice(1).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ? val(r[i].v) : null])));
    };
    const w = o.which | 0;
    if (w > tables.length) throw new Error(`Only ${tables.length} table(s) found`);
    return J(w === 0 ? tables.map(conv) : conv(tables[Math.max(1, w) - 1]));
  },
});
T.push({
  id: 'list-to-sql-in', cat: 'Converters+', title: 'List to SQL IN Clause', desc: 'Turn a pasted column of values into a quoted, escaped IN (...) list. Auto-detects numbers, optional dedupe and Oracle-safe 1000-item chunks.',
  labels: ['Values, one per line (or comma-separated)'], sample: "apple\nbanana\nO'Brien\n42\nbanana", opts: [txt('col', 'Column name (empty = list only)', 'name'), sel('quote', 'Quoting', 'auto', ['auto', 'always', 'never']), chk('dedupe', 'Remove duplicates', true), chk('trim', 'Trim values', true), chk('not', 'NOT IN', false), chk('oracle', 'Chunk by 1000 (Oracle)', false)],
  run: ([s], o) => {
    let v = s.split(/\r?\n/).flatMap((l) => (l.includes(',') && !/^\s*['"]/.test(l) ? l.split(',') : [l])).map((x) => (o.trim ? x.trim() : x)).filter((x) => x !== '');
    if (o.dedupe) v = [...new Set(v)];
    if (!v.length) throw new Error('Enter at least one value');
    const q = o.quote === 'always' ? true : o.quote === 'never' ? false : !v.every((x) => /^-?\d+(\.\d+)?$/.test(x));
    const f = (x) => (q ? `'${x.replace(/'/g, "''")}'` : x), op = o.not ? 'NOT IN' : 'IN';
    const chunks = o.oracle ? Array.from({ length: Math.ceil(v.length / 1000) }, (_, i) => v.slice(i * 1000, i * 1000 + 1000)) : [v];
    const c = o.col.trim();
    if (!c) return `(${v.map(f).join(', ')})`;
    return chunks.length === 1 ? `${c} ${op} (${chunks[0].map(f).join(', ')})` : '(' + chunks.map((ch) => `${c} ${op} (${ch.map(f).join(', ')})`).join(o.not ? ' AND ' : ' OR ') + ')';
  },
});
// durations
const DU = { ms: 1, s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000, m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000, h: 3600000, hr: 3600000, hrs: 3600000, hour: 3600000, hours: 3600000, d: 86400000, day: 86400000, days: 86400000, w: 604800000, wk: 604800000, week: 604800000, weeks: 604800000 };
function parseDur(t, bare) {
  t = t.trim(); let sign = 1;
  if (/^[-+]/.test(t)) { if (t[0] === '-') sign = -1; t = t.slice(1).trim(); }
  let m;
  if ((m = /^(?:(\d+):)?(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?$/.exec(t))) return sign * ((+(m[1] || 0) * 3600 + +m[2] * 60 + +m[3]) * 1000 + (m[4] ? +m[4].padEnd(3, '0') : 0));
  if (/^\d+(\.\d+)?$/.test(t)) return sign * parseFloat(t) * DU[bare];
  let total = 0, rest = t.toLowerCase();
  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)\s*(?:,|and)?\s*/y; let any = false;
  while (rest.length > re.lastIndex) { const x = re.exec(rest); if (!x || !(x[2] in DU)) throw new Error(`Cannot read duration "${t}"`); total += parseFloat(x[1]) * DU[x[2]]; any = true; }
  if (!any) throw new Error(`Cannot read duration "${t}"`);
  return sign * total;
}
const fmtDur = (ms) => {
  const neg = ms < 0; ms = Math.round(Math.abs(ms)); const p = [[864e5, 'd'], [36e5, 'h'], [6e4, 'm'], [1e3, 's'], [1, 'ms']]; const out = [];
  for (const [u, n] of p) { const q = Math.floor(ms / u); ms -= q * u; if (q) out.push(q + n); }
  return (neg ? '-' : '') + (out.join(' ') || '0s');
};
T.push({
  id: 'time-duration-calculator', cat: 'Converters+', title: 'Time Duration Calculator', desc: 'Add, subtract or average durations written as 1h 30m, 2d 4h, 90 min or 01:30:45 and see the total in every unit.',
  labels: ['One duration per line (prefix - to subtract in sum mode; 1:30 means 1 min 30 s, 1:30:00 means 1 h 30 min)'], sample: '1h 30m\n45 min\n02:15:30\n-10m\n1d 2h', opts: [sel('op', 'Operation', 'sum', ['sum', 'first minus rest', 'average']), sel('bare', 'Bare numbers mean', 'minutes', ['seconds', 'minutes', 'hours'])],
  run: ([s], o) => {
    const bare = { seconds: 's', minutes: 'min', hours: 'h' }[o.bare], v = lines(s).map((l) => ({ l, ms: parseDur(l.replace(/^[+*•]\s*/, ''), bare) }));
    if (!v.length) throw new Error('Enter at least one duration');
    let total = o.op === 'average' ? v.reduce((a, x) => a + x.ms, 0) / v.length : o.op === 'sum' ? v.reduce((a, x) => a + x.ms, 0) : v.slice(1).reduce((a, x) => a - Math.abs(x.ms), v[0].ms);
    const t = Math.round(total), h = Math.floor(Math.abs(t) / 36e5), mi = Math.floor(Math.abs(t) % 36e5 / 6e4), se = Math.floor(Math.abs(t) % 6e4 / 1e3), ms = Math.abs(t) % 1e3;
    const r = (x) => +x.toFixed(4);
    return [...v.map((x) => `${x.l.padEnd(14)} = ${fmtDur(x.ms)}`), '', `${o.op === 'average' ? 'Average' : 'Result'}: ${fmtDur(t)}`, `Clock:        ${t < 0 ? '-' : ''}${h}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}${ms ? '.' + String(ms).padStart(3, '0') : ''}`, `Days:         ${r(t / 864e5)}`, `Hours:        ${r(t / 36e5)}`, `Minutes:      ${r(t / 6e4)}`, `Seconds:      ${r(t / 1e3)}`, `Milliseconds: ${t}`].join('\n');
  },
});
const fnum = (x) => String(+x.toFixed(4));
T.push({
  id: 'px-to-rem-converter', cat: 'Converters+', title: 'PX to REM / EM Converter', desc: 'Convert pixel values to rem/em (or back) for a chosen root size, or rewrite every px value inside pasted CSS to rem.',
  labels: ['Values (8, 12px, 1.5rem...) one per line, or CSS when "Rewrite CSS" is chosen'], sample: '12\n14px\n16\n24\n32', opts: [sel('mode', 'Mode', 'px to rem', ['px to rem', 'rem to px', 'Rewrite CSS (px to rem)']), num('base', 'Root font size (px)', 16)],
  run: ([s], o) => {
    const b = +o.base; if (!(b > 0)) throw new Error('Root font size must be positive');
    if (o.mode.startsWith('Rewrite')) return s.replace(/(-?\d*\.?\d+)px\b/g, (m, n) => (+n === 0 ? '0' : fnum(+n / b) + 'rem'));
    const rows = lines(s).map((l) => { const n = parseFloat(l); if (Number.isNaN(n)) throw new Error(`Not a number: ${l}`); return n; });
    return o.mode === 'px to rem' ? ['px\trem/em', ...rows.map((n) => `${n}px\t${fnum(n / b)}rem`)].join('\n') : ['rem\tpx', ...rows.map((n) => `${n}rem\t${fnum(n * b)}px`)].join('\n');
  },
});
T.push({
  id: 'css-clamp-generator', cat: 'Converters+', title: 'CSS clamp() Fluid Value Generator', desc: 'Compute a fluid clamp(min, preferred, max) that scales linearly between two viewport widths, in rem with a vw slope.',
  inputs: 0, sample: '', opts: [num('min', 'Min size (px)', 16), num('max', 'Max size (px)', 32), num('vmin', 'Min viewport (px)', 375), num('vmax', 'Max viewport (px)', 1280), num('base', 'Root font size (px)', 16)],
  run: (_, o) => {
    const { min, max, vmin, vmax, base } = Object.fromEntries(['min', 'max', 'vmin', 'vmax', 'base'].map((k) => [k, +o[k]]));
    if (!(vmax > vmin) || !(base > 0)) throw new Error('Max viewport must be larger than min viewport');
    const slope = (max - min) / (vmax - vmin), inter = min - slope * vmin, lo = Math.min(min, max), hi = Math.max(min, max);
    const val = `clamp(${fnum(lo / base)}rem, ${fnum(inter / base)}rem + ${fnum(slope * 100)}vw, ${fnum(hi / base)}rem)`;
    return `${val}\n\nfont-size: ${val};\n\n/* ${min}px at ${vmin}px viewport -> ${max}px at ${vmax}px viewport */`;
  },
});
T.push({
  id: 'http-headers-to-json', cat: 'Converters+', title: 'HTTP Headers to JSON', desc: 'Convert raw HTTP request/response headers (or a status line plus headers) to a JSON object; repeated headers become arrays.',
  labels: ['Raw headers'], sample: 'HTTP/1.1 200 OK\nContent-Type: application/json; charset=utf-8\nCache-Control: no-store\nSet-Cookie: a=1; Path=/\nSet-Cookie: b=2; HttpOnly\nX-Request-Id: 7f3a', opts: [chk('lower', 'Lowercase header names', false)],
  run: ([s], o) => {
    const out = {}; let status = null;
    for (const l of s.split(/\r?\n/)) {
      if (!l.trim()) continue;
      if (/^HTTP\/[\d.]+\s+\d{3}/i.test(l)) { status = l.trim(); continue; }
      if (/^[A-Z]+ \S+ HTTP\/[\d.]+$/.test(l.trim())) { status = l.trim(); continue; }
      if (/^\s/.test(l)) { const k = Object.keys(out).pop(); if (k) out[k] = Array.isArray(out[k]) ? out[k].map((x, i, a) => (i === a.length - 1 ? x + ' ' + l.trim() : x)) : out[k] + ' ' + l.trim(); continue; }
      const i = l.indexOf(':'); if (i < 1) throw new Error(`Not a header line: "${l}"`);
      const k = o.lower ? l.slice(0, i).trim().toLowerCase() : l.slice(0, i).trim(), v = l.slice(i + 1).trim();
      out[k] = k in out ? [].concat(out[k], v) : v;
    }
    return J(status ? { _status: status, ...out } : out);
  },
});
const CRYPTO_U = { wei: 0n, kwei: 3n, mwei: 6n, gwei: 9n, szabo: 12n, finney: 15n, ether: 18n };
T.push({
  id: 'crypto-unit-converter', cat: 'Converters+', title: 'Ethereum Unit Converter (wei / gwei / ether)', desc: 'Exact BigInt conversion between wei, kwei, mwei, gwei, szabo, finney and ether, plus Bitcoin satoshi / BTC.',
  labels: ['Amount'], sample: '1.5', opts: [sel('from', 'From unit', 'ether', [...Object.keys(CRYPTO_U), 'BTC', 'satoshi'])],
  run: ([s], o) => {
    s = s.trim().replace(/[_,]/g, ''); if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('Enter a non-negative decimal number');
    const dec = (u) => (u === 'BTC' ? 8n : u === 'satoshi' ? 0n : CRYPTO_U[u]);
    const [ip, fp = ''] = s.split('.'), d = dec(o.from);
    if (BigInt(fp.length) > d) throw new Error(`${o.from} supports at most ${d} decimal places`);
    const base = BigInt(ip + fp.padEnd(Number(d), '0')); // in smallest unit
    const show = (n, dd) => { const str = n.toString().padStart(Number(dd) + 1, '0'); const w = str.slice(0, str.length - Number(dd)), f = str.slice(str.length - Number(dd)).replace(/0+$/, ''); return f ? `${w}.${f}` : w; };
    const rows = o.from === 'BTC' || o.from === 'satoshi' ? [['satoshi', 0n], ['BTC', 8n]] : Object.entries(CRYPTO_U);
    return rows.map(([n, dd]) => `${n.padEnd(8)} ${show(base, dd)}`).join('\n');
  },
});
T.push({
  id: 'json-array-chunker', cat: 'JSON+', title: 'JSON Array Splitter / Chunker', desc: 'Split a JSON array into chunks of N items (or N chunks) and output them as an array of arrays or separate JSON documents.',
  labels: ['JSON array'], sample: '[1,2,3,4,5,6,7,8,9,10]', opts: [sel('by', 'Split by', 'items per chunk', ['items per chunk', 'number of chunks']), num('n', 'N', 3), sel('out', 'Output', 'array of arrays', ['array of arrays', 'one document per chunk (NDJSON)'])],
  run: ([s], o) => {
    const a = parseJ(s); if (!Array.isArray(a)) throw new Error('Input must be a JSON array');
    const n = Math.max(1, o.n | 0), size = o.by === 'items per chunk' ? n : Math.ceil(a.length / n) || 1, ch = [];
    for (let i = 0; i < a.length; i += size) ch.push(a.slice(i, i + size));
    return o.out.startsWith('array') ? J(ch) : ch.map((c) => JSON.stringify(c)).join('\n');
  },
});

// ---------------- Text+
const RESERVED_SQL = new Set('select insert update delete from where table order group by user group index key primary foreign references check default null not and or join left right inner outer on as in is like between limit offset union all distinct having create drop alter column values set case when then else end true false desc asc'.split(' '));
T.push({
  id: 'sql-slugifier', cat: 'Text+', title: 'SQL Identifier Slugifier', desc: 'Turn titles, CSV headers or free text into safe snake_case table/column names: accents removed, no leading digit, reserved words suffixed, duplicates numbered.',
  labels: ['Names, one per line'], sample: 'First Name\nE-mail address\n2024 Revenue (EUR)\nOrder\nCafé Étage\nfirst name', opts: [sel('style', 'Style', 'snake_case', ['snake_case', 'camelCase', 'kebab-case (quoted)']), num('max', 'Max length (PostgreSQL 63, MySQL 64)', 63), chk('reserved', 'Suffix reserved words with _', true)],
  run: ([s], o) => {
    const seen = new Map(), max = Math.max(8, o.max | 0 || 63);
    return s.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
      let w = l.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[ß]/g, 'ss').replace(/[&]/g, ' and ').replace(/%/g, ' pct ').replace(/#/g, ' num ').replace(/@/g, ' at ').replace(/[^\x00-\x7f]/g, ' ');
      const parts = words(w).map((x) => x.toLowerCase());
      let id = o.style === 'camelCase' ? parts.map((x, i) => (i ? x[0].toUpperCase() + x.slice(1) : x)).join('') : parts.join(o.style.startsWith('kebab') ? '-' : '_');
      if (!id) id = 'col'; if (/^\d/.test(id)) id = '_' + id;
      if (o.reserved && RESERVED_SQL.has(id.toLowerCase())) id += '_';
      id = id.slice(0, max); const base = id; const n = (seen.get(base) || 0) + 1; seen.set(base, n);
      if (n > 1) id = base.slice(0, max - String(n).length - 1) + '_' + n;
      return id;
    }).join('\n');
  },
});
// subtitles
const tms = (t) => { const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(t.trim()); if (!m) throw new Error(`Bad timestamp "${t}"`); return ((+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3]) * 1000 + +m[4].padEnd(3, '0'); };
const fms = (ms, sep) => { ms = Math.max(0, Math.round(ms)); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 36e5))}:${p(Math.floor(ms / 6e4) % 60)}:${p(Math.floor(ms / 1e3) % 60)}${sep}${p(ms % 1000, 3)}`; };
T.push({
  id: 'subtitle-srt-vtt-converter', cat: 'Text+', title: 'Subtitle Converter SRT <-> VTT (with time shift)', desc: 'Convert SubRip (.srt) and WebVTT (.vtt) both ways, auto-detecting the input, and shift every cue earlier or later by milliseconds.',
  labels: ['Subtitles (SRT or VTT)'], sample: '1\n00:00:01,000 --> 00:00:03,500\nHello there!\n\n2\n00:00:04,000 --> 00:00:06,250\n<i>General Kenobi</i>\nYou are a bold one.\n', opts: [sel('to', 'Convert to', 'auto (opposite)', ['auto (opposite)', 'SRT', 'VTT']), num('shift', 'Shift all cues by (ms, negative = earlier)', 0)],
  run: ([s], o) => {
    const text = s.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim(), isVtt = /^WEBVTT/.test(text), shift = +o.shift || 0, cues = [];
    for (const block of text.split(/\n{2,}/)) {
      const ls = block.split('\n'), i = ls.findIndex((l) => l.includes('-->'));
      if (i < 0 || /^(NOTE|STYLE|REGION)\b/.test(ls[0])) continue;
      const m = /^(\S+)\s+-->\s+(\S+)/.exec(ls[i]); if (!m) throw new Error(`Bad cue timing line: ${ls[i]}`);
      cues.push({ a: tms(m[1]) + shift, b: tms(m[2]) + shift, text: ls.slice(i + 1).join('\n') });
    }
    if (!cues.length) throw new Error('No subtitle cues found');
    const to = o.to === 'auto (opposite)' ? (isVtt ? 'SRT' : 'VTT') : o.to;
    return (to === 'VTT' ? 'WEBVTT\n\n' : '') + cues.map((c, k) => `${to === 'SRT' ? `${k + 1}\n` : ''}${fms(c.a, to === 'SRT' ? ',' : '.')} --> ${fms(c.b, to === 'SRT' ? ',' : '.')}\n${c.text}`).join('\n\n') + '\n';
  },
});
T.push({
  id: 'regex-escape', cat: 'Text+', title: 'Regex Escape / Unescape', desc: 'Escape literal text so it can be embedded in a regular expression (JavaScript, Python, Java, PHP, Go, POSIX) or unescape it back.',
  labels: ['Text'], sample: 'price: $5.00 (approx.) [a-z]+ {1,2} a|b ^start end$ back\\slash', opts: [sel('mode', 'Mode', 'escape', ['escape', 'unescape']), sel('lang', 'Flavor', 'JavaScript', ['JavaScript', 'Python', 'Java', 'PHP', 'Go', 'POSIX ERE'])],
  run: ([s], o) => {
    if (o.mode === 'unescape') return s.replace(/\\([\s\S])/g, '$1');
    const sets = { JavaScript: /[.*+?^${}()|[\]\\/]/g, Python: /[.^$*+?{}[\]\\|()\-#&~ ]/g, Java: /[.*+?^${}()|[\]\\]/g, PHP: /[.\\+*?[^\]$(){}=!<>|:\-#/]/g, Go: /[\\.+*?()|[\]{}^$]/g, 'POSIX ERE': /[.[\]{}()\\*+?|^$]/g };
    let r = s.replace(sets[o.lang] || sets.JavaScript, '\\$&');
    if (o.lang === 'Java') r = r.replace(/\n/g, '\\n');
    return r;
  },
});
// token estimator (APPROXIMATE)
const MODELS = {
  'GPT-4o / o-series (o200k-like)': { cpt: 4.2, num: 3.2, cjk: 1.1, w: 5.2 },
  'GPT-4 / 3.5 (cl100k-like)': { cpt: 3.9, num: 3, cjk: 1.5, w: 4.6 },
  'Claude (Anthropic)': { cpt: 3.5, num: 2.6, cjk: 1.2, w: 4.0 },
  'DeepSeek (V3 / R1)': { cpt: 4.0, num: 3.3, cjk: 0.8, w: 4.8 },
  'Llama 3 / Mistral': { cpt: 4.0, num: 3, cjk: 1.3, w: 4.8 },
};
function estTokens(s, m) {
  let t = 0; const re = /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])|(\p{L}[\p{L}'’]*)|(\p{N}+)|(\s+)|([^\s\p{L}\p{N}])/gu; let x;
  while ((x = re.exec(s))) {
    if (x[1]) t += m.cjk;
    else if (x[2]) t += Math.max(1, Math.ceil(x[2].length / m.w));
    else if (x[3]) t += Math.ceil(x[3].length / m.num);
    else if (x[4]) t += /\n/.test(x[4]) ? 1 : x[4].length > 1 ? 1 : 0; // single spaces ride along with the next word
    else t += [...x[5]].length > 1 ? 2 : 1;
  }
  const byChars = [...s].length / m.cpt;
  return Math.round((t + byChars) / 2); // blend the word/punctuation heuristic with the chars-per-token ratio
}
T.push({
  id: 'llm-token-estimator', cat: 'Text+', title: 'LLM Token Count Estimator (approximate)', desc: 'ESTIMATE of token counts for GPT-4o, GPT-4, Claude, DeepSeek and Llama from text, using per-model chars-per-token ratios and a word/punctuation heuristic. No vocabulary is available offline, so counts are approximate (typically within 10-20% for English).',
  labels: ['Text or prompt'], sample: 'The quick brown fox jumps over the lazy dog. Tokenizers split text into sub-word pieces, so numbers like 1234567 and code such as `fn main() {}` cost more than plain words.',
  opts: [num('price', 'Price per 1M input tokens (USD, 0 = skip)', 0)],
  run: ([s], o) => {
    if (!s) throw new Error('Enter some text');
    const chars = [...s].length, wc = (s.match(/\S+/g) || []).length;
    const rows = Object.entries(MODELS).map(([n, m]) => { const t = estTokens(s, m); return `${n.padEnd(34)} ~${String(t).padStart(7)} tokens   (${(chars / Math.max(1, t)).toFixed(2)} chars/token, range ${Math.round(t * 0.85)}-${Math.round(t * 1.2)})${+o.price > 0 ? `   ~$${((t / 1e6) * o.price).toFixed(6)}` : ''}`; });
    return [`${chars} characters, ${wc} words, ${s.split('\n').length} lines`, '', ...rows, '', 'APPROXIMATE: real tokenizers (tiktoken, Claude, DeepSeek) use learned vocabularies that cannot ship offline here.', 'Use the provider token-count API when exact numbers matter (billing, hard context limits).'].join('\n');
  },
});
// RAG chunking visualizer
const CH_COL = ['#dbeafe', '#fef3c7', '#dcfce7', '#fce7f3', '#ede9fe', '#ffedd5'];
function ragChunks(text, size, overlap, strategy, unit) {
  const meas = unit === 'words' ? (a, b) => (text.slice(a, b).match(/\S+/g) || []).length : unit === 'tokens (~chars/4)' ? (a, b) => Math.ceil((b - a) / 4) : (a, b) => b - a;
  const out = [];
  if (strategy === 'fixed window') {
    if (unit === 'words') {
      const w = [...text.matchAll(/\S+/g)].map((m) => [m.index, m.index + m[0].length]);
      for (let i = 0; i < w.length; i += Math.max(1, size - overlap)) { out.push([w[i][0], w[Math.min(i + size, w.length) - 1][1]]); if (i + size >= w.length) break; }
    } else {
      const k = unit === 'characters' ? 1 : 4, S = size * k, O = overlap * k;
      for (let i = 0; i < text.length; i += Math.max(1, S - O)) { out.push([i, Math.min(i + S, text.length)]); if (i + S >= text.length) break; }
    }
    return out.map(([a, b]) => ({ a, b, n: meas(a, b) }));
  }
  const seps = strategy === 'sentences' ? [/(?<=[.!?])\s+/g] : [/\n\n+/g, /\n/g, /(?<=[.!?])\s+/g, /\s+/g];
  const segs = [];
  const split = (a, b, lvl) => {
    if (meas(a, b) <= size || lvl >= seps.length) {
      if (meas(a, b) > size) { const step = unit === 'words' ? 0 : unit === 'characters' ? size : size * 4; if (step) for (let i = a; i < b; i += step) segs.push([i, Math.min(b, i + step)]); else segs.push([a, b]); } else segs.push([a, b]);
      return;
    }
    let last = a; const re = new RegExp(seps[lvl].source, 'g'); const piece = text.slice(a, b); let m; const cuts = [];
    while ((m = re.exec(piece))) { if (!m[0].length) { re.lastIndex++; continue; } cuts.push(a + m.index + m[0].length); }
    if (!cuts.length) return split(a, b, lvl + 1);
    for (const c of [...cuts, b]) { if (c > last) { split(last, c, lvl + 1); last = c; } }
  };
  split(0, text.length, 0);
  let i = 0;
  while (i < segs.length) {
    let j = i; while (j + 1 < segs.length && meas(segs[i][0], segs[j + 1][1]) <= size) j++;
    out.push({ a: segs[i][0], b: segs[j][1], n: meas(segs[i][0], segs[j][1]) });
    if (j + 1 >= segs.length) break;
    let k = j + 1; while (k - 1 > i && meas(segs[k - 1][0], segs[j][1]) <= overlap) k--;
    i = Math.max(i + 1, k);
  }
  return out;
}
T.push({
  id: 'rag-chunking-visualizer', cat: 'Text+', title: 'RAG Chunking Visualizer', desc: 'See how a document splits into retrieval chunks: fixed window, sentence or recursive (paragraph, line, sentence, word) splitting with size and overlap. Chunks are color coded and overlaps highlighted (recursive and sentence modes overlap by whole segments, so overlap can be 0 when segments are large).',
  labels: ['Document text'], sample: 'Retrieval-augmented generation splits documents into chunks before embedding them.\n\nChunk size controls how much context each vector carries. Too small and the meaning is lost; too large and retrieval becomes noisy.\n\nOverlap repeats a little text at each boundary, so a sentence that straddles two chunks is still found. It costs extra storage, though.\n\nTry a recursive split: it prefers paragraph breaks, then lines, then sentences, and only cuts words as a last resort.',
  opts: [num('size', 'Chunk size', 200), num('overlap', 'Overlap', 40), sel('unit', 'Unit', 'characters', ['characters', 'words', 'tokens (~chars/4)']), sel('strategy', 'Strategy', 'recursive', ['recursive', 'sentences', 'fixed window'])],
  run: ([s], o) => {
    if (!s.trim()) throw new Error('Enter some text');
    const size = Math.max(1, o.size | 0), overlap = Math.min(Math.max(0, o.overlap | 0), size - 1), ch = ragChunks(s, size, overlap, o.strategy, o.unit);
    const sizes = ch.map((c) => c.n);
    let body = ''; 
    ch.forEach((c, i) => {
      const prevEnd = i ? ch[i - 1].b : 0, ov = i && prevEnd > c.a ? Math.min(prevEnd, c.b) : c.a;
      body += `<div class="c" style="background:${CH_COL[i % CH_COL.length]}"><div class="h">#${i + 1} &middot; chars ${c.a}-${c.b} &middot; ${c.n} ${o.unit.split(' ')[0]}${ov > c.a ? ` &middot; overlap ${ov - c.a} chars` : ''}</div>${ov > c.a ? `<mark>${esc(s.slice(c.a, ov))}</mark>` : ''}${esc(s.slice(ov, c.b))}</div>`;
    });
    const covered = ch.reduce((a, c, i) => a + c.b - Math.max(c.a, i ? ch[i - 1].b : 0), 0);
    const stats = `${ch.length} chunks &middot; avg ${(sizes.reduce((a, b) => a + b, 0) / ch.length).toFixed(1)} / min ${Math.min(...sizes)} / max ${Math.max(...sizes)} ${o.unit.split(' ')[0]} &middot; ${s.length} chars total, ${Math.round(100 * (ch.reduce((a, c) => a + c.b - c.a, 0) / s.length - 1))}% duplicated by overlap${covered < s.trim().length - 1 ? ' &middot; gaps: some text is not covered' : ''}`;
    return { html: `<!doctype html><meta charset="utf-8"><style>body{font:14px/1.5 system-ui,sans-serif;margin:12px;color:#111}.c{border-radius:8px;padding:8px 10px;margin:0 0 10px;white-space:pre-wrap;word-break:break-word}.h{font:600 11px system-ui;opacity:.65;margin-bottom:4px}mark{background:#fde047;border-radius:3px}.s{margin:0 0 12px;font-weight:600}</style><p class="s">${stats}</p>${body}` };
  },
});
T.push({
  id: 'text-prefix-suffix-appender', cat: 'Text+', title: 'Add Prefix / Suffix to Lines', desc: 'Wrap every line with a prefix and/or suffix (quotes, commas, SQL, HTML tags...), optionally numbering lines or skipping blanks.',
  labels: ['Lines'], sample: 'alpha\nbeta\n\ngamma', opts: [txt('prefix', 'Prefix', '"'), txt('suffix', 'Suffix', '",'), chk('skip', 'Skip empty lines', true), chk('trim', 'Trim lines first', true), chk('number', 'Replace {n} with the line number', false)],
  run: ([s], o) => { let n = 0; return s.split(/\r?\n/).map((l) => { if (o.trim) l = l.trim(); if (!l && o.skip) return null; n++; const sub = (x) => (o.number ? x.replace(/\{n\}/g, n) : x); return sub(o.prefix) + l + sub(o.suffix); }).filter((x) => x !== null).join('\n'); },
});
T.push({
  id: 'text-duplicate-line-counter', cat: 'Text+', title: 'Duplicate Line Counter', desc: 'Count how often each distinct line occurs and list them by frequency, with percentages. Case and whitespace handling are optional.',
  labels: ['Lines'], sample: 'apple\nBanana\napple\ncherry\nbanana\napple ', opts: [chk('ci', 'Ignore case', true), chk('trim', 'Trim whitespace', true), chk('onlydup', 'Only show duplicates', false), sel('sort', 'Sort', 'count (desc)', ['count (desc)', 'alphabetical', 'first appearance'])],
  run: ([s], o) => {
    const m = new Map(); let total = 0;
    for (let l of s.split(/\r?\n/)) { if (o.trim) l = l.trim(); if (!l) continue; total++; const k = o.ci ? l.toLowerCase() : l; const e = m.get(k) || { l, n: 0 }; e.n++; m.set(k, e); }
    let rows = [...m.values()]; if (o.onlydup) rows = rows.filter((r) => r.n > 1);
    if (o.sort === 'count (desc)') rows.sort((a, b) => b.n - a.n); else if (o.sort === 'alphabetical') rows.sort((a, b) => a.l.localeCompare(b.l));
    return `${total} lines, ${m.size} distinct, ${total - m.size} duplicate occurrence(s)\n\n` + (rows.map((r) => `${String(r.n).padStart(5)}  ${(100 * r.n / total).toFixed(1).padStart(5)}%  ${r.l}`).join('\n') || '(none)');
  },
});
T.push({
  id: 'text-column-splitter', cat: 'Text+', title: 'Text Column Splitter', desc: 'Split each line into columns by a delimiter (or runs of whitespace), pick the columns you want and output TSV, CSV, JSON or a padded table.',
  labels: ['Delimited text'], sample: 'alice  admin  2024-01-03\nbob    editor 2024-02-11\ncarol  viewer 2024-03-30', opts: [sel('delim', 'Delimiter', 'whitespace', ['whitespace', 'comma', 'tab', 'semicolon', 'pipe', 'colon', 'custom']), txt('custom', 'Custom delimiter', ''), txt('cols', 'Columns to keep (e.g. 1,3 or 2-4, empty = all)', ''), sel('out', 'Output', 'padded table', ['padded table', 'TSV', 'CSV', 'JSON arrays'])],
  run: ([s], o) => {
    const d = { whitespace: /\s+/, comma: ',', tab: '\t', semicolon: ';', pipe: '|', colon: ':', custom: o.custom }[o.delim];
    if (o.delim === 'custom' && !o.custom) throw new Error('Enter a custom delimiter');
    let rows = s.split(/\r?\n/).filter((l) => l.trim()).map((l) => (o.delim === 'whitespace' ? l.trim() : l).split(d).map((x) => x.trim()));
    const keep = []; for (const p of o.cols.split(',').map((x) => x.trim()).filter(Boolean)) { const m = /^(\d+)(?:-(\d+))?$/.exec(p); if (!m) throw new Error(`Bad column spec "${p}"`); for (let i = +m[1]; i <= +(m[2] || m[1]); i++) keep.push(i - 1); }
    if (keep.length) rows = rows.map((r) => keep.map((i) => r[i] ?? ''));
    if (o.out === 'JSON arrays') return J(rows, 1).replace(/\n\s*(?=[^\[\]\n])/g, ' ').replace(/\s*\n\s*\]/g, ']');
    if (o.out === 'TSV') return rows.map((r) => r.join('\t')).join('\n');
    if (o.out === 'CSV') return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
    const w = []; rows.forEach((r) => r.forEach((c, i) => { w[i] = Math.max(w[i] || 0, [...c].length); }));
    return rows.map((r) => r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd()).join('\n');
  },
});
T.push({
  id: 'slug-to-title', cat: 'Text+', title: 'Slug to Title Case', desc: 'Turn URL slugs, snake_case or camelCase identifiers into readable titles. Small words stay lowercase (AP style), acronyms can be kept.',
  labels: ['Slugs, one per line'], sample: 'how-to-build-a-rest-api\nthe_art_of_war\nparseHTMLString\nwhat-is-a-cdn-and-why-use-one', opts: [chk('small', 'Keep small words lowercase', true), txt('acr', 'Acronyms to uppercase (comma-separated)', 'api,cdn,html,url,css,json,sql,ui,id')],
  run: ([s], o) => {
    const small = new Set('a an the and but or for nor on at to from by of in with as vs via'.split(' ')), acr = new Set(o.acr.toLowerCase().split(',').map((x) => x.trim()).filter(Boolean));
    return s.split(/\r?\n/).filter((l) => l.trim()).map((l) => words(l.trim().replace(/\.[a-z0-9]+$/i, '').replace(/\.[a-z0-9]+$/i, '')).map((w, i, a) => { const lw = w.toLowerCase(); return acr.has(lw) ? w.toUpperCase() : o.small && small.has(lw) && i && i < a.length - 1 ? lw : lw[0].toUpperCase() + lw.slice(1); }).join(' ')).join('\n');
  },
});

// Skipped on purpose (see report): bip39 (needs the 2048-word list), jwt-generator (jwt-encode exists), aspect-ratio-resizer (aspect-ratio-calculator and image-resizer exist),
// svg-to-webp (svg-to-png already outputs WebP), bcrypt tools (native.js), docker-to-compose (same as docker-run-to-compose), argon2/blake3/bech32/eip712/eip191 (too large to hand-roll safely).

export default T;

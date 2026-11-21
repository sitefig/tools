// Generators, Dev Config, Test Data and Reference tools. All pure text/bytes, no DOM, no network.
// Skipped on purpose (need server/network/AI): none of the requested items; "lorem", "placeholder",
// "crontab", "chmod", "env-example", "sql-insert-from-json", "ascii" belong to other modules.
// Deliberate simplifications: QR uses one mode for the whole text (numeric | alphanumeric | byte),
// no ECI/kanji/segment mixing; Code 128 uses set C for all-digit even-length input, else set B.

const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const txt = (id, label, def = '') => ({ id, label, type: 'text', def });
const num = (id, label, def) => ({ id, label, type: 'number', def });
const chk = (id, label, def = false) => ({ id, label, type: 'checkbox', def });
const lines = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const clamp = (n, a, b) => Math.min(b, Math.max(a, Math.floor(Number(n)) || a));
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

// ---------- seeded PRNG ----------
function seedOf(s) {
  s = String(s ?? '');
  if (/^-?\d+$/.test(s)) return Number(s) >>> 0;
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function prng(seed) {
  let a = seedOf(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));

// ---------- UUID / ULID / NanoID ----------
const uuidBytes = {
  v4() { const b = rnd(16); b[6] = (b[6] & 15) | 0x40; b[8] = (b[8] & 63) | 0x80; return b; },
  v7() {
    const b = rnd(16); let ms = Date.now();
    for (let i = 5; i >= 0; i--) { b[i] = ms % 256; ms = Math.floor(ms / 256); }
    b[6] = (b[6] & 15) | 0x70; b[8] = (b[8] & 63) | 0x80; return b;
  },
  v1() {
    const t = BigInt(Date.now()) * 10000n + 122192928000000000n + BigInt(Math.floor(Math.random() * 10000));
    const b = rnd(16);
    const lo = Number(t & 0xffffffffn), mid = Number((t >> 32n) & 0xffffn), hi = Number((t >> 48n) & 0xfffn);
    b.set([lo >>> 24, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255, mid >> 8, mid & 255, 0x10 | (hi >> 8), hi & 255], 0);
    b[8] = (b[8] & 63) | 0x80; b[10] |= 1; // random node id: multicast bit set per RFC 4122
    return b;
  },
};
const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function ulid() {
  let ms = Date.now(), t = '';
  for (let i = 0; i < 10; i++) { t = CROCK[ms % 32] + t; ms = Math.floor(ms / 32); }
  const r = rnd(10); let big = 0n; for (const x of r) big = (big << 8n) | BigInt(x);
  let s = ''; for (let i = 0; i < 16; i++) { s = CROCK[Number(big & 31n)] + s; big >>= 5n; }
  return t + s;
}
function nanoid(size, alpha) {
  const mask = (2 << (31 - Math.clz32((alpha.length - 1) | 1))) - 1, step = Math.ceil((1.6 * mask * size) / alpha.length);
  let id = '';
  while (id.length < size) for (const b of rnd(step)) { const c = alpha[b & mask]; if (c && id.length < size) id += c; }
  return id;
}

// ---------- QR code ----------
const ECC_PER_BLOCK = [
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const NUM_BLOCKS = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];
const ECL = { L: 0, M: 1, Q: 2, H: 3 };
const ECL_BITS = [1, 0, 3, 2];
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
}
function rsDivisor(deg) {
  const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < deg; j++) { r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
function rsRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
  return r;
}
const rawModules = (v) => {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
};
const dataCodewords = (v, e) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[e][v] * NUM_BLOCKS[e][v];

function qrCodewords(text, e, minVer) {
  if (!text) throw new Error('Nothing to encode');
  const bytes = new TextEncoder().encode(text);
  const mode = /^\d+$/.test(text) ? 1 : [...text].every((c) => ALNUM.includes(c)) ? 2 : 4;
  const n = mode === 4 ? bytes.length : text.length;
  const dbits = mode === 1 ? 10 * Math.floor(n / 3) + [0, 4, 7][n % 3] : mode === 2 ? 11 * Math.floor(n / 2) + 6 * (n % 2) : 8 * n;
  for (let v = minVer; v <= 40; v++) {
    const cc = (mode === 1 ? [10, 12, 14] : mode === 2 ? [9, 11, 13] : [8, 16, 16])[v < 10 ? 0 : v < 27 ? 1 : 2];
    const cap = dataCodewords(v, e) * 8;
    if (4 + cc + dbits > cap) { if (v === 40) throw new Error('Text too long for a QR code at this error correction level'); continue; }
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(mode, 4); put(n, cc);
    if (mode === 1) for (let i = 0; i < n; i += 3) { const s = text.substr(i, 3); put(parseInt(s, 10), [0, 4, 7, 10][s.length]); }
    else if (mode === 2) for (let i = 0; i < n; i += 2) {
      if (i + 1 < n) put(ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11); else put(ALNUM.indexOf(text[i]), 6);
    } else for (const b of bytes) put(b, 8);
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    return { version: v, data, mode };
  }
}
function interleave(data, v, e) {
  const nb = NUM_BLOCKS[e][v], ecc = ECC_PER_BLOCK[e][v], total = Math.floor(rawModules(v) / 8);
  const nShort = nb - (total % nb), shortLen = Math.floor(total / nb), div = rsDivisor(ecc), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const len = shortLen - ecc + (i < nShort ? 0 : 1), dat = data.slice(k, k + len); k += len;
    const er = rsRemainder(dat, div); if (i < nShort) dat.push(0);
    blocks.push(dat.concat(er));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecc || j >= nShort) out.push(b[i]); });
  return out;
}
const bchFormat = (d) => { let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); return ((d << 10) | r) ^ 0x5412; };
const bchVersion = (v) => { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25); return (v << 12) | r; };

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];
function penalty(m) {
  const n = m.length; let p = 0, dark = 0;
  const lineScore = (l) => {
    let s = 0, run = 1;
    for (let i = 1; i <= l.length; i++) { if (i < l.length && l[i] === l[i - 1]) run++; else { if (run >= 5) s += 3 + run - 5; run = 1; } }
    const str = '0000' + l.map((b) => +b).join('') + '0000';
    for (const pat of ['10111010000', '00001011101']) for (let i = str.indexOf(pat); i >= 0; i = str.indexOf(pat, i + 1)) s += 40;
    return s;
  };
  for (let i = 0; i < n; i++) {
    p += lineScore(m[i]) + lineScore(m.map((r) => r[i]));
    for (let j = 0; j < n; j++) { if (m[i][j]) dark++; if (i < n - 1 && j < n - 1 && m[i][j] === m[i + 1][j] && m[i][j] === m[i][j + 1] && m[i][j] === m[i + 1][j + 1]) p += 3; }
  }
  return p + (Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1) * 10;
}
// returns { matrix: boolean[][] (row-major, [y][x]), version, mask, mode }
function qrMatrix(text, eclName = 'M', forceMask = -1, minVer = 1) {
  const e = ECL[eclName]; if (e === undefined) throw new Error('ECC must be L, M, Q or H');
  const { version: v, data, mode } = qrCodewords(text, e, minVer);
  const cw = interleave(data, v, e), size = v * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, d) => { m[y][x] = d; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
    if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
  }
  const na = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2;
  const pos = v === 1 ? [] : [6]; for (let p = size - 7; pos.length < na && v > 1; p -= step) pos.splice(1, 0, p);
  pos.forEach((px, i) => pos.forEach((py, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const drawFormat = (mask) => {
    const b = bchFormat((ECL_BITS[e] << 3) | mask), g = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, g(i));
    set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (v >= 7) {
    const b = bchVersion(v);
    for (let i = 0; i < 18; i++) { const d = ((b >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, d); set(c, a, d); }
  }
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!fn[y][x] && k < cw.length * 8) { m[y][x] = ((cw[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
    }
  }
  const apply = (mk) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mk](x, y)) m[y][x] = !m[y][x]; };
  let best = forceMask, bestP = Infinity;
  if (best < 0) for (let mk = 0; mk < 8; mk++) { apply(mk); drawFormat(mk); const p = penalty(m); if (p < bestP) { bestP = p; best = mk; } apply(mk); }
  apply(best); drawFormat(best);
  return { matrix: m, version: v, mask: best, mode: ['', 'numeric', 'alphanumeric', '', 'byte'][mode] };
}
function qrSvg(m, quiet, fg = '#000', bg = '#fff') {
  const n = m.length, t = n + quiet * 2; let d = '';
  m.forEach((row, y) => { for (let x = 0; x < n;) { if (!row[x]) { x++; continue; } let w = 0; while (row[x + w]) w++; d += `M${x + quiet} ${y + quiet}h${w}v1h-${w}z`; x += w; } });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
}
const CRC_T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC_T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
// 1-bit grayscale PNG with stored (uncompressed) deflate blocks. cells: boolean[][] dark=true.
function pngBlob(cells, scale, quiet) {
  const n = cells.length + quiet * 2, W = n * scale, rb = Math.ceil(W / 8), raw = new Uint8Array((rb + 1) * W).fill(0xff);
  for (let y = 0; y < W; y++) {
    const my = Math.floor(y / scale) - quiet; raw[y * (rb + 1)] = 0;
    if (my < 0 || my >= cells.length) continue;
    for (let x = 0; x < W; x++) {
      const mx = Math.floor(x / scale) - quiet;
      if (mx >= 0 && mx < cells.length && cells[my][mx]) raw[y * (rb + 1) + 1 + (x >> 3)] &= ~(0x80 >> (x & 7));
    }
  }
  const z = [0x78, 0x01]; let a = 1, b = 0;
  for (const x of raw) { a = (a + x) % 65521; b = (b + a) % 65521; }
  for (let i = 0; i < raw.length; i += 65535) {
    const c = raw.subarray(i, i + 65535), fin = i + 65535 >= raw.length ? 1 : 0;
    z.push(fin, c.length & 255, c.length >> 8, ~c.length & 255, (~c.length >> 8) & 255); for (const x of c) z.push(x);
  }
  z.push(...u32(((b << 16) | a) >>> 0));
  const chunk = (type, body) => { const t = [...type].map((c) => c.charCodeAt(0)).concat(body); return [...u32(body.length), ...t, ...u32(crc32(t))]; };
  const bytes = [137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', [...u32(W), ...u32(W), 1, 0, 0, 0, 0]), ...chunk('IDAT', z), ...chunk('IEND', [])];
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' });
}
const wifiEsc = (s) => s.replace(/([\\;,:"])/g, '\\$1');
function qrPayload(preset, s) {
  const p = s.split('|').map((x) => x.trim());
  switch (preset) {
    case 'URL': return /^[a-z][a-z0-9+.-]*:/i.test(s.trim()) ? s.trim() : 'https://' + s.trim();
    case 'WiFi (SSID|password|WPA/WEP/nopass)': return `WIFI:T:${p[2] || 'WPA'};S:${wifiEsc(p[0])};P:${wifiEsc(p[1] || '')};;`;
    case 'vCard (Name|Phone|Email|Org)': return `BEGIN:VCARD\nVERSION:3.0\nFN:${p[0]}\nTEL:${p[1] || ''}\nEMAIL:${p[2] || ''}\nORG:${p[3] || ''}\nEND:VCARD`;
    case 'Email (to|subject|body)': return `mailto:${p[0]}?subject=${encodeURIComponent(p[1] || '')}&body=${encodeURIComponent(p[2] || '')}`;
    case 'SMS (number|message)': return `SMSTO:${p[0]}:${p.slice(1).join('|')}`;
    default: return s;
  }
}

// ---------- barcodes ----------
const C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ');
const C39 = {
  0: 'nnnwwnwnn', 1: 'wnnwnnnnw', 2: 'nnwwnnnnw', 3: 'wnwwnnnnn', 4: 'nnnwwnnnw', 5: 'wnnwwnnnn', 6: 'nnwwwnnnn', 7: 'nnnwnnwnw', 8: 'wnnwnnwnn', 9: 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn',
  '*': 'nwnnwnwnn', $: 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn',
};
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = EAN_L.map((p) => [...p].map((b) => 1 - b).reverse().join('')); // G = reverse of complement
const EAN_R = EAN_L.map((p) => [...p].map((b) => 1 - b).join(''));
const EAN_PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const eanCheck = (d) => (10 - (([...d].reverse().reduce((s, c, i) => s + +c * (i % 2 ? 1 : 3), 0)) % 10)) % 10;
// returns { bars: string of 0/1 modules } or { widths: [[isBar,width]...] }
function barcodeModules(type, s) {
  if (type === 'Code 128') {
    let codes, sum;
    if (/^\d{2,}$/.test(s) && s.length % 2 === 0) { codes = [105]; for (let i = 0; i < s.length; i += 2) codes.push(+s.substr(i, 2)); }
    else { codes = [104]; for (const c of s) { const k = c.charCodeAt(0); if (k < 32 || k > 126) throw new Error('Code 128 (set B) supports printable ASCII only'); codes.push(k - 32); } }
    sum = codes.reduce((a, c, i) => a + c * (i || 1), 0);
    codes.push(sum % 103, 106);
    return codes.map((c) => C128[c]).join('');
  }
  if (type === 'Code 39') {
    const t = s.toUpperCase();
    for (const c of t) if (!C39[c] || c === '*') throw new Error(`Character "${c}" not supported by Code 39`);
    return t; // validated here; bars are expanded in barcodeSvg
  }
  if (type === 'EAN-13' || type === 'UPC-A') {
    if (!/^\d+$/.test(s)) throw new Error('Digits only');
    const want = type === 'UPC-A' ? 11 : 12;
    if (s.length !== want && s.length !== want + 1) throw new Error(`${type} needs ${want} digits (+ optional check digit)`);
    const body = s.slice(0, want), chk = eanCheck(type === 'UPC-A' ? body : body);
    if (s.length === want + 1 && +s[want] !== chk) throw new Error(`Wrong check digit: expected ${chk}`);
    const full = (type === 'UPC-A' ? '0' : '') + body + chk, par = EAN_PAR[+full[0]];
    let bits = '101';
    for (let i = 0; i < 6; i++) bits += (par[i] === 'L' ? EAN_L : EAN_G)[+full[i + 1]];
    bits += '01010';
    for (let i = 7; i < 13; i++) bits += EAN_R[+full[i]];
    return bits + '101';
  }
  throw new Error('Unknown barcode type');
}
function barcodeSvg(type, s, height, showText, mod) {
  let bits = '', label = s;
  if (type === 'Code 39') {
    // each char: 9 elements alternating bar/space (starting with bar), narrow=1 wide=3, inter-char gap 1 narrow space
    const t = s.toUpperCase(); barcodeModules(type, s);
    label = t;
    for (const [ci, c] of [...('*' + t + '*')].entries()) {
      if (ci) bits += '0';
      [...C39[c]].forEach((w, i) => { bits += (i % 2 ? '0' : '1').repeat(w === 'w' ? 3 : 1); });
    }
    label = '*' + t + '*';
  } else if (type === 'Code 128') bits = expand128(barcodeModules(type, s));
  else {
    bits = barcodeModules(type, s);
    const body = s.length >= (type === 'UPC-A' ? 12 : 13) ? s : s + eanCheck(s); label = body;
  }
  const quiet = 10, W = (bits.length + quiet * 2) * mod, H = height + (showText ? 16 : 0);
  let d = '';
  for (let i = 0; i < bits.length;) { if (bits[i] === '0') { i++; continue; } let w = 0; while (bits[i + w] === '1') w++; d += `M${(i + quiet) * mod} 0h${w * mod}v${height}h-${w * mod}z`; i += w; }
  const t = showText ? `<text x="${W / 2}" y="${height + 13}" font-family="monospace" font-size="12" text-anchor="middle">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/><path d="${d}" fill="#000"/>${t}</svg>`;
}
function expand128(widths) { let bits = ''; [...widths].forEach((w, i) => { bits += (i % 2 ? '0' : '1').repeat(+w); }); return bits; }

// ---------- mock data ----------
const FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Robin', 'Drew', 'Maya', 'Noah', 'Lena', 'Omar', 'Priya', 'Mateo', 'Sofia', 'Kenji'];
const LAST = ['Smith', 'Johnson', 'Lee', 'Garcia', 'Brown', 'Martin', 'Nguyen', 'Khan', 'Rossi', 'Muller', 'Silva', 'Novak', 'Jansen', 'Kowalski', 'Haddad', 'Tanaka', 'Okafor', 'Larsen', 'Costa', 'Dubois'];
const CITIES = ['Faketown', 'Exampleville', 'Sampleburg', 'Testford', 'Mockton', 'Dummyport', 'Placeholder City', 'Nowhere Falls'];
const STREETS = ['Fictional Way', 'Example Street', 'Sample Road', 'Test Avenue', 'Mock Lane', 'Demo Boulevard'];
const COUNTRIES = ['Freedonia', 'Ruritania', 'Genovia', 'Elbonia', 'Atlantis', 'Sylvania'];
const COMPANIES = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark', 'Wayne', 'Soylent', 'Vandelay', 'Cyberdyne'];
const SUFFIX = ['Inc', 'LLC', 'Ltd', 'Group', 'Labs', 'GmbH'];
const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim minim veniam quis nostrud'.split(' ');
const rUuid = (r) => { const b = Array.from({ length: 16 }, () => Math.floor(r() * 256)); b[6] = (b[6] & 15) | 0x40; b[8] = (b[8] & 63) | 0x80; const h = hex(b); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
const person = (r) => { const f = pick(r, FIRST), l = pick(r, LAST); return { f, l, email: `${f}.${l}${ri(r, 1, 99)}@example.com`.toLowerCase() }; };
const address = (r) => `${ri(r, 1, 999)} ${pick(r, STREETS)}, ${pick(r, CITIES)}, ZZ ${String(ri(r, 0, 99999)).padStart(5, '0')}`;
const sentence = (r, n) => { const s = Array.from({ length: n }, () => pick(r, WORDS)).join(' '); return s[0].toUpperCase() + s.slice(1) + '.'; };
function mockValue(type, r) {
  const [t, ...a] = type.split(':');
  switch (t) {
    case 'name': return pick(r, FIRST) + ' ' + pick(r, LAST);
    case 'firstName': return pick(r, FIRST);
    case 'lastName': return pick(r, LAST);
    case 'email': return person(r).email;
    case 'uuid': return rUuid(r);
    case 'int': { const lo = a[0] !== undefined ? +a[0] : 0, hi = a[1] !== undefined ? +a[1] : 1000; return ri(r, lo, hi); }
    case 'float': { const lo = a[0] !== undefined ? +a[0] : 0, hi = a[1] !== undefined ? +a[1] : 1; return +(lo + r() * (hi - lo)).toFixed(2); }
    case 'date': return new Date(Date.UTC(2020, 0, 1) + Math.floor(r() * 5 * 365) * 86400000).toISOString().slice(0, 10);
    case 'datetime': return new Date(Date.UTC(2020, 0, 1) + Math.floor(r() * 5 * 365 * 86400) * 1000).toISOString();
    case 'bool': return r() < 0.5;
    case 'address': return address(r);
    case 'city': return pick(r, CITIES);
    case 'country': return pick(r, COUNTRIES);
    case 'company': return pick(r, COMPANIES) + ' ' + pick(r, SUFFIX);
    case 'phone': return `+1-555-01${String(ri(r, 0, 99)).padStart(2, '0')}`;
    case 'url': return `https://www.example.com/${pick(r, WORDS)}/${ri(r, 1, 999)}`;
    case 'ip': return `192.0.2.${ri(r, 1, 254)}`;
    case 'color': return '#' + Math.floor(r() * 0xffffff).toString(16).padStart(6, '0');
    case 'lorem': return sentence(r, ri(r, 5, 12));
    case 'word': return pick(r, WORDS);
    case 'pick': return pick(r, a.join(':').split(','));
    default: throw new Error(`Unknown type "${type}"`);
  }
}
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function randJson(r, depth, keys) {
  const k = () => pick(r, WORDS) + ri(r, 1, 9);
  if (depth <= 0 || r() < 0.3) {
    const t = ri(r, 0, 5);
    return [() => ri(r, -1000, 1000), () => +(r() * 100).toFixed(3), () => sentence(r, ri(r, 1, 3)), () => r() < 0.5, () => null, () => rUuid(r)][t]();
  }
  if (r() < 0.35) return Array.from({ length: ri(r, 1, keys) }, () => randJson(r, depth - 1, keys));
  const o = {}; for (let i = 0, n = ri(r, 1, keys); i < n; i++) o[k()] = randJson(r, depth - 1, keys);
  return o;
}

// ---------- validators ----------
const IBAN_LEN = Object.fromEntries('AD24 AE23 AL28 AT20 AZ28 BA20 BE16 BG22 BH22 BR29 BY28 CH21 CR22 CY28 CZ24 DE22 DK18 DO28 EE20 EG29 ES24 FI18 FO18 FR27 GB22 GE22 GI23 GL18 GR27 GT28 HR21 HU28 IE22 IL23 IQ23 IS26 IT27 JO30 KW30 KZ20 LB28 LC32 LI21 LT20 LU20 LV21 MC27 MD24 ME22 MK19 MR27 MT31 MU30 NL18 NO15 PK24 PL28 PS29 PT25 QA29 RO24 RS22 SA24 SC31 SE24 SI19 SK24 SM27 ST25 SV28 TL23 TN24 TR26 UA29 VA22 VG24 XK20'.split(' ').map((x) => [x.slice(0, 2), +x.slice(2)]));
function ibanCheck(raw) {
  const s = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return 'invalid: wrong characters/structure';
  const len = IBAN_LEN[s.slice(0, 2)];
  if (!len) return `invalid: unknown country ${s.slice(0, 2)}`;
  if (s.length !== len) return `invalid: ${s.slice(0, 2)} IBANs have ${len} characters, got ${s.length}`;
  let rem = 0;
  for (const c of s.slice(4) + s.slice(0, 4)) for (const d of String(parseInt(c, 36))) rem = (rem * 10 + +d) % 97;
  return rem === 1 ? `valid (${s.slice(0, 2)}, ${s.match(/.{1,4}/g).join(' ')})` : 'invalid: checksum (mod 97) failed';
}
const VAT = {
  AT: /^U\d{8}$/, BE: /^[01]\d{9}$/, BG: /^\d{9,10}$/, CY: /^\d{8}[A-Z]$/, CZ: /^\d{8,10}$/, DE: /^\d{9}$/, DK: /^\d{8}$/, EE: /^\d{9}$/, EL: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/, FI: /^\d{8}$/, FR: /^[A-Z0-9]{2}\d{9}$/, HR: /^\d{11}$/, HU: /^\d{8}$/, IE: /^(\d{7}[A-W][A-IW]?|\d[A-Z+*]\d{5}[A-W])$/, IT: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/, LU: /^\d{8}$/, LV: /^\d{11}$/, MT: /^\d{8}$/, NL: /^\d{9}B\d{2}$/, PL: /^\d{10}$/, PT: /^\d{9}$/, RO: /^\d{2,10}$/, SE: /^\d{12}$/, SI: /^\d{8}$/, SK: /^\d{10}$/,
};
const luhnOk = (d) => { let s = 0; [...d].reverse().forEach((c, i) => { let n = +c; if (i % 2) { n *= 2; if (n > 9) n -= 9; } s += n; }); return s % 10 === 0; };

// ---------- gitignore templates ----------
const GI = {
  node: ['Node', 'node_modules/\nnpm-debug.log*\nyarn-error.log*\n.npm/\n.eslintcache\ndist/\nbuild/\ncoverage/\n.env\n.env.local\n*.tsbuildinfo\n.next/\n.nuxt/'],
  python: ['Python', '__pycache__/\n*.py[cod]\n*$py.class\n.venv/\nvenv/\nenv/\n*.egg-info/\ndist/\nbuild/\n.pytest_cache/\n.mypy_cache/\n.ruff_cache/\n.coverage\nhtmlcov/\n.env\n.ipynb_checkpoints/'],
  java: ['Java', '*.class\n*.jar\n*.war\n*.ear\nhs_err_pid*\ntarget/\n.gradle/\nbuild/\nout/\n!gradle/wrapper/gradle-wrapper.jar'],
  go: ['Go', '*.exe\n*.test\n*.out\n/bin/\n/vendor/\ngo.work\n*.prof'],
  rust: ['Rust', '/target/\n**/*.rs.bk\n# Cargo.lock: commit for binaries, ignore for libraries'],
  dotnet: ['.NET', 'bin/\nobj/\n*.user\n*.suo\n.vs/\n*.nupkg\nTestResults/\n*.log\nartifacts/'],
  ruby: ['Ruby', '*.gem\n.bundle/\nvendor/bundle/\nlog/\ntmp/\n.byebug_history\ncoverage/\n.env'],
  php: ['PHP', '/vendor/\ncomposer.phar\n.phpunit.result.cache\n.env\nstorage/*.key\n/public/storage'],
  swift: ['Swift', '.build/\n*.xcodeproj/xcuserdata/\nxcuserdata/\nDerivedData/\n*.xcworkspace/xcuserdata/\nPods/\n.swiftpm/\n*.ipa'],
  unity: ['Unity', '[Ll]ibrary/\n[Tt]emp/\n[Oo]bj/\n[Bb]uild/\n[Bb]uilds/\n[Ll]ogs/\n[Uu]ser[Ss]ettings/\n*.csproj\n*.sln\n*.pidb\n*.userprefs\nMemoryCaptures/\nCrashes/'],
  macos: ['macOS', '.DS_Store\n.AppleDouble\n.LSOverride\n._*\n.Spotlight-V100\n.Trashes'],
  windows: ['Windows', 'Thumbs.db\nehthumbs.db\nDesktop.ini\n$RECYCLE.BIN/\n*.lnk'],
  linux: ['Linux', '*~\n.fuse_hidden*\n.directory\n.Trash-*\n.nfs*'],
  jetbrains: ['JetBrains', '.idea/\n*.iml\n*.iws\nout/\ncmake-build-*/'],
  vscode: ['VSCode', '.vscode/*\n!.vscode/settings.json\n!.vscode/tasks.json\n!.vscode/launch.json\n!.vscode/extensions.json\n*.code-workspace'],
  terraform: ['Terraform', '.terraform/\n*.tfstate\n*.tfstate.*\ncrash.log\n*.tfvars\noverride.tf\n.terraformrc\n# keep .terraform.lock.hcl committed'],
};

// ---------- licenses ----------
const LIC = {
  'MIT': (y, n) => `MIT License\n\nCopyright (c) ${y} ${n}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`,
  'ISC': (y, n) => `ISC License\n\nCopyright (c) ${y} ${n}\n\nPermission to use, copy, modify, and/or distribute this software for any\npurpose with or without fee is hereby granted, provided that the above\ncopyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH\nREGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY\nAND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,\nINDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM\nLOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR\nOTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR\nPERFORMANCE OF THIS SOFTWARE.\n`,
  'BSD-2-Clause': (y, n) => `BSD 2-Clause License\n\nCopyright (c) ${y}, ${n}\nAll rights reserved.\n\nRedistribution and use in source and binary forms, with or without\nmodification, are permitted provided that the following conditions are met:\n\n1. Redistributions of source code must retain the above copyright notice, this\n   list of conditions and the following disclaimer.\n\n2. Redistributions in binary form must reproduce the above copyright notice,\n   this list of conditions and the following disclaimer in the documentation\n   and/or other materials provided with the distribution.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"\nAND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\nIMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE\nDISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE\nFOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL\nDAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR\nSERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER\nCAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,\nOR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE\nOF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n`,
  'BSD-3-Clause': (y, n) => LIC['BSD-2-Clause'](y, n).replace('BSD 2-Clause', 'BSD 3-Clause').replace('\nTHIS SOFTWARE', `\n3. Neither the name of the copyright holder nor the names of its\n   contributors may be used to endorse or promote products derived from\n   this software without specific prior written permission.\n\nTHIS SOFTWARE`),
  'Apache-2.0': (y, n) => `Copyright ${y} ${n}\n\nLicensed under the Apache License, Version 2.0 (the "License");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\n    http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software\ndistributed under the License is distributed on an "AS IS" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\nSee the License for the specific language governing permissions and\nlimitations under the License.\n\n(Note: this is the standard Apache-2.0 notice. Put the full license text from\nhttps://www.apache.org/licenses/LICENSE-2.0.txt in your LICENSE file.)\n`,
  'GPL-3.0': (y, n) => `Copyright (C) ${y} ${n}\n\nThis program is free software: you can redistribute it and/or modify\nit under the terms of the GNU General Public License as published by\nthe Free Software Foundation, either version 3 of the License, or\n(at your option) any later version.\n\nThis program is distributed in the hope that it will be useful,\nbut WITHOUT ANY WARRANTY; without even the implied warranty of\nMERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the\nGNU General Public License for more details.\n\nYou should have received a copy of the GNU General Public License\nalong with this program.  If not, see <https://www.gnu.org/licenses/>.\n\n(Note: this is the standard GPL-3.0 notice. Include the full license text from\nhttps://www.gnu.org/licenses/gpl-3.0.txt in your LICENSE file.)\n`,
  'MPL-2.0': (y, n) => `Copyright (c) ${y} ${n}\n\nThis Source Code Form is subject to the terms of the Mozilla Public\nLicense, v. 2.0. If a copy of the MPL was not distributed with this\nfile, You can obtain one at https://mozilla.org/MPL/2.0/.\n\n(Note: this is the standard MPL-2.0 notice. Include the full license text from\nhttps://www.mozilla.org/media/MPL/2.0/index.txt in your LICENSE file.)\n`,
  'Unlicense': () => `This is free and unencumbered software released into the public domain.\n\nAnyone is free to copy, modify, publish, use, compile, sell, or\ndistribute this software, either in source code form or as a compiled\nbinary, for any purpose, commercial or non-commercial, and by any\nmeans.\n\nIn jurisdictions that recognize copyright laws, the author or authors\nof this software dedicate any and all copyright interest in the\nsoftware to the public domain. We make this dedication for the benefit\nof the public at large and to the detriment of our heirs and\nsuccessors. We intend this dedication to be an overt act of\nrelinquishment in perpetuity of all present and future rights to this\nsoftware under copyright law.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,\nEXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF\nMERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.\nIN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR\nOTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,\nARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR\nOTHER DEALINGS IN THE SOFTWARE.\n\nFor more information, please refer to <https://unlicense.org>\n`,
};

// ---------- user agents ----------
const UAS = [
  ['Chrome 126 / Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'],
  ['Chrome 126 / macOS', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'],
  ['Chrome 126 / Linux', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'],
  ['Chrome 126 / Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'],
  ['Firefox 127 / Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0'],
  ['Firefox 127 / Linux', 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0'],
  ['Firefox 127 / Android', 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0'],
  ['Safari 17 / macOS', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'],
  ['Safari 17 / iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'],
  ['Safari 17 / iPad', 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'],
  ['Edge 126 / Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'],
  ['Opera 111', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0'],
  ['Samsung Internet 25', 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36'],
  ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
  ['Googlebot Smartphone', 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
  ['Bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
  ['DuckDuckBot', 'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)'],
  ['Applebot', 'Mozilla/5.0 (Device; OS_version) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)'],
  ['curl', 'curl/8.7.1'],
  ['wget', 'Wget/1.21.4'],
  ['Python requests', 'python-requests/2.32.3'],
  ['Node fetch (undici)', 'node'],
];

// ---------- tool definitions ----------
const G = 'Generators', D = 'Dev Config', TD = 'Test Data', REF = 'Reference';
const CODE = (v) => '```' + v + '\n';
const q = (s) => JSON.stringify(s);

const tools = [
  {
    id: 'uuid-generator', cat: G, title: 'UUID Generator', desc: 'Generate v1, v4 and v7 UUIDs in bulk (up to 1000) with formatting options.',
    inputs: 0, sample: '',
    opts: [sel('version', 'Version', ['v4', 'v7', 'v1']), num('count', 'Count (1-1000)', 5), chk('upper', 'Uppercase'), chk('hyphens', 'Hyphens', true), chk('braces', 'Braces {}'), chk('quotes', 'Quote each')],
    run: (_, o) => {
      const out = [];
      for (let i = 0; i < clamp(o.count, 1, 1000); i++) {
        let u = hex(uuidBytes[o.version]());
        if (o.hyphens) u = `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`;
        if (o.upper) u = u.toUpperCase();
        if (o.braces) u = `{${u}}`;
        out.push(o.quotes ? `"${u}"` : u);
      }
      return out.join('\n');
    },
  },
  {
    id: 'ulid-generator', cat: G, title: 'ULID Generator', desc: 'Generate sortable 26-character ULIDs (48-bit timestamp + 80 random bits).',
    inputs: 0, sample: '', opts: [num('count', 'Count (1-1000)', 5), chk('lower', 'Lowercase')],
    run: (_, o) => Array.from({ length: clamp(o.count, 1, 1000) }, () => (o.lower ? ulid().toLowerCase() : ulid())).join('\n'),
  },
  {
    id: 'nanoid-generator', cat: G, title: 'NanoID Generator', desc: 'URL-safe random IDs with custom length and alphabet.',
    inputs: 0, sample: '',
    opts: [num('size', 'Length (1-256)', 21), num('count', 'Count (1-1000)', 5), txt('alphabet', 'Alphabet', '_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')],
    run: (_, o) => {
      const a = [...new Set(o.alphabet)].join('');
      if (a.length < 2 || a.length > 256) throw new Error('Alphabet needs 2-256 distinct characters');
      return Array.from({ length: clamp(o.count, 1, 1000) }, () => nanoid(clamp(o.size, 1, 256), a)).join('\n');
    },
  },
  {
    id: 'qr-code-generator', cat: G, title: 'QR Code Generator', desc: 'Hand-written QR encoder (versions 1-40, L/M/Q/H, auto mask). Outputs SVG text and a PNG.',
    sample: 'https://example.com/', labels: ['Content (presets use | separators, e.g. WiFi: MyNet|secret|WPA)'],
    opts: [
      sel('preset', 'Preset', ['Text', 'URL', 'WiFi (SSID|password|WPA/WEP/nopass)', 'vCard (Name|Phone|Email|Org)', 'Email (to|subject|body)', 'SMS (number|message)']),
      sel('ecc', 'Error correction', ['L', 'M', 'Q', 'H'], 'M'), sel('mask', 'Mask', ['auto', '0', '1', '2', '3', '4', '5', '6', '7']),
      num('scale', 'PNG pixels per module', 8), num('quiet', 'Quiet zone (modules)', 4),
    ],
    run: ([s], o) => {
      const payload = qrPayload(o.preset, s.replace(/\n+$/, ''));
      const r = qrMatrix(payload, o.ecc, o.mask === 'auto' ? -1 : +o.mask);
      const quiet = clamp(o.quiet, 0, 20);
      return { text: qrSvg(r.matrix, quiet), blob: [pngBlob(r.matrix, clamp(o.scale, 1, 32), quiet)], filename: 'qrcode.png' };
    },
  },
  {
    id: 'barcode-generator', cat: G, title: 'Barcode Generator', desc: 'Code 128, Code 39, EAN-13 and UPC-A (check digit computed/verified). SVG output.',
    sample: '4006381333931', labels: ['Value (EAN-13: 12-13 digits, UPC-A: 11-12 digits)'],
    opts: [sel('type', 'Type', ['EAN-13', 'UPC-A', 'Code 128', 'Code 39']), num('height', 'Bar height', 80), num('module', 'Module width px', 2), chk('text', 'Show text', true)],
    run: ([s], o) => ({ text: barcodeSvg(o.type, s.trim(), clamp(o.height, 10, 500), o.text, clamp(o.module, 1, 8)) }),
  },
  {
    id: 'mock-data-generator', cat: TD, title: 'Mock Data Generator', desc: 'Generate rows from a JSON schema of field to type, with a seeded PRNG. JSON or CSV.',
    labels: ['Schema (field: type). Types: name firstName lastName email uuid int[:min:max] float[:min:max] date datetime bool address city country company phone url ip color lorem word pick:a,b,c'],
    sample: '{\n  "id": "uuid",\n  "name": "name",\n  "email": "email",\n  "age": "int:18:90",\n  "joined": "date",\n  "active": "bool",\n  "company": "company",\n  "address": "address"\n}',
    opts: [num('rows', 'Rows (1-10000)', 5), txt('seed', 'Seed', '42'), sel('format', 'Format', ['JSON', 'CSV', 'NDJSON'])],
    run: ([s], o) => {
      let schema; try { schema = JSON.parse(s); } catch (e) { throw new Error('Schema is not valid JSON: ' + e.message); }
      if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('Schema must be a JSON object of field: type');
      const r = prng(o.seed), keys = Object.keys(schema);
      const rows = Array.from({ length: clamp(o.rows, 1, 10000) }, () => Object.fromEntries(keys.map((k) => [k, mockValue(String(schema[k]), r)])));
      if (o.format === 'CSV') return [keys.map(csvCell).join(','), ...rows.map((x) => keys.map((k) => csvCell(x[k])).join(','))].join('\n');
      if (o.format === 'NDJSON') return rows.map((x) => JSON.stringify(x)).join('\n');
      return JSON.stringify(rows, null, 2);
    },
  },
  {
    id: 'random-json-generator', cat: TD, title: 'Random JSON Generator', desc: 'Random nested JSON of a chosen depth and width, seedable.',
    inputs: 0, sample: '', opts: [num('depth', 'Depth (1-6)', 3), num('width', 'Max keys/items (1-8)', 4), txt('seed', 'Seed', '1'), num('indent', 'Indent', 2)],
    run: (_, o) => {
      const r = prng(o.seed), root = {};
      for (let i = 0; i < ri(r, 2, clamp(o.width, 1, 8) + 1); i++) root[pick(r, WORDS) + i] = randJson(r, clamp(o.depth, 1, 6) - 1, clamp(o.width, 1, 8));
      return JSON.stringify(root, null, clamp(o.indent, 0, 8));
    },
  },
  {
    id: 'fake-person-generator', cat: TD, title: 'Fake Person Generator', desc: 'Clearly fictional people: example.com emails, 555-01xx phones, made-up addresses.',
    inputs: 0, sample: '', opts: [num('count', 'Count (1-500)', 5), txt('seed', 'Seed', '7'), sel('format', 'Format', ['JSON', 'Text'])],
    run: (_, o) => {
      const r = prng(o.seed);
      const people = Array.from({ length: clamp(o.count, 1, 500) }, () => {
        const p = person(r);
        return { name: `${p.f} ${p.l}`, email: p.email, phone: `+1-555-01${String(ri(r, 0, 99)).padStart(2, '0')}`, birthdate: mockValue('date', r), address: address(r), company: mockValue('company', r) };
      });
      return o.format === 'JSON' ? JSON.stringify(people, null, 2) : people.map((p) => `${p.name} <${p.email}>\n  ${p.phone}  born ${p.birthdate}\n  ${p.address}\n  ${p.company}`).join('\n\n');
    },
  },
  {
    id: 'iban-validator', cat: G, title: 'IBAN Validator', desc: 'Check IBAN country length and the mod-97 checksum, one IBAN per line.',
    sample: 'GB82 WEST 1234 5698 7654 32\nDE89370400440532013000\nDE89370400440532013001\nFR7630006000011234567890189\nXX0012345', labels: ['IBANs'],
    run: ([s]) => lines(s).map((l) => `${l}  ->  ${ibanCheck(l)}`).join('\n') || (() => { throw new Error('Enter at least one IBAN'); })(),
  },
  {
    id: 'vat-number-format-validator', cat: G, title: 'EU VAT Number Format Validator', desc: 'Checks the format only (not whether the number is registered) for EU member states.',
    sample: 'DE123456789\nFR12345678901\nNL123456789B01\nIT1234567890\nBE0123456789\nES1234567X', labels: ['VAT numbers (country prefix + number)'],
    run: ([s]) => lines(s).map((l) => {
      const v = l.replace(/[\s.\-]/g, '').toUpperCase(), cc = v.slice(0, 2), re = VAT[cc];
      if (!re) return `${l}  ->  unknown or non-EU country prefix "${cc}"`;
      return `${l}  ->  ${re.test(v.slice(2)) ? 'format OK' : 'wrong format for ' + cc} (format only; registration not checked)`;
    }).join('\n') || (() => { throw new Error('Enter at least one VAT number'); })(),
  },
  {
    id: 'luhn-validator', cat: G, title: 'Luhn Validator', desc: 'Validate numbers with the Luhn checksum or compute the missing check digit.',
    sample: '4539 1488 0343 6467\n79927398713\n1234567812345678', labels: ['Numbers, one per line'],
    opts: [sel('mode', 'Mode', ['validate', 'append check digit'])],
    run: ([s], o) => lines(s).map((l) => {
      const d = l.replace(/[\s-]/g, '');
      if (!/^\d+$/.test(d)) return `${l}  ->  not numeric`;
      if (o.mode === 'validate') return `${l}  ->  ${luhnOk(d) ? 'valid' : 'invalid'}`;
      for (let c = 0; c < 10; c++) if (luhnOk(d + c)) return `${l}  ->  ${d}${c}  (check digit ${c})`;
    }).join('\n') || (() => { throw new Error('Enter at least one number'); })(),
  },

  // ---------- Dev Config ----------
  {
    id: 'gitignore-generator', cat: D, title: '.gitignore Generator', desc: 'Combine templates by name: ' + Object.keys(GI).join(', ') + '.',
    sample: 'node, python, macos, vscode', labels: ['Templates (comma or newline separated)'],
    run: ([s]) => {
      const names = s.toLowerCase().split(/[\s,]+/).filter(Boolean);
      if (!names.length) throw new Error('List at least one template: ' + Object.keys(GI).join(', '));
      return [...new Set(names)].map((n) => {
        const k = n === '.net' || n === 'csharp' ? 'dotnet' : n === 'jetbrain' || n === 'idea' ? 'jetbrains' : n === 'macosx' ? 'macos' : n === 'js' ? 'node' : n;
        if (!GI[k]) throw new Error(`Unknown template "${n}". Available: ${Object.keys(GI).join(', ')}`);
        return `# ---- ${GI[k][0]} ----\n${GI[k][1]}\n`;
      }).join('\n');
    },
  },
  {
    id: 'dockerfile-generator', cat: D, title: 'Dockerfile Generator', desc: 'Dockerfiles for node, python, go, java and nginx static sites, optionally multi-stage.',
    inputs: 0, sample: '',
    opts: [sel('stack', 'Stack', ['node', 'python', 'go', 'java', 'nginx-static']), txt('version', 'Language version (blank = default)'), num('port', 'Port', 3000), chk('multi', 'Multi-stage build', true), txt('cmd', 'Entry file', '')],
    run: (_, o) => {
      const v = o.version.trim(), port = clamp(o.port, 1, 65535), e = o.cmd.trim();
      switch (o.stack) {
        case 'node': {
          const f = e || 'server.js', img = `node:${v || '22'}-alpine`;
          return o.multi ? `FROM ${img} AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build --if-present\nRUN npm prune --omit=dev\n\nFROM ${img}\nENV NODE_ENV=production\nWORKDIR /app\nCOPY --from=build /app ./\nUSER node\nEXPOSE ${port}\nCMD ["node", "${f}"]\n`
            : `FROM ${img}\nENV NODE_ENV=production\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\nUSER node\nEXPOSE ${port}\nCMD ["node", "${f}"]\n`;
        }
        case 'python': {
          const f = e || 'main.py', img = `python:${v || '3.12'}-slim`;
          return o.multi ? `FROM ${img} AS build\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir --prefix=/install -r requirements.txt\n\nFROM ${img}\nENV PYTHONUNBUFFERED=1\nWORKDIR /app\nCOPY --from=build /install /usr/local\nCOPY . .\nRUN useradd -m app\nUSER app\nEXPOSE ${port}\nCMD ["python", "${f}"]\n`
            : `FROM ${img}\nENV PYTHONUNBUFFERED=1\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE ${port}\nCMD ["python", "${f}"]\n`;
        }
        case 'go': {
          const gv = v || '1.22';
          return o.multi ? `FROM golang:${gv}-alpine AS build\nWORKDIR /src\nCOPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nRUN CGO_ENABLED=0 go build -o /out/app ${e || '.'}\n\nFROM gcr.io/distroless/static-debian12\nCOPY --from=build /out/app /app\nEXPOSE ${port}\nUSER nonroot\nENTRYPOINT ["/app"]\n`
            : `FROM golang:${gv}-alpine\nWORKDIR /src\nCOPY . .\nRUN go build -o /app ${e || '.'}\nEXPOSE ${port}\nCMD ["/app"]\n`;
        }
        case 'java': {
          const jv = v || '21';
          return o.multi ? `FROM maven:3-eclipse-temurin-${jv} AS build\nWORKDIR /src\nCOPY pom.xml .\nRUN mvn -q dependency:go-offline\nCOPY src ./src\nRUN mvn -q package -DskipTests\n\nFROM eclipse-temurin:${jv}-jre\nWORKDIR /app\nCOPY --from=build /src/target/*.jar app.jar\nEXPOSE ${port}\nENTRYPOINT ["java", "-jar", "app.jar"]\n`
            : `FROM eclipse-temurin:${jv}-jre\nWORKDIR /app\nCOPY target/*.jar app.jar\nEXPOSE ${port}\nENTRYPOINT ["java", "-jar", "app.jar"]\n`;
        }
        default: return o.multi ? `FROM node:${v || '22'}-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\nFROM nginx:alpine\nCOPY --from=build /app/dist /usr/share/nginx/html\nEXPOSE 80\nCMD ["nginx", "-g", "daemon off;"]\n`
          : `FROM nginx:alpine\nCOPY . /usr/share/nginx/html\nEXPOSE 80\nCMD ["nginx", "-g", "daemon off;"]\n`;
      }
    },
  },
  {
    id: 'docker-compose-generator', cat: D, title: 'Docker Compose Generator', desc: 'Pick services: postgres, mysql, mariadb, redis, mongo, nginx, rabbitmq, memcached, elasticsearch, minio, mailhog.',
    sample: 'postgres\nredis\nnginx', labels: ['Services (one per line or comma separated)'],
    run: ([s]) => {
      const S = {
        postgres: ['postgres:16-alpine', ['5432:5432'], ['POSTGRES_USER: app', 'POSTGRES_PASSWORD: change-me', 'POSTGRES_DB: app'], '/var/lib/postgresql/data'],
        mysql: ['mysql:8', ['3306:3306'], ['MYSQL_ROOT_PASSWORD: change-me', 'MYSQL_DATABASE: app'], '/var/lib/mysql'],
        mariadb: ['mariadb:11', ['3306:3306'], ['MARIADB_ROOT_PASSWORD: change-me', 'MARIADB_DATABASE: app'], '/var/lib/mysql'],
        redis: ['redis:7-alpine', ['6379:6379'], [], '/data'],
        mongo: ['mongo:7', ['27017:27017'], ['MONGO_INITDB_ROOT_USERNAME: root', 'MONGO_INITDB_ROOT_PASSWORD: change-me'], '/data/db'],
        nginx: ['nginx:alpine', ['80:80'], [], null],
        rabbitmq: ['rabbitmq:3-management-alpine', ['5672:5672', '15672:15672'], ['RABBITMQ_DEFAULT_USER: app', 'RABBITMQ_DEFAULT_PASS: change-me'], '/var/lib/rabbitmq'],
        memcached: ['memcached:alpine', ['11211:11211'], [], null],
        elasticsearch: ['docker.elastic.co/elasticsearch/elasticsearch:8.14.0', ['9200:9200'], ['discovery.type: single-node', 'xpack.security.enabled: "false"'], '/usr/share/elasticsearch/data'],
        minio: ['minio/minio', ['9000:9000', '9001:9001'], ['MINIO_ROOT_USER: minio', 'MINIO_ROOT_PASSWORD: change-me-too'], '/data'],
        mailhog: ['mailhog/mailhog', ['1025:1025', '8025:8025'], [], null],
      };
      const names = [...new Set(s.toLowerCase().split(/[\s,]+/).filter(Boolean))];
      if (!names.length) throw new Error('List at least one service');
      let out = 'services:\n', vols = [];
      for (const n of names) {
        const d = S[n]; if (!d) throw new Error(`Unknown service "${n}". Available: ${Object.keys(S).join(', ')}`);
        out += `  ${n}:\n    image: ${d[0]}\n    restart: unless-stopped\n    ports:\n${d[1].map((p) => `      - "${p}"`).join('\n')}\n`;
        if (d[2].length) out += `    environment:\n${d[2].map((e) => `      ${e}`).join('\n')}\n`;
        if (n === 'minio') out += '    command: server /data --console-address ":9001"\n';
        if (n === 'nginx') out += '    volumes:\n      - ./html:/usr/share/nginx/html:ro\n';
        else if (d[3]) { out += `    volumes:\n      - ${n}-data:${d[3]}\n`; vols.push(n + '-data'); }
      }
      return out + (vols.length ? `\nvolumes:\n${vols.map((v) => `  ${v}:`).join('\n')}\n` : '');
    },
  },
  {
    id: 'github-actions-generator', cat: D, title: 'GitHub Actions CI Generator', desc: 'CI workflow for node, python, go or rust with version matrix and dependency caching.',
    inputs: 0, sample: '',
    opts: [sel('lang', 'Language', ['node', 'python', 'go', 'rust']), txt('versions', 'Matrix versions (comma separated, blank = defaults)'), txt('os', 'Runners (comma separated)', 'ubuntu-latest'), chk('cache', 'Cache dependencies', true), txt('branches', 'Branches', 'main')],
    run: (_, o) => {
      const L = {
        node: { v: '18, 20, 22', key: 'node-version', setup: 'actions/setup-node@v4', cache: 'npm', steps: ['npm ci', 'npm run build --if-present', 'npm test'] },
        python: { v: '3.10, 3.11, 3.12', key: 'python-version', setup: 'actions/setup-python@v5', cache: 'pip', steps: ['python -m pip install -r requirements.txt', 'python -m pytest'] },
        go: { v: '1.21, 1.22', key: 'go-version', setup: 'actions/setup-go@v5', cache: true, steps: ['go build ./...', 'go test ./...'] },
        rust: { v: 'stable, beta', key: 'toolchain', setup: 'dtolnay/rust-toolchain@master', cache: null, steps: ['cargo build --verbose', 'cargo test --verbose'] },
      }[o.lang];
      const vs = (o.versions.trim() || L.v).split(/\s*,\s*/), oss = (o.os.trim() || 'ubuntu-latest').split(/\s*,\s*/);
      const br = o.branches.split(/\s*,\s*/).filter(Boolean).join(', ');
      let y = `name: CI\n\non:\n  push:\n    branches: [${br}]\n  pull_request:\n    branches: [${br}]\n\njobs:\n  test:\n    runs-on: \${{ matrix.os }}\n    strategy:\n      fail-fast: false\n      matrix:\n        os: [${oss.join(', ')}]\n        ${o.lang === 'rust' ? 'toolchain' : 'version'}: [${vs.map((v) => (o.lang === 'python' ? `"${v}"` : v)).join(', ')}]\n    steps:\n      - uses: actions/checkout@v4\n`;
      const ref = o.lang === 'rust' ? '${{ matrix.toolchain }}' : '${{ matrix.version }}';
      if (o.lang === 'rust') y += `      - uses: ${L.setup}\n        with:\n          toolchain: ${ref}\n`;
      else {
        y += `      - uses: ${L.setup}\n        with:\n          ${L.key}: ${ref}\n`;
        if (o.cache && L.cache) y += `          cache: ${L.cache === true ? 'true' : L.cache}\n`;
      }
      if (o.lang === 'rust' && o.cache) y += `      - uses: actions/cache@v4\n        with:\n          path: |\n            ~/.cargo/registry\n            ~/.cargo/git\n            target\n          key: \${{ runner.os }}-cargo-\${{ hashFiles('**/Cargo.lock') }}\n`;
      return y + L.steps.map((s) => `      - run: ${s}`).join('\n') + '\n';
    },
  },
  {
    id: 'nginx-config-generator', cat: D, title: 'Nginx Config Generator', desc: 'Server blocks for static sites, reverse proxy, SPA and HTTPS redirect, with optional gzip.',
    inputs: 0, sample: '',
    opts: [sel('type', 'Type', ['static', 'reverse proxy', 'SPA', 'https redirect only']), txt('server', 'server_name', 'example.com'), txt('root', 'Root (static/SPA)', '/var/www/html'), txt('upstream', 'Upstream (proxy)', 'http://127.0.0.1:3000'), chk('ssl', 'HTTPS (with http->https redirect)', true), chk('gzip', 'gzip', true)],
    run: (_, o) => {
      const sn = o.server.trim() || '_', gz = o.gzip ? '    gzip on;\n    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;\n    gzip_min_length 1024;\n' : '';
      const redirect = `server {\n    listen 80;\n    listen [::]:80;\n    server_name ${sn};\n    return 301 https://$host$request_uri;\n}\n`;
      if (o.type === 'https redirect only') return redirect;
      const listen = o.ssl ? `    listen 443 ssl http2;\n    listen [::]:443 ssl http2;\n    ssl_certificate /etc/letsencrypt/live/${sn}/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/${sn}/privkey.pem;\n` : '    listen 80;\n    listen [::]:80;\n';
      let loc;
      if (o.type === 'reverse proxy') loc = `    location / {\n        proxy_pass ${o.upstream};\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";\n    }\n`;
      else loc = `    root ${o.root};\n    index index.html;\n\n    location / {\n        try_files $uri $uri/ ${o.type === 'SPA' ? '/index.html' : '=404'};\n    }\n\n    location ~* \\.(?:css|js|svg|png|jpg|jpeg|gif|ico|woff2?)$ {\n        expires 30d;\n        add_header Cache-Control "public, immutable";\n    }\n`;
      return (o.ssl ? redirect + '\n' : '') + `server {\n${listen}    server_name ${sn};\n\n${gz}${gz ? '\n' : ''}${loc}}\n`;
    },
  },
  {
    id: 'license-generator', cat: D, title: 'License Generator', desc: 'MIT, Apache-2.0, BSD-2/3, ISC, GPL-3.0 notice, MPL-2.0 notice or Unlicense with name and year.',
    inputs: 0, sample: '', opts: [sel('license', 'License', Object.keys(LIC)), txt('name', 'Copyright holder', 'Your Name'), num('year', 'Year', new Date().getFullYear())],
    run: (_, o) => LIC[o.license](o.year, o.name.trim() || 'Your Name'),
  },
  {
    id: 'readme-generator', cat: D, title: 'README Generator', desc: 'Skeleton README.md with install, usage, contributing and license sections.',
    inputs: 0, sample: '',
    opts: [txt('name', 'Project name', 'my-project'), txt('desc', 'Description', 'A short description of what this does.'), txt('install', 'Install command', 'npm install my-project'), txt('usage', 'Usage snippet', 'my-project --help'), txt('license', 'License', 'MIT'), chk('contrib', 'Contributing section', true), chk('toc', 'Table of contents', true)],
    run: (_, o) => {
      const secs = ['Installation', 'Usage', ...(o.contrib ? ['Contributing'] : []), 'License'];
      const toc = o.toc ? `## Table of contents\n\n${secs.map((s) => `- [${s}](#${s.toLowerCase()})`).join('\n')}\n\n` : '';
      return `# ${o.name}\n\n${o.desc}\n\n${toc}## Installation\n\n${CODE('sh')}${o.install}\n\`\`\`\n\n## Usage\n\n${CODE('sh')}${o.usage}\n\`\`\`\n\n${o.contrib ? '## Contributing\n\nIssues and pull requests are welcome. Please open an issue first to discuss larger changes.\n\n' : ''}## License\n\n${o.license}\n`;
    },
  },
  {
    id: 'conventional-commit-generator', cat: D, title: 'Conventional Commit Generator', desc: 'Build a Conventional Commits message with scope, body, breaking change and footers.',
    inputs: 0, sample: '',
    opts: [sel('type', 'Type', ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']), txt('scope', 'Scope', 'api'), txt('subject', 'Subject', 'add pagination to list endpoint'), txt('body', 'Body (use \\n for newlines)', ''), txt('breaking', 'Breaking change description', ''), txt('footer', 'Footer (e.g. Closes #12)', '')],
    run: (_, o) => {
      if (!o.subject.trim()) throw new Error('Subject is required');
      const head = `${o.type}${o.scope.trim() ? `(${o.scope.trim()})` : ''}${o.breaking.trim() ? '!' : ''}: ${o.subject.trim().replace(/^./, (c) => c.toLowerCase()).replace(/\.$/, '')}`;
      const parts = [head, o.body.trim().replace(/\\n/g, '\n'), [o.breaking.trim() && `BREAKING CHANGE: ${o.breaking.trim()}`, o.footer.trim().replace(/\\n/g, '\n')].filter(Boolean).join('\n')].filter(Boolean);
      return parts.join('\n\n') + (head.length > 72 ? '\n\n(note: subject line is over 72 characters)' : '');
    },
  },
  {
    id: 'editorconfig-generator', cat: D, title: '.editorconfig Generator', desc: 'Generate an .editorconfig with indentation, line endings and per-filetype overrides.',
    inputs: 0, sample: '',
    opts: [sel('style', 'Indent style', ['space', 'tab']), num('size', 'Indent size', 2), sel('eol', 'End of line', ['lf', 'crlf', 'cr']), sel('charset', 'Charset', ['utf-8', 'latin1', 'utf-16be', 'utf-16le', 'utf-8-bom']), chk('trim', 'Trim trailing whitespace', true), chk('final', 'Final newline', true), chk('md', 'Keep trailing whitespace in Markdown', true), chk('make', 'Tabs for Makefiles', true)],
    run: (_, o) => {
      let s = `root = true\n\n[*]\nindent_style = ${o.style}\nindent_size = ${clamp(o.size, 1, 16)}\nend_of_line = ${o.eol}\ncharset = ${o.charset}\ntrim_trailing_whitespace = ${o.trim}\ninsert_final_newline = ${o.final}\n`;
      if (o.md) s += '\n[*.md]\ntrim_trailing_whitespace = false\n';
      if (o.make) s += '\n[Makefile]\nindent_style = tab\n';
      return s;
    },
  },
  {
    id: 'package-json-generator', cat: D, title: 'package.json Generator', desc: 'Starter package.json with metadata, ESM/CommonJS type, scripts and engines.',
    inputs: 0, sample: '',
    opts: [txt('name', 'Name', 'my-package'), txt('version', 'Version', '1.0.0'), txt('desc', 'Description', ''), txt('author', 'Author', ''), txt('license', 'License', 'MIT'), sel('type', 'Module type', ['module', 'commonjs']), txt('main', 'Entry', 'index.js'), txt('scripts', 'Scripts (name=cmd; name=cmd)', 'start=node index.js; test=node --test'), txt('node', 'Node engine', '>=18'), chk('priv', 'Private')],
    run: (_, o) => {
      const scripts = Object.fromEntries(o.scripts.split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf('='); if (i < 1) throw new Error(`Bad script "${x}", use name=command`); return [x.slice(0, i).trim(), x.slice(i + 1).trim()]; }));
      const pkg = { name: o.name, version: o.version, description: o.desc || undefined, type: o.type, main: o.main, scripts, keywords: [], author: o.author || undefined, license: o.license || undefined, engines: o.node ? { node: o.node } : undefined, private: o.priv || undefined };
      return JSON.stringify(pkg, null, 2) + '\n';
    },
  },
  {
    id: 'tsconfig-generator', cat: D, title: 'tsconfig.json Generator', desc: 'tsconfig presets for Node, browser apps, libraries and React.',
    inputs: 0, sample: '',
    opts: [sel('preset', 'Preset', ['node', 'browser', 'library', 'react']), chk('strict', 'strict', true), txt('outDir', 'outDir', 'dist'), txt('rootDir', 'rootDir / include', 'src'), chk('sourcemap', 'sourceMap', true)],
    run: (_, o) => {
      const base = { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: o.strict, esModuleInterop: true, skipLibCheck: true, forceConsistentCasingInFileNames: true, sourceMap: o.sourcemap, outDir: o.outDir };
      const p = {
        node: { ...base, module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2023'], types: ['node'] },
        browser: { ...base, lib: ['ES2022', 'DOM', 'DOM.Iterable'], noEmit: true },
        library: { ...base, declaration: true, declarationMap: true, lib: ['ES2022'], rootDir: o.rootDir },
        react: { ...base, lib: ['ES2022', 'DOM', 'DOM.Iterable'], jsx: 'react-jsx', noEmit: true, isolatedModules: true },
      }[o.preset];
      if (p.noEmit) delete p.outDir;
      return JSON.stringify({ compilerOptions: p, include: [o.rootDir], exclude: ['node_modules', o.outDir] }, null, 2) + '\n';
    },
  },
  {
    id: 'eslint-prettier-config-generator', cat: D, title: 'ESLint / Prettier Config Generator', desc: 'Generate eslint.config.js (flat config) and .prettierrc from a few choices.',
    inputs: 0, sample: '',
    opts: [sel('tool', 'Config', ['both', 'eslint', 'prettier']), chk('ts', 'TypeScript (typescript-eslint)'), sel('env', 'Environment', ['node', 'browser']), chk('semi', 'Semicolons', true), chk('single', 'Single quotes', true), num('width', 'Print width', 100), num('tab', 'Tab width', 2), sel('trailing', 'Trailing commas', ['all', 'es5', 'none'])],
    run: (_, o) => {
      const es = `import js from '@eslint/js';\nimport globals from 'globals';\n${o.ts ? "import tseslint from 'typescript-eslint';\n" : ''}\nexport default ${o.ts ? 'tseslint.config(' : '['}\n  { ignores: ['dist/', 'node_modules/'] },\n  js.configs.recommended,\n${o.ts ? '  ...tseslint.configs.recommended,\n' : ''}  {\n    languageOptions: { globals: globals.${o.env} },\n    rules: {\n      'no-unused-vars': 'warn',\n      eqeqeq: 'error',\n    },\n  },\n${o.ts ? ');' : '];'}\n`;
      const pr = JSON.stringify({ semi: o.semi, singleQuote: o.single, printWidth: clamp(o.width, 20, 200), tabWidth: clamp(o.tab, 1, 8), trailingComma: o.trailing }, null, 2) + '\n';
      const deps = `# npm i -D eslint @eslint/js globals${o.ts ? ' typescript typescript-eslint' : ''}${o.tool !== 'eslint' ? ' prettier' : ''}\n`;
      return o.tool === 'eslint' ? `// eslint.config.js\n${es}\n${deps}` : o.tool === 'prettier' ? `// .prettierrc\n${pr}\n${deps}` : `// eslint.config.js\n${es}\n// .prettierrc\n${pr}\n${deps}`;
    },
  },
  {
    id: 'makefile-generator', cat: D, title: 'Makefile Generator', desc: 'Makefile with install, build, test, lint, run and clean targets for common stacks.',
    inputs: 0, sample: '', opts: [sel('lang', 'Stack', ['node', 'python', 'go', 'rust', 'c']), txt('name', 'Binary/app name', 'app')],
    run: (_, o) => {
      const T = {
        node: [['install', 'npm ci'], ['build', 'npm run build'], ['test', 'npm test'], ['lint', 'npm run lint'], ['run', 'npm start'], ['clean', 'rm -rf node_modules dist']],
        python: [['install', 'python -m pip install -r requirements.txt'], ['build', 'python -m build'], ['test', 'python -m pytest'], ['lint', 'ruff check .'], ['run', `python -m ${o.name}`], ['clean', 'rm -rf dist build *.egg-info .pytest_cache __pycache__']],
        go: [['install', 'go mod download'], ['build', `go build -o bin/${o.name} .`], ['test', 'go test ./...'], ['lint', 'go vet ./...'], ['run', `go run .`], ['clean', 'rm -rf bin']],
        rust: [['install', 'cargo fetch'], ['build', 'cargo build --release'], ['test', 'cargo test'], ['lint', 'cargo clippy -- -D warnings'], ['run', 'cargo run'], ['clean', 'cargo clean']],
        c: [['install', '@echo "nothing to install"'], ['build', `$(CC) $(CFLAGS) -o ${o.name} src/*.c`], ['test', '@echo "add tests"'], ['lint', 'cppcheck src'], ['run', `./${o.name}`], ['clean', `rm -f ${o.name}`]],
      }[o.lang];
      const deps = { run: 'build' };
      return `.DEFAULT_GOAL := build\n.PHONY: ${T.map((t) => t[0]).join(' ')}\n${o.lang === 'c' ? 'CC ?= cc\nCFLAGS ?= -Wall -Wextra -O2\n' : ''}\n` + T.map(([n, c]) => `${n}:${deps[n] ? ' ' + deps[n] : ''}\n\t${c}\n`).join('\n');
    },
  },
  {
    id: 'http-snippet-generator', cat: D, title: 'HTTP Snippet Generator', desc: 'Turn a raw request (METHOD URL, headers, blank line, body) into fetch, curl and Python snippets.',
    sample: 'POST https://api.example.com/v1/items\nContent-Type: application/json\nAuthorization: Bearer TOKEN\n\n{"name":"widget","qty":2}', labels: ['Request: first line METHOD URL, then Header: value lines, blank line, body'],
    run: ([s]) => {
      const [head, ...rest] = s.replace(/\r/g, '').split('\n\n'), hl = head.split('\n').filter((l) => l.trim()), body = rest.join('\n\n').trim();
      const m = /^([A-Za-z]+)\s+(\S+)/.exec(hl[0] || '');
      if (!m) throw new Error('First line must be: METHOD URL');
      const method = m[1].toUpperCase(), url = m[2], headers = hl.slice(1).map((l) => { const i = l.indexOf(':'); if (i < 1) throw new Error(`Bad header line "${l}"`); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
      const sq = (x) => `'${x.replace(/'/g, `'\\''`)}'`;
      const curl = `curl -X ${method} ${sq(url)}${headers.map(([k, v]) => ` \\\n  -H ${sq(k + ': ' + v)}`).join('')}${body ? ` \\\n  --data-raw ${sq(body)}` : ''}`;
      const fetchS = `const res = await fetch(${q(url)}, {\n  method: ${q(method)},${headers.length ? `\n  headers: ${JSON.stringify(Object.fromEntries(headers), null, 2).replace(/\n/g, '\n  ')},` : ''}${body ? `\n  body: ${q(body)},` : ''}\n});\nconsole.log(res.status, await res.text());`;
      const py = `import urllib.request\n\nreq = urllib.request.Request(\n    ${q(url)},\n    method=${q(method)},\n    headers=${JSON.stringify(Object.fromEntries(headers))},\n    data=${body ? q(body) + '.encode()' : 'None'},\n)\nwith urllib.request.urlopen(req) as res:\n    print(res.status, res.read().decode())`;
      return `# curl\n${curl}\n\n# fetch\n${fetchS}\n\n# Python (stdlib)\n${py}\n`;
    },
  },
  {
    id: 'user-agent-string-list', cat: REF, title: 'User-Agent String List', desc: 'Common browser, bot and tool User-Agent strings. Type a word to filter.',
    sample: 'chrome', labels: ['Filter (blank = all)'],
    run: ([s]) => {
      const f = s.trim().toLowerCase(), r = UAS.filter(([n, u]) => (n + u).toLowerCase().includes(f));
      if (!r.length) throw new Error('No matches');
      return r.map(([n, u]) => `${n}\n${u}`).join('\n\n');
    },
  },
];

export const _qr = { qrMatrix, qrCodewords, interleave, rsDivisor, rsRemainder, bchFormat, bchVersion, dataCodewords, barcodeModules, pngBlob, qrSvg, ibanCheck, C128, C39, EAN_G, ECC_PER_BLOCK, NUM_BLOCKS, rawModules, MASKS, ECL_BITS, ALNUM };
export default tools;

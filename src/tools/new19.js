// Tools from free-browser-tools.md, batch 19 (Audio Tools and PDF Tools). See TOOLS.md for the contract.
// Everything is hand-written with platform APIs. Audio is decoded by the browser (decodeAudioData); all processing
// (resampling, WSOLA time stretch, STFT, biquads, FLAC and WAV writers, ID3 writer) is plain JS and works in Node.
// PDF tools reuse the reader/writer in pdfedit.js (imported lazily) and the renderer in pdfrender.js / OCR in ocr.js.
// Skipped on purpose: MP3/OGG/AAC/M4R encoding (no encoder without third-party code), multilingual Whisper and neural
// vocal separation (model weights not available), ffmpeg.wasm, pdf.js and Tesseract.js (third-party code).
const T = [];
const AUD = 'Audio', PDFC = 'PDF';
const num = (id, label, def) => ({ id, label, type: 'number', def });
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def === undefined ? choices[0] : def });
const txt = (id, label, def = '') => ({ id, label, type: 'text', def });
const chk = (id, label, def) => ({ id, label, type: 'checkbox', def });
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const db2g = (d) => 10 ** (d / 20);
const g2db = (g) => 20 * Math.log10(g);
const fix = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const N_ = (v, def) => (v === '' || v == null || !Number.isFinite(+v) ? def : +v);
const fmtT = (s) => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };

// ============================================================ audio core
// Audio object: { rate, ch: Float32Array[] }
export async function decodeAudioFile(file) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) throw new Error('This browser has no Web Audio decoder');
  const ctx = new AC();
  try {
    const b = await ctx.decodeAudioData(await file.arrayBuffer());
    return { rate: b.sampleRate, ch: Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i).slice()) };
  } catch { throw new Error(`${file.name || 'file'}: this browser cannot decode the file (try MP3, WAV, OGG, M4A or FLAC)`); }
  finally { ctx.close?.(); }
}
const needFile = (files, what = 'an audio file') => { if (!files?.length) throw new Error(`Choose ${what} first`); return files[0]; };
const dur = (A) => A.ch[0].length / A.rate;
const baseName = (f, ext) => (f?.name || 'audio').replace(/\.[^.]+$/, '') + ext;
const mono = (A) => { const n = A.ch[0].length, m = new Float32Array(n), c = A.ch.length; for (const x of A.ch) for (let i = 0; i < n; i++) m[i] += x[i] / c; return m; };
const peakOf = (A) => { let p = 0; for (const x of A.ch) for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; };

export function wavBytes(A, bits = 16) {
  const n = A.ch[0].length, c = A.ch.length, bps = bits / 8, size = n * c * bps;
  if (size > 4e9) throw new Error('Result is larger than 4 GB');
  const buf = new ArrayBuffer(44 + size), v = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + size, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, bits === 32 ? 3 : 1, true);
  v.setUint16(22, c, true); v.setUint32(24, A.rate, true); v.setUint32(28, A.rate * c * bps, true); v.setUint16(32, c * bps, true); v.setUint16(34, bits, true);
  w(36, 'data'); v.setUint32(40, size, true);
  let p = 44;
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) {
    const s = A.ch[k][i];
    if (bits === 32) { v.setFloat32(p, s, true); p += 4; } else if (bits === 24) { const q = Math.round(clamp(s, -1, 1) * 8388607); v.setUint8(p, q & 255); v.setUint8(p + 1, (q >> 8) & 255); v.setUint8(p + 2, (q >> 16) & 255); p += 3; } else { v.setInt16(p, Math.round(clamp(s, -1, 1) * 32767), true); p += 2; }
  }
  return new Uint8Array(buf);
}
const wavOut = (A, name, text, bits = 16) => ({ blob: new File([wavBytes(A, bits)], name, { type: 'audio/wav' }), filename: name, text });

// ---- FFT (radix 2, in place) ----
const TW = new Map();
function twid(N) {
  let t = TW.get(N);
  if (!t) { t = { c: new Float64Array(N / 2), s: new Float64Array(N / 2), r: new Uint32Array(N) }; for (let i = 0; i < N / 2; i++) { t.c[i] = Math.cos((2 * Math.PI * i) / N); t.s[i] = -Math.sin((2 * Math.PI * i) / N); } const b = Math.log2(N); for (let i = 0; i < N; i++) { let r = 0; for (let k = 0; k < b; k++) r |= ((i >> k) & 1) << (b - 1 - k); t.r[i] = r; } TW.set(N, t); }
  return t;
}
export function fft(re, im, inv = false) {
  const N = re.length, t = twid(N);
  for (let i = 0; i < N; i++) { const j = t.r[i]; if (j > i) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } }
  for (let len = 2; len <= N; len <<= 1) {
    const h = len >> 1, st = N / len;
    for (let i = 0; i < N; i += len) for (let k = 0; k < h; k++) {
      const wr = t.c[k * st], wi = inv ? -t.s[k * st] : t.s[k * st], a = i + k, b = a + h;
      const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
      re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
    }
  }
  if (inv) for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; }
}
const hann = (N) => { const w = new Float64Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); return w; };

// ---- windowed-sinc resampler: output[i] = input at position i*factor (factor > 1 shortens / speeds up) ----
export function resample(x, factor, Z = 12) {
  if (Math.abs(factor - 1) < 1e-9) return x.slice();
  const n = x.length, m = Math.max(0, Math.floor((n - 1) / factor)), cut = Math.min(1, 1 / factor), H = Math.ceil(Z / cut), o = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const t = i * factor, c = Math.floor(t), f = t - c;
    let s = 0;
    for (let j = -H + 1; j <= H; j++) {
      const k = c + j; if (k < 0 || k >= n) continue;
      const u = j - f, a = u * cut; if (Math.abs(u) >= H) continue;
      const sinc = Math.abs(a) < 1e-9 ? 1 : Math.sin(Math.PI * a) / (Math.PI * a);
      s += x[k] * sinc * cut * (0.5 + 0.5 * Math.cos((Math.PI * u) / H));
    }
    o[i] = s;
  }
  return o;
}
export const resampleAudio = (A, rate) => (rate === A.rate ? A : { rate, ch: A.ch.map((x) => resample(x, A.rate / rate)) });

// ---- WSOLA time stretch: speed > 1 shortens, pitch is kept ----
export function wsola(chs, rate, speed) {
  if (Math.abs(speed - 1) < 1e-4) return chs.map((x) => x.slice());
  const n = chs[0].length, N = 2 * Math.round(rate * 0.023), Hs = N / 2, Ha = Hs * speed, Dl = Math.round(Hs * 0.75), D = 4;
  const m = Math.floor(n / speed), w = hann(N);
  const ms = new Float32Array(n); for (const x of chs) for (let i = 0; i < n; i++) ms[i] += x[i] / chs.length;
  const dn = Math.ceil(n / D), xs = new Float32Array(dn); for (let i = 0; i < n; i++) xs[(i / D) | 0] += ms[i] / D;
  const sq = new Float64Array(dn + 1); for (let i = 0; i < dn; i++) sq[i + 1] = sq[i] + xs[i] * xs[i];
  const out = chs.map(() => new Float64Array(m + N)), norm = new Float64Array(m + N);
  const L = Math.floor(Hs / D), at = (a, i) => (i >= 0 && i < a.length ? a[i] : 0);
  let prev = 0;
  for (let k = 0; ; k++) {
    const o = k * Hs; if (o >= m) break;
    let c = Math.round(k * Ha);
    if (k > 0) {
      const nominal = c, tmpl = Math.round((prev + Hs) / D);
      let best = -Infinity, bd = 0;
      const lo = Math.round(-Dl / D), hi = Math.round(Dl / D);
      for (let d = lo; d <= hi; d++) {
        const s0 = Math.round(nominal / D) + d; if (s0 < 0) continue;
        let dot = 0; for (let i = 0; i < L; i++) dot += at(xs, s0 + i) * at(xs, tmpl + i);
        const e = sq[Math.min(dn, s0 + L)] - sq[Math.min(dn, s0)];
        const sc = dot / Math.sqrt(e + 1e-9);
        if (sc > best) { best = sc; bd = d; }
      }
      const c0 = Math.round(nominal / D) * D + bd * D; let b2 = -Infinity, c1 = c0;
      const t0 = prev + Hs;
      for (let d = -D; d <= D; d++) {
        const s0 = c0 + d; if (s0 < 0) continue;
        let dot = 0, e = 0; for (let i = 0; i < Hs; i += 2) { const a = at(ms, s0 + i); dot += a * at(ms, t0 + i); e += a * a; }
        const sc = dot / Math.sqrt(e + 1e-9); if (sc > b2) { b2 = sc; c1 = s0; }
      }
      c = c1;
    }
    for (let ci = 0; ci < chs.length; ci++) { const x = chs[ci], y = out[ci]; for (let i = 0; i < N; i++) y[o + i] += at(x, c + i) * w[i]; }
    for (let i = 0; i < N; i++) norm[o + i] += w[i];
    prev = c;
    if (c > n + N) break;
  }
  return out.map((y) => { const r = new Float32Array(m); for (let i = 0; i < m; i++) r[i] = norm[i] > 1e-3 ? y[i] / norm[i] : 0; return r; });
}

// ---- RBJ biquads ----
export function biquad(type, fs, f0, Q = 0.7071, gainDb = 0) {
  const A = 10 ** (gainDb / 40), w0 = (2 * Math.PI * f0) / fs, cs = Math.cos(w0), al = Math.sin(w0) / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  else if (type === 'lowshelf') { const s = 2 * Math.sqrt(A) * al; b0 = A * (A + 1 - (A - 1) * cs + s); b1 = 2 * A * (A - 1 - (A + 1) * cs); b2 = A * (A + 1 - (A - 1) * cs - s); a0 = A + 1 + (A - 1) * cs + s; a1 = -2 * (A - 1 + (A + 1) * cs); a2 = A + 1 + (A - 1) * cs - s; }
  else if (type === 'highshelf') { const s = 2 * Math.sqrt(A) * al; b0 = A * (A + 1 + (A - 1) * cs + s); b1 = -2 * A * (A - 1 + (A + 1) * cs); b2 = A * (A + 1 + (A - 1) * cs - s); a0 = A + 1 - (A - 1) * cs + s; a1 = 2 * (A - 1 - (A + 1) * cs); a2 = A + 1 - (A - 1) * cs - s; }
  else if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; } // highpass
  return { b: [b0 / a0, b1 / a0, b2 / a0], a: [1, a1 / a0, a2 / a0] };
}
export function filt(x, f) {
  const { b, a } = f, y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}

// ---- loudness (ITU-R BS.1770-4 / EBU R128 integrated loudness) ----
export function kWeight(x, fs) {
  const K1 = Math.tan((Math.PI * 1681.974450955533) / fs), Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416, Q1 = 0.7071752369554196;
  const a0 = 1 + K1 / Q1 + K1 * K1;
  const s1 = { b: [(Vh + (Vb * K1) / Q1 + K1 * K1) / a0, (2 * (K1 * K1 - Vh)) / a0, (Vh - (Vb * K1) / Q1 + K1 * K1) / a0], a: [1, (2 * (K1 * K1 - 1)) / a0, (1 - K1 / Q1 + K1 * K1) / a0] };
  const K2 = Math.tan((Math.PI * 38.13547087602444) / fs), Q2 = 0.5003270373238773, c0 = 1 + K2 / Q2 + K2 * K2;
  const s2 = { b: [1, -2, 1], a: [1, (2 * (K2 * K2 - 1)) / c0, (1 - K2 / Q2 + K2 * K2) / c0] };
  return filt(filt(x, s1), s2);
}
// returns { lufs, blocks } ; channel weights: L R C = 1, LFE ignored, surround 1.41 (order L R C LFE Ls Rs)
export function integratedLoudness(A) {
  const fs = A.rate, n = A.ch[0].length, nc = A.ch.length, win = Math.round(0.4 * fs), hop = Math.round(0.1 * fs);
  if (n < win) return { lufs: -Infinity, blocks: 0 };
  const gw = (c) => (nc >= 5 && c >= 4 ? 1.41 : nc >= 4 && c === 3 ? 0 : 1);
  const cum = [];
  for (let c = 0; c < nc; c++) { if (!gw(c)) { cum.push(null); continue; } const y = kWeight(A.ch[c], fs), s = new Float64Array(n + 1); for (let i = 0; i < n; i++) s[i + 1] = s[i] + y[i] * y[i]; cum.push(s); }
  const pw = [];
  for (let s0 = 0; s0 + win <= n; s0 += hop) { let z = 0; for (let c = 0; c < nc; c++) if (cum[c]) z += (gw(c) * (cum[c][s0 + win] - cum[c][s0])) / win; pw.push(z); }
  const L = (z) => -0.691 + 10 * Math.log10(z);
  const abs = pw.filter((z) => z > 0 && L(z) > -70);
  if (!abs.length) return { lufs: -Infinity, blocks: pw.length };
  const th = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10, rel = abs.filter((z) => L(z) > th);
  return { lufs: rel.length ? L(rel.reduce((a, b) => a + b, 0) / rel.length) : -Infinity, blocks: rel.length };
}
// 4x oversampled peak estimate (cubic), dB relative to full scale
export function truePeakDb(A) {
  let p = 0;
  for (const x of A.ch) for (let i = 1; i < x.length - 2; i++) {
    const a = x[i - 1], b = x[i], c = x[i + 1], d = x[i + 2];
    for (const t of [0.25, 0.5, 0.75]) { const v = b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a))); const q = Math.abs(v); if (q > p) p = q; }
    const q = Math.abs(b); if (q > p) p = q;
  }
  return p > 0 ? g2db(p) : -Infinity;
}
// brick-wall limiter, ceiling linear: gain = centred moving average of the windowed minimum of the needed gain,
// so every output sample stays at or below the ceiling (ponytail: no release shaping, fine for mastering a file)
export function limit(x, ceil, la = 48) {
  const n = x.length, g = new Float32Array(n), mn = new Float32Array(n), dq = new Int32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); g[i] = a > ceil ? ceil / a : 1; }
  let h = 0, t = 0;
  for (let i = 0; i < n + la; i++) { // window [i-2la.. i] feeds centre i-la
    if (i < n) { while (t > h && g[dq[t - 1]] >= g[i]) t--; dq[t++] = i; }
    while (dq[h] < i - 2 * la) h++;
    if (i - la >= 0) mn[i - la] = g[dq[h]];
  }
  const cs = new Float64Array(n + 1); for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + mn[i];
  const o = new Float32Array(n), r = la >> 1;
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - r), b = Math.min(n, i + r + 1); o[i] = x[i] * ((cs[b] - cs[a]) / (b - a)); }
  return o;
}

// ============================================================ audio processing (pure)
export function joinAudio(list, { xfade = 0, gap = 0 } = {}) {
  const rate = list[0].rate, nc = Math.max(...list.map((a) => a.ch.length));
  const L = list.map((a) => { const r = resampleAudio(a, rate); return Array.from({ length: nc }, (_, c) => r.ch[Math.min(c, r.ch.length - 1)]); });
  const g = Math.round(gap * rate);
  let xf = g ? 0 : Math.round(xfade * rate), total = 0;
  const lens = L.map((c) => c[0].length);
  const xs = lens.map((n, i) => (i ? Math.min(xf, n, lens[i - 1]) : 0));
  lens.forEach((n, i) => { total += n - xs[i] + (i && g ? g : 0); });
  const out = Array.from({ length: nc }, () => new Float32Array(total));
  let pos = 0;
  L.forEach((c, i) => {
    if (i && g) pos += g;
    const x = xs[i], start = pos - x;
    for (let k = 0; k < nc; k++) {
      const o = out[k], s = c[k];
      for (let j = 0; j < x; j++) { const t = ((j + 0.5) / x) * Math.PI / 2; o[start + j] = o[start + j] * Math.cos(t) + s[j] * Math.sin(t); }
      o.set(s.subarray(x), start + x);
    }
    pos = start + lens[i];
  });
  return { rate, ch: out };
}
export function normalizeLoudness(A, target, { ceiling = -1, mode = 'reduce' } = {}) {
  const m = integratedLoudness(A);
  if (!Number.isFinite(m.lufs)) throw new Error('Too quiet or too short to measure loudness (needs at least 400 ms above -70 LUFS)');
  let gain = target - m.lufs;
  const pk = peakOf(A), ceil = db2g(ceiling);
  let note = '';
  if (pk * db2g(gain) > ceil) {
    if (mode === 'reduce') { gain = g2db(ceil / pk); note = `gain reduced to keep the peak at ${ceiling} dBFS, so the target was not reached`; }
    else if (mode === 'limit') note = `peaks limited to ${ceiling} dBFS`;
    else note = 'peaks above full scale will clip';
  }
  const k = db2g(gain);
  const ch = A.ch.map((x) => { const y = new Float32Array(x.length); for (let i = 0; i < y.length; i++) y[i] = x[i] * k; return mode === 'limit' ? limit(y, ceil) : y; });
  const B = { rate: A.rate, ch };
  return { audio: B, before: m.lufs, gain, after: integratedLoudness(B).lufs, peakBefore: g2db(pk), peakAfter: g2db(peakOf(B)), note };
}
const CURVES = {
  linear: (t) => t,
  cosine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  'equal power': (t) => Math.sin((Math.PI / 2) * t),
  logarithmic: (t) => (10 ** (2 * t - 2) - 0.01) / 0.99,
};
export function fadeAudio(A, inS, outS, curve = 'linear') {
  const f = CURVES[curve] || CURVES.linear, n = A.ch[0].length;
  const a = Math.min(n, Math.round(inS * A.rate)), b = Math.min(n, Math.round(outS * A.rate));
  return { rate: A.rate, ch: A.ch.map((x) => { const y = x.slice(); for (let i = 0; i < a; i++) y[i] *= f((i + 0.5) / a); for (let i = 0; i < b; i++) y[n - 1 - i] *= f((i + 0.5) / b); return y; }) };
}
export function removeSilence(A, { thresholdDb = -45, minMs = 500, keepMs = 0 } = {}) {
  const n = A.ch[0].length, w = Math.max(1, Math.round(A.rate * 0.01)), nb = Math.ceil(n / w), thr = db2g(thresholdDb) ** 2;
  const quiet = new Uint8Array(nb);
  for (let b = 0; b < nb; b++) { let mx = 0; for (const x of A.ch) { let s = 0; const e = Math.min(n, (b + 1) * w); for (let i = b * w; i < e; i++) s += x[i] * x[i]; s /= e - b * w; if (s > mx) mx = s; } quiet[b] = mx < thr ? 1 : 0; }
  const minB = Math.max(1, Math.round(minMs / 10)), keepB = Math.round(keepMs / 10), segs = [];
  let cur = 0, removed = 0, cuts = 0;
  for (let b = 0; b <= nb;) {
    if (b < nb && quiet[b]) { let e = b; while (e < nb && quiet[e]) e++; if (e - b >= minB && e - b > keepB) { const h = keepB >> 1, h2 = keepB - h; segs.push([cur, (b + h) * w]); cur = (e - h2) * w; removed += (e - b - keepB) * w; cuts++; } b = e; } else b++;
  }
  segs.push([cur, n]);
  const fl = Math.round(A.rate * 0.002), total = segs.reduce((a, s) => a + Math.max(0, Math.min(n, s[1]) - s[0]), 0);
  const ch = A.ch.map((x) => { const o = new Float32Array(total); let p = 0; segs.forEach(([s, e], si) => { e = Math.min(e, n); const len = Math.max(0, e - s); o.set(x.subarray(s, s + len), p); if (si) for (let i = 0; i < Math.min(fl, len); i++) o[p + i] *= (i + 1) / (fl + 1); if (si < segs.length - 1) for (let i = 0; i < Math.min(fl, len); i++) o[p + len - 1 - i] *= (i + 1) / (fl + 1); p += len; }); return o; });
  return { audio: { rate: A.rate, ch }, removed: removed / A.rate, cuts };
}
// spectral-subtraction noise reducer. profile = [startSample, endSample) of noise only
export function reduceNoise(A, p0, p1, { reductionDb = 12, strength = 1.5, N = 2048 } = {}) {
  const hop = N / 4, w = hann(N), floor = db2g(-reductionDb), bins = N / 2 + 1;
  const ch = A.ch.map((x) => {
    const n = x.length, pad = new Float64Array(n + 2 * N); pad.set(x, N);
    const re = new Float64Array(N), im = new Float64Array(N);
    const noise = new Float64Array(bins); let cnt = 0;
    for (let s = Math.max(0, p0); s + N <= Math.min(n, p1); s += hop) { for (let i = 0; i < N; i++) { re[i] = x[s + i] * w[i]; im[i] = 0; } fft(re, im); for (let k = 0; k < bins; k++) noise[k] += re[k] * re[k] + im[k] * im[k]; cnt++; }
    if (!cnt) throw new Error('The noise profile section must be at least ' + ((N / A.rate) * 1000).toFixed(0) + ' ms long');
    for (let k = 0; k < bins; k++) noise[k] /= cnt;
    const out = new Float64Array(pad.length), prevG = new Float64Array(bins).fill(1), g = new Float64Array(bins), g2 = new Float64Array(bins);
    for (let s = 0; s + N <= pad.length; s += hop) {
      for (let i = 0; i < N; i++) { re[i] = pad[s + i] * w[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k < bins; k++) { const p = re[k] * re[k] + im[k] * im[k]; g[k] = Math.sqrt(Math.max(floor * floor, 1 - (strength * noise[k]) / (p + 1e-20))); }
      for (let k = 0; k < bins; k++) { const sm = (g[Math.max(0, k - 1)] + 2 * g[k] + g[Math.min(bins - 1, k + 1)]) / 4; g2[k] = sm < prevG[k] ? 0.5 * sm + 0.5 * prevG[k] : sm; prevG[k] = g2[k]; }
      for (let k = 0; k < bins; k++) { re[k] *= g2[k]; im[k] *= g2[k]; if (k > 0 && k < N / 2) { re[N - k] *= g2[k]; im[N - k] *= g2[k]; } }
      fft(re, im, true);
      for (let i = 0; i < N; i++) out[s + i] += re[i] * w[i] / 1.5;
    }
    return Float32Array.from(out.subarray(N, N + n));
  });
  return { rate: A.rate, ch };
}
// STFT magnitudes (Hann) of a mono signal: returns { mags: Float32Array[] (bins = N/2+1), hop, N }
export function stftMag(x, N, hop, maxFrames = 1e9) {
  const w = hann(N), re = new Float64Array(N), im = new Float64Array(N), mags = [];
  for (let s = 0; s + N <= x.length && mags.length < maxFrames; s += hop) {
    for (let i = 0; i < N; i++) { re[i] = x[s + i] * w[i]; im[i] = 0; }
    fft(re, im);
    const m = new Float32Array(N / 2 + 1); for (let k = 0; k <= N / 2; k++) m[k] = Math.hypot(re[k], im[k]);
    mags.push(m);
  }
  return { mags, hop, N };
}
export function detectBpm(A) {
  let x = mono(A), rate = A.rate;
  if (rate > 24000) { const f = Math.round(rate / 11025); x = resample(x, f); rate /= f; }
  const N = 1024, hop = 128, fps = rate / hop, { mags } = stftMag(x, N, hop);
  if (mags.length < fps * 6) throw new Error('Need at least about 6 seconds of audio');
  const lo = Math.round((40 / rate) * N), hi = Math.round((4500 / rate) * N);
  const flux = new Float64Array(mags.length);
  for (let t = 1; t < mags.length; t++) { let s = 0; for (let k = lo; k < hi; k++) { const d = Math.log1p(100 * mags[t][k]) - Math.log1p(100 * mags[t - 1][k]); if (d > 0) s += d; } flux[t] = s; }
  const m = flux.length, env = new Float64Array(m), r = Math.round(fps * 0.2);
  for (let t = 0; t < m; t++) { let s = 0, c = 0; for (let j = Math.max(0, t - r); j < Math.min(m, t + r + 1); j++) { s += flux[j]; c++; } env[t] = Math.max(0, flux[t] - s / c); }
  const acf = (lag) => { const l0 = Math.floor(lag), f = lag - l0; let s = 0; for (let t = 0; t + l0 + 1 < m; t++) s += env[t] * (env[t + l0] * (1 - f) + env[t + l0 + 1] * f); return s / (m - l0); };
  const score = (bpm) => { const l = (60 * fps) / bpm; return acf(l) + 0.5 * acf(2 * l); };
  const cand = [];
  for (let b = 50; b <= 220; b += 0.5) { const prior = Math.exp(-0.5 * (Math.log2(b / 120) / 2) ** 2); cand.push([b, score(b), score(b) * prior]); }
  let bi = 0; cand.forEach((c, i) => { if (c[2] > cand[bi][2]) bi = i; });
  let best = cand[bi][0], bs = -1;
  for (let b = best * 0.97; b <= best * 1.03; b += 0.05) { const s = score(b); if (s > bs) { bs = s; best = b; } }
  const mean = cand.reduce((a, c) => a + c[1], 0) / cand.length;
  return { bpm: best, confidence: bs / (mean + 1e-12), half: best / 2, double: best * 2, seconds: A.ch[0].length / A.rate };
}
const KK = { major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] };
const PCN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CAM_MAJ = { C: '8B', G: '9B', D: '10B', A: '11B', E: '12B', B: '1B', 'F#': '2B', 'C#': '3B', 'G#': '4B', 'D#': '5B', 'A#': '6B', F: '7B' };
const CAM_MIN = { A: '8A', E: '9A', B: '10A', 'F#': '11A', 'C#': '12A', 'G#': '1A', 'D#': '2A', 'A#': '3A', F: '4A', C: '5A', G: '6A', D: '7A' };
const corr = (a, b) => { const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let s = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; } return s / Math.sqrt(va * vb + 1e-30); };
export function detectKey(A) {
  let x = mono(A), rate = A.rate;
  if (rate > 24000) { const f = Math.round(rate / 11025); x = resample(x, f); rate /= f; }
  const N = 8192, { mags } = stftMag(x, N, N / 2, 400);
  if (mags.length < 2) throw new Error('Need at least a few seconds of audio');
  const fb = rate / N, k0 = Math.ceil(60 / fb), k1 = Math.floor(2000 / fb), hist = new Float64Array(21);
  for (const m of mags) for (let k = k0; k < k1; k++) { const mi = 69 + 12 * Math.log2((k * fb) / 440), d = mi - Math.round(mi); hist[Math.round((d + 0.5) * 20)] += m[k]; }
  let tb = 0; hist.forEach((v, i) => { if (v > hist[tb]) tb = i; });
  const tune = tb / 20 - 0.5, chroma = new Float64Array(12);
  for (const m of mags) { let mx = 0; for (let k = k0; k < k1; k++) if (m[k] > mx) mx = m[k]; for (let k = k0; k < k1; k++) { const mi = 69 + 12 * Math.log2((k * fb) / 440) - tune, pc = ((Math.round(mi) % 12) + 12) % 12; chroma[pc] += m[k] / (mx + 1e-9); } }
  const res = [];
  for (let t = 0; t < 12; t++) for (const mode of ['major', 'minor']) { const prof = KK[mode].map((_, i) => KK[mode][(i - t + 12) % 12]); res.push({ key: PCN[t] + (mode === 'minor' ? ' minor' : ' major'), tonic: PCN[t], mode, r: corr(chroma, prof) }); }
  res.sort((a, b) => b.r - a.r);
  for (const r of res) r.camelot = (r.mode === 'major' ? CAM_MAJ : CAM_MIN)[r.tonic];
  return { top: res.slice(0, 3), tuningCents: tune * 100, chroma: Array.from(chroma) };
}
const STOPS = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
const cmap = (t) => { t = clamp(t, 0, 1) * 4; const i = Math.min(3, Math.floor(t)), f = t - i; return STOPS[i].map((v, k) => v + (STOPS[i + 1][k] - v) * f); };
// returns RGBA image of a spectrogram; rows run high to low frequency
export function spectrogramImage(x, rate, { win = 1024, maxWidth = 1400, height = 400, rangeDb = 80, log = false, fmax = 0 } = {}) {
  const hop = Math.max(win / 4, Math.ceil((x.length - win) / maxWidth)), { mags } = stftMag(x, win, Math.floor(hop));
  if (!mags.length) throw new Error('The audio is shorter than one analysis window');
  const bins = win / 2 + 1, top = Math.min(rate / 2, fmax || rate / 2), W = mags.length, H = height, data = new Uint8ClampedArray(W * H * 4);
  let mx = 1e-12; for (const m of mags) for (let k = 0; k < bins; k++) if (m[k] > mx) mx = m[k];
  const fOf = (row) => { const f = 1 - row / (H - 1); return log ? 30 * (top / 30) ** f : top * f; };
  for (let row = 0; row < H; row++) {
    const kf = (fOf(row) / (rate / 2)) * (bins - 1), k = Math.floor(kf), fr = kf - k;
    for (let t = 0; t < W; t++) { const v = mags[t][k] * (1 - fr) + mags[t][Math.min(bins - 1, k + 1)] * fr, d = 20 * Math.log10(v / mx + 1e-12), c = cmap((d + rangeDb) / rangeDb), o = (row * W + t) * 4; data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255; }
  }
  return { w: W, h: H, data, hopSeconds: Math.floor(hop) / rate, topHz: top, log };
}
export function equalize(A, gains, Q = 1.4) {
  const bands = [[100, 'lowshelf'], [250, 'peak'], [500, 'peak'], [1000, 'peak'], [2000, 'peak'], [4000, 'peak'], [8000, 'highshelf']];
  const fl = bands.map((b, i) => [b, gains[i]]).filter(([, g]) => Math.abs(g) > 0.01).map(([b, g]) => biquad(b[1], A.rate, Math.min(b[0], A.rate * 0.45), b[1] === 'peak' ? Q : 0.707, g));
  return { rate: A.rate, ch: A.ch.map((x) => { let y = x; for (const f of fl) y = filt(y, f); return Float32Array.from(y); }) };
}
export const EQ_BANDS = [100, 250, 500, 1000, 2000, 4000, 8000];
export function voiceRemove(A, keepBassHz = 0) {
  if (A.ch.length < 2) throw new Error('This file is mono: there is no stereo difference to work with');
  const n = A.ch[0].length, o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = (A.ch[0][i] - A.ch[1][i]) / 2;
  let r = o;
  if (keepBassHz > 0) {
    const lp = biquad('lowpass', A.rate, keepBassHz, 0.707), hp = biquad('highpass', A.rate, keepBassHz, 0.707), m = new Float32Array(n);
    for (let i = 0; i < n; i++) m[i] = (A.ch[0][i] + A.ch[1][i]) / 2;
    const b = filt(filt(m, lp), lp), s = filt(filt(o, hp), hp);
    r = new Float32Array(n); for (let i = 0; i < n; i++) r[i] = b[i] + s[i];
  }
  return { rate: A.rate, ch: [r, r.slice()] };
}

// ============================================================ FLAC encoder (fixed predictors, Rice coding)
const crc8t = new Uint8Array(256), crc16t = new Uint16Array(256);
for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 128 ? ((c << 1) ^ 7) & 255 : (c << 1) & 255; crc8t[i] = c; let d = i << 8; for (let k = 0; k < 8; k++) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff; crc16t[i] = d; }
class BitW {
  constructor() { this.b = new Uint8Array(1 << 16); this.n = 0; this.acc = 0; this.k = 0; }
  put(v, n) { // n <= 32
    v = ((v % 2 ** n) + 2 ** n) % 2 ** n;
    if (n > 24) { this.put(Math.floor(v / 2 ** (n - 16)), 16); this.put(v % 2 ** (n - 16), n - 16); return; }
    this.acc = this.acc * 2 ** n + v; this.k += n;
    while (this.k >= 8) { this.k -= 8; const byte = Math.floor(this.acc / 2 ** this.k); this.acc -= byte * 2 ** this.k; this.byte(byte); }
  }
  byte(v) { if (this.n >= this.b.length) { const c = new Uint8Array(this.b.length * 2); c.set(this.b); this.b = c; } this.b[this.n++] = v; }
  align() { if (this.k) this.put(0, 8 - this.k); }
  unary(q) { while (q >= 16) { this.put(0, 16); q -= 16; } this.put(1, q + 1); }
  bytes() { return this.b.subarray(0, this.n); }
}
function riceCost(res, s, e, k) { let c = 0; for (let i = s; i < e; i++) { const u = res[i] >= 0 ? 2 * res[i] : -2 * res[i] - 1; c += Math.floor(u / 2 ** k) + 1 + k; } return c + 4; }
function bestK(res, s, e) { let sum = 0; for (let i = s; i < e; i++) sum += res[i] >= 0 ? 2 * res[i] : -2 * res[i] - 1; const mean = sum / Math.max(1, e - s), k0 = Math.max(0, Math.min(14, Math.floor(Math.log2(mean + 1)))); let bk = k0, bc = Infinity; for (let k = Math.max(0, k0 - 1); k <= Math.min(14, k0 + 1); k++) { const c = riceCost(res, s, e, k); if (c < bc) { bc = c; bk = k; } } return [bk, bc]; }
function fixedRes(x, o) {
  const n = x.length, r = new Array(n - o);
  for (let i = o; i < n; i++) r[i - o] = o === 0 ? x[i] : o === 1 ? x[i] - x[i - 1] : o === 2 ? x[i] - 2 * x[i - 1] + x[i - 2] : o === 3 ? x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3] : x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
  return r;
}
function planRice(res, n, o) { // res excludes warm-up; returns {order, parts:[[k,s,e]], bits}
  let best = null;
  for (let po = 0; po <= 8; po++) {
    const P = 1 << po; if (n % P || n / P <= o) { if (po > 0) break; }
    const sz = n / P, parts = []; let bits = 6; // 2 method + 4 order
    let s = 0;
    for (let p = 0; p < P; p++) { const len = p === 0 ? sz - o : sz, [k, c] = bestK(res, s, s + len); parts.push([k, s, s + len]); bits += c; s += len; }
    if (!best || bits < best.bits) best = { po, parts, bits };
  }
  return best;
}
function writeSub(bw, x, bps) {
  const n = x.length;
  let allSame = true; for (let i = 1; i < n; i++) if (x[i] !== x[0]) { allSame = false; break; }
  if (allSame) { bw.put(0, 8); bw.put(x[0], bps); return; }
  let best = { bits: 8 + n * bps, o: -1 };
  for (let o = 0; o <= 4 && o < n; o++) { const res = fixedRes(x, o), pl = planRice(res, n, o); if (!pl) continue; const bits = 8 + o * bps + pl.bits; if (bits < best.bits) best = { bits, o, res, pl }; }
  if (best.o < 0) { bw.put(2, 8); for (let i = 0; i < n; i++) bw.put(x[i], bps); return; }
  bw.put(16 + best.o * 2, 8); // 001xxx0 -> type bits + wasted flag 0: (0b001000+o)<<1 = 16+2o... header byte = 0 | type(6) | wasted(1)
  for (let i = 0; i < best.o; i++) bw.put(x[i], bps);
  bw.put(0, 2); bw.put(best.pl.po, 4);
  for (const [k, s, e] of best.pl.parts) { bw.put(k, 4); for (let i = s; i < e; i++) { const u = best.res[i] >= 0 ? 2 * best.res[i] : -2 * best.res[i] - 1; bw.unary(Math.floor(u / 2 ** k)); if (k) bw.put(u % 2 ** k, k); } }
}
export function flacEncode(A, bits = 16) {
  const nc = A.ch.length, n = A.ch[0].length;
  if (nc > 8) throw new Error('FLAC supports up to 8 channels');
  if (![16, 24].includes(bits)) throw new Error('Bit depth must be 16 or 24');
  if (!n) throw new Error('The audio is empty');
  const sc = 2 ** (bits - 1) - 1, q = A.ch.map((x) => { const o = new Int32Array(n); for (let i = 0; i < n; i++) o[i] = Math.round(clamp(x[i], -1, 1) * sc); return o; });
  const BS = Math.min(4096, n), frames = [];
  let minF = Infinity, maxF = 0;
  for (let f = 0, s = 0; s < n; f++, s += BS) {
    const len = Math.min(BS, n - s), xs = q.map((x) => Array.from(x.subarray(s, s + len)));
    let assign = nc - 1, subs = xs.map((x) => ({ x, bps: bits }));
    if (nc === 2 && len > 4) {
      const [L, R] = xs, S = L.map((v, i) => v - R[i]), M = L.map((v, i) => (v + R[i]) >> 1);
      const cost = (x) => { let c = 0; for (let i = 2; i < x.length; i++) c += Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]); return c; };
      const cl = cost(L), cr = cost(R), cs = cost(S), cm = cost(M);
      const opts = [[cl + cr, 1, null], [cl + cs, 8, [L, S]], [cs + cr, 9, [S, R]], [cm + cs, 10, [M, S]]];
      opts.sort((a, b) => a[0] - b[0]);
      const [, as, pr] = opts[0]; assign = as;
      if (pr) subs = pr.map((x, i) => ({ x, bps: bits + ((as === 8 && i === 1) || (as === 9 && i === 0) || (as === 10 && i === 1) ? 1 : 0) }));
      if (as === 1) assign = 1;
    }
    const bw = new BitW();
    bw.put(0xfff8, 16);
    const bsCode = len === 4096 ? 12 : len <= 256 ? 6 : 7; // 6: 8-bit (len-1) at end, 7: 16-bit
    bw.put(bsCode, 4); bw.put(0, 4);
    bw.put(assign, 4); bw.put(bits === 16 ? 4 : 6, 3); bw.put(0, 1);
    // frame number, UTF-8 style
    if (f < 128) bw.put(f, 8); else if (f < 2048) { bw.put(0xc0 | (f >> 6), 8); bw.put(0x80 | (f & 63), 8); } else if (f < 65536) { bw.put(0xe0 | (f >> 12), 8); bw.put(0x80 | ((f >> 6) & 63), 8); bw.put(0x80 | (f & 63), 8); } else { bw.put(0xf0 | (f >> 18), 8); bw.put(0x80 | ((f >> 12) & 63), 8); bw.put(0x80 | ((f >> 6) & 63), 8); bw.put(0x80 | (f & 63), 8); }
    if (bsCode === 6) bw.put(len - 1, 8); else if (bsCode === 7) bw.put(len - 1, 16);
    let c8 = 0; for (let i = 0; i < bw.n; i++) c8 = crc8t[c8 ^ bw.b[i]];
    bw.put(c8, 8);
    for (const sb of subs) writeSub(bw, sb.x, sb.bps);
    bw.align();
    let c16 = 0; for (let i = 0; i < bw.n; i++) c16 = ((c16 << 8) & 0xffff) ^ crc16t[(c16 >> 8) ^ bw.b[i]];
    bw.put(c16, 16);
    const by = bw.bytes(); frames.push(by); if (by.length < minF) minF = by.length; if (by.length > maxF) maxF = by.length;
  }
  const head = new BitW();
  head.put(BS, 16); head.put(BS, 16); head.put(minF, 24); head.put(maxF, 24); head.put(A.rate, 20); head.put(nc - 1, 3); head.put(bits - 1, 5); head.put(n, 36);
  for (let i = 0; i < 16; i++) head.put(0, 8); // MD5 unset (all zero = unknown, allowed by the spec)
  const si = head.bytes(), total = 4 + 4 + 34 + frames.reduce((a, b) => a + b.length, 0), out = new Uint8Array(total);
  out.set([0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 34]); out.set(si, 8);
  let p = 42; for (const f of frames) { out.set(f, p); p += f.length; }
  return out;
}

// ============================================================ ID3v2 reader / writer (MP3 tags)
const ID3_FIELDS = [['title', 'TIT2'], ['artist', 'TPE1'], ['album', 'TALB'], ['albumartist', 'TPE2'], ['year', 'TYER'], ['track', 'TRCK'], ['disc', 'TPOS'], ['genre', 'TCON'], ['composer', 'TCOM'], ['comment', 'COMM']];
const V22 = { TT2: 'TIT2', TP1: 'TPE1', TAL: 'TALB', TP2: 'TPE2', TYE: 'TYER', TRK: 'TRCK', TPA: 'TPOS', TCO: 'TCON', TCM: 'TCOM', COM: 'COMM', PIC: 'APIC' };
const synsafe = (b, o) => ((b[o] & 127) << 21) | ((b[o + 1] & 127) << 14) | ((b[o + 2] & 127) << 7) | (b[o + 3] & 127);
const lat1 = (b) => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };
function decText(enc, b) {
  if (enc === 1 || enc === 2) {
    let be = enc === 2, o = 0;
    if (b[0] === 0xff && b[1] === 0xfe) { o = 2; be = false; } else if (b[0] === 0xfe && b[1] === 0xff) { o = 2; be = true; }
    return new TextDecoder(be ? 'utf-16be' : 'utf-16le').decode(b.subarray(o));
  }
  return enc === 3 ? new TextDecoder().decode(b) : lat1(b);
}
// returns { start (audio offset), version, frames:[{id, data}], tag: {title..., cover} , v1 }
export function readId3(u) {
  const out = { start: 0, version: 0, frames: [], tag: {}, hasV1: false };
  if (u.length >= 128 && u[u.length - 128] === 0x54 && u[u.length - 127] === 0x41 && u[u.length - 126] === 0x47) {
    out.hasV1 = true;
    const f = (a, n) => lat1(u.subarray(u.length - 128 + a, u.length - 128 + a + n)).replace(/[\0 ]+$/, '');
    out.v1 = { title: f(3, 30), artist: f(33, 30), album: f(63, 30), year: f(93, 4), comment: f(97, 28) };
  }
  if (u.length < 10 || lat1(u.subarray(0, 3)) !== 'ID3') return out;
  const ver = u[3], flags = u[5], size = synsafe(u, 6);
  if (ver < 2 || ver > 4) throw new Error(`ID3v2.${ver} is not supported`);
  out.version = ver; out.start = 10 + size + (ver === 4 && flags & 16 ? 10 : 0);
  let body = u.subarray(10, Math.min(u.length, 10 + size));
  if (flags & 0x80 && ver < 4) { const o = []; for (let i = 0; i < body.length; i++) { o.push(body[i]); if (body[i] === 0xff && body[i + 1] === 0) i++; } body = Uint8Array.from(o); }
  let p = 0;
  if (flags & 0x40) p = ver === 4 ? synsafe(body, 0) : 4 + new DataView(body.buffer, body.byteOffset).getUint32(0);
  const idl = ver === 2 ? 3 : 4, hl = ver === 2 ? 6 : 10;
  while (p + hl <= body.length && body[p] !== 0) {
    const id = lat1(body.subarray(p, p + idl));
    const sz = ver === 2 ? (body[p + 3] << 16) | (body[p + 4] << 8) | body[p + 5] : ver === 4 ? synsafe(body, p + 4) : new DataView(body.buffer, body.byteOffset).getUint32(p + 4);
    if (p + hl + sz > body.length) break;
    const fl = ver === 2 ? 0 : (body[p + 8] << 8) | body[p + 9];
    out.frames.push({ id: ver === 2 ? V22[id] || id : id, raw: id, flags: fl, data: body.slice(p + hl, p + hl + sz) });
    p += hl + sz;
  }
  for (const f of out.frames) {
    const d = f.data;
    if (f.id[0] === 'T' && f.id !== 'TXXX' && d.length) {
      const enc = d[0], s = decText(enc, d.subarray(1)).split('\0').filter(Boolean).join(' / ');
      const key = ({ TIT2: 'title', TPE1: 'artist', TALB: 'album', TPE2: 'albumartist', TYER: 'year', TDRC: 'year', TRCK: 'track', TPOS: 'disc', TCON: 'genre', TCOM: 'composer' })[f.id];
      if (key && !out.tag[key]) out.tag[key] = key === 'year' ? s.slice(0, 4) : s;
    } else if (f.id === 'COMM' && d.length > 4 && !out.tag.comment) {
      const enc = d[0], rest = d.subarray(4), two = enc === 1 || enc === 2;
      let i = 0; if (two) { while (i + 1 < rest.length && !(rest[i] === 0 && rest[i + 1] === 0)) i += 2; i += 2; } else { while (i < rest.length && rest[i] !== 0) i++; i++; }
      out.tag.comment = decText(enc, rest.subarray(i)).replace(/\0+$/, '');
    } else if (f.id === 'APIC' && d.length > 4 && !out.tag.cover) {
      let i = 1, mime = '';
      if (out.version === 2) { mime = 'image/' + (lat1(d.subarray(1, 4)).toLowerCase() === 'png' ? 'png' : 'jpeg'); i = 4; } else { while (i < d.length && d[i] !== 0) i++; mime = lat1(d.subarray(1, i)); i++; }
      const type = d[i]; i++;
      const two = d[0] === 1 || d[0] === 2;
      if (two) { while (i + 1 < d.length && !(d[i] === 0 && d[i + 1] === 0)) i += 2; i += 2; } else { while (i < d.length && d[i] !== 0) i++; i++; }
      out.tag.cover = { mime, type, data: d.slice(i) };
    }
  }
  return out;
}
const enc16 = (s) => { const o = new Uint8Array(2 + s.length * 2); o[0] = 0xff; o[1] = 0xfe; for (let i = 0; i < s.length; i++) { o[2 + i * 2] = s.charCodeAt(i) & 255; o[3 + i * 2] = s.charCodeAt(i) >> 8; } return o; };
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const asc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const isAscii = (s) => /^[\x20-\x7e]*$/.test(s);
function frame(id, data) { const h = new Uint8Array(10); h.set(asc(id)); new DataView(h.buffer).setUint32(4, data.length); return cat(h, data); }
function textFrame(id, s) { return frame(id, isAscii(s) ? cat(Uint8Array.of(0), asc(s)) : cat(Uint8Array.of(1), enc16(s))); }
// tag: fields (strings) and cover {mime,data}; keepFrames: raw v2.3 frames to carry over
export function buildId3(tag, keepFrames = []) {
  const parts = [];
  for (const [k, id] of ID3_FIELDS) {
    const s = tag[k]; if (!s) continue;
    if (k === 'comment') parts.push(frame('COMM', cat(isAscii(s) ? Uint8Array.of(0) : Uint8Array.of(1), asc('eng'), isAscii(s) ? Uint8Array.of(0) : Uint8Array.of(0xff, 0xfe, 0, 0), isAscii(s) ? asc(s) : enc16(s))));
    else parts.push(textFrame(id, s));
  }
  if (tag.cover) parts.push(frame('APIC', cat(Uint8Array.of(0), asc(tag.cover.mime), Uint8Array.of(0, tag.cover.type ?? 3, 0), tag.cover.data)));
  for (const f of keepFrames) parts.push(cat(asc(f.id), (() => { const b = new Uint8Array(6); new DataView(b.buffer).setUint32(0, f.data.length); b[4] = f.flags >> 8; b[5] = f.flags & 255; return b; })(), f.data));
  const body = cat(...parts, new Uint8Array(0)), n = body.length, h = Uint8Array.of(0x49, 0x44, 0x33, 3, 0, 0, (n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127);
  return cat(h, body);
}
export function retag(u, edits, { clear = false, dropCover = false } = {}) {
  const r = readId3(u), tag = clear ? {} : { ...r.tag };
  for (const [k, v] of Object.entries(edits)) if (v !== '' && v != null) tag[k] = v;
  if (dropCover) delete tag.cover;
  const handled = new Set(ID3_FIELDS.map((x) => x[1]).concat(['TDRC', 'APIC']));
  const keep = !clear && r.version === 3 ? r.frames.filter((f) => !handled.has(f.id) && !(f.flags & 0x00ff)) : [];
  const lost = clear ? r.frames.length : r.frames.length - keep.length - r.frames.filter((f) => handled.has(f.id)).length;
  let end = u.length; if (r.hasV1) end -= 128;
  return { bytes: cat(buildId3(tag, keep), u.subarray(r.start, end)), tag, before: r, lostFrames: Math.max(0, lost), keptFrames: keep.length };
}
const tagText = (t) => ID3_FIELDS.map(([k]) => (t[k] ? `${k}: ${t[k]}` : null)).filter(Boolean).concat(t.cover ? [`cover: ${t.cover.mime}, ${(t.cover.data.length / 1024).toFixed(1)} KB`] : []).join('\n') || '(no tags)';

// ============================================================ drum machine synth (pure)
export const DRUMS = ['Kick', 'Snare', 'Closed hat', 'Open hat', 'Clap', 'Tom'];
export function drumSamples(rate = 44100) {
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const mk = (sec, f) => { const n = Math.round(sec * rate), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = f(i / rate, i); return o; };
  const hp = (x, a = 0.9) => { let p = 0, q = 0; return x.map((v) => { const y = a * (p + v - q); q = v; p = y; return y; }); };
  let ph = 0, ph2 = 0;
  const kick = mk(0.4, (t) => { ph += (2 * Math.PI * (45 + 105 * Math.exp(-t * 35))) / rate; return Math.sin(ph) * Math.exp(-t * 9) * 0.95; });
  const snareN = hp(mk(0.25, (t) => rnd() * Math.exp(-t * 22) * 0.6), 0.8);
  const snare = mk(0.25, (t, i) => snareN[i] + Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 25) * 0.5);
  const ch = hp(mk(0.08, (t) => rnd() * Math.exp(-t * 70) * 0.5), 0.97);
  const oh = hp(mk(0.4, (t) => rnd() * Math.exp(-t * 9) * 0.4), 0.97);
  const clapN = mk(0.3, (t) => rnd() * (Math.exp(-((t % 0.012) * 300)) * (t < 0.036 ? 1 : 0) + Math.exp(-(t - 0.036) * 25) * (t >= 0.036 ? 1 : 0)) * 0.6);
  const clap = hp(clapN, 0.85);
  const tom = mk(0.45, (t) => { ph2 += (2 * Math.PI * (110 + 90 * Math.exp(-t * 18))) / rate; return Math.sin(ph2) * Math.exp(-t * 7) * 0.8; });
  return [kick, snare, ch, oh, clap, tom];
}
// pattern: array of 6 strings of 16 chars ('x' = hit); returns Audio of `bars` bars
export function renderPattern(pattern, bpm, swing, bars, rate = 44100) {
  const S = drumSamples(rate), step = (60 / bpm / 4) * rate, len = Math.round(step * 16 * bars), o = new Float32Array(len + rate);
  for (let b = 0; b < bars; b++) for (let s = 0; s < 16; s++) {
    const start = Math.round((b * 16 + s) * step + (s % 2 ? swing * step * 0.5 : 0));
    pattern.forEach((row, v) => { if (row[s] === 'x') { const smp = S[v]; for (let i = 0; i < smp.length; i++) o[start + i] += smp[i]; } });
  }
  let p = 0; for (let i = 0; i < len; i++) { const a = Math.abs(o[i]); if (a > p) p = a; }
  const k = p > 0.95 ? 0.95 / p : 1, out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = o[i] * k;
  return { rate, ch: [out] };
}

// ============================================================ audio tools (file in, WAV or report out)
const AF = { accept: 'audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.opus,.webm', multiple: false };
const sliceA = (A, s, e) => ({ rate: A.rate, ch: A.ch.map((x) => x.slice(Math.max(0, Math.round(s * A.rate)), Math.min(x.length, Math.round(e * A.rate)))) });
const need = (A) => { if (!A.ch[0].length) throw new Error('The audio is empty'); return A; };
const centre = (A, sec) => (dur(A) > sec ? sliceA(A, (dur(A) - sec) / 2, (dur(A) + sec) / 2) : A);
const peakDb = (A) => { const p = peakOf(A); return p > 0 ? g2db(p) : -Infinity; };
const clipWarn = (A) => (peakOf(A) > 1 ? '\nWarning: the result goes above full scale and is clipped in the WAV file. Lower the gain.' : '');

T.push(
  {
    id: 'audio-to-flac', cat: AUD, title: 'Audio to FLAC Converter (Lossless)', inputs: 0, dom: true, file: AF,
    desc: 'Convert any audio file your browser can play (MP3, M4A, OGG, WAV) to a lossless FLAC file, encoded by hand-written code in your browser. 16 or 24 bit, mono to 8 channels.',
    opts: [sel('bits', 'Bit depth', ['16', '24'], '16')],
    run: async (_i, o, files) => {
      const f = needFile(files), A = need(await decodeAudioFile(f)), bits = +o.bits === 24 ? 24 : 16, t0 = Date.now();
      const bytes = flacEncode(A, bits), raw = A.ch[0].length * A.ch.length * bits / 8;
      return { blob: new File([bytes], baseName(f, '.flac'), { type: 'audio/flac' }), filename: baseName(f, '.flac'), text: `FLAC ${bits}-bit, ${A.rate} Hz, ${A.ch.length} channel(s), ${fmtT(dur(A))}\nSize ${(bytes.length / 1048576).toFixed(2)} MB, ${(100 * bytes.length / raw).toFixed(0)}% of the raw PCM size (${Date.now() - t0} ms)\n\nLossless relative to what your browser decoded. If the source was an MP3 or AAC file, FLAC keeps its artefacts and does not restore quality.\nThe MD5 field of the header is left empty, which the FLAC format allows; players and decoders ignore it.\nMP3, OGG and AAC output are not offered: they need an encoder, and this site ships no third-party code.` };
    },
  },
  {
    id: 'audio-joiner', cat: AUD, title: 'Audio Joiner with Crossfade', inputs: 0, dom: true, file: { ...AF, multiple: true },
    desc: 'Join several audio clips into one WAV file, in the order you pick them or sorted by name, with an optional crossfade or a gap of silence between clips.',
    opts: [sel('order', 'Order', ['as selected', 'by file name'], 'as selected'), num('xfade', 'Crossfade (seconds, 0 = none)', 0), num('gap', 'Silence between clips (seconds)', 0)],
    run: async (_i, o, files) => {
      if (!files?.length || files.length < 2) throw new Error('Choose two or more audio files');
      let list = [...files]; if (o.order === 'by file name') list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const A = []; for (const f of list) A.push(need(await decodeAudioFile(f)));
      const xf = clamp(N_(o.xfade, 0), 0, 30), gp = clamp(N_(o.gap, 0), 0, 60), J = joinAudio(A, { xfade: xf, gap: gp });
      const rates = new Set(A.map((a) => a.rate));
      return wavOut(J, 'joined.wav', `${list.length} clips joined: ${list.map((f, i) => `${i + 1}. ${f.name} (${fmtT(dur(A[i]))})`).join('\n')}\n\nResult: ${fmtT(dur(J))}, ${J.rate} Hz, ${J.ch.length} channel(s)${xf && !gp ? `, ${xf} s equal-power crossfades` : ''}${gp ? `, ${gp} s gaps` : ''}.${rates.size > 1 ? `\nClips with another sample rate were resampled to ${J.rate} Hz.` : ''}${A.some((a) => a.ch.length !== J.ch.length) ? '\nMono clips were copied to both channels.' : ''}${clipWarn(J)}`);
    },
  },
  {
    id: 'loudness-normalizer', cat: AUD, title: 'Loudness Normalizer (LUFS Target)', inputs: 0, dom: true, file: AF,
    desc: 'Measure integrated loudness in LUFS (ITU-R BS.1770 / EBU R128, K-weighted with gating) and set it to a target such as -16 or -23 LUFS, with peak protection. Writes a WAV file.',
    opts: [num('target', 'Target loudness (LUFS)', -16), num('ceiling', 'Peak ceiling (dBFS)', -1), sel('mode', 'If the peaks would go over the ceiling', ['reduce gain', 'limit peaks', 'allow clipping'], 'limit peaks'), chk('measure', 'Only measure, do not write a file', false)],
    run: async (_i, o, files) => {
      const f = needFile(files), A = need(await decodeAudioFile(f)), target = clamp(N_(o.target, -16), -50, 0), ceiling = clamp(N_(o.ceiling, -1), -20, 0);
      const m = integratedLoudness(A), tp = truePeakDb(A);
      const head = `${f.name}: ${fmtT(dur(A))}, ${A.rate} Hz, ${A.ch.length} channel(s)\nIntegrated loudness: ${fix(m.lufs)} LUFS\nSample peak: ${fix(peakDb(A))} dBFS, true peak (estimate): ${fix(tp)} dBFS`;
      if (o.measure) return { text: head + `\n\nTo reach ${target} LUFS you would apply ${fix(target - m.lufs)} dB of gain.` };
      const r = normalizeLoudness(A, target, { ceiling, mode: { 'reduce gain': 'reduce', 'limit peaks': 'limit', 'allow clipping': 'clip' }[o.mode] || 'limit' });
      return wavOut(r.audio, baseName(f, `-${target}LUFS.wav`), `${head}\n\nGain applied: ${fix(r.gain)} dB${r.note ? ` (${r.note})` : ''}\nResult: ${fix(r.after)} LUFS (target ${target}), peak ${fix(r.peakAfter)} dBFS\n\nBlocks of 400 ms, absolute gate -70 LUFS and relative gate -10 LU, as in BS.1770-4. Channels 1-6 are read as L R C LFE Ls Rs. The true peak figure is a 4x cubic estimate, not a certified meter. The WAV is 16-bit, so very quiet parts carry rounding noise.`);
    },
  },
  {
    id: 'audio-speed-changer', cat: AUD, title: 'Audio Speed Changer (Keep or Change Pitch)', inputs: 0, dom: true, file: AF,
    desc: 'Speed up or slow down an audio file to a chosen rate. Keep the pitch with a WSOLA time stretch, or change speed and pitch together like a tape. Exports WAV.',
    opts: [num('speed', 'Speed (1 = original, 0.5 = half, 2 = double)', 1.25), sel('mode', 'Pitch', ['keep pitch', 'change pitch with speed'], 'keep pitch')],
    run: async (_i, o, files) => {
      const f = needFile(files), A = need(await decodeAudioFile(f)), sp = clamp(N_(o.speed, 1), 0.25, 4), keep = o.mode !== 'change pitch with speed';
      const ch = keep ? wsola(A.ch, A.rate, sp) : A.ch.map((x) => resample(x, sp));
      const B = { rate: A.rate, ch };
      return wavOut(B, baseName(f, `-x${sp}.wav`), `${f.name}: ${fmtT(dur(A))} at ${sp}x -> ${fmtT(dur(B))}\n${keep ? 'Pitch kept (WSOLA time stretch: overlapping 46 ms frames aligned by cross-correlation).' : `Pitch changes with speed (${fix(12 * Math.log2(sp))} semitones).`}\n\nWSOLA works well on speech and most music. Strong transients can sound slightly smeared at extreme rates (below 0.5x or above 2x).`);
    },
  },
  {
    id: 'pitch-shifter', cat: AUD, title: 'Pitch Shifter (Semitones, Same Tempo)', inputs: 0, dom: true, file: AF,
    desc: 'Raise or lower the pitch of an audio file by semitones and cents without changing its length, using a time stretch plus resampling. Exports WAV.',
    opts: [num('semitones', 'Semitones (-12 to 12)', 2), num('cents', 'Extra cents (-100 to 100)', 0)],
    run: async (_i, o, files) => {
      const f = needFile(files), A = need(await decodeAudioFile(f)), st = clamp(N_(o.semitones, 0), -12, 12) + clamp(N_(o.cents, 0), -100, 100) / 100;
      if (Math.abs(st) < 0.005) throw new Error('Enter a shift other than zero');
      const k = 2 ** (st / 12), ch = wsola(A.ch, A.rate, 1 / k).map((x) => resample(x, k)), B = { rate: A.rate, ch };
      return wavOut(B, baseName(f, `-${st > 0 ? '+' : ''}${fix(st, 2)}st.wav`), `${f.name}: shifted by ${fix(st, 2)} semitones (frequency x${fix(k, 4)}). Length ${fmtT(dur(A))} -> ${fmtT(dur(B))}.\n\nHow it works: the clip is time-stretched by 1/${fix(k, 3)} without changing pitch, then resampled by ${fix(k, 3)}. Voices shifted by more than about 4 semitones start to sound unnatural because the formants move too.${clipWarn(B)}`);
    },
  },
  {
    id: 'audio-noise-reducer', cat: AUD, title: 'Audio Noise Reducer (Noise Profile)', inputs: 0, dom: true, file: AF,
    desc: 'Reduce steady background hiss or hum. Name a stretch of the recording that contains only noise, and spectral subtraction removes that noise profile from the whole file. Exports WAV.',
    opts: [num('start', 'Noise-only section starts at (seconds)', 0), num('end', 'Noise-only section ends at (seconds)', 1), num('reduction', 'Maximum reduction (dB)', 12), num('strength', 'Strength (1 = gentle, 3 = strong)', 1.5)],
    run: async (_i, o, files) => {
      const f = needFile(files), A = need(await decodeAudioFile(f)), s = N_(o.start, 0), e = N_(o.end, 1);
      if (e - s < 0.1) throw new Error('The noise-only section must be at least 0.1 seconds long');
      if (s < 0 || e > dur(A) + 1e-6) throw new Error(`The file is ${dur(A).toFixed(2)} seconds long; pick a section inside it`);
      const B = reduceNoise(A, Math.round(s * A.rate), Math.round(e * A.rate), { reductionDb: clamp(N_(o.reduction, 12), 3, 40), strength: clamp(N_(o.strength, 1.5), 0.5, 4) });
      return wavOut(B, baseName(f, '-denoised.wav'), `${f.name}: noise profile taken from ${s}-${e} s, up to ${o.reduction} dB reduction, strength ${o.strength}.\n\nSpectral subtraction with a 2048-point STFT. It works for steady noise (hiss, fan, hum) and cannot remove changing noise such as traffic or other voices. Too much reduction gives a watery or "musical" artefact: lower the strength or the maximum reduction if you hear it.`);
    },
  },
  {
    id: 'vocal-remover-center-cancel', cat: AUD, title: 'Vocal Remover (Center Channel Cancellation)', inputs: 0, dom: true, file: AF,
    desc: 'Make a karaoke version of a stereo song by cancelling whatever is identical in the left and right channels, where lead vocals usually sit. A simple phase trick, not AI source separation.',
    opts: [num('bass', 'Keep bass below (Hz, 0 = off)', 120)],
    run: async (_i, o, files) => {
      const f = needFile(files), A = need(await decodeAudioFile(f)), B = voiceRemove(A, clamp(N_(o.bass, 0), 0, 500));
      return wavOut(B, baseName(f, '-karaoke.wav'), `${f.name}: left minus right, written as a stereo file.\n\nThis removes everything that sits dead centre in the mix. Lead vocals are often there, but so are the kick, the bass and the snare, which is why "keep bass below" adds the low end back from the mid channel. Reverb, backing vocals and stereo-panned vocals remain. Mono files and many modern masters give poor results. A neural separator (not offered here, it needs a large model) does a better job.`);
    },
  },
  {
    id: 'bpm-detector', cat: AUD, title: 'BPM Detector for Audio Files', inputs: 0, dom: true, file: AF,
    desc: 'Estimate the tempo of a song from an audio file by analysing onsets and their repeating period. Shows the likely BPM, the half and double values, and a confidence figure.',
    run: async (_i, _o, files) => {
      const f = needFile(files), A = need(await decodeAudioFile(f)), r = detectBpm(centre(A, 120));
      return { text: `${f.name}: analysed ${fmtT(Math.min(dur(A), 120))} from the middle of the file\n\nEstimated tempo: ${fix(r.bpm, 1)} BPM\nAlso plausible: ${fix(r.half, 1)} BPM (half time) or ${fix(r.double, 1)} BPM (double time)\nConfidence: ${fix(r.confidence, 1)} (peak strength against the average, above about 4 is usually clear)\n\nTempo detection is a heuristic. Songs with a steady beat give good results; rubato, tempo changes and sparse rhythms do not. Half and double time are the usual mistakes, so pick the one that matches how you would tap along.` };
    },
  },
  {
    id: 'musical-key-finder', cat: AUD, title: 'Musical Key Finder for Audio Files', inputs: 0, dom: true, file: AF,
    desc: 'Detect the likely key of a song from an audio file using pitch-class energy and the Krumhansl-Kessler key profiles. Shows the top three keys with Camelot codes for DJ mixing.',
    run: async (_i, _o, files) => {
      const f = needFile(files), A = need(await decodeAudioFile(f)), r = detectKey(centre(A, 120));
      return { text: `${f.name}: analysed ${fmtT(Math.min(dur(A), 120))} from the middle of the file\n\n${r.top.map((k, i) => `${i + 1}. ${k.key}  (Camelot ${k.camelot}, match ${fix(k.r)})`).join('\n')}\n\nTuning offset: ${r.tuningCents >= 0 ? '+' : ''}${fix(r.tuningCents, 0)} cents from A440.\n\nThis is a statistical guess. Relative major and minor keys share the same notes and are easily confused, and music that changes key or has no clear tonal centre gives low scores. A match above about 0.8 is usually reliable.` };
    },
  },
  {
    id: 'audio-fade-editor', cat: AUD, title: 'Audio Fade In and Fade Out Editor', inputs: 0, dom: true, file: AF,
    desc: 'Add a fade-in and a fade-out to an audio file, with a linear, cosine, equal-power or logarithmic curve, and download the result as a WAV file.',
    opts: [num('fin', 'Fade in (seconds)', 2), num('fout', 'Fade out (seconds)', 3), sel('curve', 'Curve', ['linear', 'cosine', 'equal power', 'logarithmic'], 'linear')],
    run: async (_i, o, files) => {
      const f = needFile(files), A = need(await decodeAudioFile(f)), a = clamp(N_(o.fin, 0), 0, dur(A)), b = clamp(N_(o.fout, 0), 0, dur(A));
      if (!a && !b) throw new Error('Set a fade-in or a fade-out length above zero');
      return wavOut(fadeAudio(A, a, b, o.curve), baseName(f, '-faded.wav'), `${f.name}: ${a} s fade in, ${b} s fade out, ${o.curve} curve. Length unchanged (${fmtT(dur(A))}).\nLogarithmic starts at -40 dB, which sounds most even to the ear; linear sounds like it drops late.`);
    },
  },
  {
    id: 'silence-remover', cat: AUD, title: 'Silence Remover for Audio', inputs: 0, dom: true, file: AF,
    desc: 'Cut silent gaps out of a recording, or shorten them. Set the level below which sound counts as silence and the shortest gap to cut, then download the tightened WAV file.',
    opts: [num('thr', 'Silence threshold (dBFS)', -45), num('min', 'Only cut gaps longer than (ms)', 500), num('keep', 'Leave this much silence at each cut (ms)', 150)],
    run: async (_i, o, files) => {
      const f = needFile(files), A = need(await decodeAudioFile(f)), r = removeSilence(A, { thresholdDb: clamp(N_(o.thr, -45), -90, -5), minMs: clamp(N_(o.min, 500), 20, 60000), keepMs: clamp(N_(o.keep, 150), 0, 5000) });
      if (!r.cuts) throw new Error(`No silence longer than ${o.min} ms found below ${o.thr} dBFS. Raise the threshold (for example -35) or shorten the minimum.`);
      return wavOut(r.audio, baseName(f, '-trimmed.wav'), `${f.name}: ${r.cuts} gap(s) shortened, ${fix(r.removed)} s removed. ${fmtT(dur(A))} -> ${fmtT(dur(r.audio))}.\nLevel is measured in 10 ms blocks across all channels. Room noise louder than the threshold counts as sound, so raise the threshold if nothing is cut. Each cut has a 2 ms fade to avoid clicks.`);
    },
  },
  {
    id: 'audio-reverser', cat: AUD, title: 'Audio Reverser (Play Backwards)', inputs: 0, dom: true, file: AF,
    desc: 'Reverse an audio file so it plays backwards, then listen to it and download it as a WAV file.',
    run: async (_i, _o, files) => {
      const f = needFile(files), A = need(await decodeAudioFile(f));
      return wavOut({ rate: A.rate, ch: A.ch.map((x) => x.slice().reverse()) }, baseName(f, '-reversed.wav'), `${f.name}: ${fmtT(dur(A))} reversed, ${A.ch.length} channel(s).`);
    },
  },
  {
    id: 'ringtone-maker', cat: AUD, title: 'Ringtone Maker (Cut a Clip up to 30 Seconds)', inputs: 0, dom: true, file: AF,
    desc: 'Cut a short clip from a song for use as a ringtone or alert sound, with fades and a peak-normalise option, and save it as a WAV file.',
    opts: [num('start', 'Start (seconds)', 0), num('len', 'Length (seconds, 1 to 30)', 20), num('fin', 'Fade in (seconds)', 0.3), num('fout', 'Fade out (seconds)', 1.5), chk('norm', 'Normalise the peak to -1 dBFS', true)],
    run: async (_i, o, files) => {
      const f = needFile(files), A = need(await decodeAudioFile(f)), s = clamp(N_(o.start, 0), 0, dur(A)), L = clamp(N_(o.len, 20), 1, 30);
      if (s >= dur(A) - 0.5) throw new Error(`The file is ${dur(A).toFixed(1)} seconds long; start earlier`);
      let B = fadeAudio(sliceA(A, s, s + L), clamp(N_(o.fin, 0), 0, L), clamp(N_(o.fout, 0), 0, L), 'cosine');
      if (o.norm) { const p = peakOf(B); if (p > 0) B = { rate: B.rate, ch: B.ch.map((x) => x.map((v) => v * (db2g(-1) / p))) }; }
      return wavOut(B, baseName(f, '-ringtone.wav'), `${f.name}: ${fmtT(s)} to ${fmtT(s + dur(B))} (${fix(dur(B), 1)} s).\n\nThis writes WAV. Phones want MP3 or AAC (iPhone: M4R), and the browser has no encoder for those. Convert the WAV with your phone's tool or any audio converter after cutting. Android accepts MP3, OGG and often WAV as ringtone files; iPhone needs M4R of at most 30 seconds.`);
    },
  },
  {
    id: 'audio-equalizer', cat: AUD, title: 'Audio Equalizer (7-Band, Export WAV)', inputs: 0, dom: true, file: AF,
    desc: 'Apply a 7-band equalizer (100 Hz to 8 kHz) to an audio file with presets or your own gains, and download the processed WAV file.',
    opts: [sel('preset', 'Preset', ['custom (use the gains below)', 'bass boost', 'treble boost', 'voice clarity', 'loudness curve', 'cut rumble and hiss'], 'custom (use the gains below)'), ...EQ_BANDS.map((f, i) => num('g' + i, `${f >= 1000 ? f / 1000 + ' kHz' : f + ' Hz'}${i === 0 ? ' (low shelf)' : i === 6 ? ' (high shelf)' : ''} gain (dB)`, 0)), chk('safe', 'Lower the gain if the result would clip', true)],
    run: async (_i, o, files) => {
      const PRE = { 'bass boost': [6, 3, 0, 0, 0, 0, 0], 'treble boost': [0, 0, 0, 0, 2, 4, 6], 'voice clarity': [-4, -2, 0, 2, 4, 2, 0], 'loudness curve': [5, 2, 0, -1, 0, 2, 4], 'cut rumble and hiss': [-8, 0, 0, 0, 0, -3, -8] };
      const g = PRE[o.preset] || EQ_BANDS.map((_, i) => clamp(N_(o['g' + i], 0), -18, 18));
      const f = needFile(files), A = need(await decodeAudioFile(f)); let B = equalize(A, g);
      let note = ''; const p = peakOf(B);
      if (o.safe && p > 0.99) { const k = 0.99 / p; B = { rate: B.rate, ch: B.ch.map((x) => x.map((v) => v * k)) }; note = `\nOutput gain lowered by ${fix(-g2db(k))} dB to avoid clipping.`; }
      return wavOut(B, baseName(f, '-eq.wav'), `${f.name}: gains ${EQ_BANDS.map((h, i) => `${h} Hz ${g[i] > 0 ? '+' : ''}${g[i]}`).join(', ')} dB.${note}${clipWarn(B)}\n\nThe two ends are shelf filters (full gain about an octave beyond the corner frequency); the five middle bands are peaking filters, about one octave wide, so neighbouring bands overlap.`);
    },
  },
  {
    id: 'spectrogram-viewer', cat: AUD, title: 'Spectrogram Viewer for Audio Files', inputs: 0, dom: true, file: AF,
    desc: 'Draw a spectrogram of an audio file: time across, frequency up, colour for loudness. Choose the window size, a linear or logarithmic frequency axis, and the dynamic range.',
    opts: [sel('win', 'Window (larger = finer pitch, blurrier timing)', ['512', '1024', '2048', '4096'], '2048'), sel('scale', 'Frequency axis', ['linear', 'logarithmic'], 'linear'), num('range', 'Dynamic range (dB)', 80), num('fmax', 'Highest frequency (Hz, 0 = all)', 0)],
    run: async (_i, o, files) => {
      const f = needFile(files), A = need(await decodeAudioFile(f)), log = o.scale === 'logarithmic';
      const img = spectrogramImage(mono(A), A.rate, { win: +o.win || 2048, log, rangeDb: clamp(N_(o.range, 80), 20, 140), fmax: N_(o.fmax, 0), height: 420 });
      const L = 64, B = 34, R = 12, Tp = 10, c = document.createElement('canvas'); c.width = img.w + L + R; c.height = img.h + Tp + B;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      const id = new ImageData(img.data, img.w, img.h), tmp = document.createElement('canvas'); tmp.width = img.w; tmp.height = img.h; tmp.getContext('2d').putImageData(id, 0, 0); x.drawImage(tmp, L, Tp);
      x.fillStyle = '#111'; x.strokeStyle = '#111'; x.font = '12px system-ui,sans-serif'; x.textAlign = 'right';
      const fy = (hz) => Tp + (img.log ? (1 - Math.log(hz / 30) / Math.log(img.topHz / 30)) : 1 - hz / img.topHz) * (img.h - 1);
      const lstep = [500, 1000, 2000, 2500, 5000].find((s) => img.topHz / s <= 10) || 5000;
      const ticks = img.log ? [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] : Array.from({ length: Math.floor(img.topHz / lstep) }, (_, i) => (i + 1) * lstep);
      for (const hz of ticks.filter((h) => h < img.topHz && h > 30)) { const y = fy(hz); x.fillText(hz >= 1000 ? hz / 1000 + 'k' : hz, L - 6, y + 4); x.fillRect(L - 3, y, 3, 1); }
      x.textAlign = 'center'; const total = img.w * img.hopSeconds, step = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => total / s <= 12) || 600;
      for (let t = 0; t <= total; t += step) { const px = L + (t / total) * img.w; x.fillText(t >= 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : t + 's', px, Tp + img.h + 16); x.fillRect(px, Tp + img.h, 1, 3); }
      c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Spectrogram of ${f.name}, ${fmtT(dur(A))}, frequency up to ${Math.round(img.topHz)} Hz`);
      return { canvas: c, text: `${f.name}: ${fmtT(dur(A))}, ${A.rate} Hz. Window ${o.win} samples, ${fix(img.hopSeconds * 1000, 0)} ms per column, ${fix(A.rate / (+o.win || 2048), 1)} Hz per bin. Brighter colours are louder; the colour scale spans ${o.range} dB below the loudest point.` };
    },
  },
  {
    id: 'mp3-tag-editor', cat: AUD, title: 'MP3 Tag Editor (ID3 Tags and Cover Art)', inputs: 0, dom: true, file: { accept: 'audio/mpeg,.mp3,image/png,image/jpeg,.png,.jpg,.jpeg', multiple: true },
    desc: 'Read and edit the ID3 tags of MP3 files: title, artist, album, year, track, genre, comment and cover art. Select the MP3 (and a cover image if you want one). The audio is not re-encoded.',
    opts: [txt('title', 'Title (blank = keep)'), txt('artist', 'Artist'), txt('album', 'Album'), txt('albumartist', 'Album artist'), txt('year', 'Year'), txt('track', 'Track (3 or 3/12)'), txt('disc', 'Disc'), txt('genre', 'Genre'), txt('composer', 'Composer'), txt('comment', 'Comment'), chk('clear', 'Start from an empty tag (drop all existing frames)', false), chk('nocover', 'Remove the existing cover', false)],
    run: async (_i, o, files) => {
      const mp3 = [...(files || [])].filter((f) => /\.mp3$/i.test(f.name) || f.type === 'audio/mpeg'), img = [...(files || [])].find((f) => f.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(f.name));
      if (!mp3.length) throw new Error('Choose one or more MP3 files (and optionally a PNG or JPEG cover)');
      const ed = {}; for (const [k] of ID3_FIELDS) if (String(o[k] || '').trim()) ed[k] = String(o[k]).trim();
      if (img) ed.cover = { mime: img.type || (/\.png$/i.test(img.name) ? 'image/png' : 'image/jpeg'), type: 3, data: new Uint8Array(await img.arrayBuffer()) };
      const out = [], lines = [], editing = Object.keys(ed).length || o.clear || o.nocover;
      for (const f of mp3) {
        const u = new Uint8Array(await f.arrayBuffer()), r = retag(u, ed, { clear: o.clear, dropCover: o.nocover }), b = r.before;
        lines.push(`${f.name}\n  current: ID3v2.${b.version || '-'}${b.hasV1 ? ' + ID3v1' : ''}\n${tagText(b.tag).replace(/^/gm, '    ')}`);
        if (editing) { out.push(new File([r.bytes], f.name.replace(/\.mp3$/i, '') + '-tagged.mp3', { type: 'audio/mpeg' })); lines.push(`  new:\n${tagText(r.tag).replace(/^/gm, '    ')}${r.lostFrames ? `\n  ${r.lostFrames} other frame(s) of the old tag were not carried over` : ''}${b.hasV1 ? '\n  the old ID3v1 block was removed' : ''}`); }
      }
      return { text: lines.join('\n\n') + `\n\nTags are written as ID3v2.3 (UTF-16 where needed), the version every player reads. Frames you did not edit are kept when the old tag was already v2.3; from v2.2 or v2.4 only the fields shown above are carried over. The audio data is copied unchanged.`, ...(out.length ? { blob: out } : {}) };
    },
  },
);

// ============================================================ interactive audio tools (browser only)
const el = (t, p = {}, ...k) => {
  const e = document.createElement(t);
  for (const [a, v] of Object.entries(p)) { if (a.startsWith('on')) e.addEventListener(a.slice(2), v); else if (a === 'style') e.style.cssText = v; else if (a in e && a !== 'list') e[a] = v; else e.setAttribute(a, v); }
  e.append(...k.flat().filter((x) => x != null));
  return e;
};
const lab = (text, ...c) => el('label', { style: 'display:inline-block;margin:4px 14px 4px 0' }, text + ' ', ...c);
const whenGone = (root, fn) => { const i = setInterval(() => { if (!root.isConnected) { clearInterval(i); fn(); } }, 500); };
const AC = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)();
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteOf = (f) => { const m = 69 + 12 * Math.log2(f / 440), r = Math.round(m); return { name: NOTES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1), cents: Math.round((m - r) * 100) }; };
const mkLoop = (kind, ctx, sec = 8) => {
  const n = Math.round(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
    else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w * 0.5;
  }
  const f = Math.round(ctx.sampleRate * 0.05); for (let i = 0; i < f; i++) { const t = i / f; d[i] *= t; d[n - 1 - i] *= t; } // short fade at the loop seam
  return b;
};

let dmApi = null;
T.push(
  {
    id: 'audio-spectrum-analyzer', cat: AUD, title: 'Live Audio Spectrum Analyzer', custom: true,
    desc: 'Watch the frequency spectrum of your microphone, or of an audio file as it plays, with the peak frequency and its musical note. Runs locally; nothing is recorded or sent.',
    render: (root) => {
      let ctx, src, an, raf, stream, running = false;
      const status = el('p', { role: 'status', style: 'min-height:1.5em' }), peak = el('p', { 'aria-live': 'off', style: 'font:600 1.1rem system-ui,sans-serif' }, 'Peak: -');
      const cv = el('canvas', { width: 900, height: 320, role: 'img', 'aria-label': 'Frequency spectrum, stopped', style: 'width:100%;max-width:900px;height:auto;border:1px solid var(--border,#888)' });
      const source = el('select', { id: 'sa-src' }, el('option', { value: 'mic' }, 'Microphone'), el('option', { value: 'file' }, 'Audio file'));
      const file = el('input', { type: 'file', accept: 'audio/*', id: 'sa-file', disabled: true });
      const size = el('select', { id: 'sa-fft' }, ...[2048, 4096, 8192, 16384].map((n) => el('option', { value: n, selected: n === 8192 }, n)));
      const smooth = el('input', { type: 'number', id: 'sa-sm', min: 0, max: 0.95, step: 0.05, value: 0.7 });
      const btn = el('button', { type: 'button' }, 'Start');
      source.onchange = () => { file.disabled = source.value !== 'file'; };
      const draw = () => {
        if (!running) return;
        const x = cv.getContext('2d'), W = cv.width, H = cv.height, bins = an.frequencyBinCount, d = new Float32Array(bins); an.getFloatFrequencyData(d);
        const cs = getComputedStyle(cv), fg = cs.color, bg = cs.backgroundColor;
        x.clearRect(0, 0, W, H); x.fillStyle = bg === 'rgba(0, 0, 0, 0)' ? 'transparent' : bg; x.fillRect(0, 0, W, H);
        const nyq = ctx.sampleRate / 2, fmax = Math.min(20000, nyq), fmin = 20, px = (f) => (Math.log(f / fmin) / Math.log(fmax / fmin)) * W, py = (db) => H - ((clamp(db, -110, 0) + 110) / 110) * H;
        x.strokeStyle = fg; x.fillStyle = fg; x.globalAlpha = 0.25; x.lineWidth = 1; x.font = '12px system-ui,sans-serif';
        for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { x.beginPath(); x.moveTo(px(f), 0); x.lineTo(px(f), H); x.stroke(); x.globalAlpha = 0.8; x.fillText(f >= 1000 ? f / 1000 + 'k' : f, px(f) + 3, H - 4); x.globalAlpha = 0.25; }
        x.globalAlpha = 1; x.lineWidth = 2; x.beginPath();
        let pk = -Infinity, pi = 0;
        for (let k = 1; k < bins; k++) { const f = (k * nyq) / bins; if (f < fmin || f > fmax) continue; x.lineTo(px(f), py(d[k])); if (d[k] > pk) { pk = d[k]; pi = k; } }
        x.stroke();
        if (pk > -95 && pi > 0 && pi < bins - 1) {
          const a = d[pi - 1], b = d[pi], c = d[pi + 1], dlt = (a - c) / (2 * (a - 2 * b + c) || 1), f = ((pi + dlt) * nyq) / bins, n = noteOf(f);
          peak.textContent = `Peak: ${f.toFixed(1)} Hz, ${n.name} ${n.cents >= 0 ? '+' : ''}${n.cents} cents, ${pk.toFixed(0)} dBFS`;
          cv.setAttribute('aria-label', `Frequency spectrum, peak at ${f.toFixed(0)} hertz`);
        } else peak.textContent = 'Peak: (silence)';
        raf = requestAnimationFrame(draw);
      };
      const stop = (msg = 'Stopped.') => {
        running = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); try { src?.stop?.(); } catch { /* already stopped */ } ctx?.close?.(); ctx = null; stream = null;
        btn.textContent = 'Start'; status.textContent = msg; cv.setAttribute('aria-label', 'Frequency spectrum, stopped');
      };
      btn.onclick = async () => {
        if (running) return stop();
        try {
          ctx = AC(); an = ctx.createAnalyser(); an.fftSize = +size.value; an.smoothingTimeConstant = clamp(+smooth.value || 0, 0, 0.95); an.minDecibels = -110; an.maxDecibels = 0;
          if (source.value === 'mic') {
            stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            ctx.createMediaStreamSource(stream).connect(an);
          } else {
            if (!file.files[0]) throw new Error('Choose an audio file first');
            const buf = await ctx.decodeAudioData(await file.files[0].arrayBuffer());
            src = ctx.createBufferSource(); src.buffer = buf; src.connect(an); an.connect(ctx.destination); src.onended = () => running && stop('The file finished.'); src.start();
          }
          running = true; btn.textContent = 'Stop'; status.textContent = 'Running.'; draw();
        } catch (e) { stop(); status.className = 'err'; status.textContent = e.name === 'NotAllowedError' ? 'Microphone permission was denied.' : e.name === 'NotFoundError' ? 'No microphone found.' : e.message || 'Could not start.'; return; }
        status.className = '';
      };
      root.append(el('div', { className: 'row' }, lab('Source', source), lab('Audio file', file), lab('FFT size', size), lab('Smoothing (0 to 0.95)', smooth), btn), status, peak, cv,
        el('p', { className: 'muted' }, 'Frequency axis is logarithmic, 20 Hz to 20 kHz; level axis runs from -110 to 0 dBFS. Microphone input is not echoed to the speakers.'));
      whenGone(root, () => running && stop());
    },
  },
  {
    id: 'drum-machine', cat: AUD, title: 'Drum Machine (16-Step Sequencer)', custom: true,
    urlState: { get: () => dmApi?.get() ?? {}, set: (o) => dmApi?.set(o) },
    desc: 'Program a 16-step beat with six built-in drum sounds, play it in a loop with tempo and swing, and export the loop as a WAV file. Sounds are synthesised in your browser.',
    render: (root) => {
      const rows = DRUMS.length, grid = Array.from({ length: rows }, () => Array(16).fill(false));
      let ctx, timer, step = 0, nextT = 0, bufs, playing = false, curBtn = null;
      const PRE = { 'Four on the floor': ['x...x...x...x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', '', '', ''], 'Boom bap': ['x.....x...x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.', '', '', '..............x.'], 'Backbeat with open hat': ['x.......x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.', '......x.......x.', '', ''], Empty: ['', '', '', '', '', ''] };
      const bpm = el('input', { type: 'number', id: 'dm-bpm', min: 40, max: 240, value: 100 }), swing = el('input', { type: 'number', id: 'dm-sw', min: 0, max: 60, value: 0 });
      const pre = el('select', { id: 'dm-pre' }, ...Object.keys(PRE).map((k) => el('option', {}, k)));
      const bars = el('select', { id: 'dm-bars' }, ...[1, 2, 4].map((n) => el('option', { value: n }, n)));
      const status = el('p', { role: 'status', style: 'min-height:1.5em' });
      const btns = [], heads = [];
      const setP = (p) => { p.forEach((s, r) => { for (let i = 0; i < 16; i++) { grid[r][i] = s[i] === 'x'; btns[r][i].setAttribute('aria-pressed', grid[r][i]); btns[r][i].textContent = grid[r][i] ? 'x' : ''; } }); };
      const patt = () => grid.map((r) => r.map((v) => (v ? 'x' : '.')).join(''));
      const table = el('table', { style: 'border-collapse:collapse', 'aria-label': 'Step sequencer grid' });
      const hr = el('tr', {}, el('th', { scope: 'col' }, 'Sound'));
      for (let i = 0; i < 16; i++) { const th = el('th', { scope: 'col', style: 'padding:2px 4px;font-weight:400;min-width:2rem' }, String(i + 1)); heads.push(th); hr.append(th); }
      table.append(hr);
      for (let r = 0; r < rows; r++) {
        const tr = el('tr', {}, el('th', { scope: 'row', style: 'text-align:left;padding-right:8px;white-space:nowrap' }, DRUMS[r])); btns.push([]);
        for (let i = 0; i < 16; i++) {
          const b = el('button', { type: 'button', 'aria-pressed': 'false', 'aria-label': `${DRUMS[r]}, step ${i + 1}`, style: `width:2rem;height:2rem;margin:1px;border:1px solid currentColor;border-radius:3px;background:transparent;color:inherit;${i % 4 === 0 ? 'border-width:2px;' : ''}`, onclick: () => { grid[r][i] = !grid[r][i]; b.setAttribute('aria-pressed', grid[r][i]); b.textContent = grid[r][i] ? 'x' : ''; } });
          btns[r].push(b); tr.append(el('td', { style: 'padding:0' }, b));
        }
        table.append(tr);
      }
      const tick = () => {
        const sp = 60 / clamp(+bpm.value || 100, 40, 240) / 4, sw = clamp(+swing.value || 0, 0, 60) / 100;
        while (nextT < ctx.currentTime + 0.12) {
          const t = nextT + (step % 2 ? sw * sp * 0.5 : 0), s = step;
          grid.forEach((row, v) => { if (row[s]) { const n = ctx.createBufferSource(); n.buffer = bufs[v]; n.connect(ctx.destination); n.start(t); } });
          const delay = Math.max(0, (t - ctx.currentTime) * 1000);
          setTimeout(() => { if (!playing) return; heads.forEach((h) => { h.style.background = ''; h.style.fontWeight = '400'; }); heads[s].style.background = 'var(--accent, #36c)'; heads[s].style.color = '#fff'; heads[(s + 15) % 16].style.color = ''; heads[s].style.fontWeight = '700'; }, delay);
          nextT += sp; step = (step + 1) % 16;
        }
      };
      const stop = () => { playing = false; clearInterval(timer); ctx?.close?.(); ctx = null; play.textContent = 'Play'; heads.forEach((h) => { h.style.background = ''; h.style.color = ''; h.style.fontWeight = '400'; }); };
      const play = el('button', { type: 'button', onclick: () => {
        if (playing) { stop(); status.textContent = 'Stopped.'; return; }
        ctx = AC(); ctx.resume?.(); bufs = drumSamples(ctx.sampleRate).map((d) => { const b = ctx.createBuffer(1, d.length, ctx.sampleRate); b.getChannelData(0).set(d); return b; });
        playing = true; step = 0; nextT = ctx.currentTime + 0.08; timer = setInterval(tick, 25); play.textContent = 'Stop'; status.textContent = 'Playing.';
      } }, 'Play');
      const dl = el('button', { type: 'button', onclick: () => {
        if (!grid.some((r) => r.some(Boolean))) { status.textContent = 'The grid is empty: switch some steps on first.'; return; }
        const A = renderPattern(patt(), clamp(+bpm.value || 100, 40, 240), clamp(+swing.value || 0, 0, 60) / 100, +bars.value);
        const a = el('a', { href: URL.createObjectURL(new Blob([wavBytes(A)], { type: 'audio/wav' })), download: 'beat.wav' }); document.body.append(a); a.click(); a.remove();
        status.textContent = `Saved beat.wav (${bars.value} bar(s) at ${bpm.value} BPM).`;
      } }, 'Download WAV');
      pre.onchange = () => setP(PRE[pre.value].map((s) => s.padEnd(16, '.')));
      setP(PRE['Four on the floor']);
      root.append(el('div', { className: 'row' }, play, lab('Tempo (BPM)', bpm), lab('Swing (%)', swing), lab('Preset', pre), lab('Bars to export', bars), dl), status, el('div', { style: 'overflow-x:auto' }, table),
        el('p', { className: 'muted' }, 'Press a step to switch it on or off. Columns 1, 5, 9 and 13 are the beats. The numbered header highlights the step being played.'));
      whenGone(root, stop);
      dmApi = { get: () => ({ b: +bpm.value, s: +swing.value, p: patt().join(',') }), set: (o) => { if (o.b) bpm.value = o.b; if (o.s != null) swing.value = o.s; if (o.p) setP(String(o.p).split(',').map((s) => s.padEnd(16, '.').slice(0, 16))); } };
    },
  },
  {
    id: 'hearing-frequency-test', cat: AUD, title: 'High-Frequency Hearing Test', custom: true,
    desc: 'Play quiet test tones from 8 kHz up to 20 kHz and mark which ones you can hear, to see roughly where your high-frequency hearing ends on your own speakers or headphones.',
    render: (root) => {
      const FREQ = [8000, 10000, 12000, 14000, 15000, 16000, 17000, 18000, 19000, 20000], res = {};
      let ctx, i = 0;
      const status = el('p', { role: 'status', style: 'min-height:2.5em' }), out = el('pre', { className: 'out', 'aria-live': 'off' });
      const tone = (f, g = 0.15, sec = 2) => {
        ctx ||= AC(); ctx.resume?.();
        if (f > ctx.sampleRate / 2 - 500) { status.textContent = `${f} Hz is above what this device's audio output can play (${ctx.sampleRate} Hz sample rate).`; return false; }
        const o = ctx.createOscillator(), a = ctx.createGain(); o.frequency.value = f; a.gain.setValueAtTime(0, ctx.currentTime); a.gain.linearRampToValueAtTime(g, ctx.currentTime + 0.2); a.gain.setValueAtTime(g, ctx.currentTime + sec - 0.2); a.gain.linearRampToValueAtTime(0, ctx.currentTime + sec);
        o.connect(a).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + sec + 0.05); return true;
      };
      const show = () => {
        const heard = FREQ.filter((f) => res[f] === 'heard'), max = heard.length ? Math.max(...heard) : null;
        out.textContent = FREQ.map((f) => `${String(f).padStart(6)} Hz  ${res[f] === 'heard' ? 'heard' : res[f] === 'not' ? 'not heard' : res[f] === 'skip' ? 'not playable on this device' : '-'}`).join('\n') + (Object.keys(res).length === FREQ.length ? `\n\nHighest tone you heard: ${max ? max + ' Hz' : 'none of them'}.` : '');
      };
      const step = el('div', {}), calib = el('div', {});
      const playRef = el('button', { type: 'button', onclick: () => { tone(1000, 0.15, 2); status.textContent = 'Playing a 1000 Hz reference tone. Set the volume so it is clear but comfortable.'; } }, 'Play 1000 Hz reference tone');
      calib.append(el('p', {}, 'Step 1: use headphones or speakers at a normal distance. Play the reference tone and set your device volume so it is clearly audible but not loud. Do not change the volume afterwards.'), playRef);
      const startBtn = el('button', { type: 'button', onclick: () => { i = 0; for (const k in res) delete res[k]; next(); } }, 'Start the test');
      const next = () => {
        step.textContent = '';
        if (i >= FREQ.length) { status.textContent = 'Done.'; show(); return; }
        const f = FREQ[i];
        const heard = el('button', { type: 'button', onclick: () => { res[f] = 'heard'; i++; show(); next(); } }, 'I heard it'), not = el('button', { type: 'button', onclick: () => { res[f] = 'not'; i++; show(); next(); } }, 'I did not hear it');
        const pl = el('button', { type: 'button', onclick: () => { if (!tone(f)) { res[f] = 'skip'; i++; show(); next(); } else status.textContent = `Playing ${f} Hz for two seconds.`; } }, `Play ${f} Hz`);
        step.append(el('p', {}, `Tone ${i + 1} of ${FREQ.length}: ${f} Hz`), el('div', { className: 'row' }, pl, heard, not));
        status.textContent = `Tone ${i + 1} of ${FREQ.length}. Press Play, then answer.`;
      };
      root.append(calib, el('p', {}, startBtn), step, status, out, el('p', { className: 'muted' }, 'This is a rough check of your equipment and ears together, not a medical hearing test. Many speakers and headphones play little above 16 kHz, and the ability to hear 16 kHz or more normally falls with age. If you notice ringing, pain or sudden loss of hearing, see a doctor.'));
      whenGone(root, () => ctx?.close?.());
    },
  },
  {
    id: 'sleep-noise-timer', cat: AUD, title: 'Sleep Noise Player with Timer', custom: true,
    desc: 'Play white, pink or brown noise with a volume control and a sleep timer that fades the sound out and stops it after the minutes you choose. Generated live, no files.',
    render: (root) => {
      let ctx, gain, src, tick, endAt = 0, fadeS = 20;
      const kind = el('select', { id: 'sn-kind' }, ...['pink', 'white', 'brown'].map((k) => el('option', {}, k)));
      const vol = el('input', { type: 'range', id: 'sn-vol', min: 0, max: 100, value: 40 }), mins = el('input', { type: 'number', id: 'sn-min', min: 1, max: 720, value: 30 });
      const status = el('p', { role: 'status', style: 'min-height:1.5em' }), left = el('p', { 'aria-live': 'off', style: 'font:700 2rem system-ui,sans-serif;margin:8px 0' }, '');
      const btn = el('button', { type: 'button' }, 'Start');
      const stop = (msg) => { clearInterval(tick); try { src?.stop(); } catch { /* stopped */ } ctx?.close?.(); ctx = null; btn.textContent = 'Start'; left.textContent = ''; status.textContent = msg; };
      vol.oninput = () => { if (gain && ctx) gain.gain.value = (+vol.value / 100) ** 2; };
      btn.onclick = () => {
        if (ctx) return stop('Stopped.');
        const m = clamp(Math.round(+mins.value) || 30, 1, 720);
        ctx = AC(); ctx.resume?.(); gain = ctx.createGain(); gain.gain.value = (+vol.value / 100) ** 2; src = ctx.createBufferSource(); src.buffer = mkLoop(kind.value, ctx); src.loop = true; src.connect(gain).connect(ctx.destination); src.start();
        endAt = ctx.currentTime + m * 60; fadeS = Math.min(20, m * 30);
        const fadeStart = endAt - fadeS; let faded = false;
        btn.textContent = 'Stop'; status.textContent = `Playing ${kind.value} noise. It will stop after ${m} minute(s).`;
        tick = setInterval(() => {
          const r = endAt - ctx.currentTime;
          if (r <= 0) return stop('The timer ended and the noise stopped.');
          if (!faded && ctx.currentTime >= fadeStart) { faded = true; gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime); gain.gain.linearRampToValueAtTime(0, endAt); }
          left.textContent = `${Math.floor(r / 60)}:${String(Math.floor(r % 60)).padStart(2, '0')} left`;
        }, 500);
      };
      root.append(el('div', { className: 'row' }, lab('Colour', kind), lab('Volume', vol), lab('Timer (minutes)', mins), btn), left, status,
        el('p', { className: 'muted' }, 'White noise is bright and hissy, pink is balanced like steady rain, brown is deep like a distant rumble. The last 20 seconds fade out. Keep the volume low enough to hear your surroundings if safety matters.'));
      whenGone(root, () => ctx && stop(''));
    },
  },
);

// ============================================================ PDF core (built on pdfedit.js, loaded lazily)
let LIB, KN;
const lib = async () => (LIB ||= await import('./pdfedit.js'));
const u8s = (s) => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; };
const latinS = (b) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };
const concatU = (arrs) => { let n = 0; for (const a of arrs) n += a.length; const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; };
const zip = async (u, Cls, fmt) => new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new Cls(fmt))).arrayBuffer());
const inflate = (u) => zip(u, DecompressionStream, 'deflate');
const deflate = (u) => zip(u, CompressionStream, 'deflate');
async function kinds() {
  if (KN) return KN;
  const { openPdf } = await lib();
  const d = await openPdf(u8s('%PDF-1.4\n1 0 obj\n<</Type/Catalog/Pages 2 0 R/S<41>>>\nendobj\n2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>\nendobj\n4 0 obj\n<</Length 1>>\nstream\nx\nendstream\nendobj\ntrailer\n<</Root 1 0 R>>\n'));
  const c = d.objs.get(1);
  return (KN = { Name: c.Type.constructor, Ref: c.Pages.constructor, Str: c.S.constructor, Stream: d.objs.get(4).constructor });
}
const nm = (s) => new KN.Name(s);
const mkRef = (n) => new KN.Ref(n);
const isStream = (v) => v instanceof KN.Stream;
const isRef = (v) => v instanceof KN.Ref;
const isNameV = (v) => v instanceof KN.Name;
const isPlain = (v) => v != null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
function addObj(d, v) { d._n = (d._n ?? Math.max(0, ...d.objs.keys())) + 1; d.objs.set(d._n, v); return mkRef(d._n); }
function addRes(d, src, cat, name, val) {
  const res = { ...(d.dict(src.Resources) || {}) };
  res[cat] = { ...(d.dict(res[cat]) || {}), [name]: val }; src.Resources = res;
}
function addBlank(d, w, h) { d.pages.push({ ref: null, dict: { Type: nm('Page'), MediaBox: [0, 0, w, h] }, inh: {} }); return d.pages.length - 1; }
async function openFiles(files, what = 'a PDF file') {
  await kinds();
  const f = [...(files || [])].find((x) => /pdf/i.test(x.type) || /\.pdf$/i.test(x.name));
  if (!f) throw new Error(`Choose ${what}`);
  const { openPdf } = await lib(), bytes = new Uint8Array(await f.arrayBuffer());
  try { return { f, bytes, doc: await openPdf(bytes, f.name) }; } catch (e) { throw new Error(e.message.includes(f.name) ? e.message : `${f.name}: ${e.message}`); }
}
const pdfOut = (bytes, name, text) => ({ blob: new File([bytes], name, { type: 'application/pdf' }), filename: name, text });
const bname = (f) => f.name.replace(/\.pdf$/i, '') || 'document';
async function streamBytes(d, st) { // Flate or no filter only
  let fl = d.r(st.dict.Filter); fl = fl == null ? [] : Array.isArray(fl) ? fl.map((x) => d.r(x)) : [fl];
  let data = st.data;
  for (const f of fl) { const n = f?.n; if (n === 'FlateDecode' || n === 'Fl') data = await inflate(data); else throw new Error(`unsupported filter ${n}`); }
  return data;
}
// affine matrices [a b c d e f]; apply(A) then B
const mmul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3], A[4] * B[0] + A[5] * B[2] + B[4], A[4] * B[1] + A[5] * B[3] + B[5]];
const minv = (M) => { const det = M[0] * M[3] - M[1] * M[2]; return [M[3] / det, -M[1] / det, -M[2] / det, M[0] / det, (M[2] * M[5] - M[3] * M[4]) / det, (M[1] * M[4] - M[0] * M[5]) / det]; };
const fn = (n) => (Number.isInteger(n) ? String(n) : (+n.toFixed(4)).toString());
const cmStr = (M) => M.map(fn).join(' ') + ' cm';
// matrix taking user space of page i to displayed space (origin bottom-left of what you see)
function pageMatrix(inf) {
  const [vx, vy, vx2, vy2] = inf.vis, uw = vx2 - vx, uh = vy2 - vy;
  return [[1, 0, 0, 1, -vx, -vy], [0, -1, 1, 0, -vy, uw + vx], [-1, 0, 0, -1, uw + vx, uh + vy], [0, 1, -1, 0, uh + vy, -vx]][inf.rot / 90];
}
// a page as a Form XObject (annotations are not included)
async function pageForm(d, i) {
  const p = d.pages[i], inf = d.info(i);
  let c = d.r(p.dict.Contents); c = c == null ? [] : Array.isArray(c) ? c : [p.dict.Contents];
  const parts = [];
  for (const x of c) { const st = d.r(x); if (isStream(st)) { try { parts.push(await streamBytes(d, st), u8s('\n')); } catch (e) { throw new Error(`page ${i + 1}: ${e.message} in the page content`); } } }
  const data = await deflate(concatU(parts));
  const ref = addObj(d, new KN.Stream({ Type: nm('XObject'), Subtype: nm('Form'), BBox: inf.vis, Resources: p.dict.Resources ?? p.inh.Resources ?? {}, Filter: nm('FlateDecode') }, data));
  return { ref, inf };
}
const SIZES = { A4: [595.28, 841.89], Letter: [612, 792], A3: [841.89, 1190.55], Legal: [612, 1008] };

// ---- N-up / booklet imposition. sheets: array of arrays of page indices (-1 = blank), row-major ----
async function impose(bytes, sheets, o) {
  await kinds();
  const { openPdf, buildPdf } = await lib(), d = await openPdf(bytes), forms = new Map();
  const { cols, rows, sw, sh, margin = 0, gap = 0, border = false } = o(d);
  const cw = (sw - 2 * margin - (cols - 1) * gap) / cols, ch = (sh - 2 * margin - (rows - 1) * gap) / rows;
  if (cw < 20 || ch < 20) throw new Error('Margins and gaps leave no room for the pages');
  const specs = sheets.map((cells) => ({
    doc: d, index: addBlank(d, sw, sh),
    mod: async (src) => {
      let content = ''; const xo = {};
      for (let k = 0; k < cells.length; k++) {
        const pi = cells[k], c = k % cols, r = Math.floor(k / cols), x = margin + c * (cw + gap), y = sh - margin - (r + 1) * ch - r * gap;
        if (border) content += `q 0.6 G 0.5 w ${fn(x)} ${fn(y)} ${fn(cw)} ${fn(ch)} re S Q\n`;
        if (pi < 0) continue;
        if (!forms.has(pi)) forms.set(pi, await pageForm(d, pi));
        const { ref, inf } = forms.get(pi), s = Math.min(cw / inf.w, ch / inf.h), M = mmul(pageMatrix(inf), [s, 0, 0, s, x + (cw - s * inf.w) / 2, y + (ch - s * inf.h) / 2]);
        xo['P' + pi] = ref; content += `q ${cmStr(M)} /P${pi} Do Q\n`;
      }
      src.Resources = { XObject: xo };
      return { content };
    },
  }));
  return buildPdf(specs, { info: null });
}
const cellGrid = (n) => ({ 2: [2, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2], 9: [3, 3], 12: [4, 3], 16: [4, 4] })[n];

// ---- blank pages ----
async function insertBlanks(bytes, after, count, note) {
  await kinds();
  const { openPdf, buildPdf } = await lib(), d = await openPdf(bytes), n = d.pages.length, specs = [];
  const blank = (ref) => { const inf = d.info(ref), i = addBlank(d, inf.w, inf.h); return { doc: d, index: i, mod: note ? () => ({ content: `BT /FtB 11 Tf 0.45 g ${fn(inf.w / 2 - note.length * 2.6)} ${fn(inf.h / 2)} Td (${note.replace(/[()\\]/g, '\\$&')}) Tj ET\n`, fonts: { FtB: 'Helvetica' } }) : undefined }; };
  for (const a of after) if (a < 0 || a > n) throw new Error(`Page ${a} does not exist (the file has ${n} pages)`);
  for (let i = 0; i <= n; i++) {
    if (i > 0) specs.push({ doc: d, index: i - 1 });
    const c = after.filter((a) => a === i).length * count;
    for (let k = 0; k < c; k++) specs.push(blank(Math.min(Math.max(i, 1), n) - 1));
  }
  return buildPdf(specs, { info: 'first' });
}

// ---- grayscale: paint a gray rectangle with the Saturation blend mode over each page ----
async function grayscalePdf(bytes) {
  await kinds();
  const { openPdf, buildPdf } = await lib(), d = await openPdf(bytes);
  return buildPdf(d.pages.map((_, i) => ({
    doc: d, index: i,
    mod: (src, inf) => {
      addRes(d, src, 'ExtGState', 'FtGs', { Type: nm('ExtGState'), BM: nm('Saturation'), ca: 1, CA: 1 });
      return { content: `q /FtGs gs 0.5 g ${fn(inf.vis[0])} ${fn(inf.vis[1])} ${fn(inf.vis[2] - inf.vis[0])} ${fn(inf.vis[3] - inf.vis[1])} re f Q\n` };
    },
  })), { info: 'first' });
}

// ---- flatten annotations and form widgets into page content ----
async function flattenPdf(bytes, { keepLinks = true } = {}) {
  await kinds();
  const { openPdf, buildPdf } = await lib(), d = await openPdf(bytes);
  let flat = 0, noAp = 0, dropped = 0;
  const plans = d.pages.map((p, i) => {
    const list = d.r(p.dict.Annots), draw = [], keep = [];
    if (Array.isArray(list)) for (const a of list) {
      const ad = d.dict(a); if (!ad) continue;
      const sub = d.r(ad.Subtype)?.n, fl = d.num(ad.F, 0);
      if (sub === 'Popup') continue;
      if (sub === 'Link' && keepLinks) { keep.push(a); continue; }
      if (fl & 2 || fl & 32) { dropped++; continue; }
      let ap = d.r(d.dict(ad.AP)?.N), apRef = d.dict(ad.AP)?.N;
      if (ap && !isStream(ap) && isPlain(ap)) { const as = d.r(ad.AS)?.n; apRef = as ? ap[as] : null; ap = as ? d.r(ap[as]) : null; }
      const rect = d.box(ad.Rect);
      if (!isStream(ap) || !rect) { if (sub !== 'Link') noAp++; continue; }
      draw.push({ ap, apRef, rect });
    }
    p.dict.Annots = keep;
    return draw;
  });
  const out = await buildPdf(d.pages.map((_, i) => ({
    doc: d, index: i,
    mod: (src) => {
      const draw = plans[i]; if (!draw.length) return;
      let content = '';
      draw.forEach((a, k) => {
        const bb = d.nums(a.ap.dict.BBox) || [0, 0, 1, 1], M = d.nums(a.ap.dict.Matrix) || [1, 0, 0, 1, 0, 0];
        const xs = [], ys = [];
        for (const [x, y] of [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]]) { xs.push(M[0] * x + M[2] * y + M[4]); ys.push(M[1] * x + M[3] * y + M[5]); }
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const sx = x1 - x0 > 1e-6 ? (a.rect[2] - a.rect[0]) / (x1 - x0) : 1, sy = y1 - y0 > 1e-6 ? (a.rect[3] - a.rect[1]) / (y1 - y0) : 1;
        addRes(d, src, 'XObject', 'FtAnn' + k, a.apRef instanceof KN.Ref ? a.apRef : addObj(d, a.ap));
        content += `q ${cmStr([sx, 0, 0, sy, a.rect[0] - x0 * sx, a.rect[1] - y0 * sy])} /FtAnn${k} Do Q\n`;
        flat++;
      });
      return { content };
    },
  })), { info: 'first' });
  return { bytes: out, flat, noAp, dropped };
}

// ---- image overlay (signature, image watermark): img = {w,h,rgb,alpha?}; items = [{page, cx, cy (fractions from bottom-left of the displayed page), width (fraction of page width), angle, opacity}] ----
export async function overlayImages(bytes, img, items) {
  await kinds();
  const { openPdf, buildPdf } = await lib(), d = await openPdf(bytes), n = d.pages.length;
  const smask = img.alpha ? addObj(d, new KN.Stream({ Type: nm('XObject'), Subtype: nm('Image'), Width: img.w, Height: img.h, ColorSpace: nm('DeviceGray'), BitsPerComponent: 8, Filter: nm('FlateDecode') }, await deflate(img.alpha))) : null;
  const im = addObj(d, new KN.Stream({ Type: nm('XObject'), Subtype: nm('Image'), Width: img.w, Height: img.h, ColorSpace: nm('DeviceRGB'), BitsPerComponent: 8, Filter: nm('FlateDecode'), ...(smask ? { SMask: smask } : {}) }, await deflate(img.rgb)));
  const byPage = new Map(); for (const it of items) { if (it.page < 0 || it.page >= n) throw new Error(`Page ${it.page + 1} does not exist (the file has ${n} pages)`); (byPage.get(it.page) || byPage.set(it.page, []).get(it.page)).push(it); }
  return buildPdf(d.pages.map((_, i) => ({
    doc: d, index: i,
    mod: byPage.has(i) ? (src, inf) => {
      const M = pageMatrix(inf), Mi = minv(M); let content = ''; const gs = {};
      byPage.get(i).forEach((it, k) => {
        const w = it.width * inf.w, h = w * img.h / img.w, a = (it.angle || 0) * Math.PI / 180, cx = it.cx * inf.w, cy = it.cy * inf.h;
        const P = [w * Math.cos(a), w * Math.sin(a), -h * Math.sin(a), h * Math.cos(a), cx - (w * Math.cos(a) - h * Math.sin(a)) / 2, cy - (w * Math.sin(a) + h * Math.cos(a)) / 2];
        const g = 'FtG' + k; if (it.opacity < 1) gs[g] = it.opacity;
        content += `q ${it.opacity < 1 ? `/${g} gs ` : ''}${cmStr(mmul(P, Mi))} /FtIm Do Q\n`;
      });
      addRes(d, src, 'XObject', 'FtIm', im);
      return { content, gs };
    } : undefined,
  })), { info: 'first' });
}

// ---- outlines (bookmarks) ----
const pdfDocText = (s) => { const b = s.b; if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2)); if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder().decode(b.subarray(3)); return latinS(b); };
export async function readOutline(bytes) {
  await kinds();
  const { openPdf } = await lib(), d = await openPdf(bytes), out = [];
  const pageOf = (dest, depth = 0) => {
    dest = d.r(dest); if (depth > 3) return null;
    if (Array.isArray(dest)) { const r = dest[0]; if (isRef(r)) { const k = d.pages.findIndex((p) => p.ref === r.n); return k < 0 ? null : k + 1; } return typeof r === 'number' ? r + 1 : null; }
    if (isPlain(dest) && dest.D) return pageOf(dest.D, depth + 1);
    return null;
  };
  const walk = (item, lvl, seen) => {
    for (let it = d.dict(item); it && out.length < 5000; it = d.dict(it.Next)) {
      if (seen.has(it)) break; seen.add(it);
      const t = d.r(it.Title), title = t && t.b ? pdfDocText(t) : '(untitled)';
      const pg = pageOf(it.Dest) ?? pageOf(d.dict(it.A)?.D);
      out.push({ lvl, title, page: pg });
      if (it.First) walk(it.First, lvl + 1, seen);
    }
  };
  const root = d.dict(d.catalog?.Outlines); if (root?.First) walk(root.First, 0, new Set());
  return { items: out, pages: d.pages.length };
}
export const outlineToText = (items) => items.map((i) => `${'  '.repeat(i.lvl)}${i.title} | ${i.page ?? '?'}`).join('\n');
export function parseOutlineText(text, pages) {
  const items = []; let prev = -1;
  text.split(/\r?\n/).forEach((raw, ln) => {
    if (!raw.trim()) return;
    const ind = /^[ \t]*/.exec(raw)[0].replace(/\t/g, '  ').length, lvl = Math.floor(ind / 2), m = /^(.*)\|\s*(\d+)\s*$/.exec(raw.trim());
    if (!m) throw new Error(`Line ${ln + 1}: write it as "Title | page number"`);
    const page = +m[2]; if (page < 1 || page > pages) throw new Error(`Line ${ln + 1}: page ${page} does not exist (the file has ${pages} pages)`);
    if (lvl > prev + 1) throw new Error(`Line ${ln + 1}: indent by one level (2 spaces) at a time`);
    prev = lvl; items.push({ lvl, title: m[1].trim(), page });
  });
  return items;
}
const hexU16 = (s) => { let h = 'FEFF'; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0'); return `<${h}>`; };
// append an incremental update with an outline tree to a file written by buildPdf (classic xref table)
export async function addOutline(bytes, items) {
  await kinds();
  const { openPdf } = await lib(), d = await openPdf(bytes), s = latinS(bytes);
  const sx = [...s.matchAll(/startxref\s+(\d+)/g)].pop(), prev = +sx[1], tr = s.slice(s.lastIndexOf('trailer'));
  const root = +/\/Root (\d+) 0 R/.exec(tr)[1], size = +/\/Size (\d+)/.exec(tr)[1], id = /\/ID (\[[^\]]*\])/.exec(tr)?.[1];
  const cm = new RegExp(`(?:^|\\n)${root} 0 obj\\n<<([\\s\\S]*?)>>\\nendobj`).exec(s);
  if (!cm) throw new Error('Could not find the catalog to extend');
  const base = size, objs = [], N = items.length, first = base + 1;
  // build the tree
  const nodes = items.map((it, i) => ({ ...it, id: first + i, kids: [], parent: null }));
  const tops = [], st = [];
  for (const n of nodes) { st.length = n.lvl; n.parent = n.lvl ? st[n.lvl - 1] : null; (n.parent ? n.parent.kids : tops).push(n); st[n.lvl] = n; }
  const count = (n) => n.kids.reduce((a, k) => a + 1 + count(k), 0);
  const pageRef = (p) => `${d.pages[p - 1].ref} 0 R`;
  const txt = [];
  const sib = (list, n) => { const k = list.indexOf(n); return `${k > 0 ? ` /Prev ${list[k - 1].id} 0 R` : ''}${k < list.length - 1 ? ` /Next ${list[k + 1].id} 0 R` : ''}`; };
  for (const n of nodes) {
    const list = n.parent ? n.parent.kids : tops;
    txt.push([n.id, `<</Title ${hexU16(n.title)} /Parent ${n.parent ? n.parent.id : base} 0 R${sib(list, n)}${n.kids.length ? ` /First ${n.kids[0].id} 0 R /Last ${n.kids[n.kids.length - 1].id} 0 R /Count ${count(n)}` : ''} /Dest [${pageRef(n.page)} /XYZ null null null]>>`]);
  }
  txt.unshift([base, `<</Type /Outlines${tops.length ? ` /First ${tops[0].id} 0 R /Last ${tops[tops.length - 1].id} 0 R` : ''} /Count ${nodes.length}>>`]);
  const newCat = `<<${cm[1].replace(/\/Outlines \d+ 0 R|\/PageMode \/\w+/g, '')} /Outlines ${base} 0 R /PageMode /UseOutlines>>`;
  txt.push([root, newCat]);
  let pos = bytes.length, body = '\n'; const offs = new Map(); pos += 1;
  for (const [n, t] of txt) { offs.set(n, pos); const o = `${n} 0 obj\n${t}\nendobj\n`; body += o; pos += o.length; }
  const xrefAt = pos, ents = (nums) => nums.map((n) => `${String(offs.get(n)).padStart(10, '0')} 00000 n \n`).join('');
  const newNums = Array.from({ length: N + 1 }, (_, i) => base + i);
  const x = `xref\n${root} 1\n${ents([root])}${base} ${N + 1}\n${ents(newNums)}trailer\n<</Size ${base + N + 1} /Root ${root} 0 R /Prev ${prev}${id ? ` /ID ${id}` : ''}>>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return concatU([bytes, u8s(body + x)]);
}

// ============================================================ PDF text with positions (ToUnicode, simple and Type0 fonts)
// Ceilings: horizontal text only (rotated text is listed separately), no vertical writing, predefined CJK CMaps are not
// available (2-byte codes are assumed), fonts without ToUnicode and without a standard encoding give no text, Type3 glyphs
// map only through ToUnicode, no OCR. Reading order is top to bottom, left to right; multi-column pages read straight across.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const stdWidth = (base, code) => (/Courier/i.test(base) ? 600 : code >= 32 && code <= 126 ? HELV[code - 32] * (/Times/i.test(base) ? 0.9 : 1) : 556);
const GL = (() => {
  return { space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', quotesingle: "'", parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',', hyphen: '-', period: '.', slash: '/', zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', colon: ':', semicolon: ';', less: '<', equal: '=', greater: '>', question: '?', at: '@', bracketleft: '[', backslash: '\\', bracketright: ']', asciicircum: '^', underscore: '_', grave: '`', braceleft: '{', bar: '|', braceright: '}', asciitilde: '~',
    endash: '\u2013', emdash: '\u2014', bullet: '\u2022', quoteleft: '\u2018', quoteright: '\u2019', quotedblleft: '\u201c', quotedblright: '\u201d', quotesinglbase: '\u201a', quotedblbase: '\u201e', ellipsis: '\u2026', dagger: '\u2020', daggerdbl: '\u2021', Euro: '\u20ac', fi: 'fi', fl: 'fl', ff: 'ff', ffi: 'ffi', ffl: 'ffl', germandbls: '\u00df', ae: '\u00e6', AE: '\u00c6', oe: '\u0153', OE: '\u0152', oslash: '\u00f8', Oslash: '\u00d8', aring: '\u00e5', Aring: '\u00c5', section: '\u00a7', paragraph: '\u00b6', copyright: '\u00a9', registered: '\u00ae', trademark: '\u2122', degree: '\u00b0', plusminus: '\u00b1', mu: '\u00b5', multiply: '\u00d7', divide: '\u00f7', sterling: '\u00a3', yen: '\u00a5', cent: '\u00a2', currency: '\u00a4', guillemotleft: '\u00ab', guillemotright: '\u00bb', guilsinglleft: '\u2039', guilsinglright: '\u203a', exclamdown: '\u00a1', questiondown: '\u00bf', periodcentered: '\u00b7', minus: '\u2212', fraction: '\u2044', dotlessi: '\u0131', Lslash: '\u0141', lslash: '\u0142', Scaron: '\u0160', scaron: '\u0161', Zcaron: '\u017d', zcaron: '\u017e', Ydieresis: '\u0178', brokenbar: '\u00a6', logicalnot: '\u00ac', onequarter: '\u00bc', onehalf: '\u00bd', threequarters: '\u00be', onesuperior: '\u00b9', twosuperior: '\u00b2', threesuperior: '\u00b3', ordfeminine: '\u00aa', ordmasculine: '\u00ba', Eth: '\u00d0', eth: '\u00f0', Thorn: '\u00de', thorn: '\u00fe', nbspace: '\u00a0', sfthyphen: '\u00ad', softhyphen: '\u00ad' };
})();
const ACC = { acute: '\u0301', grave: '\u0300', circumflex: '\u0302', dieresis: '\u0308', tilde: '\u0303', ring: '\u030a', cedilla: '\u0327', caron: '\u030c', ogonek: '\u0328', macron: '\u0304', breve: '\u0306', dotaccent: '\u0307', hungarumlaut: '\u030b' };
function glyphToUni(name) {
  let m;
  if ((m = /^uni([0-9A-Fa-f]{4})/.exec(name))) return String.fromCharCode(parseInt(m[1], 16));
  if ((m = /^u([0-9A-Fa-f]{4,6})$/.exec(name))) return String.fromCodePoint(parseInt(m[1], 16));
  name = name.split('.')[0];
  if (GL[name] !== undefined) return GL[name];
  if (name.length === 1) return name;
  if ((m = /^([A-Za-z])(acute|grave|circumflex|dieresis|tilde|ring|cedilla|caron|ogonek|macron|breve|dotaccent|hungarumlaut)$/.exec(name))) return (m[1] + ACC[m[2]]).normalize('NFC');
  return '';
}
const hexUni = (h) => { if (h.length <= 2) return String.fromCharCode(parseInt(h || '0', 16)); let s = ''; for (let i = 0; i + 3 < h.length + 0 && i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return s; };
export function parseCMap(t) {
  const map = new Map(); let len = 0;
  for (const m of t.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) for (const p of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) len = Math.max(len, p[1].length / 2);
  for (const m of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const p of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(parseInt(p[1], 16), hexUni(p[2]));
  for (const m of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) for (const p of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
    const lo = parseInt(p[1], 16), hi = Math.min(parseInt(p[2], 16), lo + 65535);
    if (p[3][0] === '[') { const a = [...p[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => hexUni(x[1])); for (let k = 0; k <= hi - lo && k < a.length; k++) map.set(lo + k, a[k]); }
    else { const b = hexUni(p[3].slice(1, -1)); if (!b) continue; for (let k = 0; k <= hi - lo; k++) map.set(lo + k, b.slice(0, -1) + String.fromCharCode(b.charCodeAt(b.length - 1) + k)); }
  }
  return { map, len };
}
async function loadFont(d, fd) {
  const sub = d.r(fd.Subtype)?.n, base = d.r(fd.BaseFont)?.n || '';
  let cmap = null; const tu = d.r(fd.ToUnicode);
  if (isStream(tu)) { try { cmap = parseCMap(latinS(await streamBytes(d, tu))); } catch { /* no ToUnicode */ } }
  if (sub === 'Type0') {
    const enc = d.r(fd.Encoding); let bpc = 2;
    if (isStream(enc)) { try { const c = parseCMap(latinS(await streamBytes(d, enc))); if (c.len) bpc = c.len; } catch { /* keep 2 */ } }
    const desc = d.dict(d.r(fd.DescendantFonts)?.[0]) || {}, DW = d.num(desc.DW, 1000), W = new Map(), wa = d.r(desc.W);
    if (Array.isArray(wa)) for (let i = 0; i < wa.length;) { const c = d.num(wa[i]), n = d.r(wa[i + 1]); if (Array.isArray(n)) { n.forEach((w, k) => W.set(c + k, d.num(w))); i += 2; } else { const c2 = d.num(wa[i + 1]), w = d.num(wa[i + 2]); for (let k = c; k <= c2 && k - c < 70000; k++) W.set(k, w); i += 3; } }
    return { bpc, wid: (c) => W.get(c) ?? DW, uni: (c) => cmap?.map.get(c) ?? '', miss: 0 };
  }
  const first = d.num(fd.FirstChar, 0), ws = d.nums(fd.Widths), desc = d.dict(fd.FontDescriptor), mw = desc ? d.num(desc.MissingWidth, 0) : 0;
  const enc = d.r(fd.Encoding), tab = new Array(256);
  const bn = isNameV(enc) ? enc.n : isPlain(enc) ? d.r(enc.BaseEncoding)?.n : null;
  const dec = new TextDecoder(bn === 'MacRomanEncoding' ? 'macintosh' : 'windows-1252');
  for (let c = 32; c < 256; c++) tab[c] = dec.decode(Uint8Array.of(c));
  if (isPlain(enc)) { const df = d.r(enc.Differences); if (Array.isArray(df)) { let c = 0; for (const x of df) { const v = d.r(x); if (typeof v === 'number') c = v; else if (isNameV(v)) { tab[c] = glyphToUni(v.n); c++; } } } }
  return { bpc: 1, wid: (c) => (ws ? (c >= first && c - first < ws.length ? ws[c - first] : mw) : stdWidth(base, c)), uni: (c) => cmap?.map.get(c) ?? tab[c] ?? '', miss: 0 };
}
function* contentOps(s) {
  const n = s.length, isWs = (c) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0, isDl = (c) => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
  let i = 0, st = []; const as = [];
  while (i < n) {
    const c = s.charCodeAt(i);
    if (isWs(c)) { i++; continue; }
    if (c === 37) { while (i < n && s.charCodeAt(i) !== 10 && s.charCodeAt(i) !== 13) i++; continue; }
    if (c === 47) { let j = i + 1; while (j < n && !isWs(s.charCodeAt(j)) && !isDl(s.charCodeAt(j))) j++; st.push({ n: s.slice(i + 1, j).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) }); i = j; continue; }
    if (c === 40) {
      let depth = 1, j = i + 1, out = '';
      while (j < n && depth) {
        const ch = s[j];
        if (ch === '\\') { const x = s[j + 1]; j += 2; if (x === 'n') out += '\n'; else if (x === 'r') out += '\r'; else if (x === 't') out += '\t'; else if (x === 'b') out += '\b'; else if (x === 'f') out += '\f'; else if (x >= '0' && x <= '7') { let o = x; while (o.length < 3 && s[j] >= '0' && s[j] <= '7') o += s[j++]; out += String.fromCharCode(parseInt(o, 8) & 255); } else if (x === '\r') { if (s[j] === '\n') j++; } else if (x !== '\n') out += x; }
        else { if (ch === '(') depth++; else if (ch === ')') { depth--; if (!depth) { j++; break; } } out += ch; j++; }
      }
      st.push({ s: out }); i = j; continue;
    }
    if (c === 60) {
      if (s.charCodeAt(i + 1) === 60) { let depth = 1, j = i + 2; while (j < n && depth) { if (s[j] === '<' && s[j + 1] === '<') { depth++; j += 2; } else if (s[j] === '>' && s[j + 1] === '>') { depth--; j += 2; } else j++; } st.push({ dict: true }); i = j; continue; }
      const e = s.indexOf('>', i); let h = s.slice(i + 1, e < 0 ? n : e).replace(/\s/g, ''); if (h.length & 1) h += '0';
      let out = ''; for (let k = 0; k < h.length; k += 2) out += String.fromCharCode(parseInt(h.substr(k, 2), 16)); st.push({ s: out }); i = (e < 0 ? n : e) + 1; continue;
    }
    if (c === 91) { as.push(st); st = []; i++; continue; }
    if (c === 93) { const a = st; st = as.pop() || []; st.push(a); i++; continue; }
    if (c === 62 || c === 41 || c === 123 || c === 125) { i++; continue; }
    let j = i; while (j < n && !isWs(s.charCodeAt(j)) && !isDl(s.charCodeAt(j))) j++;
    const tok = s.slice(i, j); i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) { st.push(parseFloat(tok)); continue; }
    if (tok === 'BI') { const m = /\sID[ \n\r\t]/g; m.lastIndex = i; const a = m.exec(s); if (!a) return; const e = /[ \n\r\t]EI(?=[ \n\r\t]|$)/g; e.lastIndex = a.index + a[0].length; const b = e.exec(s); i = b ? b.index + b[0].length : n; st = []; continue; }
    yield [st, tok]; st = [];
  }
}
// all glyphs of a page: [{x,y,ex,ey,size,ang,ch}] in displayed coordinates (origin bottom-left of the visible page)
export async function pageGlyphs(d, pi, cache = new Map()) {
  await kinds();
  const p = d.pages[pi], inf = d.info(pi), M0 = pageMatrix(inf), out = [], warn = { unmapped: 0, notes: new Set() };
  let budget = 400;
  const run = async (res, str, ctm0, depth) => {
    const fonts = d.dict(res?.Font), xo = d.dict(res?.XObject), stack = [];
    let ctm = ctm0, tm = [1, 0, 0, 1, 0, 0], tlm = tm, font = null, fs = 0, Tc = 0, Tw = 0, Th = 1, Tl = 0, Ts = 0;
    const show = async (s) => {
      if (!font) return;
      for (let k = 0; k < s.length;) {
        let code = s.charCodeAt(k++); for (let b = 1; b < font.bpc && k < s.length; b++) code = code * 256 + s.charCodeAt(k++);
        const w = font.wid(code) / 1000, uni = font.uni(code), T = mmul(tm, ctm), Trm = mmul([fs * Th, 0, 0, fs, 0, Ts], T);
        const tx = (w * fs + Tc + (code === 32 && font.bpc === 1 ? Tw : 0)) * Th;
        const nt = mmul([1, 0, 0, 1, tx, 0], tm), T2 = mmul(nt, ctm);
        if (uni === '' && code !== 32 && w > 0) warn.unmapped++;
        if (uni !== '') out.push({ x: Trm[4], y: Trm[5], ex: T2[4] + (T2[2] * 0), ey: T2[5], size: Math.hypot(Trm[2], Trm[3]), ang: Math.atan2(Trm[1], Trm[0]), ch: uni.replace(/[\ufb00-\ufb06]/g, (c) => c.normalize('NFKC')) });
        tm = nt;
      }
    };
    for (const [a, op] of contentOps(str)) {
      switch (op) {
        case 'q': stack.push([ctm, Tc, Tw, Th, Tl, Ts, font, fs]); break;
        case 'Q': if (stack.length) [ctm, Tc, Tw, Th, Tl, Ts, font, fs] = stack.pop(); break;
        case 'cm': if (a.length >= 6) ctm = mmul(a.slice(-6), ctm); break;
        case 'BT': tm = tlm = [1, 0, 0, 1, 0, 0]; break;
        case 'Tf': {
          fs = a[1] || 0; const key = a[0]?.n, fr = fonts && fonts[key], fd = d.dict(fr);
          if (!fd) { font = null; break; }
          const ck = isRef(fr) ? fr.n : fd; if (!cache.has(ck)) cache.set(ck, await loadFont(d, fd));
          font = cache.get(ck); break;
        }
        case 'Tc': Tc = a[0] || 0; break;
        case 'Tw': Tw = a[0] || 0; break;
        case 'Tz': Th = (a[0] || 100) / 100; break;
        case 'TL': Tl = a[0] || 0; break;
        case 'Ts': Ts = a[0] || 0; break;
        case 'Td': case 'TD': if (op === 'TD') Tl = -a[1]; tlm = mmul([1, 0, 0, 1, a[0] || 0, a[1] || 0], tlm); tm = tlm; break;
        case 'Tm': if (a.length >= 6) tm = tlm = a.slice(-6); break;
        case 'T*': tlm = mmul([1, 0, 0, 1, 0, -Tl], tlm); tm = tlm; break;
        case 'Tj': if (a[0]?.s !== undefined) await show(a[0].s); break;
        case "'": tlm = mmul([1, 0, 0, 1, 0, -Tl], tlm); tm = tlm; if (a[0]?.s !== undefined) await show(a[0].s); break;
        case '"': Tw = a[0] || 0; Tc = a[1] || 0; tlm = mmul([1, 0, 0, 1, 0, -Tl], tlm); tm = tlm; if (a[2]?.s !== undefined) await show(a[2].s); break;
        case 'TJ': for (const e of a[0] || []) { if (e && e.s !== undefined) await show(e.s); else if (typeof e === 'number') tm = mmul([1, 0, 0, 1, (-e / 1000) * fs * Th, 0], tm); } break;
        case 'Do': {
          const x = xo && xo[a[0]?.n], st = d.r(x);
          if (isStream(st) && d.r(st.dict.Subtype)?.n === 'Form' && depth < 6 && budget-- > 0) {
            let bytes; try { bytes = await streamBytes(d, st); } catch (e) { warn.notes.add(`a form XObject uses ${e.message}`); break; }
            const fm = d.nums(st.dict.Matrix) || [1, 0, 0, 1, 0, 0];
            await run(d.dict(st.dict.Resources) || res, latinS(bytes), mmul(fm, ctm), depth + 1);
          }
          break;
        }
        default: break;
      }
    }
  };
  let c = d.r(p.dict.Contents); c = c == null ? [] : Array.isArray(c) ? c : [p.dict.Contents];
  let str = '';
  for (const x of c) { const st = d.r(x); if (isStream(st)) { try { str += latinS(await streamBytes(d, st)) + '\n'; } catch (e) { warn.notes.add(`page ${pi + 1}: page content uses ${e.message}`); } } }
  await run(d.dict(p.dict.Resources ?? p.inh.Resources) || {}, str, M0, 0);
  return { glyphs: out, warn, inf };
}
// glyphs -> lines [{y, size, parts:[{x0,x1,text}]}] ; word gap = 0.17 em, cell gap = cellEm em
export function buildLines(glyphs, cellEm = 1) {
  glyphs = glyphs.slice();
  const cnt = [0, 0, 0, 0]; for (const g of glyphs) { const q = Math.round(g.ang / (Math.PI / 2)); cnt[((q % 4) + 4) % 4]++; }
  const dom = cnt.indexOf(Math.max(...cnt)), th = -dom * (Math.PI / 2), cs = Math.round(Math.cos(th)), sn = Math.round(Math.sin(th));
  if (dom) glyphs = glyphs.map((g) => ({ ...g, x: g.x * cs - g.y * sn, y: g.x * sn + g.y * cs, ex: g.ex * cs - g.ey * sn, ey: g.ex * sn + g.ey * cs, ang: g.ang + th }));
  const hor = glyphs.filter((g) => Math.abs(Math.sin(g.ang)) < 0.2 && Math.cos(g.ang) > 0), rot = glyphs.filter((g) => !hor.includes(g));
  hor.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const g of hor) { const l = lines.find((q) => Math.abs(q.y - g.y) <= 0.35 * Math.max(q.size, g.size)); if (l) { l.g.push(g); l.y = (l.y * (l.g.length - 1) + g.y) / l.g.length; l.size = Math.max(l.size, g.size); } else lines.push({ y: g.y, size: g.size, g: [g] }); }
  lines.sort((a, b) => b.y - a.y);
  for (const l of lines) {
    l.g.sort((a, b) => a.x - b.x);
    l.parts = []; let cur = null, prev = null;
    for (const g of l.g) {
      if (prev && Math.abs(g.x - prev.x) < 0.2 * g.size && g.ch === prev.ch && g.ch !== ' ') continue; // fake bold: same glyph printed twice
      const gap = prev ? g.x - prev.ex : 0, sz = Math.max(g.size, 1);
      if (!cur || gap > cellEm * sz) { cur = { x0: g.x, x1: g.ex, text: '' }; l.parts.push(cur); }
      else if (gap > 0.17 * sz && prev.ch !== ' ' && g.ch !== ' ') cur.text += ' ';
      cur.text += g.ch; cur.x1 = Math.max(cur.x1, g.ex); prev = g;
    }
    for (const p of l.parts) p.text = p.text.replace(/\s+$/, '').replace(/^\s+/, '');
    l.parts = l.parts.filter((p) => p.text);
  }
  return { lines: lines.filter((l) => l.parts.length), rotated: rot };
}
export const lineText = (l, layout) => { if (!layout) return l.parts.map((p) => p.text).join(' '); let s = '', x = l.parts[0].x0; for (const p of l.parts) { const gap = p.x0 - x; s += (s ? ' '.repeat(Math.max(1, Math.round(gap / (l.size * 0.5)))) : '') + p.text; x = p.x1; } return s; };
export function detectTables(lines, minRows = 2) {
  const tables = []; let cur = null;
  const flush = () => { if (cur && cur.rows.length >= minRows) tables.push(cur); cur = null; };
  let prevY = null, prevSize = 10;
  for (const l of lines) {
    const multi = l.parts.length >= 2;
    if (multi && cur && prevY - l.y < 3 * Math.max(prevSize, l.size)) cur.rows.push(l);
    else if (multi) { flush(); cur = { rows: [l] }; }
    else flush();
    if (multi) { prevY = l.y; prevSize = l.size; } else prevY = null;
  }
  flush();
  for (const t of tables) { // columns = gaps in the union of cell extents
    const iv = t.rows.flatMap((r) => r.parts.map((p) => [p.x0, p.x1])).sort((a, b) => a[0] - b[0]), cols = [];
    for (const [a, b] of iv) { const last = cols[cols.length - 1]; if (last && a <= last[1] + 2) last[1] = Math.max(last[1], b); else cols.push([a, b]); }
    t.cols = cols;
    t.grid = t.rows.map((r) => { const row = cols.map(() => ''); for (const p of r.parts) { let k = cols.findIndex((c) => p.x0 >= c[0] - 2 && p.x0 <= c[1] + 2); if (k < 0) k = 0; row[k] += (row[k] ? ' ' : '') + p.text; } return row; });
  }
  return tables;
}
const csvCell = (s) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);

// ============================================================ embedded image extraction
const CRCT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRCT[n] = c >>> 0; }
const crc32 = (u) => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRCT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const be32 = (n) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const chunk = (type, data) => { const t = u8s(type), body = concatU([t, data]); return concatU([be32(data.length), body, be32(crc32(body))]); };
// raw = rows each starting with a PNG filter byte
export async function pngFile(w, h, depth, ctype, raw, plte = null) {
  const ihdr = concatU([be32(w), be32(h), Uint8Array.of(depth, ctype, 0, 0, 0)]);
  return concatU([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', ihdr), ...(plte ? [chunk('PLTE', plte)] : []), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))]);
}
function unfilter(raw, rowBytes, bpp, h) { // PNG row filters -> plain rows (no filter byte)
  const out = new Uint8Array(rowBytes * h);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (rowBytes + 1)], src = y * (rowBytes + 1) + 1, dst = y * rowBytes, up = dst - rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[up + x] : 0, c = x >= bpp && y ? out[up + x - bpp] : 0, v = raw[src + x];
      let p = 0;
      if (ft === 1) p = a; else if (ft === 2) p = b; else if (ft === 3) p = (a + b) >> 1; else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = (v + p) & 255;
    }
  }
  return out;
}
const addFilterBytes = (px, rowBytes, h) => { const o = new Uint8Array((rowBytes + 1) * h); for (let y = 0; y < h; y++) o.set(px.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1); return o; };
export async function extractImages(d) {
  await kinds();
  const found = [], seen = new Set(), forms = new Set();
  const grab = async (res, pi, depth) => {
    const xo = d.dict(res?.XObject); if (!xo) return;
    for (const [name, ref] of Object.entries(xo)) {
      const st = d.r(ref); if (!isStream(st)) continue;
      const sub = d.r(st.dict.Subtype)?.n, key = isRef(ref) ? ref.n : st;
      if (sub === 'Image') { if (!seen.has(key)) { seen.add(key); found.push({ st, name, page: pi + 1, num: isRef(ref) ? ref.n : 0 }); } }
      else if (sub === 'Form' && depth < 5 && !forms.has(key)) { forms.add(key); await grab(d.dict(st.dict.Resources), pi, depth + 1); }
    }
  };
  for (let i = 0; i < d.pages.length; i++) await grab(d.dict(d.pages[i].dict.Resources ?? d.pages[i].inh.Resources), i, 0);
  const out = [];
  for (const [k, im] of found.entries()) {
    const { st } = im, dc = st.dict, w = d.num(dc.Width), h = d.num(dc.Height), label = `p${im.page}-${String(k + 1).padStart(2, '0')}`;
    let fl = d.r(dc.Filter); fl = fl == null ? [] : Array.isArray(fl) ? fl.map((x) => d.r(x)?.n) : [fl.n];
    const parms = d.r(dc.DecodeParms), dp = Array.isArray(parms) ? d.dict(parms[parms.length - 1]) : d.dict(parms);
    const rec = { label, page: im.page, w, h, filter: fl.join('+') || 'none' };
    try {
      const last = fl[fl.length - 1];
      let data = st.data;
      for (const f of fl.slice(0, -1)) { if (f === 'FlateDecode') data = await inflate(data); else throw new Error(`filter ${f} before ${last}`); }
      if (last === 'DCTDecode') { rec.ext = 'jpg'; rec.bytes = data; const cs = d.r(dc.ColorSpace); if (isNameV(cs) && cs.n === 'DeviceCMYK') rec.note = 'CMYK JPEG: some viewers show inverted colours'; }
      else if (last === 'JPXDecode') { rec.ext = 'jp2'; rec.bytes = data; }
      else if (last === 'FlateDecode' || last === undefined) {
        if (last) data = await inflate(data);
        const mask = d.r(dc.ImageMask) === true, bpc = mask ? 1 : d.num(dc.BitsPerComponent, 8);
        let cs = d.r(dc.ColorSpace), comps = 1, plte = null, name = isNameV(cs) ? cs.n : '';
        if (Array.isArray(cs)) {
          const n0 = d.r(cs[0])?.n;
          if (n0 === 'ICCBased') comps = d.num(d.dict(cs[1])?.N, 3);
          else if (n0 === 'Indexed' || n0 === 'I') {
            const base = d.r(cs[1]); const bn = isNameV(base) ? base.n : Array.isArray(base) ? d.r(base[0])?.n : '';
            const bc = /RGB/.test(bn) ? 3 : /Gray|G$/.test(bn) ? 1 : Array.isArray(base) && d.r(base[0])?.n === 'ICCBased' ? d.num(d.dict(base[1])?.N, 3) : 0;
            if (bc !== 3 && bc !== 1) throw new Error('indexed palette in an unsupported colour space');
            let tbl = d.r(cs[3]); tbl = isStream(tbl) ? await streamBytes(d, tbl) : tbl?.b; if (!tbl) throw new Error('palette missing');
            const hi = d.num(cs[2]) + 1; plte = new Uint8Array(hi * 3);
            for (let q = 0; q < hi; q++) for (let c = 0; c < 3; c++) plte[q * 3 + c] = bc === 3 ? tbl[q * 3 + c] : tbl[q];
            comps = 1; name = 'Indexed';
          } else if (n0 === 'CalRGB') comps = 3; else if (n0 === 'CalGray') comps = 1; else if (n0 === 'Separation' || n0 === 'DeviceN') { comps = 1; rec.note = 'tint (spot colour) values saved as gray'; } else throw new Error(`colour space ${n0}`);
        } else if (name === 'DeviceRGB') comps = 3; else if (name === 'DeviceCMYK') throw new Error('CMYK pixel data is not converted'); else if (name === 'DeviceGray' || mask) comps = 1; else if (!name) throw new Error('no colour space');
        if (![1, 2, 4, 8, 16].includes(bpc) || (comps === 3 && bpc < 8)) throw new Error(`${bpc} bits per component`);
        const rowBytes = Math.ceil((w * comps * bpc) / 8), pred = dp ? d.num(dp.Predictor, 1) : 1;
        let raw;
        if (pred >= 10) { if (data.length < (rowBytes + 1) * h) throw new Error('image data is shorter than expected'); raw = data.subarray(0, (rowBytes + 1) * h); }
        else if (pred === 1) { if (data.length < rowBytes * h) throw new Error('image data is shorter than expected'); raw = addFilterBytes(data, rowBytes, h); }
        else throw new Error(`predictor ${pred}`);
        let ctype = plte ? 3 : comps === 3 ? 2 : 0, depth = bpc;
        const sm = d.r(dc.SMask);
        if (isStream(sm) && !plte && bpc === 8 && d.num(sm.dict.Width) === w && d.num(sm.dict.Height) === h && d.num(sm.dict.BitsPerComponent, 8) === 8) {
          try {
            let mfl = d.r(sm.dict.Filter); mfl = mfl == null ? [] : Array.isArray(mfl) ? mfl.map((x) => d.r(x)?.n) : [mfl.n];
            if (mfl.length === 1 && mfl[0] === 'FlateDecode' || !mfl.length) {
              let md = mfl.length ? await inflate(sm.data) : sm.data; const mp = d.dict(Array.isArray(d.r(sm.dict.DecodeParms)) ? d.r(sm.dict.DecodeParms)[0] : sm.dict.DecodeParms), mpred = mp ? d.num(mp.Predictor, 1) : 1;
              const mpx = mpred >= 10 ? unfilter(md, w, 1, h) : md, px = pred >= 10 ? unfilter(raw, rowBytes, comps, h) : data;
              const o = new Uint8Array((w * (comps + 1) + 1) * h);
              for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dst = y * (w * (comps + 1) + 1) + 1 + x * (comps + 1); for (let c = 0; c < comps; c++) o[dst + c] = px[y * rowBytes + x * comps + c]; o[dst + comps] = mpx[y * w + x]; }
              raw = o; ctype = comps === 3 ? 6 : 4;
            }
          } catch { rec.note = 'soft mask could not be applied'; }
        } else if (isStream(sm)) rec.note = 'soft mask (transparency) not applied';
        rec.ext = 'png'; rec.bytes = await pngFile(w, h, depth, ctype, raw, plte);
      } else throw new Error(`filter ${last} is not supported`);
    } catch (e) { rec.skip = e.message; }
    out.push(rec);
  }
  return out;
}

// ============================================================ PDF tools
const PF = { accept: 'application/pdf,.pdf', multiple: false };
const pagesOf = async (spec, n, dflt) => { const { parseRanges } = await lib(); return parseRanges(String(spec || '').trim() || dflt || `1-${n}`, n); };
async function imageData(file, maxSide = 1200) {
  let bmp; try { bmp = await createImageBitmap(file); } catch { throw new Error(`${file.name}: cannot decode this image (use PNG, JPEG, WebP or GIF)`); }
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  return x.getImageData(0, 0, c.width, c.height);
}
export function rgbaToImg(id) { // ImageData-like -> { w, h, rgb, alpha|null }
  const n = id.width * id.height, rgb = new Uint8Array(n * 3), a = new Uint8Array(n); let clear = true;
  for (let i = 0; i < n; i++) { rgb[i * 3] = id.data[i * 4]; rgb[i * 3 + 1] = id.data[i * 4 + 1]; rgb[i * 3 + 2] = id.data[i * 4 + 2]; a[i] = id.data[i * 4 + 3]; if (a[i] !== 255) clear = false; }
  return { w: id.width, h: id.height, rgb, alpha: clear ? null : a };
}
const ocrSafe = (s) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/[()\\]/g, '\\$&');

export async function ocrOverlay(bytes, d, todo, dpi, getImage, ocr) {
  const model = await ocr.getModel(), over = new Map(), report = [];
  for (const i of todo) {
    const r = await ocr.ocrImageData(model, await getImage(i), {}), sc = (72 / dpi) / (r.info.scale || 1), inf = d.info(i), lines = [];
    for (const l of r.lines) {
      if (!l.text.trim() || !l.boxes?.length) continue;
      const x0 = Math.min(...l.boxes.map((b) => b.x)), x1 = Math.max(...l.boxes.map((b) => b.x + b.w)), y0 = Math.min(...l.boxes.map((b) => b.y)), y1 = Math.max(...l.boxes.map((b) => b.y + b.h));
      const hpt = (y1 - y0) * sc, size = Math.max(4, hpt * 0.62), s = ocrSafe(l.text.replace(/\t/g, ' ')), est = [...s].reduce((a, ch) => a + (HELV[ch.charCodeAt(0) - 32] ?? 556), 0) / 1000 * size;
      lines.push({ s, x: x0 * sc, y: inf.h - (y0 + (y1 - y0) * 0.8) * sc, size, tz: clamp((100 * (x1 - x0) * sc) / Math.max(est, 1), 25, 400) });
    }
    over.set(i, lines); report.push(`--- page ${i + 1} (${lines.length} lines, confidence ${r.conf.toFixed(0)}%) ---\n${r.text}`);
  }
  const { openPdf, buildPdf } = await lib(), d2 = await openPdf(bytes);
  const out = await buildPdf(d2.pages.map((_, i) => ({ doc: d2, index: i, mod: over.has(i) && over.get(i).length ? (src, inf) => ({ fonts: { FtOcr: 'Helvetica' }, content: `q ${cmStr(minv(pageMatrix(inf)))}\nBT 3 Tr\n${over.get(i).map((l) => `/FtOcr ${fn(l.size)} Tf ${fn(l.tz)} Tz 1 0 0 1 ${fn(l.x)} ${fn(l.y)} Tm (${l.s}) Tj`).join('\n')}\nET Q\n` }) : undefined })), { info: 'first' });
  return { out, report };
}

T.push(
  {
    id: 'pdf-text-extractor', cat: PDFC, title: 'PDF Text Extractor with Layout (Subset Fonts)', inputs: 0, dom: true, file: PF,
    desc: 'Pull the text out of a PDF page by page, including files whose fonts are subset or embedded (Word, Chrome, LaTeX, InDesign), using each font\'s Unicode map. Optional layout mode keeps column gaps. Built-in reader, no pdf.js.',
    opts: [txt('pages', 'Pages (e.g. 1-3,5; blank = all)'), chk('layout', 'Keep gaps between columns with spaces', false), chk('headers', 'Add a "--- page n ---" line before each page', true)],
    run: async (_i, o, files) => {
      const { f, doc: d } = await openFiles(files), idx = await pagesOf(o.pages, d.pages.length), cache = new Map(), parts = []; let empty = 0, unm = 0; const notes = new Set();
      for (const i of idx) {
        const { glyphs, warn } = await pageGlyphs(d, i, cache), { lines, rotated } = buildLines(glyphs);
        unm += warn.unmapped; warn.notes.forEach((x) => notes.add(x));
        let t = lines.map((l) => lineText(l, o.layout)).join('\n');
        if (rotated.length) t += (t ? '\n' : '') + '[' + rotated.length + ' characters of rotated text are not placed in the reading order]';
        if (!t.trim()) empty++;
        parts.push((o.headers ? `--- page ${i + 1} ---\n` : '') + t);
      }
      const text = parts.join('\n\n');
      return { text: `${text}\n\n${idx.length} page(s) read${empty ? `, ${empty} with no text layer (scanned pages need OCR: see the PDF OCR tool)` : ''}${unm ? `, ${unm} glyphs had no Unicode mapping and were skipped` : ''}.${notes.size ? '\n' + [...notes].join('\n') : ''}`, blob: new File([text + '\n'], bname(f) + '.txt', { type: 'text/plain' }), filename: bname(f) + '.txt' };
    },
  },
  {
    id: 'pdf-table-extractor', cat: PDFC, title: 'PDF Table Extractor to CSV', inputs: 0, dom: true, file: PF,
    desc: 'Find tables in the text layer of a PDF and export them as CSV. Rows are lines of text with two or more cells; columns are the vertical gaps in the table. A heuristic, so check the preview.',
    opts: [txt('pages', 'Pages (blank = all)'), num('cell', 'Gap that separates two cells (in font heights)', 1), num('minrows', 'Smallest table (rows)', 2)],
    run: async (_i, o, files) => {
      const { f, doc: d } = await openFiles(files), idx = await pagesOf(o.pages, d.pages.length), cache = new Map(), csvs = [], rep = [];
      for (const i of idx) {
        const { glyphs } = await pageGlyphs(d, i, cache), { lines } = buildLines(glyphs, clamp(N_(o.cell, 1), 0.3, 5)), tabs = detectTables(lines, clamp(Math.round(N_(o.minrows, 2)), 2, 50));
        tabs.forEach((t, k) => {
          const csv = t.grid.map((r) => r.map(csvCell).join(',')).join('\n');
          csvs.push(new File([csv + '\n'], `${bname(f)}-p${i + 1}-table${k + 1}.csv`, { type: 'text/csv' }));
          rep.push(`Page ${i + 1}, table ${k + 1}: ${t.grid.length} rows x ${t.cols.length} columns\n${csv.split('\n').slice(0, 8).join('\n')}${t.grid.length > 8 ? '\n...' : ''}`);
        });
      }
      if (!csvs.length) throw new Error('No table found in the text layer. Tables need at least two rows with two or more cells separated by a visible gap. Scanned pages have no text layer (use PDF OCR first), and ruled tables with tightly packed cells may need a larger or smaller "gap" setting.');
      return { text: rep.join('\n\n') + '\n\nDetected from text positions only: ruling lines are ignored, wrapped cells become separate rows, and a heading that spans several columns can merge them. Check the CSV before using it.', blob: csvs };
    },
  },
  {
    id: 'pdf-ocr-searchable', cat: PDFC, title: 'PDF OCR: Make a Scanned PDF Searchable', inputs: 0, dom: true, file: PF,
    desc: 'Recognise the text on scanned PDF pages with the built-in English OCR and add it as an invisible text layer, so you can search and copy from the file. Original pages are kept as they are.',
    opts: [txt('pages', 'Pages (blank = all)'), num('dpi', 'Scan resolution used for recognition (DPI)', 200), chk('skip', 'Skip pages that already have a text layer', true)],
    run: async (_i, o, files) => {
      const { f, bytes, doc: d } = await openFiles(files), N = d.pages.length, idx = await pagesOf(o.pages, N);
      if (idx.length > 60) throw new Error('At most 60 pages per run (OCR is slow); use the page range');
      const cache = new Map(), todo = [];
      for (const i of idx) { if (o.skip) { const g = await pageGlyphs(d, i, cache).catch(() => ({ glyphs: [] })); if (g.glyphs.filter((x) => x.ch.trim()).length > 20) continue; } todo.push(i); }
      if (!todo.length) throw new Error('Every selected page already has a text layer. Untick "Skip pages that already have a text layer" to run OCR anyway.');
      const [{ renderPdfPages }, ocr] = await Promise.all([import('./pdfrender.js'), import('./ocr.js')]), dpi = clamp(N_(o.dpi, 200), 100, 400);
      const getImage = async (i) => { const { pages } = await renderPdfPages(d, [i], { dpi, background: '#ffffff', annots: true }), cv = pages[0].canvas; return cv.getContext('2d').getImageData(0, 0, cv.width, cv.height); };
      const { out, report } = await ocrOverlay(bytes, d, todo, dpi, getImage, ocr);
      return pdfOut(out, bname(f) + '-searchable.pdf', `${report.join('\n\n')}\n\nOCR text added as an invisible layer on ${todo.length} page(s); the page images and any existing content are untouched. The recogniser reads printed English text only; accuracy depends on scan quality. Each line is placed from its recognised position, so selecting text highlights roughly the right area, not exact words.`);
    },
  },
  {
    id: 'pdf-image-extractor', cat: PDFC, title: 'PDF Image Extractor', inputs: 0, dom: true, file: PF,
    desc: 'Save the images embedded in a PDF as separate files: JPEG images are copied untouched, others are written as PNG (with transparency when the PDF has a soft mask). Lists what could not be extracted.',
    opts: [num('min', 'Skip images smaller than this many pixels on a side', 16)],
    run: async (_i, o, files) => {
      const { f, doc: d } = await openFiles(files), all = await extractImages(d), min = N_(o.min, 0), out = [], lines = [];
      for (const r of all) {
        const tiny = r.w < min && r.h < min;
        if (r.skip) lines.push(`page ${r.page}  #${r.label}  ${r.w}x${r.h}  ${r.filter}: not extracted (${r.skip})`);
        else if (tiny) lines.push(`page ${r.page}  #${r.label}  ${r.w}x${r.h}: skipped (below the minimum size)`);
        else { out.push(new File([r.bytes], `${bname(f)}-${r.label}.${r.ext}`, { type: { jpg: 'image/jpeg', png: 'image/png', jp2: 'image/jp2' }[r.ext] })); lines.push(`page ${r.page}  ${bname(f)}-${r.label}.${r.ext}  ${r.w}x${r.h}  ${r.filter}${r.note ? ' (' + r.note + ')' : ''}  ${(r.bytes.length / 1024).toFixed(1)} KB`); }
      }
      if (!all.length) throw new Error('No embedded images found. If the pages look like pictures, they may be drawn as vector graphics: use PDF to Image instead.');
      return { text: `${out.length} of ${all.length} image(s) saved\n\n${lines.join('\n')}\n\nJPEG is copied byte for byte, other 8/16-bit gray, RGB and indexed images become PNG. Not handled: CMYK pixel data, JBIG2, CCITT and LZW images, TIFF-predictor images. Images drawn as inline images inside page content are not listed.`, blob: out };
    },
  },
  {
    id: 'pdf-n-up', cat: PDFC, title: 'PDF N-Up Printer (Several Pages per Sheet)', inputs: 0, dom: true, file: PF,
    desc: 'Place 2, 4, 6, 8, 9, 12 or 16 pages of a PDF on each sheet for handouts and proofs. Choose sheet size, orientation, margins, gaps and a border. Pages stay vector (no rasterising).',
    opts: [sel('n', 'Pages per sheet', ['2', '4', '6', '8', '9', '12', '16'], '4'), sel('size', 'Sheet size', ['A4', 'Letter', 'A3', 'Legal'], 'A4'), sel('orient', 'Orientation', ['auto', 'portrait', 'landscape'], 'auto'), sel('order', 'Reading order', ['left to right, then down', 'top to bottom, then right'], 'left to right, then down'), num('margin', 'Margin (points)', 18), num('gap', 'Gap between pages (points)', 8), chk('border', 'Draw a thin border around each page', true)],
    run: async (_i, o, files) => {
      const { f, bytes, doc: d } = await openFiles(files), n = +o.n, N = d.pages.length, [c0, r0] = cellGrid(n), sz = SIZES[o.size] || SIZES.A4;
      const inf0 = d.info(0), mg = N_(o.margin, 18), fit = (cols, rows, sw, sh) => Math.min(((sw - 2 * mg) / cols) / inf0.w, ((sh - 2 * mg) / rows) / inf0.h);
      const cand = [{ cols: c0, rows: r0, sw: sz[0], sh: sz[1] }, { cols: r0, rows: c0, sw: sz[0], sh: sz[1] }, { cols: c0, rows: r0, sw: sz[1], sh: sz[0] }, { cols: r0, rows: c0, sw: sz[1], sh: sz[0] }];
      const pool = o.orient === 'auto' ? cand : cand.filter((c) => c.sw > c.sh === (o.orient === 'landscape')), pick = pool.reduce((a, b) => (fit(b.cols, b.rows, b.sw, b.sh) > fit(a.cols, a.rows, a.sw, a.sh) ? b : a));
      const per = n, sheets = [];
      for (let s = 0; s < N; s += per) { const cells = []; for (let k = 0; k < per; k++) { const idx = s + k; cells.push(idx < N ? idx : -1); } sheets.push(cells); }
      if (o.order.startsWith('top')) sheets.forEach((cells, si) => { const t = new Array(per).fill(-1); for (let k = 0; k < per; k++) { const c = Math.floor(k / pick.rows), r = k % pick.rows; t[r * pick.cols + c] = cells[k]; } sheets[si] = t; });
      const out = await impose(bytes, sheets, () => ({ ...pick, margin: clamp(N_(o.margin, 18), 0, 100), gap: clamp(N_(o.gap, 8), 0, 100), border: !!o.border }));
      return pdfOut(out, bname(f) + `-${n}up.pdf`, `${N} page(s) -> ${sheets.length} sheet(s) of ${pick.cols} x ${pick.rows} pages on ${o.size} ${pick.sw > pick.sh ? 'landscape' : 'portrait'}.\nEach page is scaled to fit its cell (${(100 * Math.min(((pick.sw - 2 * N_(o.margin, 18) - (pick.cols - 1) * N_(o.gap, 8)) / pick.cols) / inf0.w, ((pick.sh - 2 * N_(o.margin, 18) - (pick.rows - 1) * N_(o.gap, 8)) / pick.rows) / inf0.h)).toFixed(0)}% of the size of page 1). Links, form fields, bookmarks and annotations are not carried over.`);
    },
  },
  {
    id: 'pdf-booklet-maker', cat: PDFC, title: 'PDF Booklet Maker (Saddle-Stitch Order)', inputs: 0, dom: true, file: PF,
    desc: 'Reorder and place the pages of a PDF two per sheet in saddle-stitch order, so printing double-sided on the short edge, folding and stapling gives a booklet. Pads to a multiple of 4 pages with blanks.',
    opts: [sel('size', 'Sheet size (landscape)', ['A4', 'Letter', 'A3', 'Legal', 'twice the first page'], 'A4'), sel('bind', 'Binding', ['left (most languages)', 'right (right-to-left languages)'], 'left (most languages)'), num('margin', 'Margin (points)', 12), chk('border', 'Draw a thin fold guide around each page', false)],
    run: async (_i, o, files) => {
      const { f, bytes, doc: d } = await openFiles(files), N = d.pages.length, tot = Math.ceil(N / 4) * 4, sheets = [], pg = (k) => (k < N ? k : -1), rtl = o.bind.startsWith('right');
      for (let s = 0; s < tot / 4; s++) { const A = [pg(tot - 1 - 2 * s), pg(2 * s)], B = [pg(2 * s + 1), pg(tot - 2 - 2 * s)]; sheets.push(rtl ? A.reverse() : A, rtl ? B.reverse() : B); }
      const inf0 = d.info(0), sz = SIZES[o.size] ? [Math.max(...SIZES[o.size]), Math.min(...SIZES[o.size])] : [inf0.w * 2, inf0.h];
      const out = await impose(bytes, sheets, () => ({ cols: 2, rows: 1, sw: sz[0], sh: sz[1], margin: clamp(N_(o.margin, 12), 0, 100), gap: 0, border: !!o.border }));
      return pdfOut(out, bname(f) + '-booklet.pdf', `${N} page(s)${tot > N ? ` + ${tot - N} blank` : ''} -> ${sheets.length} sides (${sheets.length / 2} sheets).\nPrint double-sided, flip on the SHORT edge, fold the stack in half and staple. Page order per side: ${sheets.slice(0, 4).map((s) => s.map((k) => (k < 0 ? 'blank' : k + 1)).join(' | ')).join('; ')}${sheets.length > 4 ? '; ...' : ''}.\nLinks, form fields, bookmarks and annotations are not carried over.`);
    },
  },
  {
    id: 'pdf-bookmark-editor', cat: PDFC, title: 'PDF Bookmark Editor (Outline)', inputs: 1, labels: ['Bookmarks, one per line: Title | page (indent 2 spaces per level; empty = show the current ones)'], placeholder: ['Introduction | 1\n  Background | 2\nMethods | 5'], dom: true, file: PF,
    desc: 'Read the bookmarks (outline) of a PDF as editable text, or write a new outline from lines like "Chapter 1 | 3" with indentation for sub-levels, and save the PDF with working bookmarks.',
    run: async (inputs, _o, files) => {
      const { f, bytes, doc: d } = await openFiles(files), text = (inputs[0] || '').trim();
      if (!text) { const r = await readOutline(bytes); return { text: r.items.length ? `${r.items.length} bookmark(s) in ${f.name} (${r.pages} pages). Copy this into the box, edit it and run again:\n\n${outlineToText(r.items)}` : `${f.name} has no bookmarks (${r.pages} pages). Type lines such as "Chapter 1 | 1" in the box.` }; }
      const items = parseOutlineText(text, d.pages.length), { buildPdf } = await lib();
      const base = await buildPdf(d.pages.map((_, i) => ({ doc: d, index: i })), { info: 'first', xmp: true }), out = await addOutline(base, items);
      return pdfOut(out, bname(f) + '-bookmarked.pdf', `${items.length} bookmark(s) written (${Math.max(...items.map((i) => i.lvl)) + 1} level(s)).\nAs with the other page tools here, the file is rewritten: form fields, old bookmarks, named destinations, tagged structure and JavaScript are dropped. Bookmarks open each page at its current zoom.`);
    },
  },
  {
    id: 'pdf-flattener', cat: PDFC, title: 'PDF Flattener (Annotations and Form Fields)', inputs: 0, dom: true, file: PF,
    desc: 'Burn comments, highlights, stamps and filled form fields into the page content so they can no longer be edited or hidden. Optionally keeps links. Uses the appearance streams already in the file.',
    opts: [chk('links', 'Keep clickable links', true)],
    run: async (_i, o, files) => {
      const { f, bytes } = await openFiles(files), r = await flattenPdf(bytes, { keepLinks: !!o.links });
      if (!r.flat && !r.noAp && !r.dropped) throw new Error('There are no annotations or form fields to flatten in this file.');
      return pdfOut(r.bytes, bname(f) + '-flat.pdf', `${r.flat} annotation(s) and form field(s) drawn into the pages.${r.noAp ? `\n${r.noAp} had no appearance stream (typically form fields from a file that relies on the viewer to draw them, or empty fields) and were removed. Open the file in the Fill PDF Form Fields tool first so the values get an appearance.` : ''}${r.dropped ? `\n${r.dropped} hidden annotation(s) were removed.` : ''}\nThe form definition is removed, so the fields are no longer fillable. Bookmarks and tagged structure are dropped, as with the other page tools.`);
    },
  },
  {
    id: 'pdf-grayscale', cat: PDFC, title: 'PDF Grayscale Converter', inputs: 0, dom: true, file: PF,
    desc: 'Make a colour PDF print in gray. Each page gets a gray layer in the Saturation blend mode, so text and vector art stay sharp and selectable. The file size does not shrink.',
    run: async (_i, _o, files) => {
      const { f, bytes, doc: d } = await openFiles(files), out = await grayscalePdf(bytes);
      return pdfOut(out, bname(f) + '-gray.pdf', `${d.pages.length} page(s) set to grayscale.\nHow it works: every page is followed by a full-page gray rectangle drawn with the Saturation blend mode, which removes colour but keeps brightness. Viewers and printers that support PDF transparency show the page in gray; very old RIPs and some print workflows that flatten transparency may ignore it. The colour data is still inside the file (use your printer's own gray setting for print jobs that must be strictly black and white), and the size is the same as the original.`);
    },
  },
  {
    id: 'pdf-blank-page-inserter', cat: PDFC, title: 'PDF Blank Page Inserter', inputs: 0, dom: true, file: PF,
    desc: 'Insert blank or separator pages at chosen positions in a PDF, for example after pages 2 and 5, or at the start. Each blank page takes the size of the page before it.',
    opts: [txt('after', 'Insert after page(s) (0 = at the start), e.g. 0, 2, 5', '1'), num('count', 'Blank pages at each position', 1), txt('note', 'Optional line of text on each blank page', '')],
    run: async (_i, o, files) => {
      const { f, bytes, doc: d } = await openFiles(files), after = String(o.after || '').split(/[,;\s]+/).filter(Boolean).map((x) => { if (!/^\d+$/.test(x)) throw new Error(`"${x}" is not a page number`); return +x; });
      if (!after.length) throw new Error('Enter at least one page number, for example 2, 5');
      const cnt = clamp(Math.round(N_(o.count, 1)), 1, 20), out = await insertBlanks(bytes, after, cnt, String(o.note || '').slice(0, 80));
      return pdfOut(out, bname(f) + '-blanks.pdf', `${after.length * cnt} blank page(s) inserted: ${d.pages.length} -> ${d.pages.length + after.length * cnt} pages.\nA page number repeated in the list adds the blank pages again. Bookmarks, form fields and links are not carried over.`);
    },
  },
  {
    id: 'pdf-image-watermark', cat: PDFC, title: 'PDF Image Watermark and Stamp', inputs: 0, dom: true, file: { accept: 'application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp', multiple: true },
    desc: 'Stamp a logo or image on the pages of a PDF: choose one PDF and one PNG, JPEG or WebP file together. Set position, size, opacity and angle, or tile it across the page. PNG transparency is kept.',
    opts: [sel('pos', 'Position', ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'tiled (3 x 3)'], 'center'), num('width', 'Image width (% of page width)', 40), num('opacity', 'Opacity (%)', 30), num('angle', 'Angle (degrees, counter-clockwise)', 0), num('margin', 'Margin from the edge (% of page width)', 5), txt('pages', 'Pages (blank = all)')],
    run: async (_i, o, files) => {
      const { f, bytes, doc: d } = await openFiles(files, 'a PDF file and an image file (select both together)'), imf = [...files].find((x) => /^image\//.test(x.type) || /\.(png|jpe?g|webp)$/i.test(x.name));
      if (!imf) throw new Error('Also select an image (PNG, JPEG or WebP) together with the PDF');
      const img = rgbaToImg(await imageData(imf)), idx = await pagesOf(o.pages, d.pages.length), wf = clamp(N_(o.width, 40), 2, 100) / 100, m = clamp(N_(o.margin, 5), 0, 40) / 100, op = clamp(N_(o.opacity, 30), 1, 100) / 100, items = [];
      for (const i of idx) {
        const inf = d.info(i), h = (wf * inf.w * img.h) / img.w / inf.h, ph = (m * inf.w) / inf.h + h / 2, pw = m + wf / 2;
        const spots = { center: [[0.5, 0.5]], 'top-left': [[pw, 1 - ph]], 'top-right': [[1 - pw, 1 - ph]], 'bottom-left': [[pw, ph]], 'bottom-right': [[1 - pw, ph]] }[o.pos] || [[1 / 6, 1 / 6], [0.5, 1 / 6], [5 / 6, 1 / 6], [1 / 6, 0.5], [0.5, 0.5], [5 / 6, 0.5], [1 / 6, 5 / 6], [0.5, 5 / 6], [5 / 6, 5 / 6]];
        const w = o.pos.startsWith('tiled') ? Math.min(wf, 0.28) : wf;
        for (const [cx, cy] of spots) items.push({ page: i, cx, cy, width: w, angle: N_(o.angle, 0), opacity: op });
      }
      const out = await overlayImages(bytes, img, items);
      return pdfOut(out, bname(f) + '-stamped.pdf', `${imf.name} placed ${items.length} time(s) on ${idx.length} page(s), ${o.pos}, ${Math.round(wf * 100)}% wide, ${Math.round(op * 100)}% opaque.\nThe image is drawn on top of the page content and downsized to at most 1200 px. The file is rewritten, so form fields, bookmarks and named destinations are dropped (use the form filler first if you need them filled).`);
    },
  },
  {
    id: 'pdf-signer', cat: PDFC, title: 'PDF Signer (Draw or Type a Signature)', custom: true,
    desc: 'Draw or type your signature, place it on a PDF page with a live preview, and save the signed copy. This adds a picture of your signature, not a cryptographic digital signature.',
    render: (root) => {
      let pdf = null, preview = null, sig = null, drawing = false, busy = 0;
      const st = { page: 1, x: 70, y: 18, w: 28 };
      const status = el('p', { role: 'status', style: 'min-height:1.5em' });
      const fileIn = el('input', { type: 'file', id: 'sg-pdf', accept: 'application/pdf,.pdf' });
      const pageIn = el('input', { type: 'number', id: 'sg-page', min: 1, value: 1, style: 'width:5em' });
      const xIn = el('input', { type: 'number', id: 'sg-x', min: 0, max: 100, value: st.x, style: 'width:5em' }), yIn = el('input', { type: 'number', id: 'sg-y', min: 0, max: 100, value: st.y, style: 'width:5em' }), wIn = el('input', { type: 'number', id: 'sg-w', min: 5, max: 90, value: st.w, style: 'width:5em' });
      const pad = el('canvas', { width: 480, height: 160, role: 'img', 'aria-label': 'Signature pad, empty. Draw with a mouse, pen or finger, or use the typed name option instead.', style: 'border:1px solid currentColor;touch-action:none;max-width:100%;background:#fff;cursor:crosshair' });
      const typed = el('input', { type: 'text', id: 'sg-typed', placeholder: 'Your name', style: 'width:14em' }), face = el('select', { id: 'sg-font' }, ...[['Cursive', 'cursive'], ['Serif italic', 'italic serif'], ['Sans italic', 'italic sans-serif']].map(([n, v]) => el('option', { value: v }, n)));
      const color = el('input', { type: 'color', id: 'sg-color', value: '#10246b' });
      const upload = el('input', { type: 'file', id: 'sg-img', accept: 'image/png,image/jpeg,image/webp' });
      const view = el('canvas', { width: 10, height: 10, role: 'img', 'aria-label': 'Choose a PDF to see a page preview', style: 'max-width:100%;border:1px solid currentColor;cursor:crosshair' });
      const px = pad.getContext('2d');
      const padInk = () => { try { const d = px.getImageData(0, 0, pad.width, pad.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; } catch { /* none */ } return false; };
      const clearPad = () => { px.clearRect(0, 0, pad.width, pad.height); sig = null; pad.setAttribute('aria-label', 'Signature pad, empty. Draw with a mouse, pen or finger, or use the typed name option instead.'); redraw(); };
      const pos = (e) => { const r = pad.getBoundingClientRect(); return [((e.clientX - r.left) * pad.width) / r.width, ((e.clientY - r.top) * pad.height) / r.height]; };
      pad.addEventListener('pointerdown', (e) => { drawing = true; pad.setPointerCapture(e.pointerId); const [x, y] = pos(e); px.strokeStyle = color.value; px.lineWidth = 3; px.lineCap = px.lineJoin = 'round'; px.beginPath(); px.moveTo(x, y); px.lineTo(x + 0.1, y + 0.1); px.stroke(); });
      pad.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pos(e); px.lineTo(x, y); px.stroke(); });
      const end = () => { if (drawing) { drawing = false; takeSig(); } };
      pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
      function takeSig() { // crop to ink
        const w = pad.width, h = pad.height, d = px.getImageData(0, 0, w, h); let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d.data[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) { sig = null; return; }
        const c = document.createElement('canvas'); c.width = x1 - x0 + 1; c.height = y1 - y0 + 1; c.getContext('2d').drawImage(pad, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
        sig = c; pad.setAttribute('aria-label', 'Signature pad, signature drawn'); redraw();
      }
      const useTyped = () => {
        const t = typed.value.trim(); if (!t) { status.textContent = 'Type your name first.'; return; }
        px.clearRect(0, 0, pad.width, pad.height); px.fillStyle = color.value; px.font = `64px ${face.value}`; px.textBaseline = 'middle'; px.textAlign = 'center';
        let s = 64; while (px.measureText(t).width > pad.width - 20 && s > 12) { s -= 4; px.font = `${s}px ${face.value}`; } px.fillText(t, pad.width / 2, pad.height / 2); takeSig(); status.textContent = 'Typed signature ready.';
      };
      upload.onchange = async () => { const f = upload.files[0]; if (!f) return; try { const id = await imageData(f, 800), c = document.createElement('canvas'); c.width = id.width; c.height = id.height; c.getContext('2d').putImageData(id, 0, 0); sig = c; status.textContent = 'Signature image loaded.'; redraw(); } catch (e) { status.textContent = e.message; } };
      const loadPage = async () => {
        if (!pdf) return; const my = ++busy;
        try {
          const { renderPdfPages } = await import('./pdfrender.js'), n = clamp(Math.round(+pageIn.value) || 1, 1, pdf.doc.pages.length), r = await renderPdfPages(pdf.doc, [n - 1], { dpi: 70, background: '#ffffff', annots: true });
          if (my !== busy) return; preview = r.pages[0].canvas; view.width = preview.width; view.height = preview.height; redraw();
        } catch (e) { status.textContent = 'Preview failed: ' + e.message; }
      };
      function redraw() {
        const x = view.getContext('2d'); if (!preview) return; x.clearRect(0, 0, view.width, view.height); x.drawImage(preview, 0, 0);
        if (sig) { const w = (clamp(+wIn.value || 28, 5, 90) / 100) * view.width, h = (w * sig.height) / sig.width, cx = (clamp(+xIn.value, 0, 100) / 100) * view.width, cy = (1 - clamp(+yIn.value, 0, 100) / 100) * view.height; x.drawImage(sig, cx - w / 2, cy - h / 2, w, h); x.strokeStyle = '#d33'; x.setLineDash([4, 3]); x.strokeRect(cx - w / 2, cy - h / 2, w, h); x.setLineDash([]); }
        view.setAttribute('aria-label', `Page ${pageIn.value} preview${sig ? `, signature centred at ${xIn.value}% from the left and ${yIn.value}% from the bottom` : ''}`);
      }
      view.addEventListener('click', (e) => { const r = view.getBoundingClientRect(); xIn.value = Math.round(((e.clientX - r.left) / r.width) * 100); yIn.value = Math.round((1 - (e.clientY - r.top) / r.height) * 100); redraw(); });
      for (const i of [xIn, yIn, wIn]) i.oninput = redraw;
      pageIn.onchange = loadPage;
      fileIn.onchange = async () => {
        const f = fileIn.files[0]; if (!f) return; status.textContent = 'Reading the PDF...';
        try { pdf = await openFiles([f]); pageIn.max = pdf.doc.pages.length; pageIn.value = 1; status.textContent = `${f.name}: ${pdf.doc.pages.length} page(s).`; await loadPage(); } catch (e) { pdf = null; status.className = 'err'; status.textContent = e.message; return; } status.className = '';
      };
      const go = el('button', { type: 'button', onclick: async () => {
        try {
          if (!pdf) throw new Error('Choose a PDF first'); if (!sig) throw new Error('Draw, type or load a signature first');
          const c = document.createElement('canvas'); const k = Math.min(1, 700 / sig.width); c.width = Math.round(sig.width * k); c.height = Math.round(sig.height * k); c.getContext('2d').drawImage(sig, 0, 0, c.width, c.height);
          const img = rgbaToImg(c.getContext('2d').getImageData(0, 0, c.width, c.height)), n = clamp(Math.round(+pageIn.value) || 1, 1, pdf.doc.pages.length);
          const out = await overlayImages(pdf.bytes, img, [{ page: n - 1, cx: clamp(+xIn.value, 0, 100) / 100, cy: clamp(+yIn.value, 0, 100) / 100, width: clamp(+wIn.value || 28, 5, 90) / 100, angle: 0, opacity: 1 }]);
          const a = el('a', { href: URL.createObjectURL(new Blob([out], { type: 'application/pdf' })), download: bname(pdf.f) + '-signed.pdf' }); document.body.append(a); a.click(); a.remove();
          status.className = ''; status.textContent = `Saved ${bname(pdf.f)}-signed.pdf with the signature on page ${n}.`;
        } catch (e) { status.className = 'err'; status.textContent = e.message; }
      } }, 'Sign and download');
      root.append(
        el('p', {}, lab('1. PDF file', fileIn), lab('Page', pageIn)),
        el('fieldset', {}, el('legend', {}, '2. Your signature'), el('p', {}, lab('Ink colour', color)), pad, el('p', {}, el('button', { type: 'button', onclick: clearPad }, 'Clear the pad'), ' ', lab('or type a name', typed), lab('Style', face), el('button', { type: 'button', onclick: useTyped }, 'Use the typed name'), ' ', lab('or a signature image', upload))),
        el('fieldset', {}, el('legend', {}, '3. Place it (click the preview, or type the numbers)'), el('p', {}, lab('Centre, % from the left', xIn), lab('Centre, % from the bottom', yIn), lab('Width, % of the page', wIn))),
        view, el('p', {}, go), status,
        el('p', { className: 'muted' }, 'The signature is placed as an image on top of the page. It shows your handwriting but proves nothing cryptographically; some contracts need a qualified electronic signature instead. The file is rewritten, so form fields and bookmarks are dropped. Nothing leaves your browser.'));
    },
  },
);

export default T;

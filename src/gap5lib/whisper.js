// whisper.js (gap5): speech to text with OpenAI Whisper tiny.en (39M parameters, English), hand-written JS forward pass. Zero dependencies.
// Weights: openai/whisper-tiny.en repacked to int8 (fp16 scale per 64 inputs) by scripts/pack-gap5-whisper.py (43 MB, data/whisper-tiny-en.bin).
// Pipeline: 16 kHz mono PCM -> 30 s log-mel (80 bins, the Hugging Face WhisperFeatureExtractor recipe) -> 4-layer encoder -> greedy decoder (no timestamps)
// with the suppress-token lists of the official generation config. Verified against transformers/PyTorch in test/gap5-whisper.mjs.
// Ceilings: English only; audio is processed in 30 s windows that are cut at fixed positions (words at a cut can be split or repeated); no timestamps,
// no beam search, no temperature fallback; int8 weights change a few tokens on hard audio; single thread (a 30 s window takes seconds to a minute);
// like every Whisper model it can invent text on silence or music ("hallucination").
const BIN = '../../data/whisper-tiny-en.bin', VOCAB = '../../data/whisper-tiny-en-vocab.json';
export const SR = 16000, N_SAMPLES = 480000, N_FRAMES = 3000;
const f16 = (u) => { const e = (u >> 10) & 31, m = u & 1023, s = u & 0x8000 ? -1 : 1; return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15); };
export function loadModel(buf) {
  if (String.fromCharCode(...buf.subarray(0, 4)) !== 'WHP1') throw new Error('Not a Whisper model file');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), hl = dv.getUint32(4, true), H = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + hl))), base = buf.byteOffset + 8 + hl, T = {};
  for (const t of H.tensors) {
    const n = t.s.reduce((a, b) => a * b, 1), o = base + t.o;
    if (t.t === 'f') { const a = new Float32Array(n), d = new DataView(buf.buffer, o, n * 4); for (let i = 0; i < n; i++) a[i] = d.getFloat32(i * 4, true); T[t.n] = a; }
    else { const ns = n / H.group, sc = new Float32Array(ns), sdv = new DataView(buf.buffer, o + n, ns * 2); for (let i = 0; i < ns; i++) sc[i] = f16(sdv.getUint16(i * 2, true)); T[t.n] = { q: new Int8Array(buf.buffer, o, n), sc, rows: t.s[0], cols: t.s[1] }; }
  }
  return { H, T };
}
// ---------------------------------------------------------------- features
export function logMel(pcm, M) {
  const x = new Float32Array(N_SAMPLES); x.set(pcm.length > N_SAMPLES ? pcm.subarray(0, N_SAMPLES) : pcm);
  const P = 200, padded = new Float32Array(N_SAMPLES + 2 * P);
  padded.set(x, P); for (let i = 0; i < P; i++) { padded[P - 1 - i] = x[i + 1]; padded[P + N_SAMPLES + i] = x[N_SAMPLES - 2 - i]; } // reflect padding
  const win = new Float32Array(400); for (let i = 0; i < 400; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 400);
  const cs = new Float32Array(201 * 400), sn = new Float32Array(201 * 400);
  for (let k = 0; k < 201; k++) for (let n = 0; n < 400; n++) { const a = (2 * Math.PI * k * n) / 400; cs[k * 400 + n] = Math.cos(a); sn[k * 400 + n] = Math.sin(a); }
  const spec = new Float32Array(201 * N_FRAMES), fr = new Float32Array(400);
  for (let t = 0; t < N_FRAMES; t++) {
    let any = false; for (let n = 0; n < 400; n++) { fr[n] = padded[t * 160 + n] * win[n]; if (fr[n] !== 0) any = true; }
    if (!any) continue;
    for (let k = 0; k < 201; k++) { let re = 0, im = 0; const o = k * 400; for (let n = 0; n < 400; n++) { re += fr[n] * cs[o + n]; im -= fr[n] * sn[o + n]; } spec[k * N_FRAMES + t] = re * re + im * im; }
  }
  const mel = new Float32Array(80 * N_FRAMES), F = M.T.mel_filters; let mx = -Infinity;
  for (let m = 0; m < 80; m++) for (let k = 0; k < 201; k++) { const w = F[m * 201 + k]; if (w === 0) continue; const so = k * N_FRAMES, mo = m * N_FRAMES; for (let t = 0; t < N_FRAMES; t++) mel[mo + t] += w * spec[so + t]; }
  for (let i = 0; i < mel.length; i++) { const v = Math.log10(Math.max(mel[i], 1e-10)); mel[i] = v; if (v > mx) mx = v; }
  for (let i = 0; i < mel.length; i++) mel[i] = (Math.max(mel[i], mx - 8) + 4) / 4;
  return mel;
}
// ---------------------------------------------------------------- transformer pieces
let last = 0;
const tick = async () => { if (typeof performance !== 'undefined' && performance.now() - last < 30) return; await new Promise((r) => setTimeout(r, 0)); last = typeof performance !== 'undefined' ? performance.now() : 0; };
async function linear(x, n, W, b, G) { // y[t][o] = b[o] + W[o] . x[t]
  const { q, sc, rows, cols } = W, y = new Float32Array(n * rows), wr = new Float32Array(cols), ng = cols / G;
  for (let o = 0; o < rows; o++) {
    const qo = o * cols, so = o * ng;
    for (let g = 0; g < ng; g++) { const s = sc[so + g], k0 = g * G; for (let k = k0; k < k0 + G; k++) wr[k] = q[qo + k] * s; }
    const bo = b ? b[o] : 0;
    for (let t = 0; t < n; t++) { const xo = t * cols; let a = 0; for (let k = 0; k < cols; k++) a += wr[k] * x[xo + k]; y[t * rows + o] = a + bo; }
    if (n > 1 && (o & 15) === 15) await tick();
  }
  return y;
}
const ln = (x, n, d, w, b) => { const y = new Float32Array(x.length); for (let t = 0; t < n; t++) { const o = t * d; let m = 0; for (let i = 0; i < d; i++) m += x[o + i]; m /= d; let v = 0; for (let i = 0; i < d; i++) { const z = x[o + i] - m; v += z * z; } const r = 1 / Math.sqrt(v / d + 1e-5); for (let i = 0; i < d; i++) y[o + i] = (x[o + i] - m) * r * w[i] + b[i]; } return y; };
const erf = (x) => { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
const gelu = (v) => 0.5 * v * (1 + erf(v * Math.SQRT1_2));
/** q:[nq,d] k,v:[nk,d] -> [nq,d]; causal masks keys with index > (query index + offset) */
function attend(q, k, v, nq, nk, d, nh, causalOffset) {
  const hd = d / nh, out = new Float32Array(nq * d), sc = new Float32Array(nk), scale = 1 / Math.sqrt(hd);
  for (let h = 0; h < nh; h++) for (let i = 0; i < nq; i++) {
    const lim = causalOffset == null ? nk : Math.min(nk, i + causalOffset + 1), qo = i * d + h * hd; let mx = -Infinity;
    for (let j = 0; j < lim; j++) { const ko = j * d + h * hd; let a = 0; for (let c = 0; c < hd; c++) a += q[qo + c] * k[ko + c]; a *= scale; sc[j] = a; if (a > mx) mx = a; }
    let sum = 0; for (let j = 0; j < lim; j++) { sc[j] = Math.exp(sc[j] - mx); sum += sc[j]; }
    for (let j = 0; j < lim; j++) { const w = sc[j] / sum, vo = j * d + h * hd; for (let c = 0; c < hd; c++) out[qo + c] += w * v[vo + c]; }
  }
  return out;
}
function conv1d(x, cin, len, w, b, cout, stride) { // k=3, pad=1; x:[cin,len] -> [cout,lenOut]
  const lo = Math.floor((len + 2 - 3) / stride) + 1, y = new Float32Array(cout * lo);
  for (let co = 0; co < cout; co++) {
    const yo = co * lo; y.fill(b[co], yo, yo + lo);
    for (let ci = 0; ci < cin; ci++) for (let k = 0; k < 3; k++) { const wv = w[(co * cin + ci) * 3 + k]; if (wv === 0) continue; const xo = ci * len; for (let t = 0; t < lo; t++) { const p = t * stride + k - 1; if (p >= 0 && p < len) y[yo + t] += wv * x[xo + p]; } }
  }
  return [y, lo];
}
export async function encode(M, mel, onProgress) {
  const { H, T } = M, d = H.dim, G = H.group, E = 'model.encoder.';
  let [h1, l1] = conv1d(mel, H.n_mels, N_FRAMES, T[E + 'conv1.weight'], T[E + 'conv1.bias'], d, 1); for (let i = 0; i < h1.length; i++) h1[i] = gelu(h1[i]);
  await tick();
  let [h2, l2] = conv1d(h1, d, l1, T[E + 'conv2.weight'], T[E + 'conv2.bias'], d, 2); for (let i = 0; i < h2.length; i++) h2[i] = gelu(h2[i]);
  let x = new Float32Array(l2 * d), pos = T[E + 'embed_positions.weight']; for (let t = 0; t < l2; t++) for (let c = 0; c < d; c++) x[t * d + c] = h2[c * l2 + t] + pos[t * d + c];
  for (let l = 0; l < H.enc_layers; l++) {
    const p = `${E}layers.${l}.`, W = (n) => T[p + n + '.weight'], B = (n) => T[p + n + '.bias'];
    const a = ln(x, l2, d, T[p + 'self_attn_layer_norm.weight'], T[p + 'self_attn_layer_norm.bias']);
    const q = await linear(a, l2, W('self_attn.q_proj'), B('self_attn.q_proj'), G), k = await linear(a, l2, W('self_attn.k_proj'), null, G), v = await linear(a, l2, W('self_attn.v_proj'), B('self_attn.v_proj'), G);
    const c = attend(q, k, v, l2, l2, d, H.heads, null), o = await linear(c, l2, W('self_attn.out_proj'), B('self_attn.out_proj'), G);
    for (let i = 0; i < x.length; i++) x[i] += o[i];
    const f = ln(x, l2, d, T[p + 'final_layer_norm.weight'], T[p + 'final_layer_norm.bias']), f1 = await linear(f, l2, W('fc1'), B('fc1'), G);
    for (let i = 0; i < f1.length; i++) f1[i] = gelu(f1[i]);
    const f2 = await linear(f1, l2, W('fc2'), B('fc2'), G); for (let i = 0; i < x.length; i++) x[i] += f2[i];
    onProgress?.((l + 1) / H.enc_layers);
  }
  return ln(x, l2, d, T[E + 'layer_norm.weight'], T[E + 'layer_norm.bias']);
}
/** greedy decode of one 30 s window: returns token ids (without the prompt and without eot) */
export async function decode(M, enc, onToken, maxTokens = 220) {
  const { H, T } = M, d = H.dim, G = H.group, D = 'model.decoder.', nEnc = enc.length / d, emb = T[D + 'embed_tokens.weight'], pos = T[D + 'embed_positions.weight'];
  const cross = []; for (let l = 0; l < H.dec_layers; l++) { const p = `${D}layers.${l}.encoder_attn.`; cross.push({ k: await linear(enc, nEnc, T[p + 'k_proj.weight'], null, G), v: await linear(enc, nEnc, T[p + 'v_proj.weight'], T[p + 'v_proj.bias'], G) }); }
  const cache = Array.from({ length: H.dec_layers }, () => ({ k: new Float32Array(H.max_len * d), v: new Float32Array(H.max_len * d) }));
  const embRow = (id, out) => { const ng = d / G; for (let g = 0; g < ng; g++) { const s = emb.sc[id * ng + g]; for (let k = g * G; k < (g + 1) * G; k++) out[k] = emb.q[id * d + k] * s; } };
  const suppress = new Set(H.suppress), prompt = [H.sot, H.notimestamps], gen = [];
  let tok = prompt[0], p = 0; const logitsBuf = new Float32Array(H.vocab);
  const x = new Float32Array(d), row = new Float32Array(d);
  const stepFn = async (id, position) => {
    embRow(id, row); for (let i = 0; i < d; i++) x[i] = row[i] + pos[position * d + i];
    let h = Float32Array.from(x);
    for (let l = 0; l < H.dec_layers; l++) {
      const pre = `${D}layers.${l}.`, W = (n) => T[pre + n + '.weight'], B = (n) => T[pre + n + '.bias'];
      const a = ln(h, 1, d, T[pre + 'self_attn_layer_norm.weight'], T[pre + 'self_attn_layer_norm.bias']);
      const q = await linear(a, 1, W('self_attn.q_proj'), B('self_attn.q_proj'), G), k = await linear(a, 1, W('self_attn.k_proj'), null, G), v = await linear(a, 1, W('self_attn.v_proj'), B('self_attn.v_proj'), G);
      cache[l].k.set(k, position * d); cache[l].v.set(v, position * d);
      const c = attend(q, cache[l].k, cache[l].v, 1, position + 1, d, H.heads, null), o = await linear(c, 1, W('self_attn.out_proj'), B('self_attn.out_proj'), G); for (let i = 0; i < d; i++) h[i] += o[i];
      const a2 = ln(h, 1, d, T[pre + 'encoder_attn_layer_norm.weight'], T[pre + 'encoder_attn_layer_norm.bias']), q2 = await linear(a2, 1, W('encoder_attn.q_proj'), B('encoder_attn.q_proj'), G);
      const c2 = attend(q2, cross[l].k, cross[l].v, 1, nEnc, d, H.heads, null), o2 = await linear(c2, 1, W('encoder_attn.out_proj'), B('encoder_attn.out_proj'), G); for (let i = 0; i < d; i++) h[i] += o2[i];
      const f = ln(h, 1, d, T[pre + 'final_layer_norm.weight'], T[pre + 'final_layer_norm.bias']), f1 = await linear(f, 1, W('fc1'), B('fc1'), G); for (let i = 0; i < f1.length; i++) f1[i] = gelu(f1[i]);
      const f2 = await linear(f1, 1, W('fc2'), B('fc2'), G); for (let i = 0; i < d; i++) h[i] += f2[i];
    }
    const fin = ln(h, 1, d, T[D + 'layer_norm.weight'], T[D + 'layer_norm.bias']);
    // tied output projection: logits[v] = emb[v] . fin
    const ng = d / G;
    for (let vv = 0; vv < H.vocab; vv++) { let a = 0; const qo = vv * d, so = vv * ng; for (let g = 0; g < ng; g++) { const s = emb.sc[so + g]; let part = 0; for (let k = g * G; k < (g + 1) * G; k++) part += emb.q[qo + k] * fin[k]; a += part * s; } logitsBuf[vv] = a; }
    return logitsBuf;
  };
  // feed the prompt (sot, notimestamps); the logits after the last prompt token give the first text token
  let lg; for (const id of prompt) { lg = await stepFn(id, p++); }
  for (let step = 0; step < maxTokens && p < H.max_len; step++) {
    for (const s of suppress) lg[s] = -Infinity; if (step === 0) for (const s of H.begin_suppress) lg[s] = -Infinity;
    for (let v = H.eot + 1; v < H.vocab; v++) lg[v] = -Infinity; // all special tokens above eot (timestamps, language, task) are never emitted in this mode
    let best = 0, bv = -Infinity; for (let v = 0; v < H.vocab; v++) if (lg[v] > bv) { bv = lg[v]; best = v; }
    if (best === H.eot) break; gen.push(best); onToken?.(best);
    lg = await stepFn(best, p++);
  }
  return gen;
}
let byteDec;
function bytesToUnicodeInverse() {
  if (byteDec) return byteDec; const bs = [...Array(94).keys()].map((i) => i + 33).concat([...Array(12).keys()].map((i) => i + 161), [...Array(82).keys()].map((i) => i + 174)), cs = bs.slice(); let n = 0;
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n++); }
  byteDec = new Map(bs.map((b, i) => [String.fromCodePoint(cs[i]), b])); return byteDec;
}
export function detokenize(vocab, ids) { const dec = bytesToUnicodeInverse(), bytes = []; for (const id of ids) { const t = vocab[id] || ''; for (const ch of t) { const b = dec.get(ch); if (b !== undefined) bytes.push(b); } } return new TextDecoder().decode(new Uint8Array(bytes)); }
/** pcm: Float32Array at 16 kHz mono. Processes consecutive 30 s windows. */
export async function transcribe(M, vocab, pcm, onStatus, shouldStop) {
  const parts = Math.max(1, Math.ceil(pcm.length / N_SAMPLES)), texts = [];
  for (let w = 0; w < parts; w++) {
    if (shouldStop?.()) break;
    const seg = pcm.subarray(w * N_SAMPLES, Math.min(pcm.length, (w + 1) * N_SAMPLES)); if (seg.length < SR * 0.3) continue;
    onStatus?.(`window ${w + 1} of ${parts}: features`); const mel = logMel(seg, M); await tick();
    onStatus?.(`window ${w + 1} of ${parts}: listening (encoder)`); const enc = await encode(M, mel, (f) => onStatus?.(`window ${w + 1} of ${parts}: encoder layer ${Math.round(f * M.H.enc_layers)} of ${M.H.enc_layers}`));
    onStatus?.(`window ${w + 1} of ${parts}: writing text`); const ids = await decode(M, enc, () => {}); texts.push(detokenize(vocab, ids).trim()); onStatus?.(null, texts.join(' '));
  }
  return texts.join(' ').replace(/\s+/g, ' ').trim();
}
async function readFile(rel, as, onBytes, size) {
  if (typeof window === 'undefined') { const fs = await import('node:fs/promises'), b = await fs.readFile(new URL(rel, import.meta.url)); return as === 'json' ? JSON.parse(b.toString('utf8')) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength); }
  const r = await fetch(new URL(rel, import.meta.url)); if (!r.ok) throw new Error(`Could not load a model file (HTTP ${r.status})`);
  if (as === 'json') return r.json();
  const total = Number(r.headers.get('content-length')) || size, chunks = []; let got = 0; const rd = r.body.getReader();
  for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; onBytes?.(got / total); }
  const u8 = new Uint8Array(got); let o = 0; for (const c of chunks) { u8.set(c, o); o += c.length; } return u8;
}
let P;
export function getModel(onProgress) {
  return P ||= (async () => { const [vocab, bin] = await Promise.all([readFile(VOCAB, 'json'), readFile(BIN, 'bin', onProgress, 42966124)]); return { M: loadModel(bin), vocab }; })().catch((e) => { P = null; throw e; });
}

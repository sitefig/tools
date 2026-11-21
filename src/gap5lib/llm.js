// llm.js (gap5): a small chat model in the browser. SmolLM2-135M-Instruct (Hugging Face, Apache-2.0; Llama architecture: RMSNorm, RoPE, grouped-query attention, SwiGLU)
// run by a hand-written JS forward pass with a KV cache and a byte-level BPE tokenizer. Zero dependencies.
// Weights are 4-bit (round-to-nearest, group 32, tied embedding included; 76 MB) packed by scripts/pack-gap5-smollm.py. 4-bit hurts a model this small: perplexity on
// ordinary English text rises by about 40% over float32, so answers are noticeably weaker than the original model's. Verified against PyTorch (same dequantised weights)
// in test/gap5-llm.mjs: token ids, logits and greedy completions match.
// Ceilings: 135M parameters means short, often wrong or repetitive answers; English works best; context limited to 2048 tokens here; a few tokens per second on a laptop.
const BIN = '../../data/smollm2-135m-instruct-q4.bin', VOCAB = '../../data/smollm2-vocab.json';
export const MAX_CTX = 2048;
const f16 = (u) => { const e = (u >> 10) & 31, m = u & 1023, s = u & 0x8000 ? -1 : 1; return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15); };
export function loadModel(buf) {
  if (String.fromCharCode(...buf.subarray(0, 4)) !== 'SLM1') throw new Error('Not a SmolLM model file');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), hl = dv.getUint32(4, true), H = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + hl))), base = buf.byteOffset + 8 + hl, T = {};
  for (const t of H.tensors) {
    const n = t.s.reduce((a, b) => a * b, 1), o = base + t.o;
    if (t.t === 'f') { const a = new Float32Array(n), d = new DataView(buf.buffer, o, n * 4); for (let i = 0; i < n; i++) a[i] = d.getFloat32(i * 4, true); T[t.n] = a; }
    else { const ns = n / H.group, sc = new Float32Array(ns), sdv = new DataView(buf.buffer, o + n / 2, ns * 2); for (let i = 0; i < ns; i++) sc[i] = f16(sdv.getUint16(i * 2, true)); T[t.n] = { q: new Uint8Array(buf.buffer, o, n / 2), sc, rows: t.s[0], cols: t.s[1] }; }
  }
  return { H, T };
}
// ---------------------------------------------------------------- tokenizer (byte-level BPE, Digits + GPT-2 split)
let B2U, U2B;
function byteMaps() { if (B2U) return; const bs = [...Array(94).keys()].map((i) => i + 33).concat([...Array(12).keys()].map((i) => i + 161), [...Array(82).keys()].map((i) => i + 174)), cs = bs.slice(); let n = 0; for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n++); } B2U = bs.map((b, i) => [b, String.fromCodePoint(cs[i])]).sort((a, b) => a[0] - b[0]).map((x) => x[1]); U2B = new Map(bs.map((b, i) => [String.fromCodePoint(cs[i]), b])); }
export function makeTokenizer(V) {
  byteMaps(); const id = new Map(V.vocab.map((t, i) => [t, i])), rank = new Map(V.merges.map((m, i) => [m, i])), cache = new Map();
  const bpe = (w) => {
    if (cache.has(w)) return cache.get(w); let parts = [...w];
    while (parts.length > 1) { let best = -1, bi = -1; for (let i = 0; i < parts.length - 1; i++) { const r = rank.get(parts[i] + ' ' + parts[i + 1]); if (r !== undefined && (best < 0 || r < best)) { best = r; bi = i; } } if (bi < 0) break; parts = [...parts.slice(0, bi), parts[bi] + parts[bi + 1], ...parts.slice(bi + 2)]; }
    cache.set(w, parts); return parts;
  };
  const re = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu, enc = new TextEncoder();
  const encode = (text) => {
    const out = [];
    for (const piece of text.split(/(\p{N})/u)) { if (!piece) continue; for (const m of piece.matchAll(re)) { const u = [...enc.encode(m[0])].map((b) => B2U[b]).join(''); for (const p of bpe(u)) { const i = id.get(p); if (i === undefined) throw new Error('Unknown token piece'); out.push(i); } } }
    return out;
  };
  const dec = new TextDecoder(); const bytesOf = (ids) => { const b = []; for (const i of ids) for (const ch of V.vocab[i] || '') { const x = U2B.get(ch); if (x !== undefined) b.push(x); } return new Uint8Array(b); };
  return { encode, decode: (ids) => dec.decode(bytesOf(ids)), bytesOf, special: { eot: 0, start: 1, end: 2 } };
}
export const chatPrompt = (messages) => (messages[0]?.role === 'system' ? '' : '<|im_start|>system\nYou are a helpful AI assistant named SmolLM, trained by Hugging Face<|im_end|>\n') + messages.map((m) => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('') + '<|im_start|>assistant\n';
/** encode text that may contain <|im_start|> / <|im_end|> markers */
export function encodeChat(tok, text) { const out = []; for (const part of text.split(/(<\|im_start\|>|<\|im_end\|>)/)) { if (part === '<|im_start|>') out.push(1); else if (part === '<|im_end|>') out.push(2); else if (part) out.push(...tok.encode(part)); } return out; }
// ---------------------------------------------------------------- forward
let last = 0;
const tick = async () => { if (typeof performance !== 'undefined' && performance.now() - last < 40) return; await new Promise((r) => setTimeout(r, 0)); last = typeof performance !== 'undefined' ? performance.now() : 0; };
async function linear(x, n, W, G, yield_) { // y[t][o] = W[o] . x[t]; 4-bit weights unpacked one row at a time and shared by all n tokens
  const { q, sc, rows, cols } = W, y = new Float32Array(n * rows), wr = new Float32Array(cols), ng = cols / G, half = cols / 2;
  for (let o = 0; o < rows; o++) {
    const qo = o * half, so = o * ng;
    for (let g = 0; g < ng; g++) { const s = sc[so + g], k0 = g * G; for (let k = 0; k < G; k += 2) { const bte = q[qo + (k0 + k) / 2]; wr[k0 + k] = ((bte & 15) - 8) * s; wr[k0 + k + 1] = ((bte >> 4) - 8) * s; } }
    for (let t = 0; t < n; t++) { const xo = t * cols; let a = 0; for (let k = 0; k < cols; k++) a += wr[k] * x[xo + k]; y[t * rows + o] = a; }
    if (yield_ && (o & 63) === 63) await tick();
  }
  return y;
}
const rms = (x, n, d, w, eps) => { const y = new Float32Array(x.length); for (let t = 0; t < n; t++) { const o = t * d; let s = 0; for (let i = 0; i < d; i++) s += x[o + i] * x[o + i]; const r = 1 / Math.sqrt(s / d + eps); for (let i = 0; i < d; i++) y[o + i] = x[o + i] * r * w[i]; } return y; };
export function newState(M) { const { H } = M, kvd = (H.dim / H.heads) * H.kv_heads; return { len: 0, k: Array.from({ length: H.layers }, () => new Float32Array(MAX_CTX * kvd)), v: Array.from({ length: H.layers }, () => new Float32Array(MAX_CTX * kvd)) }; }
/** Feed tokens (continuing the state) and return the logits after the last one. yield_ keeps the UI responsive. */
export async function forward(M, st, ids, yield_ = true) {
  const { H, T } = M, d = H.dim, G = H.group, hd = d / H.heads, nkv = H.kv_heads, kvd = hd * nkv, grp = H.heads / nkv, n = ids.length, emb = T['model.embed_tokens.weight'], half = hd / 2;
  if (st.len + n > MAX_CTX) throw new Error('Context is full (2048 tokens). Start a new chat.');
  let x = new Float32Array(n * d); const ng = d / G;
  for (let t = 0; t < n; t++) { const id = ids[t]; for (let g = 0; g < ng; g++) { const s = emb.sc[id * ng + g]; for (let k = 0; k < G; k += 2) { const bte = emb.q[(id * d + g * G + k) / 2]; x[t * d + g * G + k] = ((bte & 15) - 8) * s; x[t * d + g * G + k + 1] = ((bte >> 4) - 8) * s; } } }
  const cosT = new Float32Array(n * half), sinT = new Float32Array(n * half);
  for (let t = 0; t < n; t++) for (let i = 0; i < half; i++) { const a = (st.len + t) * Math.pow(H.rope_theta, -(2 * i) / hd); cosT[t * half + i] = Math.cos(a); sinT[t * half + i] = Math.sin(a); }
  const rope = (v, nh, t) => { for (let h = 0; h < nh; h++) { const o = t * nh * hd + h * hd; for (let i = 0; i < half; i++) { const a = v[o + i], b = v[o + half + i], c = cosT[t * half + i], s = sinT[t * half + i]; v[o + i] = a * c - b * s; v[o + half + i] = b * c + a * s; } } };
  for (let l = 0; l < H.layers; l++) {
    const p = `model.layers.${l}.`, W = (nm) => T[p + nm + '.weight'];
    const a = rms(x, n, d, T[p + 'input_layernorm.weight'], H.eps);
    const q = await linear(a, n, W('self_attn.q_proj'), G, yield_ && n > 1), k = await linear(a, n, W('self_attn.k_proj'), G, false), v = await linear(a, n, W('self_attn.v_proj'), G, false);
    for (let t = 0; t < n; t++) { rope(q, H.heads, t); rope(k, nkv, t); }
    const Kc = st.k[l], Vc = st.v[l]; for (let t = 0; t < n; t++) { Kc.set(k.subarray(t * kvd, (t + 1) * kvd), (st.len + t) * kvd); Vc.set(v.subarray(t * kvd, (t + 1) * kvd), (st.len + t) * kvd); }
    const ctx = new Float32Array(n * d), scale = 1 / Math.sqrt(hd);
    for (let t = 0; t < n; t++) { const upto = st.len + t + 1, sc = new Float32Array(upto); for (let h = 0; h < H.heads; h++) { const kh = Math.floor(h / grp), qo = t * d + h * hd; let mx = -Infinity; for (let j = 0; j < upto; j++) { const ko = j * kvd + kh * hd; let s = 0; for (let c = 0; c < hd; c++) s += q[qo + c] * Kc[ko + c]; s *= scale; sc[j] = s; if (s > mx) mx = s; } let sum = 0; for (let j = 0; j < upto; j++) { sc[j] = Math.exp(sc[j] - mx); sum += sc[j]; } for (let j = 0; j < upto; j++) { const w = sc[j] / sum, vo = j * kvd + kh * hd; for (let c = 0; c < hd; c++) ctx[qo + c] += w * Vc[vo + c]; } } }
    const o = await linear(ctx, n, W('self_attn.o_proj'), G, false); for (let i = 0; i < x.length; i++) x[i] += o[i];
    const b = rms(x, n, d, T[p + 'post_attention_layernorm.weight'], H.eps), gate = await linear(b, n, W('mlp.gate_proj'), G, yield_ && n > 1), up = await linear(b, n, W('mlp.up_proj'), G, false);
    for (let i = 0; i < gate.length; i++) gate[i] = (gate[i] / (1 + Math.exp(-gate[i]))) * up[i];
    const dn = await linear(gate, n, W('mlp.down_proj'), G, false); for (let i = 0; i < x.length; i++) x[i] += dn[i];
    if (yield_) await tick();
  }
  st.len += n;
  const fin = rms(x.subarray((n - 1) * d, n * d), 1, d, T['model.norm.weight'], H.eps);
  return linear(fin, 1, emb, G, yield_); // tied output projection
}
export function sample(logits, o = {}, recent = []) {
  const { temperature = 0, topP = 0.9, rep = 1.0 } = o, lg = Float32Array.from(logits);
  if (rep !== 1) for (const id of new Set(recent)) lg[id] = lg[id] > 0 ? lg[id] / rep : lg[id] * rep;
  if (!(temperature > 0)) { let b = 0; for (let i = 1; i < lg.length; i++) if (lg[i] > lg[b]) b = i; return b; }
  const idx = Array.from(lg.keys()).sort((a, b) => lg[b] - lg[a]).slice(0, 200); let mx = lg[idx[0]], ps = idx.map((i) => Math.exp((lg[i] - mx) / temperature)), z = ps.reduce((a, b) => a + b, 0); ps = ps.map((p) => p / z);
  let acc = 0, cut = ps.length; for (let i = 0; i < ps.length; i++) { acc += ps[i]; if (acc >= topP) { cut = i + 1; break; } }
  const zz = ps.slice(0, cut).reduce((a, b) => a + b, 0); let r = Math.random() * zz; for (let i = 0; i < cut; i++) { r -= ps[i]; if (r <= 0) return idx[i]; } return idx[0];
}
/** Generate until <|im_end|> or maxNew tokens; onText(delta) is called as text becomes available. */
export async function generate(M, tok, st, promptIds, o = {}, onText, shouldStop) {
  let lg = await forward(M, st, promptIds), out = [], emitted = 0; const maxNew = o.maxNew ?? 200;
  for (let i = 0; i < maxNew; i++) {
    if (shouldStop?.()) break; const id = sample(lg, o, [...promptIds.slice(-64), ...out]); if (id === tok.special.end || id === tok.special.eot) break;
    out.push(id); const bytes = tok.bytesOf(out), text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!text.endsWith('�')) { onText?.(text.slice(emitted)); emitted = text.length; }
    if (st.len >= MAX_CTX - 1) break; lg = await forward(M, st, [id]);
  }
  const t = tok.decode(out); if (t.length > emitted) onText?.(t.slice(emitted));
  return out;
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
export function getModel(onProgress) { return P ||= (async () => { const [V, bin] = await Promise.all([readFile(VOCAB, 'json'), readFile(BIN, 'bin', onProgress, 75807780)]); return { M: loadModel(bin), tok: makeTokenizer(V) }; })().catch((e) => { P = null; throw e; }); }

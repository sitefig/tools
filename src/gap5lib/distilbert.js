// distilbert.js (gap5): shared DistilBERT engine for fill-mask (distilbert-base-uncased) and extractive question answering
// (distilbert-base-cased-distilled-squad). Hand-written, zero dependencies. Container format and int8 packing are those of
// src/tools/sentiment.js (loadModel is imported from there); weights are repacked by scripts/pack-gap5-distilbert.py.
// Verified against PyTorch/transformers in test/gap5-models.mjs. Only fetches: same-origin files in data/ (see data/SOURCES.md).
// Ceilings: single-thread JS (UI yielded every ~30 ms); 384-token windows for QA with 128 overlap; max 256 tokens for fill-mask.
import { loadModel } from '../tools/sentiment.js';
export { loadModel };

const isPunct = (cp, ch) => (cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126) || /^\p{P}$/u.test(ch);
const isCjk = (c) => (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x20000 && c <= 0x2a6df) || (c >= 0x2a700 && c <= 0x2ebef) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0x2f800 && c <= 0x2fa1f);

/** BERT WordPiece tokenizer with character offsets. lower=true: uncased (lowercase + strip accents). Returns encode(text) -> {ids, spans:[[start,end]] (UTF-16 offsets into text)}. */
export function makeTokenizer(vocabText, lower) {
  const vocab = new Map(); vocabText.split('\n').forEach((w, i) => { w = w.replace(/\r$/, ''); if (w !== '' || i < 100) vocab.set(w, i); });
  const UNK = vocab.get('[UNK]');
  const specials = { CLS: vocab.get('[CLS]'), SEP: vocab.get('[SEP]'), MASK: vocab.get('[MASK]'), PAD: vocab.get('[PAD]') };
  function wordsOf(text) { // -> [{chars:[{c,s,e}]}] where c is the normalised char
    const words = []; let cur = null; const flush = () => { if (cur) words.push(cur); cur = null; };
    let pos = 0;
    for (const ch of text) {
      const s = pos, e = pos + ch.length; pos = e;
      const cp = ch.codePointAt(0);
      if (cp === 0 || cp === 0xfffd || (/^\p{C}$/u.test(ch) && !/[\t\n\r]/.test(ch))) continue;
      if (/\s/u.test(ch)) { flush(); continue; }
      let n = ch;
      if (lower) n = ch.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
      if (isCjk(cp)) { flush(); words.push({ chars: [{ c: n, s, e }] }); continue; }
      if (isPunct(cp, ch)) { flush(); words.push({ chars: [{ c: n, s, e }] }); continue; }
      if (n === '') continue;
      (cur ||= { chars: [] }).chars.push(...[...n].map((c) => ({ c, s, e })));
    }
    flush(); return words;
  }
  function pieces(w) {
    const cs = w.chars; if (cs.length > 100) return [{ id: UNK, s: cs[0].s, e: cs[cs.length - 1].e }];
    const out = []; let st = 0;
    while (st < cs.length) {
      let en = cs.length, id = -1;
      while (st < en) { const sub = (st ? '##' : '') + cs.slice(st, en).map((x) => x.c).join(''); if (vocab.has(sub)) { id = vocab.get(sub); break; } en--; }
      if (id < 0) return [{ id: UNK, s: cs[0].s, e: cs[cs.length - 1].e }];
      out.push({ id, s: cs[st].s, e: cs[en - 1].e }); st = en;
    }
    return out;
  }
  const encode = (text) => { const ids = [], spans = []; for (const w of wordsOf(text)) for (const p of pieces(w)) { ids.push(p.id); spans.push([p.s, p.e]); } return { ids, spans }; };
  encode.specials = specials; encode.vocab = vocab;
  return encode;
}

// ---------------------------------------------------------------- transformer
let last = 0;
const tick = async () => { if (typeof performance !== 'undefined' && performance.now() - last < 30) return; await new Promise((r) => setTimeout(r, 0)); last = typeof performance !== 'undefined' ? performance.now() : 0; };
async function linear(x, n, W, b, G) {
  const { q, sc, rows, cols } = W, y = new Float32Array(n * rows), wr = new Float32Array(cols), ng = cols / G;
  for (let o = 0; o < rows; o++) {
    const qo = o * cols, so = o * ng;
    for (let g = 0; g < ng; g++) { const s = sc[so + g], k0 = g * G; for (let k = k0; k < k0 + G; k++) wr[k] = q[qo + k] * s; }
    for (let t = 0; t < n; t++) { const xo = t * cols; let a = 0; for (let k = 0; k < cols; k++) a += wr[k] * x[xo + k]; y[t * rows + o] = a + b[o]; }
    if ((o & 31) === 31) await tick();
  }
  return y;
}
const layerNorm = (x, n, d, w, b, res) => {
  for (let t = 0; t < n; t++) {
    const o = t * d; let m = 0;
    for (let i = 0; i < d; i++) { if (res) x[o + i] += res[o + i]; m += x[o + i]; }
    m /= d; let v = 0;
    for (let i = 0; i < d; i++) { const z = x[o + i] - m; v += z * z; }
    const r = 1 / Math.sqrt(v / d + 1e-12);
    for (let i = 0; i < d; i++) x[o + i] = (x[o + i] - m) * r * w[i] + b[i];
  }
};
const erf = (x) => { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
const gelu = (v) => 0.5 * v * (1 + erf(v * Math.SQRT1_2));

/** ids -> hidden states Float32Array(n*dim). onProgress(fraction of layers). */
export async function encodeHidden(model, ids, onProgress) {
  const { H, T } = model, d = H.dim, n = ids.length, G = H.group, nh = H.heads, hd = d / nh, E = 'distilbert.embeddings.';
  if (n > H.maxPos) throw new Error('Input too long for the model');
  const we = T[E + 'word_embeddings.weight'], pe = T[E + 'position_embeddings.weight'];
  const x = new Float32Array(n * d), rowOf = (W, r, out, o, add) => {
    const ng = W.cols / G;
    for (let g = 0; g < ng; g++) { const s = W.sc[r * ng + g]; for (let k = g * G; k < (g + 1) * G; k++) out[o + k] = (add ? out[o + k] : 0) + W.q[r * W.cols + k] * s; }
  };
  for (let t = 0; t < n; t++) { rowOf(we, ids[t], x, t * d, false); rowOf(pe, t, x, t * d, true); }
  layerNorm(x, n, d, T[E + 'LayerNorm.weight'], T[E + 'LayerNorm.bias']);
  let cur = x;
  for (let l = 0; l < H.layers; l++) {
    const p = `distilbert.transformer.layer.${l}.`, W = (k) => T[p + k + '.weight'], B = (k) => T[p + k + '.bias'];
    const q = await linear(cur, n, W('attention.q_lin'), B('attention.q_lin'), G), k = await linear(cur, n, W('attention.k_lin'), B('attention.k_lin'), G), v = await linear(cur, n, W('attention.v_lin'), B('attention.v_lin'), G);
    const ctx = new Float32Array(n * d), sc = new Float32Array(n), scale = 1 / Math.sqrt(hd);
    for (let h = 0; h < nh; h++) for (let i = 0; i < n; i++) {
      let mx = -Infinity;
      for (let j = 0; j < n; j++) { let a = 0; for (let c = 0; c < hd; c++) a += q[i * d + h * hd + c] * k[j * d + h * hd + c]; sc[j] = a * scale; if (sc[j] > mx) mx = sc[j]; }
      let sum = 0; for (let j = 0; j < n; j++) { sc[j] = Math.exp(sc[j] - mx); sum += sc[j]; }
      for (let j = 0; j < n; j++) { const w = sc[j] / sum; for (let c = 0; c < hd; c++) ctx[i * d + h * hd + c] += w * v[j * d + h * hd + c]; }
    }
    const att = await linear(ctx, n, W('attention.out_lin'), B('attention.out_lin'), G);
    layerNorm(att, n, d, T[p + 'sa_layer_norm.weight'], T[p + 'sa_layer_norm.bias'], cur);
    const f1 = await linear(att, n, W('ffn.lin1'), B('ffn.lin1'), G);
    for (let i = 0; i < f1.length; i++) f1[i] = gelu(f1[i]);
    const f2 = await linear(f1, n, W('ffn.lin2'), B('ffn.lin2'), G);
    layerNorm(f2, n, d, T[p + 'output_layer_norm.weight'], T[p + 'output_layer_norm.bias'], att);
    cur = f2; onProgress?.((l + 1) / H.layers);
  }
  return cur;
}

// ---------------------------------------------------------------- fill-mask
/** Pieces of text split on the literal "[MASK]"; returns {ids, maskPos[]} with [CLS]/[SEP] added. Truncates to max ids. */
export function prepareMasked(tok, text, max = 256) {
  const parts = text.split(/\[MASK\]/gi), ids = [tok.specials.CLS], maskPos = [];
  parts.forEach((p, i) => { ids.push(...tok(p).ids); if (i < parts.length - 1) { maskPos.push(ids.length); ids.push(tok.specials.MASK); } });
  ids.push(tok.specials.SEP);
  if (ids.length > max) throw new Error(`Text is ${ids.length} word pieces; this tool handles at most ${max}. Shorten it.`);
  return { ids, maskPos };
}
/** top-k tokens for each mask position: [{pos, top:[{id, token, prob}]}] (softmax over the full vocabulary) */
export async function fillMask(model, tok, text, k = 5, onProgress) {
  const { ids, maskPos } = prepareMasked(tok, text);
  if (!maskPos.length) throw new Error('Put [MASK] where the missing word should go, for example: Paris is the [MASK] of France.');
  if (maskPos.length > 5) throw new Error('At most 5 [MASK] tokens are supported.');
  const { H, T } = model, d = H.dim, G = H.group, hs = await encodeHidden(model, ids, onProgress);
  const inv = [...tok.vocab.entries()].reduce((a, [w, i]) => (a[i] = w, a), []);
  const out = [];
  for (const pos of maskPos) {
    const h = await linear(hs.subarray(pos * d, (pos + 1) * d), 1, T['vocab_transform.weight'], T['vocab_transform.bias'], G);
    for (let i = 0; i < d; i++) h[i] = gelu(h[i]);
    layerNorm(h, 1, d, T['vocab_layer_norm.weight'], T['vocab_layer_norm.bias']);
    const lg = await linear(h, 1, T['distilbert.embeddings.word_embeddings.weight'], T['vocab_projector.bias'], G);
    let mx = -Infinity; for (const v of lg) if (v > mx) mx = v;
    let sum = 0; for (let i = 0; i < lg.length; i++) sum += Math.exp(lg[i] - mx);
    const idx = Array.from(lg.keys()).sort((a, b) => lg[b] - lg[a]).slice(0, k);
    out.push({ pos, top: idx.map((id) => ({ id, token: inv[id], prob: Math.exp(lg[id] - mx) / sum })) });
  }
  return out;
}

// ---------------------------------------------------------------- extractive QA
export const QA_MAX = 384, QA_STRIDE = 128, QA_MAX_ANSWER = 15;
/** -> {answer, score, start, end (char offsets in context)} or {answer:'', score:0}. Mirrors transformers' question-answering pipeline (max_seq_len 384, doc_stride 128, max_answer_len 15, one best span). */
export async function answer(model, tok, question, context, onProgress) {
  const q = tok(question), c = tok(context);
  if (!c.ids.length) throw new Error('The context is empty.');
  if (q.ids.length > 64) throw new Error('The question is too long (limit about 64 word pieces).');
  const sp = tok.specials, room = QA_MAX - q.ids.length - 3, step = room - QA_STRIDE;
  const wins = [];
  for (let s = 0; ; s += step) { wins.push([s, Math.min(c.ids.length, s + room)]); if (s + room >= c.ids.length) break; }
  let best = null, done = 0;
  for (const [ws, we] of wins) {
    const ids = [sp.CLS, ...q.ids, sp.SEP, ...c.ids.slice(ws, we), sp.SEP], off = q.ids.length + 2;
    const hs = await encodeHidden(model, ids, (f) => onProgress?.((done + f) / wins.length));
    done++;
    const { H, T } = model, d = H.dim, lg = T['qa_outputs.weight'], lb = T['qa_outputs.bias'], n = ids.length;
    const st = new Float64Array(n).fill(-10000), en = new Float64Array(n).fill(-10000);
    for (let t = off; t < off + (we - ws); t++) { let a = lb[0], b = lb[1]; for (let i = 0; i < d; i++) { a += lg[i] * hs[t * d + i]; b += lg[d + i] * hs[t * d + i]; } st[t] = a; en[t] = b; }
    const soft = (v) => { let m = -Infinity; for (const x of v) if (x > m) m = x; let s = 0; const o = v.map((x) => Math.exp(x - m)); for (const x of o) s += x; return o.map((x) => x / s); };
    const ps = soft(st), pe = soft(en);
    for (let s = off; s < off + (we - ws); s++) for (let e = s; e < Math.min(off + (we - ws), s + QA_MAX_ANSWER); e++) {
      const sc = ps[s] * pe[e];
      if (!best || sc > best.score) best = { score: sc, s: ws + s - off, e: ws + e - off };
    }
  }
  if (!best) return { answer: '', score: 0 };
  const a = c.spans[best.s][0], b = c.spans[best.e][1];
  return { answer: context.slice(a, b), score: best.score, start: a, end: b, windows: wins.length };
}

// ---------------------------------------------------------------- loading
async function readFile(rel, as, onBytes, size) {
  if (typeof window === 'undefined') {
    const fs = await import('node:fs/promises'), b = await fs.readFile(new URL(rel, import.meta.url));
    return as === 'text' ? b.toString('utf8') : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }
  const r = await fetch(new URL(rel, import.meta.url));
  if (!r.ok) throw new Error(`Could not load the model file (HTTP ${r.status})`);
  if (as === 'text') return r.text();
  const total = Number(r.headers.get('content-length')) || size, chunks = []; let got = 0;
  const rd = r.body.getReader();
  for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; onBytes?.(got / total); }
  const u8 = new Uint8Array(got); let o = 0; for (const c of chunks) { u8.set(c, o); o += c.length; }
  return u8;
}
export const MODELS = {
  mlm: { bin: '../../data/fillmask-distilbert-base-uncased.bin', vocab: '../../data/sentiment-vocab.txt', lower: true, size: 69368288 },
  qa: { bin: '../../data/qa-distilbert-base-cased-squad.bin', vocab: '../../data/qa-vocab-cased.txt', lower: false, size: 67426088 },
};
const cache = {};
export function getModel(kind, onProgress) {
  return cache[kind] ||= (async () => {
    const m = MODELS[kind];
    const [vocab, bin] = await Promise.all([readFile(m.vocab, 'text'), readFile(m.bin, 'bin', onProgress, m.size)]);
    return { tok: makeTokenizer(vocab, m.lower), model: loadModel(bin) };
  })().catch((e) => { cache[kind] = null; throw e; });
}

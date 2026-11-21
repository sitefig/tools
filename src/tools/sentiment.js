// sentiment.js: English sentiment classifier running a real pretrained transformer in the browser. Zero dependencies, client-side only.
// Model = distilbert-base-uncased-finetuned-sst-2-english (Apache-2.0, 6 layers, 768 dim, 66M params, ~91% SST-2 accuracy), weights repacked
// to int8 with one fp16 scale per 64 inputs (69 MB, see data/SOURCES.md and scripts/pack-sentiment.py). Our own WordPiece tokenizer and
// DistilBERT forward pass in plain JS; verified against PyTorch/transformers in test/sentiment.mjs.
// The only fetches are the two same-origin static files in data/, loaded lazily when the user first classifies, then cached.
// Skips / ceilings: English only; max 256 tokens (longer text is cut, and the tool says so); 2 classes only (no neutral: a neutral text
// still gets a positive/negative split); single-thread JS, ~0.5 s for a sentence and a few seconds for 256 tokens (the UI is yielded to
// every ~30 ms, no Web Worker: upgrade to a Worker if main-thread jank matters); int8 weights change logits by ~0.1 on average-sized
// inputs vs the float32 original (max 0.35 on the test set), so near-50/50 texts can flip; "[MASK]"-style special tokens in the text are
// not interpreted.
const CAT = 'Text';
const MODEL = '../../data/sentiment-distilbert-sst2.bin', VOCAB = '../../data/sentiment-vocab.txt';
export const MAX_TOKENS = 256;

// ---------------------------------------------------------------- WordPiece (BERT uncased)
const isPunct = (cp, ch) => (cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126) || /^\p{P}$/u.test(ch);
const isCjk = (c) => (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x20000 && c <= 0x2a6df) || (c >= 0x2a700 && c <= 0x2ebef) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0x2f800 && c <= 0x2fa1f);
/** vocabText = vocab.txt (one token per line, line number = id). */
export function makeTokenizer(vocabText) {
  const vocab = new Map(); vocabText.split('\n').forEach((w, i) => { if (w !== '' || i < 30522) vocab.set(w.replace(/\r$/, ''), i); });
  const UNK = vocab.get('[UNK]'), CLS = vocab.get('[CLS]'), SEP = vocab.get('[SEP]');
  function words(text) {
    let s = '';
    for (const ch of text) { // clean: drop control chars, NUL and U+FFFD, map every whitespace to a space, pad CJK with spaces
      const cp = ch.codePointAt(0);
      if (cp === 0 || cp === 0xfffd || (/^\p{C}$/u.test(ch) && !/[\t\n\r]/.test(ch))) continue;
      s += /\s/u.test(ch) || /[\t\n\r]/.test(ch) ? ' ' : isCjk(cp) ? ` ${ch} ` : ch;
    }
    s = s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
    const out = [];
    for (const w of s.split(/ +/)) {
      if (!w) continue;
      let cur = '';
      for (const ch of w) { if (isPunct(ch.codePointAt(0), ch)) { if (cur) out.push(cur); out.push(ch); cur = ''; } else cur += ch; }
      if (cur) out.push(cur);
    }
    return out;
  }
  function pieces(w) {
    const cs = [...w]; if (cs.length > 100) return [UNK];
    const ids = []; let st = 0;
    while (st < cs.length) {
      let en = cs.length, id = -1;
      while (st < en) { const sub = (st ? '##' : '') + cs.slice(st, en).join(''); if (vocab.has(sub)) { id = vocab.get(sub); break; } en--; }
      if (id < 0) return [UNK];
      ids.push(id); st = en;
    }
    return ids;
  }
  /** -> { ids: [CLS, ..., SEP], truncated, total } with at most `max` ids */
  return (text, max = MAX_TOKENS) => {
    const all = []; for (const w of words(text)) all.push(...pieces(w));
    const room = max - 2, truncated = all.length > room;
    return { ids: [CLS, ...all.slice(0, room), SEP], truncated, total: all.length };
  };
}

// ---------------------------------------------------------------- model file
const f16 = (u) => { const e = (u >> 10) & 31, m = u & 1023, s = u & 0x8000 ? -1 : 1; return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15); };
/** Parse the DBS1 container (see scripts/pack-sentiment.py). Weights stay int8; scales become float32. */
export function loadModel(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (String.fromCharCode(...buf.subarray(0, 4)) !== 'DBS1') throw new Error('Not a DBS1 model file');
  const hl = dv.getUint32(4, true), H = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + hl))), base = buf.byteOffset + 8 + hl;
  const T = {};
  for (const t of H.tensors) {
    const n = t.s.reduce((a, b) => a * b, 1), o = base + t.o;
    if (t.t === 'f') T[t.n] = new Float32Array(buf.buffer, o, n);
    else {
      const ns = n / H.group, sc = new Float32Array(ns), so = o + n; // fp16 scales follow the int8 block
      const sdv = new DataView(buf.buffer, so, ns * 2);
      for (let i = 0; i < ns; i++) sc[i] = f16(sdv.getUint16(i * 2, true));
      T[t.n] = { q: new Int8Array(buf.buffer, o, n), sc, rows: t.s[0], cols: t.s[1] };
    }
  }
  return { H, T };
}

// ---------------------------------------------------------------- forward pass
let last = 0;
const tick = async () => { if (typeof performance !== 'undefined' && performance.now() - last < 30) return; await new Promise((r) => setTimeout(r, 0)); last = typeof performance !== 'undefined' ? performance.now() : 0; };

/** y[t][o] = b[o] + sum_k W[o][k] x[t][k]; W int8 with group scales; row dequantised once, shared by all tokens. */
async function linear(x, n, W, b, G) {
  const { q, sc, rows, cols } = W, y = new Float32Array(n * rows), wr = new Float32Array(cols), ng = cols / G;
  for (let o = 0; o < rows; o++) {
    const qo = o * cols, so = o * ng;
    for (let g = 0; g < ng; g++) { const s = sc[so + g], k0 = g * G; for (let k = k0; k < k0 + G; k++) wr[k] = q[qo + k] * s; }
    for (let t = 0; t < n; t++) {
      const xo = t * cols; let a = 0;
      for (let k = 0; k < cols; k++) a += wr[k] * x[xo + k];
      y[t * rows + o] = a + b[o];
    }
    if ((o & 31) === 31) await tick();
  }
  return y;
}
const layerNorm = (x, n, d, w, b, res) => { // in place: x = LN(x + res)
  for (let t = 0; t < n; t++) {
    const o = t * d; let m = 0;
    for (let i = 0; i < d; i++) { if (res) x[o + i] += res[o + i]; m += x[o + i]; }
    m /= d; let v = 0;
    for (let i = 0; i < d; i++) { const z = x[o + i] - m; v += z * z; }
    const r = 1 / Math.sqrt(v / d + 1e-12);
    for (let i = 0; i < d; i++) x[o + i] = (x[o + i] - m) * r * w[i] + b[i];
  }
};
// erf, W. J. Cody-style rational approximation via A&S 7.1.26 refined: max abs error ~1.5e-7 (far below the int8 error)
const erf = (x) => { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
const gelu = (v) => 0.5 * v * (1 + erf(v * Math.SQRT1_2));

/** ids -> [logitNegative, logitPositive]. onProgress(fraction) is optional. */
export async function forward(model, ids, onProgress) {
  const { H, T } = model, d = H.dim, n = ids.length, G = H.group, nh = H.heads, hd = d / nh, E = 'distilbert.embeddings.';
  const we = T[E + 'word_embeddings.weight'], pe = T[E + 'position_embeddings.weight'];
  const x = new Float32Array(n * d), rowOf = (W, r, out, o, add) => { // dequantise one embedding row
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
    cur = f2;
    onProgress?.((l + 1) / H.layers);
  }
  const pre = await linear(cur.subarray(0, d), 1, T['pre_classifier.weight'], T['pre_classifier.bias'], G);
  for (let i = 0; i < d; i++) if (pre[i] < 0) pre[i] = 0;
  const cw = T['classifier.weight'], cb = T['classifier.bias'], out = [0, 0];
  for (let c = 0; c < 2; c++) { let a = cb[c]; for (let i = 0; i < d; i++) a += cw[c * d + i] * pre[i]; out[c] = a; }
  return out;
}

/** logits -> { label, prob (of that label), pPositive } */
export const verdict = (lg) => { const m = Math.max(lg[0], lg[1]), a = Math.exp(lg[0] - m), b = Math.exp(lg[1] - m), pp = b / (a + b); return { label: pp >= 0.5 ? 'POSITIVE' : 'NEGATIVE', prob: Math.max(pp, 1 - pp), pPositive: pp }; };

// ---------------------------------------------------------------- loading (Node: fs, browser: fetch with progress)
async function readFile(rel, as, onBytes) {
  if (typeof window === 'undefined') {
    const fs = await import('node:fs/promises'), b = await fs.readFile(new URL(rel, import.meta.url));
    return as === 'text' ? b.toString('utf8') : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }
  const r = await fetch(new URL(rel, import.meta.url));
  if (!r.ok) throw new Error(`Could not load the model file (HTTP ${r.status})`);
  if (as === 'text') return r.text();
  const total = Number(r.headers.get('content-length')) || 69246120, chunks = []; let got = 0;
  const rd = r.body.getReader();
  for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; onBytes?.(got / total); }
  const u8 = new Uint8Array(got); let o = 0; for (const c of chunks) { u8.set(c, o); o += c.length; }
  return u8;
}
let loadP;
/** -> { tok, model }; cached. onProgress(0..1) reports the download only. */
export function getModel(onProgress) {
  return loadP ||= (async () => {
    const [vocab, bin] = await Promise.all([readFile(VOCAB, 'text'), readFile(MODEL, 'bin', onProgress)]);
    return { tok: makeTokenizer(vocab), model: loadModel(bin) };
  })().catch((e) => { loadP = null; throw e; });
}
export async function classify(text, onProgress, onDownload) {
  const { tok, model } = await getModel(onDownload), enc = tok(text);
  const logits = await forward(model, enc.ids, onProgress);
  return { ...verdict(logits), logits, tokens: enc.ids.length, truncated: enc.truncated, total: enc.total };
}

// ---------------------------------------------------------------- UI
const SAMPLE = 'The staff were friendly and the food was great, but the wait was far too long.';
function el(tag, props = {}, ...kids) { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k.includes('-') || !(k in e)) e.setAttribute(k, v); else e[k] = v; } e.append(...kids); return e; }
function render(root) {
  const id = 'sent-' + Math.random().toString(36).slice(2, 7);
  const ta = el('textarea', { id: id + '-in', rows: 5, value: SAMPLE, placeholder: 'Type or paste English text' });
  const lab = el('label', { htmlFor: ta.id }, 'English text to classify');
  const btn = el('button', { type: 'button' }, 'Classify');
  const status = el('p', { className: 'status', role: 'status' });
  const out = el('div', { className: 'sent-out' });
  const note = el('p', { className: 'desc' }, 'First use downloads the 69 MB model from this site once; after that everything runs offline in this tab and your text is never uploaded.');
  root.append(lab, ta, el('div', { className: 'row' }, btn), status, out, note);
  let seq = 0;
  const run = async () => {
    const mine = ++seq, text = ta.value.trim();
    out.replaceChildren();
    if (!text) { status.textContent = ''; out.append(el('p', { role: 'alert', className: 'err' }, 'Enter some text first.')); return; }
    btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    const pct = (f) => Math.round(f * 100);
    let lastMsg = 0, dl = 0;
    const say = (m) => { const now = Date.now(); if (now - lastMsg > 1500) { status.textContent = m; lastMsg = now; } };
    try {
      status.textContent = loadP ? 'Running the model...' : 'Downloading the model (69 MB)...';
      const r = await classify(text, (f) => say(`Running the model: layer ${Math.round(f * 6)} of 6`), (f) => { dl = pct(f); say(`Downloading the model: ${dl}%`); });
      if (mine !== seq) return;
      status.textContent = `${r.label.toLowerCase()}, ${(r.prob * 100).toFixed(1)}% confidence`;
      const pos = r.label === 'POSITIVE';
      out.append(
        el('p', { style: 'font-size:1.5rem;font-weight:700;margin:.5rem 0;color:' + (pos ? 'var(--ok)' : 'var(--danger)') }, `${r.label} ${(r.prob * 100).toFixed(1)}%`),
        el('div', { 'aria-hidden': 'true', style: 'height:.75rem;border-radius:.4rem;background:var(--surface-2);overflow:hidden;max-width:24rem' }, el('div', { style: `height:100%;width:${(r.pPositive * 100).toFixed(1)}%;background:var(--ok)` })),
        el('p', { className: 'desc' }, `Positive ${(r.pPositive * 100).toFixed(1)}% / negative ${((1 - r.pPositive) * 100).toFixed(1)}%. Raw scores (logits): negative ${r.logits[0].toFixed(2)}, positive ${r.logits[1].toFixed(2)}. ${r.tokens} tokens.`),
        ...(r.truncated ? [el('p', { role: 'alert' }, `Only the first ${MAX_TOKENS - 2} of ${r.total} word pieces were analysed; the rest was ignored.`)] : []));
    } catch (e) {
      if (mine === seq) { status.textContent = ''; out.append(el('p', { role: 'alert', className: 'err' }, String(e?.message || e))); }
    } finally { if (mine === seq) { btn.disabled = false; btn.removeAttribute('aria-busy'); } }
  };
  btn.addEventListener('click', run);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } });
}

export default [
  {
    id: 'ai-sentiment-classifier', cat: CAT, title: 'AI Sentiment Classifier',
    desc: 'Positive or negative? A small DistilBERT transformer classifies English text entirely in your browser (no upload, no API).',
    custom: true, dom: true, render,
  },
];

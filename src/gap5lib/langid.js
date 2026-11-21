// langid.js (gap5): language identification with Facebook's fastText lid.176.ftz (176 languages, 917 KB, product-quantised).
// Hand-written reader + predictor for the fastText binary format (version 12): dictionary with subword n-gram hashing, PQ-quantised
// input matrix, dense output layer, softmax. Zero dependencies. Verified against the reference fastText predictor in test/gap5-langid.mjs.
// Model: lid.176.ftz, "Bag of Tricks for Efficient Text Classification" / "FastText.zip" (Joulin et al.), licence CC BY-SA 3.0 (see data/SOURCES.md).
// Ceilings: short or mixed-language text is unreliable (the probabilities say so); romanised text (e.g. Hindi in Latin letters) is often
// labelled as another language; closely related languages (Bosnian/Croatian/Serbian, Norwegian variants) get confused; max one line of input (newlines become spaces).
const FILE = '../../data/lid.176.ftz';

export function parseModel(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); let p = 0;
  const i32 = () => { const v = dv.getInt32(p, true); p += 4; return v; }, i64 = () => { const v = Number(dv.getBigInt64(p, true)); p += 8; return v; };
  const u8 = () => dv.getUint8(p++), f32 = () => { const v = dv.getFloat32(p, true); p += 4; return v; };
  if (i32() !== 793712314) throw new Error('Not a fastText model'); if (i32() !== 12) throw new Error('Unsupported fastText version');
  const a = { dim: i32(), ws: i32(), epoch: i32(), minCount: i32(), neg: i32(), wordNgrams: i32(), loss: i32(), model: i32(), bucket: i32(), minn: i32(), maxn: i32(), lrUpdateRate: i32() };
  p += 8; // t (double)
  const size = i32(), nwords = i32(), nlabels = i32(); i64(); const pruneN = i64();
  const dec = new TextDecoder(), words = [], counts = [];
  for (let i = 0; i < size; i++) { let e = p; while (buf[e] !== 0) e++; words.push(dec.decode(buf.subarray(p, e))); p = e + 1; counts.push(i64()); u8(); }
  const prune = new Map(); for (let i = 0; i < pruneN; i++) { const f = i32(), s = i32(); prune.set(f, s); }
  const quant = u8(); if (!quant) throw new Error('Expected a quantised model (.ftz)');
  const qnorm = u8(), m = i64(), n = i64(), codesize = i32();
  const codes = buf.subarray(p, p + codesize); p += codesize;
  const readPQ = () => { const dim = i32(), nsubq = i32(), dsub = i32(), lastdsub = i32(); const c = new Float32Array(dim * 256); for (let i = 0; i < c.length; i++) c[i] = f32(); return { dim, nsubq, dsub, lastdsub, c }; };
  const pq = readPQ(); let normCodes = null, npq = null;
  if (qnorm) { normCodes = buf.subarray(p, p + m); p += m; npq = readPQ(); }
  const qout = u8(); if (qout) throw new Error('Quantised output layer is not supported');
  const om = i64(), on = i64(); const out = new Float32Array(om * on); for (let i = 0; i < out.length; i++) out[i] = f32();
  const word2id = new Map(); words.forEach((w, i) => word2id.set(w, i));
  if (a.loss !== 1 && a.loss !== 3) throw new Error('Unsupported loss');
  return { counts: counts.slice(nwords, nwords + nlabels), a, nwords, nlabels, words, word2id, prune, m, n, codes, pq, qnorm, normCodes, npq, out, om, on };
}

const enc = new TextEncoder();
function fnv(bytes, from, to) { let h = 2166136261; for (let i = from; i < to; i++) { h ^= (bytes[i] << 24) >> 24; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function subwords(M, word, out) { // computeSubwords(BOW+word+EOW)
  const b = enc.encode('<' + word + '>'), { minn, maxn, bucket } = M.a;
  for (let i = 0; i < b.length; i++) {
    if ((b[i] & 0xc0) === 0x80) continue;
    for (let j = i, n = 1; j < b.length && n <= maxn; n++) {
      j++; while (j < b.length && (b[j] & 0xc0) === 0x80) j++;
      if (n >= minn && !(n === 1 && (i === 0 || j === b.length))) pushHash(M, out, fnv(b, i, j) % bucket);
    }
  }
}
function pushHash(M, out, h) { if (M.prune.size) { if (!M.prune.has(h)) return; h = M.prune.get(h); } out.push(M.nwords + h); }

/** -> [{lang, prob}] for the top k labels. Text is treated as one line. */
export function predict(M, text, k = 3) {
  const toks = text.replace(/[\r\n\t\v\f\0]+/g, ' ').split(' ').filter(Boolean), ids = [], hashes = [];
  for (const t of toks) {
    const id = M.word2id.get(t), b = enc.encode(t);
    if (id === undefined) subwords(M, t, ids);
    else { ids.push(id); subwords(M, t, ids); }
    hashes.push(fnv(b, 0, b.length));
  }
  for (let i = 0; i < hashes.length; i++) { let h = hashes[i]; for (let j = i + 1; j < hashes.length && j < i + M.a.wordNgrams; j++) { h = (Math.imul(h, 116049371) + hashes[j]) >>> 0; pushHash(M, ids, h % M.a.bucket); } }
  const eos = M.word2id.get('</s>'); if (eos !== undefined) ids.push(eos); // end of line token
  if (!ids.length) return [];
  const d = M.a.dim, hid = new Float32Array(d), { pq, npq, codes, normCodes } = M;
  for (const id of ids) {
    const norm = M.qnorm ? npq.c[normCodes[id]] : 1, o = id * pq.nsubq;
    for (let s = 0; s < pq.nsubq; s++) {
      const last = s === pq.nsubq - 1, dd = last ? pq.lastdsub : pq.dsub, base = last ? s * 256 * pq.dsub + codes[o + s] * pq.lastdsub : (s * 256 + codes[o + s]) * pq.dsub;
      for (let q = 0; q < dd; q++) hid[s * pq.dsub + q] += norm * pq.c[base + q];
    }
  }
  for (let i = 0; i < d; i++) hid[i] /= ids.length;
  const labels = M.words.slice(M.nwords, M.nwords + M.nlabels), osz = M.nlabels, d2 = d;
  const dot = (r) => { let a = 0; for (let i = 0; i < d2; i++) a += M.out[r * d2 + i] * hid[i]; return a; };
  let res;
  if (M.a.loss === 3) { // softmax
    const sc = new Float64Array(osz); let mx = -Infinity;
    for (let r = 0; r < osz; r++) { sc[r] = dot(r); if (sc[r] > mx) mx = sc[r]; }
    let sum = 0; for (let r = 0; r < osz; r++) { sc[r] = Math.exp(sc[r] - mx); sum += sc[r]; }
    res = Array.from(sc.keys()).map((r) => [r, sc[r] / sum]);
  } else { // hierarchical softmax (what lid.176 uses): Huffman tree over label counts, exactly as fastText builds it
    const tree = M.tree ||= buildTree(M.counts), lg = (x) => Math.log(x + 1e-5), scores = new Float64Array(osz);
    const walk = (node, score) => {
      const t = tree[node];
      if (t.left === -1 && t.right === -1) { scores[node] = score; return; }
      const f = 1 / (1 + Math.exp(-dot(node - osz)));
      walk(t.left, score + lg(1 - f)); walk(t.right, score + lg(f));
    };
    walk(2 * osz - 2, 0);
    res = Array.from(scores.keys()).map((r) => [r, Math.exp(scores[r])]);
  }
  return res.sort((a, b) => b[1] - a[1]).slice(0, k).map(([r, pr]) => ({ lang: labels[r].replace(/^__label__/, ''), prob: pr }));
}
function buildTree(counts) {
  const osz = counts.length, tree = Array.from({ length: 2 * osz - 1 }, () => ({ parent: -1, left: -1, right: -1, count: 1e15 }));
  for (let i = 0; i < osz; i++) tree[i].count = counts[i];
  let leaf = osz - 1, node = osz;
  for (let i = osz; i < 2 * osz - 1; i++) {
    const mini = [0, 0];
    for (let j = 0; j < 2; j++) { if (leaf >= 0 && tree[leaf].count < tree[node].count) mini[j] = leaf--; else mini[j] = node++; }
    tree[i].left = mini[0]; tree[i].right = mini[1]; tree[i].count = tree[mini[0]].count + tree[mini[1]].count;
    tree[mini[0]].parent = i; tree[mini[1]].parent = i;
  }
  return tree;
}

let P;
export function getModel() {
  return P ||= (async () => {
    let buf;
    if (typeof window === 'undefined') { const fs = await import('node:fs/promises'); const b = await fs.readFile(new URL(FILE, import.meta.url)); buf = new Uint8Array(b.buffer, b.byteOffset, b.byteLength); }
    else { const r = await fetch(new URL(FILE, import.meta.url)); if (!r.ok) throw new Error('Could not load the language model (HTTP ' + r.status + ')'); buf = new Uint8Array(await r.arrayBuffer()); }
    return parseModel(buf);
  })().catch((e) => { P = null; throw e; });
}
export function langName(code) { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code.replace(/_/g, '-')) || code; } catch { return code; } }

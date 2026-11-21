// imageclass.js (gap5): ImageNet-1k image classifier, MobileNetV2 (timm mobilenetv2_100.ra_in1k, Apache-2.0, 3.5M parameters).
// Hand-written forward pass, zero dependencies; weights are float16 with batch norm folded into the convolutions by
// scripts/pack-gap5-mobilenet.py. Verified against PyTorch/timm in test/gap5-image.mjs (logits agree to float rounding).
// Ceilings: 1000 ImageNet classes only (no people, faces, text or scenes outside those classes), 224x224 centre crop, accuracy about 72% top-1;
// the browser path resizes with canvas smoothing (PIL's bicubic gives slightly different pixels).
const BIN = '../../data/mobilenetv2-100-ra-in1k.bin', LABELS = '../../data/imagenet-labels.json';
const f16 = (u) => { const e = (u >> 10) & 31, m = u & 1023, s = u & 0x8000 ? -1 : 1; return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15); };
export function loadModel(buf) {
  if (String.fromCharCode(...buf.subarray(0, 4)) !== 'MNV2') throw new Error('Not a MobileNet model file');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), hl = dv.getUint32(4, true), H = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + hl))), base = 8 + hl;
  const half = (o, n) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = f16(dv.getUint16(base + o + i * 2, true)); return a; };
  const flt = (o, n) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = dv.getFloat32(base + o + i * 4, true); return a; };
  for (const op of H.ops) {
    if (op.op === 'conv') { op.W = half(op.w, op.cout * (op.cin / op.g) * op.k * op.k); op.B = flt(op.b, op.cout); }
    else if (op.op === 'fc') { op.W = half(op.w, op.cout * op.cin); op.B = flt(op.b, op.cout); }
  }
  return H;
}
function conv(x, h, w, op) {
  const { cin, cout, k, s, p, g, W, B } = op, ho = Math.floor((h + 2 * p - k) / s) + 1, wo = Math.floor((w + 2 * p - k) / s) + 1, y = new Float32Array(cout * ho * wo), cpg = cin / g, opg = cout / g;
  if (k === 1 && s === 1 && g === 1) { // pointwise
    const hw = h * w;
    for (let co = 0; co < cout; co++) { const yo = co * hw; y.fill(B[co], yo, yo + hw); for (let ci = 0; ci < cin; ci++) { const wv = W[co * cin + ci]; if (wv === 0) continue; const xo = ci * hw; for (let i = 0; i < hw; i++) y[yo + i] += wv * x[xo + i]; } }
    return [y, ho, wo];
  }
  for (let gi = 0; gi < g; gi++) for (let oc = 0; oc < opg; oc++) {
    const co = gi * opg + oc, yo = co * ho * wo, wbase = co * cpg * k * k;
    for (let oy = 0; oy < ho; oy++) for (let ox = 0; ox < wo; ox++) {
      let a = B[co]; const iy0 = oy * s - p, ix0 = ox * s - p;
      for (let ci = 0; ci < cpg; ci++) { const xo = (gi * cpg + ci) * h * w, wo2 = wbase + ci * k * k; for (let ky = 0; ky < k; ky++) { const iy = iy0 + ky; if (iy < 0 || iy >= h) continue; for (let kx = 0; kx < k; kx++) { const ix = ix0 + kx; if (ix < 0 || ix >= w) continue; a += W[wo2 + ky * k + kx] * x[xo + iy * w + ix]; } } }
      y[yo + oy * wo + ox] = a;
    }
  }
  return [y, ho, wo];
}
const tick = () => new Promise((r) => setTimeout(r, 0));
/** x: Float32Array(3*224*224) normalised CHW -> logits Float32Array(1000) */
export async function forward(H, x, onProgress) {
  let cur = x, h = H.size, w = H.size, saved = null, n = 0;
  for (const op of H.ops) {
    if (op.op === 'conv') {
      if (op.res === 'start') saved = cur;
      [cur, h, w] = conv(cur, h, w, op);
      if (op.act === 'relu6') for (let i = 0; i < cur.length; i++) cur[i] = cur[i] < 0 ? 0 : cur[i] > 6 ? 6 : cur[i];
      if (op.res === 'end') { for (let i = 0; i < cur.length; i++) cur[i] += saved[i]; saved = null; }
      onProgress?.(++n / H.ops.length); if (typeof window !== 'undefined' && n % 3 === 0) await tick();
    } else if (op.op === 'pool') { const c = cur.length / (h * w), o = new Float32Array(c); for (let i = 0; i < c; i++) { let a = 0; for (let j = 0; j < h * w; j++) a += cur[i * h * w + j]; o[i] = a / (h * w); } cur = o; h = w = 1; }
    else if (op.op === 'fc') { const o = new Float32Array(op.cout); for (let i = 0; i < op.cout; i++) { let a = op.B[i]; for (let j = 0; j < op.cin; j++) a += op.W[i * op.cin + j] * cur[j]; o[i] = a; } cur = o; }
  }
  return cur;
}
export function topK(logits, k = 5) {
  let mx = -Infinity; for (const v of logits) if (v > mx) mx = v; let z = 0; for (const v of logits) z += Math.exp(v - mx);
  return Array.from(logits.keys()).sort((a, b) => logits[b] - logits[a]).slice(0, k).map((i) => ({ index: i, prob: Math.exp(logits[i] - mx) / z }));
}
/** image source (ImageBitmap, HTMLImageElement, canvas) -> normalised CHW tensor via a centre crop of 87.5% of the shorter side */
export function preprocess(H, src) {
  const sz = H.size, cv = document.createElement('canvas'); cv.width = cv.height = sz; const cx = cv.getContext('2d', { willReadFrequently: true });
  const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height, side = Math.min(iw, ih) * H.crop, sx = (iw - side) / 2, sy = (ih - side) / 2;
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high'; cx.fillStyle = '#fff'; cx.fillRect(0, 0, sz, sz); cx.drawImage(src, sx, sy, side, side, 0, 0, sz, sz);
  const d = cx.getImageData(0, 0, sz, sz).data, t = new Float32Array(3 * sz * sz);
  for (let i = 0; i < sz * sz; i++) for (let c = 0; c < 3; c++) t[c * sz * sz + i] = (d[i * 4 + c] / 255 - H.mean[c]) / H.std[c];
  return t;
}
let P;
export function getModel(onProgress) {
  return P ||= (async () => {
    let buf, labels;
    if (typeof window === 'undefined') { const fs = await import('node:fs/promises'); const b = await fs.readFile(new URL(BIN, import.meta.url)); buf = new Uint8Array(b.buffer, b.byteOffset, b.byteLength); labels = JSON.parse(await fs.readFile(new URL(LABELS, import.meta.url), 'utf8')); }
    else {
      const [r, l] = await Promise.all([fetch(new URL(BIN, import.meta.url)), fetch(new URL(LABELS, import.meta.url))]); if (!r.ok || !l.ok) throw new Error('Could not load the model files'); labels = await l.json();
      const total = Number(r.headers.get('content-length')) || 7017292, chunks = []; let got = 0; const rd = r.body.getReader();
      for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; onProgress?.(got / total); }
      buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
    }
    return { H: loadModel(buf), labels };
  })().catch((e) => { P = null; throw e; });
}

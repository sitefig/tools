// ocr.js: offline OCR for printed Latin/English text. Zero dependencies, client-side only.
// Engine = our own from-scratch inference of the Tesseract 4/5 LSTM line recogniser, reading the official `eng.traineddata`
// of tessdata_fast (Apache-2.0, int8-quantised, ~400 KB of LSTM weights) shipped same-origin in data/ (see data/SOURCES.md).
// The only fetch is that static file, loaded lazily on first use and cached. No Tesseract code or WASM is used.
//
// Decoded formats (all little-endian):
//  * TessdataManager: int32 n(=24); n x int64 offsets (-1 = absent); components run to the next offset. Used indices:
//    17 = lstm, 21 = lstm-unicharset (text), 22 = lstm-recoder.
//  * lstm component = Network tree, then string network_str, int32 training_flags, training_iteration, sample_iteration,
//    null_char (=110 = CTC blank), float adam_beta, learning_rate, momentum.
//  * Network node: int8 0 (NT_NONE), string type ("Series","Input","Convolve","Tanh","Maxpool","XYTranspose","SummLSTM",
//    "LSTM","RTLReversed","Softmax"...), int8 training, int8 needs_backprop, int32 flags, ni, no, num_weights, string name,
//    then per type: Series/Reversed/XYTranspose = uint32 n + n children (+ uint32 + floats if flags&64); Input = 5 x int32
//    (batch,height,width,depth,loss); Convolve and Maxpool = 2 x int32; LSTM = int32 na + 4 weight matrices (CI,GI,GF1,GO);
//    Tanh/Softmax = 1 weight matrix. string = uint32 len + bytes.
//  * WeightMatrix: uint8 mode (1 = int8, 4 = adam, 128 = double scales); int8: int32 dim1(rows), int32 dim2(cols),
//    1 byte `empty` value, dim1*dim2 int8 weights, uint32 n + n doubles (per-row scale). Row = [inputs..., (LSTM: previous
//    output...), bias]; float weight = int8 * scale[row]. LSTM input vector = [x_t, h_{t-1}].
//  * Recoder: uint32 n + n x {int8 self_norm, int32 len, len x int32 code}. Unichar id -> code; code 110 = null (blank).
// Net used by eng: [1,36,0,1 Ct3,3,16 Mp3,3 Lfys48 Lfx96 Lrx96 Lfx192 O1c111]  (input height 36).
// Skips / ceilings: English (Latin script) only; horizontal text only (no vertical/rotated/handwriting); no dictionary or
// language model (the dawgs in the traineddata are not used); tables are read as text lines, not as cells; page layout =
// projection profiles + XY-cut, so complex magazine layouts, text on photos and large skew (> ~5 degrees) will degrade.
const CAT = 'Images – OCR';
const DATA = '../../data/eng.traineddata';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- model parsing
const T_LSTM = 17, T_UNICHARSET = 21, T_RECODER = 22;
const PLUMBED = new Set(['Series', 'Parallel', 'RTLReversed', 'TTBReversed', 'XYTranspose']);

export function loadModel(u8, opts = {}) {
  u8 = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const n = dv.getInt32(0, true);
  if (n < 23 || n > 64) throw new Error('Not a traineddata file');
  const offs = [];
  for (let i = 0; i < n; i++) offs.push(Number(dv.getBigInt64(4 + 8 * i, true)));
  const comp = (i) => {
    if (offs[i] < 0) throw new Error('traineddata has no component ' + i + ' (need a tessdata LSTM model)');
    const end = Math.min(...offs.filter((o) => o > offs[i]), u8.length);
    return u8.subarray(offs[i], end);
  };
  const lstm = comp(T_LSTM), v = new DataView(lstm.buffer, lstm.byteOffset, lstm.byteLength);
  let p = 0;
  const i32 = () => { const x = v.getInt32(p, true); p += 4; return x; };
  const str = () => { const l = i32(); let s = ''; for (let i = 0; i < l; i++) s += String.fromCharCode(lstm[p + i]); p += l; return s; };
  const wmat = () => {
    const mode = lstm[p++];
    if (!(mode & 1)) throw new Error('Only int8 (fast) models are supported');
    const rows = i32(), cols = i32(); p++; // `empty` value byte
    const w = new Int8Array(lstm.buffer, lstm.byteOffset + p, rows * cols); p += rows * cols;
    const k = i32(), sc = new Float64Array(k);
    for (let i = 0; i < k; i++) { sc[i] = mode & 128 ? v.getFloat64(p, true) : v.getFloat32(p, true); p += mode & 128 ? 8 : 4; }
    if (k !== rows) throw new Error('Bad weight scales');
    return { rows, cols, w, sc };
  };
  const net = () => {
    if (lstm[p++] !== 0) throw new Error('Bad network record');
    const type = str(); p += 2;
    const o = { type, flags: i32(), ni: i32(), no: i32() }; i32(); o.name = str();
    if (PLUMBED.has(type)) {
      const k = i32(); o.kids = [];
      for (let i = 0; i < k; i++) o.kids.push(net());
      if (o.flags & 64) p += 4 + 4 * i32();
    } else if (type === 'Input') { o.shape = [i32(), i32(), i32(), i32(), i32()]; }
    else if (type === 'Convolve' || type === 'Maxpool') { o.a = i32(); o.b = i32(); }
    else if (type === 'LSTM' || type === 'SummLSTM') { i32(); o.gates = [wmat(), wmat(), wmat(), wmat()]; }
    else if (type === 'Tanh' || type === 'Softmax' || type === 'Logistic' || type === 'Relu' || type === 'Linear') o.mat = wmat();
    else throw new Error('Unsupported network layer: ' + type);
    return o;
  };
  const root = net();
  const spec = str(); i32(); i32(); i32();
  const nullCode = i32();
  if (root.type !== 'Series' || root.kids[0].type !== 'Input') throw new Error('Unexpected network structure');

  // unicharset (text): line 0 = count, then "<char> <props> ..." per id; "NULL" = space
  const ut = new TextDecoder().decode(comp(T_UNICHARSET)).split('\n');
  const chars = [];
  for (let i = 1; i <= +ut[0]; i++) { const c = ut[i].split(' ')[0]; chars.push(c === 'NULL' ? ' ' : c); }
  // recoder: id -> code sequence; invert to code -> char for the (all single-code) eng recoder
  const rc = comp(T_RECODER), rv = new DataView(rc.buffer, rc.byteOffset, rc.byteLength);
  let q = 0;
  const cnt = rv.getUint32(q, true); q += 4;
  const codeChar = [], seqs = new Map();
  for (let id = 0; id < cnt; id++) {
    q++; const len = rv.getInt32(q, true); q += 4; const codes = [];
    for (let j = 0; j < len; j++) { codes.push(rv.getInt32(q, true)); q += 4; }
    const ch = chars[id];
    if (id < 3 && id > 0) continue; // Joined, Broken
    if (len === 1) { if (codes[0] !== nullCode && codeChar[codes[0]] === undefined) codeChar[codes[0]] = ch; } else seqs.set(codes.join(','), ch);
  }
  if (seqs.size) throw new Error('Multi-code recoders are not supported by this model');
  const height = root.kids[0].shape[1], nOut = root.no;
  if (!(height > 0) || nOut !== nullCode + 1) throw new Error('Inconsistent network output size');
  const layers = root.kids.slice(1).map(compile), engine = attach(layers, opts);
  return { height, nOut, nullCode, codeChar, spec, layers, wasm: engine.wasm };
}

// ---------------------------------------------------------------- matrix engine
// LSTM / softmax weights and their scratch buffers live in one Float32Array `F` (the buffer of a WebAssembly.Memory when SIMD
// wasm is available). gemm(wo, vo, oo, rows, n, nb, ldo) does out[oo + k*ldo + r] = dot(W[wo + r*n ..], v[vo + k*n ..]) for r < rows,
// k < nb (offsets in floats). The wasm kernel is assembled by hand below (~200 bytes, no toolchain, no library): it takes 4
// vectors at a time, f32x4 multiply-add, and needs n % 4 == 0 and nb % 4 == 0. Without WebAssembly SIMD the same layout is
// served by a plain JS loop (about 8x slower).
function wasmKernel() {
  const u = (n) => { const o = []; do { let b = n & 127; n >>>= 7; if (n) b |= 128; o.push(b); } while (n); return o; };
  const sec = (id, body) => [id, ...u(body.length), ...body];
  const vec = (items) => [...u(items.length), ...items.flat()];
  const I32 = 0x7f, V128 = 0x7b, ADD = [0x6a], MUL = [0x6c], SHL = [0x74];
  const get = (i) => [0x20, i], set = (i) => [0x21, i], c32 = (x) => [0x41, x]; // x < 64
  // params 0..6 = w v o rows n nb ldo (byte offsets for w v o); locals 7.. = r k j wp vp n4 (i32), a0 a1 a2 a3 wv (v128)
  const [w, v, o, rows, n, nb, ldo, r, k, j, wp, vp, n4, a0, a1, a2, a3, wv] = Array.from({ length: 18 }, (_, i) => i);
  const acc = [a0, a1, a2, a3];
  const vload = (addr) => [...addr.flat(), 0xfd, 0x00, 0x04, 0x00]; // v128.load align=16
  const lane = (a, l) => [...get(a), 0xfd, 0x1f, l]; // f32x4.extract_lane
  const loop = (cond, inner) => [0x02, 0x40, 0x03, 0x40, ...cond, 0x0d, 1, ...inner, 0x0b, 0x0b]; // block+loop, br_if exits the block
  const body = [
    ...get(n), ...c32(2), ...SHL, ...set(n4), ...c32(0), ...set(r),
    ...loop([...get(r), ...get(rows), 0x4e], [ // for r < rows
      ...get(w), ...get(r), ...get(n4), ...MUL, ...ADD, ...set(wp), ...c32(0), ...set(k),
      ...loop([...get(k), ...get(nb), 0x4e], [ // for k < nb step 4
        ...get(v), ...get(k), ...get(n4), ...MUL, ...ADD, ...set(vp),
        ...acc.flatMap((a) => [0xfd, 0x0c, ...new Array(16).fill(0), ...set(a)]), ...c32(0), ...set(j),
        ...loop([...get(j), ...get(n4), 0x4e], [ // for j < n4 step 16 bytes
          ...vload([get(wp), get(j), ADD]), ...set(wv),
          ...acc.flatMap((a, i) => [...get(a), ...get(wv), ...vload([get(vp), get(n4), c32(i), MUL, ADD, get(j), ADD]), 0xfd, 0xe6, 0x01, 0xfd, 0xe4, 0x01, ...set(a)]),
          ...get(j), ...c32(16), ...ADD, ...set(j), 0x0c, 0]),
        ...acc.flatMap((a, i) => [ // out[(k+i)*ldo + r] = horizontal sum of a
          ...get(k), ...c32(i), ...ADD, ...get(ldo), ...MUL, ...get(r), ...ADD, ...c32(2), ...SHL, ...get(o), ...ADD,
          ...lane(a, 0), ...lane(a, 1), 0x92, ...lane(a, 2), ...lane(a, 3), 0x92, 0x92, 0x38, 0x02, 0x00]),
        ...get(k), ...c32(4), ...ADD, ...set(k), 0x0c, 0]),
      ...get(r), ...c32(1), ...ADD, ...set(r), 0x0c, 0]),
    0x0b];
  const fn = [...u(2), 6, I32, 5, V128, ...body];
  return new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...sec(1, vec([[0x60, 7, I32, I32, I32, I32, I32, I32, I32, 0]])),
    ...sec(2, vec([[1, 0x65, 1, 0x6d, 2, 0, 1]])),
    ...sec(3, vec([[0]])),
    ...sec(7, vec([[1, 0x67, 0, 0]])),
    ...sec(10, vec([[...u(fn.length), ...fn]]))]);
}
const jsGemm = (F) => (wo, vo, oo, rows, n, nb, ldo) => {
  for (let r = 0; r < rows; r++) for (let k = 0; k < nb; k++) {
    let a = 0, b = 0, c = 0, d = 0, j = 0; const p = wo + r * n, q = vo + k * n;
    for (; j + 3 < n; j += 4) { a += F[p + j] * F[q + j]; b += F[p + j + 1] * F[q + j + 1]; c += F[p + j + 2] * F[q + j + 2]; d += F[p + j + 3] * F[q + j + 3]; }
    for (; j < n; j++) a += F[p + j] * F[q + j];
    F[oo + k * ldo + r] = a + b + c + d;
  }
};
function makeEngine(total, noWasm) {
  if (!noWasm) {
    try {
      const mem = new WebAssembly.Memory({ initial: Math.ceil((total * 4) / 65536) + 1 }), g = new WebAssembly.Instance(new WebAssembly.Module(wasmKernel()), { e: { m: mem } }).exports.g;
      return { F: new Float32Array(mem.buffer), gemm: (wo, vo, oo, rows, n, nb, ldo) => g(wo * 4, vo * 4, oo * 4, rows, n, nb, ldo), wasm: true };
    } catch { /* no SIMD */ }
  }
  const F = new Float32Array(total + 4);
  return { F, gemm: jsGemm(F), wasm: false };
}
const BATCH = 16, CHUNK = 32; // sequences per lockstep chunk; positions per softmax chunk
// place weights + scratch of LSTM and softmax layers into the engine memory
function attach(layers, opts = {}) {
  const todo = [];
  const walk = (ls) => ls.forEach((L) => { if (L.kids) walk(L.kids); if (L.Wc || (L.type === 'Softmax' && L.ni % 4 === 0)) todo.push(L); });
  walk(layers);
  let top = 0;
  const alloc = (n) => { const o = top; top += (n + 3) & ~3; return o; };
  for (const L of todo) {
    if (L.Wc) { const nc = L.ni + L.ns; L.wo = alloc(L.Wc.length); L.vo = alloc(BATCH * nc); L.po = alloc(BATCH * 4 * L.ns); L.so = alloc(BATCH * L.ns); }
    else { L.wo = alloc(L.W.length); L.vo = alloc((CHUNK + 4) * L.ni); L.po = alloc((CHUNK + 4) * L.no); }
  }
  const E = makeEngine(top, opts.noWasm);
  for (const L of todo) { E.F.set(L.Wc || L.W, L.wo); L.E = E; }
  return E;
}

// Dequantise to Float32 once. LSTM: Wc [4ns x (ni+ns)] (x part then recurrent part), b [4ns]; gate order CI(tanh) GI GF1 GO (logistic).
function dense(m) {
  const ni = m.cols - 1, W = new Float32Array(m.rows * ni), b = new Float32Array(m.rows);
  for (let r = 0; r < m.rows; r++) { const s = m.sc[r]; for (let j = 0; j < ni; j++) W[r * ni + j] = m.w[r * m.cols + j] * s; b[r] = m.w[r * m.cols + ni] * s; }
  return { W, b, ni, no: m.rows };
}
function compile(o) {
  const c = { type: o.type };
  if (o.kids) c.kids = o.kids.map(compile);
  if (o.type === 'Convolve') { c.hx = o.a; c.hy = o.b; }
  else if (o.type === 'Maxpool') { c.sx = o.a; c.sy = o.b; }
  else if (o.mat) Object.assign(c, dense(o.mat));
  else if (o.gates) {
    const ns = o.gates[0].rows, ni = o.gates[0].cols - 1 - ns;
    const nc = ni + ns, Wc = new Float32Array(4 * ns * nc), b = new Float32Array(4 * ns);
    o.gates.forEach((g, k) => {
      for (let r = 0; r < ns; r++) {
        const s = g.sc[r], R = k * ns + r;
        for (let j = 0; j < nc; j++) Wc[R * nc + j] = g.w[r * g.cols + j] * s;
        b[R] = g.w[r * g.cols + ni + ns] * s;
      }
    });
    Object.assign(c, { ni, ns, Wc, b });
  }
  return c;
}

// ---------------------------------------------------------------- forward pass (tensors are [H][W][C] Float32)
const sigm = (x) => 1 / (1 + Math.exp(-x));
function fc(L, t, act) { // per-position dense layer
  const { H, W, C, d } = t, n = H * W, no = L.no, ni = L.ni, out = new Float32Array(n * no);
  if (C !== ni) throw new Error('layer size mismatch');
  if (L.E) { // engine path: CHUNK positions at a time
    const { F, gemm } = L.E;
    for (let p0 = 0; p0 < n; p0 += CHUNK) {
      const m = Math.min(CHUNK, n - p0);
      F.set(d.subarray(p0 * ni, (p0 + m) * ni), L.vo);
      gemm(L.wo, L.vo, L.po, no, ni, (m + 3) & ~3, no);
      out.set(F.subarray(L.po, L.po + m * no), p0 * no);
    }
    for (let i = 0; i < n; i++) for (let r = 0; r < no; r++) out[i * no + r] += L.b[r];
  } else for (let i = 0; i < n; i++) for (let r = 0; r < no; r++) out[i * no + r] = L.b[r] + dot(L.W, r * ni, d, i * ni, ni);
  for (let i = 0; i < n; i++) {
    const oo = i * no;
    if (act === 'tanh') for (let r = 0; r < no; r++) out[oo + r] = Math.tanh(out[oo + r]);
    else if (act === 'softmax') {
      let m = -Infinity, z = 0;
      for (let r = 0; r < no; r++) if (out[oo + r] > m) m = out[oo + r];
      for (let r = 0; r < no; r++) { const e = Math.exp(out[oo + r] - m); out[oo + r] = e; z += e; }
      for (let r = 0; r < no; r++) out[oo + r] /= z;
    }
  }
  return { H, W, C: no, d: out };
}
function convolve(L, t) { // gather (2hy+1)x(2hx+1) zero-padded neighbourhoods into channels (x outer, y inner)
  const { H, W, C, d } = t, K = (2 * L.hx + 1) * (2 * L.hy + 1), out = new Float32Array(H * W * C * K);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let o = (y * W + x) * C * K;
    for (let dx = -L.hx; dx <= L.hx; dx++) for (let dy = -L.hy; dy <= L.hy; dy++, o += C) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
      for (let c = 0; c < C; c++) out[o + c] = d[(yy * W + xx) * C + c];
    }
  }
  return { H, W, C: C * K, d: out };
}
function maxpool(L, t) {
  const { H, W, C, d } = t, H2 = Math.ceil(H / L.sy), W2 = Math.ceil(W / L.sx), out = new Float32Array(H2 * W2 * C).fill(-Infinity);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (((y / L.sy) | 0) * W2 + ((x / L.sx) | 0)) * C, s = (y * W + x) * C;
    for (let c = 0; c < C; c++) if (d[s + c] > out[o + c]) out[o + c] = d[s + c];
  }
  return { H: H2, W: W2, C, d: out };
}
function transpose(t) {
  const { H, W, C, d } = t, out = new Float32Array(d.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out.set(d.subarray((y * W + x) * C, (y * W + x + 1) * C), (x * H + y) * C);
  return { H: W, W: H, C, d: out };
}
// dot product with 4 independent accumulators (hides FP-add latency)
function dot(W, o, v, vo, n) {
  let a = 0, b = 0, c = 0, d = 0, j = 0;
  for (; j + 3 < n; j += 4) { a += W[o + j] * v[vo + j]; b += W[o + j + 1] * v[vo + j + 1]; c += W[o + j + 2] * v[vo + j + 2]; d += W[o + j + 3] * v[vo + j + 3]; }
  for (; j < n; j++) a += W[o + j] * v[vo + j];
  return a + b + c + d;
}
// LSTM over many sequences at once. Every row of every tensor is one sequence (time = W); sequences are processed in lockstep
// chunks of BATCH so each weight row is loaded once and reused for the whole chunk. rev: run right-to-left; summary: keep only
// the last step. Cell: c = c*f + tanh(g)*i (clipped to +-100), h = tanh(c)*o.
function lstm(L, ts, rev, summary) {
  const { ns, ni, b } = L, g4 = 4 * ns, nc = ni + ns, seqs = [], { F, gemm } = L.E;
  const outs = ts.map((t) => {
    if (t.C !== ni) throw new Error('LSTM size mismatch');
    const o = { H: t.H, W: summary ? 1 : t.W, C: ns, d: new Float32Array(t.H * (summary ? 1 : t.W) * ns) };
    for (let y = 0; y < t.H; y++) seqs.push({ t, o, y });
    return o;
  });
  seqs.sort((p, q) => q.t.W - p.t.W);
  for (let c0 = 0; c0 < seqs.length; c0 += BATCH) {
    const chunk = seqs.slice(c0, c0 + BATCH), n = chunk.length, T = chunk[0].t.W;
    F.fill(0, L.vo, L.vo + BATCH * nc); F.fill(0, L.so, L.so + BATCH * ns);
    for (let s = 0; s < T; s++) {
      let act = n; while (act > 0 && chunk[act - 1].t.W <= s) act--; // sorted: finished sequences are a suffix
      for (let k = 0; k < act; k++) {
        const q = chunk[k], W = q.t.W, x = rev ? W - 1 - s : s;
        F.set(q.t.d.subarray((q.y * W + x) * ni, (q.y * W + x + 1) * ni), L.vo + k * nc);
      }
      gemm(L.wo, L.vo, L.po, g4, nc, (act + 3) & ~3, g4);
      for (let k = 0; k < act; k++) {
        const po = L.po + k * g4, so = L.so + k * ns, ho = L.vo + k * nc + ni;
        for (let j = 0; j < ns; j++) {
          const ci = Math.tanh(F[po + j] + b[j]), gi = sigm(F[po + ns + j] + b[ns + j]), gf = sigm(F[po + 2 * ns + j] + b[2 * ns + j]), go = sigm(F[po + 3 * ns + j] + b[3 * ns + j]);
          let c = F[so + j] * gf + ci * gi;
          c = c > 100 ? 100 : c < -100 ? -100 : c;
          F[so + j] = c; F[ho + j] = Math.tanh(c) * go;
        }
        const q = chunk[k], W = q.t.W;
        if (!summary) { const x = rev ? W - 1 - s : s; q.o.d.set(F.subarray(ho, ho + ns), (q.y * W + x) * ns); }
        else if (s === W - 1) q.o.d.set(F.subarray(ho, ho + ns), q.y * ns);
      }
    }
  }
  return outs;
}
const each = (ts, f) => ts.map(f);
function run(layers, ts) { // ts: array of tensors processed together
  for (const L of layers) {
    switch (L.type) {
      case 'Series': ts = run(L.kids, ts); break;
      case 'Convolve': ts = each(ts, (t) => convolve(L, t)); break;
      case 'Tanh': ts = each(ts, (t) => fc(L, t, 'tanh')); break;
      case 'Softmax': ts = each(ts, (t) => fc(L, t, 'softmax')); break;
      case 'Maxpool': ts = each(ts, (t) => maxpool(L, t)); break;
      case 'LSTM': ts = lstm(L, ts, false, false); break;
      case 'SummLSTM': ts = lstm(L, ts, false, true); break;
      case 'RTLReversed': ts = lstm(L.kids[0], ts, true, false); break;
      case 'XYTranspose': ts = each(run(L.kids, each(ts, transpose)), transpose); break;
      default: throw new Error('Unsupported layer ' + L.type);
    }
  }
  return ts;
}

// ---------------------------------------------------------------- line recognition
// Area-averaging (down) / bilinear (up) resize of an 8-bit grey image to (nw, nh).
export function resizeGray(src, w, h, nw, nh) {
  const tmp = new Float32Array(nw * h), out = new Uint8Array(nw * nh);
  const pass = (n, m, get, put) => { // one axis: m source samples -> n
    const sc = m / n;
    for (let i = 0; i < n; i++) {
      let a, b; // source interval [a,b)
      if (sc > 1) { a = i * sc; b = a + sc; } else { const c = (i + 0.5) * sc - 0.5; a = Math.max(0, Math.min(m - 1, c)); b = -1; }
      put(i, a, b);
    }
  };
  void pass;
  // horizontal
  const sx = w / nw;
  for (let y = 0; y < h; y++) for (let x = 0; x < nw; x++) {
    let v;
    if (sx > 1) {
      const a = x * sx, b = a + sx; let s = 0;
      for (let k = Math.floor(a); k < Math.ceil(b) && k < w; k++) s += src[y * w + k] * (Math.min(b, k + 1) - Math.max(a, k));
      v = s / sx;
    } else {
      const c = Math.max(0, Math.min(w - 1, (x + 0.5) * sx - 0.5)), k = Math.floor(c), f = c - k;
      v = src[y * w + k] * (1 - f) + src[y * w + Math.min(w - 1, k + 1)] * f;
    }
    tmp[y * nw + x] = v;
  }
  const sy = h / nh;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    let v;
    if (sy > 1) {
      const a = y * sy, b = a + sy; let s = 0;
      for (let k = Math.floor(a); k < Math.ceil(b) && k < h; k++) s += tmp[k * nw + x] * (Math.min(b, k + 1) - Math.max(a, k));
      v = s / sy;
    } else {
      const c = Math.max(0, Math.min(h - 1, (y + 0.5) * sy - 0.5)), k = Math.floor(c), f = c - k;
      v = tmp[k * nw + x] * (1 - f) + tmp[Math.min(h - 1, k + 1) * nw + x] * f;
    }
    out[y * nw + x] = v + 0.5;
  }
  return out;
}

// Network probabilities for line images (batched): lines = [{ gray, w, h }] -> [{ probs: Float32Array(T*nOut), T }]
export function linesProbs(model, lines, pad = 0) {
  const th = model.height, ts = lines.map(({ gray, w, h }) => {
    if (pad) { // background-coloured margin
      const W = w + 2 * pad, H = h + 2 * pad, g = new Uint8Array(W * H).fill(bgLevel(gray));
      for (let y = 0; y < h; y++) g.set(gray.subarray(y * w, (y + 1) * w), (y + pad) * W + pad);
      gray = g; w = W; h = H;
    }
    const nw = Math.max(4, Math.round((w * th) / h)), img = resizeGray(gray, w, h, nw, th);
    // NetworkIO::Copy2DImage style: map black..white to -1..1 (black/white = extremes of the line)
    let lo = 255, hi = 0;
    for (let i = 0; i < img.length; i++) { if (img[i] < lo) lo = img[i]; if (img[i] > hi) hi = img[i]; }
    const contrast = (hi - lo) / 2 || 1, d = new Float32Array(img.length);
    for (let i = 0; i < img.length; i++) d[i] = (img[i] - lo) / contrast - 1;
    return { H: th, W: nw, C: 1, d };
  });
  return run(model.layers, ts).map((o) => ({ probs: o.d, T: o.W * o.H }));
}
export const lineProbs = (model, gray, w, h, pad = 0) => linesProbs(model, [{ gray, w, h }], pad)[0];
function bgLevel(g) { const h = new Uint32Array(256); for (let i = 0; i < g.length; i++) h[g[i]]++; let c = 0, t = g.length * 0.9; for (let i = 0; i < 256; i++) { c += h[i]; if (c >= t) return i; } return 255; }

// CTC prefix beam search over recoder codes (every code is one character in the eng model).
export function ctcBeam(probs, T, K, nullCode, beam = 6) {
  let cur = new Map([['', { pb: 1, pnb: 0, seq: [] }]]);
  const cand = [];
  for (let t = 0; t < T; t++) {
    const o = t * K; cand.length = 0;
    for (let k = 0; k < K; k++) if (probs[o + k] > 1e-3 && k !== nullCode) cand.push(k);
    const nxt = new Map();
    const get = (key, seq) => { let e = nxt.get(key); if (!e) nxt.set(key, e = { pb: 0, pnb: 0, seq }); return e; };
    const pn = probs[o + nullCode];
    for (const [key, e] of cur) {
      const tot = e.pb + e.pnb, last = e.seq.length ? e.seq[e.seq.length - 1] : -1;
      get(key, e.seq).pb += tot * pn;
      if (last >= 0) get(key, e.seq).pnb += e.pnb * probs[o + last];
      for (const k of cand) {
        const p = probs[o + k], ns = e.seq.concat(k), nk = key + ',' + k;
        if (k === last) { get(nk, ns).pnb += e.pb * p; get(key, e.seq).pnb += e.pnb * p; } else get(nk, ns).pnb += tot * p;
      }
    }
    // the repeated-char branch above double counts into `key`; harmless for ranking (it is the stay-in-prefix path)
    const arr = [...nxt.entries()].sort((a, b) => (b[1].pb + b[1].pnb) - (a[1].pb + a[1].pnb)).slice(0, beam);
    let z = 0; for (const [, e] of arr) z += e.pb + e.pnb;
    cur = new Map(arr.map(([k, e]) => [k, { pb: e.pb / z, pnb: e.pnb / z, seq: e.seq }]));
  }
  let best = null, bp = -1;
  for (const e of cur.values()) if (e.pb + e.pnb > bp) { bp = e.pb + e.pnb; best = e; }
  return best.seq;
}
export function ctcGreedy(probs, T, K, nullCode) {
  const seq = []; let prev = -1;
  for (let t = 0; t < T; t++) {
    let m = 0; for (let k = 1; k < K; k++) if (probs[t * K + k] > probs[t * K + m]) m = k;
    if (m !== prev && m !== nullCode) seq.push(m);
    prev = m;
  }
  return seq;
}

// -> { text, conf (0-100), chars: [{ch, conf, x}] } where x is the network step (x pixel = x*3*scale)
export function recognizeLine(model, gray, w, h, opts = {}) { return decodeProbs(model, lineProbs(model, gray, w, h, opts.pad || 0), opts); }
export function recognizeLines(model, lines, opts = {}) { return linesProbs(model, lines, opts.pad || 0).map((p) => decodeProbs(model, p, opts)); }
function decodeProbs(model, { probs, T }, opts) {
  const K = model.nOut;
  const seq = opts.greedy ? ctcGreedy(probs, T, K, model.nullCode) : ctcBeam(probs, T, K, model.nullCode, opts.beam || 6);
  // per-character confidence: best frame probability for that code, scanning forward through the frames
  const chars = []; let t0 = 0;
  for (const k of seq) {
    let bt = -1, bp = -1, t = t0;
    for (; t < T; t++) { // first run of frames where this code is the argmax
      let m = 0; for (let j = 1; j < K; j++) if (probs[t * K + j] > probs[t * K + m]) m = j;
      if (m === k) { if (probs[t * K + k] > bp) { bp = probs[t * K + k]; bt = t; } } else if (bt >= 0) break;
    }
    if (bt < 0) { for (t = t0; t < T; t++) if (probs[t * K + k] > bp) { bp = probs[t * K + k]; bt = t; } }
    t0 = Math.max(t0, bt);
    chars.push({ ch: model.codeChar[k] ?? '?', conf: Math.round(bp * 100), x: bt });
  }
  let text = chars.map((c) => c.ch).join('').replace(/ {2,}/g, ' ').trim();
  const real = chars.filter((c) => c.ch !== ' ');
  const conf = real.length ? real.reduce((a, c) => a + c.conf, 0) / real.length : 0;
  return { text, conf, chars };
}

// ---------------------------------------------------------------- page pipeline
const odd = (n) => (Math.round(n) | 1);
export function toGray(img) { // RGBA ImageData-like -> Uint8Array grey (alpha composited on white)
  const { data, width: w, height: h } = img, g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    const a = data[j + 3] / 255, v = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    g[i] = a === 1 ? v : v * a + 255 * (1 - a);
  }
  return g;
}
export function otsu(g) {
  const hist = new Float64Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sB = 0, best = 0, th = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = g.length - wB; if (!wF) break;
    sB += t * hist[t];
    const d = sB / wB - (sum - sB) / wF, v = wB * wF * d * d;
    if (v > best) { best = v; th = t; }
  }
  return th;
}
// 1 = ink (assumes dark ink on light background). mode: 'otsu' | 'sauvola'
export function binarize(g, w, h, mode, win = 31) {
  const out = new Uint8Array(w * h);
  if (mode !== 'sauvola') { const t = otsu(g); for (let i = 0; i < g.length; i++) out[i] = g[i] <= t ? 1 : 0; return out; }
  const W1 = w + 1, S = new Float64Array(W1 * (h + 1)), Q = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0, rq = 0;
    for (let x = 0; x < w; x++) { const v = g[y * w + x]; rs += v; rq += v * v; S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + rs; Q[(y + 1) * W1 + x + 1] = Q[y * W1 + x + 1] + rq; }
  }
  const r = win >> 1, k = 0.34, R = 128;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), n = (x1 - x0) * (y1 - y0);
      const s = S[y1 * W1 + x1] - S[y0 * W1 + x1] - S[y1 * W1 + x0] + S[y0 * W1 + x0];
      const q = Q[y1 * W1 + x1] - Q[y0 * W1 + x1] - Q[y1 * W1 + x0] + Q[y0 * W1 + x0];
      const m = s / n, sd = Math.sqrt(Math.max(0, q / n - m * m));
      out[y * w + x] = g[y * w + x] <= m * (1 + k * (sd / R - 1)) ? 1 : 0;
    }
  }
  return out;
}
// 8-connected components -> { lab: Int32Array (0 = background, id = index+1), boxes: [{x0,y0,x1,y1,n}] } (x1,y1 inclusive)
export function components(bin, w, h) {
  const lab = new Int32Array(w * h), par = [0];
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!bin[i]) continue;
    let l = 0;
    for (const j of [x > 0 ? i - 1 : -1, y > 0 ? i - w : -1, x > 0 && y > 0 ? i - w - 1 : -1, x + 1 < w && y > 0 ? i - w + 1 : -1]) {
      if (j < 0 || !lab[j]) continue;
      const r = find(lab[j]);
      if (!l) l = r; else if (r !== l) { if (r < l) { par[l] = r; l = r; } else par[r] = l; }
    }
    if (!l) { l = par.length; par.push(l); }
    lab[i] = l;
  }
  const map = new Int32Array(par.length), boxes = [];
  for (let i = 0; i < lab.length; i++) {
    if (!lab[i]) continue;
    const r = find(lab[i]);
    if (!map[r]) { boxes.push({ x0: 1e9, y0: 1e9, x1: -1, y1: -1, n: 0 }); map[r] = boxes.length; }
    const b = boxes[map[r] - 1], x = i % w, y = (i / w) | 0;
    lab[i] = map[r];
    if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; b.n++;
  }
  return { lab, boxes };
}
const median = (a) => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
function textHeight(boxes) { return median(boxes.filter((b) => b.n >= 6 && b.y1 - b.y0 >= 3 && b.y1 - b.y0 < 300).map((b) => b.y1 - b.y0 + 1)); }

// small skew by projection-profile search over the ink pixels; returns degrees (positive = text runs downhill to the right)
export function estimateSkew(bin, w, h, range = 4) {
  const pts = []; const step = Math.max(1, Math.round(Math.sqrt((w * h) / 120000)));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (bin[y * w + x]) pts.push(x, y);
  if (pts.length < 200) return 0;
  const score = (deg) => {
    const t = Math.tan((deg * Math.PI) / 180), off = Math.abs(t) * w + 1, hist = new Float64Array(h + 2 * Math.ceil(off) + 2);
    for (let i = 0; i < pts.length; i += 2) hist[Math.round(pts[i + 1] - pts[i] * t + off)]++;
    let s = 0; for (let i = 1; i < hist.length; i++) { const d = hist[i] - hist[i - 1]; s += d * d; }
    return s;
  };
  let best = 0, bs = -1;
  for (let a = -range; a <= range + 1e-9; a += 0.25) { const s = score(a); if (s > bs) { bs = s; best = a; } }
  for (let a = best - 0.25; a <= best + 0.25 + 1e-9; a += 0.05) { const s = score(a); if (s > bs) { bs = s; best = a; } }
  return Math.abs(best) < 0.12 ? 0 : best;
}
export function rotateGray(g, w, h, deg, fill) { // rotate about centre, bilinear; keeps size
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = w / 2, cy = h / 2, out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - cx, dy = y - cy, sx = cx + dx * c - dy * s, sy = cy + dx * s + dy * c; // inverse mapping for rotation by -deg
    if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) { out[y * w + x] = fill; continue; }
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    out[y * w + x] = g[y0 * w + x0] * (1 - fx) * (1 - fy) + g[y0 * w + x1] * fx * (1 - fy) + g[y1 * w + x0] * (1 - fx) * fy + g[y1 * w + x1] * fx * fy + 0.5;
  }
  return out;
}

// coverage-gap finder: ids of boxes -> widest empty gap strictly inside the extent along an axis ('x' | 'y')
function widestGap(boxes, ids, axis, minSize) {
  const k0 = axis === 'x' ? 'x0' : 'y0', k1 = axis === 'x' ? 'x1' : 'y1';
  let lo = 1e9, hi = -1;
  for (const i of ids) { const b = boxes[i]; if (Math.max(b.x1 - b.x0, b.y1 - b.y0) < minSize) continue; if (b[k0] < lo) lo = b[k0]; if (b[k1] > hi) hi = b[k1]; }
  if (hi < lo) return null;
  const cov = new Int32Array(hi - lo + 2);
  for (const i of ids) { const b = boxes[i]; if (Math.max(b.x1 - b.x0, b.y1 - b.y0) < minSize) continue; cov[b[k0] - lo]++; cov[b[k1] - lo + 1]--; }
  let run = 0, best = null, gs = -1;
  for (let p = 0; p <= hi - lo + 1; p++) {
    run += cov[p];
    if (run === 0 && p <= hi - lo) { if (gs < 0) gs = p; } else if (gs >= 0) { if (!best || p - gs > best.size) best = { a: lo + gs, b: lo + p, size: p - gs }; gs = -1; }
  }
  return best && best.a > lo ? best : null;
}
// bands of consecutive rows covered by the boxes (row bands = text lines)
function rowBands(boxes, ids) {
  let lo = 1e9, hi = -1;
  for (const i of ids) { if (boxes[i].y0 < lo) lo = boxes[i].y0; if (boxes[i].y1 > hi) hi = boxes[i].y1; }
  if (hi < lo) return [];
  const cov = new Int32Array(hi - lo + 2);
  for (const i of ids) { cov[boxes[i].y0 - lo]++; cov[boxes[i].y1 - lo + 1]--; }
  const out = []; let run = 0, s = -1;
  for (let p = 0; p <= hi - lo + 1; p++) { run += cov[p]; if (run > 0 && s < 0) s = p; else if (run === 0 && s >= 0) { out.push([lo + s, lo + p - 1]); s = -1; } }
  return out;
}
const extentOf = (boxes, ids) => { let x0 = 1e9, x1 = -1; for (const i of ids) { x0 = Math.min(x0, boxes[i].x0); x1 = Math.max(x1, boxes[i].x1); } return x1 - x0 + 1; };

// XY-cut -> [{ ids, table }] in reading order
export function xyCut(boxes, ids, th, depth = 0) {
  if (ids.length < 2 || depth > 12) return [{ ids, table: false }];
  const vg = widestGap(boxes, ids, 'x', th * 0.3);
  if (vg && vg.size >= th * 1.5) {
    const L = ids.filter((i) => (boxes[i].x0 + boxes[i].x1) / 2 < (vg.a + vg.b) / 2), R = ids.filter((i) => !L.includes(i));
    if (L.length && R.length && Math.min(extentOf(boxes, L), extentOf(boxes, R)) >= 4 * th) {
      const bl = rowBands(boxes, L), br = rowBands(boxes, R);
      const ov = (a, B) => B.some((b) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 0.5 * (a[1] - a[0]));
      const aligned = bl.length >= 3 && bl.filter((a) => ov(a, br)).length >= 0.7 * bl.length && br.filter((a) => ov(a, bl)).length >= 0.7 * br.length;
      if (aligned && Math.min(extentOf(boxes, L), extentOf(boxes, R)) <= 15 * th) return [{ ids, table: true }];
      return [...xyCut(boxes, L, th, depth + 1), ...xyCut(boxes, R, th, depth + 1)];
    }
  }
  const hg = widestGap(boxes, ids, 'y', th * 0.3);
  if (hg && hg.size >= th * 1.8) {
    const U = ids.filter((i) => (boxes[i].y0 + boxes[i].y1) / 2 < (hg.a + hg.b) / 2), D = ids.filter((i) => !U.includes(i));
    if (U.length && D.length) return [...xyCut(boxes, U, th, depth + 1), ...xyCut(boxes, D, th, depth + 1)];
  }
  return [{ ids, table: false }];
}

// text lines of one block: [{ segs: [{x0,y0,x1,y1,ids}] }]
function blockLines(boxes, ids, th, table) {
  const bands = rowBands(boxes, ids);
  // split over-tall bands (touching lines) at profile valleys
  const hs = bands.map((b) => b[1] - b[0] + 1), ref = hs.length >= 3 ? median(hs) : 2.4 * th;
  const cut = [];
  for (const b of bands) {
    const H = b[1] - b[0] + 1, n = Math.round(H / ref);
    if (H > 1.7 * ref && n > 1) {
      const prof = new Float64Array(H);
      for (const i of ids) { const bx = boxes[i]; if (bx.y1 < b[0] || bx.y0 > b[1]) continue; for (let y = Math.max(bx.y0, b[0]); y <= Math.min(bx.y1, b[1]); y++) prof[y - b[0]] += bx.n / (bx.y1 - bx.y0 + 1); }
      let s = b[0];
      for (let k = 1; k < n; k++) {
        const e = Math.round((k * H) / n), r = Math.max(2, Math.round(H / n / 4));
        let m = e, mv = 1e18;
        for (let y = Math.max(1, e - r); y <= Math.min(H - 2, e + r); y++) if (prof[y] < mv) { mv = prof[y]; m = y; }
        cut.push([s, b[0] + m - 1]); s = b[0] + m;
      }
      cut.push([s, b[1]]);
    } else cut.push(b);
  }
  const lines = cut.map(() => []);
  for (const i of ids) {
    const cy = (boxes[i].y0 + boxes[i].y1) / 2;
    let k = cut.findIndex((b) => cy >= b[0] && cy <= b[1]);
    if (k < 0) k = cut.findIndex((b) => cy < b[0]); if (k < 0) k = cut.length - 1;
    lines[k].push(i);
  }
  const gapMin = table ? 1.5 * th : 5 * th, out = [];
  for (const l of lines) {
    if (!l.length) continue;
    l.sort((a, b) => boxes[a].x0 - boxes[b].x0);
    const segs = []; let cur = [l[0]], right = boxes[l[0]].x1;
    for (let k = 1; k < l.length; k++) {
      const b = boxes[l[k]];
      if (b.x0 - right > gapMin) { segs.push(cur); cur = []; }
      cur.push(l[k]); right = Math.max(right, b.x1);
    }
    segs.push(cur);
    const S = segs.map((s) => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const i of s) { const b = boxes[i]; x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); } return { x0, y0, x1, y1, ids: s }; });
    const ink = S.reduce((a, s) => a + s.ids.reduce((q, i) => q + boxes[i].n, 0), 0);
    if (ink < Math.max(4, th * th * 0.05)) continue; // specks
    out.push({ segs: S });
  }
  return out;
}

// Full pipeline for RGBA pixel data. opts: invert 'auto'|true|false, threshold 'auto'|'otsu'|'sauvola', scale 'auto'|n, deskew bool, onProgress(done,total)
export async function ocrImageData(model, imageData, opts = {}) {
  const o = { invert: 'auto', threshold: 'auto', scale: 'auto', deskew: true, ...opts };
  let w = imageData.width, h = imageData.height, g = toGray(imageData), info = {};
  if (w * h > 24e6) throw new Error('Image too large (over 24 megapixels)');
  let t0 = otsu(g), dark = 0;
  for (let i = 0; i < g.length; i++) if (g[i] <= t0) dark++;
  const inv = o.invert === 'auto' ? dark > g.length * 0.5 : !!o.invert;
  if (inv) for (let i = 0; i < g.length; i++) g[i] = 255 - g[i];
  info.inverted = inv;
  const mode0 = () => (o.threshold === 'auto' ? 'otsu' : o.threshold);
  let bin = binarize(g, w, h, mode0() === 'sauvola' ? 'sauvola' : 'otsu', 31), cc = components(bin, w, h), th = textHeight(cc.boxes);
  // scale up small text (also helps segmentation of tiny glyphs)
  let sc = o.scale === 'auto' ? (th && th < 9 ? Math.min(3, Math.round((16 / th) * 2) / 2) : 1) : +o.scale || 1;
  if (sc > 1 && w * sc * h * sc <= 16e6) {
    const nw = Math.round(w * sc), nh = Math.round(h * sc);
    g = resizeGray(g, w, h, nw, nh); w = nw; h = nh;
  } else sc = 1;
  info.scale = sc;
  const fill = bgLevel(g);
  const prep = () => {
    const win = odd(Math.max(15, (th || 12) * sc * 2.5));
    let mode = o.threshold;
    if (mode === 'auto') { // uneven background -> adaptive
      const bs = 48, means = []; for (let y = 0; y + bs <= h; y += bs) for (let x = 0; x + bs <= w; x += bs) { let s = 0, mx = 0; for (let yy = y; yy < y + bs; yy += 3) for (let xx = x; xx < x + bs; xx += 3) { const v = g[yy * w + xx]; s += v; if (v > mx) mx = v; } means.push(mx); }
      const mm = median(means); mode = means.some((v) => Math.abs(v - mm) > 40) ? 'sauvola' : 'otsu';
    }
    info.threshold = mode;
    bin = binarize(g, w, h, mode, win); cc = components(bin, w, h); th = textHeight(cc.boxes);
  };
  prep();
  if (o.deskew && th) {
    const a = estimateSkew(bin, w, h);
    if (a) { g = rotateGray(g, w, h, a, fill); prep(); }
    info.skew = a;
  }
  if (!th) return { text: '', lines: [], blocks: [], conf: 0, info, width: w, height: h, boxes: [] };
  // drop obvious non-text components (photos, rules, frames)
  const ids = [];
  cc.boxes.forEach((b, i) => {
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    if (bh > 12 * th || (bw > 30 * th && bh < 0.5 * th) || (bh > 4 * th && bw > 4 * th && b.n > 0.7 * bw * bh) || (b.n < 3 && bw < 2 && bh < 2)) return;
    ids.push(i);
  });
  const blocks = xyCut(cc.boxes, ids, th), lineList = [];
  blocks.forEach((b, bi) => blockLines(cc.boxes, b.ids, th, b.table).forEach((l) => lineList.push({ block: bi, table: b.table, segs: l.segs })));
  // reference full-line height (ascender..descender) for lines that lack tall glyphs
  const full = lineList.flatMap((l) => l.segs.map((s) => s.y1 - s.y0 + 1)).sort((a, b) => a - b);
  const Href = full.length >= 3 ? full[Math.floor(full.length * 0.7)] : 0;
  // assign comps to lines so neighbours' ink can be blanked out of a crop
  const owner = new Int32Array(cc.boxes.length + 1).fill(-1);
  let nSeg = 0; lineList.forEach((l) => l.segs.forEach((s) => { s.k = nSeg++; for (const i of s.ids) owner[i + 1] = s.k; }));
  const jobs = [];
  for (const l of lineList) for (const s of l.segs) {
    let y0 = s.y0, y1 = s.y1;
    if (Href && y1 - y0 + 1 < 0.62 * Href) { // x-height-only line ("can", "...") -> estimate a full-height box around the baseline
      const base = y1 + 1 - (s.ids.length > 2 ? 0 : 0); y0 = Math.min(y0, Math.round(base - 0.74 * Href)); y1 = Math.max(y1, Math.round(base + 0.2 * Href));
    }
    const pad = Math.max(2, Math.min(10, Math.round((+o.padC || 0.1) * (y1 - y0 + 1)))), px0 = Math.max(0, s.x0 - pad), px1 = Math.min(w - 1, s.x1 + pad), py0 = Math.max(0, y0 - pad), py1 = Math.min(h - 1, y1 + pad);
    const cw = px1 - px0 + 1, ch = py1 - py0 + 1, crop = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = (py0 + y) * w + px0 + x, lb = cc.lab[i];
      crop[y * cw + x] = lb && owner[lb] !== s.k && owner[lb] >= 0 ? fill : g[i];
    }
    s.job = { crop, cw, ch, box: { x: px0, y: py0, w: cw, h: ch } };
    jobs.push(s);
  }
  let done = 0;
  jobs.sort((p, q) => q.job.cw / q.job.ch - p.job.cw / p.job.ch);
  for (let i = 0; i < jobs.length; i += 16) {
    const grp = jobs.slice(i, i + 16), rs = recognizeLines(model, grp.map((s) => ({ gray: s.job.crop, w: s.job.cw, h: s.job.ch })), { greedy: o.greedy, beam: o.beam });
    grp.forEach((s, k) => { s.text = rs[k].text; s.conf = rs[k].conf; s.chars = rs[k].chars; s.box = s.job.box; delete s.job; });
    done += grp.length;
    if (opts.onProgress) { opts.onProgress(done, jobs.length); await new Promise((r2) => setTimeout(r2, 0)); }
  }
  const lines = lineList.map((l) => ({ block: l.block, table: l.table, text: l.segs.map((s) => s.text).filter(Boolean).join(l.table ? '\t' : '  '), conf: l.segs.length ? l.segs.reduce((a, s) => a + s.conf, 0) / l.segs.length : 0, boxes: l.segs.map((s) => s.box) }));
  let text = '', pb = -1;
  for (const l of lines) { if (!l.text) continue; if (pb >= 0 && l.block !== pb) text += '\n'; text += l.text + '\n'; pb = l.block; }
  const cs = lines.filter((l) => l.text); 
  return { text: text.replace(/\n+$/, ''), lines, conf: cs.length ? cs.reduce((a, l) => a + l.conf, 0) / cs.length : 0, info, width: w, height: h, gray: opts.keepImage ? g : undefined };
}

// ---------------------------------------------------------------- tools (browser)
let modelP;
async function readData() {
  if (typeof window === 'undefined') {
    const fs = await import('node:fs/promises');
    return new Uint8Array(await fs.readFile(new URL(DATA, import.meta.url)));
  }
  const r = await fetch(new URL(DATA, import.meta.url));
  if (!r.ok) throw new Error(`Could not load the OCR model (HTTP ${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}
export function getModel() {
  return modelP ||= readData().then((u8) => loadModel(u8)).catch((e) => { modelP = null; throw e; });
}
async function decode(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error(`${file.name}: cannot decode this image (use PNG, JPEG, WebP, GIF or BMP)`); }
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0); bmp.close?.();
  return x.getImageData(0, 0, c.width, c.height);
}
const SCALES = { auto: 'auto', '1x': 1, '2x': 2, '3x': 3 };
const engineOpts = (o) => ({
  invert: { auto: 'auto', off: false, on: true }[o.invert] ?? 'auto',
  threshold: { auto: 'auto', otsu: 'otsu', adaptive: 'sauvola' }[o.threshold] ?? 'auto',
  scale: SCALES[o.scale] ?? 'auto', deskew: o.deskew !== false,
});
const COMMON = [
  { id: 'lang', label: 'Language', type: 'select', choices: ['eng'], def: 'eng' },
  { id: 'invert', label: 'Invert (light text on dark)', type: 'select', choices: ['auto', 'off', 'on'], def: 'auto' },
  { id: 'threshold', label: 'Threshold', type: 'select', choices: ['auto', 'otsu', 'adaptive'], def: 'auto' },
  { id: 'scale', label: 'Scale up small text', type: 'select', choices: ['auto', '1x', '2x', '3x'], def: 'auto' },
  { id: 'deskew', label: 'Deskew', type: 'checkbox', def: true },
];

export default [
  {
    id: 'ocr-image-to-text', cat: CAT, title: 'Image to Text (OCR)',
    desc: 'Extract printed English text from screenshots, scans and photos, entirely in your browser (LSTM recogniser, no upload).',
    inputs: 0, dom: true, file: { accept: 'image/*', multiple: true },
    opts: [...COMMON, { id: 'conf', label: 'Show per-line confidence', type: 'checkbox', def: false }],
    run: async (_in, o, files) => {
      if (!files.length) throw new Error('Choose one or more images');
      const model = await getModel(), parts = [];
      for (const f of files) {
        const r = await ocrImageData(model, await decode(f), engineOpts(o));
        const body = o.conf ? r.lines.filter((l) => l.text).map((l) => `[${String(Math.round(l.conf)).padStart(3)}%] ${l.text}`).join('\n') : r.text;
        parts.push((files.length > 1 ? `=== ${f.name} ===\n` : '') + (body || '(no text found)') + (o.conf ? `\n(average confidence ${r.conf.toFixed(0)}%)` : ''));
      }
      const text = parts.join('\n\n');
      return { text, blob: new Blob([text + '\n'], { type: 'text/plain' }), filename: (files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : 'ocr') + '.txt' };
    },
  },
  {
    id: 'ocr-line-debug', cat: CAT, title: 'OCR Layout Debugger',
    desc: 'Shows the text lines and blocks the OCR found on an image (boxes, reading order, per-line confidence) to see why a scan reads badly.',
    inputs: 0, dom: true, file: { accept: 'image/*', multiple: false },
    opts: COMMON,
    run: async (_in, o, files) => {
      if (!files.length) throw new Error('Choose an image');
      const model = await getModel(), r = await ocrImageData(model, await decode(files[0]), { ...engineOpts(o), keepImage: true });
      const k = Math.min(1, 3000 / Math.max(r.width, r.height)), c = document.createElement('canvas');
      c.width = Math.round(r.width * k); c.height = Math.round(r.height * k);
      const x = c.getContext('2d'), id = x.createImageData(r.width, r.height);
      for (let i = 0; i < r.gray.length; i++) { id.data[4 * i] = id.data[4 * i + 1] = id.data[4 * i + 2] = r.gray[i]; id.data[4 * i + 3] = 255; }
      const tmp = document.createElement('canvas'); tmp.width = r.width; tmp.height = r.height; tmp.getContext('2d').putImageData(id, 0, 0);
      x.drawImage(tmp, 0, 0, c.width, c.height);
      x.font = '12px sans-serif'; x.lineWidth = 1.5;
      r.lines.forEach((l, i) => l.boxes.forEach((b) => {
        const hue = (l.block * 67) % 360;
        x.strokeStyle = `hsl(${hue} 80% ${l.conf < 70 ? 40 : 45}%)`; x.fillStyle = x.strokeStyle;
        if (l.conf < 70) x.setLineDash([4, 3]); else x.setLineDash([]);
        x.strokeRect(b.x * k, b.y * k, b.w * k, b.h * k);
        x.fillText(`${i + 1}${l.table ? 't' : ''} ${Math.round(l.conf)}%`, b.x * k + 2, Math.max(10, b.y * k - 2));
      }));
      const lowest = r.lines.filter((l) => l.text).sort((a, b) => a.conf - b.conf).slice(0, 5).map((l) => `  ${Math.round(l.conf)}%  ${l.text.slice(0, 80)}`);
      return { canvas: c, text: `${r.lines.length} lines in ${new Set(r.lines.map((l) => l.block)).size} blocks, average confidence ${r.conf.toFixed(0)}%\nprocessed ${r.width}x${r.height} (scale ${r.info.scale}, skew ${(r.info.skew || 0).toFixed(2)} deg, ${r.info.threshold}${r.info.inverted ? ', inverted' : ''})\nleast confident lines (dashed boxes < 70%):\n${lowest.join('\n')}` };
    },
  },
];
void esc;

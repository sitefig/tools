// HEIC / HEIF decoder for every browser: pure JavaScript, zero dependencies, written from the ISO/IEC 23008-2 (HEVC) and
// ISO/IEC 23008-12 (HEIF) specifications. No third-party code. Tool id: heic-decoder (cat 'Images – Extra').
// Exports (for Node tests too): decodeHeic(u8) -> {width,height,rgba,info}, decodeHeicAsync(u8, onProgress), decodeHeicGen,
//   decodeHevcAnnexB(u8) -> pictures with raw Y/Cb/Cr planes (bit-exactness tests), parseHeif(u8).
//
// Container: ftyp, meta (hdlr pitm iinf/infe iloc[construction 0 and 1, multi-extent, v0-v2] iref[dimg thmb cdsc auxl]
//   iprp/ipco/ipma: ispe colr(nclx; ICC kept raw) pixi hvcC irot imir clap), 'grid' derived images, primary item.
// HEVC (intra / I slices only, which is all a still image needs): Main, Main Still Picture, Main 10 and the RExt formats
//   4:0:0, 4:2:0, 4:2:2, 4:4:4 at 8-12 bit; multiple slices, dependent slice segments, tiles, wavefront (WPP), CABAC,
//   35 intra modes with reference filtering/strong smoothing/boundary smoothing, DST/DCT 4-32, transform skip (incl. larger
//   RExt sizes), sign data hiding, scaling lists (default/SPS/PPS, 32x32 chroma), cu_qp_delta, chroma QP offsets,
//   cu_transquant_bypass, PCM, deblocking, SAO (incl. log2_sao_offset_scale).
// Not supported (a clear error is thrown): P/B slices, RExt tools extended_precision / implicit+explicit RDPCM /
//   transform-skip rotation+context / persistent rice / CABAC bypass alignment / cross-component prediction / chroma QP
//   offset lists, separate colour planes, SCC/multilayer, 'iovl' overlays, AVIF, alpha/depth auxiliary images (ignored),
//   ICC/Display-P3 colour management (pixel values are used as stored; matrix/range come from the nclx box, default BT.601).
// Notes: entry_point offsets are not needed (each substream starts where the CABAC terminate bin ends); only the primary
//   still of a multi-image file is decoded; chroma is upsampled bilinearly (tiles are converted independently, so the
//   chroma of a grid tile clamps at the tile border).

// ---------------------------------------------------------------- CABAC tables
const LPS_TAB = new Uint8Array([
  128, 176, 208, 240, 128, 167, 197, 227, 128, 158, 187, 216, 123, 150, 178, 205, 116, 142, 169, 195, 111, 135, 160, 185, 105, 128, 152, 175, 100, 122, 144, 166,
  95, 116, 137, 158, 90, 110, 130, 150, 85, 104, 123, 142, 81, 99, 117, 135, 77, 94, 111, 128, 73, 89, 105, 122, 69, 85, 100, 116, 66, 80, 95, 110,
  62, 76, 90, 104, 59, 72, 86, 99, 56, 69, 81, 94, 53, 65, 77, 89, 51, 62, 73, 85, 48, 59, 69, 80, 46, 56, 66, 76, 43, 53, 63, 72,
  41, 50, 59, 69, 39, 48, 56, 65, 37, 45, 54, 62, 35, 43, 51, 59, 33, 41, 48, 56, 32, 39, 46, 53, 30, 37, 43, 50, 29, 35, 41, 48,
  27, 33, 39, 45, 26, 31, 37, 43, 24, 30, 35, 41, 23, 28, 33, 39, 22, 27, 32, 37, 21, 26, 30, 35, 20, 24, 29, 33, 19, 23, 27, 31,
  18, 22, 26, 30, 17, 21, 25, 28, 16, 20, 23, 27, 15, 19, 22, 25, 14, 18, 21, 24, 14, 17, 20, 23, 13, 16, 19, 22, 12, 15, 18, 21,
  12, 14, 17, 20, 11, 14, 16, 19, 11, 13, 15, 18, 10, 12, 15, 17, 10, 12, 14, 16, 9, 11, 13, 15, 9, 11, 12, 14, 8, 10, 12, 14,
  8, 9, 11, 13, 7, 9, 11, 12, 7, 9, 10, 12, 7, 8, 10, 11, 6, 8, 9, 11, 6, 7, 9, 10, 6, 7, 8, 9, 2, 2, 2, 2]);
const TRANS_LPS = [0, 0, 1, 2, 2, 4, 4, 5, 6, 7, 8, 9, 9, 11, 11, 12, 13, 13, 15, 15, 16, 16, 18, 18, 19, 19, 21, 21, 22, 22, 23, 24,
  24, 25, 26, 26, 27, 27, 28, 29, 29, 30, 30, 30, 31, 32, 32, 33, 33, 33, 34, 34, 35, 35, 35, 36, 36, 36, 37, 37, 37, 38, 38, 63];
const NEXT_MPS = new Uint8Array(128), NEXT_LPS = new Uint8Array(128);
for (let p = 0; p < 64; p++) for (let m = 0; m < 2; m++) {
  NEXT_MPS[p << 1 | m] = (p < 62 ? p + 1 : p) << 1 | m;
  NEXT_LPS[p << 1 | m] = TRANS_LPS[p] << 1 | (p === 0 ? 1 - m : m);
}

// context index layout (I slices only)
const C_SAO_MERGE = 0, C_SAO_TYPE = 1, C_SPLIT_CU = 2, C_TQB = 5, C_PART = 6, C_PREV_INTRA = 7, C_CHROMA_PRED = 8, C_SPLIT_TF = 9,
  C_CBF_L = 12, C_CBF_C = 14, C_QPD = 19, C_TSKIP = 21, C_LASTX = 23, C_LASTY = 41, C_CSBF = 59, C_SIG = 63, C_G1 = 105, C_G2 = 129, C_N = 135;
const LAST_INIT = [110, 110, 124, 125, 140, 153, 125, 127, 140, 109, 111, 143, 127, 111, 79, 108, 123, 63];
const CTX_INIT = new Uint8Array([
  153, 200, 139, 141, 157, 154, 184, 184, 63, 153, 138, 138, 111, 141, 94, 138, 182, 154, 154, 154, 154, 139, 139,
  ...LAST_INIT, ...LAST_INIT, 91, 171, 134, 141,
  111, 111, 125, 110, 110, 94, 124, 108, 124, 107, 125, 141, 179, 153, 125, 107, 125, 141, 179, 153, 125, 107, 125, 141, 179, 153, 125, 140, 139, 182, 182, 152, 136, 152, 136, 153, 136, 139, 111, 136, 139, 111,
  140, 92, 137, 138, 140, 152, 138, 139, 153, 74, 149, 92, 139, 107, 122, 152, 140, 179, 166, 182, 140, 227, 122, 197,
  138, 153, 136, 167, 152, 152]);
if (CTX_INIT.length !== C_N) throw new Error('ctx table size');

// ---------------------------------------------------------------- scans
function makeScans() {
  const S = [[], [], []];
  for (let lg = 0; lg <= 3; lg++) {
    const n = 1 << lg, cnt = n * n;
    const dx = new Uint8Array(cnt), dy = new Uint8Array(cnt);
    let i = 0, x = 0, y = 0;
    for (let stop = false; !stop;) {
      while (y >= 0) { if (x < n && y < n) { dx[i] = x; dy[i] = y; i++; } y--; x++; }
      y = x; x = 0; if (i >= cnt) stop = true;
    }
    const hx = new Uint8Array(cnt), hy = new Uint8Array(cnt), vx = new Uint8Array(cnt), vy = new Uint8Array(cnt);
    for (let k = 0; k < cnt; k++) { hx[k] = k % n; hy[k] = (k / n) | 0; vx[k] = (k / n) | 0; vy[k] = k % n; }
    [[dx, dy], [hx, hy], [vx, vy]].forEach(([sx, sy], si) => {
      const inv = new Uint8Array(cnt);
      for (let k = 0; k < cnt; k++) inv[sy[k] * n + sx[k]] = k;
      S[si][lg] = { x: sx, y: sy, inv };
    });
  }
  return S;
}
const SCANS = makeScans();
const SIG_PAT = (() => { // sigCtx pattern for 8x8+ blocks: [prevCsbf][yP*4+xP]
  const t = new Uint8Array(64);
  for (let p = 0; p < 4; p++) for (let yP = 0; yP < 4; yP++) for (let xP = 0; xP < 4; xP++) {
    let v;
    if (p === 0) v = xP + yP === 0 ? 2 : xP + yP < 3 ? 1 : 0;
    else if (p === 1) v = yP === 0 ? 2 : yP === 1 ? 1 : 0;
    else if (p === 2) v = xP === 0 ? 2 : xP === 1 ? 1 : 0;
    else v = 2;
    t[p * 16 + yP * 4 + xP] = v;
  }
  return t;
})();
const CTX_IDX_MAP4 = new Uint8Array([0, 1, 4, 5, 2, 3, 4, 5, 6, 6, 8, 8, 7, 7, 8, 8]);

// ---------------------------------------------------------------- transforms
const DCT_T = [64, 90, 90, 90, 89, 88, 87, 85, 83, 82, 80, 78, 75, 73, 70, 67, 64, 61, 57, 54, 50, 46, 43, 38, 36, 31, 25, 22, 18, 13, 9, 4, 0];
const DCT_MAT = (() => {
  const mats = [];
  for (let lg = 2; lg <= 5; lg++) {
    const n = 1 << lg, m = new Int32Array(n * n), f = 32 / n;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) {
      if (k === 0) { m[j] = 64; continue; }
      let a = (k * f * (2 * j + 1)) % 128;
      if (a > 64) a = 128 - a;
      m[k * n + j] = a > 32 ? -DCT_T[64 - a] : DCT_T[a];
    }
    mats[lg] = m;
  }
  return mats;
})();
const DST_MAT = new Int32Array([29, 55, 74, 84, 74, 74, 0, -74, 84, -29, -74, 55, 55, -84, 74, -29]);

const INTRA_ANGLE = [0, 0, 32, 26, 21, 17, 13, 9, 5, 2, 0, -2, -5, -9, -13, -17, -21, -26, -32, -26, -21, -17, -13, -9, -5, -2, 0, 2, 5, 9, 13, 17, 21, 26, 32];
const INV_ANGLE = { 11: -4096, 12: -1638, 13: -910, 14: -630, 15: -482, 16: -390, 17: -315, 18: -256, 19: -315, 20: -390, 21: -482, 22: -630, 23: -910, 24: -1638, 25: -4096 };
const MODE_422 = [0, 1, 2, 2, 2, 2, 3, 5, 7, 8, 10, 12, 13, 15, 17, 18, 19, 20, 21, 22, 23, 23, 24, 24, 25, 25, 26, 27, 27, 28, 28, 29, 29, 30, 31];
const QPC_TAB = [29, 30, 31, 32, 33, 33, 34, 34, 35, 35, 36, 36, 37, 37]; // qPi 30..43
const LEVEL_SCALE = [40, 45, 51, 57, 64, 72];
const BETA_TAB = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64];
const TC_TAB = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 24];

// default scaling lists (raster 8x8; both are symmetric)
const DEF8_INTRA = [16, 16, 16, 16, 17, 18, 21, 24, 16, 16, 16, 16, 17, 19, 22, 25, 16, 16, 17, 18, 20, 22, 25, 29, 16, 16, 18, 21, 24, 27, 31, 36,
  17, 17, 20, 24, 30, 35, 41, 47, 18, 19, 22, 27, 35, 44, 54, 65, 21, 22, 25, 31, 41, 54, 70, 88, 24, 25, 29, 36, 47, 65, 88, 115];
const DEF8_INTER = [16, 16, 16, 16, 17, 18, 20, 24, 16, 16, 16, 17, 18, 20, 24, 25, 16, 16, 17, 18, 20, 24, 25, 28, 16, 17, 18, 20, 24, 25, 28, 33,
  17, 18, 20, 24, 25, 28, 33, 41, 18, 20, 24, 25, 28, 33, 41, 54, 20, 24, 25, 28, 33, 41, 54, 71, 24, 25, 28, 33, 41, 54, 71, 91];

// ---------------------------------------------------------------- bit reader / NAL helpers
class BitReader {
  constructor(b, bytePos = 0) { this.b = b; this.p = bytePos * 8; }
  u1() { const v = (this.b[this.p >> 3] >> (7 - (this.p & 7))) & 1; this.p++; return v; }
  u(n) { let v = 0; while (n-- > 0) v = v * 2 + this.u1(); return v; }
  skip(n) { this.p += n; }
  ue() { let z = 0; while (this.u1() === 0) { if (++z > 32) throw new Error('Corrupt bitstream (exp-golomb)'); } return z ? 2 ** z - 1 + this.u(z) : 0; }
  se() { const k = this.ue(); return k & 1 ? (k + 1) / 2 : 0 - k / 2; }
}
// remove emulation prevention bytes; returns padded rbsp (payload after the 2-byte NAL header)
function unescapeNal(nal, start = 2) {
  const out = new Uint8Array(nal.length - start + 16);
  let j = 0, zeros = 0;
  for (let i = start; i < nal.length; i++) {
    const b = nal[i];
    if (zeros >= 2 && b === 3) { zeros = 0; continue; }
    out[j++] = b; zeros = b === 0 ? zeros + 1 : 0;
  }
  return { data: out, len: j };
}
function splitAnnexB(buf) {
  const nals = []; let i = 0, start = -1; const n = buf.length;
  while (i + 2 < n) {
    if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1) {
      if (start >= 0) { let e = i; while (e > start && buf[e - 1] === 0) e--; nals.push(buf.subarray(start, e)); }
      start = i + 3; i += 3;
    } else i++;
  }
  if (start >= 0) { let e = n; while (e > start && buf[e - 1] === 0) e--; nals.push(buf.subarray(start, e)); }
  return nals;
}
const log2c = (v) => { let r = 0; while ((1 << r) < v) r++; return r; };

function parsePtl(br, maxSub) {
  br.skip(8 + 32 + 4 + 43 + 1 + 8);
  const sp = [], sl = [];
  for (let i = 0; i < maxSub; i++) { sp.push(br.u1()); sl.push(br.u1()); }
  if (maxSub > 0) for (let i = maxSub; i < 8; i++) br.skip(2);
  for (let i = 0; i < maxSub; i++) { if (sp[i]) br.skip(88); if (sl[i]) br.skip(8); }
}
function parseSubLayerHrd(br, cpbCnt, subPic) {
  for (let j = 0; j < cpbCnt; j++) { br.ue(); br.ue(); if (subPic) { br.ue(); br.ue(); } br.u1(); }
}
function parseHrd(br, common, maxSub) {
  let nal = 0, vcl = 0, subPic = 0;
  if (common) {
    nal = br.u1(); vcl = br.u1();
    if (nal || vcl) {
      subPic = br.u1();
      if (subPic) { br.skip(8 + 5 + 1 + 5); }
      br.skip(8);
      if (subPic) br.skip(4);
      br.skip(15);
    }
  }
  for (let i = 0; i <= maxSub; i++) {
    const fixedGen = br.u1(); let fixedCvs = 1, lowDelay = 0, cpbCnt = 1;
    if (!fixedGen) fixedCvs = br.u1();
    if (fixedCvs) br.ue(); else lowDelay = br.u1();
    if (!lowDelay) cpbCnt = br.ue() + 1;
    if (nal) parseSubLayerHrd(br, cpbCnt, subPic);
    if (vcl) parseSubLayerHrd(br, cpbCnt, subPic);
  }
}
function parseVui(br, sps) {
  if (br.u1()) { if (br.u(8) === 255) br.skip(32); }
  if (br.u1()) br.u1();
  if (br.u1()) {
    br.skip(3); sps.vuiFullRange = br.u1();
    if (br.u1()) { sps.vuiPrimaries = br.u(8); sps.vuiTransfer = br.u(8); sps.vuiMatrix = br.u(8); }
  }
  if (br.u1()) { br.ue(); br.ue(); }
  br.skip(3);
  if (br.u1()) { br.ue(); br.ue(); br.ue(); br.ue(); }
  if (br.u1()) {
    br.skip(64);
    if (br.u1()) br.ue();
    if (br.u1()) parseHrd(br, 1, sps.maxSubLayersMinus1);
  }
  if (br.u1()) { br.skip(3); br.ue(); br.ue(); br.ue(); br.ue(); br.ue(); }
}

function parseStRps(br, idx, num, sets) {
  const inter = idx !== 0 ? br.u1() : 0;
  const S0 = [], S1 = [];
  if (inter) {
    let deltaIdx = 1;
    if (idx === num) deltaIdx = br.ue() + 1;
    const sign = br.u1(), abs = br.ue() + 1, deltaRps = (1 - 2 * sign) * abs;
    const ref = sets[idx - deltaIdx];
    if (!ref) throw new Error('Corrupt bitstream (RPS)');
    const nRef = ref.S0.length + ref.S1.length, used = [], useDelta = [];
    for (let j = 0; j <= nRef; j++) { used[j] = br.u1(); useDelta[j] = used[j] ? 1 : br.u1(); }
    const nNeg = ref.S0.length, nPos = ref.S1.length;
    for (let j = nPos - 1; j >= 0; j--) { const d = ref.S1[j] + deltaRps; if (d < 0 && useDelta[nNeg + j]) S0.push(d); }
    if (deltaRps < 0 && useDelta[nRef]) S0.push(deltaRps);
    for (let j = 0; j < nNeg; j++) { const d = ref.S0[j] + deltaRps; if (d < 0 && useDelta[j]) S0.push(d); }
    for (let j = nNeg - 1; j >= 0; j--) { const d = ref.S0[j] + deltaRps; if (d > 0 && useDelta[j]) S1.push(d); }
    if (deltaRps > 0 && useDelta[nRef]) S1.push(deltaRps);
    for (let j = 0; j < nPos; j++) { const d = ref.S1[j] + deltaRps; if (d > 0 && useDelta[nNeg + j]) S1.push(d); }
  } else {
    const nNeg = br.ue(), nPos = br.ue();
    if (nNeg > 16 || nPos > 16) throw new Error('Corrupt bitstream (RPS)');
    let prev = 0;
    for (let i = 0; i < nNeg; i++) { prev -= br.ue() + 1; br.u1(); S0.push(prev); }
    prev = 0;
    for (let i = 0; i < nPos; i++) { prev += br.ue() + 1; br.u1(); S1.push(prev); }
  }
  return { S0, S1 };
}

// scaling_list_data -> lists[sizeId][matrixId] = {c: Uint8Array(coefNum) in diag-scan order, dc}
function defaultList(sizeId, matrixId) {
  if (sizeId === 0) return { c: new Uint8Array(16).fill(16), dc: 16 };
  const src = matrixId < 3 ? DEF8_INTRA : DEF8_INTER, sc = SCANS[0][3], c = new Uint8Array(64);
  for (let i = 0; i < 64; i++) c[i] = src[sc.y[i] * 8 + sc.x[i]];
  return { c, dc: 16 };
}
function defaultScalingLists() {
  const L = [];
  for (let s = 0; s < 4; s++) { L[s] = []; for (let m = 0; m < 6; m++) L[s][m] = defaultList(s, m); }
  return L;
}
function parseScalingLists(br) {
  const L = defaultScalingLists();
  for (let sizeId = 0; sizeId < 4; sizeId++) {
    for (let m = 0; m < 6; m += sizeId === 3 ? 3 : 1) {
      if (!br.u1()) {
        const delta = br.ue();
        if (delta === 0) L[sizeId][m] = defaultList(sizeId, m);
        else {
          const ref = m - delta * (sizeId === 3 ? 3 : 1);
          if (ref < 0) throw new Error('Corrupt bitstream (scaling list)');
          L[sizeId][m] = { c: L[sizeId][ref].c, dc: L[sizeId][ref].dc };
        }
      } else {
        let next = 8; const num = Math.min(64, 1 << (4 + (sizeId << 1))), c = new Uint8Array(num); let dc = 16;
        if (sizeId > 1) { dc = br.se() + 8; next = dc; }
        for (let i = 0; i < num; i++) { next = (next + br.se() + 256) & 255; c[i] = next; }
        L[sizeId][m] = { c, dc };
      }
    }
  }
  // 32x32 chroma (4:4:4) derives from the 16x16 lists
  for (const m of [1, 2, 4, 5]) L[3][m] = { c: L[2][m].c, dc: L[2][m].dc };
  return L;
}
// ScalingFactor tables: F[sizeId][matrixId] = Uint8Array(n*n) raster [y*n+x]
function buildScalingFactors(L) {
  const F = [];
  for (let s = 0; s < 4; s++) {
    F[s] = [];
    const n = 4 << s;
    for (let m = 0; m < 6; m++) {
      const f = new Uint8Array(n * n), l = L[s][m];
      if (s === 0) { const sc = SCANS[0][2]; for (let i = 0; i < 16; i++) f[sc.y[i] * 4 + sc.x[i]] = l.c[i]; }
      else {
        const sc = SCANS[0][3], r = n >> 3;
        for (let i = 0; i < 64; i++) for (let a = 0; a < r; a++) for (let b = 0; b < r; b++) f[(sc.y[i] * r + a) * n + sc.x[i] * r + b] = l.c[i];
        if (s > 1) f[0] = l.dc;
      }
      F[s][m] = f;
    }
  }
  return F;
}

function parseSps(nal) {
  const { data } = unescapeNal(nal), br = new BitReader(data), s = {};
  br.skip(4); s.maxSubLayersMinus1 = br.u(3); br.skip(1);
  parsePtl(br, s.maxSubLayersMinus1);
  s.id = br.ue();
  s.chromaFormat = br.ue();
  if (s.chromaFormat === 3 && br.u1()) throw new Error('Unsupported HEVC feature: separate colour planes');
  if (s.chromaFormat > 3) throw new Error('Corrupt bitstream (chroma format)');
  s.width = br.ue(); s.height = br.ue();
  s.cropL = s.cropR = s.cropT = s.cropB = 0;
  if (br.u1()) { s.cropL = br.ue(); s.cropR = br.ue(); s.cropT = br.ue(); s.cropB = br.ue(); }
  s.bitDepthY = br.ue() + 8; s.bitDepthC = br.ue() + 8;
  if (s.bitDepthY > 12 || s.bitDepthC > 12) throw new Error('Unsupported HEVC feature: bit depth above 12');
  s.log2MaxPoc = br.ue() + 4;
  const subInfo = br.u1();
  for (let i = subInfo ? 0 : s.maxSubLayersMinus1; i <= s.maxSubLayersMinus1; i++) { br.ue(); br.ue(); br.ue(); }
  s.log2MinCb = br.ue() + 3; s.log2Ctb = s.log2MinCb + br.ue();
  s.log2MinTb = br.ue() + 2; s.log2MaxTb = s.log2MinTb + br.ue();
  s.maxTrDepthInter = br.ue(); s.maxTrDepthIntra = br.ue();
  if (s.log2Ctb > 6 || s.log2Ctb < 4 || s.log2MaxTb > 5 || s.log2MinTb >= s.log2MinCb) throw new Error('Corrupt or unsupported SPS block sizes');
  s.scalingEnabled = br.u1(); s.scalingLists = null;
  if (s.scalingEnabled) { s.scalingLists = br.u1() ? parseScalingLists(br) : defaultScalingLists(); }
  s.amp = br.u1(); s.sao = br.u1(); s.pcm = br.u1();
  if (s.pcm) {
    s.pcmBitY = br.u(4) + 1; s.pcmBitC = br.u(4) + 1;
    s.log2MinPcm = br.ue() + 3; s.log2MaxPcm = s.log2MinPcm + br.ue(); s.pcmLoopFilterDisabled = br.u1();
  }
  const nRps = br.ue(); s.rps = [];
  if (nRps > 64) throw new Error('Corrupt bitstream (RPS count)');
  for (let i = 0; i < nRps; i++) s.rps.push(parseStRps(br, i, nRps, s.rps));
  s.longTermPresent = br.u1(); s.numLtSps = 0;
  if (s.longTermPresent) { s.numLtSps = br.ue(); for (let i = 0; i < s.numLtSps; i++) { br.skip(s.log2MaxPoc); br.u1(); } }
  s.temporalMvp = br.u1(); s.strongIntra = br.u1();
  if (br.u1()) parseVui(br, s);
  if (br.u1()) {
    const rext = br.u1(); br.u1(); br.u1(); const scc = br.u1(); br.u(4);
    if (scc) throw new Error('Unsupported HEVC feature: screen content coding extension');
    if (rext) {
      const names = ['transform-skip rotation', 'transform-skip context', 'implicit RDPCM', 'explicit RDPCM', 'extended precision', 'intra smoothing disabled', 'high precision offsets', 'persistent rice adaptation', 'CABAC bypass alignment'];
      for (const nm of names) if (br.u1()) throw new Error('Unsupported HEVC range-extension tool: ' + nm);
    }
  }
  if (s.width * s.height > 2e8) throw new Error('Image is too large to decode in the browser (over 200 megapixels)');
  s.subW = s.chromaFormat === 1 || s.chromaFormat === 2 ? 2 : 1;
  s.subH = s.chromaFormat === 1 ? 2 : 1;
  s.ctbSize = 1 << s.log2Ctb;
  s.wCtb = Math.ceil(s.width / s.ctbSize); s.hCtb = Math.ceil(s.height / s.ctbSize);
  if (s.width % (1 << s.log2MinCb) || s.height % (1 << s.log2MinCb) || !s.width || !s.height) throw new Error('Corrupt SPS picture size');
  return s;
}

function parsePps(nal) {
  const { data } = unescapeNal(nal), br = new BitReader(data), p = {};
  p.id = br.ue(); p.spsId = br.ue();
  p.depSlices = br.u1(); p.outputFlagPresent = br.u1(); p.extraSliceBits = br.u(3);
  p.signHiding = br.u1(); p.cabacInitPresent = br.u1();
  br.ue(); br.ue();
  p.initQp = 26 + br.se();
  p.constrainedIntra = br.u1(); p.transformSkip = br.u1();
  p.cuQpDelta = br.u1(); p.diffCuQpDepth = p.cuQpDelta ? br.ue() : 0;
  p.cbOff = br.se(); p.crOff = br.se();
  p.sliceChromaOffsets = br.u1(); br.u1(); br.u1();
  p.transquantBypass = br.u1();
  p.tiles = br.u1(); p.wpp = br.u1();
  p.numCols = 1; p.numRows = 1; p.uniform = 1; p.colW = null; p.rowH = null; p.lfAcrossTiles = 1;
  if (p.tiles) {
    p.numCols = br.ue() + 1; p.numRows = br.ue() + 1; p.uniform = br.u1();
    if (p.numCols > 64 || p.numRows > 64) throw new Error('Corrupt PPS tiles');
    if (!p.uniform) {
      p.colW = []; p.rowH = [];
      for (let i = 0; i < p.numCols - 1; i++) p.colW.push(br.ue() + 1);
      for (let i = 0; i < p.numRows - 1; i++) p.rowH.push(br.ue() + 1);
    }
    p.lfAcrossTiles = br.u1();
  }
  p.lfAcrossSlices = br.u1();
  p.dbControl = br.u1(); p.dbOverride = 0; p.dbDisabled = 0; p.betaOff = 0; p.tcOff = 0;
  if (p.dbControl) {
    p.dbOverride = br.u1(); p.dbDisabled = br.u1();
    if (!p.dbDisabled) { p.betaOff = br.se(); p.tcOff = br.se(); }
  }
  p.scalingLists = null;
  if (br.u1()) p.scalingLists = parseScalingLists(br);
  br.u1(); br.ue();
  p.sliceHdrExt = br.u1();
  p.log2MaxTs = 2; p.saoScaleY = 0; p.saoScaleC = 0;
  if (br.u1()) {
    const rext = br.u1(); br.u1(); br.u1(); const scc = br.u1(); br.u(4);
    if (scc) throw new Error('Unsupported HEVC feature: screen content coding extension');
    if (rext) {
      if (p.transformSkip) p.log2MaxTs = br.ue() + 2;
      if (br.u1()) throw new Error('Unsupported HEVC range-extension tool: cross-component prediction');
      if (br.u1()) throw new Error('Unsupported HEVC range-extension tool: chroma QP offset lists');
      p.saoScaleY = br.ue(); p.saoScaleC = br.ue();
    }
  }
  return p;
}

// ---------------------------------------------------------------- the HEVC intra decoder
const clip3 = (lo, hi, v) => (v < lo ? lo : v > hi ? hi : v);

class HevcDecoder {
  constructor() {
    this.spsList = []; this.ppsList = [];
    this.ctx = new Uint8Array(C_N); this.wppCtx = new Uint8Array(C_N); this.dsCtx = new Uint8Array(C_N);
    this.coef = new Int32Array(1024); this.res = new Int32Array(1024); this.tmp = new Int32Array(1024);
    this.ref = new Int32Array(300); this.rf = new Int32Array(300); this.refA = new Int32Array(300); this.av = new Uint8Array(300);
    this.csbf = new Uint8Array(100); this.sigPos = new Uint8Array(16); this.absL = new Int32Array(16);
    this.buf = null; this.pos = 0; this.range = 0; this.value = 0; this.cnt = 0;
    this.pic = false; this.lastIndep = null; this.tk = 0; this.curRs = 0;
  }

  // ---- parameter sets
  addParamSet(nal) {
    const t = (nal[0] >> 1) & 63;
    if (t === 33) { const s = parseSps(nal); this.spsList[s.id] = s; }
    else if (t === 34) { const p = parsePps(nal); this.ppsList[p.id] = p; }
  }

  // ---- CABAC engine
  initEngine(pos) {
    const b = this.buf;
    this.value = (b[pos] << 9) | (b[pos + 1] << 1); this.pos = pos + 2; this.cnt = 7; this.range = 510;
  }
  initCtx(qp) {
    const c = this.ctx, q = clip3(0, 51, qp);
    for (let i = 0; i < C_N; i++) {
      const v = CTX_INIT[i], m = (v >> 4) * 5 - 45, n = ((v & 15) << 3) - 16;
      const pre = clip3(1, 126, ((m * q) >> 4) + n), mps = pre > 63 ? 1 : 0;
      c[i] = ((mps ? pre - 64 : 63 - pre) << 1) | mps;
    }
  }
  dec(i) {
    const ctx = this.ctx, s = ctx[i];
    let range = this.range;
    const lps = LPS_TAB[((s >> 1) << 2) | ((range >> 6) & 3)];
    range -= lps;
    const scaled = range << 8;
    let bin;
    if (this.value < scaled) {
      bin = s & 1; ctx[i] = NEXT_MPS[s];
      if (range < 256) {
        range <<= 1; this.value <<= 1;
        if (--this.cnt < 0) { this.value |= this.buf[this.pos++] << -this.cnt; this.cnt += 8; }
      }
    } else {
      this.value -= scaled; bin = (s & 1) ^ 1; ctx[i] = NEXT_LPS[s];
      const n = Math.clz32(lps) - 23;
      range = lps << n; this.value <<= n; this.cnt -= n;
      if (this.cnt < 0) { this.value |= this.buf[this.pos++] << -this.cnt; this.cnt += 8; }
    }
    this.range = range;
    return bin;
  }
  byp() {
    this.value <<= 1;
    if (--this.cnt < 0) { this.value |= this.buf[this.pos++] << -this.cnt; this.cnt += 8; }
    const sc = this.range << 8;
    if (this.value >= sc) { this.value -= sc; return 1; }
    return 0;
  }
  bypN(n) { let v = 0; while (n-- > 0) v = (v << 1) | this.byp(); return v; }
  term() {
    this.range -= 2;
    if (this.value >= this.range << 8) return 1;
    if (this.range < 256) {
      this.range <<= 1; this.value <<= 1;
      if (--this.cnt < 0) { this.value |= this.buf[this.pos++] << -this.cnt; this.cnt += 8; }
    }
    return 0;
  }

  // ---- slice header
  parseSliceHeader(nal) {
    const nalType = (nal[0] >> 1) & 63;
    const { data, len } = unescapeNal(nal), br = new BitReader(data);
    const h = { nalType, data, len };
    h.first = br.u1();
    if (nalType >= 16 && nalType <= 23) br.u1();
    h.ppsId = br.ue();
    const pps = this.ppsList[h.ppsId];
    if (!pps) throw new Error('Corrupt bitstream: slice refers to a missing PPS');
    const sps = this.spsList[pps.spsId];
    if (!sps) throw new Error('Corrupt bitstream: PPS refers to a missing SPS');
    h.pps = pps; h.sps = sps;
    h.dependent = 0; h.segAddr = 0;
    if (!h.first) {
      if (pps.depSlices) h.dependent = br.u1();
      h.segAddr = br.u(log2c(sps.wCtb * sps.hCtb));
      if (h.segAddr >= sps.wCtb * sps.hCtb) throw new Error('Corrupt bitstream: slice address');
    }
    if (h.dependent) {
      if (!this.lastIndep) throw new Error('Corrupt bitstream: dependent slice without a slice');
      const p = this.lastIndep;
      for (const k of ['type', 'sliceAddrRs', 'saoLuma', 'saoChroma', 'qp', 'cbOff', 'crOff', 'dbDisabled', 'betaOff', 'tcOff', 'lfAcross']) h[k] = p[k];
    } else {
      h.sliceAddrRs = h.segAddr;
      br.skip(pps.extraSliceBits);
      h.type = br.ue();
      if (h.type !== 2) throw new Error('Unsupported HEVC feature: inter-coded (P/B) slices; only intra (still image) HEVC is supported');
      if (pps.outputFlagPresent) br.u1();
      if (nalType !== 19 && nalType !== 20) {
        br.skip(sps.log2MaxPoc);
        if (!br.u1()) parseStRps(br, sps.rps.length, sps.rps.length, sps.rps);
        else if (sps.rps.length > 1) br.skip(log2c(sps.rps.length));
        if (sps.longTermPresent) {
          const nSps = sps.numLtSps > 0 ? br.ue() : 0, nLt = br.ue();
          for (let i = 0; i < nSps + nLt; i++) {
            if (i < nSps) { if (sps.numLtSps > 1) br.skip(log2c(sps.numLtSps)); } else { br.skip(sps.log2MaxPoc); br.u1(); }
            if (br.u1()) br.ue();
          }
        }
        if (sps.temporalMvp) br.u1();
      }
      h.saoLuma = 0; h.saoChroma = 0;
      if (sps.sao) { h.saoLuma = br.u1(); h.saoChroma = sps.chromaFormat !== 0 ? br.u1() : 0; }
      h.qp = pps.initQp + br.se();
      h.cbOff = 0; h.crOff = 0;
      if (pps.sliceChromaOffsets) { h.cbOff = br.se(); h.crOff = br.se(); }
      const ov = pps.dbOverride ? br.u1() : 0;
      h.dbDisabled = pps.dbDisabled; h.betaOff = pps.betaOff; h.tcOff = pps.tcOff;
      if (ov) { h.dbDisabled = br.u1(); if (!h.dbDisabled) { h.betaOff = br.se(); h.tcOff = br.se(); } }
      h.lfAcross = pps.lfAcrossSlices;
      if (pps.lfAcrossSlices && (h.saoLuma || h.saoChroma || !h.dbDisabled)) h.lfAcross = br.u1();
      this.lastIndep = h;
    }
    if (pps.tiles || pps.wpp) {
      const n = br.ue();
      if (n > 0) { const l = br.ue() + 1; for (let i = 0; i < n; i++) br.skip(l); }
    }
    if (pps.sliceHdrExt) { const l = br.ue(); br.skip(8 * l); }
    br.u1();
    h.dataPos = (br.p + 7) >> 3;
    return h;
  }

  // ---- picture setup
  startPicture(h) {
    const sps = h.sps, pps = h.pps;
    this.sps = sps; this.pps = pps;
    const W = sps.width, H = sps.height, cf = sps.chromaFormat;
    this.W = W; this.H = H; this.cf = cf; this.subW = sps.subW; this.subH = sps.subH;
    const cw = cf ? W / sps.subW : 0, ch = cf ? H / sps.subH : 0;
    this.planes = [new Uint16Array(W * H), cf ? new Uint16Array(cw * ch) : null, cf ? new Uint16Array(cw * ch) : null];
    this.strides = [W, cw, cw];
    const w4 = W >> 2, h4 = H >> 2;
    this.w4 = w4; this.h4 = h4;
    this.recon = new Uint8Array(w4 * h4); this.cuMark = new Uint8Array(w4 * h4); this.ipm = new Uint8Array(w4 * h4).fill(1);
    this.qpMap = new Int8Array(w4 * h4); this.noFilt = new Uint8Array(w4 * h4); this.anyNoFilt = false;
    this.edgeV = new Uint8Array(w4 * h4); this.edgeH = new Uint8Array(w4 * h4);
    this.minCbShift = sps.log2MinCb; this.wMinCb = W >> sps.log2MinCb;
    this.ctDepth = new Uint8Array(this.wMinCb * (H >> sps.log2MinCb));
    const nCtb = sps.wCtb * sps.hCtb;
    this.nCtb = nCtb; this.wCtb = sps.wCtb; this.log2Ctb = sps.log2Ctb;
    this.ctbSlice = new Int32Array(nCtb).fill(-1); this.ctbHdr = new Int32Array(nCtb).fill(-1); this.hdrs = [];
    this.saoType = new Uint8Array(nCtb * 3); this.saoBand = new Uint8Array(nCtb * 3); this.saoEo = new Uint8Array(nCtb * 3);
    this.saoOff = new Int16Array(nCtb * 12);
    // tiles
    const colW = [], rowH = [];
    if (pps.uniform) {
      for (let i = 0; i < pps.numCols; i++) colW.push(Math.floor(((i + 1) * sps.wCtb) / pps.numCols) - Math.floor((i * sps.wCtb) / pps.numCols));
      for (let i = 0; i < pps.numRows; i++) rowH.push(Math.floor(((i + 1) * sps.hCtb) / pps.numRows) - Math.floor((i * sps.hCtb) / pps.numRows));
    } else {
      let s = 0; for (const w of pps.colW) { colW.push(w); s += w; } colW.push(sps.wCtb - s);
      s = 0; for (const r of pps.rowH) { rowH.push(r); s += r; } rowH.push(sps.hCtb - s);
      if (colW[colW.length - 1] <= 0 || rowH[rowH.length - 1] <= 0) throw new Error('Corrupt PPS tile layout');
    }
    const colBd = [0], rowBd = [0];
    colW.forEach((w, i) => colBd.push(colBd[i] + w)); rowH.forEach((r, i) => rowBd.push(rowBd[i] + r));
    this.rsToTs = new Int32Array(nCtb); this.tsToRs = new Int32Array(nCtb); this.tileTs = new Int32Array(nCtb); this.tileRs = new Int32Array(nCtb);
    this.tileColStartRs = new Int32Array(nCtb);
    let ts = 0, tid = 0;
    for (let tr = 0; tr < rowH.length; tr++) for (let tc = 0; tc < colW.length; tc++, tid++) {
      for (let y = rowBd[tr]; y < rowBd[tr + 1]; y++) for (let x = colBd[tc]; x < colBd[tc + 1]; x++) {
        const rs = y * sps.wCtb + x;
        this.rsToTs[rs] = ts; this.tsToRs[ts] = rs; this.tileTs[ts] = tid; this.tileRs[rs] = tid; this.tileColStartRs[rs] = colBd[tc]; ts++;
      }
    }
    // dequant / misc
    this.qpBdY = 6 * (sps.bitDepthY - 8); this.qpBdC = 6 * (sps.bitDepthC - 8);
    this.log2MinCuQpDelta = sps.log2Ctb - pps.diffCuQpDepth;
    this.scalingF = null;
    if (sps.scalingEnabled) this.scalingF = buildScalingFactors(pps.scalingLists || sps.scalingLists);
    this.hdrs.length = 0; this.picDone = 0;
  }

  // ---- availability helpers
  avZ(xl, yl) { // sample at luma position already reconstructed, same slice & tile as the current CTB
    if (xl < 0 || yl < 0 || xl >= this.W || yl >= this.H) return false;
    if (!this.recon[(yl >> 2) * this.w4 + (xl >> 2)]) return false;
    const c = (yl >> this.log2Ctb) * this.wCtb + (xl >> this.log2Ctb);
    return this.ctbSlice[c] === this.curSlice && this.tileRs[c] === this.curTile;
  }
  avCU(xl, yl) {
    if (xl < 0 || yl < 0 || xl >= this.W || yl >= this.H) return false;
    if (!this.cuMark[(yl >> 2) * this.w4 + (xl >> 2)]) return false;
    const c = (yl >> this.log2Ctb) * this.wCtb + (xl >> this.log2Ctb);
    return this.ctbSlice[c] === this.curSlice && this.tileRs[c] === this.curTile;
  }

  // ---- slice data
  *sliceData(h) {
    const sps = h.sps, pps = h.pps;
    this.h = h; this.buf = h.data; this.curSlice = h.sliceAddrRs;
    this.hdrs.push(h); this.hdrIdx = this.hdrs.length - 1;
    this.sliceQp = h.qp;
    if (!h.dependent) this.lastQpY = h.qp;
    const W = this.wCtb;
    let ts = this.rsToTs[h.segAddr];
    this.initEngine(h.dataPos);
    let first = true;
    for (;;) {
      const rs = this.tsToRs[ts], rx = rs % W, ry = (rs / W) | 0;
      this.curTile = this.tileRs[rs];
      const firstInTile = ts === 0 || this.tileTs[ts] !== this.tileTs[ts - 1];
      const rowStart = pps.wpp && rx === this.tileColStartRs[rs];
      this.ctbSlice[rs] = this.curSlice; this.ctbHdr[rs] = this.hdrIdx;
      if (firstInTile) { this.initCtx(h.qp); this.lastQpY = h.qp; }
      else if (rowStart) {
        this.initCtx(h.qp); this.lastQpY = h.qp;
        const tr = rs - W + 1;
        if (ry > 0 && rx + 1 < W && this.ctbSlice[tr] === this.curSlice && this.tileRs[tr] === this.curTile) this.ctx.set(this.wppCtx);
      } else if (first) { if (h.dependent) this.ctx.set(this.dsCtx); else this.initCtx(h.qp); }
      first = false;
      this.curRs = rs;
      this.ctu(rx, ry, rs);
      if (pps.wpp && rx === this.tileColStartRs[rs] + 1) this.wppCtx.set(this.ctx);
      this.tk = 1;
      const end = this.term();
      ts++;
      if (end) { if (pps.depSlices) this.dsCtx.set(this.ctx); break; }
      if (ts >= this.nCtb) throw new Error('Corrupt bitstream: slice data overruns the picture');
      const nrs = this.tsToRs[ts];
      if ((pps.tiles && this.tileTs[ts] !== this.tileTs[ts - 1]) || (pps.wpp && (nrs % W === 0 || this.tileTs[ts] !== this.tileTs[this.rsToTs[nrs - 1]]))) {
        this.tk = 2;
        if (!this.term()) throw new Error('Corrupt bitstream: missing end_of_subset_one_bit');
        this.initEngine(this.pos);
      }
      if (this.pos > h.len + 8) throw new Error('Corrupt bitstream: ran past end of slice data');
      if (rx === W - 1 || (ts & 7) === 0) { if (this.progress) this.progress.frac = ts / this.nCtb; yield; }
    }
  }

  ctu(rx, ry, rs) {
    const h = this.h;
    this.ctbX0 = rx << this.log2Ctb; this.ctbY0 = ry << this.log2Ctb;
    if (h.saoLuma || h.saoChroma) this.parseSao(rx, ry, rs);
    this.quadtree(this.ctbX0, this.ctbY0, this.log2Ctb, 0);
  }

  parseSao(rx, ry, rs) {
    const h = this.h, sps = this.sps, W = this.wCtb;
    let mergeL = 0, mergeU = 0;
    if (rx > 0 && rs > h.sliceAddrRs && this.tileRs[rs - 1] === this.tileRs[rs]) mergeL = this.dec(C_SAO_MERGE);
    if (ry > 0 && !mergeL && rs - W >= h.sliceAddrRs && this.tileRs[rs - W] === this.tileRs[rs]) mergeU = this.dec(C_SAO_MERGE);
    const T = this.saoType, B = this.saoBand, E = this.saoEo, O = this.saoOff;
    if (mergeL || mergeU) {
      const src = mergeL ? rs - 1 : rs - W;
      for (let c = 0; c < 3; c++) { T[rs * 3 + c] = T[src * 3 + c]; B[rs * 3 + c] = B[src * 3 + c]; E[rs * 3 + c] = E[src * 3 + c]; for (let i = 0; i < 4; i++) O[(rs * 3 + c) * 4 + i] = O[(src * 3 + c) * 4 + i]; }
      return;
    }
    const nC = this.cf ? 3 : 1;
    for (let c = 0; c < 3; c++) T[rs * 3 + c] = 0;
    for (let c = 0; c < nC; c++) {
      if (!((c === 0 && h.saoLuma) || (c > 0 && h.saoChroma))) continue;
      let type;
      if (c === 2) type = T[rs * 3 + 1];
      else type = this.dec(C_SAO_TYPE) ? (this.byp() ? 2 : 1) : 0;
      T[rs * 3 + c] = type;
      if (!type) continue;
      const bd = c ? sps.bitDepthC : sps.bitDepthY, cMax = (1 << (Math.min(bd, 10) - 5)) - 1, sc = c ? this.pps.saoScaleC : this.pps.saoScaleY;
      const abs = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) { let v = 0; while (v < cMax && this.byp()) v++; abs[i] = v; }
      if (type === 1) {
        for (let i = 0; i < 4; i++) if (abs[i] && this.byp()) abs[i] = -abs[i];
        B[rs * 3 + c] = this.bypN(5);
      } else {
        abs[2] = -abs[2]; abs[3] = -abs[3];
        E[rs * 3 + c] = c === 2 ? E[rs * 3 + 1] : this.bypN(2);
      }
      for (let i = 0; i < 4; i++) O[(rs * 3 + c) * 4 + i] = abs[i] * (1 << sc);
    }
  }

  quadtree(x0, y0, log2, depth) {
    const sps = this.sps, size = 1 << log2;
    let split;
    if (x0 + size <= this.W && y0 + size <= this.H && log2 > sps.log2MinCb) {
      let inc = 0;
      if (this.avCU(x0 - 1, y0) && this.ctDepth[(y0 >> this.minCbShift) * this.wMinCb + ((x0 - 1) >> this.minCbShift)] > depth) inc++;
      if (this.avCU(x0, y0 - 1) && this.ctDepth[((y0 - 1) >> this.minCbShift) * this.wMinCb + (x0 >> this.minCbShift)] > depth) inc++;
      split = this.dec(C_SPLIT_CU + inc);
    } else split = log2 > sps.log2MinCb ? 1 : 0;
    if (this.pps.cuQpDelta && log2 >= this.log2MinCuQpDelta) {
      this.isCuQpDeltaCoded = 0; this.cuQpDeltaVal = 0;
      // predicted QP for this quantisation group
      const mask = (1 << this.log2Ctb) - 1, prev = this.lastQpY;
      const a = (x0 & mask) ? this.qpMap[(y0 >> 2) * this.w4 + ((x0 - 1) >> 2)] : prev;
      const b = (y0 & mask) ? this.qpMap[((y0 - 1) >> 2) * this.w4 + (x0 >> 2)] : prev;
      this.qpPred = (a + b + 1) >> 1;
    }
    if (split) {
      const h2 = size >> 1, x1 = x0 + h2, y1 = y0 + h2;
      this.quadtree(x0, y0, log2 - 1, depth + 1);
      if (x1 < this.W) this.quadtree(x1, y0, log2 - 1, depth + 1);
      if (y1 < this.H) this.quadtree(x0, y1, log2 - 1, depth + 1);
      if (x1 < this.W && y1 < this.H) this.quadtree(x1, y1, log2 - 1, depth + 1);
    } else this.codingUnit(x0, y0, log2, depth);
  }

  setQp() {
    const q = this.pps.cuQpDelta ? this.qpPred + this.cuQpDeltaVal : this.sliceQp;
    this.qpY = this.pps.cuQpDelta ? ((q + 52 + 2 * this.qpBdY) % (52 + this.qpBdY)) - this.qpBdY : q;
  }

  codingUnit(x0, y0, log2, depth) {
    const sps = this.sps, pps = this.pps, n = 1 << log2, w4 = this.w4;
    // mark CU decoded, depth
    for (let y = y0 >> 2, ye = (y0 + n) >> 2; y < ye; y++) this.cuMark.fill(1, y * w4 + (x0 >> 2), y * w4 + ((x0 + n) >> 2));
    const sh = this.minCbShift, cn = n >> sh;
    for (let y = 0; y < cn; y++) this.ctDepth.fill(depth, ((y0 >> sh) + y) * this.wMinCb + (x0 >> sh), ((y0 >> sh) + y) * this.wMinCb + (x0 >> sh) + cn);
    this.setQp();
    this.cuBypass = pps.transquantBypass ? this.dec(C_TQB) : 0;
    let nxn = 0;
    if (log2 === sps.log2MinCb) nxn = this.dec(C_PART) ? 0 : 1;
    let pcm = 0;
    if (!nxn && sps.pcm && log2 >= sps.log2MinPcm && log2 <= sps.log2MaxPcm) { this.tk = 0; pcm = this.term(); }
    this.cuX = x0; this.cuY = y0; this.cuLog2 = log2; this.intraSplit = nxn;
    if (pcm) this.pcmSamples(x0, y0, log2);
    else {
      const nPb = nxn ? 4 : 1, pb = nxn ? n >> 1 : n, prev = [0, 0, 0, 0];
      for (let i = 0; i < nPb; i++) prev[i] = this.dec(C_PREV_INTRA);
      const ipm = this.ipm;
      for (let i = 0; i < nPb; i++) {
        const x = x0 + (i & 1) * pb, y = y0 + (i >> 1) * pb;
        const A = this.avCU(x - 1, y) ? ipm[(y >> 2) * w4 + ((x - 1) >> 2)] : 1;
        const B = (y - 1 < ((y >> this.log2Ctb) << this.log2Ctb)) || !this.avCU(x, y - 1) ? 1 : ipm[((y - 1) >> 2) * w4 + (x >> 2)];
        let c0, c1, c2;
        if (A === B) {
          if (A < 2) { c0 = 0; c1 = 1; c2 = 26; } else { c0 = A; c1 = 2 + ((A + 29) % 32); c2 = 2 + ((A - 2 + 1) % 32); }
        } else {
          c0 = A; c1 = B;
          c2 = A !== 0 && B !== 0 ? 0 : A !== 1 && B !== 1 ? 1 : 26;
        }
        let mode;
        if (prev[i]) { mode = !this.byp() ? c0 : !this.byp() ? c1 : c2; }
        else {
          mode = this.bypN(5);
          let t;
          if (c0 > c1) { t = c0; c0 = c1; c1 = t; }
          if (c0 > c2) { t = c0; c0 = c2; c2 = t; }
          if (c1 > c2) { t = c1; c1 = c2; c2 = t; }
          if (mode >= c0) mode++;
          if (mode >= c1) mode++;
          if (mode >= c2) mode++;
        }
        const u = pb >> 2;
        for (let yy = 0; yy < u; yy++) ipm.fill(mode, ((y >> 2) + yy) * w4 + (x >> 2), ((y >> 2) + yy) * w4 + (x >> 2) + u);
      }
      // chroma modes
      const cm = this.cmode || (this.cmode = [0, 0, 0, 0]);
      if (this.cf) {
        const nC = this.cf === 3 && nxn ? 4 : 1;
        for (let i = 0; i < nC; i++) {
          const x = x0 + (i & 1) * pb, y = y0 + (i >> 1) * pb;
          const luma = ipm[(y >> 2) * w4 + (x >> 2)];
          const idx = this.dec(C_CHROMA_PRED) ? this.bypN(2) : 4;
          let m;
          if (idx === 4) m = luma;
          else { m = idx === 0 ? 0 : idx === 1 ? 26 : idx === 2 ? 10 : 1; if (m === luma) m = 34; }
          if (this.cf === 2) m = MODE_422[m];
          cm[i] = m;
        }
        if (nC === 1) cm[1] = cm[2] = cm[3] = cm[0];
      }
      this.maxTrDepth = sps.maxTrDepthIntra + nxn;
      this.transformTree(x0, y0, x0, y0, log2, 0, 0, 0, 0);
    }
    // finish CU: qp, flags
    const qp = this.qpY;
    for (let y = y0 >> 2, ye = (y0 + n) >> 2; y < ye; y++) {
      this.qpMap.fill(qp, y * w4 + (x0 >> 2), y * w4 + ((x0 + n) >> 2));
      if (this.cuBypass || (pcm && sps.pcmLoopFilterDisabled)) { this.noFilt.fill(1, y * w4 + (x0 >> 2), y * w4 + ((x0 + n) >> 2)); this.anyNoFilt = true; }
    }
    this.lastQpY = qp;
  }

  pcmSamples(x0, y0, log2) {
    const sps = this.sps, br = this.pcmBegin(), n = 1 << log2, w4 = this.w4;
    const planes = this.planes, strides = this.strides;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) planes[0][(y0 + y) * strides[0] + x0 + x] = br.u(sps.pcmBitY) << (sps.bitDepthY - sps.pcmBitY);
    if (this.cf) {
      const cw = n / this.subW, ch = n / this.subH, cx = x0 / this.subW, cy = y0 / this.subH;
      for (let c = 1; c < 3; c++) for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) planes[c][(cy + y) * strides[c] + cx + x] = br.u(sps.pcmBitC) << (sps.bitDepthC - sps.pcmBitC);
    }
    this.pcmEnd(br);
    for (let y = y0 >> 2, ye = (y0 + n) >> 2; y < ye; y++) { this.recon.fill(1, y * w4 + (x0 >> 2), y * w4 + ((x0 + n) >> 2)); this.ipm.fill(1, y * w4 + (x0 >> 2), y * w4 + ((x0 + n) >> 2)); }
    this.markEdges(x0, y0, n);
  }

  pcmBegin() { return new BitReader(this.buf, this.pos); }
  pcmEnd(br) { this.initEngine((br.p + 7) >> 3); }

  markEdges(x0, y0, size) {
    const h = this.h, pps = this.pps, w4 = this.w4, mask = (1 << this.log2Ctb) - 1;
    if (h.dbDisabled) return;
    if ((x0 & 7) === 0 && x0 > 0) {
      let ok = true;
      if ((x0 & mask) === 0) {
        const c = (y0 >> this.log2Ctb) * this.wCtb + ((x0 - 1) >> this.log2Ctb);
        if (this.ctbSlice[c] !== this.curSlice && !h.lfAcross) ok = false;
        if (this.tileRs[c] !== this.curTile && !pps.lfAcrossTiles) ok = false;
      }
      if (ok) for (let y = y0 >> 2, ye = (y0 + size) >> 2; y < ye; y++) this.edgeV[y * w4 + (x0 >> 2)] = 1;
    }
    if ((y0 & 7) === 0 && y0 > 0) {
      let ok = true;
      if ((y0 & mask) === 0) {
        const c = ((y0 - 1) >> this.log2Ctb) * this.wCtb + (x0 >> this.log2Ctb);
        if (this.ctbSlice[c] !== this.curSlice && !h.lfAcross) ok = false;
        if (this.tileRs[c] !== this.curTile && !pps.lfAcrossTiles) ok = false;
      }
      if (ok) for (let x = x0 >> 2, xe = (x0 + size) >> 2; x < xe; x++) this.edgeH[(y0 >> 2) * w4 + x] = 1;
    }
  }

  transformTree(x0, y0, xBase, yBase, log2, depth, blkIdx, pCb, pCr) {
    const sps = this.sps, cf = this.cf;
    let split;
    if (log2 <= sps.log2MaxTb && log2 > sps.log2MinTb && depth < this.maxTrDepth && !(this.intraSplit && depth === 0)) split = this.dec(C_SPLIT_TF + 5 - log2);
    else split = log2 > sps.log2MaxTb || (this.intraSplit && depth === 0) ? 1 : 0;
    let cb = 0, cr = 0;
    if ((log2 > 2 && cf !== 0) || cf === 3) {
      if (depth === 0 || (pCb & 1)) { cb = this.dec(C_CBF_C + depth); if (cf === 2 && (!split || log2 === 3)) cb |= this.dec(C_CBF_C + depth) << 1; }
      if (depth === 0 || (pCr & 1)) { cr = this.dec(C_CBF_C + depth); if (cf === 2 && (!split || log2 === 3)) cr |= this.dec(C_CBF_C + depth) << 1; }
    } else if (log2 === 2 && cf !== 0) { cb = pCb; cr = pCr; }
    if (split) {
      const h2 = 1 << (log2 - 1), x1 = x0 + h2, y1 = y0 + h2;
      this.transformTree(x0, y0, x0, y0, log2 - 1, depth + 1, 0, cb, cr);
      this.transformTree(x1, y0, x0, y0, log2 - 1, depth + 1, 1, cb, cr);
      this.transformTree(x0, y1, x0, y0, log2 - 1, depth + 1, 2, cb, cr);
      this.transformTree(x1, y1, x0, y0, log2 - 1, depth + 1, 3, cb, cr);
    } else {
      const cbfL = this.dec(C_CBF_L + (depth === 0 ? 1 : 0));
      this.transformUnit(x0, y0, xBase, yBase, log2, blkIdx, cbfL, cb, cr);
    }
  }

  chromaQp(c) {
    const pps = this.pps, h = this.h;
    let qpi = this.qpY + (c === 1 ? pps.cbOff + h.cbOff : pps.crOff + h.crOff);
    qpi = clip3(-this.qpBdC, 57, qpi);
    const qpc = this.cf === 1 ? (qpi < 30 ? qpi : qpi >= 44 ? qpi - 6 : QPC_TAB[qpi - 30]) : Math.min(qpi, 51);
    return qpc + this.qpBdC;
  }

  transformUnit(x0, y0, xBase, yBase, log2, blkIdx, cbfL, cb, cr) {
    const cf = this.cf, pps = this.pps, w4 = this.w4, n = 1 << log2;
    const chroma4 = cf !== 3 && log2 === 2;
    const cbfChroma = cf !== 0 && (cb | cr) !== 0;
    if ((cbfL || cbfChroma) && pps.cuQpDelta && !this.isCuQpDeltaCoded) {
      let v = 0;
      if (this.dec(C_QPD)) { v = 1; while (v < 5 && this.dec(C_QPD + 1)) v++; if (v === 5) { let k = 0; while (this.byp()) { v += 1 << k; k++; if (k > 31) throw new Error('Corrupt bitstream (cu_qp_delta)'); } if (k) v += this.bypN(k); } }
      if (v && this.byp()) v = -v;
      this.isCuQpDeltaCoded = 1; this.cuQpDeltaVal = v;
      this.setQp();
    }
    // luma
    const lumaMode = this.ipm[(y0 >> 2) * w4 + (x0 >> 2)];
    this.predIntra(0, x0, y0, log2, lumaMode);
    if (cbfL) this.residual(0, x0, y0, log2, lumaMode, this.qpY + this.qpBdY);
    for (let y = y0 >> 2, ye = (y0 + n) >> 2; y < ye; y++) this.recon.fill(1, y * w4 + (x0 >> 2), y * w4 + ((x0 + n) >> 2));
    this.markEdges(x0, y0, n);
    if (!cf) return;
    if (!chroma4 || blkIdx === 3) {
      const xc = (chroma4 ? xBase : x0) / this.subW, yc = (chroma4 ? yBase : y0) / this.subH;
      const log2C = chroma4 ? 2 : (cf === 3 ? log2 : log2 - 1), nc = 1 << log2C, tN = cf === 2 ? 2 : 1;
      let pb = 0;
      if (this.intraSplit && cf === 3) pb = ((y0 - this.cuY) >= (1 << (this.cuLog2 - 1)) ? 2 : 0) + ((x0 - this.cuX) >= (1 << (this.cuLog2 - 1)) ? 1 : 0);
      const mode = this.cmode[pb];
      for (let c = 1; c < 3; c++) {
        const f = c === 1 ? cb : cr, qp = f ? this.chromaQp(c) : 0;
        for (let t = 0; t < tN; t++) {
          this.predIntra(c, xc, yc + t * nc, log2C, mode);
          if ((f >> t) & 1) this.residual(c, xc, yc + t * nc, log2C, mode, qp);
          if (cf === 2) { // mark the first half's chroma reconstruction for the second half's neighbour availability (luma map already set)
          }
        }
      }
    }
  }

  // ---- intra sample prediction
  predIntra(cIdx, xC, yC, log2, mode) {
    const n = 1 << log2, n2 = n << 1, n4 = n2 << 1;
    const plane = this.planes[cIdx], stride = this.strides[cIdx];
    const sw = cIdx ? this.subW : 1, sh = cIdx ? this.subH : 1;
    const bd = cIdx ? this.sps.bitDepthC : this.sps.bitDepthY, maxv = (1 << bd) - 1;
    const ref = this.ref, av = this.av, uw = 4 / sw, uh = 4 / sh;
    let cnt = 0;
    for (let k = 0; k < n2; k += uh) {
      const a = this.avZ((xC - 1) * sw, (yC + k) * sh) ? 1 : 0;
      for (let j = 0; j < uh; j++) { const i = n2 - 1 - (k + j); av[i] = a; if (a) { ref[i] = plane[(yC + k + j) * stride + xC - 1]; cnt++; } }
    }
    { const a = this.avZ((xC - 1) * sw, (yC - 1) * sh) ? 1 : 0; av[n2] = a; if (a) { ref[n2] = plane[(yC - 1) * stride + xC - 1]; cnt++; } }
    for (let k = 0; k < n2; k += uw) {
      const a = this.avZ((xC + k) * sw, (yC - 1) * sh) ? 1 : 0;
      for (let j = 0; j < uw; j++) { const i = n2 + 1 + k + j; av[i] = a; if (a) { ref[i] = plane[(yC - 1) * stride + xC + k + j]; cnt++; } }
    }
    if (cnt === 0) ref.fill(1 << (bd - 1), 0, n4 + 1);
    else if (cnt < n4 + 1) {
      if (!av[0]) { let i = 1; while (!av[i]) i++; ref[0] = ref[i]; }
      for (let i = 1; i <= n4; i++) if (!av[i]) ref[i] = ref[i - 1];
    }
    let r = ref;
    if ((cIdx === 0 || this.cf === 3) && mode !== 1 && n !== 4) {
      const md = Math.min(Math.abs(mode - 26), Math.abs(mode - 10)), thr = n === 8 ? 7 : n === 16 ? 1 : 0;
      if (md > thr) {
        const rf = this.rf;
        if (this.sps.strongIntra && cIdx === 0 && n === 32 &&
          Math.abs(ref[n2] + ref[n4] - 2 * ref[n2 + n]) < (1 << (bd - 5)) && Math.abs(ref[n2] + ref[0] - 2 * ref[n2 - n]) < (1 << (bd - 5))) {
          const c = ref[n2], bl = ref[0], tr = ref[n4];
          rf[0] = bl; rf[n2] = c; rf[n4] = tr;
          for (let i = 0; i < 63; i++) { rf[63 - i] = ((63 - i) * c + (i + 1) * bl + 32) >> 6; rf[65 + i] = ((63 - i) * c + (i + 1) * tr + 32) >> 6; }
        } else {
          rf[0] = ref[0]; rf[n4] = ref[n4];
          for (let i = 1; i < n4; i++) rf[i] = (ref[i - 1] + 2 * ref[i] + ref[i + 1] + 2) >> 2;
        }
        r = rf;
      }
    }
    const base = yC * stride + xC;
    if (mode === 0) {
      const tr = r[n2 + 1 + n], bl = r[n2 - 1 - n], s = log2 + 1;
      for (let y = 0; y < n; y++) {
        const l = r[n2 - 1 - y], o = base + y * stride;
        for (let x = 0; x < n; x++) plane[o + x] = ((n - 1 - x) * l + (x + 1) * tr + (n - 1 - y) * r[n2 + 1 + x] + (y + 1) * bl + n) >> s;
      }
    } else if (mode === 1) {
      let sum = n;
      for (let i = 0; i < n; i++) sum += r[n2 + 1 + i] + r[n2 - 1 - i];
      const dc = sum >> (log2 + 1);
      for (let y = 0; y < n; y++) plane.fill(dc, base + y * stride, base + y * stride + n);
      if (cIdx === 0 && n < 32) {
        plane[base] = (r[n2 - 1] + 2 * dc + r[n2 + 1] + 2) >> 2;
        for (let x = 1; x < n; x++) plane[base + x] = (r[n2 + 1 + x] + 3 * dc + 2) >> 2;
        for (let y = 1; y < n; y++) plane[base + y * stride] = (r[n2 - 1 - y] + 3 * dc + 2) >> 2;
      }
    } else {
      const angle = INTRA_ANGLE[mode], A = this.refA, OFF = 64;
      if (mode >= 18) {
        for (let k = 0; k <= n; k++) A[OFF + k] = r[n2 + k];
        if (angle < 0) {
          const last = (n * angle) >> 5;
          if (last < -1) { const inv = INV_ANGLE[mode]; for (let k = last; k < 0; k++) A[OFF + k] = r[n2 - ((k * inv + 128) >> 8)]; }
        } else for (let k = n + 1; k <= n2; k++) A[OFF + k] = r[n2 + k];
        for (let y = 0; y < n; y++) {
          const idx = ((y + 1) * angle) >> 5, f = ((y + 1) * angle) & 31, o = base + y * stride, a0 = OFF + idx + 1;
          if (f) for (let x = 0; x < n; x++) plane[o + x] = ((32 - f) * A[a0 + x] + f * A[a0 + x + 1] + 16) >> 5;
          else for (let x = 0; x < n; x++) plane[o + x] = A[a0 + x];
        }
        if (mode === 26 && cIdx === 0 && n < 32) {
          for (let y = 0; y < n; y++) plane[base + y * stride] = clip3(0, maxv, r[n2 + 1] + ((r[n2 - 1 - y] - r[n2]) >> 1));
        }
      } else {
        for (let k = 0; k <= n; k++) A[OFF + k] = r[n2 - k];
        if (angle < 0) {
          const last = (n * angle) >> 5;
          if (last < -1) { const inv = INV_ANGLE[mode]; for (let k = last; k < 0; k++) A[OFF + k] = r[n2 + ((k * inv + 128) >> 8)]; }
        } else for (let k = n + 1; k <= n2; k++) A[OFF + k] = r[n2 - k];
        for (let x = 0; x < n; x++) {
          const idx = ((x + 1) * angle) >> 5, f = ((x + 1) * angle) & 31, a0 = OFF + idx + 1;
          if (f) for (let y = 0; y < n; y++) plane[base + y * stride + x] = ((32 - f) * A[a0 + y] + f * A[a0 + y + 1] + 16) >> 5;
          else for (let y = 0; y < n; y++) plane[base + y * stride + x] = A[a0 + y];
        }
        if (mode === 10 && cIdx === 0 && n < 32) {
          for (let x = 0; x < n; x++) plane[base + x] = clip3(0, maxv, r[n2 - 1] + ((r[n2 + 1 + x] - r[n2]) >> 1));
        }
      }
    }
  }

  // ---- residual coding + reconstruction of one transform block
  residual(cIdx, xC, yC, log2, predMode, qP) {
    const pps = this.pps, sps = this.sps, n = 1 << log2, coef = this.coef, cf = this.cf;
    const bd = cIdx ? sps.bitDepthC : sps.bitDepthY, bypass = this.cuBypass;
    let tskip = 0;
    if (pps.transformSkip && !bypass && log2 <= pps.log2MaxTs) tskip = this.dec(C_TSKIP + (cIdx ? 1 : 0));
    let ctxOff, ctxShift;
    if (cIdx === 0) { ctxOff = 3 * (log2 - 2) + ((log2 - 1) >> 2); ctxShift = (log2 + 1) >> 2; } else { ctxOff = 15; ctxShift = log2 - 2; }
    const cMax = (log2 << 1) - 1;
    let px = 0, py = 0;
    while (px < cMax && this.dec(C_LASTX + ctxOff + (px >> ctxShift))) px++;
    while (py < cMax && this.dec(C_LASTY + ctxOff + (py >> ctxShift))) py++;
    let lastX = px, lastY = py;
    if (px > 3) { const nb = (px >> 1) - 1; lastX = (1 << nb) * (2 + (px & 1)) + this.bypN(nb); }
    if (py > 3) { const nb = (py >> 1) - 1; lastY = (1 << nb) * (2 + (py & 1)) + this.bypN(nb); }
    let scanIdx = 0;
    if (log2 === 2 || (log2 === 3 && (cIdx === 0 || cf === 3))) {
      if (predMode >= 6 && predMode <= 14) scanIdx = 2; else if (predMode >= 22 && predMode <= 30) scanIdx = 1;
    }
    if (scanIdx === 2) { const t = lastX; lastX = lastY; lastY = t; }
    const sbLog = log2 - 2, sbW = 1 << sbLog;
    const scS = SCANS[scanIdx][sbLog], sc4 = SCANS[scanIdx][2];
    const lastSb = scS.inv[(lastY >> 2) * sbW + (lastX >> 2)], lastPos = sc4.inv[(lastY & 3) * 4 + (lastX & 3)];
    const csbf = this.csbf; csbf.fill(0);
    const sigPos = this.sigPos, absL = this.absL;
    const sdh = pps.signHiding && !bypass;
    // dequant setup
    const bdShift = bd + log2 - 5, add = 1 << (bdShift - 1);
    let flat = 0, SF = null;
    const scalingOn = this.scalingF !== null && !(tskip && n > 4);
    if (!bypass) {
      const ls = LEVEL_SCALE[qP % 6] * (1 << ((qP / 6) | 0));
      if (scalingOn) SF = this.scalingF[log2 - 2][cIdx]; // intra: matrixId = cIdx
      flat = 16 * ls;
      this.dqScale = ls;
    }
    let c1 = 1, maxX = 0, maxY = 0;
    for (let i = lastSb; i >= 0; i--) {
      const xS = scS.x[i], yS = scS.y[i];
      let csb = 1, inferDc = 0;
      const right = csbf[yS * 9 + xS + 1], below = csbf[(yS + 1) * 9 + xS];
      if (i < lastSb && i > 0) { csb = this.dec(C_CSBF + (cIdx ? 2 : 0) + (right | below)); inferDc = 1; }
      csbf[yS * 9 + xS] = csb;
      if (!csb) continue;
      let nSig = 0, startN = 15;
      if (i === lastSb) { startN = lastPos - 1; sigPos[nSig++] = lastPos; }
      const prevCsbf = right | (below << 1);
      for (let nn = startN; nn >= 0; nn--) {
        const xP = sc4.x[nn], yP = sc4.y[nn];
        let sig = 1;
        if (nn > 0 || !inferDc) {
          let sigCtx;
          if (log2 === 2) sigCtx = CTX_IDX_MAP4[(yP << 2) + xP];
          else if (i === 0 && nn === 0) sigCtx = 0;
          else {
            sigCtx = SIG_PAT[prevCsbf * 16 + yP * 4 + xP];
            if (cIdx === 0) { if (i > 0) sigCtx += 3; sigCtx += log2 === 3 ? (scanIdx === 0 ? 9 : 15) : 21; }
            else sigCtx += log2 === 3 ? 9 : 12;
          }
          sig = this.dec(C_SIG + (cIdx ? 27 + sigCtx : sigCtx));
          if (sig) inferDc = 0;
        }
        if (sig) sigPos[nSig++] = nn;
      }
      if (!nSig) continue;
      // greater1 / greater2
      const ctxSet = ((i > 0 && cIdx === 0) ? 2 : 0) + (c1 === 0 ? 1 : 0);
      c1 = 1;
      const nG1 = nSig < 8 ? nSig : 8;
      let firstG2 = -1;
      for (let k = 0; k < nSig; k++) absL[k] = 1;
      for (let k = 0; k < nG1; k++) {
        if (this.dec(C_G1 + (cIdx ? 16 : 0) + ctxSet * 4 + c1)) { absL[k] = 2; c1 = 0; if (firstG2 < 0) firstG2 = k; }
        else if (c1 > 0 && c1 < 3) c1++;
      }
      if (firstG2 >= 0 && this.dec(C_G2 + (cIdx ? 4 : 0) + ctxSet)) absL[firstG2] = 3;
      const hidden = sdh && sigPos[0] - sigPos[nSig - 1] > 3;
      const nSign = nSig - (hidden ? 1 : 0);
      const signs = this.bypN(nSign);
      let rice = 0, sumAbs = 0;
      for (let k = 0; k < nSig; k++) {
        const base = absL[k], thr = k < 8 ? (k === firstG2 ? 3 : 2) : 1;
        let a = base;
        if (base === thr) {
          // coeff_abs_level_remaining
          let prefix = 0;
          while (prefix < 32 && this.byp()) prefix++;
          let rem;
          if (prefix <= 3) rem = (prefix << rice) + this.bypN(rice);
          else { if (prefix > 31) throw new Error('Corrupt bitstream (coefficient level)'); rem = (((1 << (prefix - 3)) + 3 - 1) << rice) + this.bypN(prefix - 3 + rice); }
          a = base + rem;
          if (a > 3 * (1 << rice)) rice = Math.min(rice + 1, 4);
        }
        sumAbs += a;
        let neg = k < nSign ? (signs >> (nSign - 1 - k)) & 1 : 0;
        if (hidden && k === nSig - 1 && (sumAbs & 1)) neg = 1;
        const lvl = neg ? -a : a;
        const nn = sigPos[k], xc = (xS << 2) + sc4.x[nn], yc = (yS << 2) + sc4.y[nn], idx = yc * n + xc;
        if (xc > maxX) maxX = xc; if (yc > maxY) maxY = yc;
        if (bypass) coef[idx] = lvl;
        else {
          const v = lvl * (SF ? SF[idx] * this.dqScale : flat) + add;
          coef[idx] = v >= 2147483648 || v < -2147483648 ? (v < 0 ? -32768 : 32767) : clip3(-32768, 32767, v >> bdShift);
        }
      }
    }
    // inverse transform
    const res = this.res, nn2 = n * n;
    if (bypass) { for (let i = 0; i < nn2; i++) res[i] = coef[i]; }
    else if (tskip) {
      const sh2 = 20 - bd, ts = 5 + log2, a2 = 1 << (sh2 - 1);
      for (let i = 0; i < nn2; i++) res[i] = ((coef[i] << ts) + a2) >> sh2;
    } else this.inverseTransform(log2, maxX, maxY, bd, cIdx === 0 && log2 === 2);
    // add + clear
    const plane = this.planes[cIdx], stride = this.strides[cIdx], maxv = (1 << bd) - 1, base = yC * stride + xC;
    for (let y = 0; y < n; y++) {
      const o = base + y * stride, ro = y * n;
      for (let x = 0; x < n; x++) { const v = plane[o + x] + res[ro + x]; plane[o + x] = v < 0 ? 0 : v > maxv ? maxv : v; }
    }
    coef.fill(0, 0, nn2);
  }

  inverseTransform(log2, maxX, maxY, bd, dst) {
    const n = 1 << log2, coef = this.coef, tmp = this.tmp, res = this.res, M = dst ? DST_MAT : DCT_MAT[log2];
    const sh2 = 20 - bd, a2 = 1 << (sh2 - 1);
    if (!dst && maxX === 0 && maxY === 0) {
      let v = (64 * coef[0] + 64) >> 7; v = clip3(-32768, 32767, v);
      const r = (64 * v + a2) >> sh2;
      res.fill(r, 0, n * n);
      return;
    }
    // stage 1: columns
    for (let x = 0; x <= maxX; x++) {
      for (let y = 0; y < n; y++) {
        let s = 0;
        for (let k = 0; k <= maxY; k++) { const c = coef[k * n + x]; if (c !== 0) s += M[k * n + y] * c; }
        tmp[y * n + x] = clip3(-32768, 32767, (s + 64) >> 7);
      }
    }
    // stage 2: rows
    for (let y = 0; y < n; y++) {
      const to = y * n;
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let k = 0; k <= maxX; k++) s += M[k * n + x] * tmp[to + k];
        res[to + x] = (s + a2) >> sh2;
      }
    }
  }
}

// ---- in-loop filters + picture driver (methods added to the decoder prototype)
Object.assign(HevcDecoder.prototype, {
  filterLuma(P, q0, xs, ys, beta, tc, noP, noQ, maxv) {
    const l3 = q0 + 3 * ys;
    const p00 = P[q0 - xs], p10 = P[q0 - 2 * xs], p20 = P[q0 - 3 * xs], p30 = P[q0 - 4 * xs];
    const q00 = P[q0], q10 = P[q0 + xs], q20 = P[q0 + 2 * xs], q30 = P[q0 + 3 * xs];
    const p03 = P[l3 - xs], p13 = P[l3 - 2 * xs], p23 = P[l3 - 3 * xs], p33 = P[l3 - 4 * xs];
    const q03 = P[l3], q13 = P[l3 + xs], q23 = P[l3 + 2 * xs], q33 = P[l3 + 3 * xs];
    const dp0 = Math.abs(p20 - 2 * p10 + p00), dp3 = Math.abs(p23 - 2 * p13 + p03);
    const dq0 = Math.abs(q20 - 2 * q10 + q00), dq3 = Math.abs(q23 - 2 * q13 + q03);
    const dpq0 = dp0 + dq0, dpq3 = dp3 + dq3, dp = dp0 + dp3, dq = dq0 + dq3;
    if (dpq0 + dpq3 >= beta) return;
    const tcs = (5 * tc + 1) >> 1;
    const s0 = 2 * dpq0 < (beta >> 2) && Math.abs(p30 - p00) + Math.abs(q00 - q30) < (beta >> 3) && Math.abs(p00 - q00) < tcs;
    const s3 = 2 * dpq3 < (beta >> 2) && Math.abs(p33 - p03) + Math.abs(q03 - q33) < (beta >> 3) && Math.abs(p03 - q03) < tcs;
    const strong = s0 && s3, thr = (beta + (beta >> 1)) >> 3, dEp = dp < thr, dEq = dq < thr, tc2 = tc * 2, tch = tc >> 1;
    for (let k = 0; k < 4; k++) {
      const o = q0 + k * ys;
      const p0 = P[o - xs], p1 = P[o - 2 * xs], p2 = P[o - 3 * xs], p3 = P[o - 4 * xs], q0v = P[o], q1 = P[o + xs], q2 = P[o + 2 * xs], q3 = P[o + 3 * xs];
      if (strong) {
        if (!noP) {
          P[o - xs] = clip3(p0 - tc2, p0 + tc2, (p2 + 2 * p1 + 2 * p0 + 2 * q0v + q1 + 4) >> 3);
          P[o - 2 * xs] = clip3(p1 - tc2, p1 + tc2, (p2 + p1 + p0 + q0v + 2) >> 2);
          P[o - 3 * xs] = clip3(p2 - tc2, p2 + tc2, (2 * p3 + 3 * p2 + p1 + p0 + q0v + 4) >> 3);
        }
        if (!noQ) {
          P[o] = clip3(q0v - tc2, q0v + tc2, (p1 + 2 * p0 + 2 * q0v + 2 * q1 + q2 + 4) >> 3);
          P[o + xs] = clip3(q1 - tc2, q1 + tc2, (p0 + q0v + q1 + q2 + 2) >> 2);
          P[o + 2 * xs] = clip3(q2 - tc2, q2 + tc2, (p0 + q0v + q1 + 3 * q2 + 2 * q3 + 4) >> 3);
        }
      } else {
        let d = (9 * (q0v - p0) - 3 * (q1 - p1) + 8) >> 4;
        if (Math.abs(d) < tc * 10) {
          d = clip3(-tc, tc, d);
          if (!noP) {
            P[o - xs] = clip3(0, maxv, p0 + d);
            if (dEp) P[o - 2 * xs] = clip3(0, maxv, p1 + clip3(-tch, tch, (((p2 + p0 + 1) >> 1) - p1 + d) >> 1));
          }
          if (!noQ) {
            P[o] = clip3(0, maxv, q0v - d);
            if (dEq) P[o + xs] = clip3(0, maxv, q1 + clip3(-tch, tch, (((q2 + q0v + 1) >> 1) - q1 - d) >> 1));
          }
        }
      }
    }
  },

  filterChroma(P, q0, xs, ys, cnt, tc, noP, noQ, maxv) {
    for (let k = 0; k < cnt; k++) {
      const o = q0 + k * ys, p0 = P[o - xs], p1 = P[o - 2 * xs], q0v = P[o], q1 = P[o + xs];
      const d = clip3(-tc, tc, ((((q0v - p0) << 2) + p1 - q1 + 4) >> 3));
      if (!noP) P[o - xs] = clip3(0, maxv, p0 + d);
      if (!noQ) P[o] = clip3(0, maxv, q0v - d);
    }
  },

  *deblock() {
    const W = this.W, H = this.H, w4 = this.w4, cf = this.cf, lg = this.log2Ctb, wCtb = this.wCtb, pps = this.pps, sps = this.sps;
    const bdY = sps.bitDepthY, bdC = sps.bitDepthC, maxY = (1 << bdY) - 1, maxC = (1 << bdC) - 1, sw = this.subW, sh = this.subH;
    for (let dir = 0; dir < 2; dir++) {
      const E = dir === 0 ? this.edgeV : this.edgeH;
      for (let y = 0; y < H; y += 4) {
        if (dir === 1 && (y & 7)) continue;
        if ((y & ((1 << lg) - 1)) === 0) yield;
        for (let x = 0; x < W; x += 4) {
          if (dir === 0 && (x & 7)) continue;
          const ui = (y >> 2) * w4 + (x >> 2);
          if (!E[ui]) continue;
          const pi = dir === 0 ? ui - 1 : ui - w4;
          const hdr = this.hdrs[this.ctbHdr[(y >> lg) * wCtb + (x >> lg)]];
          const qq = this.qpMap[ui], qp = this.qpMap[pi], qpL = (qq + qp + 1) >> 1;
          const noQ = this.noFilt[ui] === 1, noP = this.noFilt[pi] === 1;
          const beta = BETA_TAB[clip3(0, 51, qpL + (hdr.betaOff << 1))] * (1 << (bdY - 8));
          const tc = TC_TAB[clip3(0, 53, qpL + 2 + (hdr.tcOff << 1))] * (1 << (bdY - 8));
          const P = this.planes[0], st = this.strides[0];
          if (dir === 0) this.filterLuma(P, y * st + x, 1, st, beta, tc, noP, noQ, maxY);
          else this.filterLuma(P, y * st + x, st, 1, beta, tc, noP, noQ, maxY);
          if (cf && (dir === 0 ? x % (8 * sw) === 0 : y % (8 * sh) === 0)) {
            for (let c = 1; c < 3; c++) {
              const qpi = qpL + (c === 1 ? pps.cbOff : pps.crOff);
              const qpc = cf === 1 ? (qpi < 30 ? qpi : qpi >= 44 ? qpi - 6 : QPC_TAB[qpi - 30]) : Math.min(qpi, 51);
              const tcc = TC_TAB[clip3(0, 53, qpc + 2 + (hdr.tcOff << 1))] * (1 << (bdC - 8));
              const Pc = this.planes[c], sc = this.strides[c];
              if (dir === 0) this.filterChroma(Pc, (y / sh) * sc + x / sw, 1, sc, 4 / sh, tcc, noP, noQ, maxC);
              else this.filterChroma(Pc, (y / sh) * sc + x / sw, sc, 1, 4 / sw, tcc, noP, noQ, maxC);
            }
          }
        }
      }
    }
  },

  *saoPass() {
    const sps = this.sps, cf = this.cf, nC = cf ? 3 : 1;
    if (!this.hdrs.some((h) => h.saoLuma || h.saoChroma)) return;
    const src = this.planes.map((p) => p && p.slice());
    const wCtb = this.wCtb, hCtb = sps.hCtb, ctb = sps.ctbSize, w4 = this.w4, pps = this.pps;
    const allow = new Uint8Array(9), band = new Int32Array(32), eoff = new Int32Array(5);
    for (let rs = 0; rs < this.nCtb; rs++) {
      const rx = rs % wCtb, ry = (rs / wCtb) | 0;
      if (rx === 0) yield;
      if (this.ctbHdr[rs] < 0) continue;
      const hdr = this.hdrs[this.ctbHdr[rs]];
      let allowDone = false;
      for (let c = 0; c < nC; c++) {
        if (!(c === 0 ? hdr.saoLuma : hdr.saoChroma)) continue;
        const type = this.saoType[rs * 3 + c];
        if (!type) continue;
        const sw = c ? this.subW : 1, sh = c ? this.subH : 1, bd = c ? sps.bitDepthC : sps.bitDepthY, maxv = (1 << bd) - 1;
        const cw = this.strides[c], chh = c ? this.H / sh : this.H;
        const x0 = (rx * ctb) / sw, y0 = (ry * ctb) / sh, x1 = Math.min(x0 + ctb / sw, cw), y1 = Math.min(y0 + ctb / sh, chh);
        const S = src[c], D = this.planes[c], oi = (rs * 3 + c) * 4, O = this.saoOff, nf = this.anyNoFilt, NF = this.noFilt;
        if (type === 1) {
          band.fill(0); const bp = this.saoBand[rs * 3 + c], shift = bd - 5;
          for (let k = 0; k < 4; k++) band[(k + bp) & 31] = k + 1;
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            if (nf && NF[((y * sh) >> 2) * w4 + ((x * sw) >> 2)]) continue;
            const v = S[y * cw + x], k = band[v >> shift];
            if (k) D[y * cw + x] = clip3(0, maxv, v + O[oi + k - 1]);
          }
        } else {
          if (!allowDone) {
            allowDone = true;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const nx = rx + dx, ny = ry + dy; let ok = 1;
              if (nx < 0 || ny < 0 || nx >= wCtb || ny >= hCtb) ok = 0;
              else {
                const nrs = ny * wCtb + nx;
                if (this.ctbHdr[nrs] < 0) ok = 0;
                else {
                  if (this.ctbSlice[nrs] !== this.ctbSlice[rs]) {
                    const lf = this.rsToTs[nrs] < this.rsToTs[rs] ? hdr.lfAcross : this.hdrs[this.ctbHdr[nrs]].lfAcross;
                    if (!lf) ok = 0;
                  }
                  if (this.tileRs[nrs] !== this.tileRs[rs] && !pps.lfAcrossTiles) ok = 0;
                }
              }
              allow[(dy + 1) * 3 + dx + 1] = ok;
            }
          }
          const eo = this.saoEo[rs * 3 + c];
          eoff[0] = O[oi]; eoff[1] = O[oi + 1]; eoff[2] = 0; eoff[3] = O[oi + 2]; eoff[4] = O[oi + 3];
          const dxA = [-1, 0, -1, 1][eo], dyA = [0, -1, -1, -1][eo], dxB = -dxA, dyB = -dyA;
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const ax = x + dxA, ay = y + dyA, bx = x + dxB, by = y + dyB;
            if (ax < x0 || ax >= x1 || ay < y0 || ay >= y1) { if (!allow[(ay < y0 ? 0 : ay >= y1 ? 2 : 1) * 3 + (ax < x0 ? 0 : ax >= x1 ? 2 : 1)]) continue; }
            if (bx < x0 || bx >= x1 || by < y0 || by >= y1) { if (!allow[(by < y0 ? 0 : by >= y1 ? 2 : 1) * 3 + (bx < x0 ? 0 : bx >= x1 ? 2 : 1)]) continue; }
            if (nf && NF[((y * sh) >> 2) * w4 + ((x * sw) >> 2)]) continue;
            const v = S[y * cw + x], a = S[ay * cw + ax], b = S[by * cw + bx];
            const e = 2 + (v > a ? 1 : v < a ? -1 : 0) + (v > b ? 1 : v < b ? -1 : 0);
            if (e !== 2) D[y * cw + x] = clip3(0, maxv, v + eoff[e]);
          }
        }
      }
    }
  },

  *finishPicture() {
    yield* this.deblock();
    yield* this.saoPass();
    const s = this.sps, cf = this.cf;
    this.pic = false;
    return {
      width: s.width, height: s.height, chromaFormat: cf, bitDepthY: s.bitDepthY, bitDepthC: s.bitDepthC,
      planes: this.planes, strides: this.strides, subW: s.subW, subH: s.subH,
      crop: { l: s.cropL * s.subW, r: s.cropR * s.subW, t: s.cropT * s.subH, b: s.cropB * s.subH },
      vui: { fullRange: s.vuiFullRange, primaries: s.vuiPrimaries, transfer: s.vuiTransfer, matrix: s.vuiMatrix },
    };
  },

  // decode a list of NAL units (each starting with its 2-byte header); returns the list of decoded pictures
  *decodeNals(nals) {
    const out = [];
    for (const nal of nals) {
      if (nal.length < 3) continue;
      const t = (nal[0] >> 1) & 63;
      if (t === 33 || t === 34) this.addParamSet(nal);
      else if (t <= 9 || (t >= 16 && t <= 21)) {
        if ((nal[1] & 7) === 0) continue; // nuh_temporal_id_plus1 == 0 is invalid
        if (((nal[0] & 1) << 5 | nal[1] >> 3) !== 0) continue; // nuh_layer_id > 0: other layers ignored
        const h = this.parseSliceHeader(nal);
        if (h.first) {
          if (this.pic) out.push(yield* this.finishPicture());
          this.startPicture(h); this.pic = true;
        } else if (!this.pic) throw new Error('Corrupt bitstream: slice without picture start');
        yield* this.sliceData(h);
      }
    }
    if (this.pic) out.push(yield* this.finishPicture());
    return out;
  },
});

const runSync = (gen) => { for (;;) { const r = gen.next(); if (r.done) return r.value; } };

// Node/test helper: Annex-B byte stream -> pictures with planes cropped to the conformance window
export function decodeHevcAnnexB(bytes) {
  const dec = new HevcDecoder();
  const pics = runSync(dec.decodeNals(splitAnnexB(bytes)));
  return pics.map(cropPicture);
}
function cropPicture(p) {
  const out = { width: 0, height: 0, chromaFormat: p.chromaFormat, bitDepthY: p.bitDepthY, bitDepthC: p.bitDepthC, planes: [] };
  const w = p.width - p.crop.l - p.crop.r, h = p.height - p.crop.t - p.crop.b;
  out.width = w; out.height = h;
  for (let c = 0; c < (p.chromaFormat ? 3 : 1); c++) {
    const sw = c ? p.subW : 1, sh = c ? p.subH : 1, cw = w / sw, ch = h / sh, st = p.strides[c];
    const o = new Uint16Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) o[y * cw + x] = p.planes[c][(y + p.crop.t / sh) * st + x + p.crop.l / sw];
    out.planes.push(o);
  }
  return out;
}

// ---------------------------------------------------------------- HEIF container (ISO/IEC 14496-12 + 23008-12)
const u32 = (b, p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
const u16 = (b, p) => (b[p] << 8) | b[p + 1];
const s32 = (b, p) => (b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
const fourcc = (b, p) => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
const uN = (b, p, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[p + i]; return v; };

function readBoxes(b, start, end) {
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = u32(b, p), hdr = 8;
    const type = fourcc(b, p + 4);
    if (size === 1) { size = uN(b, p + 8, 8); hdr = 16; } else if (size === 0) size = end - p;
    if (size < hdr || p + size > end) { if (p + size > end && size >= hdr) size = end - p; else break; }
    out.push({ type, s: p + hdr, e: p + size });
    p += size;
  }
  return out;
}

function parseProp(b, bx) {
  const t = bx.type, s = bx.s;
  if (t === 'ispe') return { type: t, w: u32(b, s + 4), h: u32(b, s + 8) };
  if (t === 'colr') {
    const ct = fourcc(b, s);
    if (ct === 'nclx') return { type: t, ct, primaries: u16(b, s + 4), transfer: u16(b, s + 6), matrix: u16(b, s + 8), fullRange: (b[s + 10] >> 7) & 1 };
    return { type: t, ct, icc: b.subarray(s + 4, bx.e) };
  }
  if (t === 'pixi') { const n = b[s + 4]; return { type: t, bits: Array.from(b.subarray(s + 5, s + 5 + n)) }; }
  if (t === 'irot') return { type: t, angle: b[s] & 3 };
  if (t === 'imir') return { type: t, axis: b[s] & 1 };
  if (t === 'clap') return { type: t, wN: u32(b, s), wD: u32(b, s + 4), hN: u32(b, s + 8), hD: u32(b, s + 12), xN: s32(b, s + 16), xD: u32(b, s + 20), yN: s32(b, s + 24), yD: u32(b, s + 28) };
  if (t === 'hvcC') {
    const lengthSize = (b[s + 21] & 3) + 1, nArr = b[s + 22], nals = [];
    let p = s + 23;
    for (let i = 0; i < nArr && p + 3 <= bx.e; i++) {
      const nt = b[p] & 63, cnt = u16(b, p + 1); p += 3;
      for (let j = 0; j < cnt && p + 2 <= bx.e; j++) { const l = u16(b, p); p += 2; if (nt >= 32 && nt <= 34) nals.push(b.subarray(p, p + l)); p += l; }
    }
    return { type: t, lengthSize, nals, chromaFormat: b[s + 16] & 3, bitDepthY: (b[s + 17] & 7) + 8, bitDepthC: (b[s + 18] & 7) + 8 };
  }
  return { type: t };
}

export function parseHeif(b) {
  const top = readBoxes(b, 0, b.length);
  const ftyp = top.find((x) => x.type === 'ftyp');
  if (!ftyp) throw new Error('Not a HEIF/HEIC file (no ftyp box)');
  const brands = [fourcc(b, ftyp.s)];
  for (let p = ftyp.s + 8; p + 4 <= ftyp.e; p += 4) brands.push(fourcc(b, p));
  const metaBox = top.find((x) => x.type === 'meta');
  if (!metaBox) throw new Error('HEIF file has no meta box');
  const kids = readBoxes(b, metaBox.s + 4, metaBox.e);
  const get = (t) => kids.find((x) => x.type === t);
  const items = new Map();
  const item = (id) => { let it = items.get(id); if (!it) { it = { id, type: '', hidden: false, props: [], refs: {}, extents: [], method: 0, base: 0 }; items.set(id, it); } return it; };
  let primary = null;
  const pitm = get('pitm');
  if (pitm) primary = b[pitm.s] === 0 ? u16(b, pitm.s + 4) : u32(b, pitm.s + 4);
  const iinf = get('iinf');
  if (iinf) {
    const v = b[iinf.s];
    for (const bx of readBoxes(b, iinf.s + (v === 0 ? 6 : 8), iinf.e)) {
      if (bx.type !== 'infe') continue;
      const ver = b[bx.s], flags = uN(b, bx.s + 1, 3);
      if (ver < 2) continue;
      let p = bx.s + 4, id;
      if (ver === 2) { id = u16(b, p); p += 2; } else { id = u32(b, p); p += 4; }
      p += 2;
      const it = item(id); it.type = fourcc(b, p); it.hidden = !!(flags & 1);
    }
  }
  const idat = get('idat');
  const iloc = get('iloc');
  if (iloc) {
    const v = b[iloc.s];
    let p = iloc.s + 4;
    const offSize = b[p] >> 4, lenSize = b[p] & 15, baseSize = b[p + 1] >> 4, idxSize = v === 1 || v === 2 ? b[p + 1] & 15 : 0;
    p += 2;
    let count;
    if (v < 2) { count = u16(b, p); p += 2; } else { count = u32(b, p); p += 4; }
    for (let i = 0; i < count && p < iloc.e; i++) {
      let id;
      if (v < 2) { id = u16(b, p); p += 2; } else { id = u32(b, p); p += 4; }
      const it = item(id);
      if (v === 1 || v === 2) { it.method = u16(b, p) & 15; p += 2; }
      p += 2;
      it.base = uN(b, p, baseSize); p += baseSize;
      const ec = u16(b, p); p += 2;
      for (let j = 0; j < ec; j++) {
        if (idxSize) p += idxSize;
        const off = uN(b, p, offSize); p += offSize;
        const len = uN(b, p, lenSize); p += lenSize;
        it.extents.push({ off, len });
      }
    }
  }
  const iref = get('iref');
  if (iref) {
    const v = b[iref.s];
    for (const bx of readBoxes(b, iref.s + 4, iref.e)) {
      let p = bx.s, from;
      if (v === 0) { from = u16(b, p); p += 2; } else { from = u32(b, p); p += 4; }
      const n = u16(b, p); p += 2;
      const ids = [];
      for (let i = 0; i < n; i++) { if (v === 0) { ids.push(u16(b, p)); p += 2; } else { ids.push(u32(b, p)); p += 4; } }
      const it = item(from);
      (it.refs[bx.type] = it.refs[bx.type] || []).push(...ids);
    }
  }
  const iprp = get('iprp');
  if (iprp) {
    const sub = readBoxes(b, iprp.s, iprp.e);
    const ipco = sub.find((x) => x.type === 'ipco');
    const props = ipco ? readBoxes(b, ipco.s, ipco.e).map((bx) => parseProp(b, bx)) : [];
    for (const ipma of sub.filter((x) => x.type === 'ipma')) {
      const v = b[ipma.s], fl = uN(b, ipma.s + 1, 3);
      let p = ipma.s + 4;
      const n = u32(b, p); p += 4;
      for (let i = 0; i < n && p < ipma.e; i++) {
        let id;
        if (v < 1) { id = u16(b, p); p += 2; } else { id = u32(b, p); p += 4; }
        const ac = b[p++], it = item(id);
        for (let j = 0; j < ac; j++) {
          let idx;
          if (fl & 1) { idx = u16(b, p) & 0x7fff; p += 2; } else idx = b[p++] & 0x7f;
          if (idx > 0 && props[idx - 1]) it.props.push(props[idx - 1]);
        }
      }
    }
  }
  const itemData = (it) => {
    const src = it.method === 1 ? (idat ? b.subarray(idat.s, idat.e) : null) : b;
    if (!src) throw new Error('HEIF item data refers to a missing idat box');
    if (it.method > 1) throw new Error('Unsupported HEIF item construction method ' + it.method);
    const parts = it.extents.map((e) => {
      const o = it.base + e.off, end = e.len === 0 ? src.length : o + e.len;
      if (o > src.length || end > src.length) throw new Error('HEIF item data is outside the file (truncated file?)');
      return src.subarray(o, end);
    });
    if (parts.length === 1) return parts[0];
    const out = new Uint8Array(parts.reduce((a, x) => a + x.length, 0));
    let o = 0; for (const x of parts) { out.set(x, o); o += x.length; }
    return out;
  };
  if (primary == null) { const f = [...items.values()].find((x) => x.type === 'hvc1' || x.type === 'grid'); if (f) primary = f.id; }
  return { brands, items, primary, itemData };
}

// ---------------------------------------------------------------- colour conversion
const MATRICES = { 1: [0.2126, 0.0722], 4: [0.30, 0.11], 5: [0.299, 0.114], 6: [0.299, 0.114], 7: [0.212, 0.087], 9: [0.2627, 0.0593], 10: [0.2627, 0.0593] };
function colourParams(colr, vui) {
  let matrix = 6, full = 0;
  if (colr && colr.ct === 'nclx') { matrix = colr.matrix; full = colr.fullRange; }
  else if (vui && vui.matrix != null) { matrix = vui.matrix; full = vui.fullRange || 0; }
  else if (vui && vui.fullRange != null) full = vui.fullRange;
  return { matrix, full };
}
function yuvToRgba(pic, cp, dst, ox, oy, outW) {
  const { crop, planes, strides, subW, subH, chromaFormat: cf } = pic;
  const w = pic.width - crop.l - crop.r, h = pic.height - crop.t - crop.b;
  const bdY = pic.bitDepthY, bdC = pic.bitDepthC, nY = 1 << bdY, nC = 1 << bdC;
  const km = MATRICES[cp.matrix] || MATRICES[6];
  const identity = cp.matrix === 0 && cf === 3;
  const [kr, kb] = km, kg = 1 - kr - kb;
  const yT = new Float32Array(nY), crR = new Float32Array(nC), cbB = new Float32Array(nC), crG = new Float32Array(nC), cbG = new Float32Array(nC);
  const yOff = cp.full ? 0 : 16 << (bdY - 8), yRange = cp.full ? nY - 1 : 219 << (bdY - 8);
  for (let v = 0; v < nY; v++) yT[v] = ((v - yOff) / yRange) * 255;
  const cMid = 1 << (bdC - 1), cRange = cp.full ? nC - 1 : 224 << (bdC - 8);
  for (let v = 0; v < nC; v++) {
    const c = ((v - cMid) / cRange) * 255;
    crR[v] = 2 * (1 - kr) * c; cbB[v] = 2 * (1 - kb) * c;
    crG[v] = -(2 * kr * (1 - kr) / kg) * c; cbG[v] = -(2 * kb * (1 - kb) / kg) * c;
  }
  const P0 = planes[0], P1 = planes[1], P2 = planes[2], s0 = strides[0], s1 = strides[1];
  const sx = subW === 2 ? 1 : 0, sy = subH === 2 ? 1 : 0;
  // identity (GBR) uses chroma scale of luma
  const cT = identity ? new Float32Array(nC) : null;
  if (identity) for (let v = 0; v < nC; v++) cT[v] = ((v - yOff) / yRange) * 255;
  // chroma is upsampled bilinearly (3/4 + 1/4 taps, chroma samples centred between luma samples) when subsampled
  const cw = cf ? (strides[1]) : 0, chh = cf ? (planes[1].length / strides[1]) | 0 : 0;
  const tmpB = new Uint16Array(cw), tmpR = new Uint16Array(cw), cbRow = new Uint16Array(w), crRow = new Uint16Array(w);
  const vblend = (P, yy, out) => {
    const ya = yy >> 1, yb = yy & 1 ? Math.min(ya + 1, chh - 1) : Math.max(ya - 1, 0), A = ya * s1, B = yb * s1;
    for (let i = 0; i < cw; i++) out[i] = (3 * P[A + i] + P[B + i] + 2) >> 2;
  };
  const hblend = (src, out) => {
    for (let x = 0; x < w; x++) {
      const xx = x + crop.l, xa = xx >> 1, xb = xx & 1 ? Math.min(xa + 1, cw - 1) : Math.max(xa - 1, 0);
      out[x] = (3 * src[xa] + src[xb] + 2) >> 2;
    }
  };
  for (let y = 0; y < h; y++) {
    const yy = y + crop.t;
    let o = ((oy + y) * outW + ox) * 4;
    const r0 = yy * s0 + crop.l, r1 = yy * s1;
    if (!cf) {
      for (let x = 0; x < w; x++) { const v = yT[P0[r0 + x]]; dst[o++] = v; dst[o++] = v; dst[o++] = v; dst[o++] = 255; }
    } else if (identity) {
      for (let x = 0; x < w; x++) { const i1 = r1 + x + crop.l; dst[o++] = cT[P2[i1]]; dst[o++] = yT[P0[r0 + x]]; dst[o++] = cT[P1[i1]]; dst[o++] = 255; }
    } else {
      if (!sx) { for (let x = 0; x < w; x++) { cbRow[x] = P1[r1 + x + crop.l]; crRow[x] = P2[r1 + x + crop.l]; } }
      else if (sy) { vblend(P1, yy, tmpB); vblend(P2, yy, tmpR); hblend(tmpB, cbRow); hblend(tmpR, crRow); }
      else { for (let i = 0; i < cw; i++) { tmpB[i] = P1[r1 + i]; tmpR[i] = P2[r1 + i]; } hblend(tmpB, cbRow); hblend(tmpR, crRow); }
      for (let x = 0; x < w; x++) {
        const v = yT[P0[r0 + x]], cb = cbRow[x], cr = crRow[x];
        dst[o++] = v + crR[cr]; dst[o++] = v + cbG[cb] + crG[cr]; dst[o++] = v + cbB[cb]; dst[o++] = 255;
      }
    }
  }
}

// ---------------------------------------------------------------- derived-image transforms (RGBA, Uint32 views)
function applyTransforms(img, props) {
  let { w, h, data } = img;
  for (const p of props) {
    if (p.type === 'clap') {
      if (!p.wD || !p.hD || !p.xD || !p.yD) continue;
      const cw = Math.round(p.wN / p.wD), ch = Math.round(p.hN / p.hD);
      const cx = (w - 1) / 2 + p.xN / p.xD, cy = (h - 1) / 2 + p.yN / p.yD;
      let l = Math.round(cx - (cw - 1) / 2), t = Math.round(cy - (ch - 1) / 2);
      l = Math.max(0, Math.min(l, w - 1)); t = Math.max(0, Math.min(t, h - 1));
      const nw = Math.max(1, Math.min(cw, w - l)), nh = Math.max(1, Math.min(ch, h - t));
      if (nw === w && nh === h) continue;
      const o = new Uint32Array(nw * nh);
      for (let y = 0; y < nh; y++) o.set(data.subarray((t + y) * w + l, (t + y) * w + l + nw), y * nw);
      data = o; w = nw; h = nh;
    } else if (p.type === 'irot' && p.angle) {
      const o = new Uint32Array(w * h);
      if (p.angle === 2) { for (let i = 0; i < w * h; i++) o[i] = data[w * h - 1 - i]; }
      else if (p.angle === 1) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[(w - 1 - x) * h + y] = data[y * w + x]; [w, h] = [h, w]; }
      else { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[x * h + (h - 1 - y)] = data[y * w + x]; [w, h] = [h, w]; }
      data = o;
    } else if (p.type === 'imir') {
      const o = new Uint32Array(w * h);
      if (p.axis === 0) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[y * w + w - 1 - x] = data[y * w + x]; }
      else for (let y = 0; y < h; y++) o.set(data.subarray(y * w, y * w + w), (h - 1 - y) * w);
      data = o;
    }
  }
  return { w, h, data };
}

// ---------------------------------------------------------------- top level
function* decodeItemGen(heif, dec, it, ctx) {
  const hv = it.props.find((p) => p.type === 'hvcC');
  if (!hv) throw new Error('HEIF image item has no hvcC configuration');
  const data = heif.itemData(it), nals = [...hv.nals];
  const ls = hv.lengthSize;
  for (let p = 0; p + ls <= data.length;) {
    const l = uN(data, p, ls); p += ls;
    if (l === 0) continue;
    if (p + l > data.length) throw new Error('HEIF image data is truncated');
    nals.push(data.subarray(p, p + l)); p += l;
  }
  dec.progress = ctx;
  const pics = yield* dec.decodeNals(nals);
  if (!pics.length) throw new Error('No picture found in HEVC image data');
  return pics[0];
}

export function* decodeHeicGen(bytes, state = {}) {
  if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
  const heif = parseHeif(bytes);
  const prim = heif.items.get(heif.primary);
  if (!prim) throw new Error('HEIF file has no primary image');
  const dec = new HevcDecoder();
  const t = prim.type;
  let out, colr, vui = null, bits = 8, cf = 1, nTiles = 1;
  const propOf = (it, ty) => it.props.find((p) => p.type === ty);
  if (t === 'hvc1' || t === 'hev1') {
    state.total = 1; state.done = 0;
    const pic = yield* decodeItemGen(heif, dec, prim, state);
    const cp = colourParams(propOf(prim, 'colr'), pic.vui);
    const w = pic.width - pic.crop.l - pic.crop.r, h = pic.height - pic.crop.t - pic.crop.b;
    const rgba = new Uint8ClampedArray(w * h * 4);
    yuvToRgba(pic, cp, rgba, 0, 0, w);
    out = { w, h, data: new Uint32Array(rgba.buffer) }; bits = pic.bitDepthY; cf = pic.chromaFormat; colr = propOf(prim, 'colr');
  } else if (t === 'grid') {
    const gd = heif.itemData(prim);
    const flags = gd[1], rows = gd[2] + 1, cols = gd[3] + 1;
    const W = flags & 1 ? u32(gd, 4) : u16(gd, 4), H = flags & 1 ? u32(gd, 8) : u16(gd, 6);
    const ids = (prim.refs.dimg || []);
    if (ids.length < rows * cols) throw new Error('HEIF grid references fewer tiles than rows x columns');
    if (!W || !H || W * H > 2e8) throw new Error('Unreasonable HEIF grid size');
    const rgba = new Uint8ClampedArray(W * H * 4);
    nTiles = rows * cols; state.total = nTiles;
    let tw = 0, th = 0;
    for (let i = 0; i < nTiles; i++) {
      state.done = i;
      const tile = heif.items.get(ids[i]);
      if (!tile || (tile.type !== 'hvc1' && tile.type !== 'hev1')) throw new Error('Unsupported HEIF grid tile type: ' + (tile && tile.type));
      const pic = yield* decodeItemGen(heif, dec, tile, state);
      const w = pic.width - pic.crop.l - pic.crop.r, h = pic.height - pic.crop.t - pic.crop.b;
      if (i === 0) { tw = w; th = h; bits = pic.bitDepthY; cf = pic.chromaFormat; vui = pic.vui; colr = propOf(prim, 'colr') || propOf(tile, 'colr'); }
      const cp = colourParams(colr, vui);
      const ox = (i % cols) * tw, oy = ((i / cols) | 0) * th;
      if (ox >= W || oy >= H) continue;
      // tiles at the right/bottom edge are cropped by writing into a tile-sized scratch if they overflow
      if (ox + w > W || oy + h > H) {
        const tmp = new Uint8ClampedArray(w * h * 4); yuvToRgba(pic, cp, tmp, 0, 0, w);
        for (let y = 0; y < h && oy + y < H; y++) rgba.set(tmp.subarray(y * w * 4, (y * w + Math.min(w, W - ox)) * 4), ((oy + y) * W + ox) * 4);
      } else yuvToRgba(pic, cp, rgba, ox, oy, W);
    }
    out = { w: W, h: H, data: new Uint32Array(rgba.buffer) };
  } else if (t === 'av01') throw new Error('This is an AVIF (AV1) image, not HEIC. Use an AVIF-capable viewer.');
  else if (t === 'iovl' || t === 'iden') throw new Error('Unsupported HEIF derived image type: ' + t);
  else throw new Error('Unsupported HEIF primary item type: ' + (t || 'unknown'));
  const tr = applyTransforms(out, prim.props.filter((p) => p.type === 'clap' || p.type === 'irot' || p.type === 'imir'));
  const icc = prim.props.find((p) => p.type === 'colr' && p.ct !== 'nclx');
  return {
    width: tr.w, height: tr.h, rgba: new Uint8ClampedArray(tr.data.buffer, tr.data.byteOffset, tr.data.byteLength),
    info: { brands: heif.brands, itemType: t, tiles: nTiles, bitDepth: bits, chromaFormat: cf, colour: colr && colr.ct === 'nclx' ? { primaries: colr.primaries, transfer: colr.transfer, matrix: colr.matrix, fullRange: colr.fullRange } : null, hasIcc: !!icc },
  };
}

// synchronous (Node tests, small images)
export function decodeHeic(bytes) { return runSync(decodeHeicGen(bytes)); }

const tick = () => new Promise((r) => { if (typeof MessageChannel !== 'undefined') { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); } else setTimeout(r, 0); });
// asynchronous: yields to the event loop about every 40 ms and reports progress (0..1)
export async function decodeHeicAsync(bytes, onProgress) {
  const state = { done: 0, total: 1, frac: 0 };
  const g = decodeHeicGen(bytes, state);
  let last = performance.now();
  for (;;) {
    const r = g.next();
    if (r.done) { onProgress && onProgress(1); return r.value; }
    const now = performance.now();
    if (now - last > 40) { onProgress && onProgress(Math.min(1, (state.done + (state.frac || 0)) / state.total)); await tick(); last = performance.now(); }
  }
}

// ---------------------------------------------------------------- tool
const DESC = 'Decodes HEIC/HEIF photos (iPhone, Samsung, ...) with a built-in software HEVC decoder, so it works in every browser, including Chrome, Edge and Firefox without any codec; nothing is uploaded. Handles tiled (grid) photos and rotation/mirror/crop properties, and exports JPEG, PNG or WebP. Supported: still-image HEVC (intra / Main, Main Still Picture, Main 10 and 4:0:0, 4:2:2, 4:4:4 up to 12 bit), multi-slice, tiles, wavefront, scaling lists, SAO and deblocking. Not supported: HEIC sequences/live-photo motion (only the primary still is decoded), overlay (iovl) images, alpha and depth maps, AVIF, ICC/Display-P3 colour management (pixel values are shown as stored). Large photos take a few seconds to decode on the CPU.';

const mkEl = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids.flat().filter((x) => x != null)); return e; };
const toBlobP = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));
const fmtMap = { jpeg: ['image/jpeg', 'jpg'], png: ['image/png', 'png'], webp: ['image/webp', 'webp'] };

async function convertFile(file, o, onProgress) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const t0 = performance.now();
  const img = await decodeHeicAsync(bytes, onProgress);
  const dt = performance.now() - t0;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
  const [type, ext] = fmtMap[o.format] || fmtMap.jpeg;
  const q = Math.min(1, Math.max(0.1, Number(o.quality) || 0.92));
  const blob = await toBlobP(c, type, q);
  if (!blob || blob.type !== type) throw new Error(`This browser cannot encode ${o.format}; pick another format`);
  return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.' + ext, img, ms: dt, canvas: c };
}

function heicUI(el) {
  const fileEl = mkEl('input', { type: 'file', accept: 'image/heic,image/heif,.heic,.heif,.hif', multiple: true });
  const fmt = mkEl('select', {}, ...['jpeg', 'png', 'webp'].map((v) => mkEl('option', { value: v, textContent: v })));
  const q = mkEl('input', { type: 'number', value: 0.92, min: 0.1, max: 1, step: 0.01 });
  const out = mkEl('div');
  let runId = 0;
  const go = async () => {
    const id = ++runId, files = [...fileEl.files];
    out.replaceChildren();
    for (const file of files) {
      const status = mkEl('div', { className: 'desc', textContent: 'Decoding ' + file.name + ' ...' });
      const bar = mkEl('progress', { max: 1, value: 0 });
      const box = mkEl('div', {}, mkEl('h3', { textContent: file.name }), bar, status);
      out.append(box);
      try {
        const r = await convertFile(file, { format: fmt.value, quality: q.value }, (p) => { if (id === runId) bar.value = p; });
        if (id !== runId) return;
        bar.remove();
        const mp = (r.img.width * r.img.height) / 1e6;
        status.textContent = `${r.img.width} x ${r.img.height} (${mp.toFixed(1)} MP), decoded in ${(r.ms / 1000).toFixed(2)} s, ${r.img.info.itemType === 'grid' ? r.img.info.tiles + ' tiles, ' : ''}${r.img.info.bitDepth}-bit, ${(r.blob.size / 1024).toFixed(0)} KB ${r.blob.type.slice(6)}`;
        const url = URL.createObjectURL(r.blob);
        const im = mkEl('img', { className: 'prev', src: url });
        im.style.maxWidth = '100%'; im.style.height = 'auto';
        box.append(im, mkEl('div', { className: 'row' }, mkEl('a', { className: 'btn', href: url, download: r.name, textContent: 'Download ' + r.name })));
      } catch (e) { bar.remove(); status.className = 'out err'; status.textContent = file.name + ': ' + (e && e.message || e); }
    }
  };
  fileEl.addEventListener('change', go); fmt.addEventListener('input', go); q.addEventListener('change', go);
  el.append(mkEl('label', {}, 'HEIC / HEIF files'), fileEl,
    mkEl('div', { className: 'opts' }, mkEl('label', {}, 'Format', fmt), mkEl('label', {}, 'Quality (0.1-1)', q)), out);
}

export default [
  {
    id: 'heic-decoder', cat: 'Images – Extra', title: 'HEIC / HEIF Decoder (any browser)', desc: DESC,
    dom: true, custom: true, render: heicUI, inputs: 0, file: { accept: 'image/heic,image/heif,.heic,.heif', multiple: true },
    opts: [{ id: 'format', label: 'Format', type: 'select', choices: ['jpeg', 'png', 'webp'], def: 'jpeg' }, { id: 'quality', label: 'Quality (0.1-1)', type: 'number', def: 0.92 }],
    run: async (_i, o, files) => {
      if (!files.length) throw new Error('Choose a HEIC/HEIF file');
      const outs = [];
      for (const f of files) { const r = await convertFile(f, o); outs.push(new File([r.blob], r.name, { type: r.blob.type })); }
      return { blob: outs };
    },
  },
];

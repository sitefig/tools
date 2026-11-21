// tokenizer2.js: more exact tokenizers in plain JS (no dependencies, client-side only).
// OpenAI: r50k_base, p50k_base, gpt2 (tiktoken BPE; gpt2 has exactly the r50k_base ranks). Hugging Face byte-level BPE: DeepSeek-V3/R1,
// Qwen2.5, Phi-4, GPT-NeoX-20B, StarCoder2, and Mistral-7B-v0.3 (SentencePiece-style Metaspace + byte fallback), re-implemented from scratch
// from the public tokenizer.json files (reduced to vocab+merges+added tokens+pre-tokenizer regexes in data/hf_*.json).
// LEGACY Claude 1/2 tokenizer from the public npm package @anthropic-ai/tokenizer: NOT accurate for Claude 3/4/5-family models.
// The only fetches are same-origin static files in ../../data/ (lazy, parsed once, cached).
// Skipped (gated or unsupported): Llama 2/3/CodeLlama, Gemma, Gemini (gated or unpublished); Falcon (Punctuation/Digits pre-tokenizer chain not implemented);
// Phi-3-mini (SentencePiece normalizer + legacy merge behaviour not implemented); Qwen3 (not requested).
// Ceilings: BPE merge is O(n^2) per pre-tokenized piece (fine for natural text; a single 100k-char piece with no spaces/punctuation is slow);
// NFC/NFKC use the browser's Unicode tables (can differ from Rust's for characters added in very recent Unicode versions).
import { loadEnc as loadTik, encode as encodeTik, decodeBytes as decodeTik } from './tokenizer.js';

const CAT = 'LLM Tools';
const LEGACY = 'LEGACY Claude 1/2 tokenizer (from the public npm package @anthropic-ai/tokenizer). It is NOT accurate for Claude 3, 4 or 5-family models: Anthropic has not published those vocabularies.';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nfmt = (n) => n.toLocaleString('en-US');
const cps = (s) => { let n = 0; for (const _ of s) n++; return n; };
const u8 = new TextEncoder();
const wf = (s) => (s.toWellFormed ? s.toWellFormed() : s);
const bin = (s) => { const b = u8.encode(s); let o = ''; for (let i = 0; i < b.length; i += 8192) o += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return o; };

// ---- regex translation: PCRE/Oniguruma source -> JS (u flag) ----
// Unicode White_Space (what \s means in Rust/Onig/PCRE-with-UCP); JS \s differs (has U+FEFF, lacks U+0085).
const WS = '\\t-\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const isWs = new RegExp('^[' + WS + ']$');
function jsre(src) {
  // (?i:...) groups hold only literal apostrophe-letters here: expand letters to [xX] (older engines lack modifier groups)
  src = src.replace(/\(\?i:([^)]*)\)/g, (_, g) => '(?:' + g.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`) + ')');
  let o = '', cls = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      const n = src[++i];
      if (n === 's') o += cls ? WS : '[' + WS + ']';
      else if (n === 'S' && !cls) o += '[^' + WS + ']';
      else o += c + n;
      continue;
    }
    if (c === '[') cls = true; else if (c === ']') cls = false;
    o += c;
  }
  return new RegExp(o, 'gu');
}
const GPT2_RX = "'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+";

// ---- registry ----
// kind 'tt' = tiktoken-format file (base64 token + rank); kind 'hf' = reduced tokenizer.json
const ENC = {
  gpt2: { kind: 'tt', file: 'r50k_base.tiktoken', rx: GPT2_RX, special: { '<|endoftext|>': 50256 }, label: 'gpt2 (GPT-2; identical ranks to r50k_base)' },
  r50k_base: { kind: 'tt', file: 'r50k_base.tiktoken', rx: GPT2_RX, special: { '<|endoftext|>': 50256 }, label: 'r50k_base (GPT-3 davinci/curie/babbage/ada)' },
  p50k_base: { kind: 'tt', file: 'p50k_base.tiktoken', rx: GPT2_RX, special: { '<|endoftext|>': 50256 }, label: 'p50k_base (text-davinci-002/003, Codex)' },
  cl100k_base: { kind: 'ext', label: 'cl100k_base (GPT-4, GPT-3.5-turbo)' },
  o200k_base: { kind: 'ext', label: 'o200k_base (GPT-4o, GPT-4.1, o1/o3)' },
  'deepseek-v3': { kind: 'hf', file: 'hf_deepseek-v3.json', label: 'DeepSeek-V3 (deepseek-ai/DeepSeek-V3)' },
  'deepseek-r1': { kind: 'hf', file: 'hf_deepseek-r1.json', label: 'DeepSeek-R1 (deepseek-ai/DeepSeek-R1)' },
  'qwen2.5': { kind: 'hf', file: 'hf_qwen2.5.json', label: 'Qwen2.5 (Qwen/Qwen2.5-7B)' },
  'phi-4': { kind: 'hf', file: 'hf_phi-4.json', label: 'Phi-4 (microsoft/phi-4)' },
  'gpt-neox-20b': { kind: 'hf', file: 'hf_gpt-neox-20b.json', label: 'GPT-NeoX-20B (Pythia, EleutherAI)' },
  starcoder2: { kind: 'hf', file: 'hf_starcoder2.json', label: 'StarCoder2 (bigcode/starcoder2)' },
  'mistral-7b-v0.3': { kind: 'hf', file: 'hf_mistral-7b-v0.3.json', label: 'Mistral-7B-v0.3 (mistralai/Mistral-7B-v0.3)' },
  'claude-legacy': { kind: 'tt', file: 'claude_legacy.tiktoken', rx: GPT2_RX, special: { '<EOT>': 0, '<META>': 1, '<META_START>': 2, '<META_END>': 3, '<SOS>': 4 }, nfkc: true, legacy: true, label: 'claude-legacy (LEGACY Claude 1/2 only, NOT Claude 3/4/5)' },
};
const NAMES = Object.keys(ENC);

const readCache = {};
async function readData(file) {
  const rel = `../../data/${file}`;
  if (typeof window === 'undefined') {
    const fs = await import('node:fs/promises');
    return fs.readFile(new URL(rel, import.meta.url), 'utf8');
  }
  const r = await fetch(new URL(rel, import.meta.url));
  if (!r.ok) throw new Error(`Could not load vocabulary ${file} (HTTP ${r.status})`);
  return r.text();
}
const readOnce = (file) => readCache[file] ||= readData(file);

// ---- tiktoken-format engine (copied algorithm from tokenizer.js) ----
function parseTik(txt, special, rxSrc) {
  const ranks = new Map(), dec = [];
  let i = 0;
  while (i < txt.length) {
    let e = txt.indexOf('\n', i); if (e < 0) e = txt.length;
    const sp = txt.indexOf(' ', i);
    if (sp > 0 && sp < e) { const k = atob(txt.slice(i, sp)); const r = +txt.slice(sp + 1, e); ranks.set(k, r); dec[r] = k; }
    i = e + 1;
  }
  const specialById = new Map(Object.entries(special).map(([k, v]) => [v, k]));
  const specRe = new RegExp(Object.keys(special).map((s) => s.replace(/[|]/g, '\\|')).join('|'), 'g');
  return { ranks, dec, special, specialById, re: jsre(rxSrc), specRe, pieces: new Map() };
}
function bpe(enc, piece) { // piece: latin1 string of bytes
  const direct = enc.ranks.get(piece);
  if (direct !== undefined) return [direct];
  const c = enc.pieces.get(piece);
  if (c) return c;
  const cuts = Array.from({ length: piece.length + 1 }, (_, i) => i);
  const rk = (i) => (i + 2 < cuts.length ? enc.ranks.get(piece.slice(cuts[i], cuts[i + 2])) ?? Infinity : Infinity);
  const r = [];
  for (let i = 0; i < cuts.length - 2; i++) r.push(rk(i));
  for (;;) {
    let m = Infinity, mi = -1;
    for (let i = 0; i < r.length; i++) if (r[i] < m) { m = r[i]; mi = i; }
    if (mi < 0) break;
    cuts.splice(mi + 1, 1); r.splice(mi, 1);
    if (mi < r.length) r[mi] = rk(mi);
    if (mi > 0) r[mi - 1] = rk(mi - 1);
  }
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) out.push(enc.ranks.get(piece.slice(cuts[i], cuts[i + 1])));
  if (enc.pieces.size < 50000) enc.pieces.set(piece, out);
  return out;
}
function ttPlain(enc, text, out) {
  enc.re.lastIndex = 0;
  for (const m of text.matchAll(enc.re)) for (const t of bpe(enc, bin(m[0]))) out.push(t);
}
function ttEncode(enc, text, allowSpecial) {
  text = wf(text);
  if (enc.nfkc) text = text.normalize('NFKC');
  const out = [];
  if (!allowSpecial) { ttPlain(enc, text, out); return out; }
  let last = 0;
  enc.specRe.lastIndex = 0;
  for (const m of text.matchAll(enc.specRe)) {
    ttPlain(enc, text.slice(last, m.index), out);
    out.push(enc.special[m[0]]);
    last = m.index + m[0].length;
  }
  ttPlain(enc, text.slice(last), out);
  return out;
}
const fromBin = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

// ---- Hugging Face BPE engine ----
// GPT-2 byte <-> printable unicode table used by byte-level BPE vocabularies
const B2U = [], U2B = new Map();
{
  const keep = [];
  for (let b = 33; b <= 126; b++) keep.push(b);
  for (let b = 161; b <= 172; b++) keep.push(b);
  for (let b = 174; b <= 255; b++) keep.push(b);
  let n = 0;
  for (let b = 0; b < 256; b++) { const c = String.fromCharCode(keep.includes(b) ? b : 256 + n++); B2U[b] = c; U2B.set(c, b); }
}
const mapBytes = (s) => { const b = u8.encode(s); let o = ''; for (let i = 0; i < b.length; i++) o += B2U[b[i]]; return o; };

async function parseHF(file) {
  let d = JSON.parse(await readOnce(file));
  if (d.base) { const b = JSON.parse(await readOnce(d.base)); d = { ...b, a: d.a, pre: d.pre, norm: d.norm }; } // base = shared vocab+merges
  const vocab = new Map(); d.v.forEach((t, i) => vocab.set(t, i));
  const rank = new Map(); d.m.forEach((m, i) => rank.set(m, i));
  const added = new Map(d.a.map(([id, content, special, l, r]) => [content, { id, special: !!special, l: !!l, r: !!r }]));
  const byId = new Map(d.a.map(([id, content]) => [id, content]));
  const mk = (skipSpecial) => {
    const items = [...added].filter(([, v]) => !(skipSpecial && v.special)).map(([k]) => k).sort((a, b) => b.length - a.length);
    return items.length ? new RegExp(items.map((s) => s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&')).join('|'), 'gu') : null;
  };
  const pre = d.pre.map(([t, re]) => (t === 'split' ? jsre(re) : t === 'gpt2' ? jsre(GPT2_RX) : /\p{N}/gu));
  return { d, vocab, rank, added, byId, addRe: mk(false), addReNoSpecial: mk(true), pre, ms: !!d.ms, nfc: d.norm === 'NFC', cache: new Map() };
}
function splitIso(pieces, re) {
  const r = [];
  for (const p of pieces) {
    let last = 0;
    for (const m of p.matchAll(re)) {
      if (!m[0]) continue;
      if (m.index > last) r.push(p.slice(last, m.index));
      r.push(m[0]); last = m.index + m[0].length;
    }
    if (last < p.length) r.push(p.slice(last));
  }
  return r;
}
function mergeSyms(enc, s) { // s: array of symbols; merge by lowest rank, leftmost on ties (HF behaviour)
  for (;;) {
    let m = Infinity, mi = -1;
    for (let i = 0; i + 1 < s.length; i++) { const r = enc.rank.get(s[i] + ' ' + s[i + 1]); if (r !== undefined && r < m) { m = r; mi = i; } }
    if (mi < 0) return s;
    s.splice(mi, 2, s[mi] + s[mi + 1]);
  }
}
function bpeHF(enc, w) { // w: byte-level mapped string
  let c = enc.cache.get(w);
  if (c) return c;
  c = mergeSyms(enc, Array.from(w)).map((x) => enc.vocab.get(x));
  if (enc.cache.size < 50000) enc.cache.set(w, c);
  return c;
}
const hex2 = (b) => '<0x' + b.toString(16).toUpperCase().padStart(2, '0') + '>';
function hfSeg(enc, seg, atStart, out) {
  if (!seg) return;
  if (enc.ms) { // Metaspace (prepend_scheme=first, split=false) + byte fallback + fused unk
    seg = seg.replace(/ /g, '▁');
    if (atStart && seg[0] !== '▁') seg = '▁' + seg;
    const syms = [];
    for (const ch of seg) {
      if (enc.vocab.has(ch)) { syms.push(ch); continue; }
      const bs = [...u8.encode(ch)].map(hex2);
      if (bs.every((x) => enc.vocab.has(x))) syms.push(...bs);
      else if (syms[syms.length - 1] !== '<unk>') syms.push('<unk>');
    }
    for (const t of mergeSyms(enc, syms)) out.push(enc.vocab.get(t));
    return;
  }
  if (enc.nfc) seg = seg.normalize('NFC');
  let pieces = [seg];
  for (const re of enc.pre) pieces = splitIso(pieces, re);
  for (const p of pieces) if (p) for (const t of bpeHF(enc, mapBytes(p))) out.push(t);
}
function hfEncode(enc, text, allowSpecial) {
  text = wf(text);
  const out = [], re = allowSpecial ? enc.addRe : enc.addReNoSpecial;
  let last = 0;
  if (re) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const t = enc.added.get(m[0]);
      let s = m.index, e = s + m[0].length;
      if (t.l) while (s > last && isWs.test(text[s - 1])) s--;
      if (t.r) while (e < text.length && isWs.test(text[e])) e++;
      if (s < last) continue;
      hfSeg(enc, text.slice(last, s), last === 0, out);
      out.push(t.id);
      last = e;
    }
  }
  hfSeg(enc, text.slice(last), last === 0, out);
  return out;
}
function hfBytes(enc, id) {
  const a = enc.byId.get(id);
  if (a !== undefined) return u8.encode(a);
  const t = enc.d.v[id];
  if (t == null) throw new Error(`Unknown token id ${id}`);
  if (enc.ms) { const m = /^<0x([0-9A-F]{2})>$/.exec(t); return m ? Uint8Array.of(parseInt(m[1], 16)) : u8.encode(t.replace(/▁/g, ' ')); }
  return Uint8Array.from(t, (c) => U2B.get(c));
}

// ---- unified API: loadEnc(name) -> { name, encode(text, allowSpecial) -> ids, tokBytes(id) -> Uint8Array, decodeBytes(ids), size } ----
const cache = {};
function loadEnc(name) {
  if (!ENC[name]) throw new Error('Unknown encoding ' + name);
  return cache[name] ||= (async () => {
    const c = ENC[name];
    let e;
    if (c.kind === 'ext') {
      const t = await loadTik(name);
      e = { encode: (s, a) => encodeTik(t, s, a), tokBytes: (id) => decodeTik(t, [id]), size: t.dec.length + t.specialById.size };
    } else if (c.kind === 'tt') {
      const t = parseTik(await readOnce(c.file), c.special, c.rx);
      t.nfkc = c.nfkc;
      if (t.ranks.size < 50000) throw new Error(`Vocabulary ${c.file} is corrupt (${t.ranks.size} entries)`);
      e = {
        encode: (s, a) => ttEncode(t, s, a),
        tokBytes: (id) => { const s = t.dec[id] ?? (t.specialById.has(id) ? bin(t.specialById.get(id)) : null); if (s == null) throw new Error(`Unknown token id ${id} for ${name}`); return fromBin(s); },
        size: t.dec.length,
      };
    } else {
      const t = await parseHF(c.file);
      e = { strip: t.ms, encode: (s, a) => hfEncode(t, s, a), tokBytes: (id) => hfBytes(t, id), size: Math.max(t.d.v.length, ...[...t.byId.keys()].map((x) => x + 1)) };
    }
    e.decodeBytes = (ids) => {
      const parts = ids.map((i) => e.tokBytes(i));
      const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let k = 0; for (const p of parts) { o.set(p, k); k += p.length; }
      return e.strip && o[0] === 0x20 ? o.subarray(1) : o; // Metaspace decoder strips one leading space
    };
    return Object.assign(e, { name });
  })();
}
const dtext = (b) => new TextDecoder().decode(b);
function show(b) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return [...b].map((x) => (x < 128 && x > 31 ? String.fromCharCode(x) : '\\x' + x.toString(16).padStart(2, '0'))).join(''); }
}
const vis = (s) => s.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
const LIST = NAMES.map((n) => ENC[n].label).join('; ');
const NOTE = `Exact for the listed models; ${LEGACY} Gemini, Llama, Gemma and Claude 3+ tokenizers are not included (gated or unpublished).`;
const encOpt = { id: 'enc', label: 'Encoding', type: 'select', def: 'deepseek-v3', choices: NAMES };
const specOpt = { id: 'special', label: 'Special tokens in the text', type: 'select', def: 'plain', choices: ['plain', 'allow'] };

const T = [];

T.push({
  id: 'multi-tokenizer-counter', cat: CAT, title: 'Multi-Tokenizer Token Counter (GPT, DeepSeek, Qwen, Mistral, Phi, ...)',
  desc: `Count the tokens of one text under every included tokenizer at once, sorted from fewest to most: ${LIST}. Exact vocabularies, runs offline in your browser (vocabularies load on first use, about 20 MB in total). ${NOTE}`,
  labels: ['Text'], sample: 'Tokenizers differ: numbers like 1234567, emoji \u{1F600}, CJK 你好世界 and code such as for (let i = 0; i < n; i++) { f(i); } split differently per model.\n<|endoftext|> is counted as plain text unless special tokens are allowed.',
  opts: [specOpt],
  run: async ([s], o) => {
    if (!s) throw new Error('Enter some text');
    const chars = cps(s), rows = [];
    for (const n of NAMES) {
      try { const e = await loadEnc(n); rows.push({ n, k: e.encode(s, o.special === 'allow').length }); } catch (err) { rows.push({ n, err: err.message }); }
    }
    const ok = rows.filter((r) => !r.err).sort((a, b) => a.k - b.k || a.n.localeCompare(b.n)), bad = rows.filter((r) => r.err);
    const L = [`Text: ${nfmt(chars)} characters, ${nfmt(u8.encode(s).length)} UTF-8 bytes. Special tokens: ${o.special}`, '',
      'encoding'.padEnd(18) + 'tokens'.padStart(10) + 'chars/token'.padStart(13) + '  note'];
    for (const r of ok) L.push(r.n.padEnd(18) + nfmt(r.k).padStart(10) + (chars / Math.max(1, r.k)).toFixed(2).padStart(13) + (ENC[r.n].legacy ? '  LEGACY Claude 1/2 only, not Claude 3/4/5' : ''));
    for (const r of bad) L.push(r.n.padEnd(18) + '  failed: ' + r.err);
    L.push('', ...ok.map((r) => `${r.n}: ${ENC[r.n].label}`), '', NOTE);
    return L.join('\n');
  },
});

T.push({
  id: 'tokenizer-visualizer-hf', cat: CAT, title: 'Tokenizer Visualizer (DeepSeek, Qwen, Mistral, Phi, GPT-2, Claude legacy ...)',
  desc: `Pick an encoding and see the text as coloured tokens plus a table of ids and bytes. Encodings: ${LIST}. ${NOTE}`,
  labels: ['Text'], sample: 'Hello, world! 你好，世界 \u{1F600} 1234567\n    indented_code(x)\n<|endoftext|> <｜end▁of▁sentence｜>',
  opts: [encOpt, specOpt,
    { id: 'ids', label: 'Show token ids in the coloured view', type: 'checkbox', def: false },
    { id: 'rows', label: 'Max table rows', type: 'number', def: 500 }],
  run: async ([s], o) => {
    if (!s) throw new Error('Enter some text');
    const enc = await loadEnc(o.enc), ids = enc.encode(s, o.special === 'allow');
    const chars = cps(s), bytes = u8.encode(s).length;
    const cols = ['#cfe8ff', '#ffe3b3', '#d4f5d0', '#f9d0e6'];
    const spans = ids.map((id, i) => {
      const t = vis(show(enc.tokBytes(id)));
      return `<span style="background:${cols[i % 4]}" title="${id}">${esc(t) || '&nbsp;'}${o.ids ? `<sup>${id}</sup>` : ''}</span>`;
    }).join('');
    const max = Math.max(1, +o.rows || 500);
    const rows = ids.slice(0, max).map((id, i) => {
      const b = enc.tokBytes(id);
      return `<tr><td>${i}</td><td>${id}</td><td><code>${esc(vis(show(b)))}</code></td><td>${[...b].map((x) => x.toString(16).padStart(2, '0')).join(' ')}</td></tr>`;
    }).join('');
    const warn = ENC[o.enc].legacy ? `<p class="w"><b>${esc(LEGACY)}</b></p>` : '';
    const html = `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui,sans-serif;margin:12px;color:#111;background:#fff}
.t span{white-space:pre-wrap;border-radius:3px;padding:1px 0;margin:0 1px 0 0;word-break:break-all}.t{font:14px/1.9 ui-monospace,monospace;white-space:pre-wrap}
sup{font-size:9px;color:#555}table{border-collapse:collapse;margin-top:12px}td,th{border:1px solid #ccc;padding:2px 8px;text-align:left;font-size:12px}
.k b{font-size:18px}.k span{margin-right:20px}.w{background:#fff3cd;padding:6px 10px;border-radius:4px}</style>
${warn}<p class="k"><span><b>${nfmt(ids.length)}</b> tokens</span><span><b>${nfmt(chars)}</b> characters</span><span><b>${nfmt(bytes)}</b> UTF-8 bytes</span><span><b>${(ids.length / Math.max(1, chars)).toFixed(3)}</b> tokens/char</span><span>${esc(o.enc)}</span></p>
<div class="t">${spans}</div>
<table><tr><th>#</th><th>id</th><th>text</th><th>bytes (hex)</th></tr>${rows}</table>${ids.length > max ? `<p>Showing first ${max} of ${ids.length} tokens.</p>` : ''}`;
    return { html };
  },
});

const parseIds = (s) => {
  const t = s.replace(/[\[\]\s,;]+/g, ' ').trim();
  if (!t) throw new Error('Enter token ids, e.g. [9906, 11, 1917]');
  return t.split(' ').map((x) => { if (!/^\d+$/.test(x)) throw new Error('Not a token id: ' + x); return +x; });
};
T.push({
  id: 'token-ids-to-text-multi', cat: CAT, title: 'Token IDs <-> Text (all encodings)',
  desc: `Convert token ids to text and text to token ids with any included encoding: ${LIST}. ${NOTE}`,
  labels: ['Token ids (list) or text'], sample: '[9906, 11, 1917, 0]',
  opts: [{ ...encOpt, def: 'cl100k_base' }, { id: 'dir', label: 'Direction', type: 'select', def: 'ids-to-text', choices: ['ids-to-text', 'text-to-ids'] },
    { id: 'allow', label: 'Text to ids: allow special tokens', type: 'checkbox', def: false }],
  run: async ([s], o) => {
    const enc = await loadEnc(o.enc);
    if (o.dir === 'text-to-ids') {
      if (!s) throw new Error('Enter some text');
      return '[' + enc.encode(s, o.allow).join(', ') + ']';
    }
    const text = dtext(enc.decodeBytes(parseIds(s)));
    const bad = text.includes('�') && !s.includes('�');
    return { text: text + (bad ? '\n\n(Note: these ids end or start inside a multi-byte UTF-8 character, so some bytes could not be shown as text.)' : '') };
  },
});

export default T;
export { loadEnc, NAMES, ENC }; // for tests; the app uses the default export

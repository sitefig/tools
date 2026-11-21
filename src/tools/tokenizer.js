// tokenizer.js: exact OpenAI tiktoken BPE (cl100k_base, o200k_base) in plain JS. Zero dependencies, client-side only.
// The only fetch is the same-origin static vocab file in ../../data/ (loaded lazily on first use, parsed once, cached).
// Ceilings: only OpenAI encodings (Claude/DeepSeek/Gemini vocabularies are not available offline: use llm-token-estimator
// for estimates); BPE merge is O(n^2) per regex piece (fine for natural text; a single multi-100k-char piece with no
// spaces/punctuation is slow: upgrade to a heap-based merge if that matters).
const CAT = 'LLM Tools';
const NOTE = 'Only OpenAI encodings (cl100k_base, o200k_base) are included. Claude, DeepSeek and Gemini tokenizers are NOT included (their vocabularies are not available offline): use the llm-token-estimator tool for approximate counts of those.';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Unicode White_Space (what tiktoken's regex \s means); JS \s differs (includes U+FEFF, lacks U+0085).
const WS = '\\t-\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
// possessive quantifiers in the originals are equivalent to greedy here (the following token can never match what they gave back);
// (?i:...) is expanded to explicit case classes.
const CONTR_C = "'(?:[sS]|[dD]|[mM]|[tT]|[lL][lL]|[vV][eE]|[rR][eE])";
const CONTR_O = "(?:'[sS]|'[tT]|'[rR][eE]|'[vV][eE]|'[mM]|'[lL][lL]|'[dD])?";
const RX = {
  // \s inside a character class is expanded by P as the raw class members (valid inside [...]); outside it needs wrapping
  cl100k_base: [CONTR_C, '[^\\r\\n\\p{L}\\p{N}]?\\p{L}+', '\\p{N}{1,3}', ' ?[^\\s\\p{L}\\p{N}]+[\\r\\n]*', '[WS]*[\\r\\n]', '[WS]+(?![^WS])', '[WS]+'],
  o200k_base: [
    '[^\\r\\n\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]*[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]+' + CONTR_O,
    '[^\\r\\n\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]+[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]*' + CONTR_O,
    '\\p{N}{1,3}', ' ?[^\\s\\p{L}\\p{N}]+[\\r\\n/]*', '[WS]*[\\r\\n]+', '[WS]+(?![^WS])', '[WS]+'],
};
const SPECIAL = {
  cl100k_base: { '<|endoftext|>': 100257, '<|fim_prefix|>': 100258, '<|fim_middle|>': 100259, '<|fim_suffix|>': 100260, '<|endofprompt|>': 100276 },
  o200k_base: { '<|endoftext|>': 199999, '<|endofprompt|>': 200018 },
};
const SIZE = { cl100k_base: 100256, o200k_base: 199998 };
const build = (name) => new RegExp(RX[name].join('|').replace(/\[WS\]/g, '[' + WS + ']').replace(/\[\^WS\]/g, '[^' + WS + ']').replace(/\\s/g, WS), 'gu');

const cache = {};
async function readVocab(name) {
  const rel = `../../data/${name}.tiktoken`;
  if (typeof window === 'undefined') {
    const fs = await import('node:fs/promises');
    return fs.readFile(new URL(rel, import.meta.url), 'utf8');
  }
  const r = await fetch(new URL(rel, import.meta.url));
  if (!r.ok) throw new Error(`Could not load vocabulary ${name} (HTTP ${r.status})`);
  return r.text();
}
// -> { name, ranks: Map<latin1 string of bytes, rank>, dec: string[], special, specialById, re, specRe, pieces: Map }
function loadEnc(name) {
  return cache[name] ||= (async () => {
    const txt = await readVocab(name);
    const ranks = new Map(), dec = [];
    let i = 0;
    while (i < txt.length) {
      let e = txt.indexOf('\n', i); if (e < 0) e = txt.length;
      const sp = txt.indexOf(' ', i);
      if (sp > 0 && sp < e) { const k = atob(txt.slice(i, sp)); const r = +txt.slice(sp + 1, e); ranks.set(k, r); dec[r] = k; }
      i = e + 1;
    }
    if (ranks.size !== SIZE[name]) throw new Error(`Vocabulary ${name} is corrupt (${ranks.size} entries)`);
    const special = SPECIAL[name], specialById = new Map(Object.entries(special).map(([k, v]) => [v, k]));
    const specRe = new RegExp(Object.keys(special).map((s) => s.replace(/[|]/g, '\\|')).join('|'), 'g');
    return { name, ranks, dec, special, specialById, re: build(name), specRe, pieces: new Map() };
  })();
}
const u8 = new TextEncoder();
const wf = (s) => (s.toWellFormed ? s.toWellFormed() : s);
const bin = (s) => { const b = u8.encode(s); let o = ''; for (let i = 0; i < b.length; i += 8192) o += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return o; };

function bpe(enc, piece) { // piece: latin1 string of bytes
  const direct = enc.ranks.get(piece);
  if (direct !== undefined) return [direct];
  const c = enc.pieces.get(piece);
  if (c) return c;
  let cuts = Array.from({ length: piece.length + 1 }, (_, i) => i); // boundaries
  const rk = (i) => (i + 2 < cuts.length ? enc.ranks.get(piece.slice(cuts[i], cuts[i + 2])) ?? Infinity : Infinity);
  const r = [];
  for (let i = 0; i < cuts.length - 2; i++) r.push(rk(i));
  // r[i] = rank of merging parts i and i+1
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
function encodePlain(enc, text, out) {
  enc.re.lastIndex = 0;
  for (const m of text.matchAll(enc.re)) for (const t of bpe(enc, bin(m[0]))) out.push(t);
}
// allowSpecial: false = special-token text is tokenised as ordinary text (tiktoken default behaviour here)
function encode(enc, text, allowSpecial) {
  text = wf(text);
  const out = [];
  if (!allowSpecial) { encodePlain(enc, text, out); return out; }
  let last = 0;
  enc.specRe.lastIndex = 0;
  for (const m of text.matchAll(enc.specRe)) {
    encodePlain(enc, text.slice(last, m.index), out);
    out.push(enc.special[m[0]]);
    last = m.index + m[0].length;
  }
  encodePlain(enc, text.slice(last), out);
  return out;
}
function tokBytes(enc, id) {
  const s = enc.dec[id] ?? (enc.specialById.has(id) ? bin(enc.specialById.get(id)) : null);
  if (s == null) throw new Error(`Unknown token id ${id} for ${enc.name}`);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
function decodeBytes(enc, ids) {
  const parts = ids.map((i) => tokBytes(enc, i));
  const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let k = 0; for (const p of parts) { o.set(p, k); k += p.length; }
  return o;
}
const dtext = (b) => new TextDecoder().decode(b);
// human-readable rendering of one token's bytes (valid UTF-8 as text, otherwise \xNN escapes)
function show(b) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return [...b].map((x) => (x < 128 && x > 31 ? String.fromCharCode(x) : '\\x' + x.toString(16).padStart(2, '0'))).join(''); }
}
const vis = (s) => s.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
const ENCS = ['cl100k_base', 'o200k_base'];
const encOpt = { id: 'enc', label: 'Encoding', type: 'select', def: 'o200k_base', choices: ENCS };
const NAMES = 'cl100k_base (GPT-4, GPT-3.5-turbo, embeddings v2/v3), o200k_base (GPT-4o, GPT-4.1, o1/o3 families)';
const nfmt = (n) => n.toLocaleString('en-US');
const cps = (s) => { let n = 0; for (const _ of s) n++; return n; };

const T = [];

T.push({
  id: 'tiktoken-visualizer', cat: CAT, title: 'Tiktoken Tokenizer Visualizer (cl100k / o200k)',
  desc: `Exact OpenAI BPE tokenization (${NAMES}) shown as coloured tokens plus a table of ids and bytes. Runs offline in your browser. ${NOTE}`,
  labels: ['Text'], sample: 'tiktoken is great! Numbers like 1234567 split into 3-digit groups, and emoji \u{1F600} or CJK 你好 take several tokens.\n<|endoftext|> is plain text unless you allow special tokens.',
  opts: [encOpt, { id: 'special', label: 'Special tokens (<|endoftext|> ...)', type: 'select', def: 'plain', choices: ['plain', 'allow'] },
    { id: 'ids', label: 'Show token ids in the coloured view', type: 'checkbox', def: false },
    { id: 'rows', label: 'Max table rows', type: 'number', def: 500 }],
  run: async ([s], o) => {
    if (!s) throw new Error('Enter some text');
    const enc = await loadEnc(o.enc), ids = encode(enc, s, o.special === 'allow');
    const chars = cps(s), bytes = u8.encode(s).length;
    const cols = ['#cfe8ff', '#ffe3b3', '#d4f5d0', '#f9d0e6'];
    const spans = ids.map((id, i) => {
      const t = vis(show(tokBytes(enc, id)));
      return `<span style="background:${cols[i % 4]}" title="${id}">${esc(t) || '&nbsp;'}${o.ids ? `<sup>${id}</sup>` : ''}</span>`;
    }).join('');
    const max = Math.max(1, +o.rows || 500);
    const rows = ids.slice(0, max).map((id, i) => {
      const b = tokBytes(enc, id);
      return `<tr><td>${i}</td><td>${id}</td><td><code>${esc(vis(show(b)))}</code></td><td>${[...b].map((x) => x.toString(16).padStart(2, '0')).join(' ')}</td></tr>`;
    }).join('');
    const html = `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui,sans-serif;margin:12px;color:#111;background:#fff}
.t span{white-space:pre-wrap;border-radius:3px;padding:1px 0;margin:0 1px 0 0;word-break:break-all}.t{font:14px/1.9 ui-monospace,monospace;white-space:pre-wrap}
sup{font-size:9px;color:#555}table{border-collapse:collapse;margin-top:12px}td,th{border:1px solid #ccc;padding:2px 8px;text-align:left;font-size:12px}
.k b{font-size:18px}.k span{margin-right:20px}</style>
<p class="k"><span><b>${nfmt(ids.length)}</b> tokens</span><span><b>${nfmt(chars)}</b> characters</span><span><b>${nfmt(bytes)}</b> UTF-8 bytes</span><span><b>${(ids.length / Math.max(1, chars)).toFixed(3)}</b> tokens/char</span><span>${esc(o.enc)}</span></p>
<div class="t">${spans}</div>
<table><tr><th>#</th><th>id</th><th>text</th><th>bytes (hex)</th></tr>${rows}</table>${ids.length > max ? `<p>Showing first ${max} of ${ids.length} tokens.</p>` : ''}`;
    return { html };
  },
});

T.push({
  id: 'gpt-token-counter', cat: CAT, title: 'GPT Token Counter (cl100k + o200k, chat overhead)',
  desc: `Exact token counts for text under cl100k_base and o200k_base side by side, plus an approximate chat-message overhead calculator (OpenAI cookbook rule: 3 tokens per message, +1 per name, +3 reply priming; use o200k_base for the GPT-4o family). ${NOTE}`,
  inputs: 2, labels: ['Text', 'Chat messages (optional JSON array of {role, name?, content})'],
  sample: 'Count the tokens in this sentence: hello world.',
  sample2: '[{"role":"system","content":"You are a helpful assistant."},{"role":"user","name":"alice","content":"hello world"}]',
  opts: [],
  run: async ([s, m]) => {
    if (!s && !m.trim()) throw new Error('Enter text or chat messages');
    const encs = await Promise.all(ENCS.map(loadEnc));
    const out = [];
    if (s) {
      out.push(`Text: ${nfmt(cps(s))} characters, ${nfmt(u8.encode(s).length)} bytes`);
      for (const e of encs) out.push(`  ${e.name.padEnd(12)} ${nfmt(encode(e, s, false).length).padStart(10)} tokens`);
    }
    if (m.trim()) {
      let msgs; try { msgs = JSON.parse(m); } catch (e) { throw new Error('Messages: invalid JSON (' + e.message + ')'); }
      if (!Array.isArray(msgs)) throw new Error('Messages must be a JSON array');
      out.push('', `Chat messages: ${msgs.length} (approximate overhead: tokens_per_message=3, tokens_per_name=1, +3 reply priming)`);
      for (const e of encs) {
        let n = 3, content = 0;
        for (const msg of msgs) {
          if (msg == null || typeof msg !== 'object') throw new Error('Each message must be an object');
          n += 3;
          for (const [k, v] of Object.entries(msg)) {
            const c = encode(e, typeof v === 'string' ? v : JSON.stringify(v), false).length;
            n += c; if (k === 'content') content += c;
            if (k === 'name') n += 1;
          }
        }
        out.push(`  ${e.name.padEnd(12)} ${nfmt(n).padStart(10)} tokens total (content only: ${nfmt(content)}, overhead incl. role/name: ${nfmt(n - content)})`);
      }
      out.push('Real API usage can differ slightly by model version (tool calls, images, and newer models add their own overhead).');
    }
    out.push('', NOTE);
    return out.join('\n');
  },
});

const parseIds = (s) => {
  const t = s.replace(/[\[\]\s,;]+/g, ' ').trim();
  if (!t) throw new Error('Enter token ids, e.g. [83, 1609, 5963]');
  return t.split(' ').map((x) => { if (!/^\d+$/.test(x)) throw new Error('Not a token id: ' + x); return +x; });
};
T.push({
  id: 'token-id-decoder', cat: CAT, title: 'Token ID Decoder / Encoder (tiktoken)',
  desc: `Convert token ids to text and text to token ids with exact cl100k_base / o200k_base vocabularies. ${NOTE}`,
  labels: ['Token ids (list) or text'], sample: '[83, 1609, 5963, 374, 2294, 0]',
  opts: [{ ...encOpt, def: 'cl100k_base' }, { id: 'dir', label: 'Direction', type: 'select', def: 'ids-to-text', choices: ['ids-to-text', 'text-to-ids'] },
    { id: 'special', label: 'Text to ids: allow special tokens', type: 'checkbox', def: false }],
  run: async ([s], o) => {
    const enc = await loadEnc(o.enc);
    if (o.dir === 'text-to-ids') {
      if (!s) throw new Error('Enter some text');
      return '[' + encode(enc, s, o.special).join(', ') + ']';
    }
    const ids = parseIds(s), b = decodeBytes(enc, ids);
    const text = dtext(b);
    const bad = text.includes('�') && !s.includes('�');
    return { text: text + (bad ? '\n\n(Note: these ids end or start inside a multi-byte UTF-8 character, so some bytes could not be shown as text.)' : '') };
  },
});

T.push({
  id: 'tokenizer-cost-estimator', cat: CAT, title: 'Token Cost Estimator (your own prices)',
  desc: `Exact token count (cl100k_base / o200k_base) multiplied by prices YOU enter per 1M tokens. No prices are built in: copy the current figures from your provider's pricing page. ${NOTE}`,
  labels: ['Prompt text'], sample: 'Summarise the following support ticket in two sentences and suggest the next action.',
  opts: [encOpt,
    { id: 'pin', label: 'Input price per 1M tokens (your value)', type: 'number', def: 0 },
    { id: 'pout', label: 'Output price per 1M tokens (your value)', type: 'number', def: 0 },
    { id: 'outTok', label: 'Expected output tokens per call', type: 'number', def: 0 },
    { id: 'calls', label: 'Number of calls', type: 'number', def: 1 },
    { id: 'cur', label: 'Currency label', type: 'text', def: 'USD' }],
  run: async ([s], o) => {
    if (!s) throw new Error('Enter some text');
    const enc = await loadEnc(o.enc), n = encode(enc, s, false).length;
    const calls = Math.max(0, +o.calls || 0), pin = +o.pin || 0, pout = +o.pout || 0, ot = Math.max(0, +o.outTok || 0), cur = o.cur || '';
    const money = (v) => v.toFixed(v && v < 0.01 ? 6 : 4) + ' ' + cur;
    const ci = (n * pin) / 1e6, co = (ot * pout) / 1e6;
    const L = [`Encoding: ${o.enc}`, `Input tokens per call: ${nfmt(n)}`, `Expected output tokens per call: ${nfmt(ot)}`, `Calls: ${nfmt(calls)}`, ''];
    if (!pin && !pout) L.push('No prices entered. Type your provider\'s current price per 1M input/output tokens into the options above; nothing is assumed.');
    else L.push(`Per call: input ${money(ci)} + output ${money(co)} = ${money(ci + co)}`, `All ${nfmt(calls)} calls: ${money((ci + co) * calls)}`, `Total tokens: ${nfmt((n + ot) * calls)}`);
    L.push('', 'Prices are your inputs, not facts verified by this tool. Cached-input discounts, batch pricing and per-model tokenizer differences are not modelled.', NOTE);
    return L.join('\n');
  },
});

// token boundaries that are also UTF-8 character boundaries
function plan(enc, text, allowSpecial) {
  const ids = encode(enc, text, allowSpecial), off = [0];
  const parts = ids.map((i) => tokBytes(enc, i));
  for (const p of parts) off.push(off[off.length - 1] + p.length);
  const all = new Uint8Array(off[off.length - 1]); let k = 0;
  for (const p of parts) { all.set(p, k); k += p.length; }
  const ok = (i) => i === ids.length || (all[off[i]] & 0xc0) !== 0x80;
  return { ids, off, all, ok };
}
T.push({
  id: 'token-truncate', cat: CAT, title: 'Truncate / Chunk Text by Tokens (tiktoken)',
  desc: `Cut text to at most N tokens, or split it into chunks of at most N tokens with overlap, always on a token boundary that does not split a UTF-8 character. Exact cl100k_base / o200k_base. ${NOTE}`,
  labels: ['Text'], sample: 'Tokenizers split text into pieces. This sample paragraph is long enough to be cut into several chunks. 你好世界, café \u{1F600} and plain words follow so that multi-byte characters are never split in half.',
  opts: [encOpt, { id: 'mode', label: 'Mode', type: 'select', def: 'chunks', choices: ['truncate', 'chunks'] },
    { id: 'n', label: 'Max tokens (N)', type: 'number', def: 20 },
    { id: 'overlap', label: 'Overlap tokens (chunks mode)', type: 'number', def: 4 }],
  run: async ([s], o) => {
    if (!s) throw new Error('Enter some text');
    const N = Math.floor(+o.n), ov = Math.max(0, Math.floor(+o.overlap || 0));
    if (!(N >= 1)) throw new Error('Max tokens must be at least 1');
    if (o.mode === 'chunks' && ov >= N) throw new Error('Overlap must be smaller than max tokens');
    const enc = await loadEnc(o.enc), { ids, off, all, ok } = plan(enc, s, false);
    const cut = (a, b) => { while (b > a && !ok(b)) b--; return b > a ? b : a; }; // largest valid boundary <= b
    const text = (a, b) => dtext(all.subarray(off[a], off[b]));
    if (o.mode === 'truncate') {
      const e = ids.length <= N ? ids.length : cut(0, N);
      return { text: text(0, e) + `\n\n--- ${e} of ${ids.length} tokens kept${e < Math.min(N, ids.length) ? ' (backed off to keep a UTF-8 character whole)' : ''} ---` };
    }
    const out = []; let a = 0;
    while (a < ids.length) {
      let e = ids.length <= a + N ? ids.length : cut(a, a + N);
      if (e <= a) e = Math.min(ids.length, a + N); // a single character wider than N tokens: cannot avoid splitting
      out.push(`--- chunk ${out.length + 1}: tokens ${a}-${e} (${e - a}) ---\n${text(a, e)}`);
      if (e >= ids.length) break;
      let nx = cut(a, e - ov); if (nx <= a) nx = e; // keep progress
      a = nx;
    }
    return { text: out.join('\n\n') + `\n\n--- ${out.length} chunks from ${ids.length} tokens ---` };
  },
});

export default T;
export { loadEnc, encode, decodeBytes }; // for tests only; the app uses the default export

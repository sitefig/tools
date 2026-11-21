// gap5.js: tools built while challenging every "skipped" row of peerreview/gap-audit.md and peerreview/feature-audit.md
// (decisions and the rows that stay skipped: peerreview/skip-review.md). Zero dependencies, client-side only, no network calls from tools.
//
// Four families live here:
//  1. pasted-input analysers (WHOIS, dig, nmap, ClientHello, CDX, GSC/CrUX/backlink exports, HTML pages, LLM logprobs ...): the page cannot
//     fetch the real service, but you can paste what the real service returned;
//  2. offline reference data and checksum validators (HS codes, IP country ranges from the RIR delegation files, tax-id check digits);
//  3. browser-API-only viewers (network, battery, permissions, media devices, clipboard);
//  4. real neural models run by hand-written JS engines in src/gap5lib/ (fastText language ID, DistilBERT fill-mask, DistilBERT SQuAD
//     question answering), lazily fetched from same-origin data/ files (hashes and licences: data/SOURCES-gap5.md).
// Ceilings are stated in the tool output and on the tool page. Heuristic checks say so in their own output.

const need = (t, what = 'input') => { if (t == null || !String(t).trim()) throw new Error('Paste ' + what + ' first.'); return String(t); };
const lines = (t) => String(t).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round = (n, d = 2) => { const p = 10 ** d; return Math.round((n + Number.EPSILON) * p) / p; };
const pct = (a, b) => (b ? round((100 * a) / b, 1) + '%' : 'n/a');
const table = (head, rows) => {
  const all = [head, ...rows].map((r) => r.map((c) => String(c ?? '')));
  const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  return all.map((r) => r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd()).join('\n');
};
const sec = (title, body) => `${title}\n${'-'.repeat(title.length)}\n${body}`;
function parseCsv(text, delim) {
  const d = delim || (text.split('\n', 1)[0].includes('\t') ? '\t' : text.split('\n', 1)[0].split(';').length > text.split('\n', 1)[0].split(',').length ? ';' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"' && cur === '') q = true;
    else if (c === d) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}
const num = (s) => { const n = Number(String(s ?? '').replace(/[%,\s]/g, '')); return Number.isFinite(n) ? n : NaN; };
const colIdx = (head, ...aliases) => { const h = head.map((x) => x.trim().toLowerCase()); for (const a of aliases) { const i = h.findIndex((x) => x === a); if (i >= 0) return i; } for (const a of aliases) { const i = h.findIndex((x) => x.includes(a)); if (i >= 0) return i; } return -1; };
const hexToBytes = (s) => {
  const h = String(s).replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
  if (!h || h.length % 2) throw new Error('Hex input needs an even number of hex digits.');
  const b = new Uint8Array(h.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b;
};
const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
function md5(bytes) { // RFC 1321
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const n = bytes.length, total = (((n + 8) >> 6) + 1) << 6, m = new Uint8Array(total); m.set(bytes); m[n] = 0x80;
  new DataView(m.buffer).setUint32(total - 8, (n * 8) >>> 0, true); new DataView(m.buffer).setUint32(total - 4, Math.floor(n / 2 ** 29), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476; const dv = new DataView(m.buffer);
  for (let o = 0; o < total; o += 64) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + dv.getUint32(o + g * 4, true)) >>> 0; A = D; D = C; C = B;
      const s = S[(i >> 4) * 4 + (i & 3)]; B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16), ov = new DataView(out.buffer); [a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true)); return out;
}
// ---- light HTML helpers (regex based; good enough for audits of pasted source, not a full HTML parser)
const stripScripts = (h) => h.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ');
const decodeEnt = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
  const l = e.toLowerCase();
  if (l[0] === '#') { const c = l[1] === 'x' ? parseInt(l.slice(2), 16) : +l.slice(1); try { return String.fromCodePoint(c); } catch { return m; } }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[l];
});
const textOfHtml = (h) => decodeEnt(stripScripts(h).replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t\f\v\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const attrOf = (tag, name) => { const m = new RegExp('[\\s"\'/]' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag); return m ? decodeEnt(m[2] ?? m[3] ?? m[4] ?? '') : null; };
const tagsOf = (h, name) => [...stripScripts(h).matchAll(new RegExp('<' + name + '\\b[^>]*>', 'gi'))].map((m) => m[0]);
const blocksOf = (h, name) => [...h.matchAll(new RegExp('<' + name + '\\b([^>]*)>([\\s\\S]*?)</' + name + '>', 'gi'))].map((m) => ({ tag: '<' + name + m[1] + '>', inner: m[2], text: textOfHtml(m[2]) }));
const metaOf = (h, key) => { for (const t of tagsOf(h, 'meta')) { const k = (attrOf(t, 'name') || attrOf(t, 'property') || attrOf(t, 'http-equiv') || '').toLowerCase(); if (k === key.toLowerCase()) return attrOf(t, 'content'); } return null; };
const titleOf = (h) => { const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(stripScripts(h)); return m ? decodeEnt(m[1]).replace(/\s+/g, ' ').trim() : null; };
const jsonLd = (h) => { const out = []; for (const m of h.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) { try { out.push(JSON.parse(m[1].trim())); } catch { /* ignore broken block */ } } return out; };
const flatLd = (nodes) => { const out = []; const walk = (n) => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') { out.push(n); if (n['@graph']) walk(n['@graph']); } }; walk(nodes); return out; };
const hasType = (n, t) => [].concat(n['@type'] || []).some((x) => String(x).toLowerCase() === t.toLowerCase());
const wordsOf = (t) => (String(t).toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) || []);
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k.includes('-') || !(k in e)) e.setAttribute(k, v); else e[k] = v; } e.append(...kids); return e; }; // hyphenated keys (aria-*, data-*) must be attributes, not expando properties
const SEOT = 'SEO – Technical', SEOX = 'SEO – Extras', SEOC = 'SEO – Content', NET = 'Network & HTTP', DEVX = 'Dev Extras', BRO = 'Privacy – Browser', DEV = 'Device & Sensors';
const T = [];

// ====================================================================== neural models (engines in src/gap5lib/)
let uid = 0;
function field(root, label, props) { // labelled textarea/input
  const id = 'g5-' + (++uid), lab = el('label', { htmlFor: id }, label), inp = el(props.tag || 'textarea', { id, ...props.attrs });
  root.append(lab, inp); return inp;
}
function runner(root, btnLabel, work) { // button + status + output with stale-run protection
  const btn = el('button', { type: 'button' }, btnLabel), status = el('p', { className: 'status', role: 'status' }), out = el('div', { className: 'g5-out' });
  root.append(el('div', { className: 'row' }, btn), status, out);
  let seq = 0;
  const run = async () => {
    const mine = ++seq; out.replaceChildren(); status.textContent = ''; btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    let lastMsg = 0; const say = (m, force) => { const now = Date.now(); if (force || now - lastMsg > 1200) { if (mine === seq) status.textContent = m; lastMsg = now; } };
    try { await work({ out, say, alive: () => mine === seq }); }
    catch (e) { if (mine === seq) { status.textContent = ''; out.replaceChildren(el('p', { role: 'alert', className: 'err' }, String(e?.message || e))); } }
    finally { if (mine === seq) { btn.disabled = false; btn.removeAttribute('aria-busy'); } }
  };
  btn.addEventListener('click', run);
  return { run, btn, out, status };
}
const note = (t) => el('p', { className: 'desc' }, t);
function simpleTable(head, rows, caption) {
  const t = el('table'); if (caption) t.append(el('caption', {}, caption));
  t.append(el('thead', {}, el('tr', {}, ...head.map((h) => el('th', { scope: 'col' }, h)))), el('tbody', {}, ...rows.map((r) => el('tr', {}, ...r.map((c) => el('td', {}, c))))));
  return t;
}

T.push({
  id: 'ai-fill-mask', cat: 'AI & LLM', title: 'AI Fill-Mask: Predict the Missing Word (DistilBERT)',
  desc: 'Put [MASK] in an English sentence and a DistilBERT language model, running in your browser, ranks the most likely words. No upload, no API.',
  custom: true, dom: true,
  render(root) {
    const ta = field(root, 'English sentence with [MASK] where a word is missing', { attrs: { rows: 4, value: 'The capital of France is [MASK].' } });
    const r = runner(root, 'Predict', async ({ out, say, alive }) => {
      const D = await import('../gap5lib/distilbert.js');
      say(D.MODELS.mlm && 'Loading the model (69 MB, downloaded once)...', true);
      const { model, tok } = await D.getModel('mlm', (f) => say(`Downloading the model: ${Math.round(f * 100)}%`));
      const res = await D.fillMask(model, tok, ta.value, 8, (f) => say(`Running the model: layer ${Math.round(f * 6)} of 6`));
      if (!alive()) return;
      say(`${res.length} mask${res.length > 1 ? 's' : ''} filled`, true);
      res.forEach((m, i) => {
        out.append(simpleTable(['Rank', 'Word piece', 'Probability'], m.top.map((c, j) => [String(j + 1), c.token, (c.prob * 100).toFixed(1) + '%']), res.length > 1 ? `Mask ${i + 1}` : 'Most likely words for [MASK]'));
        if (res.length === 1) {
          const row = el('div', { className: 'row' });
          m.top.slice(0, 3).forEach((c) => row.append(el('button', { type: 'button', onclick: () => { ta.value = ta.value.replace(/\[MASK\]/i, c.token.replace(/^##/, '')); r.run(); } }, `Use "${c.token}"`)));
          out.append(row);
        }
      });
      out.append(note('Word pieces beginning with ## continue the previous word. Probabilities are the model\'s own softmax over its 30,522-piece vocabulary; they say what is common in the training text (English Wikipedia and books), not what is true.'));
    });
    root.append(note('Model: distilbert-base-uncased (Apache-2.0), 6 layers, 66M parameters, int8 weights. The first run downloads 69 MB from this site; after that everything runs offline in this tab. English only, up to 256 word pieces, up to 5 masks. Lowercase output (the model is uncased).'));
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); r.run(); } });
  },
});

T.push({
  id: 'ai-question-answering', cat: 'AI & LLM', title: 'AI Question Answering from a Passage (DistilBERT SQuAD)',
  desc: 'Paste a passage and ask a question: a DistilBERT model fine-tuned on SQuAD finds the answer span in the text, entirely in your browser.',
  custom: true, dom: true,
  render(root) {
    const q = field(root, 'Question', { tag: 'input', attrs: { type: 'text', value: 'Who designed the Eiffel Tower?', size: 60 } });
    const c = field(root, 'Passage that contains the answer', { attrs: { rows: 8, value: 'The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, France. It is named after the engineer Gustave Eiffel, whose company designed and built the tower from 1887 to 1889. It was initially criticised by some of France\'s leading artists and intellectuals for its design, but it has become a global cultural icon of France.' } });
    const r = runner(root, 'Find the answer', async ({ out, say, alive }) => {
      if (!q.value.trim() || !c.value.trim()) throw new Error('Enter a question and a passage.');
      const D = await import('../gap5lib/distilbert.js');
      say('Loading the model (67 MB, downloaded once)...', true);
      const { model, tok } = await D.getModel('qa', (f) => say(`Downloading the model: ${Math.round(f * 100)}%`));
      const a = await D.answer(model, tok, q.value, c.value, (f) => say(`Running the model: ${Math.round(f * 100)}%`));
      if (!alive()) return;
      say(a.answer ? `Answer: ${a.answer}` : 'No answer found', true);
      if (!a.answer) { out.append(el('p', {}, 'The model found no answer span.')); return; }
      out.append(el('p', { style: 'font-size:1.25rem;font-weight:700;margin:.5rem 0' }, a.answer),
        el('p', {}, `Confidence ${(a.score * 100).toFixed(1)}%.${a.score < 0.2 ? ' Low confidence: the passage may not contain the answer. This model always returns some span, even when the passage has none.' : ''}${a.windows > 1 ? ` The passage was read in ${a.windows} overlapping windows.` : ''}`),
        el('p', {}, 'In the passage: ', c.value.slice(Math.max(0, a.start - 80), a.start).replace(/^\S*\s/, '...'), el('mark', {}, c.value.slice(a.start, a.end)), c.value.slice(a.end, a.end + 80).replace(/\s\S*$/, '...')));
    });
    root.append(note('Model: distilbert-base-cased-distilled-squad (Apache-2.0, trained on SQuAD v1.1), int8 weights. The first run downloads 67 MB from this site; then it runs offline in this tab and your text is never uploaded. Extractive only: it copies a span from your passage, it does not write answers, and it cannot say "not in the text". English.'));
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); r.run(); } });
  },
});

T.push({
  id: 'ai-language-identifier', cat: 'AI & LLM', title: 'AI Language Identifier (fastText, 176 Languages)',
  desc: 'Identify the language of any text with Facebook\'s fastText lid.176 model (917 KB), run by a JavaScript port in your browser. Shows probabilities and can check every line.',
  custom: true, dom: true,
  render(root) {
    const ta = field(root, 'Text to identify', { attrs: { rows: 6, value: 'Bonjour tout le monde, comment allez-vous aujourd\'hui ?\nDit is een zin in het Nederlands.\nThe quick brown fox jumps over the lazy dog.' } });
    const cb = el('input', { type: 'checkbox', id: 'g5-lines', checked: true }); root.append(el('div', { className: 'row' }, cb, el('label', { htmlFor: 'g5-lines' }, 'Identify each line separately')));
    runner(root, 'Identify', async ({ out, say, alive }) => {
      const text = ta.value; if (!text.trim()) throw new Error('Enter some text first.');
      const L = await import('../gap5lib/langid.js'); say('Loading the language model...', true);
      const M = await L.getModel(); if (!alive()) return;
      const units = cb.checked ? text.split(/\r?\n/).filter((x) => x.trim()) : [text];
      const rows = units.map((u) => { const p = L.predict(M, u, 3); return [u.length > 60 ? u.slice(0, 57) + '...' : u, ...(p.length ? [`${L.langName(p[0].lang)} (${p[0].lang})`, (p[0].prob * 100).toFixed(1) + '%', p.slice(1).map((x) => `${x.lang} ${(x.prob * 100).toFixed(1)}%`).join(', ')] : ['unknown', '', ''])]; });
      say(`${rows.length} text${rows.length > 1 ? 's' : ''} identified`, true);
      out.append(simpleTable(['Text', 'Language', 'Probability', 'Next best'], rows));
      if (rows.some((r) => parseFloat(r[2]) < 50)) out.append(el('p', { role: 'note' }, 'Some results are below 50%: very short, mixed or romanised text is unreliable.'));
    });
    root.append(note('Model: fastText lid.176.ftz (CC BY-SA 3.0, Facebook AI Research), 917 KB, downloaded once from this site; your text is never uploaded. Covers 176 languages. Short text, mixed languages, transliterated text and close relatives (Serbo-Croatian variants, Norwegian) are the weak spots.'));
  },
});

T.push({
  id: 'ai-image-classifier', cat: 'AI & LLM', title: 'AI Image Classifier (MobileNetV2, 1000 ImageNet Classes)',
  desc: 'Drop in a photo and a small neural network (MobileNetV2) running in your browser names what it shows from 1000 everyday object classes, with probabilities. The image never leaves your device.',
  inputs: 0, dom: true, file: { accept: 'image/*', multiple: false },
  run: async (_, o, files) => {
    const f = files?.[0]; if (!f) throw new Error('Choose an image first.');
    const C = await import('../gap5lib/imageclass.js'), { H, labels } = await C.getModel();
    const bmp = await createImageBitmap(f), t = C.preprocess(H, bmp); bmp.close?.();
    const lg = await C.forward(H, t), top = C.topK(lg, 5);
    return `${top.map((p, i) => `${i + 1}. ${labels[p.index]}  ${(p.prob * 100).toFixed(1)}%`).join('\n')}\n\nThis network knows 1000 ImageNet classes (dog breeds, tools, vehicles, foods, animals, everyday objects). It has no class for "other", for people or for text, so it always names the closest of its 1000 classes, even for a picture of something else: low percentages mean it is guessing. The centre of the image is analysed. Model: timm mobilenetv2_100.ra_in1k (Apache-2.0, trained on ImageNet-1k), 3.5 million parameters, 7 MB, downloaded once from this site and run in your browser.`;
  },
});

async function toPcm16k(blob) { // any audio/video file the browser can decode -> mono Float32Array at 16 kHz
  const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC(); let buf;
  try { buf = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { ctx.close?.(); }
  const n = Math.max(1, Math.ceil(buf.duration * 16000)), off = new OfflineAudioContext(1, n, 16000), src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start();
  const r = await off.startRendering(); return r.getChannelData(0).slice(); // OfflineAudioContext downmixes channels to mono by averaging
}
T.push({
  id: 'ai-speech-to-text', cat: 'AI & LLM', title: 'AI Speech to Text (Whisper tiny, English, Offline in Your Browser)',
  desc: 'Transcribe an audio file or your microphone to English text with OpenAI Whisper tiny running in your browser. 43 MB model downloaded once; your audio is never uploaded. Slow but private.',
  custom: true, dom: true,
  render(root) {
    const file = field(root, 'Audio or video file (mp3, wav, m4a, ogg, mp4, webm...)', { tag: 'input', attrs: { type: 'file', accept: 'audio/*,video/*' } });
    const rec = el('button', { type: 'button' }, 'Record from the microphone'), stop = el('button', { type: 'button', disabled: true }, 'Stop');
    root.append(el('div', { className: 'row' }, rec));
    const r = runner(root, 'Transcribe the file', async ({ out, say, alive }) => {
      if (!pcmSource) throw new Error('Choose a file or record something first.');
      stopFlag = false; stop.disabled = false;
      const W = await import('../gap5lib/whisper.js');
      say('Loading the model (43 MB, downloaded once)...', true);
      const { M, vocab } = await W.getModel((f) => say(`Downloading the model: ${Math.round(f * 100)}%`)); if (!alive()) return;
      say('Decoding the audio...', true); const pcm = await pcmSource(); if (!alive()) return;
      const mins = pcm.length / 16000 / 60; if (mins > 15) throw new Error(`The audio is ${mins.toFixed(0)} minutes long. This tool is meant for clips up to about 10 minutes (each 30 seconds takes ~20 s to process).`);
      const area = el('textarea', { rows: 10, readOnly: true, 'aria-label': 'Transcript' }); out.append(area);
      const t0 = Date.now();
      const text = await W.transcribe(M, vocab, pcm, (msg, partial) => { if (msg) say(msg, true); if (partial != null) area.value = partial; }, () => stopFlag || !alive());
      stop.disabled = true; if (!alive()) return; area.value = text;
      say(`Done in ${Math.round((Date.now() - t0) / 1000)} s${stopFlag ? ' (stopped early)' : ''}: ${text.split(/\s+/).filter(Boolean).length} words`, true);
      out.append(el('div', { className: 'row' }, el('button', { type: 'button', onclick: () => navigator.clipboard?.writeText(text) }, 'Copy'), el('button', { type: 'button', onclick: () => { const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: 'transcript.txt' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); } }, 'Download .txt')));
    });
    r.btn.after(stop);
    let pcmSource = null, stopFlag = false, mr = null, chunks = [];
    stop.addEventListener('click', () => { stopFlag = true; if (mr && mr.state === 'recording') mr.stop(); });
    file.addEventListener('change', () => { const f = file.files[0]; pcmSource = f ? () => toPcm16k(f) : null; });
    rec.addEventListener('click', async () => {
      if (mr && mr.state === 'recording') { mr.stop(); return; }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true }); chunks = []; mr = new MediaRecorder(s); rec.textContent = 'Stop recording';
        mr.ondataavailable = (e) => chunks.push(e.data);
        mr.onstop = () => { s.getTracks().forEach((t) => t.stop()); rec.textContent = 'Record from the microphone'; const blob = new Blob(chunks, { type: mr.mimeType }); pcmSource = () => toPcm16k(blob); r.run(); };
        mr.start();
      } catch (e) { r.out.replaceChildren(el('p', { role: 'alert', className: 'err' }, 'Microphone not available: ' + (e.message || e))); }
    });
    root.append(note('Model: OpenAI Whisper tiny.en (English only, 39M parameters, int8). The first run downloads 43 MB from this site; then everything runs offline in this tab. Expect about 20 seconds of processing per 30 seconds of audio on a laptop, so this suits short clips and notes, not long recordings. Whisper can invent words on silence, music or noise, and mishears names and jargon: always proofread.'));
  },
});

T.push({
  id: 'ai-offline-chat', cat: 'AI & LLM', title: 'Offline AI Chat (SmolLM2 135M, Private, Runs in Your Browser)',
  desc: 'Chat with a small open language model (SmolLM2-135M-Instruct) that runs entirely in your browser tab. 76 MB download once, no account, no server, no logging. A tiny model: good for demos and simple questions, not for facts.',
  custom: true, dom: true,
  render(root) {
    const log = el('div', { role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation', style: 'display:grid;gap:.75rem;margin:.75rem 0;max-height:28rem;overflow:auto', tabIndex: 0 });
    const input = field(root, 'Your message', { attrs: { rows: 3, placeholder: 'Ask something short, e.g. "Explain what DNS is in two sentences."' } });
    const status = el('p', { className: 'status', role: 'status' }), send = el('button', { type: 'button' }, 'Send'), stop = el('button', { type: 'button', disabled: true }, 'Stop'), reset = el('button', { type: 'button' }, 'New chat');
    const temp = el('input', { type: 'number', min: 0, max: 1.5, step: 0.1, value: 0.3, id: 'g5-temp' }), maxn = el('input', { type: 'number', min: 16, max: 512, step: 16, value: 160, id: 'g5-maxn' });
    root.append(el('div', { className: 'row' }, send, stop, reset), el('div', { className: 'row' }, el('label', { htmlFor: 'g5-temp' }, 'Temperature (0 = always the same answer)'), temp, el('label', { htmlFor: 'g5-maxn' }, 'Max reply tokens'), maxn), status, log,
      note('Model: SmolLM2-135M-Instruct (Hugging Face, Apache-2.0), 4-bit weights, run by a JavaScript engine in this tab. The first message downloads 76 MB from this site; after that nothing leaves your device, and closing the tab erases the chat. It has 135 million parameters (a thousand times fewer than the big assistants) and 4-bit compression makes it weaker still: expect wrong facts, repeated phrases and weak arithmetic or non-English text. Use it to see what a local model can do, never for advice. About 3 words per second on a typical laptop.'));
    let ctx = null, busy = false, stopFlag = false, firstTurn = true;
    const bubble = (who, text) => { const b = el('div', { style: 'padding:.5rem .75rem;border-radius:.5rem;border:1px solid var(--border, currentColor);white-space:pre-wrap' }, el('strong', {}, who + ': '), el('span', {}, text)); log.append(b); log.scrollTop = log.scrollHeight; return b.lastChild; };
    const go = async () => {
      const text = input.value.trim(); if (!text || busy) return; busy = true; stopFlag = false; send.disabled = true; stop.disabled = false; send.setAttribute('aria-busy', 'true');
      try {
        const L = await import('../gap5lib/llm.js');
        if (!ctx) { status.textContent = 'Downloading the model (76 MB, once)...'; const { M, tok } = await L.getModel((f) => { status.textContent = `Downloading the model: ${Math.round(f * 100)}%`; }); ctx = { M, tok, st: L.newState(M) }; }
        bubble('You', text); input.value = ''; const out = bubble('AI', '');
        const prompt = firstTurn ? L.chatPrompt([{ role: 'user', content: text }]) : `<|im_end|>\n<|im_start|>user\n${text}<|im_end|>\n<|im_start|>assistant\n`; firstTurn = false;
        const ids = L.encodeChat(ctx.tok, prompt); status.textContent = 'Thinking...'; let words = 0; const t0 = Date.now();
        await L.generate(ctx.M, ctx.tok, ctx.st, ids, { temperature: +temp.value || 0, maxNew: +maxn.value || 160, rep: 1.1 }, (d) => { out.textContent += d; words = out.textContent.split(/\s+/).filter(Boolean).length; status.textContent = `Writing... ${words} words`; log.scrollTop = log.scrollHeight; }, () => stopFlag);
        status.textContent = `Done: ${words} words in ${Math.round((Date.now() - t0) / 1000)} s${stopFlag ? ' (stopped)' : ''}. Context used: ${ctx.st.len} of ${L.MAX_CTX} tokens.`;
      } catch (e) { status.textContent = ''; log.append(el('p', { role: 'alert', className: 'err' }, String(e?.message || e))); }
      finally { busy = false; send.disabled = false; stop.disabled = true; send.removeAttribute('aria-busy'); }
    };
    send.addEventListener('click', go); stop.addEventListener('click', () => { stopFlag = true; });
    reset.addEventListener('click', async () => { stopFlag = true; log.replaceChildren(); firstTurn = true; if (ctx) { const L = await import('../gap5lib/llm.js'); ctx.st = L.newState(ctx.M); } status.textContent = 'New chat started'; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });
  },
});

// ====================================================================== TLS ClientHello fingerprints (JA3, JA4)
const GREASE = (v) => (v & 0x0f0f) === 0x0a0a && (v >> 8) === (v & 0xff);
const EXT_NAMES = { 0: 'server_name', 5: 'status_request', 10: 'supported_groups', 11: 'ec_point_formats', 13: 'signature_algorithms', 16: 'alpn', 18: 'signed_certificate_timestamp', 21: 'padding', 23: 'extended_master_secret', 27: 'compress_certificate', 28: 'record_size_limit', 35: 'session_ticket', 43: 'supported_versions', 45: 'psk_key_exchange_modes', 49: 'post_handshake_auth', 50: 'signature_algorithms_cert', 51: 'key_share', 65037: 'encrypted_client_hello', 65281: 'renegotiation_info', 17513: 'application_settings', 22: 'encrypt_then_mac', 57: 'quic_transport_parameters', 15: 'heartbeat', 34: 'delegated_credentials', 17: 'status_request_v2' };
const GROUP_NAMES = { 23: 'secp256r1', 24: 'secp384r1', 25: 'secp521r1', 29: 'x25519', 30: 'x448', 256: 'ffdhe2048', 257: 'ffdhe3072', 258: 'ffdhe4096', 259: 'ffdhe6144', 260: 'ffdhe8192', 4588: 'X25519MLKEM768', 25497: 'X25519Kyber768Draft00', 4587: 'SecP256r1MLKEM768' };
const CIPHER_NAMES = { 0x1301: 'TLS_AES_128_GCM_SHA256', 0x1302: 'TLS_AES_256_GCM_SHA384', 0x1303: 'TLS_CHACHA20_POLY1305_SHA256', 0xc02b: 'ECDHE-ECDSA-AES128-GCM-SHA256', 0xc02c: 'ECDHE-ECDSA-AES256-GCM-SHA384', 0xc02f: 'ECDHE-RSA-AES128-GCM-SHA256', 0xc030: 'ECDHE-RSA-AES256-GCM-SHA384', 0xcca8: 'ECDHE-RSA-CHACHA20-POLY1305', 0xcca9: 'ECDHE-ECDSA-CHACHA20-POLY1305', 0xc013: 'ECDHE-RSA-AES128-SHA', 0xc014: 'ECDHE-RSA-AES256-SHA', 0xc009: 'ECDHE-ECDSA-AES128-SHA', 0xc00a: 'ECDHE-ECDSA-AES256-SHA', 0x009c: 'AES128-GCM-SHA256', 0x009d: 'AES256-GCM-SHA384', 0x002f: 'AES128-SHA', 0x0035: 'AES256-SHA', 0x000a: 'DES-CBC3-SHA', 0x00ff: 'TLS_EMPTY_RENEGOTIATION_INFO_SCSV', 0x009e: 'DHE-RSA-AES128-GCM-SHA256', 0x009f: 'DHE-RSA-AES256-GCM-SHA384', 0xccaa: 'DHE-RSA-CHACHA20-POLY1305', 0x0033: 'DHE-RSA-AES128-SHA', 0x0039: 'DHE-RSA-AES256-SHA', 0x003c: 'AES128-SHA256', 0x003d: 'AES256-SHA256', 0x006b: 'DHE-RSA-AES256-SHA256', 0x0067: 'DHE-RSA-AES128-SHA256', 0xc023: 'ECDHE-ECDSA-AES128-SHA256', 0xc024: 'ECDHE-ECDSA-AES256-SHA384', 0xc027: 'ECDHE-RSA-AES128-SHA256', 0xc028: 'ECDHE-RSA-AES256-SHA384', 0x0005: 'RC4-SHA', 0x0004: 'RC4-MD5' };
const WEAK_CIPHER = /^(RC4|DES|.*-MD5)/;
function parseClientHello(bytes) {
  let b = bytes, p = 0;
  if (b[0] === 0x16) { // TLS record(s): concatenate the handshake payloads
    const parts = []; let q = 0;
    while (q + 5 <= b.length && b[q] === 0x16) { const len = (b[q + 3] << 8) | b[q + 4]; parts.push(b.subarray(q + 5, q + 5 + len)); q += 5 + len; }
    const tot = parts.reduce((a, x) => a + x.length, 0), m = new Uint8Array(tot); let o = 0; for (const x of parts) { m.set(x, o); o += x.length; } b = m;
  }
  if (b[0] !== 1) throw new Error('This is not a TLS ClientHello: expected a handshake record (16 03 ..) or a handshake message starting with 01.');
  const u16 = () => { const v = (b[p] << 8) | b[p + 1]; p += 2; return v; }, u8 = () => b[p++];
  const need = (n) => { if (p + n > b.length) throw new Error('The ClientHello is truncated (copy the whole record).'); };
  p = 4; need(34); const version = u16(); p += 32; const sidLen = u8(); need(sidLen); p += sidLen;
  const cl = u16(); need(cl); const ciphers = []; for (let i = 0; i < cl; i += 2) ciphers.push(u16());
  const cm = u8(); p += cm;
  const exts = []; let sni = null, alpn = [], groups = [], pf = [], sigalgs = [], sv = [];
  if (p + 2 <= b.length) {
    const el = u16(), end = Math.min(b.length, p + el);
    while (p + 4 <= end) {
      const type = u16(), len = u16(), s = p, d = b.subarray(p, p + len); p = s + len; exts.push(type);
      const r16 = (o) => (d[o] << 8) | d[o + 1];
      if (type === 0 && len > 5) sni = new TextDecoder().decode(d.subarray(5, 5 + r16(3)));
      else if (type === 10) for (let o = 2; o + 1 < len; o += 2) groups.push(r16(o));
      else if (type === 11) pf = [...d.subarray(1, 1 + d[0])];
      else if (type === 13) for (let o = 2; o + 1 < len; o += 2) sigalgs.push(r16(o));
      else if (type === 16) { let o = 2; while (o < len) { const l = d[o]; alpn.push(d.subarray(o + 1, o + 1 + l)); o += 1 + l; } }
      else if (type === 43) for (let o = 1; o + 1 < len; o += 2) sv.push(r16(o));
    }
  }
  return { version, ciphers, exts, sni, alpn, groups, pf, sigalgs, sv };
}
async function sha256hex12(s) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); return toHex(d).slice(0, 12); }
const h4 = (v) => v.toString(16).padStart(4, '0');
function ja3Of(h) {
  const s = [h.version, h.ciphers.filter((x) => !GREASE(x)).join('-'), h.exts.filter((x) => !GREASE(x)).join('-'), h.groups.filter((x) => !GREASE(x)).join('-'), h.pf.join('-')].join(',');
  return { s, md5: toHex(md5(new TextEncoder().encode(s))) };
}
async function ja4Of(h) {
  const sv = h.sv.filter((x) => !GREASE(x)), top = sv.length ? Math.max(...sv) : h.version;
  const ver = { 0x0304: '13', 0x0303: '12', 0x0302: '11', 0x0301: '10', 0x0300: 's3', 0x0002: 's2', 0xfeff: 'd1', 0xfefd: 'd2', 0xfefc: 'd3' }[top] || '00';
  const ciphers = h.ciphers.filter((x) => !GREASE(x)), exts = h.exts.filter((x) => !GREASE(x));
  const endCh = (x) => (x >= 0x20 && x <= 0x7e ? String.fromCharCode(x) : x >= 0x80 ? '9' : null);
  let al = '00'; if (h.alpn.length && h.alpn[0].length) { const f = h.alpn[0], x = endCh(f[0]), y = endCh(f[f.length - 1]); al = x === null || y === null ? '99' : x + y; }
  const a = `t${ver}${h.sni ? 'd' : 'i'}${String(Math.min(99, ciphers.length)).padStart(2, '0')}${String(Math.min(99, exts.length)).padStart(2, '0')}${al}`;
  const b = ciphers.length ? await sha256hex12([...ciphers].sort((x, y) => x - y).map(h4).join(',')) : '000000000000';
  const ce = exts.filter((x) => x !== 0 && x !== 16).sort((x, y) => x - y).map(h4).join(','), sg = h.sigalgs.filter((x) => !GREASE(x)).map(h4).join(',');
  const c = !ce && !sg ? '000000000000' : await sha256hex12(ce + (sg ? '_' + sg : ''));
  return { a, b, c, full: `${a}_${b}_${c}` };
}
T.push({
  id: 'ja3-ja4-fingerprint-calculator', cat: NET, title: 'JA3 and JA4 TLS Fingerprint Calculator (from a ClientHello)',
  desc: 'Paste a TLS ClientHello as hex (from Wireshark, tcpdump or openssl s_client -msg) and get its JA3 string, JA3 MD5 and JA4 fingerprint, plus a readable breakdown. Runs locally.',
  inputs: 1, labels: ['ClientHello as hex (TLS record starting 16 03.., or handshake starting 01), or a JA3 string'], placeholder: ['16030101460100014203 03...'],
  sample: '1603010146010001420303febb7c82247ee96a262c10a81421fc6dcee341b29aa56a2976a6f5826021f79a2072e661ed0a90fbe67065dc2e7e3e93546a2ad5e63562c5fd07ad4bfe58443602003e130213031301c02cc030009fcca9cca8ccaac02bc02f009ec024c028006bc023c0270067c00ac0140039c009c0130033009d009c003d003c0035002f00ff010000bb00000010000e00000b6578616d706c652e636f6d000b000403000102000a00160014001d0017001e0019001801000101010201030104002300000010000e000c02683208687474702f312e310016000000170000000d002a0028040305030603080708080809080a080b080408050806040105010601030303010302040205020602002b00050403040303002d00020101003300260024001d002041feab1eb9113fd04e01bd32c61401313c210b629dac0149955fdc4be31d9b61',
  run: async ([inp]) => {
    const t = need(inp, 'a ClientHello in hex'); const out = [];
    const m = /^\s*(\d+),([\d-]*),([\d-]*),([\d-]*),([\d-]*)\s*$/.exec(t);
    if (m) return `JA3 string given, hashing it.\n\nJA3 string: ${t.trim()}\nJA3 MD5:    ${toHex(md5(new TextEncoder().encode(t.trim())))}\n\nA JA3 string cannot give a JA4 (JA4 needs the extension order, ALPN and signature algorithms). Paste the ClientHello hex for that.`;
    const h = parseClientHello(hexToBytes(t)), j3 = ja3Of(h), j4 = await ja4Of(h);
    const nm = (map, v) => (GREASE(v) ? `GREASE (0x${h4(v)})` : map[v] || 'unknown');
    out.push(sec('Fingerprints', `JA3 string: ${j3.s}\nJA3 MD5:    ${j3.md5}\nJA4:        ${j4.full}\n  a (protocol, version, SNI, counts, ALPN) = ${j4.a}\n  b (sorted cipher suites, SHA-256/12)     = ${j4.b}\n  c (sorted extensions + sigalgs)          = ${j4.c}`));
    out.push(sec('ClientHello', [`legacy version: 0x${h4(h.version)}`, `supported_versions: ${h.sv.length ? h.sv.map((v) => '0x' + h4(v) + (GREASE(v) ? ' (GREASE)' : '')).join(', ') : 'absent'}`, `SNI: ${h.sni ?? 'none'}`, `ALPN: ${h.alpn.join(', ') || 'none'}`, `point formats: ${h.pf.join(', ') || 'none'}`].join('\n')));
    out.push(sec(`Cipher suites (${h.ciphers.length})`, h.ciphers.map((c) => `0x${h4(c)}  ${nm(CIPHER_NAMES, c)}${WEAK_CIPHER.test(CIPHER_NAMES[c] || '') ? '   <- weak or obsolete' : ''}`).join('\n')));
    out.push(sec(`Extensions in order (${h.exts.length})`, h.exts.map((e) => `${String(e).padStart(5)}  0x${h4(e)}  ${nm(EXT_NAMES, e)}`).join('\n')));
    out.push(sec(`Supported groups (${h.groups.length})`, h.groups.map((g) => `${g}  ${nm(GROUP_NAMES, g)}`).join('\n') || 'none'));
    out.push('Notes: GREASE values are removed before hashing (JA3 and JA4). Chrome and Firefox shuffle extension order per connection, so their JA3 changes; JA4 sorts extensions and is stable. A fingerprint identifies a TLS client implementation, not a person, and is not proof of identity. Cipher names cover the common suites only.');
    return out.join('\n\n');
  },
});

// ====================================================================== WHOIS record parser
const EPP = {
  ok: 'No pending operations or prohibitions: the domain is active and unlocked.',
  active: 'Active (ccTLD wording for "ok").',
  inactive: 'No name servers are delegated, so the domain does not resolve.',
  addperiod: 'Within the grace period after first registration; it can be deleted for a refund.',
  autorenewperiod: 'Within the grace period after an automatic renewal.',
  renewperiod: 'Within the grace period after a manual renewal.',
  transferperiod: 'Within the grace period after a transfer between registrars.',
  pendingcreate: 'Registration request is still being processed.',
  pendingdelete: 'The domain will be deleted and released for re-registration soon. Not recoverable by normal means.',
  pendingrenew: 'A renewal request is being processed.',
  pendingrestore: 'A restore from redemption has been requested and awaits confirmation.',
  pendingtransfer: 'A transfer to another registrar is in progress.',
  pendingupdate: 'An update is being processed.',
  redemptionperiod: 'Deleted but still recoverable for a fee (about 30 days). The domain does not resolve.',
  clienthold: 'The registrar has suspended the domain (unpaid, abuse, or a dispute): it does not resolve.',
  serverhold: 'The registry has suspended the domain: it does not resolve.',
  clienttransferprohibited: 'Registrar lock: transfers to another registrar are blocked. Normal and recommended.',
  clientdeleteprohibited: 'Registrar lock: deletion is blocked.',
  clientupdateprohibited: 'Registrar lock: changes to the record are blocked.',
  clientrenewprohibited: 'Registrar lock: renewal is blocked (rare).',
  servertransferprohibited: 'Registry lock: transfers are blocked at the registry (stronger than the registrar lock).',
  serverdeleteprohibited: 'Registry lock: deletion is blocked at the registry.',
  serverupdateprohibited: 'Registry lock: changes are blocked at the registry.',
  serverrenewprohibited: 'Registry lock: renewal is blocked at the registry.',
};
const EPP_BAD = new Set(['clienthold', 'serverhold', 'pendingdelete', 'redemptionperiod', 'inactive']);
const KEYMAP = {
  domain: ['domain name', 'domain', 'domainname'],
  registrar: ['registrar', 'sponsoring registrar', 'registrar name'],
  iana: ['registrar iana id', 'iana id'],
  created: ['creation date', 'created', 'registered', 'registration date', 'created on', 'domain registration date', 'registered on', 'domain name commencement date'],
  updated: ['updated date', 'last updated', 'changed', 'last modified', 'last update', 'modified', 'last updated on'],
  expires: ['registry expiry date', 'registrar registration expiration date', 'expiry date', 'expiration date', 'paid-till', 'expires', 'renewal date', 'expire date', 'expires on', 'registrar expiration date'],
  status: ['domain status', 'status', 'state'],
  ns: ['name server', 'nserver', 'nameserver', 'name servers', 'nameservers', 'name server (db)'],
  dnssec: ['dnssec', 'dnssec status'],
  org: ['registrant organization', 'registrant organisation', 'org', 'organization', 'registrant'],
  country: ['registrant country', 'registrant country/economy', 'country'],
  email: ['registrant email', 'registrar abuse contact email', 'abuse contact email', 'abuse-mailbox', 'e-mail'],
  referral: ['registrar whois server', 'whois server', 'refer'],
};
function parseDate(s) {
  if (!s) return null;
  let t = String(s).trim().replace(/\s*\(.*\)$/, '').replace(/(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3').replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/, '$1T$2Z').replace(/^(\d{4}-\d{2}-\d{2})$/, '$1T00:00:00Z');
  t = t.replace(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{4})(.*)$/, '$1 $2 $3 UTC');
  const d = new Date(t); return Number.isNaN(d.getTime()) ? null : d;
}
const iso = (d) => (d ? d.toISOString().slice(0, 10) : 'not found');
function whoisParse(text) {
  const kv = {}; const raw = [];
  for (const l of String(text).split(/\r?\n/)) {
    const m = /^\s*([A-Za-z][A-Za-z0-9 /().'-]{1,48}?)\s*:\s*(.*?)\s*$/.exec(l);
    if (!m) { raw.push(l); continue; }
    const k = m[1].toLowerCase(); if (m[2] === '') continue; (kv[k] ||= []).push(m[2]);
  }
  const get = (name, all) => { const out = []; for (const k of KEYMAP[name]) if (kv[k]) out.push(...kv[k]); return all ? out : out[0]; };
  return { kv, get };
}
T.push({
  id: 'whois-record-parser', cat: NET, title: 'WHOIS Record Parser (Domain and IP, Expiry and Status Explained)',
  desc: 'Paste the text from a WHOIS or RDAP lookup and get a clean summary: registrar, dates, domain age, days to expiry, name servers, and what each EPP status code means.',
  inputs: 1, labels: ['WHOIS record text (domain or IP)'], placeholder: ['Domain Name: EXAMPLE.COM\nRegistrar: ...'],
  opts: [{ id: 'asof', label: 'Treat this date as today (YYYY-MM-DD, blank = now)', type: 'text', def: '' }],
  sample: `Domain Name: EXAMPLE-SHOP.COM
Registry Domain ID: 2812345678_DOMAIN_COM-VRSN
Registrar WHOIS Server: whois.example-registrar.test
Registrar URL: http://www.example-registrar.test
Updated Date: 2026-06-12T09:41:13Z
Creation Date: 2019-11-04T14:20:00Z
Registry Expiry Date: 2026-11-04T14:20:00Z
Registrar: Example Registrar, Inc.
Registrar IANA ID: 1234
Registrar Abuse Contact Email: abuse@example-registrar.test
Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited
Domain Status: clientUpdateProhibited https://icann.org/epp#clientUpdateProhibited
Registrant Organization: REDACTED FOR PRIVACY
Registrant Country: BE
Name Server: NS1.EXAMPLE-DNS.TEST
Name Server: NS2.EXAMPLE-DNS.TEST
DNSSEC: unsigned
>>> Last update of whois database: 2026-10-23T03:00:00Z <<<`,
  run: ([inp], o) => {
    const text = need(inp, 'a WHOIS record'); const { kv, get } = whoisParse(text);
    const now = o.asof && /^\d{4}-\d{2}-\d{2}$/.test(o.asof.trim()) ? new Date(o.asof.trim() + 'T00:00:00Z') : new Date();
    const out = [];
    if (kv.netrange || kv.inetnum || kv.inet6num || kv.cidr) {
      const g = (...ks) => ks.map((k) => kv[k]?.[0]).find(Boolean) || 'not found';
      out.push(sec('IP / network record', [`range:        ${g('netrange', 'inetnum', 'inet6num')}`, `CIDR:         ${g('cidr', 'route', 'route6')}`, `name:         ${g('netname', 'net-name')}`, `organisation: ${g('orgname', 'org-name', 'organization', 'descr', 'owner')}`, `country:      ${g('country')}`, `origin AS:    ${g('originas', 'origin')}`, `type:         ${g('nettype', 'status')}`, `registered:   ${iso(parseDate(g('regdate', 'created')))}`, `updated:      ${iso(parseDate(g('updated', 'last-modified', 'changed')))}`, `abuse:        ${g('orgabuseemail', 'abuse-mailbox', 'orgabusephone')}`].join('\n')));
    }
    const dom = get('domain');
    if (dom || !out.length) {
      const created = parseDate(get('created')), updated = parseDate(get('updated')), expires = parseDate(get('expires'));
      const day = 86400000, rows = [];
      rows.push(['domain', dom || 'not found'], ['registrar', get('registrar') || 'not found'], ['IANA id', get('iana') || '-'], ['created', iso(created) + (created ? `  (age ${round((now - created) / day / 365.25, 1)} years)` : '')], ['last updated', iso(updated)]);
      let exp = iso(expires);
      if (expires) { const left = Math.round((expires - now) / day); exp += left >= 0 ? `  (${left} days left)` : `  (EXPIRED ${-left} days ago)`; }
      rows.push(['expires', exp], ['DNSSEC', get('dnssec') || 'not stated'], ['registrant org', get('org') || 'not stated'], ['registrant country', get('country') || 'not stated'], ['contact', get('email') || 'not stated']);
      out.push(sec('Domain summary', rows.map(([k, v]) => `${k.padEnd(19)}${v}`).join('\n')));
      const ns = [...new Set(get('ns', true).map((x) => x.split(/\s+/)[0].toLowerCase().replace(/\.$/, '')))];
      out.push(sec(`Name servers (${ns.length})`, ns.join('\n') || 'none listed'));
      const st = [...new Set(get('status', true).map((x) => x.split(/\s+/)[0]))];
      out.push(sec(`Status (${st.length})`, st.map((s) => { const k = s.replace(/[\s_-]/g, '').toLowerCase(); return `${s}\n    ${EPP[k] || 'Not an EPP status code this tool knows (ccTLD registries use their own words).'}`; }).join('\n') || 'none listed'));
      const warn = [];
      if (expires) { const left = (expires - now) / day; if (left < 0) warn.push('The registration has expired. Renew at once; the registrar may hold the domain (clientHold) and later delete it.'); else if (left < 30) warn.push(`Expires in ${Math.round(left)} days: renew soon and check auto-renew.`); else if (left < 90) warn.push(`Expires in ${Math.round(left)} days.`); }
      if (st.some((s) => EPP_BAD.has(s.replace(/[\s_-]/g, '').toLowerCase()))) warn.push('A status in this record normally means the domain does not resolve (hold, redemption, pending delete or no name servers).');
      if (!st.some((s) => /transferprohibited/i.test(s)) && dom) warn.push('No transfer lock status is listed: the domain may be easy to transfer away. Many registries hide statuses, so confirm at the registrar.');
      if (ns.length === 1) warn.push('Only one name server is listed; two or more on separate networks are recommended.');
      if (created && (now - created) / day < 90) warn.push('The domain is under 90 days old; spam filters and some risk services treat new domains with suspicion.');
      if (get('referral') && !get('created') && !get('registrar')) warn.push('This looks like a thin registry record. Query the registrar WHOIS server it refers to for the full record.');
      if (/REDACTED|privacy|proxy|whoisguard|domains by proxy/i.test(text)) warn.push('Registrant details are redacted or behind a privacy service, as expected under GDPR; no contact data is available here.');
      out.push(sec('Checks', warn.length ? warn.map((w) => '- ' + w).join('\n') : 'Nothing unusual found in this record.'));
    }
    out.push(`Parsed locally from the text you pasted; no lookup is made. "Today" = ${iso(now)}. Registries format records differently, so a field that is missing here may exist in the raw text.`);
    return out.join('\n\n');
  },
});

// ====================================================================== dig / nslookup output analyser
const RRTYPES = new Set(['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'PTR', 'SRV', 'CAA', 'DS', 'DNSKEY', 'RRSIG', 'NSEC', 'NSEC3', 'NSEC3PARAM', 'HTTPS', 'SVCB', 'TLSA', 'NAPTR', 'SSHFP', 'OPT', 'ANY', 'HINFO', 'SPF', 'DNAME', 'URI', 'CDS', 'CDNSKEY']);
function txtJoin(rdata) { const parts = [...rdata.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1')); return parts.length ? parts.join('') : rdata; }
function parseDig(text) {
  const blocks = []; const re = /^; <<>> DiG .*$/gm; const idx = [...text.matchAll(re)].map((m) => m.index);
  const chunks = idx.length ? idx.map((s, i) => text.slice(s, idx[i + 1] ?? text.length)) : [text];
  for (const ch of chunks) {
    const b = { query: (/^; <<>> DiG .*?<<>> (.*)$/m.exec(ch) || [])[1] || '', status: (/status: (\w+)/.exec(ch) || [])[1], flags: ((/flags: ([a-z ]*);/.exec(ch) || [])[1] || '').trim().split(/\s+/).filter(Boolean), time: (/Query time: (\d+) msec/.exec(ch) || [])[1], server: (/SERVER: ([^\n]+)/.exec(ch) || [])[1], records: [], short: [] };
    let section = null; const hasHeader = /;; ->>HEADER<<-/.test(ch);
    for (const l of ch.split(/\r?\n/)) {
      const sm = /^;; (ANSWER|AUTHORITY|ADDITIONAL) SECTION:/.exec(l); if (sm) { section = sm[1].toLowerCase(); continue; }
      if (/^;; /.test(l)) { section = null; continue; }
      if (!l.trim() || l.startsWith(';')) continue;
      if (hasHeader && !section) continue;
      const m = /^(\S+)\s+(\d+)\s+(?:IN\s+)?([A-Z0-9]+)\s+(.*)$/.exec(l);
      if (m && RRTYPES.has(m[3])) b.records.push({ section: section || 'answer', name: m[1].toLowerCase(), ttl: +m[2], type: m[3], rdata: m[4].trim() });
      else if (!hasHeader && l.trim()) b.short.push(l.trim());
    }
    blocks.push(b);
  }
  return blocks;
}
function parseNslookup(text) {
  const recs = []; let name = '';
  for (const l of text.split(/\r?\n/)) {
    let m;
    if ((m = /^Name:\s+(\S+)/.exec(l))) name = m[1];
    else if ((m = /^Address(?:es)?:\s+([0-9a-fA-F:.]+)(?:#\d+)?\s*$/.exec(l)) && name) recs.push({ section: 'answer', name: name.toLowerCase(), ttl: NaN, type: m[1].includes(':') ? 'AAAA' : 'A', rdata: m[1] });
    else if ((m = /^(\S+)\s+mail exchanger = (\d+) (\S+)/.exec(l))) recs.push({ section: 'answer', name: m[1], ttl: NaN, type: 'MX', rdata: `${m[2]} ${m[3]}` });
    else if ((m = /^(\S+)\s+nameserver = (\S+)/.exec(l))) recs.push({ section: 'answer', name: m[1], ttl: NaN, type: 'NS', rdata: m[2] });
    else if ((m = /^(\S+)\s+canonical name = (\S+)/.exec(l))) recs.push({ section: 'answer', name: m[1], ttl: NaN, type: 'CNAME', rdata: m[2] });
    else if ((m = /^(\S+)\s+text = (.*)$/.exec(l))) recs.push({ section: 'answer', name: m[1], ttl: NaN, type: 'TXT', rdata: m[2] });
    else if ((m = /^(\S+)\s+(?:has )?(?:AAAA )?address ([0-9a-f:.]+)/.exec(l))) recs.push({ section: 'answer', name: m[1], ttl: NaN, type: m[2].includes(':') ? 'AAAA' : 'A', rdata: m[2] });
  }
  return [{ query: 'nslookup', status: 'NOERROR', flags: [], records: recs, short: [] }];
}
function spfCheck(txt) {
  const out = [], toks = txt.trim().split(/\s+/).slice(1);
  const lookups = toks.filter((t) => /^[+\-~?]?(include|a|mx|ptr|exists|redirect)([:=/]|$)/i.test(t)).length;
  const all = toks.find((t) => /^[+\-~?]?all$/i.test(t));
  out.push(`${toks.length} terms, about ${lookups} DNS-lookup mechanisms (limit 10; the real count includes nested includes, which this tool cannot follow)`);
  if (lookups > 10) out.push('PROBLEM: more than 10 lookup mechanisms: receivers return permerror.');
  if (!all && !toks.some((t) => /^redirect=/i.test(t))) out.push('NOTE: no "all" or redirect: unlisted senders get a neutral result.');
  if (all && /^\+?all$/i.test(all)) out.push('PROBLEM: "+all" (or bare "all") authorises every sender: SPF gives no protection.');
  if (all && /^\?all$/i.test(all)) out.push('NOTE: "?all" is neutral: no policy.');
  if (all && /^~all$/i.test(all)) out.push('OK: "~all" (softfail); "-all" is stricter once all senders are listed.');
  if (all && /^-all$/i.test(all)) out.push('OK: "-all" (fail) for unlisted senders.');
  if (toks.some((t) => /^[+\-~?]?ptr/i.test(t))) out.push('NOTE: "ptr" is deprecated (RFC 7208) and slow.');
  return out;
}
function dmarcCheck(txt) {
  const tags = Object.fromEntries(txt.split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf('='); return [x.slice(0, i).trim().toLowerCase(), x.slice(i + 1).trim()]; })), out = [];
  out.push(`policy p=${tags.p || '(missing)'}, subdomain sp=${tags.sp || 'same as p'}, pct=${tags.pct || '100'}, aggregate reports rua=${tags.rua || 'none'}, forensic ruf=${tags.ruf || 'none'}, alignment adkim=${tags.adkim || 'r'} aspf=${tags.aspf || 'r'}`);
  if (!tags.p) out.push('PROBLEM: p= is required.'); else if (tags.p === 'none') out.push('NOTE: p=none only monitors: nothing is rejected or quarantined.');
  else if (tags.pct && +tags.pct < 100) out.push(`NOTE: pct=${tags.pct}: the policy applies to only that share of mail.`);
  if (!tags.rua) out.push('NOTE: no rua= address, so you receive no aggregate reports.');
  return out;
}
function digReport(blocks, now) {
  const all = blocks.flatMap((b) => b.records), out = [];
  const ans = all.filter((r) => r.section === 'answer'), by = {};
  for (const r of ans) (by[r.type] ||= []).push(r);
  for (const b of blocks) {
    if (b.status && b.status !== 'NOERROR') out.push(`Query "${b.query}": status ${b.status}. ` + ({ NXDOMAIN: 'The name does not exist (check spelling, or the record was never created).', SERVFAIL: 'The resolver failed: often broken DNSSEC, unreachable or lame authoritative servers.', REFUSED: 'The server refused to answer (recursion not allowed for you, or an ACL).', FORMERR: 'The server could not parse the query.', NOTIMP: 'The server does not support this kind of query.' }[b.status] || ''));
    else if (b.status === 'NOERROR' && b.records.length === 0 && b.short.length === 0) out.push(`Query "${b.query}": NOERROR with no records (NODATA): the name exists but has no record of that type.`);
  }
  const lines = [];
  for (const [t, rs] of Object.entries(by)) {
    lines.push(`${t} (${rs.length})`);
    for (const r of t === 'MX' ? [...rs].sort((a, b) => parseInt(a.rdata) - parseInt(b.rdata)) : rs) lines.push(`  ${r.name.padEnd(30)} ${Number.isNaN(r.ttl) ? '' : 'TTL ' + String(r.ttl).padEnd(6)} ${t === 'TXT' ? txtJoin(r.rdata) : r.rdata}`);
  }
  for (const b of blocks) for (const s of b.short) lines.push('  (short) ' + s);
  if (lines.length) out.push(sec('Records', lines.join('\n')));
  const chk = [];
  const txts = (by.TXT || []).map((r) => ({ r, v: txtJoin(r.rdata) }));
  const spf = txts.filter((x) => /^v=spf1(\s|$)/i.test(x.v));
  if (spf.length > 1) chk.push(`PROBLEM: ${spf.length} SPF records on one name: receivers return permerror. Merge them into one.`);
  spf.forEach((x) => chk.push(`SPF on ${x.r.name}:\n    ` + spfCheck(x.v).join('\n    ')));
  txts.filter((x) => /^v=DMARC1/i.test(x.v)).forEach((x) => chk.push(`DMARC on ${x.r.name}:\n    ` + dmarcCheck(x.v).join('\n    ')));
  txts.filter((x) => /^v=DKIM1/i.test(x.v)).forEach((x) => { const p = /p=([A-Za-z0-9+/=\s]*)/.exec(x.v)?.[1]?.replace(/\s/g, '') || ''; chk.push(`DKIM on ${x.r.name}: ${p ? `public key present, about ${Math.round(p.length * 6 / 8 > 250 ? 2048 : p.length * 6 / 8 > 150 ? 1024 : 512)}-bit RSA (estimated from length)${p.length < 200 ? ' - 1024-bit or shorter is weak, use 2048' : ''}` : 'p= is empty: the key is revoked'}`); });
  if (by.MX) {
    const mx = by.MX.map((r) => ({ pri: parseInt(r.rdata), host: r.rdata.split(/\s+/)[1] }));
    if (mx.some((m) => m.host === '.')) chk.push('MX: null MX ("0 ."): the domain states it does not accept mail.');
    mx.filter((m) => /^[0-9.]+$/.test(m.host || '')).forEach((m) => chk.push(`PROBLEM: MX target ${m.host} is an IP address; MX must be a host name.`));
    if (mx.length === 1) chk.push('MX: only one mail exchanger; a secondary is usual for resilience.');
  }
  if (by.NS && by.NS.length < 2) chk.push('PROBLEM: fewer than 2 NS records (RFC 2182 asks for at least two on separate networks).');
  const names = new Map(); for (const r of ans) { (names.get(r.name) || names.set(r.name, new Set()).get(r.name)).add(r.type); }
  for (const [n, ts] of names) if (ts.has('CNAME') && [...ts].some((t) => !['CNAME', 'RRSIG', 'NSEC', 'NSEC3'].includes(t))) chk.push(`PROBLEM: ${n} has a CNAME plus other record types, which DNS does not allow.`);
  (by.CAA || []).forEach((r) => chk.push(`CAA ${r.name}: ${r.rdata}`));
  if (!by.CAA && ans.length) chk.push('NOTE: no CAA record in this output (only matters if you queried CAA for the zone).');
  const ttls = ans.map((r) => r.ttl).filter(Number.isFinite);
  if (ttls.length) { chk.push(`TTL: min ${Math.min(...ttls)} s, max ${Math.max(...ttls)} s${Math.min(...ttls) < 60 ? ' (very low TTLs raise query load; fine during a migration)' : ''}${Math.max(...ttls) > 86400 ? ' (over a day: changes will propagate slowly)' : ''}. Cached answers show the REMAINING TTL, so numbers below the zone value are normal.`); }
  if (all.some((r) => ['RRSIG', 'DNSKEY', 'DS'].includes(r.type))) chk.push(`DNSSEC: signature/key records present${blocks.some((b) => b.flags.includes('ad')) ? '; resolver set the AD flag (validated)' : ''}.`);
  const meta = blocks.filter((b) => b.server || b.time).map((b) => `${b.query || 'query'}: server ${b.server || '?'}, ${b.time ?? '?'} ms, flags ${b.flags.join(' ') || 'n/a'}${b.flags.includes('aa') ? ' (authoritative)' : ''}`);
  if (chk.length) out.push(sec('Checks', chk.join('\n')));
  if (meta.length) out.push(sec('Query details', meta.join('\n')));
  return out.join('\n\n') || 'No DNS records recognised. Paste the output of dig, dig +short or nslookup.';
}
T.push({
  id: 'dig-nslookup-output-analyzer', cat: NET, title: 'dig and nslookup Output Analyzer (MX, NS, TXT, SPF, DMARC, DKIM)',
  desc: 'Paste the output of dig or nslookup and get the records grouped and checked: SPF lookup count and policy, DMARC policy, DKIM key, MX order, NS count, CNAME clashes, TTLs, DNSSEC and error status.',
  inputs: 1, labels: ['Output of dig, dig +short or nslookup (you can paste several queries)'], placeholder: ['; <<>> DiG 9.18 <<>> example.com MX ...'],
  sample: `; <<>> DiG 9.18.39 <<>> example.org MX
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 62853
;; flags: qr rd ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1

;; QUESTION SECTION:
;example.org.			IN	MX

;; ANSWER SECTION:
example.org.		3600	IN	MX	20 mx2.mail.example.net.
example.org.		3600	IN	MX	10 mx1.mail.example.net.

;; Query time: 5 msec
;; SERVER: 1.1.1.1#53(1.1.1.1) (UDP)
;; WHEN: Fri Oct 23 05:35:21 CEST 2026
;; MSG SIZE  rcvd: 90

; <<>> DiG 9.18.39 <<>> example.org TXT
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 1
;; flags: qr rd ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1

;; ANSWER SECTION:
example.org.		300	IN	TXT	"v=spf1 include:_spf.example.net include:mailgun.org ip4:192.0.2.0/24 ~all"
example.org.		300	IN	TXT	"v=spf1 -all"

;; Query time: 7 msec
;; SERVER: 1.1.1.1#53(1.1.1.1) (UDP)

; <<>> DiG 9.18.39 <<>> _dmarc.example.org TXT
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 2
;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1

;; ANSWER SECTION:
_dmarc.example.org.	300	IN	TXT	"v=DMARC1; p=none; pct=50"

; <<>> DiG 9.18.39 <<>> nope.example.org A
;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 3
;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1`,
  run: ([inp]) => {
    const t = need(inp, 'dig or nslookup output');
    const blocks = /^Server:\s|^Non-authoritative answer:|^Name:\s/m.test(t) && !/<<>> DiG/.test(t) ? parseNslookup(t) : parseDig(t);
    return digReport(blocks);
  },
});

// ====================================================================== subdomain list organiser
const INTEREST = [[/(^|[.-])(admin|administrator|root|manage|manager|console|panel|cpanel|plesk|webmin)([.-]|\d|$)/, 'admin or management surface'], [/(^|[.-])(dev|develop|development|staging|stage|stg|test|testing|qa|uat|sandbox|preprod|pre-prod|demo|beta|alpha|canary)(\d*)([.-]|$)/, 'non-production environment'], [/(^|[.-])(vpn|ssl-vpn|remote|rdp|citrix|gateway|bastion|jump)([.-]|\d|$)/, 'remote access'], [/(^|[.-])(jenkins|gitlab|git|svn|ci|cd|build|bamboo|teamcity|nexus|artifactory|sonar|argocd|grafana|kibana|prometheus)([.-]|\d|$)/, 'developer or CI tooling'], [/(^|[.-])(jira|confluence|wiki|redmine|helpdesk|support|intranet|internal|corp|hr|erp|crm)([.-]|\d|$)/, 'internal business system'], [/(^|[.-])(backup|bak|old|legacy|archive|temp|tmp|dump|db|database|mysql|postgres|redis|mongo|elastic|s3|ftp|sftp)([.-]|\d|$)/, 'backup, legacy or data store'], [/(^|[.-])(mail|smtp|imap|pop3?|webmail|mx\d*|exchange|owa|autodiscover)([.-]|\d|$)/, 'mail'], [/(^|[.-])(api|graphql|rest|ws|socket|gateway|oauth|sso|auth|login|id|accounts)([.-]|\d|$)/, 'API or authentication']];
const SLD2 = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne', 'go']);
function regDomain(h) { const p = h.split('.'); if (p.length <= 2) return h; const last = p[p.length - 1], sld = p[p.length - 2]; return (last.length === 2 && SLD2.has(sld) ? p.slice(-3) : p.slice(-2)).join('.'); }
T.push({
  id: 'subdomain-list-analyzer', cat: NET, title: 'Subdomain List Analyzer (Dedupe, Group, Flag Risky Names)',
  desc: 'Paste hostnames from crt.sh, Certificate Transparency, amass, subfinder or a zone file. Dedupe, group by domain, count levels, and flag admin, staging, VPN, CI and backup names for review.',
  inputs: 1, labels: ['Hostnames, one per line (wildcards, trailing dots, URLs and certificate name lists are cleaned)'], placeholder: ['www.example.com\n*.dev.example.com\nvpn.example.com'],
  opts: [{ id: 'flag', label: 'Flag interesting names', type: 'checkbox', def: true }],
  sample: 'www.example.com\nexample.com\n*.example.com\nWWW.EXAMPLE.COM.\nmail.example.com\nvpn.example.com\nstaging.example.com\nstaging-2.api.example.com\njenkins.corp.example.com\ndb-backup.example.com\nshop.example.co.uk\nwww.shop.example.co.uk\nhttps://blog.example.com/path\nbeta.example.com',
  run: ([inp], o) => {
    const seen = new Set(), wild = new Set();
    for (const l of String(need(inp, 'a list of hostnames')).split(/[\r\n,;\s]+/)) {
      let h = l.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/:?#].*$/, '').replace(/\.$/, '');
      if (!h) continue; if (h.startsWith('*.')) { wild.add(h.slice(2)); h = h.slice(2); }
      if (/^[a-z0-9_]([a-z0-9_.-]*[a-z0-9_])?$/.test(h) && h.includes('.')) seen.add(h);
    }
    const hosts = [...seen].sort(); if (!hosts.length) throw new Error('No valid hostnames found.');
    const groups = new Map(); for (const h of hosts) (groups.get(regDomain(h)) || groups.set(regDomain(h), []).get(regDomain(h))).push(h);
    const out = [`${hosts.length} unique hostnames under ${groups.size} registered domain${groups.size > 1 ? 's' : ''}; ${wild.size} wildcard name${wild.size === 1 ? '' : 's'} (${[...wild].join(', ') || 'none'}).`];
    const depth = {}; for (const h of hosts) { const d = h.split('.').length - regDomain(h).split('.').length; depth[d] = (depth[d] || 0) + 1; }
    out.push(sec('Depth below the registered domain', Object.entries(depth).map(([d, n]) => `${d === '0' ? 'apex' : d + ' label' + (d > 1 ? 's' : '')}: ${n}`).join('\n')));
    for (const [d, hs] of groups) out.push(sec(`${d} (${hs.length})`, hs.join('\n')));
    if (o.flag) {
      const fl = []; for (const h of hosts) { const sub = h.slice(0, h.length - regDomain(h).length); const why = INTEREST.filter(([re]) => re.test(sub)).map(([, w]) => w); if (why.length) fl.push([h, why.join(', ')]); }
      out.push(sec(`Names worth a closer look (${fl.length})`, fl.length ? table(['hostname', 'why'], fl) + '\n\nKeyword matches only: check each one is intended to be public, patched and behind authentication. A name that no longer resolves but still has a DNS record (CNAME to a deleted cloud service) can be taken over.' : 'none matched the keyword list'));
    }
    out.push('Registered-domain grouping uses a short built-in list of second-level suffixes (co.uk, com.au, ...), not the full Public Suffix List; unusual suffixes may be grouped one level too deep.');
    return out.join('\n\n');
  },
});

// ====================================================================== nmap output analyser
const PORT_RISK = {
  21: ['FTP', 'Cleartext credentials and data; prefer SFTP/FTPS. Check for anonymous login.'], 22: ['SSH', 'Expected for admin access; restrict by IP/VPN, keys only, current OpenSSH.'], 23: ['Telnet', 'Cleartext remote shell: should not be exposed. Use SSH.'], 25: ['SMTP', 'Mail relay: confirm it is not an open relay and requires TLS/auth for submission.'], 53: ['DNS', 'Public resolvers can be abused for amplification; authoritative-only servers should refuse recursion.'], 69: ['TFTP', 'No authentication; should not be exposed.'], 80: ['HTTP', 'Cleartext web; redirect to HTTPS.'], 110: ['POP3', 'Cleartext mail retrieval; use POP3S.'], 111: ['rpcbind', 'Exposes RPC services; should not be public.'], 123: ['NTP', 'Old ntpd can be abused for amplification.'], 135: ['MS RPC', 'Windows RPC: do not expose to the internet.'], 139: ['NetBIOS', 'Windows file sharing: do not expose.'], 143: ['IMAP', 'Cleartext mail access; use IMAPS.'], 161: ['SNMP', 'Check community strings (public/private) and use SNMPv3.'], 389: ['LDAP', 'Cleartext directory; use LDAPS and do not expose.'], 443: ['HTTPS', 'Check certificate and TLS versions separately.'], 445: ['SMB', 'Common ransomware path; never expose to the internet.'], 512: ['rexec', 'Legacy r-service: remove.'], 513: ['rlogin', 'Legacy r-service: remove.'], 514: ['rsh/syslog', 'Legacy r-service or unauthenticated syslog.'], 873: ['rsync', 'Often unauthenticated; check modules.'], 1433: ['MS SQL', 'Database should not be public.'], 1521: ['Oracle', 'Database should not be public.'], 2049: ['NFS', 'File shares should not be public.'], 2375: ['Docker API', 'Unauthenticated Docker API gives root on the host; critical if open.'], 2376: ['Docker TLS', 'Docker API with TLS; verify client certificates are required.'], 3306: ['MySQL', 'Database should not be public.'], 3389: ['RDP', 'Frequent brute-force and exploit target; put behind VPN/gateway with NLA and MFA.'], 5432: ['PostgreSQL', 'Database should not be public.'], 5900: ['VNC', 'Weak authentication, often unencrypted; tunnel or remove.'], 5984: ['CouchDB', 'Check authentication.'], 6379: ['Redis', 'Often unauthenticated; critical if public.'], 8080: ['HTTP alt', 'Often an admin console, proxy or dev server.'], 9200: ['Elasticsearch', 'Often unauthenticated; critical if public.'], 11211: ['Memcached', 'Unauthenticated; abused for amplification.'], 27017: ['MongoDB', 'Check authentication; should not be public.'],
};
function parseNmap(text) {
  const hosts = []; let cur = null;
  for (const l of text.split(/\r?\n/)) {
    let m;
    if ((m = /^Host:\s+(\S+)\s+\(([^)]*)\)\s+Ports:\s+(.*?)(?:\t|$)/.exec(l))) { // -oG
      const h = { addr: m[1], name: m[2], ports: [], os: '' };
      for (const p of m[3].split(/,\s*/)) { const f = p.split('/'); if (f.length >= 5) h.ports.push({ port: +f[0], state: f[1], proto: f[2], service: f[4], version: (f[6] || '').trim() }); }
      hosts.push(h); continue;
    }
    if ((m = /^Nmap scan report for (.+)$/.exec(l))) { const a = /^(.*) \(([^)]+)\)$/.exec(m[1]); cur = { addr: a ? a[2] : m[1], name: a ? a[1] : '', ports: [], os: '', notShown: '', up: true }; hosts.push(cur); continue; }
    if (!cur) continue;
    if ((m = /^Host is (up|down)/.exec(l))) cur.up = m[1] === 'up';
    else if ((m = /^Not shown: (.*)$/.exec(l))) cur.notShown = m[1];
    else if ((m = /^(\d+)\/(tcp|udp|sctp)\s+(\S+)\s+(\S+)\s*(.*)$/.exec(l))) cur.ports.push({ port: +m[1], proto: m[2], state: m[3], service: m[4], version: m[5].trim() });
    else if ((m = /^(?:OS details|Running|Aggressive OS guesses): (.*)$/.exec(l)) && !cur.os) cur.os = m[1];
    else if ((m = /^Service Info: (.*)$/.exec(l))) cur.svcinfo = m[1];
  }
  return hosts.filter((h) => h.addr);
}
const oldVer = (v) => { // coarse "old software" hints from the version banner; a hint, not a CVE lookup
  const out = []; let m;
  if ((m = /OpenSSH[ _](\d+)\.(\d+)/i.exec(v)) && (+m[1] < 8)) out.push(`OpenSSH ${m[1]}.${m[2]} is old (before 8.0)`);
  if ((m = /Apache httpd 2\.(\d+)\.(\d+)/i.exec(v)) && (+m[1] < 4 || (+m[1] === 4 && +m[2] < 50))) out.push(`Apache ${m[0].slice(13)} is old (2.4.50 fixed several path-traversal bugs)`);
  if ((m = /nginx\/?\s?(\d+)\.(\d+)/i.exec(v)) && (+m[1] < 1 || (+m[1] === 1 && +m[2] < 20))) out.push(`nginx ${m[1]}.${m[2]} is old`);
  if (/Microsoft IIS httpd [1-7]\./i.test(v)) out.push('IIS 7 or older is end of life');
  if (/ProFTPD 1\.3\.[0-4]|vsftpd 2\./i.test(v)) out.push('old FTP server');
  if (/OpenSSL\/?\s?(0\.9|1\.0)/i.test(v)) out.push('OpenSSL 1.0 or older is end of life');
  if (/PHP\/?\s?[1-6]\./i.test(v)) out.push('PHP 7 or older is end of life');
  if (/MySQL 5\.[0-6]\b/i.test(v)) out.push('MySQL 5.6 or older is end of life');
  return out;
};
T.push({
  id: 'nmap-output-analyzer', cat: NET, title: 'Nmap Output Analyzer (Open Ports, Services, Risk Notes)',
  desc: 'Paste nmap normal (-oN) or grepable (-oG) output. Get a table per host of open ports and services, risky exposures such as RDP, SMB, Redis or Docker, and old software versions.',
  inputs: 1, labels: ['nmap output (normal or grepable format)'], placeholder: ['Nmap scan report for scanme.example (192.0.2.10)\nPORT STATE SERVICE\n22/tcp open ssh'],
  sample: `Starting Nmap 7.94 ( https://nmap.org ) at 2026-10-23 10:00 CEST
Nmap scan report for web01.example.org (192.0.2.10)
Host is up (0.012s latency).
Not shown: 993 closed tcp ports (reset)
PORT     STATE    SERVICE       VERSION
21/tcp   open     ftp           vsftpd 2.3.4
22/tcp   open     ssh           OpenSSH 6.6.1p1 Ubuntu 2ubuntu2.13 (Ubuntu Linux; protocol 2.0)
80/tcp   open     http          Apache httpd 2.4.7 ((Ubuntu))
443/tcp  open     ssl/http      nginx 1.24.0
3306/tcp open     mysql         MySQL 5.5.62
3389/tcp open     ms-wbt-server Microsoft Terminal Services
6379/tcp open     redis         Redis key-value store 6.0.16
8080/tcp filtered http-proxy
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Nmap scan report for 192.0.2.11
Host is up (0.020s latency).
All 1000 scanned ports on 192.0.2.11 are in ignored states.
Nmap done: 2 IP addresses (2 hosts up) scanned in 24.31 seconds`,
  run: ([inp]) => {
    const hosts = parseNmap(need(inp, 'nmap output')); if (!hosts.length) throw new Error('No hosts found. Paste the output of nmap -oN or -oG.');
    const out = []; let openTotal = 0;
    for (const h of hosts) {
      const open = h.ports.filter((p) => /^open/.test(p.state)), other = h.ports.filter((p) => !/^open/.test(p.state)); openTotal += open.length;
      const body = [];
      if (h.os) body.push('OS: ' + h.os); if (h.svcinfo) body.push('Service info: ' + h.svcinfo); if (h.notShown) body.push('Not shown: ' + h.notShown);
      if (open.length) body.push(table(['port', 'state', 'service', 'version'], open.map((p) => [`${p.port}/${p.proto}`, p.state, p.service, p.version])));
      else body.push('No open ports in this output.');
      if (other.length) body.push(`Other states: ${other.map((p) => `${p.port}/${p.proto} ${p.state}`).join(', ')} ("filtered" means a firewall dropped the probes; the port may still be open from other networks)`);
      const notes = [];
      for (const p of open) {
        const r = PORT_RISK[p.port]; if (r) notes.push(`${p.port}/${p.proto} ${r[0]}: ${r[1]}`);
        for (const w of oldVer(p.version)) notes.push(`${p.port}/${p.proto}: ${w}`);
        if (/ssl|tls|https/.test(p.service) === false && /cleartext|ftp|telnet/i.test(p.service) && !r) notes.push(`${p.port}/${p.proto}: cleartext service`);
      }
      if (notes.length) body.push('Notes:\n' + notes.map((n) => '  - ' + n).join('\n'));
      out.push(sec(`${h.addr}${h.name ? ' (' + h.name + ')' : ''}${h.up === false ? ' [down]' : ''}: ${open.length} open`, body.join('\n\n')));
    }
    out.push(`${hosts.length} host${hosts.length > 1 ? 's' : ''}, ${openTotal} open ports. Risk notes are generic hints by port number and banner text, not vulnerability findings: confirm each service and its patch level. Scan only systems you are authorised to test.`);
    return out.join('\n\n');
  },
});

// ====================================================================== anti-bot / WAF signature detector
const ANTIBOT = [
  ['Cloudflare (CDN/WAF)', [[/^server:\s*cloudflare/im, 'Server: cloudflare header'], [/^cf-ray:/im, 'cf-ray header'], [/__cf_bm\b/i, '__cf_bm cookie (Bot Management)'], [/cf_clearance/i, 'cf_clearance cookie (challenge passed)'], [/cdn-cgi\/(challenge-platform|bm)/i, '/cdn-cgi/challenge-platform script'], [/Just a moment\.\.\.|Checking your browser before accessing/i, 'Cloudflare interstitial text']]],
  ['Cloudflare Turnstile', [[/challenges\.cloudflare\.com\/turnstile/i, 'Turnstile script'], [/cf-turnstile/i, 'cf-turnstile widget']]],
  ['Akamai (Bot Manager)', [[/\b_abck\b/, '_abck cookie'], [/\bak_bmsc\b|\bbm_sz\b|\bbm_sv\b|\bbm_mi\b/, 'Akamai bot cookies'], [/^x-akamai[-\w]*:/im, 'x-akamai-* header'], [/^server:\s*akamaighost/im, 'Server: AkamaiGHost'], [/akamai(?:ized)?\.net|akstat\.io|go-mpulse\.net/i, 'Akamai host names']]],
  ['DataDome', [[/\bdatadome\b/i, 'datadome cookie or script'], [/^x-datadome[-\w]*:/im, 'x-datadome header'], [/js\.datadome\.co|captcha-delivery\.com/i, 'DataDome script/captcha host']]],
  ['HUMAN / PerimeterX', [[/\b_px(?:2|3|hd|vid|ff|defend|cvid)?\b/i, '_px* cookie'], [/perimeterx\.net|px-cdn\.net|px-cloud\.net|px-client\.net/i, 'PerimeterX host'], [/px-captcha|Press & Hold|Press and Hold/i, 'px-captcha / press-and-hold challenge'], [/humansecurity\.com/i, 'HUMAN Security host']]],
  ['Imperva / Incapsula', [[/incap_ses_|visid_incap_|\bnlbi_\d+/i, 'Incapsula cookies'], [/^x-iinfo:|^x-cdn:\s*imperva/im, 'x-iinfo / x-cdn header'], [/_Incapsula_Resource/i, '_Incapsula_Resource script']]],
  ['Kasada', [[/^x-kpsdk-[-\w]*:/im, 'x-kpsdk-* header'], [/\/ips\.js|KPSDK|kasada/i, 'Kasada script (ips.js)']]],
  ['F5 / Shape Security', [[/\bTS[0-9a-f]{6,}\b=|BIGipServer|\bf5_cspm\b|\bf5avr/i, 'F5 BIG-IP / TS cookies'], [/shapesecurity|\/_imp_apg_r_/i, 'Shape Security markers']]],
  ['AWS WAF', [[/^x-amzn-waf-[-\w]*:|aws-waf-token|awswaf/im, 'AWS WAF header/token'], [/x-amzn-requestid.*403|Request blocked\. We can't connect to the server/i, 'CloudFront/WAF block text']]],
  ['Sucuri', [[/^x-sucuri-(id|cache):/im, 'x-sucuri-* header'], [/sucuri\.net|Access Denied - Sucuri Website Firewall/i, 'Sucuri firewall page']]],
  ['Fastly (CDN)', [[/^x-served-by:\s*cache-|^fastly-[-\w]*:|^x-fastly-[-\w]*:/im, 'Fastly headers']]],
  ['Vercel Firewall / Attack Challenge', [[/^x-vercel-mitigated:|^x-vercel-challenge-token/im, 'x-vercel-mitigated header'], [/Vercel Security Checkpoint/i, 'Vercel checkpoint page']]],
  ['Google reCAPTCHA', [[/google\.com\/recaptcha|g-recaptcha|recaptcha\/(?:api|enterprise)\.js/i, 'reCAPTCHA script or widget']]],
  ['hCaptcha', [[/hcaptcha\.com|h-captcha/i, 'hCaptcha script or widget']]],
  ['Arkose Labs (FunCaptcha)', [[/arkoselabs\.com|funcaptcha|client-api\.arkoselabs/i, 'Arkose / FunCaptcha']]],
  ['GeeTest', [[/geetest\.com|gt_captcha|geetest_/i, 'GeeTest']]],
  ['Wordfence / WordPress firewall', [[/Wordfence|wfvt_\d+|wordfence_verifiedHuman/i, 'Wordfence']]],
  ['ModSecurity (generic WAF)', [[/mod_security|ModSecurity|NOYB/i, 'ModSecurity text'], [/406 Not Acceptable.*mod_security/is, 'ModSecurity 406 page']]],
];
T.push({
  id: 'antibot-waf-detector', cat: SEOT, title: 'Anti-bot and WAF Detector (from Pasted Headers, Cookies and HTML)',
  desc: 'Paste response headers, cookies and page source and see which bot protection, WAF or CAPTCHA the site uses: Cloudflare, Akamai, DataDome, HUMAN, Imperva, Kasada, reCAPTCHA, hCaptcha and more.',
  inputs: 1, labels: ['Response headers, Set-Cookie lines and/or HTML source'], placeholder: ['HTTP/2 403\nserver: cloudflare\ncf-ray: 8a1b...\nset-cookie: __cf_bm=...'],
  sample: `HTTP/2 403
date: Fri, 23 Oct 2026 08:00:00 GMT
content-type: text/html; charset=UTF-8
server: cloudflare
cf-ray: 8a1b2c3d4e5f6a7b-AMS
cf-mitigated: challenge
set-cookie: __cf_bm=abc123; path=/; expires=Fri, 23-Oct-26 08:30:00 GMT; HttpOnly; Secure
set-cookie: datadome=xyz; Max-Age=31536000; Domain=.example.com

<title>Just a moment...</title>
<script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script>
<div class="g-recaptcha" data-sitekey="abc"></div>`,
  run: ([inp]) => {
    const t = need(inp, 'headers, cookies or HTML'); const found = [];
    for (const [name, sigs] of ANTIBOT) { const ev = sigs.filter(([re]) => re.test(t)).map(([, w]) => w); if (ev.length) found.push([name, ev]); }
    const out = [];
    const status = /^HTTP\/[\d.]+\s+(\d{3})/m.exec(t)?.[1];
    if (status) out.push(`HTTP status in the paste: ${status}${/^(403|429|503)$/.test(status) ? ' (typical for a block, rate limit or challenge page)' : ''}`);
    if (/cf-mitigated:\s*challenge/i.test(t)) out.push('cf-mitigated: challenge means Cloudflare served a challenge instead of the page.');
    out.push(found.length ? sec(`Detected (${found.length})`, found.map(([n, ev]) => `${n}\n${ev.map((e) => '    evidence: ' + e).join('\n')}`).join('\n')) : 'No known anti-bot, WAF or CAPTCHA signature found in this text. The paste may be incomplete: include Set-Cookie headers and the page head.');
    out.push('Signatures are public markers (header, cookie and script names); a vendor can be present without them being visible in this response, and a match shows a product is deployed, not how it is configured. For authorised testing and auditing of your own sites.');
    return out.join('\n\n');
  },
});

// ====================================================================== IP address offline lookup
const SPECIAL4 = [
  ["0.0.0.0/8","This network","RFC 791",0,0],
  ["0.0.0.0/32","This host on this network","RFC 1122",0,0],
  ["10.0.0.0/8","Private-Use","RFC 1918",1,0],
  ["100.64.0.0/10","Shared Address Space","RFC 6598",1,0],
  ["127.0.0.0/8","Loopback","RFC 1122",0,0],
  ["169.254.0.0/16","Link Local","RFC 3927",0,0],
  ["172.16.0.0/12","Private-Use","RFC 1918",1,0],
  ["192.0.0.0/24","IETF Protocol Assignments","RFC 6890",0,0],
  ["192.0.0.0/29","IPv4 Service Continuity Prefix","RFC 7335",1,0],
  ["192.0.0.8/32","IPv4 dummy address","RFC 7600",0,0],
  ["192.0.0.9/32","Port Control Protocol Anycast","RFC 7723",1,1],
  ["192.0.0.10/32","Traversal Using Relays around NAT Anycast","RFC 8155",1,1],
  ["192.0.0.170/32|192.0.0.171/32","NAT64/DNS64 Discovery","RFC 8880",0,0],
  ["192.0.2.0/24","Documentation (TEST-NET-1)","RFC 5737",0,0],
  ["192.31.196.0/24","AS112-v4","RFC 7535",1,1],
  ["192.52.193.0/24","AMT","RFC 7450",1,1],
  ["192.88.99.0/24","Deprecated (6to4 Relay Anycast)","RFC 7526",0,0],
  ["192.88.99.2/32","6a44-relay anycast address","RFC 6751",1,0],
  ["192.168.0.0/16","Private-Use","RFC 1918",1,0],
  ["192.175.48.0/24","Direct Delegation AS112 Service","RFC 7534",1,1],
  ["198.18.0.0/15","Benchmarking","RFC 2544",1,0],
  ["198.51.100.0/24","Documentation (TEST-NET-2)","RFC 5737",0,0],
  ["203.0.113.0/24","Documentation (TEST-NET-3)","RFC 5737",0,0],
  ["240.0.0.0/4","Reserved","RFC 1112",0,0],
  ["255.255.255.255/32","Limited Broadcast","RFC 8190",0,0]];
const SPECIAL6 = [
  ["::1/128","Loopback Address","RFC 4291",0,0],
  ["::/128","Unspecified Address","RFC 4291",0,0],
  ["::ffff:0:0/96","IPv4-mapped Address","RFC 4291",0,0],
  ["64:ff9b::/96","IPv4-IPv6 Translat.","RFC 6052",1,1],
  ["64:ff9b:1::/48","IPv4-IPv6 Translat.","RFC 8215",1,0],
  ["100::/64","Discard-Only Address Block","RFC 6666",1,0],
  ["100:0:0:1::/64","Dummy IPv6 Prefix","RFC 9780",0,0],
  ["2001::/23","IETF Protocol Assignments","RFC 2928",0,0],
  ["2001::/32","TEREDO","RFC 4380",1,0],
  ["2001:1::1/128","Port Control Protocol Anycast","RFC 7723",1,1],
  ["2001:1::2/128","Traversal Using Relays around NAT Anycast","RFC 8155",1,1],
  ["2001:1::3/128","DNS-SD Service Registration Protocol Anycast","RFC 9665",1,1],
  ["2001:2::/48","Benchmarking","RFC 5180",1,0],
  ["2001:3::/32","AMT","RFC 7450",1,1],
  ["2001:4:112::/48","AS112-v6","RFC 7535",1,1],
  ["2001:10::/28","Deprecated (previously ORCHID)","RFC 4843",0,0],
  ["2001:20::/28","ORCHIDv2","RFC 7343",1,1],
  ["2001:30::/28","Drone Remote ID Protocol Entity Tags (DETs) Prefix","RFC 9374",1,1],
  ["2001:db8::/32","Documentation","RFC 3849",0,0],
  ["2002::/16","6to4","RFC 3056",1,0],
  ["2620:4f:8000::/48","Direct Delegation AS112 Service","RFC 7534",1,1],
  ["3fff::/20","Documentation","RFC 9637",0,0],
  ["5f00::/16","Segment Routing (SRv6) SIDs","RFC 9602",1,0],
  ["fc00::/7","Unique-Local","RFC 4193",1,0],
  ["fe80::/10","Link-Local Unicast","RFC 4291",0,0]];
function parseIPv4(s) { const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s); if (!m || m.slice(1).some((x) => +x > 255 || (x.length > 1 && x[0] === '0'))) return null; return (BigInt(m[1]) << 24n) | (BigInt(m[2]) << 16n) | (BigInt(m[3]) << 8n) | BigInt(m[4]); }
function parseIPv6(s) {
  s = s.replace(/^\[|\]$/g, '').replace(/%.*$/, ''); if (!/^[0-9a-fA-F:.]+$/.test(s) || !s.includes(':')) return null;
  let tail = null; const m4 = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (m4) { const v = parseIPv4(m4[2]); if (v === null) return null; s = m4[1] + (Number(v >> 16n)).toString(16) + ':' + (Number(v & 0xffffn)).toString(16); }
  const parts = s.split('::'); if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [], rest = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  if (parts.length === 1 && head.length !== 8) return null; if (parts.length === 2 && head.length + rest.length > 7) return null;
  const g = [...head, ...Array(parts.length === 2 ? 8 - head.length - rest.length : 0).fill('0'), ...rest];
  let v = 0n; for (const x of g) { if (!/^[0-9a-fA-F]{1,4}$/.test(x)) return null; v = (v << 16n) | BigInt('0x' + x); } return v;
}
const v6str = (v) => { // RFC 5952
  const g = []; for (let i = 7; i >= 0; i--) g.push(Number((v >> BigInt(i * 16)) & 0xffffn));
  let best = -1, bl = 0; for (let i = 0; i < 8;) { if (g[i] === 0) { let j = i; while (j < 8 && g[j] === 0) j++; if (j - i > bl && j - i > 1) { best = i; bl = j - i; } i = j; } else i++; }
  const h = g.map((x) => x.toString(16)); return best < 0 ? h.join(':') : h.slice(0, best).join(':') + '::' + h.slice(best + bl).join(':');
};
const v4str = (v) => [24n, 16n, 8n, 0n].map((s) => Number((v >> s) & 255n)).join('.');
function inCidr(v, cidr, bits) { const [a, l] = cidr.split('/'), base = bits === 32 ? parseIPv4(a) : parseIPv6(a), sh = BigInt(bits - +l); return base !== null && (v >> sh) === (base >> sh); }
function classify(v, ver) {
  const bits = ver === 4 ? 32 : 128, table = ver === 4 ? SPECIAL4 : SPECIAL6; let best = null, bl = -1;
  for (const r of table) for (const b of r[0].split('|')) if (inCidr(v, b, bits) && +b.split('/')[1] > bl) { best = r; bl = +b.split('/')[1]; }
  if (best) return { name: best[1], rfc: best[2], fwd: !!best[3], global: !!best[4] };
  if (ver === 4 && (v >> 28n) === 14n) return { name: 'Multicast', rfc: 'RFC 5771', fwd: true, global: true, multicast: true };
  if (ver === 6 && (v >> 120n) === 255n) return { name: 'Multicast', rfc: 'RFC 4291', fwd: true, global: false, multicast: true };
  if (ver === 6 && (v >> 125n) !== 1n) return { name: 'Not in the global unicast range 2000::/3 (reserved by IANA)', rfc: 'RFC 4291', fwd: false, global: false };
  return null;
}
let ipDB;
async function ipCountryDB() {
  if (ipDB) return ipDB;
  let buf;
  const url = new URL('../../data/ip-country.bin', import.meta.url);
  if (typeof window === 'undefined') { const fs = await import('node:fs/promises'); const b = await fs.readFile(url); buf = new Uint8Array(b.buffer, b.byteOffset, b.byteLength); }
  else { const r = await fetch(url); if (!r.ok) throw new Error('Could not load the address-range data (HTTP ' + r.status + ')'); buf = new Uint8Array(await r.arrayBuffer()); }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); if (String.fromCharCode(...buf.subarray(0, 4)) !== 'IPC1') throw new Error('Bad address-range file');
  const date = dv.getUint32(4, true), n4 = dv.getUint32(8, true), n6 = dv.getUint32(12, true), nc = dv.getUint32(16, true); let p = 20;
  const ccs = []; for (let i = 0; i < nc; i++) { ccs.push(String.fromCharCode(buf[p], buf[p + 1])); p += 2; }
  const u32 = (n) => { const a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = dv.getUint32(p + i * 4, true); p += n * 4; return a; }, u8 = (n) => { const a = buf.subarray(p, p + n); p += n; return a; };
  const s4 = u32(n4), e4 = u32(n4), c4 = u8(n4), r4 = u8(n4), hi = u32(n6), lo = u32(n6), pl = u8(n6), c6 = u8(n6), r6 = u8(n6);
  return (ipDB = { date, ccs, s4, e4, c4, r4, hi, lo, pl, c6, r6 });
}
const REGISTRIES = ['AFRINIC', 'APNIC', 'ARIN', 'LACNIC', 'RIPE NCC'];
function countryOf(db, v, ver) {
  if (ver === 4) {
    const x = Number(v); let a = 0, b = db.s4.length - 1, r = -1;
    while (a <= b) { const m = (a + b) >> 1; if (db.s4[m] <= x) { r = m; a = m + 1; } else b = m - 1; }
    return r >= 0 && x <= db.e4[r] ? { cc: db.ccs[db.c4[r]], reg: REGISTRIES[db.r4[r]] } : null;
  }
  const h = Number(v >> 96n), l = Number((v >> 64n) & 0xffffffffn); let a = 0, b = db.hi.length - 1, r = -1;
  const less = (i) => db.hi[i] < h || (db.hi[i] === h && db.lo[i] <= l);
  while (a <= b) { const m = (a + b) >> 1; if (less(m)) { r = m; a = m + 1; } else b = m - 1; }
  // ranges never overlap, but a shorter earlier prefix may contain this one: scan back a few entries
  for (let i = r; i >= 0 && i > r - 4; i--) {
    const start = (BigInt(db.hi[i]) << 96n) | (BigInt(db.lo[i]) << 64n), len = db.pl[i];
    if ((v >> BigInt(128 - len)) === (start >> BigInt(128 - len))) return { cc: db.ccs[db.c6[i]], reg: REGISTRIES[db.r6[i]] };
  }
  return null;
}
const regionName = (cc) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || cc; } catch { return cc; } };
T.push({
  id: 'ip-address-offline-lookup', cat: NET, title: 'IP Address Offline Lookup (Private or Public, Registry Country, PTR Name)',
  desc: 'Classify IPv4 and IPv6 addresses with the IANA special-purpose registries (private, loopback, CGNAT, documentation...), find the registry country from RIR delegation data, and get the reverse DNS name. No lookup is sent.',
  inputs: 1, labels: ['IP addresses, one per line'], placeholder: ['8.8.8.8\n10.0.0.1\n2001:4860:4860::8888'],
  opts: [{ id: 'country', label: 'Look up registry country (downloads a 2 MB table once)', type: 'checkbox', def: true }],
  sample: '8.8.8.8\n1.1.1.1\n10.20.30.40\n100.64.1.1\n127.0.0.1\n169.254.10.5\n192.0.2.55\n224.0.0.251\n193.190.1.1\n2001:4860:4860::8888\n::1\nfe80::1\nfd12:3456:789a::1\n::ffff:192.168.1.1\n2606:4700:4700::1111',
  run: async ([inp], o) => {
    const ips = lines(need(inp, 'IP addresses')).flatMap((l) => l.split(/[\s,;]+/)).filter(Boolean).slice(0, 500);
    let db = null, dbErr = '';
    if (o.country) { try { db = await ipCountryDB(); } catch (e) { dbErr = String(e.message || e); } }
    const out = [];
    for (const s of ips) {
      let ver = 4, v = parseIPv4(s); if (v === null) { v = parseIPv6(s); ver = 6; }
      if (v === null) { out.push(`${s}\n    not a valid IPv4 or IPv6 address`); continue; }
      const c = classify(v, ver), rows = [];
      rows.push(`${ver === 4 ? v4str(v) : v6str(v)}  (IPv${ver})`);
      if (ver === 6 && (v >> 32n) === 0xffffn) rows.push(`    IPv4-mapped; embedded IPv4 ${v4str(v & 0xffffffffn)} ${classify(v & 0xffffffffn, 4)?.name ? '(' + classify(v & 0xffffffffn, 4).name + ')' : '(public)'}`);
      if (ver === 6 && (v >> 112n) === 0x2002n) rows.push(`    6to4 prefix; embedded IPv4 ${v4str((v >> 80n) & 0xffffffffn)}`);
      rows.push(c ? `    category: ${c.name} (${c.rfc}); forwardable beyond its network: ${c.fwd ? 'yes' : 'no'}; globally reachable: ${c.global ? 'yes' : 'no'}${c.multicast ? '; multicast' : ''}` : '    category: global unicast (not in any IANA special-purpose block)');
      if (db && (!c || c.global) && !(c?.multicast)) { const r = countryOf(db, v, ver); rows.push(r ? `    registry country: ${regionName(r.cc)} (${r.cc}), allocated through ${r.reg}` : '    registry country: no allocation found in the table'); }
      if (ver === 4) { const a = v4str(v).split('.').reverse().join('.'); rows.push(`    PTR name: ${a}.in-addr.arpa`); rows.push(`    decimal ${v}  hex 0x${v.toString(16).padStart(8, '0')}`); }
      else { const h = v.toString(16).padStart(32, '0'); rows.push(`    PTR name: ${[...h].reverse().join('.')}.ip6.arpa`); rows.push(`    expanded ${h.match(/.{4}/g).join(':')}`); }
      out.push(rows.join('\n'));
    }
    out.push(dbErr ? `Country table not loaded: ${dbErr}` : db ? `Registry country comes from the five RIR delegation files dated ${String(db.date).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3')}. It is the country the block was registered to, not where the device is: cloud, CDN, VPN and mobile addresses are often elsewhere, and transferred blocks can lag. Accuracy at country level is limited and no city or ISP is available offline.` : 'Registry country lookup is off.');
    return out.join('\n\n');
  },
});

// ====================================================================== browser-API-only viewers (nothing leaves the page)
function kvTable(rows, caption) {
  const t = el('table', { className: 'g5-kv' }); if (caption) t.append(el('caption', {}, caption));
  t.append(el('tbody', {}, ...rows.map(([k, v]) => el('tr', {}, el('th', { scope: 'row' }, k), el('td', {}, String(v))))));
  return t;
}
const fmtDur = (s) => (s === Infinity || s == null || Number.isNaN(s) ? 'unknown' : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`);

T.push({
  id: 'network-connection-info', cat: DEV, title: 'Network Connection Info (Online, Speed Class, Data Saver)',
  desc: 'See what your browser reports about its connection: online status, effective connection type, estimated downlink and round-trip time, data-saver mode, and live changes. Uses the Network Information API; nothing is sent.',
  custom: true, dom: true,
  render(root) {
    const box = el('div'), log = el('ul', { className: 'g5-log' }), status = el('p', { className: 'status', role: 'status' });
    const btn = el('button', { type: 'button' }, 'Refresh');
    root.append(el('div', { className: 'row' }, btn), status, box, el('h2', {}, 'Change log'), log);
    const c = () => navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const draw = () => {
      const k = c(), rows = [['Online (navigator.onLine)', navigator.onLine ? 'yes' : 'no']];
      if (k) rows.push(['Effective type', k.effectiveType ?? 'n/a'], ['Estimated downlink', k.downlink != null ? k.downlink + ' Mbit/s' : 'n/a'], ['Estimated round-trip time', k.rtt != null ? k.rtt + ' ms' : 'n/a'], ['Data saver (saveData)', k.saveData == null ? 'n/a' : k.saveData ? 'on' : 'off'], ['Connection type', k.type ?? 'not reported (desktop browsers usually omit it)']);
      else rows.push(['Network Information API', 'not available in this browser (Chrome and Edge have it; Firefox and Safari do not)']);
      rows.push(['Logical CPU cores', navigator.hardwareConcurrency ?? 'n/a'], ['Device memory (rounded)', navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'n/a'], ['Prefers reduced data', matchMedia('(prefers-reduced-data: reduce)').matches ? 'yes' : 'no'], ['Languages', (navigator.languages || [navigator.language]).join(', ')], ['Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone]);
      box.replaceChildren(kvTable(rows, 'Values reported by this browser'), el('p', { className: 'desc' }, 'The browser rounds and caps these values on purpose (privacy), so downlink and round-trip time are coarse estimates, not a speed test. Public IP address, ISP and real throughput need a request to a server and are not part of this offline tool.'));
    };
    const note = (m) => { log.prepend(el('li', {}, `${new Date().toLocaleTimeString()}: ${m}`)); while (log.children.length > 30) log.lastChild.remove(); status.textContent = m; };
    btn.addEventListener('click', () => { draw(); status.textContent = 'Refreshed'; });
    addEventListener('online', () => { draw(); note('browser went online'); }); addEventListener('offline', () => { draw(); note('browser went offline'); });
    c()?.addEventListener?.('change', () => { draw(); const k = c(); note(`connection changed: ${k.effectiveType}, ${k.downlink} Mbit/s, ${k.rtt} ms`); });
    draw();
  },
});

T.push({
  id: 'battery-status-viewer', cat: DEV, title: 'Battery Status Viewer (Level, Charging, Time Left)',
  desc: 'Read your device battery level, charging state and the browser\'s estimate of time to full or empty through the Battery Status API, with live updates. Runs locally; works in Chromium browsers.',
  custom: true, dom: true,
  render(root) {
    const box = el('div'), status = el('p', { className: 'status', role: 'status' }); root.append(status, box);
    if (!navigator.getBattery) { box.append(el('p', { role: 'alert', className: 'err' }, 'The Battery Status API is not available in this browser. Chrome, Edge and Opera support it; Firefox and Safari removed or never shipped it for privacy reasons.')); return; }
    navigator.getBattery().then((b) => {
      const draw = () => {
        const lvl = Math.round(b.level * 100), meter = el('meter', { min: 0, max: 100, value: lvl, low: 20, high: 80, optimum: 100, 'aria-label': 'Battery level' });
        box.replaceChildren(meter, kvTable([['Level', lvl + '%'], ['Charging', b.charging ? 'yes' : 'no'], ['Time until full', b.charging ? fmtDur(b.chargingTime) : 'not charging'], ['Time until empty', !b.charging ? fmtDur(b.dischargingTime) : 'charging'], ['Status', lvl <= 15 && !b.charging ? 'low: plug in soon' : 'fine']], 'Battery'), el('p', { className: 'desc' }, 'Time estimates come from the browser and may read "unknown" for a while after a change. Desktop computers without a battery usually report 100% and charging.'));
        status.textContent = `Battery ${lvl}%, ${b.charging ? 'charging' : 'on battery'}`;
      };
      ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'].forEach((e) => b.addEventListener(e, draw)); draw();
    }, (e) => box.append(el('p', { role: 'alert', className: 'err' }, 'Battery information was blocked: ' + (e?.message || e))));
  },
});

const PERMS = ['geolocation', 'notifications', 'push', 'camera', 'microphone', 'clipboard-read', 'clipboard-write', 'midi', 'persistent-storage', 'screen-wake-lock', 'accelerometer', 'gyroscope', 'magnetometer', 'ambient-light-sensor', 'background-sync', 'display-capture', 'local-fonts', 'window-management', 'storage-access', 'payment-handler', 'idle-detection', 'compute-pressure', 'speaker-selection'];
T.push({
  id: 'browser-permissions-viewer', cat: BRO, title: 'Browser Permissions Viewer (What This Site Is Allowed To Do)',
  desc: 'List the state of every browser permission for this site (location, camera, microphone, notifications, clipboard, sensors, MIDI...) using the Permissions API, without asking for anything. Updates live.',
  custom: true, dom: true,
  render(root) {
    const body = el('tbody'), status = el('p', { className: 'status', role: 'status' });
    const t = el('table', {}, el('caption', {}, 'Permission state for this site'), el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Permission'), el('th', { scope: 'col' }, 'State'), el('th', { scope: 'col' }, 'Meaning'))), body);
    root.append(status, t);
    const meaning = { granted: 'Allowed without asking.', denied: 'Blocked. Change it in the site settings (padlock icon).', prompt: 'The browser will ask when a page first uses it.', unsupported: 'This browser does not know this permission name.' };
    if (!navigator.permissions?.query) { status.textContent = ''; root.append(el('p', { role: 'alert', className: 'err' }, 'The Permissions API is not available in this browser.')); return; }
    let n = { granted: 0, denied: 0, prompt: 0, unsupported: 0 };
    Promise.all(PERMS.map(async (name) => {
      const tr = el('tr'), st = el('td'), me = el('td'); tr.append(el('th', { scope: 'row' }, name), st, me); body.append(tr);
      const set = (s) => { st.textContent = s; me.textContent = meaning[s]; };
      try { const p = await navigator.permissions.query(name === 'camera' || name === 'microphone' ? { name } : name === 'clipboard-read' ? { name, allowWithoutGesture: false } : { name }); set(p.state); n[p.state] = (n[p.state] || 0) + 1; p.addEventListener('change', () => { set(p.state); status.textContent = `${name} is now ${p.state}`; }); }
      catch { set('unsupported'); n.unsupported++; }
    })).then(() => { status.textContent = `${n.granted} granted, ${n.denied} denied, ${n.prompt} ask, ${n.unsupported} not supported by this browser`; });
    root.append(el('p', { className: 'desc' }, 'This only reads the current state; it never requests a permission. States are per site and per browser profile, and a private window starts with none granted.'));
  },
});

T.push({
  id: 'media-devices-viewer', cat: DEV, title: 'Camera, Microphone and Speaker Viewer (Media Devices)',
  desc: 'List the cameras, microphones and speakers your browser exposes and the media constraints it supports. Device names stay hidden until you grant access; no audio or video is recorded or sent.',
  custom: true, dom: true,
  render(root) {
    const out = el('div'), status = el('p', { className: 'status', role: 'status' });
    const b1 = el('button', { type: 'button' }, 'List devices'), b2 = el('button', { type: 'button' }, 'Allow camera and microphone to show device names');
    root.append(el('div', { className: 'row' }, b1, b2), status, out);
    if (!navigator.mediaDevices?.enumerateDevices) { out.append(el('p', { role: 'alert', className: 'err' }, 'Media devices are not available here (they need a secure HTTPS page and a supporting browser).')); return; }
    const list = async () => {
      const ds = await navigator.mediaDevices.enumerateDevices(), kinds = { videoinput: 'Cameras', audioinput: 'Microphones', audiooutput: 'Speakers / outputs' };
      out.replaceChildren();
      for (const [k, title] of Object.entries(kinds)) {
        const items = ds.filter((d) => d.kind === k);
        out.append(el('h2', {}, `${title} (${items.length})`), items.length ? el('ul', {}, ...items.map((d, i) => el('li', {}, d.label || `${title.replace(/s.*$/, '')} ${i + 1} (name hidden until permission is granted)`, d.deviceId ? el('span', { className: 'desc' }, ` id ${d.deviceId.slice(0, 8)}...`) : ''))) : el('p', {}, 'none found'));
      }
      const sc = navigator.mediaDevices.getSupportedConstraints?.() || {};
      out.append(el('h2', {}, 'Supported constraints'), el('p', {}, Object.keys(sc).filter((x) => sc[x]).join(', ') || 'unknown'));
      status.textContent = `${ds.length} devices listed`;
    };
    b1.addEventListener('click', () => list().catch((e) => { status.textContent = ''; out.replaceChildren(el('p', { role: 'alert', className: 'err' }, String(e.message || e))); }));
    b2.addEventListener('click', async () => {
      try { const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); s.getTracks().forEach((t) => t.stop()); await list(); status.textContent += ' (access released again)'; }
      catch (e) { out.replaceChildren(el('p', { role: 'alert', className: 'err' }, 'Access was not granted: ' + (e.name || '') + ' ' + (e.message || ''))); }
    });
    list().catch(() => {});
  },
});

T.push({
  id: 'clipboard-inspector', cat: DEV, title: 'Clipboard Inspector (Formats, HTML and Files You Paste)',
  desc: 'Paste anything into the box and see every format the clipboard carried: plain text, HTML source, rich text, images and files, with sizes. Useful for debugging copy and paste. Runs locally.',
  custom: true, dom: true,
  render(root) {
    const ta = el('div', { contentEditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Paste here (Ctrl+V or Cmd+V)', tabIndex: 0, style: 'min-height:6rem;border:2px dashed var(--border, currentColor);padding:.75rem;border-radius:.5rem' });
    const out = el('div'), status = el('p', { className: 'status', role: 'status' }), rd = el('button', { type: 'button' }, 'Read the clipboard with a button (the browser may ask permission)');
    root.append(el('p', {}, 'Click the box, then paste with Ctrl+V or Cmd+V.'), ta, el('div', { className: 'row' }, rd), status, out);
    const show = (rows, files) => {
      out.replaceChildren(el('h2', {}, `Formats (${rows.length})`), rows.length ? simpleTable(['Format', 'Size', 'Content (first 2000 characters)'], rows.map(([t, s, c]) => [t, s, c])) : el('p', {}, 'The clipboard was empty.'));
      if (files.length) out.append(el('h2', {}, `Files and images (${files.length})`), simpleTable(['Name', 'Type', 'Size'], files.map((f) => [f.name || '(unnamed)', f.type || 'unknown', `${f.size} bytes`])));
      status.textContent = `${rows.length} formats, ${files.length} files`;
    };
    ta.addEventListener('paste', (e) => {
      e.preventDefault(); const dt = e.clipboardData, rows = [...dt.types].filter((t) => t !== 'Files').map((t) => { const d = dt.getData(t); return [t, d.length + ' characters', d.slice(0, 2000)]; });
      show(rows, [...dt.files]);
    });
    rd.addEventListener('click', async () => {
      try {
        const items = await navigator.clipboard.read(), rows = [], files = [];
        for (const it of items) for (const t of it.types) { const b = await it.getType(t); if (/^text\//.test(t)) { const s = await b.text(); rows.push([t, s.length + ' characters', s.slice(0, 2000)]); } else files.push({ name: '', type: t, size: b.size }); }
        show(rows, files);
      } catch (e) { out.replaceChildren(el('p', { role: 'alert', className: 'err' }, 'Could not read the clipboard: ' + (e.message || e) + '. Use the paste box instead.')); }
    });
  },
});

// ====================================================================== tax / company ID check-digit validator
const md = (a, m) => ((a % m) + m) % m;
const isD = (s, n) => /^\d+$/.test(s) && (n == null || s.length === n);
const dsum = (s, w) => [...s].reduce((a, c, i) => a + w[i] * +c, 0);
const luhnSum = (s) => [...s].reverse().reduce((a, c, i) => { let d = +c; if (i % 2) { d *= 2; if (d > 9) d -= 9; } return a + d; }, 0) % 10;
function mod1110(s) { let p = 5; for (const c of s) p = ((((p || 10) * 2) % 11) + +c) % 10; return p === 1; } // ISO 7064 mod 11,10 (hybrid system)
function rcValid(n) { // Czech/Slovak birth number (rodne cislo): embedded date plus mod 11 for 10 digits
  if (!isD(n) || (n.length !== 9 && n.length !== 10)) return false;
  let y = 1900 + +n.slice(0, 2); const mo = +n.slice(2, 4) % 50 % 20, d = +n.slice(4, 6);
  if (n.length === 9) { if (y >= 1980) y -= 100; if (y > 1953) return false; } else if (y < 1954) y += 100;
  const dt = new Date(Date.UTC(y, mo - 1, d)); if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
  return n.length === 9 || +n.slice(0, 9) % 11 % 10 === +n[9];
}
const DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
const IE_ALPHA = 'WABCDEFGHIJKLMNOPQRSTUV';
function mod97(str) { let r = 0; for (const ch of str.toUpperCase()) { const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55); for (const c of v) r = (r * 10 + +c) % 97; } return r; }
const TAXIDS = {
  AT: ['Austria VAT (UID)', (n) => (/^U\d{8}$/.test(n) ? md(6 - luhnSum(n.slice(1, 8)), 10) === +n[8] : null)],
  BE: ['Belgium VAT / enterprise number', (n) => { if (n.length === 9) n = '0' + n; return isD(n, 10) && /^[01]/.test(n) ? 97 - (+n.slice(0, 8) % 97) === +n.slice(8) : null; }],
  BG: ['Bulgaria VAT', (n) => (isD(n, 9) || isD(n, 10) ? 'format' : null)],
  CY: ['Cyprus VAT', (n) => (/^\d{8}[A-Z]$/.test(n) ? 'format' : null)],
  CZ: ['Czech Republic VAT (DIC)', (n) => { if (isD(n, 8)) { const c = md(11 - dsum(n.slice(0, 7), [8, 7, 6, 5, 4, 3, 2]), 11); return n[0] !== '9' && (c || 1) % 10 === +n[7]; } if (isD(n, 9) && n[0] === '6') return md(8 - md(10 - dsum(n.slice(1, 8), [8, 7, 6, 5, 4, 3, 2]) % 11, 11), 10) === +n[8]; return isD(n, 9) || isD(n, 10) ? rcValid(n) : null; }],
  DE: ['Germany VAT (USt-IdNr)', (n) => (isD(n, 9) && n[0] !== '0' ? mod1110(n) : null)],
  DK: ['Denmark VAT (CVR)', (n) => (isD(n, 8) && n[0] !== '0' ? dsum(n, [2, 7, 6, 5, 4, 3, 2, 1]) % 11 === 0 : null)],
  EE: ['Estonia VAT (KMKR)', (n) => (isD(n, 9) ? dsum(n, [3, 7, 1, 3, 7, 1, 3, 7, 1]) % 10 === 0 : null)],
  EL: ['Greece VAT (AFM)', (n) => (isD(n, 9) ? ([...n.slice(0, 8)].reduce((a, c, i) => a + +c * 2 ** (8 - i), 0) % 11) % 10 === +n[8] : null)],
  ES: ['Spain NIF / NIE / CIF', (n) => {
    if (!/^[A-Z0-9]\d{7}[A-Z0-9]$/.test(n)) return null;
    if (/^\d/.test(n)) return DNI[+n.slice(0, 8) % 23] === n[8];
    if ('KLM'.includes(n[0])) return DNI[+n.slice(1, 8) % 23] === n[8];
    if ('XYZ'.includes(n[0])) return DNI[+('XYZ'.indexOf(n[0]) + n.slice(1, 8)) % 23] === n[8];
    if (!/^[A-HJNP-SUVW]/.test(n) || !isD(n.slice(1, 8), 7)) return false;
    const c = (10 - luhnSum(n.slice(1, 8) + '0') % 10) % 10, L = 'JABCDEFGHI'[c];
    return 'PQRSNW'.includes(n[0]) ? n[8] === L : 'ABEH'.includes(n[0]) ? n[8] === String(c) : n[8] === String(c) || n[8] === L;
  }],
  FI: ['Finland VAT (ALV)', (n) => { if (!isD(n, 8)) return null; const s = dsum(n.slice(0, 7), [7, 9, 10, 5, 8, 4, 2]) % 11; const c = s === 0 ? 0 : 11 - s; return c < 10 && c === +n[7]; }],
  FR: ['France VAT (TVA)', (n) => { if (/^\d{11}$/.test(n)) return (12 + 3 * (+n.slice(2) % 97)) % 97 === +n.slice(0, 2) && luhnSum(n.slice(2)) === 0; return /^[A-Z0-9]{2}\d{9}$/.test(n) ? 'format' : null; }],
  HR: ['Croatia VAT / OIB', (n) => (isD(n, 11) ? mod1110(n) : null)],
  HU: ['Hungary VAT', (n) => (isD(n, 8) ? dsum(n, [9, 7, 3, 1, 9, 7, 3, 1]) % 10 === 0 : null)],
  IE: ['Ireland VAT', (n) => {
    if (/^\d{7}[A-W][A-I]?$/.test(n)) return n[7] === IE_ALPHA[(dsum(n.slice(0, 7), [8, 7, 6, 5, 4, 3, 2]) + 9 * (n.length === 9 ? IE_ALPHA.indexOf(n[8]) : 0)) % 23];
    if (/^\d[A-Z+*]\d{5}[A-W]$/.test(n)) return n[7] === IE_ALPHA[dsum('0' + n.slice(2, 7) + n[0], [8, 7, 6, 5, 4, 3, 2]) % 23];
    return null;
  }],
  IT: ['Italy VAT (Partita IVA)', (n) => { if (!isD(n, 11) || +n.slice(0, 7) === 0) return null; const o = n.slice(7, 10); return (('001' <= o && o <= '100') || ['120', '121', '888', '999'].includes(o)) && luhnSum(n) === 0; }],
  LT: ['Lithuania VAT', (n) => { if (!(isD(n, 9) && n[7] === '1') && !(isD(n, 12) && n[10] === '1')) return null; const b = n.slice(0, -1); let c = [...b].reduce((a, d, i) => a + (1 + i % 9) * +d, 0) % 11; if (c === 10) c = [...b].reduce((a, d, i) => a + (1 + (i + 2) % 9) * +d, 0); return String(c % 11 % 10) === n.slice(-1); }],
  LU: ['Luxembourg VAT', (n) => (isD(n, 8) ? +n.slice(0, 6) % 89 === +n.slice(6) : null)],
  LV: ['Latvia VAT', (n) => (isD(n, 11) ? (n[0] > '3' ? dsum(n, [9, 1, 4, 8, 3, 10, 2, 5, 7, 6, 1]) % 11 === 3 : 'format') : null)],
  MT: ['Malta VAT', (n) => (isD(n, 8) && n[0] !== '0' ? dsum(n, [3, 4, 6, 7, 8, 9, 10, 1]) % 37 === 0 : null)],
  NL: ['Netherlands VAT (BTW)', (n) => { if (!/^\d{9}B\d{2}$/.test(n) || +n.slice(10) === 0) return null; const bsn = n.slice(0, 9); return (+bsn > 0 && (dsum(bsn.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) - +bsn[8]) % 11 === 0) || mod97('NL' + n) === 1; }],
  PL: ['Poland VAT (NIP)', (n) => (isD(n, 10) ? dsum(n, [6, 5, 7, 2, 3, 4, 5, 6, 7, -1]) % 11 === 0 : null)],
  PT: ['Portugal VAT (NIF)', (n) => (isD(n, 9) && n[0] !== '0' ? md(11 - dsum(n.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]), 11) % 10 === +n[8] : null)],
  RO: ['Romania VAT (CUI)', (n) => { if (!isD(n) || n[0] === '0') return null; if (n.length === 13) return 'format'; if (n.length < 2 || n.length > 10) return null; const b = n.slice(0, -1).padStart(9, '0'); return (10 * dsum(b, [7, 5, 3, 2, 1, 7, 5, 3, 2])) % 11 % 10 === +n.slice(-1); }],
  SE: ['Sweden VAT', (n) => (/^\d{10}01$/.test(n) ? luhnSum(n.slice(0, 10)) === 0 : null)],
  SI: ['Slovenia VAT', (n) => { if (!isD(n, 8) || n[0] === '0') return null; let c = 11 - (dsum(n.slice(0, 7), [8, 7, 6, 5, 4, 3, 2]) % 11); return String(c === 10 ? 0 : c) === n[7]; }],
  SK: ['Slovakia VAT (DPH)', (n) => (isD(n, 10) ? rcValid(n) || (n[0] !== '0' && [2, 3, 4, 7, 8, 9].includes(+n[2]) && BigInt(n) % 11n === 0n) : null)],
  CHE: ['Switzerland UID / VAT', (n) => { const m = /^(\d{9})(?:MWST|TVA|IVA|TPV)?$/.exec(n); if (!m) return null; const c = md(11 - dsum(m[1].slice(0, 8), [5, 4, 3, 2, 7, 6, 5, 4]), 11); return c < 10 && String(c) === m[1][8]; }],
  NO: ['Norway organisation number', (n) => { const m = /^(\d{9})(?:MVA)?$/.exec(n); return m ? dsum(m[1], [3, 2, 7, 6, 5, 4, 3, 2, 1]) % 11 === 0 : null; }],
  ABN: ['Australia ABN', (n) => (isD(n, 11) ? 11 + md(-dsum(n.slice(2), [3, 5, 7, 9, 11, 13, 15, 17, 19]) - 1, 89) === +n.slice(0, 2) : null)],
  ACN: ['Australia ACN', (n) => (isD(n, 9) ? (10 - (dsum(n.slice(0, 8), [8, 7, 6, 5, 4, 3, 2, 1]) % 10)) % 10 === +n[8] : null)],
  TFN: ['Australia TFN', (n) => ((isD(n, 8) || isD(n, 9)) ? dsum(n, [1, 4, 3, 7, 5, 8, 6, 9, 10]) % 11 === 0 : null)],
  CPF: ['Brazil CPF', (n) => { if (!isD(n, 11) || +n === 0) return null; const d1 = md(11 - dsum(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]), 11) % 10, d2 = md(11 - (dsum(n.slice(0, 9), [11, 10, 9, 8, 7, 6, 5, 4, 3]) + 2 * d1), 11) % 10; return +n.slice(9) === d1 * 10 + d2; }],
  CNPJ: ['Brazil CNPJ', (n) => { if (!isD(n, 14) || n.startsWith('000000000000')) return null; const d1 = md(11 - dsum(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]), 11) % 10, d2 = md(11 - dsum(n.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]), 11) % 10; return +n.slice(12) === d1 * 10 + d2; }],
};
const PREFIX_ALIASES = { GR: 'EL', GB: null, XI: null };
function checkTaxId(raw) {
  const s = raw.trim(); if (!s) return null;
  let t = s.toUpperCase().replace(/[\s.\-/:]/g, ''), key = null, num = t;
  const kw = /^(ABN|ACN|TFN|CPF|CNPJ|CHE)/.exec(t);
  if (kw) { key = kw[1]; num = t.slice(key === 'CHE' ? 0 : key.length); if (key === 'CHE') num = t.slice(3); }
  else if (/^[A-Z]{2}/.test(t)) {
    const c = t.startsWith('GR') ? 'EL' : t.slice(0, 2);
    if (c.length === 2 && TAXIDS[c]) { key = c; num = t.slice(2); }
    else if (['GB', 'XI'].includes(c)) return { input: s, text: 'United Kingdom VAT: 9 or 12 digits (or GD/HA + 3 digits); the checksum is not verified here. Check it at gov.uk.' };
  }
  if (key) {
    const r = TAXIDS[key][1](num);
    return { input: s, key, name: TAXIDS[key][0], norm: key + ' ' + num, r };
  }
  const hits = Object.entries(TAXIDS).filter(([, [, f]]) => f(t) === true).map(([k, [n]]) => `${n} (${k})`);
  return { input: s, anon: true, hits };
}
T.push({
  id: 'tax-id-checksum-validator', cat: 'Reference', title: 'Tax ID and VAT Number Checksum Validator (EU, Switzerland, Norway, Australia, Brazil)',
  desc: 'Check the check digits of VAT, company and tax numbers offline: 27 EU states, Switzerland, Norway, Australian ABN, ACN and TFN, Brazilian CPF and CNPJ. A valid checksum does not prove a registration; no VIES lookup is made.',
  inputs: 1, labels: ['Numbers, one per line, with country prefix (DE123456788, BE0417497106, ABN 51 824 753 556, CPF 529.982.247-25)'], placeholder: ['BE0417497106\nDE136695976\nABN 51 824 753 556'],
  sample: 'BE0417497106\nDE136695976\nFR40303265045\nNL004495445B01\nIT00743110157\nES A58818501\nSE556703748501\nPL5260001246\nCHE-116.281.710 MWST\nNO 923 609 016 MVA\nABN 51 824 753 556\nACN 004 085 616\nCPF 529.982.247-25\nCNPJ 11.222.333/0001-81\nDE136695977\n123456789',
  run: ([inp]) => {
    const rows = lines(need(inp, 'one or more numbers')).slice(0, 500).map(checkTaxId).filter(Boolean);
    const out = rows.map((r) => {
      if (r.text) return `${r.input}\n    ${r.text}`;
      if (r.anon) return `${r.input}\n    no country prefix: ${r.hits.length ? 'checksum is valid for ' + r.hits.join('; ') : 'no supported scheme accepts this number'}`;
      const v = r.r === true ? 'VALID checksum' : r.r === false ? 'INVALID checksum' : r.r === 'format' ? 'format looks right, checksum not verified for this scheme' : 'wrong length or characters for this scheme';
      return `${r.input}\n    ${r.name}: ${v}${r.r === true ? ' (' + r.norm + ')' : ''}`;
    });
    out.push('A valid check digit only shows the number is well formed. It does not show the company exists or is VAT-registered: for EU cross-border invoices confirm the number in VIES (ec.europa.eu/taxation_customs/vies), for Australia at abr.business.gov.au. Nothing is sent from this page.');
    return out.join('\n\n');
  },
});

// ====================================================================== pasted-HTML analysers (no DOMParser: they run in Node too)
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
function miniDom(html) { // tolerant tree builder: { tag, attrs, children, text }
  const root = { tag: '#root', attrs: {}, children: [], parent: null }; let cur = root;
  const src = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<!doctype[^>]*>/gi, '');
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+|<)/g; let m;
  while ((m = re.exec(src))) {
    if (m[4] !== undefined) { cur.children.push({ text: m[4] }); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) { let n = cur; while (n && n.tag !== tag) n = n.parent; if (n && n.parent) cur = n.parent; continue; }
    const attrs = {}; for (const a of m[3].matchAll(/([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = decodeEnt(a[2] ?? a[3] ?? a[4] ?? '');
    const node = { tag, attrs, children: [], parent: cur }; cur.children.push(node);
    if (/^(script|style|textarea|title)$/.test(tag) && !/\/\s*$/.test(m[3])) { const e = src.toLowerCase().indexOf('</' + tag, re.lastIndex); const end = e < 0 ? src.length : e; node.children.push({ text: src.slice(re.lastIndex, end) }); re.lastIndex = e < 0 ? src.length : src.indexOf('>', e) + 1 || src.length; continue; }
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) cur = node;
  }
  return root;
}
const walkDom = (n, f) => { if (n.tag) { if (f(n) === false) return; n.children.forEach((c) => walkDom(c, f)); } };
const domText = (n) => (n.text !== undefined ? n.text : /^(script|style|noscript|template)$/.test(n.tag) ? '' : n.children.map(domText).join(n.tag && /^(p|div|li|h[1-6]|br|tr|section|article|blockquote|pre|ul|ol|table)$/.test(n.tag) ? '\n' : ''));
const findAll = (root, pred) => { const out = []; walkDom(root, (n) => { if (pred(n)) out.push(n); }); return out; };
const absUrl = (u, base) => { try { return new URL(u, base || undefined).href; } catch { return u; } };
const BASEOPT = { id: 'base', label: 'Page URL (to resolve relative links, optional)', type: 'text', def: 'https://www.example.com/blog/post/' };

const SAMPLE_HTML = `<!doctype html><html lang="en"><head><title>Blue Widgets Guide | Example</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://www.example.com/blog/post/">
<meta property="og:image" content="https://www.example.com/img/og.jpg"><link rel="icon" href="/favicon.ico">
</head><body><header><nav><a href="/">Home</a> <a href="/shop/">Shop</a></nav></header>
<main><article><h1>Blue Widgets Guide</h1><p>Updated 2022. Contact <a href="mailto:sales@example.com">sales@example.com</a> or call <a href="tel:+3225551234">+32 2 555 12 34</a>.</p>
<p>Read <a href="#reviews">reviews</a>, <a href="#missing">pricing</a> or <a href="https://partner.example.net/deal?utm_source=blog" target="_blank">click here</a>.
<a href="http://old.example.org/page" rel="nofollow sponsored">Sponsored</a> <a href="">empty</a> <a href="javascript:void(0)">js</a> <a href="/shop/">Shop</a> <a href="/shop/">Shop</a></p>
<img src="/img/widget.jpg" srcset="/img/widget-480.jpg 480w, /img/widget-960.jpg 960w" width="800" height="600" alt="Blue widget" loading="lazy">
<img src="https://cdn.example.com/hero.png"><picture><source srcset="/img/a.webp" type="image/webp"><img src="/img/a.jpg" alt=""></picture>
<h2 id="reviews">Reviews</h2><p>Great product. Email: info [at] example [dot] com</p></article></main>
<footer><a href="https://twitter.com/example">Twitter</a> <a href="https://www.linkedin.com/company/example">LinkedIn</a> &copy; 2019 Example</footer>
<style>.hero{background:url('/img/bg.jpg')}</style></body></html>`;

// ---- link auditor
const GENERIC_ANCHOR = /^(click here|here|read more|more|learn more|link|this|this link|continue|details|info|see more|view more|go|download)$/i;
T.push({
  id: 'html-link-auditor', cat: SEOT, title: 'HTML Link Auditor (Broken Anchors, Empty Links, nofollow, Generic Anchor Text)',
  desc: 'Paste page HTML and audit every link offline: empty and javascript: hrefs, fragment links with no target, http links on https pages, _blank without noopener, nofollow and sponsored, generic anchor text and duplicates.',
  inputs: 1, labels: ['Page HTML'], placeholder: ['<a href="/page">...'], opts: [BASEOPT], sample: SAMPLE_HTML,
  run: ([inp], o) => {
    const dom = miniDom(need(inp, 'page HTML')), base = o.base?.trim() || '', ids = new Set();
    walkDom(dom, (n) => { if (n.attrs.id) ids.add(n.attrs.id); if (n.tag === 'a' && n.attrs.name) ids.add(n.attrs.name); });
    const as = findAll(dom, (n) => n.tag === 'a'), probs = [], rows = []; let host = ''; try { host = new URL(base).hostname; } catch { /* no base */ }
    const seen = new Map();
    for (const a of as) {
      const href = a.attrs.href, text = domText(a).replace(/\s+/g, ' ').trim() || (findAll(a, (n) => n.tag === 'img')[0]?.attrs.alt ?? ''), rel = (a.attrs.rel || '').toLowerCase().split(/\s+/);
      const label = (text || '(no text)').slice(0, 40); const add = (sev, msg) => probs.push([sev, label, href ?? '(none)', msg]);
      if (href === undefined) { if (!a.attrs.name && !a.attrs.id) add('warn', 'anchor without href'); continue; }
      const h = href.trim();
      if (h === '') { add('error', 'empty href (links to the current page)'); continue; }
      if (h === '#') add('warn', 'href="#" jumps to the top; use a button for actions');
      else if (/^javascript:/i.test(h)) add('error', 'javascript: URL is not crawlable; use a real URL');
      else if (h.startsWith('#')) { if (!ids.has(decodeURIComponent(h.slice(1)))) add('error', `fragment ${h} has no element with that id or name in this HTML`); }
      else if (/\s/.test(h)) add('warn', 'URL contains whitespace');
      if (/^http:\/\//i.test(h) && /^https:/i.test(base)) add('warn', 'insecure http link on an https page');
      if ((a.attrs.target || '').toLowerCase() === '_blank' && !rel.includes('noopener') && !rel.includes('noreferrer')) add('info', 'target=_blank without rel=noopener (modern browsers add it implicitly, older ones do not)');
      if (text && GENERIC_ANCHOR.test(text)) add('warn', `generic anchor text "${text}" says nothing about the target`);
      if (!text) add('warn', 'link has no text and no image alt (invisible to screen readers and search engines)');
      if (/[?&]utm_/i.test(h) && (!/^https?:/i.test(h) || new URL(absUrl(h, base)).hostname === host)) add('info', 'internal link carries utm_ parameters (splits analytics sessions)');
      if (h.length > 2000) add('warn', 'URL longer than 2000 characters');
      const ext = /^https?:\/\//i.test(absUrl(h, base)) && host && new URL(absUrl(h, base)).hostname !== host;
      rows.push({ href: h, abs: absUrl(h, base), text, rel: rel.filter(Boolean), ext });
      const key = absUrl(h, base) + '|' + text; seen.set(key, (seen.get(key) || 0) + 1);
    }
    const dups = [...seen].filter(([, n]) => n > 1);
    const out = [`${as.length} links: ${rows.filter((r) => r.ext).length} external, ${rows.filter((r) => /^mailto:|^tel:/i.test(r.href)).length} mailto/tel, ${rows.filter((r) => r.rel.includes('nofollow')).length} nofollow, ${rows.filter((r) => r.rel.includes('sponsored')).length} sponsored, ${rows.filter((r) => r.rel.includes('ugc')).length} ugc.`];
    const order = { error: 0, warn: 1, info: 2 };
    out.push(probs.length ? sec(`Findings (${probs.length})`, table(['severity', 'link text', 'href', 'finding'], probs.sort((a, b) => order[a[0]] - order[b[0]]).map((p) => [p[0], p[1], p[2].slice(0, 60), p[3]]))) : 'No link problems found.');
    if (dups.length) out.push(sec('Repeated identical links', dups.map(([k, n]) => `${n}x ${k.replace('|', '  "') + '"'}`).join('\n')));
    const doms = {}; for (const r of rows.filter((x) => x.ext)) { const d = new URL(r.abs).hostname; doms[d] = (doms[d] || 0) + 1; }
    if (Object.keys(doms).length) out.push(sec('External domains linked', Object.entries(doms).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${String(n).padStart(3)}  ${d}`).join('\n')));
    out.push('This checks the HTML you pasted. It cannot tell whether a target URL returns 404 (that needs requests to other sites); in a browser extension those requests would be possible. Fragment checks only see ids present in the pasted HTML.');
    return out.join('\n\n');
  },
});

// ---- extractors
function extractEmails(html, deob) {
  const text = decodeEnt(html), set = new Map();
  for (const m of html.matchAll(/mailto:([^"'?#\s>]+)/gi)) set.set(decodeURIComponent(m[1]).toLowerCase(), 'mailto link');
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) { const e = m[0].toLowerCase().replace(/^[._-]+|[.]+$/g, ''); if (!/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(e) && !set.has(e)) set.set(e, 'text'); }
  if (deob) for (const m of text.matchAll(/([A-Za-z0-9._%+-]+)\s*[\[(]\s*(?:at|@)\s*[\])]\s*([A-Za-z0-9.-]+?)\s*[\[(]\s*(?:dot|\.)\s*[\])]\s*([A-Za-z]{2,})/gi)) set.set(`${m[1]}@${m[2]}.${m[3]}`.toLowerCase(), 'obfuscated (name [at] host [dot] tld)');
  return set;
}
function extractUrls(html, base) {
  const out = new Map(); const add = (u, kind) => { u = u.trim(); if (!u || /^(data|javascript|blob|about):/i.test(u) || u.startsWith('#')) return; const a = absUrl(u, base); if (!out.has(a)) out.set(a, kind); };
  const dom = miniDom(html);
  walkDom(dom, (n) => {
    const a = n.attrs; if (a.href) add(a.href, n.tag === 'a' ? 'link' : n.tag === 'link' ? 'link rel=' + (a.rel || '') : n.tag); if (a.src) add(a.src, n.tag); if (a.action) add(a.action, 'form action'); if (a.poster) add(a.poster, 'poster'); if (a.data) add(a.data, n.tag);
    if (a.srcset) a.srcset.split(',').forEach((s) => add(s.trim().split(/\s+/)[0], 'srcset')); if (a.content && n.tag === 'meta' && /^https?:/i.test(a.content)) add(a.content, 'meta ' + (a.property || a.name));
    if (n.tag === 'meta' && /refresh/i.test(a['http-equiv'] || '')) { const m = /url=(.+)$/i.exec(a.content || ''); if (m) add(m[1], 'meta refresh'); }
  });
  for (const m of html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) add(m[1], 'css url()');
  for (const m of html.matchAll(/"(?:url|@id|sameAs|image|logo)"\s*:\s*"(https?:[^"]+)"/g)) add(m[1], 'json-ld');
  for (const m of decodeEnt(html).matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) add(m[0].replace(/[.,;]+$/, ''), 'text');
  return out;
}
function extractImages(html, base) {
  const dom = miniDom(html), out = [];
  walkDom(dom, (n) => {
    const a = n.attrs;
    if (n.tag === 'img') {
      const flags = []; if (a.alt === undefined) flags.push('no alt attribute'); else if (a.alt.trim() === '') flags.push('empty alt (ok only if decorative)'); if (!a.width || !a.height) flags.push('no width/height (layout shift)'); if (!a.loading && !a.fetchpriority) flags.push('no loading="lazy" (fine for the hero image)');
      if (a.src) out.push({ kind: 'img', url: absUrl(a.src, base), alt: a.alt, flags });
      if (a.srcset) a.srcset.split(',').forEach((s) => { const [u, d] = s.trim().split(/\s+/); if (u) out.push({ kind: 'srcset ' + (d || ''), url: absUrl(u, base), flags: [] }); });
    } else if (n.tag === 'source' && a.srcset) a.srcset.split(',').forEach((s) => { const [u, d] = s.trim().split(/\s+/); if (u) out.push({ kind: 'picture source ' + (a.type || '') + ' ' + (d || ''), url: absUrl(u, base), flags: [] }); });
    else if (n.tag === 'meta' && /image/i.test(a.property || a.name || '') && a.content) out.push({ kind: a.property || a.name, url: absUrl(a.content, base), flags: [] });
    else if (n.tag === 'link' && /icon|image_src/i.test(a.rel || '') && a.href) out.push({ kind: 'link rel=' + a.rel, url: absUrl(a.href, base), flags: [] });
    else if (n.tag === 'video' && a.poster) out.push({ kind: 'video poster', url: absUrl(a.poster, base), flags: [] });
  });
  for (const m of html.matchAll(/url\(\s*['"]?([^'")]+\.(?:png|jpe?g|gif|webp|avif|svg)[^'")]*)['"]?\s*\)/gi)) out.push({ kind: 'css background', url: absUrl(m[1], base), flags: [] });
  for (const m of html.matchAll(/"image"\s*:\s*"(https?:[^"]+)"/g)) out.push({ kind: 'json-ld image', url: m[1], flags: [] });
  const seen = new Set(); return out.filter((x) => { const k = x.kind + x.url; if (seen.has(k)) return false; seen.add(k); return true; });
}
const extractorTool = (id, title, desc, label, run, sample) => T.push({ id, cat: SEOX, title, desc, inputs: 1, labels: [label], placeholder: ['<html>...'], opts: [BASEOPT], sample, run });
extractorTool('html-email-extractor', 'Email Address Extractor from HTML or Text', 'Pull every email address out of pasted HTML or text: mailto links, plain addresses and name [at] domain [dot] com style obfuscation. Deduplicated, with the source of each. Runs locally.', 'HTML or text',
  ([inp]) => { const m = extractEmails(need(inp, 'HTML or text'), true); const arr = [...m]; const dom = {}; arr.forEach(([e]) => { const d = e.split('@')[1]; dom[d] = (dom[d] || 0) + 1; }); return arr.length ? `${arr.length} unique address${arr.length > 1 ? 'es' : ''}\n\n${table(['address', 'found as'], arr.sort())}\n\nBy domain: ${Object.entries(dom).map(([d, n]) => `${d} (${n})`).join(', ')}\n\nOnly the HTML you paste is read; nothing is fetched. Check the privacy and anti-spam rules (GDPR, CAN-SPAM, ePrivacy) before using harvested addresses for marketing.` : 'No email addresses found.'; }, SAMPLE_HTML);
extractorTool('html-url-extractor', 'URL Extractor from HTML (Links, Scripts, Images, CSS, JSON-LD)', 'List every URL in pasted HTML: anchors, scripts, stylesheets, images, srcset, forms, meta refresh, CSS url() and JSON-LD, resolved against a base URL and grouped by domain.', 'HTML source',
  ([inp], o) => { const m = extractUrls(need(inp, 'HTML'), o.base?.trim() || ''); const arr = [...m]; if (!arr.length) return 'No URLs found.'; const dom = {}; arr.forEach(([u]) => { let h = 'relative'; try { const x = new URL(u); h = /^https?:$/.test(x.protocol) ? x.hostname : x.protocol; } catch { /* relative */ } dom[h] = (dom[h] || 0) + 1; }); return `${arr.length} unique URLs on ${Object.keys(dom).length} hosts\n\n${table(['url', 'where'], arr.map(([u, k]) => [u, k]))}\n\nHosts: ${Object.entries(dom).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} (${n})`).join(', ')}`; }, SAMPLE_HTML);
extractorTool('html-image-extractor', 'Image Extractor from HTML (img, srcset, og:image, CSS, Alt Check)', 'Find every image reference in pasted HTML: img, srcset candidates, picture sources, og:image, icons, video posters, CSS backgrounds and JSON-LD, with alt text and missing size or lazy-load flags.', 'HTML source',
  ([inp], o) => { const imgs = extractImages(need(inp, 'HTML'), o.base?.trim() || ''); if (!imgs.length) return 'No images found.'; const missAlt = imgs.filter((i) => i.kind === 'img' && i.alt === undefined).length; return `${imgs.length} image references (${imgs.filter((i) => i.kind === 'img').length} <img> tags, ${missAlt} without alt)\n\n${imgs.map((i) => `${i.kind.padEnd(34)} ${i.url}${i.alt !== undefined ? '\n    alt: "' + i.alt + '"' : ''}${i.flags.length ? '\n    ' + i.flags.join('; ') : ''}`).join('\n')}\n\nDownloading is not done here (a web page cannot fetch other sites); open the URLs or use your browser's Save as.`; }, SAMPLE_HTML);

// ---- soft 404
const SOFT_PHRASES = [[/page (?:you(?:'| a)?re looking for )?(?:could not|can(?:no|')t|couldn'?t|cannot) be found|(?:page|content|article|product|item) (?:was |is )?(?:not found|no longer (?:available|exists?)|unavailable|doesn'?t exist|does not exist)|we (?:could not|couldn'?t|can'?t) find|nothing (?:was )?found|404|not found|error 404|oops|sorry,? (?:but )?(?:this|that|the) page/i, 'error wording (not found, no longer available, 404)'], [/no results (?:found|for)|0 results|did not match any|no matching (?:products|results|items)/i, 'empty search or listing wording'], [/(?:your )?(?:cart|basket) is empty|no items in your/i, 'empty cart wording'], [/currently unavailable|out of stock|sold out|discontinued/i, 'unavailable product wording']];
T.push({
  id: 'soft-404-detector', cat: SEOT, title: 'Soft 404 Detector (Error Page That Returns 200)',
  desc: 'Paste a page\'s HTML and its HTTP status to see if it looks like a soft 404: error wording, thin content, noindex, a canonical to the home page, a meta refresh redirect. With advice on 404, 410 or 301.',
  inputs: 1, labels: ['Page HTML (optionally start with the status line, e.g. HTTP/1.1 200 OK)'], placeholder: ['HTTP/1.1 200 OK\n\n<html>...'],
  opts: [{ id: 'status', label: 'HTTP status the server returned', type: 'number', def: 200 }, { id: 'url', label: 'Page URL', type: 'text', def: 'https://www.example.com/products/blue-widget-xl' }],
  sample: 'HTTP/1.1 200 OK\ncontent-type: text/html\n\n<html><head><title>Product not found | Example Shop</title><link rel="canonical" href="https://www.example.com/"><meta name="robots" content="noindex"></head><body><nav><a href="/">Home</a> <a href="/shop/">Shop</a></nav><h1>Oops!</h1><p>Sorry, the product you are looking for is no longer available.</p><form><input type="search" name="q"></form><ul><li><a href="/p/1">Red widget</a></li><li><a href="/p/2">Green widget</a></li></ul><footer>Example Shop</footer></body></html>',
  run: ([inp], o) => {
    let html = need(inp, 'page HTML'), status = +o.status || 200; const sm = /^HTTP\/[\d.]+\s+(\d{3})/m.exec(html); if (sm) { status = +sm[1]; html = html.replace(/^[\s\S]*?\r?\n\r?\n(?=\s*<)/, ''); }
    const text = textOfHtml(html), words = wordsOf(text).length, title = titleOf(html) || '', h1 = (blocksOf(html, 'h1')[0]?.text) || '';
    const sig = []; let score = 0; const add = (w, m) => { sig.push(m); score += w; };
    const phrase = (s, name) => { for (const [re, why] of SOFT_PHRASES) if (re.test(s)) return why + ' in the ' + name; return null; };
    const pt = phrase(title, 'title'), ph = phrase(h1, 'h1'), pb = phrase(text.slice(0, 1500), 'visible text');
    if (pt) add(3, pt); if (ph) add(3, ph); if (pb) add(2, pb);
    if (words < 150) add(words < 60 ? 3 : 2, `very little text (${words} words)`);
    const robots = metaOf(html, 'robots'); if (robots && /noindex/i.test(robots)) add(1, 'meta robots noindex');
    const canon = linkRel2(html, 'canonical'); if (canon) { try { const cu = new URL(canon), pu = new URL(o.url || canon); if (cu.pathname === '/' && pu.pathname !== '/') add(2, 'canonical points to the home page'); } catch { /* ignore */ } }
    const mr = tagsOf(html, 'meta').map((t) => (attrOf(t, 'http-equiv') || '').toLowerCase() === 'refresh' ? attrOf(t, 'content') : null).find(Boolean); if (mr) add(2, `meta refresh redirect (${mr})`);
    if (tagsOf(html, 'a').length > 5 && words < 100) add(1, 'mostly navigation and suggested links');
    const out = [`Status ${status}, ${words} words of visible text, title "${title}".`];
    if (status === 404 || status === 410) out.push('The server already returns a real error status: this is a proper 404/410, not a soft 404.');
    else if (status >= 300 && status < 400) out.push('A redirect status: check the target; redirecting many removed pages to the home page is treated as a soft 404 by Google.');
    else if (status >= 500) out.push('Server error status: not a soft 404, but fix the server error.');
    else {
      const verdict = score >= 5 ? 'LIKELY a soft 404' : score >= 3 ? 'POSSIBLY a soft 404' : 'unlikely to be a soft 404';
      out.push(`Verdict: ${verdict} (score ${score}).`, sig.length ? sec('Signals', sig.map((x) => '- ' + x).join('\n')) : 'No soft-404 signals found.');
      if (score >= 3) out.push(sec('What to do', '- Page is permanently gone with no replacement: return 404, or 410 to speed removal.\n- Page moved or has a close replacement: 301 to that page (not to the home page).\n- Product temporarily out of stock: keep 200, keep the content (price, description) and mark availability OutOfStock in schema.org.\n- Empty search or category: add noindex or return 404 for empty result pages.\nThen check Search Console > Pages > "Soft 404" and request validation.'));
    }
    out.push('Heuristic: Google decides on its own signals, which are not public. This applies common rules to the HTML you pasted.');
    return out.join('\n\n');
  },
});
function linkRel2(html, rel) { for (const t of tagsOf(html, 'link')) if ((attrOf(t, 'rel') || '').toLowerCase().split(/\s+/).includes(rel)) return attrOf(t, 'href'); return null; }

// ---- mobile friendliness (static)
T.push({
  id: 'mobile-friendly-html-check', cat: SEOT, title: 'Mobile-Friendly HTML Check (Viewport, Tap Targets, Fixed Widths)',
  desc: 'Paste page HTML and run static mobile checks: viewport meta, zoom blocking, fixed pixel widths, tiny fonts, media queries, tables and images wider than a phone, plugins and tap-target hints. No rendering, no upload.',
  inputs: 1, labels: ['Page HTML (with inline <style> if you can)'], placeholder: ['<html><head><meta name="viewport" ...'],
  sample: '<html><head><title>Old page</title><meta name="viewport" content="width=1024, user-scalable=no, maximum-scale=1"><style>body{font-size:10px} .wrap{width:980px} .btn{height:20px;width:20px}</style></head><body><div class="wrap"><table width="900"><tr><td>Hi</td></tr></table><img src="a.jpg" width="1200" height="800"><a href="/a">a</a> <a href="/b">b</a><embed src="x.swf"></div></body></html>',
  run: ([inp]) => {
    const html = need(inp, 'page HTML'), css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') + '\n' + [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(';');
    const res = []; const add = (sev, m) => res.push([sev, m]);
    const vp = metaOf(html, 'viewport');
    if (!vp) add('FAIL', 'No viewport meta tag: phones render the page at about 980 px wide and shrink it.');
    else {
      if (!/width\s*=\s*device-width/i.test(vp)) add('FAIL', `viewport "${vp}" does not use width=device-width.`);
      if (/user-scalable\s*=\s*(no|0)/i.test(vp)) add('FAIL', 'user-scalable=no blocks pinch zoom (WCAG 1.4.4 failure).');
      const ms = /maximum-scale\s*=\s*([\d.]+)/i.exec(vp); if (ms && +ms[1] < 2) add('FAIL', `maximum-scale=${ms[1]} restricts zoom (WCAG asks for at least 200%).`);
      if (/initial-scale\s*=\s*1/i.test(vp) && /width\s*=\s*device-width/i.test(vp) && !/user-scalable\s*=\s*(no|0)/i.test(vp)) add('PASS', `viewport "${vp}" is fine.`);
    }
    const mq = (css.match(/@media[^{]*\{/gi) || []); if (!mq.length && css.trim().length > 50) add('WARN', 'No @media queries in the inline CSS (external stylesheets are not visible here).'); else if (mq.length) add('PASS', `${mq.length} media quer${mq.length > 1 ? 'ies' : 'y'} in inline CSS.`);
    const fixed = [...css.matchAll(/(?<![-\w])(?:width|min-width)\s*:\s*(\d{3,4})px/gi)].map((m) => +m[1]).filter((w) => w > 480); if (fixed.length) add('FAIL', `Fixed CSS width(s) over 480px: ${[...new Set(fixed)].join(', ')}px. Use max-width and relative units.`);
    const small = [...css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((m) => +m[1]).filter((s) => s < 12); if (small.length) add('FAIL', `Font sizes under 12px: ${[...new Set(small)].join(', ')}px (aim for 16px body text).`);
    tagsOf(html, 'table').forEach((t) => { const w = parseInt(attrOf(t, 'width') || '0', 10); if (w > 480) add('FAIL', `<table width="${w}"> is wider than a phone screen.`); });
    tagsOf(html, 'img').forEach((t) => { const w = parseInt(attrOf(t, 'width') || '0', 10); if (w > 480 && !/max-width|width\s*:\s*100%/.test(css)) add('WARN', `<img width="${w}"> may overflow a phone unless CSS sets max-width:100%.`); });
    if (/<(embed|applet|object)\b/i.test(html) || /\.swf\b/i.test(html)) add('FAIL', 'Flash/plugin content (embed, applet, object, .swf) does not run on phones.');
    const tiny = [...css.matchAll(/(?:width|height)\s*:\s*(\d+)px/gi)].map((m) => +m[1]).filter((n) => n > 0 && n < 24); if (tiny.length) add('WARN', `Elements sized ${[...new Set(tiny)].join(', ')}px: tap targets should be at least 24px (WCAG 2.2) and ideally 44-48px.`);
    const links = tagsOf(html, 'a').length; if (links > 3) add('INFO', `${links} links: make sure they have spacing of at least 8px so fingers do not hit two.`);
    if (!/<html[^>]*\blang=/i.test(html)) add('WARN', 'No lang attribute on <html>.');
    const fails = res.filter((r) => r[0] === 'FAIL').length;
    return `${fails ? fails + ' problem' + (fails > 1 ? 's' : '') + ' found' : 'No blocking problems found in the static checks'}\n\n${res.map(([s, m]) => `${s.padEnd(5)} ${m}`).join('\n')}\n\nThis is a static read of the HTML and inline CSS. Real mobile-friendliness depends on the rendered layout and external CSS: confirm with Lighthouse or Chrome DevTools device mode.`;
  },
});

// ---- product page extractor
const priceText = (s) => { const m = /(?:[$€£¥]|USD|EUR|GBP)\s?\d[\d.,]*|\d[\d.,]*\s?(?:[$€£¥]|USD|EUR|GBP)/.exec(s || ''); return m ? m[0].trim() : null; };
T.push({
  id: 'product-page-extractor', cat: SEOX, title: 'Product Page Data Extractor (JSON-LD, Open Graph, Microdata, Amazon IDs)',
  desc: 'Paste a product page\'s HTML and get its structured product data: JSON-LD Product and Offer, Open Graph, microdata, Amazon title, price and bullets, plus a check against Google\'s product rich result needs.',
  inputs: 1, labels: ['Product page HTML'], placeholder: ['<html>... application/ld+json ...'],
  sample: `<html><head><title>Blue Widget XL - Example Shop</title><meta property="og:title" content="Blue Widget XL"><meta property="og:image" content="https://shop.example.com/img/blue-xl.jpg"><meta property="product:price:amount" content="24.90"><meta property="product:price:currency" content="EUR">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Blue Widget XL","sku":"BW-XL-01","gtin13":"5901234123457","brand":{"@type":"Brand","name":"Widgetco"},"image":["https://shop.example.com/img/blue-xl.jpg"],"description":"A sturdy blue widget.","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.6","reviewCount":"128"},"offers":{"@type":"Offer","price":"24.90","priceCurrency":"EUR","availability":"https://schema.org/InStock","url":"https://shop.example.com/p/blue-widget-xl","priceValidUntil":"2026-12-31"}}</script></head>
<body><h1 id="productTitle"> Blue Widget XL </h1><span class="a-price-whole">24</span><span class="a-price-fraction">90</span><div id="feature-bullets"><ul><li><span>Sturdy steel body</span></li><li><span>Two-year warranty</span></li></ul></div><div data-asin="B012345678"></div></body></html>`,
  run: ([inp]) => {
    const html = need(inp, 'product page HTML'), ld = flatLd(jsonLd(html)), prods = ld.filter((n) => hasType(n, 'Product')), out = [], rec = {};
    const og = (k) => metaOf(html, k);
    rec.title = prods[0]?.name || og('og:title') || (/id=["']productTitle["'][^>]*>([\s\S]*?)<\/\w+>/i.exec(html)?.[1] || '').replace(/<[^>]+>/g, '').trim() || titleOf(html);
    const offer = [].concat(prods[0]?.offers || [])[0] || {};
    rec.price = offer.price ?? offer.lowPrice ?? og('product:price:amount') ?? og('og:price:amount') ?? null;
    if (rec.price == null) { const w = /class=["'][^"']*a-price-whole[^"']*["'][^>]*>([\d.,]+)/i.exec(html), f = /class=["'][^"']*a-price-fraction[^"']*["'][^>]*>(\d+)/i.exec(html); if (w) rec.price = w[1].replace(/[.,]$/, '') + (f ? '.' + f[1] : ''); }
    if (rec.price == null) rec.price = priceText(textOfHtml(html).slice(0, 4000));
    rec.currency = offer.priceCurrency ?? og('product:price:currency') ?? og('og:price:currency') ?? null;
    rec.availability = offer.availability ?? og('product:availability') ?? null; rec.sku = prods[0]?.sku ?? null;
    rec.gtin = prods[0]?.gtin13 ?? prods[0]?.gtin ?? prods[0]?.gtin14 ?? prods[0]?.gtin12 ?? prods[0]?.gtin8 ?? null; rec.mpn = prods[0]?.mpn ?? null;
    rec.brand = typeof prods[0]?.brand === 'object' ? prods[0].brand?.name : prods[0]?.brand ?? null;
    rec.image = [].concat(prods[0]?.image || og('og:image') || []).map((x) => (typeof x === 'object' ? x.url : x)); rec.description = prods[0]?.description || og('og:description') || metaOf(html, 'description');
    rec.rating = prods[0]?.aggregateRating ? { value: prods[0].aggregateRating.ratingValue, count: prods[0].aggregateRating.reviewCount ?? prods[0].aggregateRating.ratingCount } : null;
    const asin = /data-asin=["']([A-Z0-9]{10})["']/.exec(html)?.[1] || /\/dp\/([A-Z0-9]{10})/.exec(html)?.[1]; if (asin) rec.asin = asin;
    const bullets = [...(/id=["']feature-bullets["'][\s\S]*?<\/ul>/i.exec(html)?.[0] || '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => textOfHtml(m[1])).filter(Boolean); if (bullets.length) rec.bullets = bullets;
    const micro = [...html.matchAll(/itemprop=["'](name|price|priceCurrency|sku|brand|availability)["'][^>]*?(?:content=["']([^"']*)["']|>([^<]*))/gi)].map((m) => [m[1], (m[2] ?? m[3] ?? '').trim()]); if (micro.length) rec.microdata = Object.fromEntries(micro);
    out.push(sec('Extracted product data', JSON.stringify(rec, null, 2)));
    const chk = [];
    if (!prods.length) chk.push('No JSON-LD Product found: Google may not show product rich results (microdata or Merchant Center feed also work).');
    else { if (!rec.title) chk.push('Missing name.'); if (!rec.image?.length) chk.push('Missing image (required for product snippets).'); if (!offer.price && !offer.lowPrice) chk.push('Missing offers.price.'); if (!offer.priceCurrency) chk.push('Missing offers.priceCurrency (ISO 4217 code such as EUR).'); if (!offer.availability) chk.push('Missing offers.availability (use https://schema.org/InStock etc.).'); else if (!/^https?:\/\/schema\.org\//.test(offer.availability)) chk.push('availability should be a full schema.org URL, e.g. https://schema.org/InStock.'); if (!rec.gtin && !rec.mpn && !rec.sku) chk.push('No gtin, mpn or sku: identifiers help matching in Google Shopping.'); if (!rec.rating) chk.push('No aggregateRating (needed for star snippets; only add if you really show reviews).'); if (offer.priceValidUntil && new Date(offer.priceValidUntil) < new Date()) chk.push('priceValidUntil is in the past.'); }
    out.push(sec('Rich result readiness', chk.length ? chk.map((c) => '- ' + c).join('\n') : 'All commonly required product fields are present.'));
    out.push('Reads only the HTML you paste. Shops change their markup often, so the Amazon-specific fields (productTitle, a-price, feature-bullets, data-asin) may stop matching. Respect each site\'s terms before copying its data.');
    return out.join('\n\n');
  },
});

// ---- article extractor
const SKIP_TAGS = /^(script|style|noscript|template|nav|header|footer|aside|form|iframe|svg|button|select|dialog)$/;
const NOISE = /(comment|sidebar|share|social|promo|advert|ads|cookie|newsletter|related|breadcrumb|menu|popup|modal|subscribe|footer|header|nav)/i;
function linkDensity(n) { const t = domText(n).replace(/\s+/g, ' ').length || 1; let l = 0; walkDom(n, (x) => { if (x.tag === 'a') { l += domText(x).replace(/\s+/g, ' ').length; return false; } }); return l / t; }
function pickMain(root) {
  const explicit = findAll(root, (n) => n.tag === 'article' || n.tag === 'main' || n.attrs.role === 'main' || /^(post|article|entry|content)[-_]?(body|content|text)?$/i.test(n.attrs.itemprop || n.attrs.id || ''));
  const cands = findAll(root, (n) => /^(div|section|article|main|td)$/.test(n.tag) && !NOISE.test((n.attrs.class || '') + ' ' + (n.attrs.id || '')));
  let best = null, bs = 0;
  for (const n of [...explicit, ...cands]) {
    const ps = findAll(n, (x) => x.tag === 'p'); const txt = ps.map((p) => domText(p).trim()).filter((t) => t.length > 40).join(' ');
    const ld = linkDensity(n); let s = txt.length * (1 - Math.min(ld, 0.9)) + (explicit.includes(n) ? 200 : 0);
    if (s > bs) { bs = s; best = n; }
  }
  return best || findAll(root, (n) => n.tag === 'body')[0] || root;
}
function toMarkdown(n, links) {
  const out = [];
  const inline = (x) => (x.text !== undefined ? x.text.replace(/\s+/g, ' ') : SKIP_TAGS.test(x.tag) ? '' : x.tag === 'a' && links && x.attrs.href ? `[${x.children.map(inline).join('').trim()}](${x.attrs.href})` : /^(b|strong)$/.test(x.tag) ? `**${x.children.map(inline).join('').trim()}**` : /^(i|em)$/.test(x.tag) ? `*${x.children.map(inline).join('').trim()}*` : x.tag === 'code' ? '`' + x.children.map(inline).join('') + '`' : x.tag === 'br' ? '\n' : x.children.map(inline).join(''));
  const block = (x) => {
    if (x.text !== undefined) { const t = x.text.replace(/\s+/g, ' ').trim(); if (t) out.push(t); return; }
    if (SKIP_TAGS.test(x.tag) || NOISE.test((x.attrs.class || '') + ' ' + (x.attrs.id || '')) && !/^(article|main|body|html)$/.test(x.tag)) return;
    if (/^h[1-6]$/.test(x.tag)) { out.push('#'.repeat(+x.tag[1]) + ' ' + x.children.map(inline).join('').replace(/\s+/g, ' ').trim()); return; }
    if (x.tag === 'p') { const t = x.children.map(inline).join('').replace(/\s+/g, ' ').trim(); if (t) out.push(t); return; }
    if (x.tag === 'li') { out.push('- ' + x.children.map(inline).join('').replace(/\s+/g, ' ').trim()); return; }
    if (x.tag === 'blockquote') { out.push('> ' + domText(x).replace(/\s+/g, ' ').trim()); return; }
    if (x.tag === 'pre') { out.push('```\n' + domText(x).trim() + '\n```'); return; }
    x.children.forEach(block);
  };
  block(n); return out.join('\n\n').replace(/\n\n- /g, '\n- ');
}
T.push({
  id: 'article-text-extractor', cat: SEOC, title: 'Article Text Extractor (Readability-Style Main Content from HTML)',
  desc: 'Paste a web page\'s HTML and get just the article: title, author, date, reading time and the main text as plain text or Markdown, with navigation, ads, comments and footers removed. Works offline.',
  inputs: 1, labels: ['Page HTML'], placeholder: ['<html>...'], opts: [{ id: 'format', label: 'Output', type: 'select', choices: ['Markdown', 'Plain text'], def: 'Markdown' }, { id: 'links', label: 'Keep links in Markdown', type: 'checkbox', def: true }],
  sample: '<html lang="en"><head><title>How to Brew Cold Coffee | The Daily Cup</title><meta name="author" content="Ana Peeters"><meta property="article:published_time" content="2026-03-02T09:00:00Z"></head><body><nav><a href="/">Home</a><a href="/news">News</a><a href="/about">About</a></nav><div class="sidebar"><a href="/x">Buy beans</a><a href="/y">Newsletter</a></div><article><h1>How to Brew Cold Coffee</h1><p class="byline">By Ana Peeters</p><p>Cold brew is made by steeping coarsely ground coffee in cold water for twelve to eighteen hours. The result is smooth, low in acidity and easy to keep in the fridge for a week.</p><h2>What you need</h2><ul><li>100 g coarse coffee</li><li>1 litre cold water</li></ul><p>Combine the grounds and water in a jar, stir gently, cover and leave at room temperature. Then strain through a paper filter. Read more on <a href="/gear">our gear guide</a>.</p></article><div class="comments"><p>Great tips, thanks so much for sharing this with everybody here!</p></div><footer>&copy; The Daily Cup</footer></body></html>',
  run: ([inp], o) => {
    const html = need(inp, 'page HTML'), root = miniDom(html), main = pickMain(root), ld = flatLd(jsonLd(html)).find((n) => hasType(n, 'Article') || hasType(n, 'NewsArticle') || hasType(n, 'BlogPosting'));
    const title = ld?.headline || metaOf(html, 'og:title') || (findAll(main, (n) => n.tag === 'h1')[0] && domText(findAll(main, (n) => n.tag === 'h1')[0]).trim()) || titleOf(html) || '';
    const author = metaOf(html, 'author') || (typeof ld?.author === 'object' ? [].concat(ld.author)[0]?.name : ld?.author) || (findAll(root, (n) => /author|byline/i.test(n.attrs.class || '') || n.attrs.rel === 'author')[0] && domText(findAll(root, (n) => /author|byline/i.test(n.attrs.class || '') || n.attrs.rel === 'author')[0]).replace(/^by\s+/i, '').trim()) || '';
    const date = ld?.datePublished || metaOf(html, 'article:published_time') || findAll(root, (n) => n.tag === 'time' && n.attrs.datetime)[0]?.attrs.datetime || '';
    const md = toMarkdown(main, o.links), plain = md.replace(/```/g, '').replace(/^#{1,6} /gm, '').replace(/\*\*|\*|`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^[-> ] ?/gm, (m) => (m === '- ' ? '- ' : ''));
    const body = o.format === 'Plain text' ? plain : md, words = wordsOf(plain).length;
    if (words < 20) throw new Error('No article-like text found in this HTML.');
    return `Title:    ${title}\nAuthor:   ${author || 'not found'}\nPublished: ${date || 'not found'}\nLanguage: ${/<html[^>]*lang=["']([^"']+)/i.exec(html)?.[1] || 'not set'}\nLength:   ${words} words, about ${Math.max(1, Math.round(words / 230))} min read\n\n${'='.repeat(40)}\n\n${body}\n\n${'='.repeat(40)}\nHeuristic extraction (link density and paragraph length), not a rendered page: pages that build their text with JavaScript will be empty, and unusual layouts can pick the wrong block.`;
  },
});

// ====================================================================== exports from SEO services (pasted CSV / JSON)
const hostOf = (u) => { try { return new URL(/^[a-z]+:\/\//i.test(u) ? u : 'https://' + u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return String(u).toLowerCase(); } };
const rootDomain = (h) => { const p = h.split('.'); if (p.length <= 2) return h; const last = p[p.length - 1], sld = p[p.length - 2]; return (last.length === 2 && SLD2.has(sld) ? p.slice(-3) : p.slice(-2)).join('.'); };
const fmtN = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : 'n/a');

// ---- Search Console performance export
const CTR_CURVE = [0.28, 0.15, 0.11, 0.08, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02]; // generic organic CTR by position 1-10 (rounded industry averages, not Google data)
T.push({
  id: 'gsc-performance-analyzer', cat: SEOX, title: 'Search Console Performance Export Analyzer (Quick Wins, CTR Gaps, Brand Split)',
  desc: 'Paste the Queries or Pages CSV exported from Google Search Console and find striking-distance keywords, pages with low CTR for their position, brand vs non-brand traffic and position buckets.',
  inputs: 1, labels: ['Search Console export (Queries or Pages CSV: query/page, clicks, impressions, CTR, position)'], placeholder: ['Top queries,Clicks,Impressions,CTR,Position\nblue widgets,120,4500,2.7%,7.4'],
  opts: [{ id: 'brand', label: 'Brand terms (comma separated, optional)', type: 'text', def: 'example' }, { id: 'minimp', label: 'Minimum impressions to report', type: 'number', def: 100 }],
  sample: 'Top queries,Clicks,Impressions,CTR,Position\nexample shop,950,1800,52.8%,1.2\nblue widgets,120,4500,2.7%,7.4\nbuy blue widget xl,30,2600,1.2%,9.8\nwidget size guide,15,3900,0.4%,12.6\nhow to clean a widget,8,2100,0.4%,15.1\ncheap widgets online,4,1200,0.3%,18.7\nwidget warranty,40,300,13.3%,3.1\nred widget,2,950,0.2%,31.4\nexample shop login,210,260,80.8%,1.0\nwidget manual pdf,0,640,0%,44.0',
  run: ([inp], o) => {
    const rows = parseCsv(need(inp, 'the exported CSV')); const head = rows[0], iq = 0, ic = colIdx(head, 'clicks'), ii = colIdx(head, 'impressions'), ip = colIdx(head, 'position');
    if (ic < 0 || ii < 0 || ip < 0) throw new Error('Could not find Clicks, Impressions and Position columns in the header row.');
    const data = rows.slice(1).map((r) => ({ q: r[iq], clicks: num(r[ic]), imp: num(r[ii]), pos: num(r[ip]) })).filter((r) => r.q && Number.isFinite(r.imp));
    if (!data.length) throw new Error('No data rows found.');
    const minI = +o.minimp || 0, brand = String(o.brand || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
    const T1 = data.reduce((a, r) => ({ c: a.c + r.clicks, i: a.i + r.imp, p: a.p + r.pos * r.imp }), { c: 0, i: 0, p: 0 });
    const out = [`${data.length} rows: ${fmtN(T1.c)} clicks, ${fmtN(T1.i)} impressions, CTR ${pct(T1.c, T1.i)}, impression-weighted average position ${round(T1.p / T1.i, 1)}.`];
    const bk = [['1-3', 1, 3.99], ['4-10', 4, 10.99], ['11-20', 11, 20.99], ['21+', 21, 1e9]].map(([n, a, b]) => { const s = data.filter((r) => r.pos >= a && r.pos <= b); return [n, s.length, fmtN(s.reduce((x, r) => x + r.clicks, 0)), fmtN(s.reduce((x, r) => x + r.imp, 0))]; });
    out.push(sec('By average position', table(['position', 'rows', 'clicks', 'impressions'], bk)));
    const strike = data.filter((r) => r.pos >= 8 && r.pos <= 20 && r.imp >= minI).sort((a, b) => b.imp - a.imp).slice(0, 15);
    out.push(sec('Striking distance (position 8-20): small gains move these onto page one', strike.length ? table(['row', 'position', 'impressions', 'clicks'], strike.map((r) => [r.q.slice(0, 60), round(r.pos, 1), fmtN(r.imp), fmtN(r.clicks)])) : 'none above the impression threshold'));
    const gap = data.filter((r) => r.pos <= 10 && r.imp >= minI).map((r) => { const exp = CTR_CURVE[Math.max(0, Math.min(9, Math.round(r.pos) - 1))], act = r.clicks / r.imp; return { ...r, exp, act, lost: Math.round((exp - act) * r.imp) }; }).filter((r) => r.lost > 0 && r.act < r.exp * 0.6).sort((a, b) => b.lost - a.lost).slice(0, 12);
    out.push(sec('Low CTR for the position (title/snippet may need work)', gap.length ? table(['row', 'position', 'CTR', 'typical CTR', 'clicks missed (est.)'], gap.map((r) => [r.q.slice(0, 50), round(r.pos, 1), round(r.act * 100, 1) + '%', round(r.exp * 100, 1) + '%', r.lost])) + '\n\nTypical CTR is a generic curve (28%, 15%, 11%, 8%, 7%, 5%, 4%, 3%, 2.5%, 2% for positions 1-10); real CTR varies with SERP features and brand queries.' : 'none found'));
    if (brand.length) { const isB = (r) => brand.some((b) => r.q.toLowerCase().includes(b)), b = data.filter(isB), n = data.filter((r) => !isB(r)); const sum = (a, k) => a.reduce((x, r) => x + r[k], 0); out.push(sec('Brand vs non-brand', table(['', 'rows', 'clicks', 'impressions', 'CTR'], [['brand', b.length, fmtN(sum(b, 'clicks')), fmtN(sum(b, 'imp')), pct(sum(b, 'clicks'), sum(b, 'imp'))], ['non-brand', n.length, fmtN(sum(n, 'clicks')), fmtN(sum(n, 'imp')), pct(sum(n, 'clicks'), sum(n, 'imp'))]]))); }
    const zero = data.filter((r) => r.clicks === 0 && r.imp >= minI).length; out.push(`${zero} rows have impressions but zero clicks.`);
    out.push('Search Console positions are averages over all impressions and can mix devices and countries; export by device and country for decisions. Sampling and anonymised queries mean totals here may differ from the Overview report.');
    return out.join('\n\n');
  },
});

// ---- Search Console page indexing reasons
const INDEX_REASONS = [
  [/crawled\s*-?\s*currently not indexed/i, 'warn', 'Google fetched the page but chose not to index it.', 'Improve uniqueness and quality, add internal links from important pages, avoid thin or near-duplicate pages. Not an error by itself.'],
  [/discovered\s*-?\s*currently not indexed/i, 'warn', 'Google knows the URL but has not crawled it yet (often crawl budget or low perceived value).', 'Link to it from strong pages, remove low-value URLs, improve server speed, submit in the sitemap.'],
  [/duplicate without user-selected canonical/i, 'warn', 'The page duplicates another and you did not declare a canonical.', 'Add rel=canonical to the preferred URL or consolidate with a 301.'],
  [/duplicate,? google chose different canonical than user/i, 'warn', 'Google ignored your canonical and picked another URL.', 'Make the pages genuinely different, or point canonicals, internal links and sitemaps all at the same URL.'],
  [/duplicate,? submitted url not selected as canonical/i, 'warn', 'A sitemap URL was treated as a duplicate of another URL.', 'Remove the duplicate from the sitemap or fix canonicals.'],
  [/alternate page with proper canonical/i, 'ok', 'Expected: this URL correctly points to a canonical elsewhere.', 'Nothing to do.'],
  [/page with redirect|redirect error/i, 'ok', 'The URL redirects. Expected for old URLs; "Redirect error" means a loop, chain too long or empty redirect.', 'Check the sample URLs; fix loops and chains longer than 5 hops.'],
  [/excluded by .?noindex.? tag|submitted url marked .?noindex/i, 'ok', 'The page asks not to be indexed.', 'Fine if intended; otherwise remove the noindex (meta or X-Robots-Tag). Remove noindex URLs from the sitemap.'],
  [/blocked by robots\.txt|indexed, though blocked by robots/i, 'warn', 'robots.txt disallows crawling.', 'Remove the Disallow if the page should rank; blocking does not remove a page from the index (use noindex, which needs crawling).'],
  [/not found \(404\)/i, 'ok', 'The URL returns 404.', 'Fine for removed pages; fix internal links and sitemap entries that point to them, or 301 to a replacement.'],
  [/soft 404/i, 'bad', 'The page returns 200 but looks like an error or empty page.', 'Return a real 404/410, or add real content.'],
  [/server error \(5xx\)/i, 'bad', 'Google got a server error.', 'Check logs, uptime and rate limiting of Googlebot.'],
  [/blocked due to unauthorized request \(401\)|returns unauthorized request \(401\)/i, 'warn', 'Needs a login.', 'Expected for private areas; otherwise allow Googlebot.'],
  [/blocked due to access forbidden \(403\)/i, 'warn', 'Server refuses Googlebot.', 'Check WAF, bot protection and IP rules.'],
  [/crawl anomaly|has crawl issue/i, 'bad', 'An unspecified fetch problem.', 'Use URL Inspection live test to see the failure.'],
  [/url is unknown to google/i, 'warn', 'Google has not discovered this URL.', 'Add internal links and a sitemap entry.'],
  [/indexed without content/i, 'bad', 'Google indexed the page but could not read its content.', 'Check rendering, cloaking and blocked resources.'],
  [/submitted url not selected as canonical/i, 'warn', 'Google selected a different canonical than the sitemap URL.', 'Fix canonicals or the sitemap.'],
  [/blocked by page removal tool/i, 'ok', 'A removal request is active (temporary, about 6 months).', 'Make sure the page is also noindexed or deleted.'],
  [/indexed, not submitted in sitemap/i, 'ok', 'Indexed, but missing from the sitemap.', 'Add important URLs to the sitemap.'],
  [/^indexed$/i, 'ok', 'Indexed.', 'Nothing to do.'],
];
T.push({
  id: 'gsc-page-indexing-explainer', cat: SEOT, title: 'Search Console Page Indexing Report Explainer (Why Pages Are Not Indexed)',
  desc: 'Paste the reasons table from Search Console "Pages" (Why pages aren\'t indexed) and get each reason explained, rated normal or needs-action, with the fix, sorted by page count.',
  inputs: 1, labels: ['Reasons and page counts (CSV export or "reason, count" lines)'], placeholder: ['Reason,Source,Validation,Pages\nCrawled - currently not indexed,Google systems,Not Started,412'],
  sample: 'Reason,Source,Validation,Pages\nCrawled - currently not indexed,Google systems,Not Started,412\nDiscovered - currently not indexed,Google systems,Not Started,1530\nPage with redirect,Website,Not Started,88\nAlternate page with proper canonical tag,Website,Not Started,240\nNot found (404),Website,Failed,61\nSoft 404,Google systems,Not Started,14\nExcluded by \'noindex\' tag,Website,Not Started,305\nBlocked by robots.txt,Website,Not Started,17\nServer error (5xx),Website,Not Started,3',
  run: ([inp]) => {
    const rows = parseCsv(need(inp, 'the reasons table')); const items = [];
    for (const r of rows) {
      const nums = r.map((c) => num(c)).filter(Number.isFinite), reason = r.find((c) => /[A-Za-z]{4,}/.test(c) && !/^(Google systems|Website|Not Started|Started|Failed|Passed|N\/A|Pending)$/i.test(c.trim()));
      if (!reason || !nums.length || /^reason$/i.test(reason.trim())) continue; items.push({ reason: reason.trim(), n: nums[nums.length - 1] });
    }
    if (!items.length) throw new Error('No "reason, pages" rows found. Paste the table from Search Console > Pages.');
    const total = items.reduce((a, b) => a + b.n, 0), cls = { ok: 'normal', warn: 'review', bad: 'FIX' }, tot = { ok: 0, warn: 0, bad: 0, unk: 0 };
    const out = items.sort((a, b) => b.n - a.n).map((it) => {
      const m = INDEX_REASONS.find(([re]) => re.test(it.reason)); const sev = m ? m[1] : 'unk'; tot[sev] += it.n;
      return `${String(it.n).padStart(7)}  [${(cls[sev] || 'unknown').padEnd(7)}] ${it.reason}\n         ${m ? m[2] + '\n         Do: ' + m[3] : 'Reason not in this tool\'s list; open it in Search Console and inspect the example URLs.'}`;
    });
    return `${total.toLocaleString('en-US')} non-indexed URLs in ${items.length} reasons: ${tot.ok} expected, ${tot.warn} to review, ${tot.bad} to fix${tot.unk ? ', ' + tot.unk + ' unknown' : ''}.\n\n${out.join('\n\n')}\n\n"Not indexed" is not always a problem: redirects, canonicals and noindex pages are meant to be excluded. Prioritise pages that should rank. Wording follows Search Console in English; other languages will not match.`;
  },
});

// ---- CrUX / PSI field data
const CWV = { largest_contentful_paint: ['LCP', 2500, 4000, 'ms'], interaction_to_next_paint: ['INP', 200, 500, 'ms'], cumulative_layout_shift: ['CLS', 0.1, 0.25, ''], first_contentful_paint: ['FCP', 1800, 3000, 'ms'], experimental_time_to_first_byte: ['TTFB', 800, 1800, 'ms'], round_trip_time: ['RTT', 0, 0, 'ms'] };
const grade = (v, g, p) => (v <= g ? 'good' : v <= p ? 'needs improvement' : 'poor');
T.push({
  id: 'crux-response-analyzer', cat: SEOT, title: 'CrUX and PageSpeed Insights Field Data Analyzer (Core Web Vitals p75)',
  desc: 'Paste the JSON from the Chrome UX Report API (query or history) or PageSpeed Insights loadingExperience and get Core Web Vitals pass or fail, p75 vs thresholds, good/needs-improvement/poor shares and trend.',
  inputs: 1, labels: ['JSON from the CrUX API (records:queryRecord / queryHistoryRecord) or PageSpeed Insights'], placeholder: ['{"record":{"key":{"origin":"https://example.com"},"metrics":{...}}}'],
  sample: JSON.stringify({ record: { key: { origin: 'https://www.example.com', formFactor: 'PHONE' }, metrics: { largest_contentful_paint: { histogram: [{ start: 0, end: 2500, density: 0.71 }, { start: 2500, end: 4000, density: 0.19 }, { start: 4000, density: 0.1 }], percentiles: { p75: 2890 } }, interaction_to_next_paint: { histogram: [{ start: 0, end: 200, density: 0.82 }, { start: 200, end: 500, density: 0.12 }, { start: 500, density: 0.06 }], percentiles: { p75: 168 } }, cumulative_layout_shift: { histogram: [{ start: '0.00', end: '0.10', density: 0.9 }, { start: '0.10', end: '0.25', density: 0.06 }, { start: '0.25', density: 0.04 }], percentiles: { p75: '0.04' } }, first_contentful_paint: { histogram: [{ start: 0, end: 1800, density: 0.8 }, { start: 1800, end: 3000, density: 0.14 }, { start: 3000, density: 0.06 }], percentiles: { p75: 1500 } } }, collectionPeriod: { firstDate: { year: 2026, month: 9, day: 24 }, lastDate: { year: 2026, month: 10, day: 21 } } } }, null, 1),
  run: ([inp]) => {
    let j; try { j = JSON.parse(need(inp, 'the JSON response')); } catch { throw new Error('That is not valid JSON.'); }
    const out = [];
    const rec = j.record || j; const m = rec.metrics || (j.loadingExperience || j.originLoadingExperience || {}).metrics;
    if (rec.metrics && Object.values(rec.metrics)[0]?.percentilesTimeseries) { // history API
      const periods = rec.collectionPeriods || []; const rows = [];
      for (const [k, v] of Object.entries(rec.metrics)) { const c = CWV[k]; const s = (v.percentilesTimeseries?.p75s || []).map(Number).filter(Number.isFinite); if (!c || s.length < 2) continue; const f = s[0], l = s[s.length - 1]; rows.push([c[0], s.length + ' periods', round(f, 3), round(l, 3), (l - f > 0 ? '+' : '') + round(l - f, 3), c[1] ? grade(l, c[1], c[2]) : '-', l < f ? 'improving' : l > f ? 'worsening' : 'flat']); }
      if (!rows.length) throw new Error('History response has no p75 time series.');
      out.push(sec(`CrUX history (${periods.length} collection periods; lower is better)`, table(['metric', 'periods', 'first p75', 'last p75', 'change', 'now', 'trend'], rows)));
      return out.join('\n\n') + '\n\nTrend is the first versus the last period only; check the series for spikes before drawing conclusions.';
    }
    if (!m) throw new Error('No metrics found. Expected a CrUX "record.metrics" object or PageSpeed Insights "loadingExperience.metrics".');
    const rows = []; const verdict = {};
    for (const [k, v] of Object.entries(m)) {
      const psi = k === k.toUpperCase(); const name = psi ? ({ LARGEST_CONTENTFUL_PAINT_MS: 'largest_contentful_paint', INTERACTION_TO_NEXT_PAINT: 'interaction_to_next_paint', CUMULATIVE_LAYOUT_SHIFT_SCORE: 'cumulative_layout_shift', FIRST_CONTENTFUL_PAINT_MS: 'first_contentful_paint', EXPERIMENTAL_TIME_TO_FIRST_BYTE: 'experimental_time_to_first_byte' })[k] : k; const c = CWV[name]; if (!c || !c[1]) continue;
      let p75 = psi ? Number(v.percentile) : Number(v.percentiles?.p75); if (psi && name === 'cumulative_layout_shift') p75 /= 100;
      const dens = psi ? (v.distributions || []).map((d) => d.proportion) : (v.histogram || []).map((h) => Number(h.density));
      const g = grade(p75, c[1], c[2]); verdict[c[0]] = g;
      rows.push([c[0], round(p75, 3) + c[3], `good <= ${c[1]}${c[3]}, poor > ${c[2]}${c[3]}`, g, dens.length === 3 ? dens.map((d) => round(d * 100, 1) + '%').join(' / ') : 'n/a']);
    }
    if (!rows.length) throw new Error('No recognised metrics (LCP, INP, CLS, FCP, TTFB) found.');
    const key = rec.key || {}; out.push(`Source: ${key.origin || key.url || j.id || 'unknown'}${key.formFactor ? ' (' + key.formFactor + ')' : ''}`);
    out.push(table(['metric', 'p75', 'thresholds', 'verdict', 'good / NI / poor users'], rows));
    const core = ['LCP', 'INP', 'CLS'].filter((x) => verdict[x]); const allGood = core.length === 3 && core.every((x) => verdict[x] === 'good');
    out.push(core.length === 3 ? `Core Web Vitals assessment: ${allGood ? 'PASSED (all three at the 75th percentile are good)' : 'NOT PASSED: ' + core.filter((x) => verdict[x] !== 'good').map((x) => `${x} is ${verdict[x]}`).join(', ')}` : `Core Web Vitals assessment: incomplete, missing ${['LCP', 'INP', 'CLS'].filter((x) => !verdict[x]).join(', ')}.`);
    out.push('p75 means 75% of page loads were at least this good. Field data covers the last 28 days of real Chrome users and is not a lab test. Thresholds are the published web.dev values.');
    return out.join('\n\n');
  },
});

// ---- rank history
T.push({
  id: 'rank-history-analyzer', cat: SEOX, title: 'Keyword Rank History Analyzer (Movers, Volatility, Top-10 Share)',
  desc: 'Paste rank tracker data (date, keyword, position) and see per-keyword change, best and worst, volatility, entries and exits from the top 3 and top 10, plus the days with the biggest overall movement.',
  inputs: 1, labels: ['Rank data CSV: date, keyword, position (long) or keyword plus one column per date (wide)'], placeholder: ['date,keyword,position\n2026-10-01,blue widgets,8'],
  sample: 'keyword,2026-10-01,2026-10-08,2026-10-15,2026-10-22\nblue widgets,8,7,4,3\nwidget size guide,15,14,22,25\nbuy widgets online,3,3,3,3\nwidget manual,40,38,12,9\ncheap widgets,6,11,5,18',
  run: ([inp]) => {
    const rows = parseCsv(need(inp, 'rank data')); const head = rows[0].map((h) => h.trim()); const series = new Map(); const dates = new Set();
    const wide = colIdx(head, 'position') < 0;
    if (wide) { const ik = colIdx(head, 'keyword', 'query', 'term'); const k0 = ik < 0 ? 0 : ik; for (const r of rows.slice(1)) { const kw = r[k0]; if (!kw) continue; head.forEach((d, i) => { if (i === k0) return; const v = num(r[i]); if (Number.isFinite(v)) { (series.get(kw) || series.set(kw, new Map()).get(kw)).set(d, v); dates.add(d); } }); } }
    else { const id = colIdx(head, 'date', 'day'), ik = colIdx(head, 'keyword', 'query', 'term'), ip = colIdx(head, 'position', 'rank'); for (const r of rows.slice(1)) { const v = num(r[ip]); if (!Number.isFinite(v) || !r[ik]) continue; (series.get(r[ik]) || series.set(r[ik], new Map()).get(r[ik])).set(r[id], v); dates.add(r[id]); } }
    const D = [...dates].sort(); if (D.length < 2 || !series.size) throw new Error('Need at least two dates and one keyword.');
    const stats = [...series].map(([kw, m]) => { const v = D.map((d) => m.get(d)).filter((x) => x != null); const first = v[0], last = v[v.length - 1], mean = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length); return { kw, first, last, best: Math.min(...v), worst: Math.max(...v), mean, sd, change: first - last, n: v.length, vals: D.map((d) => m.get(d)) }; });
    const out = [`${stats.length} keywords over ${D.length} dates (${D[0]} to ${D[D.length - 1]}). Positive change = moved up.`];
    out.push(sec('Keywords', table(['keyword', 'first', 'last', 'change', 'best', 'worst', 'volatility (sd)'], stats.sort((a, b) => b.change - a.change).map((s) => [s.kw.slice(0, 40), s.first, s.last, (s.change > 0 ? '+' : '') + s.change, s.best, s.worst, round(s.sd, 1)]))));
    const t3 = (f) => stats.filter((s) => f(s)).map((s) => s.kw);
    out.push(sec('Top-of-page movement', [`Entered top 3: ${t3((s) => s.first > 3 && s.last <= 3).join(', ') || 'none'}`, `Left top 3: ${t3((s) => s.first <= 3 && s.last > 3).join(', ') || 'none'}`, `Entered top 10: ${t3((s) => s.first > 10 && s.last <= 10).join(', ') || 'none'}`, `Left top 10: ${t3((s) => s.first <= 10 && s.last > 10).join(', ') || 'none'}`, `Top-10 share: ${pct(stats.filter((s) => s.first <= 10).length, stats.length)} at start, ${pct(stats.filter((s) => s.last <= 10).length, stats.length)} at end`].join('\n')));
    const per = D.slice(1).map((d, i) => { const diffs = stats.map((s) => (s.vals[i] != null && s.vals[i + 1] != null ? Math.abs(s.vals[i + 1] - s.vals[i]) : null)).filter((x) => x != null); return [d, round(diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1), 2)]; });
    out.push(sec('Average absolute position change per period (high = turbulent SERPs or a ranking update)', table(['date', 'avg change'], per)));
    out.push('Rank trackers sample positions at a moment, from one location and device; day-to-day noise of a few places is normal. Compare with known update dates before blaming an algorithm change.');
    return out.join('\n\n');
  },
});

// ---- Google Trends CSV
T.push({
  id: 'trends-csv-analyzer', cat: SEOX, title: 'Google Trends CSV Analyzer (Seasonality, Peak, Growth)',
  desc: 'Paste a Google Trends "interest over time" CSV and get peak dates, recent growth, year-on-year change and a month-by-month seasonality profile for each search term. Runs offline.',
  inputs: 1, labels: ['Google Trends CSV (interest over time)'], placeholder: ['Category: All categories\n\nMonth,widgets: (Worldwide)\n2024-01,45'],
  sample: 'Category: All categories\n\nMonth,blue widgets: (Worldwide),widget size guide: (Worldwide)\n2024-01,40,12\n2024-02,38,14\n2024-03,42,18\n2024-04,55,20\n2024-05,61,25\n2024-06,70,30\n2024-07,66,22\n2024-08,60,19\n2024-09,52,28\n2024-10,48,31\n2024-11,75,35\n2024-12,100,40\n2025-01,44,15\n2025-02,41,17\n2025-03,48,22\n2025-04,60,24\n2025-05,66,29\n2025-06,78,34\n2025-07,72,27\n2025-08,64,23\n2025-09,58,33\n2025-10,55,36\n2025-11,82,41\n2025-12,96,45',
  run: ([inp]) => {
    const rows = parseCsv(need(inp, 'the Trends CSV')); const hi = rows.findIndex((r) => r.length >= 2 && /^(day|week|month|time|date)/i.test(r[0].trim())); if (hi < 0) throw new Error('Could not find the header row (Day, Week or Month).');
    const terms = rows[hi].slice(1).map((t) => t.replace(/:\s*\(.*\)\s*$/, '').trim()), data = rows.slice(hi + 1).filter((r) => /^\d{4}-\d{2}/.test(r[0]));
    if (!data.length) throw new Error('No dated rows found.');
    const dates = data.map((r) => r[0]), out = [`${terms.length} term${terms.length > 1 ? 's' : ''}, ${data.length} points from ${dates[0]} to ${dates[dates.length - 1]}. Values are relative interest (100 = the peak in this export), not search volume.`];
    terms.forEach((t, ti) => {
      const v = data.map((r) => { const x = num(String(r[ti + 1]).replace('<1', '0.5')); return Number.isFinite(x) ? x : 0; }), max = Math.max(...v), pk = dates[v.indexOf(max)], n = v.length, w = Math.min(12, Math.floor(n / 2));
      const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1), recent = avg(v.slice(-w)), prior = avg(v.slice(-2 * w, -w));
      const xs = v.map((_, i) => i), mx = avg(xs), my = avg(v), slope = xs.reduce((a, x, i) => a + (x - mx) * (v[i] - my), 0) / (xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1);
      const lines = [`peak ${max} on ${pk}; average ${round(my, 1)}; latest ${v[n - 1]}`, `last ${w} points vs the ${w} before: ${prior ? (recent >= prior ? '+' : '') + round(((recent - prior) / prior) * 100, 0) + '%' : 'n/a'}`, `linear trend: ${slope > 0.05 ? 'rising' : slope < -0.05 ? 'falling' : 'flat'} (${round(slope, 2)} points per period)`];
      if (/^\d{4}-\d{2}(-\d{2})?$/.test(dates[0]) && n >= 24) { const mo = Array.from({ length: 12 }, () => []); data.forEach((r, i) => mo[+r[0].slice(5, 7) - 1].push(v[i])); const ma = mo.map((a) => avg(a)), best = ma.indexOf(Math.max(...ma)), low = ma.indexOf(Math.min(...ma)); const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; lines.push(`seasonality: strongest in ${names[best]} (${round(ma[best], 0)}), weakest in ${names[low]} (${round(ma[low], 0)}); ${ma[best] / (ma[low] || 1) > 1.5 ? 'clearly seasonal' : 'weak seasonality'}`, `monthly profile: ${ma.map((x, i) => names[i] + ' ' + round(x, 0)).join(', ')}`); }
      out.push(sec(t, lines.join('\n')));
    });
    out.push('Google Trends samples searches and rescales every export; compare terms only inside the same export. It shows relative interest, never absolute search volume.');
    return out.join('\n\n');
  },
});

// ---- backlinks export
const SPAM_TLD = /\.(xyz|top|click|loan|work|gq|cf|tk|ml|ga|icu|buzz|rest|monster|cyou|casa|bid|win|party|review|stream|download|men|date|racing|trade|cricket|faith|science|accountant)$/i;
const SPAM_WORDS = /(casino|viagra|cialis|porn|xxx|betting|poker|payday|loan|essay|replica|escort|pills|slots|crypto-?loans?)/i;
T.push({
  id: 'backlink-export-analyzer', cat: SEOX, title: 'Backlink Export Analyzer (Referring Domains, Anchors, Nofollow, Risky Links)',
  desc: 'Paste a backlink CSV from Ahrefs, Semrush, Moz, Majestic or Search Console and get referring-domain counts, dofollow share, anchor text mix, top domains, link growth by month and links that look risky.',
  inputs: 1, labels: ['Backlink CSV (needs a source URL column; anchor, rel/nofollow and first-seen columns are used if present)'], placeholder: ['Referring page URL,Target URL,Anchor,Nofollow,First seen'],
  opts: [{ id: 'brand', label: 'Brand terms (comma separated)', type: 'text', def: 'example' }, { id: 'target', label: 'Your domain (to classify naked-URL anchors)', type: 'text', def: 'example.com' }],
  sample: 'Referring page URL,Target URL,Anchor,Nofollow,First seen\nhttps://www.bbc.co.uk/news/a,https://example.com/,Example Shop,false,2025-03-01\nhttps://blog.widgetfans.org/best-widgets,https://example.com/widgets/blue,best blue widgets,false,2025-06-12\nhttps://blog.widgetfans.org/about,https://example.com/,example.com,false,2025-06-12\nhttps://cheap-casino-slots.xyz/p1,https://example.com/,buy cheap widgets,false,2026-01-04\nhttps://cheap-casino-slots.xyz/p2,https://example.com/,widgets,false,2026-01-04\nhttps://news.ycombinator.com/item?id=1,https://example.com/,click here,true,2026-02-10\nhttps://forum.example.net/t/9,https://example.com/shop,,true,2026-02-11\nhttps://www.reddit.com/r/widgets/x,https://example.com/,https://example.com/,true,2026-03-02\nhttps://directory-links.top/list,https://example.com/,Example,false,2026-03-05',
  run: ([inp], o) => {
    const rows = parseCsv(need(inp, 'a backlink CSV')), head = rows[0], iS = colIdx(head, 'referring page url', 'source url', 'from url', 'source', 'url from', 'referring page', 'page url', 'linking page', 'from'), iA = colIdx(head, 'anchor', 'link text'), iN = colIdx(head, 'nofollow', 'rel', 'link type', 'type'), iD = colIdx(head, 'first seen', 'first_seen', 'discovered', 'date');
    if (iS < 0) throw new Error('No source URL column found (expected a header such as "Referring page URL" or "Source URL").');
    const brand = String(o.brand || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean), me = hostOf(o.target || '');
    const L = rows.slice(1).filter((r) => r[iS]).map((r) => ({ src: r[iS], host: hostOf(r[iS]), anchor: iA >= 0 ? (r[iA] || '').trim() : '', nf: iN >= 0 ? /nofollow|true|ugc|sponsored|yes|^1$/i.test(r[iN]) : false, date: iD >= 0 ? r[iD] : '' }));
    if (!L.length) throw new Error('No links found.');
    const doms = new Map(); L.forEach((l) => { const d = rootDomain(l.host); doms.set(d, (doms.get(d) || 0) + 1); });
    const nf = L.filter((l) => l.nf).length, out = [`${L.length} links from ${doms.size} referring domains (${round(L.length / doms.size, 1)} links per domain). ${iN >= 0 ? `${pct(L.length - nf, L.length)} dofollow, ${pct(nf, L.length)} nofollow/ugc/sponsored.` : 'No nofollow column found.'}`];
    const top = [...doms].sort((a, b) => b[1] - a[1]).slice(0, 10); out.push(sec('Top referring domains', table(['domain', 'links', 'share'], top.map(([d, n]) => [d, n, pct(n, L.length)]))));
    if (iA >= 0) {
      const cls = { branded: 0, 'naked URL': 0, generic: 0, empty: 0, 'exact/partial match': 0 }; const cnt = new Map();
      L.forEach((l) => { const a = l.anchor.toLowerCase(); cnt.set(a || '(empty)', (cnt.get(a || '(empty)') || 0) + 1); if (!a) cls.empty++; else if (/^(https?:\/\/|www\.)|\.(com|net|org|io|eu|be|nl|de|fr)(\/|$)/.test(a) || (me && a.includes(me))) cls['naked URL']++; else if (brand.some((b) => a.includes(b))) cls.branded++; else if (GENERIC_ANCHOR.test(a) || /^(website|site|source|visit|homepage|link)$/.test(a)) cls.generic++; else cls['exact/partial match']++; });
      out.push(sec('Anchor text mix', table(['type', 'links', 'share'], Object.entries(cls).map(([k, n]) => [k, n, pct(n, L.length)])) + '\n\nTop anchors: ' + [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([a, n]) => `"${a}" (${n})`).join(', ')));
      if (cls['exact/partial match'] / L.length > 0.4) out.push('NOTE: over 40% of anchors are keyword-style, which looks unnatural next to a normal mix of brand and naked-URL anchors.');
    }
    const tl = [...new Set(L.map((l) => l.host))], tld = {}; tl.forEach((h) => { const t = h.split('.').pop(); tld[t] = (tld[t] || 0) + 1; });
    out.push(sec('TLD spread (hosts)', Object.entries(tld).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, n]) => `.${t}: ${n}`).join(', ')));
    const risky = L.filter((l) => SPAM_TLD.test(l.host) || SPAM_WORDS.test(l.host) || SPAM_WORDS.test(l.anchor)); const rd = new Map(); risky.forEach((l) => rd.set(rootDomain(l.host), (rd.get(rootDomain(l.host)) || 0) + 1));
    out.push(sec(`Links that look risky (${risky.length} links, ${rd.size} domains)`, rd.size ? [...rd].map(([d, n]) => `${d} (${n})`).join('\n') + '\n\nThese match a short list of cheap TLDs and spam words only. Review them by hand; Google ignores most spam links, and the disavow tool is for unnatural link patterns you cannot get removed.' : 'none matched the short spam-TLD and spam-word lists'));
    if (iD >= 0) { const mon = {}; L.forEach((l) => { const m = (l.date || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(m)) mon[m] = (mon[m] || 0) + 1; }); const e = Object.entries(mon).sort(); if (e.length) out.push(sec('Links first seen per month', e.map(([m, n]) => `${m}  ${'#'.repeat(Math.min(40, n))} ${n}`).join('\n'))); }
    out.push('Summaries are only as complete as the export (tools show different samples of the web). Authority and spam scores are not computed here because they need crawled link graphs.');
    return out.join('\n\n');
  },
});

// ---- link intersect
T.push({
  id: 'link-intersect-tool', cat: SEOX, title: 'Link Intersect: Domains Linking to Competitors but Not to You',
  desc: 'Paste referring-domain lists for your site and up to three competitors and find the domains that link to two or more competitors but not to you: the warmest link-building targets.',
  inputs: 4, labels: ['Your referring domains (one per line)', 'Competitor 1 referring domains', 'Competitor 2 referring domains', 'Competitor 3 referring domains (optional)'], placeholder: ['news.example.org\nblog.widgets.com'],
  sample: 'bbc.co.uk\nwidgetfans.org\nreddit.com\nlocalpaper.be', sample2: 'bbc.co.uk\nwidgetreview.net\nwidgetfans.org\ndiy-forum.com\ntechradar.com\nwidgetassociation.org\nlistly.io',
  run: ([you, c1, c2, c3]) => {
    const parse = (t) => new Set(String(t || '').split(/[\r\n,;\t]+/).map((x) => x.trim()).filter(Boolean).map((x) => rootDomain(hostOf(x.split(/\s+/)[0]))).filter((x) => x.includes('.')));
    const mine = parse(you), comps = [c1, c2, c3].map(parse).filter((s) => s.size); if (!mine.size) throw new Error('Paste your own referring domains in the first box.'); if (!comps.length) throw new Error('Paste at least one competitor list.');
    const hits = new Map(); comps.forEach((s, i) => s.forEach((d) => { if (!mine.has(d)) (hits.get(d) || hits.set(d, []).get(d)).push(i + 1); }));
    const rows = [...hits].map(([d, c]) => [d, c.length, c.map((x) => 'C' + x).join(' ')]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const multi = rows.filter((r) => r[1] >= 2), shared = comps.length ? [...comps[0]].filter((d) => comps.every((s) => s.has(d))) : [];
    const out = [`You: ${mine.size} domains. ${comps.length} competitor list${comps.length > 1 ? 's' : ''}: ${comps.map((s) => s.size).join(', ')} domains. ${rows.length} domains link to a competitor but not to you.`];
    out.push(sec(`Link to 2+ competitors but not you (${multi.length})`, multi.length ? table(['domain', 'competitors', 'which'], multi) : 'none (add more competitor lists, or look at the single-competitor list below)'));
    out.push(sec(`Link to exactly one competitor (${rows.length - multi.length})`, rows.filter((r) => r[1] === 1).map((r) => `${r[0]}  (${r[2]})`).join('\n') || 'none'));
    out.push(sec('Link to you and every competitor (common ground)', shared.filter((d) => mine.has(d)).join('\n') || 'none'));
    out.push('Domains are compared by registered domain (www and subdomains merged). A domain that links to several competitors is usually a topical resource, directory or journalist: check each page for relevance before outreach.');
    return out.join('\n\n');
  },
});

// ---- wayback CDX
T.push({
  id: 'wayback-cdx-analyzer', cat: SEOX, title: 'Wayback Machine CDX Analyzer (Snapshots, Status Codes, Content Changes)',
  desc: 'Paste output of the Internet Archive CDX API and see capture counts per year, status codes, how often the content really changed (digest), gaps, and clickable archive links for each change.',
  inputs: 1, labels: ['CDX lines (urlkey timestamp original mimetype statuscode digest length) or JSON output'], placeholder: ['com,example)/ 20190304120000 https://example.com/ text/html 200 ABCD 1234'],
  sample: 'com,example)/ 20190304120000 https://example.com/ text/html 200 AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA 5120\ncom,example)/ 20190905101010 https://example.com/ text/html 200 AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA 5120\ncom,example)/ 20200110090000 https://example.com/ text/html 301 BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB 410\ncom,example)/ 20200110090100 https://example.com/ text/html 200 CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC 8100\ncom,example)/ 20220622180000 https://example.com/ text/html 200 DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD 9900\ncom,example)/ 20220923180000 https://example.com/ text/html 503 EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE 300\ncom,example)/ 20250115120000 https://example.com/ text/html 200 FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF 12400',
  run: ([inp]) => {
    const t = need(inp, 'CDX output'); let recs = [];
    if (/^\s*\[/.test(t)) { try { const j = JSON.parse(t); const h = j[0]; const idx = (n) => h.indexOf(n); recs = j.slice(1).map((r) => ({ ts: r[idx('timestamp')], url: r[idx('original')], mime: r[idx('mimetype')], status: r[idx('statuscode')], digest: r[idx('digest')], len: r[idx('length')] })); } catch { throw new Error('Could not parse the JSON.'); } }
    else recs = lines(t).map((l) => l.split(/\s+/)).filter((p) => /^\d{14}$/.test(p[1] ?? p[0])).map((p) => (/^\d{14}$/.test(p[0]) ? { ts: p[0], url: p[1], status: p[2], digest: p[3] } : { ts: p[1], url: p[2], mime: p[3], status: p[4], digest: p[5], len: p[6] }));
    if (!recs.length) throw new Error('No CDX records found (timestamps must be 14 digits).');
    recs.sort((a, b) => a.ts.localeCompare(b.ts));
    const dt = (ts) => new Date(Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8))), ymd = (ts) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
    const yr = {}, st = {}; recs.forEach((r) => { yr[r.ts.slice(0, 4)] = (yr[r.ts.slice(0, 4)] || 0) + 1; st[r.status || '-'] = (st[r.status || '-'] || 0) + 1; });
    const ok = recs.filter((r) => r.status === '200'); let changes = [], prev = null; for (const r of ok) { if (!prev || r.digest !== prev.digest) changes.push(r); prev = r; }
    let gap = { d: 0 }; for (let i = 1; i < recs.length; i++) { const d = (dt(recs[i].ts) - dt(recs[i - 1].ts)) / 86400000; if (d > gap.d) gap = { d, a: recs[i - 1].ts, b: recs[i].ts }; }
    const out = [`${recs.length} captures of ${recs[0].url}, ${ymd(recs[0].ts)} to ${ymd(recs[recs.length - 1].ts)}; ${new Set(ok.map((r) => r.digest)).size} distinct content versions among the ${ok.length} HTTP 200 captures.`];
    out.push(sec('Captures per year', Object.entries(yr).map(([y, n]) => `${y}  ${'#'.repeat(Math.min(50, n))} ${n}`).join('\n')), sec('Status codes', Object.entries(st).map(([c, n]) => `${c}: ${n}`).join(', ')));
    out.push(sec(`Content changes (${changes.length}): each is the first capture with new content`, changes.map((r) => `${ymd(r.ts)}  ${r.len ? r.len + ' bytes  ' : ''}https://web.archive.org/web/${r.ts}/${r.url}`).join('\n')));
    out.push(`Longest gap between captures: ${Math.round(gap.d)} days (${ymd(gap.a || recs[0].ts)} to ${ymd(gap.b || recs[0].ts)}).`);
    const bad = recs.filter((r) => /^[45]/.test(r.status || '')); if (bad.length) out.push(sec('Error captures (possible downtime or removal)', bad.map((r) => `${ymd(r.ts)}  HTTP ${r.status}`).join('\n')));
    out.push('The digest is a hash of the response body: a changed digest means different bytes (ads, timestamps and scripts can change it without a real edit). To get this data, open the CDX API URL web.archive.org/cdx/search/cdx?url=YOURURL&output=txt&fl=urlkey,timestamp,original,mimetype,statuscode,digest,length in your browser and paste the result; this page makes no request.');
    return out.join('\n\n');
  },
});

// ---- uptime log
T.push({
  id: 'uptime-log-analyzer', cat: NET, title: 'Uptime Log Analyzer (Availability %, Outages, MTTR, SLA Budget)',
  desc: 'Paste monitoring checks (timestamp and up/down or HTTP status) and get availability percent, outage list, longest outage, mean time to recover and how it compares with 99.9% and 99.99% SLAs.',
  inputs: 1, labels: ['One check per line: timestamp, then up/down/ok/fail or an HTTP status'], placeholder: ['2026-10-01T10:00:00Z up\n2026-10-01T10:01:00Z 503'],
  opts: [{ id: 'interval', label: 'Check interval in seconds (0 = use the gaps between lines)', type: 'number', def: 60 }],
  sample: [...Array(30).keys()].map((i) => `2026-10-01T10:${String(i).padStart(2, '0')}:00Z ${i >= 8 && i <= 11 ? 503 : i === 20 ? 'down' : 200}`).join('\n'),
  run: ([inp], o) => {
    const pts = lines(need(inp, 'monitoring checks')).map((l) => { const m = /^(\S+?(?:T\S+|\s\d{2}:\d{2}:\d{2}\S*)?)[\s,;]+(.+)$/.exec(l) || /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:?\d{2})?)[\s,;]+(.+)$/.exec(l); if (!m) return null; const t = Date.parse(m[1].replace(' ', 'T').replace(/([^Z\d])$/, '$1')); if (Number.isNaN(t)) return null; const s = m[2].trim().toLowerCase(); const up = /^(up|ok|true|pass|success|1|[23]\d\d\b)/.test(s); return { t, up }; }).filter(Boolean).sort((a, b) => a.t - b.t);
    if (pts.length < 2) throw new Error('Need at least two parsable lines (timestamp + status).');
    const iv = (+o.interval > 0 ? +o.interval * 1000 : null) ?? 0; const dur = (i) => (iv || (pts[i + 1] ? pts[i + 1].t - pts[i].t : pts[i].t - pts[i - 1].t));
    let upT = 0, total = 0; const out = []; let cur = null;
    pts.forEach((p, i) => { const d = Math.min(dur(i), iv ? iv : 1e12); total += d; if (p.up) { upT += d; if (cur) { out.push(cur); cur = null; } } else { if (!cur) cur = { start: p.t, ms: 0, n: 0 }; cur.ms += d; cur.n++; } });
    if (cur) out.push(cur);
    const avail = (upT / total) * 100, fmtD = (ms) => ms >= 3600000 ? round(ms / 3600000, 2) + ' h' : ms >= 60000 ? round(ms / 60000, 1) + ' min' : round(ms / 1000, 0) + ' s';
    const span = pts[pts.length - 1].t - pts[0].t + (iv || 0);
    const lines2 = [`${pts.length} checks over ${fmtD(span)}: availability ${round(avail, 3)}%, ${out.length} outage${out.length === 1 ? '' : 's'}, ${pts.filter((p) => !p.up).length} failed checks.`];
    if (out.length) { lines2.push(sec('Outages', table(['start (UTC)', 'duration', 'failed checks'], out.map((x) => [new Date(x.start).toISOString().replace('T', ' ').slice(0, 19), fmtD(x.ms), x.n]))), `Longest outage ${fmtD(Math.max(...out.map((x) => x.ms)))}; mean time to recover ${fmtD(out.reduce((a, x) => a + x.ms, 0) / out.length)}; mean time between failures ${fmtD((total - out.reduce((a, x) => a + x.ms, 0)) / out.length)}.`); }
    const month = 30.44 * 86400000, rows = [['99%', 0.01], ['99.9%', 0.001], ['99.95%', 0.0005], ['99.99%', 0.0001], ['99.999%', 0.00001]].map(([n, f]) => [n, fmtD(month * f), fmtD(365.25 * 86400000 * f), avail >= 100 - f * 100 ? 'met' : 'missed']);
    lines2.push(sec('Downtime allowed by an SLA, and whether this log meets it', table(['SLA', 'per month', 'per year', 'this log'], rows)));
    lines2.push('Checks only see what the monitor can reach: its location, interval and what counts as "up" (200? content match?) decide the result. A 1-minute interval cannot see a 20-second outage.');
    return lines2.join('\n\n');
  },
});

// ====================================================================== captions, mail merge, content and code helpers
const ts = (ms, sep) => { ms = Math.max(0, Math.round(ms)); const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`; };
const tms = (s) => { const m = /(?:(\d+):)?(\d+):(\d+)[.,](\d{1,3})/.exec(s); return m ? ((+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3]) * 1000 + +m[4].padEnd(3, '0') : NaN; };
function parseCaptions(t) {
  const s = t.trim(); let cues = [];
  if (s.startsWith('{') ) { const j = JSON.parse(s); cues = (j.events || []).filter((e) => e.segs).map((e) => ({ start: e.tStartMs, end: e.tStartMs + (e.dDurationMs || 0), text: e.segs.map((g) => g.utf8).join('').replace(/\n/g, ' ') })); }
  else if (/<transcript|<timedtext|<text\b|<p\b/i.test(s) && s.startsWith('<')) {
    for (const m of s.matchAll(/<text\b[^>]*\bstart="([\d.]+)"(?:[^>]*\bdur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)) cues.push({ start: +m[1] * 1000, end: (+m[1] + +(m[2] || 0)) * 1000, text: decodeEnt(m[3].replace(/<[^>]+>/g, '')) });
    if (!cues.length) for (const m of s.matchAll(/<p\b[^>]*\bt="(\d+)"(?:[^>]*\bd="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g)) cues.push({ start: +m[1], end: +m[1] + +(m[2] || 0), text: decodeEnt(m[3].replace(/<[^>]+>/g, '')) });
  } else for (const block of s.replace(/\r\n?/g, '\n').replace(/^WEBVTT[^\n]*\n/, '').split(/\n{2,}/)) {
    const ls = block.split('\n'); const i = ls.findIndex((l) => l.includes('-->')); if (i < 0) continue;
    const [a, b] = ls[i].split('-->'); cues.push({ start: tms(a.trim()), end: tms(b.trim().split(/\s+/)[0]), text: ls.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim() });
  }
  cues = cues.filter((c) => Number.isFinite(c.start) && c.text.trim()).map((c) => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() }));
  if (!cues.length) throw new Error('No caption cues found. Paste YouTube timedtext XML (srv1/srv3), json3, SRT or WebVTT.');
  return cues;
}
T.push({
  id: 'youtube-caption-format-converter', cat: 'Text+', title: 'YouTube Caption Converter (timedtext XML, json3, SRT, VTT to Text)',
  desc: 'Convert YouTube caption data (timedtext XML, json3, SRT, WebVTT) into SRT, VTT, plain transcript or timestamped text. Paste what the player or yt-dlp saved; nothing is fetched.',
  inputs: 1, labels: ['Caption data (timedtext XML srv1/srv3, json3, SRT or WebVTT)'], placeholder: ['<?xml version="1.0"?><transcript><text start="0" dur="2.5">Hello</text></transcript>'],
  opts: [{ id: 'to', label: 'Output', type: 'select', choices: ['Plain transcript', 'Transcript with [mm:ss]', 'SRT', 'WebVTT'], def: 'Plain transcript' }, { id: 'dedupe', label: 'Merge repeated rolling lines (auto-captions)', type: 'checkbox', def: true }],
  sample: '<?xml version="1.0" encoding="utf-8" ?><transcript><text start="0.5" dur="3.2">Welcome back to the channel,</text><text start="3.7" dur="2.9">today we&#39;re talking about cold brew.</text><text start="6.6" dur="4.1">First, grab 100 g of coarse coffee &amp; a jar.</text><text start="10.7" dur="3">Then add one litre of water.</text></transcript>',
  run: ([inp], o) => {
    let cues = parseCaptions(need(inp, 'caption data'));
    if (o.dedupe) cues = cues.filter((c, i) => !(i > 0 && (cues[i - 1].text === c.text || cues[i - 1].text.endsWith(c.text))));
    const mmss = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
    switch (o.to) {
      case 'SRT': return cues.map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end || c.start + 2000, ',')}\n${c.text}\n`).join('\n');
      case 'WebVTT': return 'WEBVTT\n\n' + cues.map((c) => `${ts(c.start, '.')} --> ${ts(c.end || c.start + 2000, '.')}\n${c.text}\n`).join('\n');
      case 'Transcript with [mm:ss]': return cues.map((c) => `[${mmss(c.start)}] ${c.text}`).join('\n');
      default: return cues.map((c) => c.text).join(' ').replace(/\s+([,.!?;:])/g, '$1');
    }
  },
});

// ---- mail merge
T.push({
  id: 'outreach-mail-merge', cat: 'Marketing', title: 'Outreach Mail Merge (Personalise Emails from a CSV)',
  desc: 'Fill an email template with each row of a CSV: {{first_name|there}} placeholders with fallbacks, subject line, missing-field warnings and ready mailto links. Works offline; nothing is sent.',
  inputs: 2, labels: ['Template (use {{column}} or {{column|fallback}}; first line "Subject: ...")', 'Contacts CSV (header row, with an email column)'], placeholder: ['Subject: Quick idea for {{company}}\n\nHi {{first_name|there}},\n...', 'first_name,company,email,hook\nAnna,Acme,anna@acme.test,your guide to widgets'],
  sample: 'Subject: A resource for {{company}}\n\nHi {{first_name|there}},\n\nI read {{hook}} and thought our widget size guide could help your readers.\n\nWould you consider linking to it?\n\nBest,\nSam',
  sample2: 'first_name,company,email,hook\nAnna,Acme Widgets,anna@acme.test,your guide to blue widgets\n,Bolt & Co,info@bolt.test,the 2026 widget report\nLuc,Initech,luc@initech.test,',
  run: ([tpl, csv]) => {
    const t = need(tpl, 'the template'), rows = parseCsv(need(csv, 'the contacts CSV')); if (rows.length < 2) throw new Error('The CSV needs a header row and at least one contact.');
    const head = rows[0].map((h) => h.trim()), emailCol = colIdx(head, 'email', 'e-mail', 'mail'); const out = []; let warn = 0;
    rows.slice(1).forEach((r, n) => {
      const miss = []; const fill = (s) => s.replace(/\{\{\s*([\w .-]+?)\s*(?:\|([^}]*))?\}\}/g, (m, k, fb) => { const i = head.findIndex((h) => h.toLowerCase() === k.toLowerCase()); const v = i >= 0 ? (r[i] || '').trim() : ''; if (v) return v; if (fb !== undefined) return fb.trim(); miss.push(k); return `[${k}?]`; });
      const body = fill(t), sm = /^Subject:\s*(.*)\n?/i.exec(body), subject = sm ? sm[1] : '', text = sm ? body.slice(sm[0].length).replace(/^\n+/, '') : body, to = emailCol >= 0 ? (r[emailCol] || '').trim() : '';
      if (miss.length) warn++;
      out.push(`#${n + 1}  To: ${to || '(no email)'}${miss.length ? `   WARNING missing: ${[...new Set(miss)].join(', ')}` : ''}\nSubject: ${subject}\n\n${text}\n\nmailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`);
    });
    return `${out.length} emails, ${warn} with missing fields (shown as [field?]).\n\n${out.join('\n\n' + '='.repeat(50) + '\n\n')}\n\nNothing is sent from this page. Check consent rules for cold email (GDPR, CAN-SPAM, ePrivacy), include a real sender identity and an easy way to opt out.`;
  },
});

// ---- content freshness
T.push({
  id: 'content-freshness-audit', cat: SEOC, title: 'Content Freshness Audit (Outdated Years, Versions and Time Phrases)',
  desc: 'Paste an article or page and find what has gone stale: old years, "this year" and "recently" phrases, software versions, statistics without a date, copyright year and COVID-era wording. Gives a refresh checklist.',
  inputs: 1, labels: ['Article text or HTML'], placeholder: ['In 2021 we recommend...'],
  opts: [{ id: 'year', label: 'Current year', type: 'number', def: new Date().getFullYear() }, { id: 'maxage', label: 'Flag years older than (years)', type: 'number', def: 2 }],
  sample: 'Best Widgets in 2022\n\nUpdated March 2021. This year the market grew by 14% according to a survey. We tested iOS 15 and Node 14 compatibility, and recently added support for Windows 10 users. Since the pandemic, lockdown rules have changed how people buy widgets. As of 2020, 62% of shops used the old model. Copyright 2019 Example.',
  run: ([inp], o) => {
    const raw = need(inp, 'the content'), text = /<\w+[^>]*>/.test(raw) ? textOfHtml(raw) : raw, Y = +o.year || new Date().getFullYear(), age = +o.maxage || 2, F = [];
    const snip = (i, len = 70) => text.slice(Math.max(0, i - 30), i + len).replace(/\s+/g, ' ').trim();
    const years = new Map(); for (const m of text.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)) { const y = +m[1]; if (y <= Y - age) (years.get(y) || years.set(y, []).get(y)).push(snip(m.index)); }
    for (const [y, a] of [...years].sort()) F.push(['year ' + y, `${a.length}x, ${Y - y} years old`, '"' + a[0] + '"']);
    for (const [re, label, why] of [[/\b(this year|last year|next year|this month|currently|at the moment|these days|nowadays|recently|just launched|brand[- ]new|latest)\b/gi, 'relative time', 'relative wording ages every month; use a date'], [/\b(covid|coronavirus|pandemic|lockdown|post-covid)\b/gi, 'pandemic wording', 'check whether this still matches today'], [/\b(iOS|Android|Windows|macOS|Node(?:\.js)?|Python|PHP|Java|Angular|React|Vue|Ubuntu|Chrome|Firefox)\s*v?(\d+(?:\.\d+)?)\b/g, 'software version', 'verify the version is still supported'], [/\b(\d{1,3}(?:\.\d+)?)\s?%\s+of\b/g, 'statistic', 'give it a source and a year, and check for newer data'], [/(?:©|&copy;|copyright)\s*(\d{4})/gi, 'copyright year', 'update or use a range']])
      for (const m of text.matchAll(re)) { if (label === 'copyright year' && +m[1] >= Y) continue; F.push([label, why, '"' + snip(m.index) + '"']); }
    const upd = /(?:updated|last modified|reviewed)\D{0,12}((?:19|20)\d{2})/i.exec(text); const out = [];
    out.push(`Checked against ${Y}; years of ${Y - age} or older are flagged.${upd ? ` Last "updated" mention: ${upd[1]}${Y - +upd[1] >= age ? ' (stale)' : ''}.` : ' No "updated" date found in the text.'}`);
    out.push(F.length ? sec(`Findings (${F.length})`, table(['type', 'why', 'context'], F.slice(0, 80))) : 'Nothing obviously outdated found.');
    out.push(sec('Refresh checklist', ['- Replace relative time words with dates.', '- Re-check every statistic, price, version and screenshot; add the year of each source.', '- Update the title and headings that contain a year, then the "updated" date shown on the page and in Article schema (dateModified).', '- Add what changed since the last version; remove sections that no longer apply.', '- Re-check internal and external links and the pages that rank above you now.'].join('\n')));
    out.push('Pattern matching only: it cannot judge whether a statement is still true.');
    return out.join('\n\n');
  },
});

// ---- PR description from a diff
T.push({
  id: 'pr-description-generator', cat: 'Dev Extras', title: 'Pull Request Description Generator (from a git diff)',
  desc: 'Paste a git diff and get a ready PR description: summary of files by area, added and removed lines, test and dependency notes, migrations, TODOs added and a review checklist. Rule-based, runs locally.',
  inputs: 1, labels: ['git diff (unified format)'], placeholder: ['diff --git a/src/app.js b/src/app.js\n--- a/src/app.js\n+++ b/src/app.js'],
  sample: `diff --git a/src/cart.js b/src/cart.js
index 1111111..2222222 100644
--- a/src/cart.js
+++ b/src/cart.js
@@ -10,7 +10,12 @@ export function total(items) {
-  return items.reduce((a, i) => a + i.price, 0);
+  // TODO: handle discounts
+  return items.reduce((a, i) => a + i.price * i.qty, 0);
 }
+export function count(items) {
+  return items.reduce((a, i) => a + i.qty, 0);
+}
diff --git a/test/cart.test.js b/test/cart.test.js
new file mode 100644
--- /dev/null
+++ b/test/cart.test.js
@@ -0,0 +1,5 @@
+import { total } from '../src/cart.js';
+test('total uses qty', () => { expect(total([{ price: 2, qty: 3 }])).toBe(6); });
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -5,3 +5,4 @@
+    "decimal.js": "^10.4.3",
diff --git a/db/migrations/20261001_add_qty.sql b/db/migrations/20261001_add_qty.sql
new file mode 100644
--- /dev/null
+++ b/db/migrations/20261001_add_qty.sql
@@ -0,0 +1 @@
+ALTER TABLE cart_items ADD COLUMN qty INTEGER NOT NULL DEFAULT 1;`,
  run: ([inp]) => {
    const files = []; let cur = null;
    for (const l of need(inp, 'a git diff').split(/\r?\n/)) {
      let m;
      if ((m = /^diff --git a\/(.+?) b\/(.+)$/.exec(l))) { cur = { path: m[2], old: m[1], add: 0, del: 0, status: 'modified', todos: [], text: [] }; files.push(cur); }
      else if (!cur) continue;
      else if (/^new file mode/.test(l)) cur.status = 'added'; else if (/^deleted file mode/.test(l)) cur.status = 'deleted'; else if (/^rename from/.test(l)) cur.status = 'renamed'; else if (/^Binary files/.test(l)) cur.binary = true;
      else if (/^\+(?!\+\+)/.test(l)) { cur.add++; cur.text.push(l.slice(1)); if (/\b(TODO|FIXME|HACK|XXX)\b/.test(l)) cur.todos.push(l.slice(1).trim()); }
      else if (/^-(?!--)/.test(l)) cur.del++;
    }
    if (!files.length) throw new Error('No "diff --git" file headers found. Paste the output of git diff or git show.');
    const area = (p) => (/(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.[a-z]+$/i.test(p) ? 'tests' : /(^|\/)migrations?\/|\.sql$/i.test(p) ? 'database' : /(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|requirements.*\.txt|Gemfile(\.lock)?|go\.(mod|sum)|Cargo\.(toml|lock)|pom\.xml|build\.gradle)$/.test(p) ? 'dependencies' : /\.(md|rst|txt)$|(^|\/)docs?\//i.test(p) ? 'docs' : /(^|\/)\.github\/|Dockerfile|docker-compose|\.ya?ml$|\.toml$|\.ini$|\.env|(^|\/)config\//i.test(p) ? 'config / CI' : /\.(css|scss|less|svg|png|jpe?g|gif|webp)$/i.test(p) ? 'styles / assets' : 'source');
    const by = {}; files.forEach((f) => (by[area(f.path)] ||= []).push(f));
    const add = files.reduce((a, f) => a + f.add, 0), del = files.reduce((a, f) => a + f.del, 0), todos = files.flatMap((f) => f.todos.map((t) => `${f.path}: ${t}`));
    const main = (by.source || []).sort((a, b) => b.add + b.del - a.add - a.del)[0], verb = files.every((f) => f.status === 'added') ? 'Add' : (by.source || []).length && del > add * 2 ? 'Remove' : (by.source || []).length ? 'Update' : 'Change';
    const out = [`## ${verb} ${main ? main.path.replace(/^.*\//, '').replace(/\.[^.]+$/, '') : (Object.keys(by)[0] || 'project')}\n\n_Suggested title; edit it to describe the why, not the files._`];
    out.push(`## Summary\n\n- ${files.length} file${files.length > 1 ? 's' : ''} changed, +${add} / -${del} lines.\n${Object.entries(by).map(([a, fs]) => `- ${a}: ${fs.map((f) => `\`${f.path}\` (${f.status}, +${f.add}/-${f.del})`).join(', ')}`).join('\n')}`);
    const notes = [];
    if (by.source && !by.tests) notes.push('Source changed but no test files changed: add or point to tests.'); if (by.tests) notes.push('Tests added or changed: ' + by.tests.map((f) => f.path).join(', '));
    if (by.dependencies) notes.push('Dependency files changed: review licences, size and security of new packages' + (by.dependencies.some((f) => /lock/.test(f.path)) ? ' (lockfile included)' : ' (no lockfile change: is it up to date?)') + '.');
    if (by.database) notes.push('Database change: confirm it is reversible, safe on large tables and deployed before the code that needs it.');
    if (by['config / CI']) notes.push('Config or CI changed: check environments and secrets.');
    files.filter((f) => f.add + f.del > 400).forEach((f) => notes.push(`Large change in ${f.path} (${f.add + f.del} lines): consider splitting.`));
    files.filter((f) => f.binary).forEach((f) => notes.push(`Binary file: ${f.path}`));
    if (files.some((f) => /\b(password|secret|api[_-]?key|token)\b\s*[:=]\s*['"][^'"]{6,}/i.test(f.text.join('\n')))) notes.push('A line looks like a hard-coded secret: check before pushing.');
    if (todos.length) notes.push(`${todos.length} TODO/FIXME added:\n${todos.map((t) => '  - ' + t).join('\n')}`);
    out.push(`## Review notes\n\n${notes.length ? notes.map((n) => '- ' + n).join('\n') : '- Nothing special detected.'}`);
    out.push('## Checklist\n\n- [ ] Tests pass locally and in CI\n- [ ] Behaviour verified manually\n- [ ] Docs / changelog updated\n- [ ] No debug code or secrets left');
    out.push('_Generated from the diff by simple rules: it describes what changed, not why. Add the reason and the testing you did._');
    return out.join('\n\n');
  },
});

// ---- LLM logprobs analyser
T.push({
  id: 'llm-logprobs-analyzer', cat: 'LLM Tools', title: 'LLM Logprobs Analyzer (Token Confidence, Perplexity, Uncertain Spans)',
  desc: 'Paste the logprobs from an OpenAI-style API response and see per-token probability, perplexity, entropy from top alternatives, and the low-confidence spans where the model was unsure. Runs locally.',
  inputs: 1, labels: ['API response JSON (choices[0].logprobs.content, or legacy logprobs.tokens) or an array of {token, logprob}'], placeholder: ['{"choices":[{"logprobs":{"content":[{"token":"Paris","logprob":-0.02,"top_logprobs":[...]}]}}]}'],
  opts: [{ id: 'thr', label: 'Low-confidence threshold (probability below)', type: 'number', def: 0.5 }],
  sample: JSON.stringify({ choices: [{ message: { content: 'The capital of Australia is Canberra.' }, logprobs: { content: [{ token: 'The', logprob: -0.01, top_logprobs: [{ token: 'The', logprob: -0.01 }, { token: 'Aust', logprob: -4.9 }] }, { token: ' capital', logprob: -0.03, top_logprobs: [{ token: ' capital', logprob: -0.03 }, { token: ' city', logprob: -3.8 }] }, { token: ' of', logprob: -0.0001, top_logprobs: [{ token: ' of', logprob: -0.0001 }] }, { token: ' Australia', logprob: -0.05, top_logprobs: [{ token: ' Australia', logprob: -0.05 }, { token: ' the', logprob: -3.2 }] }, { token: ' is', logprob: -0.002, top_logprobs: [{ token: ' is', logprob: -0.002 }] }, { token: ' Sydney', logprob: -0.9, top_logprobs: [{ token: ' Sydney', logprob: -0.9 }, { token: ' Canberra', logprob: -0.95 }, { token: ' Melbourne', logprob: -3.1 }] }, { token: '.', logprob: -0.2, top_logprobs: [{ token: '.', logprob: -0.2 }, { token: ',', logprob: -1.8 }] }] } }] }),
  run: ([inp], o) => {
    let j; try { j = JSON.parse(need(inp, 'the JSON')); } catch { throw new Error('That is not valid JSON.'); }
    let toks = [];
    const lp = j.choices?.[0]?.logprobs ?? j.logprobs ?? j;
    if (Array.isArray(lp)) toks = lp.map((t) => ({ token: t.token, lp: t.logprob, top: t.top_logprobs || t.top || [] }));
    else if (Array.isArray(lp.content)) toks = lp.content.map((t) => ({ token: t.token, lp: t.logprob, top: t.top_logprobs || [] }));
    else if (Array.isArray(lp.tokens)) toks = lp.tokens.map((t, i) => ({ token: t, lp: lp.token_logprobs[i], top: Object.entries(lp.top_logprobs?.[i] || {}).map(([token, logprob]) => ({ token, logprob })) }));
    toks = toks.filter((t) => typeof t.lp === 'number');
    if (!toks.length) throw new Error('No token logprobs found. Request them with logprobs=true (and top_logprobs=N) in the API call.');
    const thr = +o.thr || 0.5, n = toks.length, mean = toks.reduce((a, t) => a + t.lp, 0) / n, ppl = Math.exp(-mean);
    const ent = (t) => { if (t.top.length < 2) return null; const ps = t.top.map((x) => Math.exp(x.logprob)), z = ps.reduce((a, b) => a + b, 0); return -ps.reduce((a, p) => a + (p / z) * Math.log(p / z), 0) / Math.LN2; };
    const ents = toks.map(ent).filter((e) => e != null);
    const stream = toks.map((t) => (Math.exp(t.lp) < thr ? `[[${t.token}]]` : t.token)).join('');
    const low = toks.map((t, i) => ({ ...t, i, p: Math.exp(t.lp) })).filter((t) => t.p < thr);
    const hist = [[0.9, 1.0001], [0.7, 0.9], [0.5, 0.7], [0.2, 0.5], [0, 0.2]].map(([a, b]) => { const c = toks.filter((t) => Math.exp(t.lp) >= a && Math.exp(t.lp) < b).length; return `${String(round(a * 100, 0)).padStart(3)}-${String(Math.min(100, round(b * 100, 0))).padEnd(3)}%  ${'#'.repeat(Math.round((c / n) * 40))} ${c}`; });
    const out = [`${n} tokens. Mean logprob ${round(mean, 4)}, perplexity ${round(ppl, 3)}, joint probability of the whole text ${(Math.exp(toks.reduce((a, t) => a + t.lp, 0))).toExponential(2)}.${ents.length ? ` Mean entropy over the top alternatives: ${round(ents.reduce((a, b) => a + b, 0) / ents.length, 3)} bits (approximate: only the returned top candidates are counted).` : ''}`];
    out.push(sec(`Text with uncertain tokens marked [[like this]] (probability < ${thr})`, stream));
    out.push(sec('Token probability histogram', hist.join('\n')));
    out.push(sec(`Low-confidence tokens (${low.length})`, low.length ? table(['#', 'token', 'prob', 'alternatives'], low.map((t) => [t.i, JSON.stringify(t.token), round(t.p * 100, 1) + '%', t.top.filter((x) => x.token !== t.token).slice(0, 3).map((x) => `${JSON.stringify(x.token)} ${round(Math.exp(x.logprob) * 100, 1)}%`).join(', ')])) : 'none'));
    out.push('Token probability measures how sure the model was about the next token, not whether the statement is true: a model can be confidently wrong, and an uncertain token can be a harmless synonym choice. Use it to find places to check, and compare runs with the same prompt and temperature.');
    return out.join('\n\n');
  },
});

// ---- context window simulator
T.push({
  id: 'agent-context-window-simulator', cat: 'LLM Tools', title: 'Agent Context Window Simulator (What Survives Truncation)',
  desc: 'Paste a chat or agent message list and see which messages stay in a limited context window under different strategies: drop oldest, keep system plus recent, or keep pinned messages. Shows token use per message.',
  inputs: 1, labels: ['Messages: JSON [{role, content}] or lines "role: text"'], placeholder: ['system: You are a helpful agent.\nuser: Hi'],
  opts: [{ id: 'limit', label: 'Context window (tokens)', type: 'number', def: 120 }, { id: 'reserve', label: 'Reserve for the reply (tokens)', type: 'number', def: 30 }, { id: 'strategy', label: 'Strategy', type: 'select', choices: ['Drop oldest first', 'Keep system + most recent', 'Keep system + first user message + most recent'], def: 'Keep system + most recent' }],
  sample: 'system: You are a support agent for Acme. Answer politely and cite the policy.\nuser: Hi, I ordered a blue widget three weeks ago and it has not arrived.\nassistant: Sorry to hear that. Could you share your order number so I can check the shipment?\nuser: It is A-10492.\nassistant: Thanks. Order A-10492 shipped on 3 October and the carrier shows a delivery exception. I can send a replacement or refund you.\nuser: A replacement please, but to a different address: 12 Rue Neuve, Brussels.\nassistant: Done. A replacement is booked to 12 Rue Neuve, Brussels, arriving in 3 to 5 days. Anything else?\nuser: Yes, what is your return policy for opened items?',
  run: ([inp], o) => {
    let msgs; const t = need(inp, 'messages');
    try { const j = JSON.parse(t); msgs = (Array.isArray(j) ? j : j.messages).map((m) => ({ role: m.role, text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })); }
    catch { msgs = lines(t).map((l) => { const m = /^(system|user|assistant|tool|developer)\s*:\s*(.*)$/i.exec(l); return m ? { role: m[1].toLowerCase(), text: m[2] } : { role: 'user', text: l }; }); }
    if (!msgs.length) throw new Error('No messages found.');
    const tok = (s) => Math.max(1, Math.ceil(s.length / 4) + 4), budget = Math.max(1, (+o.limit || 0) - (+o.reserve || 0));
    msgs.forEach((m) => { m.t = tok(m.text); }); const total = msgs.reduce((a, m) => a + m.t, 0);
    const keep = new Set(); let used = 0; const tryAdd = (i) => { if (!keep.has(i) && used + msgs[i].t <= budget) { keep.add(i); used += msgs[i].t; return true; } return false; };
    if (o.strategy !== 'Drop oldest first') { msgs.forEach((m, i) => { if (m.role === 'system' || m.role === 'developer') tryAdd(i); }); if (/first user/.test(o.strategy)) { const f = msgs.findIndex((m) => m.role === 'user'); if (f >= 0) tryAdd(f); } }
    for (let i = msgs.length - 1; i >= 0; i--) { if (!tryAdd(i)) { if (o.strategy === 'Drop oldest first') break; } }
    const rows = msgs.map((m, i) => `${keep.has(i) ? 'KEEP' : 'DROP'}  ${String(m.t).padStart(4)} tok  ${m.role.padEnd(9)} ${m.text.replace(/\s+/g, ' ').slice(0, 60)}${m.text.length > 60 ? '...' : ''}`);
    const dropped = msgs.filter((_, i) => !keep.has(i));
    return `${msgs.length} messages, about ${total} tokens in total; window ${o.limit} minus ${o.reserve} reserved = ${budget} tokens for the prompt.\nKept ${keep.size} messages (${used} tokens), dropped ${dropped.length}.\n\n${rows.join('\n')}\n\n${dropped.length ? 'The model will not see: ' + dropped.map((m) => `[${m.role}] "${m.text.slice(0, 40)}..."`).join(' ') + '\nFacts only mentioned there are lost: pin them in the system message or a running summary.' : 'Everything fits.'}\n\nToken counts are an estimate (about 4 characters per token plus 4 for message framing). For exact counts use the tokenizer tools in this site for your model.`;
  },
});

// ---- naive bayes text classifier
const nbTok = (s) => { const w = wordsOf(s); return [...w, ...w.slice(1).map((x, i) => w[i] + '_' + x)]; };
function nbTrain(ex) { const labels = [...new Set(ex.map((e) => e.y))], cnt = {}, tot = {}, docs = {}; const V = new Set(); labels.forEach((l) => { cnt[l] = new Map(); tot[l] = 0; docs[l] = 0; }); for (const e of ex) { docs[e.y]++; for (const w of nbTok(e.x)) { cnt[e.y].set(w, (cnt[e.y].get(w) || 0) + 1); tot[e.y]++; V.add(w); } } return { labels, cnt, tot, docs, V: V.size, n: ex.length }; }
function nbPredict(m, text) { const ws = nbTok(text), sc = m.labels.map((l) => { let s = Math.log(m.docs[l] / m.n); for (const w of ws) s += Math.log(((m.cnt[l].get(w) || 0) + 1) / (m.tot[l] + m.V + 1)); return s; }); const mx = Math.max(...sc), e = sc.map((x) => Math.exp(x - mx)), z = e.reduce((a, b) => a + b, 0); return m.labels.map((l, i) => ({ label: l, p: e[i] / z })).sort((a, b) => b.p - a.p); }
T.push({
  id: 'naive-bayes-text-classifier', cat: 'AI & LLM', title: 'Train Your Own Text Classifier (Naive Bayes, In Your Browser)',
  desc: 'Paste labelled examples ("label: text") and texts to classify. A multinomial Naive Bayes model trains instantly in your browser and predicts labels with probabilities, top clue words and a leave-one-out accuracy estimate.',
  inputs: 2, labels: ['Training examples, one per line: label: text', 'Texts to classify, one per line'], placeholder: ['spam: win a free prize now\nham: meeting moved to 3pm', 'free prize waiting for you'],
  sample: 'billing: I was charged twice for my subscription this month\nbilling: please send me an invoice for last quarter\nbilling: my card was declined but money left my account\nbilling: how do I update my payment method\nshipping: where is my parcel, tracking has not moved in a week\nshipping: the package arrived damaged\nshipping: can I change the delivery address\nshipping: my order never arrived\ntechnical: the app crashes when I open settings\ntechnical: I cannot log in after the update\ntechnical: error message when exporting a report\ntechnical: the website is very slow on my phone',
  sample2: 'Why was I billed two times?\nMy delivery is late\nThe login page shows an error\nIs the shop open on Sunday?',
  run: ([train, test]) => {
    const ex = lines(need(train, 'training examples')).map((l) => { const m = /^([^:]{1,40}):\s*(.+)$/.exec(l); return m ? { y: m[1].trim(), x: m[2] } : null; }).filter(Boolean);
    const labels = new Set(ex.map((e) => e.y)); if (labels.size < 2 || ex.length < 4) throw new Error('Provide at least 4 examples with 2 or more different labels, in the form label: text');
    const model = nbTrain(ex), out = [`Trained on ${ex.length} examples, ${labels.size} labels (${model.labels.map((l) => `${l}: ${model.docs[l]}`).join(', ')}), ${model.V} distinct word/bigram features.`];
    let right = 0; ex.forEach((e, i) => { const m = nbTrain(ex.filter((_, j) => j !== i)); if (m.labels.includes(e.y) && nbPredict(m, e.x)[0].label === e.y) right++; });
    out.push(`Leave-one-out accuracy on your own examples: ${pct(right, ex.length)} (${right}/${ex.length}). With so few examples treat it as a rough guide; add more and more varied examples to improve it.`);
    const clue = model.labels.map((l) => { const arr = [...model.cnt[l]].filter(([w]) => !w.includes('_') && !STOP.has(w)).map(([w, c]) => { const other = model.labels.filter((x) => x !== l).reduce((a, x) => a + (model.cnt[x].get(w) || 0), 0); return [w, Math.log((c + 1) / (model.tot[l] + model.V)) - Math.log((other + 1) / (model.labels.filter((x) => x !== l).reduce((a, x) => a + model.tot[x], 0) + model.V))]; }).sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]); return `${l}: ${arr.join(', ')}`; });
    out.push(sec('Strongest clue words per label', clue.join('\n')));
    const items = lines(test || ''); if (items.length) out.push(sec('Predictions', items.map((t) => { const p = nbPredict(model, t); return `${t}\n    -> ${p[0].label} (${round(p[0].p * 100, 0)}%)${p[1] ? '; next ' + p[1].label + ' ' + round(p[1].p * 100, 0) + '%' : ''}${p[0].p < 0.6 ? '   (unsure)' : ''}`; }).join('\n')));
    else out.push('Add texts to classify in the second box.');
    out.push('A Naive Bayes model assumes words are independent, only knows the words it was trained on and always picks one of your labels, even for text that fits none. It is a simple baseline, not a language model, and everything stays in this tab.');
    return out.join('\n\n');
  },
});
const STOP = new Set('a an and are as at be but by for from has have i if in is it me my of on or so that the this to was we what when where which with you your am can do does not how'.split(' '));

// ---- resume bullets
const STRONG_VERBS = 'achieved accelerated administered analyzed architected automated built championed cut collaborated completed conducted configured consolidated converted coordinated created decreased delivered deployed designed developed directed doubled drove eliminated enabled engineered established exceeded executed expanded facilitated generated grew guided identified implemented improved increased initiated integrated introduced launched led managed mentored migrated modernized negotiated optimized orchestrated overhauled owned partnered piloted planned produced reduced redesigned refactored reengineered resolved restructured saved scaled secured shipped simplified solved spearheaded standardized streamlined strengthened supervised trained transformed tripled upgraded validated won wrote'.split(' ');
const WEAK = [[/^(was |were )?responsible for\b/i, 'Led / Owned / Managed'], [/^(duties|responsibilities) (included|include)\b/i, 'start with what you achieved'], [/^(helped|assisted|supported)( with| in| to)?\b/i, 'Contributed / Partnered / Enabled (name your part)'], [/^worked (on|with|in)\b/i, 'Built / Developed / Delivered'], [/^(involved|participated) in\b/i, 'Drove / Executed / Contributed'], [/^(tasked with|in charge of)\b/i, 'Led / Owned'], [/^(handled|dealt with)\b/i, 'Resolved / Managed / Processed'], [/^(did|made|got)\b/i, 'a specific action verb']];
T.push({
  id: 'resume-bullet-improver', cat: 'Marketing', title: 'Resume Bullet Point Checker and Improver (Verbs, Metrics, Length)',
  desc: 'Paste CV bullet points and get each one scored: weak openers such as "responsible for", missing numbers, passive voice, first person, length, plus stronger verb suggestions and a rewrite template. Rule-based, private.',
  inputs: 1, labels: ['Resume bullets, one per line'], placeholder: ['Responsible for managing the sales team\nHelped with website redesign'],
  sample: 'Responsible for managing the sales team and handling customer accounts\nHelped with the website redesign\nLed a team of 6 engineers to migrate billing to a new platform, cutting invoice errors by 38%\nI was involved in testing\nWas promoted twice in 3 years\nImproved performance',
  run: ([inp]) => {
    const bl = lines(need(inp, 'bullet points')).map((l) => l.replace(/^[-*•·\d.)\s]+/, '')).filter(Boolean); let total = 0;
    const out = bl.map((b) => {
      const w = wordsOf(b), first = (w[0] || '').toLowerCase(), notes = []; let score = 100;
      const weak = WEAK.find(([re]) => re.test(b)); if (weak) { notes.push(`weak opener -> try: ${weak[1]}`); score -= 25; } else if (!STRONG_VERBS.includes(first) && !/ed$/.test(first)) { notes.push('does not start with a past-tense action verb'); score -= 15; }
      if (!/\d/.test(b)) { notes.push('no number: add a size, percent, time, money or count'); score -= 25; }
      if (/^i\b|\b(i|my|me)\b/i.test(b)) { notes.push('first person: drop "I"/"my"'); score -= 10; }
      if (/\b(was|were|been|being) \w+ed\b/i.test(b)) { notes.push('passive voice: say what you did'); score -= 10; }
      if (w.length < 8) { notes.push(`short (${w.length} words): add the method and the result`); score -= 10; } else if (w.length > 28) { notes.push(`long (${w.length} words): aim for 15 to 25`); score -= 10; }
      if (/\b(various|several|many|etc|stuff|things|duties|responsib)/i.test(b)) { notes.push('vague wording'); score -= 10; }
      score = Math.max(0, score); total += score;
      return `${score}/100  ${b}\n        ${notes.length ? notes.join('; ') : 'good'}${score < 90 ? `\n        template: [Action verb] [what] by/for [scale], resulting in [measurable outcome].` : ''}`;
    });
    return `${bl.length} bullets, average ${Math.round(total / bl.length)}/100\n\n${out.join('\n\n')}\n\nStrong verbs to pick from: ${STRONG_VERBS.slice(0, 40).join(', ')}, ...\n\nRule-based checks for good CV style, not a judgement of your experience. Only claim numbers you can defend in an interview.`;
  },
});

// ---- code helpers: test stubs and docstring skeletons
function parseFunctions(code, lang) {
  const fns = [];
  if (lang === 'Python') {
    for (const m of code.matchAll(/^([ \t]*)(async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/gm)) {
      const params = m[4].split(',').map((p) => p.trim()).filter((p) => p && p !== 'self' && p !== 'cls' && !p.startsWith('*')).map((p) => { const [nm, ty] = p.split(':'); const [t1, def] = (ty || '').split('='); const [n2, d2] = nm.split('='); return { name: n2.trim(), type: (t1 || '').trim(), def: (def ?? d2)?.trim() }; });
      const body = code.slice(m.index + m[0].length, m.index + m[0].length + 1500).split(/\n(?=\S)/)[0];
      fns.push({ name: m[3], params, ret: (m[5] || '').trim(), async: !!m[2], throws: /raise\s+(\w+)/.exec(body)?.[1], method: m[1].length > 0, isPrivate: m[3].startsWith('_') });
    }
  } else {
    const re = /(?:^|\n)[ \t]*(?:export\s+(?:default\s+)?)?(async\s+)?function\s*\*?\s*(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{]+?))?\s*\{|(?:^|\n)[ \t]*(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(async\s+)?(?:\(([^)]*)\)|(\w+))\s*(?::\s*([^=]+?))?\s*=>/g;
    for (const m of code.matchAll(re)) {
      const name = m[2] || m[5], raw = (m[3] ?? m[7] ?? m[8] ?? '');
      const params = raw.split(',').map((p) => p.trim()).filter(Boolean).map((p) => { const [nm, ty] = p.split(':'); const [n2, def] = nm.split('='); return { name: n2.replace(/[?.]/g, '').trim(), type: (ty || '').split('=')[0].trim(), def: def?.trim() }; });
      const body = code.slice(m.index + m[0].length, m.index + m[0].length + 1500);
      fns.push({ name, params, ret: (m[4] || m[9] || '').trim(), async: !!(m[1] || m[6]), throws: /throw new (\w+)/.exec(body)?.[1] });
    }
  }
  return fns;
}
const sampleFor = (p, lang) => { const t = (p.type || '').toLowerCase(), d = p.def; if (d !== undefined && /^-?\d/.test(d)) return [d, '0', '-1', '999999']; if (/int|float|number|decimal/.test(t) || /^(n|num|count|qty|size|len|index|i|x|y|a|b|min|max|limit|offset|page|width|height|amount|price|total)$/i.test(p.name)) return ['0', '1', '-1', lang === 'Python' ? '10**9' : '1e9']; if (/str|string/.test(t) || /name|text|title|str|label|path|url|email|id$/i.test(p.name)) return lang === 'Python' ? ["''", "'a'", "'  spaced  '", "'ünï©ödé'"] : ["''", "'a'", "'  spaced  '", "'ünï©ödé'"]; if (/list|array|\[\]/.test(t) || /items|list|values|arr|rows|data$/i.test(p.name)) return ['[]', '[1]', lang === 'Python' ? '[1, 1, 1]' : '[1, 1, 1]']; if (/bool/.test(t) || /^(is|has|should|can|enable)/i.test(p.name)) return lang === 'Python' ? ['True', 'False'] : ['true', 'false']; if (/dict|object|map/.test(t) || /options|opts|config|params$/i.test(p.name)) return lang === 'Python' ? ['{}', "{'key': 'value'}"] : ['{}', "{ key: 'value' }"]; return [lang === 'Python' ? 'None' : 'undefined', lang === 'Python' ? "'value'" : "'value'"]; };
const CODE_SAMPLE = `export function clamp(value, min = 0, max = 100) {
  if (min > max) throw new RangeError('min must not exceed max');
  return Math.min(Math.max(value, min), max);
}

export async function fetchUser(id, options = {}) {
  if (!id) throw new Error('id required');
  return { id, ...options };
}

export const slugify = (title, separator = '-') => title.toLowerCase().trim().replace(/[^a-z0-9]+/g, separator);`;
T.push({
  id: 'unit-test-stub-generator', cat: 'Code Generators', title: 'Unit Test Stub Generator (Jest, Vitest, pytest from Function Signatures)',
  desc: 'Paste JavaScript, TypeScript or Python functions and get test stubs with edge-case inputs derived from parameter names, types and defaults, plus throw tests. A signature parser, not an AI: you still write the assertions.',
  inputs: 1, labels: ['Source code'], placeholder: ['export function add(a, b) { return a + b; }'],
  opts: [{ id: 'fw', label: 'Framework', type: 'select', choices: ['Jest', 'Vitest', 'pytest'], def: 'Jest' }, { id: 'file', label: 'Module path to import', type: 'text', def: './module.js' }],
  sample: CODE_SAMPLE,
  run: ([inp], o) => {
    const py = o.fw === 'pytest', fns = parseFunctions(need(inp, 'code'), py ? 'Python' : 'JS').filter((f) => !f.isPrivate); if (!fns.length) throw new Error(`No ${py ? 'def' : 'function or arrow function'} declarations found.`);
    if (py) return `import pytest\nfrom ${(o.file || 'module').replace(/\.py$/, '').replace(/^\.\//, '').replace(/\//g, '.')} import ${fns.map((f) => f.name).join(', ')}\n\n` + fns.map((f) => {
      const cases = f.params.length ? f.params.map((p) => sampleFor(p, 'Python')) : [[]]; const combos = f.params.length ? [0, 1, 2, 3].map((i) => f.params.map((p, k) => cases[k][Math.min(i, cases[k].length - 1)])) : [[]]; const uniq = [...new Set(combos.map((c) => c.join(', ')))];
      return `@pytest.mark.parametrize("args", [\n${uniq.map((c) => `    (${c}${f.params.length === 1 ? ',' : ''}),`).join('\n')}\n])\ndef test_${f.name}_edge_cases(args):\n    result = ${f.name}(*args)\n    # TODO: assert on result${f.ret ? ` (declared return type: ${f.ret})` : ''}\n    assert result is not None\n\n\ndef test_${f.name}_happy_path():\n    # TODO: arrange real inputs\n    assert ${f.name}(${f.params.map((p) => sampleFor(p, 'Python')[1] ?? sampleFor(p, 'Python')[0]).join(', ')}) == ...  # expected\n${f.throws ? `\n\ndef test_${f.name}_raises():\n    with pytest.raises(${f.throws}):\n        ${f.name}(${f.params.map((p) => sampleFor(p, 'Python')[0]).join(', ')})  # TODO: input that triggers the error\n` : ''}`;
    }).join('\n\n');
    const lib = o.fw === 'Vitest' ? "import { describe, it, expect } from 'vitest';\n" : '';
    return `${lib}import { ${fns.map((f) => f.name).join(', ')} } from '${o.file || './module.js'}';\n\n` + fns.map((f) => {
      const cases = f.params.map((p) => sampleFor(p, 'JS')); const combos = f.params.length ? [0, 1, 2, 3].map((i) => f.params.map((p, k) => cases[k][Math.min(i, cases[k].length - 1)]).join(', ')) : ['']; const uniq = [...new Set(combos)];
      return `describe('${f.name}', () => {\n  it('returns the expected value for typical input', ${f.async ? 'async ' : ''}() => {\n    // TODO: arrange\n    const result = ${f.async ? 'await ' : ''}${f.name}(${f.params.map((p) => sampleFor(p, 'JS')[1] ?? sampleFor(p, 'JS')[0]).join(', ')});\n    expect(result).toBe(/* expected */);\n  });\n\n  it.each([\n${uniq.map((c) => `    [${c}],`).join('\n')}\n  ])('handles edge case input %#', ${f.async ? 'async ' : ''}(...args) => {\n    ${f.async ? 'await expect(' + f.name + '(...args)).resolves.toBeDefined();' : 'expect(() => ' + f.name + '(...args)).not.toThrow();'} // TODO: tighten\n  });\n${f.throws ? `\n  it('throws ${f.throws} for invalid input', ${f.async ? 'async ' : ''}() => {\n    ${f.async ? 'await expect(' + f.name + '(/* invalid */)).rejects.toThrow(' + f.throws + ');' : 'expect(() => ' + f.name + '(/* invalid */)).toThrow(' + f.throws + ');'}\n  });\n` : ''}});`;
    }).join('\n\n');
  },
});
T.push({
  id: 'docstring-skeleton-generator', cat: 'Code Generators', title: 'JSDoc and Python Docstring Skeleton Generator',
  desc: 'Paste JavaScript, TypeScript or Python functions and get JSDoc or Google-style docstring skeletons with parameters, defaults, return and throws filled from the signature. A parser, not an AI.',
  inputs: 1, labels: ['Source code'], placeholder: ['function add(a, b) { return a + b; }'],
  opts: [{ id: 'lang', label: 'Language', type: 'select', choices: ['JavaScript / TypeScript', 'Python'], def: 'JavaScript / TypeScript' }],
  sample: CODE_SAMPLE,
  run: ([inp], o) => {
    const py = o.lang === 'Python', fns = parseFunctions(need(inp, 'code'), py ? 'Python' : 'JS'); if (!fns.length) throw new Error('No functions found.');
    return fns.map((f) => py
      ? `def ${f.name}(...):\n    """TODO: one-line summary of ${f.name}.\n\n    Args:\n${f.params.map((p) => `        ${p.name}${p.type ? ' (' + p.type + ')' : ''}: TODO describe${p.def !== undefined ? ` (default ${p.def})` : ''}.`).join('\n') || '        (none)'}\n\n    Returns:\n        ${f.ret || 'TODO type'}: TODO describe.\n${f.throws ? `\n    Raises:\n        ${f.throws}: TODO when.\n` : ''}    """`
      : `/**\n * TODO: one-line summary of ${f.name}.\n *\n${f.params.map((p) => ` * @param {${p.type || '*'}} ${p.def !== undefined ? '[' + p.name + '=' + p.def + ']' : p.name} TODO describe.`).join('\n')}${f.params.length ? '\n' : ''} * @returns {${f.async ? 'Promise<' + (f.ret || '*') + '>' : f.ret || '*'}} TODO describe.\n${f.throws ? ` * @throws {${f.throws}} TODO when.\n` : ''} */\n${f.async ? 'async ' : ''}function ${f.name}(...)`).join('\n\n') + '\n\nSkeletons come from the signature only; the descriptions are for you to write. Paste each block above its function.';
  },
});

// ---- text to mermaid
T.push({
  id: 'text-to-mermaid-flowchart', cat: 'Diagrams', title: 'Text to Mermaid Flowchart (Arrows, Outlines and Numbered Steps)',
  desc: 'Turn plain text into Mermaid diagram code: "A -> B -> C" chains, "Decision? yes: X / no: Y" branches, indented outlines (mind map) or numbered steps. A small syntax converter, not an AI.',
  inputs: 1, labels: ['Text: arrow chains, numbered steps, or an indented outline'], placeholder: ['Start -> Check stock -> In stock? yes: Ship / no: Backorder'],
  opts: [{ id: 'mode', label: 'Input style', type: 'select', choices: ['Auto', 'Arrows', 'Numbered steps', 'Indented outline (mind map)'], def: 'Auto' }, { id: 'dir', label: 'Direction', type: 'select', choices: ['TD', 'LR'], def: 'TD' }],
  sample: 'Customer places order -> Payment received? yes: Check stock / no: Send reminder\nCheck stock -> In stock? yes: Pack and ship / no: Backorder\nPack and ship -> Send tracking email',
  run: ([inp], o) => {
    const t = need(inp, 'text'), ls = t.split(/\r?\n/).filter((l) => l.trim()); let mode = o.mode;
    if (mode === 'Auto') mode = ls.some((l) => /->|=>|→/.test(l)) ? 'Arrows' : ls.every((l) => /^\s*\d+[.)]\s/.test(l)) ? 'Numbered steps' : 'Indented outline (mind map)';
    const q = (s) => s.replace(/"/g, "'");
    if (mode === 'Indented outline (mind map)') { const base = Math.min(...ls.map((l) => l.match(/^\s*/)[0].replace(/\t/g, '  ').length)); return 'mindmap\n' + ls.map((l, i) => { const ind = l.match(/^\s*/)[0].replace(/\t/g, '  ').length - base; return (i === 0 ? '  root((' + q(l.trim().replace(/^[-*]\s*/, '')) + '))' : ' '.repeat(2 + ind + 2) + q(l.trim().replace(/^[-*]\s*/, ''))); }).join('\n'); }
    const ids = new Map(), nodes = [], edges = []; const id = (label) => { const k = label.trim().toLowerCase(); if (!ids.has(k)) { ids.set(k, 'n' + (ids.size + 1)); nodes.push([ids.get(k), label.trim()]); } return ids.get(k); };
    const shape = (label) => (/\?$/.test(label.trim()) ? (i, l) => `${i}{"${q(l)}"}` : /^(start|begin|end|stop|finish)\b/i.test(label.trim()) ? (i, l) => `${i}(["${q(l)}"])` : (i, l) => `${i}["${q(l)}"]`);
    if (mode === 'Numbered steps') { const steps = ls.map((l) => l.replace(/^\s*\d+[.)]\s*/, '')); steps.forEach((s, i) => { id(s); if (i) edges.push([id(steps[i - 1]), id(s), '']); }); }
    else for (const l of ls) {
      const parts = l.split(/\s*(?:->|=>|→)\s*/).map((s) => s.trim()).filter(Boolean);
      parts.forEach((p, i) => {
        const br = /^(.*?\?)\s+(.+)$/.exec(p);
        const label = br ? br[1] : p; const from = id(label);
        if (i && !edges.some((e) => e[1] === from && e[0] === id(parts[i - 1].replace(/\?\s.*$/, '?')))) edges.push([id(parts[i - 1].replace(/\?\s.*$/, '?')), from, '']);
        if (br) for (const b of br[2].split(/\s*\/\s*/)) { const m = /^(yes|no|true|false|[\w ]{1,12}):\s*(.+)$/i.exec(b.trim()); if (m) edges.push([from, id(m[2]), m[1]]); }
      });
    }
    const sh = new Map(nodes.map(([i, l]) => [i, shape(l)(i, l)]));
    return `flowchart ${o.dir}\n${nodes.map(([i]) => '  ' + sh.get(i)).join('\n')}\n${edges.map(([a, b, lab]) => `  ${a} ${lab ? `-- ${q(lab)} -->` : '-->'} ${b}`).join('\n')}\n\n%% paste into https://mermaid.js.org/ or any Markdown renderer that supports Mermaid`;
  },
});

// ====================================================================== calculators and reference data
const CALCF = 'Calculators – Finance', CALCE = 'Calculators – Everyday';
const money = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'n/a');
const AU_RATES = {
  '2024-25': { resident: [[18200, 0], [45000, 0.16], [135000, 0.30], [190000, 0.37], [Infinity, 0.45]], foreign: [[135000, 0.30], [190000, 0.37], [Infinity, 0.45]], whm: [[45000, 0.15], [135000, 0.30], [190000, 0.37], [Infinity, 0.45]], sg: 0.115 },
  '2025-26': { resident: [[18200, 0], [45000, 0.16], [135000, 0.30], [190000, 0.37], [Infinity, 0.45]], foreign: [[135000, 0.30], [190000, 0.37], [Infinity, 0.45]], whm: [[45000, 0.15], [135000, 0.30], [190000, 0.37], [Infinity, 0.45]], sg: 0.12 },
  '2026-27': { resident: [[18200, 0], [45000, 0.15], [135000, 0.30], [190000, 0.37], [Infinity, 0.45]], foreign: [[135000, 0.30], [190000, 0.37], [Infinity, 0.45]], whm: [[45000, 0.15], [135000, 0.30], [190000, 0.37], [Infinity, 0.45]], sg: 0.12 },
};
T.push({
  id: 'au-income-tax-estimator', cat: CALCF, title: 'Australian Income Tax Estimator (Resident, Foreign Resident, Working Holiday)',
  desc: 'Estimate Australian income tax and Medicare levy for 2024-25, 2025-26 and 2026-27 from taxable income, with bracket breakdown, take-home pay, marginal rate and superannuation guarantee. Rates are built in and shown so you can check them.',
  inputs: 1, labels: ['Taxable income per year (AUD); several lines to compare'], placeholder: ['95000'],
  opts: [{ id: 'fy', label: 'Financial year', type: 'select', choices: ['2026-27', '2025-26', '2024-25'], def: '2025-26' }, { id: 'res', label: 'Tax status', type: 'select', choices: ['Resident', 'Foreign resident', 'Working holiday maker'], def: 'Resident' }, { id: 'medicare', label: 'Add 2% Medicare levy (residents)', type: 'checkbox', def: true }],
  sample: '95000\n48000\n220000',
  run: ([inp], o) => {
    const R = AU_RATES[o.fy], key = o.res === 'Resident' ? 'resident' : o.res === 'Foreign resident' ? 'foreign' : 'whm', br = R[key];
    const calc = (inc) => { let prev = 0, tax = 0; const rows = []; for (const [top, r] of br) { const part = Math.max(0, Math.min(inc, top) - prev); if (part > 0 || r === 0) rows.push([top === Infinity ? `${money(prev + 1)} and above` : `${money(prev + (prev ? 1 : 0))} to ${money(top)}`, `${round(r * 100, 1)}%`, money(part * r)]); tax += part * r; prev = top; if (inc <= top) break; } return { tax, rows }; };
    const out = lines(need(inp, 'an income')).slice(0, 20).map((l) => {
      const inc = num(l); if (!Number.isFinite(inc) || inc < 0) throw new Error(`"${l}" is not an amount.`);
      const { tax, rows } = calc(inc), med = o.medicare && key === 'resident' ? inc * 0.02 : 0, net = inc - tax - med;
      const mr = (br.find(([top]) => inc <= top) || br[br.length - 1])[1] + (med ? 0.02 : 0);
      return `Taxable income AUD ${money(inc)} (${o.fy}, ${o.res})\n${table(['bracket', 'rate', 'tax'], rows)}\n  income tax        ${money(tax)}\n  Medicare levy     ${money(med)}\n  total tax         ${money(tax + med)}  (average ${round(((tax + med) / (inc || 1)) * 100, 1)}%, marginal ${round(mr * 100, 1)}%)\n  take-home         ${money(net)}  = ${money(net / 12)} per month, ${money(net / 26)} per fortnight\n  employer super    ${money(inc * R.sg)} at ${round(R.sg * 100, 1)}% (guarantee on ordinary time earnings, shown for reference)`;
    });
    out.push(`Brackets used (${o.fy}, ${o.res}): ${br.map(([t, r], i) => `${i ? money((br[i - 1][0]) + 1) : money(0)}-${t === Infinity ? 'above' : money(t)} at ${round(r * 100, 1)}%`).join('; ')}. Source: ATO resident and non-resident rates; the 2026-27 cut of the 16% rate to 15% is legislated. Rates change: check ato.gov.au.\nNot included: tax offsets (LITO etc.), Medicare levy reduction for low incomes, Medicare levy surcharge, HELP repayments, Division 293, deductions, or non-residents' Medicare treatment. An estimate, not tax advice.`);
    return out.join('\n\n');
  },
});

T.push({
  id: 'wfh-deduction-calculator', cat: CALCF, title: 'Work From Home Deduction Calculator (Fixed Rate Method, Australia)',
  desc: 'Work out the Australian work-from-home deduction with the ATO fixed rate per hour method: hours per week, weeks worked, rate, value at your marginal tax rate and what it already covers. Rate is editable.',
  inputs: 0, sample: '', opts: [{ id: 'hours', label: 'Hours worked from home per week', type: 'number', def: 20 }, { id: 'weeks', label: 'Weeks worked from home in the year', type: 'number', def: 46 }, { id: 'rate', label: 'Fixed rate per hour (AUD)', type: 'number', def: 0.7 }, { id: 'marg', label: 'Your marginal tax rate incl. Medicare (%)', type: 'number', def: 32 }, { id: 'direct', label: 'Direct costs claimed separately (AUD, e.g. computer depreciation)', type: 'number', def: 0 }],
  run: (_, o) => {
    const h = +o.hours * +o.weeks, ded = h * +o.rate, mr = (+o.marg || 0) / 100;
    if (!(h > 0) || !(+o.rate > 0)) throw new Error('Enter hours, weeks and a rate above zero.');
    return `Hours from home: ${round(h, 1)} (${o.hours} h x ${o.weeks} weeks)\nFixed rate: AUD ${money(+o.rate)} per hour\nDeduction: AUD ${money(ded)}\nPlus separate direct costs: AUD ${money(+o.direct || 0)}  =  total AUD ${money(ded + (+o.direct || 0))}\nTax saved at ${o.marg}%: about AUD ${money((ded + (+o.direct || 0)) * mr)}\n\nThe fixed rate covers electricity and gas, internet, mobile and home phone, and stationery and computer consumables: do not claim those again. You can still claim the work-related decline in value of equipment (computer, desk, chair), repairs and cleaning of the work area on top.\nYou must keep a record of the hours actually worked from home for the whole year (a diary or timesheet; a representative 4-week record is no longer enough), plus evidence of the expenses the rate covers. The ATO rate was 70 cents in 2024-25; check ato.gov.au for the current year and the revised rules. Not tax advice.`;
  },
});

T.push({
  id: 'gst-bas-calculator', cat: CALCF, title: 'GST and BAS Worksheet Calculator (Australia, 10%)',
  desc: 'Add up sales and purchases with GST included, excluded or GST-free and get the BAS figures: G1 total sales, 1A GST on sales, 1B GST on purchases, G11 and the net amount to pay or refund. Rate is editable.',
  inputs: 1, labels: ['One line per transaction: sale|purchase, amount, inc|ex|free'], placeholder: ['sale, 1100, inc\npurchase, 220, inc'],
  opts: [{ id: 'rate', label: 'GST rate (%)', type: 'number', def: 10 }],
  sample: 'sale, 11000, inc\nsale, 2500, ex\nsale, 800, free\npurchase, 3300, inc\npurchase, 1200, ex\npurchase, 400, free',
  run: ([inp], o) => {
    const r = (+o.rate || 0) / 100; let g1 = 0, a1 = 0, g11 = 0, b1 = 0, exSales = 0; const rows = [];
    for (const l of lines(need(inp, 'transactions'))) {
      const p = l.split(/[,;\t]/).map((x) => x.trim()); const kind = (p[0] || '').toLowerCase(), amt = num(p[1]), mode = (p[2] || 'inc').toLowerCase();
      if (!/^(sale|purchase)$/.test(kind) || !Number.isFinite(amt)) throw new Error(`Cannot read "${l}". Use: sale|purchase, amount, inc|ex|free`);
      let net, gst; if (/free|none|0/.test(mode)) { net = amt; gst = 0; } else if (mode.startsWith('ex')) { net = amt; gst = amt * r; } else { gst = (amt * r) / (1 + r); net = amt - gst; }
      rows.push([kind, money(amt), mode, money(net), money(gst)]);
      if (kind === 'sale') { g1 += net + gst; a1 += gst; if (gst === 0) exSales += net; } else { g11 += net + gst; b1 += gst; }
    }
    const net = a1 - b1;
    return `${table(['type', 'amount', 'gst mode', 'excl. GST', 'GST'], rows)}\n\nBAS figures (AUD)\n  G1  Total sales (incl. GST)            ${money(g1)}\n  1A  GST on sales                       ${money(a1)}\n  G11 Non-capital purchases (incl. GST)  ${money(g11)}\n  1B  GST on purchases                   ${money(b1)}\n  GST-free / input-taxed sales (in G1)   ${money(exSales)}\n\nNet GST: ${net >= 0 ? 'you pay ' + money(net) : 'refund of ' + money(-net)} (1A minus 1B)\n\nA worksheet to understand the figures: classify capital purchases (G10), private use, input-taxed sales and adjustments correctly in your real BAS, and lodge through the ATO portal or your agent. Not tax advice.`;
  },
});

// ---- crypto / share capital gains
function cgtCalc(csv, method, discDays, discPct) {
  const rows = parseCsv(csv); const head = rows[0].map((h) => h.trim().toLowerCase()); const ix = (...a) => colIdx(head, ...a);
  const id = ix('date'), it = ix('type', 'side', 'action'), ia = ix('asset', 'coin', 'symbol', 'ticker'), iq = ix('quantity', 'qty', 'amount', 'units'), ip = ix('price', 'unit price', 'price per unit', 'rate'), ifee = ix('fee', 'fees');
  if ([id, it, ia, iq, ip].some((x) => x < 0)) throw new Error('Header needs: date, type (buy/sell), asset, quantity, price (per unit); optional fee.');
  const tx = rows.slice(1).map((r) => ({ d: new Date(r[id] + (r[id].length <= 10 ? 'T00:00:00Z' : '')), type: r[it].trim().toLowerCase(), a: r[ia].trim().toUpperCase(), q: num(r[iq]), p: num(r[ip]), fee: ifee >= 0 ? num(r[ifee]) || 0 : 0 })).filter((t) => !Number.isNaN(t.d.getTime()) && Number.isFinite(t.q) && Number.isFinite(t.p)).sort((a, b) => a.d - b.d);
  const lots = {}, events = []; let gain = 0, disc = 0, taxable = 0, loss = 0;
  for (const t of tx) {
    if (/buy|acquire|receive|purchase/.test(t.type)) { (lots[t.a] ||= []).push({ d: t.d, q: t.q, cost: t.p + (t.fee / t.q || 0), left: t.q }); continue; }
    if (!/sell|dispose|sale|swap out/.test(t.type)) continue;
    const L = (lots[t.a] ||= []); let remaining = t.q;
    const pick = () => { const open = L.filter((l) => l.left > 1e-12); if (!open.length) return null; return method === 'LIFO' ? open[open.length - 1] : method === 'HIFO' ? open.reduce((a, b) => (b.cost > a.cost ? b : a)) : open[0]; };
    const perUnitFee = t.fee / t.q;
    while (remaining > 1e-12) {
      const l = pick(); if (!l) { events.push({ d: t.d, a: t.a, q: remaining, note: 'SOLD MORE THAN HELD (missing buys)', gain: 0 }); break; }
      const q = Math.min(remaining, l.left), proceeds = q * (t.p - perUnitFee), cost = q * l.cost, g = proceeds - cost;
      const held = (t.d - l.d) / 86400000, eligible = g > 0 && held >= discDays; const dg = eligible ? g * (1 - discPct / 100) : g;
      events.push({ d: t.d, a: t.a, q, bought: l.d, held: Math.floor(held), proceeds, cost, gain: g, eligible, net: dg }); gain += g; if (g < 0) loss += -g; else taxable += dg; disc += eligible ? g - dg : 0;
      l.left -= q; remaining -= q;
    }
  }
  return { events, gain, disc, taxable, loss, open: Object.fromEntries(Object.entries(lots).map(([k, v]) => [k, v.reduce((a, l) => a + l.left, 0)]).filter(([, v]) => v > 1e-9)) };
}
T.push({
  id: 'crypto-cgt-calculator', cat: CALCF, title: 'Capital Gains Calculator for Crypto and Shares (FIFO, LIFO, HIFO, 12-Month Discount)',
  desc: 'Paste buys and sells and get the capital gain or loss per disposal with FIFO, LIFO or highest-cost matching, holding period and the optional 12-month discount used in Australia. Rules are options, so it fits other countries.',
  inputs: 1, labels: ['CSV: date, type (buy/sell), asset, quantity, price per unit, fee (optional)'], placeholder: ['date,type,asset,quantity,price,fee\n2024-01-10,buy,BTC,0.5,60000,20'],
  opts: [{ id: 'method', label: 'Cost matching method', type: 'select', choices: ['FIFO', 'LIFO', 'HIFO'], def: 'FIFO' }, { id: 'days', label: 'Minimum holding days for a discount (0 = no discount)', type: 'number', def: 365 }, { id: 'pct', label: 'Discount on the gain (%)', type: 'number', def: 50 }],
  sample: 'date,type,asset,quantity,price,fee\n2023-01-10,buy,BTC,1.0,30000,50\n2023-09-01,buy,BTC,0.5,35000,25\n2024-03-15,sell,BTC,1.2,70000,100\n2024-04-01,buy,ETH,10,3000,30\n2024-06-01,sell,ETH,4,2500,20',
  run: ([inp], o) => {
    const r = cgtCalc(need(inp, 'the transactions CSV'), o.method, +o.days > 0 ? +o.days : Infinity, +o.pct || 0);
    if (!r.events.length) throw new Error('No sales found: add at least one "sell" row after a "buy".');
    const rows = r.events.map((e) => e.note ? [e.d.toISOString().slice(0, 10), e.a, round(e.q, 8), '', '', '', '', e.note] : [e.d.toISOString().slice(0, 10), e.a, round(e.q, 8), e.bought.toISOString().slice(0, 10) + ` (${e.held} d)`, money(e.proceeds), money(e.cost), money(e.gain), e.eligible ? `discount -> ${money(e.net)}` : '']);
    const nonDisc = r.events.filter((e) => e.gain > 0 && !e.eligible).reduce((a, e) => a + e.gain, 0), disc = r.events.filter((e) => e.eligible).reduce((a, e) => a + e.gain, 0), L = r.loss, pctD = +o.pct || 0;
    const useNon = Math.min(nonDisc, L), useDisc = Math.min(disc, L - useNon), carry = L - useNon - useDisc, net = nonDisc - useNon + (disc - useDisc) * (1 - pctD / 100);
    return `${o.method} matching, ${+o.days > 0 ? `${o.pct}% discount after ${o.days} days` : 'no discount'}.\n\n${table(['sold', 'asset', 'qty', 'bought (held)', 'proceeds', 'cost base', 'gain/loss', 'discount'], rows)}\n\nGains without discount:        ${money(nonDisc)}\nGains eligible for discount:  ${money(disc)}\nCapital losses:               ${money(L)}  (applied first to gains without discount, then to discountable gains, before the discount)\nNet capital gain:             ${money(net)}${carry > 0 ? `\nLoss carried forward:         ${money(carry)}` : ''}\n${Object.keys(r.open).length ? 'Still held: ' + Object.entries(r.open).map(([k, v]) => `${round(v, 8)} ${k}`).join(', ') : ''}\n\nFees are added to the cost base on buys and deducted from proceeds on sells. Australian rules in short: gain = proceeds - cost base; individuals and trusts get a 50% discount on gains from assets held at least 12 months; capital losses are set against gains before the discount. Swaps between crypto assets are disposals (record both legs as a sell and a buy at market value). Companies get no discount: set the discount to 0. Not tax advice and not a tax return.`;
  },
});

// ---- passport validity
function addMonths(d, n) { const x = new Date(d.getTime()); const day = x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(day, last)); return x; }
const dstr = (d) => d.toISOString().slice(0, 10);
T.push({
  id: 'passport-validity-checker', cat: CALCE, title: 'Passport Validity Checker (Schengen 3-Month, 6-Month Rule, Issue Age)',
  desc: 'Check whether your passport meets a typical entry rule: Schengen (valid 3 months after departure and issued within 10 years), the common 6-month rule, or valid for the stay. Shows the latest date you must renew.',
  inputs: 0, sample: '', opts: [{ id: 'expiry', label: 'Passport expiry date (YYYY-MM-DD)', type: 'text', def: '2027-01-15' }, { id: 'issue', label: 'Passport issue date (YYYY-MM-DD)', type: 'text', def: '2017-02-01' }, { id: 'entry', label: 'Planned entry date', type: 'text', def: '2026-11-20' }, { id: 'exit', label: 'Planned departure date', type: 'text', def: '2026-12-05' }, { id: 'rule', label: 'Rule to check', type: 'select', choices: ['Schengen area', '6 months after entry', '3 months after departure', 'Valid for the whole stay'], def: 'Schengen area' }],
  run: (_, o) => {
    const P = (s, n) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s).trim())) throw new Error(`${n} must be YYYY-MM-DD.`); const d = new Date(String(s).trim() + 'T00:00:00Z'); if (Number.isNaN(d.getTime())) throw new Error(`${n} is not a valid date.`); return d; };
    const exp = P(o.expiry, 'Expiry date'), iss = P(o.issue, 'Issue date'), ent = P(o.entry, 'Entry date'), out = P(o.exit, 'Departure date'); if (out < ent) throw new Error('Departure is before entry.');
    const chk = []; let latest;
    if (o.rule === 'Schengen area') { latest = addMonths(out, 3); chk.push([exp >= latest, `valid at least 3 months after departure: must expire on or after ${dstr(latest)}`], [addMonths(iss, 120) > ent, `issued less than 10 years before entry: issue date must be after ${dstr(addMonths(ent, -120))}`]); }
    else if (o.rule === '6 months after entry') { latest = addMonths(ent, 6); chk.push([exp >= latest, `valid 6 months after entry: must expire on or after ${dstr(latest)}`]); }
    else if (o.rule === '3 months after departure') { latest = addMonths(out, 3); chk.push([exp >= latest, `valid 3 months after departure: must expire on or after ${dstr(latest)}`]); }
    else { latest = out; chk.push([exp >= out, `valid until departure: must expire on or after ${dstr(out)}`]); }
    const ok = chk.every((c) => c[0]), days = Math.round((exp - ent) / 86400000);
    return `${ok ? 'PASS' : 'FAIL'}: ${o.rule}\n\n${chk.map(([k, m]) => `${k ? 'ok  ' : 'FAIL'}  ${m}`).join('\n')}\n\nPassport expires ${dstr(exp)} (${days} days after entry). Latest acceptable expiry for this trip: ${dstr(latest)}${exp < latest ? `. You are short by ${Math.round((latest - exp) / 86400000)} days: renew before travelling.` : '.'}\n\nThe Schengen rule counts from the planned DEPARTURE date and requires issue within the previous 10 years at ENTRY. Many other countries want 6 months after ENTRY. Rules differ by destination and nationality, change, and airlines apply them strictly: confirm with the destination's embassy or the IATA Timatic / official government site before you travel.`;
  },
});

// ---- currency conversion with your own rates
T.push({
  id: 'currency-converter-manual-rates', cat: CALCE, title: 'Currency Converter with Your Own Rates (ECB CSV or XML Paste, Cross Rates)',
  desc: 'Convert between currencies using rates you paste: the ECB daily reference file (CSV or XML), or lines like "USD 1.0850". Cross rates are computed through the base currency. No live feed, so the rates are as old as your paste.',
  inputs: 2, labels: ['Rates: ECB eurofxref CSV/XML, or lines "CODE rate" (units per 1 base currency)', 'Conversions, one per line: 250 USD to EUR, GBP'], placeholder: ['Date,USD,JPY\n2026-10-22,1.0850,163.2', '250 USD to EUR, GBP'],
  opts: [{ id: 'base', label: 'Base currency of the pasted rates', type: 'text', def: 'EUR' }],
  sample: 'Date, USD, JPY, GBP, CHF, \n2026-10-22, 1.0850, 163.20, 0.8420, 0.9380,', sample2: '250 USD to EUR, GBP, JPY\n1000 EUR to USD\n5000 JPY to CHF',
  run: ([rt, conv], o) => {
    const t = need(rt, 'the rates'), base = (o.base || 'EUR').toUpperCase(), R = { [base]: 1 }; let date = '';
    const xml = [...t.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)];
    if (xml.length) { xml.forEach((m) => { R[m[1]] = +m[2]; }); date = /time=['"](\d{4}-\d{2}-\d{2})/.exec(t)?.[1] || ''; }
    else if (/^\s*date\s*[,;\t]/i.test(t)) { const rows = parseCsv(t); const h = rows[0].map((x) => x.trim().toUpperCase()), v = rows[1] || []; date = (v[0] || '').trim(); h.forEach((c, i) => { if (/^[A-Z]{3}$/.test(c) && Number.isFinite(num(v[i]))) R[c] = num(v[i]); }); }
    else for (const l of lines(t)) { const m = /^([A-Za-z]{3})\s*[:=\s]\s*([\d.,]+)$/.exec(l); if (m) R[m[1].toUpperCase()] = num(m[2].replace(',', '.')); }
    if (Object.keys(R).length < 2) throw new Error('No rates found. Paste the ECB file or lines like "USD 1.0850".');
    const out = [`${Object.keys(R).length} currencies, base ${base}${date ? ', rates dated ' + date : ''}. Cross rates go through ${base}.`];
    for (const l of lines(conv || '')) {
      const m = /^([\d.,]+)\s*([A-Za-z]{3})\s*(?:to|in|->|=)\s*(.+)$/i.exec(l); if (!m) { out.push(`${l}\n    cannot read; use e.g. 250 USD to EUR, GBP`); continue; }
      const amt = num(m[1].replace(',', '.')), from = m[2].toUpperCase();
      if (!R[from]) { out.push(`${l}\n    no rate for ${from}`); continue; }
      out.push(`${amt} ${from}\n` + m[3].split(/[,\s]+/).filter(Boolean).map((c) => { c = c.toUpperCase(); return R[c] ? `    = ${money(amt / R[from] * R[c])} ${c}   (1 ${from} = ${round(R[c] / R[from], 6)} ${c}; 1 ${c} = ${round(R[from] / R[c], 6)} ${from})` : `    no rate for ${c}`; }).join('\n'));
    }
    if (!lines(conv || '').length) { const cs = Object.keys(R).slice(0, 8); out.push(sec('Cross-rate table', table(['1 unit of', ...cs], cs.map((a) => [a, ...cs.map((b) => round(R[b] / R[a], 4))])))); }
    out.push('These are reference rates, not what a bank or card charges (they add a margin). The page fetches no live data; for current ECB rates open ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml in your browser and paste it here.');
    return out.join('\n\n');
  },
});

// ---- HS code lookup (WCO HS 2022 six-digit nomenclature)
const HS_SECTIONS = { I: 'Live animals; animal products', II: 'Vegetable products', III: 'Animal or vegetable fats and oils', IV: 'Prepared foodstuffs; beverages, spirits, tobacco', V: 'Mineral products', VI: 'Products of the chemical or allied industries', VII: 'Plastics and rubber', VIII: 'Raw hides, skins, leather, furs', IX: 'Wood, cork, straw articles', X: 'Pulp of wood; paper and paperboard', XI: 'Textiles and textile articles', XII: 'Footwear, headgear, umbrellas', XIII: 'Articles of stone, plaster, cement, ceramics, glass', XIV: 'Pearls, precious stones and metals, jewellery', XV: 'Base metals and articles of base metal', XVI: 'Machinery and electrical equipment', XVII: 'Vehicles, aircraft, vessels', XVIII: 'Optical, medical instruments; clocks; musical instruments', XIX: 'Arms and ammunition', XX: 'Miscellaneous manufactured articles', XXI: 'Works of art, collectors\' pieces, antiques' };
let hsData;
async function hsLoad() {
  if (hsData) return hsData; const url = new URL('../../data/hs-2022.tsv', import.meta.url); let txt;
  if (typeof window === 'undefined') txt = await (await import('node:fs/promises')).readFile(url, 'utf8'); else { const r = await fetch(url); if (!r.ok) throw new Error('Could not load the HS table (HTTP ' + r.status + ')'); txt = await r.text(); }
  const rows = txt.split('\n').filter(Boolean).map((l) => { const [code, sec, desc] = l.split('\t'); return { code, sec, desc }; }); const byCode = new Map(rows.map((r) => [r.code, r]));
  return (hsData = { rows, byCode });
}
T.push({
  id: 'hs-code-lookup', cat: 'Reference', title: 'HS Code Lookup (Harmonized System 2022, Search by Code or Words)',
  desc: 'Search the six-digit Harmonized System (HS 2022) tariff nomenclature by code or description. See the section, chapter, heading and subheading chain for any product. Runs offline on a public-domain dataset.',
  inputs: 1, labels: ['HS code (e.g. 8471 or 847130) or words (e.g. laptop, cotton shirt)'], placeholder: ['847130'], sample: '847130',
  run: async ([inp]) => {
    const q = need(inp, 'an HS code or a product description').trim(), { rows, byCode } = await hsLoad(); const chain = (c) => [c.slice(0, 2), c.slice(0, 4), c].filter((x, i, a) => byCode.has(x) && a.indexOf(x) === i).map((x) => byCode.get(x));
    const show = (r) => { const ch = chain(r.code); return `${r.code.length === 6 ? r.code.slice(0, 4) + '.' + r.code.slice(4) : r.code.length === 4 ? r.code.slice(0, 2) + '.' + r.code.slice(2) : r.code}  ${r.desc}\n` + `    Section ${r.sec}: ${HS_SECTIONS[r.sec] || ''}\n` + ch.map((c, i) => `    ${'  '.repeat(i)}${c.code}  ${c.desc}`).join('\n'); };
    const digits = q.replace(/[.\s-]/g, '');
    let out;
    if (/^\d{2,6}$/.test(digits)) { const hit = rows.filter((r) => r.code.startsWith(digits)); if (!hit.length) throw new Error(`No HS 2022 code starts with ${digits}.`); const exact = byCode.get(digits); out = (exact ? show(exact) + '\n\n' : '') + `Codes starting with ${digits} (${hit.length}):\n` + hit.slice(0, 60).map((r) => `  ${r.code}  ${r.desc}`).join('\n') + (hit.length > 60 ? `\n  ... ${hit.length - 60} more` : ''); }
    else { const words = wordsOf(q).filter((w) => w.length > 1); const hit = rows.filter((r) => words.every((w) => r.desc.toLowerCase().includes(w))).sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code)); if (!hit.length) throw new Error('No description contains all of: ' + words.join(', ')); out = `${hit.length} matches (showing ${Math.min(25, hit.length)}):\n\n` + hit.slice(0, 25).map(show).join('\n\n'); }
    return out + '\n\nHS 2022 six-digit international nomenclature (WCO) from UN Comtrade via the datasets/harmonized-system project (ODC Public Domain Dedication and Licence). Countries extend it to 8 to 10 digits with their own duty rates (EU TARIC / CN, US HTS, UK Trade Tariff) and update it every five years: classify binding goods with the national tariff and, if in doubt, apply for a binding tariff information ruling.';
  },
});

export const _gap5 = { checkTaxId, parseClientHello, ja3Of, ja4Of, hexToBytes, parseIPv4, parseIPv6, countryOf, ipCountryDB, parseNmap, parseDig, whoisParse, cgtCalc }; // exposed for tests; ignored by the app
export default T;

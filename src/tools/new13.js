// Tools from free-browser-tools.md, batch 13 (text tools, writing checks, social media). See TOOLS.md for the contract.
// Everything is pasted text in, text out. Nothing is fetched. Skipped rows and why: peerreview/new-list/13.md.
// Ceilings: writing checks are word-list heuristics for English; platform limits and rates change, so each shows its date and is editable.
const T = [];
const TXT = 'Text', FUN = 'Text Fun', MKT = 'Marketing', CONT = 'SEO – Content', CALC = 'Calculators – Everyday';

const need = (t, w = 'text') => { if (t == null || !String(t).trim()) throw new Error('Paste ' + w + ' first.'); return String(t); };
const lines = (t) => String(t ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const round = (n, d = 1) => { const p = 10 ** d; return Math.round((n + Number.EPSILON) * p) / p; };
const num = (v, name, min = -Infinity) => { const n = Number(String(v).replace(/,/g, '.')); if (v === '' || v == null || !Number.isFinite(n) || n < min) throw new Error(name + ' must be a number' + (min > -Infinity ? ' of at least ' + min : '') + '.'); return n; };
const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
const table = (head, rows) => {
  const all = [head, ...rows].map((r) => r.map((c) => String(c ?? '')));
  const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  const line = (r) => r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd();
  return [line(all[0]), w.map((n) => '-'.repeat(n)).join('  '), ...all.slice(1).map(line)].join('\n');
};
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (s) => (seg ? [...seg.segment(s)].map((x) => x.segment) : [...s]);
const glen = (s) => graphemes(s).length;
const utf8 = (s) => new TextEncoder().encode(s).length;
const words = (t) => (String(t).match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) || []);
const sentences = (t) => String(t).replace(/\r/g, '').match(/[^.!?\n]+(?:[.!?]+["')\]]*|$)|\n+/g)?.map((s) => s.trim()).filter(Boolean) || [];
// seeded random for generators: xmur3 + mulberry32. Empty seed = crypto random.
const rng = (seed) => {
  let a;
  if (seed && String(seed).trim()) { let h = 1779033703 ^ String(seed).length; for (const c of String(seed)) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); } h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); a = (h ^ (h >>> 16)) >>> 0; }
  else a = crypto.getRandomValues(new Uint32Array(1))[0];
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
const pick = (r, a) => a[Math.floor(r() * a.length)];
const shuffle = (r, a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sha256hex = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
// seeded uniform integer in [0,n) from SHA-256 of seed:counter (rejection sampling, no modulo bias)
const hashRng = (seed) => { let c = 0; return async (n) => { const lim = Math.floor(4294967296 / n) * n; for (;;) { const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed + ':' + c++))); const v = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0; if (v < lim) return v % n; } }; };
const cryptoInt = async (n) => { const lim = Math.floor(4294967296 / n) * n; for (;;) { const v = crypto.getRandomValues(new Uint32Array(1))[0]; if (v < lim) return v % n; } };

// ---------- X weighting (twitter-text config v3: scale 100, default weight 200, ranges 0-4351, 8192-8205, 8208-8223, 8242-8247 weigh 100, URL 23, max 280) ----------
const cpWeight = (cp) => ((cp <= 4351) || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247) ? 1 : 2);
const URL_RE = /\bhttps?:\/\/[^\s<>"]+|\bwww\.[^\s<>"]+/gi;
const xLength = (text) => {
  let urls = 0;
  const rest = text.replace(URL_RE, () => { urls++; return ''; });
  let w = urls * 23;
  for (const g of graphemes(rest)) w += /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g) ? 2 : [...g].reduce((s, c) => s + cpWeight(c.codePointAt(0)), 0);
  return { weighted: w, urls };
};
const urlAware = (text, urlLen = 23) => { let urls = 0; const rest = text.replace(URL_RE, () => { urls++; return ''; }); return glen(rest) + urls * urlLen; };

// 850
T.push({
  id: 'char-limit-counter', cat: TXT, title: 'Character Counter with Custom Limits (160, 280, 500)',
  desc: 'Count characters as you paste and see how many are left against one or more limits you choose, such as 160 for SMS or 280 for a post.',
  inputs: 1, labels: ['Text'], placeholder: ['Paste or type your text'],
  opts: [{ id: 'limits', label: 'Limits (comma separated)', type: 'text', def: '160, 280, 500' }, { id: 'trim', label: 'Ignore leading and trailing spaces', type: 'checkbox', def: false }],
  sample: 'Your order #4821 has shipped and should arrive on Thursday. Track it here: https://example.com/t/4821',
  run: ([t], o) => {
    let s = String(t ?? ''); if (o.trim) s = s.trim();
    const lim = String(o.limits || '').split(/[,\s;]+/).filter(Boolean).map((x) => num(x, 'Limit ' + x, 1));
    const g = glen(s), cp = [...s].length;
    const rows = lim.map((l) => [fmt(l, 0), g <= l ? fmt(l - g, 0) + ' left' : fmt(g - l, 0) + ' over', g <= l ? 'within' : 'over']);
    return `Characters (as people count them): ${g}\nCode points: ${cp}\nUTF-16 units (JavaScript length): ${s.length}\nUTF-8 bytes: ${utf8(s)}\nWords: ${words(s).length}\nLines: ${s ? s.split(/\r?\n/).length : 0}\n\n` +
      (rows.length ? table(['Limit', 'Remaining', 'Status'], rows) + '\n\nEach emoji or accented letter counts as one character here. SMS segments and some platforms count differently (see the post length checker for X, and note that SMS uses 70 characters per segment once any non-GSM character appears).' : 'Add at least one limit.');
  },
});

// 903
T.push({
  id: 'x-post-character-counter', cat: MKT, title: 'X (Twitter) Post Character Counter with URL Weighting',
  desc: 'Count a post the way X does: links count as 23, emoji and CJK count as 2, and the limit is 280 weighted characters.',
  inputs: 1, labels: ['Post'], opts: [{ id: 'max', label: 'Limit (weighted)', type: 'number', def: 280 }],
  sample: 'Shipped our new free tools page today 🚀 https://example.com/free-tools/seo-checker?utm_source=x&utm_medium=social&utm_campaign=launch 日本語もOK',
  run: ([t], o) => {
    const s = String(t ?? ''), max = num(o.max, 'Limit', 1), r = xLength(s);
    return `Weighted length: ${r.weighted} of ${max}\n${r.weighted <= max ? 'Remaining: ' + (max - r.weighted) : 'Over by: ' + (r.weighted - max)}\nLinks found: ${r.urls} (each counts 23)\nPlain character count (graphemes): ${glen(s)}\n\nRules used (twitter-text config v3, checked against the X documentation): Latin text and common punctuation count 1, emoji and CJK count 2, every http(s):// or www. link counts 23 whatever its length. Links without a scheme (like example.com) are not detected here, but X may still treat them as links. Premium accounts have longer limits: change the limit above.`;
  },
});

// 904
const PLAT = [
  ['X', 280, 'weighted: links 23, emoji and CJK 2 (checked)'],
  ['Threads', 500, 'text posts (checked in Meta docs; emoji may count by bytes there)'],
  ['Bluesky', 300, 'graphemes (not verified here)'],
  ['Mastodon', 500, 'default; each instance sets its own, links count 23 (not verified here)'],
  ['Instagram caption', 2200, 'characters (not verified here)'],
  ['LinkedIn post', 3000, 'characters (not verified here)'],
];
T.push({
  id: 'social-post-length-checker', cat: MKT, title: 'Multi-Platform Post Length Checker (X, Threads, Bluesky, LinkedIn, Instagram)',
  desc: 'Paste one draft and see whether it fits X, Threads, Bluesky, Mastodon, Instagram and LinkedIn limits, with the characters left on each.',
  inputs: 1, labels: ['Draft post'], opts: [{ id: 'custom', label: 'Extra limit to test (0 = none)', type: 'number', def: 0 }],
  sample: 'We just published our guide to writing alt text that actually helps people. Short version: describe the purpose, not the pixels. Full guide: https://example.com/alt-text #accessibility #a11y',
  run: ([t], o) => {
    const s = need(t, 'a draft'), rows = [];
    for (const [n, lim, how] of PLAT) {
      const used = n === 'X' ? xLength(s).weighted : n === 'Mastodon' ? urlAware(s) : glen(s);
      rows.push([n, used, lim, used <= lim ? (lim - used) + ' left' : (used - lim) + ' over', how]);
    }
    const c = Number(o.custom) || 0; if (c > 0) rows.push(['Custom', glen(s), c, glen(s) <= c ? (c - glen(s)) + ' left' : (glen(s) - c) + ' over', 'graphemes']);
    return table(['Platform', 'Used', 'Limit', 'Room', 'How it is counted'], rows) + '\n\nLimits are as published or commonly quoted in 2026 and platforms change them. Only X (character weights, link length 23) and Threads (500) were checked against the vendor documentation; treat the others as review items and confirm in the platform before relying on them.';
  },
});

// 856
T.push({
  id: 'random-line-picker', cat: 'Randomness', title: 'Random Line Picker (Draw Lines from a List)',
  desc: 'Pick one or more random lines from a pasted list, with or without repeats, using your browser secure random numbers.',
  inputs: 1, labels: ['List, one item per line'],
  opts: [{ id: 'n', label: 'How many to pick', type: 'number', def: 2 }, { id: 'repeat', label: 'Allow the same line twice', type: 'checkbox', def: false }, { id: 'dedupe', label: 'Treat identical lines as one', type: 'checkbox', def: false }],
  sample: 'Pizza\nTacos\nSushi\nCurry\nSalad',
  run: async ([t], o) => {
    let a = lines(t); if (o.dedupe) a = [...new Set(a)];
    if (!a.length) throw new Error('Paste a list first.');
    const n = Math.floor(num(o.n, 'How many', 1));
    if (!o.repeat && n > a.length) throw new Error('You asked for ' + n + ' but the list has only ' + a.length + ' lines.');
    const out = [], pool = [...a];
    for (let i = 0; i < n; i++) { const k = await cryptoInt(pool.length); out.push(pool[k]); if (!o.repeat) pool.splice(k, 1); }
    return out.join('\n') + `\n\n(${n} of ${a.length} lines, each line equally likely)`;
  },
});

// 919
T.push({
  id: 'giveaway-winner-picker', cat: 'Randomness', title: 'Giveaway Winner Picker (with Backups and Audit Hash)',
  desc: 'Draw winners and backup winners from a list of entrants, remove duplicates, and keep a hash of the list so the draw can be shown to be fair.',
  inputs: 2, labels: ['Entrants, one per line', 'Excluded names (optional)'],
  opts: [{ id: 'w', label: 'Winners', type: 'number', def: 1 }, { id: 'b', label: 'Backup winners', type: 'number', def: 2 }, { id: 'seed', label: 'Public seed (optional, makes the draw repeatable)', type: 'text', def: '' }],
  sample: 'ana_k\nben.t\nCarla\nben.t\ndmitri\nelif\nfrank\ngreta', sample2: 'frank',
  run: async ([t, ex], o) => {
    const seen = new Set(), drop = new Set(lines(ex).map((x) => x.toLowerCase())); let dup = 0, exc = 0; const pool = [];
    for (const l of lines(t)) { const k = l.toLowerCase(); if (drop.has(k)) { exc++; continue; } if (seen.has(k)) { dup++; continue; } seen.add(k); pool.push(l); }
    const w = Math.floor(num(o.w, 'Winners', 1)), b = Math.floor(num(o.b, 'Backups', 0));
    if (!pool.length) throw new Error('No entrants left to draw from.');
    if (w + b > pool.length) throw new Error('You asked for ' + (w + b) + ' draws but only ' + pool.length + ' unique entrants remain.');
    const seed = String(o.seed || '').trim(), next = seed ? hashRng(seed) : cryptoInt, chosen = [], rest = [...pool];
    for (let i = 0; i < w + b; i++) chosen.push(rest.splice(await next(rest.length), 1)[0]);
    const hash = await sha256hex(pool.map((x) => x.toLowerCase()).join('\n'));
    return 'Winners\n' + chosen.slice(0, w).map((x, i) => `${i + 1}. ${x}`).join('\n') + (b ? '\n\nBackups (use in this order)\n' + chosen.slice(w).map((x, i) => `${i + 1}. ${x}`).join('\n') : '') +
      `\n\nUnique entrants: ${pool.length} (duplicates removed: ${dup}, excluded: ${exc})\nSHA-256 of the cleaned entrant list (lower case, one per line, in the order pasted): ${hash}\n` +
      (seed ? `Seed: "${seed}". The same list and seed always give the same result. Announce the seed only after entries close, otherwise it can be gamed.` : 'No seed: this draw used your browser secure random numbers and cannot be repeated. Use a seed if you need to prove the result.') +
      '\n\nCheck the rules of the platform and the law where you run the giveaway; this tool only draws names.';
  },
});

// 854
T.push({
  id: 'line-break-remover', cat: TXT, title: 'Line Break Remover (Unwrap Hard-Wrapped Text)',
  desc: 'Join text copied from a PDF or email back into flowing paragraphs, keeping real paragraph breaks, bullet lists and optionally mending hyphenated words.',
  inputs: 1, labels: ['Hard-wrapped text'],
  opts: [{ id: 'hyph', label: 'Join words split with a hyphen at the line end', type: 'checkbox', def: true }, { id: 'list', label: 'Keep bullets and numbered items on their own lines', type: 'checkbox', def: true }, { id: 'all', label: 'Remove every line break (one single line)', type: 'checkbox', def: false }],
  sample: 'Text copied from a PDF often breaks every\n70 characters, which makes it hard to reuse. The tool\njoins the lines again and mends hyphen-\nated words.\n\nA blank line starts a new paragraph.\n- Bullets stay on their own lines\n- like this one',
  run: ([t], o) => {
    let s = need(t).replace(/\r\n?/g, '\n');
    if (o.all) return s.replace(/-\n(?=[a-z])/g, o.hyph ? '' : '-').replace(/\s*\n\s*/g, ' ').replace(/ {2,}/g, ' ').trim();
    const item = /^\s*(?:[-*•–·]|\d{1,3}[.)])\s+/;
    const out = [];
    for (const para of s.split(/\n\s*\n/)) {
      let cur = '';
      for (const raw of para.split('\n')) {
        const l = raw.trim(); if (!l) continue;
        if (!cur) { cur = l; continue; }
        if (o.list && item.test(l)) { out.push(cur); cur = l; continue; }
        if (o.hyph && /[a-z]-$/.test(cur) && /^[a-z]/.test(l)) cur = cur.slice(0, -1) + l;
        else cur += ' ' + l;
      }
      if (cur) out.push(cur);
      out.push('');
    }
    // keep a blank line between paragraphs, but not between list items
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().replace(/(\n)\n(?=\s*(?:[-*•–·]|\d{1,3}[.)])\s)/g, (m, a, off, all) => (item.test(all.slice(0, off).split('\n').pop()) ? a : m));
  },
});

// 860
T.push({
  id: 'text-splitter', cat: TXT, title: 'Text Splitter by Characters, Words, Lines or Sentences',
  desc: 'Cut a long text into parts of a set number of characters, words, lines or sentences, for example to fit a limit. Words are never cut in half.',
  inputs: 1, labels: ['Text to split'],
  opts: [{ id: 'unit', label: 'Count by', type: 'select', choices: ['characters', 'words', 'lines', 'sentences'], def: 'words' }, { id: 'size', label: 'Maximum per part', type: 'number', def: 12 }],
  sample: 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.',
  run: ([t], o) => {
    const s = need(t), size = Math.floor(num(o.size, 'Size', 1)), parts = [];
    if (o.unit === 'characters') {
      let cur = '';
      for (const w of s.split(/(\s+)/)) {
        if (!w) continue;
        if (glen(cur + w) <= size) { cur += w; continue; }
        if (cur.trim()) parts.push(cur.trim()); cur = '';
        if (/^\s+$/.test(w)) continue;
        let g = graphemes(w); while (g.length > size) { parts.push(g.splice(0, size).join('')); } cur = g.join('');
      }
      if (cur.trim()) parts.push(cur.trim());
    } else {
      const units = o.unit === 'words' ? s.split(/\s+/).filter(Boolean) : o.unit === 'lines' ? s.split(/\r?\n/) : sentences(s);
      const j = o.unit === 'words' ? ' ' : '\n';
      for (let i = 0; i < units.length; i += size) parts.push(units.slice(i, i + size).join(j));
    }
    return parts.map((p, i) => `--- Part ${i + 1} of ${parts.length} (${glen(p)} characters) ---\n${p}`).join('\n\n') + (o.unit === 'characters' ? '\n\nA single word longer than the limit is cut at the limit.' : '');
  },
});

// 863
T.push({
  id: 'number-extractor-sum', cat: TXT, title: 'Number Extractor with Sum, Average, Min and Max',
  desc: 'Find every number in a block of text, list them, and get the total, average, smallest and largest. Handles thousands separators and decimal commas.',
  inputs: 1, labels: ['Text containing numbers'],
  opts: [{ id: 'dec', label: 'Number style', type: 'select', choices: ['1,234.56 (comma thousands)', '1.234,56 (decimal comma)'], def: '1,234.56 (comma thousands)' }],
  sample: 'Coffee 3.50, sandwich 8.25, two teas at 2.80 each, tip -1.00. Total spend this year: 1,204.40 over 36 visits.',
  run: ([t], o) => {
    const eu = String(o.dec).startsWith('1.234,');
    const re = eu ? /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/g : /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
    const m = need(t).match(re);
    if (!m) throw new Error('No numbers found.');
    const parsed = m.map((x) => { const c = eu ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, ''); const [i, f = ''] = c.replace('-', '').split('.'); return { raw: x, f: f.length, neg: c.startsWith('-'), big: BigInt(i + f) }; });
    const d = Math.max(...parsed.map((p) => p.f));
    const sc = parsed.map((p) => (p.neg ? -1n : 1n) * p.big * 10n ** BigInt(d - p.f));
    const show = (b) => { const neg = b < 0n; let s = (neg ? -b : b).toString().padStart(d + 1, '0'); if (d) s = s.slice(0, -d) + '.' + s.slice(-d); return (neg ? '-' : '') + s; };
    const sum = sc.reduce((a, b) => a + b, 0n);
    const mn = sc.reduce((a, b) => (b < a ? b : a)), mx = sc.reduce((a, b) => (b > a ? b : a));
    const avg = Number(sum) / 10 ** d / sc.length;
    return `Found ${m.length} number(s)\n\n${m.join('\n')}\n\nSum: ${show(sum)}\nAverage: ${round(avg, 4)}\nSmallest: ${show(mn)}\nLargest: ${show(mx)}\n\nNumbers glued to letters (like "4K" or dates such as 2026-03-01) are read as separate numbers.`;
  },
});

// 868
T.push({
  id: 'smart-quote-converter', cat: TXT, title: 'Smart Quote Converter (Straight to Curly and Back)',
  desc: 'Convert straight quotes to typographic curly quotes or the other way round, and optionally dashes and ellipses too.',
  inputs: 1, labels: ['Text'],
  opts: [{ id: 'mode', label: 'Direction', type: 'select', choices: ['Straight to curly', 'Curly to straight'], def: 'Straight to curly' }, { id: 'extra', label: 'Also convert -- and ... (or the reverse)', type: 'checkbox', def: true }],
  sample: `"It's a 'smart' tool," she said -- and it works...\nThe '90s were fun; rock 'n' roll was big.`,
  run: ([t], o) => {
    let s = need(t);
    if (o.mode === 'Curly to straight') {
      s = s.replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"');
      if (o.extra) s = s.replace(/—/g, '--').replace(/–/g, '-').replace(/…/g, '...');
      return s;
    }
    s = s.replace(/(^|[\s(\[{—–-])"/g, '$1“').replace(/"/g, '”')
      .replace(/(^|[\s(\[{—–-])'(?=\p{L}|\p{N}|“)/gu, '$1‘').replace(/'/g, '’');
    if (o.extra) s = s.replace(/ ?-- ?/g, '—').replace(/\.\.\./g, '…');
    return s + '\n\n---\nRule used: a quote after a space, bracket or dash opens; every other one closes. Leading apostrophes in words like ’tis, ’90s or ’n’ come out as opening quotes and may need a manual fix.';
  },
});

// 872
T.push({
  id: 'pig-latin-translator', cat: FUN, title: 'Pig Latin Translator (English to Pig Latin and Back)',
  desc: 'Turn English text into Pig Latin by moving leading consonants to the end and adding "ay", keeping capitals and punctuation.',
  inputs: 1, labels: ['English text'],
  opts: [{ id: 'v', label: 'Ending for words that start with a vowel', type: 'select', choices: ['way', 'yay', 'ay', 'hay'], def: 'way' }],
  sample: 'Hello world! Quiet children eat apples, string beans and rhythm.',
  run: ([t], o) => need(t).replace(/[A-Za-z]+(?:'[A-Za-z]+)*/g, (w) => {
    const low = w.toLowerCase(); let i = 0;
    if (/^[aeiou]/.test(low)) { var r = low + o.v; }
    else {
      while (i < low.length && !/[aeiou]/.test(low[i]) && !(i > 0 && low[i] === 'y')) { if (low[i] === 'q' && low[i + 1] === 'u') i++; i++; }
      r = i >= low.length ? low + 'ay' : low.slice(i) + low.slice(0, i) + 'ay';
    }
    if (w === w.toUpperCase() && w.length > 1) return r.toUpperCase();
    return /^[A-Z]/.test(w) ? r[0].toUpperCase() + r.slice(1) : r;
  }) + '\n\nRules: a leading consonant group (and "qu") moves to the end plus "ay"; words that start with a vowel get the chosen ending. There are several variants of Pig Latin, this is the common one.',
});

// 869 (client-side part)
T.push({
  id: 'anagram-word-finder', cat: FUN, title: 'Anagram Word Finder from Your Own Word List',
  desc: 'Find which words from a list you paste can be spelled with a set of letters, with blanks allowed. Full anagrams or any shorter word.',
  inputs: 2, labels: ['Letters (use ? for a blank)', 'Word list, one word per line'],
  opts: [{ id: 'mode', label: 'Match', type: 'select', choices: ['Any word that fits the letters', 'Only words using every letter'], def: 'Any word that fits the letters' }, { id: 'min', label: 'Minimum word length', type: 'number', def: 3 }],
  sample: 'listen', sample2: 'enlist\ninlets\nsilent\ntinsel\nlist\nlint\nsilt\nsit\nstone\nlistens\nelastic\nin',
  run: ([l, w], o) => {
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z?]/g, '');
    const letters = norm(String(l || '')); if (!letters) throw new Error('Enter some letters.');
    const list = lines(w); if (!list.length) throw new Error('Paste a word list: this tool has no built-in dictionary.');
    const blanks = (letters.match(/\?/g) || []).length, base = {}; for (const c of letters.replace(/\?/g, '')) base[c] = (base[c] || 0) + 1;
    const total = letters.length, min = Math.floor(num(o.min, 'Minimum length', 1)), full = String(o.mode).startsWith('Only');
    const hits = [];
    for (const raw of new Set(list)) {
      const w2 = norm(raw).replace(/\?/g, ''); if (w2.length < min || w2.length > total || (full && w2.length !== total)) continue;
      const have = { ...base }; let need2 = 0;
      for (const c of w2) { if (have[c] > 0) have[c]--; else need2++; }
      if (need2 <= blanks) hits.push(raw);
    }
    if (!hits.length) return 'No words from your list fit.';
    hits.sort((a, b) => b.length - a.length || a.localeCompare(b));
    const by = {}; for (const h of hits) (by[h.length] ||= []).push(h);
    return Object.keys(by).sort((a, b) => b - a).map((k) => `${k} letters (${by[k].length}): ${by[k].join(', ')}`).join('\n') + `\n\n${hits.length} of ${new Set(list).size} words match. Accents are ignored. Words come only from the list you pasted.`;
  },
});

// ---------- writing checks: shared scanner ----------
// rules: [{ re: RegExp (global, i), note }]. Returns annotated text with ⟦ ⟧ around hits plus a table.
const scan = (text, rules, lead) => {
  const hits = [];
  for (const r of rules) { r.re.lastIndex = 0; let m; while ((m = r.re.exec(text))) { if (!m[0]) { r.re.lastIndex++; continue; } hits.push({ i: m.index, e: m.index + m[0].length, w: m[0], note: r.note }); } }
  hits.sort((a, b) => a.i - b.i || (b.e - b.i) - (a.e - a.i));
  const keep = []; let end = -1; for (const h of hits) if (h.i >= end) { keep.push(h); end = h.e; }
  let out = '', p = 0; for (const h of keep) { out += text.slice(p, h.i) + '⟦' + h.w + '⟧'; p = h.e; } out += text.slice(p);
  const by = new Map(); for (const h of keep) { const k = h.w.toLowerCase(); const e = by.get(k) || { n: 0, note: h.note }; e.n++; by.set(k, e); }
  const rows = [...by].sort((a, b) => b[1].n - a[1].n).map(([w, e]) => [w, e.n, e.note || '']);
  const wc = words(text).length;
  return { annotated: out, hits: keep.length, rows, wc, per100: wc ? round(100 * keep.length / wc, 1) : 0 };
};
const report = (s, name, tail, withNote = true) => `${s.hits} ${name} found in ${s.wc} words (${s.per100} per 100 words). Hits are marked ⟦like this⟧.\n\n${s.annotated}\n\n` + (s.rows.length ? table(withNote ? ['Found', 'Times', 'Consider'] : ['Found', 'Times'], s.rows.map((r) => (withNote ? r : r.slice(0, 2)))) : 'Nothing flagged.') + '\n\n' + tail;
const alt = (arr) => arr.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|');

// 879
const LY_SKIP = 'family only early july apply reply supply fly ally belly bully jelly holy ugly lonely lovely friendly silly rely multiply assembly butterfly anomaly italy jolly lily sly wily curly surly oily daily weekly monthly yearly hourly likely unlikely elderly orderly costly deadly lively timely homely kindly manly motherly fatherly brotherly sisterly scholarly cowardly heavenly earthly worldly ghostly gravelly rally tally dolly folly molly polly hilly billy willy chilly frilly gully sally bubbly bally ably'.split(' ');
const QUAL = ['very', 'really', 'quite', 'rather', 'somewhat', 'just', 'actually', 'basically', 'literally', 'totally', 'completely', 'absolutely', 'definitely', 'probably', 'simply', 'fairly', 'pretty much', 'almost', 'nearly', 'kind of', 'sort of', 'a bit', 'a little', 'slightly', 'perhaps', 'maybe', 'essentially', 'virtually', 'practically', 'highly', 'incredibly', 'extremely'];
T.push({
  id: 'adverb-highlighter', cat: CONT, title: 'Adverb and Weak Qualifier Highlighter',
  desc: 'Mark -ly adverbs and weak words like very, really, just and quite in your draft, with counts and a rate per 100 words.',
  inputs: 1, labels: ['Draft'], opts: [{ id: 'ly', label: 'Flag -ly words', type: 'checkbox', def: true }, { id: 'q', label: 'Flag qualifiers (very, really, just...)', type: 'checkbox', def: true }],
  sample: 'The report was really quite long, and it quickly became clear that we were almost completely lost. She walked slowly home and just stood there, literally speechless.',
  run: ([t], o) => {
    const rules = [];
    if (o.q) rules.push({ re: new RegExp('\\b(?:' + alt(QUAL) + ')\\b', 'gi'), note: 'cut it or use a stronger word' });
    if (o.ly) rules.push({ re: new RegExp('\\b(?!(?:' + LY_SKIP.join('|') + ')\\b)[a-z]{3,}ly\\b', 'gi'), note: 'adverb: try a stronger verb' });
    return report(scan(need(t), rules), 'adverb or qualifier hit(s)', 'Heuristic: any word ending in -ly is flagged except a list of common non-adverbs (family, only, early...). Some adverbs are useful; the goal is to look at each one, not to delete them all. English only.');
  },
});

// 881
const CLICHES = 'at the end of the day|think outside the box|low-hanging fruit|win-win|game changer|game-changer|paradigm shift|move the needle|touch base|circle back|deep dive|on the same page|tip of the iceberg|the elephant in the room|avoid like the plague|better late than never|bite the bullet|break the ice|burn the midnight oil|cut to the chase|dead as a doornail|easier said than done|every cloud has a silver lining|fall on deaf ears|hit the nail on the head|in a nutshell|it goes without saying|last but not least|leave no stone unturned|light at the end of the tunnel|read between the lines|the bottom line|the writing on the wall|time will tell|under the weather|water under the bridge|when all is said and done|with bated breath|raining cats and dogs|piece of cake|selling like hotcakes|needle in a haystack|nip it in the bud|only time will tell|go the extra mile|back to square one|the whole nine yards|off the beaten path|hustle and bustle|like a kid in a candy store|calm before the storm|crystal clear|dime a dozen|few and far between|food for thought|fresh pair of eyes|in the nick of time|the best of both worlds|at this point in time|in this day and age|a perfect storm|beat around the bush|cry over spilled milk|rome wasn\'t built in a day|the last straw|a blessing in disguise|add insult to injury|armed to the teeth|between a rock and a hard place|cold shoulder|cost an arm and a leg|from the bottom of my heart|hard as a rock|head over heels|in the blink of an eye|a dark and stormy night|take it to the next level|best practices|think different'.split('|');
T.push({
  id: 'cliche-detector', cat: CONT, title: 'Cliché and Overused Phrase Detector',
  desc: 'Mark clichés and worn-out phrases in your text using a built-in list of about 80, with counts.',
  inputs: 1, labels: ['Draft'], opts: [{ id: 'extra', label: 'Your own phrases to flag (comma separated)', type: 'text', def: '' }],
  sample: 'At the end of the day, we need to think outside the box and go the extra mile. It is a game changer, and in this day and age the bottom line is clear. Time will tell.',
  run: ([t], o) => {
    const list = [...CLICHES, ...String(o.extra || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)];
    return report(scan(need(t), [{ re: new RegExp('(?<![\\p{L}])(?:' + alt(list) + ')(?![\\p{L}])', 'giu'), note: 'say it fresh or plainly' }]), 'cliché(s)', 'The list is a hand-picked set of common English phrases, not exhaustive, and one writer\'s cliché is another\'s idiom. Fiction, speech and dialogue may use them on purpose. English only.', false);
  },
});

// 882
const JARGON = { leverage: 'use', synergy: 'teamwork, combined effect', synergies: 'combined benefits', 'circle back': 'follow up', 'touch base': 'talk, meet', 'reach out': 'contact', bandwidth: 'time, capacity', 'deep dive': 'close look', ideate: 'brainstorm', onboard: 'start, set up', 'best-in-class': 'excellent (say how)', 'best in class': 'excellent (say how)', 'value-add': 'benefit', 'value add': 'benefit', 'low-hanging fruit': 'easy wins', 'move the needle': 'make a difference', 'take offline': 'discuss later', 'going forward': 'from now on', 'at the end of the day': 'in the end', 'pain point': 'problem', 'pain points': 'problems', 'learnings': 'lessons', 'paradigm shift': 'big change', 'mission-critical': 'essential', 'mission critical': 'essential', 'thought leader': 'expert', 'thought leadership': 'expertise', empower: 'help, enable', 'empowering': 'helping', robust: 'strong, reliable', seamless: 'smooth', seamlessly: 'smoothly', scalable: 'able to grow', 'end-to-end': 'complete', 'holistic': 'whole, complete', 'streamline': 'simplify', 'utilize': 'use', 'utilise': 'use', 'utilization': 'use', 'facilitate': 'help, run', 'actionable': 'practical', 'stakeholder': 'person involved', 'stakeholders': 'people involved', 'cutting-edge': 'new, advanced', 'state-of-the-art': 'modern', 'world-class': 'excellent (say how)', 'next-generation': 'new', 'disrupt': 'change', 'disruptive': 'new, changing', 'innovative': 'new (say what is new)', 'ecosystem': 'network, system', 'granular': 'detailed', 'double-click': 'look closer', 'unpack': 'explain', 'pivot': 'change direction', 'ping': 'message', 'circle the wagons': 'get ready', 'boil the ocean': 'try to do too much', 'drill down': 'look in detail', 'core competency': 'main strength', 'core competencies': 'main strengths', 'mindshare': 'attention', 'win-win': 'good for both', 'buy-in': 'agreement', 'alignment': 'agreement', 'synergize': 'work together', 'rightsize': 'cut staff, resize', 'offboard': 'remove, say goodbye', 'solutioning': 'finding a solution', 'low hanging fruit': 'easy wins', 'blue sky thinking': 'free thinking', 'think outside the box': 'think creatively', 'game changer': 'big change', 'game-changer': 'big change', 'disintermediate': 'cut out the middleman', 'monetize': 'earn money from', 'operationalize': 'put into practice', 'incentivize': 'encourage', 'learnings.': 'lessons' };
T.push({
  id: 'jargon-buzzword-detector', cat: CONT, title: 'Jargon and Buzzword Detector with Plain Alternatives',
  desc: 'Flag corporate buzzwords like leverage, synergy and circle back and see a plainer word for each.',
  inputs: 1, labels: ['Draft'], opts: [],
  sample: 'We will leverage our core competencies to deliver a seamless, best-in-class solution. Let us circle back going forward and ideate on the low-hanging fruit with all stakeholders.',
  run: ([t]) => {
    const keys = Object.keys(JARGON).filter((k) => /[a-z]$/.test(k)).sort((a, b) => b.length - a.length);
    const s = scan(need(t), [{ re: new RegExp('(?<![\\p{L}-])(?:' + alt(keys) + ')(?![\\p{L}-])', 'giu'), note: '' }]);
    s.rows = s.rows.map(([w, n]) => [w, n, JARGON[w] || JARGON[w.replace(/\s+/g, ' ')] || JARGON[w.replace(/ /g, '-')] || JARGON[w.replace(/-/g, ' ')] || '']);
    return report(s, 'buzzword(s)', 'The word list is small and hand-written. Some of these are precise in their own field (for example "scalable" in engineering), so check the audience before swapping. English only.');
  },
});

// 883
const STOP = new Set('the and for are but not you all any can had her was one our out has have his how its may new now old see two way who did get him let say she too use that with this from they will would there their what about which when your were been into than them then these those some such only over also more most other many much each very just like make made does done where while after before again because'.split(' '));
T.push({
  id: 'repeated-word-finder', cat: CONT, title: 'Repeated Word Finder (Same Word Used Too Close Together)',
  desc: 'Find words that come back within a few words or sentences of each other, ignoring common little words, and mark them in your text.',
  inputs: 1, labels: ['Draft'],
  opts: [{ id: 'win', label: 'Window (words)', type: 'number', def: 40 }, { id: 'min', label: 'Minimum word length', type: 'number', def: 5 }, { id: 'stop', label: 'Ignore common words', type: 'checkbox', def: true }],
  sample: 'The manager asked the team to review the schedule. The team found that the schedule was unclear, so the manager moved the review to Friday. The new schedule was clear to the whole team.',
  run: ([t], o) => {
    const s = need(t), win = Math.floor(num(o.win, 'Window', 2)), min = Math.floor(num(o.min, 'Minimum length', 2));
    const toks = [...s.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)].map((m, k) => ({ w: m[0].toLowerCase(), i: m.index, e: m.index + m[0].length, k }));
    const last = new Map(), flag = new Set(), stat = new Map();
    for (const t2 of toks) {
      if (t2.w.length < min || (o.stop && STOP.has(t2.w))) continue;
      const p = last.get(t2.w);
      if (p && t2.k - p.k <= win) { flag.add(p.k); flag.add(t2.k); const e = stat.get(t2.w) || { pairs: 0, close: Infinity }; e.pairs++; e.close = Math.min(e.close, t2.k - p.k); stat.set(t2.w, e); }
      last.set(t2.w, t2);
    }
    let out = '', p = 0; for (const t2 of toks) if (flag.has(t2.k)) { out += s.slice(p, t2.i) + '⟦' + s.slice(t2.i, t2.e) + '⟧'; p = t2.e; } out += s.slice(p);
    const rows = [...stat].sort((a, b) => b[1].pairs - a[1].pairs).map(([w, e]) => [w, e.pairs + 1 + ' uses', 'closest gap: ' + e.close + ' words']);
    return `${stat.size} word(s) repeated within ${win} words. Marked ⟦like this⟧.\n\n${out}\n\n` + (rows.length ? table(['Word', 'Count in clusters', 'Gap'], rows) : 'Nothing flagged.') + '\n\nA repeat is not always a fault: names, key terms and deliberate echoes are fine. Use a thesaurus only where the repeat reads badly.';
  },
});

// 884
const MINOR_ALL = new Set('a an the and but for nor or so yet as at by in of off on per to up via'.split(' '));
const PREP_LONG = new Set('about above across after against along amid among around before behind below beneath beside besides between beyond despite down during except from inside into like near onto over past since through throughout toward towards under underneath until upon with within without than'.split(' '));
const CONJ_LONG = new Set('although because if once than that though unless until when whenever where whereas whether while'.split(' '));
T.push({
  id: 'headline-capitalizer', cat: CONT, title: 'Headline Capitalizer: AP, APA, Chicago and MLA Title Case',
  desc: 'Capitalize a headline in AP/APA style (lowercase words of three letters or fewer) or Chicago/MLA style (lowercase all short function words), or switch to sentence case.',
  inputs: 1, labels: ['Headlines, one per line'],
  opts: [{ id: 'style', label: 'Style', type: 'select', choices: ['AP / APA (capitalize words of 4+ letters)', 'Chicago / MLA (lowercase all articles, prepositions, conjunctions)', 'Sentence case'], def: 'AP / APA (capitalize words of 4+ letters)' }],
  sample: 'how to write a headline that works: a guide for the busy editor\nwhy the web is going from text to video, and what to do with it',
  run: ([t], o) => {
    const chicago = String(o.style).startsWith('Chicago'), sentence = String(o.style).startsWith('Sentence');
    const cap = (w) => w.replace(/^([^\p{L}\p{N}]*)(\p{L})/u, (m, a, b) => a + b.toUpperCase());
    const fix = (line) => {
      const parts = line.split(/(\s+)/); const idx = parts.map((p, i) => (/\S/.test(p) ? i : -1)).filter((i) => i >= 0);
      let afterColon = true;
      return parts.map((p, i) => {
        if (!/\S/.test(p)) return p;
        const first = i === idx[0], lastW = i === idx[idx.length - 1], core = p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        const wasColon = afterColon; afterColon = /[:?!]$|[\u2014]$/.test(p);
        if (/^https?:|^www\.|@/.test(p)) return p;
        if (core !== core.toLowerCase() && !(core[0] === core[0].toUpperCase() && core.slice(1) === core.slice(1).toLowerCase())) return p; // iPhone, NASA, eBay: keep
        const lw = core.toLowerCase();
        if (sentence) return first || wasColon ? cap(p.toLowerCase()) : p.toLowerCase() === p && /^[a-z]/.test(p) ? p : (core === core.toUpperCase() && core.length > 1 ? p : p.toLowerCase());
        if (p.includes('-') && core.length > 3) return p.split('-').map((q) => cap(q.toLowerCase())).join('-');
        const minor = MINOR_ALL.has(lw) || (chicago && (PREP_LONG.has(lw) || CONJ_LONG.has(lw)));
        if (minor && !first && !lastW && !wasColon) return p.toLowerCase();
        return cap(p.toLowerCase());
      }).join('');
    };
    return lines(need(t, 'a headline')).map(fix).join('\n') + '\n\nHeuristic from the commonly published rules (first and last word always capitalized, first word after a colon capitalized, hyphenated parts capitalized, words with inner capitals like iPhone left alone). Not checked against the current style manuals; verbs like "is" and "be" are capitalized, but a word such as "up" in a phrasal verb ("Look Up") needs a manual look.';
  },
});

// ---------- generators ----------
const PROMPTS = {
  horror: { who: ['a night-shift nurse', 'a retired lighthouse keeper', 'twin sisters', 'a new homeowner', 'a podcast host', 'a long-haul trucker', 'a child with an imaginary friend', 'a village priest'], where: ['an empty hospital wing', 'a farmhouse in a blizzard', 'a motel with no checkout', 'a flooded quarry', 'a town where the clocks stopped', 'an attic that is bigger inside', 'a night train that never stops', 'a forest with no birds'], twist: ['The thing outside is copying the narrator\'s voice.', 'Every photo shows one extra person.', 'The rules on the wall change each night.', 'The house is protecting them from something worse.', 'Only the narrator forgets what happened.', 'The helper they call is the source of the trouble.', 'The sound is coming from inside the walls.', 'They realise they invited it in.'] },
  romance: { who: ['rival bakers', 'a widowed gardener', 'two translators', 'an introvert and a chatty neighbour', 'a runaway bride and a tow-truck driver', 'old friends reunited', 'a chef and a food critic', 'a pilot and an air traffic controller'], where: ['a snowed-in train station', 'a seaside wedding', 'a small-town bookshop', 'a rooftop in the city', 'a vineyard at harvest', 'a stalled lift', 'a festival in the rain', 'a shared office kitchen'], twist: ['One of them is hiding a letter.', 'They must pretend to be a couple for a week.', 'A second chance arrives at the worst moment.', 'They have been writing to each other without knowing.', 'A family feud stands in the way.', 'They meet on the day one of them leaves.', 'A misunderstanding is overheard.', 'The deadline is a lease that ends Friday.'] },
  'science fiction': { who: ['a salvage pilot', 'the last human archivist', 'a clone who finds an old diary', 'a station doctor', 'a translator for an alien envoy', 'a maintenance robot', 'a colony teenager', 'a smuggler with a failing ship'], where: ['a generation ship', 'an orbital farm', 'a moon with no night', 'a city under a dome', 'a derelict relay station', 'a planet of endless tides', 'a ship stuck in a time loop', 'an asteroid mine'], twist: ['The AI has been lying for kindness.', 'The signal they follow comes from their own future.', 'Memory is traded as currency.', 'The ship is not travelling where they think.', 'Sleepers wake one by one with different memories.', 'The aliens have been here all along.', 'Air is rationed by a lottery.', 'The mission was cancelled centuries ago.'] },
  fantasy: { who: ['an apprentice cartographer', 'a dragon\'s accountant', 'an exiled queen', 'a thief who cannot lie', 'a village healer', 'a knight without a sword', 'a bard who sings true', 'a boy who hears stones'], where: ['a floating market', 'the last library', 'a forest that walks', 'a city built in a giant skull', 'a frozen sea', 'a tower with a thousand doors', 'a border town between two kingdoms', 'a desert of glass'], twist: ['The prophecy was mistranslated.', 'Magic costs a memory each time.', 'The villain is the rightful heir.', 'The map redraws itself.', 'A promise made as a child comes due.', 'The sword is afraid of its owner.', 'The gods are on strike.', 'Everyone agrees on a lie.'] },
  mystery: { who: ['a retired detective', 'a hotel night clerk', 'a librarian', 'a forensic accountant', 'a journalist', 'a locksmith', 'a teenage hacker', 'a ferry captain'], where: ['a country house during a storm', 'a small-town regatta', 'an auction house', 'a theatre on opening night', 'a mountain lodge', 'a night market', 'an old observatory', 'a museum after hours'], twist: ['The victim wrote their own obituary.', 'The alibi is too perfect.', 'Everyone confesses to the same crime.', 'The key clue is something missing.', 'The detective knew the victim.', 'The witness is a child who saw only shoes.', 'The crime has not happened yet.', 'The letter was posted after the death.'] },
  drama: { who: ['two estranged brothers', 'a mother and her grown daughter', 'a teacher near retirement', 'a young immigrant cook', 'an old couple selling the family home', 'a caretaker', 'a farmer facing drought', 'a coach after a losing season'], where: ['a hospital waiting room', 'a family kitchen at midnight', 'a funeral reception', 'a school gym', 'an airport gate', 'a shared allotment', 'a late-night diner', 'a court corridor'], twist: ['A secret is told to the wrong person.', 'An inheritance divides the family.', 'An apology arrives thirty years late.', 'A job offer means leaving everyone.', 'A stranger knows too much.', 'The one who left comes back.', 'A recipe holds a hidden message.', 'Silence breaks over a small thing.'] },
  humour: { who: ['a very confident intern', 'a ghost afraid of people', 'a dog who runs the office', 'a wedding planner', 'a town mayor who is a cat', 'a spy with bad memory', 'a vending machine repairer', 'a grandma with a podcast'], where: ['a company retreat', 'a self-checkout aisle', 'a haunted open-plan office', 'a neighbourhood meeting', 'a failing escape room', 'a wedding on a ferry', 'a talent show', 'a very long group chat'], twist: ['Everything is solved by a typo.', 'The rules were a joke that went too far.', 'The wrong person gets the award.', 'The plan involves a lot of ladders.', 'Everyone pretends they understand.', 'The villain is just very polite.', 'A misread email changes everything.', 'The disguise is worse than the problem.'] },
  historical: { who: ['a mapmaker\'s widow', 'a lamp-lighter', 'a courier of the Silk Road', 'a printer\'s apprentice', 'a lighthouse keeper\'s daughter', 'a field nurse', 'a ship\'s cook', 'a monastery scribe'], where: ['a plague-year market', 'a harbour before a voyage', 'a coronation week', 'a railway camp', 'a city under siege', 'a printing house', 'a mountain pass in winter', 'a world\'s fair'], twist: ['A forged document changes a name.', 'They carry a message they cannot read.', 'A small invention is stolen.', 'The enemy shares their language.', 'They are not who the records say.', 'Weather decides the outcome.', 'A promise is kept at great cost.', 'A diary is found a century later.'] },
};
T.push({
  id: 'writing-prompt-generator', cat: FUN, title: 'Writing Prompt Generator by Genre',
  desc: 'Get random creative writing prompts by genre: horror, romance, science fiction, fantasy, mystery, drama, humour or historical.',
  inputs: 0, sample: '',
  opts: [{ id: 'genre', label: 'Genre', type: 'select', choices: ['any', ...Object.keys(PROMPTS)], def: 'any' }, { id: 'n', label: 'How many', type: 'number', def: 5 }, { id: 'seed', label: 'Seed (optional, repeats the same list)', type: 'text', def: '' }],
  run: (_i, o) => {
    const r = rng(o.seed), n = Math.min(50, Math.floor(num(o.n, 'How many', 1))), keys = Object.keys(PROMPTS), out = [];
    for (let i = 0; i < n; i++) { const g = o.genre === 'any' || !PROMPTS[o.genre] ? pick(r, keys) : o.genre, d = PROMPTS[g]; out.push(`${i + 1}. [${g}] Write about ${pick(r, d.who)} in ${pick(r, d.where)}. ${pick(r, d.twist)}`); }
    return out.join('\n');
  },
});

// 891
const PLOT = {
  hero: ['a disgraced detective', 'a shy lighthouse keeper', 'a retired thief', 'an orphaned inventor', 'a celebrity chef', 'a failing farmer', 'a night-bus driver', 'a runaway prince', 'a small-town doctor', 'a stubborn grandmother'],
  trait: ['who cannot say no', 'who is afraid of water', 'who keeps every promise', 'who hides a talent', 'who never forgets a face', 'who is secretly very rich', 'who lies for a living', 'who is losing their memory'],
  where: ['a mountain monastery', 'a floating city', 'a border village', 'a space station', 'a desert train', 'a flooded capital', 'a travelling circus', 'a forgotten island'],
  want: ['find a missing sibling', 'win a rigged contest', 'deliver a package unopened', 'repair an old machine', 'clear a family name', 'stop a wedding', 'escape a debt', 'bring back a river'],
  against: ['a charming rival', 'an unforgiving winter', 'a corrupt official', 'their own past', 'an artificial intelligence', 'a family secret', 'a ticking deadline', 'a rumour that spreads'],
  twist: ['the helper is the cause', 'the goal was never real', 'the enemy needs the same thing', 'the clock is wrong', 'the map is a trap', 'the lost one does not want to be found', 'a promise must be broken', 'the story is being told by someone else'],
  theme: ['trust', 'forgiveness', 'home', 'courage', 'greed', 'memory', 'belonging', 'second chances'],
};
T.push({
  id: 'story-plot-generator', cat: FUN, title: 'Story Plot Generator: Character, Setting, Conflict and Twist',
  desc: 'Combine a random hero, setting, goal, opponent and twist into a short story premise. Press run again for a new one.',
  inputs: 0, sample: '',
  opts: [{ id: 'n', label: 'How many premises', type: 'number', def: 3 }, { id: 'seed', label: 'Seed (optional)', type: 'text', def: '' }],
  run: (_i, o) => {
    const r = rng(o.seed), n = Math.min(30, Math.floor(num(o.n, 'How many', 1)));
    return Array.from({ length: n }, (_, i) => `${i + 1}. ${pick(r, PLOT.hero)} ${pick(r, PLOT.trait)}, in ${pick(r, PLOT.where)}, must ${pick(r, PLOT.want)} while facing ${pick(r, PLOT.against)}. Twist: ${pick(r, PLOT.twist)}. Theme: ${pick(r, PLOT.theme)}.`).join('\n\n');
  },
});

// 892
const NAMES = {
  'English (Victorian)': { m: ['Arthur', 'Edmund', 'Frederick', 'Horace', 'Algernon', 'Cecil', 'Percival', 'Reginald', 'Silas', 'Thaddeus'], f: ['Beatrice', 'Eleanor', 'Florence', 'Harriet', 'Ada', 'Constance', 'Lavinia', 'Winifred', 'Octavia', 'Prudence'], s: ['Ashworth', 'Blackwood', 'Carrow', 'Hartley', 'Pemberton', 'Thorne', 'Whitlock', 'Fairfax', 'Sinclair', 'Crabtree'] },
  'English (medieval)': { m: ['Alaric', 'Godwin', 'Hugh', 'Osric', 'Roger', 'Walter', 'Edwin', 'Piers', 'Gilbert', 'Wystan'], f: ['Aldith', 'Maud', 'Isolde', 'Alys', 'Edith', 'Joan', 'Matilda', 'Emmeline', 'Rohese', 'Sibyl'], s: ['of Ashby', 'Fletcher', 'Miller', 'Thatcher', 'Atwood', 'Cooper', 'Mason', 'Tanner', 'of Kendal', 'Wright'] },
  'Norse': { m: ['Bjorn', 'Erik', 'Gunnar', 'Ivar', 'Leif', 'Ragnar', 'Sigurd', 'Thorin', 'Ulf', 'Halfdan'], f: ['Astrid', 'Freydis', 'Gudrun', 'Helga', 'Ingrid', 'Sigrid', 'Thora', 'Ragnhild', 'Solveig', 'Yrsa'], s: ['Ironside', 'Bjornsson', 'Haraldsdottir', 'Stormborn', 'Wolfsbane', 'Ravensson', 'Eriksdottir', 'Redbeard', 'Skullsplitter', 'Fairhair'] },
  'Spanish': { m: ['Alejandro', 'Carlos', 'Diego', 'Javier', 'Mateo', 'Rafael', 'Santiago', 'Tomas', 'Joaquin', 'Ignacio'], f: ['Carmen', 'Elena', 'Isabel', 'Lucia', 'Marisol', 'Paloma', 'Rosa', 'Valentina', 'Catalina', 'Ines'], s: ['Garcia', 'Fernandez', 'Morales', 'Navarro', 'Ortega', 'Romero', 'Salazar', 'Vargas', 'Delgado', 'Castillo'] },
  'Japanese': { m: ['Haruto', 'Kenji', 'Takeshi', 'Ren', 'Daichi', 'Hiroshi', 'Ryo', 'Satoshi', 'Taro', 'Yuki'], f: ['Akari', 'Hana', 'Kaori', 'Mei', 'Sakura', 'Yui', 'Emi', 'Noriko', 'Rin', 'Haruka'], s: ['Tanaka', 'Sato', 'Watanabe', 'Kobayashi', 'Nakamura', 'Yamamoto', 'Kato', 'Hayashi', 'Mori', 'Fujita'] },
  'Slavic': { m: ['Dmitri', 'Ivan', 'Mikhail', 'Nikolai', 'Pavel', 'Boris', 'Vladimir', 'Anton', 'Stanislav', 'Bogdan'], f: ['Anastasia', 'Katya', 'Natalia', 'Olga', 'Svetlana', 'Tatiana', 'Vera', 'Irina', 'Milena', 'Zora'], s: ['Petrov', 'Volkov', 'Sokolov', 'Orlov', 'Kuznetsov', 'Morozov', 'Novak', 'Kovac', 'Zelenko', 'Lebedev'] },
  'Arabic': { m: ['Omar', 'Khalid', 'Yusuf', 'Idris', 'Tariq', 'Faisal', 'Zayd', 'Karim', 'Rashid', 'Samir'], f: ['Layla', 'Amira', 'Fatima', 'Noor', 'Samira', 'Yasmin', 'Zaynab', 'Huda', 'Leila', 'Salma'], s: ['al-Rashid', 'Haddad', 'Mansour', 'Nasser', 'Qureshi', 'Saleh', 'Farouk', 'Aziz', 'Khoury', 'Bakr'] },
  'Irish': { m: ['Cormac', 'Declan', 'Eoin', 'Finn', 'Liam', 'Niall', 'Oisin', 'Padraig', 'Ronan', 'Tadhg'], f: ['Aoife', 'Brigid', 'Caoimhe', 'Deirdre', 'Maeve', 'Niamh', 'Orla', 'Roisin', 'Saoirse', 'Siobhan'], s: ['O\'Brien', 'Murphy', 'Kelly', 'Doyle', 'Byrne', 'Fitzgerald', 'Gallagher', 'Brennan', 'Quinn', 'MacCarthy'] },
  'Fantasy (invented)': 'syl',
};
const SYL = { a: ['ae', 'al', 'ar', 'el', 'en', 'il', 'ith', 'lor', 'mir', 'ner', 'or', 'riel', 'sil', 'thal', 'vyn', 'wen'], b: ['a', 'an', 'dor', 'driel', 'ion', 'is', 'las', 'ra', 'ros', 'thas', 'wyn', 'ya'] };
T.push({
  id: 'character-name-generator', cat: FUN, title: 'Character Name Generator by Culture and Era',
  desc: 'Generate names for fictional characters from several cultures and eras (Victorian English, Norse, Japanese, Slavic and more) or invented fantasy names.',
  inputs: 0, sample: '',
  opts: [{ id: 'cult', label: 'Style', type: 'select', choices: Object.keys(NAMES), def: 'Norse' }, { id: 'g', label: 'Gender', type: 'select', choices: ['any', 'male', 'female'], def: 'any' }, { id: 'n', label: 'How many', type: 'number', def: 8 }, { id: 'seed', label: 'Seed (optional)', type: 'text', def: '' }],
  run: (_i, o) => {
    const r = rng(o.seed), n = Math.min(100, Math.floor(num(o.n, 'How many', 1))), d = NAMES[o.cult] || NAMES.Norse, out = [];
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    for (let i = 0; i < n; i++) {
      if (d === 'syl') { const f = () => cap(pick(r, SYL.a) + pick(r, SYL.b)); out.push(f() + ' ' + f() + (r() < 0.5 ? 'wyn' : 'thir')); continue; }
      const g = o.g === 'male' ? 'm' : o.g === 'female' ? 'f' : r() < 0.5 ? 'm' : 'f';
      out.push(pick(r, d[g]) + ' ' + pick(r, d.s));
    }
    return out.join('\n') + '\n\nNames are invented combinations of common given names and surnames from each tradition. They are for fiction, not records, and some cultures combine names differently (for example patronymics).';
  },
});

// 895
const dayN = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return NaN; const t = Date.UTC(+m[1], +m[2] - 1, +m[3]); return new Date(t).getUTCMonth() === +m[2] - 1 ? t / 86400000 : NaN; };
const dayS = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
T.push({
  id: 'writing-goal-tracker', cat: 'Time & Productivity', title: 'Writing Goal Tracker: Daily Word Count Streaks from Your Log',
  desc: 'Paste a log of dates and words written, set a daily goal, and see your streak, longest streak, average and the days you hit the goal.',
  inputs: 1, labels: ['Log: one "YYYY-MM-DD words" per line'],
  opts: [{ id: 'goal', label: 'Daily goal (words)', type: 'number', def: 500 }, { id: 'today', label: 'Today (YYYY-MM-DD, blank = last log date)', type: 'text', def: '' }, { id: 'target', label: 'Total project target (0 = none)', type: 'number', def: 0 }],
  sample: '2026-03-01 620\n2026-03-02 410\n2026-03-03 880\n2026-03-04 500\n2026-03-05 530\n2026-03-07 300\n2026-03-08 750\n2026-03-09 520',
  run: ([t], o) => {
    const goal = num(o.goal, 'Goal', 1), log = new Map();
    for (const l of lines(t)) { const m = /^(\S+)[\s,;:]+([\d,]+)/.exec(l); const d = m ? dayN(m[1]) : NaN; if (!m || isNaN(d)) throw new Error('Bad line: "' + l + '". Use YYYY-MM-DD then the word count.'); log.set(d, (log.get(d) || 0) + Number(m[2].replace(/,/g, ''))); }
    if (!log.size) throw new Error('Paste your log first.');
    const first = Math.min(...log.keys()), lastLog = Math.max(...log.keys()), today = String(o.today || '').trim() ? dayN(String(o.today).trim()) : lastLog;
    if (isNaN(today)) throw new Error('Today must look like 2026-03-09.');
    const end = Math.max(today, lastLog), val = (d) => log.get(d) || 0;
    let longest = 0, run = 0; for (let d = first; d <= end; d++) { run = val(d) >= goal ? run + 1 : 0; longest = Math.max(longest, run); }
    let cur = 0, d = val(today) >= goal ? today : today - 1; while (d >= first && val(d) >= goal) { cur++; d--; }
    const total = [...log.values()].reduce((a, b) => a + b, 0), span = end - first + 1, hit = [...Array(span)].filter((_, i) => val(first + i) >= goal).length;
    const rec = [...Array(Math.min(span, 7))].map((_, i) => val(end - i)), avg7 = rec.reduce((a, b) => a + b, 0) / rec.length;
    const rows = [...Array(Math.min(span, 14))].map((_, i) => { const x = end - i; return [dayS(x), val(x), val(x) >= goal ? 'goal met' : val(x) ? (goal - val(x)) + ' short' : 'no entry']; });
    let s = `Goal: ${fmt(goal, 0)} words a day\nCurrent streak: ${cur} day(s)${val(today) < goal ? ' (counts up to yesterday, today is not over)' : ''}\nLongest streak: ${longest} day(s)\nDays goal met: ${hit} of ${span} (${round(100 * hit / span, 0)}%)\nTotal words: ${fmt(total, 0)}\nAverage per day (all days, empty days count as 0): ${fmt(total / span, 0)}\nAverage last 7 days: ${fmt(avg7, 0)}\n`;
    const target = Number(o.target) || 0;
    if (target > 0) s += target <= total ? `Project target reached (${fmt(total, 0)} of ${fmt(target, 0)}).\n` : `Project: ${fmt(total, 0)} of ${fmt(target, 0)} words. At your 7-day average, about ${avg7 > 0 ? Math.ceil((target - total) / avg7) + ' more day(s)' : 'n/a (no recent words)'}.\n`;
    return s + '\nLast days\n' + table(['Date', 'Words', 'Result'], rows) + '\n\nThis page keeps nothing. Copy your log, paste it back next time, or save it in a notes file.';
  },
});

// 896
T.push({
  id: 'writing-sprint-log', cat: 'Time & Productivity', title: 'Writing Sprint Log: Words per Minute from Timed Sprints',
  desc: 'Log your timed writing sprints (minutes and words) and see words per minute for each, your best sprint and a pace for a daily target.',
  inputs: 1, labels: ['Sprints: "minutes words [note]" per line'],
  opts: [{ id: 'target', label: 'Words you want today (0 = skip)', type: 'number', def: 1500 }, { id: 'len', label: 'Sprint length to plan with (minutes)', type: 'number', def: 25 }],
  sample: '25 610 chapter 3 opening\n25 480\n20 505 dialogue pass\n25 390 tired',
  run: ([t], o) => {
    const rows = [], tot = { m: 0, w: 0 };
    lines(t).forEach((l, i) => { const m = /^(\d+(?:\.\d+)?)\s+([\d,]+)\s*(.*)$/.exec(l); if (!m) throw new Error('Line ' + (i + 1) + ' should be "minutes words", for example "25 480".'); const mi = Number(m[1]), w = Number(m[2].replace(/,/g, '')); if (mi <= 0) throw new Error('Line ' + (i + 1) + ': minutes must be above 0.'); rows.push([i + 1, mi, w, round(w / mi, 1), m[3]]); tot.m += mi; tot.w += w; });
    if (!rows.length) throw new Error('Paste at least one sprint.');
    const best = rows.reduce((a, b) => (b[3] > a[3] ? b : a)), wpm = tot.w / tot.m;
    let s = table(['#', 'Minutes', 'Words', 'Words/min', 'Note'], rows) + `\n\nSprints: ${rows.length}   Minutes: ${tot.m}   Words: ${fmt(tot.w, 0)}\nAverage pace: ${round(wpm, 1)} words per minute (${fmt(wpm * 60, 0)} per hour)\nBest sprint: #${best[0]} at ${best[3]} words per minute\n`;
    const target = Number(o.target) || 0, len = Number(o.len) || 25;
    if (target > 0) { const left = Math.max(0, target - tot.w); s += left ? `To reach ${fmt(target, 0)} words you need about ${fmt(left, 0)} more: ${Math.ceil(left / (wpm * len))} more sprint(s) of ${len} minutes at your average pace.\n` : `Target of ${fmt(target, 0)} words reached.\n`; }
    return s + '\nNeed a timer? Use the Pomodoro Timer on this site, then log each sprint here.';
  },
});

// 898 (client-side part)
T.push({
  id: 'doi-link-extractor', cat: CONT, title: 'DOI Extractor and Link Builder (Check DOI Syntax)',
  desc: 'Find DOIs in pasted text or a reference list, clean them up and build doi.org links. Checks the syntax only; it does not look anything up.',
  inputs: 1, labels: ['Text or reference list containing DOIs'],
  opts: [],
  sample: 'Smith J. (2019) Example study. doi:10.1038/nature12373.\nSee https://doi.org/10.1000/xyz123 and also DOI 10.1016/j.cell.2020.01.001, plus a broken one: 10.12/abc.',
  run: ([t]) => {
    const s = need(t), found = new Map();
    for (const m of s.matchAll(/\b10\.\d{4,9}\/[^\s"<>]+/g)) { let d = m[0].replace(/[.,;:)\]}'"]+$/, ''); const k = d.toLowerCase(); if (!found.has(k)) found.set(k, d); }
    const bad = [...s.matchAll(/\b10\.\d{1,3}\/[^\s"<>]+/g)].map((m) => m[0].replace(/[.,;:)\]}'"]+$/, ''));
    if (!found.size && !bad.length) throw new Error('No DOIs found. A DOI looks like 10.1038/nature12373.');
    const ok = /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;
    return `${found.size} unique DOI(s)\n\n` + table(['DOI', 'Link', 'Syntax'], [...found.values()].map((d) => [d, 'https://doi.org/' + d, ok.test(d) ? 'ok' : 'unusual characters, review'])) +
      (bad.length ? '\n\nLooks like a DOI but the registrant part is too short (needs 4 to 9 digits): ' + bad.join(', ') : '') +
      '\n\nDOIs are not case sensitive. This only checks the pattern: whether a DOI exists, and its title and authors, need a lookup that this offline tool does not do. To format a reference by hand, use the Citation Generator.';
  },
});

// 899 (client-side part)
const isbnClean = (s) => s.replace(/[\s-]/g, '').toUpperCase();
const isbn10ok = (s) => /^\d{9}[\dX]$/.test(s) && [...s].reduce((a, c, i) => a + (10 - i) * (c === 'X' ? 10 : +c), 0) % 11 === 0;
const isbn13chk = (s12) => (10 - ([...s12].reduce((a, c, i) => a + +c * (i % 2 ? 3 : 1), 0) % 10)) % 10;
const isbn13ok = (s) => /^\d{13}$/.test(s) && isbn13chk(s.slice(0, 12)) === +s[12];
const to13 = (s10) => { const b = '978' + s10.slice(0, 9); return b + isbn13chk(b); };
const to10 = (s13) => { if (!s13.startsWith('978')) return null; const b = s13.slice(3, 12); const sum = [...b].reduce((a, c, i) => a + (10 - i) * +c, 0); const c = (11 - (sum % 11)) % 11; return b + (c === 10 ? 'X' : c); };
T.push({
  id: 'isbn-validator-converter', cat: CONT, title: 'ISBN Validator and ISBN-10 / ISBN-13 Converter',
  desc: 'Check the check digit of ISBN-10 and ISBN-13 numbers and convert between the two forms. Works offline; it does not look up the book.',
  inputs: 1, labels: ['ISBNs, one per line (hyphens and spaces allowed)'], opts: [],
  sample: '0-306-40615-2\n978-0-306-40615-7\n9780306406158\n0-8044-2957-X\n979-10-90636-07-1',
  run: ([t]) => {
    const rows = lines(need(t, 'ISBNs')).map((l) => {
      const s = isbnClean(l);
      if (s.length === 10) { const ok = isbn10ok(s); return [l, 'ISBN-10', ok ? 'valid' : 'bad check digit or characters', ok ? s : '', ok ? to13(s) : '']; }
      if (s.length === 13) { const ok = isbn13ok(s); return [l, 'ISBN-13', ok ? 'valid' : 'bad check digit or characters', ok ? to10(s) || '(no ISBN-10 form for 979)' : '', ok ? s : '']; }
      return [l, '?', 'not 10 or 13 characters', '', ''];
    });
    return table(['Input', 'Type', 'Result', 'ISBN-10', 'ISBN-13'], rows) + '\n\nOnly the check digit is tested. A valid number may still not be assigned to a book. Hyphen placement needs the registration group ranges published by the ISBN agency, so this tool does not add hyphens.';
  },
});

// 900
const BIAS = {
  masculine: 'aggressive|ambitious|assertive|competitive|decisive|dominant|driven|fearless|forceful|headstrong|independent|ninja|rockstar|rock star|superior|battle|fierce|dominate|outspoken|self-reliant|hard-charging|killer instinct',
  feminine: 'collaborative|committed|compassionate|cooperative|empathetic|interpersonal|loyal|nurturing|supportive|sensitive|warm|understanding|pleasant|polite|gentle|dependable',
};
const GENDERED = { chairman: 'chair, chairperson', salesman: 'salesperson, sales representative', salesmen: 'salespeople', fireman: 'firefighter', policeman: 'police officer', policemen: 'police officers', businessman: 'businessperson, executive', businessmen: 'businesspeople', foreman: 'supervisor, lead', workman: 'worker', workmen: 'workers', manpower: 'workforce, staffing', 'man-hours': 'person-hours, work hours', 'man hours': 'person-hours', mankind: 'humanity, people', 'man-made': 'artificial, manufactured', headmaster: 'head teacher, principal', stewardess: 'flight attendant', waitress: 'server', 'cameraman': 'camera operator', 'repairman': 'repairer, technician', 'craftsman': 'artisan, craftsperson', 'handyman': 'maintenance worker', 'middleman': 'intermediary', 'mailman': 'mail carrier', 'delivery boy': 'courier', 'girl friday': 'assistant', 'he or she': 'they', 'his or her': 'their', 'he/she': 'they', 'guys': 'everyone, team, folks' };
T.push({
  id: 'gender-bias-language-checker', cat: CONT, title: 'Gender-Coded Language Checker for Job Ads',
  desc: 'Flag gendered job titles and words often described as masculine- or feminine-coded in job adverts, with neutral alternatives.',
  inputs: 1, labels: ['Job ad or other text'], opts: [{ id: 'coded', label: 'Also flag gender-coded adjectives (ambitious, supportive...)', type: 'checkbox', def: true }],
  sample: 'We are looking for an aggressive, competitive salesman to join our team of rockstar engineers. The ideal candidate is a strong leader, and he or she must be collaborative and supportive. Great manpower planning skills.',
  run: ([t], o) => {
    const rules = [{ re: new RegExp('(?<![\\p{L}-])(?:' + alt(Object.keys(GENDERED).filter((k) => /[a-z]$/.test(k)).sort((a, b) => b.length - a.length)) + ')(?![\\p{L}-])|he/she', 'giu'), note: 'gendered' }];
    if (o.coded) { rules.push({ re: new RegExp('(?<![\\p{L}-])(?:' + alt(BIAS.masculine.split('|')) + ')(?![\\p{L}-])', 'giu'), note: 'masculine-coded' }); rules.push({ re: new RegExp('(?<![\\p{L}-])(?:' + alt(BIAS.feminine.split('|')) + ')(?![\\p{L}-])', 'giu'), note: 'feminine-coded' }); }
    const s = scan(need(t), rules);
    s.rows = s.rows.map(([w, n, k]) => [w, n, k + (GENDERED[w] ? ': try ' + GENDERED[w] : ': review in context')]);
    return report(s, 'term(s) to review', 'Both lists are short, hand-written and for review only. Research on coded words in job adverts (for example Gaucher, Friesen and Kay, 2011) found they can affect who applies, but the size of the effect varies and these lists are not copied from that study. A word on this list is a prompt to check the wording, not proof of bias. Not legal advice.');
  },
});

// 902
const ACR = `ROI=Return on investment|KPI=Key performance indicator|SLA=Service level agreement|SEO=Search engine optimization|SEM=Search engine marketing|PPC=Pay per click|CPC=Cost per click|CPM=Cost per mille (thousand impressions)|CTR=Click-through rate|CTA=Call to action|CRM=Customer relationship management|B2B=Business to business|B2C=Business to consumer|SaaS=Software as a service|PaaS=Platform as a service|IaaS=Infrastructure as a service|API=Application programming interface|SDK=Software development kit|UI=User interface|UX=User experience|HTML=HyperText Markup Language|CSS=Cascading Style Sheets|JS=JavaScript|JSON=JavaScript Object Notation|XML=Extensible Markup Language|SQL=Structured Query Language|HTTP=HyperText Transfer Protocol|HTTPS=HyperText Transfer Protocol Secure|URL=Uniform Resource Locator|URI=Uniform Resource Identifier|DNS=Domain Name System|TLS=Transport Layer Security|SSL=Secure Sockets Layer|VPN=Virtual private network|CDN=Content delivery network|CMS=Content management system|CI=Continuous integration|CD=Continuous delivery or deployment|QA=Quality assurance|MVP=Minimum viable product|POC=Proof of concept|PoC=Proof of concept|OKR=Objectives and key results|ETA=Estimated time of arrival|ASAP=As soon as possible|FYI=For your information|EOD=End of day|COB=Close of business|OOO=Out of office|WFH=Work from home|PTO=Paid time off|HR=Human resources|CEO=Chief executive officer|CFO=Chief financial officer|CTO=Chief technology officer|COO=Chief operating officer|CMO=Chief marketing officer|VP=Vice president|PM=Project manager / Product manager / Post meridiem|FAQ=Frequently asked questions|TL;DR=Too long; didn't read|TBD=To be determined|TBA=To be announced|N/A=Not applicable|NDA=Non-disclosure agreement|MOU=Memorandum of understanding|RFP=Request for proposal|RFQ=Request for quotation|SOW=Statement of work|P&L=Profit and loss|YOY=Year over year|YoY=Year over year|MOM=Month over month|QOQ=Quarter over quarter|EBITDA=Earnings before interest, taxes, depreciation and amortization|GDP=Gross domestic product|VAT=Value added tax|GST=Goods and services tax|IRS=Internal Revenue Service (US)|SEC=Securities and Exchange Commission (US)|IPO=Initial public offering|M&A=Mergers and acquisitions|LLC=Limited liability company|LTD=Limited|Inc=Incorporated|GDPR=General Data Protection Regulation|CCPA=California Consumer Privacy Act|HIPAA=Health Insurance Portability and Accountability Act (US)|PII=Personally identifiable information|DSAR=Data subject access request|DPO=Data protection officer|WCAG=Web Content Accessibility Guidelines|ARIA=Accessible Rich Internet Applications|A11Y=Accessibility|I18N=Internationalization|L10N=Localization|PDF=Portable Document Format|PNG=Portable Network Graphics|JPEG=Joint Photographic Experts Group|GIF=Graphics Interchange Format|SVG=Scalable Vector Graphics|CPU=Central processing unit|GPU=Graphics processing unit|RAM=Random access memory|ROM=Read-only memory|SSD=Solid-state drive|HDD=Hard disk drive|USB=Universal Serial Bus|LAN=Local area network|WAN=Wide area network|WiFi=Wireless Fidelity (trade name)|IP=Internet Protocol / Intellectual property|IoT=Internet of Things|AI=Artificial intelligence|ML=Machine learning|LLM=Large language model|NLP=Natural language processing|OCR=Optical character recognition|AR=Augmented reality|VR=Virtual reality|FOMO=Fear of missing out|DM=Direct message|UGC=User-generated content|CGI=Computer-generated imagery|IMO=In my opinion|IMHO=In my humble opinion|AFAIK=As far as I know|BTW=By the way|FWIW=For what it's worth|IIRC=If I recall correctly|BRB=Be right back|LOL=Laughing out loud|OMG=Oh my God|TIL=Today I learned|ELI5=Explain like I'm five|AMA=Ask me anything|NSFW=Not safe for work|DIY=Do it yourself|RSVP=Please reply (from French répondez s'il vous plaît)|ID=Identification|PIN=Personal identification number|ATM=Automated teller machine|NASA=National Aeronautics and Space Administration|NATO=North Atlantic Treaty Organization|UN=United Nations|EU=European Union|WHO=World Health Organization|UNESCO=United Nations Educational, Scientific and Cultural Organization|UNICEF=United Nations Children's Fund|FAO=Food and Agriculture Organization|ISO=International Organization for Standardization|W3C=World Wide Web Consortium|IETF=Internet Engineering Task Force|RFC=Request for Comments|GPS=Global Positioning System|ER=Emergency room|ICU=Intensive care unit|CPR=Cardiopulmonary resuscitation|MRI=Magnetic resonance imaging|DNA=Deoxyribonucleic acid|RNA=Ribonucleic acid|BMI=Body mass index|STEM=Science, technology, engineering and mathematics|PhD=Doctor of Philosophy|MBA=Master of Business Administration|GPA=Grade point average|GMAT=Graduate Management Admission Test|SAT=Scholastic Assessment Test|ESL=English as a second language|ASL=American Sign Language|CV=Curriculum vitae|FAQs=Frequently asked questions|EEAT=Experience, expertise, authoritativeness, trustworthiness|E-E-A-T=Experience, expertise, authoritativeness, trustworthiness|SERP=Search engine results page|CRO=Conversion rate optimization|AOV=Average order value|CAC=Customer acquisition cost|LTV=Lifetime value|CLV=Customer lifetime value|ARR=Annual recurring revenue|MRR=Monthly recurring revenue|ARPU=Average revenue per user|DAU=Daily active users|MAU=Monthly active users|NPS=Net Promoter Score|CSAT=Customer satisfaction score|ROAS=Return on ad spend|GA4=Google Analytics 4|GSC=Google Search Console|UTM=Urchin Tracking Module|SMB=Small and medium-sized business|SME=Small and medium-sized enterprise|SME=Subject matter expert`;
const ACRMAP = (() => { const m = new Map(); for (const e of ACR.split('|')) { const i = e.indexOf('='); if (i < 0) continue; const k = e.slice(0, i).toUpperCase().replace(/[^A-Z0-9&/;]/g, ''); (m.get(k) || m.set(k, []).get(k)).push(e.slice(i + 1)); } return m; })();
T.push({
  id: 'acronym-expander', cat: 'Reference', title: 'Acronym and Abbreviation Expander (Business, Tech, SEO, Web)',
  desc: 'Look up what common acronyms like ROI, SLA, KPI, CTA or GDPR stand for, or paste text and expand every acronym found in it.',
  inputs: 1, labels: ['Acronyms or a text containing them'], opts: [],
  sample: 'Our SaaS KPI report shows ROI by CTA, plus SLA and GDPR notes. Also: PPC, SERP, TBD',
  run: ([t]) => {
    const s = need(t), toks = [...new Set(s.match(/[A-Za-z0-9][A-Za-z0-9&/;.-]*[A-Za-z0-9]|[A-Za-z0-9]/g) || [])];
    const rows = []; const miss = [];
    const short = s.trim().split(/\s+/).length <= 12;
    for (const tk of toks) { const key = tk.toUpperCase().replace(/[^A-Z0-9&/;]/g, ''); const hit = ACRMAP.get(key); const upper = /[A-Z]/.test(tk) && tk === tk.toUpperCase() && tk.length >= 2 || /[a-z][A-Z]/.test(tk);
      if (hit && (short || upper)) rows.push([tk, hit.join('  /  ')]); else if (upper && !/^\d+$/.test(tk)) miss.push(tk); }
    if (!rows.length) return 'None of these are in the built-in list (about 250 common acronyms).' + (miss.length ? '\nNot found: ' + miss.join(', ') : '');
    return table(['Acronym', 'Can stand for'], rows) + (miss.length ? '\n\nNot in the list: ' + miss.join(', ') : '') + '\n\nAn acronym often has several meanings; the list shows the ones common in business, web and tech writing. It is offline and limited, so check the context.';
  },
});

// ================= social media =================
// 906
T.push({
  id: 'hashtag-formatter', cat: MKT, title: 'Hashtag Formatter: Words to Clean CamelCase Hashtags',
  desc: 'Turn a list of words or phrases into clean hashtags such as #SmallBusinessTips, with CamelCase that screen readers can pronounce.',
  inputs: 1, labels: ['Phrases, one per line or comma separated'],
  opts: [{ id: 'style', label: 'Style', type: 'select', choices: ['CamelCase (#SmallBusinessTips)', 'lowercase (#smallbusinesstips)'], def: 'CamelCase (#SmallBusinessTips)' }, { id: 'acc', label: 'Remove accents', type: 'checkbox', def: false }, { id: 'sep', label: 'Output', type: 'select', choices: ['one line, spaces', 'one per line'], def: 'one line, spaces' }],
  sample: 'small business tips\nmarketing, café culture\n#already-tagged\n2026 trends\nsmall business tips',
  run: ([t], o) => {
    const seen = new Set(), out = [], warn = [];
    for (const raw of String(t ?? '').split(/[\n,]/)) {
      let p = raw.trim().replace(/^#+/, ''); if (!p) continue;
      if (o.acc) p = p.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const ws = p.split(/[^\p{L}\p{N}]+/u).filter(Boolean); if (!ws.length) continue;
      const tag = '#' + ws.map((w) => (String(o.style).startsWith('Camel') ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase())).join('');
      if (/^#\d+$/.test(tag)) { warn.push(tag + ' is only digits and most platforms do not link it'); continue; }
      if (!seen.has(tag.toLowerCase())) { seen.add(tag.toLowerCase()); out.push(tag); }
    }
    if (!out.length) throw new Error('Type some words first.');
    return (o.sep === 'one per line' ? out.join('\n') : out.join(' ')) + `\n\n${out.length} hashtag(s), ${out.join('').length} characters` + (warn.length ? '\nSkipped: ' + warn.join('; ') : '') + '\nCamelCase is read correctly by screen readers. Hashtags cannot contain spaces or punctuation. Check each platform for its own limit on hashtags.';
  },
});

// 907
const INV = { 'Braille blank (U+2800)': '⠀', 'Zero-width space (U+200B)': '​', 'Word joiner (U+2060)': '⁠' };
T.push({
  id: 'instagram-line-break-formatter', cat: MKT, title: 'Instagram Caption Line Break Formatter',
  desc: 'Keep blank lines and spacing in captions and bios by filling empty lines with an invisible character. Shows the character count.',
  inputs: 1, labels: ['Caption'],
  opts: [{ id: 'ch', label: 'Invisible character', type: 'select', choices: Object.keys(INV), def: 'Braille blank (U+2800)' }, { id: 'lead', label: 'Also protect leading spaces and indents', type: 'checkbox', def: true }],
  sample: 'New menu is live!\n\nTry the lemon tart\nand the cold brew\n\n\nLink in bio\n    Open daily 8 to 6',
  run: ([t], o) => {
    const c = INV[o.ch] || '⠀', s = need(t).replace(/\r\n?/g, '\n');
    const out = s.split('\n').map((l) => { l = l.replace(/[ \t]+$/, ''); if (!l.trim()) return c; return o.lead ? l.replace(/^[ \t]+/, (m) => c + m.replace(/\t/g, '    ')) : l; }).join('\n');
    return out + `\n\n---\n${glen(out)} characters (was ${glen(s)}). Each invisible character counts as one. Instagram has changed how it treats blank lines over time; paste into the app and check the preview. Invisible characters can confuse screen readers and may be stripped by some platforms. Not verified against the current Instagram app.`;
  },
});

// 908
T.push({
  id: 'thread-splitter', cat: MKT, title: 'Thread Splitter: Long Text into Numbered Posts',
  desc: 'Split a long text into numbered posts of a set length for X, Threads or Bluesky, breaking at sentence ends and keeping every post under the limit.',
  inputs: 1, labels: ['Long text'],
  opts: [{ id: 'max', label: 'Limit per post', type: 'number', def: 280 }, { id: 'num', label: 'Numbering', type: 'select', choices: ['1/5 at the end', '(1/5) at the start', 'none'], def: '1/5 at the end' }, { id: 'x', label: 'Count links as 23 and emoji as 2 (X rules)', type: 'checkbox', def: true }],
  sample: 'Most pages fail for a boring reason: nobody can tell what they are for within five seconds. Start with the one question the reader came with. Answer it in the first two lines. Then add detail for those who want it.\n\nSecond, cut the intro. A warm-up paragraph costs you half of your readers. Third, make every heading a promise that the paragraph below keeps. Last, test it on a friend: if they cannot say what the page is for, rewrite it. https://example.com/guide',
  run: ([t], o) => {
    const max = Math.floor(num(o.max, 'Limit', 20)), s = need(t).replace(/\r\n?/g, '\n').trim();
    const len = (x) => (o.x ? xLength(x).weighted : glen(x));
    const mode = String(o.num).startsWith('none') ? 0 : String(o.num).startsWith('(') ? 1 : 2;
    const attempt = (budget) => {
      const units = [];
      for (const para of s.split(/\n{2,}/)) { for (const sen of sentences(para.replace(URL_RE, (u) => u.replace(/\./g, '\u0001')))) units.push({ t: sen.replace(/\u0001/g, '.'), p: false }); if (units.length) units[units.length - 1].p = true; }
      const posts = []; let cur = '', brk = false;
      const flush = () => { if (cur.trim()) posts.push(cur.trim()); cur = ''; };
      for (const u of units) {
        let parts = [u.t];
        if (len(u.t) > budget) { parts = []; let c = ''; for (const w of u.t.split(/\s+/)) { if (len(w) > budget) { if (c) { parts.push(c); c = ''; } let g = graphemes(w); while (g.length) { let k = g.length; while (k > 1 && len(g.slice(0, k).join('')) > budget) k--; parts.push(g.splice(0, k).join('')); } continue; } if (c && len(c + ' ' + w) > budget) { parts.push(c); c = w; } else c = c ? c + ' ' + w : w; } if (c) parts.push(c); }
        for (const p of parts) { const joined = cur ? cur + (brk ? '\n\n' : ' ') + p : p; if (cur && len(joined) > budget) { flush(); cur = p; } else cur = joined; brk = false; }
        if (u.p) brk = true;
      }
      flush(); return posts;
    };
    let posts;
    for (let d = 1; d <= 3; d++) { const suffix = mode ? 1 + d * 2 + 1 + (mode === 1 ? 2 : 0) : 0; posts = attempt(max - suffix); if (String(posts.length).length <= d) break; }
    if (posts.length === 1 && !mode) return posts[0] + '\n\n(fits in one post)';
    const n = posts.length;
    return posts.map((p, i) => (mode === 2 ? `${p} ${i + 1}/${n}` : mode === 1 ? `(${i + 1}/${n}) ${p}` : p)).map((p, i) => `--- Post ${i + 1} (${len(p)}/${max}) ---\n${p}`).join('\n\n') + `\n\n${n} post(s). Posts break at sentence ends; a sentence longer than the limit is split at a word.`;
  },
});

// 909
T.push({
  id: 'engagement-rate-calculator', cat: MKT, title: 'Social Media Engagement Rate Calculator (by Followers, Reach or Views)',
  desc: 'Work out engagement rate from likes, comments, shares and saves, against followers, reach or views, for one post or an average over several.',
  inputs: 0, sample: '',
  opts: [{ id: 'likes', label: 'Likes / reactions', type: 'number', def: 320 }, { id: 'comments', label: 'Comments', type: 'number', def: 24 }, { id: 'shares', label: 'Shares / reposts', type: 'number', def: 15 }, { id: 'saves', label: 'Saves', type: 'number', def: 30 }, { id: 'followers', label: 'Followers', type: 'number', def: 12000 }, { id: 'reach', label: 'Reach (0 = unknown)', type: 'number', def: 6500 }, { id: 'views', label: 'Views / impressions (0 = unknown)', type: 'number', def: 9000 }, { id: 'posts', label: 'Posts these numbers add up over', type: 'number', def: 1 }],
  run: (_i, o) => {
    const v = (k, min = 0) => num(o[k], k, min), eng = v('likes') + v('comments') + v('shares') + v('saves'), f = v('followers'), r = v('reach'), vw = v('views'), n = Math.max(1, Math.floor(v('posts', 1)));
    const rows = [];
    if (f > 0) rows.push(['By followers', fmt(f, 0), round(100 * eng / n / f, 2) + '%']);
    if (r > 0) rows.push(['By reach (ERR)', fmt(r, 0), round(100 * eng / r, 2) + '%']);
    if (vw > 0) rows.push(['By views (ERV)', fmt(vw, 0), round(100 * eng / vw, 2) + '%']);
    if (!rows.length) throw new Error('Enter followers, reach or views above 0.');
    return `Total engagements: ${fmt(eng, 0)} (likes + comments + shares + saves)${n > 1 ? `\nAverage per post: ${fmt(eng / n, 1)} over ${n} posts` : ''}\n\n` + table(['Method', 'Base', 'Rate'], rows) +
      '\n\nFormulas: engagements divided by followers (average per post if several), by reach, or by views, times 100. For reach and views enter the totals for the same posts. Platforms and agencies count "engagements" differently (some skip saves or clicks), so compare only like with like. No benchmark is shown because published averages differ widely by source and year.';
  },
});

// 910
T.push({
  id: 'follower-growth-calculator', cat: MKT, title: 'Follower Growth Rate Calculator with Projection',
  desc: 'Compute follower growth in numbers and percent between two counts, per day and per month, and project future counts at the same pace.',
  inputs: 0, sample: '',
  opts: [{ id: 'start', label: 'Followers at start', type: 'number', def: 8200 }, { id: 'end', label: 'Followers now', type: 'number', def: 9150 }, { id: 'days', label: 'Days between', type: 'number', def: 60 }, { id: 'months', label: 'Project forward (months)', type: 'number', def: 12 }],
  run: (_i, o) => {
    const a = num(o.start, 'Start', 1), b = num(o.end, 'Now', 0), d = num(o.days, 'Days', 1), mo = Math.floor(num(o.months, 'Months', 1)), diff = b - a, pct = 100 * diff / a;
    const mDays = 30.4375, perMonthLin = diff / d * mDays, perMonthCmp = (Math.pow(b / a, mDays / d) - 1);
    const rows = [1, 3, 6, 12, 24, mo].filter((x, i, arr) => x <= Math.max(mo, 1) && arr.indexOf(x) === i).sort((x, y) => x - y).map((m) => [m + ' mo', fmt(a === 0 ? 0 : b + perMonthLin * m, 0), fmt(b * Math.pow(1 + perMonthCmp, m), 0)]);
    return `Change: ${diff >= 0 ? '+' : ''}${fmt(diff, 0)} followers (${diff >= 0 ? '+' : ''}${round(pct, 2)}%) in ${d} days\nPer day: ${round(diff / d, 2)}\nPer month (linear, 30.44 days): ${round(perMonthLin, 0)}\nMonthly growth rate (compound): ${round(100 * perMonthCmp, 2)}%\n\nProjection if the pace holds\n` + table(['After', 'Linear', 'Compound'], rows) +
      '\n\nA projection assumes the recent pace continues, which rarely happens: growth usually follows spikes and slows with size. Treat it as a planning number, not a forecast.';
  },
});

// 911
T.push({
  id: 'influencer-rate-estimator', cat: MKT, title: 'Influencer Sponsored Post Rate Estimator (Editable Rate Card)',
  desc: 'Estimate a fair price for a sponsored post from followers and engagement, using a rate per 1,000 followers that you set yourself.',
  inputs: 0, sample: '',
  opts: [{ id: 'f', label: 'Followers', type: 'number', def: 25000 }, { id: 'er', label: 'Engagement rate (%)', type: 'number', def: 3.2 }, { id: 'base', label: 'Your base rate per 1,000 followers', type: 'number', def: 10 }, { id: 'ref', label: 'Engagement rate that counts as average (%)', type: 'number', def: 2 }, { id: 'fmt', label: 'Format multiplier (1 = single feed post)', type: 'number', def: 1 }, { id: 'usage', label: 'Usage rights add-on (%)', type: 'number', def: 0 }, { id: 'cur', label: 'Currency symbol', type: 'text', def: '€' }],
  run: (_i, o) => {
    const f = num(o.f, 'Followers', 1), er = num(o.er, 'Engagement rate', 0), base = num(o.base, 'Base rate', 0), ref = num(o.ref, 'Average engagement', 0.01), m = num(o.fmt, 'Multiplier', 0), u = num(o.usage, 'Usage', 0), c = String(o.cur || '');
    const adj = Math.min(2, Math.max(0.5, er / ref)), raw = f / 1000 * base, est = raw * adj * m * (1 + u / 100);
    return `Base: ${fmt(f / 1000, 1)} thousand followers x ${c}${fmt(base)} = ${c}${fmt(raw)}\nEngagement adjustment: ${round(adj, 2)}x (your ${er}% against ${ref}% average, kept between 0.5x and 2x)\nFormat multiplier: ${m}x\nUsage rights: +${u}%\n\nEstimate: ${c}${fmt(est, 0)}\nNegotiation band (about -25% to +25%): ${c}${fmt(est * 0.75, 0)} to ${c}${fmt(est * 1.25, 0)}\n\nThe rate per 1,000 followers is a placeholder that YOU must set: there is no single market rate, and any published figure varies by platform, niche, country and year. Use rates you have been paid or quoted. The adjustment and the band are simple rules of thumb, not data.`;
  },
});

// 912
T.push({
  id: 'social-post-planner', cat: MKT, title: 'Social Post Planner: Weekly Calendar and CSV Export',
  desc: 'Paste your planned posts (date, time, platform, text) and get them sorted into a weekly calendar or a CSV, with clashes and bad dates flagged.',
  inputs: 1, labels: ['Posts: "YYYY-MM-DD HH:MM | Platform | Text" per line'],
  opts: [{ id: 'fmt', label: 'Output', type: 'select', choices: ['Weekly calendar (Markdown)', 'CSV'], def: 'Weekly calendar (Markdown)' }],
  sample: '2026-03-03 09:00 | LinkedIn | Launch post for the new guide\n2026-03-02 12:30 | Instagram | Behind the scenes photo\n2026-03-03 09:00 | LinkedIn | Second post at the same time\n2026-03-05 18:00 | X | Thread: 5 tips\n2026-03-10 08:00 | Bluesky | Weekly roundup',
  run: ([t], o) => {
    const posts = [], warn = [];
    lines(need(t, 'your posts')).forEach((l, i) => {
      const p = l.split('|').map((x) => x.trim()), m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(p[0] || '');
      if (!m || isNaN(dayN(m[1])) || p.length < 3) { warn.push(`Line ${i + 1} skipped (needs "YYYY-MM-DD HH:MM | Platform | Text"): ${l}`); return; }
      const hh = m[2] === undefined ? '' : m[2].padStart(2, '0') + ':' + m[3];
      if (hh && (+m[2] > 23 || +m[3] > 59)) { warn.push(`Line ${i + 1} skipped (bad time): ${l}`); return; }
      posts.push({ d: m[1], t: hh, p: p[1], x: p.slice(2).join(' | ') });
    });
    if (!posts.length) throw new Error('No valid posts. Use "2026-03-03 09:00 | LinkedIn | Text".');
    posts.sort((a, b) => a.d.localeCompare(b.d) || a.t.localeCompare(b.t) || a.p.localeCompare(b.p));
    const seen = new Map(); for (const p of posts) { const k = p.d + p.t + p.p.toLowerCase(); if (seen.has(k) && p.t) warn.push(`Clash: two ${p.p} posts at ${p.d} ${p.t}`); seen.set(k, 1); }
    if (String(o.fmt) === 'CSV') { const q = (v) => '"' + String(v).replace(/"/g, '""') + '"'; return ['date,time,platform,text,characters', ...posts.map((p) => [p.d, p.t, q(p.p), q(p.x), glen(p.x)].join(','))].join('\n') + (warn.length ? '\n\n# ' + warn.join('\n# ') : ''); }
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], wk = new Map();
    for (const p of posts) { const n = dayN(p.d), mon = n - ((new Date(n * 86400000).getUTCDay() + 6) % 7); (wk.get(mon) || wk.set(mon, []).get(mon)).push(p); }
    let out = ''; for (const [mon, ps] of wk) { out += `## Week of ${dayS(mon)}\n`; let day = ''; for (const p of ps) { if (p.d !== day) { day = p.d; out += `\n### ${names[new Date(dayN(p.d) * 86400000).getUTCDay()]} ${p.d}\n`; } out += `- ${p.t || '--:--'} ${p.p}: ${p.x}\n`; } out += '\n'; }
    const by = {}; for (const p of posts) by[p.p] = (by[p.p] || 0) + 1;
    return out.trim() + `\n\nTotals: ${posts.length} posts. ` + Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ') + (warn.length ? '\n\nReview:\n- ' + warn.join('\n- ') : '') + '\n\nTimes are written as you give them (no time zone conversion). Weeks start on Monday.';
  },
});

// 917
T.push({
  id: 'social-post-preview', cat: MKT, title: 'Social Post Text Preview (X, LinkedIn, Facebook Style)',
  desc: 'See how a text post reads in a generic X-style, LinkedIn-style or Facebook-style card, with the character count against the limit.',
  inputs: 1, labels: ['Post text'],
  opts: [{ id: 'name', label: 'Display name', type: 'text', def: 'Alex Example' }, { id: 'handle', label: 'Handle or headline', type: 'text', def: '@alexexample' }, { id: 'style', label: 'Card style', type: 'select', choices: ['X-style', 'LinkedIn-style', 'Facebook-style'], def: 'X-style' }, { id: 'dark', label: 'Dark card', type: 'checkbox', def: false }],
  sample: 'Three things I learned shipping a free tools site:\n\n1. Do the boring pages first.\n2. Test with real keyboards.\n3. Write the FAQ before the code.\n\nhttps://example.com #buildinpublic',
  run: ([t], o) => {
    const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const s = need(t), st = String(o.style), lim = st.startsWith('X') ? 280 : st.startsWith('Link') ? 3000 : 63206;
    const used = st.startsWith('X') ? xLength(s).weighted : glen(s);
    const bg = o.dark ? '#16181c' : '#ffffff', fg = o.dark ? '#e7e9ea' : '#0f1419', mu = o.dark ? '#9aa4ad' : '#536471', ln = o.dark ? '#2f3336' : '#cfd9de', link = o.dark ? '#5aaef5' : '#1a5fb4';
    const body = esc(s).replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, `<span class="l">$1</span>`).replace(/(^|\s)([#@][\p{L}\p{N}_]+)/gu, `$1<span class="l">$2</span>`);
    const sub = st.startsWith('X') ? esc(o.handle) : esc(o.handle) + ' · now';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Post preview</title><style>body{margin:16px;font:15px/1.4 system-ui,sans-serif;background:${o.dark ? '#000' : '#eef1f3'}}.c{max-width:${st.startsWith('X') ? 560 : 600}px;margin:auto;background:${bg};color:${fg};border:1px solid ${ln};border-radius:${st.startsWith('X') ? 16 : 8}px;padding:14px}.h{display:flex;gap:10px;align-items:center;margin-bottom:8px}.a{width:44px;height:44px;border-radius:50%;background:${ln};flex:none}.n{font-weight:700}.s{color:${mu};font-size:13px}.t{white-space:pre-wrap;word-wrap:break-word}.l{color:${link}}.f{margin-top:12px;color:${mu};font-size:13px;display:flex;gap:24px}</style></head><body><div class="c"><div class="h"><div class="a" aria-hidden="true"></div><div><div class="n">${esc(o.name)}</div><div class="s">${sub}</div></div></div><div class="t">${body}</div><div class="f"><span>Comment</span><span>${st.startsWith('X') ? 'Repost' : 'Share'}</span><span>${st.startsWith('X') ? 'Like' : 'Like'}</span></div></div><p style="text-align:center;color:${mu};font-size:13px">${used} of ${lim.toLocaleString('en-US')} characters${used > lim ? ' (over the limit)' : ''}. Generic look, not an exact copy of the platform.</p></body></html>`;
    return { html };
  },
});

// 918
const SANS = { b: [0x1D5D4, 0x1D5EE, 0x1D7EC], i: [0x1D608, 0x1D622, null], bi: [0x1D63C, 0x1D656, null] };
const sansMap = (s, k) => [...s].map((c) => { const cp = c.codePointAt(0), [A, a, D] = SANS[k]; if (cp >= 65 && cp <= 90) return String.fromCodePoint(A + cp - 65); if (cp >= 97 && cp <= 122) return String.fromCodePoint(a + cp - 97); if (D && cp >= 48 && cp <= 57) return String.fromCodePoint(D + cp - 48); return c; }).join('');
T.push({
  id: 'linkedin-text-formatter', cat: MKT, title: 'LinkedIn Text Formatter: Bold and Italic with Markers',
  desc: 'Type **bold**, *italic* or ***both*** in your draft and get Unicode bold and italic text you can paste into LinkedIn, with an accessibility warning.',
  inputs: 1, labels: ['Draft with **bold** and *italic* markers'], opts: [],
  sample: '**Big news:** we shipped the *free* toolbox.\n\n***Three lessons:***\n1. Start small\n2. Test early\n3. Ship',
  run: ([t]) => {
    const s = need(t);
    const out = s.replace(/\*\*\*(.+?)\*\*\*/gs, (_, x) => sansMap(x, 'bi')).replace(/\*\*(.+?)\*\*/gs, (_, x) => sansMap(x, 'b')).replace(/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])/gs, (_, x) => sansMap(x, 'i'));
    return out + '\n\n---\nThese are special Unicode letters, not real formatting. Screen readers may read them letter by letter or skip them, search cannot find them, and some fonts show boxes. Use sparingly for a word or two, never for whole posts, and never for key information. Digits are bold only in **bold**; accented letters are left unchanged. Pairs of * are needed.';
  },
});

// 920
const enc = encodeURIComponent;
T.push({
  id: 'social-share-link-generator', cat: MKT, title: 'Social Share Link Generator (X, LinkedIn, Facebook, WhatsApp, Reddit, Bluesky)',
  desc: 'Build "share this page" links for X, LinkedIn, Facebook, WhatsApp, Reddit, Bluesky, Telegram and email from a URL and a title.',
  inputs: 2, labels: ['Page URL', 'Title or message (optional)'],
  opts: [{ id: 'tags', label: 'Hashtags for X, comma separated (no #)', type: 'text', def: '' }, { id: 'via', label: 'X handle to credit (no @)', type: 'text', def: '' }, { id: 'html', label: 'Also output HTML links', type: 'checkbox', def: false }],
  sample: 'https://example.com/guides/alt-text?ref=share', sample2: 'How to write alt text that helps',
  run: ([u, ti], o) => {
    const url = String(u || '').trim(); if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(url)) throw new Error('Enter a full page URL starting with http:// or https://.');
    const title = String(ti || '').trim(), msg = (title ? title + ' ' : '') + url;
    const tags = String(o.tags || '').split(/[,\s]+/).map((x) => x.replace(/^#/, '')).filter(Boolean).join(',');
    const L = [
      ['X', `https://twitter.com/intent/tweet?url=${enc(url)}${title ? '&text=' + enc(title) : ''}${tags ? '&hashtags=' + enc(tags) : ''}${o.via ? '&via=' + enc(String(o.via).replace(/^@/, '')) : ''}`],
      ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`],
      ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
      ['WhatsApp', `https://wa.me/?text=${enc(msg)}`],
      ['Reddit', `https://www.reddit.com/submit?url=${enc(url)}${title ? '&title=' + enc(title) : ''}`],
      ['Bluesky', `https://bsky.app/intent/compose?text=${enc(msg)}`],
      ['Telegram', `https://t.me/share/url?url=${enc(url)}${title ? '&text=' + enc(title) : ''}`],
      ['Email', `mailto:?subject=${enc(title || url)}&body=${enc(msg)}`],
    ];
    const names = { X: 'Share on X', LinkedIn: 'Share on LinkedIn', Facebook: 'Share on Facebook', WhatsApp: 'Share on WhatsApp', Reddit: 'Share on Reddit', Bluesky: 'Share on Bluesky', Telegram: 'Share on Telegram', Email: 'Share by email' };
    const esc = (x) => x.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return L.map(([n, l]) => `${n}\n${l}`).join('\n\n') + (o.html ? '\n\nHTML\n' + L.map(([n, l]) => `<a href="${esc(l)}" target="_blank" rel="noopener noreferrer">${names[n]}</a>`).join('\n') : '') +
      '\n\nThese are the public share URL formats as commonly used. Platforms change or retire them without notice, and none of them were opened or tested by this offline tool, so click each one once before you publish. Plain links with rel="noopener" load no third-party script, which is better for privacy than official share buttons.';
  },
});

// 921
T.push({
  id: 'whatsapp-link-generator', cat: MKT, title: 'WhatsApp Click-to-Chat Link Generator (wa.me)',
  desc: 'Create wa.me links with a prefilled message from phone numbers in international format. Cleans spaces, plus signs and dashes.',
  inputs: 2, labels: ['Phone numbers with country code, one per line', 'Prefilled message (optional)'], opts: [{ id: 'html', label: 'Also output an HTML link', type: 'checkbox', def: false }],
  sample: '+31 6 1234 5678\n+44 (0)7700 900123\n0612345678', sample2: 'Hi! I saw your site and have a question.',
  run: ([p, m], o) => {
    const msg = String(m || '').trim(), out = [];
    for (const l of lines(need(p, 'a phone number'))) {
      let d = l.replace(/[^\d]/g, ''); const notes = [];
      if (l.trim().startsWith('00')) d = d.replace(/^00/, '');
      if (/\(\s*0\s*\)/.test(l)) { d = l.replace(/\(\s*0\s*\)/, '').replace(/[^\d]/g, ''); notes.push('removed the (0) trunk digit'); }
      if (!l.trim().startsWith('+') && !l.trim().startsWith('00')) notes.push('no + or 00 prefix: make sure the country code is included');
      if (d.length < 8 || d.length > 15) notes.push('length ' + d.length + ' is unusual (international numbers have at most 15 digits)');
      const link = `https://wa.me/${d}${msg ? '?text=' + enc(msg) : ''}`;
      out.push(`${l}\n${link}${notes.length ? '\n  Review: ' + notes.join('; ') : ''}${o.html ? `\n  <a href="${link.replace(/&/g, '&amp;')}" rel="noopener noreferrer">Chat on WhatsApp</a>` : ''}`);
    }
    return out.join('\n\n') + '\n\nFormat: https://wa.me/<number>?text=<message>, with the number in full international format, digits only (no +, brackets, dashes or leading zeros). Format as commonly documented; not opened or tested here.';
  },
});

// 924 / 925
const earn = (views, lo, hi) => `${fmt(views * lo / 1000, 0)} to ${fmt(views * hi / 1000, 0)}`;
T.push({
  id: 'youtube-earnings-estimator', cat: CALC, title: 'YouTube Earnings Estimator from Views and RPM',
  desc: 'Estimate monthly and yearly YouTube ad revenue from views and an RPM range you enter from your own YouTube Studio.',
  inputs: 0, sample: '',
  opts: [{ id: 'views', label: 'Monthly views', type: 'number', def: 250000 }, { id: 'lo', label: 'RPM low (per 1,000 views)', type: 'number', def: 2 }, { id: 'hi', label: 'RPM high (per 1,000 views)', type: 'number', def: 6 }, { id: 'share', label: 'Share kept by you after other deductions (%)', type: 'number', def: 100 }, { id: 'cur', label: 'Currency symbol', type: 'text', def: '$' }],
  run: (_i, o) => {
    const v = num(o.views, 'Views', 0), lo = num(o.lo, 'RPM low', 0), hi = num(o.hi, 'RPM high', 0), sh = num(o.share, 'Share', 0) / 100, c = String(o.cur || '');
    if (hi < lo) throw new Error('RPM high must not be below RPM low.');
    const mid = (lo + hi) / 2, row = (n, r) => [n, c + fmt(r, 2), c + fmt(v * r / 1000 * sh, 0), c + fmt(v * r / 1000 * sh * 12, 0)];
    return table(['Case', 'RPM', 'Per month', 'Per year'], [row('Low', lo), row('Middle', mid), row('High', hi)]) + `\n\nFormula: views / 1,000 x RPM. RPM is revenue per 1,000 views of all your views, after YouTube's share; CPM is per 1,000 ad impressions and is higher. Read your own RPM in YouTube Studio analytics. The defaults are placeholders, not typical values: RPM varies by niche, country, season and video length. Sponsorships, memberships and Shorts are not included.`;
  },
});
T.push({
  id: 'tiktok-money-calculator', cat: CALC, title: 'TikTok Earnings Calculator: Creator Rewards and Brand Deals',
  desc: 'Estimate monthly income from average views, posting rate and a payout per 1,000 views you enter, plus a brand deal price from followers.',
  inputs: 0, sample: '',
  opts: [{ id: 'views', label: 'Average views per video', type: 'number', def: 40000 }, { id: 'vids', label: 'Videos per month', type: 'number', def: 16 }, { id: 'rpm', label: 'Payout per 1,000 qualified views', type: 'number', def: 0.5 }, { id: 'qual', label: 'Share of views that qualify (%)', type: 'number', def: 60 }, { id: 'f', label: 'Followers', type: 'number', def: 80000 }, { id: 'rate', label: 'Brand deal rate per 1,000 followers', type: 'number', def: 8 }, { id: 'deals', label: 'Brand deals per month', type: 'number', def: 1 }, { id: 'cur', label: 'Currency symbol', type: 'text', def: '$' }],
  run: (_i, o) => {
    const v = num(o.views, 'Views', 0), n = num(o.vids, 'Videos', 0), rpm = num(o.rpm, 'Payout', 0), q = num(o.qual, 'Qualifying share', 0) / 100, f = num(o.f, 'Followers', 0), r = num(o.rate, 'Brand rate', 0), d = num(o.deals, 'Deals', 0), c = String(o.cur || '');
    const fund = v * n * q * rpm / 1000, deal = f / 1000 * r;
    return `Total views per month: ${fmt(v * n, 0)}\nQualifying views: ${fmt(v * n * q, 0)}\nViews-based payout per month: ${c}${fmt(fund, 0)}\nOne brand deal: ${c}${fmt(deal, 0)}  x ${d} per month = ${c}${fmt(deal * d, 0)}\n\nEstimated income per month: ${c}${fmt(fund + deal * d, 0)}   per year: ${c}${fmt((fund + deal * d) * 12, 0)}\n\nEvery rate above is an assumption that you set. Payout programs differ by country and change their rules, eligibility and rates, and brand rates depend on niche and audience. Check your own dashboard and contracts. Tips, gifts and shop sales are not included.`;
  },
});

// 926
T.push({
  id: 'social-media-roi-calculator', cat: CALC, title: 'Social Media ROI Calculator: ROAS, Cost per Result and Break-Even',
  desc: 'Work out the return on social ad spend, including tool and labour costs: ROI, ROAS, cost per click, cost per conversion and break-even revenue.',
  inputs: 0, sample: '',
  opts: [{ id: 'ad', label: 'Ad spend', type: 'number', def: 2000 }, { id: 'tool', label: 'Tool and software costs', type: 'number', def: 150 }, { id: 'hours', label: 'Hours of work', type: 'number', def: 20 }, { id: 'hr', label: 'Hourly rate', type: 'number', def: 40 }, { id: 'other', label: 'Other costs (creative, fees)', type: 'number', def: 300 }, { id: 'rev', label: 'Revenue from the campaign', type: 'number', def: 5200 }, { id: 'conv', label: 'Conversions (0 = unknown)', type: 'number', def: 65 }, { id: 'clicks', label: 'Clicks (0 = unknown)', type: 'number', def: 1800 }, { id: 'cm', label: 'Profit margin on revenue (%) (100 = revenue is profit)', type: 'number', def: 100 }],
  run: (_i, o) => {
    const g = (k) => num(o[k], k, 0), ad = g('ad'), cost = ad + g('tool') + g('hours') * g('hr') + g('other'), rev = g('rev'), conv = g('conv'), clicks = g('clicks'), m = g('cm') / 100;
    if (cost <= 0) throw new Error('Enter at least one cost.');
    const profit = rev * m - cost, l = [`Total cost: ${fmt(cost)} (ad spend ${fmt(ad)}, tools ${fmt(g('tool'))}, labour ${fmt(g('hours') * g('hr'))}, other ${fmt(g('other'))})`, `Revenue: ${fmt(rev)}${m < 1 ? `, profit before these costs: ${fmt(rev * m)}` : ''}`, `Net result: ${profit >= 0 ? '+' : ''}${fmt(profit)}`, `ROI (full cost): ${round(100 * profit / cost, 1)}%`];
    if (ad > 0) l.push(`ROAS (revenue / ad spend): ${round(rev / ad, 2)}x`);
    if (conv > 0) l.push(`Cost per conversion: ${fmt(cost / conv)} (ad spend only: ${fmt(ad / conv)})`);
    if (clicks > 0) l.push(`Cost per click (ad spend): ${fmt(ad / clicks, 3)}`);
    if (clicks > 0 && conv > 0) l.push(`Click to conversion rate: ${round(100 * conv / clicks, 2)}%`);
    if (m > 0) l.push(`Break-even revenue: ${fmt(cost / m)}`);
    return l.join('\n') + '\n\nROI here counts all costs including your time. ROAS ignores everything but ad spend. Revenue attribution (what the campaign really caused) is the hard part and is up to you.';
  },
});

// 927
T.push({
  id: 'content-pillar-planner', cat: MKT, title: 'Content Pillar Planner: Check Your Post Mix Against Target Ratios',
  desc: 'Define content pillars with target percentages, paste your planned posts and see the gap per pillar and how many posts to add to hit the mix.',
  inputs: 2, labels: ['Pillars: "Name | target %" per line', 'Planned posts: "Pillar | Title" per line'],
  opts: [{ id: 'total', label: 'Total posts you want in the plan (0 = as planned)', type: 'number', def: 20 }],
  sample: 'Education | 40\nBehind the scenes | 20\nProduct | 25\nCommunity | 15', sample2: 'Education | 5 SEO myths\nEducation | How to read a SERP\nProduct | Feature drop\nProduct | Pricing update\nProduct | New integration\nProduct | Customer story\nCommunity | Q&A\nMemes | Friday joke',
  run: ([p, q], o) => {
    const pil = lines(need(p, 'your pillars')).map((l) => { const m = /^(.*?)\s*[|:,]\s*([\d.]+)\s*%?$/.exec(l); if (!m) throw new Error('Pillar line should look like "Education | 40": ' + l); return { n: m[1].trim(), t: Number(m[2]), c: 0 }; });
    const sum = pil.reduce((a, b) => a + b.t, 0), unk = new Map(); if (sum <= 0) throw new Error('Targets must add up to more than 0.');
    let total = 0;
    for (const l of lines(q)) { const nm = l.split('|')[0].trim(); const pp = pil.find((x) => x.n.toLowerCase() === nm.toLowerCase()); total++; if (pp) pp.c++; else unk.set(nm, (unk.get(nm) || 0) + 1); }
    const want = Math.max(total, Math.floor(Number(o.total) || 0)), lines2 = [];
    const rows = pil.map((x) => { const tp = 100 * x.t / sum, ap = total ? 100 * x.c / total : 0, tgt = Math.round(tp / 100 * want), add = Math.max(0, tgt - x.c); return [x.n, x.c, round(ap, 0) + '%', round(tp, 0) + '%', (ap - tp >= 0 ? '+' : '') + round(ap - tp, 0) + ' pts', add ? 'add ' + add : x.c > tgt ? 'over by ' + (x.c - tgt) : 'ok']; });
    if (Math.abs(sum - 100) > 0.01) lines2.push(`Targets add up to ${sum}%, so they were scaled to 100%.`);
    if (unk.size) lines2.push('Posts with a pillar that is not in your list: ' + [...unk].map(([k, v]) => `${k} (${v})`).join(', '));
    return `${total} planned post(s), plan size ${want}\n\n` + table(['Pillar', 'Posts', 'Actual', 'Target', 'Gap', `For ${want} posts`], rows) + (lines2.length ? '\n\n' + lines2.join('\n') : '') + '\n\nTargets are rounded to whole posts, so totals can be off by one.';
  },
});

// 929
const IMG = [
  ['YouTube', 'Video thumbnail', 3840, 2160, 'min width 640; 50 MB desktop, 2 MB on mobile', 'checked at YouTube Help, 2026-10'],
  ['YouTube', 'Shorts thumbnail', 2160, 3840, 'min height 640', 'checked at YouTube Help, 2026-10'],
  ['Instagram', 'Feed portrait (4:5)', 1080, 1350, '', 'commonly quoted, not checked'],
  ['Instagram', 'Feed square (1:1)', 1080, 1080, '', 'commonly quoted, not checked'],
  ['Instagram', 'Story / Reel (9:16)', 1080, 1920, '', 'commonly quoted, not checked'],
  ['Facebook', 'Link preview image', 1200, 630, 'Open Graph recommendation', 'commonly quoted, not checked'],
  ['Facebook', 'Story (9:16)', 1080, 1920, '', 'commonly quoted, not checked'],
  ['LinkedIn', 'Link preview image', 1200, 627, '', 'commonly quoted, not checked'],
  ['LinkedIn', 'Personal profile banner', 1584, 396, '', 'commonly quoted, not checked'],
  ['X', 'Large summary card (2:1)', 1200, 600, 'many guides give min 300x157, max 4096x4096', 'commonly quoted, not checked'],
  ['X', 'In-stream photo (16:9)', 1600, 900, '', 'commonly quoted, not checked'],
  ['Pinterest', 'Standard pin (2:3)', 1000, 1500, '', 'commonly quoted, not checked'],
  ['TikTok', 'Video (9:16)', 1080, 1920, '', 'commonly quoted, not checked'],
  ['Open Graph', 'Generic share image', 1200, 630, 'works on most networks', 'widespread convention'],
];
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
T.push({
  id: 'social-image-size-reference', cat: MKT, title: 'Social Media Image Size Reference (Instagram, Facebook, LinkedIn, X, YouTube)',
  desc: 'Look up recommended image sizes and aspect ratios per platform and format, or type your image size (like 1200x630) to see which formats it suits.',
  inputs: 1, labels: ['Platform name, or your image size like 1200x630 (empty = all)'], opts: [],
  sample: '',
  run: ([q]) => {
    const s = String(q || '').trim().toLowerCase(), m = /^(\d{2,5})\s*[x×*]\s*(\d{2,5})$/.exec(s);
    let list = IMG, head = '';
    if (m) {
      const w = +m[1], h = +m[2], r = w / h, g = gcd(w, h);
      list = IMG.filter(([, , a, b]) => Math.abs(a / b - r) / r < 0.03);
      head = `Your image: ${w} x ${h}, ratio ${w / g}:${h / g} (${round(r, 3)})\n` + (list.length ? 'Formats with the same shape (within 3%). Scale to at least the size shown:\n\n' : 'No listed format has this shape. Crop to one of the ratios below.\n\n');
      if (!list.length) list = IMG;
    } else if (s) { list = IMG.filter((x) => x.slice(0, 2).join(' ').toLowerCase().includes(s)); if (!list.length) throw new Error('No platform matches "' + q + '". Try Instagram, Facebook, LinkedIn, X, YouTube, Pinterest or TikTok.'); }
    return head + table(['Platform', 'Format', 'Pixels', 'Ratio', 'Notes', 'Source status'], list.map(([p, f, w, h, n, v]) => { const g = gcd(w, h); return [p, f, `${w} x ${h}`, `${w / g}:${h / g}`, n, v]; })) +
      '\n\nSizes change as platforms redesign. Only the YouTube rows were checked at the source; the others are widely quoted values that were not verified, so confirm in the platform before you design to them. For link preview images in HTML, the Social Image Size Checker on this site tests your file.';
  },
});

// 930
const CLICK = 'you won\'t believe|you wont believe|shocking|this one trick|what happens next|will blow your mind|mind-blowing|jaw-dropping|number \\d+ will|doctors hate|gone wrong|goes viral|must see|must watch|can\'t stop|unbelievable|insane|epic fail|life-changing|game-changing|this is why|you need to see|breaking:|just in:|wait for it|you\'ll never guess';
T.push({
  id: 'reddit-title-checker', cat: MKT, title: 'Reddit Post Title Checker: Length and Clickbait Review',
  desc: 'Check post titles for length against the 300 character limit and review all-caps words, extra punctuation, emoji and clickbait phrases.',
  inputs: 1, labels: ['Post titles, one per line'], opts: [{ id: 'max', label: 'Length limit', type: 'number', def: 300 }],
  sample: 'YOU WON\'T BELIEVE what my dog did!!!\nI built a free tool to check robots.txt files (open source)\nQuestion about sitemaps: do I need one for 20 pages?',
  run: ([t], o) => {
    const max = num(o.max, 'Limit', 1), out = [];
    for (const l of lines(need(t, 'a title'))) {
      const f = [], n = glen(l);
      if (n > max) f.push(`over the ${max} character limit by ${n - max}`);
      else if (n < 15) f.push('very short; say what the post is about');
      const caps = (l.match(/\b[A-Z]{4,}\b/g) || []).filter((w) => !/^(HTTP|HTTPS|HTML|CSS|JSON|ROBOTS|NASA|SEO|API|XML|SQL|HTTPS?)$/.test(w));
      if (caps.length) f.push('all-caps word(s): ' + caps.join(', '));
      if (/[!?]{2,}/.test(l) || /\.{4,}/.test(l)) f.push('repeated punctuation');
      const em = (l.match(/\p{Extended_Pictographic}/gu) || []).length; if (em > 2) f.push(em + ' emoji');
      const cb = l.match(new RegExp('(?:' + CLICK + ')', 'i')); if (cb) f.push('clickbait phrase: "' + cb[0] + '"');
      if (/https?:\/\//i.test(l)) f.push('contains a link; many communities dislike that in titles');
      if (/[A-Z]/.test(l) && l === l.toUpperCase() && /[A-Z]{5}/.test(l)) f.push('whole title is upper case');
      out.push(`${n}/${max}  ${l}\n   ` + (f.length ? 'Review: ' + f.join('; ') : 'nothing flagged'));
    }
    return out.join('\n\n') + '\n\nThe 300 character limit is the commonly quoted figure and was not verified at the source. Each subreddit has its own title rules (tags, formats, banned phrases); read them first. The checks are patterns, so treat them as prompts to reread, not as rejections.';
  },
});

// 931 (client-side part)
T.push({
  id: 'fediverse-handle-validator', cat: MKT, title: 'Fediverse Handle Validator and WebFinger URL Builder (Mastodon)',
  desc: 'Check that a Mastodon or fediverse handle like @user@example.social is well formed, normalise it, and build its profile and WebFinger URLs without looking anything up.',
  inputs: 1, labels: ['Handles or profile URLs, one per line'], opts: [],
  sample: '@Gargron@mastodon.social\nalice@example.social\nhttps://fosstodon.org/@bob\n@bad name@example.com\n@carol@localhost',
  run: ([t]) => {
    const rows = [];
    for (const l of lines(need(t, 'a handle'))) {
      let user = '', host = '', notes = [];
      const u = /^https?:\/\/([^/\s]+)\/@([^/\s?#]+)\/?$/i.exec(l);
      if (u) { host = u[1]; user = u[2]; } else { const m = /^@?([^@\s]+)@([^@\s]+)$/.exec(l); if (m) { user = m[1]; host = m[2]; } else { rows.push([l, 'invalid', 'Use @user@domain or https://domain/@user', '']); continue; } }
      if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(user) || user.length > 64) notes.push('username should use letters, numbers, underscore, dot or hyphen only');
      let asc = host.toLowerCase(); try { asc = new URL('https://' + host.toLowerCase()).hostname; } catch { notes.push('domain is not valid'); }
      if (!asc.includes('.') ) notes.push('domain has no dot (local names are not federated)');
      if (/^\d+\.\d+\.\d+\.\d+$/.test(asc)) notes.push('IP address instead of domain name');
      if (notes.length) { rows.push([l, 'invalid', notes.join('; '), '']); continue; }
      rows.push([l, 'well formed', `@${user}@${asc}`, `https://${asc}/@${user}\nhttps://${asc}/.well-known/webfinger?resource=acct:${enc(user + '@' + asc).replace('%40', '@')}`]);
    }
    return rows.map((r) => `${r[0]}\n  ${r[1]}: ${r[2]}${r[3] ? '\n  ' + r[3].replace('\n', '\n  ') : ''}`).join('\n\n') + '\n\nOnly the form is checked. Nothing is contacted, so this cannot tell you that the account or server exists: the WebFinger URL is for you to open in a browser. Usernames are case-insensitive on most servers; the profile URL pattern /@user is the Mastodon style and other software may differ.';
  },
});

export default T;

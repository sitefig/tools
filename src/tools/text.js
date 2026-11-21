// Text, Markdown, Text Fun and Reference tools. Pure client-side, zero dependencies.
// Skipped on purpose (need a server, network or ML model): AI paraphraser/rewriter, translator, OCR,
// cloud speech-to-text, grammar/spell checkers with big dictionaries, text-to-emoji, random-text-picker,
// binary-art. pomodoro and regex tools belong to other modules.
// Heuristic tools (language-detector, sentiment-lexicon) carry a `ponytail:` note with their ceiling.

const tools = [];
export default tools;

// ---------- shared helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lines = (s) => String(s).split(/\r\n|\r|\n/);
const graphemes = (s) => (typeof Intl !== 'undefined' && Intl.Segmenter
  ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment) : Array.from(s));
const need = (s, msg = 'Enter some text.') => { if (!String(s).trim()) throw new Error(msg); };
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu;
const wordsOf = (s) => s.match(WORD_RE) || [];
const sentencesOf = (s) => s.split(/(?<=[.!?…]+["')\]]*)\s+/u).map((x) => x.trim()).filter((x) => /[\p{L}\p{N}]/u.test(x));
const paragraphsOf = (s) => s.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
const mmss = (min) => { const sec = Math.round(min * 60); return sec < 60 ? `${sec} sec` : `${Math.floor(sec / 60)} min ${sec % 60} sec`; };
const pct = (n, d) => (d ? (100 * n / d).toFixed(1) + '%' : '0%');
const SAMPLE = 'The quick brown fox jumps over the lazy dog. It was the best of times, it was the worst of times!\n\nIs this the real life? Is this just fantasy? The dog barked; the fox did not care.';

// ---------- diff ----------
function diffSeq(a, b, key = (x) => x) {
  const A = a.map(key), B = b.map(key);
  let s = 0;
  while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length, eb = B.length;
  while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  const n = ea - s, m = eb - s;
  if (n * m > 1.2e7) throw new Error('Inputs are too large to diff in the browser.');
  const w = m + 1, L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    L[i * w + j] = A[s + i] === B[s + j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
  }
  const ops = [];
  for (let i = 0; i < s; i++) ops.push({ t: ' ', a: a[i], b: b[i] });
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[s + i] === B[s + j]) { ops.push({ t: ' ', a: a[s + i], b: b[s + j] }); i++; j++; }
    else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) ops.push({ t: '-', a: a[s + i++] });
    else ops.push({ t: '+', b: b[s + j++] });
  }
  while (i < n) ops.push({ t: '-', a: a[s + i++] });
  while (j < m) ops.push({ t: '+', b: b[s + j++] });
  for (let k = ea; k < a.length; k++) ops.push({ t: ' ', a: a[k], b: b[eb + k - ea] });
  return ops;
}
const diffKey = (o) => (x) => { if (o.ignoreWs) x = x.replace(/\s+/g, ' ').trim(); if (o.ignoreCase) x = x.toLowerCase(); return x; };

function unified(ops, ctx) {
  let oa = 1, ob = 1;
  for (const o of ops) { o.oa = oa; o.ob = ob; if (o.t !== '+') oa++; if (o.t !== '-') ob++; }
  const ch = [];
  ops.forEach((o, i) => { if (o.t !== ' ') ch.push(i); });
  if (!ch.length) return null;
  const rs = [];
  for (const i of ch) {
    const lo = ctx < 0 ? 0 : Math.max(0, i - ctx), hi = ctx < 0 ? ops.length - 1 : Math.min(ops.length - 1, i + ctx);
    if (rs.length && lo <= rs.at(-1)[1] + 1) rs.at(-1)[1] = Math.max(rs.at(-1)[1], hi); else rs.push([lo, hi]);
  }
  return rs.map(([lo, hi]) => {
    const seg = ops.slice(lo, hi + 1);
    const oc = seg.filter((o) => o.t !== '+').length, nc = seg.filter((o) => o.t !== '-').length;
    return `@@ -${oc ? seg[0].oa : seg[0].oa - 1},${oc} +${nc ? seg[0].ob : seg[0].ob - 1},${nc} @@\n` +
      seg.map((o) => o.t + (o.t === '+' ? o.b : o.a)).join('\n');
  }).join('\n');
}

tools.push({
  id: 'text-diff', cat: 'Text', title: 'Text Diff', desc: 'Compare two texts line by line or word by word, unified-style output.',
  inputs: 2, labels: ['Original', 'Changed'],
  opts: [
    { id: 'mode', label: 'Mode', type: 'select', choices: ['line', 'word'], def: 'line' },
    { id: 'ctx', label: 'Context lines (-1 = all)', type: 'number', def: 3 },
    { id: 'ignoreCase', label: 'Ignore case', type: 'checkbox', def: false },
    { id: 'ignoreWs', label: 'Ignore whitespace', type: 'checkbox', def: false },
  ],
  sample: 'apple\nbanana\ncherry\ndate\nelderberry\nfig\ngrape',
  sample2: 'apple\nblueberry\ncherry\ndate\nelderberry\nfig\ngrape\nhoneydew',
  run: ([a, b], o) => {
    const key = diffKey(o);
    if (o.mode === 'word') {
      const ops = diffSeq(a.split(/(\s+)/).filter((x) => x !== ''), b.split(/(\s+)/).filter((x) => x !== ''), key);
      if (ops.every((x) => x.t === ' ')) return 'No differences.';
      let out = '', i = 0;
      while (i < ops.length) {
        let t = ops[i].t, run = '';
        while (i < ops.length && ops[i].t === t) { run += t === '+' ? ops[i].b : ops[i].a; i++; }
        out += t === ' ' ? run : t === '-' ? `[-${run}-]` : `{+${run}+}`;
      }
      return out;
    }
    const ops = diffSeq(lines(a), lines(b), key);
    const u = unified(ops, Math.floor(o.ctx));
    if (u == null) return 'No differences.';
    const add = ops.filter((x) => x.t === '+').length, del = ops.filter((x) => x.t === '-').length;
    return `--- original\n+++ changed\n${u}\n\n${add} added, ${del} removed`;
  },
});

tools.push({
  id: 'code-diff-html', cat: 'Text', title: 'Side-by-Side Diff (HTML)', desc: 'Visual side-by-side line diff with in-line word highlights.',
  inputs: 2, labels: ['Original', 'Changed'],
  opts: [
    { id: 'ignoreWs', label: 'Ignore whitespace', type: 'checkbox', def: false },
    { id: 'ignoreCase', label: 'Ignore case', type: 'checkbox', def: false },
  ],
  sample: 'function add(a, b) {\n  return a + b;\n}\n\nconsole.log(add(1, 2));',
  sample2: 'function add(a, b, c = 0) {\n  const sum = a + b + c;\n  return sum;\n}\n\nconsole.log(add(1, 2));\n// done',
  run: ([a, b], o) => {
    const ops = diffSeq(lines(a), lines(b), diffKey(o));
    const cell = (n, t, h) => `<td class="n">${n ?? ''}</td><td class="${t}">${h}</td>`;
    const wordMark = (x, y, side) => {
      if (x.length + y.length > 4000) return esc(side === 'a' ? x : y);
      return diffSeq(x.split(/(\s+)/).filter(Boolean), y.split(/(\s+)/).filter(Boolean)).map((p) => {
        if (p.t === ' ') return esc(p.a);
        if (p.t === '-' && side === 'a') return `<mark>${esc(p.a)}</mark>`;
        if (p.t === '+' && side === 'b') return `<mark>${esc(p.b)}</mark>`;
        return '';
      }).join('');
    };
    let rows = '', na = 1, nb = 1, i = 0;
    while (i < ops.length) {
      if (ops[i].t === ' ') { rows += `<tr>${cell(na++, 'e', esc(ops[i].a))}${cell(nb++, 'e', esc(ops[i].b))}</tr>`; i++; continue; }
      const del = [], add = [];
      while (i < ops.length && ops[i].t === '-') del.push(ops[i++].a);
      while (i < ops.length && ops[i].t === '+') add.push(ops[i++].b);
      for (let k = 0; k < Math.max(del.length, add.length); k++) {
        const l = del[k], r = add[k];
        const both = l != null && r != null;
        rows += '<tr>' + (l != null ? cell(na++, 'd', both ? wordMark(l, r, 'a') : esc(l)) : cell('', 'x', '')) +
          (r != null ? cell(nb++, 'a', both ? wordMark(l, r, 'b') : esc(r)) : cell('', 'x', '')) + '</tr>';
      }
    }
    const changed = ops.some((x) => x.t !== ' ');
    return { html: `<!doctype html><meta charset=utf-8><style>body{margin:0;font:13px/1.45 ui-monospace,monospace;color:#1c1f24;background:#fff}
table{border-collapse:collapse;width:100%;table-layout:fixed}td{vertical-align:top;white-space:pre-wrap;word-break:break-all;padding:0 6px}
td.n{width:38px;text-align:right;color:#888;background:#f4f4f4;user-select:none}td.d{background:#ffecec}td.a{background:#e6ffed}td.x{background:#f8f8f8}
mark{background:#ffb3b3;color:inherit}td.a mark{background:#8ee6a3}.none{padding:12px;font:14px system-ui}</style>
${changed ? `<table>${rows}</table>` : '<div class="none">No differences.</div>'}` };
  },
});

// ---------- word counter / stats ----------
tools.push({
  id: 'word-counter', cat: 'Text', title: 'Word Counter', desc: 'Words, characters, sentences, paragraphs, reading and speaking time.',
  sample: SAMPLE,
  opts: [{ id: 'wpm', label: 'Reading WPM', type: 'number', def: 238 }, { id: 'spm', label: 'Speaking WPM', type: 'number', def: 150 }],
  run: ([s], o) => {
    const w = wordsOf(s).length;
    return [
      `Words:                ${w}`,
      `Characters:           ${Array.from(s).length}`,
      `Characters (no spaces): ${Array.from(s.replace(/\s/g, '')).length}`,
      `Sentences:            ${sentencesOf(s).length}`,
      `Paragraphs:           ${paragraphsOf(s).length}`,
      `Lines:                ${s ? lines(s).length : 0}`,
      `Reading time:         ${mmss(w / (o.wpm || 238))}`,
      `Speaking time:        ${mmss(w / (o.spm || 150))}`,
    ].join('\n');
  },
});

const syllables = (w) => {
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  let n = (w.match(/[aeiouy]+/g) || []).length;
  if (n > 1 && /e$/.test(w) && !/le$/.test(w)) n--;
  return Math.max(1, n);
};
const STOP = new Set('the a an and or but of to in on at for with by from as is are was were be been it its this that these those i you he she we they not no so if then than'.split(' '));

tools.push({
  id: 'text-statistics', cat: 'Text', title: 'Text Statistics & Readability', desc: 'Averages, lexical diversity, top words, Flesch reading ease (English).',
  sample: SAMPLE, opts: [{ id: 'stop', label: 'Skip common words in top list', type: 'checkbox', def: true }],
  run: ([s], o) => {
    need(s);
    const ws = wordsOf(s), sn = sentencesOf(s).length || 1, n = ws.length || 1;
    const syl = ws.reduce((a, w) => a + syllables(w), 0);
    const uniq = new Set(ws.map((w) => w.toLowerCase()));
    const freq = new Map();
    for (const w of ws.map((x) => x.toLowerCase())) if (!(o.stop && STOP.has(w))) freq.set(w, (freq.get(w) || 0) + 1);
    const top = [...freq].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
    const fre = 206.835 - 1.015 * (n / sn) - 84.6 * (syl / n), grade = 0.39 * (n / sn) + 11.8 * (syl / n) - 15.59;
    const lvl = fre >= 90 ? 'very easy' : fre >= 80 ? 'easy' : fre >= 70 ? 'fairly easy' : fre >= 60 ? 'standard' : fre >= 50 ? 'fairly difficult' : fre >= 30 ? 'difficult' : 'very difficult';
    const longest = ws.reduce((a, w) => (w.length > a.length ? w : a), '');
    return [
      `Words: ${ws.length}   Unique: ${uniq.size}   Lexical diversity: ${(uniq.size / n).toFixed(2)}`,
      `Sentences: ${sn}   Paragraphs: ${paragraphsOf(s).length}`,
      `Average word length: ${(ws.reduce((a, w) => a + w.length, 0) / n).toFixed(2)} letters`,
      `Average sentence length: ${(n / sn).toFixed(1)} words`,
      `Longest word: ${longest}`,
      `Syllables (English heuristic): ${syl}`,
      `Flesch reading ease: ${fre.toFixed(1)} (${lvl})`,
      `Flesch-Kincaid grade: ${grade.toFixed(1)}`,
      '', 'Top words:', ...top.map(([w, c]) => `  ${w.padEnd(16)} ${c}`),
    ].join('\n');
  },
});

// ---------- case converter ----------
const splitIdent = (s) => s.replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2').replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
const SMALL = new Set('a an and as at but by for in nor of on or per the to up via vs'.split(' '));
const CASES = {
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  title: (s) => {
    const all = [...s.matchAll(/\p{L}[\p{L}'’]*/gu)];
    return s.toLowerCase().replace(/\p{L}[\p{L}'’]*/gu, (w, off) => {
      const idx = all.findIndex((m) => m.index === off);
      return idx > 0 && idx < all.length - 1 && SMALL.has(w) ? w : cap(w);
    });
  },
  sentence: (s) => s.toLowerCase().replace(/(^|[.!?]\s+|\n\s*)(\p{L})/gu, (m, a, c) => a + c.toUpperCase()),
  camel: (s) => { const w = splitIdent(s).map((x) => x.toLowerCase()); return w.map((x, i) => (i ? cap(x) : x)).join(''); },
  pascal: (s) => splitIdent(s).map(cap).join(''),
  snake: (s) => splitIdent(s).join('_').toLowerCase(),
  kebab: (s) => splitIdent(s).join('-').toLowerCase(),
  constant: (s) => splitIdent(s).join('_').toUpperCase(),
  dot: (s) => splitIdent(s).join('.').toLowerCase(),
  alternating: (s) => { let i = 0; return Array.from(s, (c) => (/\p{L}/u.test(c) ? (i++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join(''); },
};
tools.push({
  id: 'case-converter', cat: 'Text', title: 'Case Converter', desc: 'UPPER, lower, Title, Sentence, camelCase, PascalCase, snake_case, kebab-case, CONSTANT, dot.case, aLtErNaTiNg.',
  sample: 'the quick brown fox: jumps over the lazy dog\nhello_world fooBarBaz',
  opts: [{ id: 'to', label: 'Convert to', type: 'select', choices: [...Object.keys(CASES), 'all'], def: 'all' }],
  run: ([s], o) => {
    need(s);
    const conv = (k) => (['camel', 'pascal', 'snake', 'kebab', 'constant', 'dot'].includes(k) ? lines(s).map(CASES[k]).join('\n') : CASES[k](s));
    return o.to === 'all' ? Object.keys(CASES).map((k) => `# ${k}\n${conv(k)}`).join('\n\n') : conv(o.to);
  },
});

// ---------- line tools ----------
tools.push({
  id: 'sort-lines', cat: 'Text', title: 'Sort Lines', desc: 'Sort alphabetically, naturally, numerically, by length, reverse or shuffle.',
  sample: 'banana\nApple\nfile10.txt\nfile2.txt\ncherry\n42\n7\n',
  opts: [
    { id: 'mode', label: 'Mode', type: 'select', choices: ['alpha', 'natural', 'numeric', 'length', 'reverse', 'shuffle'], def: 'alpha' },
    { id: 'desc', label: 'Descending', type: 'checkbox', def: false },
    { id: 'cs', label: 'Case sensitive', type: 'checkbox', def: false },
    { id: 'skipEmpty', label: 'Drop empty lines', type: 'checkbox', def: true },
  ],
  run: ([s], o) => {
    let l = lines(s);
    if (o.skipEmpty) l = l.filter((x) => x.trim());
    const col = new Intl.Collator(undefined, { sensitivity: o.cs ? 'variant' : 'base', numeric: o.mode === 'natural' });
    if (o.mode === 'shuffle') {
      for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
      return l.join('\n');
    }
    if (o.mode === 'reverse') return l.reverse().join('\n');
    const num = (x) => { const m = x.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
    const cmp = {
      alpha: (a, b) => col.compare(a, b), natural: (a, b) => col.compare(a, b),
      length: (a, b) => a.length - b.length || col.compare(a, b),
      numeric: (a, b) => { const x = num(a), y = num(b); return x == null && y == null ? col.compare(a, b) : x == null ? 1 : y == null ? -1 : x - y; },
    }[o.mode];
    l.sort(cmp);
    if (o.desc) l.reverse();
    return l.join('\n');
  },
});

tools.push({
  id: 'dedupe-lines', cat: 'Text', title: 'Remove Duplicate Lines', desc: 'Keep first occurrences, keep only unique lines, or show only the duplicates.',
  sample: 'apple\nBanana\napple\ncherry\nbanana\n  apple  \ncherry\ndate',
  opts: [
    { id: 'mode', label: 'Mode', type: 'select', choices: ['keep first', 'only unique', 'only duplicates'], def: 'keep first' },
    { id: 'cs', label: 'Case sensitive', type: 'checkbox', def: false },
    { id: 'trim', label: 'Ignore surrounding spaces', type: 'checkbox', def: true },
  ],
  run: ([s], o) => {
    const l = lines(s), k = (x) => { if (o.trim) x = x.trim(); return o.cs ? x : x.toLowerCase(); };
    const cnt = new Map();
    for (const x of l) cnt.set(k(x), (cnt.get(k(x)) || 0) + 1);
    const seen = new Set(), out = [];
    for (const x of l) {
      const kk = k(x), first = !seen.has(kk); seen.add(kk);
      if (o.mode === 'keep first' ? first : o.mode === 'only unique' ? cnt.get(kk) === 1 : first && cnt.get(kk) > 1) out.push(x);
    }
    return out.join('\n') || '(nothing left)';
  },
});

tools.push({
  id: 'remove-empty-lines-trim', cat: 'Text', title: 'Remove Empty Lines & Trim', desc: 'Strip blank lines, trim whitespace, collapse repeated spaces or blank lines.',
  sample: '  first line  \n\n\n   second   line\t\n\n\nthird\n',
  opts: [
    { id: 'empty', label: 'Remove empty lines', type: 'checkbox', def: true },
    { id: 'collapse', label: 'Collapse multiple blank lines to one (if not removing)', type: 'checkbox', def: true },
    { id: 'trim', label: 'Trim each line', type: 'checkbox', def: true },
    { id: 'inner', label: 'Collapse inner whitespace', type: 'checkbox', def: false },
  ],
  run: ([s], o) => {
    let l = lines(s);
    if (o.trim) l = l.map((x) => x.trim());
    if (o.inner) l = l.map((x) => x.replace(/[ \t]+/g, ' '));
    if (o.empty) l = l.filter((x) => x.trim());
    else if (o.collapse) l = l.filter((x, i) => x.trim() || (l[i - 1] ?? '').trim());
    return l.join('\n').replace(o.empty ? /$^/ : /^\n+|\n+$/g, '') || '(empty)';
  },
});

tools.push({
  id: 'reverse-text', cat: 'Text', title: 'Reverse Text', desc: 'Reverse characters, word order, each word, or line order.',
  sample: 'Hello wonderful world\nSecond line 👨‍👩‍👧',
  opts: [{ id: 'mode', label: 'Mode', type: 'select', choices: ['characters', 'word order', 'letters in each word', 'line order'], def: 'characters' }],
  run: ([s], o) => {
    if (o.mode === 'line order') return lines(s).reverse().join('\n');
    return lines(s).map((l) => {
      if (o.mode === 'characters') return graphemes(l).reverse().join('');
      if (o.mode === 'word order') return l.split(/(\s+)/).reverse().join('');
      return l.replace(/\S+/g, (w) => graphemes(w).reverse().join(''));
    }).join('\n');
  },
});

tools.push({
  id: 'find-replace', cat: 'Text', title: 'Find & Replace', desc: 'Plain or regex find and replace; $1 / $& work in regex mode.',
  sample: 'The cat sat on the mat. The Cat is happy.',
  opts: [
    { id: 'find', label: 'Find', type: 'text', def: 'cat' },
    { id: 'repl', label: 'Replace with', type: 'text', def: 'dog' },
    { id: 'regex', label: 'Regex', type: 'checkbox', def: false },
    { id: 'cs', label: 'Case sensitive', type: 'checkbox', def: false },
    { id: 'word', label: 'Whole word', type: 'checkbox', def: false },
  ],
  run: ([s], o) => {
    if (!o.find) return s;
    let src = o.regex ? o.find : o.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (o.word) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
    let re;
    try { re = new RegExp(src, 'gmu' + (o.cs ? '' : 'i')); } catch (e) { throw new Error('Invalid regex: ' + e.message); }
    const n = (s.match(re) || []).length;
    const out = s.replace(re, o.regex ? o.repl : () => o.repl);
    return `${out}\n\n— ${n} replacement${n === 1 ? '' : 's'}`;
  },
});

tools.push({
  id: 'extract-emails-urls-numbers', cat: 'Text', title: 'Extract Emails, URLs & Numbers', desc: 'Pull emails, URLs, numbers or hashtags out of any text.',
  sample: 'Contact sales@example.com or support@site.co.uk. Docs: https://example.com/docs?a=1, www.test.org.\nPrice 1,299.50 EUR, qty 3, temp -4.5. Follow #free #tools',
  opts: [
    { id: 'emails', label: 'Emails', type: 'checkbox', def: true }, { id: 'urls', label: 'URLs', type: 'checkbox', def: true },
    { id: 'numbers', label: 'Numbers', type: 'checkbox', def: true }, { id: 'tags', label: 'Hashtags', type: 'checkbox', def: false },
    { id: 'uniq', label: 'Unique only', type: 'checkbox', def: true },
  ],
  run: ([s], o) => {
    const find = (re, fix = (x) => x) => { let r = (s.match(re) || []).map(fix); if (o.uniq) r = [...new Set(r)]; return r; };
    const sec = [];
    if (o.emails) sec.push(['Emails', find(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu)]);
    if (o.urls) sec.push(['URLs', find(/\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi, (u) => u.replace(/[.,;:!?)\]]+$/, ''))]);
    if (o.numbers) sec.push(['Numbers', find(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?|-?\.\d+/g)]);
    if (o.tags) sec.push(['Hashtags', find(/#[\p{L}\p{N}_]+/gu)]);
    if (!sec.length) throw new Error('Select at least one type.');
    return sec.map(([t, r]) => `${t} (${r.length})\n${r.join('\n') || '-'}`).join('\n\n');
  },
});

tools.push({
  id: 'line-numberer', cat: 'Text', title: 'Add Line Numbers', desc: 'Prefix every line with a number.',
  sample: 'alpha\nbeta\n\ngamma',
  opts: [
    { id: 'start', label: 'Start', type: 'number', def: 1 }, { id: 'sep', label: 'Separator', type: 'text', def: ': ' },
    { id: 'pad', label: 'Right-align numbers', type: 'checkbox', def: true }, { id: 'skip', label: 'Skip empty lines', type: 'checkbox', def: false },
  ],
  run: ([s], o) => {
    const l = lines(s); let n = Math.floor(o.start) || 0;
    const last = String(n + l.length - 1).length;
    return l.map((x) => { if (o.skip && !x.trim()) return x; const k = String(n++); return (o.pad ? k.padStart(last) : k) + o.sep + x; }).join('\n');
  },
});

function splitList(s, from) {
  if (from === 'lines') return lines(s);
  if (from === 'json') { let v; try { v = JSON.parse(s); } catch { throw new Error('Input is not valid JSON.'); } if (!Array.isArray(v)) throw new Error('JSON must be an array.'); return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))); }
  if (from === 'space') return s.split(/\s+/);
  if (from === 'tab') return s.split('\t');
  const sep = from === 'semicolon' ? ';' : ',', out = []; let cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { if (q && s[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === sep && !q) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.replace(/\r?\n/g, ' '));
}
tools.push({
  id: 'list-converter', cat: 'Text', title: 'List Converter', desc: 'Convert between lines, comma lists, JSON arrays and quoted lists (CSV, SQL IN).',
  sample: 'red\ngreen\nblue, dark\nyellow',
  opts: [
    { id: 'from', label: 'From', type: 'select', choices: ['lines', 'comma', 'semicolon', 'tab', 'space', 'json'], def: 'lines' },
    { id: 'to', label: 'To', type: 'select', choices: ['lines', 'comma', 'comma + space', 'JSON array', '"quoted", csv', "'single', quoted", 'SQL IN (...)', 'tab', 'space'], def: 'JSON array' },
    { id: 'trim', label: 'Trim items', type: 'checkbox', def: true }, { id: 'drop', label: 'Drop empty', type: 'checkbox', def: true },
    { id: 'uniq', label: 'Unique', type: 'checkbox', def: false },
  ],
  run: ([s], o) => {
    let l = splitList(s, o.from);
    if (o.trim) l = l.map((x) => x.trim());
    if (o.drop) l = l.filter((x) => x !== '');
    if (o.uniq) l = [...new Set(l)];
    const dq = (x) => '"' + x.replace(/"/g, '""') + '"', sq = (x) => "'" + x.replace(/'/g, "''") + "'";
    switch (o.to) {
      case 'lines': return l.join('\n');
      case 'comma': return l.join(',');
      case 'comma + space': return l.join(', ');
      case 'JSON array': return JSON.stringify(l, null, 2);
      case '"quoted", csv': return l.map(dq).join(', ');
      case "'single', quoted": return l.map(sq).join(', ');
      case 'SQL IN (...)': return '(' + l.map(sq).join(', ') + ')';
      case 'tab': return l.join('\t');
      default: return l.join(' ');
    }
  },
});

tools.push({
  id: 'wrap-text', cat: 'Text', title: 'Wrap / Unwrap Text', desc: 'Hard-wrap text at a column width, or join wrapped lines back into paragraphs.',
  sample: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\nUt enim ad minim veniam, quis nostrud exercitation ullamco.',
  opts: [
    { id: 'mode', label: 'Mode', type: 'select', choices: ['wrap', 'unwrap'], def: 'wrap' },
    { id: 'width', label: 'Width', type: 'number', def: 40 },
    { id: 'indent', label: 'Indent', type: 'text', def: '' },
    { id: 'brk', label: 'Break very long words', type: 'checkbox', def: true },
  ],
  run: ([s], o) => {
    if (o.mode === 'unwrap') return s.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).join('\n\n');
    const W = Math.max(5, Math.floor(o.width) || 40), ind = o.indent || '';
    return lines(s).map((para) => {
      const out = []; let cur = '';
      for (let w of para.split(/\s+/).filter(Boolean)) {
        while (o.brk && Array.from(w).length > W - ind.length) {
          if (cur) { out.push(cur); cur = ''; }
          const a = Array.from(w); out.push(ind + a.slice(0, W - ind.length).join('')); w = a.slice(W - ind.length).join('');
        }
        if (cur && Array.from(ind + cur + ' ' + w).length > W) { out.push(ind + cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
      }
      if (cur) out.push(ind + cur);
      return out.join('\n');
    }).join('\n');
  },
});

tools.push({
  id: 'tabs-spaces-converter', cat: 'Text', title: 'Tabs <-> Spaces', desc: 'Expand tabs to spaces (tab-stop aware) or collapse leading spaces into tabs.',
  sample: 'function f() {\n\tif (x) {\n\t\treturn 1;\n\t}\n    return 2;\n}',
  opts: [
    { id: 'dir', label: 'Direction', type: 'select', choices: ['tabs to spaces', 'leading spaces to tabs'], def: 'tabs to spaces' },
    { id: 'size', label: 'Tab size', type: 'number', def: 4 },
  ],
  run: ([s], o) => {
    const n = Math.max(1, Math.floor(o.size) || 4);
    return lines(s).map((l) => {
      if (o.dir === 'tabs to spaces') { let out = ''; for (const c of l) out += c === '\t' ? ' '.repeat(n - (Array.from(out).length % n)) : c; return out; }
      return l.replace(/^ +/, (sp) => '\t'.repeat(Math.floor(sp.length / n)) + ' '.repeat(sp.length % n));
    }).join('\n');
  },
});

tools.push({
  id: 'unicode-normalize', cat: 'Text', title: 'Unicode Normalizer', desc: 'NFC / NFD / NFKC / NFKD, strip accents, remove invisible characters.',
  sample: 'Café e\u0301 ﬁne ① ＡＢＣ\u200B zero\u00ADwidth',
  opts: [
    { id: 'form', label: 'Form', type: 'select', choices: ['NFC', 'NFD', 'NFKC', 'NFKD'], def: 'NFC' },
    { id: 'strip', label: 'Strip diacritics', type: 'checkbox', def: false },
    { id: 'inv', label: 'Remove zero-width / soft hyphen', type: 'checkbox', def: false },
  ],
  run: ([s], o) => {
    let r = s.normalize(o.form);
    if (o.strip) r = r.normalize('NFD').replace(/\p{M}+/gu, '').normalize(o.form);
    if (o.inv) r = r.replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '');
    return `${r}\n\n— ${Array.from(s).length} code points in, ${Array.from(r).length} out`;
  },
});

// ---------- escape ----------
const JS_ESC = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f', '\v': '\\v', '\\': '\\\\', "'": "\\'", '"': '\\"', '`': '\\`' };
const uEsc = (c) => (c.codePointAt(0) > 0xffff ? '\\u{' + c.codePointAt(0).toString(16) + '}' : '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
tools.push({
  id: 'string-escape', cat: 'Text', title: 'String Escape / Unescape', desc: 'Escape or unescape for JavaScript, JSON, CSV, SQL and regex.',
  sample: 'He said "hi"\nit\'s 100% C:\\temp\tdone é',
  opts: [
    { id: 'fmt', label: 'Format', type: 'select', choices: ['JavaScript', 'JSON', 'CSV', 'SQL', 'Regex'], def: 'JavaScript' },
    { id: 'dir', label: 'Direction', type: 'select', choices: ['escape', 'unescape'], def: 'escape' },
    { id: 'ascii', label: 'Escape non-ASCII (JS/JSON)', type: 'checkbox', def: false },
  ],
  run: ([s], o) => {
    const esc_ = o.dir === 'escape', ne = (x) => (o.ascii ? x.replace(/[^\x00-\x7f]/gu, uEsc) : x);
    switch (o.fmt) {
      case 'JavaScript':
        if (esc_) return ne(s.replace(/[\\'"`\n\r\t\b\f\v]|[\x00-\x1f]/g, (c) => JS_ESC[c] || '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')));
        return s.replace(/\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([\s\S]))/g, (m, a, b, c, d) => {
          if (a || b || c) { try { return String.fromCodePoint(parseInt(a || b || c, 16)); } catch { throw new Error('Invalid code point escape: ' + m); } }
          return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' }[d] ?? (d === '\n' ? '' : d);
        });
      case 'JSON':
        if (esc_) return ne(JSON.stringify(s).slice(1, -1));
        try { return JSON.parse('"' + s.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"'); } catch (e) { throw new Error('Invalid JSON string escape: ' + e.message); }
      case 'CSV':
        if (esc_) return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        return /^"[\s\S]*"$/.test(s.trim()) ? s.trim().slice(1, -1).replace(/""/g, '"') : s;
      case 'SQL': return esc_ ? s.replace(/'/g, "''") : s.replace(/''/g, "'");
      default: return esc_ ? s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&') : s.replace(/\\([\s\S])/g, '$1');
    }
  },
});

tools.push({
  id: 'duplicate-words-finder', cat: 'Text', title: 'Duplicate Words Finder', desc: 'Find repeated words and accidental "the the" repeats.',
  sample: 'This is is a test of the the duplicate finder. The finder finds words, and words, and more words.',
  opts: [
    { id: 'cs', label: 'Case sensitive', type: 'checkbox', def: false },
    { id: 'min', label: 'Min word length', type: 'number', def: 3 },
  ],
  run: ([s], o) => {
    const ws = wordsOf(s), k = (w) => (o.cs ? w : w.toLowerCase());
    const adj = [];
    for (let i = 1; i < ws.length; i++) if (k(ws[i]) === k(ws[i - 1])) adj.push(`"${ws[i - 1]} ${ws[i]}" (word ${i})`);
    const c = new Map();
    for (const w of ws) if (w.length >= o.min) c.set(k(w), (c.get(k(w)) || 0) + 1);
    const dups = [...c].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return `Back-to-back repeats (${adj.length})\n${adj.join('\n') || '-'}\n\nWords used more than once (${dups.length})\n${dups.map(([w, n]) => `${w.padEnd(18)} x${n}`).join('\n') || '-'}`;
  },
});

// ---------- number to words ----------
const ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS = 'x x twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion', 'decillion'];
function below1000(n, brit) {
  const p = [];
  if (n >= 100) p.push(ONES[Math.floor(n / 100)] + ' hundred');
  const r = n % 100;
  if (r) { if (n >= 100 && brit) p.push('and'); p.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : '')); }
  return p.join(' ');
}
function intWords(b, brit) {
  if (b === 0n) return 'zero';
  if (b < 0n) return 'minus ' + intWords(-b, brit);
  const g = []; let x = b;
  while (x > 0n) { g.push(Number(x % 1000n)); x /= 1000n; }
  if (g.length > SCALES.length) throw new Error('Number too large (max ~10^36).');
  const parts = [];
  for (let i = g.length - 1; i >= 0; i--) {
    if (!g[i]) continue;
    let w = below1000(g[i], brit);
    if (i === 0 && brit && g.length > 1 && g[0] < 100) w = 'and ' + w;
    parts.push(w + (SCALES[i] ? ' ' + SCALES[i] : ''));
  }
  return parts.join(' ');
}
const ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
const ordinal = (w) => w.replace(/([a-z]+)$/, (last) => ORD[last] || (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th'));
tools.push({
  id: 'number-to-words', cat: 'Text', title: 'Number to Words (English)', desc: 'Spell out numbers: cardinal, ordinal or currency. One number per line.',
  sample: '42\n1999\n1000005\n-7\n3.14\n1234567890123',
  opts: [
    { id: 'mode', label: 'Style', type: 'select', choices: ['cardinal', 'ordinal', 'currency (dollars)'], def: 'cardinal' },
    { id: 'brit', label: 'British "and"', type: 'checkbox', def: false },
  ],
  run: ([s], o) => {
    const out = lines(s).filter((l) => l.trim()).map((l) => {
      const t = l.trim().replace(/[,_\s]/g, '');
      if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return `${l.trim()} -> (not a number)`;
      const neg = t.startsWith('-'); let [ip, fp = ''] = t.replace(/^[-+]/, '').split('.'); ip = ip || '0';
      let r;
      if (o.mode.startsWith('currency')) {
        let cents = BigInt(ip) * 100n + BigInt((fp + '00').slice(0, 2)); if ((fp[2] || '0') >= '5') cents++;
        const d = cents / 100n, c = Number(cents % 100n);
        r = `${intWords(d, o.brit)} dollar${d === 1n ? '' : 's'}${c ? ` and ${intWords(BigInt(c))} cent${c === 1 ? '' : 's'}` : ''}`;
      } else if (o.mode === 'ordinal') {
        if (fp.replace(/0/g, '')) return `${l.trim()} -> (ordinals need whole numbers)`;
        r = ordinal(intWords(BigInt(ip), o.brit));
      } else {
        r = intWords(BigInt(ip), o.brit);
        if (fp) r += ' point ' + [...fp].map((d) => ONES[+d]).join(' ');
      }
      return `${l.trim()} -> ${neg ? 'minus ' : ''}${r}`;
    });
    if (!out.length) throw new Error('Enter at least one number.');
    return out.join('\n');
  },
});

// ---------- roman ----------
const ROM = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
tools.push({
  id: 'roman-numerals', cat: 'Text', title: 'Roman Numeral Converter', desc: 'Convert numbers 1-3999 to Roman numerals and back (auto-detected per line).',
  sample: '2024\nXIV\nMCMXCIV\n49\nIIX',
  run: ([s]) => lines(s).filter((l) => l.trim()).map((l) => {
    const t = l.trim();
    if (/^\d+$/.test(t)) {
      let n = +t; if (n < 1 || n > 3999) return `${t} -> (out of range 1-3999)`;
      let r = ''; for (const [v, sym] of ROM) while (n >= v) { r += sym; n -= v; }
      return `${t} -> ${r}`;
    }
    const u = t.toUpperCase();
    if (!/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(u) || !u) return `${t} -> (invalid Roman numeral)`;
    let n = 0, rest = u; for (const [v, sym] of ROM) while (rest.startsWith(sym)) { n += v; rest = rest.slice(sym.length); }
    return `${t} -> ${n}`;
  }).join('\n') || (() => { throw new Error('Enter a number or Roman numeral.'); })(),
});

// ---------- anagram / palindrome ----------
const letters = (s, strip) => { let x = s.toLowerCase(); if (strip) x = x.normalize('NFD').replace(/\p{M}/gu, ''); return Array.from(x).filter((c) => /[\p{L}\p{N}]/u.test(c)); };
tools.push({
  id: 'anagram-checker', cat: 'Text', title: 'Anagram Checker', desc: 'Check whether two phrases use exactly the same letters.',
  inputs: 2, labels: ['Phrase A', 'Phrase B'], sample: 'Dormitory', sample2: 'Dirty room',
  opts: [{ id: 'strip', label: 'Ignore accents', type: 'checkbox', def: true }],
  run: ([a, b], o) => {
    need(a + b, 'Enter two phrases.');
    const A = letters(a, o.strip), B = letters(b, o.strip), cnt = (arr) => arr.reduce((m, c) => m.set(c, (m.get(c) || 0) + 1), new Map());
    const ca = cnt(A), cb = cnt(B), diff = [];
    for (const c of new Set([...ca.keys(), ...cb.keys()])) if ((ca.get(c) || 0) !== (cb.get(c) || 0)) diff.push(`${c}: ${ca.get(c) || 0} vs ${cb.get(c) || 0}`);
    const same = A.join('') === B.join('');
    return `${!diff.length ? 'YES - anagrams' : 'NO - not anagrams'}${same && A.length ? ' (identical after removing punctuation: same word, not a true anagram)' : ''}\nSorted A: ${[...A].sort().join('')}\nSorted B: ${[...B].sort().join('')}${diff.length ? '\nDifferences: ' + diff.join(', ') : ''}`;
  },
});

tools.push({
  id: 'palindrome-checker', cat: 'Text', title: 'Palindrome Checker', desc: 'Test each line (ignoring case, spaces and punctuation).',
  sample: 'A man, a plan, a canal: Panama\nNo lemon, no melon\nHello world\nRacecar',
  opts: [{ id: 'strict', label: 'Strict (keep case, spaces & punctuation)', type: 'checkbox', def: false }],
  run: ([s], o) => lines(s).filter((l) => l.trim()).map((l) => {
    const a = o.strict ? graphemes(l) : letters(l, true);
    const ok = a.length > 0 && a.join('') === [...a].reverse().join('');
    return `${ok ? 'YES' : 'NO '}  ${l}`;
  }).join('\n') || (() => { throw new Error('Enter some text.'); })(),
});

// ---------- language detector ----------
const SW = {
  English: 'the and of to in is that it was for on are with as be this have from or by not but they you at we his her an which will would there their what so if',
  Spanish: 'el la los las de que y en un una es por con no para se su al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde',
  French: 'le la les de des du un une et est en que qui dans pour pas sur au avec ce il elle ne se sont par plus mais ou nous vous ils comme très être cette',
  German: 'der die das und ist nicht ein eine zu den dem mit von sich auf für auch es im dass er sie wir aber wie oder noch nach bei aus wird sind',
  Italian: 'il lo la i gli le di che e un una è per con non si da in del della sono come ma più anche questo quella nel al ho ha',
  Portuguese: 'o a os as de que e do da em um uma para com não é se por mais mas como foi ao dos das seu sua ou já também são',
  Dutch: 'de het een en van ik te dat die in is niet op zijn met voor ze er maar om ook als aan bij nog wel uit naar dan wat',
  Swedish: 'och att det som en är på av för med den till inte om har ett jag de var vi men så kan han hon',
  Polish: 'i w nie na z że to się jest do jak ale po co tak za od czy dla przez był już być może tylko',
  Turkish: 've bir bu da de için ile ne çok gibi daha olarak ama var değil mi ben sen o ki en kadar sonra',
  Indonesian: 'yang dan di ini itu dengan untuk tidak dari dalam akan pada juga saya ke karena ada mereka adalah atau sudah',
};
const SWSETS = Object.fromEntries(Object.entries(SW).map(([k, v]) => [k, new Set(v.split(' '))]));
const SCRIPTS = [['Japanese (kana)', /[\u3040-\u30ff]/gu], ['Chinese (Han)', /[\u4e00-\u9fff]/gu], ['Korean (Hangul)', /[\uac00-\ud7af\u1100-\u11ff]/gu],
  ['Cyrillic (Russian/Ukrainian/Bulgarian...)', /[\u0400-\u04ff]/gu], ['Arabic script (Arabic/Persian/Urdu)', /[\u0600-\u06ff]/gu], ['Hebrew', /[\u0590-\u05ff]/gu],
  ['Greek', /[\u0370-\u03ff]/gu], ['Devanagari (Hindi/Marathi...)', /[\u0900-\u097f]/gu], ['Thai', /[\u0e00-\u0e7f]/gu]];
tools.push({
  id: 'language-detector', cat: 'Text', title: 'Language Detector', desc: 'Guess the language from script and common words (~20 languages, heuristic).',
  sample: 'Der schnelle braune Fuchs springt über den faulen Hund, und er ist nicht müde.',
  // ponytail: stopword + Unicode-script heuristic; unreliable under ~5 words, cannot split languages sharing a script
  // (Russian vs Ukrainian is only hinted by letters), no dialect support. Upgrade: char n-gram profiles per language.
  run: ([s]) => {
    need(s);
    const total = Array.from(s).filter((c) => /\p{L}/u.test(c)).length || 1;
    const sc = SCRIPTS.map(([n, re]) => [n, (s.match(re) || []).length]).filter(([, c]) => c).sort((a, b) => b[1] - a[1]);
    const res = [];
    for (const [n, c] of sc) {
      let name = n;
      if (n.startsWith('Chinese') && sc.some(([x]) => x.startsWith('Japanese'))) continue;
      if (n.startsWith('Cyrillic')) name = /[іїєґ]/i.test(s) ? 'Ukrainian' : /ў/i.test(s) ? 'Belarusian' : /[ъ]/i.test(s) && !/[ыэё]/i.test(s) ? 'Bulgarian (or Russian)' : 'Russian (or other Cyrillic)';
      if (n.startsWith('Arabic')) name = /[پچگژ]/.test(s) ? 'Persian (Farsi)' : /[ٹڈڑں]/.test(s) ? 'Urdu' : 'Arabic';
      res.push([name, c / total]);
    }
    const latin = (s.match(/\p{Script=Latin}/gu) || []).length;
    let note = '';
    if (latin / total > 0.3) {
      const toks = s.toLowerCase().match(/[\p{L}']+/gu) || [], sc2 = {};
      for (const [lang, set] of Object.entries(SWSETS)) sc2[lang] = toks.filter((t) => set.has(t)).length;
      const sum = Object.values(sc2).reduce((a, b) => a + b, 0);
      for (const [l, c] of Object.entries(sc2).sort((a, b) => b[1] - a[1]).slice(0, 4)) if (c) res.push([l, (c / sum) * (latin / total)]);
      if (!sum) note = 'No known stopwords found - Latin-script language outside the supported list, or text too short.';
      if (toks.length < 5) note = 'Very short text: result is unreliable.';
    }
    if (!res.length) return 'Could not detect a language (no letters recognised).';
    res.sort((a, b) => b[1] - a[1]);
    return res.slice(0, 5).map(([n, c], i) => `${i === 0 ? '>' : ' '} ${n.padEnd(40)} ${(c * 100).toFixed(0)}%`).join('\n') + (note ? '\n\n' + note : '') +
      '\n\nHeuristic: Unicode script + stopword counts. Treat as a hint, not a verdict.';
  },
});

// ---------- sentiment ----------
const LEX = {};
'good:2 great:3 excellent:3 amazing:4 awesome:4 love:3 loved:3 loves:3 like:2 liked:2 happy:3 wonderful:4 best:3 nice:2 fantastic:4 perfect:3 beautiful:3 enjoy:2 enjoyed:2 pleased:2 brilliant:3 superb:5 fun:2 glad:2 delight:3 delighted:3 recommend:2 recommended:2 impressive:3 easy:1 helpful:2 fast:1 friendly:2 clean:1 smooth:1 lovely:3 favorite:2 win:3 won:3 success:2 successful:3 positive:2 thank:2 thanks:2 super:3 cool:1 calm:1 comfortable:2 reliable:2 strong:2 excited:3 exciting:3 incredible:4 outstanding:5 pleasant:2 joy:3 proud:2 safe:1 secure:1 smart:2 satisfied:2 satisfying:2 worth:2 valuable:2 quality:1 fresh:1 genuine:2 gorgeous:3 happy:3 hope:2 kind:2 fine:1 improved:2 improve:2 better:2 bright:1 glorious:3 magnificent:4 terrific:4 flawless:4 enjoyable:2 charming:3 cheerful:2 elegant:2 epic:3 exceptional:4 fabulous:4 hilarious:2 inspiring:3 stellar:4 solid:1 stunning:4 sweet:2 tasty:2 wow:3 yay:2 beloved:3 breathtaking:4'.split(' ').forEach((p) => { const [w, v] = p.split(':'); LEX[w] = +v; });
'bad:-3 terrible:-3 awful:-3 horrible:-3 hate:-3 hated:-3 hates:-3 worst:-3 poor:-2 sad:-2 angry:-3 annoying:-2 annoyed:-2 boring:-2 bored:-2 disappointing:-2 disappointed:-2 ugly:-3 slow:-1 broken:-2 useless:-2 waste:-2 fail:-2 failed:-2 failure:-2 problem:-2 problems:-2 difficult:-1 hard:-1 pain:-2 painful:-2 stupid:-2 dirty:-2 rude:-2 lazy:-1 expensive:-1 fear:-2 scary:-2 cry:-2 lose:-3 lost:-3 nasty:-3 disgusting:-3 worse:-3 negative:-2 sucks:-3 mess:-2 bug:-1 buggy:-2 crash:-2 crashed:-2 error:-2 complaint:-2 unhappy:-2 dislike:-2 awful:-3 mediocre:-2 pathetic:-3 garbage:-3 trash:-3 junk:-2 cheated:-3 scam:-4 fraud:-4 horrid:-3 miserable:-3 offensive:-3 sick:-2 sorry:-1 suffer:-2 terrible:-3 tragic:-3 ruined:-3 regret:-2 refuse:-1 weak:-2 worthless:-3 dreadful:-3 disaster:-3 hopeless:-3 lame:-2 irritating:-2 frustrating:-2 frustrated:-2 unreliable:-2 uncomfortable:-2 unfair:-2 unfortunately:-1 wrong:-2 ridiculous:-2 stressful:-2 toxic:-3 vile:-3 abysmal:-4 annoy:-2 dull:-2 gross:-2 harsh:-2 evil:-3 nightmare:-3'.split(' ').forEach((p) => { const [w, v] = p.split(':'); LEX[w] = +v; });
const NEG_W = new Set(['not', 'no', 'never', 'cannot', "can't", "don't", "isn't", "wasn't", "won't", "didn't", "doesn't", "aren't", "couldn't", "shouldn't", 'without', 'hardly', 'barely']);
const BOOST = { very: 1.5, really: 1.5, extremely: 2, so: 1.3, absolutely: 2, totally: 1.5, incredibly: 2, quite: 1.2, slightly: 0.6, somewhat: 0.7, bit: 0.7 };
tools.push({
  id: 'sentiment-lexicon', cat: 'Text', title: 'Sentiment Analyzer (Lexicon)', desc: 'Small built-in word list, negation and intensifier aware. English only, runs locally.',
  sample: 'I love this product, it is really great! But the delivery was terrible and the support was not helpful.',
  // ponytail: ~200-word AFINN-style lexicon, English only, no sarcasm/context. Upgrade: bigger lexicon (e.g. full AFINN) or a model.
  run: ([s]) => {
    need(s);
    const toks = s.toLowerCase().match(/[\p{L}']+/gu) || [], hits = [];
    let score = 0;
    toks.forEach((t, i) => {
      if (!(t in LEX)) return;
      let v = LEX[t];
      for (let k = 1; k <= 3 && i - k >= 0; k++) {
        const p = toks[i - k];
        if (NEG_W.has(p) || p.endsWith("n't")) { v *= -0.75; break; }
        if (BOOST[p]) { v *= BOOST[p]; break; }
      }
      hits.push([t, v]); score += v;
    });
    const ex = Math.min((s.match(/!/g) || []).length, 3) * 0.2 * Math.sign(score);
    score += ex;
    const cmp = score / (toks.length || 1);
    const label = cmp > 0.05 ? 'Positive' : cmp < -0.05 ? 'Negative' : 'Neutral';
    const f = (h) => h.map(([w, v]) => `${w} (${v > 0 ? '+' : ''}${v.toFixed(1)})`).join(', ') || '-';
    return `Sentiment: ${label}\nScore: ${score.toFixed(2)}   Comparative (per word): ${cmp.toFixed(3)}   Words: ${toks.length}\n\nPositive: ${f(hits.filter(([, v]) => v > 0))}\nNegative: ${f(hits.filter(([, v]) => v < 0))}`;
  },
});

tools.push({
  id: 'character-frequency', cat: 'Text', title: 'Character Frequency', desc: 'Count how often each character appears, with percentages.',
  sample: 'Hello, World! Mississippi',
  opts: [
    { id: 'cs', label: 'Case sensitive', type: 'checkbox', def: false },
    { id: 'spaces', label: 'Include whitespace', type: 'checkbox', def: false },
    { id: 'only', label: 'Letters & digits only', type: 'checkbox', def: false },
  ],
  run: ([s], o) => {
    let a = Array.from(o.cs ? s : s.toLowerCase());
    if (!o.spaces) a = a.filter((c) => !/\s/.test(c));
    if (o.only) a = a.filter((c) => /[\p{L}\p{N}]/u.test(c));
    if (!a.length) throw new Error('No characters to count.');
    const m = new Map(); for (const c of a) m.set(c, (m.get(c) || 0) + 1);
    const vis = (c) => ({ ' ': '␣', '\n': '\\n', '\t': '\\t', '\r': '\\r' }[c] || c);
    const max = Math.max(...m.values());
    return `Total ${a.length}, distinct ${m.size}\n\n` + [...m].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([c, n]) =>
      `${vis(c).padEnd(4)} U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}  ${String(n).padStart(5)}  ${pct(n, a.length).padStart(6)}  ${'#'.repeat(Math.max(1, Math.round(20 * n / max)))}`).join('\n');
  },
});

// =====================================================================
// Markdown
// =====================================================================
const safeUrl = (u) => (/^\s*(javascript|vbscript|data):/i.test(u) && !/^\s*data:image\/(png|gif|jpe?g|webp);/i.test(u) ? '#' : u);
const slugify = (t) => t.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');

function mdInline(s, o) {
  const st = [];
  const put = (h) => '\u0000' + (st.push(h) - 1) + '\u0000';
  s = s.replace(/\u0000/g, '');
  s = s.replace(/\\([!-/:-@[-`{-~])/g, (_, c) => put(esc(c)));
  s = s.replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (_, __, c) => put('<code>' + esc(c.replace(/\n/g, ' ').replace(/^ (.*[^ ].*) $/, '$1')) + '</code>'));
  s = s.replace(/<((?:https?|mailto|ftp):[^\s<>]+|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/g, (_, u) =>
    put(`<a href="${esc(/^[a-z][a-z0-9+.-]*:/i.test(u) ? safeUrl(u) : 'mailto:' + u)}">${esc(u)}</a>`));
  if (o.html) s = s.replace(/<\/?[a-zA-Z][^<>]*>|<!--[\s\S]*?-->/g, (m) => put(m));
  s = esc(s);
  const title = (t) => (t ? ` title="${t}"` : '');
  s = s.replace(/!\[([^\]]*)\]\(\s*([^\s)]*)(?:\s+&quot;(.*?)&quot;)?\s*\)/g, (_, alt, u, t) => put(`<img src="${safeUrl(u)}" alt="${alt}"${title(t)}>`));
  s = s.replace(/\[((?:[^[\]]|\[[^\]]*\])*)\]\(\s*([^\s)]*)(?:\s+&quot;(.*?)&quot;)?\s*\)/g, (_, t, u, ti) => put(`<a href="${safeUrl(u)}"${title(ti)}>`) + t + put('</a>'));
  const ref = (txt, id, m, isImg) => {
    const r = o.refs[(id || txt).toLowerCase().replace(/\s+/g, ' ')];
    if (!r) return m;
    return isImg ? put(`<img src="${safeUrl(esc(r.url))}" alt="${txt}"${title(r.title && esc(r.title))}>`)
      : put(`<a href="${safeUrl(esc(r.url))}"${title(r.title && esc(r.title))}>`) + txt + put('</a>');
  };
  s = s.replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (m, a, b) => ref(a, b, m, true));
  s = s.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (m, a, b) => ref(a, b, m));
  s = s.replace(/\[([^\]]+)\](?!\()/g, (m, a) => ref(a, '', m));
  s = s.replace(/(^|[\s(>])((?:https?:\/\/|www\.)[^\s<\u0000]*[^\s<\u0000.,;:!?'")\]*_~])/g, (_, p, u) =>
    p + put(`<a href="${/^www\./i.test(u) ? 'http://' + u : u}">${u}</a>`));
  s = s.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, '$1<strong>$2</strong>')
    .replace(/\*(?=[^\s*])([\s\S]*?[^\s*])\*/g, '<em>$1</em>')
    .replace(/(^|[^\p{L}\p{N}_])_(?=[^\s_])([\s\S]*?[^\s_])_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/(?: {2,}|\\)\n/g, '<br>\n').replace(/ +\n/g, '\n');
  for (let i = 0; i < 4 && s.includes('\u0000'); i++) s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => st[n]);
  return s;
}

const LIST_RE = /^( {0,3})([*+-]|\d{1,9}[.)])( +|$)(.*)$/;
const HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const FENCE_RE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;
const startsBlock = (l) => {
  if (FENCE_RE.test(l) || ATX_RE.test(l) || HR_RE.test(l) || /^ {0,3}>/.test(l)) return true;
  const m = l.match(LIST_RE);
  return !!(m && m[4].trim() && (!/\d/.test(m[2]) || parseInt(m[2]) === 1));
};
const indentOf = (l) => l.match(/^ */)[0].length;
const isDelim = (l) => l.includes('|') && l.includes('-') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l);
const cells = (l) => {
  l = l.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return l.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
};

function mdBlocks(L, o, tight) {
  const out = []; let i = 0;
  const inl = (t) => mdInline(t, o);
  while (i < L.length) {
    const ln = L[i];
    if (!ln.trim()) { i++; continue; }
    let m;
    if ((m = ln.match(FENCE_RE))) {
      const ind = m[1].length, f = m[2], close = new RegExp('^ {0,3}' + f[0] + '{' + f.length + ',}\\s*$'), body = [];
      i++;
      while (i < L.length && !close.test(L[i])) { body.push(L[i].replace(new RegExp('^ {0,' + ind + '}'), '')); i++; }
      i++;
      out.push(`<pre><code${m[3] ? ` class="language-${esc(m[3])}"` : ''}>${esc(body.join('\n'))}${body.length ? '\n' : ''}</code></pre>`);
      continue;
    }
    if ((m = ln.match(ATX_RE))) {
      const k = m[1].length, t = (m[2] || '').trim(), slug = slugify(t) || 'section', n = o.slugs[slug] = (o.slugs[slug] ?? -1) + 1;
      out.push(`<h${k} id="${esc(n ? slug + '-' + n : slug)}">${inl(t)}</h${k}>`); i++; continue;
    }
    if (HR_RE.test(ln)) { out.push('<hr>'); i++; continue; }
    if (/^ {0,3}>/.test(ln)) {
      const q = [];
      while (i < L.length && L[i].trim()) {
        if (/^ {0,3}>/.test(L[i])) q.push(L[i].replace(/^ {0,3}> ?/, ''));
        else if (startsBlock(L[i])) break; else q.push(L[i]);
        i++;
      }
      out.push('<blockquote>\n' + mdBlocks(q, o) + '</blockquote>'); continue;
    }
    if (ln.includes('|') && i + 1 < L.length && isDelim(L[i + 1]) && cells(ln).length === cells(L[i + 1]).length) {
      const head = cells(ln), al = cells(L[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : ''));
      const td = (tag, c, k) => `<${tag}${al[k] ? ` style="text-align:${al[k]}"` : ''}>${inl(c)}</${tag}>`;
      let h = '<table>\n<thead>\n<tr>' + head.map((c, k) => td('th', c, k)).join('') + '</tr>\n</thead>\n';
      i += 2;
      const rows = [];
      while (i < L.length && L[i].trim() && !startsBlock(L[i])) {
        const r = cells(L[i]); while (r.length < head.length) r.push('');
        rows.push('<tr>' + r.slice(0, head.length).map((c, k) => td('td', c, k)).join('') + '</tr>'); i++;
      }
      out.push(h + (rows.length ? '<tbody>\n' + rows.join('\n') + '\n</tbody>\n' : '') + '</table>'); continue;
    }
    if ((m = ln.match(LIST_RE))) {
      const ordered = /\d/.test(m[2]), delim = ordered ? m[2].slice(-1) : m[2], start = ordered ? parseInt(m[2]) : 1;
      const items = []; let loose = false;
      while (i < L.length) {
        const im = L[i].match(LIST_RE);
        if (!im || HR_RE.test(L[i]) || /\d/.test(im[2]) !== ordered || (ordered ? im[2].slice(-1) : im[2]) !== delim) break;
        const w = im[1].length + im[2].length + (im[3].length > 4 || !im[4] ? 1 : im[3].length);
        const item = [im[3].length > 4 ? im[3].slice(1) + im[4] : im[4]];
        i++;
        let ended = false;
        while (i < L.length && !ended) {
          const l = L[i];
          if (!l.trim()) {
            let j = i; while (j < L.length && !L[j].trim()) j++;
            if (j < L.length && indentOf(L[j]) >= w) { for (let k = i; k < j; k++) item.push(''); i = j; } else ended = true;
          } else if (indentOf(l) >= w) { item.push(l.slice(w)); i++; }
          else if (item.at(-1) !== '' && !startsBlock(l) && !LIST_RE.test(l)) { item.push(l); i++; }
          else ended = true;
        }
        if (item.some((x, k) => x === '' && k < item.length - 1 && item.slice(k + 1).some((y) => y.trim()))) loose = true;
        items.push(item);
        let j = i; while (j < L.length && !L[j].trim()) j++;
        const nx = j < L.length && L[j].match(LIST_RE);
        if (j > i && nx && nx[1].length < w && /\d/.test(nx[2]) === ordered) { loose = true; i = j; }
      }
      const html = items.map((it) => {
        let task = '';
        const t = it[0].match(/^\[([ xX])\][ \t]+(.*)$/);
        if (t) { task = `<input type="checkbox" disabled${t[1] === ' ' ? '' : ' checked'}> `; it = [t[2], ...it.slice(1)]; }
        let inner = mdBlocks(it, o, !loose);
        if (task) inner = inner.startsWith('<p>') ? '<p>' + task + inner.slice(3) : task + inner;
        return `<li${t ? ' class="task-list-item"' : ''}>` + (inner.trim().includes('\n') ? inner : inner.trim()) + '</li>';
      });
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>\n${html.join('\n')}\n</${tag}>`); continue;
    }
    if (/^ {4}/.test(ln)) {
      const body = [];
      while (i < L.length && (/^ {4}/.test(L[i]) || !L[i].trim())) body.push(L[i++].slice(4));
      while (body.length && !body.at(-1).trim()) body.pop();
      out.push(`<pre><code>${esc(body.join('\n'))}\n</code></pre>`); continue;
    }
    const p = [ln.trimStart()]; i++;
    let setext = 0;
    while (i < L.length && L[i].trim()) {
      if (/^ {0,3}=+[ \t]*$/.test(L[i])) { setext = 1; i++; break; }
      if (/^ {0,3}-+[ \t]*$/.test(L[i])) { setext = 2; i++; break; }
      if (startsBlock(L[i])) break;
      p.push(L[i].trimStart()); i++;
    }
    const txt = p.join('\n').replace(/\s+$/, '');
    if (setext) {
      const slug = slugify(txt) || 'section', n = o.slugs[slug] = (o.slugs[slug] ?? -1) + 1;
      out.push(`<h${setext} id="${esc(n ? slug + '-' + n : slug)}">${inl(txt.replace(/\n/g, ' '))}</h${setext}>`);
    } else out.push(tight ? inl(txt) : `<p>${inl(txt)}</p>`);
  }
  return out.length ? out.join('\n') + '\n' : '';
}

export function markdownToHtml(src, o = {}) {
  const refs = {}, kept = []; let fence = null;
  for (const l0 of lines(src)) {
    const l = l0.replace(/^[ \t]+/, (w) => w.replace(/\t/g, '    ')).replace(/^( *)\t/, '$1    ');
    const f = l.match(/^ {0,3}(`{3,}|~{3,})/);
    if (f && (!fence || (f[1][0] === fence[0] && f[1].length >= fence.length && /^ {0,3}\S+\s*$/.test(l)))) fence = fence ? null : f[1];
    const d = !fence && l.match(/^ {0,3}\[([^\]]+)\]:\s*<?(\S+?)>?(?:\s+["'(](.*?)["')])?\s*$/);
    if (d) refs[d[1].toLowerCase().replace(/\s+/g, ' ')] = { url: d[2], title: d[3] }; else kept.push(l);
  }
  return mdBlocks(kept, { html: !!o.html, refs, slugs: {} }, false);
}

const MD_CSS = `body{font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;max-width:780px;margin:16px auto;padding:0 16px;color:#1f2328;background:#fff;word-wrap:break-word}
h1,h2{border-bottom:1px solid #d0d7de;padding-bottom:.3em}h1,h2,h3,h4,h5,h6{margin:1.4em 0 .6em;line-height:1.25}
code{background:#eff1f3;padding:.15em .35em;border-radius:4px;font:85% ui-monospace,Menlo,Consolas,monospace}pre{background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto}pre code{background:none;padding:0}
blockquote{margin:0;padding:0 1em;color:#59636e;border-left:.25em solid #d0d7de}table{border-collapse:collapse}th,td{border:1px solid #d0d7de;padding:6px 13px}th{background:#f6f8fa}
img{max-width:100%}hr{border:0;border-top:1px solid #d0d7de}a{color:#0969da}li.task-list-item{list-style:none;margin-left:-1.4em}`;
const mdDoc = (body, title = 'Preview') => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${MD_CSS}</style></head><body>\n${body}</body></html>\n`;

const MD_SAMPLE = `# Hello Markdown

Some *emphasis*, **strong**, ~~strike~~ and \`inline code\` with a [link](https://example.com "Title").

> A quote with **bold**
> over two lines

- Item one
  - Nested item
- [x] Done task
- [ ] Open task

1. First
2. Second

| Name | Qty | Price |
|:-----|:---:|------:|
| Apple | 3 | 1.20 |
| Pear | 10 | 0.80 |

\`\`\`js
const a = 1 < 2 && "x";
\`\`\`

---

![Alt text](https://example.com/img.png)

<script>alert(1)</script>
`;

tools.push({
  id: 'markdown-to-html', cat: 'Markdown', title: 'Markdown to HTML', desc: 'CommonMark/GFM-style converter: tables, task lists, fences, nested lists. HTML is escaped by default.',
  sample: MD_SAMPLE,
  opts: [
    { id: 'doc', label: 'Full HTML document', type: 'checkbox', def: false },
    { id: 'html', label: 'Allow raw inline HTML', type: 'checkbox', def: false },
  ],
  run: ([s], o) => { const h = markdownToHtml(s, o); return o.doc ? mdDoc(h) : h; },
});

tools.push({
  id: 'markdown-preview', cat: 'Markdown', title: 'Markdown Preview', desc: 'Live rendered preview in a sandboxed frame (scripts never run).',
  sample: MD_SAMPLE,
  opts: [{ id: 'html', label: 'Allow raw inline HTML', type: 'checkbox', def: false }],
  run: ([s], o) => ({ html: mdDoc(markdownToHtml(s, o)) }),
});

// ---- html -> markdown ----
function htmlToMd(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const kids = (n, c) => [...n.childNodes].map((x) => node(x, c)).join('');
  const wrap = (t, m) => { const r = t.match(/^(\s*)([\s\S]*?)(\s*)$/); return r[2] ? r[1] + m + r[2] + m + r[3] : t; };
  const node = (n, c = {}) => {
    if (n.nodeType === 3) {
      if (c.pre) return n.textContent;
      let t = n.textContent.replace(/\s+/g, ' ');
      if (n.previousSibling?.nodeName === 'BR') t = t.trimStart();
      return c.code ? t : t.replace(/([\\`*[\]])/g, '\\$1').replace(/(^|\W)_|_(?=\W|$)/g, (m) => m.replace('_', '\\_'));
    }
    if (n.nodeType !== 1) return '';
    const t = n.tagName.toLowerCase();
    const blk = (x) => '\n\n' + x.trim() + '\n\n';
    switch (t) {
      case 'script': case 'style': case 'head': case 'title': case 'noscript': return '';
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return blk('#'.repeat(+t[1]) + ' ' + kids(n, c).replace(/\s+/g, ' ').trim());
      case 'p': case 'div': case 'section': case 'article': case 'main': case 'header': case 'footer': case 'nav': case 'figure': case 'figcaption': case 'aside': case 'details': case 'summary': case 'dl': case 'dt': case 'dd': return blk(kids(n, c));
      case 'br': return '  \n';
      case 'hr': return '\n\n---\n\n';
      case 'strong': case 'b': return wrap(kids(n, c), '**');
      case 'em': case 'i': case 'cite': return wrap(kids(n, c), '*');
      case 'del': case 's': case 'strike': return wrap(kids(n, c), '~~');
      case 'code': {
        if (c.pre) return n.textContent;
        const x = n.textContent, f = /`/.test(x) ? '``' : '`';
        return x ? f + (f === '``' ? ' ' : '') + x + (f === '``' ? ' ' : '') + f : '';
      }
      case 'pre': {
        const code = n.querySelector('code'), lang = ((code || n).className.match(/(?:language|lang)-([\w+#-]+)/) || [])[1] || '';
        const txt = n.textContent.replace(/\n$/, ''), f = /```/.test(txt) ? '````' : '```';
        return `\n\n${f}${lang}\n${txt}\n${f}\n\n`;
      }
      case 'a': {
        const inner = kids(n, c), href = n.getAttribute('href');
        if (!href) return inner;
        const ti = n.getAttribute('title');
        return `[${inner.trim() || href}](${href.replace(/[() ]/g, encodeURIComponent)}${ti ? ` "${ti.replace(/"/g, '\\"')}"` : ''})`;
      }
      case 'img': { const ti = n.getAttribute('title'); return `![${n.getAttribute('alt') || ''}](${(n.getAttribute('src') || '').replace(/ /g, '%20')}${ti ? ` "${ti.replace(/"/g, '\\"')}"` : ''})`; }
      case 'blockquote': return blk(kids(n, c).trim().replace(/\n{3,}/g, '\n\n').split('\n').map((l) => ('> ' + l).trimEnd()).join('\n'));
      case 'ul': case 'ol': {
        let k = n.tagName === 'OL' ? parseInt(n.getAttribute('start')) || 1 : 0;
        const items = [...n.children].filter((x) => x.tagName === 'LI').map((li) => {
          const mark = n.tagName === 'OL' ? `${k++}. ` : '- ';
          const body = kids(li, c).trim().replace(/\n{2,}(?=\s*(?:[-*]|\d+\.)\s)/g, '\n').replace(/\n{3,}/g, '\n\n');
          return mark + body.split('\n').map((l, i) => (i && l ? ' '.repeat(mark.length) + l : l)).join('\n');
        });
        return '\n\n' + items.join('\n') + '\n\n';
      }
      case 'li': return kids(n, c);
      case 'input': return n.type === 'checkbox' ? (n.hasAttribute('checked') ? '[x] ' : '[ ] ') : '';
      case 'table': {
        const rows = [...n.querySelectorAll('tr')].map((tr) => [...tr.children].filter((x) => /^t[dh]$/i.test(x.tagName)));
        if (!rows.length) return '';
        const w = Math.max(...rows.map((r) => r.length));
        const cellTxt = (x) => (x ? kids(x, c).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim() : '');
        const al = Array.from({ length: w }, (_, j) => { const x = rows[0][j], a = (x?.getAttribute('align') || x?.style?.textAlign || '').toLowerCase(); return a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'; });
        const line = (r) => '| ' + Array.from({ length: w }, (_, j) => cellTxt(r[j])).join(' | ') + ' |';
        return blk([line(rows[0]), '| ' + al.join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n'));
      }
      default: return kids(n, c);
    }
  };
  const walk = (n, c) => n.tagName === 'PRE' ? node(n, c) : node(n, c);
  return walk(doc.body, {}).replace(/[ \t]+$/gm, (m) => (m.length >= 2 && m.length < 4 ? m : '')).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
tools.push({
  id: 'html-to-markdown', cat: 'Markdown', title: 'HTML to Markdown', desc: 'Convert HTML (headings, lists, tables, links, code) to Markdown using the browser parser.',
  dom: true, sample: '<h1>Title</h1><p>Some <strong>bold</strong> and <em>italic</em> text with a <a href="https://example.com">link</a>.</p><ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul><pre><code class="language-js">let x = 1;</code></pre><table><tr><th>A</th><th align="right">B</th></tr><tr><td>1</td><td>2</td></tr></table>',
  run: ([s]) => { need(s, 'Paste some HTML.'); return htmlToMd(s); },
});

// ---- tables ----
function parseDelimited(text, delim) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"' && cur === '') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}
function readTable(s, d) {
  need(s, 'Paste CSV, TSV or a pipe-separated table.');
  const first = s.split(/\r?\n/).find((l) => l.trim()) || '';
  const delim = d === 'tab' ? '\t' : d === 'comma' ? ',' : d === 'semicolon' ? ';' : d === 'pipe' ? '|'
    : first.includes('\t') ? '\t' : [',', ';', '|'].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  let rows = parseDelimited(s, delim).map((r) => r.map((c) => c.trim()));
  if (delim === '|') {
    rows = rows.map((r) => (r[0] === '' ? r.slice(1) : r)).map((r) => (r.at(-1) === '' ? r.slice(0, -1) : r));
    rows = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
  }
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => { while (r.length < w) r.push(''); return r; });
}
const vlen = (s) => Array.from(s).length;
const pad = (s, w, a) => { const d = w - vlen(s); return a === 'right' ? ' '.repeat(d) + s : a === 'center' ? ' '.repeat(d >> 1) + s + ' '.repeat(d - (d >> 1)) : s + ' '.repeat(d); };
const DELIMS = ['auto', 'tab', 'comma', 'semicolon', 'pipe'];

tools.push({
  id: 'markdown-table-generator', cat: 'Markdown', title: 'Markdown Table Generator', desc: 'Turn CSV, TSV or spreadsheet paste into an aligned Markdown table.',
  sample: 'Name,Qty,Price\nApple,3,1.20\n"Pear, green",10,0.80\nPlum,7,2',
  opts: [
    { id: 'delim', label: 'Delimiter', type: 'select', choices: DELIMS, def: 'auto' },
    { id: 'align', label: 'Alignment', type: 'select', choices: ['auto (numbers right)', 'left', 'center', 'right', 'none'], def: 'auto (numbers right)' },
    { id: 'header', label: 'First row is header', type: 'checkbox', def: true },
    { id: 'pretty', label: 'Pad columns', type: 'checkbox', def: true },
  ],
  run: ([s], o) => {
    let rows = readTable(s, o.delim).map((r) => r.map((c) => c.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, '<br>')));
    const w = rows[0].length;
    if (!o.header) rows = [Array.from({ length: w }, (_, i) => `Column ${i + 1}`), ...rows];
    const al = Array.from({ length: w }, (_, j) => {
      if (o.align.startsWith('auto')) { const body = rows.slice(1).map((r) => r[j]).filter(Boolean); return body.length && body.every((x) => /^[-+]?[\d.,]+%?$/.test(x)) ? 'right' : 'left'; }
      return o.align;
    });
    const cw = Array.from({ length: w }, (_, j) => (o.pretty ? Math.max(3, ...rows.map((r) => vlen(r[j]))) : 3));
    const line = (r) => '| ' + r.map((c, j) => (o.pretty ? pad(c, cw[j], al[j]) : c)).join(' | ') + ' |';
    const sep = '| ' + cw.map((n, j) => ({ left: ':' + '-'.repeat(n - 1), right: '-'.repeat(n - 1) + ':', center: ':' + '-'.repeat(n - 2) + ':', none: '-'.repeat(n) }[al[j]])).join(' | ') + ' |';
    return [line(rows[0]), sep, ...rows.slice(1).map(line)].join('\n');
  },
});

const BOX = {
  ascii: { tl: '+', tm: '+', tr: '+', ml: '+', mm: '+', mr: '+', bl: '+', bm: '+', br: '+', h: '-', v: '|' },
  unicode: { tl: '┌', tm: '┬', tr: '┐', ml: '├', mm: '┼', mr: '┤', bl: '└', bm: '┴', br: '┘', h: '─', v: '│' },
  rounded: { tl: '╭', tm: '┬', tr: '╮', ml: '├', mm: '┼', mr: '┤', bl: '╰', bm: '┴', br: '╯', h: '─', v: '│' },
  double: { tl: '╔', tm: '╦', tr: '╗', ml: '╠', mm: '╬', mr: '╣', bl: '╚', bm: '╩', br: '╝', h: '═', v: '║' },
};
tools.push({
  id: 'ascii-table-generator', cat: 'Markdown', title: 'ASCII Table Generator', desc: 'Draw CSV/TSV data as an ASCII or box-drawing table.',
  sample: 'Name,Role,Score\nAda,Engineer,98\nLinus,Maintainer,95\nGrace,Admiral,100',
  opts: [
    { id: 'delim', label: 'Delimiter', type: 'select', choices: DELIMS, def: 'auto' },
    { id: 'style', label: 'Style', type: 'select', choices: ['ascii', 'unicode', 'rounded', 'double', 'compact'], def: 'unicode' },
    { id: 'align', label: 'Align', type: 'select', choices: ['left', 'center', 'right'], def: 'left' },
    { id: 'header', label: 'Separate header', type: 'checkbox', def: true },
    { id: 'rowsep', label: 'Line between rows', type: 'checkbox', def: false },
  ],
  run: ([s], o) => {
    const rows = readTable(s, o.delim).map((r) => r.map((c) => c.replace(/\s*\n\s*/g, ' ')));
    const w = rows[0].length, cw = Array.from({ length: w }, (_, j) => Math.max(...rows.map((r) => vlen(r[j]))));
    if (o.style === 'compact') {
      const ln = (r) => r.map((c, j) => pad(c, cw[j], o.align)).join('  ').trimEnd();
      return [ln(rows[0]), ...(o.header ? [cw.map((n) => '-'.repeat(n)).join('  ')] : []), ...rows.slice(1).map(ln)].join('\n');
    }
    const B = BOX[o.style], bar = (l, m, r) => l + cw.map((n) => B.h.repeat(n + 2)).join(m) + r;
    const ln = (r) => B.v + r.map((c, j) => ' ' + pad(c, cw[j], o.align) + ' ').join(B.v) + B.v;
    const out = [bar(B.tl, B.tm, B.tr)];
    rows.forEach((r, i) => { out.push(ln(r)); if (i < rows.length - 1 && ((i === 0 && o.header) || o.rowsep)) out.push(bar(B.ml, B.mm, B.mr)); });
    out.push(bar(B.bl, B.bm, B.br));
    return out.join('\n');
  },
});

tools.push({
  id: 'ascii-tree-generator', cat: 'Markdown', title: 'ASCII Tree Generator', desc: 'Turn an indented list into a directory-style tree with box-drawing characters.',
  sample: 'project\n  src\n    index.js\n    utils\n      math.js\n  test\n    index.test.js\n  package.json\nREADME.md',
  opts: [
    { id: 'style', label: 'Style', type: 'select', choices: ['unicode', 'ascii'], def: 'unicode' },
    { id: 'slash', label: 'Add / to folders', type: 'checkbox', def: false },
  ],
  run: ([s], o) => {
    const nodes = [], stack = [];
    for (const raw of lines(s)) {
      if (!raw.trim()) continue;
      const exp = raw.replace(/\t/g, '    '), w = indentOf(exp);
      while (stack.length && stack.at(-1).w >= w) stack.pop();
      const n = { name: exp.trim().replace(/^[-*+]\s+/, ''), kids: [], w };
      (stack.length ? stack.at(-1).kids : nodes).push(n); stack.push(n);
    }
    if (!nodes.length) throw new Error('Enter an indented list.');
    const [T, L, V, S] = o.style === 'ascii' ? ['|-- ', '`-- ', '|   ', '    '] : ['├── ', '└── ', '│   ', '    '];
    const out = [];
    const rec = (list, pre) => list.forEach((n, i) => {
      const last = i === list.length - 1;
      out.push(pre + (last ? L : T) + n.name + (o.slash && n.kids.length ? '/' : ''));
      rec(n.kids, pre + (last ? S : V));
    });
    for (const r of nodes) { out.push(r.name + (o.slash && r.kids.length ? '/' : '')); rec(r.kids, ''); }
    return out.join('\n');
  },
});

// =====================================================================
// Text Fun
// =====================================================================
const seq = (U, L, D, ex = {}) => (c) => {
  if (ex[c]) return ex[c];
  const k = c.codePointAt(0);
  if (U != null && k >= 65 && k <= 90) return String.fromCodePoint(U + k - 65);
  if (L != null && k >= 97 && k <= 122) return String.fromCodePoint(L + k - 97);
  if (D != null && k >= 48 && k <= 57) return String.fromCodePoint(D + k - 48);
  return c;
};
const circDigits = { 0: '⓪', ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, String.fromCodePoint(0x2460 + n - 1)])) };
const SMALLCAPS = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ';
const UD_L = 'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz', UD_U = '∀qƆpƎℲפHIſʞ˥WNOԀQɹS┴∩ΛMX⅄Z', UD_D = '0ƖᄅƐㄣϛ9ㄥ86';
const UD_P = { '.': '˙', ',': "'", "'": ',', '"': '„', '?': '¿', '!': '¡', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', _: '‾', '&': '⅋', ';': '؛' };
const FANCY = {
  bold: seq(0x1D400, 0x1D41A, 0x1D7CE), italic: seq(0x1D434, 0x1D44E, null, { h: 'ℎ' }), 'bold italic': seq(0x1D468, 0x1D482),
  script: seq(0x1D49C, 0x1D4B6, null, { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' }),
  'bold script': seq(0x1D4D0, 0x1D4EA), fraktur: seq(0x1D504, 0x1D51E, null, { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' }),
  'bold fraktur': seq(0x1D56C, 0x1D586), 'double-struck': seq(0x1D538, 0x1D552, 0x1D7D8, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' }),
  'sans-serif': seq(0x1D5A0, 0x1D5BA, 0x1D7E2), 'sans bold': seq(0x1D5D4, 0x1D5EE, 0x1D7EC), 'sans italic': seq(0x1D608, 0x1D622),
  monospace: seq(0x1D670, 0x1D68A, 0x1D7F6), circled: seq(0x24B6, 0x24D0, null, circDigits),
  'negative circled': (c) => (/[a-z]/i.test(c) ? String.fromCodePoint(0x1F150 + c.toUpperCase().charCodeAt(0) - 65) : c),
  squared: (c) => (/[a-z]/i.test(c) ? String.fromCodePoint(0x1F130 + c.toUpperCase().charCodeAt(0) - 65) : c),
  fullwidth: (c) => (c === ' ' ? '　' : c > ' ' && c <= '~' ? String.fromCharCode(c.charCodeAt(0) + 0xFEE0) : c),
  'small caps': (c) => (/[a-z]/.test(c) ? SMALLCAPS[c.charCodeAt(0) - 97] : c),
  strikethrough: (c) => (c === '\n' ? c : c + '̶'), underline: (c) => (c === '\n' ? c : c + '̲'),
};
const upsideDown = (s) => Array.from(s).map((c) => (/[a-z]/.test(c) ? UD_L[c.charCodeAt(0) - 97] : /[A-Z]/.test(c) ? UD_U[c.charCodeAt(0) - 65] : /\d/.test(c) ? UD_D[+c] : UD_P[c] || c)).reverse().join('');
tools.push({
  id: 'fancy-text', cat: 'Text Fun', title: 'Fancy Text Generator', desc: 'Bold, italic, script, fraktur, double-struck, monospace, circled, small caps, upside-down and more Unicode styles.',
  sample: 'Hello World 123',
  opts: [{ id: 'style', label: 'Style', type: 'select', choices: ['all', ...Object.keys(FANCY), 'upside-down'], def: 'all' }],
  run: ([s], o) => {
    need(s);
    const f = (k) => (k === 'upside-down' ? upsideDown(s) : Array.from(s, FANCY[k]).join(''));
    return o.style === 'all' ? [...Object.keys(FANCY), 'upside-down'].map((k) => `${k}:\n${f(k)}`).join('\n\n') : f(o.style);
  },
});

const rng = (seedStr) => {
  let a = 0x9e3779b9;
  if (seedStr) { for (const c of String(seedStr)) a = Math.imul(a ^ c.charCodeAt(0), 2654435761) >>> 0; } else a = (Math.random() * 2 ** 32) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
const rng_ = (r, n) => Math.floor(r() * n);
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const Z_UP = [...R(0x300, 0x314), ...R(0x33d, 0x344), 0x346, ...R(0x34a, 0x34c), ...R(0x350, 0x352), 0x357, 0x35b, ...R(0x363, 0x36f)];
const Z_MID = [0x315, 0x31b, 0x340, 0x341, 0x358, 0x321, 0x322, 0x327, 0x328, ...R(0x334, 0x338), 0x489];
const Z_DOWN = [...R(0x316, 0x319), ...R(0x31c, 0x320), ...R(0x323, 0x326), ...R(0x329, 0x333), ...R(0x339, 0x33c), ...R(0x347, 0x349), 0x34d, 0x34e, ...R(0x353, 0x356), 0x359, 0x35a, 0x35c, 0x35f, 0x362];
tools.push({
  id: 'zalgo-text', cat: 'Text Fun', title: 'Zalgo (Glitch) Text', desc: 'Stack combining marks above, through and below your text.',
  sample: 'Zalgo he comes',
  opts: [
    { id: 'level', label: 'Intensity', type: 'select', choices: ['mini', 'normal', 'max'], def: 'normal' },
    { id: 'up', label: 'Up', type: 'checkbox', def: true }, { id: 'mid', label: 'Middle', type: 'checkbox', def: true }, { id: 'down', label: 'Down', type: 'checkbox', def: true },
    { id: 'seed', label: 'Seed (optional)', type: 'text', def: '' },
  ],
  run: ([s], o) => {
    need(s);
    const r = rng(o.seed), mx = { mini: 2, normal: 5, max: 12 }[o.level];
    const pick = (arr, n) => Array.from({ length: n }, () => String.fromCodePoint(arr[rng_(r, arr.length)])).join('');
    if (!o.up && !o.mid && !o.down) throw new Error('Select at least one direction.');
    return Array.from(s, (c) => (/\s/.test(c) ? c : c + (o.up ? pick(Z_UP, 1 + rng_(r, mx)) : '') + (o.mid ? pick(Z_MID, rng_(r, Math.ceil(mx / 3) + 1)) : '') + (o.down ? pick(Z_DOWN, 1 + rng_(r, mx)) : ''))).join('');
  },
});

// 5-row block font. '#' = pixel. Rows separated by '/'.
const FONT_SRC = {
  A: ' ### /#   #/#####/#   #/#   #', B: '#### /#   #/#### /#   #/#### ', C: ' ####/#    /#    /#    / ####', D: '#### /#   #/#   #/#   #/#### ',
  E: '#####/#    /#### /#    /#####', F: '#####/#    /#### /#    /#    ', G: ' ####/#    /#  ##/#   #/ ####', H: '#   #/#   #/#####/#   #/#   #',
  I: '###/ # / # / # /###', J: '  ###/    #/    #/#   #/ ### ', K: '#   #/#  # /###  /#  # /#   #', L: '#    /#    /#    /#    /#####',
  M: '#   #/## ##/# # #/#   #/#   #', N: '#   #/##  #/# # #/#  ##/#   #', O: ' ### /#   #/#   #/#   #/ ### ', P: '#### /#   #/#### /#    /#    ',
  Q: ' ### /#   #/# # #/#  # / ## #', R: '#### /#   #/#### /#  # /#   #', S: ' ####/#    / ### /    #/#### ', T: '#####/  #  /  #  /  #  /  #  ',
  U: '#   #/#   #/#   #/#   #/ ### ', V: '#   #/#   #/#   #/ # # /  #  ', W: '#   #/#   #/# # #/## ##/#   #', X: '#   #/ # # /  #  / # # /#   #',
  Y: '#   #/ # # /  #  /  #  /  #  ', Z: '#####/   # /  #  / #   /#####',
  0: ' ### /#  ##/# # #/##  #/ ### ', 1: ' # /## / # / # /###', 2: ' ### /#   #/  ## / #   /#####', 3: '#### /    #/ ### /    #/#### ',
  4: '#   #/#   #/#####/    #/    #', 5: '#####/#    /#### /    #/#### ', 6: ' ### /#    /#### /#   #/ ### ', 7: '#####/    #/   # /  #  / #   ',
  8: ' ### /#   #/ ### /#   #/ ### ', 9: ' ### /#   #/ ####/    #/ ### ',
  '.': ' / / / /#', ',': '  /  /  / #/# ', '!': '#/#/#/ /#', '?': ' ### /#   #/  ## /     /  #  ', '-': '     /     /#####/     /     ',
  _: '     /     /     /     /#####', ':': ' /#/ /#/ ', ';': '  / #/  / #/# ', '+': '     /  #  /#####/  #  /     ', '=': '     /#####/     /#####/     ',
  '/': '    #/   # /  #  / #   /#    ', '\\': '#    / #   /  #  /   # /    #', '(': ' #/# /# /# / #', ')': '# / #/ #/ #/# ', "'": '#/#/ / / ', '"': '# #/# #/   /   /   ',
  '*': '     /# # #/ ### /# # #/     ', '#': ' # # /#####/ # # /#####/ # # ', '@': ' ### /# ###/# ###/#    / ### ', '&': ' ##  /#  # / ##  /#  # / ## #',
  '<': '  #/ # /#  / # /  #', '>': '#  / # /  #/ # /#  ', '[': '##/# /# /# /##', ']': '##/ #/ #/ #/##', '%': '#   #/   # /  #  / #   /#   #', ' ': '   /   /   /   /   ',
};
const FONT = Object.fromEntries(Object.entries(FONT_SRC).map(([k, v]) => { const rows = v.split('/'), w = Math.max(...rows.map((r) => r.length)); return [k, rows.map((r) => r.padEnd(w))]; }));
tools.push({
  id: 'ascii-art-text', cat: 'Text Fun', title: 'ASCII Art Text', desc: 'Big 5-row block letters for A-Z, 0-9 and common punctuation.',
  sample: 'Hello 2024!',
  opts: [{ id: 'ch', label: 'Fill character', type: 'text', def: '█' }, { id: 'gap', label: 'Letter spacing', type: 'number', def: 1 }],
  run: ([s], o) => {
    need(s);
    const ch = Array.from(o.ch || '█')[0], gap = ' '.repeat(Math.max(0, Math.min(6, Math.floor(o.gap) || 0)));
    return lines(s.toUpperCase()).map((ln) => {
      const g = Array.from(ln).map((c) => FONT[c] || FONT['?']);
      if (!g.length) return '\n\n\n\n';
      return [0, 1, 2, 3, 4].map((r) => g.map((x) => x[r].replace(/#/g, ch)).join(gap).trimEnd()).join('\n');
    }).join('\n\n');
  },
});

const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum at vero eos accusamus iusto odio dignissimos ducimus blanditiis praesentium voluptatum deleniti atque corrupti quos dolores quas molestias excepturi occaecati cupiditate provident similique'.split(' ');
tools.push({
  id: 'lorem-ipsum', cat: 'Text Fun', title: 'Lorem Ipsum Generator', desc: 'Placeholder words, sentences or paragraphs. Use a seed for repeatable output.',
  inputs: 0, sample: '',
  opts: [
    { id: 'unit', label: 'Unit', type: 'select', choices: ['paragraphs', 'sentences', 'words'], def: 'paragraphs' },
    { id: 'count', label: 'Count', type: 'number', def: 3 },
    { id: 'start', label: 'Start with "Lorem ipsum"', type: 'checkbox', def: true },
    { id: 'seed', label: 'Seed (optional)', type: 'text', def: '' },
  ],
  run: (_, o) => {
    const n = Math.floor(o.count);
    if (!(n >= 1 && n <= 2000)) throw new Error('Count must be between 1 and 2000.');
    const r = rng(o.seed), w = () => WORDS[rng_(r, WORDS.length)];
    const LEAD = WORDS.slice(0, 8);
    let first = o.start;
    const sentence = () => {
      const len = 6 + rng_(r, 9), a = first ? [...LEAD] : [];
      first = false;
      while (a.length < len) a.push(w());
      for (let i = 3; i < a.length - 2; i++) if (r() < 0.12) { a[i] += ','; i += 2; }
      return a.join(' ').replace(/^./, (c) => c.toUpperCase()).replace(/,$/, '') + '.';
    };
    if (o.unit === 'words') { const a = o.start ? [...LEAD] : []; while (a.length < n) a.push(w()); return a.slice(0, n).join(' '); }
    if (o.unit === 'sentences') return Array.from({ length: n }, sentence).join(' ');
    return Array.from({ length: n }, () => Array.from({ length: 3 + rng_(r, 4) }, sentence).join(' ')).join('\n\n');
  },
});

const NATO = { A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu', 0: 'Zero', 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine' };
const NATO_ITU = { 0: 'Zero', 1: 'Wun', 2: 'Too', 3: 'Tree', 4: 'Fower', 5: 'Fife', 6: 'Six', 7: 'Seven', 8: 'Ait', 9: 'Niner' };
tools.push({
  id: 'nato-phonetic', cat: 'Text Fun', title: 'NATO Phonetic Alphabet', desc: 'Spell text with Alfa, Bravo, Charlie... or decode it back.',
  sample: 'Hello World 42',
  opts: [
    { id: 'dir', label: 'Direction', type: 'select', choices: ['text to NATO', 'NATO to text'], def: 'text to NATO' },
    { id: 'itu', label: 'ITU radio digits (Tree, Fife, Niner)', type: 'checkbox', def: false },
  ],
  run: ([s], o) => {
    need(s);
    const tbl = { ...NATO, ...(o.itu ? NATO_ITU : {}) };
    if (o.dir === 'NATO to text') {
      const rev = {}; for (const [k, v] of Object.entries({ ...NATO, ...NATO_ITU })) rev[v.toLowerCase()] = k; rev.alpha = 'A'; rev.juliet = 'J'; rev.xray = 'X';
      return lines(s).map((l) => l.trim().split(/\s*\/\s*|\s{2,}/).map((word) => word.split(/\s+/).map((t) => rev[t.toLowerCase()] ?? (t.length === 1 ? t : '?')).join('')).join(' ')).join('\n');
    }
    return lines(s).map((l) => l.split(/\s+/).filter(Boolean).map((word) => Array.from(word).map((c) => tbl[c.toUpperCase()] || c).join(' ')).join('  /  ')).join('\n');
  },
});

const LEET = {
  basic: { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7' },
  advanced: { a: '4', b: '8', e: '3', g: '9', i: '1', l: '1', o: '0', s: '5', t: '7', z: '2' },
  extreme: { a: '/\\', b: '|3', c: '(', d: '|)', e: '3', f: '|=', g: '(_+', h: '|-|', i: '!', j: '_|', k: '|<', l: '|_', m: '|\\/|', n: '|\\|', o: '0', p: '|*', q: '(,)', r: '|2', s: '$', t: '+', u: '|_|', v: '\\/', w: '\\/\\/', x: '><', y: '`/', z: '2' },
};
tools.push({
  id: 'leetspeak', cat: 'Text Fun', title: 'Leetspeak Converter', desc: 'Convert text to 1337 5p34k in three intensities.',
  sample: 'Elite hacker speak is fun',
  opts: [{ id: 'level', label: 'Level', type: 'select', choices: ['basic', 'advanced', 'extreme'], def: 'basic' }],
  run: ([s], o) => { need(s); const m = LEET[o.level]; return Array.from(s, (c) => m[c.toLowerCase()] ?? c).join(''); },
});

// ---------- render tools ----------
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else if (k in e) e[k] = v; else e.setAttribute(k, v);
  }
  e.append(...kids.flat().filter((x) => x != null));
  return e;
};
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    try { const ta = h('textarea', { value: t }); document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
  }
}
const sheet = (css) => h('style', {}, css);

tools.push({
  id: 'text-to-speech', cat: 'Text Fun', title: 'Text to Speech', desc: 'Read text aloud with your browser\'s speech synthesis voices.', custom: true,
  render: (el) => {
    const ss = globalThis.speechSynthesis;
    if (!ss) { el.append(h('p', {}, 'Speech synthesis is not supported in this browser.')); return; }
    const ta = h('textarea', { value: 'Hello! This sentence is read aloud by a voice installed in your browser.' });
    const sel = h('select'), rate = h('input', { type: 'range', min: 0.5, max: 2, step: 0.1, value: 1 }), pitch = h('input', { type: 'range', min: 0, max: 2, step: 0.1, value: 1 }), vol = h('input', { type: 'range', min: 0, max: 1, step: 0.1, value: 1 });
    const localOnly = h('input', { type: 'checkbox', checked: true });
    const status = h('p', { className: 'desc' });
    let voices = [];
    const load = () => {
      voices = ss.getVoices().filter((v) => !localOnly.checked || v.localService);
      sel.replaceChildren(...voices.map((v, i) => h('option', { value: i }, `${v.name} (${v.lang})${v.localService ? '' : ' - online'}`)));
      status.textContent = voices.length ? '' : 'No matching voices found. Untick "local voices only" or install system voices.';
    };
    ss.addEventListener?.('voiceschanged', load); localOnly.addEventListener('change', load); load();
    const speak = () => {
      ss.cancel();
      const text = ta.value.trim(); if (!text) return;
      for (const part of text.match(/[^.!?\n]+[.!?]*\s*|\n/g) || [text]) {
        if (!part.trim()) continue;
        const u = new SpeechSynthesisUtterance(part);
        const v = voices[+sel.value]; if (v) { u.voice = v; u.lang = v.lang; }
        u.rate = +rate.value; u.pitch = +pitch.value; u.volume = +vol.value;
        ss.speak(u);
      }
    };
    const lab = (t, x) => h('label', {}, t, x);
    el.append(h('label', {}, 'Text'), ta, lab('Voice', sel),
      h('div', { className: 'opts' }, lab('Rate', rate), lab('Pitch', pitch), lab('Volume', vol), lab('Local voices only', localOnly)),
      h('div', { className: 'row' }, h('button', { onclick: speak }, 'Speak'), h('button', { onclick: () => ss.pause() }, 'Pause'), h('button', { onclick: () => ss.resume() }, 'Resume'), h('button', { onclick: () => ss.cancel() }, 'Stop')),
      status, h('p', { className: 'desc' }, 'Voices come from your browser/OS. Some browsers ship cloud-backed voices (marked "online") that send the text to a remote service; "local voices only" avoids those.'));
  },
});

const EMOJI = {
  Smileys: '😀 grinning;😃 smile;😄 grin happy;😁 beaming;😆 laughing;😅 sweat smile;🤣 rofl;😂 joy tears;🙂 slight smile;🙃 upside down;😉 wink;😊 blush;😇 angel halo;🥰 love hearts face;😍 heart eyes;🤩 star struck;😘 kiss;😋 yum;😛 tongue;😜 wink tongue;🤪 zany;🤗 hug;🤭 giggle;🤫 shush;🤔 thinking;😐 neutral;😑 expressionless;😶 no mouth;😏 smirk;😒 unamused;🙄 eye roll;😬 grimace;😌 relieved;😔 pensive;😴 sleeping;🤤 drool;😷 mask sick;🤒 fever;🤕 injured;🤢 nauseated;🤮 vomit;🥵 hot;🥶 cold;🥴 woozy;😵 dizzy;🤯 mind blown;🤠 cowboy;🥳 party;😎 cool sunglasses;🤓 nerd;🧐 monocle;😕 confused;😟 worried;🙁 frown;😮 surprised;😲 astonished;😳 flushed;🥺 pleading;😢 cry;😭 sob;😱 scream;😖 confounded;😞 disappointed;😓 sweat;😩 weary;😫 tired;😤 triumph;😡 angry;😠 mad;🤬 cursing;😈 devil;👿 imp;💀 skull;💩 poop;🤡 clown;👻 ghost;👽 alien;🤖 robot;😺 cat smile;😸 cat grin;😹 cat joy;😻 cat heart eyes;🙈 see no evil;🙉 hear no evil;🙊 speak no evil',
  People: '👋 wave;🤚 raised hand;🖐 hand splayed;✋ stop hand;👌 ok;🤌 pinched fingers;✌️ victory peace;🤞 crossed fingers;🤟 love you;🤘 rock on;🤙 call me;👈 point left;👉 point right;👆 point up;👇 point down;☝️ index up;👍 thumbs up like;👎 thumbs down;✊ fist;👊 punch;🤛 fist left;🤜 fist right;👏 clap;🙌 raised hands;👐 open hands;🤲 palms up;🤝 handshake;🙏 pray thanks;✍️ writing;💅 nail polish;🤳 selfie;💪 muscle strong;🦾 robot arm;🧠 brain;👀 eyes;👁 eye;👅 tongue;👄 mouth;👶 baby;🧒 child;👦 boy;👧 girl;🧑 person;👨 man;👩 woman;🧓 older person;👴 old man;👵 old woman;👮 police;🕵️ detective;👷 construction worker;💂 guard;🧑‍⚕️ health worker;🧑‍🎓 student;🧑‍🏫 teacher;🧑‍💻 technologist developer;🧑‍🍳 cook;🧑‍🚀 astronaut;🧑‍🎨 artist;🦸 superhero;🦹 supervillain;🧙 mage wizard;🧚 fairy;🧛 vampire;🧜 merperson;🧝 elf;🧞 genie;🧟 zombie;💃 dancer woman;🕺 dancer man;🚶 walking;🏃 running;🧘 lotus yoga;👨‍👩‍👧 family',
  Animals: '🐶 dog;🐱 cat;🐭 mouse;🐹 hamster;🐰 rabbit;🦊 fox;🐻 bear;🐼 panda;🐨 koala;🐯 tiger;🦁 lion;🐮 cow;🐷 pig;🐸 frog;🐵 monkey;🐔 chicken;🐧 penguin;🐦 bird;🐤 chick;🦆 duck;🦅 eagle;🦉 owl;🦇 bat;🐺 wolf;🐗 boar;🐴 horse;🦄 unicorn;🐝 bee;🐛 bug caterpillar;🦋 butterfly;🐌 snail;🐞 ladybug;🐜 ant;🕷 spider;🦂 scorpion;🐢 turtle;🐍 snake;🦎 lizard;🐙 octopus;🦑 squid;🦐 shrimp;🦀 crab;🐡 blowfish;🐠 tropical fish;🐟 fish;🐬 dolphin;🐳 whale;🦈 shark;🐊 crocodile;🐅 tiger2;🐆 leopard;🦓 zebra;🦍 gorilla;🐘 elephant;🦏 rhino;🐪 camel;🦒 giraffe;🦘 kangaroo;🐃 buffalo;🐂 ox;🐎 horse racing;🐖 pig2;🐏 ram;🐑 sheep;🐐 goat;🦌 deer;🐕 dog2;🐩 poodle;🐈 cat2;🐓 rooster;🦃 turkey;🦚 peacock;🦜 parrot;🦢 swan;🕊 dove peace;🐇 rabbit2;🦔 hedgehog;🐿 chipmunk;🌵 cactus;🎄 christmas tree;🌲 evergreen;🌳 tree;🌴 palm;🌱 seedling;🌿 herb;☘️ shamrock;🍀 four leaf clover;🍁 maple leaf;🍂 fallen leaf;🍃 leaves;🍄 mushroom;🌷 tulip;🌹 rose;🌻 sunflower;🌼 blossom;🌸 cherry blossom;💐 bouquet',
  Food: '🍏 green apple;🍎 apple;🍐 pear;🍊 orange;🍋 lemon;🍌 banana;🍉 watermelon;🍇 grapes;🍓 strawberry;🫐 blueberries;🍈 melon;🍒 cherries;🍑 peach;🥭 mango;🍍 pineapple;🥥 coconut;🥝 kiwi;🍅 tomato;🍆 eggplant;🥑 avocado;🥦 broccoli;🥬 leafy green;🥒 cucumber;🌶 chili pepper;🌽 corn;🥕 carrot;🥔 potato;🍠 sweet potato;🥐 croissant;🍞 bread;🥖 baguette;🥨 pretzel;🧀 cheese;🥚 egg;🍳 cooking fried egg;🥞 pancakes;🧇 waffle;🥓 bacon;🥩 steak;🍗 poultry leg;🍖 meat bone;🌭 hot dog;🍔 hamburger;🍟 fries;🍕 pizza;🥪 sandwich;🌮 taco;🌯 burrito;🥗 salad;🍝 spaghetti;🍜 ramen noodles;🍲 stew pot;🍛 curry;🍣 sushi;🍱 bento;🥟 dumpling;🍤 fried shrimp;🍙 rice ball;🍚 rice;🍥 fish cake;🥠 fortune cookie;🍢 oden;🍡 dango;🍦 ice cream;🍧 shaved ice;🍨 ice cream bowl;🍩 donut;🍪 cookie;🎂 birthday cake;🍰 cake;🧁 cupcake;🥧 pie;🍫 chocolate;🍬 candy;🍭 lollipop;🍮 custard;🍯 honey;🍼 baby bottle;🥛 milk;☕ coffee;🍵 tea;🍶 sake;🍾 champagne;🍷 wine;🍸 cocktail;🍹 tropical drink;🍺 beer;🍻 beers cheers;🥂 clinking glasses;🥃 whiskey tumbler;🥤 cup straw;🧃 juice box;🧊 ice',
  Activity: '⚽ soccer;🏀 basketball;🏈 football;⚾ baseball;🎾 tennis;🏐 volleyball;🏉 rugby;🎱 pool 8 ball;🏓 ping pong;🏸 badminton;🥅 goal net;🏒 hockey;⛳ golf;🏹 archery;🎣 fishing;🥊 boxing;🥋 martial arts;⛸ ice skate;🎿 ski;🏂 snowboard;🏋️ weight lifting;🤸 cartwheel;🏊 swimming;🚴 cycling;🏆 trophy;🥇 gold medal;🥈 silver medal;🥉 bronze medal;🏅 medal;🎖 military medal;🎫 ticket;🎭 theater masks;🎨 palette art;🎬 clapper;🎤 microphone;🎧 headphones;🎼 score;🎹 piano keyboard;🥁 drum;🎷 saxophone;🎺 trumpet;🎸 guitar;🎻 violin;🎲 dice;🎯 bullseye dart;🎳 bowling;🎮 video game;🎰 slot machine;🧩 puzzle;♟ chess pawn',
  Travel: '🚗 car;🚕 taxi;🚌 bus;🚎 trolleybus;🏎 racing car;🚓 police car;🚑 ambulance;🚒 fire engine;🚚 truck;🚜 tractor;🏍 motorcycle;🚲 bicycle;🛴 scooter;🚂 locomotive;🚆 train;🚄 bullet train;🚇 metro;🚁 helicopter;✈️ airplane;🛫 takeoff;🛬 landing;🚀 rocket;🛸 ufo flying saucer;🚢 ship;⛵ sailboat;🚤 speedboat;⚓ anchor;⛽ fuel pump;🚦 traffic light;🚧 construction;🗺 world map;🗽 statue of liberty;🗼 tokyo tower;🏰 castle;🏯 japanese castle;🎡 ferris wheel;🎢 roller coaster;🏖 beach;🏝 desert island;🏜 desert;🌋 volcano;🗻 mount fuji;🏔 snow mountain;⛰ mountain;🏕 camping;🏠 house;🏡 house garden;🏢 office building;🏥 hospital;🏦 bank;🏨 hotel;🏫 school;🏭 factory;⛪ church;🕌 mosque;🕍 synagogue;🌃 night stars;🌆 cityscape dusk;🌉 bridge night;🌍 earth europe africa;🌎 earth americas;🌏 earth asia;🌐 globe meridians;🌙 crescent moon;🌞 sun face;⭐ star;🌟 glowing star;☀️ sun;⛅ sun behind cloud;☁️ cloud;🌧 rain cloud;⛈ thunder;❄️ snowflake;⛄ snowman;🌈 rainbow;🔥 fire;💧 droplet;🌊 wave',
  Objects: '⌚ watch;📱 phone;💻 laptop;⌨️ keyboard;🖥 desktop;🖨 printer;🖱 mouse;💾 floppy disk;💿 cd;📷 camera;📹 video camera;📺 tv;📻 radio;☎️ telephone;🔋 battery;🔌 plug;💡 light bulb idea;🔦 flashlight;🕯 candle;💰 money bag;💵 dollar;💶 euro;💳 credit card;💎 gem diamond;⚖️ scales;🔧 wrench;🔨 hammer;🛠 tools;⚙️ gear settings;🔩 nut bolt;🔗 link;⛓ chains;🧲 magnet;🔫 water pistol;💣 bomb;🔪 knife;🛡 shield;🔮 crystal ball;💊 pill;💉 syringe;🧬 dna;🔬 microscope;🔭 telescope;📡 satellite antenna;🧹 broom;🧺 basket;🚪 door;🛏 bed;🛋 couch;🚽 toilet;🚿 shower;🛁 bathtub;🔑 key;🗝 old key;🔒 lock;🔓 unlock;📦 package;📫 mailbox;📧 email;📨 incoming envelope;📝 memo note;📁 folder;📂 open folder;📅 calendar;📈 chart up;📉 chart down;📊 bar chart;📋 clipboard;📌 pushpin;📍 round pin;📎 paperclip;📏 ruler;✂️ scissors;🗑 wastebasket;📖 open book;📚 books;🔖 bookmark;📰 newspaper;✏️ pencil;🖊 pen;🖍 crayon;🔍 magnifier;🔎 magnifier right;🎁 gift;🎈 balloon;🎉 party popper;🎊 confetti;🏷 label tag;⏰ alarm clock;⏳ hourglass;⌛ hourglass done;🧭 compass;🧯 fire extinguisher',
  Symbols: '❤️ red heart;🧡 orange heart;💛 yellow heart;💚 green heart;💙 blue heart;💜 purple heart;🖤 black heart;🤍 white heart;🤎 brown heart;💔 broken heart;❣️ heart exclamation;💕 two hearts;💞 revolving hearts;💓 beating heart;💗 growing heart;💖 sparkling heart;💘 heart arrow;💝 heart ribbon;✨ sparkles;💫 dizzy star;💥 collision boom;💢 anger;💦 sweat drops;💨 dash wind;💤 zzz sleep;✅ check mark;☑️ check box;✔️ check;❌ cross x;❎ cross button;❓ question;❗ exclamation;‼️ double exclamation;⚠️ warning;🚫 prohibited;⛔ no entry;🔞 no under 18;♻️ recycle;➕ plus;➖ minus;➗ divide;✖️ multiply;♾ infinity;™️ trademark;©️ copyright;®️ registered;〰️ wavy dash;➰ curly loop;🔴 red circle;🟠 orange circle;🟡 yellow circle;🟢 green circle;🔵 blue circle;🟣 purple circle;⚫ black circle;⚪ white circle;🟥 red square;🟦 blue square;🟩 green square;⬛ black square;⬜ white square;🔶 orange diamond;🔷 blue diamond;🔺 red triangle up;🔻 red triangle down;▶️ play;⏸ pause;⏹ stop;⏺ record;⏭ next;⏮ previous;🔀 shuffle;🔁 repeat;🔄 refresh arrows;⬆️ up arrow;⬇️ down arrow;⬅️ left arrow;➡️ right arrow;↗️ up right;↘️ down right;↩️ return left;↪️ return right;🔔 bell;🔕 bell off;🔊 loud speaker;🔇 muted;📣 megaphone;💬 speech bubble;💭 thought bubble;♠️ spade;♥️ heart suit;♦️ diamond suit;♣️ club;🏁 chequered flag;🚩 red flag;🏳️ white flag;🏴 black flag;🏳️‍🌈 rainbow flag;🔱 trident;⚜️ fleur de lis;🔰 beginner;☮️ peace;☯️ yin yang;✝️ cross;☪️ star crescent;🕉 om;✡️ star of david;♈ aries;♉ taurus;♊ gemini;♋ cancer;♌ leo;♍ virgo;♎ libra;♏ scorpio;♐ sagittarius;♑ capricorn;♒ aquarius;♓ pisces',
};
const EMOJI_LIST = Object.entries(EMOJI).flatMap(([cat, str]) => str.split(';').map((x) => { const i = x.indexOf(' '); return { e: x.slice(0, i), n: x.slice(i + 1), cat }; }));
tools.push({
  id: 'emoji-picker', cat: 'Text Fun', title: 'Emoji Picker', desc: 'Browse and search emojis by category; click to copy.', custom: true,
  render: (el) => {
    let cat = Object.keys(EMOJI)[0];
    const q = h('input', { type: 'text', placeholder: 'Search (e.g. heart, fire, cat)...' }), tray = h('input', { type: 'text', placeholder: 'Clicked emojis collect here' });
    const tabs = h('div', { className: 'row' }), grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:4px;margin:8px 0' });
    const msg = h('span', { className: 'desc' });
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      const list = s ? EMOJI_LIST.filter((x) => x.n.includes(s) || x.e === s || x.cat.toLowerCase().includes(s)) : EMOJI_LIST.filter((x) => x.cat === cat);
      tabs.replaceChildren(...Object.keys(EMOJI).map((c) => h('button', { style: !s && c === cat ? 'border-color:var(--ac)' : '', onclick: () => { cat = c; q.value = ''; draw(); } }, c)));
      grid.replaceChildren(...list.map((x) => h('button', { title: x.n, style: 'font-size:24px;padding:4px;line-height:1.2', onclick: async () => { tray.value += x.e; msg.textContent = (await copyText(x.e)) ? `Copied ${x.e}` : 'Copy blocked - use the box above'; } }, x.e)));
      if (!list.length) grid.replaceChildren(h('p', { className: 'desc' }, 'No emojis match.'));
    };
    q.addEventListener('input', draw); draw();
    el.append(q, tabs, h('div', { className: 'row' }, tray, h('button', { onclick: async () => { msg.textContent = (await copyText(tray.value)) ? 'Copied tray' : 'Copy blocked'; } }, 'Copy all'), h('button', { onclick: () => { tray.value = ''; } }, 'Clear'), msg), grid);
  },
});

const UBLOCKS = [['Basic Latin', 0x20, 0x7f], ['Latin-1 Supplement', 0xa0, 0xff], ['Latin Extended-A', 0x100, 0x17f], ['Greek and Coptic', 0x370, 0x3ff], ['Cyrillic', 0x400, 0x4ff], ['Hebrew', 0x590, 0x5ff], ['Arabic', 0x600, 0x6ff],
  ['General Punctuation', 0x2000, 0x206f], ['Superscripts and Subscripts', 0x2070, 0x209f], ['Currency Symbols', 0x20a0, 0x20cf], ['Letterlike Symbols', 0x2100, 0x214f], ['Number Forms', 0x2150, 0x218f], ['Arrows', 0x2190, 0x21ff],
  ['Mathematical Operators', 0x2200, 0x22ff], ['Miscellaneous Technical', 0x2300, 0x23ff], ['Box Drawing', 0x2500, 0x257f], ['Block Elements', 0x2580, 0x259f], ['Geometric Shapes', 0x25a0, 0x25ff],
  ['Miscellaneous Symbols', 0x2600, 0x26ff], ['Dingbats', 0x2700, 0x27bf], ['Braille Patterns', 0x2800, 0x28ff], ['CJK Symbols and Punctuation', 0x3000, 0x303f], ['Hiragana', 0x3040, 0x309f], ['Katakana', 0x30a0, 0x30ff],
  ['Hangul Syllables (start)', 0xac00, 0xacff], ['Private Use / Specials', 0xfff0, 0xffff], ['Mathematical Alphanumeric Symbols', 0x1d400, 0x1d4ff], ['Mahjong & Playing Cards', 0x1f000, 0x1f0ff], ['Emoticons', 0x1f600, 0x1f64f], ['Miscellaneous Symbols and Pictographs', 0x1f300, 0x1f3ff]];
tools.push({
  id: 'unicode-character-map', cat: 'Text Fun', title: 'Unicode Character Map', desc: 'Browse Unicode blocks or any hex range; click a character to copy it and see its code points.', custom: true,
  render: (el) => {
    const sel = h('select', {}, ...UBLOCKS.map((b, i) => h('option', { value: i }, `${b[0]} (U+${b[1].toString(16).toUpperCase()})`)), h('option', { value: 'c' }, 'Custom range...'));
    const from = h('input', { type: 'text', value: '2190' }), to = h('input', { type: 'text', value: '21FF' }), jump = h('input', { type: 'text', placeholder: 'Jump: U+1F600 or paste a char' });
    const info = h('p', { className: 'desc', style: 'min-height:3em' }), tray = h('input', { type: 'text', placeholder: 'Picked characters' });
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:3px;margin:8px 0' }), pager = h('div', { className: 'row' });
    let lo = 0x20, hi = 0x7f, page = 0;
    const PS = 256;
    const hex = (n) => 'U+' + n.toString(16).toUpperCase().padStart(4, '0');
    const describe = (cp) => {
      const c = String.fromCodePoint(cp), u8 = [...new TextEncoder().encode(c)].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
      return `${hex(cp)}  decimal ${cp}  HTML &#x${cp.toString(16).toUpperCase()};  UTF-8 ${u8}  JS \\u{${cp.toString(16)}}`;
    };
    const draw = () => {
      const pages = Math.max(1, Math.ceil((hi - lo + 1) / PS)); page = Math.min(page, pages - 1);
      const cells = [];
      for (let cp = lo + page * PS; cp <= Math.min(hi, lo + page * PS + PS - 1); cp++) {
        const c = String.fromCodePoint(cp), ok = !/[\p{Cn}\p{Cs}\p{Cc}\p{Co}]/u.test(c);
        cells.push(h('button', { disabled: !ok, title: hex(cp), style: 'font-size:20px;padding:4px 0;min-height:38px;opacity:' + (ok ? 1 : 0.25), onmouseenter: () => { info.textContent = describe(cp); },
          onclick: async () => { tray.value += c; info.textContent = describe(cp) + ((await copyText(c)) ? '  - copied' : ''); } }, ok ? (/\p{M}/u.test(c) ? '◌' + c : c) : ''));
      }
      grid.replaceChildren(...cells);
      pager.replaceChildren(h('button', { disabled: page === 0, onclick: () => { page--; draw(); } }, 'Prev'), h('span', {}, `Page ${page + 1} / ${pages}  (${hex(lo)} - ${hex(hi)})`), h('button', { disabled: page >= pages - 1, onclick: () => { page++; draw(); } }, 'Next'));
    };
    const setBlock = () => { if (sel.value === 'c') { lo = parseInt(from.value, 16); hi = parseInt(to.value, 16); } else { [, lo, hi] = UBLOCKS[+sel.value]; from.value = lo.toString(16).toUpperCase(); to.value = hi.toString(16).toUpperCase(); }
      if (!(lo >= 0 && hi >= lo && hi <= 0x10ffff)) { info.textContent = 'Invalid hex range (0 - 10FFFF).'; return; } page = 0; draw(); };
    sel.addEventListener('change', setBlock);
    for (const x of [from, to]) x.addEventListener('input', () => { sel.value = 'c'; setBlock(); });
    jump.addEventListener('change', () => {
      const v = jump.value.trim(); if (!v) return;
      const cp = /^(u\+)?[0-9a-f]{2,6}$/i.test(v) ? parseInt(v.replace(/^u\+/i, ''), 16) : v.codePointAt(0);
      if (!(cp >= 0 && cp <= 0x10ffff)) { info.textContent = 'Not a valid code point.'; return; }
      const b = UBLOCKS.findIndex(([, a, z]) => cp >= a && cp <= z);
      if (b >= 0) { sel.value = b; setBlock(); } else { lo = cp - (cp % PS); hi = lo + PS - 1; sel.value = 'c'; from.value = lo.toString(16).toUpperCase(); to.value = hi.toString(16).toUpperCase(); page = 0; }
      page = Math.floor((cp - lo) / PS); draw(); info.textContent = describe(cp);
    });
    el.append(h('div', { className: 'opts' }, h('label', {}, 'Block', sel), h('label', {}, 'From (hex)', from), h('label', {}, 'To (hex)', to), h('label', {}, 'Jump', jump)),
      h('div', { className: 'row' }, tray, h('button', { onclick: async () => { info.textContent = (await copyText(tray.value)) ? 'Copied picked characters' : 'Copy blocked'; } }, 'Copy picked'), h('button', { onclick: () => { tray.value = ''; } }, 'Clear')), info, grid, pager);
    setBlock();
  },
});

tools.push({
  id: 'scratchpad-notes', cat: 'Text Fun', title: 'Scratchpad Notes', desc: 'Multiple notes saved in your browser (localStorage only, never uploaded).', custom: true,
  render: (el) => {
    const K = 'freetools.scratchpad.v1';
    let ok = true;
    const load = () => { try { const v = JSON.parse(localStorage.getItem(K)); if (Array.isArray(v) && v.length) return v; } catch { ok = false; } return [{ id: Date.now(), text: '' }]; };
    const save = () => { try { localStorage.setItem(K, JSON.stringify(notes)); status.textContent = 'Saved in this browser.'; } catch { ok = false; status.textContent = 'Storage unavailable: notes last only until you leave this page.'; } };
    let notes = load(), cur = notes[0].id;
    const status = h('span', { className: 'desc' }, ok ? 'Saved in this browser.' : 'Storage unavailable: notes last only until you leave this page.');
    const list = h('div', { style: 'display:flex;flex-direction:column;gap:4px;min-width:180px;max-width:220px' });
    const ta = h('textarea', { style: 'min-height:340px;flex:1' });
    const title = (n) => (n.text.trim().split('\n')[0] || 'Empty note').slice(0, 40);
    const drawList = () => list.replaceChildren(...notes.map((n) => h('button', { style: 'text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;' + (n.id === cur ? 'border-color:var(--ac)' : ''), onclick: () => { cur = n.id; ta.value = n.text; drawList(); } }, title(n))));
    let t; ta.addEventListener('input', () => { notes.find((n) => n.id === cur).text = ta.value; clearTimeout(t); t = setTimeout(save, 300); drawList(); });
    const add = () => { const n = { id: Date.now(), text: '' }; notes.unshift(n); cur = n.id; ta.value = ''; save(); drawList(); ta.focus(); };
    const del = () => { if (notes.length > 1) notes = notes.filter((n) => n.id !== cur); else notes[0].text = ''; cur = notes[0].id; ta.value = notes[0].text; save(); drawList(); };
    const dl = () => { const a = h('a', { href: URL.createObjectURL(new Blob([notes.map((n) => n.text).join('\n\n----------\n\n')], { type: 'text/plain' })), download: 'notes.txt' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    ta.value = notes[0].text; drawList();
    el.append(h('div', { className: 'row' }, h('button', { onclick: add }, 'New note'), h('button', { onclick: del }, 'Delete note'), h('button', { onclick: dl }, 'Download all (.txt)'), status),
      h('div', { style: 'display:flex;gap:12px;align-items:stretch;flex-wrap:wrap' }, list, ta));
  },
});

const PASSAGES = ['The quick brown fox jumps over the lazy dog while the sun sets slowly behind the distant hills.',
  'Programs must be written for people to read, and only incidentally for machines to execute.',
  'A journey of a thousand miles begins with a single step, but it helps to pack a good pair of shoes.',
  'Simplicity is prerequisite for reliability, and the cheapest, fastest and most reliable parts are those that are not there.',
  'It was a bright cold day in April, and the clocks were striking thirteen across the quiet little town.',
  'Typing quickly is useful, but typing accurately is better, because every mistake costs you more time than it saves.'];
tools.push({
  id: 'typing-speed-test', cat: 'Text Fun', title: 'Typing Speed Test', desc: 'Measure words per minute and accuracy. Nothing is stored or sent.', custom: true,
  render: (el) => {
    let text = '', start = 0, done = false, timer = 0, limit = 60;
    const css = sheet('.tt-box{font:20px/1.7 ui-monospace,monospace;padding:12px;border:1px solid var(--bd);border-radius:6px;background:var(--card);user-select:none}.tt-ok{color:light-dark(#0d6b3b,#5fd08f)}.tt-bad{color:#fff;background:#b42318;text-decoration:underline wavy}.tt-cur{border-bottom:2px solid var(--ac)}.tt-stats{display:flex;gap:24px;font-size:18px;margin:8px 0;flex-wrap:wrap}');
    const box = h('div', { className: 'tt-box' }), ta = h('textarea', { 'aria-label': 'Typing area: type the text shown above', style: 'min-height:90px', placeholder: 'Start typing here to begin...', spellcheck: false }), fin = h('p', { role: 'status' });
    const stats = h('div', { className: 'tt-stats' }), dur = h('select', {}, ...['30', '60', '120', 'no limit'].map((v) => h('option', { value: v, selected: v === '60' }, v === 'no limit' ? v : v + ' s')));
    const calc = () => {
      const typed = ta.value, el_ = start ? (Date.now() - start) / 1000 : 0;
      let good = 0; for (let i = 0; i < typed.length; i++) if (typed[i] === text[i]) good++;
      const min = Math.max(el_, 1) / 60;
      return { wpm: start ? Math.round(good / 5 / min) : 0, raw: start ? Math.round(typed.length / 5 / min) : 0, acc: typed.length ? Math.round(100 * good / typed.length) : 100, el: el_ };
    };
    const draw = () => {
      const typed = ta.value, c = calc();
      box.replaceChildren(...Array.from(text, (ch, i) => h('span', { className: i < typed.length ? (typed[i] === ch ? 'tt-ok' : 'tt-bad') : i === typed.length ? 'tt-cur' : '' }, ch)));
      const left = limit ? Math.max(0, limit - c.el) : null;
      stats.replaceChildren(h('span', {}, `WPM: ${c.wpm}`), h('span', {}, `Raw: ${c.raw}`), h('span', {}, `Accuracy: ${c.acc}%`), h('span', {}, left == null ? `Time: ${Math.floor(c.el)} s` : `Left: ${Math.ceil(left)} s`), ...(done ? [h('strong', {}, 'Finished!')] : []));
      fin.textContent = done ? `Finished. ${c.wpm} words per minute, ${c.acc}% accuracy.` : '';
    };
    const finish = () => { done = true; clearInterval(timer); ta.disabled = true; draw(); };
    const reset = () => {
      clearInterval(timer); done = false; start = 0; limit = dur.value === 'no limit' ? 0 : +dur.value; ta.disabled = false; ta.value = '';
      text = PASSAGES[Math.floor(Math.random() * PASSAGES.length)] + ' ' + PASSAGES[Math.floor(Math.random() * PASSAGES.length)]; draw(); ta.focus();
    };
    ta.addEventListener('input', () => {
      if (done) return;
      if (!start) { start = Date.now(); timer = setInterval(() => { if (!el.isConnected) return clearInterval(timer); if (limit && (Date.now() - start) / 1000 >= limit) finish(); else draw(); }, 250); }
      if (ta.value.length >= text.length) { ta.value = ta.value.slice(0, text.length); finish(); } else draw();
    });
    dur.addEventListener('change', reset);
    el.append(css, h('div', { className: 'row' }, h('label', {}, 'Time limit ', dur), h('button', { onclick: reset }, 'New text / restart')), box, ta, stats, fin);
    reset();
  },
});

// =====================================================================
// Reference
// =====================================================================
const CHEAT = [
  ['Heading 1-6', '# H1\n## H2\n###### H6'], ['Bold', '**bold** or __bold__'], ['Italic', '*italic* or _italic_'], ['Bold + italic', '***both***'], ['Strikethrough (GFM)', '~~gone~~'],
  ['Inline code', '`code`'], ['Link', '[text](https://example.com "Title")'], ['Image', '![alt](img.png "Title")'], ['Autolink', '<https://example.com>'], ['Reference link', '[text][id]\n\n[id]: https://example.com'],
  ['Blockquote', '> quoted\n> text'], ['Bullet list', '- one\n- two\n  - nested'], ['Numbered list', '1. first\n2. second'], ['Task list (GFM)', '- [x] done\n- [ ] todo'],
  ['Code block', '```js\nconst x = 1;\n```'], ['Horizontal rule', '---'], ['Table (GFM)', '| A | B |\n|:--|--:|\n| 1 | 2 |'], ['Line break', 'end of line with two spaces  \nnext line'], ['Escape', '\\*not italic\\*'],
];
tools.push({
  id: 'markdown-cheatsheet', cat: 'Reference', title: 'Markdown Cheatsheet', desc: 'Every common Markdown construct with its rendered result.',
  inputs: 0, sample: '',
  run: () => ({ html: mdDoc(`<h1>Markdown cheatsheet</h1><table><thead><tr><th>Element</th><th>Syntax</th><th>Result</th></tr></thead><tbody>${CHEAT.map(([n, src]) =>
    `<tr><td>${esc(n)}</td><td><pre style="margin:0"><code>${esc(src)}</code></pre></td><td>${markdownToHtml(src, {})}</td></tr>`).join('')}</tbody></table>`, 'Markdown cheatsheet') }),
});

const L1 = 'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(' ');
const L1D = { nbsp: 'non-breaking space', iexcl: 'inverted exclamation mark', cent: 'cent sign', pound: 'pound sign', curren: 'currency sign', yen: 'yen sign', brvbar: 'broken bar', sect: 'section sign', uml: 'diaeresis', copy: 'copyright sign', ordf: 'feminine ordinal', laquo: 'left double angle quote', not: 'not sign', shy: 'soft hyphen', reg: 'registered sign', macr: 'macron', deg: 'degree sign', plusmn: 'plus-minus sign', sup2: 'superscript two', sup3: 'superscript three', acute: 'acute accent', micro: 'micro sign', para: 'pilcrow (paragraph sign)', middot: 'middle dot', cedil: 'cedilla', sup1: 'superscript one', ordm: 'masculine ordinal', raquo: 'right double angle quote', frac14: 'one quarter', frac12: 'one half', frac34: 'three quarters', iquest: 'inverted question mark', times: 'multiplication sign', divide: 'division sign', szlig: 'sharp s (eszett)', AElig: 'capital ligature AE', aelig: 'small ligature ae', ETH: 'capital eth', eth: 'small eth', THORN: 'capital thorn', thorn: 'small thorn', Oslash: 'capital O with stroke', oslash: 'small o with stroke', yuml: 'small y with diaeresis' };
const ACC = { grave: 'grave', acute: 'acute', circ: 'circumflex', tilde: 'tilde', uml: 'diaeresis', ring: 'ring above', cedil: 'cedilla' };
const GREEK = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho - Sigma Tau Upsilon Phi Chi Psi Omega'.split(' ');
const ENT = [['quot', 34, 'quotation mark'], ['amp', 38, 'ampersand'], ['apos', 39, 'apostrophe'], ['lt', 60, 'less-than sign'], ['gt', 62, 'greater-than sign']];
L1.forEach((n, i) => { const m = n.match(/^([A-Za-z])(grave|acute|circ|tilde|uml|ring|cedil)$/); ENT.push([n, 160 + i, L1D[n] || (m ? `${/[A-Z]/.test(m[1]) ? 'capital' : 'small'} ${m[1]} with ${ACC[m[2]]}` : n)]); });
GREEK.forEach((g, i) => { if (g !== '-') { ENT.push([g, 913 + i, `Greek capital letter ${g.toLowerCase()}`]); ENT.push([g.toLowerCase(), 945 + i, `Greek small letter ${g.toLowerCase()}`]); } });
ENT.push(['sigmaf', 962, 'Greek small final sigma']);
'OElig,338,capital ligature OE;oelig,339,small ligature oe;Scaron,352,capital S with caron;scaron,353,small s with caron;Yuml,376,capital Y with diaeresis;fnof,402,florin (f with hook);circ,710,modifier circumflex;tilde,732,small tilde;ensp,8194,en space;emsp,8195,em space;thinsp,8201,thin space;zwnj,8204,zero width non-joiner;zwj,8205,zero width joiner;lrm,8206,left-to-right mark;rlm,8207,right-to-left mark;ndash,8211,en dash;mdash,8212,em dash;lsquo,8216,left single quote;rsquo,8217,right single quote;sbquo,8218,single low-9 quote;ldquo,8220,left double quote;rdquo,8221,right double quote;bdquo,8222,double low-9 quote;dagger,8224,dagger;Dagger,8225,double dagger;bull,8226,bullet;hellip,8230,horizontal ellipsis;permil,8240,per mille sign;prime,8242,prime (minutes, feet);Prime,8243,double prime (seconds, inches);lsaquo,8249,single left angle quote;rsaquo,8250,single right angle quote;oline,8254,overline;frasl,8260,fraction slash;euro,8364,euro sign;image,8465,black-letter I (imaginary part);weierp,8472,script P (Weierstrass);real,8476,black-letter R (real part);trade,8482,trade mark sign;alefsym,8501,alef symbol;larr,8592,leftwards arrow;uarr,8593,upwards arrow;rarr,8594,rightwards arrow;darr,8595,downwards arrow;harr,8596,left right arrow;crarr,8629,carriage return arrow;lArr,8656,leftwards double arrow;uArr,8657,upwards double arrow;rArr,8658,rightwards double arrow;dArr,8659,downwards double arrow;hArr,8660,left right double arrow;forall,8704,for all;part,8706,partial differential;exist,8707,there exists;empty,8709,empty set;nabla,8711,nabla;isin,8712,element of;notin,8713,not an element of;ni,8715,contains as member;prod,8719,n-ary product;sum,8721,n-ary summation;minus,8722,minus sign;lowast,8727,asterisk operator;radic,8730,square root;prop,8733,proportional to;infin,8734,infinity;ang,8736,angle;and,8743,logical and;or,8744,logical or;cap,8745,intersection;cup,8746,union;int,8747,integral;there4,8756,therefore;sim,8764,tilde operator;cong,8773,approximately equal to;asymp,8776,almost equal to;ne,8800,not equal to;equiv,8801,identical to;le,8804,less-than or equal to;ge,8805,greater-than or equal to;sub,8834,subset of;sup,8835,superset of;nsub,8836,not a subset of;sube,8838,subset of or equal to;supe,8839,superset of or equal to;oplus,8853,circled plus;otimes,8855,circled times;perp,8869,up tack (perpendicular);sdot,8901,dot operator;lceil,8968,left ceiling;rceil,8969,right ceiling;lfloor,8970,left floor;rfloor,8971,right floor;lang,10216,left angle bracket;rang,10217,right angle bracket;loz,9674,lozenge;spades,9824,black spade suit;clubs,9827,black club suit;hearts,9829,black heart suit;diams,9830,black diamond suit;check,10003,check mark;star,9734,white star;starf,9733,black star;phone,9742,telephone;female,9792,female sign;male,9794,male sign;hyphen,8208,hyphen;numsp,8199,figure space;hairsp,8202,hair space;Tab,9,tab;NewLine,10,newline;excl,33,exclamation mark;num,35,number sign;dollar,36,dollar sign;percnt,37,percent sign;lpar,40,left parenthesis;rpar,41,right parenthesis;ast,42,asterisk;plus,43,plus sign;comma,44,comma;period,46,full stop;sol,47,solidus (slash);colon,58,colon;semi,59,semicolon;equals,61,equals sign;quest,63,question mark;commat,64,at sign;lsqb,91,left square bracket;bsol,92,backslash;rsqb,93,right square bracket;lowbar,95,low line (underscore);grave,96,grave accent;lbrace,123,left curly bracket;verbar,124,vertical line;rbrace,125,right curly bracket'.split(';').forEach((x) => { const [n, c, d] = x.split(','); ENT.push([n, +c, d]); });
tools.push({
  id: 'html-entities-reference', cat: 'Reference', title: 'HTML Entities Reference', desc: 'Searchable list of named and numeric HTML entities. Type a name, character, number or description.',
  placeholder: ['Filter, e.g. arrow, copy, 169, euro, ©  (blank = all)'], sample: 'arrow',
  run: ([q]) => {
    const s = q.trim().toLowerCase();
    const rows = ENT.filter(([n, c, d]) => !s || n.toLowerCase().includes(s) || d.toLowerCase().includes(s) || String(c) === s || ('u+' + c.toString(16)) === s || String.fromCodePoint(c) === q.trim() || ('x' + c.toString(16)) === s || ('&#' + c) === s || ('&' + n.toLowerCase() + ';') === s);
    if (!rows.length) return 'No matching entities.';
    const disp = (c) => (c < 33 || c === 160 || c === 173 || (c >= 8192 && c <= 8207) ? '·' : String.fromCodePoint(c));
    return `${rows.length} entit${rows.length === 1 ? 'y' : 'ies'}\n\nChar  Named        Decimal    Hex        Description\n` + rows.map(([n, c, d]) =>
      `${disp(c).padEnd(5)} ${('&' + n + ';').padEnd(12)} ${('&#' + c + ';').padEnd(10)} ${('&#x' + c.toString(16).toUpperCase() + ';').padEnd(10)} ${d}`).join('\n');
  },
});

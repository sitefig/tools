// Tools from free-browser-tools.md, batch 09. See TOOLS.md for the contract.
import { _qr } from './gen.js';
const T = [];
const num = (id, label, def) => ({ id, label, type: 'number', def });
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const chk = (id, label, def) => ({ id, label, type: 'checkbox', def });
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : a));
const escX = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const lines = (s) => s.split(/\r?\n/);

// ---------- crypto-random helpers ----------
function randBig(maxExcl) {
  if (maxExcl <= 0n) throw new Error('Empty range');
  const bits = maxExcl.toString(2).length, bytes = Math.ceil(bits / 8), mask = (1n << BigInt(bits)) - 1n;
  for (;;) {
    const b = crypto.getRandomValues(new Uint8Array(bytes));
    let v = 0n;
    for (const x of b) v = (v << 8n) | BigInt(x);
    v &= mask;
    if (v < maxExcl) return v;
  }
}
const randInt = (n) => Number(randBig(BigInt(n)));

// ---------- JavaScript regex parser (shared by the diagram and the ReDoS checker) ----------
const ESC_NAMES = { d: 'digit', D: 'non-digit', w: 'word char', W: 'non-word char', s: 'whitespace', S: 'non-whitespace', t: 'tab', n: 'newline', r: 'carriage return', f: 'form feed', v: 'vertical tab', 0: 'NUL' };
function parseRegex(src, flags = '') {
  try { new RegExp(src, flags); } catch (e) { throw new Error('Invalid regex: ' + e.message.replace(/^Invalid regular expression: /, '')); }
  let i = 0, groups = 0;
  const names = [];
  const ptn = (s, e) => src.slice(s, e);
  function atomEscape(inClass) {
    const s = i; i++; // backslash
    const c = src[i];
    if (c === undefined) return { t: 'lit', v: '\\', s, e: i };
    if ('dDwWsS'.includes(c)) { i++; return { t: 'cls', name: ESC_NAMES[c], s, e: i }; }
    if (!inClass && (c === 'b' || c === 'B')) { i++; return { t: 'anchor', name: c === 'b' ? 'word boundary' : 'not a word boundary', s, e: i }; }
    if (inClass && c === 'b') { i++; return { t: 'lit', v: 'backspace', named: true, s, e: i }; }
    if (!inClass && c === 'k' && src[i + 1] === '<') { const j = src.indexOf('>', i); i = j + 1; return { t: 'backref', name: src.slice(s + 3, j), s, e: i }; }
    if (!inClass && /[1-9]/.test(c)) { let j = i; while (/\d/.test(src[j] || '')) j++; const n = +src.slice(i, j); i = j; return { t: 'backref', name: '#' + n, s, e: i }; }
    if (c === 'u' && src[i + 1] === '{') { const j = src.indexOf('}', i); i = j + 1; return { t: 'lit', v: 'U+' + src.slice(s + 3, j).toUpperCase(), named: true, s, e: i }; }
    if (c === 'u') { i += 5; return { t: 'lit', v: 'U+' + src.slice(s + 2, i).toUpperCase(), named: true, s, e: i }; }
    if (c === 'x') { i += 3; return { t: 'lit', v: 'U+00' + src.slice(s + 2, i).toUpperCase(), named: true, s, e: i }; }
    if (c === 'c') { i += 2; return { t: 'lit', v: 'ctrl-' + src[s + 2], named: true, s, e: i }; }
    if (c === 'p' || c === 'P') { const j = src.indexOf('}', i); i = j + 1; return { t: 'cls', name: (c === 'P' ? 'not ' : '') + 'unicode ' + src.slice(s + 3, j), s, e: i }; }
    i++;
    if (ESC_NAMES[c]) return { t: 'lit', v: ESC_NAMES[c], named: true, s, e: i };
    return { t: 'lit', v: c, s, e: i };
  }
  function parseClass() {
    const s = i; i++;
    let neg = false;
    if (src[i] === '^') { neg = true; i++; }
    const items = [];
    const one = () => { if (src[i] === '\\') { const a = atomEscape(true); return a.t === 'cls' ? a.name : a.v; } return src[i++]; };
    while (i < src.length && src[i] !== ']') {
      const a = one();
      if (src[i] === '-' && src[i + 1] !== ']' && i + 1 < src.length) { i++; const b = one(); items.push(a + '-' + b); } else items.push(a);
    }
    i++;
    return { t: 'set', neg, items, s, e: i };
  }
  function parseAtom() {
    const s = i, c = src[i];
    if (c === '(') {
      i++;
      let kind = 'capture', name = '', idx = 0;
      if (src.startsWith('?:', i)) { kind = 'non-capturing'; i += 2; }
      else if (src.startsWith('?=', i)) { kind = 'positive lookahead'; i += 2; }
      else if (src.startsWith('?!', i)) { kind = 'negative lookahead'; i += 2; }
      else if (src.startsWith('?<=', i)) { kind = 'positive lookbehind'; i += 3; }
      else if (src.startsWith('?<!', i)) { kind = 'negative lookbehind'; i += 3; }
      else if (src.startsWith('?<', i)) { const j = src.indexOf('>', i); name = src.slice(i + 2, j); i = j + 1; kind = 'named'; idx = ++groups; names.push(name); }
      else idx = ++groups;
      const body = parseAlt();
      if (src[i] !== ')') throw new Error('Invalid regex: unterminated group');
      i++;
      return { t: 'group', kind, name, idx, body, s, e: i };
    }
    if (c === '[') return parseClass();
    if (c === '.') { i++; return { t: 'any', s, e: i }; }
    if (c === '^') { i++; return { t: 'anchor', name: 'start', s, e: i }; }
    if (c === '$') { i++; return { t: 'anchor', name: 'end', s, e: i }; }
    if (c === '\\') return atomEscape(false);
    i++;
    return { t: 'lit', v: c, s, e: i };
  }
  function quant(atom) {
    const s = i, c = src[i];
    let min, max;
    if (c === '*') { min = 0; max = Infinity; i++; }
    else if (c === '+') { min = 1; max = Infinity; i++; }
    else if (c === '?') { min = 0; max = 1; i++; }
    else if (c === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(i));
      if (!m) return atom;
      min = +m[1]; max = m[2] === undefined ? min : m[3] === '' ? Infinity : +m[3]; i += m[0].length;
    } else return atom;
    let lazy = false;
    if (src[i] === '?') { lazy = true; i++; }
    return { t: 'q', min, max, lazy, body: atom, s: atom.s, e: i, qs: s };
  }
  function parseSeq() {
    const items = [];
    while (i < src.length && src[i] !== '|' && src[i] !== ')') items.push(quant(parseAtom()));
    return { t: 'seq', items };
  }
  function parseAlt() {
    const alts = [parseSeq()];
    while (src[i] === '|') { i++; alts.push(parseSeq()); }
    return alts.length > 1 ? { t: 'alt', items: alts } : alts[0];
  }
  const ast = parseAlt();
  if (i < src.length) throw new Error('Invalid regex: unmatched )');
  return ast;
}
// accept /pattern/flags or a bare pattern
function splitRegex(s, flagsOpt) {
  s = s.replace(/^\s+|\s+$/g, '');
  const m = /^\/([\s\S]*)\/([a-z]*)$/.exec(s);
  return m ? { src: m[1], flags: (m[2] + (flagsOpt || '')).replace(/(.)(?=.*\1)/g, '') } : { src: s, flags: flagsOpt || '' };
}

// ---------- railroad layout ----------
function railroadSvg(src, ast) {
  const FS = 7.4;
  const line = (x1, x2, y) => (x2 > x1 ? `<path d="M${x1} ${y}H${x2}"/>` : '');
  const box = (text, cls) => {
    const w = Math.max(26, Math.ceil(text.length * FS) + 16);
    return { w, up: 13, down: 13, draw: (x, y) => `<g class="${cls}"><rect x="${x}" y="${y - 13}" width="${w}" height="26" rx="${cls === 'lit' ? 3 : 11}"/><text x="${x + w / 2}" y="${y + 4}" text-anchor="middle">${escX(text)}</text></g>` };
  };
  const vis = (v) => v.replace(/ /g, '␣');
  const trunc = (s) => (s.length > 44 ? s.slice(0, 43) + '…' : s);
  function seq(items) {
    if (!items.length) return { w: 24, up: 0, down: 0, draw: (x, y) => line(x, x + 24, y) };
    const G = 14, w = items.reduce((a, b) => a + b.w, 0) + G * (items.length - 1);
    return {
      w, up: Math.max(...items.map((n) => n.up)), down: Math.max(...items.map((n) => n.down)),
      draw: (x, y) => { let o = ''; items.forEach((n, k) => { o += n.draw(x, y); x += n.w; if (k < items.length - 1) { o += line(x, x + G, y); x += G; } }); return o; },
    };
  }
  function alt(items) {
    const P = 22, mw = Math.max(...items.map((n) => n.w)), offs = [0];
    for (let k = 1; k < items.length; k++) offs.push(offs[k - 1] + items[k - 1].down + 10 + items[k].up);
    const w = mw + 2 * P;
    return {
      w, up: items[0].up, down: offs[offs.length - 1] + items[items.length - 1].down,
      draw: (x, y) => {
        let o = '';
        items.forEach((n, k) => {
          const yy = y + offs[k], bx = x + P + (mw - n.w) / 2;
          o += n.draw(bx, yy) + line(x + P, bx, yy) + line(bx + n.w, x + w - P, yy);
          if (k) o += `<path d="M${x} ${y}C${x + P / 2} ${y} ${x + P / 2} ${yy} ${x + P} ${yy}"/><path d="M${x + w} ${y}C${x + w - P / 2} ${y} ${x + w - P / 2} ${yy} ${x + w - P} ${yy}"/>`;
        });
        return o + line(x, x + P, y) + line(x + w - P, x + w, y);
      },
    };
  }
  function times(q) {
    const a = q.min, b = q.max;
    if (b === Infinity) return a <= 1 ? '' : `${a}+ times`;
    if (a === b) return `${a} times`;
    return `${a}–${b} times`;
  }
  function quantNode(q, c) {
    if (q.max === 0) return box('never (x{0})', 'note');
    const bypass = q.min === 0, loop = q.max > 1;
    if (!bypass && !loop) return c;
    const P = 18, w = c.w + 2 * P;
    let label = loop ? times(q) : '';
    if (q.lazy) label = (label ? label + ' ' : '') + '(lazy)';
    return {
      w, up: c.up + (bypass ? 18 : 0) + (!loop && label ? 12 : 0), down: c.down + (loop ? 22 + (label ? 14 : 0) : 0),
      draw: (x, y) => {
        let o = line(x, x + P, y) + c.draw(x + P, y) + line(x + P + c.w, x + w, y);
        if (bypass) { const yb = y - c.up - 12; o += `<path d="M${x + 6} ${y}Q${x + 6} ${yb} ${x + 16} ${yb}H${x + w - 16}Q${x + w - 6} ${yb} ${x + w - 6} ${y}"/>`; if (!loop && label) o += `<text class="lbl" x="${x + w / 2}" y="${yb - 4}" text-anchor="middle">${escX(label)}</text>`; }
        if (loop) { const yl = y + c.down + 12; o += `<path marker-end="url(#ar)" d="M${x + w - 6} ${y}Q${x + w - 6} ${yl} ${x + w - 16} ${yl}H${x + 16}Q${x + 6} ${yl} ${x + 6} ${y}"/>`; if (label) o += `<text class="lbl" x="${x + w / 2}" y="${yl + 14}" text-anchor="middle">${escX(label)}</text>`; }
        return o;
      },
    };
  }
  function groupNode(g, c) {
    const label = g.kind === 'non-capturing' ? 'non-capturing group' : g.kind === 'capture' ? `group #${g.idx}` : g.kind === 'named' ? `group #${g.idx} "${g.name}"` : g.kind;
    const lw = Math.ceil(label.length * 6.6) + 12, inner = c.w + 24, w = Math.max(inner, lw + 8);
    const look = /look/.test(g.kind);
    return {
      w, up: c.up + 26, down: c.down + 10,
      draw: (x, y) => {
        const cx = x + (w - c.w) / 2;
        return `<rect class="grp${look ? ' look' : ''}" x="${x}" y="${y - c.up - 22}" width="${w}" height="${c.up + c.down + 32}" rx="6"/><text class="lbl" x="${x + 6}" y="${y - c.up - 8}">${escX(label)}</text>` + line(x, cx, y) + c.draw(cx, y) + line(cx + c.w, x + w, y);
      },
    };
  }
  function build(n) {
    switch (n.t) {
      case 'seq': {
        const out = [];
        for (const it of n.items) {
          const last = out[out.length - 1];
          if (it.t === 'lit' && !it.named && last && last.lit !== undefined) { last.lit += it.v; continue; }
          out.push(it.t === 'lit' && !it.named ? { lit: it.v } : { node: build(it) });
        }
        return seq(out.map((o) => (o.node ? o.node : box('"' + trunc(vis(o.lit)) + '"', 'lit'))));
      }
      case 'alt': return alt(n.items.map(build));
      case 'q': { const b = n.body; const c = b.t === 'lit' && !b.named ? box('"' + vis(b.v) + '"', 'lit') : build(b); return quantNode(n, c); }
      case 'group': return groupNode(n, build(n.body));
      case 'lit': return n.named ? box(n.v, 'cls') : box('"' + vis(n.v) + '"', 'lit');
      case 'cls': return box(n.name, 'cls');
      case 'set': return box(trunc((n.neg ? 'none of: ' : 'one of: ') + (n.items.length ? n.items.map((x) => (x.length === 1 ? vis(x) : x)).join(' ') : '(nothing)')), 'cls');
      case 'any': return box('any char', 'cls');
      case 'anchor': return box(n.name, 'anc');
      case 'backref': return box('same as ' + n.name, 'cls');
      default: return box('?', 'cls');
    }
  }
  const body = build(ast), M = 12, E = 10;
  const W = body.w + 2 * (E + M) + 20, H = body.up + body.down + 2 * M + 28, y = M + body.up + 14;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Railroad diagram of the regular expression ${escX(src)}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="12"><defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" class="fill"/></marker></defs>` +
    `<circle class="end" cx="${M + 6}" cy="${y}" r="5"/>` + line(M + 11, M + 11 + E, y) + body.draw(M + 11 + E, y) + line(M + 11 + E + body.w, M + 11 + 2 * E + body.w, y) + `<circle class="end" cx="${M + 16 + 2 * E + body.w}" cy="${y}" r="5"/></svg>`;
  return svg;
}
const DIAGRAM_CSS = `:root{color-scheme:light dark;--fg:#1a1a1a;--bg:#fff;--line:#555;--lit:#e8f0fe;--cls:#fdf0d5;--anc:#e3f4e6;--grp:#777}@media(prefers-color-scheme:dark){:root{--fg:#eee;--bg:#161616;--line:#aaa;--lit:#1f3a5f;--cls:#5a4514;--anc:#1d4a2b;--grp:#999}}body{margin:8px;background:var(--bg);color:var(--fg);font-family:system-ui,sans-serif}svg{max-width:none}path{fill:none;stroke:var(--line);stroke-width:1.6}rect{stroke:var(--line);stroke-width:1.2}.lit rect{fill:var(--lit)}.cls rect{fill:var(--cls)}.anc rect{fill:var(--anc)}.note rect{fill:none;stroke-dasharray:3}rect.grp{fill:none;stroke:var(--grp);stroke-dasharray:5 3}rect.look{stroke-dasharray:2 3}text{fill:var(--fg)}.lbl{font-size:10.5px;fill:var(--fg);opacity:.8}.fill{fill:var(--line);stroke:none}circle.end{fill:var(--line)}`;

T.push({
  id: 'regex-railroad-diagram', cat: 'Regex', title: 'Regex Railroad Diagram Generator',
  desc: 'Draw a JavaScript regular expression as a railroad (syntax) diagram: alternatives, optional parts, loops, groups and lookarounds. SVG, drawn in your browser.',
  inputs: 1, labels: ['Regular expression (bare, or /pattern/flags)'], placeholder: ['^(?:https?:\\/\\/)?([\\w.-]+)(?::(\\d{2,5}))?\\/?$'],
  sample: '^(?:https?://)?([\\w.-]+)(?::(\\d{2,5}))?(/[^\\s?#]*)?$',
  opts: [txt('flags', 'Extra flags (optional)', '')],
  run: ([s], o) => {
    const { src, flags } = splitRegex(s, o.flags);
    if (!src) throw new Error('Enter a regular expression');
    if (src.length > 2000) throw new Error('Pattern is too long (2000 characters max)');
    const ast = parseRegex(src, flags);
    return { html: `<!doctype html><meta charset="utf-8"><title>Railroad diagram</title><style>${DIAGRAM_CSS}</style>${railroadSvg(src, ast)}` };
  },
});

// ---------- regex test runner ----------
T.push({
  id: 'regex-test-runner', cat: 'Regex', title: 'Regex Test Cases Runner (Should Match / Should Not Match)',
  desc: 'Run one JavaScript regex against a list of strings that must match and a list that must not. Each line gets pass or fail, with a summary.',
  inputs: 2, labels: ['Regex (bare, or /pattern/flags)', 'Test cases, one per line: "+ text" must match, "- text" must NOT match'],
  sample: '^[A-Z]{2}-\\d{4}$', sample2: '+ AB-1234\n+ ZZ-0001\n- ab-1234\n- AB-12345\n- AB 1234',
  opts: [sel('mode', 'Match mode', ['anywhere in the string', 'whole string']), txt('flags', 'Extra flags', '')],
  run: ([pat, cases], o) => {
    const { src, flags } = splitRegex(pat, o.flags);
    if (!src) throw new Error('Enter a regular expression');
    const f = flags.replace(/[gy]/g, '');
    let re;
    try { re = new RegExp(o.mode === 'whole string' ? `^(?:${src})$` : src, f); } catch (e) { throw new Error('Invalid regex: ' + e.message.replace(/^Invalid regular expression: /, '')); }
    const cs = lines(cases || '').filter((l) => /^[+-] ?/.test(l)).slice(0, 2000);
    if (!cs.length) throw new Error('Add test lines that start with "+ " (should match) or "- " (should not match)');
    let pass = 0, fail = 0;
    const out = cs.map((l) => {
      const want = l[0] === '+', text = l.replace(/^[+-] ?/, ''), got = re.test(text), ok = got === want;
      ok ? pass++ : fail++;
      return `${ok ? 'PASS' : 'FAIL'}  ${want ? 'should match    ' : 'should not match'}  ${got ? 'matched   ' : 'no match  '} ${JSON.stringify(text)}`;
    });
    return `${fail ? fail + ' FAILED' : 'All passed'}: ${pass} passed, ${fail} failed of ${pass + fail}\nPattern: /${src}/${f}  (${o.mode})\n\n` + out.join('\n') + '\n\nThis runs the JavaScript regex engine. Other engines (PCRE, Python, Java) differ in syntax and edge cases. A pattern with catastrophic backtracking can freeze the tab; run the ReDoS checker first if unsure.';
  },
});

// ---------- ReDoS static checker ----------
const SAMPLE_CHARS = (() => { const a = []; for (let c = 0; c < 128; c++) a.push(String.fromCharCode(c)); return a.concat(['é', 'ß', 'а', '中', '\u{1F600}', ' ', ' ', '٠']); })();
function charSet(srcSlice, flags) {
  let re;
  try { re = new RegExp('^(?:' + srcSlice + ')$', flags.replace(/[gy]/g, '')); } catch { return null; }
  return SAMPLE_CHARS.map((c) => re.test(c));
}
const FULL = SAMPLE_CHARS.map(() => true), NONE = SAMPLE_CHARS.map(() => false);
const union = (a, b) => a.map((v, k) => v || b[k]);
const overlaps = (a, b) => a.some((v, k) => v && b[k]);
function analyseRegex(src, flags) {
  const ast = parseRegex(src, flags), found = [];
  const memo = new Map();
  function first(n) {
    if (memo.has(n)) return memo.get(n);
    let r;
    switch (n.t) {
      case 'lit': case 'cls': case 'set': case 'any': r = { set: charSet(src.slice(n.s, n.e), flags) || FULL, nullable: false }; break;
      case 'anchor': r = { set: NONE, nullable: true }; break;
      case 'backref': r = { set: FULL, nullable: true }; break;
      case 'q': { const f = first(n.body); r = { set: f.set, nullable: f.nullable || n.min === 0 }; break; }
      case 'group': r = /look/.test(n.kind) ? { set: NONE, nullable: true } : first(n.body); break;
      case 'alt': { let s = NONE, nl = false; for (const x of n.items) { const f = first(x); s = union(s, f.set); nl = nl || f.nullable; } r = { set: s, nullable: nl }; break; }
      case 'seq': { let s = NONE, nl = true; for (const x of n.items) { const f = first(x); s = union(s, f.set); if (!f.nullable) { nl = false; break; } } r = { set: s, nullable: nl }; break; }
      default: r = { set: FULL, nullable: true };
    }
    memo.set(n, r);
    return r;
  }
  const unb = (n) => n.t === 'q' && n.max === Infinity;
  const tails = (n) => { // unbounded quantifiers reachable at the end of n
    if (n.t === 'q') return unb(n) ? [n] : tails(n.body);
    if (n.t === 'group') return /look/.test(n.kind) ? [] : tails(n.body);
    if (n.t === 'alt') return n.items.flatMap(tails);
    if (n.t === 'seq') { const out = []; for (let k = n.items.length - 1; k >= 0; k--) { out.push(...tails(n.items[k])); if (!first(n.items[k]).nullable) break; } return out; }
    return [];
  };
  const innerBranch = (n) => { while (n.t === 'group' && !/look/.test(n.kind)) n = n.body; return n.t === 'seq' && n.items.length === 1 ? innerBranch(n.items[0]) : n; };
  const pump = (set) => { const c = SAMPLE_CHARS.find((ch, k) => set[k] && /[0-9A-Za-z]/.test(ch)) ?? SAMPLE_CHARS.find((ch, k) => set[k] && ch > ' ' && ch < '\x7f') ?? 'a'; return c; };
  const add = (n, kind, why, set) => found.push({ s: n.s, e: n.e, kind, why, pump: set ? pump(set) : null });
  function visit(n, inLoop) {
    if (n.t === 'q') {
      const loopy = n.max > 1;
      if (unb(n)) {
        const f = first(n.body);
        for (const inner of tails(n.body)) {
          if (inner === n) continue;
          const g = first(inner.body);
          if (!f.nullable && overlaps(g.set, f.set)) { add(n, 'nested quantifier', 'A repeated group ends with a repeated part that can match the same characters the group starts with, so one run of text can be split many ways.', union(g.set, f.set)); break; }
        }
      }
      if (loopy) {
        const b = innerBranch(n.body);
        if (b.t === 'alt') {
          const fs = b.items.map(first);
          outer: for (let x = 0; x < fs.length; x++) for (let y = x + 1; y < fs.length; y++) if (overlaps(fs[x].set, fs[y].set)) { add(n, 'overlapping alternatives', 'Two alternatives inside a repeated group can start with the same character, so the engine may try each way to split the text.', fs[x].set.map((v, k) => v && fs[y].set[k])); break outer; }
        }
      }
      visit(n.body, inLoop || loopy);
    } else if (n.t === 'seq') {
      const qs = n.items.map((it, k) => ({ it, k })).filter((x) => unb(x.it));
      for (let a = 0; a < qs.length; a++) for (let b = a + 1; b < qs.length; b++) {
        const between = n.items.slice(qs[a].k + 1, qs[b].k);
        if (!between.every((x) => first(x).nullable)) continue;
        const sa = first(qs[a].it).set, sb = first(qs[b].it).set;
        if (overlaps(sa, sb)) found.push({ s: qs[a].it.s, e: qs[b].it.e, kind: inLoop ? 'adjacent overlapping quantifiers inside a repeat' : 'adjacent overlapping quantifiers', why: inLoop ? 'Two repeated parts that match the same characters sit side by side inside another repeat. This can grow exponentially.' : 'Two repeated parts that match the same characters sit side by side. Failing inputs take polynomial time (quadratic or worse).', pump: pump(sa.map((v, k) => v && sb[k])), poly: !inLoop });
      }
      n.items.forEach((x) => visit(x, inLoop));
    } else if (n.t === 'alt') n.items.forEach((x) => visit(x, inLoop));
    else if (n.t === 'group') visit(n.body, inLoop);
  }
  visit(ast, false);
  const seen = new Set();
  return found.filter((f) => { const k = f.s + ':' + f.e + f.kind; if (seen.has(k)) return false; seen.add(k); return true; });
}
T.push({
  id: 'redos-checker', cat: 'Regex', title: 'ReDoS Checker: Static Scan for Catastrophic Backtracking',
  desc: 'Scan a JavaScript regex for patterns that can backtrack catastrophically: nested quantifiers, overlapping alternatives, adjacent overlapping repeats. A review aid, not a proof.',
  inputs: 1, labels: ['Regular expression(s), one per line (bare, or /pattern/flags)'], sample: '^(a+)+$\n^(\\w+\\s?)*$\n^(a|aa)+$\n\\d+\\d+x\n^[a-z0-9._-]+@[a-z0-9.-]+\\.[a-z]{2,}$',
  opts: [txt('flags', 'Extra flags for every line', '')],
  run: ([s], o) => {
    const ls = lines(s).map((l) => l.trim()).filter(Boolean).slice(0, 200);
    if (!ls.length) throw new Error('Enter a regular expression');
    const out = [];
    for (const l of ls) {
      const { src, flags } = splitRegex(l, o.flags);
      let res;
      try { res = analyseRegex(src, flags); } catch (e) { out.push(`${l}\n  ERROR: ${e.message}\n`); continue; }
      if (!res.length) { out.push(`${l}\n  No known risky shape found (this is a heuristic, not a guarantee).\n`); continue; }
      out.push(`${l}\n` + res.map((f) => `  REVIEW (${f.kind}) at ${f.s}-${f.e}: ${JSON.stringify(src.slice(f.s, f.e))}\n    ${f.why}\n    To test it, try the character ${JSON.stringify(f.pump ?? 'a')} repeated 25 to 40 times followed by one character that makes the whole match fail.`).join('\n') + '\n');
    }
    return out.join('\n') + '\nHow this works: the pattern is parsed, then each repeated group, alternation and neighbouring repeat is checked for overlapping character sets (sampled over ASCII and a few other characters). It can miss risky patterns (backreferences, lookarounds, complex nesting) and can flag safe ones. Treat every line as "review". Fixes: make alternatives mutually exclusive, remove the inner repeat, put a delimiter between repeats, cap lengths, or use an engine with linear-time matching.';
  },
});

// ---------- glob pattern tester ----------
function expandBraces(p) {
  // bash-style {a,b}; only expands when a top-level comma exists
  let depth = 0, start = -1;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}' && depth > 0) {
      depth--;
      if (depth === 0) {
        const inner = p.slice(start + 1, i), parts = []; let d = 0, last = 0;
        for (let j = 0; j < inner.length; j++) { const ch = inner[j]; if (ch === '\\') j++; else if (ch === '{') d++; else if (ch === '}') d--; else if (ch === ',' && d === 0) { parts.push(inner.slice(last, j)); last = j + 1; } }
        parts.push(inner.slice(last));
        if (parts.length > 1) { const pre = p.slice(0, start), post = p.slice(i + 1); return parts.flatMap((x) => expandBraces(pre + x + post)); }
      }
    }
  }
  return [p];
}
const reEsc = (c) => c.replace(/[\\^$.*+?()[\]{}|\/-]/g, '\\$&');
function segToRe(seg, dot) {
  let out = '', i = 0;
  const lead = !dot && /^[*?[]|^[?*+@]\(/.test(seg) ? '(?!\\.)' : '';
  while (i < seg.length) {
    const c = seg[i];
    if (c === '\\') { out += reEsc(seg[i + 1] ?? '\\'); i += 2; continue; }
    if ('?*+@!'.includes(c) && seg[i + 1] === '(') {
      let d = 0, j = i + 1;
      for (; j < seg.length; j++) { if (seg[j] === '\\') j++; else if (seg[j] === '(') d++; else if (seg[j] === ')' && --d === 0) break; }
      if (j >= seg.length) throw new Error('Unclosed extglob group "' + c + '(" in ' + seg);
      if (c === '!') throw new Error('Negated extglob !(...) is not supported');
      const inner = seg.slice(i + 2, j), alts = []; let dd = 0, last = 0;
      for (let k = 0; k < inner.length; k++) { const ch = inner[k]; if (ch === '\\') k++; else if (ch === '(') dd++; else if (ch === ')') dd--; else if (ch === '|' && dd === 0) { alts.push(inner.slice(last, k)); last = k + 1; } }
      alts.push(inner.slice(last));
      out += '(?:' + alts.map((a) => segToRe(a, true)).join('|') + ')' + { '?': '?', '*': '*', '+': '+', '@': '' }[c];
      i = j + 1; continue;
    }
    if (c === '*') { while (seg[i + 1] === '*') i++; out += '[^/]*'; i++; continue; }
    if (c === '?') { out += '[^/]'; i++; continue; }
    if (c === '[') {
      let j = i + 1; if (seg[j] === '!' || seg[j] === '^') j++; if (seg[j] === ']') j++;
      while (j < seg.length && seg[j] !== ']') { if (seg[j] === '[' && seg[j + 1] === ':') { const e = seg.indexOf(':]', j); if (e > 0) j = e + 1; } j++; }
      if (j >= seg.length) { out += '\\['; i++; continue; }
      let body = seg.slice(i + 1, j), neg = false;
      if (body[0] === '!' || body[0] === '^') { neg = true; body = body.slice(1); }
      const POSIX = { alpha: 'A-Za-z', digit: '0-9', alnum: 'A-Za-z0-9', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f' };
      body = body.replace(/\[:(\w+):\]/g, (m, n) => POSIX[n] ?? m).replace(/\\(?![tnrfv\]\\\/!-:\[-`{-~])/g, '\\\\');
      out += '[' + (neg ? '^/' : '') + body.replace(/\]/g, '\\]') + ']'; i = j + 1; continue;
    }
    out += reEsc(c); i++;
  }
  return lead + out;
}
function globToRegex(pat, opt) {
  let p = pat.replace(/^\.\//, '');
  const abs = p.startsWith('/');
  if (abs) p = p.slice(1);
  const segs = p.split('/');
  let re = '';
  segs.forEach((seg, k) => {
    const last = k === segs.length - 1;
    if (seg === '**') {
      const dotRule = opt.dot ? '[^/]+' : '(?!\\.)[^/]+';
      re += last ? (k === 0 ? (opt.dot ? '.+' : '(?!\\.)[^/]+(?:/[^/]+)*') : '.+') : `(?:${dotRule}/)*`;
    } else re += segToRe(seg, opt.dot) + (last ? '' : '/');
  });
  if (!abs && opt.base && segs.length === 1) re = '(?:.*/)?' + re;
  return new RegExp('^' + re + '$', opt.nocase ? 'i' : '');
}
T.push({
  id: 'glob-pattern-tester', cat: 'Text+', title: 'Glob Pattern Tester',
  desc: 'Test shell glob patterns (*, **, ?, [abc], {a,b}, extglob) against a list of file paths and see which pattern matches each path.',
  inputs: 2, labels: ['Glob patterns, one per line (a leading ! excludes)', 'File paths, one per line'],
  sample: 'src/**/*.{js,ts}\n!**/*.test.js\n*.md', sample2: 'src/index.js\nsrc/lib/util.ts\nsrc/lib/util.test.js\nsrc/.hidden/x.js\nREADME.md\ndocs/guide.md\npackage.json',
  opts: [chk('dot', 'Let * and ** match names that start with a dot', false), chk('base', 'Patterns without a slash match the file name at any depth', false), chk('nocase', 'Ignore case', false)],
  run: ([pats, paths], o) => {
    const ps = [];
    for (const raw of lines(pats).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))) {
      const neg = raw.startsWith('!'), p = neg ? raw.slice(1) : raw;
      try { for (const e of expandBraces(p)) ps.push({ raw, neg, re: globToRegex(e, o) }); } catch (e) { throw new Error(`Pattern "${raw}": ${e.message}`); }
    }
    if (!ps.length) throw new Error('Enter at least one glob pattern');
    const fs = lines(paths).map((l) => l.trim().replace(/\\/g, '/').replace(/^\.\//, '')).filter(Boolean).slice(0, 20000);
    if (!fs.length) throw new Error('Enter at least one path');
    let hit = 0;
    const out = fs.map((f) => {
      let res = null;
      for (const p of ps) if (p.re.test(f)) res = p;
      const ok = res && !res.neg;
      if (ok) hit++;
      return `${ok ? 'MATCH ' : 'no    '}  ${f}${res ? '   <- ' + (res.neg ? 'excluded by ' : '') + res.raw : ''}`;
    });
    return `${hit} of ${fs.length} paths match\nThe last pattern that matches a path decides. Patterns starting with ! exclude.\n\n` + out.join('\n') + '\n\nThis follows common shell and minimatch behaviour. Details differ between tools (bash, zsh, minimatch, picomatch, Python glob); negated extglob !(...) is not supported.';
  },
});

// ---------- edit distance helpers ----------
function lev(a, b, mode) { // a, b arrays of tokens; mode: lev | osa | indel
  const n = a.length, m = b.length, W = m + 1, d = new Uint32Array((n + 1) * W);
  for (let j = 0; j <= m; j++) d[j] = j;
  for (let i = 1; i <= n; i++) {
    d[i * W] = i;
    for (let j = 1; j <= m; j++) {
      const same = a[i - 1] === b[j - 1];
      let v = Math.min(d[(i - 1) * W + j] + 1, d[i * W + j - 1] + 1, d[(i - 1) * W + j - 1] + (same ? 0 : mode === 'indel' ? 2 : 1));
      if (mode === 'osa' && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[(i - 2) * W + j - 2] + 1);
      d[i * W + j] = v;
    }
  }
  return { d, W, dist: d[n * W + m] };
}
function editOps(a, b, mode) {
  const { d, W, dist } = lev(a, b, mode); const ops = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    const cur = d[i * W + j];
    if (mode === 'osa' && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && cur === d[(i - 2) * W + j - 2] + 1) { ops.push({ t: 'transpose', a: a[i - 2] + a[i - 1], b: b[j - 2] + b[j - 1], i: i - 2, j: j - 2 }); i -= 2; j -= 2; continue; }
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && cur === d[(i - 1) * W + j - 1]) { ops.push({ t: 'match', a: a[i - 1], b: b[j - 1], i: i - 1, j: j - 1 }); i--; j--; continue; }
    if (mode !== 'indel' && i > 0 && j > 0 && cur === d[(i - 1) * W + j - 1] + 1) { ops.push({ t: 'sub', a: a[i - 1], b: b[j - 1], i: i - 1, j: j - 1 }); i--; j--; continue; }
    if (i > 0 && cur === d[(i - 1) * W + j] + 1) { ops.push({ t: 'del', a: a[i - 1], i: i - 1, j }); i--; continue; }
    ops.push({ t: 'ins', b: b[j - 1], i, j: j - 1 }); j--;
  }
  return { ops: ops.reverse(), dist };
}
const levDist = (a, b) => { // rolling rows, for similarity matrices
  if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length];
};
T.push({
  id: 'levenshtein-calculator', cat: 'Text+', title: 'Levenshtein Distance Calculator (Edit Script and Alignment)',
  desc: 'Edit distance between two strings with the exact insertions, deletions and substitutions, plus an aligned view. Also Damerau (adjacent swap) and indel (LCS) distance.',
  inputs: 2, labels: ['First string', 'Second string'], sample: 'kitten', sample2: 'sitting',
  opts: [sel('algo', 'Distance', ['Levenshtein', 'Damerau-Levenshtein (adjacent swap, OSA)', 'Indel (insert/delete only)']), sel('unit', 'Compare', ['characters (code points)', 'words']), chk('nocase', 'Ignore case', false)],
  run: ([x, y], o) => {
    const mode = o.algo.startsWith('Dam') ? 'osa' : o.algo.startsWith('Indel') ? 'indel' : 'lev';
    const tok = (s) => { s = o.nocase ? s.toLowerCase() : s; return o.unit.startsWith('words') ? s.split(/\s+/).filter(Boolean) : Array.from(s); };
    const a = tok(x.replace(/\r?\n$/, '')), b = tok(y.replace(/\r?\n$/, ''));
    if (a.length > 2000 || b.length > 2000) throw new Error('Each side is limited to 2000 characters or words');
    if (!a.length && !b.length) throw new Error('Enter two strings');
    const { ops, dist } = editOps(a, b, mode);
    const cnt = (t) => ops.filter((p) => p.t === t).length;
    const maxLen = Math.max(a.length, b.length), words = o.unit.startsWith('words'), sp = words ? ' ' : '';
    const sim = mode === 'indel' ? 1 - dist / (a.length + b.length || 1) : 1 - dist / (maxLen || 1);
    const pad = (s, n) => s + ' '.repeat(Math.max(0, n - Array.from(s).length));
    let r1 = '', r2 = '', r3 = '';
    for (const p of ops) {
      const A = p.t === 'ins' ? '' : p.a, B = p.t === 'del' ? '' : p.b, w = Math.max(Array.from(A).length, Array.from(B).length, 1);
      const mark = { match: '|', sub: 'x', ins: '+', del: '-', transpose: 't' }[p.t];
      r1 += pad(A || '-', w) + sp; r3 += pad(B || '-', w) + sp; r2 += pad(mark, w) + sp;
    }
    const script = ops.filter((p) => p.t !== 'match').map((p) => ({ sub: `substitute ${JSON.stringify(p.a)} (position ${p.i + 1}) with ${JSON.stringify(p.b)}`, ins: `insert ${JSON.stringify(p.b)} (before position ${p.i + 1} of the first string)`, del: `delete ${JSON.stringify(p.a)} (position ${p.i + 1})`, transpose: `swap ${JSON.stringify(p.a)} to ${JSON.stringify(p.b)} (position ${p.i + 1})` })[p.t]);
    return `Distance (${o.algo.split(' (')[0]}): ${dist}\nSimilarity: ${(sim * 100).toFixed(1)}%  (1 - distance / ${mode === 'indel' ? 'total length' : 'longer length'})\nLengths: ${a.length} and ${b.length} ${words ? 'words' : 'characters'}\nSubstitutions ${cnt('sub')}, insertions ${cnt('ins')}, deletions ${cnt('del')}${mode === 'osa' ? ', swaps ' + cnt('transpose') : ''}\n\nAlignment (| same, x substitute, + insert, - delete, t swap):\n${r1.trimEnd()}\n${r2.trimEnd()}\n${r3.trimEnd()}\n\nEdit script:\n${script.length ? script.map((s, k) => `${k + 1}. ${s}`).join('\n') : '(the strings are identical)'}\n\nOne optimal path is shown; other paths with the same distance may exist.`;
  },
});

// ---------- string similarity ----------
function jaro(a, b) {
  if (!a.length && !b.length) return 1; if (!a.length || !b.length) return 0;
  const md = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1), am = [], bm = [];
  let m = 0;
  for (let i = 0; i < a.length; i++) for (let j = Math.max(0, i - md); j < Math.min(b.length, i + md + 1); j++) if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; m++; break; }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) if (am[i]) { while (!bm[k]) k++; if (a[i] !== b[k]) t++; k++; }
  return (m / a.length + m / b.length + (m - t / 2) / m) / 3;
}
function jaroWinkler(a, b, p = 0.1) { const j = jaro(a, b); let l = 0; while (l < 4 && l < a.length && l < b.length && a[l] === b[l]) l++; return j + l * p * (1 - j); }
const grams = (arr, n) => { const m = new Map(); for (let i = 0; i + n <= arr.length; i++) { const g = arr.slice(i, i + n).join('\u0001'); m.set(g, (m.get(g) || 0) + 1); } return m; };
const diceSets = (A, B) => { const x = new Set(A.keys()), y = new Set(B.keys()); let c = 0; for (const k of x) if (y.has(k)) c++; return { c, x: x.size, y: y.size }; };
const cosine = (A, B) => { let d = 0, na = 0, nb = 0; for (const [k, v] of A) { na += v * v; if (B.has(k)) d += v * B.get(k); } for (const v of B.values()) nb += v * v; return na && nb ? d / Math.sqrt(na * nb) : 0; };
function lcsLen(a, b) { const m = b.length; let prev = new Array(m + 1).fill(0); for (let i = 1; i <= a.length; i++) { const cur = [0]; for (let j = 1; j <= m; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; } return prev[m]; }
T.push({
  id: 'string-similarity-comparer', cat: 'Text+', title: 'String Similarity Comparer (Jaro-Winkler, Dice, Cosine)',
  desc: 'Score two strings with Levenshtein, Damerau, Jaro, Jaro-Winkler, Dice, Jaccard, cosine and longest common subsequence, side by side from 0 to 1.',
  inputs: 2, labels: ['First string', 'Second string'], sample: 'MARTHA', sample2: 'MARHTA',
  opts: [chk('nocase', 'Ignore case', true), chk('trim', 'Collapse whitespace', true)],
  run: ([x, y], o) => {
    const prep = (s) => { s = s.replace(/\r?\n$/, ''); if (o.trim) s = s.replace(/\s+/g, ' ').trim(); if (o.nocase) s = s.toLowerCase(); return s; };
    const A = prep(x), B = prep(y);
    if (!A && !B) throw new Error('Enter two strings');
    if (A.length > 5000 || B.length > 5000) throw new Error('Each string is limited to 5000 characters');
    const a = Array.from(A), b = Array.from(B), wa = A.split(' ').filter(Boolean), wb = B.split(' ').filter(Boolean);
    const L = lev(a.length > 2000 ? a.slice(0, 2000) : a, b.length > 2000 ? b.slice(0, 2000) : b, 'lev').dist, O = lev(a.slice(0, 2000), b.slice(0, 2000), 'osa').dist;
    const mx = Math.max(a.length, b.length) || 1;
    const g2a = grams(a, 2), g2b = grams(b, 2), { c, x: nx, y: ny } = diceSets(g2a, g2b), jac = nx + ny - c;
    const ws = diceSets(grams(wa, 1), grams(wb, 1));
    const rows = [
      ['Levenshtein similarity', 1 - L / mx, '1 - edit distance / longer length'],
      ['Damerau (OSA) similarity', 1 - O / mx, 'same, but a swap of neighbours costs 1'],
      ['Jaro', jaro(a, b), 'matching characters within a window, minus transpositions'],
      ['Jaro-Winkler', jaroWinkler(a, b), 'Jaro, boosted for a shared prefix (up to 4, scale 0.1)'],
      ['Dice (character bigrams)', nx + ny ? (2 * c) / (nx + ny) : (A === B ? 1 : 0), '2 x shared bigrams / total distinct bigrams'],
      ['Jaccard (character bigrams)', jac ? c / jac : (A === B ? 1 : 0), 'shared bigrams / all distinct bigrams'],
      ['Cosine (character bigrams)', cosine(g2a, g2b), 'angle between bigram count vectors'],
      ['Cosine (words)', cosine(grams(wa, 1), grams(wb, 1)), 'angle between word count vectors'],
      ['Jaccard (words)', ws.x + ws.y - ws.c ? ws.c / (ws.x + ws.y - ws.c) : 0, 'shared words / all distinct words'],
      ['Longest common subsequence', (2 * lcsLen(a, b)) / ((a.length + b.length) || 1), '2 x LCS length / total length'],
    ];
    const w = Math.max(...rows.map((r) => r[0].length));
    return `Scores run from 0 (nothing alike) to 1 (identical).\n\n` + rows.map((r) => `${r[0].padEnd(w)}  ${r[1].toFixed(4)}   ${r[2]}`).join('\n') + `\n\nLengths: ${a.length} and ${b.length} characters. Strings of 1 character have no bigrams, so the bigram scores are 0 unless the strings are equal. Different metrics suit different jobs: Jaro-Winkler for short names, Dice or cosine for longer text.`;
  },
});

// ---------- fuzzy search ----------
function fuzzySubseq(q, t, cs) {
  const Q = cs ? q : q.toLowerCase(), S = cs ? t : t.toLowerCase();
  const n = Q.length, m = S.length;
  if (n > m) return null;
  const bonus = (j) => { if (j === 0) return 12; const p = t[j - 1], c = t[j]; if (/[\s_\-./\\:]/.test(p)) return 10; if (/[a-z]/.test(p) && /[A-Z]/.test(c)) return 8; return 0; };
  const NEG = -1e9, M = Array.from({ length: n }, () => new Array(m).fill(NEG)), P = Array.from({ length: n }, () => new Array(m).fill(-1));
  for (let i = 0; i < n; i++) for (let j = i; j < m; j++) {
    if (S[j] !== Q[i]) continue;
    const base = 16 + bonus(j);
    if (i === 0) { M[0][j] = base - Math.min(j, 6); continue; }
    let best = NEG, bk = -1;
    for (let k = i - 1; k < j; k++) { if (M[i - 1][k] === NEG) continue; const v = M[i - 1][k] + (k === j - 1 ? 8 : -(3 + (j - k - 2))); if (v > best) { best = v; bk = k; } }
    if (bk >= 0) { M[i][j] = best + base; P[i][j] = bk; }
  }
  let bj = -1, bs = NEG;
  for (let j = 0; j < m; j++) if (M[n - 1][j] > bs) { bs = M[n - 1][j]; bj = j; }
  if (bj < 0) return null;
  const pos = []; for (let i = n - 1, j = bj; i >= 0; i--) { pos.unshift(j); j = P[i][j]; }
  return { score: bs - Math.min(m - n, 10) * 0.5, pos };
}
function sellers(q, t) { // min edits of q against any substring of t, with end index
  let prev = new Array(t.length + 1).fill(0);
  for (let i = 1; i <= q.length; i++) { const cur = [i]; for (let j = 1; j <= t.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (q[i - 1] === t[j - 1] ? 0 : 1)); prev = cur; }
  return Math.min(...prev);
}
T.push({
  id: 'fuzzy-search-playground', cat: 'Text+', title: 'Fuzzy Search Playground',
  desc: 'Try fuzzy matching on your own word list: fzf-style subsequence scoring, typo-tolerant edit distance, or trigram similarity. Ranked results with matched letters marked.',
  inputs: 2, labels: ['Query', 'Candidates (one per line)'], sample: 'usrctl', sample2: 'user_controller.rb\nuser_model.rb\nUserSettingsControl.tsx\nsession_ctl.py\nREADME.md\nutils/string_tools.js\nuseCtrlState.ts\ncontroller_user.go',
  opts: [sel('algo', 'Algorithm', ['Subsequence (fzf-style)', 'Typo tolerant (edit distance)', 'Trigram similarity (Dice)']), chk('cs', 'Case sensitive', false), num('limit', 'Show at most', 20), num('min', 'Minimum score (0-100, typo and trigram modes)', 40)],
  run: ([q, list], o) => {
    q = q.replace(/\r?\n.*/s, '').trim();
    if (!q) throw new Error('Enter a query');
    const items = lines(list).map((l) => l.trim()).filter(Boolean).slice(0, 20000);
    if (!items.length) throw new Error('Enter at least one candidate');
    const Q = o.cs ? q : q.toLowerCase();
    const res = [];
    for (const t of items) {
      if (t.length > 300) continue;
      const S = o.cs ? t : t.toLowerCase();
      if (o.algo.startsWith('Subseq')) { const r = fuzzySubseq(q, t, o.cs); if (r) res.push({ t, score: r.score, show: r.score.toFixed(1), pos: new Set(r.pos) }); }
      else if (o.algo.startsWith('Typo')) { const d = Math.min(sellers(Array.from(Q), Array.from(S)), levDist(Array.from(Q), Array.from(S))); const sc = Math.max(0, 100 * (1 - d / Q.length)) - Math.min(S.length - Q.length, 40) * 0.05; if (sc >= clamp(o.min, 0, 100)) res.push({ t, score: sc, show: sc.toFixed(1) + ` (${sellers(Array.from(Q), Array.from(S))} edits)` }); }
      else { const g = (s) => { s = '  ' + s + ' '; return grams(Array.from(s), 3); }; const A = g(Q), B = g(S); let c = 0; for (const [k, v] of A) if (B.has(k)) c += Math.min(v, B.get(k)); let ta = 0, tb = 0; for (const v of A.values()) ta += v; for (const v of B.values()) tb += v; const sc = (200 * c) / (ta + tb); if (sc >= clamp(o.min, 0, 100)) res.push({ t, score: sc, show: sc.toFixed(1) }); }
    }
    res.sort((a, b) => b.score - a.score || a.t.length - b.t.length);
    const top = res.slice(0, clamp(o.limit, 1, 500));
    if (!top.length) return 'No candidate matched.';
    const mark = (r) => (r.pos ? Array.from(r.t).map((ch, k) => (r.pos.has(k) ? '[' + ch + ']' : ch)).join('').replace(/\]\[/g, '') : r.t);
    return `${res.length} of ${items.length} candidates matched; showing ${top.length}.\n\n` + top.map((r, k) => `${String(k + 1).padStart(2)}.  ${r.show.padEnd(18)} ${mark(r)}`).join('\n') + '\n\nScores are heuristics. Subsequence mode needs every query letter in order and rewards consecutive letters and word starts (a simplified fzf-style scheme, not fzf itself). Typo mode counts the fewest edits to match the query anywhere inside the candidate.';
  },
});

// ---------- grep ----------
T.push({
  id: 'grep-lines', cat: 'Text+', title: 'Grep for Pasted Text (Context Lines, Invert, Regex)',
  desc: 'Filter pasted text by a plain or regex pattern like grep: invert, ignore case, whole word, line numbers, context lines before and after, count, or only the matching part.',
  inputs: 1, labels: ['Text'], sample: 'GET /index.html 200\nGET /missing 404\nPOST /api/login 200\nGET /about 200\nGET /old 404\nGET /x 500\nPOST /api/login 401',
  opts: [txt('pat', 'Pattern', '404|500'), chk('rx', 'Pattern is a regular expression', true), chk('i', 'Ignore case', false), chk('v', 'Invert (show lines that do not match)', false), chk('w', 'Whole word', false), chk('n', 'Line numbers', true), num('a', 'Lines after', 0), num('b', 'Lines before', 0), sel('mode', 'Output', ['lines', 'count only', 'only the matching parts'])],
  run: ([s], o) => {
    if (!o.pat) throw new Error('Enter a pattern');
    let src = o.rx ? o.pat : o.pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (o.w) src = `(?<![\\w])(?:${src})(?![\\w])`;
    let re;
    try { re = new RegExp(src, (o.i ? 'i' : '') + 'g'); } catch (e) { throw new Error('Invalid pattern: ' + e.message.replace(/^Invalid regular expression: /, '')); }
    const ls = lines(s.replace(/\n$/, '')), hit = ls.map((l) => { re.lastIndex = 0; const m = re.test(l); return o.v ? !m : m; });
    const total = hit.filter(Boolean).length;
    if (o.mode === 'count only') return String(total);
    if (o.mode.startsWith('only')) {
      if (o.v) throw new Error('"Only the matching parts" cannot be combined with Invert');
      const out = [];
      ls.forEach((l, k) => { re.lastIndex = 0; for (const m of l.matchAll(re)) if (m[0] !== '') out.push((o.n ? `${k + 1}:` : '') + m[0]); });
      return out.length ? out.join('\n') : '(no matches)';
    }
    const A = clamp(o.a, 0, 100), B = clamp(o.b, 0, 100), keep = new Array(ls.length).fill(false);
    hit.forEach((h, k) => { if (h) for (let j = Math.max(0, k - B); j <= Math.min(ls.length - 1, k + A); j++) keep[j] = true; });
    const out = []; let prev = -2;
    ls.forEach((l, k) => { if (!keep[k]) return; if ((A || B) && prev !== -2 && k > prev + 1) out.push('--'); out.push((o.n ? `${k + 1}${hit[k] ? ':' : '-'}` : '') + l); prev = k; });
    return `${total} matching line${total === 1 ? '' : 's'} of ${ls.length}\n\n` + (out.join('\n') || '(no matches)');
  },
});

// ---------- IP extractor ----------
function parseV6(s) {
  let tail = null;
  if (s.includes('.')) { const k = s.lastIndexOf(':'); const v4 = parseV4(s.slice(k + 1)); if (!v4) return null; tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]]; s = s.slice(0, k + 1) + '0:0'; }
  if (!/^[0-9a-fA-F:]+$/.test(s) || s.includes(':::')) return null;
  const dc = s.split('::'); if (dc.length > 2) return null;
  const grp = (p) => (p === '' ? [] : p.split(':'));
  const head = grp(dc[0]), rest = dc.length === 2 ? grp(dc[1]) : [];
  if ([...head, ...rest].some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  let w;
  if (dc.length === 2) { if (head.length + rest.length > 7) return null; w = [...head, ...new Array(8 - head.length - rest.length).fill('0'), ...rest]; }
  else { if (head.length !== 8) return null; w = head; }
  const n = w.map((g) => parseInt(g, 16));
  if (tail) { n[6] = tail[0]; n[7] = tail[1]; }
  return n;
}
function parseV4(s) { const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s); if (!m) return null; const o = m.slice(1).map((x) => (x.length > 1 && x[0] === '0' ? 999 : +x)); return o.every((x) => x <= 255) ? o : null; }
function compressV6(n) {
  let bs = -1, bl = 0;
  for (let i = 0; i < 8;) { if (n[i] === 0) { let j = i; while (j < 8 && n[j] === 0) j++; if (j - i > bl) { bs = i; bl = j - i; } i = j; } else i++; }
  const h = n.map((x) => x.toString(16));
  if (bl < 2) return h.join(':');
  return h.slice(0, bs).join(':') + '::' + h.slice(bs + bl).join(':');
}
function ipClass(kind, v) {
  if (kind === 4) { const [a, b] = v; if (a === 10 || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168)) return 'private'; if (a === 127) return 'loopback'; if (a === 169 && b === 254) return 'link-local'; if (a === 0) return 'this-network'; return 'public-or-other'; }
  if (v.every((x, i) => (i < 7 ? x === 0 : x === 1))) return 'loopback'; if ((v[0] & 0xfe00) === 0xfc00) return 'private'; if ((v[0] & 0xffc0) === 0xfe80) return 'link-local'; return 'public-or-other';
}
T.push({
  id: 'ip-address-extractor', cat: 'Text+', title: 'IP Address Extractor (IPv4 and IPv6 from Logs)',
  desc: 'Find every IPv4 and IPv6 address in pasted log text, count how often each appears, and sort by first seen, count or numeric value. Handles [.] defanged addresses.',
  inputs: 1, labels: ['Log text'], sample: '203.0.113.7 - - [10/Oct] "GET / HTTP/1.1" 200\n198.51.100.23 - - "GET /a" 404 from 2001:db8::1\n203.0.113.7 login failed, forwarded for 10.0.0.5, fe80::1%eth0\nversion 1.2.3 is not an ip; 999.1.1.1 neither; 192[.]0[.]2[.]44 defanged',
  opts: [sel('type', 'Find', ['IPv4 and IPv6', 'IPv4 only', 'IPv6 only']), sel('sort', 'Sort', ['first seen', 'most frequent', 'numeric']), chk('priv', 'Include private, loopback and link-local', true), chk('counts', 'Show counts', true), chk('norm', 'Print IPv6 in compressed form', false)],
  run: ([s], o) => {
    const text = s.replace(/\[\.\]|\(\.\)|\{\.\}/g, '.').replace(/\[:\]/g, ':');
    const map = new Map();
    const re = /(?<![\w.:])[0-9a-fA-F:.]{2,}(?![\w:])|(?<![\w.:])\d{1,3}(?:\.\d{1,3}){3}(?![\w])/g;
    for (const m of text.matchAll(re)) {
      let c = m[0].replace(/\.+$/, '');
      const cand = c.replace(/:+$/, (t) => (t.length === 2 && c.length > 2 ? t : ''));
      const v4 = parseV4(cand);
      if (v4 && !cand.includes(':')) { if (o.type === 'IPv6 only') continue; add(cand, 4, v4, cand); continue; }
      if (cand.includes(':') && o.type !== 'IPv4 only') { const v6 = parseV6(cand); if (v6) add(cand, 6, v6, o.norm ? compressV6(v6) : cand); }
    }
    function add(raw, kind, v, label) {
      if (!o.priv && ipClass(kind, v) !== 'public-or-other') return;
      const key = kind + '|' + (kind === 6 ? v.join(':') : raw);
      const e = map.get(key) || { label, n: 0, kind, v, order: map.size }; e.n++; map.set(key, e);
    }
    const arr = [...map.values()];
    const val = (e) => (e.kind === 4 ? BigInt(e.v[0] * 16777216 + e.v[1] * 65536 + e.v[2] * 256 + e.v[3]) : (1n << 40n) * 0n + e.v.reduce((a, x) => (a << 16n) | BigInt(x), 0n) + (1n << 130n));
    if (o.sort === 'most frequent') arr.sort((a, b) => b.n - a.n || a.order - b.order);
    else if (o.sort === 'numeric') arr.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0));
    if (!arr.length) return 'No IP addresses found.';
    const total = arr.reduce((a, e) => a + e.n, 0);
    return `${arr.length} unique address${arr.length === 1 ? '' : 'es'}, ${total} occurrence${total === 1 ? '' : 's'}\n\n` + arr.map((e) => (o.counts ? String(e.n).padStart(5) + '  ' : '') + e.label).join('\n') + '\n\nIPv4 needs four numbers from 0 to 255 without leading zeros. IPv6 forms (::, embedded IPv4) are checked; a zone such as %eth0 is ignored. Version numbers like 1.2.3 are not addresses.';
  },
});

// ---------- base64 / PEM / DER helpers ----------
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64u = (u8) => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
const pem = (label, u8) => `-----BEGIN ${label}-----\n${b64(u8).replace(/(.{64})/g, '$1\n').replace(/\n$/, '')}\n-----END ${label}-----`;
const subtle = () => { if (!globalThis.crypto?.subtle) throw new Error('WebCrypto is not available in this browser'); return crypto.subtle; };
function derRead(u8, p = 0) { // returns {tag, hs, len, end}
  const tag = u8[p]; let l = u8[p + 1], hs = 2;
  if (l & 0x80) { const n = l & 0x7f; l = 0; for (let i = 0; i < n; i++) l = l * 256 + u8[p + 2 + i]; hs = 2 + n; }
  if (p + hs + l > u8.length) throw new Error('Truncated DER data');
  return { tag, hs, len: l, start: p + hs, end: p + hs + l };
}
const derChildren = (u8, n) => { const out = []; let p = n.start; while (p < n.end) { const c = derRead(u8, p); out.push(c); p = c.end; } return out; };
const derLen = (n) => (n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]);
const derWrap = (tag, ...parts) => { const body = parts.flatMap((p) => Array.from(p)); return Uint8Array.from([tag, ...derLen(body.length), ...body]); };
const oidStr = (u8, n) => { const b = u8.subarray(n.start, n.end); const out = [Math.floor(b[0] / 40), b[0] % 40]; let v = 0; for (let i = 1; i < b.length; i++) { v = v * 128 + (b[i] & 127); if (!(b[i] & 128)) { out.push(v); v = 0; } } return out.join('.'); };
const OID_RSA = '1.2.840.113549.1.1.1', OID_EC = '1.2.840.10045.2.1', OID_ED = '1.3.101.112';
const CURVES = { '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521' };
const RSA_ALG_ID = Uint8Array.from([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
async function jwkThumbprint(jwk) {
  const f = jwk.kty === 'RSA' ? { e: jwk.e, kty: 'RSA', n: jwk.n } : jwk.kty === 'EC' ? { crv: jwk.crv, kty: 'EC', x: jwk.x, y: jwk.y } : { crv: jwk.crv, kty: 'OKP', x: jwk.x };
  return b64u(new Uint8Array(await subtle().digest('SHA-256', new TextEncoder().encode(JSON.stringify(f)))));
}

// ---------- ECDSA key generator ----------
T.push({
  id: 'ecdsa-key-generator', cat: 'Crypto+', title: 'ECDSA Key Pair Generator (P-256, P-384, P-521)',
  desc: 'Generate an elliptic-curve key pair with WebCrypto and get PKCS#8 and SPKI PEM plus public and private JWK with an RFC 7638 thumbprint. Private key never leaves the tab.',
  inputs: 0, sample: '',
  opts: [sel('curve', 'Curve', ['P-256', 'P-384', 'P-521']), sel('use', 'Intended use', ['ECDSA (signing, ES256/ES384/ES512)', 'ECDH (key agreement)']), txt('kid', 'Key ID to put in the JWK (blank = thumbprint)', '')],
  run: async (_, o) => {
    const s = subtle(), ecdh = o.use.startsWith('ECDH');
    const kp = await s.generateKey({ name: ecdh ? 'ECDH' : 'ECDSA', namedCurve: o.curve }, true, ecdh ? ['deriveBits'] : ['sign', 'verify']);
    const pkcs8 = new Uint8Array(await s.exportKey('pkcs8', kp.privateKey)), spki = new Uint8Array(await s.exportKey('spki', kp.publicKey));
    const priv = await s.exportKey('jwk', kp.privateKey), pub = await s.exportKey('jwk', kp.publicKey);
    const tp = await jwkThumbprint(pub), kid = o.kid.trim() || tp, alg = { 'P-256': 'ES256', 'P-384': 'ES384', 'P-521': 'ES512' }[o.curve];
    const clean = (j) => { const r = { kty: j.kty, crv: j.crv, x: j.x, y: j.y }; if (j.d) r.d = j.d; if (!ecdh) r.alg = alg; r.use = ecdh ? 'enc' : 'sig'; r.kid = kid; return r; };
    return `Curve: ${o.curve}   Use: ${ecdh ? 'ECDH' : 'ECDSA (' + alg + ')'}\nJWK thumbprint (RFC 7638, SHA-256): ${tp}\n\n${pem('PRIVATE KEY', pkcs8)}\n\n${pem('PUBLIC KEY', spki)}\n\nPrivate JWK:\n${JSON.stringify(clean(priv), null, 2)}\n\nPublic JWK:\n${JSON.stringify(clean(pub), null, 2)}\n\nThe private key was made by your browser's WebCrypto and is shown only here. Keys made on a web page are fine for tests and learning; for production secrets use a key generated and stored in a hardware module, KMS or your own trusted machine.`;
  },
});

// ---------- JWK <-> PEM ----------
const RSA_PRIV = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'];
async function jwkToPem(j) {
  if (!j || typeof j !== 'object' || !j.kty) throw new Error('Each key needs a "kty" field');
  const s = subtle(), base = { ...j }; for (const k of ['use', 'key_ops', 'alg', 'ext', 'kid']) delete base[k];
  const alg = j.kty === 'RSA' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : j.kty === 'EC' ? { name: 'ECDSA', namedCurve: j.crv } : j.kty === 'OKP' && j.crv === 'Ed25519' ? { name: 'Ed25519' } : null;
  if (!alg) throw new Error(`Unsupported key type ${j.kty}${j.crv ? ' / ' + j.crv : ''} (RSA, EC and OKP Ed25519 work)`);
  const isPriv = 'd' in j, out = [];
  const pubJwk = { ...base }; for (const k of ['d', ...RSA_PRIV]) delete pubJwk[k];
  const usagesPub = j.kty === 'EC' || j.kty === 'RSA' ? ['verify'] : ['verify'];
  const pubKey = await s.importKey('jwk', pubJwk, alg, true, usagesPub);
  const spki = new Uint8Array(await s.exportKey('spki', pubKey));
  if (isPriv) {
    const pk = await s.importKey('jwk', base, alg, true, ['sign']);
    const p8 = new Uint8Array(await s.exportKey('pkcs8', pk));
    out.push(pem('PRIVATE KEY', p8));
    if (j.kty === 'RSA') { const t = derRead(p8, 0), ch = derChildren(p8, t); out.push(pem('RSA PRIVATE KEY', p8.subarray(ch[2].start, ch[2].end))); }
  }
  out.push(pem('PUBLIC KEY', spki));
  if (j.kty === 'RSA') { const t = derRead(spki, 0), ch = derChildren(spki, t); out.push(pem('RSA PUBLIC KEY', spki.subarray(ch[1].start + 1, ch[1].end))); }
  return { kind: isPriv ? 'private' : 'public', pems: out };
}
async function pemToJwk(label, der) {
  const s = subtle(); let p8 = null, spki = null;
  if (label === 'RSA PRIVATE KEY') p8 = derWrap(0x30, [2, 1, 0], RSA_ALG_ID, derWrap(0x04, der));
  else if (label === 'RSA PUBLIC KEY') spki = derWrap(0x30, RSA_ALG_ID, derWrap(0x03, [0], der));
  else if (label === 'PRIVATE KEY') p8 = der; else if (label === 'PUBLIC KEY') spki = der;
  else if (label === 'EC PRIVATE KEY') throw new Error('SEC1 "EC PRIVATE KEY" is not supported. Convert it first: openssl pkcs8 -topk8 -nocrypt -in ec.pem');
  else if (label === 'ENCRYPTED PRIVATE KEY') throw new Error('Encrypted keys are not supported. Decrypt first with openssl pkcs8 -in key.pem -out plain.pem');
  else throw new Error(`Unsupported PEM label "${label}"`);
  const bytes = p8 || spki, top = derRead(bytes, 0), ch = derChildren(bytes, top), algSeq = p8 ? ch[1] : ch[0], ac = derChildren(bytes, algSeq), oid = oidStr(bytes, ac[0]);
  let alg;
  if (oid === OID_RSA) alg = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  else if (oid === OID_EC) { const c = CURVES[oidStr(bytes, ac[1])]; if (!c) throw new Error('Unsupported EC curve (P-256, P-384, P-521 work)'); alg = { name: 'ECDSA', namedCurve: c }; }
  else if (oid === OID_ED) alg = { name: 'Ed25519' };
  else throw new Error('Unsupported key algorithm OID ' + oid);
  const key = await s.importKey(p8 ? 'pkcs8' : 'spki', bytes, alg, true, [p8 ? 'sign' : 'verify']);
  const j = await s.exportKey('jwk', key); delete j.ext; delete j.key_ops; delete j.alg;
  j.kid = await jwkThumbprint(j);
  return j;
}
T.push({
  id: 'jwk-pem-converter', cat: 'Crypto+', title: 'JWK to PEM Converter (and PEM to JWK)',
  desc: 'Convert JSON Web Keys (RSA, EC P-256/384/521, Ed25519) to PEM and PEM back to JWK. Handles a single JWK, a JWKS or PKCS#1 RSA PEM. Runs locally with WebCrypto.',
  inputs: 1, labels: ['A JWK, a JWKS ({"keys":[...]}) or one or more PEM blocks'], placeholder: ['{"kty":"EC","crv":"P-256","x":"...","y":"..."}'],
  sample: '{"kty":"EC","crv":"P-256","x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU","y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"}',
  run: async ([s]) => {
    s = s.trim();
    if (!s) throw new Error('Paste a JWK or a PEM key');
    if (s.startsWith('{') || s.startsWith('[')) {
      let j; try { j = JSON.parse(s); } catch { throw new Error('That looks like JSON but it does not parse'); }
      const keys = Array.isArray(j) ? j : j.keys ? j.keys : [j];
      if (keys.length > 50) throw new Error('At most 50 keys at once');
      const out = [];
      for (const [k, key] of keys.entries()) { const r = await jwkToPem(key).catch((e) => { throw new Error(`Key ${k + 1}: ${e.message}`); }); out.push(`# Key ${k + 1}: ${key.kty}${key.crv ? ' ' + key.crv : ''}, ${r.kind}${key.kid ? ', kid ' + key.kid : ''}\n${r.pems.join('\n\n')}`); }
      return out.join('\n\n') + '\n\nPKCS#8 ("PRIVATE KEY") and SPKI ("PUBLIC KEY") are the usual formats; the RSA-specific PKCS#1 forms are added for tools that need them.';
    }
    const blocks = [...s.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g)];
    if (!blocks.length) throw new Error('No JSON and no "-----BEGIN ...-----" PEM block found');
    const out = [];
    for (const [k, m] of blocks.entries()) {
      let der; try { der = fromB64(m[2]); } catch { throw new Error(`Block ${k + 1}: the Base64 body is not valid`); }
      const j = await pemToJwk(m[1], der).catch((e) => { throw new Error(`Block ${k + 1} (${m[1]}): ${e.message}`); });
      out.push(JSON.stringify(j, null, 2));
    }
    return out.join('\n\n') + '\n\nThe "kid" is the RFC 7638 SHA-256 thumbprint of the public part. Remove or rename it if your system uses its own key IDs. No "alg" or "use" is set because a PEM does not carry them.';
  },
});

// ---------- TOTP QR builder ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(u8) { let bits = '', out = ''; for (const b of u8) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; }
function b32dec(s) { let bits = ''; for (const c of s) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Uint8Array.from(out); }
async function totpAt(secretBytes, t, { digits = 6, period = 30, algo = 'SHA-1' } = {}) {
  const ctr = Math.floor(t / period), msg = new Uint8Array(8); new DataView(msg.buffer).setBigUint64(0, BigInt(ctr));
  const key = await subtle().importKey('raw', secretBytes, { name: 'HMAC', hash: algo }, false, ['sign']);
  const h = new Uint8Array(await subtle().sign('HMAC', key, msg)), off = h[h.length - 1] & 15;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}
T.push({
  id: 'totp-qr-builder', cat: 'Crypto+', title: 'TOTP QR Code Builder (otpauth URI)',
  desc: 'Build the otpauth:// URI and a scannable QR code for adding a 2FA account to an authenticator app. Make a random Base32 secret or use yours; shows the current code to check it.',
  inputs: 0, sample: '',
  opts: [txt('issuer', 'Issuer (service name)', 'Example Corp'), txt('account', 'Account (email or username)', 'alice@example.com'), txt('secret', 'Base32 secret (blank = generate a random one)', ''), sel('algo', 'Algorithm', ['SHA1', 'SHA256', 'SHA512']), sel('digits', 'Digits', ['6', '8']), num('period', 'Period in seconds', 30)],
  run: async (_, o) => {
    const issuer = o.issuer.trim(), account = o.account.trim();
    if (!account) throw new Error('Account is required');
    if (issuer.includes(':') || account.includes(':')) throw new Error('Issuer and account must not contain a colon');
    let secret = o.secret.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');
    const generated = !secret;
    if (generated) secret = b32enc(crypto.getRandomValues(new Uint8Array(20)));
    if (!/^[A-Z2-7]+$/.test(secret)) throw new Error('The secret must be Base32: letters A-Z and digits 2-7 only');
    if (secret.length < 16) throw new Error('The secret is too short (RFC 4226 asks for at least 128 bits, 26 Base32 characters; apps usually accept 16 or more)');
    const period = clamp(o.period, 1, 3600) | 0, digits = +o.digits;
    const label = (issuer ? encodeURIComponent(issuer) + ':' : '') + encodeURIComponent(account);
    const uri = `otpauth://totp/${label}?secret=${secret}${issuer ? '&issuer=' + encodeURIComponent(issuer) : ''}&algorithm=${o.algo}&digits=${digits}&period=${period}`;
    const m = _qr.qrMatrix(uri, 'M', -1);
    const code = await totpAt(b32dec(secret), Math.floor(Date.now() / 1000), { digits, period, algo: { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }[o.algo] });
    return { text: `${uri}\n\nSecret${generated ? ' (generated just now)' : ''}: ${secret.replace(/(.{4})/g, '$1 ').trim()}\nCode right now (to check your app matches): ${code}\n\nScan the QR code with an authenticator app, or type the secret in by hand. Many apps only support SHA1, 6 digits and 30 seconds; if the codes do not match, use those defaults. Anyone with this secret or QR code can generate your codes: do not share it, and delete the image after use.`, blob: [_qr.pngBlob(m.matrix, 8, 4)], filename: 'totp-qr.png' };
  },
});

// ---------- entropy calculator ----------
T.push({
  id: 'entropy-calculator', cat: 'Crypto+', title: 'Entropy Calculator (Shannon, Bits per Character)',
  desc: 'Measure the Shannon entropy of a string in bits per character and in total, and compare it with the entropy of a random string from the same character pool.',
  inputs: 1, labels: ['Text, password or key'], sample: 'correct horse battery staple',
  opts: [sel('unit', 'Symbols are', ['characters (code points)', 'bytes (UTF-8)', 'words'])],
  run: ([s], o) => {
    s = s.replace(/\r?\n$/, '');
    if (!s) throw new Error('Enter some text');
    const syms = o.unit.startsWith('bytes') ? Array.from(new TextEncoder().encode(s)) : o.unit.startsWith('words') ? s.split(/\s+/).filter(Boolean) : Array.from(s);
    if (syms.length > 1e6) throw new Error('Limited to one million symbols');
    const cnt = new Map(); for (const x of syms) cnt.set(x, (cnt.get(x) || 0) + 1);
    const n = syms.length; let H = 0; for (const c of cnt.values()) H -= (c / n) * Math.log2(c / n);
    const chars = Array.from(s);
    const pool = (/[a-z]/.test(s) ? 26 : 0) + (/[A-Z]/.test(s) ? 26 : 0) + (/[0-9]/.test(s) ? 10 : 0) + (/[ -\/:-@\[-`{-~]/.test(s) ? 33 : 0) + (/[^\x00-\x7f]/.test(s) ? 100 : 0);
    const f = (x) => x.toFixed(3);
    return `Symbols: ${n}   Distinct: ${cnt.size}\nShannon entropy: ${f(H)} bits per symbol\nTotal over this string: ${f(H * n)} bits  (entropy x length)\nMost it could be with ${cnt.size} distinct symbols: ${f(Math.log2(cnt.size))} bits per symbol\nEvenness: ${cnt.size > 1 ? (H / Math.log2(cnt.size) * 100).toFixed(1) + '%' : 'n/a'}\n\nIf the text were picked at random from its character classes:\nPool size: ${pool || 'n/a'} (lower 26, upper 26, digits 10, ASCII symbols and space 33, anything else counted as 100)\nPool entropy: ${pool ? f(Math.log2(pool) * chars.length) + ' bits (' + f(Math.log2(pool)) + ' per character x ' + chars.length + ')' : 'n/a'}\n\nRead this carefully: Shannon entropy only describes how evenly this one string uses its symbols. It is not the strength of a password. "password" and "p4ssw0rd!" can both look high, but an attacker guesses them from word lists. The pool figure holds only if every character was chosen at random, for example by a password generator.`;
  },
});

// ---------- snowflake decoder ----------
const SNOW = { 'Twitter / X (epoch 2010-11-04, 5+5+12 bits)': { epoch: 1288834974657n, a: 5, b: 5, seq: 12, la: 'datacenter id', lb: 'worker id' }, 'Discord (epoch 2015-01-01, 5+5+12 bits)': { epoch: 1420070400000n, a: 5, b: 5, seq: 12, la: 'internal worker id', lb: 'internal process id' } };
T.push({
  id: 'snowflake-id-decoder', cat: 'Generators', title: 'Snowflake ID Decoder (Twitter/X, Discord, Custom)',
  desc: 'Decode 64-bit Snowflake IDs into creation time, worker, datacenter or process and sequence. Presets for Twitter/X and Discord, or set your own epoch and bit widths.',
  inputs: 1, labels: ['Snowflake IDs, one per line (decimal)'], sample: '1541815603606036480\n1541815603606036481',
  opts: [sel('preset', 'Layout', [...Object.keys(SNOW), 'Custom']), txt('epoch', 'Custom epoch (Unix ms)', '1288834974657'), num('a', 'Custom: bits of field 1 (high)', 5), num('b', 'Custom: bits of field 2', 5), num('seq', 'Custom: sequence bits', 12)],
  run: ([s], o) => {
    const L = SNOW[o.preset] || (() => { if (!/^\d+$/.test(o.epoch.trim())) throw new Error('Custom epoch must be whole Unix milliseconds'); const a = clamp(o.a, 0, 30) | 0, b = clamp(o.b, 0, 30) | 0, q = clamp(o.seq, 0, 30) | 0; if (a + b + q > 63) throw new Error('The bit widths add up to more than 63'); return { epoch: BigInt(o.epoch.trim()), a, b, seq: q, la: 'field 1', lb: 'field 2' }; })();
    const ids = lines(s).map((l) => l.trim()).filter(Boolean).slice(0, 5000);
    if (!ids.length) throw new Error('Enter at least one ID');
    const sa = BigInt(L.seq), sb = BigInt(L.seq + L.b), st = BigInt(L.seq + L.b + L.a);
    return `Layout: timestamp (ms since epoch ${L.epoch}) | ${L.la} (${L.a} bits) | ${L.lb} (${L.b} bits) | sequence (${L.seq} bits)\n\n` + ids.map((id) => {
      if (!/^\d{1,20}$/.test(id)) return `${id}\n  not a decimal integer`;
      const v = BigInt(id); if (v >= 1n << 64n) return `${id}\n  larger than 64 bits`;
      const ms = (v >> st) + L.epoch, d = new Date(Number(ms));
      const t = isNaN(d) ? '(out of range)' : d.toISOString();
      return `${id}\n  time: ${t}  (Unix ms ${ms})\n  ${L.la}: ${(v >> sb) & ((1n << BigInt(L.a)) - 1n)}   ${L.lb}: ${(v >> sa) & ((1n << BigInt(L.b)) - 1n)}   sequence: ${v & ((1n << sa) - 1n)}`;
    }).join('\n') + '\n\nEpochs and bit layouts: Twitter snowflake source (twepoch 1288834974657, 5 + 5 + 12 bits) and the Discord API reference (epoch 1420070400000). Other systems (Instagram, Mastodon, Sonyflake, your own) use different layouts: choose Custom. Check against a known ID before relying on the result.';
  },
});

// ---------- KSUID ----------
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', KS_EPOCH = 1400000000;
function ksuidEncode(u8) { let v = 0n; for (const b of u8) v = (v << 8n) | BigInt(b); let s = ''; for (let i = 0; i < 27; i++) { s = B62[Number(v % 62n)] + s; v /= 62n; } return s; }
function ksuidDecode(s) { if (!/^[0-9A-Za-z]{27}$/.test(s)) throw new Error('A KSUID is exactly 27 letters and digits'); let v = 0n; for (const c of s) v = v * 62n + BigInt(B62.indexOf(c)); if (v >= 1n << 160n) throw new Error('Value is larger than 160 bits'); const u8 = new Uint8Array(20); for (let i = 19; i >= 0; i--) { u8[i] = Number(v & 255n); v >>= 8n; } return u8; }
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
T.push({
  id: 'ksuid-tool', cat: 'Generators', title: 'KSUID Generator and Decoder',
  desc: 'Create K-sortable unique IDs (Segment KSUID: 27 characters, 4-byte timestamp plus 16 random bytes) or paste KSUIDs to read their creation time and payload.',
  inputs: 1, labels: ['KSUIDs to decode, one per line (leave empty to generate new ones)'], sample: '0ujtsYcgvSTl8PAuAdqWYSMnLOv',
  opts: [num('count', 'How many to generate (when the box is empty)', 5), txt('time', 'Generate for this time (ISO, blank = now)', '')],
  run: ([s], o) => {
    const ls = lines(s).map((l) => l.trim()).filter(Boolean);
    if (ls.length) return ls.slice(0, 2000).map((id) => { let u; try { u = ksuidDecode(id); } catch (e) { return `${id}\n  ${e.message}`; } const ts = new DataView(u.buffer).getUint32(0); const d = new Date((ts + KS_EPOCH) * 1000); return `${id}\n  time: ${d.toISOString()}  (Unix ${ts + KS_EPOCH}, KSUID timestamp ${ts})\n  payload: ${hex(u.subarray(4))}\n  raw: ${hex(u)}`; }).join('\n');
    let t = Math.floor(Date.now() / 1000);
    if (o.time.trim()) { const d = new Date(o.time.trim()); if (isNaN(d)) throw new Error('Could not read the time'); t = Math.floor(d / 1000); }
    if (t < KS_EPOCH || t - KS_EPOCH >= 2 ** 32) throw new Error('KSUID time must be between 2014-05-13 and 2150');
    const out = [];
    for (let i = 0; i < clamp(o.count, 1, 1000); i++) { const u = new Uint8Array(20); new DataView(u.buffer).setUint32(0, t - KS_EPOCH); crypto.getRandomValues(u.subarray(4)); out.push(ksuidEncode(u)); }
    return out.join('\n') + '\n\nLayout: 32-bit big-endian seconds since 2014-05-13 16:53:20 UTC (Unix 1400000000), then 128 random bits, written as 27 base62 characters (0-9, A-Z, a-z). IDs from the same second sort by their random part.';
  },
});

// ---------- random IP ----------
const V4_SPECIAL = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4'];
function ipToBig(s) { const v4 = parseV4(s); if (v4) return { v: BigInt(v4[0] * 16777216 + v4[1] * 65536 + v4[2] * 256 + v4[3]), bits: 32 }; const v6 = parseV6(s); if (v6) return { v: v6.reduce((a, x) => (a << 16n) | BigInt(x), 0n), bits: 128 }; throw new Error('Not an IP address: ' + s); }
function cidr(s) { const [a, p] = s.trim().split('/'); const { v, bits } = ipToBig(a); const len = p === undefined ? bits : +p; if (!Number.isInteger(len) || len < 0 || len > bits) throw new Error('Bad prefix length in ' + s); const host = BigInt(bits - len), base = (v >> host) << host; return { base, size: 1n << host, bits }; }
const bigToIp = (v, bits, compress) => { if (bits === 32) return [24n, 16n, 8n, 0n].map((s) => (v >> s) & 255n).join('.'); const w = Array.from({ length: 8 }, (_, i) => Number((v >> BigInt(112 - 16 * i)) & 0xffffn)); return compress ? compressV6(w) : w.map((x) => x.toString(16).padStart(4, '0')).join(':'); };
T.push({
  id: 'random-ip-generator', cat: 'Generators', title: 'Random IP Address Generator',
  desc: 'Generate random IPv4 or IPv6 addresses: anywhere, public only, private only, documentation ranges (safe for examples) or inside a CIDR block you choose.',
  inputs: 0, sample: '',
  opts: [sel('ver', 'Version', ['IPv4', 'IPv6']), sel('scope', 'Range', ['public (not special-purpose)', 'private', 'documentation (RFC 5737 / RFC 3849)', 'any', 'inside my CIDR block']), txt('cidr', 'CIDR block (for "inside my CIDR block")', '192.168.1.0/24'), num('count', 'How many (1-10000)', 10), chk('uniq', 'No duplicates', true), chk('short', 'Compress IPv6', true)],
  run: (_, o) => {
    const v6 = o.ver === 'IPv6', bits = v6 ? 128 : 32, count = clamp(o.count, 1, 10000) | 0;
    let ranges, avoid = [];
    const R = (...a) => a.map(cidr);
    if (o.scope.startsWith('inside')) { const c = cidr(o.cidr); if (c.bits !== bits) throw new Error(`The CIDR block is ${c.bits === 32 ? 'IPv4' : 'IPv6'}, but ${o.ver} was chosen`); ranges = [c]; }
    else if (o.scope.startsWith('private')) ranges = v6 ? R('fc00::/7') : R('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16');
    else if (o.scope.startsWith('doc')) ranges = v6 ? R('2001:db8::/32') : R('192.0.2.0/24', '198.51.100.0/24', '203.0.113.0/24');
    else if (o.scope.startsWith('public')) { ranges = v6 ? R('2000::/3') : R('0.0.0.0/0'); avoid = v6 ? R('2001:db8::/32', '2001::/23', '2002::/16') : R(...V4_SPECIAL); }
    else ranges = R(v6 ? '::/0' : '0.0.0.0/0');
    const total = ranges.reduce((a, r) => a + r.size, 0n);
    if (o.uniq && total - avoid.reduce((a, r) => a + r.size, 0n) < BigInt(count) && !v6) throw new Error('That range has fewer addresses than you asked for');
    if (o.uniq && ranges.length === 1 && ranges[0].size < BigInt(count)) throw new Error('That range has fewer addresses than you asked for');
    const out = [], seen = new Set();
    for (let tries = 0; out.length < count && tries < count * 50 + 1000; tries++) {
      let k = randBig(total), r = ranges[0]; for (const x of ranges) { if (k < x.size) { r = x; break; } k -= x.size; }
      const v = r.base + k;
      if (avoid.some((a) => v >= a.base && v < a.base + a.size)) continue;
      if (o.uniq && seen.has(v)) continue; seen.add(v); out.push(bigToIp(v, bits, o.short));
    }
    return out.join('\n') + '\n\n"Public" for IPv4 skips the blocks of the IANA IPv4 Special-Purpose Address Registry (checked on 2026-10-23) plus multicast 224.0.0.0/4; the few blocks it marks globally reachable (AS112, AMT) are not skipped. For IPv6, "public" means 2000::/3 minus 2001::/23, 2001:db8::/32 and 2002::/16. Random public addresses may belong to real hosts: do not scan or connect to them. Use documentation ranges for examples.';
  },
});

// ---------- random date ----------
T.push({
  id: 'random-date-generator', cat: 'Generators', title: 'Random Date Generator',
  desc: 'Generate random dates and times between two dates in many formats (ISO, Unix, RFC 2822, DD/MM/YYYY). Sort them, skip weekends, and avoid duplicates. Times are UTC.',
  inputs: 0, sample: '',
  opts: [txt('start', 'Start (YYYY-MM-DD or ISO date-time, UTC)', '2024-01-01'), txt('end', 'End (inclusive)', '2024-12-31'), num('count', 'How many (1-10000)', 10), sel('fmt', 'Format', ['YYYY-MM-DD', 'ISO 8601 date-time (UTC)', 'YYYY-MM-DD HH:MM:SS', 'DD/MM/YYYY', 'MM/DD/YYYY', 'Unix seconds', 'Unix milliseconds', 'RFC 2822 (UTC)']), chk('week', 'Weekdays only (Monday to Friday)', false), chk('sort', 'Sort ascending', true), chk('uniq', 'No duplicates', true)],
  run: (_, o) => {
    const parse = (s, endOfDay) => { s = s.trim(); if (!s) throw new Error('Enter a start and an end'); const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s); const d = new Date(dateOnly ? s + 'T00:00:00Z' : /(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : s.replace(' ', 'T') + 'Z'); if (isNaN(d)) throw new Error('Could not read the date "' + s + '"'); return dateOnly && endOfDay ? d.getTime() + 86399999 : d.getTime(); };
    const dateOnlyFmt = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'].includes(o.fmt);
    let a = parse(o.start, false), b = parse(o.end, true);
    if (b < a) throw new Error('The end is before the start');
    const day = 86400000;
    if (dateOnlyFmt) { a = Math.floor(a / day) * day; b = Math.floor(b / day) * day; }
    const span = BigInt(dateOnlyFmt ? (b - a) / day + 1 : b - a + 1), count = clamp(o.count, 1, 10000) | 0;
    const p2 = (n) => String(n).padStart(2, '0'), DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fmt = (t) => { const d = new Date(t), Y = d.getUTCFullYear(), M = p2(d.getUTCMonth() + 1), D = p2(d.getUTCDate()), hms = `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`; switch (o.fmt) { case 'YYYY-MM-DD': return `${Y}-${M}-${D}`; case 'DD/MM/YYYY': return `${D}/${M}/${Y}`; case 'MM/DD/YYYY': return `${M}/${D}/${Y}`; case 'YYYY-MM-DD HH:MM:SS': return `${Y}-${M}-${D} ${hms}`; case 'Unix seconds': return String(Math.floor(t / 1000)); case 'Unix milliseconds': return String(t); case 'RFC 2822 (UTC)': return `${DN[d.getUTCDay()]}, ${D} ${MN[d.getUTCMonth()]} ${Y} ${hms} +0000`; default: return d.toISOString(); } };
    const out = [], seen = new Set();
    for (let tries = 0; out.length < count && tries < count * 100 + 1000; tries++) {
      const t = dateOnlyFmt ? a + Number(randBig(span)) * day : a + Number(randBig(span));
      const wd = new Date(t).getUTCDay();
      if (o.week && (wd === 0 || wd === 6)) continue;
      if (o.uniq && seen.has(t)) continue; seen.add(t); out.push(t);
    }
    if (out.length < count) throw new Error(`Only ${out.length} values fit these settings`);
    if (o.sort) out.sort((x, y) => x - y);
    return out.map(fmt).join('\n');
  },
});

// ---------- test email generator ----------
T.push({
  id: 'test-email-generator', cat: 'Generators', title: 'Test Email Address Generator',
  desc: 'Make many test addresses from one real inbox with plus tags (name+tag@domain) or Gmail dot variants, or use reserved example domains that can never receive mail.',
  inputs: 1, labels: ['Base address (or, for reserved-domain mode, a name prefix)'], sample: 'dev@example.com',
  opts: [sel('style', 'Style', ['plus tag: numbered (name+1)', 'plus tag: random (name+k3x9qa)', 'plus tag: from my words', 'Gmail dot variants (n.ame, na.me)', 'reserved domains (name1@example.com, .test, .invalid)']), txt('words', 'Your tag words, comma separated', 'signup, newsletter, trial, billing'), num('count', 'How many (1-1000)', 10)],
  run: ([s], o) => {
    s = s.trim().split(/\s+/)[0] || '';
    const count = clamp(o.count, 1, 1000) | 0;
    if (!o.style.startsWith('reserved')) {
      const m = /^([^@\s+]+)(\+[^@\s]*)?@([^@\s]+\.[^@\s]+)$/.exec(s);
      if (!m) throw new Error('Enter an address like name@example.com');
      var [, name, , domain] = m;
    }
    const out = [];
    if (o.style.startsWith('plus tag: numbered')) for (let i = 1; i <= count; i++) out.push(`${name}+${i}@${domain}`);
    else if (o.style.startsWith('plus tag: random')) { const al = 'abcdefghijklmnopqrstuvwxyz0123456789'; const seen = new Set(); while (out.length < count) { let t = ''; for (let i = 0; i < 6; i++) t += al[randInt(36)]; if (!seen.has(t)) { seen.add(t); out.push(`${name}+${t}@${domain}`); } } }
    else if (o.style.startsWith('plus tag: from')) { const ws = o.words.split(',').map((w) => w.trim().replace(/[^\w.-]/g, '')).filter(Boolean); if (!ws.length) throw new Error('Enter at least one tag word'); for (let i = 0; i < Math.min(count, ws.length); i++) out.push(`${name}+${ws[i]}@${domain}`); }
    else if (o.style.startsWith('Gmail')) {
      const base = name.replace(/\./g, ''), slots = base.length - 1;
      if (slots < 1) throw new Error('The name needs at least 2 characters');
      const total = slots > 20 ? Infinity : 2 ** slots, seen = new Set();
      for (let mask = 0; out.length < count && mask < Math.min(total, 1e6); mask++) { const m = slots > 20 ? randInt(2 ** 20) : mask; if (seen.has(m)) continue; seen.add(m); let r = base[0]; for (let i = 0; i < slots; i++) r += (m & (1 << i) ? '.' : '') + base[i + 1]; out.push(`${r}@${domain}`); }
      if (!/^(gmail|googlemail)\.com$/i.test(domain)) out.unshift('# Note: dots are ignored only by Gmail (gmail.com, googlemail.com). Other providers treat each as a different address.');
    } else { const pre = (s.split('@')[0] || 'user').replace(/[^\w.-]/g, '') || 'user', doms = ['example.com', 'example.org', 'example.net', 'mail.test', 'mail.example', 'mail.invalid']; for (let i = 0; i < count; i++) out.push(`${pre}${i + 1}@${doms[i % 6]}`); }
    return out.join('\n') + '\n\nPlus tags: mail to name+tag@domain normally lands in name@domain on Gmail, Outlook.com, iCloud and Fastmail, but many company mail systems and small hosts do not support it, and some web forms reject "+". The domains example.com, example.org and example.net are reserved by RFC 2606, and the TLDs .test, .example and .invalid are reserved too, so those addresses can never reach a real person.';
  },
});

// ---------- dummy file ----------
const UNITS = { bytes: 1, 'KB (1000)': 1e3, 'KiB (1024)': 1024, 'MB (1000^2)': 1e6, 'MiB (1024^2)': 1048576, 'GB (1000^3)': 1e9, 'GiB (1024^3)': 1073741824 };
T.push({
  id: 'dummy-file-generator', cat: 'Generators', title: 'Dummy File Generator (Exact Size)',
  desc: 'Create a file of an exact size in bytes for upload and limit testing: zero bytes, random bytes or repeating text. Up to 256 MiB, built in memory and downloaded.',
  inputs: 0, sample: '',
  opts: [num('size', 'Size', 1), sel('unit', 'Unit', Object.keys(UNITS), 'MiB (1024^2)'), sel('fill', 'Content', ['zero bytes', 'random bytes', 'repeating text']), txt('name', 'File name', 'dummy.bin')],
  run: (_, o) => {
    const bytes = Math.round(+o.size * UNITS[o.unit]);
    if (!Number.isFinite(bytes) || bytes < 0) throw new Error('Enter a size of 0 or more');
    if (bytes > 268435456) throw new Error('The limit is 256 MiB (268435456 bytes); bigger files would use too much memory in a tab');
    const name = (o.name.trim() || 'dummy.bin').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
    const CH = 1048576, parts = [];
    if (o.fill.startsWith('zero')) { const z = new Uint8Array(Math.min(CH, bytes)); for (let n = bytes; n > 0; n -= z.length) parts.push(n >= z.length ? z : z.subarray(0, n)); }
    else if (o.fill.startsWith('repeating')) { const line = new TextEncoder().encode('The quick brown fox jumps over the lazy dog. 0123456789\n'), buf = new Uint8Array(Math.min(CH, bytes)); for (let i = 0; i < buf.length; i++) buf[i] = line[i % line.length]; for (let n = bytes; n > 0; n -= buf.length) parts.push(n >= buf.length ? buf : buf.subarray(0, n)); }
    else for (let n = bytes; n > 0; n -= CH) { const b = new Uint8Array(Math.min(CH, n)); for (let i = 0; i < b.length; i += 65536) crypto.getRandomValues(b.subarray(i, Math.min(i + 65536, b.length))); parts.push(b); }
    return { text: `${name}: ${bytes} bytes (${(bytes / 1048576).toFixed(3)} MiB), ${o.fill}.\nUse the download button below.${o.fill.startsWith('zero') || o.fill.startsWith('repeating') ? ' Zero and repeating content compresses to almost nothing; use random bytes to test uploads through compression.' : ''}`, blob: [new Blob(parts, { type: 'application/octet-stream' })], filename: name };
  },
});

// ---------- random number generator ----------
T.push({
  id: 'random-number-generator', cat: 'Generators', title: 'Random Number Generator (Integers and Decimals)',
  desc: 'Cryptographically random integers or decimals in any range with no modulo bias. Choose decimal places, unique values, sorting and a separator; shows count, sum and mean.',
  inputs: 0, sample: '',
  opts: [txt('min', 'Minimum', '1'), txt('max', 'Maximum (inclusive for integers)', '100'), sel('type', 'Type', ['integers', 'decimals']), num('dp', 'Decimal places (decimals only)', 2), num('count', 'How many (1-10000)', 10), chk('uniq', 'No duplicates', false), chk('sort', 'Sort ascending', false), sel('sep', 'Separator', ['new line', 'comma', 'space', 'tab'])],
  run: (_, o) => {
    const count = clamp(o.count, 1, 10000) | 0, sep = { 'new line': '\n', comma: ', ', space: ' ', tab: '\t' }[o.sep];
    let out = [];
    if (o.type === 'integers') {
      if (!/^-?\d+$/.test(o.min.trim()) || !/^-?\d+$/.test(o.max.trim())) throw new Error('Minimum and maximum must be whole numbers');
      const a = BigInt(o.min.trim()), b = BigInt(o.max.trim());
      if (b < a) throw new Error('Maximum is below minimum');
      if (o.uniq && b - a + 1n < BigInt(count)) throw new Error(`Only ${b - a + 1n} different integers fit in that range`);
      const seen = new Set();
      while (out.length < count) { const v = a + randBig(b - a + 1n); if (o.uniq) { if (seen.has(v)) continue; seen.add(v); } out.push(v); }
      if (o.sort) out.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
      const sum = out.reduce((x, y) => x + y, 0n);
      return out.join(sep) + `\n\nCount ${out.length}, sum ${sum}, mean ${(Number(sum) / out.length).toFixed(4)}, min ${out.reduce((x, y) => (y < x ? y : x))}, max ${out.reduce((x, y) => (y > x ? y : x))}`;
    }
    const a = Number(o.min), b = Number(o.max), dp = clamp(o.dp, 0, 15) | 0;
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Minimum and maximum must be numbers');
    if (b < a) throw new Error('Maximum is below minimum');
    const seen = new Set();
    for (let tries = 0; out.length < count && tries < count * 100 + 1000; tries++) {
      const u = Number(randBig(1n << 53n)) / 2 ** 53, v = Number((a + u * (b - a)).toFixed(dp));
      if (v < a || v > b) continue;
      if (o.uniq) { if (seen.has(v)) continue; seen.add(v); } out.push(v);
    }
    if (out.length < count) throw new Error('That range and precision cannot give enough different values');
    if (o.sort) out.sort((x, y) => x - y);
    const sum = out.reduce((x, y) => x + y, 0);
    return out.map((v) => v.toFixed(dp)).join(sep) + `\n\nCount ${out.length}, sum ${sum.toFixed(dp)}, mean ${(sum / out.length).toFixed(Math.min(dp + 2, 15))}`;
  },
});

// ---------- ULID decoder ----------
const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function ulidDecode(id) {
  const s = id.toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0');
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(s)) throw new Error('A ULID is 26 characters from the Crockford Base32 alphabet (no I, L, O, U)');
  if (s[0] > '7') throw new Error('Too large: the first character must be 0 to 7 (the time field is 48 bits)');
  let v = 0n; for (const c of s) v = (v << 5n) | BigInt(CROCK.indexOf(c));
  return { ms: Number(v >> 80n), rand: (v & ((1n << 80n) - 1n)).toString(16).padStart(20, '0').toUpperCase() };
}
T.push({
  id: 'ulid-decoder', cat: 'Generators', title: 'ULID Decoder (Timestamp and Random Part)',
  desc: 'Read the creation time and the 80-bit random part out of ULIDs. Paste one or more 26-character ULIDs. Case-insensitive, accepts the Crockford look-alike letters.',
  inputs: 1, labels: ['ULIDs, one per line'], sample: '01ARZ3NDEKTSV4RRFFQ69G5FAV\n01H8XGJWBWBAQ4Z1K7YFWN3PZ9',
  run: ([s]) => {
    const ls = lines(s).map((l) => l.trim()).filter(Boolean).slice(0, 5000);
    if (!ls.length) throw new Error('Enter at least one ULID');
    return ls.map((id) => { try { const r = ulidDecode(id); return `${id}\n  time: ${new Date(r.ms).toISOString()}  (Unix ms ${r.ms})\n  random: ${r.rand}`; } catch (e) { return `${id}\n  ${e.message}`; } }).join('\n') + '\n\nA ULID is a 48-bit Unix millisecond timestamp followed by 80 random bits, written as 26 Crockford Base32 characters (spec: github.com/ulid/spec). Two ULIDs made in the same millisecond can sort in any order unless the generator is monotonic.';
  },
});
export { ulidDecode, parseRegex, analyseRegex, totpAt, b32dec, ksuidEncode, ksuidDecode, globToRegex, expandBraces, lev, jaro, jaroWinkler, fuzzySubseq };
export default T;
